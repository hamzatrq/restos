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
