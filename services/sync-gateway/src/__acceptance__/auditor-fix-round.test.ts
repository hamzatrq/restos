// T-01-11 FIX ROUND oracle — rulings F1/F2/F3/F5
// (plans/wave-0/t-01-11-fix-round.md @ 0a31d57, BINDING). Authored from the
// fix-round rulings + specs/01-kernel-sync.md (01-F3/F4/F7/F8/F30/F32/F37) +
// DEC-SYNC-005/007 + the t-01-08 fix-round F-1 magnitude precedent ONLY
// (24 §3 step 2: read-only to the implementing session). The six prior T-01-11
// suites are untouched and stay binding — nothing here weakens a pin.
//
// RED-AWAITING-FIX map (each red verified to fail for the ruled reason):
//   F1a — the conservation leg passes the refold's billed total straight into
//         domain settledConservationResidualPaisa; a merged registry-valid
//         line of qty 2^27 × unit_price 2^27 makes billed 2^54 (> 2^53−1), the
//         domain guard throws RangeError, and TODAY the WHOLE org's report
//         aborts (charter violation: the report survives ANY poisoned input —
//         never silent). Ruled: per-order guard — the RangeError becomes a
//         conservation-class finding naming the order (magnitude argument as
//         at the gateway, t-01-08 fix-round F-1: an unrepresentable Σ
//         necessarily violates any schema-valid ceiling).
//   F1b — the refold parses every merged envelope with domain parseEvent; a
//         kernel.events row whose stored envelope the CURRENT registry cannot
//         parse (reachable only by corruption or registry drift — the gateway
//         gate would have quarantined it, so the fixture raw-inserts) TODAY
//         throws and aborts the report. Ruled: per-event guard — a structured
//         `unparseable_merged_event` finding; the refold skips the event and
//         every other leg still lands.
//   F2  — (GATEWAY-side) the shipped push loop credits a quarantined
//         envelope's lamport slot at classification time, but the row insert
//         runs later under ON CONFLICT (org_id, claimed_event_id) DO NOTHING:
//         two quarantined envelopes sharing ONE claimed id at slots k and k+1
//         in one push store ONE row (slot k) yet fill BOTH slots — the
//         watermark advances over k+1, a slot durably held by NOTHING (the
//         false-gap state the Auditor then reports). Ruled: fill a slot ONLY
//         when the quarantine row was actually stored — the coverage law's
//         premise ("the slot is durably held by the row", DEC-SYNC-005)
//         becomes true by construction; the Auditor is unchanged on this
//         point and the state audits gap-clean.
//   F3  — the gap leg walks every slot in [0..hi] and emits one finding per
//         missing slot: a corrupt acked_watermark of 100000 over a 2-slot
//         stream TODAY yields 99999 findings (unbounded report — the
//         watermark-corruption class must produce a bounded report, not a
//         hang). Ruled: contiguous missing slots aggregate into ONE range
//         finding (lamport_seq = the run's first missing slot; the detail
//         names the extent); short runs keep their per-slot findings (the
//         prior corruption pins 1/2/3 stand untouched).
//   F5  — the diff leg keys the supplied arrays by order_id into a Map, so a
//         duplicate order_id row collapses silently and diffs CLEAN. Ruled: a
//         duplicate order_id in the supplied read-model arrays is ITSELF a
//         readmodel_diff finding.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  byCheck,
  created,
  evt,
  foldReadModel,
  lineAdded,
  payment,
  runAuditor,
  settlementClosed,
  setWatermark,
  type WireEvent,
} from "./auditor-builders.js";
import {
  BASE_T,
  catchupMsg,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  invalidPayloadEnvelope,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  quarantineRows,
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

/** Raw-insert one merged row (test-side corruption — the gateway itself would
 * have quarantined this envelope at the 01-F4 gate, so only corruption or a
 * registry drift can put it in kernel.events; the Auditor exists for exactly
 * that). global_seq continues the org's stream to respect the unique index. */
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

describe("F1a — unrepresentable magnitude is a FINDING, never an abort (01-F30 / 01-F32)", () => {
  it("01-F30/01-F32 (t-01-11 fix round F1a): a merged registry-valid line of qty 2^27 × unit price 2^27 on a settled order — the report RETURNS with a conservation finding naming the order; the RangeError abort is the ruled defect", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    // qty and unit_price_paisa are EACH schema-valid integers (the registry cap
    // is 2^53−1); their product 2^54 is not a safe integer — the t-01-08 F-1
    // magnitude class, now on the Auditor's refold path.
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2 ** 27, 2 ** 27)),
        evt(d, 2, settlementClosed(o)),
      ]),
    );
    session.conn.close();
    // TODAY this await REJECTS with the domain RangeError ("billed_paisa must
    // be a non-negative safe integer …") — the whole-org abort ruled a charter
    // violation. The pin: the report returns, structured.
    const report = await runAuditor({ db, org_id: d.org_id });
    expect(report.ok).toBe(false);
    const finding = must(
      byCheck(report, "conservation").find((f) => f.order_id === o),
      "conservation finding naming the overflow order",
    );
    expect(finding.org_id).toBe(d.org_id);
  });
});

describe("F1b — an unparseable MERGED envelope is a structured finding; the report survives (01-F4 / 01-F7)", () => {
  it("01-F4/01-F7 (t-01-11 fix round F1b): a raw-inserted merged row the current registry cannot parse yields an unparseable_merged_event finding naming the row — the refold skips it, the report survives, the org's OTHER findings still land, and no gap is manufactured (01-F3)", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    // A genuinely short settled order (billed 1000, tendered 600): the org's
    // OTHER finding, which must still land after the guard skips the poison.
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2, 500)),
        evt(d, 2, payment(o, 600, { attempt: `P-${o}` })),
        evt(d, 3, settlementClosed(o)),
      ]),
    );
    session.conn.close();
    // The poison: order.created with an empty payload — wire-shaped, registry-
    // INVALID — raw-inserted under a fresh device at slot 0 (corruption class;
    // the gateway gate would have quarantined it).
    const ghost: Identity = {
      org_id: d.org_id,
      branch_id: d.branch_id,
      device_id: `${d.device_id}-raw`,
    };
    const poison = invalidPayloadEnvelope(ghost, 0);
    await insertRawMergedRow(db, ghost, poison as unknown as Record<string, unknown>, 0);
    // TODAY this await REJECTS (parseEvent throws inside the refold).
    const report = await runAuditor({ db, org_id: d.org_id });
    expect(report.ok).toBe(false);
    const unparseable = byCheck(report, "unparseable_merged_event");
    expect(unparseable).toHaveLength(1);
    const finding = must(unparseable[0], "unparseable_merged_event finding");
    expect(finding.event_id).toBe(poison.id);
    expect(finding.org_id).toBe(d.org_id);
    // The refold proceeded without the poison: the short settled order's
    // conservation finding still lands (report survives ≠ report goes blind).
    expect(byCheck(report, "conservation").some((f) => f.order_id === o)).toBe(true);
    // The poisoned row still COVERS its own slot (it is a merged row): the
    // guard must not manufacture a lamport gap out of an unparseable envelope.
    expect(byCheck(report, "lamport_gap")).toEqual([]);
  });
});

describe("F2 — a lamport slot is credited ONLY when its quarantine row actually stored (GATEWAY; 01-F8 / 01-F37 / DEC-SYNC-005)", () => {
  /** One push: [merged slot 0, poison slot 1, SAME-claimed-id poison slot 2].
   * First-stored-wins keeps ONE row (slot 1); slot 2 is durably held by
   * NOTHING and must earn no watermark credit. */
  const doubleClaimPush = async (): Promise<{
    d: Identity;
    poisonId: string;
    ackedWatermark: number | undefined;
  }> => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const poisonA = unknownTypeEnvelope(d, 1);
    const poisonB = { ...poisonA, lamport_seq: 2, device_created_at: BASE_T + 2 };
    await session.conn.handle(pushMsg([validEnvelope(d, 0), poisonA, poisonB]));
    const ack = ofKind(session.rec.all, "push_ack")[0];
    session.conn.close();
    return { d, poisonId: poisonA.id, ackedWatermark: ack?.acked_watermark };
  };

  it("01-F8/01-F37/DEC-SYNC-005 (t-01-11 fix round F2): two quarantined envelopes with ONE claimed id at slots 1 and 2 in one push — one row stores (slot 1, first wins) and the watermark and ack stop at 1, never crediting the rowless slot 2", async () => {
    const { d, poisonId, ackedWatermark } = await doubleClaimPush();
    const rows = (await quarantineRows(db, d.org_id)).filter(
      (row) => row.claimed_event_id === poisonId,
    );
    expect(rows).toHaveLength(1);
    // The stored row IS the slot-1 envelope (first stored wins, 01-F37) — the
    // only slot a quarantine row durably holds for this claimed id.
    expect(must(rows[0], "stored quarantine row").envelope.lamport_seq).toBe(1);
    // TODAY both fills ran and the watermark claims slot 2 — a slot nothing
    // holds (the exact 01-F8 corruption class the Auditor's corruption-3 pin
    // flags when a test writes it by hand; here the GATEWAY manufactures it).
    expect(await storedWatermark(db, d.org_id, d.device_id)).toBe(1);
    expect(ackedWatermark).toBe(1);
  });

  it("01-F3/01-F8/DEC-SYNC-005 (t-01-11 fix round F2): the same-claimed-id double-quarantine state audits GAP-CLEAN — every credited slot is durably held by construction, so the Auditor reports NO gap", async () => {
    const { d } = await doubleClaimPush();
    expect(byCheck(await runAuditor({ db, org_id: d.org_id }), "lamport_gap")).toEqual([]);
  });
});

describe("F3 — watermark corruption yields ONE aggregated range finding, bounded (01-F3 / 01-F8)", () => {
  it("01-F3/01-F8 (t-01-11 fix round F3): a corrupt acked_watermark of 100000 over a stream holding only slots 0..1 yields exactly ONE lamport_gap finding for the whole missing range — lamport_seq = the run's first missing slot, the detail names the extent, and the run stays bounded", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    await session.conn.handle(pushMsg(validEnvelopes(d, 0, 2)));
    session.conn.close();
    await setWatermark(db, d.org_id, d.device_id, 100_000);
    const startedAt = performance.now();
    const report = await runAuditor({ db, org_id: d.org_id });
    const elapsedMs = performance.now() - startedAt;
    const findings = byCheck(report, "lamport_gap");
    // TODAY: 99999 per-slot findings (unbounded report). Ruled: ONE range row.
    expect(findings).toHaveLength(1);
    const finding = must(findings[0], "aggregated range finding");
    expect(finding.device_id).toBe(d.device_id);
    expect(finding.org_id).toBe(d.org_id);
    expect(finding.lamport_seq).toBe(2);
    expect(finding.detail).toContain("100000");
    // Bounded report, sane runtime — the watermark-corruption class must never
    // hang the nightly job (generous bound; the hang class is orders beyond it).
    expect(elapsedMs).toBeLessThan(10_000);
  });
});

describe("F5 — a duplicate order_id in the supplied read model is itself a finding (01-F7)", () => {
  it("01-F7 (t-01-11 fix round F5): duplicating one order row in the supplied read-model array yields a readmodel_diff finding naming that order — duplicates never collapse silently", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([evt(d, 0, created(o)), evt(d, 1, lineAdded(o, "L1", 1, 500))]),
    );
    session.conn.close();
    // A faithful model via the REAL catchup path + REAL engine (the prior
    // suites' pattern) — then the SAME row supplied twice, byte-identical.
    const reader: Identity = {
      org_id: d.org_id,
      branch_id: d.branch_id,
      device_id: `${d.device_id}-r`,
    };
    const readerSession = await openSession(gateway, reader);
    const wire: WireEvent[] = [];
    let from = 0;
    for (;;) {
      await readerSession.conn.handle(catchupMsg(from));
      const pages = ofKind(readerSession.rec.all, "catchup_response");
      const page = must(pages[pages.length - 1], "catchup page");
      wire.push(...(page.events as WireEvent[]));
      if (page.complete) break;
      from = page.next_from;
    }
    readerSession.conn.close();
    const model = foldReadModel(d, wire);
    const row = must(
      model.orders.find((r) => r.order_id === o),
      "projected order row",
    );
    const report = await runAuditor({
      db,
      org_id: d.org_id,
      read_model: {
        branch_id: d.branch_id,
        orders: [...model.orders, { ...row }],
        queue: model.queue,
      },
    });
    // TODAY the Map key collapses the duplicate and the diff reads CLEAN.
    expect(report.ok).toBe(false);
    expect(byCheck(report, "readmodel_diff").some((f) => f.order_id === o)).toBe(true);
  });
});
