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
  }),
  "kot.printed": z.looseObject({
    order_id: z.string().min(1),
  }),
  "order.line_state_changed": z.looseObject({
    order_id: z.string().min(1),
    line_ids: z.array(z.string().min(1)).min(1),
    state: z.enum(ORDER_LINE_STATES),
  }),
  "payment.recorded": z.looseObject({
    order_id: z.string().min(1),
    amount_paisa: z.number().int().nonnegative(),
    method: z.string().min(1),
    settlement_attempt_id: z.string().min(1), // 01-F31: double-taps cannot double-record
  }),
  "payment.refunded": z.looseObject({
    payment_id: z.string().min(1), // 01-F29: always references the original payment
    amount_paisa: z.number().int().nonnegative(),
    method: z.enum(["cash_out", "raast_reversal_ref", "khata_credit"]),
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
