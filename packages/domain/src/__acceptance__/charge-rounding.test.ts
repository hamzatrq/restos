// ACCEPTANCE TESTS — `02-F63` (founder ruling R70): the charge is rounded to the org's
// granularity, and a printed figure tells the truth about its paisa.
//
// **`packages/domain` is a PROTECTED path (commandment 10) and this is MONEY tier.** Written
// alongside the implementation under `plans/v0.md`'s R66, which lifts `24 §3`'s separate-oracle
// rule for v0 and replaces it with a mutation obligation: every section below names the mutant it
// kills, and the matrix is reported with the change. The round-3 law is NOT lifted.
//
// ── THE FR AND THE RULING, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ──────────────────────────
//
//   R70      "round to rupees … some restaurants round to 10s and some round to rupees. some
//            restaurants show paisa but the waiter when charging charges in rupees because there
//            is no concept of paisa. even coins are getting rare."
//   02-F63   the charge is rounded INSIDE `billed_total`; the granularity is layer-2 org
//            configuration (`charge_rounding_paisa`, default 100); (d) the policy is ROUND-HALF-UP
//            to the nearest multiple, `00 §6`'s existing policy rather than a second one;
//            (f) showing paisa and charging paisa are separable; **(g) "when `16-F5`'s snapshot
//            total is greater than zero, `billed_total` is at least one granularity step — so a
//            non-empty order can never present as an empty one." A total of exactly zero stays
//            zero, "because that is the sentinel's TRUE case."**
//   27-F23   "no decimals **on operational screens**" — a SCOPE, and paper is not one.
//   00 §6    integer paisas; the paisa→rupee divide is `domain`'s, never a formatter's.
//   01-F17   never block a sale (and why a THROW here is not that path — see §D). It is also (g)'s
//            other half: `billed <= 0` returning *nothing* is CORRECT for an empty order —
//            "closing it would settle a sale that has not happened" — and is untouchable.
//
// ── WHAT THIS FILE DOES NOT ASSERT, AND WHO OWNS IT ───────────────────────────────────────────
//
//  - **Where the granularity comes from.** `02-F63` (c) makes it layer-2 configuration carried by
//    `01-F87`'s `config` resource; that carrier is not built (`plans/v0.md` gap 3) and the v0 seed
//    is `apps/pos-electron/src/main/tax-posture.ts`, asserted there.
//  - **That anything CALLS these.** The join is `packages/sync-client`'s `orderChargeSnapshot` and
//    the seam is `apps/pos-electron`; both have their own suites. A correct helper with no caller
//    is this wave's named defect and no assertion here can see it.

import { describe, expect, it } from "vitest";
import {
  chargePaisaAtGranularity,
  type Paisa,
  paisa,
  rupeesAndPaisaFromPaisa,
  rupeesFromPaisa,
} from "../index";

const P = (n: number): Paisa => paisa(n);

/** `02-F63` (c)'s default, and `27-F23`'s unit: one rupee. */
const RUPEE = 100;
/** R70's other named case: *"some restaurants round to 10s"*. */
const TEN_RUPEES = 1_000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE POLICY. Half-up to the nearest multiple, and it is `applyRateBps`'s policy.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F63 (d) — ROUND-HALF-UP to the nearest multiple", () => {
  it("rounds to the nearer multiple, in both directions, at the rupee", () => {
    // MUTANT THIS KILLS: always-DOWN (truncation — the shipped defect one layer out) and
    // always-UP. Both are named and refused in `02-F63` (d), and each gives away or takes up to
    // one step on every bill in the country.
    expect(chargePaisaAtGranularity(P(45_049), RUPEE), "down").toBe(45_000);
    expect(chargePaisaAtGranularity(P(45_051), RUPEE), "up").toBe(45_100);
  });

  it("the HALF goes UP — 50 paisa is the discriminating case and nothing else is", () => {
    // The one input where half-up, half-down and half-to-even all disagree. `applyRateBps` and
    // `extractedTaxPaisa` both declare half-up, so a charge rounded any other way would put two
    // rounding rules inside one number.
    expect(chargePaisaAtGranularity(P(50), RUPEE)).toBe(100);
    expect(chargePaisaAtGranularity(P(150), RUPEE), "half-to-EVEN would answer 100").toBe(200);
    expect(chargePaisaAtGranularity(P(250), RUPEE), "half-to-EVEN would answer 200").toBe(300);
    // ⚠ **THIS ROW READ `chargePaisaAtGranularity(P(49), RUPEE) === 0` UNTIL `02-F63` (g).** Just
    // under the half still rounds DOWN — that is what this assertion is for — but 49 paisa is
    // ALSO under one whole step, so at the rupee it now floors to 100 and can no longer tell
    // half-down from half-up. 149 is the same claim on an input the floor does not touch.
    expect(chargePaisaAtGranularity(P(149), RUPEE), "just under the half rounds down").toBe(100);
  });

  it("R70's OTHER granularity is the same rule at a different step — tens of rupees", () => {
    // MUTANT THIS KILLS: a hardcoded 100. R70 names two cases in one sentence and the whole point
    // of `02-F63` (c) is that the step is the owner's; an implementation pinned to the rupee
    // passes every rupee-granularity assertion in this file.
    expect(chargePaisaAtGranularity(P(76_400), TEN_RUPEES), "Rs 764 → Rs 760").toBe(76_000);
    expect(chargePaisaAtGranularity(P(76_500), TEN_RUPEES), "the half, up").toBe(77_000);
    expect(chargePaisaAtGranularity(P(76_501), TEN_RUPEES)).toBe(77_000);
  });

  it("a step of 1 paisa is the IDENTITY, and it is legal", () => {
    // Used by every pre-`02-F63` assertion in `order-tax.test.ts` to keep measuring what it was
    // written to measure. It is legal and it is NOT the default — `02-F63` (c).
    for (const n of [0, 1, 99, 45_070, 52_507, Number.MAX_SAFE_INTEGER]) {
      expect(chargePaisaAtGranularity(P(n), 1), `${n}`).toBe(n);
    }
  });

  it("R70's worked example lands on the rupee the founder named", () => {
    // One line of Rs 450.70 at 16.5 %: base 45,070 · tax 7,437 · pre-rounding total 52,507.
    // The bill R70 was ruled on. `Rs 525.07` is a coin that does not exist.
    expect(chargePaisaAtGranularity(P(52_507), RUPEE)).toBe(52_500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE PROPERTIES, over a sweep. These are what a mutant cannot satisfy by luck.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A spread with awkward remainders at every step size, plus the exact boundaries. */
const SWEEP: readonly number[] = [
  0, 1, 49, 50, 51, 99, 100, 101, 149, 150, 499, 500, 501, 999, 1_000, 1_001, 1_499, 1_500, 45_070,
  52_507, 76_499, 76_500, 111_360, 999_999, 1_000_000, 8_640_000_133,
];

const STEPS: readonly number[] = [1, 5, 25, RUPEE, 500, TEN_RUPEES, 10_000];

describe("§B 02-F63 — the three properties every rounded charge must have", () => {
  it("the result is ALWAYS an exact multiple of the step", () => {
    // MUTANT THIS KILLS: any float path. `amount / g` in doubles is not exact, and the first
    // figure it gets wrong is a rupee on a customer's bill (`00 §6`, `DEC-MONEY-005`).
    for (const step of STEPS) {
      for (const n of SWEEP) {
        const out = chargePaisaAtGranularity(P(n), step);
        expect(out % step, `${n} @ ${step} is not a multiple`).toBe(0);
      }
    }
  });

  it("it never moves the charge by MORE than half a step — ABOVE `02-F63` (g)'s floor", () => {
    // MUTANT THIS KILLS: rounding to the next multiple UP unconditionally (a full step of
    // over-charge), and rounding down unconditionally (a full step given away).
    //
    // ⚠ **`02-F63` (g) PUTS A HOLE IN THIS PROPERTY AND THE HOLE IS ASSERTED RATHER THAN
    // EXEMPTED.** A positive bill under half a step is floored to one step, which moves it by
    // more than half a step ON PURPOSE — so that arm gets an equality (`out === step`) and not a
    // `continue`. A skipped case is a case a mutant can live in.
    for (const step of STEPS) {
      for (const n of SWEEP) {
        const out = chargePaisaAtGranularity(P(n), step);
        if (n > 0 && n * 2 < step) {
          expect(out, `${n} @ ${step}: the floor did not fire`).toBe(step);
          continue;
        }
        const moved = Number(BigInt(out) - BigInt(n));
        expect(Math.abs(moved) * 2, `${n} @ ${step} moved ${moved}`).toBeLessThanOrEqual(step);
      }
    }
  });

  it("`02-F63` (g): NOTHING BILLABLE IS EVER CHARGED NOTHING, and zero stays zero", () => {
    // ⚠ **THE PROPERTY THIS WHOLE AMENDMENT EXISTS FOR, over the same sweep — and it is an
    // INVARIANT, not a pricing rule.** `billed_total == 0` is a **sentinel** meaning *this order
    // has nothing billable*: `settlement-guard.ts` and `settlement-closer.ts` both narrow on
    // `billed <= 0` and return nothing, because closing there would *"settle a sale that has not
    // happened"* (`01-F17`). Before (g), half-up answered 0 for every bill under half a step — so
    // the sentinel became reachable from a NON-empty order, and three correct modules went on
    // honouring a flag whose meaning had changed underneath them (`pay_total >= billed` holds at a
    // tender of zero; `order.settlement_closed` is never emitted, so the order never reaches
    // `01-F63`'s attestation and stays open for ever under `01-F1`; `02-F31` advances every line).
    //
    // MUTANT THIS KILLS (X1's inverse): the pre-(g) tree — no floor at all. It also kills the
    // over-correction, a floor applied to a ZERO bill: an all-comped order is a real order and
    // charging it one step invents money the ledger has no line for. The `toBe(n === 0)` form is
    // what holds BOTH directions in one assertion; `toBeGreaterThan(0)` would bless the second.
    for (const step of STEPS) {
      for (const n of SWEEP) {
        const out = chargePaisaAtGranularity(P(n), step);
        expect(out === 0, `${n} @ ${step}: charged ${out} for a bill of ${n}`).toBe(n === 0);
      }
    }
  });

  it("`02-F63` (g): the boundary case — anything under half a step comes back as one step", () => {
    // The reproduction, verbatim: `chargePaisaAtGranularity(400, 1000)` answered **0**.
    //
    // ⚠ **THESE ARE ARITHMETIC BOUNDARIES, NOT A CLAIM ABOUT PRICES, and the distinction is a
    // founder correction (August 2026):** *"nothing costs 4rs … even the basic transparent plastic
    // box in which you deliver food costs around 15-20rs."* The amendment is NOT a trade against
    // cheap items — `02-F63` (g) refuses to be argued that way — which is precisely why the floor
    // binds at every granularity rather than only where a sub-step bill would be plausible. The
    // inputs below are chosen because they are the discriminating ones for the branch.
    expect(chargePaisaAtGranularity(P(400), TEN_RUPEES), "below half a step").toBe(1_000);
    expect(chargePaisaAtGranularity(P(499), TEN_RUPEES), "just under half a step").toBe(1_000);
    expect(chargePaisaAtGranularity(P(1), 10_000), "one paisa at a Rs 100 step").toBe(10_000);
    expect(chargePaisaAtGranularity(P(49), RUPEE), "49 paisa at the rupee").toBe(100);
    // The floor is INVISIBLE at the shipped default over every `14-F29` whole-rupee menu, which is
    // the property that keeps this amendment checkable — it changes nothing an org sees today.
    expect(chargePaisaAtGranularity(P(0), TEN_RUPEES), "an emptied order stays zero").toBe(0);
    expect(chargePaisaAtGranularity(P(0), RUPEE)).toBe(0);
    expect(chargePaisaAtGranularity(P(45_000), RUPEE), "Rs 450 at the rupee").toBe(45_000);
  });

  it("it is IDEMPOTENT — a charge already on the step does not move", () => {
    // MUTANT THIS KILLS: `a - r + g` with no half test (always up), which shifts an exact
    // multiple by a whole step. It is the arithmetic slip a careful reader will not see.
    for (const step of STEPS) {
      for (const n of SWEEP) {
        const once = chargePaisaAtGranularity(P(n), step);
        expect(chargePaisaAtGranularity(P(once), step), `${n} @ ${step}`).toBe(once);
      }
    }
  });

  it("it is EXACT at the top of the safe-integer range, where a float path drifts", () => {
    // `DEC-MONEY-005`: "integer paisas" are integers stored in a double. 2^53 − 1 is where a
    // divide-and-multiply implementation stops agreeing with integer arithmetic.
    const top = Number.MAX_SAFE_INTEGER; // 9_007_199_254_740_991 — remainder 91 at the rupee
    const onStep = top - 91; // …740_900, an exact multiple of 100
    expect(chargePaisaAtGranularity(P(onStep), RUPEE), "already on the step").toBe(onStep);
    expect(chargePaisaAtGranularity(P(top - 42), RUPEE), "…949 rounds down").toBe(onStep);
    // The HALF at the top of the range: …850 rounds UP, and the answer is still representable.
    expect(chargePaisaAtGranularity(P(top - 141), RUPEE), "…850 rounds up").toBe(onStep);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE DISPLAY SPLIT. `02-F63` (f): showing paisa and charging paisa are separable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F63 (f) — rupees AND the sub-rupee remainder, from one call", () => {
  it("splits a figure the way a receipt reads it", () => {
    expect(rupeesAndPaisaFromPaisa(P(45_070))).toEqual({ rupees: 450, paisa_remainder: 70 });
    expect(rupeesAndPaisaFromPaisa(P(52_507))).toEqual({ rupees: 525, paisa_remainder: 7 });
    expect(rupeesAndPaisaFromPaisa(P(99))).toEqual({ rupees: 0, paisa_remainder: 99 });
    expect(rupeesAndPaisaFromPaisa(P(100))).toEqual({ rupees: 1, paisa_remainder: 0 });
    expect(rupeesAndPaisaFromPaisa(P(0))).toEqual({ rupees: 0, paisa_remainder: 0 });
  });

  it("NOTHING IS LOST — the two parts reconstruct the input exactly, on every fixture", () => {
    // ⚠ **THE DEFECT R70 WAS RULED ON, AS A PROPERTY.** `rupeesFromPaisa` returns the rupees and
    // nothing else, and `packages/escpos`'s `amountToken` rendered through it — so a receipt's
    // *Total* was short by up to 99 paisa and `Subtotal + Tax = Total` was false on the paper by a
    // rupee. MUTANT THIS KILLS: any implementation that drops, rounds or clamps the remainder.
    for (const n of [...SWEEP, 45_071, 45_099, 7_437, 15_360]) {
      const split = rupeesAndPaisaFromPaisa(P(n));
      const rebuilt = Number(BigInt(split.rupees) * 100n + BigInt(split.paisa_remainder));
      expect(rebuilt, `${n} did not reconstruct`).toBe(n);
      expect(split.paisa_remainder, `${n}: remainder out of range`).toBeGreaterThanOrEqual(0);
      expect(split.paisa_remainder, `${n}: remainder out of range`).toBeLessThan(100);
    }
  });

  it("the SCREEN door and the PAPER door agree about the rupees, on every fixture", () => {
    // MUTANT THIS KILLS: a paper split that ROUNDS to the nearest rupee instead of truncating.
    // `27-F23` keeps the screen at whole rupees and `MoneyValue` reads `rupeesFromPaisa`; if the
    // two doors disagreed, a cashier's screen and the customer's paper would show different
    // rupees for one figure — which is the drift having two doors is supposed to prevent.
    for (const n of [...SWEEP, 45_071, 45_099, 7_437, 15_360]) {
      expect(rupeesAndPaisaFromPaisa(P(n)).rupees, `${n}`).toBe(rupeesFromPaisa(P(n)).rupees);
    }
  });

  it("the remainder is NOT called `subPaisa`, because that name is already taken here", () => {
    // `money.ts` records the collision: an earlier version of `rupeesFromPaisa` returned a
    // `subPaisa` key on the same public surface as the binary `subPaisa` subtraction helper, so
    // `const { subPaisa } = …` shadowed it. `money-display-contract.test.ts` §F5 pins the other
    // half (that `rupeesFromPaisa` still returns exactly one key); this pins that the sibling did
    // not re-introduce the shadow.
    expect(Object.keys(rupeesAndPaisaFromPaisa(P(45_070))).sort()).toEqual([
      "paisa_remainder",
      "rupees",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE REFUSALS. What is refused at the boundary, and why a THROW is not an `01-F17` break.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 00 §6 — malformed money and a malformed step are REFUSED, never coerced", () => {
  it("a step of ZERO is refused by name", () => {
    // MUTANT THIS KILLS: `a % 0` is `NaN`, and `paisa(NaN)` would throw with a message naming
    // neither the step nor the operator who typed it. The refusal has to be here, where the
    // caller's own argument is in scope.
    expect(() => chargePaisaAtGranularity(P(45_070), 0)).toThrow(/>= 1 paisa/);
  });

  it("a negative or fractional step is refused", () => {
    for (const bad of [-1, -100, 0.5, 100.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => chargePaisaAtGranularity(P(45_070), bad), `${bad}`).toThrow(RangeError);
    }
  });

  it("a fractional or negative AMOUNT is refused rather than silently rounded", () => {
    // `01-F53` freezes a captured price; a helper that quietly rounded a float into an
    // `01-F1`-permanent charge would hide the defect that produced the float.
    for (const bad of [-1, 0.5, 45_070.5, Number.NaN]) {
      expect(() => chargePaisaAtGranularity(bad as Paisa, RUPEE), `${bad}`).toThrow(RangeError);
      expect(() => rupeesAndPaisaFromPaisa(bad as Paisa), `${bad}`).toThrow(RangeError);
    }
  });

  it("a rounding that would leave the safe-integer range THROWS, on the `sumPaisa` idiom", () => {
    // Not an `01-F17` break: that FR protects a device from a WEDGED INGEST, and a charge computed
    // at the settling act is not that path — `tax.ts` makes the identical choice for the identical
    // reason and `order-tax.ts` names the divergence. Reachable only above Rs 90,000,000,000,000.
    expect(() => chargePaisaAtGranularity(P(Number.MAX_SAFE_INTEGER), RUPEE)).toThrow(RangeError);
  });
});
