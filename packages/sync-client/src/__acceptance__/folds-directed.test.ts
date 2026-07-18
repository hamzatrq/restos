// Acceptance tests — T-01-04 folds v1 directed laws, authored from the kernel-tasks
// binding contract + packages/sync-client/FOLDS.md + specs/01-kernel-sync.md §3/§4
// only (24 §3 step 2: read-only to the implementing session).
// Ingest seam (01-F4/01-F8/18 §4), open_orders + kitchen_queue folds (01-F6),
// parking (01-F10), terminal anomalies (01-F35 regression guard), global_seq
// convergence (01-F34), fold durability (extends the T-01-03 kill-seed, 20 §2.6).

import { newId } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { type DeviceStore, openStore } from "../index.js";
import {
  appendInput,
  canonicalJson,
  type Identity,
  identity,
  kotPrinted,
  lineStateChanged,
  orderConfirmed,
  orderCreated,
  orderLineAdded,
  orderTableAssigned,
  paymentRecorded,
  paymentRefunded,
  peerEnvelope,
  peerIdentity,
  tempDbPath,
} from "./builders.js";

// T-01-04 store surface per the binding contract — typed here so the oracle
// compiles against the contract; a missing method fails the red run at runtime.
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

const foldStore = (id: Identity, path = ":memory:") =>
  openStore({ path, identity: id }) as FoldStore;

const T0 = 1752800000000;
/** Envelope-level timestamp override — canonical order is (global_seq, ts, device, lamport). */
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

const tables = (store: FoldStore) => ({
  orders: store.openOrders(),
  queue: store.kitchenQueue(),
  parked: store.parked(),
});

const parkedPairs = (store: FoldStore) =>
  store.parked().map((r): [string, string] => [r.event_id, r.waiting_for]);

/** parked() is sorted by event_id asc — ids are random, so sort expectations too. */
const sortedPairs = (pairs: [string, string][]) =>
  [...pairs].sort((a, b) => (a[0] < b[0] ? -1 : 1));

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

describe("store.ingest — branch-stream entry point (01-F4/01-F8/18 §4)", () => {
  it("01-F4: ingest of an unknown event type throws and persists nothing", () => {
    const id = identity();
    const store = foldStore(id);
    const peer = peerIdentity(id);
    expect(() => store.ingest(peerEnvelope(peer, 0, { type: "order.teleported" }))).toThrow();
    expect(tables(store)).toEqual({ orders: [], queue: [], parked: [] });
    store.close();
  });

  it("01-F4: ingest of a known type with an invalid payload throws and persists nothing", () => {
    const id = identity();
    const store = foldStore(id);
    const peer = peerIdentity(id);
    expect(() =>
      store.ingest(peerEnvelope(peer, 0, { payload: { channel: "dine_in" } })),
    ).toThrow();
    expect(tables(store)).toEqual({ orders: [], queue: [], parked: [] });
    store.close();
  });

  it("01-F9/18 §4: ingest rejects an envelope from another org or branch — the stream is identity-scoped", () => {
    const id = identity();
    const store = foldStore(id);
    expect(() => store.ingest(peerEnvelope(identity(), 0))).toThrow();
    const wrongBranch = { ...peerIdentity(id), branch_id: newId() };
    expect(() => store.ingest(peerEnvelope(wrongBranch, 0))).toThrow();
    expect(tables(store)).toEqual({ orders: [], queue: [], parked: [] });
    store.close();
  });

  it("01-F8/18 §4: an own-device envelope not already stored throws — own events enter only via append", () => {
    const id = identity();
    const store = foldStore(id);
    expect(() => store.ingest(peerEnvelope(id, 0))).toThrow();
    expect(store.readOwnEvents()).toEqual([]);
    expect(tables(store)).toEqual({ orders: [], queue: [], parked: [] });
    store.close();
  });

  it("01-F8: first delivery stores ({ stored: true }); re-ingest of the same peer id is { stored: false } with zero state change", () => {
    const id = identity();
    const store = foldStore(id);
    const env = peerEnvelope(peerIdentity(id), 0, orderCreated("O1"));
    expect(store.ingest(env)).toEqual({ stored: true });
    const before = tables(store);
    expect(store.ingest(env)).toEqual({ stored: false });
    expect(tables(store)).toEqual(before);
    store.close();
  });

  it("01-F8: ingest of an own envelope already appended returns { stored: false } and changes nothing", () => {
    const id = identity();
    const store = foldStore(id);
    const confirmed = store.append(appendInput(id, orderCreated("O1")));
    const before = tables(store);
    expect(store.ingest(confirmed)).toEqual({ stored: false });
    expect(tables(store)).toEqual(before);
    expect(store.readOwnEvents()).toEqual([confirmed]);
    store.close();
  });

  it("01-F3/18 §4: a (device_id, lamport_seq) collision under a different event id throws — per-device lamport is gap-free monotonic", () => {
    const id = identity();
    const store = foldStore(id);
    const peer = peerIdentity(id);
    store.ingest(peerEnvelope(peer, 0, orderCreated("O1")));
    const before = tables(store);
    expect(() => store.ingest(peerEnvelope(peer, 0, orderCreated("O2")))).toThrow();
    expect(tables(store)).toEqual(before);
    store.close();
  });
});

describe("open_orders fold (01-F6)", () => {
  it("01-F6: order.created materializes a row with FOLDS.md defaults and empty canonical json_lines", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    expect(store.openOrders()).toEqual([
      {
        order_id: "O1",
        channel: "dine_in",
        order_type: null,
        table_id: null,
        confirmed_at: null,
        settled: 0,
        json_lines: "{}",
      },
    ]);
    store.close();
  });

  it("01-F6: optional order_type/table_id on order.created land in the row (additive under schema_version 1, 00 §6)", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(
      appendInput(id, {
        ...orderCreated("O1", { order_type: "takeaway", table_id: "T5" }),
        ...at(0),
      }),
    );
    const row = onlyOrder(store);
    expect(row.order_type).toBe("takeaway");
    expect(row.table_id).toBe("T5");
    store.close();
  });

  it("01-F6: a second order.created for the same order_id is a no-op — canonically-first wins", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(
      appendInput(id, {
        ...orderCreated("O1", { channel: "takeaway", order_type: "delivery" }),
        ...at(5000),
      }),
    );
    const row = onlyOrder(store);
    expect(row.channel).toBe("dine_in");
    expect(row.order_type).toBeNull();
    store.close();
  });

  it("01-F6: confirmed_at is the device_created_at of the canonically-first confirm; later confirms are no-ops", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(1000) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(2000) }));
    expect(onlyOrder(store).confirmed_at).toBe(T0 + 1000);
    store.close();
  });

  it("01-F16: line adds from two devices both stand — json_lines is canonical JSON, byte-for-byte", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.ingest(peerEnvelope(peerIdentity(id), 0, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.ingest(
      peerEnvelope(peerIdentity(id), 0, {
        ...orderLineAdded("O1", "L2", { qty: 2, unit_price_paisa: 25000 }),
        ...at(200),
      }),
    );
    expect(onlyOrder(store).json_lines).toBe(
      canonicalJson({ L1: line(), L2: line({ qty: 2, unit_price_paisa: 25000 }) }),
    );
    store.close();
  });

  it("01-F6: a duplicate line_id keeps the canonically-first line", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1", { qty: 5 }), ...at(200) }));
    expect(lines(onlyOrder(store)).L1?.qty).toBe(1);
    store.close();
  });

  it("01-F35: line_state_changed routes every line in line_ids through applyLineState — legal transitions apply", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L2"), ...at(200) }));
    store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1", "L2"], "confirmed"), ...at(300) }),
    );
    const cells = lines(onlyOrder(store));
    expect(cells.L1?.state).toBe("confirmed");
    expect(cells.L2?.state).toBe("confirmed");
    store.close();
  });

  it("01-F35: an illegal transition never applies — state kept, illegal_transition anomaly recorded on the line", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    const jump = store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1"], "ready"), ...at(200) }),
    );
    const cell = lines(onlyOrder(store)).L1;
    expect(cell?.state).toBe("placed");
    expect(cell?.anomalies).toEqual({ [jump.id]: "illegal_transition" });
    store.close();
  });

  it("01-F34: table_id resolves to the canonically-last assignment on every delivery order", () => {
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
    one.ingest(assignA);
    one.ingest(assignB);
    const two = foldStore(id);
    two.append(created);
    two.ingest(assignB);
    two.ingest(assignA);
    expect(onlyOrder(one).table_id).toBe("T-B");
    expect(tables(two)).toEqual(tables(one));
    one.close();
    two.close();
  });

  it("01-F30: a partial payment leaves the order unsettled; exact cover settles it", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(
      appendInput(id, {
        ...orderLineAdded("O1", "L1", { qty: 2, unit_price_paisa: 500 }),
        ...at(100),
      }),
    );
    store.append(appendInput(id, { ...paymentRecorded("O1", 400), ...at(200) }));
    expect(onlyOrder(store).settled).toBe(0);
    store.append(appendInput(id, { ...paymentRecorded("O1", 600), ...at(300) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  it("01-F29/01-F30: a refund unsettles the order until re-covered — settled is recomputed from the set", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(
      appendInput(id, {
        ...orderLineAdded("O1", "L1", { qty: 2, unit_price_paisa: 500 }),
        ...at(100),
      }),
    );
    const payment = store.append(appendInput(id, { ...paymentRecorded("O1", 1000), ...at(200) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.append(appendInput(id, { ...paymentRefunded(payment.id, 300), ...at(300) }));
    expect(onlyOrder(store).settled).toBe(0);
    store.append(appendInput(id, { ...paymentRecorded("O1", 300), ...at(400) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  it("01-F30: voided lines leave billed_effective — exact cover over surviving lines settles", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(
      appendInput(id, {
        ...orderLineAdded("O1", "L1", { qty: 2, unit_price_paisa: 500 }),
        ...at(100),
      }),
    );
    store.append(
      appendInput(id, {
        ...orderLineAdded("O1", "L2", { qty: 1, unit_price_paisa: 500 }),
        ...at(200),
      }),
    );
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L2"], "voided"), ...at(300) }));
    store.append(appendInput(id, { ...paymentRecorded("O1", 1000), ...at(400) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  it("01-F30: billed_effective must be positive — a lineless order never settles", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...paymentRecorded("O1", 0), ...at(100) }));
    expect(onlyOrder(store).settled).toBe(0);
    store.close();
  });
});

describe("kitchen_queue fold (01-F6)", () => {
  it("01-F6: no queue row exists before a canonically-applied order.confirmed", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    expect(store.kitchenQueue()).toEqual([]);
    store.close();
  });

  it("01-F6: confirm creates the row — confirm_at from the first confirm, channel from order.created, age_basis defaults to confirm_at", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(500) }));
    expect(store.kitchenQueue()).toEqual([
      {
        order_id: "O1",
        confirm_at: T0 + 500,
        channel: "dine_in",
        age_basis: T0 + 500,
        lines_ready: 0,
        lines_total: 1,
      },
    ]);
    store.close();
  });

  it("01-F6: age_basis moves to the canonically-first kot.printed when one exists", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(500) }));
    store.append(appendInput(id, { ...kotPrinted("O1"), ...at(800) }));
    store.append(appendInput(id, { ...kotPrinted("O1"), ...at(900) }));
    const row = onlyQueueRow(store);
    expect(row.age_basis).toBe(T0 + 800);
    expect(row.confirm_at).toBe(T0 + 500);
    store.close();
  });

  it("03-F19/03-F24: lines_ready counts ready/served/picked_up/delivered; voided and cancelled lines leave lines_total", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L2"), ...at(200) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L3"), ...at(300) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(400) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L1"], "confirmed"), ...at(500) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L1"], "in_prep"), ...at(600) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L1"], "ready"), ...at(700) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L3"], "cancelled"), ...at(800) }));
    let row = onlyQueueRow(store);
    expect(row.lines_total).toBe(2);
    expect(row.lines_ready).toBe(1);
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L1"], "served"), ...at(900) }));
    row = onlyQueueRow(store);
    expect(row.lines_ready).toBe(1);
    expect(row.lines_total).toBe(2);
    store.close();
  });
});

describe("parking (01-F10)", () => {
  it("01-F10: a child before its parent parks — no state effect — then drains identically to parent-first delivery", () => {
    const id = identity();
    const created = peerEnvelope(peerIdentity(id), 0, { ...orderCreated("O1"), ...at(0) });
    const confirm = peerEnvelope(peerIdentity(id), 0, { ...orderConfirmed("O1"), ...at(1000) });
    const late = foldStore(id);
    expect(late.ingest(confirm)).toEqual({ stored: true });
    expect(late.openOrders()).toEqual([]);
    expect(late.kitchenQueue()).toEqual([]);
    expect(parkedPairs(late)).toEqual([[confirm.id, "O1"]]);
    late.ingest(created);
    expect(late.parked()).toEqual([]);
    const forward = foldStore(id);
    forward.ingest(created);
    forward.ingest(confirm);
    expect(tables(late)).toEqual(tables(forward));
    late.close();
    forward.close();
  });

  it("01-F10: the refund→payment→order chain delivered fully reversed drains to fixpoint", () => {
    const id = identity();
    const created = peerEnvelope(peerIdentity(id), 0, { ...orderCreated("O1"), ...at(0) });
    const payment = peerEnvelope(peerIdentity(id), 0, { ...paymentRecorded("O1", 500), ...at(10) });
    const refund = peerEnvelope(peerIdentity(id), 0, {
      ...paymentRefunded(payment.id, 200),
      ...at(20),
    });
    const reversed = foldStore(id);
    reversed.ingest(refund);
    expect(parkedPairs(reversed)).toEqual([[refund.id, payment.id]]);
    reversed.ingest(payment);
    expect(parkedPairs(reversed)).toEqual(
      sortedPairs([
        [payment.id, "O1"],
        [refund.id, payment.id],
      ]),
    );
    reversed.ingest(created);
    expect(reversed.parked()).toEqual([]);
    const forward = foldStore(id);
    forward.ingest(created);
    forward.ingest(payment);
    forward.ingest(refund);
    expect(tables(reversed)).toEqual(tables(forward));
    reversed.close();
    forward.close();
  });

  it("01-F10: waiting_for is the first unmet id and re-parks deterministically as parents arrive", () => {
    const id = identity();
    const parentPeer = peerIdentity(id);
    const created = peerEnvelope(parentPeer, 0, { ...orderCreated("O1"), ...at(0) });
    const addL1 = peerEnvelope(parentPeer, 1, { ...orderLineAdded("O1", "L1"), ...at(10) });
    const addL2 = peerEnvelope(parentPeer, 2, { ...orderLineAdded("O1", "L2"), ...at(20) });
    const change = peerEnvelope(peerIdentity(id), 0, {
      ...lineStateChanged("O1", ["L1", "L2"], "confirmed"),
      ...at(100),
    });
    const store = foldStore(id);
    store.ingest(change);
    expect(parkedPairs(store)).toEqual([[change.id, "O1"]]);
    store.ingest(created);
    expect(parkedPairs(store)).toEqual([[change.id, "L1"]]);
    store.ingest(addL1);
    expect(parkedPairs(store)).toEqual([[change.id, "L2"]]);
    store.ingest(addL2);
    expect(store.parked()).toEqual([]);
    const cells = lines(onlyOrder(store));
    expect(cells.L1?.state).toBe("confirmed");
    expect(cells.L2?.state).toBe("confirmed");
    store.close();
  });

  it("01-F10: nothing is dropped — applied ∪ parked = stored; duplicate ingest of a parked id is a no-op", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const created = peerEnvelope(peerA, 0, { ...orderCreated("O1"), ...at(0) });
    const confirmO1 = peerEnvelope(peerB, 0, { ...orderConfirmed("O1"), ...at(100) });
    const orphan = peerEnvelope(peerB, 1, { ...orderConfirmed("O2"), ...at(200) });
    const store = foldStore(id);
    store.ingest(created);
    store.ingest(confirmO1);
    store.ingest(orphan);
    // applied: created + confirmO1 (visible in orders/queue); parked: exactly the orphan.
    expect(store.openOrders().map((r) => r.order_id)).toEqual(["O1"]);
    expect(store.kitchenQueue().map((r) => r.order_id)).toEqual(["O1"]);
    expect(parkedPairs(store)).toEqual([[orphan.id, "O2"]]);
    const parkedRow = store.parked()[0];
    expect(parkedRow && JSON.parse(parkedRow.envelope_json)).toEqual(orphan);
    expect(store.ingest(orphan)).toEqual({ stored: false });
    expect(parkedPairs(store)).toEqual([[orphan.id, "O2"]]);
    store.close();
  });
});

describe("terminal anomaly (01-F35 regression guard)", () => {
  it("01-F35: a terminal line ignores a later non-terminal transition — state kept, one terminal_regression anomaly, ledger intact", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L1"], "cancelled"), ...at(200) }));
    const regress = store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1"], "in_prep"), ...at(300) }),
    );
    const cell = lines(onlyOrder(store)).L1;
    expect(cell?.state).toBe("cancelled");
    expect(cell?.anomalies).toEqual({ [regress.id]: "terminal_regression" });
    expect(store.readOwnEvents().map((e) => e.id)).toContain(regress.id);
    store.close();
  });
});

describe("assignGlobalSeq (01-F34)", () => {
  it("01-F34: re-assigning the same global_seq to the same event is an idempotent no-op — tables ≡ refold()", () => {
    const id = identity();
    const store = foldStore(id);
    const created = store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.assignGlobalSeq(created.id, 7);
    const before = tables(store);
    store.assignGlobalSeq(created.id, 7);
    expect(tables(store)).toEqual(before);
    store.refold();
    expect(tables(store)).toEqual(before);
    store.close();
  });

  it("01-F34/18 §4: a divergent global_seq for an already-mapped event throws", () => {
    const id = identity();
    const store = foldStore(id);
    const created = store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.assignGlobalSeq(created.id, 7);
    expect(() => store.assignGlobalSeq(created.id, 8)).toThrow();
    store.close();
  });

  it("01-F34/18 §4: assigning to an unknown event_id throws and changes no state", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const before = tables(store);
    expect(() => store.assignGlobalSeq(newId(), 1)).toThrow();
    expect(tables(store)).toEqual(before);
    store.close();
  });

  it("01-F34/18 §4: a global_seq already held by another event throws", () => {
    const id = identity();
    const store = foldStore(id);
    const first = store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const second = store.append(appendInput(id, { ...orderCreated("O2"), ...at(100) }));
    store.assignGlobalSeq(first.id, 7);
    expect(() => store.assignGlobalSeq(second.id, 7)).toThrow();
    store.close();
  });

  it("01-F34: cloud order reversing the provisional table_id winner converges — highest global_seq wins, tables ≡ refold()", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const assignA = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A"),
      ...at(1000),
    });
    const assignB = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B"),
      ...at(2000),
    });
    store.ingest(assignA);
    store.ingest(assignB);
    expect(onlyOrder(store).table_id).toBe("T-B"); // provisional key: later device_created_at
    store.assignGlobalSeq(assignB.id, 5);
    store.assignGlobalSeq(assignA.id, 10);
    expect(onlyOrder(store).table_id).toBe("T-A"); // cloud order reversed the winner
    const converged = tables(store);
    store.refold();
    expect(tables(store)).toEqual(converged);
    store.close();
  });
});

describe("fold durability (01-F2/01-F6, 20 §2.6 seed)", () => {
  it("01-F2/01-F6: after abrupt abandon, reopen yields state tables ≡ pre-crash tables ≡ refold()", () => {
    const id = identity();
    const path = tempDbPath();
    let store = foldStore(id, path);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(200) }));
    store.append(appendInput(id, { ...kotPrinted("O1"), ...at(300) }));
    store.ingest(peerEnvelope(peerIdentity(id), 0, { ...orderConfirmed("O2"), ...at(400) }));
    const before = tables(store);
    // abrupt abandon: no close()
    store = foldStore(id, path);
    expect(tables(store)).toEqual(before);
    store.refold();
    expect(tables(store)).toEqual(before);
    store.close();
  });
});
