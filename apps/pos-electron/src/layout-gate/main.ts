import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import {
  COUNTER_WINDOW_OPTIONS,
  counterWindowOptions,
  PANEL_FLOOR_MM,
} from "../main/window-options";
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
 * # THE PANEL SWEEP — a RANGE of physical surfaces, not one panel and its twin
 *
 * `27 §1a` lists four deployment surfaces and `27-F11f` a fifth, and this rail measured one of
 * them plus its higher-resolution twin. A founder then opened the app on a large window and got a
 * screen he called *"unusable for a human"* — **and the gate was green**, because both of its
 * questions (does a box overflow, is a control reachable) are satisfied perfectly by content
 * anchored in the corner of an ocean.
 *
 * ## What a panel IS here, and why the diagonal is the input
 *
 * Under `27-F68` a dp is 1/160 inch of glass and `PanelRoot` converts once, so the layout's own
 * coordinate system is **physical**. A surface's size in that system is therefore
 * `diagonalInches × (pixelWidth / hypot) × 25.4` mm — **the pixel count cancels out entirely**.
 * That is `27-F11c` (*"extra pixels buy sharpness; only inches buy room"*) falling out of the
 * arithmetic rather than being asserted, and it is why the two counter rows below differ in
 * resolution and must produce the SAME layout, while the tablet row shares a resolution with one
 * of them and must not.
 *
 * ## The seven, each earning its row
 *
 * | row | window px | diagonal | glass | ships | why it is here |
 * |---|---|---|---|---|---|
 * | `counter-1366` | 1366×768 | 15.6″ | 345 × 194 mm | yes | `27 §1a` counter, the preferred panel |
 * | `counter-1920` | 1920×1080 | 15.6″ | 345 × 194 mm | yes | `27 §1a` counter — `DEC-UI-001` (e); same glass, different pixels |
 * | `laptop-1280` | 1280×800 | 13.3″ | 286 × 179 mm | yes | **the most likely BYO device, and the app used to REFUSE it** |
 * | `tablet-10.1` | 1366×768 | 10.1″ | 223 × 126 mm | no | `27 §1a` waiter tablet — the NARROW and SHORT case |
 * | `netbook-1024` | 1024×600 | 10.1″ | 221 × 130 mm | no | the same glass at 78% fewer pixels — `27-F11c` as an experiment |
 * | `desktop-24` | 1920×1080 | 24″ | 531 × 299 mm | yes | **the founder's window.** Same pixels as row 2, 1.5× the glass |
 * | `ultrawide-32` | 3840×1080 | 32″ | 783 × 220 mm | yes | the deliberately awkward one: 3.56:1, very wide and short |
 *
 * Rows 2 and 6 are the pair that matters most and they are why this cannot be a pixel sweep:
 * **identical `1920×1080`, and the layout must differ**, because one is a 15.6″ counter and the
 * other is a 24″ desktop. A gate keyed on pixels is blind to the entire defect by construction.
 * Rows 4 and 5 are the same argument from below — the same 10.1″ glass at 1366×768 and 1024×600,
 * 78% apart in pixels, producing the same two clipped surfaces.
 *
 * `ultrawide-32` is a real product (32:9 at 32″) rather than an invented viewport, and it is the
 * stress row: 783 mm of width against 220 mm of height, where the vertical budget is tightest and
 * the horizontal one is absurd. It is included on the brief's own instruction to sweep *"a
 * deliberately awkward one (very wide-short, and narrow) to catch what the founder hit."*
 *
 * ## ⚠ WHAT THIS PARAGRAPH USED TO SAY, AND WHY THE CORRECTION IS THE INTERESTING PART
 *
 * It read: *"The window's declared floor still binds (`COUNTER_WINDOW_OPTIONS.minWidth/minHeight`),
 * so every row is at or above 1366×768 in PIXELS while spanning 223→783 mm of GLASS. Nothing here
 * probes below a size the shipped app refuses to be, which would measure a state no operator can
 * reach."* Every clause was true and the conclusion was a cage: **the pixel floor made the defect
 * it caused unmeasurable.** Adding `netbook-1024` while it stood produced `THE PANEL WAS NOT THE
 * PANEL: asked for 1024x600 and the renderer got 1366x768` — Electron clamped the probe — so the
 * one rail that could have shown that `minWidth: 1366` refuses clean hardware was prevented from
 * looking by that same constant.
 *
 * The floor is `PANEL_FLOOR_MM` now: **215 × 134 mm of glass**, clamped to the display rather
 * than refused (`window-options.ts`). `laptop-1280` therefore enters as a SHIPPING row — it is
 * 286 × 179 mm, it clears the floor, and it was measured completely clean on all 13 surfaces in
 * both device states before it was added here. The two below-floor rows stay `ships: false`.
 *
 * **`phone-6.5` (1080×2340 @6.5″) is deliberately absent and must stay absent.** It is 69 × 150 mm
 * — a portrait surface the counter has no layout for — and it fails two COMPOSITION checks, which
 * bind on every panel regardless of `ships`. Admitting it would red the gate for everyone, and
 * weakening the gate to admit a panel is backwards. A portrait layout is separate work.
 */
const PANELS = [
  {
    label: "counter-1366",
    width: COUNTER_WINDOW_OPTIONS.width,
    height: COUNTER_WINDOW_OPTIONS.height,
    diagonalIn: 15.6,
    ships: true,
  },
  { label: "counter-1920", width: 1920, height: 1080, diagonalIn: 15.6, ships: true },
  /**
   * **`ships: true` — the row that the old pixel floor made illegal, and the reason it moved.**
   *
   * 1280×800 on 13.3″ glass is 286 × 179 mm. It is the most ordinary piece of
   * bring-your-own-hardware there is, it renders every surface of this product with **zero**
   * violations in both device states, and `minWidth: 1366` REFUSED IT — the app would not open at
   * that size. Meanwhile 1366×768 on 10.1″ glass satisfied the same floor exactly and clips two
   * surfaces. That pair is the whole argument for `PANEL_FLOOR_MM`, and this row is what stops it
   * regressing: if a layout change pushes the counter past what 286 × 179 mm holds, this reddens.
   */
  { label: "laptop-1280", width: 1280, height: 800, diagonalIn: 13.3, ships: true },
  /**
   * **`ships: false` — this glass is `27 §1a`'s WAITER row, not the counter's, and the
   * distinction is what stops this panel demanding a forbidden fix.**
   *
   * `27 §1a` puts the counter POS at **15.6″** and the 10.1″ Android in the *waiter tablet* row,
   * whose posture is `handheld` (64 dp) rather than `keypad` (126 dp). The counter renderer on it
   * is not a shipping configuration — `apps/waiter` is a stub — so measuring it here is a stress
   * probe, not a product claim.
   *
   * It matters that it cannot GATE, because the only way to make the counter fit 126 mm of glass
   * height is to shrink `27-F8`'s 20 mm keys, which `27-F68` (b) and `DEC-UI-001` forbid by name:
   * *"reducing the millimetres to make a layout fit is forbidden."* A gate whose only available
   * remedy is a spec violation is a gate that gets suppressed. So its FIT violations are reported
   * and its **composition** violations still bind — asymmetry is a layout decision at any size,
   * and it is the half this panel genuinely tests.
   *
   * What it buys, and it is worth the row: it is the only panel here that can red on a layout
   * that stops working when the glass gets SMALL, and the report tells a reader the true and
   * useful thing — how much counter this hardware cannot hold.
   */
  /**
   * **`ships: true` since August 2026 — this is the row the compact arrangement was built for,
   * and the founder's bring-your-own-hardware ruling is not true in the product without it.**
   *
   * 1366×768 on 10.1″ glass is **223.6 × 125.7 mm**: the cheap Android tablet class most
   * Pakistani restaurants already own. It sat at `ships: false` with **25 violations** —
   * `TAKE CASH`'s pad clipped, `Other` / `Receipt photo` / `Paid out` off the right edge and
   * genuinely UNREACHABLE on `02-F26`'s precondition sequence — and the note here argued the row
   * *"cannot GATE, because the only way to make the counter fit 126 mm of glass height is to
   * shrink `27-F8`'s 20 mm keys, which `27-F68` (b) and `DEC-UI-001` forbid by name."*
   *
   * **That premise was false and this row is the disproof.** The keys are untouched — the gate
   * measures them at 20.00 mm on this very panel — and the surfaces fit because the ARRANGEMENT
   * changed: the tab rail moved to the side (85 dp), Pay dropped panel chrome it did not need at
   * this size (42 dp), and Cash's tile rows gained something to wrap against. Nothing was
   * trimmed; things were put in different places. The old note reasoned from *"the pad is 528 dp
   * and the box is 485"* to *"no layout can fit"*, which skipped the question of how much chrome
   * was standing between them.
   *
   * It keeps its value as the tightest shipping panel in the sweep: 2.6 mm of width and 0.7 mm of
   * height over `PANEL_FLOOR_MM`. If any surface grows, this reddens first.
   */
  { label: "tablet-10.1", width: 1366, height: 768, diagonalIn: 10.1, ships: true },
  /**
   * **`ships: false` — the BYO netbook, and it is here as a tripwire rather than as a target.**
   *
   * 1024×600 on 10.1″ glass is 221 × 130 mm — the *same* physical surface as `tablet-10.1`
   * above at **78% fewer pixels**, and it produces near-identical results. That pair is
   * `27-F11c` demonstrated on hardware rather than asserted: pixels bought nothing.
   *
   * It cannot gate for the same reason the tablet cannot: 130 mm of glass height is under the
   * measured floor (`window-options.ts`' `PANEL_FLOOR_MM`), and the only way to make the counter
   * fit it is to shrink `27-F8`'s 20 mm keys, which `27-F68` (b) forbids by name. A gate whose
   * only available remedy is a spec violation is a gate that gets suppressed.
   *
   * What it buys is a live tripwire on two defects that bite only below the floor and that no
   * suite in this repo can see: `ItemGrid`'s pager clipping the row beneath it, and the
   * `COUNTED Rs 0` echo going under `03-F5`'s band on Cash.
   */
  { label: "netbook-1024", width: 1024, height: 600, diagonalIn: 10.1, ships: true },
  /**
   * # THE PROBE **BELOW** THE FLOOR — the row that keeps `PANEL_FLOOR_MM` from being a guess
   *
   * 1024×600 on 9.2″ glass is **201.6 × 118.1 mm**, about 9% under the floor on each axis. It is
   * here for one job: a floor is a claim that hardware below it does NOT work, and every other
   * row in this table is evidence for the opposite claim. Without a failing panel, `220 × 125`
   * would rest on the absence of a measurement — which is precisely the criticism
   * `window-options.ts` levelled at the 134 mm floor it replaced (*"a panel in either gap gets
   * the floor's verdict on an arithmetic argument, not on a screenshot"*).
   *
   * `ships: false`, so its FIT verdicts report rather than gate — the point is to SEE the
   * failure, not to be blocked by it. Its composition verdicts still bind, like every panel's.
   *
   * **If this row ever goes quiet, the floor has become too conservative and should come down**
   * — which is the anti-rot direction this table has never had a check for.
   */
  { label: "probe-below-floor", width: 1024, height: 600, diagonalIn: 9.2, ships: false },
  /**
   * # THE THREE ROWS THAT FILL `130–174 mm`, THE BAND NOBODY HAD EVER RENDERED
   *
   * `window-options.ts` said so itself, in a warning it kept rather than papered over: height
   * was measured at 126, 130, 174 and 179 mm — *"so **nothing between 130 mm and 174 mm has ever
   * been rendered**, and 134 sits inside that gap … a panel in either gap gets the floor's
   * verdict on an arithmetic argument, not on a screenshot."*
   *
   * A floor is a claim about the boundary between hardware that works and hardware that does
   * not, and the boundary was the one place with no measurements. These three put a rendered
   * panel at **144, 156 and 166 mm**, which brackets both the old floor (134) and the new one.
   *
   * They are ordinary laptop and tablet glass rather than invented viewports, and each one is
   * chosen to land on a different side of a mode boundary so the sweep exercises the arrangement
   * a real device of that size would actually get:
   *
   * | row | glass | mode | what it probes |
   * |---|---|---|---|
   * | `tablet-11.6` | 257 × 144 | `compact` | 144 mm — under `counter`'s 150 mm on BOTH axes by a small margin |
   * | `laptop-12.5` | 277 × 156 | `counter` | **the tightest panel that is still `counter`** — 6 mm over the height threshold |
   * | `laptop-13.3-hd` | 294 × 166 | `counter` | the counter arrangement with a little room, between 156 and 179 |
   *
   * **`laptop-12.5` is the load-bearing one.** `SURFACE_MODE_MIN_MM.counter.heightMm` is an
   * assertion that the *counter* arrangement fits 150 mm of glass, and this row is the only
   * thing in the repo that renders it near there. If the counter arrangement ever grows past
   * what 156 mm holds, this reddens and the threshold is wrong — which is exactly the failure a
   * threshold set by arithmetic cannot report on itself.
   *
   * Note `laptop-13.3-hd` shares its 13.3″ diagonal with `laptop-1280` and is **different
   * glass**: 1366×768 is 16:9 and 1280×800 is 16:10, so the same diagonal gives 294 × 166 and
   * 286 × 179. That is `27-F11c` from a third direction — same inches, different room — and it
   * is why the twin check keys on the glass and not on the diagonal.
   */
  { label: "tablet-11.6", width: 1366, height: 768, diagonalIn: 11.6, ships: true },
  { label: "laptop-12.5", width: 1920, height: 1080, diagonalIn: 12.5, ships: true },
  { label: "laptop-13.3-hd", width: 1366, height: 768, diagonalIn: 13.3, ships: true },
  { label: "desktop-24", width: 1920, height: 1080, diagonalIn: 24, ships: true },
  { label: "ultrawide-32", width: 3840, height: 1080, diagonalIn: 32, ships: true },
] as const;

/**
 * The number of surfaces one panel contributes: one lock surface, five tabs in two device states,
 * and two escalation steps.
 *
 * Derived rather than typed so `MIN_SURFACES` below cannot rot when a tab is added — the tab list
 * is read from the DOM precisely so another session's tab is measured without touching this file,
 * and a hand-typed floor would then be the one thing that did need touching.
 */
const SURFACES_PER_PANEL = 1 + 5 * 2 + 2;

/**
 * `24-F14` empty-match protection: a gate that measured nothing must FAIL, never pass.
 *
 * Set one whole panel below the expected total, so **losing any single panel reds the gate**. A
 * floor that only catches total collapse is not a floor, and with five panels the failure mode
 * this guards is no longer "nothing ran" but "one row silently stopped loading".
 */
const MIN_SURFACES = (PANELS.length - 1) * SURFACES_PER_PANEL;

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

/**
 * # THE COMPOSITION CHECK — the one question here that is not "does it fit"
 *
 * **This rail's blind spot, stated by the founder rather than by a test.** Every other check
 * above asks whether a thing fits or can be touched, and a tender panel anchored in the top-left
 * of a 24″ window with the bottom third empty answers *yes* to both. He answered *"this user
 * interface is unusable for a human"*, and he was reading the same screen.
 *
 * ## What is measured, and why it is SYMMETRY rather than density
 *
 * The obvious check is a density floor — flag a surface whose content covers less than some
 * fraction of its viewport — and **it cannot be made honest.** It fires on every legitimately
 * sparse surface this product has: `02-F18`'s empty-state line ("No order to settle"), a
 * reconciliation with one closed shift, a roster of three, the Orders inbox on a quiet Tuesday.
 * Every one of those is *correct* at low density, and there is no threshold that separates them
 * from the defect — the founder's Pay screen covered roughly the same fraction of its surface as
 * a legitimately quiet Me tab. A rule that cannot distinguish its target from its control is a
 * rule that gets suppressed, and this repo already knows what a permanently-suppressed signal
 * does to the ones beside it (`27-F16`, and the two red chips that meant nothing).
 *
 * **Asymmetry can be made honest, because it measures a DECISION and not an amount.** Content
 * with a natural maximum size, centred in a surface larger than it, has equal margins — that is a
 * layout that considered the leftover room and gave it back deliberately. The identical content
 * pinned to a corner has all of the slack on two sides. Same coverage, same fit, opposite
 * intents, and the difference is arithmetic rather than taste. It is also scale-free: it says
 * nothing about how much room a surface should use, which is exactly the judgement a gate has no
 * business making.
 *
 * ## The threshold, and why it is loose
 *
 * A surface fails when the slack on one side exceeds the slack on the other by more than
 * **{@link COMPOSITION_TOLERANCE} of the work area** on either axis. At 0.25 that is a quarter of
 * the surface of pure asymmetry before anything is said — deliberately far above anything a
 * `space-between` header, a bottom-aligned pager or an odd-pixel centring can produce, and far
 * below the founder's case, which ran **57% horizontally and 39% vertically** on the panel he
 * opened. Measured on the shipped tree, not chosen: see the report at the bottom of this file for
 * what every surface reads, including the ones that pass with room to spare.
 *
 * **What it deliberately does NOT catch, so a green run is not over-read:** a surface that is
 * symmetric and ugly, a surface whose content is centred but far too small for the room, and any
 * question of typography, hierarchy or colour. It separates *composed* from *abandoned*. It has
 * no opinion whatsoever about whether the composition is any good, and the only thing that does
 * is looking at the screenshots this gate now writes.
 */
const COMPOSITION_TOLERANCE = 0.25;

/**
 * Surfaces whose asymmetry is a fact about the CONTENT rather than a layout that gave up, keyed
 * by the tab label so the entry survives a panel being added.
 *
 * `Order` is the shape this exemption exists for and the only member: `27-F2`/`27-F11a` make the
 * item grid a **paged** surface that fills its box top-left and pages laterally, with the last
 * page legitimately part-full — `ItemGrid` pins its rows to `alignContent: "start"` for `27-F4`
 * (*"a page with four items must put them where a page with forty puts its first four"*), which
 * is bottom slack by construction and is the correct behaviour. Centring that page would move
 * every tile the moment the menu changed size, which is the breaking change `27-F4` names.
 *
 * It is exempt on the VERTICAL axis only. Horizontal asymmetry on Order would mean the grid or
 * the cart had stopped filling the width, which is defect 2's own shape and must still red.
 */
const COMPOSITION_EXEMPT_Y: readonly string[] = ["Order"];

/**
 * # `RESTOS_LAYOUT_SHOTS=<dir>` — the gate writes a PNG of every surface it measures
 *
 * **Because measuring is not looking, and this repo has the receipts.** Seven layout defects were
 * found by launching the app and looking; zero by the suites. Two more were found by a founder
 * looking at screens that had passed every check in this file. The rail's own blind-spot list
 * says it *"judges nothing about legibility, contrast or typography"* and that
 * *"`27-F4`'s positional contract is invisible to it"* — and there is exactly one instrument for
 * all of that, which is a person's eye on a picture.
 *
 * So the gate hands you the pictures. Same window, same fixture, same five panels, same two
 * device states — 65 surfaces — captured at the moment each one is judged, which is the property
 * a screenshot taken by hand afterwards does not have (a hand-driven session cannot reliably
 * reproduce the escalation pad on the third panel with the band up).
 *
 * **Off by default and it must stay off**, for the reason `T-01-07` gives everywhere else here: a
 * rail that writes 65 PNGs on every `pnpm verify` is a rail people turn off. Unset, this is one
 * branch that does nothing.
 *
 * It is **not evidence of correctness** — nothing about a PNG asserts anything, and a green gate
 * beside an ugly screenshot is exactly the state this whole exercise started from. It is evidence
 * for a *human*, which is the only reader that can answer the question the founder is asking.
 */
const SHOT_DIR = process.env["RESTOS_LAYOUT_SHOTS"];

const shoot = async (window: BrowserWindow, name: string): Promise<void> => {
  if (SHOT_DIR === undefined || SHOT_DIR === "") return;
  const image = await window.webContents.capturePage();
  writeFileSync(join(SHOT_DIR, `${name}.png`), image.toPNG());
};

type Failure = {
  readonly surface: string;
  readonly state: State;
  readonly detail: string;
  /**
   * A FIT verdict (overflow, clipping, reachability) as opposed to a COMPOSITION one. Only fit
   * verdicts are downgraded to a report on a `ships: false` panel; asymmetry is a layout decision
   * on any glass and binds everywhere.
   */
  readonly fit?: boolean;
};

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
/** Distinct clipping boxes the ancestor walk reached, summed over surfaces (`24-F14`). */
let clippingAncestorsSeen = 0;

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

  // `24-F14` — the ancestor walk must have found something to walk. `index.html` clips `html`,
  // `body` and `#root`, so three is the floor on every surface in this product; zero means the
  // walk is inert and every `clippedBy: null` below is a non-answer rather than a pass.
  clippingAncestorsSeen += r.clippingAncestors;
  if (r.clippingAncestors === 0) {
    failures.push({
      surface,
      state,
      detail:
        `EMPTY MATCH — ${r.controls.length} control(s) measured and NOT ONE clipping ancestor ` +
        "found on any of their chains. index.html sets `overflow: hidden` on html, body and " +
        "#root, so the floor here is three: the ancestor walk in probe.ts has stopped working " +
        "and every control on this surface is being reported as unclipped without being " +
        "measured (24-F14).",
    });
  }

  for (const o of r.overflows) {
    clippingBoxesSeen += 1;
    failures.push({
      surface,
      state,
      fit: true,
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
        fit: true,
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
    /**
     * **CLIPPED BY AN ANCESTOR — the verdict this gate did not have, and its absence was a rail
     * defect rather than a missing nicety.**
     *
     * Measured 2026-08-10 on `netbook-1024` (1024×600 @10.1″): the gate reported **0 clipped
     * controls** on the Order tab while five menu tiles were visibly sliced by the pager. Every
     * one of them was inside the viewport, so `withinViewport` was true and nothing fired; the
     * only signal was a box-level `OVERFLOW` line, which names the BOX and not the controls. A
     * count that reads cleaner than the screenshot is worse than no count.
     *
     * **The wording is load-bearing, and this file has the receipts.** A `withinViewport`
     * failure once concluded *"this control cannot be touched"* for a key overhanging by 31 px
     * of 126 whose centre hit-tests fine; that sentence propagated into a `CLAUDE.md`, then into
     * a task brief, and an agent was dispatched to fix a blocker that did not exist. So this
     * message states three facts and never infers a fourth: **what is cut, by how much, and —
     * separately — whether the centre still hit-tests.**
     *
     * It supersedes the `COVERED` check below for this control rather than stacking with it. A
     * control whose centre is clipped away also fails `elementFromPoint`, and reporting one
     * defect twice under two names is how a violation count stops meaning anything.
     */
    if (c.clippedBy !== null) {
      const k = c.clippedBy;
      const edges = (["top", "right", "bottom", "left"] as const)
        .filter((e) => k.lost[e] > 0)
        .map((e) => `${k.lost[e]}px off its ${e}`)
        .join(", ");
      failures.push({
        surface,
        state,
        fit: true,
        detail:
          `CLIPPED BY ANCESTOR: ${c.label} at (${c.rect.x},${c.rect.y}) ${c.rect.w}x${c.rect.h} ` +
          `is entirely inside the ${r.viewport.w}x${r.viewport.h} viewport, and its ancestor ` +
          `${k.by} (overflow: ${k.overflow}) cuts ${edges} — ${k.visible.w}x${k.visible.h} of ` +
          `${c.rect.w}x${c.rect.h} survives. ` +
          (k.overflow === "hidden" || k.overflow === "clip"
            ? "That box CLIPS, so the lost pixels are not painted at all."
            : "That box SCROLLS, so the lost pixels are reachable only by scrolling, which 27-F2 " +
              "forbids for anything actionable.") +
          " SEPARATELY, and this is a different question: " +
          (c.hitTestable
            ? "its centre DOES still hit-test, so the control can be pressed — this is a target " +
              "27-F8 sizes deliberately being made smaller by a layout, not a control that is " +
              "out of reach."
            : "its centre does NOT hit-test, so on this surface the control cannot be pressed " +
              "at all.") +
          " The box-level OVERFLOW verdict names the container; this names what the operator loses.",
      });
      continue;
    }
    // A DISABLED control is not hit-testable by design — `27-F4` disables in place rather than
    // hiding, so it must be ON SCREEN (checked above) but need not respond.
    if (!c.hitTestable && !c.disabled) {
      failures.push({
        surface,
        state,
        fit: true,
        detail:
          `COVERED: ${c.label} at (${c.rect.x},${c.rect.y}) is inside the viewport but ` +
          "elementFromPoint at its centre lands on something else — another element is painted over it.",
      });
    }
  }

  judgeComposition(surface, state, r);

  note(
    `  [${state}] ${surface}: ${r.controls.length} controls, ${r.overflows.length} overflow(s), viewport ${r.viewport.w}x${r.viewport.h}`,
  );
};

/** Totals for the composition check, so it too can prove it looked at something (`24-F14`). */
let extentsMeasured = 0;
/** Axes actually judged for composition, and axes skipped because the content did not fit. */
let compositionAxesJudged = 0;
let compositionAxesSkipped = 0;
/**
 * Every axis the fit precondition skipped, kept so the `24-F14` guard below can check the claim
 * that makes the suppression safe: **a skipped axis must be a surface the FIT checks report.**
 */
const skippedComposition: { surface: string; state: State; axis: "x" | "y" }[] = [];

/**
 * 1 dp of slack, matching `probe.ts`' own floor and a deliberate floor rather than slack: a
 * sub-pixel rounding on a border must not retire an axis from the composition check, while every
 * real overflow measured here has been tens of dp (46, 90, 108).
 */
const COMPOSITION_FIT_TOLERANCE = 1;

/**
 * # `27-F11c` AS A TEST — the two counter panels must lay out IDENTICALLY
 *
 * *"A 1366×768 and a 1920×1080 15.6″ panel hold the SAME number of 12 mm tiles. Extra pixels buy
 * sharpness; only inches buy room."* Both are `27 §1a`'s counter, both are 345 × 194 mm of glass,
 * so under `27-F68` every surface must come out the same size **as a proportion of its work
 * area** on both. Only the pixel count differs, and `27-F11c` says the pixel count buys nothing.
 *
 * **⚠ THIS EXISTS BECAUSE A MUTANT CAUGHT ITS ABSENCE, AND THE ABSENCE HAD A DOC COMMENT CLAIMING
 * OTHERWISE.** `PANELS` above says in as many words that the two counter rows *"must produce the
 * SAME layout"*, and **nothing compared them.** Mutant M5 — the context keyed on CSS pixels
 * instead of millimetres, which is the exact category error `27-F11c` exists to name — put the two
 * twins in different modes and left this gate **GREEN**, because a differently-sized composition
 * that is still centred still composes fine. The rail measured composition and was blind to
 * adaptation.
 *
 * A RATIO and not a pixel count, because the two panels differ in pixels by construction and
 * requiring them to agree in pixels is precisely the wrong test. Tolerance is 3% of the axis: wide
 * enough for the sub-pixel rounding two different fractional `zoom` factors produce, far below the
 * ~9% a single mode change moves the tender panel by.
 */
const PANEL_TWIN_TOLERANCE = 0.03;
/** `state + surface -> panel -> [content/box width, content/box height]`, filled as the sweep runs. */
const shape = new Map<string, Map<string, readonly [number, number]>>();

const judgeComposition = (surface: string, state: State, r: SurfaceReport): void => {
  const e = r.extent;
  // The unlock surface has no `AppShell` and therefore no `<main>` (`02-F18` — the lock sits OVER
  // the shell). Nothing to judge, and saying so beats inventing a work area for it.
  if (e === null) return;
  extentsMeasured += 1;
  if (e.content === null) {
    failures.push({
      surface,
      state,
      detail:
        "EMPTY MATCH — the work area contains no INKED element at all: no control, no fill, no " +
        "boundary, no text. Either the surface did not render or `measureSurface`'s ink test has " +
        "stopped recognising what this product draws, and either way the composition check below " +
        "proves nothing about it (24-F14).",
    });
    return;
  }
  // Record the shape as a PROPORTION of the work area, for the `27-F11c` twin check below. The
  // surface key strips the panel label, which is what lets two panels' rows meet.
  const at = surface.indexOf(" ");
  const key = `${state} ${surface.slice(at + 1)}`;
  if (!shape.has(key)) shape.set(key, new Map());
  shape.get(key)?.set(surface.slice(0, at), [e.content.w / e.box.w, e.content.h / e.box.h]);

  const slack = {
    left: e.content.x - e.box.x,
    right: e.box.x + e.box.w - (e.content.x + e.content.w),
    top: e.content.y - e.box.y,
    bottom: e.box.y + e.box.h - (e.content.y + e.content.h),
  };
  const tab = surface.slice(surface.indexOf("tab:") + 4);
  const axes = [
    { axis: "x" as const, a: slack.left, b: slack.right, span: e.box.w, ends: "left/right" },
    {
      axis: "y" as const,
      a: slack.top,
      b: slack.bottom,
      span: e.box.h,
      ends: "top/bottom",
      exempt: surface.includes("tab:") && COMPOSITION_EXEMPT_Y.includes(tab),
    },
  ];
  for (const { axis, a, b, span, ends, exempt } of axes) {
    if (exempt === true || span <= 0) continue;
    /**
     * # THE PRECONDITION: THERE HAS TO BE LEFTOVER ROOM BEFORE YOU CAN ASK WHERE IT WENT
     *
     * **This check is only defined on content that FITS, and for one round it was not told so.**
     * Every sentence of its own design note above presupposes it — *"content with a natural
     * maximum size, centred in a surface **larger than it**, has equal margins"*, *"the leftover
     * room"*, *"all of the slack on two sides"*. Slack is leftover room. When the content is
     * TALLER than its box the slack goes negative, there is no leftover room to have placed
     * anywhere, and `|top − bottom|` stops answering the question this check exists to ask.
     *
     * ## What it answers instead, in closed form
     *
     * Let the content overrun the box by `D > 0`. Then `top + bottom = box − content = −D`,
     * always, so `|top − bottom| = |2·top + D|`:
     *
     * | alignment under overflow | top | asymmetry | verdict |
     * |---|---|---|---|
     * | `center` — the cut is split across BOTH ends | `−D/2` | **0, for any D** | passes |
     * | `safe center` → falls back to start | `+padding` | `2·padding + D` | fails past tolerance |
     *
     * So on overflowing content this is **a function of the alignment mode and not of the loss**:
     * a centred overflow of any magnitude — ten pixels or ten thousand — has asymmetry exactly
     * zero and always passes, while the same content pushed to one edge fails. That is a FIT
     * fact, wearing a composition verdict's clothes.
     *
     * ## Measured, not argued — and the incentive was inverted
     *
     * `Counter.tsx` centres its work area with **`safe center`**, chosen deliberately (see its
     * own note) because a plain `center` splits the cut top and bottom and *"hides half of itself
     * above the viewport, where nothing looks for it"*. Reverting that one keyword on the shipped
     * tree, changing nothing else — layout gate, `tablet-10.1 tab:Pay`, band up:
     *
     * | | overflow | fit verdicts | ANCHORED | gate |
     * |---|---|---|---|---|
     * | `center` — loss split across both ends | 46 dp | 6 controls clipped, **0 unreachable** | none | **PASSED** |
     * | `safe center` — loss at the bottom edge | 108 dp | **3 controls UNREACHABLE** | fires | **FAILED** |
     *
     * The check was **passing the arrangement that hides its loss off the top of the screen and
     * failing the one that puts it where an operator and a screenshot both look.** Whichever of
     * those two layouts is better is not this rail's call; producing opposite verdicts on the
     * same lost pixels is what makes it unsound rather than merely redundant.
     *
     * ## Why suppressing it here silences NOTHING — the load-bearing claim
     *
     * The fit checks already own an overflowing surface, and they own it far better: on that
     * exact surface they report `OVERFLOW y: main holds 593px in a 485px box` **plus three
     * `UNREACHABLE` verdicts naming `C`, `0` and `⌫` by label**. An `OVERFLOW` carries
     * `fit: true`, so **on a shipping panel it is FATAL** — a genuinely broken shipping surface
     * still reddens the gate, under the verdict that is true. `judgeComposition` runs after the
     * fit checks for exactly this reason, and the `24-F14` guard below asserts the pairing rather
     * than assuming it.
     *
     * ## What this is NOT, stated because it is one keystroke away from being it
     *
     * **It is not a panel exemption.** It names no panel, no `ships` flag and no size floor, and
     * it behaves identically on `counter-1366` and on `tablet-10.1`. A surface whose content FITS
     * is judged strictly on **every** panel — including the two below `PANEL_FLOOR_MM`, where
     * `tab:Me`, `tab:Orders` and `tab:Order` all fit and all remain fully bound. Suppressing
     * composition *by floor* would have silenced those, which is the change this deliberately is
     * not; the mutation matrix in `apps/pos-electron/CLAUDE.md` carries the row that proves it.
     *
     * Per AXIS, not per surface: content routinely fits horizontally while overflowing
     * vertically, and the horizontal composition judgement stays perfectly meaningful there.
     */
    const fits = a >= -COMPOSITION_FIT_TOLERANCE && b >= -COMPOSITION_FIT_TOLERANCE;
    if (!fits) {
      compositionAxesSkipped += 1;
      skippedComposition.push({ surface, state, axis });
      note(
        `  [${state}] ${surface}: composition ${axis} NOT JUDGED — the content overruns its work ` +
          `area (${Math.round(a)}dp / ${Math.round(b)}dp of slack, one of them negative), so there ` +
          "is no leftover room whose placement could be judged. The FIT checks above own this " +
          "surface.",
      );
      continue;
    }
    compositionAxesJudged += 1;
    const asymmetry = Math.abs(a - b);
    if (asymmetry <= span * COMPOSITION_TOLERANCE) continue;
    failures.push({
      surface,
      state,
      detail:
        `ANCHORED ${axis}: the content occupies ${e.content.w}x${e.content.h} of a ${e.box.w}x${e.box.h} ` +
        `work area with ${Math.round(a)}dp and ${Math.round(b)}dp of slack on its ${ends} — an ` +
        `asymmetry of ${Math.round(asymmetry)}dp, ${Math.round((asymmetry / span) * 100)}% of the axis, ` +
        `over the ${Math.round(COMPOSITION_TOLERANCE * 100)}% this gate allows. ` +
        // **THIS SENTENCE IS A CLAIM AND IT HAS TO BE TRUE.** It read "It FITS and every control
        // is reachable" unconditionally, and it fired on a surface holding 593 dp in a 485 dp box
        // with three controls whose centres did not hit-test — the verdict asserting the exact
        // opposite of four other verdicts on the same surface. The fit precondition above is what
        // makes the first clause true by construction now, and the second is dropped: content
        // fitting `<main>` is not the same claim as no control overhanging the viewport, and this
        // gate has already paid once for a verdict that concluded more than it measured.
        "The content FITS its work area — this check does not run otherwise, because slack that " +
        "does not exist cannot have been placed anywhere. Content pinned against one edge with all the " +
        "leftover room on the other is a layout that ran out of opinions, and it is what a founder " +
        'called "unusable for a human" on a screen every other check here passed. Either the ' +
        "composition should fill the room, or it has a natural maximum and the surface should " +
        "CENTRE it — both are decisions; this is neither.",
    });
  }
};

const run = async (): Promise<number> => {
  if (SHOT_DIR !== undefined && SHOT_DIR !== "") mkdirSync(SHOT_DIR, { recursive: true });
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
   * **`24-F14` — is `01-F56`'s catalog-health chip actually on the strip?**
   *
   * `CatalogHealth` renders `null` when the menu is current (`27-F16`), and it is not a control,
   * so `measureSurface`'s sweep — which walks clipping boxes and `button`s — would report a
   * perfectly clean strip whether the chip is there or not. That is mutation row M8's lesson
   * exactly: `escalationFor: () => null` took `ManagerApproval` out of coverage for weeks and the
   * gate stayed green, and the property that line lacked was **a check that the fixture is still
   * producing the state**. One reverted line in `preload.ts` would otherwise silently retire this
   * whole surface from the sweep.
   *
   * It asks the DOM rather than the fixture, so it also fails if the chip stops reaching the
   * strip for any reason at all — `Counter.tsx` dropping the prop, `AppShell` dropping the
   * pass-through, `StatusStrip` dropping the element.
   */
  const catalogChipPresent = (): Promise<boolean> =>
    window.webContents.executeJavaScript(
      `[...document.querySelectorAll('[role="status"]')]
         .some((e) => (e.getAttribute('aria-label') || '').startsWith('Menu: not updating'))`,
    );

  /**
   * **`24-F14` — is `27-F11c`'s panel-fit notice actually on the strip?**
   *
   * Same argument as `catalogChipPresent` directly above and the same failure mode:
   * `PanelHealth` renders `null` when the glass clears the floor (`27-F16`) and it is not a
   * control, so `measureSurface` — which walks clipping boxes and `button`s — reports a
   * perfectly clean strip whether it is there or not. One reverted line in `preload.ts` would
   * retire the surface from the sweep in silence, which is exactly what
   * `escalationFor: () => null` did to `ManagerApproval`.
   *
   * It asks the DOM rather than the fixture, so it also fails if the notice stops reaching the
   * strip for any reason at all — `Counter.tsx` dropping the prop, `AppShell` dropping the
   * pass-through, `StatusStrip` dropping the element. That matters more here than for the
   * catalog chip: this notice is the ONLY thing telling an operator that the window's floor
   * clamped instead of refusing, so a silent drop turns the founder's ruling back into a plain
   * regression.
   */
  const panelChipPresent = (): Promise<boolean> =>
    window.webContents.executeJavaScript(
      `[...document.querySelectorAll('[role="status"]')]
         .some((e) => (e.getAttribute('aria-label') || '').startsWith('Screen: '))`,
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

  /**
   * # THE FLOOR IS MILLIMETRES NOW, AND IT IS CHECKED ON A WINDOW OF ITS OWN
   *
   * **Why a second window.** The floor used to be `COUNTER_WINDOW_OPTIONS.minWidth/minHeight`, a
   * pixel pair, and the sweep window could carry it because every panel in `PANELS` was above
   * 1366×768 in pixels by construction — the old `PANELS` doc comment said so and treated it as
   * a virtue. That is precisely what stopped this rail from ever measuring small glass: adding
   * `netbook-1024` to the sweep produced `THE PANEL WAS NOT THE PANEL: asked for 1024x600 and
   * the renderer got 1366x768`, because Electron clamped it. **The pixel floor made the defect
   * it caused unmeasurable**, which is the tidiest possible demonstration of why it had to go.
   *
   * So the sweep window carries **no minimum at all** and can be set to any panel, and the
   * shipped floor is exercised here on a throwaway window built from the SAME
   * `counterWindowOptions` the app calls — imported, not retyped, for this file's founding
   * reason.
   *
   * The density is stated rather than read off the host, so the expected pixel figure is
   * deterministic on any machine: `27 §1a`'s 1366×768 counter is 100.5 PPI at `devicePixelRatio`
   * 1, where `PANEL_FLOOR_MM`'s 215 × 134 mm is **851 × 530 css px**. `27-F68` (a) forbids
   * pinning that pair anywhere, which is why it is computed here too.
   */
  const FLOOR_TEST_PANEL = {
    panelPpi: (Math.hypot(1366, 768) / 15.6) as number,
    devicePixelRatio: 1,
    // Deliberately unbounded: this window is testing the FLOOR, not the clamp, and a work-area
    // clamp would silently lower the number the assertion is made against.
    workArea: { width: 100_000, height: 100_000 },
  };
  const floorOptions = counterWindowOptions(FLOOR_TEST_PANEL);
  const floorWindow = new BrowserWindow({ ...floorOptions, show: false });
  floorWindow.setContentSize(200, 200);
  await new Promise((r) => setTimeout(r, 200));
  const [fw, fh] = floorWindow.getContentSize() as [number, number];
  note(
    `window: 27-F11c floor is ${PANEL_FLOOR_MM.width} x ${PANEL_FLOOR_MM.height} mm = ` +
      `${floorOptions.minWidth}x${floorOptions.minHeight} css px at ` +
      `${FLOOR_TEST_PANEL.panelPpi.toFixed(1)} PPI; a resize to 200x200 left it at ${fw}x${fh}`,
  );
  if (fw < floorOptions.minWidth || fh < floorOptions.minHeight) {
    failures.push({
      surface: "window",
      state: "alarm",
      detail:
        `THE FLOOR DID NOT HOLD: a resize to 200x200 left the window at ${fw}x${fh}, under the ` +
        `derived minimum of ${floorOptions.minWidth}x${floorOptions.minHeight} css px — which is ` +
        `27-F11c's ${PANEL_FLOOR_MM.width} x ${PANEL_FLOOR_MM.height} mm floor converted through ` +
        `a ${FLOOR_TEST_PANEL.panelPpi.toFixed(1)} PPI panel. AppShell clips and does not scroll ` +
        "(27-F2), so above the floor a smaller window does not get tighter — it hides controls. " +
        "The floor CLAMPS to the display below it (bring-your-own-hardware), and that is the " +
        "clamp's job, not this one's.",
    });
  }
  /**
   * **`24-F14` — and this one is the trap the mm floor introduces.** `counterWindowOptions`
   * clamps its minimum to the work area, so a bug that clamped it to zero, or a `PANEL_FLOOR_MM`
   * edited down to nothing, would make the check above pass vacuously: every resize satisfies a
   * floor of 0. The floor must be a real size before "it held" means anything.
   */
  if (floorOptions.minWidth <= 0 || floorOptions.minHeight <= 0) {
    failures.push({
      surface: "window",
      state: "alarm",
      detail:
        `EMPTY MATCH — the derived floor is ${floorOptions.minWidth}x${floorOptions.minHeight} ` +
        "css px, so the resize check above asserts nothing: every window satisfies a floor of " +
        "zero. Either PANEL_FLOOR_MM has been emptied or the conversion is broken (24-F14).",
    });
  }
  floorWindow.destroy();

  // ---------------------------------------------------------------------------------------
  // 2. EVERY SURFACE, IN BOTH DEVICE STATES, ON BOTH OF `27 §1a`'s COUNTER PANELS.
  //
  // The panel loop is `DEC-UI-001` (e). It reloads rather than merely resizing, because the
  // fixture's alarm is module state in the preload: a reload re-runs it, so the second panel
  // gets `03-F5`'s band up exactly like the first instead of inheriting an acknowledged one.
  // ---------------------------------------------------------------------------------------
  for (const panel of PANELS) {
    // The window's declared floor is 1366x768 of CONTENT, so a panel is never requested below it
    // and Electron never clamps one. Asserted rather than assumed: a clamped panel would be
    // measured under the wrong label, which is worse than not measuring it.
    window.setContentSize(panel.width, panel.height);
    await new Promise((r) => setTimeout(r, 250));
    /**
     * **The diagonal travels to the fixture as a query parameter**, because the density is the
     * whole input and the preload has to have it before React's first read.
     *
     * `deviceState()` is called on mount, so anything injected after `loadFile` resolves arrives
     * a frame too late and the surface paints once at the previous panel's physical size. A query
     * parameter is on the URL the preload's own `location` already carries, which is the only
     * channel that exists before the page runs.
     */
    await window.loadFile(join(HERE, "../renderer/index.html"), {
      query: { diagonalIn: String(panel.diagonalIn) },
    });
    await new Promise((r) => setTimeout(r, 600));

    const [pw, ph] = JSON.parse(
      (await window.webContents.executeJavaScript(
        "JSON.stringify([window.innerWidth, window.innerHeight])",
      )) as string,
    ) as [number, number];
    if (pw !== panel.width || ph !== panel.height) {
      failures.push({
        surface: `${panel.label} panel`,
        state: "alarm",
        detail:
          `THE PANEL WAS NOT THE PANEL: asked for ${panel.width}x${panel.height} and the renderer ` +
          `got ${pw}x${ph}. Every surface below would be measured under a label that does not ` +
          "describe it, which is worse than not measuring it at all (24-F14).",
      });
    }
    note(
      `panel ${panel.label}: ${pw}x${ph} css px at ${panel.diagonalIn}″ = ` +
        `${((panel.diagonalIn * panel.width) / Math.hypot(panel.width, panel.height)) * 25.4} x ` +
        `${((panel.diagonalIn * panel.height) / Math.hypot(panel.width, panel.height)) * 25.4} mm of glass`,
    );

    const on = (surface: string): string => `${panel.label} ${surface}`;

    // `02-F18` — a locked device shows only the unlock screen.
    judge(on("unlock"), "alarm", await measure());
    await shoot(window, `${panel.label}--unlock`);

    await window.webContents.executeJavaScript(
      "window.restos.unlock('user-hina', '1234')",
      // `01-F26`'s session, taken the way the operator takes it. Hina is the branch manager in
      // the dev roster, so role-gated surfaces render rather than refusing.
    );
    await new Promise((r) => setTimeout(r, 600));

    const shell = await measure();

    // `24-F14` — the fixture raises `01-F56`'s refusal for the whole sweep, so the strip below
    // is measured with the chip up. If it is not there, every `tab:` surface measured on this
    // panel is measuring a strip the fixture no longer produces, and a green run would mean
    // nothing about the state this work exists to cover.
    if (!(await catalogChipPresent())) {
      failures.push({
        surface: on("catalog-health"),
        state: "alarm",
        detail:
          "EMPTY MATCH — 01-F56's catalog-health chip is not on the status strip, so every " +
          "surface below was measured WITHOUT it and this sweep says nothing about the state it " +
          "was extended to cover. Either preload.ts stopped serving `deviceState().catalog`, or " +
          "the fact stopped reaching StatusStrip through Counter.tsx / AppShell (24-F14).",
      });
    }

    if (!(await panelChipPresent())) {
      failures.push({
        surface: on("panel-fit"),
        state: "alarm",
        detail:
          "EMPTY MATCH — 27-F11c's panel-fit notice is not on the status strip, so every surface " +
          "below was measured WITHOUT it. That notice is the ONLY thing that tells an operator " +
          "the window's physical floor CLAMPED to their glass instead of refusing to open, so " +
          "losing it silently turns a founder ruling back into a plain regression. Either " +
          "preload.ts stopped serving `deviceState().panelFit`, or the fact stopped reaching " +
          "StatusStrip through Counter.tsx / AppShell (24-F14).",
      });
    }

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
        await shoot(window, `${panel.label}--${state}--${tab.label || i}`);
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
        await shoot(window, `${panel.label}--alarm--escalation-approvers`);
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
          await shoot(window, `${panel.label}--alarm--escalation-pin`);
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
  // `27-F11c` — THE TWIN CHECK. Same glass, different pixels, and the layout must not know.
  // ---------------------------------------------------------------------------------------
  const twins = PANELS.filter((p) => p.diagonalIn === 15.6).map((p) => p.label);
  let twinsCompared = 0;
  if (twins.length !== 2) {
    failures.push({
      surface: "gate",
      state: "quiet",
      detail:
        `EMPTY MATCH — 27-F11c's twin check needs exactly two panels of one diagonal and found ` +
        `${twins.length}. 27 §1a lists the counter at 15.6″ in two resolutions and this is the ` +
        "only check asserting they lay out alike (24-F14).",
    });
  } else {
    const [a, b] = twins as [string, string];
    for (const [key, byPanel] of shape) {
      const one = byPanel.get(a);
      const two = byPanel.get(b);
      if (one === undefined || two === undefined) continue;
      twinsCompared += 1;
      for (const [i, axis] of (["width", "height"] as const).entries()) {
        const l = one[i] ?? 0;
        const r = two[i] ?? 0;
        if (Math.abs(l - r) <= PANEL_TWIN_TOLERANCE) continue;
        failures.push({
          surface: `${a}~${b} ${key}`,
          state: "quiet",
          detail:
            `27-F11c BROKEN: '${key}' fills ${Math.round(l * 100)}% of its work area's ${axis} on ` +
            `${a} and ${Math.round(r * 100)}% on ${b}. Those are the SAME 345 x 194 mm of glass at ` +
            "two resolutions, and 27-F11c is explicit that extra pixels buy sharpness while only " +
            "inches buy room — so a layout that differs between them is keyed on the PIXEL COUNT. " +
            "That is the category error the FR exists to name, and the usual cause is a " +
            "breakpoint, a container query or a media query measuring CSS px where it should be " +
            "measuring millimetres.",
        });
      }
    }
    if (twinsCompared < SURFACES_PER_PANEL - 1) {
      failures.push({
        surface: "gate",
        state: "quiet",
        detail:
          `EMPTY MATCH — only ${twinsCompared} surface(s) were comparable across ${a} and ${b}, ` +
          `expected about ${SURFACES_PER_PANEL - 1}. 27-F11c's twin check is inert (24-F14).`,
      });
    }
  }

  /**
   * # `24-F14` — THE PRECONDITION MUST NOT BECOME A BACK DOOR, AND THIS IS THE ASSERTION
   *
   * The fit precondition in `judgeComposition` creates a brand-new way for the composition check
   * to go quiet: make every surface overflow and every axis is skipped. Its whole safety argument
   * is one sentence — *"the FIT checks already own an overflowing surface"* — and an argument in
   * a comment is not a guard, which is this repo's most-repeated lesson.
   *
   * So the pairing is CHECKED. For every axis the precondition skipped, this demands at least one
   * `fit` verdict on the same surface in the same state. If a composition axis is retired for
   * overflow and nothing else reported that surface, content is being lost with no verdict at all
   * — the exact silence the suppression is claimed not to create.
   *
   * It is not hypothetical. The extent measures the union of INK against `<main>`'s border box,
   * while `OVERFLOW` compares `scrollHeight` to `clientHeight` — and **`scrollHeight` does not
   * count content overflowing the TOP of a box.** A purely upward overflow is therefore visible to
   * this check and invisible to that one, which is precisely the state a plain `center` produces.
   * `CLIPPED BY ANCESTOR` catches it whenever a CONTROL is in the lost region; a surface losing
   * only non-control ink upward is a real blind spot, and this guard is what surfaces it instead
   * of hiding it behind a skip.
   */
  for (const s of skippedComposition) {
    const reported = failures.some(
      (f) => f.fit === true && f.surface === s.surface && f.state === s.state,
    );
    if (!reported) {
      failures.push({
        surface: s.surface,
        state: s.state,
        detail:
          `EMPTY MATCH — composition ${s.axis} was NOT JUDGED here because the content overruns ` +
          "its work area, and NO fit verdict was raised on this surface either. So content is " +
          "being lost and nothing in this gate says so. The composition precondition is only " +
          "safe because the fit checks own an overflowing surface; here they did not. The likely " +
          "cause is an overflow that runs UPWARD only — `scrollHeight` does not count content " +
          "above a box's top edge, so the OVERFLOW check cannot see it, and CLIPPED BY ANCESTOR " +
          "sees it only where a control sits in the lost region (24-F14).",
      });
    }
  }
  if (compositionAxesJudged < MIN_SURFACES - PANELS.length) {
    failures.push({
      surface: "gate",
      state: "quiet",
      detail:
        `EMPTY MATCH — the composition check JUDGED only ${compositionAxesJudged} axes and skipped ` +
        `${compositionAxesSkipped} for overflow. The fit precondition is meant to retire the few ` +
        "surfaces the fit checks already own, not the check itself; at this level the one check " +
        "here that is not about fitting has gone inert (24-F14).",
    });
  }

  // `24-F14` — the composition check must have looked at something too. Without this a change
  // that stopped `<main>` being found would silently retire the whole check while every other
  // number in the summary stayed healthy, which is precisely how row M8's fixture defect worked.
  if (extentsMeasured < MIN_SURFACES - PANELS.length) {
    failures.push({
      surface: "gate",
      state: "quiet",
      detail:
        `EMPTY MATCH — the composition check measured only ${extentsMeasured} work areas across ` +
        `${surfacesMeasured} surfaces. Every surface inside AppShell has a <main>; if they have ` +
        "stopped being found, the one check here that is not about fitting is inert (24-F14).",
    });
  }

  // ---------------------------------------------------------------------------------------
  // 5. THE OWED REGISTER — exempt the known fourth defect, and FAIL if it has been fixed.
  //
  // ⚠ **EVERY CHECK THAT PUSHES A FAILURE MUST RUN ABOVE THIS LINE.** `fatal` is computed here,
  // once, from whatever `failures` holds at this moment — so a check placed after it pushes into
  // an array nobody reads again and is **completely inert while looking completely present**.
  // The twin check above shipped below this line for one round and was exactly that: it computed
  // the right ratios (0.472 vs 0.564 under the mutant it was built for), pushed the right
  // failure, printed `12 twin pairs` in the summary, and the gate said PASSED. Reading it would
  // not have found that — the diff of two gate logs being ZERO LINES is what did.
  // ---------------------------------------------------------------------------------------
  const owed = failures.filter((f) => f.state === "alarm" && OWED_UNDER_ALARM.includes(f.surface));
  /**
   * A FIT verdict on a panel the counter does not ship to is **reported, never fatal** — see the
   * `ships: false` note on `tablet-10.1`. Composition verdicts bind on every panel, and every
   * verdict of every kind binds on every shipping one.
   */
  const offPanel = PANELS.filter((p) => !p.ships).map((p) => p.label);
  const probe = failures.filter(
    (f) => f.fit === true && offPanel.some((label) => f.surface.startsWith(label)),
  );
  const fatal = failures.filter((f) => !owed.includes(f) && !probe.includes(f));

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
    `measured ${surfacesMeasured} surfaces, ${controlsMeasured} controls, ` +
      `${extentsMeasured} compositions (${compositionAxesJudged} axes judged, ` +
      `${compositionAxesSkipped} not judged — content overran its box), ` +
      `${twinsCompared} 27-F11c twin pairs, ` +
      `${clippingBoxesSeen} overflowing boxes, ` +
      `${clippingAncestorsSeen} clipping ancestors walked`,
  );

  if (probe.length > 0) {
    note("");
    note(
      `OFF-PANEL PROBE — ${probe.length} FIT violation(s) on glass the counter does not ship to ` +
        `(${offPanel.join(", ")}). Reported, not failing: 27 §1a puts the counter at 15.6″, and ` +
        "the only remedy for these would be shrinking 27-F8's 20 mm target, which 27-F68 (b) " +
        "forbids by name. Composition verdicts on the same panel DO fail.",
    );
    for (const f of probe) note(`  [${f.state}] [${f.surface}] ${f.detail}`);
  }

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
