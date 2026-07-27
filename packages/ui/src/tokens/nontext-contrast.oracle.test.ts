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
  p("Tile.tsx:71", "tile fill vs the page behind it", "bgColor-surface-raised", "bgColor-surface"),
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
 * Status fills, against the surfaces they are ACTUALLY drawn on. 27-F15 says "the fill
 * carries it — never a dot, badge or thin rule". A fill that cannot be told from the card
 * it sits on is not carrying anything.
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
];

/**
 * SELECTED-STATE differences. SC 1.4.11 covers "states" as well as components: if the only
 * difference between selected and unselected is a sub-3:1 fill, the state is not conveyed.
 * Where a component carries an INDEPENDENT >=3:1 signal (TabRail's 3 px accent underline),
 * that signal is listed here instead and is what must clear the floor.
 */
const STATES: readonly Pair[] = [
  p(
    "TabRail.tsx:87",
    "active-tab accent underline vs rail (the independent signal)",
    "bgColor-interactive",
    "bgColor-surface-sunken",
  ),
  p(
    "TabRail.tsx:77/79",
    "active vs inactive tab fill",
    "bgColor-surface-raised",
    "bgColor-surface-sunken",
  ),
  p(
    "ItemGrid.tsx:156/157",
    "current vs other page-button fill",
    "bgColor-surface-raised",
    "bgColor-surface-sunken",
  ),
  p(
    "NumericKeypad.tsx:81/83",
    "blocked vs live key fill",
    "bgColor-surface-sunken",
    "bgColor-surface-raised",
  ),
  p(
    "AppShell.tsx:68",
    "training tint vs normal shell",
    "bgColor-surface-sunken",
    "bgColor-surface",
  ),
];

describe.each(POLARITIES)("SC 1.4.11 on the %s palette", (polarity) => {
  const c = palette[polarity];
  const ratio = ({ fg, bg }: Pair): number => contrastRatio(c[fg], c[bg]);

  describe("a control must have a perceivable boundary", () => {
    it.each(BOUNDARIES)("$where — $what", (pair) => {
      expect(ratio(pair)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });
  });

  describe("a status fill must be visible on the surface it is drawn on (27-F15)", () => {
    it.each(STATUS_FILLS)("$where — $what", (pair) => {
      expect(ratio(pair)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    });
  });

  describe("a state change must be carried by something visible", () => {
    it.each(STATES)("$where — $what", (pair) => {
      expect(ratio(pair)).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
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
  "27-F63 on the %s palette — the training tint is a safety signal",
  (polarity) => {
    it("distinguishes a training shell from a live one on the surface alone", () => {
      // The band is unmissable (16.91:1) but 27-F63 requires "a persistent full-width band PLUS
      // a visibly different surface tint on every screen". The tint is the half that survives
      // when the band is scrolled past, occluded by an alarm, or simply not looked at — and the
      // failure it guards is a member of staff treating a real order as practice. If the tint is
      // below 3:1 the requirement has one half, not two.
      const c = palette[polarity];
      const ratio = contrastRatio(c["bgColor-surface-sunken"], c["bgColor-surface"]);
      expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
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
