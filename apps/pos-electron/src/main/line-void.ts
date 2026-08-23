/**
 * # `02-F20` / `02-F8` — THE POST-CONFIRM VOID, AND WHERE ITS MONEY ACTUALLY MOVES
 *
 * `02-F8` and `01 §4`'s dagger split one act at one line: *"Line removal pre-confirm is
 * `order.line_removed`; post-confirm it must be `void.recorded` with an approver."*
 * `line-removal-guard.ts` enforces the split and refuses the pre-confirm event after the KOT —
 * and until this module there was nothing on the other side of that refusal. `void.recorded` had
 * a payload schema, a matrix row, an approval path and **zero production emitters**, so a cashier
 * who mis-rang a dish after confirming had no act available to her at all and `01-F1` made the
 * mistake permanent. That is `plans/v0.md`'s gap 1 and the reason a pilot cannot trade.
 *
 * ── THE ONE DESIGN DECISION, AND IT IS `DEC-MONEY-010` (2) IMPLEMENTED RATHER THAN INVENTED ──
 *
 * A void has two possible representations and using **both** subtracts the same money twice,
 * converged on every device and permanent. `DEC-MONEY-010` (2) names that hazard and resolves it:
 *
 * > make the two representations **disjoint at the emitter and checkable at the fold**, with the
 * > LINE authoritative wherever a line exists (`01 §4`'s `voided / cancelled` exit states are the
 * > only vocabulary any module may use, and `billedCellPaisa` already honours them), so
 * > `void.recorded` carries the approval facts and contributes value only for what no line exit
 * > removed.
 *
 * So the money moves through the **line exit**, and it moves TODAY: `merge.ts`'s `billedCellPaisa`
 * already returns zero for a decided exited cell, under a merge rule that is oracle-pinned
 * (`26 §8`'s lines prototype, 13/13, with bijective relabel and clock injection). Nothing in
 * `packages/sync-client` is changed by this work and no new merge rule is guessed at.
 *
 * `void.recorded` carries the approval facts — the reason, the approver, the amount, `01-F83`'s
 * attempt key — and its `amount_paisa` is the value the line exit removed. It contributes **zero**
 * to `01-F30`'s `void_value` term, which is trivially satisfied today because that term is ABSENT
 * (`DEC-MONEY-010`, gate condition (iii) unmet — see below), and which stays true when the term
 * enters, because of the invariant this module exists to guarantee:
 *
 * > **EVERY `void.recorded` THIS PRODUCT EMITS NAMES EXACTLY ONE LINE, AND THAT LINE EXITS IN THE
 * > SAME ACT.** There is no order-keyed void with no line behind it, because there is no surface
 * > that can produce one: this is the only emitter, it refuses a request naming anything other
 * > than one line of one order, and it refuses a line that cannot exit.
 *
 * `__acceptance__/line-void.test.ts` §A and §D assert both halves. A future whole-order void — a
 * walkout, `02-F62` (a)'s unresolved case — would break the invariant and must therefore land with
 * the fold arm, not before it.
 *
 * ── WHY THE FOLD ARM IS STILL INERT, STATED AS A READING AND DISPUTABLE BY FR ID ──────────────
 *
 * `DEC-MONEY-010`'s gate admits `01-F30`'s three missing terms only on **(i)** a production
 * emitter, **(ii)** an `01-F31`-class attempt key, and **(iii)** *"an oracle-pinned merge rule in
 * `26 §7`"*. This module supplies (i). `01-F83` supplied (ii). **(iii) is NOT supplied by
 * `01-F83`, and the reading is:**
 *
 *  - `01-F83` states the DEDUPE discipline — *"unique-keyed sum; members diverging in any field
 *    mark the key disputed, contribute zero … no fold picks a winner"* — which answers how to
 *    combine members of ONE key. It does not answer which projected field each term lands in, nor
 *    which representation is authoritative; `DEC-MONEY-010`'s own (2) and (3) answer those and
 *    label themselves *"recommendation, NOT ratification"*.
 *  - `26 §7` — the document the gate names — was amended 2026-08-23 and says in terms that
 *    *"(i) the emitters and (iii) this document's own oracle-pinned merge rule are both still
 *    owed"*. A rule stated in doc 01 is not a rule in `26 §7`, and doc 26 has been amended since
 *    `01-F83` landed without adopting it.
 *  - *Oracle-pinned* has a defined meaning here (`26 §8`): a prototype taken green and survived
 *    against bijective id-relabel and clock/sequence injection. `26 §8`'s money prototype covered
 *    payments and refunds. **No such oracle exists for these three**, and `26 §8`'s own binding
 *    lesson is that plain convergence testing blesses a min-id tiebreak.
 *
 * `packages/sync-client/src/folds/merge.ts` is therefore untouched and its three `case` labels
 * stay projection-inert. **The consequence is stated rather than hidden and it is asymmetric:** a
 * VOID is whole, because the line exit carries its money under an existing rule; a **comp** and a
 * **discount** are RECORDED and their money is not subtracted, because neither is a line exit
 * (`01 §4` has no `comped` state, and `01-F30` models both as terms that subtract from a
 * `billed_total` the line stays inside). `02-F20`'s comp and discount surfaces say so on the glass
 * rather than letting a cashier infer it from a total that did not move.
 */

import { applyLineState, type OrderLineState } from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import { AppendRequestSchema, type AppendResult } from "../shared/ipc";
import type { LineEdgeContext, LineStateChangedPayload } from "./line-advance";
import type { RendererWrites } from "./settlement-guard";

/** `01 §4`'s corrective, named once so a typo cannot make this layer wrap nothing. */
const VOID_RECORDED = "void.recorded";

/** The edge type, and `01 §4`'s exit state the void resolves to. */
const LINE_STATE_CHANGED = "order.line_state_changed";
const VOIDED: OrderLineState = "voided";

/** One projected line cell, read as loosely as `line-advance.ts` reads it and for its reason. */
type ProjectedCell = { states?: unknown };

/**
 * `00 §5.7` — names what is true, names the FR, and is distinguishable from the other refusals
 * thrown on this same channel. `refuseZeroTender` and `refuseDoubleSettlement` both throw here
 * too, and an assertion that "something threw" cannot tell three refusals apart.
 */
const voidRefused = (why: string): Error =>
  new Error(
    `void.recorded refused (02-F20/02-F8): ${why}. Nothing has been recorded and the bill is ` +
      "unchanged. A void names exactly one line of one order, and that line must still be able " +
      "to leave (01-F35 makes served/delivered/voided/cancelled terminal).",
  );

/**
 * The whole rule, as a pure function of the projection — so the policy is testable with no store,
 * no Electron and no ledger, and so the three things it refuses can be argued with.
 *
 * 1. **Exactly one line, named on the envelope's `refs`.** `registry.ts` declares no `line_id` on
 *    this payload deliberately (*"a payload line key would be a second place to say what an act
 *    touches and two can disagree"*) and puts the reference on `refs[]` per `00 §6`. So `refs` is
 *    where the line is, and more than one — or none — is not an act this emitter can perform.
 * 2. **The line belongs to this order and this device has the order.** A void against an order
 *    this till has not converged on is refused rather than guessed at.
 * 3. **The line can legally exit**, judged by `domain`'s own `applyLineState` — the same predicate
 *    `merge.ts`'s `edgeLegal` uses, so this can never disagree with the fold's answer. A contested
 *    line (≥ 2 projected states) is left alone for `01-F31`'s reason: *a fold never picks a
 *    winner*, and neither may an emitter. An illegal edge is not refused by the ledger — it lands,
 *    is flagged `illegal_transition`, and stays there for ever (`01-F1`) — which is exactly why it
 *    is refused HERE.
 */
export const voidExitFor = (
  order: { readonly order_id: string; readonly json_lines: string } | undefined,
  refs: readonly string[],
): LineStateChangedPayload | { readonly refused: string } => {
  if (refs.length !== 1)
    return { refused: `this request names ${refs.length} lines on its refs and a void names one` };
  const line_id = refs[0] as string;
  if (order === undefined) return { refused: "this till has no open order with that id" };
  const cells = JSON.parse(order.json_lines) as Record<string, ProjectedCell>;
  const cell = cells[line_id];
  if (cell === undefined) return { refused: "that line is not on that order" };
  const states = cell.states;
  if (!Array.isArray(states) || states.length !== 1)
    return { refused: "that line is contested, and a fold never picks a winner (01-F31)" };
  const from = states[0] as OrderLineState;
  if (!applyLineState(from, VOIDED).applied)
    return { refused: `that line is ${from} and cannot be voided from there (01 §4)` };
  const line_context: Record<string, LineEdgeContext> = {
    [line_id]: { to: VOIDED, from_states: [from], preds: [] },
  };
  /*
    `line_ids` is `registry.ts`'s legacy field and `merge.ts` reads only `line_context`; derived
    from the same object so the two cannot disagree.

    ⚠ **`preds: []` — MEASURED, KNOWN AND OWED, and this edge is TERMINAL so it engages
    `line-advance.ts`'s recorded residual rather than escaping it.** That module measured the same
    thing on `02-F31`'s settlement edge: `preds: []` projects the correct state and leaves
    `terminal_regression` on the edges it supersedes, where naming the superseded edge projects
    the same state with an empty anomaly map. It ships here for that module's three bounded
    reasons — the STATE is correct either way, the flag is DERIVED (every edge is legal, so
    nothing wrong enters the append-only ledger and a refold clears it), and `auditor.ts` filters
    to `illegal_transition` by name. **No money moves on it**: `billedCellPaisa` reads `states`
    only. Closing it needs head ids on `BilledLineCell`, an oracle-pinned cell shape in a
    protected package. `__acceptance__/line-void.test.ts` §A pins BOTH halves — no
    `illegal_transition`, and the `terminal_regression` as a fact — so neither can drift silently.
  */
  return { order_id: order.order_id, line_ids: [line_id], state: VOIDED, line_context };
};

export type LineVoidDeps = {
  /** The writes this wraps — already past Commandment 8 and already narrowed. */
  readonly writes: RendererWrites;
  /** This device's own converged fold. No peer, no clock, no network (`02-F49`, `01-F17`). */
  readonly store: Pick<DeviceStore, "openOrders">;
};

/**
 * `02-F20`'s void, as a wrapper around the writes the renderer reaches — on `refuseZeroTender`'s
 * and `refuseDoubleSettlement`'s precedent next door, so the trust boundary is drawn once in
 * `index.ts` where a reader can see it, and deleting it is ONE argument (which is what makes the
 * seam mutable and therefore testable).
 *
 * **Its position in the chain is the decision.** It sits INSIDE `authorizeWrites`, so a void has
 * already been through the matrix — a cashier's `escalate` verdict has already been satisfied by a
 * manager's PIN — before any line is touched. That placement is also what puts it on **both**
 * routes an approved write can take: the direct `CHANNELS.append` handler, and
 * `authorizeEscalation.approve`, which appends through `AuthorizedWritesDeps.writes` and never
 * reaches `ipcMain`'s consequence block. A consequence hung off the IPC handler instead would fire
 * for a manager's own unsupervised void and **not** for a cashier's approved one — the case
 * `02-F20` exists for.
 *
 * **The edge is computed BEFORE either append and refuses the whole act**, rather than being
 * appended afterwards and hoping. The two failure directions are not symmetric: a `void.recorded`
 * with no exit leaves money on a bill nobody can take off it, and an exit with no `void.recorded`
 * removes a cooked dish with no approver — Appendix A's void row bypassed by an event type, which
 * is the theft vector `02-F49` exists to close. Refusing up front makes both unreachable.
 *
 * **The exit is appended through the SAME inner writes, deliberately, and not through the raw
 * gateway.** `order.line_state_changed` is absent from `WRITE_ACTIONS` and would be DENIED by the
 * matrix — which is the right answer for a renderer channel and the wrong one here, exactly as
 * `line-advance.ts` records for `02-F31`. The difference from that module is that this edge is not
 * a device fact nobody performs: a person performed it, she was authorized for it, and the act she
 * was authorized for is the VOID. One human act, one authorization, two recorded facts — the shape
 * `02-F24` already uses for `day.closed` + `cash.deposit_recorded`.
 */
export const voidExitsLine = (deps: LineVoidDeps): RendererWrites => ({
  append: (req: unknown): AppendResult => {
    // Re-parsed rather than read raw, on `zero-tender-guard.ts`'s posture: `req` is `unknown` from
    // an untrusted renderer, and on anything malformed this narrowing MISSES and the request goes
    // on to the real validator. Fail-open here, fail-closed there, so a broken payload can never
    // be refused for the wrong reason.
    const parsed = AppendRequestSchema.safeParse(req);
    if (!parsed.success || parsed.data.type !== VOID_RECORDED) return deps.writes.append(req);

    const order_id = parsed.data.payload.order_id;
    const order =
      typeof order_id === "string"
        ? deps.store.openOrders().find((row) => row.order_id === order_id)
        : undefined;
    const edge = voidExitFor(order, parsed.data.refs);
    if ("refused" in edge) throw voidRefused(edge.refused);

    // The corrective first, then the fact it decides. Order is not load-bearing for convergence
    // (`01-F34` — no fold reads it) and is chosen for the reader: the ledger tells the story in
    // the order it happened, the approval before its effect.
    const appended = deps.writes.append(req);
    deps.writes.append({ type: LINE_STATE_CHANGED, payload: edge, refs: parsed.data.refs });
    return appended;
  },
  // Untouched, and written out rather than spread, on `refuseZeroTender`'s reasoning: a member
  // added to `Gateway` later must be a decision here and not something a spread carries through.
  addLine: (req: unknown): AppendResult => deps.writes.addLine(req),
  toggleAvailability: (req: unknown): AppendResult => deps.writes.toggleAvailability(req),
  recordCustomer: (req: unknown): AppendResult => deps.writes.recordCustomer(req),
});
