// Acceptance tests — T-01-15 settlement (01-F33: an ACT, not a derivation) and the
// two cross-plane matrix counterexamples that hinge on it: the ack-boundary flip
// (§4C P0) and the settle-gating partition heal (§4C P0). Authored from specs 01/26
// + the matrix + the T-01-15 contract ONLY (24 §3 step 2).
// These tests REPLACE the superseded derived-`settled` laws of the T-01-04 suite
// (exact-cover settles / refund unsettles) — enumeration in the oracle report.
// RED-AWAITING-IMPLEMENTATION against the shipped comparator engine.

import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity, tempDbPath } from "./builders.js";
import {
  created,
  edge,
  ingestAll,
  lineAdded,
  type MergeLineCell,
  mergeStore,
  payment,
  projectionBytes,
  refund,
  settlementClosed,
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

const cells = (row: { json_lines: string }) =>
  JSON.parse(row.json_lines) as Record<string, MergeLineCell>;

describe("settlement is an act, not a derivation (01-F33)", () => {
  it("01-F33: exact arithmetic cover WITHOUT a settlement_closed leaves settled 0 — nothing arithmetic settles an order", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 2, unit_price_paisa: 500 }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, { ...payment("O1", 1000, { attempt: "sa-K" }), ...at(200) }),
    ]);
    expect(onlyOrder(store).settled).toBe(0);
    store.close();
  });

  it("01-F33: the settlement_closed act settles — offline-legal, even with zero payments and zero lines (the fold judges no arithmetic)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...settlementClosed("O1"), ...at(100) }),
    ]);
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  it("01-F33/01-F29: a refund after the close never un-settles — post-settlement corrections are linked event pairs, reopening does not exist", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 2, unit_price_paisa: 500 }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, { ...payment("O1", 1000, { attempt: "sa-K" }), ...at(200) }),
      peerEnvelope(peer, 3, {
        // Fix-round F4 re-expression: the close carries an HONEST snapshot
        // (billed 1000 = the line) so the exception surface can be asserted
        // empty instead of silently carried.
        ...settlementClosed("O1", { settlement_attempt_ids: ["sa-K"], billed_paisa: 1000 }),
        ...at(300),
      }),
    ]);
    expect(onlyOrder(store).settled).toBe(1);
    store.ingest(
      peerEnvelope(peer, 4, {
        ...refund("O1", 300, { attempt: "sa-r", parent: "sa-K" }),
        ...at(400),
      }),
    );
    const row = onlyOrder(store);
    expect(row.settled).toBe(1);
    expect(JSON.parse(row.exceptions_json)).toEqual([]); // F4: asserted explicitly — a clean post-close refund carries NO exception
    store.close();
  });

  it("01-F33: a late line-add does not reopen — settled stays 1 and the order raises uncovered_addition", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 500 }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, { ...payment("O1", 500, { attempt: "sa-K" }), ...at(200) }),
      peerEnvelope(peer, 3, {
        ...settlementClosed("O1", { settlement_attempt_ids: ["sa-K"] }),
        ...at(300),
      }),
      peerEnvelope(peer, 4, {
        ...lineAdded("O1", "L2", { qty: 1, unit_price_paisa: 700 }),
        ...at(400),
      }),
    ]);
    const row = onlyOrder(store);
    expect(row.settled).toBe(1);
    expect(JSON.parse(row.exceptions_json)).toContain("uncovered_addition");
    store.close();
  });

  it("01-F33/01-F35: two concurrent closes collapse to one settled fact — monotone OR, no conflict raised, any delivery order", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const events = [
      peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peerA, 1, { ...settlementClosed("O1"), ...at(100) }),
      peerEnvelope(peerB, 0, { ...settlementClosed("O1"), ...at(100) }),
    ];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    expect(onlyOrder(one).settled).toBe(1);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });
});

describe("settlement_closed snapshot semantics (fix-round F4; 01-F33/00 §6)", () => {
  it("01-F33 (fix-round F4): a snapshot-less close — only order_id, the schema minimum — asserts NO ceiling: 'no attestation' is not 'attested zero', so no uncovered_addition", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 600 }),
        ...at(100),
      }),
      // The bare close: the registry requires only order_id — every snapshot
      // field is an additive loose extra.
      peerEnvelope(peer, 2, {
        type: "order.settlement_closed",
        payload: { order_id: "O1" },
        ...at(200),
      }),
    ]);
    const row = onlyOrder(store);
    expect(row.settled).toBe(1); // the act settles (01-F33)
    expect(JSON.parse(row.exceptions_json)).toEqual([]); // skipped, not zero — no exception of any kind
    store.close();
  });

  it("01-F33/00 §6 (fix-round F4): a non-integer billed_paisa snapshot is ignored-with-anomaly — close_snapshot_invalid, no ceiling from it — and the session projection byte-equals the reopen projection", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const path = tempDbPath();
    let store = mergeStore(id, path);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 600 }),
        ...at(100),
      }),
      // A float is not paisa (00 §6). (Infinity — the reviewed session-vs-reopen
      // divergence vector — is unconstructible over JSON ingest; the float pins
      // the same guard.)
      peerEnvelope(peer, 2, { ...settlementClosed("O1", { billed_paisa: 500.5 }), ...at(200) }),
    ]);
    const sessionRow = onlyOrder(store);
    expect(sessionRow.settled).toBe(1); // the ACT stands — only its snapshot is bad
    // Ignored-with-anomaly: the invalid snapshot contributes NO ceiling (so no
    // uncovered_addition from a 600-paisa line vs a garbage 500.5) and raises
    // the oracle-pinned code instead.
    expect(JSON.parse(sessionRow.exceptions_json)).toEqual(["close_snapshot_invalid"]);
    const sessionBytes = projectionBytes(store);
    store.close();
    store = mergeStore(id, path); // reopen replays the surviving ledger (01-F6)
    expect(projectionBytes(store)).toBe(sessionBytes); // session ≡ reopen, byte-for-byte
    store.close();
  });

  it("01-F33 (fix-round F4): a negative billed_paisa snapshot is ignored-with-anomaly and raises NO spurious uncovered_addition — not even on a lineless order", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...settlementClosed("O1", { billed_paisa: -100 }), ...at(100) }),
    ]);
    const row = onlyOrder(store);
    expect(row.settled).toBe(1);
    expect(JSON.parse(row.exceptions_json)).toEqual(["close_snapshot_invalid"]);
    store.close();
  });
});

describe("matrix-C CE1 — the ack-boundary flip (01-F33/01-F34/01-F35)", () => {
  it("01-F34: concurrent →voided and →served on a paid, closed line render the SAME contested pair before and after global_seq assignment — settled invariant, bit-identical projection from the identical event set", () => {
    // Under the superseded comparator this read `settled = 1` before ack and
    // `settled = 0` with 50,000 paisa unmatched after — from the identical set.
    const id = identity();
    const kitchen = peerIdentity(id);
    const counter = peerIdentity(id);
    const chainHead = "e-ready";
    const events = [
      peerEnvelope(counter, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(counter, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 50000 }),
        ...at(100),
      }),
      peerEnvelope(counter, 2, {
        id: chainHead,
        ...edge("O1", "L1", "ready", ["in_prep"], []),
        ...at(200),
      }),
      peerEnvelope(counter, 3, { ...payment("O1", 50000, { attempt: "sa-K" }), ...at(300) }),
      peerEnvelope(counter, 4, {
        ...settlementClosed("O1", { settlement_attempt_ids: ["sa-K"] }),
        ...at(400),
      }),
      peerEnvelope(kitchen, 0, {
        ...edge("O1", "L1", "voided", ["ready"], [chainHead]),
        ...at(500),
      }),
      peerEnvelope(counter, 5, {
        ...edge("O1", "L1", "served", ["ready"], [chainHead]),
        ...at(500),
      }),
    ];
    const store = mergeStore(id);
    ingestAll(store, events);
    const before = projectionBytes(store);
    const rowBefore = onlyOrder(store);
    expect(rowBefore.settled).toBe(1);
    // The contested pair is the projection — rendered, in ORDER_LINE_STATES index order.
    expect(cells(rowBefore).L1?.states).toEqual(["served", "voided"]);
    // The cloud acks the whole set, in an order that reverses the two terminals.
    const ackOrder = [...events].reverse();
    ackOrder.forEach((env, i) => {
      store.assignGlobalSeq(env.id as string, i + 1);
    });
    expect(projectionBytes(store)).toBe(before); // the ack changes NOTHING
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  it("01-F35: an edge claiming placed→ready is payload-illegal — flagged, never applied, and (unlike the comparator engine) the verdict is a pure function of the edge's own payload", () => {
    // Companion pin for the CE above: its chain edge claims in_prep→ready (legal
    // from the emitter's own from_states). Had it claimed placed→ready it would be
    // payload-illegal — this test pins that boundary so the CE cannot silently
    // come to depend on an illegal edge applying.
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const bad = peerEnvelope(peer, 2, { ...edge("O1", "L1", "ready", ["placed"], []), ...at(200) });
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(100) }),
      bad,
    ]);
    const cell = cells(onlyOrder(store)).L1;
    expect(cell?.states).toEqual(["placed"]);
    expect(cell?.anomalies).toEqual({ [bad.id as string]: "illegal_transition" });
    store.close();
  });
});

describe("matrix-C CE3 — settle gating across a partition heal (01-F33/01-F17/05-F8)", () => {
  it("01-F33: C1 voids L3 while C2 serves L3 and settles — at heal the order STAYS settled with the contest rendered; contested never gates settle (the AND-guard wedge is the refuted design)", () => {
    // 20:12–20:31 partition; guests left 20:18. An AND-guard (settled requires no
    // contested line) forces settled → 0 on a paid order whose customer left, and
    // only a human merge edge could clear it — permanently wedged, strictly worse
    // than the comparator. Required: contested and settled are orthogonal.
    const id = identity();
    const c1 = peerIdentity(id);
    const c2 = peerIdentity(id);
    const head = "e-l3-ready";
    const shared = [
      peerEnvelope(c1, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(c1, 1, {
        ...lineAdded("O1", "L3", { qty: 1, unit_price_paisa: 180000 }),
        ...at(100),
      }),
      peerEnvelope(c1, 2, { id: head, ...edge("O1", "L3", "ready", ["in_prep"], []), ...at(200) }),
    ];
    const c1Side = peerEnvelope(c1, 3, {
      ...edge("O1", "L3", "voided", ["ready"], [head]),
      ...at(1000),
    });
    const c2Serve = peerEnvelope(c2, 0, {
      ...edge("O1", "L3", "served", ["ready"], [head]),
      ...at(1100),
    });
    const c2Pay = peerEnvelope(c2, 1, {
      ...payment("O1", 180000, { attempt: "sa-K" }),
      ...at(1200),
    });
    const c2Close = peerEnvelope(c2, 2, {
      ...settlementClosed("O1", { settlement_attempt_ids: ["sa-K"] }),
      ...at(1300),
    });
    // Heal order A: C1's void arrives after C2's settle chain.
    const healA = mergeStore(id);
    ingestAll(healA, [...shared, c2Serve, c2Pay, c2Close, c1Side]);
    // Heal order B: the void lands first.
    const healB = mergeStore(id);
    ingestAll(healB, [...shared, c1Side, c2Serve, c2Pay, c2Close]);
    for (const store of [healA, healB]) {
      const row = onlyOrder(store);
      expect(row.settled).toBe(1); // the act stands; contest never gates it
      expect(cells(row).L3?.states).toEqual(["served", "voided"]); // both humans' claims rendered
      expect(row.cap_violated).toBe(0);
    }
    expect(projectionBytes(healB)).toBe(projectionBytes(healA));
    healA.close();
    healB.close();
  });
});
