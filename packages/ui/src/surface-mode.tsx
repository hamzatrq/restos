import type { ReactNode } from "react";
import { usePanelSize } from "./physical";

/**
 * # The layout mode a surface is in — **derived from millimetres, never from pixels**
 *
 * `27 §1a` lists four deployment surfaces, not one: a 15.6″ counter at two resolutions, a
 * ~10.1″ waiter tablet, a ~6.5″ phone; `27-F11f` adds a 22″ pass panel. The product was built
 * against exactly one of them and had **no responsive construct of any kind** — measured August
 * 2026, a `grep -a` for `@media`, `matchMedia`, `clamp(`, `@container` or a breakpoint across
 * `packages/ui/src` and the counter renderer returned a single `minmax` in `ItemGrid`. The
 * consequence a founder saw on a large window: a tender panel anchored top-left at its
 * `fit-content` size with the bottom third of the panel empty, which every gate passed because
 * **`layout:check` asked whether things FIT and fitting is not using the room.**
 *
 * ## Why the unit is millimetres, and why that is not a style preference
 *
 * `27-F11c`: *"Physical size, never resolution, sets capacity. Extra pixels buy sharpness; only
 * inches buy room."* A CSS-pixel breakpoint gets that exactly backwards — it would put the
 * 1920×1080 counter panel in a different mode from the 1366×768 one **while they are the same
 * 13.6 × 7.6 inches of glass holding the same tiles**, which is the reading that FR exists to
 * forbid. Inside `PanelRoot` (`27-F68`) the pixel Blink lays out in *is* the dp, so a surface's
 * own `contentRect` already IS its physical size and `usePhysicalSize` already reports it in
 * millimetres. There is nothing to convert and nothing to guess.
 *
 * The pleasant consequence is that the two counter panels are the SAME mode by construction,
 * and a 24″ desktop is a different one — which is the distinction that actually matters and the
 * one a pixel breakpoint cannot express.
 *
 * ## What a mode may and may not change — this is the `27-F4` contract
 *
 * **A mode may change where a thing is and how big it is. It may never change what is there, or
 * in what order.** `27-F4` makes adding, removing or reordering an item on an operational
 * surface a breaking change, and a responsive layout is the most natural way in the world to
 * violate it by accident — a control that collapses into an overflow at one width is a control
 * that moved. Reflow is legal because a single till lives in exactly one mode for its whole
 * service life (the mode is a property of the glass, not of a window a cashier drags), so no
 * operator ever watches the layout change under them. Reordering is illegal because it would
 * make the same product two products.
 */
export type SurfaceMode = "compact" | "counter" | "wide";

/**
 * # THE BOUNDARIES, ON **BOTH** AXES, IN MILLIMETRES OF **GLASS**
 *
 * Two things changed here in August 2026 and each closed a measured defect.
 *
 * ## 1. Height is an axis. It was not, and every below-floor failure in the product was one.
 *
 * This read *"deliberately takes **width only** … a short surface is a clipping question and
 * `layout:check` already measures every clipping box"*. That reasoning has a hole the sweep
 * itself reported: of the two panels the gate found violations on, **the Pay tab's was a pure
 * height failure (593 dp of content in a 485 dp box) and Cash's width overflow was a height
 * failure in disguise** — Cash's groups column-wrap, so a shorter box produces more columns and
 * therefore more width. Measuring the clipping is not the same as being able to do anything
 * about it: a mode that cannot see the short axis cannot arrange for it.
 *
 * It also meant a 6.5″ phone (69 × 150 mm) and a 13.3″ laptop (286 × 179 mm) resolved to the
 * **same mode** — one of them structurally broken, the other completely clean.
 *
 * ## 2. The input is the PANEL, not the work surface — see `usePanelSize`
 *
 * The work area shrinks by 102 dp when `03-F5`'s band goes up, which on this device is every
 * confirm. Keying the mode on it would reflow the whole layout mid-service and destroy the one
 * property that makes reflow legal under `27-F4` at all (below). The glass does not move.
 *
 * ## The table
 *
 * | mode | glass | what lands here |
 * |---|---|---|
 * | `compact` | width < 260 **or** height < 150 | `27 §1a`'s ~10.1″ tablet (223 × 126), a 1024×600 netbook (221 × 130), and anything short |
 * | `counter` | ≥ 260 × 150 | `27 §1a`'s 15.6″ counter at **both** resolutions (345 × 194), a 13.3″ laptop (286 × 179) |
 * | `wide` | width ≥ 460 | `27-F11f`'s 22″ pass panel, a 24″ desktop (531 × 299), a 32″ ultrawide (783 × 220) |
 *
 * **260 mm is not invented and it is not this file's opinion.** `CashSurfaces.tsx` measured it
 * and wrote it down for exactly this purpose: *"Holding this surface at one pad of height needs
 * roughly 260 mm of work-surface width; below that the groups take a second column and the
 * surface grows. **That width figure is the number for whoever defines the mode below
 * `compact`.**"* The Cash tab is the surface that spends width, so the Cash tab is where the
 * boundary comes from. It replaces **300**, which was chosen as a gap-splitter between 223 and
 * 337 and had the side effect of classifying a perfectly roomy 13.3″ laptop as compact.
 *
 * **150 mm is the counter ARRANGEMENT's own worst case plus a cushion**, and it is measured the
 * same way. With `03-F5`'s band up, a horizontal tab rail and the honesty strip inflated to
 * three lines by its own too-small notice, the tallest surface (Pay, holding `27-F8`'s
 * untouchable 528 dp pad) needs 879 dp = **140 mm** of glass. Below that the counter arrangement
 * cannot be drawn without cutting a control, so the compact arrangement is not a preference
 * there — it is the only legal layout. 150 leaves 10 mm rather than sitting on the boundary, for
 * the reason `window-options.ts` gives about floors: one set at the bottom of a measured range
 * admits the panel that clips.
 *
 * **460 mm** is unchanged and keeps its old derivation: the top of the 15.6″–19″ band, where a
 * 19″ panel (421 mm) is still a counter by every property that matters and 22″ (487 mm) is
 * `27-F11f`'s pass-screen hardware.
 *
 * **The keys carry their UNIT and that is not decoration.** A bare `height: 150` in this package
 * is indistinguishable — to a reader, and to `discipline-ast.oracle.test.ts`'s `27-F8` scan,
 * which flagged this exact line the first time it was written — from a hardcoded CSS touch
 * target, the one thing a component here may never write. These are millimetres of glass and
 * nothing lays out against them.
 */
export const SURFACE_MODE_MIN_MM = {
  counter: { widthMm: 260, heightMm: 150 },
  wide: { widthMm: 460 },
} as const;

/**
 * The whole decision, as a pure function, so it can be asserted directly and mutated directly.
 *
 * **Short beats wide, and the order of these two tests is the rule rather than an
 * implementation detail.** A panel that is 783 mm wide and 140 mm tall is not a `wide` surface
 * that happens to be short — it is a surface with no room for the standard vertical arrangement,
 * and giving it `wide`'s roomier money column while the keypad hangs off the bottom edge would
 * be spending the axis that has room to make the axis that does not worse. `compact` is tested
 * first and on either axis; `wide` is only ever reached by a panel that already cleared both.
 */
export const surfaceModeFor = (widthMm: number, heightMm: number): SurfaceMode =>
  widthMm < SURFACE_MODE_MIN_MM.counter.widthMm || heightMm < SURFACE_MODE_MIN_MM.counter.heightMm
    ? "compact"
    : widthMm >= SURFACE_MODE_MIN_MM.wide.widthMm
      ? "wide"
      : "counter";

/**
 * **The mode of the panel this tree is rendering on**, derived from `PanelRoot`'s measurement.
 *
 * `counter` when the panel has not been measured yet or when there is no `PanelRoot` above —
 * and unlike `usePhysicalSize`'s deliberate `null` this default is legitimate, the difference
 * being what a wrong guess costs. A guessed *capacity* puts tiles on a page with no pager to
 * reach them, which on a counter is an item that cannot be sold, so `usePhysicalSize` refuses to
 * guess. A guessed *mode* costs one frame of the wrong margins before the observer fires;
 * nothing becomes unreachable, because every mode lays out completely. Rendering nothing until
 * measured would be the worse trade: it puts a blank frame on the unlock surface 20–60× a shift,
 * and under a `ResizeObserver` that never fires — happy-dom performs no layout at all — it would
 * blank every surface in every renderer suite in the repo.
 *
 * `counter` rather than `compact` because it is `27 §1a`'s reference panel and the one this
 * product ships on: a default should be the common case, not the smallest case.
 */
export const useSurfaceMode = (): SurfaceMode => {
  const panel = usePanelSize();
  return panel === null ? "counter" : surfaceModeFor(panel.widthMm, panel.heightMm);
};

export type WorkSurfaceProps = {
  children: ReactNode;
};

/**
 * **The work area's own box** — a plain flex column filling whatever the shell left over.
 *
 * It is not a `<main>` and it draws no chrome of its own: `AppShell` owns the shell and puts
 * this inside it, and `02-F18`'s lock surface — which sits OVER the shell and has no `AppShell`
 * at all — uses one directly, so both surfaces are built the same way.
 *
 * **⚠ THIS COMPONENT USED TO DECIDE THE MODE AND NO LONGER DOES** (August 2026). It measured
 * itself and published `surfaceModeFor(its own width)`, on the reasoning that *"the mode is
 * derived from the work area … which is the surface a layout actually has, rather than from the
 * window, which is the surface it wishes it had"*. That argument is correct about **capacity**
 * and wrong about **mode**, and the difference bites in two places:
 *
 * - `03-F5`'s band takes 102 dp out of this box and puts it back on acknowledgement. A mode
 *   read from here therefore changes when a kitchen printer stops answering — which on this
 *   device is every confirm, about 20 s later. `27-F4` tolerates reflow for exactly one stated
 *   reason: a till lives in one mode for its whole service life and no operator ever watches
 *   the layout change under them. A band-triggered flip is precisely an operator watching it.
 * - `compact` moves the tab rail out of the vertical chrome and into this box's width, so a
 *   mode read from here would be reading its own output.
 *
 * The mode is `usePanelSize`'s job now — the glass, measured once at `PanelRoot`, which is
 * where `27-F68` already puts the one fact about physical size the whole tree shares. This box
 * is still the right thing for a grid to measure for CAPACITY, and `ItemGrid`/`OrderList` still
 * do exactly that through their own `usePhysicalSize`.
 */
export const WorkSurface = ({ children }: WorkSurfaceProps) => (
  <div
    style={{
      height: "100%",
      minHeight: 0,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
    }}
  >
    {children}
  </div>
);
