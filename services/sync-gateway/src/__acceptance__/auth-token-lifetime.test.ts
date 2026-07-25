// T-01-18 oracle — device-token lifetime, deployment binding and silent
// renewal (01-F47; DEC-AUTH-001, accepted July 2026). Authored from
// specs/01-kernel-sync.md (01-F47, 01-F42, 01-F25, 01-F27, 01-F17, 01-F13,
// 01-F11), specs/DECISIONS.md (DEC-AUTH-001, DEC-SYNC-009) and
// plans/wave-0/t-01-18-auth-hardening.md ONLY (24 §3 step 2: read-only to the
// implementing session). Re-pinned after the coordinator's rulings 1–3.
//
// RED-AWAITING-IMPLEMENTATION: the shipped mint stamps no expiry unless the
// caller supplies one and ignores issuer/audience entirely; the gateway never
// renews, admits unexpiring tokens, and rejects every expired token outright.
// Each red below is a missing behaviour, never a typo — the structural-cast
// idiom (T-01-09 precedent) keeps typecheck green while the surface is unbuilt.
//
// ── ORACLE-PINNED SURFACE (binding for the implementing session) ─────────────
//   issueDeviceToken(claims, tokenSecret, options?) — `options` is NEW:
//     { now?: number; ttl_ms?: number; issuer?: string; audience?: string }.
//     `now` is the INJECTED issuance-seam time (18 §4 — never Date.now()).
//     Minted `expires_at` = claims.expires_at ?? now + (ttl_ms ?? 90 days); a
//     mint given NEITHER has no way to stamp one and must REFUSE.
//     issuer/audience ride as the STANDARD `iss`/`aud` claims — safe, unlike
//     `exp`, because jose compares them by value and never against a wall clock.
//     Issuance stays DETERMINISTIC: no iat/jti/exp is stamped, so identical
//     claims + secret + options yield identical bytes (golden fixtures depend
//     on this, and so does the injected-clock law).
//   RULING 3 — expiry binds at ADMISSION, not only at issuance: a token
//     carrying no `expires_at` opens no session anywhere. Otherwise a stolen
//     pre-change token stays valid forever and DEC-AUTH-001 buys nothing.
//     helpers.signedToken now stamps the 90-day default so the landed suites
//     keep passing on a bound token (the only helper change this task makes).
//   createGateway({ db, clock, auth }) — `auth` gains, all OPTIONAL:
//     { issuer?; audience?; ttl_ms?; renew_below_ms? } beside token_secret.
//     • issuer/audience: enforced at verification only when CONFIGURED — the
//       landed suites configure neither; unconditional binding reddens them.
//     • ttl_ms: the life a RENEWED token is minted with (default 90 days).
//     • renew_below_ms: the renewal threshold — injectable so tests can drive
//       it (the trap: renewing on every hello destroys issuance determinism).
//   hello_ack gains an OPTIONAL `renewed_token: string`; push_ack gains the
//     same field — both additive under v: 1, the relay_authorized precedent
//     (T-01-12). ABSENT unless a renewal was actually minted, so ordinary
//     sessions stay byte-identical. Until @restos/sync-protocol carries the
//     fields, parseMessage strips them and these tests stay red.
//   RULING 1, as AMENDED (01-F47, July 2026) — an expired-but-unrevoked device
//     is admitted in DRAIN mode, the "sole purpose" clause made operative. Push
//     only: catch-up, fan-out and every other READ are refused on that
//     connection, because reads are where customer data leaks (00 §5.4) and a
//     credential the cloud no longer fully trusts must not read — the same
//     instinct as the revoked-reader fix (9a0c1ff). Draining is cleared by the
//     device's drain PUSH, not by holding a renewal.
//     The renewal itself MAY ride hello_ack, and does. This oracle first pinned
//     the opposite — renewal earned only by pushing — and journey J1/B1
//     (journey-b1-renewal.test.ts) proved that a PERMANENT WEDGE: a device
//     offline across its whole renewal window returns with an EMPTY OUTBOX, so
//     it has no push to make, no push_ack, no renewal, and its catch-up is
//     refused — forever, identically on every reconnect. Expiry would then block
//     a device outright (01-F17 forbids it) and strand a branch when the wedged
//     device is the hub. "Sole purpose" constrains what the session may DO, not
//     which message the credential arrives on: the renewal changes the NEXT
//     connection while drain mode stays observable on this one.
//     The device keeps selling and persisting locally throughout (01-F17).
//   RULING 2 — hub-relayed renewal is REGISTRY-side. kernel.device_registry
//     gains `token_expires_at` (nullable bigint, epoch ms), written at mint and
//     at renewal — the single writer. The cloud judges a WAN-less ORIGIN's
//     remaining life from that column (it never sees that device's token) and
//     puts the renewal on the relayed `push_ack`, which already names its
//     origin via origin_device_id, so the hub forwards it over LAN. No
//     credential of a peer ever travels through the hub (18 §5: the registry,
//     never the token or the hello, decides).
//     A device that presents its OWN token at hello is still judged on THAT
//     token — it is the credential in use; the column is the cloud's record of
//     what it last issued.
//   Renewal is REGISTRY-gated, never signature-gated: a revoked device is never
//     renewed (01-F42 wins), and a renewed token never carries a capability the
//     registry no longer supports (01-F39/DEC-SYNC-009).
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import * as gatewayModule from "../index.js";
import { AuthRejectedError, createGateway, GatewayError } from "../index.js";
import {
  BASE_T,
  catchupMsg,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  helloMsg,
  type Identity,
  type MessageOfKind,
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

/** Deployment binding (01-F47): this cloud's identity, and another cloud's. */
const ISSUER = "https://sync.restos.test/deployment-a";
const AUDIENCE = "restos-devices-a";
const OTHER_ISSUER = "https://sync.restos.test/deployment-b";
const OTHER_AUDIENCE = "restos-devices-b";

const DAY_MS = 86_400_000;
/** DEC-AUTH-001's ratified default lifetime. */
const NINETY_DAYS_MS = 90 * DAY_MS;

type TokenClaims = {
  org_id: string;
  branch_id: string;
  device_id: string;
  hub_relay?: boolean;
  expires_at?: number;
};
type IssueOptions = {
  now?: number;
  ttl_ms?: number;
  issuer?: string;
  audience?: string;
};
type AuthConfig = {
  token_secret: string;
  issuer?: string;
  audience?: string;
  ttl_ms?: number;
  renew_below_ms?: number;
};
type OracleIssueSurface = {
  issueDeviceToken(
    claims: TokenClaims,
    tokenSecret: string,
    options?: IssueOptions,
  ): Promise<string>;
};
const { issueDeviceToken } = gatewayModule as unknown as OracleIssueSurface;

const createGatewayWithAuth = createGateway as unknown as (options: {
  db: Db;
  clock: { now(): number };
  auth: AuthConfig;
}) => Gateway;

/** hello_ack / push_ack as 01-F47 extends them (additive optional, v: 1). */
type RenewableHelloAck = MessageOfKind<"hello_ack"> & { renewed_token?: string };
type RenewablePushAck = MessageOfKind<"push_ack"> & { renewed_token?: string };

/** The compact-JWS payload, decoded — the mint's own claim shape is the pin. */
const payloadOf = (token: string): Record<string, unknown> => {
  const part = token.split(".")[1];
  if (part === undefined) throw new Error(`not a compact JWS: ${token}`);
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
};

/** A correctly-bound token whose remaining life at BASE_T is `remainingMs`. */
const tokenWithLife = (
  identity: Identity,
  remainingMs: number,
  extra: { hub_relay?: boolean } = {},
): Promise<string> =>
  issueDeviceToken({ ...identity, ...extra, expires_at: BASE_T + remainingMs }, TOKEN_SECRET, {
    now: BASE_T,
    issuer: ISSUER,
    audience: AUDIENCE,
  });

/**
 * A correctly-signed, correctly-bound token carrying NO expires_at — the shape
 * the mint can no longer produce (ruling 3) but an attacker holding a
 * pre-change token still has. Hand-rolled for exactly that reason.
 */
const unexpiringToken = (identity: Identity): string => {
  const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = b64({ alg: "HS256" });
  const payload = b64({ ...identity, iss: ISSUER, aud: AUDIENCE });
  const signature = createHmac("sha256", TOKEN_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
};

/** The cloud's record of the token it last issued (ruling 2). */
const setRegistryExpiry = async (db: Db, identity: Identity, expiresAt: number): Promise<void> => {
  await db.execute(
    sql`update kernel.device_registry set token_expires_at = ${expiresAt}
        where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
  );
};

const registryExpiry = async (db: Db, identity: Identity): Promise<number | null> => {
  const rows = await db.execute(
    sql`select token_expires_at from kernel.device_registry
        where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
  );
  const row = must([...rows][0], "device_registry row");
  return row.token_expires_at === null ? null : Number(row.token_expires_at);
};

let db: Db;
let verify: Db;
/** Default threshold + default TTL, bound to this deployment. */
let gateway: Gateway;
/** renew_below_ms = 2 days — nothing with weeks of life left may renew. */
let narrowGateway: Gateway;
/** renew_below_ms = 30 days — the same token renews here. */
let wideGateway: Gateway;
/** Clock rewound 30 days: a device whose cloud clock went backwards. */
let rewoundGateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  const clock = makeClock();
  const auth: AuthConfig = { token_secret: TOKEN_SECRET, issuer: ISSUER, audience: AUDIENCE };
  gateway = createGatewayWithAuth({ db, clock, auth });
  narrowGateway = createGatewayWithAuth({
    db,
    clock,
    auth: { ...auth, renew_below_ms: 2 * DAY_MS },
  });
  wideGateway = createGatewayWithAuth({
    db,
    clock,
    auth: { ...auth, renew_below_ms: 30 * DAY_MS },
  });
  rewoundGateway = createGatewayWithAuth({
    db,
    clock: makeClock(BASE_T - 30 * DAY_MS),
    auth: { ...auth, renew_below_ms: 30 * DAY_MS },
  });
});

afterAll(async () => {
  await Promise.all([
    gateway.close(),
    narrowGateway.close(),
    wideGateway.close(),
    rewoundGateway.close(),
  ]);
  await closeDb(db);
  await closeDb(verify);
});

describe("issuance — mandatory expiry, determinism (01-F47 / DEC-AUTH-001)", () => {
  it("01-F47: the mint stamps a MANDATORY expiry — 90 days from the injected issuance time by default; ttl_ms narrows it; an explicit expires_at wins", async () => {
    const identity = freshIdentity();

    const defaulted = payloadOf(
      await issueDeviceToken({ ...identity }, TOKEN_SECRET, { now: BASE_T }),
    );
    expect(defaulted.expires_at, "default lifetime is 90 days (DEC-AUTH-001)").toBe(
      BASE_T + NINETY_DAYS_MS,
    );

    const shortTtl = payloadOf(
      await issueDeviceToken({ ...identity }, TOKEN_SECRET, { now: BASE_T, ttl_ms: 7 * DAY_MS }),
    );
    expect(shortTtl.expires_at).toBe(BASE_T + 7 * DAY_MS);

    const explicit = payloadOf(
      await issueDeviceToken({ ...identity, expires_at: BASE_T + 5 }, TOKEN_SECRET, {
        now: BASE_T,
      }),
    );
    expect(explicit.expires_at, "an explicit expiry is honoured verbatim").toBe(BASE_T + 5);
  });

  it("01-F47/18 §4: a mint with NEITHER an explicit expiry NOR an injected issuance time is REFUSED — the API cannot produce an unexpiring token", async () => {
    await expect(issueDeviceToken({ ...freshIdentity() }, TOKEN_SECRET)).rejects.toThrow();
  });

  it("01-F47 (ruling 3): expiry binds at ADMISSION — a signature-valid, correctly-bound token carrying NO expires_at opens no session", async () => {
    const identity = freshIdentity();
    await registerIdentity(db, identity);
    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await expect(
      conn.handle(helloMsg(identity, { token: unexpiringToken(identity) })),
      "an unexpiring credential is exactly what DEC-AUTH-001 exists to end",
    ).rejects.toThrow(AuthRejectedError);
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
    conn.close();
  });

  it("01-F47/18 §4 (TRAP PIN, green): issuance stays DETERMINISTIC and stamps no standard exp/iat/jti — identical inputs, identical bytes", async () => {
    const identity = freshIdentity();
    const options: IssueOptions = { now: BASE_T, issuer: ISSUER, audience: AUDIENCE };

    const first = await issueDeviceToken({ ...identity }, TOKEN_SECRET, options);
    const second = await issueDeviceToken({ ...identity }, TOKEN_SECRET, options);
    expect(second, "the golden fixtures depend on byte-identical re-issuance").toBe(first);

    const payload = payloadOf(first);
    // `exp` specifically would be validated by jose against the WALL clock and
    // silently defeat the injected-clock law (18 §4) — expiry rides as the
    // custom `expires_at` claim, enforced by the gateway.
    expect(payload.exp, "expiry must never ride as the standard exp claim").toBeUndefined();
    expect(payload.iat).toBeUndefined();
    expect(payload.jti).toBeUndefined();
  });
});

describe("deployment binding — iss/aud (01-F47 / DEC-AUTH-001)", () => {
  it("01-F47: a signature-valid token minted for ANOTHER deployment (wrong issuer, or wrong audience) opens NO session", async () => {
    const wrongIssuer = freshIdentity();
    const wrongAudience = freshIdentity();
    const cases: [Identity, IssueOptions][] = [
      [wrongIssuer, { now: BASE_T, issuer: OTHER_ISSUER, audience: AUDIENCE }],
      [wrongAudience, { now: BASE_T, issuer: ISSUER, audience: OTHER_AUDIENCE }],
    ];

    for (const [identity, options] of cases) {
      await registerIdentity(db, identity);
      const token = await issueDeviceToken({ ...identity }, TOKEN_SECRET, options);
      const rec = recorder();
      const conn = gateway.connect(rec.sink);
      await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
      expect(
        ofKind(rec.all, "hello_ack"),
        "no session for another deployment's token",
      ).toHaveLength(0);
      conn.close();
    }
  });

  it("01-F47 (green guard): a correctly-bound token still opens a session — binding rejects the mismatched only", async () => {
    const identity = freshIdentity();
    const token = await tokenWithLife(identity, 60 * DAY_MS);
    const session = await openSession(gateway, identity, { token });
    expect(session.helloAck.resume_from).toBe(0);
    session.conn.close();
  });
});

describe("silent renewal (01-F47 / DEC-AUTH-001)", () => {
  it("01-F47: below the renewal threshold, hello_ack carries a renewed token — same identity, fresh 90-day life, recorded in the registry, and it opens a session on its own", async () => {
    const identity = freshIdentity();
    const token = await tokenWithLife(identity, 5 * DAY_MS); // threshold here is 30 days
    const session = await openSession(wideGateway, identity, { token });

    const renewed = must(
      (session.helloAck as RenewableHelloAck).renewed_token,
      "hello_ack.renewed_token below the renewal threshold",
    );
    const payload = payloadOf(renewed);
    expect(payload.org_id).toBe(identity.org_id);
    expect(payload.branch_id).toBe(identity.branch_id);
    expect(payload.device_id).toBe(identity.device_id);
    expect(payload.iss, "the renewal is bound to THIS deployment").toBe(ISSUER);
    expect(payload.aud).toBe(AUDIENCE);
    expect(payload.expires_at, "renewed from the INJECTED clock, default 90-day TTL").toBe(
      BASE_T + NINETY_DAYS_MS,
    );
    expect(payload.exp, "still never the standard exp claim (18 §4)").toBeUndefined();
    session.conn.close();

    // Ruling 2's single writer: the cloud records what it just issued, so the
    // relay path can judge this device's life without ever seeing its token.
    expect(
      await registryExpiry(verify, identity),
      "kernel.device_registry.token_expires_at is written at renewal",
    ).toBe(BASE_T + NINETY_DAYS_MS);

    // The renewal is a real credential: it opens a session by itself, and is
    // itself far enough from expiry that it triggers no further renewal.
    const next = await openSession(wideGateway, identity, { token: renewed });
    expect((next.helloAck as RenewableHelloAck).renewed_token).toBeUndefined();
    next.conn.close();
  });

  it("01-F47 (TRAP PIN): ample remaining life gets NO renewed_token — renewing on every hello would destroy issuance determinism", async () => {
    const identity = freshIdentity();
    const token = await tokenWithLife(identity, 80 * DAY_MS); // threshold here is 2 days
    const session = await openSession(narrowGateway, identity, { token });
    expect(
      (session.helloAck as RenewableHelloAck).renewed_token,
      "a healthy token is never re-minted",
    ).toBeUndefined();
    session.conn.close();
  });

  it("01-F47: the renewal threshold is INJECTABLE — one token, two thresholds, two outcomes", async () => {
    const identity = freshIdentity();
    const token = await tokenWithLife(identity, 5 * DAY_MS);

    const narrow = await openSession(narrowGateway, identity, { token });
    expect((narrow.helloAck as RenewableHelloAck).renewed_token).toBeUndefined();
    narrow.conn.close();

    const wide = await openSession(wideGateway, identity, { token });
    expect((wide.helloAck as RenewableHelloAck).renewed_token).toBeDefined();
    wide.conn.close();
  });

  it("01-F47/01-F11: with the DEFAULT threshold a token in the last tenth of its life renews; one with 90% of its life left does not", async () => {
    const low = freshIdentity();
    const healthy = freshIdentity();

    const lowSession = await openSession(gateway, low, {
      token: await tokenWithLife(low, 9 * DAY_MS), // 10% of a 90-day life
    });
    expect(
      (lowSession.helloAck as RenewableHelloAck).renewed_token,
      "a device inside the low-life band renews on contact",
    ).toBeDefined();
    lowSession.conn.close();

    const healthySession = await openSession(gateway, healthy, {
      token: await tokenWithLife(healthy, 81 * DAY_MS), // 90% remaining
    });
    expect((healthySession.helloAck as RenewableHelloAck).renewed_token).toBeUndefined();
    healthySession.conn.close();
  });

  it("01-F47/01-F42/01-F25 (TRAP PIN): a REVOKED device is never renewed — the registry decides, not the signature", async () => {
    const identity = freshIdentity();
    await registerIdentity(db, identity);
    const token = await tokenWithLife(identity, 5 * DAY_MS); // would renew if unrevoked
    await gatewayModule.revokeDevice(db, {
      org_id: identity.org_id,
      device_id: identity.device_id,
    });

    const rec = recorder();
    const conn = wideGateway.connect(rec.sink);
    await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
    expect(must(ofKind(rec.all, "purge_command")[0], "purge_command").scope).toBe("all");
    expect(
      rec.all.every((m) => (m as { renewed_token?: string }).renewed_token === undefined),
      "no message on a revoked contact carries a renewal",
    ).toBe(true);
    conn.close();
  });

  it("01-F47/DEC-SYNC-009 (adversarial): renewal is not privilege escalation — a renewed token never gains the hub_relay the original lacked", async () => {
    const identity = freshIdentity();
    await registerIdentity(db, identity, "counter_electron"); // hub-ELIGIBLE by class
    const token = await tokenWithLife(identity, 5 * DAY_MS); // but no hub_relay claim
    const session = await openSession(wideGateway, identity, { token });
    expect(session.helloAck.relay_authorized).toBeUndefined();

    const renewed = must(
      (session.helloAck as RenewableHelloAck).renewed_token,
      "renewed_token below threshold",
    );
    expect(
      payloadOf(renewed).hub_relay,
      "the renewal carries no capability upgrade",
    ).toBeUndefined();
    session.conn.close();

    const next = await openSession(wideGateway, identity, { token: renewed });
    expect(
      next.helloAck.relay_authorized,
      "and it still opens a non-relay session",
    ).toBeUndefined();
    next.conn.close();
  });

  it("01-F47/01-F39 (adversarial): a registry class change that removes hub eligibility is not survived by the renewal", async () => {
    const identity = freshIdentity();
    await registerIdentity(db, identity, "counter_electron");
    const token = await tokenWithLife(identity, 5 * DAY_MS, { hub_relay: true });

    // The device is re-classed to a NON hub-eligible class (01-F13 eligibility
    // is counter_electron > counter_rn > kitchen; `waiter` is not eligible).
    await db.execute(
      sql`update kernel.device_registry set device_class = 'waiter'
          where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
    );

    const session = await openSession(wideGateway, identity, { token });
    expect(session.helloAck.relay_authorized, "the registry vetoes the claim").toBeUndefined();
    const renewed = must(
      (session.helloAck as RenewableHelloAck).renewed_token,
      "renewed_token below threshold",
    );
    expect(
      payloadOf(renewed).hub_relay,
      "the renewal must not re-issue a capability the registry withdrew",
    ).toBeUndefined();
    session.conn.close();
  });
});

describe("drain-only admission for an expired credential (01-F47 ruling 1 / 01-F17 / 00 §5.4)", () => {
  it("01-F47/01-F17: an EXPIRED but unrevoked device is admitted for PUSH — its backlog merges and the drain push's ack carries the renewal", async () => {
    const identity = freshIdentity();
    const expired = await tokenWithLife(identity, -1 * DAY_MS); // expired a day ago
    const session = await openSession(gateway, identity, { token: expired });

    // T-01-18 re-pin (01-F47 AMENDED July 2026, after journey J1/B1 proved the
    // empty-backlog wedge: a device whose outbox is empty has no push to make,
    // so a renewal that can ONLY be earned by pushing never arrives and expiry
    // blocks the device outright — which 01-F17 forbids, and which strands a
    // whole branch when the wedged device is the hub). The renewal MAY ride
    // hello_ack; "sole purpose" constrains what the session may DO, not which
    // message the credential arrives on. So the pin is no longer the absence of
    // a field — it is that the credential arrives AND the session is still
    // drain-only on this connection.
    const helloRenewal = must(
      (session.helloAck as RenewableHelloAck).renewed_token,
      "hello_ack.renewed_token — an expired credential must always have a path to renewal (01-F47/01-F17)",
    );
    expect(payloadOf(helloRenewal).device_id).toBe(identity.device_id);
    expect(payloadOf(helloRenewal).expires_at).toBe(BASE_T + NINETY_DAYS_MS);
    // …and it did NOT promote this session: reads are still refused here.
    await expect(
      session.conn.handle(catchupMsg(0)),
      "the renewal changes the NEXT connection; this one stays drain-only",
    ).rejects.toThrow(/expired|drain/i);
    expect(ofKind(session.rec.all, "catchup_response")).toHaveLength(0);

    // Admitted: the backlog it accumulated while offline reaches the merged log
    // — a sale is never blocked and never lost (01-F17).
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 3)));
    const ack = must(ofKind(session.rec.all, "push_ack").at(-1), "drain ack") as RenewablePushAck;
    expect(ack.acked_watermark).toBe(2);
    expect(await eventRows(verify, identity.org_id)).toHaveLength(3);

    const renewed = must(
      ack.renewed_token,
      "push_ack.renewed_token — the drain session's whole second purpose (01-F47)",
    );
    expect(payloadOf(renewed).device_id).toBe(identity.device_id);
    expect(payloadOf(renewed).expires_at).toBe(BASE_T + NINETY_DAYS_MS);
    expect(await registryExpiry(verify, identity)).toBe(BASE_T + NINETY_DAYS_MS);
    session.conn.close();

    const next = await openSession(gateway, identity, { token: renewed });
    expect(next.helloAck.resume_from, "and it resumes past its drained backlog").toBe(3);
    next.conn.close();
  });

  // Wording re-grounded to the 01-F47 amendment: holding the renewal is NOT
  // what makes a session normal (it now arrives on hello_ack). Draining is
  // cleared by the drain PUSH — the session's declared purpose being served.
  // Every assertion below is unchanged.
  it("01-F47 ruling 1/00 §5.4: a drain session READS nothing on the connection it was admitted on — no catch-up, no fan-out — and reads resume on that SAME session once its drain push clears it", async () => {
    const branch = freshIdentity();
    const draining: Identity = { ...branch, device_id: freshIdentity().device_id };
    const peer: Identity = { ...branch, device_id: freshIdentity().device_id };

    const peerSession = await openSession(gateway, peer, {
      token: await tokenWithLife(peer, 60 * DAY_MS),
    });
    const drain = await openSession(gateway, draining, {
      token: await tokenWithLife(draining, -1 * DAY_MS),
    });

    // DRAIN-MODE READ 1 — fan-out: a healthy peer's push must not reach it.
    await peerSession.conn.handle(pushMsg(validEnvelopes(peer, 0, 1)));
    expect(
      ofKind(drain.rec.all, "event_batch"),
      "a drain session receives no branch fan-out (00 §5.4: reads are where data leaks)",
    ).toHaveLength(0);

    // DRAIN-MODE READ 2 — catch-up: refused with its own reason, and NOT the
    // revocation signal (expiry never purges a device: it still sells locally).
    await expect(drain.conn.handle(catchupMsg(0))).rejects.toThrow(GatewayError);
    await expect(drain.conn.handle(catchupMsg(0))).rejects.toThrow(/expired|drain/i);
    expect(ofKind(drain.rec.all, "catchup_response")).toHaveLength(0);
    expect(ofKind(drain.rec.all, "purge_command")).toHaveLength(0);

    // The drain push serves the session's declared purpose…
    await drain.conn.handle(pushMsg(validEnvelopes(draining, 0, 1)));
    const ack = must(ofKind(drain.rec.all, "push_ack").at(-1), "drain ack") as RenewablePushAck;
    expect(ack.renewed_token, "renewal on the drain ack").toBeDefined();
    const batchesAtRenewal = ofKind(drain.rec.all, "event_batch").length;

    // …and the SAME session is normal from that moment: catch-up is served…
    await drain.conn.handle(catchupMsg(0));
    const response = must(ofKind(drain.rec.all, "catchup_response").at(-1), "catchup_response");
    expect(response.events.length, "the cleared session reads its branch again").toBeGreaterThan(0);

    // …and fan-out reaches it again.
    await peerSession.conn.handle(pushMsg(validEnvelopes(peer, 1, 1)));
    expect(ofKind(drain.rec.all, "event_batch").length).toBe(batchesAtRenewal + 1);

    drain.conn.close();
    peerSession.conn.close();
  });

  it("01-F47/01-F42: expired AND revoked is PURGED — revocation wins over the drain admission", async () => {
    const identity = freshIdentity();
    await registerIdentity(db, identity);
    const expired = await tokenWithLife(identity, -1 * DAY_MS);
    await gatewayModule.revokeDevice(db, {
      org_id: identity.org_id,
      device_id: identity.device_id,
    });

    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await expect(conn.handle(helloMsg(identity, { token: expired }))).rejects.toThrow(
      AuthRejectedError,
    );
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
    expect(
      must(ofKind(rec.all, "purge_command")[0], "purge_command (01-F42 wins over expiry)").scope,
    ).toBe("all");
    conn.close();
    expect(await eventRows(verify, identity.org_id)).toHaveLength(0);
  });

  it("01-F47/18 §4 (adversarial): a clock that runs BACKWARDS does not brick a device", async () => {
    const identity = freshIdentity();
    // Minted against BASE_T; the cloud's clock is 30 days behind it.
    const token = await tokenWithLife(identity, 60 * DAY_MS);
    const session = await openSession(rewoundGateway, identity, { token });
    expect(session.helloAck.resume_from, "a rewound clock still admits a valid token").toBe(0);

    const renewed = (session.helloAck as RenewableHelloAck).renewed_token;
    if (renewed !== undefined) {
      expect(
        Number(payloadOf(renewed).expires_at),
        "any renewal minted under a rewound clock still expires in that clock's future",
      ).toBeGreaterThan(BASE_T - 30 * DAY_MS);
    }
    session.conn.close();
  });
});

describe("hub-relayed renewal, registry-side (01-F47 ruling 2 / 01-F13 / DEC-SYNC-009)", () => {
  it("01-F47/01-F13: a WAN-less origin renews WITHOUT ever holding WAN — the cloud judges its life from kernel.device_registry and puts the renewal on the relayed push_ack", async () => {
    const hub = freshIdentity();
    const origin: Identity = { ...hub, device_id: freshIdentity().device_id };
    await registerIdentity(db, hub, "counter_electron");
    await registerIdentity(db, origin, "waiter");
    // The cloud's record of the token this origin holds — it never sees the
    // token itself (18 §5: the registry decides, and no peer credential ever
    // travels through the hub).
    await setRegistryExpiry(db, origin, BASE_T + 5 * DAY_MS);

    const hubSession = await openSession(wideGateway, hub, {
      token: await tokenWithLife(hub, 80 * DAY_MS, { hub_relay: true }),
    });
    expect(hubSession.helloAck.relay_authorized).toBe(true);
    expect(
      (hubSession.helloAck as RenewableHelloAck).renewed_token,
      "the hub's own token is healthy — no renewal for it",
    ).toBeUndefined();

    await hubSession.conn.handle(pushMsg([validEnvelope(origin, 0)]));

    const ack = must(
      ofKind(hubSession.rec.all, "push_ack").at(-1),
      "relay ack",
    ) as RenewablePushAck;
    expect(ack.origin_device_id, "the ack names the origin it answers for").toBe(origin.device_id);
    const renewed = must(ack.renewed_token, "push_ack.renewed_token for the relayed origin");
    const payload = payloadOf(renewed);
    expect(payload.device_id, "the renewal belongs to the ORIGIN, not the hub").toBe(
      origin.device_id,
    );
    expect(payload.hub_relay, "a relayed follower gains no relay capability").toBeUndefined();
    expect(payload.expires_at).toBe(BASE_T + NINETY_DAYS_MS);
    expect(
      await registryExpiry(verify, origin),
      "the single writer records the relayed renewal too",
    ).toBe(BASE_T + NINETY_DAYS_MS);
    hubSession.conn.close();

    // Proof it is a real credential for the origin: it opens the origin's own
    // session the day the branch finally gets WAN.
    const originSession = await openSession(wideGateway, origin, { token: renewed });
    expect(originSession.helloAck.resume_from).toBe(1);
    originSession.conn.close();
  });

  it("01-F47 (TRAP PIN): a relayed origin whose registry life is ample takes NO renewal — relaying is not a renewal trigger", async () => {
    const hub = freshIdentity();
    const origin: Identity = { ...hub, device_id: freshIdentity().device_id };
    await registerIdentity(db, hub, "counter_electron");
    await registerIdentity(db, origin, "waiter");
    await setRegistryExpiry(db, origin, BASE_T + 80 * DAY_MS);

    const hubSession = await openSession(wideGateway, hub, {
      token: await tokenWithLife(hub, 80 * DAY_MS, { hub_relay: true }),
    });
    await hubSession.conn.handle(pushMsg([validEnvelope(origin, 0)]));

    const ack = must(
      ofKind(hubSession.rec.all, "push_ack").at(-1),
      "relay ack",
    ) as RenewablePushAck;
    expect(ack.renewed_token, "a healthy origin is never re-minted").toBeUndefined();
    expect(await registryExpiry(verify, origin)).toBe(BASE_T + 80 * DAY_MS);
    hubSession.conn.close();
  });

  it("01-F47/01-F42 (TRAP PIN): the relayed renewal never extends a REVOKED origin", async () => {
    const hub = freshIdentity();
    const origin: Identity = { ...hub, device_id: freshIdentity().device_id };
    await registerIdentity(db, hub, "counter_electron");
    await registerIdentity(db, origin, "waiter");
    await setRegistryExpiry(db, origin, BASE_T + 5 * DAY_MS); // due for renewal…
    await gatewayModule.revokeDevice(db, { org_id: origin.org_id, device_id: origin.device_id });

    const hubSession = await openSession(wideGateway, hub, {
      token: await tokenWithLife(hub, 80 * DAY_MS, { hub_relay: true }),
    });
    await hubSession.conn.handle(pushMsg([validEnvelope(origin, 0)]));

    for (const message of hubSession.rec.all) {
      expect(
        (message as { renewed_token?: string }).renewed_token,
        "a revoked origin is never renewed through the hub",
      ).toBeUndefined();
    }
    expect(
      await registryExpiry(verify, origin),
      "…and its recorded life is not extended either",
    ).toBe(BASE_T + 5 * DAY_MS);
    hubSession.conn.close();
  });
});
