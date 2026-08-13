/**
 * `05-F7` — the manager console's event extension, and the ONE property the whole remote
 * approval path rests on.
 *
 * ## What this file is pointed at, stated so the round-3 law can be checked against it
 *
 * AGENTS.md's round-3 law: *"the mechanism was built correctly and simply never aimed at the case
 * that matters."* The case that matters here is **not** "does a schema reject a missing field" —
 * every Zod object does that, and a suite of those would pass against any implementation of
 * anything. It is `02-F41`: **an approval carries TWO identities and a remote grant must not
 * collapse them into one.**
 *
 * The local path (`apps/pos-electron/src/main/index.ts`) protects that with a mechanism: a SECOND
 * `createPinSession`, because `unlock()` MOVES the session, so approving through the cashier's own
 * would sign her out and `02-F41` would attribute her next twenty orders to whoever authorised one
 * paid-out — permanently, because `01-F1` forbids correcting a ledger in place. A REMOTE grant
 * crosses a plane boundary where there is no session to move, so no mechanism protects it by
 * construction. The schema is the protection, and §B is the assertion that it is.
 *
 * ⚠ **A schema cannot check who the ENVELOPE names.** `approval.granted`'s envelope actor must be
 * the approver and its payload names the requester; nothing here can see an envelope, so §B pins
 * the half that lives in this package — that the two identities are separately required — and the
 * other half is owed at whichever surface first appends one. Stated rather than implied, because a
 * test that looked like it covered the envelope would retire the assertion that must be written
 * there.
 */

import { describe, expect, it } from "vitest";
import { APPROVAL_TYPES, parseEvent, UnknownEventTypeError } from "../index.js";

/** A minimal legal envelope. Only `type` and `payload` vary across this file. */
const envelope = (type: string, payload: unknown): unknown => ({
  id: "0193b0f0-0000-7000-8000-000000000001",
  org_id: "org-1",
  branch_id: "branch-1",
  device_id: "device-1",
  actor_user_id: "user-manager",
  lamport_seq: 1,
  device_created_at: 1_755_000_000_000,
  branch_created_at: 1_755_000_000_000,
  time_basis: "branch",
  server_received_at: null,
  type,
  schema_version: 1,
  payload,
  refs: [],
});

const REQUEST = {
  request_id: "req-1",
  approval_type: "void",
  approval_refs: ["order-1", "line-1"],
  amount_paisa: 45_000,
  reason: "customer changed their mind after the KOT",
  requester_id: "user-ayesha",
  requesting_device_id: "device-counter-1",
};

const GRANT = {
  request_id: "req-1",
  approver_user_id: "user-hina",
  requester_user_id: "user-ayesha",
};

const DENIAL = { ...GRANT, reason: "no manager saw the item leave" };

/**
 * A legal payload for each of `02-F20`'s three `*.recorded` acts (they share a shape) and for the
 * override, which does not.
 */
const RECORDED = {
  order_id: "order-1",
  amount_paisa: 45_000,
  reason: "the customer sent the biryani back after the KOT printed",
  approver_user_id: "user-hina",
};
const OVERRIDDEN = {
  order_id: "order-1",
  line_id: "line-1",
  unit_price_paisa: 32_000,
  reason: "the owner priced this plate for the staff meal",
  approver_user_id: "user-hina",
  // `26 §7`'s carried causal link, REQUIRED on this payload since August 2026 (see the schema's
  // own note in `registry.ts`). `[]` is a root override. Fixture-only: §D asserts that all four
  // types PARSE and that the approver key is DECLARED, and neither claim moved.
  supersedes: [] as readonly string[],
};

/** Whatever `parseEvent` threw, or `undefined` if it did not throw. */
const refusalOf = (type: string, payload: unknown): unknown => {
  try {
    parseEvent(envelope(type, payload));
  } catch (err) {
    return err;
  }
  return undefined;
};

/**
 * A refusal that is the SCHEMA's and not `01-F4`'s.
 *
 * ⚠ Without the second expectation every refusal test in §D passes vacuously against a registry
 * with the schema **deleted** — an unregistered type refuses every payload, legal ones included.
 * That is the same shape as §B's control: a refusal proves nothing until you have shown what it is
 * a refusal *of*.
 */
const expectSchemaRefusal = (type: string, payload: unknown, why: string): void => {
  const err = refusalOf(type, payload);
  expect(err, why).toBeDefined();
  expect(
    err,
    `${type} is not in the registry at all, so this refusal is 01-F4's and says nothing about ` +
      "the schema this test claims to own",
  ).not.toBeInstanceOf(UnknownEventTypeError);
};

// ── §A — the three types are in the registry at all (05-F7, 01-F4) ─────────────────────────
describe("05-F7 §A — the extension's three types parse rather than throwing at emit", () => {
  /**
   * This is the state the FR was in before this change and it is worth an assertion of its own:
   * `01 §4` listed `approval.requested / granted / denied` and `packages/domain` carried no
   * schema, so `01-F4` turned every emit into an `UnknownEventTypeError`. `02-F20`'s remote path
   * was not merely unbuilt — it was unbuildable. The same was true of `void.recorded`,
   * `comp.recorded`, `discount.recorded` and `order.line_price_overridden` until August 2026;
   * §D held the tripwire that said so, and now holds the state that replaced it.
   */
  it("approval.requested carries 05-F7's declared payload", () => {
    const parsed = parseEvent(envelope("approval.requested", REQUEST));
    expect(parsed.type).toBe("approval.requested");
    expect(parsed.payload).toMatchObject({ request_id: "req-1", requester_id: "user-ayesha" });
  });

  it("approval.granted and approval.denied parse", () => {
    expect(parseEvent(envelope("approval.granted", GRANT)).type).toBe("approval.granted");
    expect(parseEvent(envelope("approval.denied", DENIAL)).type).toBe("approval.denied");
  });
});

// ── §B — TWO IDENTITIES (02-F41 / 02-F38). The assertion this file exists for. ──────────────
describe("05-F7 §B — a grant names the approver AND the requester, never one identity", () => {
  /**
   * **THE MUTANT THIS IS AIMED AT:** a grant schema carrying a single `user_id`, or one whose
   * `requester_user_id` is optional so a caller may omit it. Either shape lets a remote approval
   * be recorded with the approver's identity alone — and then `05-F6`'s resulting
   * `void/comp/discount.recorded` has nothing to source its actor from but the granter, which IS
   * "the approval moved the cashier's session", one plane over.
   *
   * Both directions are asserted because dropping either field is a distinct one-branch mutant
   * and neither subsumes the other.
   */
  it("a grant WITHOUT the requester is refused (02-F38 has nothing to compare against)", () => {
    const { requester_user_id: _dropped, ...oneIdentity } = GRANT;
    expect(() => parseEvent(envelope("approval.granted", oneIdentity))).toThrow();
  });

  it("a grant WITHOUT the approver is refused (02-F20's 'actor + approver' loses the approver)", () => {
    const { approver_user_id: _dropped, ...oneIdentity } = GRANT;
    expect(() => parseEvent(envelope("approval.granted", oneIdentity))).toThrow();
  });

  it("a denial carries both identities too — 02-F38 binds a denial identically", () => {
    const { requester_user_id: _dropped, ...oneIdentity } = DENIAL;
    expect(() => parseEvent(envelope("approval.denied", oneIdentity))).toThrow();
  });

  /**
   * The CONTROL for §B, and without it the three refusals above prove only that Zod refuses
   * missing keys. A grant whose two identities are EQUAL still parses here — `02-F38` is the
   * permission matrix's refusal (`can()` returns `deny` when `requested_by_user_id` is the
   * subject), not the schema's, and pinning it in both places would be two readings of one rule.
   * This test is what says so out loud, so a future session does not "fix" the schema by adding a
   * refinement that duplicates `permissions.ts`.
   */
  it("equal identities PARSE — 02-F38 is the matrix's refusal, deliberately not the schema's", () => {
    const selfGrant = { ...GRANT, approver_user_id: "user-ayesha" };
    expect(parseEvent(envelope("approval.granted", selfGrant)).type).toBe("approval.granted");
  });
});

// ── §C — the closed approval_type set (05-F7, 02-F42's precedent) ───────────────────────────
describe("05-F7 §C — approval_type is closed, and holds exactly the FR's five", () => {
  it("the five are 02-F20's four escalatable acts plus 05-F19's paid-out", () => {
    expect([...APPROVAL_TYPES]).toEqual(["void", "comp", "discount", "price_override", "paid_out"]);
  });

  it("a type outside the set is refused rather than recorded as an unnameable act", () => {
    expect(() =>
      parseEvent(envelope("approval.requested", { ...REQUEST, approval_type: "refund" })),
    ).toThrow();
  });

  it("every declared type is accepted — the set is not narrower than it claims", () => {
    for (const approval_type of APPROVAL_TYPES) {
      expect(parseEvent(envelope("approval.requested", { ...REQUEST, approval_type })).type).toBe(
        "approval.requested",
      );
    }
  });
});

// ── §D — the escalatable WRITES: the tripwire FIRED, and this is the state it announced ──────
describe("05-F7 §D — 02-F20's four escalatable writes are registered, and an approval can complete", () => {
  /**
   * ## ⚠ THE HISTORY, KEPT BECAUSE THE REGISTER MUST NOT LOSE IT
   *
   * §D used to assert the **opposite**: that `void.recorded`, `comp.recorded`, `discount.recorded`
   * and `order.line_price_overridden` were UNREGISTERED, so `01-F4` refused them and `02-F20`'s
   * remote path could record a decision but not the act that decision authorises. Its own words
   * were: *"This is a TRIPWIRE, not a preference. When those schemas land, this test fails and
   * whoever lands them is told, at the point of the change, that doc 05's remote path is now
   * completable end to end — rather than the gap sitting unnoticed in a CLAUDE.md for a wave."*
   *
   * **The schemas landed in `4a9e234` (August 2026) and it fired.** That firing WAS the design —
   * the tripwire's lifecycle is complete, not broken — so it is REPLACED by an assertion of the
   * state it announced, never deleted. A deletion would retire the fact along with the assertion,
   * and the next reader could not tell *"nobody ever pinned this"* from *"this was pinned, it
   * fired, and here is what it announced"*. (`01-F60`'s three-week defect is the same shape with
   * the sign flipped: a GREEN test went on defending a rule the founder had already overruled,
   * because nobody carried the ruling back into the suite. A fired tripwire and a test defending a
   * dead rule are the two ways a suite can be exactly right about yesterday.)
   *
   * ## WHY THIS IS THREE TESTS AND NOT A SHAPE SWEEP
   *
   * `escalatable-write-schemas.test.ts` landed in the same commit as the schemas and **owns the
   * four payload contracts in full** — the money magnitude, the required reason, the override's
   * line key and its explicit zero, and `02-F45`'s actor/approver split — with its own mutation
   * matrix. Restating any of that here would be two readings of one rule in one package, which is
   * the failure this file's own §B control exists to prevent, and the two copies would then be
   * free to disagree. §D therefore asserts only what belongs to the APPROVAL file:
   *
   *   D1  the state change itself, as the exact inverse of the sentence that stood here.
   *   D2  the one shape fact that makes D1 non-vacuous AND is this file's own through-line: §B
   *       pins that a GRANT carries two identities, and D2 pins that the ACT the grant authorises
   *       carries the approver too. Without it, `"void.recorded": z.unknown()` satisfies D1.
   *   D3  the tripwire's successor — `APPROVAL_TYPES` (§C's closed set) and the acts drifting
   *       apart again, in the direction that is now possible.
   *
   * ## WHAT §D STILL DOES NOT CLAIM
   *
   * That the four acts are **folded**: `packages/sync-client` consumes all four as
   * projection-inert, so `01-F30`'s `void_value`, `comp_value` and `discounts` terms still
   * evaluate to zero. That is a `26 §7` merge-rule decision, owed, and invisible to this package.
   * Nor that anything **emits** them — `05-F28` records that nothing emits `approval.requested`
   * either, so the remote path is now *buildable* end to end and still has no producer at step one.
   *
   * ## MUTATION MATRIX FOR §D (2026-08-11) — control 0 failed / 359 passed, 0 survivors
   *
   * `registry.ts` was mutated in a scratchpad COPY of the package, never in the worktree (it is a
   * PROTECTED path). "pre-existing" counts kills in every other suite in `packages/domain`.
   *
   *   #      mutant (exactly one branch of registry.ts)              §D kills    pre-existing
   *   D-M1   the four acts UNREGISTERED again — the exact state      **3 (all)**  60
   *          the old tripwire pinned
   *   D-M2   **the four registered as `z.unknown()`** — D1 green,    **1 — D2**   31
   *          the schema vacuous
   *   D-M3   `approver_user_id` written `.optional()`                **1 — D2**   4
   *   D-M4   **a SIXTH `approval_type` with no act to record it**    **2 — §C1/2 + D3**  **0**
   *   D-M5   `cash.paid_out` unregistered                            **1 — D3**   5
   *   D-NC   **NEGATIVE CONTROL** — `.nullable()` in place of the    **0**        **0**
   *          `z.union([…, z.null()])`, and the four keys reordered
   *
   * **D-M2 is why D2 exists**: with D1 alone, a registry that answered `z.unknown()` for all four
   * would have been reported as "the schemas landed". **D-M4 killed 0 pre-existing tests** — an
   * approval type with nothing to record is invisible to every other suite in this repo, which is
   * exactly the gap the old tripwire covered in the other direction and the reason D3 replaces it
   * rather than the whole section being deleted.
   */
  const ACTS = [
    ["void.recorded", RECORDED],
    ["comp.recorded", RECORDED],
    ["discount.recorded", RECORDED],
    ["order.line_price_overridden", OVERRIDDEN],
  ] as const;

  it("D1 01-F4: all four PARSE — the sentence that stood here is now false, and this is why", () => {
    for (const [type, payload] of ACTS) {
      expect(parseEvent(envelope(type, payload)).type).toBe(type);
    }
  });

  it("D2 02-F20 'the recorded event carries actor + approver': the approver key is DECLARED", () => {
    for (const [type, payload] of ACTS) {
      const { approver_user_id: _dropped, ...noApprover } = payload;
      // Two mutants at once, which is the point of pairing these expectations: an UNREGISTERED
      // type refuses this payload as well (that is D1's state undone), and a `z.unknown()` or a
      // bare `looseObject({})` ACCEPTS it (that is D1 satisfied vacuously). Only a real schema
      // refuses it, and refuses it for the schema's own reason.
      expectSchemaRefusal(
        type,
        noApprover,
        `${type} accepted a payload with no approver_user_id key — 02-F20's "actor + approver" ` +
          "then rests on one call site in one app rather than on the catalog 01-F4 validates",
      );
    }
  });

  /**
   * **THE TRIPWIRE'S SUCCESSOR, and the reason §D is a replacement rather than a deletion.** The
   * old one fired when the acts caught up with the approvals. This one fires if they drift apart
   * again — a sixth `approval_type` with nothing to record, which is the state `paid_out` was
   * never in (`05-F19` has had `cash.paid_out` all along) and the other four were for a wave.
   *
   * The mapping is FR-sourced rather than invented: `05-F6` writes *"the resulting
   * `void/comp/discount.recorded`"*, `02-F20` names `order.line_price_overridden` in its own
   * sentence, and `05-F19` is *"`cash.paid_out` above the org threshold … (`approval_type:
   * paid_out`)"*.
   */
  it("D3 05-F6/05-F19: every approval_type has a REGISTERED act it can complete", () => {
    const ACT_FOR_APPROVAL: Record<string, string> = {
      void: "void.recorded",
      comp: "comp.recorded",
      discount: "discount.recorded",
      price_override: "order.line_price_overridden",
      paid_out: "cash.paid_out",
    };
    // The table is hand-written, so it is PINNED against the closed set rather than trusted: a new
    // approval_type with nothing to record reddens here, at the point of the change, exactly as
    // the old tripwire did in the other direction.
    expect(Object.keys(ACT_FOR_APPROVAL).sort()).toEqual([...APPROVAL_TYPES].sort());
    for (const [approval_type, event_type] of Object.entries(ACT_FOR_APPROVAL)) {
      expect(
        refusalOf(event_type, {}),
        `approval_type "${approval_type}" resolves to ${event_type}, which 01-F4 refuses — a ` +
          "manager could grant it and nothing could record what she granted",
      ).not.toBeInstanceOf(UnknownEventTypeError);
    }
  });
});
