// JOURNEY J1 (end to end) — "a device still works on day 91" (adversarial-review
// finding B1, fixed in `bbcfd6a`; regression pin owed per
// `plans/wave-0/sec-review-followups.md`).
//
// THE FAILURE THIS PINS. The gateway minted and sent `renewed_token` correctly and
// NOTHING on the device applied it. At day 90 every device entered drain mode
// simultaneously, its `catchup_request` was refused, the socket closed, and it
// reconnected forever presenting the same expired token. A hub in that state strands
// its whole branch.
//
// WHY NO EXISTING ORACLE SAW IT — AND WHY THIS FILE IS SHAPED LIKE THIS. Every prior
// oracle stopped at its own package boundary: the gateway suites assert what the
// gateway EMITS (`auth-token-lifetime.test.ts`), the client suites assert what the
// client does with a hand-written frame. A field that one side emitted and the other
// ignored was green on both. So this file drives the REAL `@restos/sync-client`
// engine — real `openStore` on a real file, real `createCloudSession` — against the
// REAL gateway over an in-process bridge, and asserts only end-state facts: what the
// device holds on disk, and whether its next session reads.
//
// Authored from specs/01-kernel-sync.md (01-F47 as amended July 2026, 01-F48, 01-F17,
// 01-F13, 01-F11) and specs/DECISIONS.md (DEC-AUTH-001, DEC-SYNC-009) ONLY — never
// from an implementation (24 §3 step 2: read-only to the implementing session).
//
// ⚠ TWO SCENARIOS BELOW ARE RED ON PURPOSE (the empty-backlog drain wedge). They are
//   filed, not fixed — see the block comment above them and the oracle report.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CloudSession,
  createCloudSession,
  type DeviceStore,
  openStore,
} from "@restos/sync-client";
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { createSim } from "@restos/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createGateway,
  type Gateway,
  issueDeviceToken,
  registerDevice,
  revokeDevice,
} from "../index.js";
import {
  BASE_T,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  openDb,
} from "./helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * DAY_MS;
const TOKEN_SECRET = "journey-b1-device-token-secret-0123456789abcdef0123456789ab";
const ISSUER = "restos-cloud-journey";
const AUDIENCE = "restos-devices-journey";

type AuthConfig = {
  token_secret: string;
  issuer?: string;
  audience?: string;
  ttl_ms?: number;
  renew_below_ms?: number;
};

const gatewayWith = (db: Db, at: number, auth: Partial<AuthConfig> = {}): Gateway =>
  createGateway({
    db,
    clock: makeClock(at),
    auth: { token_secret: TOKEN_SECRET, issuer: ISSUER, audience: AUDIENCE, ...auth },
  });

/** A correctly-bound token whose expiry is `expiresAt`. */
const tokenExpiring = (
  identity: Identity,
  expiresAt: number,
  extra: { hub_relay?: boolean } = {},
): Promise<string> =>
  issueDeviceToken({ ...identity, ...extra, expires_at: expiresAt }, TOKEN_SECRET, {
    now: BASE_T,
    issuer: ISSUER,
    audience: AUDIENCE,
  });

const registryExpiry = async (db: Db, identity: Identity): Promise<number | null> => {
  const rows = await db.execute(
    sql`select token_expires_at from kernel.device_registry
        where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
  );
  const row = must([...rows][0], "device_registry row");
  return row.token_expires_at === null ? null : Number(row.token_expires_at);
};

// ---------------------------------------------------------------------------
// THE BRIDGE. A `CloudTransport` (what the real client engine consumes) wired
// straight to a real `gateway.connect()` (what the real gateway serves). No wire
// double on either side: the client's frames go through `parseMessage` and into
// `conn.handle`, and the gateway's sink frames go back into the client's
// `onMessage`. `handle()` is async and serializes per connection, so `settle()`
// drains the whole cascade (a hello may provoke a catchup_request, which provokes
// a catchup_response, which provokes another request …).
// ---------------------------------------------------------------------------

type Link = {
  transport: CloudTransport;
  /** Frames the client SENT, as the gateway received them. */
  sent: ProtocolMessage[];
  /** Frames the gateway EMITTED, as the client received them. */
  received: ProtocolMessage[];
  /** Errors `conn.handle` rejected with — a refused catch-up lands here. */
  errors: Error[];
  /** The transport edge the WS adapter fires on connect (the session hellos on it). */
  up(): void;
  settle(): Promise<void>;
  close(): void;
};

const bridge = (gateway: Gateway): Link => {
  const sent: ProtocolMessage[] = [];
  const received: ProtocolMessage[] = [];
  const errors: Error[] = [];
  let pending: Promise<unknown>[] = [];
  let handlers: CloudTransportHandlers | null = null;

  const conn = gateway.connect((message) => {
    received.push(message);
    handlers?.onMessage(message);
  });

  const transport: CloudTransport = {
    start(h) {
      handlers = h;
    },
    stop() {
      handlers = null;
    },
    send(message) {
      const frame = parseMessage(message);
      sent.push(frame);
      pending.push(
        conn.handle(frame).catch((error: unknown) => {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }),
      );
    },
  };

  return {
    transport,
    sent,
    received,
    errors,
    up: () => must(handlers, "started transport").onUp(),
    settle: async () => {
      // A frame handled by the gateway can cause the client to send another
      // synchronously from inside the sink, so drain until the queue stays empty.
      for (let guard = 0; guard < 100 && pending.length > 0; guard++) {
        const batch = pending;
        pending = [];
        await Promise.all(batch);
      }
    },
    close: () => {
      conn.close();
    },
  };
};

type BridgedDevice = {
  store: DeviceStore;
  session: CloudSession;
  link: Link;
  stop(): void;
};

const tempPath = (): string => join(mkdtempSync(join(tmpdir(), "restos-journey-b1-")), "device.db");

/** The real device engine on a real store, talking to the real gateway. */
const bridgedDevice = async (
  gateway: Gateway,
  identity: Identity,
  token: string,
  opts: { path?: string; seed?: number } = {},
): Promise<BridgedDevice> => {
  const store = openStore({ path: opts.path ?? ":memory:", identity });
  const link = bridge(gateway);
  const session = createCloudSession({
    store,
    transport: link.transport,
    clock: createSim({ seed: opts.seed ?? 8_800 }).clock,
    device_class: "counter_electron",
    token,
  });
  session.start();
  return {
    store,
    session,
    link,
    stop: () => {
      session.stop();
      store.close();
      link.close();
    },
  };
};

/** Bring the bridged link up: the session hellos on `onUp`, exactly as over a real WS. */
const connect = async (device: BridgedDevice): Promise<void> => {
  device.link.up();
  await device.link.settle();
};

const ofKind = <K extends ProtocolMessage["kind"]>(
  messages: readonly ProtocolMessage[],
  kind: K,
): Extract<ProtocolMessage, { kind: K }>[] =>
  messages.filter((m): m is Extract<ProtocolMessage, { kind: K }> => m.kind === kind);

const appendSale = (store: DeviceStore, identity: Identity, order_id: string): void => {
  store.append({
    id: `${identity.device_id}-${order_id}`,
    org_id: identity.org_id,
    branch_id: identity.branch_id,
    device_id: identity.device_id,
    actor_user_id: null,
    device_created_at: BASE_T,
    type: "order.created",
    schema_version: 1,
    payload: { order_id, channel: "dine_in" },
    refs: [],
  });
};

let db: Db;
let verify: Db;

beforeAll(() => {
  db = openDb();
  verify = openDb();
});

afterAll(async () => {
  await closeDb(db);
  await closeDb(verify);
});

describe("J1/B1 end to end — a device that renews at day 83 still opens a NORMAL session at day 91 (01-F47)", () => {
  it("B1/01-F47/01-F11: real client + real gateway — a near-expiry connect earns a renewal, the device persists it, and after a RESTART (host app still holding the dead original) it opens a fully-reading session", async () => {
    const identity = freshIdentity();
    await registerDevice(db, { ...identity, device_class: "counter_electron" });

    // Day 83 of a 90-day credential: 7 days of life left, under the 30-day threshold.
    // The gateway's clock is what "day 83" means, so the renewal it mints runs to
    // day 173 — which is precisely why day 91 is survivable and day 91 on the ORIGINAL
    // is not.
    const original = await tokenExpiring(identity, BASE_T + 90 * DAY_MS);
    const nearExpiry = gatewayWith(db, BASE_T + 83 * DAY_MS, { renew_below_ms: 30 * DAY_MS });

    const path = tempPath();
    const device = await bridgedDevice(nearExpiry, identity, original, { path });
    await connect(device);

    // The gateway renewed silently on hello_ack…
    const ack = must(ofKind(device.link.received, "hello_ack")[0], "hello_ack");
    const renewed = must(
      (ack as { renewed_token?: string }).renewed_token,
      "hello_ack.renewed_token below the renewal threshold (01-F47)",
    );
    expect(renewed).not.toBe(original);

    // …and THE DEVICE APPLIED IT. This single assertion is the whole of B1: before
    // `bbcfd6a` the field had two producers and zero consumers.
    // [catches: reverting the hello_ack `store.setDeviceToken(...)` consumer, or the
    // `device_credential` table, in @restos/sync-client.]
    expect(device.store.deviceToken()).toBe(renewed);
    device.stop();
    await nearExpiry.close();

    // ── DAY 91. The original credential is now dead; the host app still holds it. ──
    const dayNinetyOne = gatewayWith(db, BASE_T + 91 * DAY_MS);
    const reborn = await bridgedDevice(dayNinetyOne, identity, original, {
      path,
      seed: 8_801,
    });
    await connect(reborn);

    // (1) It presented the RENEWAL, not the dead original.
    //     [catches: reverting `token: store.deviceToken() ?? token` in sendHello.]
    const hello = must(ofKind(reborn.link.sent, "hello").at(-1), "hello");
    expect(hello.token).toBe(renewed);

    // (2) It opened a NORMAL session, not a drain session: the catch-up the client
    //     issues on hello_ack was SERVED, and nothing was refused. A drain session
    //     rejects `catchup_request` — which is the exact reconnect loop B1 described.
    expect(reborn.link.errors, "no refusal on the renewed credential").toEqual([]);
    expect(ofKind(reborn.link.received, "hello_ack")).toHaveLength(1);
    expect(
      ofKind(reborn.link.received, "catchup_response").length,
      "a normal session reads (01-F11); a drain session is refused",
    ).toBeGreaterThan(0);

    reborn.stop();
    await dayNinetyOne.close();
  });

  it("B1/01-F47 (TRAP PIN, green): an AMPLE-life credential earns no renewal and the device keeps the token it was provisioned with — issuance stays deterministic", async () => {
    const identity = freshIdentity();
    await registerDevice(db, { ...identity, device_class: "counter_electron" });
    const healthy = await tokenExpiring(identity, BASE_T + NINETY_DAYS_MS);
    const gateway = gatewayWith(db, BASE_T);

    const device = await bridgedDevice(gateway, identity, healthy, { seed: 8_802 });
    await connect(device);

    const ack = must(ofKind(device.link.received, "hello_ack")[0], "hello_ack");
    expect((ack as { renewed_token?: string }).renewed_token).toBeUndefined();
    expect(device.store.deviceToken(), "nothing to persist, nothing persisted").toBeNull();
    expect(must(ofKind(device.link.sent, "hello")[0], "hello").token).toBe(healthy);

    device.stop();
    await gateway.close();
  });

  it("B1/01-F47/01-F42 (TRAP PIN, green): a REVOKED device is never renewed — it is purged, and no credential is written to its store", async () => {
    const identity = freshIdentity();
    await registerDevice(db, { ...identity, device_class: "counter_electron" });
    const token = await tokenExpiring(identity, BASE_T + 7 * DAY_MS);
    await revokeDevice(db, { org_id: identity.org_id, device_id: identity.device_id });
    const gateway = gatewayWith(db, BASE_T, { renew_below_ms: 30 * DAY_MS });

    const device = await bridgedDevice(gateway, identity, token, { seed: 8_803 });
    await connect(device);

    expect(ofKind(device.link.received, "hello_ack")).toHaveLength(0);
    expect(device.link.errors.length, "revocation is refused loudly").toBeGreaterThan(0);
    expect(device.store.deviceToken()).toBeNull();

    device.stop();
    await gateway.close();
  });
});

describe("J1/B1 end to end — the registry SEEDS token_expires_at so a relayed origin is renewable from day one (01-F47 ruling 2)", () => {
  it("B1/01-F47: registerDevice with no explicit expiry still records a non-null token_expires_at — without the seed, `mintRenewal` treats a WAN-less origin as 'not due' forever", async () => {
    const identity = freshIdentity();
    await registerDevice(db, { ...identity, device_class: "waiter" });

    // [catches: reverting the `coalesce(…, (extract(epoch from now()) * 1000)::bigint +
    // DEVICE_TOKEN_TTL_MS)` seed in registerDevice — a null column makes the entire
    // hub-relayed renewal clause unreachable, which is the clause that makes a 90-day
    // TTL safe in a LAN-only deployment.]
    const seeded = await registryExpiry(verify, identity);
    expect(seeded, "token_expires_at is seeded at provisioning").not.toBeNull();
    expect(Number(seeded)).toBeGreaterThan(0);
  });

  it("B1/01-F47/01-F13/DEC-SYNC-009: a WAN-less origin whose REGISTRY life is short is renewed on the relayed push_ack, and that renewal is a real credential — it opens the origin's own session", async () => {
    const hub = freshIdentity();
    const origin: Identity = { ...hub, device_id: freshIdentity().device_id };
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    // The cloud's record of what the origin holds — its token never reaches the cloud.
    await registerDevice(db, {
      ...origin,
      device_class: "waiter",
      token_expires_at: BASE_T + 5 * DAY_MS,
    });

    const gateway = gatewayWith(db, BASE_T, { renew_below_ms: 30 * DAY_MS });
    const hubToken = await tokenExpiring(hub, BASE_T + 80 * DAY_MS, { hub_relay: true });

    // The hub relays one of the origin's events upward, verbatim (01-F1).
    // The hub half is scripted at the wire (its own engine is pinned in the
    // sync-client journey suite); what matters here is what the GATEWAY answers.
    const link = bridge(gateway);
    link.transport.start({ onUp: () => {}, onDown: () => {}, onMessage: () => {} });
    link.transport.send(
      parseMessage({
        v: 1,
        kind: "hello",
        device_id: hub.device_id,
        device_class: "counter_electron",
        branch_id: hub.branch_id,
        token: hubToken,
        last_global_seq: 0,
        own_high_water: 0,
      }),
    );
    await link.settle();
    const helloAck = must(ofKind(link.received, "hello_ack")[0], "hello_ack");
    expect(helloAck.relay_authorized).toBe(true);

    link.transport.send(
      parseMessage({
        v: 1,
        kind: "push",
        events: [
          {
            id: `${origin.device_id}-relayed-0`,
            org_id: origin.org_id,
            branch_id: origin.branch_id,
            device_id: origin.device_id,
            actor_user_id: null,
            lamport_seq: 0,
            device_created_at: BASE_T,
            branch_created_at: BASE_T,
            time_basis: "branch",
            server_received_at: null,
            type: "order.created",
            schema_version: 1,
            payload: { order_id: `ord-${origin.device_id}`, channel: "dine_in" },
            refs: [],
          },
        ],
        watermark: 0,
      }),
    );
    await link.settle();

    const ack = must(ofKind(link.received, "push_ack").at(-1), "relay push_ack");
    expect(ack.origin_device_id).toBe(origin.device_id);
    const relayed = must(
      (ack as { renewed_token?: string }).renewed_token,
      "the relayed origin's renewal rides the ack the hub already forwards (01-F47)",
    );
    expect(await registryExpiry(verify, origin)).toBe(BASE_T + NINETY_DAYS_MS);
    link.close();

    // It is a genuine credential for the ORIGIN: the day the branch gets WAN, the
    // origin's own real engine opens a session with it.
    const originDevice = await bridgedDevice(gateway, origin, relayed, { seed: 8_804 });
    await connect(originDevice);
    expect(originDevice.link.errors).toEqual([]);
    expect(ofKind(originDevice.link.received, "hello_ack")).toHaveLength(1);
    expect(await eventRows(verify, origin.org_id)).toHaveLength(1);

    originDevice.stop();
    await gateway.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RED — THE EMPTY-BACKLOG DRAIN WEDGE. Filed, not fixed.
//
// Expiry only rejects at a device's OWN hello. An expired-but-unrevoked device is
// admitted PUSH-ONLY, and its renewal rides the ack of the push it was admitted to
// make (`gateway.ts` push_ack path, `force = session.draining && renewFor ===
// session.deviceId`). If it has NOTHING QUEUED, `drainPush()` sends nothing — no
// push, no push_ack, no renewal. Its `catchup_request` is refused, the socket closes,
// and it reconnects presenting the same expired token with the same empty outbox.
// **Permanent, and reachable by any device offline across its whole renewal window**:
// a spare terminal, a tablet left in a drawer, a branch closed for a fortnight.
//
// It also subsumes a second-order residual: `token_expires_at` records what was
// MINTED, not what the device HOLDS. A hub that restarts holding an undelivered
// relayed renewal (`relayedRenewal` is an in-memory Map) leaves the column advanced
// while the origin still holds the old token, so the relay path never re-issues —
// and that origin's only recovery is a direct session, i.e. exactly this case.
//
// THE CONTRACT THIS ORACLE PINS (ruling, per the co-ordinating session's proposal,
// which this oracle reviewed and accepts): deliver the renewal on `hello_ack` for a
// drain session, but do NOT clear `draining` on that session. Reads stay refused; the
// device simply uses the new token on its next connection. Drain mode's whole
// observable purpose — that reads are refused until the credential is good — is
// preserved, because the renewal changes the device's NEXT connection, not this one.
//
// ⚠ CONFLICT THE IMPLEMENTING SESSION MUST RESOLVE FIRST (commandment 9). This
// contradicts a currently-green assertion in `auth-token-lifetime.test.ts` (the
// "an EXPIRED but unrevoked device is admitted for PUSH" scenario), which asserts
// `helloAck.renewed_token` is undefined for an expired credential, citing 01-F47
// ruling 1. That assertion is STRONGER than the ruling requires: ruling 1 protects
// the observability of drain mode (reads refused), not the absence of the field.
// Landing this needs an 01-F47 amendment stating that a drain session's hello_ack MAY
// carry a renewal while the session stays push-only, and the two tests reconciled.
// Both cannot be green at once, and this oracle does not edit another oracle's file.
// ═══════════════════════════════════════════════════════════════════════════

describe("J1/B1 RED — a device offline past expiry with an EMPTY OUTBOX must not be permanently wedged (01-F47 / 01-F17)", () => {
  it("B1 RED/01-F47: an expired credential with NOTHING to push still ends up with a working normal session — today it cannot, and reconnecting changes nothing", async () => {
    const identity = freshIdentity();
    await registerDevice(db, { ...identity, device_class: "counter_electron" });
    const expired = await tokenExpiring(identity, BASE_T - DAY_MS);
    const gateway = gatewayWith(db, BASE_T);

    const path = tempPath();
    const device = await bridgedDevice(gateway, identity, expired, { path, seed: 8_805 });
    await connect(device);

    // It is admitted (expiry never blocks a sale, and never purges — 01-F17/01-F47)…
    expect(ofKind(device.link.received, "hello_ack")).toHaveLength(1);
    // …and it has nothing whatsoever to push.
    expect(device.store.status().queue_depth).toBe(0);
    expect(ofKind(device.link.sent, "push")).toHaveLength(0);

    // THE PIN: it must come away with a usable credential. Today no renewal is
    // emitted on hello_ack for a drain session and none can be earned without a push,
    // so this is RED and the device is wedged.
    const renewed = (
      must(ofKind(device.link.received, "hello_ack")[0], "hello_ack") as {
        renewed_token?: string;
      }
    ).renewed_token;
    expect(
      renewed,
      "a drain session with an empty outbox has NO other path to a renewal — without " +
        "this the device reconnects forever with the same dead token (review B1)",
    ).toBeDefined();
    expect(device.store.deviceToken(), "and the device applies it").toBe(renewed);
    device.stop();

    // …and the proof it is a real recovery: the next connection is a normal session.
    const reborn = await bridgedDevice(gateway, identity, expired, { path, seed: 8_806 });
    await connect(reborn);
    expect(reborn.link.errors, "the recovered device reads again").toEqual([]);
    expect(ofKind(reborn.link.received, "catchup_response").length).toBeGreaterThan(0);

    reborn.stop();
    await gateway.close();
  });

  it("B1 RED/01-F47 ruling 1/00 §5.4: the renewal must NOT promote the drain session — on THAT connection catch-up is still refused and no fan-out arrives", async () => {
    // The safety half of the proposed fix. Drain mode exists so that a device whose
    // credential lapsed cannot READ until it is good again; handing it a renewal must
    // change its NEXT connection, never this one. If an implementer "fixes" the wedge
    // by clearing `draining` on hello_ack, this goes red and 01-F47 ruling 1 is gone.
    const branch = freshIdentity();
    const draining: Identity = { ...branch, device_id: freshIdentity().device_id };
    const peer: Identity = { ...branch, device_id: freshIdentity().device_id };
    await registerDevice(db, { ...draining, device_class: "counter_electron" });
    await registerDevice(db, { ...peer, device_class: "counter_electron" });

    const gateway = gatewayWith(db, BASE_T);
    const peerDevice = await bridgedDevice(
      gateway,
      peer,
      await tokenExpiring(peer, BASE_T + 60 * DAY_MS),
      { seed: 8_807 },
    );
    await connect(peerDevice);

    const drain = await bridgedDevice(
      gateway,
      draining,
      await tokenExpiring(draining, BASE_T - DAY_MS),
      { seed: 8_808 },
    );
    await connect(drain);

    // The renewal is delivered (the RED half — see the scenario above)…
    const ack = must(ofKind(drain.link.received, "hello_ack")[0], "hello_ack") as {
      renewed_token?: string;
    };
    expect(ack.renewed_token, "renewal on the drain session's hello_ack").toBeDefined();

    // …and the session is STILL push-only. The client hellos and immediately requests
    // catch-up; that request must be refused on this connection.
    expect(
      drain.link.errors.length,
      "catch-up on a drain session is refused even after the renewal is handed over",
    ).toBeGreaterThan(0);
    expect(ofKind(drain.link.received, "catchup_response")).toHaveLength(0);

    // …and no fan-out reaches it: a healthy peer's sale must not be delivered.
    appendSale(peerDevice.store, peer, "ord-fanout-probe");
    peerDevice.session.notifyAppended();
    await peerDevice.link.settle();
    expect(
      ofKind(drain.link.received, "event_batch"),
      "a drain session joins no fan-out (00 §5.4: reads are where data leaks)",
    ).toHaveLength(0);

    drain.stop();
    peerDevice.stop();
    await gateway.close();
  });
});
