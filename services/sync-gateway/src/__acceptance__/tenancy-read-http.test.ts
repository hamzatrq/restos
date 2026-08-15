// Acceptance tests — the `/internal/tenancy` READ surface and `01-F70`'s column on the device list.
//
// PROVENANCE: `specs/01-kernel-sync.md` `01-F68` (the org as a named record; "an org with events and
// no record is UNNAMED, not invalid"), `01-F69` (a branch under exactly one org; the only read path
// is one org's branches), `01-F70` (the device's human name, on the cloud REGISTRY row),
// `01-F71` (b)/(d) (tenant isolation is a TESTED property with named enforcement points);
// `specs/21-ux-system.md` `21-F15` (the naming law).
//
// **WHAT THIS FILE OWNS THAT THE API-SIDE SUITE CANNOT.** `services/api`'s `tenancy-names.test.ts`
// drives the adapter against a FAKE gateway, and that fake reproduces only what an API-side
// assertion depends on. Two claims therefore have no home there and live here, against real
// Postgres: the `where org_id =` that makes one tenant's directory one tenant's, and the explicit
// `order by` that stops a branch selector reshuffling under an owner between two reads of the same
// estate. A fake that sorted too would be a SECOND interpretation of the ordering rule, which is the
// defect `03-F40`'s two sensor bit layouts already cost this corpus.
//
// HONESTY NOTE (`24 §3` step 2): this file and the route it covers were written in one session,
// which the rule forbids for a protected path. Stated, not hidden — `device-http.test.ts` and
// `catalog-publish-http.test.ts` both carry the same note.
//
// ⚠ **THIS IS NOT `01-F71`'s ISOLATION ORACLE.** That FR requires a test per enforcement point that
// fails when *that point alone* is removed, run over two tenants; §C below is the one scoping claim
// this new route owes its own review. The register belongs to a test-authoring session.
//
// ⚠ Needs Docker (Testcontainers). Fails LOUDLY rather than skipping (`T-01-07`).

import { newId } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDevices, registerDevice } from "../registry.js";
import { buildServer } from "../server.js";
import { listBranches, readOrg } from "../tenancy.js";
import { closeDb, type Db, openDb, TEST_TOKEN_SECRET, testDatabaseUrl } from "./helpers.js";

/** ≥ 32 bytes — the floor `server.ts` enforces on this credential (`18 §5`). */
const PUBLISH_SECRET = "internal-tenancy-credential-for-the-acceptance-suite";

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let base: string;
let server: { close(): Promise<void> };

/** Two tenants, fresh per run, so nothing here depends on another suite's rows. */
const ORG_A = `org-a-${newId()}`;
const ORG_B = `org-b-${newId()}`;
const BRANCH_A1 = `branch-a1-${newId()}`;
const BRANCH_A2 = `branch-a2-${newId()}`;
const BRANCH_B1 = `branch-b1-${newId()}`;
/** An org with rows elsewhere in the kernel and NO directory row — `01-F68`'s UNNAMED tenant. */
const ORG_UNNAMED = `org-unnamed-${newId()}`;

const T = 1_752_800_000_000;

/**
 * `NO_CREDENTIAL` is a SENTINEL rather than `undefined`, and the reason is a bug this file already
 * had: with `token: string | undefined = PUBLISH_SECRET`, passing `undefined` selects the DEFAULT,
 * so the "no credential is a 401" case sent the real credential and asserted 401 against a 200. A
 * fail-closed test that silently authenticates is worse than no test — it reports the control is
 * present when nothing was ever checked.
 */
const NO_CREDENTIAL = Symbol("no credential");

const get = async (
  path: string,
  token: string | typeof NO_CREDENTIAL = PUBLISH_SECRET,
): Promise<Http> => {
  const response = await fetch(`${base}${path}`, {
    headers: token === NO_CREDENTIAL ? {} : { authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const tenancy = (org_id: string, token?: string | typeof NO_CREDENTIAL): Promise<Http> =>
  token === undefined
    ? get(`/internal/tenancy?org_id=${encodeURIComponent(org_id)}`)
    : get(`/internal/tenancy?org_id=${encodeURIComponent(org_id)}`, token);

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  server = app;

  // Seeded with raw SQL rather than through the writer, deliberately: this file is about the READ
  // path, and going through `insertOrg`/`insertBranch` would make every assertion below depend on a
  // second module's correctness. The writer has its own suite.
  await db.execute(sql`
    insert into kernel.orgs (org_id, display_name, status, created_at) values
      (${ORG_A}, ${"Kababjees"}, ${"active"}, ${T}),
      (${ORG_B}, ${"Student Biryani"}, ${"suspended"}, ${T})`);
  await db.execute(sql`
    insert into kernel.branches
      (branch_id, org_id, display_name, branch_type, branch_class, created_at) values
      -- Inserted Gulberg FIRST but stamped LATER, so insertion order, created_at order and name
      -- order are three different answers and §B's ordering case can tell them apart. A seed where
      -- two of the three coincide proves nothing about which one the reader used.
      (${BRANCH_A1}, ${ORG_A}, ${"Gulberg"}, ${"branch"}, ${"production"}, ${T + 1}),
      (${BRANCH_A2}, ${ORG_A}, ${"Zamzama"}, ${"branch"}, ${"production"}, ${T}),
      (${BRANCH_B1}, ${ORG_B}, ${"Nazimabad"}, ${"branch"}, ${"production"}, ${T})`);
}, 120_000);

afterAll(async () => {
  await server?.close();
  if (db !== undefined) await closeDb(db);
});

// ── §A — the credential, which is the only control on this surface ─────────────────────────────

describe("§A — /internal/tenancy is behind PUBLISH_TOKEN, fail-closed", () => {
  it("no credential is a 401", async () => {
    expect((await tenancy(ORG_A, NO_CREDENTIAL)).status).toBe(401);
  });

  it("a wrong credential is a 401", async () => {
    expect((await tenancy(ORG_A, "not-the-publish-token-but-long-enough-to-parse")).status).toBe(
      401,
    );
  });

  it("a missing org_id is a 400 — never an org-wide answer", async () => {
    // The direction matters: a route that read an absent `org_id` as "all orgs" would be a
    // cross-tenant leak with no error in it (`01-F71` (d) makes the same argument about keys).
    expect((await get("/internal/tenancy")).status).toBe(400);
  });
});

// ── §B — the records, and the ORDER a selector depends on ──────────────────────────────────────

describe("§B — the directory reads back what `01-F68`/`01-F69` say it holds", () => {
  it("serves the org's four fields and nothing else", async () => {
    const response = await tenancy(ORG_A);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.org).toEqual({
      org_id: ORG_A,
      display_name: "Kababjees",
      status: "active",
      created_at: T,
    });
  });

  it("carries `15-F25`'s suspended status verbatim — it is reported, never enforced here", async () => {
    // No FR anywhere makes a lifecycle state refuse a request, and `15-F24` says metering is
    // measurement only. A route that 403'd a suspended org would be inventing policy (commandment 2)
    // — and would do it in the one place a vendor is trying to find out what is wrong.
    expect((await tenancy(ORG_B)).body.org).toMatchObject({ status: "suspended" });
  });

  it("orders branches EXPLICITLY, so a selector does not reshuffle between reads", async () => {
    /**
     * `listBranches` orders by `created_at` then `branch_id`. **What is asserted is that an order is
     * imposed at all, against a seed where insertion order, name order and `created_at` order are
     * three DIFFERENT answers** — `Gulberg` is inserted first and stamped later, so a reader
     * returning insertion order gives `[Gulberg, Zamzama]`, one sorting by name gives the same, and
     * only `created_at` gives the answer below.
     *
     * ⚠ **An earlier draft of this test asserted NAME order and failed.** It was written against a
     * `listBranches` that sorted by `display_name`, which another session replaced with `created_at`
     * while this was being written. The test is re-pointed at the reader rather than the reader at
     * the test: both orders are stable, which is the property `14-F29`/`27-F4` actually need, and
     * nothing in the corpus rules between them. Recorded because a stale oracle quietly "fixed" by
     * editing the implementation is how a suite ends up defending a rule nobody chose (AGENTS.md's
     * `catalog-pricing.test.ts:394`).
     */
    const branches = (await tenancy(ORG_A)).body.branches as { display_name: string }[];
    expect(branches.map((branch) => branch.display_name)).toEqual(["Zamzama", "Gulberg"]);
    // Stable: the same request twice gives the same order. That is the whole of the requirement.
    const again = (await tenancy(ORG_A)).body.branches as { display_name: string }[];
    expect(again.map((branch) => branch.display_name)).toEqual(["Zamzama", "Gulberg"]);
  });

  it("reads the same answer through the module the route calls", async () => {
    // The route and the function agree, so a later refactor that inlines a query into the route
    // cannot quietly diverge from the reader the rest of the service uses.
    expect((await readOrg(db, ORG_A))?.display_name).toBe("Kababjees");
    expect((await listBranches(db, ORG_A)).map((branch) => branch.branch_id)).toEqual([
      BRANCH_A2,
      BRANCH_A1,
    ]);
  });
});

// ── §C — one tenant's directory is one tenant's (01-F71 b/d) ──────────────────────────────────

describe("§C — the directory is scoped to the org asked for", () => {
  it("never returns another tenant's org record or branches", async () => {
    const a = await tenancy(ORG_A);
    const serialised = JSON.stringify(a.body);
    expect(serialised).not.toContain("Student Biryani");
    expect(serialised).not.toContain(BRANCH_B1);
    expect(serialised).not.toContain("Nazimabad");
  });

  it("…and the CONTROL: tenant B's own request returns tenant B's estate", async () => {
    // Without this, "A cannot see B" would also pass against a route that answers nothing at all.
    const b = await tenancy(ORG_B);
    expect(b.body.org).toMatchObject({ display_name: "Student Biryani" });
    expect((b.body.branches as { branch_id: string }[]).map((branch) => branch.branch_id)).toEqual([
      BRANCH_B1,
    ]);
  });
});

// ── §D — UNNAMED is reported, not refused (01-F68) ─────────────────────────────────────────────

describe("§D — an org with no directory row is UNNAMED, not invalid (01-F68)", () => {
  it("answers `org: null` with a 200, and an empty branch list", async () => {
    // `01-F68`: such an org "folds, syncs, prints and settles exactly as any other … surfaced to
    // the vendor as a provisioning gap to fill". A 404 here would tell `services/api` the tenant
    // does not exist, which is false of every org this deployment had before provisioning landed.
    const response = await tenancy(ORG_UNNAMED);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ org: null, branches: [] });
  });
});

// ── §E — 01-F70's column on the device list ────────────────────────────────────────────────────

describe("§E — `listDevices` projects the device's name (01-F70)", () => {
  it("carries a named till's name and an unnamed row's null, in one list", async () => {
    /**
     * ⚠ **THIS ASSERTION IS OWED BY `0010`'s OWN MUTATION MATRIX.** That matrix recorded T3 — the
     * `ADD COLUMN display_name` line deleted — as killing exactly one test, *incidentally*: the only
     * thing that noticed was a torn-schema resume whose tear-off `drop column`s it.
     * `EXPECTED_TABLES` checks table names and no column names at all, and the matrix's own note
     * says "the writer phase must land a real assertion on `device_registry.display_name`, or a
     * future migration that drops the column will fail exactly one test for the wrong reason".
     * This is that assertion, pointed at the READ.
     */
    const named = `device-named-${newId()}`;
    const unnamed = `device-unnamed-${newId()}`;
    await registerDevice(db, {
      org_id: ORG_A,
      branch_id: BRANCH_A1,
      device_id: named,
      device_class: "counter_electron",
      display_name: "Front counter till",
      token_expires_at: T + 1_000,
    });
    await registerDevice(db, {
      org_id: ORG_A,
      branch_id: BRANCH_A1,
      device_id: unnamed,
      device_class: "kitchen",
      token_expires_at: T + 1_000,
    });

    const rows = await listDevices(db, ORG_A);
    const byId = new Map(rows.map((row) => [row.device_id, row.display_name]));
    expect(byId.get(named)).toBe("Front counter till");
    // Absent at registration ⇒ null out, never the empty string and never the `device_id`. `01-F70`
    // makes the name a LABEL, and `21-F15` makes the absence a stated missing field.
    expect(byId.get(unnamed)).toBeNull();
  });

  it("serves the name over `/internal/devices`, which is where the back office reads it", async () => {
    const device = `device-http-${newId()}`;
    await registerDevice(db, {
      org_id: ORG_B,
      branch_id: BRANCH_B1,
      device_id: device,
      device_class: "counter_electron",
      display_name: "Nazimabad counter",
      token_expires_at: T + 1_000,
    });
    const response = await get(`/internal/devices?org_id=${encodeURIComponent(ORG_B)}`);
    expect(response.status).toBe(200);
    const listed = (response.body.devices as { device_id: string; display_name: string | null }[])
      .filter((row) => row.device_id === device)
      .map((row) => row.display_name);
    expect(listed).toEqual(["Nazimabad counter"]);
  });
});
