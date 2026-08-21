/**
 * **THE RESTORE — `pnpm -C services/jobs restore --file <artifact>` (R38, August 2026).**
 *
 * R38: *"⚠ **A restore nobody has performed is a backup nobody has**; the acceptance is a restore,
 * not a dump."* This command is what makes that performable, and it is the reason the backup half
 * of R38 is not finished by writing a file.
 *
 * **Why a DECLARED command and not a paragraph in a runbook** (`24 §3b` — the alternative, named
 * rather than silently passed over). `services/sync-gateway`'s `migrate`, `provision-device`,
 * `revoke-device` and the four tenancy commands each landed on the same argument and it is stronger
 * here than in any of them: 3am after a data-loss incident is the worst possible moment to be
 * composing `INSERT`s by hand out of a JSON file, and `22-F8`'s quarterly drill is a thing an
 * operator has to actually DO — a restore only its author can perform is one nobody rehearses. The
 * command **grants no authority its inputs did not already carry**: it needs `DATABASE_URL` and a
 * readable artifact, and anyone holding both could already write these rows.
 *
 * **It is IDEMPOTENT and ADDITIVE, and both properties are `01-F1`.** Running it twice is running
 * it once (`18 §5`: every job idempotent); it never deletes, so an event appended after the backup
 * was taken survives the restore of that backup. `22-F7`'s tail heal depends on exactly that:
 * devices re-push above the reverted high-water mark and event-id idempotency (`01-F8`) dedupes.
 * The tempting "clean restore" — clear the org, then insert — would destroy the very events the
 * tail heal is built to recover, and `01-F1` has no delete path in any API to make it legal.
 *
 * ⚠ **What it does NOT do, stated rather than implied.**
 *   - **It emits no event and records no drill.** `22-F9` wants `governance.restore_drill_recorded`;
 *     `22-F23` records why nothing here can write one — `packages/domain` declares no `governance.*`
 *     payload schema, so `01-F4` refuses the emit, `01-F62`'s org-scoped set does not include it,
 *     and a branch-scoped envelope needs a device to stamp it. A shell on a service host also has
 *     no authenticated user, so the only actor it could write is `null`, permanently, into an
 *     append-only store — `14-F30`'s ratified reasoning, unchanged.
 *   - **It does not prove the restore.** `22-F8` is explicit: *"a restore is not proven until the
 *     refold is clean"*. Point `services/jobs` at the restored database and read the
 *     `auditor_result` records; this command's exit code says the rows landed, not that they fold.
 *   - **It is not a PITR.** `22-F1`'s point-in-time recovery needs `22-F2`'s continuous WAL, which
 *     this deployment does not have (`22-F22`). What this restores is the state at the instant the
 *     artifact was taken, and nothing between.
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { ArtifactError, applyArtifact, parseArtifact } from "./tenant-artifact.js";

/**
 * `strict`, so a flag this command does not implement is refused **by name** rather than ignored.
 * `revoke-device.ts` records the reason: an operator who types `--dry-run` and sees exit 0 has been
 * told the opposite of the truth, and this command writes to a production database.
 */
const parseRestoreArgs = (argv: readonly string[]): { file: string } => {
  const { values } = parseArgs({
    args: [...argv],
    strict: true,
    options: { file: { type: "string" } },
  });
  const file = values.file;
  if (file === undefined || file === "") {
    throw new Error(
      "usage: pnpm -C services/jobs restore --file <artifact>\n" +
        "  <artifact> is one file produced by a backup pass (one file per tenant per pass).\n" +
        "  The target database is DATABASE_URL. The restore is additive and idempotent: it " +
        "inserts what the artifact holds and never deletes anything (01-F1).",
    );
  }
  return { file };
};

const main = async (): Promise<void> => {
  const { file } = parseRestoreArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is required — it names the database this restore writes INTO.");
  }

  /**
   * **Parsed WHOLE before a single row is written**, and the refusal is loud. `tenant-artifact.ts`
   * carries the reasoning: a streaming restore that inserts what it can parse and then dies leaves
   * a tenant in a state nobody can name — neither the lost state nor the backed-up one — and no
   * assertion can catch it, because the tenant looks populated.
   */
  const parsed = parseArtifact(await readFile(file, "utf8"));

  const sql = postgres(url, { max: 2 });
  try {
    const written = await applyArtifact(sql, parsed);
    // stdout, like `migrate.ts` and `revoke-device.ts`: this command produces no credential, so
    // there is nothing to keep off it (`provision-device.ts` is the one that has to).
    console.log(
      `restored org ${parsed.header.org_id} from ${file}\n` +
        `  artifact taken at ${new Date(parsed.header.taken_at).toISOString()} ` +
        `(${String(parsed.rows.length)} rows across ${String(parsed.header.tables.length)} tables)\n` +
        `  ${String(written)} row(s) written, ${String(parsed.rows.length - written)} already ` +
        "present — this command is idempotent and never deletes (01-F1/18 §5).\n" +
        "  22-F8: a restore is NOT proven until an Auditor refold over the restored data is clean.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // An artifact refusal is an operator's problem and reads as one sentence; anything else keeps
    // its stack, because it is ours. Either way the exit code is non-zero: `22-F21`'s rule is that
    // a backup which cannot be restored must fail LOUDLY, and a restore that half-worked and
    // reported success is the same defect one step later.
    console.error(error instanceof ArtifactError ? `restore REFUSED: ${error.message}` : error);
    process.exit(1);
  });
}
