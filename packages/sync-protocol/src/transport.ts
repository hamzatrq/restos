// Transport seam (T-01-05 contract (a); 24-F8 artifacts HUB-ELECTION.md + PROTOCOL.md).
// Consumed by BOTH the sync-client mesh and the @restos/testing sim — declared once here
// to avoid a dev-dependency cycle and silent type drift (T-01-05 assumption 2). Additive
// only: no wire message or fixture changes (20 §2.7). Discovery announcements carry
// PeerInfo (HUB-ELECTION.md "broadcast ping{class, device_id}", 01-F12); the wire
// ping{t}/pong{t} of PROTOCOL.md stays the session heartbeat, not discovery.
import type { DeviceClass } from "@restos/domain";
import type { ProtocolMessage } from "./messages.js";

/** A visible LAN peer as announced by discovery (01-F12 abstraction). */
export type PeerInfo = { device_id: string; device_class: DeviceClass };

/** Opaque timer handle — round-tripped between setTimeout and clearTimeout, never inspected. */
export type TimerId = unknown;

/**
 * All time the mesh consumes comes through this seam (20 §2.4): a trivial wall-clock
 * adapter serves production; the sim provides the deterministic virtual one.
 */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
}

/** Callbacks a transport drives: peer visibility (discovery) + inbound wire messages. */
export interface TransportHandlers {
  onPeerVisible(peer: PeerInfo): void;
  onPeerLost(device_id: string): void;
  onMessage(from: string, message: ProtocolMessage): void;
}

/**
 * Injected LAN transport (T-01-05 assumption 1: sim-only at this rung; real mDNS/WebSocket
 * adapters are T-01-06). `send` is fire-and-forget — delivery is not guaranteed; mesh
 * correctness must not depend on it (event-id dedupe + re-push absorb loss, 01-F8).
 */
export interface MeshTransport {
  start(handlers: TransportHandlers): void;
  stop(): void;
  send(to: string, message: ProtocolMessage): void;
}
