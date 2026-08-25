/**
 * `01-F87` — **the LAYER-2 CONFIGURATION PLANE as this service can express it**: the port the
 * `14-F43` block writes through, and the read every cloud surface resolves an org's posture from.
 *
 * ## Why this exists at all, in one measurement
 *
 * Before it, every layer-2 value a device needed was a per-DEVICE environment variable
 * (`00 §7` (f); `apps/pos-electron/src/main/tax-posture.ts` reads `RESTOS_TAX_POSTURE`,
 * `RESTOS_TAX_RATE_BPS`, `RESTOS_CHARGE_ROUNDING_PAISA`). That works for a till and **fails for
 * everything cloud-side**: nothing in `services/api` could resolve an org's tax posture, so
 * `12-F9`'s owner summary could not tell two restaurants apart and a storefront total could not
 * match what that restaurant's till charges. `01-F87` names the same defect from the other end —
 * *"a device that missed one event holds a silently wrong rate forever"*.
 *
 * ## ONE port, three methods, and the coupling is deliberate
 *
 * `read` and `save` are the artifact; `recordChange` is `01-F62`'s org-scoped ledger record.
 * Splitting them into two ports was the obvious shape and is rejected on `devices.ts`'s stated
 * reasoning, which transfers exactly: `14-F2` says *"no silent edits exist"* and `01-F87` (a) says
 * the ledger record and the published artifact must be **joinable by version** — so a deployment
 * that wired the artifact half and forgot the ledger half would save rates correctly, serve them
 * correctly, and record nothing. That is Rule B's hole with two ports instead of one optional
 * member, and one required bag is what closes it.
 *
 * ## What this port does NOT decide
 *
 * The refusals. `14-F48` puts them at the writer and `@restos/domain/config`'s `refuseConfigWrite`
 * is their ONE declaration; the gateway's `publishConfig` calls it before it stores anything, so a
 * bad cell comes back through this port as the gateway's own 400. **No copy of that check lives
 * here**, because `14-F48`'s closing note measures what a second, silently-disagreeing copy costs:
 * *0 of 95 tests.*
 */

import { z } from "zod";

/** One layer-2 setting as this service moves it. `deleted` is a RESET (`01-F75`, `01-F87` (b)). */
export type ConfigRow = {
  readonly key: string;
  readonly value?: unknown;
  readonly deleted?: boolean;
};

/** The org's current artifact — `01-F76`'s version plus the rows a DEVICE would receive. */
export type ConfigSnapshotRecord = {
  readonly version: number;
  readonly entries: readonly ConfigRow[];
};

export const ConfigRowSchema = z.object({
  key: z.string().min(1),
  value: z.unknown().optional(),
  deleted: z.boolean().optional(),
});

export type ConfigPlane = {
  /**
   * `14-F45`'s grid source and every cloud reader's posture lookup.
   *
   * ⚠ **It answers what a DEVICE would receive**, so a `cloud_only` key (R60's commission) is not
   * in it. That is deliberate: this read exists so a cloud reader and a till resolve the SAME
   * bytes, and a wider read here would be a second answer to *what is this org's configuration*.
   * The commission read is owed with `14-F24`'s channel-economics report, which is the only thing
   * that needs it.
   */
  read(org_id: string): Promise<ConfigSnapshotRecord>;
  /** `14-F43`'s write. Returns the `01-F76` version the publish minted. */
  save(
    org_id: string,
    entries: readonly ConfigRow[],
    opts: { readonly actor_user_id: string; readonly now: number },
  ): Promise<number>;
  /**
   * `01-F87` (a) — one `config.changed` per changed KEY, carrying the version the save produced.
   *
   * Per key rather than per save, because `14-F3`'s history renders a change to *a setting* and
   * `01-F87` (a) types `before`/`after` as **the key's value or `null`**. A single event carrying a
   * bag of keys would have no shape those two fields could take.
   */
  recordChange(record: {
    readonly org_id: string;
    readonly key: string;
    readonly layer: 1 | 2 | 3;
    readonly version: number;
    readonly before: unknown;
    readonly after: unknown;
    readonly actor_user_id: string;
    readonly server_received_at: number;
  }): Promise<void>;
};

/**
 * The fallback when a host declares no config plane — **every method REFUSES**, loudly.
 *
 * `unconfiguredDeviceDirectory`'s reasoning, and here the stub is worse than it is there. A
 * memory stub would answer `{ version: 0, entries: [] }`, which is **indistinguishable from a
 * correct implementation serving an org that has configured nothing** — the true state of every
 * tenant on day one — so it would stay indistinguishable after the plane landed. And a `save` that
 * reported success would tell an owner her tax rate is set while every till goes on charging
 * `16-F1`'s nothing.
 *
 * AGENTS.md's measured blind spot is exactly this shape: *"Rule B asks whether an optional member
 * is supplied, never whether what was supplied is real, and a stub is a supply."*
 */
export const unconfiguredConfigPlane = (): ConfigPlane => {
  const refuse = (): never => {
    throw new Error(
      "config plane not configured: this API host was built with no `config` dependency, so it " +
        "can neither read (14-F45) nor save (14-F43) an org's layer-2 settings. `start()` always " +
        "supplies one from SYNC_GATEWAY_URL/_TOKEN; a host that reaches this line is a test host " +
        "or a misconfigured deployment. It refuses rather than answering emptily — an empty " +
        "settings set is the TRUE answer for a new org, so a stub here would be " +
        "indistinguishable from a working plane for ever (01-F87).",
    );
  };
  return {
    read: async () => refuse(),
    save: async () => refuse(),
    recordChange: async () => refuse(),
  };
};
