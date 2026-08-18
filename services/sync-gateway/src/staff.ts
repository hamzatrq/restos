/**
 * **THE STAFF ROSTER'S CLOUD STORAGE — a publication log with its own version axis, and the
 * device-plane PIN credential** (`01-F75`, `01-F76`, `11-F21`, `11-F22`, `11-F23`, `01-F61`;
 * founder rulings R25, R26, R30, R32).
 *
 * `01-F28` requires PIN verification to work **on-device against synced credential hashes**, which
 * needs a source, and measured August 2026 there was none: the cloud user row was eight columns
 * with no credential, no status and no version axis, and the only roster any till had ever held was
 * a development seed of three fictional people. This module is the cloud half of closing that — the
 * storage and the writers. The wire (`01-F75`'s `reference_*` triple), the serve path on the device
 * socket and the back-office CRUD are steps 5, 6 and 4 of
 * `plans/saas-pivot/staff-over-the-wire.md` and are deliberately not here.
 *
 * ⚠ **THE FILE-HEADER DEBT MARKER IS GONE (step 4a, August 2026), AND ITS DELETION IS THE POINT.**
 * It read "NO SHIPPING CALLER REACHES THIS MODULE YET", naming `14-F14`'s `/internal/users*` routes
 * and `gateway.ts`'s `handleStaff` arm as the two landings that would close it. The FIRST of those
 * has landed — `user-crud.ts` calls `publishStaffRoster`, `setPinCredential`, `setUserStatus` and
 * `reachesBranch`; every act of that CRUD reaches this module, and each SYMBOL is reached by the
 * acts that need it (⚠ this said all four are called *"on every act of the CRUD"*, which is false of
 * `createPerson`: it calls neither `setPinCredential` nor `setUserStatus`, because a person is
 * created `active` and her PIN is a separate act — R29 has the owner set it) — so a header marker,
 * which covers **every export in the
 * module**, would now be re-muting three symbols that are reached and would fail `seams:check` as
 * STALE. The remaining debt is recorded at the DECLARATION of each symbol that still carries it
 * (`staffVersion`, `staffPage`), which is the shape `provision-device.ts` and `tenancy.ts` in
 * `packages/domain` both record as the one that cannot rot.
 *
 * ── ⚠ WHAT THIS IS *NOT*: `catalogPage`'s SQL POINTED AT `kernel.users` ─────────────────────────
 *
 * The plausible wrong answer compiles and passes almost everything. `kernel.users` is CURRENT STATE
 * with no version column; the catalog's storage is an append-per-version publication log. Assembling
 * a served roster from today's `kernel.users` rows hands a device that fetched v3 last week **today's
 * people labelled as last week's version** — which `01-F56`'s monotonic apply cannot detect, because
 * the number it compares is correct. So `staff_versions`/`staff_entries` are a real log
 * (`0012`), and what is served at version N is the bytes that were published at version N.
 *
 * The SHAPE is `catalog.ts`'s and is copied deliberately, because `01-F75` makes the response
 * vocabulary generic and unchanged: `form: snapshot | delta` / `version` / `base_version?` /
 * `entries[]` / `complete` / `next_from`, and a snapshot at V is the greatest `version <= V` per
 * person. What is NOT copied is the KEY: the catalog is ORG-scoped (`01-F52`) and the roster is
 * BRANCH-scoped (`01-F76`, R25 — "the roster's scope IS its credential blast radius: an unrevoked
 * device holds the credentials of everyone in its delivery scope, and branch scope is the half of
 * that cost which can be bought down").
 *
 * ⚠ **AND ONE MORE THING IS NOT COPIED: THE DELTA.** This paragraph said *"a delta from A to B is
 * `A < version <= B`"* — the catalog's inherited description, which `01-F75` OVERRULED at `6e30636`
 * because on a resource carrying credentials it replays history. **A delta carries ONE entry per
 * changed id, the greatest version ≤ the target — the same fold a snapshot at that version is,
 * restricted to the ids that changed.** See `staffPage`. The sentence is quoted here rather than
 * silently replaced because a comment restating an overruled rule is how the next session
 * reintroduces it, and this one had already been copied into `0012_staff_roster.sql` and into the
 * oracle's §C2.
 *
 * ── THE SPLIT `publishStaffRoster` IS BUILT ON ──────────────────────────────────────────────────
 *
 * The caller states WHICH people changed; the publisher assembles their rows from storage. `11-F23`
 * puts the credential `left join` INSIDE the publisher ("the publisher's `left join` produces the
 * specified shape without a branch"), so a publisher handed fully-formed rows could not do its job.
 *
 * ⚠ **THE SECOND HALF OF THIS PARAGRAPH RESTED ON `01 §9.7` BEING OPEN, AND IT IS NOT.** It said
 * that a publisher selecting its own members "would be answering an open question in a query",
 * quoting `01-F76`'s *"nothing can select a roster's rows until it is ruled"* — and `01-F78` ANSWERED
 * both halves in August 2026: a branch roster contains every person holding an assignment that
 * REACHES that branch, and each row carries only the assignments that reach it. The sentence is
 * replaced rather than deleted, because a design justified by a stale premise is a design the next
 * session re-derives from the same stale premise — and this file quoted the premise in three places,
 * including inside a `RangeError` an operator reads.
 *
 * **Ids in, rows assembled from storage, is still the shape — now on `11-F23` alone, which never
 * depended on the open question.** What moved is where half one is enforced: this publisher does not
 * SELECT the members, it REFUSES a named person no assignment of whose reaches this branch
 * (`participationAt` returns `undefined` and the throw below names her), so `01-F78` half one binds
 * negatively here and positively on `14-F14`'s caller. Selecting the set would now be a LEGAL design
 * and is still not built, for a reason of its own: the change set is what mints a version
 * (`01-F75`), so a publisher that decided membership would republish every member on every edit.
 *
 * ── ⚠ PARTICIPATION IS PER-(PERSON, BRANCH), AND THE FIRST BUILD OF THIS FILE GOT IT WRONG ───────
 *
 * `11-F22` carried two readings — its heading says *"a PERSON RECORD carries a participation
 * status"*, its transfer clause requires a cashier moving A→B to be *"`inactive` in A's roster and
 * `active` in B's at the same moment"* — and the FR now states the transfer clause as the operative
 * one. The first build stored a per-person column, and an adversarial review measured what that
 * cost against a real database: deactivating her at A **destroyed the credential B's artifact
 * needs** (an `active` member with no hash, the defect `11-F23` names), and any later republish at A
 * re-copied her CURRENT status and **silently returned a departed cashier to `active` with a working
 * PIN hash on her old branch's tills**. So the status rides `01-F26`'s assignment
 * (`PersonAssignment`), `setUserStatus` takes a `branch_id`, R32's credential deletion is keyed to
 * the LAST active assignment, and this publisher reads THIS branch's participation per person.
 *
 * **Both halves of the artifact key are checked here.** The person half always was; the BRANCH half
 * was not, and a publish into a branch no record names — or into another org's branch — was accepted
 * and minted version 1. See `assertBranchIsThisOrgs`.
 */

import { PersonAssignment, type PersonAssignmentT, PersonRecord } from "@restos/domain";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { readBranch } from "./tenancy.js";

/** The gateway's database handle — `catalog.ts`'s local alias, kept local for the same reason. */
type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * `01-F76`'s ARTIFACT SCOPE: "The shape is `{ org_id, branch_id }`, with `branch_id: null` meaning
 * ORG scope — ONE shape for every resource and not one per resource."
 *
 * **Two fields and never a concatenation** (`01-F71` (d), quoted by `01-F76`): `("ab","c")` and
 * `("a","bc")` are distinct tenants, and a separator-less key maps both to one delivery set —
 * "a cross-tenant leak with no error in it". Every query below carries both columns.
 */
export type StaffScope = { readonly org_id: string; readonly branch_id: string | null };

/**
 * `01-F26`'s `(role, location)` pair as the ARTIFACT carries it. `branch_id: null` is org-wide.
 *
 * ⚠ **No `status` here, and that is `11-F22`'s wire half stated deliberately.** Participation moved
 * onto the assignment in STORAGE (`kernel.users.assignments`, `PersonAssignment`); it did not move
 * onto the assignment on the WIRE. `01-F75` declares the `staff` row with exactly one `status`
 * field, and `01-F76` already makes this artifact branch-scoped, so an entry's single `status` **is**
 * this branch's participation and needs no second carrier. Two representations of one fact with
 * nothing ruling which wins is `11-F20`'s "ONE name, not one per plane" argument on another field.
 */
export type StaffAssignment = { readonly role: string; readonly branch_id: string | null };

/** `01-F75`'s `staff` row — one person as the artifact carries her. */
export type StaffEntry = {
  readonly user_id: string;
  /** `11-F20`: required on the wire, and it is the person's ONE name (never a re-derivation). */
  readonly display_name: string;
  /** `01-F61`'s explicit grid position — unique within the artifact, never derived. */
  readonly grid_ordinal: number;
  /**
   * `11-F22`: `active | inactive`, as published at this version — **this branch's** participation,
   * read from the assignment that names this branch (or from her org-wide one). A person who is
   * `inactive` here may be `active` in another branch's artifact at the same moment, which is the
   * transfer the FR is written around.
   */
  readonly status: string;
  /**
   * `01-F78` half two: **only the assignments that REACH this branch** — the ones naming it plus
   * `01-F26`'s org-wide ones. A device cannot compute *"she also works at Gulberg"* from this and
   * must not try; that is the property, not a gap for a later join to fill.
   */
  readonly assignments: readonly StaffAssignment[];
  /**
   * `11-F21` — present ONLY on an `active` entry, and its ABSENCE on a non-active one is the
   * SPECIFIED shape rather than a missing value (`01-F75`: "a validator that refuses it is the
   * stopped-till-through-a-validator"). A hash on a non-`active` entry is a credential no verifier
   * can ever reach: pure blast radius with no function.
   */
  readonly pin_hash?: string;
};

export type StaffPage = {
  readonly form: "snapshot" | "delta";
  readonly version: number;
  readonly base_version?: number;
  readonly entries: readonly StaffEntry[];
  readonly complete: boolean;
  readonly next_from: number;
};

/**
 * Rows per frame — `CATALOG_PAGE_SIZE`'s value and its reason unchanged: a device that has to hold
 * a partial snapshot in memory across pages can run out of memory mid-recovery on the 2–3 GB
 * reference hardware (`00 §4`). A branch roster is far smaller than a menu, so this is a bound
 * nothing is expected to reach; it exists so that a 400-person chain cannot discover the absence.
 */
const STAFF_PAGE_SIZE = 500;

const toNumber = (value: unknown): number => Number(value);

const rowToEntry = (row: Record<string, unknown>): StaffEntry => ({
  user_id: String(row.user_id),
  display_name: String(row.display_name),
  grid_ordinal: toNumber(row.grid_ordinal),
  status: String(row.status),
  assignments: row.assignments as readonly StaffAssignment[],
  // ABSENT, not null. `11-F23` chose a table over a column precisely so this is "no row" rather
  // than "a nullable field every reader must remember to check", and spreading an empty object is
  // what carries that distinction across the JSON boundary.
  ...(row.pin_hash === null || row.pin_hash === undefined
    ? {}
    : { pin_hash: String(row.pin_hash) }),
});

/**
 * The `(org, branch)` predicate, written once so no query can lose half of it.
 *
 * **`=`, and it is provably equivalent to `is not distinct from` HERE**: `branch_id` is `NOT NULL`
 * in `kernel.staff_versions` and `kernel.staff_entries` both, and `publishStaffRoster` refuses
 * `branch_id: null` **by name**, so there is no null branch on either side of the comparison. A
 * null-scoped read answers "nothing published for this key" under either operator.
 *
 * ⚠ **THE REASON HERE HAS NOW BEEN WRONG TWICE, IN OPPOSITE DIRECTIONS, AND THE THIRD VERSION IS
 * MEASURED RATHER THAN REASONED.** It first said `=` against NULL "would silently match every row
 * instead of none" — inverted; it matches none. The repair then said the operator therefore "buys
 * nothing at all" — true of the ROWS and false of the PLAN, which is the half nobody priced.
 * Measured 2026-08-18 against a real Postgres (`EXPLAIN (analyze, buffers)`, 20 branches × 50
 * versions × 20 people = 20 000 entries, freshly `ANALYZE`d):
 *
 *   · snapshot fold, `is not distinct from` → **Seq Scan**, 19 000 rows removed by filter, 273
 *     shared buffers. With `=` → Bitmap Index Scan on
 *     `staff_entries_org_branch_user_version_idx` with all three columns in the `Index Cond`, 0
 *     rows removed, **78** buffers.
 *   · `staffVersion`, `is not distinct from` → **Seq Scan** of the whole org's version log, 950
 *     rows removed, 8 buffers. With `=` → **Index Only Scan Backward** on the primary key,
 *     **1 row read**, 3 buffers.
 *
 * `is not distinct from` is not an indexable operator, so the branch column drops out of every
 * access path — every one of these plans becomes a Seq Scan. (⚠ *This sentence went on to say the
 * operator made `schema.ts`'s "both access paths in one index" comment describe an index the
 * queries could not use. That comment has since been corrected and no longer says it: measured,
 * only the SNAPSHOT fold uses that index and the delta scan uses the PRIMARY KEY, whatever the
 * operator is. The quotation is retired rather than repaired, because a comment quoting a comment
 * is two places to keep true.*) **`staffVersion` is the one that matters**: `hello_ack` reconciles this
 * artifact on **every reconnection** (`01-F77`), so a whole-table scan per reconnect is the cost,
 * and it grows with the org rather than with the branch being served.
 *
 * **The forward-looking note survives as a NOTE and is deliberately not acted on.** The day a
 * resource on `01-F76`'s shared scope shape publishes a real `branch_id: null` artifact, `=`
 * reports **nothing published over rows that are there** — an empty artifact with no error in it.
 * That resource needs a predicate that addresses a null branch; **this one is not it, and reaching
 * for this function then is the mistake this paragraph exists to stop.** Writing the operator here
 * today buys that future reader nothing and costs every reconnection an index.
 */
const scopedTo = (scope: StaffScope) =>
  sql`org_id = ${scope.org_id} and branch_id = ${scope.branch_id}::text`;

/**
 * The artifact's current version. `0` means nothing has ever been published **for this key** —
 * `catalog.ts`'s meaning of 0, which `01-F75` keeps verbatim and `01-F77` keeps PER KEY ("an
 * artifact for which the org has published nothing is omitted, never sent as `0`").
 *
 * ⚠ **IT CARRIES NO DEBT MARKER AND THAT IS THE RAIL'S ANSWER RATHER THAN A CLAIM ABOUT THE
 * PRODUCT — stated because a clean `seams:check` line here means less than it looks like.** Step 4a
 * gave this MODULE a shipping caller (`user-crud.ts` reaches `publishStaffRoster`,
 * `setPinCredential`, `setUserStatus` and `reachesBranch`), and Rule A counts an export as reached
 * when shipping code reaches it *or* when it is used inside its own reached module. This one is the
 * second: its only non-test caller is `staffPage`, three declarations down, which is itself owed a
 * caller. The rail's own report files that as a *"redundant export … 24-F15's knip metric, not this
 * rail's question"* — so a marker here fails as STALE (measured), and its absence must not be read
 * as *"a device asks this service for a roster version"*. Nothing does yet; step 6 does.
 */
export const staffVersion = async (db: Db, scope: StaffScope): Promise<number> => {
  const rows = await db.execute(
    sql`select coalesce(max(version), 0) as v from kernel.staff_versions where ${scopedTo(scope)}`,
  );
  return toNumber([...rows][0]?.v ?? 0);
};

/**
 * `01-F78`'s REACH PREDICATE — does this assignment apply AT this branch? Her own-branch ones plus
 * `01-F26`'s org-wide (`branch_id: null`) ones, and nothing else. Both halves of the FR are this one
 * question asked twice: half one asks it of a PERSON (does any of hers reach), half two asks it of
 * each ASSIGNMENT on her published row.
 *
 * ⚠ **THIS IS A SECOND COPY OF A RULE `packages/domain` ALREADY DECLARES, AND THE FIRST COPY IS NOT
 * EXPORTED — a recorded DEBT, not a design.** `01-F78` names the rule as *"exactly `rolesAt`'s
 * existing predicate in `packages/domain`"*, and that matters more than its content: `can()` already
 * answers *"may she act HERE"* that way, so a roster built on any other rule *"would populate a grid
 * with people the matrix then refuses"*. But `rolesAt` (`permissions.ts:536`) is a module-private
 * `const`, and measured 2026-08-18 over that package's `src/index.ts` there is no exported
 * equivalent — no predicate, no `assignmentsAt`, nothing that answers this question. So the choice
 * was between restating the expression here and changing a SACRED package outside this task's diff.
 * **What `18 §2` actually wants is the export**: `rolesAt` filtering through a shared predicate that
 * this file imports, so the rule has ONE declaration. Until that lands, two copies of one rule are
 * live and the hazard is the corpus's most-repeated one (`03-F40`'s two sensor bit layouts) — if you
 * change either, change both.
 *
 * **EXPORTED as of step 4a, so the count of copies did not go to three.** `14-F14`'s CRUD has to
 * ask the same question from the other end — *which* branch artifacts does an assignment set reach,
 * which are `01-F75`'s "each affected `(resource, scope)` key" — and a second expression of it in
 * `user-crud.ts` would have put half one's rule in two files inside one service, on top of the
 * `packages/domain` copy above. The parameter is the assignment's `branch_id` and nothing else, so
 * a caller holding `01-F26`'s wire pair (no `status`) can ask it too.
 */
export const reachesBranch = (
  assignment: { readonly branch_id: string | null },
  branch_id: string,
): boolean => assignment.branch_id === null || assignment.branch_id === branch_id;

/**
 * `11-F22`'s participation for ONE person at ONE branch: the assignment naming that branch, else her
 * org-wide one.
 *
 * **Its two `find`s are `reachesBranch` in PRECEDENCE order**, so `undefined` is exactly *"no
 * assignment of hers reaches this branch"* — which is `01-F78` half one's membership rule arriving
 * through the field the caller is refused for (see `publishStaffRoster`). The two are kept separate
 * because the ORDER is a reading and the reach is a rule; the union of the two `find`s is the
 * predicate above.
 *
 * **The FR puts the status on the assignment** — *"participation is carried where `01-F26` already
 * carries the relationship"* — so a person's participation at a branch is a lookup and never a
 * column. `01-F26`'s null location is org-wide (*"how an owner holds Appendix A's everything"*), so
 * an owner with only that assignment has a participation value at every branch, which is what makes
 * her publishable into any of her org's artifacts at all.
 *
 * ⚠ **The branch-specific assignment WINS over the org-wide one when a person holds both, and that
 * is a READING rather than a rule.** Nothing in the corpus rules on the pair. The specific answer is
 * chosen because it is the one an owner can act on — deactivating her at a branch has to mean
 * something while she still holds an org-wide role — and because the reverse makes the per-branch
 * field unreachable for exactly the people who have both. `undefined` (neither) is refused by the
 * caller BY NAME rather than defaulted, because there is no honest value: see `publishStaffRoster`.
 */
const participationAt = (
  assignments: readonly PersonAssignmentT[],
  branch_id: string,
): PersonAssignmentT | undefined =>
  assignments.find((assignment) => assignment.branch_id === branch_id) ??
  assignments.find((assignment) => assignment.branch_id === null);

/**
 * `01-F71`/`15-F27` — the BRANCH half of the artifact key names a branch of THIS org, or nothing is
 * published.
 *
 * ⚠ **This was MISSING and the gap was measured against a real database (August 2026):** publishing
 * into a branch **no record names**, and into **another org's branch**, were both accepted and
 * minted version 1. The function already refused `branch_id: null` by name, refused an empty change
 * set by name, and refused a stranger PERSON by name with a paragraph about `01-F68` carrying no
 * foreign key — and then wrote an artifact, carrying the Argon2id hashes of real people, keyed to a
 * branch that does not exist.
 *
 * **It is refused HERE OR NOWHERE**, exactly as `create-branch` and `insertUser` already refuse the
 * same shape: `01-F68` forbids a foreign key from any ledger table *ever* and `0010` extends the
 * restraint to the directory's own edges, so Postgres cannot answer this. `15-F27` puts the
 * completeness rule at the writer, and `01-F60` puts the same discipline at `publishCatalog`.
 *
 * ⚠ **Containment today is NOT what makes this safe, and that is why it is a defect rather than a
 * tidy-up.** `01-F71` (e) has the serve path derive the artifact key from the SESSION and refuse a
 * request that states another — but that path is step 6 of `plans/saas-pivot/staff-over-the-wire.md`
 * and does not exist, so nothing currently makes the containment true. A publisher is the only thing
 * standing between a mistyped `branch_id` and an artifact nothing will ever serve, or worse, one
 * another tenant's device is admitted to.
 */
const assertBranchIsThisOrgs = async (
  tx: Db,
  scope: StaffScope,
  branch_id: string,
): Promise<void> => {
  const branch = await readBranch(tx, branch_id);
  if (branch === undefined) {
    throw new RangeError(
      `publishStaffRoster: branch ${branch_id} has no record — nothing was published (01-F69, ` +
        "15-F27: ordering is enforced at the writer because the schema carries no foreign key, " +
        "01-F68). An artifact keyed to a branch that does not exist carries the Argon2id hashes " +
        "of real people to nobody, and no query would ever have reported it.",
    );
  }
  if (branch.org_id !== scope.org_id) {
    throw new RangeError(
      `publishStaffRoster: branch ${branch_id} belongs to org ${branch.org_id} and this publish ` +
        `names org ${scope.org_id} — nothing was published (01-F71: org data isolation is ` +
        "absolute and fail-closed). Both halves of the artifact key are checked, because a " +
        "correct person set under another tenant's branch is R25's credential blast radius " +
        "crossed by the half nobody looked at.",
    );
  }
};

/**
 * Publish a set of changes as the next version of THIS `01-F76` key.
 *
 * `01-F75`: "a write that changes an artifact **mints the next version** for each affected
 * `(resource, scope)` key" — so a PIN reset (`14-F14`), a rename, a re-ordering and a deactivation
 * are all publishes, and a device that never learns of one verifies against the old hash for ever.
 *
 * **THE TRANSACTION is the atomicity story, not the statement order** (`publishCatalog`'s recorded
 * correction, which applies here unchanged): a reader either sees nothing of version N or all of
 * it, because both writes commit together. The entries-then-version order is kept because it is the
 * order that stays correct if this is ever split, not because it is doing the work today.
 *
 * **Nothing here schedules anything.** `01-F75` specifies no scheduling field and R31 puts the time
 * on the ACT, staged above the publisher and released at the chosen moment — "so there is no
 * standing deferral left to enforce anywhere" and no device schedules anything. A publish reaching
 * this function is a publish that is happening now.
 *
 * ⚠ **WHAT THE `for update of u` BELOW CLOSES, AND THE NEIGHBOURING CASES IT DOES NOT — read this
 * before building `14-F14`'s CRUD, which is the first surface that calls this function and
 * `setUserStatus` on one request.** CLOSED, and measured rather than argued: a participation write
 * can no longer commit between this publisher's read of a person and its write of her row, so a
 * published entry is never a state that was already superseded when it committed. NOT closed, and
 * OWED to that surface:
 *
 *   · **A person who loses her branch ASSIGNMENT rather than her participation.** Her last published
 *     row at this branch stays `active` and keeps its hash, and this publisher then REFUSES to
 *     publish the correction — `participationAt` finds nothing reaching this branch and throws by
 *     name — so the only repair is to re-add the assignment and deactivate it. `01-F78`'s cost
 *     clause says this cannot arise (*"she cannot unlock here either, and the two facts are the same
 *     fact"*), which is true of the membership RULE and false of the published LOG, because a
 *     publication log is a record of what used to be true — the same distinction both credential
 *     doors in `staffPage` turned on. **Unreachable today: nothing in this service removes an
 *     assignment**, so it is recorded here rather than asserted, and it becomes reachable with the
 *     CRUD that can.
 *   · **`setPinCredential` takes no lock on `kernel.users`**, so a PIN set concurrent with a publish
 *     may be missed by that publish. That is a FRESHNESS loss and never a stale credential — the
 *     entry then carries the previous hash or none — and `14-F14` mints the next version anyway.
 *   · **⚠ THE LOCK ITSELF CREATES A DEADLOCK FOR THE EXACT CALLER THIS PARAGRAPH ADDRESSES, and
 *     naming it is the point of the paragraph.** `setUserStatus` then `publishStaffRoster` **inside
 *     ONE caller transaction**, two concurrent requests over two branches with overlapping publish
 *     sets: measured **8 of 8 rounds → `SQLSTATE 40P01`**, against **0 of 8** with this clause
 *     deleted and **0 of 8** with the same two calls in SEPARATE transactions. The overlap is
 *     structural, not exotic: by `01-F78` half one every org-wide person is in EVERY branch's
 *     artifact, so any two concurrent branch publishes already share her, and two requests each
 *     flipping a different org-wide person's status before publishing is enough. Worse, the order
 *     that deadlocks is the one this module pushes an implementer toward — a caller handing its own
 *     transaction is endorsed below, and status-then-publish is the only order that publishes the
 *     new status.
 *     **Severity is LIVENESS, not correctness:** both transactions stay atomic, Postgres aborts one
 *     loudly, nothing tears and no till stops. **The answer is measured and is not code here:**
 *     separate transactions, or a canonical acquisition order — building a lock protocol for a
 *     caller that does not exist would be commandment 2. It is written down because
 *     `"Postgres's deadlock detector is the backstop, not the design"` appears further down this
 *     file, and in this one shape it IS the design and it fires every time.
 *   · **The transfer ordering recorded on `setUserStatus` is untouched and is a different hazard:**
 *     it is about the order of two of ITS calls, not about this publisher racing one of them.
 */
export const publishStaffRoster = async (
  db: Db,
  scope: StaffScope,
  changed_user_ids: readonly string[],
  opts: { now: number; actor_user_id?: string | null },
): Promise<number> => {
  const branch_id = scope.branch_id;
  if (branch_id === null) {
    // `01-F76`/R25: the roster is BRANCH-scoped and the reason is the credential. An org-scoped
    // roster hands every device in the org every branch's Argon2id hashes, silently — the blast
    // radius branch scope exists to buy down. Refused by name rather than by the primary key's
    // NOT NULL, so an operator gets a sentence instead of a constraint violation.
    throw new RangeError(
      "publishStaffRoster: the staff roster has no ORG-scoped artifact — `branch_id: null` is " +
        "refused (01-F76, R25). Its scope IS its credential blast radius: an unrevoked device " +
        "holds the PIN hash of every active person in its delivery scope, and branch scope is " +
        "the half of that cost which can be bought down.",
    );
  }
  const ids = [...new Set(changed_user_ids)];
  if (ids.length === 0) {
    // `publishCatalog`'s rule one resource over: a version with no entries is not a change, and
    // minting one moves every device's version for nothing (`01-F75`).
    throw new RangeError("publishStaffRoster: an empty change set is not a version (01-F75)");
  }

  return db.transaction(async (tx: Db) => {
    // Serialized per ARTIFACT KEY, on `publishCatalog`'s reasoning: two concurrent publishes must
    // not both claim version N and leave two different rosters at one number, and the loser should
    // WAIT rather than abort because the caller is a person saving an edit. The two-argument form
    // takes the key as two integers — `hashtext(a || b)` would reintroduce `01-F71` (d)'s
    // concatenation in the one place it is easiest to excuse. (A hash collision here can only
    // over-serialize two unrelated branches; the `(org, branch, version)` primary key is still what
    // makes a double claim impossible.)
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('restos:staff:' || ${scope.org_id}::text),
                                       hashtext(${branch_id}::text))`,
    );

    await assertBranchIsThisOrgs(tx, scope, branch_id);

    // `11-F23`'s LEFT JOIN, inside the publisher: the credential is a separate table with its own
    // writer, and a missing row is the shape rather than an error. The org predicate is on BOTH
    // sides of the join, so a credential can never be read across the isolation boundary.
    //
    // ⚠ **`for update of u` IS THE SAME ROW LOCK `setUserStatus` ALREADY TAKES, AND IT IS NOT
    // DECORATION HERE EITHER.** Without it this read is not serialized against a concurrent
    // participation write, and the interleaving was MEASURED against a real Postgres: the publisher
    // reads her `active` with her hash, `setUserStatus` then commits the deactivation AND R32's
    // credential delete, and this transaction writes `{status: "active", pin_hash: <the hash R32
    // just deleted>}` as the version every till reconciles to on `hello_ack` (`01-F77`) — `11-F23`'s
    // own named state, *"`inactive` holding a live credential"*, reaching every device at the branch
    // from a publish that COMMITTED AFTER the departure, with nothing to republish it. Locking the
    // same rows makes the two acts totally ordered: either the deactivation is already in what this
    // reads, or it waits behind this transaction and `14-F14`'s own publish carries it.
    //
    // **`of u` and not a bare `for update`**: Postgres refuses a row lock on the nullable side of an
    // outer join (`0A000`), and the credential row is not what this is protecting — the status is.
    //
    // **`order by u.user_id` is the deadlock half, and it is the only thing this clause is for.**
    // Two publishes for DIFFERENT branches of one org may name overlapping people, and the advisory
    // lock above does not serialize them (different keys), so without a deterministic acquisition
    // order the two can take the same two rows in opposite orders. Measured here with `EXPLAIN`:
    // `LockRows` sits ABOVE the `Sort`, so the sorted order is the lock order. Postgres's deadlock
    // detector is the backstop, not the design.
    const people = [
      ...(await tx.execute(
        sql`select u.user_id, u.display_name, u.grid_ordinal, u.assignments,
                   c.pin_hash
            from kernel.users u
            left join kernel.user_credentials c
              on c.org_id = u.org_id and c.user_id = u.user_id
            where u.org_id = ${scope.org_id}
              and u.user_id in (${sql.join(
                ids.map((id) => sql`${id}`),
                sql`, `,
              )})
            order by u.user_id asc
            for update of u`,
      )),
    ];

    // `01-F71`: the isolation boundary is the ORG and it is fail-closed. A person this org has no
    // record of is refused before anything is written — publishing another tenant's person would
    // put her Argon2id credential onto this tenant's tills, which is R25's blast radius crossed by
    // a missing predicate rather than by a missing check. (WHICH of the OWN org's people a branch
    // artifact may contain is `01-F78` half one — every person holding an assignment that reaches
    // this branch — and it is enforced two statements below, where `participationAt` returns
    // `undefined` for a person none of whose assignments do. This predicate is the ORG boundary and
    // nothing else. ⚠ It said `01 §9.7` "is deliberately not decided here", which stopped being true
    // when `01-F78` decided it.)
    const found = new Set(people.map((row) => String(row.user_id)));
    const strangers = ids.filter((id) => !found.has(id));
    if (strangers.length > 0) {
      throw new RangeError(
        `publishStaffRoster: ${strangers.length} of ${ids.length} named people are not in org ` +
          `${scope.org_id} — nothing was published (01-F71: org data isolation is absolute and ` +
          `fail-closed). First: ${String(strangers[0])}. This directory carries no foreign key ` +
          "(01-F68), so nothing else would ever have told you the id was wrong.",
      );
    }

    const candidates = people.map((row) => {
      // ONE declaration of the assignment shape (`18 §2`), so a person whose stored assignments
      // predate `0012`'s backfill is refused by `11-F22`'s own sentence rather than by a NOT NULL
      // violation three statements later.
      const assignments = PersonRecord.shape.assignments.parse(row.assignments);
      const participation = participationAt(assignments, branch_id);
      if (participation === undefined) {
        throw new RangeError(
          `publishStaffRoster: ${String(row.display_name)} (${String(row.user_id)}) has no ` +
            `assignment naming branch ${branch_id} and no org-wide assignment, so this artifact ` +
            "has no participation value to publish for her — nothing was published (11-F22: the " +
            "status is per-(person, branch) and rides the assignment; 01-F75 requires one on the " +
            "row). Writing `inactive` would invent a departure and `active` would invent " +
            "employment. This refusal is ENDORSED rather than provisional: 01-F78 half one puts " +
            "in a branch roster exactly the people whose assignments REACH that branch — hers " +
            "plus the org-wide ones 01-F26 permits — and states in terms that a person whose " +
            "assignments are all at other branches is `absent from this artifact entirely`. So " +
            "there is no row to publish for her here, and there is no ruling still owed. " +
            "(⚠ This sentence used to say 01 §9.7 was OPEN and that a ruling admitting her would " +
            "have to say what her status is; 01-F78 is that ruling and it does not admit her.)",
        );
      }
      return {
        user_id: String(row.user_id),
        display_name: String(row.display_name),
        grid_ordinal: toNumber(row.grid_ordinal),
        // `11-F22`: THIS BRANCH's participation, never a per-person value. A per-person column is
        // what the first build stored, and its measured cost was the resurrection the FR names —
        // a republish at the old branch re-copying her CURRENT status and returning a departed
        // cashier to `active` with a working PIN hash on tills she no longer works at.
        status: participation.status,
        // `01-F78` HALF TWO: ONLY the assignments that REACH this branch — her own-branch ones
        // plus `01-F26`'s org-wide ones — and never all of them. `01 §9.7` names the cost of the
        // other answer, which is what this file shipped until August 2026: *"a row carrying every
        // branch's assignment also tells every till the org's branch structure"*, i.e. `01-F71`'s
        // isolation boundary crossed by a reference-data artifact rather than by a query, and R25's
        // purchase spent — the roster was made branch-scoped to narrow the credential blast radius,
        // and then carried the org's whole assignment graph inside it. Nothing on the device needs
        // the rest: `can()`'s subject is evaluated at THIS device's branch, `reportScope` narrows at
        // THIS device's branch, and `01-F61`'s grid renders a name.
        //
        // **Filtered at PUBLISH time, so the log holds the narrow bytes.** Every serve path —
        // snapshot, delta and the empty delta — then inherits it from one place; a filter applied on
        // the way out is one interpretation per path, and `staffPage`'s own history is what that
        // costs (a leak that lived in the delta arm alone for a round).
        //
        // The wire's assignments carry `01-F26`'s two members and NOT the status — see
        // `StaffAssignment`. Stripped rather than never read, because the status is what the line
        // above is derived from.
        assignments: assignments
          .filter((assignment) => reachesBranch(assignment, branch_id))
          .map((assignment) => ({
            role: assignment.role,
            branch_id: assignment.branch_id,
          })),
        // `11-F21`: THE HASH RIDES ONLY AN `active` ENTRY. Read from the credential table and then
        // dropped for a member who is not active HERE, rather than never read — R32 deletes the
        // row only when she is inactive everywhere, so a transferred cashier legitimately still
        // has a credential while one branch's artifact must not carry it.
        pin_hash: participation.status === "active" ? (row.pin_hash ?? null) : null,
      };
    });

    await assertOrdinalsUniqueInArtifact(tx, scope, candidates);

    const current = await tx.execute(
      sql`select coalesce(max(version), 0) as v from kernel.staff_versions
          where ${scopedTo(scope)}`,
    );
    const version = toNumber([...current][0]?.v ?? 0) + 1;

    for (const person of candidates) {
      await tx.execute(
        sql`insert into kernel.staff_entries
              (org_id, branch_id, version, user_id, display_name, grid_ordinal, status,
               assignments, pin_hash)
            values (${scope.org_id}, ${branch_id}, ${version}, ${person.user_id},
                    ${person.display_name}, ${person.grid_ordinal}, ${person.status},
                    ${JSON.stringify(person.assignments)}::jsonb, ${person.pin_hash})`,
      );
    }
    // LAST, deliberately — see the note above.
    await tx.execute(
      sql`insert into kernel.staff_versions (org_id, branch_id, version, published_at,
                                             actor_user_id)
          values (${scope.org_id}, ${branch_id}, ${version}, ${opts.now},
                  ${opts.actor_user_id ?? null})`,
    );
    return version;
  });
};

/**
 * `01-F75`: `grid_ordinal` is unique **WITHIN THE ARTIFACT**, and `01-F61` bans a derived tiebreak.
 *
 * A collision is precisely how a derived tiebreak is reintroduced — `listUsers` falls back to
 * `user_id asc` today, "the exact derived ordering `01-F61` forbids, and whose first build had this
 * bug, invisible to a test that only re-renders the same roster". So the check is against the
 * FOLDED artifact plus this publish's candidates: a collision between v1's member and v2's is
 * exactly the case a same-roster republish cannot see.
 *
 * **A member re-taking her OWN position is an ordinary republish, not a collision** — every version
 * after the first is that shape. The fold below therefore lets a candidate REPLACE her own previous
 * ordinal before the duplicate test runs.
 *
 * ⚠ **A non-`active` member's ordinal stays reserved, and that is a READING rather than a rule.**
 * `11-F22` retains a departed person in the artifact as a marked entry, so she is in the fold and
 * her position is taken. Nothing says whether a new hire may claim a departed cashier's tile;
 * excluding her would be as much an invention as including her, and "unique within the artifact"
 * read literally includes every entry the artifact contains.
 *
 * ⚠ **Uniqueness is NOT enforced in the schema**, although the plan asked for an org-wide unique
 * index. `01-F75` says in terms that "whether the cloud enforces uniqueness more widely than that
 * is a storage choice this FR does not make", and an org-wide index would forbid two branches from
 * both starting their identification grid at position 1 — which the artifact rule permits and which
 * is the natural way an owner numbers a second branch.
 */
const assertOrdinalsUniqueInArtifact = async (
  tx: Db,
  scope: StaffScope,
  candidates: readonly { user_id: string; grid_ordinal: number; display_name: string }[],
): Promise<void> => {
  const folded = await tx.execute(
    sql`select distinct on (user_id) user_id, grid_ordinal
        from kernel.staff_entries
        where ${scopedTo(scope)}
        order by user_id asc, version desc`,
  );
  const ordinalOf = new Map<string, number>(
    [...folded].map((row) => [String(row.user_id), toNumber(row.grid_ordinal)]),
  );
  for (const candidate of candidates) ordinalOf.set(candidate.user_id, candidate.grid_ordinal);

  const holder = new Map<number, string>();
  for (const [user_id, ordinal] of ordinalOf) {
    const taken = holder.get(ordinal);
    if (taken !== undefined) {
      const name = candidates.find((c) => c.user_id === user_id)?.display_name ?? user_id;
      throw new RangeError(
        `publishStaffRoster: grid_ordinal ${ordinal} would be held by two people in this ` +
          `artifact (${taken} and ${user_id}, "${name}") — nothing was published. 01-F75 makes ` +
          "the ordinal unique within the artifact and 01-F61 bans a derived tiebreak, so a " +
          "collision is exactly how ordering by user_id gets reintroduced and every tile after " +
          "it moves under a cashier's hand (27-F4).",
      );
    }
    holder.set(ordinal, user_id);
  }
};

/**
 * Answer a device's request for this artifact — `01-F75`'s response vocabulary, inherited from the
 * catalog unchanged.
 *
 * A **delta** if one can be constructed from that exact base, a **snapshot** otherwise — including
 * `have_version: 0`, a base this key never published, and a device from the future after a restore
 * (`22`). The base check carries the SCOPE as well as the version, and that is not decoration:
 * `01-F76`'s whole sentence is that a version number is meaningless without its key, so a device
 * holding branch A's version 3 must not be continued from branch B's log at 3 — it would apply
 * another branch's people onto its own roster and then authenticate them.
 *
 * ── ⚠ `at_version` IS A CONTINUATION AND NEVER A SELECTOR (`01-F75`, amended August 2026) ────────
 *
 * The FR's rule, verbatim: *"`at_version` is honoured only on a CONTINUATION (`from > 0`), and a
 * first page is served the CURRENT version whatever it asks for."* This function shipped the other
 * reading for one round — the forward-only clamp `at_version <= current`, **copied verbatim from
 * `catalogPage`, where it is correct for a menu** — and an adversarial review measured what that
 * costs on a resource carrying credentials: a brand-new till (a `01-N5` replacement that has never
 * held any roster) asked for `at_version: 1` and was served a departed cashier's entry `active`,
 * carrying the Argon2id hash R32 had deleted, and her old PIN verified against it. Deleting the
 * credential row was necessary and not sufficient, because the publication log still held the copy
 * frozen into version 1 — `11-F21`'s named failure ("the set grows monotonically with turnover
 * until a branch till holds the Argon2id hash of everyone who has ever worked there") reached by a
 * device that never held any of them, and defeated by a READ rather than by a retention bug.
 *
 * **What is deliberately NOT done here, so the next reader does not mistake this for a bound.** A
 * caller passing `from > 0` **is** still served the historical fold, hash and all; the FR's ground
 * for that is *"no device has a reason to open a page run at a version it does not hold"*, which is
 * a reachability argument about clients and not something a server enforces. What authorizes a
 * request at all is `01-F71` (e)'s serve path — the artifact key derived from the SESSION — and
 * that path does not exist yet (step 6 of `plans/saas-pivot/staff-over-the-wire.md`). Refusing a
 * continuation here instead would invent policy (commandment 2) and would break `01-F56`'s atomic
 * paged fetch, which is the field's whole reason for existing.
 *
 * ── ⚠ AND THE SAME LEAK HAD A SECOND DOOR THROUGH `have_version` (`01-F75`, amended `6e30636`) ───
 *
 * The rule, verbatim: *"a delta carries ONE entry per changed id, the greatest version ≤ the
 * target — the same fold a snapshot at that version is, restricted to the ids that changed."* This
 * function shipped the catalog's inherited reading for one round — *every* published row in
 * `have_version < version <= target` — which on a menu is merely redundant and here **replays
 * history**: a cashier published `active` with a hash at v2 and departed at v3 was served her v2
 * row, hash and all, to any caller that said `have_version: 1`. Measured after the `at_version`
 * clause above had landed and with the whole suite green — the deleted PIN still verified against
 * the served bytes. A device reaches the identical state either way, so nothing is lost; the
 * intermediate rows were never information it needed, only history it was being handed.
 *
 * **The generalisable point, which is why the FR records both doors rather than fixing them
 * quietly:** deleting a credential row (R32) bounds what the CURRENT artifact carries and nothing
 * else, and a publication log is by construction a record of what used to be true. **Every
 * client-supplied version field is a request to read that log**, so each one needs its own answer.
 * The three this function takes, and where each is answered: `at_version` by the continuation
 * clause above; `have_version` by the fold below; `from` by neither, because it is an OFFSET into
 * an already-chosen target and can name no version. If a fourth is ever added, it needs a third
 * clause and not an assumption that the list was closed.
 *
 * ⚠ **NO INPUT VALIDATION HAPPENS HERE, AND THAT IS A DEPENDENCY ON THE CODEC RATHER THAN A
 * DEFECT — stated because step 6 is where it could become one.** The bound on these three numbers
 * lives in `packages/sync-protocol`, whose `have_version` / `at_version` / `from` are all
 * `z.number().int().nonnegative()`, and `catalogPage` has had the same property since it was built
 * — one interpretation of the wire's number range rather than two (`18 §2`). **Whoever wires the
 * `handleStaff` arm owns keeping that true**: a serve path that reaches these three arguments from
 * anywhere but a parsed frame has to bring its own refusal with it.
 *
 * ⚠ *This paragraph demonstrated that with `at_version: -1, from: 1` answering `{ version: -1,
 * entries: [], complete: true }`. **It no longer does**, and the example is corrected rather than
 * deleted because the next reader would otherwise re-derive the old behaviour from it: the
 * `at_version > 0` guard below swallows a negative exactly as it swallows 0, since neither names a
 * version. It was also aimed at the wrong half of the range — **the negative was unreachable and
 * `0` was wire-legal**, and it was the reachable value that shipped a defect (see the guard). What
 * is genuinely still unbounded here is `from`, which reaches `offset`: a negative one is a loud
 * Postgres error rather than a wrong answer.*
 *
 * **⚠ `catalogPage` still clamps forward-only AND still replays its intermediate rows, and
 * `01-F75` makes both rules uniform across resources rather than carve-outs for `staff`.** That is
 * a REPORTED divergence and not a silently-left one: the catalog is a shipped serve path with its
 * own oracle and its own callers, so it is not changed from this file. The cost of the catalog case
 * is FRESHNESS and redundancy rather than a credential — a menu carries no hash, and `01-F53`
 * freezes a line's price into the event at line-add — which is why it is a uniformity debt here and
 * was a leak there. Until it moves, one FR has two implementations one function apart, which is the
 * shape the FR amendment names ("a per-resource carve-out is a rule someone reproduces incorrectly
 * the next time the set grows"), arrived at from the other direction.
 *
 * @unreached-owed step 6 of `plans/saas-pivot/staff-over-the-wire.md` — the device serve path, which
 * is `gateway.ts`'s `handleStaff` arm over `01-F75`'s `reference_*` frames. Step 4a landed the WRITE
 * half's callers (`user-crud.ts`); nothing on the read half has one yet.
 */
export const staffPage = async (
  db: Db,
  scope: StaffScope,
  have_version: number,
  from: number,
  /**
   * The version a CONTINUATION page is toward, echoed by the device from page 1 — what makes a
   * paged fetch atomic in the version dimension (`01-F75`). Absent on a first request, where the
   * server picks the current version and tells the device what it is — and **IGNORED on a first
   * request that states one anyway**, which is the clause above.
   */
  at_version?: number,
): Promise<StaffPage> => {
  const current = await staffVersion(db, scope);
  // `01-F75`: honoured only where a continuation exists, which is `from > 0` and nothing else. The
  // `<= current` half is retained beneath it and is a different rule for a different case: never a
  // version from the future, because after a restore (`22`) the cloud can legitimately be BEHIND a
  // device, and pinning forward would serve rows that no longer exist.
  //
  // ⚠ **`at_version: 0` NAMES NO VERSION, AND HONOURING IT ANSWERED A POPULATED KEY WITH
  // `version: 0` (fixed August 2026).** `01-F52`/`01-F77` give the number exactly one meaning —
  // *"an artifact for which the org has published nothing is omitted, never sent as `0`"* — so 0 is
  // the one value in its range that no key has ever published. Honoured as a continuation target it
  // resolved to 0 and fell into the branch below, and the request that reached it is ordinary:
  // `from: 1, at_version: 0` over a key at version 3, at ANY `have_version`. **Reachable from the
  // wire, which is what makes it a defect rather than an argument** — `packages/sync-protocol`
  // declares `at_version: seq.optional()` with `seq = z.number().int().nonnegative()`, so every
  // negative value is unreachable and **0 is legal**. What it told a device is a lie in both
  // directions: one holding v3 discards the answer under `01-F56`'s monotonic apply and its fetch
  // achieves nothing, and one holding nothing applies a `complete` snapshot with no entries — the
  // whole roster, per `01-F75` — and believes the branch has no staff, which is R28's stopped till.
  //
  // **The repair is `at_version > 0` and deliberately nothing more (commandment 2).** `01-F75`
  // rules what `at_version` MEANS and not what an out-of-range one deserves; a value that names no
  // version leaves nothing to honour, so the request is served exactly as the two neighbouring
  // cases already are — a first page, and a continuation that states no `at_version` at all, both
  // get `current`. The alternatives are defensible and unwritten (refuse it, as `PROTOCOL.md`'s
  // *"serves that exact version or refuses"* permits; or serve the device's own base), and choosing
  // one of those here would invent policy for a request no shipped client sends.
  const version =
    from > 0 && at_version !== undefined && at_version > 0 && at_version <= current
      ? at_version
      : current;
  if (version === 0) {
    // Nothing published for this key — and after the guard above that is now the ONLY way to get
    // here, because `version` is either `current` or a positive `at_version` no greater than it.
    // (It was not: this comment was false for every `at_version: 0` continuation, which is the
    // shape the paragraph above records.) An honest empty snapshot rather than a refusal — what a
    // device DOES with an empty roster is R28's ruling (it refuses, loudly, at boot), and that is
    // the device's decision to make with the answer, not this function's to make for it.
    return { form: "snapshot", version: 0, entries: [], complete: true, next_from: 0 };
  }

  const known =
    have_version > 0 &&
    have_version <= version &&
    [
      ...(await db.execute(
        sql`select 1 from kernel.staff_versions
            where ${scopedTo(scope)} and version = ${have_version}`,
      )),
    ].length > 0;

  if (known && have_version === version) {
    return {
      form: "delta",
      version,
      base_version: have_version,
      entries: [],
      complete: true,
      next_from: 0,
    };
  }

  if (known) {
    // DELTA — the FOLD at the target, restricted to the ids that changed after the device's base.
    //
    // The inner `where` picks the changed ids; `distinct on (user_id) … order by version desc`
    // then folds each of them to the row it STANDS at. It is the snapshot query below with one
    // extra predicate, deliberately — the two forms are one interpretation of the log rather than
    // two, which is what makes `01-F75`'s "the same fold a snapshot at that version is" a property
    // of the code and not a coincidence between two queries. **The window does not narrow the
    // fold**: a changed id's greatest row `<= version` is always inside `(have_version, version]`,
    // because any row at or below the base is older than the row that put the id in the window.
    //
    // The page order is `user_id`, the SNAPSHOT's, and the version ordering it replaced is retired
    // with its own stated reason: *"ordered by version so a paged delta applies in publication
    // order, which is what makes a partial page safe to apply"* was protecting a delta that could
    // carry one id twice. One entry per id has no intra-page ordering left to get wrong, and this
    // is the only order under which a delta and a snapshot at one target page identically.
    const rows = await db.execute(
      sql`select user_id, display_name, grid_ordinal, status, assignments, pin_hash from (
            select distinct on (user_id)
                   user_id, display_name, grid_ordinal, status, assignments, pin_hash
            from kernel.staff_entries
            where ${scopedTo(scope)} and version > ${have_version} and version <= ${version}
            order by user_id asc, version desc
          ) folded
          order by user_id asc
          offset ${from} limit ${STAFF_PAGE_SIZE + 1}`,
    );
    const fetched = [...rows];
    const page = fetched.slice(0, STAFF_PAGE_SIZE);
    const complete = fetched.length <= STAFF_PAGE_SIZE;
    return {
      form: "delta",
      version,
      base_version: have_version,
      entries: page.map(rowToEntry),
      complete,
      next_from: complete ? 0 : from + page.length,
    };
  }

  // SNAPSHOT — the fold: the greatest version <= `version` per person. A departed member is
  // INCLUDED as a marked entry (R26, `11-F22`): a snapshot that dropped her would delete the
  // device's record of her name, and a past order, a reprint, a shift report and `02-F23`'s
  // reconciliation would all render a raw UUID.
  //
  // The wire order is `user_id`, which carries no meaning on purpose: `01-F61` puts the render
  // order in the `grid_ordinal` FIELD, and a transport that sorted by it would give a device two
  // sources for one fact. Paging needs a stable order and this is the one that states nothing.
  const rows = await db.execute(
    sql`select user_id, display_name, grid_ordinal, status, assignments, pin_hash from (
          select distinct on (user_id)
                 user_id, display_name, grid_ordinal, status, assignments, pin_hash
          from kernel.staff_entries
          where ${scopedTo(scope)} and version <= ${version}
          order by user_id asc, version desc
        ) folded
        order by user_id asc
        offset ${from} limit ${STAFF_PAGE_SIZE + 1}`,
  );
  const fetched = [...rows];
  const page = fetched.slice(0, STAFF_PAGE_SIZE);
  const complete = fetched.length <= STAFF_PAGE_SIZE;
  return {
    form: "snapshot",
    version,
    entries: page.map(rowToEntry),
    complete,
    next_from: complete ? 0 : from + page.length,
  };
};

/**
 * `11-F23`'s SEPARATE WRITER for the separate credential table — `14-F14`'s PIN set and reset.
 *
 * **It takes a HASH and never a PIN** (`11-F21`: "a PIN exists in exactly two places … the keypad
 * it is typed on and the argument to a verify call"). Hashing is `packages/domain`'s `hashPin` at
 * `01-F61`'s cost floor and is done by the caller, so no second Argon2id call site — and therefore
 * no second set of parameters — is created here.
 *
 * **Separate from the back-office password writer, deliberately** (`11-F23`): they are two
 * credentials on two planes for one person, "and giving them one writer is how a password reset
 * comes to touch a PIN by refactor".
 *
 * The person must exist IN THIS ORG. `01-F68` forbids a foreign key, so a credential row under a
 * mistyped org would simply sit there — correct-looking, unreachable, and reported by no query.
 * That is the completeness discipline `15-F27` already puts at this service's writers.
 */
export const setPinCredential = async (
  db: Db,
  args: { org_id: string; user_id: string; pin_hash: string; now: number },
): Promise<void> => {
  const known = [
    ...(await db.execute(
      sql`select 1 from kernel.users
          where org_id = ${args.org_id} and user_id = ${args.user_id}`,
    )),
  ];
  if (known.length === 0) {
    throw new RangeError(
      `setPinCredential: no person ${args.user_id} in org ${args.org_id} — nothing was written ` +
        "(11-F20). This directory carries no foreign key (01-F68), so a credential written here " +
        "would be a row nothing can ever reach and no query would report.",
    );
  }
  await db.execute(
    sql`insert into kernel.user_credentials (org_id, user_id, pin_hash, updated_at)
        values (${args.org_id}, ${args.user_id}, ${args.pin_hash}, ${args.now})
        on conflict (org_id, user_id)
        do update set pin_hash = excluded.pin_hash, updated_at = excluded.updated_at`,
  );
};

/**
 * `11-F22`'s PARTICIPATION TRANSITION — the only thing that writes a person's status.
 *
 * **IT IS KEYED BY (PERSON, BRANCH), NOT BY PERSON.** `11-F22` requires a cashier moving from A to B
 * to be *"`inactive` in A's roster and `active` in B's **at the same moment**"*, which no per-person
 * value can express; the FR names the transfer clause as the operative one and puts the field
 * *"where `01-F26` already carries the relationship — with the ASSIGNMENT"*. `branch_id: null`
 * addresses the org-wide assignment, which is `01-F26`'s own encoding for "every location" and how
 * every owner is stored (`15-F26`).
 *
 * The set is `packages/domain`'s and the refusal is `PersonAssignment`'s own, reached through its
 * shape rather than restated: one declaration of the vocabulary AND one declaration of the sentence
 * that refuses a word outside it (`18 §2`). `schema.ts` carries no CHECK for exactly this reason —
 * a closed set validated in two places is two interpretations of it. **The parse happens BEFORE the
 * transaction opens**, so a refused word costs nothing: a writer that deleted the credential and
 * then validated would refuse loudly and still have destroyed her PIN.
 *
 * **R32 (founder ruling, August 2026): the credential row is DELETED when a person stops being
 * `active`, and the owner sets a new PIN on re-activation.** "A departed person's credential does
 * not outlive her employment in the database." `11-F23` recorded this as undecided until R32
 * answered it, and it is transcribed here rather than reasoned — the alternative readings
 * (retained, or retained-and-unreachable) differ on what re-activation means, which is a policy
 * question and not an implementation one.
 *
 * ⚠ **THE DELETION IS KEYED TO THE LAST ACTIVE ASSIGNMENT AND NEVER TO ONE BRANCH'S** (`11-F23`,
 * following `11-F22`). *"A person's credential goes when she is `inactive` **everywhere**, which is
 * what R32 means by 'does not outlive her employment': employment ends at the org, not at a
 * branch."* Fired on one branch's deactivation instead, it destroys the credential the RECEIVING
 * branch's artifact needs and produces an `active` member with no hash — the defect `11-F23` names,
 * arriving through the transfer the other FR exists to describe.
 *
 * ⚠ **A TRANSFER IS ORDER-DEPENDENT ACROSS TWO CALLS, AND THE CORPUS DOES NOT RULE ON THE ORDER —
 * READ THIS BEFORE BUILDING A SURFACE THAT MOVES SOMEONE FROM ONE BRANCH TO ANOTHER** (`14-F14`).
 * Each call is atomic in itself (below); a transfer is TWO of them, and only one order is safe.
 * Deactivating her at A **before** activating her at B passes through a moment where she is
 * `inactive` everywhere — which is R32's literal trigger — so this function deletes her credential
 * row, and B's next publish then serves an `active` member with **no hash**: the defect `11-F23`
 * names, and `01-F17`'s stopped till arriving through the identity path, for a cashier who never
 * left the company. Activating at B first never reaches the trigger, because an active assignment
 * remains throughout. **A crash between the two calls has the same two outcomes for the same
 * reason**, so the order decides what a half-finished transfer costs.
 *
 * **This is recorded as a HAZARD and not defended against here** (commandment 2). R32 rules on the
 * TRIGGER — "the credential row is deleted when a person stops being `active`" — and is silent on
 * the sequence; `11-F22`'s transfer clause requires the two states to hold *"at the same moment"*
 * but names no mechanism for reaching them, and this writer is per-(person, branch) by that FR's
 * own design, so it cannot see a second branch to order itself against. Inventing one — a
 * two-branch transfer call, a grace period before the delete, a refusal to deactivate a person's
 * last active assignment — would each answer a question no FR has asked, and the third would forbid
 * an ordinary departure. What is owed is a RULING plus a surface that carries it, and both belong
 * to `14-F14`'s CRUD. Until then: **activate at the destination first.**
 *
 * ⚠ **BOTH WRITES ARE ONE UNIT OF WORK, BY NAME AND NOT BY STYLE** (`11-F23`): *"A dropped
 * connection, statement timeout or process kill between two autocommit statements leaves the person
 * `inactive` **holding a live credential** — and the next re-activation then restores her OLD PIN
 * and publishes it to every till at the branch, defeating R32's stated purpose without a single
 * error anywhere. Nothing queries for that state, so it is found by the cashier who still gets in."*
 * `publishStaffRoster` above already uses this idiom; a nested call (a caller that hands us its own
 * transaction) becomes a SAVEPOINT, so the caller's rollback still takes both halves with it.
 *
 * The read is `for update`, which is not decoration: two branches deactivating one person
 * concurrently are a read-modify-write on one jsonb value, and the loser would otherwise overwrite
 * the winner's assignment with a stale copy — a deactivation that reports success and did not
 * happen.
 *
 * ⚠ **EVERY ASSIGNMENT NAMING THE BRANCH MOVES, NOT ONE — AND FLIPPING ONE WAS A CREDENTIAL
 * RESURRECTION WITH NO RACE IN IT (fixed August 2026, `11-F22`, `11-F23`/R32).** This function used
 * to `findIndex` the FIRST assignment naming `branch_id` and rewrite that one, while R32's deletion
 * three statements down scans **all** of them (`some`). `01-F26` is *"User × Role × per-location
 * assignment"* and states **no cardinality on either axis**, so a cashier promoted to branch manager
 * who goes on ringing orders holds two assignments naming one branch — a shape `packages/domain`
 * already resolves, because `rolesAt` returns a LIST of roles for one location and `can`/
 * `reportScope` each reduce over it. On that person, deactivating at her branch flipped one row and
 * left the other `active`, so:
 *
 *   · every READER agreed she had left — `participationAt` finds the flipped carrier first, the
 *     published entry says `inactive` and carries no hash (`11-F21`), and `listUsers` shows the
 *     departure — while
 *   · the only scan that reads ALL of them, R32's, still saw an `active` assignment and **declined
 *     to delete her credential**, so a later re-activation republished her OLD PIN to every till at
 *     the branch.
 *
 * That is `11-F23`'s own named end state — *"the next re-activation then restores her OLD PIN and
 * publishes it to every till at the branch, defeating R32's stated purpose without a single error
 * anywhere … found by the cashier who still gets in"* — reached with **no torn transaction, no
 * dropped connection and no race**, on a request that answered 200. The FR wrote that sentence about
 * a process kill between two autocommits; a single-carrier flip produced it on the happy path.
 *
 * **WHAT "DEACTIVATE HER AT BRANCH A" MEANS, STATED BECAUSE THE TWO HALVES MUST NOT DISAGREE
 * (commandment 2): every assignment naming A goes `inactive`.** `11-F22` does not leave this open —
 * *"THE FIELD IS THEREFORE PER-(PERSON, BRANCH)"*, and `01-F78` restates it for the artifact (*"the
 * status a row carries is THIS branch's"*). One fact per `(person, branch)` means two assignments
 * naming one branch are two CARRIERS of that fact and cannot hold different values; a per-assignment
 * flip is the per-assignment field `11-F22` explicitly did not take. The FR's transfer argument
 * distinguishes BRANCHES and says nothing that would let two rows naming the SAME branch disagree,
 * and its departure clause — *"a person is departed when she is `inactive` in **every** branch that
 * names her"* — is read by R32 across all assignments, so reading one axis at the flip and the other
 * at the delete is what produced the defect. `branch_id: null` is `01-F26`'s org-wide row and is one
 * key like any other: two org-wide roles are two carriers of the org-wide fact and move together.
 *
 * **THE CLASS THIS CLOSES AND THE NEIGHBOURING CASES IT DOES NOT — named, because a fix's prose
 * retires the assertion the next session would have written.** Closed: no shipping writer can leave
 * two carriers of one branch's participation disagreeing (`createPerson` writes them all `active`,
 * `setPersonAssignments` carries one status per branch onto every wanted row, and this function
 * moves all of them). NOT closed: (i) nothing **refuses** two assignments naming one branch — the
 * shape is legal under `01-F26` and is accepted, so `14-F14`'s editing surface can create it; (ii)
 * `participationAt` still reads the FIRST carrier, which is correct only because carriers now agree
 * — a row written by hand, or by the build this defect shipped in, can still hold two disagreeing
 * carriers and this writer will not repair one it is not asked about; and (iii) a person holding
 * several roles at several branches still moves **one branch per call**, which is `11-F22` working
 * and not a gap.
 *
 * ⚠ **R32's second half is NOT closed here and must not be read as closed.** It makes re-activation
 * a TWO-STEP act — flip the status, then set a PIN — and requires the skipped second step to fail
 * **legibly**: an `active` member with no credential row is a tile that cannot be unlocked, which
 * is `01-F17`'s stopped till arriving through the identity path. That legibility belongs to
 * `14-F14`'s surface (step 4) and to the device's unlock flow, not to a storage writer: refusing to
 * publish such a member here would refuse the ordinary case where an owner creates a cashier before
 * setting her first PIN (R29 has the owner set it), which is a window the product deliberately has.
 */
export const setUserStatus = async (
  db: Db,
  args: { org_id: string; user_id: string; branch_id: string | null; status: string },
): Promise<void> => {
  const status = PersonAssignment.shape.status.parse(args.status);
  await db.transaction(async (tx: Db) => {
    const rows = [
      ...(await tx.execute(
        sql`select assignments from kernel.users
            where org_id = ${args.org_id} and user_id = ${args.user_id}
            for update`,
      )),
    ];
    const row = rows[0];
    if (row === undefined) {
      // `revoke-device`'s read-before-write lesson, one table over: an `UPDATE … WHERE` that
      // matches nothing returns void, and a caller that trusted it would report a deactivation
      // over a cashier who is still selling.
      throw new RangeError(
        `setUserStatus: no person ${args.user_id} in org ${args.org_id} — nothing was changed. ` +
          "A status set for nobody reads exactly like a status that was set (11-F20, 01-F71).",
      );
    }

    const assignments = PersonRecord.shape.assignments.parse(row.assignments);
    // ONE declaration of "this is a carrier of the branch's participation", used by the refusal and
    // by the write, so the two cannot come to disagree about which rows the act is about.
    const namesThisBranch = (assignment: PersonAssignmentT): boolean =>
      assignment.branch_id === args.branch_id;
    if (!assignments.some(namesThisBranch)) {
      // The same lesson one axis further in: participation is per-(person, branch), so a branch she
      // is not assigned to has no status to set, and silently creating one would invent `01-F26`'s
      // relationship — which is `14-F14`'s CRUD, made by an authenticated human.
      throw new RangeError(
        `setUserStatus: person ${args.user_id} has no assignment naming ` +
          `${args.branch_id === null ? "the org (branch_id: null)" : `branch ${args.branch_id}`} ` +
          "— nothing was changed (11-F22: participation is per-(person, branch) and rides the " +
          "assignment; 01-F26 owns creating one). A status set for a location she does not hold " +
          "reads exactly like a status that was set.",
      );
    }
    // EVERY carrier, never the first one found — see the header. `11-F22` makes participation one
    // fact per (person, branch); R32's scan below reads all of them, and a flip that read fewer is
    // how an `inactive` cashier kept a live credential.
    const next = assignments.map((assignment) =>
      namesThisBranch(assignment) ? { ...assignment, status } : assignment,
    );

    await tx.execute(
      sql`update kernel.users set assignments = ${JSON.stringify(next)}::jsonb
          where org_id = ${args.org_id} and user_id = ${args.user_id}`,
    );

    // R32, keyed to the LAST active assignment: read off the array this transaction is writing, so
    // the decision and the state it is about cannot disagree.
    if (!next.some((assignment) => assignment.status === "active")) {
      await tx.execute(
        sql`delete from kernel.user_credentials
            where org_id = ${args.org_id} and user_id = ${args.user_id}`,
      );
    }
  });
};
