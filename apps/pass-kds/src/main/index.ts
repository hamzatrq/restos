import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { businessDate } from "@restos/domain";
import { openStore, wallClock } from "@restos/sync-client";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import {
  DEV_IDENTITY,
  describeDeviceIdentity,
  resolveDeviceIdentity,
} from "../../../pos-electron/src/main/device-identity";
import {
  describePanelDensity,
  measurePhysicalWidthMm,
  resolvePanelDensity,
} from "../../../pos-electron/src/main/panel-density";
import {
  CHANNELS,
  MarkReadyRequestSchema,
  type MarkReadyResult,
  type PassStateWire,
  PassTicketSchema,
} from "../shared/ipc";
import { describeCapacity } from "../shared/ticket-capacity";
import { AGING_THRESHOLDS_ENV, describeAging, resolveAging } from "./aging";
import { passQueue } from "./pass-queue";
import { createReadyMark } from "./ready-mark";
import { describeReadySignal, READY_SIGNAL_OWNER_ENV, resolveReadySignal } from "./ready-signal";
import { createPassUplink } from "./uplink";
import { passWindowOptions } from "./window-options";

/**
 * # `apps/pass-kds` — the T2 pass screen (`03-F13`..`03-F17`, `03-F24`, `03-F46`, `03-F47`)
 *
 * `18 §9`'s process split: this process owns SQLite and `sync-client`; the renderer has no Node
 * access and reaches exactly the four members of `shared/ipc.ts`'s bridge.
 *
 * ## ⚠ TWO MODULES ARE IMPORTED ACROSS THE APP BOUNDARY, AND IT IS DELIBERATE
 *
 * `device-identity.ts` and `panel-density.ts` come from `apps/pos-electron/src/main/`. Both are
 * **pure `00 §7` resolvers** — they read an environment record and a display fact and return a
 * value with its source — and neither touches Electron, a store or a screen.
 *
 * Copying them was the obvious alternative and is refused on this repo's own precedent: two
 * interpretations of one rule diverge, and then the counter and the pass screen disagree about
 * what `RESTOS_PANEL_PPI` means or about whether a padded `RESTOS_DEVICE_ID` refuses. `turbo.json`
 * records the same argument for the ESC/POS byte→page walk (*"two interpretations of one command
 * set is the defect the shared module exists to prevent"*), and `03-F40`'s two incompatible sensor
 * bit layouts is the corpus's own instance of what it costs.
 *
 * **What it costs, stated:** this app's build now depends on two files in a package it does not
 * declare a dependency on. The honest fix is to move both into a shared module — most likely
 * `packages/ui` for the density (it is the consumer of `27-F68`) and a new host-support module for
 * the identity — and that is a cross-app refactor with `apps/pos-electron`'s suites in its blast
 * radius, which is scheduled consolidation work rather than a drive-by (`24 §3b`). **OWED.**
 *
 * ## `02-F19` AND THE THING THIS APP DOES NOT HAVE
 *
 * **There is no `01-F26` PIN session here.** `03-F16` says a ready-mark carries *"actor"*, and the
 * envelope's `actor_user_id` will be `null` on every edge this app writes, because nothing
 * identifies the person standing at the pass. That is the single largest gap in this app and it is
 * named in `ready-signal.ts`, in `CLAUDE.md` and on the boot line rather than left to be
 * discovered from a ledger six weeks later.
 *
 * It is not closed here because closing it properly is the counter's whole `S-0b`/`S-0c` ladder —
 * a roster, `createPinSession`, `01-F61`'s durable per-(device,user) lockout, an unlock surface —
 * and a cook wearing gloves keying a PIN before every bump is a design question (`27-F5`,
 * `27-F9`), not an implementation one. **The event is still attributed to the DEVICE and the
 * BRANCH**, which is more than a paper kitchen records, and `01-F1` means nothing has to be
 * unwound when identity lands.
 */

const require_ = createRequire(import.meta.url);
const HERE = fileURLToPath(new URL(".", import.meta.url));

/**
 * The Electron-ABI addon, built by `pnpm -C apps/pos-electron rebuild:native`. One checkout serves
 * two V8 ABIs and `bindings` resolves `build/Release/` first, so the path is named rather than
 * discovered — `build/Release/` stays Node's, and every test suite in the monorepo keeps working.
 * See `apps/pos-electron/CLAUDE.md` for the whole argument; the rebuild is shared because the
 * module is one physical copy under pnpm.
 */
const electronAddonPath = (): string =>
  join(
    require_.resolve("better-sqlite3/package.json"),
    "..",
    "bin",
    `${process.platform}-${process.arch}-${process.versions.modules}`,
    "better-sqlite3.node",
  );

/**
 * `02-F19` — attribution is never anonymous, and this is the honest stand-in until a PIN session
 * exists here. It names the SURFACE rather than a person, exactly as `01-F27` has the counter's
 * locked strip name the device rather than a stand-in human: a plausible name would be a lie a
 * cook could read as somebody's shift.
 */
const PASS_ACTOR = "Pass — nobody signed in";

const boot = async (): Promise<void> => {
  const env = process.env;
  const identity = resolveDeviceIdentity(env);
  const aging = resolveAging(env[AGING_THRESHOLDS_ENV]);
  const readySignal = resolveReadySignal(env[READY_SIGNAL_OWNER_ENV]);

  const store = openStore({
    path: join(app.getPath("userData"), "device.db"),
    identity,
    nativeBinding: electronAddonPath(),
  });

  const display = screen.getPrimaryDisplay();
  const density = resolvePanelDensity({
    display: {
      widthPx: display.size.width * display.scaleFactor,
      heightPx: display.size.height * display.scaleFactor,
    },
    configured: env["RESTOS_PANEL_PPI"],
    physicalWidthMm: measurePhysicalWidthMm(process.platform, (command, args) => {
      try {
        // Deliberately narrow: `panel-density.ts` owns which commands are run and how their
        // output is parsed. This supplies only the running of them.
        const { execFileSync } = require_(
          "node:child_process",
        ) as typeof import("node:child_process");
        return execFileSync(command, [...args], { encoding: "utf8", timeout: 2000 });
      } catch {
        return null;
      }
    }),
  });

  const glassHeightMm = (display.workAreaSize.height / (density.ppi / display.scaleFactor)) * 25.4;

  let window: BrowserWindow | null = null;
  const notifyChanged = (): void => {
    if (window !== null && !window.isDestroyed()) window.webContents.send(CHANNELS.changed);
  };

  const uplink = createPassUplink({
    store,
    url: env["RESTOS_CLOUD_URL"],
    token: env["RESTOS_DEVICE_TOKEN"],
    onChanged: notifyChanged,
  });

  /**
   * `03-F16`'s producer, wired here. **This is the seam** — the thing `AGENTS.md`'s recurring
   * defect is about — and `__acceptance__/pass-seam.test.ts` is the hand-written assertion that
   * it exists, because no rail in this repo can express *"the host calls the emitter"*.
   */
  const readyMark = createReadyMark({
    store,
    policy: () => readySignal,
    append: (type, payload) => {
      store.append({
        id: crypto.randomUUID(),
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        // `03-F16` says "with actor" and this app has no PIN session — see the module header.
        // `null` is the honest value; a device id in an actor field would be a lie in a column
        // `01-F1` will not let anyone correct.
        actor_user_id: null,
        device_created_at: wallClock.now(),
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
      notifyChanged();
    },
  });

  const passState = (): PassStateWire => ({
    deviceLabel: "Pass",
    actor: PASS_ACTOR,
    businessDay: businessDate(wallClock.now() + store.branchTimeStatus().offset_ms),
    ...uplink.reachability(),
    panelPpi: density.ppi,
    // `00 §5.7` — `panel-density.ts` cannot make its own fallback safe, so the consequence is made
    // visible. There is no `too_small` here: see `window-options.ts` for why a paged queue has no
    // physical floor and the counter does.
    panelFit:
      density.source === "assumed"
        ? {
            reason: "unmeasured",
            glass: "not measured",
            message:
              "this screen could not read its own size from the operating system, so the ticket " +
              "capacity below and every touch target on it are drawn from an assumption — " +
              "27 §1a's 15.6\" counter panel. Set panel_ppi for this device to correct it.",
          }
        : null,
    maySignal: readySignal.maySignal,
    readySignalOwner: readySignal.owner,
  });

  ipcMain.handle(CHANNELS.passState, () => passState());
  ipcMain.handle(CHANNELS.queue, () =>
    passQueue({
      store,
      // `03-F38` — the short kitchen name where the catalog carries one, else the display name,
      // else `01-F54`'s degrade-to-identifier. A cook loses a word and never a ticket.
      name: (item_id) => {
        // `lookup` and not `list`: it returns TOMBSTONED entries too (`01-F55`), which is exactly
        // what a kitchen needs — an item deleted from the menu while its ticket is still on the
        // pass must keep its name, or the cook loses the word for food that is already cooking.
        const entry = store.catalog.lookup("item", item_id);
        return entry?.kitchen_name ?? entry?.name ?? item_id;
      },
      aging,
      // Standing law 2 — branch-consensus time, never this device's raw clock. `03-F14`'s
      // durations need a CONSISTENT clock and not a correct one, so a pass screen an hour out
      // still ages every ticket identically and still orders them exactly right.
      now: () => wallClock.now() + store.branchTimeStatus().offset_ms,
    }).map((t) => PassTicketSchema.parse(t)),
  );
  ipcMain.handle(CHANNELS.markReady, (_event, req: unknown): MarkReadyResult => {
    const parsed = MarkReadyRequestSchema.parse(req);
    return readyMark.mark(parsed.order_id, parsed.line_ids);
  });

  await app.whenReady();

  /**
   * `00 §5.7` — the boot line, and every clause of it is a fact whose being wrong is invisible
   * from the screen. That is the property that decides what goes in one: an operator cannot see
   * that the ready signal is assigned elsewhere, that the aging thresholds were refused, that this
   * device shares the counter's seed identity, or that the LAN path the corpus specifies does not
   * exist. Each of those looks exactly like working.
   */
  process.stdout.write(
    [
      "RestOS pass screen (03-F13 · apps/pass-kds)",
      `  ${describeDeviceIdentity(identity, env)}`,
      identity.device_id === DEV_IDENTITY.device_id
        ? "  ⚠ THIS IS THE COUNTER'S DEV-SEED device_id. Two devices sharing one id fork one " +
          "outbox (01-F8) and the gateway keys ingest per origin — set RESTOS_DEVICE_ID to the " +
          "value you passed to `provision-device --class kitchen`."
        : "",
      `  ${describePanelDensity(density)}`,
      `  ${describeCapacity(glassHeightMm)}`,
      `  ${describeAging(aging)}`,
      `  ${describeReadySignal(readySignal)}`,
      env["RESTOS_CLOUD_URL"] === undefined
        ? "  uplink: OFFLINE (RESTOS_CLOUD_URL unset). This screen will show an EMPTY queue " +
          "forever: the counter's orders reach it over the cloud gateway and nothing else. " +
          "01-F13/01-F15 put that traffic on the LAN mesh, which is Wave-0 work that is BUILT " +
          "and hosted by nothing (sync-client/mesh-session.ts) — so today a pass screen needs " +
          "WAN, which 00 §5.1 says an in-branch feature must not. Named, not worked around."
        : `  uplink: cloud ${env["RESTOS_CLOUD_URL"]} — and note it is the ONLY path: the LAN ` +
          "mesh 01-F15 specifies for this traffic is hosted by nothing, so a WAN outage stops " +
          "this screen learning about new orders while the counter goes on selling (01-F17).",
      "  identity: NO PIN SESSION on this device — 03-F16's ready-mark is attributed to the " +
        "device and the branch, and actor_user_id is null on every edge it writes. Owed.",
    ]
      .filter((line) => line !== "")
      .join("\n") + "\n",
  );

  window = new BrowserWindow({
    ...passWindowOptions({ workArea: display.workAreaSize }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(HERE, "../preload/index.cjs"),
    },
  });
  await window.loadFile(join(HERE, "../renderer/index.html"));

  app.on("window-all-closed", () => {
    uplink.stop();
    store.close();
    app.quit();
  });
};

void boot();
