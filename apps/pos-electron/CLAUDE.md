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
- **The item grid is empty.** The device catalog stores and versions correctly and nothing
  delivers to it yet (`plans/wave-1/catalog-transport.md`). So `01-F54`'s degrade-to-identifier
  path is what every launch exercises — the failure mode gets the mileage.
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
