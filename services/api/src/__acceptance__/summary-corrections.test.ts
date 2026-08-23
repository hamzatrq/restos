/**
 * ACCEPTANCE TESTS — `12-F10`'s day total, its bullet-3 corrections block, and the two defects an
 * end-to-end run found on 2026-08-23.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED (`24 §3` step 2, and R66's per-path tiering).** Written by the
 * session that changed `summary.ts`, so the independent-oracle guarantee is NOT available here and
 * is not claimed. What stands in for it is the mutation matrix in `services/api/CLAUDE.md`, run
 * with a negative control, and the fact that every number below was **measured on a real system
 * before this file existed** rather than derived from the implementation.
 *
 * ── THE DAY THIS FILE REPRODUCES ─────────────────────────────────────────────────────────────
 *
 * Four orders rung by clicking a real Electron till at 1366×768, tax on at **1600 bps exclusive**,
 * `charge_rounding_paisa = 100`, with a void, a comp and a discount among them. Three readers gave
 * three different totals for one day, and this surface gave the third:
 *
 *   ledger, `Σ order.settlement_closed.billed_paisa`   **Rs 2,968.00**   ← the truth
 *   back office *Summary → Billed*                     **Rs 2,679.00**   ← what this file fixes
 *
 * Rs 2,679 decomposed **exactly** as `913 + 853 + 509 + 404`: four raw pre-tax line sums, with
 * both voided Raitas still inside them. The item table read `raita · 2 sold · Rs 120` for two
 * dishes nobody sold. The fixture below reproduces both numbers from one event set, which is what
 * makes each assertion a claim about the fold rather than an echo of it.
 *
 * The per-order arithmetic, so every figure here is checkable rather than trusted:
 *
 *   ord-1  913 raw − 60 voided = 853  ×1.16 = 989.48 → **989**
 *   ord-2  853 raw − 60 voided = 793  ×1.16 = 919.88 → **920**
 *   ord-3  509 raw, comp Rs 60 RECORDED and not subtracted   ×1.16 = 590.44 → **590**
 *   ord-4  404 raw, discount Rs 40 RECORDED and not subtracted ×1.16 = 468.64 → **469**
 *                                                                       Σ = **2,968**
 *
 * The menu prices are RECONSTRUCTED to land those four order totals — the run's own catalog is not
 * in this repo — so `item-chai` carries three different prices across three orders. That is legal
 * and deliberate: `01-F53` snapshots the price into each `order.line_added`, so a line's money is
 * its own and a catalog change never rewrites a bill.
 *
 * ── WHAT EACH SECTION IS AIMED AT ────────────────────────────────────────────────────────────
 *
 *   §A  the day's money is the ledger's, to the paisa — and is provably NOT the line sum.
 *   §B  a voided line leaves the item table and its unit count, and `merge.ts`'s contested case
 *       (`CONTESTED_LINE_BILLABLE`) is honoured rather than approximated.
 *   §C  a comp and a discount are COUNTED and NOT SUBTRACTED — the opposite error, and the one a
 *       fix aimed at voids alone would introduce.
 *   §D  `12-F10`'s *"and by whom"*, which is TWO identities (`02-F41` + `02-F20`).
 *   §E  law 1 over the whole of it — order-free, relabel-invariant, blind to ordering metadata.
 *   §F  the honest edges: unsettled, disputed, unattested, unkeyed. None of them guesses.
 *   §G  the `OMISSIONS` entry that told an owner the opposite of the truth.
 */

import { addPaisa, businessDayBoundsOfDate, paisa, sumPaisa } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { type NightlySummary, type SummaryEvent, summarise } from "../summary.js";

const BRANCH = "branch-lahore";
const CASHIER = "user-hina";
const MANAGER = "user-ayesha";

/** `2026-08-09` in Asia/Karachi at the 05:00 cutover (`01-F46`). */
const DAY = businessDayBoundsOfDate("2026-08-09");
const at = (wall_hour: number, minute = 0): number =>
  DAY.start_ms + (((wall_hour - 5 + 24) % 24) * 60 + minute) * 60_000;

/** Explicit envelope ids, so §E can shuffle without the shuffle changing the ids under test. */
const event = (
  id: string,
  type: string,
  payload: Record<string, unknown>,
  at_ms: number,
  actor: string | null = null,
): SummaryEvent => ({
  id,
  type,
  branch_id: BRANCH,
  branch_created_at: at_ms,
  time_basis: "branch",
  actor_user_id: actor,
  payload,
});

const line = (
  id: string,
  order_id: string,
  line_id: string,
  item_id: string,
  qty: number,
  unit_price_paisa: number,
  at_ms: number,
): SummaryEvent =>
  event(id, "order.line_added", { order_id, line_id, item_id, qty, unit_price_paisa }, at_ms);

/** `02-F20`/`02-F8`'s post-confirm exit — the event that MOVES a void's money (`DEC-MONEY-010`). */
const exited = (
  id: string,
  order_id: string,
  line_id: string,
  state: string,
  at_ms: number,
): SummaryEvent =>
  event(
    id,
    "order.line_state_changed",
    {
      order_id,
      line_ids: [line_id],
      state,
      line_context: { [line_id]: { to: state, from_states: ["confirmed"], preds: [] } },
    },
    at_ms,
  );

/** `01-F83`'s keyed corrective. The approver is a PAYLOAD field; the actor is on the ENVELOPE. */
const corrective = (
  id: string,
  type: string,
  spec: {
    order_id: string;
    amount_paisa: number;
    reason: string;
    approver_user_id: string | null;
    adjustment_attempt_id: string;
  },
  at_ms: number,
  actor: string | null,
): SummaryEvent => event(id, type, { ...spec }, at_ms, actor);

const closed = (id: string, order_id: string, billed_paisa: number, at_ms: number): SummaryEvent =>
  event(id, "order.settlement_closed", { order_id, billed_paisa }, at_ms);

/** What the ledger holds for that day. Rs 2,968.00, and the naive line sum is Rs 2,679.00. */
const LEDGER_TRUTH_PAISA = 2_968_00;
const NAIVE_LINE_SUM_PAISA = 2_679_00;
/** The line sum with the two voided Raitas taken out — still not the answer, because of tax. */
const MENU_MIX_PAISA = 2_559_00;

const theDay = (): SummaryEvent[] => [
  // ── ord-1 · counter · one Raita voided after the KOT, approved by the manager ───────────────
  event("e01", "order.created", { order_id: "ord-1", channel: "counter" }, at(13)),
  line("e02", "ord-1", "l-1", "item-karahi", 1, 450_00, at(13, 2)),
  line("e03", "ord-1", "l-2", "item-kebab", 1, 320_00, at(13, 3)),
  line("e04", "ord-1", "l-3", "item-chai", 1, 83_00, at(13, 4)),
  line("e05", "ord-1", "l-4", "item-raita", 1, 60_00, at(13, 5)),
  corrective(
    "e06",
    "void.recorded",
    {
      order_id: "ord-1",
      amount_paisa: 60_00,
      reason: "wrong table",
      approver_user_id: MANAGER,
      adjustment_attempt_id: "adj-void-1",
    },
    at(13, 40),
    CASHIER,
  ),
  exited("e07", "ord-1", "l-4", "voided", at(13, 40)),
  closed("e08", "ord-1", 989_00, at(13, 50)),

  // ── ord-2 · counter · the manager voids the second Raita herself, unsupervised ──────────────
  event("e09", "order.created", { order_id: "ord-2", channel: "counter" }, at(20)),
  line("e10", "ord-2", "l-5", "item-karahi", 1, 450_00, at(20, 1)),
  line("e11", "ord-2", "l-6", "item-lassi", 1, 180_00, at(20, 2)),
  line("e12", "ord-2", "l-7", "item-naan", 1, 60_00, at(20, 3)),
  line("e13", "ord-2", "l-8", "item-chai", 1, 103_00, at(20, 4)),
  line("e14", "ord-2", "l-9", "item-raita", 1, 60_00, at(20, 5)),
  corrective(
    "e15",
    "void.recorded",
    {
      order_id: "ord-2",
      amount_paisa: 60_00,
      // `permissions.ts` gives `branch_manager` an outright allow on `order.void_after_kot`, so
      // there is no second identity to record and `null` is the FACT rather than a gap.
      approver_user_id: null,
      reason: "customer changed mind",
      adjustment_attempt_id: "adj-void-2",
    },
    at(20, 15),
    MANAGER,
  ),
  exited("e16", "ord-2", "l-9", "voided", at(20, 15)),
  closed("e17", "ord-2", 920_00, at(20, 20)),

  // ── ord-3 · foodpanda · a COMP: recorded, and the bill does NOT move ───────────────────────
  event("e18", "order.created", { order_id: "ord-3", channel: "foodpanda" }, at(21)),
  line("e19", "ord-3", "l-10", "item-biryani", 1, 380_00, at(21, 1)),
  line("e20", "ord-3", "l-11", "item-naan", 1, 60_00, at(21, 2)),
  line("e21", "ord-3", "l-12", "item-chai", 1, 69_00, at(21, 3)),
  corrective(
    "e22",
    "comp.recorded",
    {
      order_id: "ord-3",
      amount_paisa: 60_00,
      reason: "late delivery",
      approver_user_id: MANAGER,
      adjustment_attempt_id: "adj-comp-1",
    },
    at(21, 5),
    CASHIER,
  ),
  closed("e23", "ord-3", 590_00, at(21, 10)),

  // ── ord-4 · counter · a DISCOUNT: recorded, and the bill does NOT move ─────────────────────
  event("e24", "order.created", { order_id: "ord-4", channel: "counter" }, at(22)),
  line("e25", "ord-4", "l-13", "item-kebab", 1, 320_00, at(22, 1)),
  line("e26", "ord-4", "l-14", "item-naan", 1, 84_00, at(22, 2)),
  corrective(
    "e27",
    "discount.recorded",
    {
      order_id: "ord-4",
      amount_paisa: 40_00,
      reason: "regular",
      approver_user_id: MANAGER,
      adjustment_attempt_id: "adj-disc-1",
    },
    at(22, 20),
    CASHIER,
  ),
  closed("e28", "ord-4", 469_00, at(22, 30)),
];

const fold = (events: readonly SummaryEvent[]): NightlySummary =>
  summarise(events, DAY.start_ms + 1);

const channelOf = (summary: NightlySummary, name: string) =>
  summary.sales.by_channel.find((row) => row.channel === name);
const itemOf = (summary: NightlySummary, item_id: string) =>
  summary.top_items.find((row) => row.item_id === item_id);
const blockOf = (summary: NightlySummary, kind: string) =>
  summary.corrections.find((row) => row.kind === kind);

// ── §A · the day's money is the ledger's ───────────────────────────────────────────────────────

describe("§A · 12-F10 / 01-F63 — the reported figure IS the ledger's own attestation", () => {
  it("reports Rs 2,968.00 for the day the run actually took (01-F82, 02-F63)", () => {
    const summary = fold(theDay());
    expect(summary.sales.total_paisa).toBe(LEDGER_TRUTH_PAISA);
  });

  /**
   * **THE DEFECT, PINNED AS A NUMBER.** Rs 2,679 is not merely "a different answer" — it is what a
   * line-sum build produces from this exact event set, so this assertion fails the moment anybody
   * reintroduces one. It is stated as `not.toBe` beside the positive claim because a fixture whose
   * two candidate answers coincided could not tell the builds apart.
   */
  it("is NOT the raw line sum of Rs 2,679.00 that the end-to-end run printed", () => {
    const summary = fold(theDay());
    expect(summary.sales.total_paisa).not.toBe(NAIVE_LINE_SUM_PAISA);
    // …and the raw sum really is Rs 2,679 in this fixture, otherwise the line above proves nothing.
    /*
      `DEC-MONEY-005` — the domain helpers, never raw arithmetic on a money field, and the
      extended amount as a REPEATED SUM rather than a product: the rule bans the multiplication
      by name, and `summary.ts` itself does it in BigInt for the reason `merge.ts` states (a
      product leaves the exact-integer range far sooner than a sum does).
    */
    const raw = sumPaisa(
      theDay()
        .filter((e) => e.type === "order.line_added")
        .flatMap((e) =>
          Array.from({ length: e.payload.qty as number }, () =>
            paisa(e.payload.unit_price_paisa as number),
          ),
        ),
    );
    expect(raw).toBe(NAIVE_LINE_SUM_PAISA);
  });

  it("is the SUM of the four closing acts, event by event (12-F21)", () => {
    const attested = sumPaisa(
      theDay()
        .filter((e) => e.type === "order.settlement_closed")
        .map((e) => paisa(e.payload.billed_paisa as number)),
    );
    expect(attested).toBe(LEDGER_TRUTH_PAISA);
    expect(fold(theDay()).sales.total_paisa).toBe(attested);
  });

  it("attributes each attested bill to the channel its order.created named (12-F10)", () => {
    const summary = fold(theDay());
    // counter: 989 + 920 + 469 = 2,378. foodpanda: 590.
    expect(channelOf(summary, "counter")).toEqual({
      channel: "counter",
      orders: 3,
      billed_paisa: 2_378_00,
    });
    expect(channelOf(summary, "foodpanda")).toEqual({
      channel: "foodpanda",
      orders: 1,
      billed_paisa: 590_00,
    });
    expect(summary.sales.orders).toBe(4);
    expect(summary.honesty.unsettled_orders).toBe(0);
  });

  it("makes by_channel and hourly both TILE the day's total (12-F21)", () => {
    const summary = fold(theDay());
    const channels = sumPaisa(summary.sales.by_channel.map((row) => paisa(row.billed_paisa)));
    const curve = sumPaisa(summary.hourly.map((row) => paisa(row.billed_paisa)));
    expect(channels).toBe(LEDGER_TRUTH_PAISA);
    expect(curve).toBe(LEDGER_TRUTH_PAISA);
  });

  it("buckets each bill in the hour it CLOSED (12-F10, 01-F43)", () => {
    const summary = fold(theDay());
    // 13:50 → offset 8, 20:20 → 15, 21:10 → 16, 22:30 → 17.
    expect(summary.hourly[8]?.billed_paisa).toBe(989_00);
    expect(summary.hourly[15]?.billed_paisa).toBe(920_00);
    expect(summary.hourly[16]?.billed_paisa).toBe(590_00);
    expect(summary.hourly[17]?.billed_paisa).toBe(469_00);
  });
});

// ── §B · the voided line ───────────────────────────────────────────────────────────────────────

describe("§B · 02-F20 / 02-F8 — a voided line is not a sold item", () => {
  /**
   * **`raita · 2 sold · Rs 120` — the row the run printed for two dishes nobody sold.** Worse than
   * a missing row, because it names a dish and a quantity an owner can act on.
   */
  it("keeps a voided line out of the item table AND its unit count (12-F10)", () => {
    const summary = fold(theDay());
    expect(itemOf(summary, "item-raita")).toBeUndefined();
    expect(summary.top_items.map((row) => row.item_id)).not.toContain("item-raita");
    // Both Raitas really were rung, so their absence is an exclusion rather than a fixture gap.
    expect(theDay().filter((e) => e.payload.item_id === "item-raita")).toHaveLength(2);
  });

  it("leaves every line that was NOT voided exactly where it was (the control)", () => {
    const summary = fold(theDay());
    expect(itemOf(summary, "item-karahi")).toEqual({
      item_id: "item-karahi",
      qty: 2,
      revenue_paisa: 900_00,
    });
    expect(itemOf(summary, "item-naan")).toEqual({
      item_id: "item-naan",
      qty: 3,
      revenue_paisa: 204_00,
    });
    // The whole mix is the raw sum less the two Raitas — and less nothing else.
    const mix = sumPaisa(summary.top_items.map((row) => paisa(row.revenue_paisa)));
    // The Rs 180 lassi ranks sixth and falls outside `12-F10`'s top FIVE, so it is added back.
    expect(addPaisa(paisa(mix), paisa(180_00))).toBe(MENU_MIX_PAISA);
    expect(MENU_MIX_PAISA).toBe(NAIVE_LINE_SUM_PAISA - 120_00);
  });

  it("removes a CANCELLED line too, and leaves a SERVED one (01 §4's exit states)", () => {
    const base = [
      event("c1", "order.created", { order_id: "o", channel: "counter" }, at(12)),
      line("c2", "o", "a", "item-a", 1, 100_00, at(12)),
      line("c3", "o", "b", "item-b", 1, 100_00, at(12)),
      closed("c4", "o", 200_00, at(12, 30)),
    ];
    const summary = fold([
      ...base,
      exited("c5", "o", "a", "cancelled", at(12, 10)),
      exited("c6", "o", "b", "served", at(12, 10)),
    ]);
    expect(itemOf(summary, "item-a")).toBeUndefined();
    expect(itemOf(summary, "item-b")?.revenue_paisa).toBe(100_00);
  });

  it("leaves a NON-terminal edge alone — in_prep is a workflow fact, not an exit (03-F47)", () => {
    const summary = fold([
      event("d1", "order.created", { order_id: "o", channel: "counter" }, at(12)),
      line("d2", "o", "a", "item-a", 1, 100_00, at(12)),
      exited("d3", "o", "a", "in_prep", at(12, 5)),
      closed("d4", "o", 100_00, at(12, 30)),
    ]);
    expect(itemOf(summary, "item-a")?.revenue_paisa).toBe(100_00);
  });

  /**
   * **`merge.ts`'s contested case, honoured rather than approximated.** `billedCellPaisa` zeroes a
   * cell only for a DECIDED exit (`states.length === 1 && EXITED.has(states[0])`); a line holding
   * two terminal heads is contested and `CONTESTED_LINE_BILLABLE` is ratified **true**, so it stays
   * billable. A build that treated "an exit arrived" as "gone" disagrees with the device fold here,
   * which is the `12-F21` breach this whole change exists to close.
   */
  it("keeps a CONTESTED line billable — an exit AND a served head (CONTESTED_LINE_BILLABLE)", () => {
    const summary = fold([
      event("f1", "order.created", { order_id: "o", channel: "counter" }, at(12)),
      line("f2", "o", "a", "item-a", 1, 100_00, at(12)),
      exited("f3", "o", "a", "voided", at(12, 5)),
      exited("f4", "o", "a", "served", at(12, 5)),
      closed("f5", "o", 100_00, at(12, 30)),
    ]);
    expect(itemOf(summary, "item-a")?.revenue_paisa).toBe(100_00);
  });
});

// ── §C · the comp and the discount are the OPPOSITE error ──────────────────────────────────────

describe("§C · 12-F10 bullet 3 — counted, valued, and never netted", () => {
  it("counts and values all three kinds, always rendering all three rows (12-F10)", () => {
    const summary = fold(theDay());
    expect(summary.corrections.map((row) => row.kind)).toEqual(["void", "comp", "discount"]);
    expect(blockOf(summary, "void")).toMatchObject({ count: 2, value_paisa: 120_00 });
    expect(blockOf(summary, "comp")).toMatchObject({ count: 1, value_paisa: 60_00 });
    expect(blockOf(summary, "discount")).toMatchObject({ count: 1, value_paisa: 40_00 });
  });

  it("renders a MEASURED zero for a kind that did not happen, never a missing row", () => {
    const noComps = theDay().filter((e) => e.type !== "comp.recorded");
    const summary = fold(noComps);
    expect(blockOf(summary, "comp")).toMatchObject({ count: 0, value_paisa: 0, by: [] });
  });

  /**
   * **THE WARNING THIS SECTION EXISTS FOR.** A void and a comp are not the same money. The void's
   * Rs 120 is already out of the day's takings, through the line exit `merge.ts` zeroes; the comp's
   * Rs 60 and the discount's Rs 40 are inside it, because neither is a line exit and `01-F30`'s
   * `comp_value` and `discounts` terms are ABSENT (`DEC-MONEY-010`, gate (iii) unmet). A fix that
   * treated the three alike would understate the day by Rs 100 — wrong in the opposite direction
   * from the defect it was fixing, and just as permanent.
   */
  it("does NOT subtract the comp or the discount from the day's takings (DEC-MONEY-010)", () => {
    const summary = fold(theDay());
    expect(summary.sales.total_paisa).toBe(LEDGER_TRUTH_PAISA);
    expect(summary.sales.total_paisa).not.toBe(LEDGER_TRUTH_PAISA - 100_00);
    // ord-3 was billed Rs 590 with a Rs 60 comp recorded against it, and Rs 590 is what it reports.
    expect(channelOf(summary, "foodpanda")?.billed_paisa).toBe(590_00);
  });

  it("says WHICH kinds are already out of the total, per kind (12-F10, DEC-MONEY-010)", () => {
    const summary = fold(theDay());
    expect(blockOf(summary, "void")?.removed_from_sales).toBe(true);
    expect(blockOf(summary, "comp")?.removed_from_sales).toBe(false);
    expect(blockOf(summary, "discount")?.removed_from_sales).toBe(false);
  });

  it("does NOT subtract the void twice either — the line exit already moved it (DEC-MONEY-010 (2))", () => {
    const summary = fold(theDay());
    // Rs 2,968 − 120 = Rs 2,848 is what a build subtracting `void.recorded.amount_paisa` from the
    // attested total prints. The attestation never contained the Raita, so this is money taken off
    // a bill the customer already paid.
    expect(summary.sales.total_paisa).not.toBe(LEDGER_TRUTH_PAISA - 120_00);
  });
});

// ── §D · by whom ───────────────────────────────────────────────────────────────────────────────

describe("§D · 12-F10 / 02-F20 — two identities, two homes, neither absorbing the other", () => {
  it("attributes each corrective to its ENVELOPE actor and its PAYLOAD approver (02-F45)", () => {
    const summary = fold(theDay());
    expect(blockOf(summary, "void")?.by).toEqual([
      // The manager's own unsupervised void: no approval was involved, and `null` says so.
      { actor_user_id: MANAGER, approver_user_id: null, count: 1, value_paisa: 60_00 },
      { actor_user_id: CASHIER, approver_user_id: MANAGER, count: 1, value_paisa: 60_00 },
    ]);
    expect(blockOf(summary, "comp")?.by).toEqual([
      { actor_user_id: CASHIER, approver_user_id: MANAGER, count: 1, value_paisa: 60_00 },
    ]);
  });

  /**
   * The actor is on the ENVELOPE and nowhere else (`02-F45` forbids duplicating it into the
   * payload), so a build reading a payload `actor_user_id` would attribute every void to nobody.
   */
  it("never reads an actor from the payload, even when one is planted there", () => {
    const planted = theDay().map((e) =>
      e.id === "e06" ? { ...e, payload: { ...e.payload, actor_user_id: "user-imposter" } } : e,
    );
    const by = blockOf(fold(planted), "void")?.by ?? [];
    expect(by.map((row) => row.actor_user_id)).not.toContain("user-imposter");
    expect(by.map((row) => row.actor_user_id).sort()).toEqual([MANAGER, CASHIER].sort());
  });

  /**
   * ⚠ **THIS TEST WAS ADDED BECAUSE THE MUTANT ABOVE IT SURVIVED — 0 of 364.** Collapsing
   * `attributionKey` to the actor alone changed no assertion in this file, because every fixture
   * here paired a distinct cashier with a distinct approver, so merging the two halves of the key
   * still produced distinct rows. The mechanism was built correctly and no fixture was aimed at
   * the case that matters (`AGENTS.md`'s round-3 law, reproduced inside the work that cites it).
   *
   * The case that matters is ORDINARY: two managers on one shift, both approving the same
   * cashier's voids. A build keyed on the actor alone prints one row of two acts and Rs 35, and
   * `12-F10`'s *"and by whom"* silently stops naming who authorised what — which is the half of
   * the sentence Appendix A's void row exists for.
   */
  it("splits one cashier's acts by APPROVER — two managers are two rows (02-F20, 12-F10)", () => {
    const approvedBy = (approver: string, attempt: string, amount: number, id: string) =>
      corrective(
        id,
        "void.recorded",
        {
          order_id: "ord-x",
          amount_paisa: amount,
          reason: "spill",
          approver_user_id: approver,
          adjustment_attempt_id: attempt,
        },
        at(12),
        CASHIER,
      );
    const by =
      blockOf(
        fold([
          approvedBy(MANAGER, "adj-k1", 10_00, "k1"),
          approvedBy("user-bilal", "adj-k2", 25_00, "k2"),
        ]),
        "void",
      )?.by ?? [];
    expect(by).toEqual([
      { actor_user_id: CASHIER, approver_user_id: MANAGER, count: 1, value_paisa: 10_00 },
      { actor_user_id: CASHIER, approver_user_id: "user-bilal", count: 1, value_paisa: 25_00 },
    ]);
    // One cashier throughout, so the split is the APPROVER's and nothing else's.
    expect(new Set(by.map((row) => row.actor_user_id)).size).toBe(1);
  });

  it("keeps one cashier's two acts on ONE row rather than splitting by envelope", () => {
    const second = corrective(
      "e29",
      "discount.recorded",
      {
        order_id: "ord-4",
        amount_paisa: 10_00,
        reason: "regular",
        approver_user_id: MANAGER,
        adjustment_attempt_id: "adj-disc-2",
      },
      at(22, 25),
      CASHIER,
    );
    const summary = fold([...theDay(), second]);
    expect(blockOf(summary, "discount")?.by).toEqual([
      { actor_user_id: CASHIER, approver_user_id: MANAGER, count: 2, value_paisa: 50_00 },
    ]);
  });
});

// ── §E · law 1 ─────────────────────────────────────────────────────────────────────────────────

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

const poisoned = (e: SummaryEvent): SummaryEvent => {
  const copy: Record<string, unknown> = { ...e };
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

describe("§E · 01-F34 — the corrections day is a function of the delivered SET", () => {
  const control = fold(theDay());

  it("is byte-identical under every delivery order", () => {
    for (const seed of [3, 17, 512, 90_210]) {
      expect(JSON.stringify(fold(shuffled(theDay(), seed)))).toBe(JSON.stringify(control));
    }
  });

  it("is byte-identical under a bijective envelope-id relabel (26 §8)", () => {
    const n = theDay().length;
    const relabelled = theDay().map((e, i) => ({ ...e, id: `z${String(n - i).padStart(3, "0")}` }));
    expect(JSON.stringify(fold(shuffled(relabelled, 7)))).toBe(JSON.stringify(control));
  });

  it("never touches global_seq, lamport_seq, device_created_at or server_received_at", () => {
    expect(JSON.stringify(fold(shuffled(theDay().map(poisoned), 23)))).toBe(
      JSON.stringify(control),
    );
  });

  /**
   * `01-F83`'s whole reason: *"a double-tapped 'void Rs 500' subtracts Rs 1,000, converged on every
   * device and permanent under `01-F1`"*. Two envelope ids, one attempt key, one act.
   */
  it("counts a corrective REDELIVERED under a new envelope id exactly once (01-F83, 01-F31)", () => {
    const again = theDay()
      .filter((e) => e.id === "e06")
      .map((e) => ({ ...e, id: "e06-again" }));
    const twice = fold([...theDay(), ...again]);
    expect(blockOf(twice, "void")).toEqual(blockOf(control, "void"));
    expect(twice.sales.total_paisa).toBe(LEDGER_TRUTH_PAISA);
    // The window really did hold one more envelope — `00 §5.7`'s count is about the window.
    expect(twice.honesty.events).toBe(control.honesty.events + 1);
  });

  it("counts a redelivered CLOSING ACT once, and a redelivered EXIT once", () => {
    const dupes = theDay()
      .filter((e) => e.id === "e08" || e.id === "e07")
      .map((e) => ({ ...e, id: `${e.id}-again` }));
    const twice = fold([...theDay(), ...dupes]);
    expect(twice.sales).toEqual(control.sales);
    expect(twice.top_items).toEqual(control.top_items);
    expect(twice.hourly).toEqual(control.hourly);
  });
});

// ── §F · the honest edges ──────────────────────────────────────────────────────────────────────

describe("§F · 00 §5.7 — what the fold does when it cannot answer", () => {
  it("counts an order with no closing act as UNSETTLED and takes no money from it", () => {
    const open = theDay().filter((e) => e.id !== "e28");
    const summary = fold(open);
    expect(summary.honesty.unsettled_orders).toBe(1);
    expect(summary.sales.orders).toBe(3);
    expect(summary.sales.total_paisa).toBe(LEDGER_TRUTH_PAISA - 469_00);
    // Its LINES are still in the menu mix — they were rung, and `12-F10` bullet 4 is about what
    // was sold rather than about what has been paid for.
    expect(itemOf(summary, "item-kebab")?.qty).toBe(2);
  });

  it("contributes ZERO and names it when two acts close one bill differently (01-F31)", () => {
    const rival = closed("e08b", "ord-1", 1_500_00, at(13, 50));
    const summary = fold([...theDay(), rival]);
    expect(summary.honesty.anomalies).toContain("order_close_divergence");
    expect(summary.sales.total_paisa).toBe(LEDGER_TRUTH_PAISA - 989_00);
  });

  it("contributes ZERO and names it when a closing act attests NOTHING (01-F63)", () => {
    const bare = theDay().map((e) =>
      e.id === "e08" ? { ...e, payload: { order_id: "ord-1" } } : e,
    );
    const summary = fold(bare);
    expect(summary.honesty.anomalies).toContain("close_snapshot_absent");
    expect(summary.sales.total_paisa).toBe(LEDGER_TRUTH_PAISA - 989_00);
    // The order is still SETTLED and still counted: the act is the fact (`01-F63`).
    expect(summary.sales.orders).toBe(4);
    expect(summary.honesty.unsettled_orders).toBe(0);
  });

  it("reuses merge.ts's own word for an unusable snapshot (12-F21)", () => {
    const bad = theDay().map((e) =>
      e.id === "e08" ? { ...e, payload: { order_id: "ord-1", billed_paisa: -1 } } : e,
    );
    expect(fold(bad).honesty.anomalies).toContain("close_snapshot_invalid");
    const fractional = theDay().map((e) =>
      e.id === "e08" ? { ...e, payload: { order_id: "ord-1", billed_paisa: 989.5 } } : e,
    );
    expect(fold(fractional).honesty.anomalies).toContain("close_snapshot_invalid");
  });

  it("refuses to count a corrective with no 01-F83 attempt key, and says so", () => {
    const unkeyed = theDay().map((e) => {
      if (e.id !== "e06") return e;
      const { adjustment_attempt_id: _dropped, ...rest } = e.payload;
      return { ...e, payload: rest };
    });
    const summary = fold(unkeyed);
    expect(summary.honesty.anomalies).toContain("correction_key_absent");
    expect(blockOf(summary, "void")).toMatchObject({ count: 1, value_paisa: 60_00 });
  });

  it("disputes an attempt key whose two members disagree, and counts neither (01-F83)", () => {
    const forged = theDay()
      .filter((e) => e.id === "e06")
      .map((e) => ({ ...e, id: "e06-forged", payload: { ...e.payload, amount_paisa: 9_999_00 } }));
    const summary = fold([...theDay(), ...forged]);
    expect(summary.honesty.anomalies).toContain("void_divergence");
    expect(blockOf(summary, "void")).toMatchObject({ count: 1, value_paisa: 60_00 });
  });

  it("keeps money exact past 2^53 rather than letting delivery order decide it (law 3)", () => {
    const huge = [
      event("h1", "order.created", { order_id: "o1", channel: "counter" }, at(12)),
      closed("h2", "o1", Number.MAX_SAFE_INTEGER, at(12)),
      event("h3", "order.created", { order_id: "o2", channel: "counter" }, at(12)),
      closed("h4", "o2", Number.MAX_SAFE_INTEGER, at(12)),
    ];
    const summary = fold(huge);
    expect(summary.honesty.anomalies).toContain("money_overflow");
    expect(summary.sales.total_paisa).toBe(0);
    expect(JSON.stringify(fold(shuffled(huge, 5)))).toBe(JSON.stringify(summary));
  });
});

// ── §G · the sentence that told an owner the opposite of the truth ─────────────────────────────

describe("§G · Commandment 2 — the OMISSIONS entry says what is true TODAY", () => {
  it("no longer claims voids, comps and discounts are unmeasurable", () => {
    const blocks = fold(theDay()).omissions.map((row) => row.block);
    expect(blocks).not.toContain("Voids, comps and discounts");
  });

  it("names the part that is genuinely still absent — the NETTING, not the measurement", () => {
    const entry = fold(theDay()).omissions.find((row) =>
      row.block.startsWith("Comps and discounts"),
    );
    expect(entry).toBeDefined();
    expect(entry?.fr).toBe("DEC-MONEY-010");
    // The reason has to distinguish the void (netted) from the comp and the discount (not), or it
    // is the same undifferentiated claim that made the old entry misleading.
    expect(entry?.reason).toContain("comp");
    expect(entry?.reason).toContain("discount");
    expect(entry?.reason).toContain("void");
  });

  it("still refuses every block this ledger genuinely cannot answer (12-F11, DEC-MONEY-004)", () => {
    const blocks = fold(theDay()).omissions.map((row) => row.block);
    expect(blocks).toContain("Estimated gross margin");
    expect(blocks).toContain("Tips");
    expect(blocks).toContain("Purchases and wastage logged");
  });
});
