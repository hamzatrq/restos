// Fold engine v1 (T-01-04): the two FOLDS.md folds — `open_orders` and
// `kitchen_queue` — computed as a pure function of the stored event set (01-F6).
// Fold state is DEFINED as replay of the set in the canonical total order
// key(e) = (global_seq ?? +Inf, device_created_at, device_id, lamport_seq): arrival
// order never matters (01-N1), and once every competitor carries a global_seq this
// is exactly cloud order — devices converge on ack (01-F34). An event whose typed
// parent is unseen parks and drains on arrival, cascading to fixpoint — never
// crashed, never dropped (01-F10). Every line transition routes through the domain
// `applyLineState` machine; non-applied results are retained as per-line anomalies,
// never applied (01-F35). Recompute-per-write over incremental deltas is the
// implementation choice the contract permits: the law is equivalence with canonical
// replay, and `refold()` is definitionally identical to it.
import {
  applyLineState,
  type EventEnvelopeT,
  type KnownEventType,
  type OrderLineState,
  type ParsedEvent,
  parseEvent,
} from "@restos/domain";

/** A stored envelope plus its cloud order from the sidecar, when assigned (01-F3). */
export type FoldInput = { envelope: EventEnvelopeT; global_seq: number | null };

/** `orders` row — exactly FOLDS.md `open_orders`. */
export type OpenOrderRow = {
  order_id: string;
  channel: string;
  order_type: string | null;
  table_id: string | null;
  confirmed_at: number | null;
  settled: number;
  json_lines: string;
};

/** `queue` row — exactly FOLDS.md `kitchen_queue`. */
export type KitchenQueueRow = {
  order_id: string;
  confirm_at: number;
  channel: string;
  age_basis: number;
  lines_ready: number;
  lines_total: number;
};

/** `parked` row — exactly FOLDS.md (01-F10). */
export type ParkedRow = { event_id: string; waiting_for: string; envelope_json: string };

export type FoldState = {
  orders: OpenOrderRow[];
  queue: KitchenQueueRow[];
  parked: ParkedRow[];
};

/** Canonical JSON: object keys sorted lexicographically at every depth, no
 * insignificant whitespace — determinism assertions compare byte-for-byte. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

// Typed read-side views of registry-validated payloads. The schemas live ONLY in
// @restos/domain (18 §2) and `parseEvent` has already enforced them before an
// envelope reaches the fold layer (01-F4) — these narrow `unknown` for the fold.
type OrderCreatedP = { order_id: string; channel: string; order_type?: string; table_id?: string };
type OrderRefP = { order_id: string };
type LineAddedP = {
  order_id: string;
  line_id: string;
  item_id: string;
  qty: number;
  unit_price_paisa: number;
};
type TableAssignedP = { order_id: string; table_id: string };
type LineStateChangedP = { order_id: string; line_ids: string[]; state: OrderLineState };
type PaymentRecordedP = { order_id: string; amount_paisa: number };
type PaymentRefundedP = { payment_id: string; amount_paisa: number };

type LineCell = {
  item_id: string;
  qty: number;
  unit_price_paisa: number;
  state: OrderLineState;
  anomalies: Record<string, string>;
};

type OrderAcc = {
  order_id: string;
  channel: string;
  order_type: string | null;
  created_table_id: string | null;
  assigned_table_id: string | null;
  confirmed_at: number | null;
  kot_at: number | null;
  lines: Map<string, LineCell>;
  pay_total: number;
  refund_total: number;
};

type Keyed = { gseq: number; event: ParsedEvent };

const cmp = (a: number | string, b: number | string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The determinism anchor: lexicographic (global_seq ?? +Inf, device_created_at,
 * device_id, lamport_seq). Comparison-based — Infinity−Infinity is NaN. */
const byCanonicalOrder = (a: Keyed, b: Keyed): number =>
  cmp(a.gseq, b.gseq) ||
  cmp(a.event.envelope.device_created_at, b.event.envelope.device_created_at) ||
  cmp(a.event.envelope.device_id, b.event.envelope.device_id) ||
  cmp(a.event.envelope.lamport_seq, b.event.envelope.lamport_seq);

const READY_STATES: ReadonlySet<OrderLineState> = new Set([
  "ready",
  "served",
  "picked_up",
  "delivered",
]);
const EXITED_STATES: ReadonlySet<OrderLineState> = new Set(["voided", "cancelled"]);

/**
 * Canonical replay with parking: iterate the set in canonical order; an event with
 * an unmet typed dependency parks (`waiting_for` = the first unmet id — order id,
 * then lowest missing line id, then payment event id); every application drains the
 * parked list in canonical order to fixpoint (01-F10). Events of the same type for
 * the same parent share their dependency set, so they always apply in canonical
 * relative order — first-wins and last-wins fields need no extra bookkeeping.
 */
export const replay = (inputs: readonly FoldInput[]): FoldState => {
  const sorted: Keyed[] = inputs
    .map((input) => ({
      gseq: input.global_seq ?? Number.POSITIVE_INFINITY,
      event: parseEvent(input.envelope),
    }))
    .sort(byCanonicalOrder);

  const orders = new Map<string, OrderAcc>();
  /** Applied payment.recorded envelope id → its order acc (refund attribution, 01-F29). */
  const appliedPayments = new Map<string, OrderAcc>();

  /** Applies the event and returns null, or returns the first unmet dependency id. */
  const attempt = (event: ParsedEvent): string | null => {
    const env = event.envelope;
    const type: KnownEventType = event.type;
    switch (type) {
      case "order.created": {
        const p = event.payload as OrderCreatedP;
        // Canonically-first create wins; later duplicates are no-ops (01-F19 pattern).
        if (!orders.has(p.order_id)) {
          orders.set(p.order_id, {
            order_id: p.order_id,
            channel: p.channel,
            order_type: p.order_type ?? null,
            created_table_id: p.table_id ?? null,
            assigned_table_id: null,
            confirmed_at: null,
            kot_at: null,
            lines: new Map(),
            pay_total: 0,
            refund_total: 0,
          });
        }
        return null;
      }
      case "order.confirmed": {
        const p = event.payload as OrderRefP;
        const acc = orders.get(p.order_id);
        if (!acc) return p.order_id;
        // Canonically-first confirm anchors confirmed_at; later confirms are no-ops.
        if (acc.confirmed_at === null) acc.confirmed_at = env.device_created_at;
        return null;
      }
      case "kot.printed": {
        const p = event.payload as OrderRefP;
        const acc = orders.get(p.order_id);
        if (!acc) return p.order_id;
        // Canonically-first ticket print anchors kitchen age (doc 03 refines).
        if (acc.kot_at === null) acc.kot_at = env.device_created_at;
        return null;
      }
      case "order.table_assigned": {
        const p = event.payload as TableAssignedP;
        const acc = orders.get(p.order_id);
        if (!acc) return p.order_id;
        // Canonically-LAST assignment wins — the 01-F34 order-sensitive field.
        acc.assigned_table_id = p.table_id;
        return null;
      }
      case "order.line_added": {
        const p = event.payload as LineAddedP;
        const acc = orders.get(p.order_id);
        if (!acc) return p.order_id;
        // Duplicate line_id: canonically-first wins. Concurrent DIFFERENT lines both
        // stand (01-F16); price is the line-add snapshot, never re-derived (01-F18).
        if (!acc.lines.has(p.line_id)) {
          acc.lines.set(p.line_id, {
            item_id: p.item_id,
            qty: p.qty,
            unit_price_paisa: p.unit_price_paisa,
            state: "placed",
            anomalies: {},
          });
        }
        return null;
      }
      case "order.line_state_changed": {
        const p = event.payload as LineStateChangedP;
        const acc = orders.get(p.order_id);
        if (!acc) return p.order_id;
        // Duplicate line_ids within one event are deduped before applying — an
        // event whose transition applies must never self-flag an anomaly from its
        // own duplicate entry (amended contract, 01-F35).
        const cells: LineCell[] = [];
        const missing: string[] = [];
        for (const lineId of new Set(p.line_ids)) {
          const cell = acc.lines.get(lineId);
          if (cell === undefined) missing.push(lineId);
          else cells.push(cell);
        }
        const firstMissing = missing.sort()[0];
        if (firstMissing !== undefined) return firstMissing;
        for (const cell of cells) {
          const result = applyLineState(cell.state, p.state);
          if (result.applied) cell.state = result.state;
          // Non-applied transitions are retained + flagged on the line; the ledger
          // row is untouched (01-F35 — folds never regress).
          if (result.anomaly !== undefined) cell.anomalies[env.id] = result.anomaly;
        }
        return null;
      }
      case "payment.recorded": {
        const p = event.payload as PaymentRecordedP;
        const acc = orders.get(p.order_id);
        if (!acc) return p.order_id;
        acc.pay_total += p.amount_paisa; // integer paisas only (00 §6)
        appliedPayments.set(env.id, acc); // resolves this EVENT id for refunds (01-F29)
        return null;
      }
      case "payment.refunded": {
        const p = event.payload as PaymentRefundedP;
        const acc = appliedPayments.get(p.payment_id);
        if (!acc) return p.payment_id;
        acc.refund_total += p.amount_paisa;
        return null;
      }
    }
  };

  /** Always in canonical order: main-loop parks append in canonical position and
   * drain passes preserve relative order. */
  const parked: { entry: Keyed; waiting: string }[] = [];

  // Re-attempt parked events in canonical order after every application; still-unmet
  // ones re-park under their new waiting_for; cascades (refund → payment → order)
  // run to fixpoint — each pass applies at least one event or stops (01-F10).
  const drain = (): void => {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const remaining: { entry: Keyed; waiting: string }[] = [];
      for (const p of parked) {
        const waiting = attempt(p.entry.event);
        if (waiting === null) progressed = true;
        else remaining.push({ entry: p.entry, waiting });
      }
      parked.length = 0;
      parked.push(...remaining);
    }
  };

  for (const keyed of sorted) {
    const waiting = attempt(keyed.event);
    if (waiting === null) drain();
    else parked.push({ entry: keyed, waiting });
  }

  const orderRows: OpenOrderRow[] = [];
  const queueRows: KitchenQueueRow[] = [];
  for (const acc of orders.values()) {
    let billed_effective = 0;
    let lines_total = 0;
    let lines_ready = 0;
    const linesObject: Record<string, LineCell> = {};
    for (const [lineId, cell] of acc.lines) {
      linesObject[lineId] = cell;
      if (!EXITED_STATES.has(cell.state)) {
        billed_effective += cell.qty * cell.unit_price_paisa;
        lines_total += 1;
      }
      if (READY_STATES.has(cell.state)) lines_ready += 1;
    }
    // v1 approximation of 01-F30: exact cover over surviving lines; void/comp/
    // discount value terms land with their event types (contract: deferred).
    const settled =
      billed_effective > 0 && acc.pay_total - acc.refund_total === billed_effective ? 1 : 0;
    orderRows.push({
      order_id: acc.order_id,
      channel: acc.channel,
      order_type: acc.order_type,
      table_id: acc.assigned_table_id ?? acc.created_table_id,
      confirmed_at: acc.confirmed_at,
      settled,
      json_lines: canonicalJson(linesObject),
    });
    // A queue row exists iff a canonically-applied order.confirmed exists; kitchen
    // age runs from the first ticket print when one exists (03-F19/F24 feed).
    if (acc.confirmed_at !== null) {
      queueRows.push({
        order_id: acc.order_id,
        confirm_at: acc.confirmed_at,
        channel: acc.channel,
        age_basis: acc.kot_at ?? acc.confirmed_at,
        lines_ready,
        lines_total,
      });
    }
  }

  // Nothing is ever dropped: every stored consumed-type envelope is applied ∪ parked.
  const parkedRows: ParkedRow[] = parked.map((p) => ({
    event_id: p.entry.event.envelope.id,
    waiting_for: p.waiting,
    envelope_json: canonicalJson(p.entry.event.envelope),
  }));

  return { orders: orderRows, queue: queueRows, parked: parkedRows };
};
