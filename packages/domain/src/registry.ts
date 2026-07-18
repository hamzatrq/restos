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

export const eventRegistry = {
  has: (type: string): type is KnownEventType => type in payloadSchemas,
  types: (): readonly KnownEventType[] => Object.keys(payloadSchemas) as KnownEventType[],
} as const;

export type ParsedEvent = {
  type: KnownEventType;
  payload: unknown;
  envelope: EventEnvelopeT;
};

/** Validates envelope + payload against the catalog (01-F4). */
export const parseEvent = (value: unknown): ParsedEvent => {
  const envelope = parseEnvelope(value);
  if (!eventRegistry.has(envelope.type)) throw new UnknownEventTypeError(envelope.type);
  const payload = payloadSchemas[envelope.type as KnownEventType].parse(envelope.payload);
  return { type: envelope.type as KnownEventType, payload, envelope };
};
