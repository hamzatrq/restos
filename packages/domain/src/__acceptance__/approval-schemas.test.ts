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

// ── §A — the three types are in the registry at all (05-F7, 01-F4) ─────────────────────────
describe("05-F7 §A — the extension's three types parse rather than throwing at emit", () => {
  /**
   * This is the state the FR was in before this change and it is worth an assertion of its own:
   * `01 §4` listed `approval.requested / granted / denied` and `packages/domain` carried no
   * schema, so `01-F4` turned every emit into an `UnknownEventTypeError`. `02-F20`'s remote path
   * was not merely unbuilt — it was unbuildable, and the same is still true of `void.recorded`,
   * `comp.recorded`, `discount.recorded` and `order.line_price_overridden`, which §D pins.
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

// ── §D — the ANTI-SCOPE guard: this change closed three types and not the others ────────────
describe("05-F7 §D — the escalatable WRITES are still unregistered, and that is the state", () => {
  /**
   * `02-F20` names four escalatable acts; this change registers the APPROVAL family and none of
   * the acts. So `02-F20`'s remote path can now record a decision and still cannot record the
   * void/comp/discount that decision authorises — `cash.paid_out` (`05-F19`) remains the only
   * escalatable act with a schema, which is exactly the case `apps/pos-electron`'s
   * `escalation.test.ts` drives.
   *
   * This is a TRIPWIRE, not a preference. When those schemas land, this test fails and whoever
   * lands them is told, at the point of the change, that doc 05's remote path is now completable
   * end to end — rather than the gap sitting unnoticed in a CLAUDE.md for a wave.
   */
  it("void/comp/discount/price_override have no payload schema yet (01-F4 refuses them)", () => {
    for (const type of [
      "void.recorded",
      "comp.recorded",
      "discount.recorded",
      "order.line_price_overridden",
    ]) {
      expect(() => parseEvent(envelope(type, {}))).toThrow(UnknownEventTypeError);
    }
  });
});
