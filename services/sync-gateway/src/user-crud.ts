/**
 * **`14-F14`'s USER CRUD, AS THE CLOUD WRITER EXPRESSES IT — the four acts and their publishes.**
 *
 * `14-F14`: *"User CRUD with role × per-location assignment … PIN set/reset (never displayed;
 * Argon2id per 00 §5.4); deactivation preserves historical attribution."* This module is the
 * writer half of that sentence; `services/api`'s `user-router.ts` is the authenticated surface
 * above it (`14-F39`, owner-only) and `publish-http.ts` is the transport between them.
 *
 * **IT INVENTS NO RULE. It is the CALLER `staff.ts` was written for**, and that is the whole point
 * of it existing at all: `publishStaffRoster`, `setPinCredential` and `setUserStatus` have been
 * correct, tested and unreachable since step 3 — AGENTS.md's recurring defect in its purest form —
 * and `staff.ts`'s own debt marker named `14-F14`'s `/internal/users*` routes as the landing that
 * closes it. Everything below composes those three with `insertUser` / `listUsers` / `listBranches`
 * (`kernel.users`, `kernel.branches`).
 *
 * ── ⚠ TWO CALLS, TWO TRANSACTIONS, AND THAT IS MEASURED RATHER THAN STYLISTIC ────────────────────
 *
 * `publishStaffRoster`'s header measures this exact caller: `setUserStatus` followed by
 * `publishStaffRoster` **inside ONE caller transaction**, two concurrent requests over two branches
 * with overlapping publish sets, deadlocks **8 of 8 rounds** (`SQLSTATE 40P01`) against **0 of 8**
 * in separate transactions — and the overlap is structural, because by `01-F78` half one every
 * org-wide person is in EVERY branch's artifact. So **nothing in this module opens a transaction
 * that spans a status write and a publish**, and every `publishStaffRoster` below is a top-level
 * call on the pooled handle. Wrapping any two of these acts in one caller transaction reintroduces
 * the deadlock; the answer is the FR-free one the measurement already gives (separate
 * transactions), never a lock protocol invented here (commandment 2).
 *
 * ── `01-F75`'s PRODUCER CLAUSE IS WHY EVERY ACT ENDS IN A PUBLISH ───────────────────────────────
 *
 * *"a write that changes an artifact **mints the next version for each affected `(resource, scope)`
 * key** … The producer is the publish path — never a scheduler, never a device."* Written into the
 * FR because the catalog's own fan-out shipped with zero production callers. For the roster the
 * affected keys are the branches this person's assignments REACH (`01-F78` half one), so a create,
 * a re-assignment, a PIN reset and a deactivation are all publishes — and a device that never
 * learns of one verifies against the old hash for ever.
 *
 * ⚠ **AND IT PUBLISHES ON EVERY WRITE, NOT ON EVERY *CHANGE* — a REPORTED divergence from the
 * clause above rather than a silently-left one.** `01-F75` says *"a write that **changes** an
 * artifact mints the next version"*; every act below publishes unconditionally. Measured on a
 * two-branch org with an org-wide person: three saves that change nothing take the keys
 * `1,1,1 → 2,2,2 → 3,3,3`, so every till in the org re-reconciles a roster it already holds at its
 * next `hello_ack` (`01-F77`) and `kernel.staff_entries` grows a row per person per key each time.
 *
 * **The cost is FRESHNESS and storage, never correctness** — `01-F56`'s monotonic apply lands a
 * device in the same state whether or not the bytes moved — which is why it is recorded rather than
 * repaired, and the repair is bigger than it looks. No FR defines what *"changes"* means for this
 * resource, and the acts do not agree on an answer: a PIN reset produces different bytes every time
 * (Argon2id is salted, so *"the same PIN"* is not the same hash), a status set to the value it
 * already holds is a true no-op, and for an absolute assignment write somebody would have to decide
 * whether re-ordering the same pairs is a change. Building that diff HERE would also put a **second**
 * definition of *"this artifact changed"* one function away from `publishStaffRoster`'s own — it
 * already owns one, *"an empty change set is not a version"* — and two interpretations of one rule
 * is `03-F40`'s two sensor bit layouts, which this service's own header cites. It wants an FR
 * sentence, not a comparison written into a caller (commandment 2).
 *
 * ⚠ **`01-F75`'s `reference_notice` FAN-OUT IS PRODUCED HERE NOW (step 6), AND THIS PARAGRAPH USED
 * TO RECORD IT AS OWED ELSEWHERE.** It read that *"the `reference_*` frames are step 5 … and do not
 * exist, so a roster change reaches a connected till at its next `hello_ack` reconciliation"* —
 * true when written and the exact state `01-F75`'s producer clause was written against. The frames
 * landed at step 5 and the serve path at step 6, so every `publishTo` below now announces on the
 * key it just minted, through an `announce` its caller must supply.
 *
 * **The announce is a REQUIRED argument on every act, and that is the shape rather than a
 * preference.** `publish-http.ts` records the measured reason on the catalog's own seam: an
 * OPTIONAL member re-creates the hole one layer out, because `seams:check` asks whether an optional
 * seam is SUPPLIED and can ask nothing about one that was never declared. Required, it is a compile
 * error from `server.ts` down to the single `publishStaffRoster` call site — which is the only
 * shape in which a deployment cannot forget the fan-out and still build.
 */

import { randomBytes } from "node:crypto";
import { hashPin, newId, type PersonAssignmentT, PersonRecord } from "@restos/domain";
import { sql } from "drizzle-orm";
import type { GatewayDb } from "./gateway.js";
import { publishStaffRoster, reachesBranch, setPinCredential, setUserStatus } from "./staff.js";
import { assertAssignedBranchesAreThisOrgs, insertUser, listBranches } from "./tenancy.js";

/**
 * `01-F26`'s `(role, location)` pair as a CALLER states it — with no `status`.
 *
 * Participation is the writer's to decide (`11-F22`): a person created is `active` where she is
 * assigned, and a re-assignment carries her existing participation at a branch she already held.
 * Letting a caller state a status would let a back office create a cashier who is `inactive` on her
 * first shift, which is `01-F17`'s stopped till arriving through the identity path.
 */
export type AssignmentInput = { readonly role: string; readonly branch_id: string | null };

/**
 * `01-F75`'s producer, as an act supplies it: announce ONE `(staff, {org, branch})` key at the
 * version a publish just minted (`gateway.ts`'s `notifyStaffVersion`).
 *
 * Declared as a function type rather than as a dependency on `gateway.ts` because this module knows
 * nothing about sessions or sockets — the same reason `server.ts` passes the gateway's METHOD to
 * `registerPublishRoutes` rather than the gateway.
 */
export type AnnounceStaffVersion = (org_id: string, branch_id: string, version: number) => void;

/**
 * What the CALLER supplies about the act itself. `now` is the CALLER's instant —
 * `/internal/catalog/publish`'s recorded rule, unchanged: `services/api` takes ONE reading per act
 * and uses it for the write and for `14-F2`'s ledger record, so one act cannot be split into two
 * instants. `actor_user_id` is the authenticated owner (`14-F39`), and it is what
 * `kernel.staff_versions` records as the publisher. `announce` is `01-F75`'s producer seam, on the
 * act rather than on the module so that every route must pass it and none can be added without one.
 */
type Act = {
  readonly now: number;
  readonly actor_user_id: string | null;
  readonly announce: AnnounceStaffVersion;
};

/**
 * `01-F78` half one, asked of the ORG: which branch artifacts does this assignment set reach?
 *
 * The predicate is `staff.ts`'s `reachesBranch` — the same one the publisher filters each row with
 * (half two) and the same one it refuses an unreachable person by. Asking it of every branch of the
 * org rather than reading branch ids straight off the assignments is what makes an org-wide
 * assignment (`01-F26`'s `branch_id: null`) reach *every* branch without a second rule, and it also
 * means a branch this org has no record of contributes no key — which matters, because
 * `publishStaffRoster` refuses such a branch by name and a silently-skipped publish would be
 * indistinguishable from a published one.
 */
const branchesReached = async (
  db: GatewayDb,
  org_id: string,
  assignments: readonly { readonly branch_id: string | null }[],
): Promise<readonly string[]> =>
  (await listBranches(db, org_id))
    .filter((branch) => assignments.some((a) => reachesBranch(a, branch.branch_id)))
    .map((branch) => branch.branch_id);

/**
 * `01-F75`'s producer, applied to every affected key.
 *
 * **Sequential, and each publish is its own transaction.** Two publishes for one org name
 * overlapping people (every org-wide person is in both), so running them concurrently would take
 * the same `kernel.users` row locks from two backends in an order nothing pins — the deadlock
 * `publishStaffRoster` measures, arriving from the caller side instead.
 *
 * ⚠ **THIS LOOP CAN ABORT PART-WAY, AFTER ITS CALLER'S OWN WRITE HAS COMMITTED — A REPORTED
 * FINDING, MEASURED, AND DELIBERATELY NOT REPAIRED HERE.** The branch list is computed from a read
 * taken **before** the loop, and a concurrent `setPersonAssignments` can remove one of her
 * assignments inside the window. `publishStaffRoster` then refuses her at that key by name —
 * `publishStaffRoster: … has no assignment naming branch <A>`, a refusal naming a branch the caller
 * never mentioned. Measured against a real Postgres: **4 of 4 rounds** on re-assignment ‖
 * deactivation, **2 of 4** on re-assignment ‖ PIN reset. **The stored state was correct in every
 * round** — the credential or the status flip had already committed, and the branch that dropped
 * out is not left stale, because `setPersonAssignments` publishes `inactive` at a departing branch
 * BEFORE it removes the assignment, so that key's correction belongs to the other act and has
 * already been made.
 *
 * **What is actually lost is the LEDGER RECORD.** The route answers a refusal, so `user-router.ts`'s
 * `recordChange` never runs and `14-F2` is short one row for a change that happened. That is the
 * direction that surface deliberately chose — *"Write FIRST, attribute SECOND … a failure between
 * them leaves a real roster change with no ledger row"* — and what this finding adds is **when** the
 * bill arrives: not only when the event store is down, but whenever two owners edit one person at
 * the same moment.
 *
 * **Why the repair is not taken here (`24 §3b`, commandment 2).** (i) The honest fix is a
 * DISCRIMINABLE refusal from `publishStaffRoster`, so a caller can tell *"she no longer reaches this
 * key"* from *"the ordinal collides"* or *"that branch is not this org's"* — an API change on a
 * PROTECTED path (`20 §4.4`) that wants its own review, and bigger than the case. (ii) Matching the
 * sentence instead would make a caller depend on the wording of a message, which is `K-3`'s
 * dead-oracle defect wearing a service. (iii) Swallowing every `RangeError` at a key she no longer
 * reaches would swallow a genuine `grid_ordinal` collision there, which is a refusal an owner must
 * see. (iv) Re-deriving the branch list immediately before each publish NARROWS the window and does
 * not close it, and a comment claiming a protection that does not exist is this repo's own recorded
 * worse-than-nothing.
 */
const publishTo = async (
  db: GatewayDb,
  org_id: string,
  branch_ids: readonly string[],
  changed_user_ids: readonly string[],
  act: Act,
): Promise<void> => {
  for (const branch_id of branch_ids) {
    const version = await publishStaffRoster(db, { org_id, branch_id }, changed_user_ids, {
      now: act.now,
      actor_user_id: act.actor_user_id,
    });
    // `01-F75`'s producer, at the ONE place every roster publish in this service passes through.
    //
    // **AFTER the publish has committed, and with the version it RETURNED.** `publishStaffRoster`
    // resolves only once its transaction commits, so a notice sent here names a version the
    // gateway can serve. Announcing a PREDICTED number first is the failure `journey-catalog`'s
    // `SEAM (ORDER)` measures one resource over, and on this artifact it costs more than a stale
    // menu: the device fetches, is served the OLD roster, stores it as current under `01-F56`'s
    // monotonic apply, and hears nothing further until its next `hello_ack` — so a person hired
    // seconds ago cannot sign in, or one just deactivated still can (`11-F21`, R32).
    //
    // **Per KEY, at that key's own version.** One write reaches several branches (`01-F78` half
    // one puts an org-wide person in every artifact) and they are at different versions, so one
    // number announced to the org — the catalog's shape, one resource over — is wrong for every
    // branch but one.
    act.announce(org_id, branch_id, version);
  }
};

/**
 * One person's stored assignments, or a REFUSAL naming `01-F71`.
 *
 * **Refused and never clamped** (`01-F71` (e)): a write scoped to the stated org that matches zero
 * rows and reports success is the cross-tenant failure with no error in it — the owner is told the
 * PIN was reset and the other tenant's cashier goes on using her old one.
 */
const assignmentsOf = async (
  executor: GatewayDb,
  org_id: string,
  user_id: string,
): Promise<readonly PersonAssignmentT[]> => {
  const rows = [
    ...(await executor.execute(
      sql`select assignments from kernel.users
          where org_id = ${org_id} and user_id = ${user_id}`,
    )),
  ];
  const row = rows[0];
  if (row === undefined) {
    throw new RangeError(
      `no person ${user_id} in org ${org_id} — nothing was changed (11-F20, 01-F71: org data ` +
        "isolation is absolute and fail-closed). This directory carries no foreign key (01-F68), " +
        "so nothing else would ever have told you the id was wrong.",
    );
  }
  // ONE declaration of the assignment shape (`18 §2`) — a row predating `0012`'s backfill is
  // refused by `11-F22`'s own sentence rather than by a missing field three statements later.
  return PersonRecord.shape.assignments.parse(row.assignments);
};

/**
 * One person's stored assignments **under the row lock the caller is about to write them back
 * under** — the read half of a read-modify-write, and never a read on its own.
 *
 * `assignmentsOf` above is the unlocked read for the two acts that only ever LOOK at the set;
 * `setPersonAssignments` writes it, so both of its transactions take this one instead. They share
 * the function because the refusal is one sentence about one act (`01-F71` (e): refused, never
 * clamped), and because the second transaction's whole job is to be the first one's read repeated
 * under the lock it finally writes under.
 */
const lockedAssignments = async (
  tx: GatewayDb,
  org_id: string,
  user_id: string,
): Promise<readonly PersonAssignmentT[]> => {
  const rows = [
    ...(await tx.execute(
      sql`select assignments from kernel.users
          where org_id = ${org_id} and user_id = ${user_id}
          for update`,
    )),
  ];
  const row = rows[0];
  if (row === undefined) {
    throw new RangeError(
      `no person ${user_id} in org ${org_id} — nothing was changed (11-F20, ` +
        "01-F71). A re-assignment aimed at nobody reads exactly like one that happened.",
    );
  }
  // ONE declaration of the assignment shape (`18 §2`) — a row predating `0012`'s backfill is
  // refused by `11-F22`'s own sentence rather than by a missing field three statements later.
  return PersonRecord.shape.assignments.parse(row.assignments);
};

/** Write an absolute assignment set. Callers hold the row lock; see `setPersonAssignments`. */
const writeAssignments = async (
  executor: GatewayDb,
  org_id: string,
  user_id: string,
  assignments: readonly PersonAssignmentT[],
): Promise<void> => {
  await executor.execute(
    sql`update kernel.users set assignments = ${JSON.stringify(assignments)}::jsonb
        where org_id = ${org_id} and user_id = ${user_id}`,
  );
};

/**
 * `14-F14`'s CREATE — a person, her assignments, her grid position, and every artifact she reaches.
 *
 * **`grid_ordinal` is minted HERE, per ORG, and appended** (`01-F61`: it is explicit and never
 * derived, and new members append). Per org and not per branch because `01-F75` scopes uniqueness
 * *within the artifact* and `01-F78` half one puts an org-wide person in EVERY branch's artifact —
 * a per-branch counter collides the moment an owner joins two rosters that each already used the
 * number. The read and the insert are one transaction behind an advisory lock on the org, because
 * two owners saving at once would otherwise both read the same maximum, both write it, and
 * `listUsers`'s `grid_ordinal asc, user_id asc` would fall back to the derived tiebreak `01-F61`
 * forbids — every tile after the collision moving under a cashier's hand (`27-F4`).
 *
 * **`user_id` is minted here too**, for the same reason: a caller-supplied id is a second writer of
 * the primary key, and two browser tabs would collide on it.
 *
 * ⚠ **THE BACK-OFFICE PASSWORD IS SET TO AN UNUSABLE SECRET, AND THAT IS A GAP THIS RECORDS RATHER
 * THAN FILLS.** `kernel.users.password_hash` is NOT NULL and holds `15-F26`'s CLOUD-plane
 * credential; `14-F14` says nothing about setting one, `11-F23` insists the two planes' credentials
 * have separate writers ("giving them one writer is how a password reset comes to touch a PIN by
 * refactor"), and `15-F26`'s single-use set-credential link has no redemption surface anywhere in
 * this product. So a person created here gets a hash of a 256-bit secret that is generated,
 * hashed and DISCARDED — nobody can ever present it, which is the fail-closed direction. The
 * consequence is stated because it is real: **a person created here cannot sign in to the back
 * office**, whether or not she was given an email, and R30's till-only cashier does not want to.
 * The PIN — her device-plane credential (`11-F21`) — is `setPersonPin` below, and it is never this.
 */
export const createPerson = async (
  db: GatewayDb,
  args: {
    readonly org_id: string;
    readonly display_name: string;
    readonly email: string | null;
    readonly assignments: readonly AssignmentInput[];
  } & Act,
): Promise<{ user_id: string; grid_ordinal: number }> => {
  const user_id = newId();
  // Outside the transaction on purpose: `01-F61`'s cost floor makes this deliberately expensive,
  // and holding the org's ordinal lock across it would serialize every create in the org behind an
  // Argon2id run that has nothing to do with the ordinal.
  const password_hash = await hashPin(randomBytes(32).toString("base64url"));

  const grid_ordinal = await db.transaction(async (tx: GatewayDb) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('restos:users:' || ${args.org_id}::text))`,
    );
    const rows = [
      ...(await tx.execute(
        sql`select coalesce(max(grid_ordinal), -1) as high from kernel.users
            where org_id = ${args.org_id}`,
      )),
    ];
    const ordinal = Number(rows[0]?.high ?? -1) + 1;
    // `insertUser` is the one writer of this table's identity columns and carries `01-F26`'s
    // completeness refusal — an assignment naming a branch no record names, or another org's
    // branch, is refused HERE OR NOWHERE (`01-F68` forbids the foreign key that would catch it).
    const written = await insertUser(tx, {
      user_id,
      org_id: args.org_id,
      display_name: args.display_name,
      // R30: **NULL for a till-only cashier**, never an invented address. `11-F20` never deletes a
      // person record, so an address an owner was forced to make up is permanent.
      email: args.email,
      password_hash,
      // The vocabulary is `packages/domain`'s and the refusal is its own sentence (`18 §2`): a role
      // outside `ROLES`, or a status outside `11-F22`'s closed pair, is refused by the schema that
      // declares it rather than by a second copy of the list written here.
      assignments: PersonRecord.shape.assignments.parse(
        args.assignments.map((assignment) => ({ ...assignment, status: "active" })),
      ),
      grid_ordinal: ordinal,
      created_at: args.now,
    });
    if (!written) {
      // `user_id` is freshly minted, so the only reachable conflict is `users_email_lower_uq` —
      // which is global and case-folded (`0011`), because `findByEmail` takes an email and nothing
      // else. Named, because "duplicate key value violates unique constraint" is not a sentence an
      // owner can act on.
      throw new RangeError(
        `email ${String(args.email)} already belongs to another person — nothing was written. ` +
          "An email identifies exactly one back-office login on this host (0011, 28 §9.18).",
      );
    }
    return ordinal;
  });

  await publishTo(
    db,
    args.org_id,
    await branchesReached(db, args.org_id, args.assignments),
    [user_id],
    args,
  );
  return { user_id, grid_ordinal };
};

/**
 * `14-F14`'s **role × per-location assignment**, edited.
 *
 * ⚠ **THE HARD PART IS THE BRANCH SHE IS LEAVING, AND `publishStaffRoster` NAMES IT AS THIS
 * SURFACE'S DEBT.** Its header: her last published row at that branch *"stays `active` and keeps
 * its hash, and this publisher then REFUSES to publish the correction — `participationAt` finds
 * nothing reaching this branch and throws by name — so the only repair is to re-add the assignment
 * and deactivate it"*, recorded there as *"unreachable today: nothing in this service removes an
 * assignment … it becomes reachable with the CRUD that can"*. This is that CRUD, so the repair is
 * performed rather than described: she is deactivated at the branches she is leaving, that state is
 * published, and only then does the assignment go.
 *
 * ⚠ **THE ORDER IS `setUserStatus`'s RECORDED ONE — "activate at the destination first" — AND
 * DEPARTING FROM IT DESTROYS A TRANSFERRING CASHIER'S PIN.** R32 deletes the credential row when a
 * person stops being `active` **everywhere**, so on a plain transfer (drop A, add B) deactivating
 * at A before B exists passes through exactly that state: the credential is deleted, and B's
 * publish then serves an `active` member with **no hash** — `11-F23`'s named defect, `01-F17`'s
 * stopped till through the identity path, for a cashier who never left the company. So the first
 * write is the new set **plus** the departing assignments at their current status: the destination
 * is active before anything is deactivated, R32's trigger is never passed through, and the
 * deletion still happens correctly for a genuine departure (an empty or wholly-inactive new set),
 * because it is `setUserStatus` that performs it and R32 lives in exactly one place.
 *
 * ⚠ **AN ORG-WIDE ASSIGNMENT (`01-F26`'s `branch_id: null`) IS WITHDRAWN THE SAME WAY, AND THIS
 * PARAGRAPH USED TO SAY THE OPPOSITE — THE OPPOSITE WAS A PERMANENT CREDENTIAL LEAK.** It read that
 * *"a branch she reaches only through an ORG-WIDE assignment she is losing is NOT repaired … her
 * stale row at those branches keeps its hash until something republishes her there"*, and that
 * reason was **false when it was written**: nothing can ever republish her there. One org-wide row
 * puts her in EVERY branch's artifact (`01-F78` half one), so withdrawing it takes her out of every
 * one at the same instant, and `publishStaffRoster` then refuses her at all of them —
 * `participationAt` finds nothing reaching the branch and throws by name. R25 makes the artifact's
 * scope the credential blast radius, so what stood there was an `active` row with a live Argon2id
 * hash at every branch she had left, for ever. The sentence is quoted rather than deleted because a
 * reason stated in a comment **retires the assertion the next session would have written**.
 *
 * **The repair invents nothing and needs no FR: `setUserStatus(branch_id: null)` is a call this
 * module already makes**, addressed at the row `01-F26` already declares and `11-F22` already puts
 * a status on. It is safe for exactly the reason `participationAt` records: a branch-specific
 * assignment WINS over the org-wide one, so flipping the org-wide row to `inactive` cannot touch a
 * destination stated as an explicit branch — and a branch she reaches *only* through that row is
 * precisely the set being withdrawn. The alternatives `publishStaffRoster`'s header names —
 * amending the publisher (a PROTECTED path) or an FR saying what an org-wide withdrawal means per
 * branch — are both bigger than the case and neither is needed.
 *
 * **The branches to repair are therefore computed and not assumed**: every branch the departing
 * assignments reach, MINUS every branch the new set still reaches (`keeping`). For a branch-specific
 * departure that is the one branch, unchanged. For an org-wide departure it is every branch except
 * the ones she was just given explicitly. And the subtraction is not cosmetic — without it, a person
 * moved from `[branch A]` to `[org-wide]` would be published `inactive` at A and then `active` again
 * one statement later, two versions for one act, on a branch she never left.
 *
 * ⚠ **A CONSEQUENCE THAT IS NOW REACHABLE AND IS RECORDED RATHER THAN GUARDED: a person may end up
 * holding NO assignment at all** (this route's `assignments: []`, which nothing refuses — `01-F26`
 * gives the axis and no FR makes an assignment mandatory). She then reaches no branch, so no
 * artifact carries her and `setPersonPin` below writes her credential and publishes it nowhere. That
 * is the fail-closed direction and it self-heals: `publishStaffRoster`'s `left join` picks the
 * credential up the moment a re-assignment gives her a branch again. Refusing an empty set here
 * would be inventing policy (commandment 2).
 *
 * **Participation is CARRIED, never reset** (`11-F22`): a branch she already held keeps its status,
 * so re-assigning her role at a branch she is deactivated at cannot silently return her to
 * `active` with a working PIN hash — which is the resurrection the FR was rewritten around. A
 * branch she did not hold is `active`, because a new assignment is a person who works there.
 *
 * ⚠ **THE FINAL WRITE RE-READS UNDER THE LOCK IT WRITES UNDER, AND THE DRAFT THAT DID NOT WAS A
 * LOST UPDATE WITH A `200` ON IT.** The act cannot be one statement (see the order paragraph above),
 * so it spans several transactions — and the first draft committed the first one, released the row,
 * and then wrote back from a SECOND transaction the array it had computed in the FIRST. Measured
 * against a real Postgres: a `setUserStatus` that committed in the window was overwritten back to
 * `active`, R32's credential deletion was **not** rolled back with it, and the artifact then served
 * an `active` member with no hash — `11-F23`'s named defect, produced by composing two functions
 * each of which is correct alone. `setUserStatus`'s own header says its `for update` prevents
 * exactly this, and it does — *inside* that function. **A lock protects a value only while EVERY
 * writer of that value holds it across its own read and its own write** (`11-F22` also has the
 * AUTHORIZATION SUBJECT read this status, so a lost deactivation is a person the product says it let
 * go going on authorizing writes into an append-only ledger — `01-F1`).
 *
 * **It re-reads and REMOVES the departing keys rather than putting back a snapshot.** The role edits
 * this act made in its first transaction survive because they are already in the row; anything
 * another writer committed meanwhile survives for the same reason. Nothing computed before the lock
 * was released is written after it.
 *
 * ⚠ **AND IT IS DELIBERATELY NOT THE DEADLOCK SHAPE.** The ⚠ block at the top of this file measures
 * `setUserStatus` followed by `publishStaffRoster` in ONE caller transaction at `SQLSTATE 40P01` in
 * **8 of 8** rounds. This transaction contains one `select … for update` and one `update`, both on
 * `kernel.users`, and **no publish**: every `publishStaffRoster` in this module is still a top-level
 * call on the pooled handle. It takes no advisory lock either, so it can never hold one while
 * waiting for a row lock, nor hold a row lock while waiting for an advisory one — there is no cycle
 * to close.
 */
export const setPersonAssignments = async (
  db: GatewayDb,
  args: {
    readonly org_id: string;
    readonly user_id: string;
    readonly assignments: readonly AssignmentInput[];
  } & Act,
): Promise<void> => {
  // `01-F26`/`01-F71`, on `insertUser`'s own reasoning and through its own function: an assignment
  // naming another org's branch is `00 §5.4`'s isolation boundary crossed in STORAGE, and it
  // becomes `can()`'s subject on every till that receives the roster. Refused here or nowhere.
  await assertAssignedBranchesAreThisOrgs(db, {
    org_id: args.org_id,
    user_id: args.user_id,
    assignments: args.assignments,
  });

  const departing = await db.transaction(async (tx: GatewayDb) => {
    const held = await lockedAssignments(tx, args.org_id, args.user_id);
    const wanted = PersonRecord.shape.assignments.parse(
      args.assignments.map((assignment) => ({
        ...assignment,
        status:
          held.find((existing) => existing.branch_id === assignment.branch_id)?.status ?? "active",
      })),
    );
    // Keyed by `branch_id` and NOT filtered to branch-specific rows: `01-F26`'s org-wide assignment
    // is a departure like any other, and excluding it is what left a live hash at every branch it
    // reached — see the header.
    const leaving = held.filter(
      (assignment) => !wanted.some((keep) => keep.branch_id === assignment.branch_id),
    );
    // The destination first — see the header. Statuses are untouched by this write.
    await writeAssignments(tx, args.org_id, args.user_id, [...wanted, ...leaving]);
    return leaving;
  });

  // `01-F78` half one, asked of the set she is KEEPING: the branches that must not be told she left.
  // Read from the request's pairs because `branchesReached` reads `branch_id` and nothing else, so
  // there is no status here to go stale — the one value the old code carried across a released lock.
  const keeping = await branchesReached(db, args.org_id, args.assignments);

  if (departing.length > 0) {
    for (const assignment of departing) {
      // R32 lives in `setUserStatus` and only there, so a departure that really is a departure still
      // deletes the credential and a transfer still does not. `branch_id: null` is `01-F26`'s
      // org-wide row and that function already addresses it by name.
      await setUserStatus(db, {
        org_id: args.org_id,
        user_id: args.user_id,
        branch_id: assignment.branch_id,
        status: "inactive",
      });
    }
    // Every branch the departing assignments reached and the new set does not. Published while she
    // still reaches them — the departing rows are not removed until the transaction below, and this
    // is the only moment the correction is publishable at all (`01-F78` half one). What it leaves is
    // `11-F22`'s marked entry instead of a stale `active` row holding a hash that unlocks tills she
    // no longer works at (R25). One publish per branch, after ALL the flips, so a person losing an
    // org-wide row and a branch row in one act mints one version per key and not two.
    await publishTo(
      db,
      args.org_id,
      (await branchesReached(db, args.org_id, departing)).filter(
        (branch_id) => !keeping.includes(branch_id),
      ),
      [args.user_id],
      args,
    );

    const gone = new Set(departing.map((assignment) => assignment.branch_id));
    await db.transaction(async (tx: GatewayDb) => {
      // RE-READ under the lock this writes under, and REMOVE — never put back an array read before
      // the lock was released. See the header: that was a lost update with a `200` on it.
      const current = await lockedAssignments(tx, args.org_id, args.user_id);
      await writeAssignments(
        tx,
        args.org_id,
        args.user_id,
        current.filter((assignment) => !gone.has(assignment.branch_id)),
      );
    });
  }

  // `01-F78` half one in BOTH directions: the branch that GAINED her has never heard of her.
  await publishTo(db, args.org_id, keeping, [args.user_id], args);
};

/**
 * `14-F14`'s **PIN set/reset**, and `01-F75`'s publish that makes it reach a till.
 *
 * **A HASH arrives here and never a PIN** (`11-F21`: *"a PIN exists in exactly two places … the
 * keypad it is typed on and the argument to a verify call"*). `setPinCredential` puts the Argon2id
 * call at the caller precisely so this service creates no second hashing site, and `services/api`
 * is the boundary the plaintext stops at.
 *
 * **The publish is not a nicety.** `publishStaffRoster`'s header: *"a device that never learns of
 * one verifies against the old hash for ever"* — a reset that writes `kernel.user_credentials` and
 * stops there is the whole act failing silently, on every till in the branch.
 *
 * ⚠ **ON A PERSON HOLDING NO ASSIGNMENT THIS WRITES THE CREDENTIAL AND PUBLISHES NOWHERE, ANSWERING
 * `200` — measured, and left as it is.** The state became reachable when `setPersonAssignments`
 * started withdrawing org-wide assignments (its header records the same consequence): she reaches no
 * branch, `branchesReached` returns nothing, and `publishTo` iterates an empty list. It is the
 * fail-closed direction — R25 makes an artifact's scope the credential blast radius, and there is no
 * artifact whose scope she is inside — and it self-heals, because `publishStaffRoster`'s `left join`
 * reads `kernel.user_credentials` at publish time, so her next assignment carries the hash to the
 * branch it names. Refusing the reset, or refusing an empty assignment set upstream, would each
 * answer a question no FR has asked (commandment 2).
 */
export const setPersonPin = async (
  db: GatewayDb,
  args: { readonly org_id: string; readonly user_id: string; readonly pin_hash: string } & Act,
): Promise<void> => {
  // Refuses a person outside this org BY NAME and before anything is written (`01-F71`), so a
  // cross-tenant reset publishes nothing and changes nothing on either side.
  await setPinCredential(db, {
    org_id: args.org_id,
    user_id: args.user_id,
    pin_hash: args.pin_hash,
    now: args.now,
  });
  const held = await assignmentsOf(db, args.org_id, args.user_id);
  await publishTo(
    db,
    args.org_id,
    await branchesReached(db, args.org_id, held),
    [args.user_id],
    args,
  );
};

/**
 * `11-F22`'s participation transition — `14-F14`'s deactivation, which *"preserves historical
 * attribution"*.
 *
 * `setUserStatus` does all of the deciding: it parses the status word through
 * `PersonAssignment`'s own schema **before** it opens its transaction (so a refused word destroys
 * no credential), it refuses a person this org has no record of and a branch she does not hold, and
 * it carries R32's credential deletion keyed to the LAST active assignment in the same unit of
 * work. Nothing is restated here; what this adds is `01-F75`'s publish.
 *
 * **The reach is read AFTER the write**, so a person deactivated at her last branch is still
 * published as `11-F22`'s marked entry at every branch she reaches — a departure is a marked entry
 * and never an absence, or a past order at that branch renders a raw UUID (R26, `01-F55`).
 */
export const setPersonStatus = async (
  db: GatewayDb,
  args: {
    readonly org_id: string;
    readonly user_id: string;
    readonly branch_id: string | null;
    readonly status: string;
  } & Act,
): Promise<void> => {
  await setUserStatus(db, {
    org_id: args.org_id,
    user_id: args.user_id,
    branch_id: args.branch_id,
    status: args.status,
  });
  const held = await assignmentsOf(db, args.org_id, args.user_id);
  await publishTo(
    db,
    args.org_id,
    await branchesReached(db, args.org_id, held),
    [args.user_id],
    args,
  );
};
