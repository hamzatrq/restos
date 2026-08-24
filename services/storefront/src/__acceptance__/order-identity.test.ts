/**
 * ACCEPTANCE — `06-F35`: **the customer does not choose which order she is adding to.**
 *
 * ⚠ **THIS IS `06-F33`'s DEFECT ONE FIELD OVER, AND THE PRICE SUITE COULD NOT SEE IT.** `06-F33`
 * made *"name a price"* unrepresentable; nothing made *"name an order"* unrepresentable, and the
 * origin holds no state and reads none (`06-F30`), so it emitted `order.created` plus a line per
 * request for whatever `order_id` the public body carried. Reproduced over real HTTP into a real
 * `packages/sync-client` fold before the fix:
 *
 *     place web-1 (1 × item-burger)                         -> 200
 *     cashier accepts  (order.confirmed)
 *     BEFORE  confirmed_at=1755000050000  lines={l1: qty 1 @ 45000}   kitchen lines_total=1
 *     POST /trpc/placeOrder {"order_id":"web-1","lines":[{"line_id":"stranger",…,"qty":20}]}
 *                                                            -> 200
 *     AFTER   confirmed_at=1755000050000
 *             lines={l1: qty 1 @ 45000, stranger: qty 20 @ 45000}  exceptions=[]  lines_total=2
 *
 * Rs 9,000 onto a stranger's CONFIRMED bill, no anomaly raised, the kitchen told to cook it, and
 * `01-F1` to keep it for ever. `06-N4` names *"id guessing"* as a probe that must return nothing.
 *
 * The property under test is **unrepresentability again**, so the assertions are aimed at the two
 * ways it comes back: a schema that accepts the field again (§A1/§A2), and an origin that prefers
 * a caller's id to its own (§A5, cast past the type — the shape that survived a mutant in the
 * price suite for exactly this reason). §B pins what the mint does NOT close.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EventEnvelopeT } from "@restos/domain";
import { openStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STOREFRONT_CAPABILITY } from "../entitlement.js";
import { originIdentity } from "../identity.js";
import { createStorefrontOrigin, type LamportSource } from "../origin.js";
import { inMemoryOutbox, type Outbox } from "../outbox.js";
import { createPlacement } from "../placement.js";
import { storefrontRouter } from "../router.js";
import { createStorefrontServer } from "../server.js";
import { fixedCatalog } from "./catalog-fixture.js";

const ORG = "org-karachi";
const BRANCH = "branch-clifton";
const DEVICE = "device-storefront-clifton";
const TILL_DEVICE = "device-counter-1";
const HOST = "burger-house.restos.pk";

const IDENTITY = originIdentity({
  org_id: ORG,
  branch_id: BRANCH,
  device_id: DEVICE,
  public_host: HOST,
});

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

const CART = { lines: [{ line_id: "l1", item_id: "item-burger", qty: 1 }] };

const placementOn = () => {
  const outbox = inMemoryOutbox();
  const placement = createPlacement({
    origin: createStorefrontOrigin({
      identity: IDENTITY,
      catalog: fixedCatalog({ "item-burger": 45_000 }),
      lamport: lamport(),
      clock: () => 1_755_000_000_000,
      newId: () => randomUUID(),
    }),
    outbox,
    entitlement: async () => ({
      status: "record",
      record: { capabilities: new Set([STOREFRONT_CAPABILITY]) },
    }),
  });
  return { placement, outbox };
};

const orderIdsIn = (outbox: ReturnType<typeof inMemoryOutbox>): string[] =>
  outbox.all().map((e) => (e.payload as { order_id: string }).order_id);

const inputSchema = (procedure: "placeOrder" | "cancelOrder") =>
  (
    storefrontRouter._def.procedures[procedure] as {
      _def: { inputs: Array<{ parse: (v: unknown) => unknown }> };
    }
  )._def.inputs[0] as { parse: (v: unknown) => unknown };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — the request cannot name an order, and the origin's id is the one that lands.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 06-F35 — `order_id` is not a field of the request", () => {
  it("the parsed cart has no order key at all — the field is STRIPPED, not read", () => {
    const parsed = inputSchema("placeOrder").parse({
      order_id: "web-1",
      lines: CART.lines,
    }) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["lines"]);
    expect(
      parsed.order_id,
      "an order key on the wire is an order key a later session trusts (06-F35)",
    ).toBeUndefined();
  });

  it("the ORIGIN mints it: two carts posted with the SAME id get two different orders", async () => {
    const { placement, outbox } = placementOn();
    const body = { order_id: "web-1", lines: CART.lines };
    const first = await placement.place(ORG, inputSchema("placeOrder").parse(body) as never);
    const second = await placement.place(ORG, inputSchema("placeOrder").parse(body) as never);
    expect(first.order_id).not.toBe("web-1");
    expect(second.order_id).not.toBe("web-1");
    expect(
      first.order_id,
      "06-F35 (a): a minted id that repeats is a caller-chosen id with extra steps — the second " +
        "cart would join the first order",
    ).not.toBe(second.order_id);
    expect(new Set(orderIdsIn(outbox))).toEqual(new Set([first.order_id, second.order_id]));
  });

  it("the acknowledged id is the WRITTEN id — `order.created` and every line carry it", async () => {
    const { placement, outbox } = placementOn();
    const { order_id } = await placement.place(ORG, {
      lines: [
        { line_id: "l1", item_id: "item-burger", qty: 1 },
        { line_id: "l2", item_id: "item-burger", qty: 2 },
      ],
    });
    // Three events, one order key. A response that acknowledged an id nothing was written under
    // would leave the customer's status page pointing at an order that does not exist.
    expect(orderIdsIn(outbox)).toEqual([order_id, order_id, order_id]);
    expect(outbox.all().map((e) => e.type)).toEqual([
      "order.created",
      "order.line_added",
      "order.line_added",
    ]);
  });

  it("the id comes from `newId` — the injected source, not from anything in the request", async () => {
    // Attribution: the ONLY thing this test changes is where ids come from. An implementation
    // deriving the order key from the cart (a hash of the lines, the first `line_id`, a counter)
    // fails here while every other assertion in this file still passes.
    const minted: string[] = [];
    const outbox = inMemoryOutbox();
    const placement = createPlacement({
      origin: createStorefrontOrigin({
        identity: IDENTITY,
        catalog: fixedCatalog({ "item-burger": 45_000 }),
        lamport: lamport(),
        clock: () => 1_755_000_000_000,
        newId: () => {
          const id = `minted-${minted.length}`;
          minted.push(id);
          return id;
        },
      }),
      outbox,
      entitlement: async () => ({
        status: "record",
        record: { capabilities: new Set([STOREFRONT_CAPABILITY]) },
      }),
    });
    const { order_id } = await placement.place(ORG, CART);
    expect(minted).toContain(order_id);
  });

  it("the ORIGIN ignores an order_id smuggled PAST the schema — defence in depth", async () => {
    /**
     * ⚠ **THE SHAPE THAT ALREADY SURVIVED A MUTANT ONCE IN THIS MODULE.** `price-authority.test.ts`
     * §A records it: an origin preferring `line.unit_price_paisa` killed nothing, because
     * `z.object` strips the key and no fixture ever handed the origin one. The same is true here
     * — an origin written as `input.order_id ?? deps.newId()` would be invisible to every test
     * that goes through the schema. So the key is cast past the type, precisely because the type
     * is the first defence and this is the second.
     */
    const { placement, outbox } = placementOn();
    const { order_id } = await placement.place(ORG, {
      order_id: "web-1",
      lines: CART.lines,
    } as never);
    expect(order_id).not.toBe("web-1");
    expect(orderIdsIn(outbox).every((id) => id !== "web-1")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE ATTACK, end to end: real HTTP, a real till fold, a CONFIRMED order.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 06-F35/06-N4 — a stranger cannot add a line to somebody else's confirmed order", () => {
  let server: ReturnType<typeof createStorefrontServer>;
  let port: number;
  let stored: EventEnvelopeT[];

  beforeEach(async () => {
    process.env.RESTOS_ORG_ID = ORG;
    process.env.RESTOS_BRANCH_ID = BRANCH;
    process.env.RESTOS_DEVICE_ID = DEVICE;
    process.env.RESTOS_STOREFRONT_HOST = HOST;
    stored = [];
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
      entitlement: async () => ({
        status: "record",
        record: { capabilities: new Set([STOREFRONT_CAPABILITY]) },
      }),
      lamport: lamport(),
    });
    port = await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  /** `Host` is a forbidden header in undici, so `fetch` cannot drive `06-F1` — see server-seam. */
  const post = (path: string, body: unknown): Promise<{ status: number; text: string }> => {
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
            host: HOST,
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

  const placed = (response: { text: string }): string =>
    (JSON.parse(response.text) as { result: { data: { order_id: string } } }).result.data.order_id;

  it("the exact reproduction: the second request gets its OWN order, and the confirmed bill is untouched", async () => {
    const store = openStore({
      path: join(mkdtempSync(join(tmpdir(), "sf-identity-")), "device.db"),
      identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL_DEVICE },
    });
    try {
      // 1. a customer places an order, and the till folds it.
      const mine = placed(await post("/trpc/placeOrder", CART));
      store.ingestBatch(stored.splice(0, stored.length));

      // 2. the cashier accepts it — `02-F9`, and `01-F1` now makes everything on it permanent.
      store.append({
        id: randomUUID(),
        org_id: ORG,
        branch_id: BRANCH,
        device_id: TILL_DEVICE,
        actor_user_id: "user-hina",
        device_created_at: 1_755_000_050_000,
        type: "order.confirmed",
        schema_version: 1,
        payload: { order_id: mine },
        refs: [],
      });

      // 3. a stranger names that order and posts twenty burgers at it.
      const attack = await post("/trpc/placeOrder", {
        order_id: mine,
        lines: [{ line_id: "stranger", item_id: "item-burger", qty: 20 }],
      });
      expect(attack.status, attack.text).toBe(200);
      store.ingestBatch(stored.splice(0, stored.length));

      const row = store.openOrders().find((r) => r.order_id === mine);
      const cells = JSON.parse(row?.json_lines ?? "{}") as Record<string, { qty: number }>;
      expect(
        Object.keys(cells),
        "06-F35: Rs 9,000 of somebody else's burgers on a CONFIRMED bill, with the kitchen told " +
          "to cook them and 01-F1 to keep them",
      ).toEqual(["l1"]);
      expect(cells.l1?.qty).toBe(1);
      // The stranger's cart is not refused — `01-F17` never blocks a sale. It is a SEPARATE
      // order, which a cashier can accept or reject on its own merits.
      expect(placed(attack)).not.toBe(mine);
      expect(store.openOrders().find((r) => r.order_id === placed(attack))).toBeDefined();
    } finally {
      store.close();
    }
  });

  it("⚠ THE RESIDUAL, PINNED: cancelOrder still accepts an id this origin never minted (06-F35 (c))", async () => {
    /**
     * ⚠ **THIS TEST ASSERTS A HOLE, DELIBERATELY, AND IT IS NOT AN ENDORSEMENT.** `06-F19` allows
     * a customer cancel *"any time before `order.confirmed`"*; this origin can check neither half
     * — no branch slice (`06-F30`) means it cannot see the confirmation, and no customer session
     * (`06-F12`) means it cannot see ownership. `06-F35` (c) decides that the door stays open
     * with the debt named rather than being closed by a guess. Pinning it here is what makes the
     * decision loud: the day `06-F12`'s session or `06 §5`'s status read model lands, this test
     * FAILS and is read, instead of the cancel quietly starting to be safe (or quietly not).
     */
    const response = await post("/trpc/cancelOrder", {
      order_id: "an-order-id-this-service-has-never-seen",
      reason: "x",
    });
    expect(response.status, response.text).toBe(200);
    expect(stored.map((e) => e.type)).toEqual(["order.cancelled"]);
    // What the mint DID buy: the id cannot be guessed, because it is not `web-1` any more.
    const mine = placed(await post("/trpc/placeOrder", CART));
    expect(mine).not.toMatch(/^web-/);
    expect(mine.length).toBeGreaterThanOrEqual(16);
  });
});
