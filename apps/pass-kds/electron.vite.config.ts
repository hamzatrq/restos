import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/**
 * `18 §9`'s process split, as a build — the same three bundles and the same three reasons as
 * `apps/pos-electron`'s config, which is the file to read for the full argument. The short form:
 *
 * - **main** owns SQLite and `sync-client`. `better-sqlite3` is a native module and must be
 *   externalized BY NAME and declared as a direct dependency, or the build passes and the app
 *   dies on launch.
 * - **preload** is the ONE bridge, bundled and CommonJS (a sandboxed preload cannot be ESM).
 * - **renderer** is a plain React app with no Node access.
 *
 * ## ⚠ `18 §3` LISTS THIS APP AS EXPO AND IT IS ELECTRON. STATED, NOT SLIPPED IN.
 *
 * `18 §3`'s monorepo layout reads `pass-kds/ # Pass screen + KDS (Expo, tablet landscape)` and
 * `03 §8` says *"Pass and KDS are one Expo app with a mode switch"*. Both are **tech notes**, not
 * FRs. This app is Electron, and the reason is `27-F28`'s own amendment plus one measurement:
 *
 *  1. **`packages/ui` is a DOM component kit.** `18 §7` is explicit that React Native consumes
 *     the *tokens* and not the components — so an Expo pass screen would re-implement
 *     `TicketCard`, `AgeBadge`, `AppShell`, `Panel` and `PanelRoot`'s `27-F68` conversion a
 *     second time. Two implementations of one visual language is the defect `03-F40`'s two
 *     sensor bit layouts is the corpus's own instance of.
 *  2. **`pnpm layout:check` renders in Blink and nothing else does.** A React Native pass screen
 *     would have **zero** layout coverage, and *"a surface the gate does not render is a surface
 *     with no layout coverage at all"* is this repo's single most repeated finding. Seven layout
 *     defects have been found by launching the app and looking, and **zero** by the suites.
 *  3. **`DEC-HW-001` made the hardware question a capability question.** `27-F28` no longer
 *     mandates a panel, so *"tablet landscape"* is one deployment rather than the deployment.
 *     An Electron window runs on the 22" panel `27-F11f` names, on a laptop, and on a TV with a
 *     stick PC — which is what bring-your-own-hardware actually looks like in a Pakistani
 *     kitchen. What it does NOT run on is an Android tablet, and that is the real cost of this
 *     choice, stated rather than hidden: **`apps/pass-kds` needs an Expo host, or a browser
 *     build of this same renderer, before a restaurant can prop a tablet at the pass.**
 *
 * The renderer is deliberately a pure React tree over `packages/ui` with its whole read path
 * behind one bridge type, so that host is a port and not a rewrite. **This is a `18 §3`
 * amendment owed as a spec PR** (commandment 9), and it is recorded here and in this package's
 * `CLAUDE.md` rather than left for a reader to discover as a contradiction.
 */
const RUNTIME = ["electron"];
const NATIVE = ["better-sqlite3"];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // The layout rail is a SECOND main entry, exactly as it is in `apps/pos-electron`, so it
        // imports this app's real `PASS_WINDOW_OPTIONS` through TypeScript rather than re-typing
        // the window contract. A gate measuring its own copy of a size proves only that its copy
        // is right.
        input: { index: "src/main/index.ts", "layout-gate": "src/layout-gate/main.ts" },
        external: [...RUNTIME, ...NATIVE],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts", "layout-gate": "src/layout-gate/preload.ts" },
        external: RUNTIME,
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
