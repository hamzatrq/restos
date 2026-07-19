// T-01-07 law 6 — Quarantine (01-F37; 01-F4 registry parse at the merge
// boundary; DEC-SYNC-004 no-proxy). Contract: plans/wave-0/kernel-tasks.md
// T-01-07. Invalid events are stored VERBATIM in kernel.quarantine, get no
// global_seq, never enter kernel.events / fan-out / catchup, produce a
// quarantine_notice to the pushing session, and the watermark still advances
// over them (assumption 3 — the device outbox never wedges on a poisoned
// event, 01-F17 spirit). Re-push of the same bad event is an idempotent no-op.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  BASE_T,
  catchupMsg,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  invalidPayloadEnvelope,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  quarantineRows,
  storedWatermark,
  type TestClock,
  unknownTypeEnvelope,
  validEnvelope,
} from "./helpers.js";

let db: Db;
let verify: Db;
let clock: TestClock;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  clock = makeClock();
  gateway = createGateway({ db, clock });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("law 6 — quarantine (01-F37)", () => {
  it("01-F37/01-F4: a registry-invalid event is quarantined verbatim, excluded from events/fan-out/catchup, noticed to the pusher, and the watermark advances over it", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const observer = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    clock.t = BASE_T + 5_000;
    const good0 = validEnvelope(identity, 0);
    const bad1 = unknownTypeEnvelope(identity, 1);
    const good2 = validEnvelope(identity, 2);
    await pusher.conn.handle(pushMsg([good0, bad1, good2]));

    // Watermark advances over the quarantined slot (assumption 3).
    const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "push_ack");
    expect(ack.acked_watermark).toBe(2);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(2);

    // Verbatim quarantine row, gateway-assigned id, session identity, clock time.
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    const q = must(quarantined[0], "quarantine row");
    expect(q.reason).toBe("schema_invalid");
    expect(q.claimed_event_id).toBe(bad1.id);
    expect(q.envelope).toEqual(JSON.parse(JSON.stringify(bad1))); // verbatim (01-F37)
    expect(q.id.length).toBeGreaterThan(0);
    expect(q.org_id).toBe(identity.org_id);
    expect(q.branch_id).toBe(identity.branch_id);
    expect(q.device_id).toBe(identity.device_id);
    expect(q.received_at).toBe(BASE_T + 5_000);

    // Never enters kernel.events; gets NO global_seq — the survivors stay dense.
    const rows = await eventRows(verify, identity.org_id);
    expect(rows.map((r) => r.id)).toEqual([good0.id, good2.id]);
    const [row0, row2] = [must(rows[0], "row 0"), must(rows[1], "row 1")];
    expect(row2.global_seq).toBe(row0.global_seq + 1); // dense across the quarantined slot

    // quarantine_notice to the pushing session only.
    const notices = ofKind(pusher.rec.all, "quarantine_notice");
    expect(notices).toHaveLength(1);
    expect(must(notices[0], "notice")).toMatchObject({
      event_id: bad1.id,
      reason: "schema_invalid",
    });
    expect(ofKind(observer.rec.all, "quarantine_notice")).toHaveLength(0);

    // Fan-out carries only the merged events.
    const observerEvents = ofKind(observer.rec.all, "event_batch").flatMap((b) => b.events);
    expect(observerEvents.map((e) => e.id)).toEqual([good0.id, good2.id]);

    // Catchup never serves the quarantined event.
    await observer.conn.handle(catchupMsg(0));
    const page = must(ofKind(observer.rec.all, "catchup_response").at(-1), "catchup page");
    expect(page.events.map((e) => e.id)).toEqual([good0.id, good2.id]);
  });

  it("01-F37/01-F4: a KNOWN type with a registry-invalid payload quarantines as schema_invalid too", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const bad = invalidPayloadEnvelope(identity, 0);
    await pusher.conn.handle(pushMsg([bad]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    expect(must(quarantined[0], "quarantine row").reason).toBe("schema_invalid");
    expect(await eventRows(verify, identity.org_id)).toHaveLength(0);
    expect(await storedWatermark(verify, identity.org_id, identity.device_id)).toBe(0);
  });

  it("01-F37: re-pushing the same bad event is an idempotent no-op — first stored wins, one row forever", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);

    const good0 = validEnvelope(identity, 0);
    const bad1 = unknownTypeEnvelope(identity, 1);
    await pusher.conn.handle(pushMsg([good0, bad1]));
    expect(must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(1);

    await pusher.conn.handle(pushMsg([bad1], 1)); // device retries the poisoned event

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1); // UNIQUE(org_id, claimed_event_id): no second row
    expect(must(quarantined[0], "row").reason).toBe("schema_invalid");
    expect(await eventRows(verify, identity.org_id)).toHaveLength(1);
    const retryAck = must(ofKind(pusher.rec.all, "push_ack").at(-1), "retry ack");
    expect(retryAck.acked_watermark).toBe(1); // unchanged
  });

  it("01-F37/DEC-SYNC-004: each identity-mismatch reason class quarantines — org_mismatch, branch_mismatch, device_mismatch", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const foreign = freshIdentity();

    const orgMismatch = validEnvelope(identity, 0, { org_id: foreign.org_id });
    const branchMismatch = validEnvelope(identity, 1, { branch_id: foreign.branch_id });
    const deviceMismatch = validEnvelope(identity, 2, { device_id: foreign.device_id }); // no-proxy law
    await pusher.conn.handle(pushMsg([orgMismatch, branchMismatch, deviceMismatch]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    const reasonByClaimedId = new Map(quarantined.map((q) => [q.claimed_event_id, q.reason]));
    expect(reasonByClaimedId.get(orgMismatch.id)).toBe("org_mismatch");
    expect(reasonByClaimedId.get(branchMismatch.id)).toBe("branch_mismatch");
    expect(reasonByClaimedId.get(deviceMismatch.id)).toBe("device_mismatch");

    expect(await eventRows(verify, identity.org_id)).toHaveLength(0);
    // All three are durably held → the watermark advances over all of them.
    const ack = must(ofKind(pusher.rec.all, "push_ack").at(-1), "ack");
    expect(ack.acked_watermark).toBe(2);
    const notices = ofKind(pusher.rec.all, "quarantine_notice");
    expect(notices.map((n) => n.event_id).sort()).toEqual(
      [orgMismatch.id, branchMismatch.id, deviceMismatch.id].sort(),
    );
  });

  it("01-F37: identity checks precede registry parse — an event that is BOTH org-mismatched and registry-invalid quarantines as org_mismatch (contract step 1 before step 2)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const foreign = freshIdentity();

    const doublyBad = unknownTypeEnvelope(identity, 0, { org_id: foreign.org_id });
    await pusher.conn.handle(pushMsg([doublyBad]));

    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined).toHaveLength(1);
    expect(must(quarantined[0], "row").reason).toBe("org_mismatch");
  });
});
