// Acceptance tests — T-01-03 outbox core: lamport law + write-checkpoint, authored
// from the kernel-tasks binding contract + specs/01-kernel-sync.md §3 only (24 §3
// step 2). Drain in lamport order, advance only on ack (01-F8, 19 §5); status for
// the honesty UI (01-F11, 00 §5.7).

import { describe, expect, it } from "vitest";
import { openStore } from "../index.js";
import { appendInput, identity } from "./builders.js";

const filled = (n: number) => {
  const id = identity();
  const store = openStore({ path: ":memory:", identity: id });
  const confirmed = Array.from({ length: n }, () => store.append(appendInput(id)));
  return { id, store, confirmed };
};

describe("lamport assignment (01-F3)", () => {
  it("01-F3: lamport_seq starts at 0 and increments gap-free across appends", () => {
    const { store, confirmed } = filled(5);
    expect(confirmed.map((e) => e.lamport_seq)).toEqual([0, 1, 2, 3, 4]);
    store.close();
  });
});

describe("outbox drain and ack (01-F8)", () => {
  it("01-F8: nextBatch returns unacked events oldest-first in lamport order and respects max", () => {
    const { store, confirmed } = filled(4);
    const batch = store.nextBatch(3);
    expect(batch.map((e) => e.id)).toEqual(confirmed.slice(0, 3).map((e) => e.id));
    expect(store.nextBatch(100).length).toBe(4);
    store.close();
  });

  it("01-F8/19 §5: advanceTo acks everything at or below the watermark — partial ack is legal", () => {
    const { store } = filled(4);
    store.advanceTo(1);
    const rest = store.nextBatch(100);
    expect(rest.map((e) => e.lamport_seq)).toEqual([2, 3]);
    expect(store.status().acked_watermark).toBe(1);
    expect(store.status().queue_depth).toBe(2);
    store.close();
  });

  it("01-F8: advanceTo is idempotent and a lower watermark never regresses the checkpoint", () => {
    const { store } = filled(4);
    store.advanceTo(2);
    store.advanceTo(2);
    store.advanceTo(0);
    expect(store.status().acked_watermark).toBe(2);
    expect(store.nextBatch(100).map((e) => e.lamport_seq)).toEqual([3]);
    store.close();
  });

  it("01-F8/18 §4: advanceTo beyond own_high_water throws AckBeyondAppendedError and changes nothing", () => {
    const { store } = filled(2);
    expect(() => store.advanceTo(5)).toThrow(
      expect.objectContaining({ name: "AckBeyondAppendedError" }),
    );
    expect(store.status().acked_watermark).toBeNull();
    expect(store.status().queue_depth).toBe(2);
    store.close();
  });

  it("01-F8/19 §5: advanceTo rejects NaN, negative, and fractional watermarks — the checkpoint never silently regresses", () => {
    const { store } = filled(4);
    store.advanceTo(2);
    for (const bad of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => store.advanceTo(bad)).toThrow();
      expect(store.status().acked_watermark).toBe(2);
      expect(store.status().queue_depth).toBe(1);
    }
    store.close();
  });

  it("01-F8: advanceTo on an empty store throws AckBeyondAppendedError for any watermark", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    expect(() => store.advanceTo(0)).toThrow(
      expect.objectContaining({ name: "AckBeyondAppendedError" }),
    );
    expect(store.status().acked_watermark).toBeNull();
    store.close();
  });

  it("01-F8: acked events remain readable — the events table is the ledger copy, not a delivery buffer", () => {
    const { store, confirmed } = filled(3);
    store.advanceTo(2);
    expect(store.status().queue_depth).toBe(0);
    expect(store.readOwnEvents().map((e) => e.id)).toEqual(confirmed.map((e) => e.id));
    store.close();
  });
});

describe("sync status (01-F11)", () => {
  it("01-F11: status is null/zero before any activity and reflects appends, acks, and pull position", () => {
    const id = identity();
    const store = openStore({ path: ":memory:", identity: id });
    expect(store.status()).toEqual({
      queue_depth: 0,
      own_high_water: null,
      acked_watermark: null,
      last_global_seq: null,
    });
    store.append(appendInput(id));
    store.append(appendInput(id));
    store.advanceTo(0);
    store.setLastGlobalSeq(41);
    expect(store.status()).toEqual({
      queue_depth: 1,
      own_high_water: 1,
      acked_watermark: 0,
      last_global_seq: 41,
    });
    store.close();
  });
});
