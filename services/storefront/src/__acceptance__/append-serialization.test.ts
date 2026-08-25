/**
 * ACCEPTANCE — `06-F36` (b)/(f): **the append is serialized per origin, and a refusal must not
 * stop the storefront.**
 *
 * ⚠ **WHY SERIALIZATION IS A CORRECTNESS PROPERTY HERE AND NOT A THROTTLE.** The gateway's ingest
 * is stop-at-gap per origin (`01-F8`): `handlePush` breaks on `lamport_seq !== through + 1` and its
 * out-of-order fill set lives for one push only. So ONE slot reserved and never persisted stops
 * this origin's watermark **permanently** — the outbox re-pushes the same page for ever and no
 * later order ever reaches the branch. The durable outbox therefore advances its counter only in
 * the transaction that persists the events, which is safe only while no two reservations are
 * outstanding at once. This file is the assertion that they are not.
 *
 * ⚠ **AND THE MUTANT THIS FILE EXISTS FOR IS INVISIBLE ON THE HAPPY PATH.** Chaining with
 * `tail.then(work)` instead of `tail.then(work, work)` serializes correctly until the first
 * REFUSAL, and then wedges the origin for ever: the chain inherits a rejection nobody handles and
 * no later order runs. An unpriced cart is an ordinary event, so that is a same-day outage.
 */
import type { EventEnvelopeT } from "@restos/domain";
import { describe, expect, it } from "vitest";
import type { PricedCart, StorefrontCatalog } from "../catalog.js";
import { STOREFRONT_CAPABILITY } from "../entitlement.js";
import { originIdentity } from "../identity.js";
import { createStorefrontOrigin, type LamportSource } from "../origin.js";
import type { Outbox } from "../outbox.js";
import { createPlacement } from "../placement.js";

const IDENTITY = originIdentity({
  org_id: "org-karachi",
  branch_id: "branch-clifton",
  device_id: "device-storefront-1",
  public_host: "burger-house.restos.pk",
});

/**
 * A lamport source with the SHIPPED contract: `reserve` hands out slots from a counter that only a
 * committed `put` advances. It records every interleaving so a test can see one.
 */
const shippedLamport = () => {
  let committed = 0;
  let handedOut = 0;
  let outstanding = 0;
  let maxOutstanding = 0;
  return {
    source: {
      reserve: async (count: number) => {
        outstanding += 1;
        maxOutstanding = Math.max(maxOutstanding, outstanding);
        const first = handedOut;
        handedOut = first + count;
        return first;
      },
    } satisfies LamportSource,
    /** Called by the outbox on a COMMITTED put — the only thing that moves the durable counter. */
    commit: (highest: number) => {
      outstanding = Math.max(0, outstanding - 1);
      committed = Math.max(committed, highest + 1);
      handedOut = committed;
    },
    /** Called when an append did NOT commit: the slots go back. */
    rollback: () => {
      outstanding = Math.max(0, outstanding - 1);
      handedOut = committed;
    },
    committed: () => committed,
    maxOutstanding: () => maxOutstanding,
  };
};

const catalogFor = (delayMs: number, priced: Record<string, number>): StorefrontCatalog => ({
  priceLines: async (item_ids): Promise<PricedCart> => {
    // A real network read sits here (`06-F33`), so the interleaving window is not theoretical.
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const paisa = new Map<string, number>();
    for (const id of item_ids) {
      const cell = priced[id];
      if (cell !== undefined) paisa.set(id, cell);
    }
    return { version: 1, paisa };
  },
});

const harness = (options: { catalogDelayMs: number; putFails?: (n: number) => boolean }) => {
  const lamport = shippedLamport();
  const stored: EventEnvelopeT[] = [];
  let puts = 0;
  const outbox: Outbox = {
    put: async (events) => {
      puts += 1;
      const highest = events.reduce((max, e) => (e.lamport_seq > max ? e.lamport_seq : max), -1);
      if (options.putFails?.(puts) === true) {
        lamport.rollback();
        throw new Error("connection terminated unexpectedly");
      }
      stored.push(...events);
      lamport.commit(highest);
    },
    pending: async () => [...stored],
    ack: async () => {},
  };
  let ids = 0;
  const origin = createStorefrontOrigin({
    identity: IDENTITY,
    lamport: lamport.source,
    clock: () => 1_700_000_000_000,
    catalog: catalogFor(options.catalogDelayMs, { "item-burger": 45_000 }),
    newId: () => {
      ids += 1;
      return `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
    },
  });
  const placement = createPlacement({
    origin,
    outbox,
    entitlement: async () => ({
      status: "record",
      record: { capabilities: new Set([STOREFRONT_CAPABILITY]) },
    }),
  });
  return { placement, stored, lamport };
};

const cart = (line_id: string, item_id = "item-burger") => ({
  lines: [{ line_id, item_id, qty: 1 }],
});

describe("A — `06-F36` (b): concurrent carts produce a GAP-FREE lamport run", () => {
  it("never has two reservations outstanding, however they interleave", async () => {
    const h = harness({ catalogDelayMs: 5 });
    // Ten carts posted at once. Without the chain, all ten reserve against one cached counter
    // before any of them persists.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => h.placement.place(IDENTITY.org_id, cart(`l${i}`))),
    );
    expect(h.lamport.maxOutstanding()).toBe(1);
    const slots = h.stored.map((e) => e.lamport_seq).sort((a, b) => a - b);
    // 10 orders x (created + one line) = 20 contiguous slots from 0. A gap here is a permanently
    // wedged origin at the gateway, not a cosmetic defect.
    expect(slots).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("mints ten distinct orders — serializing must not serialize them into one", async () => {
    const h = harness({ catalogDelayMs: 1 });
    const placed = await Promise.all(
      Array.from({ length: 10 }, (_, i) => h.placement.place(IDENTITY.org_id, cart(`l${i}`))),
    );
    expect(new Set(placed.map((p) => p.order_id)).size).toBe(10);
  });
});

describe("B — `06-F36` (b): a REFUSAL must not wedge the chain", () => {
  it("an unpriced cart is refused and the NEXT order still completes", async () => {
    const h = harness({ catalogDelayMs: 1 });
    await expect(h.placement.place(IDENTITY.org_id, cart("l1", "item-ghost"))).rejects.toThrow(
      /06-F33/,
    );
    // ⚠ The mutant: `tail.then(work)` leaves this hanging for ever, and every later order with it.
    await expect(h.placement.place(IDENTITY.org_id, cart("l2"))).resolves.toEqual({
      order_id: expect.any(String),
    });
    // The refused cart consumed NO slot: the survivor starts at 0.
    expect(h.stored.map((e) => e.lamport_seq)).toEqual([0, 1]);
  });

  it("survives a burst where every other cart is refused, with no gap", async () => {
    const h = harness({ catalogDelayMs: 2 });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        h.placement.place(IDENTITY.org_id, cart(`l${i}`, i % 2 === 0 ? "item-ghost" : undefined)),
      ),
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(4);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    const slots = h.stored.map((e) => e.lamport_seq).sort((a, b) => a - b);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("C — `06-F36` (f)/`06-N5`: an unwritable outbox REFUSES, never acknowledges", () => {
  it("a failing put fails the customer's request rather than returning an order id", async () => {
    const h = harness({ catalogDelayMs: 1, putFails: (n) => n === 1 });
    await expect(h.placement.place(IDENTITY.org_id, cart("l1"))).rejects.toThrow(
      /connection terminated/,
    );
    expect(h.stored).toHaveLength(0);
    // And the storefront keeps trading the moment the store is back — the slots were not burned.
    await expect(h.placement.place(IDENTITY.org_id, cart("l2"))).resolves.toBeDefined();
    expect(h.stored.map((e) => e.lamport_seq)).toEqual([0, 1]);
  });
});
