// Acceptance tests — Step 0 of the staff transport: THE DEV SEED MUST NEVER OUTRANK A REAL ROSTER.
//
// Authored from SPEC TEXT ONLY (`24 §3` step 2), by a session that did not write the
// implementation and will not. Read-only to the implementing session: these assertions may not be
// edited to make an implementation pass. `plans/saas-pivot/staff-over-the-wire.md`'s
// §"The build, sequenced" was deliberately NOT read — it names the files and line numbers an
// implementer will change, and an oracle that blesses one intended diff is not an oracle.
//
// ── THE FRs THESE ASSERTIONS ARE TRACEABLE TO, QUOTED ──
//
//   `01-F21`  Reference data is "versioned; distributed to devices as reference-data snapshots +
//             deltas over the same sync channel". `01-F61` puts the staff record on that same
//             chain in terms: the record "rides the same `01-F21` reference-data chain as the
//             rest of the roster".
//   `01-F61`  ⚠ CITATION CORRECTED 2026-08-17 — this clause hung on `01-F52`, and `01-F52` is the
//             CATALOG's FR. It opens "Catalog is REFERENCE DATA, not ledger" and its named
//             consequence is that "catalog is **org-scoped**, not branch-scoped"
//             (`specs/01-kernel-sync.md:107`) — while the staff roster is **branch**-scoped: R25,
//             and `01-F9`'s August amendment (`specs/01-kernel-sync.md:32`) says so in terms,
//             "the scope belongs to the ARTIFACT, not to the class … reading it as a property of
//             the class is what would have made a branch-scoped roster illegal by accident". So
//             the PROPERTY asserted below was right and the ID carrying it was wrong, which is
//             the citation half of commandment 2: an FR ID has to resolve to the thing it is
//             being made to say, not merely to resolve. The roster's own FR is `01-F61`, whose
//             `display_name` clause puts the record on the chain — the staff record "rides the
//             same `01-F21` reference-data chain as the rest of the roster" — and whose whole
//             subject is what may stand as a credential on a device. A seed compiled into the
//             device binary did not arrive on that chain, and nothing in the corpus gives
//             fixture data precedence over data that came off it.
//   `01-F56`  "Versions apply monotonically, and a delta whose base does not match is REFUSED …
//             An older snapshot or delta than the device already holds is ignored, never applied
//             backwards. Refusal is observable in device health." Monotonicity is a PROTECTION;
//             a seed that inflates the held version turns it into a weapon pointed at the real
//             publisher, whose first snapshot is then refused `stale` for a reason no publisher
//             can see or predict.
//   `01-F28`  Identity is "verified on-device against synced credential hashes" — so the roster is
//             a CREDENTIAL store, and what overwrites it decides who can sign in.
//   `01-F17`  A stopped till is the one unacceptable outcome. This is the anti-blocking half:
//             the fix must not become "the seed never seeds", which is a dev till nobody can
//             unlock.
//   `02-F22`  "day open/close and float entry require manager/owner permission — a cashier session
//             cannot execute them". `DEV_STAFF` contains a `branch_manager`, so a seed that ADDS
//             itself to a real roster hands that authority to whoever knows a dev environment
//             variable.
//   `00 §5.7` A surface reports what is true. A boot line that claims a roster it did not write,
//             or stays silent about a member nobody configured, is the state this package's
//             `describeX` convention exists to prevent.
//   R21       (`plans/saas-pivot/plan-of-record.md:40`) Pilot data is REAL business records —
//             "attribution is permanent and unfixable under `01-F1`, so every day sold under the
//             dev roster is a day of ledger nobody can correct". That is why this is a hard
//             blocker and not a dev-ergonomics nicety.
//   R28       (`:47`) "An OLD roster admits, with its age surfaced; a NEVER-RECEIVED roster
//             refuses, loudly, at boot." The line the corpus draws is RECEIVED vs NEVER-RECEIVED.
//             It is not drawn at any particular version number, and these tests are written so
//             that they do not draw it there either.
//
// ── WHAT THIS SUITE PINS: THE PROPERTIES, NOT THE SHAPE (stated, as the brief requires) ──
//
// `apps/pos-electron/src/main/catalog.ts`'s `seedDevMenu` is the same seed against the same kind
// of registry and it already refuses when `store.catalog.version() > 0` and applies at
// `version: 0`. That is a MECHANISM and it belongs to the implementer — with the ONE exception
// the corrected paragraph below states and measures: that particular mechanism is refused here,
// not as a style preference but because R28 rules against what it does to a roster received at
// v0. Nothing below asserts a guard expression, a literal version, a call count, or the presence
// of any particular branch. Every assertion is about an OBSERVABLE consequence:
//
//   P1  A roster the device already holds is still there, unchanged, after the seed runs — same
//       members, same credential hashes, same version, and no member the seed brought with it.
//       **At every version that roster may carry, v0 included.** R28 draws the line at RECEIVED
//       vs NEVER-RECEIVED and not at a number, so a property that held only above some version
//       would be a different property wearing this one's words.
//   P2  The version a real publisher must clear does not grow with the number of times the till
//       has booted. Concretely: after N seeded boots on a device that never met a real roster, a
//       real snapshot at v1 APPLIES, and is not refused `stale`.
//   P3  The zero-configuration guard that ships today stays: an unconfigured launch writes
//       nothing and empties nothing.
//   P4  The seed's own report is honest — if it says it seeded, its roster is on the device.
//   P5  The seed still works. A device that has never met a roster gets one and can sign in, and
//       still can after a restart.
//
// ⚠ THIS PARAGRAPH DECLARED THREE DISCRIMINATORS LEGAL AND IT WAS FALSE FOR ONE OF THEM.
// Corrected 2026-08-17, and the correction matters more than the edit. `version() > 0` — the
// shape `apps/pos-electron/src/main/catalog.ts:241-246` ships, and the one an implementer will
// reach for first because it is already in the tree — is **refused by R28**, and the old text
// said so itself ("closes the INSTANCE … and not the CLASS") while going on to bless it anyway.
// A roster delivered at **version 0** has been RECEIVED: `staff.ts:231` refuses a snapshot only
// when `update.version < held`, and a device nothing has written to holds `0` (`staff.ts`'s
// `?? 0`), so a v0 snapshot is legal, applies, and leaves `version()` at `0`. A `version()`-keyed
// guard cannot see that roster at all and replaces it with fixture people — which is the exact
// harm R21 prices ("every day sold under the dev roster is a day of ledger nobody can correct").
// **The old sentence's own escape clause is what made it survive**: "every fixture below
// publishes its real roster at v1, so all three pass" was a statement about the FIXTURE, not
// about the property, and it is why `deliverRealRoster`'s `version` parameter sat unused with no
// call site passing it. §A's version sweep is what closed the hole.
//
// So: `list().length > 0`, "the registry holds a member `DEV_STAFF` does not name", a provenance
// flag, a `received_at`, or anything else that separates a roster that came off the wire from one
// this file wrote — all legal, none preferred. **NOTHING BELOW NAMES A DISCRIMINATOR.** Only an
// implementation that replaces a RECEIVED roster with fixture data dies. Deliberately NOT decided
// by this suite, so the implementer is free (each is reported rather than pinned):
//
//   · which discriminator is used, subject to the one constraint above — which is R28's ruling
//     and not this suite's invention;
//   · what version the seed writes at, and whether it re-writes on a later boot;
//   · what happens when the environment's PINs CHANGE between two boots — a real behavioural fork
//     between the candidate shapes, unruled by any FR, and therefore not this suite's to settle;
//   · the return TYPE. `seedDevStaff` returns `Promise<boolean>` today and P4 is asserted as an
//     IMPLICATION over it (`true` ⇒ the seed's roster is on the device), never as an equality, so
//     a richer refusal record is free to land later without reddening anything here.
//
// ── OUT OF SCOPE, named so a clean run is not read as coverage ──
//
// `01-F61`'s `grid_ordinal` and its 05:00 business-day boundary (neither is modelled; both are
// this plan's later steps); the wire (`packages/sync-protocol` has no staff kind at all); any
// `staff_version` reconcile; `purge_command`; a `StaffHealth`/refusal surface; the Argon2id
// parameters and cost floor (`packages/domain`'s and `sync-client`'s suites own them); and
// whether either app's `main` calls the seed at all (`apps/pos-electron`'s
// `__acceptance__/dev-staff-credentials.test.ts` and `apps/pass-kds`'
// `__acceptance__/pass-identity-seam.test.ts` own that seam).
//
// ⚠ `01-F61`'s DURABLE LOCKOUT TABLE was in NEITHER list until 2026-08-17 — not asserted, and not
// named out of scope either, so a clean run read as coverage of an axis nobody had looked at.
// `plans/saas-pivot/staff-over-the-wire.md` trap 11 is about exactly this table. §D now owns the
// two halves of it the corpus RULES on: the counter survives a seeded boot (`01-F61` — "the
// counter PERSISTS across an app restart … a counter held in memory is defeated by relaunching
// the app", and the seed is precisely what runs on every relaunch), and it is keyed per
// (device, USER), so a lockout accrued under the seeded roster is charged to nobody on the roster
// that replaces it.
//
// What stays OUT — and it is out because NOTHING RULES ON IT, not because it is small
// (commandment 2): **the fate of an ORPHANED `pin_attempts` row.** `applySnapshot` clears the
// `staff` table only (`packages/sync-client/src/staff.ts:207`, `DELETE FROM staff`) while
// `pin_attempts` is an independent table keyed `(device_id, user_id)`
// (`packages/sync-client/src/pin-attempts.ts:58`), so `DEV_STAFF`'s three compile-time UUIDs
// (`dev-staff.ts:91-97`) persist as rows on a pilot till after a real roster lands. And
// `unlock()` reads the lockout at `pin-session.ts:166` **before** `registry.lookup` at `:179`, so
// a locked-out orphan is refused `locked_out` where a till that never heard of that person would
// refuse `unknown_user` — and an attempt against a `user_id` not on the device records no failure
// at all, which makes it unlimited and uncounted. Trap 11's own verdict on both is "Neither was
// chosen." No FR resolves either, so this suite asserts nothing about them in either direction
// rather than inventing a policy for the implementer to satisfy; both are reported as findings
// for the transport's owner.
//
// ── THE REGISTRY BELOW IS THE PRODUCTION ONE, NOT A HAND-COPY (failure pattern 2 / trap 7) ──
//
// `openStore(...).staff` is `createStaffRegistry` from `@restos/sync-client` over real SQLite.
// That is deliberate and is the whole reason this package takes a test-only devDependency on
// `sync-client`: the subject of this file is how the seed INTERACTS with `staff.ts` — its
// snapshot path clears before it writes, and its `stale` rule refuses a version below the one it
// holds. A fake registry here would be an oracle asserting a hand-copy of exactly the semantics
// under test, and if the copy were wrong in either direction the suite would bless a broken
// implementation or block a correct one.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPin, verifyPin } from "@restos/domain";
import {
  createPinSession,
  type DeviceStore,
  NO_ATTEMPTS,
  openStore,
  type PinSession,
  type StaffMember,
} from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { DEV_STAFF, DEV_STAFF_PIN_ENV, describeDevStaff, seedDevStaff } from "../dev-staff.js";

const ORG = "0199dddd-0000-7000-8000-000000000001";
const BRANCH = "0199dddd-0000-7000-8000-000000000002";
const DEVICE = "0199dddd-0000-7000-8000-000000000003";

/**
 * The real people. `01-F26`'s per-location assignment, `01-F28`'s per-user Argon2id credential,
 * `01-F61`'s `display_name` — the rows a landed transport will write, and NOT `DEV_STAFF`'s
 * fictional three. Two of them, fewer than `DEV_STAFF`'s three, so a guard phrased as
 * "the registry already holds at least as many people as I would seed" is not accidentally
 * satisfied.
 */
const REAL = [
  { user_id: "0199eeee-0000-7000-8000-0000000000a1", display_name: "Nadia", pin: "731904" },
  { user_id: "0199eeee-0000-7000-8000-0000000000a2", display_name: "Faisal", pin: "058216" },
] as const;

/**
 * The version a real publisher's FIRST snapshot carries. `staff.ts` starts a device at 0 and
 * `01-F56` refuses anything below what is held, so v1 is the first number a publisher can use
 * that is distinguishable from "this device has never been written to".
 */
const REAL_FIRST_VERSION = 1;

/**
 * The versions a real roster may arrive at, and **`0` is not a contrived value.**
 *
 * `staff.ts:231` refuses a snapshot only when `update.version < held`, and a device nothing has
 * written to holds `0` (`staff.ts`'s `?? 0` on the missing singleton row). So a publisher whose
 * first snapshot carries `0` is APPLIED — the members land, `writeState.run(0)` runs, and
 * `version()` reads `0` afterwards, indistinguishable by that number alone from a device no
 * roster has ever reached. R28 is what settles it: the line is drawn at RECEIVED vs
 * NEVER-RECEIVED, and a v0 roster has been received, so it may not be replaced by fixture data.
 *
 * `7` is the third point and it is unremarkable on purpose: without it, a reader could take this
 * sweep for a rule about the two numbers `0` and `1` rather than for the version-independence it
 * is actually asserting.
 */
const DELIVERED_VERSIONS = [0, REAL_FIRST_VERSION, 7] as const;

/** How many times a dev till is booted before it is handed a real roster. */
const SEEDED_BOOTS = 5;

/**
 * `01-F61`: "N consecutive failures tolerated; the (N+1)th attempt is refused." The value is the
 * fixture's, not a spec fact — §D asserts the KEYING and the PERSISTENCE of the counter, never a
 * particular ceiling (`packages/sync-client`'s own suites own the ceiling and the cooldown).
 */
const MAX_FAILED_ATTEMPTS = 3;

/** A PIN nobody in `REAL` or `DEV_STAFF` is configured with, so every submission of it fails. */
const WRONG_PIN = "000000";

const dirs: string[] = [];
const stores: DeviceStore[] = [];

const scratchDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "dev-staff-seed-"));
  dirs.push(dir);
  return dir;
};

/** A real device store on real SQLite. `dir` reused ⇒ the same device, restarted. */
const openDevice = (dir: string = scratchDir()): DeviceStore => {
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
  stores.push(store);
  return store;
};

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // Already closed by a test that was exercising a restart. Not a subject here.
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Every `00 §7` layer-3 key `DEV_STAFF_PIN_ENV` names, in `DEV_STAFF` order. */
const envKey = (user_id: string): string => {
  const key = DEV_STAFF_PIN_ENV[user_id];
  expect(key, `DEV_STAFF_PIN_ENV names no environment key for ${user_id}`).toBeDefined();
  return key as string;
};

/**
 * A fully configured dev launch: one DISTINCT PIN per member (`01-F28` — one credential per
 * person; a fixture that reused one value could not tell a per-member seed from the shared one
 * that was retired in August 2026).
 */
const fullEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  DEV_STAFF.forEach(({ user_id }, i) => {
    env[envKey(user_id)] = `55${31 + i}`;
  });
  return env;
};

/** A half-configured launch — everyone except `skip`. */
const envWithout = (skip: string): Record<string, string> => {
  const env = fullEnv();
  delete env[envKey(skip)];
  return env;
};

/** A half-configured launch — `only`, and nobody else. */
const envWithOnly = (only: string): Record<string, string> => {
  const env = fullEnv();
  for (const { user_id } of DEV_STAFF) if (user_id !== only) delete env[envKey(user_id)];
  return env;
};

/** Which `DEV_STAFF` members an environment actually configures a credential for. */
const configuredIn = (env: Record<string, string | undefined>): readonly string[] =>
  DEV_STAFF.filter(({ user_id }) => {
    const value = env[envKey(user_id)];
    return value !== undefined && value !== "";
  }).map(({ user_id }) => user_id);

/**
 * Put a REAL roster on the device, through the production registry, and assert the fixture
 * actually landed. A fixture that silently failed to apply would answer its own question — every
 * assertion downstream of it would pass against an empty registry for the wrong reason (trap 6).
 */
const deliverRealRoster = async (
  store: DeviceStore,
  version: number = REAL_FIRST_VERSION,
): Promise<StaffMember[]> => {
  const members: StaffMember[] = [];
  for (const [index, person] of REAL.entries()) {
    members.push({
      user_id: person.user_id,
      display_name: person.display_name,
      // `01-F61`'s explicit ordinal and `11-F22`'s participation status, added with step 7 of
      // `plans/saas-pivot/staff-over-the-wire.md`: the production registry now refuses a member
      // carrying neither. FIXTURE-ONLY — no assertion in this file reads either field, and the
      // `expect(result.applied)` below is what would have caught a fixture that stopped landing.
      grid_ordinal: index,
      status: "active",
      pin_hash: await hashPin(person.pin),
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
  }
  const result = store.staff.apply({ kind: "snapshot", version, members });
  expect(result.applied, `the fixture roster did not land: ${JSON.stringify(result)}`).toBe(true);
  expect(store.staff.version()).toBe(version);
  expect(store.staff.list()).toHaveLength(REAL.length);
  return members;
};

/**
 * P4, and it is an IMPLICATION on purpose. Whatever the seed returns, it may not claim to have
 * seeded while its roster is not on the device (`00 §5.7`). Combined with P1 this forces the
 * refusal case to report `false` WITHOUT this suite ever pinning that literal — so an implementer
 * who later widens the return to a refusal record is not blocked, and one who declines while
 * still reporting success is caught.
 *
 * ⚠ It asks only for the members the ENVIRONMENT configured, never for all of `DEV_STAFF`. A
 * half-configured launch that seeds two of three and reports `true` is reporting the truth — the
 * unconfigured member's absence is `dev-staff.ts`'s no-fallback rule working, not a lie — and an
 * oracle that demanded the whole roster here would be RED against a correct implementation for a
 * reason that has nothing to do with what it is testing.
 */
const reportMustBeHonest = (
  reported: boolean,
  store: DeviceStore,
  env: Record<string, string | undefined>,
): void => {
  if (!reported) return;
  const present = new Set(store.staff.list().map((m) => m.user_id));
  for (const user_id of configuredIn(env)) {
    expect(
      present.has(user_id),
      `seedDevStaff reported that it seeded, and ${user_id} is not on the device (00 §5.7)`,
    ).toBe(true);
  }
};

/** `01-F28` — a credential is only a credential if the person's own PIN opens it. */
const canSignIn = async (store: DeviceStore, user_id: string, pin: string): Promise<boolean> => {
  const row = store.staff.lookup(user_id);
  if (row === null) return false;
  // `11-F21` made `pin_hash` OPTIONAL on the roster entry (step 7): it rides an `active` entry
  // only. A member carrying none cannot sign in, which is this helper's own answer — and calling
  // `verifyPin(undefined, …)` would throw instead of returning it.
  if (row.pin_hash === undefined) return false;
  return verifyPin(row.pin_hash, pin);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — FIXTURE DATA NEVER OUTRANKS DATA THAT CAME OFF THE WIRE (R21, R28, `01-F21`, `01-F61`)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A R21 / 01-F61 — a seeded boot never displaces a roster the device already holds", () => {
  it("01-F17 / 01-F28 — CONTROL: a fully configured seed still writes into a device no roster has reached", async () => {
    // The anti-blocking control, and it is the first test on purpose. `01-F17`'s stopped till is
    // reachable from BOTH directions here: the defect is a seed that overwrites, and the tempting
    // over-correction is a seed that never writes — a dev till with an empty grid that nobody can
    // unlock. This test fails under that over-correction and passes under the shipped code, so a
    // red elsewhere in this file cannot be "fixed" by disabling the seed.
    const store = openDevice();
    const env = fullEnv();

    const reported = await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env });

    expect(reported, "a device with no roster and a full configuration seeded nothing").toBe(true);
    expect(store.staff.list()).toHaveLength(DEV_STAFF.length);
    for (const { user_id, display_name } of DEV_STAFF) {
      const pin = env[envKey(user_id)];
      expect(pin, `the fixture configured no PIN for ${display_name}`).toBeDefined();
      expect(await canSignIn(store, user_id, pin as string), `${display_name} cannot sign in`).toBe(
        true,
      );
      // `01-F26` — the assignment is per LOCATION, and it must be THIS branch or the row
      // authorizes nowhere the device stands.
      expect(store.staff.lookup(user_id)?.assignments.some((a) => a.branch_id === BRANCH)).toBe(
        true,
      );
    }
  });

  it("R21 / 01-F61 — a roster delivered over the wire survives a seeded boot, credentials intact", async () => {
    // THE DEFECT. `staff.ts`'s snapshot path is a full replacement — it clears before it writes —
    // so a seed that applies unconditionally deletes a pilot's real people on the next launch,
    // and R21 makes those rows real business records under a ledger `01-F1` forbids correcting.
    //
    // MUTANT THIS ASSERTION OWNS: the seed applying whenever its environment is configured. It is
    // what ships today, and it wipes Nadia and Faisal here.
    const store = openDevice();
    const delivered = await deliverRealRoster(store);
    const env = fullEnv();

    const reported = await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env });
    reportMustBeHonest(reported, store, env);

    expect(
      store.staff.list(),
      "the real roster changed size — it was replaced, reduced, or merged with the seed",
    ).toHaveLength(REAL.length);
    for (const person of REAL) {
      const row = store.staff.lookup(person.user_id);
      expect(
        row,
        `${person.display_name} was removed from the device by a dev seed`,
      ).not.toBeNull();
      // Byte-identical, not merely present: a seed that re-hashed or re-wrote the row would have
      // substituted a credential, which under `01-F28` is the same harm wearing a repair's
      // clothes.
      const original = delivered.find((m) => m.user_id === person.user_id);
      expect(
        row?.pin_hash,
        `${person.display_name}'s synced credential was substituted or removed (01-F28)`,
      ).toBe(original?.pin_hash);
      expect(row?.display_name).toBe(person.display_name);
      expect(
        await canSignIn(store, person.user_id, person.pin),
        `${person.display_name} can no longer unlock this till`,
      ).toBe(true);
    }
    // `01-F56` — monotonicity is the publisher's protection, so the seed may not move the number
    // the device holds either.
    expect(store.staff.version(), "a dev seed moved the version of a real roster").toBe(
      REAL_FIRST_VERSION,
    );
  });

  it("R28 / R21 — a roster that came off the wire survives a seeded boot AT EVERY VERSION IT MAY CARRY, v0 included", async () => {
    // THE AXIS THE TEST ABOVE DOES NOT VARY, AND IT IS THE AXIS THAT DECIDES THE IMPLEMENTATION.
    // Its neighbour delivers at v1 and so did every other fixture in this file, which left two
    // legal-looking implementations indistinguishable — and one of them is refused by the corpus.
    //
    // R28: "An OLD roster admits, with its age surfaced; a NEVER-RECEIVED roster refuses, loudly,
    // at boot." The line is RECEIVED vs NEVER-RECEIVED. A roster published at **version 0** has
    // been received: `staff.ts:231` refuses only `update.version < held`, `held` is `0` on a
    // device nothing has written to, so the snapshot APPLIES and leaves `version()` at `0` (see
    // `DELIVERED_VERSIONS`). An implementation that asks the registry for its VERSION cannot tell
    // that roster from an untouched device, and wipes Nadia and Faisal — under R21, a day of
    // ledger nobody can correct.
    //
    // MUTANT THIS ASSERTION OWNS: a `version() > 0` guard — the shape already shipping at
    // `apps/pos-electron/src/main/catalog.ts:241-246`, and therefore the one an implementer is
    // most likely to copy. It survives every other test in this file.
    //
    // ⚠ IT NAMES NO DISCRIMINATOR. `list().length`, a member `DEV_STAFF` does not name, a
    // provenance flag, a `received_at` — all pass this, as does anything else that separates a
    // roster off the wire from one this file wrote. Only wiping a received roster fails.
    for (const version of DELIVERED_VERSIONS) {
      const store = openDevice();
      const delivered = await deliverRealRoster(store, version);
      const env = fullEnv();

      const reported = await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env });
      reportMustBeHonest(reported, store, env);

      expect(
        store.staff.list(),
        `a roster RECEIVED at v${version} changed size after a seeded boot — it was replaced, reduced, or merged with the seed (R28)`,
      ).toHaveLength(REAL.length);
      for (const original of delivered) {
        const row = store.staff.lookup(original.user_id);
        expect(
          row,
          `${original.display_name ?? original.user_id} was removed from the device by a dev seed, on a roster RECEIVED at v${version} (R28: a v${version} roster has been received)`,
        ).not.toBeNull();
        expect(
          row?.pin_hash,
          `${original.display_name ?? original.user_id}'s synced credential was substituted on a roster received at v${version} (01-F28)`,
        ).toBe(original.pin_hash);
      }
      // The upsert-shaped second-order mutant, on this axis too: standing down is not the same
      // act as merging, and the version sweep must not let the merge back in through the side.
      const present = new Set(store.staff.list().map((m) => m.user_id));
      for (const { user_id, display_name, role } of DEV_STAFF) {
        expect(
          present.has(user_id),
          `${display_name} (${role}) — a seeded fixture person is on a till holding a roster received at v${version} (02-F22)`,
        ).toBe(false);
      }
      // `01-F56` — the number the real publisher holds is untouched, whatever it was.
      expect(
        store.staff.version(),
        `a dev seed moved the version of a real roster received at v${version}`,
      ).toBe(version);
      store.close();
    }
  });

  it("R21 / 02-F22 — the seed adds none of its fictional people to a real roster", async () => {
    // The second-order mutant, and it is the repair an implementer reaches for when told "stop
    // wiping the roster": switch the seed from a snapshot to an upsert, so the real people stay
    // AND the dev three arrive. `DEV_STAFF` contains a `branch_manager`, and `02-F22` puts day
    // open/close and float entry behind exactly that role — so a merge silently grants a pilot's
    // till manager authority to anyone holding a dev environment variable, and `02-F41` then
    // writes that person into the ledger.
    //
    // MUTANT THIS ASSERTION OWNS: a delta/upsert "fix" that preserves the real roster instead of
    // standing down. Its neighbour above stays GREEN under that mutant, which is why this is its
    // own test.
    const store = openDevice();
    await deliverRealRoster(store);

    await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env: fullEnv() });

    const present = new Set(store.staff.list().map((m) => m.user_id));
    for (const { user_id, display_name, role } of DEV_STAFF) {
      expect(
        present.has(user_id),
        `${display_name} (${role}) — a seeded fixture person is on a till holding a real roster`,
      ).toBe(false);
    }
  });

  it("R21 / 01-F28 — a HALF-configured seed stands down too, rather than half-replacing a real roster", async () => {
    // A partially configured launch is not a smaller version of the same act — under the shipped
    // code it is a snapshot of ONE or TWO people, which clears the real roster and replaces it
    // with a fragment. The `00 §5.7` boot line cannot save an operator here: it reports what the
    // ENVIRONMENT holds, and this device's problem is what the REGISTRY lost.
    //
    // MUTANT THIS ASSERTION OWNS: a guard that only fires when the seed would write a full
    // roster, or one keyed on how many members were configured rather than on what the device
    // already holds.
    //
    // ⚠ BOTH halves of "partial" are exercised, on their own devices, and the fixture is chosen so
    // that no assertion can pass by arithmetic coincidence: `envWithout` leaves TWO configured
    // members, which is exactly `REAL.length`, so a wiped registry would satisfy a bare length
    // check. `envWithOnly` leaves ONE, which does not — and the per-member and cross-roster
    // assertions below hold either way.
    const manager = DEV_STAFF.find((m) => m.role === "branch_manager");
    expect(
      manager,
      "DEV_STAFF names no branch_manager — 02-F22 has no seeded subject",
    ).toBeDefined();
    const managerId = (manager as (typeof DEV_STAFF)[number]).user_id;

    for (const env of [envWithout(managerId), envWithOnly(managerId)]) {
      const store = openDevice();
      const delivered = await deliverRealRoster(store);

      const reported = await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env });
      reportMustBeHonest(reported, store, env);

      expect(
        store.staff.list(),
        `${configuredIn(env).length} of ${DEV_STAFF.length} configured: the real roster changed size`,
      ).toHaveLength(REAL.length);
      for (const original of delivered) {
        expect(
          store.staff.lookup(original.user_id)?.pin_hash,
          `${original.display_name ?? original.user_id}'s synced credential did not survive a half-configured seed`,
        ).toBe(original.pin_hash);
      }
      const present = new Set(store.staff.list().map((m) => m.user_id));
      for (const user_id of configuredIn(env)) {
        expect(
          present.has(user_id),
          `a half-configured seed put ${user_id} on a till holding a real roster`,
        ).toBe(false);
      }
      expect(store.staff.version()).toBe(REAL_FIRST_VERSION);
      store.close();
    }
  });

  it("00 §5.7 / 01-F28 — the zero-configuration guard stays: an unconfigured launch writes nothing and empties nothing", async () => {
    // This guard SHIPS, and this test exists to stop the fix removing it. `dev-staff.ts` names
    // the harm in its own comment — "a launch that forgot the variables would wipe a roster a
    // real transport had delivered" — and an empty grid is the honest resting state of a device
    // no roster has reached (`00 §5.7`), which is what production looks like until the transport
    // lands.
    //
    // Both spellings of "not configured" are exercised: absent, and present-but-blank.
    const empty = openDevice();
    expect(await seedDevStaff({ registry: empty.staff, branch_id: BRANCH, env: {} })).toBe(false);
    expect(empty.staff.list()).toEqual([]);
    const blank = Object.fromEntries(Object.keys(fullEnv()).map((key) => [key, ""]));
    expect(await seedDevStaff({ registry: empty.staff, branch_id: BRANCH, env: blank })).toBe(
      false,
    );
    expect(empty.staff.list()).toEqual([]);

    // And on a device that HAS a roster, which is the case the shipped comment is about.
    const real = openDevice();
    const delivered = await deliverRealRoster(real);
    expect(await seedDevStaff({ registry: real.staff, branch_id: BRANCH, env: {} })).toBe(false);
    expect(real.staff.list()).toHaveLength(REAL.length);
    for (const original of delivered) {
      expect(
        real.staff.lookup(original.user_id)?.pin_hash,
        `${original.display_name ?? original.user_id}'s synced credential did not survive an unconfigured launch`,
      ).toBe(original.pin_hash);
    }
    expect(real.staff.version()).toBe(REAL_FIRST_VERSION);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE SEED MUST NOT OCCUPY A VERSION A REAL PUBLISHER WILL WANT (`01-F56`)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F56 — the bar a real publisher must clear does not depend on the boot count", () => {
  it("01-F56 / R21 — after five seeded boots, a real first snapshot at v1 APPLIES and is not refused stale", async () => {
    // THE SECOND DEFECT, and it is the one that will be diagnosed as a transport bug. A seed that
    // increments on every boot makes a dev till's held version *the number of times it has been
    // launched* — a quantity no publisher can know. The real v1 snapshot is then refused `stale`,
    // silently, because `staff.ts` returns a refusal record and the seed's only caller discards
    // it. `01-F56` states monotonicity as the device's protection against an out-of-order
    // publisher; this inverts it into a protection against the publisher being right.
    //
    // Asserted through the PRODUCTION `StaffApplyResult` from the production registry, so the
    // refusal vocabulary is `staff.ts`'s and not a hand-copy.
    //
    // MUTANT THIS ASSERTION OWNS: applying the seed at a version derived from the held one on
    // every boot.
    // ⚠ What the seed REPORTS on boots 2..N is deliberately not asserted. A seed that stands down
    // once it has written is as legal here as one that re-writes, and pinning either would settle
    // a mechanism this suite has no FR for. The FIRST boot is asserted, because a device that
    // never gets a roster at all is `01-F17`'s stopped till and the control in §A already owns it.
    const dir = scratchDir();
    for (let boot = 0; boot < SEEDED_BOOTS; boot++) {
      const booting = openDevice(dir);
      const reported = await seedDevStaff({
        registry: booting.staff,
        branch_id: BRANCH,
        env: fullEnv(),
      });
      if (boot === 0) {
        expect(reported, "the first boot of a fresh dev till seeded nobody").toBe(true);
      }
      booting.close();
    }

    const store = openDevice(dir);
    const members: StaffMember[] = [];
    for (const [index, person] of REAL.entries()) {
      members.push({
        user_id: person.user_id,
        display_name: person.display_name,
        // See `deliverRealRoster` — fixture-only, step 7 (`01-F61`, `11-F22`).
        grid_ordinal: index,
        status: "active",
        pin_hash: await hashPin(person.pin),
        assignments: [{ role: "cashier", branch_id: BRANCH }],
      });
    }
    const result = store.staff.apply({
      kind: "snapshot",
      version: REAL_FIRST_VERSION,
      members,
    });

    expect(
      result,
      `a real roster at v${REAL_FIRST_VERSION} was refused by a till that had booted ` +
        `${SEEDED_BOOTS} times: ${JSON.stringify(result)}`,
    ).toMatchObject({ applied: true, version: REAL_FIRST_VERSION });
    // Not just accepted — landed. `applied: true` against a registry that dropped the rows would
    // be the same mistake one layer down.
    expect(store.staff.list()).toHaveLength(REAL.length);
    for (const person of REAL) {
      expect(
        await canSignIn(store, person.user_id, person.pin),
        `${person.display_name} cannot sign in after the roster landed`,
      ).toBe(true);
    }
  });

  it("01-F56 — the version a device holds after five seeded boots is the version it holds after one", async () => {
    // The general form of the property above, stated without naming any version number, so that
    // it constrains the CONSEQUENCE and not the mechanism: whether the seed writes at 0, or writes
    // once at 1 and then stands down, both satisfy this. Only a seed that consumes a fresh version
    // per launch fails it.
    //
    // Two devices, identical except for how many times they have been switched on — which is
    // exactly the difference a publisher must not be able to observe.
    const onceDir = scratchDir();
    const once = openDevice(onceDir);
    await seedDevStaff({ registry: once.staff, branch_id: BRANCH, env: fullEnv() });
    const afterOne = once.staff.version();
    once.close();

    const manyDir = scratchDir();
    for (let boot = 0; boot < SEEDED_BOOTS; boot++) {
      const booting = openDevice(manyDir);
      await seedDevStaff({ registry: booting.staff, branch_id: BRANCH, env: fullEnv() });
      booting.close();
    }
    const many = openDevice(manyDir);

    expect(
      many.staff.version(),
      "the version a dev till holds is its boot count, so no publisher can know what to beat",
    ).toBe(afterOne);
  });

  it("01-F17 — a dev till that has never met a real roster can still sign in after a restart", async () => {
    // The other half of the anti-blocking control, on the axis the fix actually touches. Both
    // apps seed at every boot; a fix that made the second boot destructive, or that left the
    // second boot with an empty registry, is a pass screen and a till nobody can sign in to
    // arriving on launch two — the failure `dev-staff.ts`'s `version() + 1` note already
    // describes, reached from the other side.
    const dir = scratchDir();
    const env = fullEnv();
    const first = openDevice(dir);
    expect(await seedDevStaff({ registry: first.staff, branch_id: BRANCH, env })).toBe(true);
    first.close();

    const second = openDevice(dir);
    await seedDevStaff({ registry: second.staff, branch_id: BRANCH, env });

    expect(second.staff.list(), "the dev roster did not survive a restart").toHaveLength(
      DEV_STAFF.length,
    );
    for (const { user_id, display_name } of DEV_STAFF) {
      expect(
        await canSignIn(second, user_id, env[envKey(user_id)] as string),
        `${display_name} cannot sign in on the second launch`,
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE BOOT LINE SAYS WHAT IS TRUE ABOUT THE CONFIGURATION (`00 §5.7`)
//
// These pass against the shipped `describeDevStaff` and are here as regression cover, because
// Step 0 edits this module: a half-configured roster is invisible from the glass — the grid
// renders the tiles it has and looks entirely healthy — and the boot line is the only thing that
// says otherwise. What they do NOT cover is named in this file's findings: `describeDevStaff`
// takes an environment and no registry, so no assertion here can reach whether the line is honest
// about a seed that STOOD DOWN. That is a signature change and therefore the implementer's.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Which `00 §7` layer-3 keys the boot line names — i.e. which ones it is telling the operator to
 * go and set. Matched with a lookahead because `RESTOS_DEV_PIN` is a PREFIX of
 * `RESTOS_DEV_PIN_BILAL`, and a plain `includes` would report the first cashier's key as named
 * every time either of the others was.
 */
const keysNamedIn = (line: string): Set<string> =>
  new Set(
    DEV_STAFF.map(({ user_id }) => envKey(user_id)).filter((key) =>
      new RegExp(`${key}(?![A-Z_])`).test(line),
    ),
  );

/**
 * Does the line state the CONSEQUENCE of a launch that configured nobody — that the grid is
 * empty and nobody can sign in?
 *
 * **The property, not the prose.** A suite pinning the shipped sentence verbatim blocks a
 * legitimate rewording, which is `oracle-round-2-findings.md` §C's failure pattern 3; so the
 * alternatives below are spellings of one fact and any of them satisfies it. They are also
 * chosen so that the *fully configured* line — three people seeded, the grid full — matches
 * none of them, which is what makes the assertion attributable to the empty state rather than
 * to something every boot line happens to say. That control is its own test.
 *
 * Why the clause is worth an assertion at all: it is R28's second half in terms — "a device that
 * has never received a roster has nobody who can sign in, which is a **stopped till**, and
 * `00 §5.7` requires that to be loud at boot rather than discovered at 07:00 by a cashier who
 * cannot open the day."
 */
const EMPTY_GRID_SPELLINGS = [
  /nobody\s+is\s+seeded/i,
  /nobody\s+can\s+sign\s+in/i,
  /no\s?one\s+can\s+sign\s+in/i,
  /(?:identification\s+)?grid\s+is\s+empty/i,
  /empty\s+(?:identification\s+)?grid/i,
  /no\s+(?:staff|members?|people)\s+(?:are|is)\s+seeded/i,
];

const saysTheGridIsEmpty = (line: string): boolean =>
  EMPTY_GRID_SPELLINGS.some((spelling) => spelling.test(line));

describe("§C 00 §5.7 — the boot line names exactly the configuration that is missing", () => {
  it("00 §5.7 — a fully configured launch names no environment key, and every member", () => {
    const line = describeDevStaff(fullEnv());
    expect(
      keysNamedIn(line),
      "a boot line told the operator to set a key that is already set",
    ).toEqual(new Set());
    for (const { display_name } of DEV_STAFF) expect(line).toContain(display_name);
  });

  it("00 §5.7 / R28 — an unconfigured launch names every key, and says the grid is empty", () => {
    // ⚠ THE SECOND HALF OF THIS TITLE WAS ASSERTED BY NOTHING until 2026-08-17: the body checked
    // only which keys were named, so `dev-staff.ts:232`'s "NOBODY IS SEEDED — the identification
    // grid is empty and nobody can sign in" was DELETABLE with this test green. A title that
    // claims an assertion its body does not make is worse than a missing test, because it is
    // counted as coverage by everyone who reads the run.
    //
    // Step 0 is the change that edits this module, so this is exactly where the regression cover
    // belongs. The clause is R28's second half stated on the glass — a device that has never
    // received a roster has nobody who can sign in, which is a stopped till, and `00 §5.7`
    // requires that to be LOUD at boot. An operator who reads only "set these three variables"
    // learns what to do and not what is currently true.
    const line = describeDevStaff({});
    expect(keysNamedIn(line)).toEqual(new Set(DEV_STAFF.map(({ user_id }) => envKey(user_id))));
    expect(
      saysTheGridIsEmpty(line),
      `00 §5.7 / R28 — the unconfigured boot line does not say that the grid is empty and nobody can sign in, so a till nobody can unlock boots quietly: ${line}`,
    ).toBe(true);
  });

  it("00 §5.7 — a fully configured launch does NOT claim an empty grid (the control for the assertion above)", () => {
    // A one-branch control, per the round-3 law: without it, a `describeDevStaff` that returned
    // the empty-grid sentence unconditionally would satisfy the assertion above, and the kill
    // would prove nothing about attribution. `00 §5.7` cuts both ways — a surface reports what is
    // TRUE, and claiming an empty grid on a till with three people on it is the same defect
    // pointing the other way.
    expect(
      saysTheGridIsEmpty(describeDevStaff(fullEnv())),
      "a boot line told the operator that nobody can sign in on a device where three people are seeded",
    ).toBe(false);
  });

  it("00 §5.7 / 02-F22 — a launch missing the branch manager names her, her key, and the guard it disables", () => {
    // The half-configured case the `describeX` convention exists for. Without the manager,
    // `02-F22`'s day open and float entry cannot be executed on this device — so no shift opens
    // and no sale is recorded — and NOTHING on the screen says so.
    const manager = DEV_STAFF.find((m) => m.role === "branch_manager");
    expect(manager, "DEV_STAFF names no branch_manager").toBeDefined();
    const missing = manager as (typeof DEV_STAFF)[number];

    const line = describeDevStaff(envWithout(missing.user_id));

    expect(keysNamedIn(line)).toEqual(new Set([envKey(missing.user_id)]));
    expect(line).toContain(missing.display_name);
    expect(
      line,
      "the boot line does not say which guard an unseeded branch manager disables (02-F22)",
    ).toContain("02-F22");
  });

  it("00 §5.7 — a launch missing only a cashier names that cashier's key and raises no manager warning", () => {
    // The control for the assertion above: it must be attributable to the MANAGER being absent,
    // not to any member being absent.
    const cashier = DEV_STAFF.find((m) => m.role !== "branch_manager");
    expect(cashier, "DEV_STAFF names no non-manager").toBeDefined();
    const missing = cashier as (typeof DEV_STAFF)[number];

    const line = describeDevStaff(envWithout(missing.user_id));

    expect(keysNamedIn(line)).toEqual(new Set([envKey(missing.user_id)]));
    expect(line).toContain(missing.display_name);
    expect(line).not.toContain("02-F22");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE DURABLE LOCKOUT ACROSS A ROSTER REPLACEMENT (`01-F61`)
//
// `plans/saas-pivot/staff-over-the-wire.md` trap 11: `pin_attempts` is an independent table
// (`pin-attempts.ts:58`) that `applySnapshot` never touches (`staff.ts:207`, `DELETE FROM staff`),
// and until 2026-08-17 nothing in this suite asserted anything about it and nothing named it out
// of scope — so a clean run read as coverage of an axis nobody had looked at.
//
// ⚠ **Only what the corpus RULES is asserted here** (commandment 2). `01-F61` rules two things
// that a seeded boot can break, and both are below. It rules NOTHING about an ORPHANED row — trap
// 11's own verdict on the orphan and on the uncounted attempt against an unknown `user_id` is
// "Neither was chosen" — so neither is asserted in either direction; both are in the out-of-scope
// note at the top of this file and are reported as findings.
//
// The session below is the PRODUCTION `createPinSession` over the production `store.pinAttempts`,
// for the same reason §A uses the production registry: a hand-rolled counter here would be an
// oracle asserting a hand-copy of the semantics under test.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A signed-out session on this device, with `01-F61`'s **durable** counter supplied.
 *
 * `attempts: store.pinAttempts` is not decoration: omitting it silently downgrades the counter to
 * a process-lifetime one (`pin-session.ts` says so at the option), and a fixture that forgot it
 * would assert persistence against a counter that never persisted — the suite answering its own
 * question. The clock is fixed so a cooldown can never be what explains a result (`24-F12`: a
 * duration assertion is a timing test).
 */
const openSession = (store: DeviceStore): PinSession =>
  createPinSession({
    registry: store.staff,
    device: { device_id: DEVICE, registered: true },
    idle_lock_ms: 60_000,
    max_failed_attempts: MAX_FAILED_ATTEMPTS,
    now: () => 1_700_000_000_000,
    audit: () => {},
    attempts: store.pinAttempts,
  });

describe("§D 01-F61 — the durable lockout survives a seeded boot and is keyed where the FR puts it", () => {
  it("00 §5.4 / 01-F61 — a real member's PIN is still RATE-LIMITED after a seeded boot, and her counter is still hers", async () => {
    // THE SECURITY CONSEQUENCE OF THE WIPE, and it is a different consequence from §A's.
    //
    // `01-F61` keys the counter per (device, user) and `unlock()` reads it at
    // `pin-session.ts:166` **before** `registry.lookup` at `:179` — so a `user_id` that is not on
    // the device is refused `unknown_user` and **records no failure**. That is defensible while
    // the id is a stranger's. It is not defensible for a cashier who WAS on this device: a seeded
    // boot that removes her from the registry converts her `user_id` from a rate-limited subject
    // into an unlimited, uncounted guessing target, and `00 §5.4` requires lockout on repeated
    // failure. A 4-digit PIN is ~13 bits (`01-F61` prices it as a "convenience credential"); what
    // makes that safe enough is the ceiling, and this removes the ceiling silently.
    //
    // No `sync-client` suite can see it, because none of them runs a seed; and §A's tests cannot
    // see it either, because they end at the roster and this begins after it.
    //
    // MUTANT THIS ASSERTION OWNS: the seed applying whenever its environment is configured — what
    // ships today. It is refused `unknown_user` at the marked line below, and the counter never
    // reaches the ceiling.
    //
    // Failures are staged BELOW the ceiling first, so the persistence check measures the COUNTER
    // and never a result a cooldown could also explain (`24-F12`: never assert on elapsed time).
    const store = openDevice();
    await deliverRealRoster(store);
    const target = REAL[0];
    const session = openSession(store);

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt++) {
      expect(
        await session.unlock(target.user_id, WRONG_PIN),
        `the fixture's failed unlock #${attempt + 1} was not refused for the reason it was staged`,
      ).toMatchObject({ ok: false, reason: "bad_pin" });
    }
    const before = store.pinAttempts.read(DEVICE, target.user_id);
    expect(
      before.failures,
      "the fixture recorded no failures, so everything below would pass against a counter that never moved (trap 6)",
    ).toBe(MAX_FAILED_ATTEMPTS - 1);

    await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env: fullEnv() });

    // `01-F61`: "The counter PERSISTS across an app restart. A counter held in memory is defeated
    // by relaunching the app, which makes the lockout theatre." `seedDevStaff` is what runs on
    // every relaunch, on both hosts, so anything it did to this table would be done on precisely
    // the schedule that clause refuses.
    expect(
      store.pinAttempts.read(DEVICE, target.user_id).failures,
      `01-F61: ${target.display_name}'s consecutive-failure count did not survive a seeded boot, and the seed runs on EVERY launch — the "defeated by relaunching the app" defeat the FR's persistence clause names`,
    ).toBe(before.failures);

    // ⚠ THE LINE THE SHIPPED SEED FAILS: `bad_pin`, not `unknown_user`. `unknown_user` here means
    // she is no longer on this device — the wipe — and it is the refusal that costs nothing.
    const after = openSession(store);
    expect(
      await after.unlock(target.user_id, WRONG_PIN),
      `${target.display_name} is not a known user on this till after a seeded boot, so guessing her PIN is unlimited and uncounted (00 §5.4, 01-F61)`,
    ).toMatchObject({ ok: false, reason: "bad_pin" });
    expect(
      store.pinAttempts.read(DEVICE, target.user_id).failures,
      `${target.display_name}'s failed attempt after a seeded boot was not counted against her`,
    ).toBe(MAX_FAILED_ATTEMPTS);
    expect(
      await after.unlock(target.user_id, WRONG_PIN),
      `${target.display_name} is not locked out after ${MAX_FAILED_ATTEMPTS} consecutive failures spanning a seeded boot — 00 §5.4 requires lockout on repeated failure and a seeded boot removed the ceiling`,
    ).toMatchObject({ ok: false, reason: "locked_out" });
  });

  it("01-F61 / R21 — a lockout accrued under the SEEDED roster is charged to nobody on the real roster that replaces it (trap 11)", async () => {
    // `01-F61`: "Scope is per (device, user) … Per-user is forced by `01-F17`/`00 §5.1`: `01-F26`
    // calls these **shared** devices, so a device-wide counter is a scheduled stopped till, one
    // wrong PIN away from locking a queue of customers out of the only terminal."
    //
    // The cutover in trap 11's own words — "charging a lockout to the wrong person during the
    // cutover". A dev till is seeded, a fixture person exhausts the attempts on it, and then the
    // real roster lands. Under R21 those are real people about to sell a real day; a till that
    // refuses them because a fictional cashier mistyped is the stopped till `01-F17` forbids, and
    // no operator could ever attribute it, because the person it is blamed on does not exist.
    //
    // MUTANT THIS ASSERTION OWNS: a device-wide (rather than per-user) counter — the shape
    // `01-F61` refuses by name. It kills nothing else in this file.
    const store = openDevice();
    const env = fullEnv();
    expect(
      await seedDevStaff({ registry: store.staff, branch_id: BRANCH, env }),
      "the fresh dev till seeded nobody, so there is no seeded member to accrue a lockout",
    ).toBe(true);

    const seeded = DEV_STAFF[0];
    const before = openSession(store);
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      expect(
        await before.unlock(seeded.user_id, WRONG_PIN),
        `the fixture's failed unlock #${attempt + 1} against ${seeded.display_name} was not refused for the reason it was staged`,
      ).toMatchObject({ ok: false, reason: "bad_pin" });
    }
    // The lockout is REAL before the cutover, or the cutover proves nothing (trap 6). This
    // submission costs no Argon2id work — a lockout short-circuits ahead of the verify.
    expect(
      await before.unlock(seeded.user_id, WRONG_PIN),
      `${seeded.display_name} is not locked out after ${MAX_FAILED_ATTEMPTS} failures, so this test's premise never held`,
    ).toMatchObject({ ok: false, reason: "locked_out" });

    // THE CUTOVER: the real roster arrives and replaces the seeded one.
    await deliverRealRoster(store);

    const after = openSession(store);
    for (const person of REAL) {
      expect(
        store.pinAttempts.read(DEVICE, person.user_id),
        `01-F61 keys the counter per (device, USER): ${person.display_name} carries failures she never made`,
      ).toEqual(NO_ATTEMPTS);
      expect(
        await after.unlock(person.user_id, person.pin),
        `${person.display_name} cannot unlock a till on which a SEEDED fixture person exhausted the attempts — 01-F61 refuses a device-wide counter precisely because it is a scheduled stopped till (01-F17)`,
      ).toMatchObject({ ok: true, user_id: person.user_id });
    }
  });
});
