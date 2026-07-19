// T-01-07 error taxonomy (18 §3/§5): typed errors over string matching. The
// quarantine reasons are the CLOSED set below (01-F37) — invariant-class
// reasons arrive with T-01-08, not here.
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

/** hello token rejected (01-F27 Wave-0 stub boundary — shape/consistency only, never real auth). */
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
  | "storage_reject";
