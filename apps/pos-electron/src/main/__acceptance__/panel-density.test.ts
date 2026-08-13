import { readFileSync } from "node:fs";
import {
  describePanelDensity,
  measurePhysicalWidthMm,
  PLAUSIBLE_PPI,
  ppiFromDiagonal,
  ppiFromWidthMm,
  REFERENCE_COUNTER_DIAGONAL_IN,
  resolvePanelDensity,
} from "@restos/device-config";
import { describe, expect, it } from "vitest";

/**
 * # `27-F68` / `00 §7` layer 3 — the panel's density, and the seam it arrives on
 *
 * `DEC-UI-001` makes a dp 1/160 inch of PHYSICAL size, which means the renderer needs one number
 * it never used to have. This file holds two different claims about that number, and **neither
 * subsumes the other** — which is `AGENTS.md`'s "you need BOTH properties" on a new field:
 *
 * - **§A — the resolution is right.** Measurement before configuration before an admission, each
 *   bounded, with the source carried so `00 §5.7` can be honest at the boot line.
 * - **§B — the product actually reaches it.** `seams:check` cannot express this: `panelPpi` is a
 *   required member of `GatewayDeps` and a field on a Zod object, not an unreached export and not
 *   an unsupplied optional. A gateway that resolved a perfect density and never put it on
 *   `DeviceState`, or an `App` that stopped wrapping its tree, would pass every other gate in the
 *   repo — that is this wave's recurring defect exactly, and §B is the hand-written assertion the
 *   rail leaves to a human.
 *
 * §B reads SOURCE rather than running the app, and that is a stated limitation and not a
 * preference: `main/index.ts` imports `electron` and `App.tsx` needs a DOM with a bridge, so
 * neither is constructible from vitest. What actually measures the rendered result is
 * `pnpm layout:check`, which reads a keypad target's size in millimetres of glass on both of
 * `27 §1a`'s panels. These two are complements: the gate proves the pixels, §B proves the wiring
 * that produces them still exists in the file the gate does not read.
 */

const SRC = new URL("../..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

/** `27 §1a`'s two counter panels, as native pixels — the input `display.size × scaleFactor` gives. */
const PANEL_1366 = { widthPx: 1366, heightPx: 768 };
const PANEL_1920 = { widthPx: 1920, heightPx: 1080 };
/** A 15.6″ 16:9 panel is 345.3 mm across. */
const COUNTER_WIDTH_MM = (15.6 * 25.4 * 16) / Math.hypot(16, 9);

describe("§A 27-F68 — resolving the density: measurement, then correction, then an admission", () => {
  it("takes the OS measurement when the platform has one", () => {
    const d = resolvePanelDensity({
      display: PANEL_1366,
      configured: undefined,
      physicalWidthMm: COUNTER_WIDTH_MM,
    });
    expect(d.source).toBe("measured");
    // 27 §1a's own figure for this row: the 1366x768 15.6" counter is ~100 PPI.
    expect(d.ppi).toBeCloseTo(100.5, 1);
  });

  it("gives the SAME physical size on both of 27 §1a's counter panels (27-F11c)", () => {
    // The FR: "A 1366x768 and a 1920x1080 15.6-inch panel hold the SAME number of 12 mm tiles.
    // Extra pixels buy sharpness; only inches buy room." So the two densities must differ by
    // exactly the pixel ratio and a dp must come out the same size on both.
    const a = resolvePanelDensity({
      display: PANEL_1366,
      configured: undefined,
      physicalWidthMm: COUNTER_WIDTH_MM,
    });
    const b = resolvePanelDensity({
      display: PANEL_1920,
      configured: undefined,
      physicalWidthMm: COUNTER_WIDTH_MM,
    });
    expect(b.ppi / a.ppi).toBeCloseTo(1920 / 1366, 3);
    // 27-F8's 126 dp keypad target as CSS pixels on each panel, at devicePixelRatio 1.
    //
    // ⚠ These are 27 §1a's OWN published figures — "126 dp keypad → 79–111 px" — and they are
    // asserted as two DIFFERENT numbers on purpose. The tempting version of this assertion is
    // "the target is 20 mm on both panels", which is VACUOUS: 126/160 inch is 20 mm by
    // definition, the density cancels, and the expression passes against any density at all
    // including a wrong one. What actually bites is the pair of pixel counts, because each one
    // depends on `resolvePanelDensity` having returned the right density for its panel.
    const keyPx = (ppi: number): number => (126 / 160) * ppi;
    expect(keyPx(a.ppi), "27 §1a: 126 dp is 79 px on the 1366x768 counter").toBeCloseTo(79, 0);
    expect(keyPx(b.ppi), "27 §1a: 126 dp is 111 px on the 1920x1080 counter").toBeCloseTo(111, 0);
  });

  it("lets 00 §7's key CORRECT a panel that reports wrong — configuration outranks measurement", () => {
    // "This key exists only to correct a panel that reports nothing or reports wrong." A panel
    // that reports WRONG is only correctable if the correction wins, so the order is load-bearing
    // rather than incidental.
    const d = resolvePanelDensity({
      display: PANEL_1366,
      configured: "141",
      physicalWidthMm: COUNTER_WIDTH_MM,
    });
    expect(d).toEqual({ ppi: 141, source: "configured" });
  });

  it("REFUSES a mistyped key and falls through to the measurement, never to a stopped till", () => {
    // 00 §7: "a number a technician types is a number a technician mistypes, and the failure is
    // silent". A transposed 1401 renders 27-F8's 20 mm target at 2.3 mm and nothing on screen
    // looks broken. 01-F17 is why the refusal falls through rather than throwing.
    for (const typo of ["1401", "10", "0", "-100", "", "  ", "one hundred", "NaN"]) {
      const d = resolvePanelDensity({
        display: PANEL_1366,
        configured: typo,
        physicalWidthMm: COUNTER_WIDTH_MM,
      });
      expect(d.source, `"${typo}" must not be accepted as a density`).toBe("measured");
    }
    // …and the band admits the panels 27 §1a actually lists, on both sides.
    for (const ok of [100.5, 141, 224, 405]) {
      const d = resolvePanelDensity({
        display: PANEL_1366,
        configured: String(ok),
        physicalWidthMm: COUNTER_WIDTH_MM,
      });
      expect(d, `27 §1a lists ${ok} PPI hardware`).toEqual({ ppi: ok, source: "configured" });
    }
    expect(PLAUSIBLE_PPI.min).toBeLessThan(100);
    expect(PLAUSIBLE_PPI.max).toBeGreaterThan(405);
  });

  it("refuses a measurement that is itself absurd", () => {
    // A platform that answers with a garbage image size is a panel that "reports wrong", and the
    // guard has to be on the ANSWER and not only on the typed key — an 8 mm wide 15.6" panel
    // would compute 4300 PPI and shrink every target to nothing.
    const d = resolvePanelDensity({
      display: PANEL_1366,
      configured: undefined,
      physicalWidthMm: 8,
    });
    expect(d.source).toBe("assumed");
  });

  it("ADMITS the assumption when nothing answered, in the boot line (00 §5.7)", () => {
    const d = resolvePanelDensity({
      display: PANEL_1366,
      configured: undefined,
      physicalWidthMm: null,
    });
    expect(d.source).toBe("assumed");
    expect(d.ppi).toBeCloseTo(ppiFromDiagonal(PANEL_1366, REFERENCE_COUNTER_DIAGONAL_IN), 6);
    // The words matter more than the number here: being wrong about this looks exactly like
    // being right, so the line has to say which one happened and what to do about it.
    const said = describePanelDensity(d);
    expect(said).toContain("assumed");
    expect(said).toContain("RESTOS_PANEL_PPI");
    // A measured or configured panel does NOT carry the warning — a boot line that always warned
    // would be a boot line nobody reads.
    expect(describePanelDensity({ ppi: 100.5, source: "measured" })).not.toContain("ASSUMED");
  });

  it("reads the platforms that expose a physical size, and says so where none does", () => {
    // Windows is the ship target. EDID's MaxHorizontalImageSize is whole CENTIMETRES.
    expect(measurePhysicalWidthMm("win32", () => "34\r\n")).toBe(340);
    expect(
      measurePhysicalWidthMm(
        "linux",
        () =>
          "Screen 0: minimum 320 x 200, current 1920 x 1080, maximum 16384 x 16384\nHDMI-1 connected primary 1920x1080+0+0 (normal left inverted right x axis y axis) 344mm x 194mm\n   1920x1080     60.00*+\n",
      ),
    ).toBe(344);
    // macOS: checked August 2026 — `system_profiler SPDisplaysDataType -json` reports pixels and
    // a product id and NO physical size, and CGDisplayScreenSize needs a native addon. So the
    // panel genuinely "reports nothing" (00 §7) and the config key is the answer there.
    expect(measurePhysicalWidthMm("darwin", () => "irrelevant")).toBeNull();
    // A probe that is absent or refuses is a resolved state, never a crash (01-F17).
    expect(measurePhysicalWidthMm("win32", () => null)).toBeNull();
    expect(measurePhysicalWidthMm("linux", () => "no displays here")).toBeNull();
  });

  it("derives PPI from the OS's millimetres, not from a named panel", () => {
    // A 344 mm wide panel — what `xrandr` reports for a real 15.6" laptop — at each of
    // 27 §1a's two resolutions. Same glass, densities in proportion to the pixels (27-F11c).
    expect(ppiFromWidthMm(PANEL_1920, 344)).toBeCloseTo(141.77, 2);
    expect(ppiFromWidthMm(PANEL_1366, 344)).toBeCloseTo(100.86, 2);
  });
});

describe("§B the seam — the density REACHES the screen, which no reachability walk can see", () => {
  it("main resolves it and hands it to the gateway", () => {
    const index = read("main/index.ts");
    expect(index, "main must resolve the density").toContain("resolvePanelDensity");
    expect(index, "and hand it to the gateway as a getter (27-F68)").toContain(
      "panelPpi: () => panelDensity().ppi",
    );
    expect(index, "and read the OS before the config key (00 §7)").toContain(
      "measurePhysicalWidthMm",
    );
    expect(index, "00 §5.7 — the boot line says which source answered").toContain(
      "describePanelDensity",
    );
  });

  it("the gateway puts it on DeviceState, read per call rather than captured at boot", () => {
    const gateway = read("main/gateway.ts");
    expect(gateway, "DeviceState must carry the density").toContain("panelPpi: deps.panelPpi()");
    // A VALUE here instead of a call would freeze the panel the process booted on — the same
    // defect `session` was fixed for, on the field that sizes every touch target.
    expect(gateway).not.toMatch(/panelPpi:\s*deps\.panelPpi\s*[,}]/);
  });

  it("the renderer applies the conversion ONCE, above every surface (DEC-UI-001 (b))", () => {
    const app = read("renderer/App.tsx");
    expect(app, "App must import the token layer's conversion").toContain("PanelRoot");
    // Every return path is wrapped. `DEC-UI-001` (b): "applied once at the token boundary and to
    // every dp in the layout, chrome included" — and it is at the APP root rather than inside
    // AppShell because `02-F18`'s lock surface sits over the shell and would otherwise be the one
    // screen still drawn at the wrong physical size, 20–60x a shift.
    expect(app, "the counter is wrapped").toContain("panel(<Counter />)");
    expect(
      app.match(/return panel\(/g)?.length ?? 0,
      "both unlock steps are wrapped too",
    ).toBeGreaterThanOrEqual(2);
    expect(app, "and it is fed from the seam, not from a constant").toContain(
      "panelPpi ?? REFERENCE_COUNTER_PPI",
    );
  });

  it("no surface spends a dp as a CSS pixel behind the boundary's back", () => {
    // The whole ruling is that ONE element converts. A second `zoom` anywhere, or a component
    // reaching for the CSS reference density to size a control, re-opens the hole under a
    // different name — and `27-F68` (a) forbids the pinned pixel constant explicitly.
    const physical = readFileSync(`${SRC}../../../packages/ui/src/physical.tsx`, "utf8");
    expect(physical, "the conversion lives at the token boundary").toContain(
      "export const PanelRoot",
    );
    // Comments stripped before counting: this file DOCUMENTS the measurement it was chosen on
    // ("measured in Blink at `zoom: 0.628`"), and a guard that counted prose would fail on a
    // sentence rather than on a second boundary.
    const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(
      code(physical).match(/zoom:/g)?.length,
      "exactly one zoom in the package — a second boundary is two conversions",
    ).toBe(1);
    for (const file of [
      "renderer/App.tsx",
      "renderer/Counter.tsx",
      "renderer/CashSurfaces.tsx",
      "renderer/ManagerApproval.tsx",
      "renderer/OrdersSurface.tsx",
    ]) {
      expect(code(read(file)), `${file} must not open a second density boundary`).not.toContain(
        "zoom:",
      );
    }
  });
});
