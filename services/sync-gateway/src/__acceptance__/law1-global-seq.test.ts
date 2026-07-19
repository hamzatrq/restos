// T-01-07 law 1 — Global sequence (01-F3). Contract: plans/wave-0/kernel-tasks.md
// T-01-07. Merged events carry server_received_at from the INJECTED clock and a
// strictly monotonic, dense per-org global_seq assigned in merge order; orgs are
// independent; a rolled-back merge consumes nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  BASE_T,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  quarantineRows,
  type TestClock,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let verify: Db;
let clock: TestClock;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  clock = makeClock();
  gateway = createGateway({ db, clock });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("law 1 — global sequence (01-F3)", () => {
  it("01-F3: merged events carry server_received_at from the injected clock; stored envelope jsonb stays verbatim-as-received (null inside)", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    clock.t = BASE_T + 1_000;
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 3)));

    clock.t = BASE_T + 9_000;
    await session.conn.handle(pushMsg(validEnvelopes(identity, 3, 2)));

    const rows = await eventRows(verify, identity.org_id);
    expect(rows).toHaveLength(5);
    for (const row of rows.slice(0, 3)) expect(row.server_received_at).toBe(BASE_T + 1_000);
    for (const row of rows.slice(3)) expect(row.server_received_at).toBe(BASE_T + 9_000);

    // Assumption 12 (binding): envelope jsonb is verbatim as received — the
    // cloud stamps live in their columns, merged into the envelope at SERVE time.
    for (const row of rows) {
      expect(row.envelope.server_received_at).toBeNull();
      expect(row.envelope).not.toHaveProperty("global_seq");
    }

    // Serve-time merge: fan-out envelopes carry the stamped values.
    const batches = ofKind(session.rec.all, "event_batch");
    expect(batches).toHaveLength(2);
    const firstBatch = must(batches[0], "first event_batch");
    for (const served of firstBatch.events) {
      expect(served.server_received_at).toBe(BASE_T + 1_000);
      expect(Number.isInteger(served.global_seq)).toBe(true);
    }
  });

  it("01-F3: per-org global_seq is strictly monotonic and dense (gap-free) in merge order across pushes", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 4)));
    await session.conn.handle(pushMsg(validEnvelopes(identity, 4, 3)));

    const rows = await eventRows(verify, identity.org_id);
    expect(rows).toHaveLength(7);
    const first = must(rows[0], "first merged row");
    expect(first.global_seq).toBeGreaterThanOrEqual(1);
    rows.forEach((row, i) => {
      // dense: exactly first + i, in merge order (= lamport order here)
      expect(row.global_seq).toBe(first.global_seq + i);
      expect(row.lamport_seq).toBe(i);
    });
  });

  it("01-F3: two orgs' global sequences are independent (one org's merges consume nothing from another's)", async () => {
    const orgP = freshIdentity();
    const orgQ = freshIdentity();
    const sessionP = await openSession(gateway, orgP);

    await sessionP.conn.handle(pushMsg(validEnvelopes(orgP, 0, 3)));

    const sessionQ = await openSession(gateway, orgQ);
    await sessionQ.conn.handle(pushMsg(validEnvelopes(orgQ, 0, 1)));

    const rowsP = await eventRows(verify, orgP.org_id);
    const rowsQ = await eventRows(verify, orgQ.org_id);
    const firstP = must(rowsP[0], "org P first row");
    const firstQ = must(rowsQ[0], "org Q first row");
    // Q starts at the same base P did — P's three merges consumed nothing of Q's.
    expect(firstQ.global_seq).toBe(firstP.global_seq);

    await sessionQ.conn.handle(pushMsg(validEnvelopes(orgQ, 1, 1)));
    const rowsQ2 = await eventRows(verify, orgQ.org_id);
    expect(rowsQ2.map((r) => r.global_seq)).toEqual([firstQ.global_seq, firstQ.global_seq + 1]);
  });

  it("01-F3: a rolled-back merge consumes nothing — the counter update rolls back with it", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);

    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));
    const before = await eventRows(verify, identity.org_id);
    const maxBefore = must(before.at(-1), "last merged row").global_seq;

    // Abort the merge transaction via the injected clock (the only injected
    // dependency inside the merge path). Whatever handle() does with the
    // failure, the LAW is: nothing persisted, nothing consumed.
    const failing = validEnvelopes(identity, 2, 2);
    clock.boom = true;
    try {
      await session.conn.handle(pushMsg(failing));
    } catch {
      // an infra failure may surface out of handle(); the law is about consumption
    }
    clock.boom = false;

    const afterFailure = await eventRows(verify, identity.org_id);
    expect(afterFailure).toHaveLength(2);
    const failedIds = failing.map((e) => e.id);
    // A crashed merge is not a poisoned event: it must NOT land in quarantine.
    const quarantined = await quarantineRows(verify, identity.org_id);
    expect(quarantined.filter((q) => failedIds.includes(q.claimed_event_id))).toHaveLength(0);

    // Re-push after recovery: the sequence continues DENSELY — a gap here means
    // the rolled-back merge consumed counter values.
    await session.conn.handle(pushMsg(failing));
    const afterRetry = await eventRows(verify, identity.org_id);
    expect(afterRetry.map((r) => r.global_seq)).toEqual([
      maxBefore - 1,
      maxBefore,
      maxBefore + 1,
      maxBefore + 2,
    ]);
  });
});
