// Acceptance tests — T-01-04 fold directed laws, re-expressed for the T-01-15
// merge-semantics engine per the oracle's superseded-law enumeration (S entries
// replaced in place by their named ratified laws; R entries re-expressed; M
// entries mechanically updated to the amended payloads + the C8-pinned row
// shapes). Superseded comparator laws (canonical-order winners, derived settled,
// first-wins registers) now live as their merge-model replacements; the full
// merge-model oracle is the merge-*.test.ts suite.
// Ingest seam (01-F4/01-F8/18 §4), open_orders + kitchen_queue folds (01-F6),
// key-presence parking (01-F10), terminal anomalies (01-F35), sidecar
// global_seq bookkeeping (01-F34), fold durability (20 §2.6 seed).

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
  settlementClosed,
  tempDbPath,
} from "./builders.js";
import { sha256Canonical } from "./merge-builders.js";

// T-01-15 store surface — the C8-pinned projection row shapes; a missing member
// fails at runtime.
type OpenOrderRow = {
  order_id: string;
  channel: string;
  order_type: string | null;
  confirmed_at: number | null;
  settled: number;
  table_ids_json: string;
  table_conflict: number;
  pay_total: number;
  repaid_total: number;
  refund_total: number;
  pay_attempts_json: string;
  refund_attempts_json: string;
  cap_violated: number;
  exceptions_json: string;
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
/** Envelope-level timestamp override — time VALUES only (C1); rank is clock-free. */
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

const tables = (store: FoldStore) => ({
  orders: store.openOrders(),
  queue: store.kitchenQueue(),
  parked: store.parked(),
});

const parkedPairs = (store: FoldStore) =>
  store.parked().map((r): [string, string] => [r.event_id, r.waiting_for]);

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
  states: string[];
  anomalies: Record<string, string>;
};

const lines = (row: OpenOrderRow) => JSON.parse(row.json_lines) as Record<string, LineCell>;

const line = (over: Partial<LineCell> = {}): LineCell => ({
  anomalies: {},
  item_id: "item-karahi",
  qty: 1,
  states: ["placed"],
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
  it("01-F6: order.created materializes a row with the T-01-15 defaults and empty canonical json_lines", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    expect(store.openOrders()).toEqual([
      {
        order_id: "O1",
        channel: "dine_in",
        order_type: null,
        confirmed_at: null,
        settled: 0,
        table_ids_json: "[]",
        table_conflict: 0,
        pay_total: 0,
        repaid_total: 0,
        refund_total: 0,
        pay_attempts_json: "{}",
        refund_attempts_json: "{}",
        cap_violated: 0,
        exceptions_json: "[]",
        json_lines: "{}",
      },
    ]);
    store.close();
  });

  it("01-F6: optional order_type/table_id on order.created land in the row — the birth table is the assignment DAG's root head (additive under schema_version 1, 00 §6)", () => {
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
    expect(JSON.parse(row.table_ids_json)).toEqual(["T5"]);
    expect(row.table_conflict).toBe(0);
    store.close();
  });

  // Enumeration entry 7 (S): "canonically-first create wins" is superseded — a
  // duplicate create is an MVR defaulting to the min-payloadHash member plus the
  // order_identity_conflict exception (matrix row 52; never a sequence pick).
  // Fix-round R2: the expectation is computed with the oracle's own independent
  // sha256(canonicalJson) — never the implementation's payloadHash (the domain
  // merge-schema suite pins that the two agree).
  it("01-F20/01-F34: a second divergent order.created keeps both members — register defaults to the min-payloadHash payload and order_identity_conflict is raised", () => {
    const id = identity();
    const store = foldStore(id);
    const payloadA = { order_id: "O1", channel: "dine_in" };
    const payloadB = { order_id: "O1", channel: "takeaway", order_type: "delivery" };
    store.append(appendInput(id, { type: "order.created", payload: payloadA, ...at(0) }));
    store.append(appendInput(id, { type: "order.created", payload: payloadB, ...at(5000) }));
    const expected = sha256Canonical(payloadA) < sha256Canonical(payloadB) ? payloadA : payloadB;
    const row = onlyOrder(store);
    expect(row.channel).toBe(expected.channel);
    expect(row.order_type).toBe("order_type" in expected ? expected.order_type : null);
    expect(JSON.parse(row.exceptions_json)).toContain("order_identity_conflict");
    store.close();
  });

  // Enumeration entry 9 (S): the comparator confirmed_at anchor is superseded —
  // the anchor is selected set-wise (clock-free rank; C1 keeps the VALUE on
  // device_created_at) and is delivery-order independent.
  it("01-F6/01-N1: with two confirms the anchor is delivery-order independent and its value is one of the delivered stamps", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const createEnv = peerEnvelope(peerA, 0, { ...orderCreated("O1"), ...at(0) });
    const confirmA = peerEnvelope(peerA, 1, { ...orderConfirmed("O1"), ...at(1000) });
    const confirmB = peerEnvelope(peerB, 0, { ...orderConfirmed("O1"), ...at(2000) });
    const one = foldStore(id);
    one.ingest(createEnv);
    one.ingest(confirmA);
    one.ingest(confirmB);
    const two = foldStore(id);
    two.ingest(createEnv);
    two.ingest(confirmB);
    two.ingest(confirmA);
    const anchor = onlyOrder(one).confirmed_at;
    expect([T0 + 1000, T0 + 2000]).toContain(anchor);
    expect(onlyOrder(two).confirmed_at).toBe(anchor);
    expect(tables(two)).toEqual(tables(one));
    one.close();
    two.close();
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

  // Enumeration entry 8 (S) — fix-round R3: the interim convergence guard is
  // replaced by this oracle's pin of the line-value MVR rendering, ratifying the
  // implementer's §4 proposal: the cell renders the min-payloadHash member
  // WHOLESALE (a clock-free default mirroring the matrix row 52 create MVR —
  // never a field mix, never a sequence pick) over the value triple
  // {item_id, qty, unit_price_paisa}, and the order raises line_value_conflict.
  it("01-F16/01-F34 (fix-round R3): a duplicate line_id with divergent values renders the min-payloadHash member wholesale and raises line_value_conflict — byte-identical in both delivery orders", () => {
    const id = identity();
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const createEnv = peerEnvelope(peerA, 0, { ...orderCreated("O1"), ...at(0) });
    const addQty1 = peerEnvelope(peerA, 1, { ...orderLineAdded("O1", "L1"), ...at(100) });
    const addQty5 = peerEnvelope(peerB, 0, {
      ...orderLineAdded("O1", "L1", { qty: 5 }),
      ...at(200),
    });
    const valueA = { item_id: "item-karahi", qty: 1, unit_price_paisa: 50000 };
    const valueB = { ...valueA, qty: 5 };
    // The oracle's own independent hash (R2 discipline) over the rendered cell
    // value — not the implementation's payloadHash.
    const winner = sha256Canonical(valueA) < sha256Canonical(valueB) ? valueA : valueB;
    const one = foldStore(id);
    one.ingest(createEnv);
    one.ingest(addQty1);
    one.ingest(addQty5);
    const two = foldStore(id);
    two.ingest(createEnv);
    two.ingest(addQty5);
    two.ingest(addQty1);
    const row = onlyOrder(one);
    expect(lines(row).L1).toEqual(line({ qty: winner.qty })); // the member, wholesale
    expect(JSON.parse(row.exceptions_json)).toContain("line_value_conflict");
    expect(tables(two)).toEqual(tables(one));
    one.close();
    two.close();
  });

  it("01-F35: line_state_changed applies each line_context edge — legal transitions project", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L2"), ...at(200) }));
    store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1", "L2"], "confirmed"), ...at(300) }),
    );
    const cells = lines(onlyOrder(store));
    expect(cells.L1?.states).toEqual(["confirmed"]);
    expect(cells.L2?.states).toEqual(["confirmed"]);
    store.close();
  });

  it("01-F35: a payload-illegal edge never applies — state kept, illegal_transition anomaly recorded on the line", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    // The edge CLAIMS placed→ready — illegal from its own witnessed origin.
    const jump = store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1"], "ready", ["placed"]), ...at(200) }),
    );
    const cell = lines(onlyOrder(store)).L1;
    expect(cell?.states).toEqual(["placed"]);
    expect(cell?.anomalies).toEqual({ [jump.id]: "illegal_transition" });
    store.close();
  });

  // Enumeration entry 1 (S): "canonically-last table_assigned wins" is superseded
  // — the table anchor is a supersedes-DAG head-set: a chain resolves to its
  // head, concurrent assignments render the conflict SET (matrix row 53).
  it("01-F19/01-F34: a supersedes chain yields one head; concurrent assignments render the conflict set — identically in every delivery order", () => {
    const id = identity();
    const chainStore = foldStore(id);
    const created = chainStore.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const move1 = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A", { supersedes: [created.id] }),
      ...at(1000),
    });
    const move2 = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B", { from: "T-A", supersedes: [move1.id as string] }),
      ...at(2000),
    });
    chainStore.ingest(move2); // chain delivered out of order
    chainStore.ingest(move1);
    const chainRow = onlyOrder(chainStore);
    expect(JSON.parse(chainRow.table_ids_json)).toEqual(["T-B"]);
    expect(chainRow.table_conflict).toBe(0);
    chainStore.close();

    const one = foldStore(id);
    const createdC = one.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const headA = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A", { supersedes: [createdC.id] }),
      ...at(1000),
    });
    const headB = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B", { supersedes: [createdC.id] }),
      ...at(2000),
    });
    one.ingest(headA);
    one.ingest(headB);
    const row = onlyOrder(one);
    expect(JSON.parse(row.table_ids_json)).toEqual(["T-A", "T-B"]); // the SET, UTF-16 sorted
    expect(row.table_conflict).toBe(1);
    one.close();
  });

  // Enumeration entry 3 (S): "exact cover settles" is superseded — settlement is
  // an ACT, not a derivation (01-F33): nothing arithmetic settles an order.
  it("01-F33: exact arithmetic cover leaves settled 0 — only the settlement_closed act settles", () => {
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
    expect(onlyOrder(store).settled).toBe(0); // exact cover — still not settled
    store.append(appendInput(id, { ...settlementClosed("O1"), ...at(400) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });

  // Enumeration entry 4 (S): "a refund unsettles until re-covered" is superseded —
  // a post-settlement refund is a linked correction, never a reopen (01-F33).
  it("01-F29/01-F33: a refund after the close never un-settles — refund_total records it, settled stays 1", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(
      appendInput(id, {
        ...orderLineAdded("O1", "L1", { qty: 2, unit_price_paisa: 500 }),
        ...at(100),
      }),
    );
    const payment = paymentRecorded("O1", 1000);
    const attempt = payment.payload.settlement_attempt_id;
    store.append(appendInput(id, { ...payment, ...at(200) }));
    store.append(appendInput(id, { ...settlementClosed("O1"), ...at(300) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.append(
      appendInput(id, { ...paymentRefunded("O1", 300, { parent: attempt }), ...at(400) }),
    );
    const row = onlyOrder(store);
    expect(row.settled).toBe(1); // reopening does not exist
    expect(row.refund_total).toBe(300);
    expect(row.cap_violated).toBe(0);
    store.close();
  });

  // Enumeration entry 5 (S): the derived-settled voided-line law is superseded;
  // the voided-line EXCLUSION survives in lines_total (kitchen plane).
  it("01-F35/03-F24: a decidedly-voided line leaves lines_total — the exclusion survives on the kitchen plane", () => {
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
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(250) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L2"], "voided"), ...at(300) }));
    expect(lines(onlyOrder(store)).L2?.states).toEqual(["voided"]);
    const row = onlyQueueRow(store);
    expect(row.lines_total).toBe(1); // L2 decidedly exited
    store.close();
  });

  // Enumeration entry 6 (S): "billed_effective must be positive to settle" is
  // superseded — the act settles even a lineless, unpaid order (offline-legal).
  it("01-F33: a lineless order with a zero payment stays unsettled until the act — and the act alone settles it", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...paymentRecorded("O1", 0), ...at(100) }));
    expect(onlyOrder(store).settled).toBe(0);
    store.append(appendInput(id, { ...settlementClosed("O1"), ...at(200) }));
    expect(onlyOrder(store).settled).toBe(1);
    store.close();
  });
});

describe("kitchen_queue fold (01-F6)", () => {
  it("01-F6: no queue row exists before the confirmed fact holds", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    expect(store.kitchenQueue()).toEqual([]);
    store.close();
  });

  it("01-F6: confirm creates the row — confirm_at from the anchor confirm, channel from order.created, age_basis = the confirm anchor", () => {
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

  // Enumeration entry 10 (S): the kot.printed age_basis fallback is DELETED
  // (matrix rows 59/60; 03-F25/F26) — a stuck-printer recovery must not re-age
  // the ticket. age_basis = the confirm anchor, always.
  it("03-F25/03-F26: age_basis stays at the confirm anchor — later kot.printed events never move it", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), ...at(500) }));
    store.append(appendInput(id, { ...kotPrinted("O1"), ...at(800) }));
    store.append(appendInput(id, { ...kotPrinted("O1"), ...at(900) }));
    const row = onlyQueueRow(store);
    expect(row.age_basis).toBe(T0 + 500); // NOT T0+800
    expect(row.confirm_at).toBe(T0 + 500);
    store.close();
  });

  it("03-F19/03-F24: lines_ready counts cooking-done lines; voided and cancelled lines leave lines_total", () => {
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

describe("parking (01-F10 — key-presence)", () => {
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

  // Enumeration entry 11 (part-S): the refund→payment→order park chain is
  // superseded — payments and refunds carry their full projection keys and NEVER
  // park (01-F10 amended); the fully-reversed delivery still converges.
  it("01-F29/01-F10: payments and refunds never park — the fully-reversed chain converges to the forward delivery", () => {
    const id = identity();
    const created = peerEnvelope(peerIdentity(id), 0, { ...orderCreated("O1"), ...at(0) });
    const payment = paymentRecorded("O1", 500);
    const attempt = payment.payload.settlement_attempt_id;
    const paymentEnv = peerEnvelope(peerIdentity(id), 0, { ...payment, ...at(10) });
    const refundEnv = peerEnvelope(peerIdentity(id), 0, {
      ...paymentRefunded("O1", 200, { parent: attempt }),
      ...at(20),
    });
    const reversed = foldStore(id);
    reversed.ingest(refundEnv);
    expect(reversed.parked()).toEqual([]); // order + parent keys are CARRIED
    reversed.ingest(paymentEnv);
    expect(reversed.parked()).toEqual([]);
    reversed.ingest(created);
    const forward = foldStore(id);
    forward.ingest(created);
    forward.ingest(paymentEnv);
    forward.ingest(refundEnv);
    expect(tables(reversed)).toEqual(tables(forward));
    const row = onlyOrder(forward);
    expect(row.pay_total).toBe(500);
    expect(row.refund_total).toBe(200);
    reversed.close();
    forward.close();
  });

  // Enumeration entry 11 (part-S): the first-unmet-id re-park walk is superseded
  // — line-state edges carry line_context and NEVER park; they are held and
  // materialize when the line arrives, identically to the forward order.
  it("01-F34/01-F10: line-state edges never park — delivered before the order and its lines, they converge to the forward delivery", () => {
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
    expect(store.parked()).toEqual([]); // this type never parks (matrix row 61)
    expect(store.openOrders()).toEqual([]);
    store.ingest(created);
    store.ingest(addL1);
    store.ingest(addL2);
    const forward = foldStore(id);
    forward.ingest(created);
    forward.ingest(addL1);
    forward.ingest(addL2);
    forward.ingest(change);
    expect(tables(store)).toEqual(tables(forward));
    const cells = lines(onlyOrder(store));
    expect(cells.L1?.states).toEqual(["confirmed"]);
    expect(cells.L2?.states).toEqual(["confirmed"]);
    store.close();
    forward.close();
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
  it("01-F35: a terminal head absorbs a later non-terminal edge — terminal state kept, one terminal_regression anomaly, ledger intact", () => {
    const id = identity();
    const store = foldStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.append(appendInput(id, { ...orderLineAdded("O1", "L1"), ...at(100) }));
    store.append(appendInput(id, { ...lineStateChanged("O1", ["L1"], "cancelled"), ...at(200) }));
    const regress = store.append(
      appendInput(id, { ...lineStateChanged("O1", ["L1"], "in_prep"), ...at(300) }),
    );
    const cell = lines(onlyOrder(store)).L1;
    expect(cell?.states).toEqual(["cancelled"]);
    expect(cell?.anomalies).toEqual({ [regress.id]: "terminal_regression" });
    expect(store.readOwnEvents().map((e) => e.id)).toContain(regress.id);
    store.close();
  });
});

describe("assignGlobalSeq — sidecar bookkeeping only (01-F34)", () => {
  // Enumeration entry 12 (R): the transport laws survive as sidecar bookkeeping;
  // the refold legs are dropped (refold-equivalence encodes the superseded
  // comparator and is not ported).
  it("01-F34: re-assigning the same global_seq to the same event is an idempotent no-op — tables unchanged", () => {
    const id = identity();
    const store = foldStore(id);
    const created = store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    store.assignGlobalSeq(created.id, 7);
    const before = tables(store);
    store.assignGlobalSeq(created.id, 7);
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

  // Enumeration entry 2 (S): "cloud order reverses the provisional winner" is now
  // the NEGATION of 01-F34 — concurrent assignments render the conflict set and
  // adopting any cloud order changes NOTHING (the sequence is a delivery cursor).
  it("01-F34: concurrent table assignments render the conflict set, and adopting reversing global_seqs changes nothing", () => {
    const id = identity();
    const store = foldStore(id);
    const created = store.append(appendInput(id, { ...orderCreated("O1"), ...at(0) }));
    const assignA = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-A", { supersedes: [created.id] }),
      ...at(1000),
    });
    const assignB = peerEnvelope(peerIdentity(id), 0, {
      ...orderTableAssigned("O1", "T-B", { supersedes: [created.id] }),
      ...at(2000),
    });
    store.ingest(assignA);
    store.ingest(assignB);
    const row = onlyOrder(store);
    expect(JSON.parse(row.table_ids_json)).toEqual(["T-A", "T-B"]);
    expect(row.table_conflict).toBe(1);
    const before = tables(store);
    // Cloud order arrives REVERSED relative to the provisional stamps — under the
    // superseded engine this flipped the winner; now it is a sidecar write only.
    store.assignGlobalSeq(assignB.id, 5);
    store.assignGlobalSeq(assignA.id, 10);
    expect(tables(store)).toEqual(before);
    store.close();
  });
});

describe("fold durability (01-F2/01-F6, 20 §2.6 seed)", () => {
  // Enumeration entry 14 (R): reopen byte-equality survives; the refold legs are
  // dropped (the projection itself is the oracle).
  it("01-F2/01-F6: after abrupt abandon, reopen yields state tables ≡ pre-crash tables", () => {
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
    store.close();
  });
});
