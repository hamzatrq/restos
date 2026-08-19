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
import postgres from "postgres";
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
  pingMsg,
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

/**
 * `until`, for a predicate that has to ask the database.
 *
 * Separate rather than folded into `until` because the existing callers pass a synchronous
 * predicate and a `Promise` is always truthy — one accidental `async` there would turn every
 * poll into an immediate pass, which is the quietest way a wait becomes vacuous.
 */
const untilAsync = async (
  predicate: () => Promise<boolean>,
  label: string,
  timeoutMs = 10_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(label);
};

/**
 * The device's REAL transport, with every inbound frame recorded before the session sees it.
 *
 * The ordering test below judges the product by what reached the wire and in what order, so it
 * needs the frames themselves — not the store's end state, which cannot tell "told too early"
 * from "never told". Nothing is intercepted or altered: `onMessage` still forwards, so the
 * session behaves exactly as it does with `createWsCloudTransport` alone.
 */
const recording = (inner: CloudTransport, heard: ProtocolMessage[]): CloudTransport => ({
  start(handlers: CloudTransportHandlers) {
    inner.start({
      onUp: () => {
        handlers.onUp();
      },
      onDown: () => {
        handlers.onDown();
      },
      onMessage: (message) => {
        heard.push(message);
        handlers.onMessage(message);
      },
    });
  },
  stop() {
    inner.stop();
  },
  send(message) {
    inner.send(message);
  },
});

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
      link.received.find((m) => m.kind === "reference_response" && m.version === 2),
      "second reference_response",
    );
    expect(
      response.kind === "reference_response" && response.form,
      "refetched the whole menu",
    ).toBe("delta");
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

    const responses = link.received.filter((m) => m.kind === "reference_response");
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
    // gateway omits the catalog key from `hello_ack.reference_versions` entirely (01-F77:
    // omitted, never sent as 0), so the device does not even ask — and the till
    // is a working till with unnamed buttons rather than a broken one.
    const { store, link } = await deviceFor(freshIdentity());
    expect(store.catalog.version()).toBe(0);
    expect(link.received.filter((m) => m.kind === "reference_response")).toEqual([]);
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
      link.received.filter((m) => m.kind === "reference_notice"),
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

  it("SEAM (ORDER) — a publish held mid-transaction announces NOTHING (the notice follows the commit)", async () => {
    // THE ORDERING HALF of the seam above, and the reason it needs its own fixture.
    //
    // `publish-http.ts` calls `notifyCatalogVersion` AFTER `await publishCatalog` on purpose: a
    // notice for a version that did not land sends every till in the org after a menu that does
    // not exist. Until this test the ordering was a reasoned choice and nothing defended it — the
    // mutant that announces first (predict the version, tell the org, then write) survived the
    // whole suite. A senior review measured why: it survives ONLY because on loopback the
    // notice→request→response round trip beats a sub-millisecond commit, so the device asks again
    // after the commit has quietly landed and converges anyway. The guard was never vacuous; it
    // was never handed a window.
    //
    // ── THE WINDOW IS A LOCK, NOT A SLEEP ────────────────────────────────────────────────────
    // `publishCatalog` serializes per org on `pg_advisory_xact_lock(hashtext('restos:catalog:' ||
    // org_id))`. This fixture takes THAT LOCK on its own connection first, which is not a
    // contrivance but a real production condition: a second publish for the same org already in
    // flight. The publish under test then blocks at the top of its transaction and **cannot
    // commit until this test says so** — so the window is not a hoped-for scheduling gap with a
    // flaky floor, it is held open by Postgres. It is also org-scoped, so it blocks nothing in
    // any other file (isolation here is by fresh org).
    //
    // ── AND THE OBSERVATION IS A ROUND TRIP, NOT A TIMER ─────────────────────────────────────
    // Two orderings make the assertion race-free rather than merely likely, which matters because
    // a "wait and hope the frame arrived" test is a future 3am flake:
    //   1. `pg_locks` is polled until a backend is provably WAITING on this exact lock. That is
    //      what makes the window meaningful — without it a publish that 400'd before it ever
    //      reached the database would satisfy "no notice arrived" vacuously.
    //   2. The device then pings its OWN socket and waits for the pong. The gateway answers a
    //      ping synchronously from the same sink the notice uses, on the same connection, so a
    //      notice written before the block (step 1) is written before the pong and therefore
    //      ARRIVES before it. When the pong lands, a premature notice is already in `heard`.
    // There is no `sleep` anywhere in this test and no wall-clock constant to tune.
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
      path: join(mkdtempSync(join(tmpdir(), "restos-journey-order-")), "device.db"),
      identity: id,
    });
    stores.push(store);
    const heard: ProtocolMessage[] = [];
    const transport = recording(
      createWsCloudTransport({ url: `${origin.replace("http", "ws")}/sync`, clock: wallClock }),
      heard,
    );
    const session = createCloudSession({
      store,
      transport,
      clock: wallClock,
      device_class: "counter_electron",
      // `Date.now()`, NOT `BASE_T` — `buildServer` builds `createGateway` with the REAL clock;
      // see the note on the seam test above, where a `BASE_T` token opened straight into drain
      // mode and the assertions still went green off the reconnect.
      token: await issueDeviceToken(id, TEST_TOKEN_SECRET, { now: Date.now() }),
    });
    session.start();

    // Its own connection, and `max: 1` so `pg_backend_pid()` below is this lock's holder.
    const barrier = postgres(testDatabaseUrl(), { max: 1 });
    let publishing: Promise<Response> | undefined;

    try {
      await until(() => store.catalog.version() === 1, "the device never reached version 1");

      // The same key `publishCatalog` computes. If it ever drifts, the publish will not block and
      // the wait below fails loudly — which is what stops this test decaying into a vacuous one.
      await barrier`select pg_advisory_lock(hashtext('restos:catalog:' || ${id.org_id}))`;

      publishing = fetch(`${origin}/internal/catalog/publish`, {
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

      // (1) The publish has reached its transaction and is stuck on our lock. Matched by joining
      // the waiter against the lock THIS backend holds, so no advisory-key bit arithmetic is
      // reproduced here and no other org's publish can be mistaken for ours.
      await untilAsync(
        async () =>
          ((
            await barrier<{ waiting: number }[]>`
              select count(*)::int as waiting
                from pg_locks waiter
                join pg_locks mine
                  on mine.locktype = 'advisory'
                 and mine.granted
                 and mine.pid = pg_backend_pid()
                 and waiter.classid = mine.classid
                 and waiter.objid = mine.objid
                 and waiter.objsubid = mine.objsubid
               where waiter.locktype = 'advisory' and not waiter.granted`
          )[0]?.waiting ?? 0) > 0,
        "the publish never blocked on this org's catalog advisory lock — the barrier did not " +
          "engage, so anything asserted below would have proved nothing about ordering",
      );

      // (2) Flush the device's socket: everything the gateway wrote to it before now is in
      // `heard` by the time this pong is.
      const probe = BASE_T + 7;
      transport.send(pingMsg(probe));
      await until(
        () => heard.some((m) => m.kind === "pong" && m.t === probe),
        "the device's ping was never answered — the flush that orders the assertion below after " +
          "any premature notice never completed",
      );

      // The barrier held: nothing of version 2 is readable, so the device cannot have moved.
      expect(store.catalog.version(), "the barrier did not hold the publish").toBe(1);

      // THE INVARIANT. `deps.notifyCatalogVersion(...)` sits after `await publishCatalog(...)`,
      // and this is what says so: with the commit provably held, the org has been told nothing.
      expect(
        heard.filter((m) => m.kind === "reference_notice"),
        "a reference_notice reached the device while its publish was still blocked mid-transaction " +
          "— the notice PRECEDED the commit (publish-http.ts). Every till in the org has been " +
          "sent after a version the gateway does not have, and the empty delta they get back " +
          "carries no refusal and no retry",
      ).toEqual([]);

      const [released] = await barrier<{ released: boolean }[]>`
        select pg_advisory_unlock(hashtext('restos:catalog:' || ${id.org_id})) as released`;
      expect(released?.released, "the barrier was not held under publishCatalog's key").toBe(true);

      const published = await publishing;
      expect(published.status, JSON.stringify(await published.json())).toBe(200);

      // And the freshness half still holds once the commit lands: the notice DOES follow it.
      // Without this the test would pass against a gateway that never notices at all.
      await until(
        () => store.catalog.version() === 2,
        "the device was never told about the committed version — the notice did not follow the " +
          "commit either",
      );
    } finally {
      // Release before anything else: ending the connection drops the advisory lock even if an
      // assertion above threw while holding it, so the blocked publish can finish rather than
      // sitting in a torn-down server.
      await barrier.end({ timeout: 5 });
      await publishing?.catch(() => undefined);
      session.stop();
      await app.close();
    }
  });
});
