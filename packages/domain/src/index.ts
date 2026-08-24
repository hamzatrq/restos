// @restos/domain — the single source of platform schemas (18 §2: sacred).
// Owning specs: 01 §3–§4, 00 §6. Implemented against the T-01-01 acceptance
// contract (plans/wave-0/kernel-tasks.md).

export { auditEventHash, type VerifyAuditChainResult, verifyAuditChain } from "./audit.js";
export {
  BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
  BUSINESS_TIMEZONE,
  businessDate,
  businessDayBounds,
  businessDayBoundsOfDate,
} from "./business-day.js";
// `17-F22`/`17-F23`/`17-F24` — the campaign row, its closed vocabularies and the RENDER-TIME
// loyalty arithmetic. Declared once here (`18 §2`/`18 §4`) because three planes need it and none
// may import another: the writer that validates a `campaign` artifact, the till that validates a
// redemption offline (`17-N3`), and the permission predicate that routes `17-F12`'s pre-approval.
export {
  BENEFIT_FORMS,
  type BenefitForm,
  CAMPAIGN_KINDS,
  CAMPAIGN_PROOF_KINDS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_USE_LIMITS,
  type CampaignBenefit,
  CampaignBenefitSchema,
  type CampaignContext,
  type CampaignKind,
  type CampaignProofKind,
  type CampaignRow,
  CampaignRowSchema,
  type CampaignStatus,
  type CampaignUseLimit,
  campaignApplies,
  campaignBenefitPaisa,
  loyaltyAvailable,
  loyaltyOrdersToNextReward,
} from "./campaign.js";
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
  chargePaisaAtGranularity,
  type DirectedPaisa,
  directedPaisa,
  type Milligrams,
  type Millilitres,
  mg,
  ml,
  type Paisa,
  paisa,
  rupeesAndPaisaFromPaisa,
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
  type CampaignCitation,
  can,
  // `02-F20` + Appendix A's two rows — which discount row an act is an instance of. `02-F61`
  // names this predicate as the one thing owed before a discount surface can land.
  canDiscount,
  // `05-F19` — the paid-out threshold decision, with both figures as required inputs.
  canPayOut,
  type DiscountRequest,
  type PaidOutRequest,
  PERMISSION_ACTIONS,
  type PermissionAction,
  type ReportReach,
  ROLES,
  type Role,
  type RoleAssignment,
  reportScope,
  // `10-F34` — how wide a STOCK report may be. A separate reach from `reportScope`: the two tables
  // differ in the cashier and storekeeper columns, and a `10-F28` period is not a shift.
  stockReportScope,
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
  // 05-F30 — the closed set of alarm categories `audit.alarm_acknowledged` may name. Exported
  // because `05 §5`'s derived alarm list must narrow an incoming ack against the SAME two words.
  ALARM_ACK_KINDS,
  type AlarmAckKind,
  // 05-F7 — the closed `approval_type` set of the manager console's event extension.
  APPROVAL_TYPES,
  type ApprovalType,
  AUDIT_EVENT_TYPES,
  type AuditEventType,
  // 14-F3 — one moved price cell on `catalog.changed`, so the history can render "450 → 480".
  CatalogPriceChange,
  type CatalogPriceChangeT,
  // 10-F29 — the closed basis set on a count line. `packages/inventory` computes 10-F33's noise
  // floor FROM it, so it is a domain type and not a report label.
  COUNT_BASES,
  type CountBasis,
  eventRegistry,
  isAuditEvent,
  // 01-F23 / 02-F27 — is this string the E.164 form the customer file is keyed by? The writer
  // asks before it appends, so `02-F28`'s lookup can answer "not a number yet" without a throw.
  isPhoneE164,
  type KnownEventType,
  ORDER_CHANNELS,
  // 06-F20 — the closed rejection-reason list `02-F9`'s Reject control chooses from.
  ORDER_REJECTION_REASONS,
  type OrderChannel,
  type OrderRejectionReason,
  PAYMENT_METHODS,
  type ParsedEvent,
  type PaymentMethod,
  // 03-F53 — the closed status set the till's `printer.status_changed` producer emits.
  PRINTER_STATUSES,
  type PrinterStatus,
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
// R39 / `16-F1`..`16-F6` — the posture arithmetic. Declared here once (`18 §2`) because BOTH the
// ledger figure and the printed one derive from it, and two implementations of "what is the tax on
// this line" is a receipt that disagrees with the order it was printed from.
export {
  TAX_OFF,
  TAX_POSTURES,
  type TaxCell,
  type TaxLineInput,
  type TaxLineSnapshot,
  type TaxPosture,
  type TaxSnapshot,
  type TaxSnapshotInput,
  taxSnapshot,
} from "./tax.js";
// Named tenancy (`01-F68` org, `01-F69` branch, `01-F70` device, `11-F20` person; `15-F25`
// lifecycle). The records an `org_id`/`branch_id`/`device_id`/`user_id` points AT — declared here
// once (`18 §2`) because BOTH planes read them and a per-plane copy would disagree about what a
// restaurant is called. No event type, no payload schema, no merge rule: every FR above routes
// through existing acts and says so in terms.
//
// Nothing constructs these yet; the recorded debt marker lives at the DECLARATION, in
// `tenancy.ts`. Deliberately not repeated here — measured 2026-08-16, a marker written above this
// re-export was INERT: `check-seams` reports Rule A at the declaration site, and "a barrel
// re-export is not a use" cuts both ways. A marker that looks like a rail exception and is not is
// the worst kind of comment, so this one names where the real one is instead.
export {
  BRANCH_CLASSES,
  BRANCH_TYPES,
  type BranchClass,
  BranchRecord,
  type BranchRecordT,
  type BranchType,
  DeviceRecord,
  type DeviceRecordT,
  DISPLAY_NAME_MAX_CODE_POINTS,
  DisplayName,
  ORG_STATUSES,
  OrgRecord,
  type OrgRecordT,
  type OrgStatus,
  PERSON_STATUSES,
  PersonAssignment,
  type PersonAssignmentT,
  PersonRecord,
  type PersonRecordT,
  type PersonStatus,
} from "./tenancy.js";
