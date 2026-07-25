// Acceptance tests — T-01-12 hub-relayed cloud uplink for WAN-less devices
// (DEC-SYNC-009, accepted — the LAUNCH BLOCKER: under the superseded
// DEC-SYNC-004 a LAN-only device's events reach the counter over LAN but NEVER
// reach the cloud). Authored from specs/DECISIONS.md (DEC-SYNC-009,
// DEC-SYNC-005), specs/01-kernel-sync.md (01-F13 amended, 01-F9, 01-F8, 01-F1,
// 01-F37), PROTOCOL.md and the T-01-12 contract ONLY (24 §3 step 2: read-only
// to the implementing session).
//
// RED-AWAITING-IMPLEMENTATION is the point: the shipped mesh never forwards
// third-party events to the cloud (followers and hubs push OWN events only) and
// the shipped cloud session drains store.nextBatch (own outbox) — so every
// relay assertion below fails today because the LAN-only origin's events are
// simply absent from the merged cloud log and its cloud checkpoint never moves.
// R4 and the first half of R6 are GREEN pins: behaviour that must SURVIVE the
// relay change (no double-merge; LAN ack alone never moves the checkpoint).
//
// Scenario map (T-01-12 "tests owed" + oracle cover):
//   R1 — a device with NO cloud transport converges: events reach the merged
//        log verbatim via the hub, and the cloud ack propagates back over LAN
//        so its outbox drains (01-F13/01-F9/01-F1/01-F8).
//   R2 — hub dies mid-relay; the re-elected hub completes the relay with no
//        gaps and no duplicates in the merged log (01-F13/01-F8).
//   R3 — a poison event relayed by the hub fills its origin's lamport slot at
//        the cloud; the origin's outbox never wedges (DEC-SYNC-005/01-F37/01-F17).
//   R4 — a device WITH WAN keeps its own cloud session; relay never
//        double-merges (01-F8; green pin).
//   R5 — relayed events return to the pushing hub via origin-inclusive fan-out
//        with global_seq; adoption is ZERO fold work (01-F34; reuses the landed
//        T-01-15 foldStats observable — invariance itself is NOT re-pinned).
//   R6 — the LAN ack alone never moves the origin's cloud write-checkpoint
//        (19 §5; green half); only the relayed CLOUD ack drains it (red half).

import { describe, expect, it } from "vitest";
import {
  appendedBody,
  appendLan,
  attestedBody,
  closeLan,
  lanOnlyDevice,
  mergedOf,
} from "./relay-builders.js";
import {
  appendOn,
  closeAll,
  createSim,
  createSimCloud,
  eventInput,
  idSet,
  spikeDevice,
  startBoth,
  stopBoth,
} from "./spike-builders.js";

const CONVERGE_MS = 2_000;
const SETTLE_MS = 20_000;

const order = (device_id: string, id: string, order_id: string) =>
  eventInput(device_id, id, "order.created", { order_id, channel: "dine_in" });

describe("R1 — LAN-only device converges through the hub relay (01-F13 / DEC-SYNC-009)", () => {
  it("R1/01-F13/01-F9/01-F1/DEC-SYNC-009: a device with NO cloud transport reaches the merged cloud log via the hub — origin device_id/lamport_seq/payload verbatim — and its outbox drains on the LAN-propagated cloud ack (01-F8)", () => {
    const sim = createSim({ seed: 1201 });
    const cloud = createSimCloud({ sim });
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    startBoth(h);
    const w = lanOnlyDevice(sim, "dev-wanless", "counter_rn");
    sim.runFor(CONVERGE_MS);
    expect(h.mesh.status().state).toBe("hub");
    expect(w.mesh.status().hub_id).toBe("dev-hub");

    const wEvents = [0, 1, 2].map((i) =>
      appendLan(w, order("dev-wanless", `r1-w-${i}`, `r1-wo-${i}`)),
    );
    const hEvent = appendOn(h, order("dev-hub", "r1-h-0", "r1-ho-0"));
    sim.runFor(SETTLE_MS);

    // Landed LAN behaviour (sanity, green): the hub holds the origin's events.
    for (const e of wEvents) expect(idSet(h.store).has(e.id)).toBe(true);

    // THE RELAY (01-F13 amended; DEC-SYNC-009): the WAN-less origin's events are
    // in the merged cloud log, exactly once, in per-origin lamport order.
    const mergedW = mergedOf(cloud, "dev-wanless");
    expect(mergedW.map((m) => m.id)).toEqual(["r1-w-0", "r1-w-1", "r1-w-2"]);
    expect(mergedW.map((m) => m.lamport_seq)).toEqual([0, 1, 2]);
    // 01-F1 — attested, never re-authored: byte-fidelity of everything the
    // origin signed off on (only the two cloud stamps differ).
    mergedW.forEach((m, i) => {
      expect(attestedBody(m)).toEqual(
        appendedBody(wEvents[i] as unknown as Record<string, unknown>),
      );
    });
    // Per-device sessions remain the default: the hub's own event merged too.
    expect(mergedOf(cloud, "dev-hub").map((m) => m.id)).toEqual([hEvent.id]);

    // The origin learned its events were CLOUD-acked over the LAN — the outbox
    // drains (T-01-12 device-side ruling; 01-F8/19 §5). The hub never wrote the
    // origin's store; the origin advanced its own checkpoint on the relayed ack.
    expect(w.store.status().own_high_water).toBe(2);
    expect(w.store.status().acked_watermark).toBe(2);
    expect(w.store.status().queue_depth).toBe(0);

    closeAll([h]);
    closeLan(w);
  });
});

describe("R2 — hub failover mid-relay (01-F13 / DEC-SYNC-009)", () => {
  it("R2/01-F13/01-F8/DEC-SYNC-009: the hub dies mid-relay; the re-elected hub completes the origin's relay from its ack watermark — merged exactly once, gap-free, no duplicates; the origin's outbox drains fully", () => {
    const sim = createSim({ seed: 1202 });
    const cloud = createSimCloud({ sim });
    const a = spikeDevice(sim, cloud, "dev-a", "counter_electron"); // first hub
    const b = spikeDevice(sim, cloud, "dev-b", "counter_rn"); // hub after failover
    for (const d of [a, b]) startBoth(d);
    const w = lanOnlyDevice(sim, "dev-w", "kitchen"); // the WAN-less origin
    sim.runFor(CONVERGE_MS);
    expect(a.mesh.status().state).toBe("hub");
    expect(w.mesh.status().hub_id).toBe("dev-a");

    // First relay leg: A relays the origin's opening events.
    for (const i of [0, 1, 2]) appendLan(w, order("dev-w", `r2-w-${i}`, `r2-wo-${i}`));
    sim.runFor(SETTLE_MS);
    expect(mergedOf(cloud, "dev-w").map((m) => m.id)).toEqual(["r2-w-0", "r2-w-1", "r2-w-2"]);

    // A dies both planes mid-run (X7 idiom).
    sim.lan.disconnect("dev-a");
    cloud.cutFor("dev-a");
    stopBoth(a);
    sim.runFor(SETTLE_MS); // re-election budget is 10 000 virtual ms (01-F13)
    expect(b.mesh.status().state).toBe("hub");
    expect(w.mesh.status().hub_id).toBe("dev-b");

    // Second relay leg: the NEW hub carries the origin's tail. Any re-relay of
    // the already-merged prefix must be absorbed by id-dedupe (01-F8) — the
    // merged log stays exactly-once and per-origin gap-free.
    for (const i of [3, 4, 5]) appendLan(w, order("dev-w", `r2-w-${i}`, `r2-wo-${i}`));
    sim.runFor(SETTLE_MS);

    const mergedW = mergedOf(cloud, "dev-w");
    expect(mergedW.map((m) => m.id)).toEqual([
      "r2-w-0",
      "r2-w-1",
      "r2-w-2",
      "r2-w-3",
      "r2-w-4",
      "r2-w-5",
    ]);
    expect(mergedW.map((m) => m.lamport_seq)).toEqual([0, 1, 2, 3, 4, 5]); // no gaps, no dupes
    expect(w.store.status().acked_watermark).toBe(5); // the new hub's relay ack reached the origin
    expect(w.store.status().queue_depth).toBe(0);

    closeAll([b]);
    a.store.close();
    closeLan(w);
  });
});

describe("R3 — relayed poison fills the origin's slot (DEC-SYNC-005 / 01-F37)", () => {
  it("R3/DEC-SYNC-005/01-F37/01-F17: a U+0000 poison event relayed by the hub is quarantined at the cloud with its ORIGIN's lamport slot filled — the origin's outbox never wedges and later sales still merge", () => {
    const NUL = String.fromCharCode(0); // storage_reject trigger, kept out of source bytes
    const sim = createSim({ seed: 1203 });
    const cloud = createSimCloud({ sim });
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    startBoth(h);
    const w = lanOnlyDevice(sim, "dev-w", "counter_rn");
    sim.runFor(CONVERGE_MS);
    expect(w.mesh.status().hub_id).toBe("dev-hub");

    appendLan(w, order("dev-w", "r3-w-0", "r3-wo-0")); // lamport 0 — clean
    const poison = appendLan(w, order("dev-w", "r3-w-1", `r3-${NUL}-poison`)); // lamport 1
    appendLan(w, order("dev-w", "r3-w-2", "r3-wo-2")); // lamport 2 — clean
    sim.runFor(SETTLE_MS);

    // The relay carried all three up; the cloud storage_rejected the poison and
    // filled the ORIGIN's slot 1 (DEC-SYNC-005) — the ack advances over it.
    expect(w.store.status().own_high_water).toBe(2);
    expect(w.store.status().acked_watermark).toBe(2); // never wedges on the poison
    expect(w.store.status().queue_depth).toBe(0);
    expect(mergedOf(cloud, "dev-w").map((m) => m.id)).toEqual(["r3-w-0", "r3-w-2"]);
    expect(cloud.mergedStream().some((m) => m.id === poison.id)).toBe(false); // never merged

    // Later sales unaffected (01-F17): the next event relays, merges and acks.
    appendLan(w, order("dev-w", "r3-w-3", "r3-wo-3"));
    sim.runFor(SETTLE_MS);
    expect(w.store.status().acked_watermark).toBe(3);
    expect(mergedOf(cloud, "dev-w").map((m) => m.id)).toEqual(["r3-w-0", "r3-w-2", "r3-w-3"]);

    closeAll([h]);
    closeLan(w);
  });
});

describe("R4 — per-device sessions remain the default (01-F8; green pin)", () => {
  it("R4/01-F8/DEC-SYNC-009: a device WITH WAN still pushes its own events over its own cloud session; hub relay must never double-merge them — the merged log holds each event exactly once", () => {
    const sim = createSim({ seed: 1204 });
    const cloud = createSimCloud({ sim });
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    const d = spikeDevice(sim, cloud, "dev-d", "counter_rn"); // WAN + LAN follower
    for (const x of [h, d]) startBoth(x);
    sim.runFor(CONVERGE_MS);
    expect(d.mesh.status().hub_id).toBe("dev-hub");

    for (const i of [0, 1, 2]) appendOn(d, order("dev-d", `r4-d-${i}`, `r4-do-${i}`));
    sim.runFor(SETTLE_MS);

    // Both delivery paths may exist (own session; hub relay once T-01-12 lands) —
    // the merged log must hold each event EXACTLY once (id dedupe, 01-F8).
    const mergedD = mergedOf(cloud, "dev-d");
    expect(mergedD.map((m) => m.id)).toEqual(["r4-d-0", "r4-d-1", "r4-d-2"]);
    expect(mergedD.map((m) => m.lamport_seq)).toEqual([0, 1, 2]);
    expect(cloud.mergedStream()).toHaveLength(3); // nothing double-merged branch-wide
    expect(d.store.status().acked_watermark).toBe(2);
    expect(d.store.status().queue_depth).toBe(0);

    closeAll([h, d]);
  });
});

describe("R5 — origin-inclusive fan-out + zero-work adoption for relayed events (01-F34)", () => {
  it("R5/01-F34/DEC-SYNC-009: relayed events return to the pushing hub with global_seq via origin-inclusive fan-out; the hub adopts them as a pure sidecar write — ZERO fold work (landed foldStats observable)", () => {
    const sim = createSim({ seed: 1205 });
    const cloud = createSimCloud({ sim });
    cloud.cut(); // WAN down from t0 — LAN propagates first, relay happens on heal
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    startBoth(h);
    const w = lanOnlyDevice(sim, "dev-w", "counter_rn");
    sim.runFor(CONVERGE_MS);
    expect(w.mesh.status().hub_id).toBe("dev-hub");

    const wEvents = [0, 1, 2, 3].map((i) =>
      appendLan(w, order("dev-w", `r5-w-${i}`, `r5-wo-${i}`)),
    );
    sim.runFor(SETTLE_MS);
    // LAN carried and folded them on the hub already (landed behaviour).
    for (const e of wEvents) expect(idSet(h.store).has(e.id)).toBe(true);
    const foldedBefore = h.store.foldStats().events_folded;

    cloud.heal();
    sim.runFor(SETTLE_MS);

    // The relay merged the origin's events (RED today — no relay exists)…
    const mergedW = mergedOf(cloud, "dev-w");
    expect(mergedW.map((m) => m.id)).toEqual(wEvents.map((e) => e.id));
    // …every one came back to the pushing hub with a global_seq (origin-inclusive
    // fan-out, 01-F9/01-F34) and the hub's pull cursor tracked the log…
    expect(h.cloud.status().last_global_seq).toBe(cloud.state().last_global_seq);
    // …and adoption did ZERO fold work on the hub: the events were already held
    // from LAN ingest, so the fan-out's duplicate-id + global_seq path is a pure
    // sidecar write (T-01-15 law, reused — not re-pinned here).
    expect(h.store.foldStats().events_folded).toBe(foldedBefore);

    closeAll([h]);
    closeLan(w);
  });
});

describe("R6 — the checkpoint law across the relay (19 §5 / 01-F8)", () => {
  it("R6/01-F8/19 §5/DEC-SYNC-009: with WAN down, LAN propagation alone NEVER advances the origin's cloud write-checkpoint (green half); after heal the hub's relay + the propagated CLOUD ack drain it (red half)", () => {
    const sim = createSim({ seed: 1206 });
    const cloud = createSimCloud({ sim });
    cloud.cut(); // WAN down from t0
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    startBoth(h);
    const w = lanOnlyDevice(sim, "dev-w", "counter_rn");
    sim.runFor(CONVERGE_MS);
    expect(w.mesh.status().hub_id).toBe("dev-hub");

    for (const i of [0, 1]) appendLan(w, order("dev-w", `r6-w-${i}`, `r6-wo-${i}`));
    sim.runFor(SETTLE_MS);

    // GREEN pin (19 §5, landed law that must SURVIVE T-01-12): the LAN hub ack
    // is session-local and volatile — the cloud write-checkpoint has not moved.
    expect(idSet(h.store).has("r6-w-0")).toBe(true); // LAN did propagate
    expect(w.store.status().own_high_water).toBe(1);
    expect(w.store.status().acked_watermark).toBeNull(); // no cloud ack yet — ever
    expect(cloud.mergedStream()).toHaveLength(0); // nothing reached the cloud

    // RED half: on WAN heal the hub relays and the CLOUD ack — only that ack —
    // propagates back over LAN and drains the origin's outbox.
    cloud.heal();
    sim.runFor(SETTLE_MS);
    expect(mergedOf(cloud, "dev-w").map((m) => m.lamport_seq)).toEqual([0, 1]);
    expect(w.store.status().acked_watermark).toBe(1);
    expect(w.store.status().queue_depth).toBe(0);

    closeAll([h]);
    closeLan(w);
  });
});
