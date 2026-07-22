// T-01-07 gateway core (plans/wave-0/kernel-tasks.md T-01-07; owning spec 01 §3):
// cloud merge with per-org global_seq (01-F3), idempotent push ingest + per-ORIGIN
// high-water ack (01-F8), persist-before-ack (01-F2 cloud side), branch-stream
// fan-out + catchup paging (01-F9/01-F34), quarantine storage (01-F37; registry
// parse at the merge boundary, 01-F4). Per-device sessions remain the default;
// additionally a session whose token carries the hub-relay capability may push
// same-org/branch peers' events verbatim — attested, never re-authored — with
// lamport contiguity tracked per ORIGIN device (DEC-SYNC-009, T-01-12; supersedes
// DEC-SYNC-004's blanket no-proxy rule). Transport-free: the socket adapter
// (server.ts) owns the wire codec; every outbound message is a decoded
// ProtocolMessage through the sink.
import { type EventEnvelopeT, newId, parseEvent } from "@restos/domain";
import { type ProtocolMessage, parseMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { verifyDeviceToken } from "./auth.js";
import { AuthRejectedError, ProtocolViolationError, type QuarantineReason } from "./errors.js";

/** Exported binding constant (T-01-07 catchup contract). */
export const CATCHUP_PAGE_SIZE = 500;

export type Clock = { now(): number };
export type GatewayDb = PostgresJsDatabase<Record<string, unknown>>;
export type GatewayConnection = {
  handle(message: ProtocolMessage): Promise<void>;
  close(): void;
};
export type Gateway = {
  connect(sink: (message: ProtocolMessage) => void): GatewayConnection;
  close(): Promise<void>;
};

type Sink = (message: ProtocolMessage) => void;
type SessionState = {
  sessionId: string;
  orgId: string;
  branchId: string;
  deviceId: string;
  /** Hub-relay capability from the verified token claims (DEC-SYNC-009, T-01-12). */
  hubRelay: boolean;
};
type ConnectionRecord = { sink: Sink; session: SessionState | null; open: boolean };
type WireEvent = Extract<ProtocolMessage, { kind: "event_batch" }>["events"][number];
type HelloMessage = Extract<ProtocolMessage, { kind: "hello" }>;
type PushMessage = Extract<ProtocolMessage, { kind: "push" }>;
type CatchupRequest = Extract<ProtocolMessage, { kind: "catchup_request" }>;

/** 01-F40 named seam: identity at v1 — slice predicates are Wave 1. */
const sliceFilter = (_session: SessionState, batch: readonly WireEvent[]): readonly WireEvent[] =>
  batch;

const toNumber = (value: unknown): number => Number(value);

/** Canonical JSON (sorted keys) so jsonb round-trips compare content-equal. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/** Content identity for dedupe (01-F8): ignore the two cloud-stamped values. */
const sameContent = (stored: unknown, incoming: EventEnvelopeT): boolean => {
  const strip = (envelope: Record<string, unknown>): Record<string, unknown> => {
    const { server_received_at: _srv, global_seq: _gseq, ...rest } = envelope;
    return rest;
  };
  return (
    canonical(strip(stored as Record<string, unknown>)) ===
    canonical(strip(incoming as unknown as Record<string, unknown>))
  );
};

const registryValid = (envelope: EventEnvelopeT): boolean => {
  try {
    parseEvent(envelope);
    return true;
  } catch {
    return false;
  }
};

type MergedEvent = { envelope: EventEnvelopeT; globalSeq: number; serverReceivedAt: number };
/** deviceId = the quarantine row's attribution (fix round F2): identity-mismatch
 * rows carry the SESSION device — the only authenticated identity; content-class
 * rows of identity-valid envelopes carry the ORIGIN (DEC-SYNC-005). */
type QuarantinedEvent = { envelope: EventEnvelopeT; reason: QuarantineReason; deviceId: string };

export const createGateway = ({ db, clock }: { db: GatewayDb; clock: Clock }): Gateway => {
  const branchSets = new Map<string, Set<ConnectionRecord>>();
  const branchKey = (orgId: string, branchId: string): string => JSON.stringify([orgId, branchId]);

  const joinFanout = (record: ConnectionRecord, session: SessionState): void => {
    const key = branchKey(session.orgId, session.branchId);
    const set = branchSets.get(key) ?? new Set();
    set.add(record);
    branchSets.set(key, set);
  };

  const leaveFanout = (record: ConnectionRecord): void => {
    if (record.session === null) return;
    branchSets.get(branchKey(record.session.orgId, record.session.branchId))?.delete(record);
  };

  const handleHello = async (record: ConnectionRecord, message: HelloMessage): Promise<void> => {
    if (record.session !== null) {
      throw new ProtocolViolationError("second hello on an open session");
    }
    const claims = verifyDeviceToken(message.token);
    if (claims === null) {
      throw new AuthRejectedError("token is not the Wave-0 dev-token shape (01-F27 stub boundary)");
    }
    if (claims.device_id !== message.device_id || claims.branch_id !== message.branch_id) {
      throw new AuthRejectedError("token claims do not match hello identity (01-F27)");
    }
    const rows = await db.execute(
      sql`select acked_watermark from kernel.device_watermarks
          where org_id = ${claims.org_id} and device_id = ${claims.device_id}`,
    );
    const watermarkRow = [...rows][0];
    const resumeFrom = watermarkRow === undefined ? 0 : toNumber(watermarkRow.acked_watermark) + 1;
    const session: SessionState = {
      sessionId: newId(),
      orgId: claims.org_id,
      branchId: claims.branch_id,
      deviceId: claims.device_id,
      hubRelay: claims.hub_relay,
    };
    record.session = session;
    joinFanout(record, session); // the session joins the fan-out set on hello_ack
    record.sink(
      parseMessage({
        v: 1,
        kind: "hello_ack",
        session_id: session.sessionId,
        hub: false,
        resume_from: resumeFrom,
        // Advertised ONLY when the capability is present (DEC-SYNC-009): the
        // client-side gate for relaying — absence keeps plain sessions (and the
        // committed XP transcript) byte-identical to the pre-relay contract.
        ...(claims.hub_relay ? { relay_authorized: true } : {}),
      }),
    );
  };

  /** Per-origin contiguity state within one push transaction (DEC-SYNC-009). */
  type StreamState = { storedThrough: number; through: number; extraFilled: Set<number> };

  const handlePush = async (
    record: ConnectionRecord,
    session: SessionState,
    message: PushMessage,
  ): Promise<void> => {
    // One transaction for the whole batch (01-F3 step 5): counter lock, event
    // inserts, quarantine inserts, and the watermark updates commit atomically.
    const outcome = await db.transaction(async (tx) => {
      // Per-org counter row, created on first contact, locked FOR UPDATE and
      // held to commit — merges serialize per org (assumption 2; law 4).
      await tx.execute(
        sql`insert into kernel.org_sequences (org_id, next_global_seq)
            values (${session.orgId}, 1) on conflict (org_id) do nothing`,
      );
      const counterRows = await tx.execute(
        sql`select next_global_seq from kernel.org_sequences
            where org_id = ${session.orgId} for update`,
      );
      let nextSeq = toNumber([...counterRows][0]?.next_global_seq);

      // Contiguity is tracked per ORIGIN device, not per session (DEC-SYNC-009):
      // slots 0..through are persisted (merged OR quarantined — assumption 3);
      // extraFilled holds out-of-order fills from this batch. Streams load
      // lazily; a plain own-events push materializes exactly one — the same
      // behavior as the per-session tracking this replaces.
      const streams = new Map<string, StreamState>();
      const streamOf = async (deviceId: string): Promise<StreamState> => {
        const existing = streams.get(deviceId);
        if (existing !== undefined) return existing;
        const watermarkRows = await tx.execute(
          sql`select acked_watermark from kernel.device_watermarks
              where org_id = ${session.orgId} and device_id = ${deviceId}`,
        );
        const watermarkRow = [...watermarkRows][0];
        const storedThrough =
          watermarkRow === undefined ? -1 : toNumber(watermarkRow.acked_watermark);
        const state: StreamState = {
          storedThrough,
          through: storedThrough,
          extraFilled: new Set(),
        };
        streams.set(deviceId, state);
        return state;
      };
      // The session's own stream always materializes (pre-relay behavior kept:
      // a push with nothing identity-valid still acks the session's own high).
      const ownStream = await streamOf(session.deviceId);

      const fill = (stream: StreamState, slot: number): void => {
        if (slot <= stream.through) return;
        stream.extraFilled.add(slot);
        while (stream.extraFilled.delete(stream.through + 1)) stream.through += 1;
      };

      // Dedupe view (01-F8): stored envelopes for every incoming id. Maintained
      // ACROSS the batch — every merge adds its envelope, so a repeated id
      // within one push dedupes instead of crashing on a duplicate PK
      // (fix-round amendment 1).
      const incomingIds = message.events.map((e) => e.id);
      const storedById = new Map<string, unknown>();
      if (incomingIds.length > 0) {
        const storedRows = await tx.execute(
          sql`select id, envelope from kernel.events where id in ${incomingIds}`,
        );
        for (const row of storedRows) storedById.set(String(row.id), row.envelope);
      }

      const merged: MergedEvent[] = [];
      const quarantined: QuarantinedEvent[] = [];
      // EVERY quarantine class of an identity-VALID envelope fills its ORIGIN's
      // lamport slot — the slot is durably held by the quarantine row, so the
      // watermark advances over it and the origin's outbox never wedges
      // (fix-round amendment 2, DEC-SYNC-005). Identity-MISMATCH envelopes
      // split by session kind (fix round F1): a PLAIN session keeps the law-6
      // fill of its OWN stream (pusher==author — the mismatch slot IS its own
      // outbox slot, which must not wedge on its own garbage); a RELAY-capable
      // session fills NO stream (stream = null) — a relayed mismatch's
      // lamport_seq belongs to the claimed ORIGIN's numbering, and filling the
      // hub's own slot at that number would displace the hub's genuine future
      // event there (watermark advance → lamport_conflict → durable merged-log
      // loss). Nothing wedges by not filling: the garbage was never in the
      // hub's outbox. The row is stored verbatim either way (01-F37).
      const quarantine = (
        stream: StreamState | null,
        envelope: EventEnvelopeT,
        reason: QuarantineReason,
        deviceId: string,
      ): void => {
        quarantined.push({ envelope, reason, deviceId });
        if (stream !== null) fill(stream, envelope.lamport_seq);
      };

      // The push's origin: ONE origin per relay push message (T-01-12 ruling) —
      // the first identity-valid envelope names it and the scalar push_ack
      // answers it. Falls back to the session's own stream when nothing is
      // identity-valid (pre-relay behavior).
      let origin: string | null = null;

      for (const envelope of message.events) {
        // 1. Identity checks (authz class). The capability never crosses branch
        // or org; without it, pushing another device's events keeps the
        // superseded-rule rejection (device_mismatch — a hub must not be
        // forgeable by any session; DEC-SYNC-009 / T-01-09 seam).
        const identityReason: QuarantineReason | null =
          envelope.org_id !== session.orgId
            ? "org_mismatch"
            : envelope.branch_id !== session.branchId
              ? "branch_mismatch"
              : envelope.device_id !== session.deviceId && !session.hubRelay
                ? "device_mismatch"
                : null;
        if (identityReason !== null) {
          // F2 (ruled): the row attributes to session.deviceId — the claimed
          // origin ids are unauthenticated garbage a forger controls.
          quarantine(
            session.hubRelay ? null : ownStream,
            envelope,
            identityReason,
            session.deviceId,
          );
          continue;
        }
        const stream = await streamOf(envelope.device_id);
        if (origin === null) origin = envelope.device_id;
        // 2. Registry parse (01-F4): unknown type or invalid payload → quarantine.
        if (!registryValid(envelope)) {
          quarantine(stream, envelope, "schema_invalid", envelope.device_id);
          continue;
        }
        // 3. Dedupe (01-F8): known id + identical content → skip (counts toward
        // the watermark); divergent content → quarantine, never overwrite (01-F1
        // — the relay capability licenses relay, never re-authoring).
        const stored = storedById.get(envelope.id);
        if (stored !== undefined) {
          if (sameContent(stored, envelope)) {
            fill(stream, envelope.lamport_seq);
            continue;
          }
          quarantine(stream, envelope, "id_content_divergence", envelope.device_id);
          continue;
        }
        // 4. Contiguity (per origin): a new id at an already-persisted slot is a
        // conflict; past the first gap nothing is stored (stop-at-gap,
        // assumption 4).
        if (envelope.lamport_seq <= stream.through) {
          quarantine(stream, envelope, "lamport_conflict", envelope.device_id);
          continue;
        }
        if (envelope.lamport_seq !== stream.through + 1) break;
        // 5. Merge (01-F3): cloud stamps assigned in array order under the org
        // lock. clock.now() runs OUTSIDE the savepoint scope: an infra failure
        // there aborts the whole merge (law 1 rollback — a crashed merge is not
        // a poisoned event), while a storage failure of THIS insert quarantines
        // this event only (fix-round amendment 3 — per-event savepoint; the
        // nested drizzle transaction is a postgres-js savepoint scope, the only
        // error-isolation form the driver honors inside a transaction).
        const serverReceivedAt = clock.now();
        try {
          await tx.transaction(async (sp) => {
            await sp.execute(
              sql`insert into kernel.events
                    (id, org_id, branch_id, device_id, lamport_seq, global_seq, server_received_at, envelope)
                  values (${envelope.id}, ${session.orgId}, ${session.branchId}, ${envelope.device_id},
                    ${envelope.lamport_seq}, ${nextSeq}, ${serverReceivedAt},
                    ${JSON.stringify(envelope)}::jsonb)`,
            );
          });
        } catch {
          // Bytes Postgres cannot faithfully hold (e.g. U+0000 in any string —
          // passes Zod, aborts the jsonb insert): the savepoint rolled back, so
          // siblings are isolated; quarantine verbatim, consume no global_seq.
          quarantine(stream, envelope, "storage_reject", envelope.device_id);
          continue;
        }
        merged.push({ envelope, globalSeq: nextSeq, serverReceivedAt });
        storedById.set(envelope.id, envelope); // in-batch dedupe view (amendment 1)
        nextSeq += 1;
        fill(stream, envelope.lamport_seq);
      }

      for (const q of quarantined) {
        // First stored wins (01-F37): re-quarantine is an idempotent no-op.
        // envelope column is TEXT — the verbatim JSON string (amendment 3).
        // device_id attribution follows the stream semantics (fix round F2):
        // identity-mismatch rows carry the SESSION device — the only
        // authenticated identity; content-class rows of identity-valid
        // envelopes carry the ORIGIN (DEC-SYNC-005 — slot-filling and the
        // T-01-11 Auditor gap check are per-origin).
        await tx.execute(
          sql`insert into kernel.quarantine
                (id, org_id, branch_id, device_id, claimed_event_id, reason, envelope, received_at)
              values (${newId()}, ${session.orgId}, ${session.branchId}, ${q.deviceId},
                ${q.envelope.id}, ${q.reason}, ${JSON.stringify(q.envelope)}, ${clock.now()})
              on conflict (org_id, claimed_event_id) do nothing`,
        );
      }
      if (merged.length > 0) {
        await tx.execute(
          sql`update kernel.org_sequences set next_global_seq = ${nextSeq}
              where org_id = ${session.orgId}`,
        );
      }
      // Watermark upserts are keyed by the ORIGIN device (DEC-SYNC-009): the
      // origin's own future hello resumes past the relayed prefix; the hub
      // session's own row moves only when its own events moved it.
      for (const [deviceId, stream] of streams) {
        if (stream.through <= stream.storedThrough) continue;
        await tx.execute(
          sql`insert into kernel.device_watermarks (org_id, device_id, acked_watermark)
              values (${session.orgId}, ${deviceId}, ${stream.through})
              on conflict (org_id, device_id) do update
                set acked_watermark = excluded.acked_watermark`,
        );
      }
      const ackDevice = origin ?? session.deviceId;
      const ackStream = streams.get(ackDevice) ?? ownStream;
      return {
        acked: ackStream.through,
        ackOrigin: ackDevice === session.deviceId ? null : ackDevice,
        // Fix round F1 / ratified interpretation 2: a relay-capable push with
        // NOTHING identity-valid names no origin and filled no stream — it is
        // answered with NO push_ack (for a fresh hub an ack of 0 would claim
        // slot 0 held; for an established hub an ack would answer a question
        // about slots the push never asked about).
        mismatchOnlyRelay: session.hubRelay && origin === null && message.events.length > 0,
        merged,
        quarantined,
      };
    });

    // Commit precedes everything below (01-F2 cloud side — law 3). No push_ack
    // when nothing is contiguously persisted for the push's origin (through <
    // 0): an ack of 0 would claim slot 0 is held (fix-round amendment 4;
    // mirrors the LAN hub's acked ≥ 0 guard) — nor for a mismatch-only relay
    // push (fix round F1). A relay push is answered with THAT origin's
    // contiguous high, named by origin_device_id (per-origin ack —
    // DEC-SYNC-009; one origin per relay push message).
    if (outcome.acked >= 0 && !outcome.mismatchOnlyRelay) {
      record.sink(
        parseMessage({
          v: 1,
          kind: "push_ack",
          acked_watermark: outcome.acked,
          ...(outcome.ackOrigin === null ? {} : { origin_device_id: outcome.ackOrigin }),
        }),
      );
    }
    for (const q of outcome.quarantined) {
      record.sink(
        parseMessage({
          v: 1,
          kind: "quarantine_notice",
          event_id: q.envelope.id,
          reason: q.reason,
        }),
      );
    }
    // Post-commit fan-out (01-F9/01-F34): one event_batch per push to every
    // (org, branch) session INCLUDING the origin (assumption 5), with the two
    // cloud stamps merged into the envelope at serve time (assumption 12).
    if (outcome.merged.length > 0) {
      const wireEvents: WireEvent[] = outcome.merged.map((m) => ({
        ...m.envelope,
        server_received_at: m.serverReceivedAt,
        global_seq: m.globalSeq,
      }));
      const set = branchSets.get(branchKey(session.orgId, session.branchId));
      if (set !== undefined) {
        for (const peer of [...set]) {
          if (!peer.open || peer.session === null) continue;
          peer.sink(
            parseMessage({
              v: 1,
              kind: "event_batch",
              events: [...sliceFilter(peer.session, wireEvents)],
            }),
          );
        }
      }
    }
  };

  const handleCatchup = async (
    record: ConnectionRecord,
    session: SessionState,
    message: CatchupRequest,
  ): Promise<void> => {
    // Branch stream, exclusive cursor (assumption 6), ascending, page-capped.
    // Fetch one extra row to compute `complete` without a second query.
    const rows = await db.execute(
      sql`select global_seq, server_received_at, envelope from kernel.events
          where org_id = ${session.orgId} and branch_id = ${session.branchId}
            and global_seq > ${message.from_global_seq}
          order by global_seq asc limit ${CATCHUP_PAGE_SIZE + 1}`,
    );
    const fetched = [...rows];
    const page = fetched.slice(0, CATCHUP_PAGE_SIZE);
    const events = page.map((row) => ({
      ...(row.envelope as Record<string, unknown>),
      server_received_at: toNumber(row.server_received_at),
      global_seq: toNumber(row.global_seq),
    }));
    const last = page[page.length - 1];
    record.sink(
      parseMessage({
        v: 1,
        kind: "catchup_response",
        events,
        complete: fetched.length <= CATCHUP_PAGE_SIZE,
        next_from: last === undefined ? message.from_global_seq : toNumber(last.global_seq),
      }),
    );
  };

  const dispatch = async (record: ConnectionRecord, message: ProtocolMessage): Promise<void> => {
    if (message.kind === "hello") return handleHello(record, message);
    const session = record.session;
    if (session === null) {
      throw new ProtocolViolationError(
        `first message on a connection must be hello, got ${message.kind}`,
      );
    }
    switch (message.kind) {
      case "push":
        return handlePush(record, session, message);
      case "catchup_request":
        return handleCatchup(record, session, message);
      case "ping":
        record.sink(parseMessage({ v: 1, kind: "pong", t: message.t }));
        return;
      default:
        // hello_ack | push_ack | event_batch | catchup_response |
        // quarantine_notice | purge_command — server→device kinds never inbound.
        throw new ProtocolViolationError(
          `server→device kind ${message.kind} arriving inbound violates the session law`,
        );
    }
  };

  return {
    connect(sink) {
      const record: ConnectionRecord = { sink, session: null, open: true };
      // handle() serializes per connection (fix-round amendment 5): a frame
      // never begins processing before the previous frame settles — kills the
      // double-hello TOCTOU that could register one connection in two orgs'
      // fan-out sets (00 §5.4). A rejected frame never poisons the chain.
      let queueTail: Promise<void> = Promise.resolve();
      return {
        handle: (message) => {
          const settled = queueTail.then(() => dispatch(record, message));
          queueTail = settled.then(
            () => undefined,
            () => undefined,
          );
          return settled;
        },
        close: () => {
          if (!record.open) return;
          record.open = false;
          leaveFanout(record);
        },
      };
    },
    close() {
      branchSets.clear();
      return Promise.resolve();
    },
  };
};
