/**
 * `03-F4`'s durable print spool — the host's half of `createSpooler`'s `store` seam.
 *
 * The FR, verbatim: "every print job is **persisted (SQLite, WAL)** with an explicit state machine
 * … **before the first transmit attempt**; a crash or power loss mid-print resumes or reprints the
 * job on restart — never drops it."
 *
 * **Why this file exists.** K-6 built the spooler and its oracle mutation-proved the point: a
 * spooler holding its jobs in a `Map` passes 32 behavioural tests and loses the kitchen's tickets
 * on a power cut, so `spooler-durability.test.ts` was written to fail exactly that. Then K-7 wired
 * the spooler into `main/index.ts` and **passed no store** — so the shipped queue was
 * process-lifetime, the crash clause was unmet, and every gate was green. That is the wave's named
 * defect (AGENTS.md: a correct subsystem with no seam to the product) in its fifth instance, and
 * this file plus the seam assertion in `__acceptance__/kot-printing.test.ts` close it.
 *
 * Modelled on `packages/sync-client/src/pin-attempts.ts` — the repo's existing "durable state
 * behind a narrow seam" precedent, and named as the model by K-6's oracle. Same reason in both
 * cases: state that only lives in the process is defeated by relaunching the app.
 *
 * DECLARED INTERPRETATION (`24 §3b`) — **its own file, beside the device store, not a table
 * inside it.** `18 §4` calls this queue one implementation shared with the sync outbox (`01-F8`)
 * and the fiscal queue (`16-F11`), and consolidating the three is real work that is not owed here.
 * The named simpler alternative — a `print_jobs` table in `device.db` — is rejected on two
 * grounds: that schema lives in `packages/sync-client` (a protected path, `20 §4.4`) and would
 * pull a senior review onto a wiring fix, and a print spool is not ledger data — `01-F1`'s
 * append-only law governs `events`, while a job row is overwritten on every transition by design.
 * What both options buy identically is the property `03-F4`'s storage clause exists for: the bytes
 * outlive the process that wrote them.
 *
 * **No physical printer has run any of this** (K-8 owed). Every "power cut" in the tests is
 * `close()`, and nothing here is evidence about paper.
 */

import type { PersistedJob, SpoolerJobStore } from "@restos/escpos";
import Database from "better-sqlite3";

/**
 * `03-F4`'s state machine, written down.
 *
 * `document` is a BLOB and not a derivation, because the FR's second half needs it: "a crash or
 * power loss mid-print **resumes or reprints** the job on restart". A store that persisted the
 * state and dropped the bytes would satisfy the first clause and still leave the kitchen with a
 * record of a ticket nobody can print.
 *
 * There is no `DELETE`. `03-F4` says "never drops it", and a `printed` row that has been removed
 * is indistinguishable on restart from a job that was never enqueued — the duplicate KOT `03-F41`
 * is written about, arriving by a third route.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS print_jobs (
  job_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  printer_name TEXT NOT NULL,
  order_ref TEXT NOT NULL,
  document BLOB NOT NULL,
  covers TEXT
) STRICT;
`;

/**
 * `03-F55`'s coverage column on a spool this device already wrote.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that exists, so a till upgraded with orders
 * still open would `SELECT covers` against a five-column table and throw on the first read — at
 * boot, on the one file whose whole job is to outlive the process. `03-F55` requires the opposite:
 * "a spool written before this FR is honoured rather than reprinted on the upgrade".
 *
 * NULLABLE and never backfilled. A row written by the previous version recorded no coverage and
 * there is nothing to reconstruct it from; `main/printing.ts` decides what to do about that, and
 * writing `'[]'` here would forge the answer "that chit carried nothing" into a durable file.
 */
const MIGRATIONS: readonly { column: string; sql: string }[] = [
  { column: "covers", sql: "ALTER TABLE print_jobs ADD COLUMN covers TEXT" },
];

export type OpenJobStore = SpoolerJobStore & {
  /** Release the file handle. Registered on `will-quit`; also the tests' power cut. */
  close(): void;
};

export type OpenJobStoreOptions = {
  path: string;
  /**
   * The Electron-ABI addon, for the same reason `openStore` takes one: one checkout serves two V8
   * ABIs and `build/Release/` belongs to the Node the test suites run under.
   */
  nativeBinding?: string | undefined;
};

type Row = Omit<PersistedJob, "document" | "state" | "covers"> & {
  state: string;
  document: Buffer;
  /** JSON, or `NULL` for a row written before `03-F55` (see `MIGRATIONS`). */
  covers: string | null;
};

export const openJobStore = ({ path, nativeBinding }: OpenJobStoreOptions): OpenJobStore => {
  const db = new Database(path, nativeBinding === undefined ? {} : { nativeBinding });
  // `03-F4` names WAL by name; `00 §5.2`'s plug-pull law outranks throughput, which is why
  // `synchronous` is FULL here exactly as it is on the device store.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = FULL");
  db.exec(SCHEMA);
  const present = new Set(
    (db.pragma("table_info(print_jobs)") as { name: string }[]).map((column) => column.name),
  );
  for (const migration of MIGRATIONS) {
    if (!present.has(migration.column)) db.exec(migration.sql);
  }

  // `rowid` is the FIRST-write order (`SpoolerJobStore.load`: "in the order it was first
  // written"). `ON CONFLICT DO UPDATE` preserves it, so a job that transitions four times keeps
  // the position it was enqueued in rather than jumping to the end of the queue on every commit.
  //
  // ⚠ **EVERY COLUMN IS NAMED HERE THREE TIMES AND NOTHING CHECKS THE THREE AGREE.** A field added
  // to `PersistedJob` and not to these two statements is dropped silently, with the type checker,
  // `pnpm seams:check` and every suite in this package green — the job round-trips, it just comes
  // back without the field. `03-F55`'s two power-cut assertions in `__acceptance__/kot-addendum.
  // test.ts` are the only things in this repo that can see it happen to `covers`.
  const all = db.prepare(
    "SELECT job_id, state, attempts, printer_name, order_ref, document, covers FROM print_jobs ORDER BY rowid",
  );
  const upsert = db.prepare(
    `INSERT INTO print_jobs (job_id, state, attempts, printer_name, order_ref, document, covers)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE
       SET state = excluded.state, attempts = excluded.attempts,
           printer_name = excluded.printer_name, order_ref = excluded.order_ref,
           document = excluded.document, covers = excluded.covers`,
  );

  return {
    // COPIED out of the Buffer: `Buffer` is a view into a pooled allocation, and handing one
    // straight to the spooler would let an unrelated allocation rewrite a queued KOT's bytes.
    load: () =>
      (all.all() as Row[]).map((row) => ({
        job_id: row.job_id,
        state: row.state as PersistedJob["state"],
        attempts: row.attempts,
        printer_name: row.printer_name,
        order_ref: row.order_ref,
        document: Uint8Array.from(row.document),
        // `NULL` stays ABSENT rather than becoming `[]` — `03-F55` reads the two differently, and
        // an empty array is the claim "that chit carried no lines", which is never true of a chit.
        ...(row.covers === null ? {} : { covers: JSON.parse(row.covers) as readonly string[] }),
      })),
    // SYNCHRONOUS, and that is forced rather than chosen: `enqueue` is synchronous (`01-F17` — a
    // sale is never blocked) and `03-F4` puts this write BEFORE the first transmit. An await
    // between the two is exactly the window a power cut loses the ticket in.
    put: (job) => {
      upsert.run(
        job.job_id,
        job.state,
        job.attempts,
        job.printer_name,
        job.order_ref,
        Buffer.from(job.document),
        job.covers === undefined ? null : JSON.stringify(job.covers),
      );
    },
    close: () => db.close(),
  };
};
