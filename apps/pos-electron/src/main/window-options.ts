/**
 * **The counter window's SIZE CONTRACT, in one place, because two places is how it broke.**
 *
 * These five options decide how many css pixels the renderer actually gets. They are extracted
 * from `createWindow` for one reason: the layout gate (`src/layout-gate/`) has to construct its
 * window from *the value the app ships*, not from a copy of it. A gate that measured a hand-typed
 * `1366x768` would prove that the gate's own literal is 1366x768 and nothing whatsoever about the
 * product — which is the `AGENTS.md` round-3 failure ("the mechanism was built correctly and
 * never aimed at the case that matters") applied to a window.
 *
 * `27 §1a` is the authority for the numbers: the counter POS is a **15.6" panel at 1366x768 or
 * 1920x1080**. The smaller is used here as a FLOOR rather than a preference, because `27-F11c`
 * makes physical size the thing that sets capacity and `27-F11a` computes ~88 tiles against that
 * panel.
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
  /**
   * The 15.6" panel at `27 §1a` is the SMALLEST counter target listed (the other is
   * 1920x1080), so it is a floor and not a preference. `27-F2` forbids reaching a primary
   * action by scrolling and `AppShell` clips rather than scrolls to keep that true, which
   * means a window dragged below the reference panel does not degrade — it HIDES controls,
   * which on this surface is a cashier who cannot settle. Refusing the resize is the honest
   * behaviour: `00 §5.7`, a surface reports what is true, and a till too small for its own
   * layout is not a state the operator can be left to discover by losing a button.
   *
   * These are content dimensions, not frame dimensions, because of `useContentSize` above.
   */
  minWidth: 1366,
  minHeight: 768,
} as const;
