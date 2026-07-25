// Acceptance tests for the doc-27 token layer.
//
// These re-derive the design claims rather than restating them. 27-F47 is honest that
// 27-F38..F43 rest on historical evidence rather than measurement — but 27-F15 and 27-F21
// are arithmetic, and arithmetic can be checked. So it is checked here, on every commit,
// which is the difference between a design system and a mood board.

import { describe, expect, it } from "vitest";
import { CVD_KINDS, contrast, deltaE00, hexToLab, lightness, simulate } from "./color-science";
import tokens from "./tokens.json" with { type: "json" };

type Tok = { value?: unknown; replacement?: unknown; [k: string]: unknown };
const group = (name: keyof typeof tokens): Record<string, Tok> =>
  Object.fromEntries(
    Object.entries(tokens[name] as Record<string, unknown>).filter(([k]) => !k.startsWith("$")),
  ) as Record<string, Tok>;

const color = group("color");

/** A missing token must fail the test loudly rather than compare against `undefined`. */
const at = (g: Record<string, Tok>, k: string): Tok => {
  const v = g[k];
  if (!v) throw new Error(`token "${k}" is not in the manifest`);
  return v;
};
const hex = (name: string): string => at(color, name).value as string;

/** Worst-case perceptual distance across normal vision and all three dichromacies. */
const worstDeltaE = (a: string, b: string): { d: number; under: string } => {
  let d = Number.POSITIVE_INFINITY;
  let under = "";
  for (const k of ["normal", ...CVD_KINDS]) {
    const [x, y] = k === "normal" ? [a, b] : [simulate(a, k), simulate(b, k)];
    const v = deltaE00(hexToLab(x), hexToLab(y));
    if (v < d) {
      d = v;
      under = k;
    }
  }
  return { d, under };
};

describe("27-F15 — status colours ride a monotonic lightness ladder", () => {
  // The claim being checked: the naive equal-lightness traffic light measures ΔE00 8.2
  // under deuteranopia (near-identical olive); a lightness ladder measures 31.4 worst-case.
  // amber and red are the two RESTING states — 27-F14 makes green transient-only, so green
  // is never co-present with them in a scanning task and is not part of the ladder.
  it("separates the two resting states by at least the 31.4 the spec claims", () => {
    const { d, under } = worstDeltaE(hex("bgColor-status-abnormal"), hex("bgColor-status-fault"));
    expect(d, `worst under ${under}`).toBeGreaterThanOrEqual(31.4);
  });

  it("beats the equal-lightness traffic light it replaces, which collapses entirely", () => {
    // The spec cites 8.2 for "the naive equal-lightness traffic-light palette". Constructing
    // such a pair directly is worse than that: an amber and a red at the SAME L* and similar
    // chroma are literally indistinguishable to a deutan — ΔE00 0.0, the near-identical olive
    // 27-F15 describes. This is the failure mode, reproduced rather than quoted.
    const naive = worstDeltaE("#C98145", "#E16C48"); // both L* ≈ 60
    expect(naive.under).toBe("deuteranopia");
    expect(naive.d).toBeLessThan(1);

    const ours = worstDeltaE(hex("bgColor-status-abnormal"), hex("bgColor-status-fault")).d;
    expect(ours).toBeGreaterThan(40);
  });

  it("orders lightness monotonically with severity", () => {
    const surface = lightness(hex("bgColor-surface"));
    const abnormal = lightness(hex("bgColor-status-abnormal"));
    const fault = lightness(hex("bgColor-status-fault"));
    // More severe = visually heavier = darker against a light page (27-F19 light default).
    expect(surface).toBeGreaterThan(abnormal);
    expect(abnormal).toBeGreaterThan(fault);
  });

  it("keeps every status FILL discriminable from the page it sits on", () => {
    // 27-F15: "the fill carries it — never a dot, badge or thin rule." A fill that cannot be
    // told from the page is not carrying anything. ΔE00 is the right metric here rather than
    // a WCAG luminance ratio, because these differ chromatically as well as in lightness.
    for (const name of ["status-abnormal", "status-fault", "status-confirmed", "interactive"]) {
      const { d, under } = worstDeltaE(hex(`bgColor-${name}`), hex("bgColor-surface"));
      expect(d, `${name} vs surface, worst under ${under}`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("27-F17 — assume 1 in 20 male staff is deutan and does not know it", () => {
  it("never lets a red/green pair be the sole distinguishing signal by lightness alone", () => {
    // This one is EXPECTED to be weak — red vs green is the classic confusion and no palette
    // fixes it. The spec's answer is structural (27-F12: colour + shape + position + number),
    // not chromatic. The test pins the residual so a future edit cannot quietly make it worse.
    const { d } = worstDeltaE(hex("bgColor-status-fault"), hex("bgColor-status-confirmed"));
    expect(d).toBeGreaterThan(15);
  });
});

describe("27-F21 — gate on WCAG 2.2 AA", () => {
  it("gives every fill a paired foreground that clears 4.5:1 on it", () => {
    for (const [name, tok] of Object.entries(color)) {
      const pair = tok.pairsWith as string | undefined;
      if (!pair) continue;
      expect(at(color, pair), `${name} pairs with a token that does not exist`).toBeDefined();
      expect(contrast(tok.value as string, hex(pair)), `${pair} on ${name}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("clears AA for default and muted text on the surface", () => {
    expect(contrast(hex("fgColor-default"), hex("bgColor-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex("fgColor-muted"), hex("bgColor-surface"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("27-F14 — the colour budget is allocated here, platform-wide", () => {
  it("ships exactly 3 status colours and 1 interactive accent", () => {
    const status = Object.keys(color).filter((k) => k.startsWith("bgColor-status-"));
    const accent = Object.keys(color).filter((k) => k === "bgColor-interactive");
    expect(status).toHaveLength(3);
    expect(accent).toHaveLength(1);
  });

  it("records what each status colour serves, so a fourth claimant is visible as a conflict", () => {
    for (const k of Object.keys(color).filter((n) => n.startsWith("bgColor-status-"))) {
      expect(Array.isArray(at(color, k).serves), `${k} declares no claimants`).toBe(true);
    }
  });
});

describe("27-F38..F46 — the naming laws that stop a rename from inverting a meaning", () => {
  const all = (["color", "space", "touch", "typography", "kds", "money"] as const).flatMap((g) =>
    Object.entries(group(g)).map(([k, v]) => [g, k, v] as const),
  );

  it("27-F38: every token slot is filled — no elided defaults", () => {
    for (const [g, k, v] of all) {
      const filled = "value" in v || "fontSize" in v;
      expect(filled, `${g}.${k} has no value`).toBe(true);
    }
  });

  it("27-F39: no relative modifier ladders", () => {
    // Atlassian renamed `bold` → `subtle`: the old bold token BECAME the subtle token, the
    // name stayed valid, the meaning inverted, and no codemod or diff review can catch that.
    for (const [g, k] of all) {
      expect(/-(subtle|bold|bolder|subtler)$/.test(k), `${g}.${k} uses a relative modifier`).toBe(
        false,
      );
    }
  });

  it("27-F40: colour tokens carry a role-first prefix", () => {
    for (const k of Object.keys(color)) {
      expect(/^(bgColor|fgColor|borderColor)-/.test(k), `${k} lacks a role prefix`).toBe(true);
    }
  });

  it("27-F41: space is flat ordinal, never a semantic gap/inset split", () => {
    for (const k of Object.keys(group("space"))) expect(k).toMatch(/^space-\d+$/);
  });

  it("27-F42: typography tokens are composite, never atomic", () => {
    for (const [k, v] of Object.entries(group("typography"))) {
      for (const prop of ["fontFamily", "fontSize", "lineHeight", "fontWeight", "letterSpacing"]) {
        expect(v[prop], `typography.${k} is missing ${prop}`).toBeDefined();
      }
    }
  });

  it("27-F46: the rename pipeline exists before the first token ships", () => {
    // Every mature system surveyed renamed 2–3 times; one changed its tier vocabulary between
    // consecutive majors. `replacement` is what drives the codemod when that happens to us.
    for (const [g, k, v] of all) {
      expect("replacement" in v, `${g}.${k} cannot be renamed safely`).toBe(true);
    }
  });
});

describe("27-F8 — touch minimums are posture-typed, not free numbers", () => {
  it("matches the posture table in the spec exactly", () => {
    const t = group("touch");
    expect(at(t, "touch-counter").value).toBe(76);
    expect(at(t, "touch-keypad").value).toBe(126);
    expect(at(t, "touch-kitchen").value).toBe(96);
    expect(at(t, "touch-handheld").value).toBe(64);
    expect(at(t, "touch-floor").value).toBe(48);
    expect(at(t, "touch-gap-min").value).toBe(8);
  });

  it("keeps the kitchen above the standing-counter minimum", () => {
    // Deliberate: the kitchen is where the 21.34% wet-hand error was measured, and the
    // operator is also reading at 1–2 m. Doc 21's superseded "KDS bump targets ≥64dp" came
    // from no posture study at all.
    const t = group("touch");
    expect(at(t, "touch-kitchen").value as number).toBeGreaterThan(
      at(t, "touch-counter").value as number,
    );
  });

  it("never drops below the absolute floor", () => {
    const t = group("touch");
    const floor = at(t, "touch-floor").value as number;
    for (const [k, v] of Object.entries(t)) {
      if (k === "touch-gap-min") continue;
      expect(v.value as number, `${k} is below the floor`).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe("27-F22 / 27-F23 — numerals and money", () => {
  it("uses Rs symbol-first, 3-digit grouping, no operational decimals", () => {
    const m = group("money");
    expect(at(m, "money-symbol").value).toBe("Rs"); // not ₨, not PKR in staff UI
    expect(at(m, "money-grouping").value).toBe(3); // Pakistan does NOT inherit lakh grouping
    expect(at(m, "money-decimals-operational").value).toBe(0);
  });

  it("never admits Eastern Arabic-Indic digits anywhere in the manifest", () => {
    // CLDR sets ur and ur-PK to `latn`. Pakistani coins, number plates, banknote security
    // numerals and the raised tactile numeral for the blind are all Latin.
    expect(JSON.stringify(tokens)).not.toMatch(/[٠-٩۰-۹]/);
  });
});

describe("27-F26 — the typeface is chosen on fail-safe defaults", () => {
  it("ships IBM Plex Sans and never Roboto for numerals", () => {
    for (const [k, v] of Object.entries(group("typography"))) {
      expect(v.fontFamily as string, `typography.${k}`).toMatch(/IBM Plex Sans/);
      // Roboto has identical I/l outlines, no slashed zero, no disambiguation set. Unfixable.
      expect(v.fontFamily as string).not.toMatch(/Roboto/);
    }
  });
});

describe("27-F27 — KDS type is specified in arcmin, never dp", () => {
  it("keeps the 30-arcmin primary safety factor above the ISO 9241-303 range", () => {
    const k = group("kds");
    expect(at(k, "kds-primary-arcmin").value).toBe(30);
    expect(at(k, "kds-secondary-arcmin").value as number).toBeGreaterThanOrEqual(20);
    expect(at(k, "kds-minimum-arcmin").value).toBe(16);
  });

  it("derives a real cap-height in millimetres from the reference distance", () => {
    // cap_mm = 2 * distance * tan(arcmin / 2). At 1.5 m and 30 arcmin this is ~13 mm — which
    // is why 27-F28 says a 10" tablet cannot be a KDS: only physical height buys capacity.
    const k = group("kds");
    const d = at(k, "kds-reference-distance-mm").value as number;
    const arcmin = at(k, "kds-primary-arcmin").value as number;
    const capMm = 2 * d * Math.tan(arcmin / 60 / 2 / (180 / Math.PI));
    expect(capMm).toBeGreaterThan(12);
    expect(capMm).toBeLessThan(14);
  });
});
