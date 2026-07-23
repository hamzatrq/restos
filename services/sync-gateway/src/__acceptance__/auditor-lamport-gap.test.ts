// T-01-11 oracle — the per-origin lamport GAP-FREE check (DEC-TEST-003;
// 20 §4.2 "per-device lamport sequences gap-free"; 01-F3/01-F8; DEC-SYNC-005
// accepted: "the Auditor counts quarantine rows as slot-filling").
//
// The pinned law (auditor-builders header): per (org, device) with
// W = acked_watermark (-1 when absent) and hi = max(W, max merged lamport),
// every slot in [0..hi] is covered by a kernel.events row or a
// kernel.quarantine row ATTRIBUTED to the device (row.device_id — the t-01-12
// F2 attribution ruling) at that stored-envelope lamport. Rows of the NO-FILL
// classes (relay identity-mismatch, origin_unregistered, origin_revoked — the
// t-01-12 F1 / T-01-09 rulings) never extend the obligation: they were never
// watermark-credited, so they must never manufacture a gap.
//
// Greens here are impossible before the feature exists (every test calls
// runAuditor) — the no-false-alarm laws are RED like the corruption laws, but
// their fixtures are built through the LANDED gateway only, so they bind the
// implementer to the real pipeline's states, not to a convenient model of it.
// RED-AWAITING-IMPLEMENTATION: runAuditor is not exported yet.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  byCheck,
  created,
  deleteEventRow,
  deleteQuarantineRow,
  evt,
  lineAdded,
  payment,
  refund,
  runAuditor,
  setWatermark,
} from "./auditor-builders.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  openDb,
  openSession,
  pushMsg,
  registerIdentity,
  signedToken,
  storedWatermark,
  TEST_TOKEN_SECRET,
  unknownTypeEnvelope,
  validEnvelope,
  validEnvelopes,
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

const gapFindings = async (orgId: string) =>
  byCheck(await runAuditor({ db, org_id: orgId }), "lamport_gap");

describe("no false alarm 1 — content-class quarantines fill their slots (DEC-SYNC-005 / 01-F37)", () => {
  it("01-F37/01-F3/DEC-SYNC-005: schema_invalid, invariant_violation and id_content_divergence slots inside a plain stream + a crash-replayed prefix audit GAP-CLEAN — the watermark advanced over every quarantined slot and the Auditor counts each row as its filler", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const o = `O-${d.device_id}`;
    // Slots: 0 created / 1 schema_invalid / 2 payment 500 / 3 over-refund
    // (invariant_violation — parent merged, remainder busted) / 4 line.
    const batch = [
      evt(d, 0, created(o)),
      unknownTypeEnvelope(d, 1),
      evt(d, 2, payment(o, 500, { attempt: `P-${o}` })),
      evt(d, 3, refund(o, 501, { attempt: `R-${o}`, parent_attempt: `P-${o}` })),
      evt(d, 4, lineAdded(o, "L1", 1, 500)),
    ];
    await session.conn.handle(pushMsg(batch));
    // Crash-replay: the same batch verbatim — dedupe-through, nothing changes.
    await session.conn.handle(pushMsg(batch));
    // Divergent re-push of slot-2's id at a FRESH slot 5 → id_content_divergence
    // fills slot 5 (step-3 divergence precedes the contiguity gate).
    const divergent = { ...batch[2], lamport_seq: 5 } as (typeof batch)[number];
    await session.conn.handle(pushMsg([divergent]));
    session.conn.close();
    expect(await storedWatermark(db, d.org_id, d.device_id)).toBe(5);
    expect(await gapFindings(d.org_id)).toEqual([]);
  });

  it("01-F37/DEC-SYNC-005: a PLAIN session's device_mismatch fills its OWN slot (t-01-12 F2: row attributed to the session device) — the stream audits gap-clean through the mismatch slot", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const foreign = validEnvelope(d, 1, { device_id: `${d.device_id}-other` });
    await session.conn.handle(pushMsg([validEnvelope(d, 0), foreign, validEnvelope(d, 2)]));
    session.conn.close();
    expect(await storedWatermark(db, d.org_id, d.device_id)).toBe(2);
    expect(await gapFindings(d.org_id)).toEqual([]);
  });
});

describe("no false alarm 2 — relay streams and the NO-FILL classes (DEC-SYNC-009 / t-01-12 F1/F2 / T-01-09)", () => {
  it("01-F3/01-F8/DEC-SYNC-009: hub-relayed origin streams, an origin_unregistered burst, a revoked origin's origin_revoked rows, and a relayed identity-mismatch all audit GAP-CLEAN — no-fill quarantine rows never manufacture obligations", async () => {
    const hub = freshIdentity();
    const origin: Identity = {
      org_id: hub.org_id,
      branch_id: hub.branch_id,
      device_id: `${hub.device_id}-w`,
    };
    const revoked: Identity = {
      org_id: hub.org_id,
      branch_id: hub.branch_id,
      device_id: `${hub.device_id}-rv`,
    };
    await registerIdentity(db, hub);
    await registerIdentity(db, origin, "waiter");
    await registerIdentity(db, revoked, "waiter");
    const session = await openSession(gateway, hub, {
      token: signedToken({ ...hub, hub_relay: true }),
    });
    // Relayed origin stream 0..2 + hub's own 0..1 interleaved.
    await session.conn.handle(pushMsg(validEnvelopes(origin, 0, 3)));
    await session.conn.handle(pushMsg(validEnvelopes(hub, 0, 2)));
    // origin_unregistered: a same-branch id with no registry row (rows attribute
    // to the SESSION hub, fill nothing — T-01-09 merge-boundary law).
    await session.conn.handle(
      pushMsg([
        validEnvelope({ ...origin, device_id: `${hub.device_id}-ghost` }, 0),
        validEnvelope({ ...origin, device_id: `${hub.device_id}-ghost` }, 1),
      ]),
    );
    // origin_revoked: registered-then-revoked origin (rows attribute to the
    // ORIGIN, fill nothing — beyond any watermark, no obligation).
    await db.execute(
      sql`update kernel.device_registry set revoked_at = 1
          where org_id = ${hub.org_id} and device_id = ${revoked.device_id}`,
    );
    await session.conn.handle(pushMsg(validEnvelopes(revoked, 0, 2)));
    // Relayed identity-mismatch (foreign branch): fills NO stream (F1).
    await session.conn.handle(
      pushMsg([validEnvelope(origin, 3, { branch_id: `${hub.branch_id}-other` })]),
    );
    session.conn.close();
    expect(await storedWatermark(db, hub.org_id, origin.device_id)).toBe(2);
    expect(await storedWatermark(db, hub.org_id, hub.device_id)).toBe(1);
    expect(await storedWatermark(db, hub.org_id, revoked.device_id)).toBeUndefined();
    expect(await gapFindings(hub.org_id)).toEqual([]);
  });
});

describe("corruption 1 — a missing merged slot is a gap (01-F3 / 20 §4.2)", () => {
  it("01-F3/01-F8: deleting the slot-1 event of a 0..3 stream yields exactly one lamport_gap finding naming the device and slot 1", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const events = validEnvelopes(d, 0, 4);
    await session.conn.handle(pushMsg(events));
    session.conn.close();
    await deleteEventRow(db, d.org_id, must(events[1], "slot-1 envelope").id);
    const findings = await gapFindings(d.org_id);
    expect(findings).toHaveLength(1);
    const gap = must(findings[0], "gap finding");
    expect(gap.device_id).toBe(d.device_id);
    expect(gap.lamport_seq).toBe(1);
    expect(gap.org_id).toBe(d.org_id);
  });
});

describe("corruption 2 — a missing QUARANTINE filler is a gap (DEC-SYNC-005)", () => {
  it("01-F37/DEC-SYNC-005: deleting the schema_invalid row whose slot the watermark advanced over leaves slot 1 uncovered — one lamport_gap finding (the quarantine row WAS the credited filler)", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const poison = unknownTypeEnvelope(d, 1);
    await session.conn.handle(pushMsg([validEnvelope(d, 0), poison, validEnvelope(d, 2)]));
    session.conn.close();
    expect(await storedWatermark(db, d.org_id, d.device_id)).toBe(2);
    await deleteQuarantineRow(db, d.org_id, poison.id);
    const findings = await gapFindings(d.org_id);
    expect(findings).toHaveLength(1);
    expect(must(findings[0], "gap finding").lamport_seq).toBe(1);
    expect(must(findings[0], "gap finding").device_id).toBe(d.device_id);
  });
});

describe("corruption 3 — a watermark beyond coverage is a gap (01-F8 / 19 §5)", () => {
  it("01-F8/01-F3: bumping acked_watermark from 1 to 4 with only slots 0..1 held yields lamport_gap findings for exactly slots 2, 3 and 4 — the ack must never claim slots nothing holds", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    await session.conn.handle(pushMsg(validEnvelopes(d, 0, 2)));
    session.conn.close();
    await setWatermark(db, d.org_id, d.device_id, 4);
    const findings = await gapFindings(d.org_id);
    const slots = findings.map((f) => f.lamport_seq).sort();
    expect(slots).toEqual([2, 3, 4]);
    for (const finding of findings) expect(finding.device_id).toBe(d.device_id);
  });
});
