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

// Payloads are loose objects: required fields are law; extra fields pass through
// (additive evolution, 00 §6) and are preserved for consumers.
const payloadSchemas = {
  "order.created": z.looseObject({
    order_id: z.string().min(1),
    channel: z.string().min(1),
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
    method: z.string().min(1),
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
