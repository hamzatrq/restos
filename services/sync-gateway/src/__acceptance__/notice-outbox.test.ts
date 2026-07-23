// T-01-08 oracle — the durable quarantine-notice outbox (laws 4–5 of the
// T-01-08 contract, plans/wave-0/kernel-tasks.md; DEC-SYNC-008 accepted:
// at-least-once via a durable kernel.quarantine_notices outbox KEYED BY ORIGIN
// DEVICE, live-sent + redelivered on next hello, mark-on-send). Authored from
// specs/DECISIONS.md (DEC-SYNC-008, DEC-SYNC-009, DEC-SYNC-005) +
// specs/01-kernel-sync.md (01-F37: originating device notified, 01-F2) +
// PROTOCOL.md (quarantine_notice → origin device) + the T-01-08 contract +
// the T-01-12 fix-round F2 ruling ONLY (24 §3 step 2: read-only to the
// implementing session). T-01-07 law 6 and the T-01-12 relay pins stay binding.
//
// RED-AWAITING-IMPLEMENTATION: kernel.quarantine_notices does not exist — the
// row reads fail with "relation does not exist" and no hello ever drains a
// notice. That is the expected red reason.
//
// ── ORACLE-PINNED OUTBOX SURFACE (binding for the implementing session) ──────
//   • Postgres data contract (T-01-08, binding): kernel.quarantine_notices —
//     id text PK, org_id, branch_id, device_id, claimed_event_id, reason,
//     created_at bigint, delivered_at bigint NULL; UNIQUE(org_id,
//     claimed_event_id); only delivered_at is ever updated (delivery
//     bookkeeping, not ledger — 01-F1 does not reach it).
//   • EVERY quarantine class writes a notice row committed with the quarantine
//     row (persist-before-notify, 01-F2). The row's device_id follows the
//     QUARANTINE row's attribution (fix-round F2): content-class rows of
//     identity-valid envelopes → the ORIGIN device; identity-mismatch rows →
//     the SESSION device (the only authenticated identity — keying a notice to
//     an unauthenticated claimed id would let a forger spam another device's
//     notice stream).
//   • Mark-on-send marks a row delivered ONLY when the notice was sent to a
//     session authenticated AS the row's device. A live notice to a RELAYING
//     hub session does NOT mark the ORIGIN's row (derived ruling, flagged in
//     the oracle report: DEC-SYNC-008's guarantee is at-least-once TO THE
//     ORIGIN — marking on a hub send would degrade the WAN-less origin, the
//     exact deployment T-01-08 serves, to at-most-once via one best-effort LAN
//     forward). The origin's own next hello drains its undelivered rows AFTER
//     hello_ack, then marks them; a later hello redelivers nothing.
//   • At-least-once, never lost: a row left undelivered (the crash-before-mark
//     window) is redelivered on the device's next hello; duplicate live sends
//     are legal (the client tolerates duplicates); a delivered row is never
//     re-flagged by a re-push of the same bad event (first stored wins).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  registerIdentity,
  signedToken,
  TEST_TOKEN_SECRET,
  type TestClock,
  unknownTypeEnvelope,
  validEnvelope,
} from "./helpers.js";

/** Hub-relay token (T-01-09 M3 re-ground: signed claims carrying hub_relay; the
 * openSession fixture registers the hub hub-eligible, so the grant holds). */
const relayToken = (claims: Identity): string => signedToken({ ...claims, hub_relay: true });

const NUL = String.fromCharCode(0); // storage_reject trigger, kept out of source bytes

// ── notice-row reader (raw SQL against the BINDING T-01-08 data contract) ────
type NoticeRow = {
  id: string;
  org_id: string;
  branch_id: string;
  device_id: string;
  claimed_event_id: string;
  reason: string;
  created_at: number;
  delivered_at: number | null;
};

const noticeRows = async (db: Db, orgId: string): Promise<NoticeRow[]> => {
  const rows = await db.execute(
    sql`select id, org_id, branch_id, device_id, claimed_event_id, reason, created_at, delivered_at
        from kernel.quarantine_notices where org_id = ${orgId}
        order by created_at asc, claimed_event_id asc`,
  );
  return [...rows].map((row) => ({
    id: String(row.id),
    org_id: String(row.org_id),
    branch_id: String(row.branch_id),
    device_id: String(row.device_id),
    claimed_event_id: String(row.claimed_event_id),
    reason: String(row.reason),
    created_at: Number(row.created_at),
    delivered_at: row.delivered_at === null ? null : Number(row.delivered_at),
  }));
};

/** The crash-before-mark window, engineered: the send happened but the mark did not. */
const unmarkNotice = async (db: Db, orgId: string, claimedEventId: string): Promise<void> => {
  await db.execute(
    sql`update kernel.quarantine_notices set delivered_at = null
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}`,
  );
};

let db: Db;
let verify: Db;
let clock: TestClock;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  clock = makeClock();
  gateway = createGateway({ db, clock, auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("law 4 — durable redelivery on the origin's next hello (01-F37 / DEC-SYNC-008 / DEC-SYNC-009)", () => {
  it("01-F37/DEC-SYNC-008/DEC-SYNC-009: a quarantine from a RELAYED push writes an ORIGIN-keyed undelivered notice row; the origin's own next hello delivers it AFTER hello_ack, marks it, and a later hello redelivers nothing", async () => {
    const hubId = freshIdentity();
    const origin: Identity = { ...hubId, device_id: freshIdentity().device_id };
    await registerIdentity(db, origin); // T-01-09: relayed origins resolve in the registry
    const hub = await openSession(gateway, hubId, { token: relayToken(hubId) });

    clock.t = BASE_T + 10_000;
    const good0 = validEnvelope(origin, 0);
    const bad1 = unknownTypeEnvelope(origin, 1); // schema_invalid, ORIGIN-attributed (identity-valid)
    const good2 = validEnvelope(origin, 2);
    await hub.conn.handle(pushMsg([good0, bad1, good2]));

    // The live notice went to the pushing hub session (landed T-01-12 surface).
    const hubNotices = ofKind(hub.rec.all, "quarantine_notice");
    expect(hubNotices.map((n) => n.event_id)).toContain(bad1.id);

    // The durable row: keyed by the ORIGIN, NOT marked by the hub send (the
    // derived mark-on-send ruling — the guarantee is to the ORIGIN).
    const rowsBefore = await noticeRows(verify, origin.org_id);
    expect(rowsBefore).toHaveLength(1);
    const row = must(rowsBefore[0], "notice row");
    expect(row.device_id).toBe(origin.device_id);
    expect(row.claimed_event_id).toBe(bad1.id);
    expect(row.reason).toBe("schema_invalid");
    expect(row.branch_id).toBe(origin.branch_id);
    expect(row.delivered_at).toBeNull();

    // The origin's own FIRST hello (it had no session at notice time — the
    // WAN-less shape): the undelivered notice drains AFTER hello_ack.
    clock.t = BASE_T + 11_000;
    const originSession = await openSession(gateway, origin);
    const drained = ofKind(originSession.rec.all, "quarantine_notice");
    expect(drained.map((n) => ({ event_id: n.event_id, reason: n.reason }))).toEqual([
      { event_id: bad1.id, reason: "schema_invalid" },
    ]);
    const ackIndex = originSession.rec.all.findIndex((m) => m.kind === "hello_ack");
    const noticeIndex = originSession.rec.all.findIndex((m) => m.kind === "quarantine_notice");
    expect(ackIndex).toBeGreaterThanOrEqual(0);
    expect(noticeIndex).toBeGreaterThan(ackIndex);

    // Marked on send-to-origin; a later hello redelivers nothing.
    const rowsAfter = await noticeRows(verify, origin.org_id);
    expect(must(rowsAfter[0], "marked row").delivered_at).not.toBeNull();
    const originAgain = await openSession(gateway, origin);
    expect(ofKind(originAgain.rec.all, "quarantine_notice")).toHaveLength(0);
  });

  it("01-F37/DEC-SYNC-008: the notice survives a gateway close()/rebuild — the row is durable, and the origin's first hello against the REBUILT gateway still delivers it", async () => {
    const hubId = freshIdentity();
    const origin: Identity = { ...hubId, device_id: freshIdentity().device_id };
    await registerIdentity(db, origin); // T-01-09: relayed origins resolve in the registry
    const gateway1 = createGateway({ db, clock, auth: { token_secret: TEST_TOKEN_SECRET } });
    const hub = await openSession(gateway1, hubId, { token: relayToken(hubId) });
    const bad = unknownTypeEnvelope(origin, 0);
    await hub.conn.handle(pushMsg([bad]));
    await gateway1.close(); // the gateway instance dies with the notice undelivered

    const gateway2 = createGateway({ db, clock, auth: { token_secret: TEST_TOKEN_SECRET } }); // rebuild over the same Postgres
    const originSession = await openSession(gateway2, origin);
    const drained = ofKind(originSession.rec.all, "quarantine_notice");
    expect(drained.map((n) => n.event_id)).toEqual([bad.id]);
    await gateway2.close();
  });

  it("01-F37/DEC-SYNC-008: mark-on-send for the ORIGIN-pusher (pusher == origin) — the live send marks the row; a row left undelivered (crash-before-mark window) is redelivered on the next hello exactly once, never lost", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    clock.t = BASE_T + 12_000;
    const good0 = validEnvelope(identity, 0);
    const poison = validEnvelope(identity, 1, {
      payload: { order_id: `n3-${NUL}-order`, channel: "dine_in" },
    }); // registry-valid; jsonb-unstorable → storage_reject
    await pusher.conn.handle(pushMsg([good0, poison]));
    expect(ofKind(pusher.rec.all, "quarantine_notice").map((n) => n.event_id)).toContain(poison.id);

    // The pusher IS the origin and was connected: mark-on-send applies.
    const rows = await noticeRows(verify, identity.org_id);
    expect(rows).toHaveLength(1);
    expect(must(rows[0], "row").reason).toBe("storage_reject");
    expect(must(rows[0], "row").delivered_at).not.toBeNull();

    // Crash-before-mark: the send happened but the mark was lost. At-least-once
    // means the next hello redelivers (a duplicate at the client is legal).
    await unmarkNotice(db, identity.org_id, poison.id);
    const reconnect = await openSession(gateway, identity);
    const redelivered = ofKind(reconnect.rec.all, "quarantine_notice");
    expect(redelivered.map((n) => ({ event_id: n.event_id, reason: n.reason }))).toEqual([
      { event_id: poison.id, reason: "storage_reject" },
    ]);
    expect(must((await noticeRows(verify, identity.org_id))[0], "row").delivered_at).not.toBeNull();

    const third = await openSession(gateway, identity);
    expect(ofKind(third.rec.all, "quarantine_notice")).toHaveLength(0);
  });
});

describe("law 5 — notice idempotency (01-F37 / DEC-SYNC-008)", () => {
  it("01-F37/DEC-SYNC-008: re-pushing the same bad event creates no second notice row (UNIQUE(org, claimed_event_id), first stored wins) and never re-flags a delivered notice — the next hello redelivers nothing", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    clock.t = BASE_T + 13_000;
    const bad = unknownTypeEnvelope(identity, 0);
    await pusher.conn.handle(pushMsg([bad]));
    const first = must((await noticeRows(verify, identity.org_id))[0], "first row");
    expect(first.delivered_at).not.toBeNull();

    clock.t = BASE_T + 14_000; // a later re-push must not refresh the row
    await pusher.conn.handle(pushMsg([bad], 0));
    const rows = await noticeRows(verify, identity.org_id);
    expect(rows).toHaveLength(1);
    const after = must(rows[0], "row after re-push");
    expect(after.id).toBe(first.id);
    expect(after.created_at).toBe(first.created_at);
    expect(after.delivered_at).not.toBeNull(); // never re-flagged undelivered

    const reconnect = await openSession(gateway, identity);
    expect(ofKind(reconnect.rec.all, "quarantine_notice")).toHaveLength(0);
  });
});

describe("identity-mismatch notice attribution follows the quarantine row (fix-round F2 / DEC-SYNC-008)", () => {
  it("F2/DEC-SYNC-008/DEC-SYNC-009: a relayed identity-MISMATCH quarantine keys its notice row to the SESSION device (the only authenticated identity) — the claimed origin id gets NO notice on its hello, the hub session gets the live notice and its row is marked", async () => {
    const hubId = freshIdentity();
    const hub = await openSession(gateway, hubId, { token: relayToken(hubId) });
    const foreign = freshIdentity();

    // Claimed foreign ORG (and a foreign claimed device id): org_mismatch —
    // the claimed ids are unauthenticated garbage a forger controls (F2).
    const mismatch = validEnvelope(hubId, 0, {
      org_id: foreign.org_id,
      device_id: foreign.device_id,
    });
    await hub.conn.handle(pushMsg([mismatch]));
    expect(ofKind(hub.rec.all, "quarantine_notice").map((n) => n.event_id)).toContain(mismatch.id);

    const rows = await noticeRows(verify, hubId.org_id);
    expect(rows).toHaveLength(1);
    const row = must(rows[0], "mismatch notice row");
    expect(row.device_id).toBe(hubId.device_id); // SESSION-attributed, never the claimed id
    expect(row.reason).toBe("org_mismatch");
    expect(row.delivered_at).not.toBeNull(); // sent to the row's device (the hub session)

    // The claimed device id, helloing under the hub's org, must hear nothing.
    const claimed = await openSession(gateway, { ...hubId, device_id: foreign.device_id });
    expect(ofKind(claimed.rec.all, "quarantine_notice")).toHaveLength(0);
  });

  it("F2/DEC-SYNC-008: a PLAIN session's device_mismatch notice row is likewise SESSION-attributed — the claimed device id never inherits a forger's notices", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const claimedDevice = freshIdentity().device_id;

    const mismatch = validEnvelope(identity, 0, { device_id: claimedDevice });
    await pusher.conn.handle(pushMsg([mismatch]));

    const rows = await noticeRows(verify, identity.org_id);
    expect(rows).toHaveLength(1);
    const row = must(rows[0], "device_mismatch notice row");
    expect(row.device_id).toBe(identity.device_id);
    expect(row.reason).toBe("device_mismatch");

    const claimed = await openSession(gateway, { ...identity, device_id: claimedDevice });
    expect(ofKind(claimed.rec.all, "quarantine_notice")).toHaveLength(0);
  });
});
