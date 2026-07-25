// T-01-18 oracle — revocation eviction latency and fail-closed participation
// (01-F48; DEC-AUTH-002, accepted July 2026). Authored from
// specs/01-kernel-sync.md (01-F48, 01-F25, 01-F42, 01-F27, 01-F47, 01-F17),
// specs/DECISIONS.md (DEC-AUTH-002) and plans/wave-0/t-01-18-auth-hardening.md
// ONLY (24 §3 step 2: read-only to the implementing session).
//
// The read half landed in 9a0c1ff (sec-f1-revoked-fanout.test.ts): revoked
// peers are culled from fan-out. What 01-F48 adds is a LATENCY BOUND — eviction
// within 30 s wherever any path reaches the device — and shipped eviction is
// LAZY: a revoked device holding a live session keeps it until somebody else
// pushes to its branch (gateway.ts's own note: "eviction is LAZY … an eager
// kill would need a revokeDevice→gateway eviction hook"). On a quiet branch at
// night that is unbounded, not 30 s.
//
// ── ORACLE-PINNED SURFACE (binding for the implementing session) ─────────────
//   gateway.sweepRevocations(): Promise<void> — the eviction pass over the
//     gateway's LIVE sessions: every session whose (org, device) registry row
//     is revoked (or unreadable) is purged (purge_command { scope: "all" },
//     01-F42) and dropped from fan-out, without waiting for that device — or
//     any other — to speak. Named so the periodic driver and the tests call the
//     same code; the drive mechanism itself (interval timer, LISTEN/NOTIFY, or
//     an in-process hook fired by revokeDevice) is the implementer's choice as
//     long as the bound below holds and a session cannot survive it.
//   REVOCATION_SWEEP_INTERVAL_MS: number — exported, > 0 and ≤ 30_000. This is
//     the 01-F48 SLA made machine-checkable: the worst case between the
//     revoking transaction and the eviction of a silent live session.
//   Fail-closed: when revocation state cannot be READ, participation is
//     refused — no session opens, no operation is accepted, nothing is
//     persisted. Deliberately CONTRASTED here with 01-F47 expiry, which fails
//     OPEN (an expired-but-unrevoked device is still admitted to drain and
//     renew, because a sale is never blocked — 01-F17). Conflating the two
//     directions is the named trap of this task.
// ─────────────────────────────────────────────────────────────────────────────
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import * as gatewayModule from "../index.js";
import { AuthRejectedError, createGateway, revokeDevice } from "../index.js";
import {
  BASE_T,
  catchupMsg,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  helloMsg,
  type Identity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  recorder,
  registerIdentity,
  TEST_TOKEN_SECRET,
  validEnvelope,
  validEnvelopes,
} from "./helpers.js";

const TOKEN_SECRET = TEST_TOKEN_SECRET;
const DAY_MS = 86_400_000;

/** The 01-F48 eviction pass + its SLA constant (unbuilt: cast, never imported). */
type SweepingGateway = Gateway & { sweepRevocations(): Promise<void> };
const { REVOCATION_SWEEP_INTERVAL_MS } = gatewayModule as unknown as {
  REVOCATION_SWEEP_INTERVAL_MS: number;
};

type IssueOptions = { now?: number; ttl_ms?: number; issuer?: string; audience?: string };
type OracleIssueSurface = {
  issueDeviceToken(
    claims: { org_id: string; branch_id: string; device_id: string; expires_at?: number },
    tokenSecret: string,
    options?: IssueOptions,
  ): Promise<string>;
};
const { issueDeviceToken } = gatewayModule as unknown as OracleIssueSurface;

/**
 * A db whose top-level `execute` fails on demand — the gateway's REGISTRY reads
 * (hello's readRegistryRow, requireUnrevoked, the fan-out cull) all go through
 * it, so flipping the switch is "revocation state cannot be read". Transactions
 * are untouched, so a merge would still be physically possible: the refusal
 * under test is a POLICY refusal, not a dead database.
 */
type Failer = { fail: boolean };
const unreadableRegistryDb = (real: Db, gate: Failer): Db =>
  new Proxy(real as unknown as Record<string | symbol, unknown>, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (prop === "execute") {
        return (...args: unknown[]): unknown => {
          if (gate.fail) {
            return Promise.reject(
              new Error("kernel.device_registry is unreadable (01-F48 fail-closed probe)"),
            );
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as unknown as Db;

let db: Db;
let verify: Db;
let gateway: Gateway;
/** Separate connection + gateway for the fail-closed probe (its db lies). */
let brokenDb: Db;
let brokenGateway: Gateway;
const gate: Failer = { fail: false };

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TOKEN_SECRET } });
  brokenDb = openDb();
  brokenGateway = createGateway({
    db: unreadableRegistryDb(brokenDb, gate),
    clock: makeClock(),
    auth: { token_secret: TOKEN_SECRET },
  });
});

afterAll(async () => {
  gate.fail = false;
  await gateway.close();
  await brokenGateway.close();
  await closeDb(db);
  await closeDb(brokenDb);
  await closeDb(verify);
});

describe("eviction latency (01-F48 / DEC-AUTH-002)", () => {
  it("01-F48: revoking a device drops its LIVE session on the eviction pass — no other device has to push first", async () => {
    const revoked = freshIdentity();
    const bystander: Identity = { ...revoked, device_id: freshIdentity().device_id };

    const victim = await openSession(gateway, revoked);
    const peer = await openSession(gateway, bystander);

    await revokeDevice(db, { org_id: revoked.org_id, device_id: revoked.device_id });
    // The branch is SILENT — nobody pushes, nobody catches up. On the shipped
    // (lazy) gateway nothing whatsoever happens to the revoked session here.
    await (gateway as SweepingGateway).sweepRevocations();

    expect(
      ofKind(victim.rec.all, "purge_command"),
      "the revoked live session is torn down by the sweep itself (01-F42 signal)",
    ).toHaveLength(1);
    expect(
      ofKind(peer.rec.all, "purge_command"),
      "the still-authorized peer is untouched",
    ).toHaveLength(0);

    // And it is really out of fan-out: a later branch event never reaches it.
    await peer.conn.handle(pushMsg(validEnvelopes(bystander, 0, 1)));
    expect(
      ofKind(victim.rec.all, "event_batch"),
      "an evicted device receives no further events (01-F48: revocation blocks READS)",
    ).toHaveLength(0);
    expect(ofKind(peer.rec.all, "event_batch")).toHaveLength(1);

    victim.conn.close();
    peer.conn.close();
  });

  it("01-F48: the eviction pass runs inside the ratified 30 s bound", () => {
    expect(
      REVOCATION_SWEEP_INTERVAL_MS,
      "DEC-AUTH-002 ratifies eviction within 30 s on any reachable path",
    ).toBeGreaterThan(0);
    expect(REVOCATION_SWEEP_INTERVAL_MS).toBeLessThanOrEqual(30_000);
  });

  it("01-F48/01-F25: revocation blocks READS as well as writes — a revoked session's catchup_request is rejected, not served", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 1)));
    const served = ofKind(session.rec.all, "catchup_response").length;

    await revokeDevice(db, { org_id: identity.org_id, device_id: identity.device_id });

    await expect(session.conn.handle(catchupMsg(0))).rejects.toThrow(AuthRejectedError);
    expect(
      ofKind(session.rec.all, "catchup_response"),
      "no event bytes reach a revoked reader",
    ).toHaveLength(served);
    session.conn.close();
  });
});

describe("fail-CLOSED revocation vs fail-OPEN expiry (01-F48 / 01-F47 / 01-F17)", () => {
  it("01-F48: unreadable revocation state REFUSES participation — no session opens, and an open session's push is rejected with nothing persisted", async () => {
    const identity = freshIdentity();
    await registerIdentity(db, identity);
    const token = await issueDeviceToken({ ...identity }, TOKEN_SECRET, { now: BASE_T });

    // A session opened while the registry is readable…
    gate.fail = false;
    const rec = recorder();
    const conn = brokenGateway.connect(rec.sink);
    await conn.handle(helloMsg(identity, { token }));
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(1);
    await conn.handle(pushMsg([validEnvelope(identity, 0)]));
    expect(await eventRows(verify, identity.org_id)).toHaveLength(1);

    // …loses the ability to participate the moment revocation state goes dark.
    gate.fail = true;
    await expect(
      conn.handle(pushMsg([validEnvelope(identity, 1)])),
      "unreadable revocation state must refuse, never assume 'not revoked'",
    ).rejects.toThrow();
    expect(
      await eventRows(verify, identity.org_id),
      "nothing is persisted on a refused push",
    ).toHaveLength(1);
    conn.close();

    // And a fresh hello with a perfectly valid token opens no session either.
    const second = freshIdentity();
    const freshToken = await issueDeviceToken({ ...second }, TOKEN_SECRET, { now: BASE_T });
    const rec2 = recorder();
    const conn2 = brokenGateway.connect(rec2.sink);
    await expect(conn2.handle(helloMsg(second, { token: freshToken }))).rejects.toThrow();
    expect(ofKind(rec2.all, "hello_ack")).toHaveLength(0);
    conn2.close();
    gate.fail = false;
  });

  it("01-F47/01-F17 (the deliberate contrast): EXPIRY fails OPEN — an expired but unrevoked device is still admitted and its backlog still merges, where unreadable revocation state refuses outright", async () => {
    const identity = freshIdentity();
    const expired = await issueDeviceToken(
      { ...identity, expires_at: BASE_T - DAY_MS },
      TOKEN_SECRET,
      { now: BASE_T },
    );

    // Fail-OPEN, in the one direction that matters: the WRITE path. (The read
    // half of that admission is drain-only — pinned in auth-token-lifetime.)
    const session = await openSession(gateway, identity, { token: expired });
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));
    expect(
      must(ofKind(session.rec.all, "push_ack").at(-1), "ack").acked_watermark,
      "expiry withdraws ADMISSION only — the backlog of a device that never stopped selling still merges (01-F17)",
    ).toBe(1);
    expect(await eventRows(verify, identity.org_id)).toHaveLength(2);
    expect(
      ofKind(session.rec.all, "purge_command"),
      "expiry is not revocation: nothing is ever purged for it",
    ).toHaveLength(0);
    session.conn.close();
  });
});
