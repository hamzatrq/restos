/**
 * # `02-F31` — the PRODUCER for `order.line_state_changed`, which did not exist
 *
 * `order.line_state_changed` has had a payload schema in `packages/domain/src/registry.ts` since
 * T-01-15 and a fold consumer in `packages/sync-client/src/folds/merge.ts` since the merge matrix
 * landed — and **no production emitter anywhere in `apps/`, `packages/` or `services/`**. So the
 * kernel could carry a line's whole workflow and the product never moved one: every line of every
 * order in this repo has sat at `placed` forever, which `apps/pos-electron/CLAUDE.md` and
 * `renderer/OrdersSurface.tsx` both already say out loud (it is `C32`'s first blocker).
 *
 * That shape is a named blind spot: `pnpm seams:check` walks value exports and optional seams, and
 * **a key in an object literal is neither**, which is how `audit.print_acknowledged` sat in the
 * registry with nothing emitting it. That instance was closed by `printing.ts` emitting it plus a
 * hand-written assertion in `__acceptance__/print-ack-audit.test.ts`; this module is the same move
 * for the same reason, and `__acceptance__/line-advance-seam.test.ts` is its hand-written half.
 *
 * ## What `02-F31` says, and which half of it is here
 *
 * > line statuses auto-advance where no device exists to signal them: `kot.printed` → lines
 * > `in_prep`; settlement → lines `served` — **dine-in/takeaway/pickup only**. Delivery lines are
 * > NEVER advanced by settlement … no `ready` state is fabricated
 *
 * **Only the `kot.printed` half is built.** The settlement half is *blocked in the kernel* and
 * building it would write permanently illegal edges into an append-only ledger; the whole argument
 * is under `SETTLEMENT_IS_BLOCKED` at the bottom of this file. It is not a scoping choice and it
 * must not be closed by a session without a ruling.
 *
 * ## The three inputs, and where each comes from
 *
 * 1. **Which lines, and from what state** — `store.openOrders()`'s `json_lines`, whose cells carry
 *    the fold's own projected `states`. `01-F34`/`01-F35` make an edge's legality a pure function
 *    of its own payload (`from_states` → `to`) judged against `LEGAL_NEXT`, so an emitter that
 *    guesses `from_states` writes an edge the fold records as `illegal_transition` and refuses —
 *    permanently, under `01-F1`. Reading the projection is what makes the claim true rather than
 *    hopeful.
 * 2. **Whether this device may advance at all** — `hardware-tier.ts`, `02-F31`'s detection rule.
 * 3. **The append** — the raw gateway, deliberately *not* `authorizeWrites`. See `LineAdvanceDeps`.
 *
 * ## `01-F34` is not at risk here and the reason is worth stating
 *
 * Law 1 constrains **folds**: a projected value may read no ordering metadata. This module is an
 * *emitter*, and it reads the projection to decide what to append — which every emitter in the
 * product does (`gateway.addLine` reads `openOrders()` for the channel). Nothing here reaches
 * `global_seq`, `lamport_seq`, `device_created_at` or an envelope id, and the fold this feeds is
 * unchanged: `merge.ts` is not touched by this work at all. `__acceptance__/line-advance.test.ts`
 * pins that with a bijective id-relabel over the emitted edges, on the shape
 * `shift-cash-invariance.test.ts` established, because "we did not intend to" is not evidence.
 */

import type { ServeSignalOwner } from "@restos/device-config";
import { applyLineState, type OrderLineState } from "@restos/domain";
import { billedTotalPaisa, type DeviceStore } from "@restos/sync-client";
import { autoAdvancesLines, type HardwareTier } from "./hardware-tier";
import { deviceChargeRoundingPaisa, deviceTaxCell } from "./tax-posture";

/**
 * One line's cell as the fold renders it into `json_lines`. Structurally a subset of
 * `BilledLineCell` — only `states` is read here, and it is read as `unknown` shape rather than
 * imported so a fold-side field addition cannot break this parse.
 */
type ProjectedCell = { states?: unknown };

/** `01-F35`'s per-line edge context, exactly as `registry.ts` requires it. */
export type LineEdgeContext = {
  readonly to: OrderLineState;
  readonly from_states: readonly OrderLineState[];
  readonly preds: readonly string[];
};

/** The `order.line_state_changed` payload, exactly as `registry.ts` requires it. */
export type LineStateChangedPayload = {
  readonly order_id: string;
  readonly line_ids: readonly string[];
  readonly state: OrderLineState;
  readonly line_context: Readonly<Record<string, LineEdgeContext>>;
};

/**
 * Build the edge set that moves every eligible line of one order to `to`, or `null` when none is.
 *
 * **A pure function of the projection**, so the whole policy is testable without a store, a
 * printer or an Electron app — and so the three rules it enforces can be argued with:
 *
 * 1. **A line whose projected state is contested is left alone.** `merge.ts` renders a contested
 *    line as its full terminal MVR set (≥ 2 members) rather than one state, and `01-F31`'s rule is
 *    that *"a fold never picks a winner"*. An emitter that picked one would launder a disputed
 *    line into a decided one through the back door, and `01-F1` makes that permanent.
 * 2. **Only a LEGAL edge is emitted**, judged by `domain`'s own `applyLineState` — the same
 *    predicate `merge.ts`'s `edgeLegal` uses, so this cannot drift from the fold's answer. An
 *    illegal edge is not refused loudly: it lands, is flagged `illegal_transition`, and stays in
 *    the ledger for ever.
 * 3. **`from_states` is what the fold actually projects**, never an assumption about what the
 *    line "should" be. This is the difference between an edge and a value (`01-F34`): legality is
 *    judgeable only from the states the edge claims to leave.
 *
 * ### `preds: []`, stated as an interpretation rather than slipped in
 *
 * `preds` exist to retire heads and to make concurrency detectable. This emitter does not know the
 * envelope ids of the edges it is superseding — the `open_orders` projection carries per-line
 * `states` and no head edge ids, which `apps/pos-electron/CLAUDE.md` already records as `C32`'s
 * third blocker. Three things make the empty list correct here rather than merely convenient, and
 * the third is a measurement:
 *
 *  - **T1 is single-device by definition** (`02-pos-app.md:14`: *"the POS is the entire
 *    restaurant"*), so there is no concurrent emitter whose edge this one would need to name.
 *  - **For a NON-TERMINAL advance the projection is provably identical either way**: `projectLine`
 *    takes ≼-max over ALL legal edges rather than over heads, so an unretired lower edge cannot
 *    change the watermark. Retirement only decides anything when a TERMINAL head is involved.
 *  - `__acceptance__/line-advance.test.ts` folds the emitted payload through the **real** merge
 *    engine and asserts the projected state AND that the anomaly map is empty. A wrong `preds`
 *    would show up there as `inconsistent_predecessor` or `terminal_regression`.
 *
 * ## ⚠ THE TERMINAL EDGE IS THE EXCEPTION, AND IT IS MEASURED RATHER THAN PREDICTED
 *
 * This block used to close *"when the settlement half is unblocked this becomes load-bearing and
 * must be revisited: a terminal edge with empty `preds` leaves the preceding non-terminal head
 * alive and `projectLine` flags it `terminal_regression`, on every settled order."* **That
 * prediction was exactly right, and here is the measurement** (`DEC-HW-002`, August 2026 — the same
 * three-edge walk through a real store, `preds` the only thing that differs):
 *
 * ```
 *   served with preds: []          states ["served"]   anomalies { <confirmed edge>:
 *                                                                  "terminal_regression",
 *                                                                  <in_prep edge>:
 *                                                                  "terminal_regression" }
 *   served with preds: [<in_prep>] states ["served"]   anomalies {}
 * ```
 *
 * So the **projected state is correct either way** and the cost is two flags per line on every
 * settled order. `preds: []` ships anyway, and the reasoning is bounded rather than dismissive:
 *
 *  - **It is a DERIVED flag, not ledger history.** `projectLine` recomputes `anomalies` from the
 *    edge set on every fold, and the edges themselves are all LEGAL — nothing wrong is written to
 *    the append-only store, so this is not `01-F1`'s permanence and it clears retroactively on a
 *    refold the day `preds` can be built. That is the whole difference from the illegal-edge case
 *    the footer below refused.
 *  - **No value moves.** `billedCellPaisa` reads `states` only, `cookingDone` is true either way,
 *    and the money columns are untouched — verified in the same run.
 *  - **The cloud Auditor already excludes it by name.** `services/sync-gateway/src/auditor.ts`
 *    filters to `illegal_transition` under the comment *"the other anomaly classes are fold
 *    renderings, not illegalities"*, so this raises no finding and pages nobody.
 *
 * **What it would take to close, and why that is not this change.** The emitter cannot build the
 * head set: `json_lines` carries per-line `states` and no head edge ids, so the ids simply are not
 * on the read path (`apps/pos-electron/CLAUDE.md` records this as `C32`'s third blocker). The fix
 * has a precedent one projection over — `AvailabilityRow.head_ids_json` exists for exactly this
 * reason, *"exported so an operator surface can build a correct"* supersedes link, with its own
 * `01-F34` id-bijection invariance test — so the shape is known: `BilledLineCell` would gain the
 * same. That is a `packages/sync-client` fold change to an **oracle-pinned cell shape** (contract
 * ruling C8) in a second protected package, for a derived flag no consumer reads. **OWED, named
 * here, and deliberately not taken in the change that closes the FR.**
 */
export const advanceEdgesFor = (
  order: { readonly order_id: string; readonly json_lines: string },
  to: OrderLineState,
): LineStateChangedPayload | null => {
  const cells = JSON.parse(order.json_lines) as Record<string, ProjectedCell>;
  const line_context: Record<string, LineEdgeContext> = {};
  for (const [line_id, cell] of Object.entries(cells)) {
    const states = cell.states;
    // Rule 1 — exactly one projected state, or this line is contested and not ours to decide.
    if (!Array.isArray(states) || states.length !== 1) continue;
    const from = states[0] as OrderLineState;
    // Rule 2 — `domain`'s own legality predicate, so this can never disagree with the fold.
    if (!applyLineState(from, to).applied) continue;
    // Rule 3 — the state the fold projects, which is what makes this an edge and not a value.
    line_context[line_id] = { to, from_states: [from], preds: [] };
  }
  const line_ids = Object.keys(line_context);
  if (line_ids.length === 0) return null;
  // `line_ids` is `registry.ts`'s legacy field and `merge.ts` reads only `line_context`; it is
  // derived from the same object rather than assembled separately so the two cannot disagree.
  return { order_id: order.order_id, line_ids, state: to, line_context };
};

/**
 * `01 §4`'s canonical rule, read off the sentence itself rather than off `02-F31`'s restatement
 * of it — `02-F31` ends *"canonical rule in 01 §4"*, so this is the authority:
 *
 * > terminal service state — `served` (dine-in/takeaway/pickup) **or** `picked_up → delivered`
 * > (delivery, **rider-driven only** — never advanced by payment/settlement, 09)
 *
 * **The rule assigns `served` to three named service modes and gives delivery a DIFFERENT terminal
 * path** (`picked_up → delivered`), driven by `rider.picked_up`/`rider.delivered` or doc 09's
 * on-behalf dispatch entries. A delivery line advanced by settlement is a line recorded as handed
 * over while the food is still in the building — and `served` is TERMINAL under `01-F35`, so no
 * later edge can walk it back and `01-F1` forbids removing it.
 *
 * ## It is an ALLOWLIST, and that is the load-bearing choice
 *
 * `order_type` is an **open string** in `packages/domain/src/registry.ts`
 * (`z.string().min(1).optional()`) — `02-F42` closed `channel` and explicitly left this axis open —
 * so an unrecognised value and an absent value are both constructible, and the two readings differ
 * on exactly those cases:
 *
 *  - **allowlist** (this) — advance only the three modes `01 §4` names. An unknown or absent type
 *    leaves the line at `in_prep`. Nothing false is written, the state is non-terminal, and a later
 *    edge can still move it.
 *  - **denylist** (`order_type !== "delivery"`) — advance everything else. A delivery order whose
 *    type is spelled any other way (`"Delivery"`, a doc 09 variant, a future aggregator mode) is
 *    marked `served`, terminally and permanently.
 *
 * The harm is asymmetric and only in one direction is it recoverable, so the open string decides
 * it: refusing to advance costs a queue row that lingers, advancing wrongly costs a false record of
 * handover that `01-F1` will not let anyone correct. The corpus is also written as an allowlist —
 * `01 §4` enumerates who reaches `served` rather than who is excluded from it.
 *
 * `pickup` is in the set on `01 §4`'s and `02-F31`'s authority (both name *dine-in/takeaway/pickup*)
 * even though **nothing in this product writes it yet**: `Counter.tsx` offers `02-F1`'s three types
 * and doc 06's storefront owns the pickup door (`06-F8`), which is unbuilt. Transcribing the FR's
 * third mode is not speculative scope — omitting it would silently narrow the rule to the two modes
 * this app happens to author today, and the next writer of a pickup order would find the FR quietly
 * un-implemented.
 */
const SETTLEMENT_SERVES: ReadonlySet<string> = new Set(["dine_in", "takeaway", "pickup"]);

/**
 * `02-F31`'s settlement precondition as a pure predicate over ONE order row, exported so it can be
 * driven directly and so the closure below cannot drift from what a test asserts (the `K-3`
 * dead-oracle shape: an oracle pinning its own copy of the branch it exists to pin).
 *
 * Two questions, and the second is an INTERPRETATION with the simpler alternative named.
 *
 * 1. **Is this order's type one `01 §4` sends to `served`?** See `SETTLEMENT_SERVES`.
 *
 * 2. **Has settlement actually COMPLETED?** `02-F31` says *"settlement → lines `served`"* and does
 *    not define the moment. `01-F33`'s closing act `order.settlement_closed` would define it, and
 *    when this was written it had **no production emitter anywhere** — so `OpenOrderRow.settled`
 *    was `0` on every order any device had ever held and waiting for it would have advanced
 *    nothing, ever. So the trigger is the same observable fact `printing.ts` already uses at the
 *    *same call site* for `02-F15`'s receipt: the order is **tendered for in full**,
 *    `pay_total >= billed_effective`, both off the fold's own keyed sums.
 *
 *    ⚠ **`01-F63` (August 2026) gave the act an emitter — `main/settlement-closer.ts`, driven from
 *    the third arm of that same call site — so the first half of the paragraph above is now
 *    history rather than a live constraint, and it is corrected in place rather than deleted
 *    because a reader who finds `settled` populated should be able to find out why this module
 *    still does not read it.** Nothing here changes: the closing act is emitted from the SAME
 *    reading this predicate makes, so switching to `settled` would swap one form of one fact for
 *    another and would introduce an ORDER dependency between two consequences of one append that
 *    are deliberately independent (`index.ts` runs this one first). `01-F63`'s own words are that
 *    it joins the existing definition rather than replacing it.
 *
 *    **Reusing that reading rather than inventing a second one is the point.** Both hang off one
 *    `payment.recorded` in `index.ts`; two different definitions of "settled" firing from one event
 *    would be two sources for one fact, which is the shape `02-F45` names and refuses. The simpler
 *    alternative — advance on *any* `payment.recorded` — is rejected because `02-F13` splits a
 *    settlement across methods, so it would mark lines `served` at the first partial tender, before
 *    the customer has paid and irreversibly (`01-F35`). It also protects against the open
 *    `TAKE CASH`-on-an-empty-entry defect recorded in this package's guide: a `Rs 0` tender leaves
 *    `pay_total < billed_effective`, so a phantom settlement moves no line.
 *
 *    `pay_total` is `01-F31`'s keyed sum — a contested attempt contributes zero — and excludes
 *    `repays_receivable` (`DEC-MONEY-007`), so a khata tab repaid later cannot settle the original
 *    order twice.
 */
export const advancesOnSettlement = (order: {
  readonly order_type: string | null;
  readonly pay_total: number;
  readonly json_lines: string;
}): boolean =>
  SETTLEMENT_SERVES.has(order.order_type ?? "") &&
  // `01-F82` (R54) — the same cover test `settlement-guard.ts` and `printing.ts` make, on the
  // same tax-inclusive number. Three call sites, ONE definition (`02-F45`).
  order.pay_total >=
    billedTotalPaisa(order.json_lines, deviceTaxCell(), deviceChargeRoundingPaisa());

export type LineAdvanceDeps = {
  /** The projection this reads `from_states` out of. Narrowed to one method on purpose. */
  readonly store: Pick<DeviceStore, "openOrders">;
  /**
   * `02-F31`'s detection rule, as a GETTER rather than a value.
   *
   * A getter because `resolveHardwareTier` will one day take a roster that arrives over the wire,
   * and a value captured at construction would freeze this device on whatever the tier was at
   * boot. It costs nothing today and it is the difference between a seam and a snapshot.
   */
  readonly tier: () => HardwareTier;
  /**
   * `03-F52`'s layer-2 assignment — **who marks `served` at this branch** — as a GETTER, and the
   * SAME declaration `apps/pass-kds` reads (`@restos/device-config`, never a copy here).
   *
   * > 03-F52 **The tier stops being an input.** `02-F31`'s auto-advance ships unchanged in
   * > behaviour and changes its trigger: the till emits on settlement because the branch's
   * > serve-signal owner is `settlement`, not because a label reads `T1`. That is `DEC-HW-003`'s
   * > checkable test — *"no code may branch on the tier to decide whether a piece of hardware
   * > EXISTS"* — applied to the one producer that still failed it.
   *
   * A getter for `tier`'s reason, one field up: the assignment will one day arrive over a config
   * plane, and a value captured at construction would freeze this device on whatever was set at
   * boot.
   *
   * ⚠ **It replaces the tier gate on `settled` and NOTHING else.** `printEvent`'s
   * `kot.printed → in_prep` half is `02-F31`'s other rule, `03-F52` says nothing about it, and
   * moving it too would auto-advance the lines a `03-F51` screen-only station's bump owns
   * (`03-F19`).
   */
  readonly serveOwner: () => ServeSignalOwner;
  /**
   * The append. **This is the RAW gateway and not `authorizeWrites`, and that is deliberate.**
   *
   * `WRITE_ACTIONS` in `authorize.ts` maps event types to matrix actions and fails closed, and
   * `order.line_state_changed` is not in it — so routing this through the authorized surface would
   * DENY it. That is the correct answer for the renderer's channel and the wrong one here, for the
   * reason `main/index.ts` already gives about `kot.printed`: these are **device facts nobody
   * performs**. Commandment 8 protects a human act, and `02-F31`'s auto-advance is defined by the
   * absence of one — *"where no device exists to signal them"*. The two human acts that DO produce
   * this event type (`03-F16` ready-marking, `03-F19` a station bump) are not built and will need
   * their own matrix row when they are; this must not be read as a precedent for those.
   *
   * ── `04-F27` (c): `caused_by` is the FIRST argument, and it is REQUIRED ──────────────────────
   *
   * The host's closure appended through a SESSION-READING append until August 2026, so the edge
   * this module emits named whoever happened to be signed in at the counter: a waiter's confirm
   * at a `04-F21` pad wrote an `order.line_state_changed` naming the CASHIER, and named nobody
   * when the till was locked. The actor of a consequence is the actor of the act that caused it,
   * so it arrives as data with the call and is never read from ambient state.
   *
   * **First and required, never trailing and optional**, on `01-F60`'s precedent about
   * completeness inputs: a trailing parameter is satisfied by every existing two-parameter
   * closure, so a host that quietly ignored it would still compile and go on stamping the
   * session — the defect unchanged, behind a signature that looks fixed.
   */
  readonly append: (
    caused_by: string | null,
    type: string,
    payload: LineStateChangedPayload,
  ) => void;
};

export type LineAdvance = {
  /**
   * `01 §4`'s first transition — `placed → confirmed` — on the device that performed the confirm.
   *
   * **This is an INTERPRETATION and the simpler alternative is named**, because `02-F31` does not
   * mention it. The reasoning, in the order it decides:
   *
   *  - `01 §4` declares the canonical chain `placed → confirmed → in_prep → ready → …` and
   *    `LEGAL_NEXT` encodes it, so `confirmed` is the ONLY legal predecessor of `in_prep`.
   *  - Therefore `02-F31`'s own rule — `kot.printed` → lines `in_prep` — **cannot fire at all**
   *    unless something first moves the lines to `confirmed`. An implementation that skipped this
   *    would emit an edge the fold refuses and the tier work would close nothing.
   *  - Nothing else in the product can emit it: `order.confirmed` is appended by this POS, on
   *    every tier, and `merge.ts`'s `order.confirmed` case sets the confirm ANCHOR (`age_basis`,
   *    `confirmed_at`) and deliberately touches no line state.
   *
   * **It is NOT tier-gated**, and that is the interpretation. `02-F31`'s auto-advance is defined by
   * *"where no device exists to signal them"*, and the device that signals a confirm is this one —
   * so a confirm edge is the confirming device's own act rather than a stand-in for an absent one.
   * The simpler alternative is to gate it on T1 with the rest; it was not taken because it would
   * leave a T2 branch's pass screen (`03-F15`'s *"2 of 3 items ready"*) reading `placed` for lines
   * the counter has confirmed, which is a worse answer to a question `02-F31` was not asked.
   *
   * A reviewer who disagrees should say so: this is the one behaviour here that no FR states
   * outright, and it is deliberately in its own method so it can be gated in one line.
   */
  readonly confirmed: (order_id: string, caused_by: string | null) => void;
  /**
   * `02-F31` — *"`kot.printed` → lines `in_prep`"*, on T1 only.
   *
   * **It takes the KOT printer's whole `append` callback signature, not an order id, and that is
   * deliberate.** That callback carries three event types — `kot.printed`, `kot.print_failed` and
   * `audit.print_acknowledged` — so the discriminating branch has to live somewhere, and putting
   * it in the host would put it where no test can drive it: a suite would have to hand-copy the
   * branch, which is `K-3`'s dead-oracle defect (an oracle asserting against its own copy of the
   * thing it exists to pin). Measured — with the guard in `index.ts`, the mutant that advances a
   * line on a FAILED print was killed by a source-string assertion and by nothing behavioural.
   *
   * Advancing because a ticket did NOT print is the exact inversion of the FR, and `01-F1` makes
   * it permanent.
   *
   * **Order-granular, because `kot.printed` is.** `03-F2` fans one confirm out to N station
   * tickets and this device prints one per station, but the event's payload is `{ order_id }` with
   * no station, so the first station's print advances every line of the order. That is faithful to
   * `02-F31`, which speaks of *"lines"* and not of a station's lines; per-station precision would
   * need `station` on the `kot.printed` payload, which is a `packages/domain` registry change
   * (protected path) and belongs with `03-F22`'s per-station printer-vs-screen choice.
   *
   * The second and third stations' prints are **harmless rather than idempotent-by-luck**:
   * `LEGAL_NEXT.in_prep` excludes `in_prep`, so `advanceEdgesFor` finds no eligible line and
   * appends nothing at all. Nothing is written twice and nothing is refused loudly.
   */
  readonly printEvent: (type: string, payload: unknown) => void;
  /**
   * `02-F31` — *"settlement → lines `served` — **dine-in/takeaway/pickup only**"*, where
   * `03-F52`'s serve-signal owner is `settlement`.
   *
   * **This half was BLOCKED IN THE KERNEL until August 2026 and is now open by ruling**, not by a
   * session's judgement: `01 §4`'s chain reached `served` only from `ready` while `02-F31`'s next
   * clause forbids fabricating `ready`, so the two clauses could not both hold. `DEC-HW-002` ruled
   * `LEGAL_NEXT.in_prep` gains `served` — the honest model of a restaurant with no pass, where a
   * line goes from being cooked to being handed over with no observed moment of readiness. The
   * reasoning lives on the table itself in `packages/domain/src/states.ts`.
   *
   * **Order-granular and order-id shaped**, matching `receipts.settled(order_id)` beside it at the
   * same call site rather than taking the whole callback the way `printEvent` does. There is no
   * discriminating branch to hand-copy here: `index.ts` already narrows `payment.recorded` once for
   * the receipt, and both consumers hang off that single narrowing.
   *
   * **⚠ ASSIGNMENT-gated, and this line USED to read *"tier-gated, exactly as `printEvent` is"*.**
   * `03-F52` overturned it: *"The tier stops being an input."* The rule it replaces was right
   * about the harm — on T2/T3 a pass screen owns the line's service state and auto-advancing
   * would race the human about to act — and wrong about the question, because a tier label is a
   * proxy for *"is there a device that signals handover"* and `DEC-HW-003` forbids branching on
   * the proxy (*"no code may branch on the tier to decide whether a piece of hardware EXISTS"*).
   * `03-F52` names the fact directly: this till emits because the branch's serve-signal owner is
   * `settlement`. Behaviour at a branch that has configured nothing is unchanged, because the
   * assignment's assumed value is `settlement` — see `@restos/device-config`'s `serve-signal.ts`,
   * where that choice is argued rather than defaulted.
   *
   * The half `03-F52` did NOT move is `printEvent`'s: `kot.printed → in_prep` is still tier-gated
   * and `__acceptance__/serve-signal-settlement.test.ts` §C is the assertion that this was a move
   * and not a deletion.
   *
   * **What it does NOT do, measured rather than assumed:**
   *
   *  - It never fabricates `ready` (`02-F31`, and `03-F26` depends on it — T1 produces no ready
   *    samples, which is why T1 restaurants honestly get aging timers and never learned ETAs). The
   *    edge emitted is `in_prep → served`, one step, and `advanceEdgesFor`'s legality filter is
   *    `domain`'s own predicate so it cannot disagree with the fold.
   *  - It advances **nothing** on a line still at `confirmed` — `LEGAL_NEXT.confirmed` excludes
   *    `served`, so `advanceEdgesFor` finds no eligible line and appends no event at all. That is
   *    the state of a till whose KOT never printed, and it is `01 §4`'s answer rather than a gap:
   *    `restaurant-os.md:47` defines T1 as *"terminal + printers"*, so a printerless branch is
   *    outside the corpus (`DEC-HW-001`'s second open sub-question asks whether a tier below T1
   *    exists). Widening the table again to reach it would be inventing past the ruling.
   *  - It writes **no `preds`**, and the consequence is measured and named on `advanceEdgesFor`.
   */
  readonly settled: (order_id: string, caused_by: string | null) => void;
};

/** `01 §4` vocabulary, named once so a typo cannot make this module advance nothing. */
const CONFIRMED: OrderLineState = "confirmed";
const IN_PREP: OrderLineState = "in_prep";
/** `DEC-HW-002` — `01 §4`'s terminal service state for dine-in, takeaway and pickup. */
const SERVED: OrderLineState = "served";
const LINE_STATE_CHANGED = "order.line_state_changed";
/** `01 §4`'s print fact, and the ONLY member of the KOT callback that advances anything. */
const KOT_PRINTED = "kot.printed";

export const createLineAdvance = (deps: LineAdvanceDeps): LineAdvance => {
  const advance = (order_id: string, to: OrderLineState, caused_by: string | null): void => {
    const order = deps.store.openOrders().find((row) => row.order_id === order_id);
    // A settled or unknown order is not an error here. `01-F17` — nothing about a line's workflow
    // may cost the operator the act that triggered it, and both callers are downstream of an
    // append that has already landed.
    if (order === undefined) return;
    const payload = advanceEdgesFor(order, to);
    if (payload === null) return;
    deps.append(caused_by, LINE_STATE_CHANGED, payload);
  };

  return {
    confirmed: (order_id, caused_by) => advance(order_id, CONFIRMED, caused_by),
    printEvent: (type, payload) => {
      if (type !== KOT_PRINTED) return;
      if (!autoAdvancesLines(deps.tier())) return;
      // The payload has already been through `parseEvent` by the time the ledger holds it, but
      // this is the printer's own callback and not the store's, so the narrowing is real — and it
      // must survive a null: `01-F17`, the print is downstream of a sale that already completed.
      const order_id = (payload as { order_id?: unknown } | null)?.order_id;
      // `04-F27` (c) — **NOBODY, and that is an answer rather than a missing one.** This edge
      // fires because a PRINTER answered, which is `02-F31`'s own case: *"line statuses
      // auto-advance where no device exists to signal them"*. There is no human act to attribute
      // it to, and whoever happens to be signed in at the counter when the paper came out is not
      // one — she may have gone home between the confirm and the print, and `01-F1` would keep
      // her name on it. Until August 2026 the host's closure read the session here.
      if (typeof order_id === "string") advance(order_id, IN_PREP, null);
    },
    settled: (order_id, caused_by) => {
      // `03-F52` — the trigger is the ASSIGNMENT and no longer the tier. Read INSIDE the method
      // for `printEvent`'s reason: a host cannot forget it and no suite can assert against a copy
      // of it. `settlement` is `03-F52`'s own word for *"no device signals handover"*, so this is
      // `02-F31` unchanged in behaviour and changed in what asks the question.
      if (deps.serveOwner() !== "settlement") return;
      const order = deps.store.openOrders().find((row) => row.order_id === order_id);
      // `01-F17` — this hangs off a `payment.recorded` that has already landed; an order this
      // device cannot read must never cost the customer the settlement they just made.
      if (order === undefined) return;
      // `01 §4`'s delivery rule and `01-F33`'s completion question, both on one exported predicate
      // so this branch is the one a test drives rather than a copy of it.
      if (!advancesOnSettlement(order)) return;
      const payload = advanceEdgesFor(order, SERVED);
      if (payload === null) return;
      deps.append(caused_by, LINE_STATE_CHANGED, payload);
    },
  };
};

/**
 * # ✅ `02-F31`'s SETTLEMENT HALF — the kernel conflict, and the ruling that closed it
 *
 * **Kept as a worked example rather than deleted.** The block that stood here said the settlement
 * half was BLOCKED and must not be built, and it was right for as long as it stood; the shape of
 * the argument is why `DEC-HW-002` exists, and a reader who finds `LEGAL_NEXT.in_prep` carrying
 * `served` should be able to find out here why it does.
 *
 * `02-F31` requires *"settlement → lines `served` — **dine-in/takeaway/pickup only**"* **and**, in
 * the very next clause, *"no `ready` state is fabricated"* (with `03-F26` giving the reason: T1
 * branches honestly produce no ready samples, so fabricating one would poison the timing pipeline
 * with invented data). Those two clauses together require the edge `in_prep → served`, and until
 * August 2026 `packages/domain/src/states.ts` forbade it — `LEGAL_NEXT.in_prep` was
 * `["ready", "voided", "cancelled"]`, so `served` was reachable only from `ready`.
 *
 * **Every route out was checked and each failed for a different reason. They are worth keeping,
 * because three of them are still wrong and a later session may reach for one:**
 *
 *  - `from_states: ["ready"], to: "served"` on a line that is at `in_prep` — legal on its face, so
 *    it would *work*; and it is a lie about a state the branch never reached. `projectLine`'s
 *    `inconsistent_predecessor` check catches it the moment `preds` names the real `in_prep` edge,
 *    and with `preds: []` it is simply a false statement written into an append-only ledger.
 *    **Still forbidden.**
 *  - The adoption clause (`|from_states| > 1 ∧ to ∈ from_states`) is *"a choice among already-
 *    emitted terminals"* and does not apply to a first transition. **Still true.**
 *  - Emitting `ready` first is what `02-F31`'s own next clause forbids by name, and `03-F26`
 *    depends on the prohibition. **Still forbidden — nothing in this module emits `ready`.**
 *  - Filtering by legality and letting the trigger emit nothing is the worst option available: it
 *    looks built, every gate stays green, and no line ever reaches `served`. That is this wave's
 *    named defect manufactured deliberately. **Still the trap**, and it is now guarded from the
 *    other side: `line-advance-seam.test.ts` §D asserts the trigger is PRESENT and that it moves a
 *    real line through the real fold, so a regression to "wired but inert" reddens.
 *  - `from_states: ["in_prep"], to: "served"` against the OLD table — `edgeLegal` refused it, the
 *    fold recorded `illegal_transition`, and `01-F1` made the bad edge permanent. **This is the one
 *    the ruling changed**, and it changed it in the table rather than at the emitter.
 *
 * ## RULED — `specs/DECISIONS.md` → `DEC-HW-002` (August 2026), shape (a)
 *
 * `LEGAL_NEXT.in_prep` gains `served`. Not as a concession to T1 but because it is the honest
 * model: **in a restaurant with no pass, a line goes from being cooked to being handed over with no
 * observed moment of readiness**, and the table as written encoded *"a pass exists to observe
 * readiness"* as universal law — `DEC-HW-001`'s T3-assumed-universal error reaching the kernel.
 *
 * **The refused alternative is the one that looks safest, and the reason is a law and not a
 * preference.** A tier-conditional legality is a standing-law-1 violation: `26 §7` row 65 makes
 * legality a pure function of ONE edge's payload, so gating it on the branch's tier would make a
 * projected value depend on the reading device's configuration and convergence would depend on who
 * is looking (`01-F34`). Nothing in this module reads tier to decide LEGALITY — `autoAdvancesLines`
 * gates *whether this device emits at all*, which is a producer's question, and the emitted edge is
 * judged by `domain`'s own predicate exactly as every other edge here is.
 *
 * Permissive legality is not a mandate: a T2/T3 branch has a device that emits `ready` (`03-F24`),
 * `LineAdvance.settled` refuses to run on those tiers, and the skip's cost — that a T2 KDS bug
 * could also jump `ready` — was weighed and accepted in the ruling.
 *
 * ## What the ruling did NOT license
 *
 *  - **`confirmed → served` is still illegal**, and is left illegal. A till whose KOT never printed
 *    holds its lines at `confirmed` and settlement moves nothing — measured, not assumed. That is
 *    `01 §4`'s answer and not a gap: `restaurant-os.md:47` defines T1 as *"terminal + printers"*,
 *    so a printerless branch is outside the corpus, and `DEC-HW-001`'s second open sub-question is
 *    precisely *"is there a tier BELOW T1?"*. It is the founder's, not a session's.
 *  - **The delivery exclusion is not a legality question and is not implemented as one.** `01 §4`
 *    sends delivery down `picked_up → delivered` instead, and a delivery line at `ready` could
 *    legally reach `served` — so `LEGAL_NEXT` cannot express the rule and an explicit producer-side
 *    allowlist does. See `SETTLEMENT_SERVES` and `advancesOnSettlement` above.
 */
