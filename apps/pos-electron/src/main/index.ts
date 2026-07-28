import { join } from "node:path";
import { businessDate } from "@restos/domain";
import { type BlockedCursor, openStore, wallClock } from "@restos/sync-client";
import { app, BrowserWindow, ipcMain } from "electron";
import { CHANNELS } from "../shared/ipc";
import { type CatalogResolver, createGateway } from "./gateway";

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
      preload: join(__dirname, "../preload/index.cjs"),
    },
  });
  // Shown only once painted: a counter screen that flashes white on launch reads as a crash
  // to an operator who has seen one.
  window.once("ready-to-show", () => window.show());
  return window;
};

const load = (window: BrowserWindow): void => {
  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) {
    void window.loadURL(devServer);
    return;
  }
  void window.loadFile(join(__dirname, "../renderer/index.html"));
};

app.whenReady().then(() => {
  const store = openStore({
    path: join(app.getPath("userData"), "device.db"),
    identity: DEV_IDENTITY,
  });

  /**
   * No mesh or cloud session yet, so all three facts are honestly `down` rather than
   * optimistically `ok`. `00 §5.7` requires the strip to report what is true; a shell that
   * claims a hub it has never contacted is the exact dishonesty that FR exists to prevent.
   */
  const blockedCursor = (): BlockedCursor | null => null;

  const gateway = createGateway({
    store,
    catalog: catalogResolver(store),
    actor: "dev",
    actorUserId: null,
    deviceLabel: "Counter 1",
    // 01-F49 — bound at admission from the branch class, never a UI toggle. Admission has not
    // landed, so this is false and the 27-F67 training inversion is exercised by its story.
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor,
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
  ipcMain.handle(CHANNELS.append, (_event, req: unknown) => gateway.append(req));

  const window = createWindow();
  load(window);

  // The renderer re-reads on this; it carries no data (`shared/ipc.ts`). Pushing the rows
  // themselves would make the push a second source of truth for what the folds already hold.
  const notifyChanged = (): void => {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.changed);
  };
  ipcMain.on(CHANNELS.append, notifyChanged);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) load(createWindow());
  });
});

// Windows is the counter platform (`18 §9`), where closing the last window means quitting.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

export { DEV_IDENTITY };
