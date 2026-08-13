// ACCEPTANCE TESTS — `05-F2`'s SECOND EXIT: the manager acknowledges, and the alarm goes away.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session). The shipped
// `../alarms.js` was read as a CONTRACT (its exported types and its `facts` seam), never as an
// implementation of acknowledgment — there is none: that file's own header records the ack as
// UNEMITTABLE and deliberately declares no `acknowledged` input. `05-F30` is what changed.
//
// THE FRs, QUOTED:
//
//   05-F2  "Alarms persist in an active list until the order goes ready/served or the manager
//          acknowledges; acknowledgment is logged (`audit.*`, hash-chained per 01-F5). Alarms are
//          never auto-dismissed silently."
//   05-F30 (August 2026) the ack is `audit.alarm_acknowledged`, `01-F5`'s seventh subtype, with
//          payload `alarm_kind` (`late_order | print_failed`), `order_id`, `printer_name`
//          (`null` on a late-order ack, required on a print-failure ack). "Two acts, two surfaces,
//          two people, two types. **Neither ack clears the other's alert, and this FR deliberately
//          does not join them**."
//   05-F1  the late-order alarm, raised at `03-F14`'s red threshold, naming order/channel/table/age.
//   05-F3  "`kot.print_failed` and `printer.status_changed(offline)` raise on the console with the
//          same persistence rules."
//   05-F4  "one alarm per order per threshold crossing; repeated crossings collapse into the
//          existing alarm with an updated age."
//   05 §5  "Materialized (device): active alarm list … No console-only source-of-truth entities —
//          everything folds from the ledger, so a reinstalled phone reconstructs its state
//          completely (01-F6)."
//   03-F5  the alert names the printer, "so the manager has to know which one to walk to".
//   01-F34 / standing law 1 — this view reads NO ordering metadata: no `global_seq`, no
//          `lamport_seq`, no device clock, no envelope-id comparison reaching a projected value.
//   01-F1  the ledger is append-only. An ack is a fact that never stops being true.
//
// ── WHAT THIS SUITE CANNOT SHOW, and it is the biggest thing about this track ───────────────────
//
// **NOTHING ON THIS DEVICE CAN AUTHOR THE ACK.** `05-F29` rules that the ack must be appended by
// the manager DEVICE (`01-F62`: `audit.*` is its worked example of a branch-scoped type, so no
// server may mint it), and `packages/sync-client`'s `openStore` binds `better-sqlite3`, which
// cannot load under Hermes. So this suite proves the CONSUMER — an ack in the stream clears the
// alarm — and the PRODUCER is owed and is reported as owed. That asymmetry is deliberate and is
// the opposite of shipping a stub: an ack that this view honours is worth having the moment any
// device can write one, and `05-F30`'s schema is what makes writing one possible at all.
//
// Nothing here puts a pixel on a phone either (`apps/manager/vitest.config.ts` says why).
//
// ── THREE PINNED INTERPRETATIONS. Each is a reading; argue with them here. ──────────────────────
//
// 1. **The ack arrives through the EXISTING `facts` seam, not through a new input.** `alarms.ts`
//    already takes "the projection-inert branch facts this view is the declared reader of", and an
//    `audit.*` envelope is exactly that (audit events fold to nothing, per `01-F5`). The SIMPLER
//    ALTERNATIVE — a new `acks` member on `AlarmInput` — is refused because an optional member no
//    caller supplies is AGENTS.md's Rule-B shape, and a required one would redden
//    `alarm-derivation.test.ts`, an oracle this session may not edit.
//
// 2. **An ack matches an alarm on the FACTS `05-F30` carries — kind, order, printer — not on a
//    composed id string.** That is `05-F30`'s own ruling and the reason for it (a format change
//    would silently resurrect every acknowledged alarm). Tests 3–5 are what make the difference
//    observable: an implementation matching on `alarms.ts`' `id` field passes tests 1–2 and fails
//    nothing else, which is why matching is asserted per FIELD.
//
// 3. **An ack is PERMANENT for the alarm it names, so a later identical fact does not re-raise
//    it** (test 8). `05-F4` says repeated crossings "collapse into the existing alarm", and
//    `alarms.ts`' pinned interpretation 2 already collapses repeated `kot.print_failed` on one
//    (order, printer) into ONE alarm — so a second failure is the same alarm, and the same alarm
//    has been acknowledged. THE ALTERNATIVE — a fresh failure after an ack re-raises — is
//    defensible (the kitchen still has no ticket) and would be the reading to overrule this with;
//    it is refused because under `01-F1` the ack is permanent while the failure repeats on every
//    retry exhaustion, so the alternative is `05-F4`'s siren wall reached one indirection later.
//    ONE test depends on it.
//
// ── DELIBERATELY NOT ASSERTED ──────────────────────────────────────────────────────────────────
//
// · **What a `printer.status_changed(offline)` fact RAISES.** `05-F30` records it as a founder
//   call: that alarm has no order, so `05-F1`'s alarm shape (order, channel, table, age) cannot
//   carry it, and `05-F2`'s persistence rule gives it no ready/served exit. Test 10 asserts only
//   that the view does not INVENT one — the absence of a guess, not the presence of a design.
// · **Whether the till's `audit.print_acknowledged` clears a manager alarm.** `05-F30` says it
//   does not, and test 9 is that refusal.

import { resolveAging } from "@restos/device-config/aging";
import type { KitchenQueueRow, OpenOrderRow } from "@restos/sync-client/fold-engine";
import { describe, expect, it } from "vitest";
import { type Alarm, type AlarmInput, alarmsFrom, type BranchFact } from "../alarms.js";

const MINUTE = 60_000;
const NOW = 1_770_000_000_000;
const DEFAULT_AGING = resolveAging(undefined);

const ORDER_A = "0199aaaa-0000-7000-8000-00000000000a";
const ORDER_B = "0199bbbb-0000-7000-8000-00000000000b";
const PRINTER_1 = "BC-85AC";
const PRINTER_2 = "TH230";

const queueRow = (over: Partial<KitchenQueueRow> & { order_id: string }): KitchenQueueRow => ({
  confirm_at: NOW - 30 * MINUTE,
  channel: "counter",
  age_basis: NOW - 30 * MINUTE,
  lines_ready: 0,
  lines_total: 2,
  ...over,
});

const orderRow = (over: Partial<OpenOrderRow> & { order_id: string }): OpenOrderRow =>
  ({
    channel: "counter",
    order_type: "dine_in",
    confirmed_at: NOW - 30 * MINUTE,
    table_ids_json: "[]",
    ...over,
  }) as OpenOrderRow;

let factSeq = 0;
const fact = (type: string, payload: Record<string, unknown>): BranchFact => ({
  id: `0199ffff-0000-7000-8000-${String(++factSeq).padStart(12, "0")}`,
  type,
  branch_created_at: NOW - MINUTE,
  payload,
});

/** `05-F30`'s ack, well-formed. */
const ack = (
  alarm_kind: "late_order" | "print_failed",
  order_id: string,
  printer_name: string | null = null,
): BranchFact =>
  fact("audit.alarm_acknowledged", {
    prev_audit_hash: null,
    alarm_kind,
    order_id,
    printer_name,
  });

const printFailed = (order_id: string, printer_name: string): BranchFact =>
  fact("kot.print_failed", { order_id, printer_name });

const input = (over: Partial<AlarmInput> = {}): AlarmInput => ({
  queue: [queueRow({ order_id: ORDER_A })],
  orders: [orderRow({ order_id: ORDER_A })],
  facts: [],
  now: NOW,
  aging: DEFAULT_AGING,
  ...over,
});

const kinds = (alarms: readonly Alarm[]): string[] =>
  alarms.map((a) => `${a.kind}:${a.order_id}:${a.printer_name ?? "-"}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A — the exit itself.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("05-F2 — the manager acknowledges and the alarm leaves the active list", () => {
  // 0. THE PRECONDITION, asserted so that every "the alarm is gone" below means something. A
  //    suite whose fixture never raised the alarm would pass every clearance test vacuously —
  //    which is exactly the round-3 failure (`S-1`'s test that passed against an empty schema).
  it("raises the late-order alarm this suite then clears (05-F1)", () => {
    expect(kinds(alarmsFrom(input()))).toEqual([`late_order:${ORDER_A}:-`]);
  });

  // 1. `05-F2`'s second exit.
  //    WRONG IMPLEMENTATION CAUGHT: none — this is the headline and any attempt passes it. It is
  //    here as the anchor for tests 2–8, which are the ones that discriminate.
  it("clears an acknowledged late-order alarm (05-F2)", () => {
    const alarms = alarmsFrom(input({ facts: [ack("late_order", ORDER_A)] }));
    expect(kinds(alarms)).toEqual([]);
  });

  // 2. `05-F30`'s `order_id` has to be read.
  //    WRONG IMPLEMENTATION CAUGHT: "any ack clears everything" — one `facts.some(isAck)` guard,
  //    which passes test 1 and empties the console on the first acknowledgment of the night.
  it("clears ONLY the acknowledged order (05-F2, 05-F30)", () => {
    const alarms = alarmsFrom(
      input({
        queue: [queueRow({ order_id: ORDER_A }), queueRow({ order_id: ORDER_B })],
        orders: [orderRow({ order_id: ORDER_A }), orderRow({ order_id: ORDER_B })],
        facts: [ack("late_order", ORDER_A)],
      }),
    );
    expect(kinds(alarms)).toEqual([`late_order:${ORDER_B}:-`]);
  });

  // 3. `05-F30`'s `alarm_kind` has to be read. Two alarms sit on one order — "this order is late"
  //    and "the kitchen never got the ticket" — and they carry different remedies.
  //    WRONG IMPLEMENTATION CAUGHT: matching on `order_id` alone, which is the natural first cut
  //    and which makes acknowledging a late order silently dismiss a print failure the manager has
  //    never seen. `05-F2` calls that out by name: "never auto-dismissed silently".
  it("does not let a late_order ack clear a print_failed alarm on the same order (05-F30)", () => {
    const alarms = alarmsFrom(
      input({
        facts: [printFailed(ORDER_A, PRINTER_1), ack("late_order", ORDER_A)],
      }),
    );
    expect(kinds(alarms)).toEqual([`print_failed:${ORDER_A}:${PRINTER_1}`]);
  });

  // 4. The mirror of test 3, and it is a separate test because an implementation that matched on
  //    kind but not order, or on kind but ignored which alarm the kind belonged to, would pass one
  //    and fail the other.
  it("does not let a print_failed ack clear the late_order alarm on the same order (05-F30)", () => {
    const alarms = alarmsFrom(
      input({
        facts: [printFailed(ORDER_A, PRINTER_1), ack("print_failed", ORDER_A, PRINTER_1)],
      }),
    );
    expect(kinds(alarms)).toEqual([`late_order:${ORDER_A}:-`]);
  });

  // 5. `05-F30`'s `printer_name`, and `03-F5`'s reason for it: two printers down on one order are
  //    two alarms because the manager has to know which one to walk to. An ack naming one must not
  //    clear the other — the second printer is still down and nobody has been told.
  //    WRONG IMPLEMENTATION CAUGHT: matching on (kind, order) and ignoring the printer, which
  //    passes tests 1–4 completely.
  it("clears only the acknowledged PRINTER's alarm (05-F30, 05-F4, 03-F5)", () => {
    const alarms = alarmsFrom(
      input({
        facts: [
          printFailed(ORDER_A, PRINTER_1),
          printFailed(ORDER_A, PRINTER_2),
          ack("print_failed", ORDER_A, PRINTER_1),
        ],
      }),
    );
    expect(kinds(alarms)).toEqual([
      `late_order:${ORDER_A}:-`,
      `print_failed:${ORDER_A}:${PRINTER_2}`,
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B — `05 §5` re-derivation and `01-F34`: the ack is a FACT, not a moment.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("05 §5 / 01-F34 — the ack re-derives identically, whatever order it arrives in", () => {
  // 6. STANDING LAW 1, and the one this repo says is "most often broken by accident". An ack that
  //    only suppressed facts that arrived BEFORE it is an ordering dependence: the same two
  //    envelopes, delivered the other way round on the other device, give two different consoles.
  //    WRONG IMPLEMENTATION CAUGHT: a single forward pass that collects acks as it walks and tests
  //    each `kot.print_failed` against the acks seen so far. It passes tests 1–5 (every fixture
  //    above puts the ack last) and diverges the moment sync delivers them the other way.
  it("gives the same answer with the ack BEFORE the failure it clears (01-F34)", () => {
    const failure = printFailed(ORDER_A, PRINTER_1);
    const acknowledgment = ack("print_failed", ORDER_A, PRINTER_1);
    const after = alarmsFrom(input({ facts: [failure, acknowledgment] }));
    const before = alarmsFrom(input({ facts: [acknowledgment, failure] }));
    expect(before).toEqual(after);
    expect(kinds(after)).toEqual([`late_order:${ORDER_A}:-`]);
  });

  // 7. `01-F34`'s bijective id relabel. The envelope id must reach no projected value and no
  //    decision — including the decision "is this alarm acknowledged". `alarms.ts`' header already
  //    claims `BranchFact.id` is read by nothing; this extends the claim onto the new walk.
  //    WRONG IMPLEMENTATION CAUGHT: a min-id or max-id tiebreak between an ack and a failure,
  //    which passes plain convergence testing and smuggles wall clock in through the UUIDv7 prefix.
  it("is invariant under a bijective relabel of every envelope id (01-F34)", () => {
    const facts = [printFailed(ORDER_A, PRINTER_1), ack("print_failed", ORDER_A, PRINTER_1)];
    const relabelled = facts.map((f, i) => ({
      ...f,
      // Reversed assignment: the ack now sorts BEFORE the failure by id, where it sorted after.
      id: `0199ffff-0000-7000-8000-${String(900 - i).padStart(12, "0")}`,
    }));
    expect(alarmsFrom(input({ facts: relabelled }))).toEqual(alarmsFrom(input({ facts })));
  });

  // 8. PINNED INTERPRETATION 3. Under `01-F1` the ack never stops being true, and under `05-F4` a
  //    repeated failure on one (order, printer) is the SAME alarm — so it stays cleared. This is
  //    also what makes the console usable: the till appends a `kot.print_failed` per exhausted
  //    job, and `printing.ts` records that two "Send to kitchen" taps append two.
  //    WRONG IMPLEMENTATION CAUGHT: clearing by comparing an ack against a fact COUNT, or against
  //    only the first failure. Overruling this interpretation costs exactly this test.
  it("stays cleared when the same failure repeats after the ack (05-F4, 01-F1)", () => {
    const alarms = alarmsFrom(
      input({
        facts: [
          printFailed(ORDER_A, PRINTER_1),
          ack("print_failed", ORDER_A, PRINTER_1),
          printFailed(ORDER_A, PRINTER_1),
        ],
      }),
    );
    expect(kinds(alarms)).toEqual([`late_order:${ORDER_A}:-`]);
  });

  // 9. And the ack does not expire as the order ages. `05-F1` re-derives the alarm at every render
  //    with an updated age (`05-F4`); if the ack were consumed rather than folded, the alarm would
  //    reappear on the next minute — a siren wall built out of the fix for one.
  it("keeps the alarm cleared as the order ages further (05-F2, 05-F4)", () => {
    const facts = [ack("late_order", ORDER_A)];
    expect(kinds(alarmsFrom(input({ facts })))).toEqual([]);
    expect(kinds(alarmsFrom(input({ facts, now: NOW + 45 * MINUTE })))).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C — NEGATIVE CONTROLS. §A and §B are all claims that something CLEARS. These are the claims
// that nothing else does; without them, "clear the list whenever any audit fact appears" passes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("negative controls — what does NOT clear a manager's alarm", () => {
  // 10. THE ASSERTION THAT JUSTIFIES THE SEVENTH SUBTYPE. `audit.print_acknowledged` is `01-F5`'s
  //     sixth and is `03-F5`'s TILL band — a cashier at the counter dismissing an S1. `05-F2` says
  //     "the manager acknowledges", and `05-F3` exists so that "the kitchen can't print" reaches
  //     the manager EVEN OFF THE FLOOR. If a cashier's dismissal cleared the manager's alarm, the
  //     FR would be answered by the surface it was written to bypass.
  //     WRONG IMPLEMENTATION CAUGHT: `type.startsWith("audit.")`, or reusing the sixth subtype
  //     instead of landing the seventh — which is the shortcut `05-F30` was written to refuse.
  it("does not clear on the till's audit.print_acknowledged (05-F30, 05-F3)", () => {
    const alarms = alarmsFrom(
      input({
        facts: [
          printFailed(ORDER_A, PRINTER_1),
          fact("audit.print_acknowledged", {
            prev_audit_hash: null,
            alarm_id: "kot::job-1",
            order_id: ORDER_A,
            printer_name: PRINTER_1,
          }),
        ],
      }),
    );
    expect(kinds(alarms)).toEqual([
      `late_order:${ORDER_A}:-`,
      `print_failed:${ORDER_A}:${PRINTER_1}`,
    ]);
  });

  // 11. A malformed ack clears nothing. The adapter that will one day supply these has already
  //     validated each envelope through `parseEvent` (`01-F4`), so a payload missing `alarm_kind`
  //     cannot reach here — but `alarms.ts` narrows `unknown` payloads itself, deliberately, and
  //     the failure mode of a loose narrow is an alarm dismissed by an envelope that never
  //     acknowledged anything, which `05-F2` forbids in terms.
  //
  //     ⚠ THE ABSENT-FIELD CASES BELOW DO NOT BITE, AND THE MEASUREMENT IS WHY TEST 11a EXISTS.
  //     A mutant replacing the narrow with `String(alarm_kind)` / `String(order_id)` SURVIVED all
  //     of them: a payload with `alarm_kind` missing produces the key `undefined\0…`, which
  //     matches no alarm, so "narrowed" and "stringified" are indistinguishable on absent fields.
  //     Kept as a regression guard, honestly labelled — the discriminating case is 11a.
  it("ignores an ack whose payload does not identify an alarm (05-F2, 01-F4)", () => {
    for (const payload of [
      { prev_audit_hash: null },
      { prev_audit_hash: null, alarm_kind: "late_order" },
      { prev_audit_hash: null, order_id: ORDER_A },
      { prev_audit_hash: null, alarm_kind: 7, order_id: ORDER_A },
      { prev_audit_hash: null, alarm_kind: "late_order", order_id: 7 },
    ]) {
      expect(
        kinds(alarmsFrom(input({ facts: [fact("audit.alarm_acknowledged", payload)] }))),
        JSON.stringify(payload),
      ).toEqual([`late_order:${ORDER_A}:-`]);
    }
  });

  // 11a. THE CASE THAT DISCRIMINATES, and it exists because test 11's did not. A field that is not
  //      a string but STRINGIFIES to a valid one collides with the real alarm's key, so a
  //      `String(...)` coercion in place of a type narrow silently dismisses a live alarm.
  //      `01-F5`'s whole argument for putting the ack in the hash-chained family is that a quiet
  //      dismissal must be detectable; an alarm cleared by an envelope that never named it is that
  //      dismissal one layer earlier, where no chain can see it.
  //      WRONG IMPLEMENTATION CAUGHT: `acked.add(key(String(alarm_kind), String(order_id), …))` —
  //      measured to survive every fixture in test 11 and to fail this one.
  //
  //      ⚠ THE FIELDS ARE POISONED ONE AT A TIME, and that is a measurement rather than a style.
  //      A single fixture coercing BOTH fields let a mutant that narrows `order_id` correctly and
  //      only weakens `alarm_kind` SURVIVE — the surviving narrow caught the fixture on the other
  //      field, and the weakened one was never reached. One poisoned field per case, or a suite
  //      proves only that SOME guard exists.
  it("ignores an ack whose fields merely STRINGIFY to an alarm (05-F2, 01-F5)", () => {
    const cases: Record<string, unknown>[] = [
      // alarm_kind poisoned, order_id genuine.
      {
        prev_audit_hash: null,
        alarm_kind: { toString: () => "late_order" },
        order_id: ORDER_A,
        printer_name: null,
      },
      // order_id poisoned, alarm_kind genuine.
      {
        prev_audit_hash: null,
        alarm_kind: "late_order",
        order_id: { toString: () => ORDER_A },
        printer_name: null,
      },
      // printer_name poisoned on a print_failed ack, the other two genuine.
      {
        prev_audit_hash: null,
        alarm_kind: "print_failed",
        order_id: ORDER_A,
        printer_name: { toString: () => PRINTER_1 },
      },
    ];
    for (const payload of cases) {
      expect(
        kinds(
          alarmsFrom(
            input({
              facts: [printFailed(ORDER_A, PRINTER_1), fact("audit.alarm_acknowledged", payload)],
            }),
          ),
        ),
        JSON.stringify(Object.keys(payload)),
      ).toEqual([`late_order:${ORDER_A}:-`, `print_failed:${ORDER_A}:${PRINTER_1}`]);
    }
  });

  // 12. `05-F30` records `05-F3`'s printer-offline alarm as a FOUNDER CALL: it has no order, so
  //     `05-F1`'s alarm shape cannot carry it, and `05-F2` gives it no ready/served exit. This
  //     test asserts the ABSENCE OF A GUESS — a `printer.status_changed` fact must not be
  //     attached to whatever order happens to be open, which is the shape an implementer reaches
  //     for when the type appears in the same `facts` array as `kot.print_failed`.
  //     ⚠ This test is not evidence that `05-F3` is satisfied. Half of it is not built.
  it("does not fabricate an order-keyed alarm from printer.status_changed (05-F30, 05-F1)", () => {
    const alarms = alarmsFrom(
      input({
        facts: [fact("printer.status_changed", { printer_name: PRINTER_1, status: "offline" })],
      }),
    );
    expect(kinds(alarms)).toEqual([`late_order:${ORDER_A}:-`]);
  });

  // 13. An ack for an order that has no alarm is inert — it does not throw, does not clear another
  //     order, and does not create a row. `01-F10` parks facts whose subject has not arrived, and
  //     a manager device catching up mid-shift sees exactly this.
  it("is inert for an order it has no alarm for (01-F10)", () => {
    const alarms = alarmsFrom(input({ facts: [ack("late_order", ORDER_B)] }));
    expect(kinds(alarms)).toEqual([`late_order:${ORDER_A}:-`]);
  });
});
