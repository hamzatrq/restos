// The merge-semantics fold engine (T-01-15; implements rewritten 01-F34 / specs/26
// / plans/wave-0/merge-semantics-matrix.md). Replaces the universal-comparator
// engine: every projected field declares its own merge rule — G-Set/G-Map union,
// unique-keyed sum over 01-F31 attempt keys, monotone facts, supersedes-DAG
// head-sets with MATERIALIZED tombstones, and explicitly rendered contested sets.
// Fold state is a pure function of the delivered event SET: the engine reads NO
// ordering metadata — no global_seq, no lamport_seq, no device clock, no id
// comparison — property-pinned by the bijective-relabel + injection invariance
// oracle (merge-invariance.test.ts). Contract ruling C1 (the confirm anchor's VALUE
// keeping `device_created_at`) is RETIRED by T-01-17: the anchor stamps
// `branch_created_at`, a delivered field of the event, so the engine now reads no
// device clock at all and the ban has no exception. Anchor SELECTION was always
// clock-free (argmin over (payloadHash, id), matrix row 57; the id read is
// identity-plus-anchor-selection, the branch the matrix explicitly sanctions).
// `branch_created_at` is safe to read for the same reason `payload` is: it is part
// of the delivered event SET, stamped once at the origin's append (01-F43), not
// derived from the reading device's state. A stamp computed at fold time from the
// local offset would break 01-F34 convergence silently.
//
// Parking is by KEY-PRESENCE (01-F10 amended): an event carrying its full
// projection keys never parks — payments/refunds/line edges/assignments/closes
// contribute to self-keyed lattices held per order key. Only the bare order-fact
// types (`order.confirmed`, `kot.printed`) park while their order key is absent,
// indexed by `waiting_for`, so a drain touches only the events awaiting the
// newly-arrived key (26 §4 defect 2 removed structurally).
import {
  AVAILABILITY_FALSE_WINS,
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

/**
 * Item availability (`01-F22`, `01-F57`..`01-F59`) — the first `item:`-keyed projection.
 *
 * `head_ids_json` is the maximal set, exported so an operator surface can build a correct
 * superseding toggle WITHOUT re-deriving the supersedes-DAG. Without it a contest was
 * unclearable in practice: superseding only the head your screen happened to show leaves the
 * other head standing, and the item stays 86'd forever. The sort is UTF-16 and is a
 * PRESENTATION sequence only — it never reaches a value (`01-F34`), which the relabel
 * property pins.
 */
export type AvailabilityRow = {
  item_id: string;
  /** 0/1 — SQLite STRICT has no boolean type. */
  available: number;
  contested: number;
  head_ids_json: string;
  anomalies_json: string;
};

export type FoldState = {
  orders: OpenOrderRow[];
  queue: KitchenQueueRow[];
  parked: ParkedRow[];
  availability: AvailabilityRow[];
};

export type ProjectedOrder = { order: OpenOrderRow; queue: KitchenQueueRow | null };

/** What one applied event changed — the store's targeted-write contract. */
export type ApplyResult = {
  /** Orders whose projection must be rewritten (scoped, never the ledger). */
  dirty: readonly string[];
  /**
   * Item keys whose availability projection must be rewritten (`26 §3` sidecar).
   *
   * A SEPARATE field rather than namespacing `dirty` in place. The order path's dirty
   * plumbing is threaded through seven fold arms, the store's row-write and the drop plan,
   * and the oracle named a silent-staleness regression there as the second-highest risk of
   * this change — a namespaced key reaching a row-writer that still expects a bare id leaves
   * the lattice right and SQLite wrong, visible only on a read BETWEEN deliveries. Adding a
   * field cannot break a consumer that does not read it; changing the meaning of an existing
   * one can. Key DERIVATION is generalised (see `keysFor`); the write channels stay typed.
   */
  dirtyItems: readonly string[];
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
/**
 * `01-F63`'s attested snapshot, as the fold reads it. Both money fields are `unknown` because
 * `01-F4`'s registry schema keeps every field beyond `order_id` an additive LOOSE extra — the
 * fold, not the parser, is what judges the evidence.
 *
 * `billed_paisa` is `01-F82`/`02-F63`'s `billed_total` — the rounded, tax-inclusive charge.
 * `billed_effective_paisa` is the fold's own `billed_effective` at the moment of closing, which
 * is `01-F33`'s `uncovered_addition` ceiling; see the check below for why they cannot be one field.
 */
type ClosedP = {
  order_id: string;
  billed_paisa?: unknown;
  billed_effective_paisa?: unknown;
};

/**
 * `00 §6` — an attested money figure is a NON-NEGATIVE INTEGER of paisa, and anything else is bad
 * evidence rather than a number to coerce. Named once so the two snapshot fields cannot drift into
 * two readings of one rule.
 */
const isAttestedPaisa = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

type LineValue = { item_id: string; qty: number; unit_price_paisa: number };
/** `02-F8`'s removal (`{order_id, line_id}` — the registry's P1, a *plain* event). */
type LineRemovedP = { order_id: string; line_id: string };
/** `02-F6`'s item note. `line_id` is required — the note names the dish it qualifies. */
type NoteAddedP = LineRemovedP & { note: string };
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
  /** Confirm G-Set: event id → the delivered branch stamp + its basis (matrix row 57). */
  confirms: Map<string, { stamp: number; verified: boolean }>;
  /** settlement_closed G-Set: event id → payload (settled = non-emptiness, 01-F33). */
  closes: Map<string, Record<string, unknown>>;
  /** Per-line value MVR: line id → (canonical bytes → {item, qty, price}). */
  lineValues: Map<string, Map<string, LineValue>>;
  /**
   * `02-F8`'s pre-confirm removals — a grow-only TOMBSTONE SET of line ids (`26 §7` M1).
   *
   * A SET and not a mutation of `lineValues`, and that is the whole convergence argument. The
   * projection is `project(values, tombstones)`: a pure function of two grow-only sets, so union
   * is commutative and idempotent and no clock, `lamport_seq`, `global_seq` or envelope-id
   * comparison is reachable (`01-F34`). Deleting the value at fold time instead — which is what
   * the retention `droppedLines` filter legitimately does one screen down, for a
   * session-scoped outer-layer act — makes the outcome depend on ARRIVAL ORDER: the removal only
   * works when it happens to be folded after its `order.line_added`, and `01-F16` puts
   * concurrent adds from two terminals in ordinary service.
   *
   * REMOVE-WINS. A `line_id` is minted by the till that adds the line, so a removal naming one can
   * only be issued by a device that has already SEEN the add — the genuinely concurrent add/remove
   * pair does not arise. What arises constantly is delivery reordering, and remove-wins is the
   * only rule under which both orders agree.
   *
   * Per ENTITY, so keying is `(order, line)` and never `line` alone: nothing makes a `line_id`
   * globally unique (a per-order counter produces `L1` on every order by construction), and a
   * globally keyed tombstone set silently empties the neighbouring bill.
   */
  lineTombstones: Set<string>;
  /**
   * `02-F6`'s item notes — a grow-only VALUE SET per line id, deduplicated by TEXT (`26 §7` M2).
   *
   * A set and not a register because `01 §4` carries `note_added` and offers no `note_removed`
   * and no `note_changed`, and `02-F6`'s quick-tags are a PICK LIST (`02-F50`) — two taps are two
   * facts. A register would need a tiebreak and every available one is banned (`01-F34`; `26 §7`
   * bans `min(envelope.id)` by name because UUIDv7 makes an id comparison wall clock in disguise),
   * and its failure direction is the unsafe one: the second tag silently erasing *"no peanuts"*.
   *
   * Keyed by the TEXT rather than by the event id for the reason `createMembers`, `lineValues` and
   * the availability lattice are all value-keyed: it is what makes redelivery idempotent, and it
   * is what lets the rendering sort by a set-determined key instead of by an id.
   *
   * Held for a line this device has not seen yet (matrix row 61 — *"edges for a not-yet-added line
   * are held, never parked, never dropped"*). A note whose line arrives later renders on it.
   */
  lineNotes: Map<string, Set<string>>;
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

/** Adoption clause (matrix row 64): |from_states| > 1 ∧ to ∈ from_states is a
 * choice among already-emitted terminals, not a transition. */
const isAdoption = (ed: Edge): boolean =>
  ed.from_states.length > 1 && ed.from_states.includes(ed.to);

/** Legality is a pure function of ONE edge's own payload — never of comparator
 * position — which is why illegal_transition can never be recomputed away
 * (matrix row 65). */
const edgeLegal = (ed: Edge): boolean => {
  if (isAdoption(ed)) return true;
  return ed.from_states.every(
    (f) => applyLineState(f as OrderLineState, ed.to as OrderLineState).applied,
  );
};

/** One projected line cell as rendered into `json_lines` — the billed
 * derivation's input shape (line VALUE fields + projected workflow states). */
export type BilledLineCell = {
  /**
   * The catalog item this line sells. **Corrected July 2026:** this field was always
   * WRITTEN (the cell is built as `{ ...lineValue, states, anomalies }` and `LineValue`
   * carries `item_id`) but was not declared here — so a host app reading `json_lines` had no
   * typed way to resolve a line to a catalog entry, and `apps/pos-electron` could not render
   * an item name. A declaration narrower than the data is a silent capability loss.
   *
   * Display resolution only (`01-F52`): the catalog is never a fold input, and the money on
   * this cell was captured at append time (`01-F53`), so a stale catalog costs a word and
   * never a rupee.
   */
  item_id: string;
  qty: number;
  unit_price_paisa: number;
  states: string[];
  anomalies?: Record<string, string>;
  /**
   * `02-F6`'s item notes on this line, deduplicated and text-sorted (`26 §7` M2).
   *
   * An ARRAY and not a joined string: the separator would be a presentation decision taken inside
   * the kernel, and `03-F55` puts the chit's arrangement in `packages/escpos`. A shape that could
   * hold only one note would force the merge rule back to a register.
   *
   * OPTIONAL, and absent rather than `[]` on a line with nothing to say. A projection is not a
   * ledger — `01-F1` does not reach it — and the convention is this file's own: `menu()`'s
   * `sold_out`/`contested` spread conditionally for the same reason, and pinning the empty-case
   * bytes would churn every existing `json_lines` assertion for a fact that is not there.
   */
  notes?: string[];
};

/**
 * `01-F30` — **has this line EXITED the order?** A decided single exit state (`01 §4`'s `voided`
 * or `cancelled`), and nothing else.
 *
 * **Extracted August 2026 so that "exited" is declared ONCE and read by more than money.** It was
 * the first line of `billedCellPaisa` below and nowhere else, so the only question a host app
 * could ask about an exit was *how much is this line worth*, which `billedLinePaisa` answers with
 * a **number** — and a number collapses *exited* onto *free* (`01-F60`'s explicit zero) and onto
 * *zero quantity*. Three different facts, one `0`. Two shipping documents were reading that zero
 * as their exit test and neither could tell the three apart:
 *
 *   * `apps/pos-electron`'s KOT walk had **no exit test at all** — `LineCell` declared no `states`
 *     field — so a line voided before its chit was printed and cooked. `02-F8`'s two ways of
 *     taking a line off an order therefore produced two different chits: a pre-confirm
 *     `order.line_removed` is tombstoned out of `json_lines` (see `Entity.lineTombstones`) and
 *     never reaches paper, while a `voided` line stays in the map with its state beside it.
 *   * the receipt's `billedOnPaper` used `unit_price_paisa === 0 || billedLinePaisa(cell) > 0`,
 *     whose first arm short-circuits **before** the exit is consulted — so a VOIDED line priced
 *     at zero printed on a customer's copy of an order it had been taken off.
 *
 * **It is not a fold arm and it changes no projection** (`01-F34`): it reads one already-projected
 * cell's `states` and returns a boolean — no ordering metadata, no clock, no envelope id, no
 * reading-device state. `billedCellPaisa` calls it rather than restating it, so the money and the
 * paper cannot disagree about which lines left the order (`02-F45`, one fact one source).
 *
 * **It deliberately says nothing about a CONTESTED terminal set** (≥2 heads, `CONTESTED_LINE_BILLABLE`).
 * That is a money POLICY — whether a disputed line is billed — and a kitchen has no business
 * reading it: a cook makes the dish or does not, and no FR turns that on a billing switch. A
 * caller that needs the billing answer asks `billedLinePaisa`, which applies both rules.
 *
 * **The parameter is `states` alone and NOT a whole `BilledLineCell`, which is `03-F32` reaching
 * one package over.** The kitchen chit's data model has no price in it *by rule*, so a signature
 * demanding `unit_price_paisa` would force the one caller that must not hold a price either to
 * carry one or to pass a fabricated zero — a hole exactly where that FR forbids one.
 */
export const lineExited = (cell: Pick<BilledLineCell, "states">): boolean =>
  cell.states.length === 1 && EXITED.has(cell.states[0] as string);

/** billed_effective of ONE projected cell (01-F30: billed derives from
 * delivered lines, exited lines excluded — "a fully-voided order nets to
 * zero"): a decided single exited state contributes nothing; a contested
 * terminal set (≥2 heads) contributes per CONTESTED_LINE_BILLABLE (branchless
 * policy application, matrix §5.4). Declared ONCE — projectEntity and the
 * exported helper below both read it (T-01-11 fix round F4). */
const billedCellPaisa = (cell: BilledLineCell): bigint => {
  if (lineExited(cell)) return 0n;
  const terminalCount = cell.states.filter((s) => TERMINAL.has(s)).length;
  // BigInt: qty × unit_price is a PRODUCT, so it leaves the exact-integer range far
  // sooner than a sum does, and a double product rounds silently (3 × 3002399751580331
  // renders as ...992, not ...993). Exactness here is what lets the caller decide
  // between a true total and an anomaly instead of printing a plausible wrong number.
  return (
    BigInt(cell.qty) *
    BigInt(cell.unit_price_paisa) *
    BigInt(Number(terminalCount < 2 || CONTESTED_LINE_BILLABLE))
  );
};

/** Exact JS integer, or null when the value cannot be represented (T-01-22). */
const safeNumber = (value: bigint): number | null =>
  value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : Number(value);

/**
 * billed_effective from an OpenOrderRow's `json_lines` cell map — the ENGINE's
 * own billed derivation over its own projection (T-01-11 fix round F4, ruled:
 * the Auditor's mirror is deleted; fold logic is never reimplemented outside
 * this module, 26 §8 / 01-F34). Same arithmetic projectEntity accumulates —
 * per-cell equivalence holds because `states` is exactly the terminal MVR set
 * when contested (all terminal) and the single non-terminal watermark
 * otherwise, so counting terminal members of `states` IS `terminalCount`.
 */
export const billedEffectiveFromJsonLines = (jsonLines: string): number => {
  let billed = 0n;
  for (const cell of Object.values(JSON.parse(jsonLines) as Record<string, BilledLineCell>)) {
    billed += billedCellPaisa(cell);
  }
  // Unrepresentable ⇒ ZERO, matching what the fold's own accumulators do, and the row
  // carries the overflow anomaly. Returning the rounded double instead would hand the
  // cloud Auditor (services/sync-gateway/src/auditor.ts) a value that silently differs
  // from the engine's, turning a money anomaly into a false conservation finding.
  return safeNumber(billed) ?? 0;
};

/**
 * billed_effective of ONE line, for a host app that must name the money a single line is worth
 * (`02-F20`'s void and comp both carry `amount_paisa`, and `01-F30` conserves per order, so an
 * emitter that guessed the figure would put a number in an append-only ledger that disagrees
 * with the fold's own).
 *
 * **The same `billedCellPaisa` the projection accumulates, exported rather than re-derived** —
 * `billedEffectiveFromJsonLines` directly above exists for exactly this reason at the order
 * level, and its comment states the rule this follows: *fold logic is never reimplemented
 * outside this module* (`26 §8` / the T-01-11 ruling; two implementations of one sum is how a
 * money anomaly becomes a false conservation finding). `apps/pos-electron/src/main/gateway.ts`
 * already says the same of `total_paisa` in its own words.
 *
 * **This is not a fold arm and it changes no projection.** It reads one already-projected cell
 * and returns its billed contribution — no ordering metadata, no clock, no envelope id, so
 * standing law 1 (`01-F34`) is untouched. Unrepresentable ⇒ ZERO, matching what the fold's own
 * accumulators do and what the order-level helper returns, so a caller can never be handed a
 * rounded double for a money field.
 */
export const billedLinePaisa = (cell: BilledLineCell): number =>
  safeNumber(billedCellPaisa(cell)) ?? 0;

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
  const legalById = new Map(legal.map((ed) => [ed.event_id, ed]));
  // heads() by set difference over preds — retirement is the ONLY thing preds do —
  // EXCEPT (fix-round F7; 01-F35 conservative ruling): only an ADOPTION edge may
  // retire a TERMINAL head. A legal non-adoption edge naming a terminal pred
  // lands (participates in the ≼-max), necessarily fires inconsistent_predecessor
  // below (a legal single-from cannot contain the terminal's `to`), and the
  // terminal survives — one inconsistent emitter never un-serves a line fleet-wide.
  const retired = new Set<string>();
  for (const ed of legal) {
    for (const p of ed.preds) {
      const pe = legalById.get(p);
      if (pe !== undefined && TERMINAL.has(pe.to) && !isAdoption(ed)) continue;
      retired.add(p);
    }
  }
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
  /** One item's availability row — the `item:`-key analogue of `projectOrder` (`26 §3`). */
  projectItemKey(itemId: string): AvailabilityRow;
  /** Every fold row, for a full table rewrite after rebuild(). */
  snapshot(): FoldState;
  parkedRows(): ParkedRow[];
  stats(): FoldStats;
  /** Validates every key (well-formed per fix-round F8, open-bill guard per
   * 01-F42/01-F17) and computes the whole drop as a PURE function — throws with
   * zero mutation anywhere (fix-round F1: a reject changes NOTHING, the
   * in-memory lattice included). */
  planDrop(keys: readonly string[]): DropPlan;
  /** Applies a planned drop: lattice shrink + session dropped-key memory
   * (fix-round F2). Pure in-memory Map/Set work — the store calls this only
   * AFTER the SQL transaction committed (fix-round F6 ordering). */
  commitDrop(plan: DropPlan): void;
};

/** A validated, fully-computed retention drop (fix-round F1/F6): produced purely
 * by planDrop, applied to SQL first by the store, then to the lattice by
 * commitDrop. Computed over key SETS, so outcome class and final projection
 * bytes are key-order independent by construction (fix-round ruling g). */
export type DropPlan = {
  /** Order keys dropped wholesale. A line key under one of these is SUBSUMED —
   * the wholesale drop already removes the line (F1 atomic-success). */
  removedOrders: readonly string[];
  /** Dropped line ids per SURVIVING order. */
  lineDrops: ReadonlyMap<string, ReadonlySet<string>>;
  /** Post-drop projections for the surviving orders that lost lines. */
  dirty: ReadonlyArray<{ order_id: string; projection: ProjectedOrder | null }>;
};

/** The bare order-fact types that park while their order key is absent (01-F10
 * amended: everything else carries its full projection keys and never parks). */
const PARKING_TYPES: ReadonlySet<string> = new Set(["order.confirmed", "kot.printed"]);

/**
 * Registry types that are DELIBERATELY NOT FOLDED, with the FR that says so.
 *
 * `catalog.changed` is the first of these and it is why this set exists. `01-F52` is
 * explicit: *"catalog state is not an input to any fold — a projected value that read a name
 * would depend on catalog sync state at fold time, which is the `01-F34` break law 1 exists
 * to prevent."* Before this, the engine's model was binary — every registry type had a merge
 * rule or the build failed — so the first type that must have NO rule could not be expressed
 * at all, and the honest answer looked identical to the mistake the exhaustiveness guard
 * exists to catch.
 *
 * Membership here is a claim that needs an FR, not a way to silence the compiler. A type
 * added to this set without one is exactly the silent fall-through `assertNever` prevents,
 * wearing a different hat.
 */
const NON_FOLD_TYPES = {
  "catalog.changed": "01-F52",
  /**
   * `03-F53` (August 2026) — `03-F11`'s printer transition, which got a payload schema and a till
   * producer and therefore entered this registry for the first time.
   *
   * It lands HERE rather than in the switch beside `kot.print_failed`, and the reason is
   * structural rather than editorial: `kot.print_failed` carries an `order_id`, so the sidecar can
   * honestly answer with an order key and the switch can then say "consumed, projects nothing".
   * **This event names no order and no item** — its whole payload is a printer and a status — so
   * there is no key to answer with, and `keysFor`'s `payload.order_id` fallback would mint
   * `order:undefined` and hand a phantom row to the engine.
   *
   * ⚠ **The CLAIM, stated at its real strength, because this set's own doc warns that membership
   * is a claim and not a way to silence the compiler.** `03-F53` names its consumers: *"`05-F3`'s
   * alarm list and doc 15's fleet health"*. Neither is a fold — the alarm list is doc 05's derived
   * VIEW (`apps/manager/src/alarms.ts`, which declares no fold and keys no entity, under `18 §6`'s
   * *"app-specific derived VIEWS but not new folds"*), and fleet health is a cloud read model
   * (`01-F7`). So no fold in this package reads it, which is the same claim the `kot.print_failed`
   * arm already makes in the switch below. That is WEAKER than `catalog.changed`'s, which has
   * `01-F52` forbidding any fold from reading it for all time; if a fold ever needs this fact, this
   * row moves and the compiler says so — which is what a row is for.
   *
   * ⚠ **THE COMPILER SAYS SO ONLY IF THE ROW IS DELETED, NOT IF IT MOVES TO THE WRONG SET —
   * measured 2026-08-13 (adversarial mutation).** Deleting this row reddens `pnpm typecheck` at
   * `assertNever` (`TS2345`, line ~920), which is the pin working. But MOVING it into
   * `OTHER_FOLD_TYPES` below — whose doc says the two sets *"make different claims and conflating
   * them would be a lie in the direction that matters"* — passes **all 642 tests in this package
   * AND the root `pnpm typecheck`, exit 0 on both**. `keysFor` answers `[]` from either branch, so
   * the two sets are runtime-identical and the only thing distinguishing them is the sentence a
   * reader believes. `merge-workcounter.test.ts`'s `PINNED_NOT_FOLDED` does not close this: it
   * cross-checks the TEST's own two lists against `eventRegistry.types()`, never against this
   * file's classification. So *"no fold may read this"* and *"another fold in this package owns
   * this"* are, today, interchangeable assertions — which is worth knowing before either is cited
   * as evidence about a money-bearing type, the exact case that doc warns about.
   */
  "printer.status_changed": "03-F53",
  /**
   * `10-F13` / `10-F16` / `10-F17` (August 2026) — the supply plane's three physical acts, which
   * got payload schemas with `specs/10` slice 1 and therefore entered this registry for the first
   * time.
   *
   * **Structural, exactly as `printer.status_changed` above:** none of the three names an order,
   * and the `item_id` they carry is an `01-F21` **InventoryItem**, not the sellable
   * `availability.changed` keys `item:` by — so `26 §3`'s sidecar has no key to answer with, and
   * `keysFor`'s `payload.order_id` fallback would mint `order:undefined` and hand a phantom row to
   * the engine.
   *
   * ⚠ **THE CLAIM, at its real strength, per this set's own doc — and here it is a SETTLED
   * DISPOSITION rather than the stated debt the void/comp/discount arms below carry.** `10-F4`
   * makes sale deduction a **derived** row in a cloud read model and the physical acts kernel
   * events that feed it; `10 §8` puts the whole module in the cloud service. And the count is
   * BLIND *by construction* — `10 §4` Flow A step 2 (amended August 2026) computes with the
   * currently published recipe version in the cloud, `00 §5.1` forbids an in-branch act requiring
   * WAN, and `plans/inventory/design.md` §5.3 draws the consequence: **a device cannot hold a
   * correct expected-stock number at all**, which is why `10-F17`'s sheet shows no suggested
   * quantity. So "no fold in this package reads these" is not a deferral of a merge rule; a device
   * fold over them would be a second, WRONG stock number beside the cloud's.
   *
   * That is still weaker than `catalog.changed`'s `01-F52`, which forbids any fold for all time.
   * The reopen trigger is named rather than left to a reader: `10-F21`'s par alert wants a level a
   * device could show, and if that is ever wanted **on-device** these rows move and the compiler
   * says so. ⚠ The measured hole this file records one entry up applies here unchanged — moving a
   * row to `OTHER_FOLD_TYPES` is runtime-identical and reddens nothing — so treat membership as a
   * sentence a reader believes, not as evidence.
   */
  "stock.purchase_recorded": "10-F4",
  "stock.wastage_recorded": "10-F4",
  "stock.count_recorded": "10-F17",
} as const satisfies Partial<Record<KnownEventType, string>>;
type NonFoldEventType = keyof typeof NON_FOLD_TYPES;
const isNonFold = (t: string): t is NonFoldEventType => t in NON_FOLD_TYPES;

/**
 * Registry types this engine does not fold because ANOTHER fold in this package owns them,
 * with the FR each one closes. `folds/shift-cash.ts` (the `shift_cash` fold, `FOLDS.md`
 * line 15) consumes `shift.*` / `day.*` / `cash.*`; they carry neither an order key nor an
 * item key, so this engine's sidecar answers with the empty list for them.
 *
 * A SEPARATE set from `NON_FOLD_TYPES` on purpose, because the two make different claims and
 * conflating them would be a lie in the direction that matters: `NON_FOLD_TYPES` says NO fold
 * may read the type (`01-F52`), and putting a money-bearing shift event under that banner
 * would assert the cash reconciliation is unfoldable. This set says the opposite — the type
 * IS folded, by a fold whose projections this engine does not own.
 *
 * `payment.recorded` is deliberately absent: it is order-keyed HERE (`01-F31` keyed sums into
 * `pay_total`) *and* shift-keyed there (`02-F23` expected cash), which is exactly the
 * two-planes case `DEC-MONEY-007` describes — one event legitimately reaching two totals.
 */
const OTHER_FOLD_TYPES = {
  "shift.opened": "02-F22",
  "shift.closed": "02-F23",
  "day.opened": "02-F22",
  "day.closed": "02-F24",
  "cash.drawer_opened": "02-F21",
  "cash.paid_out": "02-F26",
  "cash.deposit_recorded": "02-F24",
  // `folds/customer-file.ts` (the `customer_file` fold) consumes both. Their key is `01-F23`'s
  // normalized phone — neither an order key nor an item key — so this engine's sidecar answers
  // the empty list for them, and for the same reason as the seven above it: the type IS folded,
  // by a fold whose projections this engine does not own.
  "customer.created": "01-F23",
  "customer.address_added": "02-F27",
  // `folds/customer-orders.ts` (the `customer_orders` fold) consumes both, and both are here for
  // the SAME structural reason as the two customer types above rather than as a judgement call:
  // their projection is keyed by `01-F23`'s normalized phone, which is neither an order key nor an
  // item key, so `26 §3`'s sidecar has no key this engine could answer with.
  //
  // ⚠ **`order.customer_linked` CARRIES an `order_id` and is still not order-keyed here, which is
  // the one row in this set a reader will want to move.** The link is a fact about a CUSTOMER's
  // orders and carries no money: `01-F30`'s conservation equation has nothing to do with it, and
  // putting it through the order-keyed switch would mean designing a merge rule for it inside the
  // money engine, whose dispositions `merge-workcounter.test.ts` pins. `02-F64` declares its merge
  // rule (a G-set of claimant phones per order with `01-F31`'s contested disposition) and
  // `customer-orders.ts` implements it. The day an ORDER projection needs to render its customer,
  // this row moves and the sidecar answers two keys — which is exactly the shape `keysFor` returns
  // a LIST for.
  "order.customer_linked": "02-F64",
  "loyalty.reward_redeemed": "17-F23",
} as const satisfies Partial<Record<KnownEventType, string>>;
type OtherFoldEventType = keyof typeof OTHER_FOLD_TYPES;
const isOtherFold = (t: string): t is OtherFoldEventType => t in OTHER_FOLD_TYPES;

/** Every registry type the ORDER-keyed switch handles — i.e. all of them except the
 * item-keyed ones, the ones no fold may read, and the ones another fold owns. Declared as an
 * Exclude so adding a new item-keyed, non-fold or other-fold event is a compile error in
 * exactly one place (the sidecar) rather than a silent fall-through here. */
type OrderKeyedEventType = Exclude<
  KnownEventType,
  "availability.changed" | NonFoldEventType | OtherFoldEventType
>;

const ORDER_NS = "order:";
const ITEM_NS = "item:";

type AvailabilityChangedP = { item_id: string; available: boolean; supersedes: string[] };

/**
 * The `26 §3` projection-key sidecar: every key an event affects.
 *
 * Returning a LIST rather than one key is the point — `26 §3` specifies it that way so an
 * event may touch more than one projection, and the engine routes on the namespace instead
 * of assuming `payload.order_id`. Today every event yields exactly one key; the shape is
 * what makes the next multi-key event a data change rather than an engine change.
 */
const keysFor = (event: ParsedEvent): readonly string[] => {
  // A non-fold type affects NO projection, so the honest sidecar answer is the empty list —
  // not a key nothing reads. `26 §3` asks "which projections does this event touch"; for
  // `catalog.changed` the answer is none, and saying so here is what keeps the engine from
  // having to special-case it downstream.
  if (isNonFold(event.type)) return [];
  // Same empty answer, different claim (see OTHER_FOLD_TYPES): the `shift_cash` fold reads
  // these, and none of them touches an order or item projection.
  if (isOtherFold(event.type)) return [];
  if (event.type === "availability.changed") {
    return [`${ITEM_NS}${(event.payload as AvailabilityChangedP).item_id}`];
  }
  return [`${ORDER_NS}${(event.payload as OrderRefP).order_id}`];
};

/**
 * One item's availability lattice, keyed by `<event id>\u0000<payload hash>`.
 *
 * The composite key is what makes this a value-register rather than a last-write-wins cell:
 * an identical redelivery collapses (same id, same bytes), while two claimants' DIVERGENT
 * payloads under one id both survive and render as a conflict. Keying by id alone made the
 * projection depend on ARRIVAL ORDER — a live `01-F34` break.
 *
 * `event_id` is carried in the VALUE because the key is an internal dedup device: heads and
 * supersedes are both stated in envelope ids, and leaking a composite key into `head_ids_json`
 * would hand an operator surface a token it cannot put in a `supersedes` array.
 */
type ItemEntity = Map<string, { event_id: string; value: boolean; supersedes: readonly string[] }>;

/**
 * Project one item from its toggle set (`01-F22`, `01-F57`..`01-F59`). A pure function of
 * the SET, so delivery order cannot reach the result.
 *
 * "Latest wins" is illegal here — it needs a device clock (`01-F45`) or an id comparison
 * reaching a projected value (`01-F34`), and concurrent toggles are ORDINARY because
 * `01-F22` puts the 86 control on the POS, the pass screen and the manager console at once.
 * So each toggle names what it replaces and the fold takes the maximal set.
 */
const projectItem = (
  toggles: ItemEntity,
): { available: boolean; contested: boolean; heads: string[]; anomalies: string[] } => {
  const superseded = new Set<string>();
  for (const t of toggles.values()) {
    // Self-reference excluded — a malformed event must not erase itself and take the item's
    // whole history with it. `order.table_assigned` now carries the identical guard.
    for (const s of t.supersedes) if (s !== t.event_id) superseded.add(s);
  }
  const live = [...toggles.values()].filter((t) => !superseded.has(t.event_id));
  const heads = [...new Set(live.map((t) => t.event_id))].sort();

  if (toggles.size === 0) return { available: true, contested: false, heads, anomalies: [] };

  if (heads.length === 0) {
    // Every delivered toggle is superseded by one that is absent, or the supersedes edges
    // form a cycle. NOT a default: it is a data-completeness fact, and the old code answered
    // it with `available: true`, which meant a k>=2 cycle over toggles that ALL said
    // unavailable projected AVAILABLE and resurrected an 86'd dish with no anomaly. Under
    // `01-F39`'s scoped waiter slice that is reachable from an ordinary partial delivery.
    //
    // `26 §7` names this hazard — availability subset-blindness — as provably unfixable by
    // any algebra, needing a delivery-completeness mechanism nobody has specced. So this is
    // not a fix: it is the SAFE direction plus visibility. Direction comes from the ratified
    // constant, not from a hardcoded literal (`26 §9`, `DEC-*` product constants).
    // contested is TRUE here too: it means "the heads did not resolve this", and an
    // unresolvable head set is unresolved whether the cause is disagreement or incompleteness.
    // The two are told apart by the anomaly code, not by pretending one of them settled.
    return {
      available: !AVAILABILITY_FALSE_WINS,
      contested: true,
      heads,
      anomalies: ["availability_incomplete"],
    };
  }

  const distinct = new Set(live.map((t) => t.value));
  if (distinct.size === 1) {
    return { available: [...distinct][0] === true, contested: false, heads, anomalies: [] };
  }
  // 01-F58 — the fold does not pick a winner (01-F31). The errors are asymmetric: failing to
  // sell a dish you could costs a re-toggle; selling one you cannot costs a refund and a
  // customer. `heads` is what makes this CLEARABLE in one operator act.
  return {
    available: !AVAILABILITY_FALSE_WINS,
    contested: true,
    heads,
    anomalies: ["availability_contested"],
  };
};

const availabilityRowOf = (item_id: string, toggles: ItemEntity): AvailabilityRow => {
  const p = projectItem(toggles);
  return {
    item_id,
    available: p.available ? 1 : 0,
    contested: p.contested ? 1 : 0,
    head_ids_json: canonicalJson(p.heads),
    anomalies_json: canonicalJson([...new Set(p.anomalies)].sort()),
  };
};

type DropKey =
  | { kind: "order"; order_id: string }
  | { kind: "line"; order_id: string; line_id: string };

/** Key literals are internal (`order:<id>` / `line:<order>:<line>`, matrix §3
 * compound-key default). Fix-round F8: a malformed key — `line:O1` without a
 * <line_id> part, or an unknown prefix — is rejected LOUDLY with nothing
 * changed, never silently mis-parsed into a different target. */
const parseDropKey = (key: string): DropKey => {
  if (key.startsWith("order:")) return { kind: "order", order_id: key.slice("order:".length) };
  if (key.startsWith("line:")) {
    const rest = key.slice("line:".length);
    const cut = rest.indexOf(":");
    if (cut === -1) {
      throw new Error(
        `retentionDrop key ${JSON.stringify(key)} is malformed — a line key is ` +
          "line:<order_id>:<line_id> (fix-round F8; nothing changed)",
      );
    }
    return { kind: "line", order_id: rest.slice(0, cut), line_id: rest.slice(cut + 1) };
  }
  throw new Error(
    `retentionDrop key ${JSON.stringify(key)} has an unknown prefix — keys are ` +
      "order:<order_id> or line:<order_id>:<line_id> (fix-round F8; nothing changed)",
  );
};

/** Compile-time exhaustiveness for the fold switch (fix-round F5): a registry
 * type without an oracle-pinned merge rule must not compile; at runtime
 * (unreachable — the domain parseEvent admits only registry types) it fails
 * loud, never a silent no-op that still counts fold work. */
/* v8 ignore start -- unreachable by construction: `never` means the compiler has
   already proved no value reaches here. A test for this would be a test that
   TypeScript works, and an uncoverable line makes a 100% gate permanently red for
   a reason no author can act on (24-F3). */
const assertNever = (type: never): never => {
  throw new Error(`foldIn: no merge rule for event type ${String(type)} (fix-round F5)`);
};
/* v8 ignore stop */

export const createMergeEngine = (): MergeEngine => {
  let entities = new Map<string, Entity>();
  /** Parked events indexed by the awaited key — the drain touches ONLY these. */
  let parkedByKey = new Map<string, Map<string, ParsedEvent>>();
  let parkedRowsById = new Map<string, ParkedRow>();
  const counters: FoldStats = { full_rebuilds: 0, scoped_rebuilds: 0, events_folded: 0 };
  /** Session dropped-key memory (fix-round F2; ruling b — IN-SESSION only, a
   * reopen's fresh engine legitimately rebuilds until the prune-watermark task):
   * a straggler for a dropped key is ledger-retained by the caller, never
   * folded, never parked, never projected. Deliberately NOT cleared by
   * rebuild() — refold() replays the surviving ledger within the same session,
   * and the retention scope is part of what the projection is a function of. */
  const droppedOrders = new Set<string>();
  const droppedLines = new Set<string>();
  /** `item:`-keyed lattice — a disjoint key space from `entities`, one engine. */
  let items = new Map<string, ItemEntity>();

  const foldAvailability = (event: ParsedEvent): void => {
    const p = event.payload as AvailabilityChangedP;
    let m = items.get(p.item_id);
    if (!m) {
      m = new Map();
      items.set(p.item_id, m);
    }
    // Keyed by event id AND canonical payload bytes, exactly as the engine keys its other
    // MVRs (`createMembers`, `lineValues`, `pay`/`refund`). Keying by id alone made this
    // last-write-wins by ARRIVAL for two same-id envelopes with divergent payloads — a live
    // 01-F34 break the shipped property suite hit on ~2.5% of runs. The store rejects same-id
    // divergence on ingest, but 01-F37 keys quarantine per (org, claimed_event_id, device_id)
    // — "each claimant's bytes are preserved as its own evidence row" — so two claimants'
    // envelopes genuinely coexist in the merged cloud log the Auditor refolds. Value-keying
    // is an ENGINE obligation, not a store one.
    m.set(`${event.envelope.id}\u0000${payloadHash(p as unknown as Record<string, unknown>)}`, {
      event_id: event.envelope.id,
      value: p.available,
      supersedes: p.supersedes,
    });
  };

  /** Availability rows, keyed by item. Untoggled items never appear (01-F52: the catalog
   * says what exists; availability is an operational override, never catalog-driven). */
  // The `id`s come from `items.keys()`, so every `get` hits — the `?? new Map()` that stood here
  // was an unreachable branch (0/546) and the last thing blocking `20 §2.2`'s 100% branch gate on
  // `src/folds/**`. Removed rather than covered: a test can only "exercise" it by pretending, and
  // a defensive default on a key we just enumerated hides a real bug rather than guarding one.
  const availabilitySnapshot = (): AvailabilityRow[] =>
    [...items.keys()].sort().map((id) => availabilityRowOf(id, items.get(id) as ItemEntity));
  const lineKey = (orderId: string, lineId: string): string => `${orderId}\u0000${lineId}`;

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
      lineTombstones: new Set(),
      lineNotes: new Map(),
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
    // ORDER-KEYED types only. `apply` routes item-keyed events to their own fold before this
    // is reached, and narrowing the type here makes that routing invariant COMPILER-ENFORCED
    // rather than a comment: an item-keyed type can no longer have a case in this switch, so
    // the branch cannot exist to be dead. A `case` that merely returned would still count
    // `events_folded` above it if the routing ever regressed — the F5 honesty overcount.
    const type: OrderKeyedEventType = event.type as OrderKeyedEventType;
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
        // Monotone OR fact + the value layer. The stamp is the DELIVERED branch time
        // (01-F43) — part of the event set, not derived from this device's state — so
        // the anchor's argmin(stamp, id) below stays set-determined. The payloadHash
        // that used to ride here is gone with the mixed-epoch branch: it never
        // separated anything (`order.confirmed`'s payload is `{order_id}` alone).
        e.confirms.set(env.id, {
          stamp: env.branch_created_at,
          verified: env.time_basis === "branch",
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
      case "kot.print_failed": {
        // K-7 (03-F5): emitted when the 03-F4 retry budget exhausts. Consumed and
        // projection-inert for the same reason as kot.printed directly above — 26's
        // ratified matrix has no device projection for a print fact, and the anchor
        // this event might otherwise touch (age_basis) is deliberately the CONFIRM,
        // so "a failed print never hides a late order" (03-F14). Its reader is doc
        // 05's alarm console (05-F3), a cloud read model (01-F7), not a fold here.
        //
        // Deliberately NOT in `PARKING_TYPES`: parking is for bare order facts that must wait
        // for their order key, and this case touches no entity at all, so an early straggler
        // costs one counted no-op rather than a phantom order row.
        return;
      }
      case "approval.requested":
      case "approval.granted":
      case "approval.denied": {
        // `05-F7`'s extension, registered August 2026. Consumed and projection-inert here for
        // the same reason as the two print facts above: `26`'s ratified matrix declares no
        // device projection for an approval, and the thing an approval *changes* is a
        // `void/comp/discount.recorded` that `05-F6` has the requesting POS append separately —
        // so projecting the decision here would give one fact two homes and let a fold and a
        // ledger event disagree about whether an act was authorised.
        //
        // `01-F36`'s idempotency ("applies only while its request is pending; duplicates and
        // stale responses are logged no-ops") is deliberately NOT enforced here either. It is a
        // rule about the pending QUEUE, which `05 §5` materialises on the manager device and
        // `01-F7` puts in a cloud read model — and expressing "first response wins" in a fold
        // would need a total order this engine does not have and `01-F34` forbids inventing.
        //
        // Deliberately NOT in `PARKING_TYPES`, on `kot.print_failed`'s reasoning: this case
        // touches no entity, so an early straggler costs one counted no-op rather than a
        // phantom row.
        return;
      }
      case "void.recorded":
      case "comp.recorded":
      case "discount.recorded":
      case "order.line_price_overridden": {
        // `02-F20`'s four escalatable writes, registered August 2026. Consumed and
        // **projection-inert**, and unlike the three approval facts above that is a stated DEBT
        // rather than a settled disposition — `01-F30` conserves
        // `Σ payments − Σ refunds = billed_total − void_value − comp_value − discounts`, so three
        // of its four right-hand terms go on evaluating to ZERO until a merge rule exists here.
        //
        // It is deliberately not written in the change that gave these types a payload schema.
        // `26 §7` makes a fold rule an ORACLE-PINNED decision: each of these is money, each needs
        // its own idempotency key and its own divergence disposition under `01-F31`, and a rule
        // guessed at this seam would let delivery order decide a money outcome — the exact failure
        // `26 §2` exists to remove. What `01-F4` was blocking was the EMIT, and that is what the
        // schemas closed; the fold is a separate, spec-PR-sized piece of work.
        //
        // Deliberately NOT in `PARKING_TYPES`, on `kot.print_failed`'s reasoning: this case
        // touches no entity, so an early straggler costs one counted no-op rather than a phantom
        // order row.
        return;
      }
      case "order.cancelled":
      case "order.rejected":
      case "order.parked":
      case "order.unparked": {
        // `02-F9`/`06-F20`'s rejection and `02-F4`'s park pair, registered August 2026 — all three
        // were `01 §4` vocabulary with no payload schema, so `01-F4` made them unemittable and a
        // cashier could neither reject a cloud order nor set one aside. Consumed and
        // **projection-inert**, and like the escalatable writes above that is a stated DEBT rather
        // than a settled disposition: `26 §7` makes a merge rule an ORACLE-PINNED decision, not an
        // implementer's, and what `01-F4` was blocking was the EMIT.
        //
        // What is owed, named so it is not discovered in the field:
        //   · `order.rejected` — a rejected order goes on appearing in every till's `open_orders`.
        //     Genuinely UNDECIDED rather than merely unbuilt: `06-F20`'s consumer is the storefront
        //     status page, a cloud read model on the other plane (`18 §6`), and `01 §4`'s canonical
        //     states carry no `rejected` at all (its exit states are `voided / cancelled`). Guessing
        //     a removal here would invent an order state (commandment 2).
        //   · `order.cancelled` (`01-F84`, August 2026) — joined this group when its payload landed,
        //     and **its debt is SHARPER than its neighbours', not the same one wearing a new name.**
        //     `order.rejected` above is undecided partly because `01 §4` has no `rejected` state to
        //     land on. That argument DOES NOT APPLY here: `cancelled` **is** one of `01 §4`'s two
        //     canonical exit states, so unlike its neighbour a removal rule is *expressible* today
        //     and only the DECISION is missing. `26 §7` reserves that decision for an oracle, and
        //     `01-F35`'s terminal-state monotonicity is exactly what it has to pin — so it is not
        //     guessed here, and the consequence is stated instead of discovered: **an order
        //     cancelled by `06-F19` or auto-closed by `06-F27` goes on appearing in every till's
        //     inbox.** `06-F30`'s cloud origin is the first producer this type has ever had, so
        //     that consequence becomes reachable in production the day the storefront ships and is
        //     unreachable before it. Named in `06-F31` as owed.
        //   · `order.parked` / `order.unparked` — a parked order is indistinguishable from an active
        //     one, so a later `02-F10` recall surface cannot filter on it. **`02-F4`'s stated
        //     requirement needs no new projection**: "visible to every terminal in the branch" holds
        //     because `open_orders` folds from the branch stream and the order has been in it since
        //     its `order.created`. Projection-inert is therefore CORRECT for `02-F4` as written and
        //     owed only for the parked FLAG. The `supersedes` link both halves carry is the causal
        //     edge that fold will need (`01-F34`); nothing reads it yet.
        //
        // ⚠ Deliberately NOT in `PARKING_TYPES`, and here that is more than the `kot.print_failed`
        // reasoning it shares. That set and `parked()` are `01-F10`'s KEY-PRESENCE HOLD and have
        // nothing to do with `02-F4` — the collision is purely lexical, and wiring `order.parked`
        // into it would move a real, operator-visible order's event into a delivery-layer holding
        // table (`DEC-SYNC-011`'s stuck-cursor shape wearing a POS feature's name). This case
        // touches no entity, so an early straggler costs one counted no-op rather than a phantom
        // order row.
        return;
      }
      case "order.table_assigned": {
        const p = event.payload as TableAssignedP;
        const e = entity(p.order_id);
        e.nodes.set(env.id, p.table_id);
        // Self-reference is EXCLUDED: a malformed event that supersedes itself must not
        // erase itself and take the anchor with it. The availability fold guarded this and
        // this one did not, so two folds gave opposite answers to one malformed input while
        // three places claimed they were identical (oracle P2-8). One engine now, one guard.
        for (const id of p.supersedes) if (id !== env.id) e.tombstones.add(id);
        dirty.add(p.order_id);
        return;
      }
      case "order.line_added": {
        const p = event.payload as LineAddedP;
        // Fix-round F2: a line_added for a DROPPED line key must never
        // re-materialize the cell — the value MVR is what makes a cell render
        // (matrix row 61), so filtering here retires the line for the session.
        // (Edges for a dropped line stay held-but-invisible like any other
        // valueless line; the counter is deliberately unpinned for line-key
        // stragglers — a multi-line event can be partially live.)
        if (droppedLines.has(lineKey(p.order_id, p.line_id))) return;
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
      /**
       * `02-F8`'s pre-confirm removal. **NOT projection-inert, unlike every registry landing
       * before it, and the difference is textual rather than aesthetic:** `02-F9` calls this
       * *"the only partial-confirmation mechanism"*, and a partial confirmation that leaves the
       * line in the order is not partial — the order confirms whole, the KOT prints the
       * unavailable dish and the customer is billed for it. `01-F30` conserves
       * `Σ payments − Σ refunds = billed_total − void_value − comp_value − discounts` and has
       * **no `removed_value` term**, so a line that stayed in `billed_total` after a removal
       * would make the identity unsatisfiable without a `void.recorded` — precisely the event
       * `02-F8` says a pre-confirm removal is NOT. An inert arm here would ship a control that
       * returns without complaint and changes nothing, which is strictly worse than the unbuilt
       * state because the cashier believes the Coke came off.
       *
       * A grow-only SET insert — commutative, idempotent, and reading nothing outside the
       * delivered event (`01-F34`). The projection applies it (see `projectEntity`); NOTHING is
       * deleted here, from the lattice or from the ledger (`02-F5`: *"Nothing is deleted in any
       * of these — pure event composition"*, `01-F1`).
       *
       * **Deliberately NOT in `PARKING_TYPES`.** A removal for a line — or an order — this device
       * has not seen yet is HELD in the set: the tombstone is a fact about a key, and when the
       * `order.line_added` arrives the projection already knows the line is gone. Parking it would
       * move a real operator act into `01-F10`'s delivery-layer holding table, and the straggler
       * case is the ordinary one on a LAN reorder rather than an exotic one.
       */
      case "order.line_removed": {
        const p = event.payload as LineRemovedP;
        const e = entity(p.order_id);
        e.lineTombstones.add(p.line_id);
        dirty.add(p.order_id);
        return;
      }
      /**
       * `02-F6`'s item note, `02-F50`'s quick tag. Also NOT projection-inert: the FR requires it
       * *"printed prominently on the KOT"* and `03 §1` lists `order.note_added` among doc 03's
       * consumed events, so a note that reaches no projection reaches no ticket — `03-F55` gives
       * it a slot on the chit that nothing could fill.
       *
       * Value-keyed insert into a per-line set, held whether or not the line has arrived (matrix
       * row 61). Same parking argument as the removal above.
       */
      case "order.note_added": {
        const p = event.payload as NoteAddedP;
        const e = entity(p.order_id);
        sub(e.lineNotes, p.line_id, () => new Set<string>()).add(p.note);
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
        // immutability, Addendum-A): ANY divergence disputes the key — minus
        // the per-type SUPERSEDED-TOLERATED set (fix-round F8, ruling f): for
        // payment.refunded that set is {payment_id}, the C2-superseded
        // envelope-id parent ref, excluded from the immutable-intent comparison
        // AND the rendered member so client-version skew can never manufacture
        // a dispute.
        const { settlement_attempt_id: _key, ...fullMember } = event.payload as Record<
          string,
          unknown
        >;
        let member = fullMember;
        if (type === "payment.refunded") {
          const { payment_id: _superseded, ...rest } = fullMember;
          member = rest;
        }
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
    // Exhaustiveness (fix-round F5): registry growth must FAIL COMPILE here —
    // a new KnownEventType needs an oracle-pinned merge rule before the engine
    // may consume it; a silent fall-through would still count events_folded
    // (the honesty overcount F5 names).
    /* v8 ignore next -- same proof as the declaration: `type` is `never` here, so the
       compiler has already shown no value arrives. Marked at the CALL SITE too because a
       region directive around the declaration does not reach this line, and an unpaired
       region is how ~68% of this file silently left the measured set once already. */
    assertNever(type);
  };

  const apply = (event: ParsedEvent): ApplyResult => {
    // 26 §3 projection-key sidecar. Key derivation is no longer hardcoded to the order key:
    // `availability.changed` is the first `item:`-keyed event, which is exactly the trigger
    // the engine's own note named for this work. The sidecar answers "which projections does
    // this event touch", and the engine routes on the namespace.
    const keys = keysFor(event);
    // No keys means no projection is touched (01-F52). ZERO fold work, and deliberately NOT
    // counted: `events_folded` is an honesty counter, and incrementing it for an event that
    // folded nothing is precisely the overcount the work-counter pin exists to prevent — the
    // same mistake `availability.changed` made when it was wired to nothing.
    if (keys.length === 0) return { dirty: [], dirtyItems: [], parked: null, drained: [] };
    const itemKey = keys.find((k) => k.startsWith(ITEM_NS));
    if (itemKey !== undefined) {
      foldAvailability(event);
      counters.events_folded += 1;
      return { dirty: [], dirtyItems: [itemKey.slice(ITEM_NS.length)], parked: null, drained: [] };
    }
    const payload = event.payload as OrderRefP;
    const orderId = payload.order_id;
    // Fix-round F2 session memory: a straggler for a DROPPED order key is
    // ledger-retained by the caller but does ZERO fold work here — never
    // folded, never parked, never projected, and never counted (the honesty
    // counter must not claim work; oracle-pinned counter treatment).
    if (droppedOrders.has(orderId)) return { dirty: [], dirtyItems: [], parked: null, drained: [] };
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
      return { dirty: [], dirtyItems: [], parked: row, drained: [] };
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
    return { dirty: [...dirty], dirtyItems: [], parked: null, drained };
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
    // Confirm anchor: set-wise argmin over (branch_created_at, event id) — matrix row
    // 57's ONE-EPOCH branch, unblocked by DEC-TIME-001 (that cell was explicitly
    // "BLOCKED" pending the time layer; T-01-17 lands it).
    //
    // The mixed-epoch fallback argmin(payloadHash, id) is RETIRED, and matrix §(e)
    // says why it had to be: `order.confirmed`'s payload is `{order_id}` alone, so
    // every member hashes identically and the tiebreak always fell through to
    // `envelope.id` — which makes the projected VALUE depend on which id happened to
    // sort first. Under a bijective id relabel the winner changes and `confirmed_at`
    // moves, breaking 01-F34 invariance (caught by time-invariance.test.ts, and
    // latent under the old device_created_at stamping too).
    //
    // Branch-consensus time is precisely what makes `min` meaningful again: with all
    // members on ONE clock (01-F43), the earliest confirm is a real fact rather than
    // "whichever device's clock was furthest behind". The id term now only breaks
    // ties between members with the SAME stamp — so it selects a canonical member
    // without ever changing the projected value, which is what invariance requires.
    // BASIS PRECEDENCE first (01-F45, adversarial review H2): a `branch_provisional`
    // stamp IS the raw device clock (offset 0), so under a plain earliest-wins rule a
    // device whose clock is behind ALWAYS wins — a tablet powered on before the counter
    // would set every order it confirms years in the past, converged identically on
    // every screen. Verified members are therefore selected among first; provisional
    // ones are used only when no verified confirm exists, because an imperfect age is
    // better than none. This is a partition of the delivered set, so selection stays
    // set-determined and order-independent (01-F34) — the id term still only breaks
    // ties between EQUAL stamps within the chosen tier, never moving the value.
    let anchor: { stamp: number; id: string; verified: boolean } | null = null;
    for (const [id, c] of e.confirms) {
      const better =
        anchor === null ||
        (c.verified && !anchor.verified) ||
        (c.verified === anchor.verified &&
          (c.stamp < anchor.stamp || (c.stamp === anchor.stamp && id < anchor.id)));
      if (better) anchor = { stamp: c.stamp, id, verified: c.verified };
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
    // Accumulated in BigInt (T-01-22, DEC-MONEY-005 fold clause). A running double
    // total is NOT associative near 2^53, so delivery order would decide the money
    // outcome through schema-valid payloads — the exact failure 26 §2 exists to
    // remove, and a live 01-F34 break rather than a theoretical one.
    let payTotal = 0n;
    let repaidTotal = 0n;
    let refundTotal = 0n;
    const payAttempts: Record<string, Record<string, unknown>[]> = {};
    const refundAttempts: Record<string, Record<string, unknown>[]> = {};
    // BigInt (adversarial review M1): this accumulator decides `cap_violated`, and it
    // sums across Map iteration order = INGEST order. A raw double `+` is non-associative
    // near 2^53, so two devices with different delivery orders could compute different
    // `claimed` and disagree on the flag — the same 01-F34 break the totals above were
    // migrated to fix, in the one accumulator T-01-22 left behind. Neither operand was a
    // money-named identifier or member, so the widened lint rule does not reach it either.
    const maxRefundClaimByParent = new Map<string, bigint>();
    for (const [attempt, cell] of e.pay) {
      const members = [...cell.keys()]
        .sort(utf16)
        .map((k) => cell.get(k) as Record<string, unknown>);
      payAttempts[attempt] = members;
      if (cell.size === 1) {
        const m = members[0] as Record<string, unknown>;
        if (m.purpose === "repays_receivable") repaidTotal += BigInt(m.amount_paisa as number);
        else payTotal += BigInt(m.amount_paisa as number);
      } else exceptions.add("attempt_divergence");
    }
    for (const [attempt, cell] of e.refund) {
      const members = [...cell.keys()]
        .sort(utf16)
        .map((k) => cell.get(k) as Record<string, unknown>);
      refundAttempts[attempt] = members;
      if (cell.size === 1) {
        const m = members[0] as Record<string, unknown>;
        refundTotal += BigInt(m.amount_paisa as number);
      } else exceptions.add("attempt_divergence");
      // Cap contributions (fix-round F3): EVERY member is a witnessable
      // sub-view choice. A sub-view keeps at most one member per attempt key,
      // so group this key's members by the parent they name and carry the
      // LARGEST claim per parent.
      const claimByParent = new Map<string, number[]>();
      for (const m of members) {
        sub(claimByParent, m.payment_attempt_id as string, () => []).push(m.amount_paisa as number);
      }
      for (const [parent, amounts] of claimByParent) {
        let largest = amounts[0] as number;
        for (const a of amounts) if (a > largest) largest = a;
        maxRefundClaimByParent.set(
          parent,
          (maxRefundClaimByParent.get(parent) ?? 0n) + BigInt(largest),
        );
      }
    }
    // 01-F29 cap (fix-round F3, ruling a): an ORDER-FREE monotone function of
    // the delivered SET — violated iff SOME agreed sub-view busts the cap,
    // resolving parents by settlement_attempt_id (Addendum-A — envelope-id
    // keying fragments the cap). A sub-view keeps one member per attempt key,
    // so the easiest witness pairs each parent's SMALLEST payment member
    // against the largest refund claims naming it. Never a stateful latch —
    // delivery order cannot be smuggled in (01-F34): a later divergent member
    // moves the TOTALS above (Addendum-A) but only ever WIDENS the sub-view
    // choice, so the flag never regresses. A parent with no delivered payment
    // member rests at unknown, never violated.
    let capViolated = 0;
    for (const [attempt, cell] of e.pay) {
      const claimed = maxRefundClaimByParent.get(attempt);
      if (claimed === undefined) continue;
      let floor: bigint | null = null;
      for (const m of cell.values()) {
        const amount = BigInt(m.amount_paisa as number);
        if (floor === null || amount < floor) floor = amount;
      }
      if (floor !== null && claimed > floor) capViolated = 1;
    }
    // Lines: value MVR + edge-set workflow projection.
    const cells: Record<
      string,
      LineValue & { states: string[]; anomalies: Record<string, string>; notes?: string[] }
    > = {};
    let billedEffective = 0n;
    let linesTotal = 0;
    let linesReady = 0;
    for (const [lineId, values] of e.lineValues) {
      /**
       * `02-F8`/`02-F9` — the tombstone set applied, and applied HERE rather than at fold time so
       * the result is a pure function of two grow-only sets and cannot depend on which of the two
       * events arrived first (`01-F34`; see `Entity.lineTombstones`).
       *
       * `continue` before ANYTHING is computed, which is what makes the three derivations agree.
       * The cell never enters `json_lines` (so `billedEffectiveFromJsonLines` — what
       * `main/gateway.ts` feeds `OpenOrder.total_paisa` from — cannot see it), the `billedEffective`
       * accumulator directly below never adds it (that one is NOT a column: it is the input to
       * `01-F33`'s `uncovered_addition` ceiling check, so a removal that dropped the cell and kept
       * the money would read right in the cart and flag an addition nobody made), and `linesTotal`
       * never counts it (`03-F25`'s queue would otherwise put a phantom dish on the cook's ticket).
       *
       * The line's NOTES go with it (M4): they render on the cell, and there is no cell. `03-F55`
       * puts a note inside its item's block, so an orphan note has nowhere legal to print at all.
       *
       * `line_value_conflict` is deliberately not raised for a removed line either — a line that
       * is gone has no value left to disagree about.
       */
      if (e.lineTombstones.has(lineId)) continue;
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
      /**
       * `02-F6` M2's rendering — sorted by TEXT, never by the id of the event that added the note
       * and never by arrival.
       *
       * Sorting by envelope id is an id comparison REACHING A PROJECTED VALUE, which is the exact
       * `01-F34` break and one that survives plain convergence testing: every replica agrees, and
       * the agreed answer still moves under a bijective relabel because UUIDv7 puts wall clock in
       * the id prefix. `26 §8` names this as the binding oracle lesson. A text sort is
       * set-determined, so the projection is invariant under both a relabel and a clock injection.
       *
       * `utf16` is safe here for its declared precondition — a Set spread holds distinct members.
       */
      const notes = [...(e.lineNotes.get(lineId) ?? [])].sort(utf16);
      cells[lineId] = {
        ...v,
        states: lp.states,
        anomalies: lp.anomalies,
        // Spread conditionally: a line with no note carries no key rather than an empty array —
        // see `BilledLineCell.notes` for why absence is the honest rendering here.
        ...(notes.length === 0 ? {} : { notes }),
      };
      // The declared-once billed rule (billedCellPaisa; T-01-11 fix round F4):
      // exited-decided zero, contested per the policy constant.
      billedEffective += billedCellPaisa(cells[lineId] as BilledLineCell);
      const decidedExited = lp.states.length === 1 && EXITED.has(lp.states[0] as string);
      if (decidedExited) continue;
      linesTotal += 1;
      if (lp.cookingDone) linesReady += 1;
    }
    // 01-F33: settlement is an ACT (monotone OR over the close G-Set); a late
    // line-add never reopens — it raises uncovered_addition against the closes'
    // attested ceiling. Fix-round F4 (ruling d): the ceiling is the LARGEST
    // VALID integer snapshot among delivered closes — an attested `0` is
    // ATTESTED ZERO (a real ceiling), an ABSENT snapshot asserts NO ceiling
    // ("no attestation" is not "attested zero"), and with no valid snapshot at
    // all the check is skipped. A non-integer or negative snapshot is
    // ignored-with-anomaly: the ACT still settles, the bad snapshot contributes
    // no ceiling and raises close_snapshot_invalid instead — a pure function of
    // the payload, so session ≡ reopen byte-for-byte.
    //
    // ⚠ **THE CEILING IS `billed_effective_paisa` AND NOT `billed_paisa` (01-F33 as
    // amended August 2026; measured, both directions).** It was `billed_paisa`, and
    // post-01-F82/02-F63 that field is the ROUNDED, TAX-INCLUSIVE charge while
    // `billedEffective` above is the raw, tax-blind, unrounded line sum — two
    // different quantities on the two sides of one `>`. A charge that rounded DOWN
    // sits below its own line sum, so `uncovered_addition` — which means *a line was
    // added after the close* — fired on a correctly settled order that nobody touched
    // (measured: posture `none`, step 1000, one Rs 404 line, `["uncovered_addition"]`);
    // and under `exclusive` the charge sits ABOVE the line sum by the tax, so any
    // post-close addition up to the tax was invisible (measured: 16 %, a genuine
    // Rs 60 line added after the act, `[]`). The fold cannot hold the charge and this
    // is not a limitation to route around: `01-F87`/`01-F52` ban configuration as a
    // fold input, and a projection keyed on an org-typed rate makes two tills at
    // different configuration versions project different money. So the CEILING is the
    // one quantity both sides can express — the fold's own accumulator — attested by
    // the emitter beside the charge (`01-F63`, `settlement-closer.ts`).
    //
    // `billed_paisa` is still VALIDATED here, and that is deliberate: 01-F63 calls the
    // whole payload "the attested snapshot", so either money field arriving malformed
    // is bad evidence and raises the anomaly while the act stands. It is simply no
    // longer read as a ceiling by anything.
    const settled = e.closes.size > 0 ? 1 : 0;
    if (settled === 1) {
      let ceiling: number | null = null;
      for (const close of e.closes.values()) {
        const c = close as ClosedP;
        if ("billed_paisa" in c && !isAttestedPaisa(c.billed_paisa))
          exceptions.add("close_snapshot_invalid");
        if (!("billed_effective_paisa" in c)) continue;
        const snap = c.billed_effective_paisa;
        if (!isAttestedPaisa(snap)) {
          exceptions.add("close_snapshot_invalid");
          continue;
        }
        if (ceiling === null || snap > ceiling) ceiling = snap;
      }
      if (ceiling !== null && billedEffective > BigInt(ceiling))
        exceptions.add("uncovered_addition");
    }
    // Render the money columns (T-01-22). A total the fold cannot represent EXACTLY
    // contributes ZERO and raises `money_overflow` — the 01-F31 disputed-key
    // precedent, and the only order-free choice: a "sum of the representable prefix"
    // would be a delivery-order artifact, and clamping to MAX_SAFE_INTEGER is exactly
    // the silent truncation the ban exists to prevent. Members are still retained and
    // rendered in the attempts maps (01-F1) — nothing is picked or dropped, only the
    // derived TOTAL declines to print a number it cannot stand behind. Never throws:
    // this runs on the ingest path, where a throw would wedge sync (01-F17).
    const renderTotal = (value: bigint): number => {
      const exact = safeNumber(value);
      if (exact === null) exceptions.add("money_overflow");
      return exact ?? 0;
    };
    const payRendered = renderTotal(payTotal);
    const repaidRendered = renderTotal(repaidTotal);
    const refundRendered = renderTotal(refundTotal);
    if (safeNumber(billedEffective) === null) exceptions.add("money_overflow");
    const order: OpenOrderRow = {
      order_id: e.order_id,
      channel,
      order_type: orderType,
      confirmed_at: anchor?.stamp ?? null,
      settled,
      table_ids_json: canonicalJson(tableIds),
      table_conflict: tableIds.length > 1 ? 1 : 0,
      pay_total: payRendered,
      repaid_total: repaidRendered,
      refund_total: refundRendered,
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
    // Callers pass ids from apply()'s dirty sets, so the entity always exists
    // (foldIn creates it) — a miss would be an engine invariant violation.
    return projectEntity(entities.get(orderId) as Entity);
  };

  const rebuild = (events: readonly ParsedEvent[]): void => {
    counters.full_rebuilds += 1;
    entities = new Map();
    items = new Map();
    parkedByKey = new Map();
    parkedRowsById = new Map();
    // The fold is a pure function of the SET — replay order is irrelevant; the
    // key-presence park/drain machinery absorbs child-before-parent (01-F10).
    // Session dropped-key memory (F2) deliberately survives: an in-session
    // refold() must not resurrect dropped keys; only a reopen's fresh engine
    // legitimately rebuilds them (fix-round ruling b).
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
      availability: availabilitySnapshot(),
    };
  };

  /** One item's availability row (the `item:`-key analogue of `projectOrder`). */
  const projectItemKey = (itemId: string): AvailabilityRow =>
    availabilityRowOf(itemId, items.get(itemId) ?? new Map());

  const parkedRows = (): ParkedRow[] => [...parkedRowsById.values()];

  const planDrop = (keys: readonly string[]): DropPlan => {
    // Fix-round F1/F8: parse and guard EVERY key before planning anything — a
    // malformed key or an open entity rejects the whole call, and nothing has
    // moved: not the lattice, not the memory, not a row.
    const parsedKeys = keys.map((key) => ({ key, parsed: parseDropKey(key) }));
    for (const { key, parsed } of parsedKeys) {
      // Resolve through the get-or-create seam: an unknown key resolves to an
      // empty entity, whose zero closes fail the same guard (an empty entity
      // renders nothing, so the side effect is invisible).
      const e = entity(parsed.order_id);
      // Open-bill guard: prune only ever removes CLOSED entities (01-F42/01-F17).
      if (e.closes.size === 0) {
        throw new Error(
          `retentionDrop of ${key}: the order has no settlement_closed — ` +
            "the open-bill guard forbids pruning an open entity (01-F42/01-F17; nothing changed)",
        );
      }
    }
    const removedOrders = new Set<string>();
    for (const { parsed } of parsedKeys) {
      if (parsed.kind === "order") removedOrders.add(parsed.order_id);
    }
    const lineDrops = new Map<string, Set<string>>();
    for (const { parsed } of parsedKeys) {
      // A line key under an order dropped in the SAME call is SUBSUMED by the
      // wholesale order drop (F1 atomic-success, ruling g) — outcome class and
      // final bytes are key-order independent because the plan is computed
      // over key SETS, never in key-array order.
      if (parsed.kind === "line" && !removedOrders.has(parsed.order_id)) {
        sub(lineDrops, parsed.order_id, () => new Set<string>()).add(parsed.line_id);
      }
    }
    const dirty: Array<{ order_id: string; projection: ProjectedOrder | null }> = [];
    for (const [orderId, lines] of lineDrops) {
      const e = entities.get(orderId) as Entity; // guarded above — the entity exists
      // The post-drop view, projected WITHOUT mutating (shrink is the
      // outer-layer key-set drop, never an inverse merge) — which is what lets
      // the store commit all SQL before any lattice mutation (fix-round F6).
      dirty.push({
        order_id: orderId,
        projection: projectEntity({
          ...e,
          lineValues: new Map([...e.lineValues].filter(([lineId]) => !lines.has(lineId))),
          lineEdges: new Map([...e.lineEdges].filter(([lineId]) => !lines.has(lineId))),
        }),
      });
    }
    return { removedOrders: [...removedOrders], lineDrops, dirty };
  };

  const commitDrop = (plan: DropPlan): void => {
    for (const orderId of plan.removedOrders) {
      entities.delete(orderId);
      takeParkedFor(orderId); // rows are already gone via the store's waiting_for delete
      droppedOrders.add(orderId);
    }
    for (const [orderId, lines] of plan.lineDrops) {
      const e = entities.get(orderId) as Entity; // survived the drop by plan construction
      for (const lineId of lines) {
        e.lineValues.delete(lineId);
        e.lineEdges.delete(lineId);
        droppedLines.add(lineKey(orderId, lineId));
      }
    }
  };

  return {
    apply,
    rebuild,
    projectOrder,
    projectItemKey,
    snapshot,
    parkedRows,
    stats: () => ({ ...counters }),
    planDrop,
    commitDrop,
  };
};
