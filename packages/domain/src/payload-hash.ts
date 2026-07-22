// payloadHash — the platform's CLOCK-NEUTRAL tiebreak primitive (T-01-15; 01-F34,
// merge-semantics-matrix conventions). `min(envelope.id)` is BANNED as a value
// tiebreak: 00 §6 pins ids to UUIDv7 whose leading 48 bits are the minting device's
// wall clock, so id-min is min-wall-clock wearing a disguise. Wherever a merge rule
// needs a deterministic default among concurrent values (duplicate-create MVR,
// line-value MVR), it selects by min payloadHash instead. Same hash stack as
// audit.ts (DEC-AUDIT-001): @noble/hashes — pure-JS, sync, cross-runtime.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalJson } from "./canonical.js";

/** SHA-256 lowercase hex over the canonical-JSON serialization of the payload. */
export const payloadHash = (payload: unknown): string =>
  bytesToHex(sha256(new TextEncoder().encode(canonicalJson(payload))));
