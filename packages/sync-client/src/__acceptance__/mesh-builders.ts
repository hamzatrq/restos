// Acceptance-test builders — T-01-05 stage 2: mesh session + hub election oracle
// (01-F12/F13/F15), authored from the kernel-tasks binding contract + HUB-ELECTION.md +
// PROTOCOL.md only (24 §3 step 2: read-only to the implementing session). Kept apart from
// builders.ts on purpose: this module imports the not-yet-landed mesh exports, and loading
// it must never redden the T-01-03/T-01-04 suites. Seam types come from
// @restos/sync-protocol and the sim from @restos/testing — consumed, never redeclared.

import { type DeviceClass, HUB_ELIGIBLE_CLASSES } from "@restos/domain";
import type { MeshTransport, PeerInfo, ProtocolMessage } from "@restos/sync-protocol";
import type { Sim } from "@restos/testing";
import { createMeshSession, type MeshSession, openStore } from "../index.js";
import { appendInput, must, type peerEnvelope, seededRng } from "./builders.js";

/** One org/branch for the whole simulated mesh — the branch stream is identity-scoped (01-F9). */
export const ORG = "org-mesh";
export const BRANCH = "branch-mesh";

export const meshIdentity = (device_id: string) => ({
  org_id: ORG,
  branch_id: BRANCH,
  device_id,
});

export const peer = (
  device_id: string,
  device_class: DeviceClass = "counter_electron",
): PeerInfo => ({ device_id, device_class });

/** Zero-chaos policy — deterministic 5 ms hops for directed state-machine assertions. */
export const LOSSLESS = { latency: [5, 5] as [number, number], dropRate: 0, duplicateRate: 0 };

// ---------------------------------------------------------------------------
// Wire tap. TraceEntry's shape is not part of the contract, so ordering
// assertions (S1 star, S4 push → ack → fan-out) run on this per-device wire
// log instead: every send and every delivery, stamped with virtual time.
// ---------------------------------------------------------------------------

export type WireRecord = {
  dir: "sent" | "received";
  other: string;
  message: ProtocolMessage;
  at: number;
};

export const tapTransport = (
  sim: Sim,
  inner: MeshTransport,
  records: WireRecord[],
): MeshTransport => ({
  start(handlers) {
    inner.start({
      onPeerVisible: (p) => handlers.onPeerVisible(p),
      onPeerLost: (device_id) => handlers.onPeerLost(device_id),
      onMessage: (from, message) => {
        records.push({ dir: "received", other: from, message, at: sim.now() });
        handlers.onMessage(from, message);
      },
    });
  },
  stop() {
    inner.stop();
  },
  send(to, message) {
    records.push({ dir: "sent", other: to, message, at: sim.now() });
    inner.send(to, message);
  },
});

export const wireOf = (
  records: readonly WireRecord[],
  dir: WireRecord["dir"],
  kind: ProtocolMessage["kind"],
): WireRecord[] => records.filter((r) => r.dir === dir && r.message.kind === kind);

/** Event ids carried by a push or event_batch; [] for every other kind. */
export const batchEventIds = (message: ProtocolMessage): string[] =>
  message.kind === "push" || message.kind === "event_batch" ? message.events.map((e) => e.id) : [];

// ---------------------------------------------------------------------------
// Full mesh device: real store + sim transport (tapped) + contracted session.
// ---------------------------------------------------------------------------

export type MeshDevice = {
  info: PeerInfo;
  store: ReturnType<typeof openStore>;
  session: MeshSession;
  wire: WireRecord[];
};

export const meshDevice = (
  sim: Sim,
  device_id: string,
  device_class: DeviceClass = "counter_electron",
  opts: { path?: string } = {},
): MeshDevice => {
  const info = peer(device_id, device_class);
  const store = openStore({ path: opts.path ?? ":memory:", identity: meshIdentity(device_id) });
  const wire: WireRecord[] = [];
  const transport = tapTransport(sim, sim.lan.attach(info), wire);
  const session = createMeshSession({
    store,
    transport,
    clock: sim.clock,
    device_class,
    token: "lan-token-stub", // LAN auth is a stub at this rung (01-F27)
  });
  return { info, store, session, wire };
};

/** Append through the host-app fast path: durable append, then notifyAppended (01-F15). */
export const appendOn = (device: MeshDevice, overrides: Record<string, unknown> = {}) => {
  const envelope = device.store.append(appendInput(meshIdentity(device.info.device_id), overrides));
  device.session.notifyAppended();
  return envelope;
};

export const ledgerIds = (device: MeshDevice): string[] =>
  device.store.readAllEvents().map((e) => e.id);

export const closeAll = (devices: readonly MeshDevice[]): void => {
  for (const d of devices) {
    d.session.stop();
    d.store.close();
  }
};

// ---------------------------------------------------------------------------
// Raw scripted peer: attaches to the sim LAN with no mesh logic, so tests can
// play the other end of the handshake/heartbeat by hand.
// ---------------------------------------------------------------------------

export type RawPeer = {
  info: PeerInfo;
  transport: MeshTransport;
  visible: PeerInfo[];
  lost: string[];
  received: WireRecord[];
};

export const rawPeer = (
  sim: Sim,
  device_id: string,
  device_class: DeviceClass = "counter_electron",
  opts: { autoPong?: boolean } = {},
): RawPeer => {
  const info = peer(device_id, device_class);
  const transport = sim.lan.attach(info);
  const visible: PeerInfo[] = [];
  const lost: string[] = [];
  const received: WireRecord[] = [];
  transport.start({
    onPeerVisible: (p) => visible.push(p),
    onPeerLost: (id) => lost.push(id),
    onMessage: (from, message) => {
      received.push({ dir: "received", other: from, message, at: sim.now() });
      if (opts.autoPong && message.kind === "ping") transport.send(from, wirePong(message.t));
    },
  });
  return { info, transport, visible, lost, received };
};

// ---------------------------------------------------------------------------
// Wire message literals (PROTOCOL.md v1) — plain objects; the sim bus codec
// round-trips them through encodeMessage/decodeMessage on every hop.
// ---------------------------------------------------------------------------

export const hello = (device_id: string, device_class: DeviceClass): ProtocolMessage => ({
  v: 1,
  kind: "hello",
  device_id,
  device_class,
  branch_id: BRANCH,
  token: "lan-token-stub",
  last_global_seq: 0,
  own_high_water: 0,
});

export const helloAck = (
  session_id: string,
  hub: boolean,
  resume_from: number,
): ProtocolMessage => ({ v: 1, kind: "hello_ack", session_id, hub, resume_from });

export const wirePing = (t: number): ProtocolMessage => ({ v: 1, kind: "ping", t });

export const wirePong = (t: number): ProtocolMessage => ({ v: 1, kind: "pong", t });

/**
 * push{events, watermark} literal for scripting the follower half by hand
 * (PROTOCOL.md v1; T-01-05 fix-round additive). Envelopes come from
 * peerEnvelope — the sim bus codec validates them on the hop, so the cast
 * cannot smuggle a malformed message past the wire contract.
 */
export const wirePush = (
  events: ReadonlyArray<ReturnType<typeof peerEnvelope>>,
  watermark: number,
): ProtocolMessage => ({ v: 1, kind: "push", events, watermark }) as unknown as ProtocolMessage;

// ---------------------------------------------------------------------------
// Revivable peer (T-01-05 fix-round additive): attaches visible but plays dead —
// answers nothing — until revive(), after which it answers hello with
// hello_ack{hub: true} and pongs pings. Drives the fix-round-2 liveness law:
// suspicion clears only on inbound traffic; a suspect that shows life re-enters
// candidacy on the next peer-set recompute.
// ---------------------------------------------------------------------------

export type RevivablePeer = {
  info: PeerInfo;
  transport: MeshTransport;
  received: WireRecord[];
  revive: () => void;
};

export const revivablePeer = (
  sim: Sim,
  device_id: string,
  device_class: DeviceClass = "counter_electron",
): RevivablePeer => {
  const info = peer(device_id, device_class);
  const transport = sim.lan.attach(info);
  const received: WireRecord[] = [];
  let alive = false;
  let sessions = 0;
  transport.start({
    onPeerVisible: () => {},
    onPeerLost: () => {},
    onMessage: (from, message) => {
      received.push({ dir: "received", other: from, message, at: sim.now() });
      if (!alive) return; // dead-but-visible: never answers
      if (message.kind === "hello") {
        sessions += 1;
        transport.send(from, helloAck(`revived-${device_id}-${sessions}`, true, 0));
      }
      if (message.kind === "ping") transport.send(from, wirePong(message.t));
    },
  });
  return {
    info,
    transport,
    received,
    revive: () => {
      alive = true;
    },
  };
};

// ---------------------------------------------------------------------------
// Election oracle helpers.
// ---------------------------------------------------------------------------

/**
 * Independent reference winner per HUB-ELECTION.md: rank = index in
 * HUB_ELIGIBLE_CLASSES (lower wins), tie → lexicographically lowest device_id,
 * non-eligible classes never win, null when nothing is eligible.
 */
export const referenceWinner = (peers: readonly PeerInfo[]): string | null => {
  const eligible = peers
    .map((p) => ({
      id: p.device_id,
      rank: (HUB_ELIGIBLE_CLASSES as readonly string[]).indexOf(p.device_class),
    }))
    .filter((p) => p.rank >= 0)
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return eligible[0]?.id ?? null;
};

/** Seeded Fisher–Yates — permutation-invariance property input (no ambient randomness). */
export const shuffled = <T>(items: readonly T[], seed: number): T[] => {
  const rng = seededRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = must(out[i]);
    out[i] = must(out[j]);
    out[j] = a;
  }
  return out;
};

/** lamport_seqs of `origin`'s events in ledger-read order — S3/S4 assert these ascend. */
export const originLamports = (
  events: readonly { device_id: string; lamport_seq: number }[],
  origin: string,
): number[] => events.filter((e) => e.device_id === origin).map((e) => e.lamport_seq);

export const isAscending = (xs: readonly number[]): boolean =>
  xs.every((x, i) => i === 0 || x > must(xs[i - 1]));
