/**
 * **One nightly backup pass: every tenant on this deployment, one artifact each** (R38, `22-F22`).
 *
 * The format and the isolation rule live in `tenant-artifact.ts`; this file is the pass — discovery,
 * the file write, and the two records an operator reads. It is deliberately separate from the
 * scheduler in `index.ts` so that "what a pass does" is testable and readable without a Redis.
 *
 * ── ONE INTERPRETATION, AND THE SIMPLER ALTERNATIVE NAMED (`24 §3b`) ─────────────────────────
 *
 * *"Nightly per-tenant backup"* reads two ways, exactly as `20 §4.2`'s *"a nightly cloud job per
 * org"* did: one scheduled job per org, or one scheduled pass that backs up every org and reports
 * **per org**. This takes the second, for the reason `index.ts` already recorded for the Auditor —
 * it is the smaller mechanism, and N concurrent whole-tenant dumps against one Postgres is a load
 * hazard a sequential pass does not have. The unit R38 constrains, the per-tenant ARTIFACT, is
 * identical either way.
 */

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type postgres from "postgres";
import { everyTenant, orgTables, tenantArtifact } from "./tenant-artifact.js";

type Sql = ReturnType<typeof postgres>;

/** What one pass reports, per org. `index.ts` turns each into an `18 §5` record. */
export type BackupOutcome =
  | { readonly ok: true; readonly org_id: string; readonly artifact: string }
  | { readonly ok: false; readonly org_id: string | null; readonly error: string };

/**
 * An org id is arbitrary text on the wire (`schema.ts`: *"ids are text, not uuid — the storage
 * layer must not tighten the wire contract"*), so it is not a filename. Anything outside a narrow
 * set becomes `_`, and the full id is inside the artifact's header, which is what `§B4` reads.
 */
const safeName = (org_id: string): string => org_id.replace(/[^A-Za-z0-9._-]/g, "_");

/**
 * **A run that cannot produce a restorable artifact produces NO artifact** (`22-F21`, whose rule is
 * the general one). The bytes go to a `.part` file and are renamed into place only once the whole
 * artifact — header, every row, footer and digest — has been written; a failure unlinks it.
 *
 * `rename` within one directory is atomic on every filesystem this runs on, so a reader can never
 * observe a half-written `.jsonl`, and the record naming the path is emitted only after the rename
 * returns. The alternative — build the whole artifact in memory and write once — is simpler and is
 * rejected because a tenant's ledger is unbounded and this process also hosts the Auditor.
 */
const writeArtifact = async (path: string, text: string): Promise<void> => {
  const partial = `${path}.part`;
  try {
    await writeFile(partial, text, "utf8");
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
};

/**
 * `24-F14`'s empty-match protection, applied to a backup rather than to a rail — and it is the one
 * check in this file that a reviewer should look hardest at.
 *
 * A database with **no `kernel` schema** answers `information_schema.columns` with zero rows and no
 * error. Without this refusal a backup pass pointed at the wrong database would find nothing to
 * back up, write nothing, report **success**, and go on reporting it every night: the silent
 * failure that `22-F21` says is worse than a missing file, because it retires the alarm. An empty
 * scan is a REFUSAL here, never an empty deployment.
 */
const requireSchema = async (sql: Sql): Promise<readonly string[]> => {
  const tables = await orgTables(sql);
  if (tables.length === 0) {
    throw new Error(
      "no table in the `kernel` schema carries an org_id — this database holds no RestOS kernel " +
        "schema at all, so there is nothing to back up and this is a misconfiguration rather " +
        "than an empty deployment. Refusing loudly: a pass that reports success over the wrong " +
        "database retires the alarm it exists to raise (22-F21).",
    );
  }
  return tables;
};

const describe = (error: unknown): string => {
  const flat = (text: string): string => text.replace(/\s+/g, " ").trim();
  const top = flat(error instanceof Error ? error.message : String(error));
  const cause =
    error instanceof Error && error.cause instanceof Error ? flat(error.cause.message) : "";
  return cause === "" ? top : `${top} ← ${cause}`;
};

/**
 * Back up every tenant this database holds.
 *
 * **One failing tenant does not stop the others.** A pass that abandoned the remaining orgs on the
 * first fault would let one damaged restaurant cost every other restaurant its nightly backup —
 * and the caller still learns the pass failed, because the outcomes carry it. Discovery failing is
 * different in kind: there is no per-org work to attempt, so it reports once with `org_id: null`.
 */
export const runBackupPass = async (
  sql: Sql,
  dir: string,
  now: number,
): Promise<readonly BackupOutcome[]> => {
  let tenants: readonly string[];
  try {
    await requireSchema(sql);
    await mkdir(dir, { recursive: true });
    tenants = await everyTenant(sql);
  } catch (error) {
    return [{ ok: false, org_id: null, error: describe(error) }];
  }

  const outcomes: BackupOutcome[] = [];
  for (const org_id of tenants) {
    try {
      const text = await tenantArtifact(sql, org_id, now);
      const artifact = resolve(dir, `${safeName(org_id)}-${String(now)}.jsonl`);
      await writeArtifact(artifact, text);
      outcomes.push({ ok: true, org_id, artifact });
    } catch (error) {
      outcomes.push({ ok: false, org_id, error: describe(error) });
    }
  }
  return outcomes;
};
