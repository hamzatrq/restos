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

/** Bigint-exact accumulation; throws rather than drift past Number.MAX_SAFE_INTEGER. */
export const sumPaisa = (values: readonly Paisa[]): Paisa => {
  let total = 0n;
  for (const v of values) total += BigInt(v);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`sumPaisa overflow: ${total}`);
  }
  return paisa(Number(total));
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
