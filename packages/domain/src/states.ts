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
  /**
   * `served` here is `DEC-HW-002` (August 2026, RULED) — the one row of this table that is not a
   * verbatim transcription of `01 §4`'s chain, so it is annotated rather than left to be
   * rediscovered as a typo.
   *
   * **In a restaurant with no pass, a line goes from being cooked to being handed over with no
   * observed moment of readiness.** `ready` is a state a *device* observes (`03-F24` assigns the
   * ready signal to a pass screen, a KDS or the counter), and `02-F31`'s T1 branch has none of
   * them — which is why that FR requires *"settlement → lines `served`"* and, in its very next
   * clause, forbids fabricating `ready`. Without this edge the two clauses cannot both hold:
   * `served` was reachable only from `ready`, so the settlement half of `02-F31` was unbuildable
   * and every T1 line terminated at `in_prep` for ever. `03-F26` closes the escape route that the
   * prohibition might have been about samples rather than states — *"T1 branches produce no
   * ready-marks (02-F31), so they honestly produce no samples"*.
   *
   * The table as it stood encoded *"a pass exists to observe readiness"* as universal law, which
   * is `DEC-HW-001`'s T3-assumed-universal error reaching the kernel.
   *
   * **It is NOT tier-conditional, and that is the decisive constraint rather than a simplification.**
   * `26 §7` row 65 makes legality a pure function of ONE edge's payload; gating it on the emitting
   * branch's tier would make a projected value depend on the reading device's configuration, so
   * convergence would depend on who is looking (`01-F34`, standing law 1). Permissive legality is
   * not a mandate: a T2/T3 branch has a device that emits `ready`, and only `02-F31`'s T1 producer
   * (`apps/pos-electron/src/main/line-advance.ts`) ever walks this edge.
   *
   * Safe on all three standing laws: `served` is terminal so nothing downstream can reorder
   * (law 1); no clock is read (law 2); no money is touched (law 3).
   */
  in_prep: ["ready", "served", ...EXITS],
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
