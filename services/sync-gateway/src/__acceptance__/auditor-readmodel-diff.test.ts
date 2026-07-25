// T-01-11 oracle — the REFOLD-vs-READ-MODEL DIFF leg (DEC-TEST-003; 20 §4.2
// "refold the entire ledger … and diff against the incrementally-maintained
// read models"; 01-F7 Wave-0 shape per wave-0-scope.yml: "Auditor demonstrates
// rebuildable projections; per-module read models are later" — the leg takes a
// projection SNAPSHOT, no cloud read model exists yet).
//
// CRITICAL SHAPE LAW (26 §8 / 01-F34 rewritten): the Auditor's independent
// fold of the merged set uses the REAL merge engine from @restos/sync-client —
// fold-specific convergence (equal delivered set ⇒ byte-equal projection).
// The suite's expectation side is computed with that engine through the public
// openStore surface; a read model built WITHOUT any ordering metadata (a
// LAN-only device: no global_seq adoption, reversed delivery) must diff CLEAN.
// The banned universal-canonical-replay oracle — which would false-alarm on
// exactly that model — must NOT be reincarnated here (T-01-15 oracle rule;
// the min-id/comparator lesson of 26 §8).
// RED-AWAITING-IMPLEMENTATION: runAuditor is not exported yet.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  byCheck,
  confirmed,
  created,
  edge,
  evt,
  foldReadModel,
  lineAdded,
  payment,
  refund,
  runAuditor,
  settlementClosed,
  type WireEvent,
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
  TEST_TOKEN_SECRET,
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

/** Builds a two-order branch through the real gateway and returns its merged
 * wire events via the real catchup path (reader = a fresh registered device).
 * o1 carries a real order.confirmed (the queue-row anchor — a line edge to
 * "confirmed" is not the confirm fact), so the queue projection is non-empty
 * and the queue-drift leg genuinely drifts. */
const buildBranch = async (): Promise<{
  org: Identity;
  o1: string;
  o2: string;
  wire: WireEvent[];
}> => {
  const d = freshIdentity();
  const o1 = `O1-${d.device_id}`;
  const o2 = `O2-${d.device_id}`;
  const session = await openSession(gateway, d);
  const e1 = evt(d, 4, edge(o1, "L1", "confirmed", ["placed"]));
  await session.conn.handle(
    pushMsg([
      evt(d, 0, created(o1)),
      evt(d, 1, lineAdded(o1, "L1", 2, 350)),
      evt(d, 2, payment(o1, 700, { attempt: `P-${o1}` })),
      evt(d, 3, settlementClosed(o1)),
      e1,
      evt(d, 5, created(o2)),
      evt(d, 6, lineAdded(o2, "L1", 1, 500)),
      evt(d, 7, refund(o1, 100, { attempt: `R-${o1}`, parent_attempt: `P-${o1}` })),
      evt(d, 8, confirmed(o1)),
    ]),
  );
  session.conn.close();
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
  return { org: d, o1, o2, wire };
};

const diff = async (
  orgId: string,
  read_model: import("./auditor-builders.js").ReadModelInput,
): Promise<import("./auditor-builders.js").AuditorFinding[]> =>
  byCheck(await runAuditor({ db, org_id: orgId, read_model }), "readmodel_diff");

describe("diff leg 1 — a faithfully-maintained model diffs clean (01-F7 / 01-F6)", () => {
  it("01-F7/01-F6: a read model folded from the real catchup stream (global_seq adopted) diffs clean against the Auditor's independent refold — zero readmodel_diff findings", async () => {
    const { org, wire } = await buildBranch();
    const model = foldReadModel(org, wire);
    expect(
      await diff(org.org_id, {
        branch_id: org.branch_id,
        orders: model.orders,
        queue: model.queue,
      }),
    ).toEqual([]);
  });

  it("01-F34/26 §8: a LAN-only model — SAME delivered set, REVERSED delivery, NO global_seq adoption, zero ordering metadata — diffs clean too (fold-specific convergence; a reincarnated canonical-replay comparator would false-alarm exactly here)", async () => {
    const { org, wire } = await buildBranch();
    const model = foldReadModel(org, wire, { reversed: true, adoptSeq: false });
    expect(
      await diff(org.org_id, {
        branch_id: org.branch_id,
        orders: model.orders,
        queue: model.queue,
      }),
    ).toEqual([]);
  });
});

describe("diff leg 2 — any drift is a finding (20 §4.2 'Any diff = high-priority alert')", () => {
  it("01-F7/01-F30: one tampered money cell (pay_total +1 on one order) yields a readmodel_diff finding naming that order — and only that order", async () => {
    const { org, o1, wire } = await buildBranch();
    const model = foldReadModel(org, wire);
    const tampered = model.orders.map((row) =>
      row.order_id === o1 ? { ...row, pay_total: row.pay_total + 1 } : row,
    );
    const findings = await diff(org.org_id, {
      branch_id: org.branch_id,
      orders: tampered,
      queue: model.queue,
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) expect(finding.order_id).toBe(o1);
  });

  it("01-F7: a MISSING order row and an EXTRA phantom order row are both findings naming their orders", async () => {
    const { org, o2, wire } = await buildBranch();
    const model = foldReadModel(org, wire);
    const phantomId = `O-phantom-${org.device_id}`;
    const template = must(model.orders[0], "at least one projected order");
    const withDriftedSet = [
      ...model.orders.filter((row) => row.order_id !== o2), // o2 dropped
      { ...template, order_id: phantomId }, // phantom added
    ];
    const findings = await diff(org.org_id, {
      branch_id: org.branch_id,
      orders: withDriftedSet,
      queue: model.queue,
    });
    const named = findings.map((f) => f.order_id);
    expect(named).toContain(o2);
    expect(named).toContain(phantomId);
  });

  it("01-F7/03-F19: kitchen-queue drift (lines_ready off by one) is a finding naming the order — the queue projection is diffed too", async () => {
    const { org, o1, wire } = await buildBranch();
    const model = foldReadModel(org, wire);
    const drifted = model.queue.map((row) =>
      row.order_id === o1 ? { ...row, lines_ready: row.lines_ready + 1 } : row,
    );
    const findings = await diff(org.org_id, {
      branch_id: org.branch_id,
      orders: model.orders,
      queue: drifted,
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(must(findings[0], "queue-drift finding").order_id).toBe(o1);
  });
});
