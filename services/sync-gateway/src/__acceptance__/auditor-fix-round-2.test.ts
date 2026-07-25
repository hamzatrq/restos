// T-01-11 FIX ROUND 2 oracle — the corrected F2 (per-origin-slot fill) + Finding 2
// (plans/wave-0/t-01-11-fix-round.md, "Delta re-review BLOCKING" section @2d34d62,
// BINDING). Authored from that ruling + specs/01-kernel-sync.md (01-F1/F3/F8/F37) +
// DEC-SYNC-005/009 + the T-01-09/T-01-12 relay rulings ONLY (24 §3 step 2:
// read-only to the implementing session). The nine prior T-01-11 suites — the
// fix-round-1 F2 double-claim pin especially — are untouched and stay binding.
//
// The defect this round repairs: fix round 1 ruled "fill a lamport slot ONLY when
// the quarantine row actually stored" (per (org, claimed_event_id)). That premise
// FAILED at the org-wide key: a NO-FILL-class row (origin_unregistered, stream=null)
// already holding (org, claimed_event_id) makes the later legitimate fill a no-op,
// permanently and SILENTLY wedging an honest WAN-less origin whose events were
// relayed BEFORE it registered (the exact topology this kernel exists for) — through
// stops, stop-at-gap strands the tail, and the Auditor audits clean because
// quarantine rows never extend obligation. Corrected ruling: credit per (ORIGIN,
// slot), not per (org, claimed_event_id) — a no-fill-class prior never blocks a later
// legitimate origin fill; a genuine (origin, slot) duplicate still no-ops.
//
// RED-AWAITING-FIX map (each red verified to fail for the ruled reason):
//   F2-wedge-1 (honest race) — an unregistered origin O's outbox is relayed; O's
//     slot-n event is a storage_reject poison (U+0000) → stored origin_unregistered
//     (session-attributed, NO fill). O registers; a fresh session re-relays from 0.
//     Slot n's legit storage_reject re-quarantine conflicts on (org, claimed_event_id),
//     TODAY fills nothing, through stuck at n−1, stop-at-gap strands the tail. PIN:
//     O's slot n fills, through advances past n, the tail merges, the Auditor reports
//     NO gap for O.
//   F2-wedge-2 (insider pre-claim) — device A pushes a schema-invalid envelope
//     carrying victim O's poison-event id under A's identity → stores (org, that id)
//     attributed to A. O then legitimately relays that same event (storage_reject).
//     TODAY the conflict blocks the fill and wedges O. PIN: O's slot fills, tail
//     merges, no wedge — and A's legitimate row is untouched. (A loud lamport_gap for
//     O's poison slot is acceptable here: the foreign pre-claim leaves no O-attributed
//     filler; better a loud gap than a silent wedge. The pin does not assert clean.)
//   F2-still-noop (GREEN guard) — a genuine duplicate at the SAME (origin, slot)
//     credits exactly once: re-relaying O's outbox never double-advances the watermark
//     nor mints a second quarantine row. Green today AND after the fix — it pins that
//     the corrected credit-on-conflict does NOT over-credit an idempotent re-push.
//   Finding 2 — leg 5 (audit-chain) feeds UNPARSED audit-typed rows to
//     verifyAuditChain; a corrupt/null-payload audit-typed merged row TODAY aborts the
//     whole org report (audit rows `continue` before the F1b parse guard). PIN: an
//     unparseable_merged_event finding names the row and the report SURVIVES, the org's
//     other findings still land, no gap is manufactured.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  byCheck,
  created,
  evt,
  lineAdded,
  payment,
  runAuditor,
  settlementClosed,
} from "./auditor-builders.js";
import {
  BASE_T,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  openDb,
  openSession,
  pushMsg,
  quarantineRows,
  registerIdentity,
  signedToken,
  storedWatermark,
  TEST_TOKEN_SECRET,
  unknownTypeEnvelope,
  validEnvelope,
} from "./helpers.js";

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

const NUL = String.fromCharCode(0); // storage_reject trigger (U+0000), out of source bytes.

/** A registry-valid, jsonb-UNSTORABLE order.created (U+0000 in a payload string) —
 * the storage_reject poison at a given origin slot. */
const storagePoison = (origin: Identity, lamportSeq: number): ReturnType<typeof validEnvelope> =>
  validEnvelope(origin, lamportSeq, { payload: { order_id: `${NUL}-nul`, channel: "counter" } });

/** A same-org/branch peer of `of` — the WAN-less origin a hub relays for. */
const peerOf = (of: Identity, suffix: string): Identity => ({
  ...of,
  device_id: `${of.device_id}-${suffix}`,
});

/** Raw-insert one merged row (test-side corruption — the gateway would have
 * quarantined this envelope at the 01-F4 gate, so only corruption or registry drift
 * can put it in kernel.events; the Auditor exists for exactly that). global_seq
 * continues the org's stream to respect the unique index. */
const insertRawMergedRow = async (
  database: Db,
  identity: Identity,
  envelope: Record<string, unknown>,
  lamportSeq: number,
): Promise<void> => {
  const rows = await database.execute(
    sql`select coalesce(max(global_seq), 0) + 1 as next
        from kernel.events where org_id = ${identity.org_id}`,
  );
  const nextGlobalSeq = Number(must([...rows][0], "next global_seq").next);
  await database.execute(
    sql`insert into kernel.events
          (id, org_id, branch_id, device_id, lamport_seq, global_seq, server_received_at, envelope)
        values (${String(envelope.id)}, ${identity.org_id}, ${identity.branch_id},
          ${identity.device_id}, ${lamportSeq}, ${nextGlobalSeq}, ${BASE_T},
          ${JSON.stringify(envelope)}::jsonb)`,
  );
};

describe("F2-wedge-1 — the unregistered→registered relay race un-wedges (DEC-SYNC-009 / DEC-SYNC-005 / 01-F8)", () => {
  it("DEC-SYNC-009/DEC-SYNC-005/01-F8 (fix round 2): a WAN-less origin relayed BEFORE it registered — with a storage_reject poison at slot 1 — is NOT permanently wedged; on re-relay after registration its slot 1 fills, through advances past 1, the tail merges, and the Auditor reports NO gap for the origin", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w"); // NOT registered yet — the honest race
    const relayToken = signedToken({ ...hub, hub_relay: true });
    const first = await openSession(gateway, hub, { token: relayToken });
    expect(first.helloAck.relay_authorized).toBe(true);

    // O's outbox: slot 0 valid / slot 1 storage_reject poison / slot 2 valid.
    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "poison").id;

    // Push 1: O unregistered → every slot quarantines origin_unregistered (attributed
    // to the SESSION hub, NO fill). Nothing merges, O gets no watermark.
    await first.conn.handle(pushMsg(outbox));
    expect(await eventRows(db, hub.org_id)).toHaveLength(0);
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBeUndefined();
    first.conn.close();

    // O registers; a fresh hub session re-relays the SAME outbox from slot 0.
    await registerIdentity(db, origin, "waiter");
    const second = await openSession(gateway, hub, { token: relayToken });
    await second.conn.handle(pushMsg(outbox));
    second.conn.close();

    // PIN: slot 1 filled (via the legit re-relay quarantine), through past 1, tail merged.
    // TODAY: the storage_reject re-quarantine conflicts on (org, poisonId), fills
    // nothing, through stuck at 0, stop-at-gap strands slot 2 → watermark 0, only slot 0
    // merged (the silent wedge).
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
    const merged = (await eventRows(db, hub.org_id))
      .filter((r) => r.device_id === origin.device_id)
      .map((r) => r.lamport_seq)
      .sort((a, b) => a - b);
    expect(merged).toEqual([0, 2]); // slot 1 is the poison (quarantined), 0 and 2 merged
    expect(poisonId).toBeTruthy();

    // The Auditor sees the whole obligation [0..2] covered — NO gap for O.
    const report = await runAuditor({ db, org_id: hub.org_id });
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === origin.device_id)).toEqual(
      [],
    );
  });
});

describe("F2-wedge-2 — a foreign insider pre-claim never wedges an honest origin (DEC-SYNC-009 / 01-F1)", () => {
  it("DEC-SYNC-009/01-F1 (fix round 2): device A stores the key by pushing a schema-invalid envelope under A's identity carrying O's poison-event id; O's later legitimate storage_reject of that same event still fills O's slot and the tail merges — A's legitimate row is untouched", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w"); // O, the WAN-less origin
    const insider = peerOf(hub, "a"); // A, a plain same-branch device
    await registerIdentity(db, origin, "waiter");
    await registerIdentity(db, insider); // A: plain counter_electron, own session

    // O's outbox is fixed first so the poison's id is knowable to the pre-claimer.
    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "poison").id;

    // A pre-claims (org, poisonId): a SCHEMA-INVALID envelope under A's own identity
    // carrying O's poison-event id → stored schema_invalid, attributed to A.
    const aSession = await openSession(gateway, insider);
    const preclaim = { ...unknownTypeEnvelope(insider, 0), id: poisonId };
    await aSession.conn.handle(pushMsg([preclaim]));
    aSession.conn.close();
    const preRows = (await quarantineRows(db, hub.org_id)).filter(
      (r) => r.claimed_event_id === poisonId,
    );
    expect(preRows).toHaveLength(1);
    expect(must(preRows[0], "pre-claim row").reason).toBe("schema_invalid");

    // The hub relays O's outbox. O's poison (id = poisonId) hits storage_reject and
    // conflicts with A's pre-claim on (org, poisonId).
    const relay = await openSession(gateway, hub, {
      token: signedToken({ ...hub, hub_relay: true }),
    });
    await relay.conn.handle(pushMsg(outbox));
    relay.conn.close();

    // PIN: O's slot fills, the tail merges — no wedge. TODAY: the conflict blocks the
    // fill, through stuck at 0, slot 2 stranded (watermark 0, only slot 0 merged).
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
    const merged = (await eventRows(db, hub.org_id))
      .filter((r) => r.device_id === origin.device_id)
      .map((r) => r.lamport_seq)
      .sort((a, b) => a - b);
    expect(merged).toEqual([0, 2]);

    // A's legitimate row and stream are untouched — the fix credits O's slot without
    // clobbering the foreign pre-claim (01-F1: the relay never re-authors A's row).
    const aRow = must(
      (await quarantineRows(db, hub.org_id)).find((r) => r.claimed_event_id === poisonId),
      "A's pre-claim row after the relay",
    );
    expect(aRow.device_id).toBe(insider.device_id);
    expect(aRow.reason).toBe("schema_invalid");
    expect(await storedWatermark(db, hub.org_id, insider.device_id)).toBe(0);
  });
});

describe("F2-still-noop — a genuine (origin, slot) duplicate credits exactly once (GREEN guard; DEC-SYNC-005)", () => {
  it("DEC-SYNC-005/01-F8 (fix round 2 guard): re-relaying a registered origin's outbox (with a storage_reject slot) never double-advances the watermark nor mints a second quarantine row — the corrected credit-on-conflict stays idempotent", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w");
    await registerIdentity(db, origin, "waiter");
    const relay = await openSession(gateway, hub, {
      token: signedToken({ ...hub, hub_relay: true }),
    });

    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "poison").id;

    await relay.conn.handle(pushMsg(outbox));
    const firstWatermark = await storedWatermark(db, hub.org_id, origin.device_id);
    // A conformant hub crash-replays its outbox verbatim — the genuine duplicate.
    await relay.conn.handle(pushMsg(outbox));
    const secondWatermark = await storedWatermark(db, hub.org_id, origin.device_id);
    relay.conn.close();

    expect(firstWatermark).toBe(2);
    expect(secondWatermark).toBe(2); // NO phantom advance on the idempotent re-push
    const poisonRows = (await quarantineRows(db, hub.org_id)).filter(
      (r) => r.claimed_event_id === poisonId,
    );
    expect(poisonRows).toHaveLength(1); // exactly one storage_reject row (first stored wins)
    expect(must(poisonRows[0], "poison row").reason).toBe("storage_reject");
    const merged = (await eventRows(db, hub.org_id)).filter(
      (r) => r.device_id === origin.device_id,
    );
    expect(merged).toHaveLength(2); // slots 0 and 2, exactly once
  });
});

describe("Finding 2 — an unparseable AUDIT-typed merged row is a finding; the report survives (01-F5 / 01-F7)", () => {
  it("01-F5/01-F7 (fix round 2): a raw-inserted audit-typed merged row with a null payload yields an unparseable_merged_event finding naming the row — leg 5 no longer feeds it to verifyAuditChain and abort; the report survives, the org's other findings still land, and no gap is manufactured", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    // A genuinely short settled order (billed 1000, tendered 600): the org's OTHER
    // finding, which must still land after the guard drops the poison.
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2, 500)),
        evt(d, 2, payment(o, 600, { attempt: `P-${o}` })),
        evt(d, 3, settlementClosed(o)),
      ]),
    );
    session.conn.close();
    // The poison: an audit-typed envelope with a NULL payload — raw-inserted under a
    // fresh device at slot 0 (corruption class; the merge gate would have rejected it).
    // Audit rows `continue` before the refold's F1b parse guard, so only leg 5 sees it.
    const ghost: Identity = {
      org_id: d.org_id,
      branch_id: d.branch_id,
      device_id: `${d.device_id}-audit-raw`,
    };
    const auditPoison = { ...validEnvelope(ghost, 0), type: "audit.login", payload: null };
    await insertRawMergedRow(db, ghost, auditPoison as unknown as Record<string, unknown>, 0);

    // TODAY this await REJECTS (verifyAuditChain dereferences payload.prev_audit_hash
    // on null → the whole org report aborts). The pin: the report returns, structured.
    const report = await runAuditor({ db, org_id: d.org_id });
    expect(report.ok).toBe(false);
    const unparseable = byCheck(report, "unparseable_merged_event");
    expect(
      unparseable.some((f) => f.event_id === auditPoison.id && f.device_id === ghost.device_id),
    ).toBe(true);
    // Report survives ≠ report goes blind: the short settled order's conservation
    // finding still lands.
    expect(byCheck(report, "conservation").some((f) => f.order_id === o)).toBe(true);
    // The poisoned row still COVERS its own slot (it is a merged row): the guard must
    // not manufacture a lamport gap out of an unparseable audit envelope.
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === ghost.device_id)).toEqual(
      [],
    );
  });
});
