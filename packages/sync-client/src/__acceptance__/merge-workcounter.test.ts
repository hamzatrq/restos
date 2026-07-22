// Acceptance tests — T-01-15 fold work counters. The contract mandates the
// foldStats() observable (carried forward from the T-01-14 oracle amendment):
// row writes are a proxy an O(N) implementation can game; events_folded is the
// real quantity. Laws pinned here: (a) global_seq adoption does ZERO fold work —
// structurally, on both adoption seams (01-F34, 26 §3); (b) fold work per arriving
// event is independent of ledger size N (T-01-15 DoD (b)); (c) the parked drain
// re-attempts only events waiting on the arrived key — work independent of the
// unrelated parked population (26 §4 defect 2; matrix row 70).
// Authored from specs 01/25 §17-corrections/26 + the matrix + the T-01-15 contract
// ONLY (24 §3 step 2). RED-AWAITING-IMPLEMENTATION.

import { describe, expect, it } from "vitest";
import { type Identity, identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  foldStats,
  ingestAll,
  lineAdded,
  type MergeStore,
  mergeStore,
  payment,
  projectionBytes,
} from "./merge-builders.js";

const T0 = 1752800000000;

type Env = Record<string, unknown> & { id: string };

/** A self-similar ledger of `orders` orders × 5 events each from one peer device —
 * ids and shapes deterministic so two ledgers differ ONLY in N. */
const buildLedger = (id: Identity, orders: number): Env[] => {
  const peer = { ...peerIdentity(id), device_id: "d-ledger" };
  const envelopes: Env[] = [];
  let lamport = 0;
  const emit = (typed: Record<string, unknown>, offset: number) => {
    const env = peerEnvelope(peer, lamport, {
      id: `e-${String(envelopes.length).padStart(5, "0")}`,
      device_created_at: T0 + offset,
      ...typed,
    }) as Env;
    lamport++;
    envelopes.push(env);
    return env;
  };
  for (let o = 0; o < orders; o++) {
    const orderId = `O${o}`;
    emit(created(orderId), o * 50);
    emit(lineAdded(orderId, `${orderId}-L0`), o * 50 + 10);
    emit(edge(orderId, `${orderId}-L0`, "confirmed", ["placed"]), o * 50 + 20);
    emit(confirmed(orderId), o * 50 + 30);
    emit(payment(orderId, 500, { attempt: `sa-${orderId}` }), o * 50 + 40);
  }
  return envelopes;
};

const foldedDelta = (store: MergeStore, work: () => void): number => {
  const before = foldStats(store).events_folded;
  work();
  return foldStats(store).events_folded - before;
};

describe("foldStats — the mandated work-counter observable (T-01-15 contract)", () => {
  it("01-F6: foldStats() exposes { full_rebuilds, scoped_rebuilds, events_folded } and counts real fold work on delivery", () => {
    const id = identity();
    const store = mergeStore(id);
    const stats0 = foldStats(store);
    expect(stats0).toEqual({
      full_rebuilds: expect.any(Number),
      scoped_rebuilds: expect.any(Number),
      events_folded: expect.any(Number),
    });
    const delta = foldedDelta(store, () => {
      ingestAll(store, buildLedger(id, 3));
    });
    expect(delta).toBeGreaterThan(0); // delivering new events IS fold work
    store.close();
  });
});

describe("global_seq adoption does ZERO fold work (01-F34, 26 §3 — structurally, not by optimisation)", () => {
  it("01-F34: assignGlobalSeq over an entire ledger folds nothing, rebuilds nothing, and leaves the projection bit-identical", () => {
    const id = identity();
    const store = mergeStore(id);
    const ledger = buildLedger(id, 60); // 300 events
    ingestAll(store, ledger);
    const before = foldStats(store);
    const bytes = projectionBytes(store);
    // Cloud order arrives REVERSED relative to emission — the worst case for the
    // superseded comparator (a full reorder), a pure sidecar write here.
    [...ledger].reverse().forEach((env, i) => {
      store.assignGlobalSeq(env.id, i + 1);
    });
    const after = foldStats(store);
    expect(after.events_folded).toBe(before.events_folded); // ZERO fold work
    expect(after.full_rebuilds).toBe(before.full_rebuilds);
    expect(after.scoped_rebuilds).toBe(before.scoped_rebuilds);
    expect(projectionBytes(store)).toBe(bytes);
    store.close();
  });

  it("01-F34: the duplicate-id ingest-with-global_seq adoption seam (LAN-first-then-cloud-catchup) also folds nothing", () => {
    const id = identity();
    const store = mergeStore(id);
    const ledger = buildLedger(id, 40); // 200 events
    ingestAll(store, ledger);
    const delta = foldedDelta(store, () => {
      ledger.forEach((env, i) => {
        expect(store.ingest(env, { global_seq: i + 1 })).toEqual({ stored: false });
      });
    });
    expect(delta).toBe(0);
    store.close();
  });
});

describe("fold work per arriving event is independent of N (T-01-15 DoD (b))", () => {
  const arrivalDelta = (orders: number, arrival: (id: Identity, seq: number) => Env): number => {
    const id = identity();
    const store = mergeStore(id);
    ingestAll(store, buildLedger(id, orders));
    const delta = foldedDelta(store, () => {
      store.ingest(arrival(id, orders));
    });
    store.close();
    return delta;
  };

  const latePayment = (id: Identity, _orders: number): Env => {
    const peer = { ...peerIdentity(id), device_id: "d-late" };
    return peerEnvelope(peer, 0, {
      id: "e-late-payment",
      device_created_at: T0 + 10_000_000,
      ...payment("O0", 700, { attempt: "sa-late" }),
    }) as Env;
  };

  const lateEdge = (id: Identity, _orders: number): Env => {
    const peer = { ...peerIdentity(id), device_id: "d-late" };
    return peerEnvelope(peer, 0, {
      id: "e-late-edge",
      device_created_at: T0 + 10_000_000,
      ...edge("O0", "O0-L0", "in_prep", ["confirmed"]),
    }) as Env;
  };

  it("01-F6/00 §5: one arriving payment folds the same events_folded on a 40-order ledger as on a 160-order ledger", () => {
    expect(arrivalDelta(160, latePayment)).toBe(arrivalDelta(40, latePayment));
  });

  it("01-F6/00 §5: one arriving line edge folds the same events_folded on a 40-order ledger as on a 160-order ledger", () => {
    expect(arrivalDelta(160, lateEdge)).toBe(arrivalDelta(40, lateEdge));
  });
});

describe("the parked drain is keyed by waiting_for (26 §4 defect 2; matrix row 70)", () => {
  const drainDelta = (orphans: number): number => {
    const id = identity();
    const store = mergeStore(id);
    const peer = { ...peerIdentity(id), device_id: "d-orphans" };
    // M orphan confirms, each awaiting a DIFFERENT never-delivered order key…
    for (let i = 0; i < orphans; i++) {
      store.ingest(
        peerEnvelope(peer, i, {
          id: `e-orphan-${String(i).padStart(3, "0")}`,
          device_created_at: T0 + i,
          ...confirmed(`O-missing-${i}`),
        }),
      );
    }
    // …plus one orphan confirm for the order that WILL arrive.
    store.ingest(
      peerEnvelope(peer, orphans, {
        id: "e-orphan-target",
        device_created_at: T0 + orphans,
        ...confirmed("O-target"),
      }),
    );
    const delta = foldedDelta(store, () => {
      store.ingest(
        peerEnvelope(peer, orphans + 1, {
          id: "e-target-created",
          device_created_at: T0 + orphans + 1,
          ...created("O-target"),
        }),
      );
    });
    expect(store.parked().map((r) => r.event_id)).toHaveLength(orphans); // only the target drained
    store.close();
    return delta;
  };

  it("01-F10/01-F6: draining one arrived key does work independent of the UNRELATED parked population (5 vs 50 orphans)", () => {
    expect(drainDelta(50)).toBe(drainDelta(5));
  });
});
