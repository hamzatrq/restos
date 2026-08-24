// **A TYPE TOKEN SPREAD INTO AN INLINE STYLE EMITS A UNITLESS `line-height`, AND THAT MADE THREE
// KEYPAD KEYS UNPRESSABLE.** `27-F42` / `27-F23` / `02-F61`.
//
// ## The defect, measured in Blink on `counter-1366` under `03-F5`'s band (August 2026)
//
// `TypeStyle.lineHeight` is a NUMBER of dp — `text-label` carries `20`. React does **not** append
// a unit to `lineHeight`; it is on React's unitless-property list. So `style={{ ...label }}` emits
// the declaration `line-height: 20`, which is a MULTIPLIER, and Blink resolved it against the
// 14 px font as **`line-height: 280px`**. `LineCorrection` spread the token twice, so two
// single-line paragraphs each claimed a **280 dp** box instead of 20.
//
// The footer paragraph is the last flex item of a `height: 100%` column whose `Panel` siblings all
// set `minHeight: 0`. A plain `<div>` keeps `min-height: auto` and therefore cannot shrink below
// its content, so **the panels absorbed the entire shortfall**, shrank below their own content
// and — having no `overflow` of their own — painted that content over the region beneath. Measured:
// `How much` held 580 dp in a 381 dp box, the footer row sat at y=582 across the keypad's bottom
// rank, and `document.elementFromPoint` at the centres of `C`, `0` and `⌫` returned the footer
// `div` and its `<p>` instead of the keys. `0` is needed for every round discount (Rs 150, Rs 200,
// Rs 50), so the surface could not do its most ordinary job.
//
// ## What each half of this file is for, and what neither can do
//
// §A is the ROOT CAUSE, and it is what runs in CI: `pnpm test` renders under **happy-dom, which
// performs no layout at all** (`T11`), so no test here can see a covered control — but happy-dom
// keeps the inline declaration verbatim, so it can see the unitless value that causes it. §B is
// the CLASS rather than the instance (`L11`): the trap is armed at every spread site in the
// product, and `packages/ui`'s `ItemTile` already worked around it silently at its own call site
// while `Panel` avoids it by assembling fields by hand — which is what `27-F42` tells callers not
// to do. Every other consumer in the repo restates `lineHeight` in `px`; these two did not.
//
// **Neither half proves the keys are pressable.** That is `pnpm layout:check`'s COVERED verdict,
// which hit-tests in a real Blink layout, and a scripted `.click()` cannot substitute for it —
// `HTMLElement.click()` dispatches on the node directly and never consults what is painted over it,
// which is why the surface accepted three scripted discounts while a finger could not have typed
// one.
//
// PROVENANCE: written alongside the fix (`20 §4.3` as amended by R66). `LineCorrection` is a
// renderer surface and not a `20 §4.4` protected path.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CampaignOffer } from "../shared/ipc";
import { LineCorrection } from "./LineCorrection";

afterEach(cleanup);

const LINES = [
  {
    line_id: "line-a",
    name: "Chicken Karahi",
    quantity: 1,
    billed_paisa: 45_000,
    states: ["confirmed"] as readonly string[],
  },
];
const OFFERS: CampaignOffer[] = [{ campaign_id: "camp-bank", bound_paisa: 10_000 }];

/**
 * Every inline `line-height` in a rendered tree, paired with the text that carries it.
 *
 * `getComputedStyle` is deliberately NOT used: happy-dom lays nothing out, so a computed value
 * here would be an invention. The inline declaration is a FACT the DOM records verbatim, and it is
 * the exact thing that was wrong.
 */
const inlineLineHeights = (root: HTMLElement): { text: string; value: string }[] =>
  [...root.querySelectorAll<HTMLElement>("*")]
    .map((el) => ({
      text: (el.textContent ?? "").trim().slice(0, 32),
      value: el.style.lineHeight,
    }))
    .filter((d) => d.value !== "");

describe("§A 27-F23 — no rendered element carries a UNITLESS line-height", () => {
  it("the correction surface, in the state a cashier meets first", () => {
    const { container } = render(
      <LineCorrection
        lines={LINES}
        campaigns={OFFERS}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const found = inlineLineHeights(container);
    // 24-F14 — a sweep that inspected nothing must FAIL rather than report a clean surface. The
    // footer paragraph carries a `line-height` in every state of this surface, so zero here means
    // the walk broke or the surface stopped rendering, not that the property holds.
    expect(found.length, "no inline line-height was inspected at all").toBeGreaterThan(0);
    for (const d of found) {
      // MUTANT THIS KILLS: `{...label}` with no `lineHeight` restated — the shipped defect. React
      // writes `line-height: 20`, Blink reads it as 20x the font size, and the element claims
      // 280 dp of a 926 dp surface.
      expect(d.value, `"${d.text}" has a unitless line-height (${d.value})`).toMatch(
        /^\d+(\.\d+)?(px|rem|em)$|^normal$/,
      );
    }
  });
});

/**
 * The type-token locals this file knows about, and the spread forms that reach them.
 *
 * A spread of any of these into a style object must restate `lineHeight` in `px`, because the
 * token's own value is a bare dp number and React will not add the unit.
 */
const TOKEN_SPREAD = /\.\.\.(typography\[[^\]]+\]|label|heading|priceType|base|t)\s*,/g;

const sourcesUnder = (dir: string): [string, string][] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.(test|stories)\./.test(e.name))
    .map((e) => [join(dir, e.name), readFileSync(join(dir, e.name), "utf8")]);

/** The object literal a spread sits inside, by brace depth from the spread's own `{`. */
const enclosingObject = (src: string, at: number): string => {
  let open = at;
  let depth = 0;
  for (let i = at; i >= 0; i -= 1) {
    if (src[i] === "}") depth += 1;
    else if (src[i] === "{") {
      if (depth === 0) {
        open = i;
        break;
      }
      depth -= 1;
    }
  }
  let d = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") d += 1;
    else if (src[i] === "}") {
      d -= 1;
      if (d === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
};

describe("§B 27-F42 — every spread of a type token restates lineHeight in px", () => {
  it("across the renderer and the closed vocabulary", () => {
    // vitest runs with the package root as cwd; `import.meta.url` is rewritten under the dom
    // environment and does not resolve to a real path here.
    const files = [
      ...sourcesUnder(join(process.cwd(), "src/renderer")),
      ...sourcesUnder(join(process.cwd(), "../../packages/ui/src/components")),
    ];
    // 24-F14 — an empty scan is a broken scan, not a clean repo.
    expect(files.length, "no sources were scanned").toBeGreaterThan(10);
    let spreads = 0;
    const offences: string[] = [];
    for (const [path, src] of files) {
      for (const m of src.matchAll(TOKEN_SPREAD)) {
        const object = enclosingObject(src, m.index);
        // Only a STYLE object is at risk: a spread into props or a plain record never becomes CSS.
        if (!/(font-?Size|fontFamily|color|margin|display|letterSpacing)/i.test(object)) continue;
        spreads += 1;
        if (!/lineHeight:\s*`\$\{[^`]*\}px`/.test(object)) {
          offences.push(`${path.split("/").slice(-2).join("/")}: ...${m[1]}`);
        }
      }
    }
    expect(spreads, "no type-token spread was found to check").toBeGreaterThan(0);
    // MUTANT THIS KILLS: any future `{...typography["text-label"]}` written without the unit —
    // which is exactly how this defect arrived, on a surface whose author had `ItemTile`'s
    // correct workaround one package away and no rule pointing at it.
    expect(offences, `type token spread without a px lineHeight:\n${offences.join("\n")}`).toEqual(
      [],
    );
  });
});
