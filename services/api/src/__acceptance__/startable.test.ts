// **THE SEAM BETWEEN THIS SERVICE AND A RUNNING PROCESS.**
//
// `services/api` had 80 passing tests, a boot gate that refuses an ungated procedure, and **no way
// to start it**: `package.json` carried `test` and a `build` stub that echoes a sentence, so
// `main()` was unreachable and the whole cloud plane had never run. That is this wave's recurring
// defect (AGENTS.md) at its largest scale — a correct subsystem with no seam to the product — and
// the lesson of the eight prior instances is that the fix needs an ASSERTION, not just a fix.
//
// So this file does not read the implementation's mind. It runs the **declared run script**, over
// a **real socket**, in a **separate process**, and asks the questions a fake link cannot answer:
//
//   1. Does the command in `package.json` produce a listening server?
//   2. Did the composition root actually WIRE anything — is the env-seeded owner in the store,
//      or did a process merely start?
//   3. Is Commandment 8's gate live in that process, or only under `server.inject`?
//   4. Can the module be imported without a server appearing as a side effect? (This is what lets
//      `apps/backoffice` take `AppRouter` type-only and the suite build hosts at will.)
//
// `18 §14` names `tsx` as the dev runner; nothing here knows that — it executes whatever
// `scripts.start` says, so the test follows a change of runner and fails a change to nothing.
//
// ⚠ **`testTimeout` is 30 s in `vitest.config.ts` and that is not slack.** This spawns a
// subprocess and hashes a password with `01-F61`'s Argon2id floor. Four oracle suites in this repo
// have already flaked on the 5 s default; do not lower it.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiServer, LISTENING_PREFIX } from "../server.js";
import { createMemoryUserStore } from "../users.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

/**
 * ⚠ **Importing `../server.js` above is itself half of assertion 4, and it is why this comment
 * exists rather than a bare import.** `server.ts` runs `start()` only when it IS the entry module.
 * Delete that guard and importing it here runs the composition root, which finds no
 * `SESSION_SECRET` in the test env, throws, and `process.exit(1)`s the vitest worker — taking the
 * whole file with it. The out-of-process probe below makes the same claim decisively, from a
 * process this suite does not control.
 */

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** Fixtures for the spawned process. Nothing here is read by any other test. */
const ORG = "org-startable";
const EMAIL = "owner@startable.test";
const PASSWORD = "a-bootstrap-owner-password";
const SECRET = "startable-acceptance-session-secret-not-a-real-one";
const BRANCH = "branch-startable";

type Scripts = Record<string, string | undefined>;

const readScripts = async (): Promise<Scripts> => {
  const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts?: Scripts }).scripts ?? {};
};

type Running = {
  readonly base: string;
  readonly pid: number;
  readonly stderr: () => string;
  readonly kill: () => void;
};

/**
 * Runs `scripts.start` exactly as a package manager would — the command string through a shell,
 * from the package root, with the package's own `node_modules/.bin` on `PATH`. Executing the
 * DECLARED string rather than a hardcoded `tsx src/server.ts` is the point: a test that hardcodes
 * the command passes after someone deletes the script.
 *
 * `PORT=0` binds an ephemeral port, so the port is knowable ONLY from the boot line — which is
 * what makes that line load-bearing instead of decorative.
 */
const startDeclaredScript = async (
  script: string,
  hash: string,
  gateway: FakeGateway,
): Promise<Running> => {
  const child = spawn(script, {
    shell: true,
    cwd: PKG_DIR,
    // Its own process group: `shell: true` may leave the runner's child behind when the shell is
    // signalled, and an orphaned server holding a port outlives the suite.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      PORT: "0",
      SESSION_SECRET: SECRET,
      BOOTSTRAP_OWNER_EMAIL: EMAIL,
      BOOTSTRAP_OWNER_PASSWORD_HASH: hash,
      BOOTSTRAP_ORG_ID: ORG,
      ENABLED_BRANCHES: BRANCH,
      ENABLED_CHANNELS: "counter",
      // August 2026: `start()` REQUIRES somewhere to publish to, because the alternative it
      // replaced was publishing into a process-local `Map` (see `server.ts`). Nothing about the
      // assertions below changed; they simply need the composition root to be satisfiable.
      SYNC_GATEWAY_URL: gateway.url,
      SYNC_GATEWAY_TOKEN: gateway.token,
    },
  });

  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
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
      fail(
        new Error(`no "${LISTENING_PREFIX}" line within 25 s.\nstdout:\n${out}\nstderr:\n${err}`),
      );
    }, 25_000);

    const settleFail = (message: string): void => {
      clearTimeout(timer);
      fail(new Error(message));
    };

    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      const line = out.split("\n").find((candidate) => candidate.startsWith(LISTENING_PREFIX));
      if (line === undefined) return;
      clearTimeout(timer);
      done(line.slice(LISTENING_PREFIX.length).trim());
    });

    // A boot refusal — an invalid env, a failed bind, or `assertEveryProcedureIsGated` finding an
    // ungated procedure — exits before it ever listens. Report WHY, or every regression here looks
    // like a timeout.
    child.on("exit", (code) => {
      settleFail(
        `\`${script}\` exited with ${code} before listening.\nstdout:\n${out}\nstderr:\n${err}`,
      );
    });
    child.on("error", (cause: Error) => {
      settleFail(`\`${script}\` could not be spawned: ${cause.message}`);
    });
  });

  // The advertised host may be a wildcard bind; the loopback is what a client on this machine
  // actually dials. Only the port is taken from the line.
  const port = new URL(address).port;
  expect(port, `boot line advertised no port: ${address}`).not.toBe("");
  return {
    base: `http://127.0.0.1:${port}`,
    pid: child.pid ?? -1,
    stderr: () => err,
    kill,
  };
};

type Rpc = { status: number; body: Record<string, unknown> };

/**
 * tRPC v11's HTTP contract with the superjson transformer, spoken over a real socket rather than
 * `server.inject`. If the host's transformer ever stopped matching the back office's, these calls
 * are where it shows.
 */
const query = async (
  running: Running,
  path: string,
  headers: Record<string, string> = {},
): Promise<Rpc> => {
  const res = await fetch(`${running.base}/trpc/${path}`, { headers });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const mutate = async (
  running: Running,
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
): Promise<Rpc> => {
  const res = await fetch(`${running.base}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(superjson.serialize(input)),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const dataOf = (rpc: Rpc): unknown =>
  (rpc.body.result as { data?: { json?: unknown } } | undefined)?.data?.json;

const codeOf = (rpc: Rpc): unknown =>
  (rpc.body.error as { json?: { data?: { code?: unknown } } } | undefined)?.json?.data?.code;

describe("services/api is startable as a process (the seam to the product)", () => {
  let running: Running;
  let scripts: Scripts;
  let hash: string;
  let gateway: FakeGateway;

  beforeAll(async () => {
    scripts = await readScripts();
    hash = await hashPin(PASSWORD);
    gateway = await startFakeGateway();
    const start = scripts.start;
    if (start === undefined) throw new Error("package.json declares no `start` script");
    running = await startDeclaredScript(start, hash, gateway);
  }, 60_000);

  afterAll(async () => {
    running?.kill();
    await gateway?.close();
  });

  it("declares run scripts that both point at the composition root", () => {
    // The weakest assertion in the file, and it is here only to name WHICH script the rest of the
    // file executes — everything below runs the real thing. `dev` is asserted but not executed:
    // a watcher never exits, and what it adds over `start` is reload, not reachability.
    expect(scripts.start, "no `start` script — the service cannot be run").toBeDefined();
    expect(scripts.dev, "no `dev` script — `pnpm dev` is the documented startup").toBeDefined();
    expect(scripts.start).toContain("src/server.ts");
    expect(scripts.dev).toContain("src/server.ts");
  });

  it("serves tRPC over a real socket", async () => {
    const rpc = await query(running, "session.whoami");
    // Not 404, not a connection error: the tRPC plugin is mounted under `/trpc` in the running
    // process. The refusal is the next assertion's subject.
    expect(rpc.status).toBe(401);
  });

  it("refuses an unauthenticated request in the running process, not only under inject", async () => {
    expect(codeOf(await query(running, "session.whoami"))).toBe("UNAUTHORIZED");
    expect(codeOf(await query(running, "catalog.published"))).toBe("UNAUTHORIZED");
  });

  it("wired the env-seeded owner into the store the host serves from", async () => {
    // The decisive check that the composition root did WORK rather than merely bind a port: a
    // process that started but seeded nothing answers this with a refusal.
    const rpc = await mutate(running, "auth.login", { email: EMAIL, password: PASSWORD });
    expect(rpc.status, JSON.stringify(rpc.body)).toBe(200);
    expect(typeof (dataOf(rpc) as { token?: unknown }).token).toBe("string");

    // And the credential is real: the same store, checked against a wrong password.
    expect(codeOf(await mutate(running, "auth.login", { email: EMAIL, password: "wrong" }))).toBe(
      "UNAUTHORIZED",
    );
  });

  it("answers a can()-gated procedure for that owner, end to end over HTTP", async () => {
    const login = await mutate(running, "auth.login", { email: EMAIL, password: PASSWORD });
    const { token } = dataOf(login) as { token: string };
    const auth = { authorization: `Bearer ${token}` };

    const who = await query(running, "session.whoami", auth);
    expect(dataOf(who)).toEqual({
      user_id: `bootstrap-owner:${ORG}`,
      org_id: ORG,
      assignments: [{ role: "owner", branch_id: null }],
      /**
       * `11-F20`/`21-F15` — the person's name, `null` because this host's env declares no
       * `BOOTSTRAP_OWNER_NAME` (see `bootstrapUsers`). **The `toEqual` is kept exact rather than
       * loosened to `toMatchObject`**: this assertion's job is to pin the whole shape a client
       * receives, and `null` here is the load-bearing half — it proves `whoami` answers over a
       * socket with `SYNC_GATEWAY_URL` pointing at a CLOSED port, which is exactly the property
       * that keeps the org's name off this procedure and on `tenancy.directory`.
       */
      display_name: null,
    });

    // `catalog.published` is built with `authorized("catalog.edit_menu_prices")`, so a 200 here is
    // `domain`'s `can()` returning `allow` inside the spawned process — Commandment 8 on a socket.
    const published = await query(running, "catalog.published", auth);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(dataOf(published)).toMatchObject({ entries: [] });
  });

  it("stays up (a server that answers once and dies is not startable)", () => {
    expect(running.stderr()).toBe("");
    expect(() => process.kill(running.pid, 0)).not.toThrow();
  });

  it("builds a host without listening, so importing this module has no side effect", async () => {
    const app = await createApiServer({
      store: createMemoryUserStore([]),
      sessionSecret: SECRET,
      now: () => 1_760_000_000_000,
    });
    // The factory is separate from the composition root: everything including the boot gate has
    // run, and no socket exists.
    expect(app.server.listening).toBe(false);
    await app.close();
  });

  it("can be imported by another process without starting a server", async () => {
    // Decisive, and out of process: `start()` must run ONLY as the entry module. The probe passes
    // NO env at all, so a lost guard means `start()` runs, finds no `SESSION_SECRET`, and exits 1.
    const probe = join(tmpdir(), `restos-api-import-probe-${process.pid}.mts`);
    writeFileSync(
      probe,
      `const mod = await import(${JSON.stringify(join(PKG_DIR, "src", "server.ts"))});\n` +
        `console.log("PROBE_OK", typeof mod.createApiServer);\n`,
    );

    const runner = join(PKG_DIR, "node_modules", ".bin", "tsx");
    const result = await new Promise<{ code: number | null; out: string; err: string }>((done) => {
      // `SESSION_SECRET` deliberately absent, and `PORT` too. The environment is the assertion.
      const { SESSION_SECRET, PORT, ...clean } = process.env;
      const child = spawn(runner, [probe], { env: clean, stdio: ["ignore", "pipe", "pipe"] });
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
      child.on("close", (code) => {
        done({ code, out, err });
      });
    });

    expect(result.out, result.err).toContain("PROBE_OK function");
    expect(result.out).not.toContain(LISTENING_PREFIX);
    expect(result.code, result.err).toBe(0);
  }, 60_000);
});
