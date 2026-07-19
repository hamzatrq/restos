// Acceptance tests — T-01-05 store extension (contract (c), additive to T-01-03/T-01-04):
// store.ingestBatch — the batch seam over T-01-04's per-envelope ingest (planner
// reconciliation note): per-event validation reusing the registry path, but failures are
// skipped and counted, never thrown (01-F37 seed); dedupe by event id (01-F8); no lamport
// assignment (01-F3 — origin lamports are preserved); no outbox rows (18 §4); persisted
// before return (01-F2). store.readAllEvents = own ∪ ingested (01-F14 half). Authored from
// the kernel-tasks binding contract only (24 §3 step 2: read-only to the implementing
// session).

import { newId } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { openStore } from "../index.js";
import { appendInput, identity, must, peerEnvelope, peerIdentity, tempDbPath } from "./builders.js";

describe("store.ingestBatch (T-01-05 contract (c); 01-F2/F8/F37)", () => {
  it("01-F2: a valid peer batch lands fully — counts {appended, deduped, rejected} and is visible to an independent handle before return", () => {
    const id = identity();
    const path = tempDbPath();
    const store = openStore({ path, identity: id });
    const peer = peerIdentity(id);
    const batch = [peerEnvelope(peer, 0), peerEnvelope(peer, 1), peerEnvelope(peer, 2)];
    expect(store.ingestBatch(batch)).toEqual({ appended: 3, deduped: 0, rejected: 0 });
    const reader = openStore({ path, identity: id });
    expect(
      reader
        .readAllEvents()
        .map((e) => e.id)
        .sort(),
    ).toEqual(batch.map((e) => e.id).sort());
    reader.close();
    store.close();
  });

  it("01-F37/01-F4: invalid envelopes are skipped and counted, never thrown — the valid remainder still lands", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = peerIdentity(id);
    const stranger = { ...peerIdentity(id), branch_id: newId() };
    const good1 = peerEnvelope(peer, 0);
    const unknownType = peerEnvelope(peer, 1, { type: "order.teleported" });
    const badPayload = peerEnvelope(peer, 2, { payload: {} });
    const wrongBranch = peerEnvelope(stranger, 0);
    const good2 = peerEnvelope(peer, 3);
    let result: unknown;
    expect(() => {
      result = store.ingestBatch([good1, unknownType, badPayload, wrongBranch, good2]);
    }).not.toThrow();
    expect(result).toEqual({ appended: 2, deduped: 0, rejected: 3 });
    expect(
      store
        .readAllEvents()
        .map((e) => e.id)
        .sort(),
    ).toEqual([good1.id, good2.id].sort());
    store.close();
  });

  it("01-F8: dedupe by event id — already-held own or peer ids and in-batch repeats count as deduped, one row each", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = peerIdentity(id);
    const own = store.append(appendInput(id));
    const p1 = peerEnvelope(peer, 0);
    expect(store.ingestBatch([p1])).toEqual({ appended: 1, deduped: 0, rejected: 0 });
    const p2 = peerEnvelope(peer, 1);
    expect(store.ingestBatch([p1, own, p2, p2])).toEqual({ appended: 1, deduped: 3, rejected: 0 });
    const ids = store.readAllEvents().map((e) => e.id);
    expect(ids.length).toBe(3); // own + p1 + p2, exactly once each
    expect(new Set(ids)).toEqual(new Set([own.id, p1.id, p2.id]));
    store.close();
  });

  it("01-F3/18 §4: no lamport assignment and no outbox rows — origin lamport_seq preserved; queue_depth, own_high_water and nextBatch untouched", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peer = peerIdentity(id);
    const own = store.append(appendInput(id));
    const p = peerEnvelope(peer, 7); // arbitrary origin counter — never reassigned
    store.ingestBatch([p]);
    const status = store.status();
    expect(status.queue_depth).toBe(1); // ingest creates no outbox debt
    expect(status.own_high_water).toBe(0); // and never touches the own lamport counter
    expect(store.nextBatch(10).map((e) => e.id)).toEqual([own.id]); // drain = own events only
    const stored = must(
      store.readAllEvents().find((e) => e.id === p.id),
      "ingested peer event",
    );
    expect(stored.lamport_seq).toBe(7);
    expect(stored.device_id).toBe(peer.device_id);
    store.close();
  });

  it("(c): an empty batch is a no-op with zero counts", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    expect(store.ingestBatch([])).toEqual({ appended: 0, deduped: 0, rejected: 0 });
    expect(store.readAllEvents()).toEqual([]);
    store.close();
  });
});

describe("store.readAllEvents (T-01-05 contract (c); 01-F14 half)", () => {
  it("01-F14: readAllEvents = own ∪ ingested — every event exactly once, from any number of origin devices", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const peerA = peerIdentity(id);
    const peerB = peerIdentity(id);
    const own1 = store.append(appendInput(id));
    const own2 = store.append(appendInput(id));
    const a1 = peerEnvelope(peerA, 0);
    const a2 = peerEnvelope(peerA, 1);
    const b1 = peerEnvelope(peerB, 0);
    store.ingestBatch([a1, a2, b1]);
    const ids = store.readAllEvents().map((e) => e.id);
    expect(new Set(ids)).toEqual(new Set([own1.id, own2.id, a1.id, a2.id, b1.id]));
    expect(ids.length).toBe(5);
    store.close();
  });
});
