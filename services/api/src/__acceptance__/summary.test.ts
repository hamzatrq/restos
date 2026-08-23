/**
 * `12-F9`/`12-F10`/`12-F22` — the nightly owner summary: what it answers, what it refuses to
 * answer, and who may see how much of it.
 *
 * Five sections, each pointed at a specific way this surface can be wrong:
 *
 *   §A  the numbers are right, and they come from the events the FRs name.
 *   §B  **law 1** — the answer is a function of the delivered SET. Order-free, id-relabel-invariant,
 *       and provably blind to every ordering field (they throw if touched).
 *   §C  **`01-F46`** — the business day is Asia/Karachi at 05:00, so a 01:30 sale banks to the night
 *       it was served. The whole point of the FR and the assertion nothing else in this repo makes
 *       on the cloud plane.
 *   §D  **Commandment 8** — `reportScope` decides how WIDE the answer is, not merely whether it
 *       happens. This is the section the middleware cannot cover.
 *   §E  **`00 §5.7`** — the report says what it does not know: the omissions, the unclosed day, the
 *       provisional stamps, the truncated window, and a refusing ledger.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — written by the session that wrote `summary.ts`, so
 * `24 §3`'s independent-oracle guarantee is not available and is not claimed. The mutation matrix
 * in `services/api/CLAUDE.md` is what stands in for it.
 */

import { businessDayBoundsOfDate, hashPin, paisa, sumPaisa } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import type { DayLedger, LedgerWindow } from "../ledger.js";
import { createApiServer } from "../server.js";
import { type NightlySummary, type SummaryEvent, summarise } from "../summary.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";

const ORG = "org-summary";
const BRANCH_A = "branch-lahore";
const BRANCH_B = "branch-karachi";
const SECRET = "summary-acceptance-session-secret-not-a-real-one";
const PASSWORD = "a-bootstrap-owner-password";

const OWNER_ID = "user-owner";
/** Assigned to BRANCH_A only — Appendix A's "own branch" reach. */
const MANAGER_A_ID = "user-manager-a";
const CASHIER_ID = "user-cashier";

/** `2026-08-09` in Asia/Karachi at the 05:00 cutover. Karachi is UTC+5, so the day starts 00:00Z. */
const DATE = "2026-08-09";
const DAY = businessDayBoundsOfDate(DATE);
/** Karachi wall hour → instant. `05:00` is offset 0. */
const at = (wall_hour: number, minute = 0): number =>
  DAY.start_ms + (((wall_hour - 5 + 24) % 24) * 60 + minute) * 60_000;

let seq = 0;
const event = (
  type: string,
  payload: Record<string, unknown>,
  options: {
    readonly at: number;
    readonly branch_id?: string;
    readonly actor?: string | null;
    readonly basis?: string;
  },
): SummaryEvent => ({
  id: `ev-${String(++seq).padStart(4, "0")}`,
  type,
  branch_id: options.branch_id ?? BRANCH_A,
  branch_created_at: options.at,
  time_basis: options.basis ?? "branch",
  actor_user_id: options.actor ?? null,
  payload,
});

const zeroExpected = {
  cash: 0,
  card: 0,
  raast: 0,
  khata_credit: 0,
  aggregator_receivable: 0,
};

/**
 * One trading day at BRANCH_A, plus one order at BRANCH_B so §D has something to leak.
 *
 * The numbers are chosen so every assertion below reads as an arithmetic claim rather than as a
 * fixture echo: Rs 450 × 2 and Rs 320 × 1 on the counter (Rs 1,220), Rs 600 × 1 on foodpanda, and
 * **a Rs 180 line rung at 01:30**, which is the `01-F46` case.
 *
 * **Every order also CLOSES (`01-F63`), because that act is where the day's money now comes from.**
 * `01-F82`/`02-F63` make `billed_paisa` the tax-inclusive rounded charge, and this fixture sits on
 * the shipped default posture (`none`, whole-rupee prices), so each attestation equals its own line
 * sum and every arithmetic claim below still reads as one. `summary-corrections.test.ts` is where
 * the attestation deliberately DIFFERS from the line sum — tax, rounding, a void and a comp — and
 * that file is what proves this fold READS the act rather than re-deriving it.
 */
const day = (): SummaryEvent[] => {
  seq = 0;
  return [
    event(
      "day.opened",
      { day_id: "day-1", opening_float_paisa: 500_00, prev_day_id: null },
      { at: at(5, 30) },
    ),
    event(
      "shift.opened",
      { shift_id: "shift-hina", prev_shift_id: null },
      { at: at(5, 35), actor: "user-hina" },
    ),

    // Counter: two lines on one order.
    event("order.created", { order_id: "ord-1", channel: "counter" }, { at: at(13) }),
    event(
      "order.line_added",
      {
        order_id: "ord-1",
        line_id: "l-1",
        item_id: "item-karahi",
        qty: 2,
        unit_price_paisa: 450_00,
      },
      { at: at(13, 5) },
    ),
    event(
      "order.line_added",
      { order_id: "ord-1", line_id: "l-2", item_id: "item-naan", qty: 1, unit_price_paisa: 320_00 },
      { at: at(13, 40) },
    ),

    // foodpanda, later the same evening.
    event("order.created", { order_id: "ord-2", channel: "foodpanda" }, { at: at(20) }),
    event(
      "order.line_added",
      {
        order_id: "ord-2",
        line_id: "l-3",
        item_id: "item-karahi",
        qty: 1,
        unit_price_paisa: 600_00,
      },
      { at: at(20, 10) },
    ),

    /**
     * **`01-F46`'s whole reason for existing.** 01:30 on the following CALENDAR date, which is
     * still this business day because the cutover is 05:00. Under a midnight boundary this order
     * would land on tomorrow's report and tonight's total would be Rs 180 light.
     */
    event("order.created", { order_id: "ord-3", channel: "counter" }, { at: at(1, 30) }),
    event(
      "order.line_added",
      {
        order_id: "ord-3",
        line_id: "l-4",
        item_id: "item-lassi",
        qty: 1,
        unit_price_paisa: 180_00,
      },
      { at: at(1, 30) },
    ),

    // `01-F63`'s closing acts. The stamp on each is the hour its BILL CLOSED, which is what the
    // curve buckets — minutes after that order's last line here, as it is at a counter.
    event(
      "order.settlement_closed",
      { order_id: "ord-1", billed_paisa: 1_220_00 },
      { at: at(13, 50) },
    ),
    event(
      "order.settlement_closed",
      { order_id: "ord-2", billed_paisa: 600_00 },
      { at: at(20, 20) },
    ),
    event(
      "order.settlement_closed",
      { order_id: "ord-3", billed_paisa: 180_00 },
      { at: at(1, 35) },
    ),

    // `02-F21` — two no-sale opens and one drawer open that is not a no-sale.
    event("cash.drawer_opened", { reason: "no_sale", shift_id: "shift-hina" }, { at: at(15) }),
    event("cash.drawer_opened", { reason: "no_sale", shift_id: "shift-hina" }, { at: at(16) }),
    event("cash.drawer_opened", { reason: "change", shift_id: "shift-hina" }, { at: at(17) }),
    event(
      "cash.paid_out",
      {
        amount_paisa: 200_00,
        reason: "vegetables",
        receipt_photo_ref: "ref-1",
        shift_id: "shift-hina",
      },
      { at: at(18) },
    ),

    /**
     * `26 §7`'s CARRIED facts. The variance here is **deliberately not** `counted − expected`:
     * a `02-F26` paid-out is drawer cash the naive subtraction never sees, so an implementation
     * that re-derived over/short would print a different number from the one the cashier signed.
     */
    event(
      "shift.closed",
      {
        shift_id: "shift-hina",
        expected_paisa_by_method: { ...zeroExpected, cash: 1_400_00, card: 600_00 },
        counted_cash_paisa: 1_150_00,
        variance_paisa: -50_00,
      },
      { at: at(2), actor: "user-hina" },
    ),
    event("cash.deposit_recorded", { amount_paisa: 1_000_00, day_id: "day-1" }, { at: at(2, 30) }),
    event("day.closed", { day_id: "day-1", counted_cash_paisa: 1_650_00 }, { at: at(3) }),

    // BRANCH_B — one order, so §D can prove a manager at A never sees it.
    event(
      "order.created",
      { order_id: "ord-b1", channel: "counter" },
      { at: at(19), branch_id: BRANCH_B },
    ),
    event(
      "order.line_added",
      {
        order_id: "ord-b1",
        line_id: "l-b1",
        item_id: "item-karahi",
        qty: 1,
        unit_price_paisa: 999_00,
      },
      { at: at(19), branch_id: BRANCH_B },
    ),
    event(
      "order.settlement_closed",
      { order_id: "ord-b1", billed_paisa: 999_00 },
      { at: at(19, 10), branch_id: BRANCH_B },
    ),
  ];
};

const onlyBranch = (events: readonly SummaryEvent[], branch: string): SummaryEvent[] =>
  events.filter((e) => e.branch_id === branch);

const fold = (events: readonly SummaryEvent[]): NightlySummary =>
  summarise(events, DAY.start_ms + 1);

const channel = (summary: NightlySummary, name: string) =>
  summary.sales.by_channel.find((row) => row.channel === name);

// ── §A · the numbers ───────────────────────────────────────────────────────────────────────────

describe("§A · 12-F10 — the blocks this ledger can answer", () => {
  it("totals sales by channel from 01-F63's closing acts, attributed by order.created (12-F10)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    // counter: 1,220 + 180 = 1,400 attested. foodpanda: 600 attested.
    expect(channel(summary, "counter")).toEqual({
      channel: "counter",
      orders: 2,
      billed_paisa: 1_400_00,
    });
    expect(channel(summary, "foodpanda")).toEqual({
      channel: "foodpanda",
      orders: 1,
      billed_paisa: 600_00,
    });
    expect(summary.sales.total_paisa).toBe(2_000_00);
    expect(summary.sales.orders).toBe(3);
  });

  it("states an EXPLICIT ZERO for every channel with no orders (01-F60, 02-F42)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    // A missing row cannot tell "no phone orders today" from "the phone figure was never computed".
    expect(summary.sales.by_channel).toHaveLength(5);
    expect(channel(summary, "phone")).toEqual({ channel: "phone", orders: 0, billed_paisa: 0 });
    expect(channel(summary, "whatsapp")?.billed_paisa).toBe(0);
    expect(channel(summary, "storefront")?.billed_paisa).toBe(0);
  });

  it("reads the shift's over/short as a CARRIED fact, never re-derived (26 §7, 02-F23)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    const shift = summary.cash.find((row) => row.shift_id === "shift-hina");
    expect(shift?.variance_paisa).toBe(-50_00);
    // The naive `counted − expected` is 1,150 − 1,400 = −250, and it is WRONG: the Rs 200 paid-out
    // left the drawer legitimately. An implementation that recomputed would print −250 here and
    // silently disagree with the number the cashier signed on the till.
    expect(shift?.counted_cash_paisa).toBe(1_150_00);
    expect(shift?.expected_cash_paisa).toBe(1_400_00);
    expect(shift?.paid_out_paisa).toBe(200_00);
  });

  it("attributes the shift from the ENVELOPE's actor, never a payload field (02-F45)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    expect(summary.cash[0]?.cashier_user_id).toBe("user-hina");
  });

  it("counts only reason=no_sale drawer opens (02-F21)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    // Three drawer opens were delivered; one was `change`.
    expect(summary.cash[0]?.no_sale_count).toBe(2);
  });

  it("ranks top items by revenue with an item_id tiebreak, never an envelope id (12-F10)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    // karahi: 450×2 + 600×1 = 1,500 across two orders and two channels.
    expect(summary.top_items[0]).toEqual({
      item_id: "item-karahi",
      qty: 3,
      revenue_paisa: 1_500_00,
    });
    expect(summary.top_items.map((row) => row.item_id)).toEqual([
      "item-karahi",
      "item-naan",
      "item-lassi",
    ]);
  });

  /**
   * **THE TIE, AND THE FIXTURE THAT DID NOT EXIST.** The ranking above has no two items at the
   * same revenue, so the tiebreak branch was never executed: the mutant that replaces it with
   * `return 0` — leaving the order to whatever `Array.prototype.sort` and insertion order agree on
   * — survived **0 of 204**. That is the round-3 defect exactly (`AGENTS.md`: the mechanism was
   * built correctly and never aimed at the case that matters), found by mutating rather than by
   * reading, inside the work that cites the law.
   *
   * Two items at identical revenue, delivered in BOTH orders, must rank identically — and by
   * `item_id`, which is a PAYLOAD field. An envelope-id tiebreak would be min-wall-clock in a
   * disguise (`26 §8`) and would let delivery order decide which dish an owner is shown first.
   */
  it("resolves a REVENUE TIE by item_id, identically under both delivery orders (26 §8)", () => {
    const tie = (first: string, second: string): SummaryEvent[] => [
      event("order.created", { order_id: "tie", channel: "counter" }, { at: at(12) }),
      event(
        "order.line_added",
        { order_id: "tie", line_id: "t1", item_id: first, qty: 1, unit_price_paisa: 700_00 },
        { at: at(12) },
      ),
      event(
        "order.line_added",
        { order_id: "tie", line_id: "t2", item_id: second, qty: 1, unit_price_paisa: 700_00 },
        { at: at(12) },
      ),
    ];
    const zebra = fold(tie("item-zebra", "item-apple"));
    const apple = fold(tie("item-apple", "item-zebra"));
    expect(zebra.top_items.map((row) => row.item_id)).toEqual(["item-apple", "item-zebra"]);
    expect(apple.top_items.map((row) => row.item_id)).toEqual(["item-apple", "item-zebra"]);
    // Both really are tied — otherwise this would be an ordinary ranking test wearing a costume.
    expect(zebra.top_items[0]?.revenue_paisa).toBe(zebra.top_items[1]?.revenue_paisa);
  });

  it("buckets the hourly curve on the CLOSING ACT's own branch stamp (12-F10, 01-F43)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    expect(summary.hourly).toHaveLength(24);
    // Offset 0 is the 05:00 cutover, so 13:00 is offset 8 and carries ord-1's Rs 1,220.
    expect(summary.hourly[0]?.wall_hour).toBe(5);
    expect(summary.hourly[8]).toEqual({ offset: 8, wall_hour: 13, billed_paisa: 1_220_00 });
    expect(summary.hourly[15]?.billed_paisa).toBe(600_00);
    // 01:30 is offset 20 — the last stretch of the same business day.
    expect(summary.hourly[20]).toEqual({ offset: 20, wall_hour: 1, billed_paisa: 180_00 });
  });

  /**
   * **THE FIXTURE ABOVE CANNOT TELL THE TWO BASES APART, WHICH IS WHY THIS ONE EXISTS.** Every
   * order there closes in the same hour its lines were rung, so a build bucketing on the LINE's
   * stamp reads the same curve — the round-3 defect exactly (a mechanism aimed one case away).
   * Here the lines are rung at 13:00 and the bill closes at 21:00, which is the ordinary table
   * service case and the only one that separates them.
   */
  it("buckets a table settled long after it was rung into the hour it was PAID (12-F10)", () => {
    const summary = fold([
      event("order.created", { order_id: "tbl", channel: "counter" }, { at: at(13) }),
      event(
        "order.line_added",
        {
          order_id: "tbl",
          line_id: "t-1",
          item_id: "item-karahi",
          qty: 1,
          unit_price_paisa: 450_00,
        },
        { at: at(13) },
      ),
      event("order.settlement_closed", { order_id: "tbl", billed_paisa: 450_00 }, { at: at(21) }),
    ]);
    expect(summary.hourly[8]?.billed_paisa).toBe(0);
    expect(summary.hourly[16]).toEqual({ offset: 16, wall_hour: 21, billed_paisa: 450_00 });
  });

  /**
   * `12-F21` — one number, everywhere. The curve and the headline are not two computations that
   * agree; they are one set of attestations bucketed two ways, so this identity holds by
   * construction and its failure means a bucket was dropped or double-counted.
   */
  it("makes the hourly curve TILE the day's total exactly (12-F10, 12-F21)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    // `DEC-MONEY-005` — the domain helper, never a raw `+` on a money field.
    const curve = sumPaisa(summary.hourly.map((bucket) => paisa(bucket.billed_paisa)));
    expect(curve).toBe(summary.sales.total_paisa);
    expect(curve).toBe(2_000_00);
  });

  it("carries the day's float, count and deposit (02-F22, 02-F24)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    expect(summary.days).toEqual([
      {
        day_id: "day-1",
        branch_id: BRANCH_A,
        closed: true,
        opening_float_paisa: 500_00,
        counted_cash_paisa: 1_650_00,
        deposit_paisa: 1_000_00,
      },
    ]);
  });
});

// ── §B · law 1 ─────────────────────────────────────────────────────────────────────────────────

/** Fisher–Yates against a fixed seed, so a failure is reproducible rather than "sometimes". */
const shuffled = <T>(items: readonly T[], seed: number): T[] => {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

/**
 * The four fields `01-F34`/`01-F45` forbid, installed as THROWING getters.
 *
 * A convergence test alone is insufficient and `26 §8` says why: a `min(envelope.id)` tiebreak
 * passes it while smuggling wall clock in through the UUIDv7 prefix. This is the stronger claim —
 * the fold cannot have read what it never survived touching.
 */
const poisoned = (event: SummaryEvent): SummaryEvent => {
  const copy: Record<string, unknown> = { ...event };
  for (const banned of ["global_seq", "lamport_seq", "device_created_at", "server_received_at"]) {
    Object.defineProperty(copy, banned, {
      get() {
        throw new Error(`01-F34 / 01-F45: the summary fold read \`${banned}\``);
      },
      enumerable: false,
    });
  }
  return copy as SummaryEvent;
};

describe("§B · 01-F34 — the answer is a function of the delivered SET", () => {
  const events = onlyBranch(day(), BRANCH_A);
  const control = fold(events);

  it("is byte-identical under every delivery order", () => {
    for (const seed of [1, 7, 99, 4242, 65_537]) {
      expect(JSON.stringify(fold(shuffled(events, seed)))).toBe(JSON.stringify(control));
    }
  });

  it("is byte-identical under a bijective envelope-id relabel (26 §8)", () => {
    // Reversed labels, so any surviving id comparison flips its answer. `min(id)` on a money field
    // is the exact defect this exists for.
    const n = events.length;
    const relabelled = events.map((e, i) => ({ ...e, id: `ev-${String(n - i).padStart(4, "0")}` }));
    expect(JSON.stringify(fold(shuffled(relabelled, 31)))).toBe(JSON.stringify(control));
  });

  it("never touches global_seq, lamport_seq, device_created_at or server_received_at", () => {
    expect(() => fold(shuffled(events.map(poisoned), 11))).not.toThrow();
    expect(JSON.stringify(fold(events.map(poisoned)))).toBe(JSON.stringify(control));
  });

  it("counts a redelivered envelope once — the same id twice changes nothing", () => {
    const twice = [...events, ...events];
    expect(JSON.stringify(fold(twice))).toBe(JSON.stringify(control));
  });

  /**
   * **THE ASYMMETRY, ASSERTED RATHER THAN ASSUMED — and it is the fold's own first finding.**
   *
   * The first draft of this test claimed that one INTENT arriving under two envelope ids collapses
   * everywhere. It does not, and the fold that made it fail is right: an idempotency key has to
   * come from somewhere, and only some `01 §4` payloads carry one.
   *
   *   * **Entity-keyed registers collapse** — `order.created` keys on `order_id`, `order.line_added`
   *     on `line_id`, and `shift.closed`/`day.closed` on their canonical payload bytes. Re-issuing
   *     the envelope id changes nothing, so a re-sent order is not a second sale.
   *   * **`cash.drawer_opened`, `cash.paid_out` and `cash.deposit_recorded` DO NOT**, because their
   *     payloads carry no key at all — `02-F21` names a reason, `02-F26` an amount, and neither
   *     names an attempt. Two envelope ids are therefore two events **by construction**: there is
   *     nothing in the bytes that could tell a re-sent no-sale from a second one.
   *
   * This is not a gap being papered over; it is exactly what
   * `packages/sync-client/src/folds/shift-cash.ts` does on the device (`noSale` is a `Set` of
   * envelope ids, `paidOut` and `deposits` are envelope-id-keyed maps), and the WHOLE VALUE of
   * matching it is that the owner's summary and the cashier's reconciliation cannot disagree about
   * how many times the drawer opened. A "smarter" dedupe here would be a second interpretation of
   * `02-F21`, which is `03-F40`'s two-sensor-bit-layouts defect on the theft-detection number.
   */
  it("collapses an entity-keyed intent under a new envelope id, and NOT a keyless drawer event", () => {
    const reissued = events.map((e) => ({ ...e, id: `${e.id}-again` }));
    const both = fold([...events, ...reissued]);

    // Entity-keyed: the money and the order count are untouched by the re-issue.
    expect(both.sales.total_paisa).toBe(control.sales.total_paisa);
    expect(both.sales.orders).toBe(control.sales.orders);
    expect(both.top_items).toEqual(control.top_items);
    expect(both.hourly).toEqual(control.hourly);
    expect(both.cash[0]?.variance_paisa).toBe(control.cash[0]?.variance_paisa);
    expect(both.days[0]?.opening_float_paisa).toBe(control.days[0]?.opening_float_paisa);

    // Keyless: two envelope ids are two events, matching `shift-cash.ts` exactly.
    expect(control.cash[0]?.no_sale_count).toBe(2);
    expect(both.cash[0]?.no_sale_count).toBe(4);
    expect(both.cash[0]?.paid_out_paisa).toBe(400_00);
    expect(both.days[0]?.deposit_paisa).toBe(2_000_00);
  });

  it("keeps money exact past 2^53 rather than letting delivery order decide it (law 3)", () => {
    // Two lines whose product overflows a double's exact-integer range. A running double would
    // give different answers for different delivery orders; BigInt gives one, and the fold reports
    // that it could not represent the total rather than truncating it.
    const huge: SummaryEvent[] = [
      event("order.created", { order_id: "o", channel: "counter" }, { at: at(12) }),
      event(
        "order.line_added",
        {
          order_id: "o",
          line_id: "a",
          item_id: "i",
          qty: 1,
          unit_price_paisa: Number.MAX_SAFE_INTEGER,
        },
        { at: at(12) },
      ),
      event(
        "order.line_added",
        {
          order_id: "o",
          line_id: "b",
          item_id: "i",
          qty: 1,
          unit_price_paisa: Number.MAX_SAFE_INTEGER,
        },
        { at: at(12) },
      ),
    ];
    const summary = fold(huge);
    expect(summary.honesty.anomalies).toContain("money_overflow");
    expect(summary.sales.total_paisa).toBe(0);
    expect(JSON.stringify(fold(shuffled(huge, 5)))).toBe(JSON.stringify(summary));
  });

  it("refuses to pick a winner when two members claim one line (01-F31)", () => {
    const base = onlyBranch(day(), BRANCH_A);
    const forged = base.map((e) =>
      e.payload.line_id === "l-1"
        ? { ...e, id: "ev-forged", payload: { ...e.payload, unit_price_paisa: 99_999_00 } }
        : e,
    );
    const summary = fold([...base, ...forged.filter((e) => e.id === "ev-forged")]);
    expect(summary.honesty.anomalies).toContain("order_line_divergence");
    // The disputed line contributes ZERO to the menu mix — not the honest member, and not the
    // forged one. The DAY's money is untouched, because it is the till's attestation and a
    // forged line cannot rewrite an act that was already appended (`01-F1`).
    const karahi = summary.top_items.find((row) => row.item_id === "item-karahi");
    expect(karahi).toEqual({ item_id: "item-karahi", qty: 1, revenue_paisa: 600_00 });
    expect(summary.sales.total_paisa).toBe(2_000_00);
  });

  /**
   * The same law one event family over, and the one that costs MONEY rather than a ranking: two
   * closing acts attesting two different bills for one order. `merge.ts` takes the LARGEST valid
   * snapshot for `uncovered_addition`'s ceiling, deliberately, because understating a ceiling is
   * the unsafe direction for a CHECK. This is not a check — it is the figure on an owner's screen,
   * and picking the larger of two disputed attestations prints a number no act supports.
   */
  it("refuses to pick a winner when two acts close ONE bill at two figures (01-F31)", () => {
    const base = onlyBranch(day(), BRANCH_A);
    const rival = event(
      "order.settlement_closed",
      { order_id: "ord-1", billed_paisa: 9_999_00 },
      { at: at(13, 50) },
    );
    const summary = fold([...base, rival]);
    expect(summary.honesty.anomalies).toContain("order_close_divergence");
    // Rs 1,220 leaves the total; neither Rs 1,220 nor Rs 9,999 is picked.
    expect(summary.sales.total_paisa).toBe(2_000_00 - 1_220_00);
    // The ORDER is still counted — the act happened, only its evidence is disputed (`01-F63`).
    expect(summary.sales.orders).toBe(3);
  });
});

// ── §C · the business day ──────────────────────────────────────────────────────────────────────

describe("§C · 01-F46 — Asia/Karachi, 05:00 cutover", () => {
  it("banks a 01:30 sale to the night it was served, not to the calendar date", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    expect(summary.business_date).toBe(DATE);
    // The 01:30 order is `ord-3`, and its Rs 180 is inside the counter figure and the day total.
    expect(channel(summary, "counter")?.orders).toBe(2);
    expect(summary.sales.total_paisa).toBe(2_000_00);
    // Its instant falls on the FOLLOWING calendar date **in Asia/Karachi**, which is the whole
    // point — and the zone is the assertion, not decoration. Read in UTC the same instant is still
    // 2026-08-09, so a test that used `toISOString()` would pass against a UTC-anchored boundary
    // and prove nothing about `01-F46`. (The first draft of this line did exactly that.)
    const rung = at(1, 30);
    const karachi = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(rung);
    expect(karachi).toBe("2026-08-10");
    expect(new Date(rung).toISOString().slice(0, 10)).toBe("2026-08-09");
    expect(rung).toBeGreaterThanOrEqual(DAY.start_ms);
    expect(rung).toBeLessThan(DAY.end_ms);
  });

  it("tiles consecutive days with no gap and no double count", () => {
    const next = businessDayBoundsOfDate("2026-08-10");
    expect(next.start_ms).toBe(DAY.end_ms);
  });

  it("refuses a business date that does not exist rather than rolling into the next month", () => {
    expect(() => businessDayBoundsOfDate("2026-02-30")).toThrow(/no such business date/);
    expect(() => businessDayBoundsOfDate("2026-8-9")).toThrow(/YYYY-MM-DD/);
  });
});

// ── the host, for §D and §E ────────────────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof createApiServer>>;
const tokens = new Map<string, string>();
/** Every window the procedure asked for, so §D can assert the NARROWING reached the reader. */
const asked: LedgerWindow[] = [];

const users = async (): Promise<UserRecord[]> => {
  const password_hash = await hashPin(PASSWORD);
  return [
    {
      user_id: OWNER_ID,
      org_id: ORG,
      email: "owner@summary.test",
      password_hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    {
      user_id: MANAGER_A_ID,
      org_id: ORG,
      email: "manager-a@summary.test",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH_A, status: "active" }],
    },
    {
      user_id: CASHIER_ID,
      org_id: ORG,
      email: "cashier@summary.test",
      password_hash,
      assignments: [{ role: "cashier", branch_id: BRANCH_A, status: "active" }],
    },
  ];
};

/**
 * A ledger that HONOURS the branch filter, which is the only way §D means anything.
 *
 * A reader that ignored `branch_ids` would make the procedure's second `filter` the sole defence,
 * and the test would then pass under a mutant that deleted the narrowing from the QUERY. Both ends
 * are exercised: this honours the filter, and `§D`'s last test proves the resolver also filters
 * what it received.
 */
const recordingLedger = (events: readonly SummaryEvent[], truncated = false): DayLedger => ({
  read: (window) => {
    asked.push(window);
    const inWindow = events.filter(
      (e) => e.branch_created_at >= window.from_ms && e.branch_created_at < window.to_ms,
    );
    const scoped =
      window.branch_ids === null
        ? inWindow
        : inWindow.filter((e) => window.branch_ids?.includes(e.branch_id) === true);
    return Promise.resolve({ events: scoped, truncated, latest_arrival_ms: DAY.end_ms - 60_000 });
  },
});

type Reply = { status: number; body: unknown };

const summaryFor = async (who: string | null, input: unknown = {}): Promise<Reply> => {
  const bearer = who === null ? undefined : `Bearer ${tokens.get(who) as string}`;
  const response = await app.inject({
    method: "GET",
    url: `/trpc/summary.nightly?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`,
    ...(bearer === undefined ? {} : { headers: { authorization: bearer } }),
  });
  const raw = response.json() as { result?: { data?: unknown }; error?: unknown };
  const data =
    raw.result?.data === undefined ? undefined : superjson.deserialize(raw.result.data as never);
  return { status: response.statusCode, body: raw.error ?? data };
};

const login = async (email: string, who: string): Promise<void> => {
  const response = await app.inject({
    method: "POST",
    url: "/trpc/auth.login",
    payload: superjson.serialize({ email, password: PASSWORD }) as object,
  });
  const raw = response.json() as { result: { data: unknown } };
  const { token } = superjson.deserialize(raw.result.data as never) as { token: string };
  tokens.set(who, token);
};

beforeAll(async () => {
  app = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now: () => DAY.start_ms + 20 * 3_600_000,
    ledger: recordingLedger(day()),
  });
  await login("owner@summary.test", OWNER_ID);
  await login("manager-a@summary.test", MANAGER_A_ID);
  await login("cashier@summary.test", CASHIER_ID);
});

// ── §D · Commandment 8 ─────────────────────────────────────────────────────────────────────────

type Body = NightlySummary & {
  readonly scope: { readonly covers: readonly string[] | null };
};

describe("§D · Commandment 8 — reportScope decides how WIDE the answer is", () => {
  it("gives an owner the org roll-up across every branch (12-F22, Appendix A 'everything')", async () => {
    asked.length = 0;
    const reply = await summaryFor(OWNER_ID, { business_date: DATE });
    expect(reply.status).toBe(200);
    const body = reply.body as Body;
    expect(body.scope.covers).toBeNull();
    expect([...body.branch_ids].sort()).toEqual([BRANCH_B, BRANCH_A].sort());
    // 2,000 at Lahore + 999 at Karachi.
    expect(body.sales.total_paisa).toBe(2_999_00);
    expect(asked[0]?.branch_ids).toBeNull();
  });

  /**
   * **THE SCOPE ASSERTION.** A branch manager asking about her OWN branch passes `can()` — the
   * middleware is satisfied and cannot help here. Only `summaryBranchScope` stops the resolver
   * folding the whole org, so this is the test that dies when the narrowing is deleted.
   */
  it("narrows a branch manager to her own branch, and the other branch's money is ABSENT", async () => {
    asked.length = 0;
    const reply = await summaryFor(MANAGER_A_ID, { business_date: DATE, branch_id: BRANCH_A });
    expect(reply.status).toBe(200);
    const body = reply.body as Body;
    expect(body.scope.covers).toEqual([BRANCH_A]);
    expect(body.branch_ids).toEqual([BRANCH_A]);
    // The number is the assertion: Rs 999 at Karachi must not be in it.
    expect(body.sales.total_paisa).toBe(2_000_00);
    expect(body.sales.total_paisa).not.toBe(2_999_00);
    // …and the narrowing reached the READER, so a wide query never left this process.
    expect(asked[0]?.branch_ids).toEqual([BRANCH_A]);
  });

  it("refuses a branch manager asking about a branch she holds no assignment at", async () => {
    const reply = await summaryFor(MANAGER_A_ID, { business_date: DATE, branch_id: BRANCH_B });
    expect(reply.status).toBe(403);
  });

  it("refuses a branch manager asking for the org roll-up", async () => {
    // `branch_id: null` resolves to org-wide assignments only, which she does not hold.
    const reply = await summaryFor(MANAGER_A_ID, { business_date: DATE });
    expect(reply.status).toBe(403);
  });

  it("refuses a cashier outright — 'own shift only' cannot answer a day (Appendix A)", async () => {
    for (const input of [{ business_date: DATE }, { business_date: DATE, branch_id: BRANCH_A }]) {
      expect((await summaryFor(CASHIER_ID, input)).status).toBe(403);
    }
  });

  it("refuses an unauthenticated request", async () => {
    expect((await summaryFor(null, { business_date: DATE })).status).toBe(401);
  });

  it("takes org_id from the SUBJECT — a request stating another org changes nothing", async () => {
    asked.length = 0;
    await summaryFor(OWNER_ID, { business_date: DATE, org_id: "org-somebody-else" });
    expect(asked[0]?.org_id).toBe(ORG);
  });

  it("still filters the rows it received, so a reader that ignored the scope cannot leak", async () => {
    // The resolver's second narrowing, proved directly: a ledger that answers with EVERYTHING.
    const leaky: DayLedger = {
      read: () =>
        Promise.resolve({ events: day(), truncated: false, latest_arrival_ms: DAY.end_ms }),
    };
    const host = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now: () => DAY.start_ms + 20 * 3_600_000,
      ledger: leaky,
    });
    const response = await host.inject({
      method: "POST",
      url: "/trpc/auth.login",
      payload: superjson.serialize({
        email: "manager-a@summary.test",
        password: PASSWORD,
      }) as object,
    });
    const { token } = superjson.deserialize(
      (response.json() as { result: { data: unknown } }).result.data as never,
    ) as { token: string };
    const read = await host.inject({
      method: "GET",
      url: `/trpc/summary.nightly?input=${encodeURIComponent(
        JSON.stringify(superjson.serialize({ business_date: DATE, branch_id: BRANCH_A })),
      )}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = superjson.deserialize(
      (read.json() as { result: { data: unknown } }).result.data as never,
    ) as NightlySummary;
    expect(body.branch_ids).toEqual([BRANCH_A]);
    expect(body.sales.total_paisa).toBe(2_000_00);
  });
});

// ── §E · honesty ───────────────────────────────────────────────────────────────────────────────

describe("§E · 00 §5.7 — the report says what it does not know", () => {
  it("carries the OMISSIONS to the screen, each naming its FR (Commandment 2)", async () => {
    const reply = await summaryFor(OWNER_ID, { business_date: DATE });
    const body = reply.body as NightlySummary;
    const blocks = body.omissions.map((o) => o.block);
    // ⚠ This line read `"Voids, comps and discounts"` and was GREEN while the entry it pinned had
    // become false in three clauses at once — schemas, emitter and counter surface all shipped.
    // A test that pins a stale claim is what keeps a stale claim on an owner's screen.
    expect(blocks).not.toContain("Voids, comps and discounts");
    expect(blocks).toContain("Comps and discounts NETTED OUT of the day's takings");
    expect(blocks).toContain("Purchases and wastage logged");
    expect(blocks).toContain("Estimated gross margin");
    expect(blocks).toContain("What's odd (exception alerts)");
    expect(blocks).toContain("Tips");
    // Every omission names an FR, so a reader can check the claim rather than trust it.
    for (const omission of body.omissions) {
      expect(omission.fr).toMatch(/^(\d\d-F\d+[a-z]?|DEC-[A-Z]+-\d+)$/);
      expect(omission.reason.length).toBeGreaterThan(40);
    }
  });

  /**
   * ⚠ **THIS TEST USED TO FORBID THE WORDS `void`, `comp` AND `discount` TOO, AND IT WAS RIGHT
   * WHEN WRITTEN AND WRONG BY THE TIME IT WAS READ.** All three now have schemas, an emitter and a
   * counter surface, so a report that carried no such figure would be the missing block the
   * `OMISSIONS` mechanism exists to prevent — and it would leave `raita · 2 sold` unexplained.
   * What survives unchanged is `margin` and `tip`, which genuinely cannot be computed: `12-F11`
   * omits the margin line below `13-F5`'s coverage precondition and `DEC-MONEY-004` forbids a tip
   * field until `tip.pooled`/`tip.paid_out` enter the `01 §4` catalog.
   */
  it("never reports a margin or tip figure ANYWHERE in the answer (12-F11, DEC-MONEY-004)", () => {
    const summary = fold(onlyBranch(day(), BRANCH_A));
    const numbers = JSON.stringify({
      sales: summary.sales,
      cash: summary.cash,
      corrections: summary.corrections,
      top_items: summary.top_items,
      hourly: summary.hourly,
      days: summary.days,
      honesty: summary.honesty,
    });
    for (const forbidden of ["margin", "tip"]) {
      expect(numbers.toLowerCase()).not.toContain(forbidden);
    }
    // …and the day's money block still carries no correction term of its own: `01-F30`'s three
    // are ABSENT (`DEC-MONEY-010`), so nothing here may look like a netting that did not happen.
    for (const forbidden of ["void", "comp", "discount"]) {
      expect(JSON.stringify(summary.sales).toLowerCase()).not.toContain(forbidden);
    }
  });

  it("says the day is not closed instead of reporting a smaller number confidently (12-F9)", () => {
    const open = onlyBranch(day(), BRANCH_A).filter((e) => e.type !== "day.closed");
    const summary = fold(open);
    expect(summary.honesty.every_day_closed).toBe(false);
    // The closed fixture is the control — a one-branch difference, so the assertion is attributable.
    expect(fold(onlyBranch(day(), BRANCH_A)).honesty.every_day_closed).toBe(true);
  });

  it("counts a shift left open rather than pretending it reconciled", () => {
    const open = onlyBranch(day(), BRANCH_A).filter((e) => e.type !== "shift.closed");
    const summary = fold(open);
    expect(summary.honesty.open_shifts).toBe(1);
    expect(summary.cash[0]?.variance_paisa).toBeNull();
    expect(summary.cash[0]?.counted_cash_paisa).toBeNull();
  });

  it("counts provisional stamps without dropping their money (01-F44)", () => {
    const provisional = onlyBranch(day(), BRANCH_A).map((e) =>
      e.payload.line_id === "l-1" ? { ...e, time_basis: "branch_provisional" } : e,
    );
    const summary = fold(provisional);
    expect(summary.honesty.provisional_stamp_events).toBe(1);
    // Reported, not dropped: understating the day is the worse of the two errors.
    expect(summary.sales.total_paisa).toBe(2_000_00);
    expect(fold(onlyBranch(day(), BRANCH_A)).honesty.provisional_stamp_events).toBe(0);
  });

  it("reports a truncated window, so a floor is never read as a total", async () => {
    const host = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now: () => DAY.start_ms,
      ledger: recordingLedger(day(), true),
    });
    const response = await host.inject({
      method: "POST",
      url: "/trpc/auth.login",
      payload: superjson.serialize({ email: "owner@summary.test", password: PASSWORD }) as object,
    });
    const { token } = superjson.deserialize(
      (response.json() as { result: { data: unknown } }).result.data as never,
    ) as { token: string };
    const read = await host.inject({
      method: "GET",
      url: `/trpc/summary.nightly?input=${encodeURIComponent(
        JSON.stringify(superjson.serialize({ business_date: DATE })),
      )}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = superjson.deserialize(
      (read.json() as { result: { data: unknown } }).result.data as never,
    ) as NightlySummary;
    expect(body.honesty.truncated).toBe(true);
  });

  it("names the shift whose open fell outside the window rather than inventing a cashier", () => {
    const noOpen = onlyBranch(day(), BRANCH_A).filter((e) => e.type !== "shift.opened");
    const summary = fold(noOpen);
    expect(summary.cash[0]?.cashier_user_id).toBeNull();
    expect(summary.honesty.anomalies).toContain("shift_open_outside_window");
  });

  it("reports 12-F8's sync instant from the server, never from a client clock", async () => {
    const reply = await summaryFor(OWNER_ID, { business_date: DATE });
    const body = reply.body as NightlySummary & {
      readonly sync: { latest_arrival_ms: number | null; server_now_ms: number };
    };
    expect(body.sync.latest_arrival_ms).toBe(DAY.end_ms - 60_000);
    expect(body.sync.server_now_ms).toBe(DAY.start_ms + 20 * 3_600_000);
  });

  /**
   * **THE SEAM.** A host with no ledger REFUSES; it does not answer `Rs 0`. AGENTS.md measures the
   * stub shape as invisible to every rail here — Rule B asks whether a member is supplied, never
   * whether what was supplied is real — and on this surface an empty answer is a complete,
   * confident, entirely wrong summary for a restaurant that traded normally.
   */
  it("REFUSES when no ledger is configured, rather than rendering Rs 0 (00 §5.7)", async () => {
    const host = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now: () => DAY.start_ms,
    });
    const response = await host.inject({
      method: "POST",
      url: "/trpc/auth.login",
      payload: superjson.serialize({ email: "owner@summary.test", password: PASSWORD }) as object,
    });
    const { token } = superjson.deserialize(
      (response.json() as { result: { data: unknown } }).result.data as never,
    ) as { token: string };
    const read = await host.inject({
      method: "GET",
      url: `/trpc/summary.nightly?input=${encodeURIComponent(
        JSON.stringify(superjson.serialize({ business_date: DATE })),
      )}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(500);
    expect(read.body).toContain("no ledger reader is configured");
    expect(read.body).not.toContain('"total_paisa":0');
  });
});
