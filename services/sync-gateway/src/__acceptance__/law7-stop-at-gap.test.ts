// T-01-07 law 7 — Stop-at-gap (01-F8 / 01-F3 device-half constraint;
// assumption 4). Contract: plans/wave-0/kernel-tasks.md T-01-07. A push whose
// lamports jump past the expected next stores and acks only the contiguous
// prefix; nothing beyond the gap is stored ANYWHERE; a later contiguous re-push
// completes the sequence; kernel.events stays lamport-gap-free per device
// modulo quarantine rows.
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
  unknownTypeEnvelope,
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

describe("law 7 — stop-at-gap (01-F8/01-F3)", () => {
  it("01-F8/01-F3: a gapped push stores and acks only the contiguous prefix; nothing beyond the gap lands in events OR quarantine; contiguous re-push completes the sequence", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 2))); // lamports 0,1
    expect(must(ofKind(session.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(1);

    // Expected next is 2. Push [2,3,5,6] — 5 jumps past 4: stop at the gap.
    const e2 = validEnvelope(identity, 2);
    const e3 = validEnvelope(identity, 3);
    const e5 = validEnvelope(identity, 5);
    const e6 = validEnvelope(identity, 6);
    await session.conn.handle(pushMsg([e2, e3, e5, e6]));

    const gapAck = must(ofKind(session.rec.all, "push_ack").at(-1), "gap ack");
    expect(gapAck.acked_watermark).toBe(3); // only the contiguous prefix acked
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(3);

    let rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.lamport_seq)).toEqual([0, 1, 2, 3]);
    // Stop-at-gap is not quarantine: 5 and 6 are simply not stored (assumption 4).
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
    // Fan-out carried only the stored prefix.
    const fanned = ofKind(session.rec.all, "event_batch").flatMap((b) => b.events);
    expect(fanned.map((e) => e.id)).not.toContain(e5.id);
    expect(fanned.map((e) => e.id)).not.toContain(e6.id);

    // The device re-pushes from acked_watermark + 1 (19 §5); dedupe absorbs nothing
    // here since 5,6 were never stored — the batch is now contiguous.
    const e4 = validEnvelope(identity, 4);
    await session.conn.handle(pushMsg([e4, e5, e6]));
    const finalAck = must(ofKind(session.rec.all, "push_ack").at(-1), "final ack");
    expect(finalAck.acked_watermark).toBe(6);

    rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.lamport_seq)).toEqual([0, 1, 2, 3, 4, 5, 6]); // gap-free
    // global_seq stays dense in merge order too (01-F3).
    const firstSeq = must(rows[0], "first row").global_seq;
    rows.forEach((row, i) => {
      expect(row.global_seq).toBe(firstSeq + i);
    });
  });

  it("01-F8/01-F37: per-device lamport contiguity is gap-free MODULO quarantine rows — a quarantined slot counts as filled", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    const good0 = validEnvelope(identity, 0);
    const bad1 = unknownTypeEnvelope(identity, 1);
    const good2 = validEnvelope(identity, 2);
    await session.conn.handle(pushMsg([good0, bad1, good2]));
    expect(must(ofKind(session.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(2);

    // 3 extends contiguously — the quarantined slot 1 is durably filled.
    await session.conn.handle(pushMsg([validEnvelope(identity, 3)]));
    expect(must(ofKind(session.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(3);

    const eventLamports = (await eventRows(verify, identity.org_id)).map((r) => r.lamport_seq);
    const quarantineLamports = (await quarantineRows(verify, identity.org_id)).map((q) =>
      Number((q.envelope as { lamport_seq?: unknown }).lamport_seq),
    );
    expect(eventLamports).toEqual([0, 2, 3]);
    expect(quarantineLamports).toEqual([1]);
    // Union covers 0..3 without holes: the Auditor's lamport-gap check reading
    // (T-01-07 assumption 3, noted for T-01-11).
    expect([...eventLamports, ...quarantineLamports].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("01-F8: a push that is ENTIRELY beyond the gap stores nothing and leaves the watermark untouched", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 2))); // acked 1
    await session.conn.handle(pushMsg(validEnvelopes(identity, 5, 2))); // 5,6 — all past the gap

    const ack = must(ofKind(session.rec.all, "push_ack").at(-1), "ack");
    expect(ack.acked_watermark).toBe(1); // unchanged
    expect((await eventRows(verify, identity.org_id)).map((r) => r.lamport_seq)).toEqual([0, 1]);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(1);
  });
});
