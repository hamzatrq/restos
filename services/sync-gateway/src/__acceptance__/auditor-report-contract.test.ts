// T-01-11 oracle — the Auditor's OUTPUT CONTRACT (DEC-TEST-003 accepted;
// 20 §4.2: "refold … diff … Any diff = high-priority alert"; the pinned module
// surface lives in auditor-builders.ts and is BINDING for the implementing
// session, T-01-09 precedent). Five laws:
//   1. Vacuous health: an org with no data → { ok: true, findings: [] }.
//   2. Healthy fixture: a rich org built ENTIRELY through the landed gateway
//      (plain + relay sessions, every-day quarantine, exact-cover settled
//      order, audit chain, device-fed read model) → zero findings. The Auditor
//      must never false-alarm on states the landed pipeline legitimately
//      produces (DEC-SYNC-005/009; t-01-12 F1/F2 attribution).
//   3. Findings are STRUCTURED rows of the pinned shape; ok ⇔ findings empty.
//   4. READ-ONLY (01-F1 posture, pinned across ALL kernel tables): a run over a
//      corrupted org changes not one byte of kernel.events / quarantine /
//      quarantine_notices / device_watermarks / org_sequences / device_registry.
//   5. Org isolation (00 §5.4): corruption in org A yields zero findings for a
//      healthy org B.
// RED-AWAITING-IMPLEMENTATION: runAuditor is not exported yet.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  AUDITOR_CHECKS,
  auditChain,
  byCheck,
  created,
  deleteEventRow,
  edge,
  evt,
  foldReadModel,
  kernelSnapshot,
  lineAdded,
  payment,
  refund,
  runAuditor,
  settlementClosed,
} from "./auditor-builders.js";
import {
  catchupMsg,
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

/**
 * The healthy master org — every state class the landed pipeline produces on a
 * good day, built only through the gateway:
 *  - plain device D: order O1 (created + line 2×500 + exact-cover payment +
 *    settlement_closed), a 2-link audit chain, and a schema_invalid poison
 *    event mid-stream (slot-filled per DEC-SYNC-005);
 *  - hub H (registered counter_electron + hub_relay claim) relaying WAN-less
 *    waiter W's order O2 (created + line + one LEGAL edge chain link);
 *  - crash-replay: D's first batch re-pushed verbatim (dedupe-through).
 * Returns everything a suite needs to audit and diff it.
 */
const buildHealthyOrg = async (): Promise<{
  org: Identity;
  branch_id: string;
  o1: string;
  o2: string;
}> => {
  const d = freshIdentity();
  const h: Identity = { org_id: d.org_id, branch_id: d.branch_id, device_id: `${d.device_id}-h` };
  const w: Identity = { org_id: d.org_id, branch_id: d.branch_id, device_id: `${d.device_id}-w` };
  const o1 = `O1-${d.device_id}`;
  const o2 = `O2-${d.device_id}`;

  const sessionD = await openSession(gateway, d);
  const batch1 = [
    evt(d, 0, created(o1)),
    evt(d, 1, lineAdded(o1, "L1", 2, 500)),
    unknownTypeEnvelope(d, 2),
    evt(d, 3, payment(o1, 1000, { attempt: `A1-${o1}` })),
  ];
  await sessionD.conn.handle(pushMsg(batch1));
  // Crash-replay (t-01-09 F1(a) class): the same batch again — dedupe-through.
  await sessionD.conn.handle(pushMsg(batch1));
  const chain = auditChain(d, 4, ["audit.login", "audit.drawer_opened"]);
  await sessionD.conn.handle(pushMsg([...chain, evt(d, 6, settlementClosed(o1))]));

  // Relay leg (DEC-SYNC-009 / T-01-09): registered hub + registered origin.
  await registerIdentity(db, h);
  await registerIdentity(db, w, "waiter");
  const hubSession = await openSession(gateway, h, {
    token: signedToken({ ...h, hub_relay: true }),
  });
  const wCreated = evt(w, 0, created(o2));
  const wLine = evt(w, 1, lineAdded(o2, "L1", 1, 250));
  const wEdge = evt(w, 2, edge(o2, "L1", "confirmed", ["placed"]));
  await hubSession.conn.handle(pushMsg([wCreated, wLine, wEdge]));

  sessionD.conn.close();
  hubSession.conn.close();
  return { org: d, branch_id: d.branch_id, o1, o2 };
};

/** Every merged wire event of one branch, paged through the REAL catchup path. */
const catchupAll = async (
  identity: Identity,
): Promise<import("./auditor-builders.js").WireEvent[]> => {
  const session = await openSession(gateway, identity);
  const events: import("./auditor-builders.js").WireEvent[] = [];
  let from = 0;
  for (;;) {
    await session.conn.handle(catchupMsg(from));
    const responses = ofKind(session.rec.all, "catchup_response");
    const page = must(responses[responses.length - 1], "catchup_response page");
    events.push(...(page.events as import("./auditor-builders.js").WireEvent[]));
    if (page.complete) break;
    from = page.next_from;
  }
  session.conn.close();
  return events;
};

describe("T-01-11 law 1 — vacuous health (20 §4.2 / DEC-TEST-003)", () => {
  it("01-F7: an org with no rows in any kernel table audits clean — { ok: true, findings: [] }", async () => {
    const report = await runAuditor({ db, org_id: freshIdentity().org_id });
    expect(report).toEqual({ ok: true, findings: [] });
  });
});

describe("T-01-11 law 2 — zero findings on a healthy gateway-built org (20 §4.2)", () => {
  it("01-F7/01-F37/DEC-SYNC-005/DEC-SYNC-009: plain + relay + poison-slot + crash-replay + audit chain + settled order + device-fed read model — the Auditor reports NOTHING on a state the landed pipeline legitimately produced", async () => {
    const { org, branch_id } = await buildHealthyOrg();
    const reader = { org_id: org.org_id, branch_id, device_id: `${org.device_id}-r` };
    const wire = await catchupAll(reader);
    const model = foldReadModel({ org_id: org.org_id, branch_id }, wire);
    const report = await runAuditor({
      db,
      org_id: org.org_id,
      read_model: { branch_id, orders: model.orders, queue: model.queue },
    });
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("T-01-11 law 3 — findings are structured rows; ok ⇔ empty (DEC-TEST-003)", () => {
  it("01-F7/01-F3: a corrupted org yields ok:false and every finding carries exactly the pinned keys (check ∈ the closed set, org_id = the audited org)", async () => {
    const { org, o1 } = await buildHealthyOrg();
    // Two independent violation classes: a mid-stream ledger gap (delete D's
    // line_added at slot 1) — hits both lamport_gap and the fold legs' input.
    const rows = await db.execute(
      sql`select id from kernel.events
          where org_id = ${org.org_id} and device_id = ${org.device_id} and lamport_seq = 1`,
    );
    await deleteEventRow(db, org.org_id, String(must([...rows][0], "slot-1 row").id));
    const report = await runAuditor({ db, org_id: org.org_id });
    expect(report.ok).toBe(false);
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(Object.keys(finding).sort()).toEqual([
        "check",
        "detail",
        "device_id",
        "event_id",
        "lamport_seq",
        "order_id",
        "org_id",
      ]);
      expect(AUDITOR_CHECKS).toContain(finding.check);
      expect(finding.org_id).toBe(org.org_id);
      expect(typeof finding.detail).toBe("string");
    }
    expect(byCheck(report, "lamport_gap").length).toBeGreaterThan(0);
    // The deleted slot names the device and the slot.
    const gap = must(
      byCheck(report, "lamport_gap").find((f) => f.device_id === org.device_id),
      "gap finding for the corrupted device",
    );
    expect(gap.lamport_seq).toBe(1);
    // o1 stays referenced so the fixture reads clearly; no order-leg pin here.
    expect(o1.length).toBeGreaterThan(0);
  });
});

describe("T-01-11 law 4 — the Auditor is READ-ONLY (01-F1 posture over ALL kernel tables)", () => {
  it("01-F1/01-F7: a run over a violating org changes not one byte of any kernel table — events, quarantine, notices, watermarks, sequences, registry", async () => {
    const { org } = await buildHealthyOrg();
    // Corrupt: over-refund the merged log via the unprovable-parent path
    // (refund merges first — the gateway cannot prove; the parent lands later,
    // smaller: 01-F17 by design, DEC-SYNC-007 names this the Auditor's job).
    const x: Identity = {
      org_id: org.org_id,
      branch_id: org.branch_id,
      device_id: `${org.device_id}-x`,
    };
    const ox = `OX-${x.device_id}`;
    const sessionX = await openSession(gateway, x);
    await sessionX.conn.handle(
      pushMsg([
        evt(x, 0, created(ox)),
        evt(x, 1, lineAdded(ox, "L1", 1, 500)),
        evt(x, 2, refund(ox, 600, { attempt: `RX-${ox}`, parent_attempt: `PX-${ox}` })),
        evt(x, 3, payment(ox, 500, { attempt: `PX-${ox}` })),
      ]),
    );
    sessionX.conn.close();
    const before = await kernelSnapshot(db, org.org_id);
    const report = await runAuditor({ db, org_id: org.org_id });
    expect(report.ok).toBe(false);
    const after = await kernelSnapshot(db, org.org_id);
    expect(after).toBe(before);
  });
});

describe("T-01-11 law 5 — org isolation (00 §5.4)", () => {
  it("01-F7/00 §5.4: corruption in org A produces zero findings for healthy org B", async () => {
    const a = await buildHealthyOrg();
    const b = await buildHealthyOrg();
    const rows = await db.execute(
      sql`select id from kernel.events
          where org_id = ${a.org.org_id} and device_id = ${a.org.device_id} and lamport_seq = 0`,
    );
    await deleteEventRow(db, a.org.org_id, String(must([...rows][0], "org-A slot-0 row").id));
    const reportB = await runAuditor({ db, org_id: b.org.org_id });
    expect(reportB.findings).toEqual([]);
    const reportA = await runAuditor({ db, org_id: a.org.org_id });
    expect(reportA.ok).toBe(false);
  });
});
