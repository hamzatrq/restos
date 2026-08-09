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

/**
 * **Where the pixels actually are, against the room the surface was given.**
 *
 * The gate's other two questions — does a box overflow, is a control reachable — both encode
 * *fitting* as correct, and a founder rejected two screens that passed them. A tender panel
 * anchored in the top-left of a 24″ window with the bottom third empty **fits perfectly**. This
 * is the measurement that can tell the difference, and it is deliberately about SYMMETRY rather
 * than about how much of the surface is covered:
 *
 * - *Coverage* would be a density rule, and it fires on every legitimately sparse surface — an
 *   empty-state line, a reconciliation panel, a roster of three. There is no honest threshold.
 * - *Symmetry* separates the two cases that actually differ. A composition with a natural
 *   maximum size, centred in a larger surface, has equal margins and is a **decision**. The same
 *   content pinned to a corner with all the slack on two sides is a layout that ran out of
 *   opinions. The founder's screen was the second; the fix for it is the first.
 *
 * `content` is the union of the surface's **ink** — see `measureSurface` for what counts — never
 * of its layout containers, because a full-height flex wrapper has the box's own rect and would
 * make every surface look perfectly composed.
 */
export type ExtentReport = {
  readonly label: string;
  /** The work area's own content box, in the coordinate space of the viewport. */
  readonly box: { x: number; y: number; w: number; h: number };
  /** The union of every inked element inside it. `null` when the surface drew nothing. */
  readonly content: { x: number; y: number; w: number; h: number } | null;
};

export type SurfaceReport = {
  readonly viewport: { w: number; h: number };
  readonly controls: readonly ControlReport[];
  readonly overflows: readonly OverflowReport[];
  /** Tab rail contents, read from the DOM so a tab added by another session is measured too. */
  readonly tabs: readonly { readonly label: string; readonly active: boolean }[];
  /** `null` when there is no `<main>` — the unlock surface, which has no `AppShell`. */
  readonly extent: ExtentReport | null;
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

  // ---- Extent: where the ink is, against the room the work area was given. ----
  //
  // **INK, not layout boxes.** A surface's outermost child is nearly always a full-height flex
  // wrapper with no paint of its own; taking the union of every descendant rect would return the
  // work area exactly and report perfect composition on every screen forever — a vacuous check,
  // and the `24-F14` failure this repo names. An element is inked if it is a control, if it
  // carries a visible fill or boundary, or if it has text of its own. Those three cover
  // everything this product draws and none of the scaffolding it draws them in.
  const workArea = document.querySelector("main");
  let extent: ExtentReport | null = null;
  if (workArea !== null) {
    /**
     * **The BORDER box, and the padding is deliberately not subtracted — a UNIT trap, measured.**
     *
     * Inside `PanelRoot` the two families of geometry API report in different units, which
     * `physical.tsx` documents and which bites exactly here: `getBoundingClientRect()` returns
     * **post-zoom viewport pixels** while `getComputedStyle().paddingLeft` returns the element's
     * **own units, i.e. dp**. Subtracting one from the other mixes them. The first draft of this
     * check did, and at `zoom: 0.574` on the 24″ panel it reported the content starting **7 px
     * outside** a box it was comfortably inside — a negative slack, which is not a thing.
     *
     * Not subtracting is not a workaround, it is the better measurement: `<main>`'s padding is
     * symmetric, so it contributes equally to both sides and **cancels out of the asymmetry
     * entirely**. The reported slack figures are a little larger and the verdict is identical.
     */
    const box = workArea.getBoundingClientRect();
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const el of workArea.querySelectorAll("*")) {
      if (!rendered(el)) continue;
      const s = getComputedStyle(el);
      const filled =
        s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
      const bordered =
        Number.parseFloat(s.borderTopWidth) +
          Number.parseFloat(s.borderRightWidth) +
          Number.parseFloat(s.borderBottomWidth) +
          Number.parseFloat(s.borderLeftWidth) >
        0;
      // Text OF ITS OWN — a direct child text node. `el.textContent` walks the whole subtree, so
      // it is true for every ancestor up to `<main>` and would ink the scaffolding again.
      const texted = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      );
      if (!(filled || bordered || texted || el.matches(selector))) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    extent = {
      label: describe(workArea),
      box: {
        x: Math.round(box.left),
        y: Math.round(box.top),
        w: Math.round(box.width),
        h: Math.round(box.height),
      },
      content: Number.isFinite(x0)
        ? {
            x: Math.round(x0),
            y: Math.round(y0),
            w: Math.round(x1 - x0),
            h: Math.round(y1 - y0),
          }
        : null,
    };
  }

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    controls,
    overflows,
    tabs,
    extent,
  };
};
