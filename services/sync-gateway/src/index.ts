// @restos/sync-gateway — the cloud half of the kernel (PROTECTED PATH, 20 §4.4).
// Owning spec: specs/01-kernel-sync.md §3/§8; task contract:
// plans/wave-0/kernel-tasks.md T-01-07. Wire messages come from
// @restos/sync-protocol and validation from @restos/domain — never redeclared.
export {
  type AuditorCheck,
  type AuditorFinding,
  type AuditorReport,
  type ReadModelInput,
  type RunAuditorArgs,
  runAuditor,
} from "./auditor.js";
export {
  type DeviceTokenClaims,
  type DeviceTokenInput,
  issueDeviceToken,
  verifyDeviceToken,
} from "./auth.js";
export {
  AuthRejectedError,
  GatewayError,
  ProtocolViolationError,
  type QuarantineReason,
} from "./errors.js";
export {
  CATCHUP_PAGE_SIZE,
  type Clock,
  createGateway,
  type Gateway,
  type GatewayConnection,
  type GatewayDb,
} from "./gateway.js";
export { applyMigrations } from "./migrate.js";
export {
  listQuarantine,
  QUARANTINE_PAGE_SIZE,
  type QuarantineEntry,
  type QuarantineFilter,
} from "./quarantine-query.js";
export {
  type DeviceRegistration,
  type DeviceRegistryRow,
  registerDevice,
  revokeDevice,
} from "./registry.js";
