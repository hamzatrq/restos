// Acceptance tests — the `customer_file` fold THROUGH THE DEVICE STORE. The pure fold is
// exercised in `./customer-file-fold.test.ts`; this file exists because of the defect this
// wave has recorded fourteen times: **a correct subsystem with no seam to the product.**
//
// A `customer_file` fold that converges perfectly and is reachable from no store method is
// exactly that defect — `02-F28`'s *"≤30 s from number entry"* needs a LOOKUP, and a lookup
// needs a projection a screen can read. `pnpm seams:check` cannot see this one either: a fold
// module the store imports and calls is neither an unreached export (Rule A) nor an unsupplied
// optional seam (Rule B), so the assertion has to be written by hand. It is written here.
//
// Authored from spec text only (`24 §3` step 2): `02-F27`, `02-F28`, `01-F17`, `01-F23`,
// `01-F9` (a device's own stream and its branch's merged stream both reach the same fold),
// `01-F2` (append persists before it returns), `26 §3` (the projection-key sidecar).
//
// RED-AWAITING-IMPLEMENTATION, for TWO reasons, and both are legitimate and independent:
//   * the store exposes no `customers()` projection (this brief);
//   * `customer.created` / `customer.address_added` are not in the `01 §4` registry yet, so
//     `store.ingest` refuses them at `parseEvent` before any fold is reached.
// The second blocks EVERY test below, so nothing here may be read as evidence about the fold
// until both land.

import { describe, expect, it } from "vitest";
import { appendInput, identity, must, peerIdentity, tempDbPath } from "./builders.js";
import {
  ADDRESS_1,
  addressAdded,
  type CustomerRow,
  customerCreated,
  customerEnvelope,
  NAME_A,
  PHONE_A,
  someOrder,
} from "./customer-file-builders.js";
import { type MergeStore, mergeStore } from "./merge-builders.js";

/** MergeStore + the customer_file addition, typed standalone so this oracle compiles against
 * the CONTRACT — a missing member is a loud runtime red, never a false green. */
type CustomerStore = MergeStore & { customers(): CustomerRow[] };

const customerStore = (id: ReturnType<typeof identity>, path = ":memory:"): CustomerStore =>
  mergeStore(id, path) as unknown as CustomerStore;

/** Resolved BEFORE any behavioural assertion, so a missing method is its own distinct red. */
const requireCustomers = (store: CustomerStore): (() => CustomerRow[]) => {
  const fn = store.customers;
  if (typeof fn !== "function")
    throw new Error(
      "customer_file red-awaiting-implementation: store.customers() is not implemented yet — " +
        "02-F28's lookup has nothing to read",
    );
  return fn.bind(store);
};

const rowFor = (rows: readonly CustomerRow[], phone_e164: string): CustomerRow =>
  must(
    rows.find((r) => r.phone_e164 === phone_e164),
    `customer row ${phone_e164}`,
  );

describe("02-F27/02-F28 — the customer file is READABLE from the store, or it does not exist", () => {
  /**
   * THE SEAM ASSERTION. `02-F27`'s inline creation happens on THIS device — the operator types
   * the caller's number at this till — so the customer must be readable from this device's own
   * `append` path, not merely from an ingest of somebody else's event.
   */
  it("02-F27/01-F2: a customer created on THIS device is readable back from the store", () => {
    const id = identity();
    const store = customerStore(id);
    const customers = requireCustomers(store);

    store.append(appendInput(id, customerCreated(PHONE_A, NAME_A)));

    expect(rowFor(customers(), PHONE_A).name).toBe(NAME_A);
  });

  it("01-F9: a peer's customer event on the branch stream reaches the same projection", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = customerStore(id);
    const customers = requireCustomers(store);

    store.ingest(customerEnvelope(peer, 1, customerCreated(PHONE_A, NAME_A)));
    store.ingest(customerEnvelope(peer, 2, addressAdded(PHONE_A, ADDRESS_1)));

    const row = rowFor(customers(), PHONE_A);
    expect(row.name).toBe(NAME_A);
    expect(JSON.parse(row.addresses_json)).toEqual([ADDRESS_1]);
  });

  /**
   * `01-F17` lives on the path a sale travels, not in a function called in isolation: the fold
   * runs inside `ingest` with no try/catch between, so an uncaught throw there wedges ingestion
   * of a real, rung-up sale. A customer event delivered in the same batch as an order must
   * leave the order untouched — and vice versa.
   */
  it("01-F17/26 §3: a customer event never disturbs the order fold, and never blocks ingest", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = customerStore(id);
    const customers = requireCustomers(store);

    expect(() => {
      store.ingest(customerEnvelope(peer, 1, customerCreated(PHONE_A, NAME_A)));
      store.ingest(customerEnvelope(peer, 2, someOrder("ord-77")));
      store.ingest(customerEnvelope(peer, 3, addressAdded(PHONE_A, ADDRESS_1)));
    }).not.toThrow();

    expect(store.openOrders().map((o) => o.order_id)).toEqual(["ord-77"]);
    expect(store.parked()).toEqual([]);
    expect(customers()).toHaveLength(1);
  });

  /**
   * `FOLDS.md` line 7 / the README's reopen self-heal: fold state is a CACHE of a function of
   * the ledger. Wipe the process, reopen the same database, and the customer file must rebuild
   * from the retained events — otherwise `02-F28`'s repeat customer is a repeat customer only
   * until the till is restarted, which on a counter terminal is nightly.
   */
  it("FOLDS.md line 7: reopening the same database rebuilds the customer file from the ledger", () => {
    const id = identity();
    const path = tempDbPath();

    const first = customerStore(id, path);
    requireCustomers(first);
    first.append(appendInput(id, customerCreated(PHONE_A, NAME_A)));
    first.append(appendInput(id, addressAdded(PHONE_A, ADDRESS_1)));
    first.close();

    const reopened = customerStore(id, path);
    const row = rowFor(requireCustomers(reopened)(), PHONE_A);

    expect(row.name).toBe(NAME_A);
    expect(JSON.parse(row.addresses_json)).toEqual([ADDRESS_1]);
    reopened.close();
  });
});
