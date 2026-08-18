/**
 * **`00 §5.6` / commandment 7 — the staff screen's sentences live in the string catalogue.**
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2), by the session that wrote
 * `staff-screen.dom.test.tsx` and no implementation. It is that file's structural half.
 *
 * `00 §5.6`: *"String hygiene: user-facing strings live in per-app `strings.ts` catalogs
 * (lint-banned inline) — not i18n, just a mechanical migration path if a second language is ever
 * added."* The parenthesis is the interesting part, because **the lint it names is not wired in
 * this repo** and `scripts/check-strings.mjs` says so in its own header: that rail reads the
 * catalogue and the shipping source for *jargon* (`14-F38`'s four classes), not for the question of
 * whether a rendered sentence came from the catalogue at all. So this rule has no rail, and
 * `14-F34`'s catalogue-completeness assertion in `owner-language.test.ts` cannot see it either —
 * it walks `strings.ts` and is blind by construction to a sentence that never went there.
 *
 * **Why it is worth an assertion on a NEW screen specifically.** `14-F38`'s own measurement found
 * 17 of 143 catalogue entries carrying an FR id, and the rail that now catches those only reaches
 * strings it can find. A sentence typed straight into JSX is invisible to it, and this app's own
 * record has the same shape one layer down: `lib/money.ts` and `lib/price-grid.ts` returned owner
 * refusals as inline text, `price-grid.tsx` rendered them verbatim, and **`strings:check` reported
 * CLEAN while all three were on the glass**.
 *
 * **THE SCANNER TAKES SOURCE TEXT, NOT A PATH** — `plane-scan.ts`'s recorded reason, which is this
 * wave's round-3 law: a scanner that can only ever walk the real tree reports clean and has never
 * been shown to report anything else. Every rule below is fired at a known violation first, and
 * then at `device-list.tsx` — the shipped precedent that already obeys the rule — so a clean report
 * on the new screen is bounded on both sides.
 *
 * ── ⚠ THE BOUNDARY, AND IT RUNS THE OTHER WAY FROM MOST: THIS FILE IS THE ONLY RAIL ────────────
 *
 * **MEASURED on the step-4b mutation matrix, not argued.** With a sentence typed straight into
 * `staff-screen.tsx` — the exact violation this file exists to catch — `pnpm strings:check` is
 * **exit 0 and reports clean**: it scanned the inlined sentence and found no `14-F38` jargon in it,
 * which is the only question that rail asks. `staff-screen.dom.test.tsx` cannot see it either; it
 * reads a rendered DOM and never opens a source file, and an inline sentence renders identically to
 * a catalogued one. The single failing test in that whole run is the last one below.
 *
 * So this is not a second opinion on a rail that already covers the rule. It is the rule's only
 * enforcement on this screen, and deleting it deletes `00 §5.6` here rather than duplicating it.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentPath = (name: string): string =>
  new URL(`../components/${name}`, import.meta.url).pathname;

/**
 * Read a shipped component, with a failure that says which file is missing rather than taking the
 * whole file down as `Tests: no tests` — the shape a `readFileSync` at describe scope produces, and
 * which this repo has recorded as getting misread inside a big turbo run.
 */
const sourceOf = (name: string): string => {
  try {
    return readFileSync(componentPath(name), "utf8");
  } catch {
    throw new Error(
      `apps/backoffice/src/components/${name} does not exist. 14-F14's surface is contracted in ` +
        `staff-screen.dom.test.tsx: the module is \`../components/staff-screen\` exporting ` +
        `\`StaffScreen\`, and workspace.tsx appends it as a fourth tab.`,
    );
  }
};

/** Comments are blanked so a rule cannot fire on prose — including this file's own examples. */
const blankComments = (source: string): string => {
  const out = source.split("");
  const keep = (index: number): void => {
    if (source[index] !== "\n") out[index] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") keep(i++);
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      keep(i++);
      keep(i++);
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) keep(i++);
      keep(i++);
      keep(i++);
      continue;
    }
    i++;
  }
  return out.join("");
};

/**
 * Anything between `>` and `<` that reads as a sentence rather than as code.
 *
 * The exclusions are measured, not guessed: run over all thirteen shipped components in this app
 * the rule reports **zero** hits, and the one it used to report was `ComponentProps<"button"> &
 * VariantProps<…>` in `ui/button.tsx` — a type intersection, which is why `&` joins the code
 * characters. A rule that cries wolf gets switched off, which is worse than the gap it closes.
 */
const CODE_CHARS = /[;={}()[\]&|]/;

const jsxSentences = (source: string): readonly string[] => {
  const code = blankComments(source);
  const found: string[] = [];
  const re = />([^<>{}]{4,})</g;
  for (let match = re.exec(code); match !== null; match = re.exec(code)) {
    const raw = match[1] as string;
    if (CODE_CHARS.test(raw)) continue;
    const value = raw.replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]/.test(value)) continue;
    if (value.split(/\s+/).filter(Boolean).length < 2) continue;
    found.push(value);
  }
  return found;
};

/**
 * A sentence inside a JSX expression container — `{"Add a person"}` — which is the same literal
 * wearing braces.
 *
 * ⚠ **THIS RULE EXISTS BECAUSE THE FIRST DRAFT OF THIS FILE MISSED IT, AND THE MISS WAS MEASURED
 * RATHER THAN IMAGINED.** A plausible implementation built out-of-tree to prove this suite could go
 * green wrote every one of its sentences as `{"…"}`, and the scanner reported the file CLEAN. That
 * is the round-3 defect in a regex — a guard aimed one keystroke away from the case that matters —
 * and the only reason it was found is that the probe was written before the oracle was trusted.
 */
const bracedSentences = (source: string): readonly string[] => {
  const code = blankComments(source);
  const found: string[] = [];
  const re = /\{\s*(["'])([^"'\n]{4,})\1\s*\}/g;
  for (let match = re.exec(code); match !== null; match = re.exec(code)) {
    const value = (match[2] as string).replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]/.test(value)) continue;
    if (value.split(/\s+/).filter(Boolean).length < 2) continue;
    found.push(`{"${value}"}`);
  }
  return found;
};

/**
 * The attribute half. `placeholder` is the one that matters most here: `01-F60`'s *"no price"* is a
 * placeholder on this app's price grid and lives in the catalogue for exactly this reason, and a
 * PIN or a name field is where the next one would be typed inline. The list is this app's own text
 * props (`ui/field.tsx`, `ui/surface.tsx`) rather than every attribute, because `className`, `id`
 * and `type` carry quoted strings on every line of every component and are not sentences.
 */
const humanAttributes = (source: string): readonly string[] => {
  const code = blankComments(source);
  const found: string[] = [];
  const re =
    /\b(placeholder|aria-label|title|alt|label|help|heading|body|action|detail)\s*=\s*"([^"]{4,})"/g;
  for (let match = re.exec(code); match !== null; match = re.exec(code)) {
    found.push(`${match[1]}="${match[2]}"`);
  }
  return found;
};

const inlineText = (source: string): readonly string[] => [
  ...jsxSentences(source),
  ...bracedSentences(source),
  ...humanAttributes(source),
];

describe("the scanner bites before it is used as evidence", () => {
  it("catches a sentence typed straight into JSX", () => {
    expect(inlineText(`<p className="x">Add a person to the till</p>`)).toEqual([
      "Add a person to the till",
    ]);
  });

  it("catches one that wraps across lines, which is how a long sentence is actually written", () => {
    expect(inlineText(`<p>\n  Add a person\n  to the till\n</p>`)).toEqual([
      "Add a person to the till",
    ]);
  });

  it("catches the same literal wearing braces — the case the first draft missed", () => {
    // Measured, not imagined: see `bracedSentences`. An out-of-tree probe wrote every sentence this
    // way and the scanner reported clean.
    expect(inlineText(`<Button>{"Add a person"}</Button>`)).toEqual(['{"Add a person"}']);
  });

  it("catches a human sentence in a placeholder, an aria-label or a text prop", () => {
    expect(
      inlineText(`<Field label="Her name" /><Problem heading="Cannot reach the service" />`),
    ).toHaveLength(2);
  });

  it("does NOT fire on text read from the catalogue", () => {
    expect(inlineText(`<p>{strings.staff.heading}</p>`)).toEqual([]);
  });

  it("does NOT fire on the words inside a comment", () => {
    // This file documents what it bans; the ban must not fire on the documentation.
    expect(inlineText(`{/* the heading says Add a person to the till */}\n<p>{s.h}</p>`)).toEqual(
      [],
    );
  });

  it("clears the shipped precedent — device-list.tsx, which already obeys the rule", () => {
    // The other half of a scanner's honesty. A rule that flags every component proves nothing
    // either, and `14-F12`'s list is the screen this one is modelled on.
    expect(inlineText(sourceOf("device-list.tsx"))).toEqual([]);
  });
});

describe("00 §5.6 — 14-F14's screen renders no sentence of its own", () => {
  it("has a screen to scan at all", () => {
    // `24-F14` empty-match protection: a renamed or unwritten module must FAIL here rather than
    // pass vacuously against an empty string.
    expect(sourceOf("staff-screen.tsx").length).toBeGreaterThan(500);
  });

  it("renders every sentence from the string catalogue, never inline", () => {
    // The failure message IS the work list: each offender prints the sentence to move into
    // `lib/strings.ts`, where `14-F38`'s jargon rail and `14-F34`'s completeness rule can see it.
    expect(inlineText(sourceOf("staff-screen.tsx"))).toEqual([]);
  });
});
