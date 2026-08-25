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
  /**
   * `01-F70` — the device's HUMAN NAME ("Counter till", "Kitchen screen"), on the registry row
   * because `14-F12`'s device list and `15-F11`'s fleet dashboard are lists of devices nobody is
   * holding. A LABEL and never an identifier: `device_id` stays the sole key for admission,
   * fan-out, watermarks and `01-F64`'s store binding, and two devices may share a name.
   *
   * ⚠ **OPTIONAL HERE AND REQUIRED AT THE COMMAND, and the split is deliberate rather than a
   * softening of the FR.** `01-F70` puts the refusal *at registration*, and the product's only
   * registration path is `provision-device`, which requires `--name` and refuses without it. This
   * seam's other callers are test fixtures registering rows for auth and fan-out assertions that
   * predate the column; making it required here would have changed dozens of fixtures to satisfy a
   * rule none of them is about, and the FR's refusal would still have lived at the command. The
   * column is nullable (`0010`) for the same reason — rows provisioned before the migration have no
   * name, and inventing one would invent a fact about a physical device nobody looked at.
   */
  display_name?: string;
  /** Optional issuance expiry (01-F47); defaults to the standard lifetime when absent. */
  token_expires_at?: number;
  /**
   * `01-F73` (b) — the LAN certificate this device was issued, **as issued**.
   *
   * ⚠ **OPTIONAL HERE AND SUPPLIED ONLY BY `01-F80`'s CLAIM, and the split is the same one
   * `display_name` already makes.** A device admitted by `provision-device` receives an `01-F47`
   * token and no LAN credential at all — that command mints none and never has — so absent is a
   * TRUE statement about those rows rather than a missing value. `01-F80` (f)'s "one act, two
   * credentials" is what fills them, and it fills both together: a certificate stored without its
   * fingerprint leaves `01-F81` (a)'s roster row unbuildable, and a fingerprint without the
   * certificate makes `01-F80` (d)'s "the same certificate" on a retry impossible.
   */
  certificate_pem?: string;
  /** `01-F81` (a) — lowercase hex SHA-256 of the certificate's DER. Supplied with the PEM or not
   * at all. */
  certificate_fingerprint?: string;
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
 * **IT HAS A SHIPPING CALLER AS OF AUGUST 2026 — `provision-device.ts`, the declared
 * `pnpm -C services/sync-gateway provision-device` command.** The debt marker that stood here said
 * "a device is provisioned only by a test or by hand-written SQL", and that was exactly true:
 * `plans/wave-1/running-the-stack.md` §6b was a `tsx -e` one-liner plus a psql `INSERT` into this
 * table. It is deleted now, because a marker on something reached fails `seams:check`. What is
 * still owed is the `01-F25` *pairing code* — registration is specified as "a one-time pairing via
 * back office code", and this is an operator command on the service host, which is a smaller thing
 * that happens to remove the SQL.
 *
 * (The marker token is deliberately not spelled out above. `check-seams.mjs` matches the literal
 * anywhere in the declaration's comment, so quoting it here re-declares the exception it describes
 * and fails the rail as STALE — measured on this change, and `migrate.ts` records the file-header
 * form of the same trap.)
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
          (org_id, branch_id, device_id, device_class, display_name, revoked_at, token_expires_at,
           certificate_pem, certificate_fingerprint)
        values (${registration.org_id}, ${registration.branch_id}, ${registration.device_id},
          ${registration.device_class}, ${registration.display_name ?? null}, null,
          coalesce(${registration.token_expires_at ?? null}::bigint,
                   (extract(epoch from now()) * 1000)::bigint + ${DEVICE_TOKEN_TTL_MS}),
          ${registration.certificate_pem ?? null}, ${registration.certificate_fingerprint ?? null})`,
  );
};

/**
 * Revocation sets revoked_at (epoch ms) and deletes nothing; the row stays
 * intact as the flag 01-F25/01-F42 enforcement reads. Time source (implementer-
 * proposed, unpinned): the DATABASE clock — registry bookkeeping is not domain
 * logic, and using Postgres `now()` keeps `Date.now()` out of gateway src
 * (18 §4 spirit). Only the FIRST revocation stamps; a re-revoke is a no-op.
 *
 * **IT HAS A SHIPPING CALLER AS OF AUGUST 2026 — `revoke-device.ts`, the declared
 * `pnpm -C services/sync-gateway revoke-device` command.** The debt note that stood here said no
 * operator surface set `revoked_at`, which made this the LONELY half of the pair: `registerDevice`
 * gained `provision-device.ts` hours earlier and this had nothing, so a stolen till could be
 * admitted by a declared command and taken away only with hand-written SQL. The note is deleted
 * because a marker on something reached fails `seams:check` — and, as above, the literal token is
 * deliberately not written out, since the rail matches it anywhere in this declaration's comment and
 * would re-declare the very exception this paragraph announces the deletion of.
 *
 * What is still owed here is `14-F13` — revocation from the back-office **device list**, emitting
 * `device.revoked` with an **actor**. The command is an operator command on the service host and has
 * no authenticated user, so it deliberately writes no event: the T-01-09 ratified ruling above puts
 * that emission on the doc 14/15 emitters, and a `null` actor in an append-only store is a worse
 * record than none. The ENFORCEMENT of `revoked_at` was already live (`01-F48`'s ≤30 s sweep); the
 * act of setting it is what had no caller. `provision-device` refuses to re-credential a revoked
 * row precisely so the two halves cannot fight, and nothing anywhere un-revokes.
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

/**
 * `14-F12`'s **device list**, one org at a time — the read the back office's device screen is.
 *
 * ⚠ **IT PROJECTS WHAT THIS TABLE HAS AND NOT WHAT `14-F12` ASKS FOR, and the gap is named rather
 * than filled.** The FR wants "class, app version, last-seen, sync lag"; `kernel.device_registry`
 * holds class and nothing else on that list. **App version and last-seen are not stored anywhere in
 * this service** — no heartbeat table exists, doc 15's device pipeline is unbuilt — and sync lag is
 * derived from a cursor this row does not carry. Inventing a plausible value (a `last_seen` stamped
 * at hello, say) would be a second interpretation of a fact the corpus assigns to another module,
 * and `00 §5.7` forbids a screen showing an aged number as a fresh one. So the three absent columns
 * are absent here, the screen says so, and closing them is doc 15's pipeline landing — not a column
 * added on a guess.
 *
 * `token_expires_at` IS carried, because it is real and it is the one liveness fact this table
 * honestly has (`01-F47`).
 *
 * **`display_name` is carried too, and it is `01-F70`'s whole point** — the FR's own measured
 * complaint is that this list "can name a till only by its UUID, and the operator reading either is
 * by construction not standing in front of it". It is **nullable on the way out** because `0010`
 * added the column nullable and deliberately did not backfill: a row provisioned before that
 * migration has no name, and inventing one would invent a fact about a physical device nobody looked
 * at. `21-F15` decides what a screen does with the null — a stated *unnamed* treatment, never a
 * blank and never the identifier wearing the name's slot. **`01-F70`'s "required at REGISTRATION" is
 * CLOSED as of August 2026** — `provision-device` requires `--name` and refuses without it (`15-F27`)
 * — so a null here means a row provisioned *before* that landed, and never a device admitted since.
 *
 * Ordered by `(branch_id, device_id)` so the list is stable between visits: without it the planner
 * decides the order and a `14-F12` list re-shuffles under an owner between two reads of the same
 * unchanged fleet.
 */
export const listDevices = async (
  executor: SqlExecutor,
  orgId: string,
): Promise<readonly (DeviceRegistryRow & { device_id: string; display_name: string | null })[]> => {
  const rows = await executor.execute(
    sql`select device_id, branch_id, device_class, display_name, revoked_at, token_expires_at
        from kernel.device_registry
        where org_id = ${orgId}
        order by branch_id asc, device_id asc`,
  );
  return [...rows].map((row) => ({
    device_id: String(row.device_id),
    branch_id: String(row.branch_id),
    device_class: String(row.device_class),
    // `01-F70`. Null is UNNAMED and is carried as null — see this function's header.
    display_name: row.display_name === null ? null : String(row.display_name),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
    token_expires_at: row.token_expires_at === null ? null : Number(row.token_expires_at),
  }));
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
 * `01-F70`'s name as stored: `undefined` = no such row, `null` = the row exists and is UNNAMED.
 *
 * A separate read rather than a field on `DeviceRegistryRow`, because that type is what the
 * ADMISSION checks consume (`18 §5`: the registry decides) and a label is not an admission fact —
 * `01-F70` is explicit that nothing may key on the name. Widening the auth row would put a value
 * that must never be read in front of every reader that must not read it.
 */
export const readDeviceName = async (
  executor: SqlExecutor,
  orgId: string,
  deviceId: string,
): Promise<string | null | undefined> => {
  const rows = await executor.execute(
    sql`select display_name from kernel.device_registry
        where org_id = ${orgId} and device_id = ${deviceId}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return row.display_name === null ? null : String(row.display_name);
};

/**
 * Name a registry row that has none — `01-F70`'s backfill, and **only** that.
 *
 * The `and display_name is null` clause is the whole safety story: this cannot rename. A rename is
 * `14-F30`'s `device.manage` from `14-F12`'s list, made by an authenticated human whose identity the
 * change is attributed to; a provisioning command re-run with a typo must not be able to perform one
 * (`15-F27`). Naming a row that `0010` left null is not a rename — `01-F68`'s reconciliation
 * argument, applied to a device.
 */
export const recordDeviceName = async (
  executor: SqlExecutor,
  orgId: string,
  deviceId: string,
  displayName: string,
): Promise<void> => {
  await executor.execute(
    sql`update kernel.device_registry set display_name = ${displayName}
        where org_id = ${orgId} and device_id = ${deviceId} and display_name is null`,
  );
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
