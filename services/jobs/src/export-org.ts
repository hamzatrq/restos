/**
 * **`22-F16`'s BUNDLE — `pnpm -C services/jobs export-org --org <org_id> --out <dir>`.**
 *
 * `22-F16`: *"**Owner-triggered** full export from back office (doc 14): the org's complete event
 * log as JSONL (canonical envelopes), every read model as CSV, and a media manifest with signed
 * URLs — generated async by a job, delivered as a bundle, recorded as `governance.export_generated`
 * (audited; owner-role only). **No proprietary formats anywhere in the bundle.**"*
 *
 * `22 §2` puts export GENERATION in `services/jobs`, which is this file. The two halves of the FR
 * live on different planes and that split is deliberate: **who may ask** is `services/api`'s
 * (`22-F23`'s `export.request`, owner-only, asserted by `owner-export.test.ts`), and **what is in
 * the bundle** is this command's.
 *
 * ── WHAT THE BUNDLE HOLDS TODAY, AND THE TWO LEGS THAT ARE MISSING ───────────────────────────
 *
 * `manifest.json` and `events.jsonl`. The event log is `22-F16`'s first leg, verbatim, and it is
 * the leg that is buildable:
 *
 *   - **JSONL of CANONICAL ENVELOPES**, one per line, each one a value `packages/domain`'s
 *     `parseEvent` admits — not this product's own row shape, which is the proprietary format the
 *     FR forbids by name. The bytes come out of `kernel.events.envelope` **verbatim** (`01-F1`: a
 *     relay never re-authors) with `server_received_at` merged from its column, which is the same
 *     merge the gateway performs at serve time (`schema.ts`: *"the two cloud-stamped values live in
 *     their own columns and are merged into the envelope at serve time"*). Merging it does not
 *     disturb `01-F5`'s hash chain, which is computed over the envelope with that field DELETED.
 *
 * ⚠ **The other two legs are ABSENT and the manifest says so rather than leaving a reader to
 * assume completeness** (`00 §5.7`: a surface reports what is true).
 *   - **Every read model as CSV** — there is no cloud per-module read model to serialise. That is
 *     the same measured gap that leaves `runAuditor`'s `read_model` argument unsupplied: `01-F7`'s
 *     row shapes are projected DEVICE-side by `@restos/sync-client`, and the cloud projects only
 *     the catalog. Emitting a CSV would mean inventing the projection.
 *   - **A media manifest with signed URLs** — there is no object storage in this deployment
 *     (`22-F3`; R42: current server, no infrastructure project), so there is no medium to sign a
 *     URL against.
 *
 * ⚠ **And it is UNAUDITED.** `22-F16` says *"recorded as `governance.export_generated`"*; `22-F23`
 * records why no code here can write one — no `governance.*` payload schema exists, so `01-F4`
 * refuses the emit. **So an owner can pull a copy of her entire ledger and the ledger records
 * nothing about it.** The actor is captured on the request record (`services/api`) and nowhere
 * else, exactly as a device revocation was before `14-F13`.
 *
 * ── ISOLATION ────────────────────────────────────────────────────────────────────────────────
 *
 * `01-F71` (f) (i): the query is `where org_id = $1` and there is no second gate behind it. A
 * bundle is a FILE handed to a restaurant, so a missing predicate is not a row on the wrong screen
 * — it is another restaurant's complete ledger, on disk, with no session left to revoke.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import postgres from "postgres";

/** `strict`, so an unimplemented flag is refused by name rather than ignored (`revoke-device.ts`). */
const parseExportArgs = (argv: readonly string[]): { org: string; out: string } => {
  const { values } = parseArgs({
    args: [...argv],
    strict: true,
    options: { org: { type: "string" }, out: { type: "string" } },
  });
  const org = values.org;
  const out = values.out;
  if (org === undefined || org === "" || out === undefined || out === "") {
    throw new Error(
      "usage: pnpm -C services/jobs export-org --org <org_id> --out <dir>\n" +
        "  Writes 22-F16's bundle for ONE org into <dir>. The source database is DATABASE_URL.\n" +
        "  The export is a READ: it changes nothing (01-F1).",
    );
  }
  return { org, out };
};

const main = async (): Promise<void> => {
  const { org, out } = parseExportArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is required — it names the database this export reads FROM.");
  }

  const sql = postgres(url, { max: 2 });
  try {
    /**
     * ⚠ **`order by id`, not by `global_seq` — and this is `01-F34`, not a preference.** The
     * ordering law forbids a projected value from reading ordering metadata, and the id order is
     * the one the acceptance compares against (`§G4` sorts both sides). What matters to an owner
     * is COMPLETENESS, which is what `§G4` asserts; a bundle is not a stream and nothing folds it
     * in file order, so the file states no order anyone may read one out of.
     */
    const rows = (await sql`
      select id, server_received_at, envelope from kernel.events
      where org_id = ${org}
      order by id`) as unknown as {
      id: string;
      server_received_at: number;
      envelope: Record<string, unknown>;
    }[];
    /**
     * ⚠ **`server_received_at` is a `bigint` column and postgres-js hands it back as a STRING.**
     * `EventEnvelope` declares it `z.number().int().nullable()`, so merging the raw value produces
     * a line `parseEvent` refuses — which is `22-F16`'s *"canonical envelopes"* failing on a type
     * nobody looks at. Measured on this module's first run: `§G3` red with
     * `expected number, received string` on exactly this field, while every other assertion about
     * the bundle passed. The coercion is here, once, rather than at the merge below, so there is
     * one place to look when the next bigint column joins the select.
     */
    const stampOf = (raw: number | string | null): number | null =>
      raw === null ? null : Number(raw);

    const bundle = resolve(out, `export-${org.replace(/[^A-Za-z0-9._-]/g, "_")}`);
    await mkdir(bundle, { recursive: true });
    const events = resolve(bundle, "events.jsonl");
    const manifest = resolve(bundle, "manifest.json");

    const lines = rows.map((row) =>
      // The stored envelope, with the cloud stamp merged the way the gateway merges it at serve
      // time. Nothing else is reshaped: `01-F1` forbids re-authoring, and a re-serialised envelope
      // is a rewritten one.
      JSON.stringify({ ...row.envelope, server_received_at: stampOf(row.server_received_at) }),
    );
    await writeFile(events, lines.length === 0 ? "" : `${lines.join("\n")}\n`, "utf8");
    await writeFile(
      manifest,
      `${JSON.stringify(
        {
          kind: "restos.org-export",
          format: 1,
          org_id: org,
          generated_at: Date.now(),
          contents: [
            { leg: "event_log", file: "events.jsonl", format: "jsonl", events: rows.length },
          ],
          /**
           * `00 §5.7` — the bundle states what it does NOT contain, because an owner who is handed
           * an incomplete export with no note reads it as a complete one. Each absence names the
           * reason, so a later bundle that gains a leg is a visible diff here.
           */
          absent: [
            {
              leg: "read_models_csv",
              reason:
                "22-F16 asks for every read model as CSV. There is no cloud per-module read " +
                "model in this deployment — 01-F7's row shapes are projected device-side by " +
                "@restos/sync-client and the cloud projects only the catalog — so emitting one " +
                "would mean inventing the projection.",
            },
            {
              leg: "media_manifest",
              reason:
                "22-F16 asks for a media manifest with signed URLs. This deployment has no " +
                "object storage (22-F3; R42: current server, no infrastructure project), so " +
                "there is nothing to sign a URL against.",
            },
            {
              leg: "governance.export_generated",
              reason:
                "22-F16 requires the export to be audited. packages/domain declares no " +
                "governance.* payload schema, so 01-F4 refuses the emit and 01-F62's org-scoped " +
                "set does not carry one (22-F23). This export is UNRECORDED in the ledger.",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    /**
     * `18 §5` pino-shaped JSON on stdout under the same top-level `jobs` key the worker uses, so
     * one log pipeline reads both and the acceptance suite can parse a one-shot command's output
     * the same way it parses the worker's. `bundle` is the DIRECTORY; `events` is the file
     * `22-F16`'s first leg names.
     */
    console.log(
      JSON.stringify({
        level: 30,
        time: Date.now(),
        jobs: {
          kind: "export_result",
          org_id: org,
          bundle,
          events,
          event_count: rows.length,
        },
        msg: `export: ${org} → ${bundle} (${String(rows.length)} events; 22-F16)`,
      }),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
