// Acceptance test data builders — T-01-02 (authored from PROTOCOL.md + the
// plans/wave-0/kernel-tasks.md binding contract only; no implementation seen).
// These construct plain wire-shaped objects; they are NOT protocol code.
import { newId } from "@restos/domain";

export const envelope = () => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: null,
  lamport_seq: 3,
  device_created_at: 1752800000000,
  server_received_at: null,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId() },
  refs: [] as string[],
});

// One minimal valid instance per PROTOCOL.md kind. Every message: { v: 1, kind, ...body }.
export const builders = {
  hello: () => ({
    v: 1,
    kind: "hello",
    device_id: newId(),
    device_class: "counter_electron",
    branch_id: newId(),
    token: "acceptance-token",
    last_global_seq: 0,
    own_high_water: 0,
  }),
  hello_ack: () => ({ v: 1, kind: "hello_ack", session_id: newId(), hub: true, resume_from: 0 }),
  push: () => {
    const e = envelope();
    return { v: 1, kind: "push", events: [e], watermark: e.lamport_seq };
  },
  push_ack: () => ({ v: 1, kind: "push_ack", acked_watermark: 3 }),
  event_batch: () => ({ v: 1, kind: "event_batch", events: [{ ...envelope(), global_seq: 42 }] }),
  catchup_request: () => ({ v: 1, kind: "catchup_request", from_global_seq: 0 }),
  catchup_response: () => ({
    v: 1,
    kind: "catchup_response",
    events: [envelope()],
    complete: true,
    next_from: 44,
  }),
  quarantine_notice: () => ({
    v: 1,
    kind: "quarantine_notice",
    event_id: newId(),
    reason: "schema: payload failed validation",
  }),
  purge_command: () => ({ v: 1, kind: "purge_command", scope: "all" }),
  ping: () => ({ v: 1, kind: "ping", t: 1752800000000 }),
  pong: () => ({ v: 1, kind: "pong", t: 1752800000001 }),
} as const;

export const without = (obj: Record<string, unknown>, key: string): Record<string, unknown> => {
  const { [key]: _dropped, ...rest } = obj;
  return rest;
};
