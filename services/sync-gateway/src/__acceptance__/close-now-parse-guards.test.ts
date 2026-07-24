// Close-now batch oracle — gateway/auditor parse guards + the wedge-2 loudness
// pin (plans/wave-0/sec-review-followups.md "Close-now batch"; senior review
// audit-1). Three items, authored from spec text + the shipped kernel rulings
// ONLY (24 §3 step 2; read-only to the implementing session):
//
//   A (review #3, RED)  — gateway.ts quarantine fill path parses the BLOCKER
//     row's envelope with a bare JSON.parse(String(blocker.envelope)). A corrupt
//     stored quarantine row (non-JSON bytes in the text column) makes that parse
//     throw INSIDE the push transaction → the whole push aborts and the origin's
//     outbox re-pushes forever (a crash-wedge). The guard: an unreadable blocker
//     envelope is treated as "cannot prove same-origin-other-slot" — the
//     conservative no-wedge direction (credit the slot / proceed as if no
//     blocking same-origin row). Never abort the push (01-F17).
//
//   B (review §6 / follow-up #1, RED) — auditor.ts leg 5 reads row.envelope.type
//     OUTSIDE the try that guards parseEvent. A 'null'::jsonb merged row
//     (corruption or registry drift; the 01-F4 merge gate admits none) throws
//     TypeError at that classifier read → the whole-org report aborts. The guard,
//     symmetric to the refold's guarded read (auditor.ts:~249): an unreadable
//     envelope → unparseable_merged_event finding, the report survives.
//
//   C (review #5, GREEN characterization) — no test asserts the lamport_gap
//     finding actually EXISTS after a foreign device pre-claims an honest
//     origin's event id. The "loud alarm, not silent wedge" ruling (F2-wedge-2)
//     rests on it. This pins the presence of the gap for the stranded slot.
import { newId } from "@restos/domain";
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
  quarantineEnvelopeRaw,
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

/** A registry-valid, jsonb-UNSTORABLE order.created — the storage_reject poison. */
const storagePoison = (origin: Identity, lamportSeq: number): ReturnType<typeof validEnvelope> =>
  validEnvelope(origin, lamportSeq, { payload: { order_id: `${NUL}-nul`, channel: "counter" } });

/** A same-org/branch peer of `of` — the WAN-less origin a hub relays for. */
const peerOf = (of: Identity, suffix: string): Identity => ({
  ...of,
  device_id: `${of.device_id}-${suffix}`,
});

// ── A — a corrupt quarantine BLOCKER row must never abort the push (01-F17) ──
describe("review #3 — corrupt quarantine blocker row is a crash-wedge the push must survive", () => {
  it("01-F17/DEC-SYNC-005: a fill-class quarantine whose claimed id already holds a CORRUPT (non-JSON) quarantine row does NOT abort the push — the unreadable blocker is treated as 'cannot prove same-origin-other-slot', the slot is credited, the tail merges, and the corrupt row is left verbatim", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    // slot 1's event id — the id a CORRUPT quarantine row already pre-claims.
    const slot1 = { ...unknownTypeEnvelope(identity, 1), id: newId() };
    // Pre-store the corruption directly. Only test-side corruption or a real disk
    // fault can put non-JSON in kernel.quarantine.envelope (the gateway always
    // writes JSON.stringify(envelope)); this is exactly the crash-wedge input the
    // guard must survive. reason is a real class, envelope is deliberately non-JSON.
    await db.execute(
      sql`insert into kernel.quarantine
            (id, org_id, branch_id, device_id, claimed_event_id, reason, envelope, received_at)
          values (${newId()}, ${identity.org_id}, ${identity.branch_id}, ${identity.device_id},
            ${slot1.id}, ${"storage_reject"}, ${"not-json{{{ CORRUPT"}, ${BASE_T})`,
    );

    const slot0 = validEnvelope(identity, 0);
    const slot2 = validEnvelope(identity, 2);
    // TODAY: at slot 1 the fill-class (schema_invalid) quarantine conflicts on
    // (org, slot1.id), reads the blocker, and JSON.parse("not-json{{{ CORRUPT")
    // THROWS — aborting the WHOLE push transaction (nothing persists, the outbox
    // re-pushes the same batch forever: the crash-wedge). GUARDED: the push
    // completes and takes the conservative no-wedge direction.
    await session.conn.handle(pushMsg([slot0, slot1, slot2]));

    // The origin's slot 1 is credited so the tail merges and the watermark
    // advances past the conflict — no wedge.
    expect(await storedWatermark(db, identity.org_id, identity.device_id)).toBe(2);
    const merged = (await eventRows(db, identity.org_id))
      .filter((r) => r.device_id === identity.device_id)
      .map((r) => r.lamport_seq)
      .sort((a, b) => a - b);
    expect(merged).toEqual([0, 2]); // slot 1 conflicted-and-credited; 0 and 2 merged

    // First-stored-wins (01-F1/01-F37): the corrupt blocker row is left verbatim —
    // the guard neither re-authors nor deletes it.
    expect(await quarantineEnvelopeRaw(db, identity.org_id, slot1.id)).toBe("not-json{{{ CORRUPT");
  });
});

// ── B — the Auditor leg-5 classifier read must survive a null envelope ──────
describe("review §6 / follow-up #1 — Auditor leg-5 type read survives a null-envelope merged row", () => {
  it("01-F5 (symmetric to the refold guard): a 'null'::jsonb merged row yields an unparseable_merged_event finding instead of aborting the whole-org report at the leg-5 classifier read; the org's other findings still land and no gap is manufactured", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    // A short settled order (billed 1000, tendered 600): the org's OTHER finding,
    // which must still land after the guard drops the poison.
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2, 500)),
        evt(d, 2, payment(o, 600, { attempt: `P-${o}` })),
        evt(d, 3, settlementClosed(o)),
      ]),
    );
    session.conn.close();

    // The poison: a merged row whose envelope column is jsonb `null`. leg 5 reads
    // row.envelope.type OUTSIDE its parse-guard try, so null.type throws TypeError
    // → the whole org report aborts TODAY. (The refold's read at auditor.ts:~249
    // is guarded; only leg 5 crashes.)
    const ghostDevice = `${d.device_id}-null-env`;
    const nullRowId = newId();
    const nextRows = await db.execute(
      sql`select coalesce(max(global_seq), 0) + 1 as next
          from kernel.events where org_id = ${d.org_id}`,
    );
    const nextGlobalSeq = Number(must([...nextRows][0], "next global_seq").next);
    await db.execute(
      sql`insert into kernel.events
            (id, org_id, branch_id, device_id, lamport_seq, global_seq, server_received_at, envelope)
          values (${nullRowId}, ${d.org_id}, ${d.branch_id}, ${ghostDevice}, ${0},
            ${nextGlobalSeq}, ${BASE_T}, ${JSON.stringify(null)}::jsonb)`,
    );

    // TODAY this await REJECTS (TypeError at the leg-5 classifier read). The pin:
    // the report returns, structured.
    const report = await runAuditor({ db, org_id: d.org_id });
    expect(report.ok).toBe(false);
    const unparseable = byCheck(report, "unparseable_merged_event");
    expect(unparseable.some((f) => f.event_id === nullRowId && f.device_id === ghostDevice)).toBe(
      true,
    );
    // Report survives ≠ report goes blind: the short order's conservation finding still lands.
    expect(byCheck(report, "conservation").some((f) => f.order_id === o)).toBe(true);
    // The null-envelope row still COVERS its own slot (a merged row holds its slot);
    // the guard must not manufacture a lamport gap out of it.
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === ghostDevice)).toEqual([]);
  });
});

// ── C — the foreign pre-claim raises a LOUD lamport_gap, not a silent wedge ──
describe("review #5 — a foreign pre-claim of an honest origin's event id raises a LOUD lamport_gap", () => {
  it("DEC-SYNC-009/01-F1: after device A pre-claims (org, poisonId) and the hub relays O's outbox, the Auditor PRODUCES a lamport_gap finding for O's stranded poison slot — the loud-alarm ruling's guarantee (not a silent wedge)", async () => {
    const hub = freshIdentity();
    const origin = peerOf(hub, "w"); // O, the WAN-less origin
    const insider = peerOf(hub, "a"); // A, a plain same-branch device
    await registerIdentity(db, origin, "waiter");
    await registerIdentity(db, insider);

    // O's outbox: slot 0 valid / slot 1 storage_reject poison / slot 2 valid.
    const outbox = [validEnvelope(origin, 0), storagePoison(origin, 1), validEnvelope(origin, 2)];
    const poisonId = must(outbox[1], "poison").id;

    // A pre-claims (org, poisonId): a schema-invalid envelope under A's own
    // identity carrying O's poison-event id → stored schema_invalid, attributed to A.
    const aSession = await openSession(gateway, insider);
    await aSession.conn.handle(pushMsg([{ ...unknownTypeEnvelope(insider, 0), id: poisonId }]));
    aSession.conn.close();

    // The hub relays O's outbox. O's poison hits storage_reject and conflicts with
    // A's pre-claim; O's slot fills (no wedge) but no O-attributed row covers it.
    const relay = await openSession(gateway, hub, {
      token: signedToken({ ...hub, hub_relay: true }),
    });
    await relay.conn.handle(pushMsg(outbox));
    relay.conn.close();

    // The origin un-wedged (watermark advanced over the poison slot)…
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);

    // …AND the loud alarm: a lamport_gap finding for O at the stranded poison slot 1.
    const report = await runAuditor({ db, org_id: hub.org_id });
    const oGaps = byCheck(report, "lamport_gap").filter((f) => f.device_id === origin.device_id);
    expect(oGaps.some((f) => f.lamport_seq === 1)).toBe(true);
    expect(oGaps).not.toEqual([]); // presence, not silence — the ruling's whole point
  });
});
