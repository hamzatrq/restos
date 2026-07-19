// Acceptance-test builders — T-01-05 stage (d): sim scheduler seed (20 §2.4 / 20 §6-Q1),
// authored from the kernel-tasks binding contract + HUB-ELECTION.md + PROTOCOL.md only
// (24 §3 step 2: read-only to the implementing session). Drives ONLY the contracted
// createSim surface; seam types are consumed from @restos/sync-protocol, never redeclared.

import { type DeviceClass, newId } from "@restos/domain";
import { type PeerInfo, PROTOCOL_VERSION, type ProtocolMessage } from "@restos/sync-protocol";
import type { Sim } from "../index.js";

/** noUncheckedIndexedAccess-safe unwrap — a missing value is a loud test failure. */
export const must = <T>(value: T | undefined, what = "value"): T => {
  if (value === undefined) throw new Error(`expected ${what} to be defined`);
  return value;
};

export const peerInfo = (
  device_id: string,
  device_class: DeviceClass = "counter_electron",
): PeerInfo => ({ device_id, device_class });

/** Wire heartbeat message — the simplest ProtocolMessage to push through the bus. */
export const ping = (t: number): ProtocolMessage => ({ v: PROTOCOL_VERSION, kind: "ping", t });

/** Registry-valid envelope so event_batch survives decodeMessage on the hop. */
export const envelope = (device_id: string, lamport_seq: number) => ({
  id: newId(),
  org_id: "org-sim",
  branch_id: "branch-sim",
  device_id,
  actor_user_id: null,
  lamport_seq,
  device_created_at: 1752800000000,
  server_received_at: null,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId(), channel: "dine_in" },
  refs: [],
});

export const eventBatch = (events: ReturnType<typeof envelope>[]): ProtocolMessage => ({
  v: PROTOCOL_VERSION,
  kind: "event_batch",
  events,
});

export type DeliveryRecord = { from: string; message: ProtocolMessage; at: number };

export type DeviceLog = {
  visible: PeerInfo[];
  lost: string[];
  messages: DeliveryRecord[];
};

export type Recorder = {
  info: PeerInfo;
  transport: ReturnType<Sim["lan"]["attach"]>;
  log: DeviceLog;
};

/**
 * Attach a device whose handlers only record what the sim delivers — the raw
 * TransportHandlers seam, no mesh logic (stage (d) tests the scheduler, not the session).
 */
export const attachRecorder = (
  sim: Sim,
  device_id: string,
  device_class: DeviceClass = "counter_electron",
): Recorder => {
  const info = peerInfo(device_id, device_class);
  const log: DeviceLog = { visible: [], lost: [], messages: [] };
  const transport = sim.lan.attach(info);
  transport.start({
    onPeerVisible: (p: PeerInfo) => log.visible.push(p),
    onPeerLost: (id: string) => log.lost.push(id),
    onMessage: (from: string, message: ProtocolMessage) =>
      log.messages.push({ from, message, at: sim.now() }),
  });
  return { info, transport, log };
};

export const visibleIds = (log: DeviceLog): string[] => log.visible.map((p) => p.device_id);

/** t-values of delivered pings — the payload identity used across policy tests. */
export const deliveredTs = (log: DeviceLog): number[] =>
  log.messages.map((m) => (m.message.kind === "ping" ? m.message.t : Number.NaN));
