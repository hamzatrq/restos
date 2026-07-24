// parity-entry.ts — PHASE 1 (runtime parity). Bundled and run under BOTH Node and
// Hermes; every `@P` line it prints is compared byte-for-byte by run.mjs. The bar:
// any case whose bytes differ between engines is a FINDING (the kernel would behave
// differently on the tablet than in CI). Targets the documented V8-vs-Hermes risks:
// BigInt money math, canonicalJson (key order / number formatting / UTF-16 sort /
// non-ASCII), SHA-256 payload/audit hashing, Array.sort stability + the merge
// projection, and the line state machine.
import { createMergeEngine } from "../../packages/sync-client/src/fold-engine.ts";
import {
  applyLineState,
  applyRateBps,
  auditEventHash,
  canonicalJson,
  type EventEnvelopeT,
  LEGAL_NEXT,
  ORDER_LINE_STATES,
  type OrderLineState,
  paisa,
  payloadHash,
  splitPaisa,
  sumPaisa,
  verifyAuditChain,
} from "./domain-kernel.ts";
import { busyDay, canonicalPayloads } from "./fixtures.ts";
import { emitMeta, emitResult, seededRng } from "./harness.ts";

/** Run a thunk, capturing either its value or the thrown error message — so a
 * RangeError (overflow guard) is itself a comparable, asserted outcome. */
function outcome<T>(fn: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Detect the runtime for the meta line (does not affect any assertion).
emitMeta(
  "engine",
  typeof (globalThis as { print?: unknown }).print === "function" ? "hermes" : "node",
);
emitMeta("bigint", typeof 1n);

// ── 1. BigInt / money helpers ──────────────────────────────────────────────
// sumPaisa (bigint accumulation + 2^53 overflow guard).
const MAX_SAFE = 9007199254740991;
const sumCases: number[][] = [
  [100, 250, 999],
  [MAX_SAFE - 2, 1, 1], // lands exactly on MAX_SAFE
  [MAX_SAFE, 1], // overflow → RangeError, both engines must agree
  [0],
  [5000, 5000, 5000, 5000],
];
emitResult(
  "money/sumPaisa",
  canonicalJson(sumCases.map((c) => outcome(() => sumPaisa(c.map((n) => paisa(n)))))),
);

// applyRateBps (amount·bps routinely exceeds 2^53 — the BigInt path; ROUND-HALF-UP).
const rateCases: Array<[number, number]> = [
  [1, 5000], // 0.5 → half-up → 1
  [1, 4999], // 0.49995 → floor → 0
  [50000, 1700], // 17% of 500.00
  [MAX_SAFE, 1700], // amount·bps ≫ 2^53: naive float is off-by-one here
  [123456789, 33333],
  [999999, 10001], // markup above 100%
];
emitResult(
  "money/applyRateBps",
  canonicalJson(rateCases.map(([a, b]) => outcome(() => applyRateBps(paisa(a), b)))),
);

// splitPaisa (largest-remainder, first parts; exact float-free division).
const splitCases: Array<[number, number]> = [
  [100, 3],
  [10, 4],
  [MAX_SAFE, 7],
  [0, 5],
  [7, 1],
  [1000000, 999],
];
emitResult(
  "money/splitPaisa",
  canonicalJson(splitCases.map(([t, n]) => outcome(() => splitPaisa(paisa(t), n)))),
);

// A seeded breadth batch so parity covers far more than the hand-picked boundaries.
const rng = seededRng(20260724);
const batch: unknown[] = [];
for (let i = 0; i < 500; i++) {
  const amount = Math.floor(rng() * MAX_SAFE);
  const bps = Math.floor(rng() * 25000);
  const n = 1 + Math.floor(rng() * 13);
  batch.push([
    outcome(() => applyRateBps(paisa(amount), bps)),
    outcome(() => splitPaisa(paisa(amount), n)),
  ]);
}
emitResult("money/seeded-batch", canonicalJson(batch));

// ── 2. canonicalJson (key order / number formatting / UTF-16 / non-ASCII) ──
for (const { name, value } of canonicalPayloads) {
  emitResult(`canonical/${name}`, canonicalJson(value));
}

// ── 3. payloadHash + audit hash chain (SHA-256 over canonical JSON) ─────────
for (const { name, value } of canonicalPayloads) {
  emitResult(`payloadHash/${name}`, payloadHash(value));
}

// Build a 12-link audit chain, hash each link, verify the whole chain.
const auditEvents: EventEnvelopeT[] = [];
let prev: string | null = null;
for (let i = 0; i < 12; i++) {
  const env: EventEnvelopeT = {
    id: `a-${String(i).padStart(3, "0")}`,
    org_id: "org-bench",
    branch_id: "br-bench",
    device_id: "d0",
    actor_user_id: i % 2 === 0 ? "u-cashier" : null,
    lamport_seq: i,
    device_created_at: 1_752_800_000_000 + i,
    server_received_at: i, // present here; auditEventHash must exclude it
    type: "audit.login",
    schema_version: 1,
    payload: { prev_audit_hash: prev, note: `درج ${i}`, seq: i },
    refs: [],
  };
  prev = auditEventHash(env);
  auditEvents.push(env);
}
emitResult("audit/hashes", canonicalJson(auditEvents.map((e) => auditEventHash(e))));
emitResult("audit/verify-ok", canonicalJson(verifyAuditChain(auditEvents)));
// Tamper one link's payload — verify must report the SAME broken_at on both engines.
const tampered = auditEvents.map((e, i) =>
  i === 6 ? { ...e, payload: { ...(e.payload as object), note: "tampered" } } : e,
);
emitResult("audit/verify-tampered", canonicalJson(verifyAuditChain(tampered)));

// ── 4. Array.sort stability + the merge projection over a realistic set ─────
// Direct stability probe: many equal keys, distinct payloads — a non-stable sort
// would reorder the payloads differently across engines.
const stabilityInput = Array.from({ length: 200 }, (_, i) => ({ k: i % 5, v: i }));
emitResult(
  "sort/stability",
  canonicalJson([...stabilityInput].sort((a, b) => a.k - b.k).map((o) => o.v)),
);

// The merge engine's full projection over a seeded busy-day set. rebuild() is a pure
// function of the delivered SET; both engines must produce byte-identical rows.
for (const seed of [1, 2, 3]) {
  const { events } = busyDay(seed, 400);
  const engine = createMergeEngine();
  engine.rebuild(events);
  const snap = engine.snapshot();
  emitResult(`merge/snapshot-seed-${seed}`, canonicalJson(snap));
  emitResult(`merge/stats-seed-${seed}`, canonicalJson(engine.stats()));
}

// ── 5. Line state machine (applyLineState over ALL transitions) ─────────────
const transitionMatrix = ORDER_LINE_STATES.flatMap((from) =>
  ORDER_LINE_STATES.map((to) => ({
    from,
    to,
    legal_next: LEGAL_NEXT[from as OrderLineState],
    result: applyLineState(from as OrderLineState, to as OrderLineState),
  })),
);
emitResult("states/transition-matrix", canonicalJson(transitionMatrix));

emitMeta("done", "parity");
