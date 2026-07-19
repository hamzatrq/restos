// T-01-07 law 2 — Idempotent push (01-F8; 01-F1 never-overwrite). Contract:
// plans/wave-0/kernel-tasks.md T-01-07. Re-pushing any prefix or the whole batch
// yields the same acked_watermark, zero new rows, zero re-fan-out; dedupe is by
// event id; divergent content under a known id quarantines and never mutates
// the stored row.
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  quarantineRows,
  storedWatermark,
  validEnvelope,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let verify: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock() });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("law 2 — idempotent push (01-F8)", () => {
  it("01-F8: re-pushing the whole batch produces the same acked_watermark, zero new rows, zero re-fan-out of already-merged events", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const observer = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    const batch = validEnvelopes(identity, 0, 6);
    await pusher.conn.handle(pushMsg(batch));
    const firstAck = must(ofKind(pusher.rec.all, "push_ack").at(-1), "first push_ack");
    expect(firstAck.acked_watermark).toBe(5);

    const mergedIds = new Set(batch.map((e) => e.id));
    const observerEventsBefore = ofKind(observer.rec.all, "event_batch").flatMap((b) => b.events);
    expect(observerEventsBefore).toHaveLength(6);

    // Full re-push (idempotent retry, 01-F8).
    await pusher.conn.handle(pushMsg(batch));
    const retryAck = must(ofKind(pusher.rec.all, "push_ack").at(-1), "retry push_ack");
    expect(retryAck.acked_watermark).toBe(5);

    const rows = await eventRows(verify, identity.org_id);
    expect(rows).toHaveLength(6); // zero new rows

    // Zero re-fan-out: no already-merged event id is delivered again.
    const observerEventsAfter = ofKind(observer.rec.all, "event_batch").flatMap((b) => b.events);
    const redelivered = observerEventsAfter.slice(6).filter((e) => mergedIds.has(e.id));
    expect(redelivered).toHaveLength(0);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(5);
  });

  it("01-F8 (fast-check): re-pushing ANY prefix of a merged batch is a no-op with the same acked_watermark", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const batch = validEnvelopes(identity, 0, 6);
    await pusher.conn.handle(pushMsg(batch));

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (prefixLength) => {
        const prefix = batch.slice(0, prefixLength);
        await pusher.conn.handle(pushMsg(prefix));
        const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "prefix re-push ack");
        expect(ack.acked_watermark).toBe(5); // never regresses, always the stored high-water
        expect(await eventRows(verify, identity.org_id)).toHaveLength(6);
        expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(5);
      }),
      { numRuns: 12 },
    );
  });

  it("01-F8/01-F1: same id with divergent content quarantines as id_content_divergence and NEVER mutates the stored row", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const original = validEnvelope(identity, 0);
    await pusher.conn.handle(pushMsg([original]));
    const storedBefore = must((await eventRows(verify, identity.org_id))[0], "stored row");

    // Same id, same lamport, different payload — divergent content.
    const divergent = {
      ...original,
      payload: { order_id: "tampered", channel: "counter" },
    };
    await pusher.conn.handle(pushMsg([divergent], 0));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const q = must(quarantined[0], "quarantine row");
    expect(q.reason).toBe("id_content_divergence");
    expect(q.claimed_event_id).toBe(original.id);
    expect(q.envelope).toEqual(JSON.parse(JSON.stringify(divergent))); // stored verbatim

    // 01-F1: the merged row is untouched, byte-for-byte.
    const rowsAfter = await eventRows(verify, identity.org_id);
    expect(rowsAfter).toHaveLength(1);
    expect(must(rowsAfter[0], "stored row after divergence")).toEqual(storedBefore);
  });

  it("01-F8: a NEW id at an already-occupied (org, device, lamport) slot quarantines as lamport_conflict (T-01-03 collision-is-corruption, cloud side)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    await pusher.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));

    const usurper = validEnvelope(identity, 1); // fresh id, occupied lamport slot 1
    await pusher.conn.handle(pushMsg([usurper], 1));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const q = must(quarantined[0], "quarantine row");
    expect(q.reason).toBe("lamport_conflict");
    expect(q.claimed_event_id).toBe(usurper.id);
    expect(await eventRows(verify, identity.org_id)).toHaveLength(2);
  });
});
