/**
 * **`14-F14`'s USER CRUD AS THE CLOUD WRITER CAN EXPRESS IT — the `/internal/users*` routes.**
 *
 * AUTHORSHIP: authored from spec text ONLY, by a session that wrote no implementation and read no
 * implementation plan for this step (`24 §3`). Every policy below cites an FR that resolves
 * (`grep -arn "14-F14" specs/`).
 *
 * PROVENANCE — read verbatim, not from memory:
 *   · `14-F14` (`specs/14-backoffice.md:103`) — "User CRUD with role × per-location assignment;
 *     … PIN set/reset (never displayed; Argon2id per 00 §5.4); deactivation preserves historical
 *     attribution."
 *   · `14-F39` — `user.manage`, owner-only; "`01-F71` still binds underneath it".
 *   · `11-F20` — the person record: one required name, never deleted; `11-F21` — the cloud holds an
 *     Argon2id PIN HASH and "it is never a PIN"; `11-F22` — participation is per-(person, branch);
 *     `11-F23` + founder ruling R32 — the credential row is DELETED when she stops being `active`,
 *     keyed to the LAST active assignment and never to one branch's, in ONE unit of work.
 *   · `01-F61` — an explicit `grid_ordinal`, never derived; new members append.
 *   · `01-F75` — "a write that changes an artifact **mints the next version** for each affected
 *     `(resource, scope)` key"; `01-F76` — the staff artifact is `(staff, {org, branch})`;
 *     `01-F78` — a branch roster holds every person whose assignment REACHES that branch, so an
 *     org-wide person is in EVERY branch's artifact.
 *   · `01-F71` — the org is taken from the authenticated subject and never from the request; a
 *     request for another tenant's key is "REFUSED as an auth failure, never clamped".
 *   · Founder ruling R30 (`specs/11-staff-people.md:197`) — a till-only cashier needs NO email.
 *
 * ── ⚠ WHAT THIS SUITE IS FOR, AND IT IS NOT "DOES THE SCHEMA PARSE" ─────────────────────────────
 *
 * `01-F4` makes an unschema'd type unemittable; this repo's recorded failure is the mirror image —
 * `audit.print_acknowledged` sat in the registry with **nothing emitting it**, and `seams:check` is
 * blind to that by construction ("a key in an object literal is not an export"). So nothing below
 * asserts that a shape validates. Every assertion is that performing an ACT changes the STORE that
 * a till reads: a person appears, a hash verifies, a credential is gone, a version moves.
 *
 * The same rule governs the three storage writers this surface is the first caller of.
 * `services/sync-gateway/src/staff.ts` carries `@unreached-owed NO SHIPPING CALLER REACHES THIS
 * MODULE YET`, naming `14-F14`'s routes as what closes it — `publishStaffRoster`,
 * `setPinCredential` and `setUserStatus` are correct, tested and unreachable today, which is
 * AGENTS.md's recurring defect in its purest form. **A route that writes `kernel.users` and never
 * publishes leaves every till verifying against the old hash for ever** (`01-F75`'s producer
 * clause, quoted at `publishStaffRoster`), so §F is not a nicety: it is the only section that can
 * tell a landed CRUD from a decorative one.
 *
 * ── CONTRACTED SURFACE (binding on the implementation session) ──────────────────────────────────
 *
 * The corpus decides the ACTS and the POLICY; it does not name routes. These names are pinned by
 * this oracle, following the shipped `/internal/devices` + `/internal/devices/revoke` precedent
 * (`services/sync-gateway/src/publish-http.ts`), and they are **contestable** — change them here
 * and in `services/api`'s adapter together, never in one place.
 *
 *   POST /internal/users
 *        { org_id, display_name, email: string|null, assignments: [{role, branch_id}],
 *          now, actor_user_id: string|null }                      → 200 { user_id, grid_ordinal }
 *   POST /internal/users/assignments
 *        { org_id, user_id, assignments: [{role, branch_id}], now, actor_user_id }        → 200 {}
 *   POST /internal/users/pin
 *        { org_id, user_id, pin_hash, now, actor_user_id }                                → 200 {}
 *   POST /internal/users/status
 *        { org_id, user_id, branch_id: string|null, status, now, actor_user_id }          → 200 {}
 *   GET  /internal/users?org_id=…                                        → 200 { users: [ … ] }
 *
 * Four things about that list are NOT arbitrary and are argued rather than assumed:
 *
 *   (1) **`user_id` and `grid_ordinal` are minted by the WRITER and returned**, never supplied by
 *       the caller. `01-F61` says new members APPEND and bans a derived tiebreak; only the writer
 *       can read the org's current maximum and append to it in the same transaction, and two owners
 *       in two browser tabs supplying their own would collide — which is exactly how the derived
 *       tiebreak `01-F61` forbids gets reintroduced (`listUsers` falls back to `user_id asc`).
 *   (2) **`/internal/users/pin` takes `pin_hash` and never `pin`.** `11-F21`: "a PIN exists in
 *       exactly two places … the keypad it is typed on and the argument to a verify call", and
 *       `setPinCredential`'s own header puts the hashing at the caller so no second Argon2id call
 *       site is created. The plaintext therefore stops at `services/api`.
 *   (3) **`now` is the CALLER's instant**, as `/internal/catalog/publish` already takes it and for
 *       that route's recorded reason: one act must not be split into two instants.
 *   (4) **NO `user.changed` IS EMITTED HERE.** A service credential is not a person: this surface
 *       has no authenticated user, and `revoke-device.ts`/`tenancy.ts` both record that an
 *       unattributed record in an append-only store "is worse than none because it reads like one".
 *       `01-F62` and T-01-09 put the emission on the doc-14 emitter, which is `services/api` — the
 *       same split `device.revoked` already ships. Asserted in `services/api`'s `users.test.ts`.
 *
 * ── WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT (commandment 2) ────────────────────────────────
 *
 *   · **The `user.changed` payload's content.** `specs/14-backoffice.md` §9.11 records it as open
 *     on one axis (which acts are distinguishable, whether the before-state rides it). An oracle
 *     that pinned it would decide a question the corpus left to a founder.
 *   · **`01-F26`'s per-user permission overrides.** `14-F14` lists them; nothing models them and no
 *     FR states their shape (`packages/sync-client/src/staff.ts:25-27`). This is a partial `14-F14`.
 *   · **`01-F61`'s 05:00 boundary.** `01-F75` specifies no scheduling field and §9.5 is open; a
 *     publish reaching the writer is a publish happening now.
 *   · **Whether a status write and its publish share ONE database transaction.**
 *     `publishStaffRoster`'s header measures that the tempting order — `setUserStatus` then
 *     `publishStaffRoster` inside one caller transaction — deadlocks 8 of 8 rounds (`40P01`)
 *     against 0 of 8 in separate ones. It is LIVENESS, not correctness, and it is unassertable from
 *     outside without also pinning the publisher's change set, which is the implementer's. §H
 *     probes the observable half and says plainly where its bite stops.
 */

import { hashPin, newId, verifyPin } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { staffPage, staffVersion } from "../staff.js";
import { insertBranch, insertOrg, listUsers } from "../tenancy.js";
import { BASE_T, closeDb, type Db, openDb, TEST_TOKEN_SECRET, testDatabaseUrl } from "./helpers.js";

/** ≥ 32 bytes — the floor `server.ts` enforces on this credential (`18 §5`). */
const PUBLISH_SECRET = "internal-user-crud-credential-for-the-acceptance-suite";

const OWNER_ACTOR = "actor-owner-user-crud";

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let base: string;
let unconfigured: string;
let servers: { close(): Promise<void> }[];

const call = async (
  origin: string,
  method: "GET" | "POST",
  path: string,
  init: { token?: string | undefined; body?: unknown } = {},
): Promise<Http> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

/* ── the contracted routes, wrapped once so a rename is one edit ─────────────────────────────── */

type AssignmentInput = { role: string; branch_id: string | null };

const createOverHttp = (
  body: {
    org_id: string;
    display_name: string;
    email: string | null;
    assignments: readonly AssignmentInput[];
  },
  token = PUBLISH_SECRET,
): Promise<Http> =>
  call(base, "POST", "/internal/users", {
    token,
    body: { ...body, now: BASE_T, actor_user_id: OWNER_ACTOR },
  });

const setAssignmentsOverHttp = (body: {
  org_id: string;
  user_id: string;
  assignments: readonly AssignmentInput[];
}): Promise<Http> =>
  call(base, "POST", "/internal/users/assignments", {
    token: PUBLISH_SECRET,
    body: { ...body, now: BASE_T, actor_user_id: OWNER_ACTOR },
  });

const setPinOverHttp = (body: {
  org_id: string;
  user_id: string;
  pin_hash: string;
}): Promise<Http> =>
  call(base, "POST", "/internal/users/pin", {
    token: PUBLISH_SECRET,
    body: { ...body, now: BASE_T, actor_user_id: OWNER_ACTOR },
  });

const setStatusOverHttp = (body: {
  org_id: string;
  user_id: string;
  branch_id: string | null;
  status: string;
}): Promise<Http> =>
  call(base, "POST", "/internal/users/status", {
    token: PUBLISH_SECRET,
    body: { ...body, now: BASE_T, actor_user_id: OWNER_ACTOR },
  });

const listOverHttp = (org_id: string, token = PUBLISH_SECRET): Promise<Http> =>
  call(base, "GET", `/internal/users?org_id=${encodeURIComponent(org_id)}`, { token });

/* ── fixtures ────────────────────────────────────────────────────────────────────────────────── */

/**
 * `createOverHttp` that FAILS by name rather than returning a status nobody reads. Every §B..§G
 * assertion is about what a created person's row and artifact look like, and every one of them
 * passes vacuously against a person who was never created — the "guard never pointed at the
 * dangerous case" pattern the round-3 law exists to catch.
 */
/**
 * A REFUSAL BY THE WRITER, and never a 404.
 *
 * ⚠ Every refusal assertion below passes against a service that has no such route at all — a
 * status of 404 is `>= 400` and nothing was written because nothing exists. That is the vacuity
 * this repo's round-3 law names ("a guard that was never pointed at the dangerous case"), and it
 * would leave five of the sharpest tests here contributing nothing to either red or green. So the
 * shape is asserted: the route answered, and it said no.
 *
 * `< 500` is not asserted, deliberately. `refusalStatus` maps `RangeError` to 400 and everything
 * else to 500, so which class a given refusal lands in depends on where the implementer puts the
 * check — a route-level `safeParse` (400) or a writer's `RangeError` (400) or a ZodError escaping
 * `PersonRecord.parse` (500). All three are refusals that wrote nothing, which is the property.
 */
const refusedByTheWriter = (reply: Http, what: string): void => {
  expect(
    reply.status,
    `${what}: expected a refusal, got ${reply.status} ${JSON.stringify(reply.body)}`,
  ).toBeGreaterThanOrEqual(400);
  expect(
    reply.status,
    `${what}: 404 means the ROUTE does not exist, so nothing refused anything — this assertion ` +
      "is about the writer's refusal and is vacuous against a missing surface",
  ).not.toBe(404);
};

const mustCreate = async (body: {
  org_id: string;
  display_name: string;
  email: string | null;
  assignments: readonly AssignmentInput[];
}): Promise<{ user_id: string; grid_ordinal: number }> => {
  const reply = await createOverHttp(body);
  if (reply.status !== 200) {
    throw new Error(
      `fixture: POST /internal/users refused ${body.display_name} with ${reply.status} — ` +
        `${JSON.stringify(reply.body)}. 14-F14's create is the first act of this surface; every ` +
        "assertion below is about a person it was supposed to have written.",
    );
  }
  const { user_id, grid_ordinal } = reply.body as { user_id?: unknown; grid_ordinal?: unknown };
  if (typeof user_id !== "string" || typeof grid_ordinal !== "number") {
    throw new Error(
      "POST /internal/users answered 200 without { user_id, grid_ordinal }. The writer mints " +
        "both (01-F61: new members APPEND and the ordinal is explicit, never derived), so the " +
        `caller has no other way to learn them. Got ${JSON.stringify(reply.body)}`,
    );
  }
  return { user_id, grid_ordinal };
};

type Org = { org_id: string; branchA: string; branchB: string };

const freshOrg = async (): Promise<Org> => {
  const org_id = `org-crud-${newId()}`;
  const branchA = `branch-a-${newId()}`;
  const branchB = `branch-b-${newId()}`;
  await insertOrg(db, {
    org_id,
    display_name: `Org ${org_id.slice(0, 12)}`,
    status: "active",
    created_at: BASE_T,
  });
  for (const branch_id of [branchA, branchB]) {
    await insertBranch(db, {
      branch_id,
      org_id,
      display_name: `Branch ${branch_id.slice(0, 12)}`,
      branch_type: "branch",
      branch_class: "production",
      created_at: BASE_T,
    });
  }
  return { org_id, branchA, branchB };
};

/** The published artifact at a branch, as a device would fetch it: snapshot from nothing. */
const artifact = (org_id: string, branch_id: string) => staffPage(db, { org_id, branch_id }, 0, 0);

const entryFor = async (
  org_id: string,
  branch_id: string,
  user_id: string,
): Promise<Record<string, unknown> | undefined> => {
  const page = await artifact(org_id, branch_id);
  return page.entries.find((entry) => entry.user_id === user_id) as
    | Record<string, unknown>
    | undefined;
};

const credentialRows = async (org_id: string, user_id: string): Promise<number> => {
  const rows = await db.execute(
    sql`select 1 from kernel.user_credentials
        where org_id = ${org_id} and user_id = ${user_id}`,
  );
  return [...rows].length;
};

const storedPasswordHash = async (org_id: string, user_id: string): Promise<string | null> => {
  const rows = await db.execute(
    sql`select password_hash from kernel.users where org_id = ${org_id} and user_id = ${user_id}`,
  );
  const row = [...rows][0];
  return row === undefined ? null : String(row.password_hash);
};

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  // A deployment that declared NO credential — its own instance, because the question is what
  // `buildServer` does with `undefined` and not what a flag on one instance does.
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  unconfigured = await bare.listen({ port: 0, host: "127.0.0.1" });
  servers = [app, bare];
}, 120_000);

afterAll(async () => {
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

// ── §A — the credential, which is the only control on this surface ───────────────────────────

describe("§A — /internal/users is behind PUBLISH_TOKEN, fail-closed (18 §5)", () => {
  it("no credential and a WRONG credential are both 401 on every route", async () => {
    const org = await freshOrg();
    const bodies: readonly [string, unknown][] = [
      ["/internal/users", { org_id: org.org_id, display_name: "X", email: null, assignments: [] }],
      ["/internal/users/assignments", { org_id: org.org_id, user_id: "u", assignments: [] }],
      ["/internal/users/pin", { org_id: org.org_id, user_id: "u", pin_hash: "h" }],
      [
        "/internal/users/status",
        { org_id: org.org_id, user_id: "u", branch_id: null, status: "inactive" },
      ],
    ];
    for (const [path, body] of bodies) {
      expect((await call(base, "POST", path, { body })).status, `${path} with no credential`).toBe(
        401,
      );
      expect(
        (await call(base, "POST", path, { token: "not-the-credential", body })).status,
        `${path} with a wrong credential`,
      ).toBe(401);
    }
    expect((await listOverHttp(org.org_id, "not-the-credential")).status).toBe(401);
  });

  it("a gateway with NO PUBLISH_TOKEN answers 503 — never fail-open", async () => {
    // The tempting shape is "skip the check when no secret is configured, for local dev". On the
    // catalog that hands a stranger the menu; here it hands a stranger the org's staff roster and
    // a PIN-reset button — `11-F21`'s credential, reachable by anyone who can reach the port.
    const org = await freshOrg();
    const reply = await call(unconfigured, "POST", "/internal/users", {
      token: PUBLISH_SECRET,
      body: {
        org_id: org.org_id,
        display_name: "Nobody",
        email: null,
        assignments: [],
        now: BASE_T,
        actor_user_id: OWNER_ACTOR,
      },
    });
    expect(reply.status).toBe(503);
    expect(await listUsers(db, org.org_id)).toHaveLength(0);
  });

  it("the right credential is NOT refused — the control every refusal above needs", async () => {
    // Without this, §A is also satisfied by a surface that refuses everyone, which is the shape a
    // broken route and a correct one share.
    const org = await freshOrg();
    expect((await listOverHttp(org.org_id)).status).toBe(200);
  });
});

// ── §B — 14-F14's CREATE, and R30's cashier who has no email ─────────────────────────────────

describe("§B — a person is created (14-F14, 11-F20, R30)", () => {
  it("writes a person the directory can resolve, ACTIVE at her branch (11-F20, 11-F22)", async () => {
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Ayesha Khan",
      email: "ayesha@example.test",
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });

    const people = await listUsers(db, org.org_id);
    expect(people.map((person) => person.user_id)).toEqual([user_id]);
    expect(people[0]?.display_name).toBe("Ayesha Khan");
    // `11-F22` — participation rides the ASSIGNMENT and is required per assignment; a person just
    // hired who is not `active` is a tile that refuses on the day she starts (`01-F17` through the
    // identity path). Nothing in the corpus lets a create write any other status.
    expect(people[0]?.assignments).toEqual([
      { role: "cashier", branch_id: org.branchA, status: "active" },
    ]);
  });

  it("a TILL-ONLY cashier is created with NO email, and stays null (R30, 11-F21)", async () => {
    // R30, verbatim: "a cashier who only uses the till needs no email; email is required only for
    // BACK-OFFICE access." The failure this forbids is an owner made to invent an address, which
    // "puts a wrong address permanently into a directory 11-F20 never deletes from".
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Hina Raza",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const person = (await listUsers(db, org.org_id)).find((row) => row.user_id === user_id);
    // `null`, and never the four-letter string `"null"` — `String(null)` reads as an address,
    // survives every type check, and is what `users.ts` records as the exact shape a till-only
    // person must not acquire on the way out of a reader.
    expect(person?.email).toBeNull();
  });

  it("two till-only cashiers coexist — the global email index survives R30 (0011, 28 §9.18)", async () => {
    // R30's stated consequence: "Postgres permits multiple NULLs in a unique index, so the index
    // survives unchanged". A create path that invented `""` or a placeholder per cashier would
    // write the SECOND one into a unique-constraint failure — and the failure would arrive on the
    // day a restaurant hired its second cashier, not in review.
    const org = await freshOrg();
    await mustCreate({
      org_id: org.org_id,
      display_name: "Sana Iqbal",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await mustCreate({
      org_id: org.org_id,
      display_name: "Rabia Sattar",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchB }],
    });
    expect(await listUsers(db, org.org_id)).toHaveLength(2);
  });

  it("a nameless person is REFUSED and nothing is written (11-F20)", async () => {
    // `11-F20`: the name is "required, single across both planes". `01-F75` makes `display_name`
    // required ON THE WIRE too, and records what a blank one costs — one blank name from a bulk
    // import "put a whole org into a reconnect loop", and for `staff` an unparseable member is a
    // branch nobody can sign in to.
    const org = await freshOrg();
    const reply = await createOverHttp({
      org_id: org.org_id,
      display_name: "",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    refusedByTheWriter(reply, "a person with no name (11-F20)");
    expect(await listUsers(db, org.org_id)).toHaveLength(0);
  });

  it("an assignment naming ANOTHER org's branch is refused and nothing is written (01-F71, 01-F26)", async () => {
    // `01-F68` forbids a foreign key, so nothing but the writer can answer this. A user row whose
    // assignment names another org's branch is `00 §5.4`'s isolation boundary crossed in STORAGE,
    // and it becomes `authorize.ts`'s `can()` subject on every till that receives the roster.
    const mine = await freshOrg();
    const theirs = await freshOrg();
    const reply = await createOverHttp({
      org_id: mine.org_id,
      display_name: "Cross Tenant",
      email: null,
      assignments: [{ role: "cashier", branch_id: theirs.branchA }],
    });
    refusedByTheWriter(reply, "an assignment naming another org's branch (01-F71)");
    expect(await listUsers(db, mine.org_id)).toHaveLength(0);
  });
});

// ── §C — 01-F61's grid_ordinal: explicit, appended, and never derived ────────────────────────

describe("§C — the identification grid's order is assigned, not derived (01-F61)", () => {
  it("three creates get three DISTINCT, ASCENDING ordinals — new members append", async () => {
    // `01-F61` (`specs/01-kernel-sync.md:141`) requires an explicit `grid_ordinal` and says new
    // members APPEND. `listUsers` orders `grid_ordinal asc, user_id asc` and `0011` declares no
    // uniqueness constraint, so a collision falls back to `user_id` — "the exact derived ordering
    // 01-F61 forbids, and whose first build had this bug, invisible to a test that only re-renders
    // the same roster, which is precisely how it survived review".
    const org = await freshOrg();
    const created = [];
    for (const display_name of ["First Hire", "Second Hire", "Third Hire"]) {
      created.push(
        await mustCreate({
          org_id: org.org_id,
          display_name,
          email: null,
          assignments: [{ role: "cashier", branch_id: org.branchA }],
        }),
      );
    }
    const ordinals = created.map((person) => person.grid_ordinal);
    expect(new Set(ordinals).size, `three people, ordinals ${ordinals.join(", ")}`).toBe(3);
    expect(ordinals[1]).toBeGreaterThan(ordinals[0] as number);
    expect(ordinals[2]).toBeGreaterThan(ordinals[1] as number);

    // …and the ordinals the writer reported are the ordinals the ARTIFACT carries. A create that
    // returned an ordinal it never stored would satisfy every line above.
    const page = await artifact(org.org_id, org.branchA);
    const inArtifact = new Map(page.entries.map((entry) => [entry.user_id, entry.grid_ordinal]));
    for (const person of created) {
      expect(inArtifact.get(person.user_id)).toBe(person.grid_ordinal);
    }
  });

  it("the ordinal is NOT the caller's to state — it is minted per org, not per branch", async () => {
    // Two people at two DIFFERENT branches of one org still take different ordinals. `01-F75` makes
    // uniqueness a rule "within the artifact" and `01-F78` puts every org-wide person in EVERY
    // branch's artifact — so an ordinal counter kept per branch collides the moment an org-wide
    // owner joins two branch rosters that each already used the number.
    const org = await freshOrg();
    const a = await mustCreate({
      org_id: org.org_id,
      display_name: "Branch A Cashier",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const b = await mustCreate({
      org_id: org.org_id,
      display_name: "Branch B Cashier",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchB }],
    });
    expect(a.grid_ordinal).not.toBe(b.grid_ordinal);
  });
});

// ── §D — 11-F21 / 14 §2: a HASH reaches the store and a PIN never does ───────────────────────

describe("§D — PIN set/reset writes an Argon2id hash and never a PIN (14-F14, 11-F21, 11-F23)", () => {
  const PIN = "4813";

  it("the hash the owner's PIN produces is what a till would verify against", async () => {
    // The assertion that separates "a row was written" from "a cashier can sign in". `01-F28`
    // requires PIN verification to work on-device against SYNCED credential hashes, and `11-F21`
    // rules that the cloud is that source. A route that stored a placeholder, a truncation or a
    // re-hash of the hash satisfies every column check and fails this one.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Ayesha Khan",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const reply = await setPinOverHttp({
      org_id: org.org_id,
      user_id,
      pin_hash: await hashPin(PIN),
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);

    const entry = await entryFor(org.org_id, org.branchA, user_id);
    expect(entry, "the roster artifact does not contain her at all").toBeDefined();
    const pin_hash = entry?.pin_hash;
    expect(
      typeof pin_hash,
      "11-F21: an ACTIVE member carries her hash; an active member with no hash is 11-F23's " +
        "named defect and 01-F17's stopped till arriving through the identity path",
    ).toBe("string");
    expect(await verifyPin(pin_hash as string, PIN)).toBe(true);
  });

  it("the PIN itself is nowhere in the store — not in the credential row, not on the person", async () => {
    // `14 §2`: "PINs stored Argon2id, never present in payloads". `11-F21`: "A PIN exists in
    // exactly two places for exactly as long as each takes — the keypad it is typed on and the
    // argument to a verify call." A `LIKE '%4813%'` over both tables is the crude question and the
    // right one: it does not care WHICH column an implementation invented.
    //
    // ⚠ **IT IS A TRIPWIRE AGAINST A CONTRACT CHANGE, NOT COVERAGE OF A LIVE HAZARD, AND SAYING SO
    // IS THE POINT.** The contracted route takes `pin_hash` and never `pin` (see (2) at the top of
    // this file), so **no implementation of THIS surface can be made to fail this test** — the
    // plaintext never crosses the boundary it would have to cross. It is structurally unkillable
    // here, and a claim of protection that reads like coverage is what retires the assertion the
    // next session would otherwise write. The LIVE version of this claim — a plaintext PIN really
    // does arrive at `services/api` under R29, and must stop there — is `users.test.ts` §D. What
    // this row defends is the day someone widens the route to accept a `pin` "for convenience".
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Bilal Ahmed",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin(PIN) });

    const leaks = await db.execute(
      sql`select 1 from kernel.user_credentials
          where org_id = ${org.org_id} and pin_hash like ${`%${PIN}%`}
          union all
          select 1 from kernel.users
          where org_id = ${org.org_id}
            and (coalesce(email, '') like ${`%${PIN}%`}
                 or display_name like ${`%${PIN}%`}
                 or password_hash like ${`%${PIN}%`}
                 or assignments::text like ${`%${PIN}%`})
          union all
          select 1 from kernel.staff_entries
          where org_id = ${org.org_id} and coalesce(pin_hash, '') like ${`%${PIN}%`}`,
    );
    expect([...leaks], "the typed PIN appears verbatim in the store").toHaveLength(0);
  });

  it("her PIN is NOT her back-office password — two credentials, two planes (11-F21, 11-F23)", async () => {
    // `11-F23`'s reason for a separate table and a separate writer, stated as a behaviour: "giving
    // them one writer is how a password reset comes to touch a PIN by refactor." A till-only
    // cashier has no email and therefore no back-office login, but `kernel.users.password_hash` is
    // NOT NULL, so the create path must put SOMETHING there — and the one thing it must never put
    // there is a hash of the 4-digit convenience credential `01-F61` calls "not a secret".
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Danish Iqbal",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin(PIN) });

    const password_hash = await storedPasswordHash(org.org_id, user_id);
    expect(password_hash).not.toBeNull();
    const opensTheBackOffice = await verifyPin(password_hash as string, PIN).catch(() => false);
    expect(
      opensTheBackOffice,
      "the cashier's till PIN verifies against her back-office password hash — one credential " +
        "doing two jobs on two planes, which 11-F21 and 11-F23 both refuse by name",
    ).toBe(false);
  });

  it("a RESET replaces the hash — the old PIN stops working (14-F14)", async () => {
    // `14-F14` says "set/reset". A reset that appended, or that no-op'd on an existing row, leaves
    // the old credential live — and `11-F21`'s whole point is that the cloud is the source a till
    // verifies against, so "the old PIN still works" is a state no device can correct.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Reset Me",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin("1111") });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin("2222") });

    expect(await credentialRows(org.org_id, user_id)).toBe(1);
    const entry = await entryFor(org.org_id, org.branchA, user_id);
    expect(await verifyPin(entry?.pin_hash as string, "2222")).toBe(true);
    expect(await verifyPin(entry?.pin_hash as string, "1111")).toBe(false);
  });
});

// ── §E — 11-F22 / 11-F23 / R32: deactivation, and the LAST active assignment ─────────────────

describe("§E — deactivation is per-(person, branch); the credential goes at the LAST one (R32)", () => {
  const PIN = "7264";

  /** A person who works at BOTH branches — the fixture the whole R32 clause turns on. */
  const twoBranchCashier = async (): Promise<{ org: Org; user_id: string }> => {
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Rabia Sattar",
      email: null,
      assignments: [
        { role: "cashier", branch_id: org.branchA },
        { role: "cashier", branch_id: org.branchB },
      ],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin(PIN) });
    return { org, user_id };
  };

  it("deactivating at ONE branch leaves her active — and CREDENTIALLED — at the other", async () => {
    // `11-F23`, verbatim: "A person's credential goes when she is `inactive` EVERYWHERE … Fired on
    // one branch's deactivation instead, it destroys the credential the RECEIVING branch's
    // artifact needs and produces an `active` member with no hash." That is `11-F22`'s transfer
    // arriving as `01-F17`'s stopped till, for a cashier who never left the company.
    //
    // ⚠ This is the fixture variation an oracle forgets. A suite where every person holds ONE
    // assignment cannot distinguish "delete at the last active assignment" from "delete on any
    // deactivation" — both pass every test — which is `oracle-round-2-findings.md` §C's first
    // pattern on the credential path.
    const { org, user_id } = await twoBranchCashier();
    const reply = await setStatusOverHttp({
      org_id: org.org_id,
      user_id,
      branch_id: org.branchA,
      status: "inactive",
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);

    expect(
      await credentialRows(org.org_id, user_id),
      "R32 fired on ONE branch's deactivation — the receiving branch now has an active member " +
        "with no hash (11-F23's named defect)",
    ).toBe(1);

    const atA = await entryFor(org.org_id, org.branchA, user_id);
    const atB = await entryFor(org.org_id, org.branchB, user_id);
    // `11-F22` + R26: a departure is a MARKED ENTRY and never an absence — her name still renders
    // on last month's orders at A, so she must still be IN A's artifact.
    expect(
      atA,
      "she vanished from branch A's artifact instead of being marked inactive",
    ).toBeDefined();
    expect(atA?.status).toBe("inactive");
    // `11-F21`: the hash rides only an `active` entry. Absent, not null — `11-F23` chose a table
    // over a column precisely so this is "no row" rather than "a nullable field every reader must
    // remember to check".
    expect(Object.hasOwn(atA as object, "pin_hash")).toBe(false);
    expect(atB?.status).toBe("active");
    expect(await verifyPin(atB?.pin_hash as string, PIN)).toBe(true);
  });

  it("deactivating at the LAST branch deletes the credential (R32, 11-F23)", async () => {
    // R32: "A departed person's credential does not outlive her employment in the database."
    const { org, user_id } = await twoBranchCashier();
    await setStatusOverHttp({
      org_id: org.org_id,
      user_id,
      branch_id: org.branchA,
      status: "inactive",
    });
    await setStatusOverHttp({
      org_id: org.org_id,
      user_id,
      branch_id: org.branchB,
      status: "inactive",
    });

    expect(await credentialRows(org.org_id, user_id)).toBe(0);
    for (const branch of [org.branchA, org.branchB]) {
      const entry = await entryFor(org.org_id, branch, user_id);
      expect(entry?.status).toBe("inactive");
      expect(Object.hasOwn(entry as object, "pin_hash")).toBe(false);
    }
    // `11-F20`: "a person record is never deleted" — deactivation preserves historical attribution
    // (`14-F14`), so a past order still resolves her name rather than a raw UUID.
    const still = (await listUsers(db, org.org_id)).find((row) => row.user_id === user_id);
    expect(still?.display_name).toBe("Rabia Sattar");
  });

  it("a ONE-branch cashier loses her credential on her only deactivation — the other half", async () => {
    // The control for the test above: without it, "delete only at the last active assignment" is
    // indistinguishable from "never delete", and R32 would be unenforced with every test green.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Solo Branch",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin(PIN) });
    expect(await credentialRows(org.org_id, user_id)).toBe(1);

    await setStatusOverHttp({
      org_id: org.org_id,
      user_id,
      branch_id: org.branchA,
      status: "inactive",
    });
    expect(await credentialRows(org.org_id, user_id)).toBe(0);
  });

  it("re-assignment is a real act: dropping a branch removes her from that artifact's reach (01-F78)", async () => {
    // `14-F14` names "role × per-location assignment" as an editable fact, and `01-F78` half one
    // decides what changing it means for an artifact: a branch roster holds the people whose
    // assignments REACH that branch. `publishStaffRoster`'s header records this as OWED and
    // unreachable "until a CRUD can remove an assignment" — this surface is that CRUD, so the case
    // becomes reachable here for the first time.
    const { org, user_id } = await twoBranchCashier();
    const reply = await setAssignmentsOverHttp({
      org_id: org.org_id,
      user_id,
      assignments: [{ role: "cashier", branch_id: org.branchB }],
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);

    const stored = (await listUsers(db, org.org_id)).find((row) => row.user_id === user_id);
    expect(stored?.assignments.map((a) => a.branch_id)).toEqual([org.branchB]);
    // She still works here, so B's artifact must still hold her with a working credential.
    const atB = await entryFor(org.org_id, org.branchB, user_id);
    expect(atB?.status).toBe("active");
    expect(await verifyPin(atB?.pin_hash as string, PIN)).toBe(true);
    // And A must no longer be told her PIN hash — `01-F76`/R25: "the roster's scope IS its
    // credential blast radius", which is the whole reason the roster was made branch-scoped.
    // Whether A keeps a marked entry for rendering (`11-F20`) or she leaves A's reach entirely is
    // `01-F78`'s to decide, so BOTH shapes pass; what is not open is a branch she no longer works
    // at going on holding a hash that unlocks its tills.
    //
    // ⚠ **THIS IS THE ASSERTION MOST LIKELY TO BE CONTESTED, AND THE TWO LEGAL REPAIRS ARE NAMED
    // HERE SO THE IMPLEMENTER IS NOT LEFT GUESSING.** `publishStaffRoster`'s header records the
    // hazard exactly: her last published row at A "stays `active` and keeps its hash, and this
    // publisher then REFUSES to publish the correction — `participationAt` finds nothing reaching
    // this branch and throws by name — so the only repair is to re-add the assignment and
    // deactivate it". It also says the case is "unreachable today: nothing in this service removes
    // an assignment … it becomes reachable with the CRUD that can", which is this surface. So the
    // repairs are (i) deactivate her at the branches she is leaving in the same act, before the
    // assignment goes, or (ii) amend `publishStaffRoster` — a PROTECTED path (`20 §4.4`) needing
    // its own review. If a reading of `01-F78` makes a third answer correct, this is a finding for
    // this suite's session and not an assertion to weaken (`24 §3`).
    const atA = await entryFor(org.org_id, org.branchA, user_id);
    if (atA !== undefined) expect(Object.hasOwn(atA, "pin_hash")).toBe(false);
  });

  it("a status outside `active | inactive` is refused and nothing changes (11-F22)", async () => {
    // `11-F22`: the set is CLOSED at two. "A wider vocabulary is org policy nobody has ruled, and
    // inventing one here would be inventing policy" (commandment 2).
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Closed Set",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin(PIN) });

    const reply = await setStatusOverHttp({
      org_id: org.org_id,
      user_id,
      branch_id: org.branchA,
      status: "on_leave",
    });
    refusedByTheWriter(reply, "a status outside `active | inactive` (11-F22)");
    // The refusal must be BEFORE the credential is touched. `setUserStatus` records exactly this:
    // "a writer that deleted the credential and then validated would refuse loudly and still have
    // destroyed her PIN."
    expect(await credentialRows(org.org_id, user_id)).toBe(1);
    const entry = await entryFor(org.org_id, org.branchA, user_id);
    expect(entry?.status).toBe("active");
  });
});

// ── §F — 01-F75's PRODUCER: every write mints the next version on every affected key ─────────

describe("§F — a write that changes an artifact mints its next version (01-F75, 01-F78)", () => {
  it("a create at branch A moves A's version and leaves B's alone", async () => {
    // `01-F75`, verbatim: "a write that changes an artifact mints the next version for each
    // affected `(resource, scope)` key … The producer is the publish path — never a scheduler,
    // never a device." Written into the FR because the catalog's own fan-out shipped with ZERO
    // production callers.
    //
    // The B half is the ATTRIBUTION: without it, an implementation that republishes every branch
    // on every write passes the A half and quietly rewrites rosters nobody changed.
    const org = await freshOrg();
    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA })).toBe(0);

    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Branch A Only",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });

    expect(
      await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA }),
      "nothing published branch A's roster — the person is in kernel.users and no till will ever " +
        "hear of her (01-F75's producer clause; staff.ts's @unreached-owed marker)",
    ).toBeGreaterThan(0);
    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchB })).toBe(0);
    expect(await entryFor(org.org_id, org.branchA, user_id)).toBeDefined();
  });

  it("an ORG-WIDE person moves EVERY branch's version (01-F78 half one, 01-F26)", async () => {
    // `01-F78` half one: a branch roster holds "every person holding an assignment that REACHES
    // this branch … her own-branch assignments plus 01-F26's org-wide ones (`branch_id: null`),
    // which is how an owner holds Appendix A's 'everything' and therefore how she unlocks a till at
    // a branch she does not staff". So "each affected key" is every branch of the org.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Org Wide Owner",
      email: "owner@example.test",
      assignments: [{ role: "owner", branch_id: null }],
    });

    for (const branch_id of [org.branchA, org.branchB]) {
      expect(
        await staffVersion(db, { org_id: org.org_id, branch_id }),
        `branch ${branch_id} never learned of an org-wide person — 01-F78 puts her in EVERY ` +
          "branch's artifact, and a till she can unlock is one that has her hash",
      ).toBeGreaterThan(0);
      expect(await entryFor(org.org_id, branch_id, user_id)).toBeDefined();
    }
  });

  it("a PIN reset mints the next version — otherwise a till verifies the OLD hash for ever", async () => {
    // `publishStaffRoster`'s header states the consequence in terms: "a PIN reset (14-F14), a
    // rename, a re-ordering and a deactivation are all publishes, and a device that never learns of
    // one verifies against the old hash for ever". A reset that writes `kernel.user_credentials`
    // and stops there is the whole `14-F14` act failing silently.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Needs A New PIN",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const afterCreate = await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA });

    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin("9042") });
    const afterPin = await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA });
    expect(afterPin).toBeGreaterThan(afterCreate);
    expect(
      await verifyPin(
        (await entryFor(org.org_id, org.branchA, user_id))?.pin_hash as string,
        "9042",
      ),
    ).toBe(true);
  });

  it("a deactivation mints the next version — otherwise a fired cashier keeps selling", async () => {
    // `01-F48`'s posture on the identity path: an eviction the device never learns of is not a
    // refusal. A status flip that never publishes leaves every till at the branch holding her
    // `active` entry and her live hash.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Leaving Today",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin("3311") });
    const before = await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA });

    await setStatusOverHttp({
      org_id: org.org_id,
      user_id,
      branch_id: org.branchA,
      status: "inactive",
    });

    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA })).toBeGreaterThan(
      before,
    );
    const entry = await entryFor(org.org_id, org.branchA, user_id);
    expect(entry?.status).toBe("inactive");
    expect(Object.hasOwn(entry as object, "pin_hash")).toBe(false);
  });

  it("a re-assignment mints the next version on the branch that GAINED her too", async () => {
    // Both directions of `01-F78` half one in one act: B has never heard of her and must now, A
    // must be told she is gone. A publisher that only republishes the branches named in the OLD
    // assignment set passes every other test in this section.
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Transferring",
      email: null,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchB })).toBe(0);

    await setAssignmentsOverHttp({
      org_id: org.org_id,
      user_id,
      assignments: [
        { role: "cashier", branch_id: org.branchA },
        { role: "cashier", branch_id: org.branchB },
      ],
    });

    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchB })).toBeGreaterThan(
      0,
    );
    expect(await entryFor(org.org_id, org.branchB, user_id)).toBeDefined();
  });
});

// ── §G — 01-F71: the org is the writer's boundary, and a refusal is not a clamp ──────────────

describe("§G — tenant isolation on the write path (01-F71, 14-F39)", () => {
  const PIN = "5150";

  /** Two orgs; the SECOND holds a person the first will try to reach. */
  const twoTenants = async (): Promise<{ mine: Org; theirs: Org; theirUser: string }> => {
    const mine = await freshOrg();
    const theirs = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: theirs.org_id,
      display_name: "Their Cashier",
      email: null,
      assignments: [{ role: "cashier", branch_id: theirs.branchA }],
    });
    await setPinOverHttp({ org_id: theirs.org_id, user_id, pin_hash: await hashPin(PIN) });
    return { mine, theirs, theirUser: user_id };
  };

  it("a PIN reset addressed at another tenant's person is REFUSED, not clamped", async () => {
    // `01-F71` (e): "anything else is REFUSED as an auth failure, never clamped to the session's
    // own — silently serving a different artifact than the one asked for is exactly the
    // mis-routing 01-F76 says makes scope decoration." The clamp shape here is a query scoped to
    // the stated org that matches zero rows and reports success: the owner is told the PIN was
    // reset, and the cashier's old PIN goes on working.
    const { mine, theirs, theirUser } = await twoTenants();
    const reply = await setPinOverHttp({
      org_id: mine.org_id,
      user_id: theirUser,
      pin_hash: await hashPin("0000"),
    });
    refusedByTheWriter(
      reply,
      "a cross-tenant PIN reset reported success — nothing was written and the caller was told " +
        "it was (01-F71)",
    );

    // Their credential is untouched: the ORIGINAL PIN still verifies.
    const theirEntry = await entryFor(theirs.org_id, theirs.branchA, theirUser);
    expect(await verifyPin(theirEntry?.pin_hash as string, PIN)).toBe(true);
    expect(await verifyPin(theirEntry?.pin_hash as string, "0000")).toBe(false);
    // …and nothing was written under the CALLER's org either.
    expect(await credentialRows(mine.org_id, theirUser)).toBe(0);
  });

  it("a deactivation addressed at another tenant's person is REFUSED and changes nothing", async () => {
    const { mine, theirs, theirUser } = await twoTenants();
    const reply = await setStatusOverHttp({
      org_id: mine.org_id,
      user_id: theirUser,
      branch_id: theirs.branchA,
      status: "inactive",
    });
    refusedByTheWriter(reply, "a cross-tenant deactivation (01-F71)");

    const stored = (await listUsers(db, theirs.org_id)).find((row) => row.user_id === theirUser);
    expect(stored?.assignments.every((a) => a.status === "active")).toBe(true);
    expect(await credentialRows(theirs.org_id, theirUser)).toBe(1);
  });

  it("a re-assignment addressed at another tenant's person is REFUSED and changes nothing", async () => {
    const { mine, theirs, theirUser } = await twoTenants();
    const reply = await setAssignmentsOverHttp({
      org_id: mine.org_id,
      user_id: theirUser,
      assignments: [{ role: "owner", branch_id: null }],
    });
    refusedByTheWriter(reply, "a cross-tenant re-assignment (01-F71)");
    const stored = (await listUsers(db, theirs.org_id)).find((row) => row.user_id === theirUser);
    expect(stored?.assignments.map((a) => a.role)).toEqual(["cashier"]);
  });

  it("the list answers one org's people and never another's", async () => {
    const { mine, theirUser } = await twoTenants();
    await mustCreate({
      org_id: mine.org_id,
      display_name: "My Cashier",
      email: null,
      assignments: [{ role: "cashier", branch_id: mine.branchA }],
    });
    const reply = await listOverHttp(mine.org_id);
    expect(reply.status).toBe(200);
    const listed = (reply.body.users ?? []) as readonly { user_id: string }[];
    expect(listed.map((row) => row.user_id)).not.toContain(theirUser);
    expect(listed).toHaveLength(1);
  });

  it("no cross-tenant refusal ever put a row in the WRONG artifact", async () => {
    // The isolation question `01-F76` raises that a row check cannot answer: the artifact is
    // `(staff, {org, branch})`, and R25 makes its scope the credential blast radius. A refusal that
    // nevertheless published is the leak with the error message attached.
    const { mine, theirUser } = await twoTenants();
    await setPinOverHttp({
      org_id: mine.org_id,
      user_id: theirUser,
      pin_hash: await hashPin("0000"),
    });
    for (const branch_id of [mine.branchA, mine.branchB]) {
      const page = await staffPage(db, { org_id: mine.org_id, branch_id }, 0, 0);
      expect(page.entries.map((entry) => entry.user_id)).not.toContain(theirUser);
    }
  });
});

// ── §H — a liveness PROBE, and its bite is conditional; read the note ────────────────────────

describe("§H — two concurrent writes in one org both land (probe)", () => {
  /**
   * ⚠ **THIS SECTION HOLDS TWO TESTS AND THEY PROVE DIFFERENT THINGS. THE FIRST IS A PROBE WHOSE
   * CONDITION IS STATED RATHER THAN IMPLIED; THE SECOND CARRIES THE LOST-UPDATE CLAIM.**
   *
   * `publishStaffRoster`'s header measures a real hazard for this exact caller: `setUserStatus`
   * then `publishStaffRoster` **inside ONE caller transaction**, with overlapping publish sets,
   * deadlocks **8 of 8 rounds** (`SQLSTATE 40P01`) against **0 of 8** in separate transactions —
   * "the order that deadlocks is the one this module pushes an implementer toward".
   *
   * It cannot be asserted from outside without also pinning the publisher's CHANGE SET, which is
   * the implementer's to choose: the deadlock needs two transactions to take the same two person
   * rows in opposite orders, and that only arises when each request's publish set contains BOTH
   * people. A route that publishes only the person it changed never reaches it, and pinning the
   * change set here would decide a design question no FR decides (commandment 2).
   *
   * So the FIRST test asserts only the observable half — both writes land, neither is lost, neither
   * surfaces an unhandled `40P01` — and it is honest about being vacuous against a narrow change
   * set. Its two people hold ORG-WIDE assignments precisely so every publish set contains both of
   * them, which is the fixture the deadlock needs.
   *
   * ⚠ **THAT FIRST TEST IS NOT A LOST-UPDATE TEST, AND THIS HEADER SAID IT WAS — a claim that was
   * false on a SCHEMA FACT rather than merely unmeasured.** The retired sentence read: *"What it is
   * NOT vacuous against, in every implementation, is a LOST UPDATE: two concurrent
   * read-modify-writes on one org's `assignments` jsonb."* **There is no such object.**
   * `assignments` is a jsonb column on each PERSON's own `kernel.users` row (`0011`), so two people
   * deactivated concurrently are two rows, two locks and two independent read-modify-writes —
   * nothing is shared for a writer to lose an update on. **Measured against a plausible
   * implementation: deleting `for update` from `setUserStatus`'s read leaves that test GREEN and
   * the whole package at 454/454.** A claim of protection in a header retires the assertion the
   * next session would otherwise write, which is this repo's recorded failure mode.
   *
   * The shape the lock actually protects is **ONE person at TWO branches**, and `setUserStatus`'s
   * own header names it: *"two branches deactivating one person concurrently are a
   * read-modify-write on one jsonb value, and the loser would otherwise overwrite the winner's
   * assignment with a stale copy — a deactivation that reports success and did not happen."* It is
   * not contrived: `11-F22` makes participation per-(person, branch), `14-F14` puts both flips on
   * one owner's surface, and R32 keys the credential deletion to the LAST active assignment read
   * off that same array — so a lost update also leaves a departed cashier's PIN live on every till,
   * which is `11-F23`'s named state arriving from a request that answered 200.
   */
  it("two people deactivated concurrently are BOTH inactive afterwards (no lost update)", async () => {
    const org = await freshOrg();
    const first = await mustCreate({
      org_id: org.org_id,
      display_name: "Org Wide One",
      email: null,
      assignments: [{ role: "cashier", branch_id: null }],
    });
    const second = await mustCreate({
      org_id: org.org_id,
      display_name: "Org Wide Two",
      email: null,
      assignments: [{ role: "cashier", branch_id: null }],
    });

    const replies = await Promise.all([
      setStatusOverHttp({
        org_id: org.org_id,
        user_id: first.user_id,
        branch_id: null,
        status: "inactive",
      }),
      setStatusOverHttp({
        org_id: org.org_id,
        user_id: second.user_id,
        branch_id: null,
        status: "inactive",
      }),
    ]);
    expect(
      replies.map((reply) => reply.status),
      `concurrent deactivations answered ${JSON.stringify(replies)} — a 500 carrying 40P01 here ` +
        "is the deadlock publishStaffRoster's header measures, and its answer is separate " +
        "transactions or a canonical acquisition order",
    ).toEqual([200, 200]);

    const people = await listUsers(db, org.org_id);
    for (const person of people) {
      expect(
        person.assignments.every((assignment) => assignment.status === "inactive"),
        `${person.display_name} is still active — one concurrent write overwrote the other`,
      ).toBe(true);
    }
  });

  /**
   * ⚠ **THE RACE IS A LOCK, NOT A SLEEP, AND THE BARRIER IS ASSERTED BEFORE IT IS RELEASED.**
   *
   * Two requests fired with `Promise.all` overlap only *probably*: the window between
   * `setUserStatus`'s read and its write is microseconds wide, so an implementation with no lock
   * would pass this most of the time and fail it at 3am. `journey-catalog.test.ts`'s `SEAM (ORDER)`
   * fixture is the precedent and its reasoning is transcribed rather than reinvented — **a sleep is
   * both a permanent runtime cost and a window that is only probably wide enough**.
   *
   * So a third connection takes her row lock FIRST (`select … for update` on her `kernel.users`
   * row), both requests are fired against it, and `pg_blocking_pids` is polled until BOTH are
   * provably waiting on **that exact backend**. Three things about that:
   *
   *   · It is a real production condition — a second writer for the same person already in flight —
   *     and needs no change to anything shipped. Nothing slows down to make the test possible.
   *   · **The poll is the anti-vacuity guard.** Without it a request that 400'd before ever
   *     reaching the database would satisfy every assertion below while proving nothing, which is
   *     the vacuity the round-3 law exists to catch.
   *   · **It blocks BOTH implementations, at different statements, which is what makes it
   *     decisive.** With `for update` the READ waits, so neither transaction has read when the
   *     barrier lifts and the second one reads the first's committed write. Without it both reads
   *     have already happened against the same row and only the WRITES wait — so the second write
   *     puts back a stale array and one deactivation is silently undone.
   */
  it("ONE person deactivated at BOTH her branches concurrently keeps both writes (11-F22, R32)", async () => {
    const org = await freshOrg();
    const { user_id } = await mustCreate({
      org_id: org.org_id,
      display_name: "Two Branch Departure",
      email: null,
      assignments: [
        { role: "cashier", branch_id: org.branchA },
        { role: "cashier", branch_id: org.branchB },
      ],
    });
    await setPinOverHttp({ org_id: org.org_id, user_id, pin_hash: await hashPin("8150") });

    const barrier = openDb();
    let lift = (): void => {};
    const lifted = new Promise<void>((resolve) => {
      lift = resolve;
    });
    let holding: Promise<void> = Promise.resolve();
    const blockedBy = await new Promise<number>((engaged, failed) => {
      holding = barrier.transaction(async (tx) => {
        const backend = [...(await tx.execute(sql`select pg_backend_pid() as pid`))][0];
        await tx.execute(
          sql`select 1 from kernel.users
              where org_id = ${org.org_id} and user_id = ${user_id}
              for update`,
        );
        engaged(Number(backend?.pid));
        await lifted;
      });
      // A barrier that died before it took the lock must fail HERE, by name, rather than leaving
      // the fixture waiting on a promise nothing will settle.
      holding.catch(failed);
    });

    try {
      const replies = Promise.all([
        setStatusOverHttp({
          org_id: org.org_id,
          user_id,
          branch_id: org.branchA,
          status: "inactive",
        }),
        setStatusOverHttp({
          org_id: org.org_id,
          user_id,
          branch_id: org.branchB,
          status: "inactive",
        }),
      ]);
      // The fixture can throw before this is awaited (the barrier guard below), and the two
      // requests then die with the server in `afterAll` — a rejection nothing is listening to.
      replies.catch(() => undefined);

      /**
       * ⚠ **TRANSITIVELY blocked, and the recursion is the load-bearing part.** Postgres does not
       * queue every waiter for a row directly behind the holder: the first waiter takes the TUPLE
       * lock and waits on the barrier's transaction, and the second then waits on that first
       * WAITER. So `pg_blocking_pids(pid) @> barrier` is true of exactly one backend however many
       * are stalled — measured, this poll never reached 2 and the guard below fired on a correct
       * implementation. Walking the closure from the fixture's own backend keeps the question
       * precise (vitest runs FILES in parallel against one database, so any predicate over
       * `pg_locks` at large would count other suites' waiters).
       */
      const waitingOnTheBarrier = async (): Promise<number> => {
        const rows = await db.execute(
          sql`with recursive stalled(pid) as (
                select pid from pg_stat_activity
                 where ${blockedBy}::int = any(pg_blocking_pids(pid))
                union
                select waiter.pid from pg_stat_activity waiter, stalled
                 where stalled.pid = any(pg_blocking_pids(waiter.pid))
              )
              select count(*)::int as waiting from stalled`,
        );
        return Number([...rows][0]?.waiting ?? 0);
      };
      const giveUpAt = Date.now() + 15_000;
      while ((await waitingOnTheBarrier()) < 2) {
        if (Date.now() > giveUpAt) {
          throw new Error(
            "the barrier never engaged: fewer than two backends are waiting on the row lock this " +
              "fixture holds, so the two deactivations were never concurrent and every assertion " +
              "below would pass against a writer with no lock at all",
          );
        }
        await new Promise((tick) => setTimeout(tick, 25));
      }

      lift();
      const answered = await replies;
      expect(
        answered.map((reply) => reply.status),
        `concurrent deactivations of ONE person answered ${JSON.stringify(answered)} — a 500 ` +
          "carrying 40P01 here is a deadlock, and its answer is separate transactions or a " +
          "canonical acquisition order",
      ).toEqual([200, 200]);
    } finally {
      lift();
      await holding;
      await closeDb(barrier);
    }

    const person = (await listUsers(db, org.org_id)).find((row) => row.user_id === user_id);
    expect(
      person?.assignments,
      "one deactivation overwrote the other with a stale copy of her assignments — the request " +
        "answered 200 and the write did not happen (setUserStatus's `for update`)",
    ).toEqual([
      { role: "cashier", branch_id: org.branchA, status: "inactive" },
      { role: "cashier", branch_id: org.branchB, status: "inactive" },
    ]);
    // R32 is decided off the SAME array, so a lost update is not only a stale status: it leaves
    // the credential of a person who has left the company alive for every till that reconciles.
    expect(
      await credentialRows(org.org_id, user_id),
      "she is inactive everywhere and her PIN still verifies — R32's deletion was skipped because " +
        "the losing write's stale array still held an `active` assignment (11-F23)",
    ).toBe(0);
  });
});
