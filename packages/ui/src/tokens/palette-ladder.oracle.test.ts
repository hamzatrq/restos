// ORACLE ACCEPTANCE TESTS — 27-F15, the status-colour ladder.
//
// PROVENANCE: authored by the oracle session (24 §3 step 2), not by the session that wrote
// tokens.json or color-science.ts. Uses the independent oracle in `__oracle__/`, validated
// against Sharma/Wu/Dalal 2005 in `__oracle__/color-oracle.test.ts`. It does not import
// `color-science.ts`, because a palette checked with the arithmetic that produced it is not
// checked at all.
//
// WHY THIS FILE REPLACES THE 27-F15 BLOCK IN tokens.test.ts:
//
// The existing test asserts the spec's 31.4 against amber <-> red, which passes at 44.34,
// and excludes green from "the ladder" on the reasoning that 27-F14 makes green transient.
// But 31.4 is not a number about amber and red. Its source is
// `plans/wave-1/research/colour-typography.md:15-18`:
//
//     "Measured dE00 GREEN VS RED under deuteranopia: 8.2 (from 67.9 normal) - near-identical
//      olive. Fix is a monotonic lightness ladder L* 100 -> 77.5 -> 39.7; worst case under
//      any dichromacy 31.4."
//
// So 8.2 and 31.4 are both about GREEN VS RED. The shipped palette measures 29.42 on that
// pair. The test that quoted the number applied it to the pair that passes it, and covered
// the pair it was measured on with a self-chosen `>15` and a comment conceding the result was
// "EXPECTED to be weak". That is a test written to pass rather than to check.
//
// This file states the spec's number, on every pair, with no carve-outs.

import { describe, expect, it } from "vitest";
import { contrastRatio, lightness, VISIONS, worstDeltaE } from "./__oracle__/color-oracle";
import tokens from "./tokens.json" with { type: "json" };

const color = tokens.color as Record<string, { value?: string } | string>;
const hex = (name: string): string => {
  const t = color[name];
  const v = typeof t === "string" ? undefined : t?.value;
  if (typeof v !== "string") throw new Error(`token "${name}" is not in the manifest`);
  return v;
};

/**
 * The 27-F14 allocation, in full. Every entry is a colour the operator may see on an
 * operational surface, so every PAIR is a discrimination the operator may have to make.
 * There is deliberately no subsetting here: a carve-out is a design decision, and a design
 * decision belongs in doc 27 with evidence, not in a test file.
 */
const ALLOCATION = [
  ["amber", "bgColor-status-abnormal"],
  ["red", "bgColor-status-fault"],
  ["green", "bgColor-status-confirmed"],
  ["blue", "bgColor-interactive"],
] as const;

/** 27-F15's headline number, from `plans/wave-1/research/colour-typography.md:17`. */
const LADDER_FLOOR = 31.4;

const pairs = ALLOCATION.flatMap(([an, ak], i) =>
  ALLOCATION.slice(i + 1).map(([bn, bk]) => ({ an, bn, a: hex(ak), b: hex(bk) })),
);

describe("27-F15 — every allocated pair rides the ladder, with no carve-outs", () => {
  it.each(pairs)("$an <-> $bn separates by at least 31.4 under every vision", ({ a, b }) => {
    const { delta, vision } = worstDeltaE(a, b);
    expect(delta, `worst under ${vision}`).toBeGreaterThanOrEqual(LADDER_FLOOR);
  });

  it("reports the whole matrix, so an amendment can be written against measurements", () => {
    // Not a carve-out — a diagnostic. If 27-F15 is to be amended, it should be amended to a
    // number someone measured, and this is where that number comes from.
    const rows = pairs.map(({ an, bn, a, b }) => {
      const { delta, vision } = worstDeltaE(a, b);
      return `${an}<->${bn}: ${delta.toFixed(2)} (${vision})`;
    });
    const worst = Math.min(...pairs.map(({ a, b }) => worstDeltaE(a, b).delta));
    expect(
      worst,
      `measured worst-case across the allocation — ${rows.join("; ")}`,
    ).toBeGreaterThanOrEqual(LADDER_FLOOR);
  });
});

describe("27-F15 — the failure mode is reproduced, not quoted", () => {
  it("shows the naive traffic light collapsing on GREEN VS RED, the pair the research measured", () => {
    // The research measured the naive palette at dE00 8.2 under deuteranopia, from 67.9 under
    // normal vision. Reproducing that claim requires a GREEN and a RED at similar lightness —
    // the "near-identical olive". The previous exemplar used two red-oranges (#C98145 /
    // #E16C48), which reproduces a real collapse but not the one the number describes.
    const naiveGreen = "#2E9B57";
    const naiveRed = "#C0392B";

    const normal = worstDeltaE(naiveGreen, naiveGreen).delta;
    expect(normal).toBe(0); // sanity: the oracle is comparing what we think it is

    const { delta, vision } = worstDeltaE(naiveGreen, naiveRed);
    expect(vision, "the traffic light fails for DEUTANS specifically (27-F17)").toBe(
      "deuteranopia",
    );
    expect(delta, "the naive green/red pair must reproduce the ~8.2 collapse").toBeLessThan(12);
  });

  it("shows the shipped palette beating that collapse on the SAME pair", () => {
    // This is the comparison 27-F15 actually claims: the fix, measured where the break was.
    const { delta } = worstDeltaE(hex("bgColor-status-confirmed"), hex("bgColor-status-fault"));
    expect(delta).toBeGreaterThanOrEqual(LADDER_FLOOR);
  });
});

describe("27-F15 — the ladder is monotonic in LIGHTNESS on the surfaces it is drawn on", () => {
  it("orders severity by L* against every surface token, not just bgColor-surface", () => {
    // The existing test checks the ladder against `bgColor-surface`. No component renders a
    // status fill there: they sit on `-raised` (cards, rails, keys) and `-sunken` (the
    // AgeBadge resting state). The ladder must hold on the surfaces actually used.
    const surfaces = ["bgColor-surface", "bgColor-surface-raised", "bgColor-surface-sunken"];
    for (const s of surfaces) {
      expect(lightness(hex(s)), `${s} must be lighter than amber`).toBeGreaterThan(
        lightness(hex("bgColor-status-abnormal")),
      );
    }
    expect(lightness(hex("bgColor-status-abnormal"))).toBeGreaterThan(
      lightness(hex("bgColor-status-fault")),
    );
  });
});

describe("27-F14 — the green slot gets the in-situ verification it has never had", () => {
  // `bgColor-status-confirmed` is used by ZERO of the 13 components. A third of the colour
  // budget has shipped without ever being rendered, and it is also the token carrying the
  // 27-F15 shortfall. These are the checks the other three fills already get by being used.

  it("has a paired foreground that clears AA on it", () => {
    const pair = (color["bgColor-status-confirmed"] as { pairsWith?: string }).pairsWith;
    expect(pair, "green declares no pairsWith").toBeDefined();
    expect(contrastRatio(hex("bgColor-status-confirmed"), hex(pair ?? ""))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("is discriminable from the surfaces it would be drawn on, under every vision", () => {
    // 27-F15: "the fill carries it". A confirmation the operator cannot see has confirmed
    // nothing. Measured against -raised and -sunken, which is where fills actually sit.
    for (const s of ["bgColor-surface-raised", "bgColor-surface-sunken"]) {
      const { delta, vision } = worstDeltaE(hex("bgColor-status-confirmed"), hex(s));
      expect(delta, `green vs ${s}, worst under ${vision}`).toBeGreaterThanOrEqual(20);
    }
  });

  it("is never mistakable for the interactive accent under any vision", () => {
    // 27-F14 gives blue "any control the operator may press" and green "that worked". An
    // operator who cannot tell them apart will press a confirmation. `worstDeltaE` already
    // minimises over VISIONS, so one assertion covers all four observers.
    const { delta, vision } = worstDeltaE(
      hex("bgColor-status-confirmed"),
      hex("bgColor-interactive"),
    );
    expect(delta, `worst under ${vision} of ${VISIONS.join("/")}`).toBeGreaterThanOrEqual(
      LADDER_FLOOR,
    );
  });
});
