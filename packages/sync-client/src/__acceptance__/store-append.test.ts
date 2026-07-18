// Acceptance tests — T-01-03 device store: append/confirm law, authored from the
// kernel-tasks binding contract + specs/01-kernel-sync.md §3 only (24 §3 step 2).
// Confirmed = persisted before UI ack (01-F2, 00 §5.2); registry validation at the
// producer edge (01-F4); idempotent re-append (18 §4).

import { describe, expect, it } from "vitest";
import { openStore } from "../index.js";
import { appendInput, identity, tempDbPath } from "./builders.js";

describe("device store append (01-F2)", () => {
  it("01-F2: append returns the confirmed envelope — store-assigned gap-free lamport, null server_received_at, fields preserved", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const input = appendInput(id);
    const confirmed = store.append(input);
    expect(confirmed.id).toBe(input.id);
    expect(confirmed.lamport_seq).toBe(0);
    expect(confirmed.server_received_at).toBeNull();
    expect(confirmed.type).toBe(input.type);
    expect(confirmed.payload).toEqual(input.payload);
    expect(confirmed.org_id).toBe(id.org_id);
    store.close();
  });

  it("01-F2/20 §2.6: at append return the event is visible to an independent handle on the same file — persisted, not buffered", () => {
    const id = identity();
    const path = tempDbPath();
    const writer = openStore({ path, identity: id });
    const confirmed = writer.append(appendInput(id));
    const reader = openStore({ path, identity: id });
    const seen = reader.readOwnEvents();
    expect(seen.map((e) => e.id)).toContain(confirmed.id);
    reader.close();
    writer.close();
  });

  it("01-F4: an unknown event type throws and persists nothing", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    expect(() => store.append(appendInput(id, { type: "order.teleported" }))).toThrow();
    expect(store.status().queue_depth).toBe(0);
    expect(store.readOwnEvents()).toEqual([]);
    store.close();
  });

  it("01-F4: an invalid payload for a known type throws and persists nothing", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    expect(() => store.append(appendInput(id, { payload: { channel: "dine_in" } }))).toThrow();
    expect(store.status().queue_depth).toBe(0);
    store.close();
  });

  it("01-F2: append with an identity not matching the store throws and persists nothing", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const stranger = identity();
    expect(() => store.append(appendInput(id, { device_id: stranger.device_id }))).toThrow();
    expect(() => store.append(appendInput(id, { org_id: stranger.org_id }))).toThrow();
    expect(() => store.append(appendInput(id, { branch_id: stranger.branch_id }))).toThrow();
    expect(store.status().queue_depth).toBe(0);
    store.close();
  });

  it("01-F8: re-append of an already-stored id returns the stored envelope unchanged and assigns no new lamport", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const input = appendInput(id);
    const first = store.append(input);
    const second = store.append(input);
    expect(second).toEqual(first);
    expect(store.status().queue_depth).toBe(1);
    expect(store.status().own_high_water).toBe(0);
    store.close();
  });

  it("01-F8/18 §4: re-append of a stored id with divergent content throws and changes nothing — idempotency is for identical retries only", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const input = appendInput(id);
    const first = store.append(input);
    expect(() =>
      store.append({ ...input, payload: { order_id: "other", channel: "takeaway" } }),
    ).toThrow();
    expect(() => store.append({ ...input, type: "order.teleported" })).toThrow();
    expect(store.readOwnEvents()).toEqual([first]);
    expect(store.status().queue_depth).toBe(1);
    store.close();
  });

  it("01-F3: readOwnEvents(fromLamport) is inclusive and stays in lamport order", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    const confirmed = Array.from({ length: 4 }, () => store.append(appendInput(id)));
    expect(store.readOwnEvents(2).map((e) => e.id)).toEqual(confirmed.slice(2).map((e) => e.id));
    expect(store.readOwnEvents(0)).toEqual(store.readOwnEvents());
    store.close();
  });
});
