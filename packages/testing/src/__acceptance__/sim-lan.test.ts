// Acceptance tests — T-01-05 stage (d): SimLan semantics (20 §2.4 harness seed; the
// substrate scenarios S1–S4 run on). Authored from the kernel-tasks binding contract +
// HUB-ELECTION.md + PROTOCOL.md only (24 §3 step 2: read-only to the implementing
// session). Laws under test: attach/partition/heal/disconnect/reconnect visibility +
// delivery (partition drops cross-cut messages AND fires onPeerLost; heal restores);
// policy({latency, dropRate, duplicateRate}) draws are seeded-deterministic; every bus
// hop round-trips encodeMessage/decodeMessage (T-01-02 codec exercised on every hop).

import type { ProtocolMessage } from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
import { createSim } from "../index.js";
import {
  attachRecorder,
  deliveredTs,
  envelope,
  eventBatch,
  must,
  ping,
  visibleIds,
} from "./builders.js";

const lossless = { latency: [5, 5] as [number, number], dropRate: 0, duplicateRate: 0 };

/** Three attached recorders, quiesced so discovery has settled. */
const trio = (seed: number) => {
  const sim = createSim({ seed });
  const a = attachRecorder(sim, "dev-a", "counter_electron");
  const b = attachRecorder(sim, "dev-b", "counter_rn");
  const c = attachRecorder(sim, "dev-c", "kitchen");
  sim.runToQuiescence({ maxVirtualMs: 5_000 });
  return { sim, a, b, c };
};

describe("attach + visibility (contract (d); 01-F12 discovery abstraction)", () => {
  it("(d)/01-F12: two attached devices see each other via onPeerVisible with full PeerInfo — and never themselves", () => {
    const sim = createSim({ seed: 21 });
    const a = attachRecorder(sim, "dev-a", "counter_electron");
    const b = attachRecorder(sim, "dev-b", "kitchen");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(a.log.visible).toContainEqual({ device_id: "dev-b", device_class: "kitchen" });
    expect(b.log.visible).toContainEqual({ device_id: "dev-a", device_class: "counter_electron" });
    expect(visibleIds(a.log)).not.toContain("dev-a");
    expect(visibleIds(b.log)).not.toContain("dev-b");
    expect(a.log.lost).toEqual([]);
    expect(b.log.lost).toEqual([]);
  });

  it("(d)/01-F12: a later joiner becomes visible to every attached peer and sees them all (S1 staggered-attach substrate)", () => {
    const sim = createSim({ seed: 22 });
    const a = attachRecorder(sim, "dev-a");
    const b = attachRecorder(sim, "dev-b");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    sim.runFor(500);
    const c = attachRecorder(sim, "dev-c", "kitchen");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(visibleIds(a.log)).toContain("dev-c");
    expect(visibleIds(b.log)).toContain("dev-c");
    expect(visibleIds(c.log)).toEqual(expect.arrayContaining(["dev-a", "dev-b"]));
  });

  it("(d): send is unicast — only the addressed peer's onMessage fires, with from = the sender's device_id", () => {
    const { sim, a, b, c } = trio(23);
    a.transport.send("dev-b", ping(42));
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    const got = must(b.log.messages[0], "delivery at dev-b");
    expect(got.from).toBe("dev-a");
    expect(got.message).toEqual(ping(42));
    expect(b.log.messages).toHaveLength(1);
    expect(c.log.messages).toEqual([]);
    expect(a.log.messages).toEqual([]);
  });
});

describe("partition / heal (contract (d): a partition splits visibility AND delivery; S3 substrate)", () => {
  it("(d): partition fires onPeerLost across the cut on every device and leaves same-side visibility intact", () => {
    const { sim, a, b, c } = trio(31);
    sim.lan.partition(["dev-a", "dev-b"], ["dev-c"]);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(a.log.lost).toEqual(["dev-c"]);
    expect(b.log.lost).toEqual(["dev-c"]);
    expect([...c.log.lost].sort()).toEqual(["dev-a", "dev-b"]);
  });

  it("(d): cross-cut messages are dropped — heal() never resurrects them; post-heal sends deliver again", () => {
    const { sim, a, c } = trio(32);
    sim.lan.partition(["dev-a", "dev-b"], ["dev-c"]);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    a.transport.send("dev-c", ping(1)); // across the cut — dropped, not queued
    c.transport.send("dev-a", ping(2));
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(c.log.messages).toEqual([]);
    expect(a.log.messages).toEqual([]);
    sim.lan.heal();
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(c.log.messages).toEqual([]); // dropped means dropped (01-F8 dedupe/re-push absorb loss)
    expect(a.log.messages).toEqual([]);
    a.transport.send("dev-c", ping(3));
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(deliveredTs(c.log)).toEqual([3]);
  });

  it("(d): same-side delivery keeps working during a partition", () => {
    const { sim, a, b } = trio(33);
    sim.lan.partition(["dev-a", "dev-b"], ["dev-c"]);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    a.transport.send("dev-b", ping(7));
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(deliveredTs(b.log)).toEqual([7]);
  });

  it("(d): heal() restores visibility — every device sees the far side again via onPeerVisible", () => {
    const { sim, a, b, c } = trio(34);
    sim.lan.partition(["dev-a", "dev-b"], ["dev-c"]);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    const seenBefore = {
      a: a.log.visible.length,
      b: b.log.visible.length,
      c: c.log.visible.length,
    };
    sim.lan.heal();
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(visibleIds(a.log).slice(seenBefore.a)).toContain("dev-c");
    expect(visibleIds(b.log).slice(seenBefore.b)).toContain("dev-c");
    expect(visibleIds(c.log).slice(seenBefore.c)).toEqual(
      expect.arrayContaining(["dev-a", "dev-b"]),
    );
  });
});

describe("disconnect / reconnect (contract (d): a device vanishing — crash/leave; S2 substrate)", () => {
  it("(d): disconnect fires onPeerLost on the remaining devices; sends to the vanished device drop silently (fire-and-forget)", () => {
    const { sim, a, b, c } = trio(41);
    sim.lan.disconnect("dev-c");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(a.log.lost).toEqual(["dev-c"]);
    expect(b.log.lost).toEqual(["dev-c"]);
    expect(() => a.transport.send("dev-c", ping(1))).not.toThrow();
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(c.log.messages).toEqual([]);
  });

  it("(d): reconnect restores visibility on both sides and delivery both ways", () => {
    const { sim, a, c } = trio(42);
    sim.lan.disconnect("dev-c");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    const seenBefore = { a: a.log.visible.length, c: c.log.visible.length };
    sim.lan.reconnect("dev-c");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(visibleIds(a.log).slice(seenBefore.a)).toContain("dev-c");
    expect(visibleIds(c.log).slice(seenBefore.c)).toEqual(
      expect.arrayContaining(["dev-a", "dev-b"]),
    );
    a.transport.send("dev-c", ping(1));
    c.transport.send("dev-a", ping(2));
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(deliveredTs(c.log)).toEqual([1]);
    expect(deliveredTs(a.log)).toEqual([2]);
  });
});

describe("policy (contract (d): seeded latency / dropRate / duplicateRate draws)", () => {
  it("(d): dropRate 0 + duplicateRate 0 ⇒ every send delivered exactly once, in order under fixed latency (S4 exactly-once substrate)", () => {
    const { sim, a, b } = trio(51);
    sim.lan.policy(lossless);
    for (let t = 0; t < 20; t++) a.transport.send("dev-b", ping(t));
    sim.runToQuiescence({ maxVirtualMs: 60_000 });
    expect(deliveredTs(b.log)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("(d): dropRate 1 ⇒ nothing is ever delivered", () => {
    const { sim, a, b } = trio(52);
    sim.lan.policy({ latency: [5, 5], dropRate: 1, duplicateRate: 0 });
    for (let t = 0; t < 10; t++) a.transport.send("dev-b", ping(t));
    sim.runToQuiescence({ maxVirtualMs: 60_000 });
    expect(b.log.messages).toEqual([]);
  });

  it("(d): latency [50, 50] delivers exactly 50 virtual ms after send; a [10, 100] range always lands inside the range", () => {
    const { sim, a, b } = trio(53);
    sim.lan.policy({ latency: [50, 50], dropRate: 0, duplicateRate: 0 });
    const t0 = sim.now();
    a.transport.send("dev-b", ping(0));
    sim.runToQuiescence({ maxVirtualMs: 60_000 });
    expect(must(b.log.messages[0], "fixed-latency delivery").at).toBe(t0 + 50);

    sim.lan.policy({ latency: [10, 100], dropRate: 0, duplicateRate: 0 });
    const t1 = sim.now();
    for (let t = 1; t <= 30; t++) a.transport.send("dev-b", ping(t));
    sim.runToQuiescence({ maxVirtualMs: 60_000 });
    const ranged = b.log.messages.slice(1);
    expect(ranged).toHaveLength(30);
    for (const m of ranged) {
      expect(m.at - t1).toBeGreaterThanOrEqual(10);
      expect(m.at - t1).toBeLessThanOrEqual(100);
    }
  });

  it("(d): duplicateRate duplicates deliveries — with dropRate 0 every send still arrives at least once, and total deliveries exceed sends", () => {
    const { sim, a, b } = trio(54);
    sim.lan.policy({ latency: [5, 5], dropRate: 0, duplicateRate: 0.5 });
    for (let t = 0; t < 100; t++) a.transport.send("dev-b", ping(t));
    sim.runToQuiescence({ maxVirtualMs: 60_000 });
    const ts = deliveredTs(b.log);
    expect(ts.length).toBeGreaterThan(100);
    expect(new Set(ts).size).toBe(100); // nothing lost, only duplicated
  });

  it("(d): policy draws come from the seeded RNG — same seed ⇒ identical drop pattern and delivery timings", () => {
    const run = (seed: number) => {
      const { sim, a, b } = trio(seed);
      sim.lan.policy({ latency: [5, 90], dropRate: 0.4, duplicateRate: 0.4 });
      for (let t = 0; t < 50; t++) a.transport.send("dev-b", ping(t));
      sim.runToQuiescence({ maxVirtualMs: 60_000 });
      return b.log.messages.map((m) => ({ at: m.at, message: m.message }));
    };
    expect(run(999)).toEqual(run(999));
  });
});

describe("codec on every hop (contract (d): encodeMessage/decodeMessage round-trip; T-01-02)", () => {
  it("(d)/T-01-02: a delivered message is a structural clone — deep-equal to what was sent but never the same reference, at any depth", () => {
    const { sim, a, b } = trio(61);
    const sent = eventBatch([envelope("dev-a", 0)]);
    a.transport.send("dev-b", sent);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    const got = must(b.log.messages[0], "event_batch delivery").message;
    expect(got).toEqual(sent);
    expect(got).not.toBe(sent);
    if (got.kind !== "event_batch" || sent.kind !== "event_batch")
      throw new Error("expected event_batch on both ends");
    expect(got.events).not.toBe(sent.events);
    expect(got.events[0]).not.toBe(sent.events[0]);
    expect(must(got.events[0]).payload).not.toBe(must(sent.events[0]).payload);
  });

  it("(d)/T-01-02: unknown keys are stripped in transit — decodeMessage's schema parse runs on every hop", () => {
    const { sim, a, b } = trio(62);
    const smuggled = { ...ping(9), stray: "not-on-the-wire" } as unknown as ProtocolMessage;
    a.transport.send("dev-b", smuggled);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    const got = must(b.log.messages[0], "delivery").message;
    expect("stray" in got).toBe(false);
    expect(got).toEqual(ping(9));
  });

  it("(d)/T-01-02: duplicated deliveries are independent decoded copies, not shared references", () => {
    const { sim, a, b } = trio(63);
    sim.lan.policy({ latency: [5, 5], dropRate: 0, duplicateRate: 0.5 });
    for (let t = 0; t < 40; t++) a.transport.send("dev-b", ping(t));
    sim.runToQuiescence({ maxVirtualMs: 60_000 });
    const byT = new Map<number, ProtocolMessage[]>();
    for (const m of b.log.messages) {
      if (m.message.kind !== "ping") continue;
      const list = byT.get(m.message.t) ?? [];
      list.push(m.message);
      byT.set(m.message.t, list);
    }
    const duplicated = [...byT.values()].find((list) => list.length >= 2);
    const pair = must(duplicated, "at least one duplicated delivery at duplicateRate 0.5");
    const [first, second] = pair;
    expect(must(second)).toEqual(must(first));
    expect(must(second)).not.toBe(must(first));
  });
});
