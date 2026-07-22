// Wire protocol v1 (PROTOCOL.md, 24-F8 artifact): one message set for LAN and
// cloud. Unknown keys are stripped (reject-or-drop, 01-F40 — slices are
// sender-enforced; a client can never smuggle one in). Contract fixtures:
// src/__acceptance__/fixtures (20 §2.7 — changing them is a spec-review event).
import { DEVICE_CLASSES, EventEnvelope } from "@restos/domain";
import { z } from "zod";

export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);
const seq = z.number().int().nonnegative();

/** Envelope as carried in merged streams — cloud may have stamped global_seq (01-F3). */
export const WireEnvelope = EventEnvelope.extend({ global_seq: seq.optional() });

export const messageSchemas = {
  hello: z.object({
    v,
    kind: z.literal("hello"),
    device_id: z.string().min(1),
    device_class: z.enum(DEVICE_CLASSES),
    branch_id: z.string().min(1),
    token: z.string().min(1),
    last_global_seq: seq,
    own_high_water: seq,
  }),
  hello_ack: z.object({
    v,
    kind: z.literal("hello_ack"),
    session_id: z.string().min(1),
    hub: z.boolean(),
    resume_from: seq,
    // Additive under v:1 (DEC-SYNC-009, T-01-12): true iff the session's token
    // carries the hub-relay capability — the client-side gate for relaying.
    relay_authorized: z.boolean().optional(),
  }),
  push: z.object({ v, kind: z.literal("push"), events: z.array(EventEnvelope), watermark: seq }),
  push_ack: z.object({
    v,
    kind: z.literal("push_ack"),
    acked_watermark: seq,
    // Additive under v:1 (DEC-SYNC-009, T-01-12): present iff the ack answers a
    // relay push — names the ORIGIN device whose stream acked_watermark
    // describes. Hub→origin over LAN, the same shape carries the relayed CLOUD
    // ack (origin_device_id = the receiving origin), the only LAN push_ack that
    // may move the cloud write-checkpoint (19 §5).
    origin_device_id: z.string().min(1).optional(),
  }),
  event_batch: z.object({ v, kind: z.literal("event_batch"), events: z.array(WireEnvelope) }),
  catchup_request: z.object({ v, kind: z.literal("catchup_request"), from_global_seq: seq }),
  catchup_response: z.object({
    v,
    kind: z.literal("catchup_response"),
    events: z.array(WireEnvelope),
    complete: z.boolean(),
    next_from: seq,
  }),
  quarantine_notice: z.object({
    v,
    kind: z.literal("quarantine_notice"),
    event_id: z.string().min(1),
    reason: z.string().min(1),
  }),
  purge_command: z.object({ v, kind: z.literal("purge_command"), scope: z.literal("all") }),
  ping: z.object({ v, kind: z.literal("ping"), t: z.number().int() }),
  pong: z.object({ v, kind: z.literal("pong"), t: z.number().int() }),
} as const;

export const MESSAGE_KINDS = Object.keys(
  messageSchemas,
) as readonly (keyof typeof messageSchemas)[];
export type MessageKind = keyof typeof messageSchemas;

const union = z.discriminatedUnion("kind", [
  messageSchemas.hello,
  messageSchemas.hello_ack,
  messageSchemas.push,
  messageSchemas.push_ack,
  messageSchemas.event_batch,
  messageSchemas.catchup_request,
  messageSchemas.catchup_response,
  messageSchemas.quarantine_notice,
  messageSchemas.purge_command,
  messageSchemas.ping,
  messageSchemas.pong,
]);

export type ProtocolMessage = z.infer<typeof union>;

export class UnknownMessageKindError extends Error {
  constructor(kind: unknown) {
    super(`unknown protocol message kind: ${String(kind)} (PROTOCOL.md is the closed message set)`);
    this.name = "UnknownMessageKindError";
  }
}

export const parseMessage = (value: unknown): ProtocolMessage => {
  if (typeof value === "object" && value !== null && "kind" in value) {
    const kind = (value as { kind: unknown }).kind;
    if (typeof kind !== "string" || !(kind in messageSchemas))
      throw new UnknownMessageKindError(kind);
  }
  return union.parse(value);
};

export const encodeMessage = (message: ProtocolMessage): string => JSON.stringify(message);

export const decodeMessage = (text: string): ProtocolMessage => parseMessage(JSON.parse(text));
