// Acceptance tests — T-01-05 binding scenarios S1–S4 (contract (d) targets) on the
// 20 §2.4 seeded sim: S1 staggered-attach election convergence + star topology
// (01-F12/F13), S2 re-election under hub loss inside REELECTION_BUDGET_MS (01-F13),
// S3 partition split-brain then heal → one hub + exact ledger union (01-F8/F14,
// HUB-ELECTION.md split-brain tolerance), S4 fast-path propagation under seeded
// loss/dup/latency — exactly-once per event id per receiver, per-origin lamport order,
// wire-asserted push → ack → fan-out (01-F15/F8). Authored from the kernel-tasks
// binding contract + HUB-ELECTION.md + PROTOCOL.md only (24 §3 step 2: read-only to
// the implementing session). Convergence is ledger set-equality + per-origin order,
// never fold identity (assumption 9; folds are T-01-04/T-01-06).

import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { electHub, HEARTBEAT_INTERVAL_MS, REELECTION_BUDGET_MS } from "../index.js";
import { must } from "./builders.js";
import {
  appendOn,
  batchEventIds,
  closeAll,
  isAscending,
  LOSSLESS,
  ledgerIds,
  type MeshDevice,
  meshDevice,
  originLamports,
} from "./mesh-builders.js";

const idsOf = (devices: readonly MeshDevice[]) => devices.map((d) => d.info.device_id);

/** Assert a converged mesh: every device's hub_id = elected winner, exactly one hub. */
const expectConverged = (devices: readonly MeshDevice[], expectedHub: string) => {
  let hubs = 0;
  for (const d of devices) {
    const s = d.session.status();
    expect(s.hub_id).toBe(expectedHub);
    if (d.info.device_id === expectedHub) {
      expect(s.state).toBe("hub");
      hubs++;
    } else {
      expect(s.state).toBe("follower");
    }
  }
  expect(hubs).toBe(1);
};

describe("S1 — election convergence under staggered attach (01-F13, 01-F12)", () => {
  it("S1/01-F13/01-F12: N devices attaching at staggered virtual times all converge on electHub(all peers), traffic forming a star on the hub", () => {
    const sim = createSim({ seed: 201 });
    sim.lan.policy(LOSSLESS);
    const plan: [string, "kitchen" | "counter_rn" | "counter_electron", number][] = [
      ["dev-c", "kitchen", 0], // solo hub first
      ["dev-b", "counter_rn", 700], // outranks kitchen → takes over
      ["dev-a", "counter_electron", 1_500], // outranks everyone → final hub
      ["dev-d", "counter_electron", 2_300], // tie with dev-a → dev-a keeps it
    ];
    const devices: MeshDevice[] = [];
    let elapsed = 0;
    for (const [id, cls, at] of plan) {
      sim.runFor(at - elapsed);
      elapsed = at;
      const d = meshDevice(sim, id, cls);
      d.session.start();
      devices.push(d);
    }
    sim.runFor(3 * HEARTBEAT_INTERVAL_MS);
    const expected = must(electHub(devices.map((d) => d.info)), "eligible winner");
    expect(expected).toBe("dev-a"); // anchor the pure function against the scenario
    expectConverged(devices, expected);
    // Star topology: in a settled window every follower exchanges wire traffic with
    // the hub only, and the hub touches every follower (heartbeats flow).
    const mark = sim.now();
    sim.runFor(3 * HEARTBEAT_INTERVAL_MS);
    const hub = must(
      devices.find((d) => d.info.device_id === expected),
      "hub device",
    );
    for (const d of devices) {
      if (d === hub) continue;
      const window = d.wire.filter((rec) => rec.at >= mark);
      expect(window.length).toBeGreaterThan(0);
      for (const rec of window) expect(rec.other).toBe(expected);
    }
    const hubCounterparties = new Set(hub.wire.filter((r) => r.at >= mark).map((r) => r.other));
    expect(hubCounterparties).toEqual(new Set(idsOf(devices).filter((id) => id !== expected)));
    closeAll(devices);
  });
});

describe("S2 — re-election under hub loss (01-F13: < 10 000 virtual ms)", () => {
  it("S2/01-F13: disconnect(hub) → every remaining device converges on the same new hub strictly inside REELECTION_BUDGET_MS", () => {
    const sim = createSim({ seed: 202 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_rn");
    const c = meshDevice(sim, "dev-c", "kitchen");
    const d = meshDevice(sim, "dev-d", "counter_rn");
    const devices = [a, b, c, d];
    for (const dv of devices) dv.session.start();
    sim.runFor(2_000);
    expectConverged(devices, "dev-a");
    sim.lan.disconnect("dev-a");
    sim.runFor(REELECTION_BUDGET_MS - 1); // strictly < the 01-F13 budget
    const remaining = [b, c, d];
    const expected = must(electHub(remaining.map((dv) => dv.info)), "post-loss winner");
    expect(expected).toBe("dev-b"); // counter_rn tie → lexicographically lowest id
    expectConverged(remaining, expected);
    closeAll(devices);
  });
});

describe("S3 — partition split-brain, then heal (01-F8, 01-F14, HUB-ELECTION.md)", () => {
  it("S3/01-F8/01-F14: each side elects its own hub and propagates internally; heal → one hub and every ledger = the exact union, once per id, per-origin lamport order intact", () => {
    const sim = createSim({ seed: 203 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_rn");
    const c = meshDevice(sim, "dev-c", "counter_electron");
    const d = meshDevice(sim, "dev-d", "kitchen");
    const devices = [a, b, c, d];
    for (const dv of devices) dv.session.start();
    sim.runFor(2_000);
    expectConverged(devices, "dev-a");
    const pre = appendOn(b); // reaches all four before the cut
    sim.runFor(2_000);
    for (const dv of devices) expect(ledgerIds(dv)).toContain(pre.id);

    sim.lan.partition(["dev-a", "dev-b"], ["dev-c", "dev-d"]);
    sim.runFor(REELECTION_BUDGET_MS);
    // Split-brain is safe by design: both sides run their own hub.
    expectConverged([a, b], "dev-a");
    expectConverged([c, d], "dev-c");

    const e1 = appendOn(b); // side 1 event
    const e2 = appendOn(d); // side 2 event
    sim.runFor(3_000);
    for (const dv of [a, b]) {
      expect(ledgerIds(dv)).toContain(e1.id);
      expect(ledgerIds(dv)).not.toContain(e2.id); // the cut drops cross-side delivery
    }
    for (const dv of [c, d]) {
      expect(ledgerIds(dv)).toContain(e2.id);
      expect(ledgerIds(dv)).not.toContain(e1.id);
    }

    sim.lan.heal();
    sim.runFor(REELECTION_BUDGET_MS);
    expectConverged(devices, "dev-a"); // the deterministic function converges both sides
    const union = new Set([pre.id, e1.id, e2.id]);
    for (const dv of devices) {
      const events = dv.store.readAllEvents();
      const ids = events.map((e) => e.id);
      expect(new Set(ids)).toEqual(union); // set-union merge (01-F38)
      expect(ids.length).toBe(union.size); // exactly once per id (01-F8)
      for (const origin of ["dev-b", "dev-d"]) {
        expect(isAscending(originLamports(events, origin))).toBe(true);
      }
    }
    closeAll(devices);
  });
});

describe("S4 — fast-path propagation under seeded loss/dup/latency (01-F15, 01-F8)", () => {
  it("S4/01-F15/01-F8: appended events reach every device exactly once with per-origin order intact; the hub wire shows push → push_ack → fan-out", () => {
    const sim = createSim({ seed: 204 });
    sim.lan.policy(LOSSLESS);
    const hub = meshDevice(sim, "dev-a", "counter_electron");
    const f1 = meshDevice(sim, "dev-b", "counter_rn");
    const f2 = meshDevice(sim, "dev-c", "kitchen");
    const devices = [hub, f1, f2];
    for (const dv of devices) dv.session.start();
    sim.runFor(2_000);
    expectConverged(devices, "dev-a");

    sim.lan.policy({ latency: [5, 60], dropRate: 0.2, duplicateRate: 0.25 });
    const mark = sim.now();
    const b1 = appendOn(f1);
    const c1 = appendOn(f2);
    sim.runFor(1_000);
    const b2 = appendOn(f1);
    const b3 = appendOn(f1);
    const c2 = appendOn(f2);
    // Correctness never depends on any single delivery: re-push + id-dedupe absorb
    // the seeded loss over a long chaos window, then a lossless tail lets stragglers land.
    sim.runFor(60_000);
    sim.lan.policy(LOSSLESS);
    sim.runFor(10_000);

    const union = new Set([b1.id, c1.id, b2.id, b3.id, c2.id]);
    for (const dv of devices) {
      const events = dv.store.readAllEvents();
      const ids = events.map((e) => e.id);
      expect(new Set(ids)).toEqual(union); // every event reached every device
      expect(ids.length).toBe(union.size); // exactly once per id per receiver (01-F8)
      expect(isAscending(originLamports(events, "dev-b"))).toBe(true);
      expect(isAscending(originLamports(events, "dev-c"))).toBe(true);
    }

    // Wire-asserted relay chain on the hub, per origin event: the first push
    // carrying the id arrives, an ack goes back to the origin no earlier, and an
    // event_batch carrying the id goes out to the *other* follower no earlier.
    const hubWire = hub.wire.filter((r) => r.at >= mark);
    const chains: [{ id: string }, string, string][] = [
      [b1, "dev-b", "dev-c"],
      [b2, "dev-b", "dev-c"],
      [b3, "dev-b", "dev-c"],
      [c1, "dev-c", "dev-b"],
      [c2, "dev-c", "dev-b"],
    ];
    for (const [ev, origin, other] of chains) {
      const firstPush = hubWire.find(
        (r) =>
          r.dir === "received" &&
          r.other === origin &&
          r.message.kind === "push" &&
          batchEventIds(r.message).includes(ev.id),
      );
      const t = must(firstPush, `push carrying ${ev.id} at the hub`).at;
      const ack = hubWire.find(
        (r) => r.dir === "sent" && r.other === origin && r.message.kind === "push_ack" && r.at >= t,
      );
      expect(ack, `push_ack to ${origin} after the push arrived`).toBeDefined();
      const fan = hubWire.find(
        (r) => r.dir === "sent" && r.other === other && batchEventIds(r.message).includes(ev.id),
      );
      expect(fan, `event_batch fanning ${ev.id} to ${other}`).toBeDefined();
      expect(must(fan).at).toBeGreaterThanOrEqual(t);
    }
    closeAll(devices);
  });
});
