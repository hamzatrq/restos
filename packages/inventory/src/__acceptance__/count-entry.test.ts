/**
 * `10-F29`'s partial tier, at the writer — the founder's half-used soy sauce bottle.
 *
 * *"there's a soy sauce bottle that is almost half. half is used in kitchen. how will you fix that?
 * bottle also has weight how will the staff measure how much is left?"*
 *
 * The answer is a per-item policy fixed at onboarding, integer tenths or a weighed quantity, **no
 * stored tare**, and a `basis` that travels with the number.
 */

import { describe, expect, it } from "vitest";
import { countEntryToBase, PartialTierError } from "../count-entry.js";
import type { CountUnits } from "../reference.js";

const LITRE = 1_000_000;
const bottle = (partial: CountUnits["partial"]): CountUnits => ({
  primary_label: "bottle",
  primary_size_base: LITRE,
  partial,
});

describe("§A · 10-F29 — the three tiers, and the tap budget each costs", () => {
  it("`none`: one number, and it is EXACT — ketchup sachets, eggs, sealed tins", () => {
    expect(countEntryToBase({ containers: 12 }, bottle({ kind: "none" }))).toEqual({
      qty_base: 12 * LITRE,
      basis: "exact",
    });
  });

  it("`fraction`: 2 bottles and 5 tenths is 2.5 L, exactly, and the basis is ESTIMATED", () => {
    expect(countEntryToBase({ containers: 2, tenths: 5 }, bottle({ kind: "fraction" }))).toEqual({
      qty_base: 2_500_000,
      basis: "estimated",
    });
  });

  it("`weight`: 2 bottles and 380 g weighed is 2 380 g, and the basis is WEIGHED", () => {
    expect(
      countEntryToBase(
        { containers: 2, partial_base: 380_000 },
        bottle({ kind: "weight", unit: "mg" }),
      ),
    ).toEqual({ qty_base: 2_380_000, basis: "weighed" });
  });

  it("a ZERO partial keeps the basis EXACT — nothing was estimated, so nothing claims it was", () => {
    // The floor is computed from the basis, so labelling a whole-container reading `estimated`
    // would suppress a real gap on an item that was counted precisely.
    expect(countEntryToBase({ containers: 3, tenths: 0 }, bottle({ kind: "fraction" })).basis).toBe(
      "exact",
    );
    expect(
      countEntryToBase({ containers: 3, partial_base: 0 }, bottle({ kind: "weight", unit: "mg" }))
        .basis,
    ).toBe("exact");
  });
});

describe("§B · 10-F29 — the tenths are INTEGER, and the multiply happens before the divide", () => {
  it("every tenth of an ODD container size is exact — no float could do this", () => {
    // 1 000 001 ml is deliberately not divisible by 10. `size / 10 × tenths` loses a millilitre on
    // most inputs; `size × tenths / 10` with one rounding does not.
    const odd = {
      primary_label: "jar",
      primary_size_base: 1_000_001,
      partial: { kind: "fraction" },
    } as const;
    for (let tenths = 0; tenths <= 9; tenths += 1) {
      const answer = countEntryToBase({ containers: 0, tenths }, odd).qty_base;
      expect(answer).toBe(Math.round((1_000_001 * tenths) / 10));
    }
  });

  it("a FLOAT tenth is refused — law 3's hazard, one domain over", () => {
    expect(() =>
      countEntryToBase({ containers: 1, tenths: 5.5 }, bottle({ kind: "fraction" })),
    ).toThrow(PartialTierError);
  });

  it("tenths outside 0-9 are refused — ten tenths is another container, not a partial", () => {
    for (const bad of [-1, 10, 11]) {
      expect(() =>
        countEntryToBase({ containers: 1, tenths: bad }, bottle({ kind: "fraction" })),
      ).toThrow(PartialTierError);
    }
  });

  it("a partial entered on an item that declares NONE is refused, not silently added", () => {
    // `10-F29` fixes the tier per item at onboarding precisely so the same bottle is not "1 case"
    // one week and "0.5 case" the next — two numbers that are not comparable, and `10-F18` is a
    // DIFFERENCE of two counts, so incomparable is the same as wrong.
    expect(() => countEntryToBase({ containers: 1, tenths: 3 }, bottle({ kind: "none" }))).toThrow(
      PartialTierError,
    );
  });

  it("NO TARE is anywhere in the input — the label says weigh the CONTENTS", () => {
    // Three measured reasons (`10-F29`): no food inventory system in the survey stores one; the
    // ones that do key it to a barcode database that will never exist here; and a wrong tare
    // produces a number that looks like a fact — a scale out of calibration does not announce
    // itself. A field-name assertion, because that is what a later session would add.
    const keys = Object.keys({ containers: 1, tenths: 0, partial_base: 0 });
    expect(keys).not.toContain("tare_base");
    expect(keys).not.toContain("gross_base");
  });
});
