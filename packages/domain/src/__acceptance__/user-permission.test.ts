// Acceptance tests — `14-F39`'s `user.manage` cell, the row Appendix A does not carry.
//
// **Authored from SPEC TEXT ONLY**, by a session that wrote no implementation for this FR, no
// part of `permissions.ts`, and did not read the build plan's file-by-file sequence (`24 §3`
// step 2). The FR was read as shipped corpus text; every cell below is traceable to a quoted
// clause, not to what the matrix happens to look like.
//
// Sources, and nothing else:
//   `specs/14-backoffice.md`      — `14-F14` (User CRUD: role × per-location assignment, PIN
//                                   set/reset, deactivation preserving attribution), `14-F15`
//                                   (owner-visible login and audit history per user), **`14-F39`
//                                   — THE DECIDING FR**: the action's name, that it is ONE
//                                   action, and its four cells; `14-F30` (the precedent `14-F39`
//                                   says it RAN rather than assumed); `14-F2` (every settings
//                                   change is ledgered — "no silent edits exist"); §9 q1, the
//                                   open question that owns this axis and **names `users` by
//                                   name**; §9 q6, the founder ruling that is about DEVICES and
//                                   is deliberately not extended here.
//   `specs/01-kernel-sync.md`     — `01-F26` (User × Role × per-location assignment; Appendix A
//                                   is the SEED matrix), `01-F27` (server-side authorization on
//                                   every operation; a device token carries device identity
//                                   ONLY, so a device with nobody unlocked has no authority),
//                                   `01-F71` (the org comes from the authenticated subject and
//                                   never from the request).
//   `specs/02-pos-app.md`         — `02-F20`, whose escalating actions are enumerated ("void
//                                   after KOT, comp, discount above org threshold, price
//                                   override"). User management is not among them, which is why
//                                   `14-F39`'s three refusals are `deny` and not `escalate`.
//   `restaurant-os.md` Appendix A — which carries **no user, person or role row**. That absence
//                                   is what makes this action FR-decided rather than
//                                   appendix-decided, and §5 asserts it against the FILE rather
//                                   than against a hand-copy (round-2 §C failure 2).
//
// **Why a separate file rather than rows in `permission-matrix.test.ts`.** That file's stated
// contract is "Appendix A, transcribed", and its §4b pins the transcription's exclusion list.
// `user.manage` is decided by an FR and by no appendix cell, exactly like `device.manage`,
// `availability.toggle` and `customer.record`. It follows `device-permission.test.ts`'s shape
// deliberately — a second suite that re-litigates the same matrix a different way is a liability.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// **RED-AWAITING-IMPLEMENTATION, and the vacuity trap is named because it nearly bit this file.**
// `PERMISSION_ACTIONS` carries 25 actions and none of them names a user, so `can()`'s
// unknown-action fallback refuses `user.manage` **for every role including the owner**. A naive
// "a cashier is refused" test is therefore GREEN today for entirely the wrong reason, and would
// stay green against an implementation that never declared the action at all.
//
// Every refusal test below therefore asserts, first, that the action is a member of
// `PERMISSION_ACTIONS` — so what it measures is *"refused by her ROW"* and never *"refused
// because the matrix has never heard of this"*. That makes §2 and §4 red today for the right
// reason. §1's fail-closed pin and §3's controls and §5's appendix pin are GREEN by design and
// are labelled as such on each test; they are credited as controls, not as coverage.
//
// **Measured after the §2 scope repair below: 16 of 22 RED, 6 GREEN** — the six being the three §3
// controls, §1's near-miss pin and §5's two appendix pins, each labelled on the test itself so no
// assertion here is credited with coverage it does not carry. The full package was 549 passed / 16
// failed with every one of the 28 pre-existing files green, so the reds are attributable to this
// file alone. (⚠ *It read "12 of 18 RED … 549 passed / 12 failed" as authored, which was the true
// measurement before the repair; the four new §2 tests are all RED today, and the pre-existing 549
// did not move.*)
//
// ── REPAIR, August 2026 — THE FIXTURE GAP: EVERY NON-OWNER SUBJECT WAS BRANCH-SCOPED ───────────
// As authored, `:123-125` and both §2 sweeps built every non-owner at `BRANCH_A`, so **no org-wide
// non-owner** — a `RoleAssignment` with `branch_id: null` — was ever asked about `user.manage`.
// `permissions.ts:49-56` documents that value as org-wide, "which is how an owner holds Appendix
// A's 'everything'", and an implementation that read it the other way round — *the org-wide
// assignment IS the owner*, the plausible shortcut for an action whose whole content is "owner
// only" — allows an org-wide **cashier** to administer the roster while all 18 original tests
// pass. It is a widening along the SCOPE axis, and the role sweep at `:216` cannot see it: both
// axes are needed, they catch different mutants, and neither is weakened here.
//
// **What `14-F39` decides, and what is a READING.** The FR states four cells — "Owner allow ·
// Branch Mgr deny · Cashier deny · Storekeeper deny" — indexed by ROLE, and **qualifies none of
// them by location**; it does not mention the org-wide non-owner case at all, so the new tests are
// NOT a transcription. The reading, stated so it can be contested: `01-F26`'s assignment is "User
// × Role × per-location", so the location axis decides WHERE a role reaches and never WHICH row is
// read — an org-wide cashier is still a cashier — and `14-F39`'s "IT IS OWNER-ONLY" is a claim
// about the role, so the three deny cells hold at every location including the org-scoped request.
// The fail-closed direction agrees (`14-F39`: "widening later is additive and safe; narrowing
// later is not … the wrong guess in the permissive direction is a self-promotion path into an
// append-only ledger"), and §9.1 remains the open question that owns the axis.
// ───────────────────────────────────────────────────────────────────────────────────────────────
//
// **And the other half of `24 §3`, which this repo has shipped three violations of:** a suite that
// stays RED under a CORRECT implementation blocks the implementer indefinitely and is as damaging
// as a vacuous one. Checked OUT-OF-TREE (the package rsync'd to a scratchpad, `node_modules`
// symlinked, `restaurant-os.md` staged at the right depth) by adding `"user.manage"` to
// `PERMISSION_ACTIONS` and a `cashier/branch_manager/storekeeper: deny, owner: allow` row: **22 of
// 22 green** — 18 of 18 as authored, re-run after the §2 scope repair with
// `permission-matrix.test.ts` and `device-permission.test.ts` alongside as neighbour controls
// (**126 of 126**). `packages/domain/src/permissions.ts` was never opened for writing in this tree
// and was verified byte-identical afterwards (`e585ee63…`).
//
// **The repair's mutants ran in that same copy and NEVER in this tree** — a permission cell is a
// security parameter, and an agent killed between "weaken" and "revert" would strand a widened
// credential with every test green (AGENTS.md). Each differs in exactly one branch, and in every
// row the failing FILE was this one, so `permission-matrix.test.ts`'s 89 and
// `device-permission.test.ts`'s 15 stayed green under all four:
//
//   M1  the SCOPE shortcut — `user.manage` + any `branch_id: null` assignment ⇒ allow …… 4 killed
//       the four new tests, and **all 18 original tests survive it** — which is the measurement
//       that makes the fixture gap a fact rather than a worry.
//   M2  CONTROL — `user.manage` moves position in `PERMISSION_ACTIONS` ………………………………… 0 killed
//   M3  the ROLE widening — `branch_manager: "allow"` ……………………………………………………………………… 4 killed
//       2 on the branch-scoped axis, 2 on the org-wide one. The axes are not redundant: M1 kills
//       only the new pair, M3 kills across both.
//   M4  the CONTROL's own mutant — `rolesAt` stops resolving org-wide assignments ……………… 7 killed
//       each new test fails on the control it CARRIES ("an org-wide cashier lost `order.create`
//       … her assignment did not resolve") and not on its refusal — without that control the
//       refusals would pass against a matrix that had simply dropped her.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// **What this file deliberately does NOT decide** (recorded so a later session does not read
// silence as permission):
//   * `user.changed`'s payload schema. `14-F39` names it blocked and routes it to doc 14 §9.11;
//     the shipped precedent (`services/api/src/devices.ts`) declares an org-scoped payload beside
//     its emitter. Not this package, not this step.
//   * `01-F26`'s per-user permission OVERRIDES — unmodelled anywhere, and `permissions.ts` says
//     so. `14-F14` lists them, so this action gates a *partial* `14-F14`.
//   * `11-F22`'s participation status. It says the authorization subject reads the status, which
//     is a change to `AuthSubject`'s shape decided by that FR, not by `14-F39`. Nothing here
//     asserts a status field, because inventing its shape is how a test gets written to pass.
//   * Whether the user-management PROCEDURES state a `branch_id`. §9 q6 ruled that question for
//     devices only; the staff roster's own org-vs-branch scoping is unruled. §4 asserts what the
//     MATRIX answers when asked, and says nothing about what the surface should ask.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");

/**
 * The action `14-F39` names, in its own words: "**`user.manage` IS THE PERMISSION ACTION FOR
 * THIS §3 BLOCK**".
 *
 * Typed `string` so the `as PermissionAction` below is a legal downcast before the action is
 * declared — the file must compile today (`pnpm verify` runs `typecheck` for every other agent
 * in this tree) while failing at RUN time. `device-permission.test.ts` established the idiom.
 */
const USER_MANAGE: string = "user.manage";
const ACTION = USER_MANAGE as PermissionAction;

const ORG = newId();
const OTHER_ORG = newId();
const BRANCH_A = newId();
const BRANCH_B = newId();

// `11-F22` (August 2026) — participation rides the (role, location) pair and only `active`
// participates. Every subject built here is a person ON the roster, so the stamp restates the same
// subject under a widened type: no assertion, title or expected value in this file moves, and
// nothing below reads the member.
const subject = (
  assignments: readonly { role: Role; branch_id: string | null }[],
  org_id: string = ORG,
): AuthSubject => ({
  user_id: newId(),
  org_id,
  assignments: assignments.map((assignment) => ({ ...assignment, status: "active" as const })),
});

/** The `14-F39` actor: an owner, org-wide, which is how Appendix A gives them "everything". */
const OWNER = subject([{ role: "owner", branch_id: null }]);
const CASHIER = subject([{ role: "cashier", branch_id: BRANCH_A }]);
const MANAGER = subject([{ role: "branch_manager", branch_id: BRANCH_A }]);
const STOREKEEPER = subject([{ role: "storekeeper", branch_id: BRANCH_A }]);

const at = (branch_id: string | null) => ({ org_id: ORG, branch_id });

/**
 * The guard that makes every refusal below mean something. Without it a `deny` is ambiguous
 * between "her row refuses her" and "`can()` has never heard of this action", and the second
 * reading is true of the tree as this file is written.
 */
const requireDeclared = () => {
  expect(
    PERMISSION_ACTIONS,
    "`user.manage` is not in PERMISSION_ACTIONS, so every refusal below is `can()`'s " +
      "unknown-action fallback rather than `14-F39`'s row — the assertion measures nothing " +
      "until the action is declared (14-F39: `authorized()` takes an action from that closed list)",
  ).toContain(USER_MANAGE);
};

// ── §1 — the action exists at all, which is the gap `14-F39` was written to close ─────────────

describe("14-F39 §1 — the matrix carries a user action (Commandment 8)", () => {
  it("`user.manage` is a member of PERMISSION_ACTIONS", () => {
    // `14-F39`'s measurement, verbatim: "`packages/domain`'s matrix ships 25 actions and not one
    // names a user, a person or a role; `authorized()` takes an action from that closed list and
    // the API host refuses at boot to serve a procedure that names none. So `14-F14` and `14-F15`
    // cannot be built *or* booted."
    //
    // Asserted against the PRODUCTION export, never a hand-copy of it (round-2 §C failure 2): the
    // closed list `authorized()` validates against is this one, so a suite asserting its own copy
    // would bless a boot that still refuses.
    expect(PERMISSION_ACTIONS).toContain(USER_MANAGE);
  });

  it("14-F39 — it is ONE action: the matrix carries exactly one user/person/role action", () => {
    // `14-F39` ran `14-F30`'s test rather than assuming it: "The candidate split is `14-F15`'s
    // read — login and audit history per user — against `14-F14`'s writes: create, role ×
    // per-location assignment, PIN set/reset, deactivation. Under the cells below **every cell of
    // both halves is identical**, so the two actions would differ in nothing an implementation can
    // observe."
    //
    // This is a TRIPWIRE on a recorded interpretation, not a law. `14-F39` names the trigger that
    // legitimately breaks it: "**If any role is ever widened into this block, the read/write split
    // is the edit to make in the same change as the widening, never after it.**" So if you are
    // reading this because it failed: the split may well be right — it is the *widening* that has
    // to arrive with it, and this line is what makes both visible in one diff instead of one of
    // them arriving alone.
    //
    // Matched on the action's NOUN (the segment before the first `.`) against `14-F39`'s own
    // vocabulary — "not one names a user, a person or a role" — so `user.view` / `user.write`,
    // `staff.manage` and `person.manage` all redden, and no unrelated action can match by
    // accident.
    const NOUNS = new Set(["user", "users", "person", "people", "staff", "role", "roles"]);
    const userActions = PERMISSION_ACTIONS.filter((action) =>
      NOUNS.has(action.split(".")[0] ?? ""),
    );
    expect(userActions, "14-F39 decided ONE action for this §3 block").toEqual([USER_MANAGE]);
  });

  it("GREEN BY DESIGN — an undeclared neighbour is refused, so the closed list is the vocabulary", () => {
    // `14-F39`'s premise is that the closed list is what `authorized()` and the API's boot
    // assertion validate against. This pins the other half of that premise: a name that merely
    // *looks* like the action buys nothing. It passes before the implementation exists and is
    // credited as a control, not as coverage of `14-F39`.
    for (const nearMiss of ["users.manage", "user.manage_all", "user", "user.Manage"]) {
      expect(can(OWNER, nearMiss as PermissionAction, at(BRANCH_A)).outcome).toBe("deny");
    }
  });
});

// ── §2 — the cells. `14-F39`: "Owner allow · Branch Mgr deny · Cashier deny · Storekeeper deny"
//         — a PINNED INTERPRETATION, contestable, not a transcription. ──────────────────────────

describe("14-F39 §2 — owner-only (§9.1 is the open question that owns this axis)", () => {
  it("an owner may manage users at a branch — `Owner allow`", () => {
    expect(can(OWNER, ACTION, at(BRANCH_A)).outcome).toBe("allow");
  });

  it("01-F26 — an org-wide owner reaches EVERY branch's roster (branch_id null is org-wide)", () => {
    // `14-F14`'s assignment is "role × per-location", so the roster spans locations; an owner who
    // could administer at one branch only could not staff the other. And the org-scoped request —
    // no branch stated — must resolve too, or `14-F14` has no reachable entry point at all:
    // `01-F71` says the org comes from the authenticated subject, which is precisely a request
    // that names no branch.
    expect(can(OWNER, ACTION, at(BRANCH_B)).outcome).toBe("allow");
    expect(can(OWNER, ACTION, at(null)).outcome).toBe("allow");
  });

  // One test per role, generated from `ROLES` itself rather than from a list in this file, so a
  // fifth column added to the matrix gets its own named test automatically and cannot be widened
  // into this row by silence. The titles name the role on purpose: a widening mutant must fail an
  // assertion a reader can attribute without opening the file.
  for (const role of ROLES) {
    if (role === "owner") continue;
    it(`14-F39 — a ${role} is refused, by her ROW and not by the unknown-action fallback`, () => {
      requireDeclared();
      const decision = can(subject([{ role, branch_id: BRANCH_A }]), ACTION, at(BRANCH_A));
      // `14-F39` writes the word: "Branch Mgr deny · Cashier deny · Storekeeper deny".
      expect(decision.outcome, `14-F39 pins ${role} at deny`).toBe("deny");
      // A refusal a caller cannot attribute is indistinguishable from a refusal of something else
      // it also asked about.
      expect(decision.action).toBe(USER_MANAGE);
      // `deny`, NOT `escalate`. `02-F20` enumerates its escalating actions — "void after KOT,
      // comp, discount above org threshold, price override" — and user management is not one, so
      // there is no manager-PIN path to satisfy. A cell written `escalate` would put a "get a
      // manager" affordance on a screen no credential can close, and `satisfied_by` is present on
      // `escalate` and only on `escalate`.
      expect(decision.satisfied_by, `no role can satisfy a ${role}'s request (02-F20)`).toBe(
        undefined,
      );
    });
  }

  // The SECOND axis, and the one the sweep above is structurally blind to (see the REPAIR note in
  // the header). Same generation from `ROLES`, same one-named-test-per-role property — a fifth
  // column gets an org-wide test of its own automatically — but the subject is org-wide instead of
  // branch-scoped, which is the shape `permissions.ts` itself calls "how an owner holds Appendix
  // A's 'everything'". A widening that reads that sentence backwards passes every branch-scoped
  // assertion in this file.
  for (const role of ROLES) {
    if (role === "owner") continue;
    it(`14-F39 / 01-F26 — an ORG-WIDE ${role} is refused: null widens the LOCATION, not the ROLE`, () => {
      requireDeclared();
      const orgWide = subject([{ role, branch_id: null }]);

      // The CONTROL, carried INSIDE the test it protects rather than a section away, because the
      // two must not drift: without it a `deny` below is ambiguous between "her ROW refuses her"
      // and "an org-wide assignment resolved to no role at all", and the second reading would let
      // this test pass against a matrix that had simply dropped her — the same vacuity this file's
      // `requireDeclared` closes on the action axis. It is derived by ASKING the production matrix
      // (`permission-matrix.test.ts` owns Appendix A's transcription; a hand-copy here would be a
      // second authority for one table) and it grows with a fifth column like everything else.
      const heldAtBranch = PERMISSION_ACTIONS.filter(
        (candidate) =>
          can(subject([{ role, branch_id: BRANCH_A }]), candidate, at(BRANCH_A)).outcome ===
          "allow",
      );
      expect(
        heldAtBranch.length,
        `24-F14 empty-match — a branch-scoped ${role} is allowed nothing at all, so the org-wide ` +
          "control below matches nothing and this test would measure only itself",
      ).toBeGreaterThan(0);
      for (const held of heldAtBranch) {
        expect(
          can(orgWide, held, at(BRANCH_A)).outcome,
          `an org-wide ${role} lost \`${held}\`, which a branch-scoped ${role} holds — her ` +
            "assignment did not resolve, so the refusals below are not about `14-F39`'s row",
        ).toBe("allow");
      }

      // `14-F39` writes its cells by ROLE and qualifies none of them by location; `01-F26`'s
      // assignment is "User × Role × per-location". Asked at BOTH branches and at the org-scoped
      // request — `01-F71`'s "the org comes from the authenticated subject", which is precisely a
      // request that names no branch, and the one where "she is org-wide, like the owner" is most
      // tempting. This is the READING recorded in the header, not a transcription.
      for (const [where, scope] of [
        ["branch A", at(BRANCH_A)],
        ["branch B", at(BRANCH_B)],
        ["the org-scoped request (no branch stated)", at(null)],
      ] as const) {
        const decision = can(orgWide, ACTION, scope);
        expect(
          decision.outcome,
          `14-F39 is owner-only and an org-wide ${role} is not an owner — asked at ${where}`,
        ).toBe("deny");
        expect(decision.action).toBe(USER_MANAGE);
        expect(decision.satisfied_by, `no role can satisfy a ${role}'s request (02-F20)`).toBe(
          undefined,
        );
      }
    });
  }

  it("14-F39 — no column is widened by silence: `owner` is the ONLY allowed role in ROLES", () => {
    // Reads the ROLES vocabulary at run time rather than this file's constants, and reports the
    // offending role by name in the failure. The per-role tests above and this one overlap on
    // purpose: they fail differently (one names the role in the TITLE, one in the VALUE), and the
    // brief's widening mutants are meant to be attributable either way.
    requireDeclared();
    const widened = ROLES.filter(
      (role) =>
        role !== "owner" &&
        can(subject([{ role, branch_id: BRANCH_A }]), ACTION, at(BRANCH_A)).outcome !== "deny",
    );
    expect(
      widened,
      "a role other than `owner` may administer users — §9.1 is OPEN, so this answers an open " +
        "question by accident, and `14-F39` requires the read/write split to land in the SAME " +
        "change as any widening",
    ).toEqual([]);
  });

  it("14-F39 / 01-F26 — no SCOPE is widened by silence: org-wide is a LOCATION, not the owner row", () => {
    // The value-naming twin of the org-wide sweep above, for the reason the role axis already has
    // one: the two fail differently — the sweep names the role in the TITLE, this names the
    // offending (role, location) PAIR in the failure value — so a scope widening is attributable
    // either way, and a shortcut that fires only on the org-scoped request is not hidden behind a
    // test title that says only "cashier".
    requireDeclared();
    const SCOPES = [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
      ["org-scoped, no branch stated", at(null)],
    ] as const;
    const widened = ROLES.filter((role) => role !== "owner").flatMap((role) =>
      SCOPES.filter(
        ([, scope]) => can(subject([{ role, branch_id: null }]), ACTION, scope).outcome !== "deny",
      ).map(([where]) => `org-wide ${role} @ ${where}`),
    );
    expect(
      widened,
      "an org-wide assignment was read as the owner's — `permissions.ts` calls `branch_id: null` " +
        "\"how an owner holds Appendix A's 'everything'\", but it is the LOCATION axis " +
        "(`01-F26`: User × Role × per-location) and `14-F39`'s cells are indexed by ROLE",
    ).toEqual([]);
  });

  it("01-F27 — a subject with no assignment is refused: a device token confers no role", () => {
    // `01-F27`: "device tokens carry device identity only — user identity comes from the PIN
    // session". A till sitting locked at a counter is exactly this subject, and `14-F14`'s surface
    // must not be reachable from one.
    requireDeclared();
    const decision = can(subject([]), ACTION, at(BRANCH_A));
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe(USER_MANAGE);
    expect(decision.satisfied_by).toBe(undefined);
  });

  it("14-F39 / 01-F26 — several hats: the widest assignment decides, in EITHER order", () => {
    // Appendix A's opening sentence — "in small restaurants one person wears several hats" — and
    // `01-F26`'s per-user set of (role, location) pairs. Two claims in one test, both of which a
    // plausible-but-wrong resolver gets backwards:
    //   * a manager who ALSO holds an org-wide owner assignment is allowed (she holds the role);
    //   * an owner who ALSO holds a cashier assignment is NOT narrowed to that row's deny.
    // It is also this file's ORDER-INDEPENDENCE control: reordering a subject's assignments must
    // change no answer, so a suite that reddened on that reorder would be pinning incidental
    // structure.
    requireDeclared();
    const managerThenOwner = subject([
      { role: "branch_manager", branch_id: BRANCH_A },
      { role: "owner", branch_id: null },
    ]);
    const ownerThenManager = subject([
      { role: "owner", branch_id: null },
      { role: "branch_manager", branch_id: BRANCH_A },
    ]);
    const ownerAlsoCashier = subject([
      { role: "owner", branch_id: null },
      { role: "cashier", branch_id: BRANCH_A },
    ]);
    expect(can(managerThenOwner, ACTION, at(BRANCH_A)).outcome).toBe("allow");
    expect(can(ownerThenManager, ACTION, at(BRANCH_A)).outcome).toBe("allow");
    expect(can(ownerAlsoCashier, ACTION, at(BRANCH_A)).outcome).toBe("allow");
  });
});

// ── §3 — the CONTROLS. Without these, every §2 assertion also passes against a matrix that
//         refuses everyone, or one that allows every owner request. GREEN BY DESIGN. ────────────

describe("14-F39 §3 — controls: the verdicts are about THIS action and THESE roles", () => {
  it("GREEN BY DESIGN — the refused subjects ARE allowed the rows Appendix A grants them", () => {
    // Without this, `user.manage` denying a cashier is indistinguishable from a matrix that denies
    // a cashier everything, and three of §2's four refusals would be uninformative.
    expect(can(CASHIER, "order.create", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(MANAGER, "day.open_close", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(STOREKEEPER, "stock.receive", at(BRANCH_A)).outcome).toBe("allow");
  });

  it("GREEN BY DESIGN — the allowed owner is no wildcard (Appendix A's hard rule)", () => {
    // An implementation answering `allow` to any owner request would satisfy every §2 allow and be
    // wrong. Appendix A's hard rule is explicit that it binds the owner too.
    expect(can(OWNER, "history.edit_delete", at(BRANCH_A)).outcome).toBe("deny");
  });

  it("GREEN BY DESIGN — the neighbouring FR-decided rows are unmoved", () => {
    // `user.manage`'s four cells are identical to `device.manage`'s and to
    // `catalog.edit_recipes`', which makes a copy-paste that overwrote a neighbour the most
    // likely way this lands wrong. Nothing else in this file would show it.
    expect(can(OWNER, "device.manage", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(MANAGER, "device.manage", at(BRANCH_A)).outcome).toBe("deny");
    expect(can(OWNER, "catalog.edit_recipes", at(BRANCH_A)).outcome).toBe("allow");
    expect(can(MANAGER, "catalog.edit_recipes", at(BRANCH_A)).outcome).toBe("deny");
    // …and the escalating row directly around them still escalates, so "everything became deny"
    // is not a way to pass this file.
    expect(can(CASHIER, "order.void_after_kot", at(BRANCH_A)).outcome).toBe("escalate");
  });
});

// ── §4 — fail closed on the identity axes (01-F26, 01-F27, 01-F71) ────────────────────────────

describe("14-F39 §4 — the identity axes: an owner of ANOTHER org is a stranger", () => {
  it("01-F71 / 01-F26 — a foreign owner is refused this org's roster", () => {
    // `14-F39`: "`01-F71` still binds underneath it: the org comes from the authenticated subject
    // and never from the request, so an owner of one org cannot reach another's roster through a
    // procedure this action allows." `01-F26` holds assignments within one org; nothing carries
    // across.
    requireDeclared();
    const foreign = subject([{ role: "owner", branch_id: null }], OTHER_ORG);
    const decision = can(foreign, ACTION, at(BRANCH_A));
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe(USER_MANAGE);
  });

  it("01-F26 — a BRANCH-scoped owner: her own branch yes, another branch no, org-wide no", () => {
    // **`14-F39` decides the ROLE cell (`owner: allow`); `01-F26` decides the LOCATION
    // resolution**, and this test is the composition of the two rather than a fifth cell. No FR
    // carves an org-wide-only exception out of `owner` for user administration, so inventing one
    // would be commandment 2 — and the fail-closed direction is already the narrow one: a branch
    // assignment does not match a `null` scope, so such an owner cannot reach an org-wide request.
    //
    // ⚠ **Doc 14 §9 q6's founder ruling is about DEVICES and is deliberately not extended here.**
    // It ruled that a branch-scoped owner may revoke a device at her own branch, on the ground
    // that `01-F48` gives revocation a 30 s eviction budget "worthless if nobody present is
    // allowed to press it". User administration has no such clock and the failure directions
    // differ — a branch-scoped owner who may write users may write herself an org-wide one, and
    // `01-F1` makes it permanent. What is NOT asserted, and is a founder question rather than an
    // implementer's: whether the `14-F14` procedures should state a `branch_id` at all, which is
    // where that risk is actually decided (§9 q6 records that for devices the effective permission
    // was org-wide-owner-only precisely because no procedure stated one).
    requireDeclared();
    const branchOwner = subject([{ role: "owner", branch_id: BRANCH_A }]);
    expect(can(branchOwner, ACTION, at(BRANCH_A)).outcome).toBe("allow");
    expect(can(branchOwner, ACTION, at(BRANCH_B)).outcome).toBe("deny");
    expect(can(branchOwner, ACTION, at(null)).outcome).toBe("deny");
  });
});

// ── §5 — the action is FR-DECIDED: Appendix A is not extended (14-F39, 14-F30, 01-F26) ────────

describe("14-F39 §5 — Appendix A carries no user row, and is not extended to add one", () => {
  /**
   * Read from the FILE, not transcribed. `permission-matrix.test.ts` owns the transcription and
   * is read-only to this work; re-copying the table here would be round-2 §C failure 2 (an oracle
   * asserting a hand-copy) and a second authority for one table.
   */
  // A read that THROWS at describe scope takes the whole file down as "0 tests" rather than as a
  // named failure, and this repo's own record is that a `no tests` line gets misread in a big
  // turbo run. So the failure is carried as a value and reported by the empty-match test below,
  // which is where a reader is already looking for it.
  const { labels: ROW_LABELS, error: READ_ERROR } = ((): {
    labels: readonly string[];
    error?: string;
  } => {
    let text: string;
    try {
      text = readFileSync(join(REPO_ROOT, "restaurant-os.md"), "utf8");
    } catch (cause) {
      return { labels: [], error: `restaurant-os.md is unreadable at ${REPO_ROOT}: ${cause}` };
    }
    const start = text.indexOf("## Appendix A");
    const rest = start === -1 ? "" : text.slice(start + 1);
    const end = rest.indexOf("\n## ");
    const section = end === -1 ? rest : rest.slice(0, end);
    return {
      labels: section
        .split("\n")
        .filter((line) => line.trimStart().startsWith("|"))
        .map((line) => line.split("|")[1]?.trim() ?? "")
        .filter((label) => label !== "" && !/^-+$/.test(label) && label !== "Action"),
    };
  })();

  it("24-F14 — reads the appendix it is checking against (empty-match protection)", () => {
    // The attack on this file's own tripwire. A renamed file, a moved heading or a regex that
    // extracts nothing would make the claim below pass vacuously — "no row names a user" is
    // trivially true of zero rows — which is the exact shape this repo has already shipped once.
    expect(READ_ERROR, "the appendix could not be read at all").toBe(undefined);
    expect(
      ROW_LABELS.length,
      "Appendix A's table parsed to (almost) nothing — moved heading, or wrong file?",
    ).toBeGreaterThanOrEqual(15);
    expect(ROW_LABELS).toContain("Create order / print KOT");
    expect(ROW_LABELS).toContain("Edit/delete historical records");
  });

  it("14-F39 — no Appendix A row names a user, a person or a role", () => {
    // `14-F39`'s own measurement, and the reason the action is decided by the FR: "not one names
    // a user, a person or a role". `14-F30` counted the same precedent rather than asserting it
    // and drew the conclusion this pins: `01-F26` names the appendix a **seed** and doc 14 §7
    // lists the matrix's hard rules among the things deliberately not configurable, "so the
    // appendix is a fixed origin, not a register that grows".
    //
    // WRONG IMPLEMENTATION THIS CATCHES: adding `| Manage users | — | — | — | ✔ |` to
    // `restaurant-os.md` on the way past, which `14-F39` forbids in terms ("Appendix A is **not**
    // extended") and which would put the cells in a document no code reads.
    const named = ROW_LABELS.filter((label) =>
      /\b(users?|persons?|people|staff|roles?)\b/i.test(label),
    );
    expect(
      named,
      "Appendix A was extended with a user row — `14-F39` declares the action in the FR that " +
        "owns the surface (`02-F46` and `02-F47` landed the same way)",
    ).toEqual([]);
  });
});
