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
import {
  createCloudSession,
  createWsCloudTransport,
  type DeviceStore,
  openStore,
  wallClock,
} from "@restos/sync-client";
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, type CatalogEntry, publishCatalog } from "../catalog.js";
import { createGateway, type Gateway, issueDeviceToken, registerDevice } from "../index.js";
import { buildServer } from "../server.js";
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
  testDatabaseUrl,
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

/** ≥ 32 bytes, the floor `server.ts` enforces on the `/internal` credential (`18 §5`). */
const PUBLISH_SECRET = "internal-publish-credential-for-the-journey-suite";

/**
 * Poll until `predicate` holds, or FAIL with `label`.
 *
 * A real socket is the one thing the rest of this file substitutes away, and the seam test below
 * needs it — so it needs a wait. A fixed `sleep` is what makes a socket test flaky in CI and
 * slow everywhere else; the timeout is generous and the poll is tight, so a passing run is fast
 * and a failing one says which condition never became true rather than timing out anonymously.
 */
const until = async (predicate: () => boolean, label: string, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(label);
};
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
    //
    // ⚠ This test proves the MECHANISM and deliberately calls `notifyCatalogVersion` by hand.
    // That hand call is exactly why it stayed green while the product did not work — see the
    // seam test below, which is the one that would have caught it.
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

  it("SEAM — a menu published through /internal reaches a LIVE device built by buildServer", async () => {
    // THE SEAM, and it is deliberately built on `buildServer` — the production composition root —
    // rather than on this file's own `createGateway` + in-memory bridge.
    //
    // `notifyCatalogVersion` shipped with TWO callers, both of them tests, and the production
    // publish path never called it: from the day `/internal` began accepting menus, a menu
    // published while a till was connected reached that till only on its next reconnect.
    // `seams:check` is structurally blind to this — a key in an object literal is not an export
    // (Rule A), and there was no options-bag member to find unsupplied (Rule B).
    //
    // Measured live before the fix (three-process run, August 2026): a till connected and idle,
    // an owner pressing **Apply now**, publish `200` — and the device's `catalog_state` still at
    // version 0 with 0 rows until it was restarted, under a back-office screen promising "every
    // till in the organisation changes as soon as this saves".
    //
    // ⚠ THE FIRST DRAFT OF THIS TEST MOUNTED `registerPublishRoutes` ITSELF, with its own
    // `notifyCatalogVersion` argument — and the mutation matrix showed it SURVIVED the mutant
    // that matters (`server.ts` wiring a no-op), because a test that supplies the wiring cannot
    // observe whether the product supplies it. That is this wave's named defect reproduced
    // inside the fix for it, and only mutation found it. Hence: real `buildServer`, real socket,
    // real `createCloudSession`, and nothing on the gateway called by hand.
    const id = freshIdentity();
    await registerDevice(db, { ...id, device_class: "counter_electron" });
    await publishCatalog(db, id.org_id, [dish("i-1", "One")], { enabled: ENABLED, now: BASE_T });

    const app = buildServer(
      testDatabaseUrl(),
      TEST_TOKEN_SECRET,
      undefined,
      undefined,
      PUBLISH_SECRET,
    );
    const origin = await app.listen({ port: 0, host: "127.0.0.1" });
    const store = openStore({
      path: join(mkdtempSync(join(tmpdir(), "restos-journey-seam-")), "device.db"),
      identity: id,
    });
    stores.push(store);
    const session = createCloudSession({
      store,
      transport: createWsCloudTransport({
        url: `${origin.replace("http", "ws")}/sync`,
        clock: wallClock,
      }),
      clock: wallClock,
      device_class: "counter_electron",
      // `Date.now()`, NOT `BASE_T`. Every other test in this file injects a frozen clock, but
      // `buildServer` is the production root and builds `createGateway` with the REAL one — so a
      // token stamped at `BASE_T` is 90 days expired against it, and the session opens straight
      // into `01-F47` drain mode where catalog reads are refused. Observed exactly that on the
      // first run: `AuthRejectedError: device token expired — session is in drain mode`, twice,
      // and the assertions still went green off the reconnect. A test that passes through a
      // refusal it did not intend is a test that is measuring something else.
      token: await issueDeviceToken(id, TEST_TOKEN_SECRET, { now: Date.now() }),
    });
    session.start();

    try {
      // Parity FIRST, so the assertion below cannot pass on a device that was simply late to its
      // initial fetch — this is the `hello_ack` path, and the notice path is what is on trial.
      await until(() => store.catalog.version() === 1, "the device never reached version 1");

      const published = await fetch(`${origin}/internal/catalog/publish`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${PUBLISH_SECRET}` },
        body: JSON.stringify({
          org_id: id.org_id,
          entries: [dish("i-1", "One"), dish("i-2", "Two")],
          actor_user_id: null,
          now: BASE_T + 1,
          enabled: ENABLED,
        }),
      });
      // Asserted, because a publish that 400s would make the version assertion pass for the wrong
      // reason — a device that was never told looks identical to one there was nothing to tell.
      expect(published.status, JSON.stringify(await published.json())).toBe(200);

      await until(
        () => store.catalog.version() === 2,
        "the device was never told about a menu published through the surface services/api uses",
      );
    } finally {
      session.stop();
      await app.close();
    }
  });
});
