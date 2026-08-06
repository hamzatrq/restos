// Branded integer money/quantity types (00 §6): floats in ledgers never.
declare const brand: unique symbol;
export type Paisa = number & { readonly [brand]: "Paisa" };
export type Milligrams = number & { readonly [brand]: "Milligrams" };
export type Millilitres = number & { readonly [brand]: "Millilitres" };
export type Units = number & { readonly [brand]: "Units" };

/**
 * The integer-paisa runtime guard, declared ONCE (`18 §2` — schemas and their enforcement
 * live in `domain` a single time; redeclaring one elsewhere is a violation, not a
 * convenience). Brands are compile-time only (T-01-13 posture), so this check IS the
 * enforcement, and `invariants.ts` imports it rather than keeping a second copy: the two had
 * identical semantics and different message text, which is exactly how a guard drifts.
 */
export const asPaisaInt = (n: number, label: string): number => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${n}`);
  }
  return n;
};

export const paisa = (n: number): Paisa => asPaisaInt(n, "paisa") as Paisa;
// @unreached-owed The QUANTITY constructors land with inventory (`specs/10`), which no app or
// service touches yet — nothing in Wave 1 records a milligram. Commandment 3 requires them to
// exist here and nowhere else, so they are written before their caller on purpose.
export const mg = (n: number): Milligrams => asPaisaInt(n, "mg") as Milligrams;
// @unreached-owed With `mg` — inventory (`specs/10`), no Wave-1 caller.
export const ml = (n: number): Millilitres => asPaisaInt(n, "ml") as Millilitres;
// @unreached-owed With `mg` — inventory (`specs/10`), no Wave-1 caller.
export const units = (n: number): Units => asPaisaInt(n, "units") as Units;

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

/**
 * Bigint-exact accumulation; throws rather than drift past Number.MAX_SAFE_INTEGER.
 *
 * @unreached-owed The THROWING sibling has no shipping caller — every live total runs the
 * ingest path through `totalPaisaOrNull` (which is reached), because `01-F17` forbids a throw
 * there. A caller appears where a throw is correct: back-office and report arithmetic (`specs/14`,
 * `specs/12`). Until then this is a tested primitive with no seam, and saying so beats pretending.
 */
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
 *
 * @unreached-owed Nothing in Wave 1 DIVIDES money. Split-bill (`02`), tip pooling (blocked on
 * `DEC-MONEY-004`'s catalog entries) and service charge are the callers, and none is built. Law 3
 * says division goes through here when it arrives — this marker is what makes that a decision.
 */
export const splitPaisa = (total: Paisa, n: number): Paisa[] => {
  const t = asPaisaInt(total, "splitPaisa total"); // brands are compile-time only (18 §4)
  asPaisaInt(n, "splitPaisa n");
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
 *
 * @unreached-owed Nothing in Wave 1 applies a RATE. Tax (`specs/16`), aggregator commission
 * (`specs/08`) and percentage discounts are the callers; the till currently sells at the priced
 * line and settles it. Law 3 routes every future rate through here.
 */
export const applyRateBps = (amount: Paisa, bps: number): Paisa => {
  const a = asPaisaInt(amount, "applyRateBps amount"); // brands are compile-time only (18 §4)
  asPaisaInt(bps, "applyRateBps bps");
  const scaled = (BigInt(a) * BigInt(bps) + 5000n) / 10000n;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`applyRateBps overflow: ${scaled}`);
  }
  return paisa(Number(scaled));
};

/**
 * Split paisa into whole rupees and the remaining paisa, for DISPLAY only (27-F23).
 *
 * The divide lives here rather than in the UI because DEC-MONEY-005 bans raw arithmetic on
 * money everywhere, not only in ledgers — and the GritQL rule correctly rejected the
 * obvious `paisa / 100` in a formatter. Exact and float-free on all safe integers: the
 * remainder is removed before dividing, so the quotient is an exactly representable
 * integer division.
 *
 * Rounding: NONE, and no remainder is returned. `27-F23` says operational screens show no
 * decimals, and no FR in doc 16 requires a sub-rupee DISPLAY value — `16-F5` says "integer
 * paisas; rounding rules per authority spec", which is a ledger rule, not a formatter one.
 * An earlier version returned the remainder as `subPaisa` on the strength of a fiscal
 * requirement that greps to nothing (Commandment 2), and that name also collided with the
 * exported binary `subPaisa` subtraction helper on this same public surface.
 *
 * `Paisa` is NON-NEGATIVE by contract (see `asPaisaInt`) and this helper stays that way. But
 * the domain DOES produce a signed money value — `settledConservationResidualPaisa` returns
 * `billed − (tendered − refunded)` and its sign is load-bearing — so a caller with a variance
 * to render uses `directedPaisa` and passes the magnitude here. That is the whole reason
 * `directedPaisa` exists: without it the display edge writes `residual < 0 ? -residual : …`,
 * and a negated local that is not money-named is invisible to the `DEC-MONEY-005` ban.
 */
export const rupeesFromPaisa = (amount: Paisa): { rupees: number } => {
  const a = asPaisaInt(amount, "rupeesFromPaisa amount"); // brands are compile-time only (18 §4)
  return { rupees: (a - (a % 100)) / 100 };
};

/** A signed money value split into the two things a screen needs to show it (`27-F12`). */
export type DirectedPaisa = { magnitudePaisa: Paisa; sign: -1 | 0 | 1 };

/**
 * Split a signed money quantity into a non-negative magnitude and its direction (`27-F12`).
 *
 * `Paisa` is non-negative because an append-only ledger cannot subtract from history — you
 * append the opposite. That is right, and it stays. But `01-F30`'s conservation residual is a
 * DIFFERENCE of two totals, and `invariants.ts` deliberately returns it unbranded and signed
 * because "a branded subtraction would throw exactly where the answer must be `true`". So the
 * signed value exists, is real, and had nowhere to go: `rupeesFromPaisa(residual)` throws for
 * every excess-tender order, which `DEC-MONEY-007` makes an ordinary state ("OVERPAID ₨1,850
 * — refund to close"), not an error.
 *
 * Both parts come back from ONE call on purpose. If the magnitude could be had without the
 * sign, a caller could render the magnitude alone and drop the direction — which is exactly
 * the `27-F12` failure this is meant to prevent, in a new costume.
 *
 * `sign` is a number, not a word: the vocabulary is surface-specific (`MoneyValue` says
 * refund/short/over/change; a stock variance wants different words), and English in the
 * kernel would collide with `00 §5.6`. The domain owns the arithmetic fact; the screen owns
 * the noun.
 *
 * `magnitudePaisa` is money-named so the `DEC-MONEY-005` ban can see arithmetic done on it —
 * the mistake `rupees` made.
 */
export const directedPaisa = (value: number): DirectedPaisa => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`directedPaisa value must be a safe integer, got ${value}`);
  }
  // `|| 0` normalises -0: `Number.isSafeInteger(-0)` is true and `-0 < 0` is false, so it
  // reaches here, and a -0 magnitude is a strict-equality trap for every consumer.
  const magnitude = Math.abs(value) || 0;
  return {
    magnitudePaisa: magnitude as Paisa,
    sign: value > 0 ? 1 : value < 0 ? -1 : 0,
  };
};
