/**
 * `10-F18` / `10-F19` / `10-F33` — the variance report, which is what slice 1 exists to produce.
 *
 * **The sentence a pilot owner should be able to read off it:** *"You are Rs 14,200 of chicken short
 * this week, the gap is concentrated on Friday and Saturday, and it is more than every void and
 * every logged wastage put together."* In money, complete, with no estimate anywhere in it — and
 * **without a food-cost percentage**, which slice 1 deliberately does not ship.
 *
 * ## The three things this file refuses to do, each with the FR that refuses it
 *
 *   1. **It never renders a zero for something nobody measured** (`10-F29`). An item is counted iff
 *      every one of its area lines is counted; anything else is `not_counted`, contributes nothing
 *      in either unit, and makes the money total a **floor** that says so.
 *   2. **It never shows a gap inside its own measurement error** (`10-F33` (a)). Inside the floor
 *      the row reads *no reading this period* — never `0`, never a small gap.
 *   3. **It never fires a hint on one period** (`10-F33` (c)). Sign is the discriminator, three
 *      consecutive same-signed above-floor periods is the gate, and `sustainedHints` is where that
 *      lives — a single report cannot answer it and does not pretend to.
 *
 * ## Two decisions the design does not make, made here and stated
 *
 * **(i) The total is NOT a signed net.** Netting one item's surplus against another's shortfall
 * hides both, and the headline the design writes is a shortfall (*"Rs 14,200 short"*). So the report
 * carries `unexplained_usage_paisa` (the magnitudes of negative gaps) and `surplus_paisa`
 * (positive), separately, each flagged as a floor when any row was withheld.
 *
 * **(ii) The FIRST period produces no variance rows at all.** `10-F28`: *"a location's first period
 * has no opening and its report says so rather than assuming zero."* Treating the opening as zero
 * would report the entire shelf as unexplained surplus on day one. Two closed counts are what make
 * the second report meaningful, and that is the industry's own rule as well as this FR's.
 */

import type { CountBasis } from "@restos/domain";
import { type Paisa, paisa, sumPaisa } from "@restos/domain";
import { type CountedItem, type NotCountedReason, rollUpCount } from "./count.js";
import { consumption } from "./deduction.js";
import type { InventoryEvent } from "./event.js";
import {
  type HintKind,
  hintText,
  isAboveFloor,
  isSustainedRun,
  noiseFloor,
  SUSTAINED_RUN_PERIODS,
} from "./noise.js";
import {
  type CostBasis,
  costBasisOf,
  inWindow,
  type OpeningPair,
  type Period,
  periodsFor,
  physicalFacts,
  type ResolvedCost,
  valueOrNull,
} from "./period.js";
import type { ReferenceData } from "./reference.js";

/**
 * Why a row carries no gap. Every one of these is a DIFFERENT fact and none of them is a zero.
 *
 * ⚠ **`opening_unknown` WAS A FIFTH MEMBER AND IT COULD NOT OCCUR.** Its branch tested
 * `carry.get(item_id) === undefined`, and the baseline period sets a carry for **every** item in
 * `countedItems` before it `continue`s, so the condition was `undefined` never — a mutant replacing
 * it with `false` killed **0 of 113**. Worse, its comment described *"a carry with no VALUE"*,
 * which is a real case that is handled elsewhere (`openingUsable` in `costBasisOf`) under a
 * different label, `no_cost_basis`. A documented report variant a reader can look for and a
 * surface can render, which the arithmetic cannot produce, is `L8`'s shape wearing a union member;
 * it is deleted rather than re-aimed, because the case it claimed already has an owner.
 */
export type WithheldReason =
  | { readonly kind: "not_counted"; readonly reason: NotCountedReason }
  | { readonly kind: "below_noise_floor" }
  | { readonly kind: "consumption_unresolved" }
  | { readonly kind: "no_cost_basis" };

export type VarianceRow = {
  readonly item_id: string;
  readonly item_name: string;
  readonly expected_qty_base: number | null;
  readonly counted_qty_base: number | null;
  readonly gap_qty_base: number | null;
  readonly gap_value_paisa: number | null;
  /** `10-F29`'s line basis, rolled up to the WORST across the item's areas. */
  readonly count_basis: CountBasis | null;
  readonly cost_basis: CostBasis;
  /** `10-F33` (a) — in base units, rounded for display only. The comparison is exact. */
  readonly noise_floor_qty_base: number | null;
  /** `null` when the row is reported; otherwise why it is not. */
  readonly withheld: WithheldReason | null;
};

export type VarianceReport = {
  readonly location_id: string;
  readonly period_index: number;
  readonly opened_after: number | null;
  readonly closed_at: number;
  readonly count_ids: readonly string[];
  /** `10-F28` — the first period is a BASELINE and carries no rows at all. */
  readonly is_baseline: boolean;
  /** Ranked by `10-F33` (b): PKR magnitude descending, never percent. Withheld rows sort last. */
  readonly rows: readonly VarianceRow[];
  /**
   * `10-F33` (b)/(h). Two figures, never netted (see the header).
   *
   * ⚠ **`is_floor` COUNTS TWO KINDS OF WITHHELD ROW AND DELIBERATELY EXCLUDES A THIRD — because
   * `plans/inventory/design.md` USES ONE WORD FOR TWO DIFFERENT FLOORS AND THEY ARE NOT THE SAME
   * CLAIM.** §4.8 makes the total a *floor* when an item was **not counted**; §4.14 (a) suppresses a
   * gap that is inside its own **measurement error**. The first understates the money by an
   * UNKNOWN amount; the second understates it by an amount bounded by the item's own floor, which
   * is a computed number the report already holds.
   *
   * Conflating them was measured on the first run of `variance-report.test.ts` and it is not
   * cosmetic: with an `estimated` item present, a **perfectly complete count with a zero gap** came
   * back flagged as a floor, because its zero gap is (correctly) inside its floor. A flag that is
   * true on every well-executed count is `L9`'s permanently-red rail — everyone learns to ignore
   * it. So `is_floor` is *"there are rows whose money this report could not read"*, and
   * `within_noise_row_count` is reported beside it as its own, differently-shaped fact.
   */
  readonly unexplained_usage_paisa: number;
  readonly surplus_paisa: number;
  readonly is_floor: boolean;
  readonly withheld_row_count: number;
  /** Rows read, and inside their own measurement error. NOT a floor — see `is_floor`. */
  readonly within_noise_row_count: number;
  /** `10-F8` — sold sellables with no costable recipe. Never misread as unexplained usage. */
  readonly coverage_gaps: readonly string[];
  /** `10-F19` — voids enter as a separate, LABELLED count and are never summed into the gap. */
  readonly void_count: number;
  /** `10-F14`'s khata for the window, including lines the valuation excluded. */
  readonly invoice_total_paisa: number;
};

export type VarianceInput = {
  readonly location_id: string;
  /**
   * The location's events. `stock.*` are filtered by `payload.location_id`; order events are taken
   * as given, because `order.*` names a branch and not a `01-F25` location, and `10-F3` deducts
   * "at the selling location". The CALLER scopes them — in slice 1 a branch is its own location.
   */
  readonly events: readonly InventoryEvent[];
  readonly refs: ReferenceData;
};

/**
 * The carried closing state of one item, period to period. `value` is null when unvaluable.
 *
 * ⚠ **`basis` IS HERE BECAUSE A PROVENANCE THAT DOES NOT TRAVEL BECOMES A LIE ONE PERIOD LATER.**
 * The carry used to be `(qty, value)` alone, so a quantity valued at the owner's typed
 * `reference` price arrived in the next period as an opening with a value and no history —
 * `costBasisOf` saw `opening_qty > 0` with money attached and answered `receipted`. Measured: every
 * row read `"cost_basis":"receipted"` in fixtures containing **zero** `stock.purchase_recorded`
 * events. `10-F31`'s triple is rendered to an owner as provenance (*"all from invoices"* against
 * *"3 lines on reference prices"*), and `00 §7 (e)` requires the resolved source to travel with
 * the value; it did not survive one period.
 */
type Carry = {
  readonly qty_base: number;
  readonly value_paisa: number | null;
  readonly basis: CostBasis;
};

const carryPair = (carry: Carry | undefined): OpeningPair | null =>
  carry === undefined || carry.value_paisa === null
    ? null
    : { value_paisa: carry.value_paisa, qty_base: carry.qty_base, basis: carry.basis };

/**
 * Every period of one location, oldest first. Periods are computed as a CHAIN because each one's
 * opening is the previous one's close — `10-F28`, and the reason a single-period API would be a
 * lie: you cannot answer "what was the opening" without walking from the baseline.
 */
export const varianceReports = (input: VarianceInput): readonly VarianceReport[] => {
  const periods = periodsFor(input.events, input.location_id);
  const counted = input.refs.items.filter((item) => item.is_counted);
  const carry = new Map<string, Carry>();
  const out: VarianceReport[] = [];

  for (const period of periods) {
    out.push(reportFor(input, period, counted, carry));
  }
  return out;
};

const reportFor = (
  input: VarianceInput,
  period: Period,
  countedItems: ReferenceData["items"],
  carry: Map<string, Carry>,
): VarianceReport => {
  // ⚠ **NOTHING IS WINDOWED EVENT BY EVENT HERE, AND THE PRE-WINDOWED LIST THAT USED TO STAND ON
  // THIS LINE IS THE REVIEW'S FIRST DEFECT.** `10-F3` deducts *"for every order for which an
  // `order.confirmed` exists"* — unqualified over the ledger. Handing `consumption` a slice made
  // *exists* mean *exists in this window*, so an order whose lines were rung before a count and
  // confirmed after it was deducted in **neither** period: measured at `gap −5 kg`,
  // `gap_value_paisa: −340000`, Rs 3,400 of "unexplained usage" manufactured from a correctly sold
  // order and ranked to the top of the page by `10-F33` (b). A count is taken at closing time,
  // which is exactly when orders are open, so it is the normal case rather than an edge — and this
  // module's whole social licence is `10-F19`'s *hints, never accusation*.
  //
  // Every fact is now resolved over the FULL event list and windowed by its ACT's own stamp, which
  // is what `physicalFacts` has always done for a purchase and a wastage.
  const window = (stamp: number): boolean => inWindow(period, stamp);
  const facts = physicalFacts(input.events, input.location_id, period);
  const used = consumption(input.events, input.refs, window);
  const rollup = rollUpCount(
    period.observation,
    countedItems.map((item) => item.item_id),
    input.refs.areas,
    input.location_id,
  );
  const byItem = new Map<string, CountedItem>(rollup.map((row) => [row.item_id, row]));
  const unresolved = new Set([...used.unresolved_items, ...facts.unresolved_items]);
  // A void is one event and one act, so its own stamp IS its act's stamp — but it is windowed
  // through the same predicate as everything else, so no reader has to check which rule applies.
  const voidCount = input.events.filter(
    (event) => event.type === "void.recorded" && window(event.envelope.branch_created_at),
  ).length;

  const rows: VarianceRow[] = [];
  const usageValues: Paisa[] = [];
  const surplusValues: Paisa[] = [];
  let withheldRows = 0;
  let withinNoiseRows = 0;

  for (const item of countedItems) {
    const opening = carryPair(carry.get(item.item_id));
    const openingQty = carry.get(item.item_id)?.qty_base ?? 0;
    const purchased = facts.purchases.get(item.item_id);
    const cost = costBasisOf(item, opening, purchased);
    const observed = byItem.get(item.item_id);

    const expected =
      openingQty +
      (purchased?.qty_base ?? 0) -
      (used.by_item.get(item.item_id) ?? 0) -
      (facts.wastage.get(item.item_id) ?? 0);

    // The baseline period establishes the opening and reconciles nothing (`10-F28`).
    if (period.is_baseline) {
      carry.set(
        item.item_id,
        observed?.counted === true
          ? {
              qty_base: observed.qty_base,
              value_paisa: valueOrNull(observed.qty_base, cost),
              basis: cost.basis,
            }
          : { qty_base: expected, value_paisa: null, basis: cost.basis },
      );
      continue;
    }

    const row = buildRow(item, observed, expected, cost, unresolved.has(item.item_id));
    rows.push(row);
    if (row.withheld !== null) {
      if (row.withheld.kind === "below_noise_floor") withinNoiseRows += 1;
      else withheldRows += 1;
    }
    if (row.gap_value_paisa !== null) {
      // `directedPaisa`'s own doc names this case — "a stock variance wants different words" — but
      // the split here is two ACCUMULATORS rather than a rendering, so the magnitudes are branded
      // straight into `sumPaisa` and nothing nets one against the other.
      if (row.gap_value_paisa < 0) usageValues.push(paisa(-row.gap_value_paisa));
      else if (row.gap_value_paisa > 0) surplusValues.push(paisa(row.gap_value_paisa));
    }

    // `10-F5` / `10-F19`: a counted item RESETS the theoretical baseline; an uncounted one carries
    // its theoretical quantity forward to be "reconciled at next count", which is that FR's own
    // words. Carrying zero instead would manufacture a second, larger gap next period.
    carry.set(
      item.item_id,
      observed?.counted === true
        ? {
            qty_base: observed.qty_base,
            value_paisa: valueOrNull(observed.qty_base, cost),
            basis: cost.basis,
          }
        : { qty_base: expected, value_paisa: valueOrNull(expected, cost), basis: cost.basis },
    );
  }

  rows.sort(rankByMoney);

  return {
    location_id: input.location_id,
    period_index: period.index,
    opened_after: period.opened_after,
    closed_at: period.closed_at,
    count_ids: period.observation.count_ids,
    is_baseline: period.is_baseline,
    rows,
    unexplained_usage_paisa: sumPaisa(usageValues),
    surplus_paisa: sumPaisa(surplusValues),
    is_floor: withheldRows > 0,
    withheld_row_count: withheldRows,
    within_noise_row_count: withinNoiseRows,
    coverage_gaps: used.coverage_gaps,
    void_count: voidCount,
    invoice_total_paisa: facts.invoice_total_paisa,
  };
};

const withheldRow = (
  item: ReferenceData["items"][number],
  cost: ResolvedCost,
  withheld: WithheldReason,
  expected: number | null,
  countedQty: number | null,
  countBasis: CountBasis | null,
  floor: number | null,
): VarianceRow => ({
  item_id: item.item_id,
  item_name: item.name,
  expected_qty_base: expected,
  counted_qty_base: countedQty,
  gap_qty_base: null,
  gap_value_paisa: null,
  count_basis: countBasis,
  cost_basis: cost.basis,
  noise_floor_qty_base: floor,
  withheld,
});

const buildRow = (
  item: ReferenceData["items"][number],
  observed: CountedItem | undefined,
  expected: number,
  cost: ResolvedCost,
  consumptionUnresolved: boolean,
): VarianceRow => {
  // Order of refusals is deliberate and is the `10-F33` (g) ladder's first rung: what a reader is
  // told is the FIRST thing that made the row unreadable, and "nobody counted it" outranks
  // "we could not value it".
  if (observed === undefined || observed.counted === false) {
    return withheldRow(
      item,
      cost,
      { kind: "not_counted", reason: observed?.counted === false ? observed.reason : "no_line" },
      null,
      null,
      null,
      null,
    );
  }
  if (consumptionUnresolved) {
    return withheldRow(
      item,
      cost,
      { kind: "consumption_unresolved" },
      null,
      observed.qty_base,
      observed.basis,
      null,
    );
  }
  const gap = observed.qty_base - expected;
  const floor = noiseFloor(observed.basis, item.count_units.primary_size_base);
  const floorQty = Math.ceil(Number(floor.n) / Number(floor.d));
  if (!isAboveFloor(gap, floor)) {
    return withheldRow(
      item,
      cost,
      { kind: "below_noise_floor" },
      expected,
      observed.qty_base,
      observed.basis,
      floorQty,
    );
  }
  const value = valueOrNull(gap, cost);
  return {
    item_id: item.item_id,
    item_name: item.name,
    expected_qty_base: expected,
    counted_qty_base: observed.qty_base,
    // ⚠ **THE QUANTITY GAP SURVIVES A MISSING COST BASIS, AND THE FIRST DRAFT OF THIS FUNCTION GOT
    // IT WRONG.** `10-F31`'s own surface table is explicit: *"Variance report in **quantity** — **No
    // gate** — it needs no price at all"*, against *"Variance report **total** in PKR — Floor,
    // flagged"*. Nulling the quantity too would have hidden a real, measured 50 kg discrepancy
    // because nobody had typed a price — R76 applied to the wrong column, and the exact
    // over-refusal `10-F33`'s own note warns of. Found by `variance-report.test.ts` §D, not by
    // reading. Only the MONEY is withheld here.
    gap_qty_base: gap,
    gap_value_paisa: value,
    count_basis: observed.basis,
    cost_basis: cost.basis,
    noise_floor_qty_base: floorQty,
    withheld: value === null ? { kind: "no_cost_basis" } : null,
  };
};

/**
 * `10-F33` (b) — **rank and alert in PKR, never in percent.**
 *
 * *"A 15% variance on parsley is noise. A 4% variance on salmon could amount to thousands per
 * month."* Money is the sort key and the only alert unit; percent survives as a diagnostic AFTER
 * selection and is never computed here at all.
 *
 * Withheld rows sort last, and the tiebreak is `item_id` — reference data, NOT an envelope id, so
 * `01-F34`'s ban is untouched. Something has to break a tie or the order of two equal rows would be
 * whatever the reference array happened to hold.
 */
const rankByMoney = (a: VarianceRow, b: VarianceRow): number => {
  const av = a.gap_value_paisa;
  const bv = b.gap_value_paisa;
  if (av === null && bv === null) return a.item_id < b.item_id ? -1 : 1;
  if (av === null) return 1;
  if (bv === null) return -1;
  const diff = Math.abs(bv) - Math.abs(av);
  return diff !== 0 ? diff : a.item_id < b.item_id ? -1 : 1;
};

// ── 10-F33 (c) — the gate on every hint ────────────────────────────────────────────────────────

export type SustainedHint = {
  readonly item_id: string;
  readonly kind: HintKind;
  readonly text: string;
  /** `-1` is unexplained usage; `+1` is surplus. The sign IS the discriminator. */
  readonly sign: -1 | 1;
  readonly periods: number;
};

/**
 * `10-F33` (c) — **no hint fires on one period.** Three consecutive same-signed above-floor
 * readings, and nothing less.
 *
 * ⚠ **This is the gate on EVERY hint, not one hint among several.** `10-F19` listed a
 * steady-small-gap signature as one attribution hint; `10-F33` promotes it to the precondition for
 * all of them, because every product surveyed alerts on a single period while its own guidance says
 * the trend is what matters — and that gap between advice and alerting is the mechanism that
 * accuses honest staff.
 *
 * A withheld period **breaks the run** rather than being skipped: three above-floor readings a
 * month apart with silent periods between them are not consecutive, and the claim the FR licenses
 * is about consecutive periods.
 *
 * `10-F33` (g) (iv) is the one rung this function can decide on its own — *"zero wastage logged on
 * an item with a sustained gap: presume unlogged waste"* — because published waste is 4–10% of
 * purchases and the remedy is the waste button, not the staff. The other four rungs need inputs
 * (a receiving discrepancy, a mid-period recipe change, a volume correlation) that slice 1 does not
 * have, and inventing them would be inventing evidence.
 */
export const sustainedHints = (
  reports: readonly VarianceReport[],
  wastageLoggedByItem: ReadonlySet<string>,
): readonly SustainedHint[] => {
  // ⚠ **A RUNTIME VOCABULARY FILTER STOOD HERE AND WAS REMOVED, AND THE REMOVAL IS THE FINDING.**
  // `pnpm seams:check` Rule A reported `vocabularyViolations` as reached only by tests, and the
  // obvious fix was to filter every hint through it on the way out. That filter was written, and
  // then MUTATION measured it: deleting it again killed **0 of 110** tests, because every hint this
  // module can produce already passes — so nothing could ever exercise the branch.
  //
  // A guard no test can fail is exactly the shape `L8` names ("a constant exported so a test COULD
  // assert it, and none did") with the sign flipped, and satisfying a reachability rail with one is
  // how a rail teaches a session to write decorative code. The binding assertion is the SWEEP in
  // `noise-floor.test.ts` §C, which walks every member of the closed `HINT_KINDS` set — that one
  // bites, and it catches a sixth rung the day it is written. `vocabularyViolations` keeps an
  // `@unreached-owed` marker naming its real consumer: the surface that RENDERS a hint.
  const history = new Map<string, (-1 | 0 | 1 | null)[]>();
  const basis = new Map<string, CountBasis | null>();
  for (const report of reports) {
    if (report.is_baseline) continue;
    for (const row of report.rows) {
      const signs = history.get(row.item_id) ?? [];
      signs.push(
        row.withheld !== null || row.gap_qty_base === null
          ? null
          : row.gap_qty_base < 0
            ? -1
            : row.gap_qty_base > 0
              ? 1
              : 0,
      );
      history.set(row.item_id, signs);
      basis.set(row.item_id, row.count_basis);
    }
  }

  const hints: SustainedHint[] = [];
  for (const [item_id, signs] of [...history].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!isSustainedRun(signs)) continue;
    const last = signs[signs.length - 1];
    if (last !== -1 && last !== 1) continue;
    if (last === -1 && !wastageLoggedByItem.has(item_id)) {
      hints.push({
        item_id,
        kind: "no_wastage_logged",
        text: hintText.no_wastage_logged,
        sign: last,
        periods: SUSTAINED_RUN_PERIODS,
      });
    }
    if (basis.get(item_id) === "estimated") {
      hints.push({
        item_id,
        kind: "not_counted_or_estimated",
        text: hintText.not_counted_or_estimated,
        sign: last,
        periods: SUSTAINED_RUN_PERIODS,
      });
    }
  }
  return hints;
};
