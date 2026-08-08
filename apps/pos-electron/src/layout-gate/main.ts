import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { COUNTER_WINDOW_OPTIONS } from "../main/window-options";
import { measureSurface, type SurfaceReport } from "./probe";

/**
 * # THE LAYOUT GATE — `pnpm -C apps/pos-electron layout:check`
 *
 * **What it is:** `seams:check`'s equivalent for layout. That rail exists because reading a diff
 * never finds a missing seam; this one exists because reading a diff never finds a control that
 * is off the screen — and neither does any suite in this repo, because they all render under
 * **happy-dom, which performs no layout**. Three defects shipped through that gap and all three
 * were found by a human launching the app and looking:
 *
 * | # | defect | what it cost |
 * |---|---|---|
 * | 1 | a 1418 px alarm band in a 1392 px box — nothing set `box-sizing` | `03-F5`'s acknowledgement 13 px off-screen |
 * | 2 | a 919 px work surface in a 600 px area, clipped | **a cashier could not settle an order** |
 * | 3 | `BrowserWindow` sized by FRAME, not content | 736 px where `27 §1a` promises 768 |
 *
 * **Why Electron and not Playwright.** `18 §15` rule 1 is "check it isn't already solvable with
 * an allowed package": `electron` is already a devDependency of this app and ships the same
 * Blink that lays out the shipped product, so this rail adds **no dependency at all**.
 * `@playwright/test` is on `18 §14`'s allowlist and would still have been the wrong pick, for a
 * reason that is about correctness and not convenience — **a headless browser is structurally
 * blind to defect 3.** Driving a page, you *set* the viewport to 1366x768 and the bug is
 * precisely that the app does not get 1366x768. Only constructing the real `BrowserWindow` from
 * the real options can see it, which is why `COUNTER_WINDOW_OPTIONS` is imported rather than
 * retyped.
 *
 * **What it does NOT prove.** The renderer is real; main is not (see `preload.ts`). This says
 * nothing about IPC, Zod validation at the plane boundary, or the shipped preload. It says one
 * thing: given data of that shape, the shipped renderer lays out reachably at `27 §1a`'s panel.
 * The blind spots are enumerated at the bottom of this file.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * `24-F14` empty-match protection: a gate that measured nothing must FAIL, never pass.
 *
 * Raised from 3 to 16 when the panel loop landed: two panels × (one lock surface + five tabs in
 * two states + two escalation steps) is 26 today, and a floor of 3 would have been satisfied by
 * a run that lost an entire panel. A floor that only catches total collapse is not a floor.
 */
const MIN_SURFACES = 16;

/**
 * `27 §1a` lists TWO counter panels — 15.6″ at 1366×768 **or** 1920×1080 — and `DEC-UI-001` (e)
 * requires both be measured: *"the layout gate measures one panel at devicePixelRatio 1;
 * `27 §1a`'s second counter panel must enter its fixture with this work, or the ruling ships
 * untested on precisely the case that produced"* the pinned-79-px trap.
 *
 * They are the same 13.6 × 7.6 inches of glass, so under `27-F68` they must hold the **same**
 * layout at different pixel counts — that is `27-F11c` stated as a test rather than as prose,
 * and it is the assertion a pinned pixel constant cannot pass: 79 px is 20 mm on the first and
 * 14.2 mm on the second.
 */
const PANELS = [
  { label: "1366x768", width: COUNTER_WINDOW_OPTIONS.width, height: COUNTER_WINDOW_OPTIONS.height },
  { label: "1920x1080", width: 1920, height: 1080 },
] as const;

/**
 * `27-F8`'s keypad target, and what it must MEASURE as on each panel — `27 §1a`'s own published
 * figures for its own hardware table (*"126 dp keypad → 79–111 px"*).
 *
 * **This is the assertion that makes the conversion visible to the gate**, and without it the
 * rail would pass on a product that had silently gone back to spending dp as CSS pixels: every
 * other check here asks whether things FIT, and 126 css px fits a 1920×1080 panel perfectly
 * while being 22.7 mm of glass instead of 20. Expressed as millimetres against `27-F8`'s floor
 * rather than as a pixel count, because `27-F68` (b) is explicit that the minimum IS the
 * millimetre and a pixel figure is one panel's answer.
 */
const KEYPAD_MM = 20.0;
/**
 * ±0.6 mm — 3% of the target. Wide enough for the sub-pixel rounding a fractional zoom produces
 * on a 126 dp box (measured: 79 px where 79.1 is exact), narrow enough that the 6.4 mm error a
 * pinned 79 px makes on the second panel is nowhere near it. A guard with generous slack is not
 * a guard.
 */
const KEYPAD_MM_TOLERANCE = 0.6;

/**
 * # THE OWED REGISTER — a FOURTH layout defect, found by this gate on its first run.
 *
 * **⚠ THIS ENTRY'S FIRST DESCRIPTION WAS WRONG, and the correction is the useful part.** It read
 * *"a cashier cannot type a `0` … Rs 500 and Rs 1,000 cannot be entered at all"*. That was
 * inferred from `withinViewport` — a FIT check — and never tested. **Measured (August 2026, real
 * `sendInputEvent` mouse clicks through Blink's own hit testing, in this window): the band up,
 * Pay open, pressing `1` `0` `0` `0` takes `REMAINING` from Rs 4,875 to Rs 3,875. Rs 1,000 TYPES
 * FINE.** The three keys overhang by 31 px of 126, leaving 95 px on screen, and a click at their
 * centre lands. Nothing on Pay is unreachable in either state; the claim propagated from here
 * into `CLAUDE.md` and into a task brief before anyone pressed a key. This is the wave's own
 * "the guard was never pointed at the dangerous case", one level up — the *mechanism* was right
 * and its *verdict text* was never checked against the case it fires on.
 *
 * **What is measured, and it is still a defect** (768 px viewport, `main` 632 px quiet / 530 px
 * with the band — the band costs exactly 102 px):
 *
 * | surface | state | measured |
 * |---|---|---|
 * | Pay | band up | `C` `0` `⌫` clipped 126 → **95 px**; all three still clickable; nothing else lost |
 * | Cash | band up | `C` `0` `⌫` clipped 126 → **112 px**, all clickable; **`Counted Rs 0` ENTIRELY off-screen** |
 * | Pay, Cash | quiet | nothing clipped, nothing unreachable |
 *
 * **Cash is the one that costs something real.** `Counted` is the live echo of what the cashier
 * has keyed into a drawer count, and `CashSurfaces.tsx` says in its own comment that it is *"the
 * only feedback that a 126 dp key registered at all"*. Under the band she counts the drawer
 * blind — `27-F25` (the payload is the largest thing in its region) and `27-F29` (this
 * population's errors are exactly here) both land on that row.
 *
 * **It is on the ordinary path, not a corner case.** This app ships `unattachedPrinter` (K-8
 * owed), so *every* confirm raises this band about 20 s later.
 *
 * **It is REPORTED, not fixed, and the reason is now arithmetic rather than judgement.** The
 * keypad is 4 × `targetFor("keypad")` + 3 gaps = **528 px**. Under the band `main`'s content box
 * is **498 px**. *The pad alone does not fit, before any label, any DUE figure, any TAKE CASH
 * button or any padding* — so no reflow, overlay or reordering of these surfaces can close it.
 * The only levers are the shell's 238 px of chrome and the 126-dp-as-126-css-px identity, and
 * `27 §1a`'s own hardware table says a 126 dp keypad key renders at **79–111 px** on this panel,
 * not 126. That is a spec question (`27-F8` vs `27-F11c` vs `27 §1a`), it needs a physical-panel
 * input the renderer does not have, and `layout-physical.oracle.test.ts` already carries it as an
 * open FINDING. Commandment 9: it is not a pixel choice a session may make for itself.
 *
 * **The register cannot rot**, which is the property `seams:check`'s markers already have: a
 * surface listed here that produces NO violation under the band **fails the gate**, so fixing
 * the defect forces the entry out instead of leaving a stale exemption behind.
 *
 * **What it costs while it stands, stated plainly:** a genuinely NEW violation on Pay or Cash
 * *in the alarm state only* would be masked by this entry. Both surfaces are still judged
 * strictly in the quiet state, and every other surface is judged strictly in both.
 *
 * ## ⚠ THE REGISTER IS EMPTY — DEFECT 4 IS CLOSED (August 2026, `DEC-UI-001` / `27-F68`)
 *
 * `tab:Pay` and `tab:Cash` came out because **the gate refused to let them stay**: the anti-rot
 * rule above fired with *"STALE REGISTER … it now lays out cleanly"* the first time the founder
 * ruling's conversion ran, which is the property this list was built to have. Nothing here was
 * relaxed to achieve that — the same measurement, the same tolerance, the same two states.
 *
 * What changed is arithmetic. `27-F68` makes a dp 1/160 inch of PHYSICAL size, so on this panel
 * a 126 dp keypad key renders at **79 px** and not 126, the pad is **340 px** and not 528, and
 * the work area under `03-F5`'s band holds it with room. Measured before and after, same window,
 * same fixture:
 *
 * | surface, band up | before | after |
 * |---|---|---|
 * | Pay `main` | 594 px of content in a 530 px box | fits |
 * | Cash `main` | 584 px in 530 — **`Counted Rs 0` entirely off-screen** | fits, `Counted` on screen |
 * | `C` `0` `⌫` | clipped 126 → 95 px (Pay), 112 px (Cash) | not clipped on either |
 *
 * **The list stays**, and stays exercised: `MIN_SURFACES` and the empty-match guards keep the
 * rail honest, and the next surface that earns an entry gets the same anti-rot treatment.
 */
const OWED_UNDER_ALARM: readonly string[] = [];

type Failure = { readonly surface: string; readonly state: State; readonly detail: string };

/** The two states this device really has: `03-F5`'s band up, and acknowledged. */
type State = "alarm" | "quiet";

const failures: Failure[] = [];
const lines: string[] = [];
const note = (s: string): void => {
  lines.push(s);
};

/** Totals, so the rail can prove to itself that it actually looked at something. */
let surfacesMeasured = 0;
let controlsMeasured = 0;
let clippingBoxesSeen = 0;

const judge = (surface: string, state: State, r: SurfaceReport): void => {
  surfacesMeasured += 1;
  controlsMeasured += r.controls.length;

  // `24-F14` — a surface that produced no control is a surface that did not render. Passing
  // there would be the exact vacuous green this protection exists to refuse.
  if (r.controls.length === 0) {
    failures.push({
      surface,
      state,
      detail:
        "EMPTY MATCH — zero controls measured. The surface did not render (a bridge channel the " +
        "renderer needs is probably missing from the gate's stub), so this check proves nothing (24-F14).",
    });
    return;
  }

  for (const o of r.overflows) {
    clippingBoxesSeen += 1;
    failures.push({
      surface,
      state,
      detail:
        `OVERFLOW ${o.axis}: ${o.label} holds ${o.content}px of content in a ${o.box}px box ` +
        `(overflow: ${o.overflow}) — ${o.content - o.box}px is ${
          o.overflow === "hidden" || o.overflow === "clip"
            ? "CLIPPED AWAY"
            : "reachable only by scrolling, which 27-F2 forbids for anything actionable"
        }.`,
    });
  }

  for (const c of r.controls) {
    if (!c.withinViewport) {
      // **SAY WHAT WAS MEASURED, NOT WHAT FOLLOWS FROM IT.** `withinViewport` is a FIT check —
      // every edge inside the viewport — and this message used to conclude "cannot be touched"
      // from it. That does not follow, and it was WRONG on the first case it ever fired on: the
      // keypad's bottom row on Pay overhangs by 31 px of a 126 px key, leaving 95 px on screen,
      // and a real `sendInputEvent` click at its centre still lands (`Rs 1,000` types fine). The
      // false claim then propagated out of this register into `CLAUDE.md` and into a task brief.
      // A partly-clipped 126 dp target is still a real `27-F8`/`27-F11d` finding and still fails
      // this gate — but the two outcomes are different sizes of problem and must read differently.
      const overhang = Math.max(
        0,
        c.rect.y + c.rect.h - r.viewport.h,
        c.rect.x + c.rect.w - r.viewport.w,
        -c.rect.y,
        -c.rect.x,
      );
      const gone = !c.hitTestable;
      failures.push({
        surface,
        state,
        detail:
          `${gone ? "UNREACHABLE" : "CLIPPED"}: ${c.label} at (${c.rect.x},${c.rect.y}) ` +
          `${c.rect.w}x${c.rect.h} overhangs the ${r.viewport.w}x${r.viewport.h} viewport by ` +
          `${overhang}px. AppShell clips rather than scrolls (27-F2 bans reaching a primary action ` +
          `by scrolling), so that ${overhang}px is GONE. ` +
          (gone
            ? "Its centre does not hit-test: this control cannot be touched at all."
            : `Its centre still hit-tests, so it can be pressed — but ${overhang}px of a target ` +
              "27-F8 sizes deliberately has been taken away, which 27-F11d does not permit an " +
              "alarm to do to the work underneath."),
      });
      continue;
    }
    // A DISABLED control is not hit-testable by design — `27-F4` disables in place rather than
    // hiding, so it must be ON SCREEN (checked above) but need not respond.
    if (!c.hitTestable && !c.disabled) {
      failures.push({
        surface,
        state,
        detail:
          `COVERED: ${c.label} at (${c.rect.x},${c.rect.y}) is inside the viewport but ` +
          "elementFromPoint at its centre lands on something else — another element is painted over it.",
      });
    }
  }

  note(
    `  [${state}] ${surface}: ${r.controls.length} controls, ${r.overflows.length} overflow(s), viewport ${r.viewport.w}x${r.viewport.h}`,
  );
};

const run = async (): Promise<number> => {
  const window = new BrowserWindow({
    // THE SHIPPED OPTIONS, imported — not a copy. This is the whole of defect 3's coverage.
    ...COUNTER_WINDOW_OPTIONS,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(HERE, "../preload/layout-gate.cjs"),
    },
  });

  await window.loadFile(join(HERE, "../renderer/index.html"));
  // React mounts, reads the bridge and paints. The renderer's own reads are promises, so one
  // frame is not enough; this waits for the paint that follows them.
  await new Promise((r) => setTimeout(r, 600));

  const measure = (): Promise<SurfaceReport> =>
    window.webContents.executeJavaScript(`(${measureSurface.toString()})()`);

  const click = (index: number): Promise<void> =>
    window.webContents.executeJavaScript(
      `(() => { const b = document.querySelectorAll('nav[aria-label="Main"] button')[${index}];
        if (b) b.click(); })()`,
    );

  /**
   * Press a control by its accessible name, and REPORT whether it was there. The gate drives the
   * escalation path through the same three taps a cashier makes, and a tap that silently missed
   * would leave `ManagerApproval` unrendered and the sweep vacuously green — `24-F14` again.
   */
  const press = (label: string): Promise<boolean> =>
    window.webContents.executeJavaScript(
      `(() => { const b = [...document.querySelectorAll('button')]
          .find((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().startsWith(${JSON.stringify(label)}));
        if (b) { b.click(); return true; } return false; })()`,
    );

  /**
   * **`27-F68`, measured in millimetres of glass.** Reads a `keypad`-posture control's rendered
   * height out of Blink and converts through the panel the renderer was told it is on — so this
   * is the operator's actual thumb target, not a number the app agrees with itself about.
   *
   * The pad's digits are the only `keypad` posture on the device, so `aria-label="1"` finds one
   * on every surface that has one. Returns `null` where no pad is drawn, which the caller treats
   * as "nothing to judge" rather than as a pass.
   */
  const keypadMm = (): Promise<{ mm: number; px: number; ppi: number } | null> =>
    window.webContents.executeJavaScript(
      `(async () => {
        const b = [...document.querySelectorAll('button')]
          .find((e) => (e.getAttribute('aria-label') || '').trim() === '1');
        if (!b) return null;
        const px = b.getBoundingClientRect().height;
        // The density is read back OUT OF THE SEAM the renderer was handed it through, never
        // recomputed here: a gate that derived its own PPI would be measuring its own arithmetic
        // against itself, which is the "gate measuring its own copy of 1366x768" mistake one
        // field along.
        const ppi = (await window.restos.deviceState()).panelPpi;
        if (!ppi) return null;
        // css px -> device px -> inches of glass -> mm.
        return { mm: (px * window.devicePixelRatio / ppi) * 25.4, px, ppi };
      })()`,
    );

  // ---------------------------------------------------------------------------------------
  // 1. THE WINDOW ITSELF (defect 3). `27 §1a` promises the counter a 1366x768 PANEL.
  // ---------------------------------------------------------------------------------------
  const viewport = await window.webContents.executeJavaScript(
    "JSON.stringify([window.innerWidth, window.innerHeight])",
  );
  const [vw, vh] = JSON.parse(viewport) as [number, number];
  note(`window: renderer got ${vw}x${vh} css px`);
  if (vw !== COUNTER_WINDOW_OPTIONS.width || vh !== COUNTER_WINDOW_OPTIONS.height) {
    failures.push({
      surface: "window",
      state: "alarm",
      detail:
        `THE RENDERER DID NOT GET THE PANEL IT IS DESIGNED FOR: ${vw}x${vh} css px, but ` +
        `27 §1a's counter panel is ${COUNTER_WINDOW_OPTIONS.width}x${COUNTER_WINDOW_OPTIONS.height}. ` +
        "BrowserWindow's width/height describe the FRAME unless useContentSize is set, so the title " +
        "bar comes out of the renderer. Every capacity figure in doc 27 — 27-F11a's ~88 tiles " +
        "included — is computed against the panel, not against what the frame leaves over.",
    });
  }

  // The MINIMUM is the same 1366x768 (27 §1a's smaller counter target is a floor, not a
  // preference), so the smallest supported size is checked by proving the floor REFUSES rather
  // than degrades: AppShell clips instead of scrolling, so a window allowed below the panel
  // hides controls silently. That is how defect 2 reached a cashier.
  window.setContentSize(1024, 600);
  await new Promise((r) => setTimeout(r, 200));
  const shrunk = await window.webContents.executeJavaScript(
    "JSON.stringify([window.innerWidth, window.innerHeight])",
  );
  const [sw, sh] = JSON.parse(shrunk) as [number, number];
  note(`window: after a resize to 1024x600 the renderer holds ${sw}x${sh} css px`);
  if (sw < COUNTER_WINDOW_OPTIONS.minWidth || sh < COUNTER_WINDOW_OPTIONS.minHeight) {
    failures.push({
      surface: "window",
      state: "alarm",
      detail:
        `THE FLOOR DID NOT HOLD: a resize below the panel left the renderer at ${sw}x${sh}, under ` +
        `the declared minimum of ${COUNTER_WINDOW_OPTIONS.minWidth}x${COUNTER_WINDOW_OPTIONS.minHeight}. ` +
        "AppShell clips and does not scroll (27-F2), so a smaller window does not get tighter — it " +
        "silently hides controls.",
    });
  }
  window.setContentSize(COUNTER_WINDOW_OPTIONS.width, COUNTER_WINDOW_OPTIONS.height);
  await new Promise((r) => setTimeout(r, 200));

  // ---------------------------------------------------------------------------------------
  // 2. EVERY SURFACE, IN BOTH DEVICE STATES, ON BOTH OF `27 §1a`'s COUNTER PANELS.
  //
  // The panel loop is `DEC-UI-001` (e). It reloads rather than merely resizing, because the
  // fixture's alarm is module state in the preload: a reload re-runs it, so the second panel
  // gets `03-F5`'s band up exactly like the first instead of inheriting an acknowledged one.
  // ---------------------------------------------------------------------------------------
  for (const panel of PANELS) {
    window.setContentSize(panel.width, panel.height);
    await new Promise((r) => setTimeout(r, 200));
    await window.loadFile(join(HERE, "../renderer/index.html"));
    await new Promise((r) => setTimeout(r, 600));

    const on = (surface: string): string => `${panel.label} ${surface}`;

    // `02-F18` — a locked device shows only the unlock screen.
    judge(on("unlock"), "alarm", await measure());

    await window.webContents.executeJavaScript(
      "window.restos.unlock('user-hina', '1234')",
      // `01-F26`'s session, taken the way the operator takes it. Hina is the branch manager in
      // the dev roster, so role-gated surfaces render rather than refusing.
    );
    await new Promise((r) => setTimeout(r, 600));

    const shell = await measure();
    if (shell.tabs.length === 0) {
      failures.push({
        surface: on("counter"),
        state: "alarm",
        detail:
          "EMPTY MATCH — the tab rail rendered no tabs, so no operational surface was measured. " +
          "Either the unlock did not take or AppShell's rail markup moved; either way this rail " +
          "proves nothing (24-F14).",
      });
    }

    /**
     * BOTH STATES, every tab. The band is up first because that is the state a cashier is in
     * after any confirm on this device (no printer is attached — see `preload.ts`), and it is
     * the tighter of the two vertical budgets. Tabs come from the DOM, so a tab another session
     * adds is measured without touching this file.
     */
    const sweep = async (state: State): Promise<void> => {
      for (const [i, tab] of shell.tabs.entries()) {
        await click(i);
        await new Promise((r) => setTimeout(r, 350));
        judge(on(`tab:${tab.label || i}`), state, await measure());
      }
    };

    await sweep("alarm");

    // -------------------------------------------------------------------------------------
    // `02-F20` — THE ESCALATION PAD, reached the way a cashier reaches it.
    //
    // This is the fixture line that used to read `escalationFor: () => null`, and behind it sat
    // a surface laying out 1162 px in a 632 px box in BOTH states — `Approve`, `Not them?` and
    // `Cancel` entirely below the viewport, so `02-F20`'s only built escalation route had never
    // been usable by anyone and every gate was green. Driven through the real controls rather
    // than by poking state: `05-F19`'s over-threshold paid-out needs a reason and a receipt
    // photo before the write, and it is the write's refusal that raises the pad.
    // -------------------------------------------------------------------------------------
    const cashTab = shell.tabs.findIndex((t) => t.label.startsWith("Cash"));
    if (cashTab === -1) {
      failures.push({
        surface: on("escalation"),
        state: "alarm",
        detail:
          "EMPTY MATCH — no Cash tab in the rail, so 02-F20's escalation pad was never reached " +
          "and ManagerApproval went unmeasured on this panel (24-F14).",
      });
    } else {
      await click(cashTab);
      await new Promise((r) => setTimeout(r, 350));
      const taps = [await press("Supplier"), await press("Receipt photo"), await press("Paid out")];
      await new Promise((r) => setTimeout(r, 500));
      if (taps.some((t) => !t)) {
        failures.push({
          surface: on("escalation"),
          state: "alarm",
          detail:
            `EMPTY MATCH — the paid-out sequence did not find its controls (${taps.join(",")}), ` +
            "so ManagerApproval never rendered and this sweep proves nothing (24-F14).",
        });
      } else {
        // Step one: `02-F38`'s approver grid, the requester absent.
        judge(on("escalation:approvers"), "alarm", await measure());
        // Step two: the PIN pad. `01-F61` identify-then-PIN, and the step that did not fit.
        const chose = await press("Ayesha");
        await new Promise((r) => setTimeout(r, 400));
        if (!chose) {
          failures.push({
            surface: on("escalation:pin"),
            state: "alarm",
            detail:
              "EMPTY MATCH — no approver tile to choose, so the PIN step never rendered (24-F14).",
          });
        } else {
          judge(on("escalation:pin"), "alarm", await measure());
          await press("Cancel");
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    // `03-F5` — acknowledging clears it, which is how the gate reaches the quiet state through
    // the real contract rather than a second fixture.
    await window.webContents.executeJavaScript("window.restos.acknowledgeAlarm('alarm-1')");
    await new Promise((r) => setTimeout(r, 500));
    await sweep("quiet");

    // -------------------------------------------------------------------------------------
    // `27-F68` — THE TARGET'S PHYSICAL SIZE. The one check here that is not about fitting.
    // -------------------------------------------------------------------------------------
    await click(cashTab === -1 ? 0 : cashTab);
    await new Promise((r) => setTimeout(r, 350));
    const key = await keypadMm();
    if (key === null) {
      failures.push({
        surface: on("keypad"),
        state: "quiet",
        detail:
          "EMPTY MATCH — no keypad-posture control was found and no density came back through " +
          "the seam, so 27-F68's conversion went unmeasured on this panel (24-F14).",
      });
    } else {
      note(
        `  [${panel.label}] 27-F8 keypad target: ${key.px.toFixed(1)} css px at ${key.ppi.toFixed(1)} PPI = ${key.mm.toFixed(2)} mm`,
      );
      if (Math.abs(key.mm - KEYPAD_MM) > KEYPAD_MM_TOLERANCE) {
        failures.push({
          surface: on("keypad"),
          state: "quiet",
          detail:
            `27-F8 IS BROKEN ON THE GLASS: the 126 dp keypad target renders ${key.mm.toFixed(2)} mm, ` +
            `not ${KEYPAD_MM} mm (measured ${key.px.toFixed(1)} css px on a ${key.ppi.toFixed(1)} PPI panel). ` +
            "27-F68 makes a dp 1/160 inch of PHYSICAL size and 27-F8's minimum IS the millimetre — " +
            "so this is the ergonomic floor failing, on the highest-consequence entry surface in " +
            "the product, and it fits its box perfectly while doing so. Spending a dp as a CSS " +
            "pixel, or pinning one panel's pixel answer, both land exactly here.",
        });
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  // 4. `24-F14` — the rail must have looked at something, or it fails rather than passing.
  // ---------------------------------------------------------------------------------------
  if (surfacesMeasured < MIN_SURFACES) {
    failures.push({
      surface: "gate",
      state: "quiet",
      detail:
        `EMPTY MATCH — only ${surfacesMeasured} surface(s) measured, expected at least ` +
        `${MIN_SURFACES}. The app layout moved and this rail is now inert (24-F14).`,
    });
  }
  if (controlsMeasured === 0) {
    failures.push({
      surface: "gate",
      state: "quiet",
      detail: "EMPTY MATCH — zero controls measured across every surface (24-F14).",
    });
  }

  // ---------------------------------------------------------------------------------------
  // 5. THE OWED REGISTER — exempt the known fourth defect, and FAIL if it has been fixed.
  // ---------------------------------------------------------------------------------------
  const owed = failures.filter((f) => f.state === "alarm" && OWED_UNDER_ALARM.includes(f.surface));
  const fatal = failures.filter((f) => !owed.includes(f));

  for (const surface of OWED_UNDER_ALARM) {
    if (!owed.some((f) => f.surface === surface)) {
      fatal.push({
        surface,
        state: "alarm",
        detail:
          `STALE REGISTER — '${surface}' is listed in OWED_UNDER_ALARM as a known-broken surface ` +
          "under 03-F5's band, and it now lays out cleanly. The fourth defect appears to be FIXED: " +
          "delete this entry from the register so the surface is judged strictly again. A register " +
          "that outlives its defect is how an exemption becomes permanent (24-F14).",
      });
    }
  }

  note("");
  note(
    `measured ${surfacesMeasured} surfaces, ${controlsMeasured} controls, ${clippingBoxesSeen} overflowing boxes`,
  );

  if (owed.length > 0) {
    note("");
    note(
      `OWED — ${owed.length} known violation(s) under 03-F5's alarm band, NOT failing the gate:`,
    );
    for (const f of owed) note(`  [${f.state}] [${f.surface}] ${f.detail}`);
    note("  ^ the fourth layout defect, found by this gate. See OWED_UNDER_ALARM in main.ts.");
  }

  if (fatal.length > 0) {
    note("");
    note(`LAYOUT GATE FAILED — ${fatal.length} violation(s):`);
    for (const f of fatal) note(`  [${f.state}] [${f.surface}] ${f.detail}`);
    note("");
    note("These are measured in a real Blink layout at 27 §1a's panel. A control reported");
    note("unreachable here is unreachable on the counter — happy-dom cannot see any of it.");
    return 1;
  }

  note("");
  note("LAYOUT GATE PASSED — every surface fits its box and every control is reachable.");
  return 0;
};

/**
 * `T-01-07` — **fail LOUDLY rather than skip.** A gate whose prerequisite is missing must go
 * red, because a rail that silently skips reports green and is worse than no rail at all. There
 * is no environment check above that can turn this into a pass: if Electron cannot start, if the
 * renderer bundle is absent, or if the page throws, the catch below exits non-zero and says why.
 */
app.whenReady().then(
  async () => {
    let code = 1;
    try {
      code = await run();
    } catch (error) {
      lines.push("");
      lines.push("LAYOUT GATE FAILED — the gate itself could not run:");
      lines.push(`  ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      lines.push("");
      lines.push("This is a FAILURE and never a skip (T-01-07). Common causes: the renderer was");
      lines.push("not built (`pnpm -C apps/pos-electron build`), or Electron cannot open a window");
      lines.push("in this environment.");
      code = 1;
    }
    console.log(lines.join("\n"));
    app.exit(code);
  },
  (error: unknown) => {
    console.log(`LAYOUT GATE FAILED — Electron never became ready: ${String(error)}`);
    app.exit(1);
  },
);
