// JOURNEY J1 (device half) — "a device still works on day 91" (adversarial-review
// finding B1, fixed in `bbcfd6a`; regression pin owed per
// `plans/wave-0/sec-review-followups.md`).
//
// THE FAILURE THIS PINS. The gateway minted and sent `renewed_token` correctly and
// NOTHING on the device applied it — two producer sites, zero consumers. At day 90
// every device in the fleet entered drain mode SIMULTANEOUSLY; with an empty outbox it
// had no push to earn a renewal on, its `catchup_request` was refused, the socket
// closed, and it reconnected at 1 Hz forever presenting the same expired token. **A
// hub in this state strands its entire branch.** Reachable by the passage of time
// alone. Violates 01-F47, 01-F48, 01-F11 and commandment 4.
//
// WHY NO EXISTING ORACLE SAW IT. The gateway oracle pinned "a renewal is emitted"; the
// client oracles pinned the session's own contract. Nobody owned the SEAM, so a wire
// field that nothing read looked green from both sides. Every scenario below therefore
// starts at a wire frame and ends at durable device state — or crosses two planes.
//
// This file pins the DEVICE halves (persistence, presentation, the LAN hand-off, and
// the credential-confusion guard). The end-to-end journey against a real gateway is
// `services/sync-gateway/src/__acceptance__/journey-b1-renewal.test.ts`.
//
// Authored from specs/01-kernel-sync.md (01-F47 as amended July 2026: "The device
// PERSISTS the renewal itself and presents it on every later connection"; the
// hub-relayed clause "so a LAN-only device renews without ever holding WAN itself";
// 01-F13, 01-F17) and specs/DECISIONS.md (DEC-AUTH-001, DEC-SYNC-009) ONLY — never
// from an implementation (24 §3 step 2: read-only to the implementing session).
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { createCloudSession, openStore } from "../index.js";
import { identity, tempDbPath } from "./builders.js";
import {
  cloudDevice,
  helloAck,
  hubDevice,
  lanOnlyDevice,
  lastHelloToken,
  pushAck,
  scriptedCloud,
} from "./journey-builders.js";
import { LOSSLESS, revivablePeer } from "./mesh-builders.js";

const ORIGINAL = "token-minted-at-provisioning";
const RENEWED = "token-renewed-on-day-83";

describe("J1/B1 — the renewal is APPLIED, not merely received (01-F47)", () => {
  it("B1/01-F47: a renewal on hello_ack is PERSISTED and PRESENTED on the next connection — the device that connected near expiry hellos with the new credential", () => {
    const device = cloudDevice({ token: ORIGINAL });
    const { store, cloud } = device;

    // What it presented while its original credential was still good.
    expect(lastHelloToken(cloud.sent)).toBe(ORIGINAL);

    // Day 83: remaining life crosses the threshold and the cloud renews silently.
    cloud.up();
    cloud.deliver(helloAck("j1-renewing", { renewed_token: RENEWED }));

    // (1) APPLIED, not dropped.
    //     [catches: reverting `if (message.renewed_token !== undefined)
    //     store.setDeviceToken(message.renewed_token);` in the hello_ack arm — the
    //     shipped-before state, where the field had zero consumers.]
    expect(store.deviceToken()).toBe(RENEWED);

    // (2) PRESENTED on every later connection (01-F47's own words).
    //     [catches: reverting `token: store.deviceToken() ?? token` in sendHello back
    //     to the constructor `token` — the renewal would be stored and never used,
    //     which is the same wedge one layer down.]
    cloud.up();
    cloud.deliver(helloAck("j1-after-renewal"));
    expect(lastHelloToken(cloud.sent)).toBe(RENEWED);

    device.stop();
  });

  it("B1/01-F47: the renewal survives a device RESTART — reopened from disk, constructed with the now-expired original token, it still hellos with the renewal", () => {
    // The journey the fleet actually walks: a renewal lands on day 83, the terminal is
    // power-cycled at closing time, and on day 91 the ORIGINAL token in the host app's
    // config is dead. If persistence were a session field or a host-app duty, this is
    // exactly where the fleet bricks — so the store must be the one that remembers.
    const path = tempDbPath();
    const id = identity();

    const before = openStore({ path, identity: id });
    const cloudBefore = scriptedCloud();
    const sessionBefore = createCloudSession({
      store: before,
      transport: cloudBefore.transport,
      clock: createSim({ seed: 9_101 }).clock,
      device_class: "counter_electron",
      token: ORIGINAL,
    });
    sessionBefore.start();
    cloudBefore.up();
    cloudBefore.deliver(helloAck("j1-pre-restart", { renewed_token: RENEWED }));
    expect(before.deviceToken()).toBe(RENEWED);
    sessionBefore.stop();
    before.close();

    // ── power cycle ────────────────────────────────────────────────────────────
    const after = openStore({ path, identity: id });
    // (a) DURABILITY: the credential is on disk, not in a process.
    //     [catches: implementing the renewal seam as an in-memory field — the whole
    //     table `device_credential` disappearing from the store schema.]
    expect(after.deviceToken()).toBe(RENEWED);

    const cloudAfter = scriptedCloud();
    const sessionAfter = createCloudSession({
      store: after,
      transport: cloudAfter.transport,
      clock: createSim({ seed: 9_102 }).clock,
      device_class: "counter_electron",
      // The host app still holds the credential it was provisioned with. On day 91
      // this one no longer opens anything.
      token: ORIGINAL,
    });
    sessionAfter.start();
    cloudAfter.up();

    // (b) …and it is what the reborn session presents.
    expect(lastHelloToken(cloudAfter.sent)).toBe(RENEWED);

    sessionAfter.stop();
    after.close();
  });

  it("B1/01-F47: a renewal riding a push_ack for THIS device (the drain carrier) is applied too", () => {
    const device = cloudDevice({ token: ORIGINAL });
    const { store, cloud } = device;
    expect(store.deviceToken()).toBeNull();

    cloud.deliver(pushAck({ acked_watermark: 0, renewed_token: RENEWED }));
    expect(store.deviceToken()).toBe(RENEWED);

    device.stop();
  });
});

describe("J1/B1 — a renewal addressed to ANOTHER device is never adopted (01-F47 / 18 §5)", () => {
  it("B1/18 §5 (SECURITY): a push_ack naming a RELAYED ORIGIN carries that origin's credential — the hub records it for forwarding and never adopts it as its own", () => {
    // The hub relays its branch's WAN-less devices, so their renewals arrive on ITS
    // socket. Adopting one would hand a hub a peer's credential — every relayed
    // terminal's identity, collected on the counter machine. 18 §5: no peer credential
    // ever becomes another device's.
    const device = cloudDevice({ token: ORIGINAL });
    const { store, cloud } = device;
    const waiterTablet = "dev-waiter-tablet-7";
    const PEER_TOKEN = "token-belonging-to-the-waiter-tablet";

    cloud.deliver(
      pushAck({
        acked_watermark: 0,
        origin_device_id: waiterTablet,
        renewed_token: PEER_TOKEN,
      }),
    );

    // (1) NOT ADOPTED.
    //     [catches: dropping the `forOrigin === undefined || forOrigin ===
    //     store.identity.device_id` discriminator in the push_ack arm — the peer's
    //     token would become this device's credential.]
    expect(store.deviceToken()).toBeNull();

    // (2) HELD FOR THE ORIGIN instead — its only delivery path (01-F47 relayed clause).
    expect(store.relayedRenewal(waiterTablet)).toBe(PEER_TOKEN);

    // (3) …and it never reaches the wire as this device's claim.
    cloud.up();
    cloud.deliver(helloAck("j1-after-peer-ack"));
    expect(lastHelloToken(cloud.sent)).toBe(ORIGINAL);

    device.stop();
  });
});

describe("J1/B1 — the WAN-less origin's ONLY path: hub cloud ack → store seam → LAN → origin (01-F47 / DEC-SYNC-009)", () => {
  it("B1/01-F47/01-F13: a renewal the cloud issues for a LAN-only waiter tablet crosses BOTH planes of the hub and lands in the tablet's own durable credential", () => {
    // This is the two-package journey no per-module oracle could see: the frame enters
    // on the hub's CLOUD session, crosses the store seam, and leaves on the hub's LAN
    // heartbeat. A break anywhere in that chain bricks every waiter tablet at TTL while
    // the branch looks perfectly healthy.
    const sim = createSim({ seed: 9_201 });
    sim.lan.policy(LOSSLESS);
    const hub = hubDevice(sim, "dev-a-hub");
    const tablet = lanOnlyDevice(sim, "dev-w-tablet", "waiter");
    sim.runFor(10_000); // elect + LAN session established

    expect(tablet.mesh.status().hub_id).toBe("dev-a-hub");
    expect(tablet.store.deviceToken()).toBeNull();

    // The cloud renews the tablet on the relayed push_ack (01-F47 ruling 2).
    hub.cloud.deliver(
      pushAck({
        acked_watermark: 0,
        origin_device_id: "dev-w-tablet",
        renewed_token: RENEWED,
      }),
    );
    // The hub itself is untouched — it holds no credential of the tablet's.
    expect(hub.store.deviceToken()).toBeNull();
    expect(hub.store.relayedRenewal("dev-w-tablet")).toBe(RENEWED);

    sim.runFor(10_000); // heartbeats forward it over LAN

    // [catches, in one assertion, ANY of the three links breaking: the cloud session's
    // `store.noteRelayedRenewal(forOrigin, ...)`; the mesh's `const renewal =
    // store.relayedRenewal(device_id); … ...(renewal === null ? {} : { renewed_token:
    // renewal })` in forwardCloudAck; and the follower's `if (message.renewed_token
    // !== undefined) store.setDeviceToken(message.renewed_token)` in the push_ack arm.]
    expect(tablet.store.deviceToken()).toBe(RENEWED);

    tablet.stop();
    hub.stop();
  });

  it("B1/01-F47/01-F8: forwarding is AT-LEAST-ONCE across heartbeats — a tablet that was off the LAN when the renewal arrived still gets it when it comes back", () => {
    // The renewal rides an existing heartbeat rather than a new message kind, so its
    // delivery guarantee is the heartbeat's: re-sent every beat until the origin is
    // reachable. A forward that consumed the pending renewal would lose it to any
    // transient LAN blip — and a waiter tablet walking out of Wi-Fi range for thirty
    // seconds is the normal case, not the edge case.
    const sim = createSim({ seed: 9_202 });
    sim.lan.policy(LOSSLESS);
    const hub = hubDevice(sim, "dev-a-hub");
    const tablet = lanOnlyDevice(sim, "dev-w-tablet", "waiter");
    sim.runFor(10_000);
    expect(tablet.mesh.status().hub_id).toBe("dev-a-hub");

    // The tablet walks out of range…
    sim.lan.disconnect("dev-w-tablet");
    sim.runFor(5_000);

    // …and that is exactly when its renewal arrives at the hub.
    hub.cloud.deliver(
      pushAck({
        acked_watermark: 0,
        origin_device_id: "dev-w-tablet",
        renewed_token: RENEWED,
      }),
    );
    sim.runFor(10_000);
    expect(tablet.store.deviceToken(), "nothing reaches a device off the LAN").toBeNull();

    // It comes back.
    // [catches: a `relayedRenewals.delete(device_id)` (or one-shot take) inside
    // forwardCloudAck — the pending renewal would have been consumed by the beats that
    // went nowhere, and this tablet would brick at TTL with no further trigger.]
    sim.lan.reconnect("dev-w-tablet");
    sim.runFor(15_000);
    expect(tablet.store.deviceToken()).toBe(RENEWED);

    tablet.stop();
    hub.stop();
  });

  it("B1/18 §5 (SECURITY, LAN half): a push_ack from the hub naming ANOTHER device is refused — a misaddressed forward never becomes this device's credential", () => {
    // The honest LAN cannot produce this frame (a hub sends each forward to the origin
    // it names), so the addressing guard is only observable against a hub that is
    // buggy, stale, or hostile — which is exactly the threat model 18 §5 states, and
    // exactly why a two-honest-tablets scenario is NOT sufficient to pin it.
    const sim = createSim({ seed: 9_204 });
    sim.lan.policy(LOSSLESS);
    const scriptedHub = revivablePeer(sim, "dev-a-hub", "counter_electron");
    scriptedHub.revive();
    const tablet = lanOnlyDevice(sim, "dev-w-tablet", "waiter");
    // Short of HUB_LOSS_TIMEOUT_MS: the scripted hub answers the hello but never
    // heartbeats, so a longer run would have the tablet suspect it and drop the session.
    sim.runFor(1_000);
    expect(tablet.mesh.status().hub_id).toBe("dev-a-hub");

    scriptedHub.transport.send(
      "dev-w-tablet",
      pushAck({
        acked_watermark: 0,
        origin_device_id: "dev-w-somebody-else",
        renewed_token: "token-belonging-to-another-tablet",
      }) as never,
    );
    sim.runFor(1_000);

    // [catches: dropping `if (message.origin_device_id !== self.device_id) return;`
    // from the mesh push_ack arm — the tablet would adopt a peer's credential handed
    // to it by a hub, and 18 §5's "no peer credential ever becomes another device's"
    // would hold only by the sender's good manners.]
    expect(tablet.store.deviceToken()).toBeNull();

    tablet.stop();
  });

  it("B1/18 §5 (SECURITY, LAN half): with two tablets on one hub, a renewal for tablet A never lands on tablet B", () => {
    const sim = createSim({ seed: 9_203 });
    sim.lan.policy(LOSSLESS);
    const hub = hubDevice(sim, "dev-a-hub");
    const tabletA = lanOnlyDevice(sim, "dev-w-alpha", "waiter");
    const tabletB = lanOnlyDevice(sim, "dev-w-bravo", "waiter");
    sim.runFor(10_000);
    expect(tabletA.mesh.status().hub_id).toBe("dev-a-hub");
    expect(tabletB.mesh.status().hub_id).toBe("dev-a-hub");

    hub.cloud.deliver(
      pushAck({
        acked_watermark: 0,
        origin_device_id: "dev-w-alpha",
        renewed_token: RENEWED,
      }),
    );
    sim.runFor(15_000);

    expect(tabletA.store.deviceToken()).toBe(RENEWED);
    // [catches: dropping `if (message.origin_device_id !== self.device_id) return;`
    // from the mesh push_ack arm — every tablet on the branch would adopt whichever
    // peer's credential the hub forwarded last.]
    expect(tabletB.store.deviceToken()).toBeNull();

    tabletA.stop();
    tabletB.stop();
    hub.stop();
  });
});
