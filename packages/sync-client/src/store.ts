/**
 * # `openStore` — the Node/Electron door onto `18 §4`'s storage port
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.**
 *
 * `createDeviceStore({ adapter, identity })` in `device-store.ts` is the engine-free core. This
 * file adds ONE thing: the `{ path }` arm, which is `createNodeStorageAdapter` spelled shorter.
 *
 * ## Why the `path` arm was kept
 *
 * `24 §3b` asks for surgical diffs. 129 call sites across 68 files — both Electron hosts, every
 * `sync-client` suite, `pos-electron`'s, `pass-kds`' and `sync-gateway`'s — already pass
 * `{ path, identity, nativeBinding? }`, and the brief for this work says in terms that the
 * existing hosts must not change behaviour. Rewriting all of them to construct an adapter by hand
 * would be a large, mechanical, review-hostile diff on a protected path in exchange for nothing:
 * this arm is three lines and is the same call.
 *
 * It lives HERE and not in `device-store.ts` because `storage-adapter.test.ts` §A asserts — and
 * `apps/manager` depends on — that the store module reaches no native addon transitively. A
 * `path` arm inside the store would have to construct `better-sqlite3` and would put the import
 * straight back.
 *
 * ⚠ **`@restos/sync-client/rn` deliberately does NOT re-export this.** A phone that reached it
 * would pull the Node driver, and the failure would be a bundling error rather than a wrong
 * answer — but it would be reported three layers from its cause.
 */
import { createDeviceStore, type DeviceStore, type StoreIdentity } from "./device-store.js";
import type { StorageAdapter } from "./storage.js";
import { createNodeStorageAdapter } from "./storage-node.js";

export type OpenStoreOptions = { identity: StoreIdentity } & (
  | {
      /** An adapter built by the caller — `createNodeStorageAdapter`, or a second engine. */
      adapter: StorageAdapter;
    }
  | {
      /** The device database file. Resolved through the Node driver. */
      path: string;
      /** The Electron-ABI addon; see `createNodeStorageAdapter`. */
      nativeBinding?: string | undefined;
    }
);

export const openStore = (options: OpenStoreOptions): DeviceStore =>
  "adapter" in options
    ? createDeviceStore({ adapter: options.adapter, identity: options.identity })
    : createDeviceStore({
        adapter: createNodeStorageAdapter({
          path: options.path,
          // Forwarded explicitly rather than spread: `exactOptionalPropertyTypes` makes
          // "absent" and "present but undefined" different types, and the Electron hosts'
          // ABI-matched binding travelling through this line is what `storage-adapter.test.ts`
          // §C exists to prove is not silently dropped.
          nativeBinding: options.nativeBinding,
        }),
        identity: options.identity,
      });
