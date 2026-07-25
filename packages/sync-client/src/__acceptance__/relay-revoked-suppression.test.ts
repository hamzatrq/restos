// T-01-09 FIX ROUND oracle — ruling F1(b), hub half
// (plans/wave-0/t-01-09-fix-round.md @08a1b72, BINDING): hub-side VOLATILE
// suppression — a quarantine_notice with reason origin_unregistered or
// origin_revoked stops relay of that origin for the session's life (a fresh
// session retries once → re-noticed → re-suppressed; bounded, not livelock).
// Authored from the fix-round ruling + specs/DECISIONS.md (DEC-SYNC-009) +
// specs/01-kernel-sync.md (01-F25) ONLY (24 §3 step 2: read-only to the
// implementing session). The T-01-12 relay pins (relay-scenarios.test.ts,
// relay-fix-round.test.ts) are untouched and stay binding.
//
// Harness note: this file drives createCloudSession over the SCRIPTED cloud
// transport (the cloud twin of the mesh rawPeer idiom, established in
// cloud-ack-guard.test.ts) rather than the sim-cloud double — the sim-cloud
// mirrors NO registry ("auth stays gateway-only", its header) so it can never
// mint an origin_revoked notice, and packages/testing is outside this round's
// files-touchable list. The transcript is the scripted transport's sent frames.
//
// RED-AWAITING-FIX (verified to fail for the ruled reason): today NOTHING
// suppresses a noticed origin — the origin gate quarantines its events with no
// stream filled and no ack, so the hub's per-origin relay cursor never moves
// and EVERY relay drain re-pushes the same events, forever (the endless
// re-push loop the F1 ruling closes from both ends: the gateway acks merged
// ids through, and the hub stops relaying gate-refused origins).
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { createCloudSession, openStore } from "../index.js";
import { identity, must, peerEnvelope, peerIdentity } from "./builders.js";

/** Scripted cloud end (cloud-ack-guard idiom): the test plays the gateway by
 * hand at the exact wire surface; every frame passes parseMessage both ways. */
const scriptedCloud = () => {
  let handlers: CloudTransportHandlers | null = null;
  const sent: ProtocolMessage[] = [];
  const transport: CloudTransport = {
    start(h) {
      handlers = h;
    },
    stop() {
      handlers = null;
    },
    send(message) {
      sent.push(parseMessage(message));
    },
  };
  return {
    transport,
    sent,
    up: () => must(handlers, "started transport").onUp(),
    deliver: (raw: unknown) => must(handlers, "started transport").onMessage(parseMessage(raw)),
  };
};

type PushFrame = Extract<ProtocolMessage, { kind: "push" }>;

/** The session's relay pushes carrying a given origin's events — the transcript filter. */
const relayPushesFor = (sent: readonly ProtocolMessage[], device_id: string): PushFrame[] =>
  sent.filter(
    (m): m is PushFrame => m.kind === "push" && m.events.some((e) => e.device_id === device_id),
  );

/** A relay-authorized hub session over a real store holding LAN-ingested peer events. */
const startHub = () => {
  const hubId = identity();
  const sim = createSim({ seed: 1_909 });
  const store = openStore({ path: ":memory:", identity: hubId });
  const cloud = scriptedCloud();
  const session = createCloudSession({
    store,
    transport: cloud.transport,
    clock: sim.clock,
    device_class: "counter_electron",
    token: "hub-relay-token-stub",
  });
  session.start();
  cloud.up(); // session hellos
  return { hubId, store, cloud, session };
};

const helloAck = {
  v: 1,
  kind: "hello_ack",
  session_id: "hub-s-1",
  hub: false,
  resume_from: 0,
  relay_authorized: true, // the gateway's grant — without it this session never relays
};

describe("F1(b) — an origin_revoked notice suppresses that origin's relay for the session's life (t-01-09-fix-round F1 / DEC-SYNC-009 / 01-F25)", () => {
  it("F1(b)/DEC-SYNC-009/01-F25: after an origin_revoked quarantine_notice the hub sends NO further relay pushes for that origin within the session, while ANOTHER origin keeps relaying", () => {
    const { hubId, store, cloud, session } = startHub();

    // Two same-branch WAN-less peers' events, held from LAN ingest.
    const revokedOrigin = peerIdentity(hubId);
    const healthyOrigin = peerIdentity(hubId);
    const r0 = peerEnvelope(revokedOrigin, 0);
    const r1 = peerEnvelope(revokedOrigin, 1);
    const h0 = peerEnvelope(healthyOrigin, 0);
    for (const e of [r0, r1, h0]) store.ingest(e);

    // Grant + the mesh's (acting hub) relay-drain signal: both origins go up once.
    cloud.deliver(helloAck);
    store.requestRelayDrain();
    expect(relayPushesFor(cloud.sent, revokedOrigin.device_id)).toHaveLength(1);
    expect(relayPushesFor(cloud.sent, healthyOrigin.device_id)).toHaveLength(1);

    // The cloud acks the healthy origin and refuses the other at the origin
    // gate: an origin_revoked notice naming one of its held events (T-01-09).
    cloud.deliver({
      v: 1,
      kind: "push_ack",
      acked_watermark: 0,
      origin_device_id: healthyOrigin.device_id,
    });
    cloud.deliver({ v: 1, kind: "quarantine_notice", event_id: r0.id, reason: "origin_revoked" });

    // THE PIN (F1(b) ruling): the notice stops relay of THAT origin for the
    // session's life. RED today: the revoked origin's cursor never moved (its
    // push earned no ack), so every drain re-pushes r0/r1 — the endless loop.
    const mark = cloud.sent.length;
    store.requestRelayDrain();
    store.requestRelayDrain(); // a second drain — the loop's next beat
    expect(relayPushesFor(cloud.sent.slice(mark), revokedOrigin.device_id)).toHaveLength(0);

    // Suppression is PER-ORIGIN, never session-wide: a new held event from the
    // healthy origin still relays within the same session.
    const h1 = peerEnvelope(healthyOrigin, 1);
    store.ingest(h1);
    store.requestRelayDrain();
    const healthyPushes = relayPushesFor(cloud.sent.slice(mark), healthyOrigin.device_id);
    expect(healthyPushes.length).toBeGreaterThanOrEqual(1);
    expect(must(healthyPushes.at(-1), "healthy relay push").events.map((e) => e.id)).toContain(
      h1.id,
    );

    session.stop();
    store.close();
  });

  it("F1(b)/DEC-SYNC-009: an origin_unregistered notice suppresses the same way (the ruling names both gate reasons)", () => {
    const { hubId, store, cloud, session } = startHub();

    const phantomOrigin = peerIdentity(hubId);
    const p0 = peerEnvelope(phantomOrigin, 0);
    store.ingest(p0);

    cloud.deliver(helloAck);
    store.requestRelayDrain();
    expect(relayPushesFor(cloud.sent, phantomOrigin.device_id)).toHaveLength(1);

    cloud.deliver({
      v: 1,
      kind: "quarantine_notice",
      event_id: p0.id,
      reason: "origin_unregistered",
    });

    const mark = cloud.sent.length;
    store.requestRelayDrain();
    expect(relayPushesFor(cloud.sent.slice(mark), phantomOrigin.device_id)).toHaveLength(0);

    session.stop();
    store.close();
  });
});
