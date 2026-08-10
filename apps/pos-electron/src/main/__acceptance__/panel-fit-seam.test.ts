// `27-F11c` / `27-F68` / `00 §5.7` — the window's floor is GLASS, and below it the till says so.
//
// **WHY THIS FILE EXISTS.** `window-options.ts` declared `minWidth: 1366, minHeight: 768` and
// Electron *prevented* the resize. Measured in a real Blink layout (2026-08-10), that pixel floor
// was wrong on both sides at once: it **refused** a 1280×800 @13.3″ laptop that renders every
// surface of this product with zero violations, and **admitted** a 1366×768 @10.1″ tablet that
// clips two of them. A pixel count is not a size, which is the whole of `27-F11c`.
//
// The floor is `PANEL_FLOOR_MM` now — 215 × 134 mm — and under bring-your-own-hardware it CLAMPS
// to the display instead of refusing it, so the till starts on glass the counter layout does not
// fit. That trade is only defensible if the shortfall is NAMED (`00 §5.7`), which is what
// `resolvePanelFit` and `packages/ui`'s `PanelHealth` are for.
//
// So this file asserts THREE SEPARATE CLAIMS, because this wave has repeatedly shipped one
// without the others and a green run on any one alone proves nothing:
//
//   1. **The floor is physical** — §A. Same millimetres, different pixels per panel, and the two
//      cases the pixel floor got backwards both come out right.
//   2. **The notice is honest** — §B. Including the ordering that matters: a floor verdict
//      computed from a GUESSED density is itself a guess, so `unmeasured` outranks `too_small`.
//   3. **The shipped application supplies it** — §C, read off the source of `main/index.ts` and
//      `renderer/Counter.tsx`, because those files import `electron`/React and cannot be imported
//      here. `panelFit: () => null` typechecks, satisfies the required dep, keeps `seams:check`
//      clean (Rule B asks whether a member is *supplied*, never whether what was supplied is
//      real) and takes the whole surface off the counter. §C is the only thing in this repo that
//      separates the two.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COUNTER_WINDOW_OPTIONS,
  counterWindowOptions,
  PANEL_FLOOR_MM,
  panelFloorPx,
  resolvePanelFit,
} from "../window-options";

const src = (file: string): string =>
  readFileSync(new URL(`../${file}`, import.meta.url).pathname, "utf8");

/**
 * The same file with its comments removed — **and this helper was written because the naive
 * version of §C failed on its first run for the exact reason AGENTS.md names.**
 *
 * `expect(src("window-options.ts")).not.toMatch(/minWidth:\s*\d+/)` went red against a tree that
 * is correct: the only `minWidth: 1366` left in that file is the sentence in its header
 * explaining what the module *used to* declare. A mention is not code — the same distinction
 * `seams:check`'s Rule A makes when it insists a barrel re-export is not a use, and the same
 * measurement mistake AGENTS.md records as *"a proxy for the evidence, accepted as the
 * evidence"*. An assertion that reads doc comments as source will also PASS on a tree where the
 * defect is real and merely undocumented, which is the direction that actually hurts.
 */
const code = (file: string): string =>
  src(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * A real panel, described the way hardware is: pixels and a diagonal. The density falls out,
 * which is the point — nothing here names a PPI, because naming one is how a test ends up
 * asserting its own arithmetic (`27-F68` (a)).
 */
const panel = (widthPx: number, heightPx: number, diagonalIn: number) => ({
  panelPpi: Math.hypot(widthPx, heightPx) / diagonalIn,
  devicePixelRatio: 1,
  workArea: { width: widthPx, height: heightPx },
});

/** The panels the measurement pass actually rendered, with what it measured on each. */
const LAPTOP_1280 = panel(1280, 800, 13.3); // 287 × 179 mm — 0 violations, 13 surfaces
const TABLET_10_1 = panel(1366, 768, 10.1); // 224 × 126 mm — clips two surfaces
const NETBOOK_1024 = panel(1024, 600, 10.1); // 221 × 130 mm — 2 overflows
const COUNTER_1366 = panel(1366, 768, 15.6); // 345 × 194 mm — clean
const COUNTER_1920 = panel(1920, 1080, 15.6); // the SAME glass at more pixels
const DESKTOP_24 = panel(1920, 1080, 24); // the same PIXELS at 1.5× the glass

// ── A. THE FLOOR IS PHYSICAL ─────────────────────────────────────────────────────────────────

describe("27-F11c — the floor is millimetres of glass, not a pixel count", () => {
  it("ADMITS the 1280×800 @13.3″ laptop the pixel floor refused", () => {
    // **The case that motivated the whole change.** 1280 < 1366, so `minWidth: 1366` made this
    // panel unopenable — and it is 287 × 179 mm, it clears the floor on both axes, and the layout
    // gate measures it at zero violations across 13 surfaces in both device states. The most
    // ordinary piece of bring-your-own-hardware there is.
    expect(resolvePanelFit({ ...LAPTOP_1280, densitySource: "measured" })).toBeNull();
    const options = counterWindowOptions(LAPTOP_1280);
    expect(options.minWidth).toBeLessThanOrEqual(1280);
    expect(options.minHeight).toBeLessThanOrEqual(800);
  });

  it("REFUSES the 1366×768 @10.1″ tablet the pixel floor admitted", () => {
    // The other half, and the more dangerous one: this panel satisfies `minWidth: 1366,
    // minHeight: 768` **exactly** and clips two surfaces. A floor it passes is a floor that
    // certifies a broken screen.
    const fit = resolvePanelFit({ ...TABLET_10_1, densitySource: "measured" });
    expect(fit?.reason).toBe("too_small");
  });

  it("gives the SAME glass the same verdict at 78% fewer pixels", () => {
    // `27-F11c` as an experiment rather than an assertion. 1024×600 and 1366×768 are both 10.1″
    // panels and both below the floor; the pixel floor said one was fine and the other was not.
    const netbook = resolvePanelFit({ ...NETBOOK_1024, densitySource: "measured" });
    const tablet = resolvePanelFit({ ...TABLET_10_1, densitySource: "measured" });
    expect(netbook?.reason).toBe("too_small");
    expect(tablet?.reason).toBe("too_small");
  });

  it("gives the same 15.6″ counter the same floor at two resolutions", () => {
    // "Extra pixels buy sharpness; only inches buy room." Both panels are 345 × 194 mm, so both
    // clear — and the floor in PIXELS must differ between them, because the millimetres do not.
    expect(resolvePanelFit({ ...COUNTER_1366, densitySource: "measured" })).toBeNull();
    expect(resolvePanelFit({ ...COUNTER_1920, densitySource: "measured" })).toBeNull();
    expect(panelFloorPx(COUNTER_1366).width).not.toBe(panelFloorPx(COUNTER_1920).width);
  });

  it("gives the same PIXELS different floors on different glass", () => {
    // The twin of the row above and the one a pixel floor cannot express at all: 1920×1080 on a
    // 15.6″ counter and on a 24″ desktop are the same resolution and 1.5× apart in room.
    expect(panelFloorPx(COUNTER_1920).height).toBeGreaterThan(panelFloorPx(DESKTOP_24).height);
  });

  it("pins NO pixel constant — 27-F68 (a), the trap that FR forbids by name", () => {
    // The floor's whole failure mode was a number that is right on one panel. If any two of the
    // panels this product has been measured on produced the same pixel floor, something has been
    // hardcoded again.
    const floors = [COUNTER_1366, COUNTER_1920, LAPTOP_1280, DESKTOP_24, NETBOOK_1024].map(
      (p) => `${panelFloorPx(p).width}x${panelFloorPx(p).height}`,
    );
    expect(new Set(floors).size).toBe(floors.length);
  });

  it("halves the pixel floor when the OS packs two device pixels into a CSS pixel", () => {
    // `27-F68`: a `devicePixelRatio` above 1 does not change the physical answer, it moves where
    // the division happens. The same glass at Windows' 200% scaling is half the CSS pixels.
    // Within 1 px, not exact: both sides are `Math.ceil`ed, so an odd floor cannot halve cleanly
    // (851 / 2 = 425.5 and the retina answer is 426). Rounding is not the claim; the halving is.
    const retina = { ...COUNTER_1366, devicePixelRatio: 2 };
    expect(
      Math.abs(panelFloorPx(retina).width - panelFloorPx(COUNTER_1366).width / 2),
    ).toBeLessThanOrEqual(1);
  });
});

// ── A2. THE CLAMP — the founder ruling, in the one place it is executable ─────────────────────

describe("00 §5.7 — below the floor the window CLAMPS, it does not refuse", () => {
  it("never demands more glass than the display has", () => {
    // **The ruling made mechanical.** The old contract asked a 1024×600 netbook for 1366×768 and
    // got a window a third of which was off the side of the screen — a refusal wearing a launch.
    // Every one of these panels is below the floor on at least one axis; none of them may be
    // asked for more than it has.
    for (const p of [NETBOOK_1024, TABLET_10_1]) {
      const options = counterWindowOptions(p);
      expect(options.minWidth).toBeLessThanOrEqual(p.workArea.width);
      expect(options.minHeight).toBeLessThanOrEqual(p.workArea.height);
      expect(options.width).toBeLessThanOrEqual(p.workArea.width);
      expect(options.height).toBeLessThanOrEqual(p.workArea.height);
    }
  });

  it("still BINDS above the floor, so the protection that was worth having survives", () => {
    // The inversion is about hardware that cannot be helped, not about dragging a window on a
    // screen that can. `AppShell` clips rather than scrolls (`27-F2`), so above the floor a
    // smaller window does not get tighter — it hides controls, which is how defect 2 reached a
    // cashier. On a large display the minimum is the floor and not the display.
    const big = { ...COUNTER_1366, workArea: { width: 3840, height: 2160 } };
    const options = counterWindowOptions(big);
    expect(options.minWidth).toBe(panelFloorPx(big).width);
    expect(options.minHeight).toBe(panelFloorPx(big).height);
    expect(options.minWidth).toBeLessThan(3840);
  });

  it("keeps 27 §1a's panel as the size it OPENS at where the glass allows", () => {
    // The floor is a floor. The preferred size is still the counter panel doc 27 computes every
    // capacity figure against, and `useContentSize` is still what makes those 768 px real.
    const options = counterWindowOptions({
      ...COUNTER_1366,
      workArea: { width: 3840, height: 2160 },
    });
    expect(options.width).toBe(COUNTER_WINDOW_OPTIONS.width);
    expect(options.height).toBe(COUNTER_WINDOW_OPTIONS.height);
    expect(options.useContentSize).toBe(true);
  });

  it("the floor is a REAL size, so a passing resize check is not vacuous (24-F14)", () => {
    // The clamp introduces its own way to pass by accident: a floor of zero is satisfied by every
    // window there is. `PANEL_FLOOR_MM` emptied to `{0, 0}` would leave the layout gate's resize
    // assertion green while the product had no floor at all.
    expect(PANEL_FLOOR_MM.width).toBeGreaterThan(0);
    expect(PANEL_FLOOR_MM.height).toBeGreaterThan(0);
    expect(panelFloorPx(COUNTER_1366).width).toBeGreaterThan(0);
    expect(panelFloorPx(COUNTER_1366).height).toBeGreaterThan(0);
  });
});

// ── B. THE NOTICE — `00 §5.7`, and the ordering that is the substance of it ───────────────────

describe("00 §5.7 — what the operator is told, and in what order of authority", () => {
  it("says NOTHING when the glass is measured and clears the floor (27-F16)", () => {
    // Colour on the base case spends the preattentive channel on the thing that is always true.
    // Nearly every till in the fleet is on a screen that fits, so there is no healthy chip.
    expect(resolvePanelFit({ ...COUNTER_1366, densitySource: "measured" })).toBeNull();
    expect(resolvePanelFit({ ...COUNTER_1366, densitySource: "configured" })).toBeNull();
  });

  it("`unmeasured` OUTRANKS `too_small` on a panel that is BOTH", () => {
    // **THE ROUND-3 CASE, and it is the assertion this describe block exists for.** Testing the
    // precedence on a panel that CLEARS the floor proves nothing — any implementation returning
    // `unmeasured` for every assumed density passes that. The dangerous fixture is a panel that
    // is genuinely too small AND whose density is a guess, because there the two verdicts
    // compete: a shortfall of "4 mm" computed from an assumed millimetre is not a measurement,
    // and reporting it as one is `00 §5.7` broken by the mechanism built to satisfy it.
    const measured = resolvePanelFit({ ...NETBOOK_1024, densitySource: "measured" });
    const assumed = resolvePanelFit({ ...NETBOOK_1024, densitySource: "assumed" });
    expect(measured?.reason).toBe("too_small");
    expect(assumed?.reason).toBe("unmeasured");
  });

  it("raises `unmeasured` even on glass that would otherwise clear", () => {
    // The half the ordering above cannot show. `panel-density.ts` falls back to `27 §1a`'s 15.6″,
    // so an assumed density LOOKS like a healthy counter by construction — that is exactly the
    // silent case: on a 10.1″ tablet it draws every `27-F8` target at ~45% of its ergonomic size
    // and nothing on screen looks wrong.
    expect(resolvePanelFit({ ...COUNTER_1366, densitySource: "assumed" })?.reason).toBe(
      "unmeasured",
    );
  });

  it("names the AXIS that is short, because the two need different hardware", () => {
    // A 16:9 panel wide enough and 4 mm too short is a different purchase from one that is
    // narrow. `netbook-1024` is 221 × 130 mm — wide enough, short — and the sentence must say so
    // rather than reporting a generic "too small".
    const fit = resolvePanelFit({ ...NETBOOK_1024, densitySource: "measured" });
    expect(fit?.message).toContain("shorter");
    expect(fit?.message).not.toContain("narrower");
  });

  it("carries 27-F12's NUMBER — the measured glass, not just a colour", () => {
    // A status that carries only a hue dies under `27-F13`'s greyscale and `27-F18`'s sun. The
    // millimetre figure is also the one fact whoever is phoned can act on.
    const fit = resolvePanelFit({ ...NETBOOK_1024, densitySource: "measured" });
    expect(fit?.glass).toMatch(/\d+ × \d+ mm/);
    expect(fit?.message).toContain(String(PANEL_FLOOR_MM.height));
  });

  it("never reads as a fault in the till, the network or the menu", () => {
    // The strip already carries three link facts and a catalog refusal. This sentence has to be
    // distinguishable from all four: nothing is broken, the sale is not blocked (`01-F17`), the
    // prices are right (`01-F53`), and the fix is hardware. Borrowing failure vocabulary would
    // send a manager to check a router.
    for (const source of ["measured", "assumed"] as const) {
      const fit = resolvePanelFit({ ...NETBOOK_1024, densitySource: source });
      const message = (fit?.message ?? "").toLowerCase();
      expect(message.length).toBeGreaterThan(20);
      for (const word of ["offline", "disconnect", "error", "failed", "network", "crash"]) {
        expect(message, `"${word}" makes a small screen read as a fault`).not.toContain(word);
      }
    }
  });

  it("gives the two reasons DIFFERENT sentences, so the causes are not collapsed", () => {
    // They need different next acts — buy a bigger screen, or set `panel_ppi` on this device.
    const a = resolvePanelFit({ ...NETBOOK_1024, densitySource: "measured" })?.message;
    const b = resolvePanelFit({ ...NETBOOK_1024, densitySource: "assumed" })?.message;
    expect(a).not.toBe(b);
  });
});

// ── C. THE SEAM — the shipped application supplies the real thing ─────────────────────────────

describe("the shipped app wires the physical floor and the notice", () => {
  it("main/index.ts builds its window from counterWindowOptions, not a literal", () => {
    // **THE ASSERTION `seams:check` CANNOT EXPRESS**, on the window this time. A `createWindow`
    // that spread a static bag would typecheck, keep every rail clean, and put the pixel floor
    // straight back — the founder ruling undone by one import.
    const index = src("index.ts");
    expect(index).toContain("counterWindowOptions(panelFacts())");
    // And the old contract must not survive anywhere in main: a hardcoded minimum beside the
    // derived one is two sources for one fact, which is how this defect shipped the first time.
    // Comment-stripped — see `code` above for why that is load-bearing and not tidiness.
    expect(code("window-options.ts")).not.toMatch(/minWidth:\s*\d+/);
    expect(code("index.ts")).not.toMatch(/minWidth:\s*\d+/);
  });

  it("main/index.ts passes the real resolver, not a stub that types the same", () => {
    // `panelFit` is REQUIRED, so Rule B is satisfied by any supply at all — and `() => null` is a
    // supply. This is the "port supplied with a STUB" case AGENTS.md measures as invisible to
    // every rail in the repo, and it is worse here than for the catalog: the floor now CLAMPS
    // rather than refusing, so a stubbed notice ships the degradation completely silent.
    const index = src("index.ts");
    expect(index).toContain("panelFit: () => resolvePanelFit(panelFacts())");
    expect(index).not.toMatch(/panelFit:\s*\(\)\s*=>\s*null/);
  });

  it("the gateway projects it onto DeviceState rather than reading and dropping it", () => {
    // The dep can be supplied correctly and thrown away one line later — measured as a live
    // mutant on the catalog chain (M3 there, 16 tests). The projection is its own claim.
    expect(src("gateway.ts")).toContain("panelFit: deps.panelFit()");
  });

  it("the density SOURCE reaches the notice, or `unmeasured` can never fire", () => {
    // `resolvePanelFit` cannot tell a guess from a measurement unless the host hands it
    // `PanelDensity.source`. Passing a constant would leave the whole `unmeasured` branch — the
    // one that catches every `27-F8` target rendering at 45% of its size — permanently dead while
    // §B stays green, because §B injects its own source.
    expect(src("index.ts")).toContain("densitySource: density.source");
  });

  it("the renderer draws it: Counter passes it to the shell", () => {
    // The last hop, and the one `escalationFor: () => null` proved can silently retire a whole
    // surface. The layout gate's `24-F14` presence check asks the DOM for the same fact.
    expect(
      readFileSync(new URL("../../renderer/Counter.tsx", import.meta.url).pathname, "utf8"),
    ).toContain("panelFit={device.panelFit");
  });
});
