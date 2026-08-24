/**
 * `10-F3` / `10-F8` / `10-F30` / `10-F31` — **the two places a partial answer used to be reported
 * as a whole one**: a recipe explosion that failed halfway, and a count line the roll-up dropped.
 *
 * Both are the same defect in different clothes, and it is the one `10-F29` names at the count box:
 * **a reading that is absent is not a reading of zero, and a reading that is partial is not a
 * reading.** A dish reported as *not deducted* while 2 kg of its chicken sits in the totals, and a
 * shelf reported as 5 kg when the counter wrote down 20, both put quantity into the gap column that
 * nothing physical stands behind — and `10-F33` (b) ranks that column in money, at the top of the
 * page an owner reads.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — same session as the fix (`20 §4.3`), with the mutation
 * matrix in `packages/inventory/CLAUDE.md` standing in for the independence guarantee.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { BANNED_VARIANCE_WORDS } from "../noise.js";
import { type ReferenceData, referenceRefusals } from "../reference.js";
import { varianceReports } from "../variance.js";
import { consumption, count, event, item, LOCATION, resetIds } from "./fixtures.js";

beforeEach(resetIds);

const KG = 1_000_000;

const soldOnce = (sellable_id: string, qty: number) => [
  event("order.created", { order_id: "o1", channel: "counter" }, { at: 1_000 }),
  event(
    "order.line_added",
    { order_id: "o1", line_id: "l1", item_id: sellable_id, qty, unit_price_paisa: 45_000 },
    { at: 1_000 },
  ),
  event("order.confirmed", { order_id: "o1" }, { at: 1_000 }),
];

// ── §A · 10-F31 R2 — all-or-nothing is arithmetic, not only a plate-cost rendering ─────────────

describe("§A · 10-F31 R2 — a dish that cannot be exploded deducts NOTHING", () => {
  /**
   * ⚠ **THE DEFECT: `explodeRecipe` wrote into the caller's totals line by line and threw on the
   * first component it could not resolve, so a dish was reported as *not deducted* and *partially
   * deducted* at the same time.** `explodeInto` caught the throw, filed the sellable as a
   * `coverage_gap` — *"Deduction skipped, listed, never theft"* — and left the earlier lines'
   * quantities exactly where they were. Measured: **4 karahis produced `chicken → 2 000 000`
   * alongside `coverage_gaps: ["karahi"]`** — 2 kg of phantom consumption that inflates the gap on
   * an item nobody has any reason to look at.
   *
   * The reference set below is one the WRITER accepted: `referenceRefusals` had no rule for a
   * `prepared` item with no producing prep recipe, which is why this was reachable rather than
   * theoretical. Both halves are fixed — the fold no longer half-applies an act, and the writer no
   * longer publishes the set — and the fold's half is the load-bearing one, because a writer rule
   * is not a fold's excuse for leaving half an explosion behind.
   */
  const halfResolvable: ReferenceData = {
    items: [
      item({ item_id: "chicken", name: "Chicken" }),
      item({ item_id: "marinade", name: "Marinade", type: "prepared" }),
    ],
    areas: [],
    recipes: [
      {
        recipe_id: "karahi",
        version: 7,
        yield_qty_base: null,
        produces_item_id: null,
        lines: [
          // The FIRST line resolves. The second does not. Order matters to the defect and to the
          // fix, so the resolvable line is deliberately first.
          { line_no: 0, component: { kind: "item", id: "chicken" }, qty: 500_000 },
          { line_no: 1, component: { kind: "item", id: "marinade" }, qty: 200_000 },
        ],
      },
    ],
    menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "karahi", recipe_id: "karahi" }],
  };

  it("⚠ NOT ONE MILLIGRAM of the resolvable line reaches the totals", () => {
    const used = consumption(soldOnce("karahi", 4), halfResolvable);
    expect([...used.by_item]).toEqual([]);
    expect(used.by_item.get("chicken")).toBeUndefined();
  });

  it("…and the dish is named as a coverage gap, which is the only thing it may be", () => {
    const used = consumption(soldOnce("karahi", 4), halfResolvable);
    expect(used.coverage_gaps).toEqual(["karahi"]);
  });

  it("no recipe VERSION is banked for an explosion that contributed nothing", () => {
    // `10-F3`'s key is `(order_line_id, recipe_version)` — *"the version this row was computed
    // with"*. A version recorded for a dish that deducted nothing is a claim about a derived row
    // that does not exist, and slice 2's recompute would key off it.
    const used = consumption(soldOnce("karahi", 4), halfResolvable);
    expect([...used.recipe_versions]).toEqual([]);
  });

  it("THE CONTROL: the same dish with its chain complete deducts BOTH lines, exactly", () => {
    // Without this, "deduct nothing, ever" passes every assertion above.
    const complete: ReferenceData = {
      ...halfResolvable,
      recipes: [
        ...halfResolvable.recipes,
        {
          recipe_id: "prep-marinade",
          version: 2,
          yield_qty_base: 1 * KG,
          produces_item_id: "marinade",
          lines: [{ line_no: 0, component: { kind: "item", id: "chicken" }, qty: 100_000 }],
        },
      ],
    };
    const used = consumption(soldOnce("karahi", 4), complete);
    // 4 × 500 g direct + 4 × 200 g of marinade × (100 g chicken per 1 kg yield) = 2 kg + 80 g.
    expect(used.by_item.get("chicken")).toBe(2_080_000);
    expect(used.coverage_gaps).toEqual([]);
    expect([...used.recipe_versions].sort()).toEqual([
      ["karahi", 7],
      ["prep-marinade", 2],
    ]);
  });

  it("a partial explosion does not leak into ANOTHER dish's total either", () => {
    // The totals map is shared across every line of the period, so a half-applied explosion lands
    // on top of a perfectly good dish's numbers. This is the same assertion at the report level:
    // the resolvable dish keeps exactly its own consumption and nothing more.
    const twoDishes: ReferenceData = {
      ...halfResolvable,
      recipes: [
        ...halfResolvable.recipes,
        {
          recipe_id: "tikka",
          version: 1,
          yield_qty_base: null,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "item", id: "chicken" }, qty: 300_000 }],
        },
      ],
      menu_recipes: [
        ...halfResolvable.menu_recipes,
        { sellable_kind: "menu_item", sellable_id: "tikka", recipe_id: "tikka" },
      ],
    };
    const events = [
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 1_000 }),
      event(
        "order.line_added",
        { order_id: "o1", line_id: "l1", item_id: "karahi", qty: 4, unit_price_paisa: 45_000 },
        { at: 1_000 },
      ),
      event(
        "order.line_added",
        { order_id: "o1", line_id: "l2", item_id: "tikka", qty: 2, unit_price_paisa: 30_000 },
        { at: 1_000 },
      ),
      event("order.confirmed", { order_id: "o1" }, { at: 1_000 }),
    ];
    const used = consumption(events, twoDishes);
    expect(used.by_item.get("chicken")).toBe(600_000); // the tikka's 2 × 300 g, and nothing else
    expect(used.coverage_gaps).toEqual(["karahi"]);
  });

  it("the WRITER refuses the set that made this reachable, and names the item to fix", () => {
    const refusals = referenceRefusals(halfResolvable);
    const refusal = refusals.find((row) => row.code === "prep_recipe_missing");
    expect(refusal?.subject).toBe("marinade");
    expect(refusal?.fr).toBe("10-F3");
  });
});

// ── §B · 10-F3 / 10-F8 — two prep recipes for one item is an AMBIGUITY, not an array lookup ────

describe("§B · 10-F3 — the producing prep recipe never comes from array order", () => {
  /**
   * ⚠ **THE DEFECT: `refs.recipes.find(r => r.produces_item_id === item.item_id)` returned whichever
   * row the array happened to hold first.** Two identical reference sets differing only in order
   * answered `goat → 240 000` and `beef → 240 000` — a projected MONEY value decided by the order
   * of an input array, which is the shape `01-F34` exists to remove, and the same hazard
   * `consumption` already handled deliberately for two menu recipes sharing one sellable id
   * (*"an AMBIGUITY rather than two mappings … never a guess between them"*). The argument was made
   * for the menu side and not for the prep side.
   */
  const withProducers = (order: readonly string[]): ReferenceData => ({
    items: [
      item({ item_id: "goat", name: "Goat" }),
      item({ item_id: "beef", name: "Beef" }),
      item({ item_id: "boti", name: "Boti", type: "prepared" }),
    ],
    areas: [],
    recipes: [
      {
        recipe_id: "karahi",
        version: 1,
        yield_qty_base: null,
        produces_item_id: null,
        lines: [{ line_no: 0, component: { kind: "item", id: "boti" }, qty: 200_000 }],
      },
      ...order.map((meat) => ({
        recipe_id: `prep-${meat}`,
        version: 1,
        yield_qty_base: 1 * KG,
        produces_item_id: "boti",
        lines: [{ line_no: 0, component: { kind: "item" as const, id: meat }, qty: 1_200_000 }],
      })),
    ],
    menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "karahi", recipe_id: "karahi" }],
  });

  it("⚠ the two array orders give the IDENTICAL answer", () => {
    const goatFirst = consumption(soldOnce("karahi", 1), withProducers(["goat", "beef"]));
    const beefFirst = consumption(soldOnce("karahi", 1), withProducers(["beef", "goat"]));
    expect([...goatFirst.by_item]).toEqual([...beefFirst.by_item]);
    expect(goatFirst.coverage_gaps).toEqual(beefFirst.coverage_gaps);
  });

  it("…and that answer is a REFUSAL, not the first row — nothing is deducted, the dish is named", () => {
    // Equality alone would be satisfied by an implementation that always picked `goat`. This is the
    // half that says the ambiguity is reported rather than resolved by a rule nobody wrote.
    const used = consumption(soldOnce("karahi", 1), withProducers(["goat", "beef"]));
    expect([...used.by_item]).toEqual([]);
    expect(used.coverage_gaps).toEqual(["karahi"]);
  });

  it("THE CONTROL: ONE producer explodes through the chain and deducts the right raw item", () => {
    const used = consumption(soldOnce("karahi", 1), withProducers(["goat"]));
    // 200 g of boti at a 1 kg yield from 1.2 kg of goat = 240 g.
    expect([...used.by_item]).toEqual([["goat", 240_000]]);
    expect(used.coverage_gaps).toEqual([]);
  });

  it("the WRITER refuses two producers and names both recipes", () => {
    const refusals = referenceRefusals(withProducers(["goat", "beef"]));
    const refusal = refusals.find((row) => row.code === "duplicate_prep_producer");
    expect(refusal?.subject).toBe("boti");
    expect(refusal?.detail).toContain("prep-beef and prep-goat");
    expect(referenceRefusals(withProducers(["goat"]))).toEqual([]);
  });

  it("both new refusals speak 10-F33 (f)'s vocabulary — a refusal is prose an owner reads", () => {
    const everything = [
      ...referenceRefusals(withProducers(["goat", "beef"])),
      ...referenceRefusals({
        items: [item({ item_id: "sauce", type: "prepared" })],
        areas: [],
        recipes: [
          {
            recipe_id: "dish",
            version: 1,
            yield_qty_base: null,
            produces_item_id: null,
            lines: [{ line_no: 0, component: { kind: "item", id: "sauce" }, qty: 1 }],
          },
        ],
        menu_recipes: [],
      }),
    ];
    expect(everything.length).toBeGreaterThan(1);
    for (const refusal of everything) {
      const words = refusal.detail.toLowerCase().split(/[^a-z]+/);
      for (const banned of BANNED_VARIANCE_WORDS) {
        expect(words, `refusal ${refusal.code}`).not.toContain(banned);
      }
    }
  });
});

// ── §C · 10-F30 — declared areas decide COMPLETENESS; present lines decide the SUM ─────────────

describe("§C · 10-F30 — a count line for an undeclared area is COUNTED, never dropped", () => {
  const KETCHUP: ReferenceData = {
    items: [
      item({
        item_id: "ketchup",
        name: "Ketchup",
        reference_cost: { value_paisa: 1_000, qty_base: KG },
      }),
    ],
    areas: [{ item_id: "ketchup", location_id: LOCATION, area_id: "store", sort: 0 }],
    recipes: [],
    menu_recipes: [],
  };

  const ketchupRow = (events: Parameters<typeof varianceReports>[0]["events"]) =>
    varianceReports({ location_id: LOCATION, events, refs: KETCHUP })[1]?.rows[0];

  it("⚠ THE FOUNDER'S KETCHUP: 15 kg in a room reference data does not know about still counts", () => {
    // Measured before the fix: `{counted: true, qty_base: 5 kg, area_count: 1}` — the kitchen's
    // 15 kg vanished **with total confidence**, understating the count, inflating the gap and
    // producing an accusation out of a correctly executed walk. `10-F30` says the item's quantity
    // is *"the sum of its area lines"*, and it also says a counter who finds an item in a room it
    // is not declared in *"counts it into an existing area, and the owner fixes the reference data
    // after"* — so reference data lagging the shelf is a case the FR contemplates.
    const row = ketchupRow([
      count(
        "c0",
        [{ item_id: "ketchup", area_id: "store", counted: true, qty_base: 20 * KG }],
        1_000,
      ),
      count(
        "c1",
        [
          { item_id: "ketchup", area_id: "store", counted: true, qty_base: 5 * KG },
          { item_id: "ketchup", area_id: "kitchen", counted: true, qty_base: 15 * KG },
        ],
        2_000,
      ),
    ]);
    expect(row?.counted_qty_base).toBe(20 * KG);
    expect(row?.gap_qty_base).toBe(0);
    expect(row?.withheld).toBeNull();
  });

  it("THE CONTROL: a DECLARED area with no line still refuses the whole item", () => {
    // The union must not become "the sheet decides the roster" — that is the same hole with an
    // extra step, and it is what `10-F29`'s completeness rule exists to stop.
    const refs: ReferenceData = {
      ...KETCHUP,
      areas: [
        { item_id: "ketchup", location_id: LOCATION, area_id: "store", sort: 0 },
        { item_id: "ketchup", location_id: LOCATION, area_id: "kitchen", sort: 1 },
      ],
    };
    const reports = varianceReports({
      location_id: LOCATION,
      events: [
        count(
          "c0",
          [
            { item_id: "ketchup", area_id: "store", counted: true, qty_base: 10 * KG },
            { item_id: "ketchup", area_id: "kitchen", counted: true, qty_base: 10 * KG },
          ],
          1_000,
        ),
        count(
          "c1",
          [{ item_id: "ketchup", area_id: "store", counted: true, qty_base: 5 * KG }],
          2_000,
        ),
      ],
      refs,
    });
    expect(reports[1]?.rows[0]?.withheld).toEqual({
      kind: "not_counted",
      reason: "area_line_missing",
    });
  });

  it("an undeclared line that is DECLARED NOT COUNTED refuses the item, like any other line", () => {
    // The union brings the line into the required set, so its `counted: false` is a stated absence
    // and not a quantity of zero — `10-F29`'s rule reaching a row reference data never mentioned.
    const row = ketchupRow([
      count(
        "c0",
        [{ item_id: "ketchup", area_id: "store", counted: true, qty_base: 20 * KG }],
        1_000,
      ),
      count(
        "c1",
        [
          { item_id: "ketchup", area_id: "store", counted: true, qty_base: 5 * KG },
          { item_id: "ketchup", area_id: "kitchen", counted: false },
        ],
        2_000,
      ),
    ]);
    expect(row?.withheld).toEqual({ kind: "not_counted", reason: "declared_not_counted" });
  });
});

// ── §D · 10-F18 / 10-F31 — the case the deleted `opening_unknown` claimed, under its real owner ─

describe("§D · an opening that could not be VALUED withholds the money and keeps the quantity", () => {
  it("the row reads `no_cost_basis`, and its quantity gap survives", () => {
    // ⚠ `WithheldReason` carried a fifth member, `opening_unknown`, whose branch tested
    // `carry.get(item_id) === undefined` — and the baseline sets a carry for every counted item, so
    // it was `undefined` never: a mutant replacing the condition with `false` killed 0 of 113. Its
    // comment described *"a carry with no VALUE"*, which is this case, and this case already had an
    // owner. The variant is deleted rather than re-aimed; this assertion is what stops it coming
    // back under the wrong label and taking the quantity column with it (`10-F31`: *"Variance
    // report in quantity — No gate — it needs no price at all"*).
    const refs: ReferenceData = {
      items: [item({ item_id: "salt", name: "Salt", reference_cost: null })],
      areas: [],
      recipes: [],
      menu_recipes: [],
    };
    const reports = varianceReports({
      location_id: LOCATION,
      events: [
        count("c0", [{ item_id: "salt", counted: true, qty_base: 10 * KG }], 1_000),
        count("c1", [{ item_id: "salt", counted: true, qty_base: 9 * KG }], 2_000),
      ],
      refs,
    });
    const row = reports[1]?.rows[0];
    expect(row?.withheld).toEqual({ kind: "no_cost_basis" });
    expect(row?.cost_basis).toBe("none");
    expect(row?.gap_qty_base).toBe(-1 * KG);
    expect(row?.gap_value_paisa).toBeNull();
  });
});
