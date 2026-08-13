/**
 * `27-F26` — what can be checked about the bundled face WITHOUT a layout engine.
 *
 * ⚠ **The assertion that actually matters is not here and cannot be.** These tests run under
 * happy-dom, which performs no layout and loads no font, so nothing in this file can distinguish
 * a face that renders from one that 404s. *"The face is loaded"* is asserted in Blink by
 * `pnpm layout:check` (`apps/pos-electron/src/layout-gate/main.ts`), which is where the
 * `document.fonts` battery lives. This file guards the three things that are checkable here:
 * that the generated module still matches its binaries, that the CSS is shaped as `27-F26`
 * requires, and that the declared family is the one the tokens ask for.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tokens } from "../tokens/index";
import { fontFaceCss, PRIMARY_FAMILY } from "./index";
import { PLEX_LATIN_400, PLEX_LATIN_500, PLEX_LATIN_600 } from "./plex-latin";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEIGHTS = [400, 500, 600] as const;
const DATA: Record<number, string> = {
  400: PLEX_LATIN_400,
  500: PLEX_LATIN_500,
  600: PLEX_LATIN_600,
};

/**
 * The CSS with the base64 payloads removed — and it is required, not tidiness.
 *
 * ⚠ **A negative regex over this string is unsound without it, and this was caught by the
 * assertion below failing on a CORRECT implementation.** base64 draws on `[A-Za-z0-9+/]`, so any
 * short alphanumeric token turns up in ~95 KB of it by chance: `ss02` sits at index 2047 of the
 * weight-600 payload. `not.toMatch(/…|ss02/)` therefore reported a bound feature flag in a file
 * that binds none. That is the failure mode AGENTS.md calls *"a test that stays RED under a
 * correct implementation"* — as damaging as a vacuous one, and it reproduced here inside the work
 * fixing a different defect. Every negative assertion about the DECLARATIONS runs on this view.
 */
const declarations = (): string => fontFaceCss().replace(/url\(data:[^)]*\)/g, "url(<payload>)");

describe("27-F26 — the bundled typeface", () => {
  it.each(WEIGHTS)("weight %i's base64 still matches its .woff2 on disk", (weight) => {
    const bytes = readFileSync(join(HERE, `ibm-plex-sans-latin-${weight}-normal.woff2`));
    // If this fails, the binary and the generated module have drifted:
    //   node packages/ui/scripts/generate-font-module.mjs
    expect(DATA[weight]).toBe(bytes.toString("base64"));
  });

  it.each(WEIGHTS)("weight %i decodes to a real woff2 (wOF2 magic)", (weight) => {
    // A truncated or mangled base64 string is still a string, and every other assertion here
    // would pass on one. `wOF2` is the signature the browser checks before it will decode.
    expect(
      Buffer.from(DATA[weight] ?? "", "base64")
        .subarray(0, 4)
        .toString("latin1"),
    ).toBe("wOF2");
  });

  it("declares exactly the three weights the type scale spends", () => {
    // Not a round number chosen for symmetry: the composites reference 400, 500 and 600 and
    // nothing else, and bundling a whole family speculatively is what this task refused.
    const used = new Set(
      Object.values(tokens.typography).flatMap((v) =>
        typeof v === "object" && v !== null && "fontWeight" in v ? [Number(v.fontWeight)] : [],
      ),
    );
    expect([...used].sort()).toEqual([...WEIGHTS]);
    expect(fontFaceCss().match(/@font-face\{/g)).toHaveLength(WEIGHTS.length);
  });

  it("declares the family the TOKENS ask for, not a second name", () => {
    // A face declared under a name the stack does not name is a font that loads and is never
    // used — both halves individually correct, invisible to every rail.
    expect(PRIMARY_FAMILY).toBe("IBM Plex Sans");
    expect(tokens.typography.$family.startsWith(`'${PRIMARY_FAMILY}'`)).toBe(true);
    for (const weight of WEIGHTS) {
      expect(fontFaceCss()).toContain(
        `font-family:'${PRIMARY_FAMILY}';font-style:normal;font-weight:${weight}`,
      );
    }
  });

  it("skips to an installed copy per WEIGHT, never to Regular three times", () => {
    // The bug this pins looks correct: `local('IBM Plex Sans')` on all three faces matches the
    // REGULAR face, so on any machine with Plex installed the scale silently flattens.
    const css = fontFaceCss();
    expect(css).toContain("local('IBMPlexSans-Medium')");
    expect(css).toContain("local('IBMPlexSans-SemiBold')");
    expect(css.match(/local\('IBM Plex Sans'\)/g)).toHaveLength(1);
  });

  it("never binds a feature flag — 27-F26's whole reason for this face", () => {
    // Inter is permitted by the FR only if `tnum` and `ss02` are bound into a non-bypassable
    // token; Plex is chosen so that nothing has to be. A feature setting here would contradict
    // the FR while looking like a safety measure.
    expect(declarations()).not.toMatch(
      /font-feature-settings|font-variant-numeric|["']tnum["']|ss02/,
    );
  });

  it("asks for a swap, never a blocking render", () => {
    // An operational till that renders invisible text during a rush is a different failure from
    // one that flashes a fallback. `optional` is refused for the opposite reason: it may decline
    // the face for a whole page load and run a service in fallback metrics with no signal.
    expect(fontFaceCss()).toContain("font-display:swap");
    expect(declarations()).not.toMatch(/font-display:(block|optional|auto|fallback)/);
  });

  it("keeps Roboto unreachable through the token stack", () => {
    // 27-F26 bans Roboto for numerals: identical I/l outlines, no slashed zero, unfixable.
    // `system-ui` USED to sit in this stack and resolves to Roboto on Android and ChromeOS, so
    // the banned face was reachable while the string never said the word.
    for (const style of Object.values(tokens.typography)) {
      if (typeof style !== "object" || style === null || !("fontFamily" in style)) continue;
      expect(style.fontFamily as string).not.toMatch(/Roboto|system-ui/);
    }
    expect(tokens.typography.$family).not.toMatch(/Roboto|system-ui/);
  });
});
