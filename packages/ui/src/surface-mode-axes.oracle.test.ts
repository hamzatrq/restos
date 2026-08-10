// THE MODE SELECTOR'S CONTRACT — `27-F11c`, `27-F2`, `27 §1a`.
//
// Authored from spec text only (`24 §3` step 2, `.claude/rules/tests-and-conformance.md`), by a
// session that does not implement responsive modes and has not read the implementation plan. If
// an assertion here is wrong, that is a FINDING for this session, cited by FR ID — never an edit.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE OWNS, AND WHAT IT DELIBERATELY DOES NOT
//
// It owns ONE question: **is the mode a pure function of the surface's PHYSICAL SIZE, on BOTH
// axes?** It owns nothing about what any mode draws — that is
// `apps/pos-electron/src/renderer/surface-mode-contract.dom.test.tsx` (`27-F4`'s set and order)
// and `apps/pos-electron/src/layout-gate/mode-contract.ts` (`27-F4`'s visual order and `27-F8`'s
// millimetres, measured in Blink). happy-dom performs no layout, so nothing here may claim a
// pixel, a position or a millimetre of anything rendered.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS PINNED HERE THAT THE FRs DO NOT DECIDE (declare it, do not discover it)
//
//  1. **The exported symbol is `surfaceModeFor`, and it already exists.** This file does not
//     invent an API: `packages/ui/src/index.ts` exports `surfaceModeFor`, `SurfaceMode` and
//     `useSurfaceMode` today. What is asserted is a PROPERTY of that function, not a signature.
//
//  2. **THE CALL SHAPE IS NOT PINNED, ON PURPOSE, AND THIS IS THE MOST IMPORTANT LINE IN THE
//     FILE.** No FR decides whether the selector takes `(widthMm, heightMm)` positionally or one
//     `PhysicalSize` object, and an oracle that guessed would stay RED against a correct
//     implementation of the other shape — which this repo has produced three times in one round
//     and which is as damaging as a vacuous test. So `callSelector` below PROBES both shapes and
//     uses whichever one the implementation actually answers on, and it FAILS LOUDLY (rather
//     than picking one and quietly measuring nothing) when neither discriminates.
//     `PhysicalSize` — `{ widthMm, heightMm }` — is the package's own existing type, returned by
//     `usePhysicalSize` and consumed by `WorkSurface`, so the object form is not invented either.
//
//  3. **NO BOUNDARY VALUE IS PINNED.** `27 §1a` lists hardware; it names no millimetre threshold,
//     and `SURFACE_MODE_MIN_MM` is a code constant, not spec. Every assertion below is stated
//     over `27 §1a`'s own panels or as a shape (monotone, total, pure, two-axis) that holds
//     wherever the implementer puts a boundary. An oracle that pinned 300 mm would forbid the
//     implementer from moving a number the corpus does not own.
//
//  4. **`27 §1a`'s glass is computed, not transcribed.** The table gives a diagonal and a
//     resolution; the physical width is `diagonalIn × (w / hypot(w, h)) × 25.4`, in which the
//     RESOLUTION CANCELS. That identity is `27-F11c` itself — "extra pixels buy sharpness; only
//     inches buy room" — so deriving the millimetres rather than typing them is what makes the
//     twin assertion below mean something.

import { describe, expect, it } from "vitest";
import { type PhysicalSize, SURFACE_MODE_MIN_MM, type SurfaceMode, surfaceModeFor } from "./index";

// ── `27 §1a`, converted the way `27-F68` converts everything ────────────────────────────────

const glass = (diagonalIn: number, w: number, h: number): PhysicalSize => ({
  widthMm: ((diagonalIn * w) / Math.hypot(w, h)) * 25.4,
  heightMm: ((diagonalIn * h) / Math.hypot(w, h)) * 25.4,
});

/**
 * Every deployment surface the corpus actually names, and nothing else.
 *
 * `27 §1a`'s three rows plus `27-F11f`'s 22″ pass panel. The 13.3″ laptop and the 24″ desktop are
 * NOT in `27 §1a` and are marked as such: they are the two panels `apps/pos-electron`'s own
 * measured record puts on either side of the corpus's hardware (the BYO laptop the app used to
 * refuse, and the founder's window), and they are used only where an assertion is about SHAPE
 * rather than about a spec row.
 */
const HARDWARE = {
  /** `27 §1a` counter POS, the low-resolution panel. */
  counter1366: glass(15.6, 1366, 768),
  /** `27 §1a` counter POS, the high-resolution panel. THE SAME GLASS. */
  counter1920: glass(15.6, 1920, 1080),
  /** `27 §1a` waiter tablet, ~10.1″. */
  tablet: glass(10.1, 1366, 768),
  /** `27 §1a` waiter phone, ~6.5″ — portrait, and the corpus's smallest surface. */
  phone: glass(6.5, 1080, 2340),
  /** `27-F11f` pass screen, 22″: "the smallest size showing three tickets at 1.5 m". */
  pass: glass(22, 1920, 1080),
} as const;

/** Not corpus hardware. Used only for shape assertions, and labelled so nobody reads it as spec. */
const OFF_CORPUS = {
  laptop133: glass(13.3, 1280, 800),
  desktop24: glass(24, 1920, 1080),
} as const;

// ── The call-shape probe (pinned reading 2 above) ────────────────────────────────────────────

type Selector = (size: PhysicalSize) => SurfaceMode;

const asObject: Selector = (s) => (surfaceModeFor as unknown as Selector)(s);
const asPositional: Selector = (s) =>
  (surfaceModeFor as unknown as (w: number, h: number) => SurfaceMode)(s.widthMm, s.heightMm);

/**
 * **A shape is only "the" shape if the function DISCRIMINATES under it.**
 *
 * Arity cannot decide this. Today's `surfaceModeFor(widthMm: number)` has `length === 1`, and so
 * would `surfaceModeFor(size: PhysicalSize)`; worse, calling today's implementation with an
 * OBJECT does not throw — `{} >= 460` is `false` and `{} >= 300` is `false`, so it silently
 * returns the smallest mode for every input on earth. A probe that accepted that would make every
 * assertion below vacuously true, which is exactly the failure this repo keeps re-finding.
 *
 * So a shape is accepted only if it returns a valid mode for every probe input AND produces at
 * least two DISTINCT answers across surfaces the corpus itself says are different (`27-F11a`'s
 * ~88-tile counter against `27-F11b`'s ~12-tile phone). Otherwise it is degenerate and rejected.
 */
const PROBE: readonly PhysicalSize[] = [
  HARDWARE.phone,
  HARDWARE.tablet,
  HARDWARE.counter1366,
  HARDWARE.pass,
  OFF_CORPUS.desktop24,
];

const discriminates = (call: Selector): boolean => {
  try {
    const answers = PROBE.map(call);
    if (answers.some((a) => typeof a !== "string" || a.length === 0)) return false;
    return new Set(answers).size >= 2;
  } catch {
    return false;
  }
};

const shape: { name: string; call: Selector } | null = discriminates(asObject)
  ? { name: "PhysicalSize object", call: asObject }
  : discriminates(asPositional)
    ? { name: "(widthMm, heightMm) positional", call: asPositional }
    : null;

/**
 * `24-F14` — if NEITHER shape discriminates, every test below would pass against a selector that
 * answers the same thing for a phone and a pass screen. That must be a loud failure, not a green
 * run, and it must be stated once rather than repeated into every assertion.
 */
const mode: Selector = (s) => {
  if (shape === null) {
    throw new Error(
      "EMPTY MATCH (24-F14): `surfaceModeFor` did not discriminate under EITHER call shape — " +
        "neither `surfaceModeFor({ widthMm, heightMm })` nor `surfaceModeFor(widthMm, heightMm)` " +
        "returned more than one distinct mode across 27 §1a's phone, tablet, counter and " +
        "27-F11f's pass panel. Every assertion in this file would be vacuous, so it fails here " +
        "instead. If the selector's call shape is a third thing, that is a finding for this " +
        "oracle's author (24 §3 step 2) and not an edit to this file.",
    );
  }
  return shape.call(s);
};

describe("27-F11c — the mode is a pure function of PHYSICAL SIZE", () => {
  it("answers under a call shape that actually discriminates (24-F14)", () => {
    // Reported, so a reader of a green run knows WHICH contract was satisfied rather than
    // assuming one. A suite that silently fell back to the other shape and still passed would be
    // telling a reader something it did not check.
    expect(shape, "see the EMPTY MATCH message on `mode` below").not.toBeNull();
    expect(new Set(PROBE.map(mode)).size).toBeGreaterThanOrEqual(2);
  });

  it("gives 27 §1a's TWO counter panels the same mode — the whole of 27-F11c", () => {
    // "A 1366×768 and a 1920×1080 15.6″ panel hold the SAME number of 12 mm tiles. Extra pixels
    // buy sharpness; only inches buy room." Both axes are supplied here, which is the half the
    // existing width-only assertion in `responsive.dom.test.tsx` cannot state.
    //
    // 0.1 mm rather than exact: 1366×768 is 16:8.99, not 16:9, so the two panels of `27 §1a`'s
    // one counter row differ by **0.04 mm** of derived glass. That is the panel makers' rounding
    // arriving in the arithmetic, not a modelling error, and a boundary a 0.04 mm difference
    // could cross would be a boundary sitting on top of a real panel.
    expect(Math.abs(HARDWARE.counter1366.widthMm - HARDWARE.counter1920.widthMm)).toBeLessThan(0.1);
    expect(Math.abs(HARDWARE.counter1366.heightMm - HARDWARE.counter1920.heightMm)).toBeLessThan(
      0.1,
    );
    expect(mode(HARDWARE.counter1920)).toBe(mode(HARDWARE.counter1366));
  });

  it("is TOTAL over every surface the corpus names, and over degenerate input", () => {
    // `01-F17`/`01-F54` one layer down: a selector that threw on a surface would take the till
    // out on hardware `27 §1a` itself lists. Zero and enormous are included because a
    // `ResizeObserver` genuinely reports a zero rect on a detached node.
    for (const [name, size] of Object.entries(HARDWARE)) {
      expect(typeof mode(size), name).toBe("string");
      expect(mode(size), name).not.toHaveLength(0);
    }
    expect(typeof mode({ widthMm: 0, heightMm: 0 })).toBe("string");
    expect(typeof mode({ widthMm: 10_000, heightMm: 10_000 })).toBe("string");
  });

  it("is PURE — the same surface answers the same thing every time", () => {
    // `27-F4` forbids adaptive or personalised arrangement anywhere staff-facing. A selector that
    // read a clock, a counter or any state outside its argument would make the layout a function
    // of history, which is that FR's own named prohibition one level below the grid.
    const s = HARDWARE.counter1366;
    const first = mode(s);
    for (let i = 0; i < 50; i += 1) expect(mode({ ...s })).toBe(first);
    expect(mode(Object.freeze({ ...s }))).toBe(first);
  });

  it("is MONOTONE — a bigger surface is never a smaller mode (27-F11c)", () => {
    /**
     * "Only inches buy room." Growing the glass on both axes may leave the mode alone or move it
     * up the capacity ladder; it may never move it DOWN. This is the assertion that kills a
     * scrambled or inverted selector without pinning where any boundary sits.
     *
     * The ladder is read off `SurfaceMode`'s own three members by capacity order. That IS a
     * pinned reading — the type is a union with no declared order — and it is the only ordering
     * the corpus supports: `27 §1a`'s capacity column runs ~12 tiles (phone) → ~35 (tablet) →
     * ~88 (counter), and `27-F11f` puts the 22″ pass panel above the counter again. A mode the
     * implementer ADDS that this ladder does not know is skipped rather than guessed at, and the
     * count below is the `24-F14` guard that the skip did not swallow the check.
     */
    const RANK: Partial<Record<string, number>> = { compact: 0, counter: 1, wide: 2 };
    const ladder: PhysicalSize[] = [];
    for (let mm = 40; mm <= 900; mm += 10) ladder.push({ widthMm: mm, heightMm: mm * 0.56 });

    let compared = 0;
    let previous = -1;
    for (const size of ladder) {
      const rank = RANK[mode(size)];
      if (rank === undefined) continue;
      compared += 1;
      expect(
        rank,
        `growing to ${size.widthMm.toFixed(0)} x ${size.heightMm.toFixed(0)} mm moved the mode ` +
          `DOWN to '${mode(size)}' — 27-F11c says only inches buy room`,
      ).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
    // `24-F14` — if the implementer renamed every mode, `RANK` skips everything and the loop
    // above asserts nothing at all.
    expect(
      compared,
      "EMPTY MATCH (24-F14): no rung of the ladder had a known mode",
    ).toBeGreaterThan(50);
  });
});

describe("27-F2 / 27 §1a — capacity is an AREA question, so HEIGHT participates", () => {
  /**
   * # THE ASSERTION THIS FILE EXISTS FOR
   *
   * `27-F2`: *"page capacity is derived from the surface's usable AREA and 27-F8's target size."*
   * `27 §1a`'s own capacity column is a product of rows and columns — 11×8, 7×5, **2×6** — so the
   * document that sets capacity sets it on two axes. `27-F11f` sizes the pass panel by a
   * VERTICAL count (*"the smallest size showing three tickets"*), and `27-F2` forbids reaching a
   * primary action by scrolling, which is a height failure and only ever a height failure.
   *
   * A selector keyed on width alone therefore contradicts the two FRs that define capacity. It
   * also mis-sorts the corpus's own hardware in the direction that hurts: `27 §1a`'s phone is
   * 69 × 150 mm and portrait — TALLER than the 10.1″ tablet's 126 mm — and a width-only reading
   * cannot tell them apart from a letterboxed panel of the same width and a third of the height.
   *
   * **No threshold is pinned.** The assertion is existential: SOMEWHERE in the range the corpus's
   * own hardware spans, holding width fixed and changing height must change the answer. Where
   * that happens is the implementer's call and this oracle deliberately does not own it.
   */
  it("is NOT a function of width alone — height changes the mode at MORE THAN ONE width", () => {
    /**
     * Four widths, each drawn from a real surface (`27 §1a`'s tablet and counter, `27-F11f`'s 22″
     * pass panel, and the 24″ desktop this product's own gate sweeps), over a height range the
     * corpus's own hardware spans: its 10.1″ tablet is 126 mm tall and a 24″ panel is 299 mm.
     *
     * **`>= 2` rather than `>= 1`, and the difference is the point.** One is satisfiable by a
     * selector that reads height in a single arm — a `wide` tier that also wants a tall panel,
     * with everything below it decided on width alone. That is *nearly* the defect: on the
     * corpus's own hardware the two surfaces that collapse together are `27 §1a`'s 69 × 150 mm
     * phone and a 13.3″ 286 × 179 mm laptop, and both sit below any plausible `wide` boundary.
     * Requiring height to bite at two independent widths refuses the one-arm reading without
     * pinning where either boundary is.
     *
     * A width-only selector scores **0** here.
     */
    const widths = [
      HARDWARE.tablet.widthMm,
      HARDWARE.counter1366.widthMm,
      HARDWARE.pass.widthMm,
      OFF_CORPUS.desktop24.widthMm,
    ];
    const heights: number[] = [];
    for (let mm = 60; mm <= 320; mm += 5) heights.push(mm);

    const varying = widths.filter(
      (widthMm) => new Set(heights.map((heightMm) => mode({ widthMm, heightMm }))).size >= 2,
    );

    expect(
      varying.length,
      `HEIGHT IS BARELY PARTICIPATING — it changed the mode at ${varying.length} of ` +
        `${widths.length} widths tried (27 §1a's tablet, its counter, 27-F11f's 22" pass panel, ` +
        'a 24" desktop), each swept from 60 mm to 320 mm tall. 27-F2 derives page capacity from ' +
        "the surface's usable AREA and 27 §1a's own capacity column is rows x columns (11x8, " +
        "7x5, 2x6), so a selector that reads one axis — or reads the second one in a single " +
        "top-end arm — is answering a different question from the one the corpus asks. Measured " +
        "consequence, from this repo's own layout gate: every below-floor failure except the " +
        "phone's is a HEIGHT failure, and PANEL_FLOOR_MM is two numbers for that reason.",
    ).toBeGreaterThanOrEqual(2);
  });

  /**
   * **NOT ASSERTED, and named rather than left looking like an oversight.**
   *
   * A first draft of this file demanded that `27 §1a`'s 69 × 150 mm PHONE and a 69 × 40 mm strip
   * of the same width resolve to different modes. It was over-reach and it would have blocked a
   * correct implementation: below any plausible width boundary a threshold selector has nothing
   * left to say, and the corpus gives the phone no mode of its own — `27-F11b` gives it a page
   * SIZE, and both this product's window floor and its layout gate treat a portrait layout as
   * separate work that does not exist yet (`phone-6.5` is deliberately absent from the sweep).
   * "Capacity considers height" is `27-F2`, and `ItemGrid` already discharges it by taking
   * `heightMm` directly; "the MODE ENUM distinguishes those two surfaces" is a further claim no
   * FR makes. The assertion above is the part the corpus actually supports.
   */

  it("does not let a WIDE-AND-SHORT panel inherit a tall panel's mode (27-F2)", () => {
    /**
     * The stress case this product already sweeps in Blink: a 32:9 ultrawide is 782 mm of width
     * against 220 mm of height, and the same width at a quarter of the height is a letterbox.
     * `27-F2`'s "no primary action may require scrolling to reach" is the law that binds here and
     * it binds on the vertical only, so two surfaces that differ ONLY in whether a primary action
     * fits must not be told to lay out identically.
     */
    const tall: PhysicalSize = { widthMm: 782, heightMm: 220 };
    const letterbox: PhysicalSize = { widthMm: 782, heightMm: 55 };
    expect(
      mode(letterbox),
      "a 782 x 55 mm letterbox got the same mode as a 782 x 220 mm ultrawide. 27-F2 forbids " +
        "reaching a primary action by scrolling and that is a height property; a mode that " +
        "cannot see the difference cannot honour it.",
    ).not.toBe(mode(tall));
  });
});

describe("24-F14 — the constants this contract rests on are still real", () => {
  it("SURFACE_MODE_MIN_MM has not been emptied out from under the selector", () => {
    /**
     * Not a pin on the VALUES — pinned reading 3 says this oracle does not own them — but on the
     * constant still being a real, positive, ordered set of boundaries. A `SURFACE_MODE_MIN_MM`
     * edited to `{}` or to zeroes would make `surfaceModeFor` answer one thing for every panel,
     * and every set-and-order assertion in the app-level suite would then pass vacuously against
     * a product with no modes at all.
     *
     * Read defensively: the implementer may legitimately add axes or rename members, so this
     * walks whatever numbers are there rather than naming `counter` and `wide`.
     */
    const numbers = Object.values(SURFACE_MODE_MIN_MM as Record<string, unknown>).flatMap((v) =>
      typeof v === "number" ? [v] : typeof v === "object" && v !== null ? Object.values(v) : [],
    );
    expect(
      numbers.length,
      "EMPTY MATCH (24-F14): SURFACE_MODE_MIN_MM carries no numbers at all",
    ).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(typeof n).toBe("number");
      expect(n as number).toBeGreaterThan(0);
    }
  });
});
