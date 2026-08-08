/**
 * **THE SEAM BETWEEN `registerDevice`/`issueDeviceToken` AND A DEVICE THAT CAN ACTUALLY BE BROUGHT
 * UP.** `01-F25` / `01-F47`.
 *
 * Both halves of admission were correct, tested, and unreachable. `registerDevice` carried
 * a `seams:check` debt marker saying so in as many words — *"a device is provisioned only by a test or by
 * hand-written SQL"* — and `issueDeviceToken`'s only production caller was the RENEWAL path, which
 * by definition needs a device that is already admitted. So the product could renew a credential it
 * had no way to issue, and `plans/wave-1/running-the-stack.md` §6b told an operator to run a
 * `tsx -e` one-liner and then `INSERT` into a PROTECTED service's table by hand. **You could not add
 * a second till without writing SQL**, which is AGENTS.md's recurring defect in the shape the seams
 * rail cannot see: the exports are not dead, there is simply no way to invoke them.
 *
 * So this file, like `migratable.test.ts` and `startable.test.ts` beside it, reads nothing's mind.
 * It runs the **declared script** from `package.json`, in a **separate process**, against a **real
 * Postgres, and then makes the product judge the result**: the token the command printed is
 * presented to a real `createGateway` at a real `hello`, and admission comes from nothing this file
 * wrote. Executing the DECLARED string is the point (`startable.test.ts`'s M1) — a test that
 * hardcoded `tsx src/provision-device.ts` would keep passing after someone deleted the script, and
 * "the script does not exist" is the exact state this service was in for `start` and for `migrate`.
 *
 * **§B IS TWO-SIDED ON PURPOSE** (round-3 law, and it is the anti-vacuity guard): it drives the
 * SAME hello with the SAME token BEFORE the command runs and requires it to be REFUSED. Without
 * that half, a gateway that admitted everyone — or a fixture whose identity some other file had
 * already registered — would satisfy "the session opened" while proving nothing about the command.
 *
 * **§C and §D are the security half, and they exist because the procedure this command replaces got
 * them wrong.** §6b's SQL ended `on conflict (org_id, device_id) do update set revoked_at = null`,
 * so re-running the documented provisioning step **un-revoked a revoked device** — `01-F25`/`01-F48`
 * make revocation the operative kill switch, and the runbook resurrected it.
 *
 * ⚠ **Clocks.** Every fixture here uses `Date.now()`, never `BASE_T`. The gateway under test is
 * built with the real clock on purpose (the command stamps a real 90-day expiry), and a `BASE_T`
 * session would open straight into `01-F47` drain mode where reads are refused — which reads as
 * "the catalog never arrived" rather than as an auth problem. `journey-catalog.test.ts` records
 * having been bitten by exactly this.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { newId } from "@restos/domain";
import { parseMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyDeviceToken } from "../auth.js";
import { createGateway } from "../gateway.js";
import { PROVISION_PREFIX } from "../provision-device.js";
import { revokeDevice } from "../registry.js";
import { closeDb, type Db, ofKind, openDb, recorder, testDatabaseUrl } from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** ≥32 bytes, which both the command and the boot validator enforce (`18 §5`). A fixture. */
const SECRET = "a-device-token-secret-of-at-least-32-bytes-for-the-provisionable-suite";

type Scripts = Record<string, string | undefined>;
type Ran = { readonly code: number | null; readonly out: string; readonly err: string };

let db: Db;
let scripts: Scripts;

const readScripts = async (): Promise<Scripts> => {
  const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts?: Scripts }).scripts ?? {};
};

/**
 * Runs the DECLARED `provision-device` script exactly as a package manager would — the command
 * string through a shell, from the package root, with the package's own `node_modules/.bin` on
 * `PATH`. The script name is read from `package.json`; nothing here knows what it expands to.
 */
const provision = async (
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<Ran> => {
  const declared = scripts["provision-device"];
  if (declared === undefined) {
    throw new Error("package.json declares no `provision-device` script");
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
        DEVICE_TOKEN_SECRET: SECRET,
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

/**
 * The token the command printed. **stdout's LAST non-empty line** — a package manager prints its
 * own banner ahead of the script, which is why the runbook pipes through `tail -1`, and the command
 * puts every human-readable line on stderr precisely so this is unambiguous.
 */
const tokenOf = (ran: Ran): string => {
  const lines = ran.out.split("\n").filter((line) => line.trim() !== "");
  const last = lines[lines.length - 1];
  if (last === undefined)
    throw new Error(`no token on stdout.\nstdout:\n${ran.out}\nstderr:\n${ran.err}`);
  return last.trim();
};

type Identity = { org_id: string; branch_id: string; device_id: string };
const freshIdentity = (): Identity => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

const flags = (id: Identity, deviceClass = "counter_electron"): string[] => [
  "--org",
  id.org_id,
  "--branch",
  id.branch_id,
  "--device",
  id.device_id,
  "--class",
  deviceClass,
];

/**
 * Presents `token` at a real `hello` against a real `createGateway` — the product's own admission
 * decision, made from nothing but what the command wrote. Returns the `hello_ack`, or throws
 * whatever the gateway threw.
 */
const helloWith = async (id: Identity, token: string): Promise<{ catalog_version: number }> => {
  const gateway = createGateway({
    db,
    // The REAL clock, because the command stamps a real expiry against it.
    clock: { now: () => Date.now() },
    auth: { token_secret: SECRET },
  });
  const rec = recorder();
  const conn = gateway.connect(rec.sink);
  try {
    await conn.handle(
      parseMessage({
        v: 1,
        kind: "hello",
        device_id: id.device_id,
        device_class: "counter_electron",
        branch_id: id.branch_id,
        token,
        last_global_seq: 0,
        own_high_water: 0,
      }),
    );
    const ack = ofKind(rec.all, "hello_ack")[0];
    if (ack === undefined) throw new Error("no hello_ack");
    return { catalog_version: ack.catalog_version ?? 0 };
  } finally {
    conn.close();
    await gateway.close();
  }
};

/** The registry row as the auth checks read it — asked of the DATABASE, never of our code. */
const registryRow = async (
  id: Identity,
): Promise<
  | {
      branch_id: string;
      device_class: string;
      revoked_at: number | null;
      token_expires_at: number | null;
    }
  | undefined
> => {
  const rows = await db.execute(
    sql`select branch_id, device_class, revoked_at, token_expires_at from kernel.device_registry
        where org_id = ${id.org_id} and device_id = ${id.device_id}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return {
    branch_id: String(row.branch_id),
    device_class: String(row.device_class),
    revoked_at: row.revoked_at === null ? null : Number(row.revoked_at),
    token_expires_at: row.token_expires_at === null ? null : Number(row.token_expires_at),
  };
};

describe("services/sync-gateway can provision a device (01-F25/01-F47 — the seam to a second till)", () => {
  beforeAll(async () => {
    db = openDb();
    scripts = await readScripts();
  }, 60_000);

  afterAll(async () => {
    await closeDb(db);
  });

  it("§A declares a provision-device script that points at the provisioning entry point", async () => {
    // The weakest assertion in the file, here only to name WHICH script everything below executes.
    expect(
      scripts["provision-device"],
      "no `provision-device` script — a device can only be admitted with hand-written SQL",
    ).toBeDefined();
    expect(scripts["provision-device"]).toContain("src/provision-device.ts");
  });

  it("§B a device REFUSED before the command is ADMITTED after it — and nothing else wrote a row", async () => {
    const id = freshIdentity();
    // The token this half presents is minted by the command itself in the second half; here we need
    // *a* validly-signed one to prove the refusal is the REGISTRY's and not the signature's.
    const { issueDeviceToken } = await import("../auth.js");
    const preToken = await issueDeviceToken(id, SECRET, { now: Date.now() });

    // ── the anti-vacuity half. Without it, a gateway that admitted everyone passes below.
    expect(await registryRow(id), "the fixture identity was already registered").toBeUndefined();
    await expect(helloWith(id, preToken)).rejects.toThrow(/not registered/i);

    // ── the command, and nothing else.
    const ran = await provision(flags(id));
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.err).toContain(PROVISION_PREFIX);

    // The product's own admission decision, on the token the command printed.
    const ack = await helloWith(id, tokenOf(ran));
    expect(ack.catalog_version).toBe(0);

    // And the row it wrote is the one the auth checks read (`18 §5`: the registry decides).
    const row = await registryRow(id);
    expect(row?.branch_id).toBe(id.branch_id);
    expect(row?.device_class).toBe("counter_electron");
    expect(row?.revoked_at).toBeNull();
  }, 120_000);

  it("§B2 the ONE expiry instant is written to the token AND to the registry", async () => {
    // `registry.ts`'s doc comment ends "Pass the value." — because `token_expires_at` would
    // otherwise be seeded from the DATABASE clock while `01-F47`'s renewal logic judges it against
    // the gateway's INJECTED clock, and a freshly-provisioned device can then read as permanently
    // not-due and never renew. One instant, two writes, asserted equal.
    const id = freshIdentity();
    const ran = await provision(flags(id));
    expect(ran.code, ran.err).toBe(0);

    const claims = await verifyDeviceToken(tokenOf(ran), SECRET);
    expect(claims, "the printed token does not verify under DEVICE_TOKEN_SECRET").not.toBeNull();
    expect(claims?.org_id).toBe(id.org_id);
    expect(claims?.branch_id).toBe(id.branch_id);
    expect(claims?.device_id).toBe(id.device_id);
    // 01-F47: expiry is MANDATORY. A mint with no expiry is the indefinitely-valid credential
    // DEC-AUTH-001 exists to abolish.
    expect(claims?.expires_at).toBeTypeOf("number");
    expect((await registryRow(id))?.token_expires_at).toBe(claims?.expires_at);
    // 90 days (01-F47's ratified default), not some other lifetime.
    const days = ((claims?.expires_at ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
  }, 120_000);

  it("§B3 the token carries the DEPLOYMENT BINDING the gateway will verify it against (01-F47)", async () => {
    // `verifyDeviceToken` enforces `iss`/`aud` only where configured, so a gateway started with
    // `DEVICE_TOKEN_ISSUER` set and a token minted without it is a perfectly-signed credential that
    // opens nothing. That is adversarial-review B3's defect — the capability existed and the
    // shipped artifact did not exhibit it — reproduced one process over.
    const id = freshIdentity();
    const ran = await provision(flags(id), {
      DEVICE_TOKEN_ISSUER: "restos-provision-suite",
      DEVICE_TOKEN_AUDIENCE: "restos-till",
    });
    expect(ran.code, ran.err).toBe(0);
    const bound = await verifyDeviceToken(tokenOf(ran), SECRET, {
      issuer: "restos-provision-suite",
      audience: "restos-till",
    });
    expect(bound, "the command ignored DEVICE_TOKEN_ISSUER/AUDIENCE").not.toBeNull();
    // Two-sided: a token minted for THIS deployment must be inert in another one.
    expect(await verifyDeviceToken(tokenOf(ran), SECRET, { issuer: "somebody-else" })).toBeNull();
  }, 120_000);

  it("§C it REFUSES to register a device twice, and --reissue re-credentials without a new row", async () => {
    const id = freshIdentity();
    expect((await provision(flags(id))).code).toBe(0);
    const first = await registryRow(id);

    const again = await provision(flags(id));
    expect(again.code, "registering the same device twice succeeded").not.toBe(0);
    expect(`${again.err}${again.out}`).toContain("--reissue");

    const reissued = await provision([...flags(id), "--reissue"]);
    expect(reissued.code, `stdout:\n${reissued.out}\nstderr:\n${reissued.err}`).toBe(0);
    const after = await registryRow(id);
    expect(after?.branch_id).toBe(first?.branch_id);
    // The re-mint went through `recordTokenExpiry`, the single writer of this column.
    expect(after?.token_expires_at).not.toBe(first?.token_expires_at);
    // And the re-issued credential is the one the product accepts.
    await helloWith(id, tokenOf(reissued));
  }, 180_000);

  it("§D it NEVER un-revokes: the exact thing the runbook's SQL did on conflict", async () => {
    // `plans/wave-1/running-the-stack.md` §6b said
    //   on conflict (org_id, device_id) do update set revoked_at = null
    // so re-running the documented provisioning step resurrected a revoked till. `01-F25`/`01-F48`
    // make revocation the operative kill switch and `01-F47` says so in as many words.
    const id = freshIdentity();
    expect((await provision(flags(id))).code).toBe(0);
    await revokeDevice(db, { org_id: id.org_id, device_id: id.device_id });
    const revokedAt = (await registryRow(id))?.revoked_at;
    expect(revokedAt).toBeTypeOf("number");

    for (const argv of [flags(id), [...flags(id), "--reissue"]]) {
      const ran = await provision(argv);
      expect(ran.code, `a revoked device was re-provisioned by \`${argv.join(" ")}\``).not.toBe(0);
      // Not merely "it exited non-zero": the row is untouched, so a command that refused AFTER
      // writing fails here rather than passing for having complained.
      expect((await registryRow(id))?.revoked_at).toBe(revokedAt);
    }
  }, 180_000);

  it("§E a class outside 01-F39's vocabulary is refused, and writes nothing", async () => {
    const id = freshIdentity();
    const ran = await provision(flags(id, "espresso_machine"));
    expect(ran.code).not.toBe(0);
    expect(`${ran.err}${ran.out}`).toContain("DEVICE_CLASSES");
    expect(await registryRow(id), "a refused class still wrote a registry row").toBeUndefined();
  }, 120_000);

  it("§F the 32-byte DEVICE_TOKEN_SECRET floor is enforced here too (18 §5)", async () => {
    // The command MINTS with this key; the server VERIFIES with it. A floor enforced on one side
    // only is not a floor — `01-F61`'s cost-floor lesson, one credential over.
    const id = freshIdentity();
    const ran = await provision(flags(id), { DEVICE_TOKEN_SECRET: "too-short" });
    expect(ran.code).not.toBe(0);
    expect(`${ran.err}${ran.out}`).toContain("32 bytes");
    expect(await registryRow(id)).toBeUndefined();
  }, 120_000);
});
