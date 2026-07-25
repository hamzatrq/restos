// T-01-11 oracle — MONEY CONSERVATION over the merged log (DEC-TEST-003;
// 01-F30 as amended July 2026: "Conservation invariants … enforced by the
// Auditor (20 §4.2)"; DEC-SYNC-007 accepted: fold-requiring conservation is
// the Auditor's refold job, the gateway enforces only the provable half).
//
// Pinned laws (void/comp/discount value terms are 0 at v1 — 26 §7: those event
// types have no payload schema; billed derives from delivered lines, exited
// lines excluded — "a fully-voided order nets to zero"):
//   C-a  Refund cap as a SET predicate (01-F29/01-F31): per parent attempt
//        key, Σ agreed refunds over UNIQUE refund attempt keys ≤ the parent's
//        agreed amount — the same domain rule the gateway calls
//        (refundRemainderExceeded), evaluated over the WHOLE merged set, so it
//        catches exactly what the merge-time provable-only check passes
//        through by design (late parents — invariant-refund-cap law 3; the
//        t-01-08 fix-round F-4 note names this "Auditor territory").
//   C-b  Once settled (order.settlement_closed delivered, 01-F33), Σ tendering
//        (purpose settles_order) − Σ refunds must equal billed (01-F30/01-F32
//        "No order reaches settled state with conservation violated") — a
//        SHORTFALL is a finding. (Whether excess tender is a violation is NOT
//        pinned — EXCESS_TENDER_IS_EXCEPTION is an open product constant.)
//   C-c  purpose discriminator (DEC-MONEY-007/01-F32): repays_receivable
//        payments are NEVER tender — a repaid tab must not read as overpaid
//        (no false alarm), and a "settled" order covered ONLY by a repayment
//        is NOT conserved (a repay is not tender).
//   C-d  Unsettled orders carry no settle-equation obligation (an open order
//        mid-service is unbalanced by nature); the cap (C-a) binds regardless.
// RED-AWAITING-IMPLEMENTATION: runAuditor is not exported yet.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  byCheck,
  created,
  edge,
  evt,
  lineAdded,
  payment,
  refund,
  runAuditor,
  settlementClosed,
} from "./auditor-builders.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  makeClock,
  must,
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

const conservation = async (orgId: string) =>
  byCheck(await runAuditor({ db, org_id: orgId }), "conservation");

describe("C-a — the refund cap over the merged SET (01-F30 / 01-F29 / DEC-SYNC-007)", () => {
  it("01-F30/01-F29: a refund merged while its parent was unprovable, followed by a SMALLER parent, is a cap violation over the set — the gateway passed both by design (01-F17); the Auditor flags the order", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 1, 500)),
        // Refund BEFORE its parent: unprovable at merge time → merges (law 3
        // of invariant-refund-cap pins that pass; DEC-SYNC-007).
        evt(d, 2, refund(o, 600, { attempt: `R-${o}`, parent_attempt: `P-${o}` })),
        evt(d, 3, payment(o, 500, { attempt: `P-${o}` })),
      ]),
    );
    session.conn.close();
    const findings = await conservation(d.org_id);
    const capFinding = must(
      findings.find((f) => f.order_id === o),
      "cap-violation finding for the order",
    );
    expect(capFinding.org_id).toBe(d.org_id);
  });

  it("01-F30/01-F31: exact cover over UNIQUE attempt keys is NOT a violation — 600+400 against 1000, with the 400 re-expressed under a second envelope id (same attempt key, counted once) — zero conservation findings", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    const r2 = evt(d, 4, refund(o, 400, { attempt: `R2-${o}`, parent_attempt: `P-${o}` }));
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2, 500)),
        evt(d, 2, payment(o, 1000, { attempt: `P-${o}` })),
        evt(d, 3, refund(o, 600, { attempt: `R1-${o}`, parent_attempt: `P-${o}` })),
        r2,
        // The same 400 intent under a FRESH envelope id (crash-retry after the
        // outbox was lost): same attempt key — merges (01-F31 first-wins;
        // invariant-refund-cap pins the pass), adds no new money.
        evt(d, 5, { type: "payment.refunded", payload: r2.payload as Record<string, unknown> }),
      ]),
    );
    session.conn.close();
    expect(await conservation(d.org_id)).toEqual([]);
  });
});

describe("C-b — the settled equation (01-F30 / 01-F32 / 01-F33)", () => {
  it("01-F30/01-F32: a settlement_closed order whose tendering falls SHORT of billed (600 against 2×500) is a conservation finding naming the order", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2, 500)),
        evt(d, 2, payment(o, 600, { attempt: `P-${o}` })),
        evt(d, 3, settlementClosed(o)),
      ]),
    );
    session.conn.close();
    const findings = await conservation(d.org_id);
    expect(findings.length).toBeGreaterThan(0);
    expect(must(findings[0], "shortfall finding").order_id).toBe(o);
  });

  it("01-F30: a fully-voided settled order nets to zero — every line legally voided, no payments, settlement_closed — zero conservation findings", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 3, 400)),
        // placed → voided is a legal exit (01 §4; LEGAL_NEXT.placed includes it).
        evt(d, 2, edge(o, "L1", "voided", ["placed"])),
        evt(d, 3, settlementClosed(o)),
      ]),
    );
    session.conn.close();
    expect(await conservation(d.org_id)).toEqual([]);
  });

  it("01-F30/01-F17 (C-d): an UNSETTLED short order carries no settle-equation obligation — created + line + partial payment, no close — zero conservation findings", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 2, 500)),
        evt(d, 2, payment(o, 300, { attempt: `P-${o}` })),
      ]),
    );
    session.conn.close();
    expect(await conservation(d.org_id)).toEqual([]);
  });
});

describe("C-c — the purpose discriminator (01-F30 / 01-F32 / DEC-MONEY-007)", () => {
  it("01-F32/01-F30: a settled exact-cover order followed by a repays_receivable payment referencing it audits CLEAN — a repaid tab never reads as overpaid (the repay is not tender, no false alarm)", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 1, 500)),
        evt(d, 2, payment(o, 500, { attempt: `P-${o}` })),
        evt(d, 3, settlementClosed(o)),
        evt(d, 4, payment(o, 200, { attempt: `K-${o}`, purpose: "repays_receivable" })),
      ]),
    );
    session.conn.close();
    expect(await conservation(d.org_id)).toEqual([]);
  });

  it("01-F30/DEC-MONEY-007: a settlement_closed order covered ONLY by a repays_receivable payment equal to billed is NOT conserved — a repayment is never tender, the finding names the order", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 1, 500)),
        evt(d, 2, payment(o, 500, { attempt: `K-${o}`, purpose: "repays_receivable" })),
        evt(d, 3, settlementClosed(o)),
      ]),
    );
    session.conn.close();
    const findings = await conservation(d.org_id);
    expect(findings.length).toBeGreaterThan(0);
    expect(must(findings[0], "repay-only finding").order_id).toBe(o);
  });
});
