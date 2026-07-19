// T-01-07 session boundary (binding API contract lines, plans/wave-0/kernel-tasks.md
// T-01-07): first message MUST be hello; server→device kinds inbound, a second
// hello, or anything-before-hello throw ProtocolViolationError. Token seam
// (01-F27 Wave-0 stub, assumption 7): unsigned base64url-JSON claims
// { org_id, branch_id, device_id }; malformed shape or claims mismatching the
// hello → AuthRejectedError, no session. hello_ack.resume_from =
// acked_watermark + 1 (0 when no watermark row). ping → pong on the same
// connection. Error taxonomy per 18 §3/§5: both errors extend GatewayError.
import { parseMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import {
  AuthRejectedError,
  createGateway,
  GatewayError,
  ProtocolViolationError,
} from "../index.js";
import {
  catchupMsg,
  closeDb,
  type Db,
  devToken,
  eventRows,
  freshIdentity,
  helloMsg,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pingMsg,
  pushMsg,
  recorder,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let verify: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock() });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

describe("session boundary (T-01-07 API contract)", () => {
  it("01-F27 (Wave-0 stub): a well-formed dev token opens a session — hello_ack { session_id, hub: false, resume_from: 0 } for a fresh device", async () => {
    const identity = freshIdentity();
    const { helloAck } = await openSession(gateway, identity);
    expect(helloAck.session_id.length).toBeGreaterThan(0);
    expect(helloAck.hub).toBe(false);
    expect(helloAck.resume_from).toBe(0); // no watermark row: next lamport the cloud expects
  });

  it("01-F8: on reconnect, hello_ack.resume_from = acked_watermark + 1", async () => {
    const identity = freshIdentity();
    const first = await openSession(gateway, identity);
    await first.conn.handle(pushMsg(validEnvelopes(identity, 0, 5)));
    expect(must(ofKind(first.rec.all, "push_ack").at(-1), "ack").acked_watermark).toBe(4);
    first.conn.close();

    const second = await openSession(gateway, identity);
    expect(second.helloAck.resume_from).toBe(5);
  });

  it("01-F27: malformed token shapes → AuthRejectedError, no session opened", async () => {
    const identity = freshIdentity();
    const badTokens = [
      "not-base64url-json", // decodes to garbage, not JSON
      Buffer.from("just a string").toString("base64url"), // JSON-invalid
      Buffer.from(JSON.stringify({ org_id: identity.org_id })).toString("base64url"), // missing claims
    ];
    for (const token of badTokens) {
      const rec = recorder();
      const conn = gateway.connect(rec.sink);
      await expect(conn.handle(helloMsg(identity, { token }))).rejects.toThrow(AuthRejectedError);
      expect(ofKind(rec.all, "hello_ack")).toHaveLength(0);
      conn.close();
    }
  });

  it("01-F27/DEC-SYNC-004: token claims mismatching hello.device_id or hello.branch_id → AuthRejectedError", async () => {
    const identity = freshIdentity();
    const other = freshIdentity();

    const deviceMismatchToken = devToken({ ...identity, device_id: other.device_id });
    const conn1 = gateway.connect(recorder().sink);
    await expect(conn1.handle(helloMsg(identity, { token: deviceMismatchToken }))).rejects.toThrow(
      AuthRejectedError,
    );
    conn1.close();

    const branchMismatchToken = devToken({ ...identity, branch_id: other.branch_id });
    const conn2 = gateway.connect(recorder().sink);
    await expect(conn2.handle(helloMsg(identity, { token: branchMismatchToken }))).rejects.toThrow(
      AuthRejectedError,
    );
    conn2.close();
  });

  it("T-01-07 session law: any first message that is not hello → ProtocolViolationError", async () => {
    const identity = freshIdentity();
    const firstMessages = [pushMsg(validEnvelopes(identity, 0, 1)), catchupMsg(0), pingMsg(1)];
    for (const message of firstMessages) {
      const conn = gateway.connect(recorder().sink);
      await expect(conn.handle(message)).rejects.toThrow(ProtocolViolationError);
      conn.close();
    }
    // and nothing was persisted by the rejected pre-hello push
    expect(await eventRows(verify, identity.org_id)).toHaveLength(0);
  });

  it("T-01-07 session law: a second hello on an open session → ProtocolViolationError", async () => {
    const identity = freshIdentity();
    const { conn } = await openSession(gateway, identity);
    await expect(conn.handle(helloMsg(identity))).rejects.toThrow(ProtocolViolationError);
    conn.close();
  });

  it("T-01-07 session law: server→device kinds arriving inbound → ProtocolViolationError (closed PROTOCOL.md set — no error wire kind, assumption 10)", async () => {
    const identity = freshIdentity();
    const { conn, helloAck } = await openSession(gateway, identity);
    const inboundIllegal = [
      helloAck, // hello_ack
      parseMessage({ v: 1, kind: "push_ack", acked_watermark: 0 }),
      parseMessage({ v: 1, kind: "event_batch", events: [] }),
      parseMessage({ v: 1, kind: "catchup_response", events: [], complete: true, next_from: 0 }),
      parseMessage({ v: 1, kind: "quarantine_notice", event_id: "x", reason: "schema_invalid" }),
      parseMessage({ v: 1, kind: "purge_command", scope: "all" }),
    ];
    for (const message of inboundIllegal) {
      await expect(conn.handle(message)).rejects.toThrow(ProtocolViolationError);
    }
    conn.close();
  });

  it("18 §3/§5 error taxonomy: ProtocolViolationError and AuthRejectedError extend GatewayError", async () => {
    const identity = freshIdentity();
    const conn = gateway.connect(recorder().sink);
    const violation = await conn.handle(pingMsg(1)).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(violation).toBeInstanceOf(ProtocolViolationError);
    expect(violation).toBeInstanceOf(GatewayError);
    conn.close();

    const conn2 = gateway.connect(recorder().sink);
    const rejected = await conn2.handle(helloMsg(identity, { token: "zzz" })).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(rejected).toBeInstanceOf(AuthRejectedError);
    expect(rejected).toBeInstanceOf(GatewayError);
    conn2.close();
  });

  it("T-01-07: ping { t } → pong { t } on the same connection only", async () => {
    const identity = freshIdentity();
    const sessionA = await openSession(gateway, identity);
    const sessionB = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    await sessionA.conn.handle(pingMsg(424_242));
    const pongs = ofKind(sessionA.rec.all, "pong");
    expect(pongs).toHaveLength(1);
    expect(must(pongs[0], "pong").t).toBe(424_242);
    expect(ofKind(sessionB.rec.all, "pong")).toHaveLength(0);
    sessionA.conn.close();
    sessionB.conn.close();
  });
});
