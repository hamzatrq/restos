// T-01-07 law 8 — Golden fixtures (20 §2.7). Contract: plans/wave-0/kernel-tasks.md
// T-01-07. Every fixture under packages/sync-protocol/src/__acceptance__/fixtures/
// (read via repo-relative path) decodes with decodeMessage and drives the gateway;
// gateway emissions byte-shape-match the emitted-kind fixtures (modulo instance
// values — payload is opaque at the wire layer, z.unknown()); every gateway-emitted
// message round-trips encodeMessage → decodeMessage. Client and gateway consume
// the same contract and cannot drift apart silently.
//
// hello.json and push.json are driven VERBATIM — zero in-memory substitutions.
// The two 20 §2.7 fixture corrections (planner-approved spec review, T-01-07
// fix-round amendment 7) landed on disk: push.json's order.created payload
// carries the registry-required `channel`, and hello.json's token is the
// Wave-0 dev-token shape (unsigned base64url-JSON claims matching the
// fixture's org/branch/device identities).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProtocolMessage } from "@restos/sync-protocol";
import { decodeMessage, encodeMessage, parseMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway, ProtocolViolationError } from "../index.js";
import {
  closeDb,
  type Db,
  eventRows,
  type Identity,
  makeClock,
  must,
  ofKind,
  openDb,
  pushMsg,
  type Recorder,
  recorder,
  unknownTypeEnvelope,
  validEnvelopes,
} from "./helpers.js";

// Repo-relative path to the sync-protocol golden fixtures (T-01-07 files list).
const FIXTURES_DIR = new URL(
  "../../../../packages/sync-protocol/src/__acceptance__/fixtures/",
  import.meta.url,
);

const fixtureRaw = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`${name}.json`, FIXTURES_DIR)), "utf8");

const fixture = <K extends ProtocolMessage["kind"]>(
  name: string,
  kind: K,
): Extract<ProtocolMessage, { kind: K }> => {
  const decoded = decodeMessage(fixtureRaw(name));
  if (decoded.kind !== kind) throw new Error(`fixture ${name} is not kind ${kind}`);
  return decoded as Extract<ProtocolMessage, { kind: K }>;
};

// Byte-shape comparison, modulo instance values: leaves collapse to their type;
// payload is opaque at the wire layer (z.unknown()) and compares as one leaf.
type Shape = string | { obj: Record<string, Shape> } | { arr: "empty" | Shape };
const shapeOf = (value: unknown, key?: string): Shape => {
  if (key === "payload") return "payload(opaque)";
  if (value === null) return "null";
  if (Array.isArray(value)) return { arr: value.length === 0 ? "empty" : shapeOf(value[0]) };
  if (typeof value === "object") {
    return {
      obj: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shapeOf(v, k)]),
      ),
    };
  }
  return typeof value;
};

// The fixture story's identities (hello.json + push.json agree on these).
const helloFixture = fixture("hello", "hello");
const pushFixture = fixture("push", "push");
const fixtureEvent = must(pushFixture.events[0], "push.json carries one event");
const fixtureIdentity: Identity = {
  org_id: fixtureEvent.org_id, // hello has no org_id — the token claims carry it (assumption 7)
  branch_id: helloFixture.branch_id,
  device_id: helloFixture.device_id,
};

let db: Db;
let verify: Db;
let gateway: Gateway;
const recorders: Recorder[] = []; // every sink in this file, for the round-trip law
let storySession: { conn: ReturnType<Gateway["connect"]>; rec: Recorder };

const trackedConnect = (g: Gateway) => {
  const rec = recorder();
  recorders.push(rec);
  return { conn: g.connect(rec.sink), rec };
};

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

// NOTE: the tests below are a sequential story over the fixture identities
// (vitest runs tests in a file in declaration order). This file — and only
// this file — owns the fixture org for the whole container lifetime.
describe("law 8 — golden fixtures (20 §2.7)", () => {
  it("20 §2.7: EVERY fixture file decodes with decodeMessage and survives encode → decode unchanged", () => {
    const files = readdirSync(fileURLToPath(FIXTURES_DIR)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(10); // 4 from T-01-02 + 6 added by T-01-07
    for (const file of files) {
      const decoded = decodeMessage(
        readFileSync(fileURLToPath(new URL(file, FIXTURES_DIR)), "utf8"),
      );
      expect(decoded.kind).toBe(file.replace(/\.json$/, ""));
      expect(decodeMessage(encodeMessage(decoded))).toEqual(decoded);
    }
  });

  it("20 §2.7: hello.json driven VERBATIM opens a session; hello_ack shape-matches hello_ack.json", async () => {
    storySession = trackedConnect(gateway);
    await storySession.conn.handle(helloFixture);
    const helloAck = must(ofKind(storySession.rec.all, "hello_ack")[0], "hello_ack");
    expect(helloAck.resume_from).toBe(0); // fresh device
    expect(shapeOf(helloAck)).toEqual(shapeOf(fixture("hello_ack", "hello_ack")));
  });

  it("20 §2.7: push.json driven VERBATIM merges and acks; push_ack deep-equals push_ack.json; the fan-out event_batch shape-matches event_batch.json", async () => {
    // push.json's event sits at lamport 18: fill 0..17 first so it extends the
    // device's stored sequence contiguously (stop-at-gap law).
    await storySession.conn.handle(pushMsg(validEnvelopes(fixtureIdentity, 0, 18)));

    await storySession.conn.handle(pushFixture);

    const ack = must(ofKind(storySession.rec.all, "push_ack").at(-1), "push_ack");
    expect(ack).toEqual(fixture("push_ack", "push_ack")); // acked_watermark: 18 — instance values align

    const merged = (await eventRows(verify, fixtureIdentity.org_id)).find(
      (r) => r.id === fixtureEvent.id,
    );
    expect(must(merged, "fixture event merged").lamport_seq).toBe(18);

    const batch = must(
      ofKind(storySession.rec.all, "event_batch").find((b) =>
        b.events.some((e) => e.id === fixtureEvent.id),
      ),
      "event_batch carrying the fixture event",
    );
    expect(shapeOf(batch)).toEqual(shapeOf(fixture("event_batch", "event_batch")));
  });

  it("20 §2.7: reconnecting after the merge yields hello_ack.json's exact resume_from (19 = acked 18 + 1), session_id aside", async () => {
    const { conn, rec } = trackedConnect(gateway);
    await conn.handle(helloFixture);
    const helloAck = must(ofKind(rec.all, "hello_ack")[0], "hello_ack");
    const golden = fixture("hello_ack", "hello_ack");
    expect(helloAck.session_id.length).toBeGreaterThan(0);
    expect({ ...helloAck, session_id: golden.session_id }).toEqual(golden);
    conn.close();
  });

  it("20 §2.7: catchup_request.json drives paging (from_global_seq is an instance value → 0); catchup_response shape-matches catchup_response.json", async () => {
    const request = fixture("catchup_request", "catchup_request");
    await storySession.conn.handle(parseMessage({ ...request, from_global_seq: 0 }));
    const response = must(
      ofKind(storySession.rec.all, "catchup_response").at(-1),
      "catchup_response",
    );
    expect(response.events.length).toBeGreaterThan(0); // the story branch has 19 events
    expect(response.complete).toBe(true);
    expect(shapeOf(response)).toEqual(shapeOf(fixture("catchup_response", "catchup_response")));
  });

  it("20 §2.7: ping.json driven VERBATIM produces a pong deep-equal to pong.json", async () => {
    await storySession.conn.handle(fixture("ping", "ping"));
    const pong = must(ofKind(storySession.rec.all, "pong").at(-1), "pong");
    expect(pong).toEqual(fixture("pong", "pong")); // same t: 1752800002000
  });

  it("20 §2.7: a registry-invalid push produces a quarantine_notice shape-matching quarantine_notice.json", async () => {
    await storySession.conn.handle(pushMsg([unknownTypeEnvelope(fixtureIdentity, 19)]));
    const notice = must(
      ofKind(storySession.rec.all, "quarantine_notice").at(-1),
      "quarantine_notice",
    );
    expect(shapeOf(notice)).toEqual(shapeOf(fixture("quarantine_notice", "quarantine_notice")));
  });

  it("T-01-07 session law: every server→device fixture fed INBOUND throws ProtocolViolationError", async () => {
    const serverToDevice = [
      fixture("hello_ack", "hello_ack"),
      fixture("push_ack", "push_ack"),
      fixture("event_batch", "event_batch"),
      fixture("catchup_response", "catchup_response"),
      fixture("quarantine_notice", "quarantine_notice"),
    ];
    for (const message of serverToDevice) {
      await expect(storySession.conn.handle(message)).rejects.toThrow(ProtocolViolationError);
    }
  });

  it("20 §2.7: every gateway-emitted message in this file round-trips encodeMessage → decodeMessage unchanged", () => {
    const emitted = recorders.flatMap((rec) => rec.all);
    expect(emitted.length).toBeGreaterThan(0);
    for (const message of emitted) {
      expect(decodeMessage(encodeMessage(message))).toEqual(message);
    }
  });
});
