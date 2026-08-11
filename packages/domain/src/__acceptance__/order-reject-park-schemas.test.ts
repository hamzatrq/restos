/**
 * ACCEPTANCE TESTS — `C20` (`order.rejected`) and `C10` (`order.parked` / `order.unparked`) get the
 * payload schemas `01-F4` requires.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** This file was written by a session that read
 * `specs/02-pos-app.md`, `specs/06-storefront.md`, `specs/01-kernel-sync.md` and
 * `specs/26-merge-semantics.md` and did not write the implementation it describes. It is the oracle
 * for that work (`24 §3` step 2) and is read-only to the implementing session.
 *
 * ⚠ **`packages/domain` IS A PROTECTED PATH (`20 §4.4`, commandment 10).** Every pin below is a
 * change to the kernel's event catalog, which is append-only downstream: a field this file makes
 * REQUIRED can never be relaxed for events already written, and a field it leaves out can never be
 * made required later without refusing history (`01-F1`). The interpretations are stated as such,
 * loudly, in §0 — they are the part a senior reviewer should argue with.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   01 §4   "`order.created / confirmed / rejected / cancelled / … / parked / unparked / …`" — all
 *           three types have been catalog vocabulary since Wave 0. Only the schemas were missing.
 *   01-F4   "The event-type catalog and payload schemas live in `packages/domain` (Zod). Producing
 *           an unknown/invalid event type is a build-time and runtime error." A catalog entry with
 *           no schema is not *unbuilt* — it is **unemittable**.
 *   01 §4   (absorption note) "`order.rejected` (`02-F9`/`06-F20`) blocked a Wave-1 cashier task …
 *           **Absorption is not a formality; it is what makes an FR executable.**"
 *   02-F9   "**Reject** with a reason **from the 06-F20 list** → `order.rejected`."
 *   06-F20  "The branch may reject a queued order (`order.rejected`, reason: closed, item
 *           unavailable, out of delivery range); the status page states the reason plainly."
 *   06-F27  "…confirm partially after phoning the customer, or `order.rejected` with reason
 *           `item_unavailable`." — the corpus writing one of the three as a snake_case IDENTIFIER.
 *   06-F22  "`order.rejected / cancelled` produce a linked reversal metering event." Metering is
 *           "idempotent on order id", so a rejection that names no order cannot be reversed.
 *   02-F4   "Park/resume open orders: `order.parked` / `order.unparked`. A parked order is durable
 *           (00 §5.2) and **visible to every terminal in the branch**."
 *   02-F11  "an order started on one terminal can be **parked there and resumed, extended, or
 *           settled on another**."
 *   01-F34  folds "read no ordering metadata — no `global_seq`, no `lamport_seq`, no device clock,
 *           no envelope-id comparison that reaches a projected VALUE."
 *   02-F45  attribution is read from the ENVELOPE, never from a payload field.
 *
 * ## THE CASE THAT MATTERS, stated so the round-3 law can be checked against this file
 *
 * There are two, one per task, and neither is "does Zod refuse a missing key" — every Zod object
 * does that, and a suite of those passes against any implementation of anything.
 *
 * **C20's case is that `reason` is a CLOSED LIST and not a string.** `02-F9` says "a reason from
 * the 06-F20 list"; the tempting implementation is `z.string().min(1)`, which parses every legal
 * value this file asserts and *also* parses `"kitchen closed lol"`. That difference is not
 * cosmetic: `06-F20` puts the reason on a CUSTOMER-FACING status page ("the status page states the
 * reason plainly") on the other plane, and `01-F1` forbids editing it afterwards. §B is aimed at
 * the free-string mutant and nothing else — every refusal there is a value the FR does not list.
 *
 * **C10's case is that the toggle carries its own causal link.** `order.parked`/`order.unparked`
 * are the first REPEATABLE pair in the catalog: park → resume on another till (`02-F11`) → park
 * again. Under `01-F34` "latest wins" is unavailable (no clock, no seq, no id comparison), so the
 * only legal convergence is the one `availability.changed` and `order.table_assigned` already use —
 * each toggle names what it replaces. §C is aimed at the `{ order_id }`-only mutant. See P2.
 *
 * ## §0 — PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — `order.rejected.reason` is a CLOSED enum of exactly `06-F20`'s three values, spelled as
 * snake_case identifiers.** `02-F9`'s own words are "a reason **from the 06-F20 list**", and a list
 * of three named members is not a prompt for prose. The contrast case is in the registry already
 * and it is decisive: `cash.drawer_opened.reason` is deliberately OPEN, because "`02-F21` names one
 * value and implies others exist, and closing it here would be inventing an FR". `06-F20` names
 * THREE and calls them a list, so closing it is transcription and leaving it open is the invention.
 * `payment.recorded.method`'s note records the cost of the open version one family over: "a typo'd
 * method would not fail anywhere — it would quietly become a sixth category that no report knows to
 * count, in an append-only ledger where it cannot be corrected in place."
 *   *The simpler alternative, named rather than silently passed over:* `z.string().min(1)`. It is
 *   one line, it never blocks a cashier, and it is what this file would accept if `02-F9` had said
 *   "with a reason" instead of "with a reason from the 06-F20 list". It is refused because the
 *   consumer is a customer-facing page on the other plane and the record is uneditable.
 *
 * **P1a — the spellings are `closed`, `item_unavailable`, `out_of_delivery_range`.**
 * `item_unavailable` is not a choice: `06-F27`'s worked scenario writes it as a backticked
 * identifier. The other two are that same form applied to `06-F20`'s "closed" and "out of delivery
 * range". ⚠ `closed` is transcribed rather than improved — it means *the branch is closed*, and it
 * sits in a catalog that also has `day.closed`, `shift.closed` and `order.settlement_closed`. A
 * clearer `branch_closed` would be a word `06-F20` does not use (commandment 2). Display prose is
 * `06-F20`'s status page's job, on `06-F18`'s "display label, not a state" precedent.
 *
 * **P2 — `order.parked` and `order.unparked` each carry a REQUIRED `supersedes: string[]`, with
 * `[]` legal.** This is the interpretation to argue with, so here is the whole argument.
 *   (i) The pair is a REPEATABLE toggle on one order key — `02-F4` "park/resume", `02-F11` "parked
 *       there and resumed … on another". A set of bare `{order_id}` facts cannot tell a second park
 *       from the first, so the projected answer would have to come from arrival order, a clock, or
 *       an id comparison — all three banned by `01-F34`/`01-F45`.
 *   (ii) The corpus has already answered this exact shape twice, and says so in the registry:
 *       `availability.changed`'s note reads "`supersedes` is the carried causal link — the ONLY
 *       thing that makes this converge, exactly as for `order.table_assigned`. 'Latest wins' would
 *       need a clock or an id comparison, and both are banned from folds". Park/unpark is that
 *       shape with the boolean carried by the TYPE instead of by an `available` field.
 *   (iii) **The failure modes are asymmetric, and that is the actual reason.** If the field turns
 *       out to be unnecessary, the cost is a column that is always `[]`, and a required field can
 *       be relaxed later without refusing anything already written. If it is omitted and turns out
 *       necessary, it cannot be added as REQUIRED later — `01-F1` makes every historical
 *       `order.parked` unparseable — and adding it as `.optional()` permanently confuses "a root
 *       park" with "a writer forgot", which is the distinction `payment.recorded.shift_id` and
 *       `catalog.changed.price_changes` are both written up in this registry to preserve. One
 *       direction is recoverable and the other is not.
 *   *The simpler alternative, named:* `{ order_id }` alone, exactly what `02-F4` literally lists.
 *   It closes `01-F4` today and is what a strict reading of "minimum code that closes the FR"
 *   (`24 §3b`) asks for. It is refused for (iii) and for nothing else — not because a fold exists.
 *   **No fold reads either field today; see §E and the sync-client oracle.**
 *   *A STATED COST of P2, so it is not discovered later:* until a projection exists, an emitter has
 *   no head set to read, so every shipped park will honestly carry `[]`. That is a root, which is
 *   legal and is what `order.table_assigned` writes for a root assignment.
 *
 * **P3 — `order.rejected` carries NO `supersedes`, and the asymmetry with P2 is deliberate.**
 * A rejection is terminal and has no inverse anywhere in `01 §4` — `06-F19` puts post-confirmation
 * reversal on a phone call and a `void.recorded`, not on an un-reject event. It is the same
 * monotone shape as `order.confirmed`, whose schema is `{ order_id }` and which this file leaves
 * alone. Proved rather than asserted: §A parses a rejection that carries no `supersedes` at all.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN, and why
 *
 * - **Who rejected or parked.** `02-F45` reads attribution off the ENVELOPE, and a payload
 *   `rejected_by` would be a second home for one fact. §D asserts the envelope half instead.
 * - **A free-text note beside the closed reason.** No FR names one. `looseObject` (`00 §6`) lets a
 *   writer add one additively the day an FR asks for it, which is `discount.recorded`'s
 *   `campaign_id` precedent.
 * - **A park label / name / holder.** `02-F4` names none. A "park under a customer name" affordance
 *   is a POS feature nothing in doc 02 specifies.
 * - **Whether a rejected order leaves `open_orders`.** That is a FOLD question, `26 §7` makes it an
 *   oracle-pinned decision rather than an implementer's, and no FR decides it. The sync-client
 *   oracle records it as a stated DEBT; pinning a projection here would be guessing.
 * - **The `02-F9` Reject control and the `02-F10` recall control.** Out of scope by instruction, and
 *   `apps/pos-electron`'s `orders-tab.dom.test.tsx` §E is a live anti-scope oracle asserting an
 *   open-order row carries no control at all. This track lands the kernel half so the UI becomes
 *   buildable; it does not build it, and it does not touch that file.
 */

import { describe, expect, it } from "vitest";
import * as domain from "../index.js";
import { parseEvent, UnknownEventTypeError } from "../index.js";

const CASHIER = "user-ayesha";

/** A minimal legal envelope. `type`, `payload` and `actor_user_id` are what vary here. */
const envelope = (
  type: string,
  payload: unknown,
  actor_user_id: string | null = CASHIER,
): unknown =>
  ({
    id: "0193b0f0-0000-7000-8000-00000000002a",
    org_id: "org-1",
    branch_id: "branch-1",
    device_id: "device-counter-1",
    actor_user_id,
    lamport_seq: 11,
    device_created_at: 1_755_000_000_000,
    branch_created_at: 1_755_000_000_000,
    time_basis: "branch",
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  }) as unknown;

const parses = (
  type: string,
  payload: unknown,
  actor?: string | null,
): ReturnType<typeof parseEvent> => parseEvent(envelope(type, payload, actor));

/**
 * A refusal that is ANCHORED ON THE SCHEMA, never on `01-F4`.
 *
 * ⚠ Load-bearing, and copied deliberately from `escalatable-write-schemas.test.ts`, whose own note
 * records why: with a bare `.toThrow()`, **29 of that file's 63 assertions passed against a tree
 * that had no schema for its types at all** — every "is refused" test was satisfied by
 * `UnknownEventTypeError`, i.e. by the very defect the file existed to close. The same trap is
 * live here and is WORSE, because this file registers THREE types: without this second assertion,
 * registering `order.rejected` alone would leave every park/unpark refusal below passing vacuously.
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

// `06-F20`'s three, in the FR's own order, spelled per P1a.
const REASONS = ["closed", "item_unavailable", "out_of_delivery_range"] as const;

const REJECTED = { order_id: "order-1", reason: "item_unavailable" };
/** `[]` is a ROOT park — the first time this order was set aside (P2). */
const PARKED = { order_id: "order-1", supersedes: [] as string[] };
const UNPARKED = { order_id: "order-1", supersedes: ["0193b0f0-0000-7000-8000-000000000001"] };

/** The `02-F4` pair — everything §C says holds for both halves of the toggle. */
const PARK_PAIR: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["order.parked", PARKED],
  ["order.unparked", UNPARKED],
];

/** All three types this track registers. */
const ALL_THREE: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["order.rejected", REJECTED],
  ...PARK_PAIR,
];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `01-F4`: the three types are EMITTABLE at all. This is the state both FRs were in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F4 — the three types parse rather than throwing at emit", () => {
  /**
   * Before this change every one of these threw `UnknownEventTypeError` from `parseEvent`, which
   * `store.append` runs on every append. So `02-F9`'s reject half and `02-F4` entirely were not
   * merely unbuilt: they could not reach a ledger at all. `apps/pos-electron`'s guide records the
   * consequence for C10 — `cartOrderId` is renderer state, and an order abandoned to a relaunch is
   * reachable only through an `orders[0]` fallback.
   */
  it.each(ALL_THREE)("%s carries a payload schema", (type, payload) => {
    expect(parses(type, payload).type).toBe(type);
  });

  /**
   * THE ANTI-SWEEP CONTROL. `01 §4` also carries `order.cancelled`, `order.merged`, `order.split`,
   * `order.note_added`, `order.channel_tagged`, `order.line_removed` and `payment.split_recorded`,
   * none of which is this track's FR. If registering three types quietly registered everything —
   * a `Proxy`, a catch-all, a `z.any()` fallback in `ALL_PAYLOAD_SCHEMAS` — that would be
   * indistinguishable from the change actually made without this test.
   *
   * `order.cancelled` is deliberately in the list even though `06-F20` mentions it in the same
   * breath as `order.rejected` ("If no confirmation arrives within an org-configured window …
   * the customer is told and offered cancel"), and `06-F27` makes the auto-close an
   * `order.cancelled`. It is the neighbour this track is most likely to sweep in, so it is the one
   * worth naming.
   */
  it("the neighbours a session would be tempted to sweep in are still unregistered", () => {
    for (const type of [
      "order.cancelled",
      "order.merged",
      "order.split",
      "order.note_added",
      "order.channel_tagged",
      "payment.split_recorded",
    ]) {
      expect(
        () => parseEvent(envelope(type, { order_id: "order-1" })),
        `${type} became emittable — this track registers three types and not the family`,
      ).toThrow(UnknownEventTypeError);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — C20's case that matters: `reason` is `06-F20`'s LIST, not a string (P1).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F9/06-F20 — a rejection states a reason FROM THE LIST", () => {
  it.each(REASONS)("%s is accepted", (reason) => {
    // Driven over all three so an enum that shipped two of them fails HERE rather than in the
    // field. `06-F27`'s worked scenario reaches for `item_unavailable`; `06-F20`'s own sentence
    // reaches for the other two.
    expect(
      (parses("order.rejected", { ...REJECTED, reason }).payload as { reason: string }).reason,
    ).toBe(reason);
  });

  it("a rejection with NO reason is refused — 02-F9 has no unreasoned reject", () => {
    // Mutant: `reason: …optional()`. `06-F20`'s status page has nothing to state plainly, and a
    // reject taken back through `01-F1` is not available.
    const { reason: _dropped, ...noReason } = REJECTED;
    refuses("order.rejected", noReason);
  });

  /**
   * ⚠ **THE ASSERTION THIS SECTION EXISTS FOR.** The plausible wrong implementation is
   * `reason: z.string().min(1)` — it passes every test above, it never blocks a cashier, and it is
   * one line shorter. Each value below is a reason a real cashier would plausibly type or a real
   * implementer would plausibly add, and `06-F20` lists none of them.
   */
  it.each([
    "too_busy",
    "kitchen_closed",
    "out_of_stock",
    "other",
    "rider unavailable",
    "Item unavailable", // the DISPLAY label — 06-F18's "display label, not a state", one axis over
    "ITEM_UNAVAILABLE",
    "item-unavailable",
  ])("a reason outside the 06-F20 list is refused: %s", (reason) => {
    refuses("order.rejected", { ...REJECTED, reason });
  });

  it("an EMPTY reason is refused, not treated as 'no reason given'", () => {
    refuses("order.rejected", { ...REJECTED, reason: "" });
  });

  it("a non-string reason is refused", () => {
    refuses("order.rejected", { ...REJECTED, reason: 3 });
    refuses("order.rejected", { ...REJECTED, reason: null });
  });

  /**
   * The list is DECLARED ONCE in `domain` and is iterable (`18 §4`: "a domain type is declared in
   * `domain` and redeclaring it elsewhere is a violation rather than a convenience"). Two consumers
   * need to enumerate it and neither may hand-copy it: `02-F9`'s inbox renders the three choices,
   * and `06-F20`'s status page maps each to prose on the other plane.
   *
   * Reached through the module NAMESPACE rather than a named import on purpose: a missing export
   * then fails as this assertion, in this file, rather than as a typecheck error that reddens the
   * whole package for a reason the report cannot separate from a real behaviour gap.
   *
   * The precedent is `APPROVAL_TYPES`, pinned the same way by `approval-schemas.test.ts` §C, and it
   * is also why exporting this costs no `seams:check` debt: like `APPROVAL_TYPES`, the const is
   * reached from inside its own module by the `z.enum(...)` that consumes it.
   */
  it("06-F20's list is exported from domain, iterable, and is exactly the three", () => {
    const exported = (domain as unknown as Record<string, unknown>).ORDER_REJECTION_REASONS;
    expect(
      Array.isArray(exported),
      "ORDER_REJECTION_REASONS is not exported from @restos/domain",
    ).toBe(true);
    expect([...(exported as readonly string[])]).toEqual([...REASONS]);
  });

  it("the exported list and the SCHEMA agree — a fourth member cannot be added to only one", () => {
    // Without this, the export could grow a value the enum refuses (or shrink to two the enum
    // accepts) and both tests above would still pass. `02-F9`'s inbox would then draw a button
    // whose emit throws at `store.append` — a control that can never succeed.
    for (const reason of (domain as unknown as Record<string, unknown>)
      .ORDER_REJECTION_REASONS as readonly string[]) {
      expect(parses("order.rejected", { ...REJECTED, reason }).type).toBe("order.rejected");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — C10's case that matters: the toggle carries its own causal link (P2).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F4/01-F34 — park and unpark each name what they replace", () => {
  it.each(PARK_PAIR)("%s carries `supersedes`", (type, p) => {
    expect((parses(type, p).payload as { supersedes: string[] }).supersedes).toEqual(p.supersedes);
  });

  /**
   * ⚠ **THE ASSERTION THIS SECTION EXISTS FOR**, and the one a reviewer should overturn if they
   * reject P2. The plausible wrong implementation is `z.looseObject({ order_id })` — literally what
   * `02-F4` lists, one line, and it closes `01-F4` today. It is refused because a bare-fact set
   * cannot distinguish a second park from the first without a clock, a sequence or an id
   * comparison (`01-F34`), and because `01-F1` makes adding the field later a one-way door while
   * relaxing it later is free.
   */
  it.each(PARK_PAIR)("%s WITHOUT `supersedes` is refused (P2)", (type, p) => {
    const { supersedes: _dropped, ...noLink } = p;
    refuses(type, noLink);
  });

  it.each(PARK_PAIR)("%s accepts `[]` — a ROOT park is legal (P2)", (type, p) => {
    // Mutant: `.min(1)`. `order.table_assigned`'s note records the same rule for the same reason —
    // "Required; [] legal (a root assignment)". A non-empty constraint makes the FIRST park of any
    // order unemittable, i.e. `01-F4` refusing the ordinary case.
    expect(parses(type, { ...p, supersedes: [] }).type).toBe(type);
  });

  it.each(PARK_PAIR)("%s refuses a non-array `supersedes`", (type, p) => {
    refuses(type, { ...p, supersedes: "0193b0f0-0000-7000-8000-000000000001" });
    refuses(type, { ...p, supersedes: null });
  });

  it.each(PARK_PAIR)("%s refuses an EMPTY id inside `supersedes`", (type, p) => {
    // `""` is not an envelope id. A link to nothing reads as a link, and the fold that eventually
    // consumes this would treat the toggle as superseding a member it can never match.
    refuses(type, { ...p, supersedes: [""] });
  });

  it("a chain is legal — the second park supersedes the unpark that resumed it (02-F11)", () => {
    // The `02-F11` round trip: parked on Counter 1, unparked on Counter 2, parked again. Each link
    // names the envelope it replaces, which is the only thing that makes the third fact orderable
    // without reading a clock.
    const first = "0193b0f0-0000-7000-8000-000000000001";
    const resume = "0193b0f0-0000-7000-8000-000000000002";
    expect(parses("order.unparked", { order_id: "order-1", supersedes: [first] }).type).toBe(
      "order.unparked",
    );
    expect(parses("order.parked", { order_id: "order-1", supersedes: [resume] }).type).toBe(
      "order.parked",
    );
  });

  it("a MULTI-HEAD link is legal — one toggle clearing a concurrent pair (01-F58's shape)", () => {
    // `02-F11` makes concurrency ordinary rather than exotic here: the same order is reachable from
    // every terminal, so two cashiers can act inside one LAN round trip and leave TWO heads. The
    // resolving act must be able to name both at once, exactly as `availability.changed`'s
    // `head_ids_json` exists so "a contest is clearable in one operator act" — superseding only the
    // head your screen happened to show leaves the other standing and the state never settles.
    // A `z.string()`-shaped or single-element link would make that resolution unemittable.
    const headA = "0193b0f0-0000-7000-8000-00000000000a";
    const headB = "0193b0f0-0000-7000-8000-00000000000b";
    const parsed = parses("order.unparked", { order_id: "order-1", supersedes: [headA, headB] });
    expect((parsed.payload as { supersedes: string[] }).supersedes).toEqual([headA, headB]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the order key (06-F22, 26 §3) and the actor (02-F45).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 06-F22/26 §3/02-F45 — every one names an ORDER, and none names a person", () => {
  it.each(ALL_THREE)("%s is keyed to an order", (type, p) => {
    expect((parses(type, p).payload as { order_id: string }).order_id).toBe("order-1");
  });

  it.each(ALL_THREE)("%s without an order key is refused", (type, p) => {
    // `26 §3`'s projection-key sidecar answers `order:<payload.order_id>` for every order-keyed
    // event, so an event with no order key reaches no projection at all. For `order.rejected` it is
    // sharper still: `06-F22` makes the reversal metering event "idempotent on order id", so a
    // rejection naming no order cannot reverse the fee it is supposed to reverse.
    const { order_id: _dropped, ...noOrder } = p;
    refuses(type, noOrder);
  });

  it.each(ALL_THREE)("%s refuses an EMPTY order key", (type, p) => {
    refuses(type, { ...p, order_id: "" });
  });

  /**
   * `02-F45` reads attribution off the ENVELOPE and forbids duplicating the actor into the payload.
   * That is asserted rather than assumed here because both acts have an obvious tempting payload
   * field — "rejected_by", "parked_by" — and `02-F41` ("attribution is whoever's PIN is in") makes
   * a second home for the same fact a place where two answers can disagree permanently.
   *
   * Three halves, and each kills a different mutant:
   *   · the envelope CARRIES the cashier — a schema change cannot quietly move attribution;
   *   · the schema does not REQUIRE an actor field — proved by every §A parse, none of which
   *     carries one;
   *   · the parsed payload has EXACTLY the keys that went in. That last one is not decoration: a
   *     `rejected_by: z.string().default("")` or a `.transform()` that injects an identity would
   *     satisfy both other halves and still put a second, always-wrong answer to "who did this"
   *     into an append-only ledger. A `not.toContain("rejected_by")` would only catch the one
   *     spelling I happened to guess; exact key equality catches any injected field.
   */
  it.each(ALL_THREE)("%s: the actor is on the envelope and not in the payload", (type, p) => {
    const parsed = parses(type, p, CASHIER);
    expect(parsed.envelope.actor_user_id).toBe(CASHIER);
    expect(Object.keys(parsed.payload as Record<string, unknown>).sort()).toEqual(
      Object.keys(p).sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — additive evolution stays open (00 §6), and what this change did NOT decide.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 00 §6 — required fields are law, declared extras are not invented", () => {
  it.each(ALL_THREE)("%s tolerates an additive extra field", (type, p) => {
    // `looseObject` everywhere in this registry, for `00 §6`'s additive-evolution rule. A strict
    // object here would make doc 06's eventual free-text note, or a park label, a BREAKING change
    // rather than an additive one.
    expect(parses(type, { ...p, note: "customer called to ask" }).type).toBe(type);
  });

  /**
   * ANTI-SCOPE, recorded rather than asserted. `01-F4` blocks the EMIT and that is what these
   * schemas close. The FOLD is a separate, `26 §7`-sized piece of work: it makes a merge rule an
   * oracle-pinned decision, and guessing one at this seam is how delivery order gets to decide an
   * outcome. `packages/sync-client`'s `merge-workcounter.test.ts` carries the pinned disposition for
   * all three (consumed, projection-inert) and states the DEBT, in the file whose own title is
   * "registry growth must fail this suite before it can silently no-op".
   *
   * The consequence, named so it is not discovered in the field: **a rejected order stays in every
   * till's `open_orders` list**, and **a parked order is indistinguishable from an active one**.
   * Both are `02-F10`/`06-F20` surface problems and neither is `01-F4`'s.
   */
  it("this file pins the SCHEMA and not the fold — the disposition lives in sync-client", () => {
    // The honest form of that claim is that nothing here reads a projection, which is what this
    // whole file demonstrates: every assertion above runs through `parseEvent` alone.
    expect(parses("order.parked", PARKED).envelope.type).toBe("order.parked");
  });
});
