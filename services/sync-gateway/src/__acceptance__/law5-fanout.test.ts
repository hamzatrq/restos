// T-01-07 law 5 — Fan-out (01-F9 serve half / 01-F34). Contract:
// plans/wave-0/kernel-tasks.md T-01-07. A pushed event reaches every connected
// same-(org, branch) session INCLUDING the origin (assumption 5 — that is how a
// device learns its own events' global_seq and converges to cloud ordering),
// exactly once, as one event_batch per push with global_seq present. Other
// branches and other orgs receive nothing. A closed connection is removed from
// the fan-out set — no send after close.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
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
  TEST_TOKEN_SECRET,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let verify: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("law 5 — fan-out (01-F9/01-F34)", () => {
  it("01-F9/01-F34: a push reaches every same-branch session including the origin, exactly once, as one event_batch with global_seq; other branches and other orgs get nothing", async () => {
    const identity = freshIdentity();
    const sessionA = await openSession(gateway, identity); // origin
    const sessionB = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    }); // same branch
    const sessionC = await openSession(gateway, {
      ...identity,
      branch_id: freshIdentity().branch_id,
      device_id: freshIdentity().device_id,
    }); // same org, other branch
    const orgOther = { ...freshIdentity(), branch_id: identity.branch_id }; // other org, SAME branch_id string
    const sessionD = await openSession(gateway, orgOther);

    const batch = validEnvelopes(identity, 0, 3);
    const batchIds = batch.map((e) => e.id);
    await sessionA.conn.handle(pushMsg(batch));

    const rows = await eventRows(verify, identity.org_id);
    const seqById = new Map(rows.map((r) => [r.id, r.global_seq]));

    for (const [name, session] of [
      ["origin A", sessionA],
      ["same-branch B", sessionB],
    ] as const) {
      const batches = ofKind(session.rec.all, "event_batch");
      expect(batches, `${name}: exactly one event_batch per push`).toHaveLength(1);
      const delivered = must(batches[0], `${name} batch`).events;
      expect(delivered.map((e) => e.id)).toEqual(batchIds); // all three, exactly once, in order
      for (const e of delivered) {
        expect(e.global_seq, `${name}: global_seq present on fanned-out event`).toBe(
          seqById.get(e.id),
        );
      }
    }

    // 00 §5.4 isolation: other branch and other org receive nothing.
    expect(ofKind(sessionC.rec.all, "event_batch")).toHaveLength(0);
    expect(ofKind(sessionD.rec.all, "event_batch")).toHaveLength(0);
  });

  it("01-F9: one event_batch per push — a second push produces exactly one more batch on every same-branch session", async () => {
    const identity = freshIdentity();
    const sessionA = await openSession(gateway, identity);
    const sessionB = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    await sessionA.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));
    await sessionA.conn.handle(pushMsg(validEnvelopes(identity, 2, 4)));

    for (const session of [sessionA, sessionB]) {
      const batches = ofKind(session.rec.all, "event_batch");
      expect(batches).toHaveLength(2);
      expect(must(batches[0], "batch 1").events).toHaveLength(2);
      expect(must(batches[1], "batch 2").events).toHaveLength(4);
    }
  });

  it("01-F9: a closed connection is removed from the fan-out set — no send after close", async () => {
    const identity = freshIdentity();
    const sessionA = await openSession(gateway, identity);
    const sessionE = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });
    const sessionB = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    sessionE.conn.close();
    const frozenCount = sessionE.rec.all.length;

    await sessionA.conn.handle(pushMsg(validEnvelopes(identity, 0, 2)));

    expect(sessionE.rec.all.length).toBe(frozenCount); // nothing after close, of any kind
    expect(ofKind(sessionB.rec.all, "event_batch")).toHaveLength(1); // others still served
    expect(ofKind(sessionA.rec.all, "event_batch")).toHaveLength(1);
  });
});
