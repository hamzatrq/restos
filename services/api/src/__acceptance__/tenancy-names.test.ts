/**
 * **`21-F15` ON THE CLOUD PLANE — the read surfaces that let a screen show a NAME.**
 *
 * `21-F15`: *"no surface renders a machine identifier where the product knows a name — and where it
 * knows none, that is a MISSING FIELD, not a rendering problem."* Measured before this change, this
 * service could serve no name for anything: `session.whoami` answered `user_id`/`org_id`/
 * `assignments`, `devices.list` answered UUIDs, and there was no branch list at all — so every
 * back-office screen rendered hexadecimal, and did so with every gate green.
 *
 * Three records and one absence, each with its own FR:
 *
 *   §A `11-F20` — the PERSON's name, on `session.whoami`, and the property that keeps it there.
 *   §B `01-F68`/`01-F69` — the ORG and its BRANCHES, on `tenancy.directory`, gated and narrowed.
 *   §C `01-F70` — the DEVICE's name, on `devices.list`.
 *   §D the UNNAMED case, which is the one every tenant is in today.
 *
 * **⚠ AUTHORSHIP DEPARTURE, DECLARED (`24 §3`).** This file was written by the session that wrote
 * the procedures it exercises, so the independent-oracle guarantee is not available and is not
 * claimed. Two consequences are stated rather than left implicit. (i) The mutation numbers in
 * `services/api/CLAUDE.md` are what stand in for it. (ii) **This file is NOT the two-tenant
 * isolation oracle `01-F71` requires** — that FR demands a test per enforcement point that fails
 * when *that point alone* is removed, and it belongs to a test-authoring session. §B's last case is
 * the narrow thing a new read surface owes its own review (the org is the subject's, not the
 * request's); it is not, and must not be read as, `01-F71`'s register.
 *
 * The gateway is driven over a **real loopback socket** (`fake-gateway.ts`): the question a naming
 * surface raises is whether a request carrying the right org actually left the process, and a
 * stubbed `fetch` answers a different question.
 */

import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGatewayDeviceDirectory, createGatewayTenancyDirectory } from "../gateway-client.js";
import { createApiServer } from "../server.js";
import { unconfiguredTenancyDirectory } from "../tenancy.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

const ORG = "org-kababjees";
/** A SECOND tenant with data of its own. Nothing signed into `ORG` may ever see a value from it. */
const OTHER_ORG = "org-student-biryani";

const BRANCH_A = "branch-gulberg";
const BRANCH_B = "branch-dha";
const OTHER_BRANCH = "branch-nazimabad";

const SECRET = "tenancy-names-acceptance-session-secret-not-a-real-one";
const PASSWORD = "a-bootstrap-owner-password";

const OWNER_ID = "user-owner-named";
/** Same org, and the store holds NO name for her — `21-F15`'s unnamed person. */
const NAMELESS_ID = "user-owner-nameless";
/** Branch-scoped, so `reportScope` narrows her answer to one branch (`12-F22`). */
const MANAGER_ID = "user-manager-gulberg";
/** The OTHER tenant's owner. */
const OTHER_OWNER_ID = "user-owner-other";

let clock = 1_800_000_000_000;
const now = (): number => (clock += 1_000);

let gateway: FakeGateway;
let app: Awaited<ReturnType<typeof createApiServer>>;
const tokens = new Map<string, string>();

const users = async (): Promise<UserRecord[]> => {
  const password_hash = await hashPin(PASSWORD);
  return [
    {
      user_id: OWNER_ID,
      org_id: ORG,
      email: "owner@kababjees.test",
      display_name: "Ayesha Khan",
      password_hash,
      assignments: [{ role: "owner", branch_id: null }],
    },
    {
      user_id: NAMELESS_ID,
      org_id: ORG,
      email: "nameless@kababjees.test",
      password_hash,
      assignments: [{ role: "owner", branch_id: null }],
    },
    {
      user_id: MANAGER_ID,
      org_id: ORG,
      email: "hina@kababjees.test",
      display_name: "Hina Raza",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH_A }],
    },
    {
      user_id: OTHER_OWNER_ID,
      org_id: OTHER_ORG,
      email: "owner@student-biryani.test",
      display_name: "Bilal Ahmed",
      password_hash,
      assignments: [{ role: "owner", branch_id: null }],
    },
  ];
};

type Reply = { status: number; body: unknown };

const call = async (path: string, who: string | null, input: unknown = {}): Promise<Reply> => {
  const bearer = who === null ? undefined : `Bearer ${tokens.get(who) as string}`;
  const response = await app.inject({
    method: "GET",
    url: `/trpc/${path}?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`,
    ...(bearer === undefined ? {} : { headers: { authorization: bearer } }),
  });
  const raw = response.json() as { result?: { data?: unknown }; error?: unknown };
  const data =
    raw.result?.data === undefined ? undefined : superjson.deserialize(raw.result.data as never);
  return { status: response.statusCode, body: raw.error ?? data };
};

const login = async (email: string, who: string): Promise<void> => {
  const response = await app.inject({
    method: "POST",
    url: "/trpc/auth.login",
    payload: superjson.serialize({ email, password: PASSWORD }) as object,
  });
  const raw = response.json() as { result: { data: unknown } };
  const { token } = superjson.deserialize(raw.result.data as never) as { token: string };
  tokens.set(who, token);
};

beforeAll(async () => {
  gateway = await startFakeGateway();
  const link = { base_url: gateway.url, token: gateway.token };

  // `01-F68`/`01-F69` — a NAMED tenant with two named branches.
  gateway.seedTenancy(
    ORG,
    { display_name: "Kababjees", status: "active", created_at: 1_700_000_000_000 },
    [
      {
        branch_id: BRANCH_A,
        display_name: "Gulberg",
        branch_type: "branch",
        branch_class: "production",
        created_at: 1_700_000_000_000,
      },
      {
        branch_id: BRANCH_B,
        display_name: "DHA",
        branch_type: "branch",
        branch_class: "production",
        created_at: 1_700_000_000_001,
      },
    ],
  );
  // A second tenant, named differently, with a branch of its own.
  gateway.seedTenancy(
    OTHER_ORG,
    { display_name: "Student Biryani", status: "active", created_at: 1_700_000_000_000 },
    [
      {
        branch_id: OTHER_BRANCH,
        display_name: "Nazimabad",
        branch_type: "branch",
        branch_class: "production",
        created_at: 1_700_000_000_000,
      },
    ],
  );

  // `01-F70` — one named till and one unnamed one, in the SAME list, because a projection that
  // dropped the column would be invisible against a fixture where every row is null.
  gateway.registerDevice(ORG, {
    device_id: "device-counter-1",
    branch_id: BRANCH_A,
    device_class: "counter",
    display_name: "Front counter till",
    revoked_at: null,
    token_expires_at: 1_900_000_000_000,
  });
  gateway.registerDevice(ORG, {
    device_id: "device-kds-1",
    branch_id: BRANCH_A,
    device_class: "kds",
    display_name: null,
    revoked_at: null,
    token_expires_at: 1_900_000_000_000,
  });
  gateway.registerDevice(OTHER_ORG, {
    device_id: "device-other-counter",
    branch_id: OTHER_BRANCH,
    device_class: "counter",
    display_name: "Nazimabad counter",
    revoked_at: null,
    token_expires_at: 1_900_000_000_000,
  });

  app = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now,
    tenancy: createGatewayTenancyDirectory(link),
    devices: createGatewayDeviceDirectory(link),
  });

  await login("owner@kababjees.test", OWNER_ID);
  await login("nameless@kababjees.test", NAMELESS_ID);
  await login("hina@kababjees.test", MANAGER_ID);
  await login("owner@student-biryani.test", OTHER_OWNER_ID);
}, 60_000);

afterAll(async () => {
  await gateway?.close();
});

// ── §A — the PERSON's name (11-F20), and why it stays off the gateway ──────────────────────────

describe("§A — `session.whoami` carries the person's name (11-F20, 21-F15)", () => {
  it("serves the name the store holds, beside the id it always served", async () => {
    const who = await call("session.whoami", OWNER_ID);
    expect(who.status, JSON.stringify(who.body)).toBe(200);
    expect(who.body).toEqual({
      user_id: OWNER_ID,
      org_id: ORG,
      assignments: [{ role: "owner", branch_id: null }],
      display_name: "Ayesha Khan",
    });
  });

  it("answers `null` — never a default and never the id — for a person with no name", async () => {
    // `21-F15`: where the record has no name that is a MISSING FIELD. "Owner", the email's local
    // part or the `user_id` would each be a name the product invented for a human being, and the
    // screen would have no way to tell an invented name from a real one.
    const who = await call("session.whoami", NAMELESS_ID);
    const { display_name } = who.body as { display_name: unknown };
    expect(display_name).toBeNull();
    // The three plausible inventions, refused BY VALUE rather than by a substring sweep over the
    // whole body — `user_id` legitimately appears in that body, and an earlier draft of this
    // assertion failed for exactly that reason. What must never appear is any of them *as the name*.
    expect(display_name).not.toBe(NAMELESS_ID);
    expect(display_name).not.toBe("nameless@kababjees.test");
    expect(display_name).not.toBe("Owner");
  });

  it("answers with NO tenancy directory configured at all — whoami has no peer (the property)", async () => {
    /**
     * **This is the assertion that keeps the org's name off `whoami`.** A host built with the
     * refusing tenancy fallback still answers `session.whoami` in full, because the procedure
     * touches no peer. Had the org's name been folded in here, this call would throw — and in
     * production a gateway outage would stop the back office rendering *who you are*.
     * `startable.test.ts` makes the same point out of process, against a CLOSED gateway port.
     */
    const isolated = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now,
      tenancy: unconfiguredTenancyDirectory(),
    });
    const response = await isolated.inject({
      method: "GET",
      url: `/trpc/session.whoami?input=${encodeURIComponent(JSON.stringify(superjson.serialize({})))}`,
      headers: { authorization: `Bearer ${tokens.get(OWNER_ID) as string}` },
    });
    expect(response.statusCode).toBe(200);
    const raw = response.json() as { result: { data: unknown } };
    expect(superjson.deserialize(raw.result.data as never)).toMatchObject({
      display_name: "Ayesha Khan",
    });
  });
});

// ── §B — the ORG and its BRANCHES (01-F68, 01-F69) ─────────────────────────────────────────────

describe("§B — `tenancy.directory` names the org and its branches (01-F68, 01-F69)", () => {
  it("serves the org's name and every branch's name to an org-wide owner", async () => {
    const directory = await call("tenancy.directory", OWNER_ID);
    expect(directory.status, JSON.stringify(directory.body)).toBe(200);
    expect((directory.body as { org: unknown }).org).toEqual({
      org_id: ORG,
      display_name: "Kababjees",
      status: "active",
    });
    /**
     * **Asserted as a SET, and the ORDER is deliberately not claimed here.** `fake-gateway.ts`'s
     * doctrine is that it reproduces only what an API-side assertion depends on, and ordering is
     * the real reader's (`listBranches` imposes an explicit `order by` so a selector does not
     * reshuffle under an owner between two reads of the same estate). Asserting
     * it against a fake that does not sort would test the fixture; it is asserted against real
     * Postgres in `services/sync-gateway/src/__acceptance__/tenancy-read-http.test.ts`.
     *
     * An earlier draft DID pin the order here and failed — correctly, and it is recorded rather
     * than quietly re-sorted, because "make the fake sort too" was the tempting repair and it would
     * have produced a second interpretation of the ordering rule (`03-F40`'s two sensor bit
     * layouts, one file over).
     */
    expect(
      [...(directory.body as { branches: { branch_id: string; display_name: string }[] }).branches]
        .map((branch) => [branch.branch_id, branch.display_name])
        .sort(),
    ).toEqual(
      [
        [BRANCH_A, "Gulberg"],
        [BRANCH_B, "DHA"],
      ].sort(),
    );
  });

  it("narrows the branch list by `reportScope`, exactly as the summary narrows its answer", async () => {
    // `12-F22`/`summaryBranchScope`: a branch manager's summary covers her own branch, so a
    // selector offering her the estate would offer her rows the summary will refuse. She must state
    // her branch — `branchOf` resolves an absent scope to `null`, which matches org-wide
    // assignments only, so the request below is the one she can actually make.
    const directory = await call("tenancy.directory", MANAGER_ID, { branch_id: BRANCH_A });
    expect(directory.status, JSON.stringify(directory.body)).toBe(200);
    expect((directory.body as { branches: { branch_id: string }[] }).branches).toEqual([
      {
        branch_id: BRANCH_A,
        display_name: "Gulberg",
        branch_type: "branch",
        branch_class: "production",
      },
    ]);
    // The ORG's name is NOT narrowed: it is her own employer, and no reach makes knowing its name
    // wider than knowing the `org_id` `whoami` already gives her.
    expect((directory.body as { org: unknown }).org).toEqual({
      org_id: ORG,
      display_name: "Kababjees",
      status: "active",
    });
  });

  it("is GATED — a subject with no assignment is refused, and the boot gate sees it", async () => {
    const refused = await call("tenancy.directory", null);
    expect(refused.status).toBe(401);
  });

  /**
   * ⚠ **NARROW, AND NOT `01-F71`'s ORACLE.** This asserts enforcement point (b) — *"the org is
   * taken from the authenticated subject and never from the request"* — for the ONE procedure this
   * change adds, which is what a new cross-tenant read surface owes its own review. The FR's
   * register is four points with a mutant each, over two tenants, and it belongs to a test-authoring
   * session; nothing here may be read as satisfying it.
   */
  it("takes the org from the SUBJECT — a request naming another tenant changes nothing (01-F71 b)", async () => {
    // Only the requests THIS call makes, so the assertion does not depend on which tests ran first
    // — a suite-wide sweep here would pass or fail on declaration order, which is not a property of
    // the code under test.
    const before = gateway.received.length;
    const smuggled = await call("tenancy.directory", OWNER_ID, {
      branch_id: null,
      org_id: OTHER_ORG,
      subject: { org_id: OTHER_ORG },
    });
    expect(smuggled.status, JSON.stringify(smuggled.body)).toBe(200);
    expect(smuggled.body).toMatchObject({
      org: { org_id: ORG, display_name: "Kababjees" },
    });
    const serialised = JSON.stringify(smuggled.body);
    expect(serialised).not.toContain("Student Biryani");
    expect(serialised).not.toContain(OTHER_BRANCH);
    expect(serialised).not.toContain("Nazimabad");

    /**
     * **And the same claim AT THE WIRE, which is the half a body comparison cannot make.** A body
     * that omits tenant B is consistent with two very different servers: one that asked the gateway
     * about A, and one that asked about B and filtered the answer afterwards. The second is a leak
     * waiting for the filter to be edited — and it is invisible to every assertion above. So the
     * recorded requests are checked directly: **no request for another org has ever left this
     * process**, on any route, for the whole file.
     */
    const asked = gateway.received
      .slice(before)
      .map((entry) => entry.query.org_id ?? (entry.body as { org_id?: string } | null)?.org_id);
    // Non-empty is load-bearing: a procedure that never reached the peer would satisfy "asked about
    // nobody else" while proving nothing at all.
    expect(asked.length).toBeGreaterThan(0);
    expect([...new Set(asked)]).toEqual([ORG]);
  });

  it("serves the OTHER tenant its own directory — the control that makes the last case mean something", async () => {
    // Without this, "A cannot see B" would also pass against a directory that answers nothing at
    // all. B's owner gets B's estate, so the data is genuinely there to leak.
    const directory = await call("tenancy.directory", OTHER_OWNER_ID);
    expect(directory.body).toMatchObject({
      org: { org_id: OTHER_ORG, display_name: "Student Biryani" },
      branches: [{ branch_id: OTHER_BRANCH, display_name: "Nazimabad" }],
    });
  });
});

// ── §C — the DEVICE's name (01-F70) ────────────────────────────────────────────────────────────

describe("§C — `devices.list` carries the till's name (01-F70, 14-F12)", () => {
  it("carries a named till's name and an unnamed one's null, in one list", async () => {
    const listed = await call("devices.list", OWNER_ID);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const rows = listed.body as { device_id: string; display_name: string | null }[];
    expect(rows.map((row) => [row.device_id, row.display_name])).toEqual([
      ["device-counter-1", "Front counter till"],
      ["device-kds-1", null],
    ]);
  });

  it("refuses a gateway that STOPS SENDING the field — absent is a contract break, null is data", async () => {
    /**
     * `.nullable()` and not `.optional()` in `DeviceListResponse`, asserted rather than assumed. A
     * gateway that dropped the column would satisfy `.optional()` silently and every till in the
     * product would render unnamed with nothing anywhere reporting a fault — `21-F15`'s failure
     * arriving as data. This drives the adapter against a peer that omits it.
     */
    const stripped = await startFakeGateway();
    stripped.registerDevice(ORG, {
      device_id: "device-counter-1",
      branch_id: BRANCH_A,
      device_class: "counter",
      display_name: "Front counter till",
      revoked_at: null,
      token_expires_at: null,
    });
    const directory = createGatewayDeviceDirectory({
      base_url: stripped.url,
      token: stripped.token,
    });
    await expect(directory.list(ORG)).resolves.toHaveLength(1);
    stripped.refuseWith("/internal/devices", 200, "not a device list");
    await expect(directory.list(ORG)).rejects.toThrow();
    await stripped.close();
  });
});

// ── §D — the UNNAMED case, which is every tenant today ─────────────────────────────────────────

describe("§D — UNNAMED is a state the product reports, not one it hides (01-F68, 21-F15)", () => {
  it("an org with no directory row travels as `display_name: null` and a 200", async () => {
    /**
     * `01-F68`: *"An org with events and no record is UNNAMED, not invalid … it folds, syncs,
     * prints and settles exactly as any other."* **This is the state of EVERY tenant in this
     * deployment** — `0010` created the tables and the writer landed beside this change — so the
     * null path is the production path today, not an edge case.
     */
    const bare = await startFakeGateway();
    const app2 = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now,
      tenancy: createGatewayTenancyDirectory({ base_url: bare.url, token: bare.token }),
    });
    const response = await app2.inject({
      method: "GET",
      url: `/trpc/tenancy.directory?input=${encodeURIComponent(JSON.stringify(superjson.serialize({})))}`,
      headers: { authorization: `Bearer ${tokens.get(OWNER_ID) as string}` },
    });
    expect(response.statusCode).toBe(200);
    const raw = response.json() as { result: { data: unknown } };
    expect(superjson.deserialize(raw.result.data as never)).toEqual({
      // The id is still there — it is an identifier and belongs in an identifier's slot. What is
      // absent is the NAME, said as null so `21-F15`'s treatment can say where it is set.
      org: { org_id: ORG, display_name: null, status: null },
      branches: [],
    });
    await bare.close();
  });

  it("an UNCONFIGURED host REFUSES rather than answering the same empty shape", async () => {
    /**
     * **The mutant this exists for is the stub, and it is the most dangerous shape in this change.**
     * "Unnamed org, no branches" is the correct answer for every tenant today, so a stub returning
     * it would be indistinguishable from a working implementation now — and would stay
     * indistinguishable after provisioning filled the tables, leaving a naming surface frozen at
     * "unnamed" with `pnpm verify` exit 0 and `seams:check` clean. AGENTS.md measured that Rule B
     * "asks whether an optional member is *supplied*, never whether what was supplied is *real*".
     * The refusal is what makes the two worlds separable at all.
     */
    await expect(unconfiguredTenancyDirectory().directory(ORG)).rejects.toThrow(
      /tenancy directory not configured/,
    );
  });
});
