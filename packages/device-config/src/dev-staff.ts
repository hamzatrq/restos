import { can, hashPin, ROLES, type Role } from "@restos/domain";

/**
 * # THE DEV STAFF SEED — `01-F26`'s roster, on every device that needs one
 *
 * **A DEV SEED, exactly like `DEV_IDENTITY` in `device-identity.ts`, and unlike it this one
 * verifies for real.** It exists because **nothing populates the staff registry yet**: `01-F47`'s
 * admission admits *devices, not people*, and the staff transport (`01-F21`/`01-F28`) is owed. With
 * no seed the identification grid is empty and nobody can unlock, which makes `pnpm start` unusable
 * on both apps and leaves the whole `02-F41` attribution path unexercised.
 *
 * ## WHY IT LIVES HERE AND NOT IN AN APP (`DEC-ARCH-001`, `18 §2`)
 *
 * `apps/pos-electron/src/main/index.ts` declared it first. `03-F53` gives the pass screen the same
 * `01-F26` PIN session, so it acquired a **second consumer** — and `18 §2` states *"Apps NEVER
 * import … other apps"* as a MUST, while `DEC-ARCH-001` rules EXTRACT at exactly that moment
 * rather than copy. `03-F53`'s own OWED (3) names the requirement in terms: the pass *"runs on the
 * same marked DEV SEED the counter does, and it is **one declaration read by both apps**, never a
 * second copy."*
 *
 * A copy is refused for `03-F40`'s reason, restated by the FR with a price on it: two declarations
 * of one roster is a pass screen and a till that **disagree about who is on shift** — and under
 * `02-F41` that disagreement is written into an append-only ledger `01-F1` forbids correcting in
 * place.
 *
 * ## THE PIN IS NOT IN THIS FILE, AND THAT IS DELIBERATE
 *
 * It comes from the environment, the same route `RESTOS_CLOUD_URL` and `RESTOS_DEVICE_TOKEN`
 * already take and for the same "admission has not landed" reason (`00 §7` layer 3 — a per-DEVICE
 * configured value). A hardcoded PIN here would be the device-wide constant `01-F61` refuses,
 * wearing a different name. **A member whose key is unset (or empty) is NOT SEEDED**, and an empty
 * grid is the honest state of a device no roster has reached (`00 §5.7`) — which is also what
 * production looks like until the transport lands. The surface says so rather than drawing an
 * empty box (`03-F53`: *"a device whose registry is empty says so"*).
 *
 *     RESTOS_DEV_PIN=<digits> RESTOS_DEV_PIN_BILAL=<digits> RESTOS_DEV_PIN_HINA=<digits> pnpm start
 *
 * ## ⚠ ONE PIN FOR THE WHOLE ROSTER WAS AN AUTHORIZATION HOLE — CLOSED (August 2026)
 *
 * This module hashed ONE `RESTOS_DEV_PIN` and wrote **the resulting string onto every member**,
 * `DEV_STAFF`'s branch manager included, and called the sharing deliberate on `01-F61`'s
 * authority. That reading was wrong, and the FR it cited is the one that condemns it:
 *
 *   - `01-F28` verifies "on-device against synced credential **hashes**" — plural, one per user.
 *     Nothing in `01-F26`/`01-F27`/`01-F28` admits ONE credential standing for three people.
 *   - `01-F61` names two staff sharing a 4-digit PIN as a hazard it TOLERATES when two humans
 *     happen to choose the same digits. It does not licence a seed to MANUFACTURE that state
 *     across a role boundary, and the identification step cannot repair it: tapping a tile is a
 *     CLAIM, and the hash is what is supposed to turn a claim into an authentication.
 *   - So `02-F22`'s role guard ("a cashier session cannot execute them") was one tile-tap away —
 *     the manager's row opened with the digits both cashiers type 20–60× a shift — `02-F38`'s
 *     self-approval refusal is keyed on a `user_id` that one secret opened twice and therefore
 *     refused nothing, and `02-F41` wrote the wrong person into a ledger `01-F1` forbids
 *     correcting in place.
 *
 * **There is one key per member now** (`DEV_STAFF_PIN_ENV`), and **no fallback**: a member nobody
 * configured is absent from the grid rather than reachable with a neighbour's digits. That is
 * `01-F60`'s argument for a REQUIRED input applied to a credential — "a caller who simply forgot
 * the argument silently received no completeness check at all" — and the failure direction is the
 * safe one, because an absent tile is visible and a shared credential is not.
 *
 * **Delete this the moment the staff transport lands**, and let the roster sync.
 */

/**
 * The environment variable that carried the WHOLE roster's PIN until August 2026. It survives as
 * **one member's key** — the first cashier's, below — rather than being retired, and the choice is
 * deliberate on `00 §5.7` grounds: `ops/startup/*.bat` refuses to start a till without it, so
 * retiring the name would turn a corrected configuration into a Windows machine that does not boot
 * at 09:00. Kept live, it can no longer open the branch manager's row, which is the whole of the
 * hole; an operator who upgrades and changes nothing gets ONE CASHIER and a boot line that names
 * everybody it could not seed (`describeDevStaff`).
 */
export const DEV_PIN_ENV = "RESTOS_DEV_PIN";

/**
 * **The ROLES are part of the seed, and the mix is deliberate.** `01-F26` makes a role a
 * per-(user, location) assignment and `apps/pos-electron`'s `main/authorize.ts` reads exactly this
 * registry to answer commandment 8 — so a roster of three cashiers would make `02-F22`'s day open
 * unreachable on a dev launch (*"day open/close and float entry require manager/owner permission —
 * a cashier session cannot execute them"*), and the guard would look like a bug rather than the FR.
 * Two cashiers and one branch manager put both sides of that guard on the same till: sign in as
 * Ayesha and the day cannot be opened; sign in as Hina and it can.
 *
 * **The pass reads the same rows and uses none of the roles** (`03-F53`: *"Signing in at the pass
 * grants no authority; it supplies attribution"* — `PERMISSION_ACTIONS` carries no line-state
 * member, so routing a bump through `can()` would deny every bump). One roster, two readings of it,
 * and the reading that authorizes is the counter's.
 */
export const DEV_STAFF = [
  { user_id: "00000000-0000-7000-8000-000000000004", display_name: "Ayesha", role: "cashier" },
  { user_id: "00000000-0000-7000-8000-000000000005", display_name: "Bilal", role: "cashier" },
  {
    user_id: "00000000-0000-7000-8000-000000000006",
    display_name: "Hina",
    role: "branch_manager",
  },
] as const;

/**
 * **user_id → the `00 §7` layer-3 environment key carrying THAT member's PIN.** One key per member
 * of `DEV_STAFF`, pairwise distinct — which is the property, and the only property, that stops one
 * configured secret becoming two people's credential (`01-F28`).
 *
 * **Declared by the package and not by each host** for `DEC-ARCH-001`'s reason, one level down from
 * the roster itself: both `apps/pos-electron` and `apps/pass-kds` seed this registry, and two
 * spellings of one variable is a till and a pass screen that disagree about who can sign in —
 * silently, because an unset variable seeds nobody rather than erroring.
 *
 * The first cashier keeps `DEV_PIN_ENV` (see its own note); the other two are new names. The map is
 * written out rather than derived from `display_name` so that adding a member to `DEV_STAFF` is a
 * deliberate act here as well — a derived key would hand a new row a credential route nobody chose.
 */
export const DEV_STAFF_PIN_ENV: Readonly<Record<string, string>> = {
  "00000000-0000-7000-8000-000000000004": DEV_PIN_ENV,
  "00000000-0000-7000-8000-000000000005": "RESTOS_DEV_PIN_BILAL",
  "00000000-0000-7000-8000-000000000006": "RESTOS_DEV_PIN_HINA",
};

/**
 * The registry this writes into, **structurally typed** exactly as `DisplayFacts` already is in
 * `panel-density.ts` — so this package needs no dependency on `@restos/sync-client` and the
 * `packages → packages` edge stays one type-only import of `@restos/domain`. A host passes
 * `store.staff`.
 *
 * ⚠ **`list()` and the `apply` RESULT are both load-bearing, added 2026-08-17** (R21/R28, and the
 * `apps/pos-electron/src/main/catalog.ts:247` precedent — ⚠ this cited `:248`, one line past the
 * `return result.applied` it is pointing at, corrected 2026-08-17). `apply` was typed `unknown` and its
 * result discarded, which is half of `seedDevMenu` — the half where the seed learns whether it
 * seeded. `list()` is what lets this file tell a roster the device RECEIVED from one this file
 * wrote; `version()` cannot (see `seedDevStaff`'s guard).
 */
export type DevStaffRegistry = {
  version(): number;
  apply(update: {
    readonly kind: "snapshot";
    readonly version: number;
    readonly members: readonly {
      readonly user_id: string;
      readonly display_name: string;
      readonly pin_hash: string;
      readonly assignments: readonly { readonly role: string; readonly branch_id: string | null }[];
    }[];
  }): { readonly applied: boolean };
  /**
   * The whole roster. Narrower than `sync-client`'s `StaffMember` on purpose — this file reads
   * only the three fields it can act on, so a new column on the wire record does not have to be
   * re-declared here to keep the structural match.
   */
  list(): readonly {
    readonly user_id: string;
    readonly display_name?: string;
    readonly assignments: readonly { readonly role: string; readonly branch_id: string | null }[];
  }[];
};

/**
 * What a HOST knows about its own device when it draws the boot line: the roster on it, where it
 * stands, and what the seed just reported. Structurally typed for the same reason
 * `DevStaffRegistry` is — no runtime edge to `@restos/sync-client`; a host passes
 * `{ registry: store.staff, identity: store.identity, seeded: <what seedDevStaff returned> }`.
 *
 * **All three members are REQUIRED, and that is `01-F60`'s argument rather than a preference:**
 * *"a caller who simply forgot the argument silently received no completeness check at all"*. An
 * optional `identity` would make the location axis skippable and re-open exactly the defect
 * `canOpenTheDay` was fixed for; an optional `seeded` would let a host go on discarding the seed's
 * refusal, which is the state this whole parameter exists to end. Forgetting either is a typecheck
 * error now.
 */
export type DevStaffDevice = {
  /** The device's own roster, read-only — `Pick<…, "list">`, because a boot line may not write one. */
  readonly registry: Pick<DevStaffRegistry, "list">;
  /**
   * Where this device stands. `01-F26` makes a role a per-(user, **LOCATION**) assignment, so a
   * roster read for AUTHORITY cannot be read without the location it is being read at — see
   * `canOpenTheDay`, which was wrong in exactly that way until this member existed.
   */
  readonly identity: DevStaffLocation & { readonly branch_id: string };
  /**
   * What `seedDevStaff` returned on **this** boot. The registry says what is on the device and
   * this says whether the seed put it there, which is the one fact no amount of reading the
   * registry can recover — an empty grid because nobody was configured and an empty grid because
   * the registry REFUSED the write look identical from `list()`.
   */
  readonly seeded: boolean;
};

/**
 * The `user_id`s this file writes — the compile-time literals of `DEV_STAFF`, and the only rows
 * this seed will ever overwrite. (⚠ This said *"declared 30 lines up"* and `DevStaffDevice` landing
 * above it made that false the same day. A distance is a claim that goes quietly wrong every time
 * the file grows; name the declaration.)
 *
 * **This is the discriminator, and `version()` is not.** R28 draws the line at RECEIVED vs
 * NEVER-RECEIVED, not at a number: `packages/sync-client/src/staff.ts:231` refuses a snapshot only
 * when `update.version < held`, and a device nothing has written to holds `0`, so a publisher whose
 * first snapshot carries **version 0** is applied and leaves `version()` at `0` — indistinguishable
 * by that number alone from a device no roster has ever reached. A `version() > 0` guard (the shape
 * `apps/pos-electron/src/main/catalog.ts:241` ships for the MENU, where the same reasoning does not
 * bite because a v0 catalog is what the dev seed itself writes) would wipe that roster, which under
 * R21 is a day of ledger `01-F1` forbids correcting.
 */
const SEEDED_USER_IDS: ReadonlySet<string> = new Set(DEV_STAFF.map(({ user_id }) => user_id));

/**
 * Members on the device that this file did not write — i.e. a roster that was **RECEIVED**.
 *
 * ⚠ **What this closes, and the neighbouring case it does NOT** (`AGENTS.md` instance 15: a guard
 * that closed the instance and said so in a comment, while the case one keystroke away stayed
 * open). CLOSED: any roster carrying a person `DEV_STAFF` does not name, at ANY version, v0
 * included. NOT CLOSED: a received roster consisting of nothing but these three `user_id`s — which
 * no publisher can produce today, because they are literals in this file and nothing else writes
 * them — and a received roster that is **EMPTY**, which is invisible here by construction.
 *
 * ⚠ **THE SECOND CASE HAD A SENTENCE HERE CLAIMING A PROTECTION, AND THE PROTECTION WAS AN
 * ARTIFACT OF A VERSION NUMBER (corrected 2026-08-17).** It said *"an empty roster received at v3
 * leaves `version()` at `3`, so the seed's own snapshot at `0` is refused `stale` … and the
 * fixture people still do not land."* That was true of a snapshot pinned at `0`, and it is
 * **exactly the discriminator R28 refuses**: a publisher who empties the roster with a snapshot at
 * **v0** leaves `version()` at `0`, the seed writes at `0`, and the fixture people land anyway. So
 * the protection held at some versions and not at others, for a device in one state — which is
 * what "the line is not drawn at a number" means. `seedVersionFor` now writes at the HELD version
 * (see its own note), so the case is open at every version rather than closed at some, and it is
 * stated here rather than left to look designed.
 *
 * ⚠ **AND THE MITIGATION THIS NOTE USED TO CLAIM WAS MEASURED FALSE, so it is stated as an OPEN
 * case instead.** It read: *"What makes it survivable is that the boot line reports the DEVICE
 * (`describeDevStaff`), so a till holding fixture people says so out loud."* An adversarial review
 * ran it: a pilot till whose publisher delivered a roster at v1 and then let both staff go with a
 * delta at v2 receives three fixture credentials — one of them a `branch_manager` holding
 * `02-F22`'s day-open authority — and its boot line is **byte-identical** to a fresh dev till's.
 * The line reports who is on the device; it does not report whether this device has ever been on
 * the transport, and that is the only fact separating the R21 case from the benign one. **So the
 * boot line is not a mitigation for this case and must not be read as one.** It is not a
 * regression either — the original `version() + 1` build behaved the same way, and only the
 * one-day literal `0` refused it, by accident rather than by design. Closing it needs a fact the
 * device does not record today (has a roster ever arrived here), which is `01-F56`'s health
 * surface and step 8's `StaffHealth`, not this file's to invent (commandment 2).
 */
const receivedMembers = (
  registry: Pick<DevStaffRegistry, "list">,
): readonly { readonly user_id: string; readonly display_name?: string }[] =>
  registry.list().filter(({ user_id }) => !SEEDED_USER_IDS.has(user_id));

/** Where this device stands. `01-F26` makes a role a per-(user, **LOCATION**) assignment. */
type DevStaffLocation = { readonly org_id: string; readonly branch_id: string | null };

/**
 * Does anybody in this roster hold `02-F22`'s day-open authority **at this location**?
 *
 * ⚠ **THIS WAS A SECOND DECLARATION OF A `packages/domain` MATRIX CELL UNTIL 2026-08-17, AND IT
 * DROPPED AN AXIS THE MATRIX CARRIES.** It read `DAY_OPENING_ROLES = new Set(["branch_manager",
 * "owner"])` and asked whether any assignment anywhere on the device named one of them.
 * `permissions.ts` calls that a violation in terms — `can` is *"the only reader of the matrix — an
 * inline role check anywhere else is a violation"* — and it was **wrong** rather than merely
 * duplicated: `rolesAt` filters `branch_id === null || branch_id === <this branch>` and the copy
 * filtered nothing, so a delivered roster whose only manager is assigned to **another** branch
 * suppressed the warning while `can()` would deny her the day open on this device. Measured on a
 * real store before the fix: one `branch_manager` at a foreign branch, and the boot line said
 * nothing at all.
 *
 * Read to decide a BOOT LINE and nothing else — authorization stays where commandment 8 puts it,
 * on the acting path (`apps/pos-electron/src/main/authorize.ts`). What changed is that this line
 * now asks the SAME function that will refuse the act, so the two can no longer disagree
 * (`03-F40`).
 *
 * `escalate` deliberately does not count. The matrix carries no escalate cell for this action
 * today, but if one ever lands it means somebody ELSE's credential closes the gap — and that
 * person's absence is the whole subject of the warning.
 */
const canOpenTheDay = (
  roster: readonly {
    readonly user_id: string;
    readonly assignments: readonly { readonly role: string; readonly branch_id: string | null }[];
  }[],
  location: DevStaffLocation,
): boolean =>
  roster.some(
    (member) =>
      can(
        {
          user_id: member.user_id,
          // A device store is BOUND to one org (`01-F64`), so every row on it is this org's and
          // `can`'s subject/scope org check is a tautology here. It is passed rather than faked
          // because refusing a cross-org subject is the matrix's judgement to make, not this
          // file's.
          org_id: location.org_id,
          // `01-F17` — a roster this device cannot fully read must not take the boot line down
          // with it, and that is TWO axes rather than one. (a) The wire record types `role` as an
          // OPEN string while the matrix is a CLOSED list, so a row naming a role `ROLES` does not
          // carry contributes no authority instead of throwing. (b) `assignments` itself may not
          // be an array at all: `staff.ts`'s `list()` is `JSON.parse(json) as StaffMember`, an
          // unchecked cast, and `staff.ts` records in its own words that `STRICT` "constrains the
          // column's TYPE, not the validity of what is in it".
          //
          // ⚠ (b) was added after an adversarial review measured the omission — `P8A` threw
          // `Cannot read properties of undefined (reading 'filter')` and `P8B` threw
          // `member.assignments.filter is not a function` — against a comment that already claimed
          // the whole class. Before this change `describeDevStaff` never touched the registry; it
          // is now on BOTH hosts' boot path, so an unreadable row would have crashed the very
          // surface `01-F17` measures a stopped till at. The comment stating the class while the
          // code closed one axis is AGENTS.md instance 15, reproduced inside a change that cites
          // instance 15 — which is why the guard is now the shape of the claim.
          assignments: (Array.isArray(member.assignments) ? member.assignments : []).filter(
            (assignment): assignment is { role: Role; branch_id: string | null } =>
              (ROLES as readonly string[]).includes(
                (assignment as { role?: unknown } | null)?.role as string,
              ),
          ),
        },
        "day.open_close",
        { org_id: location.org_id, branch_id: location.branch_id },
      ).outcome === "allow",
  );

/**
 * The org and branch used when the question is about a ROLE and there is no device to ask about —
 * the environment-only boot line, which knows what an operator CONFIGURED and cannot know where
 * anybody is assigned. Both sides of `can` get the same values, so the org check passes and the
 * location axis cancels; the answer is therefore about the request and about no device, which is
 * exactly what that path is entitled to claim. It keeps `can` the only reader of the matrix.
 */
const ROLE_ONLY_LOCATION: DevStaffLocation = { org_id: "role-only", branch_id: null };

const roleOpensTheDay = (role: string): boolean =>
  canOpenTheDay(
    [{ user_id: "role-only", assignments: [{ role, branch_id: null }] }],
    ROLE_ONLY_LOCATION,
  );

/**
 * The version the seed writes at: **the one the device already holds.**
 *
 * ⚠ **THIS WAS A LITERAL `SEED_VERSION = 0` FOR ONE DAY, AND THE NOTE ON IT CLAIMED A PROTECTION
 * IT DID NOT HAVE (corrected 2026-08-17).** What that note said, and what is still true: writing
 * `version() + 1` makes the number a dev till holds *the number of times it has been switched on*,
 * which no publisher can know, so a real first snapshot at v1 is refused `stale` by a till booted
 * twice. What it got wrong is the cure. It said a literal `0` *"re-seeds a dev till forever"* and
 * *"keeps the restart case the old note describes closed"* — **both are true only when the device
 * holds `0`.** `staff.ts:231` refuses `update.version < held`, and **every device the previous
 * build ever ran holds `>= 1`**, because that build applied at `version() + 1`. So on those
 * devices a `0` snapshot was refused `stale` on every launch, permanently and silently:
 *
 *   - a changed `RESTOS_DEV_PIN_*` **never took effect again**;
 *   - a till whose last old-build boot was the **pre-August SHARED-PIN** build kept one credential
 *     across all three rows for ever, unrepairable by any configuration — the exact authorization
 *     hole the top of this file says was closed, with `02-F22`'s manager guard sitting one
 *     tile-tap from the digits both cashiers type all shift;
 *   - and the boot line said `staff: 3 seeded` throughout, because it read the environment.
 *
 * Measured on a real store before the fix: two old-build boots → `version 2`, three members; the
 * new build reported `false`, the configured PIN did not open the manager's row and the retired
 * shared PIN did.
 *
 * **The held version is what `staff.ts` calls the device's own self-heal** — *"a snapshot AT the
 * held version is not older; it is the authoritative full state of that version"* — so this
 * consumes no number a publisher will want and leaves `version()` exactly where it found it. Both
 * properties the acceptance suite pins survive: after N seeded boots a fresh till still holds the
 * version it held after one, and a real snapshot at v1 still applies.
 *
 * **What this does NOT repair, named rather than left to look designed:** a till that ran the old
 * build holds an INFLATED version of fiction (2, 5, 30 — its launch count), and a real publisher's
 * first snapshot at v1 is still refused `stale` on it. That is the old build's damage and no
 * version this seed writes can undo it; `01-F56`'s monotonicity is the device's protection and it
 * cannot tell a number written by fiction from one written by a publisher. The repair is a fresh
 * `device.db`, and the refusal is at least observable now — `staff.ts` returns it, `seedDevStaff`
 * consumes it, and the boot line reports what is on the DEVICE rather than what was asked for.
 */
const seedVersionFor = (registry: Pick<DevStaffRegistry, "version">): number => registry.version();

/**
 * Seed the roster, or report that it seeded nothing.
 *
 * @returns `false` when nothing was written — the environment named no PIN, this device already
 *          holds a roster it RECEIVED, or the registry refused the snapshot. `true` only if the
 *          seed's members are on the device (`00 §5.7`: the report may not outrun the write).
 *
 * ⚠ **THIS NOTE SAID `version() + 1`, NEVER A LITERAL, AND IT WAS RIGHT ABOUT THE FAILURE IT NAMED
 * AND WRONG ABOUT THE CURE (corrected 2026-08-17, R21/`01-F56`).** What it said, and what is still
 * true: both apps seed at every boot, `staff.ts` refuses a snapshot OLDER than the one it holds as
 * `stale`, so a hardcoded `version: 1` would leave a device that ran once with a roster and every
 * launch after **without** one — a pass nobody can sign in to, arriving on the second launch and on
 * no other (`01-F17`). What it got wrong is the CURE. `version() + 1` closes that failure by making
 * the version a dev till holds **the number of times it has been switched on** — a quantity no
 * publisher can know: a real first snapshot at v1 is then refused `stale` by a till booted twice, and
 * silently, because the refusal record was discarded. `01-F56` states monotonicity as the DEVICE's
 * protection against an out-of-order publisher; that inverted it into a protection against the
 * publisher being right.
 *
 * ⚠ **AND THEN THE CURE WAS A LITERAL `0` FOR ONE DAY, WHICH FIXED A FRESH DEVICE AND BROKE EVERY
 * UPGRADED ONE.** `seedVersionFor` carries the measurement and the reasoning; the short form is
 * that a device the previous build ever ran holds `>= 1`, so a `0` snapshot was refused `stale`
 * there on every launch, for ever, while this function returned `false` and nothing read it. The
 * seed writes at the **HELD** version now — `staff.ts`'s own self-heal, not a stale one — and both
 * hosts consume this return and hand it to `describeDevStaff`, so a refusal reaches the glass.
 */
export const seedDevStaff = async (options: {
  registry: DevStaffRegistry;
  branch_id: string;
  /**
   * The host's environment, **not a resolved PIN** — this package's own convention (every other
   * module here is a `resolveX` over an env record), and the reason the key spelling stays in one
   * place. Read through `DEV_STAFF_PIN_ENV`, one key per member, with **no fallback between
   * members**.
   */
  env?: Record<string, string | undefined>;
  // ⚠ THERE WAS A `pin?: string | undefined` HERE UNTIL 2026-08-14, carrying an `@unreached-owed`
  // marker. It was the superseded shared-credential path — one PIN hashed onto every member,
  // which is the authorization hole described at the top of this file — and it survived in the
  // signature for exactly one reason: `apps/pass-kds/src/main/__acceptance__/pass-identity.test.ts`
  // §A called `seedDevStaff({ …, pin })` and required all three members, the branch manager
  // included, to verify against that one value. That suite's test owner has now RETIRED those
  // calls (§A carries the reason and the FRs: `01-F28`'s per-user hashes, `02-F22`, `02-F38`), so
  // the marker's own delete condition is met and the option is gone with it. Verified
  // symbol-precise and comment-blind before deleting: nothing in `apps/`, `services/` or
  // `packages/` passes `pin` to this function.
  //
  // ⚠ `env` REMAINS OPTIONAL and it should not be. It was made optional only to sit beside `pin`
  // in the either/or above; with `pin` gone, `seedDevStaff({ registry, branch_id })` still
  // type-checks and silently seeds nobody. Tightening it to a required member is an
  // IMPLEMENTATION change and is REPORTED rather than taken here (`24 §3` — this session
  // adjudicates oracles and does not change implementation behaviour).
}): Promise<boolean> => {
  const { registry, branch_id, env } = options;

  // ── R21 / R28 / `01-F21` — FIXTURE DATA NEVER DISPLACES A ROSTER THAT CAME OFF THE WIRE ──
  //
  // `staff.ts`'s snapshot path is a FULL REPLACEMENT (`staff.ts:206-210`, `clearAll` at `:207` before the writes), so
  // an unconditional seed deletes a pilot's real people on the next launch — and R21 prices that
  // exactly: "attribution is permanent and unfixable under `01-F1`, so every day sold under the dev
  // roster is a day of ledger nobody can correct". Standing down is also the only correct answer to
  // the half-configured launch, which is not a smaller version of the same act but a snapshot of
  // ONE person replacing a roster of ten.
  //
  // Before the hashing, deliberately: three Argon2id derivations to produce a snapshot this device
  // will not accept is work done to reach a `return false`.
  if (receivedMembers(registry).length > 0) return false;

  // No fallback BETWEEN members: one configured value may never fill in for an unconfigured one,
  // which is the whole defect wearing a repair's clothes.
  const pinFor = (user_id: string): string | undefined => env?.[DEV_STAFF_PIN_ENV[user_id] ?? ""];

  const members: {
    user_id: string;
    display_name: string;
    pin_hash: string;
    assignments: { role: string; branch_id: string }[];
  }[] = [];
  for (const { user_id, display_name, role } of DEV_STAFF) {
    const configured = pinFor(user_id);
    if (configured === undefined || configured === "") continue;
    members.push({
      user_id,
      display_name,
      // `01-F28`'s credential, produced by the same `domain` function the cloud writer will use —
      // the PIN itself is hashed here and never stored, never logged, never appended (`01-F1`).
      // `hashPin` is SALTED, so the three hashes differ even under the superseded shared-PIN path;
      // distinctness of the STRINGS is therefore not the property that matters and never was.
      pin_hash: await hashPin(configured),
      // `01-F26` — the assignment is per LOCATION. Scoped to the device's own branch, so the row
      // authorizes where the device stands and nowhere else.
      assignments: [{ role, branch_id }],
    });
  }

  // Nobody configured ⇒ nothing is applied at all. Applying an EMPTY snapshot would be worse than
  // doing nothing: it clears the registry (`staff.ts`'s snapshot is a full replacement), so a
  // launch that forgot the variables would wipe a roster a real transport had delivered.
  //
  // ⚠ **THIS GUARD CLOSED ONE CASE AND ITS COMMENT DESCRIBED THE WHOLE CLASS** (corrected
  // 2026-08-17). The harm it names — wiping a delivered roster — was never limited to the launch
  // that forgot the variables; a launch that REMEMBERED them wiped the same roster, which is the
  // defect the guard above now closes. What is genuinely this guard's and not the other's: a
  // configured launch on a device holding only fixture people still gets a fresh snapshot, so an
  // operator who unsets a key loses that member and keeps the rest.
  if (members.length === 0) return false;

  // CONSUME the result (`00 §5.7`, and `apps/pos-electron/src/main/catalog.ts:247`'s
  // `return result.applied` — the half of `seedDevMenu` that copying only the guard leaves behind).
  // `staff.ts` REFUSES rather than throws (`01-F17`), so a discarded result is a seed that reports
  // success while the registry rejected every member of it.
  return registry.apply({ kind: "snapshot", version: seedVersionFor(registry), members }).applied;
};

/**
 * The boot line (`00 §5.7`), and this value has the property every `describeX` in this package
 * exists for: **a half-configured roster is invisible from the glass.** The grid renders the tiles
 * it has and looks entirely healthy; nothing on screen says a member is missing, and the cost is
 * only discovered when somebody needs the one who is not there. `02-F22` makes that specific:
 * without the branch manager the day cannot be opened, so no shift opens and no sale is recorded.
 *
 * ⚠ **IT TOOK AN ENVIRONMENT AND NO REGISTRY, WHICH MADE IT LIE THE MOMENT THE GUARD ABOVE LANDED**
 * (`registry` added 2026-08-17). The environment says what an operator ASKED for; the registry says
 * what is on the device, and after `seedDevStaff` stands down those are different facts. A pilot
 * till holding a real roster went on printing `staff: 3 seeded — Ayesha, Bilal, Hina` while none of
 * the three was on it, and — worse, because it is the loudest line on the output — a till whose
 * DELIVERED roster has a manager printed *"⚠ NO BRANCH MANAGER IS SEEDED … no shift can open and no
 * sale can be recorded"* whenever `RESTOS_DEV_PIN_HINA` happened to be unset. Both were decided from
 * `env`, so both were answers to a question nobody asked.
 *
 * ⚠ **AND THAT FIX CLOSED ONE STATE OUT OF FOUR (corrected 2026-08-17, same day).** It consulted the
 * registry through the RECEIVED-members test alone, so in every state where no received member is
 * present it fell straight back to the environment — including the states where the write had been
 * **REFUSED**. Two were measured on a real store: a publisher that delivers a roster and then lets
 * both staff go with a delta leaves `version 2, members 0`, and the line said `staff: 3 seeded …
 * One Argon2id credential each` over a device nobody at all can sign in to; and a till upgraded from
 * the previous build said the same while the seed's write was being refused `stale` on every launch.
 * The device path below therefore takes every roster MEMBERSHIP fact from the registry and every KEY fact
 * from the environment, which is the only split that cannot lie in either direction.
 *
 * @param env the host's environment — what an operator ASKED for. It is the whole of what the
 *        environment-only path can report, and that path's `02-F22` clause is a claim about the
 *        REQUEST rather than about any device, because it has no device to ask.
 * @param device the device's own roster, where it stands, and what the seed just reported.
 *        OPTIONAL because a caller that has not opened a store yet still has something true to say
 *        about its configuration; **both hosts pass it**.
 */
export const describeDevStaff = (
  env: Record<string, string | undefined>,
  device?: DevStaffDevice,
): string => {
  const configured = DEV_STAFF.filter(({ user_id }) => {
    const value = env[DEV_STAFF_PIN_ENV[user_id] ?? ""];
    return value !== undefined && value !== "";
  });

  if (device !== undefined) {
    const { registry, identity, seeded } = device;
    const roster = registry.list();
    const received = receivedMembers(registry);
    // The seed's OWN people, as the device actually holds them — not as the environment names
    // them. Those two diverge whenever a key was set on an earlier launch and is unset now, and
    // the rows written then are still on the grid and still open.
    const present = DEV_STAFF.filter(({ user_id }) =>
      roster.some((member) => member.user_id === user_id),
    );
    const absent = DEV_STAFF.filter((member) => !present.includes(member));
    // Read from the SEED's own return rather than re-derived from the registry. Re-deriving it
    // would be a second reading of "did the seed write", and two readings of one fact is how a
    // surface and the code it describes come to disagree (`03-F40`) — the same argument this file
    // makes for one roster declaration, one level down.
    const seedSaid = seeded
      ? "the dev seed reports that it WROTE its roster this boot"
      : "the dev seed wrote nothing this boot";
    const warning = canOpenTheDay(roster, identity)
      ? ""
      : " ⚠ NOBODY ON THIS DEVICE HOLDS DAY-OPEN AUTHORITY AT THIS BRANCH (02-F22, decided by " +
        "@restos/domain's can() and not by a role list copied into this file), so day open and " +
        "float entry cannot be executed on it — no shift can open and no sale can be recorded.";

    // ── NOBODY IS HERE. The state the environment path could never see, and the one where it lied
    // loudest: it read three configured keys and announced three seeded people over an empty
    // registry. Whether the write was never attempted or was REFUSED is the one thing the device
    // cannot tell you on its own, so the seed's own report is what separates them.
    if (roster.length === 0) {
      return (
        "staff: NOBODY IS ON THIS DEVICE — the identification grid is empty and nobody can sign " +
        `in, and ${seedSaid}. ` +
        (configured.length === 0
          ? `Set ${DEV_STAFF.map(({ user_id }) => DEV_STAFF_PIN_ENV[user_id]).join(", ")} ` +
            "(a DIFFERENT PIN each — one secret for the roster puts the manager's authority " +
            "behind the cashiers' digits, 01-F28/02-F22). "
          : `⚠ ${configured.length} of ${DEV_STAFF.length} WERE configured ` +
            `(${configured.map((m) => m.display_name).join(", ")}) and NONE of them is here, so ` +
            "the registry REFUSED the write — staff.ts refuses rather than throwing (01-F17), " +
            "and this line reports the DEVICE and not the request (00 §5.7). ") +
        "Nothing populates a real roster yet: 01-F47 admits devices, not people."
      );
    }

    // ── A ROSTER THAT CAME OFF THE WIRE. `01-F54`'s degradation on the names, not a blank:
    // `display_name` is optional on the wire record and a tile labelled by nothing is worse than
    // one labelled by an id.
    if (received.length > 0) {
      const names = received.map((m) => m.display_name ?? m.user_id).join(", ");
      const stoodDown =
        `${seedSaid}: fixture data never replaces a roster that came off the wire (R21 — ` +
        "attribution is permanent under 01-F1)";
      return (
        `staff: ${roster.length} on this device — ${received.length} from a roster it RECEIVED ` +
        `(${names})` +
        (present.length === 0
          ? // ⚠ THIS WAS THE ONLY ARM THAT EXISTED, and it reported the RECEIVED count as the
            // whole roster. Where a delta delivers real people ALONGSIDE seeded ones — which is
            // exactly what `01-F21`'s upsert path does, since a publisher can only remove ids it
            // has seen and it has never seen these three — it said "2 on this device" while five
            // were, and "the per-member dev PIN keys are ignored here" while a fixture
            // branch_manager still opened on the dev key. Measured on a real store before the fix.
            `. ${stoodDown}, so the per-member dev PIN keys are ignored here.`
          : ` and ${present.length} the DEV SEED wrote on an earlier boot ` +
            `(${present.map((m) => `${m.display_name} (${m.role})`).join(", ")}). ${stoodDown}, ` +
            "so no dev PIN key was read this boot. ⚠ THOSE SEEDED TILES ARE STILL ON THE GRID and " +
            "whatever dev PIN was configured when they were written still opens them, so a " +
            "fixture identity can sign in and 02-F41 writes it into a ledger 01-F1 forbids " +
            "correcting. NO FR decides whether a real roster REMOVES them — a publisher's delta " +
            "can only remove ids it has seen and it has never seen these — so nothing here " +
            "removes them either (commandment 2). Wipe device.db, or unset the keys.") +
        warning
      );
    }

    // ── THE SEED'S OWN PEOPLE AND NOBODY ELSE'S. Counted off the DEVICE, so a member written by
    // an earlier launch is reported as present even where his key is unset now — which is what is
    // true of the grid, and the opposite of what the environment would have said.
    return (
      `staff: ${present.length} of ${DEV_STAFF.length} on this device — ` +
      `${present.map((m) => `${m.display_name} (${m.role})`).join(", ")}. ${seedSaid}. One ` +
      "Argon2id credential each (01-F28), verified on-device with 01-F61's durable " +
      "per-(device,user) lockout." +
      (absent.length === 0
        ? ""
        : ` NOT ON THIS DEVICE: ${absent
            .map((m) => `${m.display_name} (${DEV_STAFF_PIN_ENV[m.user_id]})`)
            .join(", ")} — set the key and relaunch.`) +
      warning
    );
  }

  const missing = DEV_STAFF.filter((m) => !configured.includes(m));

  if (configured.length === 0) {
    return (
      "staff: NOBODY IS SEEDED — the identification grid is empty and nobody can sign in. " +
      `Set ${DEV_STAFF.map(({ user_id }) => DEV_STAFF_PIN_ENV[user_id]).join(", ")} ` +
      "(a DIFFERENT PIN each — one secret for the roster puts the manager's authority behind the " +
      "cashiers' digits, 01-F28/02-F22). Nothing populates a real roster yet: 01-F47 admits " +
      "devices, not people."
    );
  }
  const names = configured.map((m) => `${m.display_name} (${m.role})`).join(", ");
  if (missing.length === 0) {
    return `staff: ${configured.length} seeded — ${names}. One Argon2id credential each (01-F28), verified on-device with 01-F61's durable per-(device,user) lockout.`;
  }
  // Asked of the MATRIX, through `roleOpensTheDay`, so this file holds no role list of its own —
  // and asked of a ROLE rather than of a person, because this path has no device and therefore no
  // location to place anybody at. It is a claim about what was configured, and says so.
  const noManager = !configured.some((m) => roleOpensTheDay(m.role));
  return (
    `staff: ${configured.length} of ${DEV_STAFF.length} seeded — ${names}. ` +
    `NO PIN CONFIGURED for ${missing.map((m) => `${m.display_name} (${DEV_STAFF_PIN_ENV[m.user_id]})`).join(", ")}, ` +
    "so they are absent from the grid and cannot sign in." +
    (noManager
      ? " ⚠ NO BRANCH MANAGER IS SEEDED, so 02-F22's day open and float entry cannot be executed " +
        "on this device — no shift can open and no sale can be recorded."
      : "")
  );
};
