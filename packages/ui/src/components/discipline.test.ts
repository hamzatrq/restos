// Structural guards on the closed vocabulary (Commandment 6, 21 §2, TOKENS.md).
//
// Every rule here exists because the adversarial pass over the first draft caught a real
// violation of it. They scan source rather than behaviour on purpose: these are properties
// of how the code is WRITTEN, and a rendering test would not see them.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "../tokens/color-science";
import { color } from "../tokens/index";

const DIR = new URL(".", import.meta.url).pathname;
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx"))
  .map((f) => [f, readFileSync(join(DIR, f), "utf8")] as const);

it("has components to check", () => expect(sources.length).toBeGreaterThan(5));

describe("27-F4 — a disabled control still shows its reason, so it stays legible", () => {
  it("never expresses state with an opacity wash", () => {
    // CAUGHT IN REVIEW: Tile used opacity 0.45, TabRail 0.5, NumericKeypad 0.35. The reason
    // text measured 1.97:1 — under AA and under the 3:1 non-text floor — which defeats the
    // entire point of disabling in place rather than hiding. State is carried by FILL
    // (27-F15), which is legible by construction.
    for (const [name, src] of sources) {
      expect(src, `${name} uses opacity to convey state`).not.toMatch(/opacity:\s*[\d.]+\s*[,;]/);
    }
  });
});

describe("27-F8 — touch sizes come from the posture table, never from a literal", () => {
  it("never hardcodes a pixel touch target", () => {
    // CAUGHT IN REVIEW: Cart's remove button was a raw 44 — BELOW the 48 dp absolute floor,
    // on a destructive control. A literal here is exactly what TOKENS.md bans, and this is
    // why: nothing checks a number you typed yourself.
    for (const [name, src] of sources) {
      const hits = [...src.matchAll(/min(?:Width|Height):\s*(\d+)\b/g)];
      for (const h of hits) {
        // Heuristic band, stated openly: 40–200 px is where a literal is plausibly
        // impersonating a touch target. Below 40 it is a badge or chip no finger aims at;
        // above 200 it is a container width (a Cart is 320 wide), which this rule is not
        // about. The band covers every posture in 27-F8, which is what matters.
        const n = Number(h[1]);
        expect(n < 40 || n > 200, `${name}: touch-size literal ${n} — use targetFor(posture)`).toBe(
          true,
        );
      }
    }
  });
});

describe("27-F40 — the role prefix says which property a token belongs to", () => {
  it("never uses a bgColor- token as a foreground", () => {
    // CAUGHT IN REVIEW: MoneyValue, Cart and AlarmBand each set `color:` from a bgColor-
    // token. Primer's stated reason for role prefixes is names that "didn't convey which
    // property to be used with" — using a fill as text silently discards that, and the
    // amber case actually fails AA when you do it (1.53:1).
    for (const [name, src] of sources) {
      expect(src, `${name} sets a foreground from a bgColor- token`).not.toMatch(
        /\bcolor:\s*color\["bgColor-/,
      );
    }
  });

  it("never uses an fgColor- token as a background", () => {
    for (const [name, src] of sources) {
      expect(src, `${name} sets a background from an fgColor- token`).not.toMatch(
        /\bbackground:\s*color\["fgColor-(?!on-)/,
      );
    }
  });
});

describe("27-F21 — every foreground token is legible on the surface it is used on", () => {
  it("clears AA for each fgColor- token against every surface token", () => {
    const surfaces = (Object.keys(color) as (keyof typeof color)[]).filter((k) =>
      k.startsWith("bgColor-surface"),
    );
    const foregrounds = (Object.keys(color) as (keyof typeof color)[]).filter(
      (k) => k.startsWith("fgColor-") && !k.startsWith("fgColor-on-"),
    );
    expect(foregrounds.length).toBeGreaterThan(3);
    for (const fg of foregrounds) {
      for (const bg of surfaces) {
        expect(contrast(color[fg], color[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("TOKENS.md — never a raw value in component code", () => {
  it("contains no hex colour literals", () => {
    for (const [name, src] of sources) {
      expect(src, `${name} contains a hex colour`).not.toMatch(/["']#[0-9a-fA-F]{3,8}["']/);
    }
  });
});
