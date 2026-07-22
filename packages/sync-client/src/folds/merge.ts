// The merge-semantics fold engine (T-01-15; implements rewritten 01-F34 / specs/26
// / plans/wave-0/merge-semantics-matrix.md). Replaces the universal-comparator
// engine: every projected field declares its own merge rule — G-Set/G-Map union,
// unique-keyed sum over 01-F31 attempt keys, monotone facts, supersedes-DAG
// head-sets with MATERIALIZED tombstones, and explicitly rendered contested sets.
// Fold state is a pure function of the delivered event SET: the engine reads NO
// ordering metadata — no global_seq, no lamport_seq, no device clock, no id
// comparison — property-pinned by the bijective-relabel + injection invariance
// oracle (merge-invariance.test.ts). The one sanctioned exception (contract ruling
// C1): the confirm ANCHOR's time value keeps `device_created_at` stamping until
// DEC-TIME-001 — anchor SELECTION is clock-free (argmin over (payloadHash, id),
// matrix row 57; the id read is identity-plus-anchor-selection, the branch the
// matrix explicitly sanctions), only the stamped VALUE reads the clock.
//
// Parking is by KEY-PRESENCE (01-F10 amended): an event carrying its full
// projection keys never parks — payments/refunds/line edges/assignments/closes
// contribute to self-keyed lattices held per order key. Only the bare order-fact
// types (`order.confirmed`, `kot.printed`) park while their order key is absent,
// indexed by `waiting_for`, so a drain touches only the events awaiting the
// newly-arrived key (26 §4 defect 2 removed structurally).
import {
  applyLineState,
  CONTESTED_LINE_BILLABLE,
  canonicalJson,
  type KnownEventType,
  ORDER_LINE_STATES,
  type OrderLineState,
  type ParsedEvent,
  payloadHash,
  TERMINAL_LINE_STATES,
} from "@restos/domain";

/** `orders` row — the T-01-15 pinned 15-key projection (merge-builders header, C8). */
export type OpenOrderRow = {
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

/** `queue` row — the pinned 6-key kitchen projection (row exists iff confirmed). */
export type KitchenQueueRow = {
  order_id: string;
  confirm_at: number;
  channel: string;
  age_basis: number;
  lines_ready: number;
  lines_total: number;
};

/** `parked` row (01-F10) — membership + drain are pinned; waiting_for = the order key. */
export type ParkedRow = { event_id: string; waiting_for: string; envelope_json: string };

/** The T-01-14→T-01-15 work-counter mandate: events_folded is the real quantity —
 * row writes are a proxy an O(N) implementation could game. */
export type FoldStats = {
  full_rebuilds: number;
  scoped_rebuilds: number;
  events_folded: number;
};

export type FoldState = {
  orders: OpenOrderRow[];
  queue: KitchenQueueRow[];
  parked: ParkedRow[];
};

export type ProjectedOrder = { order: OpenOrderRow; queue: KitchenQueueRow | null };

/** What one applied event changed — the store's targeted-write contract. */
export type ApplyResult = {
  /** Orders whose projection must be rewritten (scoped, never the ledger). */
  dirty: readonly string[];
  /** Parked row to insert (the event itself parked), or null. */
  parked: ParkedRow | null;
  /** Parked event ids drained (applied) by this delivery. */
  drained: readonly string[];
};

// Re-export the single declared-once serializer (18 §2) for consumers that
// previously reached it through the fold module.
export { canonicalJson } from "@restos/domain";

// ---------------------------------------------------------------------------
// Typed read-side views of registry-validated payloads (schemas live ONLY in
// @restos/domain, 18 §2; parseEvent has already enforced them, 01-F4).
// ---------------------------------------------------------------------------
type OrderRefP = { order_id: string };
type CreatedP = { order_id: string; channel: string; order_type?: string; table_id?: string };
type LineAddedP = {
  order_id: string;
  line_id: string;
  item_id: string;
  qty: number;
  unit_price_paisa: number;
};
type TableAssignedP = {
  order_id: string;
  table_id: string;
  supersedes: string[];
  from_table_id: string | null;
};
type LineCtx = { to: OrderLineState; from_states: OrderLineState[]; preds: string[] };
type LineStateChangedP = { order_id: string; line_context: Record<string, LineCtx> };
type PaymentP = { order_id: string; settlement_attempt_id: string };
type ClosedP = { order_id: string; billed_paisa?: unknown };

type LineValue = { item_id: string; qty: number; unit_price_paisa: number };
type Edge = {
  event_id: string;
  to: string;
  from_states: readonly string[];
  preds: readonly string[];
};

/** One order's whole merge lattice — every structure below is grow-only under
 * delivery; shrink is only the outer-layer key-set drop (retention). */
type Entity = {
  order_id: string;
  /** Value-deduped order.created payloads (canonical bytes → payload) — MVR. */
  createMembers: Map<string, Record<string, unknown>>;
  /** Assignment-DAG nodes: event id → table value (creates root with table_id ?? null). */
  nodes: Map<string, string | null>;
  /** MATERIALIZED tombstones — union of every delivered `supersedes` (Addendum-B). */
  tombstones: Set<string>;
  /** Confirm G-Set: event id → { stamp (C1 value layer), hash (anchor selection) }. */
  confirms: Map<string, { stamp: number; hash: string }>;
  /** settlement_closed G-Set: event id → payload (settled = non-emptiness, 01-F33). */
  closes: Map<string, Record<string, unknown>>;
  /** Per-line value MVR: line id → (canonical bytes → {item, qty, price}). */
  lineValues: Map<string, Map<string, LineValue>>;
  /** Per-line edge G-Set: line id → (event id → edge). Held unconditionally. */
  lineEdges: Map<string, Map<string, Edge>>;
  /** UKS: attempt id → (canonical member bytes → member); member = payload minus its key. */
  pay: Map<string, Map<string, Record<string, unknown>>>;
  refund: Map<string, Map<string, Record<string, unknown>>>;
};

const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_LINE_STATES);
const EXITED: ReadonlySet<string> = new Set(["voided", "cancelled"]);
/** The non-terminal total chain placed ≺ confirmed ≺ in_prep ≺ ready ≺ picked_up —
 * restricted to non-terminals the vocabulary is a chain, so ≼-max is a genuine
 * join and no tie rule exists (matrix row 62). */
const NONTERMINAL_CHAIN: readonly string[] = ORDER_LINE_STATES.filter((s) => !TERMINAL.has(s));
const READY_IDX = NONTERMINAL_CHAIN.indexOf("ready");
const stateIdx = (s: string): number => (ORDER_LINE_STATES as readonly string[]).indexOf(s);
/** UTF-16 code-unit comparator. Only ever applied to arrays of DISTINCT members
 * (Set spreads / Map keys), so the equal case cannot occur. */
const utf16 = (a: string, b: string): number => (a < b ? -1 : 1);

/** Legality is a pure function of ONE edge's own payload — never of comparator
 * position — which is why illegal_transition can never be recomputed away
 * (matrix row 65). Adoption clause: |from_states| > 1 ∧ to ∈ from_states is a
 * choice among already-emitted terminals, not a transition (matrix row 64). */
const edgeLegal = (ed: Edge): boolean => {
  if (ed.from_states.length > 1 && ed.from_states.includes(ed.to)) return true;
  return ed.from_states.every(
    (f) => applyLineState(f as OrderLineState, ed.to as OrderLineState).applied,
  );
};

type LineProjection = {
  states: string[];
  anomalies: Record<string, string>;
  terminalCount: number;
  cookingDone: boolean;
};

/** Pure function of the line's edge set: ≼-max over ALL legal edges (never over
 * heads — Addendum-C), terminal contest as a rendered MVR set in
 * ORDER_LINE_STATES index order, anomaly priority illegal_transition >
 * inconsistent_predecessor > terminal_regression. */
const projectLine = (edgesById: ReadonlyMap<string, Edge> | undefined): LineProjection => {
  const edges = edgesById ? [...edgesById.values()] : [];
  const legal = edges.filter(edgeLegal);
  // heads() by set difference over preds — retirement is the ONLY thing preds do.
  const retired = new Set<string>();
  for (const ed of legal) for (const p of ed.preds) retired.add(p);
  const heads = legal.filter((ed) => !retired.has(ed.event_id));
  // ≼-max over ALL legal non-terminal edges (a legal edge can retire a higher
  // head; max-over-heads would break monotonicity — Addendum-C).
  let wm = 0;
  for (const ed of legal) {
    if (TERMINAL.has(ed.to)) continue;
    const i = NONTERMINAL_CHAIN.indexOf(ed.to);
    if (i > wm) wm = i;
  }
  const terminalValues = [
    ...new Set(heads.filter((h) => TERMINAL.has(h.to)).map((h) => h.to)),
  ].sort((a, b) => stateIdx(a) - stateIdx(b));
  const anomalies: Record<string, string> = {};
  for (const ed of edges) {
    if (!edgeLegal(ed)) anomalies[ed.event_id] = "illegal_transition";
  }
  const byId = new Map(edges.map((ed) => [ed.event_id, ed]));
  // Legal edges cannot already be marked (only illegal edges are, above) — the
  // illegal > inconsistent_predecessor priority holds by construction.
  for (const ed of legal) {
    for (const p of ed.preds) {
      const pe = byId.get(p);
      // Only when BOTH edges are present (matrix row 65).
      if (pe && !ed.from_states.includes(pe.to)) {
        anomalies[ed.event_id] = "inconsistent_predecessor";
        break;
      }
    }
  }
  // Terminal absorption: a non-terminal head coexisting with a terminal head is
  // retained + flagged (01-F35).
  if (terminalValues.length > 0) {
    for (const h of heads) {
      if (!TERMINAL.has(h.to) && anomalies[h.event_id] === undefined)
        anomalies[h.event_id] = "terminal_regression";
    }
  }
  const watermark = NONTERMINAL_CHAIN[wm] as string;
  const states = terminalValues.length > 0 ? terminalValues : [watermark];
  // Cooking-done: ANY terminal head (contested included — zombie-tickets CE) or
  // watermark ≥ ready (picked_up included — Addendum-C).
  const cookingDone = terminalValues.length > 0 || wm >= READY_IDX;
  return { states, anomalies, terminalCount: terminalValues.length, cookingDone };
};

export type MergeEngine = {
  /** Fold one newly-stored event into the lattice (or park it); returns the
   * targeted writes. Never called for duplicates or ordering adoptions —
   * `global_seq` adoption is a sidecar write with ZERO fold work (01-F34). */
  apply(event: ParsedEvent): ApplyResult;
  /** Full replay of the stored set (reopen self-heal / refold; delivery order
   * of the set is irrelevant — the fold is a pure function of the set). */
  rebuild(events: readonly ParsedEvent[]): void;
  /** One order's projected rows (null when the order has no delivered create). */
  projectOrder(orderId: string): ProjectedOrder | null;
  /** Every fold row, for a full table rewrite after rebuild(). */
  snapshot(): FoldState;
  parkedRows(): ParkedRow[];
  stats(): FoldStats;
  /** Throws unless every key is well-formed and droppable (open-bill guard). */
  validateDrop(keys: readonly string[]): void;
  /** Atomic per-entity shrink — never an inverse merge (matrix conventions). */
  drop(keys: readonly string[]): {
    removedOrders: readonly string[];
    dirtyOrders: readonly string[];
    removedParkedIds: readonly string[];
  };
};

/** The bare order-fact types that park while their order key is absent (01-F10
 * amended: everything else carries its full projection keys and never parks). */
const PARKING_TYPES: ReadonlySet<string> = new Set(["order.confirmed", "kot.printed"]);

type DropKey =
  | { kind: "order"; order_id: string }
  | { kind: "line"; order_id: string; line_id: string };

/** Key literals are internal (`order:<id>` / `line:<order>:<line>`, matrix §3
 * compound-key default). A malformed key parses to a nonexistent order and the
 * open-bill guard rejects it loudly — no separate well-formedness branch. */
const parseDropKey = (key: string): DropKey => {
  if (key.startsWith("order:")) return { kind: "order", order_id: key.slice("order:".length) };
  const rest = key.slice("line:".length);
  const cut = rest.indexOf(":");
  return { kind: "line", order_id: rest.slice(0, cut), line_id: rest.slice(cut + 1) };
};

export const createMergeEngine = (): MergeEngine => {
  let entities = new Map<string, Entity>();
  /** Parked events indexed by the awaited key — the drain touches ONLY these. */
  let parkedByKey = new Map<string, Map<string, ParsedEvent>>();
  let parkedRowsById = new Map<string, ParkedRow>();
  const counters: FoldStats = { full_rebuilds: 0, scoped_rebuilds: 0, events_folded: 0 };

  const entity = (orderId: string): Entity => {
    const existing = entities.get(orderId);
    if (existing) return existing;
    const fresh: Entity = {
      order_id: orderId,
      createMembers: new Map(),
      nodes: new Map(),
      tombstones: new Set(),
      confirms: new Map(),
      closes: new Map(),
      lineValues: new Map(),
      lineEdges: new Map(),
      pay: new Map(),
      refund: new Map(),
    };
    entities.set(orderId, fresh);
    return fresh;
  };

  const sub = <K, V>(m: Map<K, V>, k: K, mk: () => V): V => {
    const existing = m.get(k);
    if (existing !== undefined) return existing;
    const fresh = mk();
    m.set(k, fresh);
    return fresh;
  };

  /** Fold one event into its entity lattice. Every branch is a union/insert —
   * commutative and idempotent by construction. */
  const foldIn = (event: ParsedEvent, dirty: Set<string>): void => {
    counters.events_folded += 1;
    const env = event.envelope;
    const type: KnownEventType = event.type;
    switch (type) {
      case "order.created": {
        const p = event.payload as CreatedP;
        const e = entity(p.order_id);
        e.createMembers.set(canonicalJson(event.payload), event.payload as Record<string, unknown>);
        // The creation is the assignment DAG's root node (Addendum-B: a legal
        // supersedes target); a table-less creation contributes no head value.
        e.nodes.set(env.id, p.table_id ?? null);
        dirty.add(p.order_id);
        return;
      }
      case "order.confirmed": {
        const p = event.payload as OrderRefP;
        const e = entity(p.order_id);
        // Monotone OR fact + the C1 value layer: stamp kept for the anchor,
        // selection is clock-free (payloadHash, then event id — matrix row 57).
        e.confirms.set(env.id, {
          stamp: env.device_created_at,
          hash: payloadHash(event.payload),
        });
        dirty.add(p.order_id);
        return;
      }
      case "kot.printed": {
        // Consumed but projection-inert under the ratified matrix: age_basis is
        // the confirm anchor (the kot fallback is DELETED, rows 59/60), and the
        // per-printer print-fact G-Map needs a printer_id the payload does not
        // carry yet (doc-03 work).
        return;
      }
      case "order.table_assigned": {
        const p = event.payload as TableAssignedP;
        const e = entity(p.order_id);
        e.nodes.set(env.id, p.table_id);
        for (const id of p.supersedes) e.tombstones.add(id);
        dirty.add(p.order_id);
        return;
      }
      case "order.line_added": {
        const p = event.payload as LineAddedP;
        const e = entity(p.order_id);
        const value: LineValue = {
          item_id: p.item_id,
          qty: p.qty,
          unit_price_paisa: p.unit_price_paisa,
        };
        sub(e.lineValues, p.line_id, () => new Map<string, LineValue>()).set(
          canonicalJson(value),
          value,
        );
        dirty.add(p.order_id);
        return;
      }
      case "order.line_state_changed": {
        const p = event.payload as LineStateChangedP;
        const e = entity(p.order_id);
        for (const [lineId, ctx] of Object.entries(p.line_context)) {
          sub(e.lineEdges, lineId, () => new Map<string, Edge>()).set(env.id, {
            event_id: env.id,
            to: ctx.to,
            from_states: [...ctx.from_states],
            preds: [...ctx.preds],
          });
        }
        dirty.add(p.order_id);
        return;
      }
      case "payment.recorded":
      case "payment.refunded": {
        const p = event.payload as PaymentP;
        const e = entity(p.order_id);
        // The member is the WHOLE payload minus its attempt key (whole-payload
        // immutability, Addendum-A): ANY divergence disputes the key.
        const { settlement_attempt_id: _key, ...member } = event.payload as Record<string, unknown>;
        const cells = type === "payment.recorded" ? e.pay : e.refund;
        sub(cells, p.settlement_attempt_id, () => new Map<string, Record<string, unknown>>()).set(
          canonicalJson(member),
          member,
        );
        dirty.add(p.order_id);
        return;
      }
      case "order.settlement_closed": {
        const p = event.payload as ClosedP;
        const e = entity(p.order_id);
        e.closes.set(env.id, event.payload as Record<string, unknown>);
        dirty.add(p.order_id);
        return;
      }
    }
  };

  const apply = (event: ParsedEvent): ApplyResult => {
    const payload = event.payload as OrderRefP;
    const orderId = payload.order_id;
    const dirty = new Set<string>();
    // Key-presence parking (01-F10): bare order facts wait for their order key.
    if (PARKING_TYPES.has(event.type) && (entities.get(orderId)?.createMembers.size ?? 0) === 0) {
      const row: ParkedRow = {
        event_id: event.envelope.id,
        waiting_for: orderId,
        envelope_json: canonicalJson(event.envelope),
      };
      sub(parkedByKey, orderId, () => new Map<string, ParsedEvent>()).set(event.envelope.id, event);
      parkedRowsById.set(event.envelope.id, row);
      return { dirty: [], parked: row, drained: [] };
    }
    foldIn(event, dirty);
    // Drain: an applied create makes the order key present — re-attempt ONLY the
    // events waiting on that key (waiting_for-indexed; 26 §4 defect 2).
    const drained: string[] = [];
    if (event.type === "order.created") {
      for (const [eventId, parkedEvent] of takeParkedFor(orderId)) {
        foldIn(parkedEvent, dirty);
        drained.push(eventId);
      }
    }
    return { dirty: [...dirty], parked: null, drained };
  };

  /** Remove and return the parked entries waiting on a key (shared by the create
   * drain and the retention drop — one branch site for both). */
  const takeParkedFor = (orderId: string): [string, ParsedEvent][] => {
    const waiting = parkedByKey.get(orderId);
    if (!waiting) return [];
    parkedByKey.delete(orderId);
    const out: [string, ParsedEvent][] = [];
    for (const [eventId, parkedEvent] of waiting) {
      parkedRowsById.delete(eventId);
      out.push([eventId, parkedEvent]);
    }
    return out;
  };

  /** One order's projection — a pure function of its lattice. */
  const projectEntity = (e: Entity): ProjectedOrder | null => {
    if (e.createMembers.size === 0) return null; // row existence is the create G-Set
    // Identity register: MVR over creates, default = min-payloadHash member
    // (matrix row 52 — a clock-free default, never a sequence pick).
    let register: Record<string, unknown> | null = null;
    let registerHash: string | null = null;
    for (const member of e.createMembers.values()) {
      const h = payloadHash(member);
      if (registerHash === null || h < registerHash) {
        registerHash = h;
        register = member;
      }
    }
    const reg = register as Record<string, unknown>;
    const channel = reg.channel as string;
    const orderType = (reg.order_type as string | undefined) ?? null;
    // Confirm anchor: set-wise argmin over (payloadHash, event id) — matrix row
    // 57's mixed-epoch branch; the VALUE keeps device_created_at stamping (C1).
    let anchor: { stamp: number; hash: string; id: string } | null = null;
    for (const [id, c] of e.confirms) {
      if (anchor === null || c.hash < anchor.hash || (c.hash === anchor.hash && id < anchor.id))
        anchor = { stamp: c.stamp, hash: c.hash, id };
    }
    // Table anchor: distinct head VALUES of the supersedes-DAG (value-equality
    // auto-clears), UTF-16 sorted; conflict = |distinct values| > 1.
    const headValues = new Set<string>();
    for (const [id, value] of e.nodes) {
      if (value !== null && !e.tombstones.has(id)) headValues.add(value);
    }
    const tableIds = [...headValues].sort(utf16);
    // Money: UKS — Σ over agreed members only; a disputed key contributes ZERO
    // to every total and is rendered, never picked (01-F31).
    const exceptions = new Set<string>();
    if (e.createMembers.size > 1) exceptions.add("order_identity_conflict");
    let payTotal = 0;
    let repaidTotal = 0;
    let refundTotal = 0;
    const payAttempts: Record<string, Record<string, unknown>[]> = {};
    const refundAttempts: Record<string, Record<string, unknown>[]> = {};
    const agreedRefundsByParent = new Map<string, number>();
    for (const [attempt, cell] of e.pay) {
      const members = [...cell.keys()]
        .sort(utf16)
        .map((k) => cell.get(k) as Record<string, unknown>);
      payAttempts[attempt] = members;
      if (cell.size === 1) {
        const m = members[0] as Record<string, unknown>;
        if (m.purpose === "repays_receivable") repaidTotal += m.amount_paisa as number;
        else payTotal += m.amount_paisa as number;
      } else exceptions.add("attempt_divergence");
    }
    for (const [attempt, cell] of e.refund) {
      const members = [...cell.keys()]
        .sort(utf16)
        .map((k) => cell.get(k) as Record<string, unknown>);
      refundAttempts[attempt] = members;
      if (cell.size === 1) {
        const m = members[0] as Record<string, unknown>;
        refundTotal += m.amount_paisa as number;
        const parent = m.payment_attempt_id as string;
        agreedRefundsByParent.set(
          parent,
          (agreedRefundsByParent.get(parent) ?? 0) + (m.amount_paisa as number),
        );
      } else exceptions.add("attempt_divergence");
    }
    // 01-F29 cap: a SET predicate over agreed refunds grouped by the parent's
    // attempt id (Addendum-A — envelope-id keying fragments the cap). A missing
    // or disputed parent rests at unknown, never violated.
    let capViolated = 0;
    for (const [parent, refunded] of agreedRefundsByParent) {
      const parentCell = e.pay.get(parent);
      if (parentCell && parentCell.size === 1) {
        const pm = [...parentCell.values()][0] as Record<string, unknown>;
        if (refunded > (pm.amount_paisa as number)) capViolated = 1;
      }
    }
    // Lines: value MVR + edge-set workflow projection.
    const cells: Record<
      string,
      LineValue & { states: string[]; anomalies: Record<string, string> }
    > = {};
    let billedEffective = 0;
    let linesTotal = 0;
    let linesReady = 0;
    for (const [lineId, values] of e.lineValues) {
      let value: LineValue | null = null;
      let valueHash: string | null = null;
      for (const member of values.values()) {
        const h = payloadHash(member);
        if (valueHash === null || h < valueHash) {
          valueHash = h;
          value = member;
        }
      }
      if (values.size > 1) exceptions.add("line_value_conflict");
      const v = value as LineValue;
      const lp = projectLine(e.lineEdges.get(lineId));
      cells[lineId] = { ...v, states: lp.states, anomalies: lp.anomalies };
      const decidedExited = lp.states.length === 1 && EXITED.has(lp.states[0] as string);
      if (decidedExited) continue;
      linesTotal += 1;
      if (lp.cookingDone) linesReady += 1;
      // Branchless policy application: the DECISION PENDING constant zeroes the
      // contribution of a contested line iff the founder flips it (matrix §5.4).
      const billable = lp.terminalCount < 2 || CONTESTED_LINE_BILLABLE;
      billedEffective += v.qty * v.unit_price_paisa * Number(billable);
    }
    // 01-F33: settlement is an ACT (monotone OR over the close G-Set); a late
    // line-add never reopens — it raises uncovered_addition. Implementer-proposed
    // trigger (flagged in the T-01-15 report): billed_effective exceeding the
    // largest carried billed snapshot among the delivered closes (a snapshot-less
    // close counts 0 — any close raises the ceiling to ≥ 0).
    const settled = e.closes.size > 0 ? 1 : 0;
    if (settled === 1) {
      let ceiling = -1;
      for (const close of e.closes.values()) {
        const snap = (close as ClosedP).billed_paisa;
        const value = typeof snap === "number" ? snap : 0;
        if (value > ceiling) ceiling = value;
      }
      if (billedEffective > ceiling) exceptions.add("uncovered_addition");
    }
    const order: OpenOrderRow = {
      order_id: e.order_id,
      channel,
      order_type: orderType,
      confirmed_at: anchor?.stamp ?? null,
      settled,
      table_ids_json: canonicalJson(tableIds),
      table_conflict: tableIds.length > 1 ? 1 : 0,
      pay_total: payTotal,
      repaid_total: repaidTotal,
      refund_total: refundTotal,
      pay_attempts_json: canonicalJson(payAttempts),
      refund_attempts_json: canonicalJson(refundAttempts),
      cap_violated: capViolated,
      exceptions_json: canonicalJson([...exceptions].sort(utf16)),
      json_lines: canonicalJson(cells),
    };
    const queue: KitchenQueueRow | null = anchor
      ? {
          order_id: e.order_id,
          confirm_at: anchor.stamp,
          channel,
          age_basis: anchor.stamp, // = the confirm anchor; the kot fallback is deleted
          lines_ready: linesReady,
          lines_total: linesTotal,
        }
      : null;
    return { order, queue };
  };

  const projectOrder = (orderId: string): ProjectedOrder | null => {
    counters.scoped_rebuilds += 1;
    // Callers pass ids from dirty sets, so the entity always exists (foldIn and
    // drop create/keep it) — a miss would be an engine invariant violation.
    return projectEntity(entities.get(orderId) as Entity);
  };

  const rebuild = (events: readonly ParsedEvent[]): void => {
    counters.full_rebuilds += 1;
    entities = new Map();
    parkedByKey = new Map();
    parkedRowsById = new Map();
    // The fold is a pure function of the SET — replay order is irrelevant; the
    // key-presence park/drain machinery absorbs child-before-parent (01-F10).
    for (const event of events) apply(event);
  };

  const snapshot = (): FoldState => {
    const projections = [...entities.values()]
      .map(projectEntity)
      .filter((p): p is ProjectedOrder => p !== null);
    return {
      orders: projections.map((p) => p.order),
      queue: projections.map((p) => p.queue).filter((q): q is KitchenQueueRow => q !== null),
      parked: parkedRows(),
    };
  };

  const parkedRows = (): ParkedRow[] => [...parkedRowsById.values()];

  const validateDrop = (keys: readonly string[]): void => {
    for (const key of keys) {
      // Resolve through the get-or-create seam: an unknown key resolves to an
      // empty entity, whose zero closes fail the same guard (an empty entity
      // renders nothing, so the side effect is invisible).
      const e = entity(parseDropKey(key).order_id);
      // Open-bill guard: prune only ever removes CLOSED entities (01-F42/01-F17).
      if (e.closes.size === 0) {
        throw new Error(
          `retentionDrop of ${key}: the order has no settlement_closed — ` +
            "the open-bill guard forbids pruning an open entity (01-F42/01-F17; nothing changed)",
        );
      }
    }
  };

  const drop = (keys: readonly string[]) => {
    const removedOrders: string[] = [];
    const dirtyOrders: string[] = [];
    const removedParkedIds: string[] = [];
    for (const key of keys) {
      const parsed = parseDropKey(key);
      if (parsed.kind === "order") {
        entities.delete(parsed.order_id);
        removedOrders.push(parsed.order_id);
        for (const [eventId] of takeParkedFor(parsed.order_id)) removedParkedIds.push(eventId);
      } else {
        // validateDrop resolved the entity (get-or-create), so it exists here.
        const e = entities.get(parsed.order_id) as Entity;
        e.lineValues.delete(parsed.line_id);
        e.lineEdges.delete(parsed.line_id);
        dirtyOrders.push(parsed.order_id);
      }
    }
    return { removedOrders, dirtyOrders, removedParkedIds };
  };

  return {
    apply,
    rebuild,
    projectOrder,
    snapshot,
    parkedRows,
    stats: () => ({ ...counters }),
    validateDrop,
    drop,
  };
};
