// @restos/sync-client — device sync engine (owning spec: specs/01-kernel-sync.md).
// T-01-03 lands the device store + outbox core (01-F2/F3/F8/F11); T-01-04 lands
// folds v1 per FOLDS.md (01-F6/F10/F34, 01-N1); T-01-05 lands hub election + the
// LAN mesh session over the injected transport seam (01-F12/F13/F15;
// plans/wave-0/kernel-tasks.md, HUB-ELECTION.md).
//
// ⚠ THIS ROOT ENTRY IS THE NODE / ELECTRON DOOR. It exports `createNodeStorageAdapter` and so
// reaches `better-sqlite3`, a native addon Metro cannot bundle. React Native imports
// `@restos/sync-client/rn` (`18 §4`'s second engine) and the cloud Auditor imports
// `@restos/sync-client/fold-engine`; both exist so that a host taking one capability does not
// take the other's native dependency with it.

export {
  CATALOG_SCHEMA,
  type CatalogApplyResult,
  type CatalogDelta,
  type CatalogEntry,
  type CatalogKind,
  type CatalogSnapshot,
  type CatalogStore,
  type CatalogUpdate,
  createCatalogStore,
  DEFAULT_STATION,
} from "./catalog.js";
export {
  type CatalogFetch,
  createCatalogFetch,
  type FetchStep,
  type WireCatalogResponse,
  type WireEntry,
} from "./catalog-fetch.js";
export {
  type BlockedCursor,
  type BlockedReason,
  CLOUD_PUSH_BATCH_MAX,
  type CloudSession,
  type CloudSessionStatus,
  createCloudSession,
} from "./cloud-session.js";
// `00 §5.4` — the cloud leg's scheme, decided once (`cloud-url.ts`). `classifyCloudUrl` is
// deliberately NOT re-exported: it is the PREDICATE, its one production caller is
// `transport-ws.ts` inside this package, and a second door onto it is a second chance for a
// caller to ask the question and ignore the answer. Hosts get the two things a host needs — the
// boot refusal and the boot line.
export { type CloudUrlVerdict, cloudUrlRefusal, describeCloudUrl } from "./cloud-url.js";
export {
  AckBeyondAppendedError,
  type AppendInput,
  type BranchTimeStatus,
  createDeviceStore,
  type DeviceStore,
  DivergentDuplicateError,
  type IngestBatchResult,
  type IngestResult,
  type IngestStats,
  type PageItem,
  type PageResult,
  SKEW_FLAG_THRESHOLD_MS,
  type StoreIdentity,
  type SyncStatus,
} from "./device-store.js";
export type {
  AvailabilityRow,
  FoldStats,
  KitchenQueueRow,
  OpenOrderRow,
  ParkedRow,
} from "./folds/merge.js";
// `billedEffectiveFromJsonLines` is exported as a VALUE because host apps must render the
// order total from the engine's own derivation rather than summing `json_lines` themselves
// (26 §8 / 01-F34, and the T-01-11 ruling that deleted the Auditor's mirror of this sum:
// two implementations of one total is how a money anomaly becomes a false finding).
export { billedEffectiveFromJsonLines, billedLinePaisa } from "./folds/merge.js";
export { electHub } from "./hub-election.js";
export {
  createLanAdmission,
  LAN_CREDENTIAL_SCHEMA,
  readLanCredential,
  writeLanCredential,
} from "./lan-credential.js";
export type {
  LanRoster,
  RosterApplyResult,
  RosterDelta,
  RosterEntry,
  RosterSnapshot,
  RosterUpdate,
} from "./lan-roster.js";
export {
  createMeshSession,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MISSED_LIMIT,
  HELLO_TIMEOUT_MS,
  HUB_LOSS_TIMEOUT_MS,
  type MeshSession,
  type MeshSessionState,
  type MeshSessionStatus,
  REELECTION_BUDGET_MS,
} from "./mesh-session.js";
// `01-F82`/`16-F31` (R54): `billed_total` INCLUDES TAX, so a host app that means "what the
// customer owes" reads `billedTotalPaisa` and not the tax-blind order-level sum above. One join
// of the two halves — the fold's per-line cells and `@restos/domain`'s posture arithmetic —
// because two joins of one identity is how a money anomaly becomes a false finding.
// `02-F63` (R70) adds the third half in the SAME join: the charge is rounded to the org's
// granularity, so `billedTotalPaisa` is the rounded number and `orderChargeSnapshot` is what a
// document needs to print rows that close. There is no tax-only export any more — one beside the
// other is two answers to *what does the customer owe*.
export { billedTotalPaisa, type ChargeSnapshot, orderChargeSnapshot } from "./order-tax.js";
// 01-F26/F27/F28/F61 — the PIN session and the reference data it verifies against.
export {
  createMemoryPinAttemptStore,
  createPinAttemptStore,
  NO_ATTEMPTS,
  PIN_ATTEMPTS_SCHEMA,
  type PinAttemptRecord,
  type PinAttemptStore,
} from "./pin-attempts.js";
export { createPinAuditSink, type PinAuditSinkOptions } from "./pin-audit.js";
export {
  createPinSession,
  PIN_LOCKOUT_COOLDOWN_MS,
  type PinAuditRecord,
  type PinSession,
  type PinSessionOptions,
  type UnlockRefusal,
  type UnlockResult,
} from "./pin-session.js";
export {
  createStaffRegistry,
  STAFF_SCHEMA,
  type StaffApplyResult,
  type StaffAssignment,
  type StaffDelta,
  type StaffMember,
  type StaffRegistry,
  type StaffSnapshot,
  type StaffStatus,
  type StaffUpdate,
} from "./staff.js";
export {
  createStaffFetch,
  type StaffFetch,
  type StaffFetchStep,
  type WireStaffEntry,
  type WireStaffResponse,
} from "./staff-fetch.js";
export type { SqlValue, StorageAdapter, StorageStatement } from "./storage.js";
export { createNodeStorageAdapter } from "./storage-node.js";
export { createOpSqliteStorageAdapter, type OpSqliteDb } from "./storage-op-sqlite.js";
// `18 §4`'s storage adapter: the port, the two drivers' Node half, and the door that resolves a
// `{ path }` to it. The RN half is `./rn` — deliberately NOT re-exported here, because reaching
// it through this entry would put `better-sqlite3` back in a phone's bundle.
export { type OpenStoreOptions, openStore } from "./store.js";
export type { LanAdmission, LanCredential } from "./transport-ws.js";
export { createWsCloudTransport, createWsLanTransport } from "./transport-ws.js";
export { wallClock } from "./wall-clock.js";
