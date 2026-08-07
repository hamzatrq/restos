/**
 * **THE SEAM BETWEEN THIS SERVICE AND A RUNNING PROCESS — the tenth instance.**
 *
 * `services/sync-gateway` had 271 passing tests, a `start()` function, a boot-env validator and a
 * `/sync` socket, and **no way to run it**: `package.json` carried `test` and a `build` stub that
 * echoes a sentence. So the whole cloud sync end, the `/internal` publish surface and the device
 * WebSocket had never existed as a process, and the three-process stack (gateway → api → back
 * office) could not be brought up at all. That is this wave's recurring defect (AGENTS.md) at its
 * largest remaining scale, and `services/api` closed exactly this a month earlier — with an
 * ASSERTION, not just a fix, because eight prior instances taught that the fix alone regresses.
 *
 * So this file reads nothing's mind. It runs the **declared run script**, over a **real socket**,
 * in a **separate process**, and asks what only a running process can answer:
 *
 *   1. Does the command in `package.json` produce a listening server?
 *   2. Is the DEVICE surface live in it — does `/sync` accept a WebSocket upgrade?
 *   3. Is the `/internal` publish surface mounted, and is its credential actually checked there?
 *   4. Does it start with **no database at all**, and is an absent one a bounded, legible error
 *      rather than a hang? (`services/sync-gateway` needs Docker to be TESTED; it must not need
 *      Docker to be STARTED, or nobody can bring the stack up on a laptop.)
 *   5. Can the module be imported without a server appearing as a side effect?
 *
 * **Every assertion below is pointed at the case that matters, not at the mechanism** (round-3
 * law). In particular: 404-on-an-unknown-path is asserted beside 101-on-`/sync` and 401-on-
 * `/internal`, because a server that answered *everything* the same way would satisfy either of
 * those alone. And the database assertion checks the *elapsed time and the message*, because
 * "eventually errors" and "hangs for thirty seconds" are the same test result without a clock.
 *
 * `18 §14` names `tsx` as the dev runner; nothing here knows that — it executes whatever
 * `scripts.start` says, so this test follows a change of runner and fails a change to nothing.
 *
 * ⚠ **This file needs no Postgres, but the SUITE does** — `vitest.config.ts` starts one
 * Testcontainers Postgres in `globalSetup` for every file in the package (T-01-07: fail loudly,
 * never skip). Both spawned processes below are pointed at a deliberately CLOSED port instead, so
 * what they prove is independent of that container.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_PREFIX, LISTENING_PREFIX, PUBLISH_PREFIX } from "../server.js";

/**
 * ⚠ **Importing `../server.js` above is half of assertion 5, and it is why this comment exists
 * rather than a bare import.** `server.ts` runs `start()` only when it IS the entry module. Delete
 * that guard and importing it here runs the composition root, binds port 8080 and leaves a listener
 * behind for the whole run. The out-of-process probe at the bottom makes the same claim decisively.
 */

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** ≥32 bytes, which the boot validator enforces (`18 §5`). Fixtures; read by nothing else. */
const DEVICE_SECRET = "a-device-token-secret-of-at-least-32-bytes-for-the-startable-suite";
const PUBLISH_SECRET = "a-publish-credential-of-at-least-32-bytes-for-the-startable-suite";

/**
 * A password that must NEVER appear on stdout. The boot line names the database an operator has to
 * diagnose; `18 §5` says a connection password is the one part of it that may not reach a log.
 */
const DB_PASSWORD = "do-not-print-this-password";

type Scripts = Record<string, string | undefined>;

const readScripts = async (): Promise<Scripts> => {
  const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts?: Scripts }).scripts ?? {};
};

/**
 * A port with nothing behind it — bound, then released. An arbitrary constant risks hitting a real
 * Postgres on the developer's machine, which would make the "no database" assertions pass for the
 * wrong reason.
 */
const closedPort = async (): Promise<number> => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  await new Promise<void>((done, fail) => {
    probe.close((error) => (error === undefined ? done() : fail(error)));
  });
  return address.port;
};

type Running = {
  readonly base: string;
  readonly pid: number;
  readonly stdout: () => string;
  readonly kill: () => void;
};

/**
 * Runs `scripts.start` exactly as a package manager would — the command string through a shell,
 * from the package root, with the package's own `node_modules/.bin` on `PATH`. Executing the
 * DECLARED string rather than a hardcoded `tsx src/server.ts` is the point: a test that hardcodes
 * the command keeps passing after someone deletes the script, which is the state this service was
 * already in.
 *
 * `PORT=0` binds an ephemeral port, so the port is knowable ONLY from the boot line — which is what
 * makes that line load-bearing instead of decorative.
 */
const startDeclaredScript = async (
  script: string,
  env: Record<string, string>,
): Promise<Running> => {
  const child = spawn(script, {
    shell: true,
    cwd: PKG_DIR,
    // Its own process group: `shell: true` may leave the runner's child behind when the shell is
    // signalled, and an orphaned gateway holding a port outlives the suite.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
      PORT: "0",
      DEVICE_TOKEN_SECRET: DEVICE_SECRET,
      ...env,
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

    // A boot refusal — an invalid env or a failed bind — exits before it ever listens. Report WHY,
    // or every regression here looks like a timeout.
    child.on("exit", (code) => {
      settleFail(
        `\`${script}\` exited with ${code} before listening.\nstdout:\n${out}\nstderr:\n${err}`,
      );
    });
    child.on("error", (cause: Error) => {
      settleFail(`\`${script}\` could not be spawned: ${cause.message}`);
    });
  });

  // The advertised host is a wildcard bind, and on macOS the address Fastify returns is whichever
  // interface it enumerated first. Only the PORT is taken from the line; the loopback is what a
  // client on this machine actually dials.
  const port = new URL(address).port;
  expect(port, `boot line advertised no port: ${address}`).not.toBe("");
  return {
    base: `http://127.0.0.1:${port}`,
    pid: child.pid ?? -1,
    stdout: () => out,
    kill,
  };
};

type Answer = { status: number; body: string };

const get = async (
  running: Running,
  path: string,
  headers: Record<string, string> = {},
): Promise<Answer> => {
  const res = await fetch(`${running.base}${path}`, { headers });
  return { status: res.status, body: await res.text() };
};

/**
 * A real RFC 6455 opening handshake over `node:http`, rather than a `ws` client. `@fastify/websocket`
 * answers `101 Switching Protocols` only if `/sync` is genuinely registered as a websocket route in
 * the RUNNING process; a plain `GET` would get a 404 from a correctly-mounted socket route too, so
 * it could not tell "mounted" from "missing".
 */
const upgradeStatus = (running: Running, path: string): Promise<number> =>
  new Promise((done, fail) => {
    const req = request(`${running.base}${path}`, {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": randomBytes(16).toString("base64"),
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      done(res.statusCode ?? 0);
    });
    req.on("response", (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    req.on("error", fail);
    req.end();
  });

describe("services/sync-gateway is startable as a process (the seam to the product)", () => {
  let scripts: Scripts;
  /** Configured: a publish credential, and a database address with nothing behind it. */
  let configured: Running;
  /** The same process with NO `PUBLISH_TOKEN` — `/internal`'s fail-closed half. */
  let unconfigured: Running;
  let deadDbPort: number;

  beforeAll(async () => {
    scripts = await readScripts();
    const start = scripts.start;
    if (start === undefined) throw new Error("package.json declares no `start` script");
    deadDbPort = await closedPort();
    const dbUrl = `postgres://gateway:${DB_PASSWORD}@127.0.0.1:${deadDbPort}/absent`;
    configured = await startDeclaredScript(start, {
      DATABASE_URL: dbUrl,
      PUBLISH_TOKEN: PUBLISH_SECRET,
    });
    unconfigured = await startDeclaredScript(start, { DATABASE_URL: dbUrl });
  }, 90_000);

  afterAll(() => {
    configured?.kill();
    unconfigured?.kill();
  });

  it("declares run scripts that both point at the composition root", () => {
    // The weakest assertion in the file, and it is here only to name WHICH script the rest of the
    // file executes — everything below runs the real thing. `dev` is asserted but not executed: a
    // watcher never exits, and what it adds over `start` is reload, not reachability.
    expect(scripts.start, "no `start` script — the service cannot be run").toBeDefined();
    expect(scripts.dev, "no `dev` script — `pnpm dev` is the documented startup").toBeDefined();
    expect(scripts.start).toContain("src/server.ts");
    expect(scripts.dev).toContain("src/server.ts");
  });

  it("serves the DEVICE socket: /sync completes a WebSocket upgrade in the running process", async () => {
    expect(await upgradeStatus(configured, "/sync")).toBe(101);
  });

  it("serves the /internal publish surface, and checks its credential THERE", async () => {
    // Mounted (not a 404) and refusing (not a 200): both halves, because either alone is satisfied
    // by a server that has the route and no check, or a check and no route.
    expect((await get(configured, "/internal/catalog/published?org_id=org-x")).status).toBe(401);
    expect(
      (
        await get(configured, "/internal/catalog/published?org_id=org-x", {
          authorization: "Bearer wrong-credential-of-a-different-length-entirely",
        })
      ).status,
    ).toBe(401);
  });

  it("still 404s an unknown path — so the two assertions above are about ROUTES", async () => {
    // The control. A process answering 101 to everything, or 401 to everything, passes both tests
    // above and fails this one alone.
    expect((await get(configured, "/nope")).status).toBe(404);
    expect(await upgradeStatus(configured, "/nope")).toBe(404);
  });

  it("fail-closed: with no PUBLISH_TOKEN every /internal route answers 503 and names the key", async () => {
    const answer = await get(unconfigured, "/internal/catalog/published?org_id=org-x", {
      authorization: `Bearer ${PUBLISH_SECRET}`,
    });
    // Not 401 and not 200: a gateway that was never told the credential accepts no menu at all,
    // rather than accepting one from anyone who can reach the port.
    expect(answer.status).toBe(503);
    expect(answer.body).toContain("PUBLISH_TOKEN");
    // And it said so at BOOT, where someone bringing the stack up can see it — the 503 alone
    // surfaces only in another service's logs.
    expect(unconfigured.stdout()).toContain(PUBLISH_PREFIX);
    expect(unconfigured.stdout()).toContain("DISABLED");
  });

  /**
   * **REQUIREMENT: it must not need Docker to START.** Both processes above are already running
   * against a database that does not exist — the boot line is proof on its own. What this adds is
   * the other half: the absent database must surface as a bounded, legible error on the first
   * request that needs one, never as a hang and never as a shrug.
   */
  it("starts with NO database, and an absent one is a fast, named error rather than a hang", async () => {
    const began = Date.now();
    const answer = await get(configured, "/internal/catalog/published?org_id=org-x", {
      authorization: `Bearer ${PUBLISH_SECRET}`,
    });
    const elapsed = Date.now() - began;

    expect(answer.status).toBe(500);
    // The dependency is NAMED. Fastify's default 500 body says "Internal Server Error" and nothing
    // else, and `services/api` parses that field, so an unnamed fault travels three services as a
    // shrug.
    expect(answer.body).toContain("database");
    // The actual reason, from the CAUSE chain — `DrizzleQueryError.message` is only the SQL.
    expect(answer.body).toContain("ECONNREFUSED");
    expect(answer.body).toContain(String(deadDbPort));
    // It is an infrastructure state, said in those words, so nobody reads it as a bad request.
    expect(answer.body).toMatch(/infrastructure state/i);
    // Bounded. Generous by two orders of magnitude — this is a hang detector, not a latency budget.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("names the database it will use at boot — with the password removed", async () => {
    const out = configured.stdout();
    expect(out).toContain(DATABASE_PREFIX);
    expect(out).toContain(String(deadDbPort));
    // `18 §5`: the host, port and database name are what an operator needs; the password is the one
    // part that may never reach a log.
    expect(out).not.toContain(DB_PASSWORD);
  });

  it("stays up (a server that answers once and dies is not startable)", async () => {
    expect(() => process.kill(configured.pid, 0)).not.toThrow();
    // And still answers — a liveness check that only asks the OS is satisfied by a wedged process.
    expect(await upgradeStatus(configured, "/sync")).toBe(101);
  });

  it("can be imported by another process without starting a server", async () => {
    // Decisive, and out of process: `start()` must run ONLY as the entry module. The probe passes
    // NO gateway env at all, so a lost guard means `start()` runs, finds no `DEVICE_TOKEN_SECRET`,
    // and exits 1.
    const probe = join(tmpdir(), `restos-gateway-import-probe-${process.pid}.mts`);
    writeFileSync(
      probe,
      `const mod = await import(${JSON.stringify(join(PKG_DIR, "src", "server.ts"))});\n` +
        `console.log("PROBE_OK", typeof mod.buildServer);\n`,
    );

    const runner = join(PKG_DIR, "node_modules", ".bin", "tsx");
    const result = await new Promise<{ code: number | null; out: string; err: string }>((done) => {
      const { DEVICE_TOKEN_SECRET, DATABASE_URL, PUBLISH_TOKEN, PORT, ...clean } = process.env;
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
