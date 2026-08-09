import { createContext, type ReactNode, useContext } from "react";
import { usePhysicalSize } from "./physical";

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
 * The two boundaries, in **millimetres of usable work surface width**, each named against the
 * hardware it separates rather than rounded to something tidy.
 *
 * | mode | width | what lands here |
 * |---|---|---|
 * | `compact` | < 300 mm | `27 §1a`'s ~10.1″ waiter tablet (**223 mm** wide), and any window smaller than the counter panel |
 * | `counter` | 300–459 mm | `27 §1a`'s 15.6″ counter, **both** resolutions (345 mm of glass, ~337 mm of work surface under `AppShell`'s padding) |
 * | `wide` | ≥ 460 mm | `27-F11f`'s 22″ pass panel (487 mm), a 24″ desktop (531 mm), the maximised window the defect was found on |
 *
 * **300** sits below the counter's work surface with real slack and above the tablet with more:
 * the nearest hardware on either side is 337 mm and 223 mm, so no panel in `27 §1a` is near the
 * edge and a few millimetres of chrome moving cannot reclassify a till.
 *
 * **460** is the top of the 15.6″–19″ band. A 19″ 16:9 panel is 421 mm and is still a counter by
 * every property that matters; 22″ is 487 mm and is `27-F11f`'s pass-screen hardware, which is a
 * genuinely different surface. Putting the boundary between them is the only place it can go
 * that separates two things doc 27 actually distinguishes.
 */
export const SURFACE_MODE_MIN_MM = { counter: 300, wide: 460 } as const;

/**
 * The whole decision, as a pure function, so it can be asserted directly and mutated directly.
 *
 * Deliberately takes **width only**. Height varies independently — a short surface is a
 * *clipping* question and `layout:check` already measures every clipping box against its content
 * — and folding both into one enum produces modes nobody can reason about ("wide-but-short") for
 * a distinction no layout here needs. Where a surface genuinely cares about its height it should
 * read the millimetres, which `usePhysicalSize` already gives it.
 */
export const surfaceModeFor = (widthMm: number): SurfaceMode =>
  widthMm >= SURFACE_MODE_MIN_MM.wide
    ? "wide"
    : widthMm >= SURFACE_MODE_MIN_MM.counter
      ? "counter"
      : "compact";

/**
 * `counter` is the default, and unlike `usePhysicalSize`'s deliberate `null` this default is
 * legitimate — the difference is what a wrong guess costs.
 *
 * A guessed *capacity* puts tiles on a page with no pager to reach them, which on a counter is
 * an item that cannot be sold, so `usePhysicalSize` refuses to guess. A guessed *mode* costs one
 * frame of the wrong margins before the observer fires; nothing becomes unreachable, because
 * every mode lays out completely. Rendering nothing until measured would be the worse trade: it
 * puts a blank frame on the unlock surface 20–60× a shift, and under a `ResizeObserver` that
 * never fires — happy-dom performs no layout at all — it would blank every surface in every
 * renderer suite in the repo.
 *
 * `counter` rather than `compact` because it is `27 §1a`'s reference panel and the one this
 * product ships on: a default should be the common case, not the smallest case.
 */
const SurfaceModeContext = createContext<SurfaceMode>("counter");

/** The mode of the nearest enclosing `WorkSurface`. `counter` outside one (see above). */
export const useSurfaceMode = (): SurfaceMode => useContext(SurfaceModeContext);

export type WorkSurfaceProps = {
  children: ReactNode;
};

/**
 * **Measures a work area once and tells everything inside it what size of surface it is on.**
 *
 * One measurement per screen, not one per component, for the same reason `PanelRoot` is the one
 * place a dp becomes a pixel: two components that measure separately are two components that can
 * disagree about what surface they are on, and the disagreement is invisible in a diff. It also
 * means the mode is derived from the **work area** — after the status strip, the tab rail and
 * `03-F5`'s band have taken their share — which is the surface a layout actually has, rather
 * than from the window, which is the surface it wishes it had.
 *
 * It renders a plain flex column filling its parent. It is not a `<main>` and it draws no chrome
 * of its own: `AppShell` owns the shell and puts this inside it, and `02-F18`'s lock surface —
 * which sits OVER the shell and has no `AppShell` at all — uses one directly, so both surfaces
 * answer the same question the same way.
 */
export const WorkSurface = ({ children }: WorkSurfaceProps) => {
  const [ref, size] = usePhysicalSize();
  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SurfaceModeContext.Provider value={size === null ? "counter" : surfaceModeFor(size.widthMm)}>
        {children}
      </SurfaceModeContext.Provider>
    </div>
  );
};
