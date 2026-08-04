// Acceptance tests — S-1 (the service surface's payload schemas). Authored from spec text
// ONLY, by a session that has seen no implementation and no implementation plan
// (`24 §3` step 2; brief: `plans/wave-1/service-surface-test-brief.md`):
//   `specs/01-kernel-sync.md`  — `01 §4` (the event-type catalog), `01-F4` (an unknown type
//                                is an error, never silent acceptance), `01-F5` (the audit
//                                family), `01-F32` (the fifth tender), `01-F60` (the founder's
//                                required-not-optional ruling this file's shift key follows)
//   `specs/02-pos-app.md`      — `02-F12` (the tender vocabulary), `02-F19` (attribution rides
//                                the envelope), `02-F21`..`02-F26` (the seven events), `02-F37`
//                                (settling with no shift open)
//   `specs/26-merge-semantics.md` — `§7`'s "looks like ordering / actually needs" table
//   `specs/00-platform-overview.md §6` — money is integer paisa; additive payload evolution
//
// RED-AWAITING-IMPLEMENTATION. `registry.ts` has no `shift.*`, `day.*` or `cash.*` key, so
// every payload test below fails at `parseEvent` with `UnknownEventTypeError` — the missing-
// export class of red. Measured after the round-1 repair: **22 of 27 RED, 5 GREEN**. Each of the
// five is labelled GREEN on the test itself with the reason it is pinned anyway, so no test in
// this file is credited with coverage it does not carry.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE ORCHESTRATOR RULING THIS FILE ENCODES — `payment.recorded.shift_id` is
// **REQUIRED AND NULLABLE**. Three things decide it and none of them is a preference:
//   * `26 §7` classifies "shift/day/drawer bucketing of a payment" as needing a **carried
//     key**, explicitly NOT an ordering question. A fold that instead asks "which shift was
//     open when this payment arrived?" reads the *reading device's* state, so two devices
//     project different money from the same event set — the law-1 break `26 §7` exists to
//     name. A carried key has to be ON the payload.
//   * `02-F37` specifies a settlement recorded with "a **null shift reference** plus an
//     `unbound_settlement` anomaly" when no shift is open. That is a nullable carried key,
//     stated in the FR.
//   * The founder ruled the identical optional-vs-required question for `01-F60`'s enabled
//     set in favour of REQUIRED, on the ground that optional-means-skip is exactly how silent
//     omissions get in ("a caller who simply forgot the argument silently received no
//     completeness check at all"). Required-and-nullable follows that precedent: `null` is a
//     stated fact about this payment, `undefined` is a forgotten field, and an optional field
//     cannot tell them apart.
// This BREAKS existing `payment.recorded` fixtures across four packages. That cascade is the
// implementer's work and is reported by this session, not fixed here.
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// PINNED INTERPRETATIONS — the places the FRs stop short. Recorded so the implementer can
// contest the reading rather than discover it, and so a rename is one edit per builder below.
//
//  1. FIELD NAMES. `02-F21`..`02-F26` name exactly one schema field between them
//     (`reason=no_sale`, `02-F21`) and `26 §7` names exactly one more (`prev_shift_id`).
//     Every other name here — `shift_id`, `day_id`, `expected_paisa_by_method`,
//     `counted_cash_paisa`, `variance_paisa`, `opening_float_paisa`, `amount_paisa`,
//     `receipt_photo_ref`, `prev_day_id` — is a PIN, chosen to match the conventions
//     `registry.ts` already uses (`order_id`, `amount_paisa`, `unit_price_paisa`,
//     `from_table_id`). The FRs do not name them. This is the largest interpretation surface
//     in the file and is reported as a finding.
//  2. `variance_paisa` IS SIGNED. `02-F23` says "over/short recorded". A magnitude-only field
//     cannot express "short", which is half the FR, so the base fixture below carries a SHORT
//     (a negative) deliberately: a `.nonnegative()` variance fails this file loudly rather
//     than silently discarding the direction the cashier is being asked to sign off.
//  3. THE OTHER MONEY FIELDS ARE MAGNITUDES. `amount_paisa`, `counted_cash_paisa` and
//     `opening_float_paisa` follow the house convention already set by
//     `payment.recorded.amount_paisa` and `payment.refunded.amount_paisa`: a non-negative
//     integer whose direction comes from the event TYPE, not from its sign.
//  4. `prev_shift_id`/`prev_day_id` ARE NULLABLE. `26 §7` names `prev_shift_id` as the carried
//     causal link for duplicate shift/day open but not its shape. Nullable by exact analogy
//     with `order.table_assigned.from_table_id`, which `registry.ts` documents as "names the
//     origin (null when none)": the branch's first shift ever has no predecessor, and a
//     non-nullable link would make it unemittable.
//  5. THE BY-METHOD MAP IS EXHAUSTIVE OVER THE CLOSED TENDER SET. `02-F23` says expected cash
//     is "by method"; `02-F12`+`01-F32` close the method set. A partial map cannot distinguish
//     "no card sales this shift" from "the card figure was never computed" — the same
//     distinction `01-F60` refuses to lose when it makes a free modifier carry an explicit `0`.
//  6. `cash.drawer_opened.reason` IS NOT CLOSED HERE. `02-F21` names one value (`no_sale`) and
//     the phrasing "No-sale drawer opens: ... with `reason=no_sale`" implies other reasons
//     exist. Closing the set would be inventing an FR; whether it should be closed is a
//     finding, not an assertion.
//
// DELIBERATELY NOT COVERED, so no coverage is claimed that does not exist:
//
//  - **The `shift_cash` fold.** Expected-cash arithmetic, over/short computation, the
//    shift/day lifecycle, `01-F30` conservation, `01-F34` relabel invariance and `02-F37`'s
//    "opening a shift later does not retro-bind it" are S-2, not schemas. In particular the
//    no-retro-bind clause is a FOLD property: at the schema layer any assertion about it
//    reduces to "parse did not invent a value", which passes without looking.
//  - **Cashier identity.** `actor_user_id` is nullable on the envelope and no identity layer
//    exists (S-0b/c own it). Nothing here asserts a non-null actor, and nothing here pins a
//    `cashier_user_id` payload field — `02-F19` puts attribution in the envelope.
//  - **The role guard.** `02-F22` requires manager/owner permission for day open/close. The
//    `domain` permission matrix has never been written; a schema cannot enforce it.
//  - **Printed output.** `02-F24`'s day-summary ticket and the shift-close slip need a printer
//    (K-8 is owed). No test here implies a slip was produced.
//  - **`payment.split_recorded`, `void/comp/discount.recorded`.** `26 §7` notes they have no
//    payload schema either; they are not in this task's seven.
//  - **The business-date derivation (`01-F43`/`01-F45`/`01-F46`).** `26 §7` classifies it as a
//    TIME-SOURCE question, not a carried key, so no payload field for it is pinned above — and
//    with nothing on the payload there is nothing here for a schema to decide. The 05:00
//    cutover, `branch_created_at` as the trustworthy stamp and `device_created_at` as the
//    untrusted one are owned by `business-day.test.ts` and by `envelope.ts`'s own suite. An
//    earlier draft of this file carried a `day.opened` test titled for those three FRs; it
//    passed against a `day.opened` schema emptied to `z.looseObject({})`, because every
//    assertion in it was a `businessDate` call the schema never saw. Deleted rather than
//    reworded — a duplicate of `business-day.test.ts:189-200` adds no coverage under any title.
//  - **`02-F37`'s `unbound_settlement` anomaly.** The FR pairs the null shift reference with an
//    emitted anomaly. Only the null reference is a SCHEMA fact and only it is asserted below;
//    the anomaly is raised by the settlement path (S-2), has no type in the `01 §4` catalog
//    this file may assert against, and nothing here checks that one was emitted.
import { describe, expect, it } from "vitest";
import {
  eventRegistry,
  isAuditEvent,
  newId,
  PAYMENT_METHODS,
  parseEvent,
  UnknownEventTypeError,
} from "../index.js";

/**
 * The seven types this surface emits, transcribed from the `01 §4` catalog line —
 * "`shift.opened / closed` · `day.opened / closed` ·
 * `cash.drawer_opened / paid_out / deposit_recorded`" — rather than read back out of the
 * registry. `expect(registry.types()).toContain(registry.types()[0])` passes for any seven.
 */
const SPEC_SERVICE_EVENT_TYPES = [
  "shift.opened",
  "shift.closed",
  "day.opened",
  "day.closed",
  "cash.drawer_opened",
  "cash.paid_out",
  "cash.deposit_recorded",
] as const;

/**
 * `02-F12`'s four tenders plus `01-F32`'s fifth, transcribed from the FRs. Cross-checked
 * against the exported `PAYMENT_METHODS` below so this file and the shipped enum cannot
 * drift apart while both stay internally consistent.
 */
const SPEC_PAYMENT_METHODS = [
  "cash",
  "card",
  "raast",
  "khata_credit",
  "aggregator_receivable",
] as const;

const envelope = (type: string, payload: unknown, over: Record<string, unknown> = {}) => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  // Null on purpose: no identity layer exists and the POS hardcodes this null. Nothing in
  // this file may depend on a real cashier (S-0b/c own that).
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
 * Asserts that emitting `payload` as `type` is refused AND that the refusal names `field`.
 * Two separate assertions on purpose: the first fails if nothing threw, the second fails if
 * something threw for an unrelated reason. Asserting only that something threw cannot tell
 * "refused because the field is missing" from "refused because the fixture was malformed",
 * and a negative test that cannot distinguish those is the `oracle-round-2-findings.md §C`
 * "guard passed by not looking" pattern.
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

/** Drops one key from a payload, so a refusal below can only be attributed to that key. */
const without = (payload: Record<string, unknown>, key: string): Record<string, unknown> => {
  const { [key]: _dropped, ...rest } = payload;
  return rest;
};

/** The single-variable anchor every negative case rests on: this payload is otherwise valid. */
const anchor = (type: string, payload: unknown) =>
  expect(
    parseEvent(envelope(type, payload)).type,
    `anchor: a well-formed ${type} must parse, or a refusal below proves nothing`,
  ).toBe(type);

// ── Payload builders. Every field name below is pin 1; see the header. ──────────────────

const shiftOpened = (over: Record<string, unknown> = {}) => ({
  shift_id: newId(),
  // `26 §7`: the carried causal link. Null = the branch's first shift ever (pin 4).
  prev_shift_id: null as string | null,
  ...over,
});

/** `02-F23`'s "system-expected cash (by method)" — exhaustive over the closed tender set. */
const expectedByMethod = (over: Record<string, number> = {}) => ({
  cash: 125_000,
  card: 48_000,
  raast: 0,
  khata_credit: 0,
  aggregator_receivable: 0,
  ...over,
});

const shiftClosed = (over: Record<string, unknown> = {}) => ({
  shift_id: newId(),
  expected_paisa_by_method: expectedByMethod(),
  counted_cash_paisa: 124_500,
  // A SHORT of Rs 5.00 (pin 2). Negative on purpose: "over/short" has two directions and the
  // base fixture exercises the one a magnitude-only field would silently destroy.
  variance_paisa: -500,
  ...over,
});

const dayOpened = (over: Record<string, unknown> = {}) => ({
  day_id: newId(),
  // `02-F22`: "opening float entry → `day.opened`".
  opening_float_paisa: 500_000,
  prev_day_id: null as string | null,
  ...over,
});

const dayClosed = (over: Record<string, unknown> = {}) => ({
  day_id: newId(),
  // `02-F24`: "manager cash count + deposit record → `day.closed`, `cash.deposit_recorded`".
  counted_cash_paisa: 1_875_000,
  ...over,
});

const drawerOpened = (over: Record<string, unknown> = {}) => ({
  // `02-F21`: the one value any FR names.
  reason: "no_sale",
  shift_id: newId() as string | null,
  ...over,
});

const paidOut = (over: Record<string, unknown> = {}) => ({
  amount_paisa: 35_000,
  // `02-F26`: "reason + receipt photo (object storage ref) → `cash.paid_out`".
  reason: "kitchen gas cylinder refill",
  receipt_photo_ref: "obj://receipts/2026-07-24/paid-out-1.jpg",
  shift_id: newId() as string | null,
  ...over,
});

const depositRecorded = (over: Record<string, unknown> = {}) => ({
  amount_paisa: 1_500_000,
  day_id: newId(),
  ...over,
});

/** `payment.recorded` as `registry.ts` requires it today, PLUS the ruled shift key. */
const paymentRecorded = (over: Record<string, unknown> = {}) => ({
  order_id: newId(),
  amount_paisa: 45_000,
  method: "cash",
  settlement_attempt_id: newId(),
  purpose: "settles_order",
  shift_id: newId() as string | null,
  ...over,
});

const SERVICE_EVENTS: readonly (readonly [string, () => Record<string, unknown>])[] = [
  ["shift.opened", shiftOpened],
  ["shift.closed", shiftClosed],
  ["day.opened", dayOpened],
  ["day.closed", dayClosed],
  ["cash.drawer_opened", drawerOpened],
  ["cash.paid_out", paidOut],
  ["cash.deposit_recorded", depositRecorded],
];

describe("the seven service-surface types are in the catalog (01-F4, 01 §4)", () => {
  // GREEN at authorship — pins the builder table against the spec transcription, so a table
  // that quietly loses an event cannot make the loops below look complete.
  it("01 §4: this file's builder table covers exactly the seven types the catalog names", () => {
    expect([...SERVICE_EVENTS.map(([type]) => type)].sort()).toEqual(
      [...SPEC_SERVICE_EVENT_TYPES].sort(),
    );
  });

  // RED at authorship: registry.ts has no shift.*/day.*/cash.* key at all.
  it("01-F4/01 §4: each of the seven is registered and fold-consumed — emitting one is not an error", () => {
    for (const type of SPEC_SERVICE_EVENT_TYPES) {
      // `has()` and `types()` are two readings of one map, so asserting both per type is one
      // predicate written twice. The fold-consumed SET is pinned once, below the loop, where it
      // says something the per-type check does not.
      expect(
        eventRegistry.has(type),
        `${type} is in the 01 §4 catalog and must be registered`,
      ).toBe(true);
    }
    // `has()` is `in`; `types()` is what the fold engine actually enumerates. A registration
    // reachable by lookup but absent from the enumeration is registered and never folded.
    const enumerated: readonly string[] = eventRegistry.types();
    expect(
      SPEC_SERVICE_EVENT_TYPES.filter((type) => !enumerated.includes(type)),
      "every one of the seven must be enumerable, not merely reachable by lookup",
    ).toEqual([]);
  });

  // GREEN at authorship (every name is unknown today) — the guard is against a registration
  // that overshoots, e.g. a `shift.*` prefix match. `01-F4` closes types one at a time.
  it("01-F4: a plausible neighbour of the seven is still refused — registration is per type, never per family", () => {
    for (const type of [
      "shift.paused",
      "shift.reopened",
      "day.reopened",
      "cash.counted",
      "cash.drawer_closed",
      "cash.deposit_reversed",
    ]) {
      expect(eventRegistry.has(type), `${type} is in no FR and no 01 §4 catalog line`).toBe(false);
      expect(() => parseEvent(envelope(type, {}))).toThrow(UnknownEventTypeError);
    }
  });

  // RED at authorship for the `cash.*` half. The trap is real: `audit.drawer_opened` already
  // exists as an `01-F5` subtype, and audit events are kept OUT of `KnownEventType` on purpose
  // because "the fold engine consumes KnownEventType only". Wiring `02-F21`'s drawer event
  // into the audit family would make the theft-vector count fold to nothing.
  it("01-F5 vs 01 §4: cash.drawer_opened is a LEDGER event and audit.drawer_opened is the audit subtype — they are not the same row", () => {
    expect(eventRegistry.has("cash.drawer_opened"), "02-F21's drawer open must be foldable").toBe(
      true,
    );
    expect(isAuditEvent("cash.drawer_opened"), "cash.drawer_opened is not an audit.* subtype").toBe(
      false,
    );
    expect(isAuditEvent("audit.drawer_opened"), "01-F5 anchor: the audit subtype still is").toBe(
      true,
    );
    expect(
      eventRegistry.has("audit.drawer_opened"),
      "01-F5 anchor: audit.* stays outside KnownEventType",
    ).toBe(false);
  });

  // RED at authorship. 00 §6: additive-only payload evolution under one schema_version, which
  // the house implements with `z.looseObject` — declared fields are law, extras pass through
  // and are PRESERVED for consumers.
  it("00 §6: each of the seven preserves undeclared extra fields through parse (additive evolution)", () => {
    for (const [type, build] of SERVICE_EVENTS) {
      const payload = { ...build(), future_additive_field: "kept" };
      const event = parseEvent(envelope(type, payload));
      expect(event.payload, `${type} must preserve extras`).toMatchObject({
        future_additive_field: "kept",
      });
    }
  });

  // RED at authorship. The brief's standing constraint: no identity layer exists, the POS
  // hardcodes `actor_user_id` null, and none of these schemas may require a cashier to be
  // nameable. `02-F19` puts attribution in the ENVELOPE, so no payload here carries a
  // cashier field either.
  it("02-F19/01-F26: all seven parse with a null actor_user_id — attribution rides the envelope and identity is not built yet", () => {
    for (const [type, build] of SERVICE_EVENTS) {
      const event = parseEvent(envelope(type, build(), { actor_user_id: null }));
      expect(event.type).toBe(type);
      expect(event.envelope.actor_user_id, `${type} must not require a named cashier`).toBeNull();
    }
  });
});

describe("shift.opened — the key everything else buckets to (02-F22, 26 §7)", () => {
  // RED at authorship.
  it("02-F22/26 §7: shift.opened carries a shift_id — the carried key a later payment buckets to", () => {
    anchor("shift.opened", shiftOpened());
    refuse(
      "shift.opened",
      without(shiftOpened(), "shift_id"),
      "a shift open with no id",
      "shift_id",
    );
    refuse("shift.opened", shiftOpened({ shift_id: "" }), "an empty shift id", "shift_id");
    refuse("shift.opened", shiftOpened({ shift_id: null }), "a null shift id", "shift_id");
  });

  // RED at authorship. `26 §7`: "duplicate shift/day open ... a **carried causal link**
  // (`prev_shift_id`, `supersedes[]`)". Two devices both opening a shift after a partition is
  // ordinary offline behaviour, and without the link the fold has nothing but a clock or an id
  // comparison to resolve it — both banned (01-F45, 01-F34).
  it("26 §7: shift.opened carries prev_shift_id, required and nullable — the first shift ever has no predecessor", () => {
    anchor("shift.opened", shiftOpened());
    refuse(
      "shift.opened",
      without(shiftOpened(), "prev_shift_id"),
      "a shift open with no causal link at all",
      "prev_shift_id",
    );
    const first = parseEvent(envelope("shift.opened", shiftOpened({ prev_shift_id: null })));
    expect(
      (first.payload as { prev_shift_id: unknown }).prev_shift_id,
      "the branch's first shift must be emittable, and its null link must survive parse",
    ).toBeNull();
    const previous = newId();
    const next = parseEvent(envelope("shift.opened", shiftOpened({ prev_shift_id: previous })));
    expect((next.payload as { prev_shift_id: unknown }).prev_shift_id).toBe(previous);
  });

  // RED at authorship. The concurrent-open case `26 §7` calls ordinary: both opens name the
  // same predecessor, so the fork is visible IN THE EVENT SET rather than needing a clock.
  //
  // Everything asserted here is decided by the SCHEMA. An earlier draft round-tripped the two
  // payloads and matched them against the test's own input, which is a tautology with respect
  // to the subject under test: it passed against a `shift.opened` schema emptied to
  // `z.looseObject({})`. What the schema actually decides about the fork is who may DROP the
  // link and what may stand in for one.
  it("26 §7: two devices opening a shift after a partition both parse, and NEITHER may drop the link that makes the fork visible", () => {
    const previous = newId();
    const a = shiftOpened({ prev_shift_id: previous });
    const b = shiftOpened({ prev_shift_id: previous });
    expect(a.shift_id, "anchor: the two opens must really be different shifts").not.toBe(
      b.shift_id,
    );
    // The accept side: two opens naming ONE predecessor is the ordinary offline case, not an
    // error. A schema that refused the fork would make the partition unemittable.
    anchor("shift.opened", a);
    anchor("shift.opened", b);
    // The refuse side. If EITHER device may omit the link, the fork stops being visible in the
    // event set and the fold is back to a clock or an id comparison (01-F45, 01-F34) for the
    // exact case `26 §7` wrote the link to resolve. Asserted per device because "required"
    // holds for both arms of a fork or it holds for neither.
    for (const [device, payload] of [
      ["A", a],
      ["B", b],
    ] as const) {
      refuse(
        "shift.opened",
        without(payload, "prev_shift_id"),
        `device ${device}'s arm of the fork naming no predecessor`,
        "prev_shift_id",
      );
    }
    // And the link is the predecessor's IDENTITY, not a position. A device that numbered its
    // shifts locally would hand each arm of the fork a different value for the same
    // predecessor — ordering metadata smuggled into a carried key, which is the `01-F34` break
    // in its most plausible form.
    refuse(
      "shift.opened",
      { ...b, prev_shift_id: 2 },
      "a device-local ordinal standing in for the predecessor's id",
      "prev_shift_id",
    );
  });
});

describe("shift.closed — expected by method, counted, over/short (02-F23, 26 §7)", () => {
  // GREEN at authorship — pins this file's transcription of `02-F12`+`01-F32` against the
  // shipped enum, so the by-method assertions below cannot be satisfied by a drifted set.
  it("02-F12/01-F32: the tender vocabulary this file groups by is the shipped PAYMENT_METHODS set", () => {
    // One assertion, not two: a `toHaveLength(5)` on `SPEC_PAYMENT_METHODS` checks a local
    // constant against itself and is subsumed by the equality above, which already fails if
    // either side gains or loses a tender.
    expect([...PAYMENT_METHODS].sort()).toEqual([...SPEC_PAYMENT_METHODS].sort());
  });

  // RED at authorship.
  it("02-F23: shift.closed carries the shift it closes", () => {
    anchor("shift.closed", shiftClosed());
    refuse(
      "shift.closed",
      without(shiftClosed(), "shift_id"),
      "a close naming no shift",
      "shift_id",
    );
  });

  // RED at authorship. THE trap the brief names: "A single scalar 'expected cash' passes a
  // naive test and is wrong for four of the five tenders" — `01-F32`/`DEC-MONEY-007` make
  // `aggregator_receivable` and `khata_credit` behave differently in conservation, so a
  // collapsed scalar cannot be un-collapsed later.
  it("02-F23: the expected figure is BY METHOD — a single scalar expected-cash is refused", () => {
    anchor("shift.closed", shiftClosed());
    refuse(
      "shift.closed",
      without(shiftClosed(), "expected_paisa_by_method"),
      "a close with no expected figure at all",
      "expected_paisa_by_method",
    );
    refuse(
      "shift.closed",
      shiftClosed({ expected_paisa_by_method: 173_000 }),
      "a single scalar in place of the per-method breakdown",
      "expected_paisa_by_method",
    );
    // The likeliest shape of the same mistake: the scalar under a different name, with the
    // breakdown simply absent. `z.looseObject` would let the extra through, so the refusal
    // has to come from the missing map.
    refuse(
      "shift.closed",
      { ...without(shiftClosed(), "expected_paisa_by_method"), expected_cash_paisa: 173_000 },
      "a scalar expected-cash smuggled in under another name",
      "expected_paisa_by_method",
    );
  });

  // RED at authorship. Pin 5: exhaustive over the closed set, and closed against anything
  // outside it — the same argument `02-F42` cites for closing `payment.recorded.method`.
  it("02-F23/01-F32: the by-method map covers every tender and admits no sixth category", () => {
    anchor("shift.closed", shiftClosed());
    // The refusal names the MISSING KEY, not the map. Verified against Zod 4.4.3 rather than
    // assumed: a required child that is absent reports `invalid_type` at the child's own path
    // (`expected_paisa_by_method.card`), under every shape a correct implementation could pick
    // here — `z.object`, `z.strictObject` and `z.record(z.enum(PAYMENT_METHODS), …)` all agree.
    // Asserting the parent path instead makes this loop unsatisfiable by ANY implementation,
    // which is a permanently-red test rather than a strict one.
    for (const method of SPEC_PAYMENT_METHODS) {
      refuse(
        "shift.closed",
        shiftClosed({ expected_paisa_by_method: without(expectedByMethod(), method) }),
        `an expected map missing ${method} — "no ${method} sales" and "never computed" must not look alike`,
        `expected_paisa_by_method.${method}`,
      );
    }
    for (const bogus of ["tip", "voucher", "Cash", "cash_out", "aggregator"]) {
      refuse(
        "shift.closed",
        shiftClosed({ expected_paisa_by_method: { ...expectedByMethod(), [bogus]: 100 } }),
        `an expected map carrying the off-catalog method ${bogus}`,
        "expected_paisa_by_method",
      );
    }
  });

  // RED at authorship. 00 §6: integer paisas, no floats in ledgers ever.
  it("00 §6: every expected figure is integer paisa — a float is refused, naming the method it arrived on", () => {
    anchor("shift.closed", shiftClosed());
    refuse(
      "shift.closed",
      shiftClosed({ expected_paisa_by_method: expectedByMethod({ cash: 1250.5 }) }),
      "a fractional expected-cash figure",
      "expected_paisa_by_method.cash",
    );
    refuse(
      "shift.closed",
      shiftClosed({ counted_cash_paisa: 1244.99 }),
      "a fractional counted figure",
      "counted_cash_paisa",
    );
    refuse(
      "shift.closed",
      shiftClosed({ variance_paisa: -5.5 }),
      "a fractional over/short figure",
      "variance_paisa",
    );
  });

  // RED at authorship. `26 §7`: "over/short ... a **carried fact**". The counted figure and the
  // expected figure the cashier was SHOWN are both facts at close time; a fold that recomputes
  // "expected" at read time silently changes a number the cashier already signed off once a
  // late payment arrives, which `01-F1` forbids. At the schema layer that law is exactly this:
  // both figures are required on the event, so no consumer can be forced to re-derive them.
  it("02-F23/26 §7: the counted figure and the over/short are CARRIED — a close missing either is refused", () => {
    anchor("shift.closed", shiftClosed());
    refuse(
      "shift.closed",
      without(shiftClosed(), "counted_cash_paisa"),
      "a close with no counted cash",
      "counted_cash_paisa",
    );
    refuse(
      "shift.closed",
      without(shiftClosed(), "variance_paisa"),
      "a close with no recorded over/short",
      "variance_paisa",
    );
  });

  // RED at authorship. Pin 2, and the reason it is a pin rather than a preference: "over/short"
  // is two directions. A `.nonnegative()` variance can record an over and cannot record a
  // short, which is the half that costs a cashier their job.
  it("02-F23: over/short is SIGNED — a short (negative), an over (positive) and a clean drawer (zero) all parse", () => {
    for (const [variance_paisa, what] of [
      [-500, "short by Rs 5.00"],
      [500, "over by Rs 5.00"],
      [0, 'clean — the "I\'m clean" case 02-F23 names'],
    ] as const) {
      const event = parseEvent(envelope("shift.closed", shiftClosed({ variance_paisa })));
      expect(
        (event.payload as { variance_paisa: unknown }).variance_paisa,
        `a drawer ${what} must survive parse with its direction intact`,
      ).toBe(variance_paisa);
    }
  });
});

describe("day.opened / day.closed (02-F22, 02-F24)", () => {
  // RED at authorship.
  it("02-F22: day.opened carries the day and its opening float in integer paisa", () => {
    anchor("day.opened", dayOpened());
    refuse("day.opened", without(dayOpened(), "day_id"), "a day open with no id", "day_id");
    refuse(
      "day.opened",
      without(dayOpened(), "opening_float_paisa"),
      "a day open with no float entry — 02-F22 makes the float the entry itself",
      "opening_float_paisa",
    );
    refuse(
      "day.opened",
      dayOpened({ opening_float_paisa: 5000.5 }),
      "a fractional opening float",
      "opening_float_paisa",
    );
    // Pin 3: a magnitude. Cash is physically placed in the drawer; a negative float is not a
    // smaller float, it is a different event that no FR describes.
    refuse(
      "day.opened",
      dayOpened({ opening_float_paisa: -1 }),
      "a negative opening float",
      "opening_float_paisa",
    );
    // Zero is legal and distinct from absent: a day opened on an empty drawer.
    expect(
      parseEvent(envelope("day.opened", dayOpened({ opening_float_paisa: 0 }))).payload,
    ).toMatchObject({ opening_float_paisa: 0 });
  });

  // RED at authorship. `26 §7` names "duplicate shift/day open" as ONE row — the day needs the
  // same carried causal link as the shift, for the same reason (pin 4).
  it("26 §7: day.opened carries prev_day_id, required and nullable — the branch's first day has no predecessor", () => {
    anchor("day.opened", dayOpened());
    refuse(
      "day.opened",
      without(dayOpened(), "prev_day_id"),
      "a day open with no causal link at all",
      "prev_day_id",
    );
    const first = parseEvent(envelope("day.opened", dayOpened({ prev_day_id: null })));
    expect((first.payload as { prev_day_id: unknown }).prev_day_id).toBeNull();
    const previous = newId();
    const next = parseEvent(envelope("day.opened", dayOpened({ prev_day_id: previous })));
    expect((next.payload as { prev_day_id: unknown }).prev_day_id).toBe(previous);
  });

  // RED at authorship.
  it("02-F24: day.closed carries the day it closes and the manager's cash count in integer paisa", () => {
    anchor("day.closed", dayClosed());
    refuse("day.closed", without(dayClosed(), "day_id"), "a day close naming no day", "day_id");
    refuse(
      "day.closed",
      without(dayClosed(), "counted_cash_paisa"),
      "a day close with no cash count — 02-F24 makes the count the act",
      "counted_cash_paisa",
    );
    refuse(
      "day.closed",
      dayClosed({ counted_cash_paisa: 18_750.25 }),
      "a fractional day cash count",
      "counted_cash_paisa",
    );
  });

  // The business-date derivation used to have a test here. It is gone, not renamed — see the
  // header's DELIBERATELY NOT COVERED block for why a schema file has nothing to say about it.
});

describe("cash.drawer_opened / paid_out / deposit_recorded (02-F21, 02-F24, 02-F26)", () => {
  // RED at authorship. `02-F21`: "No-sale drawer opens: `cash.drawer_opened` with
  // `reason=no_sale`, logged and counted (classic theft vector)". The set is NOT closed here
  // (pin 6) — only the one value the FR names is asserted accepted.
  it("02-F21: cash.drawer_opened carries a reason, and reason=no_sale — the theft-vector case — is one of them", () => {
    const event = parseEvent(envelope("cash.drawer_opened", drawerOpened({ reason: "no_sale" })));
    expect((event.payload as { reason: unknown }).reason).toBe("no_sale");
    refuse(
      "cash.drawer_opened",
      without(drawerOpened(), "reason"),
      "a drawer open with no reason — an uncounted no-sale is the vector itself",
      "reason",
    );
    refuse("cash.drawer_opened", drawerOpened({ reason: "" }), "an empty reason", "reason");
  });

  // RED at authorship. `02-F22`: "A shift binds subsequent cash settlements **and drawer
  // events** to that cashier"; `26 §7`: "shift/day/**drawer** bucketing of a payment ... a
  // carried key". Nullability is NOT asserted here — `02-F37` names the null case for
  // settlements only, and extending it to drawer events would be inventing an FR. Reported as
  // a finding instead.
  it("02-F22/26 §7: cash.drawer_opened carries its shift key — the bucket is carried, never resolved from the reading device", () => {
    anchor("cash.drawer_opened", drawerOpened());
    refuse(
      "cash.drawer_opened",
      without(drawerOpened(), "shift_id"),
      "a drawer open with no shift key",
      "shift_id",
    );
    const shift = newId();
    const event = parseEvent(envelope("cash.drawer_opened", drawerOpened({ shift_id: shift })));
    expect((event.payload as { shift_id: unknown }).shift_id).toBe(shift);
  });

  // RED at authorship. `02-F26`: "Paid-outs/petty cash: reason + receipt photo (object storage
  // ref) → `cash.paid_out`". The amount is not in the FR's word list and is required anyway:
  // `02-F23`'s "system-expected cash" cannot be computed if cash can leave the drawer without
  // saying how much. Reported as a finding against the FR.
  it("02-F26: cash.paid_out carries an integer-paisa amount, a reason and the receipt ref", () => {
    anchor("cash.paid_out", paidOut());
    for (const field of ["amount_paisa", "reason", "receipt_photo_ref"] as const) {
      refuse("cash.paid_out", without(paidOut(), field), `a paid-out with no ${field}`, field);
    }
    refuse(
      "cash.paid_out",
      paidOut({ amount_paisa: 350.5 }),
      "a fractional paid-out",
      "amount_paisa",
    );
    // Pin 3: a magnitude, direction from the event type. A negative paid-out is a deposit
    // wearing a disguise and would net against the drawer in the wrong direction.
    refuse("cash.paid_out", paidOut({ amount_paisa: -1 }), "a negative paid-out", "amount_paisa");
    refuse("cash.paid_out", paidOut({ reason: "" }), "an empty paid-out reason", "reason");
  });

  // RED at authorship.
  it("02-F26/26 §7: cash.paid_out carries its shift key — petty cash leaves a particular cashier's drawer", () => {
    anchor("cash.paid_out", paidOut());
    refuse(
      "cash.paid_out",
      without(paidOut(), "shift_id"),
      "a paid-out with no shift key",
      "shift_id",
    );
  });

  // RED at authorship. `02-F24`: the deposit record is emitted with the day close, so it
  // buckets to a day (`26 §7`: "shift/day/drawer bucketing ... a carried key").
  it("02-F24: cash.deposit_recorded carries an integer-paisa amount and the day it belongs to", () => {
    anchor("cash.deposit_recorded", depositRecorded());
    refuse(
      "cash.deposit_recorded",
      without(depositRecorded(), "amount_paisa"),
      "a deposit with no amount",
      "amount_paisa",
    );
    refuse(
      "cash.deposit_recorded",
      without(depositRecorded(), "day_id"),
      "a deposit belonging to no day",
      "day_id",
    );
    refuse(
      "cash.deposit_recorded",
      depositRecorded({ amount_paisa: 15_000.75 }),
      "a fractional deposit",
      "amount_paisa",
    );
    refuse(
      "cash.deposit_recorded",
      depositRecorded({ amount_paisa: -1 }),
      "a negative deposit",
      "amount_paisa",
    );
  });
});

describe("the shift key on payment.recorded (ORCHESTRATOR RULING; 26 §7, 02-F37, 01-F60)", () => {
  // RED at authorship: `payment.recorded` has no `shift_id` today, so a payment carrying no
  // shift key parses cleanly and the fold is left to ask "which shift was open when this
  // arrived?" — the reading-device read `26 §7` names as the law-1 break most often made by
  // accident. See the header for the full three-part ruling.
  it("ORCHESTRATOR RULING (26 §7): payment.recorded.shift_id is REQUIRED — an omitted shift key is refused, never defaulted", () => {
    anchor("payment.recorded", paymentRecorded());
    refuse(
      "payment.recorded",
      without(paymentRecorded(), "shift_id"),
      "a settlement that never says which shift it belongs to",
      "shift_id",
    );
    refuse(
      "payment.recorded",
      paymentRecorded({ shift_id: "" }),
      "an empty shift key — a key, not a flag",
      "shift_id",
    );
  });

  // GREEN at authorship — `z.looseObject` already passes an undeclared `shift_id: null`
  // through. Pinned because `02-F37` INVERTS the reflex and a closure that overshoots here is
  // the likeliest way to break it: "Settling with no shift open succeeds ... recorded with a
  // null shift reference plus an `unbound_settlement` anomaly ... Never a modal, never a
  // block." A test asserting that this path throws would assert the exact opposite of the FR.
  it("02-F37: settling with NO shift open SUCCEEDS with a null shift reference — never a modal, never a block", () => {
    const payload = paymentRecorded({ shift_id: null });
    const event = parseEvent(envelope("payment.recorded", payload));
    expect(event.type).toBe("payment.recorded");
    expect(
      (event.payload as { shift_id: unknown }).shift_id,
      "02-F37: the null reference is the record that it happened, not an absence",
    ).toBeNull();
    // 01-F17 anchor: the sale's money survives the unbound path unchanged.
    expect(event.payload).toMatchObject({
      amount_paisa: payload.amount_paisa,
      method: "cash",
      purpose: "settles_order",
    });
  });

  // GREEN at authorship — `EventEnvelope` is a strict `z.object`, so it strips unknown keys.
  // Pinned because it is what makes "carried" mechanically true rather than merely intended:
  // there is no envelope-level route by which a shift key could reach the payload, so the only
  // possible source is the payload itself (`26 §7` — a carried key, not the reader's state).
  it("26 §7: the shift key can only come from the PAYLOAD — the envelope has no route to supply one", () => {
    const carried = newId();
    const decoy = newId();
    const event = parseEvent(
      envelope("payment.recorded", paymentRecorded({ shift_id: carried }), { shift_id: decoy }),
    );
    expect((event.payload as { shift_id: unknown }).shift_id).toBe(carried);
    expect(
      Object.hasOwn(event.envelope, "shift_id"),
      "the envelope must not carry a shift key at all, or two sources would disagree",
    ).toBe(false);
  });
});
