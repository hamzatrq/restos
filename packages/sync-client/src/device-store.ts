// Device store + outbox core (T-01-03): the canonical durable local queue (18 §4).
// Confirmed = durably persisted before return (01-F2, 00 §5.2); lamport_seq is
// monotonic, gap-free, assigned atomically with the insert (01-F3); drain in lamport
// order, advance only to the acked watermark — a write-checkpoint, never a delete
// (01-F8, 19 §5); status feeds the honesty UI (01-F11). The events table is the
// device's ledger copy (01 §5): acked events stay readable, and no API path updates
// or deletes an event row (01-F1). Append validates through the domain registry —
// an unknown type or invalid payload persists nothing (01-F4).
import { type EventEnvelopeT, parseEnvelope, parseEvent } from "@restos/domain";
import Database from "better-sqlite3";

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

export type DeviceStore = {
  append(input: AppendInput): EventEnvelopeT;
  nextBatch(max: number): EventEnvelopeT[];
  advanceTo(watermark: number): void;
  readOwnEvents(fromLamport?: number): EventEnvelopeT[];
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

  const rowToEnvelope = (row: { envelope: string }): EventEnvelopeT =>
    parseEnvelope(JSON.parse(row.envelope));
  const ownHighWater = (): number | null => highWater.get()?.high ?? null;
  const ackedWatermark = (): number | null => readState.get()?.acked_watermark ?? null;

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
    return envelope;
  });

  return {
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
