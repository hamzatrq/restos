// ACCEPTANCE TESTS — the two schema gaps that made `05-F2` and `05-F3` unbuildable.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session). No
// implementation of either schema was written or read before this file: `grep -a
// "alarm_acknowledged\|printer.status_changed" packages/domain/src` returned nothing but this
// file's own path at the time of writing.
//
// ⚠ `packages/domain` IS A PROTECTED PATH (commandment 10). Landing what this file demands is a
// senior-review change, and the review that matters is `01-F5`'s: the audit family grows by one.
//
// THE FRs, QUOTED so an assertion can be argued with rather than obeyed:
//
//   05-F2  "Alarms persist in an active list until the order goes ready/served or the manager
//          acknowledges; acknowledgment is logged (`audit.*`, hash-chained per 01-F5). Alarms are
//          never auto-dismissed silently."
//   05-F30 (August 2026) the ack is `audit.alarm_acknowledged`, `01-F5`'s SEVENTH subtype.
//          Payload `alarm_kind` (`late_order | print_failed`, CLOSED), `order_id` (required),
//          `printer_name` (`03-F5`'s printer; `null` on a `late_order` ack, and "non-null and
//          non-empty whenever `alarm_kind` is `print_failed`"). The fields are REQUIRED rather
//          than `01-F5`'s additive extras because `05 §5` re-derives the whole alarm list from the
//          ledger (`01-F6`) and an ack that cannot say WHICH alarm it cleared re-derives to
//          nothing — every acknowledged alarm returns on reinstall.
//   05-F29 the ack is authored on the manager DEVICE; a cloud console may render and may not
//          acknowledge (`01-F62` names `audit.*` as its worked example of a branch-scoped type).
//   01-F5  the `audit.*` family, amended August 2026 from six subtypes to SEVEN. "each payload
//          carries `prev_audit_hash: string | null` (`null` only for a device's first audit
//          event)"; "the chain is store-owned (the device stamps `prev_audit_hash` inside the
//          append transaction; a caller-supplied value is rejected)"; the v1 payload contract is
//          `prev_audit_hash` alone and "the business fields (who/what) land additively with the
//          emitting modules (docs 05/14/15)".
//   01-F4  "Producing an unknown/invalid event type is a build-time and runtime error."
//   01-F1  the ledger is permanent. A vocabulary admitted here can never be taken back.
//   03-F11 "`printer.status_changed` (extension) emitted on online/offline transitions per
//          registered printer — feeds doc 05 alarms and doc 15 fleet health."
//   03-F53 (August 2026) its payload: `printer_name` (non-empty) + `status`, a CLOSED two-member
//          set `online | offline`. "A `stalled` job is NOT an offline transition" — `03-F41`'s
//          stalled printer answered the sensor query, so it is reachable.
//   03-F41 "a stalled printer is holding the job, not dropping it."
//   02-F41 attribution is the envelope's `actor_user_id`, read at append. Never a payload copy.
//
// ── WHAT THIS SUITE DOES NOT AND CANNOT SHOW ───────────────────────────────────────────────────
//
// A schema makes an act POSSIBLE; it does not make it HAPPEN. Nothing here proves any device ever
// emits either type, and for `audit.alarm_acknowledged` nothing can today — `05-F29`'s manager
// device cannot open a store (`packages/sync-client`'s `openStore` binds `better-sqlite3`), so the
// producer is genuinely absent and is reported as absent rather than stubbed. That is this wave's
// named defect in its honest form: the seam exists, the producer is owed, and a suite that implied
// otherwise would be worse than no suite. `printer.status_changed`'s producer IS landable and has
// its own suite on the till (`apps/pos-electron/src/main/__acceptance__/printer-status-producer`).
//
// ── ONE PINNED INTERPRETATION, argued rather than assumed ──────────────────────────────────────
//
// **`alarm_kind` is a CLOSED set of two, so `printer_offline` is REFUSED.** `05-F3` names
// `printer.status_changed(offline)` as an alarm trigger, so a third kind is foreseeable — and
// `05-F30` records why it is not admitted here: that alarm has no order and no ready/served exit,
// which `05-F2`'s persistence rule and `05-F1`'s alarm shape cannot express, so it is a founder
// call. Test 7 asserts the refusal. **If the ruling widens the set, test 7 is the assertion that
// must be re-transcribed** — deliberately, not silently, which is the entire value of closing it.

import { describe, expect, it } from "vitest";
import {
  AUDIT_EVENT_TYPES,
  type EventEnvelopeT,
  eventRegistry,
  isAuditEvent,
  newId,
  parseEvent,
  UnknownEventTypeError,
} from "../index.js";

const T0 = 1_770_000_000_000;

/** `01-F5`'s CLOSED SET, transcribed from the FR rather than read off the registry — the same
 * discipline `audit-chain.test.ts` states in its own header, and the reason it is worth repeating:
 * a list built from `AUDIT_EVENT_TYPES` would check the registry against itself and pass for any
 * value at all. Amended August 2026 from six to SEVEN (`05-F30`). */
const AUDIT_TYPES_PER_01_F5 = [
  "audit.login",
  "audit.drawer_opened",
  "audit.reprint",
  "audit.threshold_override",
  "audit.settings_changed",
  "audit.print_acknowledged",
  "audit.alarm_acknowledged",
] as const;

const ACK = "audit.alarm_acknowledged";
const STATUS = "printer.status_changed";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const PRINTER = "BC-85AC";

const envelope = (
  type: string,
  payload: Record<string, unknown>,
  over: Partial<EventEnvelopeT> = {},
): Record<string, unknown> => ({
  id: newId(),
  org_id: "org-A",
  branch_id: "br-A",
  device_id: "dev-manager-1",
  actor_user_id: newId(),
  lamport_seq: 0,
  device_created_at: T0,
  branch_created_at: T0,
  time_basis: "branch",
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [],
  ...over,
});

/** A well-formed `05-F30` ack for a `05-F1` late-order alarm. */
const lateOrderAck = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  prev_audit_hash: null,
  alarm_kind: "late_order",
  order_id: ORDER_ID,
  printer_name: null,
  ...over,
});

/** A well-formed `05-F30` ack for a `05-F3` print-failure alarm. */
const printFailedAck = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  prev_audit_hash: null,
  alarm_kind: "print_failed",
  order_id: ORDER_ID,
  printer_name: PRINTER,
  ...over,
});

/**
 * **REFUSED FOR THE RIGHT REASON, and this helper is the whole assertion.**
 *
 * A bare `.toThrow()` cannot tell "the SCHEMA refused this payload" from "there is no schema at
 * all" — `parseEvent` raises `UnknownEventTypeError` before it ever looks at a payload. Measured
 * on this suite's first run against the un-landed registry: **nine refusal tests passed**, every
 * one of them vacuously, and a reader would have concluded half the contract was already met.
 *
 * That is the round-3 law's own worked example — `F60`'s amendment test "published a FULLY PRICED
 * entry, so it could not distinguish 'refused for the right reason' from any refusal" — so every
 * refusal below demands a `ZodError`-shaped throw and explicitly denies the unknown-type one.
 */
const expectRefused = (envelopeValue: Record<string, unknown>, why: string): void => {
  let thrown: unknown;
  try {
    parseEvent(envelopeValue);
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `${why} — nothing was thrown at all`).toBeDefined();
  expect(
    thrown instanceof UnknownEventTypeError,
    `${why} — refused because the TYPE has no schema, which is not a payload refusal`,
  ).toBe(false);
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A — `01-F5`'s family grows by one, and the growth is where the chain comes from.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("05-F30 / 01-F5 — audit.alarm_acknowledged joins the audit family", () => {
  // 1. The whole point of the subtype: it is an AUDIT event, so the store stamps the chain.
  //    THE WRONG IMPLEMENTATION THIS CATCHES, and it is the likely one because it is one line
  //    shorter: registering the type in `payloadSchemas` beside `kot.print_failed`. `parseEvent`
  //    would accept it, every payload assertion below would pass, and `isAuditEvent` would be
  //    false — so the device would never stamp `prev_audit_hash` and `01-F5`'s "silently
  //    dismissing … with nobody accountable" protection would be absent while looking present.
  it("is an audit.* subtype, so the store owns its hash chain (01-F5)", () => {
    expect(isAuditEvent(ACK)).toBe(true);
    expect([...AUDIT_EVENT_TYPES]).toContain(ACK);
  });

  // 2. SET EQUALITY against the FR transcription, in both directions. `01-F5` says SEVEN: a
  //    registry carrying six (the amendment not landed) or eight (a subtype invented without an
  //    FR) both redden. This is the assertion that goes stale the day `01-F5` is amended again,
  //    and it is supposed to.
  it("makes the audit family exactly SEVEN — no more, no fewer (01-F5)", () => {
    expect([...AUDIT_EVENT_TYPES].sort()).toEqual([...AUDIT_TYPES_PER_01_F5].sort());
  });

  // 3. `01-F5`: audit events fold to nothing, and the registry keeps that split by keeping them
  //    out of `KnownEventType`. An ack that appeared in the fold-consumed catalog would put an
  //    audit case in front of the fold engine, which is the split's whole purpose.
  it("stays OUT of the fold-consumed catalog (01-F5)", () => {
    expect(eventRegistry.has(ACK)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B — `05-F30`'s payload: what an ack must say, and what it may not.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("05-F30 — the ack payload identifies the alarm it cleared", () => {
  // 4. Both kinds parse. The `late_order` case carries `printer_name: null`, which is the shape
  //    `05-F30` specifies for an alarm with no printer.
  it("accepts a late_order ack and a print_failed ack (01-F4)", () => {
    expect(parseEvent(envelope(ACK, lateOrderAck())).payload).toMatchObject({
      alarm_kind: "late_order",
      order_id: ORDER_ID,
      printer_name: null,
    });
    expect(parseEvent(envelope(ACK, printFailedAck())).payload).toMatchObject({
      alarm_kind: "print_failed",
      printer_name: PRINTER,
    });
  });

  // 5. `05 §5` + `01-F6`: the alarm list is re-derived from the ledger on a reinstalled phone. An
  //    ack with no `alarm_kind` cannot say whether it cleared "this order is late" or "the kitchen
  //    never got the ticket" — two different remedies on one order.
  //    WRONG IMPLEMENTATION CAUGHT: making the business fields OPTIONAL, which is the reading
  //    `01-F5`'s "business fields land additively" invites and which `05-F30` overrules with the
  //    re-derivation argument. An optional field is an ack that clears nothing after a reinstall.
  it("REFUSES an ack with no alarm_kind (05-F30, 05 §5 re-derivation)", () => {
    const { alarm_kind: _dropped, ...rest } = lateOrderAck();
    expectRefused(envelope(ACK, rest), "an ack with no alarm_kind");
  });

  // 6. Same argument, other field.
  it("REFUSES an ack with no order_id, or an empty one (05-F30)", () => {
    const { order_id: _dropped, ...rest } = lateOrderAck();
    expectRefused(envelope(ACK, rest), "an ack with no order_id");
    expectRefused(envelope(ACK, lateOrderAck({ order_id: "" })), "an ack with an empty order_id");
  });

  // 7. THE CLOSED SET. See the pinned interpretation above: `printer_offline` is the third kind a
  //    session will reach for, `05-F3` makes it foreseeable, and `05-F30` records why it is a
  //    founder call rather than a string. Under `01-F1` a vocabulary admitted here is permanent.
  //    WRONG IMPLEMENTATION CAUGHT: `alarm_kind: z.string().min(1)`, which is what "an app's view
  //    knows its own kinds" argues for and which admits every typo for ever.
  it("REFUSES an alarm_kind outside 05-F1/05-F3's two categories (05-F30, 01-F1)", () => {
    for (const alarm_kind of ["printer_offline", "late", "print_failure", "", "LATE_ORDER"]) {
      expectRefused(envelope(ACK, lateOrderAck({ alarm_kind })), `alarm_kind ${alarm_kind}`);
    }
  });

  // 8. THE CROSS-FIELD RULE, and the sharpest assertion in this file. `05-F4` puts two failed
  //    printers on one order in TWO alarms, because `03-F5` says the manager has to know which one
  //    to walk to. A `print_failed` ack that names no printer therefore identifies neither of them
  //    — and under `01-F1` it is a permanent record that cannot be corrected, only added to.
  //    WRONG IMPLEMENTATION CAUGHT: one flat `looseObject` with `printer_name: string | null`,
  //    which passes tests 4–7 completely and is what anyone writes first.
  it("REFUSES a print_failed ack that names no printer (05-F30, 05-F4, 03-F5)", () => {
    expectRefused(
      envelope(ACK, printFailedAck({ printer_name: null })),
      "print_failed, null printer",
    );
    expectRefused(
      envelope(ACK, printFailedAck({ printer_name: "" })),
      "print_failed, empty printer",
    );
    const { printer_name: _dropped, ...rest } = printFailedAck();
    expectRefused(envelope(ACK, rest), "print_failed, no printer field");
  });

  // 9. The other half of test 8, and the reason it is a separate test: a blanket "printer_name is
  //    required" satisfies test 8 and BREAKS the late-order ack, which is `05-F1`'s commonest
  //    alarm and involves no printer. Asserting only the refusal would ship a schema that refuses
  //    the majority case. (This is the round-3 law's "a test that stays RED under a CORRECT
  //    implementation is as damaging as a vacuous one", pointed at its own suite.)
  it("ACCEPTS a late_order ack that names no printer (05-F1, 05-F30)", () => {
    expect(parseEvent(envelope(ACK, lateOrderAck({ printer_name: null }))).payload).toMatchObject({
      printer_name: null,
    });
  });

  // 10. `01-F5`'s family-wide contract, which `05-F30`'s business fields are additive TO, not a
  //     replacement FOR. `null` is legal (a device's first audit event); absence is not.
  it("keeps 01-F5's prev_audit_hash contract — null legal, absent refused", () => {
    expect(
      parseEvent(envelope(ACK, lateOrderAck({ prev_audit_hash: null }))).payload,
    ).toBeDefined();
    expect(
      parseEvent(envelope(ACK, lateOrderAck({ prev_audit_hash: "a".repeat(64) }))).payload,
    ).toBeDefined();
    const { prev_audit_hash: _dropped, ...rest } = lateOrderAck();
    expectRefused(envelope(ACK, rest), "an ack with no prev_audit_hash");
  });

  // 11. `01-F5`'s "business fields land ADDITIVELY" is a live property of the family, not a
  //     historical note: `audit.print_acknowledged` already rides extras. A `strictObject` would
  //     satisfy every test above and make the family's stated growth path illegal.
  it("is a looseObject, so a later module's field is additive (01-F5)", () => {
    const parsed = parseEvent(envelope(ACK, lateOrderAck({ acknowledged_from: "home" }))).payload;
    expect(parsed).toMatchObject({ acknowledged_from: "home" });
  });

  // 12. `02-F41` / `01-F1`: WHO is the envelope's, and a payload copy is a second source for one
  //     fact that can never be corrected. Asserted as an absence the schema does not demand,
  //     because the risk here is an implementer "helpfully" requiring an actor field.
  it("does not require an actor in the payload — 02-F41 reads the envelope", () => {
    const parsed = parseEvent(envelope(ACK, lateOrderAck(), { actor_user_id: "user-hina" }));
    expect(parsed.envelope.actor_user_id).toBe("user-hina");
    expect(parsed.payload).not.toHaveProperty("actor_user_id");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C — `03-F53`: `printer.status_changed`, and the stalled/offline distinction.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("03-F53 — printer.status_changed becomes emittable", () => {
  // 13. `03-F11`'s two transitions, in `03-F53`'s field names. `05-F3` matches on the literal
  //     `offline`, so the spelling is load-bearing.
  it("accepts online and offline for a named printer (03-F11, 01-F4)", () => {
    expect(
      parseEvent(envelope(STATUS, { printer_name: PRINTER, status: "offline" })).payload,
    ).toMatchObject({ printer_name: PRINTER, status: "offline" });
    expect(
      parseEvent(envelope(STATUS, { printer_name: PRINTER, status: "online" })).payload,
    ).toMatchObject({ status: "online" });
  });

  // 14. THE FR's SUBSTANCE. `03-F41` separates `stalled` from `failed` because a printer holding a
  //     job for a missing roll ANSWERED the `DLE EOT 4` query — it is reachable. `03-F53` refuses
  //     the word at the schema so it cannot enter the ledger under `01-F1` and so a producer
  //     cannot quietly map paper-out onto offline.
  //     WRONG IMPLEMENTATION CAUGHT: `status: z.string()`, or an enum widened to the spooler's own
  //     five job states, which is the vocabulary sitting one import away in `packages/escpos`.
  it("REFUSES stalled, and every other status word (03-F53, 03-F41)", () => {
    for (const status of ["stalled", "paper_out", "failed", "OFFLINE", "", "unknown"]) {
      expectRefused(envelope(STATUS, { printer_name: PRINTER, status }), `status ${status}`);
    }
  });

  // 15. `03-F53`: the printer is named with `kot.print_failed`'s own field name, so `05-F3` can
  //     raise both onto one list without joining two spellings of one printer.
  it("REQUIRES a non-empty printer_name (03-F53, 05-F3)", () => {
    expectRefused(envelope(STATUS, { status: "offline" }), "no printer_name");
    expectRefused(envelope(STATUS, { printer_name: "", status: "offline" }), "empty printer_name");
  });

  // 16. It is an ORDINARY kernel event, not an audit one. If it were registered in the audit
  //     family the store would demand and stamp `prev_audit_hash` on a printer's status change,
  //     and every fixture in test 13 would still pass.
  it("is NOT an audit.* subtype and IS in the fold-consumed catalog (01-F5)", () => {
    expect(isAuditEvent(STATUS)).toBe(false);
    expect(eventRegistry.has(STATUS)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §D — NEGATIVE CONTROL. Everything above is a claim that TWO types became parseable. This is the
// claim that nothing ELSE did — without it, an implementation that made `parseEvent` permissive
// (a catch-all schema, a `has()` that returns true) passes §A–§C completely.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("negative control — 01-F4 still refuses what has no schema", () => {
  // 17. `table.state_changed` is in the `01 §4` catalog (doc 04's floor state, `05-F10`'s input)
  //     and has no payload schema in this package. It is the nearest neighbour to the two types
  //     this suite adds — same catalog, same absence, no FR in this round — so if it starts
  //     parsing, the registry was opened up rather than extended.
  it("throws UnknownEventTypeError for a catalog type with no schema (01-F4)", () => {
    expect(() =>
      parseEvent(envelope("table.state_changed", { table_id: "t-1", state: "occupied" })),
    ).toThrow(UnknownEventTypeError);
  });

  // 18. A near-miss on each of this round's two names. A registry keyed by prefix, or a schema
  //     reached through a `startsWith("audit.")`, passes §A and §B and admits these.
  it("throws for near-miss type names (01-F4, 01-F1)", () => {
    expect(() => parseEvent(envelope("audit.alarm_acknowledge", lateOrderAck()))).toThrow(
      UnknownEventTypeError,
    );
    expect(() => parseEvent(envelope("alarm.acknowledged", lateOrderAck()))).toThrow(
      UnknownEventTypeError,
    );
    expect(() =>
      parseEvent(envelope("printer.status", { printer_name: PRINTER, status: "offline" })),
    ).toThrow(UnknownEventTypeError);
  });
});
