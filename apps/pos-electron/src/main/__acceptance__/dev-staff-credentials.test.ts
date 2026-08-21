// ACCEPTANCE TESTS — a PIN identifies a PERSON: `01-F26`, `01-F27`, `01-F28`, `02-F38`, `02-F41`.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author of this file wrote no production
// code for these FRs and is disqualified from implementing them. Every claim below traces to a
// quoted FR; where a reading had to be chosen, the choice is named as a choice and the simpler
// alternative is stated (`24 §3b`). Committed RED.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS FILE IS POINTED AT, stated as a fact about the tree rather than a worry.
//
// `packages/device-config/src/dev-staff.ts` hashes ONE `RESTOS_DEV_PIN` and writes the RESULTING
// STRING onto every seeded member:
//
//     const pin_hash = await hashPin(pin);
//     members: DEV_STAFF.map(({ user_id, display_name, role }) => ({ user_id, ..., pin_hash, ... }))
//
// `DEV_STAFF` is two cashiers and one **branch manager**. So the manager's row is opened by the
// digits both cashiers already type twenty to sixty times a shift, and every permission gate in
// the product is one tile-tap away:
//
//   - `02-F22`'s role guard ("a cashier session cannot execute them") is defeated by tapping the
//     manager tile on the identification grid `01-F61` put there.
//   - `02-F38`'s refusal is keyed on `user_id` — "a requester never sees an approve control for
//     their own request … refused server-side" — and a refusal keyed on an identifier that one
//     secret opens twice refuses nothing. The requester approves herself as the manager.
//   - `02-F41` ("attribution is whoever's PIN is in") then writes the WRONG PERSON into a ledger
//     `01-F1` forbids correcting in place, permanently.
//
// `01-F61` already names this harm in terms — "two staff sharing a 4-digit PIN become
// indistinguishable, which under `02-F41` … writes the wrong cashier into an append-only ledger
// `01-F1` forbids correcting in place" — and resolves the *bare-pad* version of it with the
// identification step. The identification step cannot resolve THIS one: it records which tile was
// tapped, which is a CLAIM, and `01-F28`'s "synced credential hashes" is what is supposed to turn
// a claim into an authentication. One hash for three people means it never does.
//
// `dev-staff.ts` calls the sharing deliberate ("Every seeded member shares that one PIN, which is
// not a shortcut"), citing `01-F61`. That reading is CONTESTED here, and the contest is the whole
// content of this suite: `01-F61` names shared PINs as a hazard it tolerates when two *humans*
// happen to choose the same digits, not as a property a seed may manufacture across a role
// boundary. Nothing in `01-F26`/`01-F27`/`01-F28` admits one credential standing for three users,
// and `02-F38` is unenforceable if one does.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FRs THIS FILE IS WRITTEN FROM, quoted because the reasoning is the contract:
//
//   01-F26  "User × Role × per-location assignment; permission overrides per user; PIN (Argon2id)
//           unlock on shared devices; idle auto-lock (device-layer setting)."
//   01-F27  "device tokens carry device identity only — **user identity comes from the PIN
//           session**; both are validated server-side."
//   01-F28  "Offline auth: PIN verification works on-device against synced credential **hashes**;
//           role changes propagate as reference data."
//   01-F61  "**The unlock surface IDENTIFIES THE USER FIRST, then takes the PIN** … two staff
//           sharing a 4-digit PIN become **indistinguishable**, which under `02-F41` … writes the
//           wrong cashier into an append-only ledger `01-F1` forbids correcting in place."
//   02-F22  "**Role guard:** day open/close and float entry require manager/owner permission … a
//           cashier session cannot execute them."
//   02-F38  "A requester never sees an approve control for their own request … refused
//           server-side by the `domain` permission matrix."
//   02-F41  "Attribution is whoever's PIN is in, with no 'acting for' concept."
//   00 §7   layer 3 (branch/device) is where a per-device configured value lives.
//   DEC-ARCH-001  extract at the second consumer rather than copy — which is why the per-member
//           environment keys are NAMED BY THE PACKAGE and not spelled twice, once in each host.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRACT THESE TESTS DEFINE (two amendments to `@restos/device-config`; the implementer
// builds to this, and each element is forced by a named FR):
//
//   export const DEV_STAFF_PIN_ENV: Readonly<Record<string, string>>
//
//     user_id → the `00 §7` layer-3 environment key that carries THAT member's PIN. One key per
//     member of `DEV_STAFF`, pairwise distinct. Declared in the package because BOTH hosts read
//     it (`apps/pos-electron` and `apps/pass-kds`) and `DEC-ARCH-001` refuses the second copy:
//     two spellings of one variable is a till and a pass screen that disagree about who can sign
//     in, which is the same failure the roster's own extraction was done to prevent.
//
//   seedDevStaff(options: {
//     registry: DevStaffRegistry;
//     branch_id: string;
//     env: Record<string, string | undefined>;   ← REPLACES `pin: string | undefined`
//   }): Promise<...>
//
//     `env` rather than a resolved `pin`, because that is this package's own stated convention —
//     "Each module is a `resolveX` that reads an environment string and a `describeX` that says
//     at boot which source was used" (`index.ts`, `device-identity.ts`, `aging.ts`,
//     `panel-density.ts`, `quick-tags.ts`, `serve-signal.ts`). The return value is deliberately
//     NOT pinned: nothing asserts on it below, because neither host reads it today.
//
//     THE NAMED ALTERNATIVE, so it can be contested BEFORE it is built rather than after: a
//     `pins: Record<string, string>` map resolved by each host. It satisfies every behavioural
//     property in §A/§B identically and costs §C/§D — which is the whole of what contesting it
//     costs. It is not preferred here only because it puts the environment-key spelling back into
//     two apps, which is the copy `DEC-ARCH-001` rules against.
//
//   What is NOT pinned, deliberately: whether `DEV_PIN_ENV`/`RESTOS_DEV_PIN` survives as one
//   member's key or is retired. §C asserts the PROPERTY that matters (no single configured value
//   becomes the credential of more than one member) and is silent on the name, so either choice
//   passes. Retiring it leaves `apps/pass-kds`'s boot line telling an operator to set a variable
//   that no longer seeds anyone — reported as a finding, not asserted here, because a boot-line
//   string is `00 §5.7`'s business and not this FR's.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY A REAL STORE, A REAL REGISTRY AND A REAL `verifyPin` — and why the sweep has a CONTROL.
//
// `hashPin` is SALTED, so an implementation that called it three times with the SAME PIN would
// produce three DIFFERENT hash strings while leaving the defect completely intact. A suite that
// asserted `pin_hash` distinctness would therefore be green against the exact bug it was written
// for. Every assertion below is behavioural — it asks `createPinSession` whether a PIN opens a
// row — and §A2 is a CONTROL over a hand-built shared-credential registry proving the sweep
// DETECTS cross-authentication when it is present. A sweep nobody demonstrated is the guard that
// "was never pointed at the dangerous case".

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as deviceConfigNs from "@restos/device-config";
import { DEV_STAFF } from "@restos/device-config";
import { hashPin } from "@restos/domain";
import { createPinSession, type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeWrites, PAID_OUT_APPROVAL_THRESHOLD_PAISA } from "../authorize";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-counter-1" } as const;

/** Distinct digits per member, which is the entire point. Indexed by `user_id`. */
const PINS: Record<string, string> = {};
for (const [index, member] of DEV_STAFF.entries()) PINS[member.user_id] = `${1111 * (index + 1)}`;

const CASHIERS = DEV_STAFF.filter((m) => m.role === "cashier");
const MANAGER = DEV_STAFF.find((m) => m.role === "branch_manager");

// ── Resolvers: every missing export fails ONE test loudly, by name ───────────────────────────
//
// The namespace cast is the `pin-session.test.ts` / `permission-matrix.test.ts` idiom: this file
// TYPECHECKS against the CURRENT tree, so a contract that has not landed is a named per-test
// failure rather than a module-load crash that reds `pnpm typecheck` repo-wide.

type SeedOptions = {
  registry: DeviceStore["staff"];
  branch_id: string;
  env: Record<string, string | undefined>;
};

const maybeDeviceConfig = deviceConfigNs as unknown as {
  DEV_STAFF_PIN_ENV?: Readonly<Record<string, string>>;
  seedDevStaff?: (options: SeedOptions) => Promise<unknown>;
};

const pinEnvKeys = (): Readonly<Record<string, string>> => {
  const keys = maybeDeviceConfig.DEV_STAFF_PIN_ENV;
  if (keys === undefined || typeof keys !== "object") {
    throw new Error(
      "@restos/device-config exports no `DEV_STAFF_PIN_ENV` — `01-F28` verifies against synced " +
        "credential HASHES, one per user, so the dev seed needs one configured PIN per member. " +
        "One `RESTOS_DEV_PIN` for the whole roster puts the branch manager's authority behind " +
        "the digits every cashier already knows (02-F22, 02-F38).",
    );
  }
  return keys;
};

const seedDevStaff = (options: SeedOptions): Promise<unknown> => {
  const fn = maybeDeviceConfig.seedDevStaff;
  if (typeof fn !== "function") {
    throw new Error("@restos/device-config exports no `seedDevStaff(options)`.");
  }
  return fn(options);
};

/** The environment an operator would set: one key per entry in `pins` (`00 §7` layer 3). */
const envFor = (pins: Record<string, string>): Record<string, string | undefined> => {
  const keys = pinEnvKeys();
  const env: Record<string, string | undefined> = {};
  for (const [user_id, pin] of Object.entries(pins)) {
    const key = keys[user_id];
    if (key === undefined) {
      throw new Error(`DEV_STAFF_PIN_ENV names no environment key for member ${user_id}`);
    }
    env[key] = pin;
  }
  return env;
};

// ── A real store, a real registry, a real Argon2id verification ──────────────────────────────

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const openRealStore = (): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "restos-dev-staff-"));
  dirs.push(dir);
  return openStore({ path: join(dir, "device.db"), identity: { ...IDENTITY } });
};

/**
 * A session over the REAL registry and the REAL durable counter.
 *
 * `max_failed_attempts` is deliberately enormous: `01-F61`'s lockout is `pin-session.test.ts`'s
 * subject, and a cross-product sweep necessarily produces failures. Letting the lockout fire here
 * would make a WRONG-CREDENTIAL result indistinguishable from a LOCKED-OUT one, which is exactly
 * the collapse `UnlockRefusal` exists to prevent — and the sweep would then pass against a
 * roster that shares one hash.
 */
const sessionOver = (store: DeviceStore) =>
  createPinSession({
    registry: store.staff,
    device: { device_id: store.identity.device_id, registered: true },
    idle_lock_ms: 60 * 60_000,
    max_failed_attempts: 1_000,
    now: () => 1_760_000_000_000,
    audit: () => {},
    attempts: store.pinAttempts,
  });

/**
 * Every `(row, pin)` pair that AUTHENTICATES, as `row_user_id<-pin_owner_user_id`.
 *
 * This is the instrument the suite rests on, so §A2 fires it at a registry known to share one
 * credential and asserts it reports the off-diagonal. Without that control, a sweep that silently
 * returned nothing at all would satisfy §A1.
 */
const admissions = async (store: DeviceStore, pins: Record<string, string>): Promise<string[]> => {
  const session = sessionOver(store);
  const out: string[] = [];
  for (const row of DEV_STAFF) {
    for (const [owner, pin] of Object.entries(pins)) {
      const result = await session.unlock(row.user_id, pin);
      if (result.ok) {
        out.push(`${row.user_id}<-${owner}`);
        // `unlock` MOVES the session; lock it so the next probe starts from the same state and a
        // stale success cannot be read as a fresh one.
        session.lock();
      }
    }
  }
  return out.sort();
};

/** What `admissions` MUST report: every member opened by their own PIN and by nobody else's. */
const diagonal = (pins: Record<string, string>): string[] =>
  Object.keys(pins)
    .map((user_id) => `${user_id}<-${user_id}`)
    .sort();

const seededStore = async (pins: Record<string, string> = PINS): Promise<DeviceStore> => {
  const store = openRealStore();
  await seedDevStaff({
    registry: store.staff,
    branch_id: store.identity.branch_id,
    env: envFor(pins),
  });
  return store;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `01-F26`/`01-F28`: a credential belongs to ONE PERSON.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F26/01-F28 — one PIN opens one person's row and nobody else's", () => {
  it("01-F28 — the roster carries a DISTINCT credential per member (the cross-product sweep)", async () => {
    // THE DANGEROUS CASE, and the one in the tree: one `hashPin` result written onto every
    // member. Under it this sweep reports all nine pairs and the assertion fails on six of them.
    //
    // Asserted as SET EQUALITY rather than "no cross-admission", so it also fails the opposite
    // way — a seed that stopped admitting a member with their OWN PIN would be a roster nobody
    // can sign in to, which `01-F17` and `03-F53` both refuse and which "no cross-admission"
    // would call a pass.
    const store = await seededStore();
    expect(await admissions(store, PINS)).toEqual(diagonal(PINS));
  });

  it("01-F28 CONTROL — the sweep DETECTS a shared credential when one is present", async () => {
    // The round-3 law: "build a plausible implementation, take the suite green, then break the
    // specific thing each assertion claims to own and confirm THAT assertion fails." This is that
    // mutant, in-tree and hermetic: the registry is written by hand with today's exact defect —
    // ONE `hashPin` result on every member — and the sweep above is fired at it unchanged.
    //
    // ⚠ It does NOT call `seedDevStaff`, so it stays green after the fix. It is an assertion
    // about the INSTRUMENT, not about the seed.
    const store = openRealStore();
    const shared = await hashPin("9999");
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: DEV_STAFF.map((m, index) => ({
        user_id: m.user_id,
        display_name: m.display_name,
        // Step 7's two new required fields (`01-F61`, `11-F22`). Fixture-only: this hand-written
        // registry is the MUTANT the sweep is fired at, and the defect it reproduces is the
        // shared `pin_hash` on the line below — neither new field touches it.
        grid_ordinal: index,
        status: "active" as const,
        pin_hash: shared,
        assignments: [{ role: m.role, branch_id: IDENTITY.branch_id }],
      })),
    });

    const found = await admissions(store, { [DEV_STAFF[0].user_id]: "9999" });
    // One PIN, three rows opened — including a row belonging to somebody else.
    expect(found).toHaveLength(DEV_STAFF.length);
    expect(found).not.toEqual(diagonal({ [DEV_STAFF[0].user_id]: "9999" }));
  });

  it("01-F26/01-F27/02-F41 — a member's own PIN unlocks that member, and names THAT user", async () => {
    // `02-F41` reads the session's `user_id` onto the envelope, so a session that unlocked the
    // right person under the wrong id would attribute permanently to the wrong person. Asserted
    // on the VALUE, never on `ok` alone.
    const store = await seededStore();
    const session = sessionOver(store);
    for (const member of DEV_STAFF) {
      const result = await session.unlock(member.user_id, PINS[member.user_id] as string);
      expect(result.ok, `${member.display_name} cannot unlock with their own PIN`).toBe(true);
      expect(session.currentUser()).toBe(member.user_id);
      session.lock();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `02-F41`/`02-F38`/`02-F22`: a cashier's credential yields no manager authority.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The authorized write surface over a REAL registry — the `subjectOf` read is the real one. */
const writesFor = (store: DeviceStore, user_id: string | null) => {
  const append = vi.fn((req: unknown) => ({ ...(req as object), id: "evt-1" }) as never);
  const writes = authorizeWrites({
    writes: {
      append,
      addLine: vi.fn(() => ({ id: "evt-2" }) as never),
      toggleAvailability: vi.fn(() => ({ id: "evt-3" }) as never),
      recordCustomer: vi.fn(() => ({ id: "evt-4" }) as never),
    },
    store,
    session: () => (user_id === null ? null : { user_id, display_name: "n/a" }),
    paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
  });
  return { writes, append };
};

const DAY_OPENED = {
  type: "day.opened",
  payload: { day_id: "d-1", opening_float_paisa: 500_000, prev_day_id: null },
  refs: [],
};

describe("§B 02-F22/02-F38/02-F41 — authenticating as a cashier is not manager authority", () => {
  it("02-F38 — a cashier's PIN opens exactly ONE user_id, and it is her own", async () => {
    // `02-F38`'s refusal is keyed on `user_id`: "a requester never sees an approve control for
    // their own request … refused server-side". A refusal keyed on an identifier that ONE secret
    // opens TWICE refuses nothing — the requester taps the manager tile, types the digits she
    // already knows, and approves herself under a second id. So the FR's precondition is a
    // credential-level property, and this is it.
    const cashier = CASHIERS[0];
    expect(cashier, "DEV_STAFF carries no cashier — §B cannot ask its question").toBeDefined();
    if (cashier === undefined) return;
    const store = await seededStore();
    const opened = await admissions(store, { [cashier.user_id]: PINS[cashier.user_id] as string });
    expect(opened).toEqual([`${cashier.user_id}<-${cashier.user_id}`]);
  });

  it("02-F22 — the MANAGER's row refuses a cashier's PIN, so the day cannot be opened", async () => {
    // THE ASSERTION THIS SUITE EXISTS FOR. `02-F22`: "day open/close and float entry require
    // manager/owner permission — a cashier session cannot execute them." Today `DEV_STAFF`'s
    // branch manager is opened by both cashiers' digits, so the guard is a tile-tap away and
    // reads as enforced while enforcing nothing.
    const cashier = CASHIERS[0];
    expect(
      MANAGER,
      "DEV_STAFF carries no branch_manager — §B cannot ask its question",
    ).toBeDefined();
    if (MANAGER === undefined || cashier === undefined) return;

    const store = await seededStore();
    const session = sessionOver(store);

    const stolen = await session.unlock(MANAGER.user_id, PINS[cashier.user_id] as string);
    expect(stolen.ok, "a cashier's PIN opened the branch manager's row").toBe(false);
    expect(stolen.ok === false && stolen.reason).toBe("bad_pin");
    // The refusal is not merely a returned value: nobody is signed in afterwards.
    expect(session.currentUser()).toBeNull();

    // …and the authority that row carries is therefore unreachable from that credential.
    const asCashier = writesFor(store, cashier.user_id);
    expect(() => asCashier.writes.append(DAY_OPENED)).toThrow();
    expect(asCashier.append).not.toHaveBeenCalled();
  });

  it("02-F22 CONTROL — the manager's OWN PIN opens the day, so §B is not a blanket deny", async () => {
    // Without this, an `authorizeWrites` that refused everything — or a `seedDevStaff` that
    // assigned every member `cashier` — would pass the test above. Attribution needs a
    // one-branch difference: same store, same guard, same event, different credential.
    expect(MANAGER).toBeDefined();
    if (MANAGER === undefined) return;

    const store = await seededStore();
    const session = sessionOver(store);
    const ok = await session.unlock(MANAGER.user_id, PINS[MANAGER.user_id] as string);
    expect(ok.ok, "the branch manager cannot unlock with their own PIN").toBe(true);

    const asManager = writesFor(store, MANAGER.user_id);
    expect(() => asManager.writes.append(DAY_OPENED)).not.toThrow();
    expect(asManager.append).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `00 §7` layer 3: the roster's credentials are OPERATOR-SUPPLIED, one per member.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F28/00 §7 — configuration supplies a credential per member, not one secret", () => {
  it("01-F28 — the package NAMES one distinct environment key per member of DEV_STAFF", () => {
    // Declared by the package rather than by each host: `DEC-ARCH-001` extracts at the second
    // consumer, and both `apps/pos-electron` and `apps/pass-kds` seed this roster. Two spellings
    // of one variable is a till and a pass screen that disagree about who can sign in.
    const keys = pinEnvKeys();
    const named = DEV_STAFF.map((m) => keys[m.user_id]);
    expect(named.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    // THE DANGEROUS CASE: one name reused across members is the shipped defect wearing a map.
    expect(new Set(named).size, "two members are configured by the SAME variable").toBe(
      DEV_STAFF.length,
    );
  });

  it("01-F28 — a member with no configured PIN is NOT seeded, and cannot unlock", async () => {
    // The module's own stated philosophy, applied per member instead of per roster: "Unset (or
    // empty) ⇒ nothing is seeded, and an empty grid is the honest state of a device no roster has
    // reached (`00 §5.7`)". A member left out of the configuration has no credential, so there is
    // nothing for a neighbour's PIN to fall back onto.
    const only = CASHIERS[0];
    expect(only).toBeDefined();
    if (only === undefined) return;
    const store = await seededStore({ [only.user_id]: PINS[only.user_id] as string });

    expect(store.staff.lookup(only.user_id)).not.toBeNull();
    for (const other of DEV_STAFF.filter((m) => m.user_id !== only.user_id)) {
      expect(
        store.staff.lookup(other.user_id),
        `${other.display_name} was seeded with a credential nobody configured`,
      ).toBeNull();
    }
  });

  it("01-F26 — ONE configured value never becomes the credential of a SECOND member", async () => {
    // The invariant, stated so it survives either resolution of the `RESTOS_DEV_PIN` question:
    // whatever ONE key an operator sets, at most ONE row opens with that value. A fallback that
    // filled the unconfigured members from the configured one would restore the whole defect
    // while passing §A (which supplies three distinct values and never exercises the fallback) —
    // this is `01-F60`'s own argument for a REQUIRED input: "a caller who simply forgot the
    // argument silently received no completeness check at all".
    //
    // ⚠ Deliberately NOT keyed on the variable's NAME. `DEV_PIN_ENV` may survive as one member's
    // key or be retired; both satisfy this, and asserting the name would go RED against a correct
    // implementation that chose the other.
    const keys = pinEnvKeys();
    for (const member of DEV_STAFF) {
      const store = openRealStore();
      await seedDevStaff({
        registry: store.staff,
        branch_id: store.identity.branch_id,
        env: { [keys[member.user_id] as string]: "4242" },
      });
      const opened = await admissions(store, { [member.user_id]: "4242" });
      expect(opened, `one configured PIN opened ${opened.length} rows`).toEqual([
        `${member.user_id}<-${member.user_id}`,
      ]);
    }
  });

  it("01-F17/00 §5.7 — an empty configuration seeds NOBODY rather than a default credential", async () => {
    // Preserved from the shipped module and asserted rather than assumed, because the tempting
    // repair for §C's per-member keys is a built-in default PIN — which is the device-wide
    // constant `01-F61` refuses, arriving through the fix for a different hole.
    const store = openRealStore();
    await seedDevStaff({ registry: store.staff, branch_id: store.identity.branch_id, env: {} });
    expect(store.staff.list()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE SEAM. Both hosts hand the seed the per-member configuration.
//
// `AGENTS.md`'s recurring defect, in the shape it takes here: `seedDevStaff` could grow correct
// per-member credentials and both hosts could go on passing the one shared value, and every gate
// would stay green. `seams:check` cannot see it — `seedDevStaff` is reached (Rule A) and no
// optional member is unsupplied (Rule B) — so this is the hand-written assertion.
//
// ⚠ THESE ARE SOURCE READS AND THAT IS STATED PLAINLY, following `pass-identity-seam.test.ts`:
// both files build an Electron app at module scope and no suite can import them. A source string
// can be satisfied by a call that is present and wrong; what it CAN do is fail when the call is
// ABSENT, which is the failure this wave keeps shipping.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

/** Source with comments removed — what the machine runs, not what a reader is told. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const HOSTS = [
  ["apps/pos-electron/src/main/index.ts", "../index.ts"],
  ["apps/pass-kds/src/main/index.ts", "../../../../pass-kds/src/main/index.ts"],
] as const;

describe("§D the seam — both hosts seed from the per-member configuration", () => {
  for (const [name, path] of HOSTS) {
    it(`01-F28 — ${name} hands seedDevStaff the environment, not one shared PIN`, () => {
      const source = code(read(path));
      const at = source.indexOf("seedDevStaff({");
      expect(at, `${name} does not call seedDevStaff`).toBeGreaterThan(-1);
      // Bounded at the call's own closing brace rather than by a character count: a fixed window
      // runs on into whatever statement follows and would match an `env` that is not an argument.
      const rest = source.slice(at);
      const end = rest.indexOf("});");
      const call = end === -1 ? rest.slice(0, 400) : rest.slice(0, end + 3);

      // THE DANGEROUS CASE: the host resolves ONE value and hands it over, which is what makes
      // the three members share a credential no matter what the package does with it.
      expect(
        /\bpin\s*:/.test(call),
        `${name} still passes a single \`pin:\` — one secret for the whole roster (02-F22)`,
      ).toBe(false);
      // ⚠ `[:,}]` and not `:` — `apps/pass-kds` already holds a local `env`, so the correct code
      // there is the SHORTHAND `env,`. A colon-only match would go RED against a correct
      // implementation, which the round-3 law puts on the same footing as a vacuous assertion.
      // Verified both ways before this file was finished: it matches `env: process.env` and
      // `env,`, and does NOT match today's `pin: env[DEV_PIN_ENV]`.
      expect(/\benv\s*[:,}]/.test(call), `${name} does not pass \`env\` to seedDevStaff`).toBe(
        true,
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE OTHER HALF OF THE SEAM: the boot line is drawn from the DEVICE, AFTER the seed.
//
// ⚠ ADDED 2026-08-17 to close two mutants an out-of-tree run reported as SURVIVING every gate this
// work has — `@restos/device-config`'s own 16-test oracle, both host suites, `pnpm verify` and
// `pnpm seams:check`:
//
//   M3  `seedDevStaff` returning a bare `true` in place of `registry.apply(…).applied`.
//   M4  `describeDevStaff` ignoring its `device` argument entirely.
//
// **What these assertions own, and what they do not — stated first, because the gap is the point.**
// Both mutants are edits to `packages/device-config`, and no read of a HOST's source can fail on
// either. What a host read CAN own is the seam beneath them, which is the half that decides whether
// the fact ever reaches an operator: the line is handed the registry the seed just wrote into, it
// is handed the seed's own REPORT, and it is drawn AFTER the seed rather than before it. M3's
// package half — a refused `apply` reported as a success by the seed itself — needs a behavioural
// assertion against a registry that REFUSES, and that belongs to
// `packages/device-config/src/__acceptance__/dev-staff-seed.test.ts`, which `24 §3` keeps
// byte-identical to its authoring commit. It is REPORTED as a finding for that file's test owner
// and is deliberately not smuggled in here.
//
// `00 §5.7` is the FR, and `describeDevStaff`'s own header prices the failure: a pilot till whose
// seed stood down "went on printing `staff: 3 seeded — Ayesha, Bilal, Hina` while none of the three
// was on it". Three facts stop that, and each is a separate way to be silently wrong:
//
//   · the REGISTRY — who is actually on this device, as against who was configured;
//   · the seed's REPORT — `staff.ts` REFUSES rather than throwing (`01-F17`), so a discarded return
//     is a write that failed and said nothing (`describeDevStaff` cannot re-derive it: an empty
//     grid because nobody was configured and an empty grid because the registry refused look
//     identical from `list()`);
//   · the ORDER — a line drawn before the seed reports the device as it WAS. `02-F22` is the cost
//     on this host specifically: the warning that nobody holds day-open authority would fire on
//     every launch of a correctly seeded till, and an operator who learns to ignore it loses the
//     one line that tells him no shift can open.
//
// ⚠ SOURCE READS, stated plainly, exactly as §D above: both hosts build an Electron app at module
// scope and no suite can import them. A string can be satisfied by a call that is present and
// wrong. What it CAN do is fail when the call is ABSENT, when it is handed something that is not
// the device, or when it runs in the wrong order — which is the failure this wave keeps shipping.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The text of `name(…)`, bounded by its OWN closing parenthesis.
 *
 * §D bounds on the literal `});`, which is right for a call whose last argument is a multi-line
 * object and wrong for `apps/pass-kds`'s boot line, where the same call is written on one line
 * inside a template literal and closes `})}`. A balance walk is indifferent to formatting, which is
 * what stops this file failing a correct implementation that reflowed a call (`24 §3`'s round-3
 * law: a test that stays RED under a correct implementation is as damaging as a vacuous one).
 */
const callTo = (source: string, name: string): string | null => {
  const at = source.indexOf(`${name}(`);
  if (at === -1) return null;
  let depth = 0;
  for (let i = at + name.length; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return null;
};

/** The expression a call passes for `member:`, or `undefined` if it passes none. */
const argumentFor = (call: string, member: string): string | undefined =>
  new RegExp(`\\b${member}:\\s*([^,\\n}]+)`).exec(call)?.[1]?.trim();

describe("§E 00 §5.7 — the roster boot line reports THIS DEVICE, and it is drawn after the seed", () => {
  for (const [name, path] of HOSTS) {
    it(`00 §5.7 — ${name} hands the boot line the registry the SEED wrote into`, () => {
      const source = code(read(path));
      const seed = callTo(source, "seedDevStaff");
      const line = callTo(source, "describeDevStaff");
      expect(seed, `${name} does not call seedDevStaff`).not.toBeNull();
      expect(line, `${name} does not call describeDevStaff`).not.toBeNull();

      const seeded = argumentFor(seed ?? "", "registry");
      const reported = argumentFor(line ?? "", "registry");
      expect(seeded, `${name} does not hand seedDevStaff a registry`).toBeDefined();
      // THE DANGEROUS CASE, and it is the one `seams:check` is blind to by construction: the
      // device bag is REQUIRED, so Rule B is satisfied by any supply at all and a host that drew
      // the line from `process.env` alone — or supplied `{ list: () => [] }`, which typechecks,
      // because `DevStaffRegistry` is structurally typed — is a boot line that reports the
      // REQUEST while claiming to report the device. `AGENTS.md` measures that shape as invisible
      // to every rail in this repo ("a port supplied with a STUB").
      expect(
        reported,
        `${name} draws the roster boot line without a registry — it can then only report what an ` +
          "operator ASKED for, which is a different fact from what is on the device (00 §5.7)",
      ).toBeDefined();
      expect(
        reported,
        `${name} reports a DIFFERENT registry from the one it seeded — two readings of one fact ` +
          "is how a surface and the code it describes come to disagree (03-F40)",
      ).toBe(seeded);
      // Asserted on the SHAPE rather than on the literal `store.staff`, so renaming the store does
      // not redden a correct host while an object literal or any other projection still fails.
      expect(
        /^[A-Za-z_$][\w$]*\.staff$/.test(reported ?? ""),
        `${name} passes \`${reported}\` as the registry — not the device's own staff registry`,
      ).toBe(true);
    });

    it(`00 §5.7 — ${name} draws that line AFTER the seed has run`, () => {
      // Order is what makes the line TRUE, so it is asserted rather than the argument alone: a
      // host that logged first and seeded afterwards would pass every assertion above and report
      // the roster as it was BEFORE this boot — on the counter, "NOBODY IS ON THIS DEVICE" under a
      // grid that is about to have three tiles on it, plus `02-F22`'s day-open warning on every
      // launch of a till where the day opens fine.
      const source = code(read(path));
      const seededAt = source.indexOf("seedDevStaff(");
      const reportedAt = source.indexOf("describeDevStaff(");
      expect(seededAt, `${name} does not call seedDevStaff`).toBeGreaterThan(-1);
      expect(reportedAt, `${name} does not call describeDevStaff`).toBeGreaterThan(-1);
      expect(
        reportedAt,
        `${name} draws the roster boot line BEFORE it seeds, so the line reports the device as it ` +
          "was rather than as it is",
      ).toBeGreaterThan(seededAt);
    });

    it(`01-F17 — ${name} passes what seedDevStaff RETURNED as the seeded fact`, () => {
      // `staff.ts` refuses rather than throwing, so a discarded return is a seed that wrote
      // nothing and said nothing about it — `dev-staff.ts:478` names this as the half of
      // `main/catalog.ts:247`'s `return result.applied` that copying only the guard leaves behind.
      // The registry cannot recover it: `describeDevStaff` says so in terms, "an empty grid
      // because nobody was configured and an empty grid because the registry REFUSED the write
      // look identical from `list()`".
      const source = code(read(path));
      // ⚠ The declaration keyword is OPTIONAL in this match, and that is deliberate: a host that
      // declares `let staffSeeded` and assigns it later still hands the boot line what the seed
      // returned, and the round-3 law puts a test that reddens a correct implementation on the
      // same footing as a vacuous one. What has no binding at all — `await seedDevStaff({…});` as
      // a bare statement — is the discarded return this owns.
      const binding =
        /(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*await\s+seedDevStaff\(/.exec(
          source,
        )?.[1];
      expect(
        binding,
        `${name} discards seedDevStaff's return — a refused write is then indistinguishable from ` +
          "a successful one on the one line an operator reads (01-F17, 00 §5.7)",
      ).toBeDefined();

      const line = callTo(source, "describeDevStaff");
      expect(line, `${name} does not call describeDevStaff`).not.toBeNull();
      const call = line ?? "";
      // THE DANGEROUS CASE: `seeded: true`. It typechecks, it reads like the happy path, and it
      // makes the boot line assert a write that the registry rejected.
      expect(
        new RegExp(`\\bseeded:\\s*${binding}\\b`).test(call) ||
          // The shorthand is legal and must not be penalised — `apps/pass-kds` already writes
          // `env,` one call up for exactly this reason (§D's own ⚠).
          (binding === "seeded" && /\bseeded\s*[,}]/.test(call)),
        `${name} reports \`${argumentFor(call, "seeded")}\` as the seeded fact rather than the ` +
          `\`${binding}\` seedDevStaff returned`,
      ).toBe(true);
    });
  }
});
