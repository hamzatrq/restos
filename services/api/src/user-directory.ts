/**
 * `14-F14`'s USER CRUD as this service can express it — the port, and `user.changed`'s payload.
 *
 * **ONE port, six methods, and the coupling is `devices.ts`'s and deliberate.** Five reach
 * `services/sync-gateway`'s `kernel.users` / `kernel.staff_*` writer; `recordChange` reaches
 * `01-F62`'s org-scoped event store. Different tables, different concerns, and splitting them into
 * two ports was the obvious shape. It is rejected for the reason `DeviceDirectory` records: they
 * are two halves of ONE act. `14-F39` says in terms that a user CRUD shipped without the ledger
 * record *"does not ship an unledgered feature — it ships a `14-F2` violation, and the act it fails
 * to record is a change to who may sell in a restaurant, permanent under `01-F1`"*. A deployment
 * that wired the writer half and forgot the ledger half would create staff, reset PINs and
 * deactivate cashiers correctly, and attribute none of it — Rule B's hole with two ports instead of
 * one optional member (AGENTS.md).
 *
 * **The org is NOT a member of any input a client controls.** Every method takes it as an argument
 * that `user-router.ts` resolves from `ctx.subject.org_id` (`01-F71` (b): *"the org is taken from
 * the authenticated subject and never from the request"*). This port asks no questions about it,
 * exactly as `DeviceDirectory` and `DayLedger` do; the isolation decision is made one layer up, in
 * one place, for all of them.
 */

import { z } from "zod";

/** `01-F26`'s pair with `11-F22`'s participation on it, as the roster stores it. */
export type PersonAssignmentListing = {
  readonly role: string;
  /** `null` is `01-F26`'s ORG-WIDE assignment — how an owner holds Appendix A's "everything". */
  readonly branch_id: string | null;
  /** `11-F22`, `active | inactive`, at THIS location. */
  readonly status: string;
};

/**
 * One person as `14-F14`'s list renders her.
 *
 * ⚠ **NO CREDENTIAL OF ANY KIND, and that is a structural bound rather than a discipline.**
 * `11-F23` put the PIN hash in its own table precisely so a user lookup *"cannot return the
 * credential because it does not join to it"*, and `listUsers` in the gateway declines to select
 * `password_hash`. A read model that added either would spend both, and `14-F14` says a PIN is
 * *"never displayed"*.
 */
export type PersonListing = {
  readonly user_id: string;
  /** `11-F20` — required, and the person's ONE name across both planes. */
  readonly display_name: string;
  /** `null` for R30's till-only cashier, and never the four-letter string `"null"`. */
  readonly email: string | null;
  /** `01-F61`'s explicit grid position — assigned by the writer, never derived. */
  readonly grid_ordinal: number;
  readonly assignments: readonly PersonAssignmentListing[];
};

/** `01-F26`'s pair as an OWNER states it. The status is the writer's (`11-F22`) — see the gateway. */
export type UserAssignmentInput = {
  readonly role: string;
  readonly branch_id: string | null;
};

/** One `user.changed` record on its way to `01-F62`'s org-scoped store. */
export type UserChangeRecord = {
  readonly org_id: string;
  /** `14-F2`'s actor: the authenticated subject's id, never a client-stated one (commandment 8). */
  readonly actor_user_id: string;
  /** `01-F62`/`01-F18` — server time is the ordering authority for an org-scoped event. */
  readonly server_received_at: number;
  readonly payload: unknown;
};

/**
 * `14-F14`'s four acts and its read, plus `14-F2`'s ledger record.
 *
 * **`user_id` and `grid_ordinal` come BACK from `create` and are never sent to it** (`01-F61`): new
 * members append and the ordinal is explicit, so only the writer — reading the org's current
 * maximum inside the transaction that inserts — can assign one without two owners colliding.
 */
export type UserDirectory = {
  /** `14-F14`'s roster, in `01-F61`'s grid order. */
  list(org_id: string): Promise<readonly PersonListing[]>;
  create(args: {
    readonly org_id: string;
    readonly display_name: string;
    readonly email: string | null;
    readonly assignments: readonly UserAssignmentInput[];
    readonly actor_user_id: string;
    readonly now: number;
  }): Promise<{ user_id: string; grid_ordinal: number }>;
  /** `14-F14`'s "role × per-location assignment", edited. Absolute, never a delta. */
  setAssignments(args: {
    readonly org_id: string;
    readonly user_id: string;
    readonly assignments: readonly UserAssignmentInput[];
    readonly actor_user_id: string;
    readonly now: number;
  }): Promise<void>;
  /** `14-F14`'s PIN set/reset — a HASH, because `11-F21` stops the plaintext at this service. */
  setPin(args: {
    readonly org_id: string;
    readonly user_id: string;
    readonly pin_hash: string;
    readonly actor_user_id: string;
    readonly now: number;
  }): Promise<void>;
  /** `11-F22`'s participation transition at one `(person, branch)`. */
  setStatus(args: {
    readonly org_id: string;
    readonly user_id: string;
    readonly branch_id: string | null;
    readonly status: string;
    readonly actor_user_id: string;
    readonly now: number;
  }): Promise<void>;
  /** `14-F2`'s ledger record, as an `01-F62` org-scoped `user.changed` event. */
  recordChange(record: UserChangeRecord): Promise<void>;
};

/**
 * The acts `user.changed` distinguishes.
 *
 * **The list is doc 14's own, not this file's.** §2 declares the event as *"`user.changed`
 * (extension: create / role change / PIN reset — PINs stored Argon2id, never present in
 * payloads)"*, and `14-F14` adds the fourth act by name: *"deactivation preserves historical
 * attribution"*. Nothing here invents a fifth.
 */
const USER_CHANGE_ACTS = ["created", "assignments_changed", "pin_reset", "deactivated"] as const;

/**
 * `user.changed`'s payload.
 *
 * **Declared HERE and not in `packages/domain`, on `DeviceRevokedPayload`'s precedent** — which doc
 * 14 §9.11 names as the one to follow or to argue against: *"`device.revoked`'s payload is declared
 * beside its emitter because `domain` ships no org-scoped schemas — follow it or state why not."*
 * `01 §4` puts payload schemas in `domain` and `domain` ships none for the org-scoped family, so
 * introducing the first one there for a single reader would be the larger change, on a SACRED path.
 *
 * ⚠ **THE CONTENT IS A PINNED INTERPRETATION AND THE SPEC DECLARATION IS OWED.** §9.11 records the
 * payload as *"owed, not open"*, routes the declaration to doc 14 ("this document declares the
 * payload, doc 01 absorbs it"), and leaves exactly one thing open: *"whether before/after assignment
 * sets ride the payload or only the config version is undecided"*. So:
 *
 *   · **`act` and `user_id` are decided here** — `14-F2`'s *"no silent edits exist"* cannot be
 *     satisfied by a record that cannot say what happened or to whom, and `14-F15`'s per-user
 *     history has nothing to render without both.
 *   · **`branch_id` rides a deactivation**, because `11-F22` makes participation per-(person,
 *     branch): without it a two-branch cashier's departure record is ambiguous about WHICH location
 *     she left, permanently (`01-F1`).
 *   · **No before/after assignment set rides anything**, because that is the half §9.11 leaves open
 *     and deciding it in an emitter is exactly what `01-F78`'s preamble records as the failure to
 *     avoid ("a first implementation … decided the second half in a query").
 *   · **No PIN and no hash, ever** — doc 14 §2, verbatim: *"PINs stored Argon2id, never present in
 *     payloads"*. `01-F1` makes a payload permanent, so a credential in one cannot be redacted; it
 *     can only be superseded by a linked correction that leaves the original readable.
 *
 * **It is PARSED on the way out and the strip is the point.** `z.object` drops unknown keys, so
 * "never present in payloads" is a property of the emitter rather than a rule someone has to
 * remember when a field is added beside it — `scopeShape` in `trpc.ts` records the same reasoning
 * for a request coming the other way.
 */
export const UserChangedPayload = z.object({
  act: z.enum(USER_CHANGE_ACTS),
  /** `01-F1`: history is read long after the row it describes may have changed, so it names her. */
  user_id: z.string().min(1),
  /** Present on `deactivated` only; `null` is `01-F26`'s org-wide assignment. */
  branch_id: z.union([z.string().min(1), z.null()]).optional(),
});

/**
 * The fallback when a host declares no user directory — **every method REFUSES**, loudly.
 *
 * The tempting fallback is an in-memory stub, and it is the one shape AGENTS.md measured as
 * invisible to every rail we have: *"Rule B asks whether an optional member is supplied, never
 * whether what was supplied is real, and a stub is a supply."*
 *
 * **`create` refusing is the half a status code cannot prove**, and it is why this is a real
 * refusal rather than a convenience. `users.create` calls the port twice — the write, then
 * `14-F2`'s record — so a fallback whose `create` fabricated a `{user_id}` and whose `recordChange`
 * went on refusing produces byte-for-byte the reply a correct one does. A refusal borrowed from the
 * next call is not a property of the create at all: it evaporates the day the resolver's order
 * changes, and it would then report a minted `user_id` for a person no writer has ever seen —
 * under `11-F20`, which never deletes a person record.
 *
 * Returning `[]` from `list` was rejected for `unconfiguredDeviceDirectory`'s reason, sharper here:
 * an empty roster is a CLAIM about who works at this restaurant, and an unconfigured process is not
 * in a position to make it. An owner would see her staff gone and reach for the create button.
 */
export const unconfiguredUserDirectory = (): UserDirectory => {
  const refuse = (): never => {
    throw new Error(
      "user directory not configured: this API host was built with no `users` dependency, so it " +
        "can neither list nor write 14-F14's roster. `start()` always supplies one from " +
        "SYNC_GATEWAY_URL/_TOKEN; a host that reaches this line is a test host or a misconfigured " +
        "deployment. It refuses rather than answering emptily or minting — an empty roster and a " +
        "created person are both claims this process cannot make.",
    );
  };
  return {
    list: async () => refuse(),
    create: async () => refuse(),
    setAssignments: async () => refuse(),
    setPin: async () => refuse(),
    setStatus: async () => refuse(),
    recordChange: async () => refuse(),
  };
};
