/**
 * **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2, `20 §4.3` separation rule). Sources read in
 * full: `specs/22-operations-recovery.md` (all of it), `plans/saas-pivot/plan-of-record.md` §0
 * (R17, R19, R21, R34–R45), `specs/28-tenancy.md` (`28-F1`, `28-F10`, `28-F14`, `28-F18`, `28-F21`),
 * `specs/01-kernel-sync.md` (`01-F1`, `01-F4`, `01-F8`, `01-F62`, `01-F68`, `01-F71`),
 * `specs/18-engineering-handbook.md` §§2/4/5/14, `specs/20-testing-correctness.md` §§1/4.2/4.3,
 * `services/sync-gateway/src/schema.ts`, and the landed process precedent
 * `services/jobs/src/__acceptance__/{auditor-host.test.ts,global-setup.ts,helpers.ts}`.
 * **No implementation of a backup, a restore or an export exists at authoring time, and this
 * session wrote none.**
 *
 * ═══ WHY THIS FILE EXISTS ═════════════════════════════════════════════════════════════════════
 *
 * Measured 2026-08-20: `grep -arln "22-F" services/*​/src apps/*​/src packages/*​/src` returns
 * **nothing**. Doc 22 has been in the corpus since July 2026 and **not one line of shipping code
 * cites it**. R21 then makes pilot data *"real business records"* that a restaurant closes its day
 * on, and R38 rules the minimum that makes that honest:
 *
 *   > **NIGHTLY PER-TENANT BACKUP + A RESTORE THAT HAS ACTUALLY BEEN RUN + OWNER-TRIGGERED
 *   > EXPORT.** … ⚠ **A restore nobody has performed is a backup nobody has**; the acceptance is a
 *   > restore, not a dump.
 *
 * So the subject of this file is **the restore**, not the dump. `§D` destroys a tenant and brings
 * it back from its own artifact, and asserts the restored state is byte-identical to the state that
 * was backed up, across **every kernel table that carries an `org_id`** — the table list read from
 * `information_schema`, never hand-copied. A test that asserts a file exists is the shape R38
 * exists to refuse and appears nowhere below.
 *
 * ═══ ORACLE-PINNED SURFACE — BINDING FOR THE IMPLEMENTING SESSION ═════════════════════════════
 *
 * (`services/sync-gateway/src/__acceptance__/global-setup.ts`'s "MIGRATE SEAM" block and
 * `auditor-host.test.ts`'s host surface are the precedents for pinning a surface an oracle needs
 * before the implementation exists.)
 *
 *   1. **Three DECLARED commands in `services/jobs/package.json`**, and this file executes the
 *      declared STRING in every case, never a command of its own composing:
 *        - `start` — the long-lived worker (already declared; the backup rides it, see 3).
 *        - `restore` — one-shot: `<declared string> --file <artifact>`, target database from
 *          `DATABASE_URL`. Exit 0 on success, **non-zero on any refusal**.
 *        - `export-org` — one-shot: `<declared string> --org <org_id> --out <dir>`, source database
 *          from `DATABASE_URL`.
 *      **`restore` is the seam assertion of this file** (`§A1`). A backup with no declared restore
 *      command is a backup only its author can perform, and R38's whole point is that the restore
 *      is the acceptance. `provision-device` / `revoke-device` / `migrate` on
 *      `services/sync-gateway` are the precedent: an operator act is a declared command, never a
 *      paragraph of hand-written SQL in a runbook.
 *
 *   2. **Env on the worker.** `BACKUP_DIR` — where per-tenant artifacts are written.
 *      `BACKUP_INTERVAL_MS` — optional, default **nightly** (`§C3` requires 12–48 h, not a
 *      particular number). Both alongside the existing `DATABASE_URL` / `REDIS_URL` /
 *      `AUDITOR_INTERVAL_MS`.
 *
 *   3. **The backup rides the EXISTING worker and the existing `boot` record grows.** One
 *      deployment runs one `services/jobs` process (`auditor-host.test.ts`'s header measured what
 *      two of them do to each other), so this is not a second service and not a second `start`.
 *      Records on stdout, `18 §5` pino JSON, each under a top-level `jobs` key:
 *
 *        boot          { kind: "boot", database, auditor_interval_ms,
 *                        backup_dir, backup_interval_ms, backup_rpo_ms }
 *        per-org       { kind: "backup_result", org_id, artifact, ok: true }   ← ONE PER ORG PER
 *                                                                                 PASS, thin orgs
 *                                                                                 included
 *        failed pass   { kind: "backup_failed", org_id: string | null, error }
 *        export        { kind: "export_result", org_id, bundle, events, event_count }
 *
 *      `artifact` and `events` are absolute paths to FILES that exist when the record is written.
 *
 *   4. **`backup_rpo_ms` is `22-F22` in one field, and it is the honest number rather than the
 *      aspirational one.** `22-F1` wants RPO ≤ 5 min via continuous WAL; `22-F22` permits a
 *      scheduled logical dump as the interim and requires, in its own words, that *"22-F1's RPO ≤
 *      5 min does not hold under it — the real RPO is the dump interval, and that number MUST be
 *      written into the deployment's runbook beside the command that produces it."* `§A3` asserts
 *      `backup_rpo_ms === backup_interval_ms`, which is the one assertion that kills the plausible
 *      and dangerous host: one that prints `300000` because that is what the FR says, while
 *      actually dumping once a night. ⚠ **This is a PINNED READING** — the FR says *runbook*, and a
 *      log line is not a runbook. It is asserted here because a runbook is unassertable from a
 *      suite and because the number stated beside the schedule is the one an operator reads at
 *      3 a.m.; the runbook sentence is owed on top of it, not instead of it.
 *
 *   5. **One artifact FILE per org per pass.** Not a directory, not a shared cluster dump indexed
 *      per org. `§B` measures both.
 *
 * ═══ WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT, WITH THE MEASUREMENT ═══════════════════════
 *
 *   - **`governance.export_generated` / `governance.restore_drill_recorded`** (`22-F9`, `22-F16`).
 *     `packages/domain` declares **no `governance.*` family at all** — measured 2026-08-20, zero
 *     occurrences of the string `governance` in `packages/domain/src` — so `01-F4` refuses every
 *     one of them, and `01-F62` closes the org-scoped set at five types none of which is a
 *     `governance.*`, while a branch-scoped envelope needs a **device** to stamp it and this is a
 *     cloud job with no device. `28-F10` and `28-F14` already record this as owed: *"doc 22's to
 *     declare, doc 01's to absorb"*. Asserting an emit would be commandment 2, and a test that
 *     stays RED under a correct implementation is as damaging as a vacuous one. **So a backup, a
 *     restore and an export leave no ledger record and no attribution today**, exactly as a device
 *     revocation did before `14-F13`.
 *   - **The bundle's read-model CSVs and media manifest** (`22-F16`). There is no cloud per-module
 *     read model to serialise — `packages/auditor`'s `read_model` argument is optional and unsupplied
 *     for that exact reason — and no object storage (`22-F3`) in this deployment (R42: current
 *     server, no infrastructure project). Requiring either would invent the projection. `§G`
 *     asserts the one leg that is buildable today: *"the org's complete event log as JSONL
 *     (canonical envelopes)"*.
 *   - **Retention, PITR windows, WAL archiving, alarms** (`22-F2`, `22-F6`, `22-F13`, `22-N1`).
 *     R38 defers retention and erasure by name, and `22-F22` makes a scheduled logical dump the
 *     sanctioned interim posture. Asserting a 30-day PITR window against a `pg_dump` interim would
 *     be asserting the objective the interim explicitly does not meet.
 *   - **The device-side backup** (`22-F21`). It is a real, currently-unmet requirement — *"until an
 *     event has been pushed and acked, the device holds the only copy of it"* — and it lives in
 *     `apps/pos-electron` / `packages/sync-client`, not in a cloud job. Named here so the next
 *     reader does not mistake a green cloud suite for a covered property.
 *   - **`22-F8`'s quarterly drill as a schedule.** The drill's *substance* — restore, then a clean
 *     Auditor refold — is `§D` plus the Auditor host that already ships. Its cadence and its
 *     `governance.restore_drill_recorded` record are the parts that are unbuildable (above) or
 *     human process.
 *
 * ═══ AIMED AT THE CASE THAT MATTERS (the round-3 law) ═════════════════════════════════════════
 *
 * Every plausible-wrong implementation this file is pointed at, and the section that kills it:
 *
 *   §A1  a backup with no restore command — the state doc 22 has been in for a month
 *   §A3  a host that prints `22-F1`'s 5-minute RPO while dumping nightly
 *   §B1  backs up the first org discovery returns, or only orgs with events
 *   §B3  ONE cluster-wide dump written under each org's name — restores perfectly, and hands
 *        every restaurant a copy of every other restaurant's ledger
 *   §C1  dumps once at boot and calls itself nightly
 *   §D1  the headline: a dump nobody has restored
 *   §D2  a restore that reaches outside the tenant it is restoring (`01-F71`)
 *   §D3  a restore that re-stamps `server_received_at` or re-mints ids — history rewritten
 *   §D4  `delete from kernel.events where org_id = $1` before inserting — the "clean restore"
 *   §D5  a restore that duplicates or renumbers on a second run
 *   §D6  a truncated artifact half-restored, leaving a tenant in a state nobody can name
 *   §E   a host that books its own "last backup at" row into the kernel schema
 *   §F   a backup that fails silently, or writes a file it cannot restore
 *   §G3  an export bundle that carries a neighbouring tenant's ledger
 *   §G4  an export bundle that is missing half the tenant's own ledger
 *
 * ⚠ **THE HOOK NEVER DECIDES A VERDICT.** `auditor-host.test.ts` records what it costs when it
 * does: three of its mutants killed by failing `beforeAll`, which reports nineteen tests as
 * *skipped* — *"a real kill with no attributable assertion"*. Every wait below settles rather than
 * throwing, every subprocess result is captured with its exit code and output, and a missing
 * command or a silent worker reaches an `it` with a message naming what was expected. At authoring
 * time nothing is implemented, so every test in this file must fail **individually and legibly**.
 *
 * ⚠ **THIS SUITE'S WORKER USES ITS OWN REDIS DATABASE INDEX (`/7`).** `auditor-host.test.ts`'s
 * header is explicit that two `services/jobs` workers on one Redis COMPETE — *"a second worker's
 * scheduler upsert overwrites the first's cadence, and a second consumer on the same queue takes
 * passes the first was waiting for"* — and vitest runs test FILES in parallel. A separate db index
 * gives each file its own keyspace and queues, so neither suite can steal the other's passes or
 * clobber its cadence. Postgres is deliberately SHARED (isolation is by fresh `org_id`, this
 * package's rule), and this suite's fixtures are seeded clean so the neighbouring Auditor has
 * nothing to say about them.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type EventEnvelopeT, parseEvent } from "@restos/domain";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendTailEvent,
  destroyTenant,
  markersOf,
  RUN,
  seedTenant,
  seedThinTenant,
  type Tenant,
  tenantOf,
} from "./backup-fixtures.js";
import { BROKEN_DATABASE_URL_ENV, REDIS_URL_ENV } from "./global-setup.js";
import { databaseUrl, openSql, orgSnapshot, type Sql } from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const GATEWAY_DIR = resolve(REPO_ROOT, "services", "sync-gateway");

/** Fast enough to observe two passes; slow enough that a pass is never re-entered. */
const TEST_INTERVAL_MS = 2_000;
/** This file's own Redis keyspace — see the header. */
const REDIS_DB = 7;

// ── the pinned record shapes (see the header for why these are literals, not imports) ────────
const JOBS_KEY = "jobs";
const BOOT_KIND = "boot";
const BACKUP_KIND = "backup_result";
const BACKUP_FAILED_KIND = "backup_failed";
const EXPORT_KIND = "export_result";
/** pino's numeric levels: 30 info, 40 warn, 50 error, 60 fatal. */
const ERROR_LEVEL = 50;

const HOUR = 60 * 60 * 1000;

type JobsRecord = {
  level?: unknown;
  jobs: Record<string, unknown>;
};

type Worker = {
  readonly records: () => JobsRecord[];
  readonly output: () => string;
  readonly alive: () => boolean;
  readonly kill: () => void;
};

const parseRecords = (out: string): JobsRecord[] => {
  const parsed: JobsRecord[] = [];
  for (const line of out.split("\n")) {
    const text = line.trim();
    if (text === "" || !text.startsWith("{")) continue;
    try {
      const value: unknown = JSON.parse(text);
      if (typeof value === "object" && value !== null && JOBS_KEY in value) {
        const bag = (value as Record<string, unknown>)[JOBS_KEY];
        if (typeof bag === "object" && bag !== null) parsed.push(value as JobsRecord);
      }
    } catch {
      // A partially-flushed final line, or a non-JSON line from the runner. Both are noise.
    }
  }
  return parsed;
};

/** Runs a DECLARED script string exactly as a package manager would. */
const startDeclaredWorker = (script: string, env: Record<string, string>): Worker => {
  const child = spawn(script, {
    shell: true,
    cwd: PKG_DIR,
    // Its own process group: `shell: true` can leave the runner's child behind when the shell is
    // signalled, and an orphaned worker outlives the suite and keeps writing backup files.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      ...env,
    },
  });
  let out = "";
  let err = "";
  let exited = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    out += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    err += chunk;
  });
  child.on("exit", () => {
    exited = true;
  });
  return {
    records: () => parseRecords(out),
    output: () => `stdout:\n${out}\nstderr:\n${err}`,
    alive: () => !exited,
    kill: () => {
      if (child.pid === undefined || child.exitCode !== null) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    },
  };
};

/**
 * Waits until `predicate` holds, the worker dies, or the budget runs out — and **never throws**.
 * The header explains why: a hook that throws turns a real defect into nineteen skipped tests.
 */
const settle = async (
  target: Worker,
  predicate: (records: JobsRecord[]) => boolean,
  budgetMs: number,
): Promise<JobsRecord[]> => {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const seen = target.records();
    if (predicate(seen) || !target.alive() || Date.now() > deadline) return seen;
    await new Promise((done) => setTimeout(done, 200));
  }
};

type Ran = {
  /** `false` ⇔ the package declares no such script. The `it` that owns that says so. */
  readonly declared: boolean;
  readonly code: number | null;
  readonly out: string;
  readonly records: JobsRecord[];
};

const NOT_DECLARED: Ran = { declared: false, code: null, out: "", records: [] };

/** Runs a one-shot DECLARED command to completion and captures everything about it. */
const runDeclared = async (
  script: string | undefined,
  args: readonly string[],
  env: Record<string, string>,
  budgetMs = 120_000,
): Promise<Ran> => {
  if (script === undefined) return NOT_DECLARED;
  return new Promise<Ran>((done) => {
    const child = spawn([script, ...args].join(" "), {
      shell: true,
      cwd: PKG_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        ...env,
      },
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      out += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, budgetMs);
    const finish = (code: number | null): void => {
      clearTimeout(timer);
      done({ declared: true, code, out, records: parseRecords(out) });
    };
    child.on("error", (error) => {
      out += `\nspawn error: ${String(error)}`;
      finish(null);
    });
    child.on("close", finish);
  });
};

/**
 * `KEYS *` against one Redis database index, over raw RESP.
 *
 * `18 §15` rule 1 — *"a small utility is written, not installed"* — and `helpers.ts`'s
 * `redisKeyCount` is the precedent for the shape. It counts db 0 with no `SELECT`, which is the
 * Auditor suite's keyspace; this needs the NAMES, in this file's own index, because `§C4` is about
 * which queue exists rather than how many keys there are.
 */
const redisKeys = async (url: string, db: number): Promise<string[]> => {
  const { hostname, port } = new URL(url);
  const { createConnection } = await import("node:net");
  return new Promise<string[]>((done, fail) => {
    const socket = createConnection({ host: hostname, port: Number(port || "6379") }, () => {
      socket.write(`*2\r\n$6\r\nSELECT\r\n$${String(String(db).length)}\r\n${String(db)}\r\n`);
      socket.write("*2\r\n$4\r\nKEYS\r\n$1\r\n*\r\n");
    });
    let buffer = "";
    socket.setTimeout(10_000, () => {
      socket.destroy();
      fail(new Error(`[jobs] KEYS against ${url} db ${String(db)} timed out`));
    });
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      // +OK for SELECT, then the KEYS array. Wait until the array is complete.
      const array = buffer.indexOf("*");
      if (array === -1) return;
      const header = /\*(-?\d+)\r\n/.exec(buffer.slice(array));
      if (header === null) return;
      const count = Number(header[1]);
      const names = [...buffer.slice(array).matchAll(/\$\d+\r\n([^\r\n]*)\r\n/g)].map(
        (match) => match[1] ?? "",
      );
      if (count <= 0 || names.length >= count) {
        socket.end();
        done(names.slice(0, Math.max(count, 0)));
      }
    });
    socket.on("error", fail);
  });
};

const kindsOf = (records: JobsRecord[], kind: string): JobsRecord[] =>
  records.filter((record) => record.jobs.kind === kind);

const backupsFor = (records: JobsRecord[], org_id: string): JobsRecord[] =>
  kindsOf(records, BACKUP_KIND).filter((record) => record.jobs.org_id === org_id);

const artifactOf = (record: JobsRecord | undefined): string =>
  typeof record?.jobs.artifact === "string" ? record.jobs.artifact : "";

type Scripts = Record<string, string | undefined>;
const readScripts = async (): Promise<Scripts> =>
  (
    (await JSON.parse(await readFile(join(PKG_DIR, "package.json"), "utf8"))) as {
      scripts?: Scripts;
    }
  ).scripts ?? {};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THREE TENANTS
//
// A and B are both FULLY POPULATED across every kernel table that carries an `org_id`, with
// disjoint ids, names, prices and emails. C is a tenant that signed up and has not yet traded.
// `§0` proves the disjointness rather than trusting it.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const A = tenantOf("bkp-a-kababjees", "Kababjees", "Chicken Karahi", 45_000);
const B = tenantOf("bkp-m-student-biryani", "Student Biryani", "Beef Biryani", 32_500);
const C = tenantOf("bkp-z-new-signup", "Naya Dhaba", "Nothing Yet", 1);

let sql: Sql;
let targetSql: Sql | undefined;
let backupDir = "";
let brokenDir = "";
let exportDir = "";
let scratch = "";

/** Snapshots taken while nothing was running — the state a restore must reproduce. */
const before: Record<string, string> = {};
/** The same snapshots after two backup passes — `§E`'s evidence that a backup is a READ. */
const afterPasses: Record<string, string> = {};
/** `§0`'s evidence, captured at SEED time — see the note on that test. */
const populated: Record<string, Record<string, number>> = {};
let tableNames: string[] = [];
/**
 * The snapshot of an org that has no rows at all, READ FROM THE LIVE SCHEMA rather than written
 * down, so it stays correct when a table is added. `toBe(EMPTY)` is therefore a statement about
 * ROWS and not about a string somebody typed.
 */
let EMPTY = "";

let scripts: Scripts = {};
let passRecords: JobsRecord[] = [];
let nightlyRecords: JobsRecord[] = [];
let brokenRecords: JobsRecord[] = [];
let brokenAlive = false;
let brokenFiles: string[] = [];
let redisKeyNames: string[] = [];

/** The artifacts this suite restores from — copied aside so a later pass cannot move them. */
let artifactA = "";
let artifactB = "";
let artifactC = "";

/** `§D`'s captured outcomes. */
let divertMigrate = { ok: false, note: "" };
let divertRestore: Ran = NOT_DECLARED;
let divertSnapshotA = "";
let divertSnapshotB = "";
let destroyRestore: Ran = NOT_DECLARED;
let afterDestroyRestoreA = "";
let afterDestroyRestoreB = "";
let secondRestore: Ran = NOT_DECLARED;
let afterSecondRestoreA = "";
let tailEventId = "";
let afterTailRestoreIds: string[] = [];
let corruptRestore: Ran = NOT_DECLARED;
let afterCorruptRestoreA = "";

/** `§G`'s captured outcomes. */
let exportRun: Ran = NOT_DECLARED;
let exportedLines: string[] = [];
let exportSnapshotA = "";
let seededEventIds: string[] = [];
let bEventIds: string[] = [];
let storedEnvelopeA: EventEnvelopeT | undefined;

const eventIdsOf = async (source: Sql, org_id: string): Promise<string[]> =>
  (
    await source<{ id: string }[]>`
      select id from kernel.events where org_id = ${org_id} order by id`
  ).map((row) => row.id);

describe("R38: a per-tenant backup, a restore that has actually been run, and an owner's export", () => {
  beforeAll(async () => {
    sql = openSql();
    scripts = await readScripts();
    scratch = await mkdtemp(join(tmpdir(), `restos-r38-${RUN}-`));
    backupDir = join(scratch, "backups");
    brokenDir = join(scratch, "backups-broken");
    exportDir = join(scratch, "export");
    for (const dir of [backupDir, brokenDir, exportDir]) mkdirSync(dir, { recursive: true });

    await seedTenant(sql, A);
    await seedTenant(sql, B);
    await seedThinTenant(sql, C);
    seededEventIds = await eventIdsOf(sql, A.org_id);
    bEventIds = await eventIdsOf(sql, B.org_id);
    storedEnvelopeA = (
      await sql<{ envelope: EventEnvelopeT }[]>`
        select envelope from kernel.events
        where org_id = ${A.org_id} and lamport_seq = 0`
    )[0]?.envelope;

    for (const tenant of [A, B, C]) {
      before[tenant.org_id] = await orgSnapshot(sql, tenant.org_id);
    }
    EMPTY = await orgSnapshot(sql, `org-that-does-not-exist-${RUN}`);

    // §0's evidence, taken NOW — before anything below destroys tenant A on purpose.
    tableNames = (
      await sql<{ table_name: string }[]>`
        select table_name from information_schema.columns
        where table_schema = 'kernel' and column_name = 'org_id'
        order by table_name`
    ).map((row) => row.table_name);
    for (const tenant of [A, B]) {
      const counts: Record<string, number> = {};
      for (const table_name of tableNames) {
        const rows = (await sql.unsafe(
          `select count(*)::int as n from kernel.${table_name} where org_id = $1`,
          [tenant.org_id],
        )) as unknown as { n: number }[];
        counts[table_name] = Number(rows[0]?.n ?? 0);
      }
      populated[tenant.org_id] = counts;
    }

    const redisUrl = process.env[REDIS_URL_ENV] ?? "";
    const ownRedis = redisUrl === "" ? "" : `${redisUrl.replace(/\/\d+$/, "")}/${String(REDIS_DB)}`;

    // ── the worker under test. THREE WORKERS RUN IN SEQUENCE, NEVER CONCURRENTLY (header). ────
    const worker = startDeclaredWorker(scripts.start ?? "", {
      DATABASE_URL: databaseUrl(),
      REDIS_URL: ownRedis,
      BACKUP_DIR: backupDir,
      BACKUP_INTERVAL_MS: String(TEST_INTERVAL_MS),
      // Quiet, so a whole-ledger refold is not competing with this suite for the same Postgres.
      AUDITOR_INTERVAL_MS: String(HOUR),
    });
    try {
      passRecords = await settle(
        worker,
        (records) => [A, B, C].every((tenant) => backupsFor(records, tenant.org_id).length >= 2),
        90_000,
      );
      if (kindsOf(passRecords, BACKUP_KIND).length > 0 && ownRedis !== "") {
        redisKeyNames = await redisKeys(ownRedis, REDIS_DB);
      }
    } finally {
      worker.kill();
    }

    for (const tenant of [A, B, C]) {
      afterPasses[tenant.org_id] = await orgSnapshot(sql, tenant.org_id);
    }

    // Copy the newest artifact of each tenant aside, so no later pass can move or rewrite it.
    const copyAside = (tenant: Tenant, name: string): string => {
      const source = artifactOf(backupsFor(passRecords, tenant.org_id).at(-1));
      if (source === "" || !existsSync(source) || !statSync(source).isFile()) return "";
      const destination = join(scratch, name);
      writeFileSync(destination, readFileSync(source));
      return destination;
    };
    artifactA = copyAside(A, "tenant-a.artifact");
    artifactB = copyAside(B, "tenant-b.artifact");
    artifactC = copyAside(C, "tenant-c.artifact");

    // ── §G the owner's export, run BEFORE anything below mutates tenant A. ────────────────────
    exportRun = await runDeclared(scripts["export-org"], ["--org", A.org_id, "--out", exportDir], {
      DATABASE_URL: databaseUrl(),
    });
    const eventsFile = kindsOf(exportRun.records, EXPORT_KIND)[0]?.jobs.events;
    if (typeof eventsFile === "string" && eventsFile !== "" && existsSync(eventsFile)) {
      exportedLines = readFileSync(eventsFile, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "");
    }
    exportSnapshotA = await orgSnapshot(sql, A.org_id);

    // ── §D1/§D2 the DIVERT restore: a second, empty database, migrated the declared way. ──────
    const targetName = `jobs_restore_${RUN}`;
    try {
      const admin = postgres(databaseUrl(), { max: 1 });
      try {
        await admin.unsafe(`create database ${targetName}`);
      } finally {
        await admin.end({ timeout: 5 });
      }
      const targetUrl = new URL(databaseUrl());
      targetUrl.pathname = `/${targetName}`;
      const migrated = await new Promise<{ code: number | null; noise: string }>((done) => {
        const child = spawn("pnpm --silent migrate", {
          shell: true,
          cwd: GATEWAY_DIR,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, DATABASE_URL: targetUrl.href },
        });
        let noise = "";
        child.stdout.on("data", (chunk: Buffer) => {
          noise += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          noise += chunk.toString("utf8");
        });
        child.on("error", (error) => {
          done({ code: null, noise: `${noise}\n${String(error)}` });
        });
        child.on("close", (code) => {
          done({ code, noise });
        });
      });
      divertMigrate = { ok: migrated.code === 0, note: migrated.noise };
      if (divertMigrate.ok) {
        targetSql = postgres(targetUrl.href, { max: 2 });
        divertRestore = await runDeclared(scripts.restore, ["--file", artifactA], {
          DATABASE_URL: targetUrl.href,
        });
        divertSnapshotA = await orgSnapshot(targetSql, A.org_id);
        divertSnapshotB = await orgSnapshot(targetSql, B.org_id);
      }
    } catch (error) {
      divertMigrate = { ok: false, note: `${divertMigrate.note}\n${String(error)}` };
    }

    // ── §D2/§D3/§D4/§D5 the DESTROY-and-restore, in the live database beside tenant B. ────────
    await destroyTenant(sql, A.org_id);
    destroyRestore = await runDeclared(scripts.restore, ["--file", artifactA], {
      DATABASE_URL: databaseUrl(),
    });
    afterDestroyRestoreA = await orgSnapshot(sql, A.org_id);
    afterDestroyRestoreB = await orgSnapshot(sql, B.org_id);

    secondRestore = await runDeclared(scripts.restore, ["--file", artifactA], {
      DATABASE_URL: databaseUrl(),
    });
    afterSecondRestoreA = await orgSnapshot(sql, A.org_id);

    // `01-F1`: an event appended after the backup was taken must SURVIVE a restore of that backup.
    const tail = await appendTailEvent(sql, A);
    tailEventId = tail.id;
    await runDeclared(scripts.restore, ["--file", artifactA], { DATABASE_URL: databaseUrl() });
    afterTailRestoreIds = await eventIdsOf(sql, A.org_id);

    // ── §D6 a truncated artifact: loud, and NOTHING written. ──────────────────────────────────
    await destroyTenant(sql, A.org_id);
    let corruptFile = "";
    if (artifactA !== "") {
      const bytes = readFileSync(artifactA);
      corruptFile = join(scratch, "tenant-a.truncated");
      // Cut in the MIDDLE, not at the head: a restore that streams rows would have inserted some
      // of them before it hit the damage, which is the case this test exists for.
      writeFileSync(corruptFile, bytes.subarray(0, Math.max(1, Math.floor(bytes.length * 0.6))));
    }
    corruptRestore = await runDeclared(scripts.restore, ["--file", corruptFile], {
      DATABASE_URL: databaseUrl(),
    });
    afterCorruptRestoreA = await orgSnapshot(sql, A.org_id);
    // Put tenant A back, so the shared database is left as this suite found it.
    await runDeclared(scripts.restore, ["--file", artifactA], { DATABASE_URL: databaseUrl() });

    // ── §F an unreadable database, and §C2 the default cadence. ───────────────────────────────
    const broken = startDeclaredWorker(scripts.start ?? "", {
      DATABASE_URL: process.env[BROKEN_DATABASE_URL_ENV] ?? "",
      REDIS_URL: ownRedis,
      BACKUP_DIR: brokenDir,
      BACKUP_INTERVAL_MS: String(TEST_INTERVAL_MS),
      AUDITOR_INTERVAL_MS: String(HOUR),
    });
    brokenRecords = await settle(
      broken,
      (records) => kindsOf(records, BACKUP_FAILED_KIND).length >= 2,
      40_000,
    );
    brokenAlive = broken.alive();
    broken.kill();
    brokenFiles = readdirSync(brokenDir);

    const nightly = startDeclaredWorker(scripts.start ?? "", {
      DATABASE_URL: databaseUrl(),
      REDIS_URL: ownRedis,
      BACKUP_DIR: join(scratch, "backups-nightly"),
      AUDITOR_INTERVAL_MS: String(HOUR),
    });
    nightlyRecords = await settle(
      nightly,
      (records) => kindsOf(records, BOOT_KIND).length > 0,
      30_000,
    );
    nightly.kill();
  });

  afterAll(async () => {
    await targetSql?.end({ timeout: 5 });
    await sql?.end({ timeout: 5 });
    if (scratch !== "") await rm(scratch, { recursive: true, force: true });
  });

  // ══ §0 the fixture is capable of expressing a foreign tenant ═══════════════════════════════

  describe("§0 the fixture", () => {
    it("01-F71: A and B are disjoint in every marker, so a leak between them is DETECTABLE", () => {
      const a = new Set(markersOf(A));
      for (const marker of markersOf(B)) {
        expect(a.has(marker), `A and B share the marker ${marker}`).toBe(false);
      }
      expect(markersOf(A).length).toBeGreaterThan(5);
    });

    /**
     * ⚠ **Asserted over counts CAPTURED AT SEED TIME, never re-queried here** — and that is a
     * measured correction rather than a style choice. The first draft counted rows inside this
     * test, which runs *after* `beforeAll` has deliberately destroyed tenant A to give the restore
     * something to prove: the fixture check failed because the fixture had been demolished on
     * purpose, and once a restore existed it would have started passing *because the restore
     * worked* — a fixture assertion silently depending on the thing it exists to make meaningful.
     *
     * ⚠ **IT COLLECTS EVERY MISS AND ASSERTS ONCE, BECAUSE A LOOP OF `expect`s UNDERSTATES BY
     * DESIGN.** This was a nested `for` of `expect(...).toBeGreaterThan(0)`, so the first empty
     * (table, tenant) pair threw and every pair after it went unevaluated. Measured August 2026:
     * it reported `device_pairings` alone while **four (table, tenant) pairs** were unseeded.
     * Three migrations arrived on their own branches and landed together — `inventory_*` (`0013`),
     * `device_pairings`/`org_pki` (`0014`), `config_*` (`0015`) — and TWO of the three shipped
     * without a seed here; that clause names the branches, not the four. Seeding the one table it named would have moved the failure to
     * the next and read as a **fresh regression** on a green branch, three times over. A failure
     * here names the whole set, so one edit closes it.
     */
    it("both tenants are populated across every kernel table that carries an org_id", () => {
      // ⚠ A FLOOR, not the census — `migratable.test.ts`'s `EXPECTED_TABLES` owns that at exact
      // equality, and duplicating it here would be two writes of one fact. But the floor read
      // **15** while all **21** kernel tables carry `org_id`, so six could have dropped out of
      // this census silently — a stale count inside the very assertion this file exists to keep
      // honest. It only ever rises: a future table WITHOUT an `org_id` does not lower it.
      expect(
        tableNames.length,
        `only ${String(tableNames.length)} kernel tables carry an org_id; 21 did on 2026-08-25 — ` +
          "if a table legitimately lost its org_id, lower this floor deliberately and say why",
      ).toBeGreaterThanOrEqual(21);
      const unseeded: string[] = [];
      for (const tenant of [A, B]) {
        for (const table_name of tableNames) {
          // `!(n > 0)`, not `n === 0`: the faithful negation of the assertion this replaced.
          // `=== 0` would pass a negative count or a NaN through as "seeded".
          if (!((populated[tenant.org_id]?.[table_name] ?? 0) > 0)) {
            unseeded.push(`kernel.${table_name} (${tenant.org_id})`);
          }
        }
      }
      expect(
        unseeded,
        `${String(unseeded.length)} of ${String(tableNames.length * 2)} (table, tenant) pairs had ` +
          `no row when the fixture was seeded:\n  ${unseeded.join("\n  ")}\n` +
          "An equality assertion over an empty table is an assertion about nothing, and this " +
          "fixture is what makes §D bite. THE WHOLE SET IS NAMED ON PURPOSE — see the note above.",
      ).toEqual([]);
    });
  });

  // ══ §A the seam ════════════════════════════════════════════════════════════════════════════

  describe("§A R38: the seam a backup is worthless without", () => {
    it("A1 package.json declares a `restore` command — 'a restore nobody has performed is a backup nobody has'", () => {
      expect(
        scripts.restore,
        "services/jobs declares no `restore` script. R38's acceptance is a RESTORE, and a restore " +
          "that exists only as a paragraph in a runbook is one nobody has run. `provision-device`, " +
          "`revoke-device` and `migrate` on services/sync-gateway are the precedent: an operator " +
          "act is a DECLARED COMMAND.",
      ).toBeTypeOf("string");
    });

    it("A2 the boot report names the backup directory and cadence, with the DSN password removed", () => {
      const boot = kindsOf(passRecords, BOOT_KIND)[0];
      expect(boot?.jobs.backup_dir, "no `backup_dir` on the boot record").toBe(backupDir);
      expect(Number(boot?.jobs.backup_interval_ms)).toBe(TEST_INTERVAL_MS);
      expect(String(boot?.jobs.database)).not.toContain("restos-jobs-suite-password");
    });

    it("A3 22-F22: the RPO it STATES is the interval it actually runs at, not 22-F1's 5 minutes", () => {
      const boot = kindsOf(passRecords, BOOT_KIND)[0];
      // ⚠ The anchor, and it is not decoration: `Object.is(NaN, NaN)` is TRUE, so without this
      // line the equality below is GREEN against a host that states neither number. Measured on
      // this suite's own first run — the assertion passed while nothing was implemented.
      expect(
        Number.isFinite(Number(boot?.jobs.backup_rpo_ms)),
        "no numeric `backup_rpo_ms` on the boot record",
      ).toBe(true);
      expect(
        Number(boot?.jobs.backup_rpo_ms),
        "22-F22: 'the real RPO is the dump interval, and that number MUST be written into the " +
          "deployment's runbook beside the command that produces it'. A host that prints 22-F1's " +
          "300000 while dumping nightly is claiming an objective it does not meet.",
      ).toBe(Number(boot?.jobs.backup_interval_ms));
    });
  });

  // ══ §B per-tenant ══════════════════════════════════════════════════════════════════════════

  describe("§B R38 / 28-F1: PER TENANT, and a tenant is an org", () => {
    it("B1 every org gets its own result record — including the one that has never traded", () => {
      for (const tenant of [A, B, C]) {
        expect(
          backupsFor(passRecords, tenant.org_id).length,
          `no backup_result for ${tenant.org_id}. Tenant C has a kernel.orgs row and NO ` +
            "org_sequences row, because that counter is written the first time an org's ledger " +
            "receives anything — so a backup that discovers orgs the way `everyOrg` does (from " +
            "kernel.org_sequences, 'cheaper than a distinct over kernel.events') loses every " +
            "restaurant that has signed up and not yet traded. 22 §1 makes nothing in doc 22 " +
            "size-dependent and 01-F68 calls such an org UNNAMED, not invalid.",
        ).toBeGreaterThanOrEqual(1);
      }
    });

    it("B2 each record names a FILE that exists — one artifact per org per pass", () => {
      for (const tenant of [A, B, C]) {
        const artifact = artifactOf(backupsFor(passRecords, tenant.org_id).at(-1));
        expect(artifact, `no artifact path for ${tenant.org_id}`).not.toBe("");
        expect(existsSync(artifact), `${artifact} does not exist`).toBe(true);
        expect(statSync(artifact).isFile(), `${artifact} is not a file`).toBe(true);
        expect(statSync(artifact).size).toBeGreaterThan(0);
      }
      const perPass = new Set(
        kindsOf(passRecords, BACKUP_KIND).map((record) => artifactOf(record)),
      );
      expect(perPass.size).toBeGreaterThanOrEqual(3);
    });

    it("B3 01-F71: each tenant's artifact carries NO byte of another — a cluster dump is not a per-tenant backup", () => {
      const pairs: readonly (readonly [Tenant, string, Tenant])[] = [
        [A, artifactA, B],
        [B, artifactB, A],
      ];
      for (const [own, artifact, other] of pairs) {
        expect(artifact, `${own.org_id} produced no artifact to inspect`).not.toBe("");
        const bytes = readFileSync(artifact).toString("binary");
        // The control comes FIRST, and it is what stops this passing on a compressed or empty
        // file: the tenant's own marker must be findable by the same method that looks for the
        // other's. Without it, "the other tenant is not in it" is green on a zero-byte artifact.
        expect(
          bytes.includes(own.org_id),
          `${own.org_id}'s own org_id is not findable in its own artifact, so "the other tenant ` +
            'is not in it" proves nothing — either the artifact is empty or it is encoded in a ' +
            "way this sweep cannot read, and the isolation claim has to be made another way",
        ).toBe(true);
        for (const marker of markersOf(other)) {
          expect(
            bytes.includes(marker),
            `${own.org_id}'s backup artifact contains ${other.org_id}'s ${marker}. ONE ` +
              "cluster-wide dump written under each org's name restores perfectly and hands " +
              "every restaurant a copy of every other restaurant's ledger (01-F71, 28-F1). " +
              "Both directions are asserted because a filter applied to one tenant and not the " +
              "other is a one-branch mutant.",
          ).toBe(false);
        }
      }
    });

    it("B4 the tenant that has never traded gets a REAL artifact, not a zero-byte placeholder", () => {
      expect(artifactC, "the never-traded tenant produced no artifact").not.toBe("");
      const bytes = readFileSync(artifactC).toString("binary");
      expect(
        bytes.includes(C.org_id),
        "the artifact for a tenant with an org row and no events does not even name that org. " +
          "22 §1 makes nothing in doc 22 size-dependent, and 01-F68's org record is the row that " +
          "gives a restaurant its name — restoring a tenant without it restores an UNNAMED org.",
      ).toBe(true);
    });
  });

  // ══ §C the schedule ════════════════════════════════════════════════════════════════════════

  describe("§C R38 'NIGHTLY' / 18 §5 'scheduled work uses BullMQ repeatables — no OS cron'", () => {
    it("C1 every tenant is backed up more than once — a run-once-at-boot script is not a schedule", () => {
      for (const tenant of [A, B, C]) {
        expect(
          backupsFor(passRecords, tenant.org_id).length,
          `${tenant.org_id} was backed up fewer than twice in 90000 ms at a ` +
            `${String(TEST_INTERVAL_MS)} ms cadence`,
        ).toBeGreaterThanOrEqual(2);
      }
    });

    it("C2 the DEFAULT cadence is a night, not a minute and not a week", () => {
      const boot = kindsOf(nightlyRecords, BOOT_KIND)[0];
      const interval = Number(boot?.jobs.backup_interval_ms);
      expect(interval, "no backup_interval_ms on a boot with BACKUP_INTERVAL_MS unset").toBeTypeOf(
        "number",
      );
      expect(interval).toBeGreaterThanOrEqual(12 * HOUR);
      expect(interval).toBeLessThanOrEqual(48 * HOUR);
    });

    it("C3 18 §5: it schedules through BullMQ — the Redis it was handed holds a backup queue", () => {
      expect(
        redisKeyNames.some((key) => key.toLowerCase().includes("backup")),
        "no BullMQ key naming a backup queue in this suite's Redis database. 18 §5 puts scheduled " +
          "work on repeatables in one sentence, so a bare setInterval is a spec violation rather " +
          `than a shortcut. Keys seen: ${redisKeyNames.join(", ")}`,
      ).toBe(true);
    });
  });

  // ══ §D THE RESTORE — R38's acceptance ══════════════════════════════════════════════════════

  describe("§D R38: 'the acceptance is a RESTORE, not a dump'", () => {
    it("D1 a tenant restored into an EMPTY database is byte-identical to the tenant that was backed up", () => {
      expect(
        divertMigrate.ok,
        `the restore target could not be migrated: ${divertMigrate.note}`,
      ).toBe(true);
      expect(divertRestore.declared, "no `restore` script — see §A1").toBe(true);
      expect(
        divertRestore.code,
        `restore exited ${String(divertRestore.code)}:\n${divertRestore.out}`,
      ).toBe(0);
      expect(
        divertSnapshotA,
        "the restored tenant is not the tenant that was backed up. This is the assertion R38 " +
          "exists for, and it spans every kernel table carrying an org_id — a backup of " +
          "kernel.events alone restores a restaurant with a ledger, no menu, no branches, no " +
          "staff and no devices.",
      ).toBe(before[A.org_id]);
    });

    it("D2 01-F71: restoring tenant A writes NOTHING belonging to tenant B", () => {
      // THE CONTROL COMES FIRST. "B did not change" is trivially true of a restore that did
      // nothing at all, so this test states, before anything else, that the restore under
      // examination genuinely wrote tenant A back into a database it had been deleted from.
      expect(
        afterDestroyRestoreA,
        "the restore did not bring tenant A back, so the two isolation claims below are about a " +
          "restore that never happened (01-F71's own lesson: 'refused' and 'served nothing' are " +
          "separate claims)",
      ).toBe(before[A.org_id]);
      // In the live database, where B is genuinely present and could be overwritten:
      expect(
        afterDestroyRestoreB,
        "restoring tenant A changed tenant B's rows in the live database",
      ).toBe(before[B.org_id]);
      // And in the fresh target: B was never there and must not arrive with A's bundle.
      expect(
        divertSnapshotB,
        "tenant B appeared in a database that only tenant A was restored into",
      ).toBe(EMPTY);
    });

    it("D3 01-F1: the restore RECONSTRUCTS history — it does not re-stamp or re-mint it", async () => {
      expect(
        destroyRestore.code,
        `restore exited ${String(destroyRestore.code)}:\n${destroyRestore.out}`,
      ).toBe(0);
      const restored = (
        await sql<{ id: string; server_received_at: number; envelope: EventEnvelopeT }[]>`
          select id, server_received_at, envelope from kernel.events
          where org_id = ${A.org_id} and lamport_seq = 0`
      )[0];
      expect(
        restored?.id,
        "the restored event has a different id — the ledger was re-authored",
      ).toBe(storedEnvelopeA?.id);
      expect(
        JSON.stringify(restored?.envelope),
        "the restored envelope is not the envelope that was stored. 01-F1 forbids mutating " +
          "history, and a restore that re-serialises, re-orders or drops a field of an envelope " +
          "has rewritten it — 01-F5's hash chain is computed over exactly these bytes.",
      ).toBe(JSON.stringify(storedEnvelopeA));
    });

    it("D4 01-F1 / commandment 1: an event appended AFTER the backup survives the restore", () => {
      expect(
        afterTailRestoreIds,
        "a 'clean restore' that truncates the org before inserting DELETED an event the backup " +
          "never held. 01-F1 has no delete path in any API; a restore reconstructs what was lost " +
          "and never removes what is there. 22-F7's tail heal assumes exactly this: devices " +
          "re-push above the reverted high-water mark and event-id idempotency (01-F8) dedupes.",
      ).toContain(tailEventId);
      for (const id of seededEventIds) expect(afterTailRestoreIds).toContain(id);
    });

    it("D5 18 §5 / 01-F8: the restore is IDEMPOTENT — running it twice is running it once", () => {
      expect(
        secondRestore.code,
        `the second restore exited ${String(secondRestore.code)}:\n${secondRestore.out}`,
      ).toBe(0);
      expect(
        afterSecondRestoreA,
        "a second restore of the same artifact changed the tenant — duplicated rows, a renumbered " +
          "global_seq, or a bumped sequence. 18 §5 requires every job idempotent and 01-F8 makes " +
          "event ids the key that permits it.",
      ).toBe(afterDestroyRestoreA);
    });

    it("D6 a TRUNCATED artifact is refused loudly and writes NOTHING", () => {
      // ⚠ ANCHORED THROUGH A REAL RUN. A `refuses(...)` assertion against a command that does not
      // exist passes for free — this suite's own first run measured exactly that, because a
      // missing script reports a `null` exit code, which is `not.toBe(0)`. This test is about a
      // command that RAN and refused, so it says so.
      expect(
        corruptRestore.declared,
        "no `restore` script, so 'a truncated artifact is refused' is a claim about nothing — " +
          "see §A1",
      ).toBe(true);
      expect(
        corruptRestore.code,
        "a restore of a truncated artifact did not report an exit status at all",
      ).not.toBe(null);
      expect(
        corruptRestore.code,
        "a restore of a truncated artifact exited 0. 22-F21's rule is the general one: a backup " +
          "artifact that cannot be restored is worse than a missing one, because it retires the " +
          `alarm. Output:\n${corruptRestore.out}`,
      ).not.toBe(0);
      expect(
        afterCorruptRestoreA,
        "a half-restored tenant. A streaming restore that inserts what it can parse and then dies " +
          "leaves a restaurant in a state nobody can name and no assertion can catch — it is " +
          "neither the lost state nor the backed-up one.",
      ).toBe(EMPTY);
    });
  });

  // ══ §E the backup writes nothing ═══════════════════════════════════════════════════════════

  describe("§E 01-F1: a backup is a READ", () => {
    it("E1 no kernel row of any tenant changed across two backup passes", () => {
      // The anchor: an invariance assertion over a job that never ran is an assertion about
      // nothing, and it would stay green for ever.
      expect(
        kindsOf(passRecords, BACKUP_KIND).length,
        "no backup pass was observed, so 'the backup changed nothing' is vacuous",
      ).toBeGreaterThan(0);
      for (const tenant of [A, B, C]) {
        expect(
          afterPasses[tenant.org_id],
          `the backup host changed kernel rows for ${tenant.org_id}. A "last_backup_at" row ` +
            "booked into the kernel schema is a write laundered through the one job that has no " +
            "business writing, and 01-F1 reaches every row of it.",
        ).toBe(before[tenant.org_id]);
      }
    });

    it("E2 nor did the export command (22-F16 reads; it does not annotate)", () => {
      expect(exportRun.code, `export-org did not run: ${exportRun.out}`).toBe(0);
      expect(exportSnapshotA).toBe(before[A.org_id]);
    });
  });

  // ══ §F a database it cannot read ═══════════════════════════════════════════════════════════

  describe("§F 00 §5.7 / 20 §4.2: a backup that cannot run is LOUD, and leaves no file behind", () => {
    it("F1 it says so at error level, twice, and stays up", () => {
      const failures = kindsOf(brokenRecords, BACKUP_FAILED_KIND);
      expect(
        failures.length,
        "fewer than two backup_failed records against an unreadable database. One record cannot " +
          "distinguish a host that keeps trying from one whose schedule died with the fault; zero " +
          `records is a silent backup, which is the state doc 22 has been in for a month.\n${JSON.stringify(
            brokenRecords,
          ).slice(0, 2000)}`,
      ).toBeGreaterThanOrEqual(2);
      expect(Number(failures[0]?.level)).toBeGreaterThanOrEqual(ERROR_LEVEL);
      expect(String(failures[0]?.jobs.error)).toMatch(/kernel|relation|schema|events|orgs/i);
      expect(brokenAlive).toBe(true);
    });

    it("F2 22-F21: a run that cannot produce a restorable artifact produces NO artifact", () => {
      // The control: a host that writes NO file ever passes "the broken run wrote no file". So
      // the healthy directory must be non-empty by the same measurement, in the same test.
      expect(
        readdirSync(backupDir).length,
        "the HEALTHY backup directory is empty too, so 'the broken one wrote nothing' says " +
          "nothing about a refusal — it says this host does not write artifacts at all",
      ).toBeGreaterThan(0);
      expect(
        brokenFiles,
        "a failed backup pass left files behind. 22-F21: 'A run that can do neither MUST fail " +
          "loudly and produce no file — a backup artifact that cannot be restored is worse than a " +
          "missing one, because it retires the alarm.'",
      ).toEqual([]);
    });
  });

  // ══ §G the owner's export ══════════════════════════════════════════════════════════════════

  describe("§G 22-F16 / R38: an owner-triggered export of the org's own data", () => {
    it("G1 package.json declares `export-org`, so an export can be generated at all", () => {
      expect(scripts["export-org"]).toBeTypeOf("string");
    });

    it("G2 it exits 0 and names a bundle file that exists", () => {
      expect(exportRun.declared, "no `export-org` script — see §G1").toBe(true);
      expect(exportRun.code, `export-org exited ${String(exportRun.code)}:\n${exportRun.out}`).toBe(
        0,
      );
      const record = kindsOf(exportRun.records, EXPORT_KIND)[0];
      expect(record?.jobs.org_id).toBe(A.org_id);
      expect(String(record?.jobs.events)).not.toBe("");
      expect(existsSync(String(record?.jobs.events))).toBe(true);
    });

    it("G3 22-F16: the event log is JSONL of CANONICAL envelopes — no proprietary format", () => {
      expect(exportedLines.length, "the exported event log is empty").toBeGreaterThan(0);
      for (const line of exportedLines) {
        const value: unknown = JSON.parse(line);
        // `parseEvent` is the registry gate 01-F4 admits an envelope through. An export whose
        // lines do not pass it is not "canonical envelopes"; it is this product's own shape,
        // which is the proprietary format 22-F16 forbids by name.
        expect(() => parseEvent(value)).not.toThrow();
      }
    });

    it("G4 the bundle is COMPLETE — every event the tenant has, not a page of them", () => {
      const exported = exportedLines
        .map((line) => (JSON.parse(line) as { id?: string }).id ?? "")
        .sort();
      expect(
        exported,
        "22-F16 says 'the org's COMPLETE event log'. A bundle missing events is an export an " +
          "owner cannot leave on, and it is also the control that stops §G5 passing on an empty " +
          "file.",
      ).toEqual([...seededEventIds].sort());
    });

    it("G5 01-F71: and carries no event of any other tenant", () => {
      // Anchored through a bundle that HAS something in it. `not.toContain(B)` is green on an
      // empty file, which is this repo's named third failure pattern and was measured on this
      // suite's own first run.
      expect(
        exportedLines.length,
        "the export bundle is empty, so 'it carries no other tenant' is a claim about nothing",
      ).toBeGreaterThan(0);
      const exported = new Set(
        exportedLines.map((line) => (JSON.parse(line) as { id?: string }).id ?? ""),
      );
      for (const id of bEventIds) {
        expect(exported.has(id), `tenant B's event ${id} is in tenant A's export bundle`).toBe(
          false,
        );
      }
      const bytes = exportedLines.join("\n");
      for (const marker of markersOf(B)) {
        expect(bytes.includes(marker), `tenant B's ${marker} is in tenant A's export bundle`).toBe(
          false,
        );
      }
    });
  });
});
