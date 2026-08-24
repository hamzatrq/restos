/**
 * ACCEPTANCE — `06-F33`: **the customer does not set the price.**
 *
 * ⚠ **THIS FILE EXISTS BECAUSE THE SUITE BLESSED THE OPPOSITE.** The first implementation of
 * `06-F30` declared `unit_price_paisa` as a field of the public, unauthenticated request body and
 * wrote it into `order.line_added` verbatim — nothing in the service read a catalog at all — and
 * every test passed, including one titled *"the price shown is the price written, verbatim"*,
 * which asserted the defect as a feature. Reproduced end to end before the fix:
 *
 *     router input schema ACCEPTS: {"lines":[{"item_id":"item-burger","qty":1,"unit_price_paisa":1}]}
 *     TILL INBOX lines: {"l1":{"item_id":"item-burger","qty":1,"unit_price_paisa":1}}
 *
 * A Rs 450 burger in a cashier's `02-F9` inbox at 1 paisa (`0` was accepted too), where her only
 * action is Accept and `01-F1` makes it permanent.
 *
 * The property under test is **unrepresentability**, not validation: there is no price on the
 * wire to compare against, so the assertions below are aimed at the two ways it could come back —
 * a schema that accepts the field again, and an origin that prefers a caller's number to the
 * catalog's.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CatalogUnreadableError,
  createGatewayCatalog,
  type GatewayLink,
  type StorefrontCatalog,
} from "../catalog.js";
import { STOREFRONT_CAPABILITY } from "../entitlement.js";
import { originIdentity } from "../identity.js";
import { createStorefrontOrigin, type LamportSource, UnpricedItemsError } from "../origin.js";
import { inMemoryOutbox } from "../outbox.js";
import { createPlacement } from "../placement.js";
import { storefrontRouter } from "../router.js";
import { fixedCatalog } from "./catalog-fixture.js";

const ORG = "org-karachi";
const BRANCH = "branch-clifton";
const OTHER_BRANCH = "branch-tariq-road";
const HOST = "burger-house.restos.pk";

const IDENTITY = originIdentity({
  org_id: ORG,
  branch_id: BRANCH,
  device_id: "device-storefront-clifton",
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

let ids = 0;
const placementOn = (catalog: StorefrontCatalog) => {
  const outbox = inMemoryOutbox();
  const placement = createPlacement({
    origin: createStorefrontOrigin({
      identity: IDENTITY,
      catalog,
      lamport: lamport(),
      clock: () => 1_755_000_000_000,
      newId: () => `0193b0f0-0000-7000-8000-${String(++ids).padStart(12, "0")}`,
    }),
    outbox,
    entitlement: async () => ({
      status: "record",
      record: { capabilities: new Set([STOREFRONT_CAPABILITY]) },
    }),
  });
  return { placement, outbox };
};

const inputSchema = (procedure: "placeOrder") =>
  (
    storefrontRouter._def.procedures[procedure] as {
      _def: { inputs: Array<{ parse: (v: unknown) => unknown }> };
    }
  )._def.inputs[0] as { parse: (v: unknown) => unknown };

const pricesOf = (outbox: ReturnType<typeof inMemoryOutbox>) =>
  outbox
    .all()
    .filter((e) => e.type === "order.line_added")
    .map((e) => (e.payload as { unit_price_paisa: number }).unit_price_paisa);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — the public schema carries no price, and a body that sends one changes nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 06-F33 — `unit_price_paisa` is not a field of the request", () => {
  it("the parsed cart line has no price at all — the field is STRIPPED, not read", () => {
    const parsed = inputSchema("placeOrder").parse({
      order_id: "order-1",
      lines: [{ line_id: "l1", item_id: "item-burger", qty: 1, unit_price_paisa: 1 }],
    }) as { lines: Array<Record<string, unknown>> };
    expect(Object.keys(parsed.lines[0] as object).sort()).toEqual(["item_id", "line_id", "qty"]);
    expect(
      parsed.lines[0]?.unit_price_paisa,
      "a price on the wire is a price a later session trusts (06-F33)",
    ).toBeUndefined();
  });

  it("THE ATTACK, end to end: a 1-paisa body becomes the CATALOG's Rs 450 line", async () => {
    // The exact reproduction from the review, run through the shipped input schema and the
    // shipped origin. If this ever reads `1` again, a customer is setting prices.
    const attack = inputSchema("placeOrder").parse({
      order_id: "attack-1",
      lines: [{ line_id: "l1", item_id: "item-burger", qty: 1, unit_price_paisa: 1 }],
    });
    const { placement, outbox } = placementOn(fixedCatalog({ "item-burger": 45_000 }));
    await placement.place(ORG, attack as never);
    expect(pricesOf(outbox)).toEqual([45_000]);
  });

  it("the ORIGIN ignores a price smuggled PAST the schema — defence in depth", async () => {
    /**
     * ⚠ **ADDED AFTER A SURVIVING MUTANT (`L10`).** Making the origin prefer
     * `line.unit_price_paisa ?? catalog` — the defect's second half, with the schema left alone —
     * killed **nothing, 58/58 green**, because no fixture ever handed the origin a line carrying
     * one: `z.object` strips it, so the mutant's `??` never fired. That is the same *incidental
     * protection* this module already recorded once, and an incidental protection is one refactor
     * from being gone. The line is cast past the type here precisely because the type is the
     * first defence and this is the second.
     */
    const { placement, outbox } = placementOn(fixedCatalog({ "item-burger": 45_000 }));
    await placement.place(ORG, {
      order_id: "smuggled-1",
      lines: [{ line_id: "l1", item_id: "item-burger", qty: 1, unit_price_paisa: 1 } as never],
    });
    expect(pricesOf(outbox)).toEqual([45_000]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the origin resolves from the catalog, per 01-F60's rules.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 06-F33/01-F60 — the catalog is the price authority", () => {
  it("writes the published price for each line", async () => {
    const { placement, outbox } = placementOn(
      fixedCatalog({ "item-burger": 45_000, "item-fries": 32_000 }),
    );
    await placement.place(ORG, {
      order_id: "order-1",
      lines: [
        { line_id: "l1", item_id: "item-burger", qty: 1 },
        { line_id: "l2", item_id: "item-fries", qty: 2 },
      ],
    });
    expect(pricesOf(outbox)).toEqual([45_000, 32_000]);
  });

  it("an item with NO cell refuses the order, and appends NOTHING", async () => {
    // `01-F60` admits no fallback. The second assertion is the one with teeth: a refusal that
    // still appended would be a permanent half-order under `01-F1`.
    const { placement, outbox } = placementOn(fixedCatalog({ "item-burger": 45_000 }));
    await expect(
      placement.place(ORG, {
        order_id: "order-2",
        lines: [
          { line_id: "l1", item_id: "item-burger", qty: 1 },
          { line_id: "l2", item_id: "item-ghost", qty: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnpricedItemsError);
    expect(outbox.all()).toHaveLength(0);
  });

  it("a ZERO price is sellable — 01-F60's explicit zero, not an absent cell", async () => {
    // `01-F60`: *"a completeness check tests for the CELL's presence, never for a truthy price.
    // `if (!price)` refuses a legal free add-on."* A free item must ring at 0, not be refused.
    const { placement, outbox } = placementOn(fixedCatalog({ "item-water": 0 }));
    await placement.place(ORG, {
      order_id: "order-3",
      lines: [{ line_id: "l1", item_id: "item-water", qty: 1 }],
    });
    expect(pricesOf(outbox)).toEqual([0]);
  });

  it("an UNREADABLE catalog refuses — it is not an item with no price, and never a 0", async () => {
    const broken: StorefrontCatalog = {
      priceLines: async () => {
        throw new CatalogUnreadableError("gateway answered 503");
      },
    };
    const { placement, outbox } = placementOn(broken);
    await expect(
      placement.place(ORG, {
        order_id: "order-4",
        lines: [{ line_id: "l1", item_id: "item-burger", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(CatalogUnreadableError);
    expect(outbox.all()).toHaveLength(0);
  });

  it("prices the WHOLE cart in ONE read — a publish mid-order cannot split it", async () => {
    const catalog = fixedCatalog({ "item-burger": 45_000, "item-fries": 32_000 });
    const { placement } = placementOn(catalog);
    await placement.place(ORG, {
      order_id: "order-5",
      lines: [
        { line_id: "l1", item_id: "item-burger", qty: 1 },
        { line_id: "l2", item_id: "item-fries", qty: 1 },
      ],
    });
    expect(catalog.asked()).toEqual([["item-burger", "item-fries"]]);
  });

  it("a refused cart consumes NO lamport slot — a gap would wedge this origin for ever", async () => {
    // `handlePush` advances a watermark only over a gap-free run per origin, so a reservation
    // abandoned by a refusal is not a wasted number, it is a permanently stuck outbox.
    const reserved: number[] = [];
    const spy: LamportSource = {
      reserve: async (n) => {
        reserved.push(n);
        return 0;
      },
    };
    const origin = createStorefrontOrigin({
      identity: IDENTITY,
      catalog: fixedCatalog({}),
      lamport: spy,
      clock: () => 1,
      newId: () => "0193b0f0-0000-7000-8000-00000000ffff",
    });
    await expect(
      origin.placeOrder({
        order_id: "order-6",
        lines: [{ line_id: "l1", item_id: "item-ghost", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(UnpricedItemsError);
    expect(reserved).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the SHIPPING catalog: the real published artifact, over the real /internal hop.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 06-F33/28-F5 (b′) — the gateway-backed catalog reads (this branch, storefront)", () => {
  let server: Server;
  let link: GatewayLink;
  let seen: Array<{ url: string; auth: string | undefined }> = [];

  const PUBLISHED = {
    version: 12,
    entries: [
      {
        kind: "item",
        id: "item-burger",
        name: "Zinger Burger",
        /**
         * ⚠ **THE ORDER OF THESE THREE CELLS IS LOAD-BEARING, and a fixture that lists the right
         * answer first tests nothing.** The resolver picks the FIRST cell matching (branch,
         * channel), so with the storefront/this-branch cell first, dropping either predicate
         * still returns the correct price and both mutants survive. Another branch's storefront
         * price leads, this branch's `counter` price follows, and the right answer is last.
         */
        prices: [
          { branch_id: OTHER_BRANCH, channel: "storefront", price_paisa: 99_000 },
          { branch_id: BRANCH, channel: "counter", price_paisa: 40_000 },
          { branch_id: BRANCH, channel: "storefront", price_paisa: 45_000 },
        ],
      },
      {
        kind: "item",
        id: "item-deleted",
        name: "Old Special",
        deleted: true,
        prices: [{ branch_id: BRANCH, channel: "storefront", price_paisa: 10_000 }],
      },
      { kind: "category", id: "cat-mains", name: "Mains" },
    ],
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push({ url: req.url ?? "", auth: req.headers.authorization });
      if (req.headers.authorization !== "Bearer service-credential") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(PUBLISHED));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    link = { base_url: `http://127.0.0.1:${port}`, token: "service-credential" };
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("resolves THIS branch's storefront cell — not another branch's, not another channel's", async () => {
    const priced = await createGatewayCatalog(link, IDENTITY).priceLines(["item-burger"]);
    expect(priced.paisa.get("item-burger")).toBe(45_000);
    expect(priced.version).toBe(12);
  });

  it("asks the gateway for THIS org, with the service credential (28-F5 (b′))", async () => {
    seen = [];
    await createGatewayCatalog(link, IDENTITY).priceLines(["item-burger"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toContain(`org_id=${ORG}`);
    expect(seen[0]?.auth).toBe("Bearer service-credential");
  });

  it("01-F55: a tombstoned item resolves to NO price — it may be reprinted, never sold", async () => {
    const priced = await createGatewayCatalog(link, IDENTITY).priceLines(["item-deleted"]);
    expect(priced.paisa.has("item-deleted")).toBe(false);
  });

  it("an unauthorised or unreachable gateway is UNREADABLE, never an empty menu", async () => {
    // The dangerous shape is a catalog read that fails soft: every item then looks unpriced,
    // which reads as "the menu is empty" rather than "we could not ask".
    const wrong: GatewayLink = { ...link, token: "not-the-credential" };
    await expect(
      createGatewayCatalog(wrong, IDENTITY).priceLines(["item-burger"]),
    ).rejects.toBeInstanceOf(CatalogUnreadableError);
    await expect(
      createGatewayCatalog({ base_url: "http://127.0.0.1:1", token: "x" }, IDENTITY).priceLines([
        "item-burger",
      ]),
    ).rejects.toBeInstanceOf(CatalogUnreadableError);
  });
});
