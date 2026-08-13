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

/**
 * **How much of a control an ANCESTOR cuts off — the check this gate did not have.**
 *
 * Until August 2026 every control was judged against the **viewport and nothing else**, and the
 * measured consequence is the reason this type exists: on a 1024×600 @10.1″ panel the gate
 * reported **0 clipped controls** on the Order tab while five menu tiles were visibly sliced in
 * half by the pager. Both facts were true at once — the tiles were entirely inside the viewport,
 * and entirely outside the grid box that clips them. `AppShell`'s `<main>` and `index.html`'s
 * `html, body, #root` both set `overflow: hidden`, so there are at least two levels between any
 * control and the viewport, and a check that looks only at the last one is measuring the wrong
 * box.
 *
 * The box-level `OVERFLOW` verdict hints at this and cannot replace it: it names the BOX and the
 * amount, never which controls lost what. "This grid holds 42 dp more than it can show" and
 * "these five tiles are cut in half" are the same fact told to two different readers, and only
 * the second one tells an operator whether an item can be sold.
 *
 * **Units.** Every number here is a post-zoom **viewport pixel**, because both sides come from
 * `getBoundingClientRect()`. That is deliberately not the unit the `OVERFLOW` verdict prints
 * (`scrollHeight`/`clientHeight` report the element's own units, i.e. dp inside `PanelRoot` —
 * see `physical.tsx`), and mixing the two is a trap this file has already paid for once, in the
 * extent measurement below.
 */
export type ClipReport = {
  /** The clipping ancestor responsible for the WORST single-edge loss. */
  readonly by: string;
  /** That ancestor's `overflow` keyword: `hidden`/`clip` means gone, `auto`/`scroll` means 27-F2. */
  readonly overflow: string;
  /**
   * Pixels of the control cut off each edge, by the INTERSECTION of every clipping ancestor
   * between it and the viewport. Per-edge, because "12 px off the bottom" and "12 px off the
   * left" are different defects on a keypad.
   */
  readonly lost: { top: number; right: number; bottom: number; left: number };
  /** The largest single-edge loss, in viewport px. What the verdict is thresholded on. */
  readonly worst: number;
  /** What survives: the control's visible size after every ancestor has taken its cut. */
  readonly visible: { w: number; h: number };
};

/** One control the operator is supposed to be able to touch. */
export type ControlReport = {
  readonly label: string;
  readonly rect: { x: number; y: number; w: number; h: number };
  /** Every edge inside the viewport. `27-F2` bans reaching a primary action by scrolling. */
  readonly withinViewport: boolean;
  /** `elementFromPoint` at its centre lands on it. Catches an overlay, not just an overflow. */
  readonly hitTestable: boolean;
  /**
   * What an ancestor with `overflow: hidden`/`clip`/`auto`/`scroll` cuts off this control, or
   * `null` when every clipping box between it and the viewport contains it whole.
   *
   * **Separate from `withinViewport` and from `hitTestable` on purpose.** Those three answer
   * three different questions — is it inside the window, is it inside the boxes that clip, does
   * a tap at its centre land — and collapsing any two of them is how this gate once reported
   * *"this control cannot be touched"* for a key that types fine.
   */
  readonly clippedBy: ClipReport | null;
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
  /**
   * `24-F14` — how many DISTINCT clipping boxes the ancestor walk found on the chains of the
   * controls above.
   *
   * A surface with controls and **zero** clipping ancestors is a walk that has stopped working,
   * not a surface with nothing to clip: `index.html` sets `overflow: hidden` on `html`, `body`
   * **and** `#root`, so the floor is three on every screen this product draws. Without this
   * number a broken walk reports `clippedBy: null` for every control, which is indistinguishable
   * from a perfectly composed app — the exact vacuous green `24-F14` exists to refuse, and the
   * shape that let `escalationFor: () => null` retire a whole surface from coverage for weeks.
   */
  readonly clippingAncestors: number;
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

  // ---- Every clipping ancestor's own CLIP RECT, in viewport pixels. ----
  //
  // `overflow` clips to the **padding box**, so the border has to come off the border box that
  // `getBoundingClientRect()` returns — and the border width from `getComputedStyle` is in the
  // element's OWN units (dp inside `PanelRoot`), not in the viewport pixels the rect is in.
  // Subtracting one from the other is the unit mix that already produced a negative slack in the
  // extent check below. The scale factor between the two is recovered from the element itself
  // (`rect.width / offsetWidth`) rather than assumed, so this is correct at any zoom and needs
  // to know nothing about `27-F68`'s conversion.
  //
  // Cached, because a control's ancestors are its siblings' ancestors: ~1100 controls over ~10
  // levels would otherwise be ~11 000 `getComputedStyle` calls for a few dozen distinct boxes.
  type Clip = { l: number; t: number; r: number; b: number; overflow: string; label: string };
  const clipCache = new Map<Element, Clip | null>();
  const clipOf = (el: Element): Clip | null => {
    const cached = clipCache.get(el);
    if (cached !== undefined) return cached;
    const s = getComputedStyle(el);
    const ox = s.overflowX;
    const oy = s.overflowY;
    const clipsX = ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll";
    const clipsY = oy === "hidden" || oy === "clip" || oy === "auto" || oy === "scroll";
    if (!clipsX && !clipsY) {
      clipCache.set(el, null);
      return null;
    }
    const rect = el.getBoundingClientRect();
    const own = (el as HTMLElement).offsetWidth;
    const scale = own > 0 ? rect.width / own : 1;
    const edge = (v: string): number => (Number.parseFloat(v) || 0) * scale;
    const clip: Clip = {
      // A box that clips on one axis only must not be allowed to clip the other: `overflow-x:
      // hidden` with `overflow-y: visible` is a real declaration and content genuinely escapes
      // the vertical edges. `±Infinity` is "this box does not constrain that edge".
      l: clipsX ? rect.left + edge(s.borderLeftWidth) : Number.NEGATIVE_INFINITY,
      r: clipsX ? rect.right - edge(s.borderRightWidth) : Number.POSITIVE_INFINITY,
      t: clipsY ? rect.top + edge(s.borderTopWidth) : Number.NEGATIVE_INFINITY,
      b: clipsY ? rect.bottom - edge(s.borderBottomWidth) : Number.POSITIVE_INFINITY,
      overflow: clipsY ? oy : ox,
      label: describe(el),
    };
    clipCache.set(el, clip);
    return clip;
  };

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

    /**
     * **Against EVERY clipping ancestor, not only against the viewport.**
     *
     * The loss on an edge under the intersection of several clip rects is the largest loss any
     * one of them imposes, so walking the chain and keeping a running per-edge maximum is the
     * intersection — no rectangle arithmetic required, and it keeps the attribution, which the
     * intersection would throw away. A reader needs to know *which* box ate the tile.
     *
     * The walk stops at `documentElement` inclusive: `index.html` sets `overflow: hidden` on
     * `html`, `body` and `#root`, so the outermost clip is effectively the viewport and the
     * `withinViewport` check above already owns that verdict. `main.ts` therefore only reports a
     * clip on a control that IS inside the viewport, and the two verdicts never double-count.
     */
    let lost = { top: 0, right: 0, bottom: 0, left: 0 };
    let worst = 0;
    let by: Clip | null = null;
    for (
      let a: Element | null = el.parentElement;
      a !== null;
      a = a === document.documentElement ? null : a.parentElement
    ) {
      const clip = clipOf(a);
      if (clip === null) continue;
      const cut = {
        top: Math.max(0, clip.t - r.top),
        right: Math.max(0, r.right - clip.r),
        bottom: Math.max(0, r.bottom - clip.b),
        left: Math.max(0, clip.l - r.left),
      };
      const worstHere = Math.max(cut.top, cut.right, cut.bottom, cut.left);
      if (worstHere > worst) {
        worst = worstHere;
        by = clip;
      }
      lost = {
        top: Math.max(lost.top, cut.top),
        right: Math.max(lost.right, cut.right),
        bottom: Math.max(lost.bottom, cut.bottom),
        left: Math.max(lost.left, cut.left),
      };
    }

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
      clippedBy:
        by === null || worst <= TOLERANCE
          ? null
          : {
              by: by.label,
              overflow: by.overflow,
              lost: {
                top: Math.round(lost.top),
                right: Math.round(lost.right),
                bottom: Math.round(lost.bottom),
                left: Math.round(lost.left),
              },
              worst: Math.round(worst),
              visible: {
                w: Math.max(0, Math.round(r.width - lost.left - lost.right)),
                h: Math.max(0, Math.round(r.height - lost.top - lost.bottom)),
              },
            },
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
    // Only boxes actually reached by walking UP from a control are counted, which is what makes
    // this a tripwire on the walk rather than on the document: `clipCache` gains an entry only
    // when an ancestor chain visits that element.
    clippingAncestors: [...clipCache.values()].filter((c) => c !== null).length,
    tabs,
    extent,
  };
};
