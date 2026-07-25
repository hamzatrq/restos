// Canonical event envelope (00 §6, 01-F3): server time authoritative for reporting,
// per-device lamport_seq authoritative for a device's own ordering.
//
// Time layer (T-01-17, DEC-TIME-001 accepted). THREE time fields, deliberately:
//
//   device_created_at — the RAW device clock. UNTRUSTED (01-F45): a display/forensic
//     hint that no fold, read model, invariant or ordering key may derive a value
//     from. Retained raw for exactly one named consumer — 01-N2 skew detection, which
//     cannot measure how wrong a clock is without reading it (the 01-F45 exemption).
//   branch_created_at — the originating device's BRANCH time at append
//     (device clock + hub offset, 01-F43). Every duration in the product is a
//     difference evaluated in this clock, so a uniform branch-wide offset cancels and
//     the shared clock need only be CONSISTENT, not correct.
//   time_basis — how that branch stamp was obtained (01-F44): `branch` once an offset
//     has been measured against the hub, `branch_provisional` when the device has had
//     no hub contact and is running on offset 0.
//
// Why the branch stamp lives in the ENVELOPE rather than being computed at fold time:
// folds must be a pure function of the delivered event SET (01-F34). If a device
// applied its own offset while folding, two devices holding identical events but
// different offsets would fold to different projections — convergence would break
// silently. Stamping at append puts the value inside the set every device agrees on.
//
// `time_basis` is written ONCE at append and never rewritten (01-F1). Promotion to a
// server-anchored basis happens in the DERIVED business stamp (01-F44), which reads
// `server_received_at` beside this marker — never by mutating the marker.
import { z } from "zod";

/** Envelope-level time bases (01-F44). `server` is NOT one of these — a device cannot know server time at append. */
export const TIME_BASES = ["branch", "branch_provisional"] as const;
export type TimeBasis = (typeof TIME_BASES)[number];

export const EventEnvelope = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  branch_id: z.string().min(1),
  device_id: z.string().min(1),
  actor_user_id: z.string().min(1).nullable(),
  lamport_seq: z.number().int().nonnegative(),
  device_created_at: z.number().int(),
  branch_created_at: z.number().int(),
  time_basis: z.enum(TIME_BASES),
  server_received_at: z.number().int().nullable(),
  type: z.string().min(1),
  schema_version: z.number().int().min(1),
  payload: z.unknown(),
  refs: z.array(z.string()),
});

export type EventEnvelopeT = z.infer<typeof EventEnvelope>;

export const parseEnvelope = (value: unknown): EventEnvelopeT => EventEnvelope.parse(value);
