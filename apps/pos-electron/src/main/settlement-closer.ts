/**
 * `01-F63` — **THE PRODUCER FOR `01-F33`'s CLOSING ACT.**
 *
 * ── What was false before this file existed ───────────────────────────────────────────────────
 *
 * `01-F33` ruled that settlement is an **act, not a derivation**, and named the event:
 * `order.settlement_closed`. The type has had a payload schema (`packages/domain/src/registry.ts`),
 * a fold arm and a ratified merge rule (`folds/merge.ts` — a monotone OR over a G-Set, with the
 * attested `billed_paisa` as `uncovered_addition`'s ceiling) since the kernel landed, and **zero
 * production emitters**. So `OpenOrderRow.settled` was `0` on every order this product has ever
 * held, `01-F30`'s conservation equation — which only runs once settled — had **never executed on
 * a real order**, and `DEC-MONEY-009`'s duplicate-settlement guard had to be built on an arithmetic
 * reading (`pay_total >= billed_effective`) because the column it should have read is constantly
 * zero. That is this wave's named recurring defect in the one shape `pnpm seams:check` says out
 * loud it cannot see: **a missing PRODUCER for an event type** — a key in an object literal is not
 * an export, which is exactly how `audit.print_acknowledged` and `order.line_state_changed` sat in
 * the registry with nothing emitting them.
 *
 * `__acceptance__/settlement-closing-act.test.ts` owns this module's behaviour;
 * `__acceptance__/settlement-closer-seam.test.ts` is the hand-written assertion that the shipped
 * app reaches it, because no rail in this repo can see that half.
 *
 * ── The four clauses of `01-F63`, and where each one lives in the code below ───────────────────
 *
 * **WHO — the till that appends the tender which completes the cover.** This module is constructed
 * once in `main/index.ts` and driven from the `payment.recorded` arm of the append handler. The
 * cashier is on the ENVELOPE: `gateway.append` stamps `actor_user_id` from the live PIN session at
 * append time (`02-F41`), and this payload names nobody (`02-F45`).
 *
 * **WHEN — the edge into "tendered for in full", and no other trigger.** `pay_total >= billed`,
 * with `billed > 0`. That is the SAME reading `printing.ts` makes for `02-F15`'s receipt and
 * `line-advance.ts` makes for `02-F31`'s settlement edge, at the same call site — `02-F45` refuses
 * a second source for one fact, and this product already had three call sites answering that one
 * question, so the closing act joins them rather than inventing a fourth. A `02-F13` split
 * therefore closes ONCE, on the tender that covers, not once per tender.
 *
 * **AT MOST ONE PER ORDER, and the EMITTER is what makes that true.** The fold's monotone OR
 * absorbs a re-emission, so `settled` cannot tell you it happened; `01-F1` makes every emission
 * permanent, so the damage is a growing pile of rows each attesting a different closing snapshot
 * for one bill, with no rule for which is true. The check is `row.settled === 1` — the same
 * projection this act is about to change, read locally. **Not an in-process `Set`, and not
 * "covered since I last looked":** either passes every other case and fails the sharp one, where
 * an order dips below cover on a refund and comes back on a fresh tender. `01-F33` says reopening
 * does not exist, so an order that dipped was never un-settled and there is nothing to close again.
 * Reading the projection is also what makes a PEER's close visible — an in-memory latch is
 * invisible on one device and doubles the rows on every branch that has two.
 *
 * **OFFLINE-LEGAL, AND IT NEVER BLOCKS A SALE.** One synchronous read of this device's own SQLite
 * projection: no WAN, no hub, no clock, no ordering metadata (`00 §5.1`, `01-F17`, `01-F34`). It
 * runs AFTER the money is already in the ledger, on `02-F15`'s receipt precedent, and it swallows
 * an append failure — a failure to emit costs a conservation check, never a customer.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────────────────────
 *
 * **The registry schema is NOT tightened, and that is a measurement rather than an omission.**
 * `01-F63` pins the payload; `"order.settlement_closed"` remains `z.looseObject({ order_id })`.
 * Adding `billed_paisa: z.number().int().nonnegative().optional()` would (a) be retroactive on an
 * append-only log and (b) make the RATIFIED merge rule's `close_snapshot_invalid` arm
 * **unreachable** — that arm exists precisely so a non-integer or negative snapshot is folded with
 * an anomaly while *the act still settles* (`01-F63`: "the act is the fact, the snapshot is
 * evidence about it, and bad evidence must never unmake a fact the cashier performed"). A schema
 * that rejected the bad snapshot would quarantine the whole act instead. The pinning that ships is
 * the emitter's contract plus its acceptance suite; `packages/domain` is untouched.
 *
 * **No `closed_at`, and no field derived from a stamp.** `01-F45`/`01-F34`: `device_created_at` is
 * an untrusted forensic hint with one sanctioned reader and this is not it. "Record when the bill
 * was closed" reads as an obviously useful audit field and is a standing-law-1 break — the envelope
 * already carries `branch_created_at`, stamped at append by the kernel.
 */

import { billedTotalPaisa, type DeviceStore, type OpenOrderRow } from "@restos/sync-client";
import type { Gateway } from "./gateway";
import { deviceTaxCell } from "./tax-posture";

/** `01 §4`'s closing act. Named once so a typo cannot make this module emit nothing. */
const SETTLEMENT_CLOSED = "order.settlement_closed";

/**
 * `DEC-MONEY-007`'s discriminator, in the FOLD's own form rather than the FR's shorthand.
 *
 * `01-F63` describes `tendered_paisa` as "`settles_order` only". `merge.ts` computes `pay_total`
 * as Σ over agreed members whose `purpose` is **not** `repays_receivable`, and the attested keys
 * must be the keys that made up that sum or the attestation is a lie about its own arithmetic. The
 * two coincide today because `registry.ts` makes `purpose` a required closed enum of exactly those
 * two values — and writing the fold's form means they go on coinciding if the enum ever gains a
 * third tendering member (`DEC-MONEY-004`'s ratified `tip` is the live candidate).
 */
const REPAYMENT = "repays_receivable";

/** One tender member as the fold renders it into `pay_attempts_json` (payload minus its key). */
type PayMember = { amount_paisa: number; purpose?: unknown };

export type SettlementCloserDeps = {
  /**
   * **THE ONLY READ, and its narrowness IS the commandment-4 guarantee.** One synchronous look at
   * this device's own projection. No transport, no uplink, no mesh session, no clock, no `await` —
   * a WAN that is down changes nothing about what this module can answer. `settlement-guard.ts`
   * carries the same argument for `DEC-MONEY-009`'s refusal and the same dependency net holds both.
   */
  readonly store: Pick<DeviceStore, "openOrders">;
  /**
   * The RAW gateway's append, deliberately — not the authorized `writes`.
   *
   * `WRITE_ACTIONS` fails closed and carries no row for `order.settlement_closed`, so the
   * authorized surface would DENY it; and a matrix row invented for it would be the speculative
   * widening `24-F23` forbids. That is right, for the reason `line-advance.ts` and
   * `aggregator-settlement.ts` already take the raw gateway: this is a **consequence** of an act
   * the matrix has already authorized (the `payment.recorded` that completed the cover, gated on
   * `payment.settle`), not a second human act for commandment 8 to judge. Gating it on the
   * cashier's cell a second time could leave a bill tendered-for-in-full and never closed, with
   * nothing on any screen to say so.
   *
   * The envelope still comes from the gateway, so `02-F41`'s read-at-append attribution stamps the
   * live PIN session exactly as it does for every other append on this device.
   */
  readonly writes: Pick<Gateway, "append">;
};

export type SettlementCloser = {
  /**
   * A `payment.recorded` has landed. If THIS is the edge into tendered-for-in-full, the closing
   * act is appended; otherwise nothing happens at all.
   *
   * Synchronous and `void`, for `01-F17`'s reason and the same one `ReceiptPrinter.settled` and
   * `LineAdvance.settled` beside it give: the settlement is already permanently in the ledger when
   * this runs, and a customer may not be held at the counter by anything that follows it.
   */
  readonly settled: (order_id: string) => void;
};

/**
 * The whole decision, as a pure function of one projected row.
 *
 * Exported so a suite can drive the branch directly and so the emitter below cannot drift from
 * what a test asserts (`K-3`'s dead-oracle shape: an oracle pinning its own copy of the branch it
 * exists to pin). `null` means "do not close", and the three reasons are genuinely different:
 *
 *  - **already closed** (`settled === 1`) — `01-F1`'s at-most-once, read off converged state.
 *  - **nothing billable** (`billed <= 0`) — an empty order satisfies `0 >= 0` trivially, and
 *    closing it would settle a sale that has not happened. `alreadySettled` in
 *    `settlement-guard.ts` makes the identical narrowing for the mirror-image reason.
 *  - **not covered** (`pay_total < billed`) — `02-F13`'s partial. The remainder is still owed.
 *
 * **Law 1 (`01-F34`) — nothing here reads ordering metadata.** `pay_total`, `refund_total` and
 * `pay_attempts_json` are `26 §7`'s unique-keyed sums and `billedEffectiveFromJsonLines` is a pure
 * function of the projected line cells; the attempt keys are **sorted**, never taken in delivery
 * order. So two converged devices compute a byte-identical act.
 */
export const closingActFor = (order: OpenOrderRow): Record<string, unknown> | null => {
  if (order.settled === 1) return null;
  // `01-F82`/`16-F31` (R54): the ATTESTED `billed_paisa` below is what the customer owes, tax
  // included — the merge rule reads it back as `uncovered_addition`'s ceiling, so a pre-tax
  // figure here would breach the order's own ceiling the moment an exclusive order closed.
  const billed = billedTotalPaisa(order.json_lines, deviceTaxCell());
  if (billed <= 0) return null;
  if (order.pay_total < billed) return null;
  return {
    order_id: order.order_id,
    // `01-F30`'s billed total through the ENGINE's own derivation, never re-summed here — and the
    // merge rule reads it back as `uncovered_addition`'s ceiling, so a wrong number here breaches
    // the order's own ceiling the moment it closes. An ATTESTATION, never re-derived later
    // (`01-F1`), on `shift.closed`'s `expected_paisa_by_method` precedent.
    billed_paisa: billed,
    tendered_paisa: order.pay_total,
    // `refund_total`, NOT `repaid_total`. `DEC-MONEY-007`'s near miss: `repaid_total` is a khata
    // tab being paid off, which is a different act against the same order and belongs to no part
    // of this snapshot.
    refunded_paisa: order.refund_total,
    settlement_attempt_ids: coveringAttemptIds(order.pay_attempts_json),
  };
};

/**
 * `01-F31`'s keys, in sorted order — "the keys the cover was made of", so a later reader can tell
 * which tenders this act was closing over.
 *
 * A **divergent** key (two devices, one key, different payloads) is `01-F31`'s contested head: it
 * contributes ZERO to `pay_total`, so naming it here would attest a key the attested total does not
 * contain. `printing.ts` walks the same map under the same two rules for `02-F15`'s receipt.
 */
const coveringAttemptIds = (pay_attempts_json: string): string[] => {
  const attempts = JSON.parse(pay_attempts_json) as Record<string, PayMember[]>;
  return Object.entries(attempts)
    .filter(([, members]) => members.length === 1 && members[0]?.purpose !== REPAYMENT)
    .map(([key]) => key)
    .sort();
};

export const createSettlementCloser = (deps: SettlementCloserDeps): SettlementCloser => ({
  settled: (order_id) => {
    const order = deps.store.openOrders().find((row) => row.order_id === order_id);
    // An order this device cannot read is not an error here (`01-F10`'s straggler shape one layer
    // up). This is called from the IPC handler that returns the append result, so a throw would
    // reach the renderer as a FAILED SALE for money that is already permanently in the ledger.
    if (order === undefined) return;
    const payload = closingActFor(order);
    if (payload === null) return;
    try {
      deps.writes.append({ type: SETTLEMENT_CLOSED, payload, refs: [] });
    } catch {
      // `01-F63`: *"a failure to emit costs a conservation check, never a customer."* The tender
      // is already in the ledger and the drawer is already open; a disk, a schema or a store that
      // has gone away must not turn a completed sale into a refusal on the glass. Nothing is
      // unwound (`01-F1`) and the next tender on the next order is unaffected.
      //
      // Swallowed rather than logged: `console.error` here would print on a path the cashier
      // cannot act on, and the honest signal for an unclosed order is the conservation residual
      // itself — which is the whole point of the act. When `01-F30` runs in the Auditor, an order
      // covered and never closed is exactly what it is there to find.
    }
  },
});
