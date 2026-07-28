import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * `18 §9`'s process split, as a build.
 *
 * Three separate bundles because they are three separate trust levels, not because Electron
 * happens to have three entry points:
 *
 * - **main** owns SQLite, `sync-client`, printing and the cash drawer. `better-sqlite3` is a
 *   native module, so `externalizeDepsPlugin` keeps it out of the bundle and loads it from
 *   `node_modules` — bundling a `.node` binary is how an Electron build silently ships a
 *   store that cannot open. **It has to be a direct dependency of this app for that to
 *   work**, and it is, even though the app never imports it by name: `externalizeDepsPlugin`
 *   reads this package's own `dependencies`, and under pnpm's strict layout a transitive dep
 *   is not resolvable from here. Externalizing it without declaring it produces a build that
 *   passes and an app that dies on launch with `ERR_MODULE_NOT_FOUND` — which is exactly what
 *   the first version of this file did.
 * - **preload** is the ONE bridge. It is bundled (not externalized) because it runs in a
 *   context with no module resolution of its own, and it is CommonJS because a sandboxed
 *   preload cannot be an ES module.
 * - **renderer** is a plain React app with no Node access at all. Note the absence of any
 *   `nodeIntegration` or polyfill config: there is nothing to configure, which is the point.
 */
/**
 * `electron` must be external in every bundle.
 *
 * `externalizeDepsPlugin` reads `dependencies`, and `electron` is a devDependency — correctly,
 * since it is the runtime, not a library the app ships. Left to itself the bundler resolves
 * `import { app } from "electron"` to the npm package's `index.js`, which is the CLI shim that
 * DOWNLOADS the binary, and inlines that instead. The build succeeds; the app then dies on
 * load with `__dirname is not defined` from inside a shim nobody wrote, pointing at a line
 * number in a file nobody has.
 */
const RUNTIME = ["electron"];

/**
 * `better-sqlite3` is external too, and by NAME rather than by trusting the plugin.
 *
 * It is a direct dependency (it has to be — under pnpm's strict layout a transitive dep is
 * not resolvable from this package, so `import "better-sqlite3"` at runtime would throw
 * `ERR_MODULE_NOT_FOUND`), yet `externalizeDepsPlugin` still bundled it. Bundling it pulls in
 * `bindings`, whose `__filename` reference then has to be supplied by electron-vite's CommonJS
 * shim banner — and that banner is injected at a byte offset that can land INSIDE a JSDoc
 * block, where it is inert. Observed exactly that: the shim ended up commented out inside
 * `@noble/hashes`'s docs and the app died on `__filename is not defined`, from a dependency of
 * a dependency, at a line number in a file nobody wrote.
 *
 * Naming it here removes `bindings` from the bundle entirely, so the shim is not needed and
 * the native module loads the way a native module is supposed to.
 */
const NATIVE = ["better-sqlite3"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts" },
        external: [...RUNTIME, ...NATIVE],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        external: RUNTIME,
        // `contextIsolation` requires a CommonJS preload; an ESM one fails to load and the
        // renderer comes up with no `window.restos` at all, which looks like a bridge bug.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: { rollupOptions: { input: { index: "src/renderer/index.html" } } },
  },
});
