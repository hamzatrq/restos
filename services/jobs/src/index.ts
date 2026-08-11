/**
 * **`20 §4.2`'s Auditor, given a host.** Owning spec: `specs/20-testing-correctness.md` §4.2 —
 * *"A nightly cloud job per org: refold the entire ledger from raw events with the current fold
 * code and diff against the incrementally-maintained read models and last-reported device states …
 * logged + alerted in production (never crash a service mid-service) … The Auditor is the single
 * highest-value correctness artifact we build. **It ships in Wave 0 with the kernel, not later.**"*
 *
 * `runAuditor` has been complete, correct and covered by ten suites since Wave 0, and **nothing ran
 * it**: `services/jobs` was `export {};` with no `dev`/`start` script, so the Auditor could not be
 * run as a process at all. That is AGENTS.md's recurring defect — a correct subsystem with no seam
 * to the product — and this file is the seam. `DEC-MONEY-009` is the reason it matters beyond the
 * checkbox: its partition case is open **by construction** and its residual column names a
 * scheduled Auditor as one of the three things owed for it, so until this ran, a permanently
 * doubled cash figure had nothing looking for it.
 *
 * Acceptance suite (written by a separate session from spec text, `20 §4.3` / `24 §3`, read-only to
 * the implementer): `src/__acceptance__/auditor-host.test.ts`. It spawns the DECLARED `start`
 * script and reads this process's stdout — so the record shapes below are a contract, not a style.
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
 * host that shouts every night is as silent as one that never shouts.
 *
 * **3. ⚠ THIS IMPORTS `runAuditor` ACROSS A SERVICE BOUNDARY, WHICH `18 §2` FORBIDS. IT IS NAMED
 * HERE BECAUSE IT NEEDS A SENIOR RULING, NOT BECAUSE IT IS FINE.** `18 §2`: *"**Dependency
 * direction (MUST):** `apps → packages`, `services → packages`, `packages → packages` … Cross-module
 * calls go through tRPC/events, **never through direct imports across service boundaries**."*
 * `services → services` is on neither list. The three ways out, and why this one:
 *   - **(A) taken here — declared subpath imports.** `services/sync-gateway` now publishes an
 *     `exports` map holding exactly `./auditor` and `./database-url` — the whole package was
 *     previously importable and is now two modules wide — so the coupling is enumerated, visible to
 *     `seams:check` (which resolves `@restos/*` ONLY through an `exports` field, so without this the
 *     seam would be invisible to the rail and `runAuditor` would still read as unreached), and
 *     reversible by deleting two lines when (B) lands.
 *   - **(B) the CORRECT end state, and OWED: move `auditor.ts` into a package.** Its substance is
 *     already there — `@restos/domain` and `@restos/sync-client/fold-engine` — and only the 519-line
 *     orchestration sits in the gateway. It is a PROTECTED-path restructure touching fifteen files
 *     plus the purity harness, and it extends `18 §2`'s enumerated `packages/` tree, so it needs a
 *     spec PR and senior review (`20 §4.4`) rather than a drive-by inside this task (`24 §3b`).
 *   - **(C) an `/internal/auditor/run` route on the gateway — rejected as unbuildable here.** The
 *     Auditor is a whole-ledger refold, not a request; and the acceptance suite hands this worker a
 *     `DATABASE_URL` and starts no gateway, so a host that reached the ledger only over HTTP could
 *     not satisfy `§F` (an unreadable *database* must be loud and non-fatal) at all.
 *
 * ── ONE INTERPRETATION, AND THE SIMPLER ALTERNATIVE NAMED (`24 §3b`) ─────────────────────────
 *
 * *"A nightly cloud job **per org**"* reads two ways: one scheduled job per org, or one scheduled
 * pass that audits every org and reports **per org**. This takes the second — one repeatable, one
 * report record per org per pass — because it is the smaller mechanism and because N concurrent
 * whole-ledger refolds against one Postgres is a load hazard a sequential pass does not have. The
 * unit the FR actually constrains, the per-org *report*, is identical either way.
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
 */
import { pathToFileURL } from "node:url";
import { defineEnv } from "@restos/config";
// See decision 3 above. `./database-url` is imported rather than copied for the same reason
// `revoke-device.ts` reads its eviction bound instead of writing "30 s": a second local redaction
// helper is a second interpretation of which part of a DSN may reach a log store (`18 §5`), and
// `03-F40`'s two sensor bit layouts is this corpus's own record of what that costs.
import { runAuditor } from "@restos/sync-gateway/auditor";
import { redactedDsn } from "@restos/sync-gateway/database-url";
import { Queue, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import IORedis from "ioredis";
import { destination, type Logger, pino } from "pino";

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
 * This is the ONLY statement this process issues that `runAuditor` does not, and it is a SELECT.
 * `01-F1`: the Auditor writes nothing, ever, and neither may its host — no run row, no "healed" gap,
 * nothing. The one component in this product documented to write nothing must not have a write
 * laundered through it.
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
      },
    },
    `@restos/jobs auditing every org of ${database} every ${String(env.AUDITOR_INTERVAL_MS)} ms (20 §4.2)`,
  );

  const db = drizzle(env.DATABASE_URL);
  // Two connections, not one: a BullMQ Worker blocks on its connection waiting for jobs, so a Queue
  // sharing it would wait behind that block. `maxRetriesPerRequest: null` is BullMQ's requirement
  // for a Worker connection.
  const forQueue = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const forWorker = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  for (const connection of [forQueue, forWorker]) {
    // An EventEmitter with no `error` listener THROWS, so without this a Redis blip takes the
    // process down — the one thing `20 §4.2` names outright ("never crash a service mid-service").
    // No `jobs` key: the record surface the acceptance suite pins has three kinds and a queue
    // transport fault is none of them; inventing a fourth would put a shape in the product that no
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
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Crash at boot on invalid env (18 §5) — loud, never degraded.
    console.error(error);
    process.exit(1);
  });
}
