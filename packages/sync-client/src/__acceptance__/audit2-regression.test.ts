// Regression guards — external-audit-2 findings F1, F2, F4. The fixes are landed;
// these pin the corrected behaviour so a revert turns them RED. Each test drives the
// bug through the real surfaces (openStore / createCloudSession), never a mock of the
// thing under test.
//
// F1 (01-F9/01-F34) — cloud pull cursor. applyEvents used to advance
//   `last_global_seq` to the batch MAXIMUM even when an event's store.ingest() threw,
//   so a failed event was skipped forever: catchup resumes from the cursor and never
//   re-fetches behind it. Fixed: the cursor advances only through a contiguous PREFIX
//   of events that landed.
// F2 (01-F34) — divergent duplicate ingest. store.ingest deduped by id ALONE, so a
//   peer/cloud event reusing a stored id with different content was a silent no-op and
//   two devices disagreed under one id forever. Fixed: DivergentDuplicateError, with
//   the stored row untouched — while the benign paths (identical retry, identical
//   retry carrying a global_seq, cloud-stamped server_received_at) still pass.
// F4 (01-F6/01-F34) — canonical JSON consolidation. folds/replay.ts carried its own
//   canonicalJson that rendered `[undefined]` as `[]` and kept `{k: undefined}` as the
//   literal `undefined`, while JSON.stringify (what SQLite actually stores) drops the
//   key and writes `[null]`. A parked event's envelope_json therefore differed before
//   vs after reopen/refold. Fixed: folds re-export the domain serializer (18 §2).
import { canonicalJson as domainCanonicalJson } from "@restos/domain";
import type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
// T-01-15 enumeration entry 27 (M): the fold module is now folds/merge.ts — the
// consolidation law itself (one declared-once serializer, 18 §2) is unchanged.
import { canonicalJson as foldsCanonicalJson } from "../folds/merge.js";
import { createCloudSession, DivergentDuplicateError, openStore } from "../index.js";
import {
  identity,
  must,
  orderCreated,
  peerEnvelope,
  peerIdentity,
  tempDbPath,
} from "./builders.js";

/** The cloud session schedules no timers of its own — time is inert here. */
const stubClock: Clock = {
  now: () => 0,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

/**
 * Hand-driven CloudTransport: the sim-cloud double cannot emit a POISONED batch, and
 * these guards are about exactly what the session does when an inbound event fails to
 * ingest. `deliver` feeds one wire message; `sent` is the device→cloud tape.
 */
const stubTransport = () => {
  const sent: ProtocolMessage[] = [];
  let handlers: CloudTransportHandlers | null = null;
  const transport: CloudTransport = {
    start(h) {
      handlers = h;
    },
    stop() {
      handlers = null;
    },
    send(message) {
      sent.push(message);
    },
  };
  return {
    transport,
    sent,
    up: () => must(handlers, "started handlers").onUp(),
    deliver: (message: ProtocolMessage) => must(handlers, "started handlers").onMessage(message),
  };
};

const HELLO_ACK: ProtocolMessage = {
  v: 1,
  kind: "hello_ack",
  session_id: "session-audit2",
  hub: false,
  resume_from: 0,
};

/** event_batch literal; envelopes come from peerEnvelope so the shape is the real one. */
const eventBatch = (events: readonly unknown[]): ProtocolMessage =>
  ({ v: 1, kind: "event_batch", events }) as unknown as ProtocolMessage;

const withGlobalSeq = (envelope: object, global_seq: number) => ({ ...envelope, global_seq });

/** Store + cloud session over the hand-driven transport, connected through hello_ack. */
const connectedDevice = () => {
  const id = identity();
  const store = openStore({ path: ":memory:", identity: id });
  const link = stubTransport();
  const session = createCloudSession({
    store,
    transport: link.transport,
    clock: stubClock,
    device_class: "counter_electron",
    token: "cloud-token-stub",
  });
  session.start();
  link.up();
  link.deliver(HELLO_ACK);
  return { id, store, session, link };
};

/** The from_global_seq of the last catchup_request the device sent (exclusive cursor). */
const lastCatchupFrom = (sent: readonly ProtocolMessage[]): number =>
  must(sent.filter((m) => m.kind === "catchup_request").at(-1), "a catchup_request")
    .from_global_seq;

describe("F1 cloud pull cursor stops at a failed ingest (01-F9/01-F34)", () => {
  it("01-F9/01-F34: an event that FAILS to ingest halts the pull cursor, so catchup re-delivers it instead of skipping it forever", () => {
    const { store, session, link } = connectedDevice();
    const peer = peerIdentity(store.identity);

    // Batch 1 — clean: peer lamport 5 lands and the cursor moves to global_seq 5.
    const occupant = peerEnvelope(peer, 5);
    link.deliver(eventBatch([withGlobalSeq(occupant, 5)]));
    expect(store.status().last_global_seq).toBe(5);

    // Batch 2 — global_seq 6 is a DIFFERENT event id reusing (device_id, lamport 5):
    // a per-device lamport collision, which the store rejects as corruption (01-F3).
    // This is a plain ingest failure, NOT a divergent duplicate: nothing about it is
    // permanently known-bad from the cursor's point of view, so the cursor must stop.
    const collider = peerEnvelope(peer, 5);
    const later = peerEnvelope(peer, 6);
    link.deliver(eventBatch([withGlobalSeq(collider, 6), withGlobalSeq(later, 7)]));

    // THE guard: the cursor stopped BEFORE the failed event (pre-fix it jumped to the
    // batch maximum 7 and global_seq 6 became unreachable forever).
    expect(store.status().last_global_seq).toBe(5);
    expect(session.status().last_global_seq).toBe(5);

    // The collider genuinely did not land, and it is not quarantined — quarantine is
    // reserved for permanently-known-bad events, and treating this as one would
    // reintroduce the skip.
    const storedIds = new Set(store.readAllEvents().map((e) => e.id));
    expect(storedIds.has(collider.id)).toBe(false);
    expect(session.status().quarantined).toHaveLength(0);

    // The valid later event physically landed, but is NOT lost from the cursor's
    // perspective: the cursor is still behind it, so catchup re-delivers it (an
    // identical re-ingest is a benign no-op, 01-F8).
    expect(storedIds.has(later.id)).toBe(true);

    // The consequence that matters: the next catchup resumes from 5, so global_seq 6
    // is re-fetched. Pre-fix this read 7 and the hole was permanent.
    link.up();
    link.deliver(HELLO_ACK);
    expect(lastCatchupFrom(link.sent)).toBe(5);

    session.stop();
    store.close();
  });
});

describe("F2 divergent duplicate ingest (01-F34)", () => {
  it("01-F34: ingesting a stored id with DIFFERENT content throws DivergentDuplicateError and leaves the stored row untouched", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = peerIdentity(id);

    const original = peerEnvelope(peer, 0, orderCreated("order-diverge"));
    expect(store.ingest(original)).toEqual({ stored: true });

    // Same id, different device-authored content — pre-fix this was a silent no-op
    // and the two devices disagreed under one id forever.
    const divergent = {
      ...original,
      payload: { order_id: "order-diverge", channel: "takeaway" },
    };
    expect(() => store.ingest(divergent)).toThrow(DivergentDuplicateError);

    // The ledger row is never overwritten (01-F1) — the ORIGINAL content survives,
    // both in the event row and in the fold state derived from it.
    const stored = must(
      store.readAllEvents().find((e) => e.id === original.id),
      "the stored original",
    );
    expect(stored.payload).toEqual({ order_id: "order-diverge", channel: "dine_in" });
    expect(must(store.openOrders()[0], "the order row").channel).toBe("dine_in");

    store.close();
  });

  it("01-F8/01-F34: an IDENTICAL re-ingest is still a benign no-op — the divergence check must not over-trigger", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = peerIdentity(id);

    const original = peerEnvelope(peer, 0, orderCreated("order-identical"));
    store.ingest(original);

    expect(store.ingest({ ...original })).toEqual({ stored: false });
    // The cloud legitimately returns the SAME event stamped with server_received_at —
    // that field is cloud-assigned and is excluded from the content comparison, so the
    // origin-inclusive fan-out of a device's own peers is not mistaken for divergence.
    expect(store.ingest({ ...original, server_received_at: 1752800009000 })).toEqual({
      stored: false,
    });
    expect(store.readAllEvents()).toHaveLength(1);
    expect(store.openOrders()).toHaveLength(1);

    store.close();
  });

  it("01-F34: an identical re-ingest CARRYING a global_seq still adopts the cloud ordering (the LAN-first-then-cloud path keeps working)", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = peerIdentity(id);

    // LAN first: the event arrives with no cloud order.
    const original = peerEnvelope(peer, 0, orderCreated("order-adopt"));
    expect(store.ingest(original)).toEqual({ stored: true });

    // Cloud catchup second: the same event, now stamped. Still no new row...
    expect(store.ingest({ ...original }, { global_seq: 42 })).toEqual({ stored: false });

    // ...but the ordering WAS adopted: re-acking 42 is idempotent, while any other
    // value now collides with the held one (01-F3 — cloud order is immutable).
    expect(() => store.assignGlobalSeq(original.id, 42)).not.toThrow();
    expect(() => store.assignGlobalSeq(original.id, 43)).toThrow(/already holds global_seq 42/);

    store.close();
  });

  it("01-F17/01-F34: a divergent duplicate inside a cloud batch is surfaced as quarantined AND the pull cursor advances past it (it must not wedge the pull)", () => {
    const { store, session, link } = connectedDevice();
    const peer = peerIdentity(store.identity);

    const original = peerEnvelope(peer, 0, orderCreated("order-batch-diverge"));
    link.deliver(eventBatch([withGlobalSeq(original, 1)]));
    expect(store.status().last_global_seq).toBe(1);

    const divergent = {
      ...original,
      payload: { order_id: "order-batch-diverge", channel: "takeaway" },
    };
    const clean = peerEnvelope(peer, 1);
    link.deliver(eventBatch([withGlobalSeq(divergent, 2), withGlobalSeq(clean, 3)]));

    expect(session.status().quarantined).toContainEqual({
      event_id: original.id,
      reason: "divergent_duplicate",
    });
    // The deliberate distinction from F1: a divergent duplicate's id is ALREADY stored,
    // so re-fetching it can never help — the cursor passes it rather than wedging the
    // pull, and the clean event behind it still counts (01-F17: never wedge).
    expect(store.status().last_global_seq).toBe(3);
    expect(new Set(store.readAllEvents().map((e) => e.id)).has(clean.id)).toBe(true);
    // The stored row still holds the original content.
    expect(must(store.openOrders().find((o) => o.order_id === "order-batch-diverge")).channel).toBe(
      "dine_in",
    );

    session.stop();
    store.close();
  });
});

describe("F4 canonical JSON consolidation (01-F6/01-F34)", () => {
  // T-01-15 enumeration entry 27 (R): the reopen byte-equality survives; the
  // refold leg is dropped (the banned oracle is not ported).
  it("01-F6/01-F34: a parked event's envelope_json is byte-identical across reopen, even with JSON-omitted payload values", () => {
    const path = tempDbPath();
    const id = identity();
    const peer = peerIdentity(id);
    const store = openStore({ path, identity: id });

    // order.confirmed for an unseen order parks (01-F10), and a parked row keeps the
    // canonical envelope_json. Its payload carries both JSON-omitted shapes: an
    // undefined ARRAY element (JSON.stringify writes `null`) and an undefined KEY
    // (JSON.stringify drops it) — exactly where the local serializer diverged.
    const parking = peerEnvelope(peer, 0, {
      type: "order.confirmed",
      payload: {
        order_id: "order-unseen",
        tags: ["a", undefined, "b"],
        note: undefined,
      },
    });
    expect(store.ingest(parking)).toEqual({ stored: true });

    const before = store.parked();
    expect(before).toHaveLength(1);
    const beforeJson = must(before[0], "the parked row").envelope_json;

    // A second handle on the same FILE — the reopen self-heal path (01-F6).
    store.close();
    const reopened = openStore({ path, identity: id });
    expect(must(reopened.parked()[0], "the reopened parked row").envelope_json).toBe(beforeJson);
    expect(reopened.parked()).toEqual(before);

    // And the bytes are what JSON.stringify persists: `[null]` for the hole, no `note`.
    expect(beforeJson).toContain('"tags":["a",null,"b"]');
    expect(beforeJson).not.toContain("note");
    expect(beforeJson).not.toContain("undefined");

    reopened.close();
  });

  it("01-F6/01-F34: folds' canonicalJson IS the domain serializer, and both mirror JSON.stringify on omitted values", () => {
    // The consolidation itself: one declared-once serializer (18 §2), not a copy that
    // can drift again.
    expect(foldsCanonicalJson).toBe(domainCanonicalJson);

    const value = { arr: [1, undefined, 3], k: undefined, a: "x" };
    expect(foldsCanonicalJson(value)).toBe(domainCanonicalJson(value));
    // Pre-fix the folds copy produced `{"a":"x","arr":[1,,3],"k":undefined}`.
    expect(foldsCanonicalJson(value)).toBe('{"a":"x","arr":[1,null,3]}');
    // Byte-equal to what storage round-trips (modulo the canonical key sort).
    expect(foldsCanonicalJson(JSON.parse(JSON.stringify(value)))).toBe(foldsCanonicalJson(value));
  });
});
