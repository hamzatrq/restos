/**
 * `06-F36` (a) — ONE real Postgres for the whole suite run, and the MIGRATIONS are exercised on
 * every run because the setup applies them.
 *
 * ⚠ **THIS SUITE NOW NEEDS LOCAL DOCKER, WHICH IT DID NOT BEFORE.** `vitest.config.ts` used to say
 * *"No Testcontainers and no global setup … the Postgres implementation of the outbox is what
 * `06-F30`'s single-writer clause needs and is exercised by the gateway's own suite, not by this
 * one"* — and the second half of that sentence was never true: the gateway's suite has never held
 * a line of this module's storage. The outbox that reached production was the in-memory one, and
 * three accepted orders were measured landing nowhere. So the real one is tested here, against a
 * real database, or it is not tested at all.
 *
 * `20 §1` / `18 §12` ban mocked infra in service tests, and `T-01-07`'s rule applies unchanged:
 * absent Docker fails LOUDLY and never silently skips. Isolation between tests is a fresh
 * `(org, branch)` per case, never truncation, so one container serves every file.
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { GenericContainer, Wait } from "testcontainers";

const POSTGRES_IMAGE = "postgres:16-alpine";
export const DATABASE_URL_ENV = "STOREFRONT_TEST_DATABASE_URL";

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
    throw new Error(`[06-F36] postgres container never became query-ready: ${String(lastError)}`);
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
        POSTGRES_DB: "storefront_test",
      })
      .withExposedPorts(5432)
      // The image logs "ready to accept connections" twice (init + real start); waiting for the
      // second avoids the restart race.
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
  } catch (cause) {
    throw new Error(
      "[06-F36] Could not start Testcontainers postgres:16-alpine. Local Docker is an " +
        "environment prerequisite for the @restos/storefront-service acceptance suite: the " +
        "durable outbox is where a customer's accepted order lives, and testing it against " +
        "anything but a real Postgres is how the in-memory one reached production. This suite " +
        "fails loudly and never silently skips (T-01-07). Start Docker and re-run.",
      { cause },
    );
  }

  const databaseUrl = `postgres://restos:restos@${container.getHost()}:${container.getMappedPort(5432)}/storefront_test`;

  try {
    await waitForReady(databaseUrl);
    const { applyMigrations } = await import("../migrate.js");
    await applyMigrations(databaseUrl);
  } catch (error) {
    await container.stop();
    throw error;
  }

  process.env[DATABASE_URL_ENV] = databaseUrl;
  return async () => {
    await container.stop();
  };
}
