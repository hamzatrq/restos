// Acceptance tests — T-01-06 stage 1: the device cloud session (contract (b)).
// Authored from the kernel-tasks binding contract + PROTOCOL.md only (24 §3 step 2:
// read-only to the implementing session). These drive the NOT-YET-BUILT
// createCloudSession against the landed sim-cloud double (@restos/testing) over the
// injected transport + virtual clock — RED until createCloudSession exists is the point.
// Duties asserted (contract (b)): onUp→hello→hello_ack; catchup from the EXCLUSIVE cursor
// (global_seq starts at 1, so 0 = send everything); live event_batch fan-out applied via
// store.ingest(env, {global_seq}); push drains own outbox to push_ack and advances the
// CLOUD write-checkpoint via store.advanceTo (unlike the volatile LAN push cursor,
// T-01-05); origin-inclusive fan-out converges the device to cloud order (01-F34);
// quarantine_notice surfaces in status().quarantined with the ack advancing over the
// poisoned slot (DEC-SYNC-005); no-ack-when-nothing-persisted tolerated.
import { createSim, createSimCloud } from "@restos/testing";
import { describe, expect, it } from "vitest";
// createCloudSession is the not-yet-built T-01-06 impl surface — its absence is the RED.
import { createCloudSession, openStore } from "../index.js";
import { appendInput, must } from "./builders.js";

const ORG = "org-cloud";
const BRANCH = "branch-cloud";
const NUL = String.fromCharCode(0); // U+0000 kept out of source bytes — the storage_reject trigger

const cloudId = (device_id: string) => ({ org_id: ORG, branch_id: BRANCH, device_id });

const run = (sim: ReturnType<typeof createSim>) => sim.runToQuiescence({ maxVirtualMs: 60_000 });

/** A device: real store + contracted cloud session over the sim-cloud transport. */
const cloudDevice = (
  sim: ReturnType<typeof createSim>,
  cloud: ReturnType<typeof createSimCloud>,
  device_id: string,
) => {
  const store = openStore({ path: ":memory:", identity: cloudId(device_id) });
  const session = createCloudSession({
    store,
    transport: cloud.transportFor(device_id),
    clock: sim.clock,
    device_class: "counter_electron",
    token: "cloud-token-stub",
  });
  session.start();
  return { device_id, store, session };
};

type CloudDevice = ReturnType<typeof cloudDevice>;

/** Append n orders on a device, then fire the host-app fast path (01-F15). */
const appendN = (device: CloudDevice, n: number) => {
  const events = [];
  for (let i = 0; i < n; i++)
    events.push(device.store.append(appendInput(cloudId(device.device_id))));
  device.session.notifyAppended();
  return events;
};

describe("cloud session push / write-checkpoint (contract (b); 01-F8/19 §5)", () => {
  it("(b)/01-F8/19 §5: push drains own outbox to push_ack and advances the CLOUD write-checkpoint (store.advanceTo)", () => {
    const sim = createSim({ seed: 1 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    appendN(a, 3);
    run(sim);
    expect(a.store.status().acked_watermark).toBe(2); // the CLOUD ack IS the outbox checkpoint
    expect(a.store.status().queue_depth).toBe(0);
    expect(a.session.status().last_push_ack).toBe(2);
    expect(a.session.status().connected).toBe(true);
    expect(cloud.state().events).toBe(3);
  });

  it("(b): a notifyAppended with an empty outbox pushes nothing and the session stays healthy (no-ack-when-nothing-persisted tolerated)", () => {
    const sim = createSim({ seed: 2 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    appendN(a, 2);
    run(sim);
    const acked = a.store.status().acked_watermark;
    a.session.notifyAppended(); // nothing new — the cloud sends no ack; the session tolerates it
    run(sim);
    expect(a.store.status().acked_watermark).toBe(acked);
    expect(a.session.status().connected).toBe(true);
    expect(cloud.state().events).toBe(2);
  });
});

describe("cloud session catchup + fan-out (contract (b); 01-F9/01-F34)", () => {
  it("(b)/01-F9: a cold cloud session catches up pre-existing cloud events from the exclusive cursor", () => {
    const sim = createSim({ seed: 3 });
    const cloud = createSimCloud({ sim });
    const b = cloudDevice(sim, cloud, "dev-b");
    const bEvents = appendN(b, 2);
    run(sim);
    const c = cloudDevice(sim, cloud, "dev-c"); // fresh store, WAN-only cold joiner
    run(sim);
    const cIds = new Set(c.store.readAllEvents().map((e) => e.id));
    for (const e of bEvents) expect(cIds.has(e.id)).toBe(true);
    expect(c.session.status().last_global_seq).toBe(cloud.state().last_global_seq);
  });

  it("(b)/01-F9/01-F34: a live event_batch fan-out from a peer is applied via store.ingest with its global_seq", () => {
    const sim = createSim({ seed: 4 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    const b = cloudDevice(sim, cloud, "dev-b");
    run(sim); // both hello'd + registered
    const ev = must(appendN(a, 1)[0]);
    run(sim);
    const bIds = new Set(b.store.readAllEvents().map((e) => e.id));
    expect(bIds.has(ev.id)).toBe(true);
    expect(b.store.openOrders()).toHaveLength(1);
    expect(b.session.status().last_global_seq).toBeGreaterThanOrEqual(1);
  });

  it("(b)/01-F34: origin-inclusive fan-out — the device learns its own events' global_seq and stays ≡ refold()", () => {
    const sim = createSim({ seed: 5 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    appendN(a, 3);
    run(sim);
    expect(a.session.status().last_global_seq).toBe(cloud.state().last_global_seq);
    const before = a.store.openOrders();
    a.store.refold();
    expect(a.store.openOrders()).toEqual(before); // cloud-order adoption is refold-stable
  });
});

describe("cloud session quarantine surfacing (contract (b); 01-F37/DEC-SYNC-005)", () => {
  it("(b)/01-F37: a quarantine_notice surfaces in status().quarantined and the ack advances over the poisoned slot", () => {
    const sim = createSim({ seed: 6 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    a.store.append(appendInput(cloudId("dev-a"))); // lamport 0 — clean
    const poison = a.store.append(
      appendInput(cloudId("dev-a"), {
        payload: { order_id: `order-${NUL}-poison`, channel: "dine_in" },
      }),
    ); // lamport 1 — storage_reject at the cloud
    a.store.append(appendInput(cloudId("dev-a"))); // lamport 2 — clean
    a.session.notifyAppended();
    run(sim);
    expect(a.session.status().quarantined).toContainEqual({
      event_id: poison.id,
      reason: "storage_reject",
    });
    expect(a.store.status().acked_watermark).toBe(2); // outbox never wedges — ack skips the slot
    expect(a.store.status().queue_depth).toBe(0);
    expect(cloud.state().events).toBe(2); // the poison never merged
  });
});

describe("cloud session reconnect (contract (b); 01-F8/01-F17)", () => {
  it("(b)/01-F8: reconnect after a WAN cut re-hellos, resumes from the advanced cursor, and drains the tail", () => {
    const sim = createSim({ seed: 7 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    appendN(a, 3);
    run(sim);
    cloud.cut();
    run(sim);
    expect(a.session.status().connected).toBe(false);
    a.store.append(appendInput(cloudId("dev-a"))); // sales continue during the outage (01-F17)
    a.store.append(appendInput(cloudId("dev-a")));
    a.session.notifyAppended(); // dropped while down
    cloud.heal();
    run(sim);
    expect(a.store.status().acked_watermark).toBe(4);
    expect(a.store.status().queue_depth).toBe(0);
    expect(cloud.state().events).toBe(5);
    expect(a.session.status().connected).toBe(true);
  });
});
