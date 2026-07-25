// domain-kernel.ts — a zod-free re-export of the PURE @restos/domain compute layer,
// aliased in for `@restos/domain` when bundling for Hermes (see bench/build.mjs).
//
// Every symbol below is re-exported from the IDENTICAL production source file, so the
// code under test is byte-for-byte the shipped kernel. What is deliberately excluded:
//   - envelope.ts / registry.ts — the zod validation layer. The fold engine consumes
//     ALREADY-PARSED events (the acceptance builders construct envelopes directly too),
//     so this layer is never on the compute path. It also can't run on the raw Hermes
//     CLI (zod uses async-arrow functions, which no -Xes6-* flag enables) — a finding
//     in its own right, recorded in the README.
//   - ids.ts (uuidv7) — never called; fixtures use fixed, deterministic ids.
// Types (KnownEventType, ParsedEvent, EventEnvelopeT) are re-exported type-only, so they
// carry NO runtime import and pull no zod into the bundle.

export {
  auditEventHash,
  type VerifyAuditChainResult,
  verifyAuditChain,
} from "../../packages/domain/src/audit.ts";
export { canonicalJson } from "../../packages/domain/src/canonical.ts";
export type { EventEnvelopeT } from "../../packages/domain/src/envelope.ts";
export {
  addPaisa,
  applyRateBps,
  type Milligrams,
  type Millilitres,
  mg,
  ml,
  type Paisa,
  paisa,
  splitPaisa,
  subPaisa,
  sumPaisa,
  type Units,
  units,
} from "../../packages/domain/src/money.ts";
export { payloadHash } from "../../packages/domain/src/payload-hash.ts";
export {
  AVAILABILITY_FALSE_WINS,
  CONTESTED_LINE_BILLABLE,
  EXCESS_TENDER_IS_EXCEPTION,
  KOT_TWO_HEAD_TABLE_HEADER,
} from "../../packages/domain/src/product-constants.ts";
export type { KnownEventType, ParsedEvent } from "../../packages/domain/src/registry.ts";
export {
  applyLineState,
  LEGAL_NEXT,
  type LineStateResult,
  ORDER_LINE_STATES,
  type OrderLineState,
  TERMINAL_LINE_STATES,
} from "../../packages/domain/src/states.ts";
