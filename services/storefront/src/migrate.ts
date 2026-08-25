import { fileURLToPath, pathToFileURL } from "node:url";
import { redactedDsn } from "@restos/config";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * `06-F36` (a) — the storefront's own schema, applied by its own declared command.
 *
 * **A separate, deliberate act; the server does not migrate itself**, on `services/sync-gateway`'s
 * recorded reasoning: a service that migrates its own database on boot races its own replicas and
 * makes every process start a schema change. What the server does instead is *report* the state on
 * its boot line, so an unmigrated database is a sentence a human reads while bringing the stack up
 * rather than a 500 somewhere else later (`00 §5.7`).
 *
 * **This is not `kernel.*` and it never will be.** `18 §2` keeps services apart, `18 §4` makes the
 * gateway the writer of the kernel schema, and `06 §5` gives this module its own tables — so this
 * folder creates a `storefront` schema and touches nothing the gateway owns. The two may share one
 * Postgres instance or not; nothing here assumes either.
 */

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export const applyMigrations = async (databaseUrl: string): Promise<void> => {
  const db = drizzle(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

/**
 * How many migrations the next `applyMigrations` would apply, and how many this build carries.
 *
 * Asks drizzle's own question rather than a second interpretation of it: `readMigrationFiles` is
 * the migrator's own reader and `watermark < folderMillis` is the migrator's own rule. Re-deriving
 * "is it migrated" from a table list would be a second reading of the schema, and two readings
 * diverge.
 *
 * ⚠ It reports the DEPLOY question honestly and oversells nothing: `pending === 0` means the
 * journal has been applied, never that the schema is intact — a hand-dropped table leaves the
 * watermark untouched and this still answers zero.
 */
export const pendingMigrations = async (
  databaseUrl: string,
): Promise<{ pending: number; total: number }> => {
  const files = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const db = drizzle(databaseUrl);
  try {
    const rows = await db.execute<{ created_at: string | number | null }>(
      // eslint-disable-next-line no-restricted-syntax -- raw SQL is the migrator's own table
      `select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
    );
    const watermark = Number([...rows][0]?.created_at ?? 0);
    return {
      pending: files.filter((file) => watermark < Number(file.folderMillis)).length,
      total: files.length,
    };
  } catch {
    // No `drizzle.__drizzle_migrations` at all — nothing has ever been applied here.
    return { pending: files.length, total: files.length };
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (databaseUrl === "") {
    throw new Error(
      "06-F36: set DATABASE_URL. There is deliberately no default here, unlike the gateway's: " +
        "this service's outbox is where a customer's accepted order lives, and a migrate command " +
        "that guessed an address could report success against the wrong database entirely.",
    );
  }
  const before = await pendingMigrations(databaseUrl);
  await applyMigrations(databaseUrl);
  console.log(
    before.pending === 0
      ? `@restos/storefront-service migrate nothing to apply — all ${before.total} migrations ` +
          `were already present · ${redactedDsn(databaseUrl)}`
      : `@restos/storefront-service migrate applied ${before.pending} of ${before.total} ` +
          `migrations · ${redactedDsn(databaseUrl)}`,
  );
}
