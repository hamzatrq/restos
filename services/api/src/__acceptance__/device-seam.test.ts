/**
 * **THE SEAM BETWEEN THE DEVICE SCREEN AND A TILL THAT ACTUALLY STOPS.**
 *
 * `devices.test.ts` beside this file proves the procedures do the right thing when they are handed
 * a real `DeviceDirectory`. It cannot prove the SHIPPED PROCESS hands them one — and that is this
 * wave's named defect (AGENTS.md: "a correct subsystem with no seam to the product"), which has
 * landed eleven times in this repo and twice on this exact composition root: `createMemoryCatalogPublisher`
 * shipped for months and no menu ever reached a device.
 *
 * The decisive mutant here is `server.ts` building `unconfiguredDeviceDirectory()` instead of
 * `createGatewayDeviceDirectory(link)`. Under it the process still boots, still logs in, still
 * gates every procedure, still answers `catalog.published` — and the org's kill switch reaches
 * nothing. Only an assertion that inspects **what the peer received** separates those two worlds,
 * so that is the only question this file asks, and it asks it out of process through the DECLARED
 * `scripts.start`.
 *
 * ⚠ `testTimeout` is 30 s in `vitest.config.ts` and that is not slack — this spawns a subprocess
 * and hashes a password at `01-F61`'s Argon2id floor.
 *
 * FRs: `14-F12` (the list), `14-F13` (revocation + actor), `14-F30` (`device.manage`), `01-F48`
 * (what a revocation does to the till), `01-F62` (the org-scoped `device.revoked`).
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LISTENING_PREFIX } from "../server.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

const ORG = "org-device-seam";
const BRANCH = "branch-device-seam";
const EMAIL = "owner@device-seam.test";
const PASSWORD = "a-bootstrap-owner-password";
const SECRET = "device-seam-acceptance-session-secret-not-a-real-one";
const DEVICE = "device-seam-counter";

type Spawned = {
  readonly base: string;
  readonly kill: () => void;
};

const startListening = async (
  script: string,
  env: Record<string, string | undefined>,
): Promise<Spawned> => {
  const child = spawn(script, {
    shell: true,
    cwd: PKG_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      PORT: "0",
      SESSION_SECRET: SECRET,
      ...env,
    } as NodeJS.ProcessEnv,
  });
  let out = "";
  let err = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    out += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    err += chunk;
  });
  const kill = (): void => {
    if (child.pid === undefined || child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  const address = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => {
      kill();
      fail(new Error(`no boot line within 25 s.\nstdout:\n${out}\nstderr:\n${err}`));
    }, 25_000);
    child.stdout?.on("data", () => {
      const line = out.split("\n").find((candidate) => candidate.startsWith(LISTENING_PREFIX));
      if (line === undefined) return;
      clearTimeout(timer);
      done(line.slice(LISTENING_PREFIX.length).trim());
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`exited with ${String(code)} before listening.\nstderr:\n${err}`));
    });
  });
  return { base: `http://127.0.0.1:${new URL(address).port}`, kill };
};

type Rpc = { status: number; body: Record<string, unknown> };

const mutate = async (
  base: string,
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
): Promise<Rpc> => {
  const res = await fetch(`${base}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(superjson.serialize(input)),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const query = async (base: string, path: string, headers: Record<string, string>): Promise<Rpc> => {
  const res = await fetch(`${base}/trpc/${path}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const dataOf = (rpc: Rpc): unknown =>
  (rpc.body.result as { data?: { json?: unknown } } | undefined)?.data?.json;

describe("the device surface reaches the gateway (the seam, out of process)", () => {
  let gateway: FakeGateway;
  let running: Spawned;
  let auth: Record<string, string>;

  beforeAll(async () => {
    const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
    const declared = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts?.start;
    // Running the DECLARED string is the point (`startable.test.ts`'s M1): a test hardcoding
    // `tsx src/server.ts` keeps passing the day someone deletes the script, and "there is no start
    // script" is a state three of this repo's services have actually been in.
    if (declared === undefined) throw new Error("package.json declares no `start` script");

    gateway = await startFakeGateway();
    gateway.registerDevice(ORG, {
      device_id: DEVICE,
      branch_id: BRANCH,
      device_class: "counter_electron",
      revoked_at: null,
      token_expires_at: 1_900_000_000_000,
    });

    running = await startListening(declared, {
      BOOTSTRAP_OWNER_EMAIL: EMAIL,
      BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPin(PASSWORD),
      BOOTSTRAP_ORG_ID: ORG,
      ENABLED_BRANCHES: BRANCH,
      ENABLED_CHANNELS: "counter",
      SYNC_GATEWAY_URL: gateway.url,
      SYNC_GATEWAY_TOKEN: gateway.token,
    });

    const login = await mutate(running.base, "auth.login", { email: EMAIL, password: PASSWORD });
    const { token } = dataOf(login) as { token: string };
    auth = { authorization: `Bearer ${token}` };
  }, 60_000);

  afterAll(async () => {
    running?.kill();
    await gateway?.close();
  });

  it("`devices.list` reaches the gateway's registry — not a stub (14-F12)", async () => {
    const listed = await query(running.base, "devices.list", auth);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    // The DEVICE, from the peer. `unconfiguredDeviceDirectory` throws here and a memory stub would
    // answer `[]` — the difference between "no devices" and "we never asked" is invisible in the
    // second case, which is why the fallback refuses instead of returning empty.
    expect(dataOf(listed)).toEqual([
      {
        device_id: DEVICE,
        branch_id: BRANCH,
        device_class: "counter_electron",
        revoked_at: null,
        token_expires_at: 1_900_000_000_000,
        revoked_by: null,
      },
    ]);
    expect(gateway.received.some((entry) => entry.path === "/internal/devices")).toBe(true);
  });

  it("`devices.revoke` writes to the gateway's REGISTRY — the act that stops the till", async () => {
    const revoked = await mutate(running.base, "devices.revoke", { device_id: DEVICE }, auth);
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect(dataOf(revoked)).toMatchObject({ device_id: DEVICE, already: false });

    // `01-F48` reads `revoked_at` off this row. A screen that wrote only the ledger would report
    // success over a device that goes on syncing.
    const row = gateway.devices(ORG).find((device) => device.device_id === DEVICE);
    expect(
      row?.revoked_at,
      "the gateway's registry was never written — the revoke button reports success and stops " +
        "nothing, which is the defect this file exists to catch",
    ).toEqual(expect.any(Number));
  });

  it("…and appends `device.revoked` with the ACTOR (14-F13, 01-F62)", () => {
    // The half a shell command could never do, and the reason `14-F13` puts this on a screen.
    const events = gateway
      .orgEvents()
      .filter((event) => event.type === "device.revoked" && event.org_id === ORG);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      // `server.ts`'s `bootstrapUsers` mints exactly this id for the env-declared owner.
      actor_user_id: `bootstrap-owner:${ORG}`,
    });
    expect(events[0]?.payload).toEqual({
      device_id: DEVICE,
      branch_id: BRANCH,
      device_class: "counter_electron",
    });
  });

  it("the list then shows revoked state AND the actor, joined (14-F13)", async () => {
    const listed = await query(running.base, "devices.list", auth);
    expect(dataOf(listed)).toEqual([
      expect.objectContaining({
        device_id: DEVICE,
        revoked_at: expect.any(Number),
        revoked_by: `bootstrap-owner:${ORG}`,
      }),
    ]);
  });

  it("an unauthenticated caller is refused by the RUNNING process — the control", async () => {
    // Without it every assertion above is also satisfied by a host that answers everyone, and the
    // gate would be untested precisely on the surface where it matters most.
    const listed = await query(running.base, "devices.list", {});
    expect(listed.status).toBe(401);
    const revoked = await mutate(running.base, "devices.revoke", { device_id: DEVICE }, {});
    expect(revoked.status).toBe(401);
  });
});
