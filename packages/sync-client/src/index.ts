// @restos/sync-client — device sync engine (owning spec: specs/01-kernel-sync.md).
// T-01-03 lands the device store + outbox core (01-F2/F3/F8/F11); folds, LAN mesh,
// and hub election arrive with later kernel tasks (plans/wave-0/kernel-tasks.md).
export {
  AckBeyondAppendedError,
  type AppendInput,
  type DeviceStore,
  openStore,
  type StoreIdentity,
  type SyncStatus,
} from "./device-store.js";
