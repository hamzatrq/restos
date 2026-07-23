// Device store + outbox core (T-01-03): the canonical durable local queue (18 §4).
// Confirmed = durably persisted before return (01-F2, 00 §5.2); lamport_seq is
// monotonic, gap-free, assigned atomically with the insert (01-F3); drain in lamport
// order, advance only to the acked watermark — a write-checkpoint, never a delete
// (01-F8, 19 §5); status feeds the honesty UI (01-F11). The events table is the
// device's ledger copy (01 §5): acked events stay readable, and no API path updates
// or deletes an event row (01-F1). Append validates through the domain registry —
// an unknown type or invalid payload persists nothing (01-F4).
//
// Folds (T-01-15): the merge-semantics engine (src/folds/merge.ts) — every
// projected field carries its own merge rule (rewritten 01-F34; specs/26), state
// is a pure function of the stored event SET, and `global_seq` adoption is a
// sidecar write with ZERO fold work. Fold writes commit in the same transaction
// as the ledger row, so fold state stays atomic with its ledger write and reopen
// self-heals by full replay of the surviving set (01-F6; replay order is
// irrelevant — the fold is order-free). `ingest` is the branch-stream entry
// point — peer envelopes persist to `peer_events`, dedupe by event id (01-F8);
// parking is by key-presence (01-F10 amended): only the bare order-fact types
// wait for their order key, indexed by `waiting_for`. Append never fails or
// blocks for fold reasons — a sale is never blocked (01-F17). Cloud ordering
// lands via the `global_seq_map` sidecar (`assignGlobalSeq`) so no event row is
// ever updated (01-F1); adoption changes NO fold state (01-F34).
import {
  auditEventHash,
  canonicalJson,
  type EventEnvelopeT,
  isAuditEvent,
  type ParsedEvent,
  parseEnvelope,
  parseEvent,
} from "@restos/domain";
import Database from "better-sqlite3";
import {
  createMergeEngine,
  type DropPlan,
  type FoldState,
  type FoldStats,
  type KitchenQueueRow,
  type OpenOrderRow,
  type ParkedRow,
  type ProjectedOrder,
} from "./folds/merge.js";

export class AckBeyondAppendedError extends Error {
  constructor(watermark: number, ownHighWater: number | null) {
    super(
      `ack watermark ${watermark} is beyond own high water ${String(ownHighWater)} ` +
        "(18 §4 — an impossible ack means protocol corruption; fail loud, change nothing)",
    );
    this.name = "AckBeyondAppendedError";
  }
}

/**
 * A peer/cloud event reuses a stored event id but carries DIFFERENT device-authored
 * content. Dedupe-by-id alone would accept it as a benign no-op and leave two devices
 * permanently disagreeing under one id (01-F34). The ledger row is never overwritten
 * (01-F1) — this is raised so the caller surfaces it instead of diverging silently.
 * The gateway's merge path already quarantines the same class (id_content_divergence).
 */
export class DivergentDuplicateError extends Error {
  readonly eventId: string;
  constructor(eventId: string) {
    super(
      `ingest of event ${eventId} reuses a stored id with divergent content ` +
        "(01-F34 — same id must mean same event; the stored row is untouched)",
    );
    this.name = "DivergentDuplicateError";
    this.eventId = eventId;
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

/** One catch-up-page item — the same two arguments as `ingest` (T-01-16, 26 §6.4). */
export type PageItem = { envelope: unknown; global_seq?: number };

/**
 * One ORDERED per-item outcome from `ingestPage` (T-01-16). A failure — including a
 * `DivergentDuplicateError` — is CARRIED in `error`, never thrown out of the page, so
 * the caller computes the contiguous landed prefix and passes/stops per event exactly
 * as the per-event loop did (26 §6.4 warning: batching must keep per-event granularity).
 */
export type PageResult = { ok: true; stored: boolean } | { ok: false; error: unknown };

/**
 * Ingest-path work counters (T-01-16; the T-01-14/T-01-15 foldStats precedent —
 * "one transaction per catch-up page" is not black-box assertable otherwise).
 * `commits` = ingest-path write-transactions committed (one `ingest`, one whole
 * `ingestPage`, or one `ingestBatch` each add 1). `events_ingested` = newly-persisted
 * peer event rows.
 */
export type IngestStats = { commits: number; events_ingested: number };

export type DeviceStore = {
  /** The store's org/branch/device identity — the mesh session derives hello from it (T-01-05). */
  identity: StoreIdentity;
  append(input: AppendInput): EventEnvelopeT;
  ingest(envelope: unknown, opts?: { global_seq?: number }): IngestResult;
  ingestBatch(events: readonly unknown[]): IngestBatchResult;
  /**
   * Persist + project a WHOLE catch-up page in ONE transaction (one fsync) with
   * PER-EVENT savepoint isolation, returning one result PER item IN ORDER (T-01-16,
   * 26 §6.4). A per-item failure rolls back only that item's savepoint — the good
   * prefix commits, siblings after it are still attempted, and a divergent duplicate
   * is a carried `{ ok: false }`, never a throw that wedges the page (01-F1/F9/F17).
   */
  ingestPage(items: readonly PageItem[]): readonly PageResult[];
  /** Ingest-path work counters (T-01-16) — the "one transaction per page" observable. */
  ingestStats(): IngestStats;
  readAllEvents(): EventEnvelopeT[];
  assignGlobalSeq(event_id: string, global_seq: number): void;
  nextBatch(max: number): EventEnvelopeT[];
  advanceTo(watermark: number): void;
  readOwnEvents(fromLamport?: number): EventEnvelopeT[];
  openOrders(): OpenOrderRow[];
  kitchenQueue(): KitchenQueueRow[];
  parked(): ParkedRow[];
  refold(): void;
  /** Fold work counters (T-01-15 contract; events_folded is the real quantity). */
  foldStats(): FoldStats;
  /** Retention shrink: atomic per-entity key drop with the open-bill guard
   * (matrix conventions; keys `order:<id>` / `line:<order>:<line>`). */
  retentionDrop(keys: readonly string[]): void;
  status(): SyncStatus;
  setLastGlobalSeq(n: number): void;
  // ── DEC-SYNC-009 hub-relay seam (T-01-12) ─────────────────────────────────
  // VOLATILE cross-plane signals between the mesh session (LAN) and the cloud
  // session (WAN) of ONE device, carried by the store handle because it is the
  // only object both sessions share. Never persisted: after a restart the hub
  // re-relays from zero and re-learns per-origin acks (id-dedupe + per-origin
  // acks absorb the overlap, 01-F8). Future skip signal (fix round F7,
  // accepted as designed): once held peer events carry an adopted global_seq
  // sidecar (01-F34 delivery cursor), a restarted hub can skip
  // already-cloud-merged events instead of re-relaying from zero — an
  // optimization over the same dedupe-safe baseline, not a correctness need.
  /** Mesh (acting hub) → cloud session: peer events were ingested — relay them upward. */
  requestRelayDrain(): void;
  /** Cloud session subscribes to relay-drain requests; returns unsubscribe. */
  onRelayDrainRequested(listener: () => void): () => void;
  /** Mesh (leaving hub duty — demotion or stop) → cloud session: clear any latched
   * relay request; followers never relay (DEC-SYNC-006, fix round F4). */
  cancelRelayDrain(): void;
  /** Cloud session subscribes to relay-cancel signals; returns unsubscribe. */
  onRelayDrainCancelled(listener: () => void): () => void;
  /** Cloud session records a per-ORIGIN cloud ack learned from a relay push_ack. */
  noteRelayedCloudAck(device_id: string, acked_watermark: number): void;
  /** Highest known relayed cloud ack for an origin (mesh reads it to forward over LAN). */
  relayedCloudAck(device_id: string): number | null;
  /** Cloud session records a cloud quarantine_notice whose event belongs to a
   * relayed ORIGIN (T-01-08; 01-F37 "originating device notified" — a WAN-less
   * origin's only path is the hub's LAN forward). Deduped by event id. */
  noteRelayedQuarantineNotice(
    device_id: string,
    notice: { event_id: string; reason: string },
  ): void;
  /** Recorded notices for an origin (mesh reads them to forward over LAN,
   * at-least-once — re-sent per heartbeat, duplicates legal per DEC-SYNC-008). */
  relayedQuarantineNotices(device_id: string): readonly { event_id: string; reason: string }[];
  /** This device's own audit-chain HEAD (01-F5); null before the first own audit append. */
  auditChainHead(): { hash: string; event_id: string } | null;
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
-- This device's own audit-chain HEAD (01-F5, 01 §7) — a single row mirroring the
-- sync_state pattern, maintained atomically with the audit-event insert so the store
-- can stamp the next own audit event's prev_audit_hash in O(1). Own chain only; peer
-- chains are verified by the Auditor from the merged log (T-01-11).
CREATE TABLE IF NOT EXISTS audit_chain (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  head_hash TEXT,
  head_event_id TEXT
) STRICT;
INSERT OR IGNORE INTO audit_chain (id, head_hash, head_event_id) VALUES (0, NULL, NULL);
-- Fold state tables — the T-01-15 merge-model projections (01-F6, 01-F10; the
-- openOrders row shape is oracle-pinned, contract ruling C8).
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  order_type TEXT,
  confirmed_at INTEGER,
  settled INTEGER NOT NULL,
  table_ids_json TEXT NOT NULL,
  table_conflict INTEGER NOT NULL,
  pay_total INTEGER NOT NULL,
  repaid_total INTEGER NOT NULL,
  refund_total INTEGER NOT NULL,
  pay_attempts_json TEXT NOT NULL,
  refund_attempts_json TEXT NOT NULL,
  cap_violated INTEGER NOT NULL,
  exceptions_json TEXT NOT NULL,
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

  // Own audit-chain HEAD (01-F5): read to stamp the next audit event, updated inside the
  // append transaction so the HEAD is atomic with the durable ledger row (01-F2/F3).
  const readAuditHead = db.prepare<[], { head_hash: string | null; head_event_id: string | null }>(
    "SELECT head_hash, head_event_id FROM audit_chain WHERE id = 0",
  );
  const setAuditHead = db.prepare<[string, string]>(
    "UPDATE audit_chain SET head_hash = ?, head_event_id = ? WHERE id = 0",
  );

  // T-01-04 fold surfaces: peer ingest, global_seq sidecar, fold-state rebuild.
  const allOwnEnvelopes = db.prepare<[], { envelope: string }>("SELECT envelope FROM events");
  const peerById = db.prepare<[string], { id: string }>("SELECT id FROM peer_events WHERE id = ?");
  // Stored peer envelope, for the duplicate-id content comparison (01-F34).
  const peerEnvelopeById = db.prepare<[string], { envelope: string }>(
    "SELECT envelope FROM peer_events WHERE id = ?",
  );
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
  const clearOrders = db.prepare("DELETE FROM orders");
  const clearQueue = db.prepare("DELETE FROM queue");
  const clearParked = db.prepare("DELETE FROM parked");
  const insertOrderRow = db.prepare<
    [
      string,
      string,
      string | null,
      number | null,
      number,
      string,
      number,
      number,
      number,
      number,
      string,
      string,
      number,
      string,
      string,
    ]
  >(
    "INSERT INTO orders (order_id, channel, order_type, confirmed_at, settled, table_ids_json, table_conflict, pay_total, repaid_total, refund_total, pay_attempts_json, refund_attempts_json, cap_violated, exceptions_json, json_lines) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQueueRow = db.prepare<[string, number, string, number, number, number]>(
    "INSERT INTO queue (order_id, confirm_at, channel, age_basis, lines_ready, lines_total) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertParkedRow = db.prepare<[string, string, string]>(
    "INSERT INTO parked (event_id, waiting_for, envelope_json) VALUES (?, ?, ?)",
  );
  // Targeted writes: one order's rows replaced in place; one parked row removed
  // per drained event (the waiting_for-indexed drain, 01-F10).
  const deleteOrderRow = db.prepare<[string]>("DELETE FROM orders WHERE order_id = ?");
  const deleteQueueRow = db.prepare<[string]>("DELETE FROM queue WHERE order_id = ?");
  const deleteParkedRow = db.prepare<[string]>("DELETE FROM parked WHERE event_id = ?");
  const selectOrders = db.prepare<[], OpenOrderRow>(
    "SELECT order_id, channel, order_type, confirmed_at, settled, table_ids_json, table_conflict, pay_total, repaid_total, refund_total, pay_attempts_json, refund_attempts_json, cap_violated, exceptions_json, json_lines FROM orders ORDER BY order_id",
  );
  const selectQueue = db.prepare<[], KitchenQueueRow>(
    "SELECT order_id, confirm_at, channel, age_basis, lines_ready, lines_total FROM queue ORDER BY order_id",
  );
  const selectParked = db.prepare<[], ParkedRow>(
    "SELECT event_id, waiting_for, envelope_json FROM parked ORDER BY event_id",
  );

  const rowToEnvelope = (row: { envelope: string }): EventEnvelopeT =>
    parseEnvelope(JSON.parse(row.envelope));
  /**
   * Canonical form of an envelope's DEVICE-AUTHORED content — everything except the
   * cloud-assigned `server_received_at`, which the same event legitimately carries as
   * null on-device and stamped from the cloud. Two events sharing an id must agree on
   * this (01-F34); canonicalJson omits the undefined key exactly as JSON.stringify does.
   */
  const authoredContent = (env: EventEnvelopeT): string =>
    canonicalJson({ ...env, server_received_at: undefined });
  const ownHighWater = (): number | null => highWater.get()?.high ?? null;
  const ackedWatermark = (): number | null => readState.get()?.acked_watermark ?? null;

  // Audit-chain helpers (01-F5). The HEAD is read from the table (not cached) so a second
  // handle on the same file sees the atomically-committed chain position.
  const auditHead = (): string | null => readAuditHead.get()?.head_hash ?? null;
  const payloadHasPrev = (payload: unknown): boolean =>
    typeof payload === "object" && payload !== null && "prev_audit_hash" in payload;
  // Copy the payload with prev_audit_hash set to `prev` — used to inject the store-owned
  // chain link at first append, and to reconstruct a retry from the STORED link on dedupe.
  const stampPrev = (payload: unknown, prev: string | null): Record<string, unknown> => ({
    ...(typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {}),
    prev_audit_hash: prev,
  });
  const storedPrev = (envelope: EventEnvelopeT): string | null =>
    (envelope.payload as { prev_audit_hash: string | null }).prev_audit_hash;

  // The live merge lattice (T-01-15) — kept across writes; every mutation is a
  // targeted per-key update (fold work independent of ledger size). Seeded on
  // open by full replay of the surviving set (order-free, 01-F6).
  const engine = createMergeEngine();

  const readAllParsed = (): ParsedEvent[] =>
    // Audit events are fold-inert (01-F5/01-F6): they carry no order/line/money
    // state, so they never enter the fold feed.
    [...allOwnEnvelopes.all(), ...allPeerEnvelopes.all()]
      .map(rowToEnvelope)
      .filter((envelope) => !isAuditEvent(envelope.type))
      .map((envelope) => parseEvent(envelope));

  const writeFullTables = (state: FoldState): void => {
    clearOrders.run();
    clearQueue.run();
    clearParked.run();
    for (const row of state.orders) {
      insertOrderRow.run(
        row.order_id,
        row.channel,
        row.order_type,
        row.confirmed_at,
        row.settled,
        row.table_ids_json,
        row.table_conflict,
        row.pay_total,
        row.repaid_total,
        row.refund_total,
        row.pay_attempts_json,
        row.refund_attempts_json,
        row.cap_violated,
        row.exceptions_json,
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

  // Drop-and-rebuild all fold tables (and the live lattice) from events ∪
  // peer_events — replay order irrelevant, the fold is a pure function of the
  // set. The reopen self-heal and the refold() surface (01-F6).
  const recomputeFolds = (): void => {
    engine.rebuild(readAllParsed());
    writeFullTables(engine.snapshot());
  };

  // Replace one order's rows in place (the targeted delta); the queue row exists
  // iff the confirmed fact holds; a null projection means no delivered create.
  const upsertOrder = (orderId: string, p: ProjectedOrder | null): void => {
    deleteOrderRow.run(orderId);
    deleteQueueRow.run(orderId);
    if (!p) return;
    insertOrderRow.run(
      p.order.order_id,
      p.order.channel,
      p.order.order_type,
      p.order.confirmed_at,
      p.order.settled,
      p.order.table_ids_json,
      p.order.table_conflict,
      p.order.pay_total,
      p.order.repaid_total,
      p.order.refund_total,
      p.order.pay_attempts_json,
      p.order.refund_attempts_json,
      p.order.cap_violated,
      p.order.exceptions_json,
      p.order.json_lines,
    );
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

  // F6 (fix-round) recovery flags: `foldTouched` — the current top-level call
  // reached the fold (reset by `guarded`); `eventFoldTouched` — the current
  // ingestBatch element reached it (reset per element); `batchNeedsRefold` —
  // some element's savepoint rolled back AFTER its fold, so the lattice may
  // lead the committed batch.
  let foldTouched = false;
  let eventFoldTouched = false;
  let batchNeedsRefold = false;

  // Ingest-path work counters (T-01-16; ingestStats). Incremented at the public seam
  // AFTER a transaction commits, so a per-event savepoint rollback inside ingestPage
  // /ingestBatch never inflates the page's single commit (the 26 §6.4 observable).
  let ingestCommits = 0;
  let eventsIngested = 0;

  // Fold maintenance for a newly-stored event (T-01-15): every write is targeted
  // — the touched orders' rows and the parked-row delta only. Never a replay.
  const applyFold = (parsed: ParsedEvent): void => {
    // Audit events are fold-inert (01-F5): nothing applied, nothing parked.
    if (isAuditEvent(parsed.envelope.type)) return;
    foldTouched = true; // F6: the engine may mutate past this point
    eventFoldTouched = true;
    const result = engine.apply(parsed);
    if (result.parked) {
      insertParkedRow.run(
        result.parked.event_id,
        result.parked.waiting_for,
        result.parked.envelope_json,
      );
    }
    for (const eventId of result.drained) deleteParkedRow.run(eventId);
    for (const orderId of result.dirty) upsertOrder(orderId, engine.projectOrder(orderId));
  };

  // Lamport assignment and the durable insert are one transaction (01-F3): a
  // validation failure rolls back with nothing persisted (01-F4). Re-append of a
  // stored id is idempotent for identical retries only — divergent content throws,
  // the ledger row stays untouched (01-F8, 18 §4).
  const appendTx = db.transaction((input: AppendInput): EventEnvelopeT => {
    const isAudit = isAuditEvent(input.type);
    const stored = byId.get(input.id);
    if (stored) {
      const envelope = rowToEnvelope(stored);
      // Reconstruct the retry against the STORED chain link (never the live HEAD) so an
      // identical audit retry compares equal and divergent business content still throws —
      // the 01-F8 idempotency law extended to the store-owned chain field.
      const retryInput = isAudit
        ? { ...input, payload: stampPrev(input.payload, storedPrev(envelope)) }
        : input;
      const retry = parseEvent({
        ...retryInput,
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
    // Audit events are hash-chained per device (01-F5): the chain position is store-owned
    // platform law (01 §7), never caller-supplied — a caller-provided prev_audit_hash is a
    // loud failure with nothing persisted (18 §4).
    if (isAudit && payloadHasPrev(input.payload)) {
      throw new Error(
        `append of audit event ${input.id} carrying a caller-supplied prev_audit_hash ` +
          "(01 §7 — the chain position is store-owned platform law; nothing persisted)",
      );
    }
    // Stamp the current HEAD (NULL ⇒ this device's first audit event ⇒ prev_audit_hash: null).
    const payload = isAudit ? stampPrev(input.payload, auditHead()) : input.payload;
    const next = (ownHighWater() ?? -1) + 1;
    const parsed = parseEvent({
      ...input,
      payload,
      lamport_seq: next,
      server_received_at: null,
    });
    const envelope = parsed.envelope;
    insertEvent.run(envelope.id, envelope.lamport_seq, JSON.stringify(envelope));
    // The chain HEAD advances inside this one transaction, atomic with the durable ledger
    // row (01-F2/F3); non-audit append never touches it.
    if (isAudit) setAuditHead.run(auditEventHash(envelope), envelope.id);
    // Folds apply in the same transaction; an absent order key parks the bare
    // order facts at the fold layer — append never fails or blocks for fold
    // reasons (01-F17, 01-F10). Audit events are fold-inert (applyFold skips them).
    applyFold(parsed);
    return envelope;
  });

  // Branch-stream entry point (T-01-04): validates through the domain registry —
  // nothing persists on failure (01-F4); dedupes by event id (01-F8); own events
  // enter only via append (18 §4 loud failure); folds apply in the same transaction.
  const ingestTx = db.transaction((value: unknown, opts?: { global_seq?: number }) => {
    const parsed = parseEvent(value);
    const envelope = parsed.envelope;
    if (envelope.org_id !== identity.org_id || envelope.branch_id !== identity.branch_id) {
      throw new Error(
        `ingest of event ${envelope.id} from ${envelope.org_id}/${envelope.branch_id} does not ` +
          "match the store identity (01-F9 — the branch stream is identity-scoped; nothing persisted)",
      );
    }
    const storedOwn = byId.get(envelope.id);
    const storedPeer = storedOwn ? undefined : peerEnvelopeById.get(envelope.id);
    if (storedOwn || storedPeer) {
      // Duplicate id: the content MUST match what is already stored. Dedupe-by-id
      // alone would silently accept a divergent same-id event and leave two devices
      // disagreeing forever (01-F34) — the append path already compares content, so
      // ingest must too. `server_received_at` is excluded: it is cloud-assigned, so
      // the same event legitimately reads null locally and stamped from the cloud.
      const stored = rowToEnvelope(storedOwn ?? (storedPeer as { envelope: string }));
      if (authoredContent(stored) !== authoredContent(envelope)) {
        throw new DivergentDuplicateError(envelope.id);
      }
      // Identical duplicate: no new row ever, but a CARRIED global_seq is adopted
      // exactly as assignGlobalSeq would — the LAN-first-then-cloud-catchup path
      // converges (01-F34); without opts this is a pure idempotent no-op (01-F8).
      // Adoption is a SIDECAR write only: zero fold work, zero state change
      // (rewritten 01-F34 — global_seq is a delivery cursor, never a business
      // arbiter).
      const carried = opts?.global_seq;
      if (carried !== undefined) adoptGlobalSeq(envelope.id, carried);
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
    applyFold(parsed); // the carried seq is sidecar-only — the fold never reads it (01-F34)
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
      eventFoldTouched = false;
      try {
        if (ingestTx(event).stored) counts.appended += 1;
        else counts.deduped += 1; // already held (own or peer) — idempotent no-op (01-F8)
      } catch {
        counts.rejected += 1; // skipped and counted — quarantine machinery is a later task
        // F6: this element's savepoint rolled back AFTER its fold — the lattice
        // may lead the batch; resync once the batch commits.
        if (eventFoldTouched) batchNeedsRefold = true;
      }
    }
    return counts;
  });

  // Batched catch-up seam (T-01-16; 26 §6.4 bottleneck 1 + its load-bearing warning):
  // the WHOLE page persists + projects in ONE transaction (one fsync — not one per
  // event), but each item runs through `ingestTx` as a nested savepoint, so a per-item
  // failure rolls back ONLY that savepoint and the good prefix stays committed. The
  // ordered per-item results let the caller compute the contiguous landed prefix and
  // PASS a DivergentDuplicateError rather than wedge the pull (01-F9/F17) — the exact
  // per-event granularity the pre-batch loop had, preserved (the same shape as
  // ingestBatchTx, but surfacing each item's error instead of collapsing to counts).
  const ingestPageTx = db.transaction((items: readonly PageItem[]): PageResult[] => {
    const results: PageResult[] = [];
    for (const item of items) {
      eventFoldTouched = false;
      try {
        const result = ingestTx(
          item.envelope,
          item.global_seq === undefined ? undefined : { global_seq: item.global_seq },
        );
        results.push({ ok: true, stored: result.stored });
      } catch (error) {
        results.push({ ok: false, error });
        // F6: this item's savepoint rolled back AFTER its fold — the lattice may lead
        // the committed page; resync once the page commits (mirrors ingestBatchTx).
        if (eventFoldTouched) batchNeedsRefold = true;
      }
    }
    return results;
  });

  const assignGlobalSeqTx = db.transaction((eventId: string, globalSeq: number) => {
    // Rewritten 01-F34: adoption is sidecar bookkeeping ONLY — the delivery
    // cursor is never a business arbiter, so the fold does ZERO work here.
    adoptGlobalSeq(eventId, globalSeq);
  });

  const refoldTx = db.transaction(() => {
    recomputeFolds();
  });

  // F6 (fix-round): the engine's in-JS lattice cannot roll back with the SQL
  // transaction, and the projection-row writes must FOLLOW the fold that
  // produces them — so "SQL first, engine after" is structurally impossible on
  // the append/ingest seams (retentionDrop, whose projections are computed in
  // the pure plan, DOES reorder — see below). Chosen shape here:
  // REFOLD-ON-TX-FAILURE. If a transaction dies AFTER the engine folded
  // (`foldTouched`), the lattice may lead the rolled-back ledger — rebuild it
  // from the surviving set before rethrowing, so no phantom fold state outlives
  // the failure (01-F6). Every tested validation failure throws BEFORE any fold
  // and skips the rebuild, keeping the common paths byte-identical.
  const tryRefold = (): void => {
    try {
      refoldTx();
    } catch {
      // The rebuild itself failed (persistent I/O fault): the reopen self-heal
      // (01-F6) is the backstop; the ORIGINAL transaction error surfaces.
    }
  };
  const guarded = <T>(fn: () => T): T => {
    foldTouched = false;
    try {
      return fn();
    } catch (err) {
      if (foldTouched) tryRefold();
      throw err;
    }
  };

  // Retention shrink (T-01-15; matrix conventions; fix-round F1/F2/F6/F8): an
  // outer-layer key-set operation — atomic per-entity, open-bill guarded, never
  // an inverse merge. engine.planDrop is PURE: a malformed key (F8) or an open
  // entity rejects the whole call with NOTHING changed anywhere, and the plan —
  // key-order independent by construction (F1, ruling g) — carries the
  // post-drop projections, so this transaction runs ALL the SQL first and the
  // lattice + session dropped-key memory (F2) mutate only after durable commit:
  // the F6 "SQL succeeds before engine mutation" ordering, exact at this seam.
  // The LEDGER rows are untouched, and so is durability across reopen:
  // event-row pruning (which is what makes a drop durable) is the compaction
  // task's global_seq prune watermark (01 §5; matrix §2 entry 3) — until it
  // lands, a reopen legitimately rebuilds from the full retained ledger
  // (fix-round ruling b: dropped-key memory is in-session only).
  const deleteParkedByWaiting = db.prepare<[string]>("DELETE FROM parked WHERE waiting_for = ?");
  const retentionDropTx = db.transaction((plan: DropPlan) => {
    for (const orderId of plan.removedOrders) {
      deleteOrderRow.run(orderId);
      deleteQueueRow.run(orderId);
      deleteParkedByWaiting.run(orderId);
    }
    for (const dirty of plan.dirty) upsertOrder(dirty.order_id, dirty.projection);
  });

  // Self-heal on open (01-F6): state tables ≡ refold() of the surviving ledger,
  // even after an abrupt handle abandon (20 §2.6 fold-durability seed).
  refoldTx();

  // DEC-SYNC-009 hub-relay seam (T-01-12): volatile, in-memory on the handle —
  // see the DeviceStore type doc. Listeners fire synchronously.
  const relayDrainListeners = new Set<() => void>();
  const relayCancelListeners = new Set<() => void>();
  const relayedCloudAcks = new Map<string, number>();
  // Per-origin cloud quarantine notices awaiting LAN forward (T-01-08): volatile
  // like the rest of the seam — the durable at-least-once guarantee lives in the
  // GATEWAY's kernel.quarantine_notices outbox (DEC-SYNC-008); this map only
  // carries the live LAN forward. Keyed origin → (event_id → reason).
  const relayedNotices = new Map<string, Map<string, string>>();

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
      return guarded(() => appendTx(input));
    },

    ingest(envelope, opts) {
      const result = guarded(() => ingestTx(envelope, opts));
      ingestCommits += 1; // committed (a throw rethrows above, never reaching here)
      if (result.stored) eventsIngested += 1;
      return result;
    },

    ingestBatch(events) {
      batchNeedsRefold = false;
      const counts = guarded(() => ingestBatchTx(events));
      ingestCommits += 1; // one transaction for the whole batch
      eventsIngested += counts.appended;
      // F6: a mid-batch savepoint rollback after a fold — resync the lattice
      // with the committed batch (best-effort; reopen self-heal is the backstop).
      if (batchNeedsRefold) tryRefold();
      return counts;
    },

    ingestPage(items) {
      if (items.length === 0) return []; // no work, no transaction, no commit
      batchNeedsRefold = false;
      const results = guarded(() => ingestPageTx(items));
      ingestCommits += 1; // ONE transaction for the whole page (26 §6.4)
      for (const result of results) if (result.ok && result.stored) eventsIngested += 1;
      // F6: a mid-page savepoint rollback after a fold — resync the lattice with the
      // committed page (best-effort; reopen self-heal is the backstop).
      if (batchNeedsRefold) tryRefold();
      return results;
    },

    ingestStats() {
      return { commits: ingestCommits, events_ingested: eventsIngested };
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

    foldStats() {
      return engine.stats();
    },

    retentionDrop(keys) {
      const plan = engine.planDrop(keys); // pure — a reject throws with NOTHING changed (F1/F8)
      retentionDropTx(plan); // all SQL; a failure rolls back with the engine untouched (F6)
      engine.commitDrop(plan); // infallible in-memory work, only after durable success
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

    requestRelayDrain() {
      for (const listener of [...relayDrainListeners]) listener();
    },

    onRelayDrainRequested(listener) {
      relayDrainListeners.add(listener);
      return () => {
        relayDrainListeners.delete(listener);
      };
    },

    cancelRelayDrain() {
      for (const listener of [...relayCancelListeners]) listener();
    },

    onRelayDrainCancelled(listener) {
      relayCancelListeners.add(listener);
      return () => {
        relayCancelListeners.delete(listener);
      };
    },

    noteRelayedCloudAck(device_id, acked_watermark) {
      const current = relayedCloudAcks.get(device_id);
      if (current === undefined || acked_watermark > current) {
        relayedCloudAcks.set(device_id, acked_watermark); // monotone, never regresses
      }
    },

    relayedCloudAck(device_id) {
      return relayedCloudAcks.get(device_id) ?? null;
    },

    noteRelayedQuarantineNotice(device_id, notice) {
      const held = relayedNotices.get(device_id) ?? new Map<string, string>();
      if (!held.has(notice.event_id)) held.set(notice.event_id, notice.reason); // first wins
      relayedNotices.set(device_id, held);
    },

    relayedQuarantineNotices(device_id) {
      const held = relayedNotices.get(device_id);
      if (held === undefined) return [];
      return [...held].map(([event_id, reason]) => ({ event_id, reason }));
    },

    auditChainHead() {
      const row = readAuditHead.get();
      if (!row || row.head_hash === null || row.head_event_id === null) return null;
      return { hash: row.head_hash, event_id: row.head_event_id };
    },

    close() {
      relayDrainListeners.clear();
      relayCancelListeners.clear();
      relayedCloudAcks.clear();
      relayedNotices.clear();
      db.close();
    },
  };
};
