/**
 * **THE MINIMUM THIS MODULE READS OFF AN EVENT — and the narrowness IS the law-1 statement.**
 *
 * `01-F34` forbids a fold reading ordering metadata: no `global_seq`, no `lamport_seq`, no device
 * clock, no envelope-id comparison that reaches a projected value. `__acceptance__/law-one.test.ts`
 * proves that by mutilating full envelopes and asserting the report does not move — which is the
 * right test and is still the load-bearing one, because a structural type can be widened by anyone.
 *
 * This type is the belt to that brace: `packages/domain`'s `ParsedEvent` is assignable to it, and
 * an implementation here **cannot reach `envelope.id` or `envelope.device_created_at` at all**,
 * because the compiler does not believe they exist. Widening it is a visible diff on a file whose
 * whole header is about why it is narrow.
 *
 * ⚠ **`branch_created_at` is IN and that is deliberate.** Law 2 (`01-F43`..`F46`, `DEC-TIME-001`)
 * makes it the branch-consensus BUSINESS clock, stamped at append and travelling inside the event
 * precisely so durations are computable — and `10-F28`'s period is a duration.
 * `services/api/src/ledger.ts` and `services/sync-gateway/src/day-ledger.ts` already window on it.
 *
 * It also lets the cloud read model feed this package **without inventing an envelope**: a
 * `SummaryEvent` from `services/api` is structurally one of these, so no adapter has to fabricate
 * an `id` or a `device_created_at` that would then be a lie sitting in front of a fold that is
 * forbidden from reading either.
 */
export type InventoryEvent = {
  readonly type: string;
  readonly payload: unknown;
  readonly envelope: {
    /** `01-F43` — the branch-consensus business clock. The ONLY envelope field read anywhere here. */
    readonly branch_created_at: number;
  };
};
