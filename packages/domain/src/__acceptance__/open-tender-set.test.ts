/**
 * ACCEPTANCE TESTS — `01-F85`: the tender set is a SEED the owner extends; the reserved members
 * keep their kernel meaning; an unknown tender is ordinary and is NEVER refused.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** This file was written by a session that read
 * `specs/01-kernel-sync.md` (`01-F1`, `01-F17`, `01-F18`, `01-F29`, `01-F30`, `01-F31`, `01-F32`,
 * `01-F34`, `01-F37`, `01-F53`, `01-F55`, `01-F63`, `01-F85`), `specs/02-pos-app.md` (`02-F12`,
 * `02-F14`, `02-F23`, `02-F42`) and `specs/DECISIONS.md` (`DEC-MONEY-007`) and did **not** write the
 * implementation it describes. It is the oracle for that work (`24 §3` step 2) and is read-only to
 * the implementing session.
 *
 * ⚠ **`packages/domain` IS A PROTECTED PATH (`20 §4.4`, commandment 10).** This FR OPENS a closed
 * enum on a money field. Everything it admits is admitted permanently (`01-F1`), and everything it
 * keeps closed is a refusal a till performs mid-service. §0 is what a reviewer should argue with.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   01-F85  "`payment.recorded.method` stops being a build-time enum and becomes an **org-scoped
 *           tender id**. `02-F12`'s four tenders and `01-F32`'s fifth are **RESERVED ids whose
 *           kernel meaning is unchanged** … and no owner may mint a second of either."
 *   01-F85  "**AN UNKNOWN TENDER IS SCHEMA-VALID AND FOLDS AS AN ORDINARY ONE, AT EVERY INGEST
 *           PATH** (`01-F17`, `01-F37`, and `01-F31`'s ratified *detect and alarm, never reject*).
 *           An unknown id is the **normal** condition of a device holding an older reference-data
 *           version than the till that minted the payment — not an attack — and refusing it stops a
 *           sale or wedges an outbox on a poison event. **The check moves to the WRITER**."
 *   01-F85  "**NO FOLD MAY BRANCH ON AN OWNER-TYPED ID.** `01-F32`'s arms key on the reserved ids
 *           only and every other id falls to the ordinary tender arm, because a fold arm keyed on
 *           layer-2 configuration means a **renamed tender changes a projected value** (`01-F34`)."
 *   01-F85  "**`shift.closed`'s `expected_paisa_by_method` BREAKS, AND RE-STATING IT IS THE PRICE
 *           OF THIS RULING** … the map is keyed by tender id, its keys are **the set the closing
 *           device held**, and it is an **attestation** on `01-F63`'s rule … An explicit `0` still
 *           means *no sales on this tender*; an **absent key now means the closing device did not
 *           hold that tender**, a third state that did not exist before and that no reader may
 *           collapse into zero."
 *   01-F85  "`payment.refunded.method` (`cash_out | raast_reversal_ref | khata_credit`) is **not**
 *           opened … an owner configures what a customer may pay **with** and nobody configures the
 *           mechanism by which money is returned. Stated so it is not opened later by symmetry."
 *   01-F63  "an absent `billed_paisa` asserts **no ceiling** (*"no attestation" is not "attested
 *           zero"*)" — the same three-state rule one event over, and the FR `01-F85` cites.
 *   01-F34  device folds "read **no ordering metadata** … equal delivered set ⇒ byte-equal
 *           projection".
 *   02-F23  shift close carries "system-expected cash (by method)".
 *
 * ## THE CASE THAT MATTERS, stated so the round-3 law can be checked against this file
 *
 * The happy path here is worthless. `payment.recorded { method: "cash" }` parses today, parses
 * after this FR, and parses under every wrong implementation of it. There are three cases that
 * separate a correct implementation from a plausible wrong one, and each has its own section:
 *
 * **(1) THE UNKNOWN ID ARRIVING AT INGEST (§B).** This is the money case. A till on reference-data
 * v9 mints `payment.recorded { method: "jazzcash" }`; a second till on v8 receives it. If the
 * schema refuses, that device's outbox wedges on a poison event and the branch stops seeing the
 * events behind it — `01-F17` and `01-F37` in one stroke. The tempting wrong implementations are
 * an unchanged `z.enum(PAYMENT_METHODS)` (today's tree), a HARDCODED WIDENING
 * (`z.enum([...PAYMENT_METHODS, "jazzcash"])` — which passes any suite whose fixtures use one
 * id), and a NORMALIZING schema that maps an unknown id to a fallback bucket. §B is aimed at all
 * three: many unrelated ids, each asserted to survive **verbatim**.
 *
 * **(2) THE RENAMED TENDER (§E).** `01-F34` in its strongest form: an owner renames a tender and
 * no projected value may move. Expressed at the only layer this package can observe it — a
 * bijective relabel of every owner-typed id across a fixture must leave every accept/refuse verdict
 * unchanged and the parsed projection byte-identical under the same relabel. A hardcoded widening
 * dies here even if it survived §B; so does any schema that treats one owner id differently from
 * another.
 *
 * **(3) ABSENT vs EXPLICIT ZERO IN THE ATTESTATION (§F).** The third state. The plausible wrong
 * implementation is not "refuses the map" — it is a schema that ACCEPTS a partial map and quietly
 * fills the reserved five with zeros (`z.number().int().default(0)` per reserved key is a two-token
 * edit of the shipped `expectedPaisaByMethod`). That parses every fixture, satisfies every "a
 * partial map is accepted" test, and destroys the distinction the FR was written to create: the
 * cashier's Thursday close would attest a Rs 0 card figure for a tender her device never held. §F3
 * is aimed at exactly that and asserts the parsed key SET, not just the values.
 *
 * ## §0 — PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — the reserved set stays at FIVE and stays declared once in `@restos/domain`.** `01-F85`
 * fixes the membership (`02-F12`'s four + `01-F32`'s fifth) and forbids a second of the two special
 * ones. §A resolves the export by SHAPE rather than by name — any exported readonly string array
 * containing the five — so that renaming `PAYMENT_METHODS` (defensible: it is now a reserved seed,
 * not the set of methods) does not red this file, while WIDENING it does. The named simpler
 * alternative, asserting the literal name `PAYMENT_METHODS`, is refused because it would make a
 * legal rename indistinguishable from a deletion, and a test that stays red under a correct
 * implementation blocks the implementer indefinitely.
 *
 * **P2 — `payment.recorded.method` is a required, non-empty string and nothing more.** `01-F85`
 * says the check "moves to the WRITER"; a format constraint in the kernel is a refusal at ingest
 * wearing a validator, which is the exact failure the FR names. Non-empty because an empty id names
 * no tender and every required id in this registry is `.min(1)`. **The named alternative — a slug
 * pattern — is refused for a checkable reason and not a stylistic one:** `01-F85` calls it an
 * "org-scoped tender **id**", every other id in this platform is UUID-class (`DEC-MONEY-008`), and
 * a pattern that refused a hyphen would refuse a UUID-shaped tender id. §B's battery therefore
 * includes hyphenated and UUID-shaped ids on purpose.
 *
 * **P3 — `expected_paisa_by_method` stays REQUIRED on `shift.closed`; only its KEYS change.**
 * `02-F23` requires the figure and `01-F85` re-states the field rather than removing it. What
 * `01-F63`'s "an absent attestation is not an attested zero" governs here is an absent KEY inside
 * the map, not an absent map: a close with no map at all attests nothing about any tender and
 * `02-F23`'s own words require it. Values stay SIGNED integers — the shipped comment gives the
 * reason ("a method's expected figure nets `payment.refunded` against `payment.recorded`").
 *
 * **P4 — an owner-typed tender is `purpose: settles_order` and carries no kernel behaviour**
 * (`01-F85`: "it is an ordinary `purpose: settles_order` tender and nothing more"). §G asserts the
 * schema does not COUPLE the two axes: `purpose` is the `01-F32`/`DEC-MONEY-007` discriminator and
 * `method` is not, so every (method, purpose) pair the two enums allow must parse. This is the pin
 * that stops an implementation "helpfully" refusing `{ method: "jazzcash", purpose:
 * "repays_receivable" }` — a cash-only khata repayment is `02-F14`'s ordinary case and the
 * discriminator was never the method.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN, and why
 *
 * - **Where the tender set LIVES.** `01-F85` refuses to choose a carrier in terms ("choosing a
 *   carrier for one resource here would answer it by accident"). Nothing here asserts a
 *   `01-F75` resource, a `config.changed` payload or a reference-data version.
 * - **The WRITER's check.** The FR moves the typo check to the tender editor (doc 14 / `00 §7`
 *   layer 2). No schema can observe a writer.
 * - **The FOLD's arms.** `01-F32`'s conservation behaviour for `khata_credit` and
 *   `aggregator_receivable` lives in `packages/sync-client`'s merge engine and belongs to its
 *   oracle (`26 §7`, `26 §8`). §E asserts the invariance property in the form this package can
 *   observe — parse ∘ relabel = relabel ∘ parse — which is the kernel half of it.
 *   ⚠ **Measured while authoring (2026-08-23), and recorded as a finding rather than asserted:**
 *   `packages/sync-client/src/folds/shift-cash.ts:591` already iterates `tendered.expected` and
 *   reads `close.expected_paisa_by_method` as a bare `Record<string, number>`, so that fold is
 *   already key-agnostic. `packages/escpos/src/cash-documents.ts:217` and
 *   `apps/pos-electron/src/main/printing.ts:1504,1752,1757` and
 *   `apps/pos-electron/src/renderer/CashSurfaces.tsx:161,282` iterate `PAYMENT_METHODS` instead,
 *   so an owner-typed tender is silently DROPPED from the printed cash slip, the receipt's tender
 *   list and the cash tab's expected column the day one exists. Those are not this package's and
 *   are named for their owners.
 * - **Deactivation and non-reuse of a tender id** (`01-F85` on `01-F55`'s tombstone precedent).
 *   That is a property of the tender REGISTRY, which has no carrier yet, and nothing in an event
 *   schema can observe it.
 */

import { describe, expect, it } from "vitest";
import * as domain from "../index.js";
import { canonicalJson, parseEvent, UnknownEventTypeError } from "../index.js";

/** `02-F12`'s four + `01-F32`'s fifth, transcribed. `01-F85` fixes this membership. */
const RESERVED_IDS = ["cash", "card", "raast", "khata_credit", "aggregator_receivable"] as const;

/** `01-F29`'s refund methods, transcribed. NOT opened by this FR. */
const REFUND_METHODS = ["cash_out", "raast_reversal_ref", "khata_credit"] as const;

/**
 * Owner-typed tender ids. Deliberately heterogeneous in SHAPE (P2): a bare slug, a hyphenated id,
 * a UUID-shaped id, a digit-bearing id, a long one. None is a reserved id and none is a substring
 * trick — the point is that the kernel knows nothing about any of them.
 */
const OWNER_IDS = [
  "jazzcash",
  "easypaisa",
  "meal_voucher",
  "sada-pay",
  "tender-0193b0f0-5555-7000-8000-0000000000e5",
  "corporate_account_2",
  "loyalty_points",
] as const;

const envelope = (type: string, payload: unknown): unknown =>
  ({
    id: "0193b0f0-0000-7000-8000-000000000085",
    org_id: "org-1",
    branch_id: "branch-1",
    device_id: "device-counter-1",
    actor_user_id: "user-ayesha",
    lamport_seq: 85,
    device_created_at: 1_755_000_000_000,
    branch_created_at: 1_755_000_000_000,
    time_basis: "branch",
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  }) as unknown;

const payment = (method: unknown, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  order_id: "order-1",
  amount_paisa: 45_000,
  method,
  settlement_attempt_id: "0193b0f0-2222-7000-8000-0000000000b2",
  shift_id: "shift-1",
  purpose: "settles_order",
  ...over,
});

const refund = (method: unknown): Record<string, unknown> => ({
  order_id: "order-1",
  amount_paisa: 45_000,
  method,
  settlement_attempt_id: "0193b0f0-3333-7000-8000-0000000000c3",
  payment_attempt_id: "0193b0f0-2222-7000-8000-0000000000b2",
});

const shiftClose = (expected: unknown): Record<string, unknown> => ({
  shift_id: "shift-1",
  expected_paisa_by_method: expected,
  counted_cash_paisa: 250_000,
  variance_paisa: -1_500,
});

const parses = (type: string, payload: unknown): ReturnType<typeof parseEvent> =>
  parseEvent(envelope(type, payload));

/** A refusal ANCHORED ON THE SCHEMA, never on `01-F4` — see `escalatable-write-schemas.test.ts`. */
const refuses = (type: string, payload: unknown, why: string): void => {
  let thrown: unknown = null;
  try {
    parseEvent(envelope(type, payload));
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `${type} accepted a payload it must refuse — ${why}`).toBeInstanceOf(Error);
  expect(
    thrown,
    `${type} was refused by 01-F4 (no schema at all), not by its schema — this assertion is vacuous`,
  ).not.toBeInstanceOf(UnknownEventTypeError);
};

/** Did this parse succeed? Used where the VERDICT, not the value, is the assertion. */
const accepts = (type: string, payload: unknown): boolean => {
  try {
    parseEvent(envelope(type, payload));
    return true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F85/P1: FIVE reserved ids, declared once, and no sixth may be minted into the kernel.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F85 — the reserved tender ids stay at five and keep their kernel meaning", () => {
  /**
   * Resolved by SHAPE, not by name (P1). Any exported readonly string array that contains all five
   * reserved ids is a candidate declaration of the reserved set — so a rename survives and a
   * widening does not.
   */
  const reservedSetExports = (): ReadonlyArray<readonly [string, readonly string[]]> =>
    Object.entries(domain).filter(
      (entry): entry is [string, readonly string[]] =>
        Array.isArray(entry[1]) &&
        (entry[1] as unknown[]).every((m) => typeof m === "string") &&
        RESERVED_IDS.every((id) => (entry[1] as readonly string[]).includes(id)),
    );

  it("`@restos/domain` still declares the reserved tender set (18 §4: declared once, here)", () => {
    // If this fails, the reserved set was deleted rather than re-scoped. `01-F85` keeps it: the
    // five ids are what `01-F32` and `DEC-MONEY-007` key their conservation arms on, and a set
    // nothing declares is a set every consumer re-types.
    expect(
      reservedSetExports().map(([name]) => name),
      "no export of @restos/domain holds all five reserved tender ids",
    ).not.toEqual([]);
  });

  it("every such export holds EXACTLY the five — no owner may mint a sixth reserved id", () => {
    // The widening mutant: `PAYMENT_METHODS` grown to admit an owner's tender at build time.
    // That is the shape `01-F85` forbids in terms ("no owner may mint a second of either"), and
    // it is also how a lazy implementation makes §B pass without opening anything.
    for (const [name, members] of reservedSetExports()) {
      expect([...members].sort(), `${name} is no longer exactly the five reserved ids`).toEqual(
        [...RESERVED_IDS].sort(),
      );
    }
  });

  it.each(RESERVED_IDS)(
    "`payment.recorded { method: %s }` still parses — kernel meaning unchanged",
    (method) => {
      expect(
        (parses("payment.recorded", payment(method)).payload as Record<string, unknown>).method,
      ).toBe(method);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE CASE THAT MATTERS (1): an unknown tender is schema-valid and is NEVER refused.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F85/01-F17/01-F37 — an UNKNOWN tender id parses at ingest, verbatim", () => {
  it.each(OWNER_IDS)("an owner-typed tender `%s` is accepted on payment.recorded", (method) => {
    // The normal condition of a device holding an older reference-data version than the till that
    // minted the payment. A refusal here wedges that device's outbox on a poison event (`01-F37`)
    // or stops a sale (`01-F17`) — which is why the FR moves the check to the writer.
    const parsed = parses("payment.recorded", payment(method));
    expect(
      (parsed.payload as Record<string, unknown>).method,
      "01-F85: an unknown tender folds as an ORDINARY one — never normalized, never bucketed",
    ).toBe(method);
  });

  it("the battery is genuinely unknown (24-F14 — a battery of reserved ids proves nothing)", () => {
    // The guard on the guard. If any of these were a reserved id, §B would pass against an
    // unchanged `z.enum(PAYMENT_METHODS)` — the tree as it stands today.
    for (const id of OWNER_IDS) {
      expect(
        (RESERVED_IDS as readonly string[]).includes(id),
        `"${id}" is a RESERVED id — this battery no longer discriminates`,
      ).toBe(false);
    }
    expect(
      OWNER_IDS.length,
      "one unknown id cannot separate an open set from a hardcoded widening",
    ).toBeGreaterThan(4);
  });

  it("the whole payload survives an unknown tender — nothing else is coerced or dropped", () => {
    const before = payment("jazzcash", { shift_id: null });
    const after = parses("payment.recorded", before).payload;
    expect(
      canonicalJson(after as Record<string, unknown>),
      "the parse rewrote a payload carrying an unknown tender",
    ).toBe(canonicalJson(before));
  });

  it("an unknown tender is accepted at EVERY amount, including 0 and a large one", () => {
    // `01-F17`: a sale is never blocked. A schema that refused the unknown id only on some
    // amounts would be an ingest-path refusal wearing a different field.
    for (const amount_paisa of [0, 1, 45_000, 9_007_199_254_740_990]) {
      expect(
        accepts("payment.recorded", payment("jazzcash", { amount_paisa })),
        `amount ${amount_paisa}`,
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — P2: what the OPEN field still refuses. An open set is not an absent field.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F85/P2 — `method` is required and non-empty; openness is not absence", () => {
  it("is REFUSED with no method at all", () => {
    const p = payment("cash");
    delete p.method;
    refuses("payment.recorded", p, "an unmethoded payment names no tender — 02-F12 requires one");
  });

  it("is REFUSED with an empty method", () => {
    refuses("payment.recorded", payment(""), "an empty id names no tender (P2)");
  });

  it("is REFUSED with a non-string method", () => {
    refuses("payment.recorded", payment(3), "a tender id is a string");
    refuses("payment.recorded", payment(null), "null names no tender");
    refuses("payment.recorded", payment(["cash"]), "a list names no tender");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F85: `payment.refunded.method` is NOT opened. Stated so it is not opened by symmetry.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F85 — the REFUND method stays CLOSED at `01-F29`'s three", () => {
  it.each(REFUND_METHODS)("`payment.refunded { method: %s }` parses", (method) => {
    expect(
      (parses("payment.refunded", refund(method)).payload as Record<string, unknown>).method,
    ).toBe(method);
  });

  it.each(OWNER_IDS)("an owner-typed tender `%s` is REFUSED on payment.refunded", (method) => {
    // The copy-paste mutant: both `method` fields opened in one edit, because they share a name.
    // `01-F85` refuses it with a reason — "an owner configures what a customer may pay WITH and
    // nobody configures the mechanism by which money is returned" — and says so precisely to stop
    // a later session opening it by symmetry.
    refuses("payment.refunded", refund(method), "01-F85: the refund method is NOT opened");
  });

  it("the two sets are genuinely different: `cash` settles but does not refund; `khata_credit` does both", () => {
    // The asymmetry that makes §D more than a second copy of §A. `cash` is a legal SETTLEMENT
    // method and an illegal REFUND method (the refund is `cash_out`), so an implementation that
    // pointed both fields at one list — in either direction — dies here.
    expect(accepts("payment.recorded", payment("cash"))).toBe(true);
    expect(accepts("payment.refunded", refund("cash"))).toBe(false);
    expect(accepts("payment.recorded", payment("khata_credit"))).toBe(true);
    expect(accepts("payment.refunded", refund("khata_credit"))).toBe(true);
    expect(accepts("payment.recorded", payment("cash_out"))).toBe(true); // open set: any id
    expect(accepts("payment.refunded", refund("raast"))).toBe(false); // closed set: not a member
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE CASE THAT MATTERS (2): 01-F34 — a RENAMED tender moves nothing the kernel projects.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A bijective relabel of the owner-typed ids ONLY. The reserved five are deliberately fixed
 * points: `01-F85` keeps their kernel meaning, so relabelling them would be testing a different
 * (and forbidden) thing.
 */
const RELABEL: Readonly<Record<string, string>> = {
  jazzcash: "sadapay",
  easypaisa: "nayapay",
  meal_voucher: "staff_credit",
  "sada-pay": "zindigi",
  "tender-0193b0f0-5555-7000-8000-0000000000e5": "tender-0193b0f0-6666-7000-8000-0000000000f6",
  corporate_account_2: "corporate_account_9",
  loyalty_points: "points_wallet",
};

const relabelId = (id: string): string => RELABEL[id] ?? id;

/** Relabel every place a tender id can appear in a payload: the `method`, and the attestation's KEYS. */
const relabelPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...payload };
  if (typeof out.method === "string") out.method = relabelId(out.method);
  const expected = out.expected_paisa_by_method;
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    out.expected_paisa_by_method = Object.fromEntries(
      Object.entries(expected as Record<string, unknown>).map(([k, v]) => [relabelId(k), v]),
    );
  }
  return out;
};

/** The fixture the relabel runs over: every reserved id, every owner id, and one attestation. */
const RELABEL_FIXTURE: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ...RESERVED_IDS.map((m) => ["payment.recorded", payment(m)] as const),
  ...OWNER_IDS.map((m) => ["payment.recorded", payment(m)] as const),
  [
    "shift.closed",
    shiftClose({ cash: 250_000, card: 0, jazzcash: 12_000, meal_voucher: -500, "sada-pay": 9_900 }),
  ] as const,
];

describe("§E 01-F34/01-F85 — renaming an owner-typed tender changes NOTHING the kernel projects", () => {
  it("the relabel is not vacuous (24-F14): it actually moves ids, and only owner-typed ones", () => {
    // Without this guard, a relabel map that happened to be the identity would make every
    // assertion below true by construction — the round-3 failure exactly.
    const before = RELABEL_FIXTURE.map(([, p]) => canonicalJson(p)).join("\n");
    const after = RELABEL_FIXTURE.map(([, p]) => canonicalJson(relabelPayload(p))).join("\n");
    expect(after, "the relabel moved nothing").not.toBe(before);
    for (const id of RESERVED_IDS) {
      expect(
        relabelId(id),
        `the relabel moved the RESERVED id ${id} — those are fixed points`,
      ).toBe(id);
    }
    for (const id of OWNER_IDS) {
      expect(relabelId(id), `the relabel left the owner-typed id ${id} alone`).not.toBe(id);
    }
  });

  it("every accept/refuse VERDICT is invariant under the relabel", () => {
    // The hardcoded-widening mutant dies here even if it survived §B: `z.enum([...RESERVED,
    // "jazzcash"])` accepts the fixture and refuses its relabel.
    for (const [type, p] of RELABEL_FIXTURE) {
      const before = accepts(type, p);
      const after = accepts(type, relabelPayload(p));
      expect(after, `${type} with ${canonicalJson(p)} changed verdict under a rename`).toBe(before);
      expect(before, `${type} with ${canonicalJson(p)} must be accepted at all`).toBe(true);
    }
  });

  it("parse ∘ relabel = relabel ∘ parse — the projection is byte-identical under a rename", () => {
    // `01-F34`'s "equal delivered set ⇒ byte-equal projection", in the form this package can
    // observe: the only difference a rename may make to what the kernel hands a fold is the name
    // itself. A schema that normalized an unknown id, bucketed it, or dropped an unknown key from
    // the attestation dies here.
    for (const [type, p] of RELABEL_FIXTURE) {
      const parsedThenRelabelled = canonicalJson(
        relabelPayload(parses(type, p).payload as Record<string, unknown>),
      );
      const relabelledThenParsed = canonicalJson(
        parses(type, relabelPayload(p)).payload as Record<string, unknown>,
      );
      expect(relabelledThenParsed, `${type}: renaming a tender changed the projection`).toBe(
        parsedThenRelabelled,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE CASE THAT MATTERS (3): `expected_paisa_by_method` is an ATTESTATION with THREE states.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F85/01-F63/02-F23 — the shift attestation is keyed by tender id, and absent ≠ zero", () => {
  it("F1 — an owner-typed tender id is a legal KEY", () => {
    // Today's `z.strictObject` derived from the closed set refuses this outright, so a Thursday
    // close on a device holding a sixth tender is unemittable: the shift cannot be closed at all.
    const map = {
      cash: 250_000,
      card: 40_000,
      raast: 0,
      khata_credit: 0,
      aggregator_receivable: 0,
      jazzcash: 12_000,
    };
    expect(
      (parses("shift.closed", shiftClose(map)).payload as Record<string, unknown>)
        .expected_paisa_by_method,
    ).toEqual(map);
  });

  it("F2 — a PARTIAL map is legal: the keys are the set the CLOSING DEVICE held", () => {
    // "A shift closed on Tuesday cannot be validated against Thursday's tenders." A device that
    // held three tenders attests three, and an exhaustiveness check on a per-org set that changes
    // over time is a check no schema can perform.
    const map = { cash: 250_000, jazzcash: 12_000, card: 0 };
    expect(accepts("shift.closed", shiftClose(map)), "a partial attestation was refused").toBe(
      true,
    );
  });

  /**
   * **F3 IS THE ASSERTION THIS SECTION EXISTS FOR.** Everything above passes against a schema that
   * accepts a partial map and fills the reserved five with zeros — a two-token edit of the shipped
   * `expectedPaisaByMethod` (`z.number().int().default(0)`). That implementation destroys the third
   * state while satisfying every "a partial map is accepted" test, and it does it silently: the
   * cashier's close would attest a Rs 0 card figure for a tender her device never held, permanently
   * under `01-F1`.
   */
  it("F3 — an ABSENT key stays ABSENT after the parse: no reader may collapse it into zero", () => {
    const supplied = { cash: 250_000, jazzcash: 12_000 };
    const parsed = parses("shift.closed", shiftClose(supplied)).payload as Record<string, unknown>;
    const map = parsed.expected_paisa_by_method as Record<string, unknown>;
    expect(
      Object.keys(map).sort(),
      "01-F85: the keys are the set the closing device held — the parse invented or dropped one",
    ).toEqual(["cash", "jazzcash"]);
    for (const id of ["card", "raast", "khata_credit", "aggregator_receivable"]) {
      expect(
        Object.hasOwn(map, id),
        `\`${id}\` was defaulted into the attestation — "not held" was collapsed into "attested zero" (01-F63)`,
      ).toBe(false);
      expect(
        map[id],
        `\`${id}\` reads as a number the closing device never attested`,
      ).toBeUndefined();
    }
  });

  it("F4 — an EXPLICIT zero is preserved and is DISTINGUISHABLE from an absent key", () => {
    // The other half of F3, and the one that makes the third state a third state rather than a
    // renaming of the second: `{ card: 0 }` and `{}` must not produce the same projection.
    const withZero = parses("shift.closed", shiftClose({ cash: 250_000, card: 0 }))
      .payload as Record<string, unknown>;
    const withoutKey = parses("shift.closed", shiftClose({ cash: 250_000 })).payload as Record<
      string,
      unknown
    >;
    expect((withZero.expected_paisa_by_method as Record<string, unknown>).card).toBe(0);
    expect(Object.hasOwn(withoutKey.expected_paisa_by_method as object, "card")).toBe(false);
    expect(
      canonicalJson(withZero.expected_paisa_by_method as Record<string, unknown>),
      "an explicit 0 and an absent key produced the same bytes — the third state does not exist",
    ).not.toBe(canonicalJson(withoutKey.expected_paisa_by_method as Record<string, unknown>));
  });

  it("F5 — values stay SIGNED INTEGER paisa (00 §6): a float, a string or null is refused", () => {
    expect(
      accepts("shift.closed", shiftClose({ cash: -1_500 })),
      "a negative expected figure nets a refund",
    ).toBe(true);
    refuses("shift.closed", shiftClose({ cash: 250_000.5 }), "00 §6: floats in ledgers never");
    refuses("shift.closed", shiftClose({ cash: "250000" }), "a money figure is a number");
    refuses("shift.closed", shiftClose({ cash: null }), "null is not an attested figure");
    refuses("shift.closed", shiftClose({ cash: Number.NaN }), "NaN is not an attested figure");
  });

  it("F6 — the attestation itself is still REQUIRED, and `02-F23`'s other two fields are untouched (P3)", () => {
    const p = shiftClose({ cash: 250_000 });
    delete p.expected_paisa_by_method;
    refuses("shift.closed", p, "02-F23 requires system-expected cash BY METHOD on the close");
    refuses(
      "shift.closed",
      { ...shiftClose({ cash: 1 }), counted_cash_paisa: undefined },
      "02-F23's count is the act",
    );
    refuses(
      "shift.closed",
      { ...shiftClose({ cash: 1 }), variance_paisa: undefined },
      "02-F23's over/short is carried",
    );
    refuses("shift.closed", shiftClose("250000"), "the attestation is a map, not a scalar");
    refuses("shift.closed", shiftClose([250_000]), "the attestation is a map, not a list");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — P4: `purpose` is the conservation discriminator and `method` is not.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 01-F32/DEC-MONEY-007/P4 — an owner-typed tender carries NO kernel behaviour", () => {
  const PURPOSES = ["settles_order", "repays_receivable"] as const;

  it.each(PURPOSES)("an owner-typed tender parses with purpose `%s`", (purpose) => {
    // `02-F14`'s khata repayment is "a `payment.recorded` referencing the original order(s)" and
    // its METHOD is whatever the customer hands over — cash, card, or an owner's wallet. Tying
    // the two axes together would refuse the ordinary case, so the schema must not.
    expect(accepts("payment.recorded", payment("jazzcash", { purpose }))).toBe(true);
  });

  it.each(RESERVED_IDS)(
    "a reserved tender `%s` parses under BOTH purposes — the axes are independent",
    (method) => {
      for (const purpose of PURPOSES) {
        expect(
          accepts("payment.recorded", payment(method, { purpose })),
          `${method} / ${purpose}`,
        ).toBe(true);
      }
    },
  );

  it("`purpose` itself stays CLOSED at two — the discriminator this FR does NOT open", () => {
    refuses(
      "payment.recorded",
      payment("cash", { purpose: "tops_up_wallet" }),
      "01-F32/DEC-MONEY-007: two purposes",
    );
    const p = payment("cash");
    delete p.purpose;
    refuses("payment.recorded", p, "an unpurposed payment is neither tendering nor repayment");
  });

  it("`shift_id` stays REQUIRED AND NULLABLE beside the opened method (02-F37)", () => {
    // The regression pin: opening `method` must not disturb its neighbours. `null` is
    // `02-F37`'s stated fact ("settling with no shift open succeeds"); absence is a writer
    // forgetting, and an `.optional()` field cannot tell them apart.
    expect(accepts("payment.recorded", payment("jazzcash", { shift_id: null }))).toBe(true);
    const p = payment("jazzcash");
    delete p.shift_id;
    refuses("payment.recorded", p, "02-F37: null is a stated fact, absent is a forgotten field");
  });
});
