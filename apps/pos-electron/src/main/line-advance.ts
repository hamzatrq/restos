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

import { applyLineState, type OrderLineState } from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import { autoAdvancesLines, type HardwareTier } from "./hardware-tier";

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
 *    change the watermark. Retirement only decides anything when a TERMINAL head is involved — and
 *    the terminal half of `02-F31` is blocked (below), so this emitter never produces one.
 *  - `__acceptance__/line-advance.test.ts` folds the emitted payload through the **real** merge
 *    engine and asserts the projected state AND that the anomaly map is empty. A wrong `preds`
 *    would show up there as `inconsistent_predecessor` or `terminal_regression`.
 *
 * When the settlement half is unblocked this becomes load-bearing and must be revisited: a
 * terminal edge with empty `preds` leaves the preceding non-terminal head alive and `projectLine`
 * flags it `terminal_regression`, on every settled order.
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
   */
  readonly append: (type: string, payload: LineStateChangedPayload) => void;
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
  readonly confirmed: (order_id: string) => void;
  /**
   * `02-F31` — *"`kot.printed` → lines `in_prep`"*, on T1 only.
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
  readonly kotPrinted: (order_id: string) => void;
};

/** `01 §4` vocabulary, named once so a typo cannot make this module advance nothing. */
const CONFIRMED: OrderLineState = "confirmed";
const IN_PREP: OrderLineState = "in_prep";
const LINE_STATE_CHANGED = "order.line_state_changed";

export const createLineAdvance = (deps: LineAdvanceDeps): LineAdvance => {
  const advance = (order_id: string, to: OrderLineState): void => {
    const order = deps.store.openOrders().find((row) => row.order_id === order_id);
    // A settled or unknown order is not an error here. `01-F17` — nothing about a line's workflow
    // may cost the operator the act that triggered it, and both callers are downstream of an
    // append that has already landed.
    if (order === undefined) return;
    const payload = advanceEdgesFor(order, to);
    if (payload === null) return;
    deps.append(LINE_STATE_CHANGED, payload);
  };

  return {
    confirmed: (order_id) => advance(order_id, CONFIRMED),
    kotPrinted: (order_id) => {
      if (!autoAdvancesLines(deps.tier())) return;
      advance(order_id, IN_PREP);
    },
  };
};

/**
 * # ⚠ `02-F31`'s SETTLEMENT HALF IS BLOCKED IN THE KERNEL — a spec conflict, not a gap
 *
 * `02-F31` requires *"settlement → lines `served` — **dine-in/takeaway/pickup only**"* **and**, in
 * the very next clause, *"no `ready` state is fabricated"* (with `03-F26` giving the reason: T1
 * branches honestly produce no ready samples, so fabricating one would poison the timing pipeline
 * with invented data).
 *
 * Those two clauses together require the edge `in_prep → served`. **`01 §4` forbids it.** The
 * canonical chain is `placed → confirmed → in_prep → ready →` terminal, and
 * `packages/domain/src/states.ts` encodes it: `LEGAL_NEXT.in_prep` is `["ready", "voided",
 * "cancelled"]`. `served` is reachable only from `ready`.
 *
 * **Every route was checked and each fails for a different reason:**
 *
 *  - `from_states: ["in_prep"], to: "served"` — `edgeLegal` refuses it, the fold records
 *    `illegal_transition`, the line stays at `in_prep`, and `01-F1` makes the bad edge permanent.
 *    A T1 restaurant would accumulate one for every order it ever sold.
 *  - `from_states: ["ready"], to: "served"` on a line that is at `in_prep` — legal on its face, so
 *    it would *work*; and it is a lie about a state the branch never reached. `projectLine`'s
 *    `inconsistent_predecessor` check catches it the moment `preds` names the real `in_prep` edge,
 *    and with `preds: []` it is simply a false statement written into an append-only ledger.
 *  - The adoption clause (`|from_states| > 1 ∧ to ∈ from_states`) is *"a choice among already-
 *    emitted terminals"* and does not apply to a first transition.
 *  - Emitting `ready` first is what `02-F31`'s own next clause forbids by name.
 *  - Filtering by legality and letting the settlement trigger emit nothing (which
 *    `advanceEdgesFor` would do quite happily) is the worst option available: it looks built,
 *    every gate stays green, and no line ever reaches `served`. That is this wave's named defect
 *    manufactured deliberately, so the trigger is **not wired at all**.
 *
 * **What a resolution needs, and why it is not a session's call** (commandment 2 and commandment 9:
 * order states live in `01 §4` only, and `specs/DECISIONS.md` carries no row on this). Three
 * candidate shapes, none chosen here:
 *
 *  (a) `LEGAL_NEXT` gains `in_prep → served` and `01 §4`'s chain records the T1 skip. This is the
 *      only shape consistent with the merge design's own law that **legality is a pure function of
 *      one edge's payload** (matrix row 65) — a tier-conditional legality is not expressible,
 *      because the fold cannot know the emitting branch's tier. Its cost is that the skip becomes
 *      legal on every tier, so a T2 KDS bug could also jump `ready`.
 *  (b) `02-F31`'s settlement clause is narrowed to lines already at `ready`, which makes T1 lines
 *      terminate at `in_prep` — contradicting the FR's own text and leaving `03-F17`'s *"an order
 *      leaves the queue when all its lines reach a terminal service state"* unreachable in T1.
 *  (c) A different terminal for T1 settlement. This invents a state and commandment 2 forbids it.
 *
 * `packages/domain/src/states.ts` is a protected path with its own oracle
 * (`__acceptance__/line-states.test.ts`), so (a) is a spec PR plus a senior review, not an edit.
 *
 * **Nothing in the delivery rule is built either, and it is part of this blocked half.** `01 §4`
 * is canonical — delivery lines are *"rider-driven only — never advanced by payment/settlement"* —
 * and `02-F31` repeats it. When the settlement trigger is wired it must exclude every line of an
 * order whose type is delivery, and there is currently no code anywhere expressing that.
 *
 * **This block is load-bearing and is asserted against.** `__acceptance__/line-advance-seam.test.ts`
 * §D is an anti-scope guard on the shape `orders-tab.dom.test.tsx` §E uses for `C20`/`C32`: it
 * fails if a settlement trigger appears in `index.ts` before the conflict is ruled on, and it
 * pins that `advanceEdgesFor(..., "served")` refuses an `in_prep` line rather than lying about it.
 * Delete the guard in the same change that closes the conflict, and not before.
 */
