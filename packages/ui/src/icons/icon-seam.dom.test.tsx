// THE SEAM GUARD FOR `27 §5`'s ICON VOCABULARY — written by the ADVERSARIAL MUTATION PASS on
// `1986e71`, not by the implementer and not by the test author.
//
// PROVENANCE, stated because it decides how much this file is worth: it was written AFTER the
// implementation, from measured mutants, and every assertion below names the mutant it kills and
// the number that mutant scored before it existed. It does NOT belong to `icon-vocabulary.test.ts`
// / `icon-drawing.dom.test.tsx` — those two are the authored acceptance suites (`24 §3` step 2)
// and are byte-identical to `3dd4d78`. This file is deliberately separate so that provenance
// stays readable.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY IT EXISTS: THE VOCABULARY WAS DECORATIVE, IN THE RAIL'S OWN WORDS.
//
// `AGENTS.md` names this wave's recurring defect — *"A CORRECT SUBSYSTEM WITH NO SEAM TO THE
// PRODUCT"* — and prescribes the test for it: *"mutate the SEAM, not the logic — delete the call
// site and see whether anything reddens. If nothing does, the subsystem is decorative."* Three
// seams were cut, one at a time, on the shipped tree:
//
//   1. both `icon={…}` attributes deleted from `apps/pos-electron/src/renderer/Counter.tsx`
//      → pos-electron **1006/1006**, ui **387/387**, `typecheck` 0, `seams:check` clean
//   2. `TenderPanel` reverted to `{METHOD_LABEL[m]}`, the pre-icon line
//      → ui **387/387**, pos-electron **1006/1006**
//   3. `Tile` keeping the `icon` prop and IGNORING it — the port supplied with a stub
//      → ui **387/387**, pos-electron **1006/1006**, `typecheck` 0
//
// Zero kills across all three. `seams:check` is structurally blind here and it is worth saying
// exactly why rather than filing it as "the rail missed it": Rule B's `callSites()` looks for
// `\bName\s*\(`, and a React component is never a call expression — a symbol-precise sweep of
// `apps/*/src`, `services/*/src` and `packages/*/src` finds **zero** call-expression uses of
// `Tile`, `IconLabel` or `TenderPanel` against 7 JSX uses of `Tile` in `Counter.tsx` alone. So
// `TileProps.icon` was never a Rule B candidate, and no optional prop of any component in this
// package can be.
//
// THE LIVE HAZARD THAT MAKES THIS URGENT RATHER THAN TIDY: the sibling branch `w7/channels`
// rewrites `ORDER_CHANNELS_AT_COUNTER` in the same file and same lines, back to
// `readonly { id: string; label: string }[]` and with no `icon=`. Applying that hunk on top of
// this branch leaves `pnpm typecheck` at exit 0 — the `IconName` typing that was supposed to make
// a symbol-less row a compile error goes with it — and of the 57 tests that then fail, **zero**
// mention an icon, an svg or a symbol. A merge resolution that takes one side of a conflict would
// un-ship the counter's icons and no gate would say so. §A is what says so.

import { PAYMENT_METHODS, paisa } from "@restos/domain";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TenderPanel } from "../components/TenderPanel";
import { Tile } from "../components/Tile";
import { ThemeProvider } from "../theme";
import { type TypeName, typography } from "../tokens/index";
import { ICON_NAMES, IconLabel } from "./index";

afterEach(cleanup);

/** The drawing, as the DOM sees it. `27-F35` makes it decorative, so it has no name to query by. */
const drawingsIn = (el: Element): SVGElement[] =>
  Array.from(el.querySelectorAll("svg")) as unknown as SVGElement[];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — A TILE GIVEN A SYMBOL DRAWS IT, AND STILL SAYS THE WORD
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 27 §5 — the seam from a tile to the vocabulary", () => {
  it("draws the symbol a caller names, beside the word and never instead of it", () => {
    // KILLS THE STUB MUTANT (seam 3 above), which scored 387/387 + 1006/1006 + typecheck 0.
    // `Tile` declared `icon`, `Counter` passed it, and the component rendered `<span>{label}</span>`
    // regardless. `AGENTS.md` names this shape as one the rail cannot express: *"Rule B asks
    // whether an optional member is supplied, never whether what was supplied is real, and a stub
    // is a supply."* Both halves are asserted in one test on purpose — a guard that only counted
    // the drawing would be satisfied by an icon-only tile, which is the `27-F35` failure, and a
    // guard that only counted the word is the test that already existed and passed the stub.
    render(
      <ThemeProvider>
        <Tile posture="counter" label="Dine-in" icon="dine_in" onPress={() => {}} />
      </ThemeProvider>,
    );
    const tile = screen.getByRole("button", { name: "Dine-in" });
    expect(drawingsIn(tile), "the tile named a symbol and drew nothing").toHaveLength(1);
    expect(tile.textContent, "27-F35: the word never leaves the glass").toContain("Dine-in");
  });

  it("draws nothing when no symbol is named — 27-F37's cap is what makes that the normal case", () => {
    // THE CONTROL for the assertion above, and a real property besides: `27-F37` caps the set at
    // ~25 absolutely stable symbols, so a menu tile — *"a recognition target at a fixed grid
    // position, not a symbol to be learned"*, that FR's own distinction — legitimately has none.
    // Without this, an implementation that drew SOMETHING on every tile would pass §A.
    render(
      <ThemeProvider>
        <Tile posture="counter" label="Karahi" onPress={() => {}} />
      </ThemeProvider>,
    );
    const tile = screen.getByRole("button", { name: "Karahi" });
    expect(drawingsIn(tile)).toHaveLength(0);
    expect(tile.textContent).toContain("Karahi");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE FIVE CO-DISPLAYED TENDERS, WHICH IS THE CASE `27-F34` IS ABOUT
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F34 — every tender on the settlement row carries its symbol", () => {
  it("draws one symbol on each of the five, and keeps every word", () => {
    // KILLS THE TENDERPANEL SEAM MUTANT (seam 2 above), which scored 387/387 + 1006/1006.
    //
    // `27-F34` validates by MUTUAL DISTINCTNESS among co-displayed siblings, and this row is
    // where that bites: five tenders side by side on the counter's highest-consequence surface.
    // The failure this guards is not "no icons" but the ASYMMETRIC one the implementation's own
    // comment names — *"a row with no symbol among four that have one is the row she cannot
    // name"* — so the sweep is over `PAYMENT_METHODS` itself rather than over a hand-copy, and a
    // sixth tender landing in `domain` reddens here as well as in the vocabulary suite.
    render(
      <ThemeProvider>
        <TenderPanel dueP={paisa(148_500)} onTender={() => {}} />
      </ThemeProvider>,
    );
    // Anti-vacuity (`24-F14`): the sweep is over a non-empty closed vocabulary.
    expect(PAYMENT_METHODS.length).toBeGreaterThanOrEqual(5);
    const bare: string[] = [];
    // The word map is checked against `PAYMENT_METHODS` before it is used, so this sweep cannot
    // go quiet by lagging the kernel — which is the failure mode it exists to catch one layer up.
    const words = new Map<string, string>([
      ["cash", "CASH"],
      ["card", "CARD"],
      ["raast", "RAAST"],
      ["khata_credit", "KHATA"],
      ["aggregator_receivable", "AGGREGATOR"],
    ]);
    expect(
      [...words.keys()].sort(),
      "the word map has forked from PAYMENT_METHODS — 02-F42",
    ).toEqual([...PAYMENT_METHODS].sort());
    for (const [method, word] of words) {
      const button = screen.getByRole("button", { name: word });
      if (drawingsIn(button).length !== 1) bare.push(method);
      expect(button.textContent, "27-F35: the symbol accompanies the word").toContain(word);
    }
    expect(bare, "27-F34: a tender with no symbol beside four that have one").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `21 §5` WANTS THE SYMBOL DOMINANT, AND THE SIZE THAT DELIVERS IT WAS UNPROTECTED
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 21 §5 / 27-F42 — the symbol is drawn larger than its word", () => {
  it("renders the drawing a whole type step above the label at every step of the scale", () => {
    // KILLS THE `SYMBOL_STEP`-IDENTITY MUTANT, which scored 44/44 on the authored suites.
    //
    // Collapsing `SYMBOL_STEP` to the identity map puts the symbol at the word's own step — the
    // implementation's header records what that measured on `27 §1a`'s reference counter panel:
    // **12 CSS px, 3.2 mm of glass**, where *"the awning's valance, the telephone's cord and the
    // chip on the card are all gone"*. `21 §5` asks for *"icons + numbers dominant, minimal
    // words"* and a symbol the same size as a 14 dp word is not dominant by any reading. That
    // number came off a screenshot and nothing defended it, so a later session tidying away an
    // indirection with no test behind it would have got a green board.
    //
    // ⚠ WHAT THIS DOES **NOT** SAY, because the honest boundary matters more than the assertion:
    // it fixes no number and no ceiling. It says STRICTLY LARGER. The ceiling is `layout:check`'s
    // — two steps up was measured as a NEW violation, `[tablet-10.1 caller] 571px in a 567px box`
    // — and legibility is `27-F35`'s, on real staff, unrun. A guard that pinned 24 dp here would
    // be pinning a pixel answer, which is `27-F68` (a)'s named trap.
    //
    // ⚠⚠ THE FIRST DRAFT OF THIS ASSERTION COMPARED AGAINST `fontSize` AND PASSED THE IDENTITY
    // MUTANT 49/49 — the wave's own defect reproduced inside the fix for it, and found only by
    // re-running the mutant against the new guard rather than by reading it. The word occupies
    // its LINE BOX, not its glyph height (`text-label` is 14/20, `text-body` 16/24), and the icon
    // is sized off `lineHeight`; so comparing a line height against a font size left 6 dp of
    // slack and the identity map fitted inside it. The comparand is the word's own `lineHeight`.
    //
    // Top of the scale is excluded on purpose: `SYMBOL_STEP` is deliberately identity at
    // `text-numeric-display` because there is no higher step, so sweeping it would be the "RED
    // under a correct implementation" failure this round's law weighs equally with a vacuous one.
    const scale: TypeName[] = ["text-label", "text-body", "text-numeric-primary"];
    const name = ICON_NAMES[0];
    expect(name, "ICON_NAMES is empty — nothing to size").toBeTruthy();
    if (!name) return;
    for (const size of scale) {
      const { container } = render(
        <ThemeProvider>
          <IconLabel name={name} label="CASH" size={size} />
        </ThemeProvider>,
      );
      const svg = container.querySelector("svg");
      expect(svg, `${size}: the pairing drew no symbol`).toBeTruthy();
      const drawn = Number.parseFloat(svg?.getAttribute("width") ?? "0");
      const wordBox = typography[size].lineHeight;
      expect(
        drawn,
        `${size}: the symbol is ${drawn} dp in a ${wordBox} dp line box — 21 §5 wants it dominant`,
      ).toBeGreaterThan(wordBox);
      cleanup();
    }
  });
});
