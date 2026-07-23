// T-01-09 oracle — device registration, real token verification, revocation
// (owning spec 01: 01-F25 registered/class-typed/revocable devices, 01-F27
// server-side validation on every sync operation, 01-F42 revocation & purge,
// 01-F39 class vocabulary; 18 §5 jose device tokens + server-side authority;
// 01 §5 names the cloud `device_registry` table; 01 §7 layer-1 provisioning).
// Authored from those specs + DEC-SYNC-009's open-dependency column ONLY
// (24 §3 step 2: read-only to the implementing session).
//
// plans/wave-0/kernel-tasks.md has NO T-01-09 entry — this surface is DERIVED
// from the specs above and the seams the landed tasks left for T-01-09
// (T-01-07 session contract: "T-01-09 swaps the seam's internals for jose
// verification + device-registry/revocation checks with the same claims
// contract"; T-01-07: "purge_command is never emitted at Wave 0 (revocation is
// T-01-09+)"). The oracle report carries the derivation + ratification items.
//
// RED-AWAITING-IMPLEMENTATION: @restos/sync-gateway exports no registerDevice/
// revokeDevice/issueDeviceToken (structural-cast idiom below keeps typecheck
// green; calls fail "not a function"), and the shipped verifyDeviceToken still
// accepts the unsigned Wave-0 dev-token shape — the stub boundary this task
// retires.
//
// ── ORACLE-PINNED AUTH SURFACE (binding for the implementing session) ────────
//   createGateway({ db, clock, auth }): Gateway — `auth: { token_secret }` is a
//     REQUIRED new option: the device-token verification key (jose, 18 §5 —
//     registry-listed §14). server.ts wires it from env via the packages/config
//     factory. The old two-field call shape is retired WITH the dev token; the
//     compiler enumerates the suite call sites for the migration round (see
//     oracle report — existing suites are re-grounded by enumeration, T-01-15
//     precedent, and stay untouched until then).
//   issueDeviceToken(claims, token_secret): Promise<string> — claims are the
//     SAME contract the dev-token stub carried (T-01-07 assumption 7 / T-01-12
//     pinned relay surface): { org_id, branch_id, device_id,
//     hub_relay?: boolean, expires_at?: number (epoch ms) }. Wave-0 issuance
//     seam; the pairing-code provisioning UX is doc 14/15.
//   registerDevice(db, { org_id, branch_id, device_id, device_class }):
//     Promise<void> — layer-1 provisioning seam (01 §7). device_class must be a
//     DEVICE_CLASSES member (01-F39): unknown class throws, nothing written.
//   revokeDevice(db, { org_id, device_id }): Promise<void>.
//   kernel.device_registry (01 §5): at least { org_id, branch_id, device_id,
//     device_class, revoked_at: bigint | null }, PK-unique on (org_id,
//     device_id). revoked_at null ⇔ active; revocation sets it and deletes
//     nothing (registry rows are provisioning bookkeeping, not event history —
//     01-F1 reaches the ledger only; time source implementer-proposed).
//   hello law (01-F25/01-F27): the token must verify under token_secret
//     (signature + expiry against the INJECTED clock, 18 §4), its claims must
//     match hello.device_id/branch_id (the T-01-07 consistency law carries
//     over), AND (org_id, device_id) must resolve to an UNREVOKED registry row
//     whose branch_id equals the claimed branch — the registry, never the
//     token or the hello, is the authority (18 §5). Any miss →
//     AuthRejectedError, no session. The unsigned base64url dev-token shape is
//     RETIRED: it no longer opens a session for anyone.
//   revocation law (01-F25/01-F27/01-F42): a revoked device's next hello gets
//     purge_command { scope: "all" } through the sink and NO session
//     (AuthRejectedError) — re-sent on EVERY hello while revoked (no purge-ack
//     wire kind exists; PROTOCOL.md's "acks" clause is flagged in the report).
//     On an ALREADY-OPEN session, every operation after revocation (push,
//     catchup_request) → AuthRejectedError with nothing persisted and NO
//     quarantine row: session-level de-authorization is a rejection, not an
//     event quarantine (derived ruling on 01-F37's authorization clause — the
//     quarantine machinery incl. slot-fill exists for a legitimate device's
//     outbox; a revoked principal has none, 01-F42 wipe/re-register).
// ─────────────────────────────────────────────────────────────────────────────
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import * as gatewayModule from "../index.js";
import { AuthRejectedError, createGateway } from "../index.js";
import {
  BASE_T,
  catchupMsg,
  closeDb,
  type Db,
  devToken,
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
  quarantineRows,
  recorder,
  storedWatermark,
  type TestClock,
  validEnvelope,
  validEnvelopes,
} from "./helpers.js";

/** ≥ 32 bytes — the Wave-0 symmetric verification key (asymmetric split is a named follow-up). */
const TOKEN_SECRET = "t-01-09-oracle-device-token-secret-0123456789abcdef0123456789abcd";
const OTHER_SECRET = "t-01-09-oracle-WRONG-token-secret-fedcba9876543210fedcba9876543210";

type TokenClaims = {
  org_id: string;
  branch_id: string;
  device_id: string;
  hub_relay?: boolean;
  expires_at?: number;
};
type DeviceRegistration = {
  org_id: string;
  branch_id: string;
  device_id: string;
  device_class: string;
};
type OracleAuthSurface = {
  registerDevice(db: Db, registration: DeviceRegistration): Promise<void>;
  revokeDevice(db: Db, target: { org_id: string; device_id: string }): Promise<void>;
  issueDeviceToken(claims: TokenClaims, tokenSecret: string): Promise<string>;
};
const { registerDevice, revokeDevice, issueDeviceToken } =
  gatewayModule as unknown as OracleAuthSurface;

/** createGateway with the pinned REQUIRED auth option (cast until the option lands). */
const createGatewayWithAuth = createGateway as unknown as (options: {
  db: Db;
  clock: { now(): number };
  auth: { token_secret: string };
}) => Gateway;

const registerCounter = (db: Db, identity: Identity): Promise<void> =>
  registerDevice(db, { ...identity, device_class: "counter_electron" });

let db: Db;
let verify: Db;
let clock: TestClock;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  clock = makeClock();
  gateway = createGatewayWithAuth({ db, clock, auth: { token_secret: TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("registration lifecycle (01-F25 / 01-F27)", () => {
  it("01-F25/01-F27: registered device + issued token → session opens, pushes merge, reconnect resumes past the ack", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity);
    const token = await issueDeviceToken({ ...identity }, TOKEN_SECRET);

    const first = await openSession(gateway, identity, { token });
    expect(first.helloAck.hub).toBe(false);
    expect(first.helloAck.resume_from).toBe(0);

    await first.conn.handle(pushMsg(validEnvelopes(identity, 0, 3)));
    expect(must(ofKind(first.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(2);
    expect(await eventRows(verify, identity.org_id)).toHaveLength(3);
    first.conn.close();

    const second = await openSession(gateway, identity, { token });
    expect(second.helloAck.resume_from).toBe(3);
    second.conn.close();
  });

  it("01-F25: an UNREGISTERED device is rejected even with a validly-signed token — the registry, not the signature, is the authority (18 §5)", async () => {
    const identity = freshIdentity(); // never registered
    const token = await issueDeviceToken({ ...identity }, TOKEN_SECRET);
    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
    expect(ofKind(rec.all, "purge_command")).toHaveLength(0); // unregistered ≠ revoked: no purge
    conn.close();
    expect(await eventRows(verify, identity.org_id)).toHaveLength(0);
  });

  it("01-F27: the unsigned Wave-0 dev-token shape is RETIRED — rejected even for a registered device (the T-01-07 stub boundary this task exists to close)", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity);
    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await expect(conn.handle(helloMsg(identity, { token: devToken(identity) }))).rejects.toThrow(
      AuthRejectedError,
    );
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
    conn.close();
  });

  it("01-F27/18 §5: tampered and wrong-key tokens → AuthRejectedError (the signature is actually verified)", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity);

    const tampered = `${await issueDeviceToken({ ...identity }, TOKEN_SECRET)}x`;
    const wrongKey = await issueDeviceToken({ ...identity }, OTHER_SECRET);
    for (const token of [tampered, wrongKey]) {
      const rec = recorder();
      const conn = gateway.connect(rec.sink);
      await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
      expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
      conn.close();
    }
  });

  it("01-F27/18 §4: expiry is enforced against the INJECTED clock — expires_at ≤ clock.now() rejects; a token expiring 60s past the injected now (long past for wall clock) is accepted", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity);

    const expired = await issueDeviceToken({ ...identity, expires_at: BASE_T - 1 }, TOKEN_SECRET);
    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await expect(conn.handle(helloMsg(identity, { token: expired }))).rejects.toThrow(
      AuthRejectedError,
    );
    conn.close();

    // BASE_T is ~July 2025: wall-clock "now" is far beyond BASE_T + 60s, so this
    // leg passes ONLY if expiry is measured against the injected clock (18 §4).
    const shortLived = await issueDeviceToken(
      { ...identity, expires_at: BASE_T + 60_000 },
      TOKEN_SECRET,
    );
    const session = await openSession(gateway, identity, { token: shortLived });
    expect(session.helloAck.resume_from).toBe(0);
    session.conn.close();
  });

  it("01-F25/18 §5: registry branch is authoritative — a device registered on branch A helloing (self-consistently) into branch B is rejected", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity); // registry: branch A = identity.branch_id
    const otherBranch = freshIdentity().branch_id;
    const claimed: Identity = { ...identity, branch_id: otherBranch };
    const token = await issueDeviceToken({ ...claimed }, TOKEN_SECRET); // claims == hello — consistent
    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await expect(conn.handle(helloMsg(claimed, { token }))).rejects.toThrow(AuthRejectedError);
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
    conn.close();
  });
});

describe("revocation & purge (01-F25 / 01-F42 / 01-F27)", () => {
  it("01-F42/01-F25: a revoked device's next hello → purge_command { scope: 'all' } and NO session; re-sent on every hello while revoked (no purge-ack wire kind exists)", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity);
    const token = await issueDeviceToken({ ...identity }, TOKEN_SECRET);
    await revokeDevice(db, { org_id: identity.org_id, device_id: identity.device_id });

    for (let contact = 0; contact < 2; contact += 1) {
      const rec = recorder();
      const conn = gateway.connect(rec.sink);
      await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
      const purges = ofKind(rec.all, "purge_command");
      expect(purges).toHaveLength(1);
      expect(must(purges[0], "purge_command").scope).toBe("all");
      expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
      conn.close();
    }
  });

  it("01-F25/01-F27: revocation binds on the NEXT operation of an already-open session — push and catchup_request are rejected, nothing persisted, watermark unmoved, NO quarantine row (rejection, not quarantine)", async () => {
    const identity = freshIdentity();
    await registerCounter(db, identity);
    const token = await issueDeviceToken({ ...identity }, TOKEN_SECRET);
    const session = await openSession(gateway, identity, { token });
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 3)));
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);

    await revokeDevice(db, { org_id: identity.org_id, device_id: identity.device_id });

    await expect(session.conn.handle(pushMsg([validEnvelope(identity, 3)]))).rejects.toThrow(
      AuthRejectedError,
    );
    await expect(session.conn.handle(catchupMsg(0))).rejects.toThrow(AuthRejectedError);
    session.conn.close();

    expect(await eventRows(verify, identity.org_id)).toHaveLength(3); // pre-revocation events remain (01-F1)
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
  });
});

describe("registry vocabulary & data contract (01-F39 / 01 §5)", () => {
  it("01-F39: registerDevice rejects a class outside DEVICE_CLASSES — unknown class throws, nothing written", async () => {
    const identity = freshIdentity();
    await expect(
      registerDevice(db, { ...identity, device_class: "smart_fridge" }),
    ).rejects.toThrow();
    const rows = await verify.execute(
      sql`select device_id from kernel.device_registry
          where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
    );
    expect([...rows]).toHaveLength(0);
  });

  it("01 §5/01-F25: kernel.device_registry holds the row (branch, class, revoked_at null); revokeDevice sets revoked_at and deletes nothing", async () => {
    const identity = freshIdentity();
    await registerDevice(db, { ...identity, device_class: "waiter" });

    const read = async (): Promise<Record<string, unknown>> => {
      const rows = await verify.execute(
        sql`select org_id, branch_id, device_id, device_class, revoked_at
            from kernel.device_registry
            where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
      );
      return must([...rows][0], "device_registry row");
    };

    const active = await read();
    expect(active.branch_id).toBe(identity.branch_id);
    expect(active.device_class).toBe("waiter");
    expect(active.revoked_at).toBeNull();

    await revokeDevice(db, { org_id: identity.org_id, device_id: identity.device_id });
    const revoked = await read();
    expect(revoked.revoked_at).not.toBeNull();
    expect(revoked.device_class).toBe("waiter"); // row intact — revocation is a flag, not a delete
  });
});

describe("carried-over rejections (green pins — must survive the seam swap)", () => {
  it("01-F27: garbage tokens are rejected with no session — before AND after the jose swap (the outcome, not the mechanism, is the pin)", async () => {
    const identity = freshIdentity();
    const badTokens = [
      "not-a-token-at-all",
      Buffer.from("just a string").toString("base64url"),
      "a.b", // not a signable compact form under any scheme
    ];
    for (const token of badTokens) {
      const rec = recorder();
      const conn = gateway.connect(rec.sink);
      await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
      expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
      conn.close();
    }
  });
});
