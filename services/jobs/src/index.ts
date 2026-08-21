/**
 * **`20 §4.2`'s Auditor, given a host — and R38's per-tenant backup, riding the same worker.**
 * Owning specs: `specs/20-testing-correctness.md` §4.2 — *"A nightly cloud job per org: refold the
 * entire ledger from raw events with the current fold code and diff against the
 * incrementally-maintained read models and last-reported device states … logged + alerted in
 * production (never crash a service mid-service) … The Auditor is the single highest-value
 * correctness artifact we build. **It ships in Wave 0 with the kernel, not later.**"* — and
 * `specs/22-operations-recovery.md` (`22-F22`) for the backup half.
 *
 * `runAuditor` has been complete, correct and covered by ten suites since Wave 0, and **nothing ran
 * it**: `services/jobs` was `export {};` with no `dev`/`start` script, so the Auditor could not be
 * run as a process at all. That is AGENTS.md's recurring defect — a correct subsystem with no seam
 * to the product — and this file is the seam. `DEC-MONEY-009` is the reason it matters beyond the
 * checkbox: its partition case is open **by construction** and its residual column names a
 * scheduled Auditor as one of the three things owed for it, so until this ran, a permanently
 * doubled cash figure had nothing looking for it.
 *
 * Acceptance suites (written by separate sessions from spec text, `20 §4.3` / `24 §3`, read-only to
 * the implementer): `src/__acceptance__/auditor-host.test.ts` and
 * `src/__acceptance__/tenant-backup-restore.test.ts`. Both spawn the DECLARED `start` script and
 * read this process's stdout — so the record shapes below are a contract, not a style.
 *
 * ── THREE DECISIONS, STATED RATHER THAN GUESSED (`24 §3b`) ───────────────────────────────────
 *
 * **1. BullMQ, because `18 §5` says so in one sentence, and no `18 §15` approval is being sought.**
 * `18 §5` verbatim: *"**Jobs:** BullMQ; every job idempotent (keyed by deterministic job id);
 * retries with exponential backoff; dead-letter queues monitored in doc 15 fleet health.
 * **Scheduled work (nightly brief) uses BullMQ repeatables — no OS cron.**"* `bullmq` and `ioredis`
 * are already on `18 §14`'s Backend allowlist and `00 §3` already puts Jobs/queues on *"BullMQ on
 * Redis"*, so adding them is not a `§15` event. A bare `setInterval` would have been simpler and is
 * a **spec violation**, not a pragmatic shortcut. **What is NOT built and is owed:** retries with
 * exponential backoff, and the dead-letter queue's doc-15 monitoring. Both are properties of a
 * *failing* job; the failure this task exists to close is a job that never runs. A failed pass is
 * rethrown so BullMQ records it (the DLQ substrate) and the next scheduled pass retries — which for
 * a read-only whole-ledger refold is a better retry than backoff inside the same minute.
 *
 * **2. A finding terminates in the LOG, and the alert half is OWED — not skipped, unbuildable.**
 * `20 §4.2` asks for *"high-priority alert + release-train block"*. The release-train block is
 * `20 §4.6`, a human/CI process. The alert surface is doc 15 fleet health, which does not exist.
 * Emitting an event instead was checked rather than assumed: `alert.raised` **is** in the `01 §4`
 * catalog (doc 13's family) but has **no payload schema in `packages/domain`**, so `01-F4` refuses
 * it, and it is not one of `01-F62`'s five org-scoped types — while a branch-scoped envelope needs
 * a *device* to stamp it and this is a cloud job with no device. That is `05-F28`'s trap exactly,
 * and inventing a path around it would be commandment 2. So this emits only what `20 §4.2` says in
 * its own word — *logged* — but two-sided: findings at `error`, clean passes below it, because a
 * host that shouts every night is as silent as one that never shouts. **`22-F23` records that the
 * backup half inherits this exactly**: `governance.*` has no payload schema either, so a backup, a
 * restore and an export each leave no ledger record and no attribution today.
 *
 * **3. The Auditor is imported from `@restos/auditor` — a PACKAGE, which is the only direction
 * `18 §2` allows.** *"**Dependency direction (MUST):** `apps → packages`, `services → packages`,
 * `packages → packages` … Cross-module calls go through tRPC/events, never through direct imports
 * across service boundaries."* `services → services` is on neither list, and this file broke that
 * MUST for the window between the Auditor acquiring a host and `DEC-ARCH-001` being ruled: it read
 * `runAuditor` out of `services/sync-gateway` through a two-entry `exports` map, with the violation
 * named here rather than hidden. **`DEC-ARCH-001` (RULED, founder, August 2026) ended it with the
 * move: `auditor.ts` now lives in `packages/auditor`, which both services may import**, and the
 * gateway's `exports` map is deleted — that service publishes nothing again, like every other one.
 * `redactedDsn` travelled to `@restos/config` on the same ruling, for the reason below. The ruling
 * also **rejects** an `/internal/auditor/run` route on the gateway, so nothing here asks for one:
 * `18 §5` reserves plain REST for third-party webhooks, an unbounded synchronous refold has no
 * business inside the process every till holds a socket to, and a verifier sharing the gateway's
 * pool and `DATABASE_URL` would be auditing from inside the fault it exists to catch.
 *
 * ── THE BACKUP RIDES THIS WORKER, AND THAT IS A DECISION TOO (R38, R42) ──────────────────────
 *
 * R42 reads *"no infrastructure project"* against R38 rather than as contradicting it: R38's backup
 * is **product work — a per-tenant job on `services/jobs`'s existing BullMQ repeatable, which
 * `20 §4.2`'s Auditor already proved out"*. So this is not a second service and not a second
 * `start` script. It is a **second queue on the same process**, because the two passes have
 * unrelated cadences (an audit every night is a refold; a backup interval is `22-F22`'s stated RPO)
 * and one queue carrying both would make the slower one decide the faster one's schedule.
 *
 * ⚠ **`auditor-host.test.ts`'s header measured what two of these processes do to each other** — a
 * second worker's scheduler upsert overwrites the first's cadence and a second consumer takes
 * passes the first was waiting for. One deployment runs ONE of these.
 *
 * ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────────────────────
 *
 * `20 §4.2`'s **read-model diff leg** is not driven: `runAuditor`'s `read_model` argument is
 * optional and no cloud per-module read model exists to feed it, so supplying one would mean
 * inventing the projection. The other five legs (lamport gaps, money conservation, state legality,
 * the audit hash-chain, unparseable merged events) all run on every pass. There is also no
 * SIGTERM/SIGINT handler: a killed worker leaves its in-flight job for BullMQ's stalled-job checker,
 * which is the same posture `services/sync-gateway`'s `server.ts` ships, and a graceful drain is
 * owed rather than assumed.
 *
 * **The backup does not verify its own artifacts, and `22-F8` is why that is not enough.** A pass
 * writes a file and checks nothing about restoring it; the drill that proves a backup is the
 * declared `restore` command run against a scratch database followed by an Auditor refold. R38's
 * *"a restore nobody has performed is a backup nobody has"* is a claim about an operator's habit
 * that no scheduler can make true.
 */
import { pathToFileURL } from "node:url";
import { runAuditor } from "@restos/auditor";
// `redactedDsn` is imported rather than copied for the same reason `revoke-device.ts` reads its
// eviction bound instead of writing "30 s": a second local redaction helper is a second
// interpretation of which part of a DSN may reach a log store (`18 §5`), and `03-F40`'s two sensor
// bit layouts is this corpus's own record of what that costs. `DEC-ARCH-001` moved it here from the
// gateway when this file became its second consumer; `DATABASE_URL_DEFAULT` stayed behind, because
// that default is a fact about the gateway's boot and not one to hand every service (see below).
import { defineEnv, redactedDsn } from "@restos/config";
import { Queue, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import IORedis from "ioredis";
import { destination, type Logger, pino } from "pino";
import postgres from "postgres";
import { runBackupPass } from "./backup.js";

/** `20 §4.2` says "nightly" and nothing narrower, so the default is a night. */
const NIGHTLY_MS = 24 * 60 * 60 * 1000;

const QUEUE_NAME = "auditor";
/**
 * `18 §5` wants *"every job idempotent (keyed by deterministic job id)"*. A BullMQ repeatable
 * supplies exactly that: every pass this scheduler produces is named from this id and its slot, so
 * a second worker upserting the same id replaces the schedule rather than doubling it.
 */
const SCHEDULER_ID = "auditor-nightly";
const JOB_NAME = "audit-every-org";

/**
 * R38's queue. **The name carries the word `backup` deliberately** — BullMQ keys every one of its
 * Redis structures with it, so an operator (and `tenant-backup-restore.test.ts` §C3) can tell from
 * the queue backend alone whether this deployment schedules a backup at all, without waiting a
 * night to find out from the absence of a file.
 */
const BACKUP_QUEUE_NAME = "tenant-backup";
const BACKUP_SCHEDULER_ID = "tenant-backup-nightly";
const BACKUP_JOB_NAME = "backup-every-tenant";

/** The kernel handle `runAuditor` declares. Derived from its own contract so nothing is redeclared. */
type KernelDb = Parameters<typeof runAuditor>[0]["db"];

/**
 * One line, top message and its direct cause only — the shape `server.ts` settled on. `postgres-js`
 * wraps the failing SQL in the top message and the reason (`relation … does not exist`,
 * `ECONNREFUSED`) one `cause` deeper, and a boot line that wraps into three is one an operator
 * scrolls past. The *error object* is never logged: it carries connection options, and `18 §5` puts
 * a DSN password in the one category that may never reach a log store.
 */
const describeFault = (error: unknown): string => {
  const flat = (text: string): string => text.replace(/\s+/g, " ").trim();
  const top = flat(error instanceof Error ? error.message : String(error));
  const cause =
    error instanceof Error && error.cause instanceof Error ? flat(error.cause.message) : "";
  return cause === "" ? top : `${top} ← ${cause}`;
};

/**
 * Every org this kernel database holds. `kernel.org_sequences` is keyed by `org_id` alone — one row
 * per org, written by the merge gateway the first time an org's ledger receives anything — so it is
 * the org registry, and reading it is cheaper than a `distinct` over `kernel.events`.
 *
 * ⚠ **The BACKUP pass deliberately does NOT use this** (`tenant-artifact.ts`'s `everyTenant`), and
 * the difference is a restaurant: this table is empty for a tenant that has signed up and not yet
 * traded, so a backup discovering orgs this way would lose the newest restaurant on the deployment.
 * That costs the Auditor nothing — an org with no events has nothing to refold — and costs a backup
 * everything. The two readings are correct for their own callers and must not be merged.
 *
 * This is the ONLY statement this process issues that `runAuditor` does not, and it is a SELECT.
 * `01-F1`: the Auditor writes nothing, ever, and neither may its host — no run row, no "healed" gap,
 * nothing. The one component in this product documented to write nothing must not have a write
 * laundered through it. The backup pass holds the same rule for the same reason.
 */
const everyOrg = async (db: KernelDb): Promise<string[]> =>
  [...(await db.execute(sql`select org_id from kernel.org_sequences order by org_id`))].map((row) =>
    String(row.org_id),
  );

type Log = Logger;

/**
 * One pass. Each org gets its own report record — **including the clean ones**, because without one
 * "org X was audited" is unobservable and a host that silently skips an org looks identical to a
 * healthy one.
 */
const auditEveryOrg = async (db: KernelDb, log: Log): Promise<void> => {
  for (const org_id of await everyOrg(db)) {
    const report = await runAuditor({ db, org_id });
    const jobs = {
      kind: "auditor_result",
      org_id,
      ok: report.ok,
      findings: report.findings,
    };
    if (report.ok) {
      log.info({ jobs }, `auditor: ${org_id} is clean`);
      continue;
    }
    // `20 §4.2`: "logged + alerted in production". The alert half is owed (decision 2); the level is
    // what makes the logged half audible rather than merely present. A finding at `info` is exactly
    // the state DEC-MONEY-009's residual sits in today.
    log.error(
      { jobs },
      `auditor: ${org_id} has ${String(report.findings.length)} finding(s) — ${[
        ...new Set(report.findings.map((finding) => finding.check)),
      ].join(", ")}`,
    );
  }
};

/**
 * One backup pass, reported the same two-sided way the Auditor's is: **one record per tenant per
 * pass, the successful ones included**, because "tenant X was backed up last night" is otherwise
 * unobservable and a host that silently skips a tenant looks exactly like a healthy one. That is
 * the same argument as `auditEveryOrg`'s and it lands harder here — a skipped audit is a check not
 * run, a skipped backup is a restaurant with no copy of its ledger.
 *
 * A failure is `error` level and carries the tenant it is about (`null` when discovery itself
 * failed, so there was no tenant to name). The pass then throws, so BullMQ records it and the next
 * scheduled pass is the retry.
 */
const backupEveryTenant = async (
  db: ReturnType<typeof postgres>,
  dir: string,
  log: Log,
): Promise<void> => {
  const outcomes = await runBackupPass(db, dir, Date.now());
  for (const outcome of outcomes) {
    if (outcome.ok) {
      log.info(
        { jobs: { kind: "backup_result", org_id: outcome.org_id, artifact: outcome.artifact } },
        `backup: ${outcome.org_id} → ${outcome.artifact}`,
      );
      continue;
    }
    log.error(
      { jobs: { kind: "backup_failed", org_id: outcome.org_id, error: outcome.error } },
      `backup FAILED for ${outcome.org_id ?? "the whole pass"}: ${outcome.error}`,
    );
  }
  const failed = outcomes.filter((outcome) => !outcome.ok).length;
  if (failed > 0) {
    throw new Error(
      `${String(failed)} of ${String(outcomes.length)} backup(s) failed — see the backup_failed ` +
        "record(s) above for the tenant and the reason",
    );
  }
};

const main = async (): Promise<void> => {
  const env = defineEnv({
    /**
     * Required, with no default — deliberately unlike `services/sync-gateway`, whose
     * `DATABASE_URL_DEFAULT` exists so a till's sync can be brought up without knowing a URL. The
     * failure modes are opposite: a gateway pointed at the wrong database is loud on the first
     * request, while a batch job that quietly audits a database nobody named reports `ok` about
     * the wrong ledger. `18 §5`'s "crash at boot on invalid env" is the default posture and this
     * takes it.
     */
    DATABASE_URL: (raw) => {
      if (raw === undefined || raw === "") {
        throw new Error("required (the kernel database this job audits — 20 §4.2)");
      }
      return raw;
    },
    /**
     * Required for the same reason. `ioredis` retries a refused connection for ever, so a worker
     * with no Redis boots, prints, and never runs a single pass — a silent Auditor, which is the
     * precise state this whole file exists to end.
     */
    REDIS_URL: (raw) => {
      if (raw === undefined || raw === "") {
        throw new Error("required (the BullMQ queue backend — 18 §5)");
      }
      return raw;
    },
    /**
     * Optional; the default is nightly. The knob exists because "nightly" is not observable inside
     * a test's lifetime, and because a dev-pilot investigating a reported diff should not wait a
     * day to re-run the check.
     */
    AUDITOR_INTERVAL_MS: (raw) => {
      if (raw === undefined || raw === "") return NIGHTLY_MS;
      const ms = Number(raw);
      if (!Number.isInteger(ms) || ms <= 0) throw new Error(`not a positive integer: ${raw}`);
      return ms;
    },
    /**
     * **Where per-tenant artifacts are written, and the switch that turns the backup on**
     * (R38, `22-F22`).
     *
     * **OPTIONAL, and absent means the backup does not run — not that it runs somewhere default.**
     * The two alternatives were both rejected. *Required* would break every existing deployment of
     * this worker at boot to enforce an FR about a different pass, and would take the Auditor down
     * with it — `20 §4.2` says never crash a service mid-service, and a worker that will not start
     * is the strongest form of that. *Defaulted* is worse: a path this process invented is a
     * directory nobody rotates, nobody monitors and nobody copies off the box, so the deployment
     * would believe it had backups because a job reported success (`22-F21`: an artifact nobody can
     * restore is worse than a missing one, because it retires the alarm).
     *
     * Absent is therefore **visible** rather than silent: the boot line says `backup_dir: null` and
     * the queue is never created, so `KEYS` against the Redis shows no backup queue at all.
     */
    BACKUP_DIR: (raw) => (raw === undefined || raw === "" ? null : raw),
    /**
     * `22-F22`'s dump interval, which **IS** this deployment's real RPO. Optional; the default is a
     * night, matching R38's own word. See `backup_rpo_ms` on the boot record.
     */
    BACKUP_INTERVAL_MS: (raw) => {
      if (raw === undefined || raw === "") return NIGHTLY_MS;
      const ms = Number(raw);
      if (!Number.isInteger(ms) || ms <= 0) throw new Error(`not a positive integer: ${raw}`);
      return ms;
    },
  });

  // Structured JSON on stdout (`18 §5`), written synchronously: an operator tailing a log and the
  // acceptance suite reading this process's stdout both want a record to exist the moment it is
  // emitted rather than whenever a buffer happens to flush.
  const log = pino({ level: "info" }, destination({ dest: 1, sync: true }));

  const database = redactedDsn(env.DATABASE_URL);
  // Printed BEFORE anything touches Redis or Postgres, because these are facts this process already
  // holds and the two questions that cost real time when they have no answer are "which database is
  // it auditing" and "how often" (`00 §5.7`; `server.ts`'s boot lines exist for the same reason).
  log.info(
    {
      jobs: {
        kind: "boot",
        database,
        queue: redactedDsn(env.REDIS_URL),
        auditor_interval_ms: env.AUDITOR_INTERVAL_MS,
        backup_dir: env.BACKUP_DIR,
        backup_interval_ms: env.BACKUP_INTERVAL_MS,
        /**
         * **`22-F22` in one field, and it is the honest number rather than the aspirational one.**
         * `22-F1` wants RPO ≤ 5 min via continuous WAL archiving; `22-F22` permits a scheduled
         * logical dump as the interim and requires, in its own words, that *"22-F1's RPO ≤ 5 min
         * does not hold under it — the real RPO is the dump interval, and that number MUST be
         * written into the deployment's runbook beside the command that produces it"*.
         *
         * So it is **derived from the interval and never stated independently**. Printing `300000`
         * here because that is the number `22-F1` names would be a host claiming an objective it
         * misses by up to a day, on the one line an operator reads at 3am. It is the same value by
         * construction, which is the point: two fields that could disagree would eventually.
         *
         * ⚠ **The FR says RUNBOOK, and a log line is not a runbook.** This is a PINNED READING: it
         * is asserted here because a runbook is unassertable from a suite and because the number
         * stated beside the schedule is the one an operator actually reads. The runbook sentence is
         * owed **on top of** this, not instead of it, and `docs/runbooks/` does not exist yet
         * (`22-F5`'s named ownership is unmet for the same reason).
         */
        backup_rpo_ms: env.BACKUP_INTERVAL_MS,
      },
    },
    `@restos/jobs auditing every org of ${database} every ${String(env.AUDITOR_INTERVAL_MS)} ms (20 §4.2)` +
      (env.BACKUP_DIR === null
        ? "; per-tenant backup is OFF (no BACKUP_DIR — R38/22-F22)"
        : `; backing every tenant up to ${env.BACKUP_DIR} every ${String(env.BACKUP_INTERVAL_MS)} ms, ` +
          `which is this deployment's real RPO (22-F22)`),
  );

  const db = drizzle(env.DATABASE_URL);
  // Two connections, not one: a BullMQ Worker blocks on its connection waiting for jobs, so a Queue
  // sharing it would wait behind that block. `maxRetriesPerRequest: null` is BullMQ's requirement
  // for a Worker connection.
  const forQueue = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const forWorker = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const connections = [forQueue, forWorker];
  // A THIRD connection when the backup is on, for the reason above: each Worker blocks its own.
  const forBackupWorker =
    env.BACKUP_DIR === null ? null : new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  if (forBackupWorker !== null) connections.push(forBackupWorker);
  for (const connection of connections) {
    // An EventEmitter with no `error` listener THROWS, so without this a Redis blip takes the
    // process down — the one thing `20 §4.2` names outright ("never crash a service mid-service").
    // No `jobs` key: the record surface the acceptance suite pins has four kinds and a queue
    // transport fault is none of them; inventing a fifth would put a shape in the product that no
    // spec names. It is still on stdout at error level, which is what an operator needs.
    connection.on("error", (error: unknown) => {
      log.error(`@restos/jobs redis connection fault: ${describeFault(error)}`);
    });
  }

  const queue = new Queue(QUEUE_NAME, { connection: forQueue });
  // `18 §5`: "Scheduled work uses BullMQ repeatables — no OS cron." Upsert, so a restarted or
  // re-deployed worker adopts the schedule instead of stacking a second one on it.
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: env.AUDITOR_INTERVAL_MS },
    { name: JOB_NAME },
  );

  new Worker(
    QUEUE_NAME,
    async () => {
      try {
        await auditEveryOrg(db, log);
      } catch (error) {
        // `20 §4.2`: "never crash a service mid-service". A database this job cannot read is LOUD
        // and it is not fatal — the schedule survives it, so the next pass tries again. Rethrown so
        // BullMQ records the pass as failed rather than as one that never happened.
        log.error(
          { jobs: { kind: "auditor_failed", error: describeFault(error) } },
          `@restos/jobs auditor pass failed against ${database}; the schedule continues`,
        );
        throw error;
      }
    },
    { connection: forWorker },
  );

  if (env.BACKUP_DIR !== null && forBackupWorker !== null) {
    const dir = env.BACKUP_DIR;
    /**
     * A raw `postgres` handle rather than the drizzle one above, because the backup reads and
     * writes **rows it does not model** — every column of every org-keyed table, discovered from
     * `information_schema` (`tenant-artifact.ts`). A typed query builder would need a hand-copied
     * table list, which is exactly the thing that stops covering a table the day one is added.
     * `max: 2` matches the suite's own handle: this is a sequential pass, not a fan-out.
     */
    const backupDb = postgres(env.DATABASE_URL, { max: 2 });
    const backupQueue = new Queue(BACKUP_QUEUE_NAME, { connection: forQueue });
    await backupQueue.upsertJobScheduler(
      BACKUP_SCHEDULER_ID,
      { every: env.BACKUP_INTERVAL_MS },
      { name: BACKUP_JOB_NAME },
    );
    new Worker(
      BACKUP_QUEUE_NAME,
      async () => {
        try {
          await backupEveryTenant(backupDb, dir, log);
        } catch (error) {
          // The pass has already reported each failing tenant by name at error level; this is the
          // rethrow that makes BullMQ record the PASS as failed. Never fatal, for `auditEveryOrg`'s
          // reason: a schedule that dies with the first fault is a deployment that stops taking
          // backups on the night it most needed one.
          throw error instanceof Error ? error : new Error(describeFault(error));
        }
      },
      { connection: forBackupWorker },
    );
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Crash at boot on invalid env (18 §5) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
