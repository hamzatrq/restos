/**
 * `10-F28` — the count period, and the period-weighted cost held as a PAIR.
 *
 * ## Why the period exists at all
 *
 * Doc 10 had no period, and adding one resolves three separate defects at once:
 *
 *   1. `10-F4`'s recompute had **nothing to bound it**. A recipe correction re-derives consumption
 *      across a window that may contain a count adjustment computed against the *old* derivation —
 *      and `10-F19` writes that adjustment as a kernel event, which `01-F1` forbids fixing. Closing
 *      the period freezes it and a correction applies forward.
 *   2. `10-F6`'s *"moving-average cost … updated on each purchase receipt"* is **order-dependent**.
 *      A running average interleaved with issues values those issues differently depending on the
 *      order receipts and issues arrive, so **delivery order decided a money outcome** — the exact
 *      failure `26 §2` exists to remove and `DEC-PERF-001` ratified against.
 *   3. `10-F18`'s *"the period since last count"* named an entity that existed nowhere.
 *
 * ## The pair, and why there is no stored unit cost anywhere in this package
 *
 * `(opening_value + purchases_value) / (opening_qty + purchases_qty)` is order-free **within** the
 * period by construction. It is held as `(value_paisa, qty_base)` and never as a rate, because a
 * cost per base unit is not an integer — Rs 6,800 for 10 kg is 0.068 paisa per milligram. Any
 * quantity is valued by ONE exact multiply-then-round through `valueAt`. `10 §8`'s *"no cumulative
 * drift vs exact rational computation"* is then satisfied **by construction**: there is no running
 * accumulation left to drift, which is a stronger guarantee than the property test that clause
 * originally asked for.
 */

import { type Paisa, paisa, sumPaisa } from "@restos/domain";
import { groupByKey, resolve } from "./contested.js";
import { type CountObservation, countObservations } from "./count.js";
import type { InventoryEvent } from "./event.js";
import { valueAt } from "./rational.js";
import type { InventoryItem, ValueQtyPair } from "./reference.js";

export type Period = {
  /** 0-based within this location's history. Period 0 is the BASELINE — see `isBaseline`. */
  readonly index: number;
  /** The previous boundary; `null` for the first period, which has no opening. */
  readonly opened_after: number | null;
  readonly closed_at: number;
  readonly observation: CountObservation;
  /**
   * `10-F28`: *"a location's first period has no opening and its report says so rather than
   * assuming zero"*. The first count is a BASELINE, not a reconciliation — it establishes the
   * opening that period 1 is measured against, and an implementation that treated its opening as
   * zero would report the entire shelf as unexplained surplus on day one. This is also the
   * industry's own rule: two closed counts are required before a usage report means anything.
   */
  readonly is_baseline: boolean;
};

export const periodsFor = (
  events: readonly InventoryEvent[],
  location_id: string,
): readonly Period[] =>
  countObservations(events, location_id).map((observation, index, all) => ({
    index,
    opened_after: index === 0 ? null : (all[index - 1]?.boundary ?? null),
    closed_at: observation.boundary,
    observation,
    is_baseline: index === 0,
  }));

/** `(opened_after, closed_at]` — half-open at the start so a boundary count belongs to one period. */
export const inWindow = (period: Period, stamp: number): boolean =>
  stamp <= period.closed_at && (period.opened_after === null || stamp > period.opened_after);

// ── the physical facts, resolved and windowed ──────────────────────────────────────────────────

type PurchaseLine = {
  readonly line_no: number;
  readonly item_id: string;
  readonly supplier_item_id: string | null;
  readonly qty_base: number;
  readonly line_total_paisa: number;
};
type PurchasePayload = {
  readonly purchase_id: string;
  readonly supplier_id: string;
  readonly location_id: string;
  readonly lines: readonly PurchaseLine[];
  readonly invoice_total_paisa: number;
};
type WastagePayload = {
  readonly wastage_id: string;
  readonly location_id: string;
  readonly item_id: string;
  readonly qty_base: number;
  readonly reason: string;
};

export type PhysicalFacts = {
  /** Per item: what entered the valuation. `10-F31` excludes non-positive-quantity lines. */
  readonly purchases: ReadonlyMap<string, ValueQtyPair>;
  /** `10-F14`'s khata total for the window — money spent, INCLUDING the excluded lines. */
  readonly invoice_total_paisa: number;
  /** Per item: base units thrown away (`10-F16`). */
  readonly wastage: ReadonlyMap<string, number>;
  /**
   * Items whose purchases or wastage arrived contested. Their rows are refused rather than computed
   * from a figure missing an unknown amount — dropping a contested purchase would understate
   * purchases and INFLATE the apparent gap, which on this report is an accusation.
   */
  readonly unresolved_items: readonly string[];
  readonly contested_keys: readonly string[];
};

/**
 * Resolve and window one period's physical acts.
 *
 * Business keys are `purchase_id` and `wastage_id`, resolved through the contested-set rule. The
 * window stamp for a key is the **minimum** `branch_created_at` across its observations, for the
 * reason `countObservations` states: a re-append is a redelivery of an act, not a second act.
 */
export const physicalFacts = (
  events: readonly InventoryEvent[],
  location_id: string,
  period: Period,
): PhysicalFacts => {
  type Row<T> = { readonly payload: T; readonly stamp: number };
  const purchaseRows: Row<PurchasePayload>[] = [];
  const wastageRows: Row<WastagePayload>[] = [];
  for (const event of events) {
    if (event.type === "stock.purchase_recorded") {
      const payload = event.payload as PurchasePayload;
      if (payload.location_id === location_id) {
        purchaseRows.push({ payload, stamp: event.envelope.branch_created_at });
      }
    } else if (event.type === "stock.wastage_recorded") {
      const payload = event.payload as WastagePayload;
      if (payload.location_id === location_id) {
        wastageRows.push({ payload, stamp: event.envelope.branch_created_at });
      }
    }
  }

  // ⚠ Money is accumulated by COLLECTING and summing through `sumPaisa`, never by `+=`. That is
  // law 3 and `DEC-MONEY-005`'s GritQL rule, which fired on the first draft of this loop: float
  // `+` is not associative near 2^53, so a running double total lets DELIVERY ORDER decide a money
  // outcome — an `01-F34` break through entirely schema-valid payloads. `sumPaisa` accumulates in
  // BigInt and throws past exactness rather than drifting.
  const purchaseValues = new Map<string, Paisa[]>();
  const purchaseQtys = new Map<string, number>();
  const invoiceTotals: Paisa[] = [];
  const wastage = new Map<string, number>();
  const unresolved = new Set<string>();
  const contestedKeys: string[] = [];

  for (const [key, group] of groupByKey(purchaseRows, (row) => row.payload.purchase_id)) {
    let stamp = Number.POSITIVE_INFINITY;
    for (const row of group) if (row.stamp < stamp) stamp = row.stamp;
    if (!inWindow(period, stamp)) continue;
    const resolution = resolve(group.map((row) => row.payload));
    if (resolution.kind === "contested") {
      contestedKeys.push(key);
      for (const candidate of resolution.values) {
        for (const line of candidate.lines) unresolved.add(line.item_id);
      }
      continue;
    }
    if (resolution.kind !== "resolved") continue;
    invoiceTotals.push(paisa(resolution.value.invoice_total_paisa));
    for (const line of resolution.value.lines) {
      // `10-F31`: a receipt line with non-positive quantity does not enter the valuation but still
      // enters `10-F14`'s khata (a delivery charge is money spent and no goods). Dropping BOTH its
      // value and its quantity is what keeps the weighted average honest; keeping the value while
      // dropping the quantity would inflate the unit cost of everything else on the invoice.
      if (line.qty_base <= 0) continue;
      const values = purchaseValues.get(line.item_id) ?? [];
      values.push(paisa(line.line_total_paisa));
      purchaseValues.set(line.item_id, values);
      purchaseQtys.set(line.item_id, (purchaseQtys.get(line.item_id) ?? 0) + line.qty_base);
    }
  }

  const purchases = new Map<string, ValueQtyPair>();
  for (const [item_id, values] of purchaseValues) {
    purchases.set(item_id, {
      value_paisa: sumPaisa(values),
      qty_base: purchaseQtys.get(item_id) ?? 0,
    });
  }

  for (const [key, group] of groupByKey(wastageRows, (row) => row.payload.wastage_id)) {
    let stamp = Number.POSITIVE_INFINITY;
    for (const row of group) if (row.stamp < stamp) stamp = row.stamp;
    if (!inWindow(period, stamp)) continue;
    const resolution = resolve(group.map((row) => row.payload));
    if (resolution.kind === "contested") {
      contestedKeys.push(key);
      for (const candidate of resolution.values) unresolved.add(candidate.item_id);
      continue;
    }
    if (resolution.kind !== "resolved") continue;
    const fact = resolution.value;
    wastage.set(fact.item_id, (wastage.get(fact.item_id) ?? 0) + fact.qty_base);
  }

  return {
    purchases,
    invoice_total_paisa: sumPaisa(invoiceTotals),
    wastage,
    unresolved_items: [...unresolved].sort(),
    contested_keys: contestedKeys.sort(),
  };
};

// ── 10-F31's cost basis ────────────────────────────────────────────────────────────────────────

export const COST_BASES = ["receipted", "reference", "none"] as const;
export type CostBasis = (typeof COST_BASES)[number];

export type ResolvedCost = {
  readonly basis: CostBasis;
  /** `null` iff `basis === "none"`. Nothing may value a quantity without one. */
  readonly pair: ValueQtyPair | null;
};

/**
 * `10-F31` — the basis resolves to **exactly one** of `receipted | reference | none`, per
 * (item, location, period).
 *
 * `receipted` requires a usable pair: a positive denominator, and an opening whose VALUE is known.
 * An opening quantity carried forward from a period that had no basis contributes quantity without
 * value, and averaging over it would understate the cost of everything in the period — so it falls
 * through to `reference` rather than producing a confidently wrong rate. That is `10-F31` R5's
 * *"a zero standing in for an unknown cost"* in its arithmetic form.
 *
 * `reference` is **a legitimate first answer, not a placeholder**: without it the onboarding ramp
 * cannot terminate, because salt bought quarterly never acquires a basis in a weekly period.
 * A receipt overwrites it per period the moment one arrives — this function is why that sentence
 * is true, and it is why `reference_cost` is not consulted at all when receipts exist.
 */
export const costBasisOf = (
  item: InventoryItem,
  opening: ValueQtyPair | null,
  purchased: ValueQtyPair | undefined,
): ResolvedCost => {
  const openQty = opening?.qty_base ?? 0;
  const buyQty = purchased?.qty_base ?? 0;
  const qty = openQty + buyQty;
  // Through `sumPaisa` rather than `+` — see `physicalFacts`' note on law 3 and the GritQL rule.
  const value = sumPaisa([paisa(opening?.value_paisa ?? 0), paisa(purchased?.value_paisa ?? 0)]);
  // `opening === null` means the carry existed but could not be valued; treating it as zero value
  // over a positive quantity is exactly the understatement above, so a null opening with a
  // positive carried quantity disqualifies `receipted` even when this period has receipts.
  const openingUsable = opening !== null || openQty === 0;
  if (openingUsable && qty > 0 && value >= 0) {
    return { basis: "receipted", pair: { value_paisa: value, qty_base: qty } };
  }
  if (item.reference_cost !== null && item.reference_cost.qty_base > 0) {
    return { basis: "reference", pair: item.reference_cost };
  }
  return { basis: "none", pair: null };
};

/** Value a quantity at a resolved cost, or `null` when there is no basis to value it at. */
export const valueOrNull = (qty_base: number, cost: ResolvedCost): number | null =>
  cost.pair === null ? null : valueAt(qty_base, cost.pair);
