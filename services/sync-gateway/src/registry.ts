// kernel.device_registry seams — T-01-09 (01 §5 cloud table; 01 §7 layer-1
// provisioning; 01-F25 registered/class-typed/revocable; 01-F39 DEVICE_CLASSES
// vocabulary from @restos/domain, never redeclared). registerDevice/revokeDevice
// write REGISTRY ROWS only — `device.registered/revoked` event emission belongs
// to the doc 14/15 emitters (T-01-09 ratified ruling). Registry rows are
// provisioning bookkeeping, not event history: revocation sets revoked_at and
// deletes nothing (01-F1 reaches the ledger only). Re-registration mints a
// fresh device_id (ruled: 01-N5 cold-start path — wiped devices never collide
// with their old slots), so a duplicate (org_id, device_id) insert is a
// provisioning error and surfaces as the PK violation.
import { DEVICE_CLASSES, type DeviceClass } from "@restos/domain";
import { sql } from "drizzle-orm";
import { DEVICE_TOKEN_TTL_MS } from "./auth.js";
import type { GatewayDb } from "./gateway.js";

export type DeviceRegistration = {
  org_id: string;
  branch_id: string;
  device_id: string;
  device_class: string;
  /** Optional issuance expiry (01-F47); defaults to the standard lifetime when absent. */
  token_expires_at?: number;
};

/** One registry row as the auth checks read it; undefined = never registered. */
export type DeviceRegistryRow = {
  branch_id: string;
  device_class: string;
  revoked_at: number | null;
  /**
   * The cloud's record of this device's last-issued token expiry (T-01-18, 01-F47);
   * null when never recorded. This — not the credential — is how a hub-RELAYED
   * origin's remaining life is judged, because that device's token never reaches
   * the cloud (18 §5: the registry, never the token, decides).
   */
  token_expires_at: number | null;
};

/** The read surface shared by db and tx (both satisfy `execute`). */
type SqlExecutor = Pick<GatewayDb, "execute">;

const isDeviceClass = (value: string): value is DeviceClass =>
  (DEVICE_CLASSES as readonly string[]).includes(value);

/**
 * Layer-1 provisioning seam (01 §7). Unknown class throws, nothing written (01-F39).
 *
 * @unreached-owed `01-F47` device admission has no operator surface — `apps/platform-admin` is a
 * one-file stub — so a device is provisioned only by a test or by hand-written SQL. This is why
 * `apps/pos-electron` ships a "marked DEV SEED" identity: nothing can register it for real.
 */
export const registerDevice = async (
  db: GatewayDb,
  registration: DeviceRegistration,
): Promise<void> => {
  if (!isDeviceClass(registration.device_class)) {
    throw new Error(
      `registerDevice: "${registration.device_class}" is not a DEVICE_CLASSES member (01-F39)`,
    );
  }
  await db.execute(
    // token_expires_at is SEEDED here (01-F47, review B1). Leaving it null made the
    // hub-relayed renewal path unreachable: `mintRenewal` treats a null recorded expiry
    // as "not due", so a freshly-provisioned WAN-less origin would never be renewed at
    // all — the one clause that makes a 90-day TTL safe in a LAN-only deployment.
    // The caller MUST supply `token_expires_at` when it knows the issuance instant, and
    // in practice always does. The Postgres-clock fallback exists only for provisioning
    // paths that mint no token — and it is a genuine hazard, so it is named here rather
    // than left as a footgun: this column is SEEDED from the database clock but judged
    // against the gateway's INJECTED clock (18 §4). Under any rig where those differ —
    // DR replay, the rewound-clock pin, every deterministic test — a seeded device can
    // read as permanently not-due and never renew. Pass the value.
    sql`insert into kernel.device_registry
          (org_id, branch_id, device_id, device_class, revoked_at, token_expires_at)
        values (${registration.org_id}, ${registration.branch_id}, ${registration.device_id},
          ${registration.device_class}, null,
          coalesce(${registration.token_expires_at ?? null}::bigint,
                   (extract(epoch from now()) * 1000)::bigint + ${DEVICE_TOKEN_TTL_MS}))`,
  );
};

/**
 * Revocation sets revoked_at (epoch ms) and deletes nothing; the row stays
 * intact as the flag 01-F25/01-F42 enforcement reads. Time source (implementer-
 * proposed, unpinned): the DATABASE clock — registry bookkeeping is not domain
 * logic, and using Postgres `now()` keeps `Date.now()` out of gateway src
 * (18 §4 spirit). Only the FIRST revocation stamps; a re-revoke is a no-op.
 *
 * @unreached-owed With `registerDevice` — no platform-admin surface exists. Worth stating plainly:
 * a stolen till cannot be revoked by any shipped path today. The ENFORCEMENT of `revoked_at` is
 * live in the gateway; only the act of setting it has no caller.
 */
export const revokeDevice = async (
  db: GatewayDb,
  target: { org_id: string; device_id: string },
): Promise<void> => {
  await db.execute(
    sql`update kernel.device_registry
        set revoked_at = (extract(epoch from now()) * 1000)::bigint
        where org_id = ${target.org_id} and device_id = ${target.device_id}
          and revoked_at is null`,
  );
};

/** The auth-check read: one (org, device) row, or undefined when never registered. */
export const readRegistryRow = async (
  executor: SqlExecutor,
  orgId: string,
  deviceId: string,
): Promise<DeviceRegistryRow | undefined> => {
  const rows = await executor.execute(
    sql`select branch_id, device_class, revoked_at, token_expires_at from kernel.device_registry
        where org_id = ${orgId} and device_id = ${deviceId}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return {
    branch_id: String(row.branch_id),
    device_class: String(row.device_class),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
    token_expires_at: row.token_expires_at === null ? null : Number(row.token_expires_at),
  };
};

/**
 * Record a device's newly-issued token expiry (T-01-18). The SINGLE writer of
 * `token_expires_at`, called at mint and at renewal — keeping it to one path is what
 * bounds the drift risk this column trades for not moving credentials through the hub.
 */
export const recordTokenExpiry = async (
  executor: SqlExecutor,
  orgId: string,
  deviceId: string,
  expiresAt: number,
): Promise<void> => {
  await executor.execute(
    sql`update kernel.device_registry set token_expires_at = ${expiresAt}
        where org_id = ${orgId} and device_id = ${deviceId}`,
  );
};
