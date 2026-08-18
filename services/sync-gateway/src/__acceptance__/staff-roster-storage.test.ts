// Acceptance tests — THE CLOUD STORAGE HALF OF THE STAFF ROSTER (`01-F75`, `01-F76`, `01-F77`,
// `01-F78`, `11-F21`, `11-F22`, `11-F23`, `01-F61`, R25/R26/R30).
//
// ⚠ **AUTHORED FROM SPEC TEXT ONLY, BY A SESSION THAT WROTE NO IMPLEMENTATION AND WILL NOT WRITE
// ONE** (`24 §3`). Every assertion below is traceable to a quoted clause in `specs/01-kernel-sync.md`
// or `specs/11-staff-people.md`, or to a ruling in `plans/saas-pivot/plan-of-record.md` §0. Nothing
// here was derived from an implementation's shape, because there is no implementation: measured
// 2026-08-17, `grep -arn "pin_hash|pinHash" services/` (non-test) is empty, `kernel.users` is eight
// columns with no version column, and no `/internal` route or gateway dispatch arm serves a roster.
//
// ── THE CONTRACTED SURFACE (binding on the implementation session) ───────────────────────────────
//
// `helpers.ts` already sets this precedent for this package ("CONTRACTED MODULE SURFACE (binding on
// the implementation session)"). The SYMBOL NAMES below are the contract; the FILE they live in is
// not, because no spec clause names a file. The loader looks for each name in `../staff.js`, then
// `../index.js`, then `../tenancy.js`, and fails naming every module it tried — so an implementer
// who puts the roster beside the catalog (`catalog.ts`'s obvious peer) and one who extends the
// existing tenancy writer both satisfy it, and neither is blocked on guessing a filename.
//
//   staffVersion(db, scope): Promise<number>
//       The org/branch artifact's current version. `0` = nothing has ever been published for this
//       key — the catalog's own meaning of 0 (`catalog.ts`), which `01-F75` says survives verbatim.
//
//   publishStaffRoster(db, scope, changed_user_ids, { now, actor_user_id? }): Promise<number>
//       Mints the NEXT version for THIS `01-F76` key and appends what changed at it, exactly as
//       `publishCatalog` "publish[es] a set of changes as the next version". The caller states WHICH
//       people changed and the publisher assembles their rows from storage — that split is forced by
//       two clauses pulling opposite ways: `11-F23` puts a `left join` to the credential table
//       INSIDE the publisher ("the publisher's `left join` produces the specified shape without a
//       branch"), while `01 §9.7` leaves *which people a branch's artifact contains* UNRULED and
//       `01-F76` says "nothing can select a roster's rows until it is ruled". A publisher that
//       selected its own members would be answering §9.7 in a query; one handed fully-formed rows
//       could not do `11-F23`'s join. Ids-in, rows-assembled-from-storage is the only shape both
//       clauses admit today.
//
//   staffPage(db, scope, have_version, from, at_version?): Promise<StaffPage>
//       `01-F75`'s response vocabulary, generic and unchanged from the catalog's:
//       `form: snapshot | delta` / `version` / `base_version?` / `entries[]` / `complete` /
//       `next_from`, and "the server sends a delta only if it can construct one from that exact
//       base and a snapshot otherwise".
//
//   setPinCredential(db, { org_id, user_id, pin_hash, now }): Promise<unknown>
//       `11-F23`'s separate writer for the separate credential table. It takes a HASH and never a
//       PIN (`11-F21`: "a PIN exists in exactly two places … the keypad it is typed on and the
//       argument to a verify call").
//
//   setUserStatus(db, { org_id, user_id, branch_id, status }): Promise<unknown>
//       `11-F22`'s participation transition, keyed by (PERSON, BRANCH). Needed here because the
//       version axis cannot be tested without a roster that CHANGES — `tenancy.ts` today says
//       "NOTHING HERE UPDATES OR DELETES".
//       ⚠ **AMENDED 2026-08-18.** This read `{ org_id, user_id, status }` when the suite was
//       authored at `b448975` — the per-PERSON reading `11-F22` has since ruled superseded (see
//       "WHAT MOVED UNDER THIS SUITE" below). `branch_id: null` addresses `01-F26`'s org-wide
//       assignment, which is already `01-F76`'s encoding for this axis; no test here supplies it,
//       because §9.7 is open (exclusion 1).
//
// The local `type` declarations below exist to give this file types and to state the contract in one
// place. **They are not oracle targets** — every assertion runs against the loaded PRODUCTION module
// (§A proves it loaded), never against a hand-copy. That is the `K-3` defect this repo names (an
// oracle that declared the interface it existed to deliver and then asserted against its own copy,
// leaving both oracle symbols dead), and it is why §A asserts the symbols are functions ON THE
// LOADED MODULE before anything else runs.
//
// ── ⚠ TRAP 8, WHICH IS WHAT MOST OF §C EXISTS FOR ───────────────────────────────────────────────
//
// `plans/saas-pivot/staff-over-the-wire.md`: *"Copying `catalogPage`'s SQL onto `kernel.users`."*
// The catalog's storage is an append-per-version publication log; `kernel.users` is CURRENT STATE
// with no version column, so a `distinct on … order by version desc` snapshot has nothing to run
// against. The fixture is therefore a roster **edited three times**. The single assertion that costs
// the most to fake is C6: a status that has been WRITTEN but not PUBLISHED is not in the artifact.
// An implementation that serves current state — the shape trap 8 predicts — answers the unpublished
// word and is green on every other test in this file.
//   ⚠ **AMENDED 2026-08-18.** That sentence read: "§C asks for versions that are neither 0 nor the
//   latest … at `at_version` 2 a member reads `active` and at version 3 the same member reads
//   `inactive`." `01-F75`'s continuation clause (`b47dcbe`, see below) forbids that REQUEST — a first
//   page is served the CURRENT version whatever it asks for — so C6 would now red a CORRECT
//   implementation. The CLAIM was re-homed, not dropped: the difference between a publication log and
//   today's rows is reachable at the current version through an edit that was never published, which
//   costs a current-state implementation exactly as much and depends on no `at_version` at all. The
//   historical fold is still asserted, on the continuation `at_version` still reaches (§M3).
//
// ── ⚠ WHAT MOVED UNDER THIS SUITE (amended 2026-08-18) ──────────────────────────────────────────
//
// This file was authored at `b448975` and sharpened at `1586dad`. **Two founder rulings and one FR
// disambiguation landed after both**, and AGENTS.md names by ID the trap that follows — a ruling
// lands, nobody greps the suites that encode the old rule, and a GREEN test goes on defending an
// overruled one. So the three are carried in here, each with what it displaced:
//
//  1. **`11-F22`: participation is per-(PERSON, BRANCH), not a column on the person row.** The FR
//     carried both readings — its heading says *"a PERSON RECORD carries a participation status"*
//     and its transfer clause requires a cashier moving A→B to be *"`inactive` in A's roster and
//     `active` in B's at the same moment"*, which a single per-person column cannot express. The
//     transfer clause is now stated as **the operative one** and the field lives where `01-F26`
//     already carries the relationship: **with the ASSIGNMENT**. What this displaced here is the
//     SHAPE of two writers, not the content of any rule — `setUserStatus` gains `branch_id`, and
//     an assignment carries the status that `insertUser` used to take once per row (§E2, §E3).
//     **The WIRE row is unchanged, and that is the point worth stating rather than assuming:**
//     `01-F75`'s `staff` row still carries exactly one `status`, because `01-F76` already makes the
//     artifact branch-scoped — so an entry's `status` IS that branch's participation, and the
//     per-(person, branch) reading costs the transport nothing. §C, §D, §E1 and §I are therefore
//     untouched by this amendment and are not weakened by it.
//  2. **R32 / `11-F23`: a deactivated person's PIN credential is DELETED**, the owner sets a new
//     one on re-activation — and the deletion is keyed to **the LAST active assignment going
//     inactive**, never to one branch's, *"or a transfer destroys the PIN the receiving branch
//     needs"*. This overrules exclusion 5 below, which recorded the question as open.
//  3. **`11-F23`: the status flip and the credential delete commit in ONE TRANSACTION.** *"A
//     dropped connection, statement timeout or process kill between two autocommit statements
//     leaves the person `inactive` holding a live credential — and the next re-activation then
//     restores her OLD PIN and publishes it to every till at the branch … Nothing queries for that
//     state, so it is found by the cashier who still gets in."*
//  4. **`01-F75`: `at_version` IS A CONTINUATION, NEVER A SELECTOR** (`b47dcbe`, amended into the FR
//     after an adversarial review measured what the other reading costs *on this resource*). The
//     rule, verbatim: *"`at_version` is honoured only on a CONTINUATION (`from > 0`), and a first
//     page is served the CURRENT version whatever it asks for."* **This suite was authored against
//     the forward-only clamp the catalog ships** (`at_version <= current`), which the FR now names as
//     the defect — *"correct for a menu, and this is the FR that made the same vocabulary carry
//     credentials"* — so three tests asked for a historical version on a FIRST page and would red a
//     correct implementation: **C6** (trap 8's assertion), **B3**'s "one number, two artifacts" pair
//     and **F4**'s sweep. Each records what moved and what did not. **§M is what the clause owns**,
//     including the half no assertion here reached: a departed cashier's Argon2id hash, frozen into
//     version 1 of the publication log and served to a brand-new till that asked for version 1.
//  5. **`01-F75`: A DELTA CARRIES THE FOLD AT ITS TARGET, NEVER THE INTERMEDIATE LOG ROWS**
//     (`6e30636`, amended into the FR after the same adversarial review re-measured item 4's leak
//     and found it still open through a different field). The rule, verbatim: *"a delta carries ONE
//     entry per changed id, the greatest version ≤ the target — the same fold a snapshot at that
//     version is, restricted to the ids that changed."* It supersedes the catalog's inherited
//     description of a delta as *"every published row with `A < version <= B`"*, which **C2's comment
//     quoted** — corrected there in the same change as this note, because a comment restating an
//     overruled rule is how the next session reintroduces it.
//     **Nothing in this suite could see the door it closes, and the reason is a FIXTURE property
//     rather than a missing assertion** — which is why it is written down here instead of being
//     quietly fixed: the main roster publishes bilal at v1 and at v3, so a window of
//     `1 < version <= 3` never contains his `active` row; §C2/§C3 assert a delta's IDS, which the
//     row-replay reading gets right, and never its entry COUNT; and §M's sweep varies `at_version`
//     with `have_version` pinned at **0**, so every page it inspects is a SNAPSHOT and no assertion
//     in it has ever crossed the delta path at all. **§N is what the clause owns**, on the first
//     fixture in this file with a publication STRICTLY BETWEEN a claimed base and the current
//     version.
//
// **§J (the transfer), §K (the departure) and §L (atomicity) are what those three now own.** Two
// notes on how they are written, both of which constrain a reader:
//
//   · §J/§K's person holds **two** assignments, which every other fixture in this file deliberately
//     avoids (exclusion 1). It is forced: `11-F22`'s worked example is a person in two artifacts at
//     one moment, so a one-assignment fixture cannot express the thing being tested. §9.7 is
//     respected by never asserting her `assignments` ARRAY — exclusion 2 is about that field, and it
//     is why §I3 asserts assignments only for a single-branch member.
//   · The contract carries **no assignment-creation surface**, and inventing one would be inventing
//     policy (commandment 2). So the transfer fixture creates both assignments at insert time, B's
//     starting `inactive`, and the TRANSFER is the pair of status flips. `11-F22` constrains the
//     STATE — *"at the same moment"* — and says nothing about how the second assignment arose; an
//     assignment that exists and is `inactive` is the departed-at-that-branch shape the FR requires
//     to exist anyway.
//
// ── WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT, AND WHY (commandment 2) ────────────────────────
//
// Each of these is UNRULED. Asserting either way would be inventing policy, and — worse for the
// implementer — an oracle that stays red under a correct implementation blocks them indefinitely
// (three shipped last round, `oracle-round-2-findings.md` §C).
//
//  1. ~~**WHICH PEOPLE a branch's artifact contains**~~ **ANSWERED 2026-08-18 by `01-F78`
//     (`67e9885`), and now asserted (§O1, §O2, §O3).** Every person holding an assignment that
//     REACHES this branch — her own-branch assignments plus `01-F26`'s org-wide ones — on
//     `rolesAt`'s existing predicate; a person assigned to two branches is in BOTH artifacts and a
//     person assigned only elsewhere is in NEITHER of this one's. **The FR is a PINNED
//     INTERPRETATION and says so**, so it is overturned by amending the FR and not by writing the
//     other shape in a publisher — which is exactly what this entry's blocking language failed to
//     stop the first time (`01 §9.7`'s own note: the sentence "was right and unenforceable; only an
//     FR the code can cite is either"). What this entry said, kept because it is why §A–§I are
//     shaped the way they are: `01 §9.7`, open, and `01-F76` says it "BLOCKS the build rather than
//     annotating it". So every fixture person here has EXACTLY ONE assignment, to her own branch,
//     which is the one case all three candidate readings agree on. No test publishes an org-wide
//     (`branch_id: null`) person into a branch artifact, and no test asserts that a person assigned
//     only to branch B is refused from branch A's artifact. §G asserts only the CROSS-ORG refusal,
//     which `01-F71` decides outright.
//     ⚠ **Every one of those assertions is still CORRECT and none is weakened**: a person with one
//     own-branch assignment is in her own branch's artifact under `01-F78` exactly as she was under
//     all three candidate readings. §O supplies the fixture shape they could not have — two
//     branches plus an org-wide assignment on one person — because neither half of `01-F78` is
//     visible through a person who holds one assignment.
//     ⚠ **Still NOT decided, and deliberately not asserted:** whether a publisher REFUSES an
//     out-of-reach person or drops her from the artifact. `01-F78` rules the artifact's CONTENT
//     ("absent from this artifact entirely") and says nothing about the writer's failure mode, so
//     §O3 asserts the content and passes under either mechanism.
//     ⚠ **AMENDED 2026-08-18 — §G6/§G7 ATTEMPT exactly the publish that sentence says no test makes,
//     and both are REFUSALS.** Neither asserts what a branch artifact CONTAINS, and no test anywhere
//     here accepts an org-wide publish, so §9.7 stays open in both directions. The org-wide assignee
//     is **forced** rather than chosen: `01-F26`'s null location is the only way a person has a
//     participation value at a branch id that names nothing, and a branch-assigned person is refused
//     one step earlier — for a §9.7-adjacent reason — so a probe built on her measures a different
//     guard and reports the wrong one as protected. That mis-attribution is why the refusals below
//     are matched on FR id and not merely on "it threw".
//     ⚠ **AMENDED again 2026-08-18 — §G8 inserts a person holding TWO assignments, which this
//     sentence otherwise forbids.** It is forced for the same reason §J/§K's transfer is: the claim
//     is *"every assignment, not the first"* (`01-F26`), and a one-assignment fixture cannot express
//     a LATER one. Its refusal legs write nothing at all, and its acceptance control is never
//     published into any artifact, so nothing here asserts what a branch artifact CONTAINS and §9.7
//     is untouched in both directions.
//  2. ~~**Whether a row carries ALL of a person's assignments or only this artifact's**~~
//     **ANSWERED 2026-08-18 by `01-F78`, and now asserted (§O4, §O5): only the assignments that
//     reach this branch, never all of them.** This is the half `01 §9.7` said was decided inside a
//     query, and the FR names what the other answer costs — *"a row carrying every branch's
//     assignment also tells every till the org's branch structure"*, `01-F71`'s isolation boundary
//     crossed by a reference-data artifact, and *"the half R25 was bought for"*. What this entry
//     said: the second half of §9.7, same clause; for a single-branch person the two readings are
//     identical, which is why §I3 is assertable at all. **§I3 is untouched and still correct** —
//     see its own note.
//  3. **Whether a non-`active` member's `grid_ordinal` stays reserved.** `01-F75` makes the ordinal
//     unique "within the artifact" and `11-F22` keeps departed members in it, but nothing says
//     whether a new hire may take a departed cashier's position. Every ordinal-collision fixture in
//     §F uses two ACTIVE members.
//  4. **Whether the cloud enforces ordinal uniqueness more widely than the artifact.** `01-F75`:
//     "whether the cloud enforces uniqueness more widely than that is a storage choice this FR does
//     not make." So §F asserts the INVARIANT (no published artifact ever contains two entries at one
//     ordinal) rather than which layer refuses, and no fixture ever needs two branches to reuse an
//     ordinal — the ids are globally distinct, so a stricter storage choice passes too.
//  5. ~~**What happens to the credential row when status leaves `active`**~~ **SUPERSEDED 2026-08-18
//     by founder ruling R32, transcribed into `11-F23`: the row is DELETED and the owner sets a new
//     PIN on re-activation.** What this entry said, kept because it is what §D3 and §C6 were written
//     against: `11-F23` named the question undecided ("deleted, retained, or retained-and-unreachable
//     … deleting the row is the obvious implementation and is not obviously right"), so §D3 asserted
//     the PROJECTION (an inactive member's entry carries no hash) and never the row, and §C6 was
//     deliberately about `status` and not about a hash so that either answer passed. **Both of those
//     assertions are still CORRECT** — the projection rule is `11-F21`'s and R32 did not move it.
//     ⚠ §D3 is untouched; **§C6 was rewritten on 2026-08-18** for a different reason entirely
//     (item 4 below), and the `status`-not-hash scoping it recorded here is exactly the gap §M was
//     written to close — see §M's header, which reads that scoping as archaeology rather than as a
//     rule. What changed is that the ROW is now decided, and §K2 asserts it: the only
//     surface this contract has for observing a credential row's existence is a re-activation, which
//     is also exactly the act R32 exists to protect.
//  6. ~~**Whether an ACTIVE member with no credential row may be published at all**~~ **ANSWERED by
//     R32's own sentence, 2026-08-18, and now asserted (§K2).** R32 makes re-activation *"a two-step
//     act (flip the status, then set a PIN)"*, and `11-F23` describes the skipped second step as
//     *"a member who is `active` with no credential row is a tile that cannot be unlocked"* — a tile
//     exists, so `01-F61`'s grid was served her, so the artifact carried her. A publisher that
//     refused would make step one unpublishable and the two-step act unperformable in the order the
//     ruling states. §F's fixtures (F2, F3) already required this and this entry did not say so.
//     ⚠ **Still NOT asserted, and deliberately: WHERE that state fails legibly.** `11-F23` requires
//     it to "fail LEGIBLY rather than silently" and names no surface; the tile and the unlock flow
//     are doc 02's and doc 14's, not this storage layer's.
//  7. **Whether publication is immediate or staged to `01-F46`'s boundary** — `01-F75` (i) leaves it
//     to `01 §9.5`, and R27 rules the POLICY while explicitly leaving the MECHANISM open. Every
//     publish here is called directly, and no test asserts anything about when it happens.
//
// ⚠ Needs Docker (Testcontainers). Fails LOUDLY rather than skipping (`T-01-07`).

import { hashPin, newId, verifyPin } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogEntry, catalogPage, catalogVersion, publishCatalog } from "../catalog.js";
import { insertBranch, insertOrg, insertUser, listUsers, type UserRow } from "../tenancy.js";
import { BASE_T, closeDb, type Db, openDb } from "./helpers.js";

/* ── the contracted surface ──────────────────────────────────────────────────────────────────── */

/**
 * `01-F76`'s artifact scope: "The shape is `{ org_id, branch_id }`, with `branch_id: null` meaning
 * ORG scope — ONE shape for every resource and not one per resource", and a STRUCTURED value
 * "never … a concatenation" (`01-F71` (d)).
 */
type StaffScope = { readonly org_id: string; readonly branch_id: string | null };

/** `01-F75`'s declared `staff` row ("declared here because a golden fixture cannot be written without it"). */
type StaffEntry = {
  readonly user_id: string;
  readonly display_name: string;
  readonly grid_ordinal: number;
  readonly status: string;
  readonly assignments: readonly { readonly role: string; readonly branch_id: string | null }[];
  /** `11-F21` — present ONLY on an `active` member; its ABSENCE on a non-active one is the shape. */
  readonly pin_hash?: string;
};

type StaffPage = {
  readonly form: "snapshot" | "delta";
  readonly version: number;
  readonly base_version?: number;
  readonly entries: readonly StaffEntry[];
  readonly complete: boolean;
  readonly next_from: number;
};

type StaffStorage = {
  staffVersion(db: Db, scope: StaffScope): Promise<number>;
  publishStaffRoster(
    db: Db,
    scope: StaffScope,
    changed_user_ids: readonly string[],
    opts: { now: number; actor_user_id?: string | null },
  ): Promise<number>;
  staffPage(
    db: Db,
    scope: StaffScope,
    have_version: number,
    from: number,
    at_version?: number,
  ): Promise<StaffPage>;
  setPinCredential(
    db: Db,
    args: { org_id: string; user_id: string; pin_hash: string; now: number },
  ): Promise<unknown>;
  setUserStatus(
    db: Db,
    args: { org_id: string; user_id: string; branch_id: string | null; status: string },
  ): Promise<unknown>;
};

const REQUIRED = [
  "staffVersion",
  "publishStaffRoster",
  "staffPage",
  "setPinCredential",
  "setUserStatus",
] as const;

/**
 * Typed `readonly string[]` and NOT a literal tuple on purpose: with literal types TypeScript
 * resolves each specifier at compile time and `../staff.js` is a hard `TS2307` until step 3 lands,
 * which takes the whole FILE down as "no tests" instead of as named failures. That failure mode is
 * itself a finding in this plan's oracle round ("`readFileSync` at `describe` scope takes a whole
 * file down as `Tests: no tests` rather than as a named failure"), and it is the difference between
 * an implementer reading a contract and an implementer reading a stack trace.
 */
const CONTRACT_MODULES: readonly string[] = ["../staff.js", "../index.js", "../tenancy.js"];

let contract: StaffStorage | undefined;

/** Resolve the contracted surface from PRODUCTION modules. Called per test so each fails by name. */
const staff = async (): Promise<StaffStorage> => {
  if (contract !== undefined) return contract;
  const found: Record<string, unknown> = {};
  const tried: string[] = [];
  for (const specifier of CONTRACT_MODULES) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(specifier)) as Record<string, unknown>;
    } catch (cause) {
      tried.push(`${specifier} — not loadable (${String(cause).split("\n")[0]})`);
      continue;
    }
    tried.push(specifier);
    for (const name of REQUIRED) {
      if (found[name] === undefined && typeof mod[name] === "function") found[name] = mod[name];
    }
  }
  const missing = REQUIRED.filter((name) => found[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `the staff-roster storage surface is not implemented: ${missing.join(", ")} were not ` +
        `exported by any of [${tried.join(" | ")}]. This suite is the oracle for step 3 of ` +
        "plans/saas-pivot/staff-over-the-wire.md (01-F75/01-F76/11-F21/11-F22/11-F23); the names " +
        "are the contract and the module is not — export them from whichever of those files is " +
        "their home.",
    );
  }
  contract = found as unknown as StaffStorage;
  return contract;
};

/* ── fixtures ────────────────────────────────────────────────────────────────────────────────── */

let db: Db;
beforeAll(() => {
  db = openDb();
});
afterAll(async () => {
  await closeDb(db);
});

const T = BASE_T;

/** One back-office credential, hashed once: `hashPin` is deliberately ~0.4 s (`01-F61`'s floor). */
let backOfficeHash: string | undefined;
const password = async (): Promise<string> => {
  backOfficeHash ??= await hashPin("back-office-secret-not-a-pin");
  return backOfficeHash;
};

/**
 * `01-F26`'s assignment as this suite supplies it. **`status` sits HERE and not on the person row
 * (`11-F22`, amended 2026-08-18)** — participation is per-(person, branch) and is carried "where
 * `01-F26` already carries the relationship". `addPerson` defaults it to `active`, so only the
 * fixtures that are ABOUT participation have to state it.
 */
type AssignmentInput = { role: string; branch_id: string | null; status?: string };

type PersonInput = {
  user_id?: string;
  org_id: string;
  display_name: string;
  email?: string | null;
  grid_ordinal: number;
  assignments: readonly AssignmentInput[];
};

/**
 * Insert one person through the PRODUCTION writer (`18 §4`: `kernel.users` has exactly one writer
 * service and this is its function). The cast is `publishCatalog`'s own precedent — "the check is
 * written through a cast, which is the only honest way to ask a question the type says cannot
 * arise": `UserRow.email` is `string` and `PersonRecord`'s assignment carries no `status` TODAY,
 * and both change under R30 and `11-F22`.
 *
 * ⚠ **AMENDED 2026-08-18.** This helper used to take a per-person `status` and write it as a column
 * on the row. `11-F22` has since ruled the per-(person, branch) reading operative, so the status
 * travels on each assignment.
 *
 * **An OMITTED email means "give her one"; only an explicit `null` is R30's till-only cashier.**
 * The default is deliberately not `null`: every §E/§F/§G fixture would then depend on R30's
 * migration having landed, and a test that fails on a neighbouring FR's constraint reports the
 * wrong debt. §H owns the null case and varies it on purpose (`oracle-round-2-findings.md` §C's
 * first pattern — "an email always present" is exactly the input a staff fixture forgets to vary).
 */
const addPerson = async (person: PersonInput): Promise<string> => {
  const user_id = person.user_id ?? newId();
  const row = {
    user_id,
    org_id: person.org_id,
    display_name: person.display_name,
    email: person.email === undefined ? `person-${user_id}@example.com` : person.email,
    password_hash: await password(),
    assignments: person.assignments.map((assignment) => ({
      role: assignment.role,
      branch_id: assignment.branch_id,
      status: assignment.status ?? "active",
    })),
    grid_ordinal: person.grid_ordinal,
    created_at: T,
  };
  const written = await insertUser(db, row as unknown as UserRow);
  if (!written) throw new Error(`fixture: insertUser refused ${person.display_name}`);
  return user_id;
};

const addOrg = async (org_id: string): Promise<void> => {
  await insertOrg(db, {
    org_id,
    display_name: `Org ${org_id.slice(0, 8)}`,
    status: "active",
    created_at: T,
  });
};

const addBranch = async (org_id: string, branch_id: string): Promise<void> => {
  await insertBranch(db, {
    branch_id,
    org_id,
    display_name: `Branch ${branch_id.slice(0, 8)}`,
    branch_type: "branch",
    branch_class: "production",
    created_at: T,
  });
};

const byId = (page: StaffPage, user_id: string): StaffEntry | undefined =>
  page.entries.find((entry) => entry.user_id === user_id);

const ids = (page: StaffPage): string[] => page.entries.map((entry) => entry.user_id).sort();

/**
 * `byId` that FAILS rather than returning `undefined`. Every §J/§K/§L assertion about an entry's
 * shape — above all `Object.hasOwn(entry, "pin_hash") === false` — passes vacuously against a
 * missing entry, which is the "guard never pointed at the dangerous case" pattern this repo's
 * round-3 law exists to catch. Going through this helper makes an absent member a named failure.
 */
const entryOf = (page: StaffPage, user_id: string, label: string): StaffEntry => {
  const entry = byId(page, user_id);
  if (entry === undefined) {
    throw new Error(
      `${label}: the artifact does not contain ${user_id} — a departure is a MARKED ENTRY and ` +
        "never an absence (`01-F75`, `11-F22`, R26)",
    );
  }
  return entry;
};

/** `11-F21`'s active-only rule as a predicate: the hash is ABSENT on a non-`active` entry, not null. */
const carriesHash = (entry: StaffEntry): boolean => Object.hasOwn(entry, "pin_hash");

/**
 * THE MAIN FIXTURE — one org, two branches, and branch A's roster **edited three times**.
 *
 * Built once and memoized rather than in `beforeAll`, so that a missing contract fails each test
 * with the loader's message instead of collapsing the file into one hook error.
 *
 *   v1  ayesha (10), bilal (20), hina (30)   — three people, all active, all with a PIN credential
 *   v2  danish (40) joins                    — one changed member, not the whole roster
 *   v3  bilal goes `inactive` AT BRANCH A     — a departure is a MARKED ENTRY, never an absence.
 *       (`11-F22`)                             Branch A is bilal's ONLY assignment, so this is also
 *                                              his last active one and R32's credential deletion
 *                                              fires here; §J/§K own the case where it must NOT.
 *
 * Branch B holds one person and is published ONCE, so its version number (1) is a number branch A
 * also has and means different bytes — `01-F76`'s whole point, and the thing an org-wide counter
 * cannot express.
 */
type MainFixture = {
  org: string;
  branchA: string;
  branchB: string;
  scopeA: StaffScope;
  scopeB: StaffScope;
  ayesha: string;
  bilal: string;
  hina: string;
  danish: string;
  sana: string;
  ayeshaPin: string;
  /** Bilal's PIN before his departure. R32 deletes the credential row at v3; §M2 is what that means. */
  bilalPin: string;
  bilalPinHash: string;
};

let mainFixture: Promise<MainFixture> | undefined;

const buildMain = async (): Promise<MainFixture> => {
  const api = await staff();
  const org = `org-main-${newId()}`;
  const branchA = `branch-a-${newId()}`;
  const branchB = `branch-b-${newId()}`;
  await addOrg(org);
  await addBranch(org, branchA);
  await addBranch(org, branchB);

  const scopeA: StaffScope = { org_id: org, branch_id: branchA };
  const scopeB: StaffScope = { org_id: org, branch_id: branchB };

  const ayesha = await addPerson({
    org_id: org,
    display_name: "Ayesha Khan",
    email: null,
    grid_ordinal: 10,
    assignments: [{ role: "cashier", branch_id: branchA }],
  });
  const bilal = await addPerson({
    org_id: org,
    display_name: "Bilal Ahmed",
    email: null,
    grid_ordinal: 20,
    assignments: [{ role: "cashier", branch_id: branchA }],
  });
  const hina = await addPerson({
    org_id: org,
    display_name: "Hina Qureshi",
    email: `hina-${newId()}@example.com`,
    grid_ordinal: 30,
    assignments: [{ role: "branch_manager", branch_id: branchA }],
  });
  const sana = await addPerson({
    org_id: org,
    display_name: "Sana Iqbal",
    email: null,
    grid_ordinal: 110,
    assignments: [{ role: "cashier", branch_id: branchB }],
  });

  const ayeshaPin = "8461";
  const bilalPin = "2793";
  const bilalPinHash = await hashPin(bilalPin);
  await api.setPinCredential(db, {
    org_id: org,
    user_id: ayesha,
    pin_hash: await hashPin(ayeshaPin),
    now: T,
  });
  await api.setPinCredential(db, { org_id: org, user_id: bilal, pin_hash: bilalPinHash, now: T });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: hina,
    pin_hash: await hashPin("5320"),
    now: T,
  });

  const v1 = await api.publishStaffRoster(db, scopeA, [ayesha, bilal, hina], { now: T });
  if (v1 !== 1) throw new Error(`fixture: first publish minted version ${v1}, expected 1`);

  const danish = await addPerson({
    org_id: org,
    display_name: "Danish Raza",
    email: null,
    grid_ordinal: 40,
    assignments: [{ role: "cashier", branch_id: branchA }],
  });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: danish,
    pin_hash: await hashPin("6108"),
    now: T + 1,
  });
  const v2 = await api.publishStaffRoster(db, scopeA, [danish], { now: T + 1 });
  if (v2 !== 2) throw new Error(`fixture: second publish minted version ${v2}, expected 2`);

  await api.setUserStatus(db, {
    org_id: org,
    user_id: bilal,
    branch_id: branchA,
    status: "inactive",
  });
  const v3 = await api.publishStaffRoster(db, scopeA, [bilal], { now: T + 2 });
  if (v3 !== 3) throw new Error(`fixture: third publish minted version ${v3}, expected 3`);

  await api.setPinCredential(db, {
    org_id: org,
    user_id: sana,
    pin_hash: await hashPin("4275"),
    now: T,
  });
  await api.publishStaffRoster(db, scopeB, [sana], { now: T + 3 });

  return {
    org,
    branchA,
    branchB,
    scopeA,
    scopeB,
    ayesha,
    bilal,
    hina,
    danish,
    sana,
    ayeshaPin,
    bilalPin,
    bilalPinHash,
  };
};

const main = (): Promise<MainFixture> => {
  mainFixture ??= buildMain();
  return mainFixture;
};

/* ── §A the contracted surface exists ────────────────────────────────────────────────────────── */

describe("§A — the surface this suite drives is the PRODUCT's, not this file's", () => {
  it("A1 exports every contracted symbol as a function from a production module", async () => {
    const api = await staff();
    for (const name of REQUIRED) {
      expect(typeof (api as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("A2 reports version 0 for a key nothing has ever published to, and serves no rows", async () => {
    // `catalog.ts`: "`0` means nothing has ever been published", and `01-F77` keeps that meaning per
    // key — "an artifact for which the org has published nothing is omitted, never sent as `0`".
    const api = await staff();
    const scope: StaffScope = { org_id: `org-empty-${newId()}`, branch_id: `branch-${newId()}` };
    expect(await api.staffVersion(db, scope)).toBe(0);
    const page = await api.staffPage(db, scope, 0, 0);
    expect(page.entries).toEqual([]);
    expect(page.version).toBe(0);
  });
});

/* ── §B the version axis is per (resource, scope) ────────────────────────────────────────────── */

describe("§B — `01-F76`: an artifact is (resource, scope), and a version is meaningless without it", () => {
  it("B1 counts versions PER BRANCH: three publishes to A leave B at one, not at four", async () => {
    const fx = await main();
    const api = await staff();
    expect(await api.staffVersion(db, fx.scopeA)).toBe(3);
    expect(await api.staffVersion(db, fx.scopeB)).toBe(1);
  });

  it("B2 serves each branch its OWN people and never the other branch's", async () => {
    // `01-F71` (d): the key is structured and per-tenant; `01-F76`: "a branch-scoped notice reaches
    // that branch's devices and no others", and under R25 "the roster's scope IS its credential
    // blast radius".
    const fx = await main();
    const api = await staff();
    const a = await api.staffPage(db, fx.scopeA, 0, 0);
    const b = await api.staffPage(db, fx.scopeB, 0, 0);
    expect(ids(a)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
    expect(ids(b)).toEqual([fx.sana]);
  });

  it("B3 treats one branch's version number as meaningless for another: A's v3 is neither B's base nor B's bytes", async () => {
    // "Two devices both at 'staff v7' hold different bytes when they are at different branches —
    // safe ONLY because the key travels with the number and is compared." A device holding branch
    // A's version 3 that asked branch B's artifact must not be handed a delta from a base B never
    // published; `01-F75`'s inherited rule sends "a delta only if it can construct one from that
    // exact base and a snapshot otherwise".
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeB, 3, 0);
    expect(page.form).toBe("snapshot");
    expect(ids(page)).toEqual([fx.sana]);

    // ⚠ AND THE HALF THAT FIXTURE CANNOT REACH, WHICH IS THE ONE `01-F76`'s SENTENCE IS ABOUT.
    // Branch B is at version 1 there, so what refuses above is "3 is a base nobody published" —
    // C5's claim, not this one. MEASURED: a delta-base check that keeps its version predicate and
    // drops its SCOPE predicate passes every assertion above, because `have_version <= current`
    // refuses first and the scope is never reached. The FR is about a number BOTH branches have
    // REACHED, so the rest of this test carries two branches to the same version, where the scope
    // of the query is the only thing left that can keep them apart.
    //
    // It is B3's OWN fixture and not an extension of the main one, because B1 asserts branch B is
    // at version ONE ("three publishes to A leave B at one, not at four") — publishing B further
    // would move another test's expected value.
    const org = `org-b3-${newId()}`;
    const left = `branch-b3-left-${newId()}`;
    const right = `branch-b3-right-${newId()}`;
    await addOrg(org);
    await addBranch(org, left);
    await addBranch(org, right);
    const scopeLeft: StaffScope = { org_id: org, branch_id: left };
    const scopeRight: StaffScope = { org_id: org, branch_id: right };
    // ONE hash for the four of them, computed once — `hashPin` is deliberately ~0.4 s (`01-F61`'s
    // floor) and nothing here reads a hash (D2/D6 own that claim). Every one of them still CARRIES
    // a credential row: whether an `active` member with no credential may be published at all is
    // unruled (§6 of the header), and a fixture that took a side would red a correct implementation.
    const pin = await hashPin("7391");
    const person = async (branch: string, name: string, ordinal: number): Promise<string> => {
      const user_id = await addPerson({
        org_id: org,
        display_name: name,
        email: null,
        grid_ordinal: ordinal,
        assignments: [{ role: "cashier", branch_id: branch }],
      });
      await api.setPinCredential(db, { org_id: org, user_id, pin_hash: pin, now: T });
      return user_id;
    };
    // No ordinal repeats ACROSS the two branches: `01-F75` leaves a wider uniqueness rule to
    // storage (§4 of the header), so a stricter choice than per-artifact must pass this too.
    const leftOne = await person(left, "Left One", 10);
    const leftTwo = await person(left, "Left Two", 20);
    const rightOne = await person(right, "Right One", 110);
    const rightTwo = await person(right, "Right Two", 120);
    // Both rosters carried to FOUR versions, so 3 is a number both branches have reached — the
    // `have_version <= current` guard cannot be what answers, and version 4 gives the delta from
    // base 3 something to carry.
    const publishFour = async (scope: StaffScope, one: string, two: string): Promise<void> => {
      expect(await api.publishStaffRoster(db, scope, [one], { now: T })).toBe(1);
      expect(await api.publishStaffRoster(db, scope, [two], { now: T + 1 })).toBe(2);
      expect(await api.publishStaffRoster(db, scope, [one], { now: T + 2 })).toBe(3);
      expect(await api.publishStaffRoster(db, scope, [two], { now: T + 3 })).toBe(4);
    };
    await publishFour(scopeLeft, leftOne, leftTwo);
    await publishFour(scopeRight, rightOne, rightTwo);

    // One number, two artifacts, different bytes — the FR's own sentence, at a version both hold.
    //
    // ⚠ **AMENDED 2026-08-18 — the two calls below asked `at_version: 3` and expected `version: 3`.**
    // `01-F75`'s continuation clause (`b47dcbe`) serves a FIRST page (`from: 0`) the CURRENT version
    // whatever it asks for, so the old form would red a correct implementation at `version: 4`. **The
    // claim this test owns is untouched** — it needs *a number both branches have reached*, and 4 is
    // one: both were carried to four versions eight lines above, precisely so no `have_version <=
    // current` guard can be what keeps them apart. The clause itself is §M's, not B3's.
    const leftAtFour = await api.staffPage(db, scopeLeft, 0, 0);
    const rightAtFour = await api.staffPage(db, scopeRight, 0, 0);
    expect(leftAtFour.version).toBe(4);
    expect(rightAtFour.version).toBe(4);
    expect(ids(leftAtFour)).toEqual([leftOne, leftTwo].sort());
    expect(ids(rightAtFour)).toEqual([rightOne, rightTwo].sort());

    // And a device at 3 is continued from the log of the branch it ASKED: the delta carries what
    // that branch published at 4 and never what the other branch did. A device that applied the
    // other branch's edits onto its own roster would be holding people it must never authenticate
    // — R25's blast radius, crossed by a missing predicate rather than by a missing check.
    const delta = await api.staffPage(db, scopeRight, 3, 0);
    expect(delta.form).toBe("delta");
    expect(delta.base_version).toBe(3);
    expect(ids(delta)).toEqual([rightTwo]);
  });

  it("B4 keys the artifact STRUCTURALLY: ('X-ab','c') and ('X-a','bc') are different artifacts", async () => {
    // `01-F71` (d), quoted by `01-F76`: "`(\"ab\",\"c\")` and `(\"a\",\"bc\")` are distinct tenants
    // and a separator-less key maps both to one delivery set, which is a cross-tenant leak with no
    // error in it." The suffix keeps every id unique per run while the two concatenations collide.
    const api = await staff();
    const s = newId();
    const orgOne = `${s}ab`;
    const orgTwo = `${s}a`;
    const branchOne = `c${s}`;
    const branchTwo = `bc${s}`;
    expect(`${orgOne}${branchOne}`).toBe(`${orgTwo}${branchTwo}`);
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgOne, branchOne);
    await addBranch(orgTwo, branchTwo);
    const personOne = await addPerson({
      org_id: orgOne,
      display_name: "One Only",
      email: null,
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: branchOne }],
    });
    // A PIN hash of its own and never `password()`: `11-F21` makes the device-plane credential "a
    // SECOND credential beside the back-office password (`15-F26`), not the same one", and a fixture
    // that reuses one string for both quietly asserts the shape the FR refuses.
    await api.setPinCredential(db, {
      org_id: orgOne,
      user_id: personOne,
      pin_hash: await hashPin("3131"),
      now: T,
    });
    await api.publishStaffRoster(db, { org_id: orgOne, branch_id: branchOne }, [personOne], {
      now: T,
    });

    expect(await api.staffVersion(db, { org_id: orgTwo, branch_id: branchTwo })).toBe(0);
    const other = await api.staffPage(db, { org_id: orgTwo, branch_id: branchTwo }, 0, 0);
    expect(ids(other)).toEqual([]);
  });

  it("B5 keeps the roster and the catalog on separate version axes and out of each other's frames", async () => {
    // Trap 2: `CatalogEntryWire.kind` is open at the wire, so a `kind: "staff"` row would publish and
    // then make every catalog update in the org `malformed` (`01-F56`) — "a credential-blast-radius
    // change wearing a save". `01-F52` keeps the catalog ORG-scoped; `01-F76` keeps the roster
    // BRANCH-scoped; two resources, two axes, one connection.
    const fx = await main();
    const api = await staff();
    expect(await catalogVersion(db, fx.org)).toBe(0);

    const priced: CatalogEntry = {
      kind: "item",
      id: `item-${newId()}`,
      name: "Chicken Biryani",
      prices: [{ branch_id: fx.branchA, channel: "counter", price_paisa: 45_000 }],
    };
    const catalogV = await publishCatalog(db, fx.org, [priced], {
      now: T + 10,
      enabled: { branches: [fx.branchA], channels: ["counter"] },
    });
    expect(catalogV).toBe(1);

    // The roster's axis did not move, and neither artifact carries the other's rows.
    expect(await api.staffVersion(db, fx.scopeA)).toBe(3);
    const menu = await catalogPage(db, fx.org, 0, 0);
    const menuIds = menu.entries.map((entry) => entry.id);
    expect(menuIds).toEqual([priced.id]);
    for (const person of [fx.ayesha, fx.bilal, fx.hina, fx.danish]) {
      expect(menuIds).not.toContain(person);
    }
    const roster = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(ids(roster)).not.toContain(priced.id);
  });
});

/* ── §C snapshot, delta, and the fold (trap 8) ───────────────────────────────────────────────── */

describe("§C — `01-F75`: snapshot or delta, per key, from an actual publication log", () => {
  it("C1 answers a device at 0 with a folded SNAPSHOT of the whole roster, each member once", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(3);
    expect(page.complete).toBe(true);
    expect(ids(page)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
    // The fold, not the log: bilal was published at v1 AND at v3 and appears once.
    expect(page.entries.filter((entry) => entry.user_id === fx.bilal)).toHaveLength(1);
  });

  it("C2 answers a device at version 2 with a DELTA that is one member, not the roster", async () => {
    // The money assertion. Only what changed at v3 travels: an implementation that always answers a
    // snapshot passes C1 and dies here.
    //
    // ⚠ **COMMENT AMENDED 2026-08-18 — THE ASSERTION IS UNTOUCHED.** This read: *"A delta from
    // version A to B is `A < version <= B`"*, the catalog's inherited description, which `01-F75`
    // OVERRULED at `6e30636` — a delta is the fold at its target restricted to the changed ids, and
    // the row-replay reading it describes is a credential leak on this resource (§N). The two
    // readings agree on this test's `ids()` and differ only in the entry COUNT, which is why nothing
    // here went red and why the sentence had to be corrected by hand: a green test whose comment
    // states an overruled rule is the trap AGENTS.md names by ID.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 2, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(2);
    expect(page.version).toBe(3);
    expect(ids(page)).toEqual([fx.bilal]);
  });

  it("C3 answers a device at version 1 with the two members that changed after it", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 1, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(1);
    expect(page.version).toBe(3);
    expect(ids(page)).toEqual([fx.bilal, fx.danish].sort());
  });

  it("C4 answers a device already at the current version with an empty delta", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 3, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(3);
    expect(page.entries).toEqual([]);
  });

  it("C5 answers a base it never published — a device from the future — with a snapshot", async () => {
    // `catalog.ts`'s inherited rule: "A device claiming a version we never published gets a
    // snapshot, which is also what happens to a device from the future after a restore" (`22`).
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 99, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(3);
    expect(ids(page)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
  });

  it("C6 serves the PUBLISHED row and never today's storage: an unpublished edit is not in the artifact", async () => {
    // ⚠ TRAP 8 IN ONE ASSERTION. `kernel.users` is current state; the artifact is a publication log.
    // `01-F75`: "a write that changes an artifact **mints the next version**" — so a write that has
    // minted no version has not changed the artifact, and a device holding the current version must
    // be holding the bytes that were published under that number. An implementation that reads
    // current state serves the unpublished word under an unchanged version, which `01-F56`'s
    // monotonic apply cannot detect **because the number it compares is right** — the device never
    // re-fetches a version it holds, so the divergence is silent and permanent.
    //
    // ⚠ **AMENDED 2026-08-18 — this test asked for `at_version: 2` and `at_version: 1` on a FIRST
    // page and asserted the historical fold.** `01-F75` gained a clause at `b47dcbe` forbidding that
    // request outright ("a first page is served the CURRENT version whatever it asks for"), so the
    // old form would now red a CORRECT implementation on its first assertion. **The claim is
    // unchanged** and is asserted where the clause cannot reach it; the historical fold itself is
    // §M3's, on the continuation `at_version` still serves. See the header's item 4.
    const api = await staff();
    const org = `org-c6-${newId()}`;
    const branch = `branch-c6-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const person = await addPerson({
      org_id: org,
      display_name: "Unpublished Edit",
      email: null,
      grid_ordinal: 8,
      assignments: [{ role: "cashier", branch_id: branch, status: "active" }],
    });
    await api.setPinCredential(db, {
      org_id: org,
      user_id: person,
      pin_hash: await hashPin("4471"),
      now: T,
    });
    expect(await api.publishStaffRoster(db, scope, [person], { now: T })).toBe(1);

    // The edit lands in storage and NOTHING publishes it. (Nothing here asserts a hash: R32 deletes
    // her credential row on this flip, and whether the published row froze its copy or joins at
    // serve time is a storage choice `11-F23` leaves open — D3 and §L3 own the hash rule.)
    await api.setUserStatus(db, {
      org_id: org,
      user_id: person,
      branch_id: branch,
      status: "inactive",
    });
    const held = await api.staffPage(db, scope, 0, 0);
    expect(held.version).toBe(1);
    expect(entryOf(held, person, "C6 unpublished").status).toBe("active");

    // ⚠ THE ANTI-VACUITY LEG. Without it, "still `active`" is satisfied by a `setUserStatus` that
    // wrote nothing at all. One publish later the same read moves, so the assertion above is about
    // PUBLICATION and not about a writer that does nothing.
    expect(await api.publishStaffRoster(db, scope, [person], { now: T + 1 })).toBe(2);
    const published = await api.staffPage(db, scope, 0, 0);
    expect(published.version).toBe(2);
    expect(entryOf(published, person, "C6 published").status).toBe("inactive");
  });

  it("C7 folds the CURRENT version to the departed member's latest row", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(byId(page, fx.bilal)?.status).toBe("inactive");
  });

  it("C8 never serves a version from the future: an `at_version` beyond current is clamped", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0, 77);
    expect(page.version).toBe(3);
  });
});

/* ── §D the credential (11-F21, 11-F23) ──────────────────────────────────────────────────────── */

describe("§D — `11-F23`: the PIN hash lives in its own table and rides only an `active` entry", () => {
  it("D1 keeps the hash OFF the user row, so a login lookup cannot return what it does not join to", async () => {
    // `11-F23`'s whole argument: `services/api`'s login reads the user row by email, and on a ninth
    // column "would hold every logged-in owner's *cashiers'* PIN hashes in the memory of a request
    // that has no use for them. A separate table means the login lookup cannot return the credential
    // **because it does not join to it** — a structural bound rather than a discipline."
    const fx = await main();
    const rows = [
      ...(await db.execute(sql`select * from kernel.users where user_id = ${fx.bilal}`)),
    ];
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(fx.bilalPinHash);
    expect(Object.keys(row).filter((column) => /pin/i.test(column))).toEqual([]);
  });

  it("D2 carries an `active` member's hash into the artifact, unmodified, so a device can verify offline", async () => {
    // `01-F28` verifies "on-device against synced credential hashes"; `11-F21` makes the roster the
    // delivery ("a hash a device does not hold cannot be verified with the WAN down") and rules ONE
    // hashing declaration for both planes, so the bytes that arrive must verify with `domain`'s own
    // verifier. A publisher that re-hashed, truncated or re-encoded would produce "an offline
    // refusal of a credential the owner has just set".
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const entry = byId(page, fx.ayesha);
    expect(typeof entry?.pin_hash).toBe("string");
    expect(await verifyPin(entry?.pin_hash ?? "", fx.ayeshaPin)).toBe(true);
  });

  it("D3 carries NO hash on a non-`active` member — absent, not null", async () => {
    // "THE HASH IS CARRIED ONLY ON AN `active` ENTRY, AND THAT IS WHAT KEEPS THE BOUND A BOUND …
    // a hash on a non-`active` entry is a credential **no verifier can ever reach**: pure blast
    // radius with no function." `11-F23` makes that an ABSENCE rather than a NULL ("a table makes it
    // no row, and the publisher's `left join` produces the specified shape without a branch").
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const entry = byId(page, fx.bilal);
    expect(entry?.status).toBe("inactive");
    expect(Object.hasOwn(entry ?? {}, "pin_hash")).toBe(false);
  });

  it("D4 treats that missing hash as the SPECIFIED shape: the whole roster still serves", async () => {
    // `01-F75`: "A missing `pin_hash` on a non-`active` member is NOT `malformed`: it is the
    // specified shape, and a validator that refuses it is the stopped-till-through-a-validator" —
    // `01-F17` arriving through the identity path. So the page containing him is complete and still
    // carries everyone else.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(page.complete).toBe(true);
    expect(page.entries).toHaveLength(4);
    expect(byId(page, fx.bilal)?.display_name).toBe("Bilal Ahmed");
  });

  it("D5 never lets the PIN hash out through the people-listing reader", async () => {
    const fx = await main();
    const people = await listUsers(db, fx.org);
    expect(JSON.stringify(people)).not.toContain(fx.bilalPinHash);
  });

  it("D6 mints a NEW version for a PIN change, and the delta carries the new hash", async () => {
    // `01-F75`: "a write that changes an artifact **mints the next version** for each affected
    // `(resource, scope)` key". A PIN reset (`14-F14`) changes the artifact — a device that never
    // learns of it verifies against the old hash for ever, which is `14-F14`'s reset doing nothing.
    const api = await staff();
    const org = `org-pin-${newId()}`;
    const branch = `branch-pin-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const person = await addPerson({
      org_id: org,
      display_name: "Nadia Aslam",
      email: null,
      grid_ordinal: 5,
      assignments: [{ role: "cashier", branch_id: branch }],
    });
    await api.setPinCredential(db, {
      org_id: org,
      user_id: person,
      pin_hash: await hashPin("1010"),
      now: T,
    });
    expect(await api.publishStaffRoster(db, scope, [person], { now: T })).toBe(1);

    await api.setPinCredential(db, {
      org_id: org,
      user_id: person,
      pin_hash: await hashPin("2020"),
      now: T + 1,
    });
    expect(await api.publishStaffRoster(db, scope, [person], { now: T + 1 })).toBe(2);

    const delta = await api.staffPage(db, scope, 1, 0);
    expect(delta.form).toBe("delta");
    expect(ids(delta)).toEqual([person]);
    const hash = byId(delta, person)?.pin_hash ?? "";
    expect(await verifyPin(hash, "2020")).toBe(true);
    expect(await verifyPin(hash, "1010")).toBe(false);
  });
});

/* ── §E participation status (11-F22) ────────────────────────────────────────────────────────── */

describe("§E — `11-F22`: a participation status, closed at two, and a departure that still renders", () => {
  it("E1 keeps a departed member IN the artifact as a marked entry, never an absence", async () => {
    // R26 and `01-F75`: "A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE — the frame carries no
    // removals list, for any resource … A removals list collapses two different questions — *may she
    // act* and *does she render* — into one bit." Dropping her degrades "a past order, a reprint, a
    // shift report and `02-F23`'s reconciliation" to a raw UUID.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const entry = byId(page, fx.bilal);
    expect(entry).toBeDefined();
    expect(entry?.display_name).toBe("Bilal Ahmed");
    expect(entry?.status).toBe("inactive");
    // And the delta that carried the departure carried her ROW, not a removal instruction.
    const delta = await api.staffPage(db, fx.scopeA, 2, 0);
    expect(byId(delta, fx.bilal)?.display_name).toBe("Bilal Ahmed");
  });

  it("E2 accepts both statuses and refuses every other word", async () => {
    // "The statuses are `active` and `inactive`, and the set is closed at two … a wider vocabulary
    // is org policy nobody has ruled, and inventing one here would be inventing policy." This schema
    // validates closed sets at the WRITER (`schema.ts`: no CHECK constraints, "so a closed set has
    // exactly one interpretation").
    //
    // ⚠ **AMENDED 2026-08-18 — this test encoded the SUPERSEDED per-person reading.** It asserted
    // the identical closed set against a `status` passed as a COLUMN ON THE PERSON ROW
    // (`addPerson({ …, status: word })`). `11-F22`'s per-(person, branch) clause overrules that
    // placement: the field is carried "with the ASSIGNMENT". **The RULE this test owns is unchanged
    // and is not weakened** — two words, no third, refused at the writer with the FR named; only
    // where the word sits moved.
    const org = `org-status-${newId()}`;
    const branch = `branch-status-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);

    await expect(
      addPerson({
        org_id: org,
        display_name: "Active One",
        grid_ordinal: 1,
        assignments: [{ role: "cashier", branch_id: branch, status: "active" }],
      }),
    ).resolves.toBeTruthy();
    await expect(
      addPerson({
        org_id: org,
        display_name: "Inactive One",
        grid_ordinal: 2,
        assignments: [{ role: "cashier", branch_id: branch, status: "inactive" }],
      }),
    ).resolves.toBeTruthy();

    // Each bad word gets its OWN ordinal, so that a word wrongly ACCEPTED fails on the status
    // assertion rather than on a `grid_ordinal` collision with the previously accepted one — a
    // refusal for a neighbouring reason reports the wrong debt.
    const rejected = ["suspended", "on_leave", "probation", "ACTIVE", ""];
    for (const [index, word] of rejected.entries()) {
      await expect(
        addPerson({
          org_id: org,
          display_name: `Bad ${word || "empty"}`,
          grid_ordinal: 10 + index,
          assignments: [{ role: "cashier", branch_id: branch, status: word }],
        }),
      ).rejects.toThrow(/11-F22/);
    }
    // Refused means NOTHING WAS WRITTEN — `15-F27`'s writer discipline, not a warning.
    expect(await listUsers(db, org)).toHaveLength(2);
  });

  it("E3 refuses an assignment with no status at all, rather than defaulting her to `active`", async () => {
    // `01-F75` makes the field "**required at the writer** … so nothing on the wire lacks it", and
    // `11-F22` refuses the default by name: an absent status is "not a licence to default an absent
    // status to `active`". ⚠ PINNED READING — that sentence is written about a DEVICE's older stored
    // rows; the alternative (default at the cloud writer) is named in the session's report.
    //
    // ⚠ **AMENDED 2026-08-18 — this test encoded the SUPERSEDED per-person reading.** It built a row
    // with no top-level `status` key and asserted the refusal. `11-F22`'s per-(person, branch)
    // clause moves the required field onto the assignment, so the row this test now builds is the
    // same defect in the shape the FR ruled operative. **The claim it owns — required at the writer,
    // never defaulted — is unchanged.** The second leg is new and is what the amended rule actually
    // says: the field is required **per assignment**, so one supplied status does not cover a
    // sibling that lacks one.
    const org = `org-nostatus-${newId()}`;
    const branch = `branch-nostatus-${newId()}`;
    const other = `branch-nostatus-b-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    await addBranch(org, other);
    const hash = await password();
    const row = (assignments: readonly unknown[]): unknown => ({
      user_id: newId(),
      org_id: org,
      display_name: "No Status",
      email: `no-status-${newId()}@example.com`,
      password_hash: hash,
      assignments,
      grid_ordinal: 1,
      created_at: T,
    });
    await expect(
      insertUser(db, row([{ role: "cashier", branch_id: branch }]) as UserRow),
    ).rejects.toThrow(/11-F22|01-F75/);
    // PER ASSIGNMENT: a status on the first does not stand in for the second.
    await expect(
      insertUser(
        db,
        row([
          { role: "cashier", branch_id: branch, status: "active" },
          { role: "cashier", branch_id: other },
        ]) as UserRow,
      ),
    ).rejects.toThrow(/11-F22|01-F75/);
    expect(await listUsers(db, org)).toEqual([]);
  });
});

/* ── §F grid_ordinal (01-F61, trap 12) ───────────────────────────────────────────────────────── */

describe("§F — `01-F61`: an explicit `grid_ordinal`, unique within the artifact, with no derived tiebreak", () => {
  /** Two active people at one ordinal must never reach one artifact — whichever writer refuses. */
  const expectNoDuplicateOrdinals = (page: StaffPage): void => {
    const ordinals = page.entries.map((entry) => entry.grid_ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length);
  };

  it("F1 refuses two active members at one ordinal in ONE publish, and publishes neither", async () => {
    // `01-F75`: "`grid_ordinal` is unique **within the artifact** — `01-F61` bans a derived tiebreak
    // and a collision is precisely how one is reintroduced, which is the defect its first build
    // shipped." `listUsers` orders `grid_ordinal asc, user_id asc` today, so a collision falls back
    // to `user_id` — the exact derived ordering `01-F61` forbids.
    const api = await staff();
    const org = `org-ord1-${newId()}`;
    const branch = `branch-ord1-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    const one = await addPerson({
      org_id: org,
      display_name: "Ordinal One",
      grid_ordinal: 7,
      assignments,
    });
    // The second INSERT may itself be refused, because `01-F75` leaves "whether the cloud enforces
    // uniqueness more widely than [the artifact]" open — so the assertion is the invariant (nothing
    // published, nothing served with a duplicate) and not which layer says no. ⚠ Wherever it is
    // enforced, the refusal must NAME the FR: every refusal this service already writes does
    // (`publishCatalog`, `create-branch`, `revoke-device`), and a raw Postgres constraint message is
    // not a sentence an operator can act on — `insertUser`'s own doc comment says exactly that about
    // "duplicate key value violates unique constraint".
    const clash = addPerson({
      org_id: org,
      display_name: "Ordinal Two",
      grid_ordinal: 7,
      assignments,
    }).then(async (two) => {
      await api.publishStaffRoster(db, scope, [one, two], { now: T });
    });
    await expect(clash).rejects.toThrow(/01-F61|01-F75/);
    expect(await api.staffVersion(db, scope)).toBe(0);
  });

  it("F2 refuses a NEW member taking an ordinal an earlier version already gave someone", async () => {
    // The case a suite that publishes one roster twice cannot see (trap 12: "invisible to a test that
    // only re-renders the same roster, which is precisely how it survived review"). The collision is
    // between v1's member and v2's, so only a check against the FOLDED artifact catches it.
    const api = await staff();
    const org = `org-ord2-${newId()}`;
    const branch = `branch-ord2-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    const first = await addPerson({
      org_id: org,
      display_name: "Held Position",
      grid_ordinal: 3,
      assignments,
    });
    expect(await api.publishStaffRoster(db, scope, [first], { now: T })).toBe(1);

    const collide = addPerson({
      org_id: org,
      display_name: "New Hire",
      grid_ordinal: 3,
      assignments,
    }).then(async (second) => {
      await api.publishStaffRoster(db, scope, [second], { now: T + 1 });
    });
    await expect(collide).rejects.toThrow(/01-F61|01-F75/);
    expect(await api.staffVersion(db, scope)).toBe(1);
    expectNoDuplicateOrdinals(await api.staffPage(db, scope, 0, 0));
  });

  it("F3 accepts a REPUBLISH of the same people at the same positions — the over-strictness control", async () => {
    // ⚠ THE CONTROL, and it is why F1/F2 prove something rather than merely reddening. A writer that
    // refused any ordinal ALREADY PRESENT in the artifact — the one-character version of F1's and
    // F2's check — passes both refusals above and makes an ordinary republish impossible, which is
    // every version after the first (the main fixture's v2 and v3 are exactly this shape). It is
    // deliberately a republish and NOT a swap: whether an ordinal may be REASSIGNED is not stated by
    // any FR, so demanding a swap here would be inventing the answer (commandment 2).
    const api = await staff();
    const org = `org-ord3-${newId()}`;
    const branch = `branch-ord3-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    const alpha = await addPerson({
      org_id: org,
      display_name: "Alpha",
      grid_ordinal: 1,
      assignments,
    });
    const beta = await addPerson({
      org_id: org,
      display_name: "Beta",
      grid_ordinal: 2,
      assignments,
    });
    expect(await api.publishStaffRoster(db, scope, [alpha, beta], { now: T })).toBe(1);

    // Re-publishing the SAME people at the SAME positions is an ordinary republish, not a collision.
    expect(await api.publishStaffRoster(db, scope, [alpha, beta], { now: T + 1 })).toBe(2);
    const page = await api.staffPage(db, scope, 0, 0);
    expect(page.entries).toHaveLength(2);
    expectNoDuplicateOrdinals(page);
    expect(byId(page, alpha)?.grid_ordinal).toBe(1);
    expect(byId(page, beta)?.grid_ordinal).toBe(2);
  });

  it("F4 holds the invariant across every version of the main fixture's artifact", async () => {
    // ⚠ **AMENDED 2026-08-18.** The first call in each pair used to be this test's whole reach and it
    // no longer has any: `01-F75`'s continuation clause (`b47dcbe`) serves a first page the CURRENT
    // version whatever it asks for, so the three of them are now three reads of version 3. They are
    // kept — the invariant is still true of them and asking is still legal — and the historical reach
    // this test claims in its own title is restored by the CONTINUATION beside each, which is the one
    // request the clause still honours at a version that is not current (§M3 owns the rule itself).
    const fx = await main();
    const api = await staff();
    for (const version of [1, 2, 3]) {
      expectNoDuplicateOrdinals(await api.staffPage(db, fx.scopeA, 0, 0, version));
      expectNoDuplicateOrdinals(await api.staffPage(db, fx.scopeA, 0, 1, version));
    }
  });
});

/* ── §G assignments and the org boundary (01-F26, 01-F71) ────────────────────────────────────── */

describe("§G — `01-F26`/`01-F71`: an assignment names a branch of THAT org, or org-wide, or nothing", () => {
  it("G1 refuses an assignment naming a branch that belongs to another org", async () => {
    // `01-F71` (a): the matrix "refuses when the subject's org differs from the scope's, before any
    // action-specific reasoning"; `00 §5.4` makes org data isolation absolute. A user row whose
    // assignment names another org's branch is that boundary crossed in storage, and it is
    // `authorize.ts`'s `can()` subject for every write once the roster carries it.
    //
    // **It is refused HERE OR NOWHERE.** `kernel` carries no foreign key at all: `01-F68` bans one
    // from any LEDGER table outright and `schema.ts` extends the restraint to the directory's own
    // edges as a stated interpretation ("`device_registry.branch_id` does not reference
    // `branches`"). So Postgres cannot answer this, and `15-F27` already puts exactly this
    // completeness rule at this writer — `create-branch` refuses a branch under an unnamed org.
    // ⚠ PLACEMENT IS A READING: it could instead sit in step 4's procedure. `18 §4` makes this
    // service the ONE writer of `kernel.users`, and a check in one caller leaves every other caller
    // unguarded, which is `03-F40`'s two-interpretations defect on the isolation boundary.
    const orgOne = `org-g1a-${newId()}`;
    const orgTwo = `org-g1b-${newId()}`;
    const branchTwo = `branch-g1b-${newId()}`;
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgTwo, branchTwo);
    await expect(
      addPerson({
        org_id: orgOne,
        display_name: "Wrong Org",
        grid_ordinal: 1,
        assignments: [{ role: "cashier", branch_id: branchTwo }],
      }),
    ).rejects.toThrow(/01-F26|01-F71/);
    expect(await listUsers(db, orgOne)).toEqual([]);
  });

  it("G2 refuses an assignment naming a branch no record names at all", async () => {
    const org = `org-g2-${newId()}`;
    await addOrg(org);
    await expect(
      addPerson({
        org_id: org,
        display_name: "Ghost Branch",
        grid_ordinal: 1,
        assignments: [{ role: "cashier", branch_id: `branch-never-created-${newId()}` }],
      }),
    ).rejects.toThrow(/01-F26|01-F71/);
    expect(await listUsers(db, org)).toEqual([]);
  });

  it("G3 accepts a null branch, which is `01-F26`'s org-wide assignment", async () => {
    // "`01-F26`'s assignment is per-**location** and its null location is org-wide, which is how
    // every owner is stored today" (`01-F76`). Refusing null would make an owner unstorable.
    const org = `org-g3-${newId()}`;
    const branch = `branch-g3-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    await expect(
      addPerson({
        org_id: org,
        display_name: "Org Wide",
        grid_ordinal: 1,
        assignments: [{ role: "owner", branch_id: null }],
      }),
    ).resolves.toBeTruthy();
    // Control: a branch of her own org is accepted too, so G1/G2 are about the ORG and not about
    // assignments in general.
    await expect(
      addPerson({
        org_id: org,
        display_name: "Own Branch",
        grid_ordinal: 2,
        assignments: [{ role: "cashier", branch_id: branch }],
      }),
    ).resolves.toBeTruthy();
  });

  it("G4 refuses to publish another ORG's person into this org's artifact", async () => {
    // `01-F71`: the isolation boundary is the org, fail-closed. A cross-org publish would put one
    // tenant's Argon2id credential onto another tenant's till — R25's blast radius, crossed.
    // (Which people of the OWN org a branch artifact contains is `01 §9.7` and is not asserted.)
    const api = await staff();
    const orgOne = `org-g4a-${newId()}`;
    const orgTwo = `org-g4b-${newId()}`;
    const branchOne = `branch-g4a-${newId()}`;
    const branchTwo = `branch-g4b-${newId()}`;
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgOne, branchOne);
    await addBranch(orgTwo, branchTwo);
    const stranger = await addPerson({
      org_id: orgTwo,
      display_name: "Another Tenant",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: branchTwo }],
    });
    await expect(
      api.publishStaffRoster(db, { org_id: orgOne, branch_id: branchOne }, [stranger], { now: T }),
    ).rejects.toThrow(/01-F71|01-F26/);
    expect(await api.staffVersion(db, { org_id: orgOne, branch_id: branchOne })).toBe(0);
  });

  it("G5 refuses to publish the roster at ORG scope, because R25 makes it branch-scoped", async () => {
    // `01-F76`: "The staff roster is BRANCH-scoped, and the reason is the credential … its scope is
    // its blast radius: an unrevoked device holds the credentials of everyone in its delivery scope,
    // and branch scope is the half of that cost which can be bought down." An org-scoped roster
    // hands every device in the org every branch's hashes, silently.
    const api = await staff();
    const org = `org-g5-${newId()}`;
    const branch = `branch-g5-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const person = await addPerson({
      org_id: org,
      display_name: "Branch Only",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: branch }],
    });
    await expect(
      api.publishStaffRoster(db, { org_id: org, branch_id: null }, [person], { now: T }),
    ).rejects.toThrow(/01-F76|R25/);
  });

  /* ── the BRANCH half of the artifact key (added 2026-08-18) ──────────────────────────────────
   *
   * G4 checks the PERSON's org and G5 checks the SCOPE's shape; **neither checks the scope's
   * BRANCH**, and until now nothing in this file did — a roster carrying Argon2id hashes of real
   * people could be published under a key naming a branch that does not exist, or one belonging to
   * another tenant, and every assertion in this suite stayed green.
   *
   * `01-F76` makes the artifact `(org_id, branch_id)` and `01-F71` (d) makes it a STRUCTURED key;
   * `01-F71` opens by saying isolation's enforcement points are named "so a later edit is visible",
   * and this is one of them. **It is enforced HERE OR NOWHERE**: `01-F68` forbids a foreign key from
   * any ledger table *ever* and `schema.ts` extends that restraint to the directory's own edges, so
   * Postgres cannot answer it, and `15-F27` already puts exactly this completeness rule at this
   * writer (`create-branch` refuses a branch under an org no record names). `01-F71` (e)'s
   * session-derived key is the OTHER enforcement point and is not a substitute: it is a serve-path
   * rule about what a device may ASK for, and it does not exist yet — the publisher is reached from
   * the back office, not from a device session.
   *
   * ⚠ **BOTH FIXTURES USE AN ORG-WIDE ASSIGNEE, AND THAT IS FORCED — see exclusion 1 in the header.**
   * A person assigned only to branch X has no participation value at a branch id that names nothing,
   * so a publish naming a ghost branch is refused one step earlier, for a §9.7-adjacent reason, and
   * a probe built on her would report the participation lookup as the branch guard. `01-F26`'s null
   * location gives an owner a value at any branch id, which is the only shape that reaches the key
   * check. Neither test asserts what a branch artifact CONTAINS, and neither ACCEPTS an org-wide
   * publish, so §9.7 is untouched.
   *
   * ⚠ **THE REFUSALS ARE MATCHED ON FR ID, AND `01-F76` IS DELIBERATELY NOT IN THE PATTERN.** A
   * refusal citing `01-F76`/§9.7 would be the row-SELECTION answer nobody has ruled; letting it
   * satisfy these tests is exactly the mis-attribution the paragraph above is guarding against.
   */

  it("G6 refuses to publish a roster into a branch NO RECORD NAMES, and mints no version", async () => {
    const api = await staff();
    const org = `org-g6-${newId()}`;
    const branch = `branch-g6-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const ghost = `branch-never-created-${newId()}`;
    const ghostScope: StaffScope = { org_id: org, branch_id: ghost };

    const ownerPin = "6624";
    const owner = await addPerson({
      org_id: org,
      display_name: "Org Wide Owner",
      email: null,
      grid_ordinal: 1,
      assignments: [{ role: "owner", branch_id: null }],
    });
    const ownerHash = await hashPin(ownerPin);
    await api.setPinCredential(db, { org_id: org, user_id: owner, pin_hash: ownerHash, now: T });

    await expect(api.publishStaffRoster(db, ghostScope, [owner], { now: T })).rejects.toThrow(
      /01-F68|01-F69|01-F71|15-F27/,
    );

    // Refused means NOTHING WAS WRITTEN — `15-F27`'s writer discipline. A partial publish here is an
    // artifact under a key that can never be reconciled against a branch record, holding credentials.
    expect(await api.staffVersion(db, ghostScope)).toBe(0);
    const served = await api.staffPage(db, ghostScope, 0, 0);
    expect(served.entries).toEqual([]);
    expect(JSON.stringify(served)).not.toContain(ownerHash);

    // ⚠ THE OVER-STRICTNESS CONTROL, one field away. A publisher that refused every scope — or every
    // fixture of this shape — passes the refusal above and can publish nothing at all. This is the
    // single-branch person into her own branch, which is exclusion 1's one uncontested case.
    const real = await addPerson({
      org_id: org,
      display_name: "Real Branch Cashier",
      email: null,
      grid_ordinal: 2,
      assignments: [{ role: "cashier", branch_id: branch }],
    });
    await api.setPinCredential(db, {
      org_id: org,
      user_id: real,
      pin_hash: await hashPin("7735"),
      now: T,
    });
    expect(
      await api.publishStaffRoster(db, { org_id: org, branch_id: branch }, [real], { now: T }),
    ).toBe(1);
  });

  it("G7 refuses to publish a roster into ANOTHER ORG's branch, and leaves both artifacts at 0", async () => {
    // `01-F71`: "org data isolation is absolute" and the branch is half the artifact key. The branch
    // here EXISTS — so "no record names it" cannot be the reason — and belongs to another tenant.
    // Under R25 the roster's scope IS its credential blast radius, so this is one org's Argon2id
    // hashes filed under another org's branch: the leak has no error in it and nothing to reconcile
    // it against, exactly `01-F71` (d)'s separator-less-key defect reached through a missing check.
    const api = await staff();
    const orgOne = `org-g7a-${newId()}`;
    const orgTwo = `org-g7b-${newId()}`;
    const branchOne = `branch-g7a-${newId()}`;
    const branchTwo = `branch-g7b-${newId()}`;
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgOne, branchOne);
    await addBranch(orgTwo, branchTwo);

    const owner = await addPerson({
      org_id: orgOne,
      display_name: "One Org Owner",
      email: null,
      grid_ordinal: 1,
      assignments: [{ role: "owner", branch_id: null }],
    });
    const ownerHash = await hashPin("3308");
    await api.setPinCredential(db, { org_id: orgOne, user_id: owner, pin_hash: ownerHash, now: T });

    const foreignScope: StaffScope = { org_id: orgOne, branch_id: branchTwo };
    await expect(api.publishStaffRoster(db, foreignScope, [owner], { now: T })).rejects.toThrow(
      /01-F68|01-F69|01-F71|15-F27/,
    );

    expect(await api.staffVersion(db, foreignScope)).toBe(0);
    expect(JSON.stringify(await api.staffPage(db, foreignScope, 0, 0))).not.toContain(ownerHash);

    // …and the branch's OWN tenant is untouched. `01-F76` keys the artifact by the pair, so the
    // victim's device asks `(orgTwo, branchTwo)` and would never see this — which is what makes the
    // row silent rather than loud, and is why the assertion is on both keys.
    const victimScope: StaffScope = { org_id: orgTwo, branch_id: branchTwo };
    expect(await api.staffVersion(db, victimScope)).toBe(0);
    expect(JSON.stringify(await api.staffPage(db, victimScope, 0, 0))).not.toContain(ownerHash);
  });

  it("G8 checks EVERY assignment and not the first: a foreign branch named second is refused too", async () => {
    // `01-F26` reads *"every assignment names a branch of THIS org"* — **every**, and G1/G2 above
    // can only ever probe the first, because every person they build holds exactly one. A writer
    // that validated `assignments[0]` and stopped passes both of them, passes every other test in
    // this file, and writes a row whose SECOND assignment crosses `01-F71`'s absolute isolation
    // boundary — after which that row is `authorize.ts`'s `can()` subject on every till the roster
    // reaches. **It is refused here or nowhere**: `01-F68` forbids a foreign key from any ledger
    // table *ever* and `0010` extends the restraint to the directory's own edges, so Postgres cannot
    // answer it and this service is `18 §4`'s ONE writer of `kernel.users`.
    //
    // ⚠ **THE POSITION IS THE CLAIM, so the first assignment is deliberately VALID in both refusal
    // legs.** A fixture whose first assignment were also wrong would be G1/G2 with an extra element,
    // and would be satisfied by exactly the implementation this test exists to kill. `01-F26`'s two
    // failure modes are kept apart on purpose (E2's lesson — a refusal for a neighbouring reason
    // reports the wrong debt), so the branch belonging to another org and the branch no record names
    // are separate legs matched on separate FR ids.
    const orgOne = `org-g8a-${newId()}`;
    const orgTwo = `org-g8b-${newId()}`;
    const branchOne = `branch-g8a-${newId()}`;
    const branchTwo = `branch-g8b-${newId()}`;
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgOne, branchOne);
    await addBranch(orgTwo, branchTwo);

    // Leg one — the second assignment names ANOTHER TENANT's branch (`01-F71`).
    await expect(
      addPerson({
        org_id: orgOne,
        display_name: "Second Assignment Crosses",
        email: null,
        grid_ordinal: 1,
        assignments: [
          { role: "cashier", branch_id: branchOne },
          { role: "cashier", branch_id: branchTwo },
        ],
      }),
    ).rejects.toThrow(/01-F26|01-F71/);

    // Leg two — the second assignment names a branch NO RECORD names (`01-F26`).
    await expect(
      addPerson({
        org_id: orgOne,
        display_name: "Second Assignment Is A Ghost",
        email: null,
        grid_ordinal: 2,
        assignments: [
          { role: "cashier", branch_id: branchOne },
          { role: "cashier", branch_id: `branch-never-created-${newId()}` },
        ],
      }),
    ).rejects.toThrow(/01-F26|01-F71/);

    // Refused means NOTHING WAS WRITTEN — `15-F27`'s writer discipline. A row that landed with only
    // its legal assignments kept would be the same violation wearing a repair.
    expect(await listUsers(db, orgOne)).toEqual([]);

    // ⚠ THE OVER-STRICTNESS CONTROL, one field away, and it is what keeps this test about the ORG
    // rather than about holding two assignments at all: the same shape with a second assignment that
    // is `01-F26`'s org-wide null is ACCEPTED. Without it a writer that refused every multi-assignment
    // person would pass both legs above and make every owner-plus-branch person unstorable.
    await expect(
      addPerson({
        org_id: orgOne,
        display_name: "Second Assignment Is Org Wide",
        email: null,
        grid_ordinal: 3,
        assignments: [
          { role: "cashier", branch_id: branchOne },
          { role: "owner", branch_id: null },
        ],
      }),
    ).resolves.toBeTruthy();
    expect(await listUsers(db, orgOne)).toHaveLength(1);
  });
});

/* ── §H email (R30) ──────────────────────────────────────────────────────────────────────────── */

describe("§H — R30: a till-only cashier has no email, and the index survives unchanged", () => {
  it("H1 stores a person with no email and reads her back as NULL, not as the word 'null'", async () => {
    // R30: "a cashier who only uses the till needs NO email … an owner made to supply one puts a
    // wrong address permanently into a directory `11-F20` never deletes from." `listUsers` today is
    // `email: String(row.email)`, which turns a null into the four-letter string.
    const fx = await main();
    const people = await listUsers(db, fx.org);
    const ayesha = people.find((person) => person.user_id === fx.ayesha);
    expect(ayesha?.email).toBeNull();
  });

  it("H2 stores TWO till-only people in one org, because Postgres permits multiple NULLs", async () => {
    // R30's own named consequence: "Postgres permits multiple NULLs in a unique index, so the index
    // survives unchanged." Most restaurants are mostly till-only staff, so this is the normal case
    // and not an edge one.
    const org = `org-h2-${newId()}`;
    const branch = `branch-h2-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    await addPerson({
      org_id: org,
      display_name: "Till Only A",
      email: null,
      grid_ordinal: 1,
      assignments,
    });
    await addPerson({
      org_id: org,
      display_name: "Till Only B",
      email: null,
      grid_ordinal: 2,
      assignments,
    });
    expect(await listUsers(db, org)).toHaveLength(2);
  });

  it("H3 still refuses two people sharing one email, case-folded", async () => {
    // R30 removes "the requirement to *have* an address, not the rule about two people sharing one"
    // (`11 §9.6`), and `28 §9.18`'s global-uniqueness rule is untouched. A migration that dropped the
    // index to make nulls work would satisfy H1 and H2 and break the login lookup's uniqueness.
    const org = `org-h3-${newId()}`;
    const branch = `branch-h3-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const shared = `shared-${newId()}@example.com`;
    // `status` sits on the ASSIGNMENT here (`11-F22`, amended 2026-08-18) — it used to be a column
    // on the row literal below. H3's claim is the email index and is untouched by that move.
    const assignments = [{ role: "cashier" as const, branch_id: branch, status: "active" }];
    await addPerson({
      org_id: org,
      display_name: "First Claim",
      email: shared,
      grid_ordinal: 1,
      assignments,
    });
    const second = await insertUser(db, {
      user_id: newId(),
      org_id: org,
      display_name: "Second Claim",
      email: shared.toUpperCase(),
      password_hash: await password(),
      assignments,
      grid_ordinal: 2,
      created_at: T,
    } as unknown as UserRow);
    expect(second).toBe(false);
    expect(await listUsers(db, org)).toHaveLength(1);
  });
});

/* ── §I the row `01-F75` declares ────────────────────────────────────────────────────────────── */

describe("§I — `01-F75`'s `staff` row, which is what a golden fixture will be written against", () => {
  it("I1 carries user_id, display_name, grid_ordinal, status and assignments on every entry", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(page.entries).toHaveLength(4);
    for (const entry of page.entries) {
      expect(typeof entry.user_id).toBe("string");
      expect(typeof entry.grid_ordinal).toBe("number");
      expect(["active", "inactive"]).toContain(entry.status);
      expect(Array.isArray(entry.assignments)).toBe(true);
    }
  });

  it("I2 requires `display_name` on the wire, and it is the person's ONE name", async () => {
    // `01-F75`: "`display_name`, **required on the wire** (`11-F20` makes the name required on the
    // one record both planes read — the device type's optionality is a migration artifact … and it
    // is not a wire rule)". `11-F20`: the device projection "may not hold a name the cloud record
    // does not", so the entry's name is the stored one and never a re-derivation.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const stored = new Map(
      (await listUsers(db, fx.org)).map((person) => [person.user_id, person.display_name]),
    );
    for (const entry of page.entries) {
      expect(typeof entry.display_name).toBe("string");
      expect(entry.display_name.length).toBeGreaterThan(0);
      expect(entry.display_name).toBe(stored.get(entry.user_id));
    }
  });

  it("I3 carries a single-branch member's assignment — the one case §9.7 cannot change", async () => {
    // `01-F75` puts `assignments` (`01-F26`) on the row. Whether a row carries ALL of a person's
    // assignments or only this artifact's is `01 §9.7` and is OPEN — for a person with exactly one
    // assignment, to this branch, both readings give the same answer, which is why this is the only
    // assignment assertion in this file.
    //   ⚠ **AMENDED 2026-08-18: §9.7's second half is ANSWERED by `01-F78` — only the assignments
    //   that reach this branch — and §O4/§O5 assert it, so this is no longer the only assignment
    //   assertion here. The TEST is unchanged and is not weakened by the ruling:** hina and ayesha
    //   each hold one assignment, to branch A, which reaches branch A, so `01-F78`'s filter returns
    //   it and the `toEqual` above is the same under both readings — which is precisely why it was
    //   authorable while the question was open. The two claims below (the wire's single `status`,
    //   and the strip) are `01-F75`'s and `11-F22`'s and are untouched by `01-F78`.
    //
    // ⚠ **This test also pins the WIRE half of `11-F22`'s per-(person, branch) amendment, and that
    // was incidental before 2026-08-18 — it is stated now so the next reader does not weaken it by
    // accident.** Participation moved onto the assignment in STORAGE; it did not move onto the
    // assignment on the WIRE. `01-F75` declares the `staff` row with exactly one `status` field, and
    // `01-F76` already makes the artifact branch-scoped, so an entry's single `status` IS this
    // branch's participation and needs no second carrier. A per-assignment status on the row would
    // be two representations of one fact with nothing ruling which wins — `11-F20`'s "ONE name, not
    // one per plane" argument on a different field. Hence `toEqual` on `01-F26`'s two members.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(byId(page, fx.hina)?.assignments).toEqual([
      { role: "branch_manager", branch_id: fx.branchA },
    ]);
    expect(byId(page, fx.ayesha)?.assignments).toEqual([
      { role: "cashier", branch_id: fx.branchA },
    ]);
  });
});

/* ── §J/§K/§L the transfer, the departure, the transaction (11-F22, 11-F23, R32) ─────────────── */

const TRANSFER_NAME = "Rabia Sattar";
/** Her PIN before the departure, and the one she is given on re-activation. R32 makes them differ. */
const PIN_BEFORE = "9142";
const PIN_AFTER = "5087";

/**
 * THE TRANSFER ARC — ONE person, TWO branches, six acts, and both artifacts read after each.
 *
 * `11-F22`'s worked example is a state held in two artifacts **at the same moment**, so it cannot be
 * asserted from a single page; and R32's credential rule is about the SEQUENCE (one branch's
 * deactivation must not fire it, the last one must). The arc therefore runs once and captures every
 * page it produces, and each test asserts one act. That is deliberate over `it`-to-`it` mutation:
 * a suite whose tests must run in order fails as a cascade, and only the first failure is legible.
 *
 *   act 0  hired at A, holds an assignment at B that is not yet `active`; credential set
 *   act 1  THE TRANSFER — `inactive` at A and `active` at B
 *   act 2  a REPEATED deactivation at A while B is still `active`
 *   act 3  ordinary republishes at each branch (`11-F22`'s measured defect: the resurrection)
 *   act 4  THE DEPARTURE — `inactive` at B too, so `inactive` everywhere
 *   act 5  re-activation, STEP ONE ONLY (R32: flip the status, then set a PIN)
 *   act 6  step two
 */
type TransferArc = {
  org: string;
  branchA: string;
  branchB: string;
  scopeA: StaffScope;
  scopeB: StaffScope;
  rabia: string;
  hiredA: StaffPage;
  hiredB: StaffPage;
  movedA: StaffPage;
  movedB: StaffPage;
  repeatedB: StaffPage;
  republishedA: StaffPage;
  republishedB: StaffPage;
  departedA: StaffPage;
  departedB: StaffPage;
  reactivatedB: StaffPage;
  recredentialedB: StaffPage;
};

let transferFixture: Promise<TransferArc> | undefined;

const buildTransfer = async (): Promise<TransferArc> => {
  const api = await staff();
  const org = `org-transfer-${newId()}`;
  const branchA = `branch-t-a-${newId()}`;
  const branchB = `branch-t-b-${newId()}`;
  await addOrg(org);
  await addBranch(org, branchA);
  await addBranch(org, branchB);
  const scopeA: StaffScope = { org_id: org, branch_id: branchA };
  const scopeB: StaffScope = { org_id: org, branch_id: branchB };

  // TWO assignments from the start, A `active` and B not. See the header: the contract carries no
  // assignment-creation surface and `11-F22` constrains the STATE, not how the second assignment
  // arose. She is the ONLY member of either artifact, so no `grid_ordinal` question arises (§F).
  const rabia = await addPerson({
    org_id: org,
    display_name: TRANSFER_NAME,
    email: null,
    grid_ordinal: 12,
    assignments: [
      { role: "cashier", branch_id: branchA, status: "active" },
      { role: "cashier", branch_id: branchB, status: "inactive" },
    ],
  });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: rabia,
    pin_hash: await hashPin(PIN_BEFORE),
    now: T,
  });

  let versionA = 0;
  let versionB = 0;
  const publishA = async (now: number): Promise<StaffPage> => {
    versionA += 1;
    const minted = await api.publishStaffRoster(db, scopeA, [rabia], { now });
    if (minted !== versionA) {
      throw new Error(`transfer fixture: A minted version ${minted}, expected ${versionA}`);
    }
    return api.staffPage(db, scopeA, 0, 0);
  };
  const publishB = async (now: number): Promise<StaffPage> => {
    versionB += 1;
    const minted = await api.publishStaffRoster(db, scopeB, [rabia], { now });
    if (minted !== versionB) {
      throw new Error(`transfer fixture: B minted version ${minted}, expected ${versionB}`);
    }
    return api.staffPage(db, scopeB, 0, 0);
  };
  const setStatus = async (branch_id: string, status: string): Promise<void> => {
    await api.setUserStatus(db, { org_id: org, user_id: rabia, branch_id, status });
  };

  const hiredA = await publishA(T);
  const hiredB = await publishB(T);

  // ⚠ **THE ORDER OF THESE TWO CALLS IS LOAD-BEARING AND WAS FOUND BY RUNNING, NOT BY READING.**
  // The receiving branch is activated FIRST. Deactivating A first passes through a moment in which
  // she is `inactive` in every branch that names her — which is exactly R32's trigger — so her
  // credential is deleted and B's roster is served an `active` member with no hash, the defect
  // `11-F23` names. That is `11-F23`'s rule applied literally and is **not** asserted either way
  // here: the corpus rules on the trigger (`inactive` everywhere) and is silent on whether a
  // two-step transfer performed in the unsafe order should be protected, so pinning either answer
  // would be inventing policy (commandment 2). It is carried to the session's report as a finding.
  await setStatus(branchB, "active");
  await setStatus(branchA, "inactive");
  const movedA = await publishA(T + 1);
  const movedB = await publishB(T + 1);

  await setStatus(branchA, "inactive");
  const repeatedB = await publishB(T + 2);

  const republishedA = await publishA(T + 3);
  const republishedB = await publishB(T + 4);

  await setStatus(branchB, "inactive");
  const departedA = await publishA(T + 5);
  const departedB = await publishB(T + 6);

  await setStatus(branchB, "active");
  const reactivatedB = await publishB(T + 7);

  await api.setPinCredential(db, {
    org_id: org,
    user_id: rabia,
    pin_hash: await hashPin(PIN_AFTER),
    now: T + 8,
  });
  const recredentialedB = await publishB(T + 8);

  return {
    org,
    branchA,
    branchB,
    scopeA,
    scopeB,
    rabia,
    hiredA,
    hiredB,
    movedA,
    movedB,
    repeatedB,
    republishedA,
    republishedB,
    departedA,
    departedB,
    reactivatedB,
    recredentialedB,
  };
};

const arc = (): Promise<TransferArc> => {
  transferFixture ??= buildTransfer();
  return transferFixture;
};

describe("§J — `11-F22`: participation is per-(PERSON, BRANCH), and a TRANSFER is its worked example", () => {
  it("J1 gives ONE person two different answers in two artifacts at ONE moment", async () => {
    // The clause: "THE FIELD IS THEREFORE PER-(PERSON, BRANCH) AND NOT A COLUMN ON THE PERSON ROW …
    // the transfer clause is the operative one." A per-person column answers the same word to both
    // artifacts and cannot be told from a correct build by any other test in this file.
    //
    // The credential rides the same axis, which is the second half and is not a separate rule:
    // `11-F21` carries the hash "only on an `active` entry", and `active` is now per artifact — so
    // ONE credential row is present in one artifact and absent in the other, simultaneously.
    const fx = await arc();
    expect(entryOf(fx.hiredA, fx.rabia, "J1 A").status).toBe("active");
    expect(entryOf(fx.hiredB, fx.rabia, "J1 B").status).toBe("inactive");
    expect(await verifyPin(entryOf(fx.hiredA, fx.rabia, "J1 A").pin_hash ?? "", PIN_BEFORE)).toBe(
      true,
    );
    expect(carriesHash(entryOf(fx.hiredB, fx.rabia, "J1 B"))).toBe(false);
  });

  it("J2 TRANSFERS her: `inactive` in A's roster and `active` in B's, at the same moment", async () => {
    // `11-F22` verbatim: "A cashier who moves from branch A to branch B is not a departure and R25
    // makes the roster branch-scoped, so the case has to be answerable in two artifacts: she is
    // `inactive` in A's roster and `active` in B's." **This is the assertion the amendment exists
    // for**, and it is the exact inverse of J1's pair — same person, same publisher, one act apart.
    const fx = await arc();
    expect(entryOf(fx.movedA, fx.rabia, "J2 A").status).toBe("inactive");
    expect(entryOf(fx.movedB, fx.rabia, "J2 B").status).toBe("active");
    // She is dropped from NEITHER (R26): "she is not dropped from A, because … her name renders on
    // last month's orders and those orders are resolved by A's tills from A's artifact."
    expect(entryOf(fx.movedA, fx.rabia, "J2 A").display_name).toBe(TRANSFER_NAME);
    expect(entryOf(fx.movedB, fx.rabia, "J2 B").display_name).toBe(TRANSFER_NAME);
  });

  it("J3 keeps her credential across the transfer — the deletion is keyed to the LAST active assignment", async () => {
    // `11-F23`: "a deletion fired by A's deactivation destroys the credential B's roster needs and
    // produces an `active` member with no hash … A person's credential goes when she is `inactive`
    // **everywhere**, which is what R32 means by 'does not outlive her employment': employment ends
    // at the org, not at a branch."
    const fx = await arc();
    expect(await verifyPin(entryOf(fx.movedB, fx.rabia, "J3 B").pin_hash ?? "", PIN_BEFORE)).toBe(
      true,
    );
    // …and A's tills stop holding it in the same act, which is `11-F21`'s bound doing its work.
    expect(carriesHash(entryOf(fx.movedA, fx.rabia, "J3 A"))).toBe(false);
    // A REPEATED deactivation at A does not fire it either: the trigger is the last ACTIVE
    // assignment going inactive, not any call whose argument is the word `inactive`.
    expect(
      await verifyPin(entryOf(fx.repeatedB, fx.rabia, "J3 repeat").pin_hash ?? "", PIN_BEFORE),
    ).toBe(true);
  });

  it("J4 does not return her to `active` at A on a later republish, and restores no hash there", async () => {
    // The measured defect `11-F22` names: "any later republish at A re-copied her CURRENT status and
    // **silently returned a departed cashier to `active` with a working PIN hash on her old branch's
    // tills**. That is the state this FR exists to forbid, reached through the mechanism it exists to
    // describe." Under a per-person column her current status after the transfer is `active`, so a
    // republish at A is exactly how the defect arrives — with no error anywhere.
    const fx = await arc();
    expect(entryOf(fx.republishedA, fx.rabia, "J4").status).toBe("inactive");
    expect(carriesHash(entryOf(fx.republishedA, fx.rabia, "J4"))).toBe(false);
  });

  it("J5 CONTROL: a later republish at B does not deactivate her there either", async () => {
    // ⚠ THE OVER-STRICTNESS CONTROL, one branch away from J4. A publisher that hard-coded a
    // transferred person to `inactive`, or that dropped the credential from every republish, passes
    // J2/J3/J4 and makes the receiving branch unable to sign her in — which is the same stopped till
    // as the defect, wearing the fix. F3 is this file's existing precedent for the pattern.
    const fx = await arc();
    expect(entryOf(fx.republishedB, fx.rabia, "J5").status).toBe("active");
    expect(
      await verifyPin(entryOf(fx.republishedB, fx.rabia, "J5").pin_hash ?? "", PIN_BEFORE),
    ).toBe(true);
  });
});

describe("§K — R32/`11-F23`: a DEPARTURE is `inactive` everywhere, and only then is the credential gone", () => {
  it("K1 marks her departed in EVERY branch that names her, and drops her from neither artifact", async () => {
    // `11-F22`: "A person is departed when she is `inactive` in **every** branch that names her, not
    // when one branch deactivates her." R26 keeps the row in both artifacts for ever, so both still
    // render her name — `11-F20`'s render-time rule, which is the half a `removals` list destroys.
    const fx = await arc();
    for (const [label, page] of [
      ["A", fx.departedA],
      ["B", fx.departedB],
    ] as const) {
      const entry = entryOf(page, fx.rabia, `K1 ${label}`);
      expect(entry.status).toBe("inactive");
      expect(entry.display_name).toBe(TRANSFER_NAME);
      expect(carriesHash(entry)).toBe(false);
    }
  });

  it("K2 DELETED the credential row: re-activation without a new PIN publishes an `active` member with NO hash", async () => {
    // **R32, and the only surface this contract has for observing a credential ROW.** The projection
    // rule (`11-F21`) hides the row while she is non-`active` — under DELETED and under RETAINED her
    // entry looks identical — so the question is only answerable after step one of R32's two-step
    // re-activation: "flip the status, then set a PIN". Under RETAINED she comes back holding her old
    // working PIN, which is precisely what `11-F23` says the torn state produces: "the next
    // re-activation then restores her OLD PIN and publishes it to every till at the branch."
    const fx = await arc();
    const entry = entryOf(fx.reactivatedB, fx.rabia, "K2");
    expect(entry.status).toBe("active");
    expect(entry.pin_hash).toBeUndefined();
    expect(await verifyPin(entry.pin_hash ?? "", PIN_BEFORE)).toBe(false);
  });

  it("K3 CONTROL / step two: a new PIN yields a WORKING credential, and it is the new one", async () => {
    // ⚠ THE ANTI-VACUITY LEG FOR K2, and it is what stops "no hash" being read as "this publisher
    // never carries a hash". One act later the same person at the same branch verifies again — so
    // K2's absence is attributable to the deletion and not to a broken join. It is also R32's own
    // second step, and the `verifyPin(PIN_BEFORE) === false` line is the ruling's whole purpose:
    // the departed credential does not come back.
    const fx = await arc();
    const hash = entryOf(fx.recredentialedB, fx.rabia, "K3").pin_hash ?? "";
    expect(await verifyPin(hash, PIN_AFTER)).toBe(true);
    expect(await verifyPin(hash, PIN_BEFORE)).toBe(false);
  });
});

describe("§L — `11-F23`: the status flip and the credential delete are ONE unit of work", () => {
  /**
   * ⚠ **WHAT THESE TWO PROBES DO AND DO NOT ESTABLISH — read before adding a third.** `11-F23`'s
   * clause is about a *"dropped connection, statement timeout or process kill between two autocommit
   * statements"*, and this suite cannot kill a process mid-statement. What it can do is assert **the
   * invariant an interruption would break — there is no state in which a person is `inactive` while
   * her credential is still live** — on the two interruptions it CAN produce deterministically:
   *
   *   L1  the caller's transaction ABORTS after `setUserStatus` returns. Kills a delete issued on a
   *       connection the caller cannot roll back, and a half that commits eagerly on its own.
   *   L2  the transition is REFUSED for an illegal status word. Kills a writer that deletes the
   *       credential BEFORE it validates — the same torn state reached through a bad argument
   *       instead of a bad night.
   *
   * **Neither can see two autocommits issued back-to-back on ONE connection with nothing failing
   * between them**, because no external observer can be scheduled inside that window without a
   * storage-level lock, and taking one would require naming the credential table — a storage choice
   * `11-F23` deliberately leaves to the implementation. That gap is REPORTED rather than papered
   * over with a weaker assertion that reads like it covers it. The observable half of the invariant
   * is swept unconditionally by L3.
   */
  type AtomicFixture = {
    org: string;
    scope: StaffScope;
    branch: string;
    person: string;
    pin: string;
  };

  const freshPerson = async (label: string, pin: string): Promise<AtomicFixture> => {
    const api = await staff();
    const org = `org-${label}-${newId()}`;
    const branch = `branch-${label}-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const person = await addPerson({
      org_id: org,
      display_name: `Atomic ${label}`,
      email: null,
      grid_ordinal: 4,
      assignments: [{ role: "cashier", branch_id: branch, status: "active" }],
    });
    await api.setPinCredential(db, {
      org_id: org,
      user_id: person,
      pin_hash: await hashPin(pin),
      now: T,
    });
    await api.publishStaffRoster(db, scope, [person], { now: T });
    return { org, scope, branch, person, pin };
  };

  it("L1 leaves BOTH facts unchanged when the caller's transaction aborts, and moves BOTH when it commits", async () => {
    const api = await staff();
    const fx = await freshPerson("l1", "3608");

    // ── the ABORT. `setUserStatus` runs on the handle the test controls, and the test then throws
    // out of the transaction. If both writes are one unit of work, nothing survives this; if the
    // credential delete escaped to another connection, it committed and she comes back `active`
    // holding no hash — `11-F23`'s "`active` member with no credential row", reached in one second
    // instead of one power cut.
    const abort = new Error("L1: the test aborts this transaction on purpose");
    let caught: unknown;
    try {
      await db.transaction(async (tx) => {
        await api.setUserStatus(tx as unknown as Db, {
          org_id: fx.org,
          user_id: fx.person,
          branch_id: fx.branch,
          status: "inactive",
        });
        throw abort;
      });
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBe(abort);

    await api.publishStaffRoster(db, fx.scope, [fx.person], { now: T + 1 });
    const afterAbort = entryOf(await api.staffPage(db, fx.scope, 0, 0), fx.person, "L1 abort");
    expect(afterAbort.status).toBe("active");
    expect(await verifyPin(afterAbort.pin_hash ?? "", fx.pin)).toBe(true);

    // ── the COMMIT, which is the control: the same call outside a transaction moves BOTH facts, so
    // the paragraph above is about atomicity and not about a `setUserStatus` that does nothing.
    await api.setUserStatus(db, {
      org_id: fx.org,
      user_id: fx.person,
      branch_id: fx.branch,
      status: "inactive",
    });
    await api.publishStaffRoster(db, fx.scope, [fx.person], { now: T + 2 });
    const afterCommit = entryOf(await api.staffPage(db, fx.scope, 0, 0), fx.person, "L1 commit");
    expect(afterCommit.status).toBe("inactive");
    expect(carriesHash(afterCommit)).toBe(false);

    // …and the ROW went with it (§K2's probe: this was her last active assignment).
    await api.setUserStatus(db, {
      org_id: fx.org,
      user_id: fx.person,
      branch_id: fx.branch,
      status: "active",
    });
    await api.publishStaffRoster(db, fx.scope, [fx.person], { now: T + 3 });
    expect(
      entryOf(await api.staffPage(db, fx.scope, 0, 0), fx.person, "L1 row").pin_hash,
    ).toBeUndefined();
  });

  it("L2 leaves BOTH facts unchanged when the transition is REFUSED", async () => {
    // `11-F22` closes the vocabulary at two and E2 asserts that at `insertUser`; this asserts the
    // same clause at the OTHER writer of the same field, and asserts what a refusal costs. A writer
    // that deleted the credential and then validated the word would refuse loudly and still have
    // destroyed her PIN — the torn state with an error message on top, which is worse than the
    // silent one because it looks handled.
    const api = await staff();
    const fx = await freshPerson("l2", "7714");
    await expect(
      api.setUserStatus(db, {
        org_id: fx.org,
        user_id: fx.person,
        branch_id: fx.branch,
        status: "suspended",
      }),
    ).rejects.toThrow(/11-F22/);

    await api.publishStaffRoster(db, fx.scope, [fx.person], { now: T + 1 });
    const entry = entryOf(await api.staffPage(db, fx.scope, 0, 0), fx.person, "L2");
    expect(entry.status).toBe("active");
    expect(await verifyPin(entry.pin_hash ?? "", fx.pin)).toBe(true);
  });

  it("L3 INVARIANT: no artifact this suite ever published carries a hash on a non-`active` entry", async () => {
    // The observable half of "`inactive` holding a live credential", swept across every page this
    // file produces rather than asserted once. D3 owns one member on the SNAPSHOT path; this walks
    // the delta path and the `at_version` path too, where a publisher that applied `11-F21`'s
    // active-only join on one code path and not another is otherwise invisible.
    const fx = await arc();
    const mainFx = await main();
    const api = await staff();
    const pages: readonly (readonly [string, StaffPage])[] = [
      ["arc hiredA", fx.hiredA],
      ["arc hiredB", fx.hiredB],
      ["arc movedA", fx.movedA],
      ["arc movedB", fx.movedB],
      ["arc repeatedB", fx.repeatedB],
      ["arc republishedA", fx.republishedA],
      ["arc republishedB", fx.republishedB],
      ["arc departedA", fx.departedA],
      ["arc departedB", fx.departedB],
      ["arc reactivatedB", fx.reactivatedB],
      ["arc recredentialedB", fx.recredentialedB],
      ["main A snapshot", await api.staffPage(db, mainFx.scopeA, 0, 0)],
      ["main A delta from 2", await api.staffPage(db, mainFx.scopeA, 2, 0)],
      ["main A at_version 3", await api.staffPage(db, mainFx.scopeA, 0, 0, 3)],
      ["main B snapshot", await api.staffPage(db, mainFx.scopeB, 0, 0)],
    ];
    let nonActiveSeen = 0;
    for (const [label, page] of pages) {
      for (const entry of page.entries) {
        if (entry.status === "active") continue;
        nonActiveSeen += 1;
        expect(`${label}/${entry.user_id}: ${carriesHash(entry)}`).toBe(
          `${label}/${entry.user_id}: false`,
        );
      }
    }
    // ⚠ ANTI-VACUITY. A sweep over a set with no non-`active` entry in it asserts nothing, and this
    // suite has been through one amendment already; nine are reachable from the pages above.
    expect(nonActiveSeen).toBeGreaterThanOrEqual(8);
  });
});

/* ── §M `at_version` is a CONTINUATION, never a SELECTOR (01-F75) ─────────────────────────────── */

/**
 * ⚠ **ADDED 2026-08-18, AND IT IS A CREDENTIAL LEAK BEFORE IT IS A PROTOCOL RULE.**
 *
 * `01-F75` verbatim: *"`at_version` is honoured only on a CONTINUATION (`from > 0`), and a first page
 * is served the CURRENT version whatever it asks for."* The FR states its own measurement, which is
 * why this section exists rather than reading as a hardening: *"a brand-new till — a `01-N5`
 * replacement that has never held any roster — asked for `at_version: 1` and was served a departed
 * cashier's entry `active`, **with the Argon2id hash R32 had deleted, and her old PIN verified
 * against it**."*
 *
 * **The main fixture is already that database.** Bilal is `inactive` at v3 and R32 deleted his
 * credential row on that flip; versions 1 and 2 of the publication log still carry the entry he had
 * while `active`. So the leak needs no fixture of its own — it needs an assertion, and the honest
 * reason there was none is worth writing down, because it is a shape rather than an oversight:
 *
 *   · **C6** asked for `at_version: 2` and asserted `status`, saying in its own note that it was
 *     "deliberately about `status` and not about a hash" so that either answer to `11-F23`'s then-open
 *     credential question passed. It reached the page and declared the hash out of scope.
 *   · **§L3** sweeps every page this file produces for a hash on a non-`active` entry — and the leaked
 *     entry reads `active`, because at version 1 he was. It reached the entry and declared it out of
 *     scope.
 *
 * Two correct assertions, each excluding what the other covered, and the leak sat in the gap. **The
 * assertions below are therefore written the other way round**: M1 is about the request, M2 is about
 * the bytes regardless of any entry's status, and M2 greps the WHOLE response rather than the
 * declared `pin_hash` field, because a leak through a field this suite's types do not name would
 * satisfy every per-field assertion in this file.
 *
 * ⚠ **WHAT IS DELIBERATELY NOT ASSERTED — the residual, reported rather than papered over.** The FR
 * rules the FIRST page and honours `at_version` on a continuation, so a caller that passes
 * `from > 0` **is** served the historical fold, hash and all (M3 is that leg, and it is the control
 * that stops the clause being implemented as "ignore `at_version`"). The FR's own ground for
 * accepting that is *"no device has a reason to open a page run at a version it does not hold"* —
 * a reachability argument about clients, not a bound the server enforces. Asserting a refusal there
 * would invent policy (commandment 2) and would red a correct implementation; it is carried to the
 * session's report as a finding for `01-F71` (e)'s serve path, which is where a request is authorized
 * at all.
 */
describe("§M — `01-F75`: `at_version` is a CONTINUATION, never a SELECTOR", () => {
  it("M1 serves a FIRST page the CURRENT version whatever it asks for", async () => {
    // Every label below is inside the expectation string on purpose: a bare `toBe(3)` inside a loop
    // reports "expected 3, received 1" with no way to tell which request produced it.
    const fx = await main();
    const api = await staff();
    const current = [fx.ayesha, fx.bilal, fx.danish, fx.hina].sort().join(",");
    for (const at of [1, 2, 3, 77] as const) {
      const label = `first page asking at_version ${at}`;
      const page = await api.staffPage(db, fx.scopeA, 0, 0, at);
      expect(`${label}: version ${page.version}`).toBe(`${label}: version 3`);
      expect(`${label}: form ${page.form}`).toBe(`${label}: form snapshot`);
      // ⚠ AND THE BYTES, not just the number. A clamp that fixed the reported `version` and went on
      // folding to the asked one would answer "3" over version 1's roster — one artifact under two
      // numbers, which is worse than the leak it was meant to close, and `01-F56` cannot see it.
      // At v1 danish is absent and at v2 bilal reads `active`, so both legs separate the folds.
      expect(`${label}: ${ids(page).join(",")}`).toBe(`${label}: ${current}`);
      expect(`${label}: bilal ${entryOf(page, fx.bilal, label).status}`).toBe(
        `${label}: bilal inactive`,
      );
    }
  });

  it("M2 serves a departed cashier's deleted credential to NOBODY, at any version a first page asks", async () => {
    // R32 (`11-F23`): the credential row "does not outlive her employment in the database". `01-F75`
    // records that a read defeated it — the row was gone and the publication log still carried the
    // copy frozen at v1. `11-F21`'s named failure is the same one from the other end: "the set grows
    // monotonically with turnover until a branch till holds the Argon2id hash of everyone who has
    // ever worked there", reached here by a till that never held any of them.
    const fx = await main();
    const api = await staff();

    // ⚠ ANTI-VACUITY, and it is the leg that makes every "false" below mean something: this publisher
    // DOES carry a working credential on this very page, for a member who still has one. Without it,
    // an implementation that never carried a hash at all would pass M2 and fail nobody until a
    // cashier could not sign in. (D2 owns the rule; this owns the attribution.)
    const now = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(
      await verifyPin(entryOf(now, fx.ayesha, "M2 anti-vacuity").pin_hash ?? "", fx.ayeshaPin),
    ).toBe(true);

    for (const at of [undefined, 1, 2, 3, 77] as const) {
      const label = `first page asking at_version ${String(at)}`;
      const page = await api.staffPage(db, fx.scopeA, 0, 0, at);
      // He is IN the artifact — a departure is a marked entry, never an absence (§E1) — so every
      // assertion below is about a row that exists rather than about one that is missing.
      const entry = entryOf(page, fx.bilal, label);
      // ⚠ THE CREDENTIAL LEGS COME FIRST, DELIBERATELY. M1 already owns the version, and this test's
      // first failure must name the LEAK rather than repeat that — the `status` legs at the bottom
      // are corroboration, and a run that reported them first would read as a protocol nit.
      //
      // The deleted bytes appear NOWHERE in the response: not on his entry, not on anyone else's,
      // and not under a field these types do not declare.
      expect(
        `${label}: response contains the deleted hash ${JSON.stringify(page).includes(fx.bilalPinHash)}`,
      ).toBe(`${label}: response contains the deleted hash false`);
      // …the FR's own measurement — his old PIN verifies against nothing that was served…
      for (const served of page.entries) {
        expect(
          `${label}/${served.user_id}: departed PIN verifies ${await verifyPin(served.pin_hash ?? "", fx.bilalPin)}`,
        ).toBe(`${label}/${served.user_id}: departed PIN verifies false`);
      }
      // …and his own entry carries no hash and is marked departed (`11-F21`, `11-F22`).
      expect(`${label}: bilal carries a hash ${carriesHash(entry)}`).toBe(
        `${label}: bilal carries a hash false`,
      );
      expect(`${label}: bilal ${entry.status}`).toBe(`${label}: bilal inactive`);
    }
  });

  it("M3 CONTROL: a CONTINUATION is still honoured, at a version that is not the current one", async () => {
    // ⚠ THE OVER-STRICTNESS CONTROL, one branch away from M1, and the reason the clause is not
    // "ignore `at_version`". `PROTOCOL.md` makes the field **required on every continuation**:
    // without it "the server re-reads the current version per page, so a publish landing mid-fetch
    // changes both the version and the ordering the offset indexes into, and the device commits a
    // mixture of two menus under one number (`01-F56`, and it is silent and permanent)". An
    // implementation that closed M1/M2 by dropping the field entirely passes both and reintroduces
    // exactly that, on a resource carrying credentials.
    //
    // ⚠ **PINNED READING: `from: 1` is a continuation.** The FR keys the rule on `from > 0` and on
    // nothing else, and `PROTOCOL.md` calls `from` "the paging cursor, echoed from
    // `catalog_response.next_from`". This suite cannot echo a real cursor — the fold is four entries
    // and comes back `complete` (C1), so no page run here ever produces a non-zero `next_from` to
    // echo — and constructing one would mean asserting a page SIZE that no FR states. The
    // alternative reading (a cursor is only a continuation if the server issued it) would make the
    // clause unassertable and is named here rather than assumed away.
    //
    // Two legs, both independent of page size and of entry ordering, so neither can red a correct
    // implementation: the version is the one asked for, and danish — who joined at v2 — is in no
    // slice of the v1 fold under any cursor interpretation.
    const fx = await main();
    const api = await staff();
    const cont = await api.staffPage(db, fx.scopeA, 0, 1, 1);
    expect(cont.version).toBe(1);
    expect(ids(cont)).not.toContain(fx.danish);
  });
});

/* ── §N a DELTA is the fold at its target, never the intermediate log rows (01-F75) ───────────── */

/**
 * ⚠ **ADDED 2026-08-18, AND IT IS THE SAME CREDENTIAL LEAK THROUGH A DIFFERENT FIELD.**
 *
 * `01-F75` verbatim (`6e30636`): *"a delta carries ONE entry per changed id, the greatest version ≤
 * the target — the same fold a snapshot at that version is, restricted to the ids that changed."*
 * It supersedes the catalog's inherited *"every published row with `A < version <= B`"*, and the FR
 * states its own measurement: *"a cashier published `active` with a hash at v2 and departed at v3 is
 * served her v2 row, hash and all, to any caller that says `have_version: 1`. Measured after the
 * `at_version` clause landed and with the suite green — the deleted PIN still verified against the
 * served bytes."*
 *
 * **WHY §M DID NOT CATCH IT, which is the part that generalises.** §M was written for the
 * `at_version` door and closed exactly that door: M1 and M2 sweep `at_version` with `have_version`
 * pinned at **0**, so every page they inspect is a SNAPSHOT and no assertion in §M has ever crossed
 * the delta path. §C does cross it — and asserts `ids()`, which the row-replay reading gets right,
 * never the entry COUNT. And no fixture above this line could have shown it anyway: the leak needs a
 * publication **strictly between** the base a caller claims and the current version, and the main
 * roster publishes bilal at v1 and v3 with nothing in between. So three correct things — a sweep, an
 * id assertion and a fixture — left one gap between them, which is how the first door survived too.
 *
 * **The assertions below are therefore written to be door-independent.** N2's property is *no
 * response ever carries a credential that was deleted*, swept over `have_version` × `from` ×
 * `at_version` rather than asserted at one point of it, matched against the **whole JSON body**
 * (a leak through a field these types do not declare satisfies every per-field assertion in this
 * file) and against `verifyPin` on every credential the sweep actually served. N1 and N3 assert the
 * SHAPE — one entry per changed id, byte-identical to the snapshot at the same target — because a
 * fix that merely stripped hashes from the intermediate rows would pass a leak test while still
 * replaying a person's history to every device that reconnects.
 *
 * ⚠ **WHAT IS DELIBERATELY NOT ASSERTED.** The sweep covers every request whose TARGET is the
 * current version. A continuation naming a HISTORICAL version is served that historical fold, hash
 * and all — §M's own recorded residual, on the FR's ground that *"no device has a reason to open a
 * page run at a version it does not hold"* — so including one here would red a correct
 * implementation. That residual belongs to `01-F71` (e)'s serve path, which does not exist yet, and
 * it is unchanged by this section: `have_version` is a BASE and cannot name a target, so nothing
 * below narrows what M3 protects.
 */

/**
 * §N's fixture — one branch published THREE times, with two people whose rows change at a version
 * strictly INSIDE the window a delta from version 1 covers.
 *
 *   v1  zara   `active`, credential Z    — never published again, so she is in NO delta from 1
 *   v2  nadia  `active`, credential N    · farah `inactive`, no credential (`11-F21`)
 *   v3  nadia  `inactive`, R32 DELETES N · farah re-activated with a NEW credential F
 *
 * From base 1 the changed ids are {nadia, farah}; each has TWO published rows inside the window and
 * is owed exactly ONE entry. **They move in opposite directions on purpose** — a credential
 * disappears, a credential appears — so "the greatest version ≤ the target" is pinned rather than
 * merely "one row per id": a dedup keeping the FIRST row serves nadia's deleted hash *and* farah's
 * departed row, and both are named failures below.
 */
type ReplayFixture = {
  org: string;
  branch: string;
  scope: StaffScope;
  zara: string;
  nadia: string;
  farah: string;
  /** A credential the current fold still carries — N2's anti-vacuity leg. */
  zaraPin: string;
  /** The credential R32 deleted at v3, and the bytes it was frozen into version 2 as. */
  nadiaPin: string;
  nadiaPinHash: string;
  farahPin: string;
};

let replayFixture: Promise<ReplayFixture> | undefined;

const buildReplay = async (): Promise<ReplayFixture> => {
  const api = await staff();
  const org = `org-replay-${newId()}`;
  const branch = `branch-replay-${newId()}`;
  await addOrg(org);
  await addBranch(org, branch);
  const scope: StaffScope = { org_id: org, branch_id: branch };

  const zaraPin = "1122";
  const nadiaPin = "3344";
  const farahPin = "5566";

  const zara = await addPerson({
    org_id: org,
    display_name: "Zara Malik",
    email: null,
    grid_ordinal: 10,
    assignments: [{ role: "cashier", branch_id: branch, status: "active" }],
  });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: zara,
    pin_hash: await hashPin(zaraPin),
    now: T,
  });
  const v1 = await api.publishStaffRoster(db, scope, [zara], { now: T });
  if (v1 !== 1) throw new Error(`fixture: replay v1 minted version ${v1}, expected 1`);

  const nadia = await addPerson({
    org_id: org,
    display_name: "Nadia Sheikh",
    email: null,
    grid_ordinal: 20,
    assignments: [{ role: "cashier", branch_id: branch, status: "active" }],
  });
  const nadiaPinHash = await hashPin(nadiaPin);
  await api.setPinCredential(db, {
    org_id: org,
    user_id: nadia,
    pin_hash: nadiaPinHash,
    now: T + 1,
  });
  // farah is published at v2 as a non-`active` member with no credential — the specified shape
  // (`01-F75`: "a missing `pin_hash` on a non-`active` member is NOT `malformed`"), and the row a
  // first-wins dedup would hand back at v3.
  const farah = await addPerson({
    org_id: org,
    display_name: "Farah Javed",
    email: null,
    grid_ordinal: 30,
    assignments: [{ role: "cashier", branch_id: branch, status: "inactive" }],
  });
  const v2 = await api.publishStaffRoster(db, scope, [nadia, farah], { now: T + 1 });
  if (v2 !== 2) throw new Error(`fixture: replay v2 minted version ${v2}, expected 2`);

  await api.setUserStatus(db, {
    org_id: org,
    user_id: nadia,
    branch_id: branch,
    status: "inactive",
  });
  // R32's two-step re-activation, in the order the ruling states it: flip the status, then set a PIN.
  await api.setUserStatus(db, {
    org_id: org,
    user_id: farah,
    branch_id: branch,
    status: "active",
  });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: farah,
    pin_hash: await hashPin(farahPin),
    now: T + 2,
  });
  const v3 = await api.publishStaffRoster(db, scope, [nadia, farah], { now: T + 2 });
  if (v3 !== 3) throw new Error(`fixture: replay v3 minted version ${v3}, expected 3`);

  return { org, branch, scope, zara, nadia, farah, zaraPin, nadiaPin, nadiaPinHash, farahPin };
};

const replay = (): Promise<ReplayFixture> => {
  replayFixture ??= buildReplay();
  return replayFixture;
};

describe("§N — `01-F75`: a delta is the FOLD at its target, never the intermediate log rows", () => {
  it("N1 carries ONE entry per changed id — not one per intervening publish — and it is the LATEST", async () => {
    const fx = await replay();
    const api = await staff();
    const page = await api.staffPage(db, fx.scope, 1, 0);

    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(1);
    expect(page.version).toBe(3);

    // ── "restricted to the ids that changed": zara was published at v1 and never again.
    expect(ids(page)).toEqual([fx.farah, fx.nadia].sort());
    expect(ids(page)).not.toContain(fx.zara);

    // ── "ONE entry per changed id". Stated per person as well as in total, so a run names WHO was
    // replayed rather than reporting a length. Both have two rows in `1 < version <= 3`, so the
    // superseded reading answers four entries here and the FR's answer is two.
    expect(page.entries).toHaveLength(2);
    for (const [who, user_id] of [
      ["nadia", fx.nadia],
      ["farah", fx.farah],
    ] as const) {
      const count = page.entries.filter((entry) => entry.user_id === user_id).length;
      expect(`${who}: entries in the delta ${count}`).toBe(`${who}: entries in the delta 1`);
    }

    // ── "the greatest version ≤ the target", in BOTH directions, so a first-wins dedup dies here
    // too and not only on the credential. Nadia's v2 row is `active` carrying the hash R32 has
    // since deleted; farah's v2 row is `inactive` carrying none.
    const nadia = entryOf(page, fx.nadia, "N1 nadia");
    expect(`nadia: ${nadia.status}`).toBe("nadia: inactive");
    expect(`nadia: carries a hash ${carriesHash(nadia)}`).toBe("nadia: carries a hash false");
    const farah = entryOf(page, fx.farah, "N1 farah");
    expect(`farah: ${farah.status}`).toBe("farah: active");
    expect(await verifyPin(farah.pin_hash ?? "", fx.farahPin)).toBe(true);
  });

  it("N2 serves a DELETED credential to nobody, under every combination of have_version/from/at_version", async () => {
    // The property, stated so no fix aimed at one field can close it: **no response whose target is
    // the current version carries a credential the database no longer holds** (R32/`11-F23` — it
    // "does not outlive her employment in the database"), whatever combination of `have_version`,
    // `from` and `at_version` produced it. The first door was `at_version` and the second was
    // `have_version`; `01-F75`'s own generalisation is that *"every client-supplied version field is
    // a request to read [the publication] log, so each one needs its own answer"*, and this sweeps
    // them together rather than trusting that the list of fields is closed.
    const fx = await replay();
    const mainFx = await main();
    const api = await staff();

    type Artifact = {
      label: string;
      scope: StaffScope;
      current: number;
      /** what R32 deleted: the exact bytes, and the PIN they were made from */
      deleted: { who: string; hash: string; pin: string };
      /** a PIN the CURRENT fold still verifies — the anti-vacuity leg */
      livePin: string;
    };
    const artifacts: readonly Artifact[] = [
      {
        label: "replay branch",
        scope: fx.scope,
        current: 3,
        deleted: { who: "nadia", hash: fx.nadiaPinHash, pin: fx.nadiaPin },
        livePin: fx.zaraPin,
      },
      {
        // The main roster carries the same rule through a different history (bilal is published at
        // v1 and v3 with nothing between), so a fix that special-cased one publication pattern is
        // visible as a difference between these two rows rather than as a single green tick.
        label: "main branch A",
        scope: mainFx.scopeA,
        current: 3,
        deleted: { who: "bilal", hash: mainFx.bilalPinHash, pin: mainFx.bilalPin },
        livePin: mainFx.ayeshaPin,
      },
    ];

    // Every request whose TARGET is the current version. A FIRST page is served the current version
    // whatever `at_version` it names (§M), and a continuation naming the current one targets it
    // explicitly; the historical continuation is the FR's own residual and is excluded — see the
    // section header.
    const requests = (
      current: number,
    ): readonly { have: number; from: number; at?: number | undefined }[] => {
      const out: { have: number; from: number; at?: number | undefined }[] = [];
      for (const have of [0, 1, 2, 3, 4, 99]) {
        for (const at of [undefined, 1, 2, 3, 77]) out.push({ have, from: 0, at });
        for (const at of [undefined, current]) out.push({ have, from: 1, at });
      }
      return out;
    };

    // Argon2id PHC strings, matched out of the RAW BODY rather than off the declared field: a
    // credential smuggled into a member these types do not name would satisfy every `pin_hash`
    // assertion in this file, and this is the only assertion here that could see it.
    const phc = /\$argon2id\$[^"]+/g;

    for (const artifact of artifacts) {
      const served = new Set<string>();
      const combos = requests(artifact.current);
      for (const { have, from, at } of combos) {
        const label = `${artifact.label} have_version ${have} from ${from} at_version ${String(at)}`;
        const page = await api.staffPage(db, artifact.scope, have, from, at);
        const body = JSON.stringify(page);
        // ── the exact deleted bytes appear NOWHERE in the response.
        expect(
          `${label}: contains ${artifact.deleted.who}'s deleted hash ${body.includes(artifact.deleted.hash)}`,
        ).toBe(`${label}: contains ${artifact.deleted.who}'s deleted hash false`);
        for (const found of body.match(phc) ?? []) served.add(found);
      }

      // ── and the FR's own measurement, against every credential the sweep actually served: the
      // departed PIN verifies against none of them. (Deduplicated across the sweep because
      // `verifyPin` runs at `01-F61`'s cost floor and the same bytes recur on every page; the set is
      // the union of every entry of every response above, which is strictly more than the declared
      // `pin_hash` of each.)
      let live = false;
      for (const hash of served) {
        expect(
          `${artifact.label}: ${artifact.deleted.who}'s departed PIN verifies ${await verifyPin(hash, artifact.deleted.pin)}`,
        ).toBe(`${artifact.label}: ${artifact.deleted.who}'s departed PIN verifies false`);
        if (!live) live = await verifyPin(hash, artifact.livePin);
      }

      // ⚠ ANTI-VACUITY, and it is what makes every `false` above mean something. Without it an
      // implementation that carried no credential at all — or one that answered every request with
      // an empty page — passes this test and fails nobody until a cashier cannot sign in.
      expect(`${artifact.label}: requests swept ${combos.length}`).toBe(
        `${artifact.label}: requests swept 42`,
      );
      expect(`${artifact.label}: distinct credentials served ${served.size >= 2}`).toBe(
        `${artifact.label}: distinct credentials served true`,
      );
      expect(`${artifact.label}: a live PIN still verifies ${live}`).toBe(
        `${artifact.label}: a live PIN still verifies true`,
      );
    }
  });

  it("N3 makes each delta entry BYTE-IDENTICAL to the snapshot's at the same target", async () => {
    // *"The same fold a snapshot at that version is, restricted to the ids that changed"* — so the
    // device *"reaches the identical state either way"*, which is the FR's own reason for saying the
    // intermediate rows were never information it needed. This is the assertion a hash-stripping
    // repair cannot pass: strip `pin_hash` from the replayed v2 rows and the leak test goes quiet,
    // while the delta still carries two entries per person and neither extra one equals the fold.
    const fx = await replay();
    const api = await staff();
    const snapshot = await api.staffPage(db, fx.scope, 0, 0);
    const delta = await api.staffPage(db, fx.scope, 1, 0);

    expect(snapshot.form).toBe("snapshot");
    expect(delta.form).toBe("delta");
    for (const entry of delta.entries) {
      expect(entry).toEqual(entryOf(snapshot, entry.user_id, `N3 ${entry.user_id}`));
    }

    // ⚠ ANTI-VACUITY. The loop above is satisfied by an empty delta, and a delta of the WHOLE
    // roster satisfies it too — the first is C4's shape at the wrong base, the second is the
    // "always answer a snapshot" implementation C2 kills. Both counts are stated.
    expect(`snapshot entries ${snapshot.entries.length}`).toBe("snapshot entries 3");
    expect(`delta entries ${delta.entries.length}`).toBe("delta entries 2");
  });
});

/* ── §O `01-F78`: WHO a branch's roster contains, and WHAT her row carries ────────────────────── */

/**
 * ⚠ **ADDED 2026-08-18. `01-F78` (`67e9885`) ANSWERS `01 §9.7`, WHICH THIS FILE HAS CARRIED AS
 * EXCLUSIONS 1 AND 2 SINCE IT WAS AUTHORED** — both are amended in the header rather than deleted,
 * because what they said is why §I3 is scoped the way it is. **The code predates the FR**, and the
 * FR says so in its own first sentence: `01 §9.7` said in terms that *"nothing selects a roster's
 * rows until this is ruled"* and *"a first implementation selected them anyway and decided the
 * second half in a query, which is the case this FR exists to stop being decided silently"*.
 *
 * **BOTH HALVES, VERBATIM, BECAUSE THEY ARE TWO CLAIMS AND NOT ONE.**
 *
 *   · **Half one — who is in it:** *"every person holding an assignment that REACHES this branch.
 *     That is her own-branch assignments plus `01-F26`'s org-wide ones (`branch_id: null`), which is
 *     how an owner holds Appendix A's 'everything' and therefore how she unlocks a till at a branch
 *     she does not staff. A person assigned to two branches appears in **both** artifacts … The rule
 *     is exactly `rolesAt`'s existing predicate in `packages/domain` — `branch_id === null ||
 *     branch_id === this branch` — which matters more than its content: `can()` already answers 'may
 *     she act HERE' that way, so a roster built on any other rule would populate a grid with people
 *     the matrix then refuses, and the till would offer a tile that cannot do anything."*
 *   · **Half two — what her row carries:** *"only the assignments that reach this branch, never all
 *     of them."* `01 §9.7` names the cost of the other answer and the FR quotes it — *"a row
 *     carrying every branch's assignment also tells every till the org's branch structure"* — which
 *     is `01-F71`'s isolation boundary crossed *"by a reference-data artifact rather than by a
 *     query"*. And: *"It is also the half R25 was bought for: making the roster branch-scoped to
 *     narrow the credential blast radius, and then shipping the org's whole assignment graph inside
 *     it, spends the purchase."*
 *
 * **THE FIXTURE IS THE THING TO GET RIGHT, AND THIS FILE ALREADY PROVED WHY.** Every person in §A–§I
 * holds exactly ONE assignment, to her own branch — the case all three candidate readings of §9.7
 * agreed on, which is what made those sections authorable while it was open. **Neither half of
 * `01-F78` is visible through such a person**: half one needs someone whose reach comes from
 * somewhere other than her own-branch assignment, and half two needs a row with a second assignment
 * to keep OUT of it. It is the same shape as this package's own `M1` mutant, where a
 * `participationAt` returning `assignments[0]` passed 55 tests because no fixture person had a
 * second assignment to disagree with the first. So §O's people are built the other way round:
 *
 *   naila  cashier@A + cashier@B + owner@org-wide  — in BOTH artifacts; her A row must name A and
 *                                                    org-wide and must NOT name B
 *   uzma   owner@org-wide ONLY                     — in both artifacts, staffing neither branch
 *   sadia  cashier@B ONLY                          — absent from A's artifact ENTIRELY
 *
 * **WHAT THIS SECTION DELIBERATELY DOES NOT ASSERT (commandment 2).**
 *
 *  1. **WHETHER an out-of-reach person is REFUSED at the publisher or silently dropped from the
 *     artifact.** `01-F78` rules what the artifact CONTAINS — *"absent from this artifact
 *     entirely"* — and says nothing about the writer's failure mode, so O3 asserts the content and
 *     accepts either mechanism by construction. Pinning a refusal would red an implementation that
 *     filters, and pinning a filter would red the one that refuses; one of those two is shipped and
 *     an oracle that guesses which blocks the implementer either way (`oracle-round-2-findings.md`
 *     §C's third pattern).
 *  2. **WHICH status a row carries when a person holds BOTH a branch assignment here and an
 *     org-wide one.** `01-F78`'s last clause makes the status *"THIS branch's"* per `11-F22`, and
 *     for a person with one reaching assignment that is unambiguous (§J owns it). Where she holds
 *     two reaching assignments, nothing in the corpus says which supplies the word — it is a
 *     READING, recorded as one in this service's guide — so naila's three assignments are all
 *     `active`, and no assertion here can tell the readings apart. That is deliberate: an oracle
 *     that pinned one would be ruling `01 §9.7`'s successor question by test.
 *  3. **Whether the artifact's membership is recomputed at publish time for people the caller did
 *     not name.** The contracted surface takes `changed_user_ids` (see the header), so who is in
 *     the artifact is the fold of what has been published for the key; `01-F78` is about which
 *     people may be in it, not about when a publisher notices a new assignment. That is §9.5's
 *     question and is untouched here.
 */
type PublishOutcome = { refused: false; version: number } | { refused: true; message: string };

/** A publish whose outcome is the assertion rather than the fixture's precondition. */
const attemptPublish = async (publish: () => Promise<number>): Promise<PublishOutcome> => {
  try {
    return { refused: false, version: await publish() };
  } catch (cause) {
    return { refused: true, message: String(cause).split("\n")[0] ?? String(cause) };
  }
};

/** `published` or `refused: <message>` — so a failing assertion prints WHY, not just that it did. */
const outcomeLabel = (outcome: PublishOutcome): string =>
  outcome.refused ? `refused: ${outcome.message}` : "published";

/** `01-F26`'s pair as a sortable label: the ORDER of a person's assignments is specified nowhere. */
const assignmentLabels = (entry: StaffEntry): string[] =>
  entry.assignments.map((one) => `${one.role}@${one.branch_id ?? "org-wide"}`).sort();

/**
 * §O's fixture — TWO branches of one org, and three people chosen so that each leg of `01-F78`
 * separates a correct implementation from a plausible wrong one.
 *
 * **The three publishes that could be refused are CAPTURED rather than awaited into the build.**
 * A mutant that drops the org-wide leg of the reach predicate refuses to publish uzma at all, and a
 * fixture that let that throw would take every test in this section down as one hook error naming
 * the fixture — legible to nobody, and indistinguishable from a broken database. Captured, the same
 * mutant fails O1 by name and leaves O2/O4/O5 reporting on their own claims.
 */
type ReachFixture = {
  org: string;
  branchA: string;
  branchB: string;
  scopeA: StaffScope;
  scopeB: StaffScope;
  /** cashier@A + cashier@B + owner@org-wide — the only shape either half of `01-F78` is visible in */
  naila: string;
  /** owner@org-wide ONLY — `01-F26`'s null location, and how an owner reaches a branch she does not staff */
  uzma: string;
  /** cashier@B ONLY — the person `01-F78` puts NOWHERE in branch A's artifact */
  sadia: string;
  ownerIntoA: PublishOutcome;
  ownerIntoB: PublishOutcome;
  sadiaIntoA: PublishOutcome;
  pageA: StaffPage;
  pageB: StaffPage;
};

let reachFixture: Promise<ReachFixture> | undefined;

const buildReach = async (): Promise<ReachFixture> => {
  const api = await staff();
  const org = `org-reach-${newId()}`;
  const branchA = `branch-reach-a-${newId()}`;
  const branchB = `branch-reach-b-${newId()}`;
  await addOrg(org);
  await addBranch(org, branchA);
  await addBranch(org, branchB);
  const scopeA: StaffScope = { org_id: org, branch_id: branchA };
  const scopeB: StaffScope = { org_id: org, branch_id: branchB };

  const naila = await addPerson({
    org_id: org,
    display_name: "Naila Farooq",
    email: null,
    grid_ordinal: 10,
    // All three `active` on purpose — see exclusion 2 in the section header. Two branches AND an
    // org-wide assignment on one person is `01-F78`'s own worked shape ("plus `01-F26`'s org-wide
    // ones"), and G8's control already pins that the writer stores it.
    assignments: [
      { role: "cashier", branch_id: branchA, status: "active" },
      { role: "cashier", branch_id: branchB, status: "active" },
      { role: "owner", branch_id: null, status: "active" },
    ],
  });
  const uzma = await addPerson({
    org_id: org,
    display_name: "Uzma Tariq",
    email: null,
    grid_ordinal: 20,
    assignments: [{ role: "owner", branch_id: null, status: "active" }],
  });
  const sadia = await addPerson({
    org_id: org,
    display_name: "Sadia Aslam",
    email: null,
    grid_ordinal: 30,
    assignments: [{ role: "cashier", branch_id: branchB, status: "active" }],
  });

  // ONE hash for the three of them, computed once — `hashPin` is deliberately ~0.4 s (`01-F61`'s
  // floor) and no assertion in this section reads a credential. They carry one because `11-F21`
  // puts the hash on every `active` entry, so a roster with none would be an unusual artifact to
  // make a claim about isolation on.
  const pin = await hashPin("6473");
  for (const user_id of [naila, uzma, sadia]) {
    await api.setPinCredential(db, { org_id: org, user_id, pin_hash: pin, now: T });
  }

  const v1a = await api.publishStaffRoster(db, scopeA, [naila], { now: T });
  if (v1a !== 1) throw new Error(`reach fixture: A minted version ${v1a}, expected 1`);
  const ownerIntoA = await attemptPublish(() =>
    api.publishStaffRoster(db, scopeA, [uzma], { now: T + 1 }),
  );

  const v1b = await api.publishStaffRoster(db, scopeB, [naila, sadia], { now: T + 2 });
  if (v1b !== 1) throw new Error(`reach fixture: B minted version ${v1b}, expected 1`);
  const ownerIntoB = await attemptPublish(() =>
    api.publishStaffRoster(db, scopeB, [uzma], { now: T + 3 }),
  );

  // ⚠ **THE TWO-BRANCH PERSON IS REPUBLISHED, AND THE REASON IS §O5's, MEASURED RATHER THAN
  // ASSUMED.** Without this she is published at version 1 of each artifact and never again, so
  // every DELTA §O5 asks for — the changed ids after a base — carries only the org-wide owner,
  // whose row has no other branch on it to leak. **Measured out of tree, both ways, rather than
  // reasoned:** an implementation that filters the row on the SNAPSHOT path alone passes this whole
  // file **66/66** with these two lines removed, and is killed by **O5 alone** with them in — on
  // `have_version 1`, which is the delta. That is §N's recorded shape (a sweep that never crossed
  // the delta path) reproduced inside the test written to be door-independent, caught in the hour
  // rather than in a round.
  // No version number is asserted for these two, deliberately: what they mint depends on whether
  // the org-wide publish above was accepted, and THAT is O1's claim rather than this line's
  // precondition. A fixture that hard-coded 3 here would take the whole section down as one hook
  // error under exactly the implementation O1 exists to name.
  await api.publishStaffRoster(db, scopeA, [naila], { now: T + 4 });
  await api.publishStaffRoster(db, scopeB, [naila], { now: T + 5 });

  // LAST, so that whichever way it goes it cannot move the version numbers the lines above assert.
  // A publisher that refuses her writes nothing; one that drops her mints a version whose fold is
  // unchanged. O3 is about the fold either way.
  const sadiaIntoA = await attemptPublish(() =>
    api.publishStaffRoster(db, scopeA, [sadia], { now: T + 6 }),
  );

  return {
    org,
    branchA,
    branchB,
    scopeA,
    scopeB,
    naila,
    uzma,
    sadia,
    ownerIntoA,
    ownerIntoB,
    sadiaIntoA,
    pageA: await api.staffPage(db, scopeA, 0, 0),
    pageB: await api.staffPage(db, scopeB, 0, 0),
  };
};

const reach = (): Promise<ReachFixture> => {
  reachFixture ??= buildReach();
  return reachFixture;
};

describe("§O — `01-F78`: a branch roster holds who can act THERE, and each row only what applies there", () => {
  it("O1 contains the ORG-WIDE owner, who staffs neither branch and reaches both", async () => {
    // `01-F78` half one: an org-wide assignment reaches this branch, "which is how an owner holds
    // Appendix A's 'everything' and therefore how she unlocks a till at a branch she does not
    // staff". `01-F26`'s null location is the encoding, and `rolesAt`'s predicate — `branch_id ===
    // null || branch_id === this branch` — is the rule the FR says the roster must share with
    // `can()`, "so a roster built on any other rule would populate a grid with people the matrix
    // then refuses".
    //
    // ⚠ This is the leg that separates the FR from the narrowest reading of §9.7 (own-branch
    // assignees only), and under that reading an owner cannot unlock ANY till — the whole product
    // has one org-wide person per tenant by construction (`create-owner`).
    const fx = await reach();
    expect(`branch A / the org-wide owner: ${outcomeLabel(fx.ownerIntoA)}`).toBe(
      "branch A / the org-wide owner: published",
    );
    expect(`branch B / the org-wide owner: ${outcomeLabel(fx.ownerIntoB)}`).toBe(
      "branch B / the org-wide owner: published",
    );
    expect(`branch A contains the owner: ${ids(fx.pageA).includes(fx.uzma)}`).toBe(
      "branch A contains the owner: true",
    );
    expect(`branch B contains the owner: ${ids(fx.pageB).includes(fx.uzma)}`).toBe(
      "branch B contains the owner: true",
    );
    // …and she is a whole member, not a name: `01-F61`'s grid renders a tile per entry.
    expect(entryOf(fx.pageA, fx.uzma, "O1 A").display_name).toBe("Uzma Tariq");
    expect(entryOf(fx.pageA, fx.uzma, "O1 A").status).toBe("active");
  });

  it("O2 puts a person assigned to TWO branches in BOTH artifacts, at one moment", async () => {
    // `01-F78` half one, verbatim: "A person assigned to two branches appears in **both**
    // artifacts, because she works at both and `03-F53` lets any member of the branch roster
    // identify at the pass."
    //
    // ⚠ This is NOT §J's transfer wearing a new name. §J is about the STATUS field being
    // per-(person, branch) — one person, two words, at one moment — and its person is deliberately
    // `inactive` at the branch she left. This is about MEMBERSHIP: she is `active` at both, and a
    // reading that admitted a person to only one artifact (her "home" branch, whatever that would
    // mean) passes every assertion in §J.
    const fx = await reach();
    expect(`branch A contains naila: ${ids(fx.pageA).includes(fx.naila)}`).toBe(
      "branch A contains naila: true",
    );
    expect(`branch B contains naila: ${ids(fx.pageB).includes(fx.naila)}`).toBe(
      "branch B contains naila: true",
    );
    expect(entryOf(fx.pageA, fx.naila, "O2 A").status).toBe("active");
    expect(entryOf(fx.pageB, fx.naila, "O2 B").status).toBe("active");
  });

  it("O3 leaves a person assigned only ELSEWHERE out of this artifact entirely", async () => {
    // `01-F78`'s stated cost: "a person whose ONLY assignments are at other branches is **absent
    // from this artifact entirely**, so a `02-F41` attribution written by her at this branch is
    // unresolvable here — which cannot happen, because she cannot unlock here either, and the two
    // facts are the same fact by half one."
    //
    // ⚠ **THE PUBLISH IS ATTEMPTED, NOT AVOIDED, AND THAT IS THE WHOLE TEST.** Under the contracted
    // surface the caller names ids, so a test that simply never names her asserts nothing: she is
    // absent under every implementation, including one that would have admitted her. The fixture
    // therefore names her in a publish to branch A and captures what happened; the assertion is on
    // the artifact, which is what `01-F78` rules (exclusion 1 in the section header).
    const fx = await reach();
    expect(`branch A contains sadia: ${ids(fx.pageA).includes(fx.sadia)}`).toBe(
      "branch A contains sadia: false",
    );
    // The whole body, not the id list: an entry smuggled under a member these types do not declare
    // satisfies every `entries[]` assertion in this file (§M2/§N2's reasoning, one field over).
    expect(`branch A response names sadia: ${JSON.stringify(fx.pageA).includes(fx.sadia)}`).toBe(
      "branch A response names sadia: false",
    );

    // ⚠ ANTI-VACUITY, and it is what makes the two `false`s above mean something. The same publisher,
    // the same artifact, the same fixture: the two people who DO reach branch A are in it. Without
    // this leg an implementation that published nobody — or one whose publish silently no-ops —
    // passes O3 and fails nobody until a branch has no staff grid at all.
    expect(ids(fx.pageA)).toEqual([fx.naila, fx.uzma].sort());
    // And she is in the artifact of the branch she IS assigned to, so what is being measured is the
    // predicate and not the person (`01-F78` half one applied at the other end).
    expect(`branch B contains sadia: ${ids(fx.pageB).includes(fx.sadia)}`).toBe(
      "branch B contains sadia: true",
    );
  });

  it("O4 carries ONLY the assignments that reach this branch on the row — never all of them", async () => {
    // `01-F78` half two. The row is `rolesAt`'s predicate applied to the person's own assignments:
    // her assignment naming THIS branch, plus her org-wide ones, and nothing else. Naila holds
    // three; branch A's row carries two of them and branch B's row carries the other two, and the
    // org-wide one is in both because it reaches both.
    //
    // ⚠ **THE ORG-WIDE ASSIGNMENT MUST SURVIVE THE FILTER, AND THAT IS HALF THE CLAIM.** A repair
    // that read "only this artifact's" as "only the assignment naming this branch" strips it, and
    // then `authorize.ts`'s `can()` subject on that till holds a cashier where an owner works —
    // which is the mirror of the defect the FR's own reasoning names ("a roster built on any other
    // rule would populate a grid with people the matrix then refuses"). Uzma's row is the same
    // claim with nothing else on it: an org-wide-only person's row is her org-wide assignment.
    //
    // Sorted labels rather than `toEqual` on the array: `01-F26` fixes no ORDER, so asserting one
    // would red a correct implementation that assembles the row from a different query (I3 is
    // `toEqual` only because a single-element array has no order to get wrong).
    const fx = await reach();
    expect(assignmentLabels(entryOf(fx.pageA, fx.naila, "O4 A"))).toEqual(
      [`cashier@${fx.branchA}`, "owner@org-wide"].sort(),
    );
    expect(assignmentLabels(entryOf(fx.pageB, fx.naila, "O4 B"))).toEqual(
      [`cashier@${fx.branchB}`, "owner@org-wide"].sort(),
    );
    expect(assignmentLabels(entryOf(fx.pageA, fx.uzma, "O4 owner"))).toEqual(["owner@org-wide"]);
  });

  it("O5 never names another branch in this artifact, under any request that serves it", async () => {
    // `01 §9.7`'s cost sentence, which `01-F78` half two quotes as its reason: "a row carrying every
    // branch's assignment also tells every till the org's branch structure" — `01-F71`'s isolation
    // boundary crossed by reference data rather than by a query, and "the half R25 was bought for".
    //
    // ⚠ **SWEPT, AND MATCHED ON THE WHOLE BODY, FOR TWO REASONS THIS FILE HAS ALREADY PAID FOR.**
    // (i) `staffPage` has three response paths (empty delta, delta, snapshot) and O4 inspects one:
    // §N's own header records that §M's sweep never crossed the delta path and a leak lived exactly
    // there for a round. A filter applied at publish time covers all three; one applied on the way
    // out may not, and only a sweep can tell them apart. (ii) The claim is that the STRING never
    // travels — a branch id smuggled through a field these types do not declare tells the till the
    // same thing that a declared one does.
    const fx = await reach();
    const api = await staff();
    const currentA = await api.staffVersion(db, fx.scopeA);
    const currentB = await api.staffVersion(db, fx.scopeB);

    for (const [label, scope, current, own, foreign] of [
      ["branch A", fx.scopeA, currentA, fx.branchA, fx.branchB],
      ["branch B", fx.scopeB, currentB, fx.branchB, fx.branchA],
    ] as const) {
      let swept = 0;
      let sawOwnBranch = false;
      let nailaSeen = 0;
      for (const have of [0, 1, 2, 99]) {
        for (const from of [0, 1]) {
          for (const at of [undefined, current] as const) {
            const where = `${label} have_version ${have} from ${from} at_version ${String(at)}`;
            const page = await api.staffPage(db, scope, have, from, at);
            swept += 1;
            const body = JSON.stringify(page);
            expect(`${where}: names the OTHER branch ${body.includes(foreign)}`).toBe(
              `${where}: names the OTHER branch false`,
            );
            if (body.includes(own)) sawOwnBranch = true;
            const naila = byId(page, fx.naila);
            if (naila === undefined) continue;
            nailaSeen += 1;
            expect(`${where}: naila ${assignmentLabels(naila).join(" ")}`).toBe(
              `${where}: naila ${[`cashier@${own}`, "owner@org-wide"].sort().join(" ")}`,
            );
          }
        }
      }
      // ⚠ ANTI-VACUITY, three ways, because "the string is absent" is exactly the claim an empty
      // response satisfies. The sweep ran; it served this branch's OWN id at least once (so the
      // assignments field is populated and the match above is looking at something); and it served
      // the two-branch person's row at least once (so the row the claim is about was inspected).
      expect(`${label}: requests swept ${swept}`).toBe(`${label}: requests swept 16`);
      expect(`${label}: served its own branch id ${sawOwnBranch}`).toBe(
        `${label}: served its own branch id true`,
      );
      expect(`${label}: naila's row inspected ${nailaSeen > 0}`).toBe(
        `${label}: naila's row inspected true`,
      );
    }
  });
});

/* ── §P a version number is a FACT about the key, and 0 is one of its values (01-F77) ─────────── */

/**
 * ⚠ **ADDED 2026-08-18. A POPULATED KEY THAT ANSWERS `version: 0`.**
 *
 * **The shape came from the serve path's early returns and its reachability from the wire codec —
 * neither from a description of it nor from a reading of what the code MEANT to do.** `staffPage`
 * resolves the version it will serve before it reads a row, and `01-F75`'s continuation clause
 * honours `at_version` when `from > 0`; so a CONTINUATION naming `at_version: 0` resolves to 0 and
 * takes the "nothing has ever been published for this key" branch — over a key that has published
 * three times. It is a request a device can actually send: `packages/sync-protocol` declares
 * `at_version: seq.optional()` with `seq = z.number().int().nonnegative()`, which makes **0
 * wire-legal and every negative value unreachable**, so 0 is the only member of its family that
 * needs an answer and the only one asserted below.
 *
 * **WHAT THE FR DECIDES, WHICH IS THE MEANING OF THE NUMBER AND NOT THE HANDLING OF THE REQUEST.**
 * `01-F77`: an artifact for which the org has published nothing is *"omitted, never sent as `0`"* —
 * the value has one meaning, *published nothing*, and this suite's contracted surface states it
 * again for `staffVersion` (*"`0` = nothing has ever been published for this key"*). §A2 pins that
 * meaning from one side: a never-published key answers 0. **§P is the same claim from the other
 * side, and the two together are what make the number a fact about the key rather than a property
 * of the request.** `01-F76` makes every comparison per artifact key, so the number is all a device
 * has: a response labelled 0 over a populated key is either discarded by `01-F56`'s monotonic apply
 * (the device holds v3 and has just been told to go backwards — the fetch achieves nothing and the
 * device cannot tell it was answered wrongly), or applied by a device holding nothing, where
 * `01-F75`'s snapshot form makes `entries: []` with `complete: true` the WHOLE roster and the till
 * believes the branch has no staff. R28 is what that costs: a never-received roster *"refuses,
 * loudly, at boot"* — *"a device that has never received a roster has nobody who can sign in, which
 * is a **stopped till**"*.
 *
 * **WHAT THE FR DOES NOT DECIDE, SO NEITHER DOES THIS SECTION (commandment 2).** *Which* answer an
 * `at_version: 0` continuation deserves. Three are defensible from the corpus and none is written
 * down: serve the current version (0 is not a version, so the field is unset), serve the device's
 * base, or refuse the request — `PROTOCOL.md` already says the server *"serves that exact version
 * or refuses"*, so a refusal is inside the vocabulary. **Every assertion below therefore accepts a
 * refusal and constrains only what a response may SAY**, and the sweep's controls are what stop
 * that generosity from making the test vacuous: the ordinary requests beside it must still be
 * answered, at the current version, with the roster in them.
 */
describe("§P — `01-F77`: the version a response states is one THIS key has published", () => {
  it("P1 never answers a POPULATED key with version 0, the number that means 'published nothing'", async () => {
    const fx = await main();
    const api = await staff();
    const current = await api.staffVersion(db, fx.scopeA);
    expect(`branch A current version ${current}`).toBe("branch A current version 3");

    let answered = 0;
    let swept = 0;
    for (const have of [0, 1, 2, 3, 99]) {
      for (const from of [0, 1]) {
        const where = `have_version ${have} from ${from} at_version 0`;
        swept += 1;
        let page: StaffPage | undefined;
        try {
          page = await api.staffPage(db, fx.scopeA, have, from, 0);
        } catch {
          // A refusal is one of the answers the corpus admits for a request naming a version
          // nobody published — see the section header. It is not asserted for, and it is not
          // asserted against.
          continue;
        }
        answered += 1;
        const stated = page.version;
        const published = stated >= 1 && stated <= current;
        // Both sides carry the number, so the boolean is what differs and the message names the
        // request that produced it — a bare `toBeGreaterThan` inside a loop reports neither.
        expect(`${where}: stated version ${stated} is one this key published ${published}`).toBe(
          `${where}: stated version ${stated} is one this key published true`,
        );
        // …and the artifact it claims to be. A snapshot from offset 0 IS the whole roster
        // (`01-F75`), and this key has four members at every version it has ever had, so an empty
        // complete one is the second half of the same false statement: not "you are up to date",
        // but "this branch has no staff".
        if (page.form === "snapshot" && from === 0) {
          expect(`${where}: snapshot from 0 carries entries ${page.entries.length > 0}`).toBe(
            `${where}: snapshot from 0 carries entries true`,
          );
        }
      }
    }
    expect(`requests swept ${swept}`).toBe("requests swept 10");

    // ⚠ ANTI-VACUITY / THE OVER-STRICTNESS CONTROLS, and they are the reason the loop above may
    // accept a refusal without becoming a test that passes against a serve path which refuses
    // everything. Neither control names a version nobody published, so neither is inside the
    // question this section asks: a first page and a continuation toward the current version are
    // ordinary traffic and must be SERVED, at the current version, with the roster in them.
    // (§M owns the `at_version` rule itself; these two are here so P1 cannot go quiet.)
    const first = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(`first page: version ${first.version} entries ${first.entries.length}`).toBe(
      `first page: version ${current} entries 4`,
    );
    const continuation = await api.staffPage(db, fx.scopeA, 0, 1, current);
    expect(`continuation: version ${continuation.version}`).toBe(
      `continuation: version ${current}`,
    );
    expect(`requests answered ${answered > 0}`).toBe("requests answered true");
  });

  it("P2 CONTROL: an EMPTY key still answers 0, because there 0 is TRUE", async () => {
    // The other side of the same claim, and the reason P1 cannot be satisfied by clamping the
    // number up. `01-F77` gives 0 one meaning; a serve path that answered 1 — or the current
    // version, or anything else — for a key nothing has published would tell a device to fetch an
    // artifact that does not exist, and `01-F56`'s comparison would then agree with itself forever.
    // §A2 asserts this for a first page; the sweep below is the same key under the same requests P1
    // sweeps, so a repair that special-cased the continuation cannot pass one and fail the other.
    const api = await staff();
    const scope: StaffScope = {
      org_id: `org-empty-p2-${newId()}`,
      branch_id: `branch-empty-p2-${newId()}`,
    };
    expect(await api.staffVersion(db, scope)).toBe(0);

    let answered = 0;
    for (const have of [0, 1, 2, 3, 99]) {
      for (const from of [0, 1]) {
        for (const at of [undefined, 0] as const) {
          const where = `empty key have_version ${have} from ${from} at_version ${String(at)}`;
          let page: StaffPage | undefined;
          try {
            page = await api.staffPage(db, scope, have, from, at);
          } catch {
            continue;
          }
          answered += 1;
          expect(`${where}: version ${page.version}`).toBe(`${where}: version 0`);
          expect(`${where}: entries ${page.entries.length}`).toBe(`${where}: entries 0`);
        }
      }
    }
    // ⚠ ANTI-VACUITY: the first-page request is the one §A2 already pins as SERVED, so this sweep
    // can never be an empty set of observations however the rest of it is answered.
    expect(`empty key: requests answered ${answered > 0}`).toBe(
      "empty key: requests answered true",
    );
  });
});
