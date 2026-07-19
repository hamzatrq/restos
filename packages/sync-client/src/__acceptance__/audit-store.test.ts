// Acceptance tests — T-01-10 audit hash-chain, device-store laws (authored from
// the kernel-tasks binding contract + specs/01-kernel-sync.md 01-F5/§4/§7 +
// DEC-AUDIT-001 only; 24 §3 step 2: read-only to the implementing session).
//
// 01-F5: audit.* events are ordinary kernel events, hash-chained per device — the
// store stamps `payload.prev_audit_hash` at append (store-owned platform law, 01 §7,
// like `lamport_seq`), atomically inside the T-01-03 append transaction. Non-audit
// appends are untouched; peers arrive pre-stamped and are never re-stamped locally;
// audit events fold to nothing (01-F6/F34). Chain position is never caller-supplied.
import { auditEventHash, isAuditEvent, verifyAuditChain } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { type DeviceStore, openStore } from "../index.js";
import {
  appendInput,
  canonicalJson,
  identity,
  kotPrinted,
  lineStateChanged,
  must,
  orderConfirmed,
  orderCreated,
  orderLineAdded,
  paymentRecorded,
  peerEnvelope,
  peerIdentity,
  tempDbPath,
} from "./builders.js";

const T0 = 1752800000000;

// The one new public surface (T-01-10 API contract); every other DeviceStore method
// keeps its T-01-03/04 shape. A missing method fails the red run at runtime.
type AuditStore = DeviceStore & {
  auditChainHead(): { hash: string; event_id: string } | null;
};

const auditStore = (id: ReturnType<typeof identity>) =>
  openStore({ path: ":memory:", identity: id }) as AuditStore;

/** The store-owned chain link lives in the audit PAYLOAD (DEC-AUDIT-001 decision 2). */
const prevOf = (env: { payload: unknown }): unknown =>
  (env.payload as { prev_audit_hash?: unknown }).prev_audit_hash;

/** An audit append input — the caller NEVER supplies prev_audit_hash (store-owned). */
const auditInput = (
  id: ReturnType<typeof identity>,
  extra: Record<string, unknown> = {},
): ReturnType<typeof appendInput> =>
  appendInput(id, { type: "audit.login", payload: { actor: "u1" }, ...extra });

const foldSnapshot = (store: AuditStore): string =>
  canonicalJson({
    orders: store.openOrders(),
    queue: store.kitchenQueue(),
    parked: store.parked(),
  });

describe("audit chain stamping on append (01-F5, 01 §7)", () => {
  it("01-F5: the device's first audit append links to null and sets the chain HEAD", () => {
    const id = identity();
    const store = auditStore(id);
    expect(store.auditChainHead()).toBeNull();
    const env = store.append(auditInput(id));
    expect(prevOf(env)).toBeNull();
    expect(store.auditChainHead()).toEqual({ hash: auditEventHash(env), event_id: env.id });
    store.close();
  });

  it("01-F5: each audit event links to the prior; interleaved non-audit appends are unstamped and never advance HEAD", () => {
    const id = identity();
    const store = auditStore(id);
    const a0 = store.append(auditInput(id));
    const head0 = store.auditChainHead();
    // Non-audit appends: no prev_audit_hash stamped, chain HEAD frozen (stamp for audit ONLY).
    const order = store.append(appendInput(id, orderCreated("O1")));
    expect(prevOf(order)).toBeUndefined();
    store.append(appendInput(id, orderConfirmed("O1")));
    expect(store.auditChainHead()).toEqual(head0);
    // Next audit links to a0; HEAD advances to a1.
    const a1 = store.append(auditInput(id));
    expect(prevOf(a1)).toBe(auditEventHash(a0));
    expect(store.auditChainHead()).toEqual({ hash: auditEventHash(a1), event_id: a1.id });
    const a2 = store.append(auditInput(id));
    expect(prevOf(a2)).toBe(auditEventHash(a1));
    // The Auditor precondition: this device's audit events in lamport order verify (01-F5).
    const own = store.readOwnEvents().filter((e) => isAuditEvent(e.type));
    expect(own.map((e) => e.id)).toEqual([a0.id, a1.id, a2.id]);
    expect(verifyAuditChain(own)).toEqual({ ok: true });
    store.close();
  });

  it("01-F5/01-F2: the chain HEAD is committed atomically with the durable ledger row — a second handle on the same file sees both", () => {
    const id = identity();
    const path = tempDbPath();
    const writer = openStore({ path, identity: id }) as AuditStore;
    const env = writer.append(auditInput(id));
    const reader = openStore({ path, identity: id }) as AuditStore;
    expect(reader.readOwnEvents().map((e) => e.id)).toContain(env.id);
    expect(reader.auditChainHead()).toEqual(writer.auditChainHead());
    expect(reader.auditChainHead()).toEqual({ hash: auditEventHash(env), event_id: env.id });
    reader.close();
    writer.close();
  });
});

describe("caller cannot forge chain position (01-F5, 01 §7)", () => {
  it("01-F5: append of an audit event whose payload already carries prev_audit_hash throws and persists nothing — HEAD unmoved", () => {
    const id = identity();
    const store = auditStore(id);
    const a0 = store.append(auditInput(id));
    const head = store.auditChainHead();
    for (const forged of [null, "f".repeat(64)]) {
      expect(() =>
        store.append(auditInput(id, { payload: { actor: "u1", prev_audit_hash: forged } })),
      ).toThrow();
    }
    expect(store.auditChainHead()).toEqual(head);
    const audits = store.readOwnEvents().filter((e) => isAuditEvent(e.type));
    expect(audits.map((e) => e.id)).toEqual([a0.id]); // nothing forged was persisted
    store.close();
  });
});

describe("idempotent re-append preserves the chain (01-F5, 01-F8)", () => {
  it("01-F5/01-F8: identical crash-retry is a no-op and divergent content throws — HEAD unmoved in both cases", () => {
    const id = identity();
    const store = auditStore(id);
    const input = auditInput(id);
    const first = store.append(input);
    const head = store.auditChainHead();
    const second = store.append(input); // identical retry: dedupe short-circuits before stamping
    expect(second).toEqual(first);
    expect(store.auditChainHead()).toEqual(head);
    expect(store.status().own_high_water).toBe(0); // no new lamport assigned
    // Divergent business content on the same id: loud throw, nothing changes.
    expect(() => store.append({ ...input, payload: { actor: "someone-else" } })).toThrow();
    expect(store.auditChainHead()).toEqual(head);
    expect(store.readOwnEvents()).toEqual([first]);
    store.close();
  });
});

describe("audit events are fold-inert (01-F5, 01-F6/F34)", () => {
  it("01-F5/01-F6: interleaving audit.* appends leaves open_orders/kitchen_queue/parked byte-identical, and refold() agrees", () => {
    const id = identity();
    // Store B: the operational lifecycle alone — distinct device_created_at fully orders it.
    const plain = openStore({ path: ":memory:", identity: id }) as AuditStore;
    const ops: ReturnType<typeof appendInput>[] = [
      appendInput(id, { ...orderCreated("O1"), device_created_at: T0 + 0 }),
      appendInput(id, { ...orderLineAdded("O1", "O1-L1"), device_created_at: T0 + 100 }),
      appendInput(id, { ...orderConfirmed("O1"), device_created_at: T0 + 200 }),
      appendInput(id, { ...kotPrinted("O1"), device_created_at: T0 + 300 }),
      appendInput(id, {
        ...lineStateChanged("O1", ["O1-L1"], "confirmed"),
        device_created_at: T0 + 400,
      }),
      appendInput(id, { ...paymentRecorded("O1", 500), device_created_at: T0 + 500 }),
    ];
    for (const input of ops) plain.append(input);
    const expected = foldSnapshot(plain);

    // Store A: the SAME operational events with audit.* appends interleaved between them.
    const withAudit = auditStore(id);
    const interleaved: ReturnType<typeof appendInput>[] = [
      auditInput(id, { device_created_at: T0 + 50 }),
      must(ops[0], "op0"),
      must(ops[1], "op1"),
      auditInput(id, { device_created_at: T0 + 150 }),
      must(ops[2], "op2"),
      must(ops[3], "op3"),
      auditInput(id, { device_created_at: T0 + 350 }),
      must(ops[4], "op4"),
      must(ops[5], "op5"),
      auditInput(id, { device_created_at: T0 + 600 }),
    ];
    for (const input of interleaved) withAudit.append(input);
    expect(foldSnapshot(withAudit)).toBe(expected);
    expect(withAudit.parked()).toEqual(plain.parked()); // audit events park nothing
    // Refold from the ledger (audit rows included) reproduces the same fold tables (01-F6).
    withAudit.refold();
    expect(foldSnapshot(withAudit)).toBe(expected);
    plain.close();
    withAudit.close();
  });
});

describe("peer audit events carry their origin link, unstamped locally (01-F5)", () => {
  it("01-F5: an ingested peer audit event keeps the prev_audit_hash its origin set and never touches this device's chain HEAD", () => {
    const id = identity();
    const store = auditStore(id);
    const peer = peerIdentity(id);
    const originLink = "9".repeat(64);
    const peerAudit = peerEnvelope(peer, 0, {
      type: "audit.login",
      payload: { prev_audit_hash: originLink, actor: "peer-user" },
    });
    expect(store.ingest(peerAudit)).toEqual({ stored: true });
    expect(store.auditChainHead()).toBeNull(); // own chain is untouched by peers
    const stored = must(
      store.readAllEvents().find((e) => e.id === peerAudit.id),
      "peer audit event",
    );
    expect(prevOf(stored)).toBe(originLink); // verbatim, not re-stamped
    // Fold-inert: the peer audit created no order/queue/parked state.
    expect(store.openOrders()).toEqual([]);
    expect(store.kitchenQueue()).toEqual([]);
    expect(store.parked()).toEqual([]);
    store.close();
  });
});
