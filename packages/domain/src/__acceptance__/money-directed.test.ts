// Acceptance tests — oracle review F2: signed money needs a home in `domain`.
//
// Authored from spec text + the fix-round decision only (24 §3 step 2; read-only to the
// implementing session):
//   27-F12        — "Colour never carries state alone. Every status is colour + shape +
//                   position + a number." Direction is a WORD, never a bare minus sign: a
//                   lone `-` is one glyph wide, is the first thing lost at 1–2 m or on a
//                   scratched panel, and means nothing to a non-reader.
//   01-F30        — the conservation equation, "executable in packages/domain".
//   DEC-MONEY-007 — "A khata regular paying their ₨1,850 tab makes every screen read
//                   OVERPAID ₨1,850 — refund to close." Overpayment is a modelled state.
//   05-F20        — cashier over/short results appear on the manager console; variance
//                   beyond threshold is highlighted.
//   13-F14a       — `cash.variance` and `stock.variance_value` are named alert classes.
//
// THE FINDING THIS CLOSES. `Paisa` is non-negative and stays that way — the brand is right
// for an append-only ledger, and every event payload agrees (registry.ts:32/33/78/90 are all
// `.nonnegative()`). But `domain` ALREADY PRODUCES A SIGNED MONEY VALUE:
// `settledConservationResidualPaisa` (invariants.ts:74) returns `billed − (tendered −
// refunded)`, and invariants.ts:63-68 makes the sign load-bearing — `> 0` shortfall, `= 0`
// conserved, `< 0` excess tender. invariants.ts:37-39 states the reason plainly: "a branded
// subtraction would throw exactly where the answer must be `true`."
//
// So the display helper cannot render the one signed money quantity the domain computes.
// `rupeesFromPaisa(residual)` throws for every excess-tender order — measured. Without a
// home for the signed case, the first screen that shows a variance writes
// `residual < 0 ? format(-residual) : format(residual)` at the display edge, and `-residual`
// is raw arithmetic on money that the F1 ban cannot see once the local is not money-named.
// F1 and F2 compose into that one line; this file removes the need to write it.
//
// THE CONTRACT BEING SPECIFIED.
//
//   export type DirectedPaisa = { magnitudePaisa: Paisa; sign: -1 | 0 | 1 };
//   export const directedPaisa = (value: number): DirectedPaisa;
//
// Three deliberate choices, stated so the implementer can push back on them rather than
// discover them (24 §3b — surface assumptions, name the simpler alternative):
//
//  1. ONE call returns BOTH parts. The simpler alternative is two helpers — a `magnitude`
//     and a `sign`. It is rejected: if the magnitude can be obtained without the sign, a
//     caller can render the magnitude alone and silently drop the direction, which is
//     exactly the failure 27-F12 exists to prevent, reappearing in a new costume. Making
//     them arrive together means a caller holding a number to render is also holding the
//     direction it needs to render beside it.
//
//  2. The magnitude field is NAMED `magnitudePaisa`, not `magnitude`. A field called
//     `magnitude` would be invisible to the DEC-MONEY-005 ban for exactly the reason
//     `rupees` was (F1), and this round would open a new hole while closing the old one.
//     That naming is pinned by the lint fixture, not here — see
//     `__fixtures__/rupee-arithmetic.fixture.txt`, case "the F2 companion".
//
//  3. `sign` is `-1 | 0 | 1`, not a word. The direction VOCABULARY is app-specific —
//     `MoneyValue`'s prop is `"refund" | "short" | "over" | "change"` (MoneyValue.tsx:27),
//     and a stock variance or a margin would want different words. `domain` owns the
//     arithmetic fact; the surface owns the noun. Putting English in the kernel would also
//     collide with 00 §5.6.
//
// RED at authoring time: the whole file — `directedPaisa` does not exist yet.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { directedPaisa, type Paisa, paisa, rupeesFromPaisa } from "../index";
import { settledConservationResidualPaisa } from "../invariants";

describe("F2 — directedPaisa splits a signed money value into magnitude + direction (27-F12)", () => {
  it("returns exactly `magnitudePaisa` and `sign`", () => {
    expect(Object.keys(directedPaisa(-185_000)).sort()).toEqual(["magnitudePaisa", "sign"]);
  });

  it("accepts a NEGATIVE value — which is the entire point of it existing", () => {
    // rupeesFromPaisa throws here; that is F2. This is the function that does not.
    expect(directedPaisa(-185_000)).toEqual({ magnitudePaisa: 185_000, sign: -1 });
    expect(directedPaisa(185_000)).toEqual({ magnitudePaisa: 185_000, sign: 1 });
    expect(directedPaisa(0)).toEqual({ magnitudePaisa: 0, sign: 0 });
  });

  it("normalises -0 to a positive zero magnitude and a zero sign", () => {
    // F7: `asInt` admits -0 (Number.isSafeInteger(-0) is true and -0 < 0 is false), and the
    // superseded return type leaked it through `subPaisa`. A magnitude of -0 would be a
    // strict-equality trap for every downstream consumer.
    const d = directedPaisa(-0);
    expect(d.sign).toBe(0);
    expect(Object.is(d.magnitudePaisa, -0), "magnitude must be POSITIVE zero").toBe(false);
    expect(Object.is(d.magnitudePaisa, 0)).toBe(true);
  });

  it("magnitude × sign reconstructs the input exactly, across the full signed range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
        (n) => {
          const { magnitudePaisa, sign } = directedPaisa(n);
          // BigInt so the check cannot be the thing that drifts.
          expect(BigInt(sign) * BigInt(magnitudePaisa)).toBe(BigInt(n));
          expect(Number.isSafeInteger(magnitudePaisa) && magnitudePaisa >= 0).toBe(true);
          expect([-1, 0, 1]).toContain(sign);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("the magnitude it returns is directly renderable — no cast, no negation at the edge", () => {
    // The composition that F2 is about. `magnitudePaisa` is a `Paisa`, so it feeds
    // `rupeesFromPaisa` with no cast and no `-residual` anywhere.
    fc.assert(
      fc.property(
        fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
        (n) => {
          const { magnitudePaisa } = directedPaisa(n);
          expect(() => rupeesFromPaisa(magnitudePaisa)).not.toThrow();
        },
      ),
      { numRuns: 500 },
    );
  });

  it("accepts both extremes of the admitted range", () => {
    expect(directedPaisa(Number.MAX_SAFE_INTEGER).sign).toBe(1);
    expect(directedPaisa(-Number.MAX_SAFE_INTEGER)).toEqual({
      magnitudePaisa: Number.MAX_SAFE_INTEGER,
      sign: -1,
    });
  });

  it("rejects everything outside exact-integer representation, in BOTH directions (00 §6)", () => {
    const rejected: [string, number][] = [
      ["2**53", 2 ** 53],
      ["-(2**53)", -(2 ** 53)],
      ["MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1],
      ["-MAX_SAFE_INTEGER - 1", -Number.MAX_SAFE_INTEGER - 1],
      ["a non-integer", 12.5],
      ["a negative non-integer", -12.5],
      ["NaN", Number.NaN],
      ["+Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
    ];
    for (const [what, value] of rejected) {
      expect.soft(() => directedPaisa(value), `${what} must be rejected`).toThrow(RangeError);
    }
  });
});

describe("F2 — against the REAL signed producer, settledConservationResidualPaisa (01-F30)", () => {
  // Not a synthetic number: these are the three residual states invariants.ts:63-68 declares,
  // driven through the shipped function.

  it("SHORTFALL (residual > 0) reads as a positive magnitude with a +1 direction", () => {
    const residual = settledConservationResidualPaisa({
      billed_paisa: 100_000,
      tendered_paisa: 60_000,
      refunded_paisa: 0,
    });
    expect(residual).toBe(40_000);
    expect(directedPaisa(residual)).toEqual({ magnitudePaisa: 40_000, sign: 1 });
    expect(rupeesFromPaisa(directedPaisa(residual).magnitudePaisa).rupees).toBe(400);
  });

  it("CONSERVED (residual = 0) has no direction to render", () => {
    const residual = settledConservationResidualPaisa({
      billed_paisa: 100_000,
      tendered_paisa: 100_000,
      refunded_paisa: 0,
    });
    expect(residual).toBe(0);
    expect(directedPaisa(residual)).toEqual({ magnitudePaisa: 0, sign: 0 });
  });

  it("EXCESS TENDER (residual < 0) is renderable — the DEC-MONEY-007 'OVERPAID ₨1,850' screen", () => {
    // The khata double-count: the tab is settled once as a payment and again as a repayment,
    // so tendered is twice billed and the residual goes negative by exactly the tab.
    const residual = settledConservationResidualPaisa({
      billed_paisa: 185_000,
      tendered_paisa: 370_000,
      refunded_paisa: 0,
    });
    expect(residual).toBe(-185_000);

    // Today this is where the display path dies: rupeesFromPaisa(-185000) throws.
    expect(() => rupeesFromPaisa(residual as Paisa)).toThrow(RangeError);

    // With F2 the same number renders as a magnitude the screen can pair with the word
    // "OVER" (27-F12; MoneyValue's `direction` prop, MoneyValue.tsx:27).
    const { magnitudePaisa, sign } = directedPaisa(residual);
    expect(sign).toBe(-1);
    expect(rupeesFromPaisa(magnitudePaisa).rupees).toBe(1850);
  });

  it("a refund merged BEFORE its parent still resolves (01-F17 / DEC-SYNC-007)", () => {
    // invariants.ts:69-72: `refunded` may legitimately exceed `tendered` when unprovable
    // refunds merge first. The residual must stay renderable rather than wedge a screen.
    const residual = settledConservationResidualPaisa({
      billed_paisa: 0,
      tendered_paisa: 0,
      refunded_paisa: 50_000,
    });
    expect(residual).toBe(50_000);
    expect(directedPaisa(residual)).toEqual({ magnitudePaisa: 50_000, sign: 1 });
  });

  it("every residual the equation can produce is renderable — no input wedges the display", () => {
    // The property that matters operationally: whatever three guarded non-negative inputs
    // the fold hands the equation, the result can be shown. A screen that throws on a legal
    // money state is the stopped till 01-F54 exists to forbid.
    const amount = fc.integer({ min: 0, max: 1_000_000_000 });
    fc.assert(
      fc.property(amount, amount, amount, (billed, tendered, refunded) => {
        const residual = settledConservationResidualPaisa({
          billed_paisa: paisa(billed),
          tendered_paisa: paisa(tendered),
          refunded_paisa: paisa(refunded),
        });
        const { magnitudePaisa, sign } = directedPaisa(residual);
        expect(() => rupeesFromPaisa(magnitudePaisa)).not.toThrow();
        expect(BigInt(sign) * BigInt(magnitudePaisa)).toBe(BigInt(residual));
      }),
      { numRuns: 1000 },
    );
  });
});
