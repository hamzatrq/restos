/**
 * The reference data this module reads (`01-F21`), and the refusals a WRITER owes before it may
 * publish any of it.
 *
 * **These are not wire types.** `01-F75`'s resource set is closed and holds no `inventory` member;
 * admitting one is amendment **A1** in `plans/inventory/design.md` §6 and is OWED. What is here is
 * the shape the arithmetic consumes, declared once so the cloud read model and (when A1 lands) the
 * device consumer cannot disagree about it — `18 §2`'s rule, and `01-F60`'s worked example of what
 * two declarations of one set cost.
 *
 * **Every refusal below is enforced at the WRITER, never at the report.** That is `14-F29`/`01-F60`
 * precedent and it is load-bearing rather than stylistic: a report that repaired an incomplete
 * reference set would be guessing, and `10-F31` R5 forbids exactly the guesses it would have to
 * make. The writer is where the owner is standing and where the fix is one keystroke away.
 */

import type { CountBasis } from "@restos/domain";

/** `00 §6` — quantities are integer mg / ml / units and nothing else. */
export const BASE_UNITS = ["mg", "ml", "units"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/** `10-F1`'s two item types. `prepared` is produced by a prep recipe and consumed by any recipe. */
export const ITEM_TYPES = ["raw", "prepared"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * `10-F29`'s partial tier — **one per item, fixed at onboarding**, never chosen at count time.
 *
 * The vendor guidance this implements says both halves out loud: multiple count units summed into
 * one reporting unit is what nine of nine products ship, and *"each item should be counted using
 * the same unit every time"* is what their own best-practice pages say. A partial counted as
 * "1 case" one week and "0.5 case" the next produces two numbers that are not comparable, and
 * `10-F18` is a DIFFERENCE of two counts, so incomparable is the same as wrong.
 */
export type PartialTier =
  | { readonly kind: "none" }
  | { readonly kind: "fraction" }
  | { readonly kind: "weight"; readonly unit: BaseUnit };

export type CountUnits = {
  /** What a counter picks up. Free text — it is a label on a screen, not a key. */
  readonly primary_label: string;
  /**
   * ONE container in base units. `10-F33` (a) reads this as its `container_size`: the noise floor
   * is an error per *container reading*, so an item with no container size has no floor and every
   * gap on it would be reportable.
   */
  readonly primary_size_base: number;
  readonly partial: PartialTier;
};

/**
 * A `(value, qty)` pair — **never a unit rate** (`10-F28`).
 *
 * ⚠ **THIS CORRECTS `plans/inventory/design.md`, WHICH CONTRADICTS ITSELF ON EXACTLY THIS FIELD.**
 * §4.1 puts *"`reference_cost_paisa` per base unit, optional"* on the item and §4.13 calls it *"a
 * back-office unit cost"*, while §5.1 says, of the period cost, *"**And do not store a unit
 * cost.** A cost per base unit is a rate and will not be an integer."* Both cannot stand. The pair
 * wins for §5.1's reason, and the fix costs the owner nothing: *"Rs 60 per kg"* is what she types
 * and `{ value_paisa: 6000, qty_base: 1_000_000 }` is what it means, exactly. It also composes —
 * a reference basis and a receipted basis are then the SAME shape, so `valueAt` has one door and
 * the report cannot round one basis differently from the other.
 */
export type ValueQtyPair = {
  readonly value_paisa: number;
  /** > 0. A pair whose quantity is zero has no rate to offer; `valueAt` refuses it. */
  readonly qty_base: number;
};

/** `01-F21` + `10-F31`. The thing a kitchen counts, or costs, or both. */
export type InventoryItem = {
  readonly item_id: string;
  /** `00 §5.6` — user content, Unicode. An Urdu name renders and prints faithfully. */
  readonly name: string;
  readonly type: ItemType;
  /** Immutable after first use: changing it silently rescales every historical movement. */
  readonly base_unit: BaseUnit;
  /** `10-F31` — counts, variance, par alerts. Appendix D's 10–20. */
  readonly is_counted: boolean;
  /** `10-F31` — deduction's derived rows, for costing. Everything. */
  readonly is_costed: boolean;
  readonly count_units: CountUnits;
  /** `10-F31`'s `reference` basis. `null` is "no reference price typed", not "free". */
  readonly reference_cost: ValueQtyPair | null;
};

/** `10-F30` — one row per place the thing is kept. The BALANCE stays at `(item, location)`. */
export type AreaMembership = {
  readonly item_id: string;
  readonly location_id: string;
  readonly area_id: string;
  /** `10-F17`'s shelf-to-sheet order within the area. A display sort, not an identity. */
  readonly sort: number;
};

export type RecipeComponent =
  | { readonly kind: "item"; readonly id: string }
  | { readonly kind: "recipe"; readonly id: string };

export type RecipeLine = {
  readonly line_no: number;
  readonly component: RecipeComponent;
  /** In the COMPONENT's base unit (`14-F9`: integer mg/ml/units; no third "recipe unit"). */
  readonly qty: number;
};

export type Recipe = {
  readonly recipe_id: string;
  /** `10-F3`'s idempotency key half. The report records the version it computed WITH. */
  readonly version: number;
  readonly lines: readonly RecipeLine[];
  /** Prep recipes only: what one run of this recipe produces, in the produced item's base unit. */
  readonly yield_qty_base: number | null;
  readonly produces_item_id: string | null;
};

/** `14-F9` — its OWN row, never a field on the catalog entry (a recipe edit must not re-version the menu). */
export type MenuRecipe = {
  readonly sellable_kind: string;
  readonly sellable_id: string;
  readonly recipe_id: string;
};

export type ReferenceData = {
  readonly items: readonly InventoryItem[];
  readonly areas: readonly AreaMembership[];
  readonly recipes: readonly Recipe[];
  readonly menu_recipes: readonly MenuRecipe[];
};

// ── the writer's refusals ──────────────────────────────────────────────────────────────────────

export type ReferenceRefusal = {
  /** The FR that refuses it. Commandment 2: a refusal with no FR is invented policy. */
  readonly fr: string;
  readonly code:
    | "counted_not_costed"
    | "recipe_leaf_not_costed"
    | "recipe_cycle"
    | "recipe_component_missing"
    | "prep_recipe_yield_missing"
    | "weight_tier_dimension"
    | "reference_cost_zero_qty"
    | "duplicate_item"
    | "menu_recipe_missing";
  /** What the owner has to fix, named. `10-F31`'s dish gate IS the repair queue. */
  readonly subject: string;
  readonly detail: string;
};

const index = <T, K extends string | number>(rows: readonly T[], key: (row: T) => K): Map<K, T> => {
  const out = new Map<K, T>();
  for (const row of rows) out.set(key(row), row);
  return out;
};

/**
 * `10-F31`'s cycle refusal, at the writer.
 *
 * **No product in the survey documents a nesting limit, and none documents a cycle check either** —
 * dynamite sauce → mayo → dynamite sauce is an explosion that never terminates. It is refused HERE
 * and never in the fold, because a fold that had to defend itself against a cycle would either
 * throw on the ingest path (`01-F17` forbids it) or silently truncate at a depth (which is a wrong
 * number that looks right).
 *
 * Depth-first with an explicit path stack, so the refusal can NAME the cycle rather than reporting
 * that one exists somewhere.
 */
const recipeCycles = (recipes: readonly Recipe[]): readonly ReferenceRefusal[] => {
  const byId = index(recipes, (r) => r.recipe_id);
  const refusals: ReferenceRefusal[] = [];
  const state = new Map<string, "open" | "done">();

  const walk = (id: string, path: readonly string[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "open") {
      const from = path.indexOf(id);
      refusals.push({
        fr: "10-F31",
        code: "recipe_cycle",
        subject: id,
        detail: `recipe cycle: ${[...path.slice(from), id].join(" → ")}. A recipe that reaches itself explodes forever; the save is refused rather than the fold defending itself.`,
      });
      return;
    }
    const recipe = byId.get(id);
    if (recipe === undefined) return; // reported separately as a missing component
    state.set(id, "open");
    for (const line of recipe.lines) {
      if (line.component.kind === "recipe") walk(line.component.id, [...path, id]);
    }
    state.set(id, "done");
  };

  for (const recipe of recipes) walk(recipe.recipe_id, []);
  // One recipe can sit on several cycles; a writer only needs to be told about each recipe once.
  const seen = new Set<string>();
  return refusals.filter((r) => (seen.has(r.subject) ? false : (seen.add(r.subject), true)));
};

/**
 * Everything a writer must refuse before it publishes reference data — `10-F31`'s two invariants
 * plus the structural rules the arithmetic downstream depends on.
 *
 * **`is_counted ⇒ is_costed` is the one that makes slice 1 work.** `10-F18`'s gap has to be valued
 * in PKR, so a counted item without a cost basis would produce a variance row with a quantity and
 * no money — which R3 then has to render as a floor, on every row, for ever. Enforcing it here
 * makes the report's money column **complete by construction**, which is why the food-cost ruling
 * costs slice 1 nothing (`10-F31`'s own note).
 *
 * ⚠ **`reference_cost !== null` is NOT what makes an item costable** and this function does not
 * claim it is. `10-F31`'s basis resolves per (item, location, PERIOD): an item with receipts this
 * period is `receipted` and needs no reference price at all. So the invariant checked here is the
 * writer's half — a counted item is *in the costing scope* — and `costBasisOf` in `period.ts` is
 * where a period's actual basis is resolved. Conflating the two would refuse a perfectly costable
 * item at save time because nobody typed a price it does not need.
 */
export const referenceRefusals = (refs: ReferenceData): readonly ReferenceRefusal[] => {
  const refusals: ReferenceRefusal[] = [];
  const items = index(refs.items, (i) => i.item_id);
  const recipes = index(refs.recipes, (r) => r.recipe_id);

  const seenItems = new Set<string>();
  for (const item of refs.items) {
    if (seenItems.has(item.item_id)) {
      refusals.push({
        fr: "10-F1",
        code: "duplicate_item",
        subject: item.item_id,
        detail: "two items share one id; every balance keyed by it would be two things at once",
      });
    }
    seenItems.add(item.item_id);

    if (item.is_counted && !item.is_costed) {
      refusals.push({
        fr: "10-F31",
        code: "counted_not_costed",
        subject: item.item_id,
        detail:
          "is_counted ⇒ is_costed. A counted item's variance gap has to be valued in PKR " +
          "(10-F18); without a cost scope the money column would be a floor on every row for ever.",
      });
    }

    if (item.count_units.partial.kind === "weight") {
      const partialUnit = item.count_units.partial.unit;
      if (partialUnit !== item.base_unit) {
        refusals.push({
          fr: "10-F29",
          code: "weight_tier_dimension",
          subject: item.item_id,
          detail:
            `the weight tier is ${partialUnit} and the base unit is ${item.base_unit}. ` +
            "Weighing a bottle held in ml needs a density, and assuming 1 L = 1 kg is the fudge " +
            "this module refuses: the item is either held in mass, or counted by tenths.",
        });
      }
    }

    if (item.reference_cost !== null && item.reference_cost.qty_base <= 0) {
      refusals.push({
        fr: "10-F31",
        code: "reference_cost_zero_qty",
        subject: item.item_id,
        detail:
          "a reference cost is a PAIR and its quantity must be positive — 'Rs 60 per kg' is " +
          "(6000, 1_000_000). A pair over zero has no rate and would divide by zero at valuation.",
      });
    }
  }

  refusals.push(...recipeCycles(refs.recipes));

  for (const recipe of refs.recipes) {
    if (recipe.produces_item_id !== null && (recipe.yield_qty_base ?? 0) <= 0) {
      refusals.push({
        fr: "10-F9",
        code: "prep_recipe_yield_missing",
        subject: recipe.recipe_id,
        detail:
          "a prep recipe states what one run PRODUCES ('made 15 kg boti from 18 kg raw'). " +
          "Without a positive yield the chain has no divisor and every dish that reaches it is " +
          "uncostable.",
      });
    }
    for (const line of recipe.lines) {
      const missing =
        line.component.kind === "item"
          ? !items.has(line.component.id)
          : !recipes.has(line.component.id);
      if (missing) {
        refusals.push({
          fr: "10-F3",
          code: "recipe_component_missing",
          subject: recipe.recipe_id,
          detail: `line ${line.line_no} names ${line.component.kind} "${line.component.id}", which does not exist`,
        });
      }
    }
  }

  // `10-F31`'s second invariant: every LEAF item of every published recipe is costed. The leaf set
  // is what a plate cost sums, so an uncosted leaf makes every dish above it refuse (R2), and the
  // writer is where that is one keystroke from fixed.
  const leafOffenders = new Set<string>();
  const collectLeaves = (id: string, seen: ReadonlySet<string>): void => {
    if (seen.has(id)) return; // a cycle, already refused above
    const recipe = recipes.get(id);
    if (recipe === undefined) return;
    const next = new Set([...seen, id]);
    for (const line of recipe.lines) {
      if (line.component.kind === "recipe") {
        collectLeaves(line.component.id, next);
        continue;
      }
      const item = items.get(line.component.id);
      if (item !== undefined && !item.is_costed) leafOffenders.add(item.item_id);
    }
  };
  for (const mapping of refs.menu_recipes) {
    if (!recipes.has(mapping.recipe_id)) {
      refusals.push({
        fr: "10-F8",
        code: "menu_recipe_missing",
        subject: `${mapping.sellable_kind}:${mapping.sellable_id}`,
        detail: `maps to recipe "${mapping.recipe_id}", which does not exist`,
      });
      continue;
    }
    collectLeaves(mapping.recipe_id, new Set());
  }
  for (const item_id of [...leafOffenders].sort()) {
    refusals.push({
      fr: "10-F31",
      code: "recipe_leaf_not_costed",
      subject: item_id,
      detail:
        "a leaf of a published recipe is not is_costed. That is the reachable form of 'every " +
        "item is accounted for' — every dish above it refuses its plate cost (R2) until it is.",
    });
  }

  return refusals;
};
