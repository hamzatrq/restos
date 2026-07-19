// T-01-07 acceptance global setup (plans/wave-0/kernel-tasks.md T-01-07, testing
// approach): ONE real Testcontainers Postgres for the whole suite run — 20 §1 /
// 18 §12 ban mocked infra in service tests. Per-test isolation is fresh org_ids,
// never truncation, so a single container serves every file.
//
// Local Docker is an ENVIRONMENT PREREQUISITE (T-01-07 Check line): when Docker
// is absent this setup fails loudly with a clear message — it never silently
// skips.
//
// ── MIGRATE SEAM (binding contract for the implementation session) ───────────
// This setup applies the Drizzle migrations programmatically at suite start so
// the migrations themselves are exercised every run. The contracted seam:
//
//   services/sync-gateway/src/migrate.ts must export
//     applyMigrations(databaseUrl: string): Promise<void>
//
// which applies EVERY migration under services/sync-gateway/drizzle/ (append-only,
// 18 §4) against the given database — creating the `kernel` schema and all four
// tables of the T-01-07 Postgres data contract. The impl session authors both the
// migrations and this export; nothing else about the seam may change.
// ─────────────────────────────────────────────────────────────────────────────
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { GenericContainer, Wait } from "testcontainers";

// EXACT image per T-01-07 harness instructions — do not drift the tag.
const POSTGRES_IMAGE = "postgres:16-alpine";
export const DATABASE_URL_ENV = "SYNC_GATEWAY_TEST_DATABASE_URL";

const waitForReady = async (url: string): Promise<void> => {
  const probe = drizzle(url);
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await probe.execute(sql`select 1`);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`[T-01-07] postgres container never became query-ready: ${String(lastError)}`);
  } finally {
    await probe.$client.end({ timeout: 5 });
  }
};

export default async function globalSetup(): Promise<() => Promise<void>> {
  let container: Awaited<ReturnType<GenericContainer["start"]>>;
  try {
    container = await new GenericContainer(POSTGRES_IMAGE)
      .withEnvironment({
        POSTGRES_USER: "restos",
        POSTGRES_PASSWORD: "restos",
        POSTGRES_DB: "kernel_test",
      })
      .withExposedPorts(5432)
      // The postgres image logs "ready to accept connections" twice (init +
      // real start); waiting for the second occurrence avoids the restart race.
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
  } catch (cause) {
    throw new Error(
      "[T-01-07] Could not start Testcontainers postgres:16-alpine. Local Docker is an " +
        "environment prerequisite for the @restos/sync-gateway acceptance suite " +
        "(plans/wave-0/kernel-tasks.md T-01-07 Check). This suite must fail loudly, " +
        "never silently skip. Start Docker and re-run.",
      { cause },
    );
  }

  const databaseUrl = `postgres://restos:restos@${container.getHost()}:${container.getMappedPort(5432)}/kernel_test`;

  try {
    await waitForReady(databaseUrl);

    // Migrate seam — see the contract block at the top of this file.
    let applyMigrations: (databaseUrl: string) => Promise<void>;
    try {
      ({ applyMigrations } = await import("../migrate.js"));
    } catch (cause) {
      throw new Error(
        "[T-01-07 migrate seam] services/sync-gateway/src/migrate.ts must export " +
          "applyMigrations(databaseUrl: string): Promise<void>, applying every migration " +
          "under services/sync-gateway/drizzle/ programmatically (T-01-07 testing approach: " +
          "migrations are exercised on every suite run). The implementation session owns " +
          "that file; this suite is RED until it exists.",
        { cause },
      );
    }
    await applyMigrations(databaseUrl);
  } catch (error) {
    await container.stop();
    throw error;
  }

  // vitest pool is "forks" (vitest.config.ts): env set here propagates to the
  // worker processes spawned after global setup — the sanctioned URL channel.
  process.env[DATABASE_URL_ENV] = databaseUrl;

  return async () => {
    await container.stop();
  };
}
