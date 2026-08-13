/**
 * **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2 / `20 §4.3` separation rule). The author of this
 * suite read `specs/20-testing-correctness.md` §4.2, `specs/18-engineering-handbook.md` §§4/5/14/15,
 * `specs/22-operations-recovery.md` §"Runs as", `specs/DECISIONS.md` (`DEC-MONEY-009`),
 * `services/sync-gateway/src/auditor.ts` and the LANDED `services/sync-gateway` process precedent
 * (`server.ts` + `__acceptance__/startable.test.ts`). **No plan for this task was opened and no
 * implementation of `services/jobs` exists at authoring time.**
 *
 * ── WHY TWO CONTAINERS ───────────────────────────────────────────────────────────────────────
 *
 * **Postgres** because `20 §4.2`'s Auditor is defined over the kernel tables and `20 §1` bans
 * mocked infra in service tests ("real Postgres/Redis per run — mocked infra in service tests is
 * banned"). The schema is created by running `services/sync-gateway`'s **declared `migrate`
 * script** as a subprocess — a process boundary, not an import, so this harness takes no position
 * on the (open) question of whether `services/jobs` may import `@restos/sync-gateway`.
 *
 * **Redis** because `18 §5` requires scheduled work to run on **BullMQ repeatables**, and a worker
 * built that way cannot boot without one. It is started so that the behavioural assertions in
 * `auditor-host.test.ts` are satisfiable under *either* reading of the scheduler question (§G in
 * that file is the only test that binds the mechanism). `20 §1` names Redis in both the local-dev
 * and CI rows, and `18 §14` already allowlists `bullmq` + `ioredis`, so this is specified
 * infrastructure rather than infrastructure this suite invented.
 *
 * Local Docker is an ENVIRONMENT PREREQUISITE and this setup fails **loudly** rather than skipping
 * (`T-01-07` precedent, `20 §1`).
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import postgres from "postgres";
import { GenericContainer, Wait } from "testcontainers";

const POSTGRES_IMAGE = "postgres:16-alpine";
const REDIS_IMAGE = "redis:7-alpine";

/** The audited database — seeded by `helpers.ts`, read by the spawned worker. */
export const DATABASE_URL_ENV = "JOBS_TEST_DATABASE_URL";
/**
 * A database that EXISTS and has no `kernel` schema. §F's "an unreadable database is loud and the
 * schedule survives it" needs a reachable server whose queries fail — a closed port would only
 * prove that connecting fails, which is a different claim.
 */
export const BROKEN_DATABASE_URL_ENV = "JOBS_TEST_BROKEN_DATABASE_URL";
export const REDIS_URL_ENV = "JOBS_TEST_REDIS_URL";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const GATEWAY_DIR = resolve(REPO_ROOT, "services", "sync-gateway");

const waitForReady = async (url: string): Promise<void> => {
  const probe = postgres(url, { max: 1 });
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await probe`select 1`;
        return;
      } catch (error) {
        lastError = error;
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    throw new Error(`[jobs] postgres container never became query-ready: ${String(lastError)}`);
  } finally {
    await probe.end({ timeout: 5 });
  }
};

/**
 * Runs `services/sync-gateway`'s DECLARED `migrate` script against the container. Declared rather
 * than hardcoded for the same reason `startable.test.ts` spawns `scripts.start`: a harness that
 * hardcodes `tsx src/migrate.ts` keeps working after someone deletes the command, and the command
 * is what an operator actually has.
 */
const migrateKernelSchema = async (databaseUrl: string): Promise<void> => {
  const script = "pnpm --silent migrate";
  const code = await new Promise<number | null>((done, fail) => {
    const child = spawn(script, {
      shell: true,
      cwd: GATEWAY_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    let noise = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      noise += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      noise += chunk;
    });
    child.on("error", fail);
    child.on("close", (exit) => {
      if (exit !== 0) {
        fail(new Error(`[jobs] \`${script}\` exited ${String(exit)} in ${GATEWAY_DIR}:\n${noise}`));
        return;
      }
      done(exit);
    });
  });
  if (code !== 0) throw new Error(`[jobs] kernel migration failed (exit ${String(code)})`);
};

export default async function globalSetup(): Promise<() => Promise<void>> {
  let pg: Awaited<ReturnType<GenericContainer["start"]>>;
  let redis: Awaited<ReturnType<GenericContainer["start"]>>;
  try {
    pg = await new GenericContainer(POSTGRES_IMAGE)
      .withEnvironment({
        POSTGRES_USER: "restos",
        POSTGRES_PASSWORD: "restos-jobs-suite-password",
        POSTGRES_DB: "kernel_test",
      })
      .withExposedPorts(5432)
      // The image logs "ready to accept connections" twice (init + real start).
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
  } catch (cause) {
    throw new Error(
      `[jobs] Could not start Testcontainers ${POSTGRES_IMAGE}. Local Docker is an environment ` +
        "prerequisite for the @restos/jobs acceptance suite (20 §1: real Postgres per run, mocked " +
        "infra banned). This suite fails loudly and never silently skips. Start Docker and re-run.",
      { cause },
    );
  }
  try {
    redis = await new GenericContainer(REDIS_IMAGE)
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();
  } catch (cause) {
    await pg.stop();
    throw new Error(
      `[jobs] Could not start Testcontainers ${REDIS_IMAGE}. 18 §5 puts scheduled work on BullMQ ` +
        "repeatables, so the worker under test may need a Redis to boot at all; 20 §1 names Redis " +
        "in the CI row. Start Docker and re-run.",
      { cause },
    );
  }

  const host = pg.getHost();
  const port = pg.getMappedPort(5432);
  const dsn = (database: string): string =>
    `postgres://restos:restos-jobs-suite-password@${host}:${port}/${database}`;
  const databaseUrl = dsn("kernel_test");

  const stopAll = async (): Promise<void> => {
    await redis.stop();
    await pg.stop();
  };

  try {
    await waitForReady(databaseUrl);
    // The §F fixture: a real database with no `kernel` schema in it.
    const admin = postgres(databaseUrl, { max: 1 });
    try {
      await admin.unsafe("create database jobs_no_kernel");
    } finally {
      await admin.end({ timeout: 5 });
    }
    await migrateKernelSchema(databaseUrl);
  } catch (error) {
    await stopAll();
    throw error;
  }

  // vitest pool is "forks": env set here reaches the worker processes spawned after global setup.
  process.env[DATABASE_URL_ENV] = databaseUrl;
  process.env[BROKEN_DATABASE_URL_ENV] = dsn("jobs_no_kernel");
  process.env[REDIS_URL_ENV] = `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`;

  return stopAll;
}
