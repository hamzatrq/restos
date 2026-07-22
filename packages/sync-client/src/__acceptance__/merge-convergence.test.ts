// Acceptance tests — T-01-15 fold-specific convergence (01-F34 rewritten; 01-N1;
// 01-F6). Authored from specs 01/26 + the merge-semantics matrix + the T-01-15
// contract ONLY (24 §3 step 2). The oracle changed shape (26 §7): equal delivered
// set ⇒ byte-equal projection, over permutations, duplications and the three
// delivery seams — NOT equality to one universal canonical replay.
// Refold-equivalence is deliberately not used anywhere in this suite: it encodes
// the superseded comparator (T-01-15 oracle rules).
// RED-AWAITING-IMPLEMENTATION against the shipped comparator engine.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { appendInput, identity, peerEnvelope, peerIdentity, tempDbPath } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  generateMergeSet,
  heapPermutations,
  ingestAll,
  lineAdded,
  type MergeLineCell,
  mergeStore,
  PINNED_QUEUE_ROW_KEYS,
  payment,
  projectionBytes,
  refund,
  settlementClosed,
  shuffled,
  tableAssigned,
} from "./merge-builders.js";

const T0 = 1752800000000;
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

const seedArb = fc.integer({ min: 0, max: 0x7fffffff });

/** Six distinct peer devices so every permutation is a legal delivery (the ingest
 * seam has no cross-device order constraint; 01-F34 quantifies over the SET). */
const directedSixEventSet = (id: ReturnType<typeof identity>) => {
  const devices = [0, 1, 2, 3, 4, 5].map(() => peerIdentity(id));
  const mk = (i: number, typed: Record<string, unknown>, offset: number) => {
    const device = devices[i];
    if (!device) throw new Error("device index out of range");
    return peerEnvelope(device, 0, { id: `e-${i}`, ...typed, ...at(offset) });
  };
  const createdEnv = mk(0, created("O1", { table_id: "T1" }), 0);
  return [
    createdEnv,
    mk(1, lineAdded("O1", "L1"), 100),
    mk(2, edge("O1", "L1", "confirmed", ["placed"]), 200),
    mk(3, tableAssigned("O1", "T4", { from: "T1", supersedes: [createdEnv.id] }), 300),
    mk(4, payment("O1", 50000, { attempt: "sa-x" }), 400),
    mk(5, settlementClosed("O1", { settlement_attempt_ids: ["sa-x"] }), 500),
  ];
};

describe("fold-specific convergence — exhaustive permutations (01-F34/01-N1)", () => {
  it("01-F34/01-N1: every permutation of a 6-event mixed set (create, line, edge, assign, payment, close) projects byte-identically", () => {
    const id = identity();
    const events = directedSixEventSet(id);
    const reference = mergeStore(id);
    ingestAll(reference, events);
    const expected = projectionBytes(reference);
    reference.close();
    let permutationCount = 0;
    for (const perm of heapPermutations(events)) {
      const store = mergeStore(id);
      ingestAll(store, perm);
      expect(projectionBytes(store), `permutation #${permutationCount}`).toBe(expected);
      store.close();
      permutationCount++;
    }
    expect(permutationCount).toBe(720); // 6! — exhaustive, not sampled
  });
});

describe("fold-specific convergence — seeded permutations + duplications (01-F34/01-N1, 20 §2.3)", () => {
  it("01-F34/01-N1: equal delivered set ⇒ byte-equal projection over seeded shuffles with duplicated deliveries", () => {
    fc.assert(
      fc.property(seedArb, seedArb, seedArb, (setSeed, orderSeed, dupSeed) => {
        const set = generateMergeSet(setSeed);
        const one = mergeStore(set.identity);
        ingestAll(one, set.envelopes); // emission order
        const two = mergeStore(set.identity);
        ingestAll(two, shuffled(set.envelopes, orderSeed)); // arbitrary permutation
        // Duplications: re-deliver a seeded shuffled subset — idempotent by set law.
        ingestAll(
          two,
          shuffled(set.envelopes, dupSeed).slice(0, Math.ceil(set.envelopes.length / 2)),
        );
        expect(projectionBytes(two)).toBe(projectionBytes(one));
        one.close();
        two.close();
      }),
      { numRuns: 200 },
    );
  });

  it("01-F34: delivering the whole set twice, then a shuffled subset a third time, changes nothing — duplication is invisible", () => {
    const id = identity();
    const set = generateMergeSet(20260722);
    const store = mergeStore({ ...id, ...set.identity });
    ingestAll(store, set.envelopes);
    const before = projectionBytes(store);
    ingestAll(store, set.envelopes);
    ingestAll(store, shuffled(set.envelopes, 7).slice(0, 5));
    expect(projectionBytes(store)).toBe(before);
    store.close();
  });
});

describe("the three delivery seams — append / ingest / ingestBatch (01-F34, T-01-15 contract)", () => {
  it("01-F34/01-F8: the same set via per-event ingest, via ingestBatch chunks, and with own events appended before vs after peers, projects byte-identically", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const ownInputs = [
      appendInput(id, { ...created("O1", { table_id: "T1" }), ...at(0) }),
      appendInput(id, { ...payment("O1", 30000, { attempt: "sa-own" }), ...at(400) }),
    ];
    const peerEvents = [
      peerEnvelope(peer, 0, { ...lineAdded("O1", "L1", { unit_price_paisa: 30000 }), ...at(100) }),
      peerEnvelope(peer, 1, { ...edge("O1", "L1", "confirmed", ["placed"]), ...at(200) }),
      peerEnvelope(peer, 2, { ...confirmed("O1"), ...at(300) }),
      peerEnvelope(peer, 3, {
        ...settlementClosed("O1", { settlement_attempt_ids: ["sa-own"] }),
        ...at(500),
      }),
    ];
    // Seam A: own first (append), then peers one by one (ingest).
    const a = mergeStore(id);
    for (const input of ownInputs) a.append(input);
    ingestAll(a, peerEvents);
    // Seam B: peers as one batch (ingestBatch), then own appends.
    const b = mergeStore(id);
    expect(b.ingestBatch(peerEvents)).toEqual({ appended: 4, deduped: 0, rejected: 0 });
    for (const input of ownInputs) b.append(input);
    // Seam C: interleaved — batch chunk, append, batch chunk, append.
    const c = mergeStore(id);
    c.ingestBatch(peerEvents.slice(0, 2));
    const firstOwn = ownInputs[0];
    const secondOwn = ownInputs[1];
    if (!firstOwn || !secondOwn) throw new Error("own inputs missing");
    c.append(firstOwn);
    c.ingestBatch(peerEvents.slice(2));
    c.append(secondOwn);
    const bytes = projectionBytes(a);
    expect(projectionBytes(b)).toBe(bytes);
    expect(projectionBytes(c)).toBe(bytes);
    a.close();
    b.close();
    c.close();
  });
});

describe("carried keys end parking for money and line events (01-F10 read per matrix row 70; 26 §4)", () => {
  it("01-F31/01-F10: a payment for an unseen order never parks — the order row materializes its total when order.created arrives, identically in both orders", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const pay = peerEnvelope(peer, 0, { ...payment("O1", 700, { attempt: "sa-1" }), ...at(100) });
    const createEnv = peerEnvelope(peer, 1, { ...created("O1"), ...at(0) });
    const payFirst = mergeStore(id);
    payFirst.ingest(pay);
    expect(payFirst.parked()).toEqual([]); // carried order key: nothing to await
    expect(payFirst.openOrders()).toEqual([]); // row existence is the create's G-Set
    payFirst.ingest(createEnv);
    const createFirst = mergeStore(id);
    createFirst.ingest(createEnv);
    createFirst.ingest(pay);
    expect(projectionBytes(payFirst)).toBe(projectionBytes(createFirst));
    const row = payFirst.openOrders()[0];
    expect(row?.pay_total).toBe(700);
    payFirst.close();
    createFirst.close();
  });

  it("01-F29/01-F10: a refund delivered before its parent payment and before the order never parks, and the fully-reversed chain converges to the forward delivery", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const pay = peerEnvelope(peer, 1, { ...payment("O1", 500, { attempt: "sa-p" }), ...at(10) });
    const ref = peerEnvelope(peer, 2, {
      ...refund("O1", 200, { attempt: "sa-r", parent: "sa-p" }),
      ...at(20),
    });
    const reversed = mergeStore(id);
    reversed.ingest(ref);
    expect(reversed.parked()).toEqual([]); // order_id + payment_attempt_id are carried
    reversed.ingest(pay);
    expect(reversed.parked()).toEqual([]);
    reversed.ingest(createEnv);
    const forward = mergeStore(id);
    forward.ingest(createEnv);
    forward.ingest(pay);
    forward.ingest(ref);
    expect(projectionBytes(reversed)).toBe(projectionBytes(forward));
    const row = reversed.openOrders()[0];
    expect(row?.refund_total).toBe(200);
    reversed.close();
    forward.close();
  });

  it("01-F34/01-F10: line-state edges are stored unconditionally — an edge before its line_added (and before the order) never parks and converges to the forward order", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) });
    const move = peerEnvelope(peer, 2, {
      ...edge("O1", "L1", "confirmed", ["placed"]),
      ...at(200),
    });
    const edgeFirst = mergeStore(id);
    edgeFirst.ingest(move);
    expect(edgeFirst.parked()).toEqual([]); // this type never parks (matrix row 61)
    expect(edgeFirst.openOrders()).toEqual([]);
    edgeFirst.ingest(add);
    edgeFirst.ingest(createEnv);
    const forward = mergeStore(id);
    forward.ingest(createEnv);
    forward.ingest(add);
    forward.ingest(move);
    expect(projectionBytes(edgeFirst)).toBe(projectionBytes(forward));
    const row = forward.openOrders()[0];
    const cells = JSON.parse(row?.json_lines ?? "{}") as Record<string, MergeLineCell>;
    expect(cells.L1?.states).toEqual(["confirmed"]);
    edgeFirst.close();
    forward.close();
  });

  it("01-F10: an orphan confirm (create never delivered) is held, not dropped — state tables unaffected, membership visible, drained by the late parent", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const orphan = peerEnvelope(peer, 0, { ...confirmed("O-late"), ...at(100) });
    const createEnv = peerEnvelope(peer, 1, { ...created("O-late"), ...at(0) });
    const store = mergeStore(id);
    store.ingest(orphan);
    expect(store.openOrders()).toEqual([]);
    expect(store.kitchenQueue()).toEqual([]);
    expect(store.parked().map((r) => r.event_id)).toEqual([orphan.id]); // applied ∪ parked = stored
    store.ingest(createEnv);
    expect(store.parked()).toEqual([]);
    const forward = mergeStore(id);
    forward.ingest(createEnv);
    forward.ingest(orphan);
    expect(projectionBytes(store)).toBe(projectionBytes(forward));
    store.close();
    forward.close();
  });
});

describe("durability — the merge projection survives abrupt abandon (01-F2/01-F6, 20 §2.6 seed)", () => {
  it("01-F2/01-F6: after abrupt handle abandon, reopen yields a byte-identical projection (no refold oracle — the projection itself is compared)", () => {
    const set = generateMergeSet(424242);
    const path = tempDbPath();
    let store = mergeStore(set.identity, path);
    ingestAll(store, set.envelopes);
    const before = projectionBytes(store);
    // abrupt abandon: no close()
    store = mergeStore(set.identity, path);
    expect(projectionBytes(store)).toBe(before);
    store.close();
  });
});

describe("time-valued columns — value stamping unchanged until DEC-TIME-001 (T-01-15 out-of-scope note)", () => {
  it("01-F6: a single confirm stamps confirmed_at/confirm_at from its own device_created_at (value law unchanged; rank law is clock-free)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }));
    store.ingest(peerEnvelope(peer, 1, { ...confirmed("O1"), ...at(500) }));
    expect(store.openOrders()[0]?.confirmed_at).toBe(T0 + 500);
    expect(store.kitchenQueue()[0]?.confirm_at).toBe(T0 + 500);
    store.close();
  });

  it("01-F6/01-N1: with two confirms the anchor is delivery-order independent, and its value is one of the delivered confirms' stamps", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const createEnv = peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) });
    const confirmA = peerEnvelope(peerA, 1, { ...confirmed("O1"), ...at(1000) });
    const confirmB = peerEnvelope(peerB, 0, { ...confirmed("O1"), ...at(2000) });
    const one = mergeStore(id);
    ingestAll(one, [createEnv, confirmA, confirmB]);
    const two = mergeStore(id);
    ingestAll(two, [createEnv, confirmB, confirmA]);
    const anchor = one.openOrders()[0]?.confirmed_at;
    expect([T0 + 1000, T0 + 2000]).toContain(anchor);
    expect(two.openOrders()[0]?.confirmed_at).toBe(anchor);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("03-F25/03-F26: age_basis equals the confirm anchor — the kot.printed fallback is deleted (a late print never re-ages the ticket)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }));
    store.ingest(peerEnvelope(peer, 1, { ...confirmed("O1"), ...at(500) }));
    store.ingest(
      peerEnvelope(peer, 2, { type: "kot.printed", payload: { order_id: "O1" }, ...at(800) }),
    );
    const row = store.kitchenQueue()[0];
    if (!row) throw new Error("expected a kitchen_queue row after the confirm");
    expect(Object.keys(row).sort()).toEqual([...PINNED_QUEUE_ROW_KEYS]);
    expect(row.confirm_at).toBe(T0 + 500);
    expect(row.age_basis).toBe(T0 + 500); // NOT T0+800 — matrix rows 59/60
    store.close();
  });

  it("01-F6: a kitchen_queue row exists iff the confirmed fact holds — channel carried from order.created", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peer, 0, { ...created("O1", { channel: "takeaway" }), ...at(0) }));
    expect(store.kitchenQueue()).toEqual([]);
    store.ingest(peerEnvelope(peer, 1, { ...confirmed("O1"), ...at(100) }));
    expect(store.kitchenQueue().map((r) => [r.order_id, r.channel])).toEqual([["O1", "takeaway"]]);
    store.close();
  });
});
