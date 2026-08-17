// Acceptance tests — THE CLOUD STORAGE HALF OF THE STAFF ROSTER (`01-F75`, `01-F76`, `11-F21`,
// `11-F22`, `11-F23`, `01-F61`, R25/R26/R30).
//
// ⚠ **AUTHORED FROM SPEC TEXT ONLY, BY A SESSION THAT WROTE NO IMPLEMENTATION AND WILL NOT WRITE
// ONE** (`24 §3`). Every assertion below is traceable to a quoted clause in `specs/01-kernel-sync.md`
// or `specs/11-staff-people.md`, or to a ruling in `plans/saas-pivot/plan-of-record.md` §0. Nothing
// here was derived from an implementation's shape, because there is no implementation: measured
// 2026-08-17, `grep -arn "pin_hash|pinHash" services/` (non-test) is empty, `kernel.users` is eight
// columns with no version column, and no `/internal` route or gateway dispatch arm serves a roster.
//
// ── THE CONTRACTED SURFACE (binding on the implementation session) ───────────────────────────────
//
// `helpers.ts` already sets this precedent for this package ("CONTRACTED MODULE SURFACE (binding on
// the implementation session)"). The SYMBOL NAMES below are the contract; the FILE they live in is
// not, because no spec clause names a file. The loader looks for each name in `../staff.js`, then
// `../index.js`, then `../tenancy.js`, and fails naming every module it tried — so an implementer
// who puts the roster beside the catalog (`catalog.ts`'s obvious peer) and one who extends the
// existing tenancy writer both satisfy it, and neither is blocked on guessing a filename.
//
//   staffVersion(db, scope): Promise<number>
//       The org/branch artifact's current version. `0` = nothing has ever been published for this
//       key — the catalog's own meaning of 0 (`catalog.ts`), which `01-F75` says survives verbatim.
//
//   publishStaffRoster(db, scope, changed_user_ids, { now, actor_user_id? }): Promise<number>
//       Mints the NEXT version for THIS `01-F76` key and appends what changed at it, exactly as
//       `publishCatalog` "publish[es] a set of changes as the next version". The caller states WHICH
//       people changed and the publisher assembles their rows from storage — that split is forced by
//       two clauses pulling opposite ways: `11-F23` puts a `left join` to the credential table
//       INSIDE the publisher ("the publisher's `left join` produces the specified shape without a
//       branch"), while `01 §9.7` leaves *which people a branch's artifact contains* UNRULED and
//       `01-F76` says "nothing can select a roster's rows until it is ruled". A publisher that
//       selected its own members would be answering §9.7 in a query; one handed fully-formed rows
//       could not do `11-F23`'s join. Ids-in, rows-assembled-from-storage is the only shape both
//       clauses admit today.
//
//   staffPage(db, scope, have_version, from, at_version?): Promise<StaffPage>
//       `01-F75`'s response vocabulary, generic and unchanged from the catalog's:
//       `form: snapshot | delta` / `version` / `base_version?` / `entries[]` / `complete` /
//       `next_from`, and "the server sends a delta only if it can construct one from that exact
//       base and a snapshot otherwise".
//
//   setPinCredential(db, { org_id, user_id, pin_hash, now }): Promise<unknown>
//       `11-F23`'s separate writer for the separate credential table. It takes a HASH and never a
//       PIN (`11-F21`: "a PIN exists in exactly two places … the keypad it is typed on and the
//       argument to a verify call").
//
//   setUserStatus(db, { org_id, user_id, status }): Promise<unknown>
//       `11-F22`'s participation transition. Needed here because the version axis cannot be tested
//       without a roster that CHANGES — `tenancy.ts` today says "NOTHING HERE UPDATES OR DELETES".
//
// The local `type` declarations below exist to give this file types and to state the contract in one
// place. **They are not oracle targets** — every assertion runs against the loaded PRODUCTION module
// (§A proves it loaded), never against a hand-copy. That is the `K-3` defect this repo names (an
// oracle that declared the interface it existed to deliver and then asserted against its own copy,
// leaving both oracle symbols dead), and it is why §A asserts the symbols are functions ON THE
// LOADED MODULE before anything else runs.
//
// ── ⚠ TRAP 8, WHICH IS WHAT MOST OF §C EXISTS FOR ───────────────────────────────────────────────
//
// `plans/saas-pivot/staff-over-the-wire.md`: *"Copying `catalogPage`'s SQL onto `kernel.users`."*
// The catalog's storage is an append-per-version publication log; `kernel.users` is CURRENT STATE
// with no version column, so a `distinct on … order by version desc` snapshot has nothing to run
// against. The fixture is therefore a roster **edited three times**, and §C asks for versions that
// are neither 0 nor the latest. The single assertion that costs the most to fake is C6: at
// `at_version` 2 a member reads `active` and at version 3 the same member reads `inactive`. An
// implementation that serves current state — the shape trap 8 predicts — answers `inactive` to both
// and is green on every other test in this file.
//
// ── WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT, AND WHY (commandment 2) ────────────────────────
//
// Each of these is UNRULED. Asserting either way would be inventing policy, and — worse for the
// implementer — an oracle that stays red under a correct implementation blocks them indefinitely
// (three shipped last round, `oracle-round-2-findings.md` §C).
//
//  1. **WHICH PEOPLE a branch's artifact contains** — `01 §9.7`, open, and `01-F76` says it "BLOCKS
//     the build rather than annotating it". So every fixture person here has EXACTLY ONE assignment,
//     to her own branch, which is the one case all three candidate readings agree on. No test
//     publishes an org-wide (`branch_id: null`) person into a branch artifact, and no test asserts
//     that a person assigned only to branch B is refused from branch A's artifact. §G asserts only
//     the CROSS-ORG refusal, which `01-F71` decides outright.
//  2. **Whether a row carries ALL of a person's assignments or only this artifact's** — the second
//     half of §9.7, same clause. For a single-branch person the two readings are identical, which is
//     why §I3 is assertable at all.
//  3. **Whether a non-`active` member's `grid_ordinal` stays reserved.** `01-F75` makes the ordinal
//     unique "within the artifact" and `11-F22` keeps departed members in it, but nothing says
//     whether a new hire may take a departed cashier's position. Every ordinal-collision fixture in
//     §F uses two ACTIVE members.
//  4. **Whether the cloud enforces ordinal uniqueness more widely than the artifact.** `01-F75`:
//     "whether the cloud enforces uniqueness more widely than that is a storage choice this FR does
//     not make." So §F asserts the INVARIANT (no published artifact ever contains two entries at one
//     ordinal) rather than which layer refuses, and no fixture ever needs two branches to reuse an
//     ordinal — the ids are globally distinct, so a stricter storage choice passes too.
//  5. **What happens to the credential row when status leaves `active`** — `11-F23` names this as
//     undecided ("deleted, retained, or retained-and-unreachable … deleting the row is the obvious
//     implementation and is not obviously right"). §D3 therefore asserts the PROJECTION (an inactive
//     member's entry carries no hash) and never the row, and §C6's historical-version assertion is
//     deliberately about `status` and not about a hash, so that either retention answer passes.
//  6. **Whether an ACTIVE member with no credential row may be published at all** (R29 has the owner
//     set the first PIN, so the window exists). No fixture contains such a person and nothing here
//     asserts accept or refuse.
//  7. **Whether publication is immediate or staged to `01-F46`'s boundary** — `01-F75` (i) leaves it
//     to `01 §9.5`, and R27 rules the POLICY while explicitly leaving the MECHANISM open. Every
//     publish here is called directly, and no test asserts anything about when it happens.
//
// ⚠ Needs Docker (Testcontainers). Fails LOUDLY rather than skipping (`T-01-07`).

import { hashPin, newId, verifyPin } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogEntry, catalogPage, catalogVersion, publishCatalog } from "../catalog.js";
import { insertBranch, insertOrg, insertUser, listUsers, type UserRow } from "../tenancy.js";
import { BASE_T, closeDb, type Db, openDb } from "./helpers.js";

/* ── the contracted surface ──────────────────────────────────────────────────────────────────── */

/**
 * `01-F76`'s artifact scope: "The shape is `{ org_id, branch_id }`, with `branch_id: null` meaning
 * ORG scope — ONE shape for every resource and not one per resource", and a STRUCTURED value
 * "never … a concatenation" (`01-F71` (d)).
 */
type StaffScope = { readonly org_id: string; readonly branch_id: string | null };

/** `01-F75`'s declared `staff` row ("declared here because a golden fixture cannot be written without it"). */
type StaffEntry = {
  readonly user_id: string;
  readonly display_name: string;
  readonly grid_ordinal: number;
  readonly status: string;
  readonly assignments: readonly { readonly role: string; readonly branch_id: string | null }[];
  /** `11-F21` — present ONLY on an `active` member; its ABSENCE on a non-active one is the shape. */
  readonly pin_hash?: string;
};

type StaffPage = {
  readonly form: "snapshot" | "delta";
  readonly version: number;
  readonly base_version?: number;
  readonly entries: readonly StaffEntry[];
  readonly complete: boolean;
  readonly next_from: number;
};

type StaffStorage = {
  staffVersion(db: Db, scope: StaffScope): Promise<number>;
  publishStaffRoster(
    db: Db,
    scope: StaffScope,
    changed_user_ids: readonly string[],
    opts: { now: number; actor_user_id?: string | null },
  ): Promise<number>;
  staffPage(
    db: Db,
    scope: StaffScope,
    have_version: number,
    from: number,
    at_version?: number,
  ): Promise<StaffPage>;
  setPinCredential(
    db: Db,
    args: { org_id: string; user_id: string; pin_hash: string; now: number },
  ): Promise<unknown>;
  setUserStatus(
    db: Db,
    args: { org_id: string; user_id: string; status: string },
  ): Promise<unknown>;
};

const REQUIRED = [
  "staffVersion",
  "publishStaffRoster",
  "staffPage",
  "setPinCredential",
  "setUserStatus",
] as const;

/**
 * Typed `readonly string[]` and NOT a literal tuple on purpose: with literal types TypeScript
 * resolves each specifier at compile time and `../staff.js` is a hard `TS2307` until step 3 lands,
 * which takes the whole FILE down as "no tests" instead of as named failures. That failure mode is
 * itself a finding in this plan's oracle round ("`readFileSync` at `describe` scope takes a whole
 * file down as `Tests: no tests` rather than as a named failure"), and it is the difference between
 * an implementer reading a contract and an implementer reading a stack trace.
 */
const CONTRACT_MODULES: readonly string[] = ["../staff.js", "../index.js", "../tenancy.js"];

let contract: StaffStorage | undefined;

/** Resolve the contracted surface from PRODUCTION modules. Called per test so each fails by name. */
const staff = async (): Promise<StaffStorage> => {
  if (contract !== undefined) return contract;
  const found: Record<string, unknown> = {};
  const tried: string[] = [];
  for (const specifier of CONTRACT_MODULES) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(specifier)) as Record<string, unknown>;
    } catch (cause) {
      tried.push(`${specifier} — not loadable (${String(cause).split("\n")[0]})`);
      continue;
    }
    tried.push(specifier);
    for (const name of REQUIRED) {
      if (found[name] === undefined && typeof mod[name] === "function") found[name] = mod[name];
    }
  }
  const missing = REQUIRED.filter((name) => found[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `the staff-roster storage surface is not implemented: ${missing.join(", ")} were not ` +
        `exported by any of [${tried.join(" | ")}]. This suite is the oracle for step 3 of ` +
        "plans/saas-pivot/staff-over-the-wire.md (01-F75/01-F76/11-F21/11-F22/11-F23); the names " +
        "are the contract and the module is not — export them from whichever of those files is " +
        "their home.",
    );
  }
  contract = found as unknown as StaffStorage;
  return contract;
};

/* ── fixtures ────────────────────────────────────────────────────────────────────────────────── */

let db: Db;
beforeAll(() => {
  db = openDb();
});
afterAll(async () => {
  await closeDb(db);
});

const T = BASE_T;

/** One back-office credential, hashed once: `hashPin` is deliberately ~0.4 s (`01-F61`'s floor). */
let backOfficeHash: string | undefined;
const password = async (): Promise<string> => {
  backOfficeHash ??= await hashPin("back-office-secret-not-a-pin");
  return backOfficeHash;
};

type PersonInput = {
  user_id?: string;
  org_id: string;
  display_name: string;
  email?: string | null;
  grid_ordinal: number;
  status?: string;
  assignments: readonly { role: string; branch_id: string | null }[];
};

/**
 * Insert one person through the PRODUCTION writer (`18 §4`: `kernel.users` has exactly one writer
 * service and this is its function). The cast is `publishCatalog`'s own precedent — "the check is
 * written through a cast, which is the only honest way to ask a question the type says cannot
 * arise": `UserRow.email` is `string` and `PersonRecord` carries no `status` TODAY, and both change
 * under R30 and `11-F22`.
 *
 * **An OMITTED email means "give her one"; only an explicit `null` is R30's till-only cashier.**
 * The default is deliberately not `null`: every §E/§F/§G fixture would then depend on R30's
 * migration having landed, and a test that fails on a neighbouring FR's constraint reports the
 * wrong debt. §H owns the null case and varies it on purpose (`oracle-round-2-findings.md` §C's
 * first pattern — "an email always present" is exactly the input a staff fixture forgets to vary).
 */
const addPerson = async (person: PersonInput): Promise<string> => {
  const user_id = person.user_id ?? newId();
  const row = {
    user_id,
    org_id: person.org_id,
    display_name: person.display_name,
    email: person.email === undefined ? `person-${user_id}@example.com` : person.email,
    password_hash: await password(),
    assignments: person.assignments,
    grid_ordinal: person.grid_ordinal,
    status: person.status ?? "active",
    created_at: T,
  };
  const written = await insertUser(db, row as unknown as UserRow);
  if (!written) throw new Error(`fixture: insertUser refused ${person.display_name}`);
  return user_id;
};

const addOrg = async (org_id: string): Promise<void> => {
  await insertOrg(db, {
    org_id,
    display_name: `Org ${org_id.slice(0, 8)}`,
    status: "active",
    created_at: T,
  });
};

const addBranch = async (org_id: string, branch_id: string): Promise<void> => {
  await insertBranch(db, {
    branch_id,
    org_id,
    display_name: `Branch ${branch_id.slice(0, 8)}`,
    branch_type: "branch",
    branch_class: "production",
    created_at: T,
  });
};

const byId = (page: StaffPage, user_id: string): StaffEntry | undefined =>
  page.entries.find((entry) => entry.user_id === user_id);

const ids = (page: StaffPage): string[] => page.entries.map((entry) => entry.user_id).sort();

/**
 * THE MAIN FIXTURE — one org, two branches, and branch A's roster **edited three times**.
 *
 * Built once and memoized rather than in `beforeAll`, so that a missing contract fails each test
 * with the loader's message instead of collapsing the file into one hook error.
 *
 *   v1  ayesha (10), bilal (20), hina (30)   — three people, all active, all with a PIN credential
 *   v2  danish (40) joins                    — one changed member, not the whole roster
 *   v3  bilal goes `inactive` (`11-F22`)     — a departure is a MARKED ENTRY, never an absence
 *
 * Branch B holds one person and is published ONCE, so its version number (1) is a number branch A
 * also has and means different bytes — `01-F76`'s whole point, and the thing an org-wide counter
 * cannot express.
 */
type MainFixture = {
  org: string;
  branchA: string;
  branchB: string;
  scopeA: StaffScope;
  scopeB: StaffScope;
  ayesha: string;
  bilal: string;
  hina: string;
  danish: string;
  sana: string;
  ayeshaPin: string;
  bilalPinHash: string;
};

let mainFixture: Promise<MainFixture> | undefined;

const buildMain = async (): Promise<MainFixture> => {
  const api = await staff();
  const org = `org-main-${newId()}`;
  const branchA = `branch-a-${newId()}`;
  const branchB = `branch-b-${newId()}`;
  await addOrg(org);
  await addBranch(org, branchA);
  await addBranch(org, branchB);

  const scopeA: StaffScope = { org_id: org, branch_id: branchA };
  const scopeB: StaffScope = { org_id: org, branch_id: branchB };

  const ayesha = await addPerson({
    org_id: org,
    display_name: "Ayesha Khan",
    email: null,
    grid_ordinal: 10,
    assignments: [{ role: "cashier", branch_id: branchA }],
  });
  const bilal = await addPerson({
    org_id: org,
    display_name: "Bilal Ahmed",
    email: null,
    grid_ordinal: 20,
    assignments: [{ role: "cashier", branch_id: branchA }],
  });
  const hina = await addPerson({
    org_id: org,
    display_name: "Hina Qureshi",
    email: `hina-${newId()}@example.com`,
    grid_ordinal: 30,
    assignments: [{ role: "branch_manager", branch_id: branchA }],
  });
  const sana = await addPerson({
    org_id: org,
    display_name: "Sana Iqbal",
    email: null,
    grid_ordinal: 110,
    assignments: [{ role: "cashier", branch_id: branchB }],
  });

  const ayeshaPin = "8461";
  const bilalPinHash = await hashPin("2793");
  await api.setPinCredential(db, {
    org_id: org,
    user_id: ayesha,
    pin_hash: await hashPin(ayeshaPin),
    now: T,
  });
  await api.setPinCredential(db, { org_id: org, user_id: bilal, pin_hash: bilalPinHash, now: T });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: hina,
    pin_hash: await hashPin("5320"),
    now: T,
  });

  const v1 = await api.publishStaffRoster(db, scopeA, [ayesha, bilal, hina], { now: T });
  if (v1 !== 1) throw new Error(`fixture: first publish minted version ${v1}, expected 1`);

  const danish = await addPerson({
    org_id: org,
    display_name: "Danish Raza",
    email: null,
    grid_ordinal: 40,
    assignments: [{ role: "cashier", branch_id: branchA }],
  });
  await api.setPinCredential(db, {
    org_id: org,
    user_id: danish,
    pin_hash: await hashPin("6108"),
    now: T + 1,
  });
  const v2 = await api.publishStaffRoster(db, scopeA, [danish], { now: T + 1 });
  if (v2 !== 2) throw new Error(`fixture: second publish minted version ${v2}, expected 2`);

  await api.setUserStatus(db, { org_id: org, user_id: bilal, status: "inactive" });
  const v3 = await api.publishStaffRoster(db, scopeA, [bilal], { now: T + 2 });
  if (v3 !== 3) throw new Error(`fixture: third publish minted version ${v3}, expected 3`);

  await api.setPinCredential(db, {
    org_id: org,
    user_id: sana,
    pin_hash: await hashPin("4275"),
    now: T,
  });
  await api.publishStaffRoster(db, scopeB, [sana], { now: T + 3 });

  return {
    org,
    branchA,
    branchB,
    scopeA,
    scopeB,
    ayesha,
    bilal,
    hina,
    danish,
    sana,
    ayeshaPin,
    bilalPinHash,
  };
};

const main = (): Promise<MainFixture> => {
  mainFixture ??= buildMain();
  return mainFixture;
};

/* ── §A the contracted surface exists ────────────────────────────────────────────────────────── */

describe("§A — the surface this suite drives is the PRODUCT's, not this file's", () => {
  it("A1 exports every contracted symbol as a function from a production module", async () => {
    const api = await staff();
    for (const name of REQUIRED) {
      expect(typeof (api as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("A2 reports version 0 for a key nothing has ever published to, and serves no rows", async () => {
    // `catalog.ts`: "`0` means nothing has ever been published", and `01-F77` keeps that meaning per
    // key — "an artifact for which the org has published nothing is omitted, never sent as `0`".
    const api = await staff();
    const scope: StaffScope = { org_id: `org-empty-${newId()}`, branch_id: `branch-${newId()}` };
    expect(await api.staffVersion(db, scope)).toBe(0);
    const page = await api.staffPage(db, scope, 0, 0);
    expect(page.entries).toEqual([]);
    expect(page.version).toBe(0);
  });
});

/* ── §B the version axis is per (resource, scope) ────────────────────────────────────────────── */

describe("§B — `01-F76`: an artifact is (resource, scope), and a version is meaningless without it", () => {
  it("B1 counts versions PER BRANCH: three publishes to A leave B at one, not at four", async () => {
    const fx = await main();
    const api = await staff();
    expect(await api.staffVersion(db, fx.scopeA)).toBe(3);
    expect(await api.staffVersion(db, fx.scopeB)).toBe(1);
  });

  it("B2 serves each branch its OWN people and never the other branch's", async () => {
    // `01-F71` (d): the key is structured and per-tenant; `01-F76`: "a branch-scoped notice reaches
    // that branch's devices and no others", and under R25 "the roster's scope IS its credential
    // blast radius".
    const fx = await main();
    const api = await staff();
    const a = await api.staffPage(db, fx.scopeA, 0, 0);
    const b = await api.staffPage(db, fx.scopeB, 0, 0);
    expect(ids(a)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
    expect(ids(b)).toEqual([fx.sana]);
  });

  it("B3 treats one branch's version number as meaningless for another: A's v3 is not B's base", async () => {
    // "Two devices both at 'staff v7' hold different bytes when they are at different branches —
    // safe ONLY because the key travels with the number and is compared." A device holding branch
    // A's version 3 that asked branch B's artifact must not be handed a delta from a base B never
    // published; `01-F75`'s inherited rule sends "a delta only if it can construct one from that
    // exact base and a snapshot otherwise".
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeB, 3, 0);
    expect(page.form).toBe("snapshot");
    expect(ids(page)).toEqual([fx.sana]);
  });

  it("B4 keys the artifact STRUCTURALLY: ('X-ab','c') and ('X-a','bc') are different artifacts", async () => {
    // `01-F71` (d), quoted by `01-F76`: "`(\"ab\",\"c\")` and `(\"a\",\"bc\")` are distinct tenants
    // and a separator-less key maps both to one delivery set, which is a cross-tenant leak with no
    // error in it." The suffix keeps every id unique per run while the two concatenations collide.
    const api = await staff();
    const s = newId();
    const orgOne = `${s}ab`;
    const orgTwo = `${s}a`;
    const branchOne = `c${s}`;
    const branchTwo = `bc${s}`;
    expect(`${orgOne}${branchOne}`).toBe(`${orgTwo}${branchTwo}`);
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgOne, branchOne);
    await addBranch(orgTwo, branchTwo);
    const personOne = await addPerson({
      org_id: orgOne,
      display_name: "One Only",
      email: null,
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: branchOne }],
    });
    // A PIN hash of its own and never `password()`: `11-F21` makes the device-plane credential "a
    // SECOND credential beside the back-office password (`15-F26`), not the same one", and a fixture
    // that reuses one string for both quietly asserts the shape the FR refuses.
    await api.setPinCredential(db, {
      org_id: orgOne,
      user_id: personOne,
      pin_hash: await hashPin("3131"),
      now: T,
    });
    await api.publishStaffRoster(db, { org_id: orgOne, branch_id: branchOne }, [personOne], {
      now: T,
    });

    expect(await api.staffVersion(db, { org_id: orgTwo, branch_id: branchTwo })).toBe(0);
    const other = await api.staffPage(db, { org_id: orgTwo, branch_id: branchTwo }, 0, 0);
    expect(ids(other)).toEqual([]);
  });

  it("B5 keeps the roster and the catalog on separate version axes and out of each other's frames", async () => {
    // Trap 2: `CatalogEntryWire.kind` is open at the wire, so a `kind: "staff"` row would publish and
    // then make every catalog update in the org `malformed` (`01-F56`) — "a credential-blast-radius
    // change wearing a save". `01-F52` keeps the catalog ORG-scoped; `01-F76` keeps the roster
    // BRANCH-scoped; two resources, two axes, one connection.
    const fx = await main();
    const api = await staff();
    expect(await catalogVersion(db, fx.org)).toBe(0);

    const priced: CatalogEntry = {
      kind: "item",
      id: `item-${newId()}`,
      name: "Chicken Biryani",
      prices: [{ branch_id: fx.branchA, channel: "counter", price_paisa: 45_000 }],
    };
    const catalogV = await publishCatalog(db, fx.org, [priced], {
      now: T + 10,
      enabled: { branches: [fx.branchA], channels: ["counter"] },
    });
    expect(catalogV).toBe(1);

    // The roster's axis did not move, and neither artifact carries the other's rows.
    expect(await api.staffVersion(db, fx.scopeA)).toBe(3);
    const menu = await catalogPage(db, fx.org, 0, 0);
    const menuIds = menu.entries.map((entry) => entry.id);
    expect(menuIds).toEqual([priced.id]);
    for (const person of [fx.ayesha, fx.bilal, fx.hina, fx.danish]) {
      expect(menuIds).not.toContain(person);
    }
    const roster = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(ids(roster)).not.toContain(priced.id);
  });
});

/* ── §C snapshot, delta, and the fold (trap 8) ───────────────────────────────────────────────── */

describe("§C — `01-F75`: snapshot or delta, per key, from an actual publication log", () => {
  it("C1 answers a device at 0 with a folded SNAPSHOT of the whole roster, each member once", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(3);
    expect(page.complete).toBe(true);
    expect(ids(page)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
    // The fold, not the log: bilal was published at v1 AND at v3 and appears once.
    expect(page.entries.filter((entry) => entry.user_id === fx.bilal)).toHaveLength(1);
  });

  it("C2 answers a device at version 2 with a DELTA that is one member, not the roster", async () => {
    // The money assertion. "A delta from version A to B is `A < version <= B`" — only what changed
    // at v3 travels. An implementation that always answers a snapshot passes C1 and dies here.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 2, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(2);
    expect(page.version).toBe(3);
    expect(ids(page)).toEqual([fx.bilal]);
  });

  it("C3 answers a device at version 1 with the two members that changed after it", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 1, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(1);
    expect(page.version).toBe(3);
    expect(ids(page)).toEqual([fx.bilal, fx.danish].sort());
  });

  it("C4 answers a device already at the current version with an empty delta", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 3, 0);
    expect(page.form).toBe("delta");
    expect(page.base_version).toBe(3);
    expect(page.entries).toEqual([]);
  });

  it("C5 answers a base it never published — a device from the future — with a snapshot", async () => {
    // `catalog.ts`'s inherited rule: "A device claiming a version we never published gets a
    // snapshot, which is also what happens to a device from the future after a restore" (`22`).
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 99, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(3);
    expect(ids(page)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
  });

  it("C6 folds a HISTORICAL version: at v2 the departed member still reads `active`", async () => {
    // ⚠ TRAP 8 IN ONE ASSERTION. `kernel.users` is current state; the artifact is a publication log.
    // An implementation that reads current state answers `inactive` here and `inactive` at C7, and
    // is otherwise green. `at_version` is `01-F75`'s pinned continuation version — the field that
    // "makes a paged fetch atomic in the version dimension".
    const fx = await main();
    const api = await staff();
    const atTwo = await api.staffPage(db, fx.scopeA, 0, 0, 2);
    expect(atTwo.version).toBe(2);
    expect(ids(atTwo)).toEqual([fx.ayesha, fx.bilal, fx.danish, fx.hina].sort());
    expect(byId(atTwo, fx.bilal)?.status).toBe("active");

    const atOne = await api.staffPage(db, fx.scopeA, 0, 0, 1);
    expect(atOne.version).toBe(1);
    expect(ids(atOne)).toEqual([fx.ayesha, fx.bilal, fx.hina].sort());
    expect(byId(atOne, fx.danish)).toBeUndefined();
  });

  it("C7 folds the CURRENT version to the departed member's latest row", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(byId(page, fx.bilal)?.status).toBe("inactive");
  });

  it("C8 never serves a version from the future: an `at_version` beyond current is clamped", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0, 77);
    expect(page.version).toBe(3);
  });
});

/* ── §D the credential (11-F21, 11-F23) ──────────────────────────────────────────────────────── */

describe("§D — `11-F23`: the PIN hash lives in its own table and rides only an `active` entry", () => {
  it("D1 keeps the hash OFF the user row, so a login lookup cannot return what it does not join to", async () => {
    // `11-F23`'s whole argument: `services/api`'s login reads the user row by email, and on a ninth
    // column "would hold every logged-in owner's *cashiers'* PIN hashes in the memory of a request
    // that has no use for them. A separate table means the login lookup cannot return the credential
    // **because it does not join to it** — a structural bound rather than a discipline."
    const fx = await main();
    const rows = [
      ...(await db.execute(sql`select * from kernel.users where user_id = ${fx.bilal}`)),
    ];
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(fx.bilalPinHash);
    expect(Object.keys(row).filter((column) => /pin/i.test(column))).toEqual([]);
  });

  it("D2 carries an `active` member's hash into the artifact, unmodified, so a device can verify offline", async () => {
    // `01-F28` verifies "on-device against synced credential hashes"; `11-F21` makes the roster the
    // delivery ("a hash a device does not hold cannot be verified with the WAN down") and rules ONE
    // hashing declaration for both planes, so the bytes that arrive must verify with `domain`'s own
    // verifier. A publisher that re-hashed, truncated or re-encoded would produce "an offline
    // refusal of a credential the owner has just set".
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const entry = byId(page, fx.ayesha);
    expect(typeof entry?.pin_hash).toBe("string");
    expect(await verifyPin(entry?.pin_hash ?? "", fx.ayeshaPin)).toBe(true);
  });

  it("D3 carries NO hash on a non-`active` member — absent, not null", async () => {
    // "THE HASH IS CARRIED ONLY ON AN `active` ENTRY, AND THAT IS WHAT KEEPS THE BOUND A BOUND …
    // a hash on a non-`active` entry is a credential **no verifier can ever reach**: pure blast
    // radius with no function." `11-F23` makes that an ABSENCE rather than a NULL ("a table makes it
    // no row, and the publisher's `left join` produces the specified shape without a branch").
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const entry = byId(page, fx.bilal);
    expect(entry?.status).toBe("inactive");
    expect(Object.hasOwn(entry ?? {}, "pin_hash")).toBe(false);
  });

  it("D4 treats that missing hash as the SPECIFIED shape: the whole roster still serves", async () => {
    // `01-F75`: "A missing `pin_hash` on a non-`active` member is NOT `malformed`: it is the
    // specified shape, and a validator that refuses it is the stopped-till-through-a-validator" —
    // `01-F17` arriving through the identity path. So the page containing him is complete and still
    // carries everyone else.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(page.complete).toBe(true);
    expect(page.entries).toHaveLength(4);
    expect(byId(page, fx.bilal)?.display_name).toBe("Bilal Ahmed");
  });

  it("D5 never lets the PIN hash out through the people-listing reader", async () => {
    const fx = await main();
    const people = await listUsers(db, fx.org);
    expect(JSON.stringify(people)).not.toContain(fx.bilalPinHash);
  });

  it("D6 mints a NEW version for a PIN change, and the delta carries the new hash", async () => {
    // `01-F75`: "a write that changes an artifact **mints the next version** for each affected
    // `(resource, scope)` key". A PIN reset (`14-F14`) changes the artifact — a device that never
    // learns of it verifies against the old hash for ever, which is `14-F14`'s reset doing nothing.
    const api = await staff();
    const org = `org-pin-${newId()}`;
    const branch = `branch-pin-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const person = await addPerson({
      org_id: org,
      display_name: "Nadia Aslam",
      email: null,
      grid_ordinal: 5,
      assignments: [{ role: "cashier", branch_id: branch }],
    });
    await api.setPinCredential(db, {
      org_id: org,
      user_id: person,
      pin_hash: await hashPin("1010"),
      now: T,
    });
    expect(await api.publishStaffRoster(db, scope, [person], { now: T })).toBe(1);

    await api.setPinCredential(db, {
      org_id: org,
      user_id: person,
      pin_hash: await hashPin("2020"),
      now: T + 1,
    });
    expect(await api.publishStaffRoster(db, scope, [person], { now: T + 1 })).toBe(2);

    const delta = await api.staffPage(db, scope, 1, 0);
    expect(delta.form).toBe("delta");
    expect(ids(delta)).toEqual([person]);
    const hash = byId(delta, person)?.pin_hash ?? "";
    expect(await verifyPin(hash, "2020")).toBe(true);
    expect(await verifyPin(hash, "1010")).toBe(false);
  });
});

/* ── §E participation status (11-F22) ────────────────────────────────────────────────────────── */

describe("§E — `11-F22`: a participation status, closed at two, and a departure that still renders", () => {
  it("E1 keeps a departed member IN the artifact as a marked entry, never an absence", async () => {
    // R26 and `01-F75`: "A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE — the frame carries no
    // removals list, for any resource … A removals list collapses two different questions — *may she
    // act* and *does she render* — into one bit." Dropping her degrades "a past order, a reprint, a
    // shift report and `02-F23`'s reconciliation" to a raw UUID.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const entry = byId(page, fx.bilal);
    expect(entry).toBeDefined();
    expect(entry?.display_name).toBe("Bilal Ahmed");
    expect(entry?.status).toBe("inactive");
    // And the delta that carried the departure carried her ROW, not a removal instruction.
    const delta = await api.staffPage(db, fx.scopeA, 2, 0);
    expect(byId(delta, fx.bilal)?.display_name).toBe("Bilal Ahmed");
  });

  it("E2 accepts both statuses and refuses every other word", async () => {
    // "The statuses are `active` and `inactive`, and the set is closed at two … a wider vocabulary
    // is org policy nobody has ruled, and inventing one here would be inventing policy." This schema
    // validates closed sets at the WRITER (`schema.ts`: no CHECK constraints, "so a closed set has
    // exactly one interpretation").
    const org = `org-status-${newId()}`;
    const branch = `branch-status-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const assignments = [{ role: "cashier" as const, branch_id: branch }];

    await expect(
      addPerson({
        org_id: org,
        display_name: "Active One",
        grid_ordinal: 1,
        status: "active",
        assignments,
      }),
    ).resolves.toBeTruthy();
    await expect(
      addPerson({
        org_id: org,
        display_name: "Inactive One",
        grid_ordinal: 2,
        status: "inactive",
        assignments,
      }),
    ).resolves.toBeTruthy();

    // Each bad word gets its OWN ordinal, so that a word wrongly ACCEPTED fails on the status
    // assertion rather than on a `grid_ordinal` collision with the previously accepted one — a
    // refusal for a neighbouring reason reports the wrong debt.
    const rejected = ["suspended", "on_leave", "probation", "ACTIVE", ""];
    for (const [index, word] of rejected.entries()) {
      await expect(
        addPerson({
          org_id: org,
          display_name: `Bad ${word || "empty"}`,
          grid_ordinal: 10 + index,
          status: word,
          assignments,
        }),
      ).rejects.toThrow(/11-F22/);
    }
    // Refused means NOTHING WAS WRITTEN — `15-F27`'s writer discipline, not a warning.
    expect(await listUsers(db, org)).toHaveLength(2);
  });

  it("E3 refuses a person record with no status at all, rather than defaulting her to `active`", async () => {
    // `01-F75` makes the field "**required at the writer** … so nothing on the wire lacks it", and
    // `11-F22` refuses the default by name: an absent status is "not a licence to default an absent
    // status to `active`". ⚠ PINNED READING — that sentence is written about a DEVICE's older stored
    // rows; the alternative (default at the cloud writer) is named in the session's report.
    const org = `org-nostatus-${newId()}`;
    const branch = `branch-nostatus-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const row = {
      user_id: newId(),
      org_id: org,
      display_name: "No Status",
      email: `no-status-${newId()}@example.com`,
      password_hash: await password(),
      assignments: [{ role: "cashier", branch_id: branch }],
      grid_ordinal: 1,
      created_at: T,
    };
    await expect(insertUser(db, row as unknown as UserRow)).rejects.toThrow(/11-F22|01-F75/);
    expect(await listUsers(db, org)).toEqual([]);
  });
});

/* ── §F grid_ordinal (01-F61, trap 12) ───────────────────────────────────────────────────────── */

describe("§F — `01-F61`: an explicit `grid_ordinal`, unique within the artifact, with no derived tiebreak", () => {
  /** Two active people at one ordinal must never reach one artifact — whichever writer refuses. */
  const expectNoDuplicateOrdinals = (page: StaffPage): void => {
    const ordinals = page.entries.map((entry) => entry.grid_ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length);
  };

  it("F1 refuses two active members at one ordinal in ONE publish, and publishes neither", async () => {
    // `01-F75`: "`grid_ordinal` is unique **within the artifact** — `01-F61` bans a derived tiebreak
    // and a collision is precisely how one is reintroduced, which is the defect its first build
    // shipped." `listUsers` orders `grid_ordinal asc, user_id asc` today, so a collision falls back
    // to `user_id` — the exact derived ordering `01-F61` forbids.
    const api = await staff();
    const org = `org-ord1-${newId()}`;
    const branch = `branch-ord1-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    const one = await addPerson({
      org_id: org,
      display_name: "Ordinal One",
      grid_ordinal: 7,
      assignments,
    });
    // The second INSERT may itself be refused, because `01-F75` leaves "whether the cloud enforces
    // uniqueness more widely than [the artifact]" open — so the assertion is the invariant (nothing
    // published, nothing served with a duplicate) and not which layer says no. ⚠ Wherever it is
    // enforced, the refusal must NAME the FR: every refusal this service already writes does
    // (`publishCatalog`, `create-branch`, `revoke-device`), and a raw Postgres constraint message is
    // not a sentence an operator can act on — `insertUser`'s own doc comment says exactly that about
    // "duplicate key value violates unique constraint".
    const clash = addPerson({
      org_id: org,
      display_name: "Ordinal Two",
      grid_ordinal: 7,
      assignments,
    }).then(async (two) => {
      await api.publishStaffRoster(db, scope, [one, two], { now: T });
    });
    await expect(clash).rejects.toThrow(/01-F61|01-F75/);
    expect(await api.staffVersion(db, scope)).toBe(0);
  });

  it("F2 refuses a NEW member taking an ordinal an earlier version already gave someone", async () => {
    // The case a suite that publishes one roster twice cannot see (trap 12: "invisible to a test that
    // only re-renders the same roster, which is precisely how it survived review"). The collision is
    // between v1's member and v2's, so only a check against the FOLDED artifact catches it.
    const api = await staff();
    const org = `org-ord2-${newId()}`;
    const branch = `branch-ord2-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    const first = await addPerson({
      org_id: org,
      display_name: "Held Position",
      grid_ordinal: 3,
      assignments,
    });
    expect(await api.publishStaffRoster(db, scope, [first], { now: T })).toBe(1);

    const collide = addPerson({
      org_id: org,
      display_name: "New Hire",
      grid_ordinal: 3,
      assignments,
    }).then(async (second) => {
      await api.publishStaffRoster(db, scope, [second], { now: T + 1 });
    });
    await expect(collide).rejects.toThrow(/01-F61|01-F75/);
    expect(await api.staffVersion(db, scope)).toBe(1);
    expectNoDuplicateOrdinals(await api.staffPage(db, scope, 0, 0));
  });

  it("F3 accepts a REPUBLISH of the same people at the same positions — the over-strictness control", async () => {
    // ⚠ THE CONTROL, and it is why F1/F2 prove something rather than merely reddening. A writer that
    // refused any ordinal ALREADY PRESENT in the artifact — the one-character version of F1's and
    // F2's check — passes both refusals above and makes an ordinary republish impossible, which is
    // every version after the first (the main fixture's v2 and v3 are exactly this shape). It is
    // deliberately a republish and NOT a swap: whether an ordinal may be REASSIGNED is not stated by
    // any FR, so demanding a swap here would be inventing the answer (commandment 2).
    const api = await staff();
    const org = `org-ord3-${newId()}`;
    const branch = `branch-ord3-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const scope: StaffScope = { org_id: org, branch_id: branch };
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    const alpha = await addPerson({
      org_id: org,
      display_name: "Alpha",
      grid_ordinal: 1,
      assignments,
    });
    const beta = await addPerson({
      org_id: org,
      display_name: "Beta",
      grid_ordinal: 2,
      assignments,
    });
    expect(await api.publishStaffRoster(db, scope, [alpha, beta], { now: T })).toBe(1);

    // Re-publishing the SAME people at the SAME positions is an ordinary republish, not a collision.
    expect(await api.publishStaffRoster(db, scope, [alpha, beta], { now: T + 1 })).toBe(2);
    const page = await api.staffPage(db, scope, 0, 0);
    expect(page.entries).toHaveLength(2);
    expectNoDuplicateOrdinals(page);
    expect(byId(page, alpha)?.grid_ordinal).toBe(1);
    expect(byId(page, beta)?.grid_ordinal).toBe(2);
  });

  it("F4 holds the invariant across every version of the main fixture's artifact", async () => {
    const fx = await main();
    const api = await staff();
    for (const version of [1, 2, 3]) {
      expectNoDuplicateOrdinals(await api.staffPage(db, fx.scopeA, 0, 0, version));
    }
  });
});

/* ── §G assignments and the org boundary (01-F26, 01-F71) ────────────────────────────────────── */

describe("§G — `01-F26`/`01-F71`: an assignment names a branch of THAT org, or org-wide, or nothing", () => {
  it("G1 refuses an assignment naming a branch that belongs to another org", async () => {
    // `01-F71` (a): the matrix "refuses when the subject's org differs from the scope's, before any
    // action-specific reasoning"; `00 §5.4` makes org data isolation absolute. A user row whose
    // assignment names another org's branch is that boundary crossed in storage, and it is
    // `authorize.ts`'s `can()` subject for every write once the roster carries it.
    //
    // **It is refused HERE OR NOWHERE.** `kernel` carries no foreign key at all: `01-F68` bans one
    // from any LEDGER table outright and `schema.ts` extends the restraint to the directory's own
    // edges as a stated interpretation ("`device_registry.branch_id` does not reference
    // `branches`"). So Postgres cannot answer this, and `15-F27` already puts exactly this
    // completeness rule at this writer — `create-branch` refuses a branch under an unnamed org.
    // ⚠ PLACEMENT IS A READING: it could instead sit in step 4's procedure. `18 §4` makes this
    // service the ONE writer of `kernel.users`, and a check in one caller leaves every other caller
    // unguarded, which is `03-F40`'s two-interpretations defect on the isolation boundary.
    const orgOne = `org-g1a-${newId()}`;
    const orgTwo = `org-g1b-${newId()}`;
    const branchTwo = `branch-g1b-${newId()}`;
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgTwo, branchTwo);
    await expect(
      addPerson({
        org_id: orgOne,
        display_name: "Wrong Org",
        grid_ordinal: 1,
        assignments: [{ role: "cashier", branch_id: branchTwo }],
      }),
    ).rejects.toThrow(/01-F26|01-F71/);
    expect(await listUsers(db, orgOne)).toEqual([]);
  });

  it("G2 refuses an assignment naming a branch no record names at all", async () => {
    const org = `org-g2-${newId()}`;
    await addOrg(org);
    await expect(
      addPerson({
        org_id: org,
        display_name: "Ghost Branch",
        grid_ordinal: 1,
        assignments: [{ role: "cashier", branch_id: `branch-never-created-${newId()}` }],
      }),
    ).rejects.toThrow(/01-F26|01-F71/);
    expect(await listUsers(db, org)).toEqual([]);
  });

  it("G3 accepts a null branch, which is `01-F26`'s org-wide assignment", async () => {
    // "`01-F26`'s assignment is per-**location** and its null location is org-wide, which is how
    // every owner is stored today" (`01-F76`). Refusing null would make an owner unstorable.
    const org = `org-g3-${newId()}`;
    const branch = `branch-g3-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    await expect(
      addPerson({
        org_id: org,
        display_name: "Org Wide",
        grid_ordinal: 1,
        assignments: [{ role: "owner", branch_id: null }],
      }),
    ).resolves.toBeTruthy();
    // Control: a branch of her own org is accepted too, so G1/G2 are about the ORG and not about
    // assignments in general.
    await expect(
      addPerson({
        org_id: org,
        display_name: "Own Branch",
        grid_ordinal: 2,
        assignments: [{ role: "cashier", branch_id: branch }],
      }),
    ).resolves.toBeTruthy();
  });

  it("G4 refuses to publish another ORG's person into this org's artifact", async () => {
    // `01-F71`: the isolation boundary is the org, fail-closed. A cross-org publish would put one
    // tenant's Argon2id credential onto another tenant's till — R25's blast radius, crossed.
    // (Which people of the OWN org a branch artifact contains is `01 §9.7` and is not asserted.)
    const api = await staff();
    const orgOne = `org-g4a-${newId()}`;
    const orgTwo = `org-g4b-${newId()}`;
    const branchOne = `branch-g4a-${newId()}`;
    const branchTwo = `branch-g4b-${newId()}`;
    await addOrg(orgOne);
    await addOrg(orgTwo);
    await addBranch(orgOne, branchOne);
    await addBranch(orgTwo, branchTwo);
    const stranger = await addPerson({
      org_id: orgTwo,
      display_name: "Another Tenant",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: branchTwo }],
    });
    await expect(
      api.publishStaffRoster(db, { org_id: orgOne, branch_id: branchOne }, [stranger], { now: T }),
    ).rejects.toThrow(/01-F71|01-F26/);
    expect(await api.staffVersion(db, { org_id: orgOne, branch_id: branchOne })).toBe(0);
  });

  it("G5 refuses to publish the roster at ORG scope, because R25 makes it branch-scoped", async () => {
    // `01-F76`: "The staff roster is BRANCH-scoped, and the reason is the credential … its scope is
    // its blast radius: an unrevoked device holds the credentials of everyone in its delivery scope,
    // and branch scope is the half of that cost which can be bought down." An org-scoped roster
    // hands every device in the org every branch's hashes, silently.
    const api = await staff();
    const org = `org-g5-${newId()}`;
    const branch = `branch-g5-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const person = await addPerson({
      org_id: org,
      display_name: "Branch Only",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: branch }],
    });
    await expect(
      api.publishStaffRoster(db, { org_id: org, branch_id: null }, [person], { now: T }),
    ).rejects.toThrow(/01-F76|R25/);
  });
});

/* ── §H email (R30) ──────────────────────────────────────────────────────────────────────────── */

describe("§H — R30: a till-only cashier has no email, and the index survives unchanged", () => {
  it("H1 stores a person with no email and reads her back as NULL, not as the word 'null'", async () => {
    // R30: "a cashier who only uses the till needs NO email … an owner made to supply one puts a
    // wrong address permanently into a directory `11-F20` never deletes from." `listUsers` today is
    // `email: String(row.email)`, which turns a null into the four-letter string.
    const fx = await main();
    const people = await listUsers(db, fx.org);
    const ayesha = people.find((person) => person.user_id === fx.ayesha);
    expect(ayesha?.email).toBeNull();
  });

  it("H2 stores TWO till-only people in one org, because Postgres permits multiple NULLs", async () => {
    // R30's own named consequence: "Postgres permits multiple NULLs in a unique index, so the index
    // survives unchanged." Most restaurants are mostly till-only staff, so this is the normal case
    // and not an edge one.
    const org = `org-h2-${newId()}`;
    const branch = `branch-h2-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    await addPerson({
      org_id: org,
      display_name: "Till Only A",
      email: null,
      grid_ordinal: 1,
      assignments,
    });
    await addPerson({
      org_id: org,
      display_name: "Till Only B",
      email: null,
      grid_ordinal: 2,
      assignments,
    });
    expect(await listUsers(db, org)).toHaveLength(2);
  });

  it("H3 still refuses two people sharing one email, case-folded", async () => {
    // R30 removes "the requirement to *have* an address, not the rule about two people sharing one"
    // (`11 §9.6`), and `28 §9.18`'s global-uniqueness rule is untouched. A migration that dropped the
    // index to make nulls work would satisfy H1 and H2 and break the login lookup's uniqueness.
    const org = `org-h3-${newId()}`;
    const branch = `branch-h3-${newId()}`;
    await addOrg(org);
    await addBranch(org, branch);
    const shared = `shared-${newId()}@example.com`;
    const assignments = [{ role: "cashier" as const, branch_id: branch }];
    await addPerson({
      org_id: org,
      display_name: "First Claim",
      email: shared,
      grid_ordinal: 1,
      assignments,
    });
    const second = await insertUser(db, {
      user_id: newId(),
      org_id: org,
      display_name: "Second Claim",
      email: shared.toUpperCase(),
      password_hash: await password(),
      assignments,
      grid_ordinal: 2,
      status: "active",
      created_at: T,
    } as unknown as UserRow);
    expect(second).toBe(false);
    expect(await listUsers(db, org)).toHaveLength(1);
  });
});

/* ── §I the row `01-F75` declares ────────────────────────────────────────────────────────────── */

describe("§I — `01-F75`'s `staff` row, which is what a golden fixture will be written against", () => {
  it("I1 carries user_id, display_name, grid_ordinal, status and assignments on every entry", async () => {
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(page.entries).toHaveLength(4);
    for (const entry of page.entries) {
      expect(typeof entry.user_id).toBe("string");
      expect(typeof entry.grid_ordinal).toBe("number");
      expect(["active", "inactive"]).toContain(entry.status);
      expect(Array.isArray(entry.assignments)).toBe(true);
    }
  });

  it("I2 requires `display_name` on the wire, and it is the person's ONE name", async () => {
    // `01-F75`: "`display_name`, **required on the wire** (`11-F20` makes the name required on the
    // one record both planes read — the device type's optionality is a migration artifact … and it
    // is not a wire rule)". `11-F20`: the device projection "may not hold a name the cloud record
    // does not", so the entry's name is the stored one and never a re-derivation.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    const stored = new Map(
      (await listUsers(db, fx.org)).map((person) => [person.user_id, person.display_name]),
    );
    for (const entry of page.entries) {
      expect(typeof entry.display_name).toBe("string");
      expect(entry.display_name.length).toBeGreaterThan(0);
      expect(entry.display_name).toBe(stored.get(entry.user_id));
    }
  });

  it("I3 carries a single-branch member's assignment — the one case §9.7 cannot change", async () => {
    // `01-F75` puts `assignments` (`01-F26`) on the row. Whether a row carries ALL of a person's
    // assignments or only this artifact's is `01 §9.7` and is OPEN — for a person with exactly one
    // assignment, to this branch, both readings give the same answer, which is why this is the only
    // assignment assertion in this file.
    const fx = await main();
    const api = await staff();
    const page = await api.staffPage(db, fx.scopeA, 0, 0);
    expect(byId(page, fx.hina)?.assignments).toEqual([
      { role: "branch_manager", branch_id: fx.branchA },
    ]);
    expect(byId(page, fx.ayesha)?.assignments).toEqual([
      { role: "cashier", branch_id: fx.branchA },
    ]);
  });
});
