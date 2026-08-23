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
 * attempt key — and its `amount_paisa` is the value the line exit removed. **That sentence is now
 * true of the CODE and not only of the intent: `voidExitFor` DERIVES the figure with
 * `billedLinePaisa` from the very cell whose exit it just computed, and `voidExitsLine` writes the
 * derivation over whatever the renderer sent.** It was renderer-asserted until August 2026 —
 * `LineCorrection.tsx` computed `act === "discount" ? entered : lineTotal` and the number crossed
 * `shared/ipc.ts`'s bridge, *"the untrusted end of this bridge even though we ship it"*, into an
 * append-only ledger. Reproduced against the real store before it was fixed: **a void naming the
 * Rs 60 naan recorded `amount_paisa: 999_999_900` while `billed_effective` dropped by 6,000** —
 * a permanent money field nothing derived, and not inert, because `approval-record.ts` reads it
 * into `approval.requested` and that is the figure `05-F5`'s manager card shows the approver.
 * This is the split `AddLineRequestSchema` refuses by design one file over (*"a renderer that
 * supplied the price could supply `0`"*), and the cell it needed was already in hand.
 *
 * **OVERWRITE rather than refuse-on-mismatch, and the reason is availability under a rule that is
 * about to change.** Both close the security half identically, because either way the only figure
 * that can land is the derived one. They differ on the day `merge.ts` grows a fold arm for
 * `order.line_price_overridden` — projection-inert today, which is why a mismatch is currently
 * unreachable: for any cell that passes the guards below, `billedLinePaisa` is `qty ×
 * unit_price_paisa` and neither field ever moves. When that arm lands, a price override arriving
 * between the render and the submit makes the renderer's copy stale through no fault of the
 * cashier, and a refusal would strand her at the counter for a number she cannot see or act on
 * (`02-F37`). Overwriting has no such latency, and it puts the provenance where every other money
 * field on this bridge already sits: `01-F53`'s captured price, `01-F60`'s resolution, `01-F57`'s
 * supersedes link and `01-F23`'s customer key are all decided in main because the renderer's copy
 * is display. `authorizeEscalation.approve` already rebuilds this exact payload to stamp
 * `approver_user_id`, so the shape is precedent, not invention.
 *
 * ⚠ **WHAT THE OVERWRITE DOES NOT CLOSE, because it is upstream of this module.**
 * `approval-record.ts`'s `raiseFor` announces `approval.requested` from the RAW request when the
 * approval pad is raised — before the escalation, and therefore before anything here runs — so the
 * amount a manager approves against is STILL the renderer's. Deriving it there is not a two-line
 * change and must not be one: it would be a second resolution of the line-to-money question, which
 * is the *"two implementations of one sum"* hazard `merge.ts` exports `billedLinePaisa` to prevent,
 * and it would have to answer for `comp`, `discount` and `price_override` too — where a discount's
 * amount is legitimately the operator's. Recorded as owed rather than half-done.
 *
 * `void.recorded` contributes **zero** to `01-F30`'s `void_value` term, which is trivially
 * satisfied today because that term is ABSENT (`DEC-MONEY-010`, gate condition (iii) unmet — see
 * below), and the invariant this module exists to guarantee is:
 *
 * > **EVERY `void.recorded` THIS PRODUCT EMITS NAMES EXACTLY ONE LINE, AND THAT LINE IS ONE THIS
 * > DEVICE HAS JUST JUDGED ABLE TO EXIT.** There is no order-keyed void with no line behind it,
 * > because there is no surface that can produce one: this is the only emitter, it refuses a
 * > request naming anything other than one line of one order, and it refuses a line that cannot
 * > exit.
 *
 * `__acceptance__/line-void.test.ts` §A and §D assert both halves. A future whole-order void — a
 * walkout, `02-F62` (a)'s unresolved case — would break the invariant and must therefore land with
 * the fold arm, not before it.
 *
 * ── ⚠ THE INVARIANT IS WEAKER THAN THIS FILE CLAIMED, AND THE FOLD ARM MUST NOT REST ON THE
 * ── STRONGER FORM ─────────────────────────────────────────────────────────────────────────────
 *
 * The block above read *"AND THAT LINE EXITS IN THE SAME ACT"* and the `voidExitsLine` note below
 * read *"Refusing up front makes both unreachable."* **Neither survived a failure on the SECOND of
 * two appends, and both were corrected in August 2026 rather than defended.** `voidExitsLine`
 * appends `void.recorded` and then `order.line_state_changed` through two separate calls, and
 * `DeviceStore` offers no transaction spanning them (`device-store.ts`'s `append` is one event; its
 * `appendTx` is a one-event transaction). Reproduced by injecting the `SqliteError: database is
 * locked` this repo has already met on a real till:
 *
 * ```
 *   landed            === ["void.recorded"]      the corrective landed alone
 *   billed_effective  === KARAHI + NAAN          01-F1: permanent, and the bill did not move
 * ```
 *
 * `01-F83`'s attempt key does not collapse the retry either: the cashier presses again and
 * `LineCorrection.tsx` mints a FRESH `adjustment_attempt_id`, so the ledger ends up holding two
 * `void.recorded` for one line under two keys, one of them an orphan.
 *
 * **Why it is named here rather than fixed here.** An atomic pair needs a multi-event transaction
 * on `DeviceStore` — a **protected path** (`20 §4.4`) — and it does not stop there: `RendererWrites`
 * would grow a member that `refuseZeroTender` and `refuseDoubleSettlement` must each decide the
 * meaning of for a BATCH, `authorizeWrites` would have to run the matrix over every member of one,
 * and `order.line_state_changed` has no `WRITE_ACTIONS` row precisely because it must not be
 * renderer-reachable. Those are design decisions, not plumbing. In front of a pilot (`plans/v0.md`)
 * the honest move is to state the window and pin it, which
 * `__acceptance__/line-void.test.ts` §F does.
 *
 * **The order of the two appends is the safer half of an unavoidable choice and is deliberate.**
 * The two failure directions are not symmetric — see `voidExitsLine`'s own note — and this order
 * puts the survivable one on the exposed side: a `void.recorded` with no exit leaves the dish ON
 * the bill, which is what a cashier can still fix by voiding again, while an exit with no
 * `void.recorded` would remove a cooked dish with no approver and could not be taken back.
 *
 * ⚠ **THE CONSEQUENCE FOR `01-F30`'s `void_value`, which is the reason this is written up rather
 * than merely noted.** `DEC-MONEY-010` (2) says `void.recorded` *"contributes value only for what
 * no line exit removed"*, and the natural implementation of that clause — contribute
 * `amount_paisa` when this fold can see no exit for the line — would subtract, for an ORPHAN,
 * money the bill is still carrying. An orphan is by construction the case where no exit exists.
 * So the fold arm may not read "no exit" as "the money is gone"; it needs the disputed/zero
 * disposition `01-F83` gives a key it cannot corroborate. **The invariant that survives is the one
 * stated above** — every emitted `void.recorded` names one line this device judged able to exit —
 * and that is strictly weaker than the one this file used to promise.
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
import { billedLinePaisa, type DeviceStore } from "@restos/sync-client";
import { AppendRequestSchema, type AppendResult } from "../shared/ipc";
import type { LineEdgeContext, LineStateChangedPayload } from "./line-advance";
import type { RendererWrites } from "./settlement-guard";

/** `01 §4`'s corrective, named once so a typo cannot make this layer wrap nothing. */
const VOID_RECORDED = "void.recorded";

/** The edge type, and `01 §4`'s exit state the void resolves to. */
const LINE_STATE_CHANGED = "order.line_state_changed";
const VOIDED: OrderLineState = "voided";

/**
 * One projected line cell.
 *
 * `states` is read as loosely as `line-advance.ts` reads it and for its reason. The VALUE fields
 * are declared as `merge.ts` writes them — every cell in `json_lines` is built as
 * `{ ...LineValue, states, anomalies }` from `Entity.lineValues`, so a cell that exists carries
 * all three — and are CHECKED below rather than trusted, because `voidExitFor` is total and its
 * real input is a string.
 */
type ProjectedCell = { states?: unknown; item_id: string; qty: number; unit_price_paisa: number };

/**
 * What one void resolves to: the fact that MOVES the money, and the money it moves.
 *
 * The two are returned TOGETHER and derived from ONE cell lookup deliberately. Resolving the line
 * twice — once for the edge, once for the amount — is two answers to one question with no rule for
 * which wins, which is the shape `merge.ts` exports `billedLinePaisa` to avoid at the order level.
 */
export type VoidExit = {
  readonly edge: LineStateChangedPayload;
  /**
   * `billedLinePaisa` of the cell this edge exits — `merge.ts`'s own `billedCellPaisa`, exported
   * rather than re-derived (`26 §8` / the T-01-11 ruling). Never the renderer's figure: see the
   * header. It is the value the exit removes, so `void.recorded` and the total it comes off cannot
   * disagree by construction.
   */
  readonly amount_paisa: number;
};

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
): VoidExit | { readonly refused: string } => {
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
  // `01-F53`'s captured value, checked rather than assumed. Unreachable from the real fold — a
  // cell is built FROM a `LineValue`, so one cannot exist without these two — and checked anyway
  // because this function is exported as a pure function of a JSON string, and `BigInt(undefined)`
  // THROWS where every other bad input here is refused by name (`00 §5.7`).
  if (!Number.isInteger(cell.qty) || !Number.isInteger(cell.unit_price_paisa))
    return { refused: "that line carries no projected value on this till (01-F53)" };
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
  return {
    edge: { order_id: order.order_id, line_ids: [line_id], state: VOIDED, line_context },
    /*
      **The money is DERIVED HERE and the renderer's copy is discarded** (`voidExitsLine` writes
      this over the payload). `states` is re-typed rather than the cell re-shaped: a hand-built
      `{ qty, unit_price_paisa, states }` would be a reshape between two modules that agree, which
      is precisely how `catalog-fetch.ts`'s `toEntry` silently dropped `prices` and `station`. The
      spread carries every field the fold wrote, so a `billedCellPaisa` that later reads one more
      of them reads the real value and not a default invented here.
    */
    amount_paisa: billedLinePaisa({ ...cell, states: states as string[] }),
  };
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
 * is the theft vector `02-F49` exists to close.
 *
 * ⚠ **THIS PARAGRAPH USED TO CLOSE *"Refusing up front makes both unreachable."* IT IS NOT TRUE
 * AND IT WAS CORRECTED IN AUGUST 2026 RATHER THAN DEFENDED.** Refusing up front makes both
 * unreachable *for a REFUSAL*, which is what the guards above decide. It makes neither unreachable
 * for a FAILED APPEND: the two calls below are separate, `DeviceStore` has no transaction spanning
 * them, and a throw on the second leaves the first in an append-only ledger. Reproduced with an
 * injected `SqliteError: database is locked` — the corrective lands alone and the bill does not
 * move. See the header for the measurement, the sizing of a transactional fix, and what it means
 * for `01-F30`'s `void_value`. **What survives is the asymmetry itself, and it is why the
 * corrective goes FIRST**: the reachable half is the recoverable one — the dish stays on the bill
 * and the cashier can void it again — while the unrecoverable half stays behind the refusal.
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
    const resolved = voidExitFor(order, parsed.data.refs);
    if ("refused" in resolved) throw voidRefused(resolved.refused);

    /*
      **`amount_paisa` is OVERWRITTEN with the derivation, not compared to the renderer's copy.**
      `LineCorrection.tsx` sends a figure it read off the read model and `18 §9` makes that the
      untrusted side, so what lands in an append-only ledger is `billedLinePaisa` of the cell whose
      exit this act just computed — the value the exit removes, by construction. Rebuilt from
      `parsed.data` on `authorizeEscalation.approve`'s precedent, which stamps `approver_user_id`
      into this same payload the same way; every layer below re-parses with the same schema, so
      nothing downstream can see a key this drops.
    */
    const corrective = {
      type: parsed.data.type,
      payload: { ...parsed.data.payload, amount_paisa: resolved.amount_paisa },
      refs: parsed.data.refs,
    };

    // The corrective first, then the fact it decides. Order is not load-bearing for convergence
    // (`01-F34` — no fold reads it) and is chosen for TWO reasons: the ledger tells the story in
    // the order it happened, the approval before its effect — and, since the pair is not atomic,
    // this puts the RECOVERABLE half of a half-landed void on the exposed side (see the note
    // above and the header).
    const appended = deps.writes.append(corrective);
    try {
      deps.writes.append({
        type: LINE_STATE_CHANGED,
        payload: resolved.edge,
        refs: corrective.refs,
      });
    } catch (cause) {
      /*
        `00 §5.7` — the cashier is the one who has to fix this, and `SqliteError: database is
        locked` tells her nothing she can act on. The original is carried as `cause` rather than
        swallowed: this narrows what a human is told and hides nothing from a log. It does NOT
        close the window — nothing here can, and the header says so.
      */
      throw new Error(
        "void.recorded LANDED and the line did NOT exit (02-F20/02-F8): the approval is recorded " +
          "and permanent (01-F1), and the dish is still on the bill. Void it again — a second " +
          "attempt is a fresh act and this one removed nothing.",
        { cause },
      );
    }
    return appended;
  },
  // Untouched, and written out rather than spread, on `refuseZeroTender`'s reasoning: a member
  // added to `Gateway` later must be a decision here and not something a spread carries through.
  addLine: (req: unknown): AppendResult => deps.writes.addLine(req),
  toggleAvailability: (req: unknown): AppendResult => deps.writes.toggleAvailability(req),
  recordCustomer: (req: unknown): AppendResult => deps.writes.recordCustomer(req),
});
