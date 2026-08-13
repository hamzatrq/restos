// ACCEPTANCE TESTS — AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2).
//
// PROVENANCE: written by a test-authoring session against `specs/27-design-language.md` §5
// (`27-F30`..`27-F37`), §4 (`27-F14`/`27-F16` colour budget) and `27-F42`/`27-F68`. No icon
// implementation existed when these were written. Expected RED until the vocabulary is drawn.
//
// The companion file `icon-vocabulary.test.ts` checks the SET — what symbols exist, what they are
// for, and that none of them came off a shelf. This file checks the DRAWINGS, by rendering them.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ WHAT A RENDER IN THIS PACKAGE CAN AND CANNOT SAY
//
// happy-dom performs NO LAYOUT — every `getBoundingClientRect` is zeroes. So nothing here is
// evidence that an icon is ON the screen at a readable size, and nothing here is evidence that
// anybody can READ it. `pnpm layout:check` owns the first. **`27-F35`'s ≥85% post-training
// comprehension / ≤5% critical-confusion gate on real staff owns the second and HAS NOT BEEN
// RUN.** `27-F34` is explicit that the real acceptance test is *"show the real page, name the
// function, record the tap"* — a human protocol, on people we have not met.
//
// Everything below is therefore a check on the PRECONDITIONS of that gate: that the drawings are
// line drawings and not photographs or bare glyphs (`27-F32`), that an act looks like an act
// (`27-F33`), that no two siblings are the same picture (`27-F34`), that colour still belongs to
// the `27-F14` budget and not to the icon, and — the one that matters most while the gate is
// unrun — that **the pictogram never carries the meaning by itself.**

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type TypeName, typography } from "../tokens/index";
import { ICON_NAMES, ICONS, Icon, IconLabel } from "./index";

afterEach(cleanup);

/**
 * A STRUCTURAL VIEW over the registry — see the same note in `icon-vocabulary.test.ts`. These
 * tests must typecheck against ANY correct implementation, including one that narrows its
 * registry with `as const satisfies`, so the contract is read through a shape rather than through
 * the implementation's own literal types.
 */
type IconId = Parameters<typeof Icon>[0]["name"];
const NAMES: readonly IconId[] = ICON_NAMES as readonly IconId[];
const kindOf = (name: IconId): string =>
  (ICONS as Record<string, { kind: string } | undefined>)[name]?.kind ?? "(unclassified)";
const groupOf = (name: IconId): string =>
  (ICONS as Record<string, { group: string } | undefined>)[name]?.group ?? "(ungrouped)";
/** The first declared symbol — used where a test needs any one icon and cares only about size. */
const anyIcon = (): IconId => {
  const n = NAMES[0];
  if (n === undefined) throw new Error("ICON_NAMES is empty — nothing to render");
  return n;
};

const PRIMITIVES = ["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"] as const;

const svgFor = (name: IconId, size: TypeName = "text-body"): SVGElement => {
  const { container } = render(<Icon name={name} size={size} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error(`<Icon name="${name}"> rendered no <svg>`);
  return svg as unknown as SVGElement;
};

const primitivesOf = (svg: Element): Element[] =>
  PRIMITIVES.flatMap((tag) => Array.from(svg.querySelectorAll(tag)));

/**
 * A stroke count as a COMPLEXITY PROXY. Subpaths (`M`/`m` commands) rather than elements, because
 * one `<path>` can hold a whole drawing and counting elements would score it as a single mark.
 *
 * Stated openly as a heuristic, in the same spirit as `discipline.test.ts`'s 40–200 px "this is
 * plausibly impersonating a touch target" band. It measures how many marks are on the grid, which
 * is the only mechanical handle on `27-F32`'s two-sided rule — richer than a bare glyph, poorer
 * than a photograph.
 */
const strokeCount = (svg: Element): number => {
  let n = 0;
  for (const el of primitivesOf(svg)) {
    if (el.tagName.toLowerCase() === "path") {
      const d = el.getAttribute("d") ?? "";
      n += (d.match(/[Mm]/g) ?? []).length || 1;
    } else n += 1;
  }
  return n;
};

/**
 * The set of rounded grid points a drawing touches — the `27-F34` distinctness signature.
 *
 * ⚠ HONEST LIMIT, because a reader will otherwise assume more than this does: the path walk pairs
 * consecutive numbers, which is wrong for `A` (7 parameters) and for the shorthand curve
 * commands. It is not a renderer and does not need to be — it is a DETERMINISTIC signature over
 * the same coordinates, so two drawings that trace nearly the same points score near-identical
 * and two that do not, do not. It cannot detect a drawing that is a rotation or a mirror of its
 * sibling, and `27-F34`'s real answer to that is the tap test on real staff.
 */
const pointsOf = (svg: Element): Set<string> => {
  const pts = new Set<string>();
  const at = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) pts.add(`${Math.round(x)},${Math.round(y)}`);
  };
  const nums = (v: string | null): number[] => (v?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const el of primitivesOf(svg)) {
    const tag = el.tagName.toLowerCase();
    const n = (a: string) => Number(el.getAttribute(a) ?? Number.NaN);
    if (tag === "path" || tag === "polyline" || tag === "polygon") {
      const xs = nums(el.getAttribute(tag === "path" ? "d" : "points"));
      for (let i = 0; i + 1 < xs.length; i += 2) at(xs[i] ?? NaN, xs[i + 1] ?? NaN);
    } else if (tag === "circle" || tag === "ellipse") {
      at(n("cx"), n("cy"));
    } else if (tag === "rect") {
      at(n("x"), n("y"));
      at(n("x") + n("width"), n("y") + n("height"));
    } else if (tag === "line") {
      at(n("x1"), n("y1"));
      at(n("x2"), n("y2"));
    }
  }
  return pts;
};

/**
 * Each mark's GEOMETRY alone — tag plus the attributes that decide its shape, with paint and the
 * `data-cue` marker stripped. Two marks that differ only in colour or in whether they were
 * labelled a motion cue are still the same mark on the glass, and comparing the whole attribute
 * set is exactly how a near-copy hides from an exact-match check.
 */
const SHAPE_ATTRS = [
  "d",
  "points",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "width",
  "height",
  "x1",
  "y1",
  "x2",
  "y2",
];
const marksOf = (svg: Element): string[] =>
  primitivesOf(svg).map((el) =>
    [
      el.tagName.toLowerCase(),
      ...SHAPE_ATTRS.map((a) => el.getAttribute(a)).filter((v) => v !== null),
    ].join("|"),
  );

/** Everything the drawing declares, in document order — an exact-duplicate detector. */
const geometrySignature = (svg: Element): string =>
  primitivesOf(svg)
    .map((el) =>
      [
        el.tagName.toLowerCase(),
        ...Array.from(el.attributes)
          .map((a) => `${a.name}=${a.value}`)
          .sort(),
      ].join("|"),
    )
    .join(" / ");

const overlap = (a: Set<string>, b: Set<string>): number => {
  const shared = [...a].filter((p) => b.has(p)).length;
  return shared / Math.max(1, Math.min(a.size, b.size));
};

const pxOf = (svg: Element, attr: "width" | "height"): number => {
  const raw = svg.getAttribute(attr);
  if (raw && /^-?\d+(\.\d+)?(px)?$/.test(raw.trim())) return Number.parseFloat(raw);
  const styled = (svg as HTMLElement).style?.[attr];
  if (styled && /^-?\d+(\.\d+)?px$/.test(styled.trim())) return Number.parseFloat(styled);
  throw new Error(`<svg> declares no numeric ${attr} (got ${raw ?? styled ?? "nothing"})`);
};

describe("the sweep actually renders the vocabulary", () => {
  it("renders every declared symbol as one <svg>", () => {
    // Anti-vacuity for every sweep below: they all iterate ICON_NAMES, and a sweep over an empty
    // or partial list asserts nothing while staying green. This is the guard `24-F14` asks for.
    expect(NAMES.length).toBeGreaterThanOrEqual(15);
    for (const name of NAMES) {
      const { container } = render(<Icon name={name} size="text-body" />);
      expect(container.querySelectorAll("svg").length, `${name} did not render one svg`).toBe(1);
      cleanup();
    }
  });
});

/**
 * ═══ `27-F14` / `27-F16` — THE DRAWING NEVER SPENDS COLOUR ═══
 *
 * `27-F16` is a BUDGET: three status colours and one interactive accent, product-wide. A symbol
 * that paints itself has taken a slot out of that budget in a place no token audit looks, and
 * `27-F36` names literal colour realism as a documented in-field failure in its own right
 * ("roads can never be yellow"). The icon inherits; the surface decides.
 */
describe("27-F14/F16 — colour belongs to the caller, never to the drawing", () => {
  const PAINT_ATTRS = ["fill", "stroke", "color", "stop-color", "flood-color", "lighting-color"];

  it("paints only with currentColor or nothing at all", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `stroke="#111827"`, `fill="black"`, or the subtler one —
    // `stroke={color["fgColor-default"]}` resolved inside the icon. All three render correctly on
    // the light counter and wrongly on `27-F19`'s dark KDS and inside `27-F67`'s training
    // inversion, where the whole point is that the polarity is TOTAL.
    const offences: string[] = [];
    for (const name of NAMES) {
      const svg = svgFor(name);
      for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
        for (const attr of PAINT_ATTRS) {
          const v = el.getAttribute(attr);
          if (v === null) continue;
          if (v === "currentColor" || v === "none" || v === "inherit") continue;
          offences.push(`${name}: <${el.tagName.toLowerCase()} ${attr}="${v}">`);
        }
      }
      cleanup();
    }
    expect(offences, "a drawing that spends a colour out of the 27-F14 budget").toEqual([]);
  });

  it("sets no colour in its inline style either", () => {
    // The same defect one property over. `style="color: …"` on the svg re-points every
    // `currentColor` beneath it, which is the budget escape with the paint attributes clean.
    const offences: string[] = [];
    for (const name of NAMES) {
      const svg = svgFor(name);
      for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
        const style = el.getAttribute("style") ?? "";
        if (/(^|;)\s*(color|fill|stroke)\s*:\s*(?!currentcolor|none|inherit)/i.test(style)) {
          offences.push(`${name}: style="${style}"`);
        }
      }
      cleanup();
    }
    expect(offences).toEqual([]);
  });
});

/**
 * ═══ `27-F32` — SEMI-ABSTRACT LINE DRAWINGS: NOT PHOTOREALISM, NOT MINIMAL GLYPHS ═══
 *
 * *"Photographs measured worst of five visual representations — extraneous detail actively
 * hurts. Not photorealism, not minimal geometric glyphs."* Both halves are checkable only as
 * proxies, and both are stated as bands rather than pretended to be measurements.
 */
describe("27-F32 — one grid, line drawings, and neither too bare nor too detailed", () => {
  it("draws every symbol on the same grid", () => {
    // Not a specific viewBox — a SHARED one. A set drawn on mixed grids cannot hold a constant
    // stroke weight or optical size across its members, which is the property that makes twenty
    // symbols read as one alphabet instead of twenty borrowings.
    const boxes = new Map<string, string[]>();
    for (const name of NAMES) {
      const box = svgFor(name).getAttribute("viewBox") ?? "(none)";
      boxes.set(box, [...(boxes.get(box) ?? []), name]);
      cleanup();
    }
    expect([...boxes.keys()], `symbols are on ${boxes.size} different grids`).toHaveLength(1);
    expect([...boxes.keys()][0]).toMatch(/^[\d\s.-]+$/);
  });

  it("is stroked, not filled — a line drawing rather than a solid", () => {
    const offences: string[] = [];
    for (const name of NAMES) {
      const svg = svgFor(name);
      const stroked = primitivesOf(svg).filter((el) => {
        const own = el.getAttribute("stroke");
        return own === "currentColor" || (own === null && svg.getAttribute("stroke") !== null);
      });
      if (stroked.length === 0) offences.push(`${name} strokes nothing`);
      cleanup();
    }
    expect(offences, "27-F32 asks for line drawings").toEqual([]);
  });

  it("carries more than one mark and fewer than fifteen", () => {
    // THE BAND IS A HEURISTIC AND IS STATED AS ONE. 2 is the floor because a single mark is a
    // "minimal geometric glyph" by construction — a circle, a chevron, a bar. 14 is the ceiling
    // because the failure at the top end is extraneous detail, which the evidence says actively
    // hurts. Neither number is measured; what is measured is that 42.2% comprehension came from
    // a standard drawn at one extreme of this range.
    //
    // WRONG IMPLEMENTATION THIS CATCHES: the fastest possible one — twenty single-path glyphs
    // traced off a shelf set, which is exactly what 27-F30 and 27-F31 forbid and what every
    // other test here would let through.
    const offences: string[] = [];
    for (const name of NAMES) {
      const n = strokeCount(svgFor(name));
      if (n < 2) offences.push(`${name}: ${n} mark — a minimal geometric glyph, not a drawing`);
      if (n > 14) offences.push(`${name}: ${n} marks — detail this dense measured WORST`);
      cleanup();
    }
    expect(offences).toEqual([]);
  });
});

/**
 * ═══ `27-F33` — AN ACTION CARRIES A MOTION CUE; AN OBJECT MUST NOT ═══
 *
 * *"Without motion cues, drawings read as places rather than actions — utensils read as 'the
 * kitchen', not 'washing up'."*
 *
 * ⚠ NO MACHINE CAN SEE MOTION IN A BEZIER. So the drawing DECLARES its cue — `data-cue="motion"`
 * on the element or elements that carry it — and this suite checks that the declaration is
 * structurally honest against the `kind` the registry declares. What it buys is real: an
 * implementation that draws twenty static objects and classifies six of them as actions reddens
 * here, and that implementation is the default outcome, because a static drawing is what one
 * reaches for.
 *
 * What it does NOT buy, stated plainly: an implementation can mark a static element as a cue and
 * pass. Only `27-F34`'s tap test on real staff separates those, and it is unrun.
 */
describe("27-F33 — the drawing honours the classification", () => {
  const cues = (svg: Element) => Array.from(svg.querySelectorAll('[data-cue="motion"]'));

  it("gives every action a motion cue", () => {
    const missing = NAMES.filter((n) => kindOf(n) === "action").filter((n) => {
      const bare = cues(svgFor(n)).length === 0;
      cleanup();
      return bare;
    });
    expect(missing, "an act drawn as a place — 27-F33's named failure").toEqual([]);
  });

  it("gives no object a motion cue", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `delivery` drawn as a motorbike with speed lines, which
    // is the instinctive drawing and reads as "deliver it" on a tile whose job is to say what
    // KIND of order this is. Same for a `phone` with ring arcs and a `foodpanda` with a swoosh.
    const overCued = NAMES.filter((n) => kindOf(n) === "object").filter((n) => {
      const cued = cues(svgFor(n)).length > 0;
      cleanup();
      return cued;
    });
    expect(overCued, "a category drawn as an act — 27-F33, the other direction").toEqual([]);
  });

  it("still draws the thing being acted on", () => {
    // ANTI-VACUITY, and the reason this is not just "count the cues". An implementation that
    // marks EVERY element of an action icon as a cue satisfies the first test while drawing no
    // object at all — a pure arrow, which is the minimal glyph 27-F32 rules out and which cannot
    // say WHICH act. So an action must have at least one cue element and at least one that is
    // not: the thing, plus the motion of it.
    const offences: string[] = [];
    for (const name of NAMES) {
      if (kindOf(name) !== "action") continue;
      const svg = svgFor(name);
      const all = primitivesOf(svg).length;
      const cued = primitivesOf(svg).filter(
        (el) => el.closest('[data-cue="motion"]') !== null,
      ).length;
      if (all - cued < 1)
        offences.push(`${name}: every mark is a motion cue — nothing is acted on`);
      cleanup();
    }
    expect(offences).toEqual([]);
  });
});

/**
 * ═══ `27-F34` — VALIDATED BY MUTUAL DISTINCTNESS, NOT INDIVIDUAL CLARITY ═══
 *
 * *"An icon fails if it draws taps meant for a co-displayed sibling."* The real test is the tap
 * test and it is unrun. What is checkable is its precondition: that two symbols a cashier sees
 * side by side are not the same picture.
 *
 * The chrome group is where this bites hardest by construction, and deliberately so — `remove`,
 * `backspace` and `clear` are three ways of saying "take it away" and the till renders the last
 * two on adjacent keys of one keypad. If a set is going to collapse anywhere, it is there.
 */
describe("27-F34 — no symbol is another symbol", () => {
  const drawn = () => {
    const out = NAMES.map((name) => {
      const svg = svgFor(name);
      const rec = {
        name,
        sig: geometrySignature(svg),
        pts: pointsOf(svg),
        marks: marksOf(svg),
      };
      cleanup();
      return rec;
    });
    return out;
  };

  it("gives the distinctness measure something to measure", () => {
    // A drawing with two grid points makes every overlap ratio meaningless — 1 shared point of 2
    // is 50% between two unrelated shapes. The floor is stated so the ratio below means what it
    // says, and it is a real property besides: 27-F32's marks have to land somewhere.
    for (const { name, pts } of drawn()) {
      expect(
        pts.size,
        `${name} touches ${pts.size} grid points — too few to be a drawing`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it("never repeats a drawing verbatim anywhere in the vocabulary", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: the copy-paste. Twenty entries, eighteen drawings, and
    // the two that share one are the two nobody can tell apart — which is 27-F34's failure
    // exactly, and it survives every review that reads the registry rather than the pictures.
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const { name, sig } of drawn()) {
      const first = seen.get(sig);
      if (first) dupes.push(`${first} and ${name} are the same drawing`);
      else seen.set(sig, name);
    }
    expect(dupes).toEqual([]);
  });

  it("keeps co-displayed siblings apart on the grid", () => {
    // The near-copy: same drawing with one line moved. 0.8 is a band, not a measurement — two
    // genuinely different drawings on a shared 24-unit grid do not land on four fifths of the
    // same points, and a shared frame or baseline between siblings is well under it. Reported
    // with the measured ratio so a failure says how close, not just "too close".
    const NEAR_COPY = 0.8;
    const all = drawn();
    const offences: string[] = [];
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) {
        if (groupOf(a.name) !== groupOf(b.name)) continue;
        const ratio = overlap(a.pts, b.pts);
        if (ratio > NEAR_COPY) {
          offences.push(`${a.name} / ${b.name} share ${(ratio * 100).toFixed(0)}% of their points`);
        }
      }
    }

    expect(offences, "co-displayed siblings a cashier cannot tell apart (27-F34)").toEqual([]);
  });

  it("shares no MAJORITY of its marks with a co-displayed sibling", () => {
    /**
     * ⚠ THIS ASSERTION EXISTS BECAUSE A MUTANT SURVIVED, AND THAT IS THE ONLY REASON IT IS HERE.
     *
     * The first version of this suite had the two checks above and nothing else, and it looked
     * complete. Mutant **M12** — `raast` replaced by `card` **with one line moved by one grid
     * unit** — passed all 43 tests. The verbatim check missed it because the `d` strings differ;
     * the point-overlap check measured **67%**, under its 80% band, because moving one line moves
     * two of six points. Two tiles a cashier settles with, one of them a copy of the other, and
     * the suite said yes. **Reading the tests would never have found this; only mutating did.**
     *
     * The fix is a different DIMENSION, not a tuned threshold — tightening 0.8 until M12 failed
     * would have been fitting the number to one mutant and would have started redding legitimate
     * siblings that share a frame. What separates a near-copy from a family resemblance is how
     * many marks are byte-identical: M12 shares 2 of its 3 marks exactly. So: at most HALF of a
     * symbol's marks may be marks its sibling also draws. A shared frame or baseline across a
     * group sits at or under half and stays legal; a copy with one line nudged does not.
     *
     * Paint and the `data-cue` marker are stripped before comparing — a mark recoloured or
     * relabelled is still the same mark, and comparing the whole attribute set is what let the
     * verbatim check be fooled in the first place.
     */
    const SHARED_MARKS = 0.5;
    const all = drawn();
    const offences: string[] = [];
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) {
        if (groupOf(a.name) !== groupOf(b.name)) continue;
        const shared = a.marks.filter((m) => b.marks.includes(m)).length;
        const ratio = shared / Math.max(1, Math.min(a.marks.length, b.marks.length));
        if (ratio > SHARED_MARKS) {
          offences.push(
            `${a.name} / ${b.name} draw ${shared} identical marks (${(ratio * 100).toFixed(0)}%)`,
          );
        }
      }
    }
    expect(offences, "one sibling is the other with a line moved (27-F34)").toEqual([]);
  });
});

/**
 * ═══ `27-F42` / `27-F68` — THE SIZE COMES FROM A TOKEN, NEVER FROM A NUMBER ═══
 *
 * `27-F68` and `DEC-UI-001`: **a dp is a physical size**, and inside `PanelRoot` the CSS pixel
 * Blink lays out IS the dp. A pinned pixel size is the exact mistake that ruling exists to name —
 * it renders 20 mm on one counter panel and 14.2 mm on the other.
 *
 * ⚠ A TENSION THIS SUITE DOES NOT RESOLVE, RECORDED RATHER THAN DECIDED. `27-F42` makes
 * typography COMPOSITE — *"never destructure a size out of one"* — and this package's own guide
 * records that the line-height half is dropped in 19 of 20 components and calls that OWED debt,
 * not licence. So the assertion accepts EITHER half of the composite the icon is sized against,
 * and pins neither. What it refuses is a third number that came from nowhere.
 */
describe("27-F42/F68 — icon size is derived from the type scale", () => {
  const SCALE: TypeName[] = [
    "text-label",
    "text-body",
    "text-numeric-primary",
    "text-numeric-hero",
    "text-numeric-display",
  ];

  it("renders square, at a size the composite token actually names", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `width={24}` — the single most likely line in any icon
    // component ever written, and the one that puts a 24 dp symbol beside 64 dp money on the
    // display scale and beside 14 dp text on the label scale.
    const offences: string[] = [];
    for (const size of SCALE) {
      const t = typography[size];
      const svg = svgFor(anyIcon(), size);
      const w = pxOf(svg, "width");
      const h = pxOf(svg, "height");
      if (w !== h) offences.push(`${size}: ${w}x${h} is not square`);
      if (w !== t.fontSize && w !== t.lineHeight) {
        offences.push(`${size}: ${w} is neither ${t.fontSize} nor ${t.lineHeight}`);
      }
      cleanup();
    }
    expect(offences).toEqual([]);
  });

  it("grows with the scale, so no two steps render alike", () => {
    // The control on the test above. A constant that happens to equal one token's value passes
    // it once; nothing but monotonic growth across five steps rules out a constant entirely.
    const sizes = SCALE.map((size) => {
      const px = pxOf(svgFor(anyIcon(), size), "width");
      cleanup();
      return px;
    });
    expect(new Set(sizes).size, `five steps rendered ${sizes.join("/")}`).toBe(SCALE.length);
    for (const [i, px] of sizes.entries()) {
      if (i === 0) continue;
      expect(px, `${SCALE[i]} is not larger than ${SCALE[i - 1]}`).toBeGreaterThan(
        sizes[i - 1] ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it("sizes every symbol alike at a given step", () => {
    // Twenty symbols on one grid at one step is what makes them one alphabet. A per-symbol size
    // override would also be the seam through which a raw number re-enters.
    const widths = new Set(
      NAMES.map((name) => {
        const px = pxOf(svgFor(name, "text-body"), "width");
        cleanup();
        return px;
      }),
    );
    expect([...widths]).toHaveLength(1);
  });
});

/**
 * ═══ `27-F35` — THE PICTOGRAM NEVER CARRIES THE MEANING ALONE ═══
 *
 * **THIS IS THE SECTION THE TRACK SUCCEEDS OR FAILS ON.** `27-F35` gates this vocabulary on ≥85%
 * correct and ≤5% critical confusion in a post-training retest with real staff, and that test has
 * not been run. `27-F31`'s own headline number is the reason to take the gate seriously rather
 * than assume a pass: locally drawn pictograms scored 20 of 23 and imported ones 11 of 23 — which
 * means roughly half of a plausible-looking imported set was unreadable to the people it was for.
 *
 * Until the gate is run, every symbol ships WITH its existing word (`27-F5` wants a labelled
 * target; `21 §5` wants icons and numbers dominant with minimal words, not zero words). Going
 * icon-only is a separate decision that the gate unlocks and nothing else does.
 */
describe("27-F35 — icon + label, until the comprehension gate has been run on real staff", () => {
  it("renders the icon as decorative — it has no accessible name of its own", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: `<svg role="img" aria-label="Cash">`, which is the
    // idiomatic accessible-icon pattern and is exactly wrong here. It makes the pictogram a
    // NAME, which is the thing the unrun gate has not licensed it to be — and it does it in a
    // way that reads as an accessibility improvement in review.
    for (const name of NAMES) {
      const svg = svgFor(name);
      expect(svg.getAttribute("aria-hidden"), `${name} is not marked decorative`).toBe("true");
      expect(svg.getAttribute("aria-label"), `${name} names itself`).toBeNull();
      expect(svg.getAttribute("role"), `${name} claims a role`).not.toBe("img");
      expect(svg.querySelector("title"), `${name} carries a <title>`).toBeNull();
      cleanup();
    }
  });

  it("renders the word beside the symbol, as visible text", () => {
    render(<IconLabel name="cash" label="CASH" size="text-body" />);
    const word = screen.getByText("CASH");
    expect(word.textContent).toBe("CASH");
  });

  it("never hides the word behind a screen-reader-only treatment", () => {
    // WRONG IMPLEMENTATION THIS CATCHES: the sr-only class — `position:absolute; width:1px;
    // height:1px; clip:rect(0,0,0,0)`. It keeps every accessible-name assertion green, keeps the
    // DOM text present for `getByText`, and takes the word off the glass, which is the ONLY
    // place the cashier this is for can read it. It is icon-only shipped as an a11y win.
    render(<IconLabel name="cash" label="CASH" size="text-body" />);
    const word = screen.getByText("CASH");
    const s = (word as HTMLElement).style;
    const hidden =
      s.display === "none" ||
      s.visibility === "hidden" ||
      s.opacity === "0" ||
      s.clipPath === "inset(50%)" ||
      /rect\(\s*0/.test(s.clip ?? "") ||
      /^(0|1)px$/.test(s.width ?? "") ||
      /^(0|1)px$/.test(s.height ?? "") ||
      s.fontSize === "0" ||
      s.fontSize === "0px";
    expect(hidden, `the label is visually hidden: ${word.getAttribute("style")}`).toBe(false);
  });

  it("gives the control its name from the word, not from the picture", () => {
    // The composite property, asserted where it is actually consumed: put the pairing inside a
    // control and the control must be findable by the word alone. If the drawing ever grows an
    // accessible name, the computed name becomes "Cash CASH" and this fails.
    render(
      <button type="button">
        <IconLabel name="cash" label="CASH" size="text-body" />
      </button>,
    );
    expect(screen.getByRole("button", { name: "CASH" })).toBeTruthy();
  });

  it("refuses to render a pairing with no word in it", () => {
    // The last door. A required `label` prop is satisfied by `""`, and `label=""` is icon-only
    // wearing the pairing component — reached by a compact layout buying back 40 dp, or by a
    // call site that has "obviously" already said CASH one row up. `TOKENS.md`'s `must()` sets
    // the precedent for failing loudly at the point of use rather than rendering something
    // subtly wrong; the message names 27-F35 so the reader lands on the gate, not on a stack
    // trace. Whitespace counts as empty for the same reason `" "` counts as empty everywhere.
    expect(() => render(<IconLabel name="cash" label="   " size="text-body" />)).toThrow(/27-F35/);
  });
});
