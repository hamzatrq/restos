import { useCallback, useRef, useState } from "react";

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
 */

/**
 * CSS defines `1in` as exactly 96 `px`, so a CSS pixel is a physical unit by definition and
 * `element.clientWidth` is a physical measurement — the same one the browser uses for its own
 * `mm` unit.
 *
 * **What this is NOT:** a measurement of the panel's true dot pitch. A 15.6″ 1920×1080 display
 * is ~141 real PPI, and the OS maps that to CSS pixels through its own scaling. So this reports
 * the surface's size in CSS-reference millimetres, which is what every layout on the platform
 * is already expressed in, and which tracks the operator's actual apparent size because OS
 * scaling exists precisely to keep it doing so.
 *
 * The honest ceiling on this: it cannot detect a panel whose OS scaling is set wrong. When
 * admission (`01-F47`) lands it carries the device's CLASS, and a class naming its true panel
 * size is the authority that should override this. Until then, measuring beats assuming.
 */
export const CSS_PX_PER_INCH = 96;

export const mmFromCssPx = (px: number): number => (px / CSS_PX_PER_INCH) * 25.4;
// @unreached-owed The INVERSE direction. Everything shipped measures the panel and converts px →
// mm (`mmFromCssPx`, which is reached); nothing yet lays out a component at a stated physical
// size, which is what `27-F27`'s cap-millimetre type on the KDS will need.
export const cssPxFromMm = (mm: number): number => (mm / 25.4) * CSS_PX_PER_INCH;

export type PhysicalSize = { widthMm: number; heightMm: number };

/**
 * The measured physical size of an element, kept current as it resizes.
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
      setSize({ widthMm: mmFromCssPx(rect.width), heightMm: mmFromCssPx(rect.height) });
    });
    observer.current.observe(node);
  }, []);

  return [ref, size];
};
