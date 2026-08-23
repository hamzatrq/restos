/**
 * ACCEPTANCE TESTS — `01-F84`: `order.cancelled` gets the payload that makes it EMITTABLE.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** This file was written by a session that read
 * `specs/01-kernel-sync.md` (`01-F1`, `01-F4`, `01-F35`, `01-F62`, `01-F84`),
 * `specs/06-storefront.md` (`06-F19`, `06-F20`, `06-F27`) and `specs/02-pos-app.md` (`02-F8`,
 * `02-F45`) and did **not** write the implementation it describes. It is the oracle for that work
 * (`24 §3` step 2) and is read-only to the implementing session.
 *
 * ⚠ **`packages/domain` IS A PROTECTED PATH (`20 §4.4`, commandment 10).** A field this file makes
 * REQUIRED can never be relaxed for events already written, and a field it leaves out can never be
 * made required later without refusing history (`01-F1`). §0 is what a reviewer should argue with.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   01-F84  "`01 §4` has held the type since Draft 1 and, measured 2026-08-23, it is **not among
 *           the registry's 34 declared payload schemas**, so `01-F4` makes it *unemittable rather
 *           than merely unbuilt*."
 *   01-F84  "The payload, modelled on `order.rejected`, its nearest sibling in both the catalog and
 *           the registry: **`order_id`**, required (`26 §3`'s sidecar answers
 *           `order:<payload.order_id>`, so a cancellation naming no order reaches no projection at
 *           all), and **`reason`**, required free text on
 *           `void.recorded`/`comp.recorded`/`discount.recorded`'s precedent."
 *   01-F84  "A closed enum was refused for a stated reason. `order.rejected`'s `reason` is closed
 *           because `06-F20` supplies the list; **no FR supplies a cancellation list**, and
 *           inventing one is commandment 2."
 *   01-F84  "**No `supersedes` and no `cancelled_by`** … `01 §4`'s canonical vocabulary makes
 *           `cancelled` a terminal exit state with no inverse event anywhere in the corpus, and the
 *           envelope's `actor_user_id` is the one home for who acted (`02-F45`) — which also covers
 *           `06-F27`'s auto-close, where there is no human and `null` is the honest answer rather
 *           than a gap."
 *   01-F4   "Producing an unknown/invalid event type is a build-time and runtime error."
 *   06-F27  "An order unconfirmed past the 06-F20 window auto-closes (`order.cancelled`, customer
 *           notified) — never lingers."
 *   06-F19  "The customer may cancel (`order.cancelled`) any time before `order.confirmed`."
 *
 * ## THE CASE THAT MATTERS, stated so the round-3 law can be checked against this file
 *
 * It is **not** "does Zod refuse a missing key". It is that `order.cancelled` is being modelled on
 * `order.rejected`, and the two things a copy of that sibling gets WRONG are the two things this
 * file is aimed at:
 *
 * **(1) `reason` is FREE TEXT, and the sibling's is a CLOSED ENUM.** The tempting implementation is
 * `z.enum(ORDER_REJECTION_REASONS)` — it is one import away, it is what the modelled-on sibling
 * does, and it parses every value a lazy fixture would use. It also refuses "customer changed their
 * mind", which is `06-F19`'s own scenario, permanently and at emit time. §C is aimed at exactly
 * that mutant: every free-text reason it asserts is a value NO closed list in this repo contains,
 * and it separately asserts that the three `ORDER_REJECTION_REASONS` still parse — so an
 * implementation that swapped one closed list for a different closed list dies too.
 *
 * **(2) The payload is TWO fields and the sibling family's other shapes are not inherited.**
 * `order.parked` carries a required `supersedes`; the three `*.recorded` correctives carry
 * `amount_paisa` and `approver_user_id`; `01-F83` puts an `adjustment_attempt_id` on four
 * neighbours. §D asserts the MINIMAL payload parses, which is the only assertion that can kill a
 * schema that quietly required any of them.
 *
 * ## §0 — PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — `reason` is `z.string().min(1)`: required, non-empty, otherwise unconstrained.** Required
 * on `void/comp/discount.recorded`'s precedent, which `01-F84` cites by name. Non-empty because
 * every required string in this registry is `.min(1)` and an empty reason is a field a writer
 * filled with nothing — the FR calls it "required free text", and text is not the empty string.
 * The named simpler alternative — `z.string()` — is refused because it makes "stated no reason"
 * and "stated the empty string" the same permanent record under `01-F1`.
 *
 * **P2 — `order_id` is `z.string().min(1)`, required.** `01-F84` gives the reason in `26 §3`'s
 * words: the projection-key sidecar answers `order:<payload.order_id>`, so a cancellation naming no
 * order reaches no projection at all. `order.rejected` next door carries the identical field with
 * the identical comment.
 *
 * **P3 — the payload declares NO actor and the envelope's `actor_user_id` may be `null`.**
 * `02-F45` puts attribution on the envelope; `06-F27`'s auto-close has no human, and `01-F84` calls
 * `null` "the honest answer rather than a gap". §E asserts both halves: a null-actor envelope
 * parses, and the payload does not require a `cancelled_by` to compensate.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN, and why
 *
 * - **Who emits it.** `01-F84`: "THE MVP HAS NO EMITTER FOR IT" — the only named producers are
 *   `06-F19` and `06-F27`, both storefront, both post-launch, and doc 02 specifies no counter-side
 *   cancel at all. This act removes the `01-F4` blocker and nothing else; a producer tripwire here
 *   would assert a gap the FR states as intentional.
 *   ⚠ **A shipping-source scan performed while authoring this file (2026-08-23) found ZERO
 *   constructions of `type: "order.cancelled"` anywhere in `apps/` or `services/`**, which agrees
 *   with the FR. It is recorded as a measurement, not asserted, for the reason above.
 * - **The FOLD.** `01 §4` makes `cancelled` a terminal exit state and `01-F35` makes terminal
 *   states monotone; the merge rule belongs to `packages/sync-client`'s oracle and `26 §7`.
 * - **Whether an extra field is REFUSED.** It is not: `00 §6` makes extra fields additive and
 *   pass-through, and every payload in this registry is a `looseObject`. §F asserts that survives.
 * - **`order.rejected`'s own schema.** Unchanged by this FR and owned by
 *   `order-reject-park-schemas.test.ts`. §C reads its reason list only to prove `order.cancelled`'s
 *   is a DIFFERENT shape.
 */

import { describe, expect, it } from "vitest";
import {
  eventRegistry,
  isAuditEvent,
  ORDER_REJECTION_REASONS,
  parseEvent,
  UnknownEventTypeError,
} from "../index.js";

/**
 * A minimal legal envelope. `actor_user_id` varies (P3) and is a CASHIER by default; `06-F27`'s
 * auto-close is the `null` case and §E owns it.
 */
const envelope = (payload: unknown, actor_user_id: string | null = "user-ayesha"): unknown =>
  ({
    id: "0193b0f0-0000-7000-8000-000000000084",
    org_id: "org-1",
    branch_id: "branch-1",
    device_id: "device-counter-1",
    actor_user_id,
    lamport_seq: 84,
    device_created_at: 1_755_000_000_000,
    branch_created_at: 1_755_000_000_000,
    time_basis: "branch",
    server_received_at: null,
    type: "order.cancelled",
    schema_version: 1,
    payload,
    refs: [],
  }) as unknown;

/** `01-F84`'s payload in full: exactly two fields, and nothing else is required. */
const CANCELLED = {
  order_id: "order-1",
  reason: "customer changed their mind before we confirmed",
};

const parses = (payload: unknown, actor?: string | null): ReturnType<typeof parseEvent> =>
  parseEvent(envelope(payload, actor));

const without = (payload: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...payload };
  delete copy[key];
  return copy;
};

/**
 * A refusal ANCHORED ON THE SCHEMA, never on `01-F4`.
 *
 * ⚠ **This is the trap that makes or breaks this whole file, and it is LIVE in this tree today.**
 * `order.cancelled` has no schema at all right now, so `parseEvent` throws `UnknownEventTypeError`
 * for every payload — legal and illegal alike. With a bare `.toThrow()` every refusal below would
 * pass against the very defect the file exists to close. `escalatable-write-schemas.test.ts`
 * records the measured version of this: 29 of its 63 assertions passed that way.
 */
const refuses = (payload: unknown, why: string): void => {
  let thrown: unknown = null;
  try {
    parseEvent(envelope(payload));
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `order.cancelled accepted a payload it must refuse — ${why}`).toBeInstanceOf(
    Error,
  );
  expect(
    thrown,
    "order.cancelled was refused by 01-F4 (no schema at all), not by its schema — this assertion is vacuous",
  ).not.toBeInstanceOf(UnknownEventTypeError);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F4: the type is EMITTABLE at all. This is the state the FR found it in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F4/01-F84 — `order.cancelled` parses rather than throwing at emit", () => {
  it("a legal cancellation no longer raises UnknownEventTypeError", () => {
    // Before this change `store.append` — which runs `parseEvent` on every append — threw for
    // this type, so `06-F19`'s customer cancel and `06-F27`'s auto-close were **unemittable**
    // rather than merely unbuilt. That is the whole of `01-F84`'s first paragraph.
    const parsed = parses(CANCELLED);
    expect(parsed.type).toBe("order.cancelled");
    expect(parsed.payload).toMatchObject(CANCELLED);
  });

  it("the type is in the OPERATIONAL catalog `eventRegistry` enumerates, not a side map", () => {
    // `01-F4` puts "the event-type catalog and payload schemas" in one place, and `eventRegistry`
    // is that catalog's own queryable answer — the surface the back office and the Auditor read.
    // A schema reachable only through `parseEvent` (registered in the `audit.*` map, say, or in a
    // second lookup) would satisfy §A's first test and leave the type invisible to every reader
    // that enumerates. `01-F84` calls this type one of the registry's declared payload schemas.
    expect(eventRegistry.has("order.cancelled")).toBe(true);
    expect(eventRegistry.types()).toContain("order.cancelled");
    // It is NOT an audit subtype: `01-F5` closes that family at seven and a device stamps a hash
    // chain for exactly those, so a mis-filed type would acquire a chain it has no business in.
    expect(isAuditEvent("order.cancelled")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 01-F84/26 §3: `order_id` is required and non-empty.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F84/26 §3 — `order_id` is required: a cancellation naming no order reaches no projection", () => {
  it("parses with an order key and preserves it verbatim", () => {
    expect((parses(CANCELLED).payload as Record<string, unknown>).order_id).toBe("order-1");
  });

  it("is REFUSED with no order key", () => {
    refuses(without(CANCELLED, "order_id"), "26 §3's sidecar answers order:<payload.order_id>");
  });

  it("is REFUSED with an empty order key", () => {
    refuses({ ...CANCELLED, order_id: "" }, "an empty key names no order");
  });

  it("is REFUSED with a non-string order key", () => {
    refuses({ ...CANCELLED, order_id: 1 }, "order ids are strings everywhere in this registry");
    refuses({ ...CANCELLED, order_id: null }, "null names no order");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 01-F84: `reason` is REQUIRED FREE TEXT and NOT a closed enum. THE case that matters.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Free-text reasons a real cancellation would carry. **Every one of these is deliberately absent
 * from every closed list in this repo** — `ORDER_REJECTION_REASONS`, `APPROVAL_TYPES`,
 * `ORDER_CHANNELS`, `PAYMENT_METHODS`, `ALARM_ACK_KINDS` — so an implementation that reused any of
 * them, or invented its own, fails here. The first is `06-F19`'s own scenario in prose and the
 * second is `06-F27`'s.
 */
const FREE_TEXT_REASONS: readonly string[] = [
  "customer changed their mind before we confirmed",
  "unconfirmed past the 06-F20 window — auto-closed",
  "duplicate of order-882, phoned in twice",
  "rider could not reach the address and the customer stopped answering",
  "kitchen fire alarm, service suspended",
  "برگر ختم ہو گیا", // commandment 7: user content is Unicode and must survive the ledger
];

describe("§C 01-F84 — `reason` is required FREE TEXT, and the closed-enum mutant dies here", () => {
  it.each(FREE_TEXT_REASONS)("accepts a stated reason no closed list contains: %s", (reason) => {
    const parsed = parses({ ...CANCELLED, reason });
    expect(
      (parsed.payload as Record<string, unknown>).reason,
      "01-F84: no FR supplies a cancellation list, and inventing one is commandment 2",
    ).toBe(reason);
  });

  it("the free-text battery is genuinely free (24-F14 — a battery that matched a closed list proves nothing)", () => {
    // The guard on the guard. If a future edit made these values members of the rejection list,
    // §C would go on passing against a `z.enum(ORDER_REJECTION_REASONS)` implementation — which is
    // precisely the mutant it exists to kill.
    for (const reason of FREE_TEXT_REASONS) {
      expect(
        (ORDER_REJECTION_REASONS as readonly string[]).includes(reason),
        `"${reason}" is in ORDER_REJECTION_REASONS — this battery no longer discriminates`,
      ).toBe(false);
    }
    expect(FREE_TEXT_REASONS.length).toBeGreaterThan(3);
  });

  it("ALSO accepts each of `06-F20`'s three rejection reasons — the set is OPEN, not a different closed list", () => {
    // Without this leg an implementation that swapped one closed enum for another closed enum
    // (say, a hand-written cancellation list) could still pass §C's first leg by luck. Openness
    // means every non-empty string, including the neighbour's vocabulary.
    for (const reason of ORDER_REJECTION_REASONS) {
      expect((parses({ ...CANCELLED, reason }).payload as Record<string, unknown>).reason).toBe(
        reason,
      );
    }
  });

  it("is REFUSED with no reason (P1: required, on void/comp/discount.recorded's precedent)", () => {
    refuses(without(CANCELLED, "reason"), "01-F84 makes `reason` required free text");
  });

  it("is REFUSED with an empty reason (P1: text is not the empty string)", () => {
    refuses(
      { ...CANCELLED, reason: "" },
      "a writer filled the field with nothing, permanently under 01-F1",
    );
  });

  it("is REFUSED with a non-string reason", () => {
    refuses({ ...CANCELLED, reason: 3 }, "a reason is text");
    refuses({ ...CANCELLED, reason: null }, "null is not a stated reason");
    refuses({ ...CANCELLED, reason: ["closed"] }, "a list is not a stated reason");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F84: the payload is TWO fields. Nothing from the neighbouring shapes is inherited.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F84 — the MINIMAL payload parses: no supersedes, no cancelled_by, no amount, no key", () => {
  it("`{ order_id, reason }` alone is a complete, legal `order.cancelled`", () => {
    const parsed = parses(CANCELLED);
    expect(Object.keys(parsed.payload as Record<string, unknown>).sort()).toEqual([
      "order_id",
      "reason",
    ]);
  });

  /**
   * Each row is a field this schema must NOT require, and the neighbour it would have been copied
   * from. The assertion is the same for all of them — the minimal payload parses — but naming each
   * one makes the failure message say WHICH inheritance was taken.
   */
  const NOT_REQUIRED: ReadonlyArray<readonly [string, string]> = [
    [
      "supersedes",
      "01-F84: `cancelled` is terminal with no inverse event anywhere in the corpus — `order.parked` carries one because it is a REPEATABLE toggle, and this is not",
    ],
    ["cancelled_by", "02-F45: the envelope's actor_user_id is the one home for who acted"],
    [
      "amount_paisa",
      "01-F83: `order.cancelled` carries no amount — that is why it gets no attempt key",
    ],
    ["adjustment_attempt_id", "01-F83: a key on a terminal monotone fact would dedupe nothing"],
    [
      "approver_user_id",
      "02-F20's four escalatable writes carry an approver; a cancellation is not one of them",
    ],
    ["reason_code", "01-F84 refuses a closed list; a parallel coded field would smuggle one back"],
  ];

  it("requires none of the six fields a neighbouring shape would have contributed", () => {
    // One assertion, because there is one observable: the minimal payload parses. The six
    // candidates are named in the failure message so a red run says WHICH inheritance was taken
    // rather than leaving the implementer to guess which neighbour leaked in.
    let thrown: unknown = null;
    try {
      parseEvent(envelope(CANCELLED));
    } catch (error) {
      thrown = error;
    }
    expect(
      thrown,
      `the minimal { order_id, reason } payload was refused. One of these is required and must not be:\n` +
        NOT_REQUIRED.map(([field, why]) => `  - ${field}: ${why}`).join("\n"),
    ).toBeNull();
  });

  it("accepts `supersedes` as an ADDITIVE extra without requiring it (00 §6)", () => {
    // Not required (above) and not banned: `looseObject` carries it. The distinction matters
    // because a future FR could add it, and a schema that REFUSED it would make that FR a
    // breaking change to history rather than an additive one.
    const parsed = parses({ ...CANCELLED, supersedes: ["0193b0f0-0000-7000-8000-00000000aaaa"] });
    expect((parsed.payload as Record<string, unknown>).supersedes).toEqual([
      "0193b0f0-0000-7000-8000-00000000aaaa",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — P3/02-F45/06-F27: attribution is the ENVELOPE's, and `null` is the honest auto-close.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F45/06-F27 — the actor rides the envelope, and an auto-close has none", () => {
  it("a HUMAN cancellation carries its actor on the envelope, not in the payload", () => {
    const parsed = parses(CANCELLED, "user-ayesha");
    expect(parsed.envelope.actor_user_id).toBe("user-ayesha");
    expect((parsed.payload as Record<string, unknown>).cancelled_by).toBeUndefined();
  });

  it("`06-F27`'s AUTO-CLOSE parses with `actor_user_id: null` — the honest answer, not a gap", () => {
    // The case `01-F84` names in terms. An implementation that compensated for `02-F45` by
    // requiring a payload actor would make the auto-close unemittable, which is the `01-F4`
    // blocker this FR exists to remove, reintroduced one field over.
    const parsed = parses(CANCELLED, null);
    expect(parsed.envelope.actor_user_id).toBeNull();
    expect(parsed.type).toBe("order.cancelled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — 00 §6: additive evolution. The payload is a looseObject like every other in the registry.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 00 §6 — extra fields pass through and are preserved for consumers", () => {
  it("an undeclared field survives the parse", () => {
    const parsed = parses({ ...CANCELLED, notified_customer_at: 1_755_000_000_001 });
    expect((parsed.payload as Record<string, unknown>).notified_customer_at).toBe(
      1_755_000_000_001,
    );
  });

  it("a non-object payload is still refused", () => {
    refuses("order-1", "a payload is an object");
    refuses(null, "a payload is an object");
    refuses(42, "a payload is an object");
  });
});
