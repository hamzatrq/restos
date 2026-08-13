/**
 * # `02-F30`'s NO-SETTLEMENT STEP — the till closes an aggregator order by itself
 *
 * **Owning specs: `02` (the surface), `08` (the aggregator), `01 §4` (the event).**
 *
 * `02-F30` gives foodpanda quick-entry *"no settlement step (aggregator-collected; economics
 * handled by doc 08)"*, and `08-F17` says what happens instead: *"Every aggregator order (both
 * modes) settles at creation/entry with `payment.recorded { method: aggregator_receivable }`
 * (01-F32) — the order closes operationally; the money owed by the aggregator becomes a tracked
 * receivable. Money conservation (01-F30) holds without a counter settlement step."*
 *
 * Until this module existed the product had the first half and not the second: `Counter.tsx` could
 * tag an order `foodpanda` (`02-F1`/`02-F42`) and nothing ever settled it, so a real Rs 570 of food
 * left the kitchen against `pay_total: 0` for ever — `01-F1` makes that permanent. The visible cost
 * is `02-F24`'s day summary, where `printing.ts` buckets `order.pay_total` by channel: **the
 * Foodpanda row printed Rs 0 while the aggregator owed the restaurant real money.**
 *
 * ## The trigger is the CONFIRM, because `08-F8` says the confirm IS the entry act
 *
 * *"manual quick-entry orders are confirmed by the act of entry (02-F30)"* — so `08-F17`'s
 * *"at creation/entry"* lands on `order.confirmed` and not on `order.created`: at creation the
 * order has no lines and therefore no bill, and a receivable is a claim about a bill.
 *
 * ## ⚠ THE CORPUS CONTRADICTS ITSELF ON THE METHOD STRING, AND THIS FILE DOES NOT PICK SILENTLY
 *
 * `08-F5` writes the method as **`aggregator_settlement`**. `01-F32`, `08-F17` — the *same doc*,
 * nineteen rows below `08-F5` — and `packages/domain`'s `PAYMENT_METHODS` all write
 * **`aggregator_receivable`**. Three things decide it and they agree:
 *
 *  1. `PAYMENT_METHODS` is a closed `z.enum`, so `aggregator_settlement` is an `01-F4` error at
 *     emit — **unemittable**, not merely disfavoured.
 *  2. `specs/00`'s authority order resolves a tie in the kernel's favour, and `01-F32` is kernel.
 *  3. `08-F17` is doc 08's own later, fuller statement of the same rule.
 *
 * **The doc-08 correction is OWED and is deliberately not made here** (`24 §3b`, surgical diffs):
 * `08-F5`'s `aggregator_settlement` should read `aggregator_receivable`, citing `08-F17`.
 *
 * ## What this module deliberately does NOT do
 *
 *  - **It does not restrict the item picker to doc 08's mapped menu** (`02-F30`, `08-F6`,
 *    `08-F9`). No mapping exists anywhere in the repo — `services/foodpanda` is a stub — so a
 *    picker built against it would be asserting an invention (commandment 2). **Owed.**
 *  - **It does not carry `08-F5`'s mandatory `aggregator_order_ref`.** That rides
 *    `order.channel_tagged`, which has no payload schema in `packages/domain`, so `01-F4` makes it
 *    unemittable today. **Owed.**
 *  - **It moves no line state.** `01 §4` is canonical that a delivery line is *"rider-driven only
 *    — never advanced by payment/settlement"*, and `line-advance.ts`'s `SETTLEMENT_SERVES`
 *    allowlist already transcribes that. A foodpanda order is a delivery, so its lines stay at
 *    `in_prep`; that is the rule and not a defect. What is genuinely missing is upstream and
 *    belongs to docs 08/09: **nothing in this product emits `rider.picked_up`/`rider.delivered`**,
 *    and `08-F1`'s `order.channel_tagged` (which carries `aggregator_delivery`) has no schema — so
 *    an aggregator line has no mechanism to reach a terminal service state at all. **Owed, and it
 *    needs an FR rather than code.**
 */

import { newId } from "@restos/domain";
import { billedEffectiveFromJsonLines, type DeviceStore } from "@restos/sync-client";

/**
 * `02-F42`'s aggregator channel, named once.
 *
 * `02-F42` closed `channel` to `counter | phone | storefront | whatsapp | foodpanda` and
 * `foodpanda` is the only aggregator in that set, so this is the whole of `01-F32`'s
 * *"aggregator-collected"* as this product can express it today. `08-F1` anticipates *"or other
 * driver id"*; a second driver is a `02-F42` change first, and it would arrive here as a set.
 */
const AGGREGATOR_CHANNEL = "foodpanda";

/** `01-F32`'s method. See the header for the `08-F5` conflict and why this string wins. */
const AGGREGATOR_RECEIVABLE = "aggregator_receivable";

/** `01 §4`'s money event. Named so a typo cannot make this module settle nothing. */
const PAYMENT_RECORDED = "payment.recorded";

/**
 * The `payment.recorded` payload this module emits, as a TYPE ALIAS rather than an interface so it
 * satisfies the `Record<string, unknown>` an `append` seam is written against.
 *
 * Every field is `packages/domain`'s and required there; none is invented here.
 */
export type AggregatorPaymentPayload = {
  readonly order_id: string;
  readonly amount_paisa: number;
  readonly method: string;
  readonly settlement_attempt_id: string;
  readonly shift_id: string | null;
  readonly purpose: string;
};

export type AggregatorSettlementDeps = {
  /**
   * Two projections, narrowed to the two methods this reads.
   *
   * `openOrders` answers *what channel, what bill, what has already landed*; `shifts` answers
   * `02-F22`'s *which shift does this settlement bucket to*.
   */
  readonly store: Pick<DeviceStore, "openOrders" | "shifts">;
  /**
   * The append. **This is the RAW gateway and not `authorizeWrites`, on `line-advance.ts`'s
   * argument and for the same reason.**
   *
   * Commandment 8 protects a HUMAN act, and `02-F30`'s whole content is that there is no human act
   * here — the FR's words are *"no settlement step"*. Routing this through the authorized surface
   * would gate the aggregator's own bookkeeping on whether the cashier who pressed *Send to
   * kitchen* happens to hold `payment.settle`, and a cashier who does not would confirm the order,
   * feed the kitchen, and leave the receivable unwritten with nothing on screen to say so — the
   * Rs 0 Foodpanda row restored by a different route. `refuseDoubleSettlement` is bypassed for the
   * same reason and costs nothing: the covered-bill guard below is the same reading that guard
   * makes, on the same two numbers.
   */
  readonly append: (type: string, payload: AggregatorPaymentPayload) => void;
};

export type AggregatorSettlement = {
  /**
   * `08-F8`/`08-F17` — the entry act landed; close the money side if this is an aggregator order.
   *
   * Called from `main/index.ts`'s `order.confirmed` branch beside the kitchen handoff, AFTER it:
   * `01-F17` and `02-F30`'s *"behave identically downstream"* both say the food comes first, and
   * nothing here may sit between a confirm and its KOT.
   *
   * Returns quietly for every non-aggregator order and for every order this device cannot read.
   */
  readonly confirmed: (order_id: string) => void;
};

/**
 * `02-F22`/`02-F37` — which shift this settlement buckets to, or `null`.
 *
 * `26 §7` makes the shift a **carried key**: the fold must never ask *"which shift was open when
 * this payment arrived?"*, because that reads the READING device's state and two devices would
 * then project different money from one event set (`01-F34`). So it is resolved HERE, at append,
 * and written down.
 *
 * `null` is not a fallback to tidy away — it IS `02-F37`. Settling with no shift open **succeeds**
 * and records the null reference; `01-F17` forbids the resolution ever gating the append, and that
 * matters more here than on the cashier's own path, because the act that triggers this is a
 * confirm and a customer's food is already in the queue.
 *
 * ⚠ **This is a SECOND definition of "which shift is open" in this app and that is a stated cost.**
 * The first is `CashSurfaces.tsx`'s exported `openShiftOf`, whose own header calls itself *"the ONE
 * definition of it in this app"* — because a money path that answered differently from the drawer
 * path was a live defect once already. It cannot be imported: it is a renderer module and `18 §9`
 * puts no main-process import across that boundary. The reading is transcribed exactly — the
 * latest `open_at` among rows with `closed === 0` — and moving it to a shared module is a refactor
 * across three files including an oracle this session may not edit (`24 §3`). **Owed, and named.**
 */
type OpenShiftFacts = {
  readonly shift_id: string;
  readonly open_at: number;
  readonly closed: number;
};

const openShiftIdOf = (shifts: readonly OpenShiftFacts[]): string | null =>
  shifts
    .filter((row) => row.closed === 0)
    .reduce<OpenShiftFacts | null>(
      (best, row) => (best === null || row.open_at >= best.open_at ? row : best),
      null,
    )?.shift_id ?? null;

export const createAggregatorSettlement = (
  deps: AggregatorSettlementDeps,
): AggregatorSettlement => ({
  confirmed: (order_id) => {
    const order = deps.store.openOrders().find((row) => row.order_id === order_id);
    // `01-F17` — this hangs off an `order.confirmed` that has ALREADY landed, beside the kitchen
    // handoff. An order this device cannot read (never converged, or seen only through later
    // events, which `merge.ts` projects as no row at all) must never cost the entry the cashier
    // just made, and must never cost the KOT if a host ever calls this first.
    if (order === undefined) return;
    // `02-F30`/`01-F32` — **the channel is the discriminator, and nothing else is.** Not the money,
    // not the order type, not "the first open order": a counter sale settled as an aggregator
    // receivable would empty `02-F23`'s cash bucket while the drawer filled up, and the cashier
    // would come up short at close against a correct drawer with nothing to point at.
    if (order.channel !== AGGREGATOR_CHANNEL) return;
    // `01-F30`'s billed total, through the ENGINE's own derivation — never re-summed here, so a
    // quantity or a per-line price cannot be dropped on the way (`01-F53` snapshots the price into
    // `order.line_added`, and this reads the fold's projection of those cells).
    const billed = billedEffectiveFromJsonLines(order.json_lines);
    // **ONE comparison carrying TWO facts, and it is one line rather than two on purpose.**
    //
    // 1. `01-F31` — **entering twice does not bill twice.** The trigger here is a ROBOT on the
    //    confirm path, so the double-fire that FR protects a human from is strictly more likely,
    //    not less: a re-sent `order.confirmed` (which `02-F9` requires to be idempotent at the
    //    fold) fires this again. Minting a fresh attempt key per firing would produce two
    //    genuine-looking attempts that `26 §7`'s unique-keyed sum correctly ADDS, doubling the
    //    receivable with no human in the loop to notice — `DEC-MONEY-009` reintroduced.
    // 2. `01-F30` — **an order with no billable lines carries no receivable.** An aggregator order
    //    started and abandoned bills nothing, and a receivable against it is a permanent record
    //    (`01-F1`) of money owed for food nobody ordered.
    //
    // The second is SUBSUMED by the first and a separate `billed <= 0` guard was deleted rather
    // than shipped, because `pay_total` is non-negative so `pay_total >= billed` is already true of
    // every empty bill — a guard that can never change an outcome reads as load-bearing and is not
    // (`24 §3b`). **Worth stating because the same arithmetic is a DEFECT one module over**:
    // `settlement-guard.ts` and `Counter.tsx` keep an explicit `billed > 0` narrowing precisely
    // because `0 >= 0` there would make an empty order read as *already settled* and REFUSE a sale
    // that has not happened (`01-F17`). Here the outcome of reading it that way is *emit nothing*,
    // which is what `01-F30` wants; the comparison is the same and the consequence is opposite.
    //
    // `pay_total >= billed` is also the SAME reading `settlement-guard.ts`, `printing.ts`
    // (`02-F15`) and `line-advance.ts` (`02-F31`) make on these two numbers. Reusing it rather than
    // inventing a second definition of "this bill is covered" is the point: two definitions of one
    // fact is the shape `02-F45` names and refuses.
    if (order.pay_total >= billed) return;
    deps.append(PAYMENT_RECORDED, {
      order_id,
      amount_paisa: billed,
      method: AGGREGATOR_RECEIVABLE,
      // `01-F31`'s uniqueness law: org-globally unique, UUID-class, never a per-device counter.
      settlement_attempt_id: newId(),
      shift_id: openShiftIdOf(deps.store.shifts()),
      // `01-F32`/`DEC-MONEY-007` — **`settles_order`, and the alternative is the trap.** The METHOD
      // is called `aggregator_receivable`, which makes `purpose: "repays_receivable"` read like the
      // matching word; it is the opposite. A repayment is excluded from `pay_total` by `01-F31`'s
      // keyed sum, so that payload would emit a correct-looking event, satisfy "the method is
      // `aggregator_receivable`", and leave the order's money at zero — the exact defect this
      // module exists to close, wearing the fix's clothes. `08-F17`: the order *closes*.
      purpose: "settles_order",
    });
  },
});
