// Acceptance tests — T-01-15 table assignment as a supersedes-DAG head-set
// (matrix row 53, §4 Prototype B + Addendum-B; 01-F19/01-F34/01-F38) and the
// duplicate-create MVR (matrix row 52; 01-F20). Authored from specs 01/26 + the
// matrix + the T-01-15 contract ONLY (24 §3 step 2).
// The retention describe-block pins the matrix-conventions `retentionDrop(keys)`
// surface — ratified in scope by contract ruling C4; the fix-round F1/F2/F8 pins
// (mixed-key atomicity, dropped-key memory, malformed-key rejection) cite
// plans/wave-0/t-01-15-fix-round.md and are EXPECTED RED until the fix lands.

import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  confirmed,
  created,
  foldStats,
  ingestAll,
  lineAdded,
  type MergeLineCell,
  mergeStore,
  payment,
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

  it("01-F42/01-F19 (fix-round F1): a mixed order+line key drop either succeeds atomically or rejects loudly changing NOTHING — in-memory lattice included, no key-order dependence", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const late = peerIdentity(id);
    const events = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) }),
      peerEnvelope(peer, 2, { ...settlementClosed("O1", { billed_paisa: 50000 }), ...at(200) }),
      peerEnvelope(peer, 3, { ...created("O2"), ...at(300) }),
    ];
    // The reject branch must leave the engine able to keep folding O1 — a
    // half-dropped in-memory lattice (F1's engine/DB divergence) would let this
    // later payment overwrite the surviving row with a create-less fragment
    // projection (the row silently VANISHES on the next O1 delivery).
    const latePay = peerEnvelope(late, 0, {
      ...payment("O1", 600, { attempt: "sa-late" }),
      ...at(400),
    });
    const runDrop = (keys: string[]) => {
      const store = mergeStore(id);
      ingestAll(store, events);
      const before = projectionBytes(store);
      let threw = false;
      try {
        requireDrop(store)(keys);
      } catch {
        threw = true;
      }
      if (threw) {
        // Rejected ⇒ NOTHING changed: projections byte-equal pre-call…
        expect(projectionBytes(store)).toBe(before);
        // …and a subsequent O1 delivery still folds correctly (no fragment).
        store.ingest(latePay);
        const row = store.openOrders().find((r) => r.order_id === "O1");
        expect(row, "O1 must survive a rejected drop and keep folding").toBeDefined();
        expect(row?.pay_total).toBe(600);
        expect(row?.settled).toBe(1);
      } else {
        // Succeeded ⇒ wholesale and atomic: O1 gone from every projection, O2
        // and the ledger untouched (01-F1).
        expect(store.openOrders().map((r) => r.order_id)).toEqual(["O2"]);
        expect(store.kitchenQueue()).toEqual([]);
        expect(
          store
            .readAllEvents()
            .map((e) => e.id)
            .sort(),
        ).toEqual(events.map((e) => e.id as string).sort());
      }
      const bytes = projectionBytes(store);
      store.close();
      return { threw, bytes };
    };
    const forward = runDrop(["order:O1", "line:O1:L1"]);
    const reversed = runDrop(["line:O1:L1", "order:O1"]);
    expect(reversed.threw).toBe(forward.threw); // no key-order dependence…
    expect(reversed.bytes).toBe(forward.bytes); // …in outcome or in final state
  });

  it("01-F42/01-F1 (fix-round F2): after a successful order drop, a never-seen straggler for the dropped key is ledger-retained, never folded, never projected — and counts no fold work", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) }),
      peerEnvelope(peer, 2, { ...settlementClosed("O1", { billed_paisa: 50000 }), ...at(200) }),
      peerEnvelope(peer, 3, { ...created("O2", { table_id: "T9" }), ...at(300) }),
    ]);
    mustDrop(store, ["order:O1"]);
    const afterDrop = projectionBytes(store);
    const folded = foldStats(store).events_folded;
    // The duplicate-create profile: a weeks-late order.created for the DROPPED
    // key under a new envelope id — exactly F2's resurrection vector (a settled,
    // dropped order reappearing as open on the floor).
    const straggler = peerEnvelope(peerIdentity(id), 0, {
      ...created("O1", { channel: "takeaway" }),
      ...at(4000),
    });
    expect(store.ingest(straggler)).toEqual({ stored: true }); // the LEDGER keeps it (01-F1)
    expect(store.openOrders().map((r) => r.order_id)).toEqual(["O2"]); // never projected
    expect(store.kitchenQueue()).toEqual([]);
    expect(projectionBytes(store)).toBe(afterDrop);
    // Counter treatment (oracle-pinned per the fix-round delegation): a straggler
    // for a dropped key is NOT folded, so the honesty counter must not claim fold
    // work — the same principle that makes F5's silent fall-through an overcount.
    expect(foldStats(store).events_folded).toBe(folded);
    // A bare order-fact straggler must not PARK either — parked membership is
    // projection surface and the key is retired for this session (01-F10).
    const confirmStraggler = peerEnvelope(peerIdentity(id), 0, { ...confirmed("O1"), ...at(4100) });
    expect(store.ingest(confirmStraggler)).toEqual({ stored: true });
    expect(store.parked()).toEqual([]);
    expect(projectionBytes(store)).toBe(afterDrop);
    const ids = store.readAllEvents().map((e) => e.id);
    expect(ids).toContain(straggler.id as string);
    expect(ids).toContain(confirmStraggler.id as string);
    store.close();
  });

  it("01-F40/01-F42 (fix-round F2): after a successful line drop, a never-seen line_added for the dropped line key never re-materializes the cell — ledger-retained only", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) }),
      peerEnvelope(peer, 2, { ...lineAdded("O1", "L2", { qty: 2 }), ...at(200) }),
      peerEnvelope(peer, 3, { ...settlementClosed("O1", { billed_paisa: 150000 }), ...at(300) }),
    ]);
    mustDrop(store, ["line:O1:L2"]);
    const afterDrop = projectionBytes(store);
    const straggler = peerEnvelope(peerIdentity(id), 0, {
      ...lineAdded("O1", "L2", { qty: 3 }),
      ...at(4000),
    });
    expect(store.ingest(straggler)).toEqual({ stored: true }); // ledger-retained (01-F1)
    const cellsAfter = JSON.parse(onlyOrder(store).json_lines) as Record<string, MergeLineCell>;
    expect(Object.keys(cellsAfter)).toEqual(["L1"]); // the dropped line stays dropped
    expect(projectionBytes(store)).toBe(afterDrop);
    expect(store.readAllEvents().map((e) => e.id)).toContain(straggler.id as string);
    // The counter is deliberately UNPINNED for line-key stragglers: a multi-line
    // event can be partially live (one dropped line, one live), so whether the
    // engine counts the partially-inert fold is an implementation freedom.
    store.close();
  });

  it("01-F42/18 §4 (fix-round F8): a malformed drop key is rejected loudly with nothing changed — `line:O1` must never silently mis-parse into (order O, line O1)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    // An order genuinely named "O" holding a line genuinely named "O1" — the
    // exact shape a lax parser mis-targets.
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O", "O1"), ...at(100) }),
      peerEnvelope(peer, 2, { ...settlementClosed("O", { billed_paisa: 50000 }), ...at(200) }),
    ]);
    const drop = requireDrop(store);
    const before = projectionBytes(store);
    expect(() => drop(["line:O1"])).toThrow(); // malformed — no <line_id> part
    expect(projectionBytes(store)).toBe(before);
    expect(() => drop(["table:T1"])).toThrow(); // unknown prefix — same loud rejection
    expect(projectionBytes(store)).toBe(before);
    store.close();
  });
});
