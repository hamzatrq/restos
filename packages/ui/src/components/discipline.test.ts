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
    // text measured 1.89:1 — under AA and under the 3:1 non-text floor — which defeats the
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

describe("27-F64/F66 — the relief is only real if the outline is actually rendered", () => {
  // ORACLE ROUND 2 / A9. `nontext-contrast.oracle.test.ts` relieves a status FILL of SC 1.4.11
  // on the ground that its OUTLINE carries the boundary instead. But the outline test gates
  // outline TOKENS against surfaces — it never checks that the component drawing the fill draws
  // one. Two did not: TabRail's count badge (2.91:1 light) and TicketCard's DONE bump button
  // (2.35:1 dark, on the KDS's own polarity, with `border: "none"`). Both were relieved on
  // account of a boundary that did not exist.
  //
  // This is the missing half, and it is structural rather than numeric: if a component names a
  // status fill, it must also name that fill's outline.
  it("every component using a status fill also renders its outline token", () => {
    const STATUS_FILLS = [
      "bgColor-status-abnormal",
      "bgColor-status-fault",
      "bgColor-status-confirmed",
      "bgColor-interactive",
    ] as const;
    const missing: string[] = [];
    for (const [name, src] of sources) {
      if (name.endsWith(".stories.tsx")) continue;
      for (const fill of STATUS_FILLS) {
        // The fill must be used as a FILL — `background:` — not merely mentioned. A component
        // that names the token in a type or a map without painting with it owes no outline.
        const paints = new RegExp(`background:[^,;]*"${fill}"`).test(src);
        if (!paints) continue;
        const outline = fill.replace("bgColor-", "outlineColor-");
        if (!src.includes(outline)) missing.push(`${name} paints ${fill} without ${outline}`);
      }
    }
    expect(missing, "a status fill relieved of SC 1.4.11 with no outline to carry it").toEqual([]);
  });
});

describe("27-F19/F67 — a component reads the palette in force, never a hard-coded polarity", () => {
  // ORACLE ROUND 2 / A7. All 14 components call `useColor()` today and NOTHING held them to it:
  // a reviewer reverted one to the static light-only `color` record and the whole suite stayed
  // green. That matters more than it sounds. 27-F67's argument for polarity inversion as the
  // training signal is that the inversion is TOTAL — so one component reading the static record
  // renders a production-coloured region inside a training shell, which is precisely the
  // "staff member treats a real order as practice" failure 27-F63 exists to prevent. It breaks
  // 27-F19's KDS opt-in in the same way and for the same reason.
  it("every component resolves colour through useColor(), not the static record", () => {
    const offenders: string[] = [];
    for (const [name, src] of sources) {
      if (name.endsWith(".stories.tsx")) continue;
      if (!src.includes("color[")) continue; // renders no colour at all — nothing to hold
      const viaHook = /const\s+color\s*=\s*useColor\(\)/.test(src);
      // Importing the static record from the token module is the bypass, and it is the exact
      // idiom `TOKENS.md` still teaches — which is why this is a test and not a convention.
      const viaStatic = /import\s*\{[^}]*\bcolor\b[^}]*\}\s*from\s*"\.\.\/tokens\/index"/.test(src);
      if (!viaHook || viaStatic) offenders.push(name);
    }
    expect(offenders, "a component that cannot follow the polarity in force").toEqual([]);
  });
});

describe("01-F59 — availability is NOT an 01-F17 block", () => {
  // ORACLE ROUND 2 / A14. `Tile` set `disabled={unavailable}`, so an 86'd item could not be sold
  // at all. 01-F59 says the opposite in terms: "Availability is not an 01-F17 block … the
  // counter may still sell it deliberately — 02-F31 owns the oversell path." 02-F7 asks only
  // that it "grey out", and 02-F40's founder ruling names 02-F31's oversell handling as what
  // absorbs the printer-only kitchen's delay — which requires the counter to be ABLE to sell.
  //
  // Structural rather than behavioural because this package renders nothing in test: the claim
  // is about what the component can express, and `disabled` is what took the path away.
  // Scoped to `Tile`, deliberately. `TabRail` also has an `unavailable`, and there it means a
  // SURFACE THAT DOES NOT EXIST — a tab with no screen behind it — where `27-F4`'s
  // disabled-in-place is exactly right and pressing it could do nothing useful. Two different
  // concepts wearing one word; only the sellable one is governed by 01-F59, and a guard that
  // conflated them would force a wrong fix on the other.
  it("Tile never disables a sellable item on availability alone", () => {
    const tile = sources.find(([name]) => name === "Tile.tsx");
    expect(tile, "Tile.tsx left the scan").toBeDefined();
    expect(
      /disabled=\{[^}]*\bunavailable\b[^}]*\}/.test(tile?.[1] ?? ""),
      "an 86'd item that cannot be sold — the platform withholding a sale on availability state",
    ).toBe(false);
  });
});
