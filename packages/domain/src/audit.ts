// Audit hash-chain primitives (01-F5; 01 §7 — audit hash-chaining is non-configurable
// platform law, computed identically on every host). Pure and declared once here so the
// device store, property tests, and the cloud Auditor (T-01-11) all consume one rule
// (18 §2). DEC-AUDIT-001 (accepted) ratifies the scheme: SHA-256-hex over canonical-JSON
// of the envelope with `server_received_at` DELETED, via @noble/hashes (pure-JS, sync,
// cross-runtime — node:crypto is unavailable on RN and Web Crypto's digest is async, so
// unusable in the synchronous append path).
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalJson } from "./canonical.js";
import type { EventEnvelopeT } from "./envelope.js";

/**
 * The chain hash of one audit event: SHA-256 (lowercase hex) over the canonical JSON of
 * the envelope MINUS `server_received_at`. That field is excluded because it is `null`
 * on-device at emit and an integer after cloud merge — a hash covering it would differ
 * device-side vs cloud-side and break the Auditor's cross-plane verification (01-F3).
 * Every other field — id, org/branch/device ids, actor, lamport_seq, device_created_at,
 * type, schema_version, refs, and the full payload (incl. its own prev_audit_hash) — is
 * covered.
 */
export const auditEventHash = (envelope: EventEnvelopeT): string => {
  const { server_received_at: _excluded, ...covered } = envelope;
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(covered))));
};

export type VerifyAuditChainResult =
  | { ok: true }
  | { ok: false; broken_at: string; expected_prev: string | null; found_prev: string | null };

/**
 * Verifies one device's audit chain (01-F5). Precondition (the caller's job — the Auditor
 * filters `type ∈ AUDIT_EVENT_TYPES` for one device and orders by lamport_seq): `events`
 * is exactly one device's audit.* events in ascending lamport order. This helper does not
 * sort or filter — it validates the linkage of the sequence given: the first event's
 * `payload.prev_audit_hash` MUST be null, and each subsequent event's MUST equal
 * `auditEventHash(previous)`. Returns the FIRST broken link (its event id, the expected
 * and found prev hashes); an unbroken chain over ≥ 0 events is `{ ok: true }` (empty ⇒ ok).
 */
export const verifyAuditChain = (events: readonly EventEnvelopeT[]): VerifyAuditChainResult => {
  let expectedPrev: string | null = null;
  for (const event of events) {
    const foundPrev = (event.payload as { prev_audit_hash: string | null }).prev_audit_hash;
    if (foundPrev !== expectedPrev) {
      return { ok: false, broken_at: event.id, expected_prev: expectedPrev, found_prev: foundPrev };
    }
    expectedPrev = auditEventHash(event);
  }
  return { ok: true };
};
