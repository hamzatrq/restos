// ops/sqlite-backup.mjs — one SQLite file, backed up correctly, while the app is running.
//
// Usage: node ops/sqlite-backup.mjs <source.db> <destination.db>
//
// WHY THIS IS NOT `cp`. The device store is opened WAL with `synchronous = FULL`, and
// apps/pos-electron never closes it — there is no `store.close()` on any quit handler, so the
// write-ahead log is NEVER checkpointed and an uncheckpointed WAL is the resting state of every
// till. Measured on a WAL store written exactly the way the device store is: after 500 inserts
// the main file was 4 KB and the -wal was 2 MB, and opening a copy of the main file ALONE gave
// "no such table" — not a few missing sales, the entire ledger. (22-F21.)
//
// SQLite's online backup API reads through the WAL and produces one self-contained file, which
// is why it is the first mechanism 22-F21 names. The `cp db db-wal db-shm` fallback in
// ops/backup.sh is the second, and it is only correct with the app closed.
//
// better-sqlite3 is resolved through apps/pos-electron, which declares it as a direct
// dependency — under pnpm's strict layout it is not resolvable from the repo root. This uses
// the NODE-ABI build in build/Release/, which the repo keeps as Node's on purpose (the Electron
// build lands in bin/<platform>-<arch>-<abi>/ instead), so this runs under plain `node` while
// the till is running under Electron.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("usage: node ops/sqlite-backup.mjs <source.db> <destination.db>");
  process.exit(2);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(repoRoot, "apps/pos-electron/package.json"));

let Database;
try {
  Database = require("better-sqlite3");
} catch (error) {
  // Loud and specific: the caller must be able to tell "this host cannot do an online backup"
  // (fall back to the closed-app file copy) from "the backup ran and was empty".
  console.error(
    `sqlite-backup: better-sqlite3 is not loadable from this checkout — ${error.message}\n` +
      "  Run `pnpm install` at the repo root. If `pnpm rebuild:native` has clobbered the\n" +
      "  Node-ABI copy you will see NODE_MODULE_VERSION here; apps/pos-electron/CLAUDE.md\n" +
      "  says how to restore build/Release/.",
  );
  process.exit(3);
}

let db;
try {
  db = new Database(source, { readonly: true, fileMustExist: true });
  await db.backup(destination);
  // Read the copy back before claiming success.
  //
  // ⚠ STATED HONESTLY, BECAUSE A COMMENT THAT PROMISES A PROTECTION IT DOES NOT GIVE IS WORSE
  // THAN NO COMMENT — it retires the assertion the next person would otherwise write. This
  // `integrity_check` was MUTATED OUT and the corrupt-source case still failed correctly, so it
  // is NOT what catches a bad source: `backup()` itself throws first ("file is not a database").
  // What it covers is the narrower case of a copy that lands damaged — a destination disk that
  // fills or writes badly — and no fixture here produces that, so treat it as unproven cover
  // rather than as the guard.
  //
  // The READ-WRITE open, by contrast, IS load-bearing and was proven by mutation. The copy
  // inherits WAL mode from the source, so merely opening it READONLY creates a -wal and a -shm
  // beside it that a readonly connection cannot clean up — and a one-file artifact that grows
  // two sidecars is indistinguishable at a glance from the ops/backup.sh fallback having run.
  // `journal_mode = delete` checkpoints into the main file and leaves exactly one file; with
  // that line removed the artifact stays in WAL mode and the next readonly reader litters it.
  // It does not change what a restore gets: packages/sync-client sets WAL on every open.
  const check = new Database(destination, { fileMustExist: true });
  const integrity = check.pragma("integrity_check", { simple: true });
  const tables = check.prepare("select count(*) c from sqlite_master where type = 'table'").get().c;
  check.pragma("journal_mode = delete");
  check.close();
  if (integrity !== "ok") throw new Error(`integrity_check on the copy said: ${integrity}`);
  console.log(`sqlite-backup: ${source} -> ${destination} (integrity ok, ${tables} tables)`);
} catch (error) {
  console.error(`sqlite-backup: FAILED on ${source} — ${error.message}`);
  process.exit(1);
} finally {
  db?.close();
}
