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
 * **The seams-rail debt marker that stood here is DELETED because `seams:check` now calls it
 * stale, and the deletion is required rather than tidy — a marker on something the rail considers
 * reached is a mute button.** It said this throwing sibling had no shipping caller, that every
 * live total runs the ingest path through `totalPaisaOrNull` because `01-F17` forbids a throw
 * there, and that a caller would appear "where a throw is correct: back-office and report
 * arithmetic (`specs/14`, `specs/12`)". The caller it predicted arrived from a third place —
 * `tax.ts`'s `taxSnapshot` (R39, `16-F5`) — where a throw is correct for exactly the stated
 * reason: settlement-time tax is not the ingest path `01-F17` protects.
 *
 * ⚠ **DO NOT READ THAT AS PAID, because the two are not the same claim.** `taxSnapshot` carries a
 * debt marker of its own: no shipping code calls it, so this function now has a caller in code the
 * product LOADS and still has none the product RUNS. The rail cannot express the difference — it
 * entered `tax.ts` on a TYPE-only import edge (`packages/escpos` names `TaxPosture`, which erases
 * at compile time) and cascaded reach onto every value that module imports. That is a permissive
 * blind spot worth knowing about: a type edge alone can retire a debt marker. The honest register
 * is `tax.ts`'s, and this paragraph is the pointer to it so nothing is lost at this end.
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
 * **The debt marker that stood here is DELETED because it was PAID, and the deletion is required
 * rather than tidy** — `pnpm seams:check` fails a marker on something shipping code reaches, so a
 * stale one is a mute button. It read *"Nothing in Wave 1 applies a RATE. Tax (`specs/16`),
 * aggregator commission (`specs/08`) and percentage discounts are the callers"*, and `eb559df`
 * landed the first: `apps/pos-electron/src/main/catalog.ts:128` applies `FOODPANDA_MARKUP_BPS`
 * through this function rather than writing `price * 1.3`, which is the whole point of law 3
 * having one door. Tax and percentage discounts are still owed and will come through here too.
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
 *
 * ⚠ **THAT REASONING IS INTACT AND ITS SCOPE IS NARROWER THAN IT READS — corrected August 2026
 * (`02-F63`, founder ruling R70).** It is the rule for a SCREEN, which is what `27-F23` says and
 * all this function is for; `MoneyValue` and the back office are its callers. It was also read as
 * the rule for PAPER, and there it truncated a customer's receipt: `packages/escpos`'s
 * `amountToken` rendered every money figure through here, so an `exclusive` tax — the first thing
 * this product ever produced that puts paisa in a total — printed `Subtotal Rs 450 · Tax Rs 74 ·
 * Total Rs 525`, three rows that do not close. Paper's door is `rupeesAndPaisaFromPaisa` below.
 * **Nothing about this function changed and nothing here is a licence to change it:** widening it
 * would put decimals back on the counter, which `27-F23` bans and `money-display-contract.test.ts`
 * §F5 pins at exactly one returned key.
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

/**
 * What the customer is CHARGED for a bill of `amount`, at the org's granularity step (`02-F63`,
 * founder ruling R70).
 *
 * **It is not a display rule.** R70: *"round to rupees … some restaurants round to 10s and some
 * round to rupees … even coins are getting rare."* The step is `00 §7` layer-2 org configuration
 * (`charge_rounding_paisa`, default 100), so it arrives as an argument and is never read from
 * anywhere by this function — `01-F87` bans a fold input keyed on configuration, and a helper that
 * resolved its own step would put the same hazard one layer down.
 *
 * ⚠ **THE NAME WAS `roundPaisaToGranularity` UNTIL `02-F63` (g) LANDED, AND THE RENAME IS THE
 * POINT RATHER THAN TIDYING.** With (g)'s floor this function no longer answers *the nearest
 * multiple* — at a step of 1,000 an input below 500 comes back as 1,000 and not 0 — so a name promising pure
 * rounding would be a name that lies about money, which this repo has already paid for three times
 * in comments. There is exactly one production caller (`packages/sync-client`'s
 * `orderChargeSnapshot`) and the old name has no surviving export, so nothing can reach the pure
 * rounding under a name that describes it.
 *
 * Policy, in the order it applies:
 *
 *  1. **ROUND-HALF-UP to the nearest multiple**, the policy `applyRateBps` already declares, so a
 *     charge and the tax inside it cannot round by two different rules (`02-F63` (d)). Always-down
 *     and always-up were both considered and refused there by name.
 *  2. **`02-F63` (g)'s FLOOR: a bill greater than zero is never charged nothing — and it defends an
 *     INVARIANT rather than a price.** `billed_total == 0` is a **sentinel** meaning *this order
 *     has nothing billable*: `settlement-guard.ts`'s `alreadySettled` and `settlement-closer.ts`'s
 *     `closingActFor` both narrow on `billed <= 0` and return nothing, because closing there would
 *     *"settle a sale that has not happened"* (`01-F17`). Below half a step, half-up answers `0` —
 *     so rounding made that sentinel reachable from a NON-empty order, food served and lines on the
 *     ledger, and three correct modules went on honouring a flag whose meaning had changed
 *     underneath them (`pay_total >= billed` holds at a tender of zero; `order.settlement_closed`
 *     is never emitted, so the order never reaches `01-F63`'s attestation and stays open for ever
 *     under `01-F1`; `02-F31` advances every line). A positive `amount` therefore floors at one
 *     step, at EVERY granularity — there is no small-bill trade to make and `02-F63` (g) refuses to
 *     argue it as one. **A zero `amount` stays zero**, because that is the sentinel's true case.
 *
 * Exact and float-free on all safe integers: the remainder is removed before anything is added, so
 * every intermediate is an exactly representable integer. A result past `Number.MAX_SAFE_INTEGER`
 * throws — the `sumPaisa` overflow idiom, never a drifted double. That is the settlement path's
 * policy and not the ingest path's: `01-F17`'s *"contribute zero, never throw"* protects a device
 * from a wedged ingest, and a charge computed at the settling act is not that path (`tax.ts` makes
 * the identical choice for the identical reason).
 *
 * A step of `1` is the identity — legal, and deliberately NOT the default: `02-F63` (c) records
 * that a default of no rounding is a till that asks for a coin which does not exist, and it is the
 * restaurant's own choice. The floor is invisible there, and invisible at the shipped Rs 1 step for
 * every `14-F29` whole-rupee menu, which is what keeps the amendment checkable.
 */
export const chargePaisaAtGranularity = (amount: Paisa, granularity_paisa: number): Paisa => {
  const a = asPaisaInt(amount, "chargePaisaAtGranularity amount"); // brands are compile-time (18 §4)
  const g = asPaisaInt(granularity_paisa, "chargePaisaAtGranularity granularity");
  if (g === 0) {
    throw new RangeError("chargePaisaAtGranularity granularity must be >= 1 paisa, got 0");
  }
  const r = a % g;
  // `2r >= g` rather than `r >= g / 2`: the halving is what would introduce a fraction, and on an
  // ODD step `g / 2` is not representable as an integer at all. Same trick as `extractedTaxPaisa`'s
  // doubling in `tax.ts`, and for the same reason.
  const rounded = 2 * r >= g ? a - r + g : a - r;
  // `02-F63` (g). `rounded === 0` on a positive `a` is exactly the case `2a < g` — a bill under
  // half a step — because `a >= g` forces `a - r >= g`. Written as the observable outcome ("the
  // charge came out at nothing") rather than as `2 * a < g`, so the guard reads as the thing it
  // refuses and cannot drift from the rounding above it.
  return paisa(a > 0 && rounded === 0 ? g : rounded);
};

/**
 * Whole rupees AND the sub-rupee remainder, for a document that may show it (`02-F63` (f)).
 *
 * **The sibling of `rupeesFromPaisa`, and the split between them is a SCOPE rather than a
 * preference.** `27-F23`'s *"no decimals"* is scoped to operational SCREENS, and `rupeesFromPaisa`
 * is the screen's door — `MoneyValue` and the back office read it, its contract is pinned at
 * exactly one key, and it stays truncating. Paper is not a screen: `02-F63` (f) settles that a
 * printed figure carrying a genuine sub-rupee part prints it, because the alternative shipped for
 * the life of the product and was **dropping** it — a receipt's *Total* short by up to 99 paisa and
 * `Subtotal + Tax` failing to equal `Total` by a rupee, on the document `02-F15` gives the customer.
 *
 * Both parts come back from ONE call, on `directedPaisa`'s stated precedent: if the rupees could be
 * had without the remainder, a caller could render the rupees alone — which is the truncation this
 * function exists to end, in a new costume.
 *
 * The remainder is `paisa_remainder` and not `subPaisa`: that name collided with the exported
 * binary subtraction helper on this same public surface, which is the defect an earlier version of
 * `rupeesFromPaisa` shipped and `money-display-contract.test.ts` still pins. It is money-named on
 * purpose, so `DEC-MONEY-005`'s ban can SEE arithmetic done on it — the mistake `rupees` made.
 *
 * Exact and float-free by construction: the remainder is `a % 100` and the quotient is computed
 * from `a` with that remainder already removed.
 */
export const rupeesAndPaisaFromPaisa = (
  amount: Paisa,
): { rupees: number; paisa_remainder: number } => {
  const a = asPaisaInt(amount, "rupeesAndPaisaFromPaisa amount"); // compile-time brands (18 §4)
  const r = a % 100;
  return { rupees: (a - r) / 100, paisa_remainder: r };
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
