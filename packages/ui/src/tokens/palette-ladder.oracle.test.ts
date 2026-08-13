// ORACLE ACCEPTANCE TESTS — 27-F15 (amended July 2026), over BOTH polarities.
//
// PROVENANCE: oracle session (24 §3 step 2). Uses the independent oracle in `__oracle__/`,
// validated against Sharma/Wu/Dalal 2005. It does not import `color-science.ts`, because a
// palette checked with the arithmetic that produced it is not checked at all.
//
// WHAT CHANGED, AND WHY THIS IS NOT JUST THE OLD FILE POINTED AT A SMALLER NUMBER.
//
// 27-F15's floor is now ΔE00 >= 20 on the WORST pair of the 27-F14 set, measured across normal
// vision and all three dichromacies **with the 27-F21 separation gate held**. The former 31.4
// was measured on a single pair, on a different ladder, with no separation gate applied — and
// no four-colour set satisfying that gate reaches it on any theme.
//
// The CONDITION matters more than the number. "ΔE00 >= 20 with separation held" is two
// requirements, and a palette can satisfy either alone while failing the pair — so both are
// asserted here, per polarity. A failed separation gate is never treated as an excuse from the
// ladder: 27-F19 makes light the DEFAULT on every surface, so the default palette does not get
// to be the one that is exempt from the FR written for it.

import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  hueDegrees,
  hueWithin,
  lightness,
  worstDeltaE,
} from "./__oracle__/color-oracle";
import { type ColorName, type Polarity, palette } from "./index";

const POLARITIES = Object.keys(palette) as Polarity[];

/**
 * The 27-F14 allocation in full, with the IEC 60073 meaning each slot carries and the hue band
 * that meaning implies. Every PAIR is a discrimination an operator may have to make, so there
 * is deliberately no subsetting: a carve-out is a design decision and belongs in doc 27 with
 * evidence, not in a test file.
 */
const ALLOCATION = [
  { name: "amber", token: "bgColor-status-abnormal", meaning: "abnormal", lo: 25, hi: 65 },
  { name: "red", token: "bgColor-status-fault", meaning: "fault/danger", lo: 345, hi: 25 },
  { name: "green", token: "bgColor-status-confirmed", meaning: "confirmation", lo: 100, hi: 175 },
  { name: "blue", token: "bgColor-interactive", meaning: "interactive", lo: 185, hi: 250 },
] as const satisfies readonly {
  name: string;
  token: ColorName;
  meaning: string;
  lo: number;
  hi: number;
}[];

/** 27-F15 as amended, July 2026. */
const LADDER_FLOOR = 20;
/** WCAG 2.2 SC 1.4.11 Level AA — the gate the floor is conditioned on. */
const SEPARATION_FLOOR = 3;
/** The surfaces a status fill is actually drawn on. Never `bgColor-surface`. */
const FILL_SURFACES = ["bgColor-surface-raised", "bgColor-surface-sunken"] as const;

const pairs = ALLOCATION.flatMap((a, i) => ALLOCATION.slice(i + 1).map((b) => ({ a, b })));

describe.each(POLARITIES)("27-F15 amended — the %s palette", (polarity) => {
  const c = palette[polarity];

  it.each(pairs)("$a.name <-> $b.name clears the ΔE00 floor under every vision", ({ a, b }) => {
    const { delta, vision } = worstDeltaE(c[a.token], c[b.token]);
    expect(delta, `worst under ${vision}`).toBeGreaterThanOrEqual(LADDER_FLOOR);
  });

  it("holds the boundary gate the floor is conditioned on — now the OUTLINE (27-F64)", () => {
    // SUPERSEDED BY 27-F64, and this is the whole point of that FR. The ΔE00 floor is still
    // conditional on SC 1.4.11 being met — but the fill no longer has to meet it, because no
    // four-colour set clears 3:1 fill separation AND ΔE00 >= 20 AND the severity ladder on
    // either polarity. The boundary moved to the outline; it did NOT disappear. Asserting the
    // old fill-separation rule here would now contradict doc 27, and dropping the condition
    // entirely would leave the floor unconditioned, which is what made 31.4 wrong.
    //
    // `outline-boundary.oracle.test.ts` owns the outline's own 3:1 gate and the hue rules that
    // stop it becoming a fifth colour. This test only asserts the CONDITION holds at all.
    const cAny = c as Record<string, string>;
    const missing = ALLOCATION.filter(
      ({ token }) => cAny[token.replace(/^bgColor-/, "outlineColor-")] === undefined,
    ).map(({ name }) => name);
    expect(
      missing,
      "27-F64 requires an outline per status fill; without one nothing carries SC 1.4.11 and the ΔE00 floor is unconditioned",
    ).toEqual([]);
  });

  it("reports the whole matrix, so any future amendment is written against measurements", () => {
    const rows = pairs.map(({ a, b }) => {
      const { delta, vision } = worstDeltaE(c[a.token], c[b.token]);
      return `${a.name}<->${b.name}: ${delta.toFixed(2)} (${vision})`;
    });
    const worst = Math.min(...pairs.map(({ a, b }) => worstDeltaE(c[a.token], c[b.token]).delta));
    expect(worst, `measured across the allocation — ${rows.join("; ")}`).toBeGreaterThanOrEqual(
      LADDER_FLOOR,
    );
  });

  it("keeps each status colour inside the hue band its IEC 60073 meaning implies", () => {
    // THE SECOND FAILURE MODE, pinned. A pure ΔE00 optimiser is indifferent to MEANING: it
    // will push "fault" toward pink because pink is further from amber. That clears every
    // distance and contrast gate and still violates 27-F14's allocation — red means danger,
    // and a colour that no longer reads as red no longer carries the slot it was given.
    for (const { name, token, meaning, lo, hi } of ALLOCATION) {
      const h = hueDegrees(c[token]);
      expect(
        hueWithin(h, lo, hi),
        `${name} (${meaning}) is at hue ${h?.toFixed(0) ?? "achromatic"}, outside ${lo}-${hi}`,
      ).toBe(true);
    }
  });

  it("orders the ladder monotonically away from its own surface", () => {
    // 27-F15 is a LIGHTNESS ladder, and which direction is "heavier" depends on the field: on
    // a light base a severe state is DARKER than the page, on a dark base it is LIGHTER. The
    // old test asserted the light direction literally and would have to be rewritten for every
    // new polarity. The invariant that survives both is that severity moves monotonically AWAY
    // from the surface.
    const surface = lightness(c["bgColor-surface"]);
    const away = (token: ColorName): number => Math.abs(lightness(c[token]) - surface);
    expect(
      away("bgColor-status-fault"),
      "fault must sit further from the page than abnormal",
    ).toBeGreaterThan(away("bgColor-status-abnormal"));
  });
});

describe("27-F15 — the failure mode is reproduced, not quoted", () => {
  it("shows the naive traffic light collapsing on GREEN VS RED, the pair the research measured", () => {
    // The research measured the naive palette at ΔE00 8.2 under deuteranopia. Reproducing THAT
    // claim needs a green and a red at similar lightness — the "near-identical olive". An
    // earlier exemplar used two red-oranges, which reproduces a real collapse but not the one
    // the number describes.
    const { delta, vision } = worstDeltaE("#2E9B57", "#C0392B");
    expect(vision, "the traffic light fails for DEUTANS specifically (27-F17)").toBe(
      "deuteranopia",
    );
    expect(delta, "the naive green/red pair must reproduce the ~8.2 collapse").toBeLessThan(12);
  });
});

describe("the contrast gates and the ΔE00 gate are INDEPENDENT", () => {
  // THE FIRST FAILURE MODE, pinned. A palette hand-picked for semantic fitness cleared every
  // contrast gate in this package while its joint ΔE00 was 13.01 — amber and green
  // near-identical under dichromacy (`plans/wave-1/palette-repaint.md`). Contrast is a
  // LUMINANCE relation between a colour and its background; ΔE00 is a PERCEPTUAL relation
  // between two colours. Neither implies the other, and a suite checking only contrast will
  // certify a palette unreadable to exactly the people 27-F15 protects.

  /**
   * Found by searching the sRGB cube for the pair with MINIMAL worst-case ΔE00 among colours
   * that clear every contrast gate on the light base and sit in the amber (h26) and green
   * (h105) bands. The result is stronger than the 13.01 that prompted this: these two are
   * ΔE00 **0.00** under protanopia — not merely close, but the SAME COLOUR to a protanope —
   * while measuring 14.70:1 and 15.80:1 against white and 12.76:1 and 13.71:1 against the
   * sunken surface. Every contrast gate in this package passes them comfortably.
   */
  const TRAP = { amber: "#402008", green: "#102808" } as const;

  it("demonstrates a pair that passes every contrast gate and still fails the ladder", () => {
    for (const [slot, hex] of Object.entries(TRAP)) {
      for (const s of FILL_SURFACES) {
        expect(
          contrastRatio(hex, palette.light[s]),
          `${slot} ${hex} on ${s} must CLEAR separation, so the trap is about ΔE00 alone`,
        ).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
      }
      expect(
        contrastRatio(hex, "#FFFFFF"),
        `${slot} must carry an AA foreground`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    const { delta, vision } = worstDeltaE(TRAP.amber, TRAP.green);
    expect(
      delta,
      `every contrast gate passed, yet the pair is indistinguishable under ${vision}`,
    ).toBeLessThan(LADDER_FLOOR);
  });

  it("keeps the shipped palettes clear of that trap on the pair it bites", () => {
    for (const polarity of POLARITIES) {
      const c = palette[polarity];
      const { delta } = worstDeltaE(c["bgColor-status-abnormal"], c["bgColor-status-confirmed"]);
      expect(delta, `${polarity} amber<->green`).toBeGreaterThanOrEqual(LADDER_FLOOR);
    }
  });
});

describe("27-F19 — the manifest claims both polarities are gated, so both are", () => {
  it("ships a distinct dark value for every colour token", () => {
    // A partial dark set is worse than none: a surface that opts in silently inherits
    // light-theme values for whichever tokens were forgotten, and inherits them as a FILL on a
    // dark field, which is the worst possible direction to get wrong.
    const shared = (Object.keys(palette.light) as ColorName[]).filter(
      (k) => palette.dark[k] === palette.light[k],
    );
    expect(shared, "tokens with no distinct dark value").toEqual([]);
  });

  it("keeps light as the default, per 27-F19", () => {
    // 27-F19 is explicit that light is the default on every surface and dark is a per-site KDS
    // opt-in. Pinned so a future edit cannot quietly swap them: positive polarity wins on
    // acuity at small character sizes, which is where the counter POS lives.
    expect(lightness(palette.light["bgColor-surface"])).toBeGreaterThan(
      lightness(palette.dark["bgColor-surface"]),
    );
  });
});
