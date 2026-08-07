// @restos/domain — the single source of platform schemas (18 §2: sacred).
// Owning specs: 01 §3–§4, 00 §6. Implemented against the T-01-01 acceptance
// contract (plans/wave-0/kernel-tasks.md).

export { auditEventHash, type VerifyAuditChainResult, verifyAuditChain } from "./audit.js";
export {
  BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
  BUSINESS_TIMEZONE,
  businessDate,
  businessDayBounds,
} from "./business-day.js";
export { canonicalJson } from "./canonical.js";
// 01-F60 — the sellable-kind set, declared once here (18 §2) after three copies drifted apart.
export { SELLABLE_KINDS } from "./catalog.js";
export { DEVICE_CLASSES, type DeviceClass, HUB_ELIGIBLE_CLASSES } from "./device-classes.js";
export {
  EventEnvelope,
  type EventEnvelopeT,
  parseEnvelope,
  TIME_BASES,
  type TimeBasis,
} from "./envelope.js";
export { newId } from "./ids.js";
export {
  type RefundRemainderArgs,
  refundRemainderExceeded,
  type SettledConservationArgs,
  settledConservationResidualPaisa,
} from "./invariants.js";
export {
  addPaisa,
  applyRateBps,
  type DirectedPaisa,
  directedPaisa,
  type Milligrams,
  type Millilitres,
  mg,
  ml,
  type Paisa,
  paisa,
  rupeesFromPaisa,
  splitPaisa,
  subPaisa,
  sumPaisa,
  totalPaisaOrNull,
  type Units,
  units,
} from "./money.js";
export { payloadHash } from "./payload-hash.js";
export {
  type AuthDecision,
  type AuthOutcome,
  type AuthScope,
  type AuthSubject,
  can,
  // `05-F19` — the paid-out threshold decision, with both figures as required inputs.
  canPayOut,
  type PaidOutRequest,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type ReportReach,
  ROLES,
  type Role,
  type RoleAssignment,
  reportScope,
} from "./permissions.js";
// 01-F26 / 01-F61 — the PIN credential primitive. `01-F28` verifies against these hashes
// on-device, offline, so the algorithm is platform law and lives here (18 §2).
export { hashPin, PIN_ARGON2ID_PARAMS, verifyPin } from "./pin.js";
export {
  AVAILABILITY_FALSE_WINS,
  CONTESTED_LINE_BILLABLE,
  EXCESS_TENDER_IS_EXCEPTION,
  KOT_TWO_HEAD_TABLE_HEADER,
} from "./product-constants.js";
export {
  AUDIT_EVENT_TYPES,
  type AuditEventType,
  // 14-F3 — one moved price cell on `catalog.changed`, so the history can render "450 → 480".
  CatalogPriceChange,
  type CatalogPriceChangeT,
  eventRegistry,
  isAuditEvent,
  type KnownEventType,
  ORDER_CHANNELS,
  type OrderChannel,
  PAYMENT_METHODS,
  type ParsedEvent,
  type PaymentMethod,
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
