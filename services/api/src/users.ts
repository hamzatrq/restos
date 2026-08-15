/**
 * The user store — the ONLY place a role comes from (Commandment 8, `18 §5`).
 *
 * `01-F26` is "User × Role × per-location assignment", and the founder's July ruling (`dac8747`)
 * settles how a person proves they are that user: email + password, Argon2id, our own
 * implementation, sessions in this service. The hashing itself is NOT reimplemented here —
 * `packages/domain/src/pin.ts` already owns Argon2id at `01-F61`'s cost floor and `01-F26` says
 * the hashing story stays single, so this store holds a PHC string that `verifyPin` reads.
 *
 * A PORT, not a table. B-2 builds the host; B-3 owns the catalog store and B-4 the publish path,
 * and whichever of them first needs users durably backs this interface with Drizzle. The
 * in-memory implementation below is what B-2 ships, and it is marked as such rather than
 * pretending to be persistence.
 */

import type { RoleAssignment } from "@restos/domain";

/**
 * One user, as the SERVER knows them. Nothing in this record ever arrives from a client: the
 * assignments are read here on every request (`01-F27`), never carried in a token or a body.
 */
export type UserRecord = {
  readonly user_id: string;
  /**
   * `AuthSubject.org_id` — one org per user. `backoffice-catalog.md` Q3 leaves multi-org
   * membership open ("a vendor-onboarding team member legitimately touches several"), and
   * `AuthSubject` carries a single `org_id`, so one is what this store can honestly hold.
   */
  readonly org_id: string;
  readonly email: string;
  /**
   * `11-F20` — the person's name, and `21-F15`'s only permitted value in a person's name slot.
   *
   * **OPTIONAL here although `11-F20` makes it REQUIRED, and that is a stated stopgap rather than a
   * disagreement with the FR.** The FR puts the requirement on "the one record both planes read",
   * and its writer is `14-F14`'s user CRUD (`15-F26` creates the first one) — neither of which
   * exists. The only writer this service has is `bootstrapUsers`, which `15-F26` itself names as
   * "a development seed … a stopgap standing in a provisioning step's place". So the requirement is
   * enforced where a person is CREATED, and this record carries what it honestly has.
   *
   * **Absent is `null` at the surface and never a default.** "Owner", "User" or the email's local
   * part would each be a name the product invented for a human being, and `21-F15` forbids exactly
   * that: where the record has no name, the slot says what is missing and where it is set. This is
   * the same posture `0010` took for `device_registry.display_name` — nullable in storage, required
   * at a writer that is OWED — and it is deliberately the same, so both close the same way.
   */
  readonly display_name?: string;
  /** Argon2id PHC string from `domain`'s `hashPin`. Never the password. */
  readonly password_hash: string;
  readonly assignments: readonly RoleAssignment[];
};

export type UserStore = {
  /** The login lookup. Case-folded, because an email is not case-sensitive in its local use. */
  findByEmail(email: string): Promise<UserRecord | null>;
  /**
   * The per-request lookup (`01-F27`). Returns `null` for a user who has been removed, which is
   * how a still-valid token stops opening anything.
   */
  findById(user_id: string): Promise<UserRecord | null>;
  /**
   * Re-assign a user's roles. Present on the port because revocation has to be expressible for
   * the `01-F27` "every operation, not at login" law to be assertable at all; the durable
   * implementation is owed with the user-admin surface (`14-F11`+, out of scope per plan §2).
   */
  setAssignments(user_id: string, assignments: readonly RoleAssignment[]): void;
};

const fold = (email: string): string => email.trim().toLowerCase();

/**
 * The in-memory implementation B-2 ships. STUB, and named one: it is process-local and dies with
 * the process, so it is a host-under-test and a dev seed, never production storage. Replacing it
 * is one `UserStore` implementation and no change to anything below.
 */
export const createMemoryUserStore = (seed: readonly UserRecord[]): UserStore => {
  const byId = new Map<string, UserRecord>(seed.map((user) => [user.user_id, user]));
  const idByEmail = new Map<string, string>(seed.map((user) => [fold(user.email), user.user_id]));

  return {
    findByEmail: async (email) => byId.get(idByEmail.get(fold(email)) ?? "") ?? null,
    findById: async (user_id) => byId.get(user_id) ?? null,
    setAssignments: (user_id, assignments) => {
      const user = byId.get(user_id);
      if (user !== undefined) byId.set(user_id, { ...user, assignments });
    },
  };
};
