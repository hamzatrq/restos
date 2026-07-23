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
  canonicalJson,
  type EventEnvelopeT,
  isAuditEvent,
  parseEvent,
  settledConservationResidualPaisa,
  verifyAuditChain,
} from "@restos/domain";
import {
  billedEffectiveFromJsonLines,
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
  | "audit_chain"
  // Fix round F1 (ruled, plans/wave-0/t-01-11-fix-round.md): the refold's
  // per-event parse guard — a merged envelope the CURRENT registry cannot
  // parse is corruption (or registry drift) the report names, never aborts on.
  | "unparseable_merged_event";

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

const AUDIT_TYPES: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);

/** The engine's json_lines cell (merge.ts projectEntity) — the legality leg
 * reads only the per-edge anomaly map here; the billed derivation is the
 * ENGINE's own export (billedEffectiveFromJsonLines — fix round F4: the local
 * mirror is deleted, fold logic truly never reimplemented here). */
type LineCell = { anomalies: Record<string, string> };

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
  // Fix round F3 (ruled): missing slots are derived as contiguous RUNS from the
  // sorted covered set — work is O(covered · log covered), never O(hi), so the
  // watermark-corruption class (a corrupt ack of 100000 or 2^52) produces a
  // bounded report, never a hang. Short runs keep their per-slot findings
  // (precise and actionable — the corruption-1/2/3 pins stand); a run longer
  // than GAP_RUN_SLOT_FINDINGS collapses into ONE range finding whose
  // lamport_seq is the run's first missing slot and whose detail names the
  // extent.
  const GAP_RUN_SLOT_FINDINGS = 8;
  const obligated = new Set<string>([...maxMerged.keys(), ...watermarks.keys()]);
  for (const deviceId of obligated) {
    const w = watermarks.get(deviceId) ?? -1;
    const hi = Math.max(w, maxMerged.get(deviceId) ?? -1);
    const covered = [...(coveredSlots.get(deviceId) ?? new Set<number>())]
      .filter((slot) => slot <= hi)
      .sort((a, b) => a - b);
    const runs: [number, number][] = [];
    let next = 0;
    for (const slot of covered) {
      if (slot > next) runs.push([next, slot - 1]);
      next = slot + 1;
    }
    if (next <= hi) runs.push([next, hi]);
    const gapFinding = (slot: number, detail: string): AuditorFinding => ({
      check: "lamport_gap",
      org_id,
      device_id: deviceId,
      order_id: null,
      event_id: null,
      lamport_seq: slot,
      detail,
    });
    const sources = `(acked_watermark ${w}, max merged lamport ${maxMerged.get(deviceId) ?? -1})`;
    for (const [first, last] of runs) {
      if (last - first + 1 <= GAP_RUN_SLOT_FINDINGS) {
        for (let slot = first; slot <= last; slot++) {
          findings.push(
            gapFinding(
              slot,
              `lamport slot ${slot} of device ${deviceId} is covered by no merged event and no ` +
                `attributed quarantine row ${sources} — 01-F3/01-F8/DEC-SYNC-005`,
            ),
          );
        }
      } else {
        findings.push(
          gapFinding(
            first,
            `lamport slots ${first}..${last} of device ${deviceId} (${last - first + 1} ` +
              "contiguous slots) are covered by no merged event and no attributed quarantine " +
              `row ${sources} — aggregated range finding (fix round F3); 01-F3/01-F8/DEC-SYNC-005`,
          ),
        );
      }
    }
  }

  // ── the independent per-branch refold with the REAL engine (01-F34/26 §8) ──
  // Audit events are fold-inert (01-F5) and filtered exactly as the device
  // store filters them; everything else in the merged log is registry-valid by
  // the merge gate (01-F4) — so a stored envelope the CURRENT registry cannot
  // parse is corruption (or registry drift), and it must never abort the org's
  // report (fix round F1, ruled: the report survives ANY poisoned input).
  // Every envelope parses ONCE behind a per-event guard: a throw becomes a
  // structured `unparseable_merged_event` finding and the refold proceeds
  // without the row — whose slot the gap leg already counted as covered (a
  // merged row holds its slot regardless of parseability; the guard must not
  // manufacture gaps).
  type ParsedMergedEvent = ReturnType<typeof parseEvent>;
  const parsedByBranch = new Map<string, ParsedMergedEvent[]>();
  for (const row of eventRows) {
    try {
      if (isAuditEvent(row.envelope.type)) continue;
      const parsed = parseEvent(row.envelope);
      const branch = parsedByBranch.get(row.branch_id);
      if (branch) branch.push(parsed);
      else parsedByBranch.set(row.branch_id, [parsed]);
    } catch {
      findings.push({
        check: "unparseable_merged_event",
        org_id,
        device_id: row.device_id,
        order_id: null,
        event_id: row.id,
        lamport_seq: row.lamport_seq,
        detail:
          `merged event ${row.id} (device ${row.device_id}, lamport slot ${row.lamport_seq}) ` +
          "cannot be parsed by the current registry — corruption or registry drift (the 01-F4 " +
          "merge gate admits no such envelope); the refold proceeded without it (fix round F1)",
      });
    }
  }
  const refold = (branchId: string): FoldState => {
    const engine = createMergeEngine();
    engine.rebuild(parsedByBranch.get(branchId) ?? []);
    return engine.snapshot();
  };

  // ── legs 2+3: conservation and state legality over every branch's refold ───
  for (const branchId of parsedByBranch.keys()) {
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
      // (EXCESS_TENDER_IS_EXCEPTION — unconsumed at v1, matrix §5.3). billed is
      // the ENGINE's own derivation (fix round F4 — declared once in merge.ts).
      if (order.settled === 1) {
        try {
          const billed = billedEffectiveFromJsonLines(order.json_lines);
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
        } catch (error) {
          // Fix round F1a (ruled; the t-01-08 F-1 magnitude argument on the
          // refold path): totals outside the safe-integer range cannot satisfy
          // any schema-valid equation — a per-ORDER conservation finding, never
          // a whole-org abort (the report survives ANY poisoned input).
          if (!(error instanceof RangeError)) throw error;
          findings.push({
            check: "conservation",
            org_id,
            device_id: null,
            order_id: order.order_id,
            event_id: null,
            lamport_seq: null,
            detail:
              `settled order ${order.order_id} carries money totals outside the safe integer ` +
              `range (${error.message}) — unrepresentable magnitude necessarily violates the ` +
              "settled equation (fix round F1a; t-01-08 F-1 precedent; 01-F30/01-F32)",
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
    const snapshot = refold(args.read_model.branch_id);
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
      // Fix round F5 (ruled): a duplicate order_id among the supplied rows is
      // ITSELF a finding — the projection key is unique in any faithful read
      // model, and keying a Map would silently collapse exactly the drift this
      // leg exists to catch.
      const seen = new Set<string>();
      for (const row of supplied) {
        if (seen.has(row.order_id)) {
          push(
            row.order_id,
            `${table} supplies more than one row for order ${row.order_id} — duplicate ` +
              "projection key in the read model (01-F7; fix round F5)",
          );
        }
        seen.add(row.order_id);
      }
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
    // Fix round 2 Finding 2 (ruled): audit events are fold-inert, so they `continue`
    // in the refold BEFORE its per-event parse guard (F1b) — leaving leg 5 to feed
    // UNPARSED audit envelopes to verifyAuditChain. A corrupt/null-payload audit-typed
    // merged row (reachable only by corruption or registry drift — the 01-F4 gate
    // admits none) then aborted the WHOLE org report. Guard each audit row exactly as
    // the refold guards the rest: an unparseable audit-typed envelope becomes a
    // structured `unparseable_merged_event` finding and is dropped from the chain, so
    // the report survives ANY poisoned input. The row's slot is already counted covered
    // by the gap leg (a merged row holds its slot regardless of parseability).
    try {
      parseEvent(row.envelope);
    } catch {
      findings.push({
        check: "unparseable_merged_event",
        org_id,
        device_id: row.device_id,
        order_id: null,
        event_id: row.id,
        lamport_seq: row.lamport_seq,
        detail:
          `merged audit-typed event ${row.id} (device ${row.device_id}, lamport slot ` +
          `${row.lamport_seq}) cannot be parsed by the current registry — corruption or ` +
          "registry drift; excluded from the audit-chain cross-check, the report survives " +
          "(fix round 2, Finding 2)",
      });
      continue;
    }
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
