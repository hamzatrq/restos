/**
 * A REAL HTTP server speaking `sync-gateway`'s `/internal` publish contract, over a real loopback
 * socket, recording every request body it receives.
 *
 * **Why a real socket and not a stubbed `fetch`.** The thing under test is an *adapter* — the
 * question it exists to answer is "did an HTTP request actually leave this process, carrying the
 * right bytes, with the right credential". A function-level `fetch` double answers a different
 * question (did we call a function we ourselves injected) and would keep passing after the URL,
 * the method, the header or the serialization broke. It is also the reason `GatewayLink` has no
 * `fetch` member: an injection point nothing in production supplies is the "unsupplied optional
 * seam" `pnpm seams:check` was built for.
 *
 * **What this fake does NOT do, deliberately: enforce `01-F60`.** It stores what it is given, the
 * same way `createMemoryCatalogPublisher` does and for the same recorded reason — the completeness
 * check belongs to the real writer, and a second copy here would let the suite pass on this file's
 * opinion of the rule. The real refusal is asserted against real Postgres in
 * `services/sync-gateway/src/__acceptance__/catalog-publish-http.test.ts`; what is asserted HERE
 * is that the refusal reaches the owner, driven by `refuseWith` below.
 */

import { createServer, type Server } from "node:http";
import type { EnabledPairs } from "../catalog.js";
import {
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  type LedgerRecord,
} from "../publish.js";

export type Recorded = {
  readonly path: string;
  readonly body: unknown;
  /**
   * The request's query parameters. Recorded because for a GET the `org_id` IS the request — the
   * question "did a correctly-scoped request leave the process" (`01-F71` (b)) cannot be answered
   * from a pathname, and `path`-only recording made every GET look identical regardless of tenant.
   */
  readonly query: Readonly<Record<string, string>>;
};

/**
 * One `kernel.events` row as `12-F10`'s window projects it — **exactly the seven envelope fields
 * `01-F34` permits a fold to read**. `global_seq`, `lamport_seq`, `device_created_at` and
 * `server_received_at` are absent here for the same reason they are absent from the real route's
 * projection: an ordering field that never crosses cannot reach a projected value.
 */
export type FakeLedgerRow = {
  readonly id: string;
  readonly type: string;
  readonly branch_id: string;
  readonly branch_created_at: number;
  readonly time_basis: string;
  readonly actor_user_id: string | null;
  readonly payload: Record<string, unknown>;
};

/**
 * One `kernel.device_registry` row as this fake holds it (`14-F12`).
 *
 * **The revocation SEMANTICS below are the real gateway's, restated once and no further.** Only the
 * first revocation stamps (`revokeDevice`'s `and revoked_at is null`) and an unregistered device is
 * a loud refusal (`revokeRegisteredDevice`'s read-before-write, which exists because an
 * `UPDATE … WHERE` matching zero rows reports success over a till that is still selling). Those two
 * are restated because the ADAPTER's behaviour depends on them — `already` decides whether
 * `device.revoked` is appended at all — and a fake that silently re-stamped would let this suite
 * bless an adapter that attributes last Tuesday's revocation to today's owner. Everything else is
 * the real writer's and is asserted against real Postgres in
 * `services/sync-gateway/src/__acceptance__/device-http.test.ts`.
 */
export type FakeDeviceRow = {
  readonly device_id: string;
  readonly branch_id: string;
  readonly device_class: string;
  /**
   * `01-F70`. **Required on the fixture even though the column is nullable**, so a test must decide
   * whether the till it is seeding is named — `null` is the UNNAMED row and has to be written out.
   * An optional field here would let a fixture forget the name and let the suite bless a projection
   * that dropped it.
   */
  readonly display_name: string | null;
  revoked_at: number | null;
  readonly token_expires_at: number | null;
};

/** `01-F68`'s org row as this fake holds it. Absent ⇒ the org is UNNAMED, which is a 200. */
export type FakeOrgRow = {
  readonly display_name: string;
  readonly status: string;
  readonly created_at: number;
};

/** `01-F69`'s branch row. `display_name` is `NOT NULL` in the real schema, so it is required here. */
export type FakeBranchRow = {
  readonly branch_id: string;
  readonly display_name: string;
  readonly branch_type: string;
  readonly branch_class: string;
  readonly created_at: number;
};

export type FakeGateway = {
  readonly url: string;
  readonly token: string;
  /** Every `/internal` request that got past the credential check, in arrival order. */
  readonly received: readonly Recorded[];
  /** Publishes recorded on this org, newest last — the "did the menu actually ship" question. */
  publishes(): readonly { org_id: string; entries: readonly unknown[]; enabled: unknown }[];
  /** `01-F62` org-scoped appends recorded, in arrival order. */
  orgEvents(): readonly { org_id: string; type: string; payload: unknown }[];
  /** Make the next N responses on `path` a refusal, to drive the adapter's error path. */
  refuseWith(path: string, status: number, message: string): void;
  /** `14-F12` — seed a registry row. `revoked_at` seeds an already-revoked device. */
  registerDevice(org_id: string, row: FakeDeviceRow): void;
  /** `12-F10` — seed the merged org log this fake will window over. */
  seedLedger(org_id: string, rows: readonly FakeLedgerRow[], latest_arrival_ms?: number): void;
  /**
   * `01-F68`/`01-F69` — seed one org's directory. Calling it with `org: null` seeds branches under
   * an UNNAMED org, which is the state every real deployment is in today and therefore the state a
   * naming surface has to render correctly.
   */
  seedTenancy(org_id: string, org: FakeOrgRow | null, branches: readonly FakeBranchRow[]): void;
  /** The registry as it stands now, so a test can assert `revoked_at` actually MOVED. */
  devices(org_id: string): readonly FakeDeviceRow[];
  close(): Promise<void>;
};

const TOKEN = "fake-gateway-service-credential-at-least-32-bytes-long";

export const startFakeGateway = async (): Promise<FakeGateway> => {
  const publisher = createMemoryCatalogPublisher();
  const ledger = createMemoryLedgerAppender();
  const received: Recorded[] = [];
  const refusals = new Map<string, { status: number; message: string }>();
  const registry = new Map<string, FakeDeviceRow[]>();
  const ledgerRows = new Map<string, FakeLedgerRow[]>();
  const ledgerArrival = new Map<string, number>();
  const orgRows = new Map<string, FakeOrgRow>();
  const branchRows = new Map<string, FakeBranchRow[]>();
  /**
   * The real gateway stamps `revoked_at` from the DATABASE clock. A monotonic counter here keeps
   * two revocations in one millisecond distinguishable, which `Date.now()` does not — and the
   * `withActors` join picks the EARLIEST event, so a fixture whose two instants collide could not
   * tell a correct join from a wrong one.
   */
  let tick = 1_700_000_000_000;
  const revocationClock = (): number => ++tick;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const send = (status: number, body: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        send(401, { error: "unauthorized" });
        return;
      }

      const refusal = refusals.get(url.pathname);
      if (refusal !== undefined) {
        refusals.delete(url.pathname);
        send(refusal.status, { error: refusal.message });
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body: unknown = raw === "" ? null : JSON.parse(raw);
      received.push({ path: url.pathname, body, query: Object.fromEntries(url.searchParams) });

      const org_id = url.searchParams.get("org_id") ?? "";
      if (req.method === "POST" && url.pathname === "/internal/catalog/publish") {
        const input = body as {
          org_id: string;
          entries: never[];
          actor_user_id: string | null;
          now: number;
          // The port's own type, not a hand-copy of its shape: `channels` became `02-F42`'s
          // closed set when `catalog.enabled` put `EnabledPairs` on the wire, and a restated
          // `string[]` here would have gone on compiling against a contract that had moved.
          enabled: EnabledPairs;
        };
        send(200, {
          version: await publisher.publish(input.org_id, input.entries, {
            actor_user_id: input.actor_user_id,
            now: input.now,
            enabled: input.enabled,
          }),
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/catalog/published") {
        send(200, await publisher.published(org_id));
        return;
      }
      if (req.method === "POST" && url.pathname === "/internal/org-events") {
        // Stored as SENT, `type` included — the org-scoped store holds `01-F62`'s whole set, and
        // an adapter that read it back unfiltered would put a `device.registered` row into
        // `14-F3`'s price history. Forcing the type here would hide exactly that.
        //
        // The `01-F62` scope REFUSAL is the real gateway's (`appendOrgEvent`), asserted against
        // real Postgres in its own suite; duplicating it here would make this suite pass on this
        // file's opinion of the rule.
        await ledger.append(body as LedgerRecord);
        send(200, {});
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/org-events") {
        send(200, { events: await ledger.history(org_id) });
        return;
      }
      /**
       * `01-F68`/`01-F69`. **It filters by `org_id`, and that filter is load-bearing rather than
       * decorative:** the whole isolation question this surface raises is whether one tenant can
       * read another's estate, and a fake that answered every org's rows to every caller could not
       * tell a correctly-scoped request from a leak. The real gateway's `where org_id =` is asserted
       * against real Postgres in its own suite; what is reproduced here is only the scoping, because
       * that is what the API-side assertion depends on.
       *
       * An org with no seeded row answers `org: null` — `01-F68`'s UNNAMED, and a 200.
       */
      if (req.method === "GET" && url.pathname === "/internal/tenancy") {
        const org = orgRows.get(org_id);
        send(200, {
          org: org === undefined ? null : { org_id, ...org },
          branches: (branchRows.get(org_id) ?? []).map((row) => ({ ...row, org_id })),
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/internal/devices") {
        send(200, { devices: [...(registry.get(org_id) ?? [])] });
        return;
      }
      /**
       * `12-F10`'s window. It applies the SAME two filters the real reader applies — the branch
       * stamp range and the branch list — because the seam assertion is "did a request carrying
       * this scope actually leave the process", and a fake that ignored either could not tell a
       * correctly-scoped request from a wide one.
       *
       * The `01-F46` boundary arithmetic is deliberately NOT reproduced here: the caller states
       * the window in milliseconds, so this fake never has an opinion about what a business day
       * is. That interpretation lives in `services/api` and is asserted against real Postgres in
       * `services/sync-gateway/src/__acceptance__/day-ledger-http.test.ts`.
       */
      if (req.method === "GET" && url.pathname === "/internal/ledger/window") {
        const from = Number(url.searchParams.get("from_ms"));
        const to = Number(url.searchParams.get("to_ms"));
        const raw = url.searchParams.get("branch_ids");
        const branches = raw === null ? null : raw.split(",");
        const inWindow = (ledgerRows.get(org_id) ?? []).filter(
          (row) =>
            row.branch_created_at >= from &&
            row.branch_created_at < to &&
            (branches === null || branches.includes(row.branch_id)),
        );
        send(200, {
          events: inWindow,
          truncated: false,
          latest_arrival_ms: ledgerArrival.get(org_id) ?? null,
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/internal/devices/revoke") {
        const input = body as { org_id: string; device_id: string };
        const row = (registry.get(input.org_id) ?? []).find(
          (candidate) => candidate.device_id === input.device_id,
        );
        if (row === undefined) {
          // `RangeError` → 400 in the real service (`refusalStatus`). The status is what the
          // adapter sees, so the status is what this reproduces.
          send(400, {
            error: `device ${input.device_id} is NOT REGISTERED in org ${input.org_id} — nothing was revoked.`,
          });
          return;
        }
        const already = row.revoked_at !== null;
        if (!already) row.revoked_at = revocationClock();
        send(200, {
          branch_id: row.branch_id,
          device_class: row.device_class,
          revoked_at: row.revoked_at as number,
          already,
        });
        return;
      }
      send(404, { error: `no route ${req.method ?? "?"} ${url.pathname}` });
    })().catch((error: unknown) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    });
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake gateway did not bind");

  return {
    url: `http://127.0.0.1:${address.port}`,
    token: TOKEN,
    received,
    publishes: () =>
      received
        .filter((entry) => entry.path === "/internal/catalog/publish")
        .map((entry) => entry.body as { org_id: string; entries: unknown[]; enabled: unknown }),
    orgEvents: () =>
      received
        .filter((entry) => entry.path === "/internal/org-events" && entry.body !== null)
        .map((entry) => entry.body as { org_id: string; type: string; payload: unknown }),
    refuseWith: (path, status, message) => {
      refusals.set(path, { status, message });
    },
    registerDevice: (org_id, row) => {
      registry.set(org_id, [...(registry.get(org_id) ?? []), { ...row }]);
    },
    seedLedger: (org_id, rows, latest_arrival_ms) => {
      ledgerRows.set(org_id, [...rows]);
      if (latest_arrival_ms !== undefined) ledgerArrival.set(org_id, latest_arrival_ms);
    },
    seedTenancy: (org_id, org, branches) => {
      if (org !== null) orgRows.set(org_id, org);
      branchRows.set(org_id, [...branches]);
    },
    devices: (org_id) => [...(registry.get(org_id) ?? [])],
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => (error === undefined ? done() : fail(error)));
      }),
  };
};
