/**
 * ACCEPTANCE TESTS — `02-F20`'s FOUR ESCALATABLE WRITES get the payload schemas `01-F4` requires.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** This file was written by a session that read
 * `specs/02-pos-app.md`, `specs/05-manager-console.md`, `specs/01-kernel-sync.md` and
 * `specs/26-merge-semantics.md` and did not write the implementation it describes. It is the
 * oracle for that work (`24 §3` step 2) and is read-only to the implementing session.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   02-F20  "Manager escalation required for: void after KOT, comp, discount above org threshold,
 *           price override (`order.line_price_overridden`, extension §5) … the recorded event
 *           carries actor + approver either way."
 *   01 §4   "`void.recorded / comp.recorded / discount.recorded` (†removal pre-KOT is a plain
 *           event; post-KOT it must be a `void.recorded` with approver)". The four types are in
 *           the catalog; only the schemas were missing.
 *   01-F4   "The event-type catalog and payload schemas live in `packages/domain` (Zod).
 *           Producing an unknown/invalid event type is a build-time and runtime error." So a
 *           catalog entry with no schema is not *unbuilt* — it is **unemittable**.
 *   05-F29  "Three of the four escalatable writes … still have no payload schema, so `01-F4`
 *           makes them unemittable." (Its arithmetic says three; the FR lists four, and `05-F28`
 *           names all four as schema-less. §A measures the tree rather than the sentence.)
 *   01-F30  "per order, `Σ tendering payments − Σ refunds = billed_total − void_value −
 *           comp_value − discounts`" — three RHS terms, one per type, all money, all per ORDER.
 *   26 §    "`void/comp/discount.recorded` … have **no payload schema at all** — three of the
 *           four RHS terms of `01-F30` therefore evaluate to zero today."
 *   05-F5   the interrupt card shows "order/line refs, item names, amounts" and a "stated reason".
 *   05-F7   `approval.requested`'s payload is `{ …, amount_paisa, reason: min(1), … }` — the
 *           request's reason is REQUIRED, so an escalatable act that states none cannot produce a
 *           legal request. That is why §D requires `reason` on the WRITE.
 *   02-F45  attribution is read from the ENVELOPE, never from a payload field. The approver is
 *           therefore a payload field and the actor is not — two identities, two homes.
 *
 * ## THE CASE THAT MATTERS, stated so the round-3 law can be checked against this file
 *
 * It is **not** "does a schema reject a missing field" — every Zod object does that, and a suite
 * of those passes against any implementation of anything. It is `02-F41`/`02-F20`: **an escalated
 * write carries TWO identities in two different places, and neither may absorb the other.** The
 * ACTOR is the cashier and lives on the envelope, stamped at append from the live session; the
 * APPROVER is the manager and lives in the payload, because the envelope has exactly one identity
 * slot. §B is the assertion that both survive, separately, on one parsed event.
 *
 * The plausible wrong implementations §B is aimed at, each a one-branch mutant:
 *   (1) `approver_user_id` left UNDECLARED — today's shape, where it survives only as a
 *       `looseObject` extra. It parses, so nothing fails; but an undeclared field is not a
 *       contract, and `05-F6`'s "carries actor + approver" then rests on one call site in one app.
 *   (2) `approver_user_id` declared `.optional()` — a forgotten field and a stated absence become
 *       indistinguishable, which is the exact reasoning `payment.recorded.shift_id` already
 *       records for `null`-vs-`undefined` in this same file.
 *   (3) `approver_user_id` declared NON-nullable — see §B's PINNED INTERPRETATION: it makes a
 *       branch manager's own void unemittable, i.e. `01-F4` refusing an act the shipped
 *       permission matrix says she may perform outright.
 *
 * ## PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — `approver_user_id` is REQUIRED and NULLABLE on all four.** `01 §4`'s parenthetical
 * ("post-KOT it must be a `void.recorded` with approver") reads as *always approved*, and it
 * cannot be, because `packages/domain/src/permissions.ts` ships
 * `order.void_after_kot: { cashier: "escalate", branch_manager: "allow", owner: "allow" }` —
 * a manager voids **unsupervised**, so there is no second identity to record and no escalation
 * happened. A non-nullable field would make that legal act throw at `parseEvent` inside
 * `store.append`. `null` therefore means *"no approval was involved"* and `undefined` means
 * *"a writer forgot"*; an optional field cannot tell those apart. This is the `shift_id` /
 * `prev_shift_id` precedent one event family over.
 *
 * **P2 — the money is a MAGNITUDE (non-negative), and direction comes from the event type.**
 * `01-F30` subtracts all three terms; a negative void would ADD to the bill through a minus sign,
 * silently, in a ledger `01-F1` forbids correcting in place. `cash.paid_out`'s schema already
 * records this reasoning verbatim ("a negative paid-out is a deposit in disguise").
 *
 * **P3 — `reason` is required on all four.** `05-F5` requires the interrupt card to show a
 * "stated reason", and `05-F7`'s already-shipped `approval.requested.reason` is `min(1)`. The
 * request is derived from the act, so an act carrying no reason makes a legal `approval.requested`
 * unconstructible without INVENTING words — which commandment 2 forbids and which this repo has
 * already had to refuse once (`CATALOG_REFUSAL_WORDS` needed an FR before it could exist). Doc 04's
 * void flow ("waiter requests void **with reason**") and `01-F29`'s `reason` on refunds are the
 * same requirement one surface over.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN, and why
 *
 * - **A `line_id` on void/comp/discount.** `05-F5` says "order/line refs" and `00 §6` puts soft
 *   references on the ENVELOPE's `refs[]`; `01-F29`'s "a food-return refund links its
 *   `void.recorded`" is an envelope link too. Requiring a payload line key would be a second
 *   place to say what an act touches, and two can disagree. `looseObject` lets a writer add one
 *   additively the day an FR asks for it.
 * - **`campaign_id` on `discount.recorded`.** `17-F17` calls it "additive under the same schema
 *   version"; `looseObject` already carries it and declaring it now would be doc 17's work.
 * - **The FOLD's treatment of these four.** `26 §7` requires an oracle-pinned merge rule before
 *   the engine may consume a new `KnownEventType`, and `merge.ts`'s `assertNever` makes registry
 *   growth a COMPILE error. That is a stronger guarantee than any assertion here and it belongs
 *   to `packages/sync-client`'s oracle, not to this file.
 */

import { describe, expect, it } from "vitest";
import { parseEvent, UnknownEventTypeError } from "../index.js";

/** A minimal legal envelope. `type`, `payload` and `actor_user_id` are what vary here. */
const envelope = (
  type: string,
  payload: unknown,
  actor_user_id: string | null = CASHIER,
): unknown =>
  ({
    id: "0193b0f0-0000-7000-8000-000000000009",
    org_id: "org-1",
    branch_id: "branch-1",
    device_id: "device-counter-1",
    actor_user_id,
    lamport_seq: 7,
    device_created_at: 1_755_000_000_000,
    branch_created_at: 1_755_000_000_000,
    time_basis: "branch",
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  }) as unknown;

const CASHIER = "user-ayesha";
const MANAGER = "user-hina";

/** `05 §5`'s own worked magnitude, in integer paisa (`00 §6`). */
const AMOUNT = 45_000;

const VOID = {
  order_id: "order-1",
  amount_paisa: AMOUNT,
  reason: "customer changed their mind after the KOT",
  approver_user_id: MANAGER,
};
const COMP = { ...VOID, reason: "cold when it reached the table" };
const DISCOUNT = { ...VOID, reason: "regular, 10% off the bill" };
const OVERRIDE = {
  order_id: "order-1",
  line_id: "line-3",
  unit_price_paisa: 32_000,
  reason: "price agreed with the owner for the wedding party",
  approver_user_id: MANAGER,
};

/** The three money-carrying `*.recorded` acts — everything §C and §D say holds for all three. */
const RECORDED: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["void.recorded", VOID],
  ["comp.recorded", COMP],
  ["discount.recorded", DISCOUNT],
];

/** All four of `02-F20`'s acts, with the money key each one carries. */
const ESCALATABLE: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ...RECORDED,
  ["order.line_price_overridden", OVERRIDE],
];

const parses = (
  type: string,
  payload: unknown,
  actor?: string | null,
): ReturnType<typeof parseEvent> => parseEvent(envelope(type, payload, actor));

/**
 * A refusal that is ANCHORED ON THE SCHEMA, never on `01-F4`.
 *
 * ⚠ This helper's second assertion is load-bearing and was added because the first draft measured
 * itself: with a bare `.toThrow()`, **29 of this file's 63 assertions PASSED against the tree that
 * has no schema for these types at all** — every "is refused" test was satisfied by
 * `UnknownEventTypeError`, i.e. by the very defect the file exists to close. That is the round-3
 * failure exactly: the mechanism was right and pointed one type-check away from the case that
 * matters. Worse, it would survive a PARTIAL implementation — register `void.recorded` alone and
 * every comp/discount/override refusal below goes on passing vacuously.
 */
const refuses = (type: string, payload: unknown): void => {
  let thrown: unknown = null;
  try {
    parseEvent(envelope(type, payload));
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `${type} accepted a payload it must refuse`).toBeInstanceOf(Error);
  expect(
    thrown,
    `${type} was refused by 01-F4 (no schema at all), not by its schema — this assertion is vacuous`,
  ).not.toBeInstanceOf(UnknownEventTypeError);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `01-F4`: the four types are EMITTABLE at all. This is the state the FR was in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F4/02-F20 — the four escalatable writes parse rather than throwing at emit", () => {
  /**
   * Before this change every one of these threw `UnknownEventTypeError` from `parseEvent`, which
   * `store.append` runs on every append — so `02-F20`'s four acts were not merely unbuilt, they
   * could not reach a ledger at all, and `05-F19`'s paid-out was the only act an approval could
   * complete. `apps/pos-electron/src/main/authorize.ts` maps three of them to matrix actions
   * *ahead of their events* and says so at `WRITE_ACTIONS`, precisely because of this hole.
   */
  it.each(ESCALATABLE)("%s carries a payload schema", (type, payload) => {
    expect(parses(type, payload).type).toBe(type);
  });

  it("an unrelated catalog type with no schema still throws — this file did not open the gate", () => {
    // `01 §4` carries `order.parked` and `order.rejected` too, and `apps/pos-electron`'s guide
    // records both as blocked on exactly this. If registering four types quietly registered
    // everything, that would be indistinguishable here from the change actually made.
    expect(() => parseEvent(envelope("order.parked", { order_id: "order-1" }))).toThrow(
      UnknownEventTypeError,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — TWO IDENTITIES (02-F20 / 02-F41 / 02-F45). The assertion this file exists for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F20 — the ACTOR is on the envelope and the APPROVER is in the payload", () => {
  /**
   * **THE `02-F41` ASSERTION.** `02-F20` wants "actor + approver"; `02-F41` rules that attribution
   * is whoever's PIN is in, with no "acting for" concept; `02-F45` forbids duplicating the actor
   * into the payload. Together those fix the shape exactly: the cashier is the envelope's
   * `actor_user_id` and the manager is a payload field, and a parsed event must hand back BOTH,
   * distinctly, from ONE event.
   *
   * The mutant this kills is the collapse in either direction — an implementation that recorded
   * only the approver (the local path's `unlock()`-moves-the-session defect, one layer down) or
   * only the actor (`05-F6`'s "every decision is fully logged" unmet).
   */
  it.each(ESCALATABLE)("%s: one event, two identities, neither absorbing the other", (type, p) => {
    const parsed = parses(type, p, CASHIER);
    expect(parsed.envelope.actor_user_id).toBe(CASHIER);
    expect((parsed.payload as Record<string, unknown>).approver_user_id).toBe(MANAGER);
  });

  it.each(ESCALATABLE)("%s: the approver key is DECLARED, so omitting it is refused", (type, p) => {
    // Mutant (1): leave it undeclared and let `looseObject` carry it. That parses — which is the
    // whole problem, because then "the recorded event carries actor + approver" is a promise made
    // by one call site in one app rather than by the catalog `01-F4` validates against.
    const { approver_user_id: _dropped, ...noApprover } = p;
    refuses(type, noApprover);
  });

  it.each(ESCALATABLE)("%s: an UNAPPROVED act states `null`, and it parses (P1)", (type, p) => {
    // Mutant (3): non-nullable. `permissions.ts` ships `branch_manager: "allow"` for
    // `order.void_after_kot`, `order.comp_item`, `order.discount_above_threshold` and
    // `order.price_override`, so a manager performs all four unsupervised and there is no second
    // identity to name. A non-nullable field makes her own void throw inside `store.append`.
    expect(parses(type, { ...p, approver_user_id: null }).type).toBe(type);
  });

  it.each(ESCALATABLE)("%s: an EMPTY approver is refused, not treated as absent", (type, p) => {
    // `""` is neither an identity nor the stated `null`. Accepting it would put an event claiming
    // an approval into an append-only ledger with nobody to attribute it to.
    refuses(type, { ...p, approver_user_id: "" });
  });

  /**
   * THE CONTROL for §B, and without it the refusals above prove only that Zod refuses missing
   * keys. An act whose envelope actor EQUALS its payload approver still parses: `02-F38` ("a
   * requester never sees an approve control for their own request … refused server-side by the
   * `domain` permission matrix") is the MATRIX's refusal, not the schema's, and `can()` already
   * performs it against `requested_by_user_id`. Pinning it in both places would be two readings of
   * one rule — which is the failure `authorize.ts` avoids by asking `can()` on both routes.
   *
   * This test is what says so out loud, so a future session does not "harden" the schema with a
   * refinement that duplicates `permissions.ts`.
   */
  it("a self-approved act PARSES — 02-F38 is the matrix's refusal, deliberately not the schema's", () => {
    expect(parses("void.recorded", { ...VOID, approver_user_id: CASHIER }, CASHIER).type).toBe(
      "void.recorded",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `01-F30`'s money. Three RHS terms that evaluate to zero until these fields exist.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F30/00 §6 — the money is required, per order, integer paisa, and a magnitude", () => {
  it.each(RECORDED)("%s carries the value it removes from the bill", (type, p) => {
    expect((parses(type, p).payload as Record<string, unknown>).amount_paisa).toBe(AMOUNT);
  });

  it.each(RECORDED)(
    "%s without an amount is refused — the term cannot be zero by accident",
    (t, p) => {
      // `26 §` names this exact consequence: with no schema, "three of the four RHS terms of
      // `01-F30` therefore evaluate to zero today". A schema that made the amount optional would
      // keep that true for any writer that forgot it, which is the same outcome by a quieter route.
      const { amount_paisa: _dropped, ...noAmount } = p;
      refuses(t, noAmount);
    },
  );

  it.each(RECORDED)("%s refuses a NEGATIVE amount (P2 — direction is the event type)", (t, p) => {
    refuses(t, { ...p, amount_paisa: -AMOUNT });
  });

  it.each(RECORDED)(
    "%s refuses a fractional amount (commandment 3 — no floats in ledgers)",
    (t, p) => {
      refuses(t, { ...p, amount_paisa: 450.5 });
    },
  );

  it.each(RECORDED)("%s accepts a ZERO amount — 0 is a stated fact, not an absence", (t, p) => {
    // `01-F60`'s explicit-zero reasoning: a Rs 0 comp (a remake at no cost recorded for doc 12's
    // attribution block) is a real act, and refusing it would push it out of the ledger entirely.
    expect(parses(t, { ...p, amount_paisa: 0 }).type).toBe(t);
  });

  it.each(ESCALATABLE)("%s is keyed to an ORDER — 01-F30 conservation is per order", (type, p) => {
    // `26 §3`'s projection-key sidecar answers `order:<payload.order_id>` for every order-keyed
    // event; an act with no order key reaches no projection at all and cannot be conserved
    // against anything.
    const { order_id: _dropped, ...noOrder } = p;
    refuses(type, noOrder);
    expect((parses(type, p).payload as Record<string, unknown>).order_id).toBe("order-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `05-F5`'s stated reason (P3), and the price override's own two fields.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 05-F5/05-F7 — every escalatable act states a reason a manager can read", () => {
  it.each(ESCALATABLE)("%s carries the reason", (type, p) => {
    expect((parses(type, p).payload as Record<string, unknown>).reason).toBe(p.reason);
  });

  it.each(ESCALATABLE)("%s without a reason is refused (P3)", (type, p) => {
    const { reason: _dropped, ...noReason } = p;
    refuses(type, noReason);
  });

  it.each(ESCALATABLE)("%s refuses an EMPTY reason — 05-F7's request is min(1)", (type, p) => {
    // The consequence is mechanical, not stylistic: `approval.requested.reason` is
    // `z.string().min(1)` and its only honest source is the act. An empty string here makes a
    // legal request unconstructible unless something INVENTS words for it (commandment 2).
    refuses(type, { ...p, reason: "" });
  });
});

describe("§E 02-F20 — `order.line_price_overridden` names the LINE and the price it becomes", () => {
  it("carries the line key and the new unit price", () => {
    const payload = parses("order.line_price_overridden", OVERRIDE).payload as Record<
      string,
      unknown
    >;
    expect(payload.line_id).toBe("line-3");
    expect(payload.unit_price_paisa).toBe(32_000);
  });

  it("refuses an override that names no line", () => {
    // Unlike a void, an override is definitionally about ONE line: `01-F53` snapshots
    // `unit_price_paisa` into `order.line_added` per line, and an override with no line key names
    // no number it could be replacing.
    const { line_id: _dropped, ...noLine } = OVERRIDE;
    refuses("order.line_price_overridden", noLine);
  });

  it("refuses an override that names no price, and refuses a negative one", () => {
    const { unit_price_paisa: _dropped, ...noPrice } = OVERRIDE;
    refuses("order.line_price_overridden", noPrice);
    refuses("order.line_price_overridden", { ...OVERRIDE, unit_price_paisa: -1 });
  });

  it("accepts ZERO — 01-F60's explicit zero is what makes 'free' distinguishable from 'forgotten'", () => {
    expect(parses("order.line_price_overridden", { ...OVERRIDE, unit_price_paisa: 0 }).type).toBe(
      "order.line_price_overridden",
    );
  });

  /**
   * ANTI-SCOPE, recorded here rather than asserted, because the honest form of the claim is
   * "nothing REQUIRES a `before_unit_price_paisa`" and §A already proves that by parsing an
   * override which carries none. A before/after pair would be a second source for a number
   * `order.line_added` already holds under `01-F1`, and the two could never be reconciled by an
   * edit. `14-F3`'s `CatalogPriceChange` carries before/after for the opposite reason: a catalog
   * cell has no event to read its previous value from, and a line does.
   */
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — additive evolution stays open (00 §6), and the four are the ONLY types this change added.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 00 §6 — required fields are law, declared extras are not invented", () => {
  it.each(ESCALATABLE)("%s tolerates an additive extra field", (type, p) => {
    // `17-F17` needs `campaign_id` on `discount.recorded` "additive under the same schema version";
    // `00 §6` makes that a `looseObject`, and pinning a strict object here would make doc 17's
    // change a breaking one.
    expect(parses(type, { ...p, campaign_id: "campaign-eid" }).type).toBe(type);
  });

  /**
   * ANTI-SCOPE. `02-F20` names four acts and `05-F19` names the fifth approvable one, which
   * already had a schema. Nothing else in `01 §4` gained one here — `order.rejected` (`C20`),
   * `order.parked`/`order.unparked` (`C10`) and `payment.split_recorded` are all recorded as
   * blocked on exactly this and all three are somebody else's FR.
   */
  it("the neighbours a session would be tempted to sweep in are still unregistered", () => {
    for (const type of ["order.rejected", "order.unparked", "payment.split_recorded"]) {
      expect(() => parseEvent(envelope(type, {}))).toThrow(UnknownEventTypeError);
    }
  });
});
