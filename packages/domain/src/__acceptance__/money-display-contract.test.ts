// Acceptance tests — oracle review F5 / F6 / F4, the `rupeesFromPaisa` contract and the
// single integer-paisa guard.
//
// Authored from spec text + the fix-round decisions only (24 §3 step 2; read-only to the
// implementing session):
//   00 §6         — money = integer paisas held in a double; any operation that DIVIDES
//                   money goes through a `domain` helper with an explicit stated rounding
//                   policy whose parts provably sum back to the original total.
//   27-F23        — `Rs`, symbol-first; Western 3-digit grouping; NO decimals on
//                   operational screens. "No sub-rupee unit circulates."
//   16-F5         — the only place doc 16 speaks to sub-rupee precision: "integer paisas;
//                   rounding rules per authority spec". It does NOT require sub-rupee
//                   DISPLAY, which is why the `subPaisa` return field cites no resolving FR
//                   (Commandment 2) and comes off the type this round.
//   DEC-MONEY-005 — the ban that put this divide in `domain` in the first place.
//
// This file supersedes `money-display.test.ts`, which it deliberately does not edit
// (24 §3 step 2). NOTE FOR THE IMPLEMENTER: that file asserts on `subPaisa` at :44, :62-64
// and :70, so removing the field from the return type BREAKS it. It must be deleted as part
// of this round — its coverage is reproduced and widened below. Its stated contract is also
// self-contradictory today: the header at :12 claims reconstruction holds "for every safe
// integer, including negatives", while :15-19 and :51-57 say the brand rejects negatives and
// :31 generates `min: 0`. The corrected statement of the contract is the header of this file.
//
// WHAT CHANGED AND WHY, per finding:
//
// F5 — `subPaisa` comes off the return type. It had zero production consumers (the sole
//      caller, MoneyValue.tsx:49, destructures `rupees` alone), its justification cited no
//      resolving FR, and its name collided with the exported binary `subPaisa` subtraction
//      helper on the same public surface (index.ts:39) — one identifier, two meanings.
//      Removing it also disposes of F7: the field was the only path by which `-0` escaped.
//
// F6 — the superseded property test generated over `[0, 90_071_992_547_409]`, which is
//      MAX_SAFE_INTEGER/100: the maximum RUPEES used as the maximum PAISA. Measured, that
//      is 1.0000% of the brand's domain, and it never reaches the 2^53 neighbourhood that
//      standing law 3 names as *the* hazard. The generator below spans the full admitted
//      range, and a meta-assertion pins that it actually gets there — a coverage gap that
//      can silently return is not closed.
//
// F4 — `asInt` (money.ts:8) and `asPaisaInt` (invariants.ts:16) are the same predicate
//      declared twice in one SACRED package, whose rule is that a domain type is declared
//      once and "redeclaring a domain type elsewhere is a violation, not a convenience".
//      They agree today; the tests below catch them drifting apart again.
//
// RED/GREEN at authoring time. The honest split, because demanding red everywhere here would
// require pretending correct code is broken:
//   RED   — the F5 shape pins, and the F4 structural + message-identity pins.
//   GREEN — the F6 range and boundary pins. The implementation was already exact across the
//           whole admitted range (verified: 2,000,000 bigint-checked samples, 0 failures);
//           what was defective was the TEST's reach, not the arithmetic. These are coverage
//           guards, and they are labelled as such rather than dressed up as bug fixes.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Paisa, paisa, rupeesFromPaisa } from "../index";
import { settledConservationResidualPaisa } from "../invariants";

const P = (n: number) => paisa(n) as Paisa;

/** The reconstruction is checked in BigInt so the CHECK can never be the thing that drifts. */
const exact = (rupees: number): bigint => BigInt(rupees) * 100n;

describe("F5 — rupeesFromPaisa returns whole rupees and nothing else (27-F23, 16-F5)", () => {
  it("returns exactly one field, `rupees`", () => {
    // Pinned as the full key set, not just "no subPaisa": this is the whole return contract,
    // so it catches the removal AND any future speculative addition (24 §3b — minimum code
    // that closes the FR).
    expect(Object.keys(rupeesFromPaisa(P(125_000)))).toEqual(["rupees"]);
  });

  it("has no `subPaisa` field — 16-F5 requires integer paisas, not sub-rupee DISPLAY", () => {
    const result: Record<string, unknown> = rupeesFromPaisa(P(12_345));
    expect(result.subPaisa, "no resolving FR requires a sub-rupee display value").toBeUndefined();
    expect(Object.hasOwn(result, "subPaisa")).toBe(false);
  });

  it("the name `subPaisa` means the subtraction helper and only that (index.ts:39)", async () => {
    // The collision this closes: `subPaisa` was simultaneously an exported binary helper
    // `(a: Paisa, b: Paisa) => Paisa` and a returned remainder field. Any module doing
    // `const { subPaisa } = rupeesFromPaisa(x)` shadowed the helper.
    const domain = (await import("../index")) as Record<string, unknown>;
    expect(typeof domain.subPaisa, "the exported subPaisa is the subtraction helper").toBe(
      "function",
    );
    expect(Object.keys(rupeesFromPaisa(P(1)))).not.toContain("subPaisa");
  });
});

describe("F6 — the display divide is exact across the WHOLE admitted range (00 §6)", () => {
  it("COVERAGE META-PIN: the generator actually reaches the 2^53 neighbourhood", () => {
    // The defect this closes is not a wrong answer, it is a test that could not have found
    // one. The superseded suite capped at MAX_SAFE_INTEGER/100 — 1% of the domain — so the
    // hazard standing law 3 names was never generated. If someone narrows the bound again,
    // this fails before the property tests go quietly green on a fraction of the input space.
    const samples = fc.sample(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), 1000);
    expect(Math.max(...samples)).toBeGreaterThan(9_000_000_000_000_000);
    expect(
      samples.filter((n) => n > 1e15).length,
      "the top of the range must be sampled routinely, not once in a blue moon",
    ).toBeGreaterThan(100);
  });

  it("floors exactly: rupees*100 <= amount < (rupees+1)*100, for every admitted value", () => {
    // The contract WITHOUT the remainder. Losslessness was previously asserted by
    // reconstructing the input from `rupees` and `subPaisa`; with the remainder gone, the
    // property that pins the same exactness is the floor bracket. Checked in BigInt.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (n) => {
        const { rupees } = rupeesFromPaisa(P(n));
        const lo = exact(rupees);
        expect(lo <= BigInt(n) && BigInt(n) < lo + 100n).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it("never returns a float, at any magnitude in the admitted range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (n) => {
        const { rupees } = rupeesFromPaisa(P(n));
        expect(Number.isSafeInteger(rupees)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it("NO ROUNDING: a value one paisa below a rupee boundary does not round up (27-F23)", () => {
    // 27-F23 puts no decimals on operational screens, so the operational caller shows the
    // whole rupees and nothing else. Rs 1,249.99 must read Rs 1,249 — never Rs 1,250, which
    // would be the system quietly inventing a rupee the customer did not pay.
    expect(rupeesFromPaisa(P(124_999)).rupees).toBe(1249);
    expect(rupeesFromPaisa(P(99)).rupees).toBe(0);
    expect(rupeesFromPaisa(P(199)).rupees).toBe(1);
  });

  it("pins the boundaries a receipt actually hits", () => {
    expect(rupeesFromPaisa(P(0)).rupees).toBe(0);
    expect(rupeesFromPaisa(P(100)).rupees).toBe(1);
    expect(rupeesFromPaisa(P(125_000)).rupees).toBe(1250);
  });

  it("accepts MAX_SAFE_INTEGER — the top of the brand's domain is IN the contract", () => {
    expect(rupeesFromPaisa(P(Number.MAX_SAFE_INTEGER)).rupees).toBe(90_071_992_547_409);
  });

  it("rejects everything past exact-integer representation, and every non-integer (00 §6)", () => {
    // 2**53 is the named hazard of standing law 3 and was absent from the superseded suite
    // entirely. Past it, "integer paisas" stops being a claim the double can keep.
    const rejected: [string, number][] = [
      ["2**53 exactly", 2 ** 53],
      ["MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1],
      ["MAX_SAFE_INTEGER + 2", Number.MAX_SAFE_INTEGER + 2],
      ["a non-integer", 12.5],
      ["a value that is almost an integer", 100.0000000001],
      ["NaN", Number.NaN],
      ["+Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["a negative amount", -1],
      ["a negative total", -185_000],
    ];
    for (const [what, value] of rejected) {
      expect
        .soft(() => rupeesFromPaisa(value as Paisa), `${what} must be rejected, not rendered`)
        .toThrow(RangeError);
    }
  });
});

describe("F4 — ONE integer-paisa guard in `domain`, not two (18 §2, protected-path rule)", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sources = readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(join(SRC, f), "utf8")] as const);

  it("exactly one module declares the non-negative-safe-integer guard", () => {
    // Wording-independent: a guard is a module that both tests `Number.isSafeInteger` and
    // throws a `RangeError`. Today `money.ts` (asInt) and `invariants.ts` (asPaisaInt)
    // both do, with identical semantics and different message text.
    const declaring = sources
      .filter(([, src]) => src.includes("Number.isSafeInteger(") && src.includes("RangeError"))
      .map(([name]) => name);
    expect(declaring, `guard declared in: ${declaring.join(", ")}`).toHaveLength(1);
  });

  it("one guard means one message shape — the drift catcher", () => {
    // If the two guards are ever re-split, the message is where they diverge first: today
    // one says "must be a non-negative safe integer" and the other appends "of paisas".
    const shape = /^\S+ must be a non-negative safe integer, got -1$/;
    const messageOf = (fn: () => unknown): string => {
      try {
        fn();
        return "(did not throw)";
      } catch (error) {
        return (error as Error).message;
      }
    };
    const fromMoney = messageOf(() => paisa(-1));
    const fromInvariants = messageOf(() =>
      settledConservationResidualPaisa({
        billed_paisa: -1,
        tendered_paisa: 0,
        refunded_paisa: 0,
      }),
    );
    expect.soft(fromMoney, "money.ts guard message").toMatch(shape);
    expect.soft(fromInvariants, "invariants.ts guard message").toMatch(shape);
  });

  it("GREEN REGRESSION GUARD: both entry points accept and reject exactly the same values", () => {
    // Green today — the two guards agree on behaviour and differ only in wording. It stays
    // here because consolidating them must not change what either one admits.
    const probes = [
      0,
      1,
      -0,
      -1,
      12.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      2 ** 53,
      Number.MAX_SAFE_INTEGER,
    ];
    const throws = (fn: () => unknown): boolean => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    };
    for (const n of probes) {
      const viaMoney = throws(() => paisa(n));
      const viaInvariants = throws(() =>
        settledConservationResidualPaisa({
          billed_paisa: n,
          tendered_paisa: 0,
          refunded_paisa: 0,
        }),
      );
      expect.soft(viaInvariants, `the two guards must agree on ${n}`).toBe(viaMoney);
    }
  });
});
