// Acceptance tests — T-01-15 table assignment as a supersedes-DAG head-set
// (matrix row 53, §4 Prototype B + Addendum-B; 01-F19/01-F34/01-F38) and the
// duplicate-create MVR (matrix row 52; 01-F20). Authored from specs 01/26 + the
// matrix + the T-01-15 contract ONLY (24 §3 step 2).
// The retention describe-block pins the matrix-conventions `retentionDrop(keys)`
// surface — FLAGGED in the oracle report as matrix-normative but absent from the
// T-01-15 scope line (planner may confirm in-scope or move both tests).
// RED-AWAITING-IMPLEMENTATION against the shipped comparator engine.

import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  created,
  ingestAll,
  lineAdded,
  type MergeLineCell,
  mergeStore,
  projectionBytes,
  settlementClosed,
  sha256Canonical,
  shuffled,
  tableAssigned,
} from "./merge-builders.js";

const T0 = 1752800000000;
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

const onlyOrder = (store: ReturnType<typeof mergeStore>) => {
  const rows = store.openOrders();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one open_orders row");
  return row;
};

const tableIds = (row: { table_ids_json: string }): string[] =>
  JSON.parse(row.table_ids_json) as string[];

describe("matrix-B CE — chain vs conflict (01-F19/01-F34/01-F38): the whole test", () => {
  it("01-F34: a 3-move chain T7→T12→T4 with correct supersedes yields ONE head (T4) and no conflict, in every delivery order and under duplication", () => {
    const id = identity();
    const waiter = peerIdentity(id);
    const counter = peerIdentity(id);
    const createEnv = peerEnvelope(waiter, 0, { ...created("O1", { table_id: "T7" }), ...at(0) });
    const move1 = peerEnvelope(counter, 0, {
      ...tableAssigned("O1", "T12", { from: "T7", supersedes: [createEnv.id as string] }),
      ...at(100),
    });
    const move2 = peerEnvelope(waiter, 1, {
      ...tableAssigned("O1", "T4", { from: "T12", supersedes: [move1.id as string] }),
      ...at(200),
    });
    const events = [createEnv, move1, move2];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    ingestAll(two, shuffled(events, 5)); // duplication changes nothing
    const row = onlyOrder(one);
    expect(tableIds(row)).toEqual(["T4"]);
    expect(row.table_conflict).toBe(0);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F19/01-F38: three CONCURRENT moves (each superseding only the creation) yield three heads and a conflict — set-theoretically distinguishable from the chain", () => {
    const id = identity();
    const devices = [peerIdentity(id), peerIdentity(id), peerIdentity(id)];
    const root = devices[0];
    if (!root) throw new Error("missing device");
    const createEnv = peerEnvelope(root, 0, { ...created("O1", { table_id: "T1" }), ...at(0) });
    const moves = ["T4", "T12", "T7"].map((table, i) => {
      const device = devices[i];
      if (!device) throw new Error("missing device");
      return peerEnvelope(device, i === 0 ? 1 : 0, {
        ...tableAssigned("O1", table, { from: "T1", supersedes: [createEnv.id as string] }),
        ...at(100),
      });
    });
    const one = mergeStore(id);
    ingestAll(one, [createEnv, ...moves]);
    const two = mergeStore(id);
    ingestAll(two, [...moves].reverse());
    two.ingest(createEnv);
    const row = onlyOrder(one);
    expect(tableIds(row)).toEqual(["T12", "T4", "T7"]); // distinct head VALUES, UTF-16 sorted
    expect(row.table_conflict).toBe(1);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F19: a resolution assignment naming BOTH concurrent heads collapses the conflict to one head", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const other = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const headA = peerEnvelope(peer, 1, {
      ...tableAssigned("O1", "T3", { supersedes: [createEnv.id as string] }),
      ...at(100),
    });
    const headB = peerEnvelope(other, 0, {
      ...tableAssigned("O1", "T7", { supersedes: [createEnv.id as string] }),
      ...at(100),
    });
    const resolve = peerEnvelope(peer, 2, {
      ...tableAssigned("O1", "T7", {
        from: "T3",
        supersedes: [headA.id as string, headB.id as string],
      }),
      ...at(200),
    });
    const store = mergeStore(id);
    ingestAll(store, [createEnv, headA, headB, resolve]);
    const row = onlyOrder(store);
    expect(tableIds(row)).toEqual(["T7"]);
    expect(row.table_conflict).toBe(0);
    store.close();
  });
});

describe("matrix-B CE — value-equality auto-clear (01-F19/01-F34)", () => {
  it("01-F34: two concurrent heads naming the SAME table show one value and NO conflict — same destination twice is not a dispute", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const createEnv = peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) });
    const headA = peerEnvelope(peerA, 1, {
      ...tableAssigned("O1", "T9", { supersedes: [createEnv.id as string] }),
      ...at(100),
    });
    const headB = peerEnvelope(peerB, 0, {
      ...tableAssigned("O1", "T9", { supersedes: [createEnv.id as string] }),
      ...at(100),
    });
    const store = mergeStore(id);
    ingestAll(store, [createEnv, headA, headB]);
    const row = onlyOrder(store);
    expect(tableIds(row)).toEqual(["T9"]);
    expect(row.table_conflict).toBe(0);
    store.close();
  });
});

describe("the order.created root node (Addendum-B: a legal supersedes target)", () => {
  it("01-F34: a creation-carried table is the root head — no assignments means table_ids [birth], and no birth table means []", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const withBirth = mergeStore(id);
    withBirth.ingest(peerEnvelope(peer, 0, { ...created("O1", { table_id: "T2" }), ...at(0) }));
    expect(tableIds(onlyOrder(withBirth))).toEqual(["T2"]);
    expect(onlyOrder(withBirth).table_conflict).toBe(0);
    withBirth.close();
    const without = mergeStore(id);
    without.ingest(peerEnvelope(peer, 0, { ...created("O2"), ...at(0) }));
    expect(tableIds(onlyOrder(without))).toEqual([]);
    without.close();
  });
});

describe("duplicate creates — MVR with a clock-free default (matrix row 52; 01-F20)", () => {
  it("01-F20/01-F34: two creates with divergent payloads keep both, flag order_identity_conflict, and default the register to the min-payloadHash member — never a sequence pick", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const payloadA = { order_id: "O1", channel: "dine_in" };
    const payloadB = { order_id: "O1", channel: "takeaway" };
    const createA = peerEnvelope(peerA, 0, { type: "order.created", payload: payloadA, ...at(0) });
    const createB = peerEnvelope(peerB, 0, {
      type: "order.created",
      payload: payloadB,
      ...at(5000),
    });
    const expectedChannel =
      sha256Canonical(payloadA) < sha256Canonical(payloadB) ? payloadA.channel : payloadB.channel;
    const one = mergeStore(id);
    ingestAll(one, [createA, createB]);
    const two = mergeStore(id);
    ingestAll(two, [createB, createA]);
    const row = onlyOrder(one);
    expect(row.channel).toBe(expectedChannel);
    expect(JSON.parse(row.exceptions_json)).toContain("order_identity_conflict");
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F20: duplicate creates with IDENTICAL payloads are one value — no conflict raised", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) }));
    store.ingest(peerEnvelope(peerB, 0, { ...created("O1"), ...at(700) }));
    const row = onlyOrder(store);
    expect(row.channel).toBe("dine_in");
    expect(JSON.parse(row.exceptions_json)).not.toContain("order_identity_conflict");
    store.close();
  });
});

describe("retention shrink — matrix-B CE (no resurrection) + matrix-C CE (slice-shrink wholesale)", () => {
  // Pinned surface: store.retentionDrop(keys) — the outer-layer key-set operation
  // of the matrix conventions ("retentionDrop(keys) → scoped rebuild", atomic
  // per-entity granularity + open-bill guard, Addendum-B). Shrink is NEVER an
  // inverse merge. Key literals pinned to the matrix §3 compound-key default:
  // `order:<order_id>` and `line:<order_id>:<line_id>`.
  // Resolved BEFORE any toThrow() assertion so a missing API is a distinct red
  // failure, never a false-green on the guard test (an absent method also throws).
  const requireDrop = (store: ReturnType<typeof mergeStore>): ((keys: string[]) => void) => {
    const drop = store.retentionDrop;
    if (typeof drop !== "function")
      throw new Error(
        "store.retentionDrop(keys) is not implemented yet (T-01-15 red-awaiting-implementation; flagged scope item)",
      );
    return drop.bind(store);
  };
  const mustDrop = (store: ReturnType<typeof mergeStore>, keys: string[]) => {
    requireDrop(store)(keys);
  };

  it("01-F42/01-F19: dropping an order key is WHOLESALE and atomic — no fragment survives to resurrect a retired head or strand a ghost row; other orders untouched", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const createO1 = peerEnvelope(peer, 0, { ...created("O1", { table_id: "T7" }), ...at(0) });
    const move = peerEnvelope(peer, 1, {
      ...tableAssigned("O1", "T4", { from: "T7", supersedes: [createO1.id as string] }),
      ...at(100),
    });
    ingestAll(store, [
      createO1,
      move,
      peerEnvelope(peer, 2, { ...settlementClosed("O1"), ...at(200) }),
      peerEnvelope(peer, 3, { ...created("O2", { table_id: "T9" }), ...at(300) }),
    ]);
    expect(store.openOrders().map((r) => r.order_id)).toEqual(["O1", "O2"]);
    mustDrop(store, ["order:O1"]);
    // Wholesale: the key is gone — the device asserts NOTHING about O1. A partial
    // drop (heads = ∅ with the row surviving, or T7 resurrected because the
    // superseding move was pruned alone) is exactly the forbidden fragment.
    const remaining = store.openOrders();
    expect(remaining.map((r) => r.order_id)).toEqual(["O2"]);
    expect(tableIds(remaining[0] as { table_ids_json: string })).toEqual(["T9"]);
    expect(store.kitchenQueue().map((r) => r.order_id)).toEqual([]);
    store.close();
  });

  it("01-F42/01-F17: the open-bill guard — dropping an order with no settlement_closed throws and changes nothing (prune only ever removes closed entities)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) }),
    ]);
    const drop = requireDrop(store); // red if unimplemented — BEFORE the guard assertion
    const before = projectionBytes(store);
    expect(() => drop(["order:O1"])).toThrow();
    expect(projectionBytes(store)).toBe(before);
    store.close();
  });

  it("01-F40/01-F42: dropping a line key removes the line WHOLESALE — the device asserts nothing about it, never a fragment (matrix-C predicate 7)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) }),
      peerEnvelope(peer, 2, { ...lineAdded("O1", "L2", { qty: 2 }), ...at(200) }),
      peerEnvelope(peer, 3, { ...settlementClosed("O1"), ...at(300) }),
    ]);
    mustDrop(store, ["line:O1:L2"]);
    const cellsAfter = JSON.parse(onlyOrder(store).json_lines) as Record<string, MergeLineCell>;
    expect(Object.keys(cellsAfter)).toEqual(["L1"]); // L2 gone wholesale, L1 intact
    store.close();
  });
});
