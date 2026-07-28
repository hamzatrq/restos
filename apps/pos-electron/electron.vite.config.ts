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
 *   store that cannot open.
 * - **preload** is the ONE bridge. It is bundled (not externalized) because it runs in a
 *   context with no module resolution of its own, and it is CommonJS because a sandboxed
 *   preload cannot be an ES module.
 * - **renderer** is a plain React app with no Node access at all. Note the absence of any
 *   `nodeIntegration` or polyfill config: there is nothing to configure, which is the point.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts" },
        // `externalizeDepsPlugin` externalizes this package's OWN `dependencies`, and
        // `better-sqlite3` is not one — it arrives transitively through `@restos/sync-client`.
        // So it was being bundled, and a bundled native module is a broken one: the JS half
        // inlines fine and then resolves its `.node` binding relative to the bundle, where
        // there is nothing. It fails at `openStore`, on launch, with a module-not-found for a
        // path nobody wrote. Externalized by name so it loads from `node_modules` like the
        // native module it is.
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    // NOT externalized: a preload resolves nothing at runtime, so anything it imports has to
    // be in the file. `electron` itself is provided by the runtime and is externalized for us.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
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
