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
//   C (review #5) — SUPERSEDED by the T-01-21 oracle; see the ruling block above
//     the third describe. It pinned that a lamport_gap EXISTS after a foreign
//     device pre-claims an honest origin's event id. That alarm was the last
//     surviving trace of bytes the org-wide quarantine key destroyed; T-01-21
//     widened the key so the bytes survive, and the assertion is replaced by the
//     strictly stronger guarantee it was standing in for.
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

// ── C — the foreign pre-claim now destroys NOTHING, so there is no alarm ─────
//
// RULING (T-01-21 oracle, plans/wave-0/t-01-21-quarantine-key.md; recorded here
// rather than in a deleted test). The assertion this describe used to carry —
// "the Auditor PRODUCES a lamport_gap for O's stranded poison slot" — is
// OBSOLETE, not regressed. Its own premise, quoted from the version it replaces,
// was: "O's slot fills (no wedge) but no O-attributed row covers it." That
// premise held only because kernel.quarantine was keyed UNIQUE(org_id,
// claimed_event_id) org-wide, so an insider's pre-claim DISCARDED the honest
// origin's envelope entirely (audit-1 #6) and the gap was the only surviving
// trace of the loss. T-01-21 widened the key to (org_id, claimed_event_id,
// device_id): O now stores its OWN correctly-attributed row, the slot is covered
// by attribution, and the Auditor is right to be silent. Keeping the old
// assertion would pin a FALSE POSITIVE against the ratified coverage law
// (01-F37 "the Auditor's lamport-gap check counts quarantine rows as
// slot-filling"; DEC-SYNC-005) — it would require the Auditor to shout about
// evidence that is intact.
//
// Review #5's real concern — a loss that is silent is unrecoverable — is NOT
// dropped. It is re-pinned where a genuine loss still exists:
//   • an uncovered slot is loud, and named against the RIGHT device —
//     quarantine-key-auditor.test.ts, describe "A3 — loud, never silent";
//   • the SURVIVING byte-loss class (a stored row whose bytes are unreadable
//     covers nothing, yet its slot was credited — the state describe A above
//     engineers) is loud — quarantine-key-auditor.test.ts, describe "A4".
// What stands here instead is strictly stronger than the alarm it retires: no
// alarm, because nothing was lost. The un-wedged watermark assertion is
// unchanged.
describe("review #5 (SUPERSEDED by T-01-21) — a foreign pre-claim destroys nothing, so there is nothing to be loud about", () => {
  it("01-F37/01-F1/DEC-SYNC-005: after device A pre-claims (org, poisonId) and the hub relays O's outbox, O's OWN row is stored — attributed to O, holding O's bytes VERBATIM at the poison slot — so the origin is un-wedged (watermark 2) AND the Auditor reports NO lamport_gap for O: the slot is covered by attribution", async () => {
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
    const preclaim = { ...unknownTypeEnvelope(insider, 0), id: poisonId };
    await aSession.conn.handle(pushMsg([preclaim]));
    aSession.conn.close();

    // The hub relays O's outbox. O's poison hits storage_reject and stores its own
    // row under (org, poisonId, O) — the pre-claim blocks nothing now.
    const relay = await openSession(gateway, hub, {
      token: signedToken({ ...hub, hub_relay: true }),
    });
    const push = pushMsg(outbox);
    if (push.kind !== "push") throw new Error("pushMsg did not build a push message");
    await relay.conn.handle(push);
    relay.conn.close();

    // The origin un-wedged (watermark advanced over the poison slot) — unchanged.
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
    const merged = (await eventRows(db, hub.org_id))
      .filter((r) => r.device_id === origin.device_id)
      .map((r) => r.lamport_seq)
      .sort((a, b) => a - b);
    expect(merged).toEqual([0, 2]); // slot 1 is the poison, durably quarantined

    // The evidence the old alarm stood in for: BOTH claimants' rows, each its own.
    const rows = [
      ...(await db.execute(
        sql`select device_id, reason, envelope from kernel.quarantine
            where org_id = ${hub.org_id} and claimed_event_id = ${poisonId}`,
      )),
    ].map((row) => ({
      device_id: String(row.device_id),
      reason: String(row.reason),
      envelope: JSON.parse(String(row.envelope)) as unknown,
    }));
    const claimants = new Map(rows.map((row) => [row.device_id, row]));
    expect([...claimants.keys()].sort()).toEqual([insider.device_id, origin.device_id].sort());

    // O's row: O's attribution, O's true class, O's bytes exactly as received
    // (01-F1 — a relay attests, it never re-authors).
    const originRow = must(claimants.get(origin.device_id), "the honest origin's own row");
    expect(originRow.reason).toBe("storage_reject");
    const received = JSON.parse(
      JSON.stringify(must(push.events[1], "the relayed poison as received")),
    ) as unknown;
    expect(originRow.envelope).toEqual(received);
    // A's pre-claim is untouched by O's arrival — neither device inherits the other's.
    const insiderRow = must(claimants.get(insider.device_id), "the pre-claimer's row");
    expect(insiderRow.reason).toBe("schema_invalid");
    expect(insiderRow.envelope).not.toEqual(originRow.envelope);

    // NO alarm, because nothing was lost: the slot is covered by attribution
    // (01-F37 / DEC-SYNC-005). Loudness on a GENUINE loss is pinned in
    // quarantine-key-auditor.test.ts, describes A3 and A4.
    const report = await runAuditor({ db, org_id: hub.org_id });
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === origin.device_id)).toEqual(
      [],
    );
    expect(byCheck(report, "lamport_gap").filter((f) => f.device_id === insider.device_id)).toEqual(
      [],
    );
  });
});
