// Acceptance tests — T-01-04 adversarial-review round, authored from the AMENDED
// kernel-tasks binding contract (duplicate-id ingest carrying global_seq; in-event
// line_ids dedupe; UTF-16 code-unit canonical JSON) + packages/sync-client/FOLDS.md
// + specs/01-kernel-sync.md §3/§4 only (24 §3 step 2: read-only to the implementing
// session). Groups "amended contract" pin newly amended lines (red until the impl
// fix lands); the rest pin existing-but-untested behavior.

import { newId } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { type DeviceStore, openStore } from "../index.js";
import {
  appendInput,
  canonicalJson,
  type Identity,
  identity,
  lineStateChanged,
  orderConfirmed,
  orderCreated,
  orderLineAdded,
  orderTableAssigned,
  peerEnvelope,
  peerIdentity,
} from "./builders.js";

// T-01-04 store surface per the binding contract — mirrored from
// folds-directed.test.ts so each oracle file compiles standalone against the
// contract; a missing method fails the red run at runtime.
type OpenOrderRow = {
  order_id: string;
  channel: string;
  order_type: string | null;
  table_id: string | null;
  confirmed_at: number | null;
  settled: number;
  json_lines: string;
};

type KitchenQueueRow = {
  order_id: string;
  confirm_at: number;
  channel: string;
  age_basis: number;
  lines_ready: number;
  lines_total: number;
};

type ParkedRow = { event_id: string; waiting_for: string; envelope_json: string };

type FoldStore = DeviceStore & {
  ingest(envelope: unknown, opts?: { global_seq?: number }): { stored: boolean };
  assignGlobalSeq(event_id: string, global_seq: number): void;
  openOrders(): OpenOrderRow[];
  kitchenQueue(): KitchenQueueRow[];
  parked(): ParkedRow[];
  refold(): void;
};

const foldStore = (id: Identity) => openStore({ path: ":memory:", identity: id }) as FoldStore;

const T0 = 1752800000000;
/** Envelope-level timestamp override — canonical order is (global_seq, ts, device, lamport). */
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

const tables = (store: FoldStore) => ({
  orders: store.openOrders(),
  queue: store.kitchenQueue(),
  parked: store.parked(),
});

const onlyOrder = (store: FoldStore): OpenOrderRow => {
  const rows = store.openOrders();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one open_orders row");
  return row;
};

const onlyQueueRow = (store: FoldStore): KitchenQueueRow => {
  const rows = store.kitchenQueue();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one kitchen_queue row");
  return row;
};

type LineCell = {
  item_id: string;
  qty: number;
  unit_price_paisa: number;
  state: string;
  anomalies: Record<string, string>;
};

const lines = (row: OpenOrderRow) => JSON.parse(row.json_lines) as Record<string, LineCell>;

const line = (over: Partial<LineCell> = {}): LineCell => ({
  anomalies: {},
  item_id: "item-karahi",
  qty: 1,
  state: "placed",
  unit_price_paisa: 50000,
  ...over,
});

describe("duplicate-id ingest carrying global_seq (01-F34 — amended contract)", () => {
  it("01-F34: re-ingest with global_seqs that reverse the provisional order flips table_id to the cloud winner — tables ≡ refold()", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const assignA = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A"),
      ...at(2000),
    });
    const assignB = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B"),
      ...at(1000),
    });
    store.ingest(assignA);
    store.ingest(assignB);
    expect(onlyOrder(store).table_id).toBe("T-A"); // provisional key: later device_created_at
    // LAN-first-then-cloud-catchup: the same envelopes re-arrive from the cloud
    // carrying global_seq — cloud order reverses the provisional winner. (The
    // return value on this path is contract-unpinned; only the adoption is law.)
    store.ingest(assignA, { global_seq: 5 });
    store.ingest(assignB, { global_seq: 10 });
    expect(onlyOrder(store).table_id).toBe("T-B"); // highest global_seq wins (01-F34)
    const converged = tables(store);
    store.refold();
    expect(tables(store)).toEqual(converged);
    store.close();
  });

  it("01-F34: same-value re-ingest with global_seq is an idempotent adoption — the carried seq is really held afterwards", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const assign = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A"),
      ...at(1000),
    });
    store.ingest(assign);
    store.ingest(assign, { global_seq: 7 }); // adoption, exactly as assignGlobalSeq(id, 7) would
    const before = tables(store);
    store.ingest(assign, { global_seq: 7 }); // same value again — idempotent no-op
    expect(tables(store)).toEqual(before);
    // Divergence probe: had the carried seq been silently dropped, this would assign
    // fresh and succeed — the amended contract requires 7 to be genuinely held.
    expect(() => store.assignGlobalSeq(assign.id, 8)).toThrow();
    store.assignGlobalSeq(assign.id, 7); // and identical to what assignGlobalSeq records — no-op
    expect(tables(store)).toEqual(before);
    store.close();
  });

  it("01-F34/18 §4: duplicate-id ingest with a divergent or already-held global_seq throws, state unchanged", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const peer = peerIdentity(id);
    const assignA = peerEnvelope(peer, 0, { ...orderTableAssigned("O1", "T-A"), ...at(1000) });
    const assignB = peerEnvelope(peer, 1, { ...orderTableAssigned("O1", "T-B"), ...at(2000) });
    store.ingest(assignA);
    store.ingest(assignB);
    store.assignGlobalSeq(assignA.id, 7);
    const before = tables(store);
    expect(() => store.ingest(assignA, { global_seq: 8 })).toThrow(); // divergent from the held seq
    expect(() => store.ingest(assignB, { global_seq: 7 })).toThrow(); // seq already held by another event
    expect(tables(store)).toEqual(before);
    store.close();
  });
});

describe("in-event line_ids dedupe (01-F35 — amended contract)", () => {
  it("01-F35: duplicate line_ids within one line_state_changed are deduped — the event applies cleanly with no anomaly", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1", "L1"], "confirmed"), ...at(200) }),
    );
    const cell = lines(onlyOrder(store)).L1;
    expect(cell?.state).toBe("confirmed");
    // An applied event must never self-flag an anomaly (amended contract line).
    expect(cell?.anomalies).toEqual({});
    store.close();
  });
});

describe("ingest-time global_seq (01-F34/01-F3)", () => {
  it("01-F34: a global_seq carried at first ingest participates in canonical fold order", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const assignA = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A"),
      ...at(2000),
    });
    const assignB = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B"),
      ...at(1000),
    });
    expect(store.ingest(assignA, { global_seq: 5 })).toEqual({ stored: true });
    expect(store.ingest(assignB, { global_seq: 10 })).toEqual({ stored: true });
    // Without the seqs the later device_created_at (T-A) would win; cloud order says B is last.
    expect(onlyOrder(store).table_id).toBe("T-B");
    store.close();
  });

  it("01-F34/18 §4: a negative, fractional, or non-integer global_seq at ingest throws with nothing persisted", () => {
    const id = identity();
    const store = foldStore(id);
    const env = peerEnvelope(peerIdentity(id), 0, { ...orderCreated("O1"), ...at(0) });
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => store.ingest(env, { global_seq: bad })).toThrow();
      expect(tables(store)).toEqual({ orders: [], queue: [], parked: [] });
    }
    // No failed call persisted anything — a clean ingest still stores the envelope.
    expect(store.ingest(env)).toEqual({ stored: true });
    expect(onlyOrder(store).order_id).toBe("O1");
    store.close();
  });

  it("01-F34/01-F3/18 §4: a global_seq already held by another event throws and rolls back the whole ingest", () => {
    const id = identity();
    const store = foldStore(id);
    const peer = peerIdentity(id);
    const first = peerEnvelope(peer, 0, { ...orderCreated("O1"), ...at(0) });
    const second = peerEnvelope(peer, 1, { ...orderCreated("O2"), ...at(100) });
    expect(store.ingest(first, { global_seq: 7 })).toEqual({ stored: true });
    const before = tables(store);
    expect(() => store.ingest(second, { global_seq: 7 })).toThrow();
    expect(tables(store)).toEqual(before);
    expect(store.openOrders().map((r) => r.order_id)).toEqual(["O1"]);
    // The whole ingest rolled back — { stored: true } here proves no partial write.
    expect(store.ingest(second)).toEqual({ stored: true });
    expect(store.openOrders().map((r) => r.order_id)).toEqual(["O1", "O2"]);
    store.close();
  });

  it("01-F34/01-F3: ingest-with-global_seq ≡ ingest-then-assignGlobalSeq — byte-identical tables", () => {
    const id = identity();
    const created = appendInput(id, { ...orderCreated("O1"), ...at(0) });
    const assignA = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A"),
      ...at(1000),
    });
    const assignB = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B"),
      ...at(2000),
    });
    const one = foldStore(id);
    one.append(created);
    one.ingest(assignA, { global_seq: 10 });
    one.ingest(assignB, { global_seq: 5 });
    const two = foldStore(id);
    two.append(created);
    two.ingest(assignA);
    two.ingest(assignB);
    two.assignGlobalSeq(assignA.id, 10);
    two.assignGlobalSeq(assignB.id, 5);
    // The seqs took effect on both paths: highest global_seq wins over later timestamp.
    expect(onlyOrder(one).table_id).toBe("T-A");
    expect(tables(two)).toEqual(tables(one));
    one.close();
    two.close();
  });
});

describe("canonical-order tiebreaks (01-N1)", () => {
  it("01-N1: identical device_created_at across devices — ascending device_id breaks the tie on every arrival order", () => {
    const id = identity();
    const a = newId();
    const b = newId();
    const [lowDev, highDev] = (a < b ? [a, b] : [b, a]) as [string, string];
    const created = appendInput(id, { ...orderCreated("O1"), ...at(0) });
    const assignLow = peerEnvelope({ ...id, device_id: lowDev }, 0, {
      ...orderTableAssigned("O1", "T-low"),
      ...at(500),
    });
    const assignHigh = peerEnvelope({ ...id, device_id: highDev }, 0, {
      ...orderTableAssigned("O1", "T-high"),
      ...at(500),
    });
    const one = foldStore(id);
    one.append(created);
    one.ingest(assignHigh); // canonically-last arrives first — arrival order must not decide
    one.ingest(assignLow);
    const two = foldStore(id);
    two.append(created);
    two.ingest(assignLow);
    two.ingest(assignHigh);
    expect(onlyOrder(one).table_id).toBe("T-high"); // higher device_id sorts last → wins table_assigned
    expect(tables(two)).toEqual(tables(one));
    one.close();
    two.close();
  });

  it("01-N1: identical device_created_at on one device — ascending lamport_seq breaks the tie regardless of arrival order", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const created = appendInput(id, { ...orderCreated("O1"), ...at(0) });
    const firstAssign = peerEnvelope(peer, 0, {
      ...orderTableAssigned("O1", "T-first"),
      ...at(500),
    });
    const secondAssign = peerEnvelope(peer, 1, {
      ...orderTableAssigned("O1", "T-second"),
      ...at(500),
    });
    const one = foldStore(id);
    one.append(created);
    one.ingest(secondAssign); // higher lamport arrives first — arrival order must not decide
    one.ingest(firstAssign);
    const two = foldStore(id);
    two.append(created);
    two.ingest(firstAssign);
    two.ingest(secondAssign);
    expect(onlyOrder(one).table_id).toBe("T-second"); // higher lamport_seq sorts last → wins
    expect(tables(two)).toEqual(tables(one));
    one.close();
    two.close();
  });
});

describe("kitchen_queue lines_ready — delivery flow (01-F6)", () => {
  it("01-F6: lines_ready counts picked_up and delivered lines", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L2"), ...at(200) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(300) }));
    const walk = (line_id: string, states: string[], from: number) => {
      states.forEach((state, i) => {
        store.append(
          appendInput(id, { ...lineStateChanged("O1", [line_id], state), ...at(from + i * 10) }),
        );
      });
    };
    walk("L1", ["confirmed", "in_prep", "ready", "picked_up"], 400);
    let row = onlyQueueRow(store);
    expect(row.lines_ready).toBe(1); // picked_up counts as ready
    expect(row.lines_total).toBe(2);
    walk("L2", ["confirmed", "in_prep", "ready", "picked_up", "delivered"], 500);
    row = onlyQueueRow(store);
    expect(row.lines_ready).toBe(2); // delivered counts as ready
    expect(row.lines_total).toBe(2);
    store.close();
  });
});

describe("canonical JSON — UTF-16 code-unit key order (01-F10/01-F6, 20 §4.2)", () => {
  // U+1F600 ("😀") encodes as the surrogate pair D83D DE00: by UTF-16 code unit it
  // sorts BEFORE U+FF5E ("～"), while code-point order would reverse them — the
  // amended contract pins code-unit order so a future non-JS refold-and-diff
  // implementation cannot byte-mismatch (20 §4.2).
  it("01-F10: parked envelope_json is byte-identical canonical JSON of the envelope — keys sorted by UTF-16 code unit at every depth", () => {
    const id = identity();
    const store = foldStore(id);
    const orphan = peerEnvelope(peerIdentity(id), 0, {
      type: "order.confirmed",
      // Extras pass through (00 §6 loose objects) — nested keys exercise every depth.
      payload: { order_id: "O-unseen", meta: { "～": "fullwidth", "😀": "astral" } },
      ...at(0),
    });
    expect(store.ingest(orphan)).toEqual({ stored: true });
    const row = store.parked()[0];
    expect(row?.waiting_for).toBe("O-unseen");
    const json = row?.envelope_json ?? "";
    expect(json).toBe(canonicalJson(orphan));
    expect(json.indexOf('"😀"')).toBeGreaterThan(-1);
    expect(json.indexOf('"😀"')).toBeLessThan(json.indexOf('"～"'));
    store.close();
  });

  it("01-F6: json_lines keys sort by UTF-16 code unit — an astral-plane line_id precedes U+FF5E", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "～"), ...at(100) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "😀", { qty: 2 }), ...at(200) }));
    const json = onlyOrder(store).json_lines;
    expect(json).toBe(canonicalJson({ "😀": line({ qty: 2 }), "～": line() }));
    expect(json.indexOf('"😀"')).toBeLessThan(json.indexOf('"～"'));
    store.close();
  });
});
