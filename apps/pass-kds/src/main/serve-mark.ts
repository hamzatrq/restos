import type { ServeSignalOwner, ServeSignalPolicy } from "@restos/device-config";
import { applyLineState, type OrderLineState } from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import type { LineEdgeContext, LineStateChangedPayload } from "./ready-mark";

/**
 * # `03-F52` — THE HANDOVER, AND EVERY WAY OF BUILDING IT THAT THE FR FORBIDS BY NAME
 *
 * > 03-F52 the act is an explicit HANDOVER, never a widening of the ready-mark and never a
 * > widening of settlement.
 *
 * This is the **third** production emitter of `order.line_state_changed` and the second human one.
 * `ready-mark.ts` is its sibling and this file is deliberately its shape — a pure edge builder, a
 * getter for the layer-2 assignment, an `append` that is the raw ledger — and every place the two
 * differ is a place the FR made them differ.
 *
 * ## ⚠ WHAT IT MUST NEVER DO, AND THE SENTENCE THAT SAYS SO
 *
 * > 03-F52 **It marks only lines already `ready`, and walks only `ready → served`.** The
 * > `in_prep → served` edge exists for `DEC-HW-002`'s no-pass case alone; reaching `served` from
 * > the pass by any route that skips `ready` destroys `03-F26`'s prep-time sample and `03-F15`'s
 * > assembly count, and **a shortest-path walk over `LEGAL_NEXT` finds exactly that route.**
 *
 * So **`walkTo` is not called here and must never be**. It is exported one file over, it is the
 * obvious reach for a session generalising from `ready-mark.ts`, and it answers
 * `walkTo("in_prep", "served") === ["served"]` — one hop, legal, and a permanent lie about a plate
 * nobody ever saw finished. `handover.test.ts` §B drives the shipped `walkTo` to demonstrate the
 * trap rather than describe it.
 *
 * The consequences are not stylistic. `03-F26` samples prep time from the `ready` edge and a
 * kitchen that never emits one honestly produces no ETAs (`02-F31`: *"no `ready` state is
 * fabricated"*); `03-F15`'s *"2 of 3 ready, waiting on naan"* is counted off the same states. An
 * order that jumps to `served` leaves both with nothing, silently and permanently (`01-F1`).
 *
 * ## ONE PRESS, ONE ORDER, EVERY REMAINING `ready` LINE
 *
 * > One press marks every remaining `ready` line at once.
 *
 * `handOver` therefore takes **no `line_ids`**, unlike `03-F16`'s per-line ready-mark: `03-F24`'s
 * canonical rule for an owner's order-level mark is the whole of the act here, and a per-line
 * handover would be claiming that half a plate reached the customer.
 *
 * A **mixed** ticket moves its `ready` lines and leaves the rest exactly where they are — the
 * reading under which the FR's *"lines still `in_prep` are untouched"* has work to do — and the
 * ticket stays on the pass, which is `03-F17` and not a refusal.
 *
 * ## ⚠ COMMANDMENT 8, AND WHY THERE IS STILL NO `PermissionAction`
 *
 * `ready-signal.ts` carries the whole argument and `03-F52` closes it in terms: rejected option
 * *"(d) a new `PermissionAction` — the owning key is a layer-2 role assignment enforced in main
 * with the renderer's claim never trusted, which is commandment 8's property discharged through
 * the control `00 §7` names."* So the assignment below IS the authorization: it is re-read on
 * every call, it is enforced here in MAIN, and the renderer is told rather than asked.
 *
 * **`03-F52`'s OWED item (1) IS CLOSED (August 2026, `03-F53`), and this is the half that changed
 * here.** The assignment above is still the whole of the authorization — identification *"grants
 * no authority; it supplies attribution"* — but the act now carries the person who performed it.
 * That matters more on this edge than on any other in the app: `served` is TERMINAL (`01-F35`) and
 * `01-F1` makes it permanent, so what this emitted before was an unattributable permanent claim
 * that food reached a customer. `deps.actor` is read here, once, and with nobody signed in there
 * is no edge and no bypass — *"what waits is the RECORD"*, never the food.
 */

/**
 * `01 §4`'s canonical rule, transcribed through `03-F52`'s restatement of it:
 *
 * > **Dine-in, takeaway and pickup only.** Delivery is `picked_up → delivered`, rider-driven
 * > (`01 §4`), or the counter's on-behalf entry (`09-F8`); a delivery ticket bumped DONE gets its
 * > ready-marks and stays on the pass. The filter is an **allowlist** on the order's own
 * > `order_type`, matching `02-F31`'s: `order_type` is an open string, so a denylist marks an
 * > unrecognised value `served`, terminally and permanently under `01-F35`/`01-F1`.
 *
 * It is the same set `apps/pos-electron`'s `SETTLEMENT_SERVES` holds, and the duplication is
 * deliberate rather than an extraction candidate: that one is `02-F31`'s rule about what
 * *settlement* may advance and this one is `03-F52`'s about what a *human handover* may, and the
 * day one FR changes the other must not move with it. What they share is `01 §4`, which is a spec
 * and not a module.
 *
 * ⚠ **An unrecognised type and an ABSENT type are both refused, and that is the allowlist's whole
 * content.** `order_type` is `z.string().min(1).optional()` in `registry.ts`, so `"Delivery"`,
 * `"kerbside"` and `null` are all constructible; a denylist (`!== "delivery"`) passes every other
 * row of this module's suite and marks each of those three `served`, terminally.
 */
const HANDOVER_SERVES: ReadonlySet<string> = new Set(["dine_in", "takeaway", "pickup"]);

/** `01 §4`'s vocabulary, named once so a typo cannot make this module emit nothing. */
const READY: OrderLineState = "ready";
const SERVED: OrderLineState = "served";
const LINE_STATE_CHANGED = "order.line_state_changed";

/**
 * The surface this binary IS, and therefore the one value of the assignment that makes its
 * handover control live. Fixed, not configured — a device does not get to claim it is the counter.
 */
export const HANDOVER_SURFACE: ServeSignalOwner = "pass";

/** The projected cell shape `merge.ts` writes into `OpenOrderRow.json_lines`. */
type ProjectedCell = { states?: unknown };

/**
 * Build the ONE event that hands an order over, or `null` where there is nothing to hand over.
 *
 * **A pure function of the projection**, so the whole policy is drivable without a store, a screen
 * or an Electron app — and the gate is INSIDE it rather than around it at the call site, which is
 * `line-advance.ts`'s recorded lesson (a gate in the host is a gate no test can drive, and the
 * mutant that deletes it is then killed by a source string and by nothing behavioural).
 *
 * It reads the cells directly rather than through `pass-queue.ts`'s `linesOf`, which is the same
 * choice `advanceEdgesFor` makes one app over and is what keeps this module free of a runtime
 * import cycle with the queue that consumes it.
 *
 * Three rules, and only the third differs from its siblings:
 *
 *  1. **A contested line is left alone.** `merge.ts` renders one as its full terminal MVR set and
 *     `01-F31`'s rule is that *"a fold never picks a winner"*; an emitter that picked one would
 *     launder a disputed line into a decided one, terminally.
 *  2. **Only a LEGAL edge is emitted**, judged by `domain`'s own `applyLineState` — the predicate
 *     `merge.ts`'s `edgeLegal` uses, so this cannot drift from the fold's answer.
 *  3. **Only `ready` is eligible**, checked before legality and not by it. `LEGAL_NEXT.in_prep`
 *     contains `served` (`DEC-HW-002`), so a legality-only filter would hand over food nobody has
 *     said is cooked — see this module's header.
 *
 * `preds: []` for `advanceEdgesFor`'s measured reason, and the cost is the one it measured: this
 * is a TERMINAL edge, so the preceding non-terminal heads stay unretired and `projectLine` flags
 * them `terminal_regression`. That is a DERIVED flag recomputed on every fold rather than ledger
 * history, every edge written is legal, no projected value moves, and the cloud Auditor excludes
 * the class by name. `handover.test.ts` §E asserts the absence of `illegal_transition` through the
 * real merge engine for exactly this reason.
 */
export const serveEdgesFor = (order: {
  readonly order_id: string;
  readonly order_type: string | null;
  readonly json_lines: string;
}): LineStateChangedPayload | null => {
  if (!HANDOVER_SERVES.has(order.order_type ?? "")) return null;
  const cells = JSON.parse(order.json_lines) as Record<string, ProjectedCell>;
  const line_context: Record<string, LineEdgeContext> = {};
  for (const [line_id, cell] of Object.entries(cells)) {
    const states = cell.states;
    // Rule 1 — exactly one projected state, or this line is contested and not ours to decide.
    if (!Array.isArray(states) || states.length !== 1) continue;
    const from = states[0] as OrderLineState;
    // Rule 3 — `ready` and nothing else. The FR's own sentence, and the header says why.
    if (from !== READY) continue;
    // Rule 2 — `domain`'s own legality predicate, so this can never disagree with the fold.
    if (!applyLineState(from, SERVED).applied) continue;
    line_context[line_id] = { to: SERVED, from_states: [from], preds: [] };
  }
  const line_ids = Object.keys(line_context);
  if (line_ids.length === 0) return null;
  // `line_ids` is `registry.ts`'s legacy field and `merge.ts` reads only `line_context`; it is
  // derived from the same object so the two cannot disagree.
  return { order_id: order.order_id, line_ids, state: SERVED, line_context };
};

export type ServeMarkDeps = {
  /** The projection this reads `from_states` out of. Narrowed to one method on purpose. */
  readonly store: Pick<DeviceStore, "openOrders">;
  /**
   * `03-F52`'s layer-2 assignment, as a GETTER rather than a value.
   *
   * The FR calls it *"a single org value read by every surface"* — a value that will one day
   * arrive over a config plane — and a value captured at construction would freeze this device on
   * whatever was set at boot. It costs nothing today and it is the difference between a seam and a
   * snapshot.
   */
  readonly policy: () => ServeSignalPolicy;
  /**
   * `01-F26`'s PIN session, as a GETTER — whoever's PIN is in, or `null` (`03-F53`).
   *
   * Required and a getter for `ready-mark.ts`'s two reasons, which are the same reasons: an
   * optional actor is `AGENTS.md`'s Rule-B unsupplied seam by construction, and a value captured
   * at construction freezes attribution at boot. The second bites hardest here — a shift change
   * would attribute every later handover to whoever signed in first, terminally and permanently.
   */
  readonly actor: () => string | null;
  /**
   * The append, **carrying the actor the emitter resolved**.
   *
   * ⚠ **There is no `authorizeWrites` to route this through**, and it is the same measured fact
   * `ready-mark.ts` records: `PERMISSION_ACTIONS` has no line-state member and the counter's
   * `WRITE_ACTIONS` fails closed, so the matrix would DENY a handover today. `03-F52` rejected a
   * new action outright — see this module's header — and puts the authorization on the assignment
   * above. `03-F53` supplies the attribution, which is a different question and now answered.
   *
   * `actor_user_id` is `string` and not `string | null`: on the one edge in this product that
   * cannot be walked back, an unattributed envelope is made unrepresentable rather than merely
   * discouraged.
   */
  readonly append: (type: string, payload: LineStateChangedPayload, actor_user_id: string) => void;
};

export type ServeMarkResult =
  /** `03-F52` — *"Surfaces without the assignment are read-only for `served`."* Nothing appended. */
  | { readonly ok: false; readonly reason: "not_the_owner"; readonly owner: string }
  /**
   * `03-F53` — *"with no session there is no edge"*, and on a TERMINAL claim most of all. Nothing
   * was appended; the screen raises `01-F61`'s two steps.
   */
  | { readonly ok: false; readonly reason: "no_session" }
  /**
   * The order is not on this device, its type is not one `01 §4` sends to `served`, or every line
   * is contested, still cooking, or already handed over. **One reason for three cases on purpose:
   * they are all "this press has nothing to do", the screen already knows which via
   * `handoverable`, and `01-F17` means none of them costs the kitchen anything.**
   */
  | { readonly ok: false; readonly reason: "nothing_to_hand_over" }
  | { readonly ok: true; readonly lines: number };

export type ServeMark = {
  /** `03-F52` — one press, one order, every remaining `ready` line. No `line_ids`; see the header. */
  readonly handOver: (order_id: string) => ServeMarkResult;
};

export const createServeMark = (deps: ServeMarkDeps): ServeMark => ({
  handOver: (order_id) => {
    // `03-F52` — enforced in MAIN and re-read on every call, because the renderer's claim is never
    // trusted (commandment 8's property) and because a read-only surface that still appended would
    // make the assignment decorative.
    const policy = deps.policy();
    if (policy.owner !== HANDOVER_SURFACE) {
      return { ok: false, reason: "not_the_owner", owner: policy.owner };
    }
    /**
     * `03-F53` — ONE read of the session, inside the emitter, deciding both whether the act
     * happens and whose name is on it. After the assignment for `ready-mark.ts`'s reason: a
     * surface that does not own the serve signal draws no HAND OVER control at all.
     */
    const actor = deps.actor();
    if (actor === null) return { ok: false, reason: "no_session" };
    const order = deps.store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return { ok: false, reason: "nothing_to_hand_over" };
    const payload = serveEdgesFor(order);
    if (payload === null) return { ok: false, reason: "nothing_to_hand_over" };
    deps.append(LINE_STATE_CHANGED, payload, actor);
    return { ok: true, lines: payload.line_ids.length };
  },
});
