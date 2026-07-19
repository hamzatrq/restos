// Acceptance tests — T-01-05 stage (c): mesh session state machine (01-F12/F13/F15;
// HUB-ELECTION.md states solo/follower/candidate/hub; PROTOCOL.md wire set), authored
// from the kernel-tasks binding contract + HUB-ELECTION.md + PROTOCOL.md only (24 §3
// step 2: read-only to the implementing session). Directed cases: cold start (solo vs
// follower/null), election on peer-set change, hello → hello_ack{hub:true} handshake +
// window replay, heartbeat ping/pong, drop after HEARTBEAT_MISSED_LIMIT unanswered,
// hub-loss detection at HUB_LOSS_TIMEOUT_MS → re-election inside REELECTION_BUDGET_MS,
// and the 19 §5 law that a LAN push_ack never moves the cloud write-checkpoint.

import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MISSED_LIMIT,
  HUB_LOSS_TIMEOUT_MS,
  REELECTION_BUDGET_MS,
} from "../index.js";
import { appendInput, must } from "./builders.js";
import {
  appendOn,
  BRANCH,
  closeAll,
  hello,
  helloAck,
  LOSSLESS,
  ledgerIds,
  meshDevice,
  meshIdentity,
  rawPeer,
  wireOf,
  wirePing,
} from "./mesh-builders.js";

describe("exported constants (HUB-ELECTION.md, binding values)", () => {
  it("01-F13: heartbeat/loss/re-election constants carry the contracted values", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(2_000);
    expect(HEARTBEAT_MISSED_LIMIT).toBe(3);
    expect(HUB_LOSS_TIMEOUT_MS).toBe(6_000);
    expect(HUB_LOSS_TIMEOUT_MS).toBe(HEARTBEAT_INTERVAL_MS * HEARTBEAT_MISSED_LIMIT); // derived
    expect(REELECTION_BUDGET_MS).toBe(10_000);
  });
});

describe("cold start (contract (c); HUB-ELECTION.md)", () => {
  it("(c)/01-F13: alone + hub-eligible → solo, empty peer set (acts as hub for later joiners)", () => {
    const sim = createSim({ seed: 101 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    a.session.start();
    sim.runFor(1_000);
    const s = a.session.status();
    expect(s.state).toBe("solo");
    expect(s.peers).toEqual([]);
    closeAll([a]);
  });

  it("(c)/01-F39: alone + non-eligible class → follower with hub_id null (waits; never candidate)", () => {
    const sim = createSim({ seed: 102 });
    sim.lan.policy(LOSSLESS);
    const m = meshDevice(sim, "dev-m", "manager");
    m.session.start();
    sim.runFor(1_000);
    const s = m.session.status();
    expect(s.state).toBe("follower");
    expect(s.hub_id).toBeNull();
    closeAll([m]);
  });
});

describe("election on peer-set change (contract (c); 01-F13)", () => {
  it("(c)/01-F13: a joining higher-rank device takes hub — the solo counter_rn becomes its follower", () => {
    const sim = createSim({ seed: 103 });
    sim.lan.policy(LOSSLESS);
    const b = meshDevice(sim, "dev-b", "counter_rn");
    b.session.start();
    sim.runFor(1_000);
    expect(b.session.status().state).toBe("solo");
    const a = meshDevice(sim, "dev-a", "counter_electron");
    a.session.start();
    sim.runFor(2_000);
    expect(a.session.status().state).toBe("hub");
    const sb = b.session.status();
    expect(sb.state).toBe("follower");
    expect(sb.hub_id).toBe("dev-a");
    expect(sb.peers.map((p) => p.device_id)).toContain("dev-a");
    closeAll([a, b]);
  });
});

describe("hello / hello_ack handshake (contract (c); PROTOCOL.md; 01-F14 half)", () => {
  it("(c): the hub answers a joiner's hello with hello_ack{hub:true, resume_from} and replays its stored window as event_batch", () => {
    const sim = createSim({ seed: 104 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const e1 = a.store.append(appendInput(meshIdentity("dev-a")));
    const e2 = a.store.append(appendInput(meshIdentity("dev-a")));
    a.session.start();
    const r = rawPeer(sim, "dev-r", "kitchen");
    sim.runFor(1_000); // visibility settles; dev-a wins on both computations
    r.transport.send("dev-a", hello("dev-r", "kitchen"));
    sim.runFor(1_000);
    const ack = must(wireOf(r.received, "received", "hello_ack")[0], "hello_ack at joiner").message;
    if (ack.kind !== "hello_ack") throw new Error("unreachable");
    expect(ack.hub).toBe(true);
    expect(ack.session_id.length).toBeGreaterThan(0);
    // assumption 7: resume_from on LAN = next lamport_seq the hub expects from this
    // device — dev-r has pushed nothing, so 0.
    expect(ack.resume_from).toBe(0);
    const replayed = wireOf(r.received, "received", "event_batch").flatMap((rec) =>
      rec.message.kind === "event_batch" ? rec.message.events.map((e) => e.id) : [],
    );
    expect(new Set(replayed)).toEqual(new Set([e1.id, e2.id])); // full-window replay (assumption 6)
    closeAll([a]);
  });

  it("(c): a follower sends hello to the election winner and, after hello_ack, pushes its outbox from resume_from onward", () => {
    const sim = createSim({ seed: 105 });
    sim.lan.policy(LOSSLESS);
    const r = rawPeer(sim, "dev-a", "counter_electron"); // tie-break winner over dev-b
    const f = meshDevice(sim, "dev-b", "counter_electron");
    f.store.append(appendInput(meshIdentity("dev-b"))); // lamport 0
    const e1 = f.store.append(appendInput(meshIdentity("dev-b"))); // lamport 1
    f.session.start();
    sim.runFor(1_000);
    const h = must(wireOf(r.received, "received", "hello")[0], "hello at raw hub").message;
    if (h.kind !== "hello") throw new Error("unreachable");
    expect(h.device_id).toBe("dev-b");
    expect(h.device_class).toBe("counter_electron");
    expect(h.branch_id).toBe(BRANCH);
    expect(h.own_high_water).toBe(1);
    // No push before the hub acks the session — resume_from is not known yet.
    expect(wireOf(r.received, "received", "push")).toEqual([]);
    r.transport.send("dev-b", helloAck("session-105", true, 1)); // hub already holds lamport 0
    sim.runFor(1_000);
    const p = must(wireOf(r.received, "received", "push")[0], "push at raw hub").message;
    if (p.kind !== "push") throw new Error("unreachable");
    expect(p.events.map((e) => e.id)).toEqual([e1.id]); // from resume_from onward only
    expect(p.watermark).toBe(1);
    const sf = f.session.status();
    expect(sf.state).toBe("follower");
    expect(sf.hub_id).toBe("dev-a");
    closeAll([f]);
  });
});

describe("heartbeat (contract (c); HUB-ELECTION.md: hub pings every 2 s; PROTOCOL.md ping/pong)", () => {
  it("(c)/01-F13: the hub sends wire ping to a connected follower every HEARTBEAT_INTERVAL_MS while pongs keep it alive", () => {
    const sim = createSim({ seed: 106 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    a.session.start();
    const r = rawPeer(sim, "dev-r", "counter_rn", { autoPong: true });
    sim.runFor(500);
    r.transport.send("dev-a", hello("dev-r", "counter_rn"));
    sim.runFor(4 * HEARTBEAT_INTERVAL_MS + 500);
    const pings = wireOf(r.received, "received", "ping");
    expect(pings.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < pings.length; i++) {
      expect(must(pings[i]).at - must(pings[i - 1]).at).toBe(HEARTBEAT_INTERVAL_MS);
    }
    closeAll([a]);
  });

  it("(c): a mesh follower answers the hub's wire ping with pong", () => {
    const sim = createSim({ seed: 107 });
    sim.lan.policy(LOSSLESS);
    const r = rawPeer(sim, "dev-a", "counter_electron");
    const f = meshDevice(sim, "dev-b", "counter_rn");
    f.session.start();
    sim.runFor(1_000); // f elected dev-a and sent hello
    r.transport.send("dev-b", helloAck("session-107", true, 0));
    sim.runFor(500);
    r.transport.send("dev-b", wirePing(777));
    sim.runFor(500);
    // PROTOCOL.md pins pong{t} liveness, not the echo semantics of t — assert the reply only.
    expect(wireOf(r.received, "received", "pong").length).toBe(1);
    closeAll([f]);
  });

  it("(c)/HUB-ELECTION.md: HEARTBEAT_MISSED_LIMIT unanswered pings → the hub drops that follower (heartbeats stop)", () => {
    const sim = createSim({ seed: 108 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    a.session.start();
    const r = rawPeer(sim, "dev-r", "kitchen"); // never pongs
    sim.runFor(500);
    r.transport.send("dev-a", hello("dev-r", "kitchen"));
    sim.runFor((HEARTBEAT_MISSED_LIMIT + 2) * HEARTBEAT_INTERVAL_MS);
    const before = wireOf(r.received, "received", "ping").length;
    expect(before).toBeGreaterThanOrEqual(HEARTBEAT_MISSED_LIMIT);
    expect(before).toBeLessThanOrEqual(HEARTBEAT_MISSED_LIMIT + 1);
    sim.runFor(3 * HEARTBEAT_INTERVAL_MS);
    expect(wireOf(r.received, "received", "ping").length).toBe(before); // dropped: no more heartbeats
    closeAll([a]);
  });

  it("(c)/01-F13: no wire ping for HUB_LOSS_TIMEOUT_MS → hub loss; the eligible survivor re-elects and adopts the new result within REELECTION_BUDGET_MS", () => {
    const sim = createSim({ seed: 109 });
    sim.lan.policy(LOSSLESS);
    const r = rawPeer(sim, "dev-a", "counter_electron"); // wins the tie; then goes silent
    const f = meshDevice(sim, "dev-b", "counter_electron");
    f.session.start();
    sim.runFor(1_000);
    r.transport.send("dev-b", helloAck("session-109", true, 0));
    sim.runFor(200);
    r.transport.send("dev-b", wirePing(1)); // last sign of life
    sim.runFor(100);
    expect(f.session.status().state).toBe("follower");
    expect(f.session.status().hub_id).toBe("dev-a");
    sim.runFor(HUB_LOSS_TIMEOUT_MS - 500); // still inside the tolerance window
    expect(f.session.status().state).toBe("follower");
    expect(f.session.status().hub_id).toBe("dev-a"); // not lost prematurely
    sim.runFor(REELECTION_BUDGET_MS); // detection + candidate window + adoption
    const s = f.session.status();
    expect(s.state).toBe("hub"); // the only live eligible device is the new hub
    expect(s.hub_id).not.toBe("dev-a");
    closeAll([f]);
  });
});

describe("LAN push_ack vs the cloud write-checkpoint (19 §5; contract (c) follower duties)", () => {
  it("01-F8/19 §5: hub acks update session last_push_ack but never move store.advanceTo — acked_watermark stays null and the outbox stays owed to the cloud", () => {
    const sim = createSim({ seed: 110 });
    sim.lan.policy(LOSSLESS);
    const a = meshDevice(sim, "dev-a", "counter_electron");
    const b = meshDevice(sim, "dev-b", "counter_rn");
    a.session.start();
    b.session.start();
    sim.runFor(2_000); // converge: a hub, b follower
    const ids = [appendOn(b), appendOn(b), appendOn(b)].map((e) => e.id);
    sim.runFor(2_000);
    expect(ledgerIds(a)).toEqual(expect.arrayContaining(ids)); // LAN traffic really flowed
    expect(b.session.status().last_push_ack).not.toBeNull(); // ...and was acked in-session
    expect(b.store.status().acked_watermark).toBeNull(); // cloud checkpoint untouched (19 §5)
    expect(b.store.status().queue_depth).toBe(3); // outbox still owed to the cloud
    expect(b.store.nextBatch(10).map((e) => e.id)).toEqual(ids); // drain cursor durably unmoved
    expect(a.store.status().acked_watermark).toBeNull(); // hub side equally reserved
    closeAll([a, b]);
  });
});
