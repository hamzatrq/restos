// Device store + outbox core (T-01-03): the canonical durable local queue (18 §4).
// Confirmed = durably persisted before return (01-F2, 00 §5.2); lamport_seq is
// monotonic, gap-free, assigned atomically with the insert (01-F3); drain in lamport
// order, advance only to the acked watermark — a write-checkpoint, never a delete
// (01-F8, 19 §5); status feeds the honesty UI (01-F11). The events table is the
// device's ledger copy (01 §5): acked events stay readable, and no API path updates
// or deletes an event row (01-F1). Append validates through the domain registry —
// an unknown type or invalid payload persists nothing (01-F4).
//
// Folds v1 (T-01-04) + incremental maintenance (T-01-04b): always-on materialized
// state tables per FOLDS.md, kept by an in-memory fold accumulator (src/folds/
// replay.ts) whose writes commit in the same transaction as the ledger row, so fold
// state stays atomic with its ledger write and reopen self-heals to refold()-
// equivalence (01-F6). The common in-order arrival fast-paths to a targeted upsert;
// any event that would reorder canonical history falls back to a full recompute —
// the law is equivalence with canonical replay, never "never recompute". `ingest`
// is the branch-stream entry point — peer
// envelopes persist to `peer_events`, dedupe by event id (01-F8), and park at the
// fold layer when a typed parent is unseen (01-F10); append never fails or blocks
// for fold reasons — a sale is never blocked (01-F17). Cloud ordering lands via the
// `global_seq_map` sidecar (`assignGlobalSeq`) so no event row is ever updated
// (01-F1) and devices converge to cloud ordering on ack (01-F34).
import { type EventEnvelopeT, parseEnvelope, parseEvent } from "@restos/domain";
import Database from "better-sqlite3";
import {
  createFoldEngine,
  type FoldInput,
  type FoldState,
  type KitchenQueueRow,
  type OpenOrderRow,
  type ParkedRow,
  type ProjectedOrder,
} from "./folds/replay.js";

export class AckBeyondAppendedError extends Error {
  constructor(watermark: number, ownHighWater: number | null) {
    super(
      `ack watermark ${watermark} is beyond own high water ${String(ownHighWater)} ` +
        "(18 §4 — an impossible ack means protocol corruption; fail loud, change nothing)",
    );
    this.name = "AckBeyondAppendedError";
  }
}

export type StoreIdentity = {
  org_id: string;
  branch_id: string;
  device_id: string;
};

/** Envelope minus the store-assigned fields — the store stamps both (plan contract). */
export type AppendInput = Omit<EventEnvelopeT, "lamport_seq" | "server_received_at">;

export type SyncStatus = {
  queue_depth: number;
  own_high_water: number | null;
  acked_watermark: number | null;
  last_global_seq: number | null;
};

export type IngestResult = { stored: boolean };

/** Per-event outcome counts for the batch seam — failures skip, never throw (01-F37 seed). */
export type IngestBatchResult = { appended: number; deduped: number; rejected: number };

export type DeviceStore = {
  /** The store's org/branch/device identity — the mesh session derives hello from it (T-01-05). */
  identity: StoreIdentity;
  append(input: AppendInput): EventEnvelopeT;
  ingest(envelope: unknown, opts?: { global_seq?: number }): IngestResult;
  ingestBatch(events: readonly unknown[]): IngestBatchResult;
  readAllEvents(): EventEnvelopeT[];
  assignGlobalSeq(event_id: string, global_seq: number): void;
  nextBatch(max: number): EventEnvelopeT[];
  advanceTo(watermark: number): void;
  readOwnEvents(fromLamport?: number): EventEnvelopeT[];
  openOrders(): OpenOrderRow[];
  kitchenQueue(): KitchenQueueRow[];
  parked(): ParkedRow[];
  refold(): void;
  status(): SyncStatus;
  setLastGlobalSeq(n: number): void;
  close(): void;
};

// Device schema v1 (01 §5). `sync_state` is the single-row write-checkpoint
// (19 §5): the outbox is derived — events past the checkpoint — so acking is a
// checkpoint move, never a row delete.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  lamport_seq INTEGER NOT NULL UNIQUE,
  envelope TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  acked_watermark INTEGER,
  last_global_seq INTEGER
) STRICT;
INSERT OR IGNORE INTO sync_state (id, acked_watermark, last_global_seq) VALUES (0, NULL, NULL);
-- Branch-stream ingest (T-01-04): peer envelopes, dedupe by id (01-F8); a
-- (device, lamport) collision under a different id is corruption (01-F3). Cloud
-- order lives ONLY in the global_seq_map sidecar — a mirror column here was cut
-- in review as write-only dead data that silently goes stale.
CREATE TABLE IF NOT EXISTS peer_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  lamport_seq INTEGER NOT NULL,
  envelope TEXT NOT NULL,
  UNIQUE (device_id, lamport_seq)
) STRICT;
-- Cloud-order sidecar keyed by event id — event rows are never updated (01-F1/01-F34).
CREATE TABLE IF NOT EXISTS global_seq_map (
  event_id TEXT PRIMARY KEY,
  global_seq INTEGER NOT NULL UNIQUE
) STRICT;
-- Fold state tables — exactly FOLDS.md (01-F6, 01-F10).
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  order_type TEXT,
  table_id TEXT,
  confirmed_at INTEGER,
  settled INTEGER NOT NULL,
  json_lines TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS queue (
  order_id TEXT PRIMARY KEY,
  confirm_at INTEGER NOT NULL,
  channel TEXT NOT NULL,
  age_basis INTEGER NOT NULL,
  lines_ready INTEGER NOT NULL,
  lines_total INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS parked (
  event_id TEXT PRIMARY KEY,
  waiting_for TEXT NOT NULL,
  envelope_json TEXT NOT NULL
) STRICT;
`;

/** Canonical JSON (sorted object keys) — structural divergence detection for re-appends (01-F8). */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, val: unknown) =>
    val !== null && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : val,
  );

export const openStore = (options: { path: string; identity: StoreIdentity }): DeviceStore => {
  const { identity } = options;
  const db = new Database(options.path);
  db.pragma("journal_mode = WAL"); // multi-handle reads + crash recovery (18 §4)
  db.pragma("synchronous = FULL"); // plug-pull law outranks throughput (00 §5.2)
  db.pragma("foreign_keys = ON"); // device DB rule (18 §4)
  db.exec(SCHEMA);

  const byId = db.prepare<[string], { envelope: string }>(
    "SELECT envelope FROM events WHERE id = ?",
  );
  const highWater = db.prepare<[], { high: number | null }>(
    "SELECT MAX(lamport_seq) AS high FROM events",
  );
  const insertEvent = db.prepare<[string, number, string]>(
    "INSERT INTO events (id, lamport_seq, envelope) VALUES (?, ?, ?)",
  );
  const unackedTail = db.prepare<[number, number], { envelope: string }>(
    "SELECT envelope FROM events WHERE lamport_seq > ? ORDER BY lamport_seq LIMIT ?",
  );
  const fromLamportOn = db.prepare<[number], { envelope: string }>(
    "SELECT envelope FROM events WHERE lamport_seq >= ? ORDER BY lamport_seq",
  );
  const unackedCount = db.prepare<[number], { depth: number }>(
    "SELECT COUNT(*) AS depth FROM events WHERE lamport_seq > ?",
  );
  const readState = db.prepare<
    [],
    { acked_watermark: number | null; last_global_seq: number | null }
  >("SELECT acked_watermark, last_global_seq FROM sync_state WHERE id = 0");
  const setAck = db.prepare<[number]>("UPDATE sync_state SET acked_watermark = ? WHERE id = 0");
  const setPull = db.prepare<[number]>("UPDATE sync_state SET last_global_seq = ? WHERE id = 0");

  // T-01-04 fold surfaces: peer ingest, global_seq sidecar, fold-state rebuild.
  const allOwnEnvelopes = db.prepare<[], { envelope: string }>("SELECT envelope FROM events");
  const peerById = db.prepare<[string], { id: string }>("SELECT id FROM peer_events WHERE id = ?");
  const peerByDeviceLamport = db.prepare<[string, number], { id: string }>(
    "SELECT id FROM peer_events WHERE device_id = ? AND lamport_seq = ?",
  );
  const insertPeer = db.prepare<[string, string, number, string]>(
    "INSERT INTO peer_events (id, device_id, lamport_seq, envelope) VALUES (?, ?, ?, ?)",
  );
  const allPeerEnvelopes = db.prepare<[], { envelope: string }>("SELECT envelope FROM peer_events");
  const gseqByEvent = db.prepare<[string], { global_seq: number }>(
    "SELECT global_seq FROM global_seq_map WHERE event_id = ?",
  );
  const gseqByValue = db.prepare<[number], { event_id: string }>(
    "SELECT event_id FROM global_seq_map WHERE global_seq = ?",
  );
  const insertGseq = db.prepare<[string, number]>(
    "INSERT INTO global_seq_map (event_id, global_seq) VALUES (?, ?)",
  );
  const allGseq = db.prepare<[], { event_id: string; global_seq: number }>(
    "SELECT event_id, global_seq FROM global_seq_map",
  );
  const clearOrders = db.prepare("DELETE FROM orders");
  const clearQueue = db.prepare("DELETE FROM queue");
  const clearParked = db.prepare("DELETE FROM parked");
  const insertOrderRow = db.prepare<
    [string, string, string | null, string | null, number | null, number, string]
  >(
    "INSERT INTO orders (order_id, channel, order_type, table_id, confirmed_at, settled, json_lines) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQueueRow = db.prepare<[string, number, string, number, number, number]>(
    "INSERT INTO queue (order_id, confirm_at, channel, age_basis, lines_ready, lines_total) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertParkedRow = db.prepare<[string, string, string]>(
    "INSERT INTO parked (event_id, waiting_for, envelope_json) VALUES (?, ?, ?)",
  );
  // Targeted deletes for the incremental fast-path upsert (T-01-04b) — one order's
  // two rows, replaced in place; the full-rebuild fallback uses the clears above.
  const deleteOrderRow = db.prepare<[string]>("DELETE FROM orders WHERE order_id = ?");
  const deleteQueueRow = db.prepare<[string]>("DELETE FROM queue WHERE order_id = ?");
  const selectOrders = db.prepare<[], OpenOrderRow>(
    "SELECT order_id, channel, order_type, table_id, confirmed_at, settled, json_lines FROM orders ORDER BY order_id",
  );
  const selectQueue = db.prepare<[], KitchenQueueRow>(
    "SELECT order_id, confirm_at, channel, age_basis, lines_ready, lines_total FROM queue ORDER BY order_id",
  );
  const selectParked = db.prepare<[], ParkedRow>(
    "SELECT event_id, waiting_for, envelope_json FROM parked ORDER BY event_id",
  );

  const rowToEnvelope = (row: { envelope: string }): EventEnvelopeT =>
    parseEnvelope(JSON.parse(row.envelope));
  const ownHighWater = (): number | null => highWater.get()?.high ?? null;
  const ackedWatermark = (): number | null => readState.get()?.acked_watermark ?? null;

  // The live fold accumulator (T-01-04b) — persists across writes so an in-order
  // append is O(1), not a full canonical replay. `refoldTx()` on open seeds it.
  const engine = createFoldEngine();

  const readAllInputs = (): FoldInput[] => {
    const gseqOf = new Map(allGseq.all().map((row) => [row.event_id, row.global_seq]));
    return [...allOwnEnvelopes.all(), ...allPeerEnvelopes.all()].map((row) => {
      const envelope = rowToEnvelope(row);
      return { envelope, global_seq: gseqOf.get(envelope.id) ?? null };
    });
  };

  const writeFullTables = (state: FoldState): void => {
    clearOrders.run();
    clearQueue.run();
    clearParked.run();
    for (const row of state.orders) {
      insertOrderRow.run(
        row.order_id,
        row.channel,
        row.order_type,
        row.table_id,
        row.confirmed_at,
        row.settled,
        row.json_lines,
      );
    }
    for (const row of state.queue) {
      insertQueueRow.run(
        row.order_id,
        row.confirm_at,
        row.channel,
        row.age_basis,
        row.lines_ready,
        row.lines_total,
      );
    }
    for (const row of state.parked) {
      insertParkedRow.run(row.event_id, row.waiting_for, row.envelope_json);
    }
  };

  // Drop-and-rebuild all fold tables (and the live accumulator) from events ∪
  // peer_events + the sidecar — the always-correct fallback (01-F6) and the reopen
  // self-heal, run inside the mutating transaction so fold state stays atomic.
  const recomputeFolds = (): void => {
    engine.rebuild(readAllInputs());
    writeFullTables(engine.snapshot());
  };

  // Replace one order's two rows in place (the fast-path delta); the queue row is
  // written only when the order has confirmed (FOLDS.md — no queue row otherwise).
  const upsertOrder = (p: ProjectedOrder): void => {
    deleteOrderRow.run(p.order.order_id);
    insertOrderRow.run(
      p.order.order_id,
      p.order.channel,
      p.order.order_type,
      p.order.table_id,
      p.order.confirmed_at,
      p.order.settled,
      p.order.json_lines,
    );
    deleteQueueRow.run(p.order.order_id);
    if (p.queue) {
      insertQueueRow.run(
        p.queue.order_id,
        p.queue.confirm_at,
        p.queue.channel,
        p.queue.age_basis,
        p.queue.lines_ready,
        p.queue.lines_total,
      );
    }
  };

  const rewriteParked = (): void => {
    clearParked.run();
    for (const row of engine.parkedRows()) {
      insertParkedRow.run(row.event_id, row.waiting_for, row.envelope_json);
    }
  };

  // Incremental fold maintenance for a newly-stored event (T-01-04b): fast-path an
  // in-order tail arrival to a targeted upsert of the touched orders + the parked
  // table; an out-of-order arrival falls back to a full recompute. Both stay
  // byte-equivalent to refold() — the T-01-04 fold properties are the oracle.
  const applyFold = (input: FoldInput): void => {
    if (engine.apply(input)) {
      for (const p of engine.takeDirty()) upsertOrder(p);
      rewriteParked();
    } else {
      recomputeFolds();
    }
  };

  // Lamport assignment and the durable insert are one transaction (01-F3): a
  // validation failure rolls back with nothing persisted (01-F4). Re-append of a
  // stored id is idempotent for identical retries only — divergent content throws,
  // the ledger row stays untouched (01-F8, 18 §4).
  const appendTx = db.transaction((input: AppendInput): EventEnvelopeT => {
    const stored = byId.get(input.id);
    if (stored) {
      const envelope = rowToEnvelope(stored);
      const retry = parseEvent({
        ...input,
        lamport_seq: envelope.lamport_seq,
        server_received_at: envelope.server_received_at,
      }).envelope;
      if (canonical(retry) !== canonical(envelope)) {
        throw new Error(
          `re-append of stored event ${input.id} with divergent content ` +
            "(01-F8 — idempotency is for identical retries only; nothing changed)",
        );
      }
      return envelope;
    }
    const next = (ownHighWater() ?? -1) + 1;
    const { envelope } = parseEvent({ ...input, lamport_seq: next, server_received_at: null });
    insertEvent.run(envelope.id, envelope.lamport_seq, JSON.stringify(envelope));
    // Folds apply in the same transaction; an unmet dependency parks at the fold
    // layer — append never fails or blocks for fold reasons (01-F17, 01-F10).
    applyFold({ envelope, global_seq: null });
    return envelope;
  });

  // Branch-stream entry point (T-01-04): validates through the domain registry —
  // nothing persists on failure (01-F4); dedupes by event id (01-F8); own events
  // enter only via append (18 §4 loud failure); folds apply in the same transaction.
  const ingestTx = db.transaction((value: unknown, opts?: { global_seq?: number }) => {
    const { envelope } = parseEvent(value);
    if (envelope.org_id !== identity.org_id || envelope.branch_id !== identity.branch_id) {
      throw new Error(
        `ingest of event ${envelope.id} from ${envelope.org_id}/${envelope.branch_id} does not ` +
          "match the store identity (01-F9 — the branch stream is identity-scoped; nothing persisted)",
      );
    }
    if (byId.get(envelope.id) || peerById.get(envelope.id)) {
      // Duplicate id: no new row ever, but a CARRIED global_seq is adopted exactly
      // as assignGlobalSeq would — the LAN-first-then-cloud-catchup path converges
      // (01-F34); without opts this is a pure idempotent no-op (01-F8).
      const carried = opts?.global_seq;
      if (carried !== undefined && adoptGlobalSeq(envelope.id, carried)) recomputeFolds();
      return { stored: false };
    }
    if (envelope.device_id === identity.device_id) {
      throw new Error(
        `ingest of unknown own event ${envelope.id} ` +
          "(18 §4 — own events enter only via append; nothing persisted)",
      );
    }
    const globalSeq = opts?.global_seq;
    if (globalSeq !== undefined && (!Number.isInteger(globalSeq) || globalSeq < 0)) {
      throw new Error(
        `ingest global_seq must be a non-negative integer, got ${globalSeq} ` +
          "(01-F3 — cloud order is corrupt; nothing persisted)",
      );
    }
    if (peerByDeviceLamport.get(envelope.device_id, envelope.lamport_seq)) {
      throw new Error(
        `ingest (device ${envelope.device_id}, lamport ${envelope.lamport_seq}) collides with a ` +
          "different stored event (01-F3 — per-device lamport is gap-free monotonic; a collision " +
          "is corruption; nothing persisted)",
      );
    }
    insertPeer.run(envelope.id, envelope.device_id, envelope.lamport_seq, JSON.stringify(envelope));
    if (globalSeq !== undefined) insertGseq.run(envelope.id, globalSeq); // UNIQUE clash throws, rolls back
    applyFold({ envelope, global_seq: globalSeq ?? null });
    return { stored: true };
  });

  // Cloud-order adoption core for an already-stored event (01-F34): sidecar insert
  // only — no event row is ever updated (01-F1). Idempotent on the same value
  // (returns false, nothing changed); a divergent value, unknown event id, or a
  // seq already held by another event is protocol corruption and throws loud
  // (18 §4). Shared by assignGlobalSeq and duplicate-id ingest carrying a seq, so
  // both paths adopt identically.
  const adoptGlobalSeq = (eventId: string, globalSeq: number): boolean => {
    if (!Number.isInteger(globalSeq) || globalSeq < 0) {
      throw new Error(
        `global_seq must be a non-negative integer, got ${globalSeq} ` +
          "(01-F3 — cloud order is corrupt; nothing changed)",
      );
    }
    if (!byId.get(eventId) && !peerById.get(eventId)) {
      throw new Error(
        `assignGlobalSeq for unknown event ${eventId} ` +
          "(18 §4 — an ack for an unseen event means protocol corruption; nothing changed)",
      );
    }
    const current = gseqByEvent.get(eventId);
    if (current) {
      if (current.global_seq === globalSeq) return false; // idempotent re-ack (01-F8)
      throw new Error(
        `event ${eventId} already holds global_seq ${current.global_seq}, got ${globalSeq} ` +
          "(01-F3 — cloud order is immutable; nothing changed)",
      );
    }
    const holder = gseqByValue.get(globalSeq);
    if (holder) {
      throw new Error(
        `global_seq ${globalSeq} is already held by event ${holder.event_id} ` +
          "(01-F3 — the global org sequence is unique; nothing changed)",
      );
    }
    insertGseq.run(eventId, globalSeq);
    return true;
  };

  // Batch seam over the per-envelope ingest (T-01-05; planner reconciliation note):
  // same validation + persistence + fold application, but per-event failures roll
  // back to their savepoint and are counted, never thrown (01-F37 seed) — the valid
  // remainder still lands, and the whole batch is durable before return (01-F2).
  const ingestBatchTx = db.transaction((events: readonly unknown[]): IngestBatchResult => {
    const counts: IngestBatchResult = { appended: 0, deduped: 0, rejected: 0 };
    for (const event of events) {
      try {
        if (ingestTx(event).stored) counts.appended += 1;
        else counts.deduped += 1; // already held (own or peer) — idempotent no-op (01-F8)
      } catch {
        counts.rejected += 1; // skipped and counted — quarantine machinery is a later task
      }
    }
    return counts;
  });

  const assignGlobalSeqTx = db.transaction((eventId: string, globalSeq: number) => {
    // devices converge to cloud ordering on ack (01-F34)
    if (adoptGlobalSeq(eventId, globalSeq)) recomputeFolds();
  });

  const refoldTx = db.transaction(() => {
    recomputeFolds();
  });

  // Self-heal on open (01-F6): state tables ≡ refold() of the surviving ledger,
  // even after an abrupt handle abandon (20 §2.6 fold-durability seed).
  refoldTx();

  return {
    identity: { ...identity },

    append(input) {
      if (
        input.org_id !== identity.org_id ||
        input.branch_id !== identity.branch_id ||
        input.device_id !== identity.device_id
      ) {
        throw new Error(
          `event identity ${input.org_id}/${input.branch_id}/${input.device_id} does not match ` +
            "the store identity (01-F2 — one device, one store; nothing persisted)",
        );
      }
      return appendTx(input);
    },

    ingest(envelope, opts) {
      return ingestTx(envelope, opts);
    },

    ingestBatch(events) {
      return ingestBatchTx(events);
    },

    readAllEvents() {
      // Own ∪ ingested (01-F14 half), envelope order by (device_id, lamport_seq) —
      // per-origin lamport order is preserved by construction at every reader.
      return [...allOwnEnvelopes.all(), ...allPeerEnvelopes.all()]
        .map(rowToEnvelope)
        .sort((a, b) => {
          if (a.device_id !== b.device_id) return a.device_id < b.device_id ? -1 : 1;
          return a.lamport_seq - b.lamport_seq;
        });
    },

    assignGlobalSeq(eventId, globalSeq) {
      assignGlobalSeqTx(eventId, globalSeq);
    },

    openOrders() {
      return selectOrders.all();
    },

    kitchenQueue() {
      return selectQueue.all();
    },

    parked() {
      return selectParked.all();
    },

    refold() {
      refoldTx();
    },

    nextBatch(max) {
      return unackedTail.all(ackedWatermark() ?? -1, max).map(rowToEnvelope);
    },

    advanceTo(watermark) {
      // NaN/negative/fractional are outside the watermark domain: NaN slips past both
      // ordering guards and would bind as SQL NULL, silently regressing the checkpoint.
      if (!Number.isInteger(watermark) || watermark < 0) {
        throw new Error(
          `ack watermark must be a non-negative integer, got ${watermark} ` +
            "(19 §5 — the checkpoint only moves forward; nothing changed)",
        );
      }
      const high = ownHighWater();
      if (high === null || watermark > high) throw new AckBeyondAppendedError(watermark, high);
      const current = ackedWatermark();
      if (current !== null && watermark <= current) return; // checkpoint never regresses (19 §5)
      setAck.run(watermark);
    },

    readOwnEvents(fromLamport = 0) {
      return fromLamportOn.all(fromLamport).map(rowToEnvelope);
    },

    status() {
      const state = readState.get() ?? { acked_watermark: null, last_global_seq: null };
      return {
        queue_depth: unackedCount.get(state.acked_watermark ?? -1)?.depth ?? 0,
        own_high_water: ownHighWater(),
        acked_watermark: state.acked_watermark,
        last_global_seq: state.last_global_seq,
      };
    },

    setLastGlobalSeq(n) {
      setPull.run(n);
    },

    close() {
      db.close();
    },
  };
};
