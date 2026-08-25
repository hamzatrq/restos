/**
 * ACCEPTANCE — `06-F37`: **what a stranger on the public internet learns from a refusal.**
 *
 * ⚠ **REPRODUCED ON THE SHIPPING SERVICE (2026-08-25).** Every refusal on the unauthenticated
 * `POST /trpc/placeOrder` came back carrying the full Node stack:
 *
 *     "stack": "UnpricedItemsError: … \n    at Object.placeOrder
 *       (/opt/apps/restos/restos/.../services/storefront/src/origin.ts:206:36)\n
 *        at async resolveMiddleware (/opt/.../node_modules/.pnpm/@trpc+server@11.18.0_…/…)"
 *
 * — absolute repository paths and the `node_modules` layout — and **`06-F1`'s 404 leaked one
 * too**, naming `server.ts:113`. The status code was neutral; the body was a map.
 *
 * §A and §B are unit-level over the shipped formatter. §C drives REAL HTTP at the shipped mount
 * and asserts on the BYTES, because the formatter being correct and the router using it are two
 * different claims — this file's own instance of `L7`.
 */
import { request } from "node:http";
import type { EventEnvelopeT } from "@restos/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CatalogUnreadableError } from "../catalog.js";
import { STOREFRONT_CAPABILITY } from "../entitlement.js";
import { type LamportSource, UnpricedItemsError } from "../origin.js";
import type { Outbox } from "../outbox.js";
import { CrossTenantError, EntitlementUnreadableError, NotEntitledError } from "../placement.js";
import { NEUTRAL_REFUSAL, publicErrorShape, publicMessage } from "../refusal.js";
import { createStorefrontServer } from "../server.js";
import { fixedCatalog } from "./catalog-fixture.js";

describe("A — `06-F37` (b): the allowlist, pinned", () => {
  it("passes `UnpricedItemsError` verbatim — `06-F33` requires it to name the items", () => {
    const error = new UnpricedItemsError(["item-ghost", "item-phantom"]);
    expect(publicMessage(error)).toBe(error.message);
    expect(publicMessage(error)).toContain("item-ghost");
  });

  it("neutralises every OTHER refusal this service authors", () => {
    // ⚠ Each of these carries something a public caller must not have: two org ids, a commercial
    // state of the restaurant's account, or the gateway's address and HTTP status.
    const refusals: readonly Error[] = [
      new CrossTenantError("org-victim", "org-mine"),
      new NotEntitledError("org-mine"),
      new EntitlementUnreadableError("org-mine"),
      new CatalogUnreadableError("http://sync-gateway:8080 unreachable: ECONNREFUSED"),
    ];
    for (const error of refusals) {
      expect(publicMessage(error)).toBe(NEUTRAL_REFUSAL);
    }
  });

  it("neutralises an error this service did NOT author, whatever shape it is", () => {
    // The class the allowlist exists for: a driver error carrying a connection string.
    expect(
      publicMessage(new Error("connect ECONNREFUSED postgres://sf:hunter2@10.0.0.7:5432/orders")),
    ).toBe(NEUTRAL_REFUSAL);
    // And a total function: nothing here may throw on the refusal path (`01-F17`).
    expect(publicMessage("a thrown string")).toBe(NEUTRAL_REFUSAL);
    expect(publicMessage(null)).toBe(NEUTRAL_REFUSAL);
    expect(publicMessage(undefined)).toBe(NEUTRAL_REFUSAL);
    expect(publicMessage({ message: "not an Error" })).toBe(NEUTRAL_REFUSAL);
  });

  it("does not widen by inheritance — a subclass of Error is not an allowlist member", () => {
    class LooksOfficialError extends Error {}
    expect(publicMessage(new LooksOfficialError("internal hostname: sf-01.internal"))).toBe(
      NEUTRAL_REFUSAL,
    );
  });
});

describe("B — `06-F37` (a): the shape carries no stack and no procedure name", () => {
  it("drops `stack` and `path`, keeps the code and httpStatus", () => {
    const shaped = publicErrorShape({
      shape: {
        code: -32603,
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          stack: "Error: x\n    at /opt/apps/restos/services/storefront/src/origin.ts:206:36",
          path: "placeOrder",
        },
      },
      error: new Error("internal"),
    });
    expect(shaped.data).not.toHaveProperty("stack");
    expect(shaped.data).not.toHaveProperty("path");
    expect(shaped.data.httpStatus).toBe(500);
    expect(shaped.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(shaped.message).toBe(NEUTRAL_REFUSAL);
  });
});

// ── §C: real HTTP through the shipped mount ─────────────────────────────────
const ORG = "org-karachi";
const BRANCH = "branch-clifton";
const DEVICE = "device-storefront-clifton";
const HOST = "burger-house.restos.pk";

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

beforeEach(async () => {
  process.env.RESTOS_ORG_ID = ORG;
  process.env.RESTOS_BRANCH_ID = BRANCH;
  process.env.RESTOS_DEVICE_ID = DEVICE;
  process.env.RESTOS_STOREFRONT_HOST = HOST;
  const stored: EventEnvelopeT[] = [];
  const outbox: Outbox = {
    put: async (events) => {
      stored.push(...events);
    },
    pending: async () => [...stored],
    ack: async () => {},
  };
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

/** ⚠ `fetch` cannot set `Host` (undici forbids it), so `06-F1` needs the raw client. */
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
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
};

/** Everything a stack trace gave away, as literal substrings of the response body. */
const LEAKS = [
  "/opt/apps/restos",
  "node_modules",
  ".pnpm",
  "origin.ts",
  "server.ts",
  "placement.ts",
  "    at ",
  "@trpc/server",
] as const;

describe("C — over REAL HTTP, on the bytes a customer receives", () => {
  it("an unpriced cart: no stack, no path, and the items are still named (`06-F33`)", async () => {
    const res = await post("/trpc/placeOrder", {
      lines: [{ line_id: "l1", item_id: "item-ghost", qty: 1 }],
    });
    expect(res.text).not.toContain('"stack"');
    for (const leak of LEAKS) expect(res.text).not.toContain(leak);
    expect(res.text).toContain("item-ghost");
  });

  it("`06-F1`'s 404 leaks nothing either — it was the worst of them", async () => {
    const res = await post(
      "/trpc/placeOrder",
      { lines: [{ line_id: "l1", item_id: "item-burger", qty: 1 }] },
      "someone-else.pk",
    );
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('"stack"');
    for (const leak of LEAKS) expect(res.text).not.toContain(leak);
    // `06-F1`: neutral. It names no org, and it does not say why.
    expect(res.text).not.toContain(ORG);
    expect(res.text).not.toContain(BRANCH);
    expect(res.text).not.toContain(HOST);
    expect(res.text).toContain(NEUTRAL_REFUSAL);
  });

  it("a malformed body: the schema's own complaint carries no stack", async () => {
    const res = await post("/trpc/placeOrder", { lines: [] });
    expect(res.text).not.toContain('"stack"');
    for (const leak of LEAKS) expect(res.text).not.toContain(leak);
  });

  it("`06-F37` (c): the STATUS mapping is untouched", async () => {
    const refused = await post("/trpc/placeOrder", {
      lines: [{ line_id: "l1", item_id: "item-ghost", qty: 1 }],
    });
    // Still tRPC's default for an unmapped throw. Choosing a customer-facing status is owed to
    // `apps/storefront`; this FR closes the leak and deliberately not the taxonomy.
    expect(refused.status).toBe(500);
  });

  it("a successful order is unaffected — the formatter is on the error path only", async () => {
    const res = await post("/trpc/placeOrder", {
      lines: [{ line_id: "l1", item_id: "item-burger", qty: 1 }],
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text).result.data.order_id).toEqual(expect.any(String));
  });
});
