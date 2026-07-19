// Cloud session (T-01-06 contract (b); 01-F8/F9/F11/F34/F37): one device's cloud
// uplink over an injected CloudTransport — the WAN mirror of the LAN mesh follower
// (mesh-session.ts). On connect it hellos, drains the cloud outbox to the gateway's
// push_ack (THE outbox write-checkpoint, 19 §5 — store.advanceTo, unlike the volatile
// LAN cursor of T-01-05 which never moves it), catches the branch stream up from the
// EXCLUSIVE global_seq cursor (global_seq starts at 1, so 0 = everything), applies live
// event_batch fan-out — origin-inclusive, so a device learns its own events' global_seq
// and converges to cloud order (01-F34) — and surfaces quarantine notices in status().
// Every device runs its own cloud session (DEC-SYNC-004: per-device sessions, no
// hub-proxy). Deterministic: no Date.now/newId and no self-scheduled timers — it acts
// only in response to transport edges (onUp/onDown) and inbound wire messages;
// reconnect/backoff is the transport's job (the sim-cloud double fires onUp/onDown, the
// real WS adapter schedules reconnect through its own clock).
import type { DeviceClass } from "@restos/domain";
import type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import type { DeviceStore } from "./device-store.js";

/** Cloud outbox drain page per push (contract (b)); id-dedupe makes overlap free (01-F8). */
export const CLOUD_PUSH_BATCH_MAX = 500;

/** A merged wire event: an envelope carrying its two cloud stamps (server_received_at + global_seq). */
type WireEvent = Extract<ProtocolMessage, { kind: "event_batch" }>["events"][number];

export type CloudSessionStatus = {
  connected: boolean;
  last_push_ack: number | null;
  last_global_seq: number | null;
  quarantined: readonly { event_id: string; reason: string }[];
};

export type CloudSession = {
  start(): void;
  stop(): void;
  /** Host-app fast path (01-F15): an event was durably appended — push it now. */
  notifyAppended(): void;
  status(): CloudSessionStatus;
};

export const createCloudSession = (options: {
  store: DeviceStore;
  transport: CloudTransport;
  // Injected for signature parity with the mesh; the cloud session schedules no timers
  // of its own (assumption 12 — reconnect lives in the transport), so it takes no time.
  clock: Clock;
  device_class: DeviceClass;
  token: string;
}): CloudSession => {
  const { store, transport, device_class, token } = options;

  let running = false;
  let connected = false;
  let lastPushAck: number | null = null;
  const quarantined: { event_id: string; reason: string }[] = [];

  // ---- device → cloud ------------------------------------------------------

  const sendHello = (): void => {
    const st = store.status();
    transport.send({
      v: 1,
      kind: "hello",
      device_id: store.identity.device_id,
      device_class,
      branch_id: store.identity.branch_id,
      token,
      last_global_seq: st.last_global_seq ?? 0,
      own_high_water: st.own_high_water ?? 0,
    });
  };

  const sendCatchup = (from_global_seq: number): void => {
    transport.send({ v: 1, kind: "catchup_request", from_global_seq });
  };

  /**
   * Drain the cloud outbox from the write-checkpoint onward (01-F8/01-F15). nextBatch
   * pages from acked_watermark — the cloud checkpoint — so this is correct here, unlike
   * the LAN cursor of T-01-05 fix-round 1. No pending events → send nothing; the cloud
   * answers with no push_ack and the session simply re-pushes on the next trigger.
   */
  const drainPush = (): void => {
    if (!connected) return;
    const events = store.nextBatch(CLOUD_PUSH_BATCH_MAX);
    const last = events.at(-1);
    if (last === undefined) return;
    transport.send({ v: 1, kind: "push", events, watermark: last.lamport_seq });
  };

  // ---- cloud → device ------------------------------------------------------

  /**
   * Apply a merged batch (live fan-out or a catchup page): split the two cloud stamps
   * off each wire event and ingest it. Own events return via origin-inclusive fan-out
   * and take the store's duplicate-id adoption path (01-F34); a per-event failure is
   * counted-not-thrown (01-F37 posture — the valid remainder still lands). The pull
   * cursor advances only forward (setLastGlobalSeq is a raw write — monotonicity is here).
   */
  const applyEvents = (events: readonly WireEvent[]): void => {
    let maxSeen = -1;
    for (const e of events) {
      const { global_seq, ...envelope } = e;
      try {
        store.ingest(envelope, global_seq === undefined ? undefined : { global_seq });
      } catch {
        // per-event failure skipped and counted (never thrown) — 01-F37 seed posture
      }
      if (global_seq !== undefined && global_seq > maxSeen) maxSeen = global_seq;
    }
    if (maxSeen >= 0) {
      const current = store.status().last_global_seq ?? 0;
      if (maxSeen > current) store.setLastGlobalSeq(maxSeen);
    }
  };

  const dispatch = (message: ProtocolMessage): void => {
    switch (message.kind) {
      case "hello_ack": {
        connected = true;
        drainPush(); // drain the outbox tail (paged from the cloud checkpoint)
        // Exclusive cursor: global_seq starts at 1, so last_global_seq ?? 0 = "send
        // everything"; catchup_response pages via next_from while complete === false.
        sendCatchup(store.status().last_global_seq ?? 0);
        return;
      }
      case "push_ack": {
        if (lastPushAck === null || message.acked_watermark > lastPushAck) {
          lastPushAck = message.acked_watermark;
          store.advanceTo(message.acked_watermark); // THE cloud write-checkpoint (19 §5)
          drainPush(); // chain the next page past the ack — drains a > 500 backlog
        }
        return;
      }
      case "event_batch": {
        applyEvents(message.events);
        return;
      }
      case "catchup_response": {
        applyEvents(message.events);
        if (!message.complete) sendCatchup(message.next_from); // page onward (01-F9)
        return;
      }
      case "quarantine_notice": {
        quarantined.push({ event_id: message.event_id, reason: message.reason });
        return;
      }
      default:
        return; // hello/push/catchup_request are device→cloud; ping/pong/purge unused here
    }
  };

  const handlers: CloudTransportHandlers = {
    onUp: () => {
      if (running) sendHello();
    },
    onDown: () => {
      connected = false;
    },
    onMessage: (message) => {
      if (running) dispatch(message);
    },
  };

  return {
    start() {
      if (running) return;
      running = true;
      transport.start(handlers);
    },

    stop() {
      if (!running) return;
      running = false;
      connected = false;
      transport.stop();
    },

    notifyAppended() {
      if (!running) return;
      drainPush();
    },

    status() {
      return {
        connected,
        last_push_ack: lastPushAck,
        last_global_seq: store.status().last_global_seq,
        quarantined: [...quarantined],
      };
    },
  };
};
