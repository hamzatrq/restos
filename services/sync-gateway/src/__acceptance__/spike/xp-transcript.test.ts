// XP — transcript parity (T-01-06 real-core leg, contract (g) "XP"; 20 §2.7).
// Authored by the TEST-OWNING session (24 §3 step 2) from the T-01-06 binding
// contract + PROTOCOL.md + the sim-cloud's mirrored-law header only.
//
// PURPOSE: pin the @restos/testing sim-cloud double (which licenses the whole
// deterministic sim leg X1–X9) to the REAL createGateway. Two assertions:
//   1. DOUBLE-DRIFT GUARD — re-recording the committed exchange from the live
//      sim-cloud reproduces the committed fixture byte-for-byte. A sim-cloud change
//      that drifts from the recorded contract fails here.
//   2. REAL-CORE PARITY — replaying the fixture's device→cloud messages through the
//      real gateway on Testcontainers Postgres yields an outbound stream equal to
//      the transcript's cloud→device stream, MODULO session_id + server_received_at
//      (the two instance-random stamps), with global_seq EXACT (dense from 1, arrival
//      order). If the double ever diverges from the real core, this fails — and if
//      the double is dropped, the fixture goes with it (T-01-06 Decision point 3).
//
// This suite lives in the gateway workspace because it needs the real core on real
// Postgres (the Docker mandate is already here, T-01-07). It reuses the landed
// Testcontainers global-setup + helpers. It touches only spike/** and reads the
// committed fixture under sync-protocol — no gateway src/** is modified.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProtocolMessage } from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import type { CloudTranscriptEntry } from "@restos/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../../index.js";
import { createGateway } from "../../index.js";
import { closeDb, type Db, makeClock, openDb, recorder } from "../helpers.js";
import { inMessages, normalizeOut, outMessages, recordTranscript } from "./xp-exchange.js";

// The committed golden transcript (20 §2.7 artifact). Repo-relative, same style as
// law8's fixture reader. Regenerate via `tsx src/__acceptance__/spike/xp-record.ts`.
const FIXTURE = fileURLToPath(
  new URL(
    "../../../../../packages/sync-protocol/src/__acceptance__/fixtures/transcripts/spike-cloud-contract.json",
    import.meta.url,
  ),
);

const committed = (): CloudTranscriptEntry[] =>
  JSON.parse(readFileSync(FIXTURE, "utf8")) as CloudTranscriptEntry[];

/** Re-parse each message through the wire codec so both sides are zod-normalized alike. */
const wire = (messages: readonly ProtocolMessage[]): ProtocolMessage[] =>
  messages.map((m) => parseMessage(m));

let db: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  // Scripted (injected) clock — server_received_at is compared modulo, but the
  // gateway contract forbids new Date() in the core, so we inject one (18 §4).
  gateway = createGateway({ db, clock: makeClock() });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
});

describe("XP — sim-cloud ⇄ real-core transcript parity (20 §2.7)", () => {
  it("20 §2.7: the live sim-cloud re-records the committed transcript byte-for-byte (double-drift guard)", () => {
    // recordTranscript() and the committed fixture both serialize to plain JSON;
    // deep equality catches any drift in the double's mirrored laws.
    expect(recordTranscript()).toEqual(committed());
  });

  it("01-F3/F8/F9/F37: replaying the device→cloud messages through the REAL gateway reproduces the cloud→device stream (session_id + server_received_at aside, global_seq exact)", async () => {
    const transcript = committed();
    const expectedOut = wire(outMessages(transcript)).map(normalizeOut);

    const rec = recorder();
    const conn = gateway.connect(rec.sink);
    // Replay the directed device-side stream one frame at a time (handle() serializes
    // per connection; awaiting each keeps the emitted stream deterministic).
    for (const message of wire(inMessages(transcript))) {
      await conn.handle(message);
    }
    conn.close();

    const actualOut = rec.all.map(normalizeOut);

    // Full-stream deep-equal: kinds, order, and every wire value including the exact
    // dense global_seq — only session_id + server_received_at are normalized away.
    expect(actualOut).toEqual(expectedOut);

    // Spell out the load-bearing values so a failure names the divergence directly.
    const kinds = actualOut.map((m) => m.kind);
    expect(kinds).toEqual([
      "hello_ack",
      "push_ack", // push #1 merge
      "event_batch", // origin-inclusive fan-out (01-F34)
      "push_ack", // push #2 dedupe re-push — same ack, no re-fan (01-F8)
      "push_ack", // push #3 ack advances OVER the poisoned slot (DEC-SYNC-005)
      "quarantine_notice", // U+0000 → storage_reject (01-F37 device half)
      "catchup_response", // exclusive cursor from 0 → both merged events (01-F9)
    ]);
    const gseqs = actualOut
      .filter((m) => m.kind === "event_batch" || m.kind === "catchup_response")
      .flatMap((m) =>
        (m as Extract<ProtocolMessage, { kind: "event_batch" | "catchup_response" }>).events.map(
          (e) => e.global_seq,
        ),
      );
    expect(gseqs).toEqual([1, 2, 1, 2]); // dense from 1, arrival order — exact (01-F3)
  });
});
