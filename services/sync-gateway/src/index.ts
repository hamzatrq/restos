// @restos/sync-gateway — the cloud half of the kernel (PROTECTED PATH, 20 §4.4).
// Owning spec: specs/01-kernel-sync.md §3/§8; task contract:
// plans/wave-0/kernel-tasks.md T-01-07. Wire messages come from
// @restos/sync-protocol and validation from @restos/domain — never redeclared.
// The Auditor moved to `@restos/auditor` when `services/jobs` became its second consumer
// (DEC-ARCH-001, RULED). This barrel keeps re-exporting it UNCHANGED: `__acceptance__/
// auditor-builders.ts` — the oracle-pinned surface — reads it from here, so ten suites did not
// have to move with the file. Re-pointing them at the package instead would leave every one of
// them green while narrowing this service's public surface, which is a different change.
export {
  type AuditorCheck,
  type AuditorFinding,
  type AuditorReport,
  type ReadModelInput,
  type RunAuditorArgs,
  runAuditor,
} from "@restos/auditor";
export {
  DEVICE_TOKEN_TTL_MS,
  type DeviceTokenClaims,
  type DeviceTokenInput,
  type IssueOptions,
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
  REVOCATION_SWEEP_INTERVAL_MS,
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
