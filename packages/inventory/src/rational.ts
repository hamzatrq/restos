/**
 * **THE ONE DIVISION DOOR IN THIS PACKAGE**, and the reason it exists is law 3 (`00 §6`,
 * `DEC-MONEY-005`) applied one domain over.
 *
 * `10-F28` forbids storing a unit cost, because a cost per base unit is a **rate** and will not be
 * an integer: Rs 6,800 for 10 kg of chicken is 0.068 paisa per milligram, which is exactly nowhere
 * on the number line a ledger may use. So every valuation in this package is
 * `round(qty × value_paisa / qty_base)` from the **pair**, and every recipe explosion is
 * `qty × line_qty / yield_qty` — two divisions that must not round until the very end.
 *
 * **Why a rational and not "just round each step".** A recipe nests: a karahi consumes 200 g of
 * marinated boti, which a prep recipe makes 15 kg of from 18 kg of raw meat. Rounding at each hop
 * accumulates, and `10 §8` requires *"no cumulative drift vs exact rational computation"*. The
 * cheapest way to satisfy that property is not to test it — it is to **be** the exact rational
 * computation and round once, which is `10-F28`'s own argument for holding the period cost as a
 * pair. **The drift property is then satisfied by construction and there is no running
 * accumulation left to drift.**
 *
 * **BigInt throughout, and that is not defensive.** Law 3: float `+` is not associative near 2^53,
 * so a running double total lets DELIVERY ORDER decide a money outcome — an `01-F34` break through
 * entirely schema-valid payloads. A recipe explosion multiplies quantities in **milligrams** by
 * yields, so `18 kg × 200 g` is already 3.6e12 before anything is summed; two more hops and the
 * numerator is past 2^53 while the ANSWER is a few grams.
 *
 * ⚠ **Rounding is HALF-UP AWAY FROM ZERO, matching `applyRateBps` in `packages/domain`.** It has to
 * match: a valuation rounded half-up here and half-even there would put the variance report and the
 * money it is compared against in permanent disagreement, and `01-F1` allows no correction in
 * place. Negative quantities occur — a variance gap is a signed difference — so "half-up" without
 * "away from zero" would round −0.5 to 0 and +0.5 to 1, making the report's arithmetic asymmetric
 * about a sign it is supposed to be neutral about. `10-F33` (c) makes the SIGN the discriminator
 * between measurement error and one-sided loss, so a rounding rule that treats the two signs
 * differently would bias the very thing that decides whether anyone is accused of anything.
 */

/** An exact rational. `d` is always > 0; the sign lives entirely in `n`. */
export type Rational = { readonly n: bigint; readonly d: bigint };

export class DivideByZeroError extends Error {
  constructor(what: string) {
    super(
      `${what}: division by zero. A pair with qty_base 0 has no rate to offer and 10-F31 keeps ` +
        `it out of the valuation entirely rather than letting it reach this door.`,
    );
    this.name = "DivideByZeroError";
  }
}

export const rational = (n: bigint, d: bigint): Rational => {
  if (d === 0n) throw new DivideByZeroError("rational");
  return d < 0n ? { n: -n, d: -d } : { n, d };
};

export const ZERO: Rational = { n: 0n, d: 1n };

export const fromInt = (n: number | bigint): Rational => ({ n: BigInt(n), d: 1n });

/**
 * Sum. Deliberately NOT reducing to lowest terms on every step: `gcd` per addend is the expensive
 * half and the denominators here are products of a handful of yields, so the exact answer arrives
 * either way. `roundHalfUp` reduces once, at the door.
 */
export const add = (a: Rational, b: Rational): Rational =>
  a.n === 0n ? b : b.n === 0n ? a : rational(a.n * b.d + b.n * a.d, a.d * b.d);

export const mul = (a: Rational, b: Rational): Rational => rational(a.n * b.n, a.d * b.d);

export const negate = (a: Rational): Rational => ({ n: -a.n, d: a.d });

export const isZero = (a: Rational): boolean => a.n === 0n;

/** Sign of the rational: `-1`, `0` or `1`. `10-F33` (c)'s discriminator, exactly. */
export const sign = (a: Rational): -1 | 0 | 1 => (a.n === 0n ? 0 : a.n < 0n ? -1 : 1);

/** `|a| >= |b|`, exact and float-free — the noise-floor comparison (`10-F33` (a)). */
export const absAtLeast = (a: Rational, b: Rational): boolean => {
  const an = a.n < 0n ? -a.n : a.n;
  const bn = b.n < 0n ? -b.n : b.n;
  return an * b.d >= bn * a.d;
};

/**
 * The door. One exact multiply-then-round, half-up away from zero, back to a JS safe integer.
 *
 * Throws past `Number.MAX_SAFE_INTEGER` rather than truncating — `sumPaisa`'s idiom in
 * `packages/domain`, and for its reason: a silently truncated quantity is a wrong number that
 * looks right, which is this module's whole failure mode (`10-F32`, `10-F29`).
 *
 * ⚠ **It does NOT throw on the ingest path and no caller may make it do so.** `01-F17` forbids a
 * throw that could wedge ingestion, so every caller here is a READ-MODEL caller computing a report;
 * an ingest-path caller would need `totalPaisaOrNull`'s non-throwing shape instead.
 */
export const roundHalfUp = (a: Rational): number => {
  const negative = a.n < 0n;
  const abs = negative ? -a.n : a.n;
  // `(2|n| + d) / 2d` is `|n|/d` rounded half-up, in integers, with no intermediate rounding.
  const scaled = (2n * abs + a.d) / (2n * a.d);
  const out = negative ? -scaled : scaled;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (out > limit || out < -limit) {
    throw new RangeError(
      `inventory rational overflow: ${out} is past Number.MAX_SAFE_INTEGER. A quantity or ` +
        `valuation this large is a data defect upstream, and truncating it would hide one.`,
    );
  }
  return Number(out);
};

/**
 * Value a quantity at a `(value_paisa, qty_base)` pair — `10-F28`'s rule, in one place.
 *
 * A pair with `qty_base === 0` has **no rate at all**, and this refuses rather than answering zero.
 * A zero answer would be `10-F31`'s R5 exactly — *a zero standing in for an unknown cost* — and it
 * is the arithmetic form of the same mistake as the blank count that reads as `0` (`10-F29`).
 * Callers ask `costBasisOf` first; there is no route that reaches here without one.
 */
export const valueAt = (
  qty_base: number,
  pair: { readonly value_paisa: number; readonly qty_base: number },
): number => {
  if (pair.qty_base === 0) throw new DivideByZeroError("valueAt");
  return roundHalfUp(rational(BigInt(qty_base) * BigInt(pair.value_paisa), BigInt(pair.qty_base)));
};
