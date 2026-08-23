/**
 * `01-F82`'s `billed_total` — ONE door, over the fold's own projected line cells.
 *
 * Owning specs: `01-F82`/`16-F31` (founder ruling R54 — tax is INSIDE `billed_total`), `16-F5`
 * (tax per line, snapshotted), `01-F30` (conservation), `26 §8` (fold logic lives in one module).
 *
 * ── WHY THIS FILE EXISTS AT ALL ───────────────────────────────────────────────────────────────
 *
 * `01-F82` amends `01-F30` in place: `billed_total` stops being *"the sum of line prices"* and
 * becomes **what the customer owes, tax included** — *"precisely `16-F5`'s snapshot total"*. The
 * two halves of that sentence live in two packages: the per-line billed amount is
 * `merge.ts`'s `billedCellPaisa` (exported as `billedLinePaisa`, because `26 §8` forbids
 * re-deriving fold logic anywhere else) and the arithmetic over it is `@restos/domain`'s
 * `taxSnapshot`. This is the only place they are joined, so that the receipt's *Total*, the cover
 * test, the closing act's attested `billed_paisa` and the screen cannot each join them
 * differently. Two joins of one identity is how a money anomaly becomes a false finding — the
 * T-01-11 ruling that deleted the Auditor's mirror of the billed sum is the corpus's own instance.
 *
 * ── IT IS NOT A FOLD, AND STANDING LAW 1 IS UNTOUCHED ─────────────────────────────────────────
 *
 * It reads an ALREADY-PROJECTED `json_lines` map and a resolved `TaxCell`, and returns a value.
 * No ordering metadata, no clock, no envelope id, no device state (`01-F34`). `Object.entries`
 * order cannot move a figure either: `taxSnapshot` computes every line from its own billed amount
 * and totals them with exact integer sums, which is the property `16-F5`'s per-line rule buys and
 * `tax-posture.test.ts` §E pins.
 *
 * ⚠ **CONFIGURATION IS NEVER A FOLD INPUT (`01-F87`, and `01-F52` before it).** The `TaxCell` is
 * the CALLER's, resolved at the moment of the act, exactly as `01-F53` freezes a price. Nothing
 * here reads it from a store, and nothing that projects state may call this: a projection keyed on
 * an org-typed rate would make two tills at different configuration versions project different
 * money, which `01-F87` states no property test can catch.
 *
 * ── ⚠ ONE DIVERGENCE FROM `billedEffectiveFromJsonLines`, NAMED RATHER THAN DISCOVERED ────────
 *
 * The order-level helper returns **zero** for a total that cannot be represented exactly, matching
 * what the fold's own accumulators do on the ingest path (`01-F17`: a wedged device stops
 * receiving the branch's events). `taxSnapshot` **throws** instead, and `packages/domain/src/tax.ts`
 * declares and defends that choice: standing law 3's *"contributes zero, never throw"* is scoped
 * to ingest, and a tax computed at the settling act is not that path. This file adopts the door's
 * policy rather than inventing a third, and the divergence is stated because the two functions now
 * answer the same question. It is reachable only above Rs 90,000,000,000,000 of billable lines.
 */

import {
  paisa,
  roundPaisaToGranularity,
  type TaxCell,
  type TaxSnapshot,
  taxSnapshot,
} from "@restos/domain";

import { type BilledLineCell, billedLinePaisa } from "./folds/merge.js";

/**
 * `01-F82` + `02-F63` for one order: the tax snapshot, the rounding adjustment and the charge.
 *
 * **Three values from ONE call, on `directedPaisa`'s stated precedent.** If the charge could be had
 * without the rounding, a caller could print a *Total* that its own *Subtotal* and *Tax* rows do
 * not add up to — which is the defect `02-F63` was ruled on, in a new costume. And if the rounding
 * could be had without the charge, a caller would have to add them back together itself, which is
 * money arithmetic outside `domain` (`DEC-MONEY-005`).
 */
export type ChargeSnapshot = {
  /** `16-F5`'s snapshot, untouched: its `total_paisa` is `subtotal + tax` and is NOT the bill. */
  readonly tax: TaxSnapshot;
  /**
   * `02-F63` (b)'s DERIVED adjustment — `charge_total_paisa − tax.total_paisa`, **signed**, and
   * deliberately not a stored field on any event: it is recomputable from figures the order already
   * carries, so persisting it would be `02-F45`'s second source for one fact.
   *
   * Signed, and it is a plain `number` for `01-F30`'s own reason: `Paisa` is non-negative because
   * an append-only ledger cannot subtract from history, so a rounding-DOWN adjustment has no
   * branded representation. A renderer takes its direction and magnitude through `directedPaisa`.
   */
  readonly rounding_paisa: number;
  /** `01-F82` as amended by `02-F63`: **what the customer owes**, tax included and rounded. */
  readonly charge_total_paisa: number;
};

/**
 * `16-F5`'s per-line tax for one order, in the shape `taxSnapshot` takes. Module-private now that
 * `orderChargeSnapshot` is the door: an exported tax-only snapshot beside a charge snapshot is two
 * answers to *what does the customer owe*, which is exactly what this file exists to prevent.
 */
const taxSnapshotOf = (jsonLines: string, cell: TaxCell): TaxSnapshot =>
  taxSnapshot({
    posture: cell.posture,
    rate_bps: cell.rate_bps,
    lines: Object.entries(JSON.parse(jsonLines) as Record<string, BilledLineCell>).map(
      ([line_id, projected]) => ({
        line_id,
        // The ENGINE's own per-cell billed derivation (`01-F30`'s exited-line rule plus
        // `CONTESTED_LINE_BILLABLE`), never a `qty × unit_price` multiplication here — that would
        // tax a VOIDED line, which contributes zero to the bill.
        billed_paisa: billedLinePaisa(projected),
      }),
    ),
  });

/**
 * `16-F5`'s snapshot plus `02-F63`'s rounding for one projected order — the per-line figures a
 * receipt itemises, the three tax totals, the rounding row and the amount charged, computed once so
 * they cannot disagree.
 *
 * `jsonLines` is an `OpenOrderRow`'s `json_lines`, the same string
 * `billedEffectiveFromJsonLines` takes. The map KEY is the line id: `merge.ts` keys the cell map
 * by `line_id` and `16-F5` snapshots per line, so a caller that invented its own ids would produce
 * a snapshot nothing could reconcile against the order.
 *
 * ⚠ **`rounding_granularity_paisa` IS A REQUIRED PARAMETER AND HAS NO DEFAULT, DELIBERATELY.**
 * `02-F63` (c) puts the default in the CONFIGURATION (100 paisa), not in this function: a default
 * here would let a caller that never resolved the org's step look identical to one that did, which
 * is `16-F1`'s own precedent transcribed one file over — *"`TAX_OFF` is expressed for a CALLER to
 * pass explicitly, never as a fallback inside this function"*. The compiler is what makes every one
 * of the five readers supply it, and that is the whole seam.
 *
 * ⚠ **THE ROUNDING IS ON THE ORDER TOTAL AND NEVER PER LINE (`02-F63` (e)).** The implementation
 * this shape invites — round each line, or round the total and push the residue back across the
 * lines — makes a projected money value depend on the order the cells were serialised in, which is
 * a live standing-law-1 break (`01-F34`) through entirely schema-valid payloads. What keeps this
 * safe is that `taxSnapshot`'s total is an exact integer sum over per-line figures each computed
 * from its own billed amount, so it is order-invariant, and a function of an order-invariant number
 * is order-invariant.
 */
export const orderChargeSnapshot = (
  jsonLines: string,
  cell: TaxCell,
  rounding_granularity_paisa: number,
): ChargeSnapshot => {
  const tax = taxSnapshotOf(jsonLines, cell);
  const charge = roundPaisaToGranularity(paisa(tax.total_paisa), rounding_granularity_paisa);
  // BigInt, not `subPaisa` and not a bare `-`. `subPaisa` brands its result and `Paisa` is
  // non-negative, so it would THROW on every rounding-DOWN order — the same wall
  // `settledConservationResidualPaisa` hit, which `invariants.ts` answers by returning the
  // difference unbranded and signed. A plain `-` is banned outright (`DEC-MONEY-005`: both
  // operands are money-named), and the BigInt wrapper is the path that ban explicitly blesses.
  // No overflow guard is reachable: `|charge − total| < granularity` by construction, and both
  // operands were already refused above `Number.MAX_SAFE_INTEGER` by `paisa()`.
  const rounding_paisa = Number(BigInt(charge) - BigInt(tax.total_paisa));
  return { tax, rounding_paisa, charge_total_paisa: charge };
};

/**
 * `01-F82`'s `billed_total` for one projected order: **what the customer owes, tax included.**
 *
 * This is the number `01-F30`'s conservation equation, `01-F63`'s attested `billed_paisa`, the
 * `pay_total >= billed_effective` cover test, the `shift_cash` fold's expected drawer and the
 * receipt's *Total* row all mean. Under `16-F1`'s default cell (`TAX_OFF`) it is exactly
 * `billedEffectiveFromJsonLines`'s answer, and `order-tax.test.ts` §A pins that equality across a
 * fixture sweep rather than asserting it once — because *"the change is ONE POSTURE WIDE"*
 * (`01-F82`) is the property that makes the amendment checkable at all.
 */
export const billedTotalPaisa = (
  jsonLines: string,
  cell: TaxCell,
  rounding_granularity_paisa: number,
): number => orderChargeSnapshot(jsonLines, cell, rounding_granularity_paisa).charge_total_paisa;
