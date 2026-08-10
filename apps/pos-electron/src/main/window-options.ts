/**
 * **The counter window's SIZE CONTRACT, in one place, because two places is how it broke.**
 *
 * These options decide how many css pixels the renderer actually gets. They are extracted from
 * `createWindow` for one reason: the layout gate (`src/layout-gate/`) has to construct its window
 * from *the value the app ships*, not from a copy of it. A gate that measured a hand-typed
 * `1366x768` would prove that the gate's own literal is 1366x768 and nothing whatsoever about the
 * product — which is the `AGENTS.md` round-3 failure ("the mechanism was built correctly and
 * never aimed at the case that matters") applied to a window.
 *
 * `27 §1a` is the authority for the PREFERRED size: the counter POS is a **15.6" panel at
 * 1366x768 or 1920x1080**. The FLOOR is a different question and is answered in millimetres
 * below, for the reason the whole of `27-F11c` gives.
 */
export const COUNTER_WINDOW_OPTIONS = {
  width: 1366,
  height: 768,
  /**
   * **`27 §1a`'s panel is 1366x768 of PAGE, and without this line it was 1366x736.**
   *
   * `width`/`height` describe the window FRAME by default, so the title bar came out of the
   * renderer: the counter got 736 css px where the reference hardware promises 768. Losing
   * 32 px silently is how a layout that was designed against the spec's own panel gets
   * measured against something smaller than it — and every capacity number in doc 27,
   * including `27-F11a`'s ~88 tiles, is computed against the panel and not against whatever
   * the frame leaves over. `27-F11c` is the same argument one level down: physical size sets
   * capacity, so the surface has to actually BE the size it is designed for.
   */
  useContentSize: true,
} as const;

/**
 * # THE FLOOR IS PHYSICAL, AND IT USED TO BE A PIXEL COUNT (`27-F11c`, `27-F68`, founder ruling)
 *
 * This module declared `minWidth: 1366, minHeight: 768` and Electron *prevented* the resize. That
 * contract was wrong on **both** sides at once, and the measurements say so with no interpretation
 * required (2026-08-10, the layout gate driving the shipped renderer in a real Blink window):
 *
 * | panel | glass | pixel floor says | measured |
 * |---|---|---|---|
 * | 1280×800 @13.3″ | **287 × 179 mm** | REFUSED | **0 violations — completely clean** |
 * | 1366×768 @14″ | 310 × 174 mm | admitted | 0 violations — clean |
 * | 1366×768 @10.1″ | **224 × 126 mm** | **admitted** | **clips two surfaces** |
 * | 1024×600 @10.1″ | 221 × 130 mm | refused | 2 overflows |
 *
 * **The floor over-blocked the most likely BYO device and under-blocked a broken one**, and it
 * did both for the same reason: it measured the wrong quantity. 1024×600 and 1366×768 on the same
 * 10.1″ glass are **78% apart in pixel count** and produce near-identical results — the pixels
 * bought nothing, which is `27-F11c` stated as an experiment.
 *
 * ## Why the floor exists at all, and why it no longer REFUSES
 *
 * The old comment argued that refusing is honest *"because `AppShell` clips rather than scrolls,
 * so a window below the panel HIDES controls, which on this surface is a cashier who cannot
 * settle."* That reasoning is sound on vendor-specified hardware and **inverts under
 * bring-your-own-hardware**, which is the product this is (founder ruling: *"the system should
 * adapt to the device it runs on and not assume that everyone will have a proper screen … we
 * have a bring-your-own-hardware software"*). A restaurant running RestOS on the laptop it
 * already owns is not helped by a till that will not start; it is helped by a till that starts,
 * works as far as the glass allows, and **says what it cannot do**. That is `00 §5.7`.
 *
 * So the floor now does two different things depending on which side of it the hardware is:
 *
 * - **Above it** — the minimum still binds, and a drag below the physical floor is refused. That
 *   costs nothing (every panel in `27 §1a` clears it by a wide margin) and keeps the protection
 *   that made the old contract worth having.
 * - **Below it** — the minimum COLLAPSES to the glass that exists (`counterWindowOptions` clamps
 *   it to the display's work area), so the app starts on hardware smaller than the layout wants,
 *   and `resolvePanelFit` raises a standing notice on the honesty surface naming the shortfall in
 *   millimetres. A refusal an operator cannot act on is not a safety measure; it is a device that
 *   will not turn on.
 *
 * ## Where the two numbers come from — RENDERED PANELS, not arithmetic
 *
 * **⚠ THE FLOOR WAS `215 × 134` AND IS `220 × 125`. The height came DOWN 9 mm, and the reason is
 * not a relaxed tolerance — it is that the layout changed.** `packages/ui`'s `compact` mode used
 * to alter three numbers (a money column, a change-figure size, a card width) and no arrangement
 * at all; it now moves the tab rail to the side, drops panel chrome Pay does not need at that
 * size, and gives Cash's tile rows something to wrap against. `27-F8`'s targets are untouched to
 * the dp — the gate measures a **20.00 mm** keypad key on the smallest shipping panel — and
 * `27-F68` (b)'s ban on trimming millimetres to make a layout fit is not engaged, because
 * nothing was trimmed.
 *
 * **Every number below is a panel that was rendered and measured, in both device states, with
 * `03-F5`'s band up and the honesty strip carrying its longest notice** (the gate's fixture pins
 * `unmeasured`, which inflates the strip from 51 dp to ~123 dp — so these are worst-case, and a
 * real till that clears the floor has ~70 dp more than this table assumes):
 *
 * | panel | glass | verdict |
 * |---|---|---|
 * | `probe-below-floor` | **201.6 × 118.1 mm** | **FAILS** — this is what below the floor looks like |
 * | `netbook-1024` | **221.3 × 129.7 mm** | clean — the narrowest panel that works |
 * | `tablet-10.1` | **223.6 × 125.7 mm** | clean — the shortest panel that works |
 * | `tablet-11.6` | 256.9 × 144.4 mm | clean |
 * | `laptop-12.5` | 276.7 × 155.7 mm | clean — the tightest `counter`-mode panel |
 * | `laptop-13.3-hd` | 294.5 × 165.6 mm | clean |
 *
 * So the floor is **each axis set just under its smallest measured pass**: 220 against 221.3 of
 * measured width, 125 against 125.7 of measured height. It is deliberately NOT rounded up past a
 * panel that demonstrably works — `27 §1a`'s own 10.1″ tablet row is 125.7 mm, and a floor of
 * 126 would have reported the cheapest hardware in the corpus as too small **while it rendered
 * every surface cleanly**, which is a false alarm on the honesty surface and the exact opposite
 * of what `00 §5.7` is for.
 *
 * **⚠ THE OLD TABLE ATTRIBUTED THE HEIGHT TO THE WRONG SURFACE, and it is worth keeping.** It
 * read *"tallest work area any surface needs (**Cash**, band up) 593–604 dp"*. Re-measured, the
 * tallest surface is **Pay at 593 dp and Cash is 506** — Cash stopped being the tallest when the
 * grouping round moved its amount readout beside the pad, and the number was carried forward
 * with the wrong name attached to it. The figure was right and the attribution was three
 * paragraphs of reasoning pointed at the wrong file. **Cash is the WIDTH-binding surface, not
 * the height-binding one**, and its width demand is a function of the height it is given,
 * because its groups column-wrap: 1705 dp at 485 dp of box, 1318 dp at 569 dp.
 *
 * **⚠ These are measurements of THIS layout, not constants of the universe, and they can rot.**
 * Change the chrome or the tallest work surface and they are wrong. What keeps them honest is
 * `layout:check`: **every panel above the floor now SHIPS and binds**, `probe-below-floor` sits
 * under it and reports, and a layout that grows past the floor reddens on a panel that used to
 * be clean — `tablet-10.1` first, with 2.6 mm of width and 0.7 mm of height to spare.
 *
 * **⚠ WHAT IS STILL UNMEASURED, stated rather than papered over.** The old note flagged
 * 130–174 mm as never rendered; that gap is closed (144, 156, 166 mm are in the sweep). What
 * remains open: **118.1–125.7 mm on height and 201.6–221.3 mm on width are bracketed by one
 * failing panel and one passing panel, not walked** — so the floor is known to within ~8 mm on
 * each axis and no closer. Nothing between 294 mm and 345 mm of width is rendered either. And
 * every panel here is SIMULATED on a macOS host: the Windows till this ships to, with different
 * font metrics, is still not measured by anything.
 */
export const PANEL_FLOOR_MM = {
  /** `netbook-1024` renders clean at 221.3 mm; Cash is the surface that spends the width. */
  width: 220,
  /** `tablet-10.1` renders clean at 125.7 mm; Pay is the surface that spends the height. */
  height: 125,
} as const;

/** Millimetres per inch. Spelled out because every conversion here goes through it. */
const MM_PER_INCH = 25.4;

/**
 * The floor in CSS pixels **on this panel** — `27-F68`'s conversion applied to the window itself
 * rather than to a touch target.
 *
 * `panelPpi` is device pixels per physical inch of glass; `devicePixelRatio` is device pixels per
 * CSS pixel; so CSS pixels per inch is the quotient, and the same 215 × 134 mm comes out as
 * **851 × 530 px** on `27 §1a`'s 100.5-PPI counter and **1313 × 818 px** on a 155-PPI 10.1″
 * tablet. `27-F68` (a) forbids pinning either of those: a pixel figure is one panel's answer.
 */
export const panelFloorPx = (panel: {
  panelPpi: number;
  devicePixelRatio: number;
}): { width: number; height: number } => {
  const cssPxPerInch = panel.panelPpi / panel.devicePixelRatio;
  return {
    width: Math.ceil((PANEL_FLOOR_MM.width / MM_PER_INCH) * cssPxPerInch),
    height: Math.ceil((PANEL_FLOOR_MM.height / MM_PER_INCH) * cssPxPerInch),
  };
};

/**
 * The shipped window bag: `27 §1a`'s panel where the glass allows it, the physical floor as the
 * minimum, and **both clamped to the display that is actually there**.
 *
 * The clamp is the whole of the BYO change. Without it a 1024×600 netbook gets a 1366×768 window
 * it cannot show and a minimum it cannot satisfy — the app "starts" with a third of itself off
 * the side of the screen, which is a refusal wearing a launch. With it the window is the glass,
 * the floor stops binding where it cannot be met, and `resolvePanelFit` below says so out loud.
 *
 * `workArea` is the display's usable CSS pixels (`screen.getPrimaryDisplay().workAreaSize`) —
 * the taskbar's share already removed, because a minimum that includes it is a minimum the
 * operator can never satisfy.
 */
export const counterWindowOptions = (panel: {
  panelPpi: number;
  devicePixelRatio: number;
  workArea: { width: number; height: number };
}): {
  width: number;
  height: number;
  useContentSize: true;
  minWidth: number;
  minHeight: number;
} => {
  const floor = panelFloorPx(panel);
  return {
    ...COUNTER_WINDOW_OPTIONS,
    width: Math.min(COUNTER_WINDOW_OPTIONS.width, panel.workArea.width),
    height: Math.min(COUNTER_WINDOW_OPTIONS.height, panel.workArea.height),
    minWidth: Math.min(floor.width, panel.workArea.width),
    minHeight: Math.min(floor.height, panel.workArea.height),
  };
};

/**
 * # `00 §5.7` — WHAT THE OPERATOR IS TOLD WHEN THE GLASS IS NOT ENOUGH
 *
 * Starting degraded is only defensible if the degradation is **named**, and the two things that
 * can be wrong here are different enough that one sentence cannot carry both:
 *
 * - `too_small` — the glass was measured and it is under the floor. Controls at the edge of a
 *   surface are cut off; the sale still completes (`01-F17`), the prices are still right
 *   (`01-F53`), and somebody needs to know the till is on the wrong screen.
 * - `unmeasured` — **the density itself is a guess**, so every physical claim on this device is
 *   one, including the verdict above. `panel-density.ts` falls back to `27 §1a`'s 15.6″ counter
 *   when the OS reports no physical size, and on a 10.1″ tablet that yields ~100 PPI where the
 *   glass is ~224 — so every `27-F8` target renders at about **45% of its ergonomic size,
 *   silently**, and the screen looks completely normal while it happens.
 *
 * **`unmeasured` outranks `too_small`**, and the ordering is the point rather than a tie-break: a
 * floor verdict computed from a guessed density is a guess. Reporting "this screen is 4 mm too
 * short" as a measurement, when the millimetre itself was assumed, is `00 §5.7` broken by the
 * mechanism built to satisfy it.
 *
 * **The guess is not made SAFER, because it cannot be.** Assuming a larger diagonal shrinks every
 * target (`27-F8`'s floor breached, invisibly, which is the failure `27-F68` (b) names); assuming
 * a smaller one grows them until controls clip (defect 2's shape). There is no diagonal that is
 * safe in both directions, so the only honest move is the one `00 §7` already prescribes for this
 * key — *"a number a technician types is a number a technician mistypes, and the failure is
 * silent"* — which is to stop the failure being silent.
 */
export type PanelFitReason = "too_small" | "unmeasured";

export type PanelFit = {
  readonly reason: PanelFitReason;
  /** The operator's sentence, formatted HERE on the trusted side (`18 §9`, `AlarmSchema`). */
  readonly message: string;
  /** `27-F12`'s NUMBER — the glass as this device believes it to be, or that it does not know. */
  readonly glass: string;
};

/** `w × h` in whole millimetres of glass, from CSS pixels and the panel's density. */
const glassMm = (panel: {
  panelPpi: number;
  devicePixelRatio: number;
  workArea: { width: number; height: number };
}): { width: number; height: number } => {
  const cssPxPerInch = panel.panelPpi / panel.devicePixelRatio;
  return {
    width: Math.round((panel.workArea.width / cssPxPerInch) * MM_PER_INCH),
    height: Math.round((panel.workArea.height / cssPxPerInch) * MM_PER_INCH),
  };
};

/**
 * The standing notice for the honesty surface, or `null` when the glass is measured and clears
 * the floor — which is `27-F16`: nothing is spent on the base case.
 */
export const resolvePanelFit = (panel: {
  panelPpi: number;
  devicePixelRatio: number;
  /** `panel-density.ts`' `PanelDensity.source`. `"assumed"` means nothing below is measured. */
  densitySource: "configured" | "measured" | "assumed";
  workArea: { width: number; height: number };
}): PanelFit | null => {
  if (panel.densitySource === "assumed") {
    return {
      reason: "unmeasured",
      glass: "not measured",
      message:
        "this till could not read its own screen size from the operating system, so every touch " +
        `target on it is drawn from an assumption — 27 §1a's 15.6" counter panel. On a smaller ` +
        "screen that makes every key far smaller than it should be and nothing looks wrong. Set " +
        "panel_ppi for this device to correct it.",
    };
  }
  const glass = glassMm(panel);
  const shortWidth = glass.width < PANEL_FLOOR_MM.width;
  const shortHeight = glass.height < PANEL_FLOOR_MM.height;
  if (!shortWidth && !shortHeight) return null;
  const axis =
    shortWidth && shortHeight ? "narrower and shorter" : shortWidth ? "narrower" : "shorter";
  return {
    reason: "too_small",
    glass: `${glass.width} × ${glass.height} mm`,
    message:
      `this screen is ${axis} than the counter layout needs — it measures ${glass.width} × ` +
      `${glass.height} mm of glass and the layout needs ${PANEL_FLOOR_MM.width} × ` +
      `${PANEL_FLOOR_MM.height} mm. Controls at the edge of a surface are cut off. Prices and ` +
      "the ledger are unaffected; a bigger screen is the fix.",
  };
};

/**
 * What the boot line says about the floor. Same argument as `describePanelDensity`: on this
 * field being wrong looks exactly like being right, so it is stated rather than swallowed.
 */
export const describePanelFit = (fit: PanelFit | null): string =>
  fit === null
    ? `panel fit: clears the ${PANEL_FLOOR_MM.width} × ${PANEL_FLOOR_MM.height} mm floor (27-F11c)`
    : `panel fit: ${fit.reason.toUpperCase()} (${fit.glass}) — ${fit.message}`;
