// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2).
//
// PROVENANCE: written by an acceptance-test session from `02-F27`, `02-F47`, `01-F1`, `01-F17`,
// `01-F23`, `06-F9`, `09-F10`, `26 §8` and commandment 8. It reads the shipped seam only through
// the objects `main/index.ts` binds; no implementation of the capture surface was consulted,
// because that surface does not exist yet and this file is about the half that does.
//
// ── WHY THIS FILE EXISTS BESIDE THREE THAT ALREADY TOUCH THE SAME SEAM ──────────────────────
//
// `phone-entry-seam.test.ts` proves the gateway's behaviour, `phone-entry-guard.test.ts` §A
// proves the matrix is consulted, and `phone-entry-host.test.ts` proves the wires exist. Two
// claims are still made by none of them, and both are the ones that bite once
// `customer.address_added` acquires a producer:
//
//   1. **The verdict and the LEDGER together.** `phone-entry-guard.test.ts` §A asserts refusals
//      against a `vi.fn()` stub for `writes`, so *"nothing was recorded"* is a claim about a spy.
//      This asserts it against a REAL `openStore`: after a refusal, `readAllEvents()` contains no
//      `customer.*` row at all — the form of the claim `01-F1` makes irreversible.
//
//      ⚠ **A SHARPER CLAIM STOOD HERE AND THE MUTATION PASS DISPROVED IT.** It read *"a guard
//      that threw AFTER appending would pass there and fail here"*, and that is false: moving
//      both `guard()` calls below `deps.writes.recordCustomer(req)` kills **3 here and 2 there**,
//      because §A's stub records the call it was given and then asserts `recorded` is empty. The
//      claim was plausible, unmeasured, and wrong in the direction that flatters this file —
//      which is the failure mode `AGENTS.md` records as *"a proxy for the evidence, accepted as
//      the evidence"*. What this file actually adds is narrower and still worth having: the
//      address-carrying request, a real store rather than a spy, and a SECOND instrument on a
//      security property that survived 791 tests when it had only one.
//   2. **An address-carrying request, end to end.** Every existing assertion about
//      `customer.address_added` passes a request the product cannot currently produce. The
//      renderer half of that gap is
//      `apps/pos-electron/src/renderer/caller-details.dom.test.tsx`; this is the trusted half.
//
// ⚠ **THE JOIN BETWEEN THE TWO HALVES IS A TYPE, NOT A TEST, AND THAT IS SAID PLAINLY.** No
// suite in this repo crosses the Electron IPC boundary — `main/index.ts` builds an app at module
// scope and cannot be imported (`phone-entry-host.test.ts` makes the same admission about
// itself). So the renderer file proves the shipped `Counter` emits a `RecordCustomerRequest`
// carrying `address_text`, this file proves such a request reaches the ledger as
// `customer.address_added`, and what makes them the same object is `RecordCustomerRequestSchema`
// in `shared/ipc.ts` plus `tsc`. A reader should treat that seam as unasserted, because it is.
//
// ── THE SECURITY FINDING THIS MUST NOT LET REGRESS ─────────────────────────────────────────
//
// Deleting BOTH `guard()` calls from `authorizeWrites.recordCustomer` once passed **791/791**,
// because the seam test asserted verdicts through `append` (a different member) and the host test
// asserted the CHANNEL binding (the wire, not the verdict). `phone-entry-guard.test.ts` §A closed
// that. §B below closes it a second way — through the real gateway, against the real ledger — so
// the protection does not rest on one file's stub.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AuthorizedWrites,
  authorizeWrites,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
} from "../authorize";
import { createGateway } from "../gateway";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;

/** The digits an operator presses. Leading zero, eleven of them (`registry.ts`). */
const DIALLED = "03001234567";
/** `01-F23`'s key, as the WRITER resolves it. Never sent by a caller. */
const E164 = "+923001234567";
/** `06-F9`'s *"free-text address"*, of the shape `09-F10` reads off an assigned order. */
const ADDRESS = "House 12, Block C, Gulberg III, Lahore";
const NAME = "Hina Raza";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * The REAL gateway over a REAL store, behind the REAL authorization wrapper — the same three
 * objects `main/index.ts` composes, in the same order.
 *
 * `role` is the assignment the synced staff registry would hold (`01-F26`/`01-F28`); `null` is a
 * LOCKED device with nobody signed in (`01-F27`).
 */
const harness = (role: string | null): { store: DeviceStore; writes: AuthorizedWrites } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-caller-producer-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const session = () => (role === null ? null : { user_id: "u-ayesha", display_name: "Ayesha" });
  const gateway = createGateway({
    store,
    catalog: () => ({ name: "Chicken Karahi" }),
    menu: () => [],
    priceOf: () => 45000,
    actor: "dev",
    session,
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-10",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
  });
  const writes = authorizeWrites({
    writes: gateway,
    store: {
      identity: store.identity,
      staff: {
        // `11-F22` (August 2026) — participation rides the (person, branch) pair and only `active`
        // participates; `subjectOf` reads it off the roster row. Ayesha is on the roster here, so
        // the stamp restates the same fixture and `role === null` is still the LOCKED device.
        lookup: () =>
          role === null
            ? null
            : {
                user_id: "u-ayesha",
                pin_hash: "argon2id$stub",
                display_name: "Ayesha",
                status: "active",
                assignments: [{ role, branch_id: IDENTITY.branch_id }],
              },
      },
    } as unknown as Pick<DeviceStore, "identity" | "staff">,
    session,
    paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
  });
  return { store, writes };
};

const customerEvents = (store: DeviceStore) =>
  store.readAllEvents().filter((e) => e.type.startsWith("customer."));

const payloadOf = (store: DeviceStore, type: string): Record<string, unknown> => {
  const rows = store.readAllEvents().filter((e) => e.type === type);
  expect(rows, `expected exactly one ${type}`).toHaveLength(1);
  return (rows[0] as { payload: Record<string, unknown> }).payload;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `02-F27`'s SECOND EVENT REACHES THE LEDGER FROM THE PRODUCT'S OWN WRITE SURFACE
//
// The producer claim. Everything below goes through `authorizeWrites`, which is what
// `main/index.ts` binds the record channel to — never `gateway.recordCustomer` directly, because
// a test that reached past the guard would assert the ledger while skipping commandment 8.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F27 — one act, two events, one identity", () => {
  it("writes `customer.address_added` when the request carries an address", () => {
    const { store, writes } = harness("cashier");
    writes.recordCustomer({ dialled: DIALLED, name: NAME, address_text: ADDRESS });

    expect(customerEvents(store).map((e) => e.type)).toEqual([
      "customer.created",
      "customer.address_added",
    ]);
    // ORDER matters and is not incidental: `gateway.recordCustomer`'s own comment says the
    // address is *"written after the create so a partial failure leaves the identity rather than
    // an orphan address"*, and `01-F1` means neither can be rolled back.
  });

  it("keys the address to the SAME identity as the create (26 §4)", () => {
    const { store, writes } = harness("cashier");
    writes.recordCustomer({ dialled: DIALLED, name: NAME, address_text: ADDRESS });

    // Two payloads, one `01-F23` key, and the key is the WRITER's — never the caller's digits.
    expect(payloadOf(store, "customer.created").phone_e164).toBe(E164);
    expect(payloadOf(store, "customer.address_added").phone_e164).toBe(E164);
    // `09-F10` reads this very text off the assigned order; a rider cannot deliver to a name.
    expect(payloadOf(store, "customer.address_added").address_text).toBe(ADDRESS);
  });

  it("mints a business key for the address (26 §8), not ANY envelope id", () => {
    const { store, writes } = harness("cashier");
    writes.recordCustomer({ dialled: DIALLED, name: null, address_text: ADDRESS });

    const events = store.readAllEvents();
    const added = events.find((e) => e.type === "customer.address_added");
    const created = events.find((e) => e.type === "customer.created");
    const address_id = (added as { payload: { address_id?: unknown } }).payload.address_id;
    expect(typeof address_id).toBe("string");
    // `26 §8`: *"one intent may legitimately exist under two envelope ids"*, so a re-emitted
    // address keyed by its envelope would fragment into two rows in one customer's saved list.
    //
    // ⚠ **BOTH ids, because the first draft checked only one and a mutant walked through the
    // gap.** Asserting solely against the address event's OWN id left `address_id: envelope.id`
    // — the CREATE's envelope — passing all 42 tests in this file and its two neighbours. It is
    // the more plausible of the two mistakes, too: the create's envelope is the variable already
    // in scope at that line.
    expect(address_id).not.toBe((added as { id: string }).id);
    expect(address_id).not.toBe((created as { id: string }).id);
  });

  it("writes only `customer.created` when no address was given", () => {
    // The control that makes the three tests above attributable. Without it, a gateway that
    // emitted an address event unconditionally — with an empty or invented `address_text` —
    // would satisfy every assertion so far, and `01-F1` would make that permanent.
    const { store, writes } = harness("cashier");
    writes.recordCustomer({ dialled: DIALLED, name: NAME });
    expect(customerEvents(store).map((e) => e.type)).toEqual(["customer.created"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — COMMANDMENT 8 / `02-F47`: THE VERDICT, ASSERTED AGAINST THE LEDGER
//
// Not *"the channel is bound to the guarded object"* and not *"a spy was not called"* — whether
// an unauthorized caller's write is IN THE APPEND-ONLY LOG. That is the only form of the claim
// `01-F1` makes irreversible.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F47 — who may file a caller, decided by the matrix and proved by the store", () => {
  const request = { dialled: DIALLED, name: NAME, address_text: ADDRESS };

  it("a CASHIER may — the cell `02-F47` calls load-bearing", () => {
    // The positive control, and it is what makes every refusal below attributable: without it a
    // `recordCustomer` that threw unconditionally would satisfy all three.
    const { store, writes } = harness("cashier");
    expect(() => writes.recordCustomer(request)).not.toThrow();
    expect(customerEvents(store)).toHaveLength(2);
  });

  it("an OWNER may", () => {
    const { store, writes } = harness("owner");
    expect(() => writes.recordCustomer(request)).not.toThrow();
    expect(customerEvents(store)).toHaveLength(2);
  });

  it("a STOREKEEPER is REFUSED, and the ledger stays empty", () => {
    // `02-F47`: *"The storekeeper cell is `—` for `order.create`'s reason: Appendix A's
    // storekeeper column is stock-only and this is a counter act."*
    const { store, writes } = harness("storekeeper");
    expect(() => writes.recordCustomer(request)).toThrow();
    // THE assertion this file adds over `phone-entry-guard.test.ts` §A: not "the spy was not
    // called", but "the append-only log has nothing in it". A guard that refused after writing
    // would pass there.
    expect(customerEvents(store)).toEqual([]);
  });

  it("a LOCKED device is REFUSED, and the ledger stays empty", () => {
    // `01-F27` — nobody is signed in is not the same as the device may. `02-F41` makes
    // attribution whoever's PIN is in, and there is no PIN in.
    const { store, writes } = harness(null);
    expect(() => writes.recordCustomer(request)).toThrow();
    expect(customerEvents(store)).toEqual([]);
  });

  it("refuses the ADDRESS-carrying request on the same terms as the bare one", () => {
    // `02-F47` gives both event types ONE action and says why: *"two actions whose cells are
    // identical differ in nothing an implementation can observe."* This asserts the consequence
    // that IS observable — the verdict does not depend on which optional fields the payload
    // happens to carry. An implementation that guarded the address only when `address_text` was
    // present would be a narrower cell routed around by omitting a field.
    //
    // ⚠ **AND THE HALF THAT CANNOT BE ASSERTED, said rather than faked.** No role in the matrix
    // separates `customer.created` from `customer.address_added`, so a mutant making the second
    // `guard()` conditional on the address being present is UNOBSERVABLE from outside — exactly
    // as `02-F47` predicts. A test claiming to catch it would be theatre. If a later FR ever
    // splits the action, this is the assertion that needs a second case.
    const bare = harness("storekeeper");
    expect(() => bare.writes.recordCustomer({ dialled: DIALLED, name: null })).toThrow();
    expect(customerEvents(bare.store)).toEqual([]);

    const withAddress = harness("storekeeper");
    expect(() => withAddress.writes.recordCustomer(request)).toThrow();
    expect(customerEvents(withAddress.store)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `01-F17`: A REFUSED CALLER RECORD REFUSES NOTHING ELSE
//
// `02-F47` states it as a rule of the cell rather than as a courtesy: *"A refused customer record
// never refuses a sale (`01-F17`). `08-F2` has aggregator orders reach settlement writing no
// customer file at all, so a denied verdict here costs a name and an address and nothing else.
// Whatever this cell says, the order is created, lined and confirmed."*
// ─────────────────────────────────────────────────────────────────────────────────────────────

// ⚠ **THE ROLE-SHAPED VERSION OF THIS CLAIM IS UNTESTABLE, AND FINDING THAT OUT COST A RED.**
// The obvious test — *a storekeeper refused the caller can still ring the order* — was written,
// run, and failed against a CORRECT implementation: `02-F47` gives `customer.record` exactly
// `order.create`'s row, so the role denied one is denied the other and there is no actor for whom
// the two verdicts differ. `24 §3`'s second corollary calls a test that reddens under a correct
// implementation as damaging as a vacuous one, so it was deleted rather than weakened, and the
// reason is recorded here because the next session will reach for the same shape.
//
// What IS observable is the refusal `gateway.recordCustomer` makes on its own account — the
// unusable number — which lands on a CASHIER who is fully permitted to ring the sale.
describe("§C 01-F17 — the sale survives a refused customer record", () => {
  it("an unusable NUMBER is refused, and the same session rings the order anyway", () => {
    // `gateway.recordCustomer`'s own rule: a key no lookup will ever produce is permanent
    // (`01-F1`), so it throws rather than padding. *"NOT an 01-F17 block: the order is
    // unaffected."* Asserted here with an address attached, which is the new shape.
    const { store, writes } = harness("cashier");
    expect(() =>
      writes.recordCustomer({ dialled: "0300123456", name: NAME, address_text: ADDRESS }),
    ).toThrow();
    expect(customerEvents(store)).toEqual([]);

    // The same device, the next act. If the refusal had left the gateway, the store or the
    // session in a bad state, this is where it would show.
    expect(() =>
      writes.append({
        type: "order.created",
        payload: { order_id: "order-2", channel: "phone", order_type: "delivery" },
        refs: [],
      }),
    ).not.toThrow();
    expect(store.readAllEvents().filter((e) => e.type === "order.created")).toHaveLength(1);
  });

  it("and the caller can still be filed once the number is right", () => {
    // The other half of *"never blocked"*: a refusal must not poison the path it refused. An
    // implementation that latched a failure flag, or left a half-written envelope behind, passes
    // the test above and fails here — and `01-F1` means the retry is the operator's only remedy.
    const { store, writes } = harness("cashier");
    expect(() => writes.recordCustomer({ dialled: "0300123456", name: NAME })).toThrow();
    writes.recordCustomer({ dialled: DIALLED, name: NAME, address_text: ADDRESS });

    expect(customerEvents(store).map((e) => e.type)).toEqual([
      "customer.created",
      "customer.address_added",
    ]);
    expect(payloadOf(store, "customer.created").phone_e164).toBe(E164);
  });
});
