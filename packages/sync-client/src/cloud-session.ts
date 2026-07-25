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
import { type DeviceClass, type EventEnvelopeT, UnknownEventTypeError } from "@restos/domain";
import type {
  Clock,
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { type DeviceStore, DivergentDuplicateError, type PageItem } from "./device-store.js";

/** Cloud outbox drain page per push (contract (b)); id-dedupe makes overlap free (01-F8). */
export const CLOUD_PUSH_BATCH_MAX = 500;

/** A merged wire event: an envelope carrying its two cloud stamps (server_received_at + global_seq). */
type WireEvent = Extract<ProtocolMessage, { kind: "event_batch" }>["events"][number];

/**
 * Machine-readable blocked-cursor reasons (DEC-SYNC-011). Snake_case tokens for
 * fleet health (doc 15) to alert on — never a rendered message, and never anything
 * derived from a payload: payloads carry customer PII (00 §5.4) and fleet health
 * persists whatever it is given.
 *
 * On classifiability (the question the oracle round settled): at the point the cursor
 * stops, every DETERMINISTIC device-store rejection is permanent by construction —
 * transience only ever arrives from infrastructure (SQLITE_BUSY, disk full, fsync).
 * The two cases DEC-SYNC-011 names are cleanly separable by error class; the rest —
 * identity mismatch, lamport collision, bad global_seq, and genuine infra faults —
 * are not separable by class and share `ingest_failed`. That is deliberate: nothing
 * here claims "this is permanent", because the clearing rule (report on stop, clear
 * on advance) is correct for both, and a `permanent` flag could not be derived
 * honestly today without typed errors the store does not throw.
 */
export type BlockedReason = "unknown_event_type" | "schema_invalid" | "ingest_failed";

/**
 * The blocked-cursor report (DEC-SYNC-011). Present iff the contiguous-prefix cursor
 * is stopped; `null` when catch-up is flowing.
 *
 * Why this exists: a permanent rejection — an event type this build does not know, a
 * payload from a newer schema — is not divergence and not quarantinable at the device,
 * so the cursor simply stops. It used to stop SILENTLY: the device sat at a fixed
 * `last_global_seq`, `connected: true`, looking merely idle while it had permanently
 * stopped receiving the branch's events, and the honesty UI (00 §5.7) lied by omission.
 *
 * `event_type` is always present: `EventEnvelope.type` is `z.string().min(1)`, so the
 * protocol layer has already rejected any event that lacks one — a typeless blocking
 * event is unreachable here, not merely unhandled.
 *
 * This is a property of the CURSOR, not of the connection: it survives a disconnect
 * (the blockage is still there when the link returns) and clears only when the cursor
 * actually advances past the blocking sequence.
 */
export type BlockedCursor = {
  global_seq: number;
  event_type: string;
  reason: BlockedReason;
};

/**
 * Classify an ingest rejection into a machine-readable reason (DEC-SYNC-011).
 *
 * Only the two cases the decision names are separable by error class. `ZodError` is
 * matched by NAME rather than `instanceof` because a payload schema and the envelope
 * schema may come from different zod instances across package boundaries, where
 * `instanceof` silently fails and would quietly demote every schema rejection to the
 * catch-all. Everything else — identity mismatch, lamport collision, bad global_seq,
 * and genuine infrastructure faults — shares `ingest_failed`: they are not separable
 * by class, and claiming otherwise would be a guess encoded as a fact.
 */
const classifyBlock = (error: unknown): BlockedReason => {
  if (error instanceof UnknownEventTypeError) return "unknown_event_type";
  if (error instanceof Error && (error.name === "ZodError" || error.name === "$ZodError")) {
    return "schema_invalid";
  }
  return "ingest_failed";
};

export type CloudSessionStatus = {
  connected: boolean;
  last_push_ack: number | null;
  last_global_seq: number | null;
  quarantined: readonly { event_id: string; reason: string }[];
  /** DEC-SYNC-011: where the cursor is stuck and why; null when flowing. */
  blocked: BlockedCursor | null;
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
  /** DEC-SYNC-011: null while catch-up flows; set to where and why the cursor stopped. */
  let blockedCursor: BlockedCursor | null = null;
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

  /**
   * Store a renewal without letting a storage fault take the session down with it
   * (01-F47/01-F17). The device keeps working on the credential it already holds; the
   * cloud will offer another renewal on the next connection.
   */
  const persistRenewal = (renewed: string): void => {
    try {
      store.setDeviceToken(renewed);
    } catch {
      // Deliberately swallowed: losing a renewal costs one connection's worth of
      // credential freshness, while throwing here costs the whole session.
    }
  };

  const sendHello = (): void => {
    const st = store.status();
    transport.send({
      v: 1,
      kind: "hello",
      device_id: store.identity.device_id,
      device_class,
      branch_id: store.identity.branch_id,
      // The PERSISTED renewal if the cloud has ever issued one, else the token this
      // session was constructed with (01-F47). Reading it here rather than caching at
      // construction is what makes renewal take effect on the very next connection.
      token: store.deviceToken() ?? token,
      last_global_seq: st.last_global_seq ?? 0,
      own_high_water: st.own_high_water ?? 0,
      // Advertise that this build can DECODE compressed frames (DEC-SYNC-010). It is
      // only half the contract — the gateway must also grant it in hello_ack, and
      // absent a grant this connection stays plain JSON for its whole life. That
      // both-ends rule is what makes the rollout safe in either direction.
      accepts_compression: true,
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
    if (events.length === 0) return;
    // Persist the WHOLE page in ONE ingest-path transaction (T-01-16, 26 §6.4 — one
    // fsync, not one per event) via store.ingestPage's per-event savepoint isolation.
    // The ordered per-item results drive the SAME contiguous-prefix cursor law the
    // per-event loop had: a divergent duplicate is surfaced + PASSED, any other
    // failure stops the advance, so a re-fetch re-delivers it (01-F9/F17/F34).
    const items: PageItem[] = events.map((e) => {
      const { global_seq, ...envelope } = e;
      return global_seq === undefined ? { envelope } : { envelope, global_seq };
    });
    const results = store.ingestPage(items);
    const priorBlock = blockedCursor;
    let advanceTo = -1;
    let blocked = false;
    // Did THIS page apply the event we were previously stuck on? Only that clears the
    // block. Adversarial-review B2: `applyEvents` serves live `event_batch` as well as
    // `catchup_response`, so a clean live batch used to clear the report AND advance
    // the cursor past the blockage — one sale on another terminal, and the blocking
    // event was never requested again. That is the "never skip" rule inverted.
    let landedBlocking = false;
    // DEC-SYNC-011: the FIRST non-landed event is where the cursor stops, so it is the
    // one reported. Previously this whole classification was thrown away — the local
    // `blocked` flag correctly stopped the advance and then told nobody, which is the
    // silence this task removes.
    let report: BlockedCursor | null = null;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result === undefined) continue; // results is 1:1 with items — defensive only
      const global_seq = events[i]?.global_seq;
      let landed = true;
      if (!result.ok) {
        if (result.error instanceof DivergentDuplicateError) {
          // The other permanent failure, and deliberately NOT a blocked cursor: its id
          // is already stored, so re-fetching cannot help and the cursor PASSES it. It
          // is surfaced here instead (01-F17 — never wedge the pull).
          quarantined.push({ event_id: result.error.eventId, reason: "divergent_duplicate" });
        } else {
          landed = false; // did not land — the cursor must not pass it
          if (report === null && global_seq !== undefined) {
            // Only a SEQUENCED blocking event is recorded. An event with no global_seq
            // has nothing the cursor could be held below and nothing catch-up could
            // re-request by, so recording it would give a block that disables its own
            // clamp AND can never clear (`landedBlocking` compares against a null).
            // The cursor still does not pass it — `blocked` already stopped the
            // advance — so this is strictly the reporting decision.
            report = {
              global_seq,
              // Guaranteed present by the protocol schema (EventEnvelope.type is
              // z.string().min(1)) — a typeless event never reaches this layer.
              event_type: String((events[i] as { type?: unknown } | undefined)?.type ?? ""),
              reason: classifyBlock(result.error),
            };
          }
        }
      }
      if (!landed) blocked = true;
      if (landed && global_seq !== undefined && global_seq === priorBlock?.global_seq) {
        landedBlocking = true;
      }
      if (!landed) blocked = true;
      if (!blocked && global_seq !== undefined && global_seq > advanceTo) advanceTo = global_seq;
    }
    // Resolve the block BEFORE the cursor moves. A page that blocks re-reports where it
    // stopped; a page that does not can only clear a standing block by having actually
    // APPLIED the blocking event — not merely by being clean. A live fan-out batch at
    // seq 1000 says nothing about seq 500.
    if (report !== null) blockedCursor = report;
    else if (priorBlock !== null && landedBlocking) blockedCursor = null;
    // The cursor may never sit at or above a standing blockage — and if it ALREADY
    // does, it is REWOUND to just below it. That rewind is the fix for the fatal case:
    // `applyEvents` serves live fan-out as well as catch-up, so a sale on another
    // terminal at seq 20001 can push the cursor there while this device is still
    // catching up at 5000. Without the rewind, `blockingSeq - 1` could never exceed the
    // cursor, so it froze for the life of the process AND the block could never clear,
    // because catch-up re-issued from 20001 and never re-delivered the blocking event.
    // Rewinding is safe and cheap: re-delivered events dedupe by id (01-F8), and it is
    // also HONEST — discovering a blockage below the cursor means the cursor was
    // claiming ground the device does not actually hold.
    //
    // The cursor is deliberately NOT a contiguous prefix: with sliced sync (01-F40) a
    // scoped device's global_seq stream is legitimately sparse, so demanding contiguity
    // would freeze every waiter tablet. Highest-delivered is the right rule.
    const stopBefore = blockedCursor?.global_seq ?? null;
    const current = store.status().last_global_seq ?? 0;
    if (stopBefore !== null) {
      const ceiling = stopBefore - 1;
      if (advanceTo > ceiling) advanceTo = ceiling;
      if (current > ceiling && ceiling >= 0) store.setLastGlobalSeq(ceiling);
    }
    if (advanceTo >= 0 && advanceTo > (store.status().last_global_seq ?? 0)) {
      store.setLastGlobalSeq(advanceTo);
    }
  };

  const dispatch = (message: ProtocolMessage): void => {
    switch (message.kind) {
      case "hello_ack": {
        connected = true;
        // Silent renewal (01-F47). Persisted immediately, so an expiry that arrives
        // while the device is offline is already covered by the time it reconnects.
        // Dropping this — as the first cut did — makes expiry TERMINAL: at TTL every
        // device enters drain mode at once, and a hub in that state strands its branch.
        //
        // Guarded: a persistence failure (full or read-only disk on a POS terminal)
        // must not abort the rest of this handler. Unguarded it threw before
        // `drainPush`/`sendCatchup` ran, so the session did nothing, reconnected, and
        // presented the same expired token — an indefinite reconnect loop, each turn
        // costing the cloud a signature and a registry write. The session continues on
        // the token it already holds; failing to STORE a renewal must not also cost the
        // device the connection it just established (01-F17).
        if (message.renewed_token !== undefined) persistRenewal(message.renewed_token);
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
        // Two carriers land here, and they must NOT be confused. A renewal on an ack
        // that names ANOTHER device belongs to that relayed origin — adopting it would
        // give the hub a peer's credential. Only an ack for this device (or one with no
        // origin named) is our own renewal (01-F47).
        if (message.renewed_token !== undefined) {
          const forOrigin = message.origin_device_id;
          if (forOrigin === undefined || forOrigin === store.identity.device_id) {
            persistRenewal(message.renewed_token);
          } else {
            store.noteRelayedRenewal(forOrigin, message.renewed_token);
          }
        }
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
          // 01-F48's LAN half, as far as the hub can observe it: the cloud has told us
          // this origin is REVOKED. Suppressing relay only stopped its writes; the
          // device was still receiving the branch's events over LAN. Revocation blocks
          // READS too, so the mesh evicts it. (A revoked device that never pushes is
          // still invisible here — closing that needs registry distribution over LAN,
          // which remains the filed gap.)
          if (message.reason === "origin_revoked") store.noteRevokedPeer(held.device_id);
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
        // A property of the CURSOR, not the connection (01-F11 / 00 §5.7): it is
        // reported alongside `connected: true` on a live link, and it survives a
        // disconnect, because the blockage is still there when the link returns. The
        // two have different remedies — ship a build that understands the event vs
        // restore the network — so a UI that conflates them sends staff to the wrong fix.
        blocked: blockedCursor === null ? null : { ...blockedCursor },
      };
    },
  };
};
