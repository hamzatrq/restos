// Typed event registry (01-F4): producing or parsing an unknown event type is an
// error, never silent acceptance. Seed catalog per 01 §4 — the full catalog lands
// with its consuming modules via spec-cited PRs.
import { z } from "zod";
import { type EventEnvelopeT, parseEnvelope } from "./envelope.js";
import { ORDER_LINE_STATES } from "./states.js";

export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`unknown event type: ${type} (01-F4 — event types live in the domain catalog only)`);
    this.name = "UnknownEventTypeError";
  }
}

/**
 * Tender methods (`02-F12` + `01-F32`). Declared once, here, because `18 §4` says a domain type
 * is declared in `domain` and redeclaring it elsewhere is a violation rather than a convenience.
 *
 * - `cash` · `card` · `raast` — `02-F12`'s three tenders. Card is a manual record at launch.
 * - `khata_credit` — `02-F14`; needs a linked customer, and `DEC-MONEY-007` makes its later
 *   repayment a `repays_receivable` payment so a repaid tab can never read as overpaid.
 * - `aggregator_receivable` — `01-F32`; the order is settled but the money arrives later from
 *   the aggregator, and doc 08 reconciles it against payouts.
 */
/**
 * Order channels (`02-F42`, the tags `02-F1` already names). Declared once, here, for the same
 * `18 §4` reason as `PAYMENT_METHODS` below.
 *
 * **This is a PRICE KEY, not a report category** — which is why it is closed. `01-F60` resolves a
 * line's `unit_price_paisa` from the order's channel, and `01-F53` snapshots that into the event
 * at line-add, so a typo is not a mislabelled row: it is a **wrong price frozen in an append-only
 * ledger** where `01-F1` allows no edit, only a linked correction. An open string fails nowhere
 * and is discovered as thin margin months later.
 *
 * **`channel` and `order_type` are different axes and neither substitutes for the other**
 * (`02-F1`). `dine_in`/`takeaway`/`delivery` are *types*; a channel drawn from that vocabulary is
 * invalid. That confusion is not hypothetical — `channel: "dine_in"` sat in 45 fixture sites
 * across 26 files from Wave 0 until `59d601a`, invisible because the field accepted any string.
 */
export const ORDER_CHANNELS = ["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "raast",
  "khata_credit",
  "aggregator_receivable",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * `02-F23`'s "system-expected cash (by method)" — EXHAUSTIVE over the closed tender set, with
 * explicit zeros. Derived from `PAYMENT_METHODS` rather than transcribed, so a sixth tender
 * cannot be added to the enum and silently skipped here.
 *
 * Exhaustive because a partial map cannot tell "no card sales this shift" from "the card figure
 * was never computed", and `01-F32`/`DEC-MONEY-007` make `khata_credit` and
 * `aggregator_receivable` behave differently in `01-F30` conservation — a dropped bucket is
 * money that vanishes from the reconciliation the cashier signs. Strict for the same reason
 * `02-F42` closed `payment.recorded.method`: a sixth key is a category no report knows to count.
 *
 * Signed integers: a method's expected figure nets `payment.refunded` against `payment.recorded`.
 */
const expectedPaisaByMethod = z.strictObject(
  Object.fromEntries(PAYMENT_METHODS.map((method) => [method, z.number().int()])) as Record<
    PaymentMethod,
    z.ZodNumber
  >,
);

/**
 * `14-F3` — one price cell that moved, which is the *"450 → 480"* half of the FR's own example
 * (*"price changed by Ali, 2 Jul, 450 → 480"*). Only cells that actually changed appear, so an
 * edit that renamed an item carries an empty list rather than its whole grid.
 *
 * **This is a DELTA, not an entity body**, and the distinction is what keeps `01-F52` intact. The
 * hazard `01-F52` names is a ledger event that carries the catalog — from which a reader could
 * reconstruct a menu and start folding it. A before/after pair for one `(branch, channel)` cell
 * carries no name, no station, no parent and no grid shape; nothing can rebuild a menu from it.
 *
 * **Why the numbers are carried rather than resolved from `before_ref`/`after_ref`.** The refs are
 * `payloadHash` digests — one-way, and nothing in the corpus indexes by them, so "resolve the ref"
 * would in fact mean "re-read the entity at version N-1 from the catalog store". That makes the
 * audit trail a *derived* read of mutable reference data: it decays when `01-F52`'s snapshot+delta
 * history is compacted (`450 → 480` becomes `— → —`), and it can be changed after the fact by a
 * later publish or a restore, which is the one thing commandment 1 forbids of a history. The refs
 * stay, unchanged, as the integrity handles `14 §16` names — the numbers are the record.
 *
 * `01-F53` is untouched by this: a line's price is captured into `order.line_added` from the
 * CATALOG at line-add. This is a display surface and never a price source; nothing resolves a
 * price by reading history.
 *
 * `null` on either side is a real state and both are constructible: `before_paisa === null` is a
 * cell that did not exist (a new entry, or a newly enabled channel), `after_paisa === null` a cell
 * the edit dropped. Collapsing either to `0` would print "free" where the truth is "absent" —
 * exactly the confusion `01-F60`'s explicit-zero rule exists to prevent.
 */
export const CatalogPriceChange = z.strictObject({
  branch_id: z.string().min(1),
  channel: z.enum(ORDER_CHANNELS),
  before_paisa: z.union([z.number().int().nonnegative(), z.null()]),
  after_paisa: z.union([z.number().int().nonnegative(), z.null()]),
});
export type CatalogPriceChangeT = z.infer<typeof CatalogPriceChange>;

// Payloads are loose objects: required fields are law; extra fields pass through
// (additive evolution, 00 §6) and are preserved for consumers.
const payloadSchemas = {
  "order.created": z.looseObject({
    order_id: z.string().min(1),
    // 02-F42 — a CLOSED set, because 01-F60 makes this the key a line's price resolves from.
    // Required, and deliberately so: an order with no channel has no resolvable price at all.
    channel: z.enum(ORDER_CHANNELS),
    // Optional declared fields, additive under schema_version 1 (00 §6; T-01-04).
    order_type: z.string().min(1).optional(),
    table_id: z.string().min(1).optional(),
  }),
  "order.confirmed": z.looseObject({
    order_id: z.string().min(1),
  }),
  "order.line_added": z.looseObject({
    order_id: z.string().min(1),
    line_id: z.string().min(1),
    item_id: z.string().min(1),
    qty: z.number().int().positive(), // integer units (00 §6)
    unit_price_paisa: z.number().int().nonnegative(), // snapshotted at line-add, never re-derived (01-F18)
  }),
  // 01-F22 / 01-F57: an operational toggle, never a catalog edit. `supersedes` is the
  // carried causal link — the ONLY thing that makes this converge, exactly as for
  // `order.table_assigned`. "Latest wins" would need a clock or an id comparison, and both
  // are banned from folds (01-F45, 01-F34).
  "availability.changed": z.looseObject({
    item_id: z.string().min(1),
    available: z.boolean(),
    supersedes: z.array(z.string().min(1)),
    reason: z.string().min(1).optional(),
  }),
  /**
   * `01-F52` / `14 §` / `15 §` — an AUDIT record that a catalog version exists. It is in the
   * `01 §4` catalog and was missing from this registry, which `01-F4` turns into a runtime
   * error at emit: doc 14's back office could not record a menu edit at all.
   *
   * **It does not carry the catalog** (`01-F52`), and the device never consumes it — a device
   * learns its catalog is stale by comparing versions on `hello_ack` and fetching
   * (`plans/wave-1/catalog-transport.md` §3.1). Its consumer is the back-office history view
   * (`14-F6` price history), which is why the payload is actor + before/after REFS rather than
   * entity bodies: a ledger event that carried the menu would make the catalog ledger data,
   * contradicting `01-F52` in the same breath as satisfying it.
   *
   * **`01-F62` (August 2026) makes this ORG-SCOPED**: it carries `org_id`, no `branch_id` and no
   * branch stamp, and its ordering authority is `server_received_at` (`01-F18`). It never enters a
   * branch stream and no device folds it — which is why a server clock is legitimate here and is
   * not the `01-F43` device-clock threat wearing a disguise.
   */
  "catalog.changed": z.looseObject({
    /** The catalog entity edited — `item`, `variant`, `category`, `modifier_group`. */
    entity: z.string().min(1),
    entity_id: z.string().min(1),
    /** The org catalog version this edit produced. Devices compare against it; see §3.2. */
    version: z.number().int().positive(),
    /**
     * `14 §`'s before/after REFS. Opaque content-addressed handles into the published
     * snapshot, never inline entity bodies — see the note above.
     */
    before_ref: z.union([z.string().min(1), z.null()]),
    after_ref: z.union([z.string().min(1), z.null()]),
    /**
     * `14-F3` — the cells that moved, so the history can render *"450 → 480"*. See
     * `CatalogPriceChange`.
     *
     * **Optional HERE and required at the WRITER, and that is not a relaxation** — the same split
     * `01-F60` already makes for `CatalogEntryWire.prices`. Making it required in this schema
     * would be a *retroactive* requirement on an **append-only** ledger (commandment 1): every
     * `catalog.changed` written before August 2026 lacks the field, and `parseEvent` would refuse
     * to read the history this FR exists to render. Absent therefore means "predates the field",
     * which is a different fact from `[]` ("this edit moved no price") — and both are different
     * from a writer that forgot, which is why `services/api`'s `LedgerRecord` types it as
     * REQUIRED and possibly empty. The distinction the two levels buy is exactly the one
     * `01-F60`'s explicit zero buys: absence and nothing are not the same answer.
     */
    price_changes: z.array(CatalogPriceChange).optional(),
  }),
  "order.table_assigned": z.looseObject({
    order_id: z.string().min(1),
    table_id: z.string().min(1),
    // T-01-15 (01-F34 rewritten): the carried causal link — the ONLY thing that makes
    // the table anchor converge (matrix §3). Required; [] legal (a root assignment).
    supersedes: z.array(z.string().min(1)),
    // Names the origin table (null when none) so `table:<from>` is nameable — no ghost
    // chip, and the hub can compute the 01-F41 delivery halt (matrix §3).
    from_table_id: z.union([z.string().min(1), z.null()]),
  }),
  "kot.printed": z.looseObject({
    order_id: z.string().min(1),
  }),
  /**
   * `03-F5`'s third consequence: "`kot.print_failed` is emitted (consumed by doc 05 alarms)".
   * The type is `01 §4` catalog vocabulary already; this is its payload, and without it the
   * emission `03-F5` requires is a `01-F4` runtime error rather than a ledger record.
   *
   * TWO fields, because `03-F5` names exactly two nouns and rests its whole design on them —
   * "naming the printer and order ('KOT #142 did not print — grill printer offline')". `05-F3`
   * raises the same fact on the manager console ("the kitchen can't print" must reach the
   * manager off the floor), and a console alarm that cannot say WHICH printer sends someone
   * walking. `printer_name` rather than a printer id because no printer registry exists yet
   * (`03-F2`'s routing table is doc-14 work) and an id nothing resolves is worse than a name.
   */
  "kot.print_failed": z.looseObject({
    order_id: z.string().min(1),
    printer_name: z.string().min(1),
  }),
  "order.line_state_changed": z.looseObject({
    order_id: z.string().min(1),
    line_ids: z.array(z.string().min(1)).min(1),
    state: z.enum(ORDER_LINE_STATES),
    // T-01-15 (01-F34/01-F35): per-line edge context — without `from_states` the event
    // is a value, not an edge (legality judgeable only from comparator position);
    // without `preds` concurrency is undetectable. Required, per-line, because a
    // multi-line event's lines sit at different heads (matrix §3). `from_states` pins
    // min 1: ∀ over ∅ is vacuously legal (Addendum-C).
    line_context: z.record(
      z.string().min(1),
      z.looseObject({
        to: z.enum(ORDER_LINE_STATES),
        from_states: z.array(z.enum(ORDER_LINE_STATES)).min(1),
        preds: z.array(z.string().min(1)),
      }),
    ),
  }),
  "payment.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    /**
     * A CLOSED set, not a free string. `02-F12` names four tender methods and `01-F32` names
     * the fifth; `payment.refunded` next door has been a closed enum since it was written, and
     * a settlement method that is open while a refund method is closed is an asymmetry with no
     * justification behind it.
     *
     * It matters more than tidiness because the method is not decoration: `02-F17` feeds it to
     * channel economics (docs 12/13) and to tax posture (doc 16), and `01-F32`/`DEC-MONEY-007`
     * make `aggregator_receivable` and `khata_credit` behave DIFFERENTLY in conservation. A
     * typo'd method would not fail anywhere — it would quietly become a sixth category that no
     * report knows to count, in an append-only ledger where it cannot be corrected in place.
     */
    method: z.enum(PAYMENT_METHODS),
    settlement_attempt_id: z.string().min(1), // 01-F31: double-taps cannot double-record
    /**
     * The shift this settlement buckets to (`26 §7`: shift/day/drawer bucketing of a payment is
     * "a **carried key**", explicitly not an ordering question). Carried because the alternative
     * — a fold asking "which shift was open when this payment arrived?" — reads the READING
     * device's state, so two devices project different money from the same event set: the
     * `01-F34` break law 1 exists to prevent.
     *
     * REQUIRED AND NULLABLE. `null` is `02-F37`'s "null shift reference": settling with no shift
     * open **succeeds** (`01-F17` forbids blocking the sale — a customer is standing there), and
     * the null is the record that it happened. Required rather than optional because `null` is a
     * stated fact and `undefined` is a forgotten field, and an optional field cannot tell them
     * apart.
     */
    shift_id: z.union([z.string().min(1), z.null()]),
    // T-01-15 (01-F30/01-F32, DEC-MONEY-007): the khata discriminator — without it the
    // settlement and its later repayment double-count under full observation (matrix §3).
    // Required: an unpurposed payment is neither tendering nor repayment.
    purpose: z.enum(["settles_order", "repays_receivable"]),
  }),
  "payment.refunded": z.looseObject({
    // T-01-15 (01-F29 amended): the order key is CARRIED, never resolved through the
    // parent — the late-resolving-entity trap's one-field fix (26 §4).
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    method: z.enum(["cash_out", "raast_reversal_ref", "khata_credit"]),
    // 01-F31: the refund's OWN idempotency key — a double-tapped manager approval
    // must dedupe.
    settlement_attempt_id: z.string().min(1),
    // 01-F29: the parent payment's settlement_attempt_id — the cap resolves parents by
    // attempt id, never envelope id (an intent under two envelope ids fragments an
    // id-keyed cap, 26 §8). `payment_id` (envelope-id ref) is superseded: no longer
    // required, tolerated as a loose extra.
    payment_attempt_id: z.string().min(1),
  }),
  // T-01-15 (01-F33): settlement is an ACT, not a derivation — the cashier-emitted,
  // offline-legal closing fact `settled` folds as a monotone OR over. Snapshot fields
  // beyond order_id are additive loose extras until the oracle pins them (T-01-15
  // addendum: proposed in the implementer's report, pinned in a follow-up).
  "order.settlement_closed": z.looseObject({
    order_id: z.string().min(1),
  }),
  // ── The service surface (02-F21..F26): shifts, the business day, the drawer. ──────────
  // `26 §7` decides the shape of all seven: bucketing is a CARRIED KEY, duplicate shift/day
  // open needs a CARRIED CAUSAL LINK (`prev_shift_id`), and over/short is a CARRIED FACT.
  // Nothing here may be resolved at fold time from the reading device's state (01-F34).
  "shift.opened": z.looseObject({
    // 02-F22: the shift a cashier's subsequent settlements and drawer events bind to.
    shift_id: z.string().min(1),
    // 26 §7's carried causal link for "duplicate shift/day open". Two devices opening a shift
    // after a partition both name the same predecessor, so the fork is visible IN THE EVENT SET
    // instead of needing a clock or an id comparison (01-F45, 01-F34). Required; null is the
    // branch's first shift ever, which a non-nullable link would make unemittable.
    prev_shift_id: z.union([z.string().min(1), z.null()]),
  }),
  "shift.closed": z.looseObject({
    shift_id: z.string().min(1),
    // 02-F23: "system-expected cash (by method)" — see `expectedPaisaByMethod`.
    expected_paisa_by_method: expectedPaisaByMethod,
    counted_cash_paisa: z.number().int().nonnegative(),
    // 02-F23's over/short, SIGNED: "over/short" is two directions, and a magnitude-only field
    // can record an over but not a short — the half that costs a cashier their job. Carried,
    // not recomputed: re-deriving "expected" at read time silently changes a number the cashier
    // already signed once a late payment arrives, which `01-F1` forbids.
    variance_paisa: z.number().int(),
  }),
  "day.opened": z.looseObject({
    day_id: z.string().min(1),
    // 02-F22: "opening float entry → day.opened" — the float IS the entry. A magnitude: cash is
    // physically placed in the drawer, and 0 (an empty drawer) is legal and distinct from absent.
    opening_float_paisa: z.number().int().nonnegative(),
    // 26 §7 names duplicate shift/day open as ONE row — the day carries the same link.
    prev_day_id: z.union([z.string().min(1), z.null()]),
  }),
  "day.closed": z.looseObject({
    day_id: z.string().min(1),
    // 02-F24: "manager cash count + deposit record" — the count is the act.
    counted_cash_paisa: z.number().int().nonnegative(),
  }),
  "cash.drawer_opened": z.looseObject({
    // 02-F21: "cash.drawer_opened with reason=no_sale, logged and counted (classic theft
    // vector)". The set is NOT closed: the FR names one value and implies others exist, and
    // closing it here would be inventing an FR.
    reason: z.string().min(1),
    // 02-F22: "a shift binds subsequent cash settlements AND DRAWER EVENTS to that cashier";
    // 26 §7: drawer bucketing is a carried key. Nullable for 02-F21's own reason — an unbound
    // drawer open that the schema refused would go UNLOGGED, which is the theft vector itself.
    shift_id: z.union([z.string().min(1), z.null()]),
  }),
  "cash.paid_out": z.looseObject({
    // 02-F26 names reason + receipt ref but not the amount. Required anyway: `02-F23`'s
    // system-expected cash cannot be computed if cash may leave the drawer without saying how
    // much. A magnitude — direction comes from the event type, and a negative paid-out is a
    // deposit in disguise that would net the drawer the wrong way.
    amount_paisa: z.number().int().nonnegative(),
    reason: z.string().min(1),
    // 02-F26: "receipt photo (object storage ref)".
    receipt_photo_ref: z.string().min(1),
    // Petty cash leaves a particular cashier's drawer (02-F22, 26 §7); nullable as above.
    shift_id: z.union([z.string().min(1), z.null()]),
  }),
  "cash.deposit_recorded": z.looseObject({
    amount_paisa: z.number().int().nonnegative(),
    // 02-F24 emits the deposit record with the day close, so it buckets to a day (26 §7).
    day_id: z.string().min(1),
  }),
} as const;

export type KnownEventType = keyof typeof payloadSchemas;

// Audit family (01-F5; 01 §4 admin-family `audit.*` wildcard). These five concrete
// subtypes are ordinary kernel events, hash-chained per device. The chain link lives in
// the PAYLOAD as `prev_audit_hash: string | null` (store-owned platform law, 01 §7) —
// NOT the envelope, because `EventEnvelope` is a strict z.object that strips unknown keys
// (DEC-AUDIT-001 decision 2). At v1 the chain field is the whole payload contract; the
// business fields (who/what) land additively with the emitting modules (docs 05/14/15),
// and `actor_user_id` already carries "who". Kept OUT of `payloadSchemas`/`KnownEventType`
// on purpose: audit events fold to nothing (the fold engine consumes KnownEventType only),
// so the fold layer never needs an audit case.
const auditPayloadSchema = z.looseObject({
  prev_audit_hash: z.union([z.string().min(1), z.null()]),
});

const auditPayloadSchemas = {
  "audit.login": auditPayloadSchema,
  "audit.drawer_opened": auditPayloadSchema,
  "audit.reprint": auditPayloadSchema,
  "audit.threshold_override": auditPayloadSchema,
  "audit.settings_changed": auditPayloadSchema,
} as const;

/** The closed set of audit.* subtypes (01-F5). Iterable — `[...AUDIT_EVENT_TYPES]`. */
export const AUDIT_EVENT_TYPES = Object.keys(auditPayloadSchemas) as readonly AuditEventType[];

export type AuditEventType = keyof typeof auditPayloadSchemas;

const AUDIT_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);

/** True for exactly the five audit.* subtypes — the store stamps the chain for these only. */
export const isAuditEvent = (type: string): boolean => AUDIT_TYPE_SET.has(type);

// Combined lookup for parse-time payload validation (01-F4) across both families — the
// fold-consumed `payloadSchemas` and the fold-inert `auditPayloadSchemas`.
const ALL_PAYLOAD_SCHEMAS: Record<string, z.ZodType> = {
  ...payloadSchemas,
  ...auditPayloadSchemas,
};

/**
 * @unreached-owed The `01 §4` catalog as a queryable thing — "is this a known type", "list the
 * types". Every shipping path validates a CONCRETE event through `parseEvent` instead, so nothing
 * enumerates. The callers are the back office and the Auditor's report surface, both unbuilt.
 */
export const eventRegistry = {
  has: (type: string): type is KnownEventType => type in payloadSchemas,
  types: (): readonly KnownEventType[] => Object.keys(payloadSchemas) as KnownEventType[],
} as const;

export type ParsedEvent = {
  type: KnownEventType;
  payload: unknown;
  envelope: EventEnvelopeT;
};

/** Validates envelope + payload against the catalog — operational and audit (01-F4/01-F5). */
export const parseEvent = (value: unknown): ParsedEvent => {
  const envelope = parseEnvelope(value);
  const schema = ALL_PAYLOAD_SCHEMAS[envelope.type];
  if (!schema) throw new UnknownEventTypeError(envelope.type);
  const payload = schema.parse(envelope.payload);
  return { type: envelope.type as KnownEventType, payload, envelope };
};
