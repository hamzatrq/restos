import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * The four `00 §7` resolvers this host shares with `apps/pass-kds` — `03-F14`/`03-F47`'s threshold
 * table, the device's three ids, and the density of its glass. They were app-local until each
 * acquired a second consumer; `18 §2` makes *"Apps NEVER import ... other apps"* a MUST and
 * `DEC-ARCH-001` rules EXTRACT at that moment, so they live in a package and this import is an
 * ordinary `apps → packages` edge. See `packages/device-config/CLAUDE.md`.
 */
import {
  AGING_THRESHOLDS_ENV,
  DEV_IDENTITY,
  describeAging,
  describeDeviceIdentity,
  describeLanMesh,
  describePanelDensity,
  describeServeSignal,
  measurePhysicalWidthMm,
  type PanelDensity,
  resolveAging,
  resolveDeviceIdentity,
  resolveLanMesh,
  resolvePanelDensity,
  resolveServeSignal,
  SERVE_SIGNAL_OWNER_ENV,
  type ServeSignalPolicy,
} from "@restos/device-config";
import { businessDate, hashPin } from "@restos/domain";
import { createSpooler, printerCapability } from "@restos/escpos";
import { createPinAuditSink, createPinSession, openStore, wallClock } from "@restos/sync-client";
import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { AppendRequestSchema, CHANNELS, type EscalationResult, type Session } from "../shared/ipc";
import { createAggregatorSettlement } from "./aggregator-settlement";
import { recordApprovals } from "./approval-record";
import {
  authorizeEscalation,
  authorizeReads,
  authorizeWrites,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
} from "./authorize";
import {
  catalogBootSummary,
  catalogResolver,
  priceResolver,
  seedDevMenu,
  sellableMenu,
  stationResolver,
} from "./catalog";
import { printerTransport } from "./file-printer";
import { createGateway, createVerifiedAppend } from "./gateway";
import {
  describeHardwareTier,
  HARDWARE_TIER_ENV,
  type ResolvedHardwareTier,
  resolveHardwareTier,
} from "./hardware-tier";
import { openJobStore } from "./job-store";
import { createLineAdvance } from "./line-advance";
import { createLanMesh } from "./mesh";
import {
  createCashPrinter,
  createKotPrinter,
  createReceiptPrinter,
  PUMP_INTERVAL_MS,
} from "./printing";
import { refuseDoubleSettlement } from "./settlement-guard";
import {
  describeStationRouting,
  resolveStationRouting,
  STATION_ROUTES_ENV,
  type StationRouting,
} from "./station-routing";
import { createUplink } from "./sync";
import { counterWindowOptions, describePanelFit, resolvePanelFit } from "./window-options";

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

/**
 * **A DEV SEED ROSTER, exactly like `DEV_IDENTITY` (`main/device-identity.ts`) — and unlike its
 * verifies for real.**
 *
 * What was here was a four-digit dev constant and a string comparison against it, which
 * `01-F61` has since made unsurvivable in principle: a device-wide constant identifies
 * **nobody**, so the per-(device, user) lockout cannot be keyed at all. Verification now runs
 * through
 * `createPinSession` against Argon2id hashes in `store.staff` (`01-F28`), and this exists only
 * because **nothing populates that registry yet** — `01-F47`'s admission admits *devices, not
 * people*, and the staff transport is owed. Without a seed the grid is empty and no one can
 * unlock, which would make `pnpm start` unusable and leave the whole `02-F41` attribution path
 * unexercised.
 *
 * **The PIN is NOT in this file, and that is deliberate rather than an omission.** It comes
 * from `RESTOS_DEV_PIN`, the same environment-configured route `RESTOS_CLOUD_URL` and
 * `RESTOS_DEVICE_TOKEN` already take below and for the same "admission has not landed" reason.
 * A hardcoded PIN here would be the device-wide constant `01-F61` refuses, wearing a different
 * name. Unset ⇒ **nothing is seeded**, and an empty grid on a locked till is the honest state
 * of a device no roster has reached (`00 §5.7`) — which is also what production looks like
 * until the transport lands.
 *
 *     RESTOS_DEV_PIN=<digits> pnpm start
 *
 * Every seeded member shares that one PIN, which is not a shortcut: `01-F61` names two staff
 * sharing a 4-digit PIN as the ordinary case that a bare pad cannot tell apart, so the seed
 * puts the till in exactly that state and the identification step is what resolves it.
 *
 * **Delete this the moment the staff transport lands**, and let the roster sync.
 */
/**
 * **The ROLES are part of the seed now, and the mix is deliberate.** `01-F26` makes a role a
 * per-(user, location) assignment and `main/authorize.ts` reads exactly this registry to answer
 * Commandment 8 — so a roster of three cashiers would make `02-F22`'s day open unreachable on
 * a dev launch ("day open/close and float entry require manager/owner permission — a cashier
 * session cannot execute them"), and the guard would look like a bug rather than the FR. Two
 * cashiers and one branch manager put both sides of that guard on the same till: sign in as
 * Ayesha and the day cannot be opened; sign in as Hina and it can.
 */
const DEV_STAFF = [
  { user_id: "00000000-0000-7000-8000-000000000004", display_name: "Ayesha", role: "cashier" },
  { user_id: "00000000-0000-7000-8000-000000000005", display_name: "Bilal", role: "cashier" },
  {
    user_id: "00000000-0000-7000-8000-000000000006",
    display_name: "Hina",
    role: "branch_manager",
  },
] as const;

const seedDevStaff = async (store: ReturnType<typeof openStore>): Promise<void> => {
  const pin = process.env["RESTOS_DEV_PIN"];
  if (pin === undefined || pin === "") return;
  // `01-F28`'s credential, produced by the same `domain` function the cloud writer will use —
  // the PIN itself is hashed here and never stored, never logged, never appended (`01-F1`).
  const pin_hash = await hashPin(pin);
  store.staff.apply({
    kind: "snapshot",
    version: store.staff.version() + 1,
    members: DEV_STAFF.map(({ user_id, display_name, role }) => ({
      user_id,
      display_name,
      pin_hash,
      assignments: [{ role, branch_id: store.identity.branch_id }],
    })),
  });
};

/**
 * `01-F26` — idle auto-lock is a **device-layer setting** (`00 §7` layer 3), and that config
 * plane does not exist yet, so this is a pinned interpretation and is marked as one rather
 * than left to read as a spec fact.
 */
const IDLE_LOCK_MS = 10 * 60_000;

/**
 * `01-F61` — "N consecutive failures tolerated; the (N+1)th attempt is refused". The FR fixes
 * the scope, the persistence and the cooldown but names no N, so this too is pinned, not
 * specified. Five leaves room for ordinary typing on a surface used 20–60× a shift while
 * keeping online guessing at ~13 bits hopeless against the five-minute cooldown.
 */
const MAX_FAILED_ATTEMPTS = 5;

/**
 * `03-F25` — how often the counter re-reads its own aging timers. See the interval itself for why
 * it is unconditional and why it may never move into `sync.ts`.
 *
 * One second, matching `apps/pass-kds`. It is not a resolution choice — the badge is whole minutes
 * — it is a *rounding-boundary* choice: any period P means an order's badge can be up to P late
 * turning amber, and `03-F14`'s thresholds are the one thing on this surface an operator acts on.
 * A cheaper 5–10 s would be imperceptible and is the simpler alternative if the tick ever shows up
 * as re-render cost on a real till; it is one constant.
 */
const AGE_TICK_MS = 1_000;

/**
 * The kitchen printer this device believes it has (`03 §7` layer 3).
 *
 * **NOT measured, and env-overridable for the same reason `RESTOS_CLOUD_URL` is:** the printer
 * registry `03-F2` routes through is doc-14 work and admission (`01-F47`) is what will carry the
 * assignment, so there is nowhere else for this to come from yet. Nothing is attached at all (K-8).
 *
 * **This defaulted to `TH230` until August 2026, and that was a LIVE DEFECT rather than an
 * awkward label (`DEC-HW-001` (1)).** The old comment argued the conservative record gave "the
 * wrong SENTENCE for a device that simply has none", and traded a wrong sentence for a wrong
 * CAPABILITY: `TH230` claims 44 Font-A columns, 576 dots, a cutter and raster, none of it
 * verified. `render()` lays out against the record it is handed, so attaching the corpus's own
 * baseline **BC-58U** (`03-F10`, 384 dots) without setting `RESTOS_KOT_PRINTER` produced a
 * 44-column ticket on 58 mm paper — **measured: 320 dots discarded, a whole word off the edge,
 * with nothing to tell the cook.** That is the silent degradation `03-F34` bans, aimed at the
 * named Pakistani installed base, and it shipped behind a green suite because every test injects
 * its own capability and none exercised this default.
 *
 * So the default is now `03 §7`'s own: *"defaulting **conservatively to 32** for an unknown
 * model"*. `printerCapability` returns `UNKNOWN_PRINTER_CAPABILITY` for any unrecognised id while
 * KEEPING that id, so the record under-claims in every direction (`has_native_qr: false`,
 * `has_cutter: false`, 32 Font-A columns) and the id is still `03-F5`'s printer NAME. The KOT then
 * takes `03-F49`'s floor and `03-F34`'s S1 band, which names both column counts — *"refused:
 * min_columns_not_met — needs 42 columns, this printer has 32"*. **That refusal is the correct
 * signal for a till with no printer, not a regression**: the alternative is a device that claims
 * hardware it has never seen and truncates real tickets the moment that hardware appears.
 *
 * `RESTOS_KOT_PRINTER="TH230"` restores the old behaviour for anyone who genuinely has one, and
 * a real 80 mm model id is what makes the KOT printable — which is the assignment doc 14 owes.
 */
const kotCapability = () =>
  printerCapability(process.env["RESTOS_KOT_PRINTER"] ?? "no printer configured");

/**
 * What this terminal is called (`00 §5.7` — the strip names the device beside the operator).
 *
 * A marked DEV SEED like `DEV_IDENTITY` (`main/device-identity.ts`): admission (`01-F47`) is what will carry a real
 * terminal name. One constant rather than two literals because `gateway.ts` takes it twice, and
 * a device that disagreed with itself about its own name is the shape of defect this whole file
 * is being read for.
 */
const DEVICE_LABEL = "Counter 1";

/**
 * `27-F68` / `00 §7` layer 3 — the density of the glass, resolved once per read and cached for
 * the process.
 *
 * **Lazy, because `screen` throws before `app.whenReady()`** and this module is imported at
 * load. **Cached, because it shells out** on Windows and Linux and `deviceState()` is the
 * hottest read on the device — a PowerShell spawn per poll would be absurd. The cache is the
 * honest trade: a panel swapped mid-session keeps the density it booted with until the app is
 * restarted, which is the same staleness `DEVICE_LABEL` and `training` already carry and is
 * bounded by a relaunch rather than by a reinstall.
 */
let panelDensityCache: PanelDensity | null = null;
const panelDensity = (): PanelDensity => {
  if (panelDensityCache !== null) return panelDensityCache;
  const display = screen.getPrimaryDisplay();
  panelDensityCache = resolvePanelDensity({
    // `display.size` is in DIP; the panel's own pixels are that times its scale factor. This is
    // the "resolution" half of `00 §7`'s "resolution and physical size".
    display: {
      widthPx: display.size.width * display.scaleFactor,
      heightPx: display.size.height * display.scaleFactor,
    },
    configured: process.env["RESTOS_PANEL_PPI"],
    physicalWidthMm: measurePhysicalWidthMm(process.platform, (command, args) => {
      try {
        return execFileSync(command, [...args], { encoding: "utf8", timeout: 4_000 });
      } catch {
        // A platform probe that is absent or refuses is a panel that "reports nothing"
        // (`00 §7`), which is a resolved state and never a reason to stop the till (`01-F17`).
        return null;
      }
    }),
  });
  return panelDensityCache;
};

/**
 * `02-F31` / `00 §7` layer 2 — the hardware tier, resolved once per process.
 *
 * **Cached for the process rather than read per call**, on `panelDensity`'s reasoning one function
 * up: it is read on every confirm and every KOT print, the answer cannot change without a restart
 * (the roster is unreachable, so only the environment decides it), and a till that changed tier
 * mid-service would start or stop advancing line states halfway through an order.
 *
 * `roster: null` is the whole finding of this work and it is passed explicitly rather than
 * defaulted: `02-F31`'s detection rule reads the branch device registry, and `01-F62` keeps
 * `device.registered`/`device.revoked` out of every branch stream while `hello_ack` carries no
 * roster and the device store has no table for one. `hardware-tier.ts`'s header has the full
 * check; the boot line below says it out loud to the operator.
 */
let hardwareTierCache: ResolvedHardwareTier | null = null;
const hardwareTier = (): ResolvedHardwareTier => {
  hardwareTierCache ??= resolveHardwareTier({
    roster: null,
    configured: process.env[HARDWARE_TIER_ENV],
  });
  return hardwareTierCache;
};

/**
 * `03-F52` / `00 §7` layer 2 — **who marks `served` at this branch**, resolved once per process.
 *
 * Cached for `hardwareTier`'s reasons directly above: it is read on every settlement, the answer
 * cannot change without a restart (the roster is unreachable, so only the environment decides it),
 * and a till that changed its mind mid-service would start or stop marking lines handed-over
 * halfway through a shift.
 *
 * The declaration is `@restos/device-config`'s and not this app's, because `apps/pass-kds` reads
 * the SAME value: `03-F52` — *"One declaration, no per-app fallback … Two surfaces each carrying
 * their own default is how a pass screen and a till come to disagree about who owns handover with
 * every gate green."*
 */
let serveSignalCache: ServeSignalPolicy | null = null;
const serveSignal = (): ServeSignalPolicy => {
  serveSignalCache ??= resolveServeSignal({
    roster: null,
    configured: process.env[SERVE_SIGNAL_OWNER_ENV],
  });
  return serveSignalCache;
};

/**
 * The panel this device is actually on: its density, its work area and whether that glass
 * clears `27-F11c`'s physical floor. Resolved from the same `panelDensity()` the renderer's
 * `27-F68` conversion runs on, so the window's floor and the layout's dp cannot disagree.
 *
 * A FUNCTION rather than a value for the same reason `panelDensity` is one: `screen` throws
 * before `app.whenReady()`, and a till moved to another display should be re-read rather than
 * keep the panel it booted on.
 */
const panelFacts = (): {
  panelPpi: number;
  devicePixelRatio: number;
  densitySource: PanelDensity["source"];
  workArea: { width: number; height: number };
} => {
  const display = screen.getPrimaryDisplay();
  const density = panelDensity();
  return {
    panelPpi: density.ppi,
    devicePixelRatio: display.scaleFactor,
    densitySource: density.source,
    // `workAreaSize` and not `size`: the taskbar's share is not glass this window can use, and a
    // minimum that includes it is a minimum the operator can never satisfy.
    workArea: { width: display.workAreaSize.width, height: display.workAreaSize.height },
  };
};

/**
 * `03-F22`/`03-F51` / `00 §7` layer 2 — where each station's ticket GOES, resolved once per process.
 *
 * Cached for `hardwareTier`'s reason exactly: it is read on every confirm, only the environment can
 * change it, and a till that changed a station's route mid-service would print half an order's
 * tickets and not the rest.
 *
 * **`kitchen_screen` is the ONE place a tier touches a hardware question, and the mapping is drawn
 * narrowly on purpose.** `DEC-HW-003`'s checkable rule is *"no code may branch on the tier to decide
 * whether a piece of hardware EXISTS"*, and this does not: it feeds `02-F31`'s answer into a
 * CONFIGURATION-TIME validator and nowhere else, and the routing decision itself (`routesToPaper`,
 * read per ticket) never sees a tier at all. An `assumed` tier is passed as **`null`** rather than
 * as T1 — an assumption is not a registry, and `03-F51` says an unknown is not a blessing. That is
 * every shipped device today, so today the check reports `unverified` and never refuses.
 */
let stationRoutingCache: StationRouting | null = null;
const stationRouting = (): StationRouting => {
  const tier = hardwareTier();
  stationRoutingCache ??= resolveStationRouting({
    configured: process.env[STATION_ROUTES_ENV],
    kitchen_screen: tier.source === "assumed" ? null : tier.tier !== "T1",
  });
  return stationRoutingCache;
};

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    /**
     * `27 §1a`'s panel and `27-F11c`'s floor, from the module the LAYOUT GATE also reads
     * (`main/window-options.ts`). Spread first so nothing below can silently widen the contract
     * without the gate seeing it.
     *
     * **The floor is millimetres now, and it CLAMPS instead of refusing** — see that module's
     * header for the measurements. The short version is that `minWidth: 1366` refused a
     * 1280×800 @13.3″ laptop that renders the whole counter with zero violations and admitted a
     * 1366×768 @10.1″ tablet that clips two surfaces, because a pixel count is not a size. Under
     * bring-your-own-hardware a till that will not start is worse than a till that starts and
     * says what it cannot do (`00 §5.7`), which is what `panelFit` below carries to the strip.
     */
    ...counterWindowOptions(panelFacts()),
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

app.whenReady().then(async () => {
  // Resolved BEFORE the store, and inside `whenReady` so a refusal reaches `fatal`'s dialog
  // rather than dying at module load with no window and nothing on screen.
  const identity = resolveDeviceIdentity(process.env);
  const store = openStore({
    path: join(app.getPath("userData"), "device.db"),
    identity,
    // The Electron-ABI addon, built by `pnpm rebuild:native`. One checkout serves two V8 ABIs
    // and `bindings` resolves `build/Release/` first, so leaving this to discovery means the
    // Electron build overwrites the one Node's test suites need — they fight over one file.
    // Pointing at ours by name is what lets both exist: `build/Release/` stays Node's.
    nativeBinding: electronAddonPath(),
  });

  // Before the window, so the first paint of the identification grid already has a roster to
  // draw: a grid that fills in a moment later would move tiles under a finger (`27-F4`).
  await seedDevStaff(store);
  /**
   * T-C6 — and for the same reason and on the same schedule as the roster above: the catalog
   * TRANSPORT is real and wired (`createUplink` below), but the back office that publishes a
   * catalog for it to carry has not landed. `RESTOS_DEV_MENU` opt-in, applied at version 0 so a
   * real gateway still fetches over the top of it, and skipped outright once this device holds a
   * synced catalog. See `catalog.ts` — and delete it when the back office lands.
   */
  seedDevMenu(store);

  const window = createWindow();
  load(window);

  // The renderer re-reads on this; it carries no data (`shared/ipc.ts`). Pushing the rows
  // themselves would make the push a second source of truth for what the folds already hold.
  const notifyRenderer = (): void => {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.changed);
  };

  /**
   * **`01-F12`/`01-F13`/`01-F15` — the branch hub, and this till is it.**
   *
   * `01-F13` ranks `counter_electron` first among the hub-eligible classes, so a Windows counter
   * terminal is the branch's preferred hub. Until this line the mesh was built, property-tested and
   * constructed by nothing outside a gateway spike — `restaurant-os.md` puts it in **Wave 0** and
   * `mesh-session.ts` carried `@unreached-owed NO HOST RUNS THE LAN MESH YET`, the oldest open item
   * in the product. The consequence was the product's shape: `apps/pass-kds` learned about new
   * orders over the WAN only, so an internet outage stopped the kitchen while this till went on
   * selling — `00 §5.1` and commandment 4 broken in effect.
   *
   * Built BEFORE the uplink and unconditionally: nothing about the LAN may be conditional on a WAN
   * endpoint being configured. See `mesh.ts`.
   */
  const lan = resolveLanMesh(process.env);
  const mesh = createLanMesh({ store, lan, onChanged: notifyRenderer });
  app.on("will-quit", () => mesh.stop());

  /**
   * `01-F15`'s fast path, as one funnel. Every append path in this file already calls
   * `notifyChanged`, so a confirmed order reaches the pass screen at the instant it is durable
   * rather than on `mesh-session.ts`'s 2 s window re-fan — measured at 1519 ms for one order, which
   * is outside the FR's "< 1 s p95" on its own. This is the funnel `sync.ts` names as owed for the
   * cloud half; the LAN half has it.
   */
  const notifyChanged = (): void => {
    mesh.notifyAppended();
    notifyRenderer();
  };

  /**
   * The cloud uplink (`01-F9`). Configured by environment because admission (`01-F47`) has not
   * landed and is what will carry both of these — a device learns its gateway and its token at
   * admission, not from a shell variable.
   *
   * Absent ⇒ the device runs offline, which is `00 §5.1`'s normal state and not an error: no
   * in-branch feature may require WAN, and the till sells either way (`01-F17`).
   */
  /**
   * `01-F26`/`01-F28`/`01-F61` — the PIN session, and `null` is LOCKED. **The verifier, not a
   * comparison**: `createPinSession` looks the identity up in the synced registry, checks the
   * PIN against *that member's* Argon2id hash, and keys its failure counter on the
   * (device, user) pair.
   *
   * `attempts: store.pinAttempts` is the line that makes `01-F61`'s second decision real —
   * "the counter PERSISTS across an app restart. A counter held in memory is defeated by
   * relaunching the app, which makes the lockout theatre — and the attacker who most needs
   * locking out is standing at the device with physical access to do exactly that." Omitted,
   * `pin-session.ts` falls back to a process-lifetime counter, which is precisely that
   * theatre.
   *
   * The session itself stays process-local, which is a different question and unchanged: a
   * relaunch is a locked till, the honest state for a device nobody has identified to.
   */
  const pins = createPinSession({
    // `01-F28` — the synced credential hashes, on disk, verified with the WAN cable pulled.
    registry: store.staff,
    // `01-F27`'s other axis. `registered: true` because the resolved identity stands in for an
    // admitted device; when `01-F47` lands this reads the real admission state and an
    // unpaired terminal refuses every PIN (`01-F25`, `01-F48` fail-closed).
    device: { device_id: store.identity.device_id, registered: true },
    idle_lock_ms: IDLE_LOCK_MS,
    max_failed_attempts: MAX_FAILED_ATTEMPTS,
    now: () => wallClock.now(),
    /**
     * **OWED, and named here rather than left to look intentional.** `01-F5` puts `audit.login`
     * in the ledger on a store-owned chain. **Wired August 2026** — it was a no-op sink for one
     * day, during which an unlock, a wrong PIN and a lockout left no trail at all and `01-F5`
     * was unsatisfied on the only path that produces `audit.login`. That is this wave's
     * recurring defect (AGENTS.md): a correct subsystem — here `pin-audit.ts`, 15 tests, seven
     * mutants killed — with no seam to the product, green everywhere and reaching nothing.
     *
     * The sink NAMES its fields rather than spreading the record, because `01-F1` has no
     * redaction path: a PIN that reached an append would be a credential published to every
     * device that syncs and never retractable. It also swallows its own append failure
     * (`01-F17` — a sale is never blocked), which is why a failed audit write is currently
     * SILENT: no FR names a surface that owns "the trail could not be written".
     */
    audit: createPinAuditSink({ store, now: () => wallClock.now() }),
    attempts: store.pinAttempts,
  });

  /**
   * `02-F41`/`02-F45` — one fact, read at every append and at every `deviceState()`, never
   * captured. `currentUser()` is what evaluates `01-F26`'s idle auto-lock, so a session that
   * has timed out reads as locked here without anything having to fire a timer.
   *
   * The label degrades to the identifier when the roster row carries no `display_name` or has
   * gone (`01-F42` removes it) — `01-F54`'s rule, and the alternative is a strip that reports
   * an empty name over a ledger that is attributing correctly.
   */
  const session = (): Session | null => {
    const user_id = pins.currentUser();
    if (user_id === null) return null;
    return { user_id, display_name: store.staff.lookup(user_id)?.display_name ?? user_id };
  };

  const uplink = createUplink({
    store,
    url: process.env["RESTOS_CLOUD_URL"],
    token: process.env["RESTOS_DEVICE_TOKEN"],
    onChanged: notifyChanged,
  });
  app.on("will-quit", () => uplink.stop());

  /**
   * `03-F14` / `03-F47` / `03 §7` layer 2 — the aging thresholds, per order type.
   *
   * Read ONCE per process, like `stationRouting` above and for the same reason: only the
   * environment can change it, and a till whose thresholds moved mid-service would colour two
   * orders of the same age differently. A malformed entry is refused and NOT applied — the FR's
   * own defaults stand and the boot line says which entry was unreadable, because `01-F17` and
   * commandment 4 mean a typo in a threshold may never take a timer off a counter.
   */
  const aging = resolveAging(process.env[AGING_THRESHOLDS_ENV]);

  const gateway = createGateway({
    store,
    // T-C6 — all three read the device catalog the uplink fills, and all three live in
    // `catalog.ts` rather than inline here so a test can drive them (this file imports
    // `electron`, so nothing declared in it is reachable from vitest). `01-F54` display names,
    // `01-F55`'s sellable set, `01-F60`'s own-branch price.
    catalog: catalogResolver(store),
    menu: sellableMenu(store),
    priceOf: priceResolver(store),
    /**
     * The LOCKED value of `DeviceState.actor`, and nothing else — `gateway.ts` derives the
     * operator's name from `session` below.
     *
     * It read `"dev"` until August 2026, and `StatusStrip` renders that field under `02-F19` as
     * the person acting. So this device signed Ayesha in, authorized her against the matrix,
     * stamped `actor_user_id: "user-ayesha"` into every envelope — and told her she was `dev`.
     * `02-F45`'s two-sources-for-one-fact, on the screen rather than in the payload.
     *
     * The device's own label, not a placeholder person: `01-F27` forbids a device identity
     * standing in for a user identity, and `02-F18` means this string reaches no surface anyway.
     */
    actor: DEVICE_LABEL,
    // 02-F41 — read at every append, never captured here. `session` is the function above;
    // closing over its VALUE would freeze attribution at boot, which is the defect this dep
    // replaced.
    session,
    deviceLabel: DEVICE_LABEL,
    // 01-F49 — bound at admission from the branch class, never a UI toggle. Admission has not
    // landed, so this is false and the 27-F67 training inversion is exercised by its story.
    training: false,
    // 00 §5.7 — three separate facts, each REPORTED rather than asserted, and each owned by the
    // thing that knows it. `cloud: "down"` was hardcoded until the uplink existed; `lan` and `hub`
    // were hardcoded for a year longer, because the mesh that knows them was hosted by nothing.
    reachability: () => ({ ...mesh.reachability(), ...uplink.reachability() }),
    blockedCursor: uplink.blockedCursor,
    /**
     * **`01-F56` / `DEC-SYNC-011` (a) — THE SEAM, and it is the whole of this task.**
     *
     * `Uplink.catalogRefusal` was built with T-C6, carried `01-F56`'s refusal correctly out of
     * the cloud session, and had **no consumer**: `DeviceState` had a `blocked` cursor and no
     * catalog-health field, so a till could refuse every menu update the cloud sent it — wrong
     * base version, malformed snapshot, a server that stopped paging — and go on drawing the old
     * grid with every chip on the strip reading healthy. This one argument is what makes the
     * observability `DEC-SYNC-011` ratified reach the person standing at the counter.
     *
     * **It is the argument, not the subsystem, that this wave keeps losing.** `catalogRefusal:
     * () => null` compiles, typechecks, keeps `seams:check` clean (the member is *supplied* —
     * Rule B never asks whether what was supplied is real) and silently deletes the surface.
     * `__acceptance__/catalog-health-seam.test.ts` is the hand-written assertion that separates
     * this line from that one, because no rail in this repo can.
     */
    catalogRefusal: uplink.catalogRefusal,
    // 01-F46 via `domain`, and computed from BRANCH time (01-F43), not the device clock: a
    // till whose clock is an hour fast must not roll the business day an hour early. The
    // offset is 0 until a hub is contacted, which the strip reports honestly as `down`.
    businessDay: () => businessDate(wallClock.now() + store.branchTimeStatus().offset_ms),
    /**
     * `27-F68` / `00 §7` layer 3 — the density of the glass, and the input that makes a dp a
     * physical size instead of a CSS pixel. A GETTER, so a till moved to another display resizes
     * its own touch targets rather than keeping the panel it booted on.
     *
     * `screen` is required lazily: it is a main-process module that throws if it is touched
     * before `app.whenReady()`, and this function outlives the call that builds the gateway.
     */
    panelPpi: () => panelDensity().ppi,
    /**
     * `00 §5.7` / `27-F11c` — whether the glass in front of the operator is big enough for the
     * counter layout, and `null` when it is (`27-F16` spends nothing on the base case).
     *
     * A GETTER for the same reason `panelPpi` is one, and REQUIRED for the reason
     * `catalogRefusal` is: this is the seam the founder ruling exists to create, and an optional
     * dep with no supplier is `seams:check` Rule B's own defect. The floor now CLAMPS rather than
     * refusing, so without this the degradation ships completely silent — which is worse than
     * the refusal it replaced.
     */
    panelFit: () => resolvePanelFit(panelFacts()),
    /**
     * **`03-F25` — THE SEAM, and `03-F14`'s numbers are the org's, not this file's.**
     *
     * > 03-F25 timers from `order.confirmed` on every queue surface (pass, KDS, **POS T1 panel**,
     * > manager console). No learning required; this alone is the Wave 1 deliverable.
     *
     * Resolved from `00 §7` layer 2 above and passed as the resolver ITSELF. A literal pair here
     * — `() => ({ amberAt: 10, redAt: 20 })` — would compile, typecheck, keep `seams:check` clean
     * (Rule B asks whether a member was supplied, never whether what was supplied is real) and
     * silently delete an org's configuration for the counter while the pass screen kept it. That
     * is `AGENTS.md`'s "a port supplied with a STUB", and `__acceptance__/orders-aging.test.ts`
     * §E is the hand-written assertion that separates this line from that one.
     */
    aging: aging.thresholdsFor,
  });

  /**
   * `00 §5.7` — the device reports what is TRUE, and on this field being wrong looks exactly
   * like being right: every `27-F8` target renders at the wrong physical size and nothing on
   * screen is visibly broken. So the source is printed, and the `assumed` case says so at
   * length. This is the same argument as `catalogBootSummary` directly above.
   */
  console.log(describeDeviceIdentity(store.identity, process.env));

  console.log(describePanelDensity(panelDensity()));

  /**
   * `00 §5.7` again, and for a value with the same property: a wrong tier is invisible from the
   * screen. A T1 till silently advances line states nothing else will; a T2 till that thinks it is
   * T1 races the human who owns the ready signal (`03-F24`). The source travels with the value and
   * the `assumed` case names the correction, exactly as the density line above does.
   */
  console.log(describeHardwareTier(hardwareTier()));

  /**
   * `00 §5.7` a second time on the same page, and this value replaced the tier as the input to
   * `02-F31`'s settlement half (`03-F52`). It has the same property that put the line above it
   * here: a till that assumed it owns the handover marks every settled order `served` — terminally
   * (`01-F35`), permanently (`01-F1`) — and looks exactly like a till that was TOLD to. The
   * `assumed` case says so at length and names the correction on both devices.
   */
  console.log(describeServeSignal(serveSignal()));

  /**
   * `27-F11c` / `00 §5.7` — and the same argument one line down from the density it depends on.
   * The window's floor is millimetres now and it CLAMPS instead of refusing, so a till on glass
   * too small for its own layout starts and runs; this line, and `CatalogHealth`'s neighbour on
   * the strip, are the whole of what stops that being silent.
   */
  console.log(describePanelFit(resolvePanelFit(panelFacts())));

  /**
   * `00 §5.7` a third time, and this value is the worst of the three to be wrong about because it
   * is wrong SILENTLY IN BOTH DIRECTIONS. A station left on paper at a branch with no printer bands
   * for ever and appends a permanent `kot.print_failed` per ticket (`01-F1`); a station routed to a
   * screen that does not exist cooks nothing and **cannot** raise `03-F5`, because the FR is about
   * a job that failed and no job was made. So the line names the screen-only stations by name and
   * says whether anything confirmed they have somewhere to appear.
   */
  console.log(describeStationRouting(stationRouting()));

  /**
   * `00 §5.7` a fourth time, on a value with exactly the same property as the three above it: a
   * wrong aging threshold is **invisible from the screen**. Every ticket still shows a number and
   * a colour, and nothing looks broken — the order simply goes amber at the wrong minute, which is
   * `03-F47`'s *"colour that lies about how late the food is"*. So the line names all four rows and
   * a REFUSED configuration says which entry it could not read, at length.
   */
  console.log(describeAging(aging));

  /**
   * `00 §5.7` a fifth time, and this one is the sharpest of them: **a branch with no LAN mesh looks
   * exactly like a branch with one and nothing to say.** The pass screen shows an empty queue,
   * which is also what a quiet kitchen looks like; the till sells all day either way (`01-F17`).
   * So the line names the port this hub is listening on and every peer it will dial, and says out
   * loud when there are none.
   */
  console.log(describeLanMesh(lan));

  /**
   * **Say what the grid will actually show, at boot.** Without this the till renders item names
   * with `no price set` under every tile and NOTHING anywhere explains why — which is exactly how
   * a first look at this app ended: six tiles, six refusals, and no way to tell a stale dev store
   * from a real `01-F60` gap.
   *
   * The two states are genuinely different and only one is a bug. A **priced** count of 0 with a
   * non-zero item count means the catalog was seeded by an older build (or synced without prices
   * for this branch/channel) — relaunch with `RESTOS_DEV_MENU=1`, which re-applies. A count of 0
   * items means nothing has ever reached this device, which is `01-F54`'s honest resting state
   * until the catalog transport delivers.
   *
   * `00 §5.7` is the rule this serves: a surface reports what is TRUE. A log line is the cheapest
   * place to be true about a state the operator cannot otherwise diagnose.
   */
  // `"counter"` explicitly: a boot line has to name ONE channel to count unpriced tiles
  // against, and `01-F60` makes "unpriced" a question about a `(branch, channel)` pair with no
  // channel-free answer. This reports the counter column and says so, rather than implying the
  // count holds for every channel the org sells on — a phone or foodpanda order resolves its
  // own column and may be greyed differently.
  console.log(catalogBootSummary(store, gateway.menu("counter")));

  /**
   * **COMMANDMENT 8, and this is the line that makes it true of this product.**
   *
   * `packages/domain/src/permissions.ts` has shipped the matrix, `can`, `canPayOut` and
   * `reportScope` — 89 tests, 28/28 mutants killed — with ZERO production callers, so a written
   * and proven authorization matrix decided nothing anywhere. This is its first caller, and it
   * is deliberately a WRAPPER rather than a change inside `createGateway`: the two objects that
   * come out of it are the trust boundary, drawn once, where a reader can see it.
   *
   * - `writes` is what the RENDERER reaches (the two `ipcMain.handle` write channels below).
   *   Every request through it is authorized against the matrix before the ledger is touched.
   *   `18 §9` gives the renderer no Node access and one typed bridge, so main is what
   *   "server-side" means here — `CashSurfaces.tsx` may hide a control, and this refuses the
   *   operation whether or not it was ever drawn.
   * - `gateway` stays raw and is handed to the KOT printer below, whose `kot.printed` /
   *   `kot.print_failed` are DEVICE facts nobody performs. `02-F19` does not list them, Appendix
   *   A has no row, and a matrix row invented for them would be the speculative widening
   *   `24-F23` forbids. Authorizing them would also block `03-F5`'s alarm on a locked till,
   *   where the whole point is that the counter finds out food is not being cooked.
   *
   * The threshold is passed EXPLICITLY: `canPayOut` takes it as a required parameter on
   * `01-F60`'s precedent (an optional completeness input means a forgetful caller silently skips
   * the check), and the pin itself is stated and reasoned in `authorize.ts`.
   */
  /**
   * `DEC-MONEY-009` — **THE SEAM FOR THE DOUBLE-SETTLEMENT REFUSAL, and its position is the
   * decision.**
   *
   * It wraps the RAW gateway and is itself wrapped by `authorizeWrites`, so the order a renderer
   * request travels is **matrix → duplicate check → ledger**. Commandment 8 first, deliberately: a
   * session with no `payment.settle` permission must be told it may not settle, not told the bill
   * is already paid.
   *
   * **`store` is the ONLY thing it is handed, and that narrowness IS commandment 4.** The refusal
   * is a local read of this device's own converged fold — no transport, no lock, no peer — because
   * a till that must ask the cloud whether an order is settled stops selling when the WAN drops
   * (`01-F17`, `00 §5.1`, `05-F8`). A till that reads its own state and declines to settle an
   * order it already knows is settled is refusing a **duplicate**, not blocking a sale.
   *
   * **It does not close the defect and must not be described as doing so:** two PARTITIONED tills
   * have not converged, so neither can know and both accept. See `settlement-guard.ts`'s header
   * and `DEC-MONEY-009`'s residual column.
   */
  const settlementGuarded = refuseDoubleSettlement({ writes: gateway, store });

  const writes = authorizeWrites({
    writes: settlementGuarded,
    store,
    session,
    paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
  });

  /**
   * **Commandment 8 applies to READS too** — `02-F23`: *"cashiers see only their own shifts …
   * cross-cashier views belong to manager/owner surfaces (docs 05/12)."*
   *
   * The `cashState` channel served the whole shift/day fold to whoever asked, so a cashier could
   * read every colleague's drawer, count and over/short off her own till. `18 §9` makes main the
   * trusted side, so the narrowing happens HERE: the renderer may show less than it is handed,
   * but it must not be able to ask for more, and a filter in `CashSurfaces.tsx` would be a
   * client role claim deciding a privacy rule.
   *
   * Same `store` and the same `session` getter as the write guard directly above, deliberately:
   * one construction, one subject. Two would be `02-F45`'s disagreement with no rule for which
   * wins — a session refused a write and granted the read of its result.
   */
  const reads = authorizeReads({ reads: gateway, store, session });

  /**
   * **`02-F20`'s LOCAL manager-PIN path — the third outcome finally reaching a surface.**
   *
   * `can()` returns three values and `escalate` had no path anywhere in the product, so an
   * above-threshold paid-out (`05-F19`) was refused outright at every till this wave ships.
   *
   * ── Why a SECOND `createPinSession` and not the one above ────────────────────────────────
   *
   * `unlock()` MOVES the session — `pins.unlock(manager, …)` would sign the manager in and sign
   * the cashier out, and `02-F41` would then attribute the next twenty orders to whoever
   * authorised one paid-out, permanently (`01-F1`). `02-F20` wants the opposite: *"the recorded
   * event carries actor + approver"*, two identities, the actor unchanged.
   *
   * It is the same CREDENTIAL SURFACE, not a second one, and that is what matters: the same
   * `createPinSession` code, the same `store.staff` Argon2id hashes (`01-F28`), the same
   * `MAX_FAILED_ATTEMPTS`, and — the line that carries `01-F61` — the same **durable
   * `store.pinAttempts`**, so failures at the approval pad and failures at the unlock gate count
   * against one per-(device, user) counter and survive a relaunch. A hand-rolled `verifyPin` call
   * here would be a second credential surface with its own lockout to forget.
   *
   * Its own `currentUser()` is never read by anything: `session` above is bound to `pins`, and
   * `__acceptance__/escalation.test.ts` §E asserts the till still names the cashier after an
   * approval.
   *
   * **`audit: () => {}` is a stated gap, not the instance-4 defect repeating.** `createPinSession`
   * hardcodes `type: "audit.login"`, and a manager who authorised a paid-out did NOT log in —
   * writing one would put a session that never existed into a permanent ledger. `01-F5`'s
   * `audit.threshold_override` is the subtype this act belongs under, but the sink cannot express
   * it and `sync-client` is a protected path outside this task. What IS recorded: the approver on
   * the event itself (`02-F20`), and every failed attempt in the durable counter above.
   */
  const approvals = createPinSession({
    registry: store.staff,
    device: { device_id: store.identity.device_id, registered: true },
    idle_lock_ms: IDLE_LOCK_MS,
    max_failed_attempts: MAX_FAILED_ATTEMPTS,
    now: () => wallClock.now(),
    audit: () => {},
    attempts: store.pinAttempts,
  });

  const escalation = authorizeEscalation({
    // The RAW gateway: this object performs the authorization itself and appending through
    // `writes` would re-run the guard that already refused the unescalated write.
    writes: gateway,
    store,
    // The REQUESTER, and it stays the requester: `subjectOf` reads this for `02-F38`'s
    // self-approval rule and `gateway.append` reads it for `02-F41`'s attribution.
    session,
    paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
    verifyApprover: async (user_id, pin) => (await approvals.unlock(user_id, pin)).ok,
  });

  /**
   * **`05-F6` — *"every decision is fully logged"*, which until August 2026 it was not.**
   *
   * The escalation above appends the escalated write with the approver in its payload and nothing
   * else, so a GRANT left only its consequence and a DENIAL left nothing at all — and `05-F28`'s
   * approval queue had no producer anywhere in the product. This decorates it: the request is
   * announced when the pad is raised, and the decision is recorded when it resolves.
   *
   * **`appendAs` is the whole design in one argument.** `createVerifiedAppend` names the actor
   * explicitly, where all three of `gateway.append`'s sites read the live session — which is right
   * for `02-F41` (the cashier's act stays hers) and wrong for a grant, whose envelope must name
   * the MANAGER (`registry.ts`, `05-F29`). Wiring this to anything session-reading is the defect
   * the whole task exists to prevent, and it is invisible to every behavioural test in this repo:
   * the payload would still carry both identities and only the envelope would be wrong.
   */
  const approvalRecord = recordApprovals({
    escalation,
    // The REQUESTER, the same getter the escalation and `gateway.append` read. The approver is
    // never a session here — she is an argument the escalation has just verified.
    session,
    store,
    appendAs: createVerifiedAppend({ store }),
  });

  /**
   * `03-F4`/`03-F5` — the durable print spooler and the thing that feeds it.
   *
   * **This is K-7's whole point, and it is four lines.** `packages/escpos` shipped the encoder,
   * the KOT layout, the pure `render()` and a 244-test spooler with NO production caller — the
   * defect AGENTS.md names, in its fifth instance. `createSpooler` is called here, once, at
   * startup, unconditionally: a spooler constructed only when some option is set is the same
   * defect wearing the `store.pinAttempts` hat.
   *
   * `printerTransport` picks the transport, and **with no environment set it picks
   * `unattachedPrinter`** — the honest one: no USB, Bluetooth or TCP-9100 transport exists
   * (`18 §10`), so every transmit reports that the printer did not answer, the retry budget
   * exhausts, and the counter gets `03-F5`'s band naming the printer and the order. That is
   * exactly true of this device today. K-8 replaces this ONE argument.
   *
   * `RESTOS_PRINT_TO_FILE=<directory>` swaps in `filePrinter`, which writes the rendered document
   * to a PDF so a till with no hardware still produces something a human can look at. It is opt-in
   * and it **does not close K-8**: it renders what our own encoder thinks the bytes mean, it is not
   * evidence about a TH230 or about legibility (`27-F35` is owed), and it must never become the
   * default — the band IS the honest signal that no printer is attached. See `file-printer.ts`.
   *
   * `store` is `03-F4`'s crash clause and it is the OTHER half of the same defect: K-7 wired the
   * spooler and passed no store, so the queue was process-lifetime and a relaunch lost every
   * queued ticket — the exact power-cut case the FR names, against a `SpoolerJobStore` seam whose
   * oracle exists to prevent it. Wired August 2026 (`job-store.ts`, SQLite + WAL). A spooler
   * without it satisfies `03-F4`'s ORDER ("recorded before the first transmit") and none of its
   * durability, and no test inside `packages/escpos` can catch a host that forgets — which is why
   * `__acceptance__/kot-printing.test.ts` §G asserts on THIS construction.
   */
  const jobs = openJobStore({
    path: join(app.getPath("userData"), "print-spool.db"),
    nativeBinding: electronAddonPath(),
  });
  app.on("will-quit", () => jobs.close());
  const spooler = createSpooler({
    transport: printerTransport(kotCapability(), process.env),
    store: jobs,
  });
  /**
   * `02-F31` — **the producer for `order.line_state_changed`**, which this product did not have.
   *
   * The event type has had a `packages/domain` schema and a `merge.ts` fold consumer throughout,
   * and no production emitter, so every line of every order has sat at `placed` since the first
   * order was rung. `seams:check` is structurally blind to that shape — a key in an object literal
   * is not an export — which is the same blind spot `audit.print_acknowledged` fell through, and
   * `__acceptance__/line-advance-seam.test.ts` is this one's hand-written assertion.
   *
   * `gateway`, not `writes`: `WRITE_ACTIONS` fails closed and carries no row for this type, so the
   * authorized surface would DENY it. That is right for the renderer's channel and wrong here, for
   * the reason the `kot` printer above already takes the raw gateway — `02-F31`'s advance is by
   * definition the case *"where no device exists to signal them"*, i.e. an act nobody performs.
   * `line-advance.ts`'s `append` dep carries the full argument and the limits on it.
   */
  const lines = createLineAdvance({
    store,
    tier: () => hardwareTier().tier,
    // `03-F52` — the settlement half's trigger. `printEvent` still reads `tier` above; only this
    // one moved, and the assignment comes out of the shared declaration both apps read.
    serveOwner: () => serveSignal().owner,
    append: (type, payload) => {
      gateway.append({ type, payload, refs: [] });
      notifyChanged();
    },
  });
  /**
   * `02-F30`/`08-F17` — **the producer for `01-F32`'s aggregator receivable**, which this product
   * did not have.
   *
   * `Counter.tsx` could tag an order `foodpanda` and nothing ever settled it, so real food left the
   * kitchen against `pay_total: 0` permanently (`01-F1`) and `02-F24`'s day summary printed a
   * **Rs 0 Foodpanda row** while the aggregator owed the restaurant money. That is the wave's named
   * defect in the shape `seams:check` is blind to: a missing PRODUCER for an event type is neither
   * an unreached export nor an unsupplied optional, exactly as `audit.print_acknowledged` was.
   * `__acceptance__/aggregator-settlement.test.ts` §H is this one's hand-written assertion.
   *
   * `gateway`, not `writes`: `02-F30`'s content is that there is **no settlement step**, so there
   * is no human act for commandment 8 to authorize — and gating the aggregator's bookkeeping on
   * the confirming cashier's `payment.settle` cell would leave the receivable unwritten with
   * nothing on screen to say so. `aggregator-settlement.ts`'s `append` dep carries the full
   * argument and its limits.
   */
  const aggregator = createAggregatorSettlement({
    store,
    append: (type, payload) => {
      gateway.append({ type, payload, refs: [] });
      notifyChanged();
    },
  });
  const kot = createKotPrinter({
    spooler,
    store,
    catalog: catalogResolver(store),
    // 03-F50 — the station cooks the line, resolved up the 01-F21 chain by the catalog itself.
    // An unrouted line lands on DEFAULT_STATION rather than vanishing off every ticket.
    station: stationResolver(store),
    // `03-F22`/`03-F51` — **THE SEAM.** A station configured screen-only enqueues no job, so a
    // printerless kitchen produces no failed transmit, no exhausted budget, no permanent
    // `kot.print_failed` (`01-F1`) and no vendor page (`15-F14`). Passing the REAL resolution and
    // not a literal is the point: `() => true` here is a product with no `03-F51` in it at all.
    // DELETING this argument is now caught — `seams:check` Rule B walks `apps/` as of 2026-08-10,
    // and it did not before (the check was exit-0 clean with the argument gone, measured). But
    // **no rail can see the difference between this resolver and `() => true`**, because a stub is
    // a supply; `__acceptance__/station-routing-seam.test.ts` §E, which reads this construction,
    // is still the only guard on that.
    routesToPaper: (at) => stationRouting().routesToPaper(at),
    capability: kotCapability(),
    // 03-F5's `kot.print_failed` and 02-F31's `kot.printed`, through the gateway so the envelope
    // is stamped exactly like every other append (02-F41's read-at-append attribution included).
    // The push is what makes the band appear without the renderer polling.
    //
    // ⚠ **THIS CALLBACK ALSO CARRIES `03-F53`'s `printer.status_changed`, AND NO SUITE WATCHES IT
    // ARRIVE — measured 2026-08-13 (adversarial mutation).** Dropping that one type here
    // (`if (type === "printer.status_changed") return;`) leaves **all 866 tests green**: the
    // producer suite constructs its own `createKotPrinter` with its own `append`, so it proves the
    // event is COMPUTED and never that the product's ledger receives it. This is AGENTS.md's named
    // blind spot verbatim — *"a port supplied with a stub … Rule B asks whether an optional member
    // is supplied, never whether what was supplied is real"* — and `seams:check` is clean either
    // way. The only evidence that the chain closes is a MANUAL run (a real till, a dead printer,
    // two orders, one `printer.status_changed` row in `device.db`), which is a measurement and not
    // an assertion. `station-routing-seam.test.ts` §E is the shape that would fix it: read this
    // construction as source and assert the type is not filtered out of it.
    append: (type, payload) => {
      gateway.append({ type, payload, refs: [] });
      // `02-F31` — **THE SEAM.** *"line statuses auto-advance where no device exists to signal
      // them: `kot.printed` → lines `in_prep`"*. It hangs off the completed append rather than
      // replacing it: `kot.printed` is the ledger fact and the line edge is a second, separate
      // event, because `01 §4` gives line state its own type and `merge.ts` keeps `kot.printed`
      // projection-inert on purpose (the confirm is the age anchor, so a print can never move it).
      //
      // The WHOLE callback signature goes in, not an order id: this callback also carries
      // `kot.print_failed` and `audit.print_acknowledged`, and the branch that tells them apart
      // belongs where a test can drive it rather than here, where a suite could only hand-copy it.
      // `LineAdvance.printEvent` has the measurement that decided that.
      lines.printEvent(type, payload);
      notifyChanged();
    },
  });
  /**
   * S-7 — `02-F23`'s shift-close slip and `02-F24`'s day summary, on the SAME durable spooler.
   *
   * Constructed here, once, unconditionally, for the reason the line above it exists at all: a
   * document type nothing prints is this wave's named defect, and `packages/escpos` has now shed
   * that once (K-7). It shares `spooler` because `03-F42` makes a DOCUMENT the unit and not the
   * queue, and it takes `kot.pump` rather than owning a second driver — two pump loops over one
   * spooler would spend `03-F4`'s three-attempt budget in half the window and turn `03-F5`'s 45 s
   * bound into ~20 s.
   *
   * It takes NO `append`, and that is a stated gap rather than an omission: `01 §4` has no
   * `slip.printed` and no `slip.print_failed`, so a failed cash slip reaches the counter's band
   * and nothing in the ledger (`main/printing.ts`'s `CASH_JOB_PREFIX` has the full reasoning).
   */
  const cash = createCashPrinter({
    spooler,
    store,
    capability: kotCapability(),
    pump: kot.pump,
    // `03-F5`'s acknowledgement — the ONE ledger fact this printer writes. Not a print event:
    // `01 §4` still has no `slip.printed`/`slip.print_failed` and none is invented. `01-F5`'s
    // sixth subtype records that a human dismissed a `03-F5` band, and one tap on
    // `CHANNELS.acknowledgeAlarm` dismisses either printer's, so both are wired or the record
    // depends on which printer owned the alarm.
    append: (type, payload) => {
      gateway.append({ type, payload, refs: [] });
      notifyChanged();
    },
  });
  /**
   * `C16` — `02-F15`'s receipt, on the SAME durable spooler and the SAME pump, for the reasons the
   * cash printer above is: `03-F42` makes a DOCUMENT the unit and not the queue, and a second pump
   * loop would spend `03-F4`'s three-attempt budget in half the window.
   *
   * Constructed here, once, unconditionally — the line above it exists for exactly this reason. A
   * `DocumentSpec` nothing prints is this wave's named defect, and `packages/escpos` has shed it
   * once already (K-7): before this call the `receipt` spec would have been a correct subsystem
   * with no seam to the product, which is the thirteenth instance waiting to be written up.
   *
   * `cashier` is `02-F15`'s own field and it is READ AT PRINT TIME through the same `session()`
   * the envelope's `actor_user_id` is stamped from — `02-F41`, attribution is whoever's PIN is in.
   * A captured value would name whoever unlocked the till first for the rest of the day.
   *
   * It takes NO `append`, and that is a stated gap: `02-F16`'s `receipt.printed` is in the
   * `01 §4` catalog and has no payload schema in `packages/domain`, so `01-F4` makes emitting it a
   * runtime error. See `main/printing.ts`'s `RECEIPT_JOB_PREFIX`.
   */
  const receipts = createReceiptPrinter({
    spooler,
    store,
    catalog: catalogResolver(store),
    capability: kotCapability(),
    pump: kot.pump,
    cashier: () => session()?.display_name ?? null,
  });
  /**
   * `03-F4`'s retry SPACING, which the spooler deliberately does not own ("the BUDGET is
   * enforced here; the SPACING is not enforced anywhere yet" — `RETRY_WINDOW_MS`). Without this
   * interval a queued job sits queued forever: no bytes, no exhaustion, no band — a silent KOT
   * failure produced by an absent timer, which is the shape `03-F5` forbids.
   *
   * `cash.reconcile()` and `receipts.reconcile()` run AFTER the pump and only read job state — it
   * is how a failed slip or a failed receipt gets its band, and without them those documents would
   * queue, fail and say nothing.
   */
  const pumping = setInterval(() => {
    void kot.pump().then(() => {
      cash.reconcile();
      receipts.reconcile();
    });
  }, PUMP_INTERVAL_MS);
  app.on("will-quit", () => clearInterval(pumping));

  /**
   * **`03-F25` SAYS *TIMERS*, AND AN AGE THAT IS NEVER RECOMPUTED IS A CLOCK THAT STOPPED.**
   *
   * `gateway.openOrders()` reads branch time on every call, so the number is correct whenever the
   * renderer asks — but the renderer only asks when main pushes `changed`, and every existing push
   * is a LEDGER event. Without this an order would sit at `9 min` until the next append: exactly
   * the failure `apps/pass-kds`'s uplink names in its own words when it decided to tick.
   *
   * **⚠ IT IS DELIBERATELY NOT IN `sync.ts`, AND MOVING IT THERE WOULD BE A COMMANDMENT-4
   * VIOLATION.** That module's 1 Hz loop is the obvious home and it is the wrong one twice over:
   * it returns early unless the fold cursor MOVED (`if (now === lastSeen) return;`), and
   * `createUplink` returns `offline()` with **no interval at all** when `RESTOS_CLOUD_URL` /
   * `RESTOS_DEVICE_TOKEN` are absent. So an offline-first T1 till — the configuration `03-F25`
   * names, selling its own orders locally — would have aging timers that never advance, and
   * `00 §5.1` says no in-branch feature may require WAN. This interval is therefore
   * unconditional, outside the uplink, and cleared on `will-quit` with its siblings.
   *
   * One second matches `apps/pass-kds` (`03-N4`'s *"< 1 s"* neighbourhood) so the two surfaces
   * roll a minute together. It carries no data — the renderer re-reads, which is the shipped
   * pull-plus-data-free-push shape — and when the cloud IS configured and a fold moves in the same
   * second, `notifyChanged()` simply fires twice into idempotent reads.
   */
  const agingTick = setInterval(notifyChanged, AGE_TICK_MS);
  app.on("will-quit", () => clearInterval(agingTick));

  // One channel, one gateway method, no dispatcher. A generic handler that switched on a
  // channel name would reintroduce exactly the free-form surface `18 §9` bans.
  ipcMain.handle(CHANNELS.deviceState, () => gateway.deviceState());
  ipcMain.handle(CHANNELS.openOrders, () => gateway.openOrders());
  ipcMain.handle(CHANNELS.kitchenQueue, () => gateway.kitchenQueue());
  ipcMain.handle(CHANNELS.menu, (_event, channel: unknown) => gateway.menu(channel));
  // `02-F23`/`02-F37`/`02-F43` — the Cash and Me surfaces' one read, SCOPED to the asking
  // subject (`reportScope`). Never `gateway.cashState()`: that is the unscoped projection, and
  // serving it here would put every cashier's drawer on the untrusted side of `18 §9`'s bridge
  // whatever the renderer then chose to draw.
  ipcMain.handle(CHANNELS.cashState, () => reads.cashState());
  /**
   * `03-F5`/`27-F11d` — the S1 band, and NOT a gateway method.
   *
   * It reads nothing in the ledger: a print failure is a fact about this device's paper, held
   * beside the spooler that produced it. Routing it through `createGateway` would also widen the
   * two-plane surface `gateway.test.ts` pins at exactly seven operations, for a read that is not
   * a fold projection at all.
   *
   * `27-F11g` is why it is here rather than on the pass screen: where paper is the only kitchen
   * channel there is no screen fallback, and the counter is the only human who can react.
   */
  // S-7 + C16: ALL THREE printers' bands, on one channel. `27-F11d` renders the head and counts
  // the tail, so a second channel would give the counter two bands competing for one region — and
  // a cashier whose receipt did not print needs the same surface as one whose KOT did not.
  ipcMain.handle(CHANNELS.alarms, () => [...kot.alarms(), ...cash.alarms(), ...receipts.alarms()]);
  ipcMain.handle(CHANNELS.acknowledgeAlarm, (_event, alarm_id: unknown) => {
    // Type-checked rather than trusted — the renderer is the untrusted end of this bridge
    // (`shared/ipc.ts`), and a non-string here would throw inside the handler on the one surface
    // whose job is to be dismissable.
    if (typeof alarm_id !== "string") return;
    kot.acknowledge(alarm_id);
    // Ids are namespaced (`cash::`, `receipt::`), so exactly one of these three owns any given
    // band; calling all three is how the channel stays one channel without the handler learning
    // the namespace.
    cash.acknowledge(alarm_id);
    receipts.acknowledge(alarm_id);
    // `03-F5`: the alert repeats until acknowledged, so the screen has to be told it stopped.
    notifyChanged();
  });
  /**
   * `01-F61` — the identification grid's roster. **Mapped, not forwarded**: `StaffMember`
   * carries the Argon2id `pin_hash`, and `01-F28` puts verification in this process, so the
   * renderer has no use for a credential and must not be handed one. `01-F54`'s degradation
   * again for a row with no label — an id on a tile is poor, a blank tile reads as broken.
   *
   * The registry's order is passed through untouched (`27-F4`).
   */
  ipcMain.handle(CHANNELS.staff, () =>
    store.staff.list().map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name ?? m.user_id,
      /**
       * `01-F26`'s per-(user, location) assignment, projected for the identification grid.
       *
       * **This branch's assignment, not the first one in the list.** A user may hold different
       * roles at different branches and this till is one branch (`store.identity.branch_id`, and
       * the gateway's own device identity in a real deployment), so taking `[0]` would show a
       * cashier here the manager role she holds somewhere else. `main/authorize.ts` already
       * matches on `branch_id` for exactly this reason when it answers Commandment 8; this is the
       * same match, and the two must not diverge.
       *
       * `null` where she has no assignment at THIS branch — `01-F54` degrades to what is known
       * rather than guessing, and a guessed role is a false claim about a person's authority.
       * It authorizes nothing either way: see `RosterMember`.
       */
      role: m.assignments.find((a) => a.branch_id === store.identity.branch_id)?.role ?? null,
    })),
  );
  /**
   * `C1`/`01-F28` — the one channel that is not a gateway method, because it does not touch the
   * ledger: it moves the session the gateway READS. `01-F1` is why it appends nothing — a PIN
   * in an event is permanent and unredactable.
   *
   * `01-F61`: BOTH arguments are required and the identity is not inferred from the PIN. Each
   * is type-checked here rather than trusted, because `shared/ipc.ts` calls the renderer "the
   * untrusted end of this bridge even though we ship it" — and a non-string reaching
   * `verifyPin` is a throw inside the handler, which `invoke` turns into a rejected promise on
   * a surface whose whole job is to not be stuck.
   *
   * Only the boolean crosses back. The refusal REASON stays here: `bad_pin` versus
   * `unknown_user` tells anyone holding the device which ids exist, and the grid already shows
   * them the roster — but `locked_out` is a real gap and is reported, because a cashier who is
   * locked out is currently told only "that PIN was not accepted" and will keep trying.
   *
   * The push matters as much as the answer: the renderer decides lock state from
   * `deviceState()`, never from the boolean below, so the surface only follows if it is told to
   * re-read. That is also what makes an auto-lock decided anywhere else reach the screen.
   */
  ipcMain.handle(CHANNELS.unlock, async (_event, user_id: unknown, pin: unknown) => {
    if (typeof user_id !== "string" || typeof pin !== "string") return { unlocked: false };
    // Only a SUCCESS moves the session, and `pin-session.ts` owns that — a refused attempt
    // must not end the session that is already in (`01-F17`: a wrong keystroke may not stop
    // the till).
    const result = await pins.unlock(user_id, pin);
    notifyChanged();
    return { unlocked: result.ok };
  });
  /**
   * `01-F26` — what makes the idle auto-lock IDLE. `createPinSession` evaluates the timeout
   * against `last_activity`, and `currentUser()` deliberately does not count as activity
   * ("every POS screen that polls the signed-in user would hold the session open forever"), so
   * without this the clock would run from the moment of unlock and lock a cashier out mid-shift
   * while she was ringing up orders. The two append paths are the device's real activity
   * signal; `deviceState` is a poll and is correctly not one.
   */
  const touch = (): void => pins.touch();

  // C5 — same notify-from-inside-the-handler rule as `append` below, and for the same reason.
  //
  // `writes`, not `gateway`: this is the renderer's channel, so it takes the authorized object
  // (Commandment 8). A refusal throws, `invoke` turns it into a rejected promise, and
  // `Counter.tsx`'s `write` already catches and re-reads — so the screen falls back to what the
  // folds actually hold rather than showing an act that never happened.
  ipcMain.handle(CHANNELS.addLine, (_event, req: unknown) => {
    touch();
    const result = writes.addLine(req);
    notifyChanged();
    return result;
  });
  /**
   * `02-F7` — the 86. `writes`, not `gateway`, for the reason directly above: this is a
   * renderer-originated append and Commandment 8 puts the matrix on the trusted side.
   *
   * `notifyChanged()` is what makes `01-F15`'s fast path visible ON THIS DEVICE — every open
   * surface re-reads, so the grid greys under the cashier's hand rather than at the next poll.
   * Propagation to OTHER devices is the sync layer's and needs nothing here: the append is an
   * ordinary ledger event and rides the same outbox as every other.
   */
  ipcMain.handle(CHANNELS.toggleAvailability, (_event, req: unknown) => {
    touch();
    const result = writes.toggleAvailability(req);
    notifyChanged();
    return result;
  });
  /**
   * `02-F27`/`02-F28` — the caller's file.
   *
   * `gateway`, not `reads`: this is an unscoped READ like `openOrders` and `menu` beside it, and
   * `authorizeReads` narrows exactly one seam because exactly one FR asks for a narrowing
   * (`02-F23`'s "cashiers see only their own shifts"). No FR scopes the customer file below the
   * org, and `01-F24` already scopes it to the org absolutely — which the device store enforces by
   * holding one org's events and nothing else. **Named rather than assumed**: if a later FR gives
   * customer data a per-role reach, this is the line that has to change, and it must change here
   * rather than in the renderer (Commandment 8).
   *
   * No `touch()` and no `notifyChanged()`. `01-F26`'s idle timer is fed by the two APPEND paths
   * because those are the device's real activity signal, and this appends nothing — a lookup that
   * reset the lock clock would let a screen left mid-number hold a session open indefinitely.
   */
  ipcMain.handle(CHANNELS.lookupCustomer, (_event, dialled: unknown) =>
    gateway.lookupCustomer(dialled),
  );
  /**
   * `02-F27`'s inline creation. `writes`, not `gateway`, for `addLine`'s and
   * `toggleAvailability`'s reason above: this is a renderer-originated append and Commandment 8
   * puts the matrix on the trusted side (`02-F47` is the row that lets it answer at all).
   *
   * `notifyChanged()` because the fold moved and the phone surface is reading it — the caller she
   * just filed becomes a KNOWN caller under her hand rather than at the next poll.
   */
  ipcMain.handle(CHANNELS.recordCustomer, (_event, req: unknown) => {
    touch();
    const result = writes.recordCustomer(req);
    notifyChanged();
    return result;
  });
  ipcMain.handle(CHANNELS.append, (_event, req: unknown) => {
    touch();
    const result = writes.append(req);
    // `C9`/`03-F2` — THE KITCHEN HANDOFF. The confirm is already in the ledger by the line
    // above, and only then does paper get involved: `01-F17` says a sale is never blocked by a
    // printer, so the print hangs off a completed append rather than gating one. `confirmed()`
    // is synchronous and `void`, so there is nothing here to await even by accident.
    //
    // Re-parsed rather than read raw: `req` is `unknown` from an untrusted renderer, and
    // `gateway.append` does not hand back what it parsed. It has already thrown on anything
    // malformed, so `safeParse` here is a narrowing, not a second validation.
    const confirm = AppendRequestSchema.safeParse(req);
    if (confirm.success && confirm.data.type === "order.confirmed") {
      const order_id = confirm.data.payload.order_id;
      if (typeof order_id === "string") {
        // `01 §4`'s first transition — `placed → confirmed` — and it is the PRECONDITION for
        // `02-F31`'s auto-advance rather than part of it: `LEGAL_NEXT.placed` excludes `in_prep`,
        // so without this edge the KOT advance below can never fire and lines stay at `placed`
        // for ever (which is what they have done). It is deliberately NOT tier-gated — the device
        // that signals a confirm is this one, on every tier — and that reading is an
        // INTERPRETATION stated in full on `LineAdvance.confirmed`. Before the print, because the
        // print's own advance reads the state this one writes.
        lines.confirmed(order_id);
        kot.confirmed(order_id);
        // `02-F30`/`08-F8`/`08-F17` — **THE AGGREGATOR SEAM.** *"manual quick-entry orders are
        // confirmed by the act of entry"*, and an aggregator order *"settles at creation/entry"*
        // with `01-F32`'s receivable — so the confirm IS the entry act and this is where the money
        // side closes without a cashier. AFTER the kitchen handoff, deliberately: `01-F17` and
        // `02-F30`'s *"behave identically downstream: KOT print…"* both put the food first, and
        // nothing about the money may sit between a confirm and its ticket.
        //
        // The channel test, the bill, the `02-F37` shift resolution and `01-F31`'s no-double-record
        // guard all live inside the emitter's own method, where a suite can drive the real branch —
        // never here, where a test could only hand-copy them (`K-3`'s dead-oracle defect, which
        // this file has already paid for once).
        //
        // ⚠ **DO NOT WRITE THE BINDING NAME FOLLOWED BY A DOT ANYWHERE IN THIS COMMENT.** The only
        // guard on this seam is a SOURCE READ — `main/index.ts` builds an Electron app at module
        // scope and no suite in this package can import it — and it searches this block for
        // `<binding>.`. The first draft of this comment wrote the call's own name in prose, and the
        // mutant that DELETES the line below was measured **surviving at 678/678**: the assertion
        // matched the sentence instead. Same shape as `hardware-tier.ts`'s header quoting a literal
        // `seams:check` marker, with the sign flipped — there prose reddened a rail, here it
        // silenced one. Write the meaning, never the token.
        aggregator.confirmed(order_id);
      }
    }
    // S-7 — THE SAME HANDOFF FOR THE TWO CASH DOCUMENTS, and it hangs off the same completed
    // append for the same reason: `02-F23`'s slip carries facts the fold projects off
    // `shift.closed`, so the event has to be IN before the paper can be assembled, and `01-F17`
    // says a close is never blocked by a printer. Both calls are synchronous and `void`.
    if (confirm.success && confirm.data.type === "shift.closed") {
      const shift_id = confirm.data.payload.shift_id;
      if (typeof shift_id === "string") cash.shiftClosed(shift_id);
    }
    if (confirm.success && confirm.data.type === "day.closed") {
      const day_id = confirm.data.payload.day_id;
      if (typeof day_id === "string") cash.dayClosed(day_id);
    }
    // `C16` — THE CUSTOMER'S COPY, and it hangs off the same completed append for the same reason
    // as the three above: `02-F15`'s receipt carries `01-F30`'s billed total and `01-F31`'s keyed
    // tender sums, both projected from THIS event, so the payment has to be IN before the paper
    // can be assembled — and `01-F17` says a sale is never blocked by a printer. `settled()` reads
    // the fold and returns without printing unless the order is now tendered for in full, which is
    // what makes a `02-F13` split print one receipt rather than one per tender.
    if (confirm.success && confirm.data.type === "payment.recorded") {
      const order_id = confirm.data.payload.order_id;
      if (typeof order_id === "string") {
        receipts.settled(order_id);
        // `02-F31` — **THE SETTLEMENT SEAM**: *"settlement → lines `served` —
        // dine-in/takeaway/pickup only"*. Blocked in the kernel until `DEC-HW-002` ruled
        // `LEGAL_NEXT.in_prep` gains `served`; the whole argument is in `line-advance.ts`.
        //
        // It hangs off the completed append for the same reason the three handoffs above do
        // (`01-F17` — the money is already in the ledger and a customer may not be held at the
        // counter), and it reads the SAME narrowing the receipt does rather than adding a second
        // one: two definitions of "a payment landed" on one event is the `02-F45` shape.
        //
        // The tier gate, the delivery exclusion and the tendered-in-full test all live inside
        // `lines.settled` where a suite can drive the real branch — never here, where a test could
        // only hand-copy it. That is `K-3`'s dead-oracle defect, and this file has already paid
        // for it once (mutant M10 of the producer round was killed by a source string alone).
        lines.settled(order_id);
      }
    }
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

  /**
   * `02-F20` — "would a manager credential close this?", answered off the matrix for DISPLAY —
   * **and, since August 2026, `05-F28`'s missing producer.**
   *
   * ⚠ **This handler used to say "nothing is appended" and that is no longer true.** Raising the
   * pad now announces `approval.requested` (`05-F7`), because `05 §4` has the manager's queue show
   * a PENDING item and `05-F6`'s decision must reference a request that already exists — nothing
   * anywhere in the product emitted one, under any of `05-F28`'s three resolutions.
   *
   * What is unchanged is the authorization story, and it is the reason this may append at all: the
   * verdict is still the matrix's, the escalated write is still refused by `writes.append` above,
   * and `escalate` below re-decides everything from scratch. A renderer that ignored or forged
   * this answer still gains nothing (Commandment 8). What it CAN now do is announce a request the
   * matrix agrees is escalatable — `01-F36` scopes the duplicate case (one act, one request, until
   * it resolves), and an act the matrix does not escalate announces nothing at all.
   */
  ipcMain.handle(CHANNELS.escalationFor, (_event, req: unknown) => approvalRecord.raise(req));
  /**
   * `02-F20`'s local path. The SECOND channel that carries a credential, and the last: it takes
   * `unlock`'s (`user_id`, `pin`) pair in that order because it is the same credential and the
   * same `01-F61` counter behind it.
   *
   * Type-checked rather than trusted, like every other handler here — the renderer is the
   * untrusted end of this bridge (`shared/ipc.ts`), and a non-string reaching Argon2id is a throw
   * inside the handler on a surface an operator cannot get out of.
   *
   * `touch()` is deliberately NOT called for the approver: `01-F26`'s idle timer belongs to the
   * signed-in cashier's session, and a manager's PIN is not the cashier working. The append that
   * follows is hers, so the timer is refreshed on the requester's own act below.
   */
  ipcMain.handle(
    CHANNELS.escalate,
    async (_event, req: unknown, approver_user_id: unknown, pin: unknown) => {
      if (typeof approver_user_id !== "string" || typeof pin !== "string") {
        return { ok: false, refused: "bad_pin" };
      }
      // `approvalRecord`, never `escalation`: the approval is the same act it always was, and the
      // grant that records WHO decided it rides on this call and on nothing else.
      const result = await approvalRecord.approve(req, approver_user_id, pin);
      // The refused case moves nothing, but the screen re-reads either way: a refusal it did not
      // see would leave the pad over a counter whose folds may have moved underneath it.
      if (result.ok) touch();
      notifyChanged();
      return result;
    },
  );

  /**
   * `05-F6`'s other half, on the same credential and the same `01-F61` counter.
   *
   * The reason is the fourth argument because `approval.denied.reason` is required and `05 §4`
   * reads it back at the counter. `touch()` is NOT called on a denial: the requester's act did not
   * happen, so there is nothing of hers to refresh `01-F26`'s idle timer against — the manager's
   * PIN is not the cashier working, which is the same reasoning the grant applies to the approver.
   */
  ipcMain.handle(
    CHANNELS.denyEscalation,
    async (
      _event,
      req: unknown,
      approver_user_id: unknown,
      pin: unknown,
      reason: unknown,
    ): Promise<EscalationResult> => {
      if (typeof approver_user_id !== "string" || typeof pin !== "string") {
        return { ok: false, refused: "bad_pin" };
      }
      if (typeof reason !== "string") return { ok: false, refused: "no_reason" };
      const result = await approvalRecord.deny(req, approver_user_id, pin, reason);
      notifyChanged();
      return result;
    },
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) load(createWindow());
  });
}, fatal);

// Windows is the counter platform (`18 §9`), where closing the last window means quitting.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

export { DEV_IDENTITY };
