/**
 * `14-F12` + `14-F13` on the cloud plane — the device list, the kill switch, and the ACTOR.
 *
 * **What this file is here to catch is not "does revoke work".** `services/sync-gateway`'s
 * `revocable.test.ts` already proves a revocation evicts a live session, against real Postgres and
 * from another process. What had never existed is the half `14-F13` actually specifies: revocation
 * from an **authenticated** back-office screen, gated by the matrix, recording **who**. Three
 * things had to land for that, and each gets an assertion here:
 *
 *   1. a permission action to gate it (`14-F30`'s `device.manage`) — §A;
 *   2. an attributed ledger record (`device.revoked` carrying `actor_user_id`) — §B;
 *   3. a list that joins the registry's state to that attribution — §C.
 *
 * The adapter is driven over a **real loopback socket** against `fake-gateway.ts`, for that file's
 * recorded reason: the question is whether an HTTP request left this process carrying the right
 * bytes, and a stubbed `fetch` answers a different question.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — this file was written by the session that wrote `14-F30`
 * and `device-router.ts`, so `24 §3`'s independent-oracle guarantee is not available and is not
 * claimed. The mutation matrix in `services/api/CLAUDE.md` is what stands in for it.
 */

import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DeviceRecord, withActors } from "../devices.js";
import { createGatewayDeviceDirectory } from "../gateway-client.js";
import { appRouter } from "../router.js";
import { createApiServer } from "../server.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";
import { type FakeGateway, startFakeGateway } from "./fake-gateway.js";

const ORG = "org-devices";
const BRANCH = "branch-devices";
const SECRET = "devices-acceptance-session-secret-not-a-real-one";
const PASSWORD = "a-bootstrap-owner-password";

const OWNER_ID = "user-owner";
const MANAGER_ID = "user-manager";
/**
 * A branch manager assigned **org-wide** (`branch_id: null`), and the reason this file has two
 * managers rather than one.
 *
 * Neither device procedure states a `branch_id` (`devices.ts` — the branch is learned by reading
 * the registry, which happens *inside* the revocation, so a caller-stated branch would be checked
 * after the destructive act). `branchOf` therefore resolves the scope to `null`, and `rolesAt`
 * matches only org-wide assignments against a `null` branch — so `MANAGER_ID` above is refused by
 * **scope resolution before the matrix cell is ever read**. That refusal is real and worth keeping,
 * but it is not `14-F30`'s cell: a senior review measured that the branch-scoped test passes
 * unchanged under `device.manage` widened to `branch_manager: "allow"`, leaving this service with
 * **no coverage of the cell for any non-owner role**. This subject reaches the matrix.
 */
const MANAGER_ORG_ID = "user-manager-org";
const CASHIER_ID = "user-cashier";

/** Server time is injected (`18 §4`) and MOVES, so `server_received_at` can be asserted exactly. */
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
      email: "owner@devices.test",
      password_hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    {
      user_id: MANAGER_ID,
      org_id: ORG,
      email: "manager@devices.test",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH, status: "active" }],
    },
    {
      user_id: MANAGER_ORG_ID,
      org_id: ORG,
      email: "manager-org@devices.test",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: null, status: "active" }],
    },
    {
      user_id: CASHIER_ID,
      org_id: ORG,
      email: "cashier@devices.test",
      password_hash,
      assignments: [{ role: "cashier", branch_id: BRANCH, status: "active" }],
    },
  ];
};

type Reply = { status: number; body: unknown };

const call = async (path: string, who: string | null, input?: unknown): Promise<Reply> => {
  const bearer = who === null ? undefined : `Bearer ${tokens.get(who) as string}`;
  const isMutation = input !== undefined;
  const response = await app.inject({
    method: isMutation ? "POST" : "GET",
    url: isMutation ? `/trpc/${path}` : `/trpc/${path}?input=${encodeURIComponent("{}")}`,
    ...(bearer === undefined ? {} : { headers: { authorization: bearer } }),
    ...(isMutation ? { payload: superjson.serialize(input) as object } : {}),
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
  app = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now,
    devices: createGatewayDeviceDirectory({ base_url: gateway.url, token: gateway.token }),
  });
  await login("owner@devices.test", OWNER_ID);
  await login("manager@devices.test", MANAGER_ID);
  await login("manager-org@devices.test", MANAGER_ORG_ID);
  await login("cashier@devices.test", CASHIER_ID);

  /**
   * ⚠ **THE STORE THIS ORG'S EVENTS SHARE — seeded so every read below runs the production shape.**
   *
   * `01-F62`'s org store is ONE endpoint holding the whole org-scoped set, and `services/api` itself
   * writes `catalog.changed` into it for this same org on every publish
   * (`createGatewayLedgerAppender.append`). So the moment an org has ever published a menu, its
   * `/internal/org-events` read carries rows `DeviceRevokedPayload` cannot parse — which is exactly
   * why `createGatewayDeviceDirectory.revocations` filters to `device.revoked` before parsing, the
   * mirror of the filter `createGatewayLedgerAppender.history` applies in the other direction.
   *
   * Until this seed, **no fixture in this file put a non-`device.revoked` row in the store**, so
   * deleting that filter failed 0 of 167 tests while `devices.list` would 500 in production for any
   * org with a menu — the screen an owner opens to kill a stolen tablet. `fake-gateway.ts` preserves
   * `type` as sent *specifically* so an adapter reading it back unfiltered would be caught, and the
   * capability was never pointed at the case: AGENTS.md's round-3 defect, and the reason this is a
   * fixture rather than only an assertion — the whole file now runs against a mixed store.
   * `catalog-adapter.test.ts`'s *"keeps 01-F62's other org-scoped types out of 14-F3's price
   * history"* is the same fixture one adapter over, and it already existed.
   */
  await fetch(`${gateway.url}/internal/org-events`, {
    method: "POST",
    headers: { authorization: `Bearer ${gateway.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      org_id: ORG,
      type: "catalog.changed",
      actor_user_id: OWNER_ID,
      server_received_at: 1_700_000_000_001,
      payload: {
        entity: "item",
        entity_id: "item-biryani",
        version: 1,
        before_ref: null,
        after_ref: "sha-after",
        price_changes: [],
      },
    }),
  });

  gateway.registerDevice(ORG, {
    device_id: "device-counter-1",
    branch_id: BRANCH,
    device_class: "counter",
    // `01-F70` — this one IS named, so the projection has something to drop if it stops carrying it.
    display_name: "Front counter till",
    revoked_at: null,
    token_expires_at: 1_900_000_000_000,
  });
  gateway.registerDevice(ORG, {
    device_id: "device-kds-1",
    branch_id: BRANCH,
    device_class: "kds",
    // `01-F70` UNNAMED — a row provisioned before `0010`. Both cases must survive the same list.
    display_name: null,
    revoked_at: null,
    token_expires_at: 1_900_000_000_000,
  });
  /** Already revoked, by nobody the ledger knows — i.e. by the CLI. `revoked_by` must be null. */
  gateway.registerDevice(ORG, {
    device_id: "device-cli-revoked",
    branch_id: BRANCH,
    device_class: "counter",
    display_name: null,
    revoked_at: 1_700_000_000_000,
    token_expires_at: 1_900_000_000_000,
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await gateway?.close();
});

// ── §A — Commandment 8: the surface is gated, and gated on the OWNER cell ────────────────────

describe("§A — device.manage gates both procedures (14-F30, Commandment 8)", () => {
  it("an unauthenticated caller reaches neither", async () => {
    expect((await call("devices.list", null)).status).toBe(401);
    expect((await call("devices.revoke", null, { device_id: "device-kds-1" })).status).toBe(401);
  });

  it("a BRANCH-SCOPED manager is refused both — by scope resolution, before the cell (14-F30)", async () => {
    // ⚠ **THIS TEST DOES NOT OWN THE MATRIX CELL, AND ITS COMMENT ONCE CLAIMED IT DID.** It said
    // "the mutant this exists for is `device.manage` widened to `branch_manager: allow`" — and a
    // senior review measured that it PASSES under exactly that mutant. Neither procedure states a
    // `branch_id`, so `branchOf` resolves the scope to `null` and `rolesAt` drops this subject's
    // branch assignment before `can()` reads any cell: the 403 here is scope, not policy. That is a
    // real property and worth pinning — a branch-scoped subject must not reach an org-wide act — so
    // the test stays with its title corrected. The cell itself is owned by the test below, which
    // uses an ORG-WIDE manager and is the one that dies under D1.
    const list = await call("devices.list", MANAGER_ID);
    expect(list.status).toBe(403);
    const revoke = await call("devices.revoke", MANAGER_ID, { device_id: "device-kds-1" });
    expect(revoke.status).toBe(403);
    // …and the refusal names the action, so the client is not guessing which check failed.
    expect(JSON.stringify(revoke.body)).toContain("device.manage");
  });

  it("an ORG-WIDE manager is REFUSED both — the CELL is deny, not optional (14-F30)", async () => {
    // The mutant this exists for is `device.manage` widened to `branch_manager: "allow"` — the
    // plausible-looking wrong reading of doc 14 §1's "Used by owners, permitted managers". Doc 14
    // §9 q1 says a manager's back-office reach is an OPEN QUESTION, so the matrix may not answer it
    // here, and `packages/domain`'s own D1 mutant row is this cell.
    //
    // This subject's assignment is org-wide, so it survives `rolesAt` against the `null` scope both
    // procedures resolve to and the refusal can only come from the matrix. Without it, `14-F30`'s
    // cell has NO coverage on this plane for any non-owner role: every other refusal in this file
    // is scope resolution wearing a 403.
    const list = await call("devices.list", MANAGER_ORG_ID);
    expect(list.status).toBe(403);
    const revoke = await call("devices.revoke", MANAGER_ORG_ID, { device_id: "device-kds-1" });
    expect(revoke.status).toBe(403);
    expect(JSON.stringify(revoke.body)).toContain("device.manage");
  });

  it("a cashier is refused both", async () => {
    expect((await call("devices.list", CASHIER_ID)).status).toBe(403);
    expect((await call("devices.revoke", CASHIER_ID, { device_id: "device-kds-1" })).status).toBe(
      403,
    );
  });

  it("a REFUSED revoke changed nothing at the gateway — refusal is before the write", async () => {
    // The assertion that separates "the request was refused" from "the request was refused after
    // it had already killed the till". Without it §A proves only that a status code came back.
    const row = gateway.devices(ORG).find((d) => d.device_id === "device-kds-1");
    expect(row?.revoked_at).toBeNull();
  });

  it("the owner IS allowed the list — the control for every refusal above", async () => {
    // Without this, every §A assertion also passes against a surface that refuses everyone, which
    // is the shape a broken gate and a correct one share.
    const list = await call("devices.list", OWNER_ID);
    expect(list.status).toBe(200);
    expect((list.body as readonly unknown[]).length).toBe(3);
  });
});

// ── §B — 14-F13's ACTOR. The reason this could not be a shell command. ───────────────────────

describe("§B — the revocation is attributed to the authenticated owner (14-F13, 01-F62)", () => {
  it("revoking sets revoked_at at the GATEWAY — the act that actually stops the till", async () => {
    const reply = await call("devices.revoke", OWNER_ID, { device_id: "device-counter-1" });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      device_id: "device-counter-1",
      branch_id: BRANCH,
      device_class: "counter",
      already: false,
      revoked_by: OWNER_ID,
    });
    // `01-F48` reads THIS field, not the ledger. If only the event were written the till would go
    // on selling under a history row saying it had been switched off.
    const row = gateway.devices(ORG).find((d) => d.device_id === "device-counter-1");
    expect(row?.revoked_at).toEqual(expect.any(Number));
  });

  it("a `device.revoked` org event carries the ACTOR and the device (14-F13, 01-F62)", () => {
    const events = gateway
      .orgEvents()
      .filter((event) => event.type === "device.revoked" && event.org_id === ORG);
    expect(events).toHaveLength(1);
    const [event] = events as [(typeof events)[number]];
    // The field the whole FR turns on. `revoke-device.ts` could only ever have written `null`.
    expect(event).toMatchObject({ actor_user_id: OWNER_ID });
    expect(event.payload).toEqual({
      device_id: "device-counter-1",
      branch_id: BRANCH,
      device_class: "counter",
    });
  });

  it("its `server_received_at` is the INJECTED clock, not a wall clock (18 §4, 01-F62)", () => {
    const event = gateway
      .orgEvents()
      .find((candidate) => candidate.type === "device.revoked") as unknown as {
      server_received_at: number;
    };
    // The fixture clock starts at 1.8e12 and only this host advances it; `Date.now()` today is
    // past 1.75e12 and climbing, so the assertion is that the value came from OUR clock — it is
    // bounded above by the clock's current reading, which a real wall clock would exceed only by
    // coincidence and never by construction.
    expect(event.server_received_at).toBeGreaterThanOrEqual(1_800_000_000_000);
    expect(event.server_received_at).toBeLessThanOrEqual(clock);
  });

  it("the REGISTRY write precedes the ledger append (01-F48 fail-closed ordering)", () => {
    const paths = gateway.received.map((entry) => entry.path);
    const wrote = paths.indexOf("/internal/devices/revoke");
    const appended = paths.lastIndexOf("/internal/org-events");
    expect(wrote).toBeGreaterThanOrEqual(0);
    expect(appended).toBeGreaterThan(wrote);
  });

  it("a SECOND revoke of the same device appends NOTHING and claims no credit (01-F1)", async () => {
    const reply = await call("devices.revoke", OWNER_ID, { device_id: "device-counter-1" });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ already: true, revoked_by: null });
    // The instant did not move, so attributing it to today's owner would be a false record in an
    // append-only store. Still exactly one event.
    expect(gateway.orgEvents().filter((event) => event.type === "device.revoked")).toHaveLength(1);
  });

  it("an UNREGISTERED device is a loud refusal, not a silent success", async () => {
    const reply = await call("devices.revoke", OWNER_ID, { device_id: "device-never-existed" });
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(reply.body)).toContain("NOT REGISTERED");
    // …and nothing was attributed for it.
    expect(gateway.orgEvents().filter((event) => event.type === "device.revoked")).toHaveLength(1);
  });

  it("there is NO un-revoke procedure (14-F30 — the corpus is silent, not permissive)", () => {
    // Read off the shipped router, so this is a statement about what the product exposes rather
    // than about what this file remembered to call. Nothing in the corpus describes reinstating a
    // revoked device — no FR, no `DECISIONS.md` row — and `01-N5`'s replacement path is a fresh
    // `device_id`. A restore control would be inventing security policy (Commandment 2), and it is
    // exactly the defect `provision-device` removed (`on conflict … set revoked_at = null`).
    const procedures = Object.keys(appRouter._def.procedures)
      .filter((name) => name.startsWith("devices."))
      .sort();
    expect(procedures).toEqual(["devices.list", "devices.revoke"]);
  });
});

// ── §C — 14-F12's list "shows revoked state and actor" ───────────────────────────────────────

describe("§C — the list joins registry state to ledger attribution (14-F12, 14-F13)", () => {
  it("a device revoked HERE shows its actor", async () => {
    const rows = (await call("devices.list", OWNER_ID)).body as readonly {
      device_id: string;
      revoked_at: number | null;
      revoked_by: string | null;
    }[];
    const revoked = rows.find((row) => row.device_id === "device-counter-1");
    expect(revoked?.revoked_at).toEqual(expect.any(Number));
    expect(revoked?.revoked_by).toBe(OWNER_ID);
  });

  it("a device revoked by the CLI shows revoked state and NO actor — not a blank, a null", async () => {
    // The honest case, and the one a screen must not paper over. `revoke-device.ts` writes no
    // event by design, so this state is producible today and will remain so until `01-F25`'s
    // pairing code gives registration an authenticated path.
    const rows = (await call("devices.list", OWNER_ID)).body as readonly {
      device_id: string;
      revoked_at: number | null;
      revoked_by: string | null;
    }[];
    const cli = rows.find((row) => row.device_id === "device-cli-revoked");
    expect(cli?.revoked_at).toBe(1_700_000_000_000);
    expect(cli?.revoked_by).toBeNull();
  });

  it("an ACTIVE device shows neither — the control that makes the two above mean something", async () => {
    const rows = (await call("devices.list", OWNER_ID)).body as readonly {
      device_id: string;
      revoked_at: number | null;
      revoked_by: string | null;
      device_class: string;
      branch_id: string;
    }[];
    const live = rows.find((row) => row.device_id === "device-kds-1");
    expect(live?.revoked_at).toBeNull();
    expect(live?.revoked_by).toBeNull();
    // …and `14-F12`'s one column this table can honestly answer.
    expect(live?.device_class).toBe("kds");
    expect(live?.branch_id).toBe(BRANCH);
  });

  it("survives 01-F62's OTHER org-scoped types in the same store (14-F12)", async () => {
    // The production failure this owns, stated as its own assertion rather than left implicit in
    // the fixture: `01-F62`'s store is SHARED, and this service writes `catalog.changed` into it
    // for this same org on every publish. An adapter that parsed every row as a revocation would
    // throw on the first one, so `devices.list` would 500 for any org that has ever published a
    // menu — and it is the screen an owner opens to kill a stolen tablet. The `beforeAll` seed is
    // what makes this reachable; the assertion is what names it.
    const reply = await call("devices.list", OWNER_ID);
    expect(reply.status).toBe(200);
    const rows = reply.body as readonly { device_id: string; revoked_by: string | null }[];
    // …and the foreign row is IGNORED, not merely survived: it contributes no phantom device and
    // attributes nobody. A filter that dropped `device.revoked` instead would also answer 200.
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.device_id === "device-counter-1")?.revoked_by).toBe(OWNER_ID);
  });
});

// ── §D — `withActors` directly, on the two states no fixture in this service can produce ─────

describe("§D — the join's own contract (14-F13, 01-F1)", () => {
  // ⚠ THIS BLOCK EXISTS BECAUSE THE MUTATION RUN FOUND IT MISSING, and the shape is AGENTS.md's
  // named defect: a mechanism built correctly and never aimed at the case it exists for. Flipping
  // `withActors`'s earliest/latest comparison killed **0 of 162** tests, and rendering an actor for
  // an ACTIVE device killed 0 as well — every fixture above has exactly one event per device and
  // no event on a live one, so both branches were decoration. They are driven here directly, since
  // this service cannot produce either state through its own procedures.

  const device = (over: Partial<DeviceRecord> = {}): DeviceRecord => ({
    device_id: "d1",
    branch_id: BRANCH,
    device_class: "counter",
    display_name: null,
    revoked_at: 5_000,
    token_expires_at: null,
    ...over,
  });

  it("attributes the EARLIEST revocation, not the latest", () => {
    // Reachable the day doc 15 lands: `15 §2` emits `device.revoked` (support-initiated) into the
    // same org store this reads. The registry stamps only the FIRST revocation, so the actor that
    // matches `revoked_at` is the first one — naming the second would credit the wrong person with
    // switching off a till, permanently (`01-F1`).
    const rows = withActors(
      [device()],
      [
        { device_id: "d1", actor_user_id: "user-second", server_received_at: 9_000 },
        { device_id: "d1", actor_user_id: "user-first", server_received_at: 4_000 },
      ],
    );
    expect(rows[0]?.revoked_by).toBe("user-first");
  });

  it("…in either arrival order — the answer is the instant, not the array's shape", () => {
    const rows = withActors(
      [device()],
      [
        { device_id: "d1", actor_user_id: "user-first", server_received_at: 4_000 },
        { device_id: "d1", actor_user_id: "user-second", server_received_at: 9_000 },
      ],
    );
    expect(rows[0]?.revoked_by).toBe("user-first");
  });

  it("gives an ACTIVE device NO actor even when an event names it", () => {
    // There is no un-revocation anywhere in this product (`14-F30`), so an active device with a
    // `device.revoked` event means something upstream is wrong — and rendering an actor beside it
    // would tell an owner a live till had been switched off.
    const rows = withActors(
      [device({ revoked_at: null })],
      [{ device_id: "d1", actor_user_id: "user-first", server_received_at: 4_000 }],
    );
    expect(rows[0]?.revoked_at).toBeNull();
    expect(rows[0]?.revoked_by).toBeNull();
  });

  it("CONTROL — a revoked device with a matching event DOES get one", () => {
    // Without this the two assertions above are satisfied by a join that returns null always.
    const rows = withActors(
      [device()],
      [{ device_id: "d1", actor_user_id: "user-first", server_received_at: 4_000 }],
    );
    expect(rows[0]?.revoked_by).toBe("user-first");
  });

  it("an event for ANOTHER device does not attribute this one", () => {
    const rows = withActors(
      [device()],
      [{ device_id: "d2", actor_user_id: "user-first", server_received_at: 4_000 }],
    );
    expect(rows[0]?.revoked_by).toBeNull();
  });
});
