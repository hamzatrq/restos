/**
 * ACCEPTANCE — `06-F36`: **THE SEAM. An order placed through the SHIPPED START PATH reaches a
 * gateway.**
 *
 * ⚠ **THIS IS THE FILE THE WHOLE FR EXISTS FOR, AND EVERY OTHER TEST IN THIS PACKAGE PASSED WHILE
 * THE DEFECT WAS LIVE.** Measured on a real stack, 2026-08-25, before any of this landed: three
 * carts posted to the running dev host each returned `200 {"order_id":…}`, and
 * `select device_id, count(*) from kernel.events group by 1` returned **`(0 rows)`**. The origin
 * was correct, the outbox port was correct, the gate was correct, `seams:check` was clean, and
 * nothing connected them — `L8`, this module's turn.
 *
 * So this file spawns the **DECLARED** `pnpm start`, stands a real WebSocket gateway in front of
 * it, and asserts the bytes arrive. Three properties no other test in this package can hold:
 *
 *  - **the uplink is CONSTRUCTED and STARTED by the shipping host** (`uplink.test.ts` builds its
 *    own — `L10`'s "a seam test that mounts its own wiring survives the mutant that matters", which
 *    this repository has already paid for once inside a fix for this same defect);
 *  - **`06-F36` (e), the WAKE**: the order is placed *after* `hello_ack`, so a host that drains only
 *    at connect pushes nothing. That is verbatim the `apps/pos-electron` defect —
 *    `notifyAppended` with zero production callers, a till that "pushed its outbox at connect and
 *    never again";
 *  - **the write-checkpoint is applied**: after `push_ack` the durable outbox is clear.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { DATABASE_URL_ENV } from "./global-setup.js";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

const outboxUrl = (): string => {
  const value = process.env[DATABASE_URL_ENV];
  if (value === undefined) throw new Error("global-setup did not publish a database url");
  return value;
};

let seq = 0;
const freshOrigin = () => {
  seq += 1;
  return {
    RESTOS_ORG_ID: `org-drain-${seq}-${process.pid}`,
    RESTOS_BRANCH_ID: `branch-drain-${seq}-${process.pid}`,
    RESTOS_DEVICE_ID: `device-storefront-drain-${seq}`,
    RESTOS_STOREFRONT_HOST: "burger-house.restos.pk",
  };
};

type Frame = { kind: string; [key: string]: unknown };

/**
 * A gateway that speaks just enough of `01-F8`: it serves the published catalog over HTTP and
 * answers `hello` and `push` on `/sync`. **It acks nothing it was not sent** — `push_ack` echoes
 * the watermark the client claimed, so a client that claims one it did not send is visible.
 */
const fakeGateway = async (branch_id: string) => {
  const received: Frame[] = [];
  const http: Server = createServer((req, res) => {
    if ((req.url ?? "").startsWith("/internal/catalog/published")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          version: 3,
          entries: [
            {
              kind: "item",
              id: "item-burger",
              name: "Zinger Burger",
              prices: [{ branch_id, channel: "storefront", price_paisa: 45_000 }],
            },
          ],
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server: http, path: "/sync" });
  wss.on("connection", (socket) => {
    socket.on("message", (raw: Buffer) => {
      const message = JSON.parse(raw.toString("utf8")) as Frame;
      received.push(message);
      if (message.kind === "hello") {
        socket.send(
          JSON.stringify({ v: 2, kind: "hello_ack", session_id: "s1", hub: false, resume_from: 0 }),
        );
        return;
      }
      if (message.kind === "push") {
        socket.send(
          JSON.stringify({ v: 2, kind: "push_ack", acked_watermark: message.watermark as number }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;
  return {
    port,
    received,
    pushes: () => received.filter((m) => m.kind === "push"),
    close: async () => {
      // ⚠ TERMINATE the sockets first. `http.close()` waits for open connections, and the
      // storefront's uplink holds one open by design — the first version of this file hung its
      // `afterEach` for the full 120 s hook timeout on every case.
      for (const socket of wss.clients) socket.terminate();
      wss.close();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
};

const bootedPort = (child: ChildProcess): Promise<number> =>
  new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`no boot line in 60 s:\n${out}`)), 60_000);
    const scan = (chunk: Buffer) => {
      out += chunk.toString();
      const match = out.match(/on :(\d+)/);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout?.on("data", scan);
    child.stderr?.on("data", scan);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`exited ${code} before booting:\n${out}`));
    });
  });

/** ⚠ `fetch` cannot set `Host` (undici forbids it), and `06-F1` resolves the tenant from it. */
const order = (
  port: number,
  line_id: string,
): Promise<{ status: number; body: { result?: { data?: { order_id?: string } } } }> =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify({ lines: [{ line_id, item_id: "item-burger", qty: 1 }] });
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/trpc/placeOrder",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          host: "burger-house.restos.pk",
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          text += c;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(text || "{}") }),
        );
      },
    );
    req.on("error", reject);
    req.end(payload);
  });

/**
 * ⚠ **KILLS THE PROCESS GROUP, NOT THE CHILD — measured, 2026-08-25.** `spawn("pnpm", …)` starts a
 * package-manager wrapper that starts `tsx`, and it is `tsx` that holds `06-F30`'s origin lock. A
 * plain `child.kill("SIGKILL")` reaps only the wrapper, so the restart case below spawned a
 * replacement while the "dead" host was very much alive, and read the FR's own refusal as a
 * failure. `detached: true` puts both in one group so a negative pid reaches both.
 */
const killGroup = (child: ChildProcess): void => {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
};

const until = async (predicate: () => boolean, label: string): Promise<void> => {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for: ${label}`);
};

let gateway: Awaited<ReturnType<typeof fakeGateway>>;
let child: ChildProcess | null = null;
let origin: ReturnType<typeof freshOrigin>;

beforeEach(async () => {
  origin = freshOrigin();
  gateway = await fakeGateway(origin.RESTOS_BRANCH_ID);
});

afterEach(async () => {
  if (child !== null) killGroup(child);
  child = null;
  await gateway.close();
});

const boot = async (): Promise<number> => {
  child = spawn("pnpm", ["start"], {
    cwd: packageRoot,
    env: {
      ...process.env,
      PORT: "0",
      ...origin,
      RESTOS_GATEWAY_URL: `http://127.0.0.1:${gateway.port}`,
      RESTOS_GATEWAY_TOKEN: "service-credential",
      DATABASE_URL: outboxUrl(),
      RESTOS_CLOUD_URL: `ws://127.0.0.1:${gateway.port}/sync`,
      RESTOS_DEVICE_TOKEN: "device-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return bootedPort(child);
};

describe("`06-F36` — the shipped start path delivers an order to the gateway", () => {
  it("hellos on its own, as this origin and this device class", async () => {
    await boot();
    await until(
      () => gateway.received.some((m) => m.kind === "hello"),
      "the shipping host to hello",
    );
    const hello = gateway.received.find((m) => m.kind === "hello") as Frame;
    expect(hello.device_id).toBe(origin.RESTOS_DEVICE_ID);
    expect(hello.branch_id).toBe(origin.RESTOS_BRANCH_ID);
    expect(hello.device_class).toBe("storefront_cloud");
    expect(hello.token).toBe("device-token");
  });

  /**
   * ⚠ **THE ONE. The order is placed AFTER the session is up**, so a host that drains only at
   * connect — `06-F36` (e)'s named failure, shipped once already in `apps/pos-electron` — pushes
   * nothing and this fails. Deleting `durable.onPut(() => uplink.notifyAppended())` from
   * `server.ts` leaves every other test in this package green.
   */
  it("pushes an order placed AFTER hello — the WAKE, `06-F36` (e)", async () => {
    const port = await boot();
    await until(() => gateway.received.some((m) => m.kind === "hello"), "hello");
    expect(gateway.pushes()).toHaveLength(0);

    const placed = await order(port, "l1");
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);

    await until(() => gateway.pushes().length > 0, "a push carrying the order");
    const push = gateway.pushes()[0] as Frame & {
      events: Array<{ type: string; payload: Record<string, unknown>; lamport_seq: number }>;
      watermark: number;
    };
    expect(push.events.map((e) => e.type)).toEqual(["order.created", "order.line_added"]);
    // `06-F33`: the price is the CATALOG's, and it travelled the whole way.
    expect(push.events[1]?.payload.unit_price_paisa).toBe(45_000);
    expect(push.watermark).toBe(push.events[1]?.lamport_seq);
  });

  it("applies the write-checkpoint: the durable outbox clears on `push_ack`", async () => {
    const port = await boot();
    await until(() => gateway.received.some((m) => m.kind === "hello"), "hello");
    await order(port, "l1");
    await until(() => gateway.pushes().length > 0, "a push");

    const db = postgres(outboxUrl(), { max: 1, onnotice: () => {} });
    try {
      let unacked = -1;
      for (let i = 0; i < 200; i += 1) {
        const rows = await db`
          select count(*)::int as n from storefront.outbox
           where org_id = ${origin.RESTOS_ORG_ID} and acked = false`;
        unacked = Number(rows[0]?.n);
        if (unacked === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(unacked).toBe(0);
      // And the rows are still there — `01-F1`, and a send is not an ack.
      const total = await db`
        select count(*)::int as n from storefront.outbox where org_id = ${origin.RESTOS_ORG_ID}`;
      expect(Number(total[0]?.n)).toBe(2);
    } finally {
      await db.end({ timeout: 5 });
    }
  });

  /**
   * Commandment 4 / `00 §5.1`, through the shipped binary: *"cloud-originated orders queue for the
   * branch and enter the moment connectivity returns"* — and the queue survives the process that
   * accepted them, which is the half the boot banner used to disclaim in so many words.
   */
  it("a RESTART delivers what the dead process accepted", async () => {
    // Boot with the uplink pointed at nothing, so the order is priced but cannot be delivered.
    child = spawn("pnpm", ["start"], {
      cwd: packageRoot,
      env: {
        ...process.env,
        PORT: "0",
        ...origin,
        RESTOS_GATEWAY_URL: `http://127.0.0.1:${gateway.port}`,
        RESTOS_GATEWAY_TOKEN: "service-credential",
        DATABASE_URL: outboxUrl(),
        RESTOS_CLOUD_URL: "ws://127.0.0.1:59998/sync",
        RESTOS_DEVICE_TOKEN: "device-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const port = await bootedPort(child);
    const placed = await order(port, "l1");
    expect(placed.status).toBe(200);
    const orderId = placed.body.result?.data?.order_id;
    expect(orderId).toEqual(expect.any(String));
    expect(gateway.pushes()).toHaveLength(0);

    // The restart that used to lose it — a real SIGKILL of the whole group, not a clean close.
    killGroup(child);
    await new Promise((resolve) => setTimeout(resolve, 500));
    child = null;

    await boot();
    await until(() => gateway.pushes().length > 0, "the reborn process to drain the backlog");
    const push = gateway.pushes()[0] as Frame & {
      events: Array<{ payload: Record<string, unknown> }>;
    };
    expect(push.events[0]?.payload.order_id).toBe(orderId);
  });
});
