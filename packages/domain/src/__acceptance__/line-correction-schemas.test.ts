/**
 * ACCEPTANCE TESTS — `C8` (`order.line_removed`, `02-F8`) and `C7` (`order.note_added`, `02-F6`)
 * get the payload schemas `01-F4` requires.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/02-pos-app.md`,
 * `specs/01-kernel-sync.md`, `specs/03-kitchen-fulfillment.md`, `specs/26-merge-semantics.md` and
 * `specs/27-design-language.md`, and that did not write the implementation it describes (`24 §3`
 * step 2). Read-only to the implementing session.
 *
 * ⚠ **`packages/domain` IS A PROTECTED PATH (`20 §4.4`, commandment 10) AND NEEDS SENIOR REVIEW.**
 * Every pin below is a change to the kernel's event catalog, which is append-only downstream: a
 * field this file makes REQUIRED can never be relaxed for events already written, and a field it
 * leaves out can never be made required later without refusing history (`01-F1`). §0 is the part a
 * reviewer should argue with.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   01 §4   "`order.created / confirmed / rejected / cancelled / line_added / line_removed† / …
 *           note_added / …`" — both types have been catalog vocabulary since Wave 0, with the
 *           dagger: "†removal pre-KOT is a plain event; post-KOT it must be a `void.recorded`
 *           with approver".
 *   01-F4   "The event-type catalog and payload schemas live in `packages/domain` (Zod). Producing
 *           an unknown/invalid event type is a build-time and runtime error." A catalog entry with
 *           no schema is not *unbuilt* — it is **unemittable**.
 *   02-F8   "Confirm boundary: confirming an order emits `order.confirmed` and hands KOT jobs to
 *           the print service (doc 03). **Line removal pre-confirm is `order.line_removed`;
 *           post-confirm it must be `void.recorded` with an approver** (01 §4)."
 *   02-F6   "Item notes to kitchen: free text + org-configurable quick-tags ('less spicy') →
 *           `order.note_added`, printed prominently on the KOT (doc 03)."
 *   02-F9   "Items gone unavailable since placement must be resolved before accept: **remove the
 *           line** … this explicit line-removal path is **the only partial-confirmation
 *           mechanism**."
 *   02-F45  attribution is read from the ENVELOPE, never from a payload field.
 *   01-F34  folds "read no ordering metadata — no `global_seq`, no `lamport_seq`, no device clock,
 *           no envelope-id comparison that reaches a projected VALUE."
 *   00 §6   additive-only payload evolution under one `schema_version` (`z.looseObject`).
 *
 * ## THE CASE THAT MATTERS, stated so the round-3 law can be checked against this file
 *
 * There are two, one per task, and neither is "does Zod refuse a missing key" — every Zod object
 * does that, and a suite of those passes against any implementation of anything.
 *
 * **`C8`'s case is that a removal is NOT a void wearing a different type name.** The tempting
 * implementation copies the neighbour that already exists: `void.recorded` is four lines up in the
 * registry and carries `amount_paisa`, `reason` and `approver_user_id`. Copying it produces a
 * schema that parses every payload §B asserts and *also* makes a pre-confirm removal require a
 * reason a cashier must type (`27-F6`, on a 10–25×/shift act) and an approver field whose presence
 * is precisely what `02-F8` says separates the two paths. §B and §E are aimed at that mutant.
 *
 * **`C7`'s case is that a note is a per-LINE fact and an ACCUMULATING one.** The type is named
 * `order.note_added`, so the tempting schema is `{ order_id, note }` — an order-level note, which
 * `02-F6` ("**Item** notes") and `03-F3` ("**item** notes visually emphasized") both refuse, and
 * which would put "less spicy" on a ticket without saying which of four dishes it qualifies. The
 * second tempting schema adds `supersedes` on `order.parked`'s precedent, making the pick list a
 * register whose second tap erases the first. §C is aimed at both.
 *
 * ## §0 — PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — `order.line_removed` is `{ order_id, line_id }` and nothing else is required.**
 * `02-F8` calls it a *plain* event, in contrast with the void it names in the same sentence.
 *   *The simpler alternative, named:* `{ order_id }` — an order-level removal. Refused because
 *   `02-F9` makes this "the only partial-confirmation mechanism", and a partial confirmation that
 *   cannot name WHICH line is not partial. `order.line_price_overridden`'s note already records the
 *   identical reasoning for the identical shape: "unlike a void it is definitionally per-line".
 *   *The richer alternative, named:* `+ reason`, `+ approver_user_id`, on `void.recorded`'s
 *   pattern. Refused by `02-F8` in terms and by `02-F49`: the reason and the PIN belong to the
 *   post-confirm act (Appendix B — "post-KOT void always logged with **reason + PIN**"), and
 *   requiring them here would delete the distinction the dagger exists to draw.
 *
 * **P1a — NO `qty`.** No FR describes a partial-quantity decrement, and `AddLineRequestSchema`'s
 * shipped comment states the corpus's own reading: *"Positive: removing a line is
 * `order.line_removed`, not a qty of 0."* Removing two of three is a removal plus a re-add, which
 * needs no vocabulary. Inventing a decrement would be commandment 2.
 *
 * **P1b — NO `supersedes`, and the asymmetry with `order.parked` is deliberate.** A removal is
 * MONOTONE on its line key: `01 §4` has no `order.line_restored`, and putting the dish back is a
 * fresh `order.line_added` with a fresh `line_id` (`01-F1` — nothing is un-appended). So the
 * delivered set converges as a grow-only tombstone set with no causal link at all — commutative,
 * idempotent, and needing no clock, no sequence and no id comparison (`01-F34`). `order.parked`
 * needs its link because it is a REPEATABLE TOGGLE on one key and a bare-fact set cannot tell the
 * second park from the first; a removal has no second state to return to.
 *
 * **P2 — `order.note_added` is `{ order_id, line_id, note }`, all three required.**
 * `line_id` is required rather than nullable, and that is the direction that is recoverable:
 * relaxing to nullable later refuses nothing already written, while adding a required key later
 * makes every historical note unparseable (`01-F1`), and adding it `.optional()` permanently
 * confuses "an order-level note" with "a writer forgot" — the distinction
 * `payment.recorded.shift_id` and `catalog.changed.price_changes` are both written up in this
 * registry to preserve. No FR names an order-level note today.
 *
 * **P2a — NO `supersedes` on the note, and this is `01 §4`'s own naming.** The catalog carries
 * `note_added` and offers no `note_removed` and no `note_changed`. `02-F6`'s quick-tags are a PICK
 * LIST, so two taps are two facts; a register would make the second tap erase the first, and
 * `27-F59`'s reasoning about a missed removal ("an allergen incident, not a preference miss")
 * applies with full force to a note reading "no peanuts". `02-F50` rules it.
 *
 * **P2b — the note is NOT capped and NOT truncated by the kernel.** No FR states a maximum;
 * `03-F49` states minimum COLUMNS only. Truncating in the schema would make the ledger and every
 * projection disagree about the same event, permanently and silently (`01-F1`) — which is
 * `catalog-fetch.ts`'s dropped-field defect relocated into the kernel. `03-F55` records the layout
 * cost of a long note and declines to solve it here.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN
 *
 * - **Whether the removal is REFUSED after confirm.** `01-F4` validates a payload; whether an
 *   order is confirmed is a FOLD fact no payload carries, so the kernel structurally cannot decide
 *   it. `02-F49` puts the boundary in `main` against the till's own projection, and
 *   `apps/pos-electron`'s seam oracle asserts it. §E asserts only the half a schema can own: the
 *   two shapes are structurally different, so neither can be silently used where the other is meant.
 * - **The fold.** `26 §7` makes a merge rule an oracle-pinned decision; `packages/sync-client`'s
 *   `line-correction-fold.test.ts` is that oracle and this file reads no projection.
 * - **The tag list.** `02-F6`'s quick-tags are `00 §7` layer-2 config (`02 §7`, "kitchen
 *   quick-tags"), not kernel vocabulary. The schema takes the resulting STRING and says nothing
 *   about where it came from — `02-F6` names two input routes producing one event.
 */

import { describe, expect, it } from "vitest";
import { parseEvent, UnknownEventTypeError } from "../index.js";

const CASHIER = "user-ayesha";

/** A minimal legal envelope. `type`, `payload` and `actor_user_id` are what vary here. */
const envelope = (
  type: string,
  payload: unknown,
  actor_user_id: string | null = CASHIER,
): unknown =>
  ({
    id: "0193b0f0-0000-7000-8000-00000000004c",
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
 * `UnknownEventTypeError`, i.e. by the very defect the file existed to close. The trap is live here
 * and is worse, because this file registers TWO types: without the second assertion, registering
 * `order.line_removed` alone would leave every note refusal below passing vacuously.
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

const REMOVED = { order_id: "order-1", line_id: "line-3" };
/** `02-F6`'s own worked example, which is also `02-F50`'s quick tag. */
const NOTED = { order_id: "order-1", line_id: "line-3", note: "less spicy" };

const BOTH: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["order.line_removed", REMOVED],
  ["order.note_added", NOTED],
];

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F4: the two types are EMITTABLE at all. This is the state both FRs were in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F4 — the two types parse rather than throwing at emit", () => {
  /**
   * Before this change both threw `UnknownEventTypeError` from `parseEvent`, which `store.append`
   * runs on every append. So `02-F8`'s removal half and `02-F6` entirely were not merely unbuilt:
   * they could not reach a ledger at all. `packages/ui`'s `Cart` has declared an `onRemove` prop
   * throughout, and `Counter.tsx` never passed it — a control that had nothing to emit.
   */
  it.each(BOTH)("%s carries a payload schema", (type, payload) => {
    expect(parses(type, payload).type).toBe(type);
  });

  /**
   * THE ANTI-SWEEP CONTROL. `01 §4` also carries `order.merged`, `order.split`,
   * `order.channel_tagged` and `payment.split_recorded`, none of which is this track's FR. If
   * registering two types quietly registered everything — a `Proxy`, a catch-all, a `z.any()`
   * fallback in the schema map — that would be indistinguishable from the change actually made
   * without this test.
   *
   * `order.channel_tagged` is deliberately in the list: `02-F1` names it in the same clause as
   * `order.created`, and it is the neighbour a session touching the order family is most likely to
   * sweep in.
   *
   * ── AMENDED August 2026 (`01-F84` landed) ────────────────────────────────────────────────────
   * ⚠ `order.cancelled` has come OUT of the list, on the precedent
   * `escalatable-write-schemas.test.ts` set when `order.rejected` and `order.unparked` came out of
   * its own: **the list's job is to name types that are still unregistered.** `01-F84` registered
   * this one with its own FR, its own oracle (`order-cancelled-schema.test.ts`) and its own
   * `06-F31` producer — which is this tripwire WORKING, not being worked around: it named, at the
   * point of the change, exactly which neighbours must not ride along, and the remaining names do
   * that job unchanged. `payment.split_recorded` in particular is still schema-less and is still
   * nobody's FR (`01-F84`'s own note records `order.split`/`order.merged`/`order.channel_tagged`
   * and it as the four types `01-F4` still refuses).
   */
  it("the neighbours a session would be tempted to sweep in are still unregistered", () => {
    for (const type of [
      "order.merged",
      "order.split",
      "order.channel_tagged",
      "payment.split_recorded",
    ]) {
      expect(
        () => parseEvent(envelope(type, { order_id: "order-1" })),
        `${type} became emittable — this track registers two types and not the family`,
      ).toThrow(UnknownEventTypeError);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — C8's case: a removal names ONE LINE, and carries nothing a void carries (P1, P1a, P1b).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F8/02-F9 — a removal is a plain, per-line fact", () => {
  it("02-F9: the removal names the LINE it removes", () => {
    expect((parses("order.line_removed", REMOVED).payload as { line_id: string }).line_id).toBe(
      "line-3",
    );
  });

  /**
   * ⚠ **THE ASSERTION §B EXISTS FOR (first half).** The plausible wrong implementation is
   * `z.looseObject({ order_id })` — the order-level removal, which is what the TYPE NAME suggests
   * and what a session copying `order.confirmed` would write. It passes nothing below.
   * `02-F9` makes this path "the only partial-confirmation mechanism", and a partial confirmation
   * that cannot say which line is not partial: the cloud order would be accepted whole, with the
   * unavailable item still on it and its KOT already printed.
   */
  it("a removal with NO line key is refused — an order-level removal removes nothing nameable", () => {
    const { line_id: _dropped, ...noLine } = REMOVED;
    refuses("order.line_removed", noLine);
  });

  it("a removal with an EMPTY line key is refused", () => {
    refuses("order.line_removed", { ...REMOVED, line_id: "" });
  });

  it("a removal with a non-string line key is refused", () => {
    refuses("order.line_removed", { ...REMOVED, line_id: 3 });
    refuses("order.line_removed", { ...REMOVED, line_id: null });
  });

  /**
   * ⚠ **THE ASSERTION §B EXISTS FOR (second half), and the one a reviewer should overturn if they
   * reject P1.** The plausible wrong implementation is the one four lines up in the registry:
   * `void.recorded`'s `{ order_id, amount_paisa, reason, approver_user_id }`, copied because it is
   * the nearest neighbour and because "removal" and "void" are near-synonyms in English.
   *
   * Each `expect` below is a REQUIRED field the void has and the removal must not, and each one is
   * a product failure rather than a schema opinion:
   *   · `reason` — `27-F6` bans required non-numeric typing on a critical path, and `C8` runs
   *     10–25× a shift. `02-F8` says *plain* event; Appendix B puts "reason + PIN" on the post-KOT
   *     void alone.
   *   · `approver_user_id` — its presence is precisely what `02-F8` says separates the two paths.
   *     A removal that required one would make the pre-confirm case need a manager, i.e. the
   *     `02-F20` escalation the dagger says it is NOT.
   *   · `amount_paisa` — a removal states no money. `01-F53` snapshotted the price into
   *     `order.line_added`, so a second copy here is a number that can disagree with the line it
   *     names, permanently (`01-F1`), and `01-F30` has no `removed_value` term for it to feed.
   */
  it("a removal parses with NO reason, approver, amount, supersedes or qty (P1/P1a/P1b)", () => {
    // ONE assertion and not five parameterised ones: the fixture carries none of the five fields,
    // so a per-field `it.each` would run the same predicate five times and report five kills for
    // one. The five names are in the message instead, where they are evidence rather than count.
    expect(
      parses("order.line_removed", REMOVED).type,
      "`{order_id, line_id}` was refused — the removal requires a field only `void.recorded` " +
        "should have (reason / approver_user_id / amount_paisa / supersedes / qty), and the two " +
        "paths 02-F8 separates are being blurred into one",
    ).toBe("order.line_removed");
  });

  /**
   * The CONTROL for the assertion above, and without it that `it.each` proves nothing about
   * attribution: an implementation that dropped every requirement from `void.recorded` too would
   * satisfy it. The void must still refuse each of the three fields it owns.
   */
  it("CONTROL — `void.recorded` still requires reason, approver and amount (the dagger's other side)", () => {
    const VOID = {
      order_id: "order-1",
      amount_paisa: 45000,
      reason: "customer returned the dish",
      approver_user_id: "user-hina",
      // `01-F83` (founder ruling R56, August 2026): the corrective's `01-F31`-class attempt key,
      // REQUIRED on all four escalatable writes. Fixture-only — this control asserts that the void
      // still requires the three fields the removal must NOT have, and that claim is unchanged.
      adjustment_attempt_id: "0193b0f0-1111-7000-8000-0000000000a1",
    };
    expect(parses("void.recorded", VOID).type).toBe("void.recorded");
    for (const field of ["amount_paisa", "reason", "approver_user_id"] as const) {
      const { [field]: _dropped, ...missing } = VOID;
      refuses("void.recorded", missing);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — C7's case: a note is a per-LINE fact that ACCUMULATES (P2, P2a, P2b).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F6/03-F3 — an ITEM note names its item and never replaces another", () => {
  it("02-F6: the note carries its text", () => {
    expect((parses("order.note_added", NOTED).payload as { note: string }).note).toBe("less spicy");
  });

  /**
   * ⚠ **THE ASSERTION §C EXISTS FOR (first half).** The plausible wrong implementation is
   * `{ order_id, note }` — the type is called `order.note_added`, so an order-level note is what
   * the name suggests. `02-F6` says "**Item** notes" and `03-F3` says "**item** notes visually
   * emphasized"; `03-F55` puts the note in its item's block for `27-F57`'s measured reason —
   * separating a note from the dish it qualifies is the mapping failure where comprehension
   * collapses from ~71% to ~35%. A note with no line key can only be printed at the foot of the
   * ticket, qualifying every dish or none.
   */
  it("a note with NO line key is refused — 02-F6 is an ITEM note (P2)", () => {
    const { line_id: _dropped, ...noLine } = NOTED;
    refuses("order.note_added", noLine);
  });

  it("a note with an EMPTY line key is refused", () => {
    refuses("order.note_added", { ...NOTED, line_id: "" });
  });

  it("a note with NO text is refused", () => {
    const { note: _dropped, ...noText } = NOTED;
    refuses("order.note_added", noText);
  });

  /**
   * An empty note is refused rather than treated as "clear the note". There is no
   * `order.note_removed` in `01 §4`, so `""` cannot mean removal; and `03-F55` gives the note a
   * position in its item block, so an empty one prints a blank emphasised row — the zero on a
   * clock `00 §5.7` forbids.
   */
  it("an EMPTY note is refused, not treated as 'clear the note'", () => {
    refuses("order.note_added", { ...NOTED, note: "" });
  });

  it("a non-string note is refused", () => {
    refuses("order.note_added", { ...NOTED, note: 3 });
    refuses("order.note_added", { ...NOTED, note: null });
    refuses("order.note_added", { ...NOTED, note: ["less spicy"] });
  });

  /**
   * ⚠ **THE ASSERTION §C EXISTS FOR (second half), and the one a reviewer should overturn if they
   * reject P2a.** The plausible wrong implementation adds a REQUIRED `supersedes` on
   * `order.parked`'s precedent — that pair is three screens up in the same registry and its note
   * argues at length that a repeatable act needs a carried causal link.
   *
   * The argument does not transfer, and the difference is what `02-F50` rules: park/unpark is a
   * TOGGLE with two states on one key, so a bare-fact set cannot tell the second park from the
   * first. A note is MONOTONE — `01 §4` offers no `note_removed` and no `note_changed` — so the
   * delivered set converges as a grow-only set with no link at all. Requiring one would not merely
   * add a column: an emitter with no head to read would have to pass `[]` for every tap, and a
   * fold reading it as a register would make the second quick-tag ERASE the first. `27-F59`'s own
   * words about a missed removal — "an allergen incident, not a preference miss" — are why that
   * direction is the unsafe one.
   */
  it("a note WITHOUT `supersedes` parses — notes accumulate, they do not replace (P2a)", () => {
    expect(Object.keys(parses("order.note_added", NOTED).payload as object).sort()).toEqual([
      "line_id",
      "note",
      "order_id",
    ]);
  });

  it("two notes on ONE line are both legal payloads — the pick list is a list (02-F6/02-F50)", () => {
    // The schema half of the accumulation claim; the fold half is `line-correction-fold.test.ts`.
    // A register-shaped schema (a required `supersedes`, or a `note` the second event must link
    // from) would make the second tap of a two-tag order unconstructible without reading a head
    // set that no projection publishes.
    expect(parses("order.note_added", { ...NOTED, note: "less spicy" }).type).toBe(
      "order.note_added",
    );
    expect(parses("order.note_added", { ...NOTED, note: "no onions" }).type).toBe(
      "order.note_added",
    );
  });

  /**
   * P2b. Aimed at two mutants at once, and the second is the dangerous one:
   *   · `note: z.string().min(1).max(40)` — a cap, which refuses an act at append. `01-F17`'s
   *     line is that a SALE is never blocked, and a refused note does not block one — but no FR
   *     states a maximum, so a cap is invented policy (commandment 2) and `03-F55` says so.
   *   · `note: z.string().transform((s) => s.slice(0, 40))` — a silent truncation, which is worse
   *     by the same argument `order-reject-park-schemas.test.ts` measured for `z.object`'s strip:
   *     `parseEnvelope` types `payload` as `z.unknown()`, so the FULL note is written durably to
   *     the ledger while every fold and every reader gets the truncated one. Ledger and projection
   *     would disagree about one event, permanently, with nothing raised.
   */
  it("a long note is neither refused nor silently truncated (P2b)", () => {
    const long = `${"no chillies at all, the child is allergic ".repeat(12)}please`;
    expect(long.length).toBeGreaterThan(400);
    const parsed = parses("order.note_added", { ...NOTED, note: long });
    expect(
      (parsed.payload as { note: string }).note,
      "the kernel altered the note text — ledger and projection now disagree about one event",
    ).toBe(long);
  });

  /**
   * `00 §5.6`'s user-content rule reaches the kernel: user content is Unicode and is never
   * transliterated or rejected for its script. The PRINTER's refusal is `03-F8`'s and belongs
   * there, not here — and `02-F50` keeps Wave 1's input a Latin pick list so the refusal is rare
   * rather than solved. A schema that refused non-Latin text would be `00 §5.6` inverted.
   */
  it("00 §5.6: a non-Latin note is accepted by the KERNEL — the printer's refusal is 03-F8's", () => {
    expect(parses("order.note_added", { ...NOTED, note: "کم مرچ" }).type).toBe("order.note_added");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the order key (26 §3) and the actor (02-F45).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 26 §3/02-F45 — both name an ORDER, and neither names a person", () => {
  it.each(BOTH)("%s is keyed to an order", (type, p) => {
    expect((parses(type, p).payload as { order_id: string }).order_id).toBe("order-1");
  });

  it.each(BOTH)("%s without an order key is refused", (type, p) => {
    // `26 §3`'s projection-key sidecar answers `order:<payload.order_id>` for every order-keyed
    // event, so an event with no order key reaches no projection at all — the line would stay in
    // the cart and in `billed_total` while the ledger held a removal nothing could apply.
    const { order_id: _dropped, ...noOrder } = p;
    refuses(type, noOrder);
  });

  it.each(BOTH)("%s refuses an EMPTY order key", (type, p) => {
    refuses(type, { ...p, order_id: "" });
  });

  /**
   * `02-F45` reads attribution off the ENVELOPE and forbids duplicating the actor into the
   * payload. Asserted rather than assumed because both acts have an obvious tempting payload field
   * — "removed_by", "noted_by" — and `02-F41` ("attribution is whoever's PIN is in") makes a
   * second home for one fact a place where two answers can disagree permanently.
   *
   * The exact-keys half is not decoration: a `removed_by: z.string().default("")` or a
   * `.transform()` injecting an identity would satisfy the envelope half and still put a second,
   * always-wrong answer to "who did this" into an append-only ledger. A `not.toContain` would only
   * catch the spelling I happened to guess.
   */
  it.each(BOTH)("%s: the actor is on the envelope and not in the payload", (type, p) => {
    const parsed = parses(type, p, CASHIER);
    expect(parsed.envelope.actor_user_id).toBe(CASHIER);
    expect(Object.keys(parsed.payload as Record<string, unknown>).sort()).toEqual(
      Object.keys(p).sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — the DAGGER at the kernel: the two shapes cannot be substituted for one another.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F8/01 §4 dagger — pre-confirm and post-confirm are structurally different acts", () => {
  /**
   * The kernel cannot enforce the BOUNDARY — whether an order is confirmed is a fold fact no
   * payload carries, which is why `02-F49` puts the guard in `main` against the till's own
   * projection. What the kernel CAN own, and what this section asserts, is that the two acts are
   * not interchangeable shapes: an implementation cannot quietly route a post-confirm removal
   * through `order.line_removed` by filling in the same fields, because the fields differ.
   *
   * Without this, an implementer who "closed the dagger" by giving `order.line_removed` an
   * optional `approver_user_id` would have a schema that satisfies every other test in this file
   * while making the two paths one path — the exact blur the task brief forbids.
   */
  it("a removal payload is NOT a legal void payload — the void refuses it", () => {
    refuses("void.recorded", REMOVED);
  });

  it("an approver on a REMOVAL is an additive extra (00 §6), never a second escalation path", () => {
    // `looseObject` means a void's fields pass THROUGH a removal rather than being refused, and
    // that is correct `00 §6` behaviour. The claim this section makes is about what is REQUIRED,
    // which the test above and §B establish; what must never hold is the reverse — the void
    // accepting a bare `{order_id, line_id}`, which would let a post-KOT act be recorded with no
    // approver at all.
    expect(parses("order.line_removed", { ...REMOVED, approver_user_id: "user-hina" }).type).toBe(
      "order.line_removed",
    );
    refuses("void.recorded", { ...REMOVED, approver_user_id: "user-hina" });
  });

  /**
   * ANTI-SCOPE, recorded rather than asserted. `01-F4` blocks the EMIT and that is what these
   * schemas close. `02-F49`'s origination guard and `26 §7`'s merge rules are separate work with
   * their own oracles (`apps/pos-electron/src/main/__acceptance__/line-correction-seam.test.ts`,
   * `packages/sync-client/src/__acceptance__/line-correction-fold.test.ts`).
   *
   * The consequence, named so it is not discovered in the field: with the schemas alone, a removal
   * is appendable and **the line is still in the cart and still in `billed_total`**. That is worse
   * than an unbuilt feature, because the control returns without complaint. Nothing may ship the
   * schemas without the fold.
   */
  it("this file pins the SCHEMA and not the fold — every assertion above runs through parseEvent alone", () => {
    expect(parses("order.line_removed", REMOVED).envelope.type).toBe("order.line_removed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — additive evolution stays open (00 §6).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 00 §6 — declared fields are law, extras pass through", () => {
  it.each(BOTH)("%s tolerates an additive extra field and does not STRIP it", (type, p) => {
    /*
     * The second assertion is the one that bites, and it exists because a sibling oracle measured
     * the trap: swapping `z.looseObject` for `z.object` — the one-word mutant a helpful session
     * writes without thinking — killed **0** of `order-reject-park-schemas.test.ts`'s 48 tests,
     * because zod 4's `z.object` does not REFUSE an undeclared key, it **strips** it. The parse
     * still returns and `.type` is still right, over a payload that has silently lost the field.
     *
     * The strip is silent in the worst direction: `parseEnvelope` types `payload` as
     * `z.unknown()`, so the extra key is written DURABLY to the ledger while every fold and every
     * reader gets a payload without it.
     */
    expect(parses(type, { ...p, source: "quick_tag" }).type).toBe(type);
    expect(
      (parses(type, { ...p, source: "quick_tag" }).payload as Record<string, unknown>).source,
      `${type}: the additive field was STRIPPED — z.object silently drops what z.looseObject keeps`,
    ).toBe("quick_tag");
  });
});
