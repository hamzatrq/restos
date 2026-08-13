// Acceptance tests — `14-F30`'s `device.manage` cell, the row Appendix A does not carry.
//
// Sources, and nothing else:
//   `specs/14-backoffice.md`   — `14-F12` (the per-branch device list), `14-F13` (revocation is
//                                immediate; "the list shows revoked state and actor"), `14-F30`
//                                (the action, its four cells, and the PINNED INTERPRETATION that
//                                produced them), `14-N2` ("an owner can change a price **or revoke
//                                a device** from their phone"), §4's *Device revocation* flow
//                                ("**Owner** marks a tablet stolen"), §9 q1 (a manager's
//                                back-office reach is an OPEN QUESTION)
//   `specs/01-kernel-sync.md`  — `01-F26` (User × Role × per-location assignment), `01-F27`
//                                (server-side authorization on every operation)
//   `restaurant-os.md` Appendix A — which carries NO device row. That absence is the whole
//                                reason this file exists, and it is asserted below rather than
//                                assumed: `permission-matrix.test.ts` transcribes the appendix
//                                cell for cell and is READ-ONLY to this work.
//
// **Why a separate file rather than a row in `permission-matrix.test.ts`.** That file is S-0a's
// oracle and its §4b pins the transcription's exclusion list; `device.manage` is decided by an FR
// and by no appendix cell, exactly like `order.price_override` and `approval.grant`. Adding it
// there would put an FR-decided row inside a file whose stated contract is "Appendix A,
// transcribed", and would edit an oracle this session is disqualified from touching (`24 §3`).
//
// ⚠ **AUTHORSHIP DEPARTURE, DECLARED.** `24 §3` step 2 wants the acceptance tests written by a
// session that has seen no implementation. This file was written by the session that also wrote
// `14-F30` and the matrix row, so that guarantee is NOT available here and must not be claimed.
// What stands in for it is the round-3 law: every assertion below was mutation-checked against a
// deliberately broken matrix, with a CONTROL differing in exactly one cell, and the numbers are
// recorded in `packages/domain/CLAUDE.md`. Read that table, not this paragraph.

import { describe, expect, it } from "vitest";
import {
  type AuthSubject,
  can,
  newId,
  PERMISSION_ACTIONS,
  type PermissionAction,
  ROLES,
  type Role,
} from "../index.js";

const ORG = newId();
const OTHER_ORG = newId();
const BRANCH_A = newId();
const BRANCH_B = newId();

const subject = (
  assignments: readonly { role: Role; branch_id: string | null }[],
  org_id: string = ORG,
): AuthSubject => ({ user_id: newId(), org_id, assignments });

/** The `14-N2` / §4 actor: an owner, org-wide, which is how Appendix A gives them "everything". */
const OWNER = subject([{ role: "owner", branch_id: null }]);
const CASHIER = subject([{ role: "cashier", branch_id: BRANCH_A }]);
const MANAGER = subject([{ role: "branch_manager", branch_id: BRANCH_A }]);
const STOREKEEPER = subject([{ role: "storekeeper", branch_id: BRANCH_A }]);
/** `01-F27`: a device token confers no role, so an unlocked-by-nobody device is this subject. */
const NO_ASSIGNMENT = subject([]);

const NON_OWNERS: readonly (readonly [string, AuthSubject])[] = [
  ["cashier", CASHIER],
  ["branch_manager", MANAGER],
  ["storekeeper", STOREKEEPER],
  ["no assignment", NO_ASSIGNMENT],
];

const at = (branch_id: string | null) => ({ org_id: ORG, branch_id });

const ACTION = "device.manage" as PermissionAction;

// ── §1 — the action exists at all, which is the gap `14-F30` was written to close ────────────

describe("14-F30 §1 — the matrix carries a device action (Commandment 8)", () => {
  it("`device.manage` is a member of PERMISSION_ACTIONS", () => {
    // Before `14-F30` this was false, and the consequence was concrete: `14-F13`'s revocation had
    // nothing to authorize against, so the only shipped kill switch was a shell command on the
    // service host with no authenticated user and therefore no `14-F13` actor.
    expect(PERMISSION_ACTIONS).toContain("device.manage");
  });

  it("it is decided as ONE action — the matrix carries exactly one `device.*` row (14-F30)", () => {
    // `14-F30` rejected the read/destructive split as speculative *while every cell is identical*.
    // This is a tripwire on that ruling, not a law: splitting it is legitimate the day a role is
    // widened into `14-F12`'s list, and this assertion makes that a visible diff against a
    // recorded interpretation rather than a silent one.
    const deviceActions = PERMISSION_ACTIONS.filter((action) => action.startsWith("device."));
    expect(deviceActions).toEqual(["device.manage"]);
  });
});

// ── §2 — the cells (14-F30: owner allow, everyone else deny) ─────────────────────────────────

describe("14-F30 §2 — owner-only (14-N2, doc 14 §4's revocation flow)", () => {
  it("an owner may manage devices at a branch — `Owner marks a tablet stolen`", () => {
    expect(can(OWNER, ACTION, at(BRANCH_A)).outcome).toBe("allow");
  });

  it("an org-wide owner reaches EVERY branch's devices (01-F26: branch_id null is org-wide)", () => {
    // `14-F12`'s list is per branch and `14-N2` puts the act on a phone; an owner who could only
    // revoke at one branch could not answer the call about the other one.
    expect(can(OWNER, ACTION, at(BRANCH_B)).outcome).toBe("allow");
    // And the org-scoped read — `devices.list` states no branch, so only an org-wide assignment
    // matches. An owner holds one; this is the cell that makes the list reachable at all.
    expect(can(OWNER, ACTION, at(null)).outcome).toBe("allow");
  });

  for (const [name, who] of NON_OWNERS) {
    it(`a ${name} is refused, and the refusal names the action`, () => {
      const decision = can(who, ACTION, at(BRANCH_A));
      expect(decision.outcome).toBe("deny");
      expect(decision.action).toBe("device.manage");
    });
  }

  it("the refusal is `deny`, NOT `escalate` — there is no manager-PIN path here (02-F20)", () => {
    // The distinction is load-bearing rather than pedantic. `services/api` maps `escalate` to a
    // refusal that tells the client to route to a second credential (`02-F20`'s console), and
    // `02-F20` enumerates its escalating actions — this is not one of them. A cell written
    // `escalate` would put a "get a manager" affordance on a screen no manager can satisfy.
    for (const [, who] of NON_OWNERS) {
      const decision = can(who, ACTION, at(BRANCH_A));
      expect(decision.outcome).not.toBe("escalate");
      expect(decision.satisfied_by).toBeUndefined();
    }
  });

  it("every non-owner role in ROLES is refused — no column is widened by silence", () => {
    // Reads the ROLES vocabulary rather than this file's list, so a fifth column added to the
    // matrix without a stated device cell cannot slip past by not being enumerated here.
    const widened = ROLES.filter(
      (role) =>
        role !== "owner" &&
        can(subject([{ role, branch_id: BRANCH_A }]), ACTION, at(BRANCH_A)).outcome !== "deny",
    );
    expect(widened).toEqual([]);
  });
});

// ── §3 — the CONTROLS. Without these, every §2 assertion also passes against a matrix that
//         refuses everyone, or one that allows everyone. ──────────────────────────────────────

describe("14-F30 §3 — controls: the verdicts are about THIS action and THESE roles", () => {
  it("the same refused subjects ARE allowed actions their own Appendix A rows grant", () => {
    // Without this, `device.manage` denying a cashier is indistinguishable from a matrix that
    // denies a cashier everything — and three of the four subjects above would be uninformative.
    expect(can(CASHIER, "order.create", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(MANAGER, "day.open_close", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(STOREKEEPER, "stock.receive", at(BRANCH_A)).outcome).toBe("allow");
  });

  it("the same allowed owner is NOT allowed everything — the owner is no wildcard", () => {
    // Appendix A's hard rule binds the owner too, so an implementation that answered `allow` for
    // any owner request would satisfy §2 completely and be wrong.
    expect(can(OWNER, "history.edit_delete", at(BRANCH_A)).outcome).toBe("deny");
  });

  it("a NEIGHBOURING action is unmoved — the device row did not repaint the matrix", () => {
    // `device.manage` sits between `catalog.edit_recipes` and `history.edit_delete` in the action
    // list. A row inserted into the wrong place in `VERDICTS` (or a copy-paste that overwrote its
    // neighbour) would show up here and nowhere else in this file.
    expect(can(OWNER, "catalog.edit_recipes", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(MANAGER, "catalog.edit_recipes", at(BRANCH_A)).outcome).toBe("deny");
  });
});

// ── §4 — fail closed on the identity axes (01-F26, 01-F27) ───────────────────────────────────

describe("14-F30 §4 — an owner of ANOTHER org is a stranger (01-F26)", () => {
  it("a foreign owner is refused this org's devices", () => {
    const foreign = subject([{ role: "owner", branch_id: null }], OTHER_ORG);
    const decision = can(foreign, ACTION, at(BRANCH_A));
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("device.manage");
  });

  it("a BRANCH-scoped owner does not reach another branch's devices (per-location, 01-F26)", () => {
    // `14-F12` is a per-branch list, and `01-F26`'s assignment is per location. An owner assigned
    // at one branch only is a stranger at the other. **The matrix answers this correctly and
    // `services/api` deliberately never asks it**: both device procedures state NO branch, so a
    // branch-scoped subject falls to the `null` case below and is refused outright. Asserting the
    // per-location half anyway is the point — the day a caller does state a branch, this is the
    // behaviour it will get, and `device-router.ts` records why it does not state one today.
    const branchOwner = subject([{ role: "owner", branch_id: BRANCH_A }]);
    expect(can(branchOwner, ACTION, at(BRANCH_A)).outcome).toBe("allow");
    expect(can(branchOwner, ACTION, at(BRANCH_B)).outcome).toBe("deny");
    // …and such an owner cannot reach the org-wide list either, because a branch assignment does
    // not match a `null` scope. Narrow is the fail-closed direction (`services/api`'s decision 3).
    expect(can(branchOwner, ACTION, at(null)).outcome).toBe("deny");
  });
});
