/**
 * **THE SEAM BETWEEN `revokeDevice` AND A DEVICE THAT CAN ACTUALLY BE SWITCHED OFF.** `01-F25` /
 * `01-F48` / `01-F42`.
 *
 * `provisionable.test.ts` beside this file closed the admission half. It closed it alone:
 * `revokeDevice` had **zero shipping callers**, so a till could be admitted by a declared command
 * and revoked only by hand-written SQL against a PROTECTED service's table. AGENTS.md's recurring
 * defect, in the shape the seams rail cannot see — the export is not dead, there was simply no way
 * to invoke it — and this instance is the security half, which is why it is the worse one.
 *
 * Like `startable` / `migratable` / `provisionable`, this file reads nothing's mind: it runs the
 * **declared script** from `package.json`, in a **separate process**, against a **real Postgres, and
 * then makes the product judge the result**. Executing the DECLARED string is the point
 * (`startable.test.ts`'s M1, `migratable`'s N1, `provisionable`'s P1) — a test hardcoding
 * `tsx src/revoke-device.ts` keeps passing after someone deletes the script, and "the script does
 * not exist" is the exact state this service was in for `start`, for `migrate` and for provisioning.
 *
 * **§B IS TWO-SIDED, AND HERE THAT IS THE ANTI-VACUITY GUARD.** A test that only checks a database
 * column changed proves nothing about whether the till is locked out — the column is what the SQL
 * already did. So §B drives the SAME hello with the SAME token BEFORE the command and requires it
 * ADMITTED, then after it and requires it REFUSED, both decided by a real `createGateway` reading
 * the real registry.
 *
 * **§C IS THE ONE THE SPEC ACTUALLY DEMANDS.** `01-F48`: *"Revoking a device evicts it from the mesh
 * within 30 s where any path (cloud or LAN) reaches it, rather than only at its next voluntary
 * contact: the cloud drops live sessions and culls the device from fan-out on the revoking
 * transaction."* A revoked device holding a valid unexpired token is the interesting case, and the
 * FR answers it: mid-session, not at renewal, not at the next hello. `auth-eviction-latency.test.ts`
 * already pins that the *sweep* evicts. What is unproven until here is that the sweep sees a
 * revocation performed by ANOTHER PROCESS — which is the only way this command can ever work, and
 * exactly how `server.ts`'s `setInterval` learns of one.
 *
 * ⚠ **Clocks.** §B and §C use `makeClock()` (BASE_T) with helper-minted tokens because the command
 * under test mints nothing and never reads a clock. §F composes the two declared commands and so
 * uses `Date.now()`, for `provisionable.test.ts`'s reason: `provision-device` stamps a real 90-day
 * expiry, and a BASE_T gateway would open straight into `01-F47` drain mode.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { newId } from "@restos/domain";
import { parseMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthRejectedError } from "../errors.js";
import { createGateway, type Gateway, REVOCATION_SWEEP_INTERVAL_MS } from "../gateway.js";
import { REVOKE_PREFIX } from "../revoke-device.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  helloMsg,
  type Identity,
  makeClock,
  ofKind,
  openDb,
  openSession,
  recorder,
  signedToken,
  TEST_TOKEN_SECRET,
  testDatabaseUrl,
} from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** ≥32 bytes — `provision-device`'s floor, needed only by §F, which spawns it. */
const PROVISION_SECRET = "a-device-token-secret-of-at-least-32-bytes-for-the-revocable-suite";

type Scripts = Record<string, string | undefined>;
type Ran = { readonly code: number | null; readonly out: string; readonly err: string };

let db: Db;
let gateway: Gateway;
let scripts: Scripts;

const readScripts = async (): Promise<Scripts> => {
  const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts?: Scripts }).scripts ?? {};
};

/**
 * Runs a DECLARED script exactly as a package manager would — the command string through a shell,
 * from the package root, with the package's own `node_modules/.bin` on `PATH`. The script name is
 * read from `package.json`; nothing here knows what it expands to.
 */
const runScript = async (
  name: string,
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<Ran> => {
  const declared = scripts[name];
  if (declared === undefined) {
    throw new Error(`package.json declares no \`${name}\` script`);
  }
  return new Promise<Ran>((done, fail) => {
    const child = spawn(`${declared} ${args.join(" ")}`, {
      shell: true,
      cwd: PKG_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        DATABASE_URL: testDatabaseUrl(),
        DEVICE_TOKEN_SECRET: PROVISION_SECRET,
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
      fail(new Error(`\`${declared}\` could not be spawned: ${cause.message}`)),
    );
    child.on("close", (code) => done({ code, out, err }));
  });
};

const revoke = (id: Identity, extra: readonly string[] = []): Promise<Ran> =>
  runScript("revoke-device", ["--org", id.org_id, "--device", id.device_id, ...extra]);

/**
 * ⚠ `--name` joined this list in August 2026 — `01-F70` makes a device's human name REQUIRED at
 * registration and `provision-device` refuses without it (`15-F27`). Nothing this file asserts is
 * about the name; the fixture supplies one so §F can still reach the revocation round trip it is
 * actually testing. `provisionable.test.ts` §G owns the requirement itself.
 */
const provisionFlags = (id: Identity): string[] => [
  "--org",
  id.org_id,
  "--branch",
  id.branch_id,
  "--device",
  id.device_id,
  "--class",
  "counter_electron",
  "--name",
  // Quoted — `runScript` joins argv with spaces and runs it through a shell.
  '"Counter till"',
];

/** The registry row as the auth checks read it — asked of the DATABASE, never of our code. */
const registryRow = async (
  id: Identity,
): Promise<{ device_class: string; revoked_at: number | null } | undefined> => {
  const rows = await db.execute(
    sql`select device_class, revoked_at from kernel.device_registry
        where org_id = ${id.org_id} and device_id = ${id.device_id}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return {
    device_class: String(row.device_class),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
  };
};

/**
 * A hello driven straight at `gateway`, so an UNREGISTERED/REVOKED refusal is observable.
 * `openSession` cannot be used for the refusal half — it auto-registers, and it demands an ack.
 * The rejection is CAUGHT rather than propagated because `01-F42`'s purge is written to the sink
 * *before* `handleHello` throws, and both halves are the assertion.
 */
const helloDirect = async (
  id: Identity,
  token: string,
): Promise<{ readonly acks: number; readonly purges: number; readonly refusal: unknown }> => {
  const rec = recorder();
  const conn = gateway.connect(rec.sink);
  let refusal: unknown;
  try {
    await conn.handle(helloMsg(id, { token }));
  } catch (error: unknown) {
    refusal = error;
  } finally {
    conn.close();
  }
  return {
    acks: ofKind(rec.all, "hello_ack").length,
    purges: ofKind(rec.all, "purge_command").length,
    refusal,
  };
};

describe("services/sync-gateway can revoke a device (01-F25/01-F48 — the kill switch's missing half)", () => {
  beforeAll(async () => {
    db = openDb();
    gateway = createGateway({
      db,
      clock: makeClock(),
      auth: { token_secret: TEST_TOKEN_SECRET },
    });
    scripts = await readScripts();
  }, 60_000);

  afterAll(async () => {
    await gateway.close();
    await closeDb(db);
  });

  it("§A declares a revoke-device script that points at the revocation entry point", async () => {
    // The weakest assertion in the file, here only to name WHICH script everything below executes.
    expect(
      scripts["revoke-device"],
      "no `revoke-device` script — a stolen till can only be switched off with hand-written SQL",
    ).toBeDefined();
    expect(scripts["revoke-device"]).toContain("src/revoke-device.ts");
  });

  it("§B a device ADMITTED before the command is REFUSED after it, and the refusal carries 01-F42's purge", async () => {
    const id = freshIdentity();
    const token = signedToken(id);

    // ── the anti-vacuity half. Without it, a command that broke admission for everyone passes.
    const before = await openSession(gateway, id, { token });
    expect(before.helloAck.kind).toBe("hello_ack");
    before.conn.close();
    expect((await registryRow(id))?.revoked_at, "the fixture was already revoked").toBeNull();

    // ── the command, and nothing else. A separate process, the declared string.
    const ran = await revoke(id);
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.out).toContain(REVOKE_PREFIX);

    // The product's own admission decision, on the SAME token that worked a moment ago — so the
    // refusal is the REGISTRY's and cannot be a signature, an expiry or a branch mismatch.
    const after = await helloDirect(id, token);
    expect(after.acks, "a revoked device was still admitted").toBe(0);
    expect(after.refusal, "the revoked hello was neither admitted nor refused").toBeInstanceOf(
      AuthRejectedError,
    );
    expect((after.refusal as Error).message).toMatch(/revoked/i);
    // 01-F42: a revoked device receives a local-purge command on next contact.
    expect(after.purges, "the refused hello carried no purge_command (01-F42)").toBe(1);

    expect((await registryRow(id))?.revoked_at).toBeTypeOf("number");
  }, 120_000);

  it("§C 01-F48: a LIVE session is evicted by a revocation performed in ANOTHER PROCESS", async () => {
    // The FR's own case: "the cloud drops live sessions … rather than only at its next voluntary
    // contact". The device here never speaks again — it holds a valid, unexpired token and an open
    // socket. `auth-eviction-latency.test.ts` pins that the sweep evicts when the test itself calls
    // `revokeDevice` in-process; what is unproven until here is that the sweep sees a revocation
    // written by a SEPARATE PROCESS, which is the only way a CLI kill switch can ever work and is
    // exactly how `server.ts`'s setInterval learns of one.
    const victim = freshIdentity();
    const bystander: Identity = { ...victim, device_id: newId() };
    const live = await openSession(gateway, victim);
    const peer = await openSession(gateway, bystander);

    const ran = await revoke(victim);
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);

    // The branch is SILENT — nobody pushes, nobody reconnects. Only the sweep runs, exactly as the
    // shipped `server.ts` timer drives it.
    await gateway.sweepRevocations();

    expect(
      ofKind(live.rec.all, "purge_command"),
      "the revoked live session survived a revocation performed by the declared command",
    ).toHaveLength(1);
    expect(
      ofKind(peer.rec.all, "purge_command"),
      "a device the command did not name was evicted too",
    ).toHaveLength(0);

    // And the bound the command PRINTS is the gateway's own constant, not a hand-copied "30 s"
    // that would keep saying 30 after someone changed the sweep (round-3 law, K-3's defect).
    expect(ran.out).toContain(`${String(REVOCATION_SWEEP_INTERVAL_MS / 1000)}s`);
    expect(REVOCATION_SWEEP_INTERVAL_MS).toBeLessThanOrEqual(30_000);

    live.conn.close();
    peer.conn.close();
  }, 120_000);

  it("§D re-revoking is HONEST: it says already, keeps the original instant, and stays exit 0", async () => {
    const id = freshIdentity();
    await openSession(gateway, id).then((s) => {
      s.conn.close();
    });

    const first = await revoke(id);
    expect(first.code, `stdout:\n${first.out}\nstderr:\n${first.err}`).toBe(0);
    const stamped = (await registryRow(id))?.revoked_at;
    expect(stamped).toBeTypeOf("number");
    expect(first.out.toLowerCase()).not.toContain("already");

    const second = await revoke(id);
    // A kill switch you hesitate to re-run is a kill switch you hesitate over: the desired state
    // holds, so this is not a failure.
    expect(
      second.code,
      "a second revocation reported failure over a correctly-revoked device",
    ).toBe(0);
    // The operator's actual question, and it is a security signal: did I just kill it, or was it
    // already dead — i.e. did somebody else revoke this?
    expect(
      second.out.toLowerCase(),
      "the second run claimed to have revoked a device that was already revoked",
    ).toContain("already");
    // 01-F1 spirit / `revokeDevice`'s own "only the FIRST revocation stamps": the instant may not move.
    expect((await registryRow(id))?.revoked_at).toBe(stamped);
    expect(second.out).toContain(new Date(stamped as number).toISOString());
  }, 180_000);

  it("§E a device that was never registered is a LOUD failure, not a silent success", async () => {
    // The 2am case, and the one `revokeDevice` alone cannot get right: it is an `UPDATE … WHERE`,
    // so a mistyped --device matches zero rows, returns void, and a command that trusted it would
    // print success over a till that is still live and still selling (`00 §5.7`).
    const ghost = freshIdentity();
    const ran = await revoke(ghost);
    expect(ran.code, "revoking a device that does not exist reported success").not.toBe(0);
    expect(`${ran.out}${ran.err}`).toContain("NOT REGISTERED");
    expect(
      await registryRow(ghost),
      "a refused revocation still wrote a registry row",
    ).toBeUndefined();
  }, 120_000);

  it("§F it NEVER un-revokes — no flag offers it, and the provision command still refuses afterwards", async () => {
    // Nothing in the corpus describes reinstating a revoked device; `01-N5` specifies the
    // replacement path instead (a FRESH device_id). So the two declared commands are composed here
    // and the round trip an operator would actually try — "I revoked the wrong one, let me just
    // re-provision it" — must fail. §6b's SQL did exactly that on conflict.
    const id = freshIdentity();
    expect((await runScript("provision-device", provisionFlags(id))).code).toBe(0);
    expect((await revoke(id)).code).toBe(0);
    const stamped = (await registryRow(id))?.revoked_at;
    expect(stamped).toBeTypeOf("number");

    for (const flag of ["--restore", "--unrevoke", "--reissue"]) {
      const ran = await revoke(id, [flag]);
      expect(ran.code, `\`${flag}\` was accepted by revoke-device`).not.toBe(0);
      expect((await registryRow(id))?.revoked_at, `\`${flag}\` moved revoked_at`).toBe(stamped);
    }

    for (const argv of [provisionFlags(id), [...provisionFlags(id), "--reissue"]]) {
      const ran = await runScript("provision-device", argv);
      expect(ran.code, `a revoked device was re-provisioned by \`${argv.join(" ")}\``).not.toBe(0);
      expect((await registryRow(id))?.revoked_at).toBe(stamped);
    }
  }, 240_000);

  it("§G the report names WHICH device went dark — branch and class read from the registry", async () => {
    // An operator revoking under pressure needs to see the till they just switched off, and the
    // only fields that can catch a typo landing on a REAL device are the ones the command did not
    // receive as arguments. Both are read from the row.
    const id = freshIdentity();
    await openSession(gateway, id).then((s) => {
      s.conn.close();
    });
    expect((await registryRow(id))?.device_class).toBe("counter_electron");

    const ran = await revoke(id);
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.out, "the report does not say which device").toContain(id.device_id);
    expect(ran.out, "the report does not name the BRANCH the device belonged to").toContain(
      id.branch_id,
    );
    expect(ran.out, "the report does not name the device CLASS").toContain("counter_electron");
    // And no DSN password ever reaches an operator's terminal or their shell history (`18 §5`).
    expect(ran.out).not.toContain("postgres:postgres@");
  }, 120_000);

  it("§H revocation blocks the device's next operation too, not only its next hello (01-F48)", async () => {
    // "Revocation blocks READS as well as writes: a revoked device receives no further events on
    // any plane." The sweep is a bound, not the only enforcement — a session that has not yet been
    // swept must already be refused per-operation, or the ≤30 s window is a ≤30 s hole.
    const id = freshIdentity();
    const live = await openSession(gateway, id);

    expect((await revoke(id)).code).toBe(0);

    await expect(
      live.conn.handle(parseMessage({ v: 1, kind: "catchup_request", from_global_seq: 0 })),
      "a revoked device was served a catchup between the revocation and the sweep",
    ).rejects.toThrow(AuthRejectedError);
    live.conn.close();
  }, 120_000);
});
