// Acceptance tests — the `/internal/devices` surface: `14-F12`'s list and `14-F13`'s revocation,
// reachable at last from an AUTHENTICATED back-office screen instead of only from a shell.
//
// PROVENANCE: `specs/14-backoffice.md` `14-F12` ("Device list per branch: class, app version,
// last-seen, sync lag"), `14-F13` ("Revocation is immediate ('stolen tablet' flow) … the list shows
// revoked state and actor"), `14-F30` (the permission action and its owner-only cells);
// `specs/01-kernel-sync.md` `01-F25` (revocable token), `01-F48` (eviction "within 30 s … rather
// than only at its next voluntary contact"; "blocks **reads as well as writes**"), `01-F42` (the
// purge on next contact), `01-F62` (the org-scoped event store).
//
// HONESTY NOTE (`24 §3` step 2): this file and the routes it covers were written in one session,
// which the rule forbids for a protected path. Stated, not hidden — `catalog-publish-http.test.ts`
// carries the same note. The mitigation is the mutation matrix in `services/sync-gateway/CLAUDE.md`,
// run against a CONTROL.
//
// ⚠ **§C IS THE ONE THAT MATTERS AND IT IS THE ONE A COLUMN-CHECKING TEST CANNOT DO.** A test
// asserting `revoked_at` moved proves only that an UPDATE ran; `01-F48` is a claim about the TILL.
// So §C opens a real session with a real unexpired token, revokes it **over HTTP**, and then
// requires the product itself — a gateway built independently of the server that took the request —
// to evict it and to refuse its reads.
//
// ⚠ Needs Docker (Testcontainers). Fails LOUDLY rather than skipping (`T-01-07`).

import { newId } from "@restos/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthRejectedError } from "../errors.js";
import { createGateway, type Gateway, REVOCATION_SWEEP_INTERVAL_MS } from "../gateway.js";
import { listDevices, readRegistryRow, registerDevice } from "../registry.js";
import { buildServer } from "../server.js";
import {
  catchupMsg,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  ofKind,
  openDb,
  openSession,
  TEST_TOKEN_SECRET,
  testDatabaseUrl,
} from "./helpers.js";

/** ≥ 32 bytes — the floor `server.ts` enforces on this credential (`18 §5`). */
const PUBLISH_SECRET = "internal-device-credential-for-the-acceptance-suite";

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let base: string;
let unconfigured: string;
let gateway: Gateway;
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

const revokeOverHttp = (id: Identity, token = PUBLISH_SECRET): Promise<Http> =>
  call(base, "POST", "/internal/devices/revoke", {
    token,
    body: { org_id: id.org_id, device_id: id.device_id },
  });

const listOverHttp = (org_id: string, token = PUBLISH_SECRET): Promise<Http> =>
  call(base, "GET", `/internal/devices?org_id=${encodeURIComponent(org_id)}`, { token });

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  // A deployment that declared no credential — its own instance, because the question is what
  // `buildServer` does with `undefined` rather than what a flag on one instance does.
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  unconfigured = await bare.listen({ port: 0, host: "127.0.0.1" });
  servers = [app, bare];
  // Built SEPARATELY from the server that will take the HTTP request, on the same database. That
  // separation is §C's whole claim: the sweep must see a revocation it did not perform.
  // `makeClock()` (BASE_T), NOT `Date.now()`, and the reason is measured rather than stylistic:
  // `helpers.ts` mints session tokens against BASE_T, so a real-clock gateway reads every one of
  // them as 90 days expired and opens straight into `01-F47` drain mode — where reads are refused
  // for the WRONG reason and §C's read assertion would pass against an unrevoked device.
  // `journey-catalog.test.ts` records the same trap from the other side.
  gateway = createGateway({
    db,
    clock: makeClock(),
    auth: { token_secret: TEST_TOKEN_SECRET },
  });
}, 60_000);

afterAll(async () => {
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

// ── §A — the credential, which is the only control on this surface ───────────────────────────

describe("§A — /internal/devices is behind PUBLISH_TOKEN, fail-closed", () => {
  it("no credential is a 401 on both routes", async () => {
    expect((await call(base, "GET", "/internal/devices?org_id=x")).status).toBe(401);
    expect(
      (
        await call(base, "POST", "/internal/devices/revoke", {
          body: { org_id: "x", device_id: "y" },
        })
      ).status,
    ).toBe(401);
  });

  it("a WRONG credential is a 401 — and a right one is not, which is the control", async () => {
    expect((await listOverHttp("x", "not-the-credential")).status).toBe(401);
    expect((await listOverHttp("x")).status).toBe(200);
  });

  it("a gateway with NO PUBLISH_TOKEN answers 503 — never fail-open (18 §5)", async () => {
    // The tempting shape is "skip the check when no secret is configured, for local dev", which
    // makes an unconfigured production gateway hand its device fleet to anyone who reaches the
    // port — and here that means a kill switch, not a menu.
    const response = await call(unconfigured, "GET", "/internal/devices?org_id=x", {
      token: PUBLISH_SECRET,
    });
    expect(response.status).toBe(503);
  });
});

// ── §B — 14-F12's list ───────────────────────────────────────────────────────────────────────

describe("§B — the device list (14-F12)", () => {
  it("returns this org's registry rows, and no other org's", async () => {
    const mine = freshIdentity();
    const theirs = freshIdentity();
    await registerDevice(db, { ...mine, device_class: "counter_electron" });
    await registerDevice(db, { ...theirs, device_class: "kitchen" });

    const response = await listOverHttp(mine.org_id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const devices = response.body.devices as readonly { device_id: string }[];
    expect(devices.map((row) => row.device_id)).toEqual([mine.device_id]);
    // The isolation half stated as its own assertion: a list that leaked another org's fleet would
    // still satisfy "contains mine".
    expect(devices.some((row) => row.device_id === theirs.device_id)).toBe(false);
  });

  it("carries the columns this table HAS and none it does not (14-F12, 00 §5.7)", async () => {
    const id = freshIdentity();
    await registerDevice(db, { ...id, device_class: "counter_electron", token_expires_at: 42 });
    const devices = (await listOverHttp(id.org_id)).body.devices as readonly Record<
      string,
      unknown
    >[];
    expect(devices[0]).toEqual({
      device_id: id.device_id,
      branch_id: id.branch_id,
      device_class: "counter_electron",
      /**
       * `01-F70` — the device's human name, added to this projection in August 2026 because the FR
       * exists to stop `14-F12` naming a till only by its UUID. `null` here is the honest UNNAMED
       * row: this fixture registers without a name, `0010` made the column nullable with no
       * backfill, and `21-F15` decides what the screen does with the absence. The `toEqual` is kept
       * exact rather than loosened — the block below turns on this object listing what the table
       * HAS and nothing else, and a `toMatchObject` would retire that guarantee.
       */
      display_name: null,
      revoked_at: null,
      token_expires_at: 42,
    });
    // `14-F12` also asks for app version, last-seen and sync lag. This service stores none of the
    // three and the row must NOT invent them — a fabricated `last_seen` is exactly the aged-number-
    // as-fresh-number failure `00 §5.7` forbids, and it would look right on a demo.
    for (const absent of ["app_version", "last_seen", "sync_lag_ms"]) {
      expect(devices[0]).not.toHaveProperty(absent);
    }
  });

  it("shows revoked state — the half `14-F13` says the list must show", async () => {
    const id = freshIdentity();
    await registerDevice(db, { ...id, device_class: "counter_electron" });
    expect((await revokeOverHttp(id)).status).toBe(200);
    const devices = (await listOverHttp(id.org_id)).body.devices as readonly {
      revoked_at: number | null;
    }[];
    expect(devices[0]?.revoked_at).toBeTypeOf("number");
  });
});

// ── §C — 01-F48. THE LOCKOUT. Not a column: a till. ──────────────────────────────────────────

describe("§C — a revocation taken over HTTP actually stops the till (01-F48, 01-F42)", () => {
  it("evicts a LIVE session, and evicts only the one named", async () => {
    // `01-F48`: "the cloud drops live sessions … rather than only at its next voluntary contact".
    // The victim holds a valid unexpired token and an open socket and never speaks again — the
    // branch is silent, exactly as it is at 2am when a tablet walks out of the restaurant.
    const victim = freshIdentity();
    const bystander: Identity = { ...victim, device_id: newId() };
    const live = await openSession(gateway, victim);
    const peer = await openSession(gateway, bystander);

    const response = await revokeOverHttp(victim);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ already: false, branch_id: victim.branch_id });

    // Only the sweep runs, exactly as the shipped `server.ts` timer drives it. The gateway doing
    // the sweeping was built in `beforeAll` and never saw the HTTP request.
    await gateway.sweepRevocations();

    expect(
      ofKind(live.rec.all, "purge_command"),
      "a session revoked over /internal survived the sweep — the screen would report success " +
        "while the stolen tablet went on selling",
    ).toHaveLength(1);
    expect(
      ofKind(peer.rec.all, "purge_command"),
      "a device the request did not name was evicted too",
    ).toHaveLength(0);

    // The bound the FR states, read from the gateway's own constant rather than hand-copied.
    expect(REVOCATION_SWEEP_INTERVAL_MS).toBeLessThanOrEqual(30_000);

    live.conn.close();
    peer.conn.close();
  }, 120_000);

  it("blocks READS as well as writes — the revoked session's catchup is refused (01-F48)", async () => {
    // The FR is explicit that revocation is not a write-only control: "a revoked device receives no
    // further events on any plane". A device that could still catch up would keep receiving the
    // org's orders after being switched off.
    const id = freshIdentity();
    const session = await openSession(gateway, id);

    // The CONTROL: the very same read, on the very same session, succeeds first. Without it a
    // refusal after revocation is indistinguishable from a read that never worked.
    await session.conn.handle(catchupMsg(0));
    expect(ofKind(session.rec.all, "catchup_response").length).toBeGreaterThan(0);
    const servedBefore = ofKind(session.rec.all, "catchup_response").length;

    expect((await revokeOverHttp(id)).status).toBe(200);

    await expect(session.conn.handle(catchupMsg(0))).rejects.toThrow(AuthRejectedError);
    expect(
      ofKind(session.rec.all, "catchup_response"),
      "a revoked device was served a catchup_response",
    ).toHaveLength(servedBefore);

    session.conn.close();
  }, 120_000);

  it("refuses the next hello with a purge_command (01-F42)", async () => {
    const id = freshIdentity();
    const first = await openSession(gateway, id);
    first.conn.close();
    expect((await revokeOverHttp(id)).status).toBe(200);

    await expect(openSession(gateway, id)).rejects.toThrow(/revoked/i);
  }, 120_000);
});

// ── §D — the 2am cases, on the same read-before-write the CLI relies on ──────────────────────

describe("§D — the refusals that keep an operator honest (00 §5.7)", () => {
  it("an UNREGISTERED device is a 400 and writes nothing", async () => {
    // `revokeDevice` alone is an `UPDATE … WHERE`: a mistyped id matches no rows, returns void, and
    // a route that trusted it would answer 200 over a till that is still live. This route reaches
    // `revokeRegisteredDevice`, the same function the CLI calls, precisely so there is ONE reading
    // of that hazard rather than two.
    const ghost = freshIdentity();
    const response = await revokeOverHttp(ghost);
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(String(response.body.error)).toContain("NOT REGISTERED");
    expect(await readRegistryRow(db, ghost.org_id, ghost.device_id)).toBeUndefined();
  });

  it("re-revoking says `already` and does NOT move the instant (01-F1)", async () => {
    const id = freshIdentity();
    await registerDevice(db, { ...id, device_class: "counter_electron" });

    const first = await revokeOverHttp(id);
    expect(first.status).toBe(200);
    expect(first.body.already).toBe(false);
    const stamped = first.body.revoked_at as number;

    const second = await revokeOverHttp(id);
    expect(second.status).toBe(200);
    // The field `services/api` reads to decide whether to append a `device.revoked` at all: a
    // second event would attribute the first revocation to whoever pressed the button today.
    expect(second.body.already).toBe(true);
    expect(second.body.revoked_at).toBe(stamped);
    expect((await readRegistryRow(db, id.org_id, id.device_id))?.revoked_at).toBe(stamped);
  });

  it("there is NO un-revoke route — the surface offers no way back (14-F30, 01-N5)", async () => {
    const id = freshIdentity();
    await registerDevice(db, { ...id, device_class: "counter_electron" });
    await revokeOverHttp(id);
    for (const path of [
      "/internal/devices/unrevoke",
      "/internal/devices/restore",
      "/internal/devices/reinstate",
    ]) {
      const response = await call(base, "POST", path, {
        token: PUBLISH_SECRET,
        body: { org_id: id.org_id, device_id: id.device_id },
      });
      expect(response.status, `${path} answered ${response.status}`).toBe(404);
    }
    // And the state is unchanged by having asked.
    expect((await readRegistryRow(db, id.org_id, id.device_id))?.revoked_at).toBeTypeOf("number");
  });

  it("a malformed body is a 400, and `strictObject` refuses an unknown field", async () => {
    const id = freshIdentity();
    await registerDevice(db, { ...id, device_class: "counter_electron" });
    expect(
      (await call(base, "POST", "/internal/devices/revoke", { token: PUBLISH_SECRET, body: {} }))
        .status,
    ).toBe(400);
    // An actor sent HERE would be silently dropped by a loose schema, and the caller would believe
    // it had attributed a revocation it had not. `14-F13`'s actor lives on the org-scoped event.
    const withActor = await call(base, "POST", "/internal/devices/revoke", {
      token: PUBLISH_SECRET,
      body: { org_id: id.org_id, device_id: id.device_id, actor_user_id: "user-ali" },
    });
    expect(withActor.status).toBe(400);
    expect(await listDevices(db, id.org_id)).toEqual([
      expect.objectContaining({ revoked_at: null }),
    ]);
  });
});
