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
 * It comes from `RESTOS_DEV_PIN`, the same environment-configured route `RESTOS_CLOUD_URL` and
 * `RESTOS_DEVICE_TOKEN` already take and for the same "admission has not landed" reason. A
 * hardcoded PIN here would be the device-wide constant `01-F61` refuses, wearing a different name.
 * **Unset (or empty) ⇒ nothing is seeded**, and an empty grid is the honest state of a device no
 * roster has reached (`00 §5.7`) — which is also what production looks like until the transport
 * lands. The surface says so rather than drawing an empty box (`03-F53`: *"a device whose registry
 * is empty says so"*).
 *
 *     RESTOS_DEV_PIN=<digits> pnpm start
 *
 * Every seeded member shares that one PIN, which is not a shortcut: `01-F61` names two staff
 * sharing a 4-digit PIN as the ordinary case a bare pad cannot tell apart, so the seed puts both
 * devices in exactly that state and the identification step is what resolves it.
 *
 * **Delete this the moment the staff transport lands**, and let the roster sync.
 */

/** The environment variable, NAMED here so no consumer spells it a second time. */
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
  pin: string | undefined;
}): Promise<boolean> => {
  const { registry, branch_id, pin } = options;
  if (pin === undefined || pin === "") return false;
  // `01-F28`'s credential, produced by the same `domain` function the cloud writer will use — the
  // PIN itself is hashed here and never stored, never logged, never appended (`01-F1`).
  const pin_hash = await hashPin(pin);
  registry.apply({
    kind: "snapshot",
    version: registry.version() + 1,
    members: DEV_STAFF.map(({ user_id, display_name, role }) => ({
      user_id,
      display_name,
      pin_hash,
      // `01-F26` — the assignment is per LOCATION. Scoped to the device's own branch, so the row
      // authorizes where the device stands and nowhere else.
      assignments: [{ role, branch_id }],
    })),
  });
  return true;
};
