// XP — transcript-parity SHARED exchange (T-01-06 contract (g) "XP"; 20 §2.7).
// Real-core leg, test-owning session (plans/wave-0/kernel-tasks.md T-01-06, DEC
// block point 2). One SMALL directed device-side exchange, defined ONCE here and
// consumed by both:
//   • xp-record.ts — drives the LANDED @restos/testing sim-cloud double and writes
//     the committed golden transcript fixture
//     (packages/sync-protocol/src/__acceptance__/fixtures/transcripts/spike-cloud-contract.json);
//   • xp-transcript.test.ts — (1) re-records from the double and asserts it equals
//     the committed fixture (double-drift guard), then (2) replays the fixture's
//     device→cloud messages through the REAL createGateway on Testcontainers PG and
//     asserts the gateway's outbound stream equals the transcript MODULO session_id
//     + server_received_at, with global_seq EXACT. That is what licenses the sim
//     leg's double (the double is honest iff it matches the real core).
//
// The exchange is deliberately shaped so no single push mixes a merge (event_batch)
// with a quarantine (quarantine_notice): the two cores emit those in a different
// intra-push order (sim-cloud: ack→batch→notice; gateway: ack→notice→batch), which
// is NOT one of the mirrored laws (20 §2.7 pins global_seq/dedupe/stop-at-gap/
// resume_from/no-empty-ack/origin-inclusive-fanout/catchup/storage_reject — not
// notice-vs-batch order). Keeping merge-pushes and quarantine-pushes separate lets
// XP assert a strict full-stream deep-equal without asserting an unpinned ordering.
// Ambiguity surfaced (24 §3b), simpler alternative named: assert notice/batch as an
// unordered set within a push — rejected as a weaker, fuzzier oracle.
//
// All ids/timestamps are FIXED literals (never newId()/Date.now()) so the fixture is
// byte-stable and re-recording is deep-equal (20 §2.4 determinism). Envelopes are
// registry-valid order.created (01 §4 seed catalog). Consumes only @restos/domain +
// @restos/sync-protocol + @restos/testing — never sync-gateway internals.
import type { EventEnvelopeT } from "@restos/domain";
import {
  type CloudTransportHandlers,
  PROTOCOL_VERSION,
  type ProtocolMessage,
} from "@restos/sync-protocol";
import { type CloudTranscriptEntry, createSim, createSimCloud } from "@restos/testing";

/** Fixed fleet identity baked into the committed fixture (deterministic replay). */
export const XP_ORG = "xp-org";
export const XP_BRANCH = "xp-branch";
export const XP_DEVICE = "xp-device";
export const XP_CLASS = "counter_electron" as const;
/** Fixed base epoch-ms; per-event offset is the lamport seq (deterministic). */
const BASE_TS = 1_752_800_000_000;

/** Wave-0 dev token: unsigned base64url-JSON claims — the verifyDeviceToken shape (01-F27). */
export const xpToken = (): string =>
  Buffer.from(
    JSON.stringify({ org_id: XP_ORG, branch_id: XP_BRANCH, device_id: XP_DEVICE }),
  ).toString("base64url");

const envelope = (lamport: number, id: string, orderId: string): EventEnvelopeT => ({
  id,
  org_id: XP_ORG,
  branch_id: XP_BRANCH,
  device_id: XP_DEVICE,
  actor_user_id: null,
  lamport_seq: lamport,
  device_created_at: BASE_TS + lamport,
  server_received_at: null,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: orderId, channel: "dine_in" },
  refs: [],
});

// e0/e1 merge cleanly; eNul is registry-valid (order_id is a non-empty string) but
// carries U+0000, which Postgres jsonb cannot hold — the gateway quarantines it
// storage_reject, the double mirrors that verbatim (DEC-SYNC-005).
/** U+0000 built at runtime so the committed source stays ASCII-clean (no literal NUL byte). */
const NUL = String.fromCharCode(0);
export const E0 = envelope(0, "xp-evt-0", "xp-order-0");
export const E1 = envelope(1, "xp-evt-1", "xp-order-1");
export const ENUL = envelope(2, "xp-evt-2", `xp-order-${NUL}-2`);

/**
 * The directed device→cloud script (hello → merge push → dedupe re-push → U+0000
 * storage_reject push → catchup). Each merge/quarantine sits in its own push (see
 * the header note). These are the messages the XP test replays through the gateway.
 */
export const deviceMessages: ProtocolMessage[] = [
  {
    v: PROTOCOL_VERSION,
    kind: "hello",
    device_id: XP_DEVICE,
    device_class: XP_CLASS,
    branch_id: XP_BRANCH,
    token: xpToken(),
    last_global_seq: 0,
    own_high_water: 0,
  },
  { v: PROTOCOL_VERSION, kind: "push", events: [E0, E1], watermark: 1 },
  // dedupe re-push (byte-identical events): ack repeats, nothing re-merges/re-fans.
  { v: PROTOCOL_VERSION, kind: "push", events: [E0, E1], watermark: 1 },
  // storage_reject: the poisoned slot fills, the ack advances over it, a notice
  // returns, no global_seq is consumed (01-F37 device-notification half).
  { v: PROTOCOL_VERSION, kind: "push", events: [ENUL], watermark: 2 },
  { v: PROTOCOL_VERSION, kind: "catchup_request", from_global_seq: 0 },
];

/**
 * Record the transcript by driving the LANDED sim-cloud double under one virtual
 * clock. The double logs both directions from the cloud's perspective ("in" =
 * device→cloud, "out" = cloud→device) — exactly the XP transcript unit (20 §2.7).
 */
export const recordTranscript = (): CloudTranscriptEntry[] => {
  const sim = createSim({ seed: 1 });
  const cloud = createSimCloud({ sim });
  const transport = cloud.transportFor(XP_DEVICE);
  // An inert device handler: we drive the exchange by hand and read the cloud log,
  // so nothing reacts to the cloud's replies (no cascade beyond the script).
  const handlers: CloudTransportHandlers = {
    onUp: () => undefined,
    onDown: () => undefined,
    onMessage: () => undefined,
  };
  transport.start(handlers);
  for (const message of deviceMessages) {
    transport.send(message);
    // Flush the WAN-latency delivery so this message is fully handled (and its
    // replies logged) before the next is sent — the transcript stays ordered.
    sim.runToQuiescence({ maxVirtualMs: 10_000 });
  }
  return [...cloud.transcript()];
};

// ── parity normalization ─────────────────────────────────────────────────────
// The two cores agree on every wire value EXCEPT the two instance-random stamps:
// session_id (hello_ack) and server_received_at (each merged wire event). global_seq
// must match EXACTLY. Normalizing both to constants lets the streams deep-equal.

const SESSION_PLACEHOLDER = "<session_id>";
const SRV_PLACEHOLDER = 0;

/** A merged wire event carries server_received_at + global_seq; blank the former only. */
const normalizeEvents = (events: readonly Record<string, unknown>[]): Record<string, unknown>[] =>
  events.map((e) => ({ ...e, server_received_at: SRV_PLACEHOLDER }));

export const normalizeOut = (message: ProtocolMessage): ProtocolMessage => {
  switch (message.kind) {
    case "hello_ack":
      return { ...message, session_id: SESSION_PLACEHOLDER };
    case "event_batch":
      return { ...message, events: normalizeEvents(message.events) as typeof message.events };
    case "catchup_response":
      return { ...message, events: normalizeEvents(message.events) as typeof message.events };
    default:
      return message;
  }
};

/** The "out" (cloud→device) messages of a transcript, in order. */
export const outMessages = (transcript: readonly CloudTranscriptEntry[]): ProtocolMessage[] =>
  transcript.filter((e) => e.direction === "out").map((e) => e.message);

/** The "in" (device→cloud) messages of a transcript, in order — replayed at the gateway. */
export const inMessages = (transcript: readonly CloudTranscriptEntry[]): ProtocolMessage[] =>
  transcript.filter((e) => e.direction === "in").map((e) => e.message);
