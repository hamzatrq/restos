// Acceptance tests — T-01-16 transport: batched catch-up END-TO-END through the
// cloud session against the landed sim-cloud double (COVER 4 composition, COVER 5
// landed-stack, and the cloud-session half of the granularity guard).
//
// ⚠ NO WRITTEN CONTRACT (see transport-batch-page.test.ts header). Authored from
// SPEC TEXT ONLY (24 §3 step 2): 26 §3/§6.4/§6.5, 01-F9/F17/F34/F37, 00 §5.
//
// Two kinds of pin here:
//   • GREEN PRESERVATION — behaviour the current per-event applyEvents already has,
//     which the batched rewrite MUST NOT weaken (the re-opened-bug guard, end-to-end):
//     a divergent duplicate in a catch-up page is surfaced + PASSED + the cursor moves
//     past it (not wedged); the cursor advances through the contiguous landed prefix
//     with nothing skipped; adoption of already-held events is ZERO fold work
//     (the 26 §3/§6.5 WAN-down-LAN-healthy case); a quarantine-slot stream catches up
//     dense (COVER 5, T-01-08). These are GREEN today.
//   • RED-AWAITING-IMPLEMENTATION — the batching itself: a catch-up page persists in
//     ONE ingest-path commit, not one-per-event (via the oracle-proposed
//     store.ingestStats() counter — see transport-batch-page.test.ts). RED today.

import { createSim, createSimCloud } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { createCloudSession, type DeviceStore, openStore } from "../index.js";
import { appendInput, must } from "./builders.js";

const ORG = "org-t0116";
const BRANCH = "branch-t0116";
const NUL = String.fromCharCode(0); // U+0000 storage_reject trigger — kept out of source bytes
const cloudId = (device_id: string) => ({ org_id: ORG, branch_id: BRANCH, device_id });
const run = (sim: ReturnType<typeof createSim>) => sim.runToQuiescence({ maxVirtualMs: 60_000 });

// ── the oracle-proposed ingest-path commit counter, resolved via a typed cast ──
type IngestStatsStore = { ingestStats?(): { commits: number; events_ingested: number } };
const commits = (store: DeviceStore): number => {
  const s = store as DeviceStore & IngestStatsStore;
  if (typeof s.ingestStats !== "function") {
    throw new Error(
      "T-01-16 NOT IMPLEMENTED: store.ingestStats() — the ingest-path commit counter " +
        "that makes 'one transaction per catch-up page' assertable (26 §6.4). RED until " +
        "the transport task lands.",
    );
  }
  return s.ingestStats().commits;
};

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

const appendN = (device: ReturnType<typeof cloudDevice>, n: number) => {
  const events = [];
  for (let i = 0; i < n; i++)
    events.push(device.store.append(appendInput(cloudId(device.device_id))));
  device.session.notifyAppended();
  return events;
};

describe("T-01-16 e2e — the catch-up page is ONE ingest commit, not one-per-event (26 §6.4 bottleneck 1)", () => {
  it("26 §6.4/01-F9: a cold WAN-only joiner catches up a K-event page in exactly ONE ingest commit (per-event = K commits — the bottleneck)", () => {
    const sim = createSim({ seed: 11 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    appendN(a, 6); // pushed BEFORE the joiner exists — reach it via catchup, not fan-out
    run(sim);

    const c = cloudDevice(sim, cloud, "dev-c"); // fresh store, no appends, no fan-out
    const before = commits(c.store);
    run(sim);
    const after = commits(c.store);

    // correctness (green today): the joiner holds all six with the cloud cursor…
    expect(c.store.readAllEvents()).toHaveLength(6);
    expect(c.session.status().last_global_seq).toBe(cloud.state().last_global_seq);
    // …in ONE commit for the whole page (RED — the per-event loop uses six).
    expect(after - before).toBe(1);
    c.store.close();
    a.store.close();
  });
});

describe("T-01-16 e2e — GREEN PRESERVATION: the per-event granularity survives batching (26 §6.4 warning; 01-F17/01-F34)", () => {
  it("01-F9/01-F17: a DIVERGENT DUPLICATE inside a catch-up page surfaces in status().quarantined, the cursor advances PAST it, and the pull is not wedged", () => {
    const sim = createSim({ seed: 12 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    const x = must(appendN(a, 1)[0]); // A's own event → merged with a global_seq
    run(sim);

    // A joiner that ALREADY holds x's id with DIVERGENT content (a genuine cross-device
    // divergence) — pre-seeded before its cloud session starts, so the catchup delivery
    // of the cloud's copy hits the DivergentDuplicateError path.
    const cStore = openStore({ path: ":memory:", identity: cloudId("dev-c") });
    cStore.ingest({
      ...x,
      payload: { order_id: "C-LOCAL-DIVERGENT", channel: "dine_in" }, // differs from A's payload
    });
    const cSession = createCloudSession({
      store: cStore,
      transport: cloud.transportFor("dev-c"),
      clock: sim.clock,
      device_class: "counter_electron",
      token: "cloud-token-stub",
    });
    cSession.start();
    run(sim);

    // surfaced + passed, not wedged (the exact 26 §6.4 re-opened-bug guard, end-to-end).
    expect(cSession.status().quarantined).toContainEqual({
      event_id: x.id,
      reason: "divergent_duplicate",
    });
    // C keeps ITS stored content — the divergent duplicate never overwrote it (01-F1).
    const held = must(cStore.readAllEvents().find((e) => e.id === x.id));
    expect((held.payload as { order_id: string }).order_id).toBe("C-LOCAL-DIVERGENT");
    // the cursor moved PAST the poison to the cloud head (not wedged, 01-F17)…
    expect(cSession.status().last_global_seq).toBe(cloud.state().last_global_seq);
    // …and a subsequent event still catches up (the pull kept flowing).
    appendN(a, 1);
    run(sim);
    expect(cSession.status().last_global_seq).toBe(cloud.state().last_global_seq);
    cStore.close();
    a.store.close();
  });

  it("01-F9/01-F34: the contiguous-prefix cursor reaches EXACTLY the cloud head — a clean catch-up skips nothing and duplicates nothing (COVER 2 happy path)", () => {
    const sim = createSim({ seed: 13 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    const events = appendN(a, 5);
    run(sim);
    const c = cloudDevice(sim, cloud, "dev-c");
    run(sim);
    const cIds = new Set(c.store.readAllEvents().map((e) => e.id));
    for (const e of events) expect(cIds.has(e.id)).toBe(true);
    expect(c.store.readAllEvents()).toHaveLength(5); // nothing duplicated
    expect(c.session.status().last_global_seq).toBe(cloud.state().last_global_seq); // nothing skipped
    c.store.close();
    a.store.close();
  });
});

describe("T-01-16 e2e — GREEN PRESERVATION: zero-fold-work adoption composes with batching (26 §3/§6.5 WAN-down-LAN-healthy)", () => {
  it("01-F34/26 §3: a device that already folded events (LAN) adopts their global_seq over a batched cloud catch-up with ZERO fold work", () => {
    const sim = createSim({ seed: 14 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    const aEvents = appendN(a, 8); // A pushes them → cloud stamps global_seq
    run(sim);

    // C already holds A's events (as if delivered over the LAN) and has FOLDED them —
    // exactly the 26 §3 normal outage: reconnect is just the cloud attaching delivery
    // metadata to events the device already has.
    const cStore = openStore({ path: ":memory:", identity: cloudId("dev-c") });
    for (const e of aEvents) cStore.ingest(e);
    const foldedBefore = cStore.foldStats().events_folded;

    const cSession = createCloudSession({
      store: cStore,
      transport: cloud.transportFor("dev-c"),
      clock: sim.clock,
      device_class: "counter_electron",
      token: "cloud-token-stub",
    });
    cSession.start();
    run(sim); // catch-up delivers A's events WITH global_seq → pure adoption

    expect(cStore.foldStats().events_folded).toBe(foldedBefore); // ZERO refolding on adoption
    expect(cSession.status().last_global_seq).toBe(cloud.state().last_global_seq);
    cStore.close();
    a.store.close();
  });
});

describe("T-01-16 e2e — COVER 5: landed-stack composition — a quarantine-slot stream catches up dense (T-01-08 / DEC-SYNC-005)", () => {
  it("01-F37/01-F9: a cold joiner catches up a stream whose middle event was storage_reject-quarantined at the cloud — the merged global_seq stays DENSE, the poison is absent, the batched pull does not stall on the filled slot", () => {
    const sim = createSim({ seed: 15 });
    const cloud = createSimCloud({ sim });
    const a = cloudDevice(sim, cloud, "dev-a");
    a.store.append(
      appendInput(cloudId("dev-a"), { payload: { order_id: "clean-0", channel: "dine_in" } }),
    );
    const poison = a.store.append(
      appendInput(cloudId("dev-a"), { payload: { order_id: `poison-${NUL}`, channel: "dine_in" } }),
    );
    a.store.append(
      appendInput(cloudId("dev-a"), { payload: { order_id: "clean-2", channel: "dine_in" } }),
    );
    a.session.notifyAppended();
    run(sim);
    // the poison filled A's lamport slot at the cloud but consumed no global_seq.
    expect(a.session.status().quarantined).toContainEqual({
      event_id: poison.id,
      reason: "storage_reject",
    });
    expect(cloud.state().events).toBe(2); // only the two clean events merged, global_seq 1 and 2

    const c = cloudDevice(sim, cloud, "dev-c"); // WAN-only cold joiner
    run(sim);
    const cIds = new Set(c.store.readAllEvents().map((e) => e.id));
    expect(cIds.has(poison.id)).toBe(false); // the poison never entered the merged stream
    expect(c.store.readAllEvents()).toHaveLength(2); // the two clean events, contiguous
    expect(c.session.status().last_global_seq).toBe(cloud.state().last_global_seq); // cursor reached the dense head
    c.store.close();
    a.store.close();
  });
});
