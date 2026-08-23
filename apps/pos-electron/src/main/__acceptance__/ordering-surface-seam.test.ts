// `27-F77` — THE COUNTER'S ORDERING SURFACE, in the half that runs on a PUSH.
//
// **WHY THIS FILE EXISTS, and it is not a duplicate of the layout gate.** The measurement of
// `27-F77` has to happen in Blink, because happy-dom performs no layout and every
// `getBoundingClientRect()` there is zeroes — that is `src/layout-gate/ordering-surface.ts`, and
// it is where the real rects come from. But **`pnpm layout:check` is not in CI**:
// `.github/workflows/ci.yml` runs `docs:lint → typecheck → lint → test → build`, so `tokens:check`,
// `strings:check`, `seams:check` and `layout:check` gate nothing on a push. This app's own guide
// says it out loud — *"a rail that gates nothing is a rail that rots"* — and records the gate
// sitting RED on the trunk for days because of exactly that.
//
// So this file asserts the two things a vitest suite CAN own, both of which the gate cannot:
//
//   §A **the SEAM** — the gate actually calls the axis, and calls it ABOVE the line where `fatal`
//      is computed. That second half is not pedantry: `main.ts` records that the `27-F11c` twin
//      check shipped BELOW that line for a round, computed the right ratios, pushed the right
//      failure, printed a healthy summary and **passed**, and that *"reading it would not have
//      found that — the diff of two gate logs being ZERO LINES is what did."*
//   §B–§D **the DECISION RULES**, driven over synthetic geometry. The judge is pure arithmetic on
//      rectangles; only the rects need Blink. Feeding it rectangles pins what `27-F77`'s four
//      constraints mean, in milliseconds, on every push — including the cases that are hard to
//      produce in the gate at all (a top rail projecting into the gap, two rails on one surface).
//
// **⚠ WHAT THIS FILE IS NOT.** It is not evidence that the shipped counter satisfies `27-F77` —
// it feeds the judge numbers rather than reading them off glass, so a green run here says the
// RULES are right and says nothing about the product. The gate is the only thing that can say
// that, and on the tree this file was written against the gate says the opposite: 22 verdicts,
// eleven panels, both device states, `THE GRID IS LEFT AND THE CHECK IS RIGHT`. Do not read this
// suite as coverage of the arrangement; read it as coverage of the ruler.

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  ArrangementPanel,
  ArrangementRect,
  ArrangementReport,
  ArrangementState,
} from "../../layout-gate/ordering-surface";

/**
 * A fresh module per test. `ordering-surface.ts` keeps its recorded surfaces and its `24-F14`
 * counters in module state — deliberately, because the gate records across a whole sweep and
 * judges once at the end — so a suite that shared one instance would be asserting against
 * whatever the previous test happened to leave behind. That is the shape of defect this repo
 * calls a fixture nobody re-read.
 */
const fresh = async () => {
  vi.resetModules();
  return await import("../../layout-gate/ordering-surface");
};

const src = (file: string): string =>
  readFileSync(new URL(`../../layout-gate/${file}`, import.meta.url).pathname, "utf8");

/**
 * The same file with comments blanked — the helper `panel-fit-seam.test.ts` had to write for the
 * same reason, and its reason transfers verbatim: **a mention is not a call.** `main.ts` names
 * every one of these symbols in its own doc comments, so a naive `toContain` would pass on a tree
 * where the axis had been unwired and merely documented. AGENTS.md files that mistake under
 * *"a proxy for the evidence, accepted as the evidence"*.
 */
const code = (file: string): string =>
  src(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const rect = (x: number, y: number, w: number, h: number): ArrangementRect => ({ x, y, w, h });

const PANEL: ArrangementPanel = {
  label: "counter-1366",
  width: 1366,
  height: 768,
  diagonalIn: 15.6,
};

/** A rail that sits along the top, spanning both columns — `27-F4`'s pre-August arrangement. */
const TOP_RAIL: readonly ArrangementRect[] = [
  rect(10, 10, 100, 40),
  rect(120, 10, 100, 40),
  rect(230, 10, 100, 40),
];

/** A rail down the LEFT edge, outboard of everything — `27-F4` (a)'s compact arrangement. */
const LEFT_RAIL: readonly ArrangementRect[] = [
  rect(0, 100, 80, 60),
  rect(0, 170, 80, 60),
  rect(0, 240, 80, 60),
];

/** The check on the left and the grid on the right, sharing a row: what `27-F77` asks for. */
const CHECK = rect(100, 100, 300, 500);
const GRID = rect(500, 100, 800, 500);

const report = (over: Partial<ArrangementReport> = {}): ArrangementReport => ({
  anchor: "Mutton Biryani",
  check: CHECK,
  grid: GRID,
  checkAnchor: rect(120, 140, 150, 20),
  gridAnchor: rect(520, 140, 100, 100),
  nested: false,
  tried: [{ anchor: "Mutton Biryani", tile: true, lines: 1 }],
  rails: [LEFT_RAIL],
  ...over,
});

/**
 * Record one surface per panel and per state, so the `24-F14` coverage guards are satisfied and
 * a test can assert about the CONSTRAINTS rather than about the guards. Eleven panels because
 * that is what the gate sweeps; the count is passed in rather than read from `main.ts`, since
 * this file must not import a module that constructs a `BrowserWindow`.
 */
const PANELS = 11;

type Mod = Awaited<ReturnType<typeof fresh>>;

const recordSweep = (
  mod: Mod,
  over: Partial<ArrangementReport> = {},
  panels = PANELS,
  states: readonly ArrangementState[] = ["alarm", "quiet"],
): void => {
  for (let p = 0; p < panels; p += 1) {
    const panel: ArrangementPanel = { ...PANEL, label: `panel-${p}` };
    for (const state of states) {
      mod.recordOrderingSurface(`${panel.label} tab:Order`, state, panel, report(over));
    }
  }
};

const details = (fs: readonly { detail: string }[]): string => fs.map((f) => f.detail).join("\n");

// ── §A. THE SEAM — the gate calls the axis, and calls it where a verdict survives ────────────

describe("the layout gate reaches 27-F77's axis at all", () => {
  it("records an arrangement inside the tab sweep, for every surface", () => {
    // Comment-stripped, so documenting the call does not satisfy the assertion. It is asserted
    // to sit in the sweep next to `judge(...)` rather than merely somewhere in the file: a call
    // outside the loop would measure one tab of one panel and report a healthy count.
    const gate = code("main.ts");
    expect(gate).toContain("recordOrderingSurface(");
    const sweep = gate.slice(gate.indexOf("const sweep = async"));
    expect(sweep.slice(0, sweep.indexOf("await sweep("))).toContain("recordOrderingSurface(");
  });

  it("judges ABOVE the line where `fatal` is computed", () => {
    /**
     * **THE ASSERTION THIS FILE EXISTS FOR, and it is not hypothetical.** `main.ts` computes
     * `fatal` once, from whatever `failures` holds at that moment, and its own header warns:
     * *"a check placed after it pushes into an array nobody reads again and is COMPLETELY INERT
     * WHILE LOOKING COMPLETELY PRESENT."* The `27-F11c` twin check shipped below that line for a
     * round — right ratios, right failure object, healthy summary line, gate PASSED.
     *
     * A reviewer cannot see this in a diff and the gate cannot see it in a run, because a gate
     * that has gone inert reports success. A byte offset can.
     */
    const gate = code("main.ts");
    const judged = gate.indexOf("judgeOrderingSurface(");
    const fatal = gate.indexOf("const fatal =");
    expect(judged).toBeGreaterThan(-1);
    expect(fatal).toBeGreaterThan(-1);
    expect(judged).toBeLessThan(fatal);
  });

  it("hands the judge the panel count from PANELS rather than a literal", () => {
    // The `24-F14` guard on "every swept panel was probed" is only as good as the number it is
    // compared against. A literal here would be a second declaration of what the gate sweeps,
    // and the two would drift the first time a panel row is added — which has happened four
    // times to this gate's own table.
    expect(code("main.ts")).toContain("judgeOrderingSurface(PANELS.length)");
  });

  it("prints the axis's own counts, so a healthy total cannot cover for a dead check", () => {
    expect(code("main.ts")).toContain("orderingSurfaceSummary()");
  });
});

// ── §B. CONSTRAINT 1 — the check is LEFT OF THE GRID ─────────────────────────────────────────

describe("27-F77 (1) — the check sits left and the item grid right", () => {
  it("says NOTHING when the check is left of the grid and they share a row", async () => {
    // The GREEN half, and it is the one that matters most: three oracles in this repo stayed RED
    // under a correct implementation, and the FR is explicit that it fixes four constraints and
    // leaves the arrangement open. Any layout satisfying them must pass here.
    const mod = await fresh();
    recordSweep(mod);
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("REFUSES the mirror the FR names — one verdict per panel and state", async () => {
    const mod = await fresh();
    recordSweep(mod, { check: GRID, grid: CHECK });
    const out = mod.judgeOrderingSurface(PANELS);
    expect(out).toHaveLength(PANELS * 2);
    expect(details(out)).toContain("THE GRID IS LEFT AND THE CHECK IS RIGHT");
  });

  it("REFUSES a STACKED arrangement, and says so in different words", async () => {
    /**
     * `27-F4`'s governing mode rule says a mode *"may change WHERE a thing is"*, which read
     * alone would licence stacking the two columns on small glass. `27-F77` lists that rule and
     * *"the check is left of the grid"* as two of four constraints the resolution must satisfy
     * **jointly**, and `27-F76` makes layout not a per-screen decision — so stacking is refused.
     * The wording is asserted separately from the mirror's, because they are different defects
     * with different fixes and this gate has already paid once for a verdict that concluded more
     * than it measured.
     */
    const mod = await fresh();
    recordSweep(mod, { check: rect(100, 100, 800, 200), grid: rect(100, 340, 800, 260) });
    const out = mod.judgeOrderingSurface(PANELS);
    expect(out).toHaveLength(PANELS * 2);
    expect(details(out)).toContain("THE TWO REGIONS DO NOT SHARE A ROW");
    expect(details(out)).not.toContain("THE GRID IS LEFT");
  });

  it("REFUSES two regions drawn over each other, in a third set of words", async () => {
    const mod = await fresh();
    recordSweep(mod, { check: rect(100, 100, 800, 500), grid: rect(300, 100, 800, 500) });
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("OVERLAP HORIZONTALLY");
  });

  it("binds on EVERY panel — no `fit` flag, so `ships: false` glass is judged too", async () => {
    /**
     * `main.ts` downgrades a FIT verdict to a report on a panel the counter does not ship to,
     * because the only remedy would be shrinking `27-F8`'s millimetre and `27-F68` (b) forbids
     * that by name. Nothing of the kind is true here: putting the check on the left costs no
     * millimetre on any glass. A `fit: true` appearing on these verdicts would silence them on
     * `probe-below-floor` — which is small glass, i.e. exactly where the temptation to stack the
     * two columns lives.
     */
    const mod = await fresh();
    recordSweep(mod, { check: GRID, grid: CHECK });
    for (const f of mod.judgeOrderingSurface(PANELS)) {
      expect(f).not.toHaveProperty("fit");
    }
  });
});

// ── §C. CONSTRAINT 2 — a rail may sit OUTBOARD, never BETWEEN ────────────────────────────────

describe("27-F77 (2) — a rail may sit outboard of the check, never between check and grid", () => {
  it("permits the compact LEFT-EDGE rail — `27-F4` (a)'s own arrangement", async () => {
    const mod = await fresh();
    recordSweep(mod, { rails: [LEFT_RAIL] });
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("permits a TOP rail whose controls project into the gap but sit ABOVE both", async () => {
    /**
     * **THE CASE THAT MAKES THIS CHECK SOUND RATHER THAN MERELY PRESENT.** A horizontal rail
     * spans the whole width, so some of its buttons have their centre inside the horizontal gap
     * between the two columns — and they are not between anything, they are above. A
     * horizontal-only reading would refuse the arrangement `27-F4` shipped for the whole of
     * Wave 1. `mode-contract.ts` made precisely this mistake one file over and produced 60+
     * verdicts against a correct tree, which is why the predicate also requires the control to
     * share a row with BOTH regions.
     *
     * The fixture is built to hit it: `TOP_RAIL`'s middle control is at x 120–220, inside the
     * 400–500 gap? No — it is deliberately NOT, so the test is made to bite by moving one
     * control into the gap explicitly below.
     */
    const inGapButAbove = [...TOP_RAIL, rect(420, 10, 60, 40)];
    const mod = await fresh();
    recordSweep(mod, { rails: [inGapButAbove] });
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("REFUSES a rail control in the gap that shares a row with both columns", async () => {
    const mod = await fresh();
    // TWO controls, not one: a rail of one button has no consecutive pair, so §3 would judge
    // nothing and its own `24-F14` guard would fire as well — a second, correct verdict that
    // would have made this test's count wrong for a reason that is not the rail's position.
    recordSweep(mod, { rails: [[rect(420, 200, 60, 90), rect(420, 300, 60, 90)]] });
    const out = mod.judgeOrderingSurface(PANELS);
    // Both controls of the rail are in the gap on every panel and state.
    expect(out).toHaveLength(PANELS * 2 * 2);
    expect(details(out)).toContain("A TAB RAIL CONTROL SITS BETWEEN THE CHECK AND THE ITEM GRID");
  });

  it("REFUSES it just the same when the columns are MIRRORED", async () => {
    // The gap is taken between the two regions in whichever order they are drawn, so this half
    // of the FR is live on today's tree as well as on the rebuilt one. A check that only worked
    // once constraint 1 passed would be a check nobody could evaluate until after the rebuild —
    // and this gate has shipped exactly that once.
    const mod = await fresh();
    recordSweep(mod, {
      check: rect(500, 100, 800, 500),
      grid: rect(100, 100, 300, 500),
      rails: [[rect(420, 200, 60, 200)]],
    });
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("SITS BETWEEN THE CHECK");
  });

  it("goes LOUD, not quiet, when the rail's landmark is gone", async () => {
    // `24-F14`. A resolved arrangement with no rail on the surface means the between-check was
    // tested against nothing — which must fail rather than pass, because it looks identical to
    // a rail that is correctly outboard.
    const mod = await fresh();
    recordSweep(mod, { rails: [] });
    const out = mod.judgeOrderingSurface(PANELS);
    expect(details(out)).toContain("not tested against anything");
    expect(details(out)).toContain("not one tab-rail control was ever tested");
  });
});

// ── §D. CONSTRAINT 3 — the tabs keep their order, measured on the GLASS ──────────────────────

describe("27-F77 (3) — the tabs keep their order", () => {
  it("accepts a horizontal rail painting left to right in its own DOM sequence", async () => {
    const mod = await fresh();
    recordSweep(mod, { rails: [TOP_RAIL] });
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("accepts a vertical rail painting top to bottom in its own DOM sequence", async () => {
    const mod = await fresh();
    recordSweep(mod, { rails: [LEFT_RAIL] });
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("REFUSES a horizontal rail painted in reverse — `row-reverse`, `order`, a wrap", async () => {
    /**
     * The half no renderer suite in this repo can express. The rail's DOM sequence is already
     * pinned by three `.dom.test.tsx` files, and `TabRail` is a flex container whose direction
     * already flips by mode — so one CSS keyword permutes what the operator's hand learns while
     * every one of those tests stays green, because happy-dom lays nothing out.
     */
    const mod = await fresh();
    recordSweep(mod, { rails: [[...TOP_RAIL].reverse()] });
    const out = mod.judgeOrderingSurface(PANELS);
    // Three controls reversed is TWO out-of-order consecutive pairs, on each panel and state.
    expect(out).toHaveLength(PANELS * 2 * 2);
    expect(details(out)).toContain("THE TAB RAIL PAINTS OUT OF ITS OWN ORDER");
    expect(details(out)).toContain("further LEFT");
  });

  it("REFUSES a vertical rail painted bottom to top", async () => {
    const mod = await fresh();
    recordSweep(mod, { rails: [[...LEFT_RAIL].reverse()] });
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("HIGHER");
  });

  it("never judges a pair that spans TWO rails", async () => {
    // Two navs carrying the landmark is one of the shapes the rebuild may take while it resolves
    // the collision. The last control of one rail and the first of another were never promised
    // an order, and manufacturing a verdict out of that would be this file refusing the very
    // restructuring `27-F77` leaves open.
    const mod = await fresh();
    recordSweep(mod, { rails: [LEFT_RAIL, TOP_RAIL] });
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("pins NO tab COUNT — the FR says five and the product ships six", async () => {
    /**
     * `27-F77`'s clause quotes `27-F4`'s August 2026 amendment (a) — *"same five tabs, same
     * order"* — written before `02-F7`'s `Sold out` tab was appended. `Counter.tsx`'s `TABS`
     * holds six. Asserting five would red a correct tree; asserting six would freeze a count
     * `27-F4` explicitly permits to grow by appending. So a rail of any length in its own order
     * passes, and only the ORDER is judged.
     */
    const mod = await fresh();
    const seven = Array.from({ length: 7 }, (_, i) => rect(10 + i * 110, 10, 100, 40));
    recordSweep(mod, { rails: [seven] });
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });
});

// ── §E. CONSTRAINT 4 + `24-F14` — the coverage claim, and the guards that keep it honest ─────

describe("27-F77 (4) — the mode contract binds in full, so coverage is per panel and per state", () => {
  it("FAILS when nothing was recorded at all", async () => {
    const mod = await fresh();
    const out = mod.judgeOrderingSurface(PANELS);
    expect(details(out)).toContain("ran on ZERO surfaces");
    expect(details(out)).toContain("NOT ONE resolved an ordering arrangement");
    expect(details(out)).toContain("and this gate sweeps 11");
  });

  it("FAILS when a panel was swept and never probed", async () => {
    // The hole a per-key guard cannot see: a panel that is never probed produces no key to miss.
    // `main.ts`'s `MIN_SURFACES` sits one whole panel low by design, which is exactly how
    // `01-F61`'s PIN pad went unmeasured for the life of that gate while the total looked well.
    const mod = await fresh();
    recordSweep(mod, {}, PANELS - 1);
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("probe ran on 10 panel(s)");
  });

  it("FAILS when a panel was probed in only one device state", async () => {
    const mod = await fresh();
    recordSweep(mod, {}, PANELS, ["quiet"]);
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("in only the quiet state");
  });

  it("FAILS when a panel-state probed and resolved NOTHING, and names the anchors tried", async () => {
    const mod = await fresh();
    recordSweep(mod);
    mod.recordOrderingSurface(
      "panel-0 tab:Order",
      "alarm",
      { ...PANEL, label: "panel-99" },
      report({
        check: null,
        grid: null,
        tried: [{ anchor: "Mutton Biryani", tile: false, lines: 0 }],
      }),
    );
    // The second state too, so this panel is not also caught by the per-state guard above.
    mod.recordOrderingSurface(
      "panel-0 tab:Order",
      "quiet",
      { ...PANEL, label: "panel-99" },
      report({ check: null, grid: null, tried: [] }),
    );
    const out = details(mod.judgeOrderingSurface(PANELS));
    expect(out).toContain("no surface on panel-99 in the alarm state resolved");
    expect(out).toContain("Mutton Biryani: tile NO");
  });

  it("FAILS when the anchors are NESTED, and says that rather than blaming the fixture", async () => {
    // Both anchors found and one containing the other: there are not two regions to order. It
    // points at the surface's structure, where "the grid drew nothing" points at `preload.ts`.
    const mod = await fresh();
    recordSweep(mod);
    for (const state of ["alarm", "quiet"] as const) {
      mod.recordOrderingSurface(
        "panel-0 tab:Order",
        state,
        { ...PANEL, label: "panel-99" },
        report({ check: null, grid: null, nested: true }),
      );
    }
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("one CONTAINS the other");
  });

  it("FAILS when TWO DIFFERENT surfaces of one panel-state resolve", async () => {
    // The transpose of the guard above: an ambiguous anchor means a verdict may have been
    // measured on a surface nobody meant, which is worse than not measuring it.
    const mod = await fresh();
    recordSweep(mod);
    mod.recordOrderingSurface(
      "panel-0 tab:Sold out",
      "alarm",
      { ...PANEL, label: "panel-0" },
      report(),
    );
    expect(details(mod.judgeOrderingSurface(PANELS))).toContain("resolved an ordering arrangement");
  });

  it("does NOT call a repeated probe of the SAME surface ambiguous", async () => {
    // `main.ts` re-probes a panel-state that produced nothing, because the grid intermittently
    // renders no tiles at `+350 ms`. That retry re-records the same surface name, and treating it
    // as ambiguity would turn a measurement fix into a permanent red.
    const mod = await fresh();
    recordSweep(mod);
    mod.recordOrderingSurface(
      "panel-0 tab:Order",
      "alarm",
      { ...PANEL, label: "panel-0" },
      report(),
    );
    expect(mod.judgeOrderingSurface(PANELS)).toEqual([]);
  });

  it("reports what it looked at, so a healthy total cannot cover for a dead check", async () => {
    const mod = await fresh();
    recordSweep(mod);
    mod.judgeOrderingSurface(PANELS);
    const summary = mod.orderingSurfaceSummary();
    expect(summary).toContain(`${PANELS * 2} surfaces probed`);
    expect(summary).toContain(`${PANELS * 2} arrangements resolved`);
    expect(summary).toMatch(/rail controls tested against the check\/grid gap/);
    expect(summary).toMatch(/rail order pairs judged/);
  });
});

// ── §F. THE WORD IS NOT ASSERTED ON, ANYWHERE ────────────────────────────────────────────────

describe("27-F77 decides the SIDE, not the WORD", () => {
  it("names no product noun for either region, in the axis or in its verdicts", () => {
    /**
     * `27-F77`: *"Check is the ruling's vocabulary; the product's specified and shipped noun is
     * the **cart**, and `00 §5.6` with `02-F52` own what is rendered."* A suite that went green
     * by renaming `Cart` to `Check` would be this repo's own recorded defect wearing a founder
     * ruling, so the axis matches **fixture data** — a dish that is both a tile in the grid and
     * a line in the check — and never a rendered noun.
     *
     * Asserted against the axis's own CODE with comments blanked, because the prose necessarily
     * discusses `Cart` at length; what must not appear is a selector or a comparison that reads
     * one. `aria-label="Main"` is the one rendered artefact and it is the rail's LANDMARK rather
     * than its vocabulary, so it is allowed by name.
     */
    const axis = code("ordering-surface.ts");
    // Every DOM selector the axis uses, as a literal. `main.querySelectorAll(CONTROL)` passes a
    // variable and is covered by the `aria-label` sweep below, which is what would catch a
    // product noun smuggled into it.
    const selectors = [...axis.matchAll(/querySelector(?:All)?\(\s*(?:"([^"]*)"|'([^']*)')/g)].map(
      (m) => m[1] ?? m[2],
    );
    expect(new Set(selectors)).toEqual(new Set(['nav[aria-label="Main"]', "button", "main", "*"]));
    // The ONE accessible name the axis is allowed to know is the rail's landmark. `Cart` renders
    // `<section aria-label="Current order">` today; keying on that would be the exact defect
    // 27-F77 warns about, and it would go green the day somebody renamed it.
    const ariaValues = [...axis.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ariaValues)).toEqual(new Set(["Main"]));
    expect(axis).not.toContain("Current order");
  });

  it("identifies both regions from fixture data the product does not render as chrome", () => {
    // The anchors are `preload.ts`'s own `ORDER` lines, each of which is also a `MENU` label.
    // If that stops being true the axis cannot resolve, and it says so as an EMPTY MATCH rather
    // than passing — but the pairing is what the whole identification rests on, so it is pinned
    // here where it is cheap to check.
    const fixture = src("preload.ts");
    for (const dish of ["Mutton Biryani", "Chicken Karahi (Full)", "Garlic Naan"]) {
      const uses = fixture.split(dish).length - 1;
      expect(
        uses,
        `${dish} must be BOTH a MENU label and an ORDER line in the fixture`,
      ).toBeGreaterThanOrEqual(2);
      expect(code("ordering-surface.ts")).toContain(dish);
    }
  });
});
