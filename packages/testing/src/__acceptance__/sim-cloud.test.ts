// Acceptance tests — T-01-06 stage 1: the sim-cloud double self-test (contract (c)).
// Authored from the kernel-tasks binding contract + PROTOCOL.md + the LANDED gateway
// laws (T-01-07) only (24 §3 step 2: read-only to any implementing session). The double
// is HARNESS but contract-critical — these pin its own laws GREEN so the sim leg it
// serves (X1–X9) is honest. Every scenario drives the contracted createSimCloud surface
// via a hand-rolled recording client; seam types + codec come from @restos/sync-protocol.
import { PROTOCOL_VERSION, type ProtocolMessage } from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
import { CATCHUP_PAGE_SIZE, createSim, createSimCloud, type SimCloud } from "../index.js";
import { envelope, must } from "./builders.js";

const BRANCH = "branch-sim";
const NUL = String.fromCharCode(0); // U+0000 kept out of source bytes — the storage_reject trigger

/** A recording cloud client: attaches a transport, logs onUp/onDown + every inbound message. */
const client = (cloud: SimCloud, device_id: string) => {
  const received: ProtocolMessage[] = [];
  let up = false;
  const transport = cloud.transportFor(device_id);
  transport.start({
    onUp: () => {
      up = true;
    },
    onDown: () => {
      up = false;
    },
    onMessage: (message) => received.push(message),
  });
  return { device_id, transport, received, isUp: () => up };
};

/** Narrow a recorded stream to one wire kind (noUncheckedIndexedAccess-safe). */
const only = <K extends ProtocolMessage["kind"]>(
  received: readonly ProtocolMessage[],
  kind: K,
): Extract<ProtocolMessage, { kind: K }>[] =>
  received.filter((m): m is Extract<ProtocolMessage, { kind: K }> => m.kind === kind);

const helloMsg = (device_id: string, branch_id = BRANCH): ProtocolMessage => ({
  v: PROTOCOL_VERSION,
  kind: "hello",
  device_id,
  device_class: "counter_electron",
  branch_id,
  token: "cloud-token-stub",
  last_global_seq: 0,
  own_high_water: 0,
});

// The bus round-trips through the codec, so the cast cannot smuggle a malformed message
// past the wire contract (same rationale as the mesh builders' wirePush).
const pushMsg = (
  events: readonly ReturnType<typeof envelope>[],
  watermark: number,
): ProtocolMessage =>
  ({ v: PROTOCOL_VERSION, kind: "push", events, watermark }) as unknown as ProtocolMessage;

const catchupReq = (from_global_seq: number): ProtocolMessage => ({
  v: PROTOCOL_VERSION,
  kind: "catchup_request",
  from_global_seq,
});

const pingMsg = (t: number): ProtocolMessage => ({ v: PROTOCOL_VERSION, kind: "ping", t });

/** Poison envelope: registry-valid, but a U+0000 in a payload string (storage_reject). */
const poisonEnvelope = (device_id: string, lamport_seq: number) => ({
  ...envelope(device_id, lamport_seq),
  payload: { order_id: `order-${NUL}-poison`, channel: "dine_in" },
});

const run = (sim: ReturnType<typeof createSim>) => sim.runToQuiescence({ maxVirtualMs: 60_000 });

describe("sim-cloud handshake (contract (c); 01-F9)", () => {
  it("(c)/01-F9: a fresh device gets onUp, then hello → hello_ack{hub:false, resume_from:0}", () => {
    const sim = createSim({ seed: 1 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    run(sim);
    expect(a.isUp()).toBe(true);
    a.transport.send(helloMsg("dev-a"));
    run(sim);
    const acks = only(a.received, "hello_ack");
    expect(acks).toHaveLength(1);
    const ack = must(acks[0]);
    expect(ack.hub).toBe(false);
    expect(ack.resume_from).toBe(0);
  });

  it("(c)/01-F9: hello_ack.resume_from = acked_watermark + 1 after events persist", () => {
    const sim = createSim({ seed: 2 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    a.transport.send(pushMsg([envelope("dev-a", 0), envelope("dev-a", 1)], 1));
    run(sim);
    a.transport.send(helloMsg("dev-a")); // re-hello: resume_from reflects the watermark
    run(sim);
    const ack = must(only(a.received, "hello_ack").at(-1));
    expect(ack.resume_from).toBe(2); // acked_watermark 1 + 1
  });

  it("(c): ping → pong echoes t", () => {
    const sim = createSim({ seed: 3 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    a.transport.send(pingMsg(42));
    run(sim);
    expect(only(a.received, "pong").map((m) => m.t)).toEqual([42]);
  });
});

describe("sim-cloud merge + global_seq (contract (c); 01-F3/01-F8)", () => {
  it("(c)/01-F3: merged events get a dense global_seq from 1 in arrival order", () => {
    const sim = createSim({ seed: 10 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    a.transport.send(
      pushMsg([envelope("dev-a", 0), envelope("dev-a", 1), envelope("dev-a", 2)], 2),
    );
    run(sim);
    expect(cloud.mergedStream().map((m) => m.global_seq)).toEqual([1, 2, 3]);
    expect(cloud.state()).toEqual({ events: 3, last_global_seq: 3 });
    const acks = only(a.received, "push_ack");
    expect(must(acks.at(-1)).acked_watermark).toBe(2);
  });

  it("(c)/01-F8: re-pushing the same batch is idempotent — no new global_seq, no new fan-out", () => {
    const sim = createSim({ seed: 11 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    const batch = [envelope("dev-a", 0), envelope("dev-a", 1)];
    a.transport.send(pushMsg(batch, 1));
    run(sim);
    const batchesAfterFirst = only(a.received, "event_batch").length;
    a.transport.send(pushMsg(batch, 1)); // exact re-push
    run(sim);
    expect(cloud.state()).toEqual({ events: 2, last_global_seq: 2 });
    expect(only(a.received, "event_batch").length).toBe(batchesAfterFirst); // no new fan-out
    expect(must(only(a.received, "push_ack").at(-1)).acked_watermark).toBe(1); // still acks
  });

  it("(c)/01-F3: stop-at-gap stores + acks only the contiguous prefix; a later push completes it", () => {
    const sim = createSim({ seed: 12 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    const e3 = envelope("dev-a", 3);
    a.transport.send(pushMsg([envelope("dev-a", 0), envelope("dev-a", 1), e3], 3));
    run(sim);
    expect(cloud.state().events).toBe(2); // lamport 3 skipped — gap after 1
    expect(must(only(a.received, "push_ack").at(-1)).acked_watermark).toBe(1);
    a.transport.send(pushMsg([envelope("dev-a", 2), e3], 3)); // fills 2 → 3 becomes contiguous
    run(sim);
    expect(cloud.state().events).toBe(4);
    expect(must(only(a.received, "push_ack").at(-1)).acked_watermark).toBe(3);
  });

  it("(c): NO push_ack when nothing is contiguously persisted — empty push and gap-at-start", () => {
    const sim = createSim({ seed: 13 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    a.transport.send(pushMsg([], 0));
    a.transport.send(pushMsg([envelope("dev-a", 1)], 1)); // first event is lamport 1 → gap at start
    run(sim);
    expect(only(a.received, "push_ack")).toHaveLength(0);
    expect(cloud.state().events).toBe(0);
  });
});

describe("sim-cloud fan-out (contract (c); 01-F9/01-F34/00 §5.4)", () => {
  it("(c)/01-F34: fan-out is one event_batch INCLUDING the origin, both cloud stamps merged in", () => {
    const sim = createSim({ seed: 20 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    const b = client(cloud, "dev-b");
    a.transport.send(helloMsg("dev-a"));
    b.transport.send(helloMsg("dev-b"));
    run(sim);
    a.transport.send(pushMsg([envelope("dev-a", 0), envelope("dev-a", 1)], 1));
    run(sim);
    for (const who of [a, b]) {
      const batch = must(only(who.received, "event_batch").at(-1));
      expect(batch.events.map((e) => e.global_seq)).toEqual([1, 2]);
      expect(batch.events.every((e) => typeof e.server_received_at === "number")).toBe(true);
    }
  });

  it("(c)/00 §5.4: a session on a different branch receives no fan-out", () => {
    const sim = createSim({ seed: 21 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    const other = client(cloud, "dev-other");
    a.transport.send(helloMsg("dev-a", BRANCH));
    other.transport.send(helloMsg("dev-other", "branch-other"));
    run(sim);
    a.transport.send(pushMsg([envelope("dev-a", 0)], 0));
    run(sim);
    expect(only(a.received, "event_batch").length).toBeGreaterThan(0);
    expect(only(other.received, "event_batch")).toHaveLength(0);
  });
});

describe("sim-cloud storage_reject (contract (c); 01-F37/DEC-SYNC-005)", () => {
  it("(c)/01-F37: a U+0000 event quarantines — notice to pusher, absent from merge, slot fills, no global_seq consumed", () => {
    const sim = createSim({ seed: 30 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    const good0 = envelope("dev-a", 0);
    const poison = poisonEnvelope("dev-a", 1);
    const good2 = envelope("dev-a", 2);
    a.transport.send(pushMsg([good0, poison, good2], 2));
    run(sim);
    const notices = only(a.received, "quarantine_notice");
    expect(notices).toHaveLength(1);
    expect(must(notices[0])).toMatchObject({ event_id: poison.id, reason: "storage_reject" });
    const mergedIds = cloud.mergedStream().map((m) => m.id);
    expect(mergedIds).toEqual([good0.id, good2.id]); // poison absent
    expect(cloud.state().last_global_seq).toBe(2); // no global_seq consumed by the poison
    expect(must(only(a.received, "push_ack").at(-1)).acked_watermark).toBe(2); // ack advanced over slot 1
  });
});

describe("sim-cloud catchup paging (contract (c); 01-F9)", () => {
  it("(c)/01-F9: catchup is an exclusive cursor — ascending global_seq > from, next_from echoes on empty", () => {
    const sim = createSim({ seed: 40 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    a.transport.send(
      pushMsg([envelope("dev-a", 0), envelope("dev-a", 1), envelope("dev-a", 2)], 2),
    );
    run(sim);
    a.transport.send(catchupReq(0));
    a.transport.send(catchupReq(1));
    a.transport.send(catchupReq(3));
    run(sim);
    const pages = only(a.received, "catchup_response");
    const [p0, p1, p3] = [must(pages[0]), must(pages[1]), must(pages[2])];
    expect(p0.events.map((e) => e.global_seq)).toEqual([1, 2, 3]);
    expect(p0).toMatchObject({ complete: true, next_from: 3 });
    expect(p1.events.map((e) => e.global_seq)).toEqual([2, 3]);
    expect(p3.events).toEqual([]); // nothing beyond the cursor
    expect(p3).toMatchObject({ complete: true, next_from: 3 }); // echoes the cursor
  });

  it("(c)/01-F9: catchup caps at CATCHUP_PAGE_SIZE and chains via next_from across the boundary", () => {
    const sim = createSim({ seed: 41 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    const many = Array.from({ length: CATCHUP_PAGE_SIZE + 100 }, (_, i) => envelope("dev-a", i));
    a.transport.send(pushMsg(many, CATCHUP_PAGE_SIZE + 99));
    run(sim);
    a.transport.send(catchupReq(0));
    run(sim);
    const first = must(only(a.received, "catchup_response").at(-1));
    expect(first.events).toHaveLength(CATCHUP_PAGE_SIZE);
    expect(first.complete).toBe(false);
    expect(first.next_from).toBe(CATCHUP_PAGE_SIZE);
    a.transport.send(catchupReq(first.next_from));
    run(sim);
    const second = must(only(a.received, "catchup_response").at(-1));
    expect(second.events).toHaveLength(100);
    expect(second.complete).toBe(true);
    expect(second.next_from).toBe(CATCHUP_PAGE_SIZE + 100);
  });
});

describe("sim-cloud link edges (contract (c); reliable-or-down)", () => {
  it("(c): cut() fires onDown and drops sends; heal() fires onUp; a re-hello resumes with the advanced cursor", () => {
    const sim = createSim({ seed: 50 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    a.transport.send(helloMsg("dev-a"));
    a.transport.send(
      pushMsg([envelope("dev-a", 0), envelope("dev-a", 1), envelope("dev-a", 2)], 2),
    );
    run(sim);
    cloud.cut();
    run(sim);
    expect(a.isUp()).toBe(false);
    const acksBefore = only(a.received, "hello_ack").length;
    a.transport.send(helloMsg("dev-a")); // sent while down → dropped
    run(sim);
    expect(only(a.received, "hello_ack").length).toBe(acksBefore);
    cloud.heal();
    run(sim);
    expect(a.isUp()).toBe(true);
    a.transport.send(helloMsg("dev-a"));
    run(sim);
    expect(must(only(a.received, "hello_ack").at(-1)).resume_from).toBe(3); // watermark 2 + 1
  });

  it("(c): cutFor / healFor toggle a single device without touching the others", () => {
    const sim = createSim({ seed: 51 });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    const b = client(cloud, "dev-b");
    a.transport.send(helloMsg("dev-a"));
    b.transport.send(helloMsg("dev-b"));
    run(sim);
    cloud.cutFor("dev-a");
    run(sim);
    expect(a.isUp()).toBe(false);
    expect(b.isUp()).toBe(true);
    cloud.healFor("dev-a");
    run(sim);
    expect(a.isUp()).toBe(true);
  });
});

describe("sim-cloud determinism + transcript (contract (c); 20 §2.4/§2.7)", () => {
  const script = (seed: number) => {
    const sim = createSim({ seed });
    const cloud = createSimCloud({ sim });
    const a = client(cloud, "dev-a");
    const b = client(cloud, "dev-b");
    a.transport.send(helloMsg("dev-a"));
    b.transport.send(helloMsg("dev-b"));
    run(sim);
    a.transport.send(pushMsg([envelope("dev-a", 0), envelope("dev-a", 1)], 1));
    b.transport.send(pushMsg([envelope("dev-b", 0)], 0));
    run(sim);
    a.transport.send(catchupReq(0));
    run(sim);
    return cloud;
  };

  it("(c)/20 §2.4: same seed + same script ⇒ deep-equal transcript() and mergedStream()", () => {
    // Envelope ids come from newId() (non-deterministic), so drive both runs off ONE
    // generated set: the double's determinism is that its scheduling + stamping never
    // vary given identical inputs. Compare the derived, id-independent shapes.
    const shape = (cloud: SimCloud) => ({
      merged: cloud.mergedStream().map((m) => ({ gseq: m.global_seq, srx: m.server_received_at })),
      transcript: cloud.transcript().map((t) => ({ direction: t.direction, kind: t.message.kind })),
      state: cloud.state(),
    });
    expect(shape(script(77))).toEqual(shape(script(77)));
  });

  it("(c)/20 §2.7: transcript records both directions — inbound device→cloud and outbound cloud→device", () => {
    const cloud = script(78);
    const directions = new Set(cloud.transcript().map((t) => t.direction));
    expect(directions).toEqual(new Set(["in", "out"]));
    const inbound = cloud.transcript().filter((t) => t.direction === "in");
    const outbound = cloud.transcript().filter((t) => t.direction === "out");
    expect(inbound.map((t) => t.message.kind)).toContain("hello");
    expect(outbound.map((t) => t.message.kind)).toContain("hello_ack");
  });
});
