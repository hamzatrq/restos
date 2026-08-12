// Acceptance tests — the manager console's ACTIVE ALARM LIST, derivation half.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `05-F1`  — "when an order (or line) crosses the red aging threshold (03-F14), the console
//              raises an alarm naming order, channel, table, and age."
//   `05-F2`  — "Alarms persist in an active list until the order goes ready/served or the manager
//              acknowledges … Alarms are never auto-dismissed silently."
//   `05-F3`  — "`kot.print_failed` and `printer.status_changed(offline)` raise on the console with
//              the same persistence rules — 'the kitchen can't print' must reach the manager even
//              off the floor (03-F5 companion)."
//   `05-F4`  — "one alarm per order per threshold crossing; repeated crossings collapse into the
//              existing alarm with an updated age. The console must stay useful during a bad rush,
//              not become a siren wall."
//   `05 §5`  — "Materialized (device): active alarm list … No console-only source-of-truth
//              entities — everything folds from the ledger."
//   `03-F14` — "neutral → amber at X min → red at Y min. X/Y are org-configurable per order type
//              (defaults: dine-in 10/20, delivery 15/25); timer basis is `order.confirmed`, so a
//              failed print never hides a late order."
//   `03-F5`  — the alert "naming the printer and order".
//   `27-F14` — red's ENUMERATED claimants: "ticket overdue, print failure, …". Amber's are
//              "ticket approaching due …". An alarm raised at amber would spend red's slot on
//              amber's claimant; this is why test 2 exists.
//   `01-F34` / standing law 1 — a projection reads NO ordering metadata: no `global_seq`, no
//              `lamport_seq`, no device clock, no envelope-id comparison reaching a value.
//   `18 §6`  — "Apps may register app-specific derived views but not new folds without a
//              `sync-client` PR." This module is a derived VIEW; its inputs are the merge engine's
//              already-projected rows plus the `kot.print_failed` envelopes `merge.ts` declares
//              projection-inert with the note "Its reader is doc 05's alarm console (05-F3)".
//
// SHIPPED CODE READ AS CONTRACT (not as implementation): `KitchenQueueRow` / `OpenOrderRow` from
// `@restos/sync-client/fold-engine` (the pure subpath, proven to load under Hermes),
// `AgingPolicy` from `@restos/device-config/aging` (the PURE subpath — see that package's
// EXPORTS.md; the root entry shells out to `powershell.exe` and cannot enter a Hermes bundle),
// `ageLevel` from `packages/ui` (the product's ONE
// existing reading of `03-F14`'s threshold — see PINNED INTERPRETATION 1).
// No implementation of `../alarms.js` was read; none exists in this tree.
// `plans/wave-1/` was deliberately NOT read for this file.
//
// ── WHAT THIS SUITE DOES NOT AND CANNOT SHOW ───────────────────────────────────────────────────
//
// Nothing here puts a pixel on a phone, and nothing here proves the manager device can OBTAIN the
// rows it is handed. Both are blocked, and the blockers are named in this session's report rather
// than papered over: `openStore` binds `better-sqlite3` (protected path), and `packages/ui` ships
// no RN components, so `21-F2` leaves no compliant way to draw a feature screen here. A suite that
// implied otherwise would be worse than no suite.
//
// ── FOUR PINNED INTERPRETATIONS. Each is a reading, not a transcription; argue with them here. ──
//
// 1. **The red threshold is INCLUSIVE — `minutes >= redAt`.** `03-F14` says "red at Y min" and
//    does not say which side of Y. `packages/ui`'s `ageLevel` already ships `minutes >= redAt
//    ? "fault"`, and `03-F40`'s two-sensor-layouts lesson is that two readings of one rule diverge
//    and then one surface is right and another wrong. One reading. Test 6 pins the boundary.
//
// 2. **A print-failure alarm collapses per (order_id, printer_name).** `05-F4` says "one alarm per
//    order per threshold crossing", which is written about aging; the till appends one
//    `kot.print_failed` per exhausted job and `printing.ts` records that two "Send to kitchen"
//    taps append two. The SIMPLER ALTERNATIVE — one alarm per event — is refused because it is
//    precisely the siren wall `05-F4` exists to prevent. Two different printers for one order stay
//    TWO alarms (test 14): `03-F5` names the printer because the manager has to know which one to
//    walk to.
//
// 3. **"the same persistence rules" (`05-F3`) means the whole of `05-F2`, including its
//    ready/served exit.** So a print-failure alarm clears when its order goes ready. The
//    ALTERNATIVE reading — that a printer fact has no ready/served analogue, so only an
//    acknowledgment clears it — is defensible and is the one most likely to overrule this suite;
//    it is refused here because acknowledgment is UNEMITTABLE today (`01-F5`'s `audit.*` family is
//    closed at six subtypes and none is an alarm ack, so `01-F4` refuses the emit), which under
//    that reading makes every print alarm permanent and the console useless on its first bad
//    night. ONE test (15) depends on this; overruling it costs one line.
//
// 4. **An order type the aging policy does not name is the policy's problem, not this module's.**
//    `AgingPolicy.thresholdsFor` already answers for `null` and for unknown types (`FALLBACK_AGING`
//    at 10/20, argued in `packages/device-config/src/aging.ts`). This module asks it and never
//    second-guesses it — which is what test 4 pins by CONFIGURING the policy and expecting the
//    answer to move.
//
// ── WHAT IS DELIBERATELY NOT ASSERTED, because the corpus does not decide it ────────────────────
//
// · **The order of the returned list.** `05-F21` calls the home screen "a glance" and names no
//   ordering; `27-F7` makes a *visual* order a work order only where an FR states one. Test 9
//   pins DETERMINISM (same input → same sequence) and nothing more. An implementation is free to
//   sort oldest-first; a test asserting that would be inventing policy.
// · **What happens to an alarm when its order is VOIDED or CANCELLED.** `05-F2` enumerates exactly
//   two exits (ready/served, acknowledged) and adds "never auto-dismissed silently". A void is
//   neither exit and dropping it silently is what the FR forbids; keeping it is a siren wall for
//   food nobody is cooking. Genuinely undecided — a founder call, reported, not guessed. No
//   fixture below sets `lines_total: 0`, which is the shape that case takes in the projection.
// · **`printer.status_changed(offline)`, `05-F3`'s other trigger.** It has NO payload schema in
//   `packages/domain`, so `01-F4` makes it unemittable, and a symbol-precise grep finds no
//   producer and no consumer anywhere in `apps/`, `services/` or `packages/`. Asserting behaviour
//   for an event that cannot exist would pin a fiction.
// · **Acknowledgment (`05-F2`'s second exit).** Unemittable — see interpretation 3. There is no
//   `acknowledged` input in the contract below, deliberately: a seam with no possible producer is
//   this wave's named defect, and `24 §3b` asks for the minimum code that closes the FR.

import { resolveAging } from "@restos/device-config/aging";
import type { KitchenQueueRow, OpenOrderRow } from "@restos/sync-client/fold-engine";
import { describe, expect, it } from "vitest";
import { type Alarm, type AlarmInput, alarmsFrom, type BranchFact } from "../alarms.js";

const MINUTE = 60_000;
/** An arbitrary fixed branch-time "now". Every fixture below is expressed as an offset from it. */
const NOW = 1_770_000_000_000;

/** `03-F14`'s shipped defaults: dine-in 10/20, delivery 15/25. */
const DEFAULT_AGING = resolveAging(undefined);

const queueRow = (over: Partial<KitchenQueueRow> & { order_id: string }): KitchenQueueRow => ({
  confirm_at: NOW - 5 * MINUTE,
  channel: "counter",
  age_basis: NOW - 5 * MINUTE,
  lines_ready: 0,
  lines_total: 2,
  ...over,
});

const orderRow = (over: Partial<OpenOrderRow> & { order_id: string }): OpenOrderRow => ({
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: NOW - 5 * MINUTE,
  settled: 0,
  table_ids_json: "[]",
  table_conflict: 0,
  pay_total: 0,
  repaid_total: 0,
  refund_total: 0,
  pay_attempts_json: "[]",
  refund_attempts_json: "[]",
  cap_violated: 0,
  exceptions_json: "[]",
  json_lines: "{}",
  ...over,
});

/**
 * A `kot.print_failed` fact as it reaches this view: the narrow read of a branch envelope.
 *
 * The declared field set is `01-F34`'s point — `global_seq`, `lamport_seq`, `device_created_at`
 * and `server_received_at` are absent BY DESIGN, and test 19 proves absence by poisoning them.
 */
const printFailed = (over: {
  id: string;
  order_id: string;
  printer_name: string;
  at?: number;
}): BranchFact => ({
  id: over.id,
  type: "kot.print_failed",
  branch_created_at: over.at ?? NOW - MINUTE,
  payload: { order_id: over.order_id, printer_name: over.printer_name },
});

/** One late dine-in order, `minutes` old, with nothing ready. Used by most tests below. */
const lateOrder = (
  order_id: string,
  minutes: number,
  over?: Partial<OpenOrderRow>,
): AlarmInput => ({
  queue: [
    queueRow({ order_id, age_basis: NOW - minutes * MINUTE, confirm_at: NOW - minutes * MINUTE }),
  ],
  orders: [orderRow({ order_id, ...over })],
  facts: [],
  now: NOW,
  aging: DEFAULT_AGING,
});

const ids = (alarms: readonly Alarm[]): readonly string[] => [...alarms.map((a) => a.id)].sort();

describe("05-F1 / 03-F14 — the late-order alarm and the threshold it fires on", () => {
  it("raises ONE alarm naming order, channel, table and age when an order crosses RED", () => {
    // `05-F1` names four nouns and this asserts all four, because a card that cannot say WHICH
    // order or WHICH table sends the manager hunting — the walk `05-F27` budgets taps to avoid.
    const input: AlarmInput = {
      ...lateOrder("order-late", 21),
      orders: [
        orderRow({
          order_id: "order-late",
          order_type: "dine_in",
          table_ids_json: JSON.stringify(["T7"]),
        }),
      ],
      queue: [
        queueRow({
          order_id: "order-late",
          channel: "phone",
          age_basis: NOW - 21 * MINUTE,
          confirm_at: NOW - 21 * MINUTE,
        }),
      ],
    };

    const alarms = alarmsFrom(input);

    expect(alarms).toHaveLength(1);
    const alarm = alarms[0] as Alarm;
    expect(alarm.kind).toBe("late_order");
    expect(alarm.order_id).toBe("order-late");
    // `05-F1`'s "naming order". There is no order NUMBER in the ledger (`01 §4` carries a UUID),
    // and the counter and the pass both already shout the first eight characters — the number the
    // manager reads has to be the number the cashier reads. PINNED, and the whole justification is
    // that the product must not derive one identifier two ways.
    expect(alarm.reference).toBe("order-late".slice(0, 8));
    expect(alarm.channel).toBe("phone");
    expect(alarm.tables).toEqual(["T7"]);
    expect(alarm.minutes).toBe(21);
  });

  it("does NOT raise at amber — red is the threshold, and 27-F14 allocates the two separately", () => {
    // The one-character mutation (`>= amberAt`) that this test exists for. `27-F14` gives amber
    // "ticket approaching due" and red "ticket overdue"; `05-F1` cites the RED threshold by name.
    // An alarm at amber is not a smaller version of this feature, it is a different colour's job.
    expect(alarmsFrom(lateOrder("order-amber", 12))).toEqual([]);
  });

  it("uses the threshold for THIS order's type — one now, two types, two answers", () => {
    // `03-F14`: "X/Y are org-configurable per ORDER TYPE (defaults: dine-in 10/20, delivery
    // 15/25)". At 22 minutes a dine-in order is overdue and a delivery order is not. Both rows are
    // in ONE input at ONE `now`, so an implementation with a single hardcoded number cannot pass
    // by accident and a control is unnecessary.
    const input: AlarmInput = {
      queue: [
        queueRow({
          order_id: "order-din",
          age_basis: NOW - 22 * MINUTE,
          confirm_at: NOW - 22 * MINUTE,
        }),
        queueRow({
          order_id: "order-del",
          age_basis: NOW - 22 * MINUTE,
          confirm_at: NOW - 22 * MINUTE,
        }),
      ],
      orders: [
        orderRow({ order_id: "order-din", order_type: "dine_in" }),
        orderRow({ order_id: "order-del", order_type: "delivery" }),
      ],
      facts: [],
      now: NOW,
      aging: DEFAULT_AGING,
    };

    expect(ids(alarmsFrom(input))).toHaveLength(1);
    expect((alarmsFrom(input)[0] as Alarm).order_id).toBe("order-din");
  });

  it("honours the ORG-CONFIGURED thresholds rather than the shipped defaults", () => {
    // `03 §7` puts aging thresholds in layer 2 and `packages/device-config` already resolves them.
    // This is the mutant where an implementation reaches for `DEFAULT_AGING_THRESHOLDS` directly
    // and the org's own configuration silently stops applying — a defect an operator experiences
    // as "I changed it and nothing happened", with every test green.
    const tightened = resolveAging("dine_in=5/9");
    const at10 = lateOrder("order-cfg", 10);

    expect(alarmsFrom({ ...at10, aging: DEFAULT_AGING })).toEqual([]);
    expect(alarmsFrom({ ...at10, aging: tightened })).toHaveLength(1);
  });

  it("ages from the CONFIRM anchor, so a failed print never hides a late order", () => {
    // `03-F14`'s second clause, verbatim. The fixture puts a print failure one minute ago on an
    // order confirmed twenty-one minutes ago: an implementation ageing from the most recent fact
    // it can find reports 1 and stays silent, which is the exact failure the clause forbids.
    const input: AlarmInput = {
      ...lateOrder("order-noprint", 21),
      facts: [
        printFailed({
          id: "evt-1",
          order_id: "order-noprint",
          printer_name: "grill",
          at: NOW - MINUTE,
        }),
      ],
    };

    const late = alarmsFrom(input).filter((a) => a.kind === "late_order");
    expect(late).toHaveLength(1);
    expect((late[0] as Alarm).minutes).toBe(21);
  });

  it("is INCLUSIVE at the red threshold (pinned interpretation 1) and silent one minute short", () => {
    expect(alarmsFrom(lateOrder("order-at", 20))).toHaveLength(1);
    expect(alarmsFrom(lateOrder("order-under", 19))).toEqual([]);
  });

  it("raises nothing for an order that was never confirmed — there is no queue row to age", () => {
    // `03-F14`'s timer basis IS `order.confirmed`, and `merge.ts` writes the queue row "iff
    // confirmed". An order sitting unconfirmed in a till's inbox is not late food.
    const input: AlarmInput = {
      queue: [],
      orders: [orderRow({ order_id: "order-unconfirmed", confirmed_at: null })],
      facts: [],
      now: NOW,
      aging: DEFAULT_AGING,
    };
    expect(alarmsFrom(input)).toEqual([]);
  });
});

describe("05-F4 — volume discipline: one alarm per order, collapsing on re-derivation", () => {
  it("raises ONE alarm for a late order with several outstanding lines, not one per line", () => {
    // `05-F1` says "an order (or line) crosses", which reads naturally as a per-line fan-out;
    // `05-F4` then says one alarm per ORDER. A three-line karahi order must not buzz three times.
    const input: AlarmInput = {
      ...lateOrder("order-multi", 25),
      queue: [
        queueRow({
          order_id: "order-multi",
          age_basis: NOW - 25 * MINUTE,
          confirm_at: NOW - 25 * MINUTE,
          lines_ready: 0,
          lines_total: 3,
        }),
      ],
    };
    expect(alarmsFrom(input)).toHaveLength(1);
  });

  it("CONTROL: two late orders raise two alarms with distinct ids", () => {
    // Without this, `alarmsFrom = () => [oneAlarm]` passes the test above. Attribution, not count.
    const input: AlarmInput = {
      queue: [
        queueRow({
          order_id: "order-a",
          age_basis: NOW - 30 * MINUTE,
          confirm_at: NOW - 30 * MINUTE,
        }),
        queueRow({
          order_id: "order-b",
          age_basis: NOW - 30 * MINUTE,
          confirm_at: NOW - 30 * MINUTE,
        }),
      ],
      orders: [orderRow({ order_id: "order-a" }), orderRow({ order_id: "order-b" })],
      facts: [],
      now: NOW,
      aging: DEFAULT_AGING,
    };

    const alarms = alarmsFrom(input);
    expect(alarms).toHaveLength(2);
    expect(new Set(alarms.map((a) => a.id)).size).toBe(2);
  });

  it("keeps the SAME alarm identity as the clock advances, and updates the age", () => {
    // `05-F4`, verbatim: "repeated crossings collapse into the existing alarm with an updated
    // age." A derivation minting a fresh id per call satisfies every other test in this file and
    // makes the console a siren wall the moment anything re-renders — the alarm the manager
    // dismissed reappears as a new one. The id FORMAT is deliberately not asserted; only that it
    // is stable, which is the property the FR is about.
    const input = lateOrder("order-stable", 21);
    const first = alarmsFrom(input);
    const later = alarmsFrom({ ...input, now: NOW + 5 * MINUTE });

    expect(first).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect((later[0] as Alarm).id).toBe((first[0] as Alarm).id);
    expect((later[0] as Alarm).minutes).toBe((first[0] as Alarm).minutes + 5);
  });

  it("is DETERMINISTIC — the same input yields the same sequence, twice", () => {
    // Ordering is deliberately unspecified (see the header). Determinism is not: a list that
    // reshuffles between renders is unreadable at a glance, and `05-F21` calls this a glance.
    const input: AlarmInput = {
      queue: ["o1", "o2", "o3"].map((id) =>
        queueRow({ order_id: id, age_basis: NOW - 40 * MINUTE, confirm_at: NOW - 40 * MINUTE }),
      ),
      orders: ["o1", "o2", "o3"].map((id) => orderRow({ order_id: id })),
      facts: [],
      now: NOW,
      aging: DEFAULT_AGING,
    };
    expect(alarmsFrom(input).map((a) => a.id)).toEqual(alarmsFrom(input).map((a) => a.id));
  });
});

describe("05-F2 — persistence: an alarm leaves when the food is ready, and not before", () => {
  it("clears the alarm once every line of the order is ready", () => {
    // `05-F2`: "until the order goes ready/served". `merge.ts` counts `lines_ready` over lines
    // whose cooking is done and excludes exited lines from `lines_total`, so equality is the
    // projection's own statement that the kitchen is finished with this order.
    const ready: AlarmInput = {
      ...lateOrder("order-done", 40),
      queue: [
        queueRow({
          order_id: "order-done",
          age_basis: NOW - 40 * MINUTE,
          confirm_at: NOW - 40 * MINUTE,
          lines_ready: 3,
          lines_total: 3,
        }),
      ],
    };
    expect(alarmsFrom(ready)).toEqual([]);
  });

  it("CONTROL: a PARTIALLY ready order stays alarmed — 2 of 3 is not ready", () => {
    // Without this, "clear whenever `lines_ready > 0`" passes the test above, and a manager stops
    // being told about an order whose naan never came — `03-F15`'s exact scenario.
    const partial: AlarmInput = {
      ...lateOrder("order-part", 40),
      queue: [
        queueRow({
          order_id: "order-part",
          age_basis: NOW - 40 * MINUTE,
          confirm_at: NOW - 40 * MINUTE,
          lines_ready: 2,
          lines_total: 3,
        }),
      ],
    };
    expect(alarmsFrom(partial)).toHaveLength(1);
  });

  it("does not drop an alarm as it ages further — it persists and the age grows", () => {
    // "Alarms persist in an active list … never auto-dismissed silently." The mutant this catches
    // is a window ("alarm only between Y and Y+10 minutes"), which looks like volume discipline
    // and is actually the console going quiet about the worst order in the kitchen.
    const input = lateOrder("order-old", 21);
    const much_later = alarmsFrom({ ...input, now: NOW + 90 * MINUTE });
    expect(much_later).toHaveLength(1);
    expect((much_later[0] as Alarm).minutes).toBe(21 + 90);
  });
});

describe("05-F3 — print-failure alarms (the `kot.print_failed` half; see the header for the other)", () => {
  it("raises an alarm naming the PRINTER and the ORDER, for an order that is not even late", () => {
    // `03-F5`: "KOT #142 did not print — grill printer offline". `05-F3` puts the same fact on the
    // console because the manager is off the floor. The order here is five minutes old — an
    // implementation that only ever alarms on aging reports nothing and the kitchen cooks nothing.
    const input: AlarmInput = {
      queue: [queueRow({ order_id: "order-p" })],
      orders: [orderRow({ order_id: "order-p" })],
      facts: [printFailed({ id: "evt-p1", order_id: "order-p", printer_name: "grill" })],
      now: NOW,
      aging: DEFAULT_AGING,
    };

    const alarms = alarmsFrom(input);
    expect(alarms).toHaveLength(1);
    const alarm = alarms[0] as Alarm;
    expect(alarm.kind).toBe("print_failed");
    expect(alarm.printer_name).toBe("grill");
    expect(alarm.order_id).toBe("order-p");
    expect(alarm.reference).toBe("order-p".slice(0, 8));
  });

  it("ignores branch facts that are not `kot.print_failed`", () => {
    // The mutant: alarming on every fact handed in. `kot.printed` is a SUCCESS and shares the
    // family prefix, which is exactly how a `startsWith("kot.")` slips through review.
    //
    // ⚠ THE PAYLOAD CARRIES `printer_name` DELIBERATELY, AND THE FIRST DRAFT OF THIS TEST DID NOT.
    // Measured: with the printer name omitted, the mutant that deletes the type check entirely
    // was killed by ZERO tests — a second guard (`typeof printer_name !== "string"`) was silently
    // doing the work, so this test asserted the type check while never reaching it. That is
    // AGENTS.md's round-3 defect ("the mechanism was built correctly and simply never aimed at
    // the case that matters") occurring inside the suite written to enforce it, and it was found
    // by mutating rather than by reading. `kot.printed`'s real payload has no `printer_name`; a
    // fixture that is *more* generous than the schema is what makes the assertion bite.
    const input: AlarmInput = {
      queue: [queueRow({ order_id: "order-ok" })],
      orders: [orderRow({ order_id: "order-ok" })],
      facts: [
        {
          id: "evt-ok",
          type: "kot.printed",
          branch_created_at: NOW - MINUTE,
          payload: { order_id: "order-ok", printer_name: "grill" },
        },
      ],
      now: NOW,
      aging: DEFAULT_AGING,
    };
    expect(alarmsFrom(input)).toEqual([]);
  });

  it("collapses repeated failures for the SAME order and printer into one alarm (interpretation 2)", () => {
    const input: AlarmInput = {
      queue: [queueRow({ order_id: "order-rep" })],
      orders: [orderRow({ order_id: "order-rep" })],
      facts: [
        printFailed({
          id: "evt-r1",
          order_id: "order-rep",
          printer_name: "grill",
          at: NOW - 4 * MINUTE,
        }),
        printFailed({
          id: "evt-r2",
          order_id: "order-rep",
          printer_name: "grill",
          at: NOW - 2 * MINUTE,
        }),
        printFailed({
          id: "evt-r3",
          order_id: "order-rep",
          printer_name: "grill",
          at: NOW - MINUTE,
        }),
      ],
      now: NOW,
      aging: DEFAULT_AGING,
    };
    expect(alarmsFrom(input)).toHaveLength(1);
  });

  it("CONTROL: two DIFFERENT printers failing on one order stay two alarms", () => {
    // Without this, "collapse to one alarm per order" passes the test above and the manager walks
    // to the grill, fixes it, and never learns the cold station is down too. `03-F5` names the
    // printer precisely because the fix is per-printer.
    const input: AlarmInput = {
      queue: [queueRow({ order_id: "order-two" })],
      orders: [orderRow({ order_id: "order-two" })],
      facts: [
        printFailed({ id: "evt-t1", order_id: "order-two", printer_name: "grill" }),
        printFailed({ id: "evt-t2", order_id: "order-two", printer_name: "cold" }),
      ],
      now: NOW,
      aging: DEFAULT_AGING,
    };

    const alarms = alarmsFrom(input);
    expect(alarms).toHaveLength(2);
    expect(new Set(alarms.map((a) => a.printer_name))).toEqual(new Set(["grill", "cold"]));
  });

  it("clears a print alarm once the order goes ready — 05-F3's 'same persistence rules'", () => {
    // ⚠ PINNED INTERPRETATION 3, and the one assertion in this file most likely to be overruled.
    // Read the header before changing an implementation to satisfy it.
    const input: AlarmInput = {
      queue: [queueRow({ order_id: "order-pr", lines_ready: 2, lines_total: 2 })],
      orders: [orderRow({ order_id: "order-pr" })],
      facts: [printFailed({ id: "evt-pr", order_id: "order-pr", printer_name: "grill" })],
      now: NOW,
      aging: DEFAULT_AGING,
    };
    expect(alarmsFrom(input)).toEqual([]);
  });

  it("raises BOTH kinds for one order that is late AND could not print", () => {
    // Two different facts, two different remedies, two different walks. Collapsing them because
    // they share an `order_id` would lose the printer — `05-F4` collapses repeated crossings of
    // ONE threshold, never two distinct alarms.
    const input: AlarmInput = {
      ...lateOrder("order-both", 30),
      facts: [printFailed({ id: "evt-b", order_id: "order-both", printer_name: "grill" })],
    };

    const alarms = alarmsFrom(input);
    expect(alarms).toHaveLength(2);
    expect(new Set(alarms.map((a) => a.kind))).toEqual(new Set(["late_order", "print_failed"]));
  });
});

describe("01-F34 / standing law 1 — the alarm list reads no ordering metadata", () => {
  const scenario = (suffix: string): AlarmInput => ({
    queue: [
      queueRow({
        order_id: `late${suffix}`,
        age_basis: NOW - 30 * MINUTE,
        confirm_at: NOW - 30 * MINUTE,
      }),
      queueRow({ order_id: `print${suffix}` }),
    ],
    orders: [orderRow({ order_id: `late${suffix}` }), orderRow({ order_id: `print${suffix}` })],
    // ⚠ TWO OF THESE THREE ARE A COLLAPSE CONTEST, AND THAT IS THE WHOLE POINT OF THE FIXTURE.
    // `e1` and `e3` are the SAME (order, printer) at DIFFERENT branch stamps, so any collapse rule
    // — first-wins, last-wins, min-id, max-id — picks a different survivor when the array is
    // reversed or the ids are relabelled. If ANY projected value is taken off the surviving FACT
    // rather than off the order, the two runs disagree and the assertions below fail.
    //
    // Measured: the first draft of this fixture gave every fact the same stamp and no two facts
    // shared a printer, so there was nothing for a collapse to contest — and the mutant that
    // reads a print alarm's age off the winning fact survived with ZERO kills. An invariance
    // property is only as strong as the divergence its fixture actually contains; this is the
    // same shape as `S-2`'s harness never running over its divergent-payload fixture.
    facts: [
      printFailed({
        id: `e1${suffix}`,
        order_id: `print${suffix}`,
        printer_name: "grill",
        at: NOW - 9 * MINUTE,
      }),
      printFailed({ id: `e2${suffix}`, order_id: `print${suffix}`, printer_name: "cold" }),
      printFailed({
        id: `e3${suffix}`,
        order_id: `print${suffix}`,
        printer_name: "grill",
        at: NOW - 2 * MINUTE,
      }),
    ],
    now: NOW,
    aging: DEFAULT_AGING,
  });

  /** Everything about an alarm EXCEPT its identity, which legitimately derives from the ids. */
  const values = (alarms: readonly Alarm[]): readonly string[] =>
    alarms
      .map((a) => `${a.kind}|${a.channel}|${a.minutes}|${a.printer_name}|${a.tables.join(",")}`)
      .sort();

  it("is invariant under ARRIVAL ORDER — reversing every input array changes no alarm", () => {
    // The single most natural way to break law 1 in this module: the rows arrive in an array, the
    // array has an order, and taking it is one line that looks like nothing.
    const base = scenario("");
    const reversed: AlarmInput = {
      ...base,
      queue: [...base.queue].reverse(),
      orders: [...base.orders].reverse(),
      facts: [...base.facts].reverse(),
    };
    // `24-F14` empty-match discipline: an invariance assertion over an EMPTY alarm set is
    // vacuously true and looks identical in the report. One late alarm, two collapsed print
    // alarms — and if that stops being three, this test has stopped testing anything.
    expect(alarmsFrom(base)).toHaveLength(3);
    expect(values(alarmsFrom(reversed))).toEqual(values(alarmsFrom(base)));
  });

  it("is invariant under a BIJECTIVE ID RELABEL — no projected value may depend on id sort order", () => {
    // Plain convergence testing is insufficient here for the reason `26` gives: a `min(id)`
    // tiebreak passes it while smuggling wall clock in through the UUIDv7 prefix. The relabel is
    // chosen to REVERSE the sort order of every id in the scenario.
    const base = scenario("");
    const relabelled = scenario("-zzz");
    expect(values(alarmsFrom(relabelled))).toHaveLength(3);
    expect(values(alarmsFrom(relabelled))).toEqual(values(alarmsFrom(base)));
  });

  it("never touches `global_seq`, `lamport_seq`, `device_created_at` or `server_received_at`", () => {
    // Absence proved by poisoning rather than by reading the diff — the technique `summary.ts`
    // already uses for the same law. A Proxy that throws the moment a forbidden field is READ.
    const forbidden = ["global_seq", "lamport_seq", "device_created_at", "server_received_at"];
    const poison = (fact: BranchFact): BranchFact =>
      new Proxy(fact as unknown as Record<string, unknown>, {
        get(target, property) {
          if (typeof property === "string" && forbidden.includes(property)) {
            throw new Error(`01-F34: the alarm view read ordering metadata (${property})`);
          }
          return Reflect.get(target, property);
        },
      }) as unknown as BranchFact;

    const base = scenario("");
    expect(() => alarmsFrom({ ...base, facts: base.facts.map(poison) })).not.toThrow();
  });
});
