/**
 * # `27-F77` — THE COUNTER'S ORDERING SURFACE: THE CHECK IS **LEFT** AND THE GRID IS **RIGHT**
 *
 * Authored from spec text only (`24 §3` step 2), by a session that is **not** rebuilding the
 * counter. `apps/pos-electron/src/renderer/Counter.tsx` was read to learn what the fixture
 * currently draws and was not edited; it is the implementer's file and read-only here.
 *
 * ## The FR, and the four things it fixes
 *
 * `27-F77` (specs/27 §1, founder ruling R51, August 2026): *"On the counter's ordering surface
 * the check sits LEFT and the item grid RIGHT."* Toast's and Lightspeed's arrangement, under
 * `27-F76`'s governing statement — muscle memory a cashier arrives with is training the product
 * does not have to do. **The shipped counter is the MIRROR**, which the FR says in as many
 * words, so this file is expected to be RED until the rebuild lands. That is the point of it.
 *
 * The FR **names a collision and refuses to resolve it**: `27-F4`'s August 2026 compact
 * amendment (a) moved the tab rail to the LEFT EDGE, so on small glass the left edge is claimed
 * twice, and *"the resolution is owed to the counter's rebuild"*. It fixes only the four
 * constraints that resolution must satisfy, and this file asserts exactly those four and
 * **nothing else about the arrangement**:
 *
 * | # | the constraint, in the FR's words | asserted by |
 * |---|---|---|
 * | 1 | *"the check is left **of the grid**"* | §1 `SIDE` |
 * | 2 | *"a rail may sit outboard of the check but never between check and grid"* | §2 `BETWEEN` |
 * | 3 | *"the five tabs keep their order"* | §3 `RAIL ORDER` |
 * | 4 | *"the mode contract still binds in full"* | §4, and `mode-contract.ts` |
 *
 * **Any arrangement satisfying those four passes; every arrangement violating one fails.** No
 * pixel position, no column width, no ratio, no panel, no side for the rail and no place for the
 * tender keypad is pinned anywhere below — all of those are the implementer's, and the FR's last
 * paragraph says so for the keypad by name. This repo has produced three oracles that stayed RED
 * under a CORRECT implementation and records that as being as damaging as a vacuous one; the
 * mutation matrix for this file (reported by its author) took a mirrored renderer RED and a
 * swapped one GREEN with nothing else changed.
 *
 * ## ⚠ THE WORD IS NOT ASSERTED ON, ANYWHERE — the FR is explicit and this is the failure mode
 *
 * `27-F77`: *"This FR decides the SIDE, not the WORD. Check is the ruling's vocabulary; the
 * product's specified and shipped noun is the **cart**, and `00 §5.6` with `02-F52` own what is
 * rendered."* A suite that went green by renaming `Cart` to `Check` would be this repo's own
 * recorded defect wearing a founder ruling. So **nothing here matches a product string**:
 *
 * - the CHECK is found by the **fixture's own data** — a line of `preload.ts`'s `ORDER`, whose
 *   dish name is also a `MENU` label — never by `Cart`'s `aria-label`, its heading, its total's
 *   caption or any word this product renders;
 * - the GRID is found by the **control carrying that same fixture dish name**;
 * - the two REGIONS are then derived structurally, by walking to the lowest common ancestor and
 *   taking the branch each anchor sits in. Rename every string on the surface and this file
 *   measures exactly the same two boxes.
 *
 * The one selector that is a rendered artefact is `nav[aria-label="Main"]`, and it is the tab
 * rail's landmark rather than its vocabulary — `probe.ts`, `main.ts`'s own `click()` and eight
 * `.dom.test.tsx` files already navigate by it (measured 2026-08-23 as files matching the
 * selector outside `layout-gate/`), and `27-F1` owns the rail's existence. If it ever moves,
 * this file goes LOUD rather than quiet: see the rail guards in §4.
 *
 * ## Why this is a GATE AXIS and not a `.dom.test.tsx`, and not a source-reading seam test
 *
 * Measured, not preferred, and there are two live alternatives to refuse:
 *
 * 1. **happy-dom cannot express it.** `probe.ts`' own header: the renderer suites *"perform no
 *    layout at all — every `getBoundingClientRect()` is zeroes"*. They can say *the cart is in
 *    the document* and never *the cart is on the left*. Nine layout defects in this app were
 *    found by launching and looking and zero by those suites.
 * 2. **A seam test reading `Counter.tsx` would assert the WRONG THING and would block the
 *    implementer.** `<Cart` before `<ItemGrid` in the JSX is DOM order, and `27-F77` is about
 *    the glass: `flexDirection: "row-reverse"`, `order: -1`, `direction: rtl` or a
 *    `grid-template-areas` placement each satisfy the FR while leaving the JSX in today's order,
 *    and each mirrors the glass while leaving it in tomorrow's. `mode-contract.ts` states the
 *    same thing for `27-F4` — *"a `flex-direction: column; flex-wrap: wrap` container of the
 *    kind `CashSurfaces.tsx` already ships permutes the visual sequence while leaving the DOM
 *    order byte-identical"*. A source test is red on a correct implementation in one direction
 *    and green on a broken one in the other. It is the wrong instrument, twice.
 * 3. **It is not a `mode-contract.ts` clause.** That file's own header says a cross-panel check
 *    *"has nothing to say about any single surface"*, and its `relate()` reflow permission would
 *    actively SKIP a check↔grid swap that also changed relationship category — which is exactly
 *    what a stacked compact arrangement does. `27-F77` is a claim about ONE surface that must
 *    hold on EVERY panel, which is the transpose of what that file computes.
 *
 * It therefore lives in its own file, wired into `main.ts` at three marked call sites, on the
 * precedent `mode-contract.ts` set and for its stated reason: the gate is worked on by several
 * sessions at once.
 *
 * ## ⚠ THE FIXTURE IS THE COVERAGE BOUNDARY, AND HERE IS EXACTLY WHERE IT SITS
 *
 * `main.ts`'s blind-spot list — *"it only sees the states its FIXTURE produces"* — is not a
 * caveat, it is the boundary, and the alarm-band defects and `ManagerApproval`'s dead controls
 * are what it cost twice. So, stated rather than left to be discovered:
 *
 * - **The state this runs under is `preload.ts`'s standing fixture, in BOTH device states.**
 *   `openOrders()` already returns `ORDER` (A-014, three lines) and `menu()` already returns the
 *   40-item `MENU`, so the ordering surface arrives with a POPULATED check beside a POPULATED
 *   grid with no driving at all. This probe **presses nothing and changes nothing** — it is a
 *   pure read of the DOM the sweep has already navigated to — which is why adding it cannot
 *   move any surface any other check in this gate measures.
 * - **It runs on EVERY tab surface of every panel in both states**, and resolves only where a
 *   grid tile and a check line for the same fixture dish are both present. That is what makes
 *   the ordering surface identify ITSELF: no tab label is matched, so a renamed or reordered
 *   tab does not take this check off the sweep silently (`27-F4` permits neither, but a gate
 *   that goes quiet when the product changes is the failure this rail is named for).
 * ## The SCOPE is `<main>`, and what happens if a rebuild puts the check outside it
 *
 * Both anchors are searched inside `AppShell`'s `<main>`. That is not an assumption about the
 * arrangement — it is `screen-map §1` and `AppShell`'s own header, which say the shell is *"a
 * status strip, a fixed tab rail, and the work surface. Nothing else is chrome"*, so a check
 * drawn as permanent shell chrome beside the rail would be a new piece of chrome that document
 * forbids, and `27-F77` asks for no such thing. If a rebuild does it anyway this file does not
 * quietly pass: the anchors do not resolve, the `24-F14` guards below fire per panel and per
 * state, and the verdict names the anchors it tried and says whether each half was found. **A
 * loud EMPTY MATCH pointing at this paragraph is the intended outcome there** — the wrong one
 * would be a silent green, and the wrong FIX would be widening this scope on a hunch instead of
 * amending `screen-map §1`.
 *
 * - **What is therefore NOT covered, and a reader must not over-read a green run:** the caller
 *   surfaces (`02-F27` latches the phone channel and the grid box is replaced, so the ordering
 *   arrangement does not exist there), the two lock steps (no `AppShell`), and any arrangement
 *   that appears only while a control is held or a menu is open — this gate has no such state.
 *
 * ## `24-F14` — the counters, asserted per half
 *
 * `main.ts` learned the hard way that *"a single total lets a healthy check cover for a dead
 * one"*, and widening `seams:check`'s Rule B scope once left the rail clean at exit 0 with a
 * real defect standing. So each of the checks below carries its own guard, failing on its own
 * rather than behind a shared total: surfaces probed at all, arrangements resolved at all,
 * resolved **per panel and per state** (a total tolerates one panel going quiet, which is
 * exactly how `01-F61`'s PIN pad went unmeasured for the life of this gate), every swept panel
 * probed, both device states reached on each, rail controls actually tested against the gap,
 * and rail pairs actually judged for order. An arrangement resolving on more than one surface
 * of one panel-state fails too — an ambiguous anchor would mean this file is measuring a
 * surface it did not mean to. **Deliberately not stated as a count**: a number in a comment is
 * the first thing to rot when a guard is added, and this repo has the receipts.
 */

/** Mirrors `main.ts`'s two device states without importing them: this file is a leaf. */
export type ArrangementState = "alarm" | "quiet";

/** The panel row `main.ts` is sweeping, carried so a verdict can name the glass. */
export type ArrangementPanel = {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly diagonalIn: number;
};

/** Mirrors `main.ts`'s `Failure` minus its `fit` flag — see `judgeOrderingSurface`. */
export type ArrangementFailure = {
  readonly surface: string;
  readonly state: ArrangementState;
  readonly detail: string;
};

export type ArrangementRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** What one anchor attempt got to, so an EMPTY MATCH can say WHICH half was missing. */
export type AnchorAttempt = {
  readonly anchor: string;
  /** A control on this surface whose accessible name starts with the fixture dish. */
  readonly tile: boolean;
  /** How many elements outside that control carry the dish name as their own text. */
  readonly lines: number;
};

export type ArrangementReport = {
  /** The fixture dish that resolved both ends, or `null` — this surface is not the ordering one. */
  readonly anchor: string | null;
  /** The branch of the DOM holding the CHECK, in viewport px. */
  readonly check: ArrangementRect | null;
  /** The branch of the DOM holding the item GRID, in viewport px. */
  readonly grid: ArrangementRect | null;
  /** The anchors themselves, reported so a verdict can be read without the app in front of you. */
  readonly checkAnchor: ArrangementRect | null;
  readonly gridAnchor: ArrangementRect | null;
  /**
   * The check line and the grid tile turned out to be on ONE branch — one contains the other, so
   * there are not two regions to put in an order. Reported rather than silently skipped.
   */
  readonly nested: boolean;
  readonly tried: readonly AnchorAttempt[];
  /**
   * Every `nav[aria-label="Main"]` on the surface, each as its own list of buttons in DOM
   * order, with their measured rects.
   *
   * **A LIST OF RAILS RATHER THAN ONE RAIL, and the reason is the collision this FR names.**
   * `27-F77` says the resolution is owed to the rebuild, and one of the shapes that rebuild
   * plausibly takes is *moving the rail into the ordering surface* — at which point there may
   * briefly be two navs carrying the landmark, or the surface's own may not be the first in the
   * document. `querySelector` would have judged whichever came first and gone quiet about the
   * other, which is this rail's own recurring failure (a check that stops looking exactly when
   * the product changes). Each rail is judged for order on its OWN sequence, so two rails never
   * produce a spurious verdict from a pair that spans the boundary between them.
   */
  readonly rails: readonly (readonly ArrangementRect[])[];
};

/**
 * **The measurement, and it runs INSIDE the page** — serialized with `Function.prototype
 * .toString()` and handed to `webContents.executeJavaScript`, exactly like `probe.ts`'s
 * `measureSurface`. It must therefore be **entirely self-contained**: no imports, nothing closed
 * over, and every constant it needs written inside its own body.
 *
 * ## The identification, and why it is these three dishes
 *
 * `preload.ts`'s `ORDER` carries three lines — `Chicken Karahi (Full)`, `Mutton Biryani` and
 * `Garlic Naan` — and every one of them is also a `MENU` label, so each is a dish that exists
 * BOTH as a tile in the grid and as a line in the check. That pairing is what makes a
 * string-free identification possible at all: the anchor is **fixture data**, not product
 * vocabulary, so it survives any rename `00 §5.6` and `02-F52` may make.
 *
 * They are tried in this order and the first that resolves both ends wins:
 *
 * | dish | `MENU` index | why it is first / kept |
 * |---|---|---|
 * | `Mutton Biryani` | 1 | the SECOND tile — on page one of any grid that draws two tiles, which is the property `preload.ts`'s own `sold_out` note relies on for the tightest panel |
 * | `Chicken Karahi (Full)` | 3 | a fallback one row in |
 * | `Garlic Naan` | 17 | the last resort, and deliberately past a small panel's first page so a run that falls through to it says something about the grid |
 *
 * ⚠ **A prefix match on the tile, an inclusive match on the line, and both are deliberate.**
 * `ItemTile` renders `aria-label={soldOut ? \`${name} — Sold out\` : name}` and `MENU` index 1
 * is `sold_out`, so an equality match on the tile would resolve on some surfaces and not others
 * — a check whose coverage depends on a fixture flag. The line takes the SHORTEST own-text match
 * so an implementer who renders `2 × Mutton Biryani` in one text node is still found: pinning
 * the cart's exact text shape would be pinning a rendered string by the back door, and it is
 * how an oracle blocks the implementation it was written for.
 */
export const measureOrderingSurface = (): ArrangementReport => {
  const ANCHORS = ["Mutton Biryani", "Chicken Karahi (Full)", "Garlic Naan"];
  /** `probe.ts`'s own control population, so both files count one set of controls. */
  const CONTROL =
    'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const rectOf = (el: Element): ArrangementRect => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const shown = (el: Element): boolean => {
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  };
  const accName = (el: Element): string =>
    (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ");
  /** Text OF ITS OWN — direct child text nodes only, so an ancestor does not inherit the match. */
  const ownText = (el: Element): string =>
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");

  const rails = [...document.querySelectorAll('nav[aria-label="Main"]')].map((nav) =>
    [...nav.querySelectorAll("button")].filter(shown).map(rectOf),
  );

  const main = document.querySelector("main");
  const tried: AnchorAttempt[] = [];
  const nothing = {
    anchor: null,
    check: null,
    grid: null,
    checkAnchor: null,
    gridAnchor: null,
    nested: false,
    rails,
  };
  if (main === null) return { ...nothing, tried };

  const controls = [...main.querySelectorAll(CONTROL)].filter(shown);
  const everything = [...main.querySelectorAll("*")].filter(shown);

  for (const anchor of ANCHORS) {
    const tile = controls.find((el) => accName(el).startsWith(anchor));
    if (tile === undefined) {
      tried.push({ anchor, tile: false, lines: 0 });
      continue;
    }
    const lines = everything
      .filter((el) => !tile.contains(el) && !el.contains(tile) && ownText(el).includes(anchor))
      .sort((a, b) => ownText(a).length - ownText(b).length);
    tried.push({ anchor, tile: true, lines: lines.length });
    const line = lines[0];
    if (line === undefined) continue;

    /**
     * **The two REGIONS, derived rather than named.** Walk both anchors up to `<main>`, find
     * where the two paths diverge, and take the branch each one is in: those two elements are
     * the check's box and the grid's box, whatever the implementer called them and whatever
     * mechanism put them side by side. Their rects are post-layout, so `order`, `row-reverse`
     * and a grid placement are all measured as what they render, which is the whole point.
     */
    const up = (el: Element): Element[] => {
      const out: Element[] = [];
      for (let a: Element | null = el; a !== null && a !== main.parentElement; a = a.parentElement)
        out.push(a);
      return out.reverse();
    };
    const toTile = up(tile);
    const toLine = up(line);
    let i = 0;
    while (i < toTile.length && i < toLine.length && toTile[i] === toLine[i]) i += 1;
    const gridBranch = toTile[i];
    const checkBranch = toLine[i];
    if (gridBranch === undefined || checkBranch === undefined) {
      return {
        ...nothing,
        anchor,
        nested: true,
        checkAnchor: rectOf(line),
        gridAnchor: rectOf(tile),
        tried,
      };
    }
    return {
      anchor,
      check: rectOf(checkBranch),
      grid: rectOf(gridBranch),
      checkAnchor: rectOf(line),
      gridAnchor: rectOf(tile),
      nested: false,
      tried,
      rails,
    };
  }
  return { ...nothing, tried };
};

// ── The recording side ───────────────────────────────────────────────────────────────────────

type Recorded = {
  readonly surface: string;
  readonly state: ArrangementState;
  readonly panel: ArrangementPanel;
  readonly report: ArrangementReport;
};

const seen: Recorded[] = [];

/**
 * Called by `main.ts` for every tab surface it sweeps. Records; judges nothing. The surface key
 * is the gate's own prefixed one, so a verdict below names the panel the way every other verdict
 * in the gate does.
 */
/**
 * **Has this panel/state produced an ordering arrangement yet?** — the retry hook, and it exists
 * because of a MEASURED race in the gate rather than anything about `27-F77`.
 *
 * On the FIRST panel's FIRST sweep the item grid intermittently renders **zero tiles**:
 * `Counter.tsx` draws nothing until `usePhysicalSize`'s `ResizeObserver` has measured the box,
 * and at the sweep's `+350 ms` that has sometimes not happened. Measured across three runs of
 * the shipped tree: the arrangement resolved on **22, 21 and 22** of 22 panel-states, the miss
 * being `counter-1366` in the `alarm` state both times, with `tile NO` for all three anchors.
 * The same race is what empties the `Sold out` grid on the pre-existing 22 EMPTY MATCHes this
 * gate already reports, and what makes `mode-contract`'s SET verdicts on `tab:Orders` come and
 * go (0, 4 and 30 verdicts across those same three runs).
 *
 * **The fix belongs here and not in the assertion.** Loosening the `24-F14` guard to "at least
 * one state per panel" would trade a real coverage claim for a flake nobody owns; re-probing a
 * panel-state that produced nothing costs one extra pass in the rare case and nothing at all in
 * the ordinary one, and if the second pass also finds nothing the EMPTY MATCH stands and is
 * true. A test that goes intermittently RED under a CORRECT implementation blocks the
 * implementer exactly as badly as one that goes RED permanently.
 */
export const orderingSurfaceResolved = (panelLabel: string, state: ArrangementState): boolean =>
  seen.some((r) => r.panel.label === panelLabel && r.state === state && r.report.check !== null);

export const recordOrderingSurface = (
  surface: string,
  state: ArrangementState,
  panel: ArrangementPanel,
  report: ArrangementReport,
): void => {
  seen.push({ surface, state, panel, report });
};

// ── The geometry ─────────────────────────────────────────────────────────────────────────────

/**
 * `probe.ts`' own 1 px floor, and a floor rather than slack for its reason: sub-pixel rounding on
 * a border is not a layout decision, while every arrangement defect this can find is columns
 * wide.
 */
const T = 1;

const overlapsVertically = (a: ArrangementRect, b: ArrangementRect): boolean =>
  a.y + a.h > b.y + T && b.y + b.h > a.y + T;

const leftOf = (a: ArrangementRect, b: ArrangementRect): boolean => a.x + a.w <= b.x + T;

const centreX = (r: ArrangementRect): number => r.x + r.w / 2;
const centreY = (r: ArrangementRect): number => r.y + r.h / 2;

const say = (r: ArrangementRect): string => `(${r.x},${r.y}) ${r.w}x${r.h}`;

// ── The counters (`24-F14`), one per check, asserted separately ──────────────────────────────

let surfacesProbed = 0;
let arrangementsResolved = 0;
let railControlsAgainstGap = 0;
let railPairsJudged = 0;
let railPairsSkipped = 0;

export const orderingSurfaceSummary = (): string =>
  `27-F77 ordering surface: ${surfacesProbed} surfaces probed, ${arrangementsResolved} ` +
  `arrangements resolved, ${railControlsAgainstGap} rail controls tested against the ` +
  `check/grid gap, ${railPairsJudged} rail order pairs judged (${railPairsSkipped} skipped — ` +
  "the geometry decides no order between them)";

/**
 * Every verdict here is pushed into `main.ts`'s `failures` **without a `fit` flag**, so it binds
 * on `ships: false` panels too — the same choice `mode-contract.ts` made and for the same
 * reason. A fit verdict is downgraded off-panel because the only remedy would be shrinking
 * `27-F8`'s millimetre, which `27-F68` (b) forbids. Nothing of the kind is true here: putting
 * the check on the left costs no millimetre on any glass, the shipped tree already draws these
 * two boxes side by side on **every** panel in the sweep including the below-floor probe, and
 * small glass is precisely where the temptation to "just stack them" lives.
 */
export const judgeOrderingSurface = (expectedPanels: number): ArrangementFailure[] => {
  const out: ArrangementFailure[] = [];

  // ── §1 — THE SIDE. `27-F77`: "the check is left OF THE GRID". ──
  //
  // Two claims, because "left and right" is two facts and collapsing them would let a stacked
  // arrangement through on a technicality: the two regions SHARE A ROW (they overlap
  // vertically), and the check's right edge is at or before the grid's left edge.
  //
  // ⚠ **A PINNED READING, declared rather than discovered** (`24 §3b`: state the interpretation,
  // name the simpler alternative). `27-F4`'s governing mode rule says a mode *"may change WHERE
  // a thing is"*, which read alone would licence a compact arrangement that stacks the check
  // ABOVE the grid. `27-F77` lists that rule and *"the check is left of the grid"* as two of
  // four constraints the resolution must satisfy **jointly**, and `27-F76` makes layout not a
  // per-screen decision — so the narrower reading is taken: left-of-grid binds on every panel,
  // and a mode may move the pair, resize it and re-flow everything around it, but not transpose
  // it. The simpler alternative — exempt panels below `PANEL_FLOOR_MM` — is refused because it
  // is one keystroke from weakening the gate, and because it is unnecessary: the shipped tree
  // already renders these two boxes side by side on all eleven panels, so satisfying this costs
  // nothing on any glass. If the founder wants a stacking carve-out for small panels, that is an
  // amendment to `27-F77`, not an edit to this file.
  for (const { surface, state, panel, report } of seen) {
    surfacesProbed += 1;
    const { check, grid } = report;
    if (check === null || grid === null) continue;
    arrangementsResolved += 1;

    const sharesRow = overlapsVertically(check, grid);
    const checkIsLeft = leftOf(check, grid);
    if (sharesRow && checkIsLeft) continue;

    const diagnosis = leftOf(grid, check)
      ? "THE GRID IS LEFT AND THE CHECK IS RIGHT — this is the MIRROR the FR names, which is " +
        "what the counter shipped for the whole of Wave 1"
      : !sharesRow
        ? "THE TWO REGIONS DO NOT SHARE A ROW — they are stacked, so neither is left of the " +
          "other. A mode may change where a thing is and how big it is; 27-F77 fixes THIS pair " +
          "on the horizontal axis, and it is one of the four constraints the FR says the " +
          "rebuild's resolution must satisfy"
        : "THE TWO REGIONS OVERLAP HORIZONTALLY — one is drawn over or inside the other, so " +
          "there is no left and right to have got right";
    out.push({
      surface,
      state,
      detail:
        `27-F77 BROKEN — THE CHECK IS NOT LEFT OF THE ITEM GRID. On ${panel.label} ` +
        `(${panel.width}x${panel.height} at ${panel.diagonalIn}") the check region is ` +
        `${say(check)} and the item grid region is ${say(grid)} — ${diagnosis}. ` +
        `Anchored on the fixture dish '${report.anchor ?? ""}': its grid tile is ` +
        `${say(report.gridAnchor ?? check)} and its line in the check is ` +
        `${say(report.checkAnchor ?? grid)}. 27-F77 (founder ruling R51): the check sits LEFT ` +
        "and the item grid RIGHT, which is Toast's and Lightspeed's arrangement and therefore " +
        "muscle memory a cashier arrives with — 27-F76 makes that the whole argument, and " +
        "27-F4's own reasoning applied to the surface rather than to a tile. NOTE WHAT THIS " +
        "VERDICT IS NOT: it says nothing about which WORD names the region (27-F77 decides the " +
        "SIDE, not the word — 00 §5.6 and 02-F52 own that), nothing about column widths, and " +
        "nothing about where the tender keypad sits relative to either column. Renaming " +
        "anything on this surface will not change this verdict, because nothing here matched a " +
        "product string.",
    });
  }

  // ── §2 — NOTHING BETWEEN. `27-F77`: "a rail may sit outboard of the check but never between
  //     check and grid". ──
  //
  // ⚠ **AIMED AT THE RAIL, WHICH IS WHAT THE FR NAMES, AND DELIBERATELY NOT WIDENED.** The
  // tempting generalisation — *nothing at all may sit between the two columns* — is a rule the
  // corpus does not make, and it would refuse a legitimate future element (a modifier column, a
  // divider carrying a control) on this file's authority rather than on a founder's. The narrow
  // reading is also the one with teeth: the collision `27-F77` refuses to resolve is the RAIL's,
  // because `27-F4` (a) moved it to the left edge and the check now wants that edge too.
  //
  // "Between" is a two-axis question, and reading only the horizontal one would be wrong in the
  // dangerous direction — it would refuse a TOP rail, whose buttons project into the gap while
  // sitting above both columns, which is `mode-contract.ts`'s own recorded mistake one file
  // over (a vertical-only reading produced 60+ verdicts against a correct tree). So a rail
  // control is BETWEEN only when it also shares a row with BOTH regions.
  for (const { surface, state, panel, report } of seen) {
    const { check, grid } = report;
    if (check === null || grid === null) continue;
    if (report.rails.length === 0) {
      out.push({
        surface,
        state,
        detail:
          'EMPTY MATCH — the ordering surface resolved and there is no `nav[aria-label="Main"]` ' +
          "on it, so 27-F77's 'never between check and grid' was not tested against anything. " +
          "Either AppShell stopped rendering the rail on this surface or its landmark moved, " +
          "and either way the constraint the FR spends its collision paragraph on is untested " +
          "here (24-F14).",
      });
      continue;
    }
    // The gap between the two regions, taken in whichever order they are actually drawn, so
    // this check stays live on the MIRRORED tree as well as on the corrected one. A gap check
    // that only worked once §1 passed would be a check nobody could see the value of until
    // after the rebuild — and this repo has shipped exactly that (the twin check, inert below
    // `fatal` for a round, printing a healthy summary the whole time).
    const gapFrom = Math.min(check.x + check.w, grid.x + grid.w);
    const gapTo = Math.max(check.x, grid.x);
    for (const r of report.rails.flat()) {
      railControlsAgainstGap += 1;
      const inGap = centreX(r) > gapFrom + T && centreX(r) < gapTo - T;
      if (!inGap) continue;
      if (!overlapsVertically(r, check) || !overlapsVertically(r, grid)) continue;
      out.push({
        surface,
        state,
        detail:
          `27-F77 BROKEN — A TAB RAIL CONTROL SITS BETWEEN THE CHECK AND THE ITEM GRID. On ` +
          `${panel.label} the rail control at ${say(r)} has its centre inside the ` +
          `${Math.round(gapTo - gapFrom)}px gap between the check region ${say(check)} and the ` +
          `grid region ${say(grid)}, and it shares a row with both. 27-F77: "a rail MAY sit ` +
          'outboard of the check but NEVER between check and grid." This is the collision the ' +
          "FR names and refuses to resolve — 27-F4's August 2026 compact amendment (a) moved " +
          "the rail to the left edge, so on small glass the left edge is claimed twice — and " +
          "the resolution is owed to this rebuild. Outboard is legal; the gap is not. Note this " +
          "verdict does NOT tell you which side to put the rail on: left of the check, or " +
          "beyond the grid, or above them both are all arrangements this gate accepts.",
      });
    }
  }

  // ── §3 — THE TABS KEEP THEIR ORDER. `27-F77`: "the five tabs keep their order". ──
  //
  // ⚠ **THE FR SAYS FIVE AND THE PRODUCT SHIPS SIX, AND THIS FILE PINS NEITHER NUMBER.** The
  // clause quotes `27-F4`'s August 2026 amendment (a) — *"same five tabs, same order"* — which
  // was written before `02-F7`'s `Sold out` tab was appended, and `Counter.tsx`'s `TABS` holds
  // six today. Asserting "five" would red a correct tree; asserting "six" would freeze a count
  // `27-F4` explicitly permits to GROW by appending. So the assertion is the ORDER, and the
  // order alone.
  //
  // **What this half owns that nothing else in the repo does: the VISUAL order.** The rail's DOM
  // sequence is already pinned by three renderer suites
  // (`cash-tab.dom.test.tsx:362`, `orders-tab.dom.test.tsx:127`, `session-handover.dom.test.tsx:121`
  // all assert `["Order","Orders","Pay","Cash","Me","Sold out"]`), and `mode-contract.ts`
  // compares rails BETWEEN panels. Neither can see a rail whose DOM order is right and whose
  // painted order is not — `mode-contract.ts` says why in its own header: *"27-F4 IS ABOUT
  // VISUAL ORDER, NOT DOM ORDER … a `flex-direction: column; flex-wrap: wrap` container of the
  // kind CashSurfaces.tsx already ships permutes the visual sequence while leaving the DOM order
  // byte-identical"*, and `TabRail` is a flex container whose direction already flips by mode.
  // This asserts that the rail PAINTS in its DOM sequence, so the pinned sequence and the
  // operator's finger are the same fact. String-free: it compares positions to an index.
  //
  // Judged once per (panel, state) rather than once per surface: the rail is chrome and does not
  // change between tabs, and twelve identical verdicts per panel would bury everything else.
  const railsByPanelState = new Map<string, Recorded>();
  for (const r of seen) {
    if (!r.report.rails.some((rail) => rail.length >= 2)) continue;
    const key = `${r.panel.label}|${r.state}`;
    if (!railsByPanelState.has(key)) railsByPanelState.set(key, r);
  }
  for (const { surface, state, panel, report } of railsByPanelState.values()) {
    // Per RAIL, never across two: a pair spanning the boundary between one rail's last control
    // and another's first is not an order anything promised, and judging it would manufacture a
    // verdict out of the very restructuring `27-F77` leaves open.
    for (const rail of report.rails) {
      for (let i = 0; i + 1 < rail.length; i += 1) {
        const a = rail[i];
        const b = rail[i + 1];
        if (a === undefined || b === undefined) continue;
        // `mode-contract.ts`'s `relate()`, on one panel instead of between two: side by side when
        // the vertical spans overlap and the horizontal ones do not, stacked when the transpose
        // holds, and NEITHER when they overlap on both axes or on neither — where the geometry
        // decides no order and there is nothing for a rail to have got wrong.
        const vOverlap = overlapsVertically(a, b);
        const hOverlap = a.x + a.w > b.x + T && b.x + b.w > a.x + T;
        const row = vOverlap && !hOverlap;
        const column = hOverlap && !vOverlap;
        if (!row && !column) {
          // Overlapping on both axes or diagonal: the geometry decides no order between them, so
          // there is no order to have changed. Counted, never judged — the same discipline
          // `mode-contract.ts` applies to its own reflow permission, because a permission that
          // silently swallows the check is the vacuous green this rail exists to refuse.
          railPairsSkipped += 1;
          continue;
        }
        railPairsJudged += 1;
        const ordered = row ? centreX(a) < centreX(b) : centreY(a) < centreY(b);
        if (ordered) continue;
        out.push({
          surface,
          state,
          detail:
            `27-F77 / 27-F4 BROKEN — THE TAB RAIL PAINTS OUT OF ITS OWN ORDER. On ${panel.label} ` +
            `rail control #${i} is at ${say(a)} and #${i + 1} is at ${say(b)}: they are ` +
            `${row ? "side by side" : "stacked"}, and the LATER one in the rail's own sequence is ` +
            `${row ? "further LEFT" : "HIGHER"}. 27-F77 fixes that "the tabs keep their order" as ` +
            "one of the four constraints the counter's rebuild must satisfy, and 27-F4 makes grid " +
            "position a compatibility contract — 23 of 34 field subjects could not perform a task " +
            "they knew well on a differently-arranged device. This is the half no renderer suite " +
            "can see: the DOM sequence is pinned under happy-dom, which performs no layout, so a " +
            "CSS `order`, a `row-reverse` or a wrap boundary permutes what the operator's hand " +
            "learns while every one of those tests stays green.",
        });
      }
    }
  }

  // ── §4 — `24-F14`: ONE GUARD PER WAY THIS FILE CAN GO INERT, EACH FAILING ON ITS OWN ──
  //
  // `main.ts`'s own lesson, quoted because it was paid for twice: a single total lets a healthy
  // check cover for a dead one. Each of these guards a different way this file can go inert, and
  // the first two also carry §4 of the FR — the mode contract — as a coverage claim: the
  // arrangement must have been measured on EVERY panel in EVERY state, because "27-F77 holds"
  // is a claim about the glass a restaurant owns and not about the one this session looked at.
  if (surfacesProbed === 0) {
    out.push({
      surface: "27-F77",
      state: "quiet",
      detail:
        "EMPTY MATCH — the ordering-surface probe ran on ZERO surfaces, so 27-F77 was not " +
        "measured at all. Either main.ts stopped calling recordOrderingSurface in its tab " +
        "sweep, or the sweep itself is dead (24-F14).",
    });
  }
  if (arrangementsResolved === 0) {
    out.push({
      surface: "27-F77",
      state: "quiet",
      detail:
        `EMPTY MATCH — ${surfacesProbed} surface(s) were probed and NOT ONE resolved an ` +
        "ordering arrangement, so every 27-F77 verdict above is absent because nothing was " +
        "measured rather than because the arrangement is right. The identification needs a " +
        "fixture dish that is BOTH a tile in the grid and a line in the check: either " +
        "preload.ts's ORDER no longer shares a dish with its MENU, the grid stopped drawing " +
        "tiles, or the check stopped rendering line names. See the per-anchor attempts in the " +
        "report — this file's `ANCHORS` list is a finding for its author, not an edit for the " +
        "implementer (24-F14).",
    });
  }
  // Per PANEL and per STATE, not in total: a total tolerates one whole panel going quiet, which
  // is exactly how `01-F61`'s PIN pad went unmeasured for the life of this gate.
  const probedKeys = new Set(seen.map((r) => `${r.panel.label}|${r.state}`));
  const resolvedKeys = new Set(
    seen.filter((r) => r.report.check !== null).map((r) => `${r.panel.label}|${r.state}`),
  );
  for (const key of probedKeys) {
    if (resolvedKeys.has(key)) continue;
    const [label, state] = key.split("|") as [string, ArrangementState];
    const here = seen.filter((r) => `${r.panel.label}|${r.state}` === key);
    const attempts = here
      .flatMap((r) => r.report.tried)
      .map((a) => `${a.anchor}: tile ${a.tile ? "yes" : "NO"}, ${a.lines} check line(s)`);
    // `nested` is the one near-miss worth naming separately: both anchors were found and one
    // CONTAINS the other, so there are not two regions to put in an order. That is a different
    // finding from "the grid drew nothing" and points at a different file.
    const nested = here.some((r) => r.report.nested);
    out.push({
      surface: `${label} 27-F77`,
      state,
      detail:
        `EMPTY MATCH — no surface on ${label} in the ${state} state resolved an ordering ` +
        "arrangement, so 27-F77 is UNMEASURED on this glass while every other panel reports. " +
        "The mode contract is one of the four constraints this FR fixes, and a constraint " +
        "measured on ten panels of eleven is a constraint with a hole in exactly the place a " +
        "responsive layout puts its defect. " +
        (nested
          ? "The anchors WERE both found and one CONTAINS the other, so the check and the grid " +
            "are not two regions at all on this glass — look at the ordering surface's own " +
            "structure, not at the fixture. "
          : "") +
        "Anchor attempts here: " +
        `${attempts.length === 0 ? "none recorded" : attempts.join(" · ")} (24-F14).`,
    });
  }
  // The transpose: an anchor that resolves on TWO surfaces of one panel-state means the
  // identification is ambiguous and a verdict above may be measuring a surface nobody meant.
  // By DISTINCT surface name: the retry pass above re-probes the same tabs, so one surface
  // resolving twice is the retry working and not an ambiguity. Two DIFFERENT surfaces resolving
  // is the thing that would mean a verdict was measured somewhere nobody meant.
  const resolvedPerKey = new Map<string, Set<string>>();
  for (const r of seen) {
    if (r.report.check === null) continue;
    const key = `${r.panel.label}|${r.state}`;
    resolvedPerKey.set(key, (resolvedPerKey.get(key) ?? new Set()).add(r.surface));
  }
  for (const [key, names] of resolvedPerKey) {
    const surfaces = [...names];
    if (surfaces.length < 2) continue;
    const [label, state] = key.split("|") as [string, ArrangementState];
    out.push({
      surface: `${label} 27-F77`,
      state,
      detail:
        `EMPTY MATCH — ${surfaces.length} surfaces on ${label} resolved an ordering arrangement ` +
        `(${surfaces.join(", ")}), and there is exactly one ordering surface. The anchor pair ` +
        "no longer identifies it uniquely, so the verdicts above may be measured on a surface " +
        "this check did not mean — which is worse than not measuring it. A finding for this " +
        "file's author (24-F14).",
    });
  }
  if (railControlsAgainstGap === 0) {
    out.push({
      surface: "27-F77",
      state: "quiet",
      detail:
        "EMPTY MATCH — not one tab-rail control was ever tested against the check/grid gap, so " +
        "27-F77's 'never between check and grid' is inert. Either no arrangement resolved, or " +
        '`nav[aria-label="Main"]` stopped being the rail\'s landmark — and this is the half of ' +
        "the FR that carries the collision it explicitly refuses to resolve (24-F14).",
    });
  }
  // The hole a per-key guard cannot see: every key that was PROBED must resolve, but a sweep
  // that stopped probing a panel altogether produces no key for it and nothing above notices.
  // `main.ts` has paid for exactly this shape once — `MIN_SURFACES` sits one whole panel low by
  // design, so `01-F61`'s PIN pad went unmeasured on every panel while the grand total looked
  // healthy. The expected count is passed in rather than duplicated here, so `PANELS` stays the
  // single declaration of what this gate sweeps.
  const panelsProbed = new Set(seen.map((r) => r.panel.label));
  if (panelsProbed.size < expectedPanels) {
    out.push({
      surface: "27-F77",
      state: "quiet",
      detail:
        `EMPTY MATCH — the ordering-surface probe ran on ${panelsProbed.size} panel(s) and this ` +
        `gate sweeps ${expectedPanels}. 27-F77's fourth constraint is that the mode contract ` +
        "still binds in full, which is a claim about every piece of glass a restaurant might " +
        "own; a panel that is never probed produces no key for the per-panel guard above to " +
        "miss, so this is the one hole that guard cannot see (24-F14).",
    });
  }
  for (const label of panelsProbed) {
    const states = new Set(seen.filter((r) => r.panel.label === label).map((r) => r.state));
    if (states.size === 2) continue;
    out.push({
      surface: `${label} 27-F77`,
      state: "quiet",
      detail:
        `EMPTY MATCH — ${label} was probed in only the ${[...states].join(", ")} state. ` +
        "03-F5's band is chrome over the work area and this device raises one after every " +
        "confirm, so a surface measured in one state only is a surface half of this product's " +
        "operating life is not covered by (24-F14).",
    });
  }
  if (railPairsJudged === 0) {
    out.push({
      surface: "27-F77",
      state: "quiet",
      detail:
        `EMPTY MATCH — zero rail order pairs were judged (${railPairsSkipped} were skipped as ` +
        "geometrically undecided). The skip is meant to retire the odd overlapping pair, not " +
        "the check: at this level the rail could paint in reverse and this gate would say " +
        "nothing, while every renderer suite stayed green because they read the DOM (24-F14).",
    });
  }

  return out;
};
