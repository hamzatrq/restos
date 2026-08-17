// Acceptance tests — `11-F22`'s participation status, read by the AUTHORIZATION SUBJECT.
//
// **Authored from SPEC TEXT ONLY**, by a session that wrote no implementation for this FR, no part
// of `permissions.ts`, and did not read the build plan's file-by-file sequence (`24 §3` step 2).
// Every assertion below is traceable to a quoted clause, not to what the matrix happens to do.
//
// Sources, and nothing else:
//   `specs/11-staff-people.md`    — **`11-F22` — THE DECIDING FR**: the field, the closed two-value
//                                   vocabulary, "Only `active` PARTICIPATES … and the authorization
//                                   subject reads the status too, so an inactive person authorizes
//                                   nothing even from a session that predates her deactivation",
//                                   the named fail-OPEN the wide reading exists to prevent, "not a
//                                   licence to default an absent status to `active`", and the
//                                   TWO FIELDS rule (*may she act* ≠ *does she render*); `11-F20`
//                                   (a person record is never deleted); `11-F21` (the hash rides
//                                   only an `active` entry).
//   `specs/01-kernel-sync.md`     — **`01-F48`** — "if revocation state cannot be read,
//                                   participation is refused, not granted", which `11-F22` cites
//                                   BY NAME as what *participation* means here; `01-F1`
//                                   (append-only: a wrong `allow` is permanent); `01-F26` (User ×
//                                   Role × per-location assignment); `01-F27` (server-side
//                                   authorization on every operation; a device token carries
//                                   device identity only); `01 §4`'s **`staff` row**, which names
//                                   the field: "`status` (`11-F22`)".
//   `specs/02-pos-app.md`         — `02-F20` (the escalation whose local path is a manager PIN
//                                   collected on the till while the ACTOR is unchanged), `02-F41`
//                                   (attribution is the actor's, permanently), `02-F23` (a
//                                   cashier's reconciliation reach).
//   `specs/05-manager-console.md` — `05-F19` (`cash.paid_out` above the org threshold), which is
//                                   why `canPayOut` is a second reader of this matrix.
//   `specs/14-backoffice.md`      — `14-F14`, whose *deactivation* is the act that sets the field.
//   `restaurant-os.md` Appendix A — **read only through the production matrix, never copied.**
//                                   `permission-matrix.test.ts` owns the transcription and is
//                                   READ-ONLY to this work; a hand-copy here would be a second
//                                   authority for one table (round-2 §C failure 2). Every control
//                                   below is therefore derived by ASKING `can()` with an ACTIVE
//                                   twin, and asserts a shape ("not refused", "some reach"), never
//                                   a cell.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// **THE ONE SHAPE DECISION THIS FILE MAKES, declared so it can be contested rather than
// discovered.** `AuthSubject` is `{ user_id, org_id, assignments }` and has no status field at
// all, so a suite cannot assert `11-F22`'s clause without naming one. It writes **`status`**,
// because `01 §4`'s `staff` row names that field in those words — "`status` (`11-F22`)" — and
// `11-F22` is what that row cites. If an implementer chooses a different member name on
// `AuthSubject`, this suite reds: that is a CONFLICT TO REPORT (`24 §3`), not an assertion to
// edit. Nothing else about the type is asserted — not requiredness, not the union — because a
// type-level assertion would fail `pnpm typecheck` for every other agent in this tree today, and
// `device-permission.test.ts` / `user-permission.test.ts` established the run-time-red,
// compile-time-green idiom this file follows.
//
// **RED-AWAITING-IMPLEMENTATION, and the vacuity trap is named because it is the whole design.**
// The equivalent of `user-permission.test.ts`'s `requireDeclared()` here is not a declaration
// check — it is that **a refusal must be attributable to the STATUS and to nothing else**. An
// inactive subject with no assignments is refused for the wrong reason; so is one asked about an
// action her row denies anyway; so is one at a branch she is not assigned to. So every refusal
// below is paired, IN THE SAME TEST, with an **ACTIVE TWIN**: the same `user_id`, the same
// `org_id`, the same `assignments`, differing in exactly one field. The twin's non-refused set is
// asserted NON-EMPTY first (`24-F14` empty-match protection, and it names the actions in its
// failure), so a green test can never mean "she was allowed nothing either way".
//
// **Measured on the tree as authored (2026-08-17): 37 of 45 RED, 8 GREEN**, package total
// 610 = 565 pre-existing + 45. The eight greens are §9's controls, labelled GREEN BY DESIGN on the
// test itself — credited as controls, not as coverage of `11-F22`. All 565 pre-existing tests
// stayed green, so every red is attributable to this file alone, and **no `24-F14` empty-match
// control failed**: every red is a leak, not a fixture that matched nothing.
//
// **Checked against a plausible CORRECT implementation, out-of-tree** (`24 §3`: a suite that stays
// RED under a correct implementation blocks the implementer indefinitely and is as damaging as a
// vacuous one). The package was copied to a scratchpad with `node_modules` symlinked and
// `restaurant-os.md` staged at the right depth; `status?: "active" | "inactive"` was added to
// `AuthSubject`, and one guard — `if (subject.status !== "active") return { outcome: "deny",
// action }` — at the top of `can`, `canPayOut` and `reportScope`. **45 of 45 green.**
// `packages/domain/src/permissions.ts` was never opened for writing in this tree and was verified
// byte-identical afterwards (`f264549d…`).
//
// ⚠ **AND THE SAME RUN MEASURED A CONSEQUENCE THAT IS `11-F22`'s AND NOT THIS FILE'S, recorded
// here so it is not discovered as a mystery red.** That implementation also turned **70**
// pre-existing tests red in four sibling suites — `permission-matrix` 53, `user-permission` 9,
// `device-permission` 5, `tenant-isolation-matrix` 3 — because every one of them builds an
// `AuthSubject` with **no status** and expects `allow`. That is §7's case arriving from the other
// side: once absent no longer means `active` (which `11-F22` forbids by name), every statusless
// caller in the tree is refused, and a test fixture is a caller. Each of the four has exactly ONE
// construction site, so the repair is one line per file — `status: "active"` in the builder, which
// restates the same subject under a widened type and weakens no assertion. It is still an edit to
// four other sessions' oracles (`24 §3`), so it is REPORTED rather than made here. ⚠ Note
// `permission-matrix.test.ts` declares its own local structural `AuthSubject` and reaches `can`
// through an `unknown` cast, so **making the member required would not give that file a typecheck
// error** — it would give 53 silent reds.
//
// ── The author's own mutation pre-check (round-3 law). An INDEPENDENT prover round is still ────
//    owed — these numbers are a floor and an attribution map, not a substitute for one. ─────────
//
// Every row ran in the same out-of-tree copy and NEVER in this tree (AGENTS.md: a permission cell
// is a security parameter, and an agent killed between "weaken" and "revert" strands a widened
// credential with every test green). Each differs in exactly one branch from the correct
// implementation above; 45 tests in this file.
//
//   M1  status is on the type but `can()` never reads it — THE FAIL-OPEN `11-F22` PREDICTS … 31
//   M2  no reader in the matrix reads it — **the tree as this file is written** ……………………… 37
//   M3  an inactive OWNER is allowed, because `owner` is special-cased ahead of the status … 22
//   M4  an ABSENT status is treated as `active` ……………………………………………………………………………………………………  2
//       Only §7's pair is pointed at that case, and that is the honest number: two tests, and
//       they are the ones the whole change is worth. Do not read a small kill count as a weak
//       assertion — read it as attribution.
//   M5  a BLACKLIST — only the literal `inactive` refuses ………………………………………………………………………… 17
//       15 of §8's 16 (the `inactive` row passes, correctly) + §7's 2.
//   M6  only `can()` reads it; `canPayOut` and `reportScope` do not (pinned interpretation 2)  26
//   M7  `escalate` cells survive deactivation (pinned interpretation 1) ………………………………………… 22
//   C1  CONTROL — an action moves position in `PERMISSION_ACTIONS` ……………………………………………………  0
//   C2  CONTROL — `rolesAt` reads a subject's assignments in reverse ………………………………………………  0
//   C3  CONTROL — an unrelated local is renamed (`verdicts` → `row`) …………………………………………………  0
//
// **M2 is why the red state is quotable as evidence rather than as a to-do**: the tree today IS a
// mutant of the correct implementation, and this file fails on it in exactly the 37 places the
// leak reaches. **The three controls are what make every other row mean anything** — a suite that
// reddened on a reorder would kill them too, and then its kill counts would be measuring its own
// brittleness.
//
// ── THREE PINNED INTERPRETATIONS. Each is a READING, stated so it can be contested. ────────────
//
// **(1) An inactive subject gets `deny`, never `escalate`.** `11-F22` does not use the word
// `escalate`; it says *"authorizes nothing"* and `01-F48` says *"participation is refused"*. The
// derivation is the FR's own harm sentence: it names *"recording payments, pay-outs and
// **refunds**"* as what the narrow reading would leave live, and `refund.issue` is an `escalate`
// cell for a cashier. `02-F20`'s local escalation collects a MANAGER's PIN while the actor stays
// the requester (that is the whole point of the second PIN session — `02-F41`), so an `escalate`
// that any manager can close is precisely a deactivated cashier recording a refund into an
// append-only ledger under her own name. `escalate` is Appendix A's *"needs Mgr PIN"* — an offer,
// not a refusal — and an offer no longer exists for someone who may not act. The alternative
// reading (escalate cells survive deactivation, because escalate is not an `allow`) is refused on
// that sentence. Fail-closed also agrees, and `01-F1` makes the other direction permanent.
//
// **(2) `canPayOut` and `reportScope` read it too.** `11-F22` says *"the authorization subject
// reads the status"* — a claim about the SUBJECT, so it binds wherever that subject decides
// authority, and this module has three such readers rather than one. `canPayOut` is not optional
// coverage: `can(subject, "cash.paid_out", scope)` refuses BY DESIGN (`permissions.ts` documents
// it, so `05-F19`'s threshold cannot be skipped), which makes `cash.paid_out` the one action in
// the sweep that proves nothing — and *pay-outs* is one of the three harms `11-F22` names. A
// status check on `can()` alone would leave the FR's own example live. `reportScope` is exported
// and production-called for `02-F23`'s narrowing, so an inactive manager would keep reading her
// branch's shift cash. The alternative reading (status gates acting, and a read is not acting) is
// refused on `01-F48`'s fail-closed direction and on the plain words *"reads the status"*.
//
// **(3) Only the exact string `active` participates.** `11-F22`: *"The statuses are `active` and
// `inactive`, and the set is closed at two … Widening the set is a spec act."* So the check is a
// whitelist of one value and never a blacklist of `inactive`: `status !== "inactive"` admits
// `suspended`, `on_leave`, `1`, `true` and `undefined`, which is `01-F48`'s unreadable state
// admitted. Case and whitespace variants are third tokens, not the first one.
//
// ── What this file deliberately does NOT decide (silence here is not permission) ───────────────
//   * **The PIN check.** `11-F22`'s first half — *"An inactive person does not unlock, on any
//     device"* — is `packages/sync-client`'s `unlock()` and its `not_active` refusal reason, which
//     that FR declares. Nothing here asserts it; this file owns only the second half, the clause
//     that `11-F22` says the narrow reading would leave a fail-open behind.
//   * **The wire and the stored row.** `01-F75`'s roster artifact, `staff.ts`'s removals list and
//     what a device does with its own older rows are named in `11-F22` as owed on a protected
//     path elsewhere. This is `packages/domain`.
//   * **The identification grid.** `11-F22` gives status exactly one rendering surface (`01-F61`'s
//     grid offers `active` members only). That is a doc 02 / doc 27 surface, and `11-F22`'s TWO
//     FIELDS rule is precisely that rendering and participation are different questions.
//   * **R27's live session.** `11 §9`'s ruling that a deactivation ends the signed-in session is
//     about a session, not about `can()`; the matrix half is what makes it safe and is all that is
//     asserted here.
//   * **Un-deactivation, and any third status.** Widening is a spec act (`11-F22`); §8 is a
//     tripwire so it cannot happen silently, not a vote on the outcome.

import { describe, expect, it } from "vitest";
import {
  type AuthOutcome,
  type AuthScope,
  type AuthSubject,
  can,
  canPayOut,
  newId,
  PERMISSION_ACTIONS,
  type ReportReach,
  ROLES,
  type Role,
  reportScope,
} from "../index.js";

const ORG = newId();
const BRANCH_A = newId();
const BRANCH_B = newId();

/**
 * ONE person, in two states. The twin control is worthless if the two subjects are two people:
 * `report.sales_view` resolves against `scope.subject_user_id` (`02-F23`) and `approval.grant`
 * against `scope.requested_by_user_id` (`02-F38`), so a differing `user_id` would move the answer
 * for reasons that have nothing to do with `11-F22`.
 */
const USER = newId();
const SOMEONE_ELSE = newId();

/** `11-F22`: "The statuses are `active` and `inactive`, and the set is closed at two." */
const ACTIVE = "active";
const INACTIVE = "inactive";

type Assignment = { readonly role: Role; readonly branch_id: string | null };

/**
 * The field is `status` — `01 §4`'s `staff` row names it, citing this FR. The cast is what lets
 * the file compile before `AuthSubject` carries the member and after it carries it as a required
 * union: in both directions one of the two types is assignable to the other, so the assertion is
 * legal, and no `any` is introduced.
 */
const withStatus = (
  assignments: readonly Assignment[],
  status: unknown,
  org_id: string = ORG,
): AuthSubject => ({ user_id: USER, org_id, assignments, status }) as AuthSubject;

/** A subject whose status is not present AT ALL — the migration shape (`11-F22`, `01-F48`). */
const withoutStatus = (assignments: readonly Assignment[]): AuthSubject =>
  ({ user_id: USER, org_id: ORG, assignments }) as AuthSubject;

/**
 * The scope every sweep uses. Both optional members are populated ON PURPOSE: without
 * `subject_user_id` a cashier's `report.sales_view` refuses for `02-F23`'s reason, and with
 * `requested_by_user_id` unset — or set to herself — `approval.grant` refuses for `02-F38`'s. Two
 * of the actions in the sweep would then be uninformative refusals.
 */
const at = (branch_id: string | null): AuthScope => ({
  org_id: ORG,
  branch_id,
  subject_user_id: USER,
  requested_by_user_id: SOMEONE_ELSE,
});

/**
 * Every action this subject is NOT refused, rendered as `action → outcome` so a failure names the
 * leak instead of a count. Used in both directions: as the twin CONTROL (must be non-empty) and as
 * the claim (must be empty for an inactive subject).
 */
const notRefused = (subject: AuthSubject, scope: AuthScope): readonly string[] =>
  PERMISSION_ACTIONS.flatMap((action) => {
    const decision = can(subject, action, scope);
    return decision.outcome === "deny" ? [] : [`${action} → ${decision.outcome}`];
  });

/**
 * The two properties a refusal must also carry: it names the action it decided (a refusal a
 * caller cannot attribute is indistinguishable from a refusal of something else it also asked
 * about), and it carries NO `satisfied_by` — which is present on `escalate` and only on
 * `escalate`, so a leaked manager-PIN affordance shows up here even if the outcome string does
 * not (pinned interpretation 1).
 */
const misattributed = (subject: AuthSubject, scope: AuthScope): readonly string[] =>
  PERMISSION_ACTIONS.flatMap((action) => {
    const decision = can(subject, action, scope);
    const faults: string[] = [];
    if (decision.action !== action)
      faults.push(`${action} → decision names \`${decision.action}\``);
    if (decision.satisfied_by !== undefined) {
      faults.push(`${action} → satisfied_by ${JSON.stringify(decision.satisfied_by)}`);
    }
    return faults;
  });

/** `05-F19`'s two figures. One below the org threshold, one above it. */
const UNDER = { amount_paisa: 100_00, threshold_paisa: 500_00 };
const OVER = { amount_paisa: 900_00, threshold_paisa: 500_00 };

/**
 * The two assignment shapes, each asked at the scopes where its roles actually resolve
 * (`01-F26`: an org-wide assignment carries into every branch, a branch assignment into that
 * branch only). Asking a branch-scoped subject about branch B would make the twin control empty
 * and the refusal uninformative — a stranger at branch B is refused everything anyway.
 */
const SHAPES = [
  {
    label: "branch-scoped",
    assignments: (role: Role): readonly Assignment[] => [{ role, branch_id: BRANCH_A }],
    scopes: [["her own branch", at(BRANCH_A)]],
  },
  {
    label: "org-wide (`branch_id: null`)",
    assignments: (role: Role): readonly Assignment[] => [{ role, branch_id: null }],
    scopes: [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
      ["the org-scoped request (no branch stated)", at(null)],
    ],
  },
] as const satisfies readonly {
  label: string;
  assignments: (role: Role) => readonly Assignment[];
  scopes: readonly (readonly [string, AuthScope])[];
}[];

// ── §1 — the FR's own harm sentence, asserted in its own words ────────────────────────────────

describe("11-F22 §1 — a deactivated cashier records no payment, no pay-out and no refund", () => {
  it("11-F22 / 01-F1 — the three acts the FR names are refused once she is inactive", () => {
    // `11-F22`, verbatim: a status that gated only the PIN check "would hand every retained row
    // its full assignments back and let a deactivated cashier keep recording payments, pay-outs
    // and refunds — permanently, into an append-only ledger (`01-F1`, `02-F41`)". This test is
    // that sentence, one act at a time, with the ACTIVE twin carried beside each so a refusal is
    // attributable to the status rather than to her row.
    const assignments: readonly Assignment[] = [{ role: "cashier", branch_id: BRANCH_A }];
    const active = withStatus(assignments, ACTIVE);
    const inactive = withStatus(assignments, INACTIVE);
    const scope = at(BRANCH_A);

    // CONTROLS — asserted as "not a refusal" rather than as a cell, because
    // `permission-matrix.test.ts` owns Appendix A's transcription and a second copy of it here is
    // a second authority for one table.
    expect(
      can(active, "payment.settle", scope).outcome,
      "an ACTIVE cashier is refused `payment.settle`, so the refusal below is about her row",
    ).not.toBe("deny");
    expect(
      can(active, "refund.issue", scope).outcome,
      "an ACTIVE cashier is refused `refund.issue`, so the refusal below is about her row",
    ).not.toBe("deny");
    // `cash.paid_out` is the one action `can()` refuses BY DESIGN so `05-F19`'s threshold cannot
    // be skipped, which is exactly why the pay-out leg has to be asked through `canPayOut`.
    expect(
      canPayOut(active, scope, UNDER).outcome,
      "an ACTIVE cashier is refused a below-threshold pay-out, so §5's refusals are about her row",
    ).not.toBe("deny");

    expect(can(inactive, "payment.settle", scope).outcome, "she is still settling").toBe("deny");
    expect(can(inactive, "refund.issue", scope).outcome, "she is still refunding").toBe("deny");
    expect(
      canPayOut(inactive, scope, UNDER).outcome,
      "she is still taking cash out of the drawer (`05-F19`, and `11-F22` names pay-outs)",
    ).toBe("deny");
  });
});

// ── §2 — THE SWEEP. `11-F22`: an inactive person "authorizes nothing". ────────────────────────

describe("11-F22 §2 — an inactive subject is refused EVERY action the matrix carries", () => {
  for (const shape of SHAPES) {
    for (const role of ROLES) {
      it(`11-F22 — an inactive ${role} (${shape.label}) authorizes nothing`, () => {
        const assignments = shape.assignments(role);
        const active = withStatus(assignments, ACTIVE);
        const inactive = withStatus(assignments, INACTIVE);

        for (const [where, scope] of shape.scopes) {
          // The twin control, carried INSIDE the test it protects rather than a section away,
          // because the two must not drift. Derived by asking the production matrix — never a
          // hand-copy — and it names the actions, so a failure says which reach was lost.
          const wouldOtherwise = notRefused(active, scope);
          expect(
            wouldOtherwise.length,
            `24-F14 empty match — an ACTIVE ${role} (${shape.label}) is allowed NOTHING at ` +
              `${where}, so the refusal below would be measuring only itself`,
          ).toBeGreaterThan(0);

          // The sweep is over the PRODUCTION list, never a copy of it, so an action added to the
          // matrix is swept the day it lands and cannot be widened into by silence. It is also
          // order-independent: the assertion is on a set that must be empty.
          expect(
            notRefused(inactive, scope),
            `11-F22 — an inactive ${role} still authorizes these at ${where}. The FR is written ` +
              "the wide way BECAUSE the narrow one is a live fail-open: the row is RETAINED, so " +
              "her assignments are all still there and only the status can refuse them",
          ).toEqual([]);

          expect(
            misattributed(inactive, scope),
            `11-F22 / 02-F20 — a refusal at ${where} is unattributable, or carries a ` +
              "manager-PIN affordance no credential may close (pinned interpretation 1)",
          ).toEqual([]);
        }
      });
    }
  }

  it("11-F22 / 01-F27 — the refusal survives an EMPTY scope and a FULL one (commandment 8)", () => {
    // Commandment 8 puts the check at the matrix — "server-side authorization always via the
    // `domain` permission matrix; client role claims are never trusted" — and `11-F22` says so in
    // its own words: "commandment 8 puts the check at the matrix". So the refusal may not depend
    // on anything a CALL SITE chose to pass. Asked with a scope carrying only the two required
    // members, and with one carrying every optional member populated; and note this file imports
    // nothing but `@restos/domain`, so no host is in the picture at all.
    const assignments: readonly Assignment[] = [{ role: "branch_manager", branch_id: BRANCH_A }];
    const active = withStatus(assignments, ACTIVE);
    const inactive = withStatus(assignments, INACTIVE);
    const minimal: AuthScope = { org_id: ORG, branch_id: BRANCH_A };
    const full: AuthScope = {
      org_id: ORG,
      branch_id: BRANCH_A,
      subject_user_id: USER,
      requested_by_user_id: SOMEONE_ELSE,
    };
    for (const [label, scope] of [
      ["a scope carrying only `org_id` and `branch_id`", minimal],
      ["a scope carrying every optional member", full],
    ] as const) {
      expect(notRefused(active, scope).length, `24-F14 empty match — ${label}`).toBeGreaterThan(0);
      expect(notRefused(inactive, scope), `11-F22 — leaked through ${label}`).toEqual([]);
    }
  });
});

// ── §3 — the mutant with a name: an inactive OWNER ────────────────────────────────────────────

describe("11-F22 §3 — an inactive owner is still inactive", () => {
  it("11-F22 — no role is special-cased ahead of the status, and `owner` is the tempting one", () => {
    // Appendix A gives the owner "everything", so an implementation that answers the owner column
    // before consulting the status passes every other role's sweep. `11-F22` states no exception
    // for any role: "Only `active` PARTICIPATES". `14-F14`'s deactivation is performed BY an
    // owner, which is exactly why "the owner is fine" is the shortcut that feels safe.
    const assignments: readonly Assignment[] = [{ role: "owner", branch_id: null }];
    const active = withStatus(assignments, ACTIVE);
    const inactive = withStatus(assignments, INACTIVE);

    for (const [where, scope] of [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
      ["the org-scoped request (no branch stated)", at(null)],
    ] as const) {
      expect(
        notRefused(active, scope).length,
        `24-F14 empty match — an ACTIVE org-wide owner is allowed nothing at ${where}`,
      ).toBeGreaterThan(0);
      expect(
        notRefused(inactive, scope),
        `11-F22 — an inactive OWNER still authorizes these at ${where}`,
      ).toEqual([]);
      expect(misattributed(inactive, scope)).toEqual([]);
    }

    // The other two readers, because an owner is the subject most likely to be special-cased in
    // all three (pinned interpretation 2).
    expect(canPayOut(active, at(BRANCH_A), UNDER).outcome, "24-F14 empty match").not.toBe("deny");
    expect(canPayOut(inactive, at(BRANCH_A), UNDER).outcome).toBe("deny");
    expect(canPayOut(inactive, at(BRANCH_A), OVER).outcome).toBe("deny");
    expect(reportScope(active, at(BRANCH_A)), "24-F14 empty match").not.toBe("none");
    expect(reportScope(inactive, at(BRANCH_A))).toBe("none");
  });

  it("11-F22 — a BRANCH-scoped inactive owner is refused at her own branch too", () => {
    // The same claim on the other assignment shape, so an implementation that reads status only on
    // the org-wide path — the shape `permissions.ts` calls "how an owner holds Appendix A's
    // 'everything'" — does not survive.
    const assignments: readonly Assignment[] = [{ role: "owner", branch_id: BRANCH_A }];
    const active = withStatus(assignments, ACTIVE);
    const inactive = withStatus(assignments, INACTIVE);
    expect(notRefused(active, at(BRANCH_A)).length, "24-F14 empty match").toBeGreaterThan(0);
    expect(notRefused(inactive, at(BRANCH_A))).toEqual([]);
  });
});

// ── §4 — `escalate` is not a survival path. PINNED INTERPRETATION 1 — read the header. ────────

describe("11-F22 §4 — an inactive subject gets `deny`, never a manager-PIN offer", () => {
  it("11-F22 / 02-F20 / 02-F41 — every cell that would ESCALATE for her refuses instead", () => {
    // `02-F20`'s local path collects a MANAGER's PIN and leaves the actor unchanged (that is what
    // the till's second `createPinSession` exists for, and `02-F41` is why). So an `escalate` an
    // inactive cashier can present to any manager in the building is the FR's named harm exactly:
    // "let a deactivated cashier keep recording … refunds — permanently, into an append-only
    // ledger". `refund.issue` is in the set derived below, which is what makes this the FR's
    // sentence rather than a preference.
    const assignments: readonly Assignment[] = [{ role: "cashier", branch_id: BRANCH_A }];
    const active = withStatus(assignments, ACTIVE);
    const inactive = withStatus(assignments, INACTIVE);
    const scope = at(BRANCH_A);

    // Derived from the matrix, never listed by hand: whichever cells escalate for an ACTIVE
    // cashier are the cells this test is about, and a matrix that stopped escalating anything
    // would fail the empty-match assertion rather than pass this one vacuously.
    const escalating = PERMISSION_ACTIONS.filter(
      (action) => can(active, action, scope).outcome === "escalate",
    );
    expect(
      escalating.length,
      "24-F14 empty match — no cell escalates for an ACTIVE cashier, so this test is about " +
        "nothing. Appendix A's third cell kind is `needs Mgr PIN` and `02-F20` requires it to " +
        "resolve, so an empty set is a defect in the matrix, not a reason to pass",
    ).toBeGreaterThan(0);

    for (const action of escalating) {
      const decision = can(inactive, action, scope);
      expect(
        decision.outcome,
        `11-F22 — \`${action}\` still escalates for an INACTIVE cashier. \`escalate\` is an ` +
          "OFFER (Appendix A's `needs Mgr PIN`), and an offer no credential should be able to " +
          "close exists for someone who " +
          "may not act: the manager closes it, the LEDGER records HER (`02-F41`)",
      ).toBe("deny");
      expect(
        decision.satisfied_by,
        `11-F22 / 02-F20 — \`${action}\` names roles that could satisfy an inactive person`,
      ).toBe(undefined);
    }
  });

  it("11-F22 / 05-F19 — an above-threshold pay-out refuses rather than escalating", () => {
    // The same claim on the route `can()` does not answer. `05-F19` sends the excess to an
    // approval, so this is the same offer in the same shape: an approver closes it and the
    // withdrawal is attributed to the deactivated person.
    const assignments: readonly Assignment[] = [{ role: "branch_manager", branch_id: BRANCH_A }];
    const active = withStatus(assignments, ACTIVE);
    const inactive = withStatus(assignments, INACTIVE);
    expect(
      canPayOut(active, at(BRANCH_A), OVER).outcome,
      "24-F14 empty match — an ACTIVE manager is already refused an above-threshold pay-out, so " +
        "the refusal below is not about `11-F22`",
    ).not.toBe("deny");
    const decision = canPayOut(inactive, at(BRANCH_A), OVER);
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("cash.paid_out");
    expect(decision.satisfied_by).toBe(undefined);
  });
});

// ── §5 — `canPayOut`, the reader `can()` deliberately refuses. PINNED INTERPRETATION 2. ───────

describe("11-F22 §5 — canPayOut reads the status too (05-F19, and the FR names pay-outs)", () => {
  for (const role of ROLES) {
    it(`11-F22 / 05-F19 — an inactive ${role} takes nothing out of the drawer`, () => {
      const assignments: readonly Assignment[] = [{ role, branch_id: BRANCH_A }];
      const active = withStatus(assignments, ACTIVE);
      const inactive = withStatus(assignments, INACTIVE);
      const scope = at(BRANCH_A);

      // The control is per-role and derived: whichever of the two amounts is not a refusal for an
      // ACTIVE holder of this role is the one that proves the status did the refusing. A role
      // Appendix A refuses the drawer outright has neither, and this test says so by name rather
      // than passing quietly.
      const AMOUNTS: readonly (readonly [string, typeof UNDER])[] = [
        ["below the threshold", UNDER],
        ["above the threshold", OVER],
      ];
      const live = AMOUNTS.filter(
        ([, request]) => canPayOut(active, scope, request).outcome !== "deny",
      );
      expect(
        live.length,
        `24-F14 empty match — an ACTIVE ${role} is refused a pay-out at BOTH amounts, so the ` +
          "refusals below are her row's and not `11-F22`'s",
      ).toBeGreaterThan(0);

      for (const [where, request] of live) {
        const decision = canPayOut(inactive, scope, request);
        expect(
          decision.outcome,
          `11-F22 — an inactive ${role} still gets \`${decision.outcome}\` ${where}. ` +
            '`can(subject, "cash.paid_out", scope)` refuses by design so `05-F19`\'s threshold ' +
            "cannot be skipped, which means a status check on `can()` alone leaves the FR's own " +
            "named harm — pay-outs — completely live",
        ).toBe("deny");
        expect(decision.satisfied_by).toBe(undefined);
      }
    });
  }
});

// ── §6 — `reportScope`, the third reader. PINNED INTERPRETATION 2. ────────────────────────────

describe("11-F22 §6 — reportScope reads the status too (02-F23's narrowing runs through it)", () => {
  it("11-F22 / 01-F48 — an inactive subject's sales-report reach is `none`", () => {
    // `reportScope` takes the same `AuthSubject` and answers an authorization question — how far a
    // subject's view reaches — and it is the seam `02-F23`'s reconciliation narrows through, so a
    // status check that stops at `can()` leaves an inactive manager reading her branch's shift
    // cash. `01-F48`: "where state cannot be read, participation is refused, not granted".
    //
    // The control is asserted only where a reach exists to lose: Appendix A's report row gives the
    // storekeeper stock reports and no SALES reach, so `none` is her active answer too and she
    // carries no control. `permission-matrix.test.ts` owns that cell; this file only asks whether
    // the reach a role HAS survives deactivation.
    const withReach: ReportReach[] = [];
    for (const role of ROLES) {
      const assignments: readonly Assignment[] = [{ role, branch_id: BRANCH_A }];
      const activeReach = reportScope(withStatus(assignments, ACTIVE), at(BRANCH_A));
      if (activeReach !== "none") withReach.push(activeReach);
      expect(
        reportScope(withStatus(assignments, INACTIVE), at(BRANCH_A)),
        `11-F22 — an inactive ${role} still reaches \`${activeReach}\` of the sales reports`,
      ).toBe("none");
    }
    expect(
      withReach.length,
      "24-F14 empty match — NO role has any sales-report reach while active, so every `none` " +
        "above is Appendix A's answer rather than `11-F22`'s",
    ).toBeGreaterThan(0);
  });
});

// ── §7 — the migration case. `11-F22` + `01-F48`: absent is NOT `active`. ─────────────────────

describe("11-F22 §7 — a status that cannot be read refuses (01-F48), it does not default", () => {
  const UNREADABLE: readonly (readonly [string, (a: readonly Assignment[]) => AuthSubject])[] = [
    [
      "the member is missing entirely — a projection written before the field existed",
      withoutStatus,
    ],
    [
      "the member is present and `undefined` — a mapper reading a column that is not there",
      (assignments) => withStatus(assignments, undefined),
    ],
  ];

  for (const [shape, build] of UNREADABLE) {
    it(`11-F22 / 01-F48 — fails CLOSED when ${shape}`, () => {
      // `11-F22`, verbatim, and it forecloses the tempting default by name: "The field is
      // **required at the writer** (`01-F75`), so nothing on the wire lacks it; what a device does
      // with its own older stored rows is a protected-path code decision owed against this FR,
      // **not a licence to default an absent status to `active`**." And `01-F48`, which `11-F22`
      // cites as what participation means: "where state cannot be read, participation is refused,
      // not granted".
      //
      // This is the direction that decides whether the change is worth making. A subject whose
      // status is absent is every caller that has not been updated yet — and if absent means
      // active, the fix ships green and protects nobody, which is the fail-open `11-F22` was
      // written the wide way to prevent.
      for (const role of ROLES) {
        const assignments: readonly Assignment[] = [{ role, branch_id: BRANCH_A }];
        const active = withStatus(assignments, ACTIVE);
        const unreadable = build(assignments);
        expect(
          notRefused(active, at(BRANCH_A)).length,
          `24-F14 empty match — an ACTIVE ${role} is allowed nothing`,
        ).toBeGreaterThan(0);
        expect(
          notRefused(unreadable, at(BRANCH_A)),
          `11-F22 / 01-F48 — a ${role} whose status is unreadable still authorizes these`,
        ).toEqual([]);
        expect(misattributed(unreadable, at(BRANCH_A))).toEqual([]);
      }

      // The other two readers, on the same reasoning (pinned interpretation 2).
      const manager: readonly Assignment[] = [{ role: "branch_manager", branch_id: BRANCH_A }];
      expect(canPayOut(build(manager), at(BRANCH_A), UNDER).outcome).toBe("deny");
      expect(canPayOut(build(manager), at(BRANCH_A), OVER).outcome).toBe("deny");
      expect(reportScope(build(manager), at(BRANCH_A))).toBe("none");
    });
  }
});

// ── §8 — the vocabulary is CLOSED at two, and only one of them participates. ──────────────────

describe("11-F22 §8 — only the exact string `active` participates", () => {
  /**
   * `11-F22`: "The statuses are `active` and `inactive`, and the set is closed at two … a wider
   * vocabulary is org policy nobody has ruled, and inventing one here would be inventing policy
   * (commandment 2). Widening the set is a spec act."
   *
   * Each row is a value an implementation might see and must refuse. The employment words are
   * `11-F22`'s own list of what this field is NOT ("*Suspended*, *on leave*, *probation*, *notice
   * period* are an employment lifecycle … and a **different field**"); `suspended` is also
   * `15-F25`'s ORG status, a different axis one join away. The truthy non-strings are how a
   * `Boolean(status)` or `status !== "inactive"` check fails open, which is the same blacklist
   * mistake in a different costume.
   */
  const NOT_ACTIVE: readonly (readonly [string, unknown])[] = [
    ["`inactive` — the FR's own second value, and the anchor of the closed set", INACTIVE],
    ["`suspended` — an employment word `11-F22` refuses, and `15-F25`'s ORG axis", "suspended"],
    ["`on_leave` — an employment lifecycle, which `11-F22` says is a different field", "on_leave"],
    ["`probation` — likewise", "probation"],
    ["`notice_period` — likewise", "notice_period"],
    ["`terminated` — a plausible synonym for the exit `14-F14` performs", "terminated"],
    ["`archived` — a plausible synonym for `11-F20`'s retained row", "archived"],
    ["`ACTIVE` — upper case is a THIRD token, not the first one", "ACTIVE"],
    ["`Active` — title case, likewise", "Active"],
    ["` active` — a wire value with leading whitespace", " active"],
    ["the empty string", ""],
    ["`null` — a column that exists and holds nothing", null],
    ["the number `1` — truthy, which is how a `Boolean(status)` check fails open", 1],
    ["`true` — a status stored as a boolean by a host that collapsed the field", true],
    ["an object", {}],
    ["a one-element array whose only member is `active`", ["active"]],
  ];

  for (const [label, value] of NOT_ACTIVE) {
    it(`11-F22 — ${label} does not participate`, () => {
      for (const role of ROLES) {
        const assignments: readonly Assignment[] = [{ role, branch_id: BRANCH_A }];
        expect(
          notRefused(withStatus(assignments, ACTIVE), at(BRANCH_A)).length,
          `24-F14 empty match — an ACTIVE ${role} is allowed nothing`,
        ).toBeGreaterThan(0);
        expect(
          notRefused(withStatus(assignments, value), at(BRANCH_A)),
          `11-F22 — a ${role} whose status is ${label} still authorizes these. The check is a ` +
            'whitelist of ONE value: `status !== "inactive"` admits every row here, and the ' +
            "set is closed at two by the FR (widening it is a spec act)",
        ).toEqual([]);
      }
      const manager: readonly Assignment[] = [{ role: "branch_manager", branch_id: BRANCH_A }];
      expect(canPayOut(withStatus(manager, value), at(BRANCH_A), UNDER).outcome).toBe("deny");
      expect(reportScope(withStatus(manager, value), at(BRANCH_A))).toBe("none");
    });
  }
});

// ── §9 — THE CONTROLS. GREEN BY DESIGN, credited as controls and not as coverage. ─────────────

describe("11-F22 §9 — controls: an ACTIVE roster still runs a restaurant", () => {
  it("GREEN BY DESIGN — all three outcomes are still reachable for ACTIVE subjects", () => {
    // The half that stops the fix becoming a till nobody can use. `11-F22` changes what an
    // INACTIVE subject may do and says nothing about an active one, so a guard that reads
    // `=== "inactive"` inverted, or that lands before the org check and refuses everyone, must
    // fail here rather than in a restaurant at 07:00.
    //
    // Asserted as a SHAPE, never as Appendix A's cells: all three of `AuthOutcome`'s values must
    // still be reachable across the four columns. `permission-matrix.test.ts` owns which cell is
    // which; this only refuses a matrix that has collapsed.
    const outcomes = new Set<AuthOutcome>();
    for (const role of ROLES) {
      for (const action of PERMISSION_ACTIONS) {
        outcomes.add(
          can(withStatus([{ role, branch_id: BRANCH_A }], ACTIVE), action, at(BRANCH_A)).outcome,
        );
      }
    }
    expect(
      [...outcomes].sort(),
      "an ACTIVE roster lost an entire outcome — `allow` gone is a till that cannot sell, " +
        "`escalate` gone is `02-F20` with no entry point",
    ).toEqual(["allow", "deny", "escalate"]);
  });

  for (const role of ROLES) {
    it(`GREEN BY DESIGN — an active ${role} is still allowed the work her role does`, () => {
      // Per-role, because the aggregate above is satisfied by three roles out of four. Derived,
      // so it pins no cell: whatever her row grants, she still has SOMETHING.
      expect(
        notRefused(withStatus([{ role, branch_id: BRANCH_A }], ACTIVE), at(BRANCH_A)).length,
      ).toBeGreaterThan(0);
      expect(
        notRefused(withStatus([{ role, branch_id: null }], ACTIVE), at(null)).length,
      ).toBeGreaterThan(0);
    });
  }

  it("GREEN BY DESIGN — the active pay-out and report readers are unmoved", () => {
    const manager: readonly Assignment[] = [{ role: "branch_manager", branch_id: BRANCH_A }];
    const active = withStatus(manager, ACTIVE);
    expect(canPayOut(active, at(BRANCH_A), UNDER).outcome).not.toBe("deny");
    expect(canPayOut(active, at(BRANCH_A), OVER).outcome).not.toBe("deny");
    expect(reportScope(active, at(BRANCH_A))).not.toBe("none");
  });

  it("GREEN BY DESIGN — ORDER INDEPENDENCE: reordering assignments changes no answer", () => {
    // The brief's control, and it is a real hazard here: a status guard written as a `.find()` or
    // a `.reduce()` over the assignment list would make the answer depend on which hat is listed
    // first. `01-F26` holds a per-user SET of (role, location) pairs; Appendix A's "one person
    // wears several hats" makes the widest of them decide. Asserted in both states, because the
    // refusal must be order-independent too.
    const hats: readonly Assignment[] = [
      { role: "cashier", branch_id: BRANCH_A },
      { role: "owner", branch_id: null },
    ];
    const reversed: readonly Assignment[] = [...hats].reverse();
    expect(notRefused(withStatus(hats, ACTIVE), at(BRANCH_A))).toEqual(
      notRefused(withStatus(reversed, ACTIVE), at(BRANCH_A)),
    );
    expect(notRefused(withStatus(hats, INACTIVE), at(BRANCH_A))).toEqual(
      notRefused(withStatus(reversed, INACTIVE), at(BRANCH_A)),
    );
  });

  it("GREEN BY DESIGN — 01-F26 / 01-F27: the pre-existing fail-closed axes are untouched", () => {
    // `11-F22` adds a refusal; it removes none. A guard placed so that it REPLACES the org check
    // or the no-assignment default would pass every §2 sweep and open two holes. Both of these
    // are already true today, which is why they are controls: they must stay true after.
    const foreignOwner = withStatus([{ role: "owner", branch_id: null }], ACTIVE, newId());
    expect(
      notRefused(foreignOwner, at(BRANCH_A)),
      "01-F71 / 01-F26 — an owner of ANOTHER org reached this org's actions",
    ).toEqual([]);
    const nobody = withStatus([], ACTIVE);
    expect(
      notRefused(nobody, at(BRANCH_A)),
      "01-F27 — a device with nobody unlocked carries no role, so it authorizes nothing",
    ).toEqual([]);
  });
});
