// T-01-07 acceptance helpers/builders (plans/wave-0/kernel-tasks.md T-01-07).
//
// ── CONTRACTED MODULE SURFACE (binding on the implementation session) ────────
// services/sync-gateway/src/index.ts must export exactly this API-contract
// surface (T-01-07 "API contract"):
//
//   createGateway({ db, clock }): Gateway
//     db    — Drizzle instance over the `postgres` driver (we build it with
//             drizzle(url) from "drizzle-orm/postgres-js")
//     clock — { now(): number }; `server_received_at` comes from clock.now()
//             (18 §4: `new Date()` banned in domain logic)
//   Gateway            — { connect(sink), close(): Promise<void> }
//   GatewayConnection  — { handle(message: ProtocolMessage): Promise<void>, close(): void }
//   CATCHUP_PAGE_SIZE  — exported binding constant, 500
//   GatewayError       — error base class
//   ProtocolViolationError, AuthRejectedError — extend GatewayError
//
// Wire messages come from @restos/sync-protocol and validation from
// @restos/domain — never redeclared here or in the impl.
// ─────────────────────────────────────────────────────────────────────────────
import { type EventEnvelopeT, newId, parseEvent } from "@restos/domain";
import { type ProtocolMessage, parseMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Gateway } from "../index.js";
import { DATABASE_URL_ENV } from "./global-setup.js";

// Epoch base shared with the T-01-02 golden fixtures.
export const BASE_T = 1_752_800_000_000;

export type Db = ReturnType<typeof drizzle>;

export const testDatabaseUrl = (): string => {
  const url = process.env[DATABASE_URL_ENV];
  if (url === undefined || url === "") {
    throw new Error(
      `[T-01-07] ${DATABASE_URL_ENV} is not set — the vitest globalSetup (Testcontainers ` +
        "postgres:16-alpine) did not run or failed. Docker is an environment prerequisite; " +
        "this suite never falls back to mocks (18 §12).",
    );
  }
  return url;
};

/** A fresh Drizzle-over-postgres connection pool. Each caller owns closing it. */
export const openDb = (): Db => drizzle(testDatabaseUrl());

export const closeDb = async (db: Db): Promise<void> => {
  await db.$client.end({ timeout: 5 });
};

export const must = <T>(value: T | undefined | null, label: string): T => {
  if (value === undefined || value === null) throw new Error(`expected ${label} to be present`);
  return value;
};

const num = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`expected a finite number, got ${String(value)}`);
  return n;
};

// ── identities & dev tokens (01-F27 Wave-0 stub boundary) ────────────────────

export type Identity = { org_id: string; branch_id: string; device_id: string };

/** Per-test isolation is BY FRESH ORG (T-01-07 testing approach) — never truncate. */
export const freshIdentity = (): Identity => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

/**
 * Wave-0 dev token: unsigned base64url-JSON claims { org_id, branch_id, device_id }
 * behind the verifyDeviceToken seam (T-01-07 assumption 7). T-01-09 swaps the
 * seam internals for jose verification with the same claims contract.
 */
export const devToken = (claims: Identity): string =>
  Buffer.from(JSON.stringify(claims)).toString("base64url");

// ── message builders (all self-validated through parseMessage) ───────────────

type HelloOverrides = {
  device_id?: string;
  branch_id?: string;
  token?: string;
  last_global_seq?: number;
  own_high_water?: number;
};

export const helloMsg = (identity: Identity, overrides: HelloOverrides = {}): ProtocolMessage =>
  parseMessage({
    v: 1,
    kind: "hello",
    device_id: overrides.device_id ?? identity.device_id,
    device_class: "counter_electron",
    branch_id: overrides.branch_id ?? identity.branch_id,
    token: overrides.token ?? devToken(identity),
    last_global_seq: overrides.last_global_seq ?? 0,
    own_high_water: overrides.own_high_water ?? 0,
  });

type EnvelopeOverrides = Partial<EventEnvelopeT>;

/**
 * Registry-valid envelope (order.created, 01 §4 seed catalog). Lamport sequences
 * are 0-based: a fresh device's hello_ack.resume_from is 0 — "the next
 * lamport_seq the cloud expects" (T-01-07 session contract).
 */
export const validEnvelope = (
  identity: Identity,
  lamportSeq: number,
  overrides: EnvelopeOverrides = {},
): EventEnvelopeT => {
  const envelope: EventEnvelopeT = {
    id: newId(),
    org_id: identity.org_id,
    branch_id: identity.branch_id,
    device_id: identity.device_id,
    actor_user_id: null,
    lamport_seq: lamportSeq,
    device_created_at: BASE_T + lamportSeq,
    server_received_at: null,
    type: "order.created",
    schema_version: 1,
    payload: { order_id: newId(), channel: "counter" },
    refs: [],
    ...overrides,
  };
  parseEvent(envelope); // self-check: the suite never pushes accidentally-invalid events
  return envelope;
};

export const validEnvelopes = (
  identity: Identity,
  fromLamport: number,
  count: number,
): EventEnvelopeT[] =>
  Array.from({ length: count }, (_, i) => validEnvelope(identity, fromLamport + i));

/** Wire-valid but registry-UNKNOWN type → gateway must quarantine as schema_invalid (01-F4/01-F37). */
export const unknownTypeEnvelope = (
  identity: Identity,
  lamportSeq: number,
  overrides: EnvelopeOverrides = {},
): EventEnvelopeT => ({
  ...validEnvelope(identity, lamportSeq),
  type: "not.in.catalog",
  ...overrides,
});

/** Known type, registry-invalid payload (order.created missing required fields). */
export const invalidPayloadEnvelope = (identity: Identity, lamportSeq: number): EventEnvelopeT => ({
  ...validEnvelope(identity, lamportSeq),
  payload: {},
});

export const pushMsg = (events: EventEnvelopeT[], watermark?: number): ProtocolMessage =>
  parseMessage({
    v: 1,
    kind: "push",
    events,
    watermark: watermark ?? events.reduce((hi, e) => Math.max(hi, e.lamport_seq), 0),
  });

export const catchupMsg = (fromGlobalSeq: number): ProtocolMessage =>
  parseMessage({ v: 1, kind: "catchup_request", from_global_seq: fromGlobalSeq });

export const pingMsg = (t: number): ProtocolMessage => parseMessage({ v: 1, kind: "ping", t });

// ── sinks & sessions ─────────────────────────────────────────────────────────

export type MessageOfKind<K extends ProtocolMessage["kind"]> = Extract<
  ProtocolMessage,
  { kind: K }
>;

export const ofKind = <K extends ProtocolMessage["kind"]>(
  messages: readonly ProtocolMessage[],
  kind: K,
): MessageOfKind<K>[] => messages.filter((m): m is MessageOfKind<K> => m.kind === kind);

export type Recorder = {
  sink: (message: ProtocolMessage) => void;
  all: ProtocolMessage[];
};

export const recorder = (): Recorder => {
  const all: ProtocolMessage[] = [];
  return { all, sink: (message) => all.push(message) };
};

export type Session = {
  conn: ReturnType<Gateway["connect"]>;
  rec: Recorder;
  helloAck: MessageOfKind<"hello_ack">;
};

export const openSession = async (
  gateway: Gateway,
  identity: Identity,
  overrides: HelloOverrides = {},
): Promise<Session> => {
  const rec = recorder();
  const conn = gateway.connect(rec.sink);
  await conn.handle(helloMsg(identity, overrides));
  const helloAck = must(ofKind(rec.all, "hello_ack")[0], "hello_ack after hello");
  return { conn, rec, helloAck };
};

// ── injected clock (18 §4: server_received_at comes from clock.now()) ────────

export type TestClock = { t: number; boom: boolean; now(): number };

export const makeClock = (start: number = BASE_T): TestClock => {
  const clock: TestClock = {
    t: start,
    boom: false,
    now(): number {
      if (clock.boom) {
        throw new Error("injected clock failure (T-01-07 law 1 rollback probe)");
      }
      return clock.t;
    },
  };
  return clock;
};

// ── DB state readers (raw SQL against the BINDING Postgres data contract) ────
// Table/column names here ARE the T-01-07 data contract — kernel.events,
// kernel.device_watermarks, kernel.quarantine. bigint columns arrive as strings
// from the postgres driver and are normalized to numbers.

export type EventRow = {
  id: string;
  org_id: string;
  branch_id: string;
  device_id: string;
  lamport_seq: number;
  global_seq: number;
  server_received_at: number;
  envelope: Record<string, unknown>;
};

export const eventRows = async (db: Db, orgId: string): Promise<EventRow[]> => {
  const rows = await db.execute(
    sql`select id, org_id, branch_id, device_id, lamport_seq, global_seq, server_received_at, envelope
        from kernel.events where org_id = ${orgId} order by global_seq asc`,
  );
  return [...rows].map((row) => ({
    id: String(row.id),
    org_id: String(row.org_id),
    branch_id: String(row.branch_id),
    device_id: String(row.device_id),
    lamport_seq: num(row.lamport_seq),
    global_seq: num(row.global_seq),
    server_received_at: num(row.server_received_at),
    envelope: row.envelope as Record<string, unknown>,
  }));
};

export type QuarantineRow = {
  id: string;
  org_id: string;
  branch_id: string;
  device_id: string;
  claimed_event_id: string;
  reason: string;
  envelope: Record<string, unknown>;
  received_at: number;
};

/**
 * kernel.quarantine.envelope is `text` (verbatim JSON string — fix-round
 * amendment 3: bytes jsonb cannot hold — e.g. U+0000 in any string — must
 * still be quarantinable as storage_reject). The driver returns text as a
 * string; this normalizes to the envelope OBJECT for content assertions.
 * quarantineEnvelopeRaw() reads the raw column value for the stored-as-text
 * law itself.
 */
const parseEnvelopeColumn = (value: unknown): Record<string, unknown> =>
  typeof value === "string"
    ? (JSON.parse(value) as Record<string, unknown>)
    : (value as Record<string, unknown>);

export const quarantineRows = async (db: Db, orgId: string): Promise<QuarantineRow[]> => {
  const rows = await db.execute(
    sql`select id, org_id, branch_id, device_id, claimed_event_id, reason, envelope, received_at
        from kernel.quarantine where org_id = ${orgId} order by received_at asc, claimed_event_id asc`,
  );
  return [...rows].map((row) => ({
    id: String(row.id),
    org_id: String(row.org_id),
    branch_id: String(row.branch_id),
    device_id: String(row.device_id),
    claimed_event_id: String(row.claimed_event_id),
    reason: String(row.reason),
    envelope: parseEnvelopeColumn(row.envelope),
    received_at: num(row.received_at),
  }));
};

/** The RAW driver value of kernel.quarantine.envelope for one claimed event id. */
export const quarantineEnvelopeRaw = async (
  db: Db,
  orgId: string,
  claimedEventId: string,
): Promise<unknown> => {
  const rows = await db.execute(
    sql`select envelope from kernel.quarantine
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}`,
  );
  return must([...rows][0], `quarantine row for claimed id ${claimedEventId}`).envelope;
};

export const storedWatermark = async (
  db: Db,
  orgId: string,
  deviceId: string,
): Promise<number | undefined> => {
  const rows = await db.execute(
    sql`select acked_watermark from kernel.device_watermarks
        where org_id = ${orgId} and device_id = ${deviceId}`,
  );
  const row = [...rows][0];
  return row === undefined ? undefined : num(row.acked_watermark);
};
