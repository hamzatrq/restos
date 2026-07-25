// Canonical order-line states (01 §4). `settled` closes the money side and is
// deliberately NOT a line state. Terminal monotonicity per 01-F35.
export const ORDER_LINE_STATES = [
  "placed",
  "confirmed",
  "in_prep",
  "ready",
  "served",
  "picked_up",
  "delivered",
  "voided",
  "cancelled",
] as const;

export type OrderLineState = (typeof ORDER_LINE_STATES)[number];

export const TERMINAL_LINE_STATES = ["served", "delivered", "voided", "cancelled"] as const;

const TERMINAL: ReadonlySet<OrderLineState> = new Set(TERMINAL_LINE_STATES);

const EXITS = ["voided", "cancelled"] as const;
/**
 * The canonical transition table (01 §4), exported as the legality predicate the
 * merge-model fold consumes (T-01-15; 01-F34/01-F35): an edge's legality is a pure
 * function of its own payload (`from_states` → `to`), judged against this table —
 * never against comparator position. Terminals map to [] (01-F35).
 */
export const LEGAL_NEXT: Record<OrderLineState, readonly OrderLineState[]> = {
  placed: ["confirmed", ...EXITS],
  confirmed: ["in_prep", ...EXITS],
  in_prep: ["ready", ...EXITS],
  ready: ["served", "picked_up", ...EXITS],
  picked_up: ["delivered", ...EXITS],
  served: [],
  delivered: [],
  voided: [],
  cancelled: [],
};

export type LineStateResult = {
  state: OrderLineState;
  applied: boolean;
  anomaly?: "terminal_regression" | "illegal_transition";
};

/** Pure fold step (01-F34/F35): terminals never regress; illegal jumps never apply. */
export const applyLineState = (current: OrderLineState, next: OrderLineState): LineStateResult => {
  if (TERMINAL.has(current))
    return { state: current, applied: false, anomaly: "terminal_regression" };
  if (LEGAL_NEXT[current].includes(next)) return { state: next, applied: true };
  return { state: current, applied: false, anomaly: "illegal_transition" };
};
