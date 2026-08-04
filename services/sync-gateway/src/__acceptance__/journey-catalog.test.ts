// Journey — a REAL device session fetching a REAL published catalog over the REAL protocol.
//
// WHY THIS FILE EXISTS. `packages/sync-client` held a complete, tested cloud session and NO
// APPLICATION CONSTRUCTED ONE, so `catalog_request` had never left a device: every catalog test
// on either side drove its own half directly. An oracle reviewer named it as the round's
// "correct in isolation, unconnected in fact" finding, one level up from the availability fold
// that was caught the same way in round 1.
//
// Everything here is the shipped thing. Real `createCloudSession`, real `createGateway`, real
// `publishCatalog`, every frame through `parseMessage`. The only substitution is the SOCKET —
// an in-memory bridge stands in for the WS adapter, exactly as `journey-b1-renewal.test.ts`
// does, because a socket is the one component whose failure modes are not what this is about.
//
// It is the test that would have failed while the transport was unreachable, and the reason to
// write it as a permanent journey rather than a one-off demo.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCloudSession, type DeviceStore, openStore } from "@restos/sync-client";
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, type CatalogEntry, publishCatalog } from "../catalog.js";
import { createGateway, type Gateway, issueDeviceToken, registerDevice } from "../index.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  openDb,
  TEST_TOKEN_SECRET,
} from "./helpers.js";

// ── 01-F60's enabled grid, required on every publish since the July 2026 founder ruling ──────
//
// "**The enabled set is a REQUIRED input to the publish** ... not an optional one defaulting to
// 'check nothing'." This journey is about the TRANSPORT reaching a real device, not about
// pricing (`catalog-pricing.test.ts` owns `01-F60`), so it declares the smallest REAL grid — one
// branch × one of `02-F42`'s five channels — and `dish()` prices that single cell. The
// completeness check therefore RUNS on every publish below and passes.
//
// Deliberately NOT `{ branches: [], channels: [] }`: whether an empty enabled set is legal is an
// open question on `01-F60` (recorded in `catalog-pricing.test.ts`'s header), and passing it
// would leave every publish here unchecked — the silence the ruling exists to remove.
const BRANCH = "br-journey";
const ENABLED = { branches: [BRANCH], channels: ["counter"] };
const PRICED = [{ branch_id: BRANCH, channel: "counter", price_paisa: 145_000 }];

const dish = (id: string, name: string, extra: Record<string, unknown> = {}): CatalogEntry =>
  ({ kind: "item", id, name, prices: PRICED, ...extra }) as CatalogEntry;

type Link = {
  transport: CloudTransport;
  /** Anything `conn.handle` rejected with — a swallowed rejection is how a harness lies. */
  errors: Error[];
  settle(): Promise<void>;
  up(): void;
  received: ProtocolMessage[];
};

const bridge = (gateway: Gateway): Link => {
  const received: ProtocolMessage[] = [];
  const errors: Error[] = [];
  let pending: Promise<unknown>[] = [];
  let handlers: CloudTransportHandlers | null = null;

  /**
   * A RECONNECT IS A NEW SOCKET, and modelling it as a second hello down the same connection is
   * how this harness first lied to me: the gateway refused the re-hello, the bridge swallowed
   * the rejection, and the test read as "the device did not re-fetch" when the device had never
   * been given a live link to re-fetch on. `dial()` is what makes `up()` mean what the WS
   * adapter means by it.
   */
  let conn = gateway.connect(() => {});
  const dial = (): void => {
    conn = gateway.connect((message) => {
      received.push(message);
      handlers?.onMessage(message);
    });
  };

  return {
    received,
    errors,
    transport: {
      start(h) {
        handlers = h;
      },
      stop() {
        handlers = null;
      },
      send(message) {
        const frame = parseMessage(message);
        pending.push(
          conn.handle(frame).catch((e: unknown) => {
            errors.push(e instanceof Error ? e : new Error(String(e)));
          }),
        );
      },
    },
    up: () => {
      // The transport's edge: a fresh socket, THEN the session hellos on it.
      handlers?.onDown();
      dial();
      handlers?.onUp();
    },
    async settle() {
      // A hello provokes a catalog_request, which provokes a response, which may provoke
      // another request. Drain the whole cascade rather than a fixed number of turns.
      for (let i = 0; i < 20 && pending.length > 0; i++) {
        const batch = pending;
        pending = [];
        await Promise.all(batch);
      }
    },
  };
};

describe("JOURNEY — a device fetches its org's catalog over the wire (01-F9, T-C1..T-C4)", () => {
  let db: Db;
  let gateway: Gateway;
  const stores: DeviceStore[] = [];

  const deviceFor = async (id: Identity) => {
    await registerDevice(db, { ...id, device_class: "counter_electron" });
    const store = openStore({
      path: join(mkdtempSync(join(tmpdir(), "restos-journey-")), "device.db"),
      identity: id,
    });
    stores.push(store);
    const link = bridge(gateway);
    const session = createCloudSession({
      store,
      transport: link.transport,
      clock: { now: () => BASE_T, setTimeout: () => 0 as never, clearTimeout: () => {} },
      device_class: "counter_electron",
      token: await issueDeviceToken(
        { ...id, hub_relay: false, expires_at: BASE_T + 90 * 24 * 60 * 60 * 1000 },
        TEST_TOKEN_SECRET,
        { now: BASE_T },
      ),
    });
    session.start();
    link.up();
    await link.settle();
    return { store, link, session };
  };

  beforeAll(() => {
    db = openDb();
    gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
  });
  afterAll(async () => {
    for (const s of stores) s.close?.();
    await gateway.close();
    await closeDb(db);
  });

  it("reaches parity from nothing, without being asked to", async () => {
    // THE HEADLINE. Nobody tells the device to fetch: it compares `hello_ack.catalog_version`
    // with its own and asks. That is what makes the transport work for a device that has been
    // offline for a week and could not have heard any announcement.
    const id = freshIdentity();
    await publishCatalog(
      db,
      id.org_id,
      [
        dish("i-karahi", "Chicken Karahi", { sort: 1 }),
        dish("i-chapli", "Chapli Kebab", { sort: 2 }),
      ],
      { enabled: ENABLED, now: BASE_T },
    );

    const { store } = await deviceFor(id);

    expect(store.catalog.version(), "the device never fetched").toBe(1);
    expect(store.catalog.list("item").map((e) => e.name)).toEqual([
      "Chicken Karahi",
      "Chapli Kebab",
    ]);
  });

  it("takes a DELTA on reconnect, not the whole menu again", async () => {
    const id = freshIdentity();
    await publishCatalog(db, id.org_id, [dish("i-a", "A")], { enabled: ENABLED, now: BASE_T });
    const { store, link } = await deviceFor(id);
    expect(store.catalog.version()).toBe(1);

    await publishCatalog(db, id.org_id, [dish("i-b", "B")], {
      enabled: ENABLED,
      now: BASE_T + 1,
    });
    // A reconnect: the same session hellos again on the transport edge.
    link.up();
    await link.settle();

    expect(link.errors, "the gateway refused a frame").toEqual([]);
    expect(store.catalog.version()).toBe(2);
    expect(
      store.catalog
        .list("item")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["i-a", "i-b"]);
    const response = must(
      link.received.find((m) => m.kind === "catalog_response" && m.version === 2),
      "second catalog_response",
    );
    expect(response.kind === "catalog_response" && response.form, "refetched the whole menu").toBe(
      "delta",
    );
  });

  it("§5.4 — a PAGED snapshot crosses the wire and applies as one menu", async () => {
    // The multi-frame path, end to end. Every page is a real request/response pair, and the
    // device commits once — the property that stops a till holding half a menu mid-service.
    const id = freshIdentity();
    const many = Array.from({ length: CATALOG_PAGE_SIZE + 40 }, (_, i) =>
      dish(`i-${String(i).padStart(4, "0")}`, `Dish ${i}`),
    );
    await publishCatalog(db, id.org_id, many, { enabled: ENABLED, now: BASE_T });

    const { store, link } = await deviceFor(id);

    const responses = link.received.filter((m) => m.kind === "catalog_response");
    expect(responses.length, "a menu past the page size arrived in one frame").toBeGreaterThan(1);
    expect(store.catalog.list("item")).toHaveLength(many.length);
    expect(store.catalog.version()).toBe(1);
  });

  it("§5.7 — a TRAINING-branch device gets the production menu, with no mechanism for it", async () => {
    // 01-F49/01-F52: the catalog is fetched BY ORG, so a training branch mirrors production
    // read-only without a special case anywhere. This is the test that makes "worth a test, not
    // worth a mechanism" true rather than asserted.
    const prod = freshIdentity();
    await publishCatalog(db, prod.org_id, [dish("i-x", "Nihari")], {
      enabled: ENABLED,
      now: BASE_T,
    });
    const { store } = await deviceFor({ ...freshIdentity(), org_id: prod.org_id });
    expect(store.catalog.list("item").map((e) => e.name)).toEqual(["Nihari"]);
  });

  it("§5.5 — a device whose org has no catalog still runs, and asks for nothing", async () => {
    // 01-F17/01-F54: a catalog that cannot sync never blocks a sale. With nothing published the
    // gateway omits `catalog_version` entirely, so the device does not even ask — and the till
    // is a working till with unnamed buttons rather than a broken one.
    const { store, link } = await deviceFor(freshIdentity());
    expect(store.catalog.version()).toBe(0);
    expect(link.received.filter((m) => m.kind === "catalog_response")).toEqual([]);
    expect(() => store.openOrders()).not.toThrow();
  });

  it("§5.3 — a device that hears NO notice still converges on its next hello", async () => {
    // The clause stated as a journey. `notifyCatalogVersion` is never called here, so not one
    // notice is delivered — and the device converges anyway, because reconciliation is driven
    // by comparing versions at hello. That is the property that makes a notice safe to lose,
    // which a lossy link will do.
    const id = freshIdentity();
    await publishCatalog(db, id.org_id, [dish("i-1", "One")], {
      enabled: ENABLED,
      now: BASE_T,
    });
    const { store, link } = await deviceFor(id);
    expect(store.catalog.version()).toBe(1);

    await publishCatalog(db, id.org_id, [dish("i-2", "Two")], {
      enabled: ENABLED,
      now: BASE_T + 1,
    });
    expect(
      link.received.filter((m) => m.kind === "catalog_notice"),
      "a notice was sent",
    ).toEqual([]);
    link.up();
    await link.settle();
    expect(store.catalog.version(), "the device needed a notice to converge").toBe(2);
  });

  it("a live NOTICE brings the edit forward without waiting for a reconnect", async () => {
    // The freshness half, which is all the notice is for.
    const id = freshIdentity();
    await publishCatalog(db, id.org_id, [dish("i-1", "One")], {
      enabled: ENABLED,
      now: BASE_T,
    });
    const { store, link } = await deviceFor(id);

    await publishCatalog(db, id.org_id, [dish("i-2", "Two")], {
      enabled: ENABLED,
      now: BASE_T + 1,
    });
    gateway.notifyCatalogVersion(id.org_id, 2);
    await link.settle();

    expect(store.catalog.version(), "the notice did not reach the device").toBe(2);
  });
});
