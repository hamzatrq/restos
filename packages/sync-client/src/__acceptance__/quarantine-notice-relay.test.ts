// Acceptance tests — T-01-08, origin notification through the RELAY topology
// (01-F37 "originating device notified"; PROTOCOL.md quarantine_notice row:
// direction "→ origin device"; DEC-SYNC-008 at-least-once; DEC-SYNC-009 relay).
// Authored from specs/01-kernel-sync.md (01-F37, 01-F13) + specs/DECISIONS.md
// (DEC-SYNC-008, DEC-SYNC-009, DEC-SYNC-005) + PROTOCOL.md + the T-01-08
// contract in plans/wave-0/kernel-tasks.md ONLY (24 §3 step 2: read-only to the
// implementing session). The landed relay pins (relay-scenarios.test.ts R3) are
// untouched and stay binding — R3 pins slot-fill/never-wedge; THIS file pins
// the notification reaching the origin.
//
// RED-AWAITING-IMPLEMENTATION: today the live quarantine_notice terminates at
// the pushing HUB session (cloud-session appends it to its own status() list;
// the mesh dispatch drops the kind) — the WAN-less ORIGIN never learns its
// event was quarantined. 01-F37 says the ORIGINATING DEVICE is notified and
// PROTOCOL.md routes quarantine_notice "→ origin device"; for a LAN-only
// origin the only path is the hub forwarding it over the LAN. The pin is the
// WIRE OUTCOME (a quarantine_notice frame carrying the poisoned event id and
// its reason reaches the origin device over the LAN, at-least-once — the
// receiver tolerates duplicates per DEC-SYNC-008); the forwarding mechanism
// and WHERE a WAN-less origin SURFACES the notice device-side are left to the
// implementer/planner (reported as open in the oracle report, not invented
// here — a LAN-only device has no cloud session and so no status().quarantined
// surface today).
import type { ProtocolMessage } from "@restos/sync-protocol";
import type { TraceEntry } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { appendLan, closeLan, lanOnlyDevice, mergedOf } from "./relay-builders.js";
import {
  closeAll,
  createSim,
  createSimCloud,
  eventInput,
  spikeDevice,
  startBoth,
} from "./spike-builders.js";

const NUL = String.fromCharCode(0); // storage_reject trigger, kept out of source bytes
const CONVERGE_MS = 2_000;
const SETTLE_MS = 20_000;

const order = (device_id: string, id: string, order_id: string) =>
  eventInput(device_id, id, "order.created", { order_id, channel: "dine_in" });

type NoticeDelivery = Extract<TraceEntry, { kind: "delivery" }> & {
  message: Extract<ProtocolMessage, { kind: "quarantine_notice" }>;
};

/** LAN-plane quarantine_notice deliveries to one device (the sim-cloud runs on
 * bare timers, so trace "delivery" entries are LAN hops only). */
const lanNoticesTo = (trace: readonly TraceEntry[], device_id: string): NoticeDelivery[] =>
  trace.filter(
    (e): e is NoticeDelivery =>
      e.kind === "delivery" && e.to === device_id && e.message.kind === "quarantine_notice",
  );

describe("origin notification via the hub relay (01-F37 / DEC-SYNC-008 / DEC-SYNC-009)", () => {
  it("01-F37/DEC-SYNC-008/DEC-SYNC-009: a WAN-less origin's poison event, relayed and quarantined at the cloud, produces a quarantine_notice that reaches the ORIGIN device over the LAN — event id and reason verbatim, at-least-once — not just the pushing hub session", () => {
    const sim = createSim({ seed: 1_808 });
    const cloud = createSimCloud({ sim });
    const h = spikeDevice(sim, cloud, "dev-hub", "counter_electron");
    startBoth(h);
    const w = lanOnlyDevice(sim, "dev-w", "counter_rn"); // NO cloud transport, ever
    sim.runFor(CONVERGE_MS);
    expect(w.mesh.status().hub_id).toBe("dev-hub");

    appendLan(w, order("dev-w", "qn-w-0", "qn-wo-0")); // lamport 0 — clean
    const poison = appendLan(w, order("dev-w", "qn-w-1", `qn-${NUL}-poison`)); // lamport 1
    appendLan(w, order("dev-w", "qn-w-2", "qn-wo-2")); // lamport 2 — clean
    sim.runFor(SETTLE_MS);

    // Scenario sanity (already pinned at R3 — asserted minimally, not re-pinned):
    // the relay carried the stream up, the cloud storage_rejected the poison and
    // the origin's slot filled, so its outbox drained past it (DEC-SYNC-005).
    expect(mergedOf(cloud, "dev-w").map((m) => m.id)).toEqual(["qn-w-0", "qn-w-2"]);
    expect(w.store.status().acked_watermark).toBe(2);

    // The cloud's live notice went to the PUSHING hub session (landed T-01-12
    // surface — the only live path a WAN-less origin has).
    const hubNotices = cloud
      .transcript()
      .filter(
        (t) =>
          t.direction === "out" &&
          t.device_id === "dev-hub" &&
          t.message.kind === "quarantine_notice",
      );
    expect(hubNotices.length).toBeGreaterThanOrEqual(1);

    // THE PIN (RED today): the notice must reach the ORIGIN DEVICE over the LAN
    // (PROTOCOL.md: quarantine_notice → origin device; 01-F37: originating
    // device notified). At-least-once — duplicates are legal (DEC-SYNC-008),
    // absence is the failure.
    const originNotices = lanNoticesTo(sim.trace(), "dev-w");
    expect(originNotices.length).toBeGreaterThanOrEqual(1);
    expect(originNotices.map((n) => n.message.event_id)).toContain(poison.id);
    // Reason carried verbatim from the cloud's notice (the origin must learn
    // WHY, not merely that something vanished).
    const forPoison = originNotices.filter((n) => n.message.event_id === poison.id);
    expect(forPoison.every((n) => n.message.reason === "storage_reject")).toBe(true);

    // The origin stays a healthy mesh member after receiving the notice frame —
    // notification never disturbs the session (01-F17 spirit: nothing blocks).
    appendLan(w, order("dev-w", "qn-w-3", "qn-wo-3"));
    sim.runFor(SETTLE_MS);
    expect(w.mesh.status().hub_id).toBe("dev-hub");
    expect(w.store.status().acked_watermark).toBe(3);

    closeAll([h]);
    closeLan(w);
  });
});
