/**
 * **R38's per-tenant backup artifact, and the restore that reads it back.** Owning spec:
 * `specs/22-operations-recovery.md` (`22-F16`, `22-F21`, `22-F22`), with `01-F1` (append-only),
 * `01-F68` (an org with events and no directory row is UNNAMED, not invalid) and `01-F71` (f)
 * (the bulk data-copying path carries exactly one tenant's rows) binding every line below.
 *
 * R38: *"NIGHTLY PER-TENANT BACKUP + A RESTORE THAT HAS ACTUALLY BEEN RUN + OWNER-TRIGGERED
 * EXPORT … ⚠ **A restore nobody has performed is a backup nobody has**; the acceptance is a
 * restore, not a dump."* So the unit of work here is the RESTORE, and the artifact format exists
 * to serve it rather than the other way round.
 *
 * ── ⚠ WHAT IS NOT SPECIFIED, AND IS THEREFORE NOT DECIDED HERE ───────────────────────────────
 *
 * `plans/saas-pivot/mvp-plan.md`'s open question 13 asks *"what does per-tenant backup mean under
 * R38?"* and records two readings — **(a)** a per-org logical dump filtered by `org_id`, or **(b)**
 * a whole-database dump as the recovery mechanism with `22-F16`'s owner export as the only
 * per-tenant artifact — with the note that **only (b) is specified anywhere**. That is a founder
 * call. **This module implements (a) because the acceptance suite requires it**
 * (`__acceptance__/tenant-backup-restore.test.ts` §B3 asserts, byte for byte and in both
 * directions, that one tenant's artifact contains no marker of another), and the suite is the
 * contract this session may not edit (`24 §3`). **It is recorded as a resolved-by-oracle question
 * rather than as a settled one**, and `22-F23`'s closing clause says so in the corpus.
 *
 * `22-F22` is the only clause sanctioning an interim backup posture and it names `pg_dump` — which
 * **cannot filter by `org_id` at all**, in any format `pg_restore` reads. So a per-tenant artifact
 * cannot be a `pg_dump` and this file is our own logical dump. What is preserved from `22-F22` is
 * the part that matters to an operator: the real RPO is the dump interval and the deployment states
 * that number beside the schedule (`index.ts`'s `backup_rpo_ms`).
 *
 * ── THE FORMAT, AND WHY EACH PART OF IT EXISTS ───────────────────────────────────────────────
 *
 * JSON Lines, uncompressed, one file per org per pass:
 *
 *     {"kind":"restos.tenant-backup","format":1,"org_id":…,"taken_at":…,"tables":[…]}
 *     {"t":"orgs","r":{…}}
 *     …one line per row, in table order…
 *     {"kind":"restos.tenant-backup.end","rows":N,"digest":"<sha256 of every row line>"}
 *
 *   - **Uncompressed and self-describing**, because `22-F17`'s vendor-exit posture is *"no backup
 *     path that only the managed vendor can read"* and the same reasoning applies one level down:
 *     an artifact only this program can read is a restore only this program can perform. It also
 *     keeps the isolation claim CHECKABLE — §B3 greps the bytes for a neighbouring tenant's
 *     markers, which a compressed file would defeat while looking identical.
 *   - **A FOOTER with a row count and a digest.** This is what makes truncation detectable:
 *     `22-F21`'s rule generalises — *"a backup artifact that cannot be restored is worse than a
 *     missing one, because it retires the alarm"* — and a half-written file is exactly that. The
 *     digest covers the row lines only, so the header's `taken_at` cannot mask a body change.
 *   - **`format` is a NUMBER and is checked.** A future shape change gets a new number and an old
 *     artifact refuses loudly rather than half-restoring.
 *
 * ── THE TABLE LIST IS READ FROM THE DATABASE, NEVER HAND-COPIED ──────────────────────────────
 *
 * `orgTables()` asks `information_schema` which `kernel` tables carry an `org_id`. A hand-copied
 * list stops covering a table the day one is added — `schema.ts`'s own header records a count that
 * went wrong three times in comments — and here that failure is silent and expensive: the backup
 * looks complete, the restore reports success, and one table of the restaurant is simply gone.
 * The acceptance fixture reads the same view for the same reason, so the two cannot drift.
 *
 * ⚠ **Measured 2026-08-25: all TWENTY-ONE `kernel` tables carry `org_id`, so "every table carrying an
 * `org_id`" and "every kernel table" name the same set today.** They are not the same CLAIM — the
 * day a kernel table without an `org_id` lands, this backup silently stops covering it — so the
 * gap is named here rather than left for a reader to discover from a restore. `01-F68`'s ban on
 * foreign keys means there is no referential structure to derive it from either.
 */

import { createHash } from "node:crypto";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

/** Bumped only by a change an older reader could misparse. Checked on every restore. */
export const ARTIFACT_FORMAT = 1;

const HEADER_KIND = "restos.tenant-backup";
const FOOTER_KIND = "restos.tenant-backup.end";

export type ArtifactHeader = {
  readonly kind: typeof HEADER_KIND;
  readonly format: number;
  readonly org_id: string;
  readonly taken_at: number;
  readonly tables: readonly string[];
};

/**
 * Every `kernel` table carrying an `org_id`, in a stable order.
 *
 * Sorted by name rather than by any dependency order, because `01-F68` forbids a foreign key
 * anywhere in this schema *ever* — so there is no ordering constraint to honour and a
 * dependency-shaped order would imply one that does not exist.
 */
export const orgTables = async (sql: Sql): Promise<readonly string[]> =>
  (
    await sql<{ table_name: string }[]>`
      select table_name from information_schema.columns
      where table_schema = 'kernel' and column_name = 'org_id'
      order by table_name`
  ).map((row) => row.table_name);

/**
 * Every org this deployment holds, as the UNION over every org-keyed table.
 *
 * **Not `kernel.org_sequences`, which is what `everyOrg` in `index.ts` reads for the Auditor**, and
 * the difference is a restaurant. That table is written by the merge gateway *the first time an
 * org's ledger receives anything*, so a tenant that has signed up (`28-F12`) and not yet rung a
 * sale has no row in it — the newest restaurant on the deployment, whose owner is still typing her
 * menu in, backed up by nothing. `22 §1` makes nothing in doc 22 size-dependent.
 *
 * **Nor `kernel.orgs` alone**, which fails in the opposite direction and is the state of this
 * deployment today: `01-F68` records that *"events already exist under org ids that no row here
 * names"* and calls such an org **UNNAMED, not invalid**. Discovering from the directory would skip
 * exactly those ledgers.
 *
 * So it is the union, and the cost is stated rather than hidden: this walks `kernel.events` with a
 * `distinct`, which `index.ts` avoids for the Auditor on the ground that it is *"cheaper"* to read
 * the counter table. That argument does not carry here — a backup pass is about to read **every
 * row** of that table for every org anyway, so one extra scan is strictly cheaper than the dump it
 * precedes, and the alternative is a tenant nobody backs up.
 */
export const everyTenant = async (sql: Sql): Promise<readonly string[]> => {
  const found = new Set<string>();
  for (const table of await orgTables(sql)) {
    const rows = (await sql.unsafe(
      `select distinct org_id from kernel.${table} where org_id is not null`,
    )) as unknown as { org_id: string }[];
    for (const row of rows) found.add(String(row.org_id));
  }
  return [...found].sort();
};

/** The row lines of one tenant's artifact, in table order, plus the count and digest they hash to. */
type Body = { readonly lines: readonly string[]; readonly rows: number; readonly digest: string };

const bodyOf = async (sql: Sql, org_id: string, tables: readonly string[]): Promise<Body> => {
  const hash = createHash("sha256");
  const lines: string[] = [];
  for (const table of tables) {
    /**
     * **`where org_id = $1` is `01-F71` (f) (i), and it is the whole isolation story of the
     * artifact.** There is no second gate: nothing downstream re-checks what a dump wrote, so a
     * missing predicate here is one file holding every restaurant's ledger, restoring perfectly.
     *
     * `order by` is omitted deliberately — `01-F34` forbids a projected value depending on
     * ordering metadata, and a backup projects nothing; the restore is order-independent because
     * `01-F68` forbids the foreign keys that would make it otherwise. Row ORDER inside the
     * artifact is therefore not a fact the format carries and no reader may read one out of it.
     */
    const rows = (await sql.unsafe(`select * from kernel.${table} where org_id = $1`, [
      org_id,
    ])) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      const line = JSON.stringify({ t: table, r: row });
      hash.update(line);
      hash.update("\n");
      lines.push(line);
    }
  }
  return { lines, rows: lines.length, digest: hash.digest("hex") };
};

/**
 * Serialise one tenant. **A READ and nothing else** — `01-F1` reaches every row of the kernel, and
 * a "last backed up at" column booked into it would be a write laundered through the one job that
 * has no business writing (the Auditor's host records the same rule two files over).
 */
export const tenantArtifact = async (
  sql: Sql,
  org_id: string,
  taken_at: number,
): Promise<string> => {
  const tables = await orgTables(sql);
  const body = await bodyOf(sql, org_id, tables);
  const header: ArtifactHeader = {
    kind: HEADER_KIND,
    format: ARTIFACT_FORMAT,
    org_id,
    taken_at,
    tables,
  };
  const footer = { kind: FOOTER_KIND, rows: body.rows, digest: body.digest };
  return `${[JSON.stringify(header), ...body.lines, JSON.stringify(footer)].join("\n")}\n`;
};

/** A refusal an operator can act on, distinct from a Postgres fault. */
export class ArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactError";
  }
}

type Parsed = {
  readonly header: ArtifactHeader;
  readonly rows: readonly { readonly t: string; readonly r: Record<string, unknown> }[];
};

/**
 * Read an artifact and refuse anything about it that is not exactly right, **before a single row
 * is written**.
 *
 * ⚠ **Verification is separated from application on purpose, and the acceptance calls it §D6.** A
 * streaming restore that inserts what it can parse and then dies leaves a restaurant in a state
 * nobody can name — neither the lost state nor the backed-up one — and no assertion anywhere can
 * catch it, because the tenant looks populated. So the file is parsed whole, then applied whole,
 * inside one transaction. Both belts: a corrupt tail is caught here, and any fault during
 * application rolls back.
 */
export const parseArtifact = (text: string): Parsed => {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    throw new ArtifactError(
      "the artifact has no header and footer. A per-tenant backup is a header line, its rows, " +
        "and a footer carrying the row count and digest (22-F21: a backup artifact that cannot " +
        "be restored is worse than a missing one).",
    );
  }
  const readJson = (line: string, what: string): Record<string, unknown> => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new ArtifactError(`the artifact's ${what} is not JSON: ${String(error)}`);
    }
  };

  const header = readJson(lines[0] as string, "header line") as unknown as ArtifactHeader;
  if (header.kind !== HEADER_KIND) {
    throw new ArtifactError(
      `not a RestOS tenant backup: the first line says kind=${String(header.kind)}, expected ` +
        `${HEADER_KIND}.`,
    );
  }
  if (header.format !== ARTIFACT_FORMAT) {
    throw new ArtifactError(
      `artifact format ${String(header.format)} — this build reads format ` +
        `${String(ARTIFACT_FORMAT)} only. Refusing rather than guessing at a shape it may not share.`,
    );
  }
  if (typeof header.org_id !== "string" || header.org_id === "") {
    throw new ArtifactError("the artifact names no org_id, so there is no tenant to restore.");
  }

  const footer = readJson(lines[lines.length - 1] as string, "last line");
  if (footer.kind !== FOOTER_KIND) {
    throw new ArtifactError(
      "the artifact has no footer — it was TRUNCATED, or the writer died mid-pass. Refusing to " +
        "restore a prefix of a backup: a half-restored tenant is neither the lost state nor the " +
        "backed-up one (22-F21).",
    );
  }

  const rowLines = lines.slice(1, -1);
  if (Number(footer.rows) !== rowLines.length) {
    throw new ArtifactError(
      `the artifact declares ${String(footer.rows)} rows and carries ${String(rowLines.length)}.`,
    );
  }
  const hash = createHash("sha256");
  for (const line of rowLines) {
    hash.update(line);
    hash.update("\n");
  }
  const digest = hash.digest("hex");
  if (digest !== footer.digest) {
    throw new ArtifactError(
      `the artifact's rows do not match its digest (declared ${String(footer.digest)}, computed ` +
        `${digest}) — the file has been altered or damaged since it was written.`,
    );
  }

  const rows = rowLines.map((line, index) => {
    const parsed = readJson(line, `row ${String(index + 1)}`);
    const table = parsed.t;
    const row = parsed.r;
    if (typeof table !== "string" || !(header.tables as readonly string[]).includes(table)) {
      throw new ArtifactError(
        `row ${String(index + 1)} names table ${String(table)}, which the artifact's header does ` +
          "not list.",
      );
    }
    if (typeof row !== "object" || row === null) {
      throw new ArtifactError(`row ${String(index + 1)} carries no row object.`);
    }
    /**
     * **`01-F71` (f) (ii) — a restore REFUSES a foreign row rather than filtering it out.** An
     * artifact that disagrees with its own header is evidence of a fault upstream of here, and
     * quietly writing the subset would restore a tenant while destroying the only signal that
     * something produced a mixed dump. `(e)`'s rule for a mis-routed artifact is the same one:
     * refuse, never clamp.
     */
    const owner = (row as Record<string, unknown>).org_id;
    if (owner !== header.org_id) {
      throw new ArtifactError(
        `row ${String(index + 1)} of table ${table} belongs to org ${String(owner)}, but this ` +
          `artifact is for ${header.org_id}. REFUSED whole (01-F71 (f)): a backup carrying two ` +
          "tenants is a cross-tenant disclosure, and restoring the subset would hide the fault " +
          "that produced it.",
      );
    }
    return { t: table, r: row as Record<string, unknown> };
  });

  return { header, rows };
};

/**
 * Apply a parsed artifact. **Additive only, idempotent, one transaction.**
 *
 * - **No `delete`, no `truncate`, nowhere.** `01-F1` has no delete path in any API, and the
 *   tempting "clean restore" — clear the org, then insert — destroys every event appended since
 *   the backup was taken. `22-F7`'s tail heal assumes the opposite: devices re-push above the
 *   reverted high-water mark and event-id idempotency (`01-F8`) dedupes. A restore RECONSTRUCTS
 *   what was lost; it never removes what is there.
 * - **`on conflict do nothing` with NO conflict target**, which covers every unique constraint and
 *   every unique index on the table rather than the primary key alone. That matters here:
 *   `kernel.events` carries `events_org_global_seq_uq` and `events_org_device_lamport_uq` beside
 *   its id, and `kernel.users` carries `users_email_lower_uq`, which is an INDEX and not a
 *   constraint. A hand-listed target would cover the first and miss the last — and the miss is a
 *   thrown restore rather than a silent one, but at 3am that distinction is not worth having.
 * - **Rows are written verbatim, column for column.** `01-F1` forbids re-authoring history, and
 *   `01-F5`'s hash chain is computed over exactly the envelope bytes stored — so nothing here
 *   re-serialises an envelope, re-stamps `server_received_at` or re-mints an id.
 */
export const applyArtifact = async (sql: Sql, parsed: Parsed): Promise<number> => {
  let written = 0;
  await sql.begin(async (tx) => {
    for (const { t, r } of parsed.rows) {
      const columns = Object.keys(r);
      if (columns.length === 0) continue;
      const placeholders = columns.map((_, index) => `$${String(index + 1)}`).join(", ");
      const quoted = columns.map((column) => `"${column}"`).join(", ");
      const values = columns.map((column) => {
        const value = r[column];
        /**
         * ⚠ **`sql.json(…)`, never `JSON.stringify(…)` — MEASURED, and it is `helpers.ts`'s trap
         * from the other side.** `jsonb` columns (`events.envelope`, `org_events.payload`,
         * `catalog_entries.prices`, `users.assignments`) come back from `select *` as parsed
         * objects. Handing the driver the SERIALISED text lands a jsonb **string scalar** in the
         * column — the whole envelope as one quoted string — so the row restores, the snapshot
         * differs by escaping alone, and every restored event reads back unparseable. Measured on
         * this module's first run: **4 of 27** assertions red, three of them `§D`'s, all with
         * `\"id\":` in the received value. `helpers.ts` records the identical defect in the
         * fixture that seeds these rows (`${JSON.stringify(event)}::jsonb`), which is the second
         * time one keystroke has produced it — hence the marker rather than a quiet fix.
         *
         * Column ORDER is `Object.keys` on the row the artifact carries, so the parameter list
         * cannot drift from the column list: they are built from the same array.
         */
        return value !== null && typeof value === "object" ? sql.json(value as never) : value;
      });
      const result = await tx.unsafe(
        `insert into kernel.${t} (${quoted}) values (${placeholders}) on conflict do nothing`,
        values as never[],
      );
      written += result.count ?? 0;
    }
    /**
     * `kernel.org_events.seq` is a `bigserial` and the artifact restores it EXPLICITLY, because
     * the row a reader gets back must be the row that was backed up. Inserting an explicit value
     * does not advance the underlying sequence, so the next org-scoped append would collide with a
     * restored row — on a table `01-F62` makes append-only, in another tenant's request. This
     * re-points the sequence at the greatest value the table now holds.
     *
     * It is deliberately `greatest(...)` over the WHOLE table rather than this org's rows: the
     * sequence is one shared object and lowering it for a neighbour would be the cross-tenant
     * write `01-F71` (f) forbids. It is not tenant data and appears in no `orgSnapshot`.
     */
    if (parsed.rows.some((row) => row.t === "org_events")) {
      await tx.unsafe(
        `select setval(pg_get_serial_sequence('kernel.org_events', 'seq'),
                       greatest(coalesce((select max(seq) from kernel.org_events), 1), 1))`,
      );
    }
  });
  return written;
};
