// T-01-07 error taxonomy (18 §3/§5): typed errors over string matching. The
// quarantine reasons are the CLOSED set below (01-F37); `invariant_violation`
// is the taxonomy slot T-01-07 reserved for T-01-08 (DEC-SYNC-007).
export class GatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayError";
  }
}

/**
 * Session-law breach: first message not hello, a second hello, or a
 * server→device kind arriving inbound. PROTOCOL.md's message set is closed —
 * no error wire kind exists; the socket adapter logs and closes (assumption 10).
 */
export class ProtocolViolationError extends GatewayError {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolViolationError";
  }
}

/**
 * Auth rejection (T-01-09, 01-F25/01-F27/01-F42): failed token verification,
 * hello/registry inconsistency, an unregistered or revoked device at hello, or
 * a revoked device's next operation on an already-open session. Session-level
 * de-authorization is a REJECTION, never a quarantine (T-01-09 ratified ruling:
 * the quarantine machinery incl. slot-fill exists for a legitimate device's
 * outbox; a revoked principal has none).
 */
export class AuthRejectedError extends GatewayError {
  constructor(message: string) {
    super(message);
    this.name = "AuthRejectedError";
  }
}

export type QuarantineReason =
  | "schema_invalid"
  | "org_mismatch"
  | "branch_mismatch"
  | "device_mismatch"
  | "id_content_divergence"
  | "lamport_conflict"
  | "storage_reject"
  | "invariant_violation"
  // T-01-09 origin-existence at the merge boundary (DEC-SYNC-009 F6; 01-F37
  // authorization class): a relayed identity-valid envelope whose claimed origin
  // has no unrevoked registry row for the session's org+branch.
  | "origin_unregistered"
  | "origin_revoked";
