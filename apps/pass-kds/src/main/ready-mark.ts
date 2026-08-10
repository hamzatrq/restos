import { applyLineState, LEGAL_NEXT, type OrderLineState } from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import { KITCHEN_DONE, linesOf } from "./pass-queue";
import type { ReadySignalPolicy } from "./ready-signal";

/**
 * # `03-F16` / `03-F19` / `03-F24` — THE READY-MARK, AND THE WALK IT HAS TO TAKE
 *
 * > 03-F16 Ready-marking: per line and whole-order, one tap → `order.line_state_changed` to
 * > `ready` with actor.
 *
 * This is the **second production emitter** of `order.line_state_changed` in the product, and the
 * **first human one**: `apps/pos-electron/src/main/line-advance.ts` is `02-F31`'s auto-advance,
 * which is defined by the *absence* of a person. Everything structural here is that module's
 * shape deliberately — `advanceEdgesFor`'s three rules, `preds: []` and its stated cost, the
 * legality predicate borrowed from `domain` so an emitter can never disagree with the fold — and
 * the differences are the interesting part.
 *
 * ## ⚠ THE FINDING THAT SHAPES THIS FILE: `ready` IS NOT REACHABLE FROM WHERE THE LINES ARE
 *
 * `LEGAL_NEXT.confirmed` is `["in_prep", "voided", "cancelled"]`. **`confirmed → ready` is
 * illegal.** And measured 2026-08-10, on the branch this app is FOR, that is exactly where every
 * line sits:
 *
 *  - `02-F31`'s `kot.printed → in_prep` advance is **tier-gated to T1** (`autoAdvancesLines`),
 *    and a branch with a pass screen is T2 by `02-F31`'s own detection rule. So on a T2 branch
 *    with a printer, nothing moves a line to `in_prep`.
 *  - `03-F51` makes a station routed `screen` **enqueue no print job at all** — *"no bytes, no
 *    attempt"* — so there is no `kot.printed` to advance from, at ANY tier. That is the
 *    printerless kitchen `DEC-HW-001` exists for, and it is the configuration `03-F51`'s own
 *    closing paragraph says this surface is owed for: *"a screen-only station's lines advance
 *    when the screen bumps them (`03-F19`)"*.
 *
 * So a ready-mark that emitted only `in_prep → ready` would find no eligible line and append
 * nothing — **wired and emitting nothing, which `DEC-HW-002` calls the worst option available,
 * because it looks finished with every gate green.** This wave's named defect, manufactured.
 *
 * ## THE RESOLUTION: THE SHORTEST LEGAL WALK, EMITTED AS ITS OWN EDGES
 *
 * A bump on a line at `confirmed` emits **two** events — `confirmed → in_prep`, then
 * `in_prep → ready` — both legal, both attributed to the same act. It is not a jump and it is not
 * a lie: `from_states` on each edge is a state the branch genuinely reaches, the second one
 * because the first edge put it there.
 *
 * **Why that is honest, stated so it can be argued with.** A cook pressing DONE is asserting that
 * this food was cooked and is now ready. *Having been in prep* is entailed by that assertion, not
 * added to it. `01 §4`'s chain is the model of what happened, and a restaurant with no printer
 * simply had no separate moment at which anyone observed cooking start — which is exactly
 * `DEC-HW-002`'s argument for `in_prep → served`, one edge along, and the same T3-assumed-
 * universal error it names.
 *
 * **Three alternatives, each refused on a resolving FR rather than on preference:**
 *
 *  1. **`from_states: ["in_prep"]` on a line the fold projects as `confirmed`** — legal on its
 *     face, and `line-advance.ts` names it first among the routes that are *"still wrong"*: a
 *     false statement about a state the branch never reached, permanent under `01-F1`. **This
 *     module never does that**: every `from_states` it writes is the projection it just read, or
 *     the target of an edge it is emitting in the same act.
 *  2. **Widen `LEGAL_NEXT.confirmed` to include `ready`** — a `packages/domain` change, SACRED
 *     (`18 §2`) and protected (commandment 10), needing a ruling. It also records *less* than the
 *     walk does: the ledger would carry a jump where the walk carries both moments. `DEC-HW-002`
 *     took a table change because no walk was available (nothing may fabricate `ready`); here one
 *     is, so the table needs no amendment and none is proposed.
 *  3. **Bump only what is legal and leave the rest** — the inert screen above.
 *
 * ## ⚠ WHAT THIS MODULE MUST NEVER DO, AND THE FR THAT SAYS SO
 *
 * `02-F31`: *"no `ready` state is fabricated"*, and `03-F26` gives the reason — *"T1 branches
 * produce no ready-marks, so they honestly produce no samples"*. **That prohibition is about a
 * device inventing a signal nobody gave, and it is not weakened here**: every edge this module
 * emits is downstream of a human pressing a control on a screen that `03-F24` assigns the signal
 * to. A ready-mark from a real pass screen is precisely the sample `03-F26` is waiting for — this
 * surface is what turns a T1 restaurant's honest absence of ETAs into a T2 restaurant's real
 * ones. Nothing here may ever be called from a timer, from a fold, or from a print outcome.
 *
 * ## `preds: []`, and why the cost is smaller here than for `02-F31`'s settlement half
 *
 * The emitter cannot build the head set: `BilledLineCell` carries per-line `states` and no head
 * edge ids (`AvailabilityRow.head_ids_json` is the precedent for closing it, and it is a
 * protected-path fold change). `line-advance.ts` measured what empty `preds` costs — two
 * `terminal_regression` flags per line — and **that measurement was on a TERMINAL edge**.
 * `ready` is not terminal: `projectLine` takes ≼-max over all legal edges rather than over heads,
 * so an unretired lower edge cannot move a non-terminal watermark, and the anomaly map stays
 * empty. `__acceptance__/ready-mark.test.ts` folds these payloads through the real merge engine
 * and asserts exactly that, rather than assuming it.
 */

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

export const READY: OrderLineState = "ready";
const LINE_STATE_CHANGED = "order.line_state_changed";

/**
 * The shortest legal walk from `from` to `to`, as the list of states it passes THROUGH, inclusive
 * of `to` and exclusive of `from`. Empty when there is no walk (a terminal, or `from === to`).
 *
 * A breadth-first search over `LEGAL_NEXT` rather than a hardcoded chain, because the chain is
 * the kernel's to change: `DEC-HW-002` added an edge to this table in August 2026 and a hardcoded
 * `["confirmed", "in_prep", "ready"]` here would have gone on being right by luck. The table is
 * the authority and this reads it.
 */
export const walkTo = (from: OrderLineState, to: OrderLineState): readonly OrderLineState[] => {
  if (from === to) return [];
  const seen = new Set<OrderLineState>([from]);
  const queue: (readonly OrderLineState[])[] = [[from]];
  while (queue.length > 0) {
    const path = queue.shift();
    if (path === undefined) break;
    const head = path[path.length - 1];
    if (head === undefined) break;
    for (const next of LEGAL_NEXT[head]) {
      if (seen.has(next)) continue;
      const extended = [...path, next];
      if (next === to) return extended.slice(1);
      seen.add(next);
      queue.push(extended);
    }
  }
  return [];
};

/**
 * `01 §4`'s chain order, used to sequence the events one bump produces.
 *
 * Emission order is a **presentation** decision and not a correctness one — the fold is
 * order-independent by construction (`01-F34`), so the pair `{confirmed→in_prep, in_prep→ready}`
 * projects `ready` whichever arrives first. It is ordered anyway because an append-only ledger is
 * read by humans too, and a log that records cooking finishing before it started is a log that
 * costs somebody an hour one day.
 */
const CHAIN: readonly OrderLineState[] = [
  "placed",
  "confirmed",
  "in_prep",
  "ready",
  "served",
  "picked_up",
  "delivered",
];

/**
 * Build the event(s) that move the named lines of one order to `ready`.
 *
 * **A pure function of the projection**, so the whole policy is testable without a store, a
 * screen or an Electron app. The three rules are `advanceEdgesFor`'s, restated because they are
 * the rules and not the implementation:
 *
 *  1. **A contested line is left alone.** `merge.ts` renders a contested line as its full
 *     terminal MVR set and `01-F31`'s rule is that *"a fold never picks a winner"*. An emitter
 *     that picked one would launder a disputed line into a decided one, permanently.
 *  2. **Only a LEGAL edge is emitted**, judged by `domain`'s own `applyLineState` — the same
 *     predicate `merge.ts`'s `edgeLegal` uses, so this cannot drift from the fold's answer.
 *  3. **`from_states` is what the fold actually projects** (or, for the second hop of a walk, the
 *     target of the first hop this same act emits). Never an assumption about what a line
 *     "should" be.
 *
 * @param line_ids the lines to mark, or `null` for `03-F16`'s whole-order tap — which `03-F24`
 *   defines as *"an owner's 'order ready' mark simply marks all remaining lines at once"*, so it
 *   is the same code path with a wider selection and not a second act.
 */
export const readyEdgesFor = (
  order: { readonly order_id: string; readonly json_lines: string },
  line_ids: readonly string[] | null,
): readonly LineStateChangedPayload[] => {
  const selected = line_ids === null ? null : new Set(line_ids);
  // The state each line is CURRENTLY believed to be in, advanced as this act's own edges are
  // planned — so the second hop's `from_states` is the first hop's `to` and never a guess.
  const at = new Map<string, OrderLineState>();
  const paths = new Map<string, readonly OrderLineState[]>();
  for (const line of linesOf(order.json_lines, (id) => id)) {
    if (selected !== null && !selected.has(line.line_id)) continue;
    // Rule 1 — a contested line has no single projected state and is not ours to decide.
    if (line.state === null) continue;
    // Already done, or past the pass entirely. `KITCHEN_DONE` covers the terminals and `ready`
    // is excluded here because re-marking a ready line appends an edge that changes nothing.
    if (line.state === READY || KITCHEN_DONE.has(line.state)) continue;
    const path = walkTo(line.state, READY);
    if (path.length === 0) continue;
    at.set(line.line_id, line.state);
    paths.set(line.line_id, path);
  }
  const events: LineStateChangedPayload[] = [];
  for (const to of CHAIN) {
    const line_context: Record<string, LineEdgeContext> = {};
    for (const [line_id, path] of paths) {
      if (!path.includes(to)) continue;
      const from = at.get(line_id);
      if (from === undefined) continue;
      // Rule 2 — `domain`'s own legality predicate. A walk step that this refuses is a bug in the
      // walk, and refusing here rather than trusting the walk is what keeps the two in agreement.
      if (!applyLineState(from, to).applied) continue;
      line_context[line_id] = { to, from_states: [from], preds: [] };
      at.set(line_id, to);
    }
    const ids = Object.keys(line_context);
    if (ids.length === 0) continue;
    // `line_ids` is `registry.ts`'s legacy field and `merge.ts` reads only `line_context`; it is
    // derived from the same object so the two cannot disagree.
    events.push({ order_id: order.order_id, line_ids: ids, state: to, line_context });
  }
  return events;
};

export type ReadyMarkDeps = {
  /** The projection this reads `from_states` out of. Narrowed to one method on purpose. */
  readonly store: Pick<DeviceStore, "openOrders">;
  /**
   * `03-F24`'s layer-2 assignment, as a GETTER rather than a value.
   *
   * A getter for `LineAdvanceDeps.tier`'s reason: the assignment will one day arrive over a
   * config plane, and a value captured at construction would freeze this device on whatever was
   * set at boot. It costs nothing today and it is the difference between a seam and a snapshot.
   */
  readonly policy: () => ReadySignalPolicy;
  /**
   * The append.
   *
   * ⚠ **There is no `authorizeWrites` to route this through, and that is a measured fact rather
   * than an omission.** `PERMISSION_ACTIONS` has no line-state member and `apps/pos-electron`'s
   * `WRITE_ACTIONS` fails closed, so the matrix would DENY a ready-mark today. `03-F24` puts the
   * authorization on a **layer-2 role assignment** instead — see `ready-signal.ts` for the whole
   * argument, for why inventing a `PermissionAction` here would be a commandment-2 violation on a
   * SACRED path, and for the gap that leaves (`03-F16`'s *"with actor"* is half met: this app has
   * no `01-F26` PIN session, so `actor_user_id` is `null` on every edge it writes).
   */
  readonly append: (type: string, payload: LineStateChangedPayload) => void;
};

export type ReadyMarkResult =
  /** `03-F24` — this surface is read-only for states at this branch. Nothing was appended. */
  | { readonly ok: false; readonly reason: "not_the_owner"; readonly owner: string }
  /** The order is not on this device, or every selected line was already done or contested. */
  | { readonly ok: false; readonly reason: "nothing_to_mark" }
  | { readonly ok: true; readonly events: number; readonly lines: number };

export type ReadyMark = {
  /** `03-F16` — per line and whole-order, one tap. `line_ids: null` is the whole-order tap. */
  readonly mark: (order_id: string, line_ids: readonly string[] | null) => ReadyMarkResult;
};

export const createReadyMark = (deps: ReadyMarkDeps): ReadyMark => ({
  mark: (order_id, line_ids) => {
    // `03-F24` — enforced in MAIN and re-read on every call, because the renderer's claim is
    // never trusted (commandment 8's property) and because a read-only surface that still
    // appended would make the assignment decorative.
    const policy = deps.policy();
    if (!policy.maySignal) return { ok: false, reason: "not_the_owner", owner: policy.owner };
    const order = deps.store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return { ok: false, reason: "nothing_to_mark" };
    const events = readyEdgesFor(order, line_ids);
    if (events.length === 0) return { ok: false, reason: "nothing_to_mark" };
    for (const payload of events) deps.append(LINE_STATE_CHANGED, payload);
    const lines = new Set(events.flatMap((e) => e.line_ids)).size;
    return { ok: true, events: events.length, lines };
  },
});
