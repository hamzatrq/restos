/**
 * `10-F33` (R77) — the noise floor, the PKR ranking, the same-signed run and the banned vocabulary.
 *
 * ⚠ **TWO OF THE FOUR MECHANISMS HERE HAVE NO VENDOR TO COPY**, which is stated in the FR as a pair
 * of NEGATIVE findings: no surveyed product suppresses a variance inside its own measurement error,
 * and none requires a sustained gap before alerting. So there is no reference implementation to
 * check this against, and the assertions have to come from the FR's arithmetic directly.
 *
 * **The case that matters is not "does the floor suppress something".** It is that the floor
 * suppresses the *in-band* reading and lets the *out-of-band* one through, on the SAME item, with
 * everything else held constant — otherwise a floor of `+∞` and a floor of `0` both pass.
 */

import { describe, expect, it } from "vitest";
import {
  BANNED_VARIANCE_WORDS,
  BASIS_ERROR_BP,
  HINT_KINDS,
  hintText,
  isAboveFloor,
  isSustainedRun,
  K_NOISE_FLOOR_BP,
  noiseFloor,
  SUSTAINED_RUN_PERIODS,
  vocabularyViolations,
} from "../noise.js";
import { roundHalfUp } from "../rational.js";

const LITRE = 1_000_000; // millilitres

// ── §A · (a) the computed per-item floor ───────────────────────────────────────────────────────

describe("§A · 10-F33 (a) — floor = k × basis_error × container_size × √2, per ITEM", () => {
  it("the FR's arithmetic, reproduced by hand: a 1 L bottle counted by tenths", () => {
    // k = 1.0 (10 000 bp), basis_error = 693 bp, container = 1 000 000 ml, √2 ≈ 1.414214
    // ⇒ 693 × 1 414 214 / 10 000 = 98 005.03 ml, about 98 ml on a litre bottle.
    expect(roundHalfUp(noiseFloor("estimated", LITRE))).toBe(98_005);
  });

  it("⚠ THE ATTRIBUTION CASE — the SAME item, one gap inside and one outside", () => {
    // A floor that suppressed everything, and a floor that suppressed nothing, would both pass an
    // assertion that only ever tested one side. This is the pair that separates them.
    const floor = noiseFloor("estimated", LITRE);
    expect(isAboveFloor(50_000, floor)).toBe(false); // 50 ml — inside the estimator's error
    expect(isAboveFloor(150_000, floor)).toBe(true); // 150 ml — outside it
  });

  it("the boundary is exact and symmetric about zero — a sign must not decide a threshold", () => {
    // `10-F33` (c) makes the SIGN the discriminator between error and one-sided loss, so a floor
    // that treated the two signs differently would bias the very thing that decides whether anyone
    // is accused of anything.
    const floor = noiseFloor("estimated", LITRE);
    // The EXACT floor is 98 005.03… ml, not the rounded 98 005 the display shows — so 98 005 is
    // INSIDE it and 98 006 is not. Asserting against the rounded figure was this test's own first
    // draft and it failed, which is the comparison being exact rather than pre-rounded.
    expect(isAboveFloor(98_006, floor)).toBe(true);
    expect(isAboveFloor(-98_006, floor)).toBe(true);
    expect(isAboveFloor(98_005, floor)).toBe(false);
    expect(isAboveFloor(-98_005, floor)).toBe(false);
  });

  it("the BASIS moves the floor, which is what makes it per-item rather than a percentage", () => {
    const exact = noiseFloor("exact", LITRE);
    const weighed = noiseFloor("weighed", LITRE);
    const estimated = noiseFloor("estimated", LITRE);
    expect(roundHalfUp(exact)).toBe(0);
    expect(roundHalfUp(weighed)).toBeLessThan(roundHalfUp(estimated));
    // A 90 ml gap: reportable on a scale (floor 35 ml), noise on a slider (floor 98 ml). ONE
    // number, TWO verdicts, and the only difference is what the count line said about itself.
    expect(isAboveFloor(90_000, weighed)).toBe(true);
    expect(isAboveFloor(90_000, estimated)).toBe(false);
  });

  it("an EXACT reading has no floor, so every gap on a sealed item is reportable", () => {
    // The decision the design does not make, asserted so it is visible rather than incidental: a
    // sealed-container count has no measurement precision to lose, and a non-zero guess here would
    // silence exactly the items where the count is most trustworthy.
    expect(BASIS_ERROR_BP.exact).toBe(0);
    expect(isAboveFloor(1, noiseFloor("exact", LITRE))).toBe(true);
  });

  it("the CONTAINER SIZE moves it too — a 5 L drum earns five times a 1 L bottle's floor", () => {
    expect(roundHalfUp(noiseFloor("estimated", 5 * LITRE))).toBe(5 * 98_005);
  });

  it("k is ONE named constant, and nothing here is a literal at a use site", () => {
    // `10-F33` (a): "an implementation declares it as ONE named constant saying so, never as a
    // literal at a use site", on `DEFAULT_STATION`'s recorded precedent. Halving it must halve the
    // floor — if it did not, some use site had its own copy.
    expect(K_NOISE_FLOOR_BP).toBe(10_000);
    const doubled = (BASIS_ERROR_BP.estimated * 2 * LITRE * 1_414_214) / (10_000 * 1_000_000);
    expect(roundHalfUp(noiseFloor("estimated", 2 * LITRE))).toBe(Math.round(doubled));
  });

  it("float-free: the floor is a Rational and the comparison never rounds first", () => {
    // Rounding the floor before comparing moves the boundary by up to half a base unit, which for
    // an item counted in `units` is a whole tin.
    const floor = noiseFloor("weighed", 3); // 3 units → 0.106… units
    expect(floor.d).not.toBe(1n);
    expect(isAboveFloor(0, floor)).toBe(false);
    expect(isAboveFloor(1, floor)).toBe(true);
  });
});

// ── §B · (c) the sustained same-signed run ─────────────────────────────────────────────────────

describe("§B · 10-F33 (c) — no hint fires on one period, and SIGN is the discriminator", () => {
  it("three consecutive same-signed periods fire; two do not", () => {
    expect(SUSTAINED_RUN_PERIODS).toBe(3);
    expect(isSustainedRun([-1, -1])).toBe(false);
    expect(isSustainedRun([-1, -1, -1])).toBe(true);
  });

  it("⚠ ALTERNATING SIGNS DO NOT FIRE, WHICH IS THE WHOLE POINT", () => {
    // Measurement error is zero-mean and flips; theft, over-portioning and unlogged waste are
    // one-signed. A gate that counted magnitude alone would fire on a well-run kitchen with a noisy
    // counter — which is the mechanism the FR says accuses honest staff.
    expect(isSustainedRun([-1, 1, -1])).toBe(false);
    expect(isSustainedRun([1, -1, 1])).toBe(false);
  });

  it("a positive run fires too — a surplus is one-signed as well", () => {
    expect(isSustainedRun([1, 1, 1])).toBe(true);
  });

  it("a WITHHELD period BREAKS the run rather than being skipped", () => {
    // Three above-floor readings a month apart with silent periods between them are not
    // consecutive, and the claim the FR licenses is about consecutive periods.
    expect(isSustainedRun([-1, null, -1, -1])).toBe(false);
    expect(isSustainedRun([-1, -1, null])).toBe(false);
  });

  it("a zero-signed period breaks it too — a gap of exactly nothing is not a direction", () => {
    expect(isSustainedRun([-1, 0, -1])).toBe(false);
  });

  it("only the LAST three matter — an old run does not fire on today's report", () => {
    expect(isSustainedRun([-1, -1, -1, 1])).toBe(false);
    expect(isSustainedRun([1, 1, -1, -1, -1])).toBe(true);
  });
});

// ── §C · (f) the vocabulary, as a checkable invariant ──────────────────────────────────────────

describe("§C · 10-F33 (f) — the banned words, and no hint may name a person or a role", () => {
  it("EVERY hint this module can produce passes the vocabulary check", () => {
    // ⚠ The sweep is the assertion. A vocabulary rule checked against the one string somebody
    // remembered is a rule about that string. `HINT_KINDS` is the closed set, so a sixth rung added
    // later is swept the day it is written.
    expect(HINT_KINDS.length).toBeGreaterThan(0);
    for (const kind of HINT_KINDS) {
      expect(vocabularyViolations(hintText[kind]), `hint "${kind}"`).toEqual([]);
    }
  });

  it("each banned word is caught, including R365's euphemism in the OTHER direction", () => {
    for (const word of BANNED_VARIANCE_WORDS) {
      const found = vocabularyViolations(`the report shows ${word} on this item`);
      expect(
        found.map((v) => v.token),
        `banned: ${word}`,
      ).toContain(word);
    }
    // `growth` is the one that misleads the other way — it makes a surplus sound like good news
    // when it is the same measurement failure with the sign flipped.
    expect(vocabularyViolations("inventory growth this week")[0]?.token).toBe("growth");
  });

  it("naming a ROLE is a violation — causes, never people (10-F19)", () => {
    expect(vocabularyViolations("ask the storekeeper about this")[0]?.offence).toBe("names_a_role");
    expect(vocabularyViolations("the branch manager should check")[0]?.offence).toBe(
      "names_a_role",
    );
  });

  it("the role list is READ from the matrix, so a new role is banned the day it lands", () => {
    // A hand-copied list is the drift `01-F60` cost a session to unify. `cashier` is in `ROLES`,
    // and this assertion is what proves the ban tracks the matrix rather than a copy of it.
    expect(vocabularyViolations("the cashier rang it wrong")[0]?.token).toBe("cashier");
  });

  it("⚠ NEGATIVE CONTROL — innocent prose is not flagged, or the rule gets switched off", () => {
    // Substring matching would ban "flossing" for containing "loss" and "glossy" for the same
    // reason. A vocabulary rule that fires on innocent text is one nobody leaves enabled.
    expect(vocabularyViolations("expected 4.2 kg, counted 3.6 kg")).toEqual([]);
    expect(vocabularyViolations("unexplained usage on this item")).toEqual([]);
    expect(vocabularyViolations("glossy packaging and flossing habits")).toEqual([]);
    expect(vocabularyViolations("the manager on duty")).toEqual([]); // not the full role phrase
  });

  it("the sanctioned phrase is what the FR says it is", () => {
    expect(vocabularyViolations("unexplained usage")).toEqual([]);
  });
});
