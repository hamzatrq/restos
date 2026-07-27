// Acceptance tests — oracle review F1: the DEC-MONEY-005 money-arithmetic ban must reach
// RUPEE-named values, not only paisa-named ones.
//
// Authored from spec text + the fix-round decision only (24 §3 step 2; read-only to the
// implementing session):
//   00 §6              — money = integer paisas; no module may divide or scale money inline.
//   18 §4              — raw `number` arithmetic on money is banned, backed by a LINT RULE
//                        ("banned by convention + review" is not enforcement).
//   DEC-MONEY-005      — division and rates are where floats enter a money system.
//
// THE FINDING THIS PINS. `rupeesFromPaisa` (money.ts:109) returns a field named `rupees`.
// The shipped rule matches on the NAME — `[Pp]aisa` as a bare identifier or a member
// property — so every arithmetic operation on that field is invisible to it. Measured
// against the shipped rule: the paisa-named control group produced 4 diagnostics from 4
// expressions; the identical operations on `rupees` produced 0 from 7, including
// `rupees * 1.17` (a float tax rate on money) and `running += rupees` (accumulating money
// in a double). Both are precisely what DEC-MONEY-005 exists to stop. The helper written
// to satisfy the ban became the shortest way around it.
//
// The cases live in `__fixtures__/rupee-arithmetic.fixture.txt` rather than inline, so the
// legal/illegal boundary reads as one document and a new case needs no test edit. The
// fixture carries a `.txt` extension deliberately: it contains deliberately-illegal code,
// and biome's `files.ignoreUnknown` keeps it out of the repo's own lint run.
//
// RED/GREEN at authoring time (measured, see the report accompanying this round):
//   RED   — every FLAG case whose operand is rupee-named (the shipped rule matches none).
//   GREEN — the FLAG cases marked REGRESSION (shipped paisa coverage, must survive the
//           extension), every CLEAN control, and both GAP cases.
//
// Harness: the `fold-brand-lint.test.ts` idiom, unchanged — the same biome binary with the
// same repo config (cwd = repo root), driven against fixtures written OUTSIDE the repo tree
// so an interrupted run can never leave a rule-violating file inside it. This suite asserts
// on the rule's DIAGNOSTIC MESSAGE rather than on the exit code, which is strictly stronger:
// an exit-code check goes green when any unrelated rule fires, and the CLEAN controls in
// particular must not be satisfiable by a stray `noUnusedVariables`.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const BIOME_BIN = join(REPO_ROOT, "node_modules/.bin/biome");
const FIXTURE = join(HERE, "__fixtures__/rupee-arithmetic.fixture.txt");

/** The rule's own diagnostic text (no-raw-money-arithmetic.grit). */
const BAN = "Raw arithmetic on a money value is banned";

const lintSource = (source: string): { exitCode: number; output: string; banned: boolean } => {
  if (!existsSync(BIOME_BIN)) {
    throw new Error(`biome binary not found at ${BIOME_BIN} — cannot pin the lint gate`);
  }
  const dir = mkdtempSync(join(tmpdir(), "restos-rupee-lint-"));
  const file = join(dir, "rupee-fixture.ts");
  try {
    writeFileSync(file, source);
    const run = spawnSync(BIOME_BIN, ["lint", file], { cwd: REPO_ROOT, encoding: "utf8" });
    if (run.error) throw run.error;
    const output = `${run.stdout}\n${run.stderr}`;
    return { exitCode: run.status ?? -1, output, banned: output.includes(BAN) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

type Verdict = "FLAG" | "CLEAN" | "GAP" | "NOTE";
type Case = { verdict: Verdict; label: string; source: string };

/** Sections are `#=== VERDICT | label`, body running to the next header. */
const parseFixture = (): Case[] => {
  const text = readFileSync(FIXTURE, "utf8");
  const cases: Case[] = [];
  let current: Case | null = null;
  for (const line of text.split("\n")) {
    const header = /^#===\s*(FLAG|CLEAN|GAP|NOTE)\s*\|\s*(.+?)\s*$/.exec(line);
    if (header) {
      if (current) cases.push(current);
      current = { verdict: header[1] as Verdict, label: header[2] as string, source: "" };
    } else if (current) {
      current.source += `${line}\n`;
    }
  }
  if (current) cases.push(current);
  return cases.filter((c) => c.verdict !== "NOTE");
};

const CASES = parseFixture();
const of = (verdict: Verdict) => CASES.filter((c) => c.verdict === verdict);

describe("F1 — the money-arithmetic ban reaches RUPEE values (18 §4 / DEC-MONEY-005)", () => {
  it("mechanism anchor (GREEN): biome with the repo config flags a rule violation in an out-of-tree fixture", () => {
    const { exitCode, output } = lintSource(
      "export const f = (): number => {\n  debugger;\n  return 1;\n};\n",
    );
    expect(exitCode, "the lint channel these pins rely on must itself work").not.toBe(0);
    expect(output).toContain("noDebugger");
  });

  it("the fixture parses and carries cases of every verdict", () => {
    expect(of("FLAG").length, "FLAG cases").toBeGreaterThanOrEqual(17);
    expect(of("CLEAN").length, "CLEAN controls").toBeGreaterThanOrEqual(9);
    expect(of("GAP").length, "recorded gaps").toBeGreaterThanOrEqual(2);
    for (const c of CASES) {
      expect(c.source.trim(), `fixture case "${c.label}" has an empty body`).not.toBe("");
    }
  });

  // -------------------------------------------------------------------------
  // The missing class (RED for every rupee-named case).
  // -------------------------------------------------------------------------

  it("every FLAG case is reported by the ban", () => {
    for (const { label, source } of of("FLAG")) {
      const { banned, output } = lintSource(source);
      expect
        .soft(banned, `FLAG "${label}" must be reported by the money ban.\n${output}`)
        .toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // False-positive controls (GREEN, must stay green). A rule that cries wolf gets
  // suppressed — strictly worse than the gap it closes. Asserting on the ban's own
  // message, not the exit code, so an unrelated diagnostic cannot fake a pass here.
  // -------------------------------------------------------------------------

  it("every CLEAN control is left alone by the ban", () => {
    for (const { label, source } of of("CLEAN")) {
      const { banned, output } = lintSource(source);
      expect
        .soft(banned, `CLEAN "${label}" must NOT be reported by the money ban.\n${output}`)
        .toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Recorded limitations. These document that a name-based rule cannot survive a
  // rename; see the NOTE section of the fixture. If a future session closes one,
  // the fix is to INVERT this assertion — deleting the case would erase the record
  // that the limitation was known and accepted (24 §3 step 2: the test-owning
  // session's call, not the implementer's).
  // -------------------------------------------------------------------------

  it("GAP cases stay clean — a name-based ban cannot see a renamed value, and that is recorded, not hidden", () => {
    for (const { label, source } of of("GAP")) {
      const { banned } = lintSource(source);
      expect.soft(banned, `GAP "${label}" changed verdict — update the fixture NOTE`).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // The extension must not break the code that legitimately handles rupees today.
  // GREEN now, and the point is that it stays green: MoneyValue.tsx reads `rupees`
  // on every render, and money.ts is where the divide lives.
  // -------------------------------------------------------------------------

  it("GREEN REGRESSION GUARD: the shipped money and display sources still lint clean under the extended ban", () => {
    const shipped = [
      "packages/domain/src/money.ts",
      "packages/domain/src/invariants.ts",
      "packages/ui/src/components/MoneyValue.tsx",
    ];
    for (const rel of shipped) {
      const run = spawnSync(BIOME_BIN, ["lint", join(REPO_ROOT, rel)], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      });
      const output = `${run.stdout}\n${run.stderr}`;
      expect
        .soft(output.includes(BAN), `${rel} must not trip the money ban:\n${output}`)
        .toBe(false);
    }
  });
});
