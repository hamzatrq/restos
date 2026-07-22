// Executable conservation invariants (01-F30: "executable in packages/domain";
// T-01-08 contract decision 4). Declared ONCE here — the gateway's merge-time
// refund-cap decision (DEC-SYNC-007) and the Auditor's refold sweep (T-01-11)
// call the same function; no re-implemented arithmetic at any call site.
//
// The full settle-time conservation equation (Σ payments − Σ refunds = billed −
// voids − comps − discounts) is NOT here — it needs the order fold and lands
// with its consumer, the Auditor (T-01-08 named deferral).

/** Integer-paisa runtime guard (00 §6: floats never; brands are compile-time
 * only — T-01-13 posture — so the runtime check IS the enforcement). */
const asPaisaInt = (n: number, label: string): number => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer of paisas, got ${n}`);
  }
  return n;
};

export type RefundRemainderArgs = {
  /** The parent payment attempt's amount (01-F29: the merged `payment.recorded`
   * whose settlement_attempt_id equals the refund's payment_attempt_id). */
  payment_amount_paisa: number;
  /** Σ prior refunds against that parent over UNIQUE refund attempt keys
   * (01-F31 unique-keyed sums — the CALLER dedupes by attempt key). */
  prior_refunds_total_paisa: number;
  /** The candidate refund's amount. */
  this_refund_paisa: number;
};

/**
 * The fold-free refund cap (01-F29 / 01-F30 / DEC-SYNC-007): true ⇔ this refund
 * exceeds the parent payment's un-refunded remainder. Exact cover is NOT a
 * violation; one paisa over is. Plain integer comparison — the remainder may be
 * negative when unprovable refunds merged before their parent (01-F17), and a
 * branded subtraction would throw exactly where the answer must be `true`.
 */
export const refundRemainderExceeded = (args: RefundRemainderArgs): boolean => {
  const payment = asPaisaInt(args.payment_amount_paisa, "payment_amount_paisa");
  const prior = asPaisaInt(args.prior_refunds_total_paisa, "prior_refunds_total_paisa");
  const refund = asPaisaInt(args.this_refund_paisa, "this_refund_paisa");
  return refund > payment - prior;
};
