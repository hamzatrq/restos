// Acceptance test data builders — T-01-02 (authored from PROTOCOL.md + the
// plans/wave-0/kernel-tasks.md binding contract only; no implementation seen).
// These construct plain wire-shaped objects; they are NOT protocol code.
import { newId } from "@restos/domain";

// T-01-17 (DEC-TIME-001): the wire envelope carries the time layer —
// `branch_created_at` (01-F43) and the `time_basis` marker (01-F44). A zero-offset
// device stamps branch == device time; the two fields are independent on the wire.
export const envelope = () => ({
  id: newId(),
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
  actor_user_id: null,
  lamport_seq: 3,
  device_created_at: 1752800000000,
  branch_created_at: 1752800000000,
  time_basis: "branch",
  server_received_at: null,
  type: "order.created",
  schema_version: 1,
  payload: { order_id: newId() },
  refs: [] as string[],
});

// 01-F76's artifact scope needs a tenant, and it is stable across builders so a request and the
// response answering it name ONE artifact rather than two.
const CATALOG_ORG = newId();

// One minimal valid instance per PROTOCOL.md kind. Every message: { v: 2, kind, ...body }.
//
// ⚠ **MIGRATED, NOT REWRITTEN (`01-F75`/`01-F77`, August 2026).** `01-F77` bumps the shared wire
// literal `v: 1` → `v: 2` and `01-F75` supersedes the `catalog_*` triple with one
// resource-discriminated `reference_*` triple; `01-F79` adds the credential-change pair. Every
// builder below is the same minimal instance it was, at the new version and under the new names —
// no builder's SHAPE was weakened and none was deleted except the three superseded kinds, whose
// minimal instances are re-expressed as `resource: "catalog"` frames carrying the identical body.
export const builders = {
  hello: () => ({
    v: 2,
    kind: "hello",
    device_id: newId(),
    device_class: "counter_electron",
    branch_id: newId(),
    token: "acceptance-token",
    last_global_seq: 0,
    own_high_water: 0,
  }),
  hello_ack: () => ({ v: 2, kind: "hello_ack", session_id: newId(), hub: true, resume_from: 0 }),
  push: () => {
    const e = envelope();
    return { v: 2, kind: "push", events: [e], watermark: e.lamport_seq };
  },
  push_ack: () => ({ v: 2, kind: "push_ack", acked_watermark: 3 }),
  event_batch: () => ({ v: 2, kind: "event_batch", events: [{ ...envelope(), global_seq: 42 }] }),
  catchup_request: () => ({ v: 2, kind: "catchup_request", from_global_seq: 0 }),
  catchup_response: () => ({
    v: 2,
    kind: "catchup_response",
    events: [envelope()],
    complete: true,
    next_from: 44,
  }),
  // 01-F75 — the reference fetch pair and its notice (01-F9, 01-F52..F56), the three kinds that
  // superseded `catalog_request` / `catalog_response` / `catalog_notice`. The bodies are those
  // builders' unchanged, plus `01-F76`'s artifact key: the catalog is ORG-scoped, so `branch_id`
  // is null. A minimal instance is still a SNAPSHOT with one entry — `have_version: 0` is the
  // case the server must answer with a snapshot, so the minimal request and the minimal response
  // are the same exchange.
  reference_request: () => ({
    v: 2,
    kind: "reference_request",
    resource: "catalog",
    scope: { org_id: CATALOG_ORG, branch_id: null },
    have_version: 0,
  }),
  reference_response: () => ({
    v: 2,
    kind: "reference_response",
    resource: "catalog",
    scope: { org_id: CATALOG_ORG, branch_id: null },
    form: "snapshot",
    version: 7,
    entries: [{ kind: "item", id: newId(), name: "Chapli Kebab" }],
    complete: true,
    next_from: 0,
  }),
  reference_notice: () => ({
    v: 2,
    kind: "reference_notice",
    resource: "catalog",
    scope: { org_id: CATALOG_ORG, branch_id: null },
    version: 8,
  }),
  // 01-F79 — the credential-change pair. What travels is the new HASH and never either PIN
  // (11-F21, 14 §2), so the minimal instance carries the person it is about and an Argon2id PHC
  // string as `packages/domain`'s `hashPin` mints one.
  credential_change_request: () => ({
    v: 2,
    kind: "credential_change_request",
    user_id: newId(),
    new_pin_hash:
      "$argon2id$v=19$m=19456,t=2,p=1$YnVpbGRlcnNhbHQxMjM0$QnVpbGRlckFjY2VwdGFuY2VGaXh0dXJlSGFzaA",
  }),
  credential_change_result: () => ({
    v: 2,
    kind: "credential_change_result",
    result: "changed",
  }),
  quarantine_notice: () => ({
    v: 2,
    kind: "quarantine_notice",
    event_id: newId(),
    reason: "schema: payload failed validation",
  }),
  purge_command: () => ({ v: 2, kind: "purge_command", scope: "all" }),
  ping: () => ({ v: 2, kind: "ping", t: 1752800000000 }),
  pong: () => ({ v: 2, kind: "pong", t: 1752800000001 }),
} as const;

export const without = (obj: Record<string, unknown>, key: string): Record<string, unknown> => {
  const { [key]: _dropped, ...rest } = obj;
  return rest;
};
