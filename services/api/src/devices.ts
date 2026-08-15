/**
 * `14-F12` + `14-F13` — the device list and the kill switch, as this service can express them.
 *
 * **This closes the third of `14-F13`'s three blockers, and the other two are worth naming because
 * they shaped everything below.** `services/sync-gateway`'s `revoke-device.ts` recorded them: the
 * matrix had no device action (closed by `14-F30`), this service had no device read model (this
 * file), and a shell command has **no authenticated user**, so the only actor it could write was
 * `null` — permanently, into an append-only store. An authenticated back-office session has one,
 * and that is the whole reason `14-F13` puts revocation on a screen rather than on a terminal.
 *
 * **ONE port, four methods, and the coupling is deliberate.** Two of them reach the device registry
 * (`list`, `revoke`) and two reach `01-F62`'s org-scoped event store (`recordRevocation`,
 * `revocations`) — different tables, different services' concerns, and splitting them into two
 * ports was the obvious shape. It is rejected because they are the two halves of ONE screen:
 * `14-F13` says "the list shows revoked state **and actor**", so a deployment that wired the
 * registry half and forgot the ledger half would render a device list that works, revokes
 * correctly, evicts the till — and attributes nothing, silently. That is Rule B's hole with two
 * ports instead of one optional member (AGENTS.md), and one required bag is what closes it.
 *
 * **Attribution is a JOIN, not a column.** `revoked_at` lives on the registry row because `01-F48`'s
 * eviction reads it every sweep; the actor lives on the event because T-01-09 puts
 * `device.registered / revoked` emission on the doc 14/15 emitters and keeps the registry
 * "provisioning bookkeeping, not event history". Enforcement therefore never depends on the
 * ledger's success — see `revoke`'s ordering below.
 */

import { z } from "zod";

/**
 * One registry row as `14-F12`'s list needs it.
 *
 * ⚠ **THREE OF `14-F12`'S FOUR COLUMNS ARE ABSENT AND THAT IS REPORTED, NOT PAPERED OVER.** The FR
 * asks for "class, app version, last-seen, sync lag". `kernel.device_registry` holds the class;
 * **app version, last-seen and sync lag are stored nowhere in this product** — there is no heartbeat
 * table and doc 15's device pipeline (which doc 14 §2 names as their source) is unbuilt. A
 * plausible substitute — stamping a `last_seen` at hello, deriving lag from the delivery cursor —
 * would be a second interpretation of facts another module owns, and `00 §5.7` forbids showing an
 * aged number as a fresh one. So they are missing here, the screen says which are missing, and the
 * gap closes when the pipeline lands.
 */
export type DeviceRecord = {
  readonly device_id: string;
  readonly branch_id: string;
  readonly device_class: string;
  /**
   * `01-F70` — the till's human name ("Counter till", "Kitchen screen"), off the cloud registry row.
   *
   * **This is the field that makes `14-F12` usable at all**, and the FR's own measured complaint is
   * why: without it the list "can name a till only by its UUID, and the operator reading either is
   * by construction not standing in front of it". `21-F15` decides the null case — a stated
   * *unnamed* treatment naming where it is set, never a blank and never the `device_id` promoted
   * into the name's slot.
   *
   * ⚠ **Null for every row in this deployment, and that is a WRITER gap rather than a read gap.**
   * `0010` added the column nullable with no backfill, and `01-F70`'s "required at REGISTRATION" is
   * owed at `provision-device`, which takes no `--name`. Nothing here may invent one.
   */
  readonly display_name: string | null;
  /** `01-F25`/`01-F48`. Null ⇔ active. This is the field eviction reads. */
  readonly revoked_at: number | null;
  /** `01-F47`. The one honest liveness fact this table carries. */
  readonly token_expires_at: number | null;
};

/** What `revokeRegisteredDevice` reports back, verbatim — the gateway's answer, not a re-derivation. */
export type DeviceRevokeOutcome = {
  readonly branch_id: string;
  readonly device_class: string;
  readonly revoked_at: number;
  /** True when the row was ALREADY revoked and this call changed nothing. */
  readonly already: boolean;
};

/** One `device.revoked` record, read back off `01-F62`'s org-scoped store. */
export type DeviceRevocationRecord = {
  readonly device_id: string;
  /** `14-F13`'s actor. Null for a revocation performed outside an authenticated session. */
  readonly actor_user_id: string | null;
  readonly server_received_at: number;
};

/**
 * `device.revoked`'s payload. Declared HERE and not in `packages/domain`, on
 * `gateway-client.ts`'s `CatalogChangedPayload` precedent: `01 §4` puts payload schemas in
 * `domain`, and `domain` ships none for the org-scoped family, so re-declaring one there for a
 * single reader would be the larger change. It is a **schema**, not a cast — this crosses a service
 * boundary, and an unparsed body would let a gateway-side rename reach `14-F13`'s list as
 * `undefined` beside a real date, which reads as data rather than as a bug.
 *
 * `device_id` is the join key; `branch_id` and `device_class` are carried so the event is legible on
 * its own (`01-F1`: history is read long after the row it describes may have changed).
 */
export const DeviceRevokedPayload = z.object({
  device_id: z.string().min(1),
  branch_id: z.string().min(1),
  device_class: z.string().min(1),
});

export type DeviceDirectory = {
  /** `14-F12` — every device the org has registered, active and revoked alike. */
  list(org_id: string): Promise<readonly DeviceRecord[]>;
  /**
   * `14-F13` — set `revoked_at`. The REGISTRY write and nothing else: this is what `01-F48`'s
   * ≤30 s sweep reads, so it is the act that actually stops the till.
   */
  revoke(org_id: string, device_id: string): Promise<DeviceRevokeOutcome>;
  /** `14-F13`'s actor, as an `01-F62` org-scoped `device.revoked` event. */
  recordRevocation(record: {
    readonly org_id: string;
    readonly device_id: string;
    readonly branch_id: string;
    readonly device_class: string;
    readonly actor_user_id: string;
    readonly server_received_at: number;
  }): Promise<void>;
  /** The same events, read back for the list's actor column. */
  revocations(org_id: string): Promise<readonly DeviceRevocationRecord[]>;
};

/** A device row with `14-F13`'s actor resolved — what the screen renders. */
export type DeviceListing = DeviceRecord & {
  /**
   * Who revoked it. `null` on an active device, and **also `null` on a device revoked with no
   * `device.revoked` event to attribute it** — which is a real state, not a defect: every
   * revocation performed by `pnpm -C services/sync-gateway revoke-device` is one, because a shell
   * has no authenticated user. The two `null`s are told apart by `revoked_at`, and the screen must
   * say "not recorded" rather than leaving the cell blank; a blank reads as "nobody", which is a
   * claim, and `00 §5.7` forbids it.
   */
  readonly revoked_by: string | null;
};

/**
 * Join the registry's state to the ledger's attribution.
 *
 * **The EARLIEST event wins**, and that is forced by the registry rather than chosen: `revokeDevice`
 * stamps only the first revocation (`and revoked_at is null`), so `revoked_at` IS the first
 * instant — and attributing it to a later event would name whoever pressed the button second.
 *
 * ⚠ **Two events for one device are NOT producible through this service today, and an earlier draft
 * of this comment claimed they were** ("revoke through the CLI and then through the screen") — which
 * is false: the CLI writes no event at all, and `device-router.ts` appends nothing when the registry
 * answers `already`. The correction matters because the false premise is what made the tiebreak look
 * self-evidently exercised, and the mutation run found it: flipping this comparison killed **0 of
 * 162** tests until `withActors` was asserted directly. The branch is kept rather than deleted
 * because doc 15 emits `device.revoked` too — *"`device.revoked` (support-initiated)"*, `15 §2` —
 * so a platform-support revocation and a back-office one can name one device the day that lands,
 * and `01-F1` forbids removing either row. Asserted in `devices.test.ts` §D against a hand-built
 * pair, since no fixture in this service can produce one.
 *
 * **An active device gets no actor even if an event exists for it.** There is no un-revocation
 * anywhere in this product (`14-F30`; `01-N5`'s replacement path is a fresh `device_id`), so that
 * combination means something has gone wrong upstream — and rendering an actor beside an ACTIVE
 * device would tell an owner a live till had been switched off.
 */
export const withActors = (
  devices: readonly DeviceRecord[],
  revocations: readonly DeviceRevocationRecord[],
): readonly DeviceListing[] => {
  const earliest = new Map<string, DeviceRevocationRecord>();
  for (const record of revocations) {
    const held = earliest.get(record.device_id);
    if (held === undefined || record.server_received_at < held.server_received_at) {
      earliest.set(record.device_id, record);
    }
  }
  return devices.map((device) => ({
    ...device,
    revoked_by:
      device.revoked_at === null ? null : (earliest.get(device.device_id)?.actor_user_id ?? null),
  }));
};

/**
 * The fallback when a host declares no device directory — **every method REFUSES**, loudly.
 *
 * The tempting fallback is an in-memory stub, and it is the one shape AGENTS.md measured as
 * invisible to every rail we have: "Rule B asks whether an optional member is *supplied*, never
 * whether what was supplied is *real*, and a stub is a supply." A stub here would give an owner a
 * device list that is always empty and a revoke button that always succeeds — a kill switch that
 * kills nothing, reporting success, on the one screen whose whole purpose is a stolen tablet.
 *
 * Returning `[]` was rejected for the same reason `catalog.enabled` refuses to fake an enabled set:
 * "no devices" is a claim about the fleet, and this host is not in a position to make it.
 */
export const unconfiguredDeviceDirectory = (): DeviceDirectory => {
  const refuse = (): never => {
    throw new Error(
      "device directory not configured: this API host was built with no `devices` dependency, so " +
        "it can neither list (14-F12) nor revoke (14-F13) anything. `start()` always supplies one " +
        "from SYNC_GATEWAY_URL/_TOKEN; a host that reaches this line is a test host or a " +
        "misconfigured deployment. It refuses rather than answering emptily — an empty device " +
        "list and a revoke that reports success are both claims this process cannot make.",
    );
  };
  return {
    list: async () => refuse(),
    revoke: async () => refuse(),
    recordRevocation: async () => refuse(),
    revocations: async () => refuse(),
  };
};
