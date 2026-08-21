// Acceptance tests — `11-F22`'s participation status, read by the AUTHORIZATION SUBJECT.
//
// **Authored from SPEC TEXT ONLY**, by a session that wrote no implementation for this FR, no part
// of `permissions.ts`, and did not read the build plan's file-by-file sequence (`24 §3` step 2).
// Every assertion below is traceable to a quoted clause, not to what the matrix happens to do.
//
// ⚠ **THIS FILE IS AN AMENDMENT, AND THE THING IT AMENDS IS WHY IT EXISTS.** Its first version
// (`1272922`, 2026-08-17) asserted `11-F22` as a **per-PERSON** field: one `status` on
// `AuthSubject`. On 2026-08-18 `6d7fc86` disambiguated `11-F22` to **per-(PERSON, BRANCH)**, carried
// with `01-F26`'s ASSIGNMENT, because the FR's transfer clause requires a cashier moving A→B to be
// *"`inactive` in A's roster and `active` in B's"* **at the same moment** — which one field cannot
// express. The storage layer was corrected the same day; this suite was not, so for three days a
// green oracle defended a reading its own FR had overruled. That is this repo's named trap —
// *"when a ruling lands, grep the suites that encode the old rule the same day"* — and the
// amendment is the grep arriving late. **All 45 tests of the first version are kept — 1+9+2+2+4+1+
// 2+16+8 — retargeted from the subject to the assignment and not weakened. The ten new ones are
// §9's eight (the transfer, which the old shape could not express at all) and §7's two, which
// refuse the overruled shape by construction. 45 + 10 = 55.**
//
// Sources, and nothing else:
//   `specs/11-staff-people.md`    — **`11-F22` — THE DECIDING FR**: the field, the closed two-value
//                                   vocabulary, "Only `active` PARTICIPATES … and the authorization
//                                   subject reads the status too, so an inactive person authorizes
//                                   nothing even from a session that predates her deactivation",
//                                   the named fail-OPEN the wide reading exists to prevent, "not a
//                                   licence to default an absent status to `active`", the TWO
//                                   FIELDS rule (*may she act* ≠ *does she render*), **the TRANSFER
//                                   clause** ("she is `inactive` in A's roster and `active` in
//                                   B's"), **the PER-(PERSON, BRANCH) clause** ("THE FIELD IS
//                                   THEREFORE PER-(PERSON, BRANCH) AND NOT A COLUMN ON THE PERSON
//                                   ROW … participation is carried where `01-F26` already carries
//                                   the relationship — **with the ASSIGNMENT**"), and the DEPARTURE
//                                   clause ("A person is departed when she is `inactive` in
//                                   **every** branch that names her"); `11-F20` (a person record is
//                                   never deleted); `11-F21` (the hash rides only an `active`
//                                   entry).
//   `specs/01-kernel-sync.md`     — **`01-F48`** — "if revocation state cannot be read,
//                                   participation is refused, not granted", which `11-F22` cites
//                                   BY NAME as what *participation* means here; **`01-F78`** — "The
//                                   status a row carries is THIS branch's, per `11-F22`'s
//                                   per-(person, branch) clause", and its half one, whose rule is
//                                   "exactly `rolesAt`'s existing predicate … `branch_id === null
//                                   || branch_id === this branch`"; `01-F1` (append-only: a wrong
//                                   `allow` is permanent); `01-F26` (User × Role × per-location
//                                   assignment); `01-F27` (server-side authorization on every
//                                   operation; a device token carries device identity only);
//                                   `01 §4`'s **`staff` row**, which names the field: "`status`
//                                   (`11-F22`)".
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
// discovered.** `RoleAssignment` is `{ role, branch_id }` and carries no status, so a suite cannot
// assert `11-F22`'s per-(person, branch) clause without naming a member. It writes **`status`, on
// the ASSIGNMENT**, for three reasons that are not this file's opinion:
//   * `11-F22` says where it lives, in those words — *"participation is carried where `01-F26`
//     already carries the relationship — with the ASSIGNMENT"*;
//   * `01 §4`'s `staff` row names the field `status`, citing this FR;
//   * a suite written by a different session days later — `packages/domain/src/
//     export-permission.test.ts:55` — independently builds `assignments: [{ role, branch_id,
//     status: "active" }]`, and **fails to compile against the tree today** for exactly the member
//     this file asserts. Two sessions that never met wrote the same member name from the same FR.
// If an implementer chooses a different member name, or puts it back on `AuthSubject`, this suite
// reds: that is a CONFLICT TO REPORT (`24 §3`), not an assertion to edit. Nothing else about the
// type is asserted — not requiredness, not the union — because a type-level assertion would fail
// `pnpm typecheck` for every other agent in this tree today, and `device-permission.test.ts` /
// `user-permission.test.ts` established the run-time-red, compile-time-green idiom this file
// follows.
//
// **RED-AWAITING-IMPLEMENTATION, and the vacuity trap is named because it is the whole design.**
// The equivalent of `user-permission.test.ts`'s `requireDeclared()` here is not a declaration
// check — it is that **a refusal must be attributable to the STATUS and to nothing else**. An
// inactive subject with no assignments is refused for the wrong reason; so is one asked about an
// action her row denies anyway; so is one at a branch she is not assigned to. So every refusal
// below is paired, IN THE SAME TEST, with an **ACTIVE TWIN**: the same `user_id`, the same
// `org_id`, the same `(role, branch_id)` pairs, differing in exactly one field. The twin's
// non-refused set is asserted NON-EMPTY first (`24-F14` empty-match protection, and it names the
// actions in its failure), so a green test can never mean "she was allowed nothing either way".
//
// **Measured on the tree as amended (2026-08-21): 45 of 55 RED, 10 GREEN**, package total
// 666 = 611 pre-existing + 55, one failing FILE. The ten greens are §10's eight controls plus TWO
// of §9's rows — order independence, and "an org-wide ACTIVE hat survives a branch deactivation" —
// which a statusless matrix answers correctly by accident, because an implementation that reads
// nothing cannot be order-dependent about it or poison a branch with it. Both are credited as
// controls, not as coverage; M9 and M8 below are what prove they bite. All 611 pre-existing tests
// stayed green, so every red is attributable to this file alone, and **no `24-F14` empty-match
// control failed**: every red is a leak, not a fixture that matched nothing.
//
// **Checked against a plausible CORRECT implementation, out-of-tree** (`24 §3`: a suite that stays
// RED under a correct implementation blocks the implementer indefinitely and is as damaging as a
// vacuous one). The package was copied to a scratchpad with `node_modules` symlinked;
// `status?: "active" | "inactive"` was added to `RoleAssignment`, and `rolesAt`'s predicate was
// narrowed by ONE CONJUNCT — `&& assignment.status === "active"` — so that an assignment which does
// not participate contributes no role. All three readers already resolve through `rolesAt`, so
// interpretation 2 costs nothing to satisfy. **55 of 55 green.**
// `packages/domain/src/permissions.ts` was never opened for writing in this tree and was verified
// byte-identical afterwards (`d5308a18…`).
//
// ⚠ **AND THE SAME RUN MEASURED A CONSEQUENCE THAT IS `11-F22`'s AND NOT THIS FILE'S, recorded
// here so it is not discovered as a mystery red.** That implementation also turned **70**
// pre-existing tests red in four sibling suites — `permission-matrix` 53, `user-permission` 9,
// `device-permission` 5, `tenant-isolation-matrix` 3 — because every one of them builds assignments
// with **no status** and expects `allow`. That is §7's case arriving from the other side: once
// absent no longer means `active` (which `11-F22` forbids by name), every statusless caller in the
// tree is refused, and a test fixture is a caller. Each of the four has exactly ONE
// `AuthSubject`-constructing helper and every assignment in the file flows through it, so the
// repair is **one line per file, inside that helper** — `status: "active"` — which restates the
// same subject under a widened type and weakens no assertion. It is still an edit to four other
// sessions' oracles (`24 §3`), so it is REPORTED rather than made here.
// ⚠ Note `permission-matrix.test.ts` declares its own local structural `AuthSubject`/
// `RoleAssignment` and reaches `can` through an `unknown` cast, so **making the member required
// would not give that file a typecheck error** — it would give 53 silent reds. And
// `export-permission.test.ts` is the opposite case and the corroborating one: it already writes the
// member, so it is **0 reds under the correct implementation and 0 under the tree today**, and what
// moves is the COMPILE — from the tree's one live `error TS2353: 'status' does not exist in type
// 'RoleAssignment'` to none. A fixture written against the current ruling shows up as a typecheck
// error, not as a red test, which is why the ruling could be missed by a suite run.
//
// ⚠ **THE NUMBER DID NOT MOVE FROM THE PER-PERSON VERSION'S 70, AND THAT IS ITSELF THE FINDING.**
// The first version measured 70 with the status on the SUBJECT; this one measures 70 with the
// status on the ASSIGNMENT. The two shapes have the same blast radius because the fixtures'
// omission is the same omission either way — which means **the size of the consequence was never
// evidence for the shape**, and a session choosing between the two readings on "how much does it
// break" would have learned nothing. Only the transfer distinguishes them, which is §9.
//
// ── The author's own mutation pre-check (round-3 law). An INDEPENDENT prover round is still ────
//    owed — these numbers are a floor and an attribution map, not a substitute for one. ─────────
//
// Every row ran in the same out-of-tree copy and NEVER in this tree (AGENTS.md: a permission cell
// is a security parameter, and an agent killed between "weaken" and "revert" strands a widened
// credential with every test green). Each differs in exactly one branch from the correct
// implementation above; 55 tests in this file.
//
//   M1  no reader reads it — **the tree as this file is written** ……………………………………………………… 45
//   M2  THE OVERRULED READING, tolerant form — one `status` on the SUBJECT decides every
//       branch, an absent one participates ……………………………………………………………………………………………………… 45
//       ⚠ **Identical to M1, test for test, and that is a finding rather than a coincidence.**
//       This suite never builds a person-level `inactive`, and it must not: asserting that such
//       a subject is ALLOWED would be a fail-open assertion, and asserting she is REFUSED would
//       red the correct implementation, which reads her assignment and finds it `active`. So the
//       tolerant per-person reading is not distinguishable from "reads nothing" BY A KILL COUNT.
//       What distinguishes the readings is not a mutant at all — it is that the correct
//       implementation takes this file to 55/55 and M2b cannot take it anywhere.
//   M2b THE OVERRULED READING, the parked branch verbatim — absent REFUSES ……………………………… 51
//       44 of the 51 arrive through the `24-F14` empty-match guard, because that implementation
//       refuses every subject carrying no person-level status and this file's subjects all do.
//       **Six of the 51 are §10's CONTROLS**: the overruled shape does not merely miss the
//       transfer, it takes the restaurant down — which is the shape of the 70-red consequence
//       above, seen from inside a suite that was written to notice.
//   M3  an inactive OWNER is allowed, because `owner` is special-cased ahead of the status … 28
//       §8's 16 + §7's 4 + §2's 2 + §3's 2 + §9's 2 + §5 + §6, none via the empty-match guard.
//   M4  an ABSENT status is treated as `active` ……………………………………………………………………………………………………  3
//       §7's three absent-status rows, and no others. Do not read a small kill count as a weak
//       assertion — read it as attribution: nothing else in this file is pointed at that case.
//   M5  a BLACKLIST — only the literal `inactive` refuses ………………………………………………………………………… 18
//       15 of §8's 16 (the `inactive` row passes, correctly) + §7's 3. None via empty match.
//   M6  only `can()` reads it; `canPayOut` and `reportScope` do not (pinned interpretation 2)  41
//   M7  `escalate` cells survive deactivation (pinned interpretation 1) ………………………………………… 26
//   M8  a per-BRANCH AGGREGATE — any inactive assignment reaching the scope refuses ALL of
//       it (pinned interpretation 4's alternative) ………………………………………………………………………………………  2
//       **Exactly §9's two mixed-hat rows and nothing else** — verified test by test. A small
//       number that is the whole point: this mutant is *safe* everywhere except where an
//       org-wide hat must survive a branch deactivation, and there it takes an owner's till
//       away as a side effect of tidying a roster. It is also the only mutant this file kills
//       on an argued reading rather than a quoted one, so its two rows are the ones to contest.
//   M9  ORDER-DEPENDENT — the FIRST assignment's status decides for the whole subject …………  7
//       All seven are §9's, three of them through the empty-match guard — which is that guard
//       doing its job: under this mutant the ACTIVE twin is refused too, so the claim would
//       otherwise have passed vacuously. This mutant is the reason §9 asserts order
//       independence directly: with status ON the pair, `assignments[0].status` is a plausible
//       implementation that the per-person shape could not even express.
//   C1  CONTROL — an action moves position in `PERMISSION_ACTIONS` ……………………………………………………  0
//   C2  CONTROL — `rolesAt` reads a subject's assignments in reverse ………………………………………………  0
//   C3  CONTROL — an unrelated local is renamed (`verdicts` → `row`) …………………………………………………  0
//
// **M1 is why the red state is quotable as evidence rather than as a to-do**: the tree today IS a
// mutant of the correct implementation, and this file fails on it in exactly the 45 places the
// leak reaches. **The three controls are what make every other row mean anything** — a suite that
// reddened on a reorder would kill them too, and then its kill counts would be measuring its own
// brittleness. **C2 is load-bearing twice over now**: with status on the assignment an
// implementation reading `assignments[0].status` is order-dependent in a way the per-person shape
// could not be (M9), so §9 asserts order independence directly — and C2 is what proves the suite
// is not merely brittle about order in general.
//
// ── FOUR PINNED INTERPRETATIONS. Each is a READING, stated so it can be contested. ─────────────
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
// **(4) AN INACTIVE ASSIGNMENT CONTRIBUTES NO ROLE; IT DOES NOT POISON THE BRANCH.** This is the
// interpretation the per-person shape never had to make, and §9's two mixed-hat rows are the only
// place it bites. A person holds a SET of (role, location) pairs (`01-F26`) and Appendix A's "one
// person wears several hats" makes the widest of them decide; `11-F22` puts participation **on the
// pair**. So the reach at a branch is the widest of the pairs that BOTH reach it (`01-F78`'s
// predicate: `branch_id === null || branch_id === this branch`) AND are `active`. The alternative —
// *any* inactive pair reaching this branch refuses everything at it — is refused on `01-F78` half
// one by name: an owner holds Appendix A's "everything" through an org-wide assignment and
// *"therefore … unlocks a till at a branch she does not staff"*, so deactivating her cashier hat at
// one branch would silently take her owner authority there with it. Fail-closed does not decide
// this one, because both readings refuse strictly more than the matrix does today; `01-F26`'s set
// semantics and `01-F78`'s predicate do. ⚠ **If an implementer reads it the other way, §9's two
// mixed-hat rows are the CONFLICT TO REPORT** — they are the two tests in this file whose
// direction is argued rather than quoted.
//
// ── What this file deliberately does NOT decide (silence here is not permission) ───────────────
//   * **The PIN check.** `11-F22`'s first half — *"An inactive person does not unlock, on any
//     device"* — is `packages/sync-client`'s `unlock()` and its `not_active` refusal reason, which
//     that FR declares. Nothing here asserts it; this file owns only the second half, the clause
//     that `11-F22` says the narrow reading would leave a fail-open behind.
//   * **The wire and the stored row.** `01-F75`'s roster artifact carries ONE `status` per row
//     because `01-F76` already makes the artifact branch-scoped — *"an entry's single `status` **is**
//     that branch's participation"* — and `01-F78` is what turns that row into this subject. Which
//     representation the wire uses is decided there and not here; this file asserts only what the
//     MATRIX must do with the subject it is handed, and a subject spans branches (`01-F26`) where a
//     branch-scoped artifact does not. **That difference is not a contradiction and is the reason
//     the per-person reading looked right for three days.**
//   * **The identification grid.** `11-F22` gives status exactly one rendering surface (`01-F61`'s
//     grid offers `active` members only). That is a doc 02 / doc 27 surface, and `11-F22`'s TWO
//     FIELDS rule is precisely that rendering and participation are different questions.
//   * **R27's live session.** `11 §9`'s ruling that a deactivation ends the signed-in session is
//     about a session, not about `can()`; the matrix half is what makes it safe and is all that is
//     asserted here.
//   * **Un-deactivation, and any third status.** Widening is a spec act (`11-F22`); §8 is a
//     tripwire so it cannot happen silently, not a vote on the outcome.
//   * **`11-F23`'s credential deletion**, which `11-F22`'s departure clause keys to *"the LAST
//     active assignment"*. That is a cloud-side storage act; the departure asserted in §9 is only
//     what the MATRIX answers for a person inactive everywhere.

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
 *
 * It matters twice as much in §9: the transfer is ONE person holding two assignments, and a suite
 * that split her into two subjects would be asserting nothing about `11-F22` at all.
 */
const USER = newId();
const SOMEONE_ELSE = newId();

/** `11-F22`: "The statuses are `active` and `inactive`, and the set is closed at two." */
const ACTIVE = "active";
const INACTIVE = "inactive";

/**
 * `01-F26`'s (role, location) pair with `11-F22`'s participation ON it. `status` is `unknown` here
 * and not the union, so §8 can hand the matrix a third token without a cast at every row and
 * without this file asserting the type — see the shape decision in the header.
 */
type Assignment = {
  readonly role: Role;
  readonly branch_id: string | null;
  readonly status?: unknown;
};

/** The pair, participating. */
const active = (role: Role, branch_id: string | null): Assignment =>
  ({ role, branch_id, status: ACTIVE }) as Assignment;

/** The pair, deactivated at THIS location and nowhere else (`11-F22`, `01-F78`). */
const inactive = (role: Role, branch_id: string | null): Assignment =>
  ({ role, branch_id, status: INACTIVE }) as Assignment;

/** The pair carrying some other value — §8's closed-vocabulary rows. */
const holding = (role: Role, branch_id: string | null, status: unknown): Assignment =>
  ({ role, branch_id, status }) as Assignment;

/** A pair whose status is not present AT ALL — the migration shape (`11-F22`, `01-F48`). */
const statusless = (role: Role, branch_id: string | null): Assignment =>
  ({ role, branch_id }) as Assignment;

/**
 * The subject. The cast is what lets the file compile before `RoleAssignment` carries the member
 * and after it carries it as a required union: in both directions one of the two types is
 * assignable to the other, so the assertion is legal, and no `any` is introduced.
 */
const subjectOf = (assignments: readonly Assignment[], org_id: string = ORG): AuthSubject =>
  ({ user_id: USER, org_id, assignments }) as AuthSubject;

/**
 * THE OVERRULED SHAPE, built on purpose so §7 and §9 can refuse it: one `status` on the PERSON,
 * beside assignments that carry their own or carry none. `11-F22`: *"THE FIELD IS THEREFORE
 * PER-(PERSON, BRANCH) AND NOT A COLUMN ON THE PERSON ROW."* A reader that honours this member is
 * reading the fact that was overruled, and a suite that never constructs it cannot say so.
 */
const withPersonStatus = (assignments: readonly Assignment[], status: unknown): AuthSubject =>
  ({ user_id: USER, org_id: ORG, assignments, status }) as unknown as AuthSubject;

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
 * leak instead of a count. Used in three directions: as the twin CONTROL (must be non-empty), as
 * the claim (must be empty for an inactive subject), and in §9 as a REACH that must survive
 * unchanged at the branch she has moved to.
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
 * branch only — `01-F78` half one restates it as `rolesAt`'s predicate). Asking a branch-scoped
 * subject about branch B would make the twin control empty and the refusal uninformative — a
 * stranger at branch B is refused everything anyway.
 */
const SHAPES = [
  {
    label: "branch-scoped",
    assignments: (role: Role, status: "active" | "inactive"): readonly Assignment[] => [
      status === ACTIVE ? active(role, BRANCH_A) : inactive(role, BRANCH_A),
    ],
    scopes: [["her own branch", at(BRANCH_A)]],
  },
  {
    label: "org-wide (`branch_id: null`)",
    assignments: (role: Role, status: "active" | "inactive"): readonly Assignment[] => [
      status === ACTIVE ? active(role, null) : inactive(role, null),
    ],
    scopes: [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
      ["the org-scoped request (no branch stated)", at(null)],
    ],
  },
] as const satisfies readonly {
  label: string;
  assignments: (role: Role, status: "active" | "inactive") => readonly Assignment[];
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
    const activeSubject = subjectOf([active("cashier", BRANCH_A)]);
    const inactiveSubject = subjectOf([inactive("cashier", BRANCH_A)]);
    const scope = at(BRANCH_A);

    // CONTROLS — asserted as "not a refusal" rather than as a cell, because
    // `permission-matrix.test.ts` owns Appendix A's transcription and a second copy of it here is
    // a second authority for one table.
    expect(
      can(activeSubject, "payment.settle", scope).outcome,
      "an ACTIVE cashier is refused `payment.settle`, so the refusal below is about her row",
    ).not.toBe("deny");
    expect(
      can(activeSubject, "refund.issue", scope).outcome,
      "an ACTIVE cashier is refused `refund.issue`, so the refusal below is about her row",
    ).not.toBe("deny");
    // `cash.paid_out` is the one action `can()` refuses BY DESIGN so `05-F19`'s threshold cannot
    // be skipped, which is exactly why the pay-out leg has to be asked through `canPayOut`.
    expect(
      canPayOut(activeSubject, scope, UNDER).outcome,
      "an ACTIVE cashier is refused a below-threshold pay-out, so §5's refusals are about her row",
    ).not.toBe("deny");

    expect(can(inactiveSubject, "payment.settle", scope).outcome, "she is still settling").toBe(
      "deny",
    );
    expect(can(inactiveSubject, "refund.issue", scope).outcome, "she is still refunding").toBe(
      "deny",
    );
    expect(
      canPayOut(inactiveSubject, scope, UNDER).outcome,
      "she is still taking cash out of the drawer (`05-F19`, and `11-F22` names pay-outs)",
    ).toBe("deny");
  });
});

// ── §2 — THE SWEEP. `11-F22`: an inactive person "authorizes nothing". ────────────────────────

describe("11-F22 §2 — an inactive subject is refused EVERY action the matrix carries", () => {
  for (const shape of SHAPES) {
    for (const role of ROLES) {
      it(`11-F22 — an inactive ${role} (${shape.label}) authorizes nothing`, () => {
        const activeSubject = subjectOf(shape.assignments(role, ACTIVE));
        const inactiveSubject = subjectOf(shape.assignments(role, INACTIVE));

        for (const [where, scope] of shape.scopes) {
          // The twin control, carried INSIDE the test it protects rather than a section away,
          // because the two must not drift. Derived by asking the production matrix — never a
          // hand-copy — and it names the actions, so a failure says which reach was lost.
          const wouldOtherwise = notRefused(activeSubject, scope);
          expect(
            wouldOtherwise.length,
            `24-F14 empty match — an ACTIVE ${role} (${shape.label}) is allowed NOTHING at ` +
              `${where}, so the refusal below would be measuring only itself`,
          ).toBeGreaterThan(0);

          // The sweep is over the PRODUCTION list, never a copy of it, so an action added to the
          // matrix is swept the day it lands and cannot be widened into by silence. It is also
          // order-independent: the assertion is on a set that must be empty.
          expect(
            notRefused(inactiveSubject, scope),
            `11-F22 — an inactive ${role} still authorizes these at ${where}. The FR is written ` +
              "the wide way BECAUSE the narrow one is a live fail-open: the row is RETAINED, so " +
              "her assignments are all still there and only the status can refuse them",
          ).toEqual([]);

          expect(
            misattributed(inactiveSubject, scope),
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
    const activeSubject = subjectOf([active("branch_manager", BRANCH_A)]);
    const inactiveSubject = subjectOf([inactive("branch_manager", BRANCH_A)]);
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
      expect(
        notRefused(activeSubject, scope).length,
        `24-F14 empty match — ${label}`,
      ).toBeGreaterThan(0);
      expect(notRefused(inactiveSubject, scope), `11-F22 — leaked through ${label}`).toEqual([]);
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
    const activeSubject = subjectOf([active("owner", null)]);
    const inactiveSubject = subjectOf([inactive("owner", null)]);

    for (const [where, scope] of [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
      ["the org-scoped request (no branch stated)", at(null)],
    ] as const) {
      expect(
        notRefused(activeSubject, scope).length,
        `24-F14 empty match — an ACTIVE org-wide owner is allowed nothing at ${where}`,
      ).toBeGreaterThan(0);
      expect(
        notRefused(inactiveSubject, scope),
        `11-F22 — an inactive OWNER still authorizes these at ${where}`,
      ).toEqual([]);
      expect(misattributed(inactiveSubject, scope)).toEqual([]);
    }

    // The other two readers, because an owner is the subject most likely to be special-cased in
    // all three (pinned interpretation 2).
    expect(canPayOut(activeSubject, at(BRANCH_A), UNDER).outcome, "24-F14 empty match").not.toBe(
      "deny",
    );
    expect(canPayOut(inactiveSubject, at(BRANCH_A), UNDER).outcome).toBe("deny");
    expect(canPayOut(inactiveSubject, at(BRANCH_A), OVER).outcome).toBe("deny");
    expect(reportScope(activeSubject, at(BRANCH_A)), "24-F14 empty match").not.toBe("none");
    expect(reportScope(inactiveSubject, at(BRANCH_A))).toBe("none");
  });

  it("11-F22 — a BRANCH-scoped inactive owner is refused at her own branch too", () => {
    // The same claim on the other assignment shape, so an implementation that reads status only on
    // the org-wide path — the shape `permissions.ts` calls "how an owner holds Appendix A's
    // 'everything'" — does not survive.
    expect(
      notRefused(subjectOf([active("owner", BRANCH_A)]), at(BRANCH_A)).length,
      "24-F14 empty match",
    ).toBeGreaterThan(0);
    expect(notRefused(subjectOf([inactive("owner", BRANCH_A)]), at(BRANCH_A))).toEqual([]);
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
    const activeSubject = subjectOf([active("cashier", BRANCH_A)]);
    const inactiveSubject = subjectOf([inactive("cashier", BRANCH_A)]);
    const scope = at(BRANCH_A);

    // Derived from the matrix, never listed by hand: whichever cells escalate for an ACTIVE
    // cashier are the cells this test is about, and a matrix that stopped escalating anything
    // would fail the empty-match assertion rather than pass this one vacuously.
    const escalating = PERMISSION_ACTIONS.filter(
      (action) => can(activeSubject, action, scope).outcome === "escalate",
    );
    expect(
      escalating.length,
      "24-F14 empty match — no cell escalates for an ACTIVE cashier, so this test is about " +
        "nothing. Appendix A's third cell kind is `needs Mgr PIN` and `02-F20` requires it to " +
        "resolve, so an empty set is a defect in the matrix, not a reason to pass",
    ).toBeGreaterThan(0);

    for (const action of escalating) {
      const decision = can(inactiveSubject, action, scope);
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
    expect(
      canPayOut(subjectOf([active("branch_manager", BRANCH_A)]), at(BRANCH_A), OVER).outcome,
      "24-F14 empty match — an ACTIVE manager is already refused an above-threshold pay-out, so " +
        "the refusal below is not about `11-F22`",
    ).not.toBe("deny");
    const decision = canPayOut(
      subjectOf([inactive("branch_manager", BRANCH_A)]),
      at(BRANCH_A),
      OVER,
    );
    expect(decision.outcome).toBe("deny");
    expect(decision.action).toBe("cash.paid_out");
    expect(decision.satisfied_by).toBe(undefined);
  });
});

// ── §5 — `canPayOut`, the reader `can()` deliberately refuses. PINNED INTERPRETATION 2. ───────

describe("11-F22 §5 — canPayOut reads the status too (05-F19, and the FR names pay-outs)", () => {
  for (const role of ROLES) {
    it(`11-F22 / 05-F19 — an inactive ${role} takes nothing out of the drawer`, () => {
      const activeSubject = subjectOf([active(role, BRANCH_A)]);
      const inactiveSubject = subjectOf([inactive(role, BRANCH_A)]);
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
        ([, request]) => canPayOut(activeSubject, scope, request).outcome !== "deny",
      );
      expect(
        live.length,
        `24-F14 empty match — an ACTIVE ${role} is refused a pay-out at BOTH amounts, so the ` +
          "refusals below are her row's and not `11-F22`'s",
      ).toBeGreaterThan(0);

      for (const [where, request] of live) {
        const decision = canPayOut(inactiveSubject, scope, request);
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
      const activeReach = reportScope(subjectOf([active(role, BRANCH_A)]), at(BRANCH_A));
      if (activeReach !== "none") withReach.push(activeReach);
      expect(
        reportScope(subjectOf([inactive(role, BRANCH_A)]), at(BRANCH_A)),
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
  const UNREADABLE: readonly (readonly [string, (role: Role) => Assignment])[] = [
    [
      "the member is missing entirely — a projection written before the field existed",
      (role) => statusless(role, BRANCH_A),
    ],
    [
      "the member is present and `undefined` — a mapper reading a column that is not there",
      (role) => holding(role, BRANCH_A, undefined),
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
      // This is the direction that decides whether the change is worth making. An assignment whose
      // status is absent is every caller that has not been updated yet — and if absent means
      // active, the fix ships green and protects nobody, which is the fail-open `11-F22` was
      // written the wide way to prevent.
      for (const role of ROLES) {
        expect(
          notRefused(subjectOf([active(role, BRANCH_A)]), at(BRANCH_A)).length,
          `24-F14 empty match — an ACTIVE ${role} is allowed nothing`,
        ).toBeGreaterThan(0);
        expect(
          notRefused(subjectOf([build(role)]), at(BRANCH_A)),
          `11-F22 / 01-F48 — a ${role} whose status is unreadable still authorizes these`,
        ).toEqual([]);
        expect(misattributed(subjectOf([build(role)]), at(BRANCH_A))).toEqual([]);
      }

      // The other two readers, on the same reasoning (pinned interpretation 2).
      const manager = subjectOf([build("branch_manager")]);
      expect(canPayOut(manager, at(BRANCH_A), UNDER).outcome).toBe("deny");
      expect(canPayOut(manager, at(BRANCH_A), OVER).outcome).toBe("deny");
      expect(reportScope(manager, at(BRANCH_A))).toBe("none");
    });
  }

  // ── The two rows that refuse the OVERRULED reading by construction. ──────────────────────────
  //
  // `11-F22`: "THE FIELD IS THEREFORE PER-(PERSON, BRANCH) AND NOT A COLUMN ON THE PERSON ROW —
  // stated August 2026 because this FR carried BOTH readings and the first implementation picked
  // the wrong one." A suite that only ever hands the matrix a well-formed per-assignment subject
  // cannot tell a correct reader from one that is reading a person-level column and happens to
  // agree; these two hand it a subject where the two readings DISAGREE, and the FR says which wins.

  it("11-F22 — a person-level `status: active` does not rescue assignments that carry none", () => {
    // The migration shape as the overruled implementation would have produced it: the column is on
    // the person, the pairs carry nothing. `01-F48` decides it — the participation of the pair
    // cannot be read, so it is refused, and a person-level field is not that pair's fact.
    for (const role of ROLES) {
      expect(
        notRefused(subjectOf([active(role, BRANCH_A)]), at(BRANCH_A)).length,
        `24-F14 empty match — an ACTIVE ${role} is allowed nothing`,
      ).toBeGreaterThan(0);
      expect(
        notRefused(withPersonStatus([statusless(role, BRANCH_A)], ACTIVE), at(BRANCH_A)),
        `11-F22 — a ${role} whose PERSON row says \`active\` and whose ASSIGNMENT says nothing ` +
          "still authorizes these. The field is per-(person, branch); a column on the person row " +
          "is the reading this FR overruled, and honouring it is `01-F48` defaulted open",
      ).toEqual([]);
    }
    const manager = withPersonStatus([statusless("branch_manager", BRANCH_A)], ACTIVE);
    expect(canPayOut(manager, at(BRANCH_A), UNDER).outcome).toBe("deny");
    expect(reportScope(manager, at(BRANCH_A))).toBe("none");
  });

  it("11-F22 — a person-level `status: active` does not overrule an `inactive` assignment", () => {
    // The sharper half, and the one a per-person implementation gets exactly backwards: the two
    // facts are both present and they disagree. `11-F22` says the assignment's is the operative
    // one — "participation is carried where `01-F26` already carries the relationship" — so a
    // deactivated-at-this-branch cashier is refused here no matter what any person-level field
    // says. Reading it the other way is how a later republish "silently returned a departed
    // cashier to `active`", which the FR names as the state it exists to forbid.
    for (const role of ROLES) {
      expect(
        notRefused(subjectOf([active(role, BRANCH_A)]), at(BRANCH_A)).length,
        `24-F14 empty match — an ACTIVE ${role} is allowed nothing`,
      ).toBeGreaterThan(0);
      expect(
        notRefused(withPersonStatus([inactive(role, BRANCH_A)], ACTIVE), at(BRANCH_A)),
        `11-F22 — a ${role} deactivated AT THIS BRANCH still authorizes these because a ` +
          "person-level `active` was believed. The per-(person, branch) clause is the operative " +
          "one and the heading it corrects is a description of where the field is CARRIED",
      ).toEqual([]);
      expect(
        misattributed(withPersonStatus([inactive(role, BRANCH_A)], ACTIVE), at(BRANCH_A)),
      ).toEqual([]);
    }
  });
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
        expect(
          notRefused(subjectOf([active(role, BRANCH_A)]), at(BRANCH_A)).length,
          `24-F14 empty match — an ACTIVE ${role} is allowed nothing`,
        ).toBeGreaterThan(0);
        expect(
          notRefused(subjectOf([holding(role, BRANCH_A, value)]), at(BRANCH_A)),
          `11-F22 — a ${role} whose assignment status is ${label} still authorizes these. The ` +
            'check is a whitelist of ONE value: `status !== "inactive"` admits every row here, ' +
            "and the set is closed at two by the FR (widening it is a spec act)",
        ).toEqual([]);
      }
      const manager = subjectOf([holding("branch_manager", BRANCH_A, value)]);
      expect(canPayOut(manager, at(BRANCH_A), UNDER).outcome).toBe("deny");
      expect(reportScope(manager, at(BRANCH_A))).toBe("none");
    });
  }
});

// ── §9 — THE TRANSFER. The case that overruled the per-person reading. ────────────────────────
//
// `11-F22`, the clause the amendment turns on: "A cashier who moves from branch A to branch B is
// not a departure … she is **`inactive` in A's roster and `active` in B's**." And the correction
// it forced: "The heading above says *a PERSON RECORD carries a participation status*, which reads
// per-person; the transfer clause one bullet up requires her to be `inactive` at A and `active` at
// B **at the same moment**, which a single per-person column cannot express. **The transfer clause
// is the operative one.**" `01-F78` states the same fact from the artifact side: "The status a row
// carries is THIS branch's."
//
// Every test in this section asks ONE subject at TWO scopes, in one call stack, with no rebuild
// between. That is what "at the same moment" means as an assertion, and it is the property no
// arrangement of a per-person field can satisfy.

describe("11-F22 §9 — one person, two branches, two answers, at the same moment", () => {
  it("11-F22 — she is refused at A and allowed at B, and her B reach is exactly a B cashier's", () => {
    // A→B. The twin control is the same two pairs BOTH active — the same person on the day before
    // the transfer — so a lost reach at B is attributable to the status and not to the second
    // assignment existing at all.
    const transferring = subjectOf([inactive("cashier", BRANCH_A), active("cashier", BRANCH_B)]);
    const beforeTheTransfer = subjectOf([active("cashier", BRANCH_A), active("cashier", BRANCH_B)]);

    expect(
      notRefused(beforeTheTransfer, at(BRANCH_A)).length,
      "24-F14 empty match — a cashier assigned to A is allowed nothing at A, so the refusal " +
        "below would be measuring only itself",
    ).toBeGreaterThan(0);
    expect(
      notRefused(beforeTheTransfer, at(BRANCH_B)).length,
      "24-F14 empty match — a cashier assigned to B is allowed nothing at B",
    ).toBeGreaterThan(0);

    expect(
      notRefused(transferring, at(BRANCH_A)),
      "11-F22 — she has moved to B and still authorizes these at A. Her row is RETAINED at A so " +
        "her name renders on last month's orders (`11-F20`); the status on THAT assignment is " +
        "the only thing that stops her selling there",
    ).toEqual([]);
    expect(misattributed(transferring, at(BRANCH_A))).toEqual([]);

    expect(
      notRefused(transferring, at(BRANCH_B)),
      "11-F22 — her deactivation at A followed her to B. That is the per-person reading, and it " +
        "is the one this FR overruled: a transfer is not a departure",
    ).toEqual(notRefused(subjectOf([active("cashier", BRANCH_B)]), at(BRANCH_B)));
  });

  it("11-F22 — the same subject answers DIFFERENTLY at the two branches (no single value can)", () => {
    // The FR's sentence as one assertion. Any implementation reading a single per-person fact
    // returns the same verdict at both scopes, whatever that fact is — so this row is false for
    // every such implementation and true only for one that reads the pair. It pins no cell: it
    // asserts that the two answers are not the same answer.
    const transferring = subjectOf([inactive("cashier", BRANCH_A), active("cashier", BRANCH_B)]);
    const atA = notRefused(transferring, at(BRANCH_A));
    const atB = notRefused(transferring, at(BRANCH_B));
    expect(
      atB.length,
      "24-F14 empty match — she is allowed nothing at EITHER branch, so `not equal` below would " +
        "be satisfiable by a matrix that refuses everyone",
    ).toBeGreaterThan(0);
    expect(
      atA,
      "11-F22 — one subject, one moment, and the two branches gave the same answer. The transfer " +
        "clause requires `inactive` in A's roster and `active` in B's AT THE SAME MOMENT, which " +
        "is precisely what a column on the person row cannot express",
    ).not.toEqual(atB);
  });

  it("11-F22 — the mirror direction: allowed at A, refused at B (B→A is not special)", () => {
    // The same claim with the branches swapped, so an implementation that reads `assignments[0]`,
    // or the last match, or the widest of the statuses, cannot pass by accident. One of the two
    // directions passes for such an implementation; both do not.
    const transferring = subjectOf([active("cashier", BRANCH_A), inactive("cashier", BRANCH_B)]);
    expect(
      notRefused(transferring, at(BRANCH_A)),
      "24-F14 empty match / 11-F22 — she works at A now and is allowed nothing there",
    ).toEqual(notRefused(subjectOf([active("cashier", BRANCH_A)]), at(BRANCH_A)));
    expect(
      notRefused(transferring, at(BRANCH_B)),
      "11-F22 — she has left B and still authorizes these there",
    ).toEqual([]);
  });

  it("11-F22 / 01-F26 — ORDER INDEPENDENCE: reversing the two assignments changes no answer", () => {
    // `01-F26` holds a per-user SET of (role, location) pairs, and a set has no first element.
    // With the status ON the pair this is a live hazard the per-person shape did not have: a guard
    // written as `subject.assignments[0].status !== "active"` or a `.find()` over the list decides
    // the transfer by array order, which is a wrong `allow` a fixture would never reproduce.
    const pairs = [inactive("cashier", BRANCH_A), active("cashier", BRANCH_B)];
    const reversed = [...pairs].reverse();
    for (const [where, scope] of [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
    ] as const) {
      expect(
        notRefused(subjectOf(pairs), scope),
        `11-F22 / 01-F26 — the answer at ${where} depends on which assignment is listed first`,
      ).toEqual(notRefused(subjectOf(reversed), scope));
    }
  });

  it("11-F22 / 05-F19 / 02-F23 — the drawer and the report split per branch too", () => {
    // Pinned interpretation 2 crossed with the transfer: `canPayOut` and `reportScope` take the
    // same subject and must answer per SCOPE, so a manager who has moved cannot take cash out of
    // the drawer she left or read its shift. A reader that consults a per-person fact gives her
    // both branches or neither.
    const transferring = subjectOf([
      inactive("branch_manager", BRANCH_A),
      active("branch_manager", BRANCH_B),
    ]);
    expect(
      canPayOut(transferring, at(BRANCH_B), UNDER).outcome,
      "24-F14 empty match — she is refused the drawer at the branch she has moved TO, so the " +
        "refusal at A below is not about `11-F22`",
    ).not.toBe("deny");
    expect(
      reportScope(transferring, at(BRANCH_B)),
      "24-F14 empty match — she has no report reach at the branch she has moved to",
    ).not.toBe("none");
    expect(
      canPayOut(transferring, at(BRANCH_A), UNDER).outcome,
      "11-F22 / 05-F19 — she still takes cash out of the drawer at the branch she has left",
    ).toBe("deny");
    expect(
      reportScope(transferring, at(BRANCH_A)),
      "11-F22 / 02-F23 — she still reads the shift cash of the branch she has left",
    ).toBe("none");
  });

  it("11-F22 — a DEPARTURE is inactive EVERYWHERE, and a transfer is not a departure", () => {
    // `11-F22`: "A person is departed when she is `inactive` in **every** branch that names her,
    // not when one branch deactivates her." Both halves are asserted, because the pair is the
    // claim: the departed subject authorizes nothing anywhere, and the transferring one — the
    // control — still authorizes something somewhere, so "refused everywhere" is not this suite's
    // default answer for anyone holding an inactive pair.
    const departed = subjectOf([
      inactive("cashier", BRANCH_A),
      inactive("cashier", BRANCH_B),
      inactive("owner", null),
    ]);
    const transferring = subjectOf([inactive("cashier", BRANCH_A), active("cashier", BRANCH_B)]);
    expect(
      notRefused(transferring, at(BRANCH_B)).length,
      "24-F14 empty match — a TRANSFERRING person is refused everywhere too, so the departure " +
        "below is this file refusing everyone rather than `11-F22` distinguishing the two cases",
    ).toBeGreaterThan(0);
    for (const [where, scope] of [
      ["branch A", at(BRANCH_A)],
      ["branch B", at(BRANCH_B)],
      ["the org-scoped request (no branch stated)", at(null)],
    ] as const) {
      expect(
        notRefused(departed, scope),
        `11-F22 — a person inactive in every branch that names her still authorizes these at ` +
          `${where}`,
      ).toEqual([]);
      expect(misattributed(departed, scope)).toEqual([]);
    }
  });

  it("11-F22 / 01-F78 — an org-wide ACTIVE hat survives a branch deactivation (interpretation 4)", () => {
    // ⚠ PINNED INTERPRETATION 4 — the one row-pair in this file whose direction is argued rather
    // than quoted, and the CONFLICT TO REPORT if an implementer reads it the other way.
    //
    // `01-F78` half one: a person's reach at a branch is "her own-branch assignments plus
    // `01-F26`'s org-wide ones (`branch_id: null`), which is how an owner holds Appendix A's
    // 'everything' and therefore how she unlocks a till at a branch she does not staff". So an
    // owner who ALSO held a cashier hat at A, and whose cashier hat is deactivated there, keeps
    // her owner authority at A: participation is on the pair, so deactivating one pair retires one
    // hat and not the person. The alternative reading — any inactive pair reaching this branch
    // refuses all of it — takes an owner's till away as a side effect of tidying a roster.
    const ownerWhoAlsoRang = subjectOf([active("owner", null), inactive("cashier", BRANCH_A)]);
    const ownerAlone = subjectOf([active("owner", null)]);
    expect(
      notRefused(ownerAlone, at(BRANCH_A)).length,
      "24-F14 empty match — an ACTIVE org-wide owner is allowed nothing at A",
    ).toBeGreaterThan(0);
    expect(
      notRefused(ownerWhoAlsoRang, at(BRANCH_A)),
      "11-F22 / 01-F78 — retiring her CASHIER hat at A took her ORG-WIDE owner authority with " +
        "it. Participation is carried on the (role, location) pair; an inactive pair contributes " +
        "no role and poisons no branch",
    ).toEqual(notRefused(ownerAlone, at(BRANCH_A)));
  });

  it("11-F22 — an org-wide INACTIVE hat contributes nothing, and the branch hat still stands", () => {
    // The fail-closed half of interpretation 4, and the half that makes it safe: the inactive pair
    // must not go on granting. A person whose ORG-WIDE owner assignment is inactive keeps exactly
    // her active branch cashier reach at A — not the owner's — and is refused outright at B, where
    // only the inactive pair reaches.
    const demoted = subjectOf([inactive("owner", null), active("cashier", BRANCH_A)]);
    const cashierAlone = subjectOf([active("cashier", BRANCH_A)]);
    expect(
      notRefused(cashierAlone, at(BRANCH_A)).length,
      "24-F14 empty match — an ACTIVE cashier at A is allowed nothing at A",
    ).toBeGreaterThan(0);
    expect(
      notRefused(demoted, at(BRANCH_A)),
      "11-F22 — her INACTIVE org-wide owner hat is still granting at A. `Only active " +
        "PARTICIPATES`, and Appendix A's widest-hat-wins ranges over the hats she may still wear",
    ).toEqual(notRefused(cashierAlone, at(BRANCH_A)));
    expect(
      notRefused(demoted, at(BRANCH_B)),
      "11-F22 — her INACTIVE org-wide owner hat reached branch B, where she has no active pair " +
        "at all",
    ).toEqual([]);
  });
});

// ── §10 — THE CONTROLS. GREEN BY DESIGN, credited as controls and not as coverage. ────────────

describe("11-F22 §10 — controls: an ACTIVE roster still runs a restaurant", () => {
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
        outcomes.add(can(subjectOf([active(role, BRANCH_A)]), action, at(BRANCH_A)).outcome);
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
      expect(notRefused(subjectOf([active(role, BRANCH_A)]), at(BRANCH_A)).length).toBeGreaterThan(
        0,
      );
      expect(notRefused(subjectOf([active(role, null)]), at(null)).length).toBeGreaterThan(0);
    });
  }

  it("GREEN BY DESIGN — the active pay-out and report readers are unmoved", () => {
    const manager = subjectOf([active("branch_manager", BRANCH_A)]);
    expect(canPayOut(manager, at(BRANCH_A), UNDER).outcome).not.toBe("deny");
    expect(canPayOut(manager, at(BRANCH_A), OVER).outcome).not.toBe("deny");
    expect(reportScope(manager, at(BRANCH_A))).not.toBe("none");
  });

  it("GREEN BY DESIGN — ORDER INDEPENDENCE: reordering ACTIVE assignments changes no answer", () => {
    // The brief's control. `01-F26` holds a per-user SET of (role, location) pairs; Appendix A's
    // "one person wears several hats" makes the widest of them decide. §9 asserts the same
    // property where it can go wrong; this asserts it where it is already true today, which is
    // what makes the suite's kill counts attributable rather than a measure of its own
    // brittleness (control C2).
    const hats = [active("cashier", BRANCH_A), active("owner", null)];
    const reversed = [...hats].reverse();
    expect(notRefused(subjectOf(hats), at(BRANCH_A))).toEqual(
      notRefused(subjectOf(reversed), at(BRANCH_A)),
    );
    const off = [inactive("cashier", BRANCH_A), inactive("owner", null)];
    expect(notRefused(subjectOf(off), at(BRANCH_A))).toEqual(
      notRefused(subjectOf([...off].reverse()), at(BRANCH_A)),
    );
  });

  it("GREEN BY DESIGN — 01-F26 / 01-F27: the pre-existing fail-closed axes are untouched", () => {
    // `11-F22` adds a refusal; it removes none. A guard placed so that it REPLACES the org check
    // or the no-assignment default would pass every §2 sweep and open two holes. Both of these
    // are already true today, which is why they are controls: they must stay true after.
    const foreignOwner = subjectOf([active("owner", null)], newId());
    expect(
      notRefused(foreignOwner, at(BRANCH_A)),
      "01-F71 / 01-F26 — an owner of ANOTHER org reached this org's actions",
    ).toEqual([]);
    const nobody = subjectOf([]);
    expect(
      notRefused(nobody, at(BRANCH_A)),
      "01-F27 — a device with nobody unlocked carries no role, so it authorizes nothing",
    ).toEqual([]);
  });
});
