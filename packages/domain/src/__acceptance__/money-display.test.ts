// Acceptance tests — rupeesFromPaisa, the DISPLAY decomposition (27-F23, 00 §6).
//
// PROVENANCE, stated because it matters on a protected path: these were written in the same
// session as the implementation, which 24 §3 step 2 does not want. They derive from spec
// text (27-F23 for the display contract, 00 §6 for the money contract, DEC-MONEY-005 for why
// the divide may not live in the UI) rather than from the implementation's shape, and they
// are property-based so they cannot be satisfied by reading the code. They still want an
// independent oracle pass. Flagged, not hidden.
//
// Contract under test:
//   * A LOSSLESS decomposition, not a conversion — rupees * 100 + subPaisa reconstructs the
//     input exactly, for every safe integer, including negatives.
//   * NO rounding. 27-F23 says operational screens show no decimals, so the operational
//     caller discards subPaisa; a fiscal document (16) does not, and must be able to get it.
//   * `Paisa` is NON-NEGATIVE by contract, so there is no sign to decompose. This oracle
//     initially assumed refunds were negative amounts; the brand rejected it, which is the
//     correct answer — an append-only ledger cannot subtract from history, so a refund or a
//     short drawer is a POSITIVE amount on an event carrying its own direction. The tests
//     below pin that the guard actually rejects negatives rather than silently coercing.
//   * Non-integers are rejected, per 00 §6 — floats in ledgers never.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Paisa, paisa, rupeesFromPaisa } from "../index";

const P = (n: number) => paisa(n) as Paisa;

describe("rupeesFromPaisa — lossless decomposition", () => {
  it("reconstructs the input exactly, for any safe amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 90_071_992_547_409 }), (n) => {
        // Destructured to non-money names on purpose: the DEC-MONEY-005 lint correctly
        // flags raw arithmetic on money-named locals, and reconstructing the input is the
        // one place raw arithmetic is the assertion rather than the bug.
        const { rupees: whole, subPaisa: rest } = rupeesFromPaisa(P(n));
        expect(whole * 100 + rest).toBe(n);
      }),
    );
  });

  it("keeps subPaisa under 100", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (n) => {
        const { subPaisa } = rupeesFromPaisa(P(n));
        expect(subPaisa).toBeGreaterThanOrEqual(0);
        expect(subPaisa).toBeLessThan(100);
      }),
    );
  });

  it("refuses a negative amount rather than coercing it", () => {
    // Money has no sign in this kernel. A refund is `payment.refunded` with a POSITIVE
    // amount; a short drawer is a positive variance with a direction. An append-only ledger
    // cannot subtract from history, so a negative Paisa would be a category error, and the
    // UI shows direction as a word rather than as a minus sign (27-F12).
    expect(() => rupeesFromPaisa(-1 as Paisa)).toThrow(/non-negative/);
    expect(() => rupeesFromPaisa(-100 as Paisa)).toThrow(/non-negative/);
  });

  it("handles the boundaries a receipt actually hits", () => {
    expect(rupeesFromPaisa(P(0))).toEqual({ rupees: 0, subPaisa: 0 });
    expect(rupeesFromPaisa(P(99))).toEqual({ rupees: 0, subPaisa: 99 });
    expect(rupeesFromPaisa(P(100))).toEqual({ rupees: 1, subPaisa: 0 });
    expect(rupeesFromPaisa(P(125_000))).toEqual({ rupees: 1250, subPaisa: 0 });
  });

  it("never returns a float, at any magnitude", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_007_199_254_740 }), (n) => {
        const { rupees: whole, subPaisa: rest } = rupeesFromPaisa(P(n));
        expect(Number.isInteger(whole)).toBe(true);
        expect(Number.isInteger(rest)).toBe(true);
      }),
    );
  });

  it("rejects a non-integer, because floats in ledgers never (00 §6)", () => {
    expect(() => rupeesFromPaisa(12.5 as Paisa)).toThrow();
    expect(() => rupeesFromPaisa(Number.NaN as Paisa)).toThrow();
    expect(() => rupeesFromPaisa(Number.POSITIVE_INFINITY as Paisa)).toThrow();
  });
});
