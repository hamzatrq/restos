/**
 * **`14-F14`'s USER CRUD ON THE CLOUD PLANE — gated by `user.manage`, and `user.changed` WITH A
 * PRODUCER.**
 *
 * AUTHORSHIP: authored from spec text ONLY, by a session that wrote no implementation and read no
 * implementation plan for this step (`24 §3`). Every policy cites an FR that resolves.
 *
 * PROVENANCE — read verbatim:
 *   · `14-F14` — user CRUD, role × per-location assignment, PIN set/reset, deactivation.
 *   · `14-F39` — `user.manage`, **owner-only**, and: "`01-F71` still binds underneath it: the org
 *     comes from the authenticated subject and never from the request, so an owner of one org
 *     cannot reach another's roster through a procedure this action allows."
 *   · `14-F2` — "Every settings change emits `config.changed` with actor … No silent edits exist";
 *     doc 14 §2 lists the sibling: "`user.changed` (extension: create / role change / PIN reset —
 *     PINs stored Argon2id, **never present in payloads**)".
 *   · `01-F62` — `user.changed` is ORG-SCOPED: its only legitimate emitter is the cloud plane.
 *   · `11-F21` — the cloud holds a HASH and "it is never a PIN and never leaves the process that
 *     verifies it"; no procedure returns one, no payload carries one, no log records one.
 *   · Founder rulings R29 (the owner sets the first PIN and tells her) and R30 (a till-only cashier
 *     has no email).
 *
 * ── ⚠ THE ASSERTION THIS FILE EXISTS FOR ────────────────────────────────────────────────────────
 *
 * `01-F4` makes an unschema'd type unemittable, and this repo's recorded failure is the mirror
 * image: `audit.print_acknowledged` sat in the `01 §4` catalog with **nothing emitting it**, and
 * `pnpm seams:check` is blind to that by construction — "a key in an object literal is not an
 * export". `user.changed` is in `ORG_SCOPED_EVENT_TYPES` today and `appendOrgEvent` would accept
 * one; what has never existed is a caller.
 *
 * So **nothing here asserts that a payload schema parses.** §B asserts that performing each act
 * puts a record in the `01-F62` store with the ACTOR on it. A suite that blessed a declared but
 * unemitted type is the exact defect this step was scoped to avoid, and `14-F39` says why it is
 * not a follow-up: "a user CRUD shipped without a payload to emit does not ship an unledgered
 * feature — it ships a `14-F2` violation, and the act it fails to record is a change to who may
 * sell in a restaurant, permanent under `01-F1`."
 *
 * ── CONTRACTED SURFACE (binding on the implementation session) ──────────────────────────────────
 *
 * The corpus decides the acts, the gate and the ledger record. It does not name procedures, a port
 * or an options key, so these are pinned HERE and are **contestable** — the shapes follow
 * `devices.ts` / `device-router.ts`, which `14-F30` landed one §3 block up for the same reasons.
 *
 *   `ApiContext.users` / `ApiServerOptions.users?: UserDirectory` — optional at the type and
 *   REQUIRED once resolved, exactly as `devices` is, with a fallback that REFUSES every call
 *   rather than answering emptily (see §E and `unconfiguredDeviceDirectory`'s recorded reason).
 *
 *   `unconfiguredUserDirectory()` — that fallback, **exported from this package's barrel** as
 *   `unconfiguredDeviceDirectory` already is. §E asserts against it DIRECTLY and cannot do the job
 *   from the HTTP surface alone: `users.create` calls the port twice (the write, then `14-F2`'s
 *   record), so a fallback whose `create` fabricated a `{user_id}` and whose `recordChange` went on
 *   refusing produces exactly the status a correct one does — measured, that mutant survives the
 *   package at 310/310. A barrel is a declared surface where a filename is not, which is why the
 *   name and not the module is what this pins.
 *
 *   type UserDirectory = {
 *     list(org_id): Promise<readonly { user_id; display_name; email; grid_ordinal;
 *                                      assignments: {role; branch_id; status}[] }[]>;
 *     create(a: {org_id; display_name; email; assignments; actor_user_id; now})
 *                                                    → Promise<{user_id; grid_ordinal}>;
 *     setAssignments(a: {org_id; user_id; assignments; actor_user_id; now}) → Promise<void>;
 *     setPin(a: {org_id; user_id; pin_hash; actor_user_id; now})           → Promise<void>;
 *     setStatus(a: {org_id; user_id; branch_id; status; actor_user_id; now}) → Promise<void>;
 *     recordChange(r: {org_id; actor_user_id; server_received_at; payload}) → Promise<void>;
 *   }
 *
 *   appRouter.users — every one built with `authorized("user.manage")`:
 *     users.list       ()                                   query
 *     users.create     ({display_name, email, assignments})  mutation → {user_id, grid_ordinal}
 *     users.setAssignments ({user_id, assignments})          mutation
 *     users.setPin     ({user_id, pin})                      mutation
 *     users.deactivate ({user_id, branch_id})                mutation
 *
 * Three of those are argued rather than assumed:
 *
 *   · **`setPin` takes the PLAINTEXT and this service hashes it.** R29 rules that the owner types
 *     her cashier's PIN, so a plaintext necessarily crosses from the browser to here; `11-F21`
 *     puts the Argon2id call at ONE site (`domain`'s `hashPin`, `01-F61`'s cost floor) and
 *     `setPinCredential` in the gateway takes a hash. This is the boundary the plaintext stops at,
 *     which is what §D measures.
 *   · **`recordChange` is on the users port and its `payload` is `unknown`.** `device.revoked`
 *     already ships this shape (`DeviceDirectory.recordRevocation` → `/internal/org-events`),
 *     because `01-F62`/T-01-09 put the emission on the doc-14 emitter — the gateway has no
 *     authenticated user to attribute it to. `payload` is left `unknown` on purpose: doc 14 §9.11
 *     records its CONTENT as open, and an oracle that pinned it would answer a founder's question.
 *   · **No procedure takes an `org_id`.** `01-F71` (b): "the org is taken from the authenticated
 *     subject and never from the request". §C sends one anyway, to prove it reaches nothing.
 *
 * ── WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT ────────────────────────────────────────────────
 *
 *   · The `user.changed` payload's fields (§9.11, open). §B asserts only that the act is
 *     identified, unattributable-to-nobody, PIN-free, and that a PIN reset and a departure are
 *     told apart — which `14-F2`'s "no silent edits exist" requires of any content.
 *   · The composition root's wiring (`server.ts` building a real `createGatewayUserDirectory`
 *     rather than the refusing fallback). `device-seam.test.ts` answers the equivalent question by
 *     SPAWNING the declared `start` script, and this package carries a documented flake class
 *     around subprocess oracles under contention. §E asserts the property that makes the mutant
 *     loud instead of silent — an unconfigured host REFUSES rather than answering `[]` — and the
 *     spawned seam is reported as owed rather than half-built here.
 *   · Rate limiting, lockout and `14-F15`'s per-user history, all owed elsewhere.
 */

import { createServer, type Server } from "node:http";
import { hashPin, PERMISSION_ACTIONS, verifyPin } from "@restos/domain";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApiServer } from "../server.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";

const ORG = "org-users-acceptance";
const OTHER_ORG = "org-users-acceptance-other";
const BRANCH = "branch-users-a";
const BRANCH_B = "branch-users-b";
const SECRET = "users-acceptance-session-secret-not-a-real-one";
const PASSWORD = "a-bootstrap-owner-password";

const OWNER_ID = "user-owner";
const MANAGER_ID = "user-manager";
/**
 * A branch manager assigned ORG-WIDE, and the reason this file has two managers rather than one.
 *
 * `devices.test.ts` records what a senior review measured on the neighbouring surface: a
 * BRANCH-scoped subject is refused by `branchOf`/`rolesAt` **before the matrix cell is ever read**,
 * so a test using one passes unchanged under the mutant that widens the cell to
 * `branch_manager: "allow"` — leaving this service with no coverage of `14-F39`'s cell for any
 * non-owner role. This subject survives scope resolution and reaches `can()`.
 */
const MANAGER_ORG_ID = "user-manager-org";
const CASHIER_ID = "user-cashier";

/** Server time is injected (`18 §4`) and MOVES, so `server_received_at` can be asserted exactly. */
let clock = 1_800_000_000_000;
const now = (): number => (clock += 1_000);

/* ── the contracted port, and an in-memory implementation of it ──────────────────────────────── */

type AssignmentInput = { readonly role: string; readonly branch_id: string | null };
type StoredAssignment = AssignmentInput & { readonly status: string };

type PersonListing = {
  readonly user_id: string;
  readonly display_name: string;
  readonly email: string | null;
  readonly grid_ordinal: number;
  readonly assignments: readonly StoredAssignment[];
};

type ChangeRecord = {
  readonly org_id: string;
  readonly actor_user_id: string;
  readonly server_received_at: number;
  readonly payload: unknown;
};

type UserDirectory = {
  list(org_id: string): Promise<readonly PersonListing[]>;
  create(args: {
    org_id: string;
    display_name: string;
    email: string | null;
    assignments: readonly AssignmentInput[];
    actor_user_id: string;
    now: number;
  }): Promise<{ user_id: string; grid_ordinal: number }>;
  setAssignments(args: {
    org_id: string;
    user_id: string;
    assignments: readonly AssignmentInput[];
    actor_user_id: string;
    now: number;
  }): Promise<void>;
  setPin(args: {
    org_id: string;
    user_id: string;
    pin_hash: string;
    actor_user_id: string;
    now: number;
  }): Promise<void>;
  setStatus(args: {
    org_id: string;
    user_id: string;
    branch_id: string | null;
    status: string;
    actor_user_id: string;
    now: number;
  }): Promise<void>;
  recordChange(record: ChangeRecord): Promise<void>;
};

type FakeDirectory = UserDirectory & {
  /** Every call this port received, in arrival order — the "did the act reach the writer" question. */
  readonly calls: { method: string; args: Record<string, unknown> }[];
  readonly changes: ChangeRecord[];
  people(org_id: string): readonly PersonListing[];
  pinHash(org_id: string, user_id: string): string | undefined;
  seed(org_id: string, person: PersonListing): void;
};

/**
 * An in-memory `UserDirectory` that reproduces the REFUSALS the real writer makes and nothing else.
 *
 * ⚠ **The cross-tenant refusal is reproduced deliberately and is not a convenience.** The real
 * `setUserStatus`/`setPinCredential` throw by name for a person who is not in the stated org
 * ("A status set for nobody reads exactly like a status that was set"), and §C's whole question is
 * whether `services/api` passes the SUBJECT's org and then surfaces that refusal instead of
 * reporting success. A fake that answered every call would make §C unable to tell a correct
 * implementation from one that reports success over another tenant's cashier. Everything else the
 * real writer does — grid ordinals, publication, R32's credential deletion — is asserted against
 * real Postgres in `services/sync-gateway/src/__acceptance__/user-crud-http.test.ts`; a second copy
 * here would let this suite pass on this file's opinion of the rules.
 */
const createFakeDirectory = (): FakeDirectory => {
  const byOrg = new Map<string, PersonListing[]>();
  const credentials = new Map<string, string>();
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const changes: ChangeRecord[] = [];
  let minted = 0;

  const rows = (org_id: string): PersonListing[] => {
    const held = byOrg.get(org_id) ?? [];
    byOrg.set(org_id, held);
    return held;
  };

  const mustFind = (org_id: string, user_id: string): PersonListing => {
    const person = rows(org_id).find((row) => row.user_id === user_id);
    if (person === undefined) {
      throw new RangeError(
        `no person ${user_id} in org ${org_id} — nothing was changed (11-F20, 01-F71). A write ` +
          "aimed at nobody reads exactly like a write that happened.",
      );
    }
    return person;
  };

  const replace = (org_id: string, next: PersonListing): void => {
    const held = rows(org_id);
    held.splice(
      held.findIndex((row) => row.user_id === next.user_id),
      1,
      next,
    );
  };

  return {
    calls,
    changes,
    people: (org_id) => [...rows(org_id)],
    pinHash: (org_id, user_id) => credentials.get(`${org_id} ${user_id}`),
    seed: (org_id, person) => {
      rows(org_id).push(person);
    },
    list: async (org_id) => {
      calls.push({ method: "list", args: { org_id } });
      return [...rows(org_id)];
    },
    create: async (args) => {
      calls.push({ method: "create", args: { ...args } });
      minted += 1;
      const user_id = `minted-user-${minted}`;
      const grid_ordinal =
        rows(args.org_id).reduce((high, row) => Math.max(high, row.grid_ordinal), 0) + 10;
      rows(args.org_id).push({
        user_id,
        display_name: args.display_name,
        email: args.email,
        grid_ordinal,
        assignments: args.assignments.map((assignment) => ({ ...assignment, status: "active" })),
      });
      return { user_id, grid_ordinal };
    },
    setAssignments: async (args) => {
      calls.push({ method: "setAssignments", args: { ...args } });
      const person = mustFind(args.org_id, args.user_id);
      replace(args.org_id, {
        ...person,
        assignments: args.assignments.map((assignment) => ({ ...assignment, status: "active" })),
      });
    },
    setPin: async (args) => {
      calls.push({ method: "setPin", args: { ...args } });
      mustFind(args.org_id, args.user_id);
      credentials.set(`${args.org_id} ${args.user_id}`, args.pin_hash);
    },
    setStatus: async (args) => {
      calls.push({ method: "setStatus", args: { ...args } });
      const person = mustFind(args.org_id, args.user_id);
      const next = person.assignments.map((assignment) =>
        assignment.branch_id === args.branch_id
          ? { ...assignment, status: args.status }
          : assignment,
      );
      replace(args.org_id, { ...person, assignments: next });
      // R32, as the real writer does it: keyed to the LAST active assignment, never to one branch's.
      if (!next.some((assignment) => assignment.status === "active")) {
        credentials.delete(`${args.org_id} ${args.user_id}`);
      }
    },
    recordChange: async (record) => {
      calls.push({ method: "recordChange", args: { ...record } });
      changes.push(record);
    },
  };
};

/* ── the host ───────────────────────────────────────────────────────────────────────────────── */

let directory: FakeDirectory;
let app: Awaited<ReturnType<typeof createApiServer>>;
let bare: Awaited<ReturnType<typeof createApiServer>>;
const tokens = new Map<string, string>();

const users = async (): Promise<UserRecord[]> => {
  const password_hash = await hashPin(PASSWORD);
  return [
    {
      user_id: OWNER_ID,
      org_id: ORG,
      email: "owner@users.test",
      password_hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    {
      user_id: MANAGER_ID,
      org_id: ORG,
      email: "manager@users.test",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH, status: "active" }],
    },
    {
      user_id: MANAGER_ORG_ID,
      org_id: ORG,
      email: "manager-org@users.test",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: null, status: "active" }],
    },
    {
      user_id: CASHIER_ID,
      org_id: ORG,
      email: "cashier@users.test",
      password_hash,
      assignments: [{ role: "cashier", branch_id: BRANCH, status: "active" }],
    },
  ];
};

type Reply = { status: number; body: unknown };

const query = async (path: string, who: string | null): Promise<Reply> => {
  const bearer = who === null ? undefined : `Bearer ${tokens.get(who) as string}`;
  const response = await app.inject({
    method: "GET",
    url: `/trpc/${path}?input=${encodeURIComponent("{}")}`,
    ...(bearer === undefined ? {} : { headers: { authorization: bearer } }),
  });
  const raw = response.json() as { result?: { data?: unknown }; error?: unknown };
  const data =
    raw.result?.data === undefined ? undefined : superjson.deserialize(raw.result.data as never);
  return { status: response.statusCode, body: raw.error ?? data };
};

const mutate = async (
  path: string,
  who: string | null,
  input: unknown,
  host: Awaited<ReturnType<typeof createApiServer>> = app,
): Promise<Reply> => {
  const bearer = who === null ? undefined : `Bearer ${tokens.get(who) as string}`;
  const response = await host.inject({
    method: "POST",
    url: `/trpc/${path}`,
    ...(bearer === undefined ? {} : { headers: { authorization: bearer } }),
    payload: superjson.serialize(input) as object,
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

/**
 * `users.create` that FAILS BY NAME. Every §B..§D assertion is about a person this was supposed to
 * have created, and every one of them passes vacuously against a person who never existed — the
 * round-3 law's "guard never pointed at the dangerous case".
 */
const mustCreate = async (input: {
  display_name: string;
  email: string | null;
  assignments: readonly AssignmentInput[];
}): Promise<string> => {
  const reply = await mutate("users.create", OWNER_ID, input);
  if (reply.status !== 200) {
    throw new Error(
      `fixture: users.create refused ${input.display_name} with ${reply.status} — ` +
        `${JSON.stringify(reply.body)}. 14-F14's create is the first act of this surface.`,
    );
  }
  const { user_id } = reply.body as { user_id?: unknown };
  if (typeof user_id !== "string") {
    throw new Error(
      `users.create answered 200 without a user_id: ${JSON.stringify(reply.body)}. The writer ` +
        "mints it (01-F61 appends the grid ordinal in the same transaction), so the caller has no " +
        "other way to learn it.",
    );
  }
  return user_id;
};

beforeAll(async () => {
  directory = createFakeDirectory();
  app = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now,
    users: directory,
    // The cast is `publishCatalog`'s own precedent — "the only honest way to ask a question the
    // type says cannot arise". `ApiServerOptions` grows a `users` member with this step; until it
    // does, the excess-property check would take the whole file down as a typecheck error rather
    // than as named failures.
  } as unknown as Parameters<typeof createApiServer>[0]);

  // A host that declared NO user directory — its own instance, because §E's question is what
  // `createApiServer` does with an ABSENT dependency and not what a flag on one instance does.
  bare = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now,
  });

  await login("owner@users.test", OWNER_ID);
  await login("manager@users.test", MANAGER_ID);
  await login("manager-org@users.test", MANAGER_ORG_ID);
  await login("cashier@users.test", CASHIER_ID);

  // ANOTHER TENANT's person, seeded directly. `01-F71` is unfalsifiable with one org in the
  // fixture: "a suite exercising one tenant passes with all four [enforcement points] deleted."
  directory.seed(OTHER_ORG, {
    user_id: "their-cashier",
    display_name: "Their Cashier",
    email: null,
    grid_ordinal: 10,
    assignments: [{ role: "cashier", branch_id: "their-branch", status: "active" }],
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await bare?.close();
});

// ── §A — Commandment 8: gated, and gated on 14-F39's OWNER-ONLY cell ─────────────────────────

describe("§A — user.manage gates every procedure (14-F39, commandment 8)", () => {
  it("`user.manage` is IN the matrix — without which every refusal below is vacuous", () => {
    // ⚠ `plans/saas-pivot/staff-over-the-wire.md`'s oracle round found this hole in the
    // NEIGHBOURING suite and named it as generalising to every FR-decided action: six refusal
    // tests that never assert the action exists are satisfied by `can()`'s unknown-action
    // fallback, and SURVIVE the mutant that deletes the action they are about. `14-F39` says the
    // surface "cannot be built *or* booted" without this row, so it is asserted first and by name.
    expect(PERMISSION_ACTIONS as readonly string[]).toContain("user.manage");
  });

  it("an unauthenticated caller reaches none of them", async () => {
    expect((await query("users.list", null)).status).toBe(401);
    expect(
      (await mutate("users.create", null, { display_name: "X", email: null, assignments: [] }))
        .status,
    ).toBe(401);
    expect((await mutate("users.setPin", null, { user_id: "u", pin: "1234" })).status).toBe(401);
    expect(
      (await mutate("users.deactivate", null, { user_id: "u", branch_id: BRANCH })).status,
    ).toBe(401);
    expect(
      (await mutate("users.setAssignments", null, { user_id: "u", assignments: [] })).status,
    ).toBe(401);
  });

  it("an ORG-WIDE manager is REFUSED — the CELL is deny, not scope resolution (14-F39)", async () => {
    // The mutant this exists for is `user.manage` widened to `branch_manager: "allow"` — the
    // plausible-looking wrong reading of doc 14 §1's "Used by owners, permitted managers". `14-F39`
    // pins owner-only and says §9.1 owns the axis, so the matrix may not answer it here.
    //
    // This subject's assignment is ORG-WIDE, so it survives `rolesAt` against the `null` scope
    // `users.create`/`users.list` resolve to and the refusal can only come from the matrix. The
    // failure direction `14-F39` names is what makes it worth a test of its own: "a manager who may
    // write users may make herself an owner, or reset the owner's PIN, and `01-F1` makes both
    // permanent."
    expect((await query("users.list", MANAGER_ORG_ID)).status).toBe(403);
    const created = await mutate("users.create", MANAGER_ORG_ID, {
      display_name: "Self Promotion",
      email: null,
      assignments: [{ role: "owner", branch_id: null }],
    });
    expect(created.status).toBe(403);
    expect(JSON.stringify(created.body)).toContain("user.manage");
  });

  it("a BRANCH-SCOPED manager and a cashier are refused every act", async () => {
    for (const who of [MANAGER_ID, CASHIER_ID]) {
      expect((await query("users.list", who)).status, `${who} list`).toBe(403);
      expect(
        (
          await mutate("users.create", who, {
            display_name: "X",
            email: null,
            assignments: [{ role: "cashier", branch_id: BRANCH }],
          })
        ).status,
        `${who} create`,
      ).toBe(403);
      expect(
        (await mutate("users.setPin", who, { user_id: "their-cashier", pin: "0000" })).status,
        `${who} setPin`,
      ).toBe(403);
      // A `branch_id` in the input resolves the scope to THAT branch, so this subject survives
      // `rolesAt` and the refusal is the cell — the one shape where a branch-scoped manager could
      // otherwise slip through on a surface whose other procedures state no branch.
      expect(
        (await mutate("users.deactivate", who, { user_id: "their-cashier", branch_id: BRANCH }))
          .status,
        `${who} deactivate`,
      ).toBe(403);
    }
  });

  it("a REFUSED act reached the writer with NOTHING — the refusal is before the write", async () => {
    // Without this, §A proves only that a status code came back. `14-F14`'s acts are irreversible
    // in an append-only world: a PIN reset that happened and was then reported 403 is a cashier
    // locked out of a till by a request the product says it refused.
    const before = directory.calls.length;
    await mutate("users.setPin", CASHIER_ID, { user_id: "their-cashier", pin: "0000" });
    await mutate("users.create", MANAGER_ORG_ID, {
      display_name: "Never",
      email: null,
      assignments: [],
    });
    expect(directory.calls.slice(before)).toEqual([]);
  });

  it("the OWNER is allowed — the control every refusal above needs", async () => {
    // Without it, every §A assertion is also satisfied by a surface that refuses everyone, which is
    // the shape a broken gate and a correct one share.
    const listed = await query("users.list", OWNER_ID);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  });
});

// ── §B — 14-F2 / 01-F62: the PRODUCER, with the actor on it ──────────────────────────────────

describe("§B — every act appends `user.changed` with the ACTOR (14-F2, 01-F62)", () => {
  const changesSince = (mark: number): readonly ChangeRecord[] => directory.changes.slice(mark);

  it("CREATE appends exactly one record, attributed to the authenticated owner", async () => {
    const mark = directory.changes.length;
    const user_id = await mustCreate({
      display_name: "Ayesha Khan",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });

    const appended = changesSince(mark);
    expect(
      appended,
      "14-F2: 'Every settings change emits … with actor. No silent edits exist.' A create that " +
        "writes kernel.users and appends nothing is 14-F39's named 14-F2 violation, and the act " +
        "it fails to record is a change to who may sell in a restaurant (01-F1)",
    ).toHaveLength(1);
    const [record] = appended as [ChangeRecord];
    // The SUBJECT's id — a client-supplied actor would be a role claim in another costume
    // (commandment 8), and this is the field `14-F2` turns on.
    expect(record.actor_user_id).toBe(OWNER_ID);
    expect(record.org_id).toBe(ORG);
    // `01-F62`: server time is the ordering authority for an org-scoped event, stamped from the
    // INJECTED clock (`18 §4`). `now()` moves 1 s per call, so a hardcoded literal cannot pass.
    expect(record.server_received_at).toBeGreaterThan(1_800_000_000_000);
    // `01-F1`: history is read long after the row it describes may have changed, so the record has
    // to say WHO it is about. The field name is the implementer's (§9.11 leaves the payload open);
    // that the person is identifiable at all is not.
    expect(JSON.stringify(record.payload)).toContain(user_id);
  });

  it("PIN RESET, RE-ASSIGNMENT and DEACTIVATION each append one too", async () => {
    const user_id = await mustCreate({
      display_name: "Bilal Ahmed",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });

    for (const act of [
      { path: "users.setPin", input: { user_id, pin: "4813" } },
      {
        path: "users.setAssignments",
        input: { user_id, assignments: [{ role: "cashier", branch_id: BRANCH_B }] },
      },
      { path: "users.deactivate", input: { user_id, branch_id: BRANCH_B } },
    ]) {
      const mark = directory.changes.length;
      const reply = await mutate(act.path, OWNER_ID, act.input);
      expect(reply.status, `${act.path}: ${JSON.stringify(reply.body)}`).toBe(200);
      const appended = changesSince(mark);
      expect(appended, `${act.path} appended ${appended.length} records`).toHaveLength(1);
      expect((appended[0] as ChangeRecord).actor_user_id).toBe(OWNER_ID);
      expect(JSON.stringify((appended[0] as ChangeRecord).payload)).toContain(user_id);
    }
  });

  it("a PIN RESET and a DEPARTURE are told apart in the ledger (14-F2)", async () => {
    // ⚠ The narrowest assertion that has any teeth, and it is deliberately not a field name.
    // Doc 14 §9.11 leaves the payload's CONTENT open — which acts are distinguishable, whether the
    // before-state rides it — so this pins only what `14-F2`'s "no silent edits exist" cannot do
    // without: an owner reading her own history must be able to tell "she reset the cashier's PIN"
    // from "she let the cashier go". A payload of `{user_id}` alone satisfies every other
    // assertion in §B and fails this one.
    const user_id = await mustCreate({
      display_name: "Distinguish Me",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
    const afterCreate = directory.changes.length;
    await mutate("users.setPin", OWNER_ID, { user_id, pin: "1122" });
    const afterPin = directory.changes.length;
    await mutate("users.deactivate", OWNER_ID, { user_id, branch_id: BRANCH });

    const pinRecord = directory.changes[afterCreate] as ChangeRecord | undefined;
    const departure = directory.changes[afterPin] as ChangeRecord | undefined;
    expect(pinRecord, "no record for the PIN reset").toBeDefined();
    expect(departure, "no record for the deactivation").toBeDefined();
    expect(
      JSON.stringify(departure?.payload),
      "a PIN reset and a departure produce the same ledger row — 14-F2's 'no silent edits' is " +
        "satisfied in letter and not in fact, and 14-F15's owner-visible history cannot render " +
        "which act happened",
    ).not.toBe(JSON.stringify(pinRecord?.payload));
  });

  it("a REFUSED act appends NOTHING — 01-F1 makes a wrong row permanent", async () => {
    // The direction `device-router.ts` already argues one §3 block up: the reverse order "leaves a
    // live till with an attributed revocation — a history row claiming a device was switched off
    // while it goes on selling, which 01-F1 forbids deleting". Here it is a history row claiming a
    // cashier was let go while she goes on selling.
    const mark = directory.changes.length;
    const reply = await mutate("users.deactivate", OWNER_ID, {
      user_id: "no-such-person",
      branch_id: BRANCH,
    });
    expect(reply.status).not.toBe(200);
    expect(changesSince(mark)).toEqual([]);
  });
});

// ── §C — 01-F71: the org comes from the subject, and a refusal is not a clamp ────────────────

describe("§C — tenant isolation (01-F71, 14-F39)", () => {
  it("the org reaching the writer is the SUBJECT's, even when the body states another", async () => {
    // `01-F71` (b): "the org is taken from the authenticated subject and never from the request, so
    // an org stated by a caller changes nothing." `trpc.ts`'s `scopeShape` strips unknown keys, so
    // the field below should reach no code path at all — which is a property to MEASURE, not to
    // infer from a schema that could grow a member tomorrow.
    const before = directory.calls.length;
    const reply = await mutate("users.create", OWNER_ID, {
      display_name: "Correctly Scoped",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
      org_id: OTHER_ORG,
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);

    const create = directory.calls.slice(before).find((call) => call.method === "create");
    expect(create?.args.org_id).toBe(ORG);
    expect(directory.people(OTHER_ORG).map((row) => row.user_id)).toEqual(["their-cashier"]);
  });

  it("`users.list` answers this org's people and never another's", async () => {
    const listed = await query("users.list", OWNER_ID);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const ids = (listed.body as readonly { user_id: string }[]).map((row) => row.user_id);
    expect(ids).not.toContain("their-cashier");
    // …and the read that produced it named the caller's org. Without this the assertion above also
    // passes against a port that ignores its argument and answers one global list.
    const last = [...directory.calls].reverse().find((call) => call.method === "list");
    expect(last?.args.org_id).toBe(ORG);
  });

  it("another tenant's person is REFUSED, not clamped, on every write (01-F71 (e))", async () => {
    // `01-F71` (e), in terms: "anything else is REFUSED as an auth failure, never clamped to the
    // session's own — silently serving a different artifact than the one asked for is exactly the
    // mis-routing 01-F76 says makes scope decoration."
    //
    // The clamp shape here is the dangerous one and it is quiet: a write scoped to the caller's org
    // that matches zero rows and reports success. The owner is told the PIN was reset; the other
    // tenant's cashier goes on using her old one.
    for (const act of [
      { path: "users.setPin", input: { user_id: "their-cashier", pin: "0000" } },
      {
        path: "users.setAssignments",
        input: { user_id: "their-cashier", assignments: [{ role: "owner", branch_id: null }] },
      },
      {
        path: "users.deactivate",
        input: { user_id: "their-cashier", branch_id: "their-branch" },
      },
    ]) {
      const before = directory.calls.length;
      const reply = await mutate(act.path, OWNER_ID, act.input);
      expect(
        reply.status,
        `${act.path} reported ${reply.status} for another tenant's person — a cross-tenant write ` +
          "that reports success is 01-F71's failure with no error in it",
      ).not.toBe(200);
      // ⚠ And whatever DID reach the writer named the caller's own org, never the one the target
      // lives in. Without this the assertion above is satisfied by a 404, and by an implementation
      // that resolved the target's org and then failed for an unrelated reason — the second is the
      // dangerous one, because it works.
      for (const call of directory.calls.slice(before)) {
        expect(
          call.args.org_id,
          `${act.path} reached the writer under ${String(call.args.org_id)}`,
        ).toBe(ORG);
      }
    }

    // Nothing moved over there: same assignments, no credential, still active.
    const theirs = directory.people(OTHER_ORG)[0] as PersonListing;
    expect(theirs.assignments).toEqual([
      { role: "cashier", branch_id: "their-branch", status: "active" },
    ]);
    expect(directory.pinHash(OTHER_ORG, "their-cashier")).toBeUndefined();
  });
});

// ── §D — 11-F21 / 14 §2: a PIN reaches the hasher and nothing else ───────────────────────────

describe("§D — no PIN leaves this process (11-F21, 14 §2, 14-F14)", () => {
  const PIN = "9042";

  it("the writer gets a HASH that verifies the typed PIN — and never the PIN", async () => {
    // `11-F21`: "What is stored is a HASH and never a PIN … A PIN exists in exactly two places for
    // exactly as long as each takes — the keypad it is typed on and the argument to a verify call."
    // The hash must be REAL, not a placeholder: `01-F28` has a till verify against exactly these
    // bytes, so a stub, a truncation or a re-hash passes every column check and locks out a branch.
    const user_id = await mustCreate({
      display_name: "Hina Raza",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
    const before = directory.calls.length;
    const reply = await mutate("users.setPin", OWNER_ID, { user_id, pin: PIN });
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);

    const stored = directory.pinHash(ORG, user_id);
    expect(stored, "no credential reached the writer at all").toBeDefined();
    expect(await verifyPin(stored as string, PIN)).toBe(true);
    expect(await verifyPin(stored as string, "0000")).toBe(false);

    // Nothing the port received carries the plaintext — the `pin` field must not survive the hop.
    const sent = JSON.stringify(directory.calls.slice(before));
    expect(
      sent.includes(PIN),
      `the plaintext PIN crossed the service boundary: ${sent.slice(0, 400)}`,
    ).toBe(false);
  });

  it("the procedure's RESPONSE carries no PIN and no hash (14-F14: never displayed)", async () => {
    // `14-F14`: "PIN set/reset (never displayed …)". A response echoing either turns the browser's
    // network tab, and every proxy log between it and here, into a credential store.
    const user_id = await mustCreate({
      display_name: "Sana Iqbal",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
    const reply = await mutate("users.setPin", OWNER_ID, { user_id, pin: PIN });
    const body = JSON.stringify(reply.body ?? {});
    expect(body.includes(PIN)).toBe(false);
    expect(body.includes("$argon2")).toBe(false);

    // …nor does the roster read, which is the surface an owner actually looks at.
    const listed = await query("users.list", OWNER_ID);
    const rendered = JSON.stringify(listed.body);
    expect(rendered.includes(PIN)).toBe(false);
    expect(
      rendered.includes("$argon2"),
      "the user list serves credential hashes to the browser — 11-F23 chose a separate table so " +
        "a lookup could not return one 'because it does not join to it', and a read model that " +
        "joins anyway spends that structural bound",
    ).toBe(false);
  });

  it("no LOG records the PIN (11-F21: 'no log records one')", async () => {
    const user_id = await mustCreate({
      display_name: "Danish Iqbal",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
    const written: string[] = [];
    const capture = (...parts: unknown[]): void => {
      written.push(parts.map((part) => JSON.stringify(part) ?? String(part)).join(" "));
    };
    const spies = (["log", "error", "warn", "info", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(capture),
    );
    try {
      await mutate("users.setPin", OWNER_ID, { user_id, pin: PIN });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(
      written.some((line) => line.includes(PIN)),
      `console output carried the PIN: ${written.join(" | ").slice(0, 400)}`,
    ).toBe(false);
  });

  it("the appended `user.changed` payload carries no PIN (14 §2)", async () => {
    // Doc 14 §2, verbatim: "PINs stored Argon2id, **never present in payloads**". `01-F1` makes a
    // payload permanent, so a PIN in one is a credential that cannot be redacted — it can only be
    // superseded by a linked correction that leaves the original readable.
    const user_id = await mustCreate({
      display_name: "Payload Free",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
    const mark = directory.changes.length;
    await mutate("users.setPin", OWNER_ID, { user_id, pin: PIN });
    const written = JSON.stringify(directory.changes.slice(mark));
    expect(written.includes(PIN)).toBe(false);
    expect(written.includes("$argon2")).toBe(false);
  });

  it("a TILL-ONLY cashier is created with NO email and cannot sign in here (R30, 11-F20)", async () => {
    // R30: "a cashier who only uses the till needs no email; email is required only for BACK-OFFICE
    // access", and "the back-office login path must never assume an email exists — `findByEmail` is
    // the lookup, and a till-only person is simply NOT findable by it, which is correct rather than
    // a gap." An owner made to invent an address "puts a wrong address permanently into a directory
    // 11-F20 never deletes from".
    const user_id = await mustCreate({
      display_name: "Till Only",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    });
    const created = directory.people(ORG).find((row) => row.user_id === user_id);
    // `null`, never the four-letter string "null", which reads as an address and survives every
    // type check (`users.ts` records that exact shape).
    expect(created?.email).toBeNull();

    const attempt = await app.inject({
      method: "POST",
      url: "/trpc/auth.login",
      payload: superjson.serialize({ email: "", password: PASSWORD }) as object,
    });
    expect(attempt.statusCode).toBe(401);
  });
});

// ── §E — the fallback REFUSES; it does not answer emptily ────────────────────────────────────

/**
 * The production fallback `createApiServer` builds when a host declares no `users`, resolved at
 * CALL TIME so a missing export fails BY NAME rather than taking the whole file down as
 * `Tests: no tests` at import — §F's `adapter()` idiom, for §F's recorded reason.
 */
const refusingFallback = async (): Promise<UserDirectory> => {
  const mod = (await import("../index.js")) as Record<string, unknown>;
  const factory = mod.unconfiguredUserDirectory;
  if (typeof factory !== "function") {
    throw new Error(
      "services/api's barrel exports no `unconfiguredUserDirectory`. `createApiServer` resolves " +
        "`options.users` to a fallback exactly as it does `devices`, and `14-F14`'s fallback must " +
        "REFUSE every call rather than answer emptily or mint. It is asserted here rather than " +
        "through a request because the procedure's STATUS cannot distinguish a create that " +
        "refused from a create that fabricated and left the refusal to `recordChange` — see the " +
        "contracted surface at the top of this file.",
    );
  }
  return (factory as () => UserDirectory)();
};

describe("§E — a host with no user directory refuses rather than lying", () => {
  it("`users.list` on an unconfigured host is NOT an empty roster", async () => {
    // AGENTS.md's measured blind spot (ii): "Rule B asks whether an optional member is *supplied*,
    // never whether what was supplied is *real*, and a stub is a supply." `devices.ts` records the
    // consequence for its own surface and it is sharper here: an empty roster is a CLAIM about who
    // works at this restaurant, and an unconfigured process is not in a position to make it — an
    // owner would see her staff gone and reach for the create button.
    //
    // The control is in this same test: the configured host must answer 200, or the assertion below
    // is satisfied by a surface that does not exist.
    const configured = await query("users.list", OWNER_ID);
    expect(configured.status, JSON.stringify(configured.body)).toBe(200);

    const response = await bare.inject({
      method: "GET",
      url: `/trpc/users.list?input=${encodeURIComponent("{}")}`,
      headers: { authorization: `Bearer ${tokens.get(OWNER_ID) as string}` },
    });
    expect(
      response.statusCode,
      "an unconfigured host answered a user list — a stub that returns [] is indistinguishable " +
        "from a working implementation and stays indistinguishable after the real one lands",
    ).not.toBe(200);
  });

  it("a WRITE on an unconfigured host refuses AT THE CREATE, not at the ledger append", async () => {
    const input = {
      display_name: "Nobody",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
    };
    // The control is in the same test, for the reason above: without it a 404 satisfies the
    // refusal and this asserts nothing about a fallback that does not yet exist.
    const configured = await mutate("users.create", OWNER_ID, input);
    expect(configured.status, JSON.stringify(configured.body)).toBe(200);

    const reply = await mutate("users.create", OWNER_ID, input, bare);
    expect(
      reply.status,
      "an unconfigured host reported a successful create — a person nobody wrote, and an owner " +
        "who will look for her on the till",
    ).not.toBe(200);

    /**
     * ⚠ **AND THE REFUSAL IS THE CREATE'S — WHICH THE STATUS ABOVE CANNOT SAY, THOUGH SAYING IT
     * WAS THIS TEST'S WHOLE CLAIM.** `users.create` calls the port twice: the write, then `14-F2`'s
     * record. So a fallback whose `create` FABRICATED a `{user_id}` and whose `recordChange` went
     * on refusing produces byte-for-byte the reply asserted above — **measured, that mutant
     * survives this package at 310/310**. A refusal borrowed from the next call is not a property
     * of the create at all: it evaporates the day the resolver's order changes, or the day a
     * deployment supplies the ledger half and not the writer half, and it would then report a
     * minted `user_id` for a person no writer has ever seen.
     *
     * So the create is asked directly, and what it must not do is ANSWER. `devices.ts`'s recorded
     * reason, sharpened by AGENTS.md's measured blind spot: "Rule B asks whether an optional member
     * is *supplied*, never whether what was supplied is *real*, and a stub is a supply."
     */
    const REFUSED = Symbol("the fallback refused");
    const fallback = await refusingFallback();
    const outcome = await fallback
      .create({
        org_id: ORG,
        display_name: "Nobody",
        email: null,
        assignments: [{ role: "cashier", branch_id: BRANCH }],
        actor_user_id: OWNER_ID,
        now: 1_800_000_000_000,
      })
      .then(
        (minted) => minted as unknown,
        () => REFUSED,
      );
    expect(
      outcome,
      "the fallback ANSWERED a create: it minted an identity no writer ever saw. A host that " +
        "cannot reach the roster writer is not in a position to say a cashier exists (11-F20 " +
        "never deletes a person record, and 01-F1 makes the ledger row permanent)",
    ).toBe(REFUSED);
  });
});

// ── §F — the adapter: a real request, over a real socket, carrying the hash ──────────────────

/**
 * A REAL HTTP server speaking the gateway's contracted `/internal/users*` surface.
 *
 * **Why a real socket and not a stubbed `fetch`** — `fake-gateway.ts`'s recorded reason, unchanged:
 * the thing under test is an ADAPTER, so the question is whether an HTTP request actually left this
 * process carrying the right bytes with the right credential. A function-level double answers a
 * different question and keeps passing after the URL, the method, the header or the serialization
 * breaks.
 *
 * It is declared HERE rather than added to `fake-gateway.ts` deliberately: that file is shared by
 * six suites this session does not own, and the route contract above is pinned by this oracle
 * rather than by the corpus — so the copy that has to move when the contract is contested is the
 * one inside the file that pinned it.
 */
type FakeGatewayUsers = {
  readonly url: string;
  readonly token: string;
  readonly received: { path: string; body: unknown; auth: string | undefined }[];
  close(): Promise<void>;
};

const startFakeGatewayUsers = async (): Promise<FakeGatewayUsers> => {
  const TOKEN = "fake-gateway-users-credential-at-least-32-bytes-long";
  const received: { path: string; body: unknown; auth: string | undefined }[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body: unknown = raw === "" ? null : JSON.parse(raw);
      received.push({ path: url.pathname, body, auth: req.headers.authorization });
      res.writeHead(200, { "content-type": "application/json" });
      if (url.pathname === "/internal/users" && req.method === "POST") {
        res.end(JSON.stringify({ user_id: "gateway-minted-user", grid_ordinal: 40 }));
        return;
      }
      if (url.pathname === "/internal/users") {
        res.end(JSON.stringify({ users: [] }));
        return;
      }
      res.end(JSON.stringify({}));
    })().catch(() => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake gateway did not bind");
  return {
    url: `http://127.0.0.1:${address.port}`,
    token: TOKEN,
    received,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error === undefined ? done() : fail(error)));
      }),
  };
};

describe("§F — the adapter forms a real request to the gateway", () => {
  let peer: FakeGatewayUsers;

  beforeAll(async () => {
    peer = await startFakeGatewayUsers();
  });
  afterAll(async () => {
    await peer?.close();
  });

  /**
   * The production symbol, resolved at call time so a missing export fails BY NAME rather than
   * taking the whole file down as `Tests: no tests` at import — a failure mode this plan's own
   * oracle round filed as a finding, because a `no tests` line gets misread inside a turbo run.
   *
   * `createGatewayUserDirectory` is the contracted name, following
   * `createGatewayDeviceDirectory` / `createGatewayTenancyDirectory` in the same module.
   */
  const adapter = async (): Promise<UserDirectory> => {
    const mod = (await import("../gateway-client.js")) as Record<string, unknown>;
    const factory = mod.createGatewayUserDirectory;
    if (typeof factory !== "function") {
      throw new Error(
        "services/api/src/gateway-client.ts exports no `createGatewayUserDirectory`. 14-F14's " +
          "writes reach services/sync-gateway over the /internal contract, exactly as " +
          "createGatewayDeviceDirectory does for 14-F13 — a port with only an in-memory " +
          "implementation behind it is the stub AGENTS.md measures as invisible to every rail.",
      );
    }
    return (factory as (link: { base_url: string; token: string }) => UserDirectory)({
      base_url: peer.url,
      token: peer.token,
    });
  };

  it("`setPin` sends the HASH over the wire and never the PIN (11-F21)", async () => {
    const PIN = "6631";
    await (await adapter()).setPin({
      org_id: ORG,
      user_id: "some-cashier",
      pin_hash: await hashPin(PIN),
      actor_user_id: OWNER_ID,
      now: 1_800_000_000_000,
    });
    const request = peer.received.find((entry) => entry.path.startsWith("/internal/users/pin"));
    expect(
      request,
      "no request reached /internal/users/pin — the adapter did not form one, so a PIN reset " +
        "changes nothing on any till",
    ).toBeDefined();
    expect(request?.auth).toBe(`Bearer ${peer.token}`);
    const sent = (request ?? { body: {} }).body as { pin_hash?: string };
    expect(JSON.stringify(sent).includes(PIN)).toBe(false);
    expect(sent.pin_hash?.startsWith("$argon2")).toBe(true);
  });

  it("`recordChange` posts `user.changed` to the org-scoped store (01-F62)", async () => {
    // The type is SENT rather than assumed, on `createGatewayLedgerAppender`'s recorded rule: "so
    // the gateway's 01-F62 scope check is the one that decides and not this client's confidence".
    await (await adapter()).recordChange({
      org_id: ORG,
      actor_user_id: OWNER_ID,
      server_received_at: 1_800_000_000_000,
      payload: { user_id: "some-cashier" },
    });
    const request = peer.received.find((entry) => entry.path === "/internal/org-events");
    expect(
      request,
      "no request reached /internal/org-events — `user.changed` has a schema, a legal scope and " +
        "no producer, which is exactly the state audit.print_acknowledged was in",
    ).toBeDefined();
    const sent = (request ?? { body: {} }).body as { type?: string; actor_user_id?: string };
    expect(sent.type).toBe("user.changed");
    expect(sent.actor_user_id).toBe(OWNER_ID);
  });

  it("`create` reaches the writer and returns what the writer minted (01-F61)", async () => {
    const minted = await (await adapter()).create({
      org_id: ORG,
      display_name: "Over The Wire",
      email: null,
      assignments: [{ role: "cashier", branch_id: BRANCH }],
      actor_user_id: OWNER_ID,
      now: 1_800_000_000_000,
    });
    // The gateway mints both — a client that invented its own would collide the moment two owners
    // saved at once, reintroducing the derived tiebreak `01-F61` forbids.
    expect(minted).toEqual({ user_id: "gateway-minted-user", grid_ordinal: 40 });
  });
});
