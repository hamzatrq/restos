// **`catalog.enabled` — the enabled `(branch, channel)` set, served by the authority that
// enforces it** (`01-F60`, `14-F29`, `02-F42`).
//
// `01-F60` prices per `(branch, channel)` **with no fallback**, and completeness is enforced at
// the writer. The enabled set therefore decides two things at once: which cells `14-F29`'s editor
// must make an owner fill, and which saves `assertSavable` refuses. Until August 2026 those two
// readings came from two different declarations — `ENABLED_*` here and `NEXT_PUBLIC_ENABLED_*` in
// `apps/backoffice` — and nothing compared them. A mismatch is the silent failure
// `services/api/CLAUDE.md` records for `BOOTSTRAP_ORG_ID`: every process reports success, the
// gateway returns 200, the row is in Postgres, and every tile on the till reads `no price set`.
//
// **The property this file exists to pin is PROVENANCE, not shape.** A procedure that returns a
// plausible-looking set is worthless here — the whole value is that the answer is the *same value*
// the refusal is computed from. So the assertions below never check the answer against a literal
// alone: they take the answer and drive `catalog.save` with it, in both directions.
//
//   - price an entry for exactly the cells the server named → it SAVES;
//   - drop one of those cells → it is REFUSED, and the refusal names that cell.
//
// Under a server whose `enabled` answer and `enabled` check disagree, one of those two fails.
// Neither can be satisfied by a constant.
//
// **The empty set is a REFUSAL, not "nothing to check"** (`unconfiguredCatalog`). It has to travel
// as an empty set and keep that meaning on the far side, because an empty cross product makes
// every entry vacuously complete — `apps/backoffice`'s M13 is the same misreading one layer out.
//
// **Commandment 8**: gated on `catalog.edit_menu_prices`, like every other read in the catalog bag
// (`catalog-router.ts` gives the reasoning — Appendix A has no catalog-READ row, and inventing one
// would be inventing policy). `authz.test.ts` already sweeps every procedure the router exposes,
// so this file asserts the refusal for THIS procedure by name rather than re-deriving the sweep.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hashPin, ORDER_CHANNELS } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type CatalogDeps,
  createApiServer,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  createMemoryStagedEditStore,
  createMemoryUserStore,
  type EnabledPairs,
} from "../index.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

const SECRET = "catalog-enabled-acceptance-session-secret-not-a-real-one";
const ORG = "org-enabled";
const BRANCH_A = "branch-gulberg";
const BRANCH_B = "branch-dha";
const PASSWORD = "correct horse battery staple";
const CUTOVER_HOUR = 5;
const T0 = 1_786_039_200_000;

/** Two branches × two channels = four cells per sellable entry. */
const ENABLED: EnabledPairs = {
  branches: [BRANCH_A, BRANCH_B],
  channels: ["counter", "foodpanda"],
};

let hash = "";

beforeAll(async () => {
  hash = await hashPin(PASSWORD);
}, 60_000);

type Rpc = { status: number; body: Record<string, unknown> };

type Host = {
  call(path: string, input: unknown, token?: string): Promise<Rpc>;
  login(email: string): Promise<string>;
};

/** The read procedures are GETs under tRPC's HTTP mapping; the writes are POSTs. */
const QUERIES = new Set(["catalog.enabled", "catalog.published"]);

const makeHost = async (enabled: EnabledPairs = ENABLED): Promise<Host> => {
  const now = (): number => T0;
  const deps: CatalogDeps = {
    staged: createMemoryStagedEditStore(),
    publisher: createMemoryCatalogPublisher(),
    ledger: createMemoryLedgerAppender(),
    enabled,
    now,
    cutover_hour: CUTOVER_HOUR,
  };

  const store = createMemoryUserStore([
    {
      user_id: "u-owner",
      org_id: ORG,
      email: "owner@example.com",
      password_hash: hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    // Appendix A denies a cashier `catalog.edit_menu_prices`. She is here so the refusal is
    // asserted against a REAL rejected subject and not only against an absent credential.
    {
      user_id: "u-cashier",
      org_id: ORG,
      email: "cashier@example.com",
      password_hash: hash,
      assignments: [{ role: "cashier", branch_id: BRANCH_A, status: "active" }],
    },
  ]);

  const app = await createApiServer({ store, sessionSecret: SECRET, now, catalog: deps });

  const call = async (path: string, input: unknown, token?: string): Promise<Rpc> => {
    const serialised = JSON.stringify(superjson.serialize(input));
    const headers: Record<string, string> =
      token === undefined ? {} : { authorization: `Bearer ${token}` };
    const res = QUERIES.has(path)
      ? await app.inject({
          method: "GET",
          url: `/trpc/${path}?input=${encodeURIComponent(serialised)}`,
          headers,
        })
      : await app.inject({
          method: "POST",
          url: `/trpc/${path}`,
          headers: { "content-type": "application/json", ...headers },
          payload: serialised,
        });
    return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
  };

  return {
    call,
    login: async (email) => {
      const res = await call("auth.login", { email, password: PASSWORD });
      if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
      return (dataOf(res) as { token: string }).token;
    },
  };
};

const dataOf = (rpc: Rpc): unknown => {
  const result = (rpc.body as { result?: { data?: unknown } }).result;
  if (result === undefined) throw new Error(`expected a result, got ${JSON.stringify(rpc.body)}`);
  return superjson.deserialize(result.data as never);
};

const messageOf = (rpc: Rpc): string =>
  (rpc.body as { error?: { json?: { message?: string } } }).error?.json?.message ?? "";

type Answer = { branches: readonly string[]; channels: readonly string[] };

/** Ask the server what to draw — the call `apps/backoffice` makes before it draws anything. */
const askEnabled = async (host: Host, token: string): Promise<Answer> => {
  const res = await host.call("catalog.enabled", undefined, token);
  expect(res.status).toBe(200);
  return dataOf(res) as Answer;
};

/** Every cell of an answer's cross product — exactly what `14-F29`'s grid renders. */
const cellsOf = (answer: Answer): { branch_id: string; channel: string }[] =>
  answer.branches.flatMap((branch_id) =>
    answer.channels.map((channel) => ({ branch_id, channel })),
  );

/** A sellable entry priced at `price_paisa` on every cell given. */
const itemPricedFor = (
  id: string,
  cells: readonly { branch_id: string; channel: string }[],
  price_paisa = 45_000,
): Record<string, unknown> => ({
  kind: "item",
  id,
  name: "Chicken Biryani",
  prices: cells.map((cell) => ({ ...cell, price_paisa })),
});

describe("catalog.enabled — Commandment 8 before anything is served", () => {
  it("refuses an unauthenticated caller", async () => {
    const host = await makeHost();
    const res = await host.call("catalog.enabled", undefined);
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty("result");
  });

  it("refuses an authenticated caller the matrix denies, and says which action", async () => {
    const host = await makeHost();
    const token = await host.login("cashier@example.com");
    const res = await host.call("catalog.enabled", undefined, token);
    expect(res.status).toBe(403);
    expect(messageOf(res)).toContain("catalog.edit_menu_prices");
    // Not a partial answer, not an empty one — nothing.
    expect(res.body).not.toHaveProperty("result");
  });

  it("answers an owner", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    expect(await askEnabled(host, token)).toEqual({
      branches: [BRANCH_A, BRANCH_B],
      channels: ["counter", "foodpanda"],
    });
  });
});

describe("01-F60 — the set it SERVES is the set it REFUSES against", () => {
  it("accepts an entry priced for exactly the cells it named", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const answer = await askEnabled(host, token);

    const res = await host.call(
      "catalog.save",
      { entry: itemPricedFor("biryani", cellsOf(answer)), apply_when: "now" },
      token,
    );

    // The whole procedure in one assertion: an editor that drew this answer and filled every cell
    // it produced can save. A server answering one set and checking another fails HERE.
    expect(res.status).toBe(200);
    expect(dataOf(res)).toMatchObject({ apply_when: "now", version: 1 });
  });

  it("refuses when ONE cell of its own answer is missing, and names that cell", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const answer = await askEnabled(host, token);

    const cells = cellsOf(answer);
    const dropped = cells.at(-1) as { branch_id: string; channel: string };
    const res = await host.call(
      "catalog.save",
      { entry: itemPricedFor("biryani", cells.slice(0, -1)), apply_when: "now" },
      token,
    );

    // The mirror of the test above, and the half a constant cannot fake: the refusal has to land
    // on a cell this same server told the client to draw.
    expect(res.status).toBe(400);
    expect(messageOf(res)).toContain(`branch ${dropped.branch_id}`);
    expect(messageOf(res)).toContain(`channel ${dropped.channel}`);
    expect(messageOf(res)).toContain("01-F60");
  });

  it("names a pair drawn from its own answer when nothing is priced at all", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const answer = await askEnabled(host, token);

    const res = await host.call(
      "catalog.save",
      { entry: { kind: "item", id: "naan", name: "Naan", prices: [] }, apply_when: "now" },
      token,
    );
    expect(res.status).toBe(400);

    // Whichever cell it names, that cell must be one the client was told to draw. This is the
    // assertion that fails when the answer is a plausible constant rather than the live set.
    const named = cellsOf(answer).filter(
      (cell) =>
        messageOf(res).includes(`branch ${cell.branch_id}`) &&
        messageOf(res).includes(`channel ${cell.channel}`),
    );
    expect(named).toHaveLength(1);
  });

  it("follows the host it was built with rather than a constant", async () => {
    // A DIFFERENT host, one axis different in each direction. Two hosts answering the same thing
    // is the signature of a hardcoded answer, and nothing else in this suite would notice.
    const other = await makeHost({ branches: ["branch-johar"], channels: ["storefront"] });
    const token = await other.login("owner@example.com");
    expect(await askEnabled(other, token)).toEqual({
      branches: ["branch-johar"],
      channels: ["storefront"],
    });

    // And it is still the set the writer checks, on this host too.
    const refused = await other.call(
      "catalog.save",
      {
        entry: itemPricedFor("biryani", [{ branch_id: BRANCH_A, channel: "counter" }]),
        apply_when: "now",
      },
      token,
    );
    expect(refused.status).toBe(400);
    expect(messageOf(refused)).toContain("branch branch-johar");
    expect(messageOf(refused)).toContain("channel storefront");
  });
});

describe("01-F60 — an EMPTY set travels as empty and is not permissive", () => {
  it("serves the empty set rather than throwing", async () => {
    // Throwing would render `apps/backoffice`'s *unreachable* surface, which is true of nothing:
    // the service is answering. It is unconfigured, and that needs different words and a
    // different action from an owner.
    const host = await makeHost({ branches: [], channels: [] });
    const token = await host.login("owner@example.com");
    expect(await askEnabled(host, token)).toEqual({ branches: [], channels: [] });
  });

  it("REFUSES every save on that same host — never treats an empty set as nothing to check", async () => {
    const host = await makeHost({ branches: [], channels: [] });
    const token = await host.login("owner@example.com");

    // An entry with prices, and an entry with none. An empty cross product makes BOTH vacuously
    // complete under the misreading, so both have to be refused for the answer to mean anything.
    for (const entry of [
      itemPricedFor("biryani", [{ branch_id: BRANCH_A, channel: "counter" }]),
      { kind: "item", id: "naan", name: "Naan", prices: [] },
    ]) {
      const res = await host.call("catalog.save", { entry, apply_when: "now" }, token);
      expect(res.status).toBe(400);
      expect(messageOf(res)).toContain("empty");
      expect(messageOf(res)).toContain("01-F60");
    }
  });
});

describe("02-F42 — a channel is a PRICE KEY, and the boot refuses one that is not", () => {
  /**
   * **This check used to live in `apps/backoffice/src/lib/env.ts`** and moved here when
   * `catalog.enabled` made this service the authority. It needs an assertion of its own for the
   * reason AGENTS.md names as the thing no reachability walk can see: a rule that exists so a test
   * *could* assert it, and none does, is indistinguishable from a rule that was deleted.
   *
   * Out of process and through the DECLARED script, because the parser is inside `start()` — a
   * test that imported a copy of it would prove only that its copy is right.
   */
  const bootWith = async (channels: string): Promise<{ code: number | null; err: string }> => {
    const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
    const script = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts?.start;
    if (script === undefined) throw new Error("services/api declares no `start` script");

    const child = spawn(script, {
      shell: true,
      cwd: PKG_DIR,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        PORT: "0",
        SESSION_SECRET: SECRET,
        // No bootstrap owner: the env parse happens before anything is hashed, so this crashes
        // in milliseconds rather than paying `01-F61`'s Argon2id floor.
        BOOTSTRAP_OWNER_EMAIL: "",
        BOOTSTRAP_OWNER_PASSWORD_HASH: "",
        BOOTSTRAP_ORG_ID: "",
        ENABLED_BRANCHES: BRANCH_A,
        ENABLED_CHANNELS: channels,
        SYNC_GATEWAY_URL: "http://127.0.0.1:1/never-reached",
        SYNC_GATEWAY_TOKEN: "not-a-real-token",
      },
    });

    let err = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      err += chunk;
    });

    return await new Promise((done) => {
      const timer = setTimeout(() => {
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
        // A process still alive after 20 s did NOT refuse the env — reported as such rather than
        // as a timeout, so the failure names the property instead of the infrastructure.
        done({ code: null, err: `${err}\n[still running after 20 s — the env was accepted]` });
      }, 20_000);

      child.on("exit", (code) => {
        clearTimeout(timer);
        done({ code, err });
      });
    });
  };

  it("crashes at boot on a channel outside 02-F42's closed set", async () => {
    const { code, err } = await bootWith("counter,dine_in");
    expect(code).toBe(1);
    expect(err).toContain("dine_in");
    expect(err).toContain("02-F42");
    // The refusal states the closed set, so an operator does not go looking for it.
    for (const channel of ORDER_CHANNELS) expect(err).toContain(channel);
  }, 40_000);

  it("CONTROL — the same boot with every channel INSIDE the set does not crash on the env", async () => {
    // Without this the test above proves only that the process can die, not that the channel is
    // why. `dine_in` is an order TYPE (`02-F1`); `storefront` is a price key (`02-F42`).
    const { code, err } = await bootWith("counter,storefront");
    expect(err).not.toContain("02-F42");
    expect(code).not.toBe(1);
  }, 40_000);
});
