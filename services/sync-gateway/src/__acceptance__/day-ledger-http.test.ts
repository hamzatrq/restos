// Acceptance tests — `/internal/ledger/window`: one business day of the merged org log, served to
// `services/api` for `12-F10`'s nightly owner summary.
//
// PROVENANCE: `specs/12-owner-app.md` `12-F10` (the summary's blocks), `12-F2` ("all reads are
// authorized server-side; the app never widens scope client-side"), `12-F22` (the org roll-up);
// `specs/01-kernel-sync.md` `01-F46` (Asia/Karachi, 05:00 cutover — "a sale rung at 01:30 belongs
// to the night it was actually served"), `01-F34`/`01-F45` (the ordering-metadata ban), `01-F7`
// (the merged org log); `00 §5.7` (report what is true).
//
// ⚠ **THE ASSERTION THIS FILE EXISTS FOR IS §B**: the window is on the envelope's
// `branch_created_at`, NOT on `server_received_at`. Every event in this suite is merged with a
// server clock deliberately parked on a DIFFERENT business day, so a route that filtered on
// arrival returns the wrong set — and returns it confidently.
//
// HONESTY NOTE (`24 §3` step 2): this file and the route it covers were written in one session,
// which the rule forbids on a protected path. Stated, not hidden — `device-http.test.ts` and
// `catalog-publish-http.test.ts` carry the same note. The mitigation is the mutation matrix in
// `services/sync-gateway/CLAUDE.md`, run against a CONTROL.
//
// ⚠ Needs Docker (Testcontainers). Fails LOUDLY rather than skipping (`T-01-07`).

import { businessDayBoundsOfDate } from "@restos/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROW_CAP } from "../day-ledger.js";
import { createGateway } from "../gateway.js";
import { buildServer } from "../server.js";
import {
  closeDb,
  type Db,
  DEVICE_TOKEN_TTL_MS,
  freshIdentity,
  type Identity,
  makeClock,
  openDb,
  openSession,
  pushMsg,
  signedToken,
  TEST_TOKEN_SECRET,
  testDatabaseUrl,
  validEnvelope,
} from "./helpers.js";

/** ≥ 32 bytes — the floor `server.ts` enforces on this credential (`18 §5`). */
const PUBLISH_SECRET = "internal-day-ledger-credential-for-the-acceptance-suite";

/** `2026-08-09`, Asia/Karachi, 05:00 cutover. Karachi is UTC+5, so the day starts at 00:00Z. */
const DATE = "2026-08-09";
const DAY = businessDayBoundsOfDate(DATE);
const at = (wall_hour: number, minute = 0): number =>
  DAY.start_ms + (((wall_hour - 5 + 24) % 24) * 60 + minute) * 60_000;

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let base: string;
let unconfigured: string;
let servers: { close(): Promise<void> }[];

const ORG = `org-day-ledger-${Date.now()}`;
let deviceA: Identity;
let deviceB: Identity;

/**
 * `null` means SEND NO CREDENTIAL, and it has to be a distinct value rather than `undefined`: a
 * defaulted parameter cannot tell "the caller omitted it" from "the caller asked for none", so the
 * first draft's no-credential test silently sent the right one and asserted a 401 against a 200.
 */
const call = async (origin: string, path: string, token: string | null): Promise<Http> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${origin}${path}`, { headers });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const window = async (
  params: Readonly<Record<string, string | number>>,
  token: string | null = PUBLISH_SECRET,
): Promise<Http> => {
  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return call(base, `/internal/ledger/window?${query}`, token);
};

type WindowRow = {
  id: string;
  type: string;
  branch_id: string;
  branch_created_at: number;
  time_basis: string;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
};

const rowsOf = (reply: Http): WindowRow[] => reply.body.events as WindowRow[];

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  unconfigured = await bare.listen({ port: 0, host: "127.0.0.1" });
  servers = [app, bare];

  /**
   * **The server clock is parked on a DIFFERENT business day from every event's branch stamp**,
   * and that is §B's whole mechanism. `server_received_at` comes from this clock (`18 §4`), so
   * every row below arrives stamped inside `2026-08-12` while its branch stamp says `2026-08-09`.
   * A route that windowed on arrival therefore returns EVERYTHING for the wrong day and NOTHING
   * for the right one — which is exactly what an offline branch syncing at 03:00 produces in
   * production, and exactly the error `01-F46` exists to prevent.
   */
  const arrival = businessDayBoundsOfDate("2026-08-12").start_ms + 9 * 3_600_000;
  const gateway = createGateway({
    db,
    clock: makeClock(arrival),
    auth: { token_secret: TEST_TOKEN_SECRET },
  });

  deviceA = { ...freshIdentity(), org_id: ORG, branch_id: `${ORG}-lahore` };
  deviceB = { ...freshIdentity(), org_id: ORG, branch_id: `${ORG}-karachi` };

  /**
   * ⚠ **THE TOKEN HAS TO BE MINTED AGAINST THE ARRIVAL CLOCK, NOT `BASE_T`.** `helpers.ts` gives
   * every default suite token a 90-day life from `BASE_T` (July 2025) because every other suite
   * runs its clock there — and this one deliberately runs 13 months later, so the default token is
   * long expired, the session opens straight into `01-F47` drain mode, and **every push is refused
   * while `hello_ack` still arrives**. Measured on the first run: all eight window assertions
   * failed with an empty ledger and nothing said why.
   *
   * `journey-catalog.test.ts` and `device-http.test.ts` both record this trap from the other
   * direction (a real clock against a `BASE_T` token). It is the same trap, and the reason it is
   * worth a third note is that here the CLOCK is what the test is about, so "use `makeClock()`"
   * — the fix in both of those files — is not available.
   */
  const push = async (identity: Identity, envelopes: Parameters<typeof pushMsg>[0]) => {
    const session = await openSession(gateway, identity, {
      token: signedToken({ ...identity, expires_at: arrival + DEVICE_TOKEN_TTL_MS }),
    });
    // A session that opened into drain mode would answer `hello_ack` and refuse every push, so the
    // fixture asserts admission rather than assuming it.
    expect(session.helloAck.kind).toBe("hello_ack");
    await session.conn.handle(pushMsg(envelopes));
  };

  await push(deviceA, [
    // Inside the day: 13:00 and 20:00 Karachi.
    validEnvelope(deviceA, 0, {
      branch_created_at: at(13),
      payload: { order_id: "in-1300", channel: "counter" },
    }),
    validEnvelope(deviceA, 1, {
      branch_created_at: at(20),
      payload: { order_id: "in-2000", channel: "counter" },
    }),
    /**
     * **01:30 the following CALENDAR day, and still this business day.** The single most
     * important row in this file: under a midnight boundary it belongs to `2026-08-10` and the
     * night's takings are split across two reports.
     */
    validEnvelope(deviceA, 2, {
      branch_created_at: at(1, 30),
      payload: { order_id: "in-0130", channel: "counter" },
    }),
    // 04:59 — the last minute of the day.
    validEnvelope(deviceA, 3, {
      branch_created_at: DAY.end_ms - 60_000,
      payload: { order_id: "in-0459", channel: "counter" },
    }),
    // 05:00 exactly — the NEXT day's first instant. Half-open, so it must be excluded.
    validEnvelope(deviceA, 4, {
      branch_created_at: DAY.end_ms,
      payload: { order_id: "out-next", channel: "counter" },
    }),
    // One millisecond before the cutover that opens this day — the previous day's last event.
    validEnvelope(deviceA, 5, {
      branch_created_at: DAY.start_ms - 1,
      payload: { order_id: "out-prev", channel: "counter" },
    }),
    // A provisional stamp, so the marker's survival across the wire is assertable.
    validEnvelope(deviceA, 6, {
      branch_created_at: at(14),
      time_basis: "branch_provisional",
      payload: { order_id: "in-provisional", channel: "counter" },
    }),
    // An attributed event, so `02-F45`'s actor is assertable end to end.
    validEnvelope(deviceA, 7, {
      branch_created_at: at(15),
      actor_user_id: "user-hina",
      payload: { order_id: "in-attributed", channel: "counter" },
    }),
  ]);

  await push(deviceB, [
    validEnvelope(deviceB, 0, {
      branch_created_at: at(19),
      payload: { order_id: "in-branch-b", channel: "counter" },
    }),
  ]);
}, 90_000);

afterAll(async () => {
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

// ── §A — the credential ────────────────────────────────────────────────────────────────────────

describe("§A — the window is behind PUBLISH_TOKEN, fail-closed", () => {
  it("no credential and a wrong credential are both 401; a right one is not (the control)", async () => {
    expect(
      (await call(base, `/internal/ledger/window?org_id=${ORG}&from_ms=0&to_ms=1`, null)).status,
    ).toBe(401);
    expect((await window({ org_id: ORG, from_ms: 0, to_ms: 1 }, "not-the-credential")).status).toBe(
      401,
    );
    expect((await window({ org_id: ORG, from_ms: 0, to_ms: 1 })).status).toBe(200);
  });

  it("a gateway with NO PUBLISH_TOKEN answers 503 — never fail-open (18 §5)", async () => {
    const response = await call(
      unconfigured,
      `/internal/ledger/window?org_id=${ORG}&from_ms=0&to_ms=1`,
      PUBLISH_SECRET,
    );
    expect(response.status).toBe(503);
  });
});

// ── §B — the business day, on the BRANCH stamp ─────────────────────────────────────────────────

describe("§B — 01-F46: the window is the branch stamp, never the arrival", () => {
  it("returns exactly the events whose BRANCH stamp falls inside the business day", async () => {
    const reply = await window({ org_id: ORG, from_ms: DAY.start_ms, to_ms: DAY.end_ms });
    expect(reply.status).toBe(200);
    const ids = rowsOf(reply)
      .map((row) => row.payload.order_id as string)
      .sort();
    expect(ids).toEqual([
      "in-0130",
      "in-0459",
      "in-1300",
      "in-2000",
      "in-attributed",
      "in-branch-b",
      "in-provisional",
    ]);
    // The two outside it are ABSENT, and both edges are the half-open boundary (`01-F46`).
    expect(ids).not.toContain("out-next");
    expect(ids).not.toContain("out-prev");
  });

  /**
   * **THE ANTI-VACUITY CONTROL.** Without this, §B's first test could pass against a route that
   * filtered on `server_received_at` if the two axes happened to agree. They do not agree here by
   * construction — and this proves it, so the assertion above is about the axis rather than about
   * the fixture.
   */
  it("the arrival axis would give a DIFFERENT answer — so the axis is what is being asserted", async () => {
    const arrivalDay = businessDayBoundsOfDate("2026-08-12");
    // Windowing on the arrival day's range over the BRANCH axis finds nothing, because every
    // event's branch stamp is three days earlier. A route reading `server_received_at` would have
    // returned all nine rows here and none in the test above.
    const reply = await window({
      org_id: ORG,
      from_ms: arrivalDay.start_ms,
      to_ms: arrivalDay.end_ms,
    });
    expect(rowsOf(reply)).toHaveLength(0);
  });

  it("carries time_basis and actor_user_id across the wire unchanged (01-F44, 02-F45)", async () => {
    const rows = rowsOf(await window({ org_id: ORG, from_ms: DAY.start_ms, to_ms: DAY.end_ms }));
    const provisional = rows.find((row) => row.payload.order_id === "in-provisional");
    expect(provisional?.time_basis).toBe("branch_provisional");
    expect(rows.find((row) => row.payload.order_id === "in-1300")?.time_basis).toBe("branch");
    expect(rows.find((row) => row.payload.order_id === "in-attributed")?.actor_user_id).toBe(
      "user-hina",
    );
    expect(rows.find((row) => row.payload.order_id === "in-1300")?.actor_user_id).toBeNull();
  });

  /**
   * `01-F34`/`01-F45` enforced by the BOUNDARY rather than only by the fold's discipline. An
   * ordering field that never crosses cannot reach a projected value, however `summary.ts` is
   * edited later.
   */
  it("projects NO ordering metadata — global_seq, lamport_seq, device/server clocks", async () => {
    const rows = rowsOf(await window({ org_id: ORG, from_ms: DAY.start_ms, to_ms: DAY.end_ms }));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "actor_user_id",
        "branch_created_at",
        "branch_id",
        "id",
        "payload",
        "time_basis",
        "type",
      ]);
    }
  });
});

// ── §C — scope, and the empty-list trap ────────────────────────────────────────────────────────

describe("§C — 12-F2: the branch filter narrows, and an empty one never widens", () => {
  it("narrows to the named branches", async () => {
    const reply = await window({
      org_id: ORG,
      from_ms: DAY.start_ms,
      to_ms: DAY.end_ms,
      branch_ids: deviceA.branch_id,
    });
    const branches = new Set(rowsOf(reply).map((row) => row.branch_id));
    expect([...branches]).toEqual([deviceA.branch_id]);
    expect(rowsOf(reply).map((row) => row.payload.order_id)).not.toContain("in-branch-b");
  });

  it("accepts several branches", async () => {
    const reply = await window({
      org_id: ORG,
      from_ms: DAY.start_ms,
      to_ms: DAY.end_ms,
      branch_ids: `${deviceA.branch_id},${deviceB.branch_id}`,
    });
    expect(new Set(rowsOf(reply).map((row) => row.branch_id)).size).toBe(2);
  });

  /**
   * **THE WIDENING TRAP.** A `reportScope` narrowing that resolved to nothing must never be read
   * as "no filter" — that is a branch manager silently handed the org roll-up. `01-F60`'s
   * explicit-zero rule, one table over: absence and nothing are different answers.
   */
  it("REFUSES an empty branch_ids rather than reading it as 'every branch'", async () => {
    const reply = await window({
      org_id: ORG,
      from_ms: DAY.start_ms,
      to_ms: DAY.end_ms,
      branch_ids: "",
    });
    expect(reply.status).toBe(400);
    // The control: absent means every branch, and that is a 200 with both branches in it.
    const all = await window({ org_id: ORG, from_ms: DAY.start_ms, to_ms: DAY.end_ms });
    expect(new Set(rowsOf(all).map((row) => row.branch_id)).size).toBe(2);
  });

  it("never crosses orgs", async () => {
    const reply = await window({
      org_id: `${ORG}-other`,
      from_ms: DAY.start_ms,
      to_ms: DAY.end_ms,
    });
    expect(rowsOf(reply)).toHaveLength(0);
  });

  it("refuses a non-numeric window instead of selecting nothing and reporting success", async () => {
    const reply = await window({ org_id: ORG, from_ms: "yesterday", to_ms: DAY.end_ms });
    expect(reply.status).toBe(400);
  });
});

// ── §D — 12-F8 and the honest cap ──────────────────────────────────────────────────────────────

describe("§D — 00 §5.7: the answer describes its own limits", () => {
  it("reports the org's newest arrival, even for a window with no events (12-F8)", async () => {
    const empty = await window({ org_id: ORG, from_ms: 0, to_ms: 1 });
    expect(rowsOf(empty)).toHaveLength(0);
    // A quiet day is not an offline branch, so freshness is an ORG fact rather than a window one.
    expect(empty.body.latest_arrival_ms).toBeGreaterThan(0);
    const none = await window({ org_id: `${ORG}-other`, from_ms: 0, to_ms: 1 });
    expect(none.body.latest_arrival_ms).toBeNull();
  });

  it("reports truncated=false below the cap, and the cap is a declared constant", async () => {
    const reply = await window({ org_id: ORG, from_ms: DAY.start_ms, to_ms: DAY.end_ms });
    expect(reply.body.truncated).toBe(false);
    // Read from the module, never hand-copied — a literal here keeps saying 50 000 after someone
    // changes the constant (`K-3`'s dead-oracle defect).
    expect(ROW_CAP).toBeGreaterThan(rowsOf(reply).length);
  });
});
