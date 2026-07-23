// T-01-09 oracle — relay authorization from the registry + the DEC-SYNC-009
// origin-existence check (the decision's own open-dependency column: "T-01-09:
// the hub-relay auth capability AND the relayed-ORIGIN existence/registry
// check — no layer validates that a claimed origin device exists in the branch
// registry until T-01-09 lands", fix round F6, document-don't-build). Authored
// from specs/DECISIONS.md (DEC-SYNC-009, DEC-SYNC-005), specs/01-kernel-sync.md
// (01-F13 amended, 01-F25, 01-F37, 01-F39, 01-F40), specs/18 §5,
// specs/00 §5.4 org isolation, plans/wave-0/t-01-12-fix-round.md rulings F1/F2
// and the T-01-12 shape line ("verifies the origin device belongs to the same
// org/branch") ONLY (24 §3 step 2: read-only to the implementing session).
//
// RED-AWAITING-IMPLEMENTATION: the auth surface (registerDevice/revokeDevice/
// issueDeviceToken) is unbuilt and the shipped gateway grants relay from the
// token claim alone with NO origin registry check (auth.ts documents the hole:
// "a relay-capable session can name origins the registry has never seen").
//
// ── ORACLE-PINNED RELAY-AUTH SURFACE (binding for the implementing session) ──
//   Relay capability (DEC-SYNC-009 "authenticated as branch hub"; 01-F13
//   hub-eligible classes; 01-F39/01-F40 + 18 §5 client claims never the
//   authority): a session is relay-authorized iff
//     token claim hub_relay === true
//     AND its own registry row is unrevoked
//     AND that row's device_class ∈ HUB_ELIGIBLE_CLASSES (registry class — the
//         hello's client-declared device_class never grants anything).
//   The claim alone grants nothing (registry veto); registry hub-eligibility
//   alone grants nothing (claim required — the T-01-12 pinned claims contract
//   survives the seam swap). hello_ack.relay_authorized: true iff granted,
//   absent otherwise (PROTOCOL.md wording update flagged in the report — no
//   wire change, the field exists).
//   Origin-existence (the F6 hole this task closes): a relayed identity-valid
//   envelope whose device_id has NO unrevoked registry row for (session org,
//   session branch) quarantines `origin_unregistered`; a REVOKED origin
//   quarantines `origin_revoked` (01-F25 next-contact: relay is that device's
//   cloud participation by proxy). Both reasons join the closed QuarantineReason
//   set (01-F37 authorization class; wire quarantine_notice.reason is a free
//   string — no protocol change). Both classes: stored verbatim, absent from
//   kernel.events / fan-out / catchup, NO stream filled (fix-round F1 pattern —
//   nothing wedges: the garbage was never in the hub's outbox), NO
//   device_watermarks row materialized for a phantom origin, live
//   quarantine_notice to the pushing hub. Quarantine-row device_id attribution
//   (F2 pattern): `origin_unregistered` rows carry the SESSION device — the
//   claimed origin id is registry-unbacked garbage a forger controls;
//   `origin_revoked` rows carry the ORIGIN — the identity is registry-known.
//   An all-unregistered-origin relay push gets NO push_ack (extends the
//   fix-round "mismatch-only relay push" interpretation 2); the ack shape for
//   a revoked-origin push is deliberately UNPINNED (report).
//   A REVOKED HUB loses everything including relay (01-F25/01-F42, composed
//   with T-01-12): its next operation is AuthRejectedError — session-level
//   rejection, nothing persisted, no quarantine row.
// ─────────────────────────────────────────────────────────────────────────────
import { type ProtocolMessage, parseMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import * as gatewayModule from "../index.js";
import { AuthRejectedError, createGateway } from "../index.js";
import {
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
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

const TOKEN_SECRET = "t-01-09-oracle-device-token-secret-0123456789abcdef0123456789abcd";

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

const createGatewayWithAuth = createGateway as unknown as (options: {
  db: Db;
  clock: { now(): number };
  auth: { token_secret: string };
}) => Gateway;

/** A same-branch peer identity — the WAN-less ORIGIN a branch hub relays for. */
const sameBranchDevice = (of: Identity): Identity => ({
  ...of,
  device_id: freshIdentity().device_id,
});

/** hello with a TRUTHFUL declared class (registry-vs-declared conflict handling is an open ruling — no pin here depends on misdeclaration). */
const helloWithClass = (
  identity: Identity,
  deviceClass: "counter_electron" | "counter_rn" | "kitchen" | "manager" | "waiter" | "rider",
  token: string,
): ProtocolMessage =>
  parseMessage({
    v: 1,
    kind: "hello",
    device_id: identity.device_id,
    device_class: deviceClass,
    branch_id: identity.branch_id,
    token,
    last_global_seq: 0,
    own_high_water: 0,
  });

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

describe("relay capability from the registry (DEC-SYNC-009 / 01-F13 / 01-F39 / 18 §5)", () => {
  it("01-F13/DEC-SYNC-009: a registered hub-eligible device with the hub_relay claim is relay-authorized — relays a registered WAITER origin verbatim, per-origin ack, origin watermark, and the origin's own hello resumes past the relayed prefix (01-F25/01-F8)", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    await registerDevice(db, { ...origin, device_class: "waiter" }); // the actual deployment: waiters are the WAN-less devices
    const hubToken = await issueDeviceToken({ ...hub, hub_relay: true }, TOKEN_SECRET);

    const hubSession = await openSession(gateway, hub, { token: hubToken });
    expect(hubSession.helloAck.relay_authorized).toBe(true);

    const relayed = validEnvelopes(origin, 0, 3);
    await hubSession.conn.handle(pushMsg(relayed));

    const rows = await eventRows(verify, hub.org_id);
    expect(rows.map((r) => [r.device_id, r.lamport_seq])).toEqual([
      [origin.device_id, 0],
      [origin.device_id, 1],
      [origin.device_id, 2],
    ]);
    rows.forEach((row, i) => {
      expect(row.envelope).toEqual(relayed[i]); // attested, never re-authored (01-F1)
    });
    const ack = must(ofKind(hubSession.rec.all, "push_ack").at(-1), "relay ack");
    expect(ack.acked_watermark).toBe(2);
    expect(ack.origin_device_id).toBe(origin.device_id);
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(2);
    hubSession.conn.close();

    const originToken = await issueDeviceToken({ ...origin }, TOKEN_SECRET);
    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await conn.handle(helloWithClass(origin, "waiter", originToken));
    const originAck = must(ofKind(rec.all, "hello_ack")[0], "origin hello_ack");
    expect(originAck.resume_from).toBe(3); // the WAN-less origin's future own hello resumes past the relayed prefix
    expect(originAck.relay_authorized).toBeUndefined(); // no claim, not hub-eligible — nothing advertised
    conn.close();
  });

  it("01-F39/01-F40/18 §5: registry-class VETO — a registered WAITER carrying hub_relay: true is NOT relay-authorized; its third-party push stays device_mismatch (the claim alone grants nothing)", async () => {
    const waiterHub = freshIdentity();
    const peer = sameBranchDevice(waiterHub);
    await registerDevice(db, { ...waiterHub, device_class: "waiter" });
    await registerDevice(db, { ...peer, device_class: "waiter" }); // origin registration cannot rescue an unauthorized relay
    const token = await issueDeviceToken({ ...waiterHub, hub_relay: true }, TOKEN_SECRET);

    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    await conn.handle(helloWithClass(waiterHub, "waiter", token));
    const helloAck = must(ofKind(rec.all, "hello_ack")[0], "waiter hello_ack");
    expect(helloAck.relay_authorized).toBeUndefined(); // registry says waiter — not hub-eligible (01-F13)

    await conn.handle(pushMsg([validEnvelope(peer, 0)]));
    const rows = await quarantineRows(verify, waiterHub.org_id);
    expect(rows).toHaveLength(1);
    expect(must(rows[0], "quarantine row").reason).toBe("device_mismatch");
    expect(await eventRows(verify, waiterHub.org_id)).toHaveLength(0);
    conn.close();
  });

  it("18 §5/01-F13: the claim is still REQUIRED — a registered hub-eligible device without hub_relay is a plain session; third-party push stays device_mismatch (T-01-12 claims contract survives)", async () => {
    const counter = freshIdentity();
    const peer = sameBranchDevice(counter);
    await registerDevice(db, { ...counter, device_class: "counter_electron" });
    await registerDevice(db, { ...peer, device_class: "counter_electron" });
    const token = await issueDeviceToken({ ...counter }, TOKEN_SECRET); // no hub_relay claim

    const session = await openSession(gateway, counter, { token });
    expect(session.helloAck.relay_authorized).toBeUndefined();

    await session.conn.handle(pushMsg([validEnvelope(peer, 0)]));
    const rows = await quarantineRows(verify, counter.org_id);
    expect(rows).toHaveLength(1);
    expect(must(rows[0], "quarantine row").reason).toBe("device_mismatch");
    expect(await eventRows(verify, counter.org_id)).toHaveLength(0);
    session.conn.close();
  });
});

describe("origin-existence check at the merge boundary (DEC-SYNC-009 F6 / 01-F37 / 01-F25)", () => {
  it("DEC-SYNC-009/01-F37: relaying for a NEVER-REGISTERED same-org/branch device_id quarantines origin_unregistered — verbatim rows attributed to the SESSION device, nothing merged, no phantom watermark row, NO push_ack, notice to the pushing hub", async () => {
    const hub = freshIdentity();
    const phantom = sameBranchDevice(hub); // never registered anywhere
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    const hubToken = await issueDeviceToken({ ...hub, hub_relay: true }, TOKEN_SECRET);
    const hubSession = await openSession(gateway, hub, { token: hubToken });

    const forged = validEnvelopes(phantom, 0, 2);
    await hubSession.conn.handle(pushMsg(forged));

    const rows = await quarantineRows(verify, hub.org_id);
    expect(rows.map((r) => [r.claimed_event_id, r.reason]).sort()).toEqual(
      forged.map((e) => [e.id, "origin_unregistered"]).sort(),
    );
    for (const row of rows) {
      expect(row.device_id).toBe(hub.device_id); // F2 pattern: the claimed origin id is registry-unbacked
      const match = must(
        forged.find((e) => e.id === row.claimed_event_id),
        "forged envelope for quarantine row",
      );
      expect(row.envelope).toEqual(match); // stored verbatim (01-F37)
    }
    expect(await eventRows(verify, hub.org_id)).toHaveLength(0);
    expect(await storedWatermark(verify, hub.org_id, phantom.device_id)).toBeUndefined();
    expect(ofKind(hubSession.rec.all, "push_ack")).toHaveLength(0); // extends fix-round interpretation 2
    const notices = ofKind(hubSession.rec.all, "quarantine_notice");
    expect(notices.map((n) => n.event_id).sort()).toEqual(forged.map((e) => e.id).sort());
    for (const notice of notices) expect(notice.reason).toBe("origin_unregistered");
    hubSession.conn.close();
  });

  it("00 §5.4/DEC-SYNC-009: the registry lookup is org- AND branch-scoped — a device registered in another ORG, or in another BRANCH of this org (envelope branch forged to the session's), is origin_unregistered here", async () => {
    const hub = freshIdentity();
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    const hubToken = await issueDeviceToken({ ...hub, hub_relay: true }, TOKEN_SECRET);
    const hubSession = await openSession(gateway, hub, { token: hubToken });

    // Probe 1: same device_id string registered under a DIFFERENT org.
    const foreign = freshIdentity();
    const crossOrg = sameBranchDevice(hub);
    await registerDevice(db, {
      org_id: foreign.org_id,
      branch_id: foreign.branch_id,
      device_id: crossOrg.device_id,
      device_class: "waiter",
    });
    await hubSession.conn.handle(pushMsg([validEnvelope(crossOrg, 0)]));

    // Probe 2: registered in THIS org but another branch; the envelope claims
    // the session's branch (identity-valid) — the registry says otherwise
    // (T-01-12 shape: "the origin device belongs to the same org/branch").
    const crossBranch = sameBranchDevice(hub);
    await registerDevice(db, {
      org_id: hub.org_id,
      branch_id: freshIdentity().branch_id,
      device_id: crossBranch.device_id,
      device_class: "waiter",
    });
    await hubSession.conn.handle(pushMsg([validEnvelope(crossBranch, 0)]));

    const rows = await quarantineRows(verify, hub.org_id);
    expect(rows.map((r) => r.reason)).toEqual(["origin_unregistered", "origin_unregistered"]);
    expect(await eventRows(verify, hub.org_id)).toHaveLength(0);
    hubSession.conn.close();
  });

  it("01-F25/DEC-SYNC-009: a REVOKED origin stops relaying on next contact — origin_revoked quarantine attributed to the ORIGIN, prior merged events remain (01-F1), watermark unmoved", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    await registerDevice(db, { ...origin, device_class: "waiter" });
    const hubToken = await issueDeviceToken({ ...hub, hub_relay: true }, TOKEN_SECRET);
    const hubSession = await openSession(gateway, hub, { token: hubToken });

    await hubSession.conn.handle(pushMsg(validEnvelopes(origin, 0, 2)));
    expect(await eventRows(verify, hub.org_id)).toHaveLength(2);
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(1);

    await revokeDevice(db, { org_id: hub.org_id, device_id: origin.device_id });

    const late = validEnvelope(origin, 2);
    await hubSession.conn.handle(pushMsg([late]));

    const rows = await quarantineRows(verify, hub.org_id);
    expect(rows).toHaveLength(1);
    const row = must(rows[0], "origin_revoked row");
    expect(row.reason).toBe("origin_revoked");
    expect(row.claimed_event_id).toBe(late.id);
    expect(row.device_id).toBe(origin.device_id); // F2 pattern: identity registry-known → ORIGIN-attributed
    expect(await eventRows(verify, hub.org_id)).toHaveLength(2); // pre-revocation merges stand
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(1);
    // push_ack shape for a revoked-origin push is deliberately unpinned (report).
    hubSession.conn.close();
  });

  it("01-F25/01-F42 + T-01-12: a REVOKED HUB loses relay with the rest of its participation — the relay push is rejected session-level, nothing persisted, no quarantine row", async () => {
    const hub = freshIdentity();
    const origin = sameBranchDevice(hub);
    await registerDevice(db, { ...hub, device_class: "counter_electron" });
    await registerDevice(db, { ...origin, device_class: "waiter" });
    const hubToken = await issueDeviceToken({ ...hub, hub_relay: true }, TOKEN_SECRET);
    const hubSession = await openSession(gateway, hub, { token: hubToken });

    await hubSession.conn.handle(pushMsg([validEnvelope(origin, 0)]));
    expect(await eventRows(verify, hub.org_id)).toHaveLength(1);

    await revokeDevice(db, { org_id: hub.org_id, device_id: hub.device_id });

    await expect(hubSession.conn.handle(pushMsg([validEnvelope(origin, 1)]))).rejects.toThrow(
      AuthRejectedError,
    );
    expect(await eventRows(verify, hub.org_id)).toHaveLength(1);
    expect(await storedWatermark(verify, hub.org_id, origin.device_id)).toBe(0);
    expect(await quarantineRows(verify, hub.org_id)).toHaveLength(0); // rejection, not quarantine
    hubSession.conn.close();
  });
});
