/**
 * **THE TENANCY DIRECTORY'S WRITER AND READER — `kernel.orgs`, `kernel.branches`, `kernel.users`.**
 *
 * `01-F68` (the org record), `01-F69` (the branch record), `11-F20` (the person record),
 * `15-F25` (the org's `active | suspended` lifecycle), `15-F26` (the first owner),
 * `15-F27` (every one of them created by an invokable, declared step).
 *
 * The tables landed in `0010`/`0011` with **no writer at all** — `services/sync-gateway/CLAUDE.md`
 * said so in as many words ("STORAGE ONLY: THEY HAVE NO WRITER YET"), and that is AGENTS.md's
 * recurring defect in its purest form: a correct schema, a correct domain model, and no way for a
 * human to put a row in either. This module is the seam, and the four declared commands beside it
 * (`create-org`, `create-branch`, `create-owner`, `list-tenancy`) are how it is reached.
 *
 * **VALIDATION IS `packages/domain`'s, NEVER RE-EXPRESSED HERE.** `OrgRecord`, `BranchRecord`,
 * `PersonRecord` and `DisplayName` are declared once (`18 §2`: "nobody redeclares a domain type
 * locally"), and every write below parses through them before it reaches SQL. That is what makes
 * the schema's deliberate absence of CHECK constraints safe: `schema.ts` states that this service
 * validates closed sets at the WRITER so a closed set has exactly one interpretation, and this file
 * is the writer it means.
 *
 * **ORDERING IS ENFORCED HERE BECAUSE THE SCHEMA CARRIES NO FOREIGN KEY** (`01-F68` forbids one and
 * `0010` extends the restraint to the directory's own edges). A branch under an unnamed org and an
 * owner in an unnamed org are refused by name — `15-F27`, and the same completeness discipline
 * `01-F60` already puts at `publishCatalog`.
 *
 * **NOTHING HERE EMITS AN EVENT, and the reason is `revoke-device.ts`'s, unchanged.** `15-F4` says
 * provisioning emits the org's first `config.changed` and `15-F3` audits every staff action with an
 * actor; a command on a service host has no authenticated user, so `OrgEvent.actor_user_id` could
 * only ever be `null`, permanently, in an append-only store (`01-F1`). An unattributed provisioning
 * record is worse than none because it reads like one. `15-F27` records the ledger half as OWED to
 * the surface that has an actor.
 *
 * **NOTHING HERE UPDATES OR DELETES.** Three inserts and four selects. A stored name is changed by
 * `14-F2`/`14-F30` from an authenticated surface, `15-F25`'s status transitions belong to `15-F7`,
 * and `01-F68`/`01-F69`/`11-F20` each state that these records are never deleted. A provisioning
 * command that could rewrite a name would rewrite it by accident on a re-run, which is exactly the
 * failure `15-F27` refuses.
 */

import {
  BranchRecord,
  type BranchRecordT,
  OrgRecord,
  type OrgRecordT,
  PersonRecord,
  type PersonRecordT,
} from "@restos/domain";
import { sql } from "drizzle-orm";
import type { GatewayDb } from "./gateway.js";

/** The read surface shared by db and tx, exactly as `registry.ts` declares it. */
type SqlExecutor = Pick<GatewayDb, "execute">;

/**
 * `kernel.users` as this service stores it: `11-F20`'s person plus the cloud plane's credential.
 *
 * The credential is deliberately NOT on `PersonRecord` — `11-F20` enumerates "the credential each
 * plane needs" as a statement that they differ, and hoisting both into the shared record would put
 * a password hash on every device roster row.
 */
export type UserRow = PersonRecordT & {
  readonly email: string;
  /** An Argon2id PHC string (`domain`'s `hashPin`). Never a password. */
  readonly password_hash: string;
  readonly created_at: number;
};

/* ── orgs (01-F68, 15-F25) ─────────────────────────────────────────────────── */

/**
 * Insert one org. Returns `false` when a row with this `org_id` already exists and nothing was
 * written — the caller decides whether that is a no-op or a refusal, because it needs the stored
 * row to tell the two apart.
 *
 * `on conflict do nothing` rather than a read-then-insert: two operators running the same
 * provisioning script would otherwise both read "absent" and one would take a primary-key violation
 * with an unreadable message. The stored row is re-read by the caller either way.
 */
export const insertOrg = async (db: GatewayDb, record: OrgRecordT): Promise<boolean> => {
  const org = OrgRecord.parse(record);
  const rows = await db.execute(
    sql`insert into kernel.orgs (org_id, display_name, status, created_at)
        values (${org.org_id}, ${org.display_name}, ${org.status}, ${org.created_at})
        on conflict (org_id) do nothing
        returning org_id`,
  );
  return [...rows].length === 1;
};

export const readOrg = async (
  executor: SqlExecutor,
  orgId: string,
): Promise<OrgRecordT | undefined> => {
  const rows = await executor.execute(
    sql`select org_id, display_name, status, created_at from kernel.orgs where org_id = ${orgId}`,
  );
  const row = [...rows][0];
  return row === undefined ? undefined : rowToOrg(row);
};

/**
 * Every org on this host, oldest first — `15-F27`'s read-back.
 *
 * `created_at` then `org_id` so the list is stable between visits: without the tiebreak the planner
 * decides the order for two orgs provisioned in the same millisecond, and `listDevices` records the
 * same reasoning for the fleet list.
 */
export const listOrgs = async (executor: SqlExecutor): Promise<readonly OrgRecordT[]> => {
  const rows = await executor.execute(
    sql`select org_id, display_name, status, created_at from kernel.orgs
        order by created_at asc, org_id asc`,
  );
  return [...rows].map(rowToOrg);
};

const rowToOrg = (row: Record<string, unknown>): OrgRecordT =>
  OrgRecord.parse({
    org_id: String(row.org_id),
    display_name: String(row.display_name),
    status: String(row.status),
    created_at: Number(row.created_at),
  });

/* ── branches (01-F69) ─────────────────────────────────────────────────────── */

/** Insert one branch. `false` ⇔ a row with this `branch_id` already exists; nothing was written. */
export const insertBranch = async (db: GatewayDb, record: BranchRecordT): Promise<boolean> => {
  const branch = BranchRecord.parse(record);
  const rows = await db.execute(
    sql`insert into kernel.branches
          (branch_id, org_id, display_name, branch_type, branch_class, created_at)
        values (${branch.branch_id}, ${branch.org_id}, ${branch.display_name},
          ${branch.branch_type}, ${branch.branch_class}, ${branch.created_at})
        on conflict (branch_id) do nothing
        returning branch_id`,
  );
  return [...rows].length === 1;
};

/**
 * One branch by id, **without its org** — `01-F69`'s primary key is `branch_id` alone precisely so
 * that "under exactly one org" is a fact the row states rather than a pair the caller asserts. A
 * lookup keyed on `(org, branch)` would silently report "absent" for a branch that exists under a
 * different org, which is the one answer a provisioning refusal must not give.
 */
export const readBranch = async (
  executor: SqlExecutor,
  branchId: string,
): Promise<BranchRecordT | undefined> => {
  const rows = await executor.execute(
    sql`select branch_id, org_id, display_name, branch_type, branch_class, created_at
        from kernel.branches where branch_id = ${branchId}`,
  );
  const row = [...rows][0];
  return row === undefined ? undefined : rowToBranch(row);
};

export const listBranches = async (
  executor: SqlExecutor,
  orgId: string,
): Promise<readonly BranchRecordT[]> => {
  const rows = await executor.execute(
    sql`select branch_id, org_id, display_name, branch_type, branch_class, created_at
        from kernel.branches where org_id = ${orgId}
        order by created_at asc, branch_id asc`,
  );
  return [...rows].map(rowToBranch);
};

const rowToBranch = (row: Record<string, unknown>): BranchRecordT =>
  BranchRecord.parse({
    branch_id: String(row.branch_id),
    org_id: String(row.org_id),
    display_name: String(row.display_name),
    branch_type: String(row.branch_type),
    branch_class: String(row.branch_class),
    created_at: Number(row.created_at),
  });

/* ── users (11-F20, 15-F26) ────────────────────────────────────────────────── */

/**
 * Insert one user. `false` ⇔ the `user_id` or the case-folded `email` is already taken and nothing
 * was written.
 *
 * **Both conflict targets are covered on purpose.** `on conflict do nothing` with no target catches
 * every unique constraint on the table, which here is the primary key AND `users_email_lower_uq`.
 * Naming only the primary key would let a duplicate email raise a raw Postgres error out of a
 * provisioning command, and "duplicate key value violates unique constraint" is not a sentence an
 * operator can act on — the caller turns `false` into one that is.
 */
export const insertUser = async (db: GatewayDb, row: UserRow): Promise<boolean> => {
  const person = PersonRecord.parse(row);
  const rows = await db.execute(
    sql`insert into kernel.users
          (user_id, org_id, email, display_name, password_hash, assignments, grid_ordinal,
           created_at)
        values (${person.user_id}, ${person.org_id}, ${row.email}, ${person.display_name},
          ${row.password_hash}, ${JSON.stringify(person.assignments)}::jsonb,
          ${person.grid_ordinal}, ${row.created_at})
        on conflict do nothing
        returning user_id`,
  );
  return [...rows].length === 1;
};

/**
 * One org's people, `grid_ordinal` first — `01-F61`'s explicit order, which is the order the
 * identification grid renders and therefore the only one a reader should ever see.
 *
 * **The password hash is not selected.** It has exactly one reader (`services/api`'s login) and no
 * listing surface has any use for it; a credential that never leaves the row it lives in cannot be
 * printed by accident.
 */
export const listUsers = async (
  executor: SqlExecutor,
  orgId: string,
): Promise<
  readonly (PersonRecordT & { readonly email: string; readonly created_at: number })[]
> => {
  const rows = await executor.execute(
    sql`select user_id, org_id, email, display_name, assignments, grid_ordinal, created_at
        from kernel.users where org_id = ${orgId}
        order by grid_ordinal asc, user_id asc`,
  );
  return [...rows].map((row) => ({
    ...PersonRecord.parse({
      user_id: String(row.user_id),
      org_id: String(row.org_id),
      display_name: String(row.display_name),
      assignments: row.assignments,
      grid_ordinal: Number(row.grid_ordinal),
    }),
    email: String(row.email),
    created_at: Number(row.created_at),
  }));
};

/**
 * Does this org already have an owner? `15-F26` creates **the FIRST** one; a second is `14-F14`'s
 * user CRUD and not a provisioning act.
 *
 * The predicate is asked of `assignments` in SQL rather than by listing and folding in TypeScript,
 * because the answer must not depend on how many users the org has — an org with a thousand staff
 * would otherwise pull a thousand rows to answer a yes/no.
 */
export const orgHasOwner = async (executor: SqlExecutor, orgId: string): Promise<boolean> => {
  const rows = await executor.execute(
    sql`select 1 from kernel.users
        where org_id = ${orgId}
          and assignments @> '[{"role":"owner"}]'::jsonb
        limit 1`,
  );
  return [...rows].length === 1;
};

/**
 * The count of users whose email folds to this one, ANYWHERE on the host.
 *
 * Used for the refusal message only — the unique index is what actually enforces it. A check that
 * *decided* admission by reading first would be a TOCTOU race between two operators; this reads
 * after the insert reported a conflict, so it explains a refusal that has already happened.
 */
export const emailIsTaken = async (executor: SqlExecutor, email: string): Promise<boolean> => {
  const rows = await executor.execute(
    sql`select 1 from kernel.users where lower(email) = lower(${email}) limit 1`,
  );
  return [...rows].length === 1;
};
