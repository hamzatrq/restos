// ORACLE ACCEPTANCE TESTS — the closed-vocabulary guards, rebuilt on a real lexer.
//
// PROVENANCE: oracle session (24 §3 step 2). Replaces the regex guards in
// `discipline.test.ts`, which an oracle pass showed were evaded by 21 of 26 plausible
// violations — including `opacity: unavailable ? 0.45 : 1`, which is the exact shape of the
// defect the opacity guard was written to catch.
//
// Each guard below is paired with the evasions it must not permit. The evasion corpus is the
// real deliverable: a guard is only as good as the violations it has been shown to catch, and
// the previous suite had never been shown any.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindings,
  isStringish,
  lex,
  numbersIn,
  type Property,
  properties,
  tokenNamesIn,
} from "../tokens/__oracle__/source-scan";

const SRC = new URL("..", import.meta.url).pathname;

/**
 * SCOPE FIX. The previous guard used a NON-RECURSIVE `readdirSync` over `components/`,
 * filtered to `.tsx`, and excluded `*.stories.tsx`. Three holes followed: a subdirectory was
 * invisible, `.ts` files were invisible, and stories — which are what Storybook and Chromatic
 * actually render, and which live in `packages/ui/src` where TOKENS.md's "never a raw value"
 * rule applies — were exempt.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "__oracle__" ? [] : walk(full);
    if (![".ts", ".tsx"].includes(extname(full))) return [];
    if (/\.test\.tsx?$/.test(full)) return [];
    return [full];
  });

const FILES = walk(SRC).sort();
const sources = FILES.map((f) => [relative(SRC, f), readFileSync(f, "utf8")] as const);

type Violation = { file: string; detail: string };

const scan = (check: (p: Property[], b: ReturnType<typeof bindings>) => string[]): Violation[] =>
  sources.flatMap(([file, src]) => {
    const toks = lex(src);
    return check(properties(toks), bindings(toks)).map((detail) => ({ file, detail }));
  });

/** Run a check against a bare snippet — used to prove the evasion corpus is caught. */
const onSnippet = (
  check: (p: Property[], b: ReturnType<typeof bindings>) => string[],
  code: string,
): string[] => {
  const toks = lex(code);
  return check(properties(toks), bindings(toks));
};

// ---------------------------------------------------------------------------------------
// 27-F4 — state is carried by FILL, never by an opacity wash.
// ---------------------------------------------------------------------------------------

const FG_PROPS = new Set([
  "color",
  "borderColor",
  "borderTopColor",
  "borderBottomColor",
  "outlineColor",
  "textDecorationColor",
  "caretColor",
  "fill",
  "stroke",
]);
const BG_PROPS = new Set(["background", "backgroundColor", "backgroundImage"]);
const SIZE_PROPS = new Set(["minWidth", "minHeight", "width", "height"]);

const opacityCheck = (props: Property[], b: ReturnType<typeof bindings>): string[] => {
  const out: string[] = [];
  for (const p of props) {
    if (p.name === "opacity") {
      if (p.shorthand) {
        out.push("`{ opacity }` shorthand — a computed wash the guard cannot see the value of");
        continue;
      }
      // Fully opaque is not a wash. Anything else is state carried by transparency.
      const values = numbersIn(p.value, b.numbers);
      if (values.some((n) => n !== 1) || values.length === 0) {
        out.push(`opacity: ${p.value.map((t) => t.text).join(" ")}`);
      }
    }
    if (p.name === "filter" && p.value.some((t) => isStringish(t) && /opacity\s*\(/.test(t.text))) {
      out.push("opacity() via filter");
    }
    // rgb()/rgba()/hsl() with an alpha channel is the same wash by another spelling.
    if (
      (FG_PROPS.has(p.name) || BG_PROPS.has(p.name)) &&
      p.value.some((t) => isStringish(t) && /(rgba?|hsla?)\([^)]*[/,]\s*(0?\.\d+)/.test(t.text))
    ) {
      out.push(`${p.name}: alpha channel in a colour function`);
    }
  }
  return out;
};

describe("27-F4 — a disabled control still shows its reason, so it stays legible", () => {
  it("no component expresses state with an opacity wash", () => {
    expect(scan(opacityCheck)).toEqual([]);
  });

  it.each([
    ["the ORIGINAL DEFECT SHAPE — a ternary", "const s = { opacity: unavailable ? 0.45 : 1 };"],
    ["last property, no trailing comma", "const s = { color: x, opacity: 0.45 };"],
    ["object shorthand", "const opacity = d ? 0.45 : 1; const s = { opacity };"],
    ["via filter()", 'const s = { filter: d ? "opacity(0.45)" : "none" };'],
    ["via an rgb() alpha channel", "const s = { color: `rgb(90 100 112 / 0.45)` };"],
    ["via a named constant", "const WASH = 0.45; const s = { opacity: WASH };"],
    ["the plain literal the old guard did catch", "const s = { opacity: 0.45, color: x };"],
  ])("catches: %s", (_label, code) => {
    expect(onSnippet(opacityCheck, code).length).toBeGreaterThan(0);
  });

  it("does not flag a fully-opaque value", () => {
    expect(onSnippet(opacityCheck, "const s = { opacity: 1 };")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// 27-F8 — touch sizes come from the posture table, never from a literal.
// ---------------------------------------------------------------------------------------

const touchCheck = (props: Property[], b: ReturnType<typeof bindings>): string[] => {
  const out: string[] = [];
  for (const p of props) {
    if (!SIZE_PROPS.has(p.name)) continue;
    for (const n of numbersIn(p.value, b.numbers)) {
      // Band stated openly: 40-200 px is where a literal is plausibly impersonating a touch
      // target. Below 40 it is a badge or chip; above 200 a container. The band covers every
      // posture in 27-F8, which is what matters.
      //
      // The scanner does not know whether the element is a control, so the message names both
      // reasons a literal here is wrong, and the fix differs: if it IS a control the size
      // belongs to `targetFor(posture)` (27-F8); if it is not, the number is still a raw
      // value, which TOKENS.md rule 1 bans in `packages/ui/src` outright — and in practice
      // these literals turn out to be token values retyped by hand.
      if (n >= 40 && n <= 200) {
        out.push(
          `${p.name}: ${n} — a control takes targetFor(posture) (27-F8); anything else takes a token, never a literal (TOKENS.md rule 1)`,
        );
      }
    }
  }
  return out;
};

describe("27-F8 — touch sizes come from the posture table, never from a literal", () => {
  it("no component hardcodes a pixel touch target", () => {
    expect(scan(touchCheck)).toEqual([]);
  });

  it.each([
    ["a string px value", 'const s = { minWidth: "44px", minHeight: "44px" };'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this IS the evasion under test
    ["a template literal", "const s = { minHeight: `${44}px` };"],
    ["width/height instead of minWidth/minHeight", "const s = { width: 44, height: 44 };"],
    ["a named constant", "const BUMP = 44; const s = { minHeight: BUMP };"],
    ["the plain literal the old guard did catch", "const s = { minWidth: 44 };"],
  ])("catches: %s", (_label, code) => {
    expect(onSnippet(touchCheck, code).length).toBeGreaterThan(0);
  });

  it("does not flag a badge, a container width, or a posture call", () => {
    expect(onSnippet(touchCheck, "const s = { minWidth: 28 };")).toEqual([]);
    expect(onSnippet(touchCheck, "const s = { minWidth: 320 };")).toEqual([]);
    expect(onSnippet(touchCheck, 'const s = { minHeight: targetFor("kitchen") };')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// 27-F40 — the role prefix says which property a token belongs to.
// ---------------------------------------------------------------------------------------

const roleCheck = (props: Property[], b: ReturnType<typeof bindings>): string[] => {
  const out: string[] = [];
  for (const p of props) {
    const names = tokenNamesIn(p.value, b.strings);
    if (FG_PROPS.has(p.name)) {
      for (const n of names) {
        if (n.startsWith("bgColor-")) out.push(`${p.name} takes a fill token: ${n}`);
      }
    }
    if (BG_PROPS.has(p.name)) {
      for (const n of names) {
        // `fgColor-on-*` names an ON-colour: legitimate as a fill only where the fill IS the
        // pairing's light side. It is still called out, because 27-F43 wants the pairing to
        // be structural (a <Surface>), not a token used backwards by convention.
        if (n.startsWith("fgColor-") && !n.startsWith("fgColor-on-")) {
          out.push(`${p.name} takes a text token: ${n}`);
        }
      }
    }
  }
  return out;
};

describe("27-F40 — the role prefix says which property a token belongs to", () => {
  it("no component uses a bgColor- token as a foreground or an fgColor- token as a fill", () => {
    expect(scan(roleCheck)).toEqual([]);
  });

  it.each([
    [
      "computed key — the idiom ALREADY LIVE in AgeBadge and ConnectionFacts",
      'const ON = { fault: "bgColor-status-fault" }; const s = { color: color[ON[level]] };',
    ],
    [
      "a ternary — the idiom ALREADY LIVE in 6 of 13 components",
      'const s = { color: bad ? color["bgColor-status-fault"] : y };',
    ],
    ["another foreground property", 'const s = { borderColor: color["bgColor-status-abnormal"] };'],
    ["SVG fill", 'const s = { fill: color["bgColor-status-abnormal"] };'],
    [
      "backgroundColor: rather than background:",
      'const s = { backgroundColor: color["fgColor-status-fault"] };',
    ],
    [
      "the plain forms the old guard did catch",
      'const s = { color: color["bgColor-status-fault"] };',
    ],
  ])("catches: %s", (_label, code) => {
    expect(onSnippet(roleCheck, code).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------
// TOKENS.md — never a raw value in package source.
// ---------------------------------------------------------------------------------------

/** Keywords that are the ABSENCE of a colour, not a hand-picked one. */
const NOT_A_COLOUR = new Set([
  "transparent",
  "none",
  "inherit",
  "currentColor",
  "unset",
  "initial",
  "revert",
  "auto",
]);
const NAMED_COLOURS =
  /\b(red|blue|green|black|white|grey|gray|orange|yellow|purple|pink|brown|cyan|magenta|silver|gold|navy|teal|olive|maroon|lime|aqua|fuchsia|darkred|darkblue|darkgreen|lightgrey|lightgray)\b/i;

const rawValueCheck = (props: Property[]): string[] => {
  const out: string[] = [];
  for (const p of props) {
    if (!FG_PROPS.has(p.name) && !BG_PROPS.has(p.name) && !/^border/.test(p.name)) continue;
    for (const t of p.value) {
      if (!isStringish(t)) continue;
      const text = t.text;
      if (/#[0-9a-fA-F]{3,8}\b/.test(text)) out.push(`${p.name}: hex literal in ${text.trim()}`);
      if (/\b(rgba?|hsla?)\(/.test(text)) out.push(`${p.name}: rgb()/hsl() literal`);
      const bare = text.replace(/^["'`]|["'`]$/g, "").trim();
      if (NAMED_COLOURS.test(bare) && !NOT_A_COLOUR.has(bare)) {
        out.push(`${p.name}: CSS named colour "${bare}"`);
      }
    }
  }
  return out;
};

describe("TOKENS.md — never a raw value in package source", () => {
  it("no source file contains a raw colour in a colour-bearing property", () => {
    expect(scan((p) => rawValueCheck(p))).toEqual([]);
  });

  it.each([
    [
      "hex inside a template literal — the idiom every border here uses",
      "const s = { border: `1px solid #8E1F1F` };",
    ],
    ["rgb() notation", 'const s = { background: "rgb(142, 31, 31)" };'],
    ["a CSS named colour", 'const s = { background: "darkred" };'],
    ["the plain form the old guard did catch", 'const s = { background: "#8E1F1F" };'],
  ])("catches: %s", (_label, code) => {
    expect(onSnippet((p) => rawValueCheck(p), code).length).toBeGreaterThan(0);
  });

  it("does not flag `transparent` or `none`, which are the absence of a colour", () => {
    expect(onSnippet((p) => rawValueCheck(p), 'const s = { background: "transparent" };')).toEqual(
      [],
    );
    expect(onSnippet((p) => rawValueCheck(p), 'const s = { border: "none" };')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
// The canary.
// ---------------------------------------------------------------------------------------

describe("the guard suite actually covers the package", () => {
  it("pins the exact file count, so a moved file cannot silently leave the scan", () => {
    // The previous canary was `expect(sources.length).toBeGreaterThan(5)` with 13 files
    // present: seven components could have moved into a subdirectory and it would still pass.
    // A pinned count fails on ANY change to the file set, which is the point — adding a
    // component should require acknowledging that it is now under the guards.
    expect(sources.map(([f]) => f).sort()).toEqual(
      [
        "components/AgeBadge.stories.tsx",
        "components/AgeBadge.tsx",
        "components/AlarmBand.stories.tsx",
        "components/AlarmBand.tsx",
        "components/AppShell.stories.tsx",
        "components/AppShell.tsx",
        "components/Cart.stories.tsx",
        "components/Cart.tsx",
        // ADDED with `01-F56`/`DEC-SYNC-011`'s catalog-health surface — a refused menu, said out
        // loud on the counter's honesty strip. It paints a `27-F14` status fill, so the outline
        // rule (`27-F64`) and the polarity rule (`27-F67`) both bear on it, which is precisely
        // the acknowledgement this pin exists to force.
        "components/CatalogHealth.stories.tsx",
        "components/CatalogHealth.tsx",
        "components/ConnectionFacts.stories.tsx",
        "components/ConnectionFacts.tsx",
        "components/index.ts",
        "components/ItemGrid.stories.tsx",
        "components/ItemGrid.tsx",
        "components/MoneyValue.stories.tsx",
        "components/MoneyValue.tsx",
        "components/NumericKeypad.stories.tsx",
        "components/NumericKeypad.tsx",
        "components/OrderList.stories.tsx",
        "components/OrderList.tsx",
        /**
         * ADDED with the grouping round (August 2026), and the acknowledgement this pin forces is
         * the whole reason `Panel` is under the guards at all: it is the **only** component in
         * the package that takes a `27-F14` status tone as a PROP, so a caller can ask for amber
         * where every other component decides its own colour internally. Three rules bear on it
         * directly — the outline rule (`27-F64`: it paints `bgColor-status-abnormal`, so it must
         * name `outlineColor-status-abnormal`), the polarity rule (`27-F67`: a region that read
         * the static record would stay production-coloured inside a training shell), and the
         * role-prefix rule (`27-F40`, since the abnormal caption uses a fill AND its `on-`
         * pairing in one style object).
         */
        "components/Panel.stories.tsx",
        "components/Panel.tsx",
        /**
         * ADDED with the bring-your-own-hardware round (August 2026), and this pin caught it on
         * the first run — which is the acknowledgement it exists to force.
         *
         * `PanelHealth` says out loud that the glass the till is running on is smaller than the
         * counter layout needs, or that the device could not measure its own screen at all. It
         * exists because the window's floor moved from `minWidth: 1366` — a pixel count, which
         * `27-F11c` says is the wrong quantity — to 215 × 134 mm of glass, **clamped to the
         * display instead of refusing it**. The till now starts on hardware the layout does not
         * fit, and `00 §5.7` makes naming that shortfall the condition of being allowed to.
         *
         * It paints a `27-F14` status fill, so the outline rule (`27-F64`) and the polarity rule
         * (`27-F67`) both bear on it, exactly as they do on `CatalogHealth` above.
         */
        "components/PanelHealth.stories.tsx",
        "components/PanelHealth.tsx",
        /**
         * ADDED with the responsive round (August 2026), and the acknowledgement this pin exists
         * to force is worth writing down because **the guards caught this component twice on its
         * first run**:
         *
         * - `touchCheck` flagged `height: 140/160/180` — a literal in the 40–200 band on a
         *   pressable element. It was right, and the fix was better than the code it replaced:
         *   the card is content-sized now with `targetFor("counter")` as its floor.
         * - `useValidAriaRole` (Biome, not this file) flagged a prop originally named `role`,
         *   which shadows the ARIA attribute at every literal call site.
         *
         * `PersonTile` is `01-F61`'s identification target and `Readout` is the caption-over-
         * payload idiom every money surface now uses, so both are squarely inside `27-F8`'s
         * posture rules and `27-F25`'s ladder.
         */
        "components/PersonTile.stories.tsx",
        "components/PersonTile.tsx",
        "components/QuantityItemLine.stories.tsx",
        "components/QuantityItemLine.tsx",
        "components/Readout.stories.tsx",
        "components/Readout.tsx",
        "components/StatusStrip.stories.tsx",
        "components/StatusStrip.tsx",
        // ADDED with the payment surface (02-F12/F13). It is the highest-consequence entry
        // screen on the counter, so being under the guards is exactly the acknowledgement this
        // pin exists to force.
        "components/TenderPanel.tsx",
        "components/TenderPanel.stories.tsx",
        "components/Surface.tsx",
        "components/TabRail.stories.tsx",
        "components/TabRail.tsx",
        "components/TicketCard.stories.tsx",
        "components/TicketCard.tsx",
        "components/Tile.stories.tsx",
        "components/Tile.tsx",
        "index.ts",
        /**
         * ADDED with the responsive round. Not a component either, and scanned for the same
         * reason `color-science.ts` is: it is source in `packages/ui/src`. It is also the file
         * that decides which layout mode every surface in the product is in (`27-F11c`), so the
         * "never a raw value" rule bearing on it is not academic — the two millimetre boundaries
         * it declares are the closest thing this package has to a magic number, and they are
         * named, derived from `27 §1a`'s hardware table, and asserted in
         * `responsive.dom.test.tsx`.
         */
        "surface-mode.tsx",
        // NOT a component, and scanned on purpose: `color-science.ts` is source in
        // `packages/ui/src` like any other, so TOKENS.md's "never a raw value" rule applies to
        // it too. It was missing from the first draft of this list — a hand-typed inventory,
        // which is the failure mode a pinned list exists to prevent and duly demonstrated on
        // itself. `Surface.tsx` below is the one entry that is deliberately absent from disk:
        // 27-F43 requires it, so this canary stays red until it ships.
        "tokens/color-science.ts",
        "tokens/index.ts",
        // ADDED July 2026 with `theme.tsx`, which is exactly the acknowledgement this pin
        // exists to force: the polarity provider resolves a colour record for every component
        // in the package, so it is squarely source the token rules apply to. It ships for
        // 27-F19's KDS opt-in and 27-F67's training inversion, which are one mechanism.
        "theme.tsx",
        // ADDED with `physical.ts` — 27-F11c's mm↔CSS-px conversion and the ResizeObserver
        // that measures a surface instead of naming a panel. It carries the only two raw
        // numeric constants outside `tokens.json` (96 CSS px per inch, 25.4 mm per inch), and
        // both are DEFINITIONS rather than design values, which is exactly the distinction
        // this pin exists to make someone state out loud.
        //
        // RENAMED to `.tsx` August 2026, and the acknowledgement this pin forces is that the
        // file now RENDERS: `27-F68` / `DEC-UI-001` put `PanelRoot` here, the one element in
        // the product where a dp becomes a pixel. The conversion and the component that applies
        // it live in one module deliberately — two of either is two answers to "how big is a
        // dp", which is the defect the ruling exists to close.
        "physical.tsx",
      ].sort(),
    );
  });

  it("scans stories, which are what Storybook and Chromatic actually render", () => {
    expect(sources.filter(([f]) => f.endsWith(".stories.tsx")).length).toBeGreaterThan(10);
  });

  it("scans .ts files, not only .tsx", () => {
    expect(sources.some(([f]) => f.endsWith("tokens/index.ts"))).toBe(true);
  });
});
