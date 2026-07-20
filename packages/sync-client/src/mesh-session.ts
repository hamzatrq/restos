// LAN mesh session (T-01-05; 01-F12/F13/F15; 24-F8 artifacts HUB-ELECTION.md +
// PROTOCOL.md): the 4-state machine solo/follower/candidate/hub over an injected
// transport + Clock — all time comes through the seam (20 §2.4). Election is the
// pure electHub function re-run on every peer-set change; split-brain is safe by
// design (both hubs relay append-only events; heal merges by set-union + id-dedupe,
// 01-F8/F38). Delivery is fire-and-forget: correctness never depends on any single
// send — follower re-push, per-heartbeat window re-fan, and event-id dedupe absorb
// loss. The hub ack is session-local and volatile: it NEVER moves store.advanceTo —
// that watermark is the cloud write-checkpoint (19 §5).
import type { DeviceClass, EventEnvelopeT } from "@restos/domain";
import type {
  Clock,
  MeshTransport,
  PeerInfo,
  ProtocolMessage,
  TimerId,
  TransportHandlers,
} from "@restos/sync-protocol";
import type { DeviceStore } from "./device-store.js";
import { electHub } from "./hub-election.js";

// Binding constants (HUB-ELECTION.md): hub pings every 2 s; follower marks the hub
// lost after 3 missed (6 s, derived); loss-to-new-hub-connected < 10 s (01-F13).
export const HEARTBEAT_INTERVAL_MS = 2_000;
export const HEARTBEAT_MISSED_LIMIT = 3;
export const HUB_LOSS_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * HEARTBEAT_MISSED_LIMIT;
export const REELECTION_BUDGET_MS = 10_000;
// Fix-round amendment 2 (binding): a computed winner that has not answered our
// hello with hello_ack within this window is suspected exactly like a lost
// connected hub — liveness under a visible-but-dead top-ranked device (01-F13).
export const HELLO_TIMEOUT_MS = 4_000;

/** Outbox drain page per push — not contracted; dedupe makes overlap free (01-F8). */
const PUSH_BATCH_MAX = 500;

export type MeshSessionState = "solo" | "follower" | "candidate" | "hub";

export type MeshSessionStatus = {
  state: MeshSessionState;
  hub_id: string | null;
  peers: PeerInfo[];
  last_push_ack: number | null;
};

export type MeshSession = {
  start(): void;
  stop(): void;
  /** Host-app fast path (01-F15): an event was durably appended — propagate now. */
  notifyAppended(): void;
  status(): MeshSessionStatus;
};

type FollowerSession = { missed: number; timer: TimerId | null };

export const createMeshSession = (options: {
  store: DeviceStore;
  transport: MeshTransport;
  clock: Clock;
  device_class: DeviceClass;
  token: string;
}): MeshSession => {
  const { store, transport, clock, device_class, token } = options;
  const self: PeerInfo = { device_id: store.identity.device_id, device_class };
  const eligible = electHub([self]) === self.device_id;

  let running = false;
  let state: MeshSessionState = "solo";
  const visible = new Map<string, PeerInfo>();
  // Suspected-dead devices (a connected hub silent for HUB_LOSS_TIMEOUT_MS, or a
  // computed winner that never hello_ack'd within HELLO_TIMEOUT_MS): excluded from
  // election until they show life. Suspicion clears ONLY on inbound traffic from
  // the suspect — never by timer expiry (fix-round 2: an expiry-clear re-adopts a
  // corpse forever); a cleared suspect re-enters candidacy on the next peer-set
  // recompute.
  const suspects = new Set<string>();

  // Follower side. The LAN push cursor (last_push_ack) is session-local and
  // volatile (19 §5) — worst case re-push, id-dedupe absorbs.
  let hubTarget: string | null = null;
  let connected = false;
  let resumeFrom = 0;
  let lastPushAck: number | null = null;
  // Highest own lamport already fanned to followers while acting as hub. Cloud-
  // independent (never the outbox checkpoint) so hub-origin fast-path survives a
  // cloud ack (K-04, 01-F15). Window replay on join/heartbeat covers any gap.
  let hubFanCursor = 0;
  let lastHubAliveAt = 0;
  let followerTick: TimerId | null = null;
  let lossTimer: TimerId | null = null;
  let helloTimer: TimerId | null = null;

  // Hub side: per-connected-follower heartbeat bookkeeping. sessionSeq is the
  // monotonic per-session counter feeding deterministic session_ids (fix-round 3).
  const followers = new Map<string, FollowerSession>();
  let sessionSeq = 0;

  const send = (to: string, message: ProtocolMessage): void => {
    transport.send(to, message);
  };

  /** Highest lamport contiguously held (from 0) for a device — hub ack/resume basis. */
  const contiguousHigh = (device_id: string): number => {
    const held = new Set(
      store
        .readAllEvents()
        .filter((e) => e.device_id === device_id)
        .map((e) => e.lamport_seq),
    );
    let high = -1;
    while (held.has(high + 1)) high += 1;
    return high;
  };

  // ---- follower duties -----------------------------------------------------

  const sendHello = (to: string): void => {
    const st = store.status();
    send(to, {
      v: 1,
      kind: "hello",
      device_id: self.device_id,
      device_class,
      branch_id: store.identity.branch_id,
      token,
      last_global_seq: st.last_global_seq ?? 0,
      own_high_water: st.own_high_water ?? 0,
    });
  };

  /** Drain own events to the hub from the session cursor onward (01-F15/01-F8). */
  const drainPush = (): void => {
    if (!connected || hubTarget === null) return;
    const from = lastPushAck === null ? resumeFrom : Math.max(resumeFrom, lastPushAck + 1);
    // Own events from the LAN session cursor, never the cloud-outbox page
    // (fix-round 1): nextBatch pages from the cloud checkpoint, and once the LAN
    // cursor is ≥ PUSH_BATCH_MAX past it the windows are disjoint and propagation
    // stalls forever — the WAN-down rush 01-F15 exists for.
    const events = store.readOwnEvents(from).slice(0, PUSH_BATCH_MAX);
    const last = events.at(-1);
    if (last === undefined) return;
    send(hubTarget, { v: 1, kind: "push", events, watermark: last.lamport_seq });
  };

  const clearFollowerTimers = (): void => {
    if (followerTick !== null) {
      clock.clearTimeout(followerTick);
      followerTick = null;
    }
    if (lossTimer !== null) {
      clock.clearTimeout(lossTimer);
      lossTimer = null;
    }
    if (helloTimer !== null) {
      clock.clearTimeout(helloTimer);
      helloTimer = null;
    }
  };

  const teardownFollower = (): void => {
    clearFollowerTimers();
    hubTarget = null;
    connected = false;
    lastPushAck = null;
  };

  /** Retry cadence while following: re-hello until acked, re-push until caught up. */
  const scheduleFollowerTick = (): void => {
    followerTick = clock.setTimeout(() => {
      followerTick = null;
      if (!running || state !== "follower" || hubTarget === null) return;
      if (connected) drainPush();
      else sendHello(hubTarget);
      scheduleFollowerTick();
    }, HEARTBEAT_INTERVAL_MS);
  };

  const scheduleLossCheck = (delayMs: number): void => {
    lossTimer = clock.setTimeout(() => {
      lossTimer = null;
      if (!running || !connected) return;
      const idle = clock.now() - lastHubAliveAt;
      if (idle >= HUB_LOSS_TIMEOUT_MS) {
        onHubLoss(true);
        return;
      }
      scheduleLossCheck(HUB_LOSS_TIMEOUT_MS - idle);
    }, delayMs);
  };

  /**
   * Fix-round 2 (01-F13 liveness): a computed winner that never hello_acks within
   * HELLO_TIMEOUT_MS is a corpse — suspect it exactly like a lost connected hub.
   */
  const scheduleHelloTimeout = (): void => {
    helloTimer = clock.setTimeout(() => {
      helloTimer = null;
      if (!running || connected || state !== "follower" || hubTarget === null) return;
      onHubLoss(true);
    }, HELLO_TIMEOUT_MS);
  };

  // ---- hub duties ----------------------------------------------------------

  const dropFollower = (device_id: string): void => {
    const session = followers.get(device_id);
    if (session === undefined) return;
    if (session.timer !== null) clock.clearTimeout(session.timer);
    followers.delete(device_id);
  };

  const teardownHub = (): void => {
    for (const device_id of [...followers.keys()]) dropFollower(device_id);
  };

  /** Full-window event_batch — joiner catchup and per-heartbeat re-fan; id-dedupe absorbs (assumption 6). */
  const replayWindowTo = (device_id: string): void => {
    const events = store.readAllEvents();
    if (events.length === 0) return;
    send(device_id, { v: 1, kind: "event_batch", events });
  };

  const scheduleHeartbeat = (device_id: string): void => {
    const session = followers.get(device_id);
    if (session === undefined) return;
    session.timer = clock.setTimeout(() => {
      const live = followers.get(device_id);
      if (!running || live === undefined) return;
      live.timer = null;
      if (live.missed >= HEARTBEAT_MISSED_LIMIT) {
        dropFollower(device_id); // HEARTBEAT_MISSED_LIMIT unanswered → heartbeats stop
        return;
      }
      live.missed += 1;
      send(device_id, { v: 1, kind: "ping", t: clock.now() });
      replayWindowTo(device_id); // idempotent loss recovery for fan-out (01-F8)
      scheduleHeartbeat(device_id);
    }, HEARTBEAT_INTERVAL_MS);
  };

  const admitFollower = (device_id: string): void => {
    dropFollower(device_id); // re-hello = fresh session
    followers.set(device_id, { missed: 0, timer: null });
    scheduleHeartbeat(device_id);
    send(device_id, {
      v: 1,
      kind: "hello_ack",
      // Deterministic composition (fix-round 3, 20 §2.4): no wall clock, no
      // crypto randomness — (hub, follower, seam now, per-session counter).
      session_id: `${self.device_id}:${device_id}:${clock.now()}:${sessionSeq++}`,
      hub: true,
      // Next lamport_seq the hub expects from this device (assumption 7): highest
      // contiguously held + 1, which is 0 when nothing is held.
      resume_from: contiguousHigh(device_id) + 1,
    });
    replayWindowTo(device_id);
  };

  const handlePush = (from: string, events: readonly EventEnvelopeT[]): void => {
    const heldBefore = new Set(store.readAllEvents().map((e) => e.id));
    store.ingestBatch(events); // persists before ack (01-F2); invalid skipped + counted (01-F37)
    const heldAfter = new Set(store.readAllEvents().map((e) => e.id));
    const fresh = events.filter((e) => !heldBefore.has(e.id) && heldAfter.has(e.id));
    const acked = contiguousHigh(from);
    // acked < 0 means nothing contiguously held — the wire watermark is a
    // nonnegative seq, so stay silent and let the origin's retry re-push.
    if (acked >= 0) send(from, { v: 1, kind: "push_ack", acked_watermark: acked });
    if (fresh.length === 0) return;
    for (const device_id of followers.keys()) {
      if (device_id === from) continue;
      send(device_id, { v: 1, kind: "event_batch", events: fresh });
    }
  };

  // ---- election ------------------------------------------------------------

  /** Hub gone: by silence/hello-timeout (suspect=true, exclude it) or by visibility loss. */
  const onHubLoss = (suspect: boolean): void => {
    const lost = hubTarget;
    teardownFollower();
    if (suspect && lost !== null) suspects.add(lost);
    // Transient no-hub recompute window (assumption 4) — eligible devices pass
    // through candidate; scoped classes go follower/null, never candidate (01-F39).
    state = eligible ? "candidate" : "follower";
    recompute();
  };

  /** Re-run the pure election over (visible ∖ suspects) ∪ self and adopt the result. */
  const recompute = (): void => {
    if (!running) return;
    const peers = [...visible.values()].filter((p) => !suspects.has(p.device_id));
    const winner = electHub([...peers, self]);
    if (winner === self.device_id) {
      if (state === "follower" || state === "candidate") teardownFollower();
      state = visible.size === 0 ? "solo" : "hub"; // solo acts as hub for later joiners
      return;
    }
    if (state === "hub" || state === "solo") teardownHub();
    if (winner === null) {
      teardownFollower();
      state = "follower"; // waits with hub_id null
      return;
    }
    if (state === "follower" && hubTarget === winner) return; // already adopted
    teardownFollower();
    state = "follower";
    hubTarget = winner;
    sendHello(winner); // connect: hello → hello_ack{hub:true}
    scheduleFollowerTick();
    scheduleHelloTimeout();
  };

  // ---- wire dispatch -------------------------------------------------------

  const dispatch = (from: string, message: ProtocolMessage): void => {
    // Inbound traffic is the ONLY thing that clears suspicion (fix-round 2): the
    // sender is provably alive; it re-enters candidacy on the next peer-set
    // recompute — never by an immediate re-election here.
    suspects.delete(from);
    switch (message.kind) {
      case "hello": {
        if (state === "hub" || state === "solo") admitFollower(from);
        return;
      }
      case "hello_ack": {
        if (state !== "follower" || from !== hubTarget) return;
        connected = true;
        if (helloTimer !== null) {
          clock.clearTimeout(helloTimer);
          helloTimer = null;
        }
        resumeFrom = message.resume_from;
        lastPushAck = null;
        lastHubAliveAt = clock.now();
        if (lossTimer === null) scheduleLossCheck(HUB_LOSS_TIMEOUT_MS);
        drainPush();
        return;
      }
      case "push": {
        // Ingest from any device while acting as hub — id-dedupe keeps the mesh
        // converging even when session bookkeeping is mid-repair.
        if (state === "hub" || state === "solo") handlePush(from, message.events);
        return;
      }
      case "push_ack": {
        if (state !== "follower" || !connected || from !== hubTarget) return;
        if (lastPushAck === null || message.acked_watermark > lastPushAck) {
          lastPushAck = message.acked_watermark; // session-local; NEVER store.advanceTo (19 §5)
          drainPush(); // continue past the ack if more remains
        }
        return;
      }
      case "event_batch": {
        store.ingestBatch(message.events); // validated, deduped, persisted (01-F4/F8/F2)
        return;
      }
      case "ping": {
        if (from !== hubTarget) return; // non-hub pings: life already noted above
        lastHubAliveAt = clock.now();
        send(from, { v: 1, kind: "pong", t: message.t });
        return;
      }
      case "pong": {
        const session = followers.get(from);
        if (session !== undefined) session.missed = 0;
        return;
      }
      default:
        return; // catchup/quarantine/purge are cloud-session kinds — not this rung
    }
  };

  const handlers: TransportHandlers = {
    onPeerVisible: (peer) => {
      // Discovery visibility is NOT life (fix-round 2): a hung app behind a live
      // announcer must stay suspect — only wire traffic clears suspicion.
      visible.set(peer.device_id, peer);
      recompute();
    },
    onPeerLost: (device_id) => {
      visible.delete(device_id);
      dropFollower(device_id);
      if (device_id === hubTarget) {
        onHubLoss(false);
        return;
      }
      recompute();
    },
    onMessage: (from, message) => {
      if (running) dispatch(from, message);
    },
  };

  return {
    start() {
      if (running) return;
      running = true;
      // Cold start: empty peer set → solo if hub-eligible, else follower/null.
      state = eligible ? "solo" : "follower";
      transport.start(handlers);
    },

    stop() {
      if (!running) return;
      running = false;
      transport.stop();
      teardownFollower();
      teardownHub();
      suspects.clear();
      // Fix-round 5: ghost peers from a stopped period must not survive into a
      // restart and win elections — start() rebuilds from live announcements.
      visible.clear();
    },

    notifyAppended() {
      if (!running) return;
      if (state === "follower") {
        drainPush();
        return;
      }
      // Acting hub: fan the hub's OWN newly-appended events to followers on the fast
      // path (01-F15). Reads via the hub fan cursor over readOwnEvents — NEVER
      // store.nextBatch, which pages from the cloud write-checkpoint and goes empty
      // after a cloud ack, silently dropping hub-origin events to the ~2s heartbeat
      // replay (K-04; the same leftover the follower drainPush already fixed).
      const events = store.readOwnEvents(hubFanCursor).slice(0, PUSH_BATCH_MAX);
      if (events.length === 0) return;
      for (const device_id of followers.keys()) {
        send(device_id, { v: 1, kind: "event_batch", events });
      }
      const last = events.at(-1);
      if (last) hubFanCursor = last.lamport_seq + 1;
    },

    status() {
      return {
        state,
        hub_id:
          state === "hub" || state === "solo"
            ? self.device_id
            : state === "follower"
              ? hubTarget
              : null,
        peers: [...visible.values()],
        last_push_ack: lastPushAck,
      };
    },
  };
};
