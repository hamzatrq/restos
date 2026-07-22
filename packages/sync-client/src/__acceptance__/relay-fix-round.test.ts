// Acceptance tests — T-01-12 FIX ROUND, device-side rulings F3/F4/F5
// (plans/wave-0/t-01-12-fix-round.md, rulings merged at 98b52a1). Authored from
// the fix-round rulings + specs/DECISIONS.md (DEC-SYNC-009, DEC-SYNC-006) +
// specs/01-kernel-sync.md (01-F8, 01-F13) + 19 §5 ONLY (24 §3 step 2:
// read-only to the implementing session). Existing relay pins
// (relay-scenarios.test.ts) are untouched and stay binding.
//
// RED-AWAITING-FIX map (each red verified to fail for the ruled reason):
//   F3 — the follower's relayed-cloud-ack handler calls store.advanceTo with
//        the wire value unguarded: an ack beyond own high water (forged-peer
//        DoS, or the wiped-device DR rejoin where the hub remembers a larger
//        stream than the reborn store holds) throws AckBeyondAppendedError out
//        of the transport dispatch. Ruled: ignore-and-count (or clamp ≤ own
//        high) — never crash, and the session keeps processing.
//   F4 — relayRequested latches in the cloud session and never clears on
//        hub→follower demotion, so a demoted device re-relays third-party
//        events on its next WAN reconnect (hello_ack → relay resume). Ruled:
//        the latch clears on demotion — followers never relay (DEC-SYNC-006).
//   F5 — forwardCloudAck's one-shot latch (forwardedCloudAck) marks an ack
//        forwarded at SEND time, so a single lost LAN frame stalls the
//        origin's checkpoint until a higher ack ever arrives (never, for a
//        quiet origin). Ruled: re-forward on heartbeat like replayWindowTo —
//        the receiver's advanceTo is idempotent/monotone.

import { describe, expect, it } from "vitest";
import { helloAck, rawPeer } from "./mesh-builders.js";
import { appendLan, closeLan, lanOnlyDevice, mergedOf } from "./relay-builders.js";
import {
  closeAll,
  createSim,
  createSimCloud,
  eventInput,
  idSet,
  spikeDevice,
  startBoth,
} from "./spike-builders.js";

const CONVERGE_MS = 2_000;
const SETTLE_MS = 20_000;

const order = (device_id: string, id: string, order_id: string) =>
  eventInput(device_id, id, "order.created", { order_id, channel: "dine_in" });

describe("F3 — an oversized relayed cloud ack never crashes the follower (fix round F3 / 19 §5)", () => {
  it("F3/19 §5/DEC-SYNC-009: push_ack{origin_device_id: self, acked_watermark: ownHigh+1000} from the hub → no throw, checkpoint unchanged or clamped ≤ own high, and the session keeps processing (a later genuine relayed ack still drains the outbox)", () => {
    const sim = createSim({ seed: 1303 });
    // The WAN-less origin appends two events while solo — own high water 1.
    const w = lanOnlyDevice(sim, "dev-w", "counter_rn");
    sim.runFor(100);
    appendLan(w, order("dev-w", "f3-w-0", "f3-wo-0"));
    appendLan(w, order("dev-w", "f3-w-1", "f3-wo-1"));
    expect(w.store.status().own_high_water).toBe(1);

    // A top-ranked scripted peer appears and plays the hub half by hand (the
    // T-01-05 rawPeer idiom). The real sim-cloud can never produce a
    // beyond-high per-origin ack — which is the point: this pins the
    // forged-peer / wiped-origin-DR class the F3 ruling names, at the exact
    // wire surface (a LAN push_ack naming this device as origin, 19 §5).
    const puppet = rawPeer(sim, "dev-a", "counter_electron", { autoPong: true });
    sim.runFor(200); // w adopts dev-a as hub and hellos it
    expect(w.mesh.status().hub_id).toBe("dev-a");
    expect(puppet.received.some((r) => r.message.kind === "hello")).toBe(true);
    // The "hub" claims it already holds 0..1 (it relayed them before, says it).
    puppet.transport.send("dev-w", helloAck("f3-hub-session", true, 2));
    sim.runFor(50);

    // The poison frame: a relayed CLOUD ack claiming slots far beyond anything
    // this device ever appended (ownHigh + 1000).
    puppet.transport.send("dev-w", {
      v: 1,
      kind: "push_ack",
      acked_watermark: 1 + 1000,
      origin_device_id: "dev-w",
    });
    // RED today: store.advanceTo(1001) throws AckBeyondAppendedError out of the
    // mesh dispatch. Ruled: ignore-and-count / clamp — never crash (F3).
    expect(() => sim.runFor(500)).not.toThrow();

    // Ignore or clamp are BOTH ruled-acceptable; a crash or an over-advance is
    // not (19 §5 — the checkpoint never claims unappended slots).
    const acked = w.store.status().acked_watermark;
    expect(acked === null || acked <= 1).toBe(true);

    // The session keeps processing subsequent messages: a GENUINE relayed
    // cloud ack for the real high water still drains the outbox.
    puppet.transport.send("dev-w", {
      v: 1,
      kind: "push_ack",
      acked_watermark: 1,
      origin_device_id: "dev-w",
    });
    sim.runFor(500);
    expect(w.store.status().acked_watermark).toBe(1);
    expect(w.store.status().queue_depth).toBe(0);

    closeLan(w);
  });
});

describe("F4 — a demoted hub stops relaying (fix round F4 / DEC-SYNC-006 / DEC-SYNC-009)", () => {
  it("F4/DEC-SYNC-006/DEC-SYNC-009: after a higher-ranked device takes over (S1 takeover idiom), the demoted device sends NO third-party push to the cloud — even across a WAN reconnect, which replays hello_ack → relay resume against any stale latch", () => {
    const sim = createSim({ seed: 1404 });
    const cloud = createSimCloud({ sim });
    const z = spikeDevice(sim, cloud, "dev-z", "counter_electron"); // first hub
    startBoth(z);
    const w = lanOnlyDevice(sim, "dev-w", "kitchen"); // the WAN-less origin
    sim.runFor(CONVERGE_MS);
    expect(z.mesh.status().state).toBe("hub");
    expect(w.mesh.status().hub_id).toBe("dev-z");

    // While hub, dev-z relays the origin — its relay duty (and per-origin
    // relay cursor) is live.
    for (const i of [0, 1]) appendLan(w, order("dev-w", `f4-w-${i}`, `f4-wo-${i}`));
    sim.runFor(SETTLE_MS);
    expect(mergedOf(cloud, "dev-w").map((m) => m.lamport_seq)).toEqual([0, 1]);
    const relayedByZ = cloud
      .transcript()
      .filter(
        (t) =>
          t.direction === "in" &&
          t.device_id === "dev-z" &&
          t.message.kind === "push" &&
          t.message.events.some((e) => e.device_id === "dev-w"),
      );
    expect(relayedByZ.length).toBeGreaterThan(0); // sanity: dev-z WAS the relayer

    // A higher-ranked device joins (same class, lexicographically lower id
    // wins the tie — the mesh S1 staggered-takeover idiom): dev-z demotes.
    const a = spikeDevice(sim, cloud, "dev-a", "counter_electron");
    startBoth(a);
    sim.runFor(CONVERGE_MS);
    expect(a.mesh.status().state).toBe("hub");
    expect(z.mesh.status().state).toBe("follower");
    expect(w.mesh.status().hub_id).toBe("dev-a");

    // Post-demotion origin events: the NEW hub carries them (the branch still
    // converges); dev-z holds them only via fan-out.
    for (const i of [2, 3]) appendLan(w, order("dev-w", `f4-w-${i}`, `f4-wo-${i}`));
    sim.runFor(SETTLE_MS);
    expect(mergedOf(cloud, "dev-w").map((m) => m.lamport_seq)).toEqual([0, 1, 2, 3]);
    expect(w.store.status().acked_watermark).toBe(3);
    expect(idSet(z.store).has("f4-w-3")).toBe(true); // z holds the tail — relay bait

    // THE PIN: bounce the demoted device's WAN. Reconnect replays hello_ack →
    // relay resume — the strongest trigger a stale relay latch has. A follower
    // must never relay third-party events (F4 ruling; DEC-SYNC-006).
    const mark = cloud.transcript().length;
    cloud.cutFor("dev-z");
    sim.runFor(1_000);
    cloud.healFor("dev-z");
    sim.runFor(SETTLE_MS);
    const postDemotionRelays = cloud
      .transcript()
      .slice(mark)
      .filter(
        (t) =>
          t.direction === "in" &&
          t.device_id === "dev-z" &&
          t.message.kind === "push" &&
          t.message.events.some((e) => e.device_id !== "dev-z"),
      );
    // RED today: relayRequested latched during dev-z's hub tenure never clears
    // on demotion, so the reconnect's hello_ack → relayDrain re-pushes dev-w's
    // tail from the demoted follower.
    expect(postDemotionRelays).toHaveLength(0);

    closeAll([z, a]);
    closeLan(w);
  });
});

describe("F5 — a lost LAN ack-forward frame is re-forwarded on a later heartbeat (fix round F5 / 19 §5)", () => {
  it("F5/19 §5/DEC-SYNC-009: when a lossy LAN window swallows the hub's relayed-cloud-ack forward, a LATER heartbeat re-forwards it — the origin's checkpoint eventually drains; no single lost frame stalls it", () => {
    const sim = createSim({ seed: 1505 });
    const cloud = createSimCloud({ sim });
    cloud.cut(); // WAN down from t0 — the relay (and its ack) happen inside the lossy LAN window
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    startBoth(h);
    const w = lanOnlyDevice(sim, "dev-w", "counter_rn");
    sim.runFor(CONVERGE_MS);
    expect(w.mesh.status().hub_id).toBe("dev-hub");

    for (const i of [0, 1]) appendLan(w, order("dev-w", `f5-w-${i}`, `f5-wo-${i}`));
    sim.runFor(SETTLE_MS);
    expect(idSet(h.store).has("f5-w-0")).toBe(true); // LAN propagated; relay duty latched
    expect(w.store.status().acked_watermark).toBeNull(); // no cloud ack yet — ever (19 §5)

    // Every LAN frame now drops. The WAN heals: the hub relays, the cloud
    // acks, the hub records the per-origin cloud ack — and the heartbeat that
    // forwards it to the origin is LOST, like everything LAN in this window.
    // (Dropping the whole window is the deterministic way to guarantee the
    // forward attempt itself was among the lost frames; the pinned law is the
    // OUTCOME — the checkpoint still drains once the LAN heals.)
    sim.lan.policy({ dropRate: 1 });
    cloud.heal();
    sim.runFor(3_000); // hello+relay+ack ≈ 200 virtual ms; ≥1 heartbeat forward attempt falls inside
    expect(mergedOf(cloud, "dev-w").map((m) => m.lamport_seq)).toEqual([0, 1]); // the cloud acked the relay…
    expect(w.store.status().acked_watermark).toBeNull(); // …but the origin never heard

    // LAN heals: a LATER heartbeat must re-forward the recorded cloud ack
    // (replayWindowTo's per-heartbeat idiom; the receiver is idempotent).
    sim.lan.policy({ dropRate: 0 });
    sim.runFor(SETTLE_MS);
    // RED today: the forwardedCloudAck one-shot latch marked the DROPPED frame
    // as forwarded, so no re-send ever happens and the checkpoint stalls.
    expect(w.store.status().acked_watermark).toBe(1);
    expect(w.store.status().queue_depth).toBe(0);

    closeAll([h]);
    closeLan(w);
  });
});
