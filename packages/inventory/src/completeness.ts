/**
 * `10-F31` — the three units of completeness, as pure functions **here and nowhere else**.
 *
 * `13-F5` already owns the rule that *"each metric declares its minimum-data precondition …
 * Execution below the precondition returns a typed `insufficient_data` result with the reason —
 * **never a number**"*, and `12-F21` requires one number everywhere. Implementing this per screen is
 * exactly how `01-F60`'s two declarations of the enabled `(branch, channel)` set happened, and that
 * cost a whole session to unify. So: one declaration, three functions, and every surface asks.
 *
 * **They fail differently, and the difference decides which surface gets which gate.**
 *
 *   · **item** — costable iff its basis ≠ `none`. Local.
 *   · **dish** — ALL-OR-NOTHING per sellable. Complete → the plate cost with its basis mix.
 *     Incomplete → **nothing**, plus the blocking item names. It fails *locally and repairably*
 *     (3 bad dishes, 37 true plate costs) and is the repair queue, so it is enforced hard.
 *   · **window** — per (location, window). It fails *globally* and re-breaks on every menu change:
 *     a weekend special sold four times at 1.8% of revenue with no recipe blanks the whole window.
 *
 * ⚠ **THE ROUND-3 TRAP THIS FILE IS MOST LIKELY TO REPRODUCE, NAMED SO THE ORACLE CAN AIM AT IT.**
 * `plans/inventory/design.md` §8 records the experiment this repo already lost: *"`F60`'s amendment
 * test published a **fully priced** entry, so it could not distinguish 'refused for the right
 * reason' from any refusal."* A suite here that only ever feeds a fully costed recipe cannot tell a
 * correct gate from one that refuses everything. The four fixtures that separate them are: a recipe
 * missing ONE leaf price; a recipe whose leaf is priced at an **explicit 0**; a sold sellable with
 * NO recipe; and a fully complete recipe as the control. **An implementation that refuses the
 * explicit zero passes a badly built suite and is wrong** — `01-F60`'s free-modifier argument,
 * verbatim, one plane over: an explicit `0` distinguishes *this costs nothing* from *somebody
 * forgot*, and those are indistinguishable under any rule that lets an unpriced leaf through.
 */

import { type Paisa, paisa, sumPaisa } from "@restos/domain";
import { type CostBasis, type ResolvedCost, valueOrNull } from "./period.js";
import { add, fromInt, mul, type Rational, rational, roundHalfUp, ZERO } from "./rational.js";
import type { ReferenceData } from "./reference.js";

/**
 * `10-F31`'s ITEM unit. The whole predicate — there is nothing else to it.
 *
 * @unreached-owed The three completeness predicates in this file are slice 1 step 3's deliverable
 * and their CONSUMERS are step 5 and slice 2: the recipe editor's plate cost (`14-F9`/`14-F10`,
 * which is also the repair queue), `15-F9`'s onboarding workbench, and `12-F11`'s margin line.
 * Slice 1 ships the arithmetic and the honest surface and NOT the figure —
 * `plans/inventory/design.md` §7's omit list is explicit that "the food-cost / gross-margin figure
 * itself" leaves slice 1, because `10-F31`'s window gate is unreachable on day one by construction
 * (an org has to complete first). Writing them here rather than in the editor is `18 §2`: the gate
 * belongs in ONE place, and implementing it per screen is how `01-F60`'s two declarations of the
 * enabled set happened.
 */
export const itemCostable = (cost: ResolvedCost): boolean => cost.basis !== "none";

export type DishCost =
  | {
      readonly kind: "costed";
      readonly sellable_id: string;
      readonly plate_cost_paisa: number;
      /**
       * `10-F31` R2: *"shown with its basis mix"*. How many leaves came from invoices and how many
       * from a typed reference price — the figure states its basis, which is the rule's second
       * half and the half a screen drops first.
       */
      readonly basis_mix: Readonly<Record<CostBasis, number>>;
    }
  | {
      readonly kind: "refused";
      readonly sellable_id: string;
      /** `10-F31` R2: incomplete → NOTHING, plus the blocking item names. This IS the repair queue. */
      readonly blocking_item_ids: readonly string[];
      readonly reason: "no_recipe" | "uncostable_leaf" | "explosion_failed";
    };

class ExplosionFailed extends Error {}

/**
 * One dish's plate cost, all-or-nothing.
 *
 * The explosion is the same rational walk `deduction.ts` uses and for the same reason — a nested
 * prep recipe divides by a yield, and rounding at each hop is the drift `10 §8` forbids. Here the
 * rounding happens once per LEAF (each leaf's quantity is valued at its own pair), because two
 * leaves may resolve to different bases and there is no single pair to value the dish at.
 *
 * @unreached-owed With `itemCostable` above — the DISH gate's consumer is `14-F9`/`14-F10`'s recipe
 * editor (slice 1 step 5), where R2's blocking-item list IS the repair queue and `14-F29`'s
 * precedent puts completeness where the owner types.
 */
export const dishCost = (
  sellable_id: string,
  refs: ReferenceData,
  costOf: (item_id: string) => ResolvedCost,
): DishCost => {
  const mappings = refs.menu_recipes.filter((m) => m.sellable_id === sellable_id);
  const recipeIds = [...new Set(mappings.map((m) => m.recipe_id))];
  if (recipeIds.length !== 1) {
    return { kind: "refused", sellable_id, blocking_item_ids: [], reason: "no_recipe" };
  }

  const leaves = new Map<string, Rational>();
  const walk = (recipe_id: string, multiplier: Rational, seen: ReadonlySet<string>): void => {
    if (seen.has(recipe_id)) throw new ExplosionFailed(recipe_id);
    const recipe = refs.recipes.find((r) => r.recipe_id === recipe_id);
    if (recipe === undefined) throw new ExplosionFailed(recipe_id);
    const next = new Set([...seen, recipe_id]);
    for (const line of recipe.lines) {
      const scaled = mul(multiplier, fromInt(line.qty));
      if (line.component.kind === "recipe") {
        const sub = refs.recipes.find((r) => r.recipe_id === line.component.id);
        const yieldQty = sub?.yield_qty_base ?? 0;
        if (yieldQty <= 0) throw new ExplosionFailed(line.component.id);
        walk(line.component.id, rational(scaled.n, scaled.d * BigInt(yieldQty)), next);
        continue;
      }
      const item = refs.items.find((i) => i.item_id === line.component.id);
      if (item === undefined) throw new ExplosionFailed(line.component.id);
      if (item.type === "prepared") {
        const prep = refs.recipes.find((r) => r.produces_item_id === item.item_id);
        const yieldQty = prep?.yield_qty_base ?? 0;
        if (prep === undefined || yieldQty <= 0) throw new ExplosionFailed(item.item_id);
        walk(prep.recipe_id, rational(scaled.n, scaled.d * BigInt(yieldQty)), next);
        continue;
      }
      leaves.set(item.item_id, add(leaves.get(item.item_id) ?? ZERO, scaled));
    }
  };

  try {
    // biome-ignore lint/style/noNonNullAssertion: `recipeIds.length === 1` was just checked.
    walk(recipeIds[0]!, fromInt(1), new Set());
  } catch (error) {
    if (error instanceof ExplosionFailed) {
      return { kind: "refused", sellable_id, blocking_item_ids: [], reason: "explosion_failed" };
    }
    throw error;
  }

  const blocking: string[] = [];
  const mix: Record<CostBasis, number> = { receipted: 0, reference: 0, none: 0 };
  const values: Paisa[] = [];
  for (const [item_id, qty] of [...leaves].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const cost = costOf(item_id);
    if (!itemCostable(cost)) {
      blocking.push(item_id);
      continue;
    }
    mix[cost.basis] += 1;
    // ⚠ An explicit `0` is a COST and must not be filtered here. `01-F60`: it distinguishes "this
    // costs nothing" from "somebody forgot", and `itemCostable` above is the only gate — a
    // truthiness test on the value would collapse the two and pass a badly built suite.
    const value = valueOrNull(roundHalfUp(qty), cost);
    values.push(paisa(value ?? 0));
  }
  if (blocking.length > 0) {
    return {
      kind: "refused",
      sellable_id,
      blocking_item_ids: blocking.sort(),
      reason: "uncostable_leaf",
    };
  }
  return { kind: "costed", sellable_id, plate_cost_paisa: sumPaisa(values), basis_mix: mix };
};

export type WindowCompleteness = {
  /**
   * `10-F31`'s window unit, in **basis points** — an integer, because a ratio held as a float in a
   * projected value is law 3's hazard one field over and because `27`'s surfaces render integers.
   */
  readonly costed_revenue_share_bp: number;
  /**
   * ⚠ **COMPLETE is EXACT EQUALITY OF THE PAISA, NOT `share_bp === 10_000`, AND THIS IS A REAL
   * TRAP.** A window at 99.996% costed rounds to 10 000 bp, so a gate written on the rendered
   * ratio would declare COMPLETE while a dish nobody costed was sold — which is precisely the
   * confidently-wrong figure `10-F31` R1 exists to refuse. The bp figure is for DISPLAY (it is what
   * `15-F9`'s workbench shows as the ramp's progress); the gate is the equality.
   *
   * ⚠ **AND THE GATE'S TWO CLAUSES ARE NOT INDEPENDENT — MEASURED, so this is stated rather than
   * implied.** `10-F31` names both *"that share is exactly 1"* and *"no sold sellable lacks a
   * recipe"*, and mutation says the first is REDUNDANT given the second: dropping `costed === total`
   * killed **0 of 113** tests (mutant V9c), because `blocking` is populated on exactly the dishes
   * that keep `costed` below `total`. The converse is NOT redundant — dropping `blocking.length ===
   * 0` kills 1 (V9d), and the case that separates them is a sellable **sold at zero revenue**: it
   * contributes 0 to both sums, so the share is still exactly 1, and it still has no recipe. A comp
   * or a free add-on is that case, and `completeness.test.ts` §C has the fixture. The equality
   * clause is kept as belt: it is the FR's own words and it stops the day someone changes how
   * `blocking` is built.
   */
  readonly complete: boolean;
  /** Sellables sold in the window that could not be costed, with why. `10-F31` R1's "what would close it". */
  readonly blocking_sellables: readonly DishCost[];
  readonly costed_billed_paisa: number;
  readonly total_billed_paisa: number;
};

/**
 * `10-F31`'s WINDOW unit.
 *
 * **Revenue, because `13-F5`, `14-F10` and `15-F9` all say revenue**; and **billed**, because
 * `01-F63`'s attested `billed_paisa` is the number `services/api/src/summary.ts` already uses and a
 * second derivation of the same figure is what `12-F21` exists to prevent. The caller supplies the
 * billed revenue per sellable; this function does not re-derive it.
 *
 * @unreached-owed The WINDOW gate's consumer is `12-F11`'s margin line, which slice 1 deliberately
 * does not ship (`plans/inventory/design.md` §7's omit list) — the gate is unreachable on day one
 * by construction, because an org has to COMPLETE first. `10-F31` also puts it in `13-F5`'s metric
 * registry rather than on a screen, and that registry does not exist. Slice 2 wires both.
 */
export const windowCompleteness = (
  billedBySellable: ReadonlyMap<string, number>,
  refs: ReferenceData,
  costOf: (item_id: string) => ResolvedCost,
): WindowCompleteness => {
  const costedValues: Paisa[] = [];
  const totalValues: Paisa[] = [];
  const blocking: DishCost[] = [];
  for (const [sellable_id, billed] of [...billedBySellable].sort(([a], [b]) => (a < b ? -1 : 1))) {
    totalValues.push(paisa(billed));
    const cost = dishCost(sellable_id, refs, costOf);
    if (cost.kind === "costed") costedValues.push(paisa(billed));
    else blocking.push(cost);
  }
  const costed = sumPaisa(costedValues);
  const total = sumPaisa(totalValues);
  return {
    costed_revenue_share_bp:
      total === 0 ? 0 : roundHalfUp(rational(BigInt(costed) * 10_000n, BigInt(total))),
    // Exact equality on the paisa. See the field's own note — this is not `share_bp === 10_000`.
    complete: total > 0 && costed === total && blocking.length === 0,
    blocking_sellables: blocking,
    costed_billed_paisa: costed,
    total_billed_paisa: total,
  };
};
