import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { businessDate } from "@restos/domain";
import { openStore, wallClock } from "@restos/sync-client";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { CHANNELS } from "../shared/ipc";
import { type CatalogResolver, createGateway } from "./gateway";
import { createUplink } from "./sync";

/**
 * The main process: the only thing in this app that touches SQLite, and the only thing that
 * may (`18 §9`, `18 §4`).
 *
 * What this file deliberately does NOT do is hold any policy. It opens a store, builds the
 * gateway over it, and binds each gateway method to exactly one IPC channel. Every rule —
 * what a renderer may ask for, what gets validated, where time is stamped — lives in
 * `shared/ipc.ts` and `main/gateway.ts`, so this stays a wiring file that can be read in one
 * sitting and audited for what it is missing.
 */

/**
 * `01-F13` — a device's identity is issued at admission and persisted, never generated at
 * boot. This is a DEV SEED and is marked as one: a device that mints a fresh `device_id`
 * every launch would fork its own outbox on every restart. Admission (`01-F47`) replaces this
 * and is Wave-1 work that has not landed; until it does, the ids are stable constants rather
 * than `newId()` calls so that a relaunch resumes the same store instead of orphaning it.
 */
/**
 * This bundle's own directory.
 *
 * NOT `__dirname`: `package.json` declares `"type": "module"` and electron-vite emits main as
 * ESM accordingly, where `__dirname` does not exist. It builds cleanly either way — the
 * failure is at load, and it takes the whole app down before a window is ever created.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Where `pnpm rebuild:native` leaves the Electron-ABI `better_sqlite3.node`.
 *
 * `@electron/rebuild` writes it to `bin/<platform>-<arch>-<abi>/`, which is `better-sqlite3`'s
 * own prebuild layout, and it is deliberately NOT `build/Release/` — that path belongs to the
 * Node build every test suite in this monorepo loads. `process.versions.modules` is Electron's
 * ABI at runtime, so this resolves to the binary matching whatever Electron is executing it.
 */
const electronAddonPath = (): string =>
  join(
    createRequire(import.meta.url).resolve("better-sqlite3/package.json"),
    "..",
    "bin",
    `${process.platform}-${process.arch}-${process.versions.modules}`,
    "better-sqlite3.node",
  );

const DEV_IDENTITY = {
  org_id: "00000000-0000-7000-8000-000000000001",
  branch_id: "00000000-0000-7000-8000-000000000002",
  device_id: "00000000-0000-7000-8000-000000000003",
} as const;

/**
 * `01-F52`..`01-F56` — names come from the device catalog, and `01-F54` says a miss degrades
 * to the identifier rather than blocking. The catalog transport does not exist yet
 * (`plans/wave-1/catalog-transport.md`), so this reads the local store, which is correct and
 * currently always empty. The degradation path is therefore the one being exercised on every
 * launch, which is the right way round: the failure mode gets the mileage.
 */
const catalogResolver =
  (store: ReturnType<typeof openStore>): CatalogResolver =>
  (item_id) => {
    const entry = store.catalog.lookup("item", item_id);
    return entry ? { name: entry.name } : null;
  };

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    // 27 §1a's counter target is a 15.6" panel, and a POS is never windowed on one.
    autoHideMenuBar: true,
    webPreferences: {
      // `18 §9`, and these three lines are the whole of it. A renderer with Node access is a
      // renderer that can open the ledger, and every argument for relaxing one of these is an
      // argument for deleting the two-plane law.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(HERE, "../preload/index.cjs"),
    },
  });
  // Shown only once painted: a counter screen that flashes white on launch reads as a crash
  // to an operator who has seen one.
  window.once("ready-to-show", () => window.show());

  /**
   * **THE DOCUMENT IS PINNED, and without this the whole bridge is worthless.**
   *
   * A preload is a property of the `webContents`, not of the page — so it is re-attached to
   * every document that webContents loads, including a remote one. `contextIsolation`,
   * `sandbox` and `nodeIntegration: false` say nothing about WHICH origin gets to call
   * `window.restos`. Demonstrated against this exact build by an oracle reviewer: navigating
   * the renderer to a third-party URL left the bridge live on that origin, which then read the
   * device state, the menu and every open order, and **appended two forged events to the
   * append-only ledger under this device's identity** (`01-F1` — a forgery cannot be deleted,
   * only corrected). The `<meta>` CSP does not help: it dies with the document that carried
   * it, and the remote page brings its own.
   *
   * The navigation is also one-way — Chromium refuses `https:` → `file:` — so the till would
   * be stranded on the remote page with the bridge exposed and no route home.
   *
   * A POS has exactly one document, so the correct policy is total: no navigation off the
   * loaded document, and no new windows at all. `18 §9` says the renderer reaches main "only
   * through one preload bridge"; a bridge is only a boundary if the thing behind it is fixed.
   */
  const pinned = (): string | null => window.webContents.getURL() || null;
  window.webContents.on("will-navigate", (event, url) => {
    if (pinned() !== null && url !== pinned()) event.preventDefault();
  });
  // Covers the redirect and `window.location` paths `will-navigate` does not see.
  window.webContents.on("will-redirect", (event) => event.preventDefault());
  // No second window, ever — not a popup, not target=_blank, not `window.open`. Electron 43
  // no longer inherits webPreferences into a child, so a child has no bridge; but a chrome-less
  // desktop window showing an arbitrary remote page on a counter is its own problem.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  return window;
};

const load = (window: BrowserWindow): void => {
  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) {
    void window.loadURL(devServer);
    return;
  }
  void window.loadFile(join(HERE, "../renderer/index.html"));
};

/**
 * A launch that cannot open its store must SAY SO. `app.whenReady().then(...)` with no catch
 * meant an unhandled rejection and a process that exited with no window, no dialog and no
 * message — which is what a fresh checkout gets when `pnpm rebuild:native` has not been run,
 * the very failure this app's own CLAUDE.md documents. To an operator the POS simply "does not
 * start", and there is nothing on screen to report.
 */
const fatal = (error: unknown): void => {
  const detail = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox(
    "RestOS could not start",
    `The device store could not be opened.\n\n${detail}\n\nThis device cannot take orders until it is fixed.`,
  );
  app.exit(1);
};

app.whenReady().then(() => {
  const store = openStore({
    path: join(app.getPath("userData"), "device.db"),
    identity: DEV_IDENTITY,
    // The Electron-ABI addon, built by `pnpm rebuild:native`. One checkout serves two V8 ABIs
    // and `bindings` resolves `build/Release/` first, so leaving this to discovery means the
    // Electron build overwrites the one Node's test suites need — they fight over one file.
    // Pointing at ours by name is what lets both exist: `build/Release/` stays Node's.
    nativeBinding: electronAddonPath(),
  });

  const window = createWindow();
  load(window);

  // The renderer re-reads on this; it carries no data (`shared/ipc.ts`). Pushing the rows
  // themselves would make the push a second source of truth for what the folds already hold.
  const notifyChanged = (): void => {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.changed);
  };

  /**
   * The cloud uplink (`01-F9`). Configured by environment because admission (`01-F47`) has not
   * landed and is what will carry both of these — a device learns its gateway and its token at
   * admission, not from a shell variable.
   *
   * Absent ⇒ the device runs offline, which is `00 §5.1`'s normal state and not an error: no
   * in-branch feature may require WAN, and the till sells either way (`01-F17`).
   */
  const uplink = createUplink({
    store,
    url: process.env["RESTOS_CLOUD_URL"],
    token: process.env["RESTOS_DEVICE_TOKEN"],
    onChanged: notifyChanged,
  });
  app.on("will-quit", () => uplink.stop());

  const gateway = createGateway({
    store,
    catalog: catalogResolver(store),
    // 01-F55 — the SELLABLE set, which excludes tombstones. `catalog.lookup` above still
    // resolves them, because a reprint of an older order must render a deleted item's name.
    menu: () => store.catalog.list("item").map((e) => ({ id: e.id, name: e.name })),
    // 01-F60 — the device resolves its OWN branch's row; `priceOf` takes no branch parameter
    // precisely so this call cannot ask for another branch's price.
    priceOf: (item_id, channel) => store.catalog.priceOf("item", item_id, channel),
    actor: "dev",
    actorUserId: null,
    deviceLabel: "Counter 1",
    // 01-F49 — bound at admission from the branch class, never a UI toggle. Admission has not
    // landed, so this is false and the 27-F67 training inversion is exercised by its story.
    training: false,
    // 00 §5.7 — three separate facts, each REPORTED rather than asserted. These were two
    // hardcoded constants until the uplink existed: `cloud: "down"` unconditionally, and a
    // blocked cursor that was always null, so DEC-SYNC-011 was satisfied at the API and
    // nowhere a human could see it.
    reachability: uplink.reachability,
    blockedCursor: uplink.blockedCursor,
    // 01-F46 via `domain`, and computed from BRANCH time (01-F43), not the device clock: a
    // till whose clock is an hour fast must not roll the business day an hour early. The
    // offset is 0 until a hub is contacted, which the strip reports honestly as `down`.
    businessDay: () => businessDate(wallClock.now() + store.branchTimeStatus().offset_ms),
  });

  // One channel, one gateway method, no dispatcher. A generic handler that switched on a
  // channel name would reintroduce exactly the free-form surface `18 §9` bans.
  ipcMain.handle(CHANNELS.deviceState, () => gateway.deviceState());
  ipcMain.handle(CHANNELS.openOrders, () => gateway.openOrders());
  ipcMain.handle(CHANNELS.kitchenQueue, () => gateway.kitchenQueue());
  ipcMain.handle(CHANNELS.menu, () => gateway.menu());
  // C5 — same notify-from-inside-the-handler rule as `append` below, and for the same reason.
  ipcMain.handle(CHANNELS.addLine, (_event, req: unknown) => {
    const result = gateway.addLine(req);
    notifyChanged();
    return result;
  });
  ipcMain.handle(CHANNELS.append, (_event, req: unknown) => {
    const result = gateway.append(req);
    // NOTIFY FROM INSIDE THE HANDLER. This was `ipcMain.on(CHANNELS.append, notifyChanged)`,
    // which never fired once: `invoke` dispatches only to the `handle` table, and `.on` is the
    // `send`/`sendSync` table — two different registries on one channel name. So the renderer
    // was never told the folds moved, and the counter stayed stale until relaunch. An order
    // was appended, the store held it, and the cart still read "Nothing added yet / Rs 0".
    //
    // Latent only because `onSelect` is still a no-op; it is the core POS loop. Nothing caught
    // it because nothing tests this file — the gateway suite injects every dependency and
    // never exercises the wiring, which is exactly the seam a defect like this lives in.
    notifyChanged();
    return result;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) load(createWindow());
  });
}, fatal);

// Windows is the counter platform (`18 §9`), where closing the last window means quitting.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

export { DEV_IDENTITY };
