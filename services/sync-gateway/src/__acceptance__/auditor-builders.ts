// T-01-11 oracle builders — the Auditor v1 acceptance surface (DEC-TEST-003,
// accepted; 20 §4.2). Authored from specs 01 (01-F3/F5/F7/F8/F29/F30/F31/F32/
// F34/F35/F37 as amended July 2026), 20 §4.2, 26 §8, DEC-SYNC-005/007/009,
// DEC-TEST-003, the t-01-08/t-01-09/t-01-12/t-01-15 fix-round rulings and the
// LANDED gateway/domain/sync-client surfaces ONLY — never from an Auditor
// implementation (24 §3 step 2; none exists at authoring time).
//
// plans/wave-0/kernel-tasks.md has NO T-01-11 entry — this surface is DERIVED
// (T-01-09 precedent: the oracle derives, the header pins, the report carries
// the derivation + ratification items).
//
// RED-AWAITING-IMPLEMENTATION: @restos/sync-gateway exports no runAuditor
// (structural-cast idiom below keeps typecheck green; calls fail
// "not a function").
//
// ── ORACLE-PINNED AUDITOR SURFACE (binding for the implementing session) ─────
//   runAuditor({ db, org_id, read_model? }): Promise<AuditorReport>
//     A READ-ONLY cloud batch job over the kernel tables for ONE org (20 §4.2
//     "nightly cloud job per org"). It writes NOTHING — no kernel table, no
//     sequence, no bookkeeping row (pinned in auditor-report-contract).
//     db        — the same Drizzle-over-postgres instance createGateway takes.
//     org_id    — the audited org. Branches are discovered from the data.
//     read_model — optional diff-leg input (01-F7 Wave-0 shape: no cloud
//       per-module read model exists yet — wave-0-scope.yml pins T-01-11 as
//       "Auditor demonstrates rebuildable projections"; the leg therefore takes
//       a projection SNAPSHOT and diffs it against the Auditor's own
//       independent refold of the merged set):
//       { branch_id, orders: OpenOrderRow[], queue: KitchenQueueRow[] } —
//       row shapes are the C8-pinned @restos/sync-client projections.
//   AuditorReport = { ok: boolean; findings: AuditorFinding[] }
//     ok === (findings.length === 0), always.
//   AuditorFinding = {
//     check: "lamport_gap" | "conservation" | "state_legality"
//          | "readmodel_diff" | "audit_chain";
//     org_id: string;               // always the audited org
//     device_id: string | null;     // lamport_gap / audit_chain name a device
//     order_id: string | null;      // conservation / state_legality / readmodel_diff
//     event_id: string | null;      // the offending envelope id when one names it
//     lamport_seq: number | null;   // the gap slot / offending event's slot
//     detail: string;               // human-readable; tests pin presence only
//   }
//   Finding ordering is UNPINNED — suites assert by filter, never by index.
//
// ── The four ratified checks (DEC-TEST-003) + the chain leg ──────────────────
//   lamport_gap (01-F3/01-F8/01-F37, DEC-SYNC-005): per (org, device), with
//     W = kernel.device_watermarks.acked_watermark (-1 when absent) and
//     hi = max(W, max merged lamport_seq for the device), every slot in
//     [0..hi] must be covered by a kernel.events row OR a kernel.quarantine
//     row ATTRIBUTED to that device (row.device_id — the t-01-12 fix-round F2
//     attribution law) whose stored envelope's lamport_seq is that slot.
//     Quarantine rows COVER slots (DEC-SYNC-005 "counts quarantine rows as
//     slot-filling"); they never EXTEND the obligation (no-fill classes —
//     relay identity-mismatch, origin_unregistered, origin_revoked — sit
//     beyond W by construction and must not manufacture gaps).
//   conservation (01-F30/01-F29/01-F31/01-F32, DEC-SYNC-007): per order over
//     the merged log — (a) the refund cap as a SET predicate over unique
//     attempt keys (the fold-requiring half the gateway's provable-only check
//     passes through BY DESIGN: late parents, cross-push unprovables); (b) the
//     settled equation Σ tendering (purpose settles_order) − Σ refunds =
//     billed − voids − comps − discounts, once settled (void/comp/discount
//     value terms are 0 at v1 — no payload schemas exist); (c) purpose
//     discriminator: repays_receivable payments are NEVER tender
//     (DEC-MONEY-007) — they neither settle nor overpay.
//   state_legality (01-F35, 01 §4 machine, 20 §4.2): per line over the merged
//     line_context edge set, judged by the DOMAIN's exported legality
//     (LEGAL_NEXT / the edge model) — an illegal edge (to ∉ LEGAL_NEXT for the
//     named from_states, incl. any terminal from) is a finding; a contested
//     terminal set from concurrent LEGAL edges is NOT (rendered MVR, matrix
//     §4C — never a false alarm).
//   readmodel_diff (01-F7/01-F6/01-F34, 26 §8): the supplied projection
//     snapshot vs an INDEPENDENT fold of the merged set with the REAL
//     merge engine from @restos/sync-client (imported, never reimplemented —
//     fold-specific convergence: equal delivered set ⇒ byte-equal projection;
//     the superseded universal-canonical-replay oracle must NOT be
//     reincarnated here). Any row missing / extra / cell-divergent = finding.
//   audit_chain (01-F5 as concretized by DEC-AUDIT-001 + the T-01-10 status
//     note): per device, audit.* events from the merged log in ascending
//     lamport order through domain verifyAuditChain — a broken link is a
//     finding. Cloud-side tail truncation is caught by lamport_gap (the merged
//     log independently holds every audit event — the 01-F5 cross-check).
//     NOTE: DEC-TEST-003's dependency column gated this leg on T-01-10, which
//     has since LANDED — see the oracle report (contradiction 1) if this leg
//     is to be struck.
// ─────────────────────────────────────────────────────────────────────────────
import { auditEventHash, canonicalJson, type EventEnvelopeT, newId } from "@restos/domain";
import { openStore } from "@restos/sync-client";
import { sql } from "drizzle-orm";
import * as gatewayModule from "../index.js";
import { BASE_T, type Db, type Identity, validEnvelope } from "./helpers.js";

// ── the pinned surface, structurally cast (red until implemented) ────────────

export type AuditorCheck =
  | "lamport_gap"
  | "conservation"
  | "state_legality"
  | "readmodel_diff"
  | "audit_chain";

export const AUDITOR_CHECKS: readonly AuditorCheck[] = [
  "lamport_gap",
  "conservation",
  "state_legality",
  "readmodel_diff",
  "audit_chain",
];

export type AuditorFinding = {
  check: AuditorCheck;
  org_id: string;
  device_id: string | null;
  order_id: string | null;
  event_id: string | null;
  lamport_seq: number | null;
  detail: string;
};

export type AuditorReport = { ok: boolean; findings: AuditorFinding[] };

/** C8-pinned projection row shapes (@restos/sync-client re-exports them). */
export type ReadModelInput = {
  branch_id: string;
  orders: import("@restos/sync-client").OpenOrderRow[];
  queue: import("@restos/sync-client").KitchenQueueRow[];
};

export type RunAuditor = (args: {
  db: Db;
  org_id: string;
  read_model?: ReadModelInput;
}) => Promise<AuditorReport>;

/** Structural cast (T-01-09 red idiom): typecheck green, call fails "not a
 * function" until the implementing session exports runAuditor from index.ts. */
export const { runAuditor } = gatewayModule as unknown as { runAuditor: RunAuditor };

export const byCheck = (report: AuditorReport, check: AuditorCheck): AuditorFinding[] =>
  report.findings.filter((f) => f.check === check);

// ── typed event-payload builders (registry shapes from @restos/domain ONLY) ──

type EventSpec = { type: string; payload: Record<string, unknown> };

export const created = (
  order_id: string,
  opts: { channel?: string; table_id?: string } = {},
): EventSpec => ({
  type: "order.created",
  payload: {
    order_id,
    channel: opts.channel ?? "counter",
    ...(opts.table_id === undefined ? {} : { table_id: opts.table_id }),
  },
});

/** The order-level confirm fact — the ONLY event that creates a kitchen-queue
 * row (merge engine: queue row iff confirm anchor; a line_state_changed edge to
 * "confirmed" is a LINE edge, not the confirm fact). */
export const confirmed = (order_id: string): EventSpec => ({
  type: "order.confirmed",
  payload: { order_id },
});

export const lineAdded = (
  order_id: string,
  line_id: string,
  qty: number,
  unit_price_paisa: number,
  item_id = "item-chai",
): EventSpec => ({
  type: "order.line_added",
  payload: { order_id, line_id, item_id, qty, unit_price_paisa },
});

export const payment = (
  order_id: string,
  amount_paisa: number,
  opts: { attempt: string; method?: string; purpose?: string },
): EventSpec => ({
  type: "payment.recorded",
  payload: {
    order_id,
    amount_paisa,
    method: opts.method ?? "cash",
    settlement_attempt_id: opts.attempt,
    purpose: opts.purpose ?? "settles_order",
  },
});

export const refund = (
  order_id: string,
  amount_paisa: number,
  opts: { attempt: string; parent_attempt: string; method?: string },
): EventSpec => ({
  type: "payment.refunded",
  payload: {
    order_id,
    amount_paisa,
    method: opts.method ?? "cash_out",
    settlement_attempt_id: opts.attempt,
    payment_attempt_id: opts.parent_attempt,
  },
});

export const settlementClosed = (order_id: string): EventSpec => ({
  type: "order.settlement_closed",
  payload: { order_id },
});

/** A single-line transition edge (order.line_state_changed with line_context;
 * legacy line_ids/state carried — both required by the landed registry). */
export const edge = (
  order_id: string,
  line_id: string,
  to: string,
  from_states: readonly string[],
  preds: readonly string[] = [],
): EventSpec => ({
  type: "order.line_state_changed",
  payload: {
    order_id,
    line_ids: [line_id],
    state: to,
    line_context: { [line_id]: { to, from_states: [...from_states], preds: [...preds] } },
  },
});

/** One envelope for a typed spec — validEnvelope self-checks via parseEvent. */
export const evt = (
  identity: Identity,
  lamportSeq: number,
  spec: EventSpec,
  overrides: Partial<EventEnvelopeT> = {},
): EventEnvelopeT =>
  validEnvelope(identity, lamportSeq, { type: spec.type, payload: spec.payload, ...overrides });

/**
 * A correctly-linked audit chain (01-F5/DEC-AUDIT-001): prev_audit_hash null on
 * the first, auditEventHash(previous envelope) on each next — computed with the
 * DOMAIN primitive (declared once; this builder never reimplements the hash).
 * `forgeAt` (optional) replaces the link at that index with a garbage hash —
 * the forged-at-emit chain the gateway merges blindly and the Auditor must flag.
 */
export const auditChain = (
  identity: Identity,
  fromLamport: number,
  subtypes: readonly string[],
  opts: { forgeAt?: number } = {},
): EventEnvelopeT[] => {
  const chain: EventEnvelopeT[] = [];
  let prev: string | null = null;
  subtypes.forEach((subtype, i) => {
    const link = opts.forgeAt === i ? "f".repeat(64) : prev;
    const envelope = validEnvelope(identity, fromLamport + i, {
      type: subtype,
      payload: { prev_audit_hash: link },
      device_created_at: BASE_T + fromLamport + i,
    });
    chain.push(envelope);
    prev = auditEventHash(envelope);
  });
  return chain;
};

// ── corruption injectors (test-side SQL; the CORRUPTION the Auditor exists to
//    catch — the gateway itself never updates or deletes, 01-F1) ─────────────

export const deleteEventRow = async (db: Db, orgId: string, eventId: string): Promise<void> => {
  await db.execute(sql`delete from kernel.events where org_id = ${orgId} and id = ${eventId}`);
};

export const deleteQuarantineRow = async (
  db: Db,
  orgId: string,
  claimedEventId: string,
): Promise<void> => {
  await db.execute(
    sql`delete from kernel.quarantine
        where org_id = ${orgId} and claimed_event_id = ${claimedEventId}`,
  );
};

export const setWatermark = async (
  db: Db,
  orgId: string,
  deviceId: string,
  value: number,
): Promise<void> => {
  await db.execute(
    sql`update kernel.device_watermarks set acked_watermark = ${value}
        where org_id = ${orgId} and device_id = ${deviceId}`,
  );
};

export const tamperStoredPrevHash = async (
  db: Db,
  orgId: string,
  eventId: string,
  forged: string,
): Promise<void> => {
  await db.execute(
    sql`update kernel.events
        set envelope = jsonb_set(envelope, '{payload,prev_audit_hash}', ${JSON.stringify(forged)}::jsonb)
        where org_id = ${orgId} and id = ${eventId}`,
  );
};

// ── read-model construction via the REAL merge engine (@restos/sync-client) ──

/** A merged wire event as served by catchup/fan-out (envelope + cloud stamps). */
export type WireEvent = EventEnvelopeT & { global_seq?: number };

/**
 * Folds wire events into a fresh in-memory device store (the REAL engine — the
 * projection any correct read model must byte-agree with, 01-F34/26 §8) and
 * returns its projections. `reversed` feeds the set backwards; `adoptSeq:false`
 * ingests without any global_seq (a LAN-only device's projection — zero
 * ordering metadata). Equal delivered set ⇒ byte-equal projection.
 */
export const foldReadModel = (
  identity: { org_id: string; branch_id: string },
  wireEvents: readonly WireEvent[],
  opts: { reversed?: boolean; adoptSeq?: boolean } = {},
): {
  orders: import("@restos/sync-client").OpenOrderRow[];
  queue: import("@restos/sync-client").KitchenQueueRow[];
} => {
  const store = openStore({
    path: ":memory:",
    identity: {
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: `auditor-oracle-reader-${newId()}`,
    },
  });
  try {
    const feed = opts.reversed === true ? [...wireEvents].reverse() : [...wireEvents];
    for (const wire of feed) {
      const { global_seq, ...envelope } = wire;
      store.ingest(
        envelope,
        opts.adoptSeq === false || global_seq === undefined ? undefined : { global_seq },
      );
    }
    return { orders: store.openOrders(), queue: store.kitchenQueue() };
  } finally {
    store.close();
  }
};

// ── read-only pin support: an org-scoped canonical digest of every kernel table ──

const TABLES = [
  "events",
  "quarantine",
  "quarantine_notices",
  "device_watermarks",
  "org_sequences",
  "device_registry",
] as const;

export const kernelSnapshot = async (db: Db, orgId: string): Promise<string> => {
  const parts: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows = await db.execute(
      sql`select * from ${sql.raw(`kernel.${table}`)} where org_id = ${orgId}`,
    );
    // Stringify bigints/objects uniformly, then sort rows for order-independence.
    const dumped = [...rows].map((row) => canonicalJson(row)).sort();
    parts[table] = dumped;
  }
  return canonicalJson(parts);
};
