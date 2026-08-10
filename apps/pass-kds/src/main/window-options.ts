/**
 * **The pass window's size contract, in one place**, extracted from `createWindow` for the reason
 * `apps/pos-electron/src/main/window-options.ts` gives at length: the layout gate constructs its
 * window from *the value the app ships*, never from a copy, because a gate measuring its own
 * literal proves only that its literal is right.
 *
 * ## `27-F11f`'s 22" panel is the PREFERRED size and NOT a floor — `27-F28`, amended
 *
 * `27-F11f` (July 2026 founder ruling) says *"where a pass screen IS used it is a 22-inch panel"*.
 * `27-F28`'s August 2026 amendment turns that from a floor into **the size of a 3-ticket view**,
 * under `DEC-HW-001`'s bring-your-own-hardware ruling — and records the tension rather than
 * resolving it, because reconciling the two is the founder's call:
 *
 * > `DEC-HW-001` is the **later and more general** founder ruling and is the authority relied on
 * > here, but reconciling the two is the founder's call and not this document's.
 *
 * **This app follows `27-F28`**, which is the later amendment and the one that names its
 * authority. So: 1920×1080 of page is the preferred window (a 22" panel's native resolution), the
 * window CLAMPS to whatever display exists, and **there is no minimum that refuses**. A restaurant
 * that props a 10" tablet or hangs a TV at the pass gets a screen that starts and a sentence
 * telling it what that glass holds (`shared/ticket-capacity.ts`, `00 §5.7`).
 *
 * ## ⚠ WHY THERE IS NO `PANEL_FLOOR_MM` HERE, AND IT IS A DIFFERENCE IN KIND
 *
 * The counter has one because its surfaces have a fixed vertical demand it cannot page away:
 * `27-F8`'s 126 dp keypad is 20 mm of glass whatever the panel, so below a measured height a
 * cashier genuinely cannot settle an order and `PanelHealth` has to say so.
 *
 * **The pass queue has no such floor**, because `03-F46` makes it a paged list and `27-F28` makes
 * capacity a statement: one ticket always fits (`ticketsPerPage` floors at 1), page 1 always holds
 * the oldest work, and a small panel costs *situational awareness* rather than *reachability*.
 * Inventing a floor here would refuse hardware that works, which is the exact inversion
 * `DEC-HW-001` names. The bump target is the one thing that must not shrink and it does not —
 * `TicketCard` spends `targetFor("kitchen")` = 96 dp = 15 mm to the dp on every panel, and
 * `layout:check` measures it there.
 */
export const PASS_WINDOW_OPTIONS = {
  /**
   * A 22" panel's native resolution (`27-F11f`). It is a **preference and not a contract** — see
   * the header — and `27-F11c` is why the pixel count is not the interesting number: 1920×1080 on
   * 22" glass and on 15.6" glass hold different amounts of ticket, and the millimetres decide.
   */
  width: 1920,
  height: 1080,
  /**
   * `27 §1a`'s panel measured as the RENDERER sees it. Without this the numbers above describe
   * the window FRAME and the title bar comes out of the work area — the defect that gave the
   * counter 736 css px where the spec promised 768, and every capacity figure is computed against
   * the panel rather than against what the frame leaves over.
   */
  useContentSize: true,
} as const;

/**
 * The shipped window bag: `27-F11f`'s panel where the glass allows it, clamped to the display that
 * is actually there, and **no minimum at all**.
 *
 * The clamp is the whole of the BYO behaviour: without it a 1366×768 tablet gets a 1920×1080
 * window it cannot show and the app "starts" with a third of itself off the side of the screen,
 * which is a refusal wearing a launch.
 *
 * `workArea` is the display's usable CSS pixels (`screen.getPrimaryDisplay().workAreaSize`) — the
 * taskbar's share already removed.
 */
export const passWindowOptions = (panel: {
  workArea: { width: number; height: number };
}): { width: number; height: number; useContentSize: true } => ({
  ...PASS_WINDOW_OPTIONS,
  width: Math.min(PASS_WINDOW_OPTIONS.width, panel.workArea.width),
  height: Math.min(PASS_WINDOW_OPTIONS.height, panel.workArea.height),
});
