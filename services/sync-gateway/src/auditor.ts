// T-01-11 Auditor v1 (owning spec 20 §4.2; DEC-TEST-003 accepted + the chain
// leg ruled IN, plans/wave-0/t-01-11-rulings.md; oracle-pinned surface in
// __acceptance__/auditor-builders.ts): a READ-ONLY nightly cloud batch job over
// ONE org's kernel tables — it writes nothing, ever (01-F1 posture across all
// six tables; only SELECT statements exist in this file). Five legs:
//   lamport_gap    — per (org, device) slot coverage under the ratified
//                    coverage law (ruling 3): obligation = [0..max(W, max
//                    merged lamport)]; kernel.events rows and ATTRIBUTED
//                    kernel.quarantine rows COVER slots (DEC-SYNC-005 /
//                    01-F37 / t-01-12 F2), never EXTEND the obligation.
//   conservation   — per order over each branch's refold (DEC-SYNC-007: the
//                    fold-requiring half the gateway passes through by
//                    design): the 01-F29/01-F31 refund cap as the engine's
//                    order-free set predicate, and the 01-F30/01-F32 settled
//                    equation via the domain-declared residual (tendering
//                    purpose only, DEC-MONEY-007; shortfall flagged, excess
//                    tender is the OPEN constant — unconsumed at v1).
//   state_legality — per line edge over the refold (01-F35, 01 §4): the REAL
//                    engine's `illegal_transition` anomalies, which delegate
//                    to domain applyLineState/LEGAL_NEXT — a contested
//                    terminal set from concurrent LEGAL edges is a rendered
//                    MVR, never a finding (matrix §4C).
//   readmodel_diff — the supplied projection snapshot vs an INDEPENDENT
//                    refold with the REAL merge engine imported via the pure
//                    subpath (26 §8 / 01-F34 rewritten: fold-specific
//                    convergence — equal delivered set ⇒ byte-equal
//                    projection; fold logic is never reimplemented here).
//   audit_chain    — per device, audit.* events from the merged log in
//                    ascending lamport order through domain verifyAuditChain
//                    (01-F5 as concretized by DEC-AUDIT-001; declared once —
//                    never reimplemented). Tail truncation is the gap leg's
//                    catch: the merged log independently holds every audit
//                    event (the 01-F5 cross-check).
import {
  AUDIT_EVENT_TYPES,
  CONTESTED_LINE_BILLABLE,
  canonicalJson,
  type EventEnvelopeT,
  isAuditEvent,
  parseEvent,
  settledConservationResidualPaisa,
  TERMINAL_LINE_STATES,
  verifyAuditChain,
} from "@restos/domain";
import {
  createMergeEngine,
  type FoldState,
  type KitchenQueueRow,
  type OpenOrderRow,
} from "@restos/sync-client/fold-engine";
import { sql } from "drizzle-orm";
import type { GatewayDb } from "./gateway.js";

export type AuditorCheck =
  | "lamport_gap"
  | "conservation"
  | "state_legality"
  | "readmodel_diff"
  | "audit_chain";

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

/** 01-F7 Wave-0 diff-leg input (wave-0-scope.yml: "Auditor demonstrates
 * rebuildable projections") — a projection snapshot in the C8-pinned
 * @restos/sync-client row shapes, diffed against the independent refold. */
export type ReadModelInput = {
  branch_id: string;
  orders: OpenOrderRow[];
  queue: KitchenQueueRow[];
};

export type RunAuditorArgs = {
  db: GatewayDb;
  org_id: string;
  read_model?: ReadModelInput;
};

type MergedEventRow = {
  id: string;
  branch_id: string;
  device_id: string;
  lamport_seq: number;
  envelope: EventEnvelopeT;
};

const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_LINE_STATES);
const EXITED: ReadonlySet<string> = new Set(["voided", "cancelled"]);
const AUDIT_TYPES: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);

/** The engine's json_lines cell (merge.ts projectEntity) — the value fields the
 * billed derivation reads plus the per-edge anomaly map the legality leg reads. */
type LineCell = {
  qty: number;
  unit_price_paisa: number;
  states: string[];
  anomalies: Record<string, string>;
};

/**
 * Billed from the engine's PROJECTED lines (01-F30: "billed derives from
 * delivered lines, exited lines excluded — a fully-voided order nets to zero").
 * Reads the refold's json_lines output — decided-exited exclusion and the
 * contested-line policy constant mirror the engine's own billed_effective
 * (merge.ts): a decided single exited state contributes nothing; a contested
 * terminal set (≥2 heads) contributes per CONTESTED_LINE_BILLABLE.
 */
const billedFromJsonLines = (jsonLines: string): number => {
  const cells = JSON.parse(jsonLines) as Record<string, LineCell>;
  let billed = 0;
  for (const cell of Object.values(cells)) {
    if (cell.states.length === 1 && EXITED.has(cell.states[0] as string)) continue;
    const terminalCount = cell.states.filter((s) => TERMINAL.has(s)).length;
    if (terminalCount < 2 || CONTESTED_LINE_BILLABLE) {
      billed += cell.qty * cell.unit_price_paisa;
    }
  }
  return billed;
};

/**
 * READ-ONLY audit of one org's kernel tables (20 §4.2 "nightly cloud job per
 * org"). Branches and devices are discovered from the data; `read_model` is the
 * optional diff-leg snapshot. ok ⇔ findings empty, always.
 */
export const runAuditor = async (args: RunAuditorArgs): Promise<AuditorReport> => {
  const { db, org_id } = args;
  const findings: AuditorFinding[] = [];

  // ── the reads (the Auditor's entire footprint — no other statements) ───────
  const eventRows: MergedEventRow[] = [
    ...(await db.execute(
      sql`select id, branch_id, device_id, lamport_seq, envelope
          from kernel.events where org_id = ${org_id}
          order by lamport_seq asc`,
    )),
  ].map((row) => ({
    id: String(row.id),
    branch_id: String(row.branch_id),
    device_id: String(row.device_id),
    lamport_seq: Number(row.lamport_seq),
    envelope: row.envelope as EventEnvelopeT,
  }));
  const quarantineRows = [
    ...(await db.execute(
      sql`select device_id, envelope from kernel.quarantine where org_id = ${org_id}`,
    )),
  ].map((row) => ({ device_id: String(row.device_id), envelope: String(row.envelope) }));
  const watermarks = new Map<string, number>();
  for (const row of await db.execute(
    sql`select device_id, acked_watermark from kernel.device_watermarks
        where org_id = ${org_id}`,
  )) {
    watermarks.set(String(row.device_id), Number(row.acked_watermark));
  }

  // ── leg 1: per-origin lamport gap-free (01-F3/01-F8; ratified coverage law) ─
  // Obligation sources: the ack (W) and the merged log — NEVER quarantine rows
  // (the no-fill classes sit beyond any watermark and must not manufacture
  // gaps). Coverage sources: merged rows + quarantine rows ATTRIBUTED to the
  // device (row.device_id, the t-01-12 F2 attribution law) at their stored
  // envelope's lamport slot (DEC-SYNC-005 slot-filling).
  const coveredSlots = new Map<string, Set<number>>();
  const maxMerged = new Map<string, number>();
  const slotSet = (deviceId: string): Set<number> => {
    const existing = coveredSlots.get(deviceId);
    if (existing) return existing;
    const fresh = new Set<number>();
    coveredSlots.set(deviceId, fresh);
    return fresh;
  };
  for (const row of eventRows) {
    slotSet(row.device_id).add(row.lamport_seq);
    if (row.lamport_seq > (maxMerged.get(row.device_id) ?? -1)) {
      maxMerged.set(row.device_id, row.lamport_seq);
    }
  }
  for (const row of quarantineRows) {
    // The stored envelope is verbatim text and may be arbitrary bytes
    // (storage_reject class) — a row whose envelope yields no usable integer
    // lamport simply covers nothing.
    try {
      const claimed = (JSON.parse(row.envelope) as { lamport_seq?: unknown }).lamport_seq;
      if (Number.isInteger(claimed) && (claimed as number) >= 0) {
        slotSet(row.device_id).add(claimed as number);
      }
    } catch {
      // unparseable quarantined bytes: no slot claim
    }
  }
  const obligated = new Set<string>([...maxMerged.keys(), ...watermarks.keys()]);
  for (const deviceId of obligated) {
    const w = watermarks.get(deviceId) ?? -1;
    const hi = Math.max(w, maxMerged.get(deviceId) ?? -1);
    const covered = coveredSlots.get(deviceId) ?? new Set<number>();
    for (let slot = 0; slot <= hi; slot++) {
      if (covered.has(slot)) continue;
      findings.push({
        check: "lamport_gap",
        org_id,
        device_id: deviceId,
        order_id: null,
        event_id: null,
        lamport_seq: slot,
        detail:
          `lamport slot ${slot} of device ${deviceId} is covered by no merged event and no ` +
          `attributed quarantine row (acked_watermark ${w}, max merged lamport ` +
          `${maxMerged.get(deviceId) ?? -1}) — 01-F3/01-F8/DEC-SYNC-005`,
      });
    }
  }

  // ── the independent per-branch refold with the REAL engine (01-F34/26 §8) ──
  // Audit events are fold-inert (01-F5) and filtered exactly as the device
  // store filters them; everything else in the merged log is registry-valid by
  // the merge gate (01-F4) and replays as a pure function of the set.
  const byBranch = new Map<string, EventEnvelopeT[]>();
  for (const row of eventRows) {
    const branch = byBranch.get(row.branch_id);
    if (branch) branch.push(row.envelope);
    else byBranch.set(row.branch_id, [row.envelope]);
  }
  const refold = (branchId: string): FoldState => {
    const engine = createMergeEngine();
    engine.rebuild(
      (byBranch.get(branchId) ?? [])
        .filter((envelope) => !isAuditEvent(envelope.type))
        .map((envelope) => parseEvent(envelope)),
    );
    return engine.snapshot();
  };

  // ── legs 2+3: conservation and state legality over every branch's refold ───
  for (const branchId of byBranch.keys()) {
    const snapshot = refold(branchId);
    for (const order of snapshot.orders) {
      // 01-F29/01-F31 refund cap — the engine's order-free SET predicate over
      // unique attempt keys, evaluated on the WHOLE merged set: exactly what
      // the merge-time provable-only check passes through by design
      // (late parents, cross-push unprovables — DEC-SYNC-007).
      if (order.cap_violated === 1) {
        findings.push({
          check: "conservation",
          org_id,
          device_id: null,
          order_id: order.order_id,
          event_id: null,
          lamport_seq: null,
          detail:
            `refund attempts against order ${order.order_id} exceed a parent payment's ` +
            "agreed amount over the merged set (01-F29/01-F30 cap; DEC-SYNC-007 Auditor half)",
        });
      }
      // 01-F30/01-F32/01-F33 settled equation — only once settlement_closed is
      // delivered (an open order mid-service is unbalanced by nature, C-d).
      // Tendering purpose only (DEC-MONEY-007: repaid_total is never tender).
      // Shortfall flagged; excess tender is the OPEN product constant
      // (EXCESS_TENDER_IS_EXCEPTION — unconsumed at v1, matrix §5.3).
      if (order.settled === 1) {
        const billed = billedFromJsonLines(order.json_lines);
        const residual = settledConservationResidualPaisa({
          billed_paisa: billed,
          tendered_paisa: order.pay_total,
          refunded_paisa: order.refund_total,
        });
        if (residual > 0) {
          findings.push({
            check: "conservation",
            org_id,
            device_id: null,
            order_id: order.order_id,
            event_id: null,
            lamport_seq: null,
            detail:
              `settled order ${order.order_id} falls short of billed: tendering ` +
              `${order.pay_total} − refunds ${order.refund_total} < billed ${billed} ` +
              `(shortfall ${residual} paisa; 01-F30/01-F32)`,
          });
        }
      }
      // 01-F35 / 01 §4: the engine's per-edge legality anomalies delegate to
      // domain applyLineState — only `illegal_transition` is a finding; a
      // contested terminal set of LEGAL edges is a rendered MVR (matrix §4C)
      // and the other anomaly classes are fold renderings, not illegalities.
      const cells = JSON.parse(order.json_lines) as Record<string, LineCell>;
      for (const cell of Object.values(cells)) {
        for (const [eventId, anomaly] of Object.entries(cell.anomalies)) {
          if (anomaly !== "illegal_transition") continue;
          findings.push({
            check: "state_legality",
            org_id,
            device_id: null,
            order_id: order.order_id,
            event_id: eventId,
            lamport_seq: null,
            detail:
              `event ${eventId} carries an edge outside the declared machine for order ` +
              `${order.order_id} (01-F35/01 §4 via domain LEGAL_NEXT)`,
          });
        }
      }
    }
  }

  // ── leg 4: read-model diff vs the independent refold (01-F7/20 §4.2) ───────
  // Byte-equality per order key via the declared-once canonical serializer:
  // fold-specific convergence means equal delivered set ⇒ byte-equal rows, so
  // ANY divergence — missing, extra, or cell drift — is a finding.
  if (args.read_model !== undefined) {
    const snapshot = byBranch.has(args.read_model.branch_id)
      ? refold(args.read_model.branch_id)
      : { orders: [], queue: [], parked: [] };
    const diffRows = (
      table: "orders" | "queue",
      supplied: readonly { order_id: string }[],
      refolded: readonly { order_id: string }[],
    ): void => {
      const push = (orderId: string, detail: string): void => {
        findings.push({
          check: "readmodel_diff",
          org_id,
          device_id: null,
          order_id: orderId,
          event_id: null,
          lamport_seq: null,
          detail,
        });
      };
      const suppliedBy = new Map(supplied.map((row) => [row.order_id, row] as const));
      const refoldedBy = new Map(refolded.map((row) => [row.order_id, row] as const));
      for (const [orderId, row] of refoldedBy) {
        const got = suppliedBy.get(orderId);
        if (got === undefined) {
          push(orderId, `${table} row for order ${orderId} is missing from the read model (01-F7)`);
        } else if (canonicalJson(got) !== canonicalJson(row)) {
          push(
            orderId,
            `${table} row for order ${orderId} diverges from the independent refold (01-F7/26 §8)`,
          );
        }
      }
      for (const orderId of suppliedBy.keys()) {
        if (refoldedBy.has(orderId)) continue;
        push(
          orderId,
          `${table} row for order ${orderId} has no counterpart in the independent refold (01-F7)`,
        );
      }
    };
    diffRows("orders", args.read_model.orders, snapshot.orders);
    diffRows("queue", args.read_model.queue, snapshot.queue);
  }

  // ── leg 5: per-device audit-chain cross-check (01-F5/DEC-AUDIT-001) ────────
  // eventRows is lamport-ascending, so each device's filtered subsequence is
  // exactly verifyAuditChain's precondition; the FIRST broken link per device
  // is the finding (tail truncation is the gap leg's catch — the cross-check).
  const chains = new Map<string, EventEnvelopeT[]>();
  for (const row of eventRows) {
    if (!AUDIT_TYPES.has(row.envelope.type)) continue;
    const chain = chains.get(row.device_id);
    if (chain) chain.push(row.envelope);
    else chains.set(row.device_id, [row.envelope]);
  }
  for (const [deviceId, chain] of chains) {
    const result = verifyAuditChain(chain);
    if (result.ok) continue;
    findings.push({
      check: "audit_chain",
      org_id,
      device_id: deviceId,
      order_id: null,
      event_id: result.broken_at,
      lamport_seq: null,
      detail:
        `audit chain of device ${deviceId} breaks at event ${result.broken_at}: ` +
        `expected prev_audit_hash ${result.expected_prev ?? "null"}, found ` +
        `${result.found_prev ?? "null"} (01-F5/DEC-AUDIT-001)`,
    });
  }

  return { ok: findings.length === 0, findings };
};
