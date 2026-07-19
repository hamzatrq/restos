// Acceptance tests — T-01-06 spike exit run, SIM LEG scenarios X7–X9 (contract (g)),
// split from X1–X6 for size. Authored from the kernel-tasks binding contract +
// PROTOCOL.md + HUB-ELECTION.md + FOLDS.md only (24 §3 step 2: read-only to the
// implementing session). These compose the LANDED mesh + the NOT-YET-BUILT
// createCloudSession over the sim-cloud double under one virtual clock — RED until
// createCloudSession exists is the point.
//   X7 = DEC-SYNC-006 departed-origin heal (LAN heal alone does NOT converge the
//        departed origin's events; cloud catchup does).
//   X8 = >500 backlog (multi-page LAN session-cursor drain + chained cloud push pages
//        + ≥2-page WAN-only catchup).
//   X9 = storage_reject surfacing on-device (U+0000 → quarantine_notice at the origin,
//        the ack advances OVER the poisoned slot, DEC-SYNC-005 device half).

import { CATCHUP_PAGE_SIZE } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { must } from "./builders.js";
import {
  appendOn,
  closeAll,
  cloudReplayDigest,
  createSim,
  createSimCloud,
  deviceMap,
  driveRush,
  eventInput,
  foldDigest,
  generateOwnCreates,
  generateSpikeRush,
  idSet,
  spikeDevice,
  startBoth,
  stopBoth,
} from "./spike-builders.js";

const CONVERGE_MS = 2_000;
const SETTLE_MS = 20_000;

describe("X7 — departed-origin heal (DEC-SYNC-006 / 01-F38)", () => {
  it("X7/01-F38/DEC-SYNC-006: after the origin departs both planes, LAN heal alone provably does NOT converge its events onto the far device (followers push own events only); cloud catchup then delivers them and fold identity ≡ cloud-order replay across both survivors", () => {
    const seed = 6007;
    const sim = createSim({ seed });
    const cloud = createSimCloud({ sim });
    // Classes chosen so the DEC-SYNC-006 gap is REAL: after LAN heal {A,C}, C (electron)
    // is hub and A (kitchen) is a follower — a follower relays only its OWN events, so
    // the departed origin B's third-party events held by A never cross to C over LAN.
    const a = spikeDevice(sim, cloud, "dev-a", "kitchen"); // holds B's events, follower after heal
    const b = spikeDevice(sim, cloud, "dev-b", "counter_rn"); // the departing origin
    const c = spikeDevice(sim, cloud, "dev-c", "counter_electron"); // hub after heal, WAN-only survivor
    // WAN up for B only; LAN split so B's events reach A but never C.
    cloud.cutFor("dev-a");
    cloud.cutFor("dev-c");
    sim.lan.partition(["dev-a", "dev-b"], ["dev-c"]);
    for (const d of [a, b, c]) startBoth(d);
    sim.runFor(CONVERGE_MS);
    expect(b.mesh.status().state).toBe("hub"); // counter_rn leads {A,B}
    expect(a.mesh.status().hub_id).toBe("dev-b");

    // B appends: events reach A over LAN and the cloud over B's own session; C is isolated.
    const bEvents = driveRush(
      sim,
      deviceMap([a, b, c]),
      generateSpikeRush({ seed, deviceIds: ["dev-b"], orders: 3 }),
    );
    sim.runFor(SETTLE_MS);
    for (const e of bEvents) expect(idSet(a.store).has(e.id)).toBe(true);
    for (const e of bEvents) expect(idSet(c.store).has(e.id)).toBe(false);
    expect(cloud.mergedStream()).toHaveLength(bEvents.length); // B synced them to the cloud

    // B departs both planes (crash/leave): gone from LAN and WAN.
    sim.lan.disconnect("dev-b");
    cloud.cutFor("dev-b");
    stopBoth(b);
    sim.runFor(CONVERGE_MS);

    // LAN heals A↔C. C (electron) becomes hub, A (kitchen) a follower.
    sim.lan.heal();
    sim.runFor(SETTLE_MS);
    expect(c.mesh.status().state).toBe("hub");
    expect(a.mesh.status().hub_id).toBe("dev-c");
    // THE DOCUMENTED GAP (DEC-SYNC-006): LAN heal alone does NOT carry B's events to C.
    for (const e of bEvents) expect(idSet(c.store).has(e.id)).toBe(false);
    for (const e of bEvents) expect(idSet(a.store).has(e.id)).toBe(true); // A still holds them

    // Cloud catchup closes the gap: both survivors reconnect and pull B's merged events.
    cloud.healFor("dev-a");
    cloud.healFor("dev-c");
    sim.runFor(SETTLE_MS);
    for (const e of bEvents) {
      expect(idSet(a.store).has(e.id)).toBe(true);
      expect(idSet(c.store).has(e.id)).toBe(true); // cloud catchup delivered them
    }
    expect(foldDigest(a.store)).toBe(foldDigest(c.store));
    expect(foldDigest(a.store)).toBe(cloudReplayDigest(cloud)); // ≡ cloud-order replay

    closeAll([a, c]);
    b.store.close();
  });
});

describe("X8 — >500 backlog drain (01-F15 / 01-F8 / 01-F9)", () => {
  it("X8/01-F8/01-F9: a 1600-event WAN-cut backlog propagates over LAN via multi-page session-cursor drain, chains cloud push pages to acked_watermark == own_high_water on heal, and a cold WAN-only joiner pulls the branch through ≥2 catchup pages", () => {
    const seed = 6008;
    const COUNT = 1_600; // > 3× both 500 page constants
    const sim = createSim({ seed });
    sim.lan.policy({ latency: [5, 5], dropRate: 0, duplicateRate: 0 });
    const cloud = createSimCloud({ sim });
    cloud.cut(); // WAN down from t0

    // Phase 1 — LAN-connected rush: A (follower) drains its 1600-event backlog to the hub
    // H across multiple session-cursor pages (T-01-05 fix-round 1, at full scale).
    const h = spikeDevice(sim, cloud, "dev-h", "counter_electron"); // LAN hub
    const a = spikeDevice(sim, cloud, "dev-a", "counter_rn"); // the 1600-event appender (follower)
    for (const d of [h, a]) startBoth(d);
    sim.runFor(CONVERGE_MS);
    expect(h.mesh.status().state).toBe("hub");
    expect(a.mesh.status().hub_id).toBe("dev-h");

    for (const input of generateOwnCreates({ seed, device_id: "dev-a", count: COUNT })) {
      a.store.append(input); // bulk-append, then a SINGLE notify drives the paged ack-chain drain
    }
    a.mesh.notifyAppended();
    a.cloud.notifyAppended(); // WAN down — dropped
    sim.runFor(SETTLE_MS);
    expect(a.store.status().own_high_water).toBe(COUNT - 1);
    expect(idSet(h.store).size).toBe(COUNT); // full LAN propagation of the backlog

    // Phase 2 — WAN heal: A's cloud outbox drains in chained 500-pages to own_high_water.
    cloud.heal();
    sim.runFor(SETTLE_MS);
    expect(a.store.status().acked_watermark).toBe(COUNT - 1); // chained cloud push to the top
    expect(a.store.status().own_high_water).toBe(COUNT - 1);
    expect(a.store.status().queue_depth).toBe(0);
    expect(cloud.state().events).toBe(COUNT);

    // Phase 3 — a cold, LAN-disconnected joiner attaches WAN-only and catches up the branch.
    const joiner = spikeDevice(sim, cloud, "dev-c", "kitchen");
    sim.lan.disconnect("dev-c"); // never joins the LAN — the cloud is its only source
    startBoth(joiner);
    sim.runFor(SETTLE_MS);
    expect(idSet(joiner.store).size).toBe(COUNT); // pulled the whole branch via catchup

    const pages = cloud
      .transcript()
      .flatMap((t) =>
        t.direction === "out" && t.device_id === "dev-c" && t.message.kind === "catchup_response"
          ? [t.message]
          : [],
      );
    expect(pages.length).toBeGreaterThanOrEqual(2); // > 500 needs ≥ 2 pages
    expect(must(pages.at(-1)).complete).toBe(true); // the last page completes the branch
    expect(pages.slice(0, -1).every((p) => p.complete === false)).toBe(true); // earlier pages don't
    for (const p of pages) expect(p.events.length).toBeLessThanOrEqual(CATCHUP_PAGE_SIZE);
    const cursors = pages.map((p) => p.next_from);
    expect(cursors).toEqual([...cursors].sort((x, y) => x - y)); // next_from ascends across pages
    expect(must(cursors[0])).toBe(CATCHUP_PAGE_SIZE); // page 1 crosses the 500 boundary
    expect(pages.reduce((sum, p) => sum + p.events.length, 0)).toBe(COUNT); // no skip, no overlap

    closeAll([h, a, joiner]);
  });
});

describe("X9 — quarantine surfacing on-device (01-F37 / DEC-SYNC-005)", () => {
  it("X9/01-F37/DEC-SYNC-005: a registry-valid U+0000 event is storage_rejected at the cloud; the notice lands in the origin's status().quarantined, the ack advances OVER the poisoned slot so the outbox never wedges, later sales are unaffected, and the honest divergence (local fold has it, mergedStream does not) is observable", () => {
    const NUL = String.fromCharCode(0); // U+0000 kept out of source bytes — the storage_reject trigger
    const seed = 6009;
    const poisonOrderId = `order-${NUL}-poison-${seed}`;
    const sim = createSim({ seed });
    sim.lan.policy({ latency: [5, 5], dropRate: 0, duplicateRate: 0 });
    const cloud = createSimCloud({ sim });
    const a = spikeDevice(sim, cloud, "dev-a", "counter_electron");
    const b = spikeDevice(sim, cloud, "dev-b", "counter_rn");
    const c = spikeDevice(sim, cloud, "dev-c", "kitchen");
    for (const d of [a, b, c]) startBoth(d);
    sim.runFor(CONVERGE_MS);

    appendOn(
      a,
      eventInput("dev-a", `x9-0-${seed}`, "order.created", {
        order_id: `x9-clean0-${seed}`,
        channel: "dine_in",
      }),
    ); // lamport 0 — clean
    const poison = appendOn(
      a,
      eventInput("dev-a", `x9-poison-${seed}`, "order.created", {
        order_id: poisonOrderId,
        channel: "dine_in",
      }),
    ); // lamport 1 — storage_reject
    appendOn(
      a,
      eventInput("dev-a", `x9-2-${seed}`, "order.created", {
        order_id: `x9-clean2-${seed}`,
        channel: "dine_in",
      }),
    ); // lamport 2 — clean
    sim.runFor(SETTLE_MS);

    expect(a.cloud.status().quarantined).toContainEqual({
      event_id: poison.id,
      reason: "storage_reject",
    });
    // The ack advances OVER the poisoned slot — the outbox never wedges (01-F17 spirit).
    expect(a.store.status().own_high_water).toBe(2);
    expect(a.store.status().acked_watermark).toBe(2);
    expect(a.store.status().queue_depth).toBe(0);
    expect(cloud.mergedStream().some((m) => m.id === poison.id)).toBe(false); // never merged
    expect(cloud.mergedStream()).toHaveLength(2); // both clean events merged
    // Honest divergence: the origin's local fold DOES contain the poison order.
    expect(a.store.openOrders().some((o) => o.order_id === poisonOrderId)).toBe(true);
    // System-wide honesty: the LAN carried the (registry-valid) event to a peer too.
    expect(idSet(b.store).has(poison.id)).toBe(true);

    // Later sales are unaffected (01-F17): a subsequent clean event merges and acks.
    appendOn(
      a,
      eventInput("dev-a", `x9-3-${seed}`, "order.created", {
        order_id: `x9-clean3-${seed}`,
        channel: "dine_in",
      }),
    );
    sim.runFor(SETTLE_MS);
    expect(a.store.status().acked_watermark).toBe(3);
    expect(cloud.mergedStream()).toHaveLength(3);

    closeAll([a, b, c]);
  });
});
