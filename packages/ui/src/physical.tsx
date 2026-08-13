import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { DP_PER_INCH, mmFromDp } from "./tokens/index";

/**
 * `27-F11c` — "Design in millimetres, render in pixels." This module is the conversion, and it
 * exists because the alternative was a HARDCODED PANEL.
 *
 * The first counter screen assumed the `27 §1a` reference hardware (a 15.6″ 16:9 panel,
 * 345.4 × 194.3 mm) and computed its grid from those constants. On the reference panel that is
 * right; on anything else — a dev machine, a resized window, the 10.1″ tablet, the 22″ pass
 * display — it computes a layout for a screen that is not there. `27-F11c` says capacity is a
 * PHYSICAL question, and a physical question has to be answered by measuring the actual
 * surface, not by naming a panel in a constant.
 *
 * ## `27-F68` — and what changed in August 2026
 *
 * The half of `27-F11c` this module implemented was *measurement*. The other half — **render**
 * in pixels — was never implemented at all: `targetFor("keypad")` returned `126` and every app
 * spent it as **126 CSS pixels**, an identity that is true only at 160 PPI and that `27 §1a`'s
 * own hardware table contradicts. `DEC-UI-001` ruled it: a dp is 1/160 inch of physical size,
 * rendered through the panel's own density, and the conversion is applied **once, to every dp
 * in the layout, chrome included**. `PanelRoot` below is that once.
 */

/**
 * CSS defines `1in` as exactly 96 `px`. That makes a CSS pixel a physical unit **by
 * definition** and not by measurement, which is the distinction `27-F68` turns on: the
 * definition is only honoured when the OS scales the panel to match, and `27 §1a`'s counter
 * panels are 100 and 141 PPI at `devicePixelRatio` 1, where a CSS inch is 0.96 and 0.68 real
 * inches respectively.
 *
 * Kept, because it is the constant that says what a CSS pixel *claims* to be, and `27-F68`'s
 * whole argument is the gap between that claim and the glass. **Nothing lays out against it.**
 */
// @unreached-by-design The CSS specification's own claim about a pixel, kept as the named
// counterpart to `DP_PER_INCH` so `cssPxPerDp`'s doc has something to point at. Every layout in
// the package renders through `DP_PER_INCH` (`27-F68`); this constant is documentation with a
// value, and a caller reaching for it is almost certainly making the mistake `27-F68` names.
export const CSS_PX_PER_INCH = 96;

/**
 * **CSS pixels per dp on a given panel — the whole of `27-F68`, in one expression.**
 *
 * `panelPpi` is the density of the GLASS: device pixels per physical inch. `devicePixelRatio`
 * is how many device pixels the OS packs into one CSS pixel. So CSS pixels per physical inch is
 * `panelPpi / devicePixelRatio`, and a dp — 1/160 inch — is that over 160.
 *
 * Worked against `27 §1a`'s two counter panels, both 15.6″ and both `devicePixelRatio` 1:
 *
 * | panel | PPI | css px / dp | 126 dp keypad key | 76 dp tile |
 * |---|---|---|---|---|
 * | 1366×768 | 100.5 | 0.628 | **79 px** | 48 px |
 * | 1920×1080 | 141.2 | 0.883 | **111 px** | 67 px |
 *
 * Those are `27 §1a`'s own published figures, and the second column is why `27-F68` forbids a
 * pinned constant: 79 px is 20 mm on the first panel and **14.2 mm on the second**, 29% under
 * `27-F8`'s ergonomic floor on the highest-consequence entry surface in the product.
 *
 * A `devicePixelRatio` above 1 does not change the answer, it only moves where the division
 * happens: a 141 PPI panel at Windows' 125% scaling reports `devicePixelRatio` 1.25, and
 * `141.2 / 1.25 / 160 = 0.706` renders a 126 dp key at 89 CSS px — which is 111 device pixels,
 * the same 20 mm of glass.
 */
export const cssPxPerDp = (panelPpi: number, devicePixelRatio: number): number => {
  if (!Number.isFinite(panelPpi) || panelPpi <= 0) {
    throw new RangeError(`panelPpi must be a positive number, got ${panelPpi} (27-F68)`);
  }
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    throw new RangeError(
      `devicePixelRatio must be a positive number, got ${devicePixelRatio} (27-F68)`,
    );
  }
  return panelPpi / devicePixelRatio / DP_PER_INCH;
};

export type PanelRootProps = {
  /**
   * `00 §7` layer 3 — `panel_ppi`, the density of the glass in front of the operator. A
   * **measurement first**: the host reads it from the OS and the config key exists only to
   * correct a panel that reports nothing or reports wrong.
   */
  panelPpi: number;
  /**
   * Device pixels per CSS pixel. Defaults to the browser's own answer, which is right in every
   * shipped case; it is a parameter so a gate can measure a panel it is not running on.
   */
  devicePixelRatio?: number | undefined;
  children: ReactNode;
};

/**
 * **The token boundary: the ONE place a dp becomes a pixel** (`27-F68`, `DEC-UI-001` (b)).
 *
 * Everything inside this element is laid out in dp. `zoom` is what makes that literally true
 * rather than a convention — Blink resolves every length in the subtree against the zoom
 * factor, so the package's tokens, its component internals, the host's own numbers and the
 * chrome all convert together, and there is no per-call-site conversion for a session to
 * forget. `DEC-UI-001` (b) names forgetting one as the next error: *"a session that converts
 * `targetFor()` and leaves the status strip, tab rail and band in raw CSS px ships a layout
 * whose proportions are wrong on every panel."* There is no call site to convert here.
 *
 * ## Why `zoom` and not the alternatives — measured, August 2026, in a real Electron window
 *
 * - **A root `font-size` + `rem` boundary** converts only what is written in `rem`. Every one
 *   of this package's ~200 numeric style values would have to be rewritten as a string, every
 *   arithmetic consumer (`OrderList`'s mm budget, `ItemGrid`'s capacity) would break, and a
 *   missed site renders silently unscaled. That is `DEC-UI-001` (b)'s trap, mechanised.
 * - **A computed token layer** — `targetFor` returning pixels from a density context — has the
 *   same hole plus a worse one: `space` is an object, not a function, so every spacing spend
 *   would need a call it currently does not make.
 * - **`transform: scale()`** does not change layout boxes. The keypad's box would stay 528 px
 *   inside a 498 px work area and the overflow would remain — it would move the defect behind a
 *   visual, and `elementFromPoint` would then disagree with what is painted.
 *
 * ## What `zoom` does to measurement, because the layout gate depends on it
 *
 * Measured in Blink at `zoom: 0.628` in a 1366×768 window:
 *
 * - `getBoundingClientRect()` returns **post-zoom viewport pixels** — a 126 dp key reports
 *   79×79 at a real screen position. So the gate's viewport arithmetic and `elementFromPoint`
 *   hit testing both stay in real pixels and stay correct. This was the property that decided
 *   the choice: a conversion the gate could not see would be a green gate over a wrong screen.
 * - `clientWidth` / `scrollHeight` report the element's **own units, i.e. dp**. Both sides of
 *   the gate's overflow comparison are in that same unit so the verdict is unaffected, but the
 *   numbers it prints are dp — which is why the gate says so in its message.
 * - `getComputedStyle().width` also reports dp (`125.995px` for a 126 dp key). Nothing reads a
 *   computed length; the probe reads only keywords.
 * - `height: 100%` chains resolve correctly: the shell filled 2175×1223 dp of a 1366×768 panel,
 *   which is that panel's 13.6″ × 7.6″ expressed in dp — and the 1920×1080 panel reported
 *   2176×1224, the same physical surface, which is `27-F11c` holding by construction.
 */
export const PanelRoot = ({ panelPpi, devicePixelRatio, children }: PanelRootProps) => {
  const [ref, size] = usePhysicalSize();
  return (
    <div
      style={{
        zoom: cssPxPerDp(
          panelPpi,
          devicePixelRatio ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio),
        ),
        height: "100%",
      }}
    >
      {/*
        **The GLASS, measured once, so `surfaceModeFor` can key on a size that never moves.**

        This div exists only to be measured, and it is measured rather than `PanelRoot` itself
        for a mechanical reason: `zoom` is applied to the element that carries it, so that
        element's own `contentRect` is in a coordinate system one step away from the one every
        length inside it resolves against. A child of the zoomed element is unambiguously in dp,
        which is the unit `mmFromDp` expects and the unit every other measurement in this package
        already uses.

        `height: 100%` on a `PanelRoot` that is itself `height: 100%` of the window makes this
        the whole panel — chrome included, before the status strip, the tab rail or `03-F5`'s
        band have taken anything.
      */}
      <div ref={ref} style={{ height: "100%", minHeight: 0 }}>
        <PanelSizeContext.Provider value={size}>{children}</PanelSizeContext.Provider>
      </div>
    </div>
  );
};

export type PhysicalSize = { widthMm: number; heightMm: number };

/**
 * # THE PANEL'S OWN SIZE, AND WHY IT IS A SEPARATE FACT FROM THE WORK AREA'S
 *
 * `WorkSurface` measures the box a layout actually gets — after the strip, the rail and
 * `03-F5`'s band have taken their share — and that is the right input for **capacity**: how
 * many tiles fit on a page is a question about the room a grid has right now.
 *
 * It is the WRONG input for **mode**, and the difference is not academic:
 *
 * - **`03-F5`'s band shrinks the work area by 102 dp and nothing else changes.** A mode keyed
 *   on the work area would therefore flip the whole layout over the moment a kitchen printer
 *   stopped answering — which on this device is *every confirm*, about 20 s later. `27-F4`
 *   permits reflow across panels for exactly one reason, stated in `surface-mode.tsx`: a till
 *   lives in one mode for its whole service life, so **no operator ever watches the layout
 *   change under them.** A band-triggered mode flip breaks that premise and takes the
 *   justification with it.
 * - **A compact layout that moves the tab rail into the work area's width feeds its own output
 *   back into its input.** Rail goes vertical → work area narrows → still compact → stable
 *   here, but one threshold nudge away from oscillating on a resize.
 *
 * The panel does not move. It is the glass, and the glass is what `27-F11c` says capacity and
 * arrangement are properties of: *"Physical size, never resolution, sets capacity."*
 *
 * `null` until the first measurement, for `usePhysicalSize`'s reason — a default is a guessed
 * panel by another name. `useSurfaceMode` handles the null rather than inventing millimetres.
 */
const PanelSizeContext = createContext<PhysicalSize | null>(null);

/** The measured size of the whole panel in millimetres, or `null` outside a `PanelRoot`. */
export const usePanelSize = (): PhysicalSize | null => useContext(PanelSizeContext);

/**
 * The measured physical size of an element, kept current as it resizes.
 *
 * **The unit is a dp** (`27-F68`): inside `PanelRoot` the CSS pixel Blink lays out in *is* the
 * dp, so `contentRect` is read through `mmFromDp` and the millimetres that come out are the
 * millimetres on the glass. This used to divide by 96, which made the answer true only on a
 * 96-PPI panel — at 1366×768 it reported 361 mm for a surface that is really 345 mm, and at
 * 1920×1080 it reported **508 mm for the same physical panel**, which is precisely the reading
 * `27-F11c` exists to forbid.
 *
 * Returns `[ref, size]` where `ref` is a **callback ref**, not a `RefObject`. That is not a
 * style choice and it is worth the extra return value: an effect keyed on a `RefObject` reads
 * `ref.current` once, on the mount of the component that owns it, and never again. Any screen
 * that renders a placeholder before its content — `if (!device) return <p>Starting…</p>`, which
 * is exactly what the counter does while its first IPC read is in flight — has a null `current`
 * at that moment, so the observer is never attached and the surface is never measured. The
 * symptom is a permanently empty grid on a shell that otherwise looks completely healthy.
 *
 * A callback ref is invoked by React whenever the node attaches or detaches, so the observer
 * follows the element rather than the component.
 *
 * `size` is `null` until the first measurement, and callers must handle that rather than
 * defaulting: a default is a guessed panel by another name, and a grid costed for the wrong
 * surface — even for one frame — puts tiles off-page where no pager can reach them.
 */
export const usePhysicalSize = (): [(node: HTMLElement | null) => void, PhysicalSize | null] => {
  const [size, setSize] = useState<PhysicalSize | null>(null);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    if (node === null) {
      observer.current = null;
      return;
    }
    observer.current = new ResizeObserver(([entry]) => {
      // `contentRect` excludes padding and border, so this is the USABLE area — which is what
      // capacity is a question about. Using the border box would cost a column to a 1 px rule.
      const rect = entry?.contentRect;
      if (rect === undefined) return;
      setSize({ widthMm: mmFromDp(rect.width), heightMm: mmFromDp(rect.height) });
    });
    observer.current.observe(node);
  }, []);

  return [ref, size];
};
