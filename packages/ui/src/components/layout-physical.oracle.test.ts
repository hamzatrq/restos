// ORACLE ACCEPTANCE TESTS — 27-F11c (capacity is physical) and 27-F8 (gaps).
//
// PROVENANCE: oracle session (24 §3 step 2).

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import tokens from "../tokens/tokens.json" with { type: "json" };
import { pageCapacity } from "./ItemGrid";

const UI_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const REPO_ROOT = join(UI_ROOT, "..", "..");
const TMP = join(UI_ROOT, ".oracle-layout");
const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const typecheck = (name: string, code: string): string => {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fixture.ts"), code);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(REPO_ROOT, "packages", "config", "tsconfig.base.json"),
      compilerOptions: {
        jsx: "react-jsx",
        types: [],
        paths: { "@restos/ui": [join(UI_ROOT, "src", "index.ts")] },
      },
      include: ["fixture.ts"],
    }),
  );
  try {
    execFileSync(process.execPath, [TSC, "--noEmit", "-p", join(dir, "tsconfig.json")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "";
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
};

// -----------------------------------------------------------------------------------------
// 27-F11c — "Physical size, never resolution, sets capacity."
// -----------------------------------------------------------------------------------------

/** A 16:9 panel's usable width and height in millimetres, from its diagonal in inches. */
const panelMm = (diagonalIn: number): { widthMm: number; heightMm: number } => {
  const d = diagonalIn * 25.4;
  const k = Math.hypot(16, 9);
  return { widthMm: (d * 16) / k, heightMm: (d * 9) / k };
};

describe("27-F11c — only inches buy room; extra pixels buy sharpness", () => {
  // The FR is explicit: "A 1366x768 and a 1920x1080 15.6-inch panel hold the SAME number of
  // 12 mm tiles. Extra pixels buy sharpness; only inches buy room. Design in millimetres,
  // render in pixels." Both resolutions are named in 27 §1a's hardware table as the counter
  // POS target, so this is not a hypothetical.
  //
  // `pageCapacity` takes `widthPx`/`heightPx` and no PPI, so today those two panels return 91
  // and 180 for the same physical surface. `tokens.json` carries an `mm` field on every touch
  // posture; `tokens/index.ts` drops it, leaving nothing in the package able to express a
  // physical size at all. This test requires it back.

  it("takes a PHYSICAL surface, not a pixel one", () => {
    const out = typecheck(
      "capacity-physical",
      `import { pageCapacity } from "@restos/ui";
       export const n: number = pageCapacity({
         widthMm: 345.3, heightMm: 194.2, posture: "counter", tileMm: 30,
       });`,
    );
    expect(out, "pageCapacity must accept millimetres").toBe("");
  });

  it("returns the SAME capacity for both resolutions 27 §1a lists for the 15.6-inch counter", () => {
    // Expressed as the law rather than as two numbers: whatever the API, feeding it the two
    // resolutions of one panel must not change the answer. With a mm-based API this is true by
    // construction, which is the point — the law becomes unbreakable rather than merely tested.
    const { widthMm, heightMm } = panelMm(15.6);
    const call = (widthPx: number, heightPx: number): number => {
      const ppiW = widthPx / (widthMm / 25.4);
      const ppiH = heightPx / (heightMm / 25.4);
      expect(Math.round(ppiW), "16:9 panel, so both axes share a PPI").toBe(Math.round(ppiH));
      // The caller has pixels; the component must be given millimetres. If `pageCapacity`
      // still demands pixels, this conversion is the work the package refuses to do.
      return pageCapacity({ widthMm, heightMm, posture: "counter", tileMm: 30 } as never);
    };
    const a = call(1366, 768);
    const b = call(1920, 1080);
    // Guard against a vacuous pass: with the current pixel-only API both calls return NaN,
    // and `Object.is(NaN, NaN)` is true. The capacity must be a real, positive count.
    expect(Number.isFinite(a) && a > 0, `capacity was ${a}`).toBe(true);
    expect(a).toBe(b);
  });

  it("reproduces 27-F11a's ordering from PHYSICAL sizes alone", () => {
    // 27-F11a's exact figures (~88 counter / ~35 tablet / ~12 phone) are the spec's
    // "comfortable tiles/page" column and are not re-derivable from its other numbers — an
    // 11x8 grid on a 345x194 mm panel implies non-square tiles. So the ORDERING and the rough
    // magnitude are asserted, not the three integers, and that is said out loud rather than
    // reverse-engineered into a passing constant.
    const counter = pageCapacity({ ...panelMm(15.6), posture: "counter", tileMm: 30 } as never);
    const tablet = pageCapacity({ ...panelMm(10.1), posture: "handheld", tileMm: 24 } as never);
    const phone = pageCapacity({ ...panelMm(6.5), posture: "handheld", tileMm: 24 } as never);
    expect(counter).toBeGreaterThan(tablet);
    expect(tablet).toBeGreaterThan(phone);
    expect(phone).toBeGreaterThanOrEqual(6);
    expect(counter).toBeLessThan(200);
  });

  it("refuses a tile below its posture minimum in MILLIMETRES, not pixels", () => {
    // 27-F8's table is in mm (12 / 20 / 15 / 9.6 / 7.2). A px-only guard cannot enforce it:
    // 48 px is 12.2 mm on a 100-PPI panel and 8.6 mm on a 141-PPI one, and only one of those
    // clears the counter minimum.
    expect(() =>
      pageCapacity({ ...panelMm(15.6), posture: "counter", tileMm: 8 } as never),
    ).toThrow(/12/);
  });

  it("exposes the mm field tokens.json already carries", () => {
    // The data exists and is thrown away at the typed-view boundary.
    const out = typecheck(
      "touch-mm",
      `import { targetMm } from "@restos/ui";
       export const n: number = targetMm("counter");`,
    );
    expect(out, "the mm side of the posture table is not reachable from code").toBe("");
  });

  it("keeps the mm view in step with the manifest", () => {
    const touch = tokens.touch as Record<string, { value?: number; mm?: number }>;
    for (const [name, entry] of Object.entries(touch)) {
      if (name.startsWith("$") || entry.mm === undefined) continue;
      // FINDING, and it needs a SPEC answer rather than a code tweak: 27-F8's dp and mm
      // columns do not use one conversion. counter/keypad/kitchen (76/126/96 dp -> 12/20/15
      // mm) are consistent with the 160-dpi density that DEFINES a dp. handheld and floor
      // (64 dp -> 9.6 mm, 48 dp -> 7.2 mm) use 0.15 mm/dp, i.e. ~169 dpi. Once capacity is
      // computed in millimetres the package has to pick one, and the two columns disagree by
      // up to 0.56 mm — which is 6% of the handheld minimum. Pick a conversion in doc 27 and
      // restate the table from it.
      expect(((entry.value ?? 0) / 160) * 25.4, `${name}: dp and mm columns disagree`).toBeCloseTo(
        entry.mm,
        0,
      );
    }
  });
});

// -----------------------------------------------------------------------------------------
// 27-F8 — "gaps >= 8 dp". Nothing in the package has ever checked a gap.
// -----------------------------------------------------------------------------------------

const space = tokens.space as Record<string, { value?: number }>;
const px = (token: string): number => {
  const v = space[token]?.value;
  if (typeof v !== "number") throw new Error(`space token "${token}" is not in the manifest`);
  return v;
};
const GAP_MIN = (tokens.touch as Record<string, { value?: number }>)["touch-gap-min"]?.value ?? 8;

/**
 * Containers that lay out ADJACENT TOUCH TARGETS, curated with provenance. A container whose
 * gap separates text from an icon is not in scope — 27-F8's rule is about two things a finger
 * can hit. Curation rather than inference is deliberate: the alternative flags Tile's internal
 * label gap and AlarmBand's inner text stack, neither of which is a touch adjacency.
 */
const TARGET_ROWS: readonly { where: string; what: string; gap: number; extra?: number }[] = [
  {
    where: "TabRail.tsx:48",
    what: "adjacent tab buttons, each minWidth/minHeight targetFor('counter')",
    gap: px("space-1"),
  },
  {
    where: "NumericKeypad.tsx:56",
    what: "adjacent keypad keys, each targetFor('keypad')",
    gap: px("space-2"),
  },
  {
    where: "ItemGrid.tsx:107 + Tile.tsx:53",
    what: "adjacent grid tiles",
    gap: px("space-2"),
    // Tile carries `margin: space-1` on every side, so neighbours gain 4 px each.
    extra: px("space-1") * 2,
  },
  {
    where: "ItemGrid.tsx:131",
    what: "adjacent page buttons, each targetFor('floor')",
    gap: px("space-2"),
  },
];

describe("27-F8 — adjacent touch targets are separated by at least 8 dp", () => {
  it.each(TARGET_ROWS)("$where — $what", ({ gap, extra }) => {
    expect(gap + (extra ?? 0)).toBeGreaterThanOrEqual(GAP_MIN);
  });
});
