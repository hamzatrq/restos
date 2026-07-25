// Acceptance tests — T-01-15 money plane: unique-keyed attempt maps (01-F31),
// refund cap (01-F29), purpose discrimination (01-F30/01-F32), matrix §4
// Prototype-A predicates and counterexamples as NAMED regression cases.
// Authored from specs 01/26 + the matrix (§1 money rows, §4A, Addendum-A) + the
// T-01-15 contract ONLY (24 §3 step 2).
// RED-AWAITING-IMPLEMENTATION against the shipped comparator engine.

import { describe, expect, it } from "vitest";
import { appendInput, canonicalJson, identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  created,
  ingestAll,
  lineAdded,
  mergeStore,
  PINNED_ORDER_ROW_KEYS,
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

const exceptions = (row: { exceptions_json: string }): string[] =>
  JSON.parse(row.exceptions_json) as string[];

describe("matrix-A CE1 — min-by-id stale retry (01-F31/01-F34)", () => {
  it("01-F31/01-F34: divergent members of one attempt key mark it disputed and contribute ZERO — the fold never picks, in either delivery order", () => {
    // C2's clock is 6 months behind and its stale retry carries the LOW envelope id:
    // a min-by-envelope-id (= min-wall-clock) tiebreak would pick 500 and pay_total
    // would DROP 185,000 → 500 on delivery. Required: disputed, contributes 0.
    const id = identity();
    const c1 = peerIdentity(id);
    const c2 = peerIdentity(id);
    const createEnv = peerEnvelope(c1, 0, { ...created("O1"), ...at(0) });
    const goodMember = peerEnvelope(c1, 1, {
      id: "e-99-good",
      ...payment("O1", 185000, { attempt: "sa-K" }),
      ...at(1000),
    });
    const staleRetry = peerEnvelope(c2, 0, {
      id: "e-01-stale",
      ...payment("O1", 500, { attempt: "sa-K" }),
      device_created_at: T0 - 1000 * 60 * 60 * 24 * 180, // 6 months behind
    });
    const agreed = peerEnvelope(c1, 2, {
      ...payment("O1", 600, { attempt: "sa-K2" }),
      ...at(2000),
    });
    const one = mergeStore(id);
    ingestAll(one, [createEnv, goodMember, staleRetry, agreed]);
    const two = mergeStore(id);
    ingestAll(two, [createEnv, staleRetry, agreed, goodMember]);
    const row = onlyOrder(one);
    expect(row.pay_total).toBe(600); // Σ skips the disputed key entirely
    expect(exceptions(row)).toContain("attempt_divergence");
    const attempts = JSON.parse(row.pay_attempts_json) as Record<string, unknown[]>;
    expect(attempts["sa-K"]).toHaveLength(2); // both members retained, rendered, unpicked
    expect(attempts["sa-K2"]).toHaveLength(1);
    // Ledger retention (01-F1): both envelope rows stand.
    const ids = one.readAllEvents().map((e) => e.id);
    expect(ids).toContain("e-99-good");
    expect(ids).toContain("e-01-stale");
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F31: whole-payload immutability — members differing ONLY in purpose dispute the key and contribute 0 to BOTH totals (Addendum-A)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }));
    store.ingest(
      peerEnvelope(peer, 1, {
        ...payment("O1", 50000, { attempt: "sa-P", purpose: "settles_order" }),
        ...at(100),
      }),
    );
    store.ingest(
      peerEnvelope(peer, 2, {
        ...payment("O1", 50000, { attempt: "sa-P", purpose: "repays_receivable" }),
        ...at(200),
      }),
    );
    const row = onlyOrder(store);
    expect(row.pay_total).toBe(0);
    expect(row.repaid_total).toBe(0);
    expect(exceptions(row)).toContain("attempt_divergence");
    store.close();
  });

  it("01-F29/01-F31: divergent members of one REFUND attempt key dispute it — refund_total contributes 0", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }));
    store.ingest(
      peerEnvelope(peer, 1, { ...payment("O1", 100000, { attempt: "sa-K" }), ...at(100) }),
    );
    store.ingest(
      peerEnvelope(peer, 2, {
        ...refund("O1", 30000, { attempt: "sa-R", parent: "sa-K" }),
        ...at(200),
      }),
    );
    store.ingest(
      peerEnvelope(peer, 3, {
        ...refund("O1", 40000, { attempt: "sa-R", parent: "sa-K" }),
        ...at(300),
      }),
    );
    const row = onlyOrder(store);
    expect(row.refund_total).toBe(0);
    expect(exceptions(row)).toContain("attempt_divergence");
    store.close();
  });
});

describe("attempt-id idempotence across the delivery seams (01-F31/01-F8/01-F1)", () => {
  it("01-F31: two envelopes with distinct ids and one settlement_attempt_id (identical intent) contribute ONCE — append-then-ingest and ingest-then-append agree, both rows retained", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const ownInput = appendInput(id, {
      ...payment("O1", 40000, { attempt: "sa-dup" }),
      ...at(200),
    });
    const peerTwin = peerEnvelope(peer, 0, {
      ...payment("O1", 40000, { attempt: "sa-dup" }),
      ...at(300),
    });
    const createEnv = peerEnvelope(peer, 1, { ...created("O1"), ...at(0) });
    const appendFirst = mergeStore(id);
    appendFirst.ingest(createEnv);
    appendFirst.append(ownInput);
    appendFirst.ingest(peerTwin);
    const ingestFirst = mergeStore(id);
    ingestFirst.ingest(createEnv);
    ingestFirst.ingest(peerTwin);
    ingestFirst.append(ownInput);
    for (const store of [appendFirst, ingestFirst]) {
      const row = onlyOrder(store);
      expect(row.pay_total).toBe(40000); // once, not twice — intent-level idempotence
      expect(exceptions(row)).not.toContain("attempt_divergence"); // agreement is not divergence
      const attempts = JSON.parse(row.pay_attempts_json) as Record<string, unknown[]>;
      expect(attempts["sa-dup"]).toEqual([
        JSON.parse(
          canonicalJson({
            amount_paisa: 40000,
            method: "cash",
            order_id: "O1",
            purpose: "settles_order",
          }),
        ),
      ]);
      expect(
        store
          .readAllEvents()
          .map((e) => e.id)
          .sort(),
      ).toEqual([ownInput.id as string, peerTwin.id as string, createEnv.id as string].sort()); // 01-F1: the ledger keeps every envelope; only the fold collapses the intent
    }
    expect(projectionBytes(ingestFirst)).toBe(projectionBytes(appendFirst));
    appendFirst.close();
    ingestFirst.close();
  });

  it("01-F31/01-F29 (fix-round F8): version skew cannot manufacture a dispute — two refund members identical except the superseded `payment_id` loose extra AGREE; the tolerated field is outside the immutable intent", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const createEnv = peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) });
    const payK = peerEnvelope(peerA, 1, {
      ...payment("O1", 100000, { attempt: "sa-K" }),
      ...at(100),
    });
    // An old-build device still stamps the superseded envelope-id parent ref
    // (C2: `payment_id` tolerated as a loose extra, never required)…
    const oldBuild = peerEnvelope(peerA, 2, {
      ...refund("O1", 30000, { attempt: "sa-R", parent: "sa-K" }),
      ...at(200),
    });
    (oldBuild.payload as Record<string, unknown>).payment_id = payK.id;
    // …while an upgraded device's retry of the SAME intent does not.
    const newBuild = peerEnvelope(peerB, 0, {
      ...refund("O1", 30000, { attempt: "sa-R", parent: "sa-K" }),
      ...at(300),
    });
    const events = [createEnv, payK, oldBuild, newBuild];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    const row = onlyOrder(one);
    expect(row.refund_total).toBe(30000); // once — agreement, not divergence
    expect(exceptions(row)).not.toContain("attempt_divergence");
    const attempts = JSON.parse(row.refund_attempts_json) as Record<string, unknown[]>;
    // ONE member: the immutable intent, superseded-tolerated fields excluded
    // from comparison AND rendering (the F8 ruling; exclusion set pinned
    // per-type — payment.refunded: {payment_id}).
    expect(attempts["sa-R"]).toEqual([
      JSON.parse(
        canonicalJson({
          amount_paisa: 30000,
          method: "cash_out",
          order_id: "O1",
          payment_attempt_id: "sa-K",
        }),
      ),
    ]);
    expect(row.cap_violated).toBe(0);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F31/01-F8: the ingestBatch seam collapses the same intent identically to per-event ingest", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const createEnv = peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) });
    const memberOne = peerEnvelope(peerA, 1, {
      ...payment("O1", 25000, { attempt: "sa-batch" }),
      ...at(100),
    });
    const memberTwo = peerEnvelope(peerB, 0, {
      ...payment("O1", 25000, { attempt: "sa-batch" }),
      ...at(150),
    });
    const batched = mergeStore(id);
    expect(batched.ingestBatch([createEnv, memberOne, memberTwo])).toEqual({
      appended: 3,
      deduped: 0,
      rejected: 0,
    });
    const single = mergeStore(id);
    ingestAll(single, [createEnv, memberOne, memberTwo]);
    expect(onlyOrder(batched).pay_total).toBe(25000);
    expect(projectionBytes(batched)).toBe(projectionBytes(single));
    batched.close();
    single.close();
  });
});

describe("matrix-A CE2 — khata repayment (01-F30/01-F32, DEC-MONEY-007)", () => {
  it("01-F32: a repays_receivable payment never enters pay_total — a repaid tab can never read as overpaid; the receivable decrement is repaid_total", () => {
    // Day 1: khata settlement (a tendering payment, method khata_credit).
    // Day 4: cash repayment of the receivable — another payment.recorded on the
    // same order (02-F14). A naive UKS doubles the money and every device shows
    // "OVERPAID ₨1,850 — refund to close" (the matrix's measured failure).
    const id = identity();
    const peer = peerIdentity(id);
    const events = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 185000 }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, {
        ...payment("O1", 185000, { attempt: "sa-K1", method: "khata_credit" }),
        ...at(200),
      }),
      peerEnvelope(peer, 3, {
        // Fix-round F4 re-expression: the close carries an HONEST snapshot of
        // the khata bill (billed 185000 = the one line) so the exception surface
        // can be asserted empty instead of silently carried.
        ...settlementClosed("O1", { settlement_attempt_ids: ["sa-K1"], billed_paisa: 185000 }),
        ...at(300),
      }),
      peerEnvelope(peer, 4, {
        ...payment("O1", 185000, {
          attempt: "sa-K2",
          method: "cash",
          purpose: "repays_receivable",
        }),
        ...at(4 * 24 * 3600 * 1000),
      }),
    ];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    const row = onlyOrder(one);
    expect(row.pay_total).toBe(185000); // unchanged by the repayment
    expect(row.repaid_total).toBe(185000); // the receivable decrements, observably
    expect(row.refund_total).toBe(0);
    expect(row.settled).toBe(1); // the close is monotone — day-4 arrivals change nothing
    expect(exceptions(row)).toEqual([]); // F4: asserted explicitly — the clean khata flow carries NO exception
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });
});

describe("matrix-A CE3 — misattributed refund (01-F29/01-F40)", () => {
  it("01-F29: a refund whose parent attempt was never delivered still converges — order-keyed total counts it, the cap rests at unknown (not violated), nothing parks", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const events = [
      peerEnvelope(peer, 0, { ...created("O47"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...refund("O47", 18500, { attempt: "sa-r1", parent: "sa-on-a-stranded-till" }),
        ...at(100),
      }),
    ];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    const row = onlyOrder(one);
    expect(row.refund_total).toBe(18500); // the total never depends on holding the parent
    expect(row.cap_violated).toBe(0); // unknown is an honest resting state, not a violation
    expect(one.parked()).toEqual([]);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });
});

describe("matrix-A CE4 — tendered amount (01-F31/02-F12): overpayment is underivable", () => {
  it("01-F31: billed never enters the money fold — the openOrders row is EXACTLY the pinned key set, with no derived signed column to hang a refund affordance on", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    store.ingest(peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }));
    store.ingest(
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: 185000 }),
        ...at(100),
      }),
    );
    // The cashier keys the TENDERED figure (₨2,000 on a ₨1,850 bill).
    store.ingest(
      peerEnvelope(peer, 2, { ...payment("O1", 200000, { attempt: "sa-T" }), ...at(200) }),
    );
    const row = onlyOrder(store);
    expect(Object.keys(row).sort()).toEqual([...PINNED_ORDER_ROW_KEYS]);
    for (const banned of ["balance_paisa", "money_delta", "overpaid", "amount_due_paisa"]) {
      expect(row).not.toHaveProperty(banned);
    }
    expect(row.pay_total).toBe(200000); // converges perfectly on the number it was given
    store.close();
  });
});

describe("the 01-F29 refund cap — monotone `violated`, gating, never blocking", () => {
  it("01-F29: cumulative refunds beyond the parent attempt's agreed amount flip cap_violated to 1, identically in every delivery order", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const events = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...payment("O1", 1000, { attempt: "sa-K" }), ...at(100) }),
      peerEnvelope(peer, 2, {
        ...refund("O1", 600, { attempt: "sa-r1", parent: "sa-K" }),
        ...at(200),
      }),
      peerEnvelope(peer, 3, {
        ...refund("O1", 600, { attempt: "sa-r2", parent: "sa-K" }),
        ...at(300),
      }),
    ];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    expect(onlyOrder(one).cap_violated).toBe(1);
    expect(onlyOrder(one).refund_total).toBe(1200); // both stand (01-F1) — the SET predicate flags
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F29: exact cover is not a violation — refunds of 400 + 600 against 1000 leave cap_violated 0", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...payment("O1", 1000, { attempt: "sa-K" }), ...at(100) }),
      peerEnvelope(peer, 2, {
        ...refund("O1", 400, { attempt: "sa-r1", parent: "sa-K" }),
        ...at(200),
      }),
      peerEnvelope(peer, 3, {
        ...refund("O1", 600, { attempt: "sa-r2", parent: "sa-K" }),
        ...at(300),
      }),
    ]);
    expect(onlyOrder(store).cap_violated).toBe(0);
    store.close();
  });

  it("01-F29/01-F17: violated is MONOTONE and never blocks — later deliveries and duplications cannot clear it, a later sale still appends, the settle act stands", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const events = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...payment("O1", 1000, { attempt: "sa-K" }), ...at(100) }),
      peerEnvelope(peer, 2, {
        ...refund("O1", 1200, { attempt: "sa-r1", parent: "sa-K" }),
        ...at(200),
      }),
      peerEnvelope(peer, 3, {
        ...settlementClosed("O1", { settlement_attempt_ids: ["sa-K"] }),
        ...at(250),
      }),
    ];
    ingestAll(store, events);
    expect(onlyOrder(store).cap_violated).toBe(1);
    // More money arriving does not launder the violation…
    store.ingest(
      peerEnvelope(peer, 4, { ...payment("O1", 5000, { attempt: "sa-K2" }), ...at(300) }),
    );
    ingestAll(store, events); // …and neither does re-delivery
    expect(onlyOrder(store).cap_violated).toBe(1);
    // Never blocking (01-F17): the sale path stays open and the settle act stands.
    store.append(appendInput(id, { ...lineAdded("O1", "L9"), ...at(400) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  it("01-F29/01-F31 (fix-round F3): dispute-after-violation — the cap flag is a LATCH: a later divergent member of the parent key moves the totals (Addendum-A) but can never clear violated, in any delivery order", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const other = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const payK = peerEnvelope(peer, 1, { ...payment("O1", 1000, { attempt: "sa-K" }), ...at(100) });
    const overRefund = peerEnvelope(peer, 2, {
      ...refund("O1", 1200, { attempt: "sa-r1", parent: "sa-K" }),
      ...at(200),
    });
    const divergent = peerEnvelope(other, 0, {
      ...payment("O1", 1500, { attempt: "sa-K" }),
      ...at(300),
    });
    const one = mergeStore(id);
    ingestAll(one, [createEnv, payK, overRefund]);
    expect(onlyOrder(one).cap_violated).toBe(1); // the violation is witnessed
    one.ingest(divergent); // the parent key is now disputed…
    const row = onlyOrder(one);
    expect(row.pay_total).toBe(0); // …totals move: a disputed key contributes 0
    expect(row.refund_total).toBe(1200);
    expect(exceptions(row)).toContain("attempt_divergence");
    expect(row.cap_violated).toBe(1); // …but the flag LATCHES — it never regresses
    // The latch must be an order-free monotone function of the delivered SET
    // (∃ an agreed sub-view violating the cap), never a delivery-order memory —
    // 01-F34 convergence still binds: the dispute arriving FIRST lands on 1 too.
    const two = mergeStore(id);
    ingestAll(two, [createEnv, divergent, payK, overRefund]);
    expect(onlyOrder(two).cap_violated).toBe(1);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F29: the cap resolves parents by settlement_attempt_id, not envelope id — an intent duplicated under two envelope ids cannot fragment the cap (Addendum-A)", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peerA, 0, { ...created("O1"), ...at(0) }),
      // One payment intent, two envelope ids (crash-retry across devices).
      peerEnvelope(peerA, 1, { ...payment("O1", 185000, { attempt: "sa-K" }), ...at(100) }),
      peerEnvelope(peerB, 0, { ...payment("O1", 185000, { attempt: "sa-K" }), ...at(150) }),
      // Refunds totalling 200,000 against a 185,000 intent: an envelope-id-keyed cap
      // sees two fragments of 100,000 ≤ 185,000 each and never fires.
      peerEnvelope(peerB, 1, {
        ...refund("O1", 100000, { attempt: "sa-r1", parent: "sa-K" }),
        ...at(200),
      }),
      peerEnvelope(peerB, 2, {
        ...refund("O1", 100000, { attempt: "sa-r2", parent: "sa-K" }),
        ...at(300),
      }),
    ]);
    expect(onlyOrder(store).cap_violated).toBe(1);
    store.close();
  });
});
