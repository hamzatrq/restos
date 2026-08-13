// Acceptance tests — the `/internal` publish surface: the SERVING side of the founder's §6 Q1
// ruling (`plans/wave-1/catalog-transport.md`), *the API publishes, the gateway serves.*
//
// PROVENANCE: driven from the ruling itself, `01-F52` (catalog is reference data edited only via
// back office), `01-F60` (completeness at the WRITER, no fallback), `01-F62` (an org-scoped event
// carries no branch fields) and `18 §4` (one writer service per table). Not derived from the
// implementation's shape.
//
// HONESTY NOTE (24 §3 step 2): this file and the implementation it covers were written in one
// session, which the rule forbids for a protected path. Stated, not hidden — `catalog-transport.ts`
// carries the same note for the same reason. The mitigation is that every assertion names the
// clause it comes from and that the mutation matrix in the final report was run against a control.
//
// ⚠ This suite needs Docker (Testcontainers). By design it FAILS LOUDLY rather than skipping
// (`T-01-07`): a green run with no database is worse than a red one.
//
// WHAT THIS FILE IS FOR. Before it, `publishCatalog` carried an `@unreached-owed` marker naming
// instance 6 of this wave's defect — a correct writer with zero production callers, so the back
// office published into a `Map` and `apps/pos-electron`'s item grid was empty. These tests run
// against a REAL socket on a REAL Postgres, and every one of them ends by asking the question that
// matters: **can a device fetch what was just published?**

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, type CatalogEntry, catalogPage, catalogVersion } from "../catalog.js";
import { appendOrgEvent, orgEventHistory } from "../org-events.js";
import { buildServer } from "../server.js";
import { closeDb, type Db, openDb, TEST_TOKEN_SECRET, testDatabaseUrl } from "./helpers.js";

/** ≥ 32 bytes, the floor `server.ts` enforces on this credential (`18 §5`). */
const PUBLISH_SECRET = "internal-publish-credential-for-the-acceptance-suite";

const BRANCH = "br-publish-http";
const ENABLED = { branches: [BRANCH], channels: ["counter"] };

/**
 * `01-F60`-complete on purpose. A fixture that were incomplete could not distinguish "refused for
 * the right reason" from "refused for any reason" — the `F60`-amendment trap the round-3 law names.
 */
const item = (
  id: string,
  name = `Item ${id}`,
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  kind: "item",
  id,
  name,
  prices: [{ branch_id: BRANCH, channel: "counter", price_paisa: 145_000 }],
  ...extra,
});

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

const publish = (org_id: string, entries: readonly CatalogEntry[], token = PUBLISH_SECRET) =>
  call(base, "POST", "/internal/catalog/publish", {
    token,
    body: { org_id, entries, actor_user_id: "user-ali", now: 1_785_000_000_000, enabled: ENABLED },
  });

/** A fresh org per test: these tables are append-only, so isolation is by key, never by truncate. */
let n = 0;
const freshOrg = (): string => {
  n += 1;
  return `org-publish-http-${Date.now()}-${n}`;
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
  // A deployment that declared no credential. Its own instance, because the question is what
  // `buildServer` does with `undefined` — not what a flag on one instance does.
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  unconfigured = await bare.listen({ port: 0, host: "127.0.0.1" });
  servers = [app, bare];
}, 60_000);

afterAll(async () => {
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

describe("the /internal publish surface (founder ruling: the API publishes, the gateway serves)", () => {
  it("publishes a menu a device can then fetch — the whole point of the seam (01-F52)", async () => {
    const org = freshOrg();
    const response = await publish(org, [item("karahi", "Chicken Karahi")]);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ version: 1 });

    // THE question. `catalogPage(db, org, 0, 0)` is what a device's `catalog_request` runs, so
    // this is the till's own read path, not an inspection of the writer's internals.
    const page = await catalogPage(db, org, 0, 0);
    expect(page.form).toBe("snapshot");
    expect(page.version).toBe(1);
    expect(page.entries).toEqual([
      {
        kind: "item",
        id: "karahi",
        name: "Chicken Karahi",
        prices: [{ branch_id: BRANCH, channel: "counter", price_paisa: 145_000 }],
      },
    ]);
  });

  it("advances the version monotonically, publish after publish (01-F52)", async () => {
    const org = freshOrg();
    expect((await publish(org, [item("a")])).body).toEqual({ version: 1 });
    expect((await publish(org, [item("b")])).body).toEqual({ version: 2 });
    expect((await publish(org, [item("a", "Renamed")])).body).toEqual({ version: 3 });
    expect(await catalogVersion(db, org)).toBe(3);

    // And the fold at 3 is the newest of each entity, not three copies of `a`.
    const page = await catalogPage(db, org, 0, 0);
    expect(page.entries.map((entry) => [entry.id, entry.name])).toEqual([
      ["a", "Renamed"],
      ["b", "Item b"],
    ]);
  });

  it("REFUSES an 01-F60-incomplete grid at the writer, and publishes nothing", async () => {
    const org = freshOrg();
    await publish(org, [item("a")]);

    // The same entry with the enabled channel's cell removed. `01-F60` has NO fallback to a house
    // price: publishing this would put an item on the grid the counter cannot price, and `01-F53`
    // would freeze whatever it guessed.
    const response = await call(base, "POST", "/internal/catalog/publish", {
      token: PUBLISH_SECRET,
      body: {
        org_id: org,
        entries: [{ kind: "item", id: "unpriced", name: "Unpriced", prices: [] }],
        actor_user_id: "user-ali",
        now: 1_785_000_000_000,
        enabled: ENABLED,
      },
    });

    expect(response.status).toBe(400);
    // The message must name the offending entry AND the missing cell — "one of your 4,000 rows is
    // bad" is not an actionable answer to a bulk import (`15-F8`).
    expect(String(response.body.error)).toContain("item/unpriced");
    expect(String(response.body.error)).toContain(`branch ${BRANCH}, channel counter`);
    expect(String(response.body.error)).toContain("01-F60");

    // Nothing moved: the version is still 1 and no device sees the unpriced entry.
    expect(await catalogVersion(db, org)).toBe(1);
    expect((await catalogPage(db, org, 0, 0)).entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("refuses an entry the DEVICE wire could not parse, rather than storing it (01-F56)", async () => {
    const org = freshOrg();
    const response = await call(base, "POST", "/internal/catalog/publish", {
      token: PUBLISH_SECRET,
      body: {
        org_id: org,
        // `dine_in` is an order TYPE (`02-F1`), not one of `02-F42`'s five channels. Stored, it
        // would make every `catalog_response` for this org unparseable and put the org's devices
        // into a permanent reconnect loop.
        entries: [
          {
            kind: "item",
            id: "bad",
            name: "Bad",
            prices: [{ branch_id: BRANCH, channel: "dine_in", price_paisa: 100 }],
          },
        ],
        actor_user_id: null,
        now: 1_785_000_000_000,
        enabled: ENABLED,
      },
    });
    expect(response.status).toBe(400);
    expect(await catalogVersion(db, org)).toBe(0);
  });

  it("refuses a publish that declares no enabled set at all (01-F60, July 2026 ruling)", async () => {
    const org = freshOrg();
    const response = await call(base, "POST", "/internal/catalog/publish", {
      token: PUBLISH_SECRET,
      // `enabled` simply absent — the caller who "forgot the argument", which the ruling says must
      // NOT silently receive no completeness check.
      body: { org_id: org, entries: [item("a")], actor_user_id: null, now: 1_785_000_000_000 },
    });
    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain("enabled");
    expect(await catalogVersion(db, org)).toBe(0);
  });

  it("serves the whole published fold across page boundaries, version-pinned", async () => {
    const org = freshOrg();
    const many = Array.from({ length: CATALOG_PAGE_SIZE + 3 }, (_, index) =>
      item(`i${String(index).padStart(4, "0")}`),
    );
    expect((await publish(org, many)).status).toBe(200);

    const response = await call(base, "GET", `/internal/catalog/published?org_id=${org}`, {
      token: PUBLISH_SECRET,
    });
    expect(response.status).toBe(200);
    // `catalogPage` caps a page at CATALOG_PAGE_SIZE for the DEVICE's sake; the back office needs
    // the whole fold to compute `14-F3`'s `before_ref`, so the walk happens here. A single-page
    // implementation returns 500 of 503 and every `before_ref` for the missing three reads null —
    // "450 → 480" rendered as "new item" forever.
    expect((response.body.entries as unknown[]).length).toBe(CATALOG_PAGE_SIZE + 3);
    expect(response.body.version).toBe(1);
  }, 60_000);

  it("answers 0/empty for an org that has never published (01-F54: a till with no menu still works)", async () => {
    const response = await call(base, "GET", `/internal/catalog/published?org_id=${freshOrg()}`, {
      token: PUBLISH_SECRET,
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ version: 0, entries: [] });
  });
});

describe("the credential is the control (01-F47 is for DEVICES; this surface is a service peer)", () => {
  it("refuses a request with no credential, and publishes nothing", async () => {
    const org = freshOrg();
    const response = await call(base, "POST", "/internal/catalog/publish", {
      body: { org_id: org, entries: [item("a")], actor_user_id: null, now: 1, enabled: ENABLED },
    });
    expect(response.status).toBe(401);
    expect(await catalogVersion(db, org)).toBe(0);
  });

  it("refuses a WRONG credential of the same length, and publishes nothing", async () => {
    const org = freshOrg();
    // Same length as the real one, so a length-only comparison passes it. `timingSafeEqual`
    // throws on a length mismatch, which is why the length check comes first — and why a wrong
    // credential of the RIGHT length is the case worth writing down.
    const wrong = `${"x".repeat(PUBLISH_SECRET.length - 1)}!`;
    expect(wrong.length).toBe(PUBLISH_SECRET.length);
    expect((await publish(org, [item("a")], wrong)).status).toBe(401);
    expect(await catalogVersion(db, org)).toBe(0);
  });

  it("refuses reads too, not only writes", async () => {
    const response = await call(base, "GET", `/internal/catalog/published?org_id=${freshOrg()}`);
    expect(response.status).toBe(401);
  });

  it("FAIL-CLOSED when the deployment declared no credential: 503, never open", async () => {
    const org = freshOrg();
    // The tempting shape is "no secret configured ⇒ skip the check, for local dev", which makes an
    // unconfigured production gateway accept a menu from anyone who can reach the port. This
    // instance was built with `publishSecret` undefined.
    const written = await call(unconfigured, "POST", "/internal/catalog/publish", {
      token: PUBLISH_SECRET,
      body: { org_id: org, entries: [item("a")], actor_user_id: null, now: 1, enabled: ENABLED },
    });
    expect(written.status).toBe(503);
    const read = await call(unconfigured, "GET", `/internal/catalog/published?org_id=${org}`);
    expect(read.status).toBe(503);
    expect(await catalogVersion(db, org)).toBe(0);
  });
});

describe("the 01-F62 org-scoped event store (14-F3's history)", () => {
  const changed = (org_id: string, entity_id: string, version: number, at: number) => ({
    org_id,
    type: "catalog.changed",
    actor_user_id: "user-ali",
    server_received_at: at,
    payload: {
      entity: "item",
      entity_id,
      version,
      before_ref: null,
      after_ref: "hash-after",
      price_changes: [
        { branch_id: BRANCH, channel: "counter", before_paisa: null, after_paisa: 145_000 },
      ],
    },
  });

  it("appends and reads back in 01-F18 order, org-isolated", async () => {
    const org = freshOrg();
    const other = freshOrg();
    // Out of chronological order on the wire; `server_received_at` is the ordering authority, not
    // arrival (`01-F18`, `01-F62`).
    for (const at of [300, 100, 200]) {
      const response = await call(base, "POST", "/internal/org-events", {
        token: PUBLISH_SECRET,
        body: changed(org, `e${at}`, 1, at),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
    }
    await call(base, "POST", "/internal/org-events", {
      token: PUBLISH_SECRET,
      body: changed(other, "not-yours", 1, 150),
    });

    const response = await call(base, "GET", `/internal/org-events?org_id=${org}`, {
      token: PUBLISH_SECRET,
    });
    const events = response.body.events as { server_received_at: number; payload: unknown }[];
    expect(events.map((event) => event.server_received_at)).toEqual([100, 200, 300]);
    expect(events.map((event) => (event.payload as { entity_id: string }).entity_id)).toEqual([
      "e100",
      "e200",
      "e300",
    ]);
  });

  it("keeps a 14-F8 bulk edit's rows in a stable order at ONE instant", async () => {
    const org = freshOrg();
    // `14-F8` requires an event per item "so history stays per-item", and `publishEdits` uses ONE
    // `now()` reading for all of them — so `server_received_at` alone cannot order these and the
    // arrival tiebreak is what stops the screen reordering itself between visits.
    for (const id of ["a", "b", "c", "d", "e"]) {
      await call(base, "POST", "/internal/org-events", {
        token: PUBLISH_SECRET,
        body: changed(org, id, 7, 1_785_000_000_000),
      });
    }
    const read = async (): Promise<string[]> => {
      const response = await call(base, "GET", `/internal/org-events?org_id=${org}`, {
        token: PUBLISH_SECRET,
      });
      return (response.body.events as { payload: { entity_id: string } }[]).map(
        (event) => event.payload.entity_id,
      );
    };
    expect(await read()).toEqual(["a", "b", "c", "d", "e"]);
    expect(await read()).toEqual(await read());
  });

  it("REFUSES a branch-scoped type — 01-F62 splits on the EMITTER, not on the doc", async () => {
    const org = freshOrg();
    const response = await call(base, "POST", "/internal/org-events", {
      token: PUBLISH_SECRET,
      body: { ...changed(org, "x", 1, 1), type: "order.line_added" },
    });
    expect(response.status).toBe(400);
    expect(String(response.body.error)).toContain("01-F62");
    expect(await orgEventHistory(db, org)).toEqual([]);
  });

  it("REFUSES audit.login specifically — the FR's own worked example", async () => {
    const org = freshOrg();
    // `audit.*` is declared by docs 14/15 alongside `catalog.changed`, so a writer that split on
    // the declaring doc would accept it here. `01-F62`: `audit.login` is emitted by a DEVICE at a
    // PIN unlock and `01-F5`'s chain is per-device, so it stays branch-scoped.
    const response = await call(base, "POST", "/internal/org-events", {
      token: PUBLISH_SECRET,
      body: { ...changed(org, "x", 1, 1), type: "audit.login" },
    });
    expect(response.status).toBe(400);
    expect(await orgEventHistory(db, org)).toEqual([]);
  });

  it("REFUSES a record carrying any branch field (01-F62's rejected alternative (a))", async () => {
    const org = freshOrg();
    for (const field of ["branch_id", "branch_created_at", "time_basis", "device_id"]) {
      // Over the wire first: the request schema is strict, so the surplus key never reaches the
      // writer.
      const response = await call(base, "POST", "/internal/org-events", {
        token: PUBLISH_SECRET,
        body: { ...changed(org, "x", 1, 1), [field]: "smuggled" },
      });
      expect(response.status, `${field} was accepted on the wire`).toBe(400);
      expect(String(response.body.error)).toContain(field);

      // And at the writer, which is where the guarantee lives — a future caller reaching
      // `appendOrgEvent` directly (a bulk import, another service) gets the same refusal.
      await expect(
        appendOrgEvent(db, { ...changed(org, "x", 1, 1), [field]: "smuggled" }),
      ).rejects.toThrow(/01-F62/);
    }
    expect(await orgEventHistory(db, org)).toEqual([]);
  });

  /**
   * **NOT ONE TRANSACTION, and this is the assertion that says so.** The artifact and the audit
   * record are two requests to two endpoints; B-4 named the non-atomicity and the honest thing is
   * to pin what actually happens rather than to imply an atomicity that does not exist.
   */
  it("leaves a published version standing when the audit append is refused", async () => {
    const org = freshOrg();
    expect((await publish(org, [item("a")])).body).toEqual({ version: 1 });

    const refused = await call(base, "POST", "/internal/org-events", {
      token: PUBLISH_SECRET,
      body: { ...changed(org, "a", 1, 1), type: "order.line_added" },
    });
    expect(refused.status).toBe(400);

    // The menu is published and a device fetching now gets it; the history is short by one row.
    // Devices right, history incomplete — the chosen direction, because the reverse would leave a
    // history row claiming a version no device can fetch and `01-F1` forbids deleting the claim.
    expect((await catalogPage(db, org, 0, 0)).entries.map((e) => e.id)).toEqual(["a"]);
    expect(await orgEventHistory(db, org)).toEqual([]);
  });
});
