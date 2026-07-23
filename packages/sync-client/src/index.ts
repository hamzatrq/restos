// @restos/sync-client — device sync engine (owning spec: specs/01-kernel-sync.md).
// T-01-03 lands the device store + outbox core (01-F2/F3/F8/F11); T-01-04 lands
// folds v1 per FOLDS.md (01-F6/F10/F34, 01-N1); T-01-05 lands hub election + the
// LAN mesh session over the injected transport seam (01-F12/F13/F15;
// plans/wave-0/kernel-tasks.md, HUB-ELECTION.md).
export {
  CLOUD_PUSH_BATCH_MAX,
  type CloudSession,
  type CloudSessionStatus,
  createCloudSession,
} from "./cloud-session.js";
export {
  AckBeyondAppendedError,
  type AppendInput,
  type DeviceStore,
  DivergentDuplicateError,
  type IngestBatchResult,
  type IngestResult,
  type IngestStats,
  openStore,
  type PageItem,
  type PageResult,
  type StoreIdentity,
  type SyncStatus,
} from "./device-store.js";
export type { FoldStats, KitchenQueueRow, OpenOrderRow, ParkedRow } from "./folds/merge.js";
export { electHub } from "./hub-election.js";
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
export { createWsCloudTransport, createWsLanTransport } from "./transport-ws.js";
export { wallClock } from "./wall-clock.js";
