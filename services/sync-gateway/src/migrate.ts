// T-01-07 migrate seam (contracted in src/__acceptance__/global-setup.ts):
// applies EVERY migration under services/sync-gateway/drizzle/ programmatically,
// creating the `kernel` schema and all six data-contract tables (four original
// + quarantine_notices T-01-08 + device_registry T-01-09) — migrations
// are exercised on every suite run (T-01-07 testing approach; 18 §4 append-only).
//
// **AND IT IS A RUNNABLE COMMAND: `pnpm -C services/sync-gateway migrate`** (August 2026). Until
// then `applyMigrations` carried a by-design unreached marker naming its callers as the test
// harness "and whatever runs the deploy" — and NOTHING RAN THE DEPLOY. There was no migrate script
// anywhere in the repo, so the only way to migrate was a `tsx -e` one-liner a human copied out of a
// runbook, and a gateway pointed at an unmigrated database boots perfectly and then 500s on first
// use (`postgres-js` opens lazily). That is AGENTS.md's recurring defect in its second shape: a
// correct subsystem whose only caller is a sentence in a comment.
//
// (The marker token itself is deliberately not written out above: `check-seams.mjs` treats a marker
// in a file header as covering every export in the file, so quoting it here would silently mark
// this whole module exempt — and then FAIL the rail for a stale exception. Measured, not guessed.)
//
// **MIGRATION IS A SEPARATE, DELIBERATE ACT — the server does not migrate itself.** The reasoning
// was already recorded on this file and is unchanged: a service that migrates its own database on
// boot races its own replicas, and every process start becomes a schema change. It is also this
// service's own precedent for an absent dependency — `PUBLISH_TOKEN` absent is fail-closed and
// does NOT crash the boot, because a gateway that cannot serve one surface must not take the till's
// sync down with it (`server.ts`). What the server DOES do is `pendingMigrations` below: it reports
// the schema state on its fourth boot line, so an unmigrated database is a sentence a human reads
// while bringing the stack up rather than a 500 somewhere else later (`00 §5.7`).
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineEnv } from "@restos/config";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { DATABASE_URL_DEFAULT, redactedDsn } from "./database-url.js";

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
 * How many migrations the NEXT `applyMigrations` would apply, and how many this build carries.
 *
 * **This asks drizzle's own question, not a second interpretation of it.** `readMigrationFiles` is
 * the migrator's own reader, and the comparison below (`watermark < folderMillis`) is the migrator's
 * own rule, copied from `pg-core/dialect.ts`: it keeps ONE `created_at` watermark and applies every
 * migration stamped after it. Re-deriving "is it migrated" from a table list would be a second
 * interpretation of the schema, and two interpretations diverge.
 *
 * ⚠ **What it does NOT prove, measured rather than assumed.** `pending === 0` means the journal has
 * been applied — it does NOT mean the schema is intact. Drop `kernel.org_events` by hand and leave
 * the journal alone and this returns `pending: 0` for a database that 500s, because the watermark
 * never moved; re-running `applyMigrations` against that database also reports success and repairs
 * nothing. That is a hand-edited database, not a state any deploy path produces, and the migrator
 * itself cannot fix it — so this reports the deploy question honestly instead of overselling a
 * schema audit it does not perform.
 */
export const pendingMigrations = async (
  databaseUrl: string,
): Promise<{ readonly pending: number; readonly total: number }> => {
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const db = drizzle(databaseUrl);
  try {
    // Two steps rather than one: the journal table does not exist on a virgin database, and
    // `select … from drizzle.__drizzle_migrations` fails at PARSE time there, so it cannot be
    // guarded by a `case`. An absent table is "nothing applied", not an error.
    const present = await db.execute<{ readonly n: number }>(
      sql`select count(*)::int as n from information_schema.tables
          where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`,
    );
    const watermark =
      (present[0]?.n ?? 0) === 0
        ? null
        : ((
            await db.execute<{ readonly watermark: string | null }>(
              sql`select max(created_at)::text as watermark from drizzle.__drizzle_migrations`,
            )
          )[0]?.watermark ?? null);
    const applied = watermark === null ? null : Number(watermark);
    const pending = migrations.filter(
      (migration) => applied === null || applied < migration.folderMillis,
    ).length;
    return { pending, total: migrations.length };
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

/**
 * The command's own line, exported so `__acceptance__/migratable.test.ts` matches THIS string
 * rather than a hand-copy of it (round-3 law, `K-3`: a copied literal keeps passing against a
 * command that no longer says it).
 */
export const MIGRATE_PREFIX = "@restos/sync-gateway migrate ";

/**
 * ⚠ **`applyMigrations` prints Postgres NOTICEs on a database that is already migrated, and they
 * are not errors.** `42P06 schema "drizzle" already exists, skipping` and `42P07 relation
 * "__drizzle_migrations" already exists, skipping` come from the migrator's own
 * `CREATE … IF NOT EXISTS` preamble, dumped by `postgres-js`'s default notice handler as objects
 * with a `code` field that read like faults. They are evidence of idempotency, not of a problem —
 * which is why this command ends with a line that states the outcome in words and why its exit code
 * is the thing to trust.
 */
const main = async (): Promise<void> => {
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
  });
  const before = await pendingMigrations(env.DATABASE_URL);
  await applyMigrations(env.DATABASE_URL);
  const after = await pendingMigrations(env.DATABASE_URL);
  if (after.pending !== 0) {
    // Not reachable through a migrator that resolved — and it is asserted anyway, because
    // "the command exited 0" is the only thing a deploy script reads.
    throw new Error(
      `applied ${String(before.pending - after.pending)} migration(s) and ${String(after.pending)} ` +
        `of ${String(after.total)} are still pending`,
    );
  }
  console.log(
    `${MIGRATE_PREFIX}${
      before.pending === 0
        ? `nothing to apply — all ${String(after.total)} migrations were already present`
        : `applied ${String(before.pending)} of ${String(after.total)} migrations`
    } · ${redactedDsn(env.DATABASE_URL)}`,
  );
};

// The same shape as `server.ts`'s entry guard: importable without running (which is what
// `global-setup.ts` does), runnable as the declared script.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Loud, never degraded (`18 §5`). A deploy step that fails quietly is worse than none: the
    // gateway would boot on the schema it has and 500 on the first request that needs the rest.
    console.error(error);
    process.exit(1);
  });
}
