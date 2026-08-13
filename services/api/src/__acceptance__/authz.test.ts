// B-2 acceptance — the `services/api` host and its authorization middleware
// (`plans/wave-1/backoffice-catalog.md` §4.1, §3.1).
//
// Authored BEFORE the implementation, from spec text (`24 §3`). What it binds:
//
// - **Commandment 8 / `18 §5`** — "Server-side authorization always via the `domain` permission
//   matrix; client role claims are never trusted." Authorization is the single
//   `can(user, action, scope)` helper; inline role checks are banned.
// - **`01-F27`** — authorization runs on EVERY operation, not at login. So a session token is an
//   IDENTITY claim; the authority behind it is re-read from the server's own store per request.
// - **`01-F26`** — User × Role × per-location assignment. A branch manager authorized at branch A
//   is a stranger at branch B, so the middleware must CARRY the scope rather than assume it.
// - **`02-F20` + `packages/domain/src/permissions.ts`** — `can()` is THREE-valued. On this plane
//   `escalate` is a REFUSAL: `02-F20`'s two escalation paths are a local manager PIN on the POS
//   and a remote approval via the manager console, and neither is reachable from a cloud tRPC
//   procedure. A cloud procedure that treated `escalate` as permission would grant, with no
//   second credential, precisely what the matrix says needs one.
// - **Founder ruling (`dac8747`)** — email + password, Argon2id, our own implementation, sessions
//   in `services/api`. `packages/domain/src/pin.ts` already owns the hashing (`01-F61`'s cost
//   floor); this host REUSES it rather than adding a second binding.
//
// Every request below goes over the real Fastify host via `inject` — plan §6.2: "asserted against
// the *API*, not the UI. A test that only checks a hidden button is the defect Commandment 8
// names."

import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import {
  appRouter,
  assertEveryProcedureIsGated,
  createApiServer,
  createMemoryUserStore,
  PUBLIC_PROCEDURES,
  SESSION_ONLY_PROCEDURES,
  type UserStore,
} from "../index.js";

const SECRET = "b2-acceptance-session-secret-not-a-real-one";
const OTHER_SECRET = "a-different-deployment-secret-entirely";

const ORG = "org-lahore";
const OTHER_ORG = "org-karachi";
const BRANCH_A = "branch-gulberg";
const BRANCH_B = "branch-dha";

/** A fixed instant, injected — `18 §4`: nothing here reads a wall clock. */
const T0 = 1_760_000_000_000;

type Server = Awaited<ReturnType<typeof createApiServer>>;
type Rpc = { status: number; body: Record<string, unknown> };

/**
 * tRPC v11's HTTP RPC contract, with the superjson transformer: a mutation is a POST carrying
 * `superjson.serialize(input)` as its body; a query is a GET carrying the same under `?input=`.
 * The verb is read off the router rather than passed in, so the generic seam walk below can call
 * a procedure it has never heard of — including one written after this file.
 */
const call = async (
  server: Server,
  path: string,
  input: unknown,
  headers: Record<string, string> = {},
): Promise<Rpc> => {
  const procedures = appRouter._def.procedures as Record<string, { _def?: { type?: string } }>;
  const serialised = JSON.stringify(superjson.serialize(input));
  const res =
    procedures[path]?._def?.type === "query"
      ? await server.inject({
          method: "GET",
          url: `/trpc/${path}?input=${encodeURIComponent(serialised)}`,
          headers,
        })
      : await server.inject({
          method: "POST",
          url: `/trpc/${path}`,
          headers: { "content-type": "application/json", ...headers },
          payload: serialised,
        });
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
};

const authed = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

/** The success payload, superjson-deserialised. */
const dataOf = (rpc: Rpc): Record<string, unknown> => {
  const result = (rpc.body as { result?: { data?: unknown } }).result;
  if (result === undefined) throw new Error(`expected a result, got ${JSON.stringify(rpc.body)}`);
  return superjson.deserialize(result.data as never) as Record<string, unknown>;
};

const messageOf = (rpc: Rpc): string | undefined =>
  (rpc.body as { error?: { json?: { message?: string } } }).error?.json?.message;

/** The `authz` detail this host lifts onto the error shape. */
const authzOf = (rpc: Rpc): { outcome?: string; action?: string; satisfied_by?: string[] } => {
  const error = (rpc.body as { error?: { json?: { data?: { authz?: unknown } } } }).error;
  const authz = error?.json?.data?.authz;
  if (authz === undefined)
    throw new Error(`expected authz detail, got ${JSON.stringify(rpc.body)}`);
  return authz as { outcome?: string; action?: string; satisfied_by?: string[] };
};

// ────────────────────────────────────────────────────────────────────────────────────────────
// The fixture cast. Roles are held ONLY here, in the server's own store — never in a token,
// never in a request. `01-F26`'s per-location assignment is what `branch_id` carries.
// ────────────────────────────────────────────────────────────────────────────────────────────

const PASSWORD = "correct horse battery staple";

let store: UserStore;
let app: Server;
const token: Record<string, string> = {};

const login = async (email: string, password = PASSWORD): Promise<Rpc> =>
  call(app, "auth.login", { email, password });

beforeAll(async () => {
  // Hash ONCE — `01-F61`'s cost floor makes Argon2id deliberately slow, and re-hashing per test
  // would be measuring the floor rather than the middleware.
  const hash = await hashPin(PASSWORD);

  store = createMemoryUserStore([
    {
      user_id: "u-owner",
      org_id: ORG,
      email: "owner@example.com",
      password_hash: hash,
      // `branch_id: null` is org-wide — Appendix A's "everything".
      assignments: [{ role: "owner", branch_id: null }],
    },
    {
      user_id: "u-cashier",
      org_id: ORG,
      email: "cashier@example.com",
      password_hash: hash,
      assignments: [{ role: "cashier", branch_id: BRANCH_A }],
    },
    {
      user_id: "u-manager-a",
      org_id: ORG,
      email: "manager-a@example.com",
      password_hash: hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH_A }],
    },
    {
      user_id: "u-storekeeper",
      org_id: ORG,
      email: "store@example.com",
      password_hash: hash,
      assignments: [{ role: "storekeeper", branch_id: BRANCH_A }],
    },
    {
      // A real user with NO assignment anywhere — the generic seam probe below.
      user_id: "u-nobody",
      org_id: ORG,
      email: "nobody@example.com",
      password_hash: hash,
      assignments: [],
    },
    {
      user_id: "u-other-owner",
      org_id: OTHER_ORG,
      email: "owner@other.example.com",
      password_hash: hash,
      assignments: [{ role: "owner", branch_id: null }],
    },
  ]);

  app = await createApiServer({ store, sessionSecret: SECRET, now: () => T0 });

  for (const [name, email] of [
    ["owner", "owner@example.com"],
    ["cashier", "cashier@example.com"],
    ["managerA", "manager-a@example.com"],
    ["storekeeper", "store@example.com"],
    ["nobody", "nobody@example.com"],
  ] as const) {
    const res = await login(email);
    if (res.status !== 200)
      throw new Error(`${name} could not log in: ${JSON.stringify(res.body)}`);
    token[name] = dataOf(res).token as string;
  }
});

// ────────────────────────────────────────────────────────────────────────────────────────────

describe("login — email + password over Argon2id (founder ruling `dac8747`, `01-F26`)", () => {
  it("issues a session token for the right password", async () => {
    const res = await login("owner@example.com");
    expect(res.status).toBe(200);
    expect(typeof dataOf(res).token).toBe("string");
  });

  it("reuses `domain`'s Argon2id rather than adding a second binding (`01-F26`)", async () => {
    // The fixture hashes were minted by `domain`'s `hashPin`; every login above verifying against
    // them IS the reuse proof. This pins the encoding so a swapped algorithm is a RED, not a
    // silent re-implementation.
    const record = await store.findByEmail("owner@example.com");
    expect(record?.password_hash.startsWith("$argon2id$")).toBe(true);
  });

  it("refuses the wrong password", async () => {
    const res = await login("owner@example.com", "not the password");
    expect(res.status).toBe(401);
  });

  it("does not distinguish an unknown email from a wrong password", async () => {
    const unknown = await login("nobody-at-all@example.com");
    const wrong = await login("owner@example.com", "not the password");
    expect(unknown.status).toBe(wrong.status);
    expect(messageOf(unknown)).toBe(messageOf(wrong));
  });

  it("never puts the password in the token", async () => {
    const res = await login("owner@example.com");
    expect(dataOf(res).token as string).not.toContain(PASSWORD);
  });
});

describe("the session is an IDENTITY claim, not an AUTHORITY claim (`01-F27`)", () => {
  it("refuses a request with no token", async () => {
    const res = await call(app, "session.whoami", {});
    expect(res.status).toBe(401);
  });

  it("refuses a malformed token", async () => {
    const res = await call(app, "session.whoami", {}, authed("not.a.token"));
    expect(res.status).toBe(401);
  });

  it("refuses a token signed by another deployment's secret", async () => {
    const other = await createApiServer({ store, sessionSecret: OTHER_SECRET, now: () => T0 });
    const minted = await call(other, "auth.login", {
      email: "owner@example.com",
      password: PASSWORD,
    });
    const forged = dataOf(minted).token as string;
    const res = await call(app, "session.whoami", {}, authed(forged));
    expect(res.status).toBe(401);
  });

  it("refuses an expired token, measured against the INJECTED clock (`18 §4`)", async () => {
    const later = await createApiServer({
      store,
      sessionSecret: SECRET,
      now: () => T0 + 400 * 24 * 60 * 60 * 1000,
    });
    const res = await call(later, "session.whoami", {}, authed(token.owner as string));
    expect(res.status).toBe(401);
  });

  it("re-reads the subject from the store on EVERY request, not at login", async () => {
    // The owner logs in while authorised and is stripped of the assignment afterwards. The token
    // is untouched and still valid, so a token that carried its own authority would stay open
    // until it expired. `01-F27` puts authorization on every operation.
    const before = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.owner as string),
    );
    expect(before.status).toBe(200);

    store.setAssignments("u-owner", []);
    const after = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.owner as string),
    );
    expect(after.status).toBe(403);

    store.setAssignments("u-owner", [{ role: "owner", branch_id: null }]);
    const restored = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.owner as string),
    );
    expect(restored.status).toBe(200);
  });

  it("refuses a valid token for a user the store no longer has", async () => {
    const emptied = await createApiServer({
      store: createMemoryUserStore([]),
      sessionSecret: SECRET,
      now: () => T0,
    });
    const res = await call(emptied, "session.whoami", {}, authed(token.owner as string));
    expect(res.status).toBe(401);
  });
});

describe("Commandment 8 — a client role claim is never an input to `can()`", () => {
  it("ignores a role in the request body", async () => {
    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A, role: "owner", assignments: [{ role: "owner", branch_id: null }] },
      authed(token.cashier as string),
    );
    expect(res.status).toBe(403);
  });

  it("ignores a role in a request header", async () => {
    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      {
        ...authed(token.cashier as string),
        "x-restos-role": "owner",
        "x-restos-user-id": "u-owner",
      },
    );
    expect(res.status).toBe(403);
  });

  it("ignores roles smuggled INSIDE a validly signed token", async () => {
    // The sharpest form: minted with this deployment's own secret, so the signature is genuine
    // and only the CLAIMS are the attack. The subject is still the cashier the STORE says she is.
    const { SignJWT } = await import("jose");
    const smuggled = await new SignJWT({
      sub: "u-cashier",
      org_id: ORG,
      expires_at: T0 + 60_000,
      // None of these may be read.
      roles: ["owner"],
      assignments: [{ role: "owner", branch_id: null }],
      permissions: ["catalog.edit_menu_prices"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(SECRET));

    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(smuggled),
    );
    expect(res.status).toBe(403);
  });

  it("takes `org_id` from the session, never from the request", async () => {
    const res = await call(
      app,
      "session.whoami",
      { org_id: OTHER_ORG },
      authed(token.cashier as string),
    );
    expect(res.status).toBe(200);
    expect(dataOf(res).org_id).toBe(ORG);
  });
});

describe("the matrix decides, and only the matrix (`18 §5`, Appendix A)", () => {
  it("CONTROL — an owner edits the catalog", async () => {
    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.owner as string),
    );
    expect(res.status).toBe(200);
    expect(dataOf(res).action).toBe("catalog.edit_menu_prices");
  });

  it("refuses a cashier the catalog (`Edit menu & prices` — · optional · — · ✔)", async () => {
    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.cashier as string),
    );
    expect(res.status).toBe(403);
    expect(authzOf(res).outcome).toBe("deny");
    expect(authzOf(res).action).toBe("catalog.edit_menu_prices");
  });

  it("refuses a storekeeper the catalog", async () => {
    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.storekeeper as string),
    );
    expect(res.status).toBe(403);
  });

  it("refuses a branch manager the catalog — the matrix's recorded `deny`", async () => {
    const res = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.managerA as string),
    );
    expect(res.status).toBe(403);
  });
});

describe("scope is carried, not assumed (`01-F26` — per-location assignment)", () => {
  it("CONTROL — a branch manager voids after KOT at her OWN branch", async () => {
    const res = await call(
      app,
      "ops.voidAfterKot",
      { branch_id: BRANCH_A },
      authed(token.managerA as string),
    );
    expect(res.status).toBe(200);
    expect(dataOf(res).branch_id).toBe(BRANCH_A);
  });

  it("refuses the same manager at another branch", async () => {
    const res = await call(
      app,
      "ops.voidAfterKot",
      { branch_id: BRANCH_B },
      authed(token.managerA as string),
    );
    expect(res.status).toBe(403);
    expect(authzOf(res).outcome).toBe("deny");
  });

  it("refuses a branch-scoped manager an ORG-WIDE request — the default narrows, never widens", async () => {
    const res = await call(
      app,
      "ops.voidAfterKot",
      { branch_id: null },
      authed(token.managerA as string),
    );
    expect(res.status).toBe(403);
  });

  it("lets an ORG-WIDE owner act at any branch", async () => {
    for (const branch of [BRANCH_A, BRANCH_B]) {
      const res = await call(
        app,
        "ops.voidAfterKot",
        { branch_id: branch },
        authed(token.owner as string),
      );
      expect(res.status, `owner at ${branch}`).toBe(200);
    }
  });
});

describe("`escalate` is a REFUSAL on this plane (`02-F20`)", () => {
  it("refuses a cashier's void-after-KOT rather than granting it", async () => {
    const res = await call(
      app,
      "ops.voidAfterKot",
      { branch_id: BRANCH_A },
      authed(token.cashier as string),
    );
    expect(res.status).toBe(403);
    expect(authzOf(res).outcome).toBe("escalate");
  });

  it("names the credential that closes the gap, derived from the matrix", async () => {
    // `18 §`'s inline-role-check ban relocated into the UI is exactly what `satisfied_by` exists
    // to prevent — a screen must not hardcode "ask a manager".
    const res = await call(
      app,
      "ops.voidAfterKot",
      { branch_id: BRANCH_A },
      authed(token.cashier as string),
    );
    expect(authzOf(res).satisfied_by).toEqual(["branch_manager", "owner"]);
  });

  it("is DISTINGUISHABLE from a plain refusal", async () => {
    const escalated = await call(
      app,
      "ops.voidAfterKot",
      { branch_id: BRANCH_A },
      authed(token.cashier as string),
    );
    const denied = await call(
      app,
      "catalog.editMenuPrices",
      { branch_id: BRANCH_A },
      authed(token.cashier as string),
    );
    expect(escalated.status).toBe(403);
    expect(denied.status).toBe(403);
    expect(authzOf(escalated).outcome).not.toBe(authzOf(denied).outcome);
    expect(authzOf(denied).satisfied_by).toBeUndefined();
  });
});

describe("the seam — no procedure may be reachable without the middleware", () => {
  /** Every procedure the router exposes, walked from the router itself. */
  const procedureNames = (): string[] => Object.keys(appRouter._def.procedures).sort();

  it("has procedures to walk at all (the tripwire's own tripwire)", () => {
    expect(procedureNames().length).toBeGreaterThan(2);
  });

  it("declares exactly one public procedure, and it is login", () => {
    expect([...PUBLIC_PROCEDURES].sort()).toEqual(["auth.login"]);
  });

  it("keeps the session-only exemption list explicit and short", () => {
    expect([...SESSION_ONLY_PROCEDURES].sort()).toEqual(["session.whoami"]);
  });

  it("refuses EVERY non-public procedure without a session", async () => {
    const names = procedureNames().filter((name) => !PUBLIC_PROCEDURES.has(name));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const res = await call(app, name, { branch_id: BRANCH_A });
      expect(res.status, `${name} without a session`).toBe(401);
    }
  });

  it("accepts the real router at boot", () => {
    // The CONTROL for the two boot-gate tests below: without it, a check that threw on
    // everything would look identical to a check that works.
    expect(() => assertEveryProcedureIsGated(appRouter)).not.toThrow();
  });

  it("refuses to boot a router carrying an ungated procedure", () => {
    // The failing case, reachable — a gate only ever pointed at the correct router is a gate
    // nothing has verified. `meta.authz` absent is exactly what a forgotten `authorized(...)`
    // leaves behind.
    const ungated = { _def: { procedures: { "catalog.publish": { _def: { meta: undefined } } } } };
    expect(() => assertEveryProcedureIsGated(ungated)).toThrow(/catalog\.publish/);
  });

  it("does not mistake an exempted procedure for an ungated one", () => {
    const exempted = { _def: { procedures: { "session.whoami": { _def: { meta: undefined } } } } };
    expect(() => assertEveryProcedureIsGated(exempted)).not.toThrow();
  });

  it("refuses EVERY authorized procedure to a subject with no assignment", async () => {
    // A real, logged-in user holding nothing. Any procedure that forgot `authorized(...)` — the
    // seam mutant — answers this request instead of refusing it, and this walk finds it on a
    // procedure that does not exist yet.
    const names = procedureNames().filter(
      (name) => !PUBLIC_PROCEDURES.has(name) && !SESSION_ONLY_PROCEDURES.has(name),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const res = await call(app, name, { branch_id: BRANCH_A }, authed(token.nobody as string));
      expect(res.status, `${name} for a subject with no assignment`).toBe(403);
    }
  });
});

describe("the two-plane law (`18 §6`, plan §6.8)", () => {
  it("imports no `sync-client` anywhere in this service", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    const files = walk(fileURLToPath(new URL("..", import.meta.url))).filter((f) =>
      f.endsWith(".ts"),
    );
    expect(files.length).toBeGreaterThan(3);
    // The IMPORT, not the bare name: this file mentions the package to forbid it, and a
    // substring scan would have matched itself and been unfixable without exempting the suite —
    // which would then stop covering the suite.
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+"@restos\/sync-client/);
    }
  });
});
