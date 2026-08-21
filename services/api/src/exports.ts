/**
 * `22-F16` — **the owner's export request, as this plane can express it.**
 *
 * `22-F16`: *"**Owner-triggered** full export from back office (doc 14) … generated async by a job,
 * delivered as a bundle, recorded as `governance.export_generated` (audited; **owner-role only**)"*.
 * R38 makes it one of the three things that keep R21's *"real business records"* honest.
 *
 * **This plane owns exactly two things: who may ask, and which tenant the answer is about.** What
 * is IN the bundle is `services/jobs`'s (`export-org.ts`, `22 §2`: *"Runs as: BullMQ jobs in
 * `services/jobs` (export generation …)"*), and the split is the two-plane law rather than a
 * preference — a tRPC procedure that read `kernel.events` to build a bundle would be an operational
 * read on the cloud plane, and *"generated async by a job"* is the FR's own word for where it goes.
 *
 * ## ⚠ THE PORT HAS NO PRODUCTION IMPLEMENTATION AND THAT IS REPORTED, NOT PAPERED OVER
 *
 * `server.ts`'s `start()` supplies **nothing** here, so a deployment answers every export request
 * with `unconfiguredExportRequests`'s refusal. That is the honest state and it is deliberate in two
 * directions:
 *
 *   - **A memory stub is REFUSED as the fallback.** AGENTS.md measures the shape as invisible to
 *     every rail we have — *"Rule B asks whether an optional member is supplied, never whether what
 *     was supplied is real, and a stub is a supply"* — and on this surface it is the worst instance
 *     in the file: an owner is told her export is being prepared, `22-N3` renders a **state** rather
 *     than a spinner so the screen looks correct, and nothing anywhere is preparing anything. A
 *     refusal is legible; a lie about a copy of your own ledger is not.
 *   - **`start()` supplying nothing is visible to `pnpm seams:check` BY DESIGN.** The `exports`
 *     member on `ApiServerOptions` carries the debt marker Rule B requires, so the gap is on the
 *     register rather than in a comment nobody greps. What is owed is one seam and it is named:
 *     **a durable request record plus the enqueue that reaches `services/jobs`.** Neither is
 *     invented here, because both need a decision this session may not take — `18 §4` gives every
 *     table exactly one writer service, and a request record written by this service and advanced
 *     to `ready` by the worker has two.
 *
 * `owner-export.test.ts`'s own header names the same gap from the other side and assigns it:
 * *"nothing in this file proves that pulling the trigger causes the job to run … it must be closed
 * with a hand-written assertion by whoever wires the queue"*.
 */

/**
 * `22-N3`: *"owner sees progress state, never a spinner."* A CLOSED set, so a screen renders a
 * word rather than parsing one — the same reasoning `02-F42` applies to channels and `15-F25` to an
 * org's status, and the reason neither is a free string.
 */
export const EXPORT_STATES = ["queued", "running", "ready", "failed"] as const;
export type ExportState = (typeof EXPORT_STATES)[number];

export type ExportRequestRecord = {
  readonly export_id: string;
  /**
   * The tenant this export is ABOUT. It is always the requester's own org (`01-F71` (f) (iii)) —
   * it is stored rather than derived because the worker that generates the bundle has no session to
   * read it from, and a bundle keyed to nothing is a bundle nobody can route.
   */
  readonly org_id: string;
  /**
   * `22-F16` requires the export to be audited, and this field is **the only part of that any code
   * in this product can supply today** — `22-F23` records why: `packages/domain` declares no
   * `governance.*` payload schema, so `01-F4` refuses `governance.export_generated` and the ledger
   * holds no record of the act at all.
   */
  readonly requested_by_user_id: string;
  readonly requested_at: number;
  readonly state: ExportState;
  /** Where the bundle is, once there is one. `null` until then — never an empty string. */
  readonly bundle: string | null;
};

/**
 * **`org_id` is the FIRST argument on both reads, exactly as `where org_id = $1` is the first
 * predicate.** An export id names a bundle holding a complete ledger, so it is a CAPABILITY: a
 * lookup by id alone, with the org checked afterwards or not at all, is the whole leak in one
 * query. Making the org part of the call signature means an implementation cannot forget it without
 * failing to compile.
 */
export type ExportRequests = {
  /** `22-F16`'s trigger. The org and the actor both come from the authenticated subject. */
  request(input: {
    readonly org_id: string;
    readonly requested_by_user_id: string;
    readonly requested_at: number;
  }): Promise<ExportRequestRecord>;
  /** One request, for the CALLER's org only. `null` ⇔ this org has no such export. */
  get(org_id: string, export_id: string): Promise<ExportRequestRecord | null>;
  /** `22-N3`'s progress list — every export this org has asked for. */
  list(org_id: string): Promise<readonly ExportRequestRecord[]>;
};

/**
 * The fallback when a host declares no export requests — **every method REFUSES**, loudly.
 *
 * Returning `[]` from `list` and minting a fake `queued` record from `request` is the tempting
 * shape and is the one this must not take, for `unconfiguredDeviceDirectory`'s reason with a
 * sharper edge: "no exports" and "your export is queued" are both CLAIMS, and this host is in no
 * position to make either. An owner who is told her data is being packaged, and who then waits,
 * has been given a worse answer than "this deployment cannot do that yet".
 */
export const unconfiguredExportRequests = (): ExportRequests => {
  const refuse = (): never => {
    throw new Error(
      "export requests are not configured: this API host was built with no `exports` dependency, " +
        "so 22-F16's owner-triggered export cannot be started, listed or reported on. This is the " +
        "shipped state — `start()` supplies nothing, because the durable request record and the " +
        "enqueue into services/jobs are both OWED (see exports.ts). It refuses rather than " +
        "answering emptily or minting a `queued` record: 22-N3 renders a progress state, so a " +
        "stub here would show an owner a plausible screen over a job that does not exist. " +
        "`pnpm -C services/jobs export-org --org <id> --out <dir>` generates the bundle today.",
    );
  };
  return {
    request: async () => refuse(),
    get: async () => refuse(),
    list: async () => refuse(),
  };
};
