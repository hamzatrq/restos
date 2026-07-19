// T-01-07 fix-round oracle — adversarial-review amendments (plans/wave-0/
// kernel-tasks.md T-01-07 "Fix-round amendments", each binding contract text)
// plus one green pin on concurrent same-org contention (law 1/law 4 corollary).
//
// Amendments pinned here (RED against the shipped impl; the impl fix follows —
// 24 §3: the oracle moves first, the named check goes green second):
//   1. In-batch dedupe — a repeated id within ONE push dedupes (identical →
//      skip-and-count; divergent → id_content_divergence), never a duplicate-PK
//      crash that aborts siblings and wedges the outbox.
//   2. Uniform persisted-slot rule (DEC-SYNC-005) — EVERY quarantine class
//      fills its lamport slot for the watermark, id_content_divergence included.
//   3. storage_reject — bytes jsonb cannot hold (U+0000 in any string) quarantine
//      verbatim as text instead of aborting the merge; siblings are isolated.
//   4. No push_ack when nothing is contiguously persisted (through < 0) — an
//      ack of 0 would claim slot 0 is held.
//   5. handle() serializes per connection — the double-hello TOCTOU cannot
//      register one connection in two orgs' fan-out sets (00 §5.4).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway, ProtocolViolationError } from "../index.js";
import {
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
  quarantineEnvelopeRaw,
  quarantineRows,
  recorder,
  type Session,
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

describe("amendment 1 — in-batch dedupe (01-F8)", () => {
  it("01-F8: a repeated id with DIVERGENT content within ONE push merges the first, quarantines the repeat as id_content_divergence at its slot, acks both slots — no raw error; re-push idempotent", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const x0 = validEnvelope(identity, 0);
    const divergentRepeat = { ...validEnvelope(identity, 1), id: x0.id }; // same id claims slot 1
    // Must resolve: in-batch dedupe, never a duplicate-PK crash (amendment 1).
    await pusher.conn.handle(pushMsg([x0, divergentRepeat]));

    const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "push_ack");
    expect(ack.acked_watermark).toBe(1); // both slots persisted (merged + quarantined)
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(1);

    const rows = await eventRows(verify, identity.org_id);
    expect(rows).toHaveLength(1);
    expect(must(rows[0], "merged row").id).toBe(x0.id);
    expect(must(rows[0], "merged row").lamport_seq).toBe(0);

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const q = must(quarantined[0], "quarantine row");
    expect(q.reason).toBe("id_content_divergence");
    expect(q.claimed_event_id).toBe(x0.id);
    expect(q.envelope).toEqual(JSON.parse(JSON.stringify(divergentRepeat))); // verbatim

    const notices = ofKind(pusher.rec.all, "quarantine_notice");
    expect(notices).toHaveLength(1);
    expect(must(notices[0], "notice")).toMatchObject({
      event_id: x0.id,
      reason: "id_content_divergence",
    });

    // Re-push of the exact same batch is an idempotent no-op (01-F8).
    await pusher.conn.handle(pushMsg([x0, divergentRepeat]));
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "retry ack").acked_watermark).toBe(1);
    expect(await eventRows(verify, identity.org_id)).toHaveLength(1);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(1);
  });

  it("01-F8: the exact same envelope repeated within ONE push merges once and counts once — ack 0, single fan-out, no crash", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const only = validEnvelope(identity, 0);
    await pusher.conn.handle(pushMsg([only, only])); // must resolve

    const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "push_ack");
    expect(ack.acked_watermark).toBe(0);
    expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).toEqual([only.id]);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0); // identical repeat is a skip, not a quarantine

    const batches = ofKind(pusher.rec.all, "event_batch");
    expect(batches).toHaveLength(1); // merged once → fanned once
    expect(must(batches[0], "fan-out batch").events.map((e) => e.id)).toEqual([only.id]);
  });
});

describe("amendment 2 — every quarantine class fills its slot (01-F8/DEC-SYNC-005)", () => {
  it("01-F8: an id_content_divergence quarantine FILLS its lamport slot — the ack advances over it and a following contiguous event in the same push merges", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const e0 = validEnvelope(identity, 0);
    const e1 = validEnvelope(identity, 1);
    await pusher.conn.handle(pushMsg([e0, e1]));
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(1);

    const divergentAt2 = { ...validEnvelope(identity, 2), id: e0.id }; // KNOWN id, divergent content, claims slot 2
    const e3 = validEnvelope(identity, 3);
    await pusher.conn.handle(pushMsg([divergentAt2, e3]));

    // Slot 2 is durably filled by the quarantine row → the ack advances to 3.
    const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack after divergence");
    expect(ack.acked_watermark).toBe(3);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(3);

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const q = must(quarantined[0], "quarantine row");
    expect(q.reason).toBe("id_content_divergence");
    expect(q.claimed_event_id).toBe(e0.id);

    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.lamport_seq)).toEqual([0, 1, 3]); // e3 merged past the filled slot
    expect(must(rows[0], "slot 0 row").id).toBe(e0.id); // stored row untouched (01-F1)
    expect(rows.map((r) => r.id)).toContain(e3.id);
  });
});

describe("amendment 3 — storage_reject (01-F37)", () => {
  it("01-F37: a registry-valid envelope jsonb cannot hold (U+0000 in a payload string) quarantines as storage_reject stored verbatim as TEXT; siblings merge, the ack advances, a notice is emitted", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const good0 = validEnvelope(identity, 0);
    const nul1 = validEnvelope(identity, 1, {
      payload: { order_id: "order-\u0000-nul", channel: "counter" }, // Zod-valid; jsonb-unstorable
    });
    const good2 = validEnvelope(identity, 2);
    // Must resolve: per-event savepoint isolation — one event's storage failure
    // never aborts siblings or suppresses the ack (amendment 3).
    await pusher.conn.handle(pushMsg([good0, nul1, good2]));

    const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "push_ack");
    expect(ack.acked_watermark).toBe(2); // slot 1 filled by the quarantine row
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);

    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.id)).toEqual([good0.id, good2.id]);
    const [row0, row2] = [must(rows[0], "row 0"), must(rows[1], "row 2")];
    expect(row2.global_seq).toBe(row0.global_seq + 1); // dense across the rejected slot

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const q = must(quarantined[0], "quarantine row");
    expect(q.reason).toBe("storage_reject");
    expect(q.claimed_event_id).toBe(nul1.id);
    expect(q.envelope).toEqual(JSON.parse(JSON.stringify(nul1))); // U+0000 intact through the round-trip

    // The envelope column holds the verbatim JSON STRING (kernel.quarantine.envelope is text).
    const raw = await quarantineEnvelopeRaw(verify, identity.org_id, nul1.id);
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw as string)).toEqual(JSON.parse(JSON.stringify(nul1)));

    const notices = ofKind(pusher.rec.all, "quarantine_notice");
    expect(notices).toHaveLength(1);
    expect(must(notices[0], "notice")).toMatchObject({
      event_id: nul1.id,
      reason: "storage_reject",
    });
  });
});

describe("amendment 4 — no false ack (01-F2/01-F8)", () => {
  it("01-F2/01-F8: a fresh device pushing past a gap-at-start gets NO push_ack and stores nothing; an empty push acks nothing; the first real [0] push then acks 0", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    // Gap at the start: the cloud expects lamport 0, the device pushes [3,4].
    await session.conn.handle(pushMsg(validEnvelopes(identity, 3, 2)));
    expect(ofKind(session.rec.all, "push_ack")).toHaveLength(0); // an ack of 0 would claim slot 0
    expect(await eventRows(verify, identity.org_id)).toHaveLength(0);
    expect(await quarantineRows(verify, identity.org_id)).toHaveLength(0);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBeUndefined();

    // Empty push: nothing contiguously persisted → still no push_ack.
    await session.conn.handle(pushMsg([]));
    expect(ofKind(session.rec.all, "push_ack")).toHaveLength(0);

    // A proper contiguous push finally acks — and acks exactly 0.
    const e0 = validEnvelope(identity, 0);
    await session.conn.handle(pushMsg([e0]));
    const acks = ofKind(session.rec.all, "push_ack");
    expect(acks).toHaveLength(1);
    expect(must(acks[0], "first real ack").acked_watermark).toBe(0);
    expect((await eventRows(verify, identity.org_id)).map((r) => r.id)).toEqual([e0.id]);
  });
});

describe("amendment 5 — handle() serializes per connection (00 §5.4)", () => {
  it("00 §5.4: two un-awaited hellos on ONE connection yield exactly one hello_ack (first wins, second throws) and the connection joins only the winning org's fan-out — the losing org's traffic never arrives", async () => {
    const orgA = freshIdentity();
    const orgB = freshIdentity();
    const rec = recorder();
    const conn = gateway.connect(rec.sink);

    // Dispatch BOTH without awaiting the first — the double-hello TOCTOU probe.
    const [first, second] = await Promise.allSettled([
      conn.handle(helloMsg(orgA)),
      conn.handle(helloMsg(orgB)),
    ]);
    // Serialized FIFO: frame 1 (org A) opens the session; frame 2 is a second
    // hello on an open session → ProtocolViolationError.
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") {
      expect(second.reason).toBeInstanceOf(ProtocolViolationError);
    }
    expect(ofKind(rec.all, "hello_ack")).toHaveLength(1);

    // A same-branch device of the WINNING org fans to this connection…
    const pusherA = { ...orgA, device_id: freshIdentity().device_id };
    const sessionA = await openSession(gateway, pusherA);
    const batchA = validEnvelopes(pusherA, 0, 2);
    await sessionA.conn.handle(pushMsg(batchA));

    // …and a same-branch device of the LOSING org never reaches it.
    const pusherB = { ...orgB, device_id: freshIdentity().device_id };
    const sessionB = await openSession(gateway, pusherB);
    await sessionB.conn.handle(pushMsg(validEnvelopes(pusherB, 0, 2)));

    const delivered = ofKind(rec.all, "event_batch").flatMap((b) => b.events);
    expect(delivered.map((e) => e.id)).toEqual(batchA.map((e) => e.id)); // org A only, exactly once
    for (const e of delivered) expect(e.org_id).toBe(orgA.org_id);
  });
});

describe("green pin — concurrent same-org contention (01-F3)", () => {
  it("01-F3: two devices pushing 50 events each CONCURRENTLY all merge — dense per-org global_seq, per-device lamport order preserved, catchup serves all 100 exactly once ascending", async () => {
    const identity = freshIdentity();
    const devA = identity;
    const devB = { ...identity, device_id: freshIdentity().device_id };
    const sessionA = await openSession(gateway, devA);
    const sessionB = await openSession(gateway, devB);

    const chain = async (session: Session, device: Identity): Promise<void> => {
      for (let batch = 0; batch < 5; batch++) {
        await session.conn.handle(pushMsg(validEnvelopes(device, batch * 10, 10)));
      }
    };
    await Promise.all([chain(sessionA, devA), chain(sessionB, devB)]);

    expect(must(ofKind(sessionA.rec.all, "push_ack").at(-1), "A final ack").acked_watermark).toBe(
      49,
    );
    expect(must(ofKind(sessionB.rec.all, "push_ack").at(-1), "B final ack").acked_watermark).toBe(
      49,
    );

    const rows = await eventRows(verify, identity.org_id);
    expect(rows).toHaveLength(100);
    const base = must(rows[0], "first merged row").global_seq;
    rows.forEach((row, i) => {
      expect(row.global_seq).toBe(base + i); // dense — contention tore no gaps
    });
    for (const device of [devA, devB]) {
      const lamports = rows
        .filter((r) => r.device_id === device.device_id)
        .map((r) => r.lamport_seq);
      expect(lamports).toEqual(Array.from({ length: 50 }, (_, i) => i)); // merge order respects each device's lamport order
    }

    const reader = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });
    await reader.conn.handle(catchupMsg(0));
    const page = must(ofKind(reader.rec.all, "catchup_response").at(-1), "catchup page");
    expect(page.complete).toBe(true);
    expect(page.events.map((e) => must(e.global_seq, "served global_seq"))).toEqual(
      rows.map((r) => r.global_seq),
    ); // all 100, exactly once, ascending
  });
});
