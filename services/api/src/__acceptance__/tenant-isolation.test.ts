/**
 * **`01-F71` — THE TENANT-ISOLATION REGISTER, cloud plane (`18 §6`).**
 *
 * `01-F71`: *"a subject authenticated in one org must never read, write, cause a write in, or be
 * fanned out data belonging to another — on either plane, through any surface, in any degraded
 * state"*, and *"each point carries a test that FAILS when that point alone is removed. Reading is
 * not evidence and neither is a green suite: **a suite exercising one tenant passes with all four
 * deleted.**"*
 *
 * That last sentence is why this file exists and why it is shaped the way it is. Every other suite
 * in this directory runs ONE org. `catalog.test.ts` has one `ORG`, `authz.test.ts` names an
 * `OTHER_ORG` and never gives it a single row of data, and `tenancy-names.test.ts` says in its own
 * header that it is **not** this register. So the whole product's isolation claim rested on
 * assertions that would survive deleting every guard.
 *
 * ── WHAT THIS FILE COVERS, AND WHAT IT DOES NOT ──────────────────────────────────────────────
 *
 * `01-F71` names four enforcement points. Two of them live on this plane and are covered here:
 *
 *   **(a)** the permission matrix refuses when the subject's org differs from the scope's — `can()`
 *           and `reportScope` both. ⚠ **This file does NOT cover it and cannot**, which was
 *           measured rather than assumed: with `can()`'s org arm deleted, and again with
 *           `reportScope`'s, **all 287 tests in this package stay green.** Point (b) is why —
 *           `trpc.ts` builds every scope as `{ org_id: ctx.subject.org_id }`, so
 *           `subject.org_id !== scope.org_id` is unreachable from this plane and the guard is
 *           indistinguishable from dead code here. Point (a)'s register is
 *           `packages/domain/src/__acceptance__/tenant-isolation-matrix.test.ts`, which calls the
 *           two functions directly and kills both mutants.
 *   **(b)** the org is taken from the authenticated SUBJECT and never from the request. **This is
 *           the point this file owns.** Measured: making `catalog.published` read `org_id` from
 *           its input kills **3** tests here and leaves all 230 pre-existing tests green.
 *
 * **(c)** the gateway's envelope quarantine and **(d)** the structured `(org, branch)` fan-out key
 * are device-plane points inside `services/sync-gateway`. **No new file was written for them,
 * because both are already covered and both were MEASURED to bite** (Docker, August 2026):
 *
 *   | mutant (exactly one branch)                        | kills | killed by |
 *   |----------------------------------------------------|-------|-----------|
 *   | (c) the `org_mismatch` arm of the envelope check    | **4** | `law6-quarantine`, `notice-outbox`, `relay-hub-uplink` |
 *   | (d) `branchKey` → separator-less `orgId + branchId` | **1** | `isolation-regression` (K-03) |
 *
 * They are cited there against `01-F9`/`DEC-SYNC-004` rather than `01-F71`, which is a
 * cross-referencing gap and not a coverage gap; writing a second suite over a guard already proven
 * to bite would add rows and no assurance.
 *
 * ── THE THREE RULES THIS FILE IS BUILT ON ────────────────────────────────────────────────────
 *
 * 1. **ONE HOST, TWO TENANTS, ONE SET OF STORES.** A fixture that gives each tenant its own store
 *    proves nothing: isolation is vacuously true when there is nothing to leak *from*. Every store
 *    below (`staged`, `publisher`, `ledger`, `users`, `devices`, `tenancy`) holds **both** tenants
 *    and scopes exactly the way a real table does — `where org_id = $1`, no more and no less. They
 *    are deliberately NOT defensive: none of them throws on an unexpected org, because a store that
 *    refuses the attack makes the *store* the enforcement point and hides whether the *service*
 *    has one. If the service passes the wrong org, these stores hand the other tenant's rows over
 *    without complaint, which is what a Postgres row would do.
 *
 * 2. **A CONTROL IN EVERY CASE.** `expect(answer).not.toContain(B)` passes trivially when B is
 *    empty. So every leak assertion is paired with a control that proves the datum was genuinely
 *    present and genuinely reachable — usually by having **B's own owner fetch it from the same
 *    host in the same test**. Where the attack is a write, the control proves the write *works*
 *    when the right tenant makes it, so a green result cannot mean "that procedure is broken".
 *
 * 3. **ASSERT THE PROPERTY, NOT THE MECHANISM.** The write section does not check that a guard
 *    function was called or that a particular argument was passed. It snapshots **everything B can
 *    observe**, runs every mutating procedure the API has as tenant A with B-flavoured inputs, and
 *    re-snapshots. Any change at all, by any route, present or future, fails. That is the only
 *    shape that survives a refactor, and `01-F71` says so outright: *"it is not satisfied by a
 *    `where org_id = …` in a query. That is how one call site implements it."*
 *
 * ── ⚠ AUTHORSHIP AND SCOPE ──────────────────────────────────────────────────────────────────
 *
 * Written by a test-authoring session (`24 §3` step 2) that edited no implementation file. Two
 * consequences follow and both are stated rather than left implicit:
 *
 *   - **`§4` IS RED ON THE TREE AS AUTHORED.** `catalog.runDayEnd` invoked by tenant A publishes
 *     tenant B's staged edits. That is a live cross-tenant write defect, not a fixture artifact,
 *     and the assertions are written against the FR rather than against today's behaviour.
 *   - **`catalog.enabled` is host-global by design and is therefore NOT asserted here.** The
 *     procedure's own doc comment says so: *"The answer is the DEPLOYMENT's set rather than a
 *     per-org lookup … one process serves one set."* So `01-F60`'s enabled `(branch, channel)` set
 *     cannot vary per tenant on one host, and the fixture below is forced to declare one set
 *     covering **both** tenants' branches. This is a real limit on multi-tenancy — the enabled set
 *     is the one piece of `00 §7` layer-2 config this service holds, and holding it per-process
 *     means one process cannot serve two restaurants with different branch topologies — but it is
 *     a documented shape, not a broken guard, so it is reported and not asserted against.
 */

import { businessDate, businessDayBoundsOfDate, hashPin } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogEntry, EnabledPairs } from "../catalog.js";
import { createMemoryStagedEditStore } from "../catalog.js";
import type { DeviceDirectory, DeviceRecord, DeviceRevocationRecord } from "../devices.js";
import type { DayLedger, LedgerWindow } from "../ledger.js";
import type { CatalogDeps } from "../publish.js";
import { createMemoryCatalogPublisher, createMemoryLedgerAppender } from "../publish.js";
import { createApiServer } from "../server.js";
import type { SummaryEvent } from "../summary.js";
import type { BranchListing, OrgListing, TenancyDirectory } from "../tenancy.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";

// ════════════════════════════════════════════════════════════════════════════════════════════════
// TWO TENANTS
//
// Every value below is distinct across the two orgs, and that is a requirement rather than tidiness:
// a leak is only detectable if A's answer and B's answer cannot be confused. Ids, names, prices,
// device ids and edit contents are all disjoint, and `§0` asserts the disjointness rather than
// trusting it.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const ORG_A = "org-kababjees";
const A_BRANCH_1 = "branch-gulberg";
const A_BRANCH_2 = "branch-dha";

const ORG_B = "org-student-biryani";
const B_BRANCH_1 = "branch-nazimabad";
const B_BRANCH_2 = "branch-saddar";

/**
 * `01-F60`'s enabled set — **both tenants' branches, and see the header for why it has to be.**
 * One process holds one set, so a two-tenant host can only exist with a union. The consequence is
 * stated because it matters to a reader of the assertions below: an entry saved by either tenant
 * must price all four branches, so a branch id appearing inside a *price row* is not evidence of a
 * leak. Every leak assertion below keys on ids, names and amounts that are unique to one tenant.
 */
const ENABLED: EnabledPairs = {
  branches: [A_BRANCH_1, A_BRANCH_2, B_BRANCH_1, B_BRANCH_2],
  channels: ["counter", "foodpanda"],
};

/** 2026-08-06 23:00 Asia/Karachi — `01-F46`'s next 05:00 boundary is six hours away. */
const T0 = 1_786_039_200_000;
/** 2026-08-07 05:00 Asia/Karachi. Asserted against `domain` in `§0`, never just trusted. */
const BOUNDARY = 1_786_060_800_000;
const CUTOVER_HOUR = 5;

const SECRET = "01-f71-tenant-isolation-session-secret-not-a-real-one";
const PASSWORD = "correct horse battery staple";

const A_OWNER = "user-a-owner";
const A_MANAGER = "user-a-manager-gulberg";
const A_CASHIER = "user-a-cashier-gulberg";
const B_OWNER = "user-b-owner";
const B_MANAGER = "user-b-manager-nazimabad";

const A_OWNER_EMAIL = "owner@kababjees.test";
const A_MANAGER_EMAIL = "manager@kababjees.test";
const A_CASHIER_EMAIL = "cashier@kababjees.test";
const B_OWNER_EMAIL = "owner@student-biryani.test";
const B_MANAGER_EMAIL = "manager@student-biryani.test";

/** Ids, names and prices that appear in exactly one tenant. `§0` proves the disjointness. */
const A_ITEM = "item-a-chicken-karahi";
const B_ITEM = "item-b-beef-biryani";
const A_ITEM_NAME = "Chicken Karahi";
const B_ITEM_NAME = "Beef Biryani";
const A_PRICE = 45_000;
const B_PRICE = 32_500;

/** The day-end edits each tenant has pending. B's is the one `§4`'s attack must not consume. */
const A_PENDING_ITEM = "item-a-mutton-kunna";
const B_PENDING_ITEM = "item-b-nihari";
const A_PENDING_NAME = "Mutton Kunna";
const B_PENDING_NAME = "Nihari";
const A_PENDING_PRICE = 68_000;
const B_PENDING_PRICE = 51_500;

const A_DEVICE = "device-a-counter-till";
const B_DEVICE = "device-b-counter-till";
/**
 * A second device of B's, existing for one reason: `§2`'s "B's own owner CAN revoke" control has to
 * mutate something, and mutating `B_DEVICE` would leave it already-revoked for `§3`'s write sweep —
 * where an already-revoked row appends nothing, so the sweep would be asserting over a procedure
 * that had become a no-op. A control that quietly disarms a later assertion is the shape
 * `oracle-round-2-findings.md` §C keeps recording.
 */
const B_DEVICE_SPARE = "device-b-kitchen-screen";

const A_ORG_NAME = "Kababjees";
const B_ORG_NAME = "Student Biryani";

const cells = (price_paisa: number): CatalogEntry["prices"] =>
  ENABLED.branches.flatMap((branch_id) =>
    ENABLED.channels.map((channel) => ({ branch_id, channel, price_paisa })),
  );

const entry = (id: string, name: string, price_paisa: number): CatalogEntry => ({
  kind: "item",
  id,
  name,
  prices: cells(price_paisa),
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE STORES — org-keyed, faithful, and deliberately UNDEFENDED.
//
// Each behaves like the table it stands in for: it answers exactly the org it is asked about. None
// validates that the org it was handed is the org the caller is entitled to, because that check is
// the *service's* job and a store that performed it would mask the absence of the service's own.
// A mutant that makes a procedure read the org off the request gets the other tenant's rows from
// these stores without a murmur — which is precisely what makes the assertions below bite.
// ════════════════════════════════════════════════════════════════════════════════════════════════

type LedgerFixture = {
  readonly ledger: DayLedger;
  readonly windows: LedgerWindow[];
  add(org_id: string, event: SummaryEvent): void;
};

const memoryDayLedger = (): LedgerFixture => {
  const byOrg = new Map<string, SummaryEvent[]>();
  const windows: LedgerWindow[] = [];
  return {
    windows,
    add: (org_id, event) => {
      byOrg.set(org_id, [...(byOrg.get(org_id) ?? []), event]);
    },
    ledger: {
      read: async (window) => {
        // Recorded so `§1` can assert what the SERVICE asked for, not only what it returned — the
        // difference between "the answer was scoped" and "the request was scoped" is exactly
        // enforcement point (b), and only one of the two is visible in a response body.
        windows.push(window);
        const events = (byOrg.get(window.org_id) ?? []).filter(
          (event) =>
            (window.branch_ids === null || window.branch_ids.includes(event.branch_id)) &&
            event.branch_created_at >= window.from_ms &&
            event.branch_created_at < window.to_ms,
        );
        return { events, truncated: false, latest_arrival_ms: events.length === 0 ? null : T0 };
      },
    },
  };
};

type DeviceFixture = DeviceDirectory & { seed(org_id: string, device: DeviceRecord): void };

const memoryDeviceDirectory = (now: () => number): DeviceFixture => {
  const byOrg = new Map<string, Map<string, DeviceRecord & { revoked_at: number | null }>>();
  const revocations = new Map<string, DeviceRevocationRecord[]>();
  const of = (org_id: string) => {
    const existing = byOrg.get(org_id);
    if (existing !== undefined) return existing;
    const created = new Map<string, DeviceRecord & { revoked_at: number | null }>();
    byOrg.set(org_id, created);
    return created;
  };
  return {
    seed: (org_id, device) => {
      of(org_id).set(device.device_id, { ...device, revoked_at: device.revoked_at ?? null });
    },
    list: async (org_id) => [...of(org_id).values()],
    revoke: async (org_id, device_id) => {
      const row = of(org_id).get(device_id);
      // A registry row that is not in this org simply is not there — the same answer Postgres
      // gives for `where org_id = $1 and device_id = $2`. It does NOT reach across orgs to find
      // one, and it does not throw a distinguishable error either, because "no such device" is
      // the honest answer and a different error would be an oracle for whether B owns that id.
      if (row === undefined) throw new Error(`no such device in this org: ${device_id}`);
      const already = row.revoked_at !== null;
      if (!already) of(org_id).set(device_id, { ...row, revoked_at: now() });
      return {
        branch_id: row.branch_id,
        device_class: row.device_class,
        revoked_at: of(org_id).get(device_id)?.revoked_at ?? now(),
        already,
      };
    },
    recordRevocation: async (record) => {
      revocations.set(record.org_id, [
        ...(revocations.get(record.org_id) ?? []),
        {
          device_id: record.device_id,
          actor_user_id: record.actor_user_id,
          server_received_at: record.server_received_at,
        },
      ]);
    },
    revocations: async (org_id) => revocations.get(org_id) ?? [],
  };
};

const memoryTenancyDirectory = (): TenancyDirectory => {
  const rows: Record<string, { org: OrgListing; branches: readonly BranchListing[] } | undefined> =
    {
      [ORG_A]: {
        org: { org_id: ORG_A, display_name: A_ORG_NAME, status: "active" },
        branches: [
          {
            branch_id: A_BRANCH_1,
            display_name: "Gulberg",
            branch_type: "branch",
            branch_class: "production",
          },
          {
            branch_id: A_BRANCH_2,
            display_name: "DHA",
            branch_type: "branch",
            branch_class: "production",
          },
        ],
      },
      [ORG_B]: {
        org: { org_id: ORG_B, display_name: B_ORG_NAME, status: "active" },
        branches: [
          {
            branch_id: B_BRANCH_1,
            display_name: "Nazimabad",
            branch_type: "branch",
            branch_class: "production",
          },
          {
            branch_id: B_BRANCH_2,
            display_name: "Saddar",
            branch_type: "branch",
            branch_class: "production",
          },
        ],
      },
    };
  return {
    directory: async (org_id) => {
      const found = rows[org_id];
      // `01-F68`'s UNNAMED case for an org this directory has never heard of — not an error, and
      // not a reach into some other org's row.
      if (found === undefined) {
        return { org: { org_id, display_name: null, status: null }, branches: [] };
      }
      return found;
    },
  };
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE HOST
// ════════════════════════════════════════════════════════════════════════════════════════════════

type Rpc = { status: number; body: Record<string, unknown> };

const QUERIES = new Set([
  "catalog.published",
  "catalog.pending",
  "catalog.history",
  "catalog.enabled",
  "devices.list",
  "summary.nightly",
  "tenancy.directory",
  "session.whoami",
]);

type Host = {
  call(
    path: string,
    input: unknown,
    token?: string,
    headers?: Record<string, string>,
  ): Promise<Rpc>;
  login(email: string): Promise<string>;
  clock: { at: number };
  catalog: CatalogDeps;
  ledgerWindows: LedgerWindow[];
};

let host: Host;
const token = new Map<string, string>();

const dataOf = (rpc: Rpc): unknown => {
  const result = (rpc.body as { result?: { data?: unknown } }).result;
  if (result === undefined) throw new Error(`expected a result, got ${JSON.stringify(rpc.body)}`);
  return superjson.deserialize(result.data as never);
};

const messageOf = (rpc: Rpc): string =>
  (rpc.body as { error?: { json?: { message?: string } } }).error?.json?.message ?? "";

const makeHost = async (): Promise<Host> => {
  const clock = { at: T0 };
  const now = (): number => clock.at;
  const password_hash = await hashPin(PASSWORD);

  const users: UserRecord[] = [
    {
      user_id: A_OWNER,
      org_id: ORG_A,
      email: A_OWNER_EMAIL,
      display_name: "Ayesha Khan",
      password_hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    {
      user_id: A_MANAGER,
      org_id: ORG_A,
      email: A_MANAGER_EMAIL,
      display_name: "Hina Raza",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: A_BRANCH_1, status: "active" }],
    },
    {
      user_id: A_CASHIER,
      org_id: ORG_A,
      email: A_CASHIER_EMAIL,
      display_name: "Sana Iqbal",
      password_hash,
      assignments: [{ role: "cashier", branch_id: A_BRANCH_1, status: "active" }],
    },
    {
      user_id: B_OWNER,
      org_id: ORG_B,
      email: B_OWNER_EMAIL,
      display_name: "Bilal Ahmed",
      password_hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    {
      user_id: B_MANAGER,
      org_id: ORG_B,
      email: B_MANAGER_EMAIL,
      display_name: "Farhan Ali",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: B_BRANCH_1, status: "active" }],
    },
  ];

  const catalog: CatalogDeps = {
    staged: createMemoryStagedEditStore(),
    publisher: createMemoryCatalogPublisher(),
    ledger: createMemoryLedgerAppender(),
    enabled: ENABLED,
    now,
    cutover_hour: CUTOVER_HOUR,
  };

  const dayLedger = memoryDayLedger();
  const devices = memoryDeviceDirectory(now);
  devices.seed(ORG_A, {
    device_id: A_DEVICE,
    branch_id: A_BRANCH_1,
    device_class: "counter",
    display_name: "Kababjees counter till",
    revoked_at: null,
  } as DeviceRecord);
  devices.seed(ORG_B, {
    device_id: B_DEVICE,
    branch_id: B_BRANCH_1,
    device_class: "counter",
    display_name: "Student Biryani counter till",
    revoked_at: null,
  } as DeviceRecord);
  devices.seed(ORG_B, {
    device_id: B_DEVICE_SPARE,
    branch_id: B_BRANCH_2,
    device_class: "kds",
    display_name: "Student Biryani kitchen screen",
    revoked_at: null,
  } as DeviceRecord);

  // One `order.created` per tenant, in the business day containing T0, so `summary.nightly` has a
  // real, DIFFERENT number for each. `§0` proves the two totals cannot be confused.
  dayLedger.add(ORG_A, {
    id: "evt-a-order-1",
    type: "order.created",
    branch_id: A_BRANCH_1,
    branch_created_at: T0,
    time_basis: "hub",
    actor_user_id: A_CASHIER,
    payload: { order_id: "order-a-1", channel: "counter", billed_total_paisa: A_PRICE },
  });
  dayLedger.add(ORG_B, {
    id: "evt-b-order-1",
    type: "order.created",
    branch_id: B_BRANCH_1,
    branch_created_at: T0,
    time_basis: "hub",
    actor_user_id: B_MANAGER,
    payload: { order_id: "order-b-1", channel: "counter", billed_total_paisa: B_PRICE },
  });

  const app = await createApiServer({
    store: createMemoryUserStore(users),
    sessionSecret: SECRET,
    now,
    catalog,
    devices,
    ledger: dayLedger.ledger,
    tenancy: memoryTenancyDirectory(),
  });

  const call = async (
    path: string,
    input: unknown,
    bearer?: string,
    extra: Record<string, string> = {},
  ): Promise<Rpc> => {
    const serialised = JSON.stringify(superjson.serialize(input));
    const auth: Record<string, string> =
      bearer === undefined ? {} : { authorization: `Bearer ${bearer}` };
    const res = QUERIES.has(path)
      ? await app.inject({
          method: "GET",
          url: `/trpc/${path}?input=${encodeURIComponent(serialised)}`,
          headers: { ...auth, ...extra },
        })
      : await app.inject({
          method: "POST",
          url: `/trpc/${path}`,
          headers: { "content-type": "application/json", ...auth, ...extra },
          payload: serialised,
        });
    return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
  };

  return {
    call,
    clock,
    catalog,
    ledgerWindows: dayLedger.windows,
    login: async (email) => {
      const res = await call("auth.login", { email, password: PASSWORD });
      if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
      return (dataOf(res) as { token: string }).token;
    },
  };
};

/**
 * **Everything a tenant can observe, through its OWN owner's credential.**
 *
 * This is the instrument `§3` and `§4` rest on and the reason they assert a property rather than a
 * mechanism: it is a photograph of one tenant's entire visible world, taken over the wire by the
 * only person entitled to it. Nothing in it names a guard, a function or an argument, so an attack
 * that reaches B's data by a route nobody has thought of still changes this photograph.
 *
 * `summary.nightly`'s `sync.server_now_ms` is dropped — it is `ctx.now()`, which moves whenever the
 * fixture advances its clock, and it is the one field in the answer that is about the SERVER rather
 * than about the tenant. `latest_arrival_ms` is kept: it is derived from the tenant's own rows.
 */
const observe = async (bearer: string): Promise<Record<string, unknown>> => {
  const [published, pending, history, devices, directory, summary] = await Promise.all([
    host.call("catalog.published", {}, bearer),
    host.call("catalog.pending", {}, bearer),
    host.call("catalog.history", {}, bearer),
    host.call("devices.list", {}, bearer),
    host.call("tenancy.directory", {}, bearer),
    host.call("summary.nightly", { business_date: businessDate(T0) }, bearer),
  ]);
  const summaryData = dataOf(summary) as { sync: Record<string, unknown> };
  const { server_now_ms: _dropped, ...sync } = summaryData.sync;
  return {
    published: dataOf(published),
    pending: dataOf(pending),
    history: dataOf(history),
    devices: dataOf(devices),
    directory: dataOf(directory),
    summary: { ...summaryData, sync },
  };
};

/** Every string, number and key in a response body, flattened — for "does this contain B?" sweeps. */
const scalarsOf = (value: unknown, into: string[] = []): string[] => {
  if (value === null || value === undefined) return into;
  if (Array.isArray(value)) {
    for (const item of value) scalarsOf(item, into);
    return into;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      into.push(key);
      scalarsOf(item, into);
    }
    return into;
  }
  into.push(String(value));
  return into;
};

/**
 * Every marker that belongs to tenant B and to no one else.
 *
 * `B_BRANCH_1`/`B_BRANCH_2` are deliberately ABSENT: the host's single enabled set puts them in
 * every price row of every entry either tenant saves (see the header), so their presence in a
 * response is host configuration rather than a leak, and including them here would make this sweep
 * fire on the fixture instead of on the defect. Branch-level isolation is asserted directly in
 * `§2` instead, where the question is whether A's subject can make the SERVICE read B's branch.
 */
const B_MARKERS = [
  ORG_B,
  B_ITEM,
  B_ITEM_NAME,
  B_PENDING_ITEM,
  B_PENDING_NAME,
  B_DEVICE,
  B_OWNER,
  B_ORG_NAME,
  String(B_PRICE),
];

/**
 * ⚠ **TWO VALUES ARE DELIBERATELY NOT MARKERS, and each omission is a measurement rather than a
 * judgement.** A marker naming something no read surface can reach would make `§0`'s control
 * assert the presence of something genuinely absent — a red meaning "the fixture is wrong", not
 * "the tenant is exposed" — and the fix an unwary reader reaches for is to delete the failing
 * control, which is how the whole file goes vacuous. Both were caught exactly that way, by `§0`
 * failing on the first run.
 *
 * - **`B_MANAGER`** is the `actor_user_id` on B's `order.created`, and `summarise` projects an
 *   actor only for `shift.opened` (`02-F45`), so her id reaches no read surface here.
 * - **`B_PENDING_PRICE`** is the price inside B's *staged* edit, and `catalog.pending`'s projection
 *   carries identity, name, actor and timing — never `prices`. So a day-end edit's new price is
 *   not observable until it lands. (Noted rather than asserted: whether `14-F28`'s "visible …
 *   until they land" should include the price an owner is about to publish is a doc-14 question,
 *   not an isolation one.)
 *
 * Both stay in the ATTACK inputs below, where a value the service cannot resolve is a fine probe.
 */

const A_MARKERS = [ORG_A, A_ITEM, A_ITEM_NAME, A_DEVICE, A_OWNER, A_ORG_NAME, String(A_PRICE)];

const leakedMarkers = (rpc: Rpc, markers: readonly string[]): string[] => {
  const scalars = new Set(scalarsOf(rpc.body));
  return markers.filter((marker) => scalars.has(marker));
};

// ════════════════════════════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  host = await makeHost();
  for (const [id, email] of [
    [A_OWNER, A_OWNER_EMAIL],
    [A_MANAGER, A_MANAGER_EMAIL],
    [A_CASHIER, A_CASHIER_EMAIL],
    [B_OWNER, B_OWNER_EMAIL],
    [B_MANAGER, B_MANAGER_EMAIL],
  ] as const) {
    token.set(id, await host.login(email));
  }

  // Real, published data on both sides, each written by its OWN owner. Apply-now so it reaches the
  // published artifact — the thing a device fetches — rather than only the staging table.
  for (const [bearer, item] of [
    [token.get(A_OWNER), entry(A_ITEM, A_ITEM_NAME, A_PRICE)],
    [token.get(B_OWNER), entry(B_ITEM, B_ITEM_NAME, B_PRICE)],
  ] as const) {
    const saved = await host.call("catalog.save", { entry: item, apply_when: "now" }, bearer);
    if (saved.status !== 200)
      throw new Error(`fixture publish failed: ${JSON.stringify(saved.body)}`);
  }

  // A pending `14-F28` day-end edit on each side. B's is the one `§4` must not consume.
  for (const [bearer, item] of [
    [token.get(A_OWNER), entry(A_PENDING_ITEM, A_PENDING_NAME, A_PENDING_PRICE)],
    [token.get(B_OWNER), entry(B_PENDING_ITEM, B_PENDING_NAME, B_PENDING_PRICE)],
  ] as const) {
    const staged = await host.call("catalog.save", { entry: item, apply_when: "day_end" }, bearer);
    if (staged.status !== 200)
      throw new Error(`fixture stage failed: ${JSON.stringify(staged.body)}`);
  }
}, 120_000);

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §0 — THE FIXTURE PROVES ITSELF
//
// `01-F71`'s own warning is that a suite exercising one tenant passes with every guard deleted. The
// same warning applies one level down: a suite whose second tenant is EMPTY passes with every guard
// deleted too, and looks identical from the outside. Nothing below §0 means anything unless §0 is
// green, so §0 asserts that B has data, that A has data, and that the two cannot be confused.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§0 CONTROL — both tenants really exist, with data that cannot be confused", () => {
  it("the fixture's `01-F46` arithmetic is what it claims (a suite that mis-states the day proves nothing)", () => {
    expect(businessDayBoundsOfDate(businessDate(T0)).end_ms).toBe(BOUNDARY);
    expect(BOUNDARY - T0).toBe(6 * 60 * 60 * 1000);
    // Inside the session TTL, or every post-boundary assertion becomes a 401 wearing a leak's
    // costume.
    expect(BOUNDARY - T0).toBeLessThan(12 * 60 * 60 * 1000);
  });

  it("A's owner sees A's menu, A's device, A's org and A's takings — and nothing of B's", async () => {
    const seen = await observe(must(token.get(A_OWNER)));
    const scalars = new Set(scalarsOf(seen));
    for (const marker of A_MARKERS) expect(scalars).toContain(marker);
  });

  it("B's owner sees B's menu, B's device, B's org and B's takings — the data that is there to leak", async () => {
    const seen = await observe(must(token.get(B_OWNER)));
    const scalars = new Set(scalarsOf(seen));
    // THE CONTROL THE WHOLE FILE RESTS ON. If any of these is absent, every `not.toContain`
    // assertion below is vacuous and the suite is worthless.
    for (const marker of B_MARKERS) expect(scalars).toContain(marker);
  });

  it("the two tenants' markers are disjoint — a leak is detectable at all", () => {
    for (const marker of B_MARKERS) expect(A_MARKERS).not.toContain(marker);
    // And the published artifacts really differ in the values a leak would carry.
    expect(A_PRICE).not.toBe(B_PRICE);
    expect(A_ITEM).not.toBe(B_ITEM);
  });

  it("both tenants have a PENDING day-end edit, due at the same `01-F46` boundary", async () => {
    for (const [bearer, id, lands] of [
      [must(token.get(A_OWNER)), A_PENDING_ITEM, BOUNDARY],
      [must(token.get(B_OWNER)), B_PENDING_ITEM, BOUNDARY],
    ] as const) {
      const pending = dataOf(await host.call("catalog.pending", {}, bearer)) as {
        entity_id: string;
        lands_at: number;
      }[];
      expect(pending.map((row) => row.entity_id)).toEqual([id]);
      expect(pending[0]?.lands_at).toBe(lands);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §1 — (b) THE ORG COMES FROM THE SUBJECT, NEVER FROM THE REQUEST
//
// `01-F71` (b), and `trpc.ts` decision 3 in the implementation's own words: *"`org_id` is not a
// scope the caller may state: it is who they are."*
//
// Four axes, because those are the four a real caller controls: the body, the query-string input, a
// header, and a foreign `branch_id` stated under your own token. Every one is attempted against
// EVERY read surface the service has, and the answer is compared against the same call made with no
// attack at all — identity, not merely absence of B.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Every read surface, with the input each needs to answer at all. */
const READS: readonly { path: string; input: Record<string, unknown> }[] = [
  { path: "catalog.published", input: {} },
  { path: "catalog.pending", input: {} },
  { path: "catalog.history", input: {} },
  { path: "devices.list", input: {} },
  { path: "tenancy.directory", input: {} },
  { path: "summary.nightly", input: { business_date: businessDate(T0) } },
  { path: "session.whoami", input: {} },
];

/** The four axes a caller controls, as (name, input mutation, extra headers). */
const ATTACKS: readonly {
  name: string;
  input(base: Record<string, unknown>): Record<string, unknown>;
  headers: Record<string, string>;
}[] = [
  {
    name: "org_id stated in the input body",
    input: (base) => ({ ...base, org_id: ORG_B }),
    headers: {},
  },
  {
    name: "org_id AND subject id stated in the input body",
    input: (base) => ({ ...base, org_id: ORG_B, user_id: B_OWNER, subject_user_id: B_OWNER }),
    headers: {},
  },
  {
    name: "org stated in headers (x-org-id, x-restos-org, x-tenant-id)",
    input: (base) => base,
    headers: { "x-org-id": ORG_B, "x-restos-org": ORG_B, "x-tenant-id": ORG_B },
  },
  {
    name: "the other tenant's branch_id, under one's own token",
    input: (base) => ({ ...base, branch_id: B_BRANCH_1 }),
    headers: {},
  },
  {
    name: "a role claim beside the foreign org (Commandment 8: client role claims are never trusted)",
    input: (base) => ({
      ...base,
      org_id: ORG_B,
      branch_id: B_BRANCH_1,
      role: "owner",
      assignments: [{ role: "owner", branch_id: null }],
      permissions: ["catalog.edit_menu_prices", "report.sales_view", "device.manage"],
    }),
    headers: { "x-org-id": ORG_B },
  },
];

describe("§1 (b) — an org stated by the caller changes nothing, on every read surface", () => {
  for (const read of READS) {
    for (const attack of ATTACKS) {
      it(`${read.path} — ${attack.name}: A's owner still gets A's answer, and no marker of B's`, async () => {
        const bearer = must(token.get(A_OWNER));

        // The un-attacked answer, from the same host in the same state.
        const honest = await host.call(read.path, read.input, bearer);
        expect(honest.status, `${read.path} must answer at all: ${messageOf(honest)}`).toBe(200);

        const attacked = await host.call(
          read.path,
          attack.input(read.input),
          bearer,
          attack.headers,
        );

        // A refusal is an acceptable outcome; silently answering about B is not. What is NOT
        // acceptable is a 200 whose CONTENT differs from the honest one, because that is the
        // answer having moved under the caller's control.
        if (attacked.status === 200) {
          expect(stripEcho(attacked.body)).toEqual(stripEcho(honest.body));
        }
        expect(leakedMarkers(attacked, B_MARKERS)).toEqual([]);
      });
    }
  }

  it("CONTROL — the SAME four attacks run by B's owner return B's data, so the surfaces are live", async () => {
    // Without this, every assertion above is satisfied by a service that answers nothing at all.
    const bearer = must(token.get(B_OWNER));
    for (const read of READS) {
      for (const attack of ATTACKS) {
        const attacked = await host.call(
          read.path,
          attack.input(read.input),
          bearer,
          attack.headers,
        );
        expect(attacked.status, `${read.path} for B: ${messageOf(attacked)}`).toBe(200);
        // Mirrored: B naming A's org must not reach A either. Isolation is symmetric or it is not
        // isolation — a one-directional test would pass against a service that special-cased one
        // tenant, which is exactly the shape a "primary tenant" refactor produces.
        expect(leakedMarkers(attacked, A_MARKERS)).toEqual([]);
      }
    }
  });

  it("the SERVICE asks the ledger about the subject's org — not merely filters the answer", async () => {
    // Enforcement point (b) is about which org the service *asks* for. A response body cannot
    // distinguish "asked for A" from "asked for B and filtered the reply", and only one of those
    // survives a store that pages, counts or bills. So this reads the recorded window.
    const before = host.ledgerWindows.length;
    await host.call(
      "summary.nightly",
      { business_date: businessDate(T0), org_id: ORG_B, branch_id: B_BRANCH_1 },
      must(token.get(A_OWNER)),
    );
    const asked = host.ledgerWindows.slice(before);
    expect(asked.length).toBeGreaterThan(0);
    for (const window of asked) expect(window.org_id).toBe(ORG_A);
    // And the branch narrowing is not the caller's either: an org-wide owner reaches every branch
    // of HER org, which `summaryBranchScope` expresses as `null`, never as B's branch list.
    for (const window of asked) {
      if (window.branch_ids !== null) {
        expect(window.branch_ids).not.toContain(B_BRANCH_1);
        expect(window.branch_ids).not.toContain(B_BRANCH_2);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §2 — (a) THE MATRIX REFUSES ACROSS ORGS, AS REACHED THROUGH THE RUNNING HOST
//
// The cell-by-cell register for `can()`/`reportScope` is
// `packages/domain/src/__acceptance__/tenant-isolation-matrix.test.ts`. What is asserted here is the
// half that file cannot see: that the host actually ROUTES through the matrix, with the subject's
// org, so a deletion of the guard is observable from outside the process.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§2 (a) — the matrix's org arm, reached over the wire", () => {
  it("A's BRANCH MANAGER naming B's branch is refused — she is a stranger there (`01-F26`)", async () => {
    const res = await host.call(
      "summary.nightly",
      { business_date: businessDate(T0), branch_id: B_BRANCH_1 },
      must(token.get(A_MANAGER)),
    );
    expect(res.status).not.toBe(200);
    expect(leakedMarkers(res, B_MARKERS)).toEqual([]);
  });

  it("CONTROL — the same manager naming HER OWN branch is answered, so the refusal is about the branch", async () => {
    const res = await host.call(
      "summary.nightly",
      { business_date: businessDate(T0), branch_id: A_BRANCH_1 },
      must(token.get(A_MANAGER)),
    );
    expect(res.status, messageOf(res)).toBe(200);
    const scope = (dataOf(res) as { scope: { org_id: string; covers: string[] | null } }).scope;
    expect(scope.org_id).toBe(ORG_A);
    expect(scope.covers).toEqual([A_BRANCH_1]);
  });

  it("A's CASHIER cannot read a sales summary at all, with or without a foreign org in the body", async () => {
    for (const input of [
      { business_date: businessDate(T0) },
      { business_date: businessDate(T0), org_id: ORG_B, branch_id: B_BRANCH_1 },
    ]) {
      const res = await host.call("summary.nightly", input, must(token.get(A_CASHIER)));
      expect(res.status).not.toBe(200);
      expect(leakedMarkers(res, B_MARKERS)).toEqual([]);
    }
  });

  it("A's owner cannot revoke a device belonging to B — the stolen-tablet switch is per tenant (`14-F13`)", async () => {
    const attacked = await host.call(
      "devices.revoke",
      { device_id: B_DEVICE, org_id: ORG_B, branch_id: B_BRANCH_1 },
      must(token.get(A_OWNER)),
    );
    expect(attacked.status).not.toBe(200);

    // THE CONTROL THAT MATTERS — B's device is still ALIVE, read by B's own owner. Without it the
    // line above passes against a service where `devices.revoke` is broken for everyone.
    const listed = dataOf(await host.call("devices.list", {}, must(token.get(B_OWNER)))) as {
      device_id: string;
      revoked_at: number | null;
    }[];
    const row = listed.find((device) => device.device_id === B_DEVICE);
    expect(row, "B's device must be present, or this assertion proves nothing").toBeDefined();
    expect(row?.revoked_at ?? null).toBeNull();

    // …and no `device.revoked` was attributed to A's owner in B's org (`01-F1` — permanent).
    for (const listing of listed) expect(listing).not.toHaveProperty("revoked_by", A_OWNER);
  });

  it("CONTROL — B's OWN owner CAN revoke a device of B's, so the refusal above is about the tenant", async () => {
    // On `B_DEVICE_SPARE` rather than `B_DEVICE`: see that constant's note. A control that leaves a
    // later assertion aimed at a no-op is the round-3 defect wearing a control's costume.
    const res = await host.call(
      "devices.revoke",
      { device_id: B_DEVICE_SPARE },
      must(token.get(B_OWNER)),
    );
    expect(res.status, messageOf(res)).toBe(200);
    const outcome = dataOf(res) as { already: boolean; revoked_by: string };
    expect(outcome.already).toBe(false);
    expect(outcome.revoked_by).toBe(B_OWNER);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §3 — WRITES: A MUST NOT CHANGE ANYTHING B CAN OBSERVE
//
// The property, not the mechanism. Photograph B's whole visible world, run every mutating procedure
// the service has as tenant A with B-flavoured inputs, photograph it again. This is the assertion
// that survives a refactor, a new procedure, a new store and a new guard — and the one that would
// have caught `§4`'s defect the day it was written.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§3 — every mutation available to A, aimed at B, changes nothing B can see", () => {
  it("the full write sweep leaves B's observable state byte-identical", async () => {
    const bearer = must(token.get(A_OWNER));
    const before = await observe(must(token.get(B_OWNER)));

    // Each of these names B's org, B's branch and B's entity ids in every place the wire allows.
    const attacks: readonly [string, Record<string, unknown>][] = [
      [
        "catalog.save",
        {
          org_id: ORG_B,
          entry: { ...entry(B_ITEM, "OWNED BY A", 1), prices: cells(1) },
          apply_when: "now",
        },
      ],
      [
        "catalog.save",
        {
          org_id: ORG_B,
          entry: { ...entry(B_PENDING_ITEM, "OWNED BY A", 1), prices: cells(1) },
          apply_when: "day_end",
        },
      ],
      ["catalog.archive", { org_id: ORG_B, kind: "item", id: B_ITEM, apply_when: "now" }],
      ["catalog.cancelPending", { org_id: ORG_B, edit_id: await pendingEditId(B_OWNER) }],
      ["devices.revoke", { org_id: ORG_B, device_id: B_DEVICE }],
      [
        "catalog.editMenuPrices",
        { org_id: ORG_B, branch_id: B_BRANCH_1, action: "catalog.edit_menu_prices" },
      ],
      ["ops.voidAfterKot", { org_id: ORG_B, branch_id: B_BRANCH_1 }],
    ];

    for (const [path, input] of attacks) {
      const res = await host.call(path, input, bearer);
      // The outcome is not asserted — a refusal and a success-scoped-to-A are both legitimate
      // answers to "A did a thing". What is asserted is the effect on B, below.
      expect([200, 400, 401, 403, 404, 500]).toContain(res.status);
      expect(
        leakedMarkers(
          res,
          B_MARKERS.filter((m) => m !== B_ITEM && m !== B_PENDING_ITEM),
        ),
      ).toEqual([]);
    }

    const after = await observe(must(token.get(B_OWNER)));
    expect(after).toEqual(before);
  });

  it("CONTROL — the same writes made by B's OWN owner DO move B's world", async () => {
    // Without this the assertion above is satisfied by a service where nothing works at all.
    const bearer = must(token.get(B_OWNER));
    const before = await observe(bearer);
    const res = await host.call(
      "catalog.save",
      { entry: entry("item-b-control-probe", "Control Probe", 999), apply_when: "now" },
      bearer,
    );
    expect(res.status, messageOf(res)).toBe(200);
    const after = await observe(bearer);
    expect(after).not.toEqual(before);
  });

  it("CONTROL — A's own catalog is untouched by A's failed attacks on B", async () => {
    // The mirror of the sweep: proving A cannot reach B is only half of "isolated". A service that
    // rolled A's own state back on every cross-tenant attempt would pass §3 and be broken.
    const published = dataOf(
      await host.call("catalog.published", {}, must(token.get(A_OWNER))),
    ) as { entries: { id: string }[] };
    expect(published.entries.map((e) => e.id)).toContain(A_ITEM);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §4 — NAMED REGRESSION: `catalog.runDayEnd` SWEEPS EVERY ORG
//
// **This is a live cross-tenant WRITE defect and these assertions are RED on the tree as authored.**
//
// `createDayEndScheduler.runDue()` calls `staged.takeDue(now)`, which returns AND REMOVES every
// org's due edits; `runDayEnd` then filters the ANSWER to the caller's own org. So the read is
// scoped and the side effect is not:
//
//   - tenant B's staged edit is taken out of the staging store by tenant A's request,
//   - it is PUBLISHED — B's catalog version advances and B's tills fetch a menu B did not release,
//   - `14-F28`'s "cancellable until they land" window is consumed with nobody in B having acted,
//   - and A's own answer says `{ version: null }`, so nothing on either side reports it.
//
// The last point is the reason this is a register entry rather than a bug report: the ANSWER is
// correctly scoped, so every existing assertion in `catalog.test.ts` — all of which read the answer
// — is green. Only a second tenant with data of its own can see it.
//
// ⚠ The assertions are written against `01-F71` ("never … cause a write in"), NOT against today's
// behaviour, per `24 §3`. They are expected to fail until the sweep is scoped.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§4 REGRESSION `01-F71` — `catalog.runDayEnd` run by A must not touch B", () => {
  /** B's whole observable world either side of A's sweep. Populated by the sweep test below. */
  let beforeSweep: Record<string, unknown> | undefined;
  let afterSweep: Record<string, unknown> | undefined;

  it("CONTROL — before the sweep, B has exactly one pending edit and a published version to move", async () => {
    const pending = dataOf(await host.call("catalog.pending", {}, must(token.get(B_OWNER)))) as {
      entity_id: string;
      lands_at: number;
    }[];
    expect(pending.map((row) => row.entity_id)).toEqual([B_PENDING_ITEM]);
    // DUE, once the clock passes the boundary — otherwise the sweep would have nothing to take and
    // a green result would mean "the edit was not ready", not "the tenant was protected".
    expect(pending[0]?.lands_at).toBe(BOUNDARY);

    const published = dataOf(
      await host.call("catalog.published", {}, must(token.get(B_OWNER))),
    ) as { version: number; entries: { id: string }[] };
    expect(published.version).toBeGreaterThan(0);
    expect(published.entries.map((e) => e.id)).not.toContain(B_PENDING_ITEM);
  });

  it("A's owner running the day-end sweep changes NOTHING B can observe, and leaves B's version where it was", async () => {
    beforeSweep = await observe(must(token.get(B_OWNER)));
    const bVersionBefore = (beforeSweep.published as { version: number }).version;

    // Past `01-F46`'s boundary, so BOTH tenants' day-end edits are due. That is the whole scenario:
    // two restaurants whose menus land at the same 05:00, and one of them opens the back office.
    host.clock.at = BOUNDARY + 1;

    const swept = await host.call("catalog.runDayEnd", {}, must(token.get(A_OWNER)));
    expect(swept.status, messageOf(swept)).toBe(200);

    // The answer A gets is correctly scoped — `{ version: null }`, because A had no due edit of its
    // own at this point or because the filter dropped B's. **That is exactly why this defect is
    // invisible to every existing suite**: they all assert on the answer, and the answer is right.
    // The damage is entirely in the side effect, so this asserts the side effect.
    afterSweep = await observe(must(token.get(B_OWNER)));
    expect((afterSweep.published as { version: number }).version).toBe(bVersionBefore);
    // The mechanism-independent form of the same claim, and the one that will still bite after a
    // refactor moves the sweep somewhere else entirely.
    expect(afterSweep).toEqual(beforeSweep);
  });

  it("…and B's item is NOT on B's tills — the leak stated as what a device would fetch", async () => {
    const published = dataOf(
      await host.call("catalog.published", {}, must(token.get(B_OWNER))),
    ) as { entries: { id: string }[] };
    // `catalog.ts`'s own trap: a staged edit is not a published catalog, and the only honest place
    // to assert `14-F28` from is what a DEVICE would fetch.
    expect(published.entries.map((e) => e.id)).not.toContain(B_PENDING_ITEM);
  });

  it("…and B's `14-F28` cancellation window is NOT consumed — the edit is still pending and still cancellable", async () => {
    const pending = dataOf(await host.call("catalog.pending", {}, must(token.get(B_OWNER)))) as {
      entity_id: string;
      edit_id: string;
    }[];
    expect(pending.map((row) => row.entity_id)).toEqual([B_PENDING_ITEM]);
  });

  it("…and A's sweep appended no row to B's `14-F3` history — which `01-F1` would make permanent", async () => {
    const history = dataOf(await host.call("catalog.history", {}, must(token.get(B_OWNER)))) as {
      actor_user_id: string | null;
    }[];
    // Compared against the BASELINE CAPTURED IN THIS RUN, never against a literal count. A literal
    // was written first and was wrong: `§3`'s control publish adds a row of B's own, so `toBe(1)`
    // failed for a reason that had nothing to do with the leak and would have sent a reader
    // hunting the wrong defect. A count that another section can perturb is not an assertion about
    // this one.
    expect(history.length).toBe((must(beforeSweep).history as unknown[]).length);
    // `01-F1` makes attribution permanent: a row in B's history naming A's owner — or naming
    // nobody — cannot be corrected in place afterwards.
    for (const record of history) {
      expect(record.actor_user_id).not.toBe(A_OWNER);
      expect(record.actor_user_id).not.toBe(A_MANAGER);
      expect(record.actor_user_id).not.toBe(A_CASHIER);
    }
  });

  it("CONTROL — B's OWN owner running the sweep DOES land B's edit, so the edit was landable all along", async () => {
    // The attribution control. Without it, every assertion above is satisfied by an edit that was
    // simply never publishable — a dud fixture that would look exactly like a protected tenant.
    const swept = await host.call("catalog.runDayEnd", {}, must(token.get(B_OWNER)));
    expect(swept.status, messageOf(swept)).toBe(200);
    expect((dataOf(swept) as { version: number | null }).version).not.toBeNull();

    const published = dataOf(
      await host.call("catalog.published", {}, must(token.get(B_OWNER))),
    ) as { entries: { id: string }[] };
    expect(published.entries.map((e) => e.id)).toContain(B_PENDING_ITEM);
  });

  it("CONTROL — A's own day-end edit DID land in A's catalog, so A's sweep was not a no-op", async () => {
    // The other half of the attribution: if A's sweep had done nothing at all, B being untouched
    // would prove nothing about isolation. A's own edit must have landed.
    const published = dataOf(
      await host.call("catalog.published", {}, must(token.get(A_OWNER))),
    ) as { entries: { id: string }[] };
    expect(published.entries.map((e) => e.id)).toContain(A_PENDING_ITEM);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("fixture value missing");
  return value;
}

/** B's current pending `edit_id`, so `§3` can aim a real cancel at a real edit. */
async function pendingEditId(user_id: string): Promise<string> {
  const pending = dataOf(await host.call("catalog.pending", {}, must(token.get(user_id)))) as {
    edit_id: string;
  }[];
  return pending[0]?.edit_id ?? "no-pending-edit";
}

/**
 * Neutralise the two fields that differ between an honest call and an attacked one **without any
 * of the other tenant's data being involved**, so `§1`'s identity comparison is about the answer
 * and not about the question.
 *
 * - `server_now_ms` is `ctx.now()` — the clock, not the tenant.
 * - `scope.branch_id` is `summary.nightly`'s deliberate echo of *what the caller asked for*
 *   ("echoed so a screen cannot mislabel its own header when a request and a response race").
 *   Handing a caller back a string the caller just sent discloses nothing: A's owner already knew
 *   she typed `branch-nazimabad`.
 *
 * ⚠ **`scope.covers` and `scope.org_id` are NOT neutralised, and that is the whole point of doing
 * this by name rather than by dropping `scope`.** Those two ARE the answer's width — `covers` is
 * `summaryBranchScope`'s verdict and `org_id` is the subject's org — so an attack that widened the
 * answer, or moved it into B, still fails this comparison. Blanket-dropping `scope` would have
 * retired exactly the assertion this section exists for.
 *
 * The echo does raise a **labelling** question — the header would read "Nazimabad" over A's whole
 * org's figures — but that is `00 §5.7` and not `01-F71`, so it is reported rather than asserted
 * here.
 */
function stripEcho(body: Record<string, unknown>): unknown {
  return JSON.parse(
    JSON.stringify(body, function (this: unknown, key, value) {
      if (key === "server_now_ms") return "<clock>";
      // NARROW ON PURPOSE: only the `branch_id` that sits beside `covers` — i.e. `summary.nightly`'s
      // `scope` echo. A blanket `key === "branch_id"` replacer was written first and is WRONG: it
      // would also neutralise the `branch_id` of every row in `tenancy.directory`'s branch list and
      // `devices.list`, which are tenant DATA — so a leak of B's branch topology would have been
      // erased by the comparison built to detect it. The identity comparison must be blind to the
      // question and never to the answer.
      const parent = this as Record<string, unknown> | undefined;
      if (key === "branch_id" && parent !== undefined && "covers" in parent) {
        return "<echoed request parameter>";
      }
      return value;
    }),
  );
}
