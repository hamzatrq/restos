// Cloud session (T-01-06 contract (b); 01-F8/F9/F11/F34/F37): one device's cloud
// uplink over an injected CloudTransport — the WAN mirror of the LAN mesh follower
// (mesh-session.ts). On connect it hellos, drains the cloud outbox to the gateway's
// push_ack (THE outbox write-checkpoint, 19 §5 — store.advanceTo, unlike the volatile
// LAN cursor of T-01-05 which never moves it), catches the branch stream up from the
// EXCLUSIVE global_seq cursor (global_seq starts at 1, so 0 = everything), applies live
// event_batch fan-out — origin-inclusive, so a device learns its own events' global_seq
// and converges to cloud order (01-F34) — and surfaces quarantine notices in status().
// Per-device cloud sessions remain the default; ADDITIONALLY, when the mesh session
// signals it is acting hub (store relay seam) AND the gateway advertised
// relay_authorized on hello_ack, this session relays held same-branch peers' events
// upward verbatim, one origin per push, and records the per-origin cloud acks for the
// mesh to propagate back over LAN (DEC-SYNC-009, T-01-12 — supersedes DEC-SYNC-004's
// no-proxy rule; the hub never advances the ORIGIN's checkpoint, only the origin does).
// Deterministic: no Date.now/newId and no self-scheduled timers — it acts
// only in response to transport edges (onUp/onDown), inbound wire messages and the
// store's relay-drain signal; reconnect/backoff is the transport's job (the sim-cloud
// double fires onUp/onDown, the real WS adapter schedules reconnect through its own
// clock).
import type { DeviceClass, EventEnvelopeT } from "@restos/domain";
import type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { type DeviceStore, DivergentDuplicateError } from "./device-store.js";

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
  // ---- hub-relay state (DEC-SYNC-009, T-01-12; all volatile) ---------------
  // relayAuthorized: the gateway's hello_ack advertisement — without it this
  // session NEVER pushes third-party events (an unadvertised attempt would
  // quarantine device_mismatch and poison the session's own watermark).
  let relayAuthorized = false;
  // relayRequested: latched by the mesh's relay-drain signal even while the WAN
  // is down, so a reconnect (hello_ack) resumes the relay (R5/R6 heal shape).
  // Cleared when the mesh leaves hub duty (fix round F4, DEC-SYNC-006):
  // followers never relay, even across a WAN bounce whose hello_ack would
  // otherwise resume a stale latch.
  let relayRequested = false;
  // Per-origin relay cursor: last cloud-acked watermark per origin, from
  // per-origin push_acks. Session-local; a fresh session re-relays from zero
  // and id-dedupe absorbs the overlap (01-F8).
  const relayAcked = new Map<string, number>();
  // Volatile per-origin suppression (T-01-09 fix round F1(b), ruled): origins
  // the gateway's origin-registry gate refused — a quarantine_notice with
  // reason origin_unregistered|origin_revoked stops relay of THAT origin for
  // the session's life (its events earn no ack, so re-pushing loops forever).
  // Cleared on hello_ack: a fresh session retries once → re-noticed →
  // re-suppressed (bounded, not livelock).
  const suppressedOrigins = new Set<string>();
  let unsubscribeRelay: (() => void) | null = null;
  let unsubscribeRelayCancel: (() => void) | null = null;

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

  /**
   * Relay one origin's pending tail upward: its held events past the per-origin
   * relay cursor, lamport order, ONE origin per push (T-01-12 ruling — the
   * scalar push_ack answers that origin). Verbatim envelopes from the held
   * branch window — attested, never re-authored (01-F1).
   */
  const relayPushFor = (origin: string, held: readonly EventEnvelopeT[]): void => {
    const from = (relayAcked.get(origin) ?? -1) + 1;
    const pending = held.filter((e) => e.lamport_seq >= from).slice(0, CLOUD_PUSH_BATCH_MAX);
    const last = pending.at(-1);
    if (last === undefined) return;
    transport.send({ v: 1, kind: "push", events: [...pending], watermark: last.lamport_seq });
  };

  /**
   * Relay drain (DEC-SYNC-009): candidate rule (T-01-12, implementer-proposed —
   * flagged for oracle review): EVERY same-branch peer origin present in the
   * held branch window with events past its relay cursor. A device with its own
   * WAN session may be relayed too — gateway id-dedupe keeps the merged log
   * exactly-once (R4 green pin), and the per-origin ack is idempotent.
   */
  const relayDrain = (originFilter?: string): void => {
    if (!connected || !relayAuthorized || !relayRequested) return;
    const own = store.identity.device_id;
    const byOrigin = new Map<string, EventEnvelopeT[]>();
    for (const e of store.readAllEvents()) {
      // readAllEvents is (device_id, lamport_seq)-sorted — per-origin order holds.
      if (e.device_id === own) continue;
      if (suppressedOrigins.has(e.device_id)) continue; // gate-refused this session (F1(b))
      if (originFilter !== undefined && e.device_id !== originFilter) continue;
      const held = byOrigin.get(e.device_id);
      if (held === undefined) byOrigin.set(e.device_id, [e]);
      else held.push(e);
    }
    for (const [origin, held] of byOrigin) relayPushFor(origin, held);
  };

  // ---- cloud → device ------------------------------------------------------

  /**
   * Apply a merged batch (live fan-out or a catchup page): split the two cloud stamps
   * off each wire event and ingest it. Own events return via origin-inclusive fan-out
   * and take the store's duplicate-id adoption path (01-F34).
   *
   * The pull cursor advances ONLY through a contiguous prefix of events that actually
   * landed. A transient ingest failure stops the advance, so catchup re-delivers that
   * event; previously the cursor moved to the batch maximum regardless and the failed
   * event was skipped forever (01-F9/01-F34 convergence hole). A divergent duplicate is
   * the one failure that is permanently known-bad — its id is already stored, so
   * re-fetching cannot help; it is surfaced in status() and the cursor passes it rather
   * than wedging the pull (01-F17). setLastGlobalSeq is a raw write — monotonicity here.
   */
  const applyEvents = (events: readonly WireEvent[]): void => {
    let advanceTo = -1;
    let blocked = false;
    for (const e of events) {
      const { global_seq, ...envelope } = e;
      let landed = true;
      try {
        store.ingest(envelope, global_seq === undefined ? undefined : { global_seq });
      } catch (err) {
        if (err instanceof DivergentDuplicateError) {
          quarantined.push({ event_id: err.eventId, reason: "divergent_duplicate" });
        } else {
          landed = false; // did not land — the cursor must not pass it
        }
      }
      if (!landed) blocked = true;
      if (!blocked && global_seq !== undefined && global_seq > advanceTo) advanceTo = global_seq;
    }
    if (advanceTo >= 0) {
      const current = store.status().last_global_seq ?? 0;
      if (advanceTo > current) store.setLastGlobalSeq(advanceTo);
    }
  };

  const dispatch = (message: ProtocolMessage): void => {
    switch (message.kind) {
      case "hello_ack": {
        connected = true;
        // The gateway's relay advertisement (DEC-SYNC-009): absent = never relay.
        relayAuthorized = message.relay_authorized === true;
        // A FRESH session retries suppressed origins once — re-noticed →
        // re-suppressed; a re-registered origin resumes (F1(b), bounded).
        suppressedOrigins.clear();
        drainPush(); // drain the outbox tail (paged from the cloud checkpoint)
        // Exclusive cursor: global_seq starts at 1, so last_global_seq ?? 0 = "send
        // everything"; catchup_response pages via next_from while complete === false.
        sendCatchup(store.status().last_global_seq ?? 0);
        relayDrain(); // resume any latched relay work across a reconnect (DEC-SYNC-009)
        return;
      }
      case "push_ack": {
        const origin = message.origin_device_id;
        if (origin !== undefined && origin !== store.identity.device_id) {
          // Per-ORIGIN relay ack (DEC-SYNC-009): record it for the mesh to
          // propagate over LAN — NEVER this session's own write-checkpoint
          // (the hub only guarantees delivery; the origin owns its outbox).
          const prev = relayAcked.get(origin) ?? -1;
          if (message.acked_watermark > prev) {
            relayAcked.set(origin, message.acked_watermark);
            store.noteRelayedCloudAck(origin, message.acked_watermark);
            relayDrain(origin); // chain the next relay page for this origin
          }
          return;
        }
        // T-01-08 owed pin F3-ext (mesh F3's shape, 19 §5): an own-stream cloud
        // ack beyond own appended high water — the wiped-device DR rejoin, where
        // quarantine slots from the pre-wipe life keep the cloud watermark high
        // (lamport_conflict fills, DEC-SYNC-005) while the reborn store holds
        // almost nothing — is IGNORED, never thrown out of the transport
        // dispatch: the checkpoint never claims unappended slots, the poison
        // value never touches the ack bookkeeping, and the session keeps
        // processing later genuine acks.
        const ownHigh = store.status().own_high_water;
        if (ownHigh === null || message.acked_watermark > ownHigh) return;
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
        // T-01-08 (01-F37 "originating device notified" / PROTOCOL.md:
        // quarantine_notice → origin device): when the quarantined event is a
        // HELD PEER's — the relay shape, where the live cloud notice terminates
        // at this pushing hub session — record it on the store seam for the
        // mesh to forward over the LAN. The WAN-less origin has no cloud
        // session; the hub's LAN forward is its only notification path
        // (at-least-once — the gateway's durable outbox redelivers on the
        // origin's next own hello, DEC-SYNC-008).
        const held = store.readAllEvents().find((e) => e.id === message.event_id);
        if (held !== undefined && held.device_id !== store.identity.device_id) {
          // F1(b) (T-01-09 fix round, ruled): an origin the gateway's registry
          // gate refused stops relaying for this session's life — its events
          // can never ack, so every re-push is a wasted loop iteration.
          if (message.reason === "origin_unregistered" || message.reason === "origin_revoked") {
            suppressedOrigins.add(held.device_id);
          }
          store.noteRelayedQuarantineNotice(held.device_id, {
            event_id: message.event_id,
            reason: message.reason,
          });
        }
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
      // The mesh (acting hub) signals over the store seam when it ingests
      // follower events (DEC-SYNC-009): latch the request — the flag survives a
      // WAN-down window so hello_ack resumes the relay — and drain if possible.
      unsubscribeRelay = store.onRelayDrainRequested(() => {
        if (!running) return;
        relayRequested = true;
        relayDrain();
      });
      // Fix round F4 (DEC-SYNC-006): the mesh signals over the same seam when
      // it leaves hub duty (hub→follower demotion, or stop) — clear the latch
      // so no later hello_ack resumes relaying from a demoted device.
      unsubscribeRelayCancel = store.onRelayDrainCancelled(() => {
        relayRequested = false;
      });
      transport.start(handlers);
    },

    stop() {
      if (!running) return;
      running = false;
      connected = false;
      if (unsubscribeRelay !== null) {
        unsubscribeRelay();
        unsubscribeRelay = null;
      }
      if (unsubscribeRelayCancel !== null) {
        unsubscribeRelayCancel();
        unsubscribeRelayCancel = null;
      }
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
