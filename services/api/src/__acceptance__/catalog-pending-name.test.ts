// `14-F28` — a pending edit names the thing it stages, and it names it from ITS OWN DRAFT.
//
// The screen this serves lists what lands at 05:00 and offers to cancel each row. It rendered
// `item / item-chicken-karahi` — a kind and a raw id — because `catalog.pending` projected identity
// alone. The name was never missing: `StagedEdit.entry` is a whole `CatalogEntryWire`, so the
// owner's typed name was already in the record and only the projection dropped it.
//
// **THE TRAP THIS FILE IS POINTED AT: resolving the name from `catalog.published` instead.**
// `services/api/src/catalog.ts` names the two version axes and says conflating them is the defect
// this module is shaped against — and a name join is the cheapest way to do it by accident, because
// it is INVISIBLE on any entry that already exists under the same name. The two fixtures below are
// the ones on which it is not invisible, and they are the whole point of the file:
//
//   - a **rename** — published still says "Chicken Karahi" while the draft says something else, so
//     a join renders the menu as it IS in a list whose only job is to say how it WILL BE;
//   - an entry that has **never been published** — a join has nothing to resolve against, and the
//     brand-new item an owner just staged is exactly the row she most needs to recognise.
//
// Neither is expressible against the staging table alone, so every test here reads BOTH axes and
// asserts they disagree where they should (plan §6.4's rule, applied to a name rather than a
// version).
//
// ⚠ No per-hook timeout is declared below, deliberately. `services/api/CLAUDE.md` records ten
// existing overrides as latent flakes of one shape: each silently opts out of the package's
// measured 120 s `hookTimeout` budget, which exists because `01-F61`'s Argon2id floor is expensive
// under a parallel run. This file inherits the budget instead of adding an eleventh.

import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type CatalogDeps,
  type CatalogEntry,
  createApiServer,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  createMemoryStagedEditStore,
  createMemoryUserStore,
  type EnabledPairs,
} from "../index.js";

const SECRET = "pending-name-acceptance-session-secret-not-a-real-one";
const ORG = "org-lahore";
const BRANCH = "branch-gulberg";
const PASSWORD = "correct horse battery staple";

/** 2026-08-06 23:00 Asia/Karachi — the next `01-F46` boundary is six hours out, as in `catalog.test.ts`. */
const T0 = 1_786_039_200_000;
const CUTOVER_HOUR = 5;

const ENABLED: EnabledPairs = { branches: [BRANCH], channels: ["counter"] };

/** `01-F60` — the one enabled cell, priced. Completeness is not this file's subject; it is its floor. */
const priced = (id: string, name: string): CatalogEntry => ({
  kind: "item",
  id,
  name,
  prices: [{ branch_id: BRANCH, channel: "counter", price_paisa: 45_000 }],
});

let hash = "";

type Rpc = { status: number; body: Record<string, unknown> };
type PendingRow = {
  edit_id: string;
  entity: string;
  entity_id: string;
  name: string;
  actor_user_id: string;
  apply_when: string;
  lands_at: number;
};
type Published = { version: number; entries: readonly CatalogEntry[] };

const QUERIES = new Set(["catalog.published", "catalog.pending", "catalog.history"]);

type Host = {
  call(path: string, input: unknown, token?: string): Promise<Rpc>;
  login(): Promise<string>;
};

const makeHost = async (): Promise<Host> => {
  const now = (): number => T0;
  const deps: CatalogDeps = {
    staged: createMemoryStagedEditStore(),
    publisher: createMemoryCatalogPublisher(),
    ledger: createMemoryLedgerAppender(),
    enabled: ENABLED,
    now,
    cutover_hour: CUTOVER_HOUR,
  };

  const store = createMemoryUserStore([
    {
      user_id: "u-owner",
      org_id: ORG,
      email: "owner@example.com",
      password_hash: hash,
      assignments: [{ role: "owner", branch_id: null }],
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
    login: async () => {
      const res = await call("auth.login", { email: "owner@example.com", password: PASSWORD });
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

beforeAll(async () => {
  hash = await hashPin(PASSWORD);
});

describe("14-F28 — the pending row names its own draft", () => {
  it("carries the staged entry's name beside its identity", async () => {
    const host = await makeHost();
    const token = await host.login();
    await host.call(
      "catalog.save",
      { entry: priced("item-chicken-karahi", "Chicken Karahi") },
      token,
    );

    const pending = dataOf(await host.call("catalog.pending", {}, token)) as PendingRow[];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.name).toBe("Chicken Karahi");
    // The identity is kept, not replaced: two entries can share a display name and this row's
    // control cancels one of them.
    expect(pending[0]?.entity).toBe("item");
    expect(pending[0]?.entity_id).toBe("item-chicken-karahi");
  });

  it("shows the NEW name for a rename, while the published axis still shows the old one", async () => {
    // THE test. A join to `catalog.published` renders "Chicken Karahi" here and looks perfectly
    // healthy — the entry exists, the lookup succeeds, and the row is simply answering a different
    // question from the one the screen asks. `14-F28`'s list is "what is waiting to land"; the old
    // name is what a till has today, which is the other axis and `14-F3`'s subject, not this one.
    const host = await makeHost();
    const token = await host.login();

    await host.call(
      "catalog.save",
      { entry: priced("item-chicken-karahi", "Chicken Karahi"), apply_when: "now" },
      token,
    );
    await host.call(
      "catalog.save",
      { entry: priced("item-chicken-karahi", "Chicken Karahi (Half)") },
      token,
    );

    const pending = dataOf(await host.call("catalog.pending", {}, token)) as PendingRow[];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.name).toBe("Chicken Karahi (Half)");

    // The two axes disagree, and that disagreement is CORRECT — asserted rather than assumed, so
    // this test cannot pass by both sides having quietly become the same value.
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.entries.find((e) => e.id === "item-chicken-karahi")?.name).toBe(
      "Chicken Karahi",
    );
  });

  it("names an entry that has NEVER been published — the case a join cannot serve", async () => {
    const host = await makeHost();
    const token = await host.login();
    await host.call("catalog.save", { entry: priced("item-seekh-kebab", "Seekh Kebab") }, token);

    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    // Nothing to resolve against: version 0, no entries. A join renders the identifier for ever.
    expect(published.version).toBe(0);
    expect(published.entries).toEqual([]);

    const pending = dataOf(await host.call("catalog.pending", {}, token)) as PendingRow[];
    expect(pending[0]?.name).toBe("Seekh Kebab");
  });

  it("names each staged entry from its own draft, never from another row's", async () => {
    // A join implemented as "look it up once and reuse" would pass the single-row cases above.
    const host = await makeHost();
    const token = await host.login();
    await host.call("catalog.save", { entry: priced("item-daal", "Daal Maash") }, token);
    await host.call("catalog.save", { entry: priced("item-naan", "Garlic Naan") }, token);

    const pending = dataOf(await host.call("catalog.pending", {}, token)) as PendingRow[];
    expect(pending.map((row) => [row.entity_id, row.name])).toEqual([
      ["item-daal", "Daal Maash"],
      ["item-naan", "Garlic Naan"],
    ]);
  });

  it("keeps its name on an archive, because 14-F7 stages a tombstone and 01-F55 keeps it resolvable", async () => {
    const host = await makeHost();
    const token = await host.login();
    await host.call(
      "catalog.save",
      { entry: priced("item-nihari", "Nihari"), apply_when: "now" },
      token,
    );
    const archived = await host.call("catalog.archive", { kind: "item", id: "item-nihari" }, token);
    expect(archived.status).toBe(200);

    const pending = dataOf(await host.call("catalog.pending", {}, token)) as PendingRow[];
    // "Archiving Nihari" is the row an owner must be able to recognise before cancelling it; an
    // identifier here is worst precisely where the act is least reversible in an owner's head.
    expect(pending[0]?.name).toBe("Nihari");
  });
});
