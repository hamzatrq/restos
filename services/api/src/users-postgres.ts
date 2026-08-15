/**
 * **`UserStore` OVER `kernel.users` — THE LOGIN PATH'S SEAM TO A PERSISTED OWNER** (`15-F26`,
 * `15-F27`, `11-F20`).
 *
 * **The defect this closes, stated as the gateway already stated it** (`services/sync-gateway`'s
 * guide, verbatim: *"`kernel.users` IS WRITTEN HERE AND STILL READ FROM MEMORY BY `services/api`
 * … The owner this command creates cannot yet sign in."*). `pnpm -C services/sync-gateway
 * create-owner` persists a real owner with an Argon2id credential into `kernel.users` (`0011`), and
 * this service built its `UserStore` from `createMemoryUserStore(bootstrapUsers(env))` — three
 * environment variables in a `Map`. So a tenant could be provisioned and **nobody in it could sign
 * in**, and every restart wiped every account. That is AGENTS.md's recurring defect — a correct
 * subsystem with no seam to the product — sitting on the SaaS's front door.
 *
 * ## Why this reads Postgres directly instead of adding an `/internal` route
 *
 * Every other cross-service read in this package goes over the gateway's `/internal` surface
 * (`gateway-client.ts`), so the precedent argues for a fifth route. It loses here, on three
 * measured grounds rather than a preference:
 *
 *   - **`18 §2` bans the cross-service *import*, not the shared database, and `0011` already ruled
 *     on this table by name**: *"ONE WRITER, TWO READERS, AND THE SPLIT IS DELIBERATE … The writer
 *     is `services/sync-gateway` … `services/api` READS this table on the login path
 *     (`createPostgresUserStore`) and never writes it."* `18 §4`'s rule is one WRITER per table;
 *     this module never writes (see `setAssignments` below). No source crosses the boundary — the
 *     record shape is `packages/domain`'s `PersonRecord`, parsed here exactly as the gateway's own
 *     `tenancy.ts` parses it, so there is one declaration and not two.
 *   - **An `/internal` route would make EVERY authenticated request depend on the gateway.**
 *     `01-F27` re-reads the subject per request (`trpc.ts`), not at login, so `findById` is on the
 *     hot path of every call. `router.ts` records the opposite property as deliberate and
 *     `__acceptance__/startable.test.ts` pins it: that suite boots this service with
 *     `SYNC_GATEWAY_URL` pointing at a **closed port** and drives `auth.login` and
 *     `session.whoami` over a socket. A user store behind the gateway would 503 there — an
 *     identity read that cannot answer without a peer is not an identity read.
 *   - **The credential would be on the wire.** A route returning the row would ship the Argon2id
 *     PHC string to a second service on every login; a route taking the password would ship the
 *     plaintext. Reading the row over the database connection keeps the hash on the one hop it
 *     already travels.
 *
 * ## What is deliberately NOT weakened
 *
 * The hash is compared by `router.ts` with `domain`'s `verifyPin` — `01-F26`'s single hashing
 * story at `01-F61`'s cost floor — exactly as it was for the in-memory store. **No Argon2id call
 * site is added here**, no parameters are re-expressed, and no plaintext is read, written or
 * logged. This module selects `password_hash` and hands it to the one comparison that exists.
 */

import { redactedDsn } from "@restos/config";
import { PersonRecord } from "@restos/domain";
import postgres from "postgres";
import { IntegrationError } from "./errors.js";
import type { UserRecord, UserStore } from "./users.js";

/**
 * How this dependency is named to an operator — one name, so the sentence cannot drift by query.
 * It is NOT `"sync gateway"`: a login failing because Postgres is unreachable and a publish failing
 * because the gateway is unreachable are different outages with different fixes, and collapsing
 * them sends someone to restart the wrong process.
 */
const DEPENDENCY = "user directory";

/**
 * One row as `11-F20`'s record.
 *
 * **Parsed through `packages/domain`'s `PersonRecord`, never re-declared** (`18 §2`: "nobody
 * redeclares a domain type locally"). That is what makes this a second READER of one table rather
 * than a second interpretation of it: `create-owner` writes through the same schema, so a role
 * vocabulary or a name rule that changed in `domain` changes at both ends or compiles at neither.
 *
 * The parse is deliberately OUTSIDE the query's `try` below: a row this cannot read is a corrupt
 * directory, not an outage, and dressing it as retriable would tell an operator to wait.
 */
const toRecord = (row: Record<string, unknown>): UserRecord => {
  const person = PersonRecord.parse({
    user_id: String(row.user_id),
    org_id: String(row.org_id),
    display_name: String(row.display_name),
    // `assignments` is `jsonb`, so the driver hands back the parsed value; `RoleAssignmentWire`
    // is what judges it, in `domain`, against `ROLES`.
    assignments: row.assignments,
    grid_ordinal: Number(row.grid_ordinal),
  });
  return {
    user_id: person.user_id,
    org_id: person.org_id,
    email: String(row.email),
    display_name: person.display_name,
    password_hash: String(row.password_hash),
    assignments: person.assignments,
  };
};

/**
 * `UserStore` backed by `kernel.users`.
 *
 * **The connection is LAZY** (`postgres-js`), which is this deployment's established posture for a
 * database dependency: `services/sync-gateway`'s guide records that a missing database is *"never a
 * boot failure and never a hang"*. So a wrong DSN is not a crash at boot; it is a **named 503** on
 * the first login, which is `00 §5.7`'s honest degradation and is why the failure below is an
 * `IntegrationError` rather than a bare throw. **It is never an `UNAUTHORIZED`**: telling an owner
 * "invalid email or password" because Postgres is down is a lie the product would then repeat for
 * as long as the outage lasted.
 */
export const createPostgresUserStore = (dsn: string): UserStore => {
  const sql = postgres(dsn);

  const query = async (
    run: () => Promise<Record<string, unknown>[]>,
    what: string,
  ): Promise<Record<string, unknown> | undefined> => {
    try {
      return (await run())[0];
    } catch (cause: unknown) {
      throw new IntegrationError(
        DEPENDENCY,
        `${what}: the ${DEPENDENCY} (kernel.users at ${redactedDsn(dsn)}) could not be read ` +
          `(${cause instanceof Error ? cause.message : String(cause)}). Nothing was changed and ` +
          "no credential was rejected — this is an infrastructure state, not a wrong password. " +
          "Check that Postgres is running, that DATABASE_URL points at it, and that " +
          "`pnpm -C services/sync-gateway migrate` has been run.",
        { retriable: true, cause },
      );
    }
  };

  return {
    /**
     * The login lookup. `lower(email)` matches `users_email_lower_uq` exactly — the index and the
     * lookup fold the same way, which is what makes the answer single-valued (`0011`).
     */
    findByEmail: async (email) => {
      const row = await query(
        () =>
          sql<Record<string, unknown>[]>`select user_id, org_id, email, display_name,
              password_hash, assignments, grid_ordinal
            from kernel.users where lower(email) = lower(${email}) limit 1`,
        "login",
      );
      return row === undefined ? null : toRecord(row);
    },

    /**
     * The per-request lookup (`01-F27`, `trpc.ts`). `null` for a user who is no longer there, which
     * is how a still-valid session token stops opening anything — the property `authz.test.ts`
     * asserts against the memory store and that this implementation has to keep.
     */
    findById: async (user_id) => {
      const row = await query(
        () =>
          sql<Record<string, unknown>[]>`select user_id, org_id, email, display_name,
              password_hash, assignments, grid_ordinal
            from kernel.users where user_id = ${user_id} limit 1`,
        "session",
      );
      return row === undefined ? null : toRecord(row);
    },

    /**
     * **REFUSED, because this service is not this table's writer** (`18 §4`, `0011`: "ONE WRITER,
     * TWO READERS"). The port carries the method so that `01-F27`'s "every operation, not at login"
     * law is assertable against a test host; the durable re-assignment surface is `14-F14`'s user
     * CRUD, which does not exist, and improvising a second writer here is how one table ends up
     * with two.
     *
     * It throws rather than doing nothing on purpose: a silent no-op would let a future caller
     * believe a role had been revoked while `can()` went on allowing it on the next request.
     */
    setAssignments: () => {
      throw new Error(
        "kernel.users is written by services/sync-gateway and read here (18 §4, migration 0011): " +
          "this store cannot re-assign roles. The durable writer is 14-F14's user CRUD, which is " +
          "owed; until it lands, roles are set at provisioning by " +
          "`pnpm -C services/sync-gateway create-owner`.",
      );
    },
  };
};
