// Acceptance tests — T-01-05 stage (d): sim scheduler seed (20 §2.4 crown-jewel harness,
// resolves 20 §6-Q1 per its stated bias). Authored from the kernel-tasks binding contract
// + HUB-ELECTION.md + PROTOCOL.md only (24 §3 step 2: read-only to the implementing
// session). Laws under test: virtual single-threaded time; (time, schedule-seq) execution
// order for timers and deliveries; runFor/runToQuiescence semantics; all randomness from
// the seeded RNG — same seed + same script ⇒ deep-equal trace().

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSim } from "../index.js";
import { attachRecorder, must, peerInfo, ping } from "./builders.js";

describe("virtual time (20 §2.4: the scheduler owns all time)", () => {
  it("20 §2.4: time is virtual — scheduling advances nothing; a run advances now() and fires timers at their due instant", () => {
    const sim = createSim({ seed: 1 });
    const t0 = sim.now();
    const fired: number[] = [];
    sim.clock.setTimeout(() => fired.push(sim.now()), 10);
    expect(sim.now()).toBe(t0); // scheduling does not advance time
    expect(fired).toEqual([]); // nothing executes outside an explicit run
    sim.runFor(10);
    expect(fired).toEqual([t0 + 10]); // fired exactly at its virtual due time
    expect(sim.now()).toBe(t0 + 10);
  });

  it("20 §2.4: sim.clock is the injected Clock seam — clock.now() tracks sim.now() outside and inside callbacks", () => {
    const sim = createSim({ seed: 2 });
    expect(sim.clock.now()).toBe(sim.now());
    const seen: { clock: number; sim: number }[] = [];
    sim.clock.setTimeout(() => seen.push({ clock: sim.clock.now(), sim: sim.now() }), 7);
    sim.runFor(20);
    expect(sim.clock.now()).toBe(sim.now());
    const inside = must(seen[0], "callback observation");
    expect(inside.clock).toBe(inside.sim);
  });

  it("20 §2.4: clearTimeout cancels — a cleared timer never fires and never enters the trace's timer record", () => {
    const sim = createSim({ seed: 3 });
    const fired: string[] = [];
    const doomed = sim.clock.setTimeout(() => fired.push("doomed"), 5);
    sim.clock.setTimeout(() => fired.push("kept"), 6);
    sim.clock.clearTimeout(doomed);
    sim.runFor(50);
    expect(fired).toEqual(["kept"]);
  });
});

describe("execution order (contract (d): timers + deliveries in (time, schedule-seq) order)", () => {
  it("(d): same-instant timers fire in schedule-seq order; an earlier due time runs first no matter when it was scheduled", () => {
    const sim = createSim({ seed: 4 });
    const order: string[] = [];
    sim.clock.setTimeout(() => order.push("A@10"), 10);
    sim.clock.setTimeout(() => order.push("B@5"), 5);
    sim.clock.setTimeout(() => order.push("C@10"), 10);
    sim.runFor(20);
    expect(order).toEqual(["B@5", "A@10", "C@10"]);
  });

  it("(d): deliveries interleave with timers in virtual-time order under a fixed latency", () => {
    const sim = createSim({ seed: 5 });
    const order: string[] = [];
    const a = sim.lan.attach(peerInfo("dev-a"));
    const b = sim.lan.attach(peerInfo("dev-b", "counter_rn"));
    a.start({ onPeerVisible: () => {}, onPeerLost: () => {}, onMessage: () => {} });
    b.start({
      onPeerVisible: () => {},
      onPeerLost: () => {},
      onMessage: (from) => order.push(`msg:${from}@${sim.now()}`),
    });
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    sim.lan.policy({ latency: [5, 5], dropRate: 0, duplicateRate: 0 });
    const t0 = sim.now();
    sim.clock.setTimeout(() => order.push(`timer@${sim.now()}`), 3);
    sim.clock.setTimeout(() => order.push(`timer@${sim.now()}`), 7);
    a.send("dev-b", ping(1));
    sim.runFor(20);
    expect(order).toEqual([`timer@${t0 + 3}`, `msg:dev-a@${t0 + 5}`, `timer@${t0 + 7}`]);
  });

  it("(d): two sends dispatched back-to-back under equal latency deliver in schedule-seq order", () => {
    const sim = createSim({ seed: 6 });
    const a = attachRecorder(sim, "dev-a");
    const b = attachRecorder(sim, "dev-b");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    sim.lan.policy({ latency: [5, 5], dropRate: 0, duplicateRate: 0 });
    a.transport.send("dev-b", ping(1));
    a.transport.send("dev-b", ping(2));
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(b.log.messages.map((m) => (m.message.kind === "ping" ? m.message.t : -1))).toEqual([
      1, 2,
    ]);
  });

  it("(d) single-threaded virtual time: callbacks never re-enter — a send from inside a callback is delivered later, never synchronously", () => {
    const sim = createSim({ seed: 7 });
    const violations: string[] = [];
    let active = false;
    const guard = (name: string, fn: () => void) => () => {
      if (active) violations.push(name);
      active = true;
      fn();
      active = false;
    };
    const a = sim.lan.attach(peerInfo("dev-a"));
    const b = sim.lan.attach(peerInfo("dev-b"));
    let delivered = 0;
    let deliveredDuringSend = false;
    a.start({ onPeerVisible: () => {}, onPeerLost: () => {}, onMessage: () => {} });
    b.start({
      onPeerVisible: () => {},
      onPeerLost: () => {},
      onMessage: guard("onMessage", () => {
        delivered++;
      }),
    });
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    sim.clock.setTimeout(
      guard("timer", () => {
        a.send("dev-b", ping(1));
        if (delivered > 0) deliveredDuringSend = true; // send is fire-and-forget, not sync dispatch
      }),
      5,
    );
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    expect(violations).toEqual([]);
    expect(deliveredDuringSend).toBe(false);
    expect(delivered).toBe(1);
  });
});

describe("runFor / runToQuiescence (contract (d) semantics)", () => {
  it("(d): runFor(virtualMs) executes exactly the work due in the window and advances now() by exactly virtualMs", () => {
    const sim = createSim({ seed: 8 });
    const t0 = sim.now();
    const fired: number[] = [];
    for (const delay of [5, 10, 11]) sim.clock.setTimeout(() => fired.push(delay), delay);
    sim.runFor(10);
    expect(fired).toEqual([5, 10]);
    expect(sim.now()).toBe(t0 + 10);
    sim.runFor(1);
    expect(fired).toEqual([5, 10, 11]);
    expect(sim.now()).toBe(t0 + 11);
  });

  it("(d): work scheduled from inside a callback within the window still runs in the same runFor", () => {
    const sim = createSim({ seed: 9 });
    const fired: string[] = [];
    sim.clock.setTimeout(() => {
      fired.push("outer");
      sim.clock.setTimeout(() => fired.push("inner"), 2);
    }, 5);
    sim.runFor(10);
    expect(fired).toEqual(["outer", "inner"]);
  });

  it("(d): runToQuiescence returns true once all scheduled work drains within maxVirtualMs", () => {
    const sim = createSim({ seed: 10 });
    const fired: number[] = [];
    const chain = (depth: number) =>
      sim.clock.setTimeout(() => {
        fired.push(depth);
        if (depth < 3) chain(depth + 1);
      }, 10);
    chain(1);
    expect(sim.runToQuiescence({ maxVirtualMs: 1_000 })).toBe(true);
    expect(fired).toEqual([1, 2, 3]);
  });

  it("(d): runToQuiescence returns false when self-perpetuating work never drains within maxVirtualMs — and it terminates", () => {
    const sim = createSim({ seed: 11 });
    let beats = 0;
    const heartbeat = () => {
      beats++;
      sim.clock.setTimeout(heartbeat, 10);
    };
    sim.clock.setTimeout(heartbeat, 10);
    expect(sim.runToQuiescence({ maxVirtualMs: 100 })).toBe(false);
    expect(beats).toBeGreaterThan(0);
    expect(beats).toBeLessThan(20); // bounded by the budget, not runaway
  });

  it("(d): runToQuiescence on an idle sim returns true and records nothing", () => {
    const sim = createSim({ seed: 12 });
    expect(sim.runToQuiescence({ maxVirtualMs: 1_000 })).toBe(true);
    expect(sim.trace()).toEqual([]);
  });
});

// One deterministic chaos script, reused across seeds: attach three devices, set a
// chaotic policy, mix timers, staggered sends, a partition/heal cycle, drain.
const chaosScript = (seed: number) => {
  const sim = createSim({ seed });
  const a = attachRecorder(sim, "dev-a");
  const b = attachRecorder(sim, "dev-b", "counter_rn");
  const c = attachRecorder(sim, "dev-c", "kitchen");
  sim.runToQuiescence({ maxVirtualMs: 5_000 });
  sim.lan.policy({ latency: [5, 80], dropRate: 0.3, duplicateRate: 0.3 });
  for (let i = 0; i < 30; i++) {
    sim.clock.setTimeout(() => {}, (i * 13) % 41);
    a.transport.send("dev-b", ping(i));
    b.transport.send("dev-c", ping(100 + i));
    c.transport.send("dev-a", ping(200 + i));
    sim.runFor(7);
    if (i === 10) sim.lan.partition(["dev-a", "dev-b"], ["dev-c"]);
    if (i === 20) sim.lan.heal();
  }
  sim.runToQuiescence({ maxVirtualMs: 60_000 });
  return { trace: sim.trace(), logs: [a.log, b.log, c.log] };
};

describe("determinism (20 §2.4 / 20 §6-Q1: seeded reproducibility)", () => {
  it("20 §2.4: same seed + same script ⇒ deep-equal trace() and identical delivery logs under latency/drop/duplicate chaos", () => {
    const first = chaosScript(1234);
    const second = chaosScript(1234);
    expect(first.trace.length).toBeGreaterThan(0);
    expect(second.trace).toEqual(first.trace);
    expect(second.logs).toEqual(first.logs);
  });

  it("20 §2.4: the seed is the randomness source — different seeds diverge under a latency/drop policy", () => {
    // Not a contract law per se, but the observable consequence of drawing from the seeded
    // RNG: a constant-draw impl would collapse all seeds to one trace. 90 randomized
    // deliveries make coincidental equality astronomically improbable.
    expect(chaosScript(1).trace).not.toEqual(chaosScript(2).trace);
  });

  it("(d): trace() is a stable ordered read — repeated calls report the same record", () => {
    const sim = createSim({ seed: 13 });
    const a = attachRecorder(sim, "dev-a");
    attachRecorder(sim, "dev-b");
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    a.transport.send("dev-b", ping(1));
    sim.clock.setTimeout(() => {}, 3);
    sim.runToQuiescence({ maxVirtualMs: 5_000 });
    const snapshot = sim.trace();
    expect(snapshot.length).toBeGreaterThan(0);
    expect(sim.trace()).toEqual(snapshot);
  });

  const deviceIds: readonly string[] = ["dev-0", "dev-1", "dev-2", "dev-3"];
  type ScriptOp =
    | { op: "timer"; delay: number }
    | { op: "send"; from: number; to: number; t: number }
    | { op: "runFor"; ms: number }
    | { op: "partition"; split: number }
    | { op: "heal" };

  const opArb: fc.Arbitrary<ScriptOp> = fc.oneof(
    fc.record({ op: fc.constant("timer" as const), delay: fc.integer({ min: 0, max: 50 }) }),
    fc.record({
      op: fc.constant("send" as const),
      from: fc.integer({ min: 0, max: 3 }),
      to: fc.integer({ min: 0, max: 3 }),
      t: fc.integer({ min: 0, max: 999 }),
    }),
    fc.record({ op: fc.constant("runFor" as const), ms: fc.integer({ min: 0, max: 30 }) }),
    fc.record({ op: fc.constant("partition" as const), split: fc.integer({ min: 1, max: 3 }) }),
    fc.record({ op: fc.constant("heal" as const) }),
  );

  const policyArb = fc.record({
    latencyMin: fc.integer({ min: 0, max: 20 }),
    latencySpan: fc.integer({ min: 0, max: 60 }),
    dropRate: fc.double({ min: 0, max: 1, noNaN: true }),
    duplicateRate: fc.double({ min: 0, max: 0.9, noNaN: true }),
  });

  it("20 §2.4 property: for ANY script of timers/sends/partitions/runs and ANY policy, two same-seed sims produce deep-equal traces", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        policyArb,
        fc.array(opArb, { maxLength: 30 }),
        (seed, policy, ops) => {
          const runScript = () => {
            const sim = createSim({ seed });
            const devices = deviceIds.map((id) => attachRecorder(sim, id));
            sim.runToQuiescence({ maxVirtualMs: 5_000 });
            sim.lan.policy({
              latency: [policy.latencyMin, policy.latencyMin + policy.latencySpan],
              dropRate: policy.dropRate,
              duplicateRate: policy.duplicateRate,
            });
            for (const op of ops) {
              if (op.op === "timer") sim.clock.setTimeout(() => {}, op.delay);
              else if (op.op === "send")
                must(devices[op.from]).transport.send(must(deviceIds[op.to]), ping(op.t));
              else if (op.op === "runFor") sim.runFor(op.ms);
              else if (op.op === "partition")
                sim.lan.partition(deviceIds.slice(0, op.split), deviceIds.slice(op.split));
              else sim.lan.heal();
            }
            sim.runToQuiescence({ maxVirtualMs: 60_000 });
            return { trace: sim.trace(), logs: devices.map((d) => d.log) };
          };
          const first = runScript();
          const second = runScript();
          expect(second.trace).toEqual(first.trace);
          expect(second.logs).toEqual(first.logs);
        },
      ),
      { numRuns: 40 },
    );
  });
});
