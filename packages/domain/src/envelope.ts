// Canonical event envelope (00 §6, 01-F3): server time authoritative for reporting,
// per-device lamport_seq authoritative for a device's own ordering.
import { z } from "zod";

export const EventEnvelope = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  branch_id: z.string().min(1),
  device_id: z.string().min(1),
  actor_user_id: z.string().min(1).nullable(),
  lamport_seq: z.number().int().nonnegative(),
  device_created_at: z.number().int(),
  server_received_at: z.number().int().nullable(),
  type: z.string().min(1),
  schema_version: z.number().int().min(1),
  payload: z.unknown(),
  refs: z.array(z.string()),
});

export type EventEnvelopeT = z.infer<typeof EventEnvelope>;

export const parseEnvelope = (value: unknown): EventEnvelopeT => EventEnvelope.parse(value);
