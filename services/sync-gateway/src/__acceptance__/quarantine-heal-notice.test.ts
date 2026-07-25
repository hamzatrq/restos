// T-01-21 oracle — heal→notice reconciliation (plans/wave-0/t-01-21-quarantine-key.md
// "Heal→notice reconciliation"; filed as follow-up 2 of plans/wave-0/t-01-11-fix-round.md
// "Fix round 2 delta review"). Authored from specs/01-kernel-sync.md (01-F37
// "…surfaced to fleet health, ORIGINATING DEVICE NOTIFIED"; 01-F2 persist-before-
// notify; 01-F13 hub relay) + specs/DECISIONS.md (DEC-SYNC-008 accepted —
// at-least-once, durable outbox keyed by ORIGIN device, redelivered on next
// hello, mark-on-send; DEC-SYNC-009; DEC-SYNC-005) ONLY (24 §3 step 2: read-only
// to the implementing session). The landed notice-outbox.test.ts pins stay
// binding — this file only adds cases the org-wide keys made unreachable.
//
// THE DEFECT. kernel.quarantine_notices is co-keyed UNIQUE(org_id,
// claimed_event_id) with the quarantine table, and heal-in-place UPDATEs the
// QUARANTINE row's device_id + reason without touching the notice row. Two
// consequences, both of which deny 01-F37's "originating device notified":
//   (i) a foreign claimant that got there first owns the only notice row, so the
//       honest origin's notice is never written — its own hello drains nothing,
//       forever; and
//  (ii) after a heal the surviving notice row still carries the STALE hub
//       attribution and the STALE reason, so the durable copy (and every
//       redelivery of it on a later hello) tells the device the wrong thing
//       about its own event.
// The fix is per the plan: reconcile both rows in one transaction, or DERIVE the
// notice from the quarantine row at send time (preferred — one source of truth
// cannot drift from itself). These tests pin the OBSERVABLE outcome, not the
// mechanism: what the origin's session actually receives on the wire.
//
// ── ORACLE-PINNED SURFACE (binding for the implementing session) ─────────────
//   kernel.quarantine_notices remains the durable delivery-bookkeeping outbox of
//   DEC-SYNC-008 with its landed columns (org_id, branch_id, device_id,
//   claimed_event_id, created_at, delivered_at); delivered_at stays the only
//   column mutated by delivery. Its uniqueness must admit one row per
//   (org_id, claimed_event_id, DEVICE) exactly as kernel.quarantine now does —
//   otherwise the second claimant's origin can never be notified. NOTHING here
//   reads the notice row's `reason`: an implementation that derives notice
//   CONTENT from the quarantine row at send time is free to drop that column.
//
// RED-AWAITING-IMPLEMENTATION map (each red verified to fail for this reason):
//   H1 — the origin's notice row is never inserted (ON CONFLICT DO NOTHING
//        against the pre-claimer's row), so the origin's hello drains nothing.
//   H2 — the healed quarantine row says (origin, storage_reject) while the
//        notice row still says (hub, origin_unregistered) and is already marked
//        delivered to the hub: the origin is told nothing at all, and the
//        durable copy that exists is stale on both fields.
//   H3 — there is no origin-keyed row to redeliver: the crash-before-mark
//        window cannot even be engineered, which is precisely the loss.
import type { EventEnvelopeT } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
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
  unknownTypeEnvelope,
  validEnvelope,
} from "./helpers.js";

const relayToken = (claims: Identity): string => signedToken({ ...claims, hub_relay: true });

const NUL = String.fromCharCode(0); // storage_reject trigger (U+0000), out of source bytes.

/** Registry-valid, jsonb-UNSTORABLE order.created — the storage_reject poison. */
const storagePoison = (origin: Identity, lamportSeq: number): EventEnvelopeT =>
  validEnvelope(origin, lamportSeq, { payload: { order_id: `${NUL}-nul`, channel: "counter" } });

const peerOf = (of: Identity, suffix: string): Identity => ({
  ...of,
  device_id: `${of.device_id}-${suffix}`,
});

/** Delivery bookkeeping for ONE (org, claimed id, device) — the widened outbox key. */
const noticeDeliveredAt = async (
  database: Db,
  orgId: string,
  claimedEventId: string,
  deviceId: string,
): Promise<number | null | undefined> => {
  const rows = await database.execute(
    sql`select delivered_at from kernel.quarantine_notices
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}
          and device_id = ${deviceId}`,
  );
  const row = [...rows][0];
  if (row === undefined) return undefined;
  return row.delivered_at === null ? null : Number(row.delivered_at);
};

/**
 * The crash-before-mark window, engineered (the landed notice-outbox idiom,
 * narrowed to the widened key): the send happened, the mark did not. It fails
 * loudly when the device has no durable row at all — which IS the T-01-21
 * defect, so the red reason stays legible.
 */
const unmarkNotice = async (
  database: Db,
  orgId: string,
  claimedEventId: string,
  deviceId: string,
): Promise<void> => {
  const rows = await database.execute(
    sql`update kernel.quarantine_notices set delivered_at = null
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}
          and device_id = ${deviceId}
        returning id`,
  );
  must(
    [...rows][0],
    `a durable quarantine_notices row for device ${deviceId} / claimed id ${claimedEventId} ` +
      "(01-F37 'originating device notified'; DEC-SYNC-008 durable outbox)",
  );
};

let db: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
});

describe("H1 — a foreign pre-claim cannot swallow the origin's notice (01-F37 / DEC-SYNC-008)", () => {
  it("01-F37/DEC-SYNC-008/DEC-SYNC-009: when an insider already holds a notice for the claimed id, the WAN-less origin — whose event the hub relayed — still receives ITS OWN notice, carrying ITS OWN reason, on its next hello; the insider's delivered notice is untouched", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w");
    const insider = peerOf(hub, "a");
    await registerIdentity(db, origin, "waiter");
    await registerIdentity(db, insider);

    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "the origin's slot-1 poison").id;

    // The insider claims (org, poisonId) first, under its own identity.
    const insiderSession = await openSession(gateway, insider);
    await insiderSession.conn.handle(
      pushMsg([{ ...unknownTypeEnvelope(insider, 0), id: poisonId }]),
    );
    expect(
      ofKind(insiderSession.rec.all, "quarantine_notice").map((notice) => notice.event_id),
    ).toContain(poisonId);
    insiderSession.conn.close();
    const insiderMarked = await noticeDeliveredAt(db, hub.org_id, poisonId, insider.device_id);
    expect(insiderMarked).not.toBeNull(); // sent to the row's own device, marked

    // The hub relays the origin's outbox: the poison quarantines storage_reject,
    // ORIGIN-attributed (DEC-SYNC-005). The live notice goes to the HUB, so the
    // origin's durable row is what must carry the guarantee (DEC-SYNC-008).
    const relay = await openSession(gateway, hub, { token: relayToken(hub) });
    await relay.conn.handle(pushMsg(outbox));
    relay.conn.close();

    // RED today: the origin's notice row was never written, so this drains nothing.
    const originSession = await openSession(gateway, origin);
    const drained = ofKind(originSession.rec.all, "quarantine_notice").map((notice) => ({
      event_id: notice.event_id,
      reason: notice.reason,
    }));
    expect(drained).toContainEqual({ event_id: poisonId, reason: "storage_reject" });
    // …and never the insider's class: one device's evidence is never another's.
    expect(drained.every((notice) => notice.reason !== "schema_invalid")).toBe(true);
    originSession.conn.close();

    // The insider's own durable row is untouched by the origin's arrival.
    expect(await noticeDeliveredAt(db, hub.org_id, poisonId, insider.device_id)).toBe(
      insiderMarked,
    );
  });
});

describe("H2 — the notice reflects the HEALED state, never the stale placeholder (01-F37 / DEC-SYNC-009)", () => {
  it("01-F37/DEC-SYNC-008/DEC-SYNC-009: after the unregistered→registered relay race heals the quarantine row from (hub, origin_unregistered) to (origin, storage_reject), the notice the ORIGIN actually receives carries the healed reason — never the stale hub-attributed placeholder class, and never a notice for an event that merged", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w"); // NOT registered yet — the honest race
    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "the origin's slot-1 poison").id;
    const mergedIds = [must(outbox[0], "slot 0").id, must(outbox[2], "slot 2").id];

    const first = await openSession(gateway, hub, { token: relayToken(hub) });
    await first.conn.handle(pushMsg(outbox));
    first.conn.close();

    await registerIdentity(db, origin, "waiter");
    const second = await openSession(gateway, hub, { token: relayToken(hub) });
    await second.conn.handle(pushMsg(outbox));
    second.conn.close();

    // The quarantine row now names the ORIGIN and the TRUE class…
    const healed = [
      ...(await db.execute(
        sql`select device_id, reason from kernel.quarantine
            where org_id = ${hub.org_id} and claimed_event_id = ${poisonId}
              and device_id = ${origin.device_id}`,
      )),
    ][0];
    expect(String(must(healed, "the origin-attributed row for the poison").reason)).toBe(
      "storage_reject",
    );

    // …and RED today the origin's own hello hears nothing, because the only
    // notice row for this claimed id is the hub's stale origin_unregistered copy.
    const originSession = await openSession(gateway, origin);
    const drained = ofKind(originSession.rec.all, "quarantine_notice");
    expect(
      drained.map((notice) => ({ event_id: notice.event_id, reason: notice.reason })),
    ).toContainEqual({ event_id: poisonId, reason: "storage_reject" });
    expect(drained.every((notice) => notice.reason !== "origin_unregistered")).toBe(true);
    expect(drained.every((notice) => !mergedIds.includes(notice.event_id))).toBe(true);
    originSession.conn.close();
  });
});

describe("H3 — redelivery carries the healed content, at-least-once (DEC-SYNC-008)", () => {
  it("DEC-SYNC-008/01-F37: after the crash-before-mark window is re-opened on the ORIGIN's row, the next hello redelivers the notice with the HEALED reason — duplicates are legal, so cardinality is not pinned; content is", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w");
    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "the origin's slot-1 poison").id;

    const first = await openSession(gateway, hub, { token: relayToken(hub) });
    await first.conn.handle(pushMsg(outbox));
    first.conn.close();
    await registerIdentity(db, origin, "waiter");
    const second = await openSession(gateway, hub, { token: relayToken(hub) });
    await second.conn.handle(pushMsg(outbox));
    second.conn.close();

    // The origin drains once (marking its row), then the mark is lost.
    const firstHello = await openSession(gateway, origin);
    firstHello.conn.close();
    // RED today: there is no origin-keyed row to unmark — the guarantee never
    // became durable for the device 01-F37 says must be notified.
    await unmarkNotice(db, hub.org_id, poisonId, origin.device_id);

    const secondHello = await openSession(gateway, origin);
    const redelivered = ofKind(secondHello.rec.all, "quarantine_notice").filter(
      (notice) => notice.event_id === poisonId,
    );
    secondHello.conn.close();
    expect(redelivered.length).toBeGreaterThanOrEqual(1); // at-least-once, never lost
    for (const notice of redelivered) {
      expect(notice.reason).toBe("storage_reject"); // the healed content, not the stale copy
    }
    // Re-marked by this send; the row stays the delivery-bookkeeping row it was.
    expect(await noticeDeliveredAt(db, hub.org_id, poisonId, origin.device_id)).not.toBeNull();
  });
});
