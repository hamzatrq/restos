// T-01-11 oracle — AUDIT-CHAIN cross-check over the merged log (01-F5 as
// concretized by DEC-AUDIT-001 accepted: "tail-truncation and last-event
// forgery are detected by the Auditor (20 §4.2) cross-checking each device's
// chain against the merged cloud log, not by verifyAuditChain alone" — spec
// text promoted at T-01-10 close; kernel-tasks T-01-10 status names this a
// T-01-11 REQUIREMENT).
//
// ⚠ SCOPE NOTE (oracle report, contradiction 1): DEC-TEST-003's dependency
// column gated this leg on the T-01-10 emitter, which HAS LANDED on this
// branch (52f020a + two audit fix rounds; 01-F5 green in verify:01). Under the
// ratified rule "chain verification follows its producer", the producer
// exists, so this leg is IN — and 01-F5's amended text requires it. This file
// is deliberately SEPARATE so a planner ruling the other way can strike it
// wholesale without touching the four DEC-TEST-003-enumerated checks.
//
// The Auditor filters type ∈ AUDIT_EVENT_TYPES per device from kernel.events,
// orders by lamport_seq ascending, and calls domain verifyAuditChain (declared
// once — T-01-10 decision 6; never reimplemented). Cloud-side tail truncation
// is caught by the lamport_gap leg (the merged log independently holds every
// audit event — the cross-check 01-F5 names).
//
// One GREEN pin: the gateway does NOT verify chain links at merge (registry
// parse checks prev_audit_hash presence/type only) — a forged link MERGES and
// the Auditor owns detection. The dependency is named, not assumed.
// RED-AWAITING-IMPLEMENTATION: runAuditor is not exported yet (reds only).
import { auditEventHash } from "@restos/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "../index.js";
import {
  auditChain,
  byCheck,
  deleteEventRow,
  runAuditor,
  tamperStoredPrevHash,
} from "./auditor-builders.js";
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
  registerIdentity,
  signedToken,
  TEST_TOKEN_SECRET,
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

const chainFindings = async (orgId: string) =>
  byCheck(await runAuditor({ db, org_id: orgId }), "audit_chain");

describe("premise (GREEN) — the merge boundary does not verify chain links (T-01-07 scope / 01-F4)", () => {
  it("01-F5/01-F4: an audit event whose prev_audit_hash is garbage-but-string MERGES — the registry checks presence/type only; chain integrity is the Auditor's cross-check, not the gateway's gate", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const forged = auditChain(d, 0, ["audit.login", "audit.reprint"], { forgeAt: 1 });
    await session.conn.handle(pushMsg(forged));
    session.conn.close();
    expect(await eventRows(db, d.org_id)).toHaveLength(2);
    expect(await quarantineRows(db, d.org_id)).toHaveLength(0);
  });
});

describe("chain leg — per-device verification over the merged log (01-F5 / DEC-AUDIT-001)", () => {
  it("01-F5: correctly-linked chains on TWO devices — one direct, one hub-RELAYED (DEC-SYNC-009), non-audit events interleaved — audit clean; each device's chain verifies independently", async () => {
    const d = freshIdentity();
    const hub: Identity = {
      org_id: d.org_id,
      branch_id: d.branch_id,
      device_id: `${d.device_id}-h`,
    };
    const w: Identity = { org_id: d.org_id, branch_id: d.branch_id, device_id: `${d.device_id}-w` };
    const session = await openSession(gateway, d);
    const [a0, a1] = auditChain(d, 1, ["audit.login", "audit.drawer_opened"]);
    await session.conn.handle(
      pushMsg([validEnvelope(d, 0), must(a0, "a0"), must(a1, "a1"), validEnvelope(d, 3)]),
    );
    session.conn.close();
    await registerIdentity(db, hub);
    await registerIdentity(db, w, "waiter");
    const hubSession = await openSession(gateway, hub, {
      token: signedToken({ ...hub, hub_relay: true }),
    });
    await hubSession.conn.handle(
      pushMsg(auditChain(w, 0, ["audit.login", "audit.settings_changed"])),
    );
    hubSession.conn.close();
    expect(await chainFindings(d.org_id)).toEqual([]);
  });

  it("01-F5: a forged-at-emit link (device stamps garbage instead of auditEventHash(previous)) is an audit_chain finding naming the device and the broken event", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const chain = auditChain(d, 0, ["audit.login", "audit.reprint", "audit.settings_changed"], {
      forgeAt: 1,
    });
    await session.conn.handle(pushMsg(chain));
    session.conn.close();
    const findings = await chainFindings(d.org_id);
    const broken = must(
      findings.find((f) => f.event_id === must(chain[1], "forged link").id),
      "finding naming the broken link",
    );
    expect(broken.device_id).toBe(d.device_id);
    expect(broken.org_id).toBe(d.org_id);
  });

  it("01-F5/01-F1: a TAMPERED stored link (cloud-side UPDATE of payload.prev_audit_hash — corruption of the merged copy) is an audit_chain finding; the domain hash rule (canonical-JSON minus server_received_at) is what detects it", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const chain = auditChain(d, 0, ["audit.login", "audit.drawer_opened"]);
    await session.conn.handle(pushMsg(chain));
    session.conn.close();
    // Sanity: untampered, the second link is the hash of the first envelope.
    const second = must(chain[1], "second link");
    expect((second.payload as { prev_audit_hash: string }).prev_audit_hash).toBe(
      auditEventHash(must(chain[0], "first link")),
    );
    await tamperStoredPrevHash(db, d.org_id, second.id, "0".repeat(64));
    const findings = await chainFindings(d.org_id);
    expect(findings.length).toBeGreaterThan(0);
    expect(must(findings[0], "tamper finding").device_id).toBe(d.device_id);
  });

  it("01-F5/01-F3 (the cross-check): DELETING a middle audit event from the merged log breaks BOTH legs — an audit_chain finding (the next link no longer verifies) AND a lamport_gap finding (the slot the watermark covers is empty); tail deletion is the gap leg's catch", async () => {
    const d = freshIdentity();
    const session = await openSession(gateway, d);
    const chain = auditChain(d, 0, ["audit.login", "audit.reprint", "audit.settings_changed"]);
    await session.conn.handle(pushMsg(chain));
    session.conn.close();
    await deleteEventRow(db, d.org_id, must(chain[1], "middle audit event").id);
    const report = await runAuditor({ db, org_id: d.org_id });
    expect(byCheck(report, "audit_chain").length).toBeGreaterThan(0);
    const gap = must(byCheck(report, "lamport_gap")[0], "gap finding");
    expect(gap.lamport_seq).toBe(1);
    expect(gap.device_id).toBe(d.device_id);
  });
});
