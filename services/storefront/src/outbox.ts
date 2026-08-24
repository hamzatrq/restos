import type { EventEnvelopeT } from "@restos/domain";

/**
 * `06-F30`'s durable half. The origin appends; this is where the append LANDS before anything
 * acknowledges it to a customer.
 *
 * **`00 §5.2`/commandment 4 apply to this service exactly as they apply to a till**: confirmed
 * means locally persisted BEFORE the UI is told. A storefront that returned "order placed" from
 * memory and then lost the process would tell a customer her food was coming when no ledger
 * anywhere had heard of it — and `01-F1` gives us no way to notice afterwards, because there is
 * no row to be missing from.
 *
 * ⚠ **This is a PORT, and a port supplied with a STUB is a blind spot `seams:check` cannot see.**
 * AGENTS.md records the measured version: swap a real gateway publisher for an in-memory one and
 * `verify` is exit 0, `seams:check` is clean, nearly every test passes, and no menu reaches any
 * till. Rule B asks whether an optional member is *supplied*, never whether the supply is REAL.
 * So the durability property is asserted by hand in `origin-seam.test.ts` §D, and the in-memory
 * implementation below is **named** as test-support rather than left to look like a default.
 */
export type Outbox = {
  /**
   * Persists a whole batch atomically and returns only once it is durable.
   *
   * Atomic per batch because a half-written order is worse than a refused one: `order.created`
   * without its lines is a row the till shows as an empty order, and `01-F1` makes it permanent.
   */
  put: (events: readonly EventEnvelopeT[]) => Promise<void>;
  /** Everything not yet acked by the gateway, oldest lamport first. */
  pending: () => Promise<readonly EventEnvelopeT[]>;
  /** `push_ack`'s write-checkpoint: everything at or below this slot is durably merged. */
  ack: (throughLamport: number) => Promise<void>;
};

/**
 * ⚠ **TEST SUPPORT ONLY — never construct this in a shipping host.**
 *
 * It is exported so the acceptance suite can drive the origin without Postgres, and it is named
 * `inMemory` rather than `default` for the reason above: the one thing this class of defect needs
 * is that a stub cannot be mistaken for the real thing at a call site. `06-F30`'s single-writer
 * clause (a Postgres advisory lock per (org, branch)) is not expressible here at all, which is
 * itself the tell — two of these in one process share nothing.
 */
export const inMemoryOutbox = (): Outbox & { readonly all: () => readonly EventEnvelopeT[] } => {
  let stored: EventEnvelopeT[] = [];
  let ackedThrough = -1;
  return {
    put: async (events) => {
      stored = [...stored, ...events];
    },
    pending: async () =>
      [...stored]
        .filter((e) => e.lamport_seq > ackedThrough)
        .sort((a, b) => a.lamport_seq - b.lamport_seq),
    ack: async (throughLamport) => {
      ackedThrough = Math.max(ackedThrough, throughLamport);
    },
    all: () => [...stored],
  };
};
