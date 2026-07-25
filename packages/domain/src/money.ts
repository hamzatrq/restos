// Branded integer money/quantity types (00 §6): floats in ledgers never.
declare const brand: unique symbol;
export type Paisa = number & { readonly [brand]: "Paisa" };
export type Milligrams = number & { readonly [brand]: "Milligrams" };
export type Millilitres = number & { readonly [brand]: "Millilitres" };
export type Units = number & { readonly [brand]: "Units" };

const asInt = (n: number, label: string): number => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${n}`);
  }
  return n;
};

export const paisa = (n: number): Paisa => asInt(n, "paisa") as Paisa;
export const mg = (n: number): Milligrams => asInt(n, "mg") as Milligrams;
export const ml = (n: number): Millilitres => asInt(n, "ml") as Millilitres;
export const units = (n: number): Units => asInt(n, "units") as Units;

export const addPaisa = (a: Paisa, b: Paisa): Paisa => paisa(a + b);
export const subPaisa = (a: Paisa, b: Paisa): Paisa => paisa(a - b);

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Bigint-exact total of RAW integer-paisa numbers, or `null` when the result cannot
 * be represented exactly as a JS integer (DEC-MONEY-005 fold clause, T-01-22).
 *
 * The non-throwing sibling of `sumPaisa`, and the difference is not stylistic. This
 * is for the **sync ingest path**, where an uncaught throw would wedge ingestion and
 * a wedged device stops receiving the branch's events — forbidden by 01-F17. Callers
 * there must surface an anomaly and contribute zero, never crash and never truncate.
 *
 * Accumulating in BigInt is the point: `+` on doubles is NOT associative once values
 * approach 2^53, so a plain running total makes DELIVERY ORDER decide a money outcome
 * — Σ[MAX_SAFE,1,1,1] differs depending on which addend arrives first. That breaks
 * 01-F34 convergence through entirely schema-valid payloads.
 */
export const totalPaisaOrNull = (values: readonly number[]): number | null => {
  let total = 0n;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) return null; // an input already past exactness
    total += BigInt(v);
  }
  return total > SAFE || total < -SAFE ? null : Number(total);
};

/** Bigint-exact accumulation; throws rather than drift past Number.MAX_SAFE_INTEGER. */
export const sumPaisa = (values: readonly Paisa[]): Paisa => {
  const total = totalPaisaOrNull(values as readonly number[]);
  if (total === null) throw new RangeError("sumPaisa overflow");
  return paisa(total);
};

/**
 * Split a total into n integer parts (00 §6 / DEC-MONEY-005 / T-01-13).
 * Rounding policy: LARGEST-REMAINDER, FIRST PARTS — with q = floor(total / n) and
 * r = total % n, parts[i] = q + 1 for i < r, else q. Deterministic, order-stable,
 * max − min ≤ 1, and the parts sum back to the total exactly (no rounding leak).
 * Exact float-free on all safe integers: q is computed as (total − r) / n, which is
 * an exactly representable integer division.
 */
export const splitPaisa = (total: Paisa, n: number): Paisa[] => {
  const t = asInt(total, "splitPaisa total"); // brands are compile-time only (18 §4)
  asInt(n, "splitPaisa n");
  if (n === 0) throw new RangeError("splitPaisa n must be >= 1, got 0");
  const r = t % n;
  const q = (t - r) / n;
  return Array.from({ length: n }, (_, i) => paisa(i < r ? q + 1 : q));
};

/**
 * Apply an integer basis-point rate (1700 = 17%) to an amount (00 §6 / DEC-MONEY-005 /
 * T-01-13). Rounding policy: ROUND-HALF-UP — floor((amount·bps + 5000) / 10000), computed
 * integer-exactly in BigInt (amount·bps routinely exceeds 2^53; the naive float path is
 * off by one). bps has no upper cap (markups above 100% are legal). A result past
 * Number.MAX_SAFE_INTEGER throws — the sumPaisa overflow idiom, never a drifted double.
 */
export const applyRateBps = (amount: Paisa, bps: number): Paisa => {
  const a = asInt(amount, "applyRateBps amount"); // brands are compile-time only (18 §4)
  asInt(bps, "applyRateBps bps");
  const scaled = (BigInt(a) * BigInt(bps) + 5000n) / 10000n;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`applyRateBps overflow: ${scaled}`);
  }
  return paisa(Number(scaled));
};
