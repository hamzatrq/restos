// ACCEPTANCE TESTS — `02-F28` phone quick-entry, the MAIN-PROCESS half.
//
// ⚠ AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2). The session that wrote this file has read
// `02-F27`, `02-F28`, `02-N3`, `02-F1`, `02-F42`, `02-F10`, `02-F14`, `01-F17`, `01-F23`,
// `01-F53`, `01-F60`, `27-F6`, `27-F29` and `21 §5`, plus the SHIPPED substrate it must build on
// (`packages/domain/src/registry.ts`'s `customer.*` payloads, `packages/sync-client/src/folds/
// customer-file.ts`, `DeviceStore.customers()`, `main/gateway.ts`, `main/authorize.ts`). It has
// written no implementation of the phone surface, and the implementation it stood up to
// mutation-test these assertions was reverted before this file was committed.
//
// ── WHAT THIS FILE IS AIMED AT ───────────────────────────────────────────────────────────────
//
// `02-F28` is not "a customer file exists". It is a STOPWATCH: *"a repeat customer's order
// entered and confirmed in ≤ 30 s FROM NUMBER ENTRY"*. Every second of that budget is spent on
// one chain — dialled digits → `01-F23`'s normalized identity → the file's answer → an order on
// the `phone` channel → lines → confirm — and the chain has exactly one link that can break
// silently: **the number the operator types is not the key the file is stored under.**
//
// `registry.ts` states the consequence in its own words: the local dialling form
// (`03001234567`) is REFUSED at the schema, because if both forms parsed *"one customer would
// become TWO identities in an append-only ledger `01-F1` forbids correcting in place, `01-F23`'s
// 'one customer identity per org' would be false, and `02-F28`'s lookup would miss the repeat
// customer it exists to find."* So normalization is mandatory, it belongs at the WRITER, and —
// the part no shipped assertion covers — **the lookup must apply the SAME rule as the write, or
// the repeat customer is invisible to the very screen built to find her.**
//
// That is why §B is a ROUND TRIP rather than two tests. Two normalizers that are each
// self-consistent and disagree with each other pass any assertion that looks at one of them.
//
// ── THE FOLD IS ALREADY PROVEN; THIS FILE PROVES THE SEAM ────────────────────────────────────
//
// `packages/sync-client/src/__acceptance__/customer-file-{fold,store,invariance}.test.ts` own the
// projection and its convergence. `device-store.ts`'s own comment on `customers()` says what is
// left, in terms: *"the seam STOPS HERE ... no app calls this method and no shipping code emits
// either `customer.*` type ... the debt is `02-F27`'s screen"*. This file is the assertion that
// closes it, and it uses a REAL store and the REAL fold throughout — a stubbed `customers()`
// would let the suite assert its own fixture (`K-3`'s dead-oracle defect) and would pass against
// a lookup that consulted nothing.
//
// ── RED-AWAITING-IMPLEMENTATION, AND TWO OF THE REASONS ARE SPEC GAPS, NOT MISSING CODE ─────
//
// (1) `Gateway` carries no customer operations — this brief.
// (2) **The permission matrix DENIES inline customer creation.** `WRITE_ACTIONS`
//     (`main/authorize.ts`) has no `customer.created` / `customer.address_added` row and
//     `PERMISSION_ACTIONS` (`packages/domain/src/permissions.ts`) carries no customer action, so
//     `verdictFor`'s closing `if (action === null) return denied();` refuses the write for EVERY
//     role including owner. `02-F27`'s *"unknown number → inline customer creation"* is therefore
//     UNBUILDABLE rather than merely unbuilt — the identical shape `02-F46` records for
//     `availability.toggle` (*"the feature could not exist without this row"*) and `14-F30` for
//     `device.manage`. §F is that assertion, and it stays red until a doc-02 FR decides the
//     action and its cells. It is stated as one behavioural claim — *a cashier may record the
//     caller she is on the phone with* — and pins no action NAME, because naming one would be
//     this session deciding the FR.
// (3) **`order.created` cannot express which customer the order is for.** Its payload declares
//     `order_id`, `channel`, `order_type?`, `table_id?` and nothing else, and `01 §4`'s order
//     family has no `order.customer_linked` type — so no event in the corpus can carry the link.
//     **This file deliberately asserts NOTHING about that association**, because a test pinning
//     its absence would go red the day it is correctly added, and a test riding the `looseObject`
//     would pin an UNVALIDATED phone field — the exact second-identity defect `registry.ts`
//     validates `PhoneE164` to prevent. The gap is reported in the session's final message with
//     the FRs that would authorise the field (`02-F10` *"searchable by ... customer phone"*,
//     `02-F14` *"khata requires a linked customer"*, `01-F23` for its type). `02-F27`'s ORDER
//     HISTORY and *"repeat last order"* shortcut are downstream of it and are likewise unasserted.
//
// A test that stays red under a CORRECT implementation is as damaging as a vacuous one, so every
// assertion below is behaviour a correct implementation makes true. Nothing here pins a member
// count, a channel string, or the internals of a normalizer.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAging } from "../../../../pass-kds/src/main/aging";
import {
  type AuthorizedWrites,
  authorizeWrites,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
} from "../authorize";
import { createGateway, type Gateway, type GatewayDeps } from "../gateway";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;

const KARAHI = "i-karahi";

/**
 * `01-F60` — one item, two channels, DIFFERENT money. `phone` is priced apart from `counter`
 * because that is the entire reason `02-F42` makes channel a price key, and §E is the assertion
 * that a phone order rings on the phone column.
 */
const PRICES: Record<string, Record<string, number>> = {
  [KARAHI]: { counter: 45_000, phone: 52_000, foodpanda: 58_000 },
};

/**
 * THE NUMBER AN OPERATOR ACTUALLY TYPES, and `registry.ts` names this exact string as such:
 * *"the local dialling form a Pakistani operator actually types (`03001234567`) is REFUSED"*.
 * Eleven digits, leading zero — see `§C`'s note on why the leading zero is load-bearing.
 */
const DIALLED = "03001234567";

/**
 * The same human, as `01-F23` keys her.
 *
 * ⚠ **`+92` IS A PINNED READING, NOT A TRANSCRIPTION, AND IT IS PINNED IN EXACTLY ONE TEST
 * (§B's ledger assertion).** The corpus fixes the FORM (`01-F23`: *"normalized phone number
 * (E.164)"*) and `registry.ts` fixes the local form that must map into it, but no doc and no
 * constant in `packages/domain` names a default country code — `00 §7`'s config plane that would
 * carry one does not exist. Pakistan is the product's country (`restaurant-os.md`; `01-F46` fixes
 * Asia/Karachi) and `+92` is its ITU code, so this reproduces the corpus's own worked example
 * rather than a preference. Every OTHER assertion in this file proves normalization by ROUND
 * TRIP instead, so a founder ruling that changes the default breaks one named test and not the
 * suite.
 */
const E164 = "+923001234567";

/** A second identity, so nothing below can pass by returning "the only row there is". */
const OTHER_DIALLED = "03219876543";
const OTHER_E164 = "+923219876543";

const NAME = "Fatima Bibi";
const ADDRESS = "House 12, Street 4, Gulberg III, Lahore";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRACT, DECLARED HERE AND RESOLVED AT RUNTIME
//
// `K-3`'s dead-oracle defect was declaring the interface the oracle existed to deliver and then
// asserting against a hand-copy — both symbols dead. So these types are NOT exported, nothing
// imports them, and every one is resolved off the SHIPPED object before any behavioural
// assertion runs. A missing member is its own loud, named red rather than a `TypeError` in the
// middle of an unrelated claim.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `02-F27`'s lookup answer: *"customer file lookup by normalized phone → name, saved
 * addresses"*.
 *
 * `phone_e164` is `01-F23`'s key as the trusted side resolved it — the screen needs it to show
 * WHICH identity it is about to touch, and `null` says the dialled digits are not a phone number
 * at all. `known: null` is a number that normalizes fine and has no file yet: `02-F27`'s
 * *"unknown number"*, which is a state and not an error.
 *
 * ORDER HISTORY and *"repeat last order"* are the two halves of `02-F27` this shape deliberately
 * omits — see reason (3) in the header. They are unbuildable until an order can name a customer.
 */
type CustomerLookup = {
  phone_e164: string | null;
  known: {
    name: string | null;
    addresses: readonly { address_id: string; address_text: string }[];
  } | null;
};

/**
 * `02-F27`'s inline creation, as ONE act — *"unknown number → inline customer creation
 * (`customer.created`, `customer.address_added`)"*.
 *
 * **It takes the DIALLED digits, not an E.164 string, and that is the load-bearing part of the
 * shape rather than a convenience.** `registry.ts`: *"a normalizer in a fold is a POLICY in a
 * fold: two devices on two library versions key one number two ways ... Normalization belongs at
 * the WRITER."* `18 §9` makes main the trusted side and the renderer the untrusted end of the
 * bridge, so a renderer that normalized would be a SECOND writer of `01-F23`'s key, sitting
 * where a compromised or merely stale build can reach it. Exactly `addLine`'s argument with an
 * identity in place of a price, and `toggleAvailability`'s with an identity in place of
 * `01-F57`'s supersedes link.
 */
type RecordCustomerRequest = {
  dialled: string;
  /** `null` is `06-F11`'s stated absence — see §D. Never `undefined`, which is a writer's bug. */
  name: string | null;
  address_text?: string;
};

type CustomerSeam = {
  lookupCustomer: (dialled: unknown) => CustomerLookup;
  recordCustomer: (req: unknown) => { id: string };
};

const missing = (member: string): never => {
  throw new Error(
    `02-F27/02-F28 red-awaiting-implementation: Gateway.${member}() does not exist — ` +
      "the customer file is folded, stored and projected, and no seam reaches it (device-store" +
      ".ts's own comment on customers(): \"the seam STOPS HERE ... the debt is 02-F27's screen\")",
  );
};

/** Resolved BEFORE any behavioural claim, so an absent member never reads as a wrong answer. */
const seamOf = (gateway: Gateway): CustomerSeam => {
  const g = gateway as unknown as Partial<CustomerSeam>;
  if (typeof g.lookupCustomer !== "function") missing("lookupCustomer");
  if (typeof g.recordCustomer !== "function") missing("recordCustomer");
  return g as CustomerSeam;
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const harness = (over: Partial<GatewayDeps> = {}): { store: DeviceStore; gateway: Gateway } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-phone-entry-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const gateway = createGateway({
    store,
    catalog: () => ({ name: "Chicken Karahi" }),
    menu: () => [{ id: KARAHI, name: "Chicken Karahi" }],
    priceOf: (item_id, channel) => PRICES[item_id]?.[channel] ?? null,
    actor: "dev",
    session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-10",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
    ...over,
  });
  return { store, gateway };
};

/** Every `customer.*` envelope the store actually holds — the ledger, not the request. */
const customerEvents = (store: DeviceStore) =>
  store.readAllEvents().filter((e) => e.type.startsWith("customer."));

/**
 * The ONE payload of `type` in the ledger, or a loud named failure.
 *
 * It throws rather than returning `undefined` so a missing event is its own red with the type
 * named in it, instead of a `TypeError` inside a field assertion that then reads as "the value
 * was wrong" — the difference between "nothing was written" and "the wrong thing was written",
 * which are different defects with different fixes.
 */
const onlyPayload = (store: DeviceStore, type: string): Record<string, unknown> => {
  const rows = customerEvents(store).filter((e) => e.type === type);
  if (rows.length !== 1)
    throw new Error(`expected exactly one ${type} in the ledger, got ${rows.length}`);
  return (rows[0] as { payload: Record<string, unknown> }).payload;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM EXISTS AND IT READS THE REAL FOLD
//
// This wave's named defect, in the shape it takes here: a `customer_file` fold that converges
// perfectly, projects through the store, and is reachable from no screen. `seams:check` is blind
// to it by construction — a method on a returned object is neither an unreached value export
// (Rule A) nor an unsupplied optional member of an options bag (Rule B) — so the assertion has
// to be hand-written, and this is it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F27 — the customer file is reachable from the counter's own seam", () => {
  it("answers from the store's projection, not from anything the seam kept for itself", () => {
    const { store, gateway } = harness();
    const seam = seamOf(gateway);

    // Written through the STORE, behind the seam's back, and by the shipped append path so
    // `parseEvent` and the real fold both run. A lookup that consulted a private cache built by
    // its own `recordCustomer` would answer "unknown" here and pass every other test in §B.
    store.append({
      id: newId(),
      org_id: IDENTITY.org_id,
      branch_id: IDENTITY.branch_id,
      device_id: IDENTITY.device_id,
      actor_user_id: "u-ayesha",
      device_created_at: Date.now(),
      type: "customer.created",
      schema_version: 1,
      payload: { phone_e164: E164, name: NAME },
      refs: [],
    });

    const answer = seam.lookupCustomer(DIALLED);
    expect(answer.known).not.toBeNull();
    expect(answer.known?.name).toBe(NAME);
  });

  it("carries the SAVED ADDRESSES 02-F27 names, not the name alone", () => {
    // `02-F27`: "→ name, saved addresses, order history". A rider cannot deliver to a name, and
    // `09-F10` reads this text off the assigned order. An implementation that projected only the
    // name would satisfy the test above and leave the delivery half of a phone order empty.
    const { store, gateway } = harness();
    const seam = seamOf(gateway);
    const write = (type: string, payload: Record<string, unknown>) =>
      store.append({
        id: newId(),
        org_id: IDENTITY.org_id,
        branch_id: IDENTITY.branch_id,
        device_id: IDENTITY.device_id,
        actor_user_id: "u-ayesha",
        device_created_at: Date.now(),
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
    write("customer.created", { phone_e164: E164, name: NAME });
    write("customer.address_added", {
      phone_e164: E164,
      address_id: "addr-1",
      address_text: ADDRESS,
    });

    const answer = seamOf(gateway).lookupCustomer(DIALLED);
    expect(answer.known?.addresses.map((a) => a.address_text)).toEqual([ADDRESS]);
    // The id travels too — `26 §8` makes it the minted business key, and a screen that offered
    // "use this address" has to name WHICH one back to the writer.
    expect(answer.known?.addresses[0]?.address_id).toBe("addr-1");
    void seam;
  });

  it("answers about the number ASKED FOR, not about whatever row the file happens to hold", () => {
    // The control. A lookup returning `customers()[0]` unconditionally passes both tests above.
    const { store, gateway } = harness();
    const seam = seamOf(gateway);
    store.append({
      id: newId(),
      org_id: IDENTITY.org_id,
      branch_id: IDENTITY.branch_id,
      device_id: IDENTITY.device_id,
      actor_user_id: "u-ayesha",
      device_created_at: Date.now(),
      type: "customer.created",
      schema_version: 1,
      payload: { phone_e164: E164, name: NAME },
      refs: [],
    });

    expect(seam.lookupCustomer(OTHER_DIALLED).known).toBeNull();
    expect(seam.lookupCustomer(DIALLED).known?.name).toBe(NAME);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — ONE NORMALIZER, PROVED BY ROUND TRIP
//
// THE test of this file. `02-F28`'s whole promise is that a REPEAT customer is found; a lookup
// that normalizes differently from the write finds nobody, and every unit test of either half
// passes. Only the round trip sees it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F23/02-F28 — the number the operator types finds the identity the ledger holds", () => {
  it("round-trips: recorded from the dialled form, found from the dialled form", () => {
    const { gateway } = harness();
    const seam = seamOf(gateway);
    expect(seam.lookupCustomer(DIALLED).known).toBeNull();

    seam.recordCustomer({ dialled: DIALLED, name: NAME } satisfies RecordCustomerRequest);

    // Under two normalizers — or one on the write side and a raw string compare on the read side
    // — this is `null`, and `02-F28` has no repeat customer to be fast about.
    expect(seam.lookupCustomer(DIALLED).known?.name).toBe(NAME);
  });

  it("and is found from the E.164 form too — ONE identity, two ways of saying it (01-F23)", () => {
    // `01-F23`: "One customer identity per org, keyed by normalized phone number (E.164)". A
    // storefront (`06-F11`) or WhatsApp (doc 07) create writes the E.164 form directly, so the
    // counter must land on the same row or the branch keeps two files for one human.
    const { gateway } = harness();
    const seam = seamOf(gateway);
    seam.recordCustomer({ dialled: DIALLED, name: NAME } satisfies RecordCustomerRequest);

    expect(seam.lookupCustomer(E164).known?.name).toBe(NAME);
    expect(seam.lookupCustomer(E164).phone_e164).toBe(seam.lookupCustomer(DIALLED).phone_e164);
  });

  it("writes 01-F23's KEY into the ledger, never the digits that were dialled", () => {
    // Read out of the STORE, not off the return value. This is the one assertion that pins the
    // E.164 default (see `E164`'s note) and it is deliberately alone in doing so.
    //
    // It is also the assertion that catches the sly version of the defect: an implementation that
    // normalizes for the LOOKUP and writes the dialled string would pass the round trip above if
    // its lookup normalized both sides — and would put a key in an append-only ledger that
    // `06-F11`'s storefront create can never match, permanently (`01-F1`).
    const { store, gateway } = harness();
    seamOf(gateway).recordCustomer({
      dialled: DIALLED,
      name: NAME,
    } satisfies RecordCustomerRequest);

    expect(onlyPayload(store, "customer.created").phone_e164).toBe(E164);
  });

  it("keeps two callers apart end to end", () => {
    // The negative control for §B: a normalizer that collapsed everything to one key (`""`, a
    // constant, the country code alone) passes every assertion above.
    const { gateway } = harness();
    const seam = seamOf(gateway);
    seam.recordCustomer({ dialled: DIALLED, name: NAME } satisfies RecordCustomerRequest);
    seam.recordCustomer({
      dialled: OTHER_DIALLED,
      name: "Imran Sahib",
    } satisfies RecordCustomerRequest);

    expect(seam.lookupCustomer(DIALLED).known?.name).toBe(NAME);
    expect(seam.lookupCustomer(OTHER_DIALLED).known?.name).toBe("Imran Sahib");
    expect(seam.lookupCustomer(DIALLED).phone_e164).toBe(E164);
    expect(seam.lookupCustomer(OTHER_DIALLED).phone_e164).toBe(OTHER_E164);
  });

  it("saves the address 02-F27 captures on the same identity as the name", () => {
    // One act, two events (`02-F27` names both). If the address were written under a differently
    // normalized key it would land on a second row and the customer would have a name here and an
    // address there — invisible until a rider had nowhere to go (`09-F10`).
    const { store, gateway } = harness();
    const seam = seamOf(gateway);
    seam.recordCustomer({
      dialled: DIALLED,
      name: NAME,
      address_text: ADDRESS,
    } satisfies RecordCustomerRequest);

    expect(seam.lookupCustomer(DIALLED).known?.addresses.map((a) => a.address_text)).toEqual([
      ADDRESS,
    ]);
    // `26 §8` — a MINTED business key, so the two events agree about which address this is.
    const added = onlyPayload(store, "customer.address_added");
    expect(added.phone_e164).toBe(E164);
    expect(added.address_id).toBeTruthy();
    // And the SAME key as the create, or the name and the address are two rows for one human.
    expect(added.phone_e164).toBe(onlyPayload(store, "customer.created").phone_e164);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE LOOKUP IS A READ, AND A NUMBER THAT IS NOT A NUMBER IS A STATE
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F27/01-F17 — looking somebody up changes nothing and refuses nothing", () => {
  it("appends NOTHING — an unknown caller does not become a customer by being looked up", () => {
    // `01-F1` makes a speculative create permanent, and `02-F27` puts creation AFTER the lookup
    // ("unknown number → inline customer creation"), as an operator's act. A lookup that
    // upserted would file every wrong number and every hang-up for ever.
    const { store, gateway } = harness();
    const before = store.readAllEvents().length;

    const answer = seamOf(gateway).lookupCustomer(DIALLED);

    expect(answer.known).toBeNull();
    expect(store.readAllEvents().length).toBe(before);
    expect(customerEvents(store)).toHaveLength(0);
  });

  it("answers about digits that cannot be a phone number instead of throwing at the operator", () => {
    // `02-F27` puts the operator mid-call with a customer waiting. A partial number IS the
    // normal state of this field — she is still typing — so the answer while it is unusable must
    // be a value the screen can render, not an exception it has to catch. `27-F29` blocks
    // impossible input AT ENTRY; nothing in the corpus makes an incomplete number an error.
    const { gateway } = harness();
    const seam = seamOf(gateway);

    for (const partial of ["", "0", "03", "0300"]) {
      const answer = seam.lookupCustomer(partial);
      expect(answer.phone_e164).toBeNull();
      expect(answer.known).toBeNull();
    }
  });

  it("does not silently turn an unusable number into a DIFFERENT usable one", () => {
    // The failure this is aimed at: a normalizer that pads, truncates or country-codes whatever
    // it is given. `030012345678901` (too long for E.164's 15) must not become a valid key —
    // that is `registry.ts`'s "one customer becomes two identities" defect arriving from the
    // other direction, keying a real customer under a number nobody dialled.
    const { gateway } = harness();
    expect(seamOf(gateway).lookupCustomer("030012345678901").phone_e164).toBeNull();
    expect(seamOf(gateway).lookupCustomer("not-a-number").phone_e164).toBeNull();
  });

  it("REFUSES to record an unusable number rather than inventing a key for it", () => {
    // The write half of the rule above, and `registry.ts` already refuses it one layer down
    // (`PhoneE164`). This asserts the refusal is not routed around — by padding, by writing the
    // raw digits, or by writing nothing while reporting success. A `customer.created` that landed
    // here would be a permanent row under a key no lookup will ever produce (`01-F1`).
    const { store, gateway } = harness();
    const seam = seamOf(gateway);

    expect(() =>
      seam.recordCustomer({ dialled: "0300", name: NAME } satisfies RecordCustomerRequest),
    ).toThrow();
    expect(customerEvents(store)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `01-F17`: THE CUSTOMER FILE NEVER BLOCKS THE SALE
//
// `registry.ts` states this exactly: *"This is not an `01-F17` block. A refused customer record
// does not refuse a sale: `08-F2` has aggregator orders reach settlement while writing no
// customer file at all."* The refusal in §C is only correct if this is true beside it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F17 — a refused customer record does not refuse the order", () => {
  it("lets the phone order be created and lined AFTER the customer write was refused", () => {
    const { store, gateway } = harness();
    const seam = seamOf(gateway);

    expect(() =>
      seam.recordCustomer({ dialled: "0300", name: NAME } satisfies RecordCustomerRequest),
    ).toThrow();

    // The sale proceeds. `01-F17`: "A sale is never blocked" — not by inventory math, not by
    // sync, not by approval timeouts, and not by a caller whose number came through garbled.
    const order_id = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id, channel: "phone", order_type: "delivery" },
      refs: [],
    });
    const line = gateway.addLine({ order_id, item_id: KARAHI, qty: 1 });

    expect(line.id).toBeTruthy();
    expect(store.openOrders().find((o) => o.order_id === order_id)).toBeTruthy();
  });

  it("does not require a customer to exist before an order on the phone channel does", () => {
    // The order comes first in the worst case and that must be legal: `02-F27` has the operator
    // typing while the caller talks, and `08-F2` writes no customer file at all. An
    // implementation that gated `order.created` on a resolved customer would have inverted
    // `01-F17` to protect a projection.
    const { store, gateway } = harness();
    seamOf(gateway); // the seam must exist; it is deliberately not used
    const order_id = newId();

    gateway.append({
      type: "order.created",
      payload: { order_id, channel: "phone", order_type: "delivery" },
      refs: [],
    });

    expect(store.openOrders().find((o) => o.order_id === order_id)?.channel).toBe("phone");
    expect(customerEvents(store)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `02-F42`/`01-F60`: A PHONE ORDER RINGS ON THE PHONE COLUMN
//
// The money assertion, and the reason `02-F28` is a counter feature rather than a contacts app.
// `02-F42`: *"a foodpanda order keyed in at the counter bills at foodpanda prices — which is the
// entire point of pricing per channel, and would be lost if the price resolved from the DEVICE
// rather than the ORDER."* Every word applies to `phone`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F1/02-F42/01-F60 — the phone order's lines snapshot the PHONE price", () => {
  it("captures the phone column, not the counter column this device sits on", () => {
    const { store, gateway } = harness();
    const order_id = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id, channel: "phone", order_type: "delivery" },
      refs: [],
    });

    gateway.addLine({ order_id, item_id: KARAHI, qty: 2 });

    const added = store
      .readAllEvents()
      .filter((e) => e.type === "order.line_added")
      .map((e) => e.payload as { unit_price_paisa: number });
    expect(added).toHaveLength(1);
    // 52_000, not 45_000. `01-F53` freezes whichever one lands, in a ledger `01-F1` forbids
    // correcting in place — so the wrong column here is not a report row, it is money.
    expect(added[0]?.unit_price_paisa).toBe(PRICES[KARAHI]?.phone);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — COMMANDMENT 8: THE MATRIX MUST BE ABLE TO ANSWER
//
// ⚠ RED FOR A SPEC REASON, NOT A CODE REASON. See header note (2). This asserts one behaviour —
// the operator `02-F27` describes may perform the act `02-F27` describes — and names no action.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F Commandment 8 / 02-F27 — a cashier may record the caller she is speaking to", () => {
  const appended: unknown[] = [];
  const rig = (role: string): AuthorizedWrites => {
    appended.length = 0;
    const store = {
      identity: { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" },
      staff: {
        lookup: () => ({
          user_id: "u-ayesha",
          pin_hash: "argon2id$stub",
          display_name: "Ayesha",
          assignments: [{ role, branch_id: "br-1" }],
        }),
      },
    } as unknown as Pick<DeviceStore, "identity" | "staff">;
    return authorizeWrites({
      writes: {
        append: vi.fn((req: unknown) => {
          appended.push(req);
          return { id: "evt-1" };
        }),
        addLine: vi.fn(() => ({ id: "evt-2" })),
        toggleAvailability: vi.fn(() => ({ id: "evt-3" })),
      },
      store,
      session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
      paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
    });
  };

  it("is not refused by the domain permission matrix", () => {
    // Today `WRITE_ACTIONS` has no row for this type, so `verdictFor` falls to
    // `if (action === null) return denied()` and this throws — the same collapse `02-F46`
    // records for the 86 toggle: *"the feature could not exist without this row."*
    //
    // `21 §5` and `02-F27` both put this act in the CASHIER's hands: she is the call-center
    // operator with the phone against her ear, and there is no manager standing beside her in a
    // T1 branch (`27-F11e`). Requiring an escalation to write down a caller's name would put
    // `02-F28`'s 30 seconds behind a manager PIN.
    expect(() =>
      rig("cashier").append({
        type: "customer.created",
        payload: { phone_e164: E164, name: NAME },
        refs: [],
      }),
    ).not.toThrow();
    expect(appended).toHaveLength(1);
  });

  it("permits the address half of 02-F27's one act on the same terms", () => {
    // Two event types, one operator act. A matrix that allowed the create and denied the address
    // would leave a delivery order with a customer and nowhere to send the food.
    expect(() =>
      rig("cashier").append({
        type: "customer.address_added",
        payload: { phone_e164: E164, address_id: "addr-1", address_text: ADDRESS },
        refs: [],
      }),
    ).not.toThrow();
    expect(appended).toHaveLength(1);
  });

  it("still refuses a LOCKED device (01-F27)", () => {
    // The control, and it must keep passing whatever the FR decides: a device identity is never
    // promoted into a user identity, so "nobody is signed in" is not "the device may".
    const locked = authorizeWrites({
      writes: {
        append: vi.fn(() => ({ id: "evt-1" })),
        addLine: vi.fn(() => ({ id: "evt-2" })),
        toggleAvailability: vi.fn(() => ({ id: "evt-3" })),
      },
      store: {
        identity: { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" },
        staff: { lookup: () => null },
      } as unknown as Pick<DeviceStore, "identity" | "staff">,
      session: () => null,
      paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
    });
    expect(() =>
      locked.append({
        type: "customer.created",
        payload: { phone_e164: E164, name: NAME },
        refs: [],
      }),
    ).toThrow();
  });
});
