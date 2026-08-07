/**
 * **The measurement, and it runs INSIDE the page.**
 *
 * Serialized with `Function.prototype.toString` and handed to `webContents.executeJavaScript`,
 * so it must be **entirely self-contained**: no imports, no references to anything outside its
 * own body, no TypeScript that survives only because a type exists at build time. Anything it
 * closes over is `undefined` by the time it runs in the renderer.
 *
 * ## Why this cannot be a `.dom.test.tsx`
 *
 * `apps/pos-electron` and `packages/ui` both test the DOM under **happy-dom, which performs no
 * layout at all** — every `getBoundingClientRect()` is zeroes and every `scrollHeight` is `0`.
 * So the existing suites can pin *structure* ("the button is in the document") and cannot
 * express *"the button is on the screen"*. Three shipped defects lived in that gap and every one
 * was found by a human launching the app:
 *
 * 1. a 1418 px alarm band inside a 1392 px box — nothing in the app set `box-sizing`;
 * 2. a 919 px work surface inside a 600 px area, silently clipped, which put `TAKE CASH`, the
 *    order total, `clear` and backspace physically out of reach — a cashier could not settle;
 * 3. a `BrowserWindow` sized by FRAME, so the renderer got 736 px where `27 §1a` promises 768.
 *
 * This function is the thing those three needed: a real Blink layout, measured.
 */

/** One control the operator is supposed to be able to touch. */
export type ControlReport = {
  readonly label: string;
  readonly rect: { x: number; y: number; w: number; h: number };
  /** Every edge inside the viewport. `27-F2` bans reaching a primary action by scrolling. */
  readonly withinViewport: boolean;
  /** `elementFromPoint` at its centre lands on it. Catches an overlay, not just an overflow. */
  readonly hitTestable: boolean;
  readonly disabled: boolean;
};

/** A container whose content is larger than the box it is drawn in. */
export type OverflowReport = {
  readonly label: string;
  readonly axis: "x" | "y";
  readonly content: number;
  readonly box: number;
  /** `hidden`/`clip` means the excess is silently GONE; `auto`/`scroll` means 27-F2 is broken. */
  readonly overflow: string;
};

export type SurfaceReport = {
  readonly viewport: { w: number; h: number };
  readonly controls: readonly ControlReport[];
  readonly overflows: readonly OverflowReport[];
  /** Tab rail contents, read from the DOM so a tab added by another session is measured too. */
  readonly tabs: readonly { readonly label: string; readonly active: boolean }[];
};

/**
 * Measure the document as it is currently rendered.
 *
 * Tolerance is **1 px** on every comparison, and that is a deliberate floor rather than slack:
 * sub-pixel rounding on a border can produce a fractional overflow that is not a defect, while
 * every real instance above was off by 26 px, 319 px and 32 px respectively. A guard with
 * generous slack is not a guard.
 */
export const measureSurface = (): SurfaceReport => {
  const TOLERANCE = 1;

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    const aria = el.getAttribute("aria-label");
    const role = el.getAttribute("role");
    const id = el.id ? `#${el.id}` : "";
    return `${tag}${id}${role ? `[role=${role}]` : ""}${aria ? `[${aria}]` : ""}${
      text ? ` "${text}"` : ""
    }`;
  };

  const rendered = (el: Element): boolean => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  };

  // ---- Overflow: any box that clips or scrolls, against the content it actually holds. ----
  const overflows: OverflowReport[] = [];
  const boxes: Element[] = [document.documentElement, ...document.querySelectorAll("*")];
  for (const el of boxes) {
    if (!rendered(el)) continue;
    const s = getComputedStyle(el);
    // `visible` boxes do not clip, so overflowing one is not itself a lost control — the
    // content is still painted and the reachability pass below is what judges it. Only a box
    // that CLIPS (hidden/clip) or defers to a scrollbar (auto/scroll, which `27-F2` forbids
    // for anything actionable) can make content unreachable by being too small.
    const ox = s.overflowX;
    const oy = s.overflowY;
    const clipsX = ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll";
    const clipsY = oy === "hidden" || oy === "clip" || oy === "auto" || oy === "scroll";
    if (clipsX && el.scrollWidth > el.clientWidth + TOLERANCE) {
      overflows.push({
        label: describe(el),
        axis: "x",
        content: el.scrollWidth,
        box: el.clientWidth,
        overflow: ox,
      });
    }
    if (clipsY && el.scrollHeight > el.clientHeight + TOLERANCE) {
      overflows.push({
        label: describe(el),
        axis: "y",
        content: el.scrollHeight,
        box: el.clientHeight,
        overflow: oy,
      });
    }
  }

  // ---- Reachability: every control, against the viewport and against what is painted. ----
  const controls: ControlReport[] = [];
  const selector =
    'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(selector)) {
    if (!rendered(el)) continue;
    const r = el.getBoundingClientRect();
    const withinViewport =
      r.left >= -TOLERANCE &&
      r.top >= -TOLERANCE &&
      r.right <= window.innerWidth + TOLERANCE &&
      r.bottom <= window.innerHeight + TOLERANCE &&
      r.width > 0 &&
      r.height > 0;

    // A control whose centre is outside the viewport cannot be hit-tested at all; report that
    // as not hit-testable rather than skipping it, because "we could not ask" and "it is
    // reachable" must never collapse into one answer.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let hitTestable = false;
    if (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
      const hit = document.elementFromPoint(cx, cy);
      hitTestable = hit !== null && (el.contains(hit) || hit.contains(el));
    }

    const disabled =
      (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";

    controls.push({
      label: describe(el),
      rect: {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      withinViewport,
      hitTestable,
      disabled,
    });
  }

  // ---- The tab rail, read from the DOM rather than from a list this file keeps. ----
  // `AppShell` renders it as `<nav aria-label="Main">` of buttons. Reading it at runtime is
  // what lets a session adding a tab (Orders is unbuilt at the time of writing) get its surface
  // measured without touching this gate.
  const rail = document.querySelector('nav[aria-label="Main"]');
  const tabs = rail
    ? [...rail.querySelectorAll("button")].map((b) => ({
        label: (b.textContent ?? "").trim().replace(/\s+/g, " "),
        active: b.getAttribute("aria-current") === "page",
      }))
    : [];

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    controls,
    overflows,
    tabs,
  };
};
