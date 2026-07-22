// T-01-15 oracle builders — the merge-semantics fold engine acceptance surface.
// Authored from specs/01-kernel-sync.md (amended 01-F29..F35, 01-F34 rewritten),
// specs/26-merge-semantics.md, plans/wave-0/merge-semantics-matrix.md (§1 rows for
// open_orders/kitchen_queue, §4 prototype predicates + counterexamples, Addendum)
// and the T-01-15 contract in plans/wave-0/kernel-tasks.md ONLY — never from an
// implementation or prototype (24 §3 step 2; T-01-15 oracle rules).
//
// ── ORACLE-PINNED PROJECTION SURFACE (binding for the implementing session) ──
// The T-01-15 contract re-expresses the two implemented folds per the matrix but
// does not restate the store row shapes; per the oracle mandate ("test against the
// API the contract names") the shapes below are pinned from the matrix rows and are
// the definition of done. Deviations are contract-clarification events, not test
// defects. Pins, with their matrix sources:
//   - openOrders() row:
//       order_id, channel, order_type      — register from order.created; duplicate
//         creates → MVR, default = member with min payloadHash, plus the
//         "order_identity_conflict" exception (matrix row 52).
//       confirmed_at                        — value stamping UNCHANGED per the
//         T-01-15 out-of-scope note (device_created_at of the anchor confirm;
//         null before any confirm). EXCLUDED from the 01-F34 invariance oracle —
//         see the conflict note in the oracle report.
//       settled (0|1)                       — monotone OR over order.settlement_closed
//         (01-F33; matrix row 37). Nothing arithmetic settles or un-settles.
//       table_ids_json                      — canonical JSON array of the DISTINCT
//         head values of the supersedes-DAG (order.created's table_id is the root
//         node), values sorted by UTF-16 code unit (matrix row 53; §4B).
//       table_conflict (0|1)                — |distinct head values| > 1 (value-
//         equality auto-clears).
//       pay_total                           — Σ agreed `purpose: settles_order`
//         attempts; disputed keys contribute 0 (01-F31; matrix rows 32/34).
//       repaid_total                        — Σ agreed `purpose: repays_receivable`
//         attempts (01-F32/DEC-MONEY-007; the observable for "receivable
//         decrements" in the khata counterexample).
//       refund_total                        — Σ agreed refund attempts (order-keyed;
//         01-F29; matrix row 35).
//       pay_attempts_json / refund_attempts_json — materialized attempt maps
//         (matrix rows 34/35): canonical JSON Record<attempt_id, member[]> where a
//         member is the payload minus its settlement_attempt_id key, members are
//         value-deduped and sorted by their canonical bytes. A key is disputed iff
//         it has >1 member (whole-payload immutability, Addendum-A); id-free by
//         construction (Addendum-A: byte-identity pins to the id-free projection).
//         Fix-round F8 amendment: SUPERSEDED-TOLERATED fields are excluded from
//         the immutable-intent comparison AND the rendered member — for
//         payment.refunded that set is {payment_id}, the C2-superseded envelope-id
//         parent ref. Version skew must never manufacture a dispute.
//       cap_violated (0|1)                  — monotone: some parent attempt on this
//         order has Σ agreed refunds > its agreed amount (01-F29 set predicate;
//         cap resolves parents by settlement_attempt_id, Addendum-A). Gates money
//         rendering; never blocks anything. Fix-round F3 amendment: the flag is a
//         LATCH — once the violation is witnessable it stays 1 even when a later
//         divergent member disputes the parent key (the totals move per
//         Addendum-A; the flag never regresses). The latch must be an order-free
//         monotone function of the delivered SET (∃ an agreed sub-view violating
//         the cap), never a delivery-order memory — 01-F34 convergence still
//         binds and this suite asserts the dispute-first order lands on 1 too.
//       exceptions_json                     — canonical JSON sorted distinct array
//         of exception codes; pinned codes used by this suite:
//         "attempt_divergence" (any disputed attempt key on the order, 01-F31),
//         "order_identity_conflict" (duplicate creates, matrix row 52),
//         "uncovered_addition" (line added after settlement_closed, 01-F33 —
//         fix-round F4: the ceiling is the largest VALID integer billed_paisa
//         snapshot among delivered closes; a close carrying NO snapshot asserts
//         NO ceiling — "no attestation" is not "attested zero"),
//         "close_snapshot_invalid" (fix-round F4, oracle-pinned code: a close
//         whose billed_paisa snapshot is non-integer or negative is
//         ignored-with-anomaly — the ACT still settles, the bad snapshot
//         contributes no ceiling and raises this code instead),
//         "line_value_conflict" (divergent order.line_added values for one
//         line_id — fix-round R3, ratifying the implementer's §4 proposal: the
//         cell renders the min-payloadHash member wholesale, mirroring the
//         matrix row 52 create-MVR default, plus this order-level code).
//       json_lines                          — canonical JSON Record<line_id, cell>,
//         cell = { item_id, qty, unit_price_paisa, states, anomalies }:
//         states = the projected state SET in ORDER_LINE_STATES index order
//         (singleton when decided; the contested terminal set otherwise — matrix
//         §4C predicate 1); anomalies = G-Map envelope-id → code, priority
//         illegal_transition > inconsistent_predecessor > terminal_regression
//         (Addendum-C). A line appears iff its order.line_added has been delivered;
//         edges for a not-yet-added line are held, never parked, never dropped
//         (matrix row 61).
//   - kitchenQueue() row: order_id, channel, confirm_at, age_basis, lines_ready,
//       lines_total. Row exists iff the confirmed fact holds (monotone OR, matrix
//       row 56). age_basis = the confirm anchor — the kot.printed fallback is
//       DELETED (matrix rows 59/60; 03-F25/F26). lines_ready counts lines that are
//       cooking-done: watermark ≥ ready, or ANY terminal head — contested included
//       (zombie-tickets counterexample; Addendum-C: cooking-done includes
//       picked_up). lines_total excludes decidedly-exited (voided/cancelled) lines.
//   - parked() rows keep {event_id, waiting_for, envelope_json}; this oracle pins
//       only MEMBERSHIP and drain behaviour (the key-presence set of matrix row 70)
//       — waiting_for's exact string form is deliberately unpinned.
//   - foldStats(): { full_rebuilds, scoped_rebuilds, events_folded } — the
//       T-01-14→T-01-15 work-counter mandate. events_folded is the real quantity.
//   - retentionDrop(keys) — the matrix-conventions outer-layer key-set shrink
//       operation (atomic per-entity, open-bill guard); ratified in scope by
//       contract ruling C4. Fix-round F1/F2/F8 amendments: (F1) a call either
//       succeeds ATOMICALLY or rejects loudly changing NOTHING — the in-memory
//       lattice included — with no key-order dependence across the key array;
//       (F2) a successful drop leaves session-scoped dropped-key memory: a
//       straggler for a dropped key is ledger-retained (01-F1), never folded,
//       never projected (row, queue, AND parked membership), and — oracle-pinned
//       counter treatment — counts no fold work (events_folded unchanged; the
//       same honesty principle that makes F5's silent fall-through an overcount);
//       (F8) a malformed key (`line:O1`, unknown prefixes) is rejected loudly
//       with nothing changed — never silently mis-parsed.
//
// ── Fix-round ratification (plans/wave-0/t-01-15-fix-round.md, R1) ──────────
// The implementer's application of this oracle's superseded-law enumeration to
// the legacy suites (commit d17ac45) is post-hoc RATIFIED for all 18
// re-expressed S slots — entries 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 (part-S),
// 16, 17, 20, 22 (both tiebreak tests), 23 and 30 — reviewer 1 verdict adopted:
// all faithful re-expressions of their named replacement laws. This round also
// re-anchors entry 7's expectation on an independent sha256(canonicalJson)
// computation (R2), replaces entry 8's interim convergence guard with this
// oracle's line-value MVR pin (R3, above), and retitles the stale "≡ refold()"
// claims in spike-scenarios (R4 — titles only). New pins cite F1–F8 findings
// from the fix-round file in their test names.
import { createHash } from "node:crypto";
import { openStore } from "../index.js";
import { canonicalJson, type Identity, must, peerEnvelope, seededRng } from "./builders.js";

export type FoldStats = {
  full_rebuilds: number;
  scoped_rebuilds: number;
  events_folded: number;
};

export type MergeLineCell = {
  item_id: string;
  qty: number;
  unit_price_paisa: number;
  states: string[];
  anomalies: Record<string, string>;
};

export type MergeOpenOrderRow = {
  order_id: string;
  channel: string;
  order_type: string | null;
  confirmed_at: number | null;
  settled: number;
  table_ids_json: string;
  table_conflict: number;
  pay_total: number;
  repaid_total: number;
  refund_total: number;
  pay_attempts_json: string;
  refund_attempts_json: string;
  cap_violated: number;
  exceptions_json: string;
  json_lines: string;
};

/** The closed openOrders() row shape — the matrix-A "tendered" counterexample is a
 * projection-shape constraint: no derived signed money column may exist. */
export const PINNED_ORDER_ROW_KEYS = [
  "cap_violated",
  "channel",
  "confirmed_at",
  "exceptions_json",
  "json_lines",
  "order_id",
  "order_type",
  "pay_attempts_json",
  "pay_total",
  "refund_attempts_json",
  "refund_total",
  "repaid_total",
  "settled",
  "table_conflict",
  "table_ids_json",
] as const;

export type MergeQueueRow = {
  order_id: string;
  channel: string;
  confirm_at: number;
  age_basis: number;
  lines_ready: number;
  lines_total: number;
};

export const PINNED_QUEUE_ROW_KEYS = [
  "age_basis",
  "channel",
  "confirm_at",
  "lines_ready",
  "lines_total",
  "order_id",
] as const;

export type MergeParkedRow = { event_id: string; waiting_for: string; envelope_json: string };

/** The store surface this suite drives — typed standalone so the oracle compiles
 * against the contract; a missing member fails the red run at runtime. */
export type MergeStore = {
  append(input: Record<string, unknown>): Record<string, unknown> & { id: string };
  ingest(envelope: unknown, opts?: { global_seq?: number }): { stored: boolean };
  ingestBatch(envelopes: unknown[]): { appended: number; deduped: number; rejected: number };
  assignGlobalSeq(event_id: string, global_seq: number): void;
  openOrders(): MergeOpenOrderRow[];
  kitchenQueue(): MergeQueueRow[];
  parked(): MergeParkedRow[];
  foldStats(): FoldStats;
  retentionDrop?(keys: readonly string[]): void;
  readOwnEvents(fromLamport?: number): Array<Record<string, unknown> & { id: string }>;
  readAllEvents(): Array<Record<string, unknown> & { id: string }>;
  close(): void;
};

export const mergeStore = (id: Identity, path = ":memory:"): MergeStore =>
  openStore({ path, identity: id }) as unknown as MergeStore;

export const foldStats = (store: MergeStore): FoldStats => {
  if (typeof store.foldStats !== "function")
    throw new Error(
      "store.foldStats() is not implemented yet (T-01-15 red-awaiting-implementation)",
    );
  return store.foldStats();
};

// ---------------------------------------------------------------------------
// Typed payload fragments for the amended registry (spread into appendInput /
// peerEnvelope overrides, like ./builders.ts does for the T-01-04 shapes).
// ---------------------------------------------------------------------------

export const created = (order_id: string, extra: Record<string, unknown> = {}) => ({
  type: "order.created",
  payload: { order_id, channel: "dine_in", ...extra },
});

export const confirmed = (order_id: string) => ({
  type: "order.confirmed",
  payload: { order_id },
});

export const lineAdded = (
  order_id: string,
  line_id: string,
  extra: Record<string, unknown> = {},
) => ({
  type: "order.line_added",
  payload: { order_id, line_id, item_id: "item-karahi", qty: 1, unit_price_paisa: 50000, ...extra },
});

export const tableAssigned = (
  order_id: string,
  table_id: string,
  opts: { from?: string | null; supersedes?: readonly string[] } = {},
) => ({
  type: "order.table_assigned",
  payload: {
    order_id,
    table_id,
    from_table_id: opts.from ?? null,
    supersedes: [...(opts.supersedes ?? [])],
  },
});

export const kot = (order_id: string) => ({ type: "kot.printed", payload: { order_id } });

/** A single-line transition edge (order.line_state_changed with line_context).
 * Legacy line_ids/state are carried too so the same envelope is valid under both
 * the current and the amended schema — the oracle pins line_context, not their removal. */
export const edge = (
  order_id: string,
  line_id: string,
  to: string,
  from_states: readonly string[],
  preds: readonly string[] = [],
) => ({
  type: "order.line_state_changed",
  payload: {
    order_id,
    line_ids: [line_id],
    state: to,
    line_context: { [line_id]: { to, from_states: [...from_states], preds: [...preds] } },
  },
});

export const payment = (
  order_id: string,
  amount_paisa: number,
  opts: { attempt: string; method?: string; purpose?: string },
) => ({
  type: "payment.recorded",
  payload: {
    order_id,
    amount_paisa,
    method: opts.method ?? "cash",
    purpose: opts.purpose ?? "settles_order",
    settlement_attempt_id: opts.attempt,
  },
});

/** parent = the parent payment's settlement_attempt_id (01-F29: envelope-id parent
 * refs superseded); attempt = the refund's OWN idempotency key (01-F31). */
export const refund = (
  order_id: string,
  amount_paisa: number,
  opts: { attempt: string; parent: string; method?: string },
) => ({
  type: "payment.refunded",
  payload: {
    order_id,
    amount_paisa,
    method: opts.method ?? "cash_out",
    settlement_attempt_id: opts.attempt,
    payment_attempt_id: opts.parent,
  },
});

export const settlementClosed = (order_id: string, extra: Record<string, unknown> = {}) => ({
  type: "order.settlement_closed",
  payload: {
    order_id,
    settlement_attempt_ids: [] as string[],
    billed_paisa: 0,
    tendered_paisa: 0,
    refunded_paisa: 0,
    closed_by_user: "u-close",
    ...extra,
  },
});

// ---------------------------------------------------------------------------
// Projections. Full projection = byte-comparable across stores holding the SAME
// delivered set (same ids, same stamps). Invariant projection = the 01-F34 oracle
// view: the three time-VALUED columns (confirmed_at / confirm_at / age_basis) are
// excluded because the T-01-15 contract keeps their value stamping on
// device_created_at until DEC-TIME-001 — the conflict with 01-F34's literal
// "byte-equal under clock injection" is reported, not silently absorbed.
// parked() contributes membership only (waiting_for / envelope_json are
// delivery-layer, deliberately unpinned).
// ---------------------------------------------------------------------------

export const projection = (store: MergeStore) => ({
  orders: store.openOrders(),
  queue: store.kitchenQueue(),
  parked_event_ids: store
    .parked()
    .map((r) => r.event_id)
    .sort(),
});

export type MergeProjection = ReturnType<typeof projection>;

export const projectionBytes = (store: MergeStore): string => canonicalJson(projection(store));

export const invariantProjection = (store: MergeStore) => ({
  orders: store.openOrders().map(({ confirmed_at: _t, ...rest }) => rest),
  queue: store.kitchenQueue().map(({ confirm_at: _c, age_basis: _a, ...rest }) => rest),
  parked_event_ids: store
    .parked()
    .map((r) => r.event_id)
    .sort(),
});

export type MergeInvariantProjection = ReturnType<typeof invariantProjection>;

export const invariantBytes = (store: MergeStore): string =>
  canonicalJson(invariantProjection(store));

/** Applies an envelope-id bijection to the id REFERENCES a projection legitimately
 * retains (json_lines anomaly keys; parked membership). Ids are identity-only
 * (Addendum-B): projections must be invariant under consistent relabeling, which
 * means projection(φ(S)) must byte-equal φ(projection(S)) — this is φ on the
 * projection side. */
export const mapProjectionIds = (
  proj: MergeInvariantProjection,
  map: ReadonlyMap<string, string>,
): MergeInvariantProjection => {
  const m = (v: string) => map.get(v) ?? v;
  return {
    orders: proj.orders.map((row) => {
      const cells = JSON.parse(row.json_lines) as Record<string, MergeLineCell>;
      const mapped: Record<string, MergeLineCell> = {};
      for (const [lineId, cell] of Object.entries(cells)) {
        const anomalies: Record<string, string> = {};
        for (const [eventId, code] of Object.entries(cell.anomalies)) anomalies[m(eventId)] = code;
        mapped[lineId] = { ...cell, anomalies };
      }
      return { ...row, json_lines: canonicalJson(mapped) };
    }),
    queue: proj.queue,
    parked_event_ids: proj.parked_event_ids.map(m).sort(),
  };
};

// ---------------------------------------------------------------------------
// Envelope-id relabeling (01-F34 invariance oracle). φ is applied consistently to
// the id AND to every id REFERENCE — supersedes[], line_context[*].preds[], refs[]
// (attempt ids are payload strings, not envelope ids: never relabeled).
// ---------------------------------------------------------------------------

export const relabelEnvelope = (
  env: Record<string, unknown>,
  map: ReadonlyMap<string, string>,
): Record<string, unknown> => {
  const m = (v: string) => map.get(v) ?? v;
  const payload = { ...(env.payload as Record<string, unknown>) };
  if (Array.isArray(payload.supersedes))
    payload.supersedes = (payload.supersedes as string[]).map(m);
  const ctx = payload.line_context;
  if (ctx && typeof ctx === "object") {
    const mapped: Record<string, unknown> = {};
    for (const [lineId, entry] of Object.entries(
      ctx as Record<string, { to: string; from_states: string[]; preds: string[] }>,
    )) {
      mapped[lineId] = { ...entry, preds: entry.preds.map(m) };
    }
    payload.line_context = mapped;
  }
  return {
    ...env,
    id: m(env.id as string),
    payload,
    refs: Array.isArray(env.refs) ? (env.refs as string[]).map(m) : env.refs,
  };
};

/** An ORDER-REVERSING bijection over the given ids: the lexicographically smallest
 * id maps to the largest image. Kills any min/max-by-id tiebreak that plain
 * convergence would bless (26 §8 binding oracle lesson). */
export const reversingIdMap = (ids: readonly string[]): Map<string, string> => {
  const sorted = [...ids].sort();
  const width = Math.max(4, String(sorted.length).length);
  const map = new Map<string, string>();
  sorted.forEach((id, i) => {
    map.set(id, `zz-${String(sorted.length - 1 - i).padStart(width, "0")}`);
  });
  return map;
};

// ---------------------------------------------------------------------------
// Delivery-order machinery.
// ---------------------------------------------------------------------------

/** Heap's algorithm — exhaustive permutations for small directed sets (n ≤ 6). */
export function* heapPermutations<T>(items: readonly T[]): Generator<readonly T[]> {
  const a = [...items];
  const n = a.length;
  const c = new Array<number>(n).fill(0);
  yield [...a];
  let i = 0;
  while (i < n) {
    const ci = must(c[i], "heap counter");
    if (ci < i) {
      const j = i % 2 === 0 ? 0 : ci;
      const x = must(a[j], "heap swap a");
      const y = must(a[i], "heap swap b");
      a[j] = y;
      a[i] = x;
      yield [...a];
      c[i] = ci + 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}

export const shuffled = <T>(xs: readonly T[], seed: number): T[] => {
  const rng = seededRng(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = must(out[i], "shuffle a");
    const b = must(out[j], "shuffle b");
    out[i] = b;
    out[j] = a;
  }
  return out;
};

export const ingestAll = (store: MergeStore, envelopes: readonly unknown[]): void => {
  for (const env of envelopes) store.ingest(env);
};

/** sha256 hex over the independent test-side canonical serialization — the
 * oracle's own expectation for domain payloadHash / min-payloadHash defaults. */
export const sha256Canonical = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");

// ---------------------------------------------------------------------------
// Named seeded generator (20 §2.3) — registry-valid multi-device branch sets over
// the AMENDED payload shapes: supersedes chains and concurrent assignment pairs,
// line-context edge chains with occasional concurrent terminals and illegal edges,
// attempt maps with transport duplicates, intent duplicates and divergent members,
// khata repayments, refunds keyed by parent attempt, settlement closes, and
// permanent orphans (so parked converges as a table, not just to empty).
// ---------------------------------------------------------------------------

export type MergeSet = {
  identity: Identity;
  /** Emission order — deliveries may be permuted arbitrarily (01-F34 set law). */
  envelopes: Array<Record<string, unknown> & { id: string }>;
};

export const generateMergeSet = (seed: number): MergeSet => {
  const rng = seededRng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p: number) => rng() < p;
  const T0 = 1752800000000;

  const own: Identity = {
    org_id: `org-${seed}`,
    branch_id: `br-${seed}`,
    device_id: "d0-own",
  };
  const peers: Identity[] = [];
  for (let i = 1, n = int(2, 4); i <= n; i++) peers.push({ ...own, device_id: `d${i}-peer` });
  const lamports = peers.map(() => 0);
  const clocks = peers.map(() => T0 + int(0, 5) * 100);

  const envelopes: Array<Record<string, unknown> & { id: string }> = [];
  const emit = (typed: { type: string; payload: Record<string, unknown> }): string => {
    const idx = int(0, peers.length - 1);
    const peer = must(peers[idx], "peer");
    const lamport = must(lamports[idx], "lamport");
    lamports[idx] = lamport + 1;
    const at = must(clocks[idx], "clock");
    clocks[idx] = at + int(0, 3) * 100; // zero-steps keep cross-device timestamp ties present
    const id = `e-${String(envelopes.length).padStart(3, "0")}`;
    const env = peerEnvelope(peer, lamport, {
      id,
      device_created_at: at,
      ...typed,
    }) as Record<string, unknown> & { id: string };
    envelopes.push(env);
    return id;
  };

  let attemptCounter = 0;
  const nextAttempt = () => `sa-${seed}-${attemptCounter++}`;

  const CHAIN = ["confirmed", "in_prep", "ready"] as const;

  for (let o = 0, orders = int(1, 2); o < orders; o++) {
    const orderId = `O${o}`;
    const birthTable = chance(0.4) ? `T${int(1, 3)}` : undefined;
    const createdId = emit(created(orderId, birthTable ? { table_id: birthTable } : {}));
    if (chance(0.2))
      emit(created(orderId, { channel: "takeaway" })); // divergent duplicate create
    else if (chance(0.15)) emit(created(orderId, birthTable ? { table_id: birthTable } : {})); // identical-value duplicate

    const lineIds: string[] = [];
    for (let l = 0, n = int(1, 2); l < n; l++) {
      const lineId = `${orderId}-L${l}`;
      lineIds.push(lineId);
      emit(lineAdded(orderId, lineId, { qty: int(1, 3), unit_price_paisa: int(1, 5) * 100 }));

      // Edge chain with per-line context.
      let current = "placed";
      let head: string | null = null;
      const steps = int(0, 3);
      for (let s = 0; s < steps; s++) {
        const to = CHAIN[s];
        if (!to) break;
        head = emit(edge(orderId, lineId, to, [current], chance(0.15) || !head ? [] : [head]));
        current = to;
      }
      if (current === "ready" && chance(0.25)) {
        // Concurrent terminal pair — the contested MVR case.
        emit(edge(orderId, lineId, "served", ["ready"], head ? [head] : []));
        emit(edge(orderId, lineId, "voided", ["ready"], head ? [head] : []));
      } else if (chance(0.35)) {
        const to = current === "ready" && chance(0.5) ? "served" : "voided";
        emit(edge(orderId, lineId, to, [current], head ? [head] : []));
      }
      if (chance(0.15)) emit(edge(orderId, lineId, "ready", ["placed"], [])); // payload-illegal edge
    }

    for (let c = int(0, 2); c > 0; c--) emit(confirmed(orderId));
    if (chance(0.5)) emit(kot(orderId));

    if (chance(0.6)) {
      const first = emit(tableAssigned(orderId, `T${int(4, 6)}`, { supersedes: [createdId] }));
      const followUp = int(0, 2); // 0 = none, 1 = supersession chain, 2 = concurrent pair
      if (followUp === 1) emit(tableAssigned(orderId, `T${int(7, 9)}`, { supersedes: [first] }));
      else if (followUp === 2)
        emit(tableAssigned(orderId, `T${int(7, 9)}`, { supersedes: [createdId] }));
    }

    const parentAttempts: Array<{ attempt: string; amount: number }> = [];
    for (let p = int(0, 2); p > 0; p--) {
      const attempt = nextAttempt();
      const amount = int(1, 6) * 100;
      const pay = payment(orderId, amount, { attempt });
      emit(pay);
      parentAttempts.push({ attempt, amount });
      if (chance(0.25)) emit(payment(orderId, amount, { attempt })); // intent duplicate (new envelope id)
      if (chance(0.15)) emit(payment(orderId, amount + 100, { attempt })); // divergent member → disputed
    }
    if (chance(0.2))
      emit(
        payment(orderId, int(1, 4) * 100, { attempt: nextAttempt(), purpose: "repays_receivable" }),
      );
    for (const parent of parentAttempts) {
      if (chance(0.3))
        emit(refund(orderId, int(0, 3) * 100, { attempt: nextAttempt(), parent: parent.attempt }));
    }
    if (chance(0.4)) emit(settlementClosed(orderId));
  }

  // Permanent orphan: a confirm whose order.created never exists in the set.
  if (chance(0.3)) emit(confirmed("O-ghost"));

  return { identity: own, envelopes };
};
