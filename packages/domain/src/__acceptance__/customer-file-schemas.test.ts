// Acceptance tests — the customer file's two payload schemas (`02-F27`'s inline customer
// creation). AUTHORED FROM SPEC TEXT ONLY, by a session that has seen no implementation and
// no implementation plan (`24 §3` step 2):
//
//   `specs/01-kernel-sync.md`  — `01 §4` (the catalog line carrying
//                                `customer.created / merged / address_added / phone_verified`),
//                                `01-F4` (an unknown/invalid type is an error, never silent
//                                acceptance), `01-F23` (ONE identity per org, keyed by
//                                normalized E.164 phone; merging two identities is an event),
//                                `01-F24` (customer data is org-scoped absolutely),
//                                `01-F62` (the two envelope scopes and the test for which)
//   `specs/02-pos-app.md`      — `02-F27` (the incoming-call flow: lookup by normalized phone
//                                → name, saved addresses; unknown number → inline creation),
//                                `02-F28` (≤30 s from NUMBER ENTRY), `02-F45` (the actor is
//                                not duplicated into a payload)
//   `specs/06-storefront.md`   — `06-F9` (address capture: free-text address + area/locality
//                                + optional map pin, saved via `customer.address_added`),
//                                `06-F11` (`customer.created` on first sight; name/address
//                                attach on subsequent orders)
//   `specs/08-foodpanda-ingestion.md` — `08-F2` (aggregator orders NEVER write the customer
//                                file — the proof that an order does not need one)
//   `specs/09-rider-dispatch.md` — `09-F10` ("address text" on an assigned delivery)
//   `specs/27-design-language.md` — `27-F6` (the `02-F27` customer NAME is a sanctioned typed
//                                field, so a name really is operator-entered free text)
//   `specs/00-platform-overview.md §5.6/§6` — English-only UI, user content is Unicode;
//                                additive payload evolution.
//
// RED-AWAITING-IMPLEMENTATION. `registry.ts` has no `customer.*` key at all, so every
// positive test below fails at `parseEvent` with `UnknownEventTypeError` — the missing-key
// class of red, not a syntax or import failure. The negative tests fail for the same reason
// (they assert the refusal NAMES a field; `UnknownEventTypeError` carries no Zod issue path).
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS IS BLOCKING RATHER THAN COSMETIC. `01-F4` makes producing an unregistered type a
// runtime error, so `02-F27`'s *"unknown number → inline customer creation
// (`customer.created`, `customer.address_added`)"* is today **unemittable, not merely
// unbuilt** — the phone half of `restaurant-os.md §8`'s item 7 cannot start.
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// PINNED INTERPRETATIONS — the places the FRs stop short. Recorded so the implementer can
// CONTEST the reading rather than discover it, and so a rename is one edit per fixture.
//
//  1. THE KEY FIELD IS `phone_e164`, AND IT IS THE PROJECTION KEY ON **BOTH** EVENTS.
//     `01-F23` says the identity is "keyed by normalized phone number (E.164)" — the key is
//     the phone, and no FR anywhere in the corpus names a `customer_id` (grepped: zero hits
//     across `specs/`). So `customer.address_added` carries the phone DIRECTLY rather than a
//     parent handle: `26 §4`'s "late-resolving-entity trap" names resolving a key through a
//     parent as the defect and a one-field schema addition as the fix, and `01-F29` already
//     applied exactly that to `payment.refunded.order_id`. The field NAME is a pin; the
//     requirement that the key be carried is not.
//  2. `name` IS REQUIRED AND NULLABLE. `02-F27` has the operator type a name at the counter;
//     `06-F11` creates on first sight from a checkout that captured only a number and lets
//     "name/address attach on subsequent orders". So an unnamed customer is a REAL state.
//     Required-and-nullable rather than optional, on the registry's own standing rule
//     (`payment.recorded.shift_id`, `void.recorded.approver_user_id`): `null` is a stated
//     fact — this channel captured no name — and `undefined` is a writer who forgot, and an
//     optional field cannot tell them apart. `""` is refused for the same reason: `null`
//     already says "no name", so an empty string is a SECOND encoding of one fact.
//  3. THE PHONE IS VALIDATED AS E.164, AND THIS IS THE LOAD-BEARING PIN OF THE FILE.
//     `01-F23` and `06-F11` both write "normalized … (E.164)". If the schema accepted the
//     local dialling form a Pakistani operator actually types (`03001234567`) *as well as*
//     `+923001234567`, then one customer becomes TWO identities in an append-only ledger,
//     `01-F23`'s "one customer identity per org" is false, and `02-F28`'s lookup misses the
//     repeat customer it exists to find. The alternative — accept any string and normalize
//     inside the fold — is REFUSED here because a normalizer living in a fold is a policy in
//     a fold: two devices on two library versions would key the same number differently and
//     project different customer files from an identical event set, which is the `01-F34`
//     break law 1 exists to prevent. Normalization belongs at the WRITER.
//     **This is not an `01-F17` block.** A refused customer record does not refuse a sale:
//     `08-F2` has aggregator orders reach settlement while writing no customer file at all,
//     and `02-F1`'s channel tag is a separate axis from a customer.
//  4. `address_id` IS REQUIRED AND UI-MINTED. `06-F9` has "returning verified customers pick
//     from saved addresses" and `09-F10` puts the chosen "address text" on a rider's assigned
//     order, so a saved address needs a stable handle. It is a MINTED BUSINESS KEY rather
//     than the add event's envelope id, on `01-F29`/`26 §8`'s ratified precedent: "one intent
//     may legitimately exist under two envelope ids", so an envelope-id-keyed set fragments a
//     re-emitted address into two rows. `01-F31` mints `settlement_attempt_id` at the UI for
//     the identical reason.
//  5. `address_text` IS REQUIRED, FREE TEXT, MIN 1. `06-F9`: "free-text address"; `09-F10`:
//     "address text". `06-F9`'s area/locality picker and optional map pin are NOT declared —
//     they are doc 06's fields (Wave 2) and ride the `looseObject` additively, exactly as
//     `registry.ts` declines to declare `discount.recorded.campaign_id` for doc 17.
//  6. NO `org_id` ON EITHER PAYLOAD. `01-F24` scopes customer data to the org absolutely, and
//     the ENVELOPE already carries `org_id`. A payload copy would be a second source for one
//     fact that can disagree with the first in an append-only ledger — `02-F45`'s argument
//     about the actor, one field over.
//  7. BOTH TYPES ARE BRANCH-SCOPED (`01-F62`). Its test is "who may legitimately emit it",
//     and the emitter here is a POS device on a branch floor (`02-F27`), not the cloud plane.
//     The org-scoped set is fixed at five types and these are not among them, so the ordinary
//     `EventEnvelope` — `branch_id`, `branch_created_at`, `time_basis` — is the right and only
//     envelope. Asserted below, because "org-scoped data" (`01-F24`) and "org-scoped envelope"
//     (`01-F62`) are different claims and the words are one letter apart.
//
// DELIBERATELY NOT COVERED, so no coverage is claimed that does not exist:
//
//  - **`customer.merged` and `customer.phone_verified`.** Both are `01 §4` catalog vocabulary
//    and NEITHER is registered by this task — asserted below as a tripwire, with its
//    retirement condition. `01-F23`'s "merging two identities is an event" is precisely the
//    act `DEC-CUST-001` governs, and that decision is **`proposed`, not accepted**; giving it
//    a schema would make emittable an event whose fold rule the corpus has not decided.
//  - **`customer.opted_in / opted_out`.** `07-F18` declares them the single canonical consent
//    family and doc 07 owns them.
//  - **The FOLD.** Which row a create lands in, what two divergent names project to, and the
//    `01-F34` relabel/clock invariance are `packages/sync-client`'s
//    `customer-file-fold.test.ts` / `customer-file-invariance.test.ts`. At the schema layer
//    every such assertion reduces to "parse did not invent a value", which passes without
//    looking (the trap that emptied a `day.opened` test to `z.looseObject({})` and left it
//    green).
//  - **PII, retention and erasure.** These payloads carry a phone number, a name and a street
//    address. `DEC-DATA-001` (crypto-shredding) is **`proposed`** and doc 22 owns erasure;
//    nothing here designs, asserts or implies an erasure mechanism. Flagged as a dependency.
//  - **Cross-branch sharing.** `01-F24` makes the customer file org-shared while `01-F9` gives
//    a device its BRANCH stream; nothing here asserts a customer created at one branch is
//    visible at another. That is `01 §9.3`, open.
import { describe, expect, it } from "vitest";
import { eventRegistry, isAuditEvent, newId, parseEvent, UnknownEventTypeError } from "../index.js";

/**
 * Transcribed from the `01 §4` catalog line — "`customer.created / merged / address_added /
 * phone_verified`" — rather than read back out of the registry. Reading the registry and
 * asserting against it passes for any content at all.
 */
const SPEC_CUSTOMER_TYPES_THIS_TASK = ["customer.created", "customer.address_added"] as const;

/**
 * The other two members of the same `01 §4` family. In the catalog, deliberately NOT in this
 * task, and asserted UNREGISTERED below. Retire that assertion the day a spec change decides
 * their merge rule — for `customer.merged` that means `DEC-CUST-001` moving off `proposed`.
 */
const SPEC_CUSTOMER_TYPES_NOT_THIS_TASK = ["customer.merged", "customer.phone_verified"] as const;

const envelope = (type: string, payload: unknown, over: Record<string, unknown> = {}) => ({
  id: newId(),
  org_id: newId(),
  // 01-F62: BRANCH-scoped — the emitter is a POS device on a branch floor (02-F27), not the
  // cloud plane, so all three branch fields are present and legal.
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: null as string | null,
  lamport_seq: 1,
  device_created_at: 1_752_800_000_000,
  branch_created_at: 1_752_800_000_000,
  time_basis: "branch" as const,
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [] as string[],
  ...over,
});

type ZodIssueLike = { readonly path?: readonly PropertyKey[] };

/** The Zod issue paths a refusal carries (`01-F4`), or `[]` if it carried none. */
const issuePaths = (error: unknown): readonly string[] => {
  const found = (error as { issues?: readonly ZodIssueLike[] } | null)?.issues;
  return Array.isArray(found) ? found.map((issue) => (issue.path ?? []).join(".")) : [];
};

/**
 * Asserts that emitting `payload` as `type` is refused AND that the refusal NAMES `field`.
 * Two assertions on purpose: the first fails if nothing threw, the second if something threw
 * for an unrelated reason. "Something threw" cannot tell "refused because the field is bad"
 * from "refused because the type is not registered at all" — and during the red window every
 * call here throws `UnknownEventTypeError`, which carries no issue path, so without the
 * second assertion every negative test in this file would be GREEN before a line of the
 * implementation existed. That is the `oracle-round-2-findings.md §C` vacuous-guard shape and
 * it is the single most likely way this file could have shipped worthless.
 */
const refuse = (type: string, payload: unknown, what: string, field: string) => {
  let accepted = false;
  let thrown: unknown;
  try {
    parseEvent(envelope(type, payload));
    accepted = true;
  } catch (error) {
    thrown = error;
  }
  expect(accepted, `${type} must refuse ${what}`).toBe(false);
  expect(
    issuePaths(thrown),
    `the refusal of ${what} must name \`${field}\` — got ${String(thrown)}`,
  ).toContain(field);
};

/** Drops one key, so a refusal can only be attributed to that key. */
const without = (payload: Record<string, unknown>, key: string): Record<string, unknown> => {
  const { [key]: _dropped, ...rest } = payload;
  return rest;
};

/** A Pakistani mobile in the form `01-F23` requires. The single-variable anchor. */
const PHONE = "+923001234567";

/** `02-F27`'s operator-typed name (`27-F6` sanctions the typing). */
const CREATED = { phone_e164: PHONE, name: "Ayesha Khan" } as const;

const ADDRESS = {
  phone_e164: PHONE,
  address_id: "adr-7f3c",
  address_text: "House 12, Street 5, Gulberg III, Lahore",
} as const;

// ===========================================================================
// §1 — the two types exist at all (01-F4). This is the whole blocker.
// ===========================================================================

describe("§1 01-F4 / 01 §4 — the customer family is registered", () => {
  it("01-F4: both types this task owns are known to the registry", () => {
    for (const type of SPEC_CUSTOMER_TYPES_THIS_TASK) {
      expect(eventRegistry.has(type), `${type} must be in the 01 §4 registry`).toBe(true);
      expect(eventRegistry.types()).toContain(type);
    }
  });

  it("01-F5: neither is an audit subtype — no hash chain, no store-stamped link", () => {
    for (const type of SPEC_CUSTOMER_TYPES_THIS_TASK) expect(isAuditEvent(type)).toBe(false);
  });

  /**
   * A SCOPE TRIPWIRE, not a completeness claim. `DEC-CUST-001` is `proposed`: nobody has ruled
   * what the kernel does with two identities being merged, so `01-F4` should go on refusing
   * `customer.merged` rather than let a module emit an act with no decided fold rule. If this
   * goes red because a later, spec-cited task registered it, delete the offending member from
   * `SPEC_CUSTOMER_TYPES_NOT_THIS_TASK` and say which decision moved.
   */
  it("commandment 2: the family members whose merge rule DEC-CUST-001 still owns stay unemittable", () => {
    for (const type of SPEC_CUSTOMER_TYPES_NOT_THIS_TASK) {
      expect(eventRegistry.has(type), `${type} must NOT be registered by this task`).toBe(false);
      expect(() => parseEvent(envelope(type, { phone_e164: PHONE }))).toThrow(
        UnknownEventTypeError,
      );
    }
  });
});

// ===========================================================================
// §2 — `customer.created` (02-F27 inline creation, 06-F11 first sight).
// ===========================================================================

describe("§2 customer.created — 01-F23's identity, 02-F27's inline creation", () => {
  it("02-F27: an operator-typed name against a normalized number is accepted and preserved", () => {
    const parsed = parseEvent(envelope("customer.created", CREATED));
    expect(parsed.type).toBe("customer.created");
    expect(parsed.payload).toMatchObject({ phone_e164: PHONE, name: "Ayesha Khan" });
  });

  it("06-F11: a first-sight creation with NO name is a real state — `name: null` is accepted", () => {
    const parsed = parseEvent(envelope("customer.created", { phone_e164: PHONE, name: null }));
    expect((parsed.payload as { name: string | null }).name).toBeNull();
  });

  it("01-F23: the phone key is REQUIRED — a customer with no number has no identity", () => {
    refuse("customer.created", without(CREATED, "phone_e164"), "a missing phone", "phone_e164");
  });

  /**
   * Required-and-nullable, not optional (pin 2). A create that OMITS `name` is a writer who
   * forgot; `null` is a channel that captured none. An `.optional()` schema accepts both and
   * can never tell them apart afterwards, in a ledger `01-F1` forbids correcting in place.
   */
  it("06-F11: `name` is REQUIRED and NULLABLE — omitting it is a forgotten field, not 'no name'", () => {
    refuse("customer.created", without(CREATED, "name"), "an omitted name", "name");
  });

  it("`name` refuses the empty string — `null` already means 'no name stated'", () => {
    refuse("customer.created", { ...CREATED, name: "" }, "an empty name", "name");
  });

  /**
   * `00 §5.6`: the UI is English-only, USER CONTENT is Unicode and must render and print
   * faithfully. A plausible wrong implementation reaches for `.regex(/^[A-Za-z ]+$/)` on a
   * "name" field and silently makes half this country's customers unrecordable.
   */
  it("00 §5.6: an Urdu-script name is accepted and survives parse byte-identically", () => {
    const name = "عائشہ خان";
    const parsed = parseEvent(envelope("customer.created", { ...CREATED, name }));
    expect((parsed.payload as { name: string }).name).toBe(name);
  });
});

// ===========================================================================
// §2b — E.164 (pin 3). The dangerous case is the LOCAL DIALLING FORM, because that is
// what a Pakistani operator actually types at `02-F27`'s prompt.
// ===========================================================================

describe("§2b 01-F23 — the phone key is NORMALIZED E.164 or it is refused", () => {
  it.each([
    ["a Pakistani mobile", "+923001234567"],
    ["a Pakistani landline", "+924235000000"],
    ["a foreign number", "+12125550123"],
  ])("01-F23: %s in E.164 form is accepted", (_what, phone_e164) => {
    const parsed = parseEvent(envelope("customer.created", { ...CREATED, phone_e164 }));
    expect((parsed.payload as { phone_e164: string }).phone_e164).toBe(phone_e164);
  });

  it.each([
    ["the local dialling form an operator types", "03001234567"],
    ["digits with no plus", "923001234567"],
    ["spaces", "+92 300 1234567"],
    ["hyphens", "+92-300-1234567"],
    ["a leading zero in the country code", "+0300123456"],
    ["more than 15 digits", "+9230012345678901"],
    ["an empty string", ""],
  ])("01-F23: %s is REFUSED — two forms of one number is two identities", (_what, phone_e164) => {
    refuse(
      "customer.created",
      { ...CREATED, phone_e164 },
      `a phone in the form ${JSON.stringify(phone_e164)}`,
      "phone_e164",
    );
  });
});

// ===========================================================================
// §3 — `customer.address_added` (06-F9 capture, 09-F10 the rider reads it).
// ===========================================================================

describe("§3 customer.address_added — 06-F9's saved address, keyed by the carried phone", () => {
  it("06-F9: a free-text address against a minted address id is accepted and preserved", () => {
    const parsed = parseEvent(envelope("customer.address_added", ADDRESS));
    expect(parsed.payload).toMatchObject(ADDRESS);
  });

  /**
   * `26 §4` / `01-F29`: the projection key is CARRIED, never resolved through the parent. The
   * assertion is that the payload above needs NO handle to the create event — no
   * `customer_id`, no parent envelope id — and is complete on its own.
   */
  it("26 §4: the phone key is carried on the address event itself, not resolved through a parent", () => {
    refuse(
      "customer.address_added",
      without(ADDRESS, "phone_e164"),
      "an address with no phone key",
      "phone_e164",
    );
  });

  it("06-F9: `address_id` is REQUIRED — a saved address a customer can pick needs a handle", () => {
    refuse(
      "customer.address_added",
      without(ADDRESS, "address_id"),
      "a missing address id",
      "address_id",
    );
  });

  it("09-F10: `address_text` is REQUIRED — a rider cannot deliver to an empty address", () => {
    refuse(
      "customer.address_added",
      without(ADDRESS, "address_text"),
      "a missing address text",
      "address_text",
    );
    refuse(
      "customer.address_added",
      { ...ADDRESS, address_text: "" },
      "an empty address text",
      "address_text",
    );
  });

  it("01-F23: the address event's phone key is E.164 too — an un-normalized key orphans it", () => {
    refuse(
      "customer.address_added",
      { ...ADDRESS, phone_e164: "03001234567" },
      "an address against the local dialling form",
      "phone_e164",
    );
  });

  it("00 §5.6: an Urdu-script address survives parse byte-identically", () => {
    const address_text = "مکان ۱۲، گلی ۵، گلبرگ، لاہور";
    const parsed = parseEvent(envelope("customer.address_added", { ...ADDRESS, address_text }));
    expect((parsed.payload as { address_text: string }).address_text).toBe(address_text);
  });
});

// ===========================================================================
// §4 — additive evolution (00 §6). Doc 06 is Wave 2 and owns fields this task must not
// declare; a strict schema here would make `06-F9`'s own event unemittable when it lands.
// ===========================================================================

describe("§4 00 §6 — the payloads are LOOSE, and doc 06's later fields ride through", () => {
  it("06-F9: an area/locality picker value and a map pin pass through and are PRESERVED", () => {
    const extras = { area: "Gulberg III", geo: { lat: 31.5204, lng: 74.3587 } };
    const parsed = parseEvent(envelope("customer.address_added", { ...ADDRESS, ...extras }));
    expect(parsed.payload).toMatchObject(extras);
  });

  it("06-F24: an org-level customer flag rides through `customer.created` unharmed", () => {
    const parsed = parseEvent(envelope("customer.created", { ...CREATED, cod_blocked: false }));
    expect(parsed.payload).toMatchObject({ cod_blocked: false });
  });

  /**
   * `02-F45` + pin 6. The envelope has exactly one identity slot and exactly one `org_id`; a
   * payload copy of either is a second source for one fact. Loose objects cannot REFUSE the
   * extra key, so what is asserted is the thing that actually matters and is checkable: the
   * fixtures this file blesses carry neither, and a schema that made either REQUIRED would
   * red here.
   */
  it("01-F24/02-F45: neither payload needs `org_id` or an actor — the envelope carries both", () => {
    expect(parseEvent(envelope("customer.created", CREATED)).envelope.org_id).toEqual(
      expect.any(String),
    );
    expect(
      parseEvent(envelope("customer.address_added", ADDRESS)).envelope.actor_user_id,
    ).toBeNull();
  });
});
