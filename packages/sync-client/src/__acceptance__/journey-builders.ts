// JOURNEY-oracle builders — the cross-seam regression round (adversarial review of
// the post-review round, `plans/wave-0/sec-review-followups.md`).
//
// WHY THIS FILE EXISTS. Six tasks shipped green, each with its own oracle, and an
// adversarial pass then found three blocking defects. The root cause was structural:
// every oracle pinned ONE module's contract, so a seam spanning two of them was
// invisible to all of them. These builders are deliberately shaped to compose the
// planes rather than isolate them — one store carrying BOTH a cloud session and a
// mesh session, a scripted wire at the exact protocol surface, and a store that
// survives a process restart on disk.
//
// Authored from spec text + the finding list ONLY (24 §3 step 2 — read-only to any
// implementing session):
//   • 01-F47 device token lifetime/binding/renewal, amended July 2026: "The device
//     PERSISTS the renewal itself and presents it on every later connection."
//   • 01-F43 branch time authority / 01-F13 hub election.
//   • DEC-SYNC-011 (a) observable, (b) stop-and-report NEVER SKIP, (c) keep selling.
//   • 01-F9 catch-up range fetch, 01-F11 sync status, 01-F17 a sale is never blocked.
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { parseMessage } from "@restos/sync-protocol";
import { createSim, type Sim } from "@restos/testing";
import {
  type CloudSession,
  type CloudSessionStatus,
  createCloudSession,
  createMeshSession,
  type DeviceStore,
  type MeshSession,
  openStore,
} from "../index.js";
import { type Identity, identity, must } from "./builders.js";
import { meshIdentity } from "./mesh-builders.js";

// ---------------------------------------------------------------------------
// Scripted cloud end (the cloud-ack-guard / T-01-20 idiom): the test plays the
// gateway by hand at the exact wire surface, and every frame in BOTH directions
// passes parseMessage, so nothing wire-invalid can be smuggled in either way.
// ---------------------------------------------------------------------------

export type ScriptedCloud = {
  transport: CloudTransport;
  sent: ProtocolMessage[];
  up(): void;
  down(): void;
  deliver(raw: unknown): void;
};

export const scriptedCloud = (): ScriptedCloud => {
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
    down: () => must(handlers, "started transport").onDown(),
    deliver: (raw) => must(handlers, "started transport").onMessage(parseMessage(raw)),
  };
};

// ── wire literals (PROTOCOL.md v1) ──────────────────────────────────────────

export const helloAck = (
  session_id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  v: 1,
  kind: "hello_ack",
  session_id,
  hub: false,
  resume_from: 0,
  ...extra,
});

export const withSeq = (envelope: object, global_seq: number): Record<string, unknown> => ({
  ...envelope,
  global_seq,
});

/** A completed catch-up page (01-F9). `complete: true` keeps the tape free of paging noise. */
export const catchupPage = (events: readonly unknown[]): Record<string, unknown> => ({
  v: 1,
  kind: "catchup_response",
  events,
  complete: true,
  next_from: 0,
});

/** LIVE fan-out (01-F8). The SAME `applyEvents` path as catch-up — that shared
 * entry point is precisely what B2 turned into silent data loss. */
export const eventBatch = (events: readonly unknown[]): Record<string, unknown> => ({
  v: 1,
  kind: "event_batch",
  events,
});

export const pushAck = (extra: Record<string, unknown>): Record<string, unknown> => ({
  v: 1,
  kind: "push_ack",
  ...extra,
});

/** The from_global_seq of the last catchup_request the device sent (exclusive cursor, 01-F9). */
export const lastCatchupFrom = (sent: readonly ProtocolMessage[]): number =>
  must(sent.filter((m) => m.kind === "catchup_request").at(-1), "a catchup_request")
    .from_global_seq;

/** The token the device presented on its most recent hello (01-F47 "presents it
 * on every later connection" — the only observable proof of what it holds). */
export const lastHelloToken = (sent: readonly ProtocolMessage[]): string =>
  must(sent.filter((m) => m.kind === "hello").at(-1), "a hello").token;

// ---------------------------------------------------------------------------
// One device on the CLOUD plane only.
// ---------------------------------------------------------------------------

export type CloudDevice = {
  id: Identity;
  store: DeviceStore;
  session: CloudSession;
  cloud: ScriptedCloud;
  stop(): void;
};

export const cloudDevice = (opts: { token?: string; id?: Identity } = {}): CloudDevice => {
  const id = opts.id ?? identity();
  const store = openStore({ path: ":memory:", identity: id });
  const cloud = scriptedCloud();
  const session = createCloudSession({
    store,
    transport: cloud.transport,
    clock: createSim({ seed: 9_001 }).clock,
    device_class: "counter_electron",
    token: opts.token ?? "journey-cloud-token",
  });
  session.start();
  cloud.up();
  cloud.deliver(helloAck("journey-session-1"));
  return {
    id,
    store,
    session,
    cloud,
    stop: () => {
      session.stop();
      store.close();
    },
  };
};

/** The DEC-SYNC-011 report as the honesty UI reads it (01-F11 / 00 §5.7). */
export type BlockedCursorView = {
  global_seq: number | null;
  event_type: string;
  reason: string;
};

export const readBlocked = (session: CloudSession): BlockedCursorView | null => {
  const status = session.status() as CloudSessionStatus & { blocked?: BlockedCursorView | null };
  return status.blocked ?? null;
};

export const requireBlocked = (session: CloudSession, what: string): BlockedCursorView => {
  const blocked = readBlocked(session);
  if (blocked === null) {
    throw new Error(
      `DEC-SYNC-011(a)/(b) VIOLATED: expected a standing blocked-cursor report for ${what}, ` +
        "got none. A cleared report means the cursor is free to step over the blocking " +
        "sequence, and a skipped event is never re-requested (silent data loss, review B2).",
    );
  }
  return blocked;
};

// ---------------------------------------------------------------------------
// A HUB: one store carrying BOTH planes — a scripted cloud session (WAN) and a
// real mesh session on the sim LAN. This is the shape no per-module oracle had,
// and it is the only shape in which the relayed-renewal hand-off (cloud → store
// seam → LAN → origin) is a single observable journey.
// ---------------------------------------------------------------------------

export type HubDevice = {
  device_id: string;
  store: DeviceStore;
  cloudSession: CloudSession;
  mesh: MeshSession;
  cloud: ScriptedCloud;
  stop(): void;
};

export const hubDevice = (sim: Sim, device_id: string): HubDevice => {
  const store = openStore({ path: ":memory:", identity: meshIdentity(device_id) });
  const cloud = scriptedCloud();
  const cloudSession = createCloudSession({
    store,
    transport: cloud.transport,
    clock: sim.clock,
    device_class: "counter_electron",
    token: "journey-hub-cloud-token",
  });
  const mesh = createMeshSession({
    store,
    transport: sim.lan.attach({ device_id, device_class: "counter_electron" }),
    clock: sim.clock,
    device_class: "counter_electron",
    token: "journey-lan-token",
  });
  cloudSession.start();
  cloud.up();
  // relay_authorized is the gateway's DEC-SYNC-009 advertisement; a hub that never
  // got it never relays, so the renewal hand-off could not start at all.
  cloud.deliver(helloAck("journey-hub-session", { relay_authorized: true }));
  mesh.start();
  return {
    device_id,
    store,
    cloudSession,
    mesh,
    cloud,
    stop: () => {
      mesh.stop();
      cloudSession.stop();
      store.close();
    },
  };
};

/** A device with NO cloud transport at all — the T-01-12 WAN-less shape. Its ONLY
 * path to a renewed credential is the hub's LAN forward (01-F47 hub-relayed clause). */
export type LanOnlyDevice = {
  device_id: string;
  store: DeviceStore;
  mesh: MeshSession;
  stop(): void;
};

export const lanOnlyDevice = (
  sim: Sim,
  device_id: string,
  device_class: "waiter" | "kitchen" | "counter_rn" = "waiter",
): LanOnlyDevice => {
  const store = openStore({ path: ":memory:", identity: meshIdentity(device_id) });
  const mesh = createMeshSession({
    store,
    transport: sim.lan.attach({ device_id, device_class }),
    clock: sim.clock,
    device_class,
    token: "journey-lan-token",
  });
  mesh.start();
  return {
    device_id,
    store,
    mesh,
    stop: () => {
      mesh.stop();
      store.close();
    },
  };
};

export { createSim };
