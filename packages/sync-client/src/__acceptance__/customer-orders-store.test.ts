// Acceptance tests — the `customer_orders` fold THROUGH THE DEVICE STORE. The pure fold is
// exercised in `./customer-orders-fold.test.ts`; this file exists because of the defect this wave
// has recorded fifteen times: **a correct subsystem with no seam to the product.**
//
// `pnpm seams:check` cannot see this one, and `customer-file-store.test.ts` says why one fold
// over: a fold module the store imports and calls is neither an unreached export (Rule A) nor an
// unsupplied optional member (Rule B). The assertion has to be written by hand, and it is written
// here. **This is the half that mutating the SEAM kills** — delete the `foldCustomerOrders` call
// from `applyFold` and these reds are what say so; the pure-fold suite stays entirely green.
//
// Authored against `02-F64`, `17-F23`, `01-F17`, `01-F9` (a device's own stream and its branch's
// merged stream both reach the same fold), `01-F2` (append persists before it returns), `01-F6`
// (fold state is a CACHE of a function of the ledger).

import { describe, expect, it } from "vitest";
import type { CustomerOrdersRow } from "../folds/customer-orders.js";
import { appendInput, identity, must, peerIdentity, tempDbPath } from "./builders.js";
import { customerEnvelope, PHONE_A, PHONE_B, someOrder } from "./customer-file-builders.js";
import { type MergeStore, mergeStore } from "./merge-builders.js";

/**
 * MergeStore + the `customer_orders` addition, typed standalone so this oracle compiles against
 * the CONTRACT — a missing member is a loud runtime red, never a false green.
 */
type OrdersStore = MergeStore & { customerOrders(): CustomerOrdersRow[] };

const ordersStore = (id: ReturnType<typeof identity>, path = ":memory:"): OrdersStore =>
  mergeStore(id, path) as unknown as OrdersStore;

/** Resolved BEFORE any behavioural assertion, so a missing method is its own distinct red. */
const requireOrders = (store: OrdersStore): (() => CustomerOrdersRow[]) => {
  const fn = store.customerOrders;
  if (typeof fn !== "function")
    throw new Error(
      "customer_orders red-awaiting-implementation: store.customerOrders() is not implemented — " +
        "17-F17's reward line and 02-F10's search by phone have nothing to read",
    );
  return fn.bind(store);
};

const rowFor = (rows: readonly CustomerOrdersRow[], phone_e164: string): CustomerOrdersRow =>
  must(
    rows.find((r) => r.phone_e164 === phone_e164),
    `customer_orders row ${phone_e164}`,
  );

const linked = (order_id: string, phone_e164: string) => ({
  type: "order.customer_linked",
  payload: { order_id, phone_e164 },
});
const closed = (order_id: string, billed_paisa: number) => ({
  type: "order.settlement_closed",
  payload: { order_id, billed_paisa },
});

describe("02-F64/17-F23 — the link is READABLE from the store, or it does not exist", () => {
  /**
   * THE SEAM ASSERTION. `02-F64`'s link is made on THIS device — the cashier starts the order at
   * this till — so it must be readable from this device's own `append` path, not merely from an
   * ingest of somebody else's event.
   */
  it("02-F64/01-F2: a link made on THIS device is readable back from the store", () => {
    const id = identity();
    const store = ordersStore(id);
    const orders = requireOrders(store);

    store.append(appendInput(id, linked("ord-1", PHONE_A)));

    expect(rowFor(orders(), PHONE_A).linked_orders.map((o) => o.order_id)).toEqual(["ord-1"]);
  });

  it("01-F9: a peer's link on the branch stream reaches the same projection", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = ordersStore(id);
    const orders = requireOrders(store);

    store.ingest(customerEnvelope(peer, 1, linked("ord-1", PHONE_A)));
    store.ingest(customerEnvelope(peer, 2, closed("ord-1", 45_000)));

    const o = rowFor(orders(), PHONE_A).linked_orders[0];
    expect(o?.settled).toBe(true);
    expect(o?.billed_paisa).toBe(45_000);
  });

  /**
   * `01-F17` lives on the path a sale travels, not in a function called in isolation: the fold
   * runs inside `ingest` with no try/catch between, so an uncaught throw there wedges ingestion of
   * a real, rung-up sale. A loyalty event delivered in the same batch as an order must leave the
   * order untouched — and, crucially, must never be the reason a sale fails to merge.
   */
  it("01-F17: a link and a redemption never disturb the order fold and never block ingest", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = ordersStore(id);
    const orders = requireOrders(store);

    expect(() => {
      store.ingest(customerEnvelope(peer, 1, linked("ord-77", PHONE_A)));
      store.ingest(customerEnvelope(peer, 2, someOrder("ord-77")));
      store.ingest(
        customerEnvelope(peer, 3, {
          type: "loyalty.reward_redeemed",
          payload: {
            order_id: "ord-77",
            campaign_id: "camp-1",
            campaign_version: 1,
            phone_e164: PHONE_A,
            orders_consumed: 10,
            proof_kind: "none",
            proof_ref: null,
            adjustment_attempt_id: "att-1",
          },
        }),
      );
    }).not.toThrow();

    expect(store.openOrders().map((o) => o.order_id)).toEqual(["ord-77"]);
    expect(store.parked(), "26 §3: neither type parks, they carry their own keys").toEqual([]);
    expect(rowFor(orders(), PHONE_A).orders_consumed_total).toBe("10");
  });

  /**
   * `01-F6` / the reopen self-heal: fold state is a CACHE of a function of the ledger. Wipe the
   * process, reopen the same database, and the counter must rebuild from the retained events —
   * otherwise a customer's loyalty progress lasts only until the till is restarted, which on a
   * counter terminal is nightly.
   */
  it("01-F6: reopening the same database rebuilds the counter from the ledger", () => {
    const id = identity();
    const path = tempDbPath();

    const first = ordersStore(id, path);
    requireOrders(first);
    first.append(appendInput(id, linked("ord-1", PHONE_A)));
    first.append(appendInput(id, closed("ord-1", 45_000)));
    first.close();

    const second = ordersStore(id, path);
    const orders = requireOrders(second);
    const o = rowFor(orders(), PHONE_A).linked_orders[0];
    expect(o?.settled, "a restart must not lose a settled linked order").toBe(true);
    expect(o?.billed_paisa).toBe(45_000);
    second.close();
  });

  it("02-F64: two customers on one branch keep separate counters", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = ordersStore(id);
    const orders = requireOrders(store);

    store.ingest(customerEnvelope(peer, 1, linked("ord-1", PHONE_A)));
    store.ingest(customerEnvelope(peer, 2, linked("ord-2", PHONE_B)));
    store.ingest(customerEnvelope(peer, 3, closed("ord-1", 45_000)));

    expect(rowFor(orders(), PHONE_A).linked_orders[0]?.settled).toBe(true);
    expect(rowFor(orders(), PHONE_B).linked_orders[0]?.settled).toBe(false);
  });
});
