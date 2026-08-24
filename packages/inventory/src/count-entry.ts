/**
 * `10-F29`'s partial-tier arithmetic — the **writer's** half of the count.
 *
 * A counter enters containers and, at most, one partial. This turns that into the `qty_base` a
 * `stock.count_recorded` line carries, and decides the line's `basis`. It runs at the count SCREEN,
 * upstream of `parseEvent`; nothing downstream ever sees tenths, because a display unit in a ledger
 * makes every historical movement depend on a reference row a later edit can change and `01-F1`
 * allows no edit.
 *
 * ⚠ **The tenths are an INTEGER 0–9 and the multiply happens before the divide.** `10-F29`:
 * *"stored as an integer 0–9, never a float … one exact multiply-then-round in BigInt"*. A float
 * tenth is law 3's hazard one domain over — it is how delivery order gets to decide a quantity.
 */

import type { CountBasis } from "@restos/domain";
import { rational, roundHalfUp } from "./rational.js";
import type { CountUnits } from "./reference.js";

/**
 * @unreached-owed With `countEntryToBase` — the COUNT SCREEN is slice 1 step 6 and is not built.
 */
export class PartialTierError extends Error {}

export type CountEntry = {
  /** Whole containers the counter picked up. */
  readonly containers: number;
  /** `fraction` tier only: 0–9 tenths of ONE container. */
  readonly tenths?: number;
  /** `weight` tier only: the contents of the opened container, in the item's base unit. */
  readonly partial_base?: number;
};

/**
 * `qty_base = containers × size + tenths × size / 10`, exactly, with ONE rounding.
 *
 * Returns the quantity and the `basis` the line must carry — they are produced together on purpose.
 * If the basis could be had without the quantity, a caller could record the number and drop the
 * label, and `10-F33` (a) computes the noise floor FROM the basis, so an unlabelled estimate and an
 * exact reading become the same number on the wire and a factor of ~10 apart in what they license
 * anyone to say. `directedPaisa` in `packages/domain` pairs its two halves for the same reason.
 *
 * @unreached-owed The COUNT SCREEN is slice 1 step 6 (`plans/inventory/design.md` §7) and is not
 * built: it is gated on amendment **A1**, the `inventory` member of `01-F75`'s closed resource set,
 * without which a device has no item list to render and no area to name. `10-F29`'s tier arithmetic
 * is written here rather than there because `18 §2` puts one declaration in a package, and because
 * the back-office item editor validates a declared tier against the same walk.
 */
export const countEntryToBase = (
  entry: CountEntry,
  units: CountUnits,
): { readonly qty_base: number; readonly basis: CountBasis } => {
  if (!Number.isSafeInteger(entry.containers) || entry.containers < 0) {
    throw new PartialTierError(
      `containers must be a non-negative integer, got ${entry.containers}`,
    );
  }
  const size = BigInt(units.primary_size_base);
  const whole = BigInt(entry.containers) * size;

  if (units.partial.kind === "none") {
    if (entry.tenths !== undefined || entry.partial_base !== undefined) {
      throw new PartialTierError(
        "this item declares no partial tier (10-F29 fixes it per item at onboarding), so a " +
          "partial entered at count time has nowhere legal to go",
      );
    }
    return { qty_base: roundHalfUp(rational(whole, 1n)), basis: "exact" };
  }

  if (units.partial.kind === "fraction") {
    const tenths = entry.tenths ?? 0;
    if (!Number.isInteger(tenths) || tenths < 0 || tenths > 9) {
      throw new PartialTierError(`tenths must be an integer 0-9, got ${tenths}`);
    }
    // Multiply BEFORE dividing: `size × tenths / 10` is exact where `size / 10 × tenths` is not.
    return {
      qty_base: roundHalfUp(rational(whole * 10n + size * BigInt(tenths), 10n)),
      // The tenths chip row is an ESTIMATE and the line must say so. A published head-to-head put a
      // slider at ~6.93% averaged error and 12% on opaque containers; that travels to the variance
      // row and is what stops `10-F19` pointing a hint at an estimator's own noise.
      basis: tenths === 0 ? "exact" : "estimated",
    };
  }

  const partial = entry.partial_base ?? 0;
  if (!Number.isSafeInteger(partial) || partial < 0) {
    throw new PartialTierError(`weighed contents must be a non-negative integer, got ${partial}`);
  }
  return {
    qty_base: roundHalfUp(rational(whole + BigInt(partial), 1n)),
    basis: partial === 0 ? "exact" : "weighed",
  };
};
