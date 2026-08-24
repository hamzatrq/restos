/**
 * `10-F31` — the three units of completeness, and **the round-3 experiment this repo has already
 * run and lost.**
 *
 * ⚠ `plans/inventory/design.md` §8, quoting AGENTS.md's own record: *"`F60`'s amendment test
 * published a **fully priced** entry, so it could not distinguish 'refused for the right reason'
 * from any refusal. §5.6's gate is the same shape and will reproduce it."* The four fixtures it
 * names are mandatory and all four are here:
 *
 *   (i)   a recipe missing **one** leaf price → refused, naming that leaf;
 *   (ii)  a recipe whose leaf is priced at an **explicit `0`** → **COSTED**, not refused. This is
 *         the fixture that catches a truthiness test, and it is `01-F60`'s free-modifier argument
 *         one plane over: an explicit `0` distinguishes *this costs nothing* from *somebody forgot*,
 *         and an implementation that refuses it **passes a badly built suite and is wrong**;
 *   (iii) a sold sellable with **no recipe at all** → refused, differently;
 *   (iv)  a fully complete recipe → the CONTROL, which is what makes the three refusals mean
 *         anything at all.
 */

import { describe, expect, it } from "vitest";
import { dishCost, itemCostable, windowCompleteness } from "../completeness.js";
import type { ResolvedCost } from "../period.js";
import type { ReferenceData } from "../reference.js";
import { item } from "./fixtures.js";

const KG = 1_000_000;

const REFS: ReferenceData = {
  items: [
    item({ item_id: "chicken" }),
    item({ item_id: "salt" }),
    item({ item_id: "yoghurt" }),
    item({ item_id: "marinade", type: "prepared" }),
  ],
  areas: [],
  recipes: [
    // A prep recipe: 18 kg of raw chicken + 2 kg of yoghurt makes 15 kg of marinade.
    {
      recipe_id: "prep-marinade",
      version: 1,
      yield_qty_base: 15 * KG,
      produces_item_id: "marinade",
      lines: [
        { line_no: 0, component: { kind: "item", id: "chicken" }, qty: 18 * KG },
        { line_no: 1, component: { kind: "item", id: "yoghurt" }, qty: 2 * KG },
      ],
    },
    // A dish that consumes the prepared item plus a pinch of salt.
    {
      recipe_id: "boti",
      version: 2,
      yield_qty_base: null,
      produces_item_id: null,
      lines: [
        { line_no: 0, component: { kind: "item", id: "marinade" }, qty: 300_000 },
        { line_no: 1, component: { kind: "item", id: "salt" }, qty: 2_000 },
      ],
    },
  ],
  menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "boti-plate", recipe_id: "boti" }],
};

/** Rs 680/kg chicken, Rs 60/kg salt, Rs 200/kg yoghurt — all as PAIRS, never as a rate. */
const priced = (over: Readonly<Record<string, ResolvedCost>> = {}) => {
  const table: Record<string, ResolvedCost> = {
    chicken: { basis: "receipted", pair: { value_paisa: 68_000, qty_base: KG } },
    salt: { basis: "reference", pair: { value_paisa: 6_000, qty_base: KG } },
    yoghurt: { basis: "receipted", pair: { value_paisa: 20_000, qty_base: KG } },
    ...over,
  };
  return (item_id: string): ResolvedCost => table[item_id] ?? { basis: "none", pair: null };
};

// ── §A · the ITEM unit ─────────────────────────────────────────────────────────────────────────

describe("§A · 10-F31 — the item unit is `cost_basis !== none`, and an explicit zero is a COST", () => {
  it("receipted and reference are both costable; none is not", () => {
    expect(itemCostable({ basis: "receipted", pair: { value_paisa: 1, qty_base: 1 } })).toBe(true);
    expect(itemCostable({ basis: "reference", pair: { value_paisa: 1, qty_base: 1 } })).toBe(true);
    expect(itemCostable({ basis: "none", pair: null })).toBe(false);
  });

  it("⚠ AN EXPLICIT ZERO IS COSTABLE — the fixture that catches a truthiness test", () => {
    // `01-F60`, verbatim one plane over: an explicit `0` distinguishes "this costs nothing" from
    // "somebody forgot", and those are indistinguishable under any rule that lets an unpriced leaf
    // through. `if (cost.pair?.value_paisa)` is the mutant this kills.
    expect(itemCostable({ basis: "reference", pair: { value_paisa: 0, qty_base: KG } })).toBe(true);
  });
});

// ── §B · the DISH unit — the four mandated fixtures ────────────────────────────────────────────

describe("§B · 10-F31 R2 — a dish cost is ALL-OR-NOTHING, and the four fixtures separate the reasons", () => {
  it("(iv) THE CONTROL — a fully complete recipe is costed, exactly", () => {
    // 300 g of marinade from a 15 kg batch made of 18 kg chicken + 2 kg yoghurt:
    //   chicken  300_000 × 18/15 = 360_000 mg → 360_000 × 68_000 / 1_000_000 =  24_480 paisa
    //   yoghurt  300_000 ×  2/15 =  40_000 mg →  40_000 × 20_000 / 1_000_000 =     800 paisa
    //   salt       2_000                       →   2_000 ×  6_000 / 1_000_000 =      12 paisa
    //                                                                   total =  25_292 paisa
    const cost = dishCost("boti-plate", REFS, priced());
    expect(cost.kind).toBe("costed");
    if (cost.kind !== "costed") return;
    expect(cost.plate_cost_paisa).toBe(25_292);
    // R2's second half, which a screen drops first: the figure states its basis MIX.
    expect(cost.basis_mix).toEqual({ receipted: 2, reference: 1, none: 0 });
  });

  it("(i) ONE missing leaf price refuses the WHOLE dish and NAMES the blocker", () => {
    const cost = dishCost("boti-plate", REFS, priced({ salt: { basis: "none", pair: null } }));
    expect(cost.kind).toBe("refused");
    if (cost.kind !== "refused") return;
    expect(cost.reason).toBe("uncostable_leaf");
    expect(cost.blocking_item_ids).toEqual(["salt"]);
    // R5: never a PARTIAL plate cost. The Rs 252.80 of chicken and yoghurt is NOT shown, because a
    // plate cost missing its salt comes out confidently low — the Apicbase object §2 (c) rejects.
    expect(Object.keys(cost)).not.toContain("plate_cost_paisa");
  });

  it("(ii) ⚠ AN EXPLICIT ZERO LEAF IS COSTED, NOT REFUSED — and this is the one that is wrong to get right by refusing", () => {
    // Salt at Rs 0 is "the extra raita at 0" of the supply plane. An implementation that refused it
    // passes a suite built only from fixtures (i), (iii) and (iv), and is wrong.
    const cost = dishCost(
      "boti-plate",
      REFS,
      priced({ salt: { basis: "reference", pair: { value_paisa: 0, qty_base: KG } } }),
    );
    expect(cost.kind).toBe("costed");
    if (cost.kind !== "costed") return;
    expect(cost.plate_cost_paisa).toBe(25_280); // the 12 paisa of salt, and nothing else, is gone
  });

  it("(iii) NO RECIPE AT ALL refuses for a DIFFERENT, named reason", () => {
    // A different repair: this one needs a recipe authored, not a price typed. Collapsing the two
    // reasons would send an owner to the wrong screen.
    const cost = dishCost("weekend-special", REFS, priced());
    expect(cost.kind).toBe("refused");
    if (cost.kind !== "refused") return;
    expect(cost.reason).toBe("no_recipe");
    expect(cost.blocking_item_ids).toEqual([]);
  });

  it("TWO mapping rows for one sellable is an AMBIGUITY, never a guess between them", () => {
    // ⚠ This is the design correction: `MenuRecipe` is keyed `(sellable_kind, sellable_id)` in
    // §4.6, but `order.line_added` carries no kind, so a fold can only key by the id.
    const ambiguous: ReferenceData = {
      ...REFS,
      menu_recipes: [
        { sellable_kind: "menu_item", sellable_id: "boti-plate", recipe_id: "boti" },
        { sellable_kind: "modifier", sellable_id: "boti-plate", recipe_id: "prep-marinade" },
      ],
    };
    expect(dishCost("boti-plate", ambiguous, priced()).kind).toBe("refused");
  });

  it("blocking items are SORTED, so the repair queue is a set and not an arrival order", () => {
    const cost = dishCost(
      "boti-plate",
      REFS,
      priced({
        salt: { basis: "none", pair: null },
        chicken: { basis: "none", pair: null },
      }),
    );
    if (cost.kind !== "refused") throw new Error("expected refusal");
    expect(cost.blocking_item_ids).toEqual(["chicken", "salt"]);
  });
});

// ── §C · the WINDOW unit ───────────────────────────────────────────────────────────────────────

describe("§C · 10-F31 — the window unit, and the rounding trap in its gate", () => {
  const billed = new Map([
    ["boti-plate", 400_000],
    ["weekend-special", 7_200],
  ]);

  it("COMPLETE requires every sold sellable to be costable", () => {
    const answer = windowCompleteness(new Map([["boti-plate", 400_000]]), REFS, priced());
    expect(answer.complete).toBe(true);
    expect(answer.costed_revenue_share_bp).toBe(10_000);
  });

  it("a weekend special sold four times BLANKS the window, and names itself", () => {
    // The FR's own failure analysis: the window gate fails GLOBALLY and re-breaks on every menu
    // change. 7 200 of 407 200 paisa is 1.77% of revenue and it takes the whole figure down.
    const answer = windowCompleteness(billed, REFS, priced());
    expect(answer.complete).toBe(false);
    expect(answer.blocking_sellables.map((b) => b.sellable_id)).toEqual(["weekend-special"]);
  });

  it("⚠ THE ROUNDING TRAP — 99.996% costed rounds to 10 000 bp and is STILL not COMPLETE", () => {
    // A gate written on the rendered ratio (`share_bp === 10_000`) would declare COMPLETE while a
    // dish nobody costed was sold. The gate is exact equality of the PAISA; the bp figure is for
    // the screen. This fixture is the one that separates the two implementations.
    const nearly = new Map([
      ["boti-plate", 10_000_000],
      ["weekend-special", 300], // 0.003% of revenue
    ]);
    const answer = windowCompleteness(nearly, REFS, priced());
    expect(answer.costed_revenue_share_bp).toBe(10_000); // rounds to "100%"
    expect(answer.complete).toBe(false); // and is not complete
  });

  it("⚠ A ZERO-REVENUE UNCOSTABLE SELLABLE IS THE CASE THAT SEPARATES THE GATE'S TWO CLAUSES", () => {
    // `10-F31` states BOTH: "that share is exactly 1, AND no sold sellable lacks a recipe". They
    // look redundant and on almost every fixture they are — `blocking` is populated exactly when a
    // dish refuses, and a refused dish is exactly what keeps `costed` below `total`. The one case
    // that separates them is a sellable **sold at zero revenue** — a comp, or a free add-on: it
    // contributes 0 to both sums, so the share is still exactly 1, and it still has no recipe.
    //
    // Found by MUTATION, not by reading: mutant V9d (the equality clause alone, `blocking` dropped)
    // survived the whole suite until this fixture existed, so the FR's second clause was carried by
    // the implementation and asserted by nothing.
    const withFreebie = new Map([
      ["boti-plate", 400_000],
      ["free-salad", 0],
    ]);
    const answer = windowCompleteness(withFreebie, REFS, priced());
    expect(answer.costed_revenue_share_bp).toBe(10_000);
    expect(answer.costed_billed_paisa).toBe(answer.total_billed_paisa);
    expect(answer.complete).toBe(false);
    expect(answer.blocking_sellables.map((b) => b.sellable_id)).toEqual(["free-salad"]);
  });

  it("an EMPTY window is not COMPLETE — nothing sold is not everything costed", () => {
    // Vacuous truth is how a margin figure appears on a day with no trade.
    expect(windowCompleteness(new Map(), REFS, priced()).complete).toBe(false);
  });

  it("the share is exact: 400 000 of 407 200 paisa is 9 823 bp", () => {
    expect(windowCompleteness(billed, REFS, priced()).costed_revenue_share_bp).toBe(9_823);
  });
});
