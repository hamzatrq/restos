/**
 * ACCEPTANCE TESTS — `01-F83`: every corrective carrying an AMOUNT carries an `01-F31`-class
 * attempt key, and it is called `adjustment_attempt_id`.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** This file was written by a session that read
 * `specs/01-kernel-sync.md` (`01-F29`, `01-F30`, `01-F31`, `01-F34`, `01-F35`, `01-F83`),
 * `specs/DECISIONS.md` (`DEC-MONEY-008`, `DEC-MONEY-010`) and `specs/02-pos-app.md` (`02-F20`,
 * `02-F45`) and did **not** write the implementation it describes. It is the oracle for that work
 * (`24 §3` step 2) and is read-only to the implementing session.
 *
 * ⚠ **`packages/domain` IS A PROTECTED PATH (`20 §4.4`, commandment 10).** Every pin below is a
 * change to the kernel's event catalog, which is append-only downstream: a field this file makes
 * REQUIRED can never be relaxed for events already written, and a field it leaves out can never be
 * made required later without refusing history (`01-F1`). The interpretations are in §0 — they are
 * the part an adversarial reviewer should argue with.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   01-F83  "Every corrective carrying an amount mints an `adjustment_attempt_id` in the same
 *           org-global, UI-minted, UUID-class namespace, deduped by the same keyed sum — a
 *           different field name because it sits on the other side of `01-F30`'s equation."
 *   01-F83  "Measured 2026-08-23 … `void.recorded`, `comp.recorded`, `discount.recorded` and
 *           `order.line_price_overridden` each carry an order key, an amount, a reason and an
 *           approver — **and no key**." The count stays FOUR; the membership is corrected.
 *   01-F83  "THE NAME IS `adjustment_attempt_id` … **One namespace, two field names:** the token
 *           obeys `01-F31` unchanged (org-globally unique, UI-minted, UUID-class per
 *           `DEC-MONEY-008`), sharing its uniqueness space with `settlement_attempt_id` because
 *           that space is what stops a collision — and carrying a **different field name** because
 *           the field name is what stops a fold from summing both sides of `01-F30`'s equation
 *           into one Σ."
 *   01-F83  "A second key on `payment.refunded` would be `02-F45`'s second source for one fact …
 *           and it would fragment `01-F29`'s cap."
 *   01-F83  "it deliberately does **not** reach `order.cancelled` or `order.rejected` … they carry
 *           no amount and are terminal monotone facts under `01-F35`, so a key on them would
 *           dedupe nothing, and the refusal is written down so a later session does not add one by
 *           symmetry."
 *   01-F29  `payment.refunded` "carries `order_id`, its **own** `settlement_attempt_id` (01-F31),
 *           and references its parent payment by **`payment_attempt_id`** … two fields, never one".
 *   01-F31  "folds dedupe by attempt key: unique-keyed maps whose Σ skips disputed keys. **The
 *           payload minus its key is the immutable intent.**"
 *   01-F4   "Producing an unknown/invalid event type is a build-time and runtime error." A refusal
 *           that comes from `01-F4` rather than from a schema is a VACUOUS assertion — see
 *           `refuses()` below.
 *
 * ## THE CASE THAT MATTERS, stated so the round-3 law can be checked against this file
 *
 * It is **not** "does Zod refuse a missing key" — every Zod object does that, and a suite of those
 * passes against any implementation of anything. There are two, and both are about the NAME:
 *
 * **(1) The key must land on exactly four payloads and on no fifth.** R56's literal list names
 * `payment.refunded`, which has carried two keys since `01-F29` was written; the tempting
 * implementation is the ruling read literally — add the key to all five, or to all six correctives
 * — which makes `payment.refunded` carry THREE attempt-shaped fields and re-opens the fragmentation
 * `01-F29` closed in those words. §C is aimed at that mutant and nothing else: it asserts the three
 * NON-members parse with no key at all, so an implementation that requires one on any of them dies.
 *
 * **(2) The FIELD NAME is the mechanism, not decoration.** A fold sums `settlement_attempt_id`
 * keys on the left of `01-F30`'s equation and `adjustment_attempt_id` keys on the right; one name
 * for both makes a void and a payment collide in one Σ. The tempting implementation is to reuse
 * `settlement_attempt_id` on the four (it is already in this file, already typed, already
 * understood). §B is aimed at exactly that, in BOTH directions — a corrective that supplies only
 * `settlement_attempt_id` is refused, and a `payment.recorded` that supplies only
 * `adjustment_attempt_id` is refused. Neither name may absorb the other.
 *
 * ## §0 — PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — `adjustment_attempt_id` is REQUIRED, not optional.** `01-F31`'s mechanism IS a key
 * ("folds dedupe by attempt key … a fold never picks a winner"), and `DEC-MONEY-010`'s gate (ii)
 * requires "an `01-F31`-class idempotency key in its payload" on all four before any of
 * `01-F30`'s terms may enter. An `.optional()` key is a key a writer may omit, and the first
 * omitted one is permanent under `01-F1`. This is `order.line_price_overridden.supersedes`'
 * recorded argument in this same registry: "a field omitted and later needed cannot be added as
 * required at all". The named simpler alternative — optional now, required when the emitters land —
 * is refused because the window closes at the FIRST emit and `DEC-MONEY-010` (i) says there are
 * none today, so the window is open exactly now.
 *
 * **P2 — the schema shape is `settlement_attempt_id`'s, whatever that is.** `01-F83` says the
 * token "obeys `01-F31` unchanged … sharing its uniqueness space". Uniqueness is org-global and no
 * single event can be checked against it — `01-F31` puts the enforcement at mint time and at the
 * gateway ("DETECT AND ALARM, NEVER REJECT"), so a schema that refused a non-UUID here would be
 * inventing a rejection the FR forbids one layer up. §D therefore pins the shapes to each other
 * rather than to a literal: for every candidate value, the two fields must give the SAME verdict.
 * That kills both drift directions (a `.uuid()` on one, a bare `z.string()` on the other) without
 * this file guessing which shape is right. If a later FR tightens one, it tightens both, which is
 * what "one namespace" means.
 *
 * **P3 — nothing here relaxes what the four payloads already require.** §E is a regression pin:
 * `order_id`, `amount_paisa`, `reason` and `approver_user_id` (required-and-nullable) survive, and
 * `order.line_price_overridden` keeps `line_id`, `unit_price_paisa` and `supersedes`. A key added
 * by rewriting the payload around it is a different change from a key added to it.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN, and why
 *
 * - **Where the key is minted.** `01-F83` says "at the UI, at `02-F20`'s approval path, before the
 *   append" — an emitter fact, and `DEC-MONEY-010` (i) measures that all four emitters are absent.
 *   No schema can observe where a string came from.
 * - **The FOLD's keyed sum.** `01-F31`'s dedupe, the disputed-key rule and the "contributes zero"
 *   arithmetic belong to `packages/sync-client`'s merge engine and its oracle; `26 §7` requires an
 *   oracle-pinned merge rule (`DEC-MONEY-010` gate (iii)) before the engine may consume one.
 * - **`01-F30`'s three terms.** They stay ABSENT: this closes gate (ii) only, and
 *   `__acceptance__/conservation-terms-gate.test.ts` owns the gate itself. Nothing here may be read
 *   as admitting `void_value`, `comp_value` or `discounts` into `settledConservationResidualPaisa`.
 * - **Whether an extra `adjustment_attempt_id` on a non-member is REFUSED.** It is not: every
 *   payload here is a `looseObject` and `00 §6` makes extra fields additive and pass-through. §C
 *   asserts the honest and load-bearing half — that none of the three REQUIRES one.
 *
 * ⚠ **§C's `order.cancelled` leg also depends on `01-F84` landing** (that type has no payload
 * schema at all today, so `parseEvent` throws `UnknownEventTypeError` for it). The two FRs are one
 * wave and one implementing session; `order-cancelled-schema.test.ts` is that leg's owner.
 */

import { describe, expect, it } from "vitest";
import { parseEvent, UnknownEventTypeError } from "../index.js";

const CASHIER = "user-ayesha";
const MANAGER = "user-hina";

/** A minimal legal envelope (`01-F62` branch scope). `type` and `payload` are what vary here. */
const envelope = (type: string, payload: unknown): unknown =>
  ({
    id: "0193b0f0-0000-7000-8000-000000000083",
    org_id: "org-1",
    branch_id: "branch-1",
    device_id: "device-counter-1",
    actor_user_id: CASHIER,
    lamport_seq: 83,
    device_created_at: 1_755_000_000_000,
    branch_created_at: 1_755_000_000_000,
    time_basis: "branch",
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  }) as unknown;

/** `DEC-MONEY-008`: UUID-class, org-globally unique, UI-minted. UUIDv7 is what `newId` mints. */
const ADJUSTMENT_KEY = "0193b0f0-1111-7000-8000-0000000000a1";
const SETTLEMENT_KEY = "0193b0f0-2222-7000-8000-0000000000b2";
const PARENT_KEY = "0193b0f0-3333-7000-8000-0000000000c3";

/** `05 §5`'s own worked magnitude, in integer paisa (`00 §6`). */
const AMOUNT = 45_000;

const VOID = {
  order_id: "order-1",
  amount_paisa: AMOUNT,
  reason: "customer changed their mind after the KOT",
  approver_user_id: MANAGER,
  adjustment_attempt_id: ADJUSTMENT_KEY,
};
const COMP = { ...VOID, reason: "cold when it reached the table" };
const DISCOUNT = { ...VOID, reason: "regular, 10% off the bill" };
const OVERRIDE = {
  order_id: "order-1",
  line_id: "line-3",
  unit_price_paisa: 32_000,
  reason: "price agreed with the owner for the wedding party",
  approver_user_id: MANAGER,
  supersedes: [] as readonly string[],
  adjustment_attempt_id: ADJUSTMENT_KEY,
};

/** `01-F83`'s corrected membership: the FOUR that must carry the key. */
const CARRIERS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["void.recorded", VOID],
  ["comp.recorded", COMP],
  ["discount.recorded", DISCOUNT],
  ["order.line_price_overridden", OVERRIDE],
];

const PAYMENT = {
  order_id: "order-1",
  amount_paisa: AMOUNT,
  method: "cash",
  settlement_attempt_id: SETTLEMENT_KEY,
  shift_id: "shift-1",
  purpose: "settles_order",
};

/** `01-F29`: its OWN key and the parent's — "two fields, never one". */
const REFUND = {
  order_id: "order-1",
  amount_paisa: AMOUNT,
  method: "cash_out",
  settlement_attempt_id: SETTLEMENT_KEY,
  payment_attempt_id: PARENT_KEY,
};

/** `01-F84`'s payload — no amount, terminal monotone fact under `01-F35`. */
const CANCELLED = { order_id: "order-1", reason: "customer never came to collect" };
/** `06-F20`'s closed reason list; also no amount, also terminal. */
const REJECTED = { order_id: "order-1", reason: "item_unavailable" };

/** The THREE `01-F83` names as non-members, with the payload each carries without any adjustment key. */
const NON_CARRIERS: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
  [
    "payment.refunded",
    REFUND,
    "01-F29 already gives it two keys; a third is 02-F45's second source",
  ],
  [
    "order.cancelled",
    CANCELLED,
    "01-F35 terminal monotone fact, no amount — a key would dedupe nothing",
  ],
  [
    "order.rejected",
    REJECTED,
    "01-F35 terminal monotone fact, no amount — a key would dedupe nothing",
  ],
];

const parses = (type: string, payload: unknown): ReturnType<typeof parseEvent> =>
  parseEvent(envelope(type, payload));

/** Drop one key from a payload without mutating the fixture. */
const without = (payload: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...payload };
  delete copy[key];
  return copy;
};

/**
 * A refusal that is ANCHORED ON THE SCHEMA, never on `01-F4`.
 *
 * ⚠ The second assertion is load-bearing, and the reason is measured rather than theoretical:
 * `escalatable-write-schemas.test.ts` records that with a bare `.toThrow()`, **29 of its 63
 * assertions passed against a tree that had no schema for those types at all** — every "is refused"
 * test satisfied by `UnknownEventTypeError`, i.e. by the very defect the file existed to close.
 * `order.cancelled` is in exactly that state in THIS tree today, so the trap is live here.
 */
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F83: the key is REQUIRED on exactly the four correctives that carry an amount.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F83 — `adjustment_attempt_id` is required on the four amount-carrying correctives", () => {
  it.each(CARRIERS)("%s parses when it carries the key", (type, payload) => {
    const parsed = parses(type, payload);
    expect(parsed.type).toBe(type);
    expect((parsed.payload as Record<string, unknown>).adjustment_attempt_id).toBe(ADJUSTMENT_KEY);
  });

  it.each(CARRIERS)(
    "%s is REFUSED with no key at all (P1: required, never optional)",
    (type, payload) => {
      refuses(
        type,
        without(payload, "adjustment_attempt_id"),
        "01-F83 + DEC-MONEY-010 gate (ii): a corrective with no attempt key double-counts on re-delivery, permanently under 01-F1",
      );
    },
  );

  it.each(CARRIERS)(
    "%s is REFUSED when the key is empty (an unnamed intent is not an intent)",
    (type, payload) => {
      refuses(type, { ...payload, adjustment_attempt_id: "" }, "an empty key names no intent");
    },
  );

  it.each(CARRIERS)("%s is REFUSED when the key is not a string", (type, payload) => {
    refuses(
      type,
      { ...payload, adjustment_attempt_id: 7 },
      "a numeric key is a per-device counter in disguise (DEC-MONEY-008)",
    );
    refuses(type, { ...payload, adjustment_attempt_id: null }, "null is not a minted key");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 01-F83: THE FIELD NAME IS THE MECHANISM. Neither name absorbs the other.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F83 — one namespace, TWO field names, and neither substitutes for the other", () => {
  /**
   * The mutant: reuse `settlement_attempt_id` on the four. It is already declared in this
   * registry, already typed and already understood, so it is what a hurried implementation
   * reaches for — and it puts both sides of `01-F30`'s equation into one Σ, where a void and the
   * payment that settled it collide on one key. `01-F83`: "a different field name because it sits
   * on the other side of `01-F30`'s equation".
   */
  it.each(CARRIERS)(
    "%s supplying only `settlement_attempt_id` is REFUSED — the corrective's key has its own name",
    (type, payload) => {
      const wrongName = {
        ...without(payload, "adjustment_attempt_id"),
        settlement_attempt_id: ADJUSTMENT_KEY,
      };
      refuses(
        type,
        wrongName,
        "01-F83: the field NAME is what stops a fold summing both sides of 01-F30 into one Σ",
      );
    },
  );

  /**
   * The same mutant from the other end, and it is the one that would survive a suite that only
   * looked at the four: an implementation that RENAMED the payment's key (or accepted either name
   * on either family) reads as "one namespace" and destroys the separation just as completely.
   */
  it("`payment.recorded` supplying only `adjustment_attempt_id` is REFUSED — the settlement key keeps its name", () => {
    const wrongName = {
      ...without(PAYMENT, "settlement_attempt_id"),
      adjustment_attempt_id: SETTLEMENT_KEY,
    };
    refuses(
      "payment.recorded",
      wrongName,
      "01-F31/01-F29: a settlement is keyed by `settlement_attempt_id` and this FR does not rename it",
    );
  });

  it("`payment.refunded` supplying only `adjustment_attempt_id` is REFUSED — 01-F29's two fields keep their names", () => {
    refuses(
      "payment.refunded",
      { ...without(REFUND, "settlement_attempt_id"), adjustment_attempt_id: SETTLEMENT_KEY },
      "01-F29: its OWN settlement_attempt_id, two fields never one",
    );
    refuses(
      "payment.refunded",
      { ...without(REFUND, "payment_attempt_id"), adjustment_attempt_id: PARENT_KEY },
      "01-F29: the parent is referenced by payment_attempt_id and by nothing else",
    );
  });

  it("both names survive on one event set — a fold can tell a corrective's key from a settlement's", () => {
    // The property the two names exist FOR, stated as one assertion: on a bill where a payment
    // and a void were both recorded, the two keys are readable under different field names, so a
    // Σ over the left-hand side of `01-F30` and a Σ over the right-hand side cannot merge.
    const payment = parses("payment.recorded", PAYMENT).payload as Record<string, unknown>;
    const voided = parses("void.recorded", VOID).payload as Record<string, unknown>;
    expect(payment.settlement_attempt_id).toBe(SETTLEMENT_KEY);
    expect(payment.adjustment_attempt_id).toBeUndefined();
    expect(voided.adjustment_attempt_id).toBe(ADJUSTMENT_KEY);
    expect(voided.settlement_attempt_id).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 01-F83: the THREE non-members. The count stays four.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F83 — the three correctives that must NOT be given a key", () => {
  it.each(NON_CARRIERS)("%s parses with NO adjustment key at all", (type, payload, why) => {
    const parsed = parses(type, payload);
    expect(parsed.type, why).toBe(type);
    expect(
      (parsed.payload as Record<string, unknown>).adjustment_attempt_id,
      `${type} must not require an adjustment key — ${why}`,
    ).toBeUndefined();
  });

  it("`payment.refunded` still requires 01-F29's TWO keys, and gains no third", () => {
    // The literal reading of R56 adds a key here. `01-F83` refuses it in terms: it would be
    // `02-F45`'s second source for one fact and would fragment `01-F29`'s cap.
    const parsed = parses("payment.refunded", REFUND).payload as Record<string, unknown>;
    expect(parsed.settlement_attempt_id).toBe(SETTLEMENT_KEY);
    expect(parsed.payment_attempt_id).toBe(PARENT_KEY);
    expect(parsed.settlement_attempt_id).not.toBe(parsed.payment_attempt_id);
    refuses(
      "payment.refunded",
      without(REFUND, "settlement_attempt_id"),
      "01-F29: its own key is required",
    );
    refuses(
      "payment.refunded",
      without(REFUND, "payment_attempt_id"),
      "01-F29: the parent ref is required",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F83 / DEC-MONEY-008: ONE uniqueness space. The two fields have the SAME shape.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Candidate values, chosen to span the shape space rather than to assert a shape (P2). Each is
 * applied to `void.recorded.adjustment_attempt_id` and to `payment.recorded.settlement_attempt_id`
 * and the two verdicts must AGREE.
 */
const KEY_CANDIDATES: ReadonlyArray<readonly [string, unknown]> = [
  ["a UUIDv7 (what `newId` mints)", "0193b0f0-4444-7000-8000-0000000000d4"],
  ["a UUIDv4", "f47ac10b-58cc-4372-a567-0e02b2c3d479"],
  ["an uppercase UUID", "F47AC10B-58CC-4372-A567-0E02B2C3D479"],
  ["a non-UUID string", "attempt-17"],
  ["the empty string", ""],
  ["a number", 17],
  ["null", null],
  ["absent", undefined],
];

describe("§D 01-F83/DEC-MONEY-008 — `adjustment_attempt_id` shares `settlement_attempt_id`'s space", () => {
  const verdict = (
    type: string,
    payload: Record<string, unknown>,
    field: string,
    value: unknown,
  ): string => {
    const candidate =
      value === undefined ? without(payload, field) : { ...payload, [field]: value };
    try {
      parseEvent(envelope(type, candidate));
      return "accepted";
    } catch (error) {
      return error instanceof UnknownEventTypeError ? "no-schema" : "refused";
    }
  };

  it("the battery is not vacuous (24-F14): it contains at least one accepted and one refused case", () => {
    const verdicts = KEY_CANDIDATES.map(([, value]) =>
      verdict("payment.recorded", PAYMENT, "settlement_attempt_id", value),
    );
    // Measured against the SHIPPED `settlement_attempt_id`, which exists today — so this guard
    // holds whether or not `01-F83` has landed, and a battery that stopped discriminating (all
    // accepted, or all refused) would fail here instead of making §D pass by agreeing on nothing.
    expect(verdicts, "no candidate is accepted — the battery discriminates nothing").toContain(
      "accepted",
    );
    expect(verdicts, "no candidate is refused — the battery discriminates nothing").toContain(
      "refused",
    );
  });

  it.each(KEY_CANDIDATES)(
    "%s gets the same verdict on a corrective's key as on a settlement's",
    (label, value) => {
      const settlement = verdict("payment.recorded", PAYMENT, "settlement_attempt_id", value);
      const adjustment = verdict("void.recorded", VOID, "adjustment_attempt_id", value);
      expect(
        adjustment,
        `${label}: 01-F83 says the corrective's key "obeys 01-F31 unchanged", so the two shapes cannot drift — settlement=${settlement}, adjustment=${adjustment}`,
      ).toBe(settlement);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 01-F31/P3: the payload minus its key is unchanged. A key ADDED, not a payload rewritten.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F31/P3 — the key is added to each payload, and nothing already required is relaxed", () => {
  const REQUIRED: ReadonlyArray<readonly [string, Record<string, unknown>, readonly string[]]> = [
    ["void.recorded", VOID, ["order_id", "amount_paisa", "reason", "approver_user_id"]],
    ["comp.recorded", COMP, ["order_id", "amount_paisa", "reason", "approver_user_id"]],
    ["discount.recorded", DISCOUNT, ["order_id", "amount_paisa", "reason", "approver_user_id"]],
    [
      "order.line_price_overridden",
      OVERRIDE,
      ["order_id", "line_id", "unit_price_paisa", "reason", "approver_user_id", "supersedes"],
    ],
  ];

  it.each(REQUIRED)(
    "%s still refuses a payload missing any of its pre-existing required fields",
    (type, payload, fields) => {
      for (const field of fields) {
        refuses(
          type,
          without(payload, field),
          `${field} was required before 01-F83 and stays required`,
        );
      }
    },
  );

  it.each(CARRIERS)(
    "%s keeps `approver_user_id` REQUIRED AND NULLABLE (a manager's own act is unsupervised)",
    (type, payload) => {
      const parsed = parses(type, { ...payload, approver_user_id: null });
      expect((parsed.payload as Record<string, unknown>).approver_user_id).toBeNull();
      refuses(
        type,
        without(payload, "approver_user_id"),
        "02-F20: absence is a writer forgetting, null is a stated fact",
      );
    },
  );

  it.each(CARRIERS)(
    "%s stays a looseObject — 00 §6 additive evolution survives the new key",
    (type, payload) => {
      const parsed = parses(type, { ...payload, campaign_id: "camp-7" });
      expect((parsed.payload as Record<string, unknown>).campaign_id).toBe("camp-7");
    },
  );
});
