/**
 * **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2, `20 §4.3` separation rule). Sources read:
 * `specs/DECISIONS.md` (`DEC-ARCH-001`, in full), `specs/18-engineering-handbook.md` §2 (the
 * dependency-direction MUST and the outbox-core extraction rule) plus §3/§5,
 * `specs/23-ai-context.md` (`23-F5`), `specs/20-testing-correctness.md` §4.2/§4.4,
 * `scripts/check-seams.mjs` (how `@restos/*` is resolved by the rail), and the current state of
 * the three importers. **No plan for this move was opened and no `packages/auditor` exists at
 * authoring time.**
 *
 * ═══ WHAT THIS FILE IS FOR ════════════════════════════════════════════════════════════════════
 *
 * `18 §2`, quoted exactly: *"**Dependency direction (MUST):** `apps → packages`,
 * `services → packages`, `packages → packages` (acyclic; `domain` imports no internal package).
 * Apps NEVER import services or other apps; services NEVER import apps. Cross-module calls go
 * through tRPC/events, **never through direct imports across service boundaries**."*
 * `services → services` is on neither list, and `services/jobs` currently imports `runAuditor` and
 * `redactedDsn` out of `services/sync-gateway` through a two-entry `exports` map.
 *
 * `DEC-ARCH-001` (RULED, founder, August 2026) closes it with **(B)**: *"move `auditor.ts` into
 * `packages/auditor`, which both services may import … land (B) as a pure move behind an unchanged
 * public barrel"*, grafting *"the one-interpretation rule for `redactedDsn` … move it to
 * `packages/config` … and leave `DATABASE_URL_DEFAULT` in the gateway where it has a
 * gateway-specific reason; then **delete the gateway's `exports` field entirely**"*. It rejects
 * **(C)**, an `/internal/auditor/run` route, on three grounds — so nothing here asks for one.
 *
 * The subject of this suite is therefore **the boundary**, not the Auditor. `runAuditor`'s
 * behaviour is owned by the ten suites in `services/sync-gateway/src/__acceptance__/`, which reach
 * it through `auditor-builders.ts` → the gateway's public barrel; `DEC-ARCH-001` predicts that *"if
 * the barrel keeps re-exporting, zero suites change"*, and §F is the assertion that keeps that
 * prediction honest rather than hopeful.
 *
 * ═══ AIMED AT THE CASE THAT MATTERS, NOT AT THE MECHANISM (the round-3 law) ═══════════════════
 *
 * A refactor is the easiest thing in this repo to test vacuously: assert that a directory exists
 * and everything passes. Each section below is pointed at a specific plausible-wrong move that
 * every OTHER section would bless.
 *
 *   §A  a directory that is not a package — no manifest, or a manifest with no `exports` field.
 *       `scripts/check-seams.mjs` resolves `@restos/*` **only** through an `exports` field
 *       (`resolveSpecifier`), so without one the rail cannot see `services/jobs` reaching
 *       `runAuditor` at all and reports the wave's named defect on a symbol that has a caller.
 *   §B  a COPY rather than a move — the gateway keeps its `auditor.ts` and the package gets a
 *       duplicate. Two copies of one check is `03-F40`'s two sensor bit layouts: they diverge, and
 *       then the nightly job and the suites are auditing by different rules.
 *   §C  the package lands and the old import stays. Everything is green, the package is dead, and
 *       the `18 §2` breach is exactly where it was. This is the seam row.
 *   §D  `git mv` with no content edit, so the moved file still tells its next reader that a live
 *       `18 §2` violation is outstanding and *"the ruling is owed"*. A comment claiming a state
 *       that is false is worse than no comment: it retires the correction someone would write.
 *   §E  `redactedDsn` re-implemented in `packages/config` instead of moved, or moved together with
 *       `DATABASE_URL_DEFAULT` (which `DEC-ARCH-001` explicitly keeps in the gateway).
 *   §F  the barrel export dropped and `auditor-builders.ts` re-pointed at `@restos/auditor`. Ten
 *       suites stay green, the gateway's public surface silently narrows, and the ruling's own
 *       "pure move behind an unchanged public barrel" is not what landed.
 *   §G  a package containing a STUB. Every structural assertion above passes an `auditor.ts` whose
 *       body is `return { ok: true, findings: [] }`, and the nightly job would then report a clean
 *       ledger for ever. Nothing but running it over a real Postgres separates the two.
 *
 * ═══ ORACLE-PINNED SURFACE — BINDING FOR THE IMPLEMENTING SESSION ═════════════════════════════
 *
 *   1. The package is **`@restos/auditor`** at `packages/auditor`, with an `exports` field, and
 *      `runAuditor` importable from its `"."` entry. (`DEC-ARCH-001` names the directory and the
 *      three files: `package.json`, `src/index.ts`, `CLAUDE.md`.)
 *   2. `redactedDsn` is importable from **`@restos/config`** — the package `DEC-ARCH-001` names,
 *      already a `services/jobs` dependency.
 *   3. `services/sync-gateway/src/index.ts` keeps re-exporting `runAuditor` and its four public
 *      types, now from `@restos/auditor`.
 *
 *   ⚠ The symbol names, the `AuditorFinding` field names and the `AuditorCheck` values used below
 *   are hand-copied rather than imported, because the module they would come from does not exist
 *   at authoring time and a broken import is not a legitimate red (`24 §3`). The `K-3`
 *   dead-oracle hazard is a hand-copy that stays GREEN while the product moves; a rename here
 *   turns this suite RED, which is the safe direction.
 *
 * ═══ WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT ═════════════════════════════════════════════
 *
 *   - **`runAuditor`'s five legs.** They are `services/sync-gateway`'s ten suites' subject and this
 *     move must not change them. §G calls three fixtures only to separate a working module from a
 *     stub — it re-checks no leg's logic and reimplements none of it.
 *   - **`18 §2`'s `apps → services` edge.** `apps/backoffice/src/lib/catalog-types.ts` imports
 *     `@restos/api/src/router.js`, which the same MUST forbids in stronger words (*"Apps NEVER
 *     import services"*). It is real, it is PRE-EXISTING, and `DEC-ARCH-001` does not rule on it —
 *     so §C is scoped to `services → services` and `packages → services`, the two edges this
 *     ruling closes. A rule that also failed on the back office would be a suite that stays red
 *     under a correct implementation of this task, which is as damaging as a vacuous one.
 *   - **`services/jobs`' own Postgres handle on `kernel.*`.** `DEC-ARCH-001` records that second
 *     boundary question as OPEN and explicitly not closed by this ruling.
 *   - **`/internal/auditor/run`.** Rejected by the ruling; asserting for or against it would be
 *     inventing policy (commandment 2).
 *   - **`auditor-host.test.ts` §H.** Another suite's assertion, and a known tripwire on this
 *     baseline. Re-asserting it here would duplicate an oracle, not strengthen one. ⚠ **But it is
 *     a FOURTH file this move must touch, and `DEC-ARCH-001`'s cost estimate does not count it:**
 *     §H holds `AUDITOR_SOURCE = join(REPO_ROOT, "services", "sync-gateway", "src", "auditor.ts")`
 *     and `readFile`s it, so after the move it fails with **ENOENT** instead of its own message —
 *     measured. *"Exactly three files import the auditor module"* is true and is not the same
 *     claim as *"exactly three files name it"*: a PATH is not an import, the mirror image of this
 *     repo's own rule that a mention is not an import. The implementing session must re-point that
 *     constant; this suite must not, because an oracle is read-only to the session it constrains.
 *
 * ═══ MUTATION MATRIX (the round-3 law) — control 24/24 green, 0 survivors ═════════════════════
 *
 * The move was performed in-tree (a plausible implementation: `git mv`, a local db type, the three
 * specifier swaps, the `redactedDsn` graft, the gateway's `exports` field deleted), this suite
 * taken green, then broken one branch at a time and reverted. `REAL_EXIT=$?` was written inside
 * every log and read from there; no reported status was trusted. The two right-hand columns are
 * the PRE-EXISTING tests each mutant kills — the number that says what this suite adds.
 *
 *   #     mutant (exactly one branch)                            /24   jobs-host   gateway
 *   M1    `packages/auditor` has no `exports` field (a `main`      1        0          0
 *         still resolves the import, so only §A2 fires)
 *   M2    the gateway KEEPS a copy of `src/auditor.ts`             2        0          0
 *   M3    `services/jobs` still imports the gateway subpath        5      −1 (!)       0
 *   M4    the gateway KEEPS its `exports` field                    1        0          0
 *   M5    `packages/auditor` imports `GatewayDb` from the          1        0          0
 *         service by relative path (`tsc --noEmit` exit 0)
 *   M6    the moved file's `18 §2` violation note left in place    1        0          0
 *   M7    `redactedDsn` RE-IMPLEMENTED in config as a regex        1        0          0
 *   M8    `DATABASE_URL_DEFAULT` moved to config as well           1        0          0
 *   M9    barrel re-export dropped AND `auditor-builders.ts`       2        0          0
 *         re-pointed at `@restos/auditor` (the plausible one)
 *   M9b   barrel re-export dropped, oracle untouched               2        0      45 (11 files)
 *   M10   `packages/auditor` ships a STUB                          2        5      25 (10 files)
 *   M11   `packages/auditor/CLAUDE.md` omitted (`23-F5`)           1        0          0
 *   M12   NEGATIVE CONTROL: a real refactor — `export *` for       0        0          0
 *         the name list, db type aliased through a second
 *         name, internals renamed, barrel order reversed,
 *         manifest fields reordered, all prose rewritten
 *
 * **M9 vs M9b is the row to read, and it is the reason §F exists.** Dropping the barrel export
 * ALONE is caught 45 times by suites that already exist — but an implementer who drops it does not
 * stop there: they re-point `auditor-builders.ts` at `@restos/auditor` to make those 45 go green
 * again, and then **nothing in the repo objects** (M9: 0 pre-existing kills, `pnpm verify` exit 0)
 * while the gateway's public surface has silently narrowed and `DEC-ARCH-001`'s "pure move behind
 * an unchanged public barrel" is not what landed. §F is the only assertion that survives that
 * repair.
 *
 * **M5 is the row to fear.** A `packages → services` relative import compiles, links, runs, and
 * leaves every suite in this repo green — it inverts `18 §2`'s direction entirely while looking
 * like a smaller diff than the correct move.
 *
 * ⚠ **M10's redundancy is measured, not assumed, and is stated because it is a finding about THIS
 * suite.** A stub is caught 30 times by pre-existing tests, because the barrel §F pins makes the
 * gateway's ten auditor suites run against the package. §G is therefore not the only guard on a
 * stub; what it owns alone is the PRODUCTION SPECIFIER — it is the one place in the repo where
 * `runAuditor` is called through `@restos/auditor`, the string `services/jobs/src/index.ts`
 * actually imports, over a real Postgres. Kept for that, and for attribution: a jobs-side failure
 * names the move.
 *
 * ═══ ADDENDUM — THE ADVERSARIAL ROUND AGAINST THE LANDED IMPLEMENTATION (`2275d30`) ═══════════
 *
 * A separate mutation-testing session re-ran the matrix against what actually shipped, with a
 * different mutant set aimed at the implementer's choices rather than at the author's. **The suite
 * held on every row but one, and the negative control cost 0 kills.** The numbers that matter:
 *
 *   #    mutant                                                    /24   jobs-host   gateway
 *   S1   THE SEAM: the production call `runAuditor({db, org_id})`     0        +5          —
 *        deleted from services/jobs/src/index.ts, import kept
 *   S2   the same, import deleted too (what a session writes)         1        +5          —
 *   D1   THE DEFECT VERBATIM: the whole pre-move tree restored       22         0          —
 *        from HEAD~1 + pnpm install (the two survivors are §C5
 *        and §E5, both TRUE before the move — correct, not a hole)
 *   W1   the pre-move note carried across the `git mv` with          0         0          —
 *        "ACROSS A SERVICE BOUNDARY" reworded PLURAL   ← SURVIVOR
 *   P2   packages/auditor's manifest drops @restos/sync-client        1         0          —
 *   N1   NEGATIVE CONTROL: redactedDsn reimplemented equivalently     0         0          0
 *        (`new URL` + try/catch), both barrels re-worded, manifest
 *        keys reordered, two internal symbols renamed
 *
 * **`S1` is the row to read: this suite asserts the IMPORT and never the CALL.** Deleting the one
 * production call site leaves all 24 assertions green — what stops the package being decorative is
 * `auditor-host.test.ts`, which spawns the worker and reads its log, and it kills 5. That is a
 * correct division of labour (this suite owns the boundary, that one owns the host) and it is
 * written down here because a reader who takes THIS file as the move's whole protection would be
 * wrong. `W1` is closed below by the second §D assertion; its `0/0` is the number that bought it.
 *
 * ⚠ **TWO ASSERTIONS IN THIS FILE'S FIRST DRAFT FAILED A CORRECT IMPLEMENTATION**, which is as
 * damaging as a vacuous one, and neither was visible by reading. (1) §B's uniqueness scan counted
 * a local binding, and this file's own helper bound `const runAuditor = auditor.runAuditor` — so
 * the suite reported ITSELF as a second declaration. (2) §E's unparseable-DSN fixture,
 * `not-a-dsn-but-it-has-a:secret-in-it`, is accepted by the WHATWG URL parser, so a correct
 * `redactedDsn` returned it unchanged and the assertion failed. Both are recorded at their fix
 * sites. **Running a correct implementation is what found them; reading the file did not.**
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  databaseUrl,
  type Identity,
  identityFor,
  openSql,
  type Sql,
  seedCleanOrg,
  seedConservationOrg,
  seedLamportGapOrg,
} from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");

const AUDITOR_PKG_DIR = join(REPO_ROOT, "packages", "auditor");
const GATEWAY_SRC = join(REPO_ROOT, "services", "sync-gateway", "src");
const GATEWAY_BARREL = join(GATEWAY_SRC, "index.ts");
const JOBS_ENTRY = join(PKG_DIR, "src", "index.ts");
const CONFIG_SRC = join(REPO_ROOT, "packages", "config", "src");

/** Pinned surface 1 and 2 — see the header. */
const AUDITOR_PACKAGE = "@restos/auditor";
const CONFIG_PACKAGE = "@restos/config";
const GATEWAY_PACKAGE = "@restos/sync-gateway";

/** `18 §2`'s `services/` tree, read from the handbook's own enumeration. */
const SERVICE_PACKAGES = [
  "@restos/api",
  "@restos/sync-gateway",
  "@restos/jobs",
  "@restos/whatsapp",
  "@restos/foodpanda",
  "@restos/intelligence",
  "@restos/tax",
];

// ── file-system helpers ─────────────────────────────────────────────────────────────────────

const SKIP_DIR = new Set(["node_modules", "dist", ".next", ".turbo", ".oracle-typecheck"]);

const tsFilesUnder = (dir: string): string[] => {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      out.push(...tsFilesUnder(join(dir, entry.name)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
};

const exists = (path: string): boolean => {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * A missing file is named rather than left as a bare `ENOENT`. Before this move lands, most of
 * §A reads files that do not exist yet; `24 §3` asks a suite to arrive red for a reason the
 * implementing session can act on, and a stack trace ending in `readFileSync` is not one.
 */
const read = (path: string): string => {
  if (!exists(path)) {
    throw new Error(
      `${path.slice(REPO_ROOT.length + 1)} does not exist — DEC-ARCH-001 has not landed yet, or ` +
        "this file is not where the ruling puts it.",
    );
  }
  return readFileSync(path, "utf8");
};

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(read(path)) as Record<string, unknown>;

/** Every `services/<name>/src` and `packages/<name>/src` that exists. */
const srcTreesIn = (group: string): { pkg: string; dir: string }[] =>
  readdirSync(join(REPO_ROOT, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      pkg: `${group}/${entry.name}`,
      dir: join(REPO_ROOT, group, entry.name, "src"),
    }))
    .filter((candidate) => exists(candidate.dir));

// ── source parsing: a MENTION IS NOT AN IMPORT (AGENTS.md's own measurement rule) ────────────

/**
 * Comments stripped before any import or declaration is counted. Every claim in this file is about
 * what the code DOES; the `18 §2` note in `services/jobs/src/index.ts` names
 * `@restos/sync-gateway/auditor` inside a comment three lines above the real import, so a raw
 * substring search cannot tell "still imports it" from "explains why it used to".
 *
 * `[^:]` guards the `//` of a DSN (`postgres://…`), which is the form these files are full of.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every module specifier a file imports, re-exports from, or dynamically imports. */
const specifiersOf = (code: string): string[] => {
  const out: string[] = [];
  for (const m of code.matchAll(/\bfrom\s*["']([^"']+)["']/g)) out.push(String(m[1]));
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(String(m[1]));
  for (const m of code.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(String(m[1]));
  return out;
};

/** `@scope/name/sub` → `@scope/name`; `pkg/sub` → `pkg`; relative paths pass through unchanged. */
const packageRootOf = (specifier: string): string => {
  if (specifier.startsWith(".") || specifier.startsWith("node:")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : String(parts[0]);
};

/**
 * Does this file DECLARE the symbol — exported or not? The un-exported form is deliberate: a
 * private second copy of `redactedDsn` is the exact failure `DEC-ARCH-001`'s graft exists to stop,
 * and it would not be an export.
 *
 * ⚠ It counts a plain binding (`const runAuditor = …`) as a declaration, which is what makes the
 * un-exported copy visible — and it therefore counts a local ALIAS of the imported symbol too.
 * This suite's own first draft bound `const runAuditor = auditor.runAuditor` inside a helper and
 * failed §B against a CORRECT move; the binding below is named `run` for that reason, and a future
 * editor who renames it back reintroduces the false red rather than a real finding.
 */
const declaresSymbol = (code: string, name: string): boolean =>
  new RegExp(
    `^\\s*(?:export\\s+)?(?:const|let|var|class|function|async\\s+function)\\s+${name}\\b`,
    "m",
  ).test(code);

/** Which names a file re-exports from a given specifier, and whether it does so with `export *`. */
const reexportsFrom = (code: string, specifier: string): { names: string[]; star: boolean } => {
  const names: string[] = [];
  let star = false;
  for (const m of code.matchAll(/export\s*\*\s*from\s*["']([^"']+)["']/g)) {
    if (m[1] === specifier) star = true;
  }
  for (const m of code.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (m[2] !== specifier) continue;
    for (const raw of String(m[1]).split(",")) {
      const cleaned = raw.trim().replace(/^type\s+/, "");
      if (cleaned === "") continue;
      names.push(String(cleaned.split(/\s+as\s+/)[0]).trim());
    }
  }
  return { names, star };
};

// ── the modules under test, loaded WITHOUT a literal specifier ───────────────────────────────

type Finding = {
  check: string;
  org_id: string;
  device_id: string | null;
  order_id: string | null;
  event_id: string | null;
  lamport_seq: number | null;
  detail: string;
};
type Report = { ok: boolean; findings: Finding[] };
type AuditorModule = { runAuditor?: (args: { db: unknown; org_id: string }) => Promise<Report> };
type ConfigModule = { redactedDsn?: (raw: string) => string };

/**
 * ⚠ **The specifier is a variable on purpose.** `@restos/auditor` does not exist until this ruling
 * lands, and a literal `import "@restos/auditor"` would make the whole repo fail `pnpm typecheck`
 * — a suite that arrives RED as a TYPECHECK failure rather than as a failed assertion tells the
 * implementing session nothing about what is missing (`24 §3`).
 */
const load = async (specifier: string): Promise<Record<string, unknown>> => {
  try {
    // `as`: a dynamic import with a computed specifier is `any` by construction (18 §3).
    return (await import(specifier)) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `\`${specifier}\` does not resolve from services/jobs. DEC-ARCH-001 moves auditor.ts into ` +
        "packages/auditor and grafts redactedDsn into packages/config; until both are packages " +
        "with an `exports` entry AND declared dependencies of @restos/jobs, nothing here can run.",
      { cause },
    );
  }
};

const loadAuditor = async (): Promise<AuditorModule> =>
  (await load(AUDITOR_PACKAGE)) as AuditorModule;
const loadConfig = async (): Promise<ConfigModule> => (await load(CONFIG_PACKAGE)) as ConfigModule;

// ── §G's fixtures: fresh orgs, never truncation (this package's isolation rule) ──────────────

const clean = identityFor("org-move-a-clean");
const gap = identityFor("org-move-m-gap");
const money = identityFor("org-move-w-money");

let sql: Sql;
let moneyOrderId = "";

const auditOrg = async (identity: Identity): Promise<Report> => {
  const auditor = await loadAuditor();
  expect(
    typeof auditor.runAuditor,
    `${AUDITOR_PACKAGE} resolves but exports no runAuditor function`,
  ).toBe("function");
  const client = postgres(databaseUrl(), { max: 1 });
  try {
    // Named `run`, NOT `runAuditor` — see the warning on `declaresSymbol`.
    const run = auditor.runAuditor;
    if (run === undefined) throw new Error("unreachable — asserted above");
    return await run({ db: drizzle(client), org_id: identity.org_id });
  } finally {
    await client.end({ timeout: 5 });
  }
};

describe("DEC-ARCH-001: the Auditor lives in packages/auditor, and the services→services edge is gone", () => {
  beforeAll(async () => {
    sql = openSql();
    await seedCleanOrg(sql, clean);
    await seedLamportGapOrg(sql, gap);
    moneyOrderId = await seedConservationOrg(sql, money);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  // ══ §A a PACKAGE, not a directory ══════════════════════════════════════════════════════════

  describe("§A 18 §2 / DEC-ARCH-001: packages/auditor is a package both services may import", () => {
    it("it has a manifest naming @restos/auditor", () => {
      const manifest = join(AUDITOR_PKG_DIR, "package.json");
      expect(
        exists(manifest),
        "packages/auditor/package.json is missing. DEC-ARCH-001 rules (B): move auditor.ts into " +
          "packages/auditor. A directory under packages/ with no manifest is not a workspace " +
          "package — pnpm-workspace.yaml globs packages/* but pnpm links MANIFESTS, so no service " +
          "can import it.",
      ).toBe(true);
      expect(readJson(manifest).name).toBe(AUDITOR_PACKAGE);
    });

    it("24-F14: it declares an `exports` field, or the seams rail goes BLIND to the new seam", () => {
      const manifest = readJson(join(AUDITOR_PKG_DIR, "package.json"));
      const map = manifest.exports;
      expect(
        map,
        "packages/auditor/package.json has no `exports` field. scripts/check-seams.mjs resolves " +
          "@restos/* ONLY through an exports field (resolveSpecifier), so without one the rail " +
          "cannot see services/jobs reaching runAuditor: it reports this wave's named defect — an " +
          "unreached export — on a symbol that has a shipping caller. services/jobs/src/index.ts " +
          "records that this is why the gateway published one in the first place.",
      ).toBeDefined();
      const targets =
        typeof map === "string" ? [map] : Object.values(map as Record<string, unknown>);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(
          exists(join(AUDITOR_PKG_DIR, String(target))),
          `exports target ${String(target)} does not exist on disk`,
        ).toBe(true);
      }
    });

    it("runAuditor is importable from @restos/auditor and is a function", async () => {
      const auditor = await loadAuditor();
      expect(typeof auditor.runAuditor).toBe("function");
    });

    it("services/jobs declares the dependency, so the seam is in the manifest and not only in a file", () => {
      const pkg = readJson(join(PKG_DIR, "package.json"));
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      expect(Object.keys(deps)).toContain(AUDITOR_PACKAGE);
    });

    it("its manifest declares every package its source imports (pnpm resolves nothing undeclared)", () => {
      const manifest = readJson(join(AUDITOR_PKG_DIR, "package.json"));
      const declared = new Set([
        ...Object.keys((manifest.dependencies as Record<string, string> | undefined) ?? {}),
        ...Object.keys((manifest.devDependencies as Record<string, string> | undefined) ?? {}),
        ...Object.keys((manifest.peerDependencies as Record<string, string> | undefined) ?? {}),
      ]);
      const files = tsFilesUnder(join(AUDITOR_PKG_DIR, "src"));
      expect(files.length, "packages/auditor/src holds no TypeScript at all").toBeGreaterThan(0);
      // Derived from the moved source rather than hand-listed: a hardcoded expectation here would
      // be the K-3 dead oracle — it would keep passing after the module's imports changed.
      for (const file of files) {
        for (const specifier of specifiersOf(stripComments(read(file)))) {
          const root = packageRootOf(specifier);
          if (root.startsWith(".") || root.startsWith("node:")) continue;
          expect(
            declared,
            `${file} imports ${root}, which the manifest does not declare`,
          ).toContain(root);
        }
      }
    });

    it("23-F5: it carries a CLAUDE.md naming its owning spec and the ruling that created it", () => {
      const guide = join(AUDITOR_PKG_DIR, "CLAUDE.md");
      expect(
        exists(guide),
        "packages/auditor/CLAUDE.md is missing. 23-F5: every package gets a 5–15 line CLAUDE.md " +
          "that loads automatically when an agent reads files in that directory; DEC-ARCH-001 " +
          "names it as one of the three files this move adds.",
      ).toBe(true);
      const text = read(guide);
      expect(text).toContain(AUDITOR_PACKAGE);
      expect(
        /20-testing-correctness|20 §4\.2/.test(text),
        "the guide does not point at the Auditor's owning spec (doc 20 §4.2). 23-F5: stubs point " +
          "at specs; they never duplicate them.",
      ).toBe(true);
      expect(
        text,
        "the guide does not cite DEC-ARCH-001, so the next reader cannot find out why this " +
          "package exists rather than living in the gateway (commandment 9).",
      ).toContain("DEC-ARCH-001");
    });
  });

  // ══ §B a MOVE, not a copy ══════════════════════════════════════════════════════════════════

  describe("§B DEC-ARCH-001 'a pure move': exactly one auditor exists", () => {
    it("services/sync-gateway/src/auditor.ts is gone", () => {
      expect(
        exists(join(GATEWAY_SRC, "auditor.ts")),
        "services/sync-gateway/src/auditor.ts still exists. DEC-ARCH-001 rules a MOVE (one " +
          "`git mv`), not a copy: two copies of one check is 03-F40's two sensor bit layouts, " +
          "where the snapshot suite and the running product diverge and nothing says which is right.",
      ).toBe(false);
    });

    it("runAuditor is declared in exactly one file in the repo, and it is under packages/auditor", () => {
      const declaring = [
        ...srcTreesIn("services"),
        ...srcTreesIn("packages"),
        ...srcTreesIn("apps"),
      ]
        .flatMap((tree) => tsFilesUnder(tree.dir))
        .filter((file) => declaresSymbol(stripComments(read(file)), "runAuditor"));
      expect(
        declaring.map((file) => file.slice(REPO_ROOT.length + 1)),
        "runAuditor must be declared once and only once",
      ).toEqual([join("packages", "auditor", "src", "auditor.ts")]);
    });
  });

  // ══ §C the services → services edge ════════════════════════════════════════════════════════

  describe("§C 18 §2 MUST: no service imports another service", () => {
    it("services/jobs/src/index.ts imports the Auditor from the PACKAGE", () => {
      const code = stripComments(read(JOBS_ENTRY));
      const roots = specifiersOf(code).map(packageRootOf);
      expect(
        roots,
        "services/jobs/src/index.ts still imports across the service boundary. This is the whole " +
          "of DEC-ARCH-001: a package can land, be correct, be linked and be dead while the old " +
          "import carries every call — the recurring defect of this wave with a ruling attached.",
      ).not.toContain(GATEWAY_PACKAGE);
      expect(roots).toContain(AUDITOR_PACKAGE);
    });

    it("no file under any services/*/src imports another service's package", () => {
      const offences: string[] = [];
      for (const service of srcTreesIn("services")) {
        for (const file of tsFilesUnder(service.dir)) {
          for (const specifier of specifiersOf(stripComments(read(file)))) {
            const root = packageRootOf(specifier);
            if (!SERVICE_PACKAGES.includes(root)) continue;
            if (root === `@restos/${service.pkg.split("/")[1]}`) continue;
            offences.push(`${file.slice(REPO_ROOT.length + 1)} → ${specifier}`);
          }
        }
      }
      expect(
        offences,
        "18 §2: 'Cross-module calls go through tRPC/events, never through direct imports across " +
          "service boundaries.' services → services is on neither allowed list.",
      ).toEqual([]);
    });

    it("services/jobs no longer DECLARES @restos/sync-gateway either", () => {
      const pkg = readJson(join(PKG_DIR, "package.json"));
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      expect(
        Object.keys(deps),
        "the specifier was swapped but the dependency is still declared, so pnpm still links the " +
          "gateway into services/jobs and the edge is one keystroke from returning",
      ).not.toContain(GATEWAY_PACKAGE);
    });

    it("DEC-ARCH-001: the gateway's `exports` field is deleted — every other service has none", () => {
      const pkg = readJson(join(REPO_ROOT, "services", "sync-gateway", "package.json"));
      expect(
        pkg.exports,
        "services/sync-gateway/package.json still publishes an `exports` map. It existed only to " +
          "make option (A)'s cross-service import enumerated; DEC-ARCH-001 ends (A) and says to " +
          "delete it entirely, 'returning it to the state every other service is in'. Left in " +
          "place it is a standing invitation for the next service to import this one.",
      ).toBeUndefined();
    });

    it("no file under any packages/*/src imports a service — the worse edge the naive move creates", () => {
      const offences: string[] = [];
      for (const pkg of srcTreesIn("packages")) {
        for (const file of tsFilesUnder(pkg.dir)) {
          for (const specifier of specifiersOf(stripComments(read(file)))) {
            const root = packageRootOf(specifier);
            const escapes = specifier.startsWith(".") && /(^|\/)\.\.\/services\//.test(specifier);
            if (SERVICE_PACKAGES.includes(root) || escapes) {
              offences.push(`${file.slice(REPO_ROOT.length + 1)} → ${specifier}`);
            }
          }
        }
      }
      expect(
        offences,
        "a package importing a service inverts 18 §2's direction entirely. The obvious way to " +
          "move auditor.ts is to leave `import type { GatewayDb } from '.../gateway.js'` in " +
          "place, which compiles, ships, and is a worse violation than the one being removed. " +
          "DEC-ARCH-001's move declares the db handle locally instead. (Type-only imports count: " +
          "18 §2's direction is a rule about the module graph, and `import type` is an edge in it.)",
      ).toEqual([]);
    });
  });

  // ══ §D the note that named the violation ═══════════════════════════════════════════════════

  describe("§D the violation is over, so nothing may still describe it as live", () => {
    it("neither the moved module nor its caller still claims a live cross-service import", () => {
      for (const file of [join(AUDITOR_PKG_DIR, "src", "auditor.ts"), JOBS_ENTRY]) {
        if (!exists(file)) continue; // §B/§A own "it is missing"; this test owns its CONTENT.
        expect(
          read(file).toLowerCase(),
          `${file.slice(REPO_ROOT.length + 1)} still tells its reader that this module is imported ` +
            "ACROSS A SERVICE BOUNDARY and that the ruling is owed. DEC-ARCH-001 is the ruling; " +
            "after the move there is no boundary crossing left to describe. A comment asserting a " +
            "state that is false is worse than no comment — it retires the correction the next " +
            "reader would otherwise make. Describe the MOVE (cite DEC-ARCH-001) instead.",
        ).not.toContain("across a service boundary");
      }
    });

    /**
     * ⚠ **ADDED BY THE MUTATION-TESTING SESSION FOR `DEC-ARCH-001`, NOT BY THIS SUITE'S AUTHOR.**
     * The assertion above was the only guard on §D and it is a single literal phrase, so the
     * mutant `W1` **survived it with 0 kills across all 24 assertions**: both files were given the
     * pre-move note back with `ACROSS A SERVICE BOUNDARY` reworded to `ACROSS SERVICE BOUNDARIES`
     * — plural — plus the whole `(A)/(B)/(C)` option block, and the suite stayed green while the
     * two files told their reader that the `18 §2` breach is live, that option (A) is *"taken
     * here"*, and that the ruling is *"owed"*. Every one of those is false; `§C` proves it is.
     *
     * ⚠ **THE OBVIOUS FIX IS NOT AVAILABLE AND A FUTURE SESSION MUST NOT REACH FOR IT.** Widening
     * the phrase above to a singular/plural family (`/across (a )?service boundar(y|ies)/`) makes
     * this suite **RED AGAINST THE CORRECT IMPLEMENTATION** — measured, not reasoned:
     * `services/jobs/src/index.ts:48` contains *"never through direct imports across service
     * boundaries"*, which is `18 §2`'s **own quoted MUST** and is exactly the sentence that
     * justifies the move. The plural form lives in the QUOTE; the singular form lives only in the
     * CLAIM. That is why the author picked the narrow phrase, and a test that stays red under a
     * correct implementation is as damaging as a vacuous one (`24 §3`, the round-3 law).
     *
     * So this bans the *other* half of the stale note — the part that says the decision has not
     * been taken — where no `18 §2` quotation can collide with it. It is still a PHRASE guard and
     * therefore still incomplete: prose cannot be pinned exhaustively, and the machine-checkable
     * half of "is the breach live" is `§C`, which owns it. This closes the realistic mutant (the
     * pre-move text carried across a `git mv`, which is what `M6`/`W1` both are), not the class.
     */
    it("nor that DEC-ARCH-001 is still an open question — the ruling landed (W1)", () => {
      /** Each entry: a claim that was TRUE before this commit and is false after it. */
      const staleClaims: { pattern: RegExp; why: string }[] = [
        {
          pattern: /ruling is owed/i,
          why: "DEC-ARCH-001 IS the ruling and it is RULED — nothing about this move is owed",
        },
        {
          pattern: /needs a senior ruling/i,
          why: "the senior ruling was made (DEC-ARCH-001, founder, August 2026)",
        },
        {
          pattern: /\(A\)\s*taken here/i,
          why:
            "option (A) — the gateway's two-entry `exports` map — is UNDONE: §C asserts that " +
            "manifest has no `exports` field at all",
        },
        {
          pattern: /\(B\)[^\n]*\bowed\b/i,
          why: "option (B) is what LANDED; a file calling it owed describes the state before this commit",
        },
      ];
      for (const file of [join(AUDITOR_PKG_DIR, "src", "auditor.ts"), JOBS_ENTRY]) {
        if (!exists(file)) continue; // §B/§A own "it is missing"; this test owns its CONTENT.
        const text = read(file);
        for (const { pattern, why } of staleClaims) {
          expect(
            pattern.test(text),
            `${file.slice(REPO_ROOT.length + 1)} matches ${String(pattern)} — ${why}. A comment ` +
              "asserting a state that is false is worse than no comment: it retires the correction " +
              "the next reader would otherwise make. Describe what DEC-ARCH-001 DID.",
          ).toBe(false);
        }
      }
    });
  });

  // ══ §E the redactedDsn graft ═══════════════════════════════════════════════════════════════

  describe("§E DEC-ARCH-001's graft: ONE redaction helper, and it lives in packages/config", () => {
    it("redactedDsn is declared exactly once in the repo, under packages/config/src", () => {
      const declaring = [
        ...srcTreesIn("services"),
        ...srcTreesIn("packages"),
        ...srcTreesIn("apps"),
      ]
        .flatMap((tree) => tsFilesUnder(tree.dir))
        .filter((file) => declaresSymbol(stripComments(read(file)), "redactedDsn"))
        .map((file) => file.slice(REPO_ROOT.length + 1));
      expect(
        declaring.length,
        `redactedDsn is declared in ${declaring.length} files (${declaring.join(", ")}). A second ` +
          "local helper is a second interpretation of which part of a DSN may reach a log store " +
          "(18 §5), which is the reason 03-F40's two sensor bit layouts is cited in the ruling.",
      ).toBe(1);
      expect(String(declaring[0]).startsWith(join("packages", "config", "src"))).toBe(true);
    });

    it("and it is importable from @restos/config", async () => {
      const config = await loadConfig();
      expect(typeof config.redactedDsn).toBe("function");
    });

    it("18 §5: it still removes the password and keeps everything an operator needs", async () => {
      const config = await loadConfig();
      const redact = config.redactedDsn;
      expect(typeof redact).toBe("function");
      if (redact === undefined) throw new Error("unreachable — asserted above");

      const redacted = redact("postgres://restos:hunter2@db.internal:6543/kernel_prod");
      // The one part that may never reach a log store.
      expect(redacted, "the connection password survived redaction").not.toContain("hunter2");
      // The parts an operator needs to answer "why can it not reach the database".
      expect(redacted).toContain("db.internal");
      expect(redacted).toContain("6543");
      expect(redacted).toContain("kernel_prod");
      expect(redacted).toContain("restos");
    });

    it("18 §5: an unparseable DSN is neither echoed back nor thrown", async () => {
      const config = await loadConfig();
      const redact = config.redactedDsn;
      if (redact === undefined) throw new Error("no redactedDsn — the test above owns that");
      // A re-implementation that pattern-matches instead of parsing tends to return its input
      // unchanged when the pattern misses — which is a leak on exactly the input nobody predicted.
      //
      // ⚠ The fixture must be UNPARSEABLE, and that is narrower than "not a DSN". This suite's
      // first draft used `not-a-dsn-but-it-has-a:secret-in-it`, which the WHATWG parser accepts
      // (scheme `not-a-dsn-but-it-has-a:`, path `secret-in-it`) — it has no password, so a correct
      // implementation returns it unchanged and the assertion failed a correct move. Spaces are
      // what make a string unparseable as a URL.
      const garbage = "host=db user=restos password=hunter2 sslmode=require";
      const out = redact(garbage);
      expect(
        out,
        "an input it could not parse was echoed back verbatim — 18 §5's one forbidden field " +
          "reaches the log store on exactly the DSN shape nobody predicted",
      ).not.toContain("hunter2");
      // A boot line is not the place to throw: services/jobs prints this while REPORTING a fault.
      expect(() => redact("")).not.toThrow();
    });

    it("DEC-ARCH-001: DATABASE_URL_DEFAULT stays in the gateway — it has a gateway-specific reason", () => {
      const inGateway = tsFilesUnder(GATEWAY_SRC).some((file) =>
        declaresSymbol(stripComments(read(file)), "DATABASE_URL_DEFAULT"),
      );
      const inConfig = tsFilesUnder(CONFIG_SRC).some((file) =>
        declaresSymbol(stripComments(read(file)), "DATABASE_URL_DEFAULT"),
      );
      expect(inGateway, "DATABASE_URL_DEFAULT left the gateway").toBe(true);
      expect(
        inConfig,
        "DATABASE_URL_DEFAULT was moved into packages/config alongside redactedDsn. The ruling " +
          "moves ONE of the two on purpose: the default exists because this service's boot must " +
          "not require a URL, and a shared default would hand every other service a database it " +
          "never named. services/jobs requires DATABASE_URL with no default for exactly that reason.",
      ).toBe(false);
    });
  });

  // ══ §F the public barrel ═══════════════════════════════════════════════════════════════════

  describe("§F DEC-ARCH-001 'behind an unchanged public barrel'", () => {
    it("the gateway barrel still re-exports runAuditor, now from @restos/auditor", () => {
      const { names, star } = reexportsFrom(stripComments(read(GATEWAY_BARREL)), AUDITOR_PACKAGE);
      expect(
        star || names.includes("runAuditor"),
        "services/sync-gateway/src/index.ts no longer re-exports runAuditor. The ruling's cost " +
          "estimate rests on this: auditor-builders.ts destructures runAuditor from the gateway's " +
          "PUBLIC BARREL, so 'if the barrel keeps re-exporting, zero suites change'. Re-pointing " +
          "that oracle at @restos/auditor turns the ten gateway suites green again while silently " +
          "narrowing this service's public surface — a different change from the one ruled.",
      ).toBe(true);
    });

    it("and the four public types with it", () => {
      const { names, star } = reexportsFrom(stripComments(read(GATEWAY_BARREL)), AUDITOR_PACKAGE);
      if (star) return;
      for (const type of ["AuditorCheck", "AuditorFinding", "AuditorReport", "RunAuditorArgs"]) {
        expect(names, `the barrel dropped ${type}`).toContain(type);
      }
    });
  });

  // ══ §G it still AUDITS — the assertion no structural check can make ════════════════════════

  /**
   * Everything above passes a `packages/auditor` whose `runAuditor` returns `{ ok: true,
   * findings: [] }`: the package exists, the manifest is right, the seam is wired, the rail is
   * clean, the barrel re-exports, and the nightly job reports a clean ledger for ever. These three
   * are the only assertions in the file that separate a move from a hole, and they are the reason
   * this suite lives in a package with a real Postgres rather than in a lint script.
   *
   * They re-check no LEG: `services/sync-gateway`'s ten suites own the Auditor's logic and this
   * move must not touch it. The fixtures are `helpers.ts`'s, and each is chosen so the expected
   * outcome follows from `auditor.ts`'s own documented legs. §G1 is the control: a module that
   * reports a finding for everything passes §G2 and §G3 and fails here.
   */
  describe("§G the moved module still does the thing it was moved for (20 §4.2)", () => {
    it("§G1 a clean org comes back clean (the control: 'everything is broken' fails here)", async () => {
      const report = await auditOrg(clean);
      expect(
        report.findings,
        `expected no findings, got ${JSON.stringify(report.findings)}`,
      ).toEqual([]);
      expect(report.ok).toBe(true);
    });

    it("§G2 a missing lamport slot is still found (01-F3/01-F8)", async () => {
      const report = await auditOrg(gap);
      expect(
        report.ok,
        "packages/auditor reported a ledger with a hole in it as clean. A stub — or a move that " +
          "dropped a leg — passes every other assertion in this file and turns 20 §4.2's 'single " +
          "highest-value correctness artifact' into a nightly job that always says yes.",
      ).toBe(false);
      const found = report.findings.filter((f) => f.check === "lamport_gap");
      expect(found.length).toBeGreaterThan(0);
      expect(found[0]?.org_id).toBe(gap.org_id);
      expect(found[0]?.device_id).toBe(gap.device_id);
    });

    it("§G3 money that does not conserve is still found (01-F30/01-F32)", async () => {
      const report = await auditOrg(money);
      expect(report.ok).toBe(false);
      const found = report.findings.filter((f) => f.check === "conservation");
      expect(
        found.length,
        "no conservation finding for a settled order billed Rs 1,000 against nothing tendered — " +
          "the shape DEC-MONEY-009's residual column names as owed to a scheduled Auditor",
      ).toBeGreaterThan(0);
      expect(found.map((f) => f.order_id)).toContain(moneyOrderId);
    });
  });
});
