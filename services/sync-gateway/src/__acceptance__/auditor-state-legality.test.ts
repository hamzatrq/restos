// T-01-11 oracle — STATE-MACHINE LEGALITY per line (DEC-TEST-003; 20 §4.2 "no
// order … transition outside the declared machine"; 01 §4 canonical machine;
// 01-F35 terminal monotonicity; 01-F34 rewritten — legality is a pure function
// of one edge's own payload (`from_states` → `to`) judged against the DOMAIN's
// exported LEGAL_NEXT, never against comparator position).
//
// The Auditor reuses the domain legality (LEGAL_NEXT / the line_context edge
// model the T-01-15 engine consumes) — it never reinvents the machine. A
// contested TERMINAL set from concurrent LEGAL edges is a rendered MVR
// (matrix §4C), NOT an illegality — pinned as a no-false-alarm law.
//
// One GREEN pin: the gateway does NOT judge legality at merge (its validation
// is identity/schema/dedupe/contiguity/fold-free invariants only — T-01-07/08
// contracts); an illegal edge MERGES and the Auditor owns the sweep. If a
// future gateway change starts rejecting these, this pin fails first and the
// Auditor fixtures must be re-grounded — the dependency is named, not assumed.
// RED-AWAITING-IMPLEMENTATION: runAuditor is not exported yet (reds only).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import { byCheck, created, edge, evt, lineAdded, runAuditor } from "./auditor-builders.js";
import {
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

const legality = async (orgId: string) =>
  byCheck(await runAuditor({ db, org_id: orgId }), "state_legality");

describe("premise (GREEN) — the merge boundary does not judge legality (T-01-07/T-01-08 scope)", () => {
  it("01-F17/01-F4: a registry-valid but machine-ILLEGAL edge (placed→served) merges — no quarantine, global_seq assigned; the state machine is the Auditor's sweep, not the gateway's gate", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 1, 100)),
        evt(d, 2, edge(o, "L1", "served", ["placed"])),
      ]),
    );
    session.conn.close();
    const rows = await eventRows(db, d.org_id);
    expect(rows).toHaveLength(3);
    expect(await quarantineRows(db, d.org_id)).toHaveLength(0);
  });
});

describe("legality sweep — illegal edges are findings (01-F35 / 20 §4.2)", () => {
  it("01-F35: the merged placed→served jump is a state_legality finding naming the order and the offending envelope id", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    const illegal = evt(d, 2, edge(o, "L1", "served", ["placed"]));
    await session.conn.handle(
      pushMsg([evt(d, 0, created(o)), evt(d, 1, lineAdded(o, "L1", 1, 100)), illegal]),
    );
    session.conn.close();
    const findings = await legality(d.org_id);
    const finding = must(
      findings.find((f) => f.event_id === illegal.id),
      "finding naming the illegal edge",
    );
    expect(finding.order_id).toBe(o);
    expect(finding.org_id).toBe(d.org_id);
  });

  it("01-F35: an edge OUT of a terminal (served→in_prep, from_states [served]) violates terminal monotonicity — LEGAL_NEXT[terminal] is empty; the finding names the offending envelope", async () => {
    const d = freshIdentity();
    const o = `O-${d.device_id}`;
    const session = await openSession(gateway, d);
    const e1 = evt(d, 2, edge(o, "L1", "confirmed", ["placed"]));
    const e2 = evt(d, 3, edge(o, "L1", "in_prep", ["confirmed"], [e1.id]));
    const e3 = evt(d, 4, edge(o, "L1", "ready", ["in_prep"], [e2.id]));
    const e4 = evt(d, 5, edge(o, "L1", "served", ["ready"], [e3.id]));
    const regress = evt(d, 6, edge(o, "L1", "in_prep", ["served"], [e4.id]));
    await session.conn.handle(
      pushMsg([
        evt(d, 0, created(o)),
        evt(d, 1, lineAdded(o, "L1", 1, 100)),
        e1,
        e2,
        e3,
        e4,
        regress,
      ]),
    );
    session.conn.close();
    const findings = await legality(d.org_id);
    const finding = must(
      findings.find((f) => f.event_id === regress.id),
      "finding naming the terminal regression",
    );
    expect(finding.order_id).toBe(o);
  });

  it("01-F35/01-F34 (no false alarm): a fully LEGAL chain plus a CONTESTED terminal — voided vs served as concurrent legal edges from ready on two devices — audits clean; a contested set is a rendered MVR, never an illegality", async () => {
    const a = freshIdentity();
    const b: Identity = { org_id: a.org_id, branch_id: a.branch_id, device_id: `${a.device_id}-b` };
    const o = `O-${a.device_id}`;
    const sessionA = await openSession(gateway, a);
    const sessionB = await openSession(gateway, b);
    const e1 = evt(a, 2, edge(o, "L1", "confirmed", ["placed"]));
    const e2 = evt(a, 3, edge(o, "L1", "in_prep", ["confirmed"], [e1.id]));
    const e3 = evt(a, 4, edge(o, "L1", "ready", ["in_prep"], [e2.id]));
    await sessionA.conn.handle(
      pushMsg([evt(a, 0, created(o)), evt(a, 1, lineAdded(o, "L1", 1, 100)), e1, e2, e3]),
    );
    // Two LEGAL terminal exits from ready, concurrently, on different devices.
    await sessionA.conn.handle(pushMsg([evt(a, 5, edge(o, "L1", "served", ["ready"], [e3.id]))]));
    await sessionB.conn.handle(pushMsg([evt(b, 0, edge(o, "L1", "voided", ["ready"], [e3.id]))]));
    sessionA.conn.close();
    sessionB.conn.close();
    expect(await legality(a.org_id)).toEqual([]);
  });
});
