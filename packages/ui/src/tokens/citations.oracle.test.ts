// ORACLE ACCEPTANCE TESTS — the numbers and FR citations the package asserts in prose.
//
// PROVENANCE: oracle session (24 §3 step 2).
//
// This package's stated virtue is "Checked, not asserted" (packages/ui/CLAUDE.md). These
// tests apply that to the claims that are currently only WRITTEN — the contrast figures in
// comments, the FR IDs cited beside them, and the one guard TOKENS.md promises CI runs.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio } from "./__oracle__/color-oracle";
import tokens from "./tokens.json" with { type: "json" };

const REPO_ROOT = new URL("../../../..", import.meta.url).pathname.replace(/\/$/, "");
const UI_ROOT = join(REPO_ROOT, "packages", "ui");
const color = tokens.color as Record<string, { value?: string; law?: string }>;
const hex = (n: string): string => {
  const v = color[n]?.value;
  if (typeof v !== "string") throw new Error(`token "${n}" is not in the manifest`);
  return v;
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      // Build artifacts are excluded for the SAME reason as the oracle files, and this was
      // the second instance of the bug: `.turbo/turbo-test.log` captures this suite's own
      // console output, so a failure message quoting "1.97:1" was being written into the
      // corpus that the next run scans. The test then reports its own previous failure as a
      // finding and can never go green. Any directory a tool writes into is not source.
      const generated = e === "node_modules" || e === "__oracle__" || e === "dist";
      return generated || e.startsWith(".") ? [] : walk(full);
    }
    return [".ts", ".tsx", ".md", ".json"].includes(extname(full)) ? [full] : [];
  });

/**
 * A SOURCE-SCANNING TEST MUST NOT SCAN ITSELF.
 *
 * Learned the hard way in this very file. The F10 and F8 checks below forbid a literal string
 * ("2.17:1", "27-F3 positional memory") appearing in package source — and then necessarily
 * quote that string themselves, in the assertion, the comment and the failure message. Left
 * in the corpus, each test finds itself and stays red no matter what the implementation does.
 * That is not a strict test; it is not a test at all, because nothing can satisfy it.
 *
 * So the oracle files are excluded here, and the exclusion is itself asserted below — a
 * silent exclusion would just move the problem from "permanently red" to "silently green".
 */
const isOracleOwned = (path: string): boolean =>
  /\.oracle\.test\.tsx?$/.test(path) || path.includes("/__oracle__/");

const ALL_FILES = walk(UI_ROOT).map((f) => relative(REPO_ROOT, f));
const PACKAGE_FILES = walk(UI_ROOT)
  .map((f) => [relative(REPO_ROOT, f), readFileSync(f, "utf8")] as const)
  .filter(([f]) => !isOracleOwned(f));

describe("a source-scanning test must not scan itself", () => {
  it("excludes the oracle files from the corpus they scan", () => {
    // The invariant, stated positively so it survives a future refactor of `walk`.
    expect(PACKAGE_FILES.filter(([f]) => isOracleOwned(f)).map(([f]) => f)).toEqual([]);
  });

  it("still scans the implementation and the non-oracle tests", () => {
    // The exclusion must be narrow. `discipline.test.ts` quoted 1.97:1 too, and that is
    // exactly the kind of stale figure F10 exists to catch — excluding all tests would have
    // hidden it.
    const scanned = PACKAGE_FILES.map(([f]) => f);
    expect(scanned).toContain("packages/ui/src/components/Tile.tsx");
    expect(scanned).toContain("packages/ui/src/components/discipline.test.ts");
    expect(scanned).toContain("packages/ui/CLAUDE.md");
  });

  it("proves the exclusion is load-bearing, not decorative", () => {
    // If the oracle files did NOT contain the forbidden literals, excluding them would be
    // pointless and this guard would be cargo cult. They do contain them — that is the whole
    // reason the exclusion exists — so assert it, and this guard fails the day someone
    // "cleans up" the exclusion because it looks unnecessary.
    const selfReferential = ALL_FILES.filter(isOracleOwned).filter((f) => {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      return src.includes("2.17:1") || src.includes("1.97:1") || /27-F3\s+positional/.test(src);
    });
    expect(selfReferential.length).toBeGreaterThan(0);
  });
});

describe("F10 — a contrast figure written in a comment must be the figure the code produces", () => {
  // Three of the five hand-written ratios in this package reproduce. Two do not, and both are
  // quoted in THREE places each (tokens.json, discipline.test.ts, the component, CLAUDE.md).
  // They are not far wrong, which is exactly why they survived: nobody re-ran them.

  it("the disabled-wash figure is 1.89:1 on the fill Tile actually uses, not 1.97:1", () => {
    // The claim, in tokens.json:82 / discipline.test.ts:23 / Tile.tsx:77 / CLAUDE.md:
    // "fgColor-muted at 0.45 measures 1.97:1". Tile's disabled background is
    // `bgColor-surface-sunken`, and against THAT the composite measures 1.89:1. 1.97 is the
    // value against pure white — a surface the disabled state never has.
    const washed = composite(hex("fgColor-muted"), hex("bgColor-surface-sunken"), 0.45);
    const measured = contrastRatio(washed, hex("bgColor-surface-sunken"));
    expect(measured).toBeCloseTo(1.89, 2);

    const stale = PACKAGE_FILES.filter(([, src]) => src.includes("1.97:1")).map(([f]) => f);
    expect(
      stale,
      `these files quote 1.97:1; the measured value is ${measured.toFixed(2)}:1`,
    ).toEqual([]);
  });

  it("the keypad-wash figure is 2.12:1, not 2.17:1", () => {
    // NumericKeypad.tsx:86 claims "An opacity wash measured 2.17:1".
    const washed = composite(hex("fgColor-default"), hex("bgColor-surface-sunken"), 0.35);
    const measured = contrastRatio(washed, hex("bgColor-surface-sunken"));
    expect(measured).toBeCloseTo(2.12, 2);

    const stale = PACKAGE_FILES.filter(([, src]) => src.includes("2.17:1")).map(([f]) => f);
    expect(
      stale,
      `these files quote 2.17:1; the measured value is ${measured.toFixed(2)}:1`,
    ).toEqual([]);
  });

  it("the three figures that DO reproduce stay reproduced", () => {
    // Pinned so a palette edit cannot silently falsify a comment that is currently true.
    expect(contrastRatio(hex("fgColor-disabled"), hex("bgColor-surface-sunken"))).toBeCloseTo(
      5.22,
      2,
    );
    expect(contrastRatio("#A56309", hex("bgColor-surface-sunken"))).toBeCloseTo(4.15, 2);
    // RE-DERIVED July 2026 under an explicit founder override of 24 §3 step 2, and the pin
    // fired correctly on its way here — it caught a real palette move rather than a drifting
    // comment. The move was 27-F64's repaint (`f7c3d34`, `404ced2`, `4f653b5`), which raised
    // amber's separation from the page from 1.53:1 to 3.16:1 because that is exactly what the
    // FR asked for. Re-pinned against the palette that repaint produced. The other two figures
    // in this test were untouched by it and still reproduce to the digit, which is the
    // evidence that this is a re-derivation and not a blanket loosening.
    expect(contrastRatio(hex("bgColor-status-abnormal"), hex("bgColor-surface"))).toBeCloseTo(
      3.16,
      2,
    );
  });
});

describe("F11 — 27-F44's check-token marker is a CI gate, not a paragraph", () => {
  // 27-F44: "any token name not in the manifest must be emitted with a `/* check-token */`
  // marker — GREPPABLE IN CI". TOKENS.md documents the marker. Nothing greps for it: the only
  // three files in the repo mentioning it are doc 27, the research note, and TOKENS.md itself.

  it("every token name referenced in source exists in the manifest or is marked", () => {
    const known = new Set(Object.keys(color).filter((k) => !k.startsWith("$")));
    const offences: string[] = [];
    for (const [file, src] of PACKAGE_FILES) {
      if (file.endsWith("tokens.json") || file.endsWith("TOKENS.md")) continue;
      for (const m of src.matchAll(/["'](bgColor-|fgColor-|borderColor-)([A-Za-z0-9-]+)["']/g)) {
        const name = `${m[1]}${m[2]}`;
        // A trailing hyphen means this is a PREFIX used in a `startsWith(...)` filter, not a
        // token reference. Five of the first run's flags were exactly that.
        if (name.endsWith("-")) continue;
        if (known.has(name)) continue;
        // The sanctioned escape hatch: name it and flag it.
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 40);
        if (after.includes("check-token")) continue;
        offences.push(`${file}: unknown token "${name}" with no /* check-token */ marker`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("ships the grep as a runnable script, so CI can actually run it", () => {
    // A guard that exists only inside a vitest file cannot be run by `pnpm verify`, which is
    // where 27-F44 says it belongs. This asserts the repo has a real entry point for it.
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const names = Object.keys(pkg.scripts ?? {});
    expect(
      names.some((n) => /check-token|tokens:check/.test(n)),
      `no check-token script in package.json; found: ${names.join(", ")}`,
    ).toBe(true);
  });
});

describe("F8 — the two FR citations that point at the wrong law", () => {
  /**
   * A GENERAL citation-consistency check was attempted and ABANDONED. Recording the attempt
   * and its measured failure rate, because the coordinator asked for one if it could be
   * devised and the honest answer is that it cannot — not this way, and not without a check
   * that understands prose.
   *
   * Method tried: pull each FR's bolded lead clause out of doc 27, take its distinctive
   * words, and require the text following a `27-FN` citation to share one.
   *
   * Result: 31 flags across the package, of which exactly ONE was a real mis-citation
   * (`27-F3 positional memory`). The other 30 were ordinary English — "27-F11d forbids",
   * "27-F57 protects", "27-F8 kitchen row" — where the words after the ID continue a
   * sentence rather than gloss the FR. Precision 3%. The same method over `tokens.json`'s
   * structured `law` fields scored 1 true positive in 7 (14%): a `law` names the token's ROLE
   * under the FR ("27-F14 amber — attention required"), which correctly shares no vocabulary
   * with the FR's lead clause ("Budget: 3 status colours + 1 interactive accent").
   *
   * A gate at that precision trains people to ignore it, which is worse than no gate. So the
   * two known mis-citations are pinned individually below. If a general check is wanted
   * later, the tractable version is a REQUIRED STRUCTURED FIELD — an explicit
   * `@fr 27-F4 <claim>` tag whose claim is reviewed once — not inference over prose.
   */

  it("27-F3 is the back/forward FR; positional memory is 27-F4", () => {
    // ItemGrid.tsx:141 reads "a scroll position is not (27-F3 positional memory)". 27-F3 is
    // "Back and forward controls are adjacent and differ only by arrow direction" — which
    // ItemGrid does not implement at all: it renders numbered page buttons and there is no
    // back/forward arrow pair anywhere in the package. The concept cited is 27-F4's.
    const offences = PACKAGE_FILES.filter(([, src]) =>
      /27-F3\s+positional|positional memory[^.]*27-F3/.test(src),
    ).map(([f]) => f);
    expect(offences, "27-F3 cited for positional memory, which is 27-F4").toEqual([]);
  });

  it("27-F4 is the grid-position contract; disabled-reason legibility is 27-F21", () => {
    // tokens.json's `fgColor-disabled` cites 27-F4 for "a disabled control still SHOWS ITS
    // REASON, so the reason must stay legible". 27-F4 is about grid position as a
    // compatibility contract and says nothing about legibility; the contrast requirement it
    // is really leaning on is 27-F21.
    const law = color["fgColor-disabled"]?.law ?? "";
    expect(law, `fgColor-disabled cites: ${law.slice(0, 60)}`).toMatch(/27-F21/);
  });
});
