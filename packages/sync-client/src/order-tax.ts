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

import { type TaxCell, type TaxSnapshot, taxSnapshot } from "@restos/domain";

import { type BilledLineCell, billedLinePaisa } from "./folds/merge.js";

/**
 * `16-F5`'s snapshot for one projected order — the per-line figures a receipt itemises plus the
 * three totals it prints, computed once so they cannot disagree.
 *
 * `jsonLines` is an `OpenOrderRow`'s `json_lines`, the same string
 * `billedEffectiveFromJsonLines` takes. The map KEY is the line id: `merge.ts` keys the cell map
 * by `line_id` and `16-F5` snapshots per line, so a caller that invented its own ids would produce
 * a snapshot nothing could reconcile against the order.
 */
export const orderTaxSnapshot = (jsonLines: string, cell: TaxCell): TaxSnapshot =>
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
 * `01-F82`'s `billed_total` for one projected order: **what the customer owes, tax included.**
 *
 * This is the number `01-F30`'s conservation equation, `01-F63`'s attested `billed_paisa`, the
 * `pay_total >= billed_effective` cover test, the `shift_cash` fold's expected drawer and the
 * receipt's *Total* row all mean. Under `16-F1`'s default cell (`TAX_OFF`) it is exactly
 * `billedEffectiveFromJsonLines`'s answer, and `order-tax.test.ts` §A pins that equality across a
 * fixture sweep rather than asserting it once — because *"the change is ONE POSTURE WIDE"*
 * (`01-F82`) is the property that makes the amendment checkable at all.
 */
export const billedTotalPaisa = (jsonLines: string, cell: TaxCell): number =>
  orderTaxSnapshot(jsonLines, cell).total_paisa;
