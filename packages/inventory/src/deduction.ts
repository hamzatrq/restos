/**
 * `10-F3` — theoretical consumption, as an ORDER-FREE set difference, and `10 §4` Flow A step 2's
 * recipe explosion.
 *
 * ## Why the FR had to be amended before this could be written
 *
 * `10-F3` said a line belongs to deduction *"iff it is part of a confirmed order (`order.confirmed`,
 * or `line_added` after confirm) and was not removed pre-confirm"*. **Both clauses are ordering
 * predicates and neither is computable on either plane.** `01-F34` gives a fold no ordering
 * metadata at all, and that FR's superseded clause withdrew `global_seq` as a cloud-side business
 * arbiter — `server_received_at` survives only for `01-F18`'s closed LWW list. So *"after confirm"*
 * has no legal source anywhere, and `03-F55` confirms post-confirm additions are contemplated, so
 * it is not a hypothetical clause.
 *
 * The amended `10-F3` is what this file implements:
 *
 * > deduction set = { lines named by `order.line_added` } **minus** { lines named by
 * > `order.line_removed` }, for every order for which `order.confirmed` exists.
 *
 * Set difference over two grow-only sets: convergent, relabel-invariant, clock-free — `26 §7`'s
 * first merge rule, needing no exemption. It is built to law 1 **as if it were a device fold even
 * though it runs in the cloud**, which is what keeps the option of moving it device-side later.
 *
 * **What it loses, and why that is a permission finding rather than a deduction defect.** A line
 * removed *after* confirm exempts itself, where the struck clause says it should not. The
 * mitigation already ships and is not in this fold: `01 §4`'s dagger makes post-KOT removal a
 * `void.recorded`, and the matrix separates `order.line_removed` (cashier **allow**) from
 * `void.recorded` (cashier **deny**, escalate). A cashier taking the cheap path is a gate finding,
 * and the fix belongs at the void gate.
 *
 * **`10-F7` then falls out for free and needs no enforcement at all.** Post-KOT voids and comps
 * name no line — measured: `void.recorded` and `comp.recorded` carry
 * `{order_id, amount_paisa, reason, approver_user_id, adjustment_attempt_id}` and **no `line_id`** —
 * so they remove nothing from the set and the food stays consumed, which is what the FR requires.
 * It is a *consequence* of the formulation rather than a rule someone must remember.
 */

import { groupByKey, resolve } from "./contested.js";
import type { InventoryEvent } from "./event.js";
import { add, fromInt, mul, type Rational, rational, roundHalfUp, ZERO } from "./rational.js";
import type { ReferenceData } from "./reference.js";

/** One line the set difference kept. `item_id` is a SELLABLE id, not an inventory item. */
export type DeductionLine = {
  readonly order_id: string;
  readonly line_id: string;
  readonly sellable_id: string;
  readonly qty: number;
  /**
   * ⚠ **THE WINDOW STAMP, AND THE FIELD THAT CLOSES THE REVIEW'S FIRST DEFECT.** The MINIMUM
   * `branch_created_at` across this line's `order.line_added` observations — a min-register, so
   * commutative, associative and idempotent, exactly as `physicalFacts` windows a purchase.
   *
   * It is here because **membership of the deduction set and membership of a PERIOD are two
   * different questions**, and answering them with one pre-windowed event list answered neither.
   * `10-F3` says *"for every order for which an `order.confirmed` exists"* — unqualified over the
   * ledger — so the set difference reads the whole ledger; the period then windows the resulting
   * ACT by the branch time at which the line was first stated, which is when the food left the
   * shelf and therefore the count that could see it gone.
   *
   * `01-F34` is untouched: `branch_created_at` is law 2's business clock and an INPUT rather than
   * ordering metadata (`law-one.test.ts`'s header says so, and its §A control asserts that moving
   * it MUST change the answer). No envelope id, no device clock, no `lamport_seq`.
   */
  readonly stamp: number;
};

export type DeductionSet = {
  readonly lines: readonly DeductionLine[];
  /**
   * Lines whose `order.line_added` arrived under one `line_id` with more than one payload. They are
   * NOT dropped: their candidate sellables' leaves are propagated to `unresolved_items` below, so
   * a contest becomes a refused row rather than a quietly smaller consumption figure.
   */
  readonly contested_line_ids: readonly string[];
};

type LineAdded = {
  readonly order_id: string;
  readonly line_id: string;
  readonly item_id: string;
  readonly qty: number;
};

/** One OBSERVATION of a line: the payload that is resolved, and the stamp that is windowed. */
type LineRow = { readonly payload: LineAdded; readonly stamp: number };

/**
 * The min-register `physicalFacts` and `countObservations` both use, in one place.
 *
 * *"The branch time at which this act was first stated"* — a re-append is a redelivery of an act
 * that happened at the earlier time, not a second act. Min is commutative, associative and
 * idempotent, so it converges regardless of delivery order (`26 §7`).
 */
const minStamp = (rows: readonly LineRow[]): number => {
  let stamp = Number.POSITIVE_INFINITY;
  for (const row of rows) if (row.stamp < stamp) stamp = row.stamp;
  return stamp;
};

/**
 * The set difference. Reads `order.confirmed`, `order.line_added`, `order.line_removed` and
 * **nothing else** — in particular no envelope field of any kind, which is what makes the
 * relabel/clock-injection property in `__acceptance__/law-one.test.ts` hold by construction rather
 * than by luck.
 */
export const deductionSet = (events: readonly InventoryEvent[]): DeductionSet => {
  const confirmed = new Set<string>();
  const removed = new Set<string>();
  const added: LineRow[] = [];

  for (const event of events) {
    if (event.type === "order.confirmed") {
      confirmed.add((event.payload as { order_id: string }).order_id);
    } else if (event.type === "order.line_removed") {
      const p = event.payload as { order_id: string; line_id: string };
      removed.add(`${p.order_id}\u0000${p.line_id}`);
    } else if (event.type === "order.line_added") {
      const p = event.payload as LineAdded;
      // ⚠ The stamp rides BESIDE the payload and never inside it. `resolve` compares payloads for
      // equality, so folding the stamp in would make an identical redelivery at a later branch
      // millisecond a CONTEST — `01-F8`/`01-F31`'s redelivery, reported as a dispute. That is the
      // same separation `physicalFacts` keeps for `purchase_id`, for the same reason.
      added.push({
        payload: { order_id: p.order_id, line_id: p.line_id, item_id: p.item_id, qty: p.qty },
        stamp: event.envelope.branch_created_at,
      });
    }
  }

  const lines: DeductionLine[] = [];
  const contested: string[] = [];
  // Keyed on `line_id` ALONE so that the same line id arriving under two order ids is a contest
  // rather than two lines. The order id is inside the compared payload, so a divergence there
  // disputes the key exactly as a divergent quantity does.
  for (const [line_id, group] of groupByKey(added, (row) => row.payload.line_id)) {
    const resolution = resolve(group.map((row) => row.payload));
    if (resolution.kind === "contested") {
      contested.push(line_id);
      continue;
    }
    if (resolution.kind !== "resolved") continue;
    const line = resolution.value;
    if (!confirmed.has(line.order_id)) continue;
    if (removed.has(`${line.order_id}\u0000${line.line_id}`)) continue;
    lines.push({
      order_id: line.order_id,
      line_id: line.line_id,
      sellable_id: line.item_id,
      qty: line.qty,
      stamp: minStamp(group),
    });
  }

  // Sorted so the answer is a pure function of the SET. A caller rendering these in arrival order
  // would leak delivery order into a rendered string even though nothing above it did.
  lines.sort((a, b) => (a.line_id < b.line_id ? -1 : a.line_id > b.line_id ? 1 : 0));
  contested.sort();
  return { lines, contested_line_ids: contested };
};

/**
 * The contested candidates for a line id, so their leaves can be marked unresolved.
 *
 * They carry the same `stamp` a kept line does, because a contest must be refused in the period it
 * happened in and NOT in every other one: a dispute in March is not a reason to withhold April's
 * chicken row.
 */
type ContestedLine = { readonly stamp: number; readonly sellable_ids: readonly string[] };

const contestedCandidates = (
  events: readonly InventoryEvent[],
): ReadonlyMap<string, ContestedLine> => {
  const added: LineRow[] = [];
  for (const event of events) {
    if (event.type !== "order.line_added") continue;
    added.push({
      payload: event.payload as LineAdded,
      stamp: event.envelope.branch_created_at,
    });
  }
  const out = new Map<string, ContestedLine>();
  for (const [line_id, group] of groupByKey(added, (row) => row.payload.line_id)) {
    const resolution = resolve(group.map((row) => row.payload));
    if (resolution.kind !== "contested") continue;
    out.set(line_id, {
      stamp: minStamp(group),
      sellable_ids: [...new Set(resolution.values.map((v) => v.item_id))].sort(),
    });
  }
  return out;
};

/**
 * `10-F28`'s period window, as a predicate over a resolved act's `stamp`.
 *
 * ⚠ **THE DEFAULT IS THE WHOLE LEDGER, AND THAT DIRECTION IS DELIBERATE.** `10-F3` is unqualified
 * — *"for every order for which an `order.confirmed` exists"* — so total consumption is the honest
 * answer and narrowing is the REPORT's business. A caller that forgets the window therefore gets
 * more than it asked for and never less, which is the only safe way round: the defect this
 * parameter exists to close was a caller handing in a pre-windowed event list, where a `confirm`
 * one millisecond the wrong side of a count silently deleted a whole order's consumption.
 */
export type WindowStamp = (stamp: number) => boolean;
const ALL_TIME: WindowStamp = () => true;

/**
 * **One RESOLVED act of consumption, before any window has been applied.** The unit the report
 * windows: a kept deduction line exploded into its leaves, or a contested line's probe.
 *
 * ⚠ **IT EXISTS BECAUSE RESOLVING IS EXPENSIVE AND WINDOWING IS NOT, AND THE FIRST FIX FOR THE
 * WINDOWING DEFECT PAID THE EXPENSIVE HALF ONCE PER PERIOD.** `reportFor` called `consumption(all
 * events, refs, window)` inside its per-period loop, so `deductionSet` re-grouped every
 * `order.line_added` and `explodeRecipe` re-walked every confirmed line **for every period**,
 * discarding all but the in-window ones. Measured on one generated ledger of 49 561 events over the
 * 31 periods `inventory-router.ts`'s own `DEFAULT_WINDOW_DAYS = 30` and 50 000-row cap describe:
 * **2 807 ms**, against **86 ms** for the same ledger once the resolution was hoisted — and
 * `stockReport` is synchronous inside an `async` resolver, so that was ~2.8 s of blocked event loop
 * for one authenticated read on the process serving the back office.
 *
 * The behavioural fix is untouched: every act is still resolved over the FULL ledger (`10-F3`'s
 * unqualified *"for every order for which an `order.confirmed` exists"*) and windowed by its own
 * `stamp`. What moved is WHEN — once per report set instead of once per period.
 */
export type ConsumptionAct = {
  readonly stamp: number;
  /** The leaves this act contributes. EMPTY when its explosion failed — see `explode`. */
  readonly by_item: ReadonlyMap<string, Rational>;
  readonly coverage_gaps: readonly string[];
  readonly unresolved_items: readonly string[];
  readonly recipe_versions: ReadonlyMap<string, number>;
};

export type Consumption = {
  /** Theoretical consumption per inventory item, in base units. Rounded ONCE, at the end. */
  readonly by_item: ReadonlyMap<string, number>;
  /**
   * Items whose consumption could not be resolved. `10-F33` (a)'s treatment applies: their
   * variance row reads *no reading this period* rather than a gap computed from a partial figure.
   * ⚠ Dropping them to zero instead would UNDERSTATE consumption and inflate the apparent gap,
   * which on this report is an accusation.
   */
  readonly unresolved_items: readonly string[];
  /** `10-F8` — sold sellables with no menu recipe. Deduction skipped, listed, never theft. */
  readonly coverage_gaps: readonly string[];
  /** `10-F3`'s key half: the recipe version each explosion was COMPUTED WITH (`10 §4` Flow A). */
  readonly recipe_versions: ReadonlyMap<string, number>;
};

/**
 * One explosion could not be resolved: a cycle, a missing component, a prep recipe with no yield,
 * or — since the review — a prepared item whose producer is missing or **ambiguous**.
 *
 * ⚠ It was called `RecipeCycleReached` and only one of its five throw sites is a cycle. The name
 * mattered because `explodeInto`'s `catch` is the whole of `10-F31` R2's all-or-nothing rule, and
 * a reader checking that rule was being told the catch was about cycles.
 */
class ExplosionUnresolvable extends Error {}

/**
 * Explode one sellable's quantity into leaf inventory items, exactly.
 *
 * **Rationals all the way down, one rounding at the very end.** A karahi consuming 200 g of a
 * marinade whose prep recipe makes 15 kg from 18 kg of raw meat is `qty × 200_000 × 18/15` — and
 * rounding at each hop is what `10 §8`'s *"no cumulative drift vs exact rational computation"*
 * forbids. Here there is no intermediate rounding to drift.
 *
 * **A `prepared` component explodes through its PREP recipe** (`10 §4` Flow A step 3: "prepared
 * components resolve through prep recipes for costing only — prepared stock itself moves on
 * production, not sale"). That is what makes the founder's dynamite sauce work in slice 1: ten menu
 * recipes reference one prepared item at ten quantities and all ten deduct the right raw
 * ingredients, without anyone counting a tub of sauce.
 *
 * A cycle throws internally and is caught by the caller, which turns it into a coverage gap. It
 * cannot happen through a writer that ran `referenceRefusals`; the guard is here because a fold
 * that looped would hang a read model, and `01-F17` forbids the alternative of throwing outward.
 */
const explodeRecipe = (
  recipe_id: string,
  multiplier: Rational,
  refs: ReferenceData,
  prepByItem: ReadonlyMap<string, string | "ambiguous">,
  into: Map<string, Rational>,
  versions: Map<string, number>,
  seen: ReadonlySet<string>,
): void => {
  if (seen.has(recipe_id)) throw new ExplosionUnresolvable(recipe_id);
  const recipe = refs.recipes.find((r) => r.recipe_id === recipe_id);
  if (recipe === undefined) throw new ExplosionUnresolvable(recipe_id);
  versions.set(recipe.recipe_id, recipe.version);
  const next = new Set([...seen, recipe_id]);

  for (const line of recipe.lines) {
    const scaled = mul(multiplier, fromInt(line.qty));
    if (line.component.kind === "recipe") {
      const sub = refs.recipes.find((r) => r.recipe_id === line.component.id);
      const yieldQty = sub?.yield_qty_base ?? 0;
      if (yieldQty <= 0) throw new ExplosionUnresolvable(line.component.id);
      explodeRecipe(
        line.component.id,
        rational(scaled.n, scaled.d * BigInt(yieldQty)),
        refs,
        prepByItem,
        into,
        versions,
        next,
      );
      continue;
    }
    const item = refs.items.find((i) => i.item_id === line.component.id);
    if (item === undefined) throw new ExplosionUnresolvable(line.component.id);
    if (item.type === "prepared") {
      // ⚠ **TWO PREP RECIPES PRODUCING ONE ITEM USED TO BE DECIDED BY `refs.recipes` ARRAY ORDER.**
      // `find(r => r.produces_item_id === item.item_id)` returned whichever row happened to come
      // first, so one reference set answered *goat* and the same set re-ordered answered *beef* —
      // a projected money value depending on the order of an input array, which is the shape
      // `01-F34` exists to remove even though the array is reference data rather than a ledger.
      // The producer is resolved through an INDEX that marks a duplicate `"ambiguous"`, and an
      // ambiguity refuses: `10-F8`'s named coverage gap, never a guess between them — exactly what
      // `consumption` already did for two menu recipes sharing one sellable id.
      const producer = prepByItem.get(item.item_id);
      if (producer === undefined || producer === "ambiguous") {
        throw new ExplosionUnresolvable(item.item_id);
      }
      const prep = refs.recipes.find((r) => r.recipe_id === producer);
      const yieldQty = prep?.yield_qty_base ?? 0;
      if (prep === undefined || yieldQty <= 0) throw new ExplosionUnresolvable(item.item_id);
      explodeRecipe(
        prep.recipe_id,
        rational(scaled.n, scaled.d * BigInt(yieldQty)),
        refs,
        prepByItem,
        into,
        versions,
        next,
      );
      continue;
    }
    into.set(item.item_id, add(into.get(item.item_id) ?? ZERO, scaled));
  }
};

/**
 * `10-F3` + `10-F8`, end to end: the set difference, exploded.
 *
 * ⚠ **The menu recipe is keyed by SELLABLE ID ALONE here, and that CORRECTS the design.**
 * `plans/inventory/design.md` §4.6 keys `MenuRecipe` by `(sellable_kind, sellable_id)` — right for
 * the reference row — but `order.line_added` is `{order_id, line_id, item_id, qty,
 * unit_price_paisa}` and carries **no kind**, so a fold has no way to name the pair. Two mapping
 * rows sharing one sellable id are therefore an AMBIGUITY rather than two mappings: the sellable
 * becomes a coverage gap and is named, which is `10-F8`'s existing shape and never a guess between
 * them.
 */
/** One dish's explosion: its leaves and the versions they were computed with, or nothing at all. */
type Explosion =
  | {
      readonly ok: true;
      readonly leaves: ReadonlyMap<string, Rational>;
      readonly versions: ReadonlyMap<string, number>;
    }
  | { readonly ok: false };

export const resolveConsumption = (
  events: readonly InventoryEvent[],
  refs: ReferenceData,
): readonly ConsumptionAct[] => {
  const set = deductionSet(events);
  const bySellable = new Map<string, string | "ambiguous">();
  for (const mapping of refs.menu_recipes) {
    const seen = bySellable.get(mapping.sellable_id);
    if (seen === undefined) bySellable.set(mapping.sellable_id, mapping.recipe_id);
    else if (seen !== mapping.recipe_id) bySellable.set(mapping.sellable_id, "ambiguous");
  }
  // The producing prep recipe per prepared item, `"ambiguous"` when two claim one item. Built once
  // here rather than searched per line, because a `find` over an array is what made the answer
  // depend on the array's order.
  const prepByItem = new Map<string, string | "ambiguous">();
  for (const recipe of refs.recipes) {
    if (recipe.produces_item_id === null) continue;
    const seen = prepByItem.get(recipe.produces_item_id);
    if (seen === undefined) prepByItem.set(recipe.produces_item_id, recipe.recipe_id);
    else if (seen !== recipe.recipe_id) prepByItem.set(recipe.produces_item_id, "ambiguous");
  }

  // ⚠ **THE EXPLOSION LANDS IN ITS OWN MAP AND IS HANDED BACK ONLY ON SUCCESS, AND THAT IS THE FIX
  // FOR A DISH REPORTED AS NOT DEDUCTED AND PARTIALLY DEDUCTED AT ONCE.** `explodeRecipe` walks its
  // lines in order and throws on the first one it cannot resolve; it used to write straight into
  // the shared totals, so a karahi whose second line was unresolvable had already added its first
  // line's chicken — 2 kg of consumption for a dish this function goes on to report as a
  // `coverage_gap`. `10-F31` R2 is all-or-nothing PER DISH, and it has to hold in the arithmetic
  // and not only on the plate-cost surface: a phantom 2 kg is 2 kg of unexplained usage, and on
  // this report that is an accusation (`10-F19`). A failed explosion now returns `{ok: false}` and
  // its half-filled map is dropped with it, so there is nothing to merge and nothing to undo.
  const explode = (sellable_id: string, qty: Rational): Explosion => {
    const recipe_id = bySellable.get(sellable_id);
    if (recipe_id === undefined || recipe_id === "ambiguous") return { ok: false };
    const leaves = new Map<string, Rational>();
    const versions = new Map<string, number>();
    try {
      explodeRecipe(recipe_id, qty, refs, prepByItem, leaves, versions, new Set());
    } catch (error) {
      if (error instanceof ExplosionUnresolvable) return { ok: false };
      throw error;
    }
    return { ok: true, leaves, versions };
  };

  const acts: ConsumptionAct[] = [];
  for (const line of set.lines) {
    const exploded = explode(line.sellable_id, fromInt(line.qty));
    acts.push(
      exploded.ok
        ? {
            stamp: line.stamp,
            by_item: exploded.leaves,
            coverage_gaps: [],
            unresolved_items: [],
            // `10-F3`'s key is *"the recipe version this row was computed with"*, so a version is
            // banked only by an act that CONTRIBUTES a row — see the contested loop below.
            recipe_versions: exploded.versions,
          }
        : {
            stamp: line.stamp,
            by_item: EMPTY_LEAVES,
            coverage_gaps: [line.sellable_id],
            unresolved_items: [],
            recipe_versions: EMPTY_VERSIONS,
          },
    );
  }

  // A contested line's CANDIDATES are exploded purely to learn which items it could have touched.
  // Those items' rows are then refused rather than computed from a consumption figure that is
  // missing an unknown amount.
  //
  // ⚠ **AND THE PROBE BANKS NO RECIPE VERSION, WHICH IS THE REVIEW'S FOURTH FINDING.** The comment
  // that stood beside the merge said *"a version banked for a dish that deducted nothing is a claim
  // about a row that does not exist"* — and the probe, twelve lines below it, went through the same
  // `explodeInto` and merged its versions into the shared map. **The comment was FALSE on the path
  // under it from the moment it was written** (the `da263e2` fix round, August 2026): measured, a
  // single contested `order.line_added` returned `by_item []`, `unresolved_items ["chicken"]` and
  // `recipe_versions [["karahi", 7]]`. `10-F3`'s idempotency key half may not name a version for an
  // explosion nothing was deducted from, so the probe's versions are discarded with it.
  for (const contest of contestedCandidates(events).values()) {
    const gaps: string[] = [];
    const unresolved: string[] = [];
    for (const sellable_id of contest.sellable_ids) {
      const exploded = explode(sellable_id, fromInt(1));
      if (exploded.ok) for (const item_id of exploded.leaves.keys()) unresolved.push(item_id);
      else gaps.push(sellable_id);
    }
    acts.push({
      stamp: contest.stamp,
      by_item: EMPTY_LEAVES,
      coverage_gaps: gaps,
      unresolved_items: unresolved,
      recipe_versions: EMPTY_VERSIONS,
    });
  }
  return acts;
};

const EMPTY_LEAVES: ReadonlyMap<string, Rational> = new Map();
const EMPTY_VERSIONS: ReadonlyMap<string, number> = new Map();

/**
 * Window the resolved acts and total what is left. Cheap by construction: one predicate call per
 * act and a rational add per leaf it contributes, with **no re-resolution of anything**.
 *
 * The rounding is still ONE rounding at the very end (`10 §8`'s *"no cumulative drift vs exact
 * rational computation"*), because the acts carry rationals and only this fold turns them into
 * base units.
 */
export const foldConsumption = (
  acts: readonly ConsumptionAct[],
  window: WindowStamp = ALL_TIME,
): Consumption => {
  const totals = new Map<string, Rational>();
  const versions = new Map<string, number>();
  const gaps = new Set<string>();
  const unresolved = new Set<string>();

  for (const act of acts) {
    if (!window(act.stamp)) continue;
    for (const [item_id, value] of act.by_item) {
      totals.set(item_id, add(totals.get(item_id) ?? ZERO, value));
    }
    for (const sellable_id of act.coverage_gaps) gaps.add(sellable_id);
    for (const item_id of act.unresolved_items) unresolved.add(item_id);
    for (const [recipe, version] of act.recipe_versions) versions.set(recipe, version);
  }

  const rounded = new Map<string, number>();
  for (const [item_id, total] of totals) rounded.set(item_id, roundHalfUp(total));

  return {
    by_item: rounded,
    unresolved_items: [...unresolved].sort(),
    coverage_gaps: [...gaps].sort(),
    recipe_versions: versions,
  };
};

// ⚠ **`consumption(events, refs, window)` USED TO STAND HERE AS A ONE-CALL WRAPPER, AND
// `pnpm seams:check` REFUSED IT THE MOMENT THE HOIST LANDED.** Once `varianceReports` resolved once
// per chain and folded per period, nothing shipping composed the two halves in one call any more —
// Rule A reported it as *"reached only by tests — the defect, exactly"*, and it was right: an export
// only a suite reaches is `L8`'s shape however convenient it reads. The convenience survives where
// it is true, as `__acceptance__/fixtures.ts`'s `consumption` helper, and the product's own two
// phases are the API.
