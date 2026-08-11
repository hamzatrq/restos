// ACCEPTANCE TESTS — `18 §5`: the two device CLIs print a DSN, and never its password.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2), by a session that wrote no production code
// for either command.
//
// ⚠ **`services/sync-gateway` IS A PROTECTED PATH** (commandment 10 / `20 §4.4`). This file adds
// tests only — no production module is touched by the change that introduces it — but the
// assertions below govern a credential path and want senior review on that basis.
//
// THE AUTHORITY:
//
//   18 §5   logs are structured JSON that ends up in a log store. `redactedDsn`'s own contract
//           states the split the FR implies and this file asserts: "a connection password is the
//           one part of a DSN that must never reach one, and the host/port/database — the part an
//           operator actually needs to diagnose 'why can it not reach the database' — are the
//           parts kept."
//
// ── WHAT WAS MEASURED BEFORE THIS FILE WAS WRITTEN, because it changes what the file is for ──
//
// The claim this suite was commissioned against was that both commands print `env.DATABASE_URL`
// **raw**. **That claim is FALSE and was checked at file:line and by running both commands.**
// `env.DATABASE_URL` occurs exactly twice in each module — once at `drizzle(env.DATABASE_URL)` and
// once inside `redactedDsn(...)` — and there is no third occurrence and no output expression that
// reaches it. Run for real against a password-bearing DSN, on the success path, the bad-argument
// path and the unreachable-database path, neither command emitted the password on either stream.
//
// **What IS missing is the protection, and that is a different and more durable problem.** Of the
// six `redactedDsn` call sites in the repo, four are asserted somewhere and these two are the gap:
//
//   services/sync-gateway/src/server.ts:235   asserted — startable.test.ts sets a purpose-built
//                                             DB_PASSWORD = "do-not-print-this-password" and
//                                             sweeps stdout for it. Strong.
//   services/sync-gateway/src/migrate.ts:130  asserted — migratable.test.ts `not.toContain
//                                             ("restos@")`. Bites (that substring IS in the raw
//                                             container DSN), but it is a hand-copy of the
//                                             harness's credentials rather than a value the test
//                                             owns.
//   services/jobs/src/index.ts:215,224        asserted — auditor-host.test.ts, over the WHOLE
//                                             output, with a distinctive password. Strong.
//   provision-device.ts:244                   NOT ASSERTED AT ALL.
//   revoke-device.ts:207                      asserted VACUOUSLY. revocable.test.ts §G ends with
//                                             `expect(ran.out).not.toContain("postgres:postgres@")`
//                                             — and the container this suite runs against is
//                                             created with POSTGRES_USER/PASSWORD `restos`, so the
//                                             literal `postgres:postgres@` appears in neither the
//                                             raw DSN nor the redacted one. It is a hand-copied
//                                             credential that was never in play, and it therefore
//                                             passes whether the command redacts or not. That is
//                                             `K-3`'s dead-oracle defect wearing a security
//                                             assertion, and it is why this file mints its own
//                                             password instead of naming the harness's.
//
// ── HOW THIS FILE AVOIDS BEING THE SAME TEST AGAIN ───────────────────────────────────────────
//
// `not.toContain(secret)` is the easiest vacuous assertion in the world to write: it passes when
// the command prints nothing, when it crashes before printing, when the secret was never in the
// DSN, and when the whole line was deleted. So every check below is PAIRED with a positive one —
// the output must still carry the database name `18 §5` says an operator needs — and the suite
// asserts up front that the password really is in the DSN it hands the command. A run in which
// the secret was never at risk fails here rather than passing quietly.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROVISION_PREFIX } from "../provision-device.js";
import { REVOKE_PREFIX } from "../revoke-device.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  openDb,
  testDatabaseUrl,
} from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** ≥32 bytes — `provision-device`'s own floor for the HS256 device-token secret. */
const PROVISION_SECRET = "a-device-token-secret-of-at-least-32-bytes-for-the-redaction-suite";

/**
 * A login role minted BY THIS FILE, so the password swept for is one no other suite, container or
 * fixture uses. See the header: the neighbouring assertion this replaces failed precisely because
 * it named a credential the harness does not have.
 */
const LEAKY_ROLE = "redaction_probe_operator";
const LEAKY_PASSWORD = "do-not-print-this-dsn-password-9f3c1a";

/** The database an operator needs to see — `18 §5`'s "the parts kept". */
const DATABASE_NAME = "kernel_test";

let db: Db;
let leakyDsn = "";
let scripts: Record<string, string | undefined> = {};

type Ran = { readonly code: number | null; readonly out: string; readonly err: string };

/** stdout and stderr TOGETHER. `provision-device` narrates on stderr and `revoke-device` on
 * stdout, and `services/jobs`' own redaction test records why the union is the right surface: "a
 * redacted boot line beside a raw DSN in an error message is not redaction." */
const everything = (ran: Ran): string => `${ran.out}\n${ran.err}`;

/**
 * Runs a DECLARED script exactly as a package manager would. The command string is READ from
 * `package.json` rather than spelled out here — `K-3`'s lesson, and the same reason this file
 * imports `PROVISION_PREFIX` / `REVOKE_PREFIX` from the modules instead of re-typing them: an
 * oracle that hand-copies the thing it is checking stops checking it the moment that thing moves.
 */
const runScript = async (
  name: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<Ran> => {
  const declared = scripts[name];
  if (declared === undefined) throw new Error(`package.json declares no \`${name}\` script`);
  return new Promise<Ran>((done, fail) => {
    const child = spawn(`${declared} ${args.join(" ")}`, {
      shell: true,
      cwd: PKG_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        DEVICE_TOKEN_SECRET: PROVISION_SECRET,
        ...env,
      },
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      out += c;
    });
    child.stderr.on("data", (c: string) => {
      err += c;
    });
    child.on("error", (cause: Error) => fail(new Error(`\`${declared}\`: ${cause.message}`)));
    child.on("close", (code) => done({ code, out, err }));
  });
};

const provision = (id: Identity): Promise<Ran> =>
  runScript(
    "provision-device",
    [
      "--org",
      id.org_id,
      "--branch",
      id.branch_id,
      "--device",
      id.device_id,
      "--class",
      "counter_electron",
    ],
    { DATABASE_URL: leakyDsn },
  );

const revoke = (id: Identity): Promise<Ran> =>
  runScript("revoke-device", ["--org", id.org_id, "--device", id.device_id], {
    DATABASE_URL: leakyDsn,
  });

beforeAll(async () => {
  db = openDb();
  scripts =
    (
      JSON.parse(await readFile(join(PKG_DIR, "package.json"), "utf8")) as {
        scripts?: Record<string, string | undefined>;
      }
    ).scripts ?? {};

  // A superuser login role, because the commands read and write `kernel.device_registry`. The
  // point of the role is only that its PASSWORD is one this file owns.
  await db.execute(sql.raw(`drop role if exists ${LEAKY_ROLE}`));
  await db.execute(
    sql.raw(`create role ${LEAKY_ROLE} login superuser password '${LEAKY_PASSWORD}'`),
  );

  const base = new URL(testDatabaseUrl());
  base.username = LEAKY_ROLE;
  base.password = LEAKY_PASSWORD;
  leakyDsn = base.toString();
}, 120_000);

afterAll(async () => {
  await db.execute(sql.raw(`drop role if exists ${LEAKY_ROLE}`));
  await closeDb(db);
});

describe("18 §5 — a device CLI prints which database it used, never the password to it", () => {
  it("the harness itself is honest: the secret really is in the DSN handed to the commands", () => {
    // ⚠ THE GUARD THAT MAKES EVERY `not.toContain` BELOW MEAN SOMETHING. The assertion this file
    // replaces passed for four weeks while checking for a credential that was never in the DSN.
    // If a future edit changes the harness's role or password and forgets this file, THIS is the
    // assertion that fails — loudly and first — rather than the sweeps quietly going vacuous.
    expect(
      leakyDsn,
      "the DSN the commands are given does not contain the password this suite sweeps for, so " +
        "every assertion in this file would pass without the commands redacting anything",
    ).toContain(LEAKY_PASSWORD);
    expect(leakyDsn).toContain(DATABASE_NAME);
  });

  it("provision-device: the DSN it reports is redacted, on BOTH streams", async () => {
    const id = freshIdentity();
    const ran = await provision(id);

    expect(ran.code, `provision-device failed:\n${everything(ran)}`).toBe(0);
    // POSITIVE half — without it, a command that printed nothing at all would pass the sweep.
    expect(
      everything(ran),
      "provision-device printed no narration line, so the redaction sweep below proves nothing",
    ).toContain(PROVISION_PREFIX);
    expect(
      everything(ran),
      "18 §5 keeps the host/port/database — they are what an operator needs to answer 'which " +
        "database did I just write to'. Reporting no DSN at all is not redaction, it is silence",
    ).toContain(DATABASE_NAME);
    // NEGATIVE half.
    expect(
      everything(ran),
      "provision-device put the DATABASE_URL password on an operator's terminal and into their " +
        "shell history (18 §5)",
    ).not.toContain(LEAKY_PASSWORD);
  }, 120_000);

  it("revoke-device: the DSN it reports is redacted, on BOTH streams", async () => {
    const id = freshIdentity();
    expect((await provision(id)).code).toBe(0);

    const ran = await revoke(id);
    expect(ran.code, `revoke-device failed:\n${everything(ran)}`).toBe(0);
    expect(
      everything(ran),
      "revoke-device printed no narration line, so the redaction sweep below proves nothing",
    ).toContain(REVOKE_PREFIX);
    expect(
      everything(ran),
      "18 §5 keeps the host/port/database — a revocation an operator cannot place is a " +
        "revocation they will run again against the wrong database",
    ).toContain(DATABASE_NAME);
    expect(
      everything(ran),
      "revoke-device put the DATABASE_URL password on an operator's terminal and into their " +
        "shell history (18 §5)",
    ).not.toContain(LEAKY_PASSWORD);
  }, 180_000);

  it("a FAILING run leaks nothing either — the path nobody watches", async () => {
    // Both commands end in `main().catch(e => console.error(e.message))`, and an error message is
    // the classic place a connection string reappears after every deliberate print has been
    // redacted. `revoke-device` against an unregistered device is the cheapest real failure: it
    // refuses loudly, exits non-zero, and never reaches the line that prints the DSN on purpose.
    const ran = await revoke(freshIdentity());

    expect(ran.code, "an unregistered device was reported as revoked").not.toBe(0);
    expect(
      everything(ran),
      "the refusal says nothing at all — a silent failure here is the one that leaves an " +
        "operator believing a live till is dead (01-F48)",
    ).toContain("NOT REGISTERED");
    expect(
      everything(ran),
      "the DATABASE_URL password reached the terminal through the ERROR path. Redacting the " +
        "success line and not the failure line is not redaction (18 §5)",
    ).not.toContain(LEAKY_PASSWORD);
  }, 120_000);
});
