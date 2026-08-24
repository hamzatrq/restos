/**
 * ACCEPTANCE — `06-F32`/`06-F34`: **a customer can actually reach this service.**
 *
 * ⚠ **THE SPINE WAS UNREACHABLE AND EVERY GATE WAS GREEN.** The first version of `server.ts`
 * built a Fastify app, registered exactly one route (`GET /health`), and passed `storefrontRouter`
 * to the boot assertion **and to nothing else**. Measured against the running dev host:
 *
 *     POST /health -> 404 · POST /trpc/placeOrder -> 404 · POST /placeOrder -> 404 · POST /trpc -> 404
 *
 * There was no path by which any customer could place or cancel an order; `placement`, `origin`,
 * `outbox` and `entitled` executed only under vitest. `seams:check` was clean throughout, exactly
 * as `L8` predicts — every export is imported by something, and the chain simply terminates.
 * `startable.test.ts` proved *"this service can be started"*; nothing proved *"a customer can
 * reach it"*, and those are different claims.
 *
 * So this file drives **real HTTP** at the shipped mount, and asserts the events land in the
 * outbox the server was HANDED — the seam mutant `L7` prescribes (`outbox: inMemoryOutbox()`
 * inside `createStorefrontServer` passed the whole suite 31/31 before this file existed).
 */
import { request } from "node:http";
import type { EventEnvelopeT } from "@restos/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STOREFRONT_CAPABILITY } from "../entitlement.js";
import type { LamportSource } from "../origin.js";
import type { Outbox } from "../outbox.js";
import { createStorefrontServer, orgForHost } from "../server.js";
import { fixedCatalog } from "./catalog-fixture.js";

const ORG = "org-karachi";
const BRANCH = "branch-clifton";
const DEVICE = "device-storefront-clifton";
const HOST = "burger-house.restos.pk";

/** The outbox the SERVER is handed. Nothing else may end up holding the events. */
const recordingOutbox = () => {
  const stored: EventEnvelopeT[] = [];
  const outbox: Outbox & { all: () => readonly EventEnvelopeT[] } = {
    put: async (events) => {
      stored.push(...events);
    },
    pending: async () => [...stored],
    ack: async () => {},
    all: () => [...stored],
  };
  return outbox;
};

const lamport = (): LamportSource => {
  let next = 0;
  return {
    reserve: async (n) => {
      const first = next;
      next += n;
      return first;
    },
  };
};

let server: ReturnType<typeof createStorefrontServer>;
let port: number;
let outbox: ReturnType<typeof recordingOutbox>;

const CART = {
  order_id: "order-web-1",
  lines: [{ line_id: "l1", item_id: "item-burger", qty: 1 }],
};

beforeEach(async () => {
  process.env.RESTOS_ORG_ID = ORG;
  process.env.RESTOS_BRANCH_ID = BRANCH;
  process.env.RESTOS_DEVICE_ID = DEVICE;
  process.env.RESTOS_STOREFRONT_HOST = HOST;
  outbox = recordingOutbox();
  server = createStorefrontServer({
    outbox,
    catalog: fixedCatalog({ "item-burger": 45_000 }),
    entitlement: async (org_id) =>
      org_id === ORG
        ? { status: "record", record: { capabilities: new Set([STOREFRONT_CAPABILITY]) } }
        : { status: "absent" },
    lamport: lamport(),
  });
  port = await server.listen();
});

afterEach(async () => {
  await server.close();
});

/**
 * ⚠ **`fetch` CANNOT SEND THIS REQUEST.** `Host` is a forbidden header name in undici: it is
 * overwritten with the URL authority, so every request arrived as `127.0.0.1:<port>` and the
 * first version of this file measured its own 404 rather than the service's. `06-F1` resolution
 * is a `Host` test, so the transport has to be one that lets a caller set it — which a real
 * customer's browser does by connecting to a name, and a reverse proxy does by forwarding one.
 */
const post = (
  path: string,
  body: unknown,
  host = HOST,
): Promise<{ status: number; text: string }> => {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          host,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += String(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM: a real request reaches the origin, and the events land in the handed outbox.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 06-F32 — the router is SERVED, and the outbox it was handed is the one that fills", () => {
  it("POST /trpc/placeOrder writes `order.created` + its line into the handed outbox", async () => {
    const response = await post("/trpc/placeOrder", CART);
    expect(response.status, response.text).toBe(200);
    expect(JSON.parse(response.text)).toMatchObject({
      result: { data: { order_id: CART.order_id } },
    });

    // The seam. `outbox: inMemoryOutbox()` inside `createStorefrontServer` — a real deployment
    // passing a durable outbox and having it silently discarded — reddens exactly here.
    expect(outbox.all().map((e) => e.type)).toEqual(["order.created", "order.line_added"]);
    for (const event of outbox.all()) {
      expect(event.org_id).toBe(ORG);
      expect(event.branch_id).toBe(BRANCH);
      expect(event.device_id).toBe(DEVICE);
    }
  });

  it("the price on the wire is the CATALOG's, through the real transport (06-F33)", async () => {
    await post("/trpc/placeOrder", {
      order_id: "order-web-2",
      lines: [{ line_id: "l1", item_id: "item-burger", qty: 1, unit_price_paisa: 1 }],
    });
    const line = outbox.all().find((e) => e.type === "order.line_added");
    expect(line).toBeDefined();
    expect((line as EventEnvelopeT).payload as { unit_price_paisa: number }).toMatchObject({
      unit_price_paisa: 45_000,
    });
  });

  it("06-F19's cancel is served too — both doors exist, not just the one", async () => {
    const response = await post("/trpc/cancelOrder", {
      order_id: CART.order_id,
      reason: "changed my mind",
    });
    expect(response.status, response.text).toBe(200);
    expect(outbox.all().map((e) => e.type)).toEqual(["order.cancelled"]);
  });

  it("/health still answers, and it is not the only thing that does", async () => {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 06-F1/06-F34 (a): the tenant comes from the HOST, and an unknown host is a neutral 404.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 06-F1/06-F34 (a) — host resolution, and what an unknown host is told", () => {
  it("an unknown host gets 404 and writes NOTHING", async () => {
    const response = await post("/trpc/placeOrder", CART, "someone-elses-restaurant.pk");
    expect(response.status).toBe(404);
    expect(
      outbox.all(),
      "06-F1: never another org's data — and never another org's ledger",
    ).toEqual([]);
  });

  it("the 404 is NEUTRAL — it names no org, no branch and no reason", async () => {
    // A 404 that explains itself is a tenant-existence oracle for anyone who can send a request.
    const body = (await post("/trpc/placeOrder", CART, "probe.example")).text;
    for (const secret of [ORG, BRANCH, DEVICE, HOST]) expect(body).not.toContain(secret);
  });

  it("the port is stripped before the comparison — a deployment off :443 still matches", () => {
    expect(orgForHost(server.identity, `${HOST}:8080`)).toBe(ORG);
    expect(orgForHost(server.identity, HOST.toUpperCase())).toBe(ORG);
    expect(orgForHost(server.identity, undefined)).toBeNull();
    expect(orgForHost(server.identity, `evil.${HOST}`)).toBeNull();
    expect(
      orgForHost(server.identity, "burger-house.restos.pk.attacker.example"),
      "a suffix match would serve every host somebody can register",
    ).toBeNull();
  });
});
