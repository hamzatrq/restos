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

import { eventRegistry, type KnownEventType } from "@restos/domain";
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

describe("registry growth must fail this suite before it can silently no-op (fix-round F5; 01-F4/01-F34)", () => {
  /** The oracle-pinned fold-consumed partition: every KnownEventType has a
   * pinned merge rule in this suite (kot.printed: consumed, projection-inert
   * per matrix rows 59/60; audit.* sits outside KnownEventType by
   * construction and is pinned fold-inert elsewhere).
   *
   * REVIEWED AND REVERTED TO ONE SET, July 2026 (oracle session; founder ruling on the
   * 26 §3 structural question). The July amendment split this into a partition —
   * engine-consumed types plus `availability.changed` dispositioned to
   * `folds/availability.ts` — on the argument that its key space was disjoint. That
   * argument was sound on its own terms and aimed at the wrong question: `26 §3`
   * specifies a projection-key sidecar in which the engine returns EVERY key an event
   * affects (`order:O1`, `item:I4`), and merge.ts's own key derivation records
   * generalising to it as the scheduled follow-up. Availability is the first `item:`-keyed
   * event, i.e. the trigger for that work — not grounds for a second fold outside the
   * engine, which also placed it outside persistence, the Auditor's independent refold
   * (01-F7/20 §4.2) and this very work counter.
   *
   * So the partition is gone and the pin is back to its original, stronger shape: EVERY
   * registry type is consumed by THIS engine. The disjointness assertion and the
   * `folds/.+\.ts` module-name string check went with it — neither describes anything
   * real once there is one engine.
   *
   * ── AMENDED August 2026 (S-1's seven service-surface types) ─────────────────────────
   * WIDENED, and a widening is what a weakening looks like from the diff alone, so read the
   * reason. `01 §4` grew by seven: `shift.opened`/`shift.closed`, `day.opened`/`day.closed`,
   * `cash.drawer_opened`, `cash.paid_out`, `cash.deposit_recorded`. All seven ARE folded —
   * `folds/merge.ts`'s `OTHER_FOLD_TYPES` routes each one to `folds/shift-cash.ts` (the
   * `shift_cash` fold, `FOLDS.md` line 15), which is also why this engine's `26 §3` sidecar
   * answers the EMPTY key list for them: they carry neither an order key nor an item key —
   * not that nothing reads them.
   *
   * `PINNED_FOLD_CONSUMED` is therefore the only honest side. `PINNED_NOT_FOLDED` states
   * `01-F52` — "not an input to ANY fold" — so filing a money-bearing shift event there would
   * assert the cash reconciliation is unfoldable, and this pin would then be defending the
   * opposite of the truth (the failure this file was rewritten to make impossible).
   *
   * The consequence for the paragraph above, stated rather than left to be inferred: this
   * set's claim is now "folded by a fold in this package", NOT "folded by the order-keyed
   * engine in this file" — "EVERY registry type is consumed by THIS engine" is SUPERSEDED as
   * of these seven. Kept, not deleted, because the July reversal it records still binds every
   * ORDER- and ITEM-keyed type. No assertion changed meaning: the two below are the union and
   * the disjointness, and neither ever read the narrower sense. */
  const PINNED_FOLD_CONSUMED = [
    "availability.changed",
    "cash.deposit_recorded",
    "cash.drawer_opened",
    "cash.paid_out",
    "day.closed",
    "day.opened",
    // ── AMENDED August 2026 (K-7) ────────────────────────────────────────────────────────
    // `kot.print_failed` is `03-F5`'s third consequence and entered the registry with it.
    // Pinned HERE and not in `PINNED_NOT_FOLDED` because that set states `01-F52` — "not an
    // input to ANY fold" — and this event is consumed by the order-keyed engine exactly as
    // `kot.printed` beside it is: counted, projection-inert, no device projection in `26`'s
    // ratified matrix. This line is the "spec-PR + oracle-pin event" the assertion below
    // demands; without it the compile-level pin reds, which is the design working.
    "kot.print_failed",
    "kot.printed",
    "order.confirmed",
    "order.created",
    "order.line_added",
    "order.line_state_changed",
    "order.settlement_closed",
    "order.table_assigned",
    "payment.recorded",
    "payment.refunded",
    "shift.closed",
    "shift.opened",
  ] as const;

  /**
   * AMENDED July 2026, and the amendment is a STRENGTHENING — read the reason before the
   * change, because "the pin was widened" is what this would look like from the diff alone.
   *
   * The pin above modelled the registry as binary: every type is fold-consumed, or the build
   * fails. `catalog.changed` is the first type that must be in the registry (`01 §4` lists
   * it; `01-F4` makes emitting an unregistered type a runtime error, so doc 14 could not
   * record a menu edit at all without it) and must have NO merge rule (`01-F52`: "catalog
   * state is not an input to any fold"). The old model could not express that: the honest
   * disposition and the silent fall-through the pin exists to catch looked identical.
   *
   * So the pin now partitions instead of asserting a single set — and a partition is a
   * stronger claim than the union it replaces, because a type must be named in exactly one
   * side. A type in NEITHER list still fails to compile, which was the whole point; a type in
   * BOTH now fails too, which the old shape could not even ask.
   */
  const PINNED_NOT_FOLDED = ["catalog.changed"] as const;

  type PinnedType = (typeof PINNED_FOLD_CONSUMED)[number] | (typeof PINNED_NOT_FOLDED)[number];
  // COMPILE-LEVEL PIN (F5): if the registry grows, this assignment stops
  // compiling — the new type has no pinned disposition yet, and an engine switch
  // without an exhaustiveness guard would fold nothing while still counting
  // events_folded (the F5 honesty overcount). Red-at-compile forces the oracle
  // pin before the code can ship a silent fall-through.
  const registryIsCovered: [KnownEventType] extends [PinnedType] ? true : never = true;

  it("01-F4 (fix-round F5): every registry type has EXACTLY ONE pinned disposition — growth is a spec-PR + oracle-pin event, never a silent fall-through", () => {
    expect(registryIsCovered).toBe(true);
    expect([...eventRegistry.types()].sort()).toEqual(
      [...PINNED_FOLD_CONSUMED, ...PINNED_NOT_FOLDED].sort(),
    );
    // The partition is disjoint. Without this, a type could be pinned as BOTH folded and
    // not-folded and the union check above would still pass — which is how a "stronger"
    // assertion quietly becomes a weaker one.
    const both = PINNED_FOLD_CONSUMED.filter((t) =>
      (PINNED_NOT_FOLDED as readonly string[]).includes(t),
    );
    expect(both, "a type cannot be both folded and deliberately not folded").toEqual([]);
  });

  it("01-F52: a non-folded type does ZERO fold work and is NOT counted as folded", () => {
    // The honesty half, asserted by EXECUTION rather than by reading the branch. An
    // `events_folded` that claims an event which folded nothing is exactly the overcount this
    // file is named for, and it is the mistake `availability.changed` made when it was wired
    // to nothing: the counter incremented before a switch whose case did not exist.
    //
    // Driven through the real store rather than the engine in isolation, because `01-F52`'s
    // claim is about what the DEVICE does with a catalog event, and an engine-only assertion
    // would not notice a store that projected one on the way in.
    const id = identity();
    const store = mergeStore(id);
    const peer = { ...peerIdentity(id), device_id: "d-catalog" };
    const before = foldStats(store).events_folded;

    store.ingest(
      peerEnvelope(peer, 0, {
        id: "e-catalog-0",
        device_created_at: T0,
        type: "catalog.changed",
        payload: {
          entity: "item",
          entity_id: "I1",
          version: 2,
          before_ref: null,
          after_ref: "ref-2",
        },
      }),
    );

    expect(foldStats(store).events_folded, "a non-folded event was counted as folded").toBe(before);
    expect(store.openOrders(), "a catalog event reached the order projection").toEqual([]);
    expect(store.kitchenQueue(), "a catalog event reached the queue projection").toEqual([]);
    // Never PARKED either. Parking is for a fact waiting on a key that may yet arrive; a
    // catalog event has no key and never will, so parking it would leak an event that can
    // never drain into a table the operator can see (DEC-SYNC-011's stuck-cursor shape).
    expect(store.parked(), "a catalog event was parked and can never drain").toEqual([]);
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
