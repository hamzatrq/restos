/**
 * **THE SEAM BETWEEN THE MIGRATIONS AND A RUNNABLE DEPLOY STEP.**
 *
 * `applyMigrations` was correct, was exercised by every suite run, and carried
 * `@unreached-by-design` naming its callers as the test harness "and whatever runs the deploy".
 * **Nothing ran the deploy.** There was no migrate script anywhere in this repo, so the only way to
 * migrate a database was a `tsx -e` one-liner a human copied out of a runbook — and a gateway
 * pointed at an unmigrated database boots perfectly and answers `500` on the first request that
 * needs a table, because `postgres-js` opens lazily. That is AGENTS.md's recurring defect in the
 * shape the seams rail cannot see: the export is not dead, it simply has no way to be invoked.
 *
 * So this file, like `startable.test.ts` beside it, reads nothing's mind. It runs the **declared
 * script** from `package.json`, in a **separate process**, against a **real Postgres**, and asks
 * what only that can answer:
 *
 *   1. Does the command in `package.json` take an EMPTY database to the full twenty-one-table
 *      schema?
 *   2. Is it idempotent — is a second run a no-op rather than a failure or a duplicate apply?
 *   3. Does it RESUME a torn schema, or does it wedge?
 *   4. Does the running server REPORT an unmigrated database, rather than booting healthy and
 *      failing later and elsewhere?
 *
 * **Executing the DECLARED string is the point** (`startable.test.ts`'s M1). A test that hardcodes
 * `tsx src/migrate.ts` keeps passing after someone deletes the script, and "the script does not
 * exist" is the exact state this service was already in for `start`.
 *
 * **Assertion 4 is two-sided on purpose** (round-3 law). It asserts the migrated database is
 * reported as migrated AND the empty one as not — a line that always said "NOT MIGRATED", or one
 * that always said "up to date", passes either half alone.
 *
 * ⚠ **This file uses the suite's Testcontainers Postgres but not its DATABASE.** `global-setup.ts`
 * migrates `kernel_test` before any file runs, so that database can never answer "what happens on
 * an empty one". Every case below creates its own database on the same container instead — real
 * Postgres, real `CREATE SCHEMA`, and no interference with any other file (isolation elsewhere in
 * this package is by fresh `org_id`, which a `DROP`/`CREATE DATABASE` would break).
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATE_PREFIX } from "../migrate.js";
import { LISTENING_PREFIX, SCHEMA_PREFIX } from "../server.js";
import { DATABASE_URL_ENV } from "./global-setup.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** ≥32 bytes, which the boot validator enforces (`18 §5`). A fixture; read by nothing else. */
const DEVICE_SECRET = "a-device-token-secret-of-at-least-32-bytes-for-the-migratable-suite";

/**
 * The twenty-one tables the shipped migrations create. Written out rather than derived from
 * `schema.ts`: a list derived from the same source the migrations were generated from would agree
 * with itself no matter what the migrations actually did.
 *
 * ⚠ **THIS LIST IS THE CENSUS AND `plans/wave-1/running-the-stack.md` §2 QUOTES IT — the citation
 * used to run the other way.** This comment named §2 as the source of a number §2 had itself copied
 * off the migrations, so a runbook that had been stale twice was standing in as the authority for
 * an assertion (`L2`: a derived document is not the source). §2 now says where it is measured from
 * and points here.
 *
 * `branches` and `orgs` joined at `0010` (01-F68/01-F69 — the tenancy directory), `users` at
 * `0011` (11-F20/15-F26 — the person, and the org's first owner), `staff_entries` /
 * `staff_versions` / `user_credentials` at `0012` (01-F75/01-F76 — the roster's publication log per
 * artifact key; 11-F23 — the device-plane PIN credential in its own table),
 * `inventory_entries` / `inventory_versions` at `0013` (01-F21/10-F18 — the inventory reference
 * set's publication log, the source `services/api`'s variance report reads),
 * `device_pairings` / `org_pki` at `0014` (01-F80 — a pending pairing an owner minted and
 * nobody has claimed; 01-F73 (b) + 01-F81 (c) — an org's issuer and its separate
 * roster-signing keypair), and `config_entries` / `config_versions` at `0015` (01-F87 — `00 §7`'s
 * layer-2 configuration as the FOURTH `01-F75` reference-data resource, org-scoped). This list is a
 * FACT about the shipped migrations, so it moves with them; the assertions using it are unchanged
 * and are still exact equality, which is why adding a table cannot pass here unnoticed.
 * ⚠ *It read "fifteen" and held fifteen entries until `0012`; the WORD and the LIST move in one
 * edit, because a count in prose beside a `grep`-able fact is the staleness this file's own §T1
 * note is about. It has since moved three times — `0013`, `0014` and `0015` each arrived on their
 * own branch, and `0015` was renumbered from `0013` at the merge that brought them together.*
 */
const EXPECTED_TABLES = [
  "branches",
  "catalog_entries",
  "catalog_versions",
  "config_entries",
  "config_versions",
  "device_pairings",
  "device_registry",
  "device_watermarks",
  "events",
  "inventory_entries",
  "inventory_versions",
  "org_events",
  "org_pki",
  "org_sequences",
  "orgs",
  "quarantine",
  "quarantine_notices",
  "staff_entries",
  "staff_versions",
  "user_credentials",
  "users",
];

type Scripts = Record<string, string | undefined>;

const readScripts = async (): Promise<Scripts> => {
  const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts?: Scripts }).scripts ?? {};
};

/** The container's admin connection — used only to create and inspect the per-case databases. */
let admin: postgres.Sql;
let adminUrl: string;
let scripts: Scripts;

/** A fresh, EMPTY database on the suite's container. Returns its URL. */
let created = 0;
const freshDatabase = async (): Promise<string> => {
  created += 1;
  const name = `migrate_seam_${String(process.pid)}_${String(created)}`;
  await admin.unsafe(`drop database if exists ${name}`);
  await admin.unsafe(`create database ${name}`);
  return adminUrl.replace(/\/[^/]+$/, `/${name}`);
};

type Ran = { readonly code: number | null; readonly out: string; readonly err: string };

/**
 * Runs a DECLARED script exactly as a package manager would — the command string through a shell,
 * from the package root, with the package's own `node_modules/.bin` on `PATH`.
 */
const runDeclared = async (script: string, env: Record<string, string>): Promise<Ran> =>
  new Promise((done, fail) => {
    const child = spawn(script, {
      shell: true,
      cwd: PKG_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        ...env,
      },
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      err += chunk;
    });
    child.on("error", (cause: Error) =>
      fail(new Error(`\`${script}\` could not be spawned: ${cause.message}`)),
    );
    child.on("close", (code) => done({ code, out, err }));
  });

/** The `kernel` tables that actually exist, sorted — asked of the database, never of our code. */
const kernelTables = async (databaseUrl: string): Promise<string[]> => {
  const sql = postgres(databaseUrl);
  try {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'kernel' order by table_name`;
    return rows.map((row) => row.table_name);
  } finally {
    await sql.end({ timeout: 5 });
  }
};

const appliedCount = async (databaseUrl: string): Promise<number> => {
  const sql = postgres(databaseUrl);
  try {
    const rows = await sql<
      { n: number }[]
    >`select count(*)::int as n from drizzle.__drizzle_migrations`;
    return rows[0]?.n ?? 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
};

/**
 * Boots the DECLARED `start` script against `databaseUrl` and returns the schema line it printed.
 *
 * `PORT=0` so concurrent boots cannot collide. The schema line is asynchronous by design — it is
 * a database round trip fired after `listen`, so the gateway's boot is never blocked on it — which
 * is why this waits for that specific prefix rather than reading stdout once.
 */
const schemaLineFromBoot = async (databaseUrl: string): Promise<string> => {
  const start = scripts.start;
  if (start === undefined) throw new Error("package.json declares no `start` script");
  const child = spawn(start, {
    shell: true,
    cwd: PKG_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      PORT: "0",
      DEVICE_TOKEN_SECRET: DEVICE_SECRET,
      DATABASE_URL: databaseUrl,
    },
  });
  const kill = (): void => {
    if (child.pid === undefined || child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  let out = "";
  let err = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    err += chunk;
  });
  try {
    return await new Promise<string>((done, fail) => {
      const timer = setTimeout(() => {
        fail(
          new Error(`no "${SCHEMA_PREFIX}" line within 30 s.\nstdout:\n${out}\nstderr:\n${err}`),
        );
      }, 30_000);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        out += chunk;
        const line = out.split("\n").find((candidate) => candidate.startsWith(SCHEMA_PREFIX));
        if (line === undefined) return;
        clearTimeout(timer);
        done(line.trim());
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        fail(
          new Error(
            `\`${start}\` exited with ${code} before reporting.\nstdout:\n${out}\nstderr:\n${err}`,
          ),
        );
      });
    });
  } finally {
    kill();
  }
};

describe("services/sync-gateway migrations are runnable as a deploy step (the seam to a deploy)", () => {
  beforeAll(async () => {
    const url = process.env[DATABASE_URL_ENV];
    if (url === undefined)
      throw new Error(`${DATABASE_URL_ENV} is unset — global-setup did not run`);
    adminUrl = url;
    admin = postgres(url);
    scripts = await readScripts();
  }, 60_000);

  afterAll(async () => {
    await admin?.end({ timeout: 5 });
  });

  it("declares a migrate script that points at the migrate entry point", async () => {
    // The weakest assertion in the file, and it is here only to name WHICH script the rest of the
    // file executes — everything below runs the real thing.
    expect(scripts.migrate, "no `migrate` script — the schema cannot be deployed").toBeDefined();
    expect(scripts.migrate).toContain("src/migrate.ts");
  });

  it("takes an EMPTY database to the full schema, through the DECLARED script", async () => {
    const url = await freshDatabase();
    expect(await kernelTables(url), "the fixture database was not empty").toEqual([]);

    const migrate = scripts.migrate;
    if (migrate === undefined) throw new Error("package.json declares no `migrate` script");
    const ran = await runDeclared(migrate, { DATABASE_URL: url });

    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.out).toContain(MIGRATE_PREFIX);
    expect(await kernelTables(url)).toEqual(EXPECTED_TABLES);
    // The password never reaches stdout (`18 §5`) — the DSN this command prints is redacted.
    expect(ran.out).not.toContain("restos@");
  }, 120_000);

  it("is IDEMPOTENT: a second run applies nothing and changes nothing", async () => {
    const url = await freshDatabase();
    const migrate = scripts.migrate;
    if (migrate === undefined) throw new Error("package.json declares no `migrate` script");

    const first = await runDeclared(migrate, { DATABASE_URL: url });
    expect(first.code, first.err).toBe(0);
    const afterFirst = await appliedCount(url);
    expect(afterFirst).toBeGreaterThan(0);

    const second = await runDeclared(migrate, { DATABASE_URL: url });
    expect(second.code, `stdout:\n${second.out}\nstderr:\n${second.err}`).toBe(0);
    // Not merely "it exited 0": the applied set and the schema are both unchanged, so a migrator
    // that re-ran everything (or appended duplicate journal rows) fails here rather than passing
    // for having survived.
    expect(await appliedCount(url)).toBe(afterFirst);
    expect(await kernelTables(url)).toEqual(EXPECTED_TABLES);
    // And it SAYS it did nothing, rather than reporting the same success as a real apply.
    expect(second.out).toContain("nothing to apply");
    expect(first.out).not.toContain("nothing to apply");
  }, 120_000);

  it("RESUMES a torn schema: a rolled-back tail is re-applied, not wedged", async () => {
    const url = await freshDatabase();
    const migrate = scripts.migrate;
    if (migrate === undefined) throw new Error("package.json declares no `migrate` script");
    expect((await runDeclared(migrate, { DATABASE_URL: url })).code).toBe(0);

    // Tear off the last migration exactly as an interrupted deploy would leave it — its journal
    // row gone and its tables gone. (Measured: drizzle 0.45.2 runs every PENDING migration in ONE
    // transaction, so this state cannot arise from a failed run; it is the hand-repaired case, and
    // what matters is that re-running converges rather than erroring.)
    //
    // ⚠ THE TIMESTAMP AND THE TABLES BOTH NAME THE **LAST** MIGRATION AND MOVE WITH IT. drizzle
    // resumes from `max(created_at)`, so tearing off any EARLIER migration re-applies nothing and
    // this test would silently stop exercising resumption while still passing its exit-code
    // assertion. `1785001020000` is `0015_config_plane`'s `when`; it was `1785000960000`
    // (`0014_device_pairing`) until 0015 landed, `1785000900000` (`0013_inventory_reference`)
    // before that, `1785000800000`
    // (`0012_staff_roster`) until 0013 landed, `1785000700000` (`0011_tenancy_users`) before that,
    // `1785000600000` (`0010_tenancy_records`) before that, and `1785000500000` (`0009_org_events`)
    // before that.
    const sql = postgres(url);
    try {
      await sql`delete from drizzle.__drizzle_migrations where created_at = 1785001020000`;
      // `0015` is two CREATE TABLEs and one CREATE INDEX and **NO ALTER and no backfill** —
      // `01-F87`'s artifact is a new pair of tables beside `catalog_entries`/`catalog_versions`
      // and touches nothing that already existed. Dropping a table takes its indexes with it, and
      // the tear-off has to undo ALL of a migration because it ran as one transaction: leaving any
      // object behind would make the re-apply fail on `already exists`, a real property of every
      // migration in this folder, none of which is written `IF NOT EXISTS`. Idempotency here is
      // JOURNAL-level (drizzle's `max(created_at)` watermark), never statement-level.
      //
      // ⚠ **THE PREVIOUS TEAR-OFF HAD ALTERS AND THIS ONE DOES NOT, WHICH IS THE HALF THAT GOES
      // WRONG BY COPYING.** `0014` also added `certificate_pem` and `certificate_fingerprint` to
      // `device_registry` (01-F81 (a)/(f)), so its tear-off had to drop both columns or the
      // re-apply would meet a schema the migration did not expect — and `0012` before it had to
      // put `users.email`'s NOT NULL back. A session that copied either line into this block would
      // be undoing a change `0015` never made. Read the migration, not the last tear-off.
      await sql`drop table kernel.config_entries`;
      await sql`drop table kernel.config_versions`;
    } finally {
      await sql.end({ timeout: 5 });
    }
    expect(await kernelTables(url)).not.toContain("config_entries");
    // The migration BELOW the tear-off is untouched and must stay applied — without this, tearing
    // off the whole tail would look identical to tearing off the last one. `device_pairings` is
    // `0014`'s, i.e. the migration IMMEDIATELY below, which is the sharpest witness available:
    // `staff_entries` (`0012`) and `orgs` (`0010`) would both survive tearing off more than one.
    // ⚠ This named `staff_entries` as "the migration IMMEDIATELY below" while `0013` was config's
    // number; the renumbering to `0015` moved the neighbour and the witness had to move with it.
    expect(await kernelTables(url)).toContain("device_pairings");
    expect(await kernelTables(url)).toContain("staff_entries");
    expect(await kernelTables(url)).toContain("orgs");

    const again = await runDeclared(migrate, { DATABASE_URL: url });
    expect(again.code, `stdout:\n${again.out}\nstderr:\n${again.err}`).toBe(0);
    expect(await kernelTables(url)).toEqual(EXPECTED_TABLES);
  }, 120_000);

  it("the RUNNING server reports an unmigrated database — and reports a migrated one as fine", async () => {
    // Two-sided. The defect this closes is a gateway that boots three healthy lines against an
    // empty database and 500s later in another service's logs; a line that always cried "NOT
    // MIGRATED" would close it just as badly.
    const migrate = scripts.migrate;
    if (migrate === undefined) throw new Error("package.json declares no `migrate` script");

    const empty = await freshDatabase();
    const migrated = await freshDatabase();
    expect((await runDeclared(migrate, { DATABASE_URL: migrated })).code).toBe(0);

    const [emptyLine, migratedLine] = await Promise.all([
      schemaLineFromBoot(empty),
      schemaLineFromBoot(migrated),
    ]);

    expect(emptyLine).toContain("NOT MIGRATED");
    // It names the command that fixes it — the operator is mid-startup and should not have to find
    // the runbook to learn what to run.
    expect(emptyLine).toContain("migrate");
    expect(migratedLine).not.toContain("NOT MIGRATED");
    expect(migratedLine).toContain("up to date");
  }, 180_000);

  it("the boot report does not BLOCK the boot — the server is listening before it lands", async () => {
    // The schema line costs a database round trip, and an unroutable host waits out `postgres-js`'s
    // 30 s connect timeout. If it were awaited, the gateway's startability would depend on the
    // database being reachable — which is exactly what `startable.test.ts` proves it must not.
    const empty = await freshDatabase();
    const start = scripts.start;
    if (start === undefined) throw new Error("package.json declares no `start` script");
    const child = spawn(start, {
      shell: true,
      cwd: PKG_DIR,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        PORT: "0",
        DEVICE_TOKEN_SECRET: DEVICE_SECRET,
        DATABASE_URL: empty,
      },
    });
    const kill = (): void => {
      if (child.pid === undefined || child.exitCode !== null) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    try {
      const order = await new Promise<string[]>((done, fail) => {
        const seen: string[] = [];
        const timer = setTimeout(
          () => fail(new Error(`never saw both lines. saw: ${seen.join(", ")}`)),
          30_000,
        );
        let out = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          out += chunk;
          for (const line of out.split("\n")) {
            if (line.startsWith(LISTENING_PREFIX) && !seen.includes("listening"))
              seen.push("listening");
            if (line.startsWith(SCHEMA_PREFIX) && !seen.includes("schema")) seen.push("schema");
          }
          if (seen.length === 2) {
            clearTimeout(timer);
            done(seen);
          }
        });
      });
      // The listening line comes FIRST. Reverse the two — await the probe before `listen` — and
      // this is the assertion that fails.
      expect(order).toEqual(["listening", "schema"]);
    } finally {
      kill();
    }
  }, 120_000);
});
