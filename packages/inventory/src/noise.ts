/**
 * `10-F33` (R77) — **the module's central idea: a gap inside its own measurement error is not shown
 * as a gap, and no hint fires on one period.**
 *
 * Two of its four mechanisms have **no vendor to copy**, and the survey's two negative findings say
 * why: no surveyed product suppresses a variance inside its own measurement error, and none
 * requires a sustained gap before alerting. So (a) and (c) below are RestOS positions rather than
 * transcriptions, and there is no reference implementation to check this file against.
 *
 * **The reason it is not a reporting nicety.** The governing constraint is the founder's — entry
 * effort must not increase, or staff enter random values, and the system must still be accurate.
 * The resolution is that effort stays flat and the system knows how precise each entry is. The
 * second-order effect matters as much: **fabrication is driven by fear of the report.** Staff round
 * toward theory because an honest imprecise count gets them accused. A floor that makes an in-band
 * gap unaccusable removes the incentive to fabricate — one mechanism protecting the owner from a
 * false signal and the staff from a false charge.
 */

import type { CountBasis } from "@restos/domain";
import { ROLES } from "@restos/domain";
import { absAtLeast, type Rational, rational } from "./rational.js";

/**
 * ⚠ **`k` — THE ONE UNPINNED NUMBER IN THIS MODULE, AND IT IS DELIBERATE.**
 *
 * `10-F33` (a): *"`k` is DELIBERATELY UNPINNED: it is the multiple of the basis error at which a
 * reading becomes reportable, it needs a pilot's data, and pinning it in a spec would repeat
 * `DEFAULT_STATION`'s recorded mistake. An implementation declares it as ONE named constant saying
 * so, never as a literal at a use site."*
 *
 * `DEFAULT_STATION` is this corpus's own worked example: a value that was **pinned rather than
 * specified**, is still carried on the open-questions list, and is exactly what a literal at a use
 * site becomes — an unarguable number nobody can find. So: one declaration, here, named, with the
 * reason attached, and every use site reads it.
 *
 * **1.0 is a starting position and not an answer.** At `k = 1` a gap is shown once it exceeds one
 * standard measurement error of the reading it came from, which is the weakest defensible floor:
 * it suppresses only what is indistinguishable from noise and nothing more. A pilot's first four
 * weeks of counts is the data that moves it, and the direction it will move is **up** — every
 * measured term here (eyeball error ~7–12%, waste 4–10% of purchases) is larger than any plausible
 * theft rate, so `k = 1` will report more than a manager can act on.
 *
 * Expressed in basis points so the whole floor computation stays integer (see `noiseFloor`).
 */
export const K_NOISE_FLOOR_BP = 10_000;

/**
 * `10-F33` (a)'s `basis_error`, per `10-F29` basis.
 *
 * ⚠ **THE WEAKNESS OF THESE NUMBERS IS STATED HERE, WHERE THEY ARE DECLARED, BECAUSE THE FR
 * REQUIRES IT AND BECAUSE ANYTHING THAT IMPORTS THEM WOULD OTHERWISE INHERIT THEIR CONFIDENCE
 * SILENTLY.** `10-F33`'s own closing clause: *"the error figures behind `basis_error` rest on one
 * ten-bottle head-to-head rather than a study and must say so where they are declared."*
 *
 * - `estimated` — **693 bp (6.93%)**, the averaged error a published head-to-head measured for a
 *   tenths slider over **ten bottles**. That is one comparison, not a study. The same source
 *   measured **12%** on OPAQUE containers, and nothing in this schema models opacity, so an opaque
 *   bottle's floor here is roughly **half** what its real error deserves. That is the sharpest known
 *   gap in this table and it is a reference-data question (`10-F29` carries no opacity field), not
 *   an arithmetic one.
 * - `weighed` — **250 bp (2.5%)**, the midpoint of the same source's 2–3% for a Bluetooth scale.
 * - `exact` — **0 bp**, and this one is a DECISION the design does not make. A sealed-container
 *   count has no *measurement* precision to lose: whatever goes wrong is a miscount, which is a
 *   different error with a different distribution and no basis on which to size a floor. A non-zero
 *   guess here would suppress real gaps on exactly the items (sealed sachets, tins, eggs) where the
 *   count is trustworthy and the gap is most interpretable. So the floor for an `exact` item is
 *   zero and every gap above zero is reportable — which is right, and is why `k` alone cannot
 *   silence this module.
 */
export const BASIS_ERROR_BP: Readonly<Record<CountBasis, number>> = {
  exact: 0,
  weighed: 250,
  estimated: 693,
};

/**
 * √2, as an exact rational approximation to 7 significant figures.
 *
 * The factor is there because variance is a **difference of two counts** (`10-F18`: opening is the
 * prior close), so two independent readings of the same precision compound to `error × √2`. It is
 * irrational, and this module does no float arithmetic — not because a threshold could drift under
 * delivery order (it cannot; it is computed from reference data), but because the comparison
 * `|gap| >= floor` decides whether a row is shown to an owner, and a value that is *exactly* on the
 * boundary should land on the same side of it in every process that computes it.
 *
 * ⚠ **It is an APPROXIMATION and it is the conservative direction:** 1.414214 > √2, so the floor is
 * marginally wider than exact, which suppresses marginally more. On a mechanism whose whole purpose
 * is to avoid a false accusation, erring wide is the correct direction to err.
 */
const SQRT2_NUM = 1_414_214n;
const SQRT2_DEN = 1_000_000n;

/**
 * `10-F33` (a) — `floor ≈ k × basis_error × container_size × √2`, in **base units**, exactly.
 *
 * Returned as a `Rational` rather than a rounded integer so the comparison against a gap is made at
 * full precision. Rounding the floor first would move the boundary by up to half a base unit, which
 * matters for an item counted in `units` where one base unit is a whole tin.
 *
 * **`container_size_base` is the item's `count_units.primary_size_base`** — the error is an error
 * per *container reading*, which is what makes this floor per-item rather than a percentage. An item
 * with no container size (0) has no floor, and every gap on it is reportable.
 */
export const noiseFloor = (basis: CountBasis, container_size_base: number): Rational =>
  rational(
    BigInt(K_NOISE_FLOOR_BP) *
      BigInt(BASIS_ERROR_BP[basis]) *
      BigInt(Math.max(0, Math.trunc(container_size_base))) *
      SQRT2_NUM,
    10_000n * 10_000n * SQRT2_DEN,
  );

/** `|gap| >= floor` — exact, float-free. A gap strictly inside the floor has no reading. */
export const isAboveFloor = (gap_qty_base: number, floor: Rational): boolean =>
  absAtLeast(rational(BigInt(gap_qty_base), 1n), floor);

/**
 * `10-F33` (c) — *"about three consecutive periods above the item's floor with the same sign"*, at
 * `10-F20`'s 2–3×/week cadence, so roughly one week.
 *
 * The FR says "about three", so the number is a reading of it rather than a transcription; it is a
 * named constant for `K_NOISE_FLOOR_BP`'s reason, and unlike `k` it is not open — three is what the
 * FR's own arithmetic (~1 week at that cadence) resolves to.
 */
export const SUSTAINED_RUN_PERIODS = 3;

/**
 * `10-F33` (c)'s gate, over one item's history in period order (oldest first).
 *
 * **Sign is the discriminator.** Measurement error is zero-mean and flips; theft, over-portioning
 * and unlogged waste are one-signed. Every product surveyed alerts on a SINGLE period while its own
 * guidance says the trend is what matters, and that gap between advice and alerting is the
 * mechanism that accuses honest staff.
 *
 * `null` in the history — a period with no reading, whether uncounted, unresolvable or inside the
 * floor — **breaks the run rather than being skipped**. Skipping it would let three above-floor
 * readings a month apart, with two silent periods between them, present as a sustained run; the
 * claim the FR licenses is about *consecutive* periods.
 *
 * The array here carries **signs**, not magnitudes, because that is all the gate reads. Handing it
 * values would invite a later reader to add a magnitude condition that (b) already owns.
 */
export const isSustainedRun = (signs: readonly (-1 | 0 | 1 | null)[]): boolean => {
  const tail = signs.slice(-SUSTAINED_RUN_PERIODS);
  if (tail.length < SUSTAINED_RUN_PERIODS) return false;
  const first = tail[0];
  if (first === null || first === 0 || first === undefined) return false;
  return tail.every((sign) => sign === first);
};

// ── (f) the vocabulary, as a checkable invariant ───────────────────────────────────────────────

/**
 * `10-F33` (f) — **banned outright**, because this is a social problem before it is a technical
 * one.
 *
 * `shrinkage` is a loss-prevention word rather than an inventory-software one; `loss`, `theft` and
 * `missing` name a conclusion the data cannot support (§(h)'s arithmetic: a single-period item gap
 * below roughly 10–15% carries essentially no information about theft, because published waste is
 * 4–10% of purchases and eyeball counting contributes ~10% per period, both larger than any
 * plausible theft rate); and `growth` is the euphemism that misleads in the other direction.
 *
 * The sanctioned phrase is **"unexplained usage"**, and the sanctioned row form is
 * *"expected 4.2 kg, counted 3.6 kg"* — two measurements and no verb.
 */
export const BANNED_VARIANCE_WORDS = [
  "shrinkage",
  "shrink",
  "loss",
  "losses",
  "theft",
  "stolen",
  "missing",
  "growth",
] as const;

export type VocabularyViolation = {
  readonly text: string;
  readonly offence: "banned_word" | "names_a_role";
  readonly token: string;
};

/**
 * `10-F33` (f)'s *"checkable invariant: no hint may name a person or a role"*, plus the banned list.
 *
 * **The role half reads `ROLES` from `packages/domain` rather than a hand-copy**, so a role added
 * to the matrix is banned here the same day (`18 §2`; a hand-copied list is the drift `01-F60` cost
 * a session to unify). It cannot see a *person's* name — no list can — so the enforcement for that
 * half is structural and lives at the call sites: nothing in `variance.ts` ever puts an
 * `actor_user_id` into a hint, and `10-F19`'s attribution is to CAUSES.
 *
 * Word-boundary matching on a lowercased copy: substring matching would ban "flossing" for
 * containing "loss", and a rule that fires on innocent text gets switched off.
 */
export const vocabularyViolations = (text: string): readonly VocabularyViolation[] => {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const out: VocabularyViolation[] = [];
  for (const banned of BANNED_VARIANCE_WORDS) {
    if (tokens.includes(banned)) out.push({ text, offence: "banned_word", token: banned });
  }
  for (const role of ROLES) {
    // `branch_manager` splits into two tokens on the boundary rule above, so the role is matched on
    // its words rather than its identifier — which is what a hint would actually say in prose.
    const words = role.split("_");
    if (words.every((word) => tokens.includes(word))) {
      out.push({ text, offence: "names_a_role", token: role });
    }
  }
  return out;
};

// ── (g) the investigation ladder, data-first, theft last ───────────────────────────────────────

/**
 * `10-F33` (g), in the FR's own order. **Theft is not a rung** — the ladder ends at the portioning
 * signature, and what a manager does past that is not a thing this module says.
 */
export const HINT_KINDS = [
  "not_counted_or_estimated",
  "receiving_discrepancy",
  "recipe_or_cost_changed",
  "no_wastage_logged",
  "proportional_to_volume",
] as const;
export type HintKind = (typeof HINT_KINDS)[number];

export type Hint = {
  readonly kind: HintKind;
  readonly item_id: string;
  /** Rendered text. Every one of these passes `vocabularyViolations` — asserted, not assumed. */
  readonly text: string;
};

/**
 * The rendered form of each rung. Declared as data so the oracle can sweep **every** hint this
 * module can produce through `vocabularyViolations` — a vocabulary rule with no sweep is a rule
 * about the one string somebody remembered to check.
 */
export const hintText: Readonly<Record<HintKind, string>> = {
  not_counted_or_estimated:
    "this item's reading was estimated rather than measured, so part of the gap is the estimate",
  receiving_discrepancy: "a delivery this period was received short of what was sent",
  recipe_or_cost_changed: "a recipe or a cost changed inside this period, so the two ends differ",
  no_wastage_logged:
    "nothing was logged as thrown away for this item. Published waste runs 4-10% of purchases, " +
    "so the first thing to try is the waste button at the point of discard",
  proportional_to_volume: "the gap tracks how much was sold, which is the portioning signature",
};
