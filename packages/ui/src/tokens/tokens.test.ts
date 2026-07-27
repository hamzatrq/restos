// Acceptance tests for the doc-27 token layer.
//
// These re-derive the design claims rather than restating them. 27-F47 is honest that
// 27-F38..F43 rest on historical evidence rather than measurement — but 27-F15 and 27-F21
// are arithmetic, and arithmetic can be checked. So it is checked here, on every commit,
// which is the difference between a design system and a mood board.

import { describe, expect, it } from "vitest";
import { contrast } from "./color-science";
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

// 27-F15 and 27-F17 MOVED to `palette-ladder.oracle.test.ts` (oracle session, 24 §3 step 2).
//
// What used to live here asserted the pre-amendment design and would now be wrong in three
// ways, so it is retired rather than re-pointed:
//
//   - the ΔE00 floor of **31.4**, which 27-F15 no longer carries. It was measured on one pair,
//     on a different ladder, with no separation gate applied, and the amended FR replaces it
//     with **>= 20 on the WORST pair, with the 27-F21 separation gate held**;
//   - a "naive traffic light" exemplar built from two red-oranges, reproducing a real collapse
//     but not the GREEN-VS-RED one the 8.2 figure describes;
//   - a lightness ordering hardcoded to the LIGHT direction (`surface > abnormal > fault`),
//     which cannot express 27-F19's dark opt-in at all — on a dark field a severe state is
//     lighter than the page, not darker.
//
// It also contained a `27-F17` red/green assertion at a self-chosen `> 15` with a comment
// conceding the result was "EXPECTED to be weak". A threshold that appears in no spec, chosen
// by the session that wrote the palette, is not a gate.
//
// The replacement runs every pair of the 27-F14 allocation across BOTH polarities. Two files
// asserting one law with two different numbers is the drift that made this round necessary.
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
