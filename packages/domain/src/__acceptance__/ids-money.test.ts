// Acceptance tests — T-01-01 (authored from spec text only; see plans/wave-0/kernel-tasks.md).
// Conventions under test: 00 §6 (UUIDv7 ids, integer paisas/mg/ml/units, no floats in ledgers).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addPaisa, mg, ml, newId, paisa, subPaisa, sumPaisa, units } from "../index.js";

describe("ids (00 §6)", () => {
  it("00 §6: newId returns UUIDv7-format strings", () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("00 §6: sequential newId calls are unique and lexicographically time-ordered", () => {
    const ids = Array.from({ length: 200 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("money and quantity brands (00 §6)", () => {
  const brands = { paisa, mg, ml, units };

  it("00 §6: brands accept non-negative integers and preserve the value", () => {
    for (const brand of Object.values(brands)) {
      expect(brand(0)).toBe(0);
      expect(brand(250)).toBe(250);
    }
  });

  it("00 §6: brands reject floats, NaN, Infinity, and negatives while accepting adjacent integers", () => {
    for (const [name, brand] of Object.entries(brands)) {
      expect(brand(1), `${name}(1) anchors the rejection cases`).toBe(1);
      for (const bad of [1.5, Number.NaN, Infinity, -Infinity, -1]) {
        expect(() => brand(bad), `${name}(${bad}) must throw`).toThrow();
      }
    }
  });

  it("00 §6: sumPaisa equals the bigint-exact sum for any integer array (no float drift)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { maxLength: 200 }),
        (ns) => {
          const exact = ns.reduce((acc, n) => acc + BigInt(n), 0n);
          expect(BigInt(sumPaisa(ns.map((n) => paisa(n))))).toBe(exact);
        },
      ),
    );
  });

  it("00 §6: subPaisa is the exact inverse of addPaisa", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 40 }),
        fc.integer({ min: 0, max: 2 ** 40 }),
        (a, b) => {
          const [hi, lo] = a >= b ? [a, b] : [b, a];
          expect(addPaisa(subPaisa(paisa(hi), paisa(lo)), paisa(lo))).toBe(hi);
        },
      ),
    );
  });

  it("00 §6: addPaisa beyond 2^53 either throws or stays bigint-exact — never silent drift", () => {
    expect(addPaisa(paisa(2), paisa(3))).toBe(5); // anchors: addPaisa works in the safe range
    let out: number;
    try {
      out = addPaisa(paisa(Number.MAX_SAFE_INTEGER), paisa(1));
    } catch {
      return; // a guarded overflow throw is contract-conformant for integer exactness
    }
    expect(BigInt(out)).toBe(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
  });
});
