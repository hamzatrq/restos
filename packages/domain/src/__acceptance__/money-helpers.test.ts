// Acceptance tests — T-01-13 money arithmetic safety (DEC-MONEY-005).
// Authored from spec text only (24 §3 step 2; read-only to the implementing session):
//   00 §6  — money = integer paisas; rates are integer BASIS POINTS (1700 = 17%), never a float
//            literal; any operation that divides or scales money goes through a `domain` helper
//            with an explicit stated rounding policy whose parts provably sum back to the total.
//   18 §4  — raw `number` arithmetic on money is banned, backed by a LINT RULE ("banned by
//            convention + review" is not enforcement); division/scaling only via the domain
//            rounding-policy helpers (`splitPaisa`, `applyRateBps`).
//   specs/DECISIONS.md DEC-MONEY-005 (the proposal column is the contract for this task) +
//   plans/wave-0/kernel-tasks.md T-01-13.
//
// Pinned policies (chosen by this oracle where the contract left the choice open):
//   * splitPaisa(total, n): LARGEST-REMAINDER, FIRST PARTS — with q = floor(total / n) and
//     r = total % n, parts[i] = q + 1 for i < r, else q. Deterministic, order-stable,
//     max − min ≤ 1, and Σ parts == total exactly (no rounding leak).
//   * applyRateBps(amount, bps): ROUND-HALF-UP — result = floor((amount·bps + 5000) / 10000),
//     computed integer-exactly (no float path). Chosen over round-half-to-even: a cashier or a
//     customer can re-check a receipt line by hand ("point five rounds up"), and the drift
//     backstop is the Auditor's 01-F30 conservation check, not statistical tie bias. Amounts
//     are non-negative (paisa brand), so half-up == ties-away-from-zero: no signed ambiguity.
//   * bps has NO upper cap: 10000 (100%) is not a ceiling — markups above 100% are legal.
//     Non-integer, negative, NaN, ±Infinity and unsafe-integer inputs are rejected loudly on
//     EVERY argument of both helpers, brand or no brand (brands are compile-time only, 18 §4).
//   * Overflow (a result that would exceed Number.MAX_SAFE_INTEGER) throws — the sumPaisa
//     idiom — and never returns a silently drifted double.
//
// RED/GREEN at authoring time: every helper test is RED ("not a function" — the helpers do not
// exist yet). Lint: "mechanism anchor" and "helper path lints clean" are GREEN; the three raw-
// arithmetic fixtures and the config-surface pin are RED until the DEC-MONEY-005 rule lands in
// the shared biome config (packages/config/biome.json — the config `pnpm lint` resolves).
//
// Notes for the implementing session:
//   * There is NO float-drift sentinel for splitPaisa: for any safe-integer total and positive
//     safe n, Math.floor(total / n) is provably exact (q < 2^53/n implies ulp(q) ≤ 2/n, so
//     rounding of total/n can never cross the q+1 boundary; adversarially scanned, 0 hits).
//     The exact-rule property below is the division pin.
//   * applyRateBps is the opposite: amount·bps routinely exceeds 2^53 and the naive
//     Math.round(amount * bps / 10000) is off by one on every pinned sentinel — the rounding
//     must be computed integer-exactly (e.g. BigInt), as sumPaisa already does.
//   * The lint fixtures are linted OUTSIDE the repo tree on purpose (a fixture that violates
//     the future rule must never be able to break root `pnpm lint` if a run is interrupted);
//     biome resolves the repo config from cwd, verified against a recommended-preset rule by
//     the mechanism anchor. If the plugin mechanism turns out not to fire on out-of-tree
//     paths, that is a finding for this test-owning session, not a license to weaken the pin.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as domain from "../index.js";

type Paisa = domain.Paisa;
const { paisa, sumPaisa } = domain;

// The T-01-13 surface under test. Named exports from the package root — 18 §4 names both
// helpers. Cast through a local structural type so typecheck stays green while the surface is
// unbuilt (the fold-scoping oracle idiom); each call fails loudly as "not a function" until
// the implementation lands.
type MoneyHelpers = {
  splitPaisa(total: Paisa, n: number): Paisa[];
  applyRateBps(amount: Paisa, bps: number): Paisa;
};
const { splitPaisa, applyRateBps } = domain as unknown as MoneyHelpers;

/** Float-free reference for the pinned remainder rule (exact: total % n and the subtraction
 *  are exact on safe integers, and (total − r) / n is an exactly-representable integer). */
const largestRemainderParts = (total: number, n: number): number[] => {
  const r = total % n;
  const q = (total - r) / n;
  return Array.from({ length: n }, (_, i) => (i < r ? q + 1 : q));
};

const BAD_NUMBERS = [1.5, -1, Number.NaN, Infinity, -Infinity, 2 ** 53] as const;

describe("splitPaisa — integer split with a pinned remainder rule (00 §6 / DEC-MONEY-005)", () => {
  it("00 §6 / DEC-MONEY-005: pinned rule — the first (total % n) parts get one extra paisa", () => {
    expect([...splitPaisa(paisa(100), 3)]).toEqual([34, 33, 33]);
    expect([...splitPaisa(paisa(10), 4)]).toEqual([3, 3, 2, 2]);
    expect([...splitPaisa(paisa(7), 7)]).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect([...splitPaisa(paisa(2), 5)]).toEqual([1, 1, 0, 0, 0]);
    expect([...splitPaisa(paisa(0), 3)]).toEqual([0, 0, 0]);
    expect([...splitPaisa(paisa(5), 1)]).toEqual([5]);
  });

  it("00 §6 / DEC-MONEY-005: parts sum EXACTLY to the total and follow the pinned rule (property)", () => {
    fc.assert(
      fc.property(fc.maxSafeNat(), fc.integer({ min: 1, max: 200 }), (total, n) => {
        const parts = splitPaisa(paisa(total), n);
        expect(parts).toHaveLength(n);
        for (const p of parts) {
          expect(paisa(p), "every part is a valid non-negative integer paisa").toBe(p);
        }
        expect(sumPaisa(parts), "no rounding leak: parts reassemble the total").toBe(total);
        expect([...parts]).toEqual(largestRemainderParts(total, n));
      }),
      { numRuns: 30 },
    );
  });

  it("00 §6 / DEC-MONEY-005: exact at the 2^53 boundary (BigInt-safe where sumPaisa already is)", () => {
    const total = Number.MAX_SAFE_INTEGER;
    for (const n of [1, 2, 3, 7, 199]) {
      const parts = splitPaisa(paisa(total), n);
      expect(parts).toHaveLength(n);
      let sum = 0n;
      for (const p of parts) sum += BigInt(p);
      expect(sum, `n=${n}: bigint-exact reassembly at the boundary`).toBe(BigInt(total));
      expect([...parts]).toEqual(largestRemainderParts(total, n));
    }
  });

  it("00 §6 / DEC-MONEY-005: rejects a non-positive, fractional, or unsafe part count loudly", () => {
    expect([...splitPaisa(paisa(10), 2)]).toEqual([5, 5]); // anchors the rejection cases
    for (const bad of [0, ...BAD_NUMBERS]) {
      expect(() => splitPaisa(paisa(10), bad), `n=${bad} must throw`).toThrow();
    }
  });

  it("00 §6 / DEC-MONEY-005: rejects a non-integer, negative, or unsafe total loudly (a brand bypass does not slip through)", () => {
    expect([...splitPaisa(paisa(9), 2)]).toEqual([5, 4]); // anchors the rejection cases
    for (const bad of BAD_NUMBERS) {
      expect(() => splitPaisa(bad as Paisa, 2), `total=${bad} must throw`).toThrow();
    }
  });
});

describe("applyRateBps — integer basis points with pinned round-half-up (00 §6 / DEC-MONEY-005)", () => {
  it("00 §6 / DEC-MONEY-005: pinned policy — an exact half paisa always rounds UP (distinguishes half-up from half-to-even)", () => {
    expect(applyRateBps(paisa(50), 100)).toBe(1); // 0.5  → 1 (half-to-even would give 0)
    expect(applyRateBps(paisa(250), 100)).toBe(3); // 2.5  → 3 (half-to-even would give 2)
    expect(applyRateBps(paisa(25), 100)).toBe(0); // 0.25 → 0
    expect(applyRateBps(paisa(75), 100)).toBe(1); // 0.75 → 1
    expect(applyRateBps(paisa(150), 100)).toBe(2); // 1.5  → 2 (both policies agree; brackets the ties)
  });

  it("00 §6 / DEC-MONEY-005: 1700 bps is 17%; 10000 bps is identity; zero annihilates", () => {
    expect(applyRateBps(paisa(10000), 1700)).toBe(1700);
    expect(applyRateBps(paisa(11750), 1700)).toBe(1998); // 1997.5 → half-up 1998
    expect(applyRateBps(paisa(123456), 10000)).toBe(123456);
    expect(applyRateBps(paisa(0), 1700)).toBe(0);
    expect(applyRateBps(paisa(123456), 0)).toBe(0);
  });

  it("00 §6 / DEC-MONEY-005: rates above 100% are legal — bps carries no 10000 cap", () => {
    expect(applyRateBps(paisa(100), 20000)).toBe(200);
    expect(applyRateBps(paisa(3), 15000)).toBe(5); // 4.5 → half-up 5
  });

  it("00 §6 / DEC-MONEY-005: equals the integer-exact half-up reference and sits within half a paisa of the exact rational (property)", () => {
    fc.assert(
      fc.property(fc.maxSafeNat(), fc.integer({ min: 0, max: 30000 }), (amount, bps) => {
        // floor((a·b + 5000) / 10000) == round-half-up for non-negative a, b — computed float-free.
        const exact = (BigInt(amount) * BigInt(bps) + 5000n) / 10000n;
        if (exact > BigInt(Number.MAX_SAFE_INTEGER)) {
          expect(
            () => applyRateBps(paisa(amount), bps),
            "overflow is loud, never a drifted number",
          ).toThrow();
          return;
        }
        const result = applyRateBps(paisa(amount), bps);
        expect(paisa(result), "result is always a valid integer paisa").toBe(result);
        expect(BigInt(result), "the pinned half-up policy, integer-exact").toBe(exact);
        // No-float-drift bound: |10000·result − amount·bps| ≤ 5000 ⇒ within half a paisa of
        // the exact rational (well inside the contract's ±1 paisa bound).
        const distance = 10000n * BigInt(result) - BigInt(amount) * BigInt(bps);
        expect(distance <= 5000n && distance >= -5000n).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it("00 §6 / DEC-MONEY-005: float-drift sentinels — inputs where Math.round(amount * bps / 10000) is off by one", () => {
    // Expected values are the integer-exact half-up reference; the naive float path misses
    // every one by exactly 1 paisa (amount·bps > 2^53 loses integer resolution).
    expect(applyRateBps(paisa(9007199254740991), 1700)).toBe(1531223873305968); // float: …969
    expect(applyRateBps(paisa(9007199254740969), 500)).toBe(450359962737048); // float: …049
    expect(applyRateBps(paisa(9007199254740991), 9999)).toBe(9006298534815517); // float: …516
    expect(applyRateBps(paisa(9007199254738333), 3)).toBe(2702159776421); // float: …422
  });

  it("00 §6 / DEC-MONEY-005: a result beyond 2^53 throws loudly rather than drifting (sumPaisa overflow idiom)", () => {
    // Anchors: identity at the boundary is exact and legal.
    expect(applyRateBps(paisa(Number.MAX_SAFE_INTEGER), 10000)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => applyRateBps(paisa(Number.MAX_SAFE_INTEGER), 10001)).toThrow();
    expect(() => applyRateBps(paisa(Number.MAX_SAFE_INTEGER), 20000)).toThrow();
  });

  it("00 §6 / DEC-MONEY-005: rejects non-integer, negative, or unsafe amounts and bps loudly", () => {
    expect(applyRateBps(paisa(100), 1700)).toBe(17); // anchors the rejection cases
    for (const bad of BAD_NUMBERS) {
      expect(() => applyRateBps(bad as Paisa, 1700), `amount=${bad} must throw`).toThrow();
      expect(() => applyRateBps(paisa(100), bad), `bps=${bad} must throw`).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Lint enforcement of the raw-money-arithmetic ban (18 §4 / DEC-MONEY-005).
// `pnpm lint` = `biome check .` resolving the shared config; these pins drive the same biome
// binary with the same repo config (cwd = repo root) against fixtures written OUTSIDE the
// repo tree, so an interrupted run can never leave a rule-violating file inside the tree.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const BIOME_BIN = join(REPO_ROOT, "node_modules/.bin/biome");

const lintSource = (source: string): { exitCode: number; output: string } => {
  if (!existsSync(BIOME_BIN)) {
    throw new Error(`biome binary not found at ${BIOME_BIN} — cannot pin the lint gate`);
  }
  const dir = mkdtempSync(join(tmpdir(), "restos-money-lint-"));
  const file = join(dir, "money-lint-fixture.ts");
  try {
    writeFileSync(file, source);
    const run = spawnSync(BIOME_BIN, ["lint", file], { cwd: REPO_ROOT, encoding: "utf8" });
    if (run.error) throw run.error;
    return { exitCode: run.status ?? -1, output: `${run.stdout}\n${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

type BiomeConfigLike = { extends?: string[]; plugins?: string[] };

describe("lint enforcement — raw arithmetic on money is banned (18 §4 / DEC-MONEY-005)", () => {
  it("mechanism anchor (GREEN): biome with the repo config flags a rule violation in an out-of-tree fixture", () => {
    const { exitCode, output } = lintSource(
      "export const f = (): number => {\n  debugger;\n  return 1;\n};\n",
    );
    expect(exitCode, "the lint channel these pins rely on must itself work").not.toBe(0);
    expect(output).toContain("noDebugger");
  });

  it("18 §4 / DEC-MONEY-005 (GREEN, must stay green): money flowing through the domain helpers lints clean — the ban must never flag the blessed path", () => {
    const { exitCode } = lintSource(
      [
        'import { applyRateBps, paisa, splitPaisa } from "@restos/domain";',
        "",
        "export const shares = splitPaisa(paisa(10000), 3);",
        "export const tax = applyRateBps(paisa(10000), 1700);",
        "",
      ].join("\n"),
    );
    expect(exitCode).toBe(0);
  });

  it("18 §4 / DEC-MONEY-005: raw DIVISION on a money value fails the lint gate", () => {
    const { exitCode } = lintSource(
      "export const perGuest = (total_paisa: number, guests: number): number => total_paisa / guests;\n",
    );
    expect(
      exitCode,
      "convention is not enforcement — split without splitPaisa must not lint",
    ).not.toBe(0);
  });

  it("18 §4 / DEC-MONEY-005: raw RATE MULTIPLICATION on a money value fails the lint gate", () => {
    const { exitCode } = lintSource(
      "export const withTax = (amountPaisa: number): number => amountPaisa * 1.17;\n",
    );
    expect(exitCode, "a float rate literal on money must not lint").not.toBe(0);
  });

  it("18 §4 / DEC-MONEY-005: raw ADDITION/SUBTRACTION on money values fails the lint gate (addPaisa/subPaisa are the blessed path)", () => {
    const { exitCode } = lintSource(
      "export const owed = (billPaisa: number, paidPaisa: number): number => billPaisa - paidPaisa;\n",
    );
    expect(exitCode, "18 §4 bans raw number arithmetic on money categorically").not.toBe(0);
  });

  it("18 §4 / DEC-MONEY-005: the biome config `pnpm lint` resolves declares a money-arithmetic lint plugin", () => {
    const root = JSON.parse(readFileSync(join(REPO_ROOT, "biome.json"), "utf8")) as BiomeConfigLike;
    const configs: Array<{ dir: string; config: BiomeConfigLike }> = [
      { dir: REPO_ROOT, config: root },
    ];
    for (const rel of root.extends ?? []) {
      const p = resolve(REPO_ROOT, rel);
      configs.push({
        dir: dirname(p),
        config: JSON.parse(readFileSync(p, "utf8")) as BiomeConfigLike,
      });
    }
    const declared = configs.flatMap(({ dir, config }) =>
      (config.plugins ?? []).map((rel) => resolve(dir, rel)),
    );
    expect(
      declared.length,
      "DEC-MONEY-005: the ban lives in the lint config, not in convention",
    ).toBeGreaterThan(0);
    const moneyPlugins = declared.filter(
      (p) => existsSync(p) && /paisa|money/i.test(readFileSync(p, "utf8")),
    );
    expect(
      moneyPlugins.length,
      "at least one declared plugin bans money arithmetic",
    ).toBeGreaterThan(0);
  });
});
