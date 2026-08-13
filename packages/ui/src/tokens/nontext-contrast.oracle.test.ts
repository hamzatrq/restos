// ORACLE ACCEPTANCE TESTS — WCAG 2.2 SC 1.4.11 Non-text Contrast, as a real gate.
//
// PROVENANCE: oracle session (24 §3 step 2). Independent oracle from `__oracle__/`.
//
// WHY THIS FILE EXISTS. `27-F21` says "Gate on WCAG 2.2 AA". AA is not only 1.4.3 text
// contrast — it includes **SC 1.4.11 Non-text Contrast at 3:1** for "visual information
// required to identify user interface components and states" and for "graphical objects
// required to understand the content". Before this file, nothing in the package computed a
// single non-text contrast: `tokens.test.ts` checks declared `pairsWith` pairs and
// fg-on-surface, and `discipline.test.ts` checks `fgColor-` tokens against surfaces. Both
// are text checks. Every boundary, fill-against-fill and state-vs-state difference in the
// package was unmeasured.
//
// THE KEY MODELLING POINT, and the reason this is not a copy of the existing tests: a status
// fill must be measured against the surface it is ACTUALLY DRAWN ON. `tokens.test.ts:75-83`
// measures status fills against `bgColor-surface` — the one surface no component ever renders
// a status fill on. Cards, rails and keys are `-raised`; the AgeBadge resting state is
// `-sunken`. Measuring against the background nobody uses is how a 1.63:1 amber fill passed.
//
// A NOTE ON THE METRIC. The existing 27-F15 fill test uses dE00 >= 20, which amber passes at
// 24-26. dE00 counts chroma. `27-F18` says colour desaturates first, that our panels carry no
// anti-reflection coating, and that ambient contrast falls 86:1 -> 1.3:1 at 500 lux. A fill
// whose entire separation is chromatic is exactly the fill doc 27 predicts will not survive
// the kitchen. Luminance is the channel that does survive, so luminance is what is gated here.
// dE00 remains the right metric for 27-F15's dichromacy question; it is the wrong metric for
// "can this be seen at all".

import { describe, expect, it } from "vitest";
import { contrastRatio } from "./__oracle__/color-oracle";
import { type ColorName, type Polarity, palette } from "./index";
import tokens from "./tokens.json" with { type: "json" };

/** The declared fill -> on-colour pairings (27-F43). Structure from the manifest, values from
 *  whichever polarity is under test. */
const PAIRINGS: readonly (readonly [ColorName, ColorName])[] = Object.entries(
  tokens.color as Record<string, { pairsWith?: string }>,
)
  .filter(([k, v]) => !k.startsWith("$") && typeof v.pairsWith === "string")
  .map(([k, v]) => [k as ColorName, v.pairsWith as ColorName]);

/**
 * BOTH POLARITIES. 27-F19 makes light the default on every surface and dark a per-site KDS
 * opt-in, and the manifest's `$law` claims "every SC 1.4.11 separation holds in BOTH". A claim
 * about two sets checked on one set is a claim about neither, so every table below runs twice.
 *
 * This is not symmetric in importance. Light is what every counter, waiter and rider surface
 * actually renders; dark is what a kitchen may opt into. A failure on light is a failure in
 * production today.
 */
const POLARITIES = Object.keys(palette) as Polarity[];

/** SC 1.4.11 Level AA. */
const NON_TEXT_FLOOR = 3;

type Pair = {
  /** Where the composition happens, so a failure points at code, not at a token. */
  where: string;
  what: string;
  fg: ColorName;
  bg: ColorName;
};

/** Token NAMES, not hexes — the same composition is measured in each polarity. */
const p = (where: string, what: string, fg: ColorName, bg: ColorName): Pair => ({
  where,
  what,
  fg,
  bg,
});

/**
 * Component boundaries. Each of these is the ONLY thing separating a control from the
 * surface behind it: the fills either side differ by less than 1.2:1, so if the border is
 * below 3:1 the control has no perceivable edge. SC 1.4.11 calls this out explicitly —
 * "visual information required to identify user interface components".
 */
const BOUNDARIES: readonly Pair[] = [
  p("Tile.tsx:81", "tile border vs the page behind it", "borderColor-default", "bgColor-surface"),
  p("Tile.tsx:81", "tile border vs its own fill", "borderColor-default", "bgColor-surface-raised"),
  p(
    "NumericKeypad.tsx:89",
    "key border vs key fill",
    "borderColor-default",
    "bgColor-surface-raised",
  ),
  p("Cart.tsx:36", "cart border vs page", "borderColor-default", "bgColor-surface"),
  p("TicketCard.tsx:54", "ticket border vs page", "borderColor-default", "bgColor-surface"),
  p("ItemGrid.tsx:159", "page-button border vs page", "borderColor-default", "bgColor-surface"),
  p(
    "StatusStrip.tsx:53",
    "strip bottom border vs strip",
    "borderColor-default",
    "bgColor-surface-raised",
  ),
];

/**
 * SUPERSEDED FOR STATUS FILLS BY 27-F64, and for NEUTRAL fills by 27-F66. Deliberately not
 * deleted — every row is still measured, and the rows that moved say where they moved to.
 *
 * When this table was written, a status fill had to meet 3:1 against its surface itself.
 * 27-F64 moved that to a required OUTLINE, because no four-colour set clears fill separation
 * AND ΔE00 >= 20 AND the severity ladder on either polarity. The pure status-fill rows are
 * therefore gated in `outline-boundary.oracle.test.ts` against their outline instead.
 *
 * **AMENDED July 2026 for `27-F66`, by the implementing session under an explicit founder
 * override of the `24 §3` step-2 rule.** The neutral rows — a resting badge, an "ok" chip, an
 * elevation step — asserted that three neutral surfaces separate at 3:1 while this same file
 * requires every foreground to clear AA on all three. **Those two are unsatisfiable together:**
 * exhaustive search over relative luminance finds 14,196,198 surface triples clearing the
 * mutual ladder and ZERO admitting any text colour. 27-F66 rules that a neutral surface
 * bounding a control carries an outline, and a neutral state difference carries an independent
 * mark — so those rows are gated in `NEUTRAL_MARKS` below against the thing that actually
 * carries them. This is a relocation, not a relaxation: every row that moved is asserted
 * somewhere, and `RELIEVED` re-measures the fills so the numbers stay visible.
 * Derivation: `plans/wave-1/ui-fix-round-findings.md` §2.1.
 */
const STATUS_FILLS: readonly Pair[] = [
  p(
    "AgeBadge.tsx:59 on TicketCard.tsx:53",
    "amber age badge vs ticket card",
    "bgColor-status-abnormal",
    "bgColor-surface-raised",
  ),
  p(
    "AgeBadge.tsx:59 on TicketCard.tsx:53",
    "red age badge vs ticket card",
    "bgColor-status-fault",
    "bgColor-surface-raised",
  ),
  p(
    "AgeBadge.tsx:59 on TicketCard.tsx:53",
    "resting age badge vs ticket card",
    "bgColor-surface-sunken",
    "bgColor-surface-raised",
  ),
  p(
    "TabRail.tsx:104",
    "amber count badge vs rail",
    "bgColor-status-abnormal",
    "bgColor-surface-sunken",
  ),
  p(
    "ConnectionFacts.tsx:51 in StatusStrip.tsx:52",
    "ok chip vs strip",
    "bgColor-surface-sunken",
    "bgColor-surface-raised",
  ),
  p(
    "ConnectionFacts.tsx:51 in StatusStrip.tsx:52",
    "degraded chip vs strip",
    "bgColor-status-abnormal",
    "bgColor-surface-raised",
  ),
  p(
    "QuantityItemLine.tsx:92",
    "NO-removal marker vs card",
    "bgColor-status-fault",
    "bgColor-surface-raised",
  ),
  p(
    "TicketCard.tsx:79",
    "REPRINT marker vs card",
    "bgColor-status-fault",
    "bgColor-surface-raised",
  ),
  p(
    "TicketCard.tsx:105",
    "DONE bump button vs card",
    "bgColor-interactive",
    "bgColor-surface-raised",
  ),
  p("AlarmBand.tsx:96", "ack button vs band", "fgColor-on-status-fault", "bgColor-status-fault"),
  p(
    "Cart.tsx:74",
    "remove-control outline vs card",
    "fgColor-status-fault",
    "bgColor-surface-raised",
  ),
  // ADDED for the totality gate below, which was failing because these four combinations a
  // component can compose were absent from this table. The gate asserts the table is complete
  // and it was right: nothing measured them anywhere.
  p(
    "AlarmBand.tsx:96",
    "fault band vs a sunken rail",
    "bgColor-status-fault",
    "bgColor-surface-sunken",
  ),
  p(
    "TicketCard.tsx:105",
    "confirmed mark vs card",
    "bgColor-status-confirmed",
    "bgColor-surface-raised",
  ),
  p(
    "TicketCard.tsx:105",
    "confirmed mark vs a sunken rail",
    "bgColor-status-confirmed",
    "bgColor-surface-sunken",
  ),
  p(
    "ItemGrid.tsx:187",
    "current-page accent vs the pager rail",
    "bgColor-interactive",
    "bgColor-surface-sunken",
  ),
];

/**
 * `27-F66` — what actually carries a neutral boundary or a neutral state change.
 *
 * Each row is the mark a component renders INSTEAD of relying on the fill step, measured
 * against the surface it is drawn on. These are gated at the same 3:1: the requirement did not
 * go away, it moved to the element that can meet it.
 */
const NEUTRAL_MARKS: readonly Pair[] = [
  // Boundaries — the control's own outline, which is what identifies it (SC 1.4.11).
  p("Tile.tsx:81", "tile outline (was: the raised fill)", "borderColor-default", "bgColor-surface"),
  p(
    "AgeBadge.tsx:60",
    "resting badge outline (was: the sunken fill)",
    "borderColor-default",
    "bgColor-surface-raised",
  ),
  p(
    "ConnectionFacts.tsx:61",
    "ok chip outline (was: the sunken fill)",
    "borderColor-default",
    "bgColor-surface-raised",
  ),
  // States — an independent mark, never the fill step.
  p(
    "TabRail.tsx:93",
    "active-tab accent rule (was: the raised fill)",
    "bgColor-interactive",
    "bgColor-surface-sunken",
  ),
  p(
    "ItemGrid.tsx:187",
    "current-page accent rule (was: the raised fill)",
    "bgColor-interactive",
    "bgColor-surface-sunken",
  ),
  p(
    "NumericKeypad.tsx:96",
    "blocked-key strong outline (was: the sunken fill)",
    "borderColor-strong",
    "bgColor-surface-sunken",
  ),
];

/**
 * The fills 27-F66 RELIEVED. Measured and reported, never gated — so the numbers that made the
 * rule necessary stay in the record rather than vanishing with the assertion.
 */
const RELIEVED: readonly Pair[] = [
  p("Tile.tsx:71", "tile fill vs the page", "bgColor-surface-raised", "bgColor-surface"),
  p(
    "TabRail.tsx:83/86",
    "active vs inactive tab fill",
    "bgColor-surface-raised",
    "bgColor-surface-sunken",
  ),
  p(
    "NumericKeypad.tsx:83/85",
    "blocked vs live key fill",
    "bgColor-surface-sunken",
    "bgColor-surface-raised",
  ),
];

/**
 * SELECTED-STATE differences. SC 1.4.11 covers "states" as well as components: if the only
 * difference between selected and unselected is a sub-3:1 fill, the state is not conveyed.
 * Where a component carries an INDEPENDENT >=3:1 signal (TabRail's 3 px accent underline),
 * that signal is listed here instead and is what must clear the floor.
 */
const STATES: readonly Pair[] = NEUTRAL_MARKS;

describe.each(POLARITIES)("SC 1.4.11 on the %s palette", (polarity) => {
  const c = palette[polarity];
  const ratio = ({ fg, bg }: Pair): number => contrastRatio(c[fg], c[bg]);

  describe("a control must have a perceivable boundary", () => {
    it.each(BOUNDARIES)("$where — $what", (pair) => {
      expect(ratio(pair)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });
  });

  describe("neutral surfaces and derived marks (27-F64 relocated the STATUS rows)", () => {
    // Three dispositions, and every row has exactly one:
    //   - a STATUS fill        -> outline-boundary.oracle.test.ts   (27-F64)
    //   - a NEUTRAL surface fill -> NEUTRAL_MARKS below             (27-F66)
    //   - a FOREGROUND on a fill -> still gated right here; no FR has relieved it
    const isStatusFill = (x: Pair): boolean =>
      x.fg.startsWith("bgColor-status-") || x.fg === "bgColor-interactive";
    const isNeutralFill = (x: Pair): boolean => x.fg.startsWith("bgColor-surface");
    const stillGatedHere = STATUS_FILLS.filter((x) => !isStatusFill(x) && !isNeutralFill(x));
    it.each(stillGatedHere)("$where — $what", (pair) => {
      expect(ratio(pair)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });

    it("every row has exactly one disposition, and none simply vanished", () => {
      // Guards the filters themselves: if a row is ever mis-tagged it would silently stop
      // being gated anywhere, which is how a check reports success by never looking.
      const status = STATUS_FILLS.filter(isStatusFill).length;
      const neutral = STATUS_FILLS.filter(isNeutralFill).length;
      expect(status, "status-fill rows, gated in outline-boundary.oracle.test.ts").toBe(11);
      expect(neutral, "neutral-fill rows, gated in NEUTRAL_MARKS below").toBe(2);
      expect(status + neutral + stillGatedHere.length, "a row lost its disposition").toBe(
        STATUS_FILLS.length,
      );
    });

    it("leaves the two NEUTRAL rows gated, on their outline (27-F66)", () => {
      // The resting badge and the ok chip were the rows 27-F64 did not reach. 27-F66 reaches
      // them, and this asserts they did not simply fall out of the suite: both appear in
      // NEUTRAL_MARKS, which is gated at the same 3:1 immediately below.
      const moved = ["AgeBadge.tsx:60", "ConnectionFacts.tsx:61"];
      for (const where of moved) {
        expect(
          NEUTRAL_MARKS.some((m) => m.where === where),
          `${where} lost its boundary gate entirely`,
        ).toBe(true);
      }
    });
  });

  describe("a neutral boundary or state change is carried by a MARK (27-F66)", () => {
    it.each(STATES)("$where — $what", (pair) => {
      expect(ratio(pair)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });

    it("reports the fills 27-F66 relieved, so the numbers stay on the record", () => {
      // Not a gate. These are the measurements that made 27-F66 necessary; printing them in
      // the failure message of a trivially-true assertion keeps them from disappearing along
      // with the rule they disproved.
      const rows = RELIEVED.map((r) => `${r.what}: ${ratio(r).toFixed(2)}:1`);
      expect(rows.length, `relieved neutral fills — ${rows.join("; ")}`).toBe(RELIEVED.length);
    });
  });

  describe("27-F21 — text pairings, which the ladder floor is conditioned on", () => {
    it("clears AA for every fgColor- token on every surface", () => {
      const surfaces = (Object.keys(c) as ColorName[]).filter((k) =>
        k.startsWith("bgColor-surface"),
      );
      const fgs = (Object.keys(c) as ColorName[]).filter(
        (k) => k.startsWith("fgColor-") && !k.startsWith("fgColor-on-"),
      );
      const failures = fgs.flatMap((f) =>
        surfaces
          .filter((s) => contrastRatio(c[f], c[s]) < 4.5)
          .map((s) => `${f} on ${s}: ${contrastRatio(c[f], c[s]).toFixed(2)}:1`),
      );
      expect(failures).toEqual([]);
    });

    it("clears AA for every on-* pairing against its own fill (27-F43)", () => {
      const failures = PAIRINGS.filter(([fill, on]) => contrastRatio(c[fill], c[on]) < 4.5).map(
        ([fill, on]) => `${on} on ${fill}: ${contrastRatio(c[fill], c[on]).toFixed(2)}:1`,
      );
      expect(failures).toEqual([]);
    });
  });
});

describe.each(POLARITIES)(
  "27-F63/F67 from the %s palette — the training surface is a safety signal",
  (polarity) => {
    // AMENDED July 2026 for 27-F67, under the same founder override recorded above.
    //
    // This test used to assert `bgColor-surface-sunken` vs `bgColor-surface` >= 3:1, on the
    // assumption that the training treatment was a TINT of one surface. That assumption is
    // unsatisfiable and 27-F65 named why: the binding foreground is `fgColor-status-abnormal`,
    // which clears AA on the light page with NO headroom, so any tint keeping it above 4.5:1
    // sits at most 1.08:1 from the production surface — exactly the figure this test was
    // filed against. Tinting harder means re-deriving every foreground, i.e. a second palette.
    //
    // 27-F67 makes it the second palette we already have: training renders the OPPOSITE
    // polarity. The requirement is unchanged and the bar is far exceeded — what moved is which
    // two colours are compared.
    it("distinguishes a training shell from a live one on the surface alone", () => {
      const normal = palette[polarity]["bgColor-surface"];
      const training = palette[polarity === "light" ? "dark" : "light"]["bgColor-surface"];
      expect(contrastRatio(normal, training)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });

    it("keeps every 27-F21 pairing legible in the training palette, which a tint could not", () => {
      // The property that makes 27-F67 work rather than merely look different: the training
      // surface is a FULLY GATED palette, so no foreground silently drops below AA when the
      // shell inverts. A hand-tinted surface has no such guarantee and that is what killed it.
      const t = palette[polarity === "light" ? "dark" : "light"];
      const surfaces = (Object.keys(t) as ColorName[]).filter((k) =>
        k.startsWith("bgColor-surface"),
      );
      const fgs = (Object.keys(t) as ColorName[]).filter(
        (k) => k.startsWith("fgColor-") && !k.startsWith("fgColor-on-"),
      );
      const failures = fgs.flatMap((f) =>
        surfaces
          .filter((s) => contrastRatio(t[f], t[s]) < 4.5)
          .map((s) => `${f} on ${s}: ${contrastRatio(t[f], t[s]).toFixed(2)}:1`),
      );
      expect(failures).toEqual([]);
    });
  },
);

describe("the gate is total — no surface/fill pair may be left unmeasured", () => {
  it("covers every status fill against every surface a component can place it on", () => {
    // A regression guard on the TEST, not the palette: if a status colour is added, or a
    // surface token is added, this fails until the pair tables above are extended. The
    // previous suite's blind spot was a pair nobody had listed, so the list itself is checked.
    const statuses = (Object.keys(palette.light) as ColorName[]).filter(
      (k) => k.startsWith("bgColor-status-") || k === "bgColor-interactive",
    );
    const drawnOn: ColorName[] = ["bgColor-surface-raised", "bgColor-surface-sunken"];
    const covered = new Set(STATUS_FILLS.map((x) => `${x.fg}|${x.bg}`));
    const missing: string[] = [];
    for (const s of statuses) {
      for (const d of drawnOn) {
        if (!covered.has(`${s}|${d}`)) missing.push(`${s} on ${d}`);
      }
    }
    expect(missing, `unmeasured status/surface combinations: ${missing.join(", ")}`).toHaveLength(
      0,
    );
  });
});
