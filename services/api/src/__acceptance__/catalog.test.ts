// B-3 + B-4 acceptance — the catalog router, the staged-edit store and the publish path
// (`plans/wave-1/backoffice-catalog.md` §3.2, §3.3, §4.2, §4.3).
//
// What this binds, and why each clause is here rather than assumed:
//
// - **`14-F28`** — "a menu edit's application time is the owner's choice per edit, DEFAULT
//   DAY-END, with an explicit immediate option. Pending day-end edits are visible and cancellable
//   until they land." The default is the load-bearing half: `27-F4` makes moving an operational
//   grid item a breaking change because a cashier's speed is muscle memory, so an edit lands at
//   the 05:00 business-day boundary (`01-F46`) and a grid never moves mid-shift.
// - **`01-F60`** — every enabled `(branch, channel)` pair is priced, enforced at the WRITER, with
//   no fallback to a house price. `modifier` is SELLABLE and **a free modifier carries an explicit
//   `0` on every enabled pair**, so that "this costs nothing" and "somebody forgot foodpanda" are
//   never indistinguishable. The enabled set is a REQUIRED input, never one defaulting to
//   "check nothing".
// - **`14-F29`** — the editor refuses the same way `publishCatalog` does, "because this editor is
//   where an owner meets it".
// - **`14-F7` + `01-F55`** — archive, never delete; a tombstoned entry stays resolvable so an old
//   order still renders its name.
// - **`14-F3` + `14-F6` + `14-F8`** — every edit appends `catalog.changed` with its actor, one per
//   entity so history stays per-item.
// - **`03-F50`** — `station` is catalog data on the entry.
// - **Commandment 8 / `18 §5`** — every procedure passes through `can()`; a cashier's token cannot
//   edit a menu, asserted against the API rather than a hidden button.
//
// **THE TRAP THIS FILE IS SHAPED AROUND: a staged edit is not a published catalog.** Two version
// axes exist — the staged draft an owner is editing, and the published artifact devices fetch
// (`01-F52`..`01-F56`). Conflating them means a device fetches a half-finished menu, or a
// cancelled day-end edit still reaches a till. So every timing assertion below is made against
// **what a device would fetch** (`catalog.published`), never against the staging table: plan §6.4
// says so outright, and an assertion on the staging table cannot tell the two apart.

import { businessDayBounds, hashPin, parseEvent } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import {
  appRouter,
  assertSavable,
  type CatalogDeps,
  type CatalogEntry,
  type CatalogPublisher,
  createApiServer,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  createMemoryStagedEditStore,
  createMemoryUserStore,
  dayEndBoundary,
  type EnabledPairs,
  type LedgerRecord,
} from "../index.js";

const SECRET = "b3-b4-acceptance-session-secret-not-a-real-one";
const ORG = "org-lahore";
const BRANCH_A = "branch-gulberg";
const BRANCH_B = "branch-dha";

/**
 * 2026-08-06 23:00 Asia/Karachi. Chosen so the next `01-F46` boundary (05:00 the next morning) is
 * six hours away — inside the 12 h session TTL, so the clock can be advanced past the boundary
 * without the token expiring and turning a `14-F28` failure into a `401` that looks like one.
 */
const T0 = 1_786_039_200_000;
/** 2026-08-07 05:00 Asia/Karachi. Asserted against `businessDayBounds` below, never just trusted. */
const BOUNDARY = 1_786_060_800_000;
const CUTOVER_HOUR = 5;

/** `01-F60`'s enabled set: two branches × two channels = four cells per sellable entry. */
const ENABLED: EnabledPairs = {
  branches: [BRANCH_A, BRANCH_B],
  channels: ["counter", "foodpanda"],
};

const cells = (price_paisa: number): CatalogEntry["prices"] =>
  ENABLED.branches.flatMap((branch_id) =>
    ENABLED.channels.map((channel) => ({ branch_id, channel: channel as "counter", price_paisa })),
  );

// ────────────────────────────────────────────────────────────────────────────────────────────
// An INDEPENDENT transcription of `publishCatalog`'s `01-F60` rule.
//
// Not imported from the implementation, on purpose: the property under test is "the editor
// refuses what the kernel would refuse" (`14-F29`), and importing the API's own validator would
// make that a tautology — a suite that stayed green after the save-side check was deleted.
// Every publish this suite provokes runs through it, so an entry the API sends that the gateway
// would reject fails the test that provoked it rather than passing silently.
// ────────────────────────────────────────────────────────────────────────────────────────────

const SELLABLE = ["item", "variant", "modifier"];

const gatewayWouldRefuse = (entry: CatalogEntry, enabled: EnabledPairs): string | null => {
  if (!SELLABLE.includes(entry.kind) || entry.deleted === true) return null;
  const have = new Set((entry.prices ?? []).map((p) => `${p.branch_id}|${p.channel}`));
  for (const branch_id of enabled.branches) {
    for (const channel of enabled.channels) {
      if (!have.has(`${branch_id}|${channel}`)) return `${entry.id}: ${branch_id}/${channel}`;
    }
  }
  return null;
};

type PublishCall = {
  org_id: string;
  entries: readonly CatalogEntry[];
  actor_user_id: string | null;
  enabled: EnabledPairs | undefined;
};

/** Wraps the memory publisher and records every call, refusing what the kernel would refuse. */
const recording = (inner: CatalogPublisher, calls: PublishCall[]): CatalogPublisher => ({
  publish: async (org_id, entries, opts) => {
    calls.push({
      org_id,
      entries,
      actor_user_id: opts.actor_user_id,
      enabled: (opts as { enabled?: EnabledPairs }).enabled,
    });
    if (opts.enabled === undefined) {
      throw new Error("publishCatalog would refuse: no `enabled` set was declared (01-F60)");
    }
    for (const entry of entries) {
      const missing = gatewayWouldRefuse(entry, opts.enabled);
      if (missing !== null) {
        throw new Error(`publishCatalog would refuse ${missing} (01-F60)`);
      }
    }
    return inner.publish(org_id, entries, opts);
  },
  published: inner.published,
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// The host, over the real Fastify + tRPC stack — plan §6.2: "asserted against the *API*, not the
// UI. A test that only checks a hidden button is the defect Commandment 8 names."
// ────────────────────────────────────────────────────────────────────────────────────────────

const PASSWORD = "correct horse battery staple";
let hash = "";

type Rpc = { status: number; body: Record<string, unknown> };

type Host = {
  call(path: string, input: unknown, token?: string): Promise<Rpc>;
  login(email: string): Promise<string>;
  clock: { at: number };
  publishes: PublishCall[];
  ledger: () => Promise<readonly LedgerRecord[]>;
  deps: CatalogDeps;
};

const QUERIES = new Set(["catalog.published", "catalog.pending", "catalog.history"]);

const makeHost = async (enabled: EnabledPairs = ENABLED): Promise<Host> => {
  const clock = { at: T0 };
  const now = (): number => clock.at;
  const publishes: PublishCall[] = [];
  const ledgerStore = createMemoryLedgerAppender();
  const deps: CatalogDeps = {
    staged: createMemoryStagedEditStore(),
    publisher: recording(createMemoryCatalogPublisher(), publishes),
    ledger: ledgerStore,
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
      assignments: [{ role: "owner", branch_id: null }],
    },
    {
      user_id: "u-owner-2",
      org_id: ORG,
      email: "owner2@example.com",
      password_hash: hash,
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
      user_id: "u-manager",
      org_id: ORG,
      email: "manager@example.com",
      password_hash: hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH_A }],
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
    clock,
    publishes,
    deps,
    ledger: () => ledgerStore.history(ORG),
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

type Published = { version: number; entries: readonly CatalogEntry[] };
type Pending = {
  edit_id: string;
  entity: string;
  entity_id: string;
  actor_user_id: string;
  apply_when: string;
  lands_at: number;
}[];
type SaveResult = {
  edit_id: string;
  apply_when: string;
  lands_at: number;
  version: number | null;
};

const item = (id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  kind: "item",
  id,
  name: `Item ${id}`,
  prices: cells(45_000),
  ...overrides,
});

beforeAll(async () => {
  // Once — `01-F61`'s Argon2id cost floor makes every login deliberately slow.
  hash = await hashPin(PASSWORD);
}, 60_000);

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("the fixture's own arithmetic (a suite that mis-states the boundary proves nothing)", () => {
  it("T0 and BOUNDARY are the `01-F46` day this suite claims they are", () => {
    const bounds = businessDayBounds(T0, CUTOVER_HOUR);
    expect(bounds.end_ms).toBe(BOUNDARY);
    expect(BOUNDARY - T0).toBe(6 * 60 * 60 * 1000);
    // Inside the 12 h session TTL, or every post-boundary assertion below would be a 401.
    expect(BOUNDARY - T0).toBeLessThan(12 * 60 * 60 * 1000);
  });

  it("`dayEndBoundary` is the next 05:00 Asia/Karachi, from either side of midnight", () => {
    expect(dayEndBoundary(T0, CUTOVER_HOUR)).toBe(BOUNDARY);
    // 01:30 the following morning still belongs to the PREVIOUS business day, so it lands on the
    // SAME 05:00 — the whole point of `01-F46`, and the case a naive "tomorrow at 05:00" gets
    // wrong by 24 hours.
    const afterMidnight = Date.parse("2026-08-06T20:30:00Z");
    expect(dayEndBoundary(afterMidnight, CUTOVER_HOUR)).toBe(BOUNDARY);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("`14-F28` — a staged edit is not a published catalog", () => {
  it("CONTROL — an apply-now save reaches a device immediately", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");

    const before = (await host.call("catalog.published", {}, token)) as Rpc;
    expect((dataOf(before) as Published).version).toBe(0);

    const saved = await host.call(
      "catalog.save",
      { entry: item("biryani"), apply_when: "now" },
      token,
    );
    expect(saved.status).toBe(200);
    expect((dataOf(saved) as SaveResult).apply_when).toBe("now");

    const after = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(after.version).toBe(1);
    expect(after.entries.map((e) => e.id)).toEqual(["biryani"]);
  });

  it("a DEFAULT save (no `apply_when`) does not reach a device — the `27-F4` breaking change is not the default", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");

    const saved = await host.call("catalog.save", { entry: item("biryani") }, token);
    expect(saved.status).toBe(200);
    // The response says day-end …
    expect((dataOf(saved) as SaveResult).apply_when).toBe("day_end");
    expect((dataOf(saved) as SaveResult).version).toBeNull();

    // … and the device — the assertion that actually decides it — has nothing.
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.version).toBe(0);
    expect(published.entries).toEqual([]);
    // Nothing was even offered to the kernel.
    expect(host.publishes).toHaveLength(0);
  });

  it("the staged edit is visible on the OTHER axis, with its landing instant", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani") }, token);

    const pending = dataOf(await host.call("catalog.pending", {}, token)) as Pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.entity_id).toBe("biryani");
    expect(pending[0]?.apply_when).toBe("day_end");
    expect(pending[0]?.lands_at).toBe(BOUNDARY);
    expect(pending[0]?.actor_user_id).toBe("u-owner");
  });

  it("an apply-now edit never appears as pending", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);
    expect(dataOf(await host.call("catalog.pending", {}, token))).toEqual([]);
  });

  it("a day-end edit lands at the boundary and not one millisecond before", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani") }, token);

    // One millisecond short. A sweep here must publish nothing.
    host.clock.at = BOUNDARY - 1;
    expect(dataOf(await host.call("catalog.runDayEnd", {}, token))).toEqual({ version: null });
    expect((dataOf(await host.call("catalog.published", {}, token)) as Published).version).toBe(0);

    // On the boundary.
    host.clock.at = BOUNDARY;
    expect(dataOf(await host.call("catalog.runDayEnd", {}, token))).toEqual({ version: 1 });
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.version).toBe(1);
    expect(published.entries.map((e) => e.id)).toEqual(["biryani"]);
    // And it is no longer pending — a landed edit that stayed cancellable would offer to cancel
    // something already on every till.
    expect(dataOf(await host.call("catalog.pending", {}, token))).toEqual([]);
  });

  it("a CANCELLED day-end edit never lands, however long the sweep runs", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const saved = dataOf(
      await host.call("catalog.save", { entry: item("biryani") }, token),
    ) as SaveResult;

    const cancelled = await host.call("catalog.cancelPending", { edit_id: saved.edit_id }, token);
    expect(dataOf(cancelled)).toEqual({ cancelled: true });
    expect(dataOf(await host.call("catalog.pending", {}, token))).toEqual([]);

    // Past the boundary, and a second sweep a day later for good measure. The second needs a
    // fresh session: the 12 h TTL expires across a day, and a 401 there would look like a pass.
    host.clock.at = BOUNDARY + 1;
    expect(dataOf(await host.call("catalog.runDayEnd", {}, token))).toEqual({ version: null });
    host.clock.at = BOUNDARY + 24 * 60 * 60 * 1000;
    const tomorrow = await host.login("owner@example.com");
    expect(dataOf(await host.call("catalog.runDayEnd", {}, tomorrow))).toEqual({ version: null });

    // The device never heard of it, the kernel was never asked, and no history was written.
    const published = dataOf(await host.call("catalog.published", {}, tomorrow)) as Published;
    expect(published.version).toBe(0);
    expect(published.entries).toEqual([]);
    expect(host.publishes).toHaveLength(0);
    expect(await host.ledger()).toEqual([]);
  });

  it("cancelling one of two staged edits lands exactly the other", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const doomed = dataOf(
      await host.call("catalog.save", { entry: item("nihari") }, token),
    ) as SaveResult;
    await host.call("catalog.save", { entry: item("karahi") }, token);

    await host.call("catalog.cancelPending", { edit_id: doomed.edit_id }, token);
    host.clock.at = BOUNDARY;
    await host.call("catalog.runDayEnd", {}, token);

    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.entries.map((e) => e.id)).toEqual(["karahi"]);
  });

  it("cancelling an edit that has already landed reports that it could not", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const saved = dataOf(
      await host.call("catalog.save", { entry: item("biryani") }, token),
    ) as SaveResult;
    host.clock.at = BOUNDARY;
    await host.call("catalog.runDayEnd", {}, token);

    const late = await host.call("catalog.cancelPending", { edit_id: saved.edit_id }, token);
    expect(dataOf(late)).toEqual({ cancelled: false });
    // And the landed version is untouched — a "cancel" that unpublished would be a delete.
    expect((dataOf(await host.call("catalog.published", {}, token)) as Published).version).toBe(1);
  });

  it("the sweep is idempotent — running it twice publishes one version", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani") }, token);
    host.clock.at = BOUNDARY;
    await host.call("catalog.runDayEnd", {}, token);
    expect(dataOf(await host.call("catalog.runDayEnd", {}, token))).toEqual({ version: null });
    expect((dataOf(await host.call("catalog.published", {}, token)) as Published).version).toBe(1);
    expect(host.publishes).toHaveLength(1);
  });

  it("an edit staged after midnight lands on the SAME morning's boundary", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    host.clock.at = Date.parse("2026-08-06T20:30:00Z"); // 01:30 Asia/Karachi
    const saved = dataOf(
      await host.call("catalog.save", { entry: item("biryani") }, token),
    ) as SaveResult;
    expect(saved.lands_at).toBe(BOUNDARY);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("`01-F60`/`14-F29` — the editor refuses exactly what the kernel refuses", () => {
  it("CONTROL — an item priced on every enabled pair saves", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const res = await host.call("catalog.save", { entry: item("biryani") }, token);
    expect(res.status).toBe(200);
  });

  it("refuses an item that leaves an enabled (branch, channel) pair unpriced, and NAMES it", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const partial = item("biryani", {
      prices: [
        { branch_id: BRANCH_A, channel: "counter", price_paisa: 45_000 },
        { branch_id: BRANCH_A, channel: "foodpanda", price_paisa: 52_000 },
        { branch_id: BRANCH_B, channel: "counter", price_paisa: 47_000 },
        // BRANCH_B / foodpanda missing — the forgotten aggregator price `01-F60` exists for.
      ],
    });

    const res = await host.call("catalog.save", { entry: partial }, token);
    expect(res.status).toBe(400);
    expect(messageOf(res)).toContain(BRANCH_B);
    expect(messageOf(res)).toContain("foodpanda");
    expect(messageOf(res)).toContain("01-F60");
    // Refused at SAVE, so nothing was staged and nothing waits to fail at 05:00.
    expect(dataOf(await host.call("catalog.pending", {}, token))).toEqual([]);
  });

  it("refuses an unpriced item on the apply-now path too, not only the day-end one", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const res = await host.call(
      "catalog.save",
      { entry: item("biryani", { prices: [] }), apply_when: "now" },
      token,
    );
    expect(res.status).toBe(400);
    expect(host.publishes).toHaveLength(0);
  });

  it("accepts a FREE modifier carrying an explicit 0 on every enabled pair", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const free: CatalogEntry = {
      kind: "modifier",
      id: "no-onions",
      name: "No onions",
      parent_id: "mg-salad",
      prices: cells(0),
    };
    const res = await host.call("catalog.save", { entry: free, apply_when: "now" }, token);
    expect(res.status).toBe(200);

    // And `0` survives to the device as a price, not as an absence — `if (!price)` on any layer
    // between here and the till would drop it and make the add-on unsellable.
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    const stored = published.entries.find((e) => e.id === "no-onions");
    expect(stored?.prices).toHaveLength(4);
    expect(stored?.prices?.every((p) => p.price_paisa === 0)).toBe(true);
  });

  it("refuses a modifier with a MISSING price rather than an explicit 0 — `modifier` is SELLABLE", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const forgotten: CatalogEntry = {
      kind: "modifier",
      id: "extra-raita",
      name: "Extra raita",
      parent_id: "mg-sides",
    };
    const res = await host.call("catalog.save", { entry: forgotten }, token);
    expect(res.status).toBe(400);
    expect(messageOf(res)).toContain("extra-raita");
    expect(messageOf(res)).toContain("01-F60");
  });

  it("refuses a modifier priced on some pairs and not others", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const res = await host.call(
      "catalog.save",
      {
        entry: {
          kind: "modifier",
          id: "extra-raita",
          name: "Extra raita",
          prices: [{ branch_id: BRANCH_A, channel: "counter", price_paisa: 0 }],
        },
      },
      token,
    );
    expect(res.status).toBe(400);
    expect(messageOf(res)).toContain("foodpanda");
  });

  it("carries no price requirement onto `category` or `modifier_group`", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    for (const kind of ["category", "modifier_group"]) {
      const res = await host.call(
        "catalog.save",
        { entry: { kind, id: `${kind}-1`, name: "Sides" }, apply_when: "now" },
        token,
      );
      expect(res.status, kind).toBe(200);
    }
  });

  it("refuses a price keyed to a channel outside `02-F42`'s closed set", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    const res = await host.call(
      "catalog.save",
      {
        entry: item("biryani", {
          prices: [
            ...(cells(45_000) ?? []),
            // `dine_in` is an order TYPE (`02-F1`), not a channel. A price keyed to it resolves
            // for no order ever placed.
            { branch_id: BRANCH_A, channel: "dine_in" as "counter", price_paisa: 45_000 },
          ],
        }),
      },
      token,
    );
    expect(res.status).toBe(400);
  });

  it("REFUSES EVERY SAVE when the enabled set is empty — never treats it as nothing to check", async () => {
    // The founder's ruling arrived at from the other direction: an optional completeness input
    // means a forgetful caller silently skips the check. An empty cross product is the same
    // omission wearing a different costume, and it would accept an item priced for nowhere.
    const host = await makeHost({ branches: [], channels: [] });
    const token = await host.login("owner@example.com");
    const res = await host.call(
      "catalog.save",
      { entry: item("biryani", { prices: [] }), apply_when: "now" },
      token,
    );
    expect(res.status).toBe(400);
    expect(messageOf(res)).toContain("01-F60");
    expect(host.publishes).toHaveLength(0);
  });

  it("a host declaring no catalog dependencies at all still refuses rather than publishing", async () => {
    // `createApiServer` without `catalog` — the B-2 shape. Fail-closed: an operator who never
    // stated the enabled pairs gets a refusal, not a default menu.
    const store = createMemoryUserStore([
      {
        user_id: "u-owner",
        org_id: ORG,
        email: "owner@example.com",
        password_hash: hash,
        assignments: [{ role: "owner", branch_id: null }],
      },
    ]);
    const app = await createApiServer({ store, sessionSecret: SECRET, now: () => T0 });
    const post = async (path: string, input: unknown, token?: string) =>
      app.inject({
        method: "POST",
        url: `/trpc/${path}`,
        headers: {
          "content-type": "application/json",
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        payload: JSON.stringify(superjson.serialize(input)),
      });

    const login = await post("auth.login", { email: "owner@example.com", password: PASSWORD });
    const token = (
      superjson.deserialize(
        (JSON.parse(login.body) as { result: { data: never } }).result.data,
      ) as { token: string }
    ).token;

    const res = await post("catalog.save", { entry: item("biryani") }, token);
    expect(res.statusCode).toBe(400);
  });

  it("`assertSavable` is the same rule the router applies, callable directly", () => {
    // The unit-level CONTROL for the two mutants above, so a router-only failure and a
    // rule-level failure are distinguishable.
    expect(() => assertSavable(item("ok"), ENABLED)).not.toThrow();
    expect(() => assertSavable(item("bad", { prices: [] }), ENABLED)).toThrow(/01-F60/);
    expect(() => assertSavable(item("ok"), { branches: [], channels: [] })).toThrow(/01-F60/);
  });

  it("hands `publishCatalog` the enabled set on every publish it makes", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("a"), apply_when: "now" }, token);
    await host.call("catalog.save", { entry: item("b") }, token);
    host.clock.at = BOUNDARY;
    await host.call("catalog.runDayEnd", {}, token);

    expect(host.publishes).toHaveLength(2);
    for (const publish of host.publishes) {
      expect(publish.enabled).toEqual(ENABLED);
      expect(publish.org_id).toBe(ORG);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("`14-F7`/`01-F55` — archive, never delete", () => {
  const archived = async (): Promise<{ host: Host; token: string }> => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);
    await host.call("catalog.save", { entry: item("nihari"), apply_when: "now" }, token);
    return { host, token };
  };

  it("CONTROL — the two items are on the grid before anything is archived", async () => {
    const { host, token } = await archived();
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.entries.map((e) => e.id).sort()).toEqual(["biryani", "nihari"]);
    expect(published.entries.every((e) => e.deleted !== true)).toBe(true);
  });

  it("an archived item STAYS resolvable, with its name, marked deleted", async () => {
    const { host, token } = await archived();
    const res = await host.call(
      "catalog.archive",
      { kind: "item", id: "biryani", apply_when: "now" },
      token,
    );
    expect(res.status).toBe(200);

    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    // The row COUNT does not shrink — a delete that actually deleted would drop it here, and a
    // reprint of an order placed this morning would render a raw id (`01-F54`).
    expect(published.entries).toHaveLength(2);
    const tombstone = published.entries.find((e) => e.id === "biryani");
    expect(tombstone?.deleted).toBe(true);
    expect(tombstone?.name).toBe("Item biryani");
  });

  it("archiving does not require the tombstone to be priced", async () => {
    // `01-F55` keeps a tombstone resolvable and off the sellable grid; requiring a price on it
    // would make archiving impossible the moment a channel is added.
    const { host, token } = await archived();
    const res = await host.call(
      "catalog.archive",
      { kind: "item", id: "biryani", apply_when: "now" },
      token,
    );
    expect(res.status).toBe(200);
    expect(host.publishes.at(-1)?.entries[0]?.deleted).toBe(true);
  });

  it("archiving defaults to day-end like every other edit", async () => {
    const { host, token } = await archived();
    const res = await host.call("catalog.archive", { kind: "item", id: "biryani" }, token);
    expect((dataOf(res) as SaveResult).apply_when).toBe("day_end");
    // Still on the grid, un-tombstoned, until the boundary.
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.entries.find((e) => e.id === "biryani")?.deleted).toBeUndefined();
  });

  it("refuses to archive an id that was never published", async () => {
    const { host, token } = await archived();
    const res = await host.call("catalog.archive", { kind: "item", id: "ghost" }, token);
    expect(res.status).toBe(404);
    expect(messageOf(res)).toContain("14-F7");
  });

  it("exposes no procedure that removes a row", () => {
    // The mechanism's ABSENCE, stated. `14-F7` is "archive, never delete", so a `catalog.delete`
    // appearing later is a spec change, not an implementation detail. The walk is over the real
    // router, so it also covers a procedure written after this file.
    const names = Object.keys(appRouter._def.procedures);
    expect(names.length).toBeGreaterThan(2);
    expect(names.filter((name) => /delete|remove|destroy|purge/i.test(name))).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("`14-F3`/`14-F6`/`14-F8` — every edit appends `catalog.changed`, with its actor", () => {
  it("CONTROL — a landed edit appends exactly one record naming the editor", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);

    const history = await host.ledger();
    expect(history).toHaveLength(1);
    const record = history[0] as LedgerRecord;
    expect(record.type).toBe("catalog.changed");
    expect(record.actor_user_id).toBe("u-owner");
    expect(record.payload.entity).toBe("item");
    expect(record.payload.entity_id).toBe("biryani");
    expect(record.payload.version).toBe(1);
  });

  it("the appended payload is a legal `catalog.changed` per the `01 §4` registry", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);
    const record = (await host.ledger())[0] as LedgerRecord;

    // Envelope fields the ADAPTER mints are supplied here — the point of the assertion is that
    // the TYPE and PAYLOAD this service produces parse against the registry, so a field renamed
    // or dropped fails at the schema rather than three layers downstream.
    const parsed = parseEvent({
      id: "evt-1",
      org_id: ORG,
      branch_id: BRANCH_A,
      device_id: "back-office",
      actor_user_id: record.actor_user_id,
      lamport_seq: 1,
      device_created_at: T0,
      branch_created_at: T0,
      time_basis: "branch",
      server_received_at: T0,
      type: record.type,
      schema_version: 1,
      payload: record.payload,
      refs: [],
    });
    expect(parsed.type).toBe("catalog.changed");
    // `01-F5`/`02-F19` put attribution in the envelope, and `14-F3` renders "changed by ???"
    // without it.
    expect(parsed.envelope.actor_user_id).toBe("u-owner");
  });

  it("`before_ref` is null for a new entry and the PRIOR entry's ref for an edit", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);
    await host.call(
      "catalog.save",
      { entry: item("biryani", { prices: cells(48_000) }), apply_when: "now" },
      token,
    );

    const history = await host.ledger();
    expect(history).toHaveLength(2);
    expect((history[0] as LedgerRecord).payload.before_ref).toBeNull();
    const second = history[1] as LedgerRecord;
    // The edit's before-ref is the FIRST publish's after-ref — that chain is what makes
    // "450 → 480" renderable at all.
    expect(second.payload.before_ref).toBe((history[0] as LedgerRecord).payload.after_ref);
    expect(second.payload.after_ref).not.toBe(second.payload.before_ref);
    expect(second.payload.version).toBe(2);
  });

  it("a bulk day-end landing appends one record PER ITEM (`14-F8`)", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    for (const id of ["biryani", "nihari", "karahi"]) {
      await host.call("catalog.save", { entry: item(id) }, token);
    }
    host.clock.at = BOUNDARY;
    await host.call("catalog.runDayEnd", {}, token);

    const history = await host.ledger();
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.payload.entity_id).sort()).toEqual(["biryani", "karahi", "nihari"]);
    // One version for the sweep, carried by every record in it.
    expect(new Set(history.map((r) => r.payload.version))).toEqual(new Set([1]));
  });

  it("attributes a landed edit to the OWNER WHO STAGED IT, not to whoever ran the sweep", async () => {
    const host = await makeHost();
    const one = await host.login("owner@example.com");
    const two = await host.login("owner2@example.com");
    await host.call("catalog.save", { entry: item("biryani") }, one);
    host.clock.at = BOUNDARY;
    await host.call("catalog.runDayEnd", {}, two);

    expect((await host.ledger())[0]?.actor_user_id).toBe("u-owner");
  });

  it("a staged edit that has not landed has appended nothing", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani") }, token);
    expect(await host.ledger()).toEqual([]);
    // The history procedure agrees — `14-F3` is a view of the ledger, not of the draft.
    expect(dataOf(await host.call("catalog.history", {}, token))).toEqual([]);
  });

  it("an archive appends history too", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);
    await host.call("catalog.archive", { kind: "item", id: "biryani", apply_when: "now" }, token);
    const history = await host.ledger();
    expect(history).toHaveLength(2);
    expect((history[1] as LedgerRecord).payload.entity_id).toBe("biryani");
    expect((history[1] as LedgerRecord).actor_user_id).toBe("u-owner");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("`03-F50` — `station` is catalog data on the entry", () => {
  it("survives the round trip to what a device fetches", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call(
      "catalog.save",
      { entry: item("biryani", { station: "grill" }), apply_when: "now" },
      token,
    );
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.entries[0]?.station).toBe("grill");
  });

  it("absence stays absence — inheritance down the `01-F21` chain, not a default written in", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, token);
    const published = dataOf(await host.call("catalog.published", {}, token)) as Published;
    expect(published.entries[0]?.station).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("Commandment 8 — the catalog surface is server-authorized", () => {
  const PROCEDURES: readonly [string, unknown][] = [
    ["catalog.published", {}],
    ["catalog.pending", {}],
    ["catalog.history", {}],
    ["catalog.save", { entry: item("biryani") }],
    ["catalog.archive", { kind: "item", id: "biryani" }],
    ["catalog.cancelPending", { edit_id: "any" }],
    ["catalog.runDayEnd", {}],
  ];

  it("CONTROL — the owner reaches every one of them", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    for (const [path, input] of PROCEDURES) {
      const res = await host.call(path, input, token);
      // 404 is `archive`'s honest answer for an unpublished id; what matters is that it is not
      // 401 or 403 — the owner got through the gate.
      expect([200, 404], path).toContain(res.status);
    }
  });

  it("refuses a CASHIER on every one of them (Appendix A: menu editing is owner-only)", async () => {
    const host = await makeHost();
    const token = await host.login("cashier@example.com");
    for (const [path, input] of PROCEDURES) {
      expect((await host.call(path, input, token)).status, path).toBe(403);
    }
  });

  it("refuses a BRANCH MANAGER on every one of them", async () => {
    const host = await makeHost();
    const token = await host.login("manager@example.com");
    for (const [path, input] of PROCEDURES) {
      expect((await host.call(path, input, token)).status, path).toBe(403);
    }
  });

  it("refuses every one of them with no session at all", async () => {
    const host = await makeHost();
    for (const [path, input] of PROCEDURES) {
      expect((await host.call(path, input)).status, path).toBe(401);
    }
  });

  it("a refused save changes nothing", async () => {
    const host = await makeHost();
    const cashier = await host.login("cashier@example.com");
    await host.call("catalog.save", { entry: item("biryani"), apply_when: "now" }, cashier);
    const owner = await host.login("owner@example.com");
    expect((dataOf(await host.call("catalog.published", {}, owner)) as Published).version).toBe(0);
    expect(dataOf(await host.call("catalog.pending", {}, owner))).toEqual([]);
    expect(host.publishes).toHaveLength(0);
  });

  it("takes the actor from the SESSION, never from the request body", async () => {
    const host = await makeHost();
    const token = await host.login("owner@example.com");
    await host.call(
      "catalog.save",
      {
        entry: item("biryani"),
        apply_when: "now",
        // Any of these being honoured would put a forged name in `14-F3`'s history.
        actor_user_id: "u-cashier",
        actor: "u-cashier",
        org_id: "org-somewhere-else",
      },
      token,
    );
    expect((await host.ledger())[0]?.actor_user_id).toBe("u-owner");
    expect(host.publishes[0]?.org_id).toBe(ORG);
  });
});
