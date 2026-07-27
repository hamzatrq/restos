// ORACLE ACCEPTANCE TESTS — 27-F64, the status outline.
//
// PROVENANCE: oracle session (24 §3 step 2). Independent oracle from `__oracle__/`.
//
// 27-F64 splits one channel into two: the FILL carries the state (27-F15 unchanged), the
// OUTLINE carries the boundary (SC 1.4.11). That is what makes 27-F15 and 27-F21 jointly
// satisfiable — measured, no four-colour set clears 3:1 fill separation AND ΔE00 >= 20 AND the
// severity ladder on either polarity.
//
// THE WHOLE RISK OF THIS FR IS THE SMUGGLE. Splitting the channel hands the design a second
// colour slot, and 27-F14 allocates exactly four. If outlines are allowed to differ in hue
// between states, the palette quietly becomes eight colours and 27-F14's budget — the thing
// that keeps amber and red preattentive — is spent without an amendment. So the hue tests
// below are the point of this file, not an afterthought: the outline must be achromatic or a
// derivative of ITS OWN fill, and it may never be the thing that tells two states apart.

import { describe, expect, it } from "vitest";
import { contrastRatio, hexToLab, hueDegrees } from "./__oracle__/color-oracle";
import { type ColorName, type Polarity, palette } from "./index";

const POLARITIES = Object.keys(palette) as Polarity[];

/** Every fill that 27-F64 calls a "status surface" and therefore requires an outline for. */
const STATUS_FILLS = [
  "bgColor-status-abnormal",
  "bgColor-status-fault",
  "bgColor-status-confirmed",
  "bgColor-interactive",
] as const satisfies readonly ColorName[];

/**
 * The outline token each fill must declare. `outlineColor-` is a new role prefix, which
 * 27-F40 requires: a name must convey which property it belongs to, and reusing
 * `borderColor-` would conflate a decorative rule with a required boundary.
 */
const outlineFor = (fill: string): string => fill.replace(/^bgColor-/, "outlineColor-");

/** Surfaces a status element can be drawn on. */
const SURFACES = [
  "bgColor-surface",
  "bgColor-surface-raised",
  "bgColor-surface-sunken",
] as const satisfies readonly ColorName[];

const NON_TEXT_FLOOR = 3;
/** Below this Lab chroma a colour carries no usable hue — it is achromatic in practice. */
const ACHROMATIC_CHROMA = 6;
/** Hue tolerance for "a darkened or lightened derivative of the fill". */
const DERIVATIVE_HUE_TOLERANCE = 12;

const chroma = (hex: string): number => {
  const [, a, b] = hexToLab(hex);
  return Math.hypot(a, b);
};
const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const lookup = (c: Record<string, string>, name: string): string | undefined => c[name];

describe.each(POLARITIES)("27-F64 on the %s palette", (polarity) => {
  const c = palette[polarity] as Record<string, string>;

  it("declares an outline token for every status fill", () => {
    const missing = STATUS_FILLS.filter((f) => lookup(c, outlineFor(f)) === undefined).map((f) => {
      return `${f} has no ${outlineFor(f)}`;
    });
    expect(missing, "27-F64 requires every status surface to carry an outline").toEqual([]);
  });

  it("meets 3:1 against every surface it can be drawn on", () => {
    // This is the requirement the fill has been RELIEVED of. If the outline does not carry it,
    // nothing does, and 27-F64 has weakened SC 1.4.11 rather than relocating it.
    const declared = STATUS_FILLS.map((f) => lookup(c, outlineFor(f))).filter(
      (v): v is string => v !== undefined,
    );
    expect(declared, "no outline tokens exist, so this gate would pass vacuously").toHaveLength(
      STATUS_FILLS.length,
    );
    const failures: string[] = [];
    for (const fill of STATUS_FILLS) {
      const outline = lookup(c, outlineFor(fill));
      if (outline === undefined) continue;
      for (const s of SURFACES) {
        const r = contrastRatio(outline, c[s] as string);
        if (r < NON_TEXT_FLOOR) failures.push(`${outlineFor(fill)} on ${s}: ${r.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("is achromatic, or a hue-derivative of ITS OWN fill — never a new hue", () => {
    // "achromatic or a darkened/lightened derivative of the fill". A derivative keeps the
    // fill's hue and moves only lightness; anything else is a fifth colour.
    const declared = STATUS_FILLS.map((f) => lookup(c, outlineFor(f))).filter(
      (v): v is string => v !== undefined,
    );
    expect(declared, "no outline tokens exist, so this gate would pass vacuously").toHaveLength(
      STATUS_FILLS.length,
    );
    const failures: string[] = [];
    for (const fill of STATUS_FILLS) {
      const outline = lookup(c, outlineFor(fill));
      if (outline === undefined) continue;
      if (chroma(outline) < ACHROMATIC_CHROMA) continue;
      const oh = hueDegrees(outline);
      const fh = hueDegrees(c[fill] as string);
      if (oh === null || fh === null) continue;
      if (hueGap(oh, fh) > DERIVATIVE_HUE_TOLERANCE) {
        failures.push(
          `${outlineFor(fill)} is hue ${oh.toFixed(0)} but its fill is ${fh.toFixed(0)} — not a derivative`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("NEVER differs in hue between two states — the 27-F14 budget is four, not eight", () => {
    // THE SMUGGLE, gated explicitly. Two legal shapes only:
    //   (a) every status outline is the SAME achromatic value — carries no meaning by
    //       construction, because it is identical across states; or
    //   (b) every status outline is a derivative of its own fill — carries no meaning of its
    //       own, because it only repeats what the fill already said.
    // A set that mixes them, or that gives two states outlines differing in hue by more than a
    // derivative's tolerance while NOT tracking their fills, has added a colour channel.
    const outlines = STATUS_FILLS.map((f) => ({ fill: f, value: lookup(c, outlineFor(f)) })).filter(
      (o): o is { fill: (typeof STATUS_FILLS)[number]; value: string } => o.value !== undefined,
    );
    if (outlines.length < 2) {
      expect(outlines.length, "no outlines to compare — the declaration test owns this").toBe(
        STATUS_FILLS.length,
      );
      return;
    }

    const allAchromatic = outlines.every((o) => chroma(o.value) < ACHROMATIC_CHROMA);
    if (allAchromatic) {
      const distinct = new Set(outlines.map((o) => o.value.toLowerCase()));
      expect(
        [...distinct],
        "achromatic outlines must be ONE value — a per-state grey is still a per-state signal",
      ).toHaveLength(1);
      return;
    }

    const notDerivative = outlines.filter((o) => {
      const oh = hueDegrees(o.value);
      const fh = hueDegrees(c[o.fill] as string);
      return oh !== null && fh !== null && hueGap(oh, fh) > DERIVATIVE_HUE_TOLERANCE;
    });
    expect(
      notDerivative.map((o) => outlineFor(o.fill)),
      "a chromatic outline that does not track its own fill is a fifth colour",
    ).toEqual([]);
  });

  it("does not let the outline become the signal (27-F15 is unchanged)", () => {
    // "A thin rule still may not BE the signal; it may only bound one." Operationally: the
    // FILLS must remain distinguishable from each other without reference to their outlines.
    // If two states' fills were identical and only their outlines differed, the outline would
    // be carrying the state — which is what 27-F15 forbids and what this FR must not reopen.
    const fills = STATUS_FILLS.map((f) => (c[f] as string).toLowerCase());
    expect(new Set(fills).size, "two status fills are identical").toBe(STATUS_FILLS.length);
  });
});

describe("27-F64 — the scope question this FR leaves open", () => {
  // 27-F64 says "every STATUS surface carries an outline". The three NEUTRAL surface tokens
  // separate at 1.06-1.29:1 in both polarities and are not status surfaces, so the FR as
  // written does not reach them — yet they are what carries elevation, the active tab, the
  // blocked key and 27-F63's training tint. This test states the gap rather than asserting a
  // rule doc 27 has not made, so it fails loudly if someone assumes the outline rule closed it.
  it("records that neutral surface separation is still unclosed in both polarities", () => {
    const gaps: string[] = [];
    for (const polarity of POLARITIES) {
      const c = palette[polarity];
      for (let i = 0; i < SURFACES.length; i++) {
        for (let j = i + 1; j < SURFACES.length; j++) {
          const a = SURFACES[i] as ColorName;
          const b = SURFACES[j] as ColorName;
          const r = contrastRatio(c[a], c[b]);
          if (r < NON_TEXT_FLOOR) gaps.push(`${polarity}: ${a} vs ${b} = ${r.toFixed(2)}:1`);
        }
      }
    }
    expect(gaps, "neutral surfaces below 3:1 — 27-F64 is scoped to STATUS surfaces").toEqual([]);
  });
});
