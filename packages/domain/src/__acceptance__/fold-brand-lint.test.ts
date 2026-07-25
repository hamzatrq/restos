// Acceptance tests — T-01-22 fold-brand migration, LINT half (DEC-MONEY-005 fold clause).
// Authored from spec text + the task plan only (24 §3 step 2; read-only to the implementing
// session):
//   00 §6   — money = integer paisas; any operation that divides or scales money goes through a
//             `domain` helper with a stated rounding policy. A double past 2^53 is not an
//             integer, so "integer paisas" is a claim the arithmetic has to keep.
//   18 §4   — raw `number` arithmetic on money is banned, backed by a LINT RULE ("banned by
//             convention + review" is not enforcement).
//   DECISIONS.md DEC-MONEY-005 — T-01-13 landed the helpers and the BARE-IDENTIFIER ban; the
//             **fold-brand clause is the deferred part**, and it is what this file pins.
//   plans/wave-0/t-01-22-fold-brand.md — the honest framing: there is NO live overflow or
//             precision defect in the shipped fold (it does only `+` and `×` on integers whose
//             totals sit far below 2^53). The finding is a GUARD GAP. The fold plane sits
//             outside the rule's enforcement surface in BOTH directions:
//               payTotal += m.amount_paisa as number
//                 ^ LHS name has no "paisa"      ^ RHS is a member expression
//             and doc 16 (tax), doc 17 (discounts) and 02 split-bill introduce division and
//             rates into exactly these accumulators. The first `* 0.17` or `/ n` written into
//             folds/merge.ts is silently legal today.
//
// WHAT THIS FILE PINS: the missing class — raw arithmetic where an operand is a money-typed
// MEMBER expression (`m.amount_paisa`, `cell.unit_price_paisa`, `p.total_paisa`) is a lint
// violation. Plus the false-positive controls that keep the extended rule from crying wolf: a
// rule that fires on `row.qty * row.count` or on `m.amount_paisa < floor` gets suppressed, which
// is worse than the gap it closes.
//
// RED/GREEN at authoring time:
//   RED   — every "member expression" violation case (the shipped rule matches none of them).
//   GREEN — the mechanism anchor, and every must-stay-green control (blessed helper path,
//           non-money member arithmetic, comparison operators, plain assignment).
//
// Harness: identical to the T-01-13 pins in money-helpers.test.ts — the same biome binary with
// the same repo config (cwd = repo root), driven against fixtures written OUTSIDE the repo tree
// so an interrupted run can never leave a rule-violating file inside it. Do not invent a new
// harness for this; if the plugin mechanism stops firing on out-of-tree paths that is a finding
// for this test-owning session, not a license to weaken a pin.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const BIOME_BIN = join(REPO_ROOT, "node_modules/.bin/biome");

const lintSource = (source: string): { exitCode: number; output: string } => {
  if (!existsSync(BIOME_BIN)) {
    throw new Error(`biome binary not found at ${BIOME_BIN} — cannot pin the lint gate`);
  }
  const dir = mkdtempSync(join(tmpdir(), "restos-fold-brand-lint-"));
  const file = join(dir, "fold-brand-fixture.ts");
  try {
    writeFileSync(file, source);
    const run = spawnSync(BIOME_BIN, ["lint", file], { cwd: REPO_ROOT, encoding: "utf8" });
    if (run.error) throw run.error;
    return { exitCode: run.status ?? -1, output: `${run.stdout}\n${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const src = (...lines: string[]): string => `${lines.join("\n")}\n`;

describe("T-01-22 lint gate — the money-arithmetic ban reaches the FOLD plane (18 §4 / DEC-MONEY-005)", () => {
  it("mechanism anchor (GREEN): biome with the repo config flags a rule violation in an out-of-tree fixture", () => {
    const { exitCode, output } = lintSource(
      src("export const f = (): number => {", "  debugger;", "  return 1;", "};"),
    );
    expect(exitCode, "the lint channel these pins rely on must itself work").not.toBe(0);
    expect(output).toContain("noDebugger");
  });

  // -------------------------------------------------------------------------
  // The missing class (RED). DEC-MONEY-005's thesis is that division and rates
  // are where floats enter; the fold accumulators are precisely where doc 16 /
  // doc 17 / 02 split-bill will write them, and today nothing there is guarded.
  // -------------------------------------------------------------------------

  it("18 §4 / DEC-MONEY-005 (fold clause): BINARY arithmetic on a money MEMBER expression fails the lint gate", () => {
    const cases: Array<{ what: string; source: string }> = [
      {
        what: "subtraction of two money members",
        source: src(
          "type M = { amount_paisa: number };",
          "export const owed = (a: M, b: M): number => a.amount_paisa - b.amount_paisa;",
        ),
      },
      {
        what: "addition of a money member into a plain number",
        source: src(
          "type M = { amount_paisa: number };",
          "export const withTip = (m: M, tip: number): number => m.amount_paisa + tip;",
        ),
      },
      {
        what: "DIVISION of a money member (split-bill, doc 02 — splitPaisa is the blessed path)",
        source: src(
          "type P = { total_paisa: number };",
          "export const perGuest = (p: P, guests: number): number => p.total_paisa / guests;",
        ),
      },
      {
        what: "FLOAT RATE on a money member (tax, doc 16 — applyRateBps is the blessed path)",
        source: src(
          "type M = { amount_paisa: number };",
          "export const withTax = (m: M): number => m.amount_paisa * 1.17;",
        ),
      },
      {
        what: "modulo on a money member",
        source: src(
          "type P = { total_paisa: number };",
          "export const remainder = (p: P, n: number): number => p.total_paisa % n;",
        ),
      },
    ];
    for (const { what, source } of cases) {
      const { exitCode } = lintSource(source);
      expect
        .soft(exitCode, `${what}: the fold plane is inside the ban (DEC-MONEY-005 fold clause)`)
        .not.toBe(0);
    }
  });

  it("18 §4 / DEC-MONEY-005 (fold clause): the shipped `billedCellPaisa` idiom — qty × unit_price on a member expression — fails the lint gate", () => {
    // folds/merge.ts:195 verbatim in shape. Line VALUE fields are money the same way
    // payment amounts are (00 §6); a rate or a discount written here is the doc-17 case.
    const { exitCode } = lintSource(
      src(
        "type Cell = { qty: number; unit_price_paisa: number };",
        "export const billed = (cell: Cell): number => cell.qty * cell.unit_price_paisa;",
      ),
    );
    expect(exitCode, "the line-value money plane is inside the ban too").not.toBe(0);
  });

  it("18 §4 / DEC-MONEY-005 (fold clause): COMPOUND assignment whose RHS is a money MEMBER expression fails the lint gate — this is the shipped accumulator idiom", () => {
    // folds/merge.ts:646/647/657 verbatim in shape. Both the plain form and the
    // `as number` form are pinned: the cast wraps the member expression in a
    // TsAsExpression, and a member-only pattern that forgets it closes nothing —
    // every shipped occurrence carries the cast.
    const cases: Array<{ what: string; statement: string }> = [
      { what: "plain member RHS", statement: "total += m.amount_paisa;" },
      {
        what: "member RHS behind an `as number` cast",
        statement: "total += m.amount_paisa as number;",
      },
      { what: "subtractive accumulation", statement: "total -= m.amount_paisa;" },
      { what: "scaling accumulation", statement: "total *= m.amount_paisa;" },
      { what: "dividing accumulation", statement: "total /= m.amount_paisa;" },
    ];
    for (const { what, statement } of cases) {
      const { exitCode } = lintSource(
        src(
          "type M = { amount_paisa: number };",
          "export const accumulate = (members: readonly M[]): number => {",
          "  let total = 0;",
          "  for (const m of members) {",
          `    ${statement}`,
          "  }",
          "  return total;",
          "};",
        ),
      );
      expect
        .soft(exitCode, `${what}: accumulation is the idiom the ban exists for (DEC-MONEY-005)`)
        .not.toBe(0);
    }
  });

  it("18 §4 / DEC-MONEY-005 (fold clause): a money member expression read out of an `unknown`-typed payload map still fails the lint gate", () => {
    // The fold's members are Record<string, unknown>, so every read is a cast. The ban
    // must key on the money NAME, not on a resolved type the linter cannot see.
    const { exitCode } = lintSource(
      src(
        "export const total = (members: readonly Record<string, unknown>[]): number => {",
        "  let sum = 0;",
        "  for (const m of members) {",
        "    sum = sum + (m.amount_paisa as number);",
        "  }",
        "  return sum;",
        "};",
      ),
    );
    expect(exitCode, "an untyped payload read is still a money read (00 §6)").not.toBe(0);
  });

  // -------------------------------------------------------------------------
  // False-positive controls (GREEN, must stay green). A rule that cries wolf gets
  // suppressed — which is strictly worse than the gap it closes. The extension is
  // scoped to ARITHMETIC on a MONEY-NAMED member; everything below stays legal.
  // -------------------------------------------------------------------------

  it("18 §4 (GREEN, must stay green): arithmetic on NON-money member expressions lints clean — the extension stays scoped to money names", () => {
    const { exitCode, output } = lintSource(
      src(
        "type Row = { qty: number; count: number; lamport_seq: number; states: string[] };",
        "export const spread = (a: Row, b: Row): number => {",
        "  const gap = a.lamport_seq - b.lamport_seq;",
        "  const volume = a.qty * b.count;",
        "  const heads = a.states.length - 1;",
        "  return gap + volume + heads;",
        "};",
      ),
    );
    expect(exitCode, `non-money member arithmetic must lint clean:\n${output}`).toBe(0);
  });

  it("18 §4 (GREEN, must stay green): COMPARISON and plain assignment on a money member lint clean — only arithmetic is banned", () => {
    // folds/merge.ts:691 (`if (amount < floor)`) and :745 (`snap > ceiling`) are the
    // 01-F29 cap witness and the 01-F33 ceiling check. Both are set predicates, not
    // arithmetic; a rule that banned them would break money code it is meant to protect.
    const { exitCode, output } = lintSource(
      src(
        "type M = { amount_paisa: number };",
        "export const lowest = (members: readonly M[]): number => {",
        "  let floor = Number.POSITIVE_INFINITY;",
        "  for (const m of members) {",
        "    if (m.amount_paisa < floor) {",
        "      floor = m.amount_paisa;",
        "    }",
        "  }",
        "  return floor;",
        "};",
      ),
    );
    expect(exitCode, `comparison/assignment on money must stay legal:\n${output}`).toBe(0);
  });

  it("18 §4 / DEC-MONEY-005 (GREEN, must stay green): money members routed THROUGH the domain helpers lint clean — the ban must never flag the blessed path", () => {
    const { exitCode, output } = lintSource(
      src(
        'import { addPaisa, applyRateBps, paisa, splitPaisa, sumPaisa } from "@restos/domain";',
        "",
        "type M = { amount_paisa: number };",
        "",
        "export const total = (members: readonly M[]) => sumPaisa(members.map((m) => paisa(m.amount_paisa)));",
        "export const pair = (a: M, b: M) => addPaisa(paisa(a.amount_paisa), paisa(b.amount_paisa));",
        "export const shares = (m: M, guests: number) => splitPaisa(paisa(m.amount_paisa), guests);",
        "export const tax = (m: M) => applyRateBps(paisa(m.amount_paisa), 1700);",
      ),
    );
    expect(exitCode, `the blessed helper path must lint clean:\n${output}`).toBe(0);
  });

  it("18 §4 (GREEN, must stay green): money-named STRING keys and ids lint clean — only VALUES are money, keys are not", () => {
    // t-01-22 trap: attempt ids, order ids and line ids are strings and stay strings.
    // Nothing here is money arithmetic; string concatenation of an id must not fire.
    const { exitCode, output } = lintSource(
      src(
        "type M = { settlement_attempt_id: string; payment_attempt_id: string };",
        "export const joined = (m: M): string => m.settlement_attempt_id + m.payment_attempt_id;",
        "export const parent = (m: M): string => m.payment_attempt_id.slice(0, 8);",
      ),
    );
    expect(exitCode, `id keys are not money:\n${output}`).toBe(0);
  });
});
