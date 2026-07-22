// @restos/domain — the single source of platform schemas (18 §2: sacred).
// Owning specs: 01 §3–§4, 00 §6. Implemented against the T-01-01 acceptance
// contract (plans/wave-0/kernel-tasks.md).

export { auditEventHash, type VerifyAuditChainResult, verifyAuditChain } from "./audit.js";
export { canonicalJson } from "./canonical.js";
export { DEVICE_CLASSES, type DeviceClass, HUB_ELIGIBLE_CLASSES } from "./device-classes.js";
export { EventEnvelope, type EventEnvelopeT, parseEnvelope } from "./envelope.js";
export { newId } from "./ids.js";
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
} from "./money.js";
export { payloadHash } from "./payload-hash.js";
export {
  AVAILABILITY_FALSE_WINS,
  CONTESTED_LINE_BILLABLE,
  EXCESS_TENDER_IS_EXCEPTION,
  KOT_TWO_HEAD_TABLE_HEADER,
} from "./product-constants.js";
export {
  AUDIT_EVENT_TYPES,
  type AuditEventType,
  eventRegistry,
  isAuditEvent,
  type KnownEventType,
  type ParsedEvent,
  parseEvent,
  UnknownEventTypeError,
} from "./registry.js";
export {
  applyLineState,
  LEGAL_NEXT,
  type LineStateResult,
  ORDER_LINE_STATES,
  type OrderLineState,
  TERMINAL_LINE_STATES,
} from "./states.js";
