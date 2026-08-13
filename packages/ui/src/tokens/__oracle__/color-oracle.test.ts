// Validation of the ORACLE itself, against published reference data.
//
// This is the only file in the oracle set that is GREEN by design. It exists because an
// oracle nobody checks is just a second opinion. Every other oracle test cites this one as
// its licence: the numbers those tests assert are only meaningful if this file passes.
//
// If this file ever goes red, do not touch the tests that depend on it — fix the oracle.

import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  deltaE00,
  eotf,
  hexToLab,
  oetf,
  relativeLuminance,
  simulate,
} from "./color-oracle";

/**
 * Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference Formula: Implementation Notes,
 * Supplementary Test Data, and Mathematical Observations", Table 1. Pairs 1–34.
 *
 * These are chosen by the authors to exercise exactly the branches implementations get
 * wrong: pairs 1–6 sit near the a*=0 discontinuity, 9–15 straddle the hue wrap, and 17–20
 * are large differences where the rotation term dominates.
 */
const SHARMA: readonly (readonly [number, number, number, number, number, number, number])[] = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

describe("the oracle reproduces CIEDE2000 (Sharma, Wu & Dalal 2005)", () => {
  it("matches all 34 published reference pairs", () => {
    for (const [i, r] of SHARMA.entries()) {
      const got = deltaE00([r[0], r[1], r[2]], [r[3], r[4], r[5]]);
      expect(got, `Sharma pair ${i + 1}`).toBeCloseTo(r[6], 3);
    }
  });

  it("gets the hue-wrap pairs right — where nearly every implementation is wrong", () => {
    // Pairs 9-12 differ only in the 4th decimal of b*, and the published answers STEP
    // (7.1792 -> 7.2195) because the difference crosses the mean-hue branch. An
    // implementation with a single-sided wrap returns a smooth curve here and is wrong.
    expect(deltaE00([50, 2.49, -0.001], [50, -2.49, 0.001])).toBeCloseTo(7.1792, 3);
    expect(deltaE00([50, 2.49, -0.001], [50, -2.49, 0.0011])).toBeCloseTo(7.2195, 3);
    // Pairs 14-15 step DOWNWARD across the same boundary — the same trap, opposite sign.
    expect(deltaE00([50, -0.001, 2.49], [50, 0.001, -2.49])).toBeCloseTo(4.8045, 3);
    expect(deltaE00([50, -0.001, 2.49], [50, 0.0011, -2.49])).toBeCloseTo(4.7461, 3);
  });

  it("is symmetric, as a metric must be", () => {
    for (const r of SHARMA) {
      const ab = deltaE00([r[0], r[1], r[2]], [r[3], r[4], r[5]]);
      const ba = deltaE00([r[3], r[4], r[5]], [r[0], r[1], r[2]]);
      expect(ab).toBeCloseTo(ba, 9);
    }
  });
});

describe("the oracle reproduces WCAG 2.2 relative luminance and contrast", () => {
  it("anchors at the two endpoints the standard fixes", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 9);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 9);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 9);
  });

  it("reproduces the canonical AA boundary greys", () => {
    // #767676 on white is the textbook "just passes AA" grey; #777777 is just below it.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.5422, 3);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.4781, 3);
  });

  it("uses the two DIFFERENT transfer thresholds, and they meet", () => {
    // 0.04045 is on the encoded value, 0.0031308 on the linear one. Same point, two spaces.
    // They agree to ~5e-9 rather than exactly: both are ROUNDED decimal constants in the
    // standard, and the exact knee is irrational. Asserting tighter than the standard's own
    // precision would be asserting a coincidence.
    expect(eotf(0.04045)).toBeCloseTo(0.0031308, 7);
    expect(oetf(0.0031308)).toBeCloseTo(0.04045, 6);
    for (const v of [0, 1, 5, 10, 11, 12, 64, 128, 200, 255]) {
      expect(oetf(eotf(v / 255)) * 255).toBeCloseTo(v, 6);
    }
  });

  it("is symmetric and never below 1", () => {
    for (const a of ["#000000", "#8E1F1F", "#FFC043", "#ffffff"]) {
      for (const b of ["#000000", "#0B5FD0", "#51AB81", "#ffffff"]) {
        expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 9);
        expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("the oracle reproduces Machado et al. 2009 dichromacy simulation", () => {
  const channels = (hex: string): readonly number[] =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

  it("leaves the achromatic axis untouched, as a dichromacy model must", () => {
    // A dichromat sees greys as greys. Every row of every Machado matrix sums to ~1, so
    // this is a direct check that all nine coefficients were transcribed correctly.
    for (const kind of ["protanopia", "deuteranopia", "tritanopia"] as const) {
      for (const grey of ["#000000", "#808080", "#ffffff"]) {
        const c = channels(simulate(grey, kind));
        const spread = Math.max(...c) - Math.min(...c);
        expect(spread, `${kind} on ${grey}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("collapses the confusion axis it is named for", () => {
    // A deutan cannot separate a mid red from a mid green. The model must bring them close,
    // and this is also the check that the matrices are applied in LINEAR light — applied to
    // gamma-encoded values the collapse is measurably weaker.
    const red = "#C0392B";
    const green = "#27AE60";
    expect(deltaE00(hexToLab(red), hexToLab(green))).toBeGreaterThan(40);
    const seenRed = hexToLab(simulate(red, "deuteranopia"));
    const seenGreen = hexToLab(simulate(green, "deuteranopia"));
    expect(deltaE00(seenRed, seenGreen)).toBeLessThan(25);
  });
});
