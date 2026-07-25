// Acceptance tests — T-01-17, 01-F43 end to end on the LAN mesh: the elected hub
// (01-F13) is the branch time authority, followers acquire an offset on hub contact,
// and DURATIONS come out right on a branch whose shared clock is collectively wrong.
//
// The central claim of DEC-TIME-001(a): "durations need a consistent clock, not a
// correct one — a uniform offset cancels in a difference". This suite constructs
// the hostile case the founder's threat model demands (every device arbitrarily
// wrong, in either direction, by a different amount — and the HUB wrong too, so
// branch time itself is collectively wrong) and asserts the computed order age is
// nonetheless the TRUE elapsed time.
//
// Authored from specs/01-kernel-sync.md (01-F43, 01-F44, 01-F13, 01-F17, 01-N2),
// specs/DECISIONS.md (DEC-TIME-001) and specs/25-fold-performance.md §14 ONLY —
// never from an implementation (24 §3 step 2: read-only to the implementing session).
//
// DELIBERATELY UNPINNED: how a follower measures the hub's clock. 01-F43 requires
// an offset "against hub time, refreshed on hub contact" and names no protocol, so
// this suite asserts the measured OUTCOME within a tolerance that any sane sampling
// meets on the sim's 5 ms LAN — never a wire shape.
//
// RED-AWAITING-IMPLEMENTATION: no offset acquisition exists in the mesh session.
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { orderConfirmed, orderCreated } from "./builders.js";
import {
  appendAt,
  branchTimeStatus,
  closeMesh,
  LOSSLESS,
  timeMeshDevice,
} from "./time-builders.js";

const MINUTE = 60_000;
const YEAR_MS = 365 * 24 * 60 * MINUTE;

/** One-way LAN delay is 5 ms under LOSSLESS; any sampling scheme lands well inside
 * this. Chosen so it can absorb a whole round trip and still be five orders of
 * magnitude below the errors the suite is actually detecting (years, minutes). */
const OFFSET_TOLERANCE_MS = 50;

const closeTo = (actual: number, expected: number, tolerance = OFFSET_TOLERANCE_MS): void => {
  expect(
    Math.abs(actual - expected),
    `${actual} within ${tolerance} of ${expected}`,
  ).toBeLessThanOrEqual(tolerance);
};

describe("01-F43 — the elected hub is the branch time authority (01-F13)", () => {
  it("01-F43/01-F13: the hub's own offset is 0 and its basis is branch — it does not measure itself", () => {
    const sim = createSim({ seed: 1701 });
    sim.lan.policy(LOSSLESS);
    // counter_electron outranks kitchen (01-F13 election order), so `hub` wins.
    const hub = timeMeshDevice(sim, "dev-a-hub", 11 * YEAR_MS, "counter_electron");
    const follower = timeMeshDevice(sim, "dev-b", -2 * YEAR_MS, "kitchen");
    hub.session.start();
    follower.session.start();
    sim.runFor(10_000);
    expect(hub.session.status().state).toBe("hub");
    expect(branchTimeStatus(hub.store)).toEqual({
      offset_ms: 0,
      basis: "branch",
      skew_ms: 0,
      skew_flagged: false,
    });
    closeMesh([hub, follower]);
  });

  it("01-F43: a follower acquires its offset on hub contact — basis flips branch_provisional → branch and the offset is hub_clock − own_clock", () => {
    const sim = createSim({ seed: 1702 });
    sim.lan.policy(LOSSLESS);
    const hub = timeMeshDevice(sim, "dev-a-hub", 3 * YEAR_MS, "counter_electron");
    const follower = timeMeshDevice(sim, "dev-b", -5 * YEAR_MS, "kitchen");
    hub.session.start();
    // Before any contact the follower is provisional (01-F44).
    expect(branchTimeStatus(follower.store).basis).toBe("branch_provisional");
    expect(branchTimeStatus(follower.store).offset_ms).toBe(0);
    follower.session.start();
    sim.runFor(10_000);
    expect(follower.session.status().state).toBe("follower");
    const status = branchTimeStatus(follower.store);
    expect(status.basis).toBe("branch");
    closeTo(status.offset_ms, hub.skew_ms - follower.skew_ms);
    // …and the follower's branch time now agrees with the hub's own clock.
    closeTo(follower.branchNow(), hub.deviceNow());
    // 01-N2: eight years of skew against hub time is flagged, observationally.
    expect(status.skew_flagged).toBe(true);
    closeMesh([hub, follower]);
  });

  it("01-F43/01-F44: a device that never sees a hub keeps stamping branch_provisional — and keeps selling (01-F17)", () => {
    const sim = createSim({ seed: 1703 });
    sim.lan.policy(LOSSLESS);
    const alone = timeMeshDevice(sim, "dev-z-waiter", 6 * YEAR_MS, "waiter"); // never hub-eligible
    alone.session.start();
    sim.runFor(20_000);
    expect(alone.session.status().hub_id).toBeNull(); // no hub in this branch at all
    const created = appendAt(alone, orderCreated("O1"));
    appendAt(alone, orderConfirmed("O1"));
    expect(created.time_basis).toBe("branch_provisional");
    expect(created.branch_created_at).toBe(created.device_created_at); // offset 0
    expect(alone.store.openOrders()).toHaveLength(1);
    expect(alone.store.kitchenQueue()).toHaveLength(1);
    closeMesh([alone]);
  });
});

describe("01-F43 — durations are right on a branch whose shared clock is collectively WRONG", () => {
  it("01-F43/DEC-TIME-001(a): with every device (INCLUDING the hub) years off by different amounts, order age equals the true elapsed time — the uniform offset cancels", () => {
    const sim = createSim({ seed: 1704 });
    sim.lan.policy(LOSSLESS);
    // The hub itself is 12 years fast, so branch time is collectively WRONG — this
    // is the fully-offline case where branch time is merely self-consistent. The
    // other two are wrong by different amounts and in the other direction.
    const hub = timeMeshDevice(sim, "dev-a-hub", 12 * YEAR_MS, "counter_electron");
    const counter = timeMeshDevice(sim, "dev-b-counter", -7 * YEAR_MS + 83 * MINUTE, "counter_rn");
    const kitchen = timeMeshDevice(sim, "dev-c-kitchen", 4 * YEAR_MS - 11 * MINUTE, "kitchen");
    const devices = [hub, counter, kitchen];
    for (const d of devices) d.session.start();
    sim.runFor(10_000); // elect + acquire offsets

    expect(hub.session.status().state).toBe("hub");
    for (const d of [counter, kitchen]) {
      expect(branchTimeStatus(d.store).basis, d.info.device_id).toBe("branch");
    }

    // The counter confirms an order at a TRUE instant…
    const trueConfirmAt = sim.now();
    appendAt(counter, orderCreated("O1"));
    appendAt(counter, orderConfirmed("O1"));

    // …the kitchen sees it over the LAN, and 20 real minutes pass.
    const ELAPSED = 20 * MINUTE;
    sim.runFor(ELAPSED);
    const trueNow = sim.now();
    expect(trueNow - trueConfirmAt).toBeGreaterThanOrEqual(ELAPSED);

    const ticket = kitchen.store.kitchenQueue().find((row) => row.order_id === "O1");
    expect(ticket, "the confirmed order reached the kitchen over the LAN").toBeDefined();
    if (ticket === undefined) throw new Error("unreachable: asserted defined above");

    // THE PROPERTY: age computed in branch time on a THIRD device equals the true
    // elapsed time, even though no device's clock is within years of the truth.
    const age = kitchen.branchNow() - ticket.age_basis;
    closeTo(age, trueNow - trueConfirmAt, 2 * OFFSET_TOLERANCE_MS);

    // Self-evidencing: the naive reading — the kitchen's own clock minus the
    // ORIGIN's raw device stamp — is wrong by more than a decade. That difference
    // is the whole point of the layer, and it is what shipped before T-01-17.
    const rawOrigin = kitchen.store.readAllEvents().find((e) => e.type === "order.confirmed");
    expect(rawOrigin).toBeDefined();
    const naiveAge = kitchen.deviceNow() - (rawOrigin?.device_created_at as number);
    expect(Math.abs(naiveAge - (trueNow - trueConfirmAt))).toBeGreaterThan(YEAR_MS);

    // And branch time is genuinely SHARED: every device answers the same instant.
    closeTo(counter.branchNow(), kitchen.branchNow());
    closeTo(hub.branchNow(), kitchen.branchNow());
    // …while being collectively wrong by the hub's own error (01-F43: consistent,
    // not necessarily correct — correct only when the hub has real internet).
    expect(Math.abs(kitchen.branchNow() - trueNow)).toBeGreaterThan(11 * YEAR_MS);

    closeMesh(devices);
  });

  it("01-F43: the branch stamp carried by an event is the ORIGIN's, so every device reads one identical age_basis for the same ticket", () => {
    const sim = createSim({ seed: 1705 });
    sim.lan.policy(LOSSLESS);
    const hub = timeMeshDevice(sim, "dev-a-hub", -9 * YEAR_MS, "counter_electron");
    const counter = timeMeshDevice(sim, "dev-b-counter", 2 * YEAR_MS, "counter_rn");
    const kitchen = timeMeshDevice(sim, "dev-c-kitchen", 40 * MINUTE, "kitchen");
    const devices = [hub, counter, kitchen];
    for (const d of devices) d.session.start();
    sim.runFor(10_000);

    appendAt(counter, orderCreated("O7"));
    appendAt(counter, orderConfirmed("O7"));
    sim.runFor(10_000);

    const bases = devices.map(
      (d) => d.store.kitchenQueue().find((row) => row.order_id === "O7")?.age_basis,
    );
    expect(bases.every((b) => b !== undefined)).toBe(true);
    expect(new Set(bases).size, `one shared age_basis, got ${JSON.stringify(bases)}`).toBe(1);
    // …and that one shared value is the ORIGIN's BRANCH stamp, not its device clock
    // (the counter is two years fast, so the two differ by two years).
    const originConfirm = counter.store
      .readOwnEvents()
      .find((e) => e.type === "order.confirmed") as Record<string, unknown>;
    expect(originConfirm).toBeDefined();
    expect(bases[0]).toBe(originConfirm.branch_created_at);
    expect(bases[0]).not.toBe(originConfirm.device_created_at);
    closeMesh(devices);
  });
});
