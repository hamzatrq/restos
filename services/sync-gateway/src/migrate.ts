// T-01-07 migrate seam (contracted in src/__acceptance__/global-setup.ts):
// applies EVERY migration under services/sync-gateway/drizzle/ programmatically,
// creating the `kernel` schema and all six data-contract tables (four original
// + quarantine_notices T-01-08 + device_registry T-01-09) — migrations
// are exercised on every suite run (T-01-07 testing approach; 18 §4 append-only).
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export const applyMigrations = async (databaseUrl: string): Promise<void> => {
  const db = drizzle(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};
