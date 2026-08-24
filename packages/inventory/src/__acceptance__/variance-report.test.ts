/**
 * `10-F18` / `10-F28` / `10-F29` / `10-F30` — the variance report, aimed at the cases that separate
 * a correct implementation from the mainstream's.
 *
 * ⚠ **THE ROUND-3 SHAPE THIS FILE EXISTS FOR, quoted from `plans/inventory/design.md` §8:**
 * *"§4.8's `counted: false` ≠ `qty: 0` is invisible to any suite that submits COMPLETE counts, and
 * every implementation passes such a suite — including the one that treats a blank as zero, which
 * is R365's shipped behaviour. The oracle must submit a count with one area line of a two-area item
 * missing and assert three separate things: the item's variance row reads *not counted*, the
 * report's PKR total is flagged a floor, and **no zero appears anywhere for that item**."*
 *
 * §C is that fixture, and it asserts all three. The mutant it is aimed at — *treat a blank as zero*
 * — is row V1 of the matrix in `packages/inventory/CLAUDE.md`.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — same session as the implementation (`20 §4.3`), so the
 * out-of-tree mutation matrix stands in for the independence guarantee.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ReferenceData } from "../reference.js";
import { type VarianceReport, varianceReports } from "../variance.js";
import {
  count,
  item,
  LOCATION,
  purchase,
  resetIds,
  sale,
  voidRecorded,
  wastage,
} from "./fixtures.js";

beforeEach(resetIds);

const KG = 1_000_000; // milligrams

const REFS: ReferenceData = {
  items: [
    item({ item_id: "chicken", name: "Chicken", base_unit: "mg" }),
    item({
      item_id: "oil",
      name: "Cooking oil",
      base_unit: "ml",
      count_units: {
        primary_label: "bottle",
        primary_size_base: KG,
        partial: { kind: "fraction" },
      },
      reference_cost: { value_paisa: 42_000, qty_base: KG },
    }),
  ],
  // The founder's ketchup case: ONE item, ONE balance, TWO count lines.
  areas: [
    { item_id: "chicken", location_id: LOCATION, area_id: "walk-in", sort: 0 },
    { item_id: "chicken", location_id: LOCATION, area_id: "kitchen", sort: 1 },
    { item_id: "oil", location_id: LOCATION, area_id: "dry-store", sort: 2 },
  ],
  recipes: [
    {
      recipe_id: "karahi",
      version: 3,
      yield_qty_base: null,
      produces_item_id: null,
      lines: [{ line_no: 0, component: { kind: "item", id: "chicken" }, qty: 250_000 }],
    },
  ],
  menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "karahi", recipe_id: "karahi" }],
};

/**
 * The worked history the whole file reads off, chosen so every number reconciles BY HAND — which is
 * slice 1's own acceptance sentence.
 *
 *   baseline close (t=2000): chicken 10 kg walk-in + 5 kg kitchen = 15 kg, valued at p1's receipt
 *   period 1: buy 5 kg for Rs 3,500; sell 4 karahi (4 × 250 g = 1 kg); waste 300 g
 *             expected = 15 + 5 − 1 − 0.3 = 18.7 kg
 */
const baseline = (chickenWalkIn = 10 * KG, chickenKitchen = 5 * KG) => [
  purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 1_000),
  count(
    "c0",
    [
      { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: chickenWalkIn },
      { item_id: "chicken", area_id: "kitchen", counted: true, qty_base: chickenKitchen },
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG, basis: "estimated" },
    ],
    2_000,
  ),
];

const period1 = (closing: readonly Parameters<typeof count>[1][number][]) => [
  ...sale("o1", [{ line_id: "l1", sellable_id: "karahi", qty: 4 }], 3_000),
  wastage("w1", "chicken", 300_000, 3_100),
  purchase("p2", [{ item_id: "chicken", qty_base: 5 * KG, line_total_paisa: 350_000 }], 3_500),
  count("c1", closing, 4_000),
];

const run = (closing: readonly Parameters<typeof count>[1][number][]): readonly VarianceReport[] =>
  varianceReports({
    location_id: LOCATION,
    events: [...baseline(), ...period1(closing)],
    refs: REFS,
  });

const COMPLETE_CLOSE = [
  { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 12 * KG },
  { item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 6 * KG },
  { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG, basis: "estimated" },
] as const;

const rowFor = (report: VarianceReport, item_id: string) =>
  report.rows.find((row) => row.item_id === item_id);

// ── §A · 10-F28 — the first period is a BASELINE and reconciles nothing ────────────────────────

describe("§A · 10-F28 — a location's first period has no opening and says so", () => {
  it("the baseline period carries NO rows at all", () => {
    const [first] = run([...COMPLETE_CLOSE]);
    expect(first?.is_baseline).toBe(true);
    expect(first?.rows).toEqual([]);
  });

  it("⚠ it does NOT report the whole shelf as surplus, which is what opening-as-zero would do", () => {
    // The trap this rule closes. With the opening treated as 0, the baseline's 15 kg of chicken
    // would read as 15 kg of unexplained SURPLUS on day one, and a pilot's very first report would
    // be nonsense. Two closed counts are what make the second report meaningful.
    const [first] = run([...COMPLETE_CLOSE]);
    expect(first?.surplus_paisa).toBe(0);
    expect(first?.unexplained_usage_paisa).toBe(0);
  });

  it("the SECOND period reconciles against the baseline's close", () => {
    const [, second] = run([...COMPLETE_CLOSE]);
    expect(second?.is_baseline).toBe(false);
    expect(second?.rows.length).toBeGreaterThan(0);
  });
});

// ── §B · 10-F18 — the arithmetic, reconcilable by hand ─────────────────────────────────────────

describe("§B · 10-F18 — expected = opening + purchases − consumption − wastage, valued at period cost", () => {
  it("chicken reconciles exactly: 15 + 5 − 1 − 0.3 = 18.7 kg expected against 18 counted", () => {
    const [, second] = run([...COMPLETE_CLOSE]);
    const row = rowFor(second as VarianceReport, "chicken");
    expect(row?.expected_qty_base).toBe(18_700_000);
    expect(row?.counted_qty_base).toBe(18_000_000);
    expect(row?.gap_qty_base).toBe(-700_000);
  });

  it("the gap is valued at the PERIOD pair, by one exact multiply-then-round", () => {
    // opening 15 kg valued at p1's Rs 6,800 / 10 kg = Rs 10,200; plus p2's Rs 3,500 for 5 kg.
    // pair = (1_370_000 paisa, 20 kg). 700 g of that is 700_000 × 1_370_000 / 20_000_000 = 47_950.
    const [, second] = run([...COMPLETE_CLOSE]);
    expect(rowFor(second as VarianceReport, "chicken")?.gap_value_paisa).toBe(-47_950);
    expect(second?.unexplained_usage_paisa).toBe(47_950);
  });

  it("a COMPLETE count is not a floor — and an in-band row does not make it one", () => {
    // ⚠ THIS ASSERTION FOUND A REAL DEFECT. The first implementation counted a row suppressed by
    // its own noise floor (`10-F33` (a)) toward the same `is_floor` flag as a row nobody counted
    // (`10-F29`), so a perfectly executed count containing ONE estimated item came back flagged.
    // The oil row here is exactly that: its gap is zero, which is (correctly) inside its floor.
    const [, second] = run([...COMPLETE_CLOSE]);
    expect(second?.is_floor).toBe(false);
    expect(second?.withheld_row_count).toBe(0);
    // …and the in-band row is still REPORTED as its own kind of fact, not silently dropped.
    expect(second?.within_noise_row_count).toBe(1);
  });

  it("the two area lines SUM to one balance — one item, one number, N lines (10-F30)", () => {
    const [, second] = run([...COMPLETE_CLOSE]);
    // 12 kg + 6 kg, not two rows and not one of them.
    expect(rowFor(second as VarianceReport, "chicken")?.counted_qty_base).toBe(18 * KG);
    expect(second?.rows.filter((row) => row.item_id === "chicken")).toHaveLength(1);
  });

  it("usage and surplus are NEVER netted against each other", () => {
    // One item short and another long must not cancel: netting hides both, and the headline the
    // design writes is a shortfall. Oil closes 2 kg ABOVE its 5 kg opening with no purchases.
    const [, second] = run([
      ...COMPLETE_CLOSE.slice(0, 2),
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 7 * KG, basis: "exact" },
    ]);
    expect(second?.unexplained_usage_paisa).toBe(47_950);
    expect(second?.surplus_paisa).toBeGreaterThan(0);
  });
});

// ── §C · THE ONE THAT MATTERS — one area line missing (10-F29 + 10-F30) ────────────────────────

describe("§C · 10-F29 — a two-area item with ONE line missing reads NOT COUNTED, and no zero appears", () => {
  const INCOMPLETE = [
    // The kitchen line is simply absent. The mainstream would total 12 kg and report a 6.7 kg gap.
    { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 12 * KG },
    { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG, basis: "estimated" },
  ] as const;

  it("(1) the item's row reads NOT COUNTED, naming the missing area line", () => {
    const [, second] = run([...INCOMPLETE]);
    const row = rowFor(second as VarianceReport, "chicken");
    expect(row?.withheld).toEqual({ kind: "not_counted", reason: "area_line_missing" });
  });

  it("(2) the report's PKR total is FLAGGED A FLOOR", () => {
    const [, second] = run([...INCOMPLETE]);
    expect(second?.is_floor).toBe(true);
    expect(second?.withheld_row_count).toBe(1);
  });

  it("(3) NO ZERO APPEARS ANYWHERE FOR THAT ITEM — every quantity and money field is null", () => {
    // The assertion the mutant dies on. A "treat a blank as zero" implementation reports
    // `counted 12 kg, expected 18.7 kg, gap −6.7 kg` with total confidence, and every other
    // assertion in this file still passes.
    const [, second] = run([...INCOMPLETE]);
    const row = rowFor(second as VarianceReport, "chicken");
    expect(row?.counted_qty_base).toBeNull();
    expect(row?.expected_qty_base).toBeNull();
    expect(row?.gap_qty_base).toBeNull();
    expect(row?.gap_value_paisa).toBeNull();
    // Not `0`, not `-0`, not a small number: null. Strict, because `toBeFalsy` would pass on zero.
    expect(row?.gap_value_paisa).not.toBe(0);
  });

  it("the item is still ON the report — it is named as unread, never omitted", () => {
    // Dropping it would be the same defect with better manners: an owner cannot ask about a row
    // she cannot see, and `10-F8`'s whole argument is that a gap must never be silent.
    const [, second] = run([...INCOMPLETE]);
    expect(second?.rows.map((row) => row.item_id)).toContain("chicken");
  });

  it("a DECLARED absence is a different reason from a missing line, and both withhold", () => {
    const [, second] = run([
      { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 12 * KG },
      { item_id: "chicken", area_id: "kitchen", counted: false },
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG, basis: "estimated" },
    ]);
    expect(rowFor(second as VarianceReport, "chicken")?.withheld).toEqual({
      kind: "not_counted",
      reason: "declared_not_counted",
    });
  });

  it("an item the sheet never mentions at all is `no_line`, not absent", () => {
    const [, second] = run([
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG, basis: "estimated" },
    ]);
    expect(rowFor(second as VarianceReport, "chicken")?.withheld).toEqual({
      kind: "not_counted",
      reason: "no_line",
    });
  });

  it("⚠ A COUNTED ZERO IS A MEASUREMENT AND PRODUCES A LARGE, REAL VARIANCE", () => {
    // The other half of the rule, and the half a "blank means zero" implementation gets RIGHT by
    // accident. Without this assertion the suite could be satisfied by refusing every zero, which
    // would silence *"I looked and there is none"* — a real and important reading.
    const [, second] = run([
      { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 0 },
      { item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 0 },
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG, basis: "estimated" },
    ]);
    const row = rowFor(second as VarianceReport, "chicken");
    expect(row?.withheld).toBeNull();
    expect(row?.counted_qty_base).toBe(0);
    expect(row?.gap_qty_base).toBe(-18_700_000);
    expect(second?.is_floor).toBe(false);
  });
});

// ── §D · 10-F5 — negative theoretical stock is allowed and never throws ────────────────────────

describe("§D · 10-F5 — theoretical stock may go negative, is flagged, and blocks nothing", () => {
  it("selling more than was ever bought produces a negative expected closing, not an error", () => {
    const events = [
      ...baseline(0, 0),
      // 200 karahis against a zero opening: 50 kg of chicken that never existed.
      ...sale("o1", [{ line_id: "l1", sellable_id: "karahi", qty: 200 }], 3_000),
      count(
        "c1",
        [
          { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 0 },
          { item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 0 },
          { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5 * KG },
        ],
        4_000,
      ),
    ];
    const reports = varianceReports({ location_id: LOCATION, events, refs: REFS });
    const row = rowFor(reports[1] as VarianceReport, "chicken");
    expect(row?.expected_qty_base).toBe(-50_000_000);
    // And the gap is POSITIVE — more on the shelf than theory says, which is exactly what a
    // negative theoretical balance means and what the next count reconciles.
    expect(row?.gap_qty_base).toBe(50_000_000);
  });
});

// ── §E · 10-F33 (b) — ranked in PKR, never in percent ──────────────────────────────────────────

describe("§E · 10-F33 (b) — rank by money, and a big percentage on a cheap item does not win", () => {
  it("a 3% gap on chicken outranks a 40% gap on oil, because money is the sort key", () => {
    const refs: ReferenceData = {
      ...REFS,
      items: [
        item({ item_id: "chicken", name: "Chicken" }),
        item({
          item_id: "oil",
          name: "Cooking oil",
          base_unit: "ml",
          count_units: {
            primary_label: "bottle",
            primary_size_base: KG,
            partial: { kind: "none" },
          },
          reference_cost: { value_paisa: 500, qty_base: KG },
        }),
      ],
    };
    const events = [
      ...baseline(),
      ...period1([
        { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 12 * KG },
        { item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 6 * KG },
        // Oil loses 2 of its 5 litres — 40% — but at Rs 5/kg that is Rs 10.
        { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 3 * KG },
      ]),
    ];
    const [, second] = varianceReports({ location_id: LOCATION, events, refs });
    expect(second?.rows[0]?.item_id).toBe("chicken");
    expect(Math.abs(second?.rows[0]?.gap_value_paisa ?? 0)).toBeGreaterThan(
      Math.abs(second?.rows[1]?.gap_value_paisa ?? 0),
    );
    // And no percentage is computed anywhere — `10-F33` (b): percent is a diagnostic AFTER
    // selection, never the trigger. A `%` field on the row would be the thing to delete.
    expect(Object.keys(second?.rows[0] ?? {})).not.toContain("gap_percent");
  });

  it("withheld rows sort LAST, so the top of the list is always actionable", () => {
    const [, second] = run([
      { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 12 * KG },
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 3 * KG, basis: "exact" },
    ]);
    expect(second?.rows[second.rows.length - 1]?.withheld).not.toBeNull();
  });
});

// ── §F · 10-F19 — voids are counted separately, never summed into the gap ──────────────────────

describe("§F · 10-F19 — the void side is a LABELLED COUNT and never enters the money comparison", () => {
  it("a void in the window is COUNTED, and adds nothing to the PKR gap", () => {
    // A void carries a SELLING price (Rs 900 here). Summing it against a gap valued at COST
    // overstates the void side by the gross margin — a factor of ~3 at a 70% food-cost target —
    // which is why the hint fired almost never and misled when it did. `10-F19` was amended to
    // compare cost with cost and to let voids in as a separate, labelled count.
    const events = [
      ...baseline(),
      ...period1([...COMPLETE_CLOSE]),
      voidRecorded("o1", 90_000, 3_600),
    ];
    const [, second] = varianceReports({ location_id: LOCATION, events, refs: REFS });
    expect(second?.void_count).toBe(1);
    // Unchanged by the void's Rs 900. If this moved, the two currencies had been added together.
    expect(second?.unexplained_usage_paisa).toBe(47_950);
  });

  it("10-F7: the voided order's food is still CONSUMED — the void removes no line", () => {
    // Same fixture, and the check that the void did not quietly reduce theoretical consumption:
    // 4 karahis were made, so 1 kg of chicken left the shelf whether or not the dish was paid for.
    const events = [
      ...baseline(),
      ...period1([...COMPLETE_CLOSE]),
      voidRecorded("o1", 90_000, 3_600),
    ];
    const [, second] = varianceReports({ location_id: LOCATION, events, refs: REFS });
    expect(rowFor(second as VarianceReport, "chicken")?.expected_qty_base).toBe(18_700_000);
  });
});
