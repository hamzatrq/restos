// Acceptance tests — T-01-05 fix-round amendments (plans/wave-0/kernel-tasks.md,
// T-01-05 "Fix-round amendments" block: binding contract text), authored by the
// test-owning session from the amendment text + HUB-ELECTION.md + PROTOCOL.md only
// (24 §3 step 2: read-only to the implementing session).
//
// RED group — pins the amended contract ahead of the impl fix:
//   1. 01-F15 WAN-down backlog: the LAN drain pages own events from the session
//      cursor, never the cloud-outbox page (amendment 1).
//   2. 01-F13 liveness: suspicion clears only on inbound traffic from the suspect,
//      never by timer expiry; life re-enters candidacy (amendment 2).
//   3. 20 §2.4 determinism: same seed + same script ⇒ deep-equal wire logs
//      including hello_ack session_ids; HELLO_TIMEOUT_MS = 4000 exported
//      (amendments 2 + 3).
//   4. The contracted wallClock adapter ships (amendment 4).
//   5. stop() clears the visibility map — no ghost peers after restart (amendment 5).
//
// GREEN group — behavior that exists but was unpinned, now pinned tight:
//   01-F15 notifyAppended sub-heartbeat immediacy (both directions), 01-F8 hub-side
//   resume_from after reconnect, 01-F3/01-F8 per-origin lamport contiguity.
//
// Amendment-2/3/4 exports (HELLO_TIMEOUT_MS, wallClock) are read reflectively off the
// package namespace so a not-yet-shipped export reddens its own test, not the module load.

import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import * as syncClient from "../index.js";
import { HEARTBEAT_INTERVAL_MS, HUB_LOSS_TIMEOUT_MS, REELECTION_BUDGET_MS } from "../index.js";
import { appendInput, must, peerEnvelope } from "./builders.js";
import {
  appendOn,
  closeAll,
  hello,
  helloAck,
  LOSSLESS,
  ledgerIds,
  meshDevice,
  meshIdentity,
  originLamports,
  rawPeer,
  revivablePeer,
  wireOf,
  wirePing,
  wirePush,
} from "./mesh-builders.js";

const surface = syncClient as unknown as Record<string, unknown>;

/** Amendment 2's contracted value, used as a time budget before the export lands. */
const HELLO_TIMEOUT_MS_CONTRACT = 4_000;

type WallClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

describe("fix-round 1 — LAN drain pages from the session cursor (01-F15)", () => {
  it("01-F15: WAN down (no cloud ack ever), a 510-event follower backlog fully reaches the hub — the LAN drain pages own events from the session cursor, never the cloud-outbox page", () => {
    const sim = createSim({ seed: 401 });
    sim.lan.policy(LOSSLESS);
    const hub = meshDevice(sim, "dev-a", "counter_electron");
    const f = meshDevice(sim, "dev-b", "counter_rn");
    hub.session.start();
    f.session.start();
    sim.runFor(2_000);
    expect(f.session.status().hub_id).toBe("dev-a");
    const ids: string[] = [];
    for (let i = 0; i < 510; i++) {
      ids.push(f.store.append(appendInput(meshIdentity("dev-b"))).id);
    }
    f.session.notifyAppended(); // one fast-path drain over the whole backlog
    sim.runFor(15_000); // several heartbeats — ample for ack-advanced paging
    expect(f.store.status().acked_watermark).toBeNull(); // the cloud never acked (WAN down)
    const atHub = new Set(ledgerIds(hub));
    const missing = ids.filter((id) => !atHub.has(id));
    expect(missing).toEqual([]); // ALL 510 arrive; a cloud-page drain stalls at 500 forever
    closeAll([hub, f]);
  }, 30_000);
});

describe("fix-round 2 — election liveness: suspicion never expires by timer (01-F13)", () => {
  it("01-F13: after hub loss the replacement hub STAYS hub for 60 000 virtual ms while the dead-but-visible old hub stays silent — suspicion clears only on inbound traffic, never by timer", () => {
    // The seed-109 script from mesh-session.test.ts, extended far past convergence.
    const sim = createSim({ seed: 109 });
    sim.lan.policy(LOSSLESS);
    const r = rawPeer(sim, "dev-a", "counter_electron"); // wins the tie; then silent forever
    const f = meshDevice(sim, "dev-b", "counter_electron");
    f.session.start();
    sim.runFor(1_000);
    r.transport.send("dev-b", helloAck("session-109", true, 0));
    sim.runFor(200);
    r.transport.send("dev-b", wirePing(1)); // last sign of life
    sim.runFor(HUB_LOSS_TIMEOUT_MS + REELECTION_BUDGET_MS);
    expect(f.session.status().state).toBe("hub"); // converged, as the seed-109 test pins
    for (let i = 0; i < 12; i++) {
      sim.runFor(5_000);
      const s = f.session.status();
      expect(s.state).toBe("hub"); // never demotes back to the visible corpse
      expect(s.hub_id).toBe("dev-b");
    }
    closeAll([f]);
  });

  it("01-F13: cold start with a visible-but-never-answering top-ranked device — the live eligible devices converge to a live hub within HELLO_TIMEOUT_MS + REELECTION_BUDGET_MS", () => {
    const sim = createSim({ seed: 402 });
    sim.lan.policy(LOSSLESS);
    rawPeer(sim, "dev-a", "counter_electron"); // top-ranked, visible, answers nothing
    const b = meshDevice(sim, "dev-b", "counter_electron");
    const c = meshDevice(sim, "dev-c", "counter_rn");
    b.session.start();
    c.session.start();
    sim.runFor(HELLO_TIMEOUT_MS_CONTRACT + REELECTION_BUDGET_MS);
    const sb = b.session.status();
    const sc = c.session.status();
    expect(sb.state).toBe("hub"); // highest-ranked non-suspect (self included) wins
    expect(sb.hub_id).toBe("dev-b");
    expect(sc.state).toBe("follower");
    expect(sc.hub_id).toBe("dev-b");
    closeAll([b, c]);
  });

  it("01-F13: a suspect that shows life re-enters candidacy and wins the next peer-set recompute", () => {
    const sim = createSim({ seed: 403 });
    sim.lan.policy(LOSSLESS);
    const a = revivablePeer(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_electron");
    b.session.start();
    sim.runFor(HELLO_TIMEOUT_MS_CONTRACT + REELECTION_BUDGET_MS);
    expect(b.session.status().state).toBe("hub"); // dev-a suspect: it never answered the hello
    a.revive();
    a.transport.send("dev-b", wirePing(1)); // life: inbound traffic from the suspect
    sim.runFor(500);
    rawPeer(sim, "dev-z", "kitchen"); // peer-set change → recompute; kitchen outranks nobody here
    sim.runFor(3_000);
    const s = b.session.status();
    expect(s.state).toBe("follower"); // the revived top-ranked device wins the recompute
    expect(s.hub_id).toBe("dev-a");
    closeAll([b]);
  });
});

describe("fix-round 3 — 20 §2.4 determinism across identical seeded runs", () => {
  const runScript = () => {
    const sim = createSim({ seed: 404 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_rn");
    const c = meshDevice(sim, "dev-c", "kitchen");
    const devices = [a, b, c];
    for (const d of devices) d.session.start();
    sim.runFor(10_000); // hello handshakes (hello_ack session_ids) + heartbeats
    const wires = devices.map((d) => d.wire);
    closeAll(devices);
    return wires;
  };

  it("20 §2.4: the same seeded 3-device script run twice on fresh sims yields deep-equal wire-tap logs — including hello_ack session_ids (no wall clock, no crypto randomness in mesh code)", () => {
    const first = runScript();
    const second = runScript();
    expect(second).toEqual(first);
  });

  it("01-F13/20 §2.4: HELLO_TIMEOUT_MS = 4000 is exported from the package surface (fix-round 2's contracted constant)", () => {
    expect(surface.HELLO_TIMEOUT_MS).toBe(4_000);
  });
});

describe("fix-round 4 — the contracted wall-clock adapter (contract (a) Clock seam; T-01-06 needs it)", () => {
  it("fix-round 4: wallClock is exported with { now, setTimeout, clearTimeout } and now() tracks Date.now() within 100 ms", () => {
    const wc = surface.wallClock as WallClock | undefined;
    expect(wc).toBeDefined();
    const w = must(wc, "wallClock export");
    expect(typeof w.now).toBe("function");
    expect(typeof w.setTimeout).toBe("function");
    expect(typeof w.clearTimeout).toBe("function");
    expect(Math.abs(w.now() - Date.now())).toBeLessThan(100);
  });

  it("fix-round 4: wallClock.setTimeout fires on real time and clearTimeout cancels", async () => {
    const w = must(surface.wallClock as WallClock | undefined, "wallClock export");
    await new Promise<void>((resolve) => {
      w.setTimeout(() => resolve(), 10); // really fires, ~10 ms wall time
    });
    let fired = false;
    const id = w.setTimeout(() => {
      fired = true;
    }, 10);
    w.clearTimeout(id);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50); // native wait past the cancelled deadline
    });
    expect(fired).toBe(false);
  });
});

describe("fix-round 5 — stop() clears the visibility map (01-F13)", () => {
  it("01-F13: a peer that left the LAN while the session was stopped is no ghost after restart — status().peers must not contain it", () => {
    const sim = createSim({ seed: 405 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_rn");
    a.session.start();
    b.session.start();
    sim.runFor(2_000); // connected: a hub, b follower
    expect(a.session.status().peers.map((p) => p.device_id)).toContain("dev-b");
    a.session.stop();
    sim.runFor(100);
    sim.lan.disconnect("dev-b"); // b leaves while a is stopped — a can hear nothing
    sim.runFor(100);
    a.session.start();
    sim.runFor(1_000);
    const s = a.session.status();
    expect(s.peers.map((p) => p.device_id)).not.toContain("dev-b"); // no ghost from the stopped period
    expect(s.state).toBe("solo"); // alone + eligible (contract (c) cold start)
    closeAll([a, b]);
  });
});

describe("green pin — 01-F15 fast-path immediacy (notifyAppended, sub-heartbeat)", () => {
  it("01-F15: a follower append + notifyAppended reaches the hub strictly inside one heartbeat interval (runFor(500) < HEARTBEAT_INTERVAL_MS)", () => {
    const sim = createSim({ seed: 406 });
    sim.lan.policy(LOSSLESS);
    const hub = meshDevice(sim, "dev-a", "counter_electron");
    const f = meshDevice(sim, "dev-b", "counter_rn");
    hub.session.start();
    f.session.start();
    sim.runFor(2_000);
    expect(500).toBeLessThan(HEARTBEAT_INTERVAL_MS); // the window really is sub-heartbeat
    const e = appendOn(f);
    sim.runFor(500);
    expect(ledgerIds(hub)).toContain(e.id);
    closeAll([hub, f]);
  });

  it("01-F15: an append ON the hub + notifyAppended reaches every follower inside the same sub-heartbeat window", () => {
    const sim = createSim({ seed: 407 });
    sim.lan.policy(LOSSLESS);
    const hub = meshDevice(sim, "dev-a", "counter_electron");
    const f1 = meshDevice(sim, "dev-b", "counter_rn");
    const f2 = meshDevice(sim, "dev-c", "kitchen");
    const devices = [hub, f1, f2];
    for (const d of devices) d.session.start();
    sim.runFor(2_000);
    const e = appendOn(hub);
    sim.runFor(500); // strictly < HEARTBEAT_INTERVAL_MS
    expect(ledgerIds(f1)).toContain(e.id);
    expect(ledgerIds(f2)).toContain(e.id);
    closeAll(devices);
  });
});

describe("green pin — hub-side resume_from after reconnect (01-F8; contract (c) hub duties)", () => {
  it("01-F8: a follower that pushed lamports 0..4 disconnects and re-hellos — hello_ack.resume_from === 5 (highest contiguously held + 1)", () => {
    const sim = createSim({ seed: 408 });
    sim.lan.policy(LOSSLESS);
    const hub = meshDevice(sim, "dev-a", "counter_electron");
    hub.session.start();
    const r = rawPeer(sim, "dev-r", "kitchen", { autoPong: true });
    sim.runFor(500);
    r.transport.send("dev-a", hello("dev-r", "kitchen"));
    sim.runFor(500);
    const first = must(wireOf(r.received, "received", "hello_ack")[0], "first hello_ack").message;
    if (first.kind !== "hello_ack") throw new Error("unreachable");
    expect(first.resume_from).toBe(0); // nothing held from dev-r yet
    const events = [0, 1, 2, 3, 4].map((n) => peerEnvelope(meshIdentity("dev-r"), n));
    r.transport.send("dev-a", wirePush(events, 4));
    sim.runFor(500);
    const ack = must(wireOf(r.received, "received", "push_ack")[0], "push_ack").message;
    if (ack.kind !== "push_ack") throw new Error("unreachable");
    expect(ack.acked_watermark).toBe(4); // persisted before ack (01-F2), acked to the watermark
    sim.lan.disconnect("dev-r");
    sim.runFor(HUB_LOSS_TIMEOUT_MS + HEARTBEAT_INTERVAL_MS); // the hub notices and drops the session
    sim.lan.reconnect("dev-r");
    sim.runFor(500);
    r.transport.send("dev-a", hello("dev-r", "kitchen"));
    sim.runFor(500);
    const acks = wireOf(r.received, "received", "hello_ack");
    expect(acks.length).toBeGreaterThanOrEqual(2);
    const last = must(acks[acks.length - 1], "re-hello hello_ack").message;
    if (last.kind !== "hello_ack") throw new Error("unreachable");
    expect(last.resume_from).toBe(5); // highest contiguously held lamport + 1
    closeAll([hub]);
  });
});

describe("green pin — per-origin lamport contiguity after partition/heal (01-F3, 01-F8)", () => {
  it("01-F3/01-F8: after S3-style split-brain traffic every device holds each origin's lamports exactly 0..max, gap-free, ascending in ledger-read order", () => {
    const sim = createSim({ seed: 409 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_rn");
    const c = meshDevice(sim, "dev-c", "counter_electron");
    const d = meshDevice(sim, "dev-d", "kitchen");
    const devices = [a, b, c, d];
    for (const dv of devices) dv.session.start();
    sim.runFor(2_000); // converge on dev-a
    appendOn(b); // dev-b lamport 0
    appendOn(b); // dev-b lamport 1
    sim.runFor(2_000);
    sim.lan.partition(["dev-a", "dev-b"], ["dev-c", "dev-d"]);
    sim.runFor(REELECTION_BUDGET_MS); // side 2 elects dev-c
    appendOn(b); // dev-b lamport 2 (side 1)
    appendOn(c); // dev-c lamport 0 (side 2)
    appendOn(d); // dev-d lamport 0 (side 2)
    appendOn(d); // dev-d lamport 1 (side 2)
    sim.runFor(3_000);
    sim.lan.heal();
    sim.runFor(REELECTION_BUDGET_MS); // one hub again; live origins re-push across
    for (const dv of devices) {
      const events = dv.store.readAllEvents();
      // toEqual pins presence + count + gap-freeness + ascending read order at once.
      expect(originLamports(events, "dev-b")).toEqual([0, 1, 2]);
      expect(originLamports(events, "dev-c")).toEqual([0]);
      expect(originLamports(events, "dev-d")).toEqual([0, 1]);
      expect(originLamports(events, "dev-a")).toEqual([]); // dev-a appended nothing
    }
    closeAll(devices);
  });
});
