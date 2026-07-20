// Regression guard — external-audit K-04 (01-F15), hub-origin fast path. When the
// acting hub appends its OWN event and calls notifyAppended(), the event must fan
// to followers immediately (sub-heartbeat), independent of the cloud
// write-checkpoint.
//
// The fault: notifyAppended's hub branch read store.nextBatch, which pages from the
// acked_watermark (the cloud write-checkpoint, 19 §5). Once a cloud ack covers the
// hub's own events, nextBatch goes EMPTY, so the fast path silently fanned nothing
// and the hub-origin event only reached followers on the ~2 s heartbeat replay.
// The fix reads store.readOwnEvents(hubFanCursor) — a cursor independent of the
// cloud checkpoint — so a preceding cloud ack cannot starve the fast path.
//
// This test simulates the cloud ack with advanceTo() BEFORE notifyAppended(), then
// runs the sim for strictly less than one heartbeat interval and asserts the
// follower has ingested the event. Pre-fix nextBatch is empty ⇒ nothing fans ⇒ the
// follower is still missing the event inside the window ⇒ RED. Post-fix ⇒ GREEN.
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { HEARTBEAT_INTERVAL_MS } from "../index.js";
import { appendInput } from "./builders.js";
import { closeAll, LOSSLESS, ledgerIds, meshDevice, meshIdentity } from "./mesh-builders.js";

describe("K-04 hub-origin notifyAppended fast path survives a cloud ack (01-F15)", () => {
  it("01-F15: after advanceTo() empties nextBatch, an append-on-hub + notifyAppended reaches the follower strictly inside one heartbeat interval", () => {
    const sim = createSim({ seed: 4401 });
    sim.lan.policy(LOSSLESS);
    const hub = meshDevice(sim, "dev-a", "counter_electron");
    const follower = meshDevice(sim, "dev-b", "counter_rn");
    hub.session.start();
    follower.session.start();

    // Converge well inside the first heartbeat window (first heartbeat fires at
    // ~admit + HEARTBEAT_INTERVAL_MS ≈ 2 s; we stop at 1 s so no replay can fire).
    sim.runFor(1_000);
    expect(hub.session.status().state).toBe("hub");
    expect(follower.session.status().hub_id).toBe("dev-a");

    // Append the hub's own event, then simulate a cloud ack covering it. This is
    // the exact precondition that starves the pre-fix nextBatch-based fan.
    const event = hub.store.append(appendInput(meshIdentity("dev-a")));
    hub.store.advanceTo(event.lamport_seq);
    // Prove the pre-fix source path (store.nextBatch) would now fan NOTHING.
    expect(hub.store.nextBatch(500)).toEqual([]);
    expect(ledgerIds(follower)).not.toContain(event.id); // follower has not seen it yet

    hub.session.notifyAppended(); // the 01-F15 fast path — must not depend on nextBatch

    // Strictly less than one heartbeat: no ping/replayWindowTo can run here, so a
    // delivery is attributable to the fast path alone, not the 2 s heartbeat.
    const window = 500;
    expect(window).toBeLessThan(HEARTBEAT_INTERVAL_MS);
    sim.runFor(window);
    expect(ledgerIds(follower)).toContain(event.id);

    closeAll([hub, follower]);
  });
});
