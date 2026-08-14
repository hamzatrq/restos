import { hashPin } from "@restos/domain";

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
  }): unknown;
};

/**
 * Seed the roster, or report that it seeded nothing.
 *
 * @returns `false` when the environment named no PIN — nothing was written and the grid is empty.
 *
 * ⚠ **`version() + 1`, never a literal, and this is the restart case rather than a style point.**
 * Both apps seed at every boot. `staff.ts` refuses a snapshot at a version it already holds as
 * `stale`, so a hardcoded `version: 1` leaves a device that ran once with a roster and every time
 * after **without** one — a pass nobody can sign in to, arriving on the second launch and on no
 * other (`01-F17`).
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
  if (members.length === 0) return false;

  registry.apply({ kind: "snapshot", version: registry.version() + 1, members });
  return true;
};

/**
 * The boot line (`00 §5.7`), and this value has the property every `describeX` in this package
 * exists for: **a half-configured roster is invisible from the glass.** The grid renders the tiles
 * it has and looks entirely healthy; nothing on screen says a member is missing, and the cost is
 * only discovered when somebody needs the one who is not there. `02-F22` makes that specific:
 * without the branch manager the day cannot be opened, so no shift opens and no sale is recorded.
 */
export const describeDevStaff = (env: Record<string, string | undefined>): string => {
  const configured = DEV_STAFF.filter(({ user_id }) => {
    const value = env[DEV_STAFF_PIN_ENV[user_id] ?? ""];
    return value !== undefined && value !== "";
  });
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
  const noManager = !configured.some((m) => m.role === "branch_manager");
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
