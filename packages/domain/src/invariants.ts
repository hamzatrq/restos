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
import { asPaisaInt } from "./money.js";

// Integer-paisa runtime guard (00 §6: floats never; brands are compile-time only — T-01-13
// posture — so the runtime check IS the enforcement). Imported, not redeclared: this module
// carried its own copy with identical semantics and a differently-worded message, and the
// message is where two copies of one rule diverge first (18 §2).

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
  /** What the customer owes, TAX INCLUDED (01-F82, founder ruling R54) — precisely
   * `taxSnapshot(...).total_paisa` (16-F5's snapshot total), under all three of
   * 16-F2's postures. Its base is still the delivered lines with exited
   * (voided/cancelled) ones excluded — "a fully-voided order nets to zero"
   * (01-F30) — and under `exclusive` it exceeds that base by exactly the tax.
   *
   * ⚠ This doc read "Billed total derived from the delivered lines" with no
   * mention of tax, which is the definition 01-F30 as amended calls "wrong rather
   * than merely stale". Under the old reading an exclusive order's correct tender
   * read as a silent EXCESS of exactly the tax on EVERY settled order
   * (EXCESS_TENDER_IS_EXCEPTION is false), and 01-F63's `pay_total >=
   * billed_effective` cover test passed a bill that was under-tendered by it.
   * `__acceptance__/tax-inside-billed-total.test.ts` pins both directions. */
  billed_paisa: number;
  /** Σ agreed TENDERING payments — purpose `settles_order` only (01-F32 /
   * DEC-MONEY-007: a `repays_receivable` payment is never tender). */
  tendered_paisa: number;
  /** Σ agreed refunds over UNIQUE attempt keys (01-F31 keyed sums). */
  refunded_paisa: number;
};

/**
 * The settled conservation equation (01-F30 as amended July 2026: Σ tendering
 * payments − Σ refunds = billed − voids − comps − discounts once settled).
 * Returns the residual `billed − (tendered − refunded)`:
 *   > 0  — SHORTFALL: a violation once settled (01-F32 "No order reaches
 *          settled state with conservation violated") — the Auditor flags it;
 *   = 0  — conserved;
 *   < 0  — excess tender, whose violation status is the OPEN product constant
 *          (EXCESS_TENDER_IS_EXCEPTION) — NOT flagged at v1.
 * Plain integer arithmetic on guarded non-negative inputs — `refunded` may
 * legitimately exceed `tendered` (unprovable refunds merge before their parent,
 * 01-F17/DEC-SYNC-007), so the interior subtraction must be allowed to go
 * negative.
 *
 * ## ⚠ THERE IS NO PARAMETER FOR `void_value`, `comp_value` OR `discounts`, AND
 * ## THE REASON THIS COMMENT USED TO GIVE HAS EXPIRED
 *
 * It read *"void/comp/discount VALUE terms are 0 at v1 — those event types
 * carry no payload schema, 26 §7"*. That was true when it was written and is
 * FALSE as of August 2026: `registry.ts` now carries `void.recorded`,
 * `comp.recorded`, `discount.recorded` and `order.line_price_overridden`, each
 * with an `order_id` and an `amount_paisa` (`specs/26-merge-semantics.md:113`
 * still asserts the retired premise and is owed a correction). The conclusion
 * survives; its reason does not, and a comment resting on an expired premise is
 * how the next reader concludes the question is settled.
 *
 * The three terms stay absent — NOT defaulted to zero behind an optional
 * parameter, which would be a term with no producer — for four reasons that are
 * live today. They are recorded here rather than in a commit message because
 * this is the file a session reaches for when it decides to "just add them".
 * The worked argument and the options are `plans/wave-1/f30-conservation-terms-
 * options.md`; the decision is a founder's.
 *
 *  1. ~~**No idempotency key exists on any of the four types.**~~ **CLOSED by
 *     `01-F83` (founder ruling R56, August 2026).** All four now carry a required
 *     `adjustment_attempt_id` — `01-F31`'s law unchanged, org-globally unique,
 *     UI-minted, UUID-class (`DEC-MONEY-008`), under its own field name so a fold
 *     cannot sum settlements and correctives into one Σ. That was `DEC-MONEY-010`'s
 *     gate condition **(ii)**, and it is the only one this closes: (i) and (iii)
 *     below are untouched and each is independently fatal, so **the three terms
 *     stay ABSENT**. The reason the key was needed is kept, because it is what the
 *     next reader must not re-open: Σ-over-members and Σ-over-event-ids both make
 *     a double-tapped "void Rs 500" subtract Rs 1,000, which is the failure
 *     `01-F31` exists to prevent.
 *  2. **`26 §7` already rules this is not a fold problem** — its *"looks like
 *     ordering, actually needs"* table maps `01-F30` to a **closure** mechanism
 *     (the Auditor over the merged log), and conservation is absent from its
 *     four-entry ordering list. `packages/sync-client`'s merge engine keeps the
 *     four types projection-inert on that reading and says so at its case arm.
 *  3. **`billed_paisa` already excludes exited lines** (see its doc above), so an
 *     order-level `void.recorded` beside line exits would subtract the same money
 *     TWICE — permanently, converged, and silently under `01-F1`. Which of the two
 *     representations is authoritative is answered by no FR.
 *  4. ~~**The equation does not run for these orders yet.**~~ **CLOSED by `01-F63`
 *     (August 2026).** This read *"`order.settlement_closed` has ZERO production
 *     emitters, so adding a term here would be a correct subsystem with no seam
 *     to the product"*, and it was true when written. `apps/pos-electron/src/main/
 *     settlement-closer.ts` is now that emitter — the till appends the act on the
 *     edge into tendered-for-in-full — so `order.settled` reaches `1` on a real
 *     order and this equation executes for the first time. **It is the ONE blocker
 *     that has moved; 1–3 above are untouched and each is independently fatal.**
 *  5. **All four escalatable types have ZERO PRODUCTION EMITTERS** (`DEC-MONEY-010`,
 *     measured 2026-08-12). `void.recorded`, `comp.recorded`, `discount.recorded`
 *     and `order.line_price_overridden` each carry a schema, an authorization row
 *     and a fold arm, and nothing in `apps/` or `services/` constructs one —
 *     `02-F20`'s void/comp/price-override surfaces do not exist. So a term added
 *     today would be summed from an empty set for a second, independent reason.
 *     `__acceptance__/conservation-terms-gate.test.ts` §B is the hand-written
 *     tripwire for it, because `seams:check` is blind to a missing producer for an
 *     event type.
 *
 *  **`DEC-MONEY-010` (August 2026) converts all of this into a GATE rather than a
 *  deferral:** a term enters this signature when, and only when, its type has (i) a
 *  production emitter, (ii) an `01-F31`-class idempotency key and (iii) a `26 §7`
 *  merge rule — and until then it is ABSENT, **never defaulted to zero behind an
 *  optional parameter**, because an optional zero term is a term with no producer
 *  wearing a signature that says it has one.
 */
export const settledConservationResidualPaisa = (args: SettledConservationArgs): number => {
  const billed = asPaisaInt(args.billed_paisa, "billed_paisa");
  const tendered = asPaisaInt(args.tendered_paisa, "tendered_paisa");
  const refunded = asPaisaInt(args.refunded_paisa, "refunded_paisa");
  return billed - (tendered - refunded);
};
