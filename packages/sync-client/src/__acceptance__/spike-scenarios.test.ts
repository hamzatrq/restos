// Acceptance tests — T-01-06 spike exit run, SIM LEG scenarios X1–X6 (contract (g)).
// Authored from the kernel-tasks binding contract + PROTOCOL.md + HUB-ELECTION.md +
// FOLDS.md only (24 §3 step 2: read-only to the implementing session). The full fleet
// composes the LANDED mesh (createMeshSession over the sim LAN) + the NOT-YET-BUILT
// createCloudSession (over the landed sim-cloud double) under one createSim virtual
// clock — 3 devices counter_electron/counter_rn/kitchen ("Electron + 2 RN" read as host
// CLASSES, contract assumption 1). RED until createCloudSession exists is the point.
// X7–X9 (departed-origin, >500 backlog, quarantine) live in spike-scenarios-departed.

import { describe, expect, it } from "vitest";
import { HUB_LOSS_TIMEOUT_MS, REELECTION_BUDGET_MS } from "../index.js";
import { tempDbPath } from "./builders.js";
import { LOSSLESS } from "./mesh-builders.js";
import {
  type AppendedEvent,
  appendOn,
  assertConverged,
  createSim,
  createSimCloud,
  deviceMap,
  driveRush,
  eventInput,
  foldDigest,
  generateSpikeRush,
  idSet,
  p95,
  propagationTimes,
  type SpikeDevice,
  spikeDevice,
  startBoth,
  stopBoth,
  trio,
} from "./spike-builders.js";

const CONVERGE_MS = 2_000;
const SETTLE_MS = 20_000;

/** Serialisable outcome snapshot — the determinism oracle (same seed ⇒ deep-equal). */
const outcomeOf = (devices: readonly SpikeDevice[], cloud: ReturnType<typeof createSimCloud>) => ({
  digests: devices.map((d) => foldDigest(d.store)),
  merged: cloud.mergedStream().map((m) => [m.id, m.global_seq] as const),
});

/** WAN-up 3-device rush from a canonical seed, run to full settle. */
const runRush = (seed: number, orders: number) => {
  const sim = createSim({ seed });
  sim.lan.policy(LOSSLESS);
  const cloud = createSimCloud({ sim });
  const { all } = trio(sim, cloud);
  sim.runFor(CONVERGE_MS);
  const appended = driveRush(
    sim,
    deviceMap(all),
    generateSpikeRush({ seed, deviceIds: all.map((d) => d.device_id), orders }),
  );
  sim.runFor(SETTLE_MS);
  return { sim, cloud, devices: all, appended };
};

describe("X1 — rush baseline (01-N1 / 01-F34): fold identity ≡ refold() ≡ cloud-order replay", () => {
  it("X1/01-N1/01-F34: at quiescence every device holds each event exactly once, cloud-ordered, and its fold tables ≡ refold() ≡ a fresh store replaying mergedStream()", () => {
    const { cloud, devices, appended } = runRush(6001, 18);
    assertConverged(devices, cloud, appended);
    for (const d of devices) {
      stopBoth(d);
      d.store.close();
    }
  });

  it("X1/20 §2.4: same seed ⇒ deep-equal outcome (determinism — asserted on a re-run)", () => {
    const first = runRush(6001, 18);
    const firstOut = outcomeOf(first.devices, first.cloud);
    for (const d of first.devices) {
      stopBoth(d);
      d.store.close();
    }
    const second = runRush(6001, 18);
    const secondOut = outcomeOf(second.devices, second.cloud);
    for (const d of second.devices) {
      stopBoth(d);
      d.store.close();
    }
    expect(secondOut).toEqual(firstOut);
  });
});

// X1b — the reorder oracle. X1's rush generator is single-writer and emits no
// order.table_assigned, so "device fold ≡ cloud-order replay" never has to DISTINGUISH a
// store that honours adopted global_seq from one that ignores it (the provisional order
// already equals cloud order). This scenario forces a genuine reversal: two DIFFERENT
// devices assign the SAME order to different tables LAN-first (no global_seq — the
// provisional winner is the canonical key: later device_created_at, then device_id), then
// the cloud merges them in an order that REVERSES it (the provisional loser draws the
// higher global_seq). The store-level reversal is T-01-04 law 7 (folds-review.test.ts);
// this pins it end-to-end across 3 devices + the sim-cloud (contract (g) X1 / 01-N1).
const ASSIGN_A_DCA = 1_752_800_002_000; // A's assign: LATER device_created_at → provisional winner
const ASSIGN_B_DCA = 1_752_800_001_000; // B's assign: EARLIER → provisional loser (cloud reverses it)

/** table_id the device's open_orders holds for `order_id` (null if no row / unassigned). */
const tableIdOf = (d: SpikeDevice, order_id: string): string | null =>
  d.store.openOrders().find((r) => r.order_id === order_id)?.table_id ?? null;

type ReorderRun = {
  cloud: ReturnType<typeof createSimCloud>;
  devices: SpikeDevice[];
  appended: AppendedEvent[];
  provisional: (string | null)[]; // per-device table_id at LAN quiescence (pre-cloud)
  final: (string | null)[]; // per-device table_id at full convergence (post-cloud)
  assignAId: string;
  assignBId: string;
};

/**
 * One X1b run: LAN-first provisional convergence, then a staged cloud merge that reverses
 * it. WAN is cut per-device (heal() clears only the GLOBAL cut, not per-device cuts — the
 * sim-cloud contract), so healFor A→B→C admits them one at a time: A's events merge first
 * (global_seq 1, 2), then B's assign draws global_seq 3 — the highest, so cloud order wins.
 */
const runReorder = (seed: number): ReorderRun => {
  const sim = createSim({ seed });
  sim.lan.policy(LOSSLESS);
  const cloud = createSimCloud({ sim });
  const { a, b, all } = trio(sim, cloud);
  sim.runFor(CONVERGE_MS);

  // LAN-only: cut every device's WAN individually so the two assigns settle provisionally.
  for (const d of all) cloud.cutFor(d.device_id);
  sim.runFor(CONVERGE_MS);

  const order = `x1b-order-${seed}`;
  const appended: AppendedEvent[] = [];
  const record = (id: string, origin: string) => appended.push({ id, origin, at: sim.now() });

  // order.created on A → propagates over LAN so the assigns fold (not park).
  const created = appendOn(
    a,
    eventInput("dev-a", `x1b-created-${seed}`, "order.created", {
      order_id: order,
      channel: "dine_in",
    }),
  );
  record(created.id, "dev-a");
  sim.runFor(SETTLE_MS);

  // Two competing table_assigns from DIFFERENT devices; A's LATER device_created_at wins
  // the provisional canonical key (device_created_at, then device_id).
  const assignA = appendOn(
    a,
    eventInput(
      "dev-a",
      `x1b-assignA-${seed}`,
      "order.table_assigned",
      { order_id: order, table_id: "table-A" },
      ASSIGN_A_DCA,
    ),
  );
  record(assignA.id, "dev-a");
  const assignB = appendOn(
    b,
    eventInput(
      "dev-b",
      `x1b-assignB-${seed}`,
      "order.table_assigned",
      { order_id: order, table_id: "table-B" },
      ASSIGN_B_DCA,
    ),
  );
  record(assignB.id, "dev-b");
  sim.runFor(SETTLE_MS);

  const provisional = all.map((d) => tableIdOf(d, order));

  // Cloud reversal, staged: A merges first (order.created + assignA → global_seq 1, 2),
  // then B (assignB → global_seq 3, the highest — reverses the provisional winner), then
  // C catches the full merged stream.
  cloud.healFor("dev-a");
  sim.runFor(SETTLE_MS);
  cloud.healFor("dev-b");
  sim.runFor(SETTLE_MS);
  cloud.healFor("dev-c");
  sim.runFor(SETTLE_MS);

  const final = all.map((d) => tableIdOf(d, order));
  return {
    cloud,
    devices: all,
    appended,
    provisional,
    final,
    assignAId: assignA.id,
    assignBId: assignB.id,
  };
};

describe("X1b — cross-device table_assigned reversal (01-N1 / 01-F34 system-level)", () => {
  it("X1b/01-N1/01-F34: LAN-first provisional winner (canonical key) is reversed by cloud order — every device adopts the higher-global_seq table, fold ≡ refold() ≡ cloud-order replay", () => {
    const run = runReorder(6011);

    // Pre-convergence (LAN-only, no global_seq): the provisional canonical key decides —
    // A's later device_created_at wins the table on EVERY device (the reversal is not vacuous).
    expect(run.provisional).toEqual(["table-A", "table-A", "table-A"]);

    // The reversal driver: the cloud gave assignB (the provisional LOSER) the higher global_seq.
    const merged = run.cloud.mergedStream();
    const seqA = merged.find((m) => m.id === run.assignAId)?.global_seq ?? -1;
    const seqB = merged.find((m) => m.id === run.assignBId)?.global_seq ?? -1;
    expect(seqA).toBeGreaterThan(0); // both assigns merged
    expect(seqB).toBeGreaterThan(seqA); // provisional loser sorts LAST in cloud order

    // Post-convergence: the higher-global_seq winner replaces the provisional winner on
    // every device — a store that ignored adopted global_seq would still read "table-A".
    expect(run.final).toEqual(["table-B", "table-B", "table-B"]);
    expect(run.final).not.toEqual(run.provisional); // reversal genuinely observed

    // Full X1 oracle: fold tables byte-identical across devices ≡ each device's own
    // refold() ≡ a fresh store replaying mergedStream() in global_seq order.
    assertConverged(run.devices, run.cloud, run.appended);
    for (const d of run.devices) {
      stopBoth(d);
      d.store.close();
    }
  });

  it("X1b/20 §2.4: same seed ⇒ deep-equal outcome (determinism — the reorder path on a re-run)", () => {
    const first = runReorder(6011);
    const firstOut = outcomeOf(first.devices, first.cloud);
    for (const d of first.devices) {
      stopBoth(d);
      d.store.close();
    }
    const second = runReorder(6011);
    const secondOut = outcomeOf(second.devices, second.cloud);
    for (const d of second.devices) {
      stopBoth(d);
      d.store.close();
    }
    expect(secondOut).toEqual(firstOut);
  });
});

describe("X2 — WAN cut mid-rush (01-F8 / 19 §5): LAN keeps flowing, heal resumes convergence", () => {
  it("X2/01-F8/19 §5: with the WAN cut, new orders still reach all 3 over LAN (p95 < 1000 virtual ms); heal → push/catchup resume → full X1 identity", () => {
    const seed = 6002;
    const sim = createSim({ seed });
    sim.lan.policy(LOSSLESS);
    const cloud = createSimCloud({ sim });
    const { all } = trio(sim, cloud);
    sim.runFor(CONVERGE_MS);
    const ids = all.map((d) => d.device_id);
    const steps = generateSpikeRush({ seed, deviceIds: ids, orders: 18 });
    const half = Math.floor(steps.length / 2);
    const before = driveRush(sim, deviceMap(all), steps.slice(0, half));

    cloud.cut();
    const cutMark = sim.now();
    const during = driveRush(sim, deviceMap(all), steps.slice(half));
    sim.runFor(SETTLE_MS);
    // A sale is never blocked by sync: LAN-only orders reach every device.
    for (const d of all) {
      for (const e of during) expect(idSet(d.store).has(e.id)).toBe(true);
    }
    const cutTrace = sim.trace().filter((t) => t.at >= cutMark);
    const times = propagationTimes(cutTrace, during, ids);
    expect(times.length).toBe(during.length); // every cut-era event reached all 3 over LAN
    expect(p95(times)).toBeLessThan(1_000);

    cloud.heal();
    sim.runFor(SETTLE_MS);
    assertConverged(all, cloud, [...before, ...during]);
    for (const d of all) {
      stopBoth(d);
      d.store.close();
    }
  });
});

describe("X3 — partition + WAN cut, doubly degraded (01-F17 / 01-F38)", () => {
  it("X3/01-F17/01-F38: WAN cut AND LAN split {A}|{B,C}, both sides keep appending, each side runs its own hub; heal LAN then WAN → zero lost, zero duplicated, one hub, fold identity ≡ cloud-order replay", () => {
    const seed = 6003;
    const sim = createSim({ seed });
    sim.lan.policy(LOSSLESS);
    const cloud = createSimCloud({ sim });
    const { a, b, c, all } = trio(sim, cloud);
    sim.runFor(CONVERGE_MS);
    expect(a.mesh.status().state).toBe("hub"); // counter_electron leads the whole mesh
    const ids = all.map((d) => d.device_id);
    const prefix = driveRush(
      sim,
      deviceMap(all),
      generateSpikeRush({ seed, deviceIds: ids, orders: 6 }),
    );
    sim.runFor(SETTLE_MS);

    cloud.cut();
    sim.lan.partition(["dev-a"], ["dev-b", "dev-c"]);
    sim.runFor(REELECTION_BUDGET_MS);
    expect(a.mesh.status().state).toBe("solo"); // {A} alone → solo (acts as its own hub)
    expect(b.mesh.status().state).toBe("hub"); // {B,C} → counter_rn outranks kitchen
    expect(c.mesh.status().hub_id).toBe("dev-b");

    const split = driveRush(
      sim,
      deviceMap(all),
      generateSpikeRush({ seed: seed + 1, deviceIds: ids, orders: 6 }),
    );
    sim.runFor(SETTLE_MS);
    // The cut isolates the two sides: side-1 events never appear on side-2 while split.
    const sideOfA = new Set(a.store.readAllEvents().map((e) => e.id));
    const sideOfC = new Set(c.store.readAllEvents().map((e) => e.id));
    const aOwn = split.filter((e) => e.origin === "dev-a").map((e) => e.id);
    const cOwn = split.filter((e) => e.origin === "dev-c").map((e) => e.id);
    for (const id of aOwn) expect(sideOfC.has(id)).toBe(false);
    for (const id of cOwn) expect(sideOfA.has(id)).toBe(false);

    sim.lan.heal();
    sim.runFor(REELECTION_BUDGET_MS);
    cloud.heal();
    sim.runFor(SETTLE_MS);
    assertConverged(all, cloud, [...prefix, ...split]);
    expect(a.mesh.status().state).toBe("hub"); // one hub again
    for (const d of [b, c]) expect(d.mesh.status().hub_id).toBe("dev-a");
    for (const d of all) {
      stopBoth(d);
      d.store.close();
    }
  });
});

describe("X4 — plug-pull mid-print (01-F2): kill-seed survival + no phantom KOT", () => {
  it("X4/01-F2: the hub's held KOT job crashes before recording; reopen survives every confirmed event gap-free with tables ≡ refold(), no kot.printed for the held order; re-issue records once and the mesh reconverges to X1 identity", () => {
    const seed = 6004;
    const sim = createSim({ seed });
    sim.lan.policy(LOSSLESS);
    const cloud = createSimCloud({ sim });
    const pathA = tempDbPath();
    const a = spikeDevice(sim, cloud, "dev-a", "counter_electron", { path: pathA });
    const b = spikeDevice(sim, cloud, "dev-b", "counter_rn");
    const c = spikeDevice(sim, cloud, "dev-c", "kitchen");
    for (const d of [a, b, c]) startBoth(d);
    sim.runFor(CONVERGE_MS);
    expect(a.mesh.status().state).toBe("hub");
    const ids = ["dev-a", "dev-b", "dev-c"];
    const appended: AppendedEvent[] = [];
    const prefix = driveRush(
      sim,
      deviceMap([a, b, c]),
      generateSpikeRush({ seed, deviceIds: ids, orders: 6 }),
    );
    appended.push(...prefix);
    sim.runFor(SETTLE_MS);

    // A held order on the hub: created → confirmed → line_added ×2, KOT print HELD
    // (kot.printed NOT appended — the crash point is between printer-ack and append).
    const order = `held-order-${seed}`;
    const l1 = `held-l1-${seed}`;
    const l2 = `held-l2-${seed}`;
    const held: [string, Record<string, unknown>][] = [
      ["order.created", { order_id: order, channel: "dine_in" }],
      ["order.confirmed", { order_id: order }],
      [
        "order.line_added",
        { order_id: order, line_id: l1, item_id: "x", qty: 2, unit_price_paisa: 25_000 },
      ],
      [
        "order.line_added",
        { order_id: order, line_id: l2, item_id: "y", qty: 1, unit_price_paisa: 30_000 },
      ],
    ];
    held.forEach(([type, payload], i) => {
      const env = appendOn(a, eventInput("dev-a", `held-${seed}-${i}`, type, payload));
      appended.push({ id: env.id, origin: "dev-a", at: sim.now() });
    });
    sim.runFor(SETTLE_MS);
    const preKillOwn = a.store.readAllEvents().filter((e) => e.device_id === "dev-a");
    const preKillIds = new Set(preKillOwn.map((e) => e.id));

    // Plug-pull: the process dies — sessions vanish (timers gone), the store handle is
    // ABANDONED with no close() (the kill-seed law, 20 §2.6).
    stopBoth(a);
    sim.runFor(HUB_LOSS_TIMEOUT_MS + CONVERGE_MS); // B/C notice the hub loss and re-elect

    // Reopen on the same path — a fresh process attaching a fresh session set.
    const a2 = spikeDevice(sim, cloud, "dev-a", "counter_electron", { path: pathA });
    const reopenedOwn = a2.store.readAllEvents().filter((e) => e.device_id === "dev-a");
    expect(new Set(reopenedOwn.map((e) => e.id))).toEqual(preKillIds); // zero confirmed loss
    expect(reopenedOwn.map((e) => e.lamport_seq)).toEqual(
      Array.from({ length: reopenedOwn.length }, (_u, i) => i),
    ); // gap-free lamport (01-F3)
    const kotBefore = a2.store
      .readAllEvents()
      .filter(
        (e) => e.type === "kot.printed" && (e.payload as { order_id?: string }).order_id === order,
      );
    expect(kotBefore).toHaveLength(0); // no phantom kot.printed for the held job
    const digest = foldDigest(a2.store);
    a2.store.refold();
    expect(foldDigest(a2.store)).toBe(digest); // fold state ≡ refold() of the surviving ledger

    startBoth(a2);
    sim.runFor(SETTLE_MS);
    // Re-issue the held print on restart (a duplicate PHYSICAL print is acceptable and
    // flagged in the run log per contract (e) / assumption 5; the LEDGER records once).
    const reissued = appendOn(
      a2,
      eventInput("dev-a", `held-${seed}-kot`, "kot.printed", { order_id: order }),
    );
    appended.push({ id: reissued.id, origin: "dev-a", at: sim.now() });
    sim.runFor(SETTLE_MS);
    const kots = a2.store
      .readAllEvents()
      .filter(
        (e) => e.type === "kot.printed" && (e.payload as { order_id?: string }).order_id === order,
      );
    expect(kots).toHaveLength(1); // exactly one — no phantom, no ledger duplicate

    assertConverged([a2, b, c], cloud, appended);
    for (const d of [a2, b, c]) {
      stopBoth(d);
      d.store.close();
    }
    a.store.close(); // release the abandoned pre-crash handle (post-assert hygiene)
  });
});

describe("X5 — hub death + cold joiner (01-F13 / 01-F14)", () => {
  it("X5/01-F13/01-F14: killing the hub re-elects a new one < 10 000 virtual ms with zero loss, and a cold joiner attached after the kill is served the full branch window over LAN by the NEW hub", () => {
    const seed = 6005;
    const sim = createSim({ seed });
    sim.lan.policy(LOSSLESS);
    const cloud = createSimCloud({ sim });
    cloud.cut(); // LAN-only: the joiner must be served by the new HUB, not the cloud
    const { a, b, c, all } = trio(sim, cloud);
    sim.runFor(CONVERGE_MS);
    expect(a.mesh.status().state).toBe("hub");
    const ids = all.map((d) => d.device_id);
    const appended = driveRush(
      sim,
      deviceMap(all),
      generateSpikeRush({ seed, deviceIds: ids, orders: 8 }),
    );
    sim.runFor(SETTLE_MS);
    const union = new Set(appended.map((e) => e.id));
    for (const d of all) expect(idSet(d.store)).toEqual(union);

    sim.lan.disconnect("dev-a"); // hub vanishes
    stopBoth(a);
    sim.runFor(REELECTION_BUDGET_MS - 1); // strictly inside the 01-F13 budget
    expect(b.mesh.status().state).toBe("hub"); // counter_rn is the new hub
    expect(c.mesh.status().hub_id).toBe("dev-b");
    for (const d of [b, c]) expect(idSet(d.store)).toEqual(union); // zero loss across the kill

    const joiner = spikeDevice(sim, cloud, "dev-j", "kitchen"); // cold store, WAN still cut
    startBoth(joiner);
    sim.runFor(SETTLE_MS);
    expect(b.mesh.status().state).toBe("hub"); // kitchen joiner does not outrank counter_rn
    expect(idSet(joiner.store)).toEqual(union); // full branch window served over LAN (01-F14)

    for (const d of [b, c, joiner]) {
      stopBoth(d);
      d.store.close();
    }
    a.store.close();
  });
});

describe("X6 — propagation p95 (01-F15): LAN fast-path under a seeded adversarial policy", () => {
  it("X6/01-F15: with the WAN cut so only the LAN fast-path carries traffic, per-event time-to-last-connected-device p95 < 1000 virtual ms under latency [5,150]/drop 1%/dup 0.5%, and every event still lands exactly once", () => {
    const seed = 6006;
    const sim = createSim({ seed });
    const cloud = createSimCloud({ sim });
    cloud.cut(); // the metric must reflect one push→fan-out round, not the cloud plane
    sim.lan.policy(LOSSLESS);
    const { all } = trio(sim, cloud);
    sim.runFor(CONVERGE_MS);

    sim.lan.policy({ latency: [5, 150], dropRate: 0.01, duplicateRate: 0.005 });
    const ids = all.map((d) => d.device_id);
    const appended = driveRush(
      sim,
      deviceMap(all),
      generateSpikeRush({ seed, deviceIds: ids, orders: 40 }),
    );
    sim.runFor(30_000); // adversarial window — re-push + heartbeat re-fan recover dropped hops
    sim.lan.policy(LOSSLESS);
    sim.runFor(8_000); // lossless tail → deterministic eventual exactly-once

    const union = new Set(appended.map((e) => e.id));
    for (const d of all) {
      const held = d.store.readAllEvents().map((e) => e.id);
      expect(new Set(held)).toEqual(union); // reached every device
      expect(held.length).toBe(union.size); // exactly once per id per receiver (01-F8)
    }
    const times = propagationTimes(sim.trace(), appended, ids);
    expect(times.length).toBe(appended.length); // every event's last-device time measured
    expect(p95(times)).toBeLessThan(1_000);

    for (const d of all) {
      stopBoth(d);
      d.store.close();
    }
  });
});
