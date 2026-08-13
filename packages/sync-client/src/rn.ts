/**
 * # `@restos/sync-client/rn` — the React-Native door onto the kernel
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.**
 *
 * > `18 §4`: **RN: `@op-engineering/op-sqlite`**. Apps NEVER run SQL directly — all device data
 * > access goes through `sync-client`'s storage adapter and query API.
 * > `18 §8`: **Storage: `op-sqlite` via `sync-client` only.**
 *
 * **This module is the ONLY place `@op-engineering/op-sqlite` is imported anywhere in the repo**,
 * which is what makes `18 §8`'s *"via `sync-client` only"* a fact rather than a convention: an app
 * gets a `DeviceStore` back and never a database handle.
 *
 * ## Why a subpath and not the package root
 *
 * The root entry (`index.ts`) exports `openStore` and `createNodeStorageAdapter`, so it reaches
 * `better-sqlite3` — a native addon Metro cannot bundle and Hermes cannot load. `apps/manager`
 * therefore imports THIS file, and everything it needs is re-exported here rather than reached
 * through the root: a single `import { createCloudSession } from "@restos/sync-client"` in the app
 * would pull the Node driver straight back in, and the failure is a bundling error three layers
 * from its cause. `@restos/sync-client/fold-engine` is the same mechanism for the pure folds;
 * this is the door that can also WRITE.
 *
 * ## What is proven and what is not
 *
 * `storage-op-sqlite.test.ts` runs the whole `18 §4` storage contract against the driver below,
 * on a faithful fake built from op-sqlite's published types. **Nothing in this repository executes
 * `open()`** — op-sqlite is a TurboModule, so it needs a custom dev client / EAS build and cannot
 * run under Node, Vitest or Expo Go. That is a `18 §12` gap (RN's only tool is Maestro on the
 * `00 §4` rig, and there is no rig), and it is K-8-shaped: hardware, not code.
 */
import { open } from "@op-engineering/op-sqlite";
import { createDeviceStore, type DeviceStore, type StoreIdentity } from "./device-store.js";
import { createOpSqliteStorageAdapter, type OpSqliteDb } from "./storage-op-sqlite.js";

export {
  type CloudSession,
  type CloudSessionStatus,
  createCloudSession,
} from "./cloud-session.js";
export type {
  BranchTimeStatus,
  DeviceStore,
  StoreIdentity,
  SyncStatus,
} from "./device-store.js";
export type {
  AvailabilityRow,
  KitchenQueueRow,
  OpenOrderRow,
  ParkedRow,
} from "./folds/merge.js";
export type { SqlValue, StorageAdapter, StorageStatement } from "./storage.js";
export { createOpSqliteStorageAdapter, type OpSqliteDb } from "./storage-op-sqlite.js";
export { createRnCloudTransport, type RnWebSocket } from "./transport-rn.js";
export { wallClock } from "./wall-clock.js";

/**
 * Open this device's branch slice (`05 §8` — *"the manager device holds a normal full branch
 * slice"*).
 *
 * `name` is a FILE NAME and not a path: op-sqlite resolves it under the app's own document
 * directory, which on Android is scoped storage the OS owns. The store's schema, folds and
 * migrations are `sync-client`'s (`18 §4`), identical on both engines — the only thing that
 * differs between a till and a phone is the four lines below.
 *
 * WAL and `foreign_keys` are set by `createDeviceStore` through the port, exactly as they are for
 * `better-sqlite3`, and are read back rather than assumed (`storage-contract.ts`).
 */
export const openRnStore = (options: { name: string; identity: StoreIdentity }): DeviceStore =>
  createDeviceStore({
    // op-sqlite's `DB` is far wider than the port needs; `OpSqliteDb` is the synchronous slice,
    // and the cast is this module announcing that the real handle implements more of it.
    adapter: createOpSqliteStorageAdapter(open({ name: options.name }) as unknown as OpSqliteDb),
    identity: options.identity,
  });
