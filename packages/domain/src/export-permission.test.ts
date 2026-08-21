/**
 * **`22-F23`'s `export.request` CELLS, ASSERTED — and this file exists because a mutation run said
 * they were not.**
 *
 * ⚠ **This is NOT an oracle.** `__acceptance__/device-permission.test.ts` and
 * `__acceptance__/user-permission.test.ts` are the oracles for `14-F30`'s and `14-F39`'s cells and
 * were authored by sessions that saw no implementation. `22-F23` has no oracle: the FR, the action
 * and this assertion were written in one change. It is stated plainly rather than filed beside them
 * in `__acceptance__/`, because a hand-written assertion that looks like an oracle is a claim about
 * authorship the corpus can no longer check (`20 §4.3`).
 *
 * ## The measurement that produced it
 *
 * `22-F23` widened the matrix; `services/api`'s `owner-export.test.ts` §A4 asserts *"22-F16
 * 'owner-role ONLY': a branch manager is refused too"*. Measured OUT OF TREE, the whole API suite,
 * with `branch_manager` widened to `"allow"` in a COPY of this package:
 *
 *     mutant E4 — `export.request` cell `branch_manager: "allow"`   →  0 killed of 326
 *
 * **The test that names the case passes under the mutant it names.** The reason is exactly the one
 * `services/api/CLAUDE.md` records for `device.manage` (row A11, found by a senior review): every
 * non-owner subject in that suite is BRANCH-SCOPED, and `governance.requestExport` states no
 * `branch_id`, so `branchOf` resolves `null`, `rolesAt` drops the branch assignment, and the 403
 * arrives from **scope resolution before any cell is read**. So the widened cell is never reached
 * and nothing in this repo could see it — the fourth instance of that shape, and the second on a
 * PERMISSION CELL.
 *
 * ## What this file therefore does that the API suite structurally cannot
 *
 * It asks `can()` directly, with an **org-wide** (`branch_id: null`) subject for each role — which
 * is the shape that reaches the cell, because `rolesAt` carries an org-wide assignment into every
 * location. That is the fix A11 records in terms: *"ADD an org-wide branch manager rather than
 * re-scoping the existing one — the branch-scoping refusal is a real property worth keeping."*
 *
 * ⚠ **Nothing here is mutated in place, ever.** AGENTS.md is narrow and explicit: a permission cell
 * is a security parameter, and an agent killed between "weaken" and "revert" strands a widened
 * credential with every test green. E4 above was run against a COPY of this package in a scratch
 * directory, with only `services/api/node_modules/@restos/domain` — a gitignored symlink, not
 * source — repointed for the run. `permissions.ts` was verified byte-identical by checksum
 * (`64fc97b9…`) before and after.
 */

import { describe, expect, it } from "vitest";
import type { AuthSubject, Role } from "./permissions.js";
import { can, PERMISSION_ACTIONS, ROLES } from "./permissions.js";

const ORG = "org-kababjees";
const OTHER_ORG = "org-student-biryani";
const BRANCH = "branch-gulberg";

/** `01-F26`'s assignment with `11-F22`'s participation, org-wide unless a location is given. */
const subject = (role: Role, org_id = ORG, branch_id: string | null = null): AuthSubject => ({
  user_id: `user-${role}`,
  org_id,
  assignments: [{ role, branch_id, status: "active" }],
});

describe("22-F23: `export.request` is in the matrix at all", () => {
  it("is a member of PERMISSION_ACTIONS — without it 22-F16 cannot be built or booted", () => {
    // `authorized()` takes its action from this closed list and `assertEveryProcedureIsGated`
    // refuses at boot to host a procedure naming none, so this membership is the precondition
    // 14-F30/14-F39/02-F46/02-F47 each had to satisfy first.
    expect(PERMISSION_ACTIONS).toContain("export.request");
  });

  it("is ONE action — no second export/backup/governance action was invented beside it", () => {
    // `22-F23` refused the trigger/read split on `14-F30`'s test (identical cells differ in nothing
    // an implementation can observe). This is the tripwire that stops the split happening silently.
    const named = PERMISSION_ACTIONS.filter(
      (action) =>
        action.startsWith("export.") ||
        action.startsWith("backup.") ||
        action.includes("governance"),
    );
    expect(named).toEqual(["export.request"]);
  });
});

describe("22-F23: the cells — owner allow, everyone else deny (a TRANSCRIPTION of 22-F16)", () => {
  /**
   * ⚠ **ORG-WIDE subjects, and that is the whole point of this file.** A branch-scoped subject is
   * refused by `rolesAt` before the cell is consulted, which is why the API suite's §A4 survived
   * mutant E4. Every row below reaches the cell.
   */
  it("an ORG-WIDE owner is allowed", () => {
    expect(can(subject("owner"), "export.request", { org_id: ORG, branch_id: null }).outcome).toBe(
      "allow",
    );
    // And at a stated branch too: an org-wide assignment carries into every location.
    expect(
      can(subject("owner"), "export.request", { org_id: ORG, branch_id: BRANCH }).outcome,
    ).toBe("allow");
  });

  it("an ORG-WIDE branch manager is DENIED — the cell, not the scope", () => {
    // THE E4 ROW. `22-F16` says "owner-role only" and an export bundle is the whole estate's
    // ledger, with no branch axis for `reportScope` to narrow.
    for (const branch_id of [null, BRANCH]) {
      const decision = can(subject("branch_manager"), "export.request", { org_id: ORG, branch_id });
      expect(decision.outcome, `branch manager, scope branch ${String(branch_id)}`).toBe("deny");
    }
  });

  it("an ORG-WIDE cashier and storekeeper are DENIED", () => {
    for (const role of ["cashier", "storekeeper"] as const) {
      expect(can(subject(role), "export.request", { org_id: ORG, branch_id: null }).outcome).toBe(
        "deny",
      );
    }
  });

  it("`deny` and not `escalate` for any non-owner — this plane can collect no second credential", () => {
    // `22-F23` follows `user.manage`: `02-F20` enumerates the escalating actions and an export is
    // not among them, so an `escalate` cell would render a "get a manager" affordance on a
    // back-office screen with nothing able to satisfy it. Asserted because `escalate` is refused
    // by `services/api` too, so a wrong cell here is invisible from the HTTP status alone.
    for (const role of ROLES.filter((named) => named !== "owner")) {
      expect(
        can(subject(role), "export.request", { org_id: ORG, branch_id: null }).outcome,
        `${role} must be a flat deny, never escalate`,
      ).toBe("deny");
    }
  });

  it("01-F71 (a): an owner of ANOTHER org is refused, before any cell is read", () => {
    // The org arm fires first. Asserted here as well as in `tenant-isolation-matrix.test.ts`'s
    // sweep because this action's whole subject is a copy of one tenant's data.
    expect(
      can(subject("owner", ORG), "export.request", { org_id: OTHER_ORG, branch_id: null }).outcome,
    ).toBe("deny");
    expect(
      can(subject("owner", OTHER_ORG), "export.request", { org_id: ORG, branch_id: BRANCH })
        .outcome,
    ).toBe("deny");
  });

  it("the CONTROL: a branch-scoped owner still reaches it at her own branch", () => {
    // Without this, every `deny` above is consistent with a matrix that refuses `export.request`
    // to everybody — which is the other way to get owner-only wrong, and the way that makes the
    // feature unreachable rather than over-reachable.
    expect(
      can(subject("owner", ORG, BRANCH), "export.request", { org_id: ORG, branch_id: BRANCH })
        .outcome,
    ).toBe("allow");
  });
});
