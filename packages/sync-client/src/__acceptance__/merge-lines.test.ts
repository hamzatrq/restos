// Acceptance tests — T-01-15 line workflow as the edge-set model (matrix rows
// 61–68, §4 Prototype C + Addendum-C; 01-F35/01-F34/03-F17/03-F19/03-F24).
// ≼-max ranges over ALL legal non-terminal edges (never over heads — Addendum-C);
// terminal contest is a rendered MVR set; cooking-done = any terminal head ∨
// watermark ≥ picked_up. Authored from specs 01/03-cited-FRs/26 + the matrix + the
// T-01-15 contract ONLY (24 §3 step 2).
// RED-AWAITING-IMPLEMENTATION against the shipped comparator engine.

import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  confirmed,
  created,
  edge,
  ingestAll,
  lineAdded,
  type MergeLineCell,
  mergeStore,
  projectionBytes,
  shuffled,
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

const cell = (store: ReturnType<typeof mergeStore>, lineId: string): MergeLineCell => {
  const cells = JSON.parse(onlyOrder(store).json_lines) as Record<string, MergeLineCell>;
  const found = cells[lineId];
  if (!found) throw new Error(`expected a cell for line ${lineId}`);
  return found;
};

const onlyQueueRow = (store: ReturnType<typeof mergeStore>) => {
  const rows = store.kitchenQueue();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one kitchen_queue row");
  return row;
};

describe("non-terminal join — ≼-max over ALL legal edges (01-F35/01-F34)", () => {
  it("01-F34: a legal edge chain projects its maximum in every delivery order — no tie rule is ever invoked on the non-terminal total chain", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const e1 = peerEnvelope(peer, 2, { ...edge("O1", "L1", "confirmed", ["placed"]), ...at(100) });
    const e2 = peerEnvelope(peer, 3, {
      ...edge("O1", "L1", "in_prep", ["confirmed"], [e1.id as string]),
      ...at(200),
    });
    const e3 = peerEnvelope(peer, 4, {
      ...edge("O1", "L1", "ready", ["in_prep"], [e2.id as string]),
      ...at(300),
    });
    const events = [createEnv, add, e1, e2, e3];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, shuffled(events, 99));
    expect(cell(one, "L1").states).toEqual(["ready"]);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F35 (Addendum-C): a legal edge that RETIRES a higher head never lowers the projection — the max ranges over all legal edges, not over heads", () => {
    // eA →confirmed, eB →in_prep (preds [eA]). eD claims placed→confirmed with
    // preds [eB]: it retires the in_prep head, so max-over-HEADS would drop to
    // confirmed — breaking monotonicity. Max over ALL legal edges stays in_prep.
    const id = identity();
    const peer = peerIdentity(id);
    const other = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const eA = peerEnvelope(peer, 2, { ...edge("O1", "L1", "confirmed", ["placed"]), ...at(100) });
    const eB = peerEnvelope(peer, 3, {
      ...edge("O1", "L1", "in_prep", ["confirmed"], [eA.id as string]),
      ...at(200),
    });
    const eD = peerEnvelope(other, 0, {
      ...edge("O1", "L1", "confirmed", ["placed"], [eB.id as string]),
      ...at(300),
    });
    const events = [createEnv, add, eA, eB, eD];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    expect(cell(one, "L1").states).toEqual(["in_prep"]); // adding an edge never decreases the value
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("matrix-C CE — 400ms preds:[] liveness (01-F34/01-F35): a second rapid tap that read a pre-append head and emitted preds [] still participates — no grounding gate, no anomaly", () => {
    const id = identity();
    const station = peerIdentity(id);
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const e1 = peerEnvelope(peer, 2, { ...edge("O1", "L1", "confirmed", ["placed"]), ...at(100) });
    const e2 = peerEnvelope(peer, 3, {
      ...edge("O1", "L1", "in_prep", ["confirmed"], [e1.id as string]),
      ...at(200),
    });
    // Two station taps 400 ms apart: the first names its predecessor, the second
    // read a pre-append head and carries preds: [] — under an LFP grounding gate it
    // grounds on no device, ever, with no anomaly and no rolling-window backstop.
    const tap1 = peerEnvelope(station, 0, {
      ...edge("O1", "L1", "ready", ["in_prep"], [e2.id as string]),
      ...at(300),
    });
    const tap2 = peerEnvelope(station, 1, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(300 + 400),
    });
    const store = mergeStore(id);
    ingestAll(store, [createEnv, add, e1, e2, tap1, tap2]);
    const c = cell(store, "L1");
    expect(c.states).toEqual(["ready"]);
    expect(c.anomalies).toEqual({}); // every legal edge participates in the max
    store.close();
  });
});

describe("terminal contest — MVR, adoption, differing resolutions (01-F35/01-F19/01-F38)", () => {
  const contestedFixture = (id: ReturnType<typeof identity>) => {
    const kitchen = peerIdentity(id);
    const counter = peerIdentity(id);
    const createEnv = peerEnvelope(counter, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(counter, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const head = peerEnvelope(counter, 2, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(100),
    });
    const served = peerEnvelope(counter, 3, {
      ...edge("O1", "L1", "served", ["ready"], [head.id as string]),
      ...at(200),
    });
    const voided = peerEnvelope(kitchen, 0, {
      ...edge("O1", "L1", "voided", ["ready"], [head.id as string]),
      ...at(200),
    });
    return { kitchen, counter, events: [createEnv, add, head, served, voided], served, voided };
  };

  it("01-F35/01-F19: two distinct terminal heads project THE SET, in ORDER_LINE_STATES index order, byte-identically in every delivery order", () => {
    const id = identity();
    const fixture = contestedFixture(id);
    const one = mergeStore(id);
    ingestAll(one, fixture.events);
    const two = mergeStore(id);
    ingestAll(two, [...fixture.events].reverse());
    expect(cell(one, "L1").states).toEqual(["served", "voided"]); // the algebra reports the disagreement
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F19: a resolution edge naming BOTH terminal heads adopts one — |from_states| > 1 ∧ to ∈ from_states is a choice among emitted terminals, not a transition", () => {
    const id = identity();
    const fixture = contestedFixture(id);
    const manager = peerIdentity(id);
    const resolve = peerEnvelope(manager, 0, {
      ...edge(
        "O1",
        "L1",
        "voided",
        ["served", "voided"],
        [fixture.served.id as string, fixture.voided.id as string],
      ),
      ...at(300),
    });
    const store = mergeStore(id);
    ingestAll(store, [...fixture.events, resolve]);
    expect(cell(store, "L1").states).toEqual(["voided"]);
    store.close();
  });

  it("01-F19/01-F38: two DIFFERING resolutions re-contest — the algebra reports that two humans disagreed rather than diverging", () => {
    const id = identity();
    const fixture = contestedFixture(id);
    const managerA = peerIdentity(id);
    const managerB = peerIdentity(id);
    const heads = [fixture.served.id as string, fixture.voided.id as string];
    const resolveVoid = peerEnvelope(managerA, 0, {
      ...edge("O1", "L1", "voided", ["served", "voided"], heads),
      ...at(300),
    });
    const resolveServe = peerEnvelope(managerB, 0, {
      ...edge("O1", "L1", "served", ["served", "voided"], heads),
      ...at(300),
    });
    const one = mergeStore(id);
    ingestAll(one, [...fixture.events, resolveVoid, resolveServe]);
    const two = mergeStore(id);
    ingestAll(two, [...[...fixture.events].reverse(), resolveServe, resolveVoid]);
    expect(cell(one, "L1").states).toEqual(["served", "voided"]);
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F35: one terminal head absorbs a concurrent NON-terminal head — projected state is the terminal, the non-terminal head's edge gains terminal_regression", () => {
    const id = identity();
    const counter = peerIdentity(id);
    const rider = peerIdentity(id);
    const createEnv = peerEnvelope(counter, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(counter, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const head = peerEnvelope(counter, 2, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(100),
    });
    const servedEdge = peerEnvelope(counter, 3, {
      ...edge("O1", "L1", "served", ["ready"], [head.id as string]),
      ...at(200),
    });
    const pickedEdge = peerEnvelope(rider, 0, {
      ...edge("O1", "L1", "picked_up", ["ready"], [head.id as string]),
      ...at(200),
    });
    const store = mergeStore(id);
    ingestAll(store, [createEnv, add, head, servedEdge, pickedEdge]);
    const c = cell(store, "L1");
    expect(c.states).toEqual(["served"]);
    expect(c.anomalies).toEqual({ [pickedEdge.id as string]: "terminal_regression" });
    store.close();
  });

  it("01-F35: a CHAINED non-terminal edge into a terminal carries no anomaly — ready→picked_up→delivered is the normal delivery walk (09-F8 pattern)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const ready = peerEnvelope(peer, 2, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(100),
    });
    const picked = peerEnvelope(peer, 3, {
      ...edge("O1", "L1", "picked_up", ["ready"], [ready.id as string]),
      ...at(200),
    });
    const delivered = peerEnvelope(peer, 4, {
      ...edge("O1", "L1", "delivered", ["picked_up"], [picked.id as string]),
      ...at(300),
    });
    const store = mergeStore(id);
    ingestAll(store, shuffled([createEnv, add, ready, picked, delivered], 3));
    const c = cell(store, "L1");
    expect(c.states).toEqual(["delivered"]);
    expect(c.anomalies).toEqual({}); // retired by preds, not a competing head
    store.close();
  });
});

describe("terminal heads survive non-adoption retirement (fix-round F7; 01-F35 conservative ruling)", () => {
  // F7 ruling: only an ADOPTION edge (|from_states| > 1 ∧ to ∈ from_states) may
  // retire a terminal head. A legal-but-inconsistent ordinary edge whose `preds`
  // name a terminal edge LANDS (participates in the ≼-max), fires
  // inconsistent_predecessor, and the terminal head SURVIVES — one inconsistent
  // emitter must never un-serve a line fleet-wide.
  const servedFixture = (id: ReturnType<typeof identity>) => {
    const counter = peerIdentity(id);
    const createEnv = peerEnvelope(counter, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(counter, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const head = peerEnvelope(counter, 2, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(100),
    });
    const servedEdge = peerEnvelope(counter, 3, {
      ...edge("O1", "L1", "served", ["ready"], [head.id as string]),
      ...at(200),
    });
    return { counter, events: [createEnv, add, head, servedEdge], servedEdge };
  };

  it("01-F35 (fix-round F7): a LEGAL non-adoption edge whose preds name the served head cannot retire it — served survives, the edge lands with inconsistent_predecessor, in every delivery order", () => {
    const id = identity();
    const fixture = servedFixture(id);
    const rider = peerIdentity(id);
    // A legal ready→picked_up edge that (inconsistently) claims the SERVED edge
    // as its predecessor.
    const inconsistent = peerEnvelope(rider, 0, {
      ...edge("O1", "L1", "picked_up", ["ready"], [fixture.servedEdge.id as string]),
      ...at(300),
    });
    const events = [...fixture.events, inconsistent];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    for (const store of [one, two]) {
      const c = cell(store, "L1");
      expect(c.states).toEqual(["served"]); // the terminal head SURVIVES (01-F35)
      expect(c.anomalies).toEqual({ [inconsistent.id as string]: "inconsistent_predecessor" });
    }
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F35/01-F19 (fix-round F7): a TERMINAL non-adoption edge naming the served head re-contests instead of replacing — the rendered set, plus inconsistent_predecessor on the incoming edge", () => {
    const id = identity();
    const fixture = servedFixture(id);
    const kitchen = peerIdentity(id);
    const voidEdge = peerEnvelope(kitchen, 0, {
      ...edge("O1", "L1", "voided", ["ready"], [fixture.servedEdge.id as string]),
      ...at(300),
    });
    const store = mergeStore(id);
    ingestAll(store, [...fixture.events, voidEdge]);
    const c = cell(store, "L1");
    expect(c.states).toEqual(["served", "voided"]); // the contest set — nothing is un-served
    expect(c.anomalies).toEqual({ [voidEdge.id as string]: "inconsistent_predecessor" });
    store.close();
  });

  it("01-F19 (fix-round F7 boundary): an ADOPTION edge naming all heads still collapses — only the adoption clause may retire a terminal head", () => {
    const id = identity();
    const fixture = servedFixture(id);
    const rider = peerIdentity(id);
    const manager = peerIdentity(id);
    const inconsistent = peerEnvelope(rider, 0, {
      ...edge("O1", "L1", "picked_up", ["ready"], [fixture.servedEdge.id as string]),
      ...at(300),
    });
    const adoption = peerEnvelope(manager, 0, {
      ...edge(
        "O1",
        "L1",
        "served",
        ["served", "picked_up"],
        [fixture.servedEdge.id as string, inconsistent.id as string],
      ),
      ...at(400),
    });
    const store = mergeStore(id);
    ingestAll(store, [...fixture.events, inconsistent, adoption]);
    const c = cell(store, "L1");
    expect(c.states).toEqual(["served"]);
    // The inconsistent edge's anomaly is a payload fact — never recomputed away.
    expect(c.anomalies).toEqual({ [inconsistent.id as string]: "inconsistent_predecessor" });
    store.close();
  });
});

describe("anomalies are payload facts — never recomputed away (01-F35/01-F1)", () => {
  it("01-F35: illegal_transition is a pure function of the edge's own payload — it survives every delivery order AND full global_seq adoption", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const bad = peerEnvelope(peer, 2, { ...edge("O1", "L1", "ready", ["placed"]), ...at(100) });
    const events = [createEnv, add, bad];
    const one = mergeStore(id);
    ingestAll(one, events);
    const two = mergeStore(id);
    ingestAll(two, [...events].reverse());
    for (const store of [one, two]) {
      const c = cell(store, "L1");
      expect(c.states).toEqual(["placed"]);
      expect(c.anomalies).toEqual({ [bad.id as string]: "illegal_transition" });
    }
    // Under the comparator engine a reorder ERASED the badge (matrix row 65) —
    // adopting cloud order must not recompute it away.
    events.forEach((env, i) => {
      one.assignGlobalSeq(env.id as string, i + 1);
    });
    expect(cell(one, "L1").anomalies).toEqual({ [bad.id as string]: "illegal_transition" });
    expect(projectionBytes(two)).toBe(projectionBytes(one));
    one.close();
    two.close();
  });

  it("01-F35 (fix-round §4 ratification): inconsistent_predecessor fires only when BOTH edges are present, once per naming edge — an absent pred is normal operation, never a verdict", () => {
    // Ratifies the implementer's proposed trigger (t-01-15-fix-round.md §4):
    // both-edges-present, first witnessed mismatch, one code per edge, never on
    // an illegal edge (illegal outranks — pinned by the row-66 test below).
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const eA = peerEnvelope(peer, 2, {
      ...edge("O1", "L1", "confirmed", ["placed"], []),
      ...at(100),
    });
    // eB names eA as pred but claims a from_states that does not contain eA's `to`.
    const eB = peerEnvelope(peer, 3, {
      ...edge("O1", "L1", "ready", ["in_prep"], [eA.id as string]),
      ...at(200),
    });
    // eC names a pred that was NEVER delivered — no verdict without the witness.
    const eC = peerEnvelope(peer, 4, {
      ...edge("O1", "L1", "in_prep", ["confirmed"], ["e-never-delivered"]),
      ...at(300),
    });
    const store = mergeStore(id);
    ingestAll(store, [createEnv, add, eA, eB, eC]);
    const c = cell(store, "L1");
    expect(c.states).toEqual(["ready"]); // every legal edge still participates in the ≼-max
    expect(c.anomalies).toEqual({ [eB.id as string]: "inconsistent_predecessor" });
    store.close();
  });

  it("01-F35 (matrix row 66): post-serve void is NOT EXPRESSIBLE — an edge from a terminal is payload-illegal (terminals map to []), and illegal outranks terminal_regression", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const add = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const ready = peerEnvelope(peer, 2, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(100),
    });
    const servedEdge = peerEnvelope(peer, 3, {
      ...edge("O1", "L1", "served", ["ready"], [ready.id as string]),
      ...at(200),
    });
    const postServeVoid = peerEnvelope(peer, 4, {
      ...edge("O1", "L1", "voided", ["served"], [servedEdge.id as string]),
      ...at(300),
    });
    const store = mergeStore(id);
    ingestAll(store, [createEnv, add, ready, servedEdge, postServeVoid]);
    const c = cell(store, "L1");
    expect(c.states).toEqual(["served"]);
    expect(c.anomalies).toEqual({ [postServeVoid.id as string]: "illegal_transition" });
    store.close();
  });
});

describe("matrix-C CE — zombie tickets (03-F17/03-F14/03-F23): cooking-done clears the pass", () => {
  const twoLineOrder = (id: ReturnType<typeof identity>) => {
    const peer = peerIdentity(id);
    const createEnv = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
    const addL1 = peerEnvelope(peer, 1, { ...lineAdded("O1", "L1"), ...at(50) });
    const addL2 = peerEnvelope(peer, 2, { ...lineAdded("O1", "L2"), ...at(60) });
    const confirm = peerEnvelope(peer, 3, { ...confirmed("O1"), ...at(70) });
    const l1Ready = peerEnvelope(peer, 4, {
      ...edge("O1", "L1", "ready", ["in_prep"], []),
      ...at(100),
    });
    const l2Head = peerEnvelope(peer, 5, {
      ...edge("O1", "L2", "ready", ["in_prep"], []),
      ...at(100),
    });
    return { peer, base: [createEnv, addL1, addL2, confirm, l1Ready, l2Head], l2Head };
  };

  it("03-F17: a CONTESTED line counts as cooking-done — lines_ready reaches lines_total and the ticket can clear (a contested line looks exactly like a completed one to the kitchen)", () => {
    // Under "contested = neither ready nor exited" the card never leaves the pass,
    // its 03-F25 clock keeps running, and by late service genuinely-late orders are
    // visually identical to permanent zombies. Required: any terminal head ⇒ done.
    const id = identity();
    const fixture = twoLineOrder(id);
    const other = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      ...fixture.base,
      peerEnvelope(fixture.peer, 6, {
        ...edge("O1", "L1", "served", ["ready"], []),
        ...at(200),
      }),
      // L2 contested: served (counter) vs voided (other terminal head).
      peerEnvelope(fixture.peer, 7, {
        ...edge("O1", "L2", "served", ["ready"], [fixture.l2Head.id as string]),
        ...at(300),
      }),
      peerEnvelope(other, 0, {
        ...edge("O1", "L2", "voided", ["ready"], [fixture.l2Head.id as string]),
        ...at(300),
      }),
    ]);
    const row = onlyQueueRow(store);
    expect(row.lines_total).toBe(2);
    expect(row.lines_ready).toBe(2); // contested included — the food question is answered
    store.close();
  });

  it("03-F17 (Addendum-C): cooking-done includes picked_up — a delivery line at the non-terminal picked_up watermark does not strand the ticket until `delivered`", () => {
    const id = identity();
    const fixture = twoLineOrder(id);
    const store = mergeStore(id);
    ingestAll(store, [
      ...fixture.base,
      peerEnvelope(fixture.peer, 6, { ...edge("O1", "L1", "served", ["ready"], []), ...at(200) }),
      peerEnvelope(fixture.peer, 7, {
        ...edge("O1", "L2", "picked_up", ["ready"], [fixture.l2Head.id as string]),
        ...at(300),
      }),
    ]);
    const row = onlyQueueRow(store);
    expect(row.lines_total).toBe(2);
    expect(row.lines_ready).toBe(2);
    store.close();
  });

  it("03-F24: a DECIDEDLY-voided line leaves lines_total — the surviving ready line clears the ticket alone", () => {
    const id = identity();
    const fixture = twoLineOrder(id);
    const store = mergeStore(id);
    ingestAll(store, [
      ...fixture.base,
      peerEnvelope(fixture.peer, 6, {
        ...edge("O1", "L2", "voided", ["ready"], [fixture.l2Head.id as string]),
        ...at(200),
      }),
    ]);
    const row = onlyQueueRow(store);
    expect(row.lines_total).toBe(1);
    expect(row.lines_ready).toBe(1); // L1 sits at ready — watermark ≥ ready is cooking-done
    store.close();
  });
});
