/**
 * **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2, `20 §4.3` separation rule). Sources read:
 * `specs/20-testing-correctness.md` §4.2 (in full), `specs/18-engineering-handbook.md` §§4/5/14/15,
 * `specs/22-operations-recovery.md`, `specs/DECISIONS.md` (`DEC-MONEY-009`), `specs/01-kernel-sync.md`
 * (`01-F1`/`01-F3`/`01-F4`/`01-F8`/`01-F30`/`01-F62`), `services/jobs/CLAUDE.md`,
 * `services/sync-gateway/src/auditor.ts`, and the landed process precedent
 * `services/sync-gateway/src/{server.ts,__acceptance__/startable.test.ts}`. **No plan for this task
 * was opened; no implementation of `services/jobs` exists at authoring time.**
 *
 * ═══ WHAT THIS FILE IS FOR ════════════════════════════════════════════════════════════════════
 *
 * `20 §4.2`: *"A nightly cloud job per org: refold the entire ledger from raw events with the
 * current fold code and diff against the incrementally-maintained read models and last-reported
 * device states. Any diff = high-priority alert + release-train block. Plus continuous invariant
 * checks, asserted inline in dev/staging (fail fast) and **logged + alerted in production (never
 * crash a service mid-service)**"* … *"The Auditor is the single highest-value correctness artifact
 * we build. **It ships in Wave 0 with the kernel, not later.**"*
 *
 * `runAuditor` exists, is correct and is covered by ten suites. **Nothing runs it.** Its own source
 * says so — `services/sync-gateway/src/auditor.ts` carries `@unreached-owed` naming `20 §4.2` and
 * `services/jobs` by name, and `services/jobs/src/index.ts` is `export {};` with no `dev`/`start`
 * script, so it cannot be run at all. `DEC-MONEY-009` records what that costs: its partition case
 * is open **by construction**, and *"a scheduled Auditor"* is one of the three things its residual
 * column names as owed. Run **by hand** against the very database that held a doubled payment it
 * returned `ok: true`. So this suite's subject is not the Auditor — it is the **HOST**.
 *
 * ⚠ **The paragraph above is the state at AUTHORING TIME and is deliberately not rewritten** — it
 * is the provenance record `24 §3` asks for, and the whole file is an argument against a state it
 * would be pointless to describe in the past tense. What has since changed, dated so a reader can
 * tell: the host **landed** (`services/jobs/src/index.ts` is a BullMQ worker, not `export {}`), and
 * the marker on `runAuditor`'s own declaration is **gone**. One marker remains in `auditor.ts`, on
 * the `read_model` property, and Rule B **requires** it — see §H, which used to forbid it.
 *
 * ═══ AIMED AT THE CASE THAT MATTERS, NOT AT THE MECHANISM (the round-3 law) ═══════════════════
 *
 * A host that runs *something* on a timer and prints *something* is trivially built and worthless.
 * Every assertion below is pointed at a specific plausible-wrong host:
 *
 *   §B  audits ONE org (an `ORG_ID` env var), or the first row discovery returns, or the last.
 *       Three orgs are seeded whose ids SORT clean-first / broken-middle / broken-last, two of them
 *       broken in DIFFERENT legs, and the clean one must come back clean.
 *   §C  audits once at boot and then re-prints a cached report. An org that is clean when the
 *       worker starts is corrupted WHILE IT RUNS and must be reported broken afterwards.
 *   §D  logs findings at `info` — technically "logged", operationally silent, which is exactly the
 *       state `DEC-MONEY-009` is in today. Asserted two-sided: a clean pass must NOT be an error,
 *       because a host that shouts on every pass is as silent as one that never shouts.
 *   §E  "helps" — heals a gap, or writes a bookkeeping row into `kernel`. The Auditor writes
 *       nothing, ever (`01-F1`); a host must not launder a write through it.
 *   §F  lets the first database fault kill the timer. `services/sync-gateway/src/server.ts` names
 *       this hazard in its own revocation sweep: *"a transient DB fault cannot kill the timer and
 *       silently retire the guarantee"*.
 *   §G  drives the schedule with `setInterval`. `18 §5` forbids that in one sentence.
 *
 * ═══ ORACLE-PINNED HOST SURFACE — BINDING FOR THE IMPLEMENTING SESSION ════════════════════════
 *
 * (The `global-setup.ts` "MIGRATE SEAM" block in `services/sync-gateway` is the precedent for
 * pinning a surface an oracle needs before the implementation exists.)
 *
 *   1. `services/jobs/package.json` declares **`start`** (run the worker once, long-lived) and
 *      **`dev`** (the watch variant). This file executes the DECLARED `start` string, never a
 *      hardcoded command — a test that hardcodes the command keeps passing after someone deletes
 *      the script, which is the state this service is in today.
 *
 *   2. **Env.** `DATABASE_URL` — the kernel database to audit. `REDIS_URL` — the queue backend
 *      (`18 §5`). `AUDITOR_INTERVAL_MS` — the audit cadence in milliseconds; **optional**, and its
 *      default is nightly (`20 §4.2`). The knob exists because "nightly" is not observable inside a
 *      test's lifetime. A cron *pattern* would be an equally faithful reading of "nightly"; this
 *      suite pins the simpler single mechanism (`24 §3b`) and §C3 only requires the default to be
 *      genuinely nightly (12–48 h), not a particular number.
 *
 *   3. **Structured JSON on stdout** (`18 §5`: pino, structured JSON). Every record this worker
 *      writes carries a top-level `jobs` object and a numeric pino `level`:
 *
 *        boot           { jobs: { kind: "boot", database: <DSN, password removed>,
 *                                 auditor_interval_ms: number } }
 *        per-org result { jobs: { kind: "auditor_result", org_id: string, ok: boolean,
 *                                 findings: AuditorFinding[] } }          ← ONE PER ORG PER PASS,
 *                                                                            clean orgs included
 *        failed pass    { jobs: { kind: "auditor_failed", error: string } }
 *
 *      `findings` is `runAuditor`'s own array, unmodified — `{ check, org_id, device_id, order_id,
 *      event_id, lamport_seq, detail }`. **A clean org must still get a record**: without one,
 *      "org X was audited" is unobservable and a host that silently skips orgs passes every test.
 *
 *      ⚠ The literal `"jobs"` key and the three `kind` values are hand-copied into this file rather
 *      than imported, because the module they would be imported from does not exist yet and a
 *      broken import is not a legitimate red (`24 §3`). The `K-3` dead-oracle hazard is about a
 *      hand-copy that stays GREEN while the product changes; a rename here turns this suite RED,
 *      which is the safe direction.
 *
 * ═══ WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT ═════════════════════════════════════════════
 *
 *   - **Where a finding is ALERTED.** `20 §4.2` says "high-priority alert"; `18 §5` puts the alert
 *     surface in doc 15 fleet health, which does not exist. Emitting an event instead is
 *     *unbuildable*, not merely unbuilt: `alert.raised` is in the `01 §4` catalog but has **no
 *     payload schema in `packages/domain`** (so `01-F4` refuses it) and **no `01-F62` org-scoped
 *     slot** (the set is five types, and the Auditor is a cloud job with no device to stamp a
 *     branch envelope) — the same trap `05-F28` records. Asserting an alert path would be
 *     commandment 2. **Logging is where a finding terminates today, and the alert half is OWED.**
 *   - **BullMQ's deterministic job id, retries and DLQ** (`18 §5`). Real requirements, but they are
 *     properties of a *failing* job, and the failure mode this task exists to close is a job that
 *     never runs. Asserting a job id from outside the process would be asserting a mechanism.
 *   - **`20 §4.2`'s read-model diff leg.** `runAuditor`'s `read_model` argument is optional and no
 *     cloud per-module read model exists to feed it (`auditor.ts`'s own note). Requiring the host
 *     to supply one would invent the projection.
 *
 * ═══ MUTATION MATRIX (the round-3 law) — control 19/19 green, 0 survivors ═════════════════════
 *
 * A plausible host was built OUT OF TREE (BullMQ repeatable + pino + the real `runAuditor` against
 * the real Postgres), taken green, then broken one branch at a time. `REAL_EXIT` was read from a
 * marker written inside each log, never from a reported status.
 *
 * ⚠ **The `/19` denominator below is the count as AUTHORED. §H was rewritten on 2026-08-11 and is
 * two tests rather than one, so the control is now 20/20; its own matrix (11 mutants, 0 survivors,
 * plus three `seams:check` exit codes) lives at §H, beside the assertions it measures.** Nothing
 * else in this table moved — the rewrite touched §H only.
 *
 *   #     mutant (exactly one branch)                                             tests failed /19
 *   M1    `scripts.start` deleted — the state this service is in today            all (hook refuses)
 *   M2    **`runAuditor` never called; a fabricated clean report per org**        **5**
 *   M3    audits only the FIRST org discovery returns                             all (hook refuses)
 *   M4    **audits at boot, then re-prints the cached report for ever**           **1 — §C2**
 *   M5    **findings logged at `info`**                                           **1 — §D1**
 *   M6    every pass logged at `error`, clean ones included                       1 — §D2
 *   M7    an unreadable database is swallowed with no record                      1 — §F
 *   M8    **an unreadable database is FATAL — the timer dies with it**            **1 — §F**
 *   M9    the default cadence is five minutes instead of a night                  1 — §C3
 *   M10   the boot record prints the RAW DSN                                      2 — §A2, §F
 *   M11   **the host "heals" a lamport_gap by inserting the missing row**         **1 — §E**
 *   M12   `setInterval` instead of a BullMQ repeatable                            2 — §G
 *   M13   every record filed under the first org                                  all (hook refuses)
 *   M13b  **records labelled right, findings computed for another org**           **1 — §B**
 *   M14   clean orgs produce no record                                            all (hook refuses)
 *   M16   a one-shot host wearing a schedule (exits after its third pass)         1 — §D3
 *   M17   ~~the `@unreached-owed` marker left in place~~ **RETIRED 2026-08-11**   see §H
 *   M15   **NEGATIVE CONTROL: a real refactor — same states, same levels,         **0**
 *         same writes, restructured emit path and different prose everywhere**
 *
 * **M2, M4 and M8 are the ones to re-run after any change here.** M2 is the seam row and the
 * reason this file exists: a host that schedules perfectly and never calls the Auditor is this
 * wave's named defect with a timer bolted on. M4 is the row that no amount of reading finds — the
 * suite looked complete before that assertion existed, and a cached report satisfies everything
 * else. M8 is the `20 §4.2` row.
 *
 * ⚠ **Two results are worth keeping for what they say about the SUITE rather than the host.**
 * (1) M3/M13/M14 kill by failing the boot hook, which reports nineteen tests as *skipped* — a real
 * kill with no attributable assertion. M13b was built to give §B's attribution claim its own
 * pointed mutant, and M4/M8 were deliberately reshaped so their defect reaches an assertion
 * instead of the hook. (2) The FIRST version of §A3 ("it stays up") **survived M16** — it looks at
 * liveness the instant the hook returns, and a host that dies three passes later is still alive
 * then. Reading the test did not show that; mutating it did.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BROKEN_DATABASE_URL_ENV, REDIS_URL_ENV } from "./global-setup.js";
import {
  databaseUrl,
  deleteEventAtSlot,
  identityFor,
  openSql,
  orgSnapshot,
  redisKeyCount,
  type Sql,
  seedCleanOrg,
  seedConservationOrg,
  seedCorruptEventOrg,
  seedLamportGapOrg,
} from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");
const HOST_ENTRY = join(PKG_DIR, "src", "index.ts");

/** Fast enough to observe several passes; slow enough that a pass is never re-entered. */
const TEST_INTERVAL_MS = 1_000;

// ── the pinned record shapes (see the header for why these are literals) ─────────────────────
const JOBS_KEY = "jobs";
const BOOT_KIND = "boot";
const RESULT_KIND = "auditor_result";
const FAILED_KIND = "auditor_failed";
/** pino's numeric levels: 30 info, 40 warn, 50 error, 60 fatal. */
const ERROR_LEVEL = 50;

type Finding = {
  check: string;
  org_id: string;
  device_id: string | null;
  order_id: string | null;
  event_id: string | null;
  lamport_seq: number | null;
  detail: string;
};
type JobsRecord = {
  level?: unknown;
  jobs: {
    kind?: unknown;
    org_id?: unknown;
    ok?: unknown;
    findings?: unknown;
    database?: unknown;
    auditor_interval_ms?: unknown;
    error?: unknown;
  };
};

type Worker = {
  readonly records: () => JobsRecord[];
  readonly output: () => string;
  readonly alive: () => boolean;
  readonly kill: () => void;
};

/**
 * Runs `scripts.start` exactly as a package manager would: the declared command string, through a
 * shell, from the package root, with the package's own `node_modules/.bin` on `PATH`.
 */
const startDeclaredWorker = async (
  script: string,
  env: Record<string, string>,
): Promise<Worker> => {
  const child = spawn(script, {
    shell: true,
    cwd: PKG_DIR,
    // Its own process group: `shell: true` can leave the runner's child behind when the shell is
    // signalled, and an orphaned worker outlives the suite and keeps auditing.
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

  const kill = (): void => {
    if (child.pid === undefined || child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };

  const records = (): JobsRecord[] => {
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

  return {
    records,
    output: () => `stdout:\n${out}\nstderr:\n${err}`,
    alive: () => !exited,
    kill,
  };
};

/** Polls until `predicate` holds, then returns. Fails with the worker's whole output. */
const waitFor = async (
  worker: Worker,
  label: string,
  predicate: (records: JobsRecord[]) => boolean,
  budgetMs = 40_000,
): Promise<JobsRecord[]> => {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const seen = worker.records();
    if (predicate(seen)) return seen;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${String(budgetMs)} ms waiting for: ${label}\n${worker.output()}`,
      );
    }
    if (!worker.alive()) {
      throw new Error(`the worker EXITED while waiting for: ${label}\n${worker.output()}`);
    }
    await new Promise((done) => setTimeout(done, 200));
  }
};

/**
 * Like `waitFor`, but it never throws: it returns whatever the worker has said by the deadline, or
 * as soon as the predicate holds, or as soon as the worker dies. Used where the worker's DEATH is
 * itself one of the outcomes under test (§F) and must reach an assertion rather than the hook.
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

const resultsFor = (records: JobsRecord[], orgId: string): JobsRecord[] =>
  records.filter((r) => r.jobs.kind === RESULT_KIND && r.jobs.org_id === orgId);

const findingsOf = (record: JobsRecord | undefined): Finding[] =>
  Array.isArray(record?.jobs.findings) ? (record.jobs.findings as Finding[]) : [];

const checksIn = (record: JobsRecord | undefined): string[] =>
  findingsOf(record).map((f) => f.check);

type Scripts = Record<string, string | undefined>;
const readPackageJson = async (): Promise<{
  scripts?: Scripts;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}> => JSON.parse(await readFile(join(PKG_DIR, "package.json"), "utf8"));

// ── the fixture orgs. The id PREFIXES fix their sort order (see §B). ─────────────────────────
const clean = identityFor("org-jobs-a-clean");
const gap = identityFor("org-jobs-m-gap");
const money = identityFor("org-jobs-w-money");
const corrupt = identityFor("org-jobs-z-corrupt");

let sql: Sql;
/** The long-lived worker under test. Everything except §C3 and §F reads this one. */
let worker: Worker;
/** The records as they stood BEFORE §C corrupts anything — §B and §D read only these. */
let baseline: JobsRecord[] = [];
/** §C3's evidence: a worker started with NO interval knob, observed at boot and then stopped. */
let nightlyRecords: JobsRecord[] = [];
/** §F's evidence, captured at the moment two failed passes had landed. */
let brokenRecords: JobsRecord[] = [];
let brokenStillAlive = false;
let brokenOutput = "";
const beforeSnapshots: Record<string, string> = {};
let moneyOrderId = "";

describe("services/jobs hosts the Auditor as a running process (20 §4.2)", () => {
  beforeAll(async () => {
    sql = openSql();
    await seedCleanOrg(sql, clean);
    await seedLamportGapOrg(sql, gap);
    moneyOrderId = await seedConservationOrg(sql, money);
    await seedCorruptEventOrg(sql, corrupt);

    // §E's "before" — taken while nothing is running, so the comparison is about the worker.
    for (const identity of [clean, gap, money, corrupt]) {
      beforeSnapshots[identity.org_id] = await orgSnapshot(sql, identity.org_id);
    }

    const pkg = await readPackageJson();
    const start = pkg.scripts?.start;
    if (start === undefined) {
      throw new Error(
        "services/jobs/package.json declares no `start` script, so nothing can run the Auditor. " +
          "That IS the defect this suite exists for (20 §4.2 ships the Auditor in Wave 0); every " +
          "assertion below is red until the script exists.",
      );
    }

    const redisUrl = process.env[REDIS_URL_ENV] ?? "";

    /**
     * ⚠ **THE THREE WORKERS RUN IN SEQUENCE, AND THAT IS LOAD-BEARING RATHER THAN TIDY.** A
     * deployment runs ONE jobs worker against one Redis; three of them sharing it is this harness's
     * artefact, and they COMPETE — a second worker's scheduler upsert overwrites the first's
     * cadence, and a second consumer on the same queue takes passes the first was waiting for.
     * Measured: with all three running concurrently the main worker got its interval clobbered to
     * the 24 h default and stopped after ONE pass, and the suite passed only because the two
     * passes it needed happened to land before the clobber. A test that passes on a race is worse
     * than one that fails. So each side-worker is observed for exactly the fact it exists to
     * supply, then stopped, and the worker under test runs alone for the rest of the file.
     */
    const nightly = await startDeclaredWorker(start, {
      DATABASE_URL: databaseUrl(),
      REDIS_URL: redisUrl,
    });
    try {
      nightlyRecords = await waitFor(
        nightly,
        "a boot record from a worker started with NO AUDITOR_INTERVAL_MS",
        (records) => records.some((r) => r.jobs.kind === BOOT_KIND),
      );
    } finally {
      nightly.kill();
    }

    const broken = await startDeclaredWorker(start, {
      DATABASE_URL: process.env[BROKEN_DATABASE_URL_ENV] ?? "",
      REDIS_URL: redisUrl,
      AUDITOR_INTERVAL_MS: String(TEST_INTERVAL_MS),
    });
    try {
      // `settle`, not `waitFor`: a worker that DIES on its first database fault is exactly what §F
      // exists to catch, and throwing here would fail the hook and report all nineteen tests as
      // skipped — a kill nobody can attribute to an assertion.
      brokenRecords = await settle(
        broken,
        (records) => records.filter((r) => r.jobs.kind === FAILED_KIND).length >= 2,
        30_000,
      );
      // Captured HERE, not in the test: "it was still running after two consecutive faults" is
      // only observable while it is still running.
      brokenStillAlive = broken.alive();
      brokenOutput = broken.output();
    } finally {
      broken.kill();
    }

    worker = await startDeclaredWorker(start, {
      DATABASE_URL: databaseUrl(),
      REDIS_URL: redisUrl,
      AUDITOR_INTERVAL_MS: String(TEST_INTERVAL_MS),
    });
    // Two complete passes over every org, so §C1 is about repetition and §B about coverage.
    baseline = await waitFor(
      worker,
      "two audit passes over all four seeded orgs",
      (records) =>
        [clean, gap, money, corrupt].every(
          (identity) => resultsFor(records, identity.org_id).length >= 2,
        ),
      120_000,
    );
  }, 240_000);

  afterAll(async () => {
    worker?.kill();
    await sql?.end({ timeout: 5 });
  });

  // ══ §A the seam: a DECLARED, RUNNING process ═══════════════════════════════════════════════

  describe("§A the seam between runAuditor and a process that runs it", () => {
    it("20 §4.2: package.json declares run scripts, so the Auditor can be run at all", async () => {
      const pkg = await readPackageJson();
      // The weakest assertions in the file, and here only to name what the rest EXECUTES.
      expect(pkg.scripts?.start, "no `start` script — the Auditor cannot be run").toBeDefined();
      expect(
        pkg.scripts?.dev,
        "no `dev` script — `pnpm dev` is the documented startup",
      ).toBeDefined();
    });

    it("18 §5 / 00 §5.7: it says at boot WHICH database it will audit, with the password removed", () => {
      const boot = worker.records().find((r) => r.jobs.kind === BOOT_KIND);
      expect(boot, `no boot record\n${worker.output()}`).toBeDefined();
      // The host and database name are what an operator needs when the Auditor goes quiet — three
      // processes here point at three DSNs and only this line says which is which.
      expect(String(boot?.jobs.database)).toContain("kernel_test");
      // The password is the one part of a DSN that may never reach a log (18 §5). Asserted over
      // the WHOLE output, not just this record: a redacted boot line beside a raw DSN in an error
      // message is not redaction.
      expect(worker.output()).not.toContain("restos-jobs-suite-password");
    });

    /**
     * ⚠ **The weakest assertion in the file, and measured to be so.** Against a host that exits
     * after its third pass it PASSED, because it looks the instant the hook returns. Liveness is
     * really owned by §D's "findings do NOT take the process down", which waits for a *later* pass
     * and killed that mutant. This stays because a corpse here is a two-line failure instead of a
     * forty-second timeout in §D — a faster diagnosis of the same defect, never an independent one.
     */
    it("it is up at the end of the boot phase (the fast signal; §D owns liveness)", () => {
      expect(worker.alive(), worker.output()).toBe(true);
    });
  });

  // ══ §B per ORG, and every org ══════════════════════════════════════════════════════════════

  describe("§B 20 §4.2 'a nightly cloud job PER ORG'", () => {
    /**
     * The four org ids sort `a-clean` < `m-gap` < `w-money` < `z-corrupt`. So a host that audits
     * only the first row, or only the last, or only the one org it was configured with, fails —
     * and it fails on a DIFFERENT assertion in each case, which is what makes the kill attributable.
     */
    it("01-F3/01-F8: a lamport gap in the SECOND org is found and the gap SLOT is named", () => {
      const record = resultsFor(baseline, gap.org_id)[0];
      expect(record, `no result record for ${gap.org_id}\n${worker.output()}`).toBeDefined();
      expect(record?.jobs.ok).toBe(false);
      expect(checksIn(record)).toContain("lamport_gap");
      const finding = findingsOf(record).find((f) => f.check === "lamport_gap");
      // Actionable, not merely alarming: WHICH device, WHICH slot.
      expect(finding?.device_id).toBe(gap.device_id);
      expect(finding?.lamport_seq).toBe(1);
      expect(String(finding?.detail).length).toBeGreaterThan(0);
    });

    it("01-F30/01-F32: a settled order that does not balance is found in the THIRD org", () => {
      const record = resultsFor(baseline, money.org_id)[0];
      expect(record, `no result record for ${money.org_id}\n${worker.output()}`).toBeDefined();
      expect(record?.jobs.ok).toBe(false);
      expect(checksIn(record)).toContain("conservation");
      // DEC-MONEY-009's residual is money that does not balance and that no screen mentions. The
      // finding has to name the ORDER or it cannot be chased.
      expect(findingsOf(record).map((f) => f.order_id)).toContain(moneyOrderId);
    });

    it("01-F4: an unparseable merged event is found in the LAST org — a SECOND leg, not the same one", () => {
      const record = resultsFor(baseline, corrupt.org_id)[0];
      expect(record, `no result record for ${corrupt.org_id}\n${worker.output()}`).toBeDefined();
      expect(record?.jobs.ok).toBe(false);
      expect(checksIn(record)).toContain("unparseable_merged_event");
    });

    it("the CLEAN org comes back clean — a host that flags everything is no better than one that flags nothing", () => {
      const record = resultsFor(baseline, clean.org_id)[0];
      expect(record, `no result record for ${clean.org_id}\n${worker.output()}`).toBeDefined();
      expect(record?.jobs.ok).toBe(true);
      expect(findingsOf(record)).toEqual([]);
    });

    it("the report published UNDER an org is the report computed FOR that org", () => {
      // A host that audits one org and labels the record with another produces findings whose own
      // `org_id` disagrees with the record's. Every finding carries the audited org (auditor.ts).
      for (const identity of [gap, money, corrupt]) {
        const record = resultsFor(baseline, identity.org_id)[0];
        for (const finding of findingsOf(record)) {
          expect(finding.org_id, `finding filed under the wrong org in ${identity.org_id}`).toBe(
            identity.org_id,
          );
        }
      }
    });
  });

  // ══ §C on a SCHEDULE, and it RE-READS ══════════════════════════════════════════════════════

  describe("§C 20 §4.2 'a NIGHTLY cloud job'", () => {
    /**
     * ⚠ **Honestly, this cannot fail while the boot hook passes** — the hook waits for exactly this
     * condition, so a host that audits once is refused there, with `19 skipped` and no assertion
     * named. It is kept as the written-down statement of what the hook is waiting FOR, and as the
     * thing that would still bite if that wait were ever relaxed. The scheduling claim with real
     * teeth is the next test.
     */
    it("every org is audited more than once — a run-once-at-boot script is not a schedule", () => {
      for (const identity of [clean, gap, money, corrupt]) {
        expect(
          resultsFor(baseline, identity.org_id).length,
          `only ${String(resultsFor(baseline, identity.org_id).length)} pass(es) over ${identity.org_id}`,
        ).toBeGreaterThanOrEqual(2);
      }
    });

    /**
     * **The assertion this file exists for.** A host that audits at boot and then re-prints its
     * first report satisfies every other test here. The ledger is corrupted AFTER the worker has
     * already reported this org clean twice, and the later pass must disagree with the earlier one.
     */
    it("a defect introduced AFTER a clean pass is caught by a LATER pass (the ledger is re-read)", async () => {
      const already = resultsFor(baseline, clean.org_id).length;
      expect(already).toBeGreaterThanOrEqual(2);
      expect(resultsFor(baseline, clean.org_id).every((r) => r.jobs.ok === true)).toBe(true);

      await deleteEventAtSlot(sql, clean, 1);

      const after = await waitFor(
        worker,
        `${clean.org_id} reported BROKEN after its slot-1 event was deleted`,
        (records) => {
          const seen = resultsFor(records, clean.org_id);
          return seen.length > already && seen.slice(already).some((r) => r.jobs.ok === false);
        },
      );
      const later = resultsFor(after, clean.org_id)
        .slice(already)
        .find((r) => r.jobs.ok === false);
      expect(checksIn(later)).toContain("lamport_gap");
      expect(findingsOf(later).find((f) => f.check === "lamport_gap")?.lamport_seq).toBe(1);
    });

    it("20 §4.2 'nightly': the DEFAULT cadence is a night, not a minute", () => {
      const boot = nightlyRecords.find((r) => r.jobs.kind === BOOT_KIND);
      expect(boot, "no boot record from the default-cadence worker").toBeDefined();
      const interval = Number(boot?.jobs.auditor_interval_ms);
      // A band, not a number: 'nightly' is the requirement. What this kills is a host that
      // refolds every org's entire ledger every few minutes in production, and a host whose
      // interval knob is really its only setting.
      expect(interval).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000);
      expect(interval).toBeLessThanOrEqual(48 * 60 * 60 * 1000);
      // And the knob the suite drives really is the same setting.
      const driven = worker.records().find((r) => r.jobs.kind === BOOT_KIND);
      expect(Number(driven?.jobs.auditor_interval_ms)).toBe(TEST_INTERVAL_MS);
    });
  });

  // ══ §D findings are AUDIBLE, and never fatal ═══════════════════════════════════════════════

  describe("§D 20 §4.2 'logged + alerted in production (never crash a service mid-service)'", () => {
    it("a pass WITH findings is logged at error level or above", () => {
      for (const identity of [gap, money, corrupt]) {
        const record = resultsFor(baseline, identity.org_id)[0];
        expect(
          Number(record?.level),
          `findings for ${identity.org_id} were logged below error — 'logged' at info is ` +
            "operationally silent, which is the state DEC-MONEY-009's residual is in today",
        ).toBeGreaterThanOrEqual(ERROR_LEVEL);
      }
    });

    it("a CLEAN pass is not — a host that shouts every night is as silent as one that never shouts", () => {
      const record = resultsFor(baseline, clean.org_id)[0];
      expect(Number(record?.level)).toBeLessThan(ERROR_LEVEL);
    });

    it("findings do NOT take the process down, and the schedule continues past them", async () => {
      expect(worker.alive(), worker.output()).toBe(true);
      const before = resultsFor(worker.records(), corrupt.org_id).length;
      await waitFor(
        worker,
        `${corrupt.org_id} audited again AFTER it was reported broken`,
        (records) => resultsFor(records, corrupt.org_id).length > before,
      );
      expect(worker.alive()).toBe(true);
    });
  });

  // ══ §E the host must not write ═════════════════════════════════════════════════════════════

  describe("§E 01-F1: the Auditor writes nothing, ever — and neither may its host", () => {
    it("every kernel row of the audited orgs is byte-identical after repeated passes", async () => {
      // `clean` is excluded: §C deletes one of its rows on purpose.
      for (const identity of [gap, money, corrupt]) {
        expect(
          await orgSnapshot(sql, identity.org_id),
          `the host changed kernel rows for ${identity.org_id} — a host that "heals" a finding, ` +
            "or books its own run row into the kernel schema, breaks 01-F1 through the one " +
            "component in this product that is documented to write nothing",
        ).toBe(beforeSnapshots[identity.org_id]);
      }
    });
  });

  // ══ §F an unreadable database ══════════════════════════════════════════════════════════════

  describe("§F 20 §4.2 'never crash a service mid-service'", () => {
    it("a database it cannot read is LOUD, non-fatal, and does not retire the schedule", () => {
      const failures = brokenRecords.filter((r) => r.jobs.kind === FAILED_KIND);
      // Loud: at error level, and NAMING the fault. `services/sync-gateway`'s own boot report
      // exists because an unnamed database fault travelled two services as a shrug.
      expect(Number(failures[0]?.level)).toBeGreaterThanOrEqual(ERROR_LEVEL);
      expect(String(failures[0]?.jobs.error).length).toBeGreaterThan(0);
      expect(String(failures[0]?.jobs.error)).toMatch(/kernel|events|relation|schema/i);
      // Non-fatal, and the timer survived it — the SECOND failure is the whole point. A host that
      // swallows the error but stops scheduling looks identical to a healthy one from one record,
      // and a host that dies on the first fault looks identical to one that never had a fault.
      expect(failures.length).toBeGreaterThanOrEqual(2);
      expect(brokenStillAlive, brokenOutput).toBe(true);
      // And it did not leak its DSN password into the log while complaining.
      expect(brokenOutput).not.toContain("restos-jobs-suite-password");
    });
  });

  // ══ §G the scheduler mechanism ═════════════════════════════════════════════════════════════

  /**
   * `18 §5`, quoted exactly: *"**Jobs:** BullMQ; every job idempotent (keyed by deterministic job
   * id); retries with exponential backoff; dead-letter queues monitored in doc 15 fleet health.
   * **Scheduled work (nightly brief) uses BullMQ repeatables — no OS cron.**"* — and
   * `services/jobs/CLAUDE.md`: *"BullMQ workers. Every job idempotent; repeatables not OS cron"*.
   *
   * `bullmq` and `ioredis` are already on `18 §14`'s allowlist, so adding them is **not** a `18 §15`
   * event; `00 §3` ("Jobs/queues | BullMQ on Redis") and `20 §1` (Redis in the local-dev and CI
   * rows) already put Redis in the stack. So an in-process `setInterval` is a spec violation rather
   * than a pragmatic shortcut, and this is the only test in the file that says so. If a founder
   * rules otherwise, exactly ONE test is retired and the debt is then written down in code instead
   * of being invisible.
   */
  describe("§G 18 §5: scheduled work uses BullMQ repeatables, not OS cron and not a bare timer", () => {
    it("declares bullmq (18 §14 already allows it — no §15 approval is being sought here)", async () => {
      const pkg = await readPackageJson();
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(Object.keys(deps)).toContain("bullmq");
    });

    it("and actually SCHEDULES through it: the Redis it was handed is not empty", async () => {
      // The declaration above is satisfiable by a package.json edit. This is not: a `setInterval`
      // host writes nothing to Redis, and any BullMQ queue writes its keys there.
      const url = process.env[REDIS_URL_ENV] ?? "";
      expect(url).not.toBe("");
      expect(
        await redisKeyCount(url),
        "the worker wrote nothing to REDIS_URL, so its schedule is not a BullMQ repeatable " +
          "(18 §5). A bare setInterval passes every other test in this file.",
      ).toBeGreaterThan(0);
    });
  });

  // ══ §H the debt register self-corrects ═════════════════════════════════════════════════════

  /**
   * ## ⚠ THIS SECTION ASSERTED A PROPERTY NO IMPLEMENTATION COULD SATISFY. MEASURED THREE WAYS.
   *
   * It used to read the whole of `auditor.ts` and refuse **any** `@unreached-owed` anywhere in the
   * file. Landing this host made `runAuditor`'s optional `read_model` a **Rule B candidate for the
   * first time** — Rule B only considers optional members of factories that shipping code already
   * calls, so with no caller there was no candidate and no marker was required. The moment there
   * was a caller, `pnpm seams:check` began *demanding* a marker on the one seam this host
   * deliberately does not supply, and §H began *forbidding* it:
   *
   *   marker present …………………………………… 18/19 here (§H red), `seams:check` CLEAN
   *   marker absent ………………………………………  19/19 here,        `seams:check` **exit 1**
   *   marker absent AND the port stubbed …  19/19 here,        `seams:check` CLEAN
   *
   * The third row is the dangerous one: a **fully green repo** with `20 §4.2`'s headline leg dead.
   * A guard that can only be satisfied by disabling the thing it guards is worse than no guard, and
   * AGENTS.md rates a test that reddens a CORRECT implementation as damaging as a vacuous one.
   *
   * ## WHY SCOPING, AND NOT `expect(seams:check).toExitZero()`
   *
   * Shelling out to the rail was the other candidate and is rejected on three grounds, in order of
   * weight. (1) **Attribution.** The rail is repo-wide; an owed marker in `packages/ui` would turn
   * `services/jobs` red for a reason no message here could name, and this suite already pays for
   * hook-level failures reporting nineteen tests as *skipped* with no assertion attached. (2) **It
   * is already run.** `pnpm seams:check` is the fifth step of `pnpm verify`; restating a CI rail
   * inside a package suite buys nothing and costs a whole-repo walk per test run. (3) **It answers
   * a different question.** The rail's verdict is *"the register is consistent"*; the fact §H owns
   * is narrower and is about THIS host — *"the marker that said nothing runs the Auditor is gone,
   * because this worker is now its caller"*.
   *
   * So §H reads **exactly the window the rail reads**, which is what makes the two incapable of
   * disagreeing: `check-seams.mjs`'s `markerAbove` collects the contiguous comment run directly
   * above a declaration, and its `fileMarker` treats a marker in the file header (before the first
   * top-level `import`/`export`) as covering the whole file. A marker anywhere else — such as the
   * JSDoc on the `read_model` property inside `RunAuditorArgs` — belongs to that declaration and
   * not to `runAuditor`, in the rail's reading and now in this one.
   *
   * ## SURVIVING THE MOVE
   *
   * `auditor.ts`'s own header records that `18 §2` forbids the cross-service import this worker
   * makes, and that the correct end state is the module living in a package. When it moves, a
   * hardcoded `services/sync-gateway/src/auditor.ts` would either fail to read (a red for the wrong
   * reason) or — worse, if some file is left behind at that path — keep passing while measuring a
   * corpse. So the path is **resolved from the host's own import specifier**: whatever
   * `services/jobs/src/index.ts` imports `runAuditor` from is the module §H reads, and §H1 proves
   * the file it landed on really declares it.
   *
   * ## MUTATION MATRIX FOR THIS SECTION (2026-08-11) — control 20/20, 0 survivors
   *
   * Run from a scratchpad copy of `services/jobs` whose `@restos/sync-gateway` resolves to a
   * scratchpad copy of the gateway, so `auditor.ts` was mutable without the worktree being touched.
   *
   *   #     mutant (exactly one branch)                                        tests failed /20
   *   J-M1  the marker put BACK on `runAuditor`'s own doc block                **1 — §H2**
   *   J-M2  the marker in the FILE HEADER instead (the rail's other window)    **1 — §H2**
   *   J-M3  **THE STATE THE OLD §H COULD NOT PASS** — only `read_model`        **0**
   *         carries a marker, which is the shipped tree
   *   J-M4  the `read_model` marker REMOVED                                    0 (see below)
   *   J-M5  the host stops importing `runAuditor` at all                       6 — §B×3, §C2,
   *                                                                             §D1, **§H2**
   *   J-M6  **THE MOVE** — `auditor.ts` at a new subpath, the host imports     **1 — §H2**
   *         THAT, and the file left behind at the old path is CLEAN
   *   J-NC  NEGATIVE CONTROL: the doc block rewritten wholesale, no marker     **0**
   *   I-M1  INSTRUMENT: the comment window always comes back empty             1 — §H1
   *   I-M2  **INSTRUMENT: the window returns the WHOLE FILE — the OLD §H**     **2 — §H1, §H2**
   *   I-M3  INSTRUMENT: the header window always comes back empty              1 — §H1
   *   I-M4  INSTRUMENT: the declaration is never found                         2 — §H1, §H2
   *
   * **J-M3, J-M4 and I-M2 are the rows that matter.** J-M3 is the shipped tree and it is now
   * green here — that is the deadlock gone. I-M2 restores the old whole-file behaviour and is
   * killed by BOTH assertions, so the rewrite cannot silently revert. J-M4 kills nothing here **on
   * purpose**, and the rail is what owns it — measured on a source-only copy of the repo, exit code
   * read from the command itself:
   *
   *   `read_model` marker present (shipped) ……… `seams:check` **exit 0**, §H **20/20**
   *   `read_model` marker removed ……………………… `seams:check` **exit 1** ("runAuditor({ read_model })
   *                                              — constructed at services/jobs/src/index.ts:152
   *                                              without it"), §H still green
   *   marker also on `runAuditor` itself ……………… `seams:check` **exit 1** ("a marker on something
   *                                              reached fails this check"), §H **red (J-M1)**
   *
   * So the oracle and the rail now redden together on the same declaration and are both satisfied
   * by exactly one state — where before, no state satisfied both.
   */
  describe("§H the seams rail's owed marker", () => {
    /**
     * The rail's `markerAbove`, transcribed: walk up from the declaration line collecting the
     * contiguous comment run, stopping at the first blank line or non-comment line, and stopping
     * ON a `/*` because that opens the block.
     */
    const commentRunAbove = (source: string, declLine: number): string => {
      const lines = source.split("\n");
      const collected: string[] = [];
      for (let i = declLine - 2; i >= 0; i--) {
        const text = lines[i] ?? "";
        if (/^\s*$/.test(text)) break;
        if (!/^\s*(\/\/|\/\*|\*|\*\/)/.test(text)) break;
        collected.unshift(text);
        if (/^\s*\/\*/.test(text)) break;
      }
      return collected.join("\n");
    };

    /** The rail's `fileMarker` window: everything before the first top-level import/export. */
    const headerOf = (source: string): string => {
      const firstCode = source.search(/^[^\S\n]*(import|export)\s/m);
      return firstCode === -1 ? source : source.slice(0, firstCode);
    };

    /** 1-based line of `runAuditor`'s declaration, however it is declared. */
    const declarationLine = (source: string): number => {
      const lines = source.split("\n");
      const at = lines.findIndex((l) =>
        /^\s*export\s+(?:const|(?:async\s+)?function)\s+runAuditor\b/.test(l),
      );
      return at + 1;
    };

    /**
     * The module the HOST imports `runAuditor` from — never a hardcoded path. Both resolvers are
     * tried because a moved package may declare a conditional `exports` map that CJS resolution
     * cannot walk; a silent `undefined` here would make every assertion below vacuous, so the
     * failure is thrown with the specifier in it.
     */
    const auditorSourcePath = async (): Promise<{ specifier: string; path: string }> => {
      const host = await readFile(HOST_ENTRY, "utf8");
      const specifier = /import\s*\{[^}]*\brunAuditor\b[^}]*\}\s*from\s*"([^"]+)"/.exec(host)?.[1];
      if (specifier === undefined) {
        throw new Error(
          `${HOST_ENTRY} does not import runAuditor. That is not a §H failure — it is the whole ` +
            "premise of this suite gone: nothing in this service would be calling the Auditor.",
        );
      }
      const errors: string[] = [];
      let entry: string | undefined;
      try {
        entry = fileURLToPath(import.meta.resolve(specifier));
      } catch (err) {
        errors.push(`import.meta.resolve: ${String(err)}`);
      }
      if (entry === undefined) {
        try {
          entry = createRequire(import.meta.url).resolve(specifier);
        } catch (err) {
          errors.push(`require.resolve: ${String(err)}`);
        }
      }
      if (entry === undefined) {
        throw new Error(`cannot resolve "${specifier}" from ${HOST_ENTRY}\n${errors.join("\n")}`);
      }

      /**
       * **ONE BARREL HOP, and it is the repo's own rule rather than a convenience.**
       * `seams:check` Rule A insists *"a barrel re-export is not a use"*; the same distinction
       * applies to a MEASUREMENT. `DEC-ARCH-001` moved the Auditor into `packages/auditor`, whose
       * entry point is a barrel that re-exports `runAuditor` from `./auditor.js` — so resolving the
       * host's specifier lands on a file that **declares nothing**, and every assertion below would
       * have been vacuous. That is not hypothetical: this is exactly the survivor the move's own
       * mutation pass reported (re-pointing a hardcoded path at a sibling in the same package took
       * the whole suite green at 43/43 with nothing asserting the target), and it was caught here
       * only because H2's anti-vacuity guard fires BEFORE the marker assertions.
       *
       * So: if the resolved module does not declare it, follow the re-export that names it — once,
       * deliberately. A loop would chase an arbitrary chain and quietly make "which file did we
       * measure" unanswerable; one hop covers a package entry point, which is the shape the corpus
       * has. If the hop still does not land on a declaration, H2's guard throws with both paths in
       * the message rather than passing.
       */
      const entrySource = await readFile(entry, "utf8");
      if (declarationLine(entrySource) > 0) return { specifier, path: entry };
      const reExport = /export\s*\{[^}]*\brunAuditor\b[^}]*\}\s*from\s*"([^"]+)"/.exec(
        entrySource,
      )?.[1];
      if (reExport === undefined) return { specifier, path: entry };
      // TypeScript sources are imported with a `.js` specifier under NodeNext; measure the `.ts`.
      const hopped = resolve(dirname(entry), reExport.replace(/\.js$/, ".ts"));
      return existsSync(hopped)
        ? { specifier: `${specifier} → ${reExport}`, path: hopped }
        : { specifier, path: entry };
    };

    /**
     * ⚠ **THE INSTRUMENT, ON SYNTHETIC INPUT.** A window extractor has two silent failure
     * directions and §H is unfalsifiable in one of them: a window that always comes back EMPTY
     * passes for ever (ROUND-2 PATTERN 2, "the guard passed by not looking"), and a window that
     * over-reaches puts the rail and this suite back into the deadlock that produced this rewrite.
     * These run on strings this file owns, so instrument and subject are independent.
     */
    it("H1 the window extractor finds a marker where the rail finds one, and only there", () => {
      const OWED = "@unreached-owed";
      const attached = [
        "import { x } from 'y';",
        "",
        "/**",
        ` * ${OWED} nothing calls this yet, and here is the reason it is owed.`,
        " */",
        "export const runAuditor = async () => {};",
      ].join("\n");
      expect(commentRunAbove(attached, declarationLine(attached))).toContain(OWED);

      // A marker on a NEIGHBOURING declaration is not this one's. This is the exact shape the old
      // §H could not express — `read_model`'s marker sits in the JSDoc of a property of the args
      // type, a different declaration, and the rail attributes it there.
      const neighbour = [
        "import { x } from 'y';",
        "",
        "export type RunAuditorArgs = {",
        "  /**",
        `   * ${OWED} the diff leg has nothing in the cloud to diff against, and that is owed.`,
        "   */",
        "  read_model?: ReadModelInput;",
        "};",
        "",
        "/** A read-only audit of one org. */",
        "export const runAuditor = async () => {};",
      ].join("\n");
      expect(commentRunAbove(neighbour, declarationLine(neighbour))).not.toContain(OWED);
      expect(headerOf(neighbour)).not.toContain(OWED);
      // …and the whole-file search — the assertion this section used to make — DOES see it. That
      // difference is the defect, stated as a measurement rather than as prose.
      expect(neighbour).toContain(OWED);

      // The rail's other window: a header marker covers the whole file, so §H must read it too.
      const header = [
        `// ${OWED} this whole module is owed, with a reason long enough to count.`,
        "",
        "import { x } from 'y';",
        "",
        "export const runAuditor = async () => {};",
      ].join("\n");
      expect(headerOf(header)).toContain(OWED);

      // A blank line breaks the run — the rail stops there, so a marker floating above unrelated
      // prose is NOT attached, and §H must not claim it is.
      const detached = [
        "import { x } from 'y';",
        "",
        `// ${OWED} an old note left behind, with a reason of respectable length.`,
        "",
        "/** The current doc block. */",
        "export const runAuditor = async () => {};",
      ].join("\n");
      expect(commentRunAbove(detached, declarationLine(detached))).not.toContain(OWED);

      // And the extractor is not vacuous: it really returns the attached run.
      expect(commentRunAbove(attached, declarationLine(attached)).length).toBeGreaterThan(0);
      // `function` form too, so a refactor of the declaration does not silently empty the window.
      const asFunction = attached.replace(
        "export const runAuditor = async () => {};",
        "export async function runAuditor() {}",
      );
      expect(commentRunAbove(asFunction, declarationLine(asFunction))).toContain(OWED);
    });

    it("H2 runAuditor's own declaration no longer carries @unreached-owed — it has a caller now", async () => {
      const { specifier, path } = await auditorSourcePath();
      const source = await readFile(path, "utf8");

      // The tripwire: we landed on the module that really declares it, wherever it now lives.
      const line = declarationLine(source);
      expect(
        line,
        `${path} (resolved from "${specifier}") declares no runAuditor — §H is measuring the ` +
          "wrong file, and every assertion below would pass vacuously",
      ).toBeGreaterThan(0);

      const attached = commentRunAbove(source, line);
      const header = headerOf(source);
      const why =
        `${path} marks runAuditor as owed. pnpm seams:check FAILS when a marker sits on ` +
        "something now reached, so leaving it is a red rail, not a tidy-up. A marker on a " +
        "DIFFERENT declaration in this file — read_model's, for instance — is deliberately not " +
        "this assertion's business; Rule B requires that one and §H used to forbid it.";
      expect(attached, why).not.toContain("@unreached-owed");
      expect(header, why).not.toContain("@unreached-owed");
    });
  });
});
