// Executable conservation invariants (01-F30: "executable in packages/domain";
// T-01-08 contract decision 4). Declared ONCE here — the gateway's merge-time
// refund-cap decision (DEC-SYNC-007) and the Auditor's refold sweep (T-01-11)
// call the same function; no re-implemented arithmetic at any call site.
//
// The settle-time conservation EQUATION now lands below with its consumer, the
// Auditor (the T-01-08 named deferral, closed by T-01-11): the equation itself
// is pure integer arithmetic declared once here per 01-F30's "executable in
// packages/domain"; its fold-derived aggregate INPUTS (billed from delivered
// lines, agreed tendering/refund sums) come from the real merge engine's
// projection at the call site. PLACEMENT = T-01-11 ruling 4's senior-review
// checkpoint.

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

export type SettledConservationArgs = {
  /** Billed total derived from the delivered lines, exited (voided/cancelled)
   * lines excluded — "a fully-voided order nets to zero" (01-F30). */
  billed_paisa: number;
  /** Σ agreed TENDERING payments — purpose `settles_order` only (01-F32 /
   * DEC-MONEY-007: a `repays_receivable` payment is never tender). */
  tendered_paisa: number;
  /** Σ agreed refunds over UNIQUE attempt keys (01-F31 keyed sums). */
  refunded_paisa: number;
};

/**
 * The settled conservation equation (01-F30 as amended July 2026: Σ tendering
 * payments − Σ refunds = billed − voids − comps − discounts once settled;
 * void/comp/discount VALUE terms are 0 at v1 — those event types carry no
 * payload schema, 26 §7). Returns the residual `billed − (tendered − refunded)`:
 *   > 0  — SHORTFALL: a violation once settled (01-F32 "No order reaches
 *          settled state with conservation violated") — the Auditor flags it;
 *   = 0  — conserved;
 *   < 0  — excess tender, whose violation status is the OPEN product constant
 *          (EXCESS_TENDER_IS_EXCEPTION) — NOT flagged at v1.
 * Plain integer arithmetic on guarded non-negative inputs — `refunded` may
 * legitimately exceed `tendered` (unprovable refunds merge before their parent,
 * 01-F17/DEC-SYNC-007), so the interior subtraction must be allowed to go
 * negative.
 */
export const settledConservationResidualPaisa = (args: SettledConservationArgs): number => {
  const billed = asPaisaInt(args.billed_paisa, "billed_paisa");
  const tendered = asPaisaInt(args.tendered_paisa, "tendered_paisa");
  const refunded = asPaisaInt(args.refunded_paisa, "refunded_paisa");
  return billed - (tendered - refunded);
};
