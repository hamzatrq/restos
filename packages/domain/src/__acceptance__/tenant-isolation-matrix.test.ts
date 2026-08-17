/**
 * **`01-F71` (a) — THE PERMISSION MATRIX'S ORG ARM, AS ITS OWN REGISTER ENTRY.**
 *
 * `01-F71` names four enforcement points and requires that **each carries a test that FAILS when
 * that point alone is removed**. Point (a) is:
 *
 *   > *"The permission matrix refuses when the subject's org differs from the scope's, before any
 *   > action-specific reasoning — `can()` and `reportScope` both."*
 *
 * ── ⚠ WHY THIS FILE EXISTS SEPARATELY FROM THE API'S TWO-TENANT ORACLE — A MEASUREMENT ──────
 *
 * `services/api/src/__acceptance__/tenant-isolation.test.ts` runs two real tenants against the
 * live tRPC host and attacks each from the other. It **cannot** cover point (a), and this was
 * measured rather than assumed. Both org arms were deleted, one at a time, and the API suite was
 * run in full against each:
 *
 *   | mutant                                    | services/api (287 tests) |
 *   |-------------------------------------------|--------------------------|
 *   | `can()`'s org arm deleted                 | **0 killed — survives**  |
 *   | `reportScope`'s org arm deleted           | **0 killed — survives**  |
 *
 * The reason is structural and worth stating, because it is the thing a reader will otherwise
 * rediscover: **enforcement point (b) makes point (a) unreachable from that plane.** `trpc.ts`
 * builds every scope as `{ org_id: ctx.subject.org_id, … }`, so on the cloud plane
 * `subject.org_id !== scope.org_id` is *never true* — the guard is defence in depth against
 * (b) failing, and no test that goes through the host can distinguish it from dead code.
 *
 * That is precisely the situation `01-F71` was written for: a guard nobody can point at is a
 * guard a refactor deletes. The org arm is only observable by calling `can()` and `reportScope`
 * **directly, with a scope from another tenant**, which is what this file does.
 *
 * ── MUTATION MATRIX (round-3 law) — control **114/114** green, 0 survivors ───────────────────
 *
 * Run **OUT-OF-TREE**: `packages/domain` was copied to a scratchpad with `node_modules` symlinked
 * and mutated *there*. `permissions.ts` was verified byte-identical by checksum before and after
 * every row (`3044442f…`) and **was never edited in this repo** — AGENTS.md's rule, because an
 * agent killed between "weaken" and "revert" would strand a live cross-tenant hole with every test
 * green. Control = this file's 10 plus `permission-matrix.test.ts` (89) and
 * `device-permission.test.ts` (15).
 *
 *   | #    | mutant (exactly one branch)                | this file | pre-existing 104 |
 *   |------|--------------------------------------------|-----------|------------------|
 *   | M-a1 | `can()`'s org arm deleted                  | **4**     | 1 (`device-permission`) |
 *   | M-a2 | `reportScope`'s org arm deleted            | **2**     | **all green**    |
 *   | M-a3 | `canPayOut`'s org arm deleted              | **1**     | **all green**    |
 *   | M-neg| CONTROL: the same guard, operands swapped  | **0**     | all green        |
 *
 * **M-a2 and M-a3 are the rows that justify this file existing.** Before it, deleting either of
 * those two org arms killed **nothing anywhere in the repo** — 104 domain tests green and,
 * separately measured, 287 `services/api` tests green. `reportScope` decides how WIDE a report is
 * and `canPayOut` decides whether cash leaves a drawer; both were unguarded by any assertion.
 *
 * **M-neg is what makes the other three numbers mean anything**: a behaviour-preserving edit to
 * the same expression reddens nothing, so the kills are attributable to the property under test
 * rather than to a suite that reddens on any touch.
 *
 * ── HOW THE ASSERTIONS ARE POINTED ──────────────────────────────────────────────────────────
 *
 * The trap in a sweep like this is that it passes for the wrong reason. `expect(outcome).toBe(
 * "deny")` across every cell is satisfied by a matrix that denies **everything**, including a
 * matrix broken for its own tenant — so a green sweep would prove nothing at all.
 *
 * Every cross-org assertion below is therefore **conditional on the same-org answer being
 * permissive**: the pair `(role, action)` is only interesting if the identical call, changed in
 * exactly one field — the scope's `org_id` — would have been allowed or escalated. The count of
 * such cells is asserted to be non-zero, so the sweep cannot go vacuous if the matrix changes.
 * That is a CONTROL in the strict sense: one variable, two runs, a difference attributable to it.
 *
 * ⚠ **PROTECTED PATH (commandment 10): `packages/domain`.** Test file only; no implementation is
 * touched by this session. Authored by a test-authoring session (`24 §3` step 2).
 */

import { describe, expect, it } from "vitest";
import {
  type AuthScope,
  type AuthSubject,
  can,
  canPayOut,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type ReportReach,
  ROLES,
  type Role,
  reportScope,
} from "../permissions.js";

// ════════════════════════════════════════════════════════════════════════════════════════════════
// TWO TENANTS, and a third pair chosen to break a SUBSTRING comparison rather than an equality.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const ORG_A = "org-kababjees";
const ORG_B = "org-student-biryani";

const BRANCH_A = "branch-gulberg";
const BRANCH_B = "branch-nazimabad";

const USER_A = "user-a-owner";
const USER_B = "user-b-owner";

/** Every way a subject can hold a role: at their own branch, and org-wide (`01-F26`). */
const subjectIn = (org_id: string, role: Role, branch_id: string | null): AuthSubject => ({
  user_id: USER_A,
  org_id,
  assignments: [{ role, branch_id }],
  // `11-F22` — every fixture here is a currently-employed person, which is what these assertions
  // already assumed and could not say. Absent no longer means `active` (the FR forbids that
  // default by name), so the builder states it. The isolation axis this file owns is untouched:
  // both orgs' subjects are stated identically, so an org refusal is still an org refusal.
  status: "active",
});

/**
 * The scope, with every optional field filled so no action falls into a "missing input" refusal
 * and gets counted as an org refusal it did not earn. `subject_user_id` matches the subject so
 * `02-F23`'s own-shift arm ALLOWS; `requested_by_user_id` is somebody else so `02-F38`'s
 * self-approval refusal does not fire.
 */
const scopeIn = (org_id: string, branch_id: string | null): AuthScope => ({
  org_id,
  branch_id,
  subject_user_id: USER_A,
  requested_by_user_id: USER_B,
});

/** Every (role, branch-shape) a subject can have. */
const SUBJECT_SHAPES: readonly { label: string; role: Role; assignedTo: string | null }[] =
  ROLES.flatMap((role) => [
    { label: `${role} @ ${BRANCH_A}`, role, assignedTo: BRANCH_A },
    { label: `${role} org-wide`, role, assignedTo: null },
  ]);

/** Every branch a scope can name, including "none stated" and the OTHER tenant's branch. */
const SCOPE_BRANCHES: readonly (string | null)[] = [BRANCH_A, BRANCH_B, null];

// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§A `can()` — the org arm, swept over every action × role × branch shape", () => {
  /**
   * The sweep, computed once so both the assertion and its control read the same cells.
   *
   * `permissive` holds every triple whose SAME-ORG answer is `allow` or `escalate` — i.e. every
   * call that had something to lose. Those are the only ones the cross-org assertion is made
   * about, because a cell that refuses its own tenant proves nothing about isolation.
   */
  const permissive: {
    action: PermissionAction;
    shape: (typeof SUBJECT_SHAPES)[number];
    branch: string | null;
    ownOutcome: string;
  }[] = [];

  for (const action of PERMISSION_ACTIONS) {
    for (const shape of SUBJECT_SHAPES) {
      for (const branch of SCOPE_BRANCHES) {
        const own = can(
          subjectIn(ORG_A, shape.role, shape.assignedTo),
          action,
          scopeIn(ORG_A, branch),
        );
        if (own.outcome !== "deny") {
          permissive.push({ action, shape, branch, ownOutcome: own.outcome });
        }
      }
    }
  }

  it("CONTROL — the sweep contains cells that are genuinely permissive within one org", () => {
    // Without this the whole section is satisfied by a matrix that denies everything, which is
    // both broken and "isolated". The number is asserted as a floor rather than pinned, so an
    // added action or a widened cell does not turn this into a maintenance chore — but a matrix
    // that collapsed to all-deny fails here first and loudly.
    expect(permissive.length).toBeGreaterThan(20);
    // Both permissive outcomes are represented, so the cross-org sweep below covers the
    // `escalate` path too — `02-F20`'s third value is where a boolean rewrite would lose the org
    // check without any `allow` cell changing.
    expect(new Set(permissive.map((cell) => cell.ownOutcome))).toEqual(
      new Set(["allow", "escalate"]),
    );
  });

  it("every cell that would ALLOW or ESCALATE within one org DENIES across orgs", () => {
    const survived: string[] = [];
    for (const cell of permissive) {
      // Exactly one field differs from the permissive call above: the scope's `org_id`.
      const across = can(
        subjectIn(ORG_A, cell.shape.role, cell.shape.assignedTo),
        cell.action,
        scopeIn(ORG_B, cell.branch),
      );
      if (across.outcome !== "deny") {
        survived.push(
          `${cell.action} / ${cell.shape.label} / branch=${cell.branch} → ${across.outcome}`,
        );
      }
    }
    expect(survived).toEqual([]);
  });

  it("the refusal is symmetric — a subject of B is equally a stranger in A", () => {
    // Isolation is symmetric or it is not isolation. A one-directional sweep passes against an
    // implementation that special-cases a "primary" tenant, which is the shape a SaaS refactor
    // produces when one org was there first.
    const survived: string[] = [];
    for (const cell of permissive) {
      const across = can(
        subjectIn(ORG_B, cell.shape.role, cell.shape.assignedTo),
        cell.action,
        scopeIn(ORG_A, cell.branch),
      );
      if (across.outcome !== "deny") survived.push(`${cell.action} / ${cell.shape.label}`);
    }
    expect(survived).toEqual([]);
  });

  it("the org check is EQUALITY, not a prefix or substring match", () => {
    // The hazard this is aimed at is an implementation using `startsWith`/`includes` — which is
    // how `01-F71` (d)'s separator-less key defect works one enforcement point over, and the same
    // mistake is available here. Real org ids are UUIDv7 (`01-F68`), where a shared prefix is
    // ordinary rather than exotic.
    const pairs: readonly [string, string][] = [
      ["org-a", "org-ab"],
      ["org-ab", "org-a"],
      ["org-0190f2", "org-0190f2c1"],
      ["", ORG_A],
    ];
    for (const [subjectOrg, scopeOrg] of pairs) {
      for (const action of PERMISSION_ACTIONS) {
        const decision = can(
          subjectIn(subjectOrg, "owner", null),
          action,
          scopeIn(scopeOrg, BRANCH_A),
        );
        expect(decision.outcome, `${action}: ${subjectOrg} → ${scopeOrg}`).toBe("deny");
      }
    }
  });

  it("the org arm fires BEFORE action-specific reasoning — an owner is refused every action", () => {
    // `01-F71` (a) says "before any action-specific reasoning". An owner is the widest role there
    // is, so if any action survives for her across orgs, the org arm is being reached late or not
    // at all. Asserted over the whole action list rather than a sample, so a new action is covered
    // the day it is added.
    for (const action of PERMISSION_ACTIONS) {
      expect(can(subjectIn(ORG_A, "owner", null), action, scopeIn(ORG_B, null)).outcome).toBe(
        "deny",
      );
      expect(can(subjectIn(ORG_A, "owner", null), action, scopeIn(ORG_B, BRANCH_B)).outcome).toBe(
        "deny",
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§B `reportScope` — the same arm on the READ-WIDTH question", () => {
  /**
   * `reportScope` is a separate export with its own org arm, and it is separately dangerous:
   * `can()` answers *may this happen*, `reportScope` answers *how wide is the answer*. A caller
   * that widened a report to another tenant would be authorized correctly and answer wrongly, so
   * the two guards need two tests. `summary-router.ts` reads this one directly.
   */
  const reaches = (org_id: string, role: Role, assignedTo: string | null, branch: string | null) =>
    reportScope(subjectIn(org_id, role, assignedTo), scopeIn(org_id, branch));

  it("CONTROL — within one org, roles really do reach different widths", () => {
    // Proves the function discriminates at all. A `reportScope` that answered `none` for everyone
    // would satisfy every cross-org assertion below while breaking every report in the product.
    const own = new Set<ReportReach>();
    for (const shape of SUBJECT_SHAPES) {
      for (const branch of SCOPE_BRANCHES) {
        own.add(
          reportScope(subjectIn(ORG_A, shape.role, shape.assignedTo), scopeIn(ORG_A, branch)),
        );
      }
    }
    expect(own.has("org")).toBe(true);
    expect(own.has("own_branch")).toBe(true);
    expect(own.has("own_shift")).toBe(true);
    expect(reaches(ORG_A, "owner", null, null)).toBe("org");
  });

  it("across orgs every role reaches NONE, including the widths that are non-none at home", () => {
    const survived: string[] = [];
    for (const shape of SUBJECT_SHAPES) {
      for (const branch of SCOPE_BRANCHES) {
        const subject = subjectIn(ORG_A, shape.role, shape.assignedTo);
        // The pair that makes this a control: identical subject, identical branch, one field moved.
        const atHome = reportScope(subject, scopeIn(ORG_A, branch));
        const across = reportScope(subject, scopeIn(ORG_B, branch));
        if (across !== "none") survived.push(`${shape.label} / branch=${branch} → ${across}`);
        // And the pairing is asserted rather than assumed: if `atHome` were also `none` this row
        // would be proving nothing, and the CONTROL above would not catch it per-row.
        if (atHome !== "none") expect(across).not.toBe(atHome);
      }
    }
    expect(survived).toEqual([]);
  });

  it("symmetric, and equality rather than prefix here too", () => {
    for (const shape of SUBJECT_SHAPES) {
      expect(
        reportScope(subjectIn(ORG_B, shape.role, shape.assignedTo), scopeIn(ORG_A, null)),
      ).toBe("none");
    }
    expect(reportScope(subjectIn("org-a", "owner", null), scopeIn("org-ab", null))).toBe("none");
    expect(reportScope(subjectIn("org-ab", "owner", null), scopeIn("org-a", null))).toBe("none");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§C `canPayOut` — the third org arm, on the one action that leaves with cash", () => {
  /**
   * `canPayOut` carries its own copy of the org check because `can("cash.paid_out", …)` refuses by
   * design (`05-F19`: the verdict needs the amount and the threshold, which `AuthScope` cannot
   * carry). So it is a THIRD place the property can be broken, and the one where breaking it means
   * money leaving a drawer — `apps/pos-electron/src/main/authorize.ts` is its shipping caller.
   */
  /**
   * Three amounts as LITERALS, straddling the threshold. Written as `THRESHOLD + 1` first, which
   * `DEC-MONEY-005`'s GritQL rail correctly refused — raw arithmetic on a money-named value is
   * banned, and "it is only a test fixture" is not one of the exemptions.
   */
  const THRESHOLD_PAISA = 500_00;
  const BELOW_PAISA = 100_00;
  const ABOVE_PAISA = 500_01;

  const request = { amount_paisa: BELOW_PAISA, threshold_paisa: THRESHOLD_PAISA };

  it("CONTROL — within one org, a role that may take cash out is permitted below the threshold", () => {
    const own = ROLES.map((role) =>
      canPayOut(subjectIn(ORG_A, role, null), scopeIn(ORG_A, BRANCH_A), request),
    );
    // At least one role is allowed at home, or the cross-org assertions below are vacuous.
    expect(own.some((decision) => decision.outcome === "allow")).toBe(true);
  });

  it("across orgs every role is DENIED — below the threshold, at it, and above it", () => {
    // All three amounts, because `05-F19`'s threshold branch returns `escalate` rather than `deny`
    // and an org check placed after it would leak an escalation offer to another tenant's owner —
    // a refusal that names which credential would work is itself a disclosure.
    for (const amount of [BELOW_PAISA, THRESHOLD_PAISA, ABOVE_PAISA]) {
      for (const role of ROLES) {
        const decision = canPayOut(subjectIn(ORG_A, role, null), scopeIn(ORG_B, BRANCH_B), {
          amount_paisa: amount,
          threshold_paisa: request.threshold_paisa,
        });
        expect(decision.outcome, `${role} @ ${amount}`).toBe("deny");
        // And it offers no route: `satisfied_by` on a cross-tenant refusal would tell a stranger
        // which of another restaurant's roles to go and find.
        expect(decision.satisfied_by).toBeUndefined();
      }
    }
  });
});
