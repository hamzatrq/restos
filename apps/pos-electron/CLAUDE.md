# @restos/pos-electron

**Owning spec: `specs/02-pos-app.md (also 01 §4, 21)` — read it before modifying anything here (AGENTS.md routing).**

- Windows counter POS (Electron). Preferred branch hub (01-F13): main process owns SQLite, sync, printing.
- Renderer gets NO Node access (18 §9): typed IPC bridge only.

## Running it

```
pnpm rebuild:native   # ONCE after install — see below
pnpm start            # build + launch
pnpm dev              # electron-vite dev server with HMR
```

**`rebuild:native` is not optional and not a workaround.** `better-sqlite3` is a native module
and Electron 43 uses a different V8 ABI (148) from the Node that installed it (127), so the
store cannot open until it is rebuilt.

**One checkout serves two ABIs, and by default they FIGHT.** `better-sqlite3` resolves its
addon through `bindings`, which checks `build/Release/` **first** — and under pnpm every
package shares one physical copy of the module. So `electron-rebuild` overwrites the exact file
Node needs, and `pnpm test` then dies with `NODE_MODULE_VERSION 148 … requires 127` across
every suite that opens a store. There is no ordering that satisfies both.

The resolution: `build/Release/` **stays Node's**, and this app passes its own binary
explicitly. `@electron/rebuild` also writes to `bin/<platform>-<arch>-<abi>/` (better-sqlite3's
own prebuild layout), `openStore` takes an optional `nativeBinding`, and `main/index.ts`
resolves it from `process.versions.modules` at runtime. If `rebuild:native` ever clobbers
`build/Release/` again, restore it with:

```
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release
```

Verify with a **`pnpm test --force`** — a cached turbo run will report green off results
computed before the rebuild, which is how this was briefly believed to be fine when it was not.

## What the build gets wrong if you let it

Three failures found by launching, each of which builds cleanly and dies at load:

1. **`electron` must be external.** It is a devDependency, so `externalizeDepsPlugin` skips
   it, and the bundler then resolves `import { app } from "electron"` to the npm package's
   `index.js` — the CLI shim that *downloads the binary* — and inlines that. Dies on
   `__dirname is not defined` inside a shim nobody wrote.
2. **`better-sqlite3` must be a direct dependency AND named in `external`.** Under pnpm's
   strict layout a transitive dep is not resolvable from here, so externalizing it without
   declaring it gives `ERR_MODULE_NOT_FOUND`. Declaring it without naming it in `external`
   bundles `bindings`, whose `__filename` then needs electron-vite's CommonJS shim banner —
   and that banner can land *inside a JSDoc block*, where it is inert. Observed: the shim
   ended up commented out inside `@noble/hashes`'s docs.
3. **The preload must be CommonJS.** `contextIsolation` cannot load an ESM preload; it fails
   silently and the renderer comes up with no `window.restos`, which reads as a bridge bug.

`main/index.ts` uses `import.meta.url`, never `__dirname` — `"type": "module"` means the main
bundle is ESM and `__dirname` does not exist there.

## What is deliberately not real yet

- **Device identity is a marked DEV SEED** with stable ids. Admission (`01-F47`) replaces it.
  A device minting a fresh `device_id` per launch would fork its own outbox on every restart.
- **Reachability reports `down` for all three facts**, because no mesh or cloud session exists.
  `00 §5.7` requires the strip to report what is true; claiming a hub never contacted is the
  exact dishonesty that FR exists to prevent.
- **NO PRINTER IS ATTACHED, and the counter says so loudly.** K-7 wired `order.confirmed` →
  spooler → `03-F5`'s S1 band, and the transport it ships with (`unattachedPrinter`) reports
  that the printer did not answer on every transmit — because no USB, Bluetooth or TCP-9100
  transport exists (`18 §10`, K-8 owed). So **every confirm raises a print-failure band about
  20 s later**, naming the printer and the order. That is the honest state of this device, not
  a bug: `03-F5` forbids a silent KOT failure, and the alternative is a till that claims to
  have printed. The printer model is `RESTOS_KOT_PRINTER` (default `TH230`, a PINNED value and
  not a measurement — see `main/index.ts`). The queue is **DURABLE as of August 2026**:
  `createSpooler` is handed `openJobStore` (`main/job-store.ts` — SQLite + WAL, `print-spool.db`
  in `userData`), so `03-F4`'s crash clause holds and a relaunch keeps its queued tickets, their
  bytes, their state and their attempt counts. It was process-lifetime for one round, because K-7
  wired the spooler and passed no store — the wave's named defect one argument along — and the
  assertion that would have caught it now lives in `__acceptance__/kot-printing.test.ts` §G.
  **Still unproven against hardware:** every "power cut" in
  `__acceptance__/spooler-job-store.test.ts` is `close()`, and fsync, torn writes and WAL recovery
  from a real plug-pull belong to K-8 / D3.
- **The item grid needs a source, and there are exactly two.** The catalog *transport* is real
  and wired as of T-C6: `main/sync.ts` builds the cloud session, which requests on `hello_ack`
  version mismatch and on `catalog_notice` and applies into `store.catalog` — so a device with
  `RESTOS_CLOUD_URL`/`RESTOS_DEVICE_TOKEN` pointed at a gateway gets the org's published menu.
  Nothing *publishes* one yet, because that is the back office
  (`plans/wave-1/backoffice-catalog.md`). So for a local launch there is a **marked DEV SEED**,
  off by default like the roster:

  ```
  RESTOS_DEV_MENU=1 RESTOS_DEV_PIN=<digits> pnpm start
  ```

  which seeds three categories and eight priced items (`main/catalog.ts`). It applies as a
  snapshot **at version 0** deliberately: `cloud-session.ts` fetches when
  `server_version > catalog.version()`, so a seed claiming version 1 would read as parity to an
  org whose real catalog *is* version 1 and the dev menu would stick forever. At 0 the device
  still asks for everything on connect and the real snapshot replaces the seed wholesale; the
  seed also refuses to run at all once `version() > 0`, so it can never overwrite a synced menu.
  **Delete it when the back office lands.** Without the flag the grid is empty and `01-F54`'s
  degrade-to-identifier path is what the launch exercises — the honest state of a device no menu
  has reached (`00 §5.7`). The seam that keeps this wired lives in
  `__acceptance__/catalog-seam.test.ts` §D.
- **A stuck catalog is not yet visible to the cashier.** `Uplink.catalogRefusal` carries
  `01-F56`'s refusal out of the cloud session and **nothing consumes it**: `DeviceState` has a
  `blocked` cursor field and no catalog-health field, so `DEC-SYNC-011`'s "observable" holds at
  the API and nowhere on the counter. Owed, and named rather than left to look intentional.
- **The staff roster is a marked DEV SEED, and it is off by default.** PIN verification itself
  is real — `createPinSession` against Argon2id hashes in `store.staff` (`01-F28`), with
  `01-F61`'s durable per-(device, user) lockout — but nothing *populates* that registry yet, so
  a plain `pnpm start` shows an empty identification grid and nobody can unlock. That is the
  honest state of a device no roster has reached (`00 §5.7`). To get a usable till:

  ```
  RESTOS_DEV_PIN=<digits> pnpm start
  ```

  which seeds three cashiers **sharing that one PIN** — deliberately, because `01-F61` names a
  shared 4-digit PIN as the ordinary case that makes the identification step load-bearing.
  **The PIN is not in the source and must not be put there:** a constant under `src/main` is
  the device-wide secret `01-F61` refuses, and `unlock-gate.dom.test.tsx` fails the build on
  one.
