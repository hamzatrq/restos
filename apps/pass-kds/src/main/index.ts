import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGING_THRESHOLDS_ENV,
  DEV_IDENTITY,
  describeAging,
  describeDeviceIdentity,
  describeDevStaff,
  describeLanMesh,
  describePanelDensity,
  describeServeSignal,
  measurePhysicalWidthMm,
  requireDeviceIdentity,
  resolveAging,
  resolveLanMesh,
  resolvePanelDensity,
  resolveServeSignal,
  SERVE_SIGNAL_OWNER_ENV,
  seedDevStaff,
} from "@restos/device-config";
import { businessDate } from "@restos/domain";
import { createPinAuditSink, openStore, wallClock } from "@restos/sync-client";
// No `dialog`: `01-F67` (iii) took the modal off the refusal path, and it was this host's only
// caller. A blocking box on an unattended kitchen screen is the defect, not the delivery.
import { app, BrowserWindow, ipcMain, screen } from "electron";
import {
  CHANNELS,
  HandOverRequestSchema,
  type HandOverResult,
  MarkReadyRequestSchema,
  type MarkReadyResult,
  type PassRosterMemberWire,
  type PassStateWire,
  PassTicketSchema,
  type PassUnlockResultWire,
} from "../shared/ipc";
import { describeCapacity } from "../shared/ticket-capacity";
import { createLanMesh } from "./mesh";
import { createPassIdentity } from "./pass-identity";
import { passQueue } from "./pass-queue";
import { createReadyMark } from "./ready-mark";
import { describeReadySignal, READY_SIGNAL_OWNER_ENV, resolveReadySignal } from "./ready-signal";
import { createServeMark, HANDOVER_SURFACE } from "./serve-mark";
import { createPassUplink } from "./uplink";
import { passWindowOptions } from "./window-options";

/**
 * # `apps/pass-kds` — the T2 pass screen (`03-F13`..`03-F17`, `03-F24`, `03-F46`, `03-F47`)
 *
 * `18 §9`'s process split: this process owns SQLite and `sync-client`; the renderer has no Node
 * access and reaches exactly the four members of `shared/ipc.ts`'s bridge.
 *
 * ## THE THREE SHARED RESOLVERS ARE `@restos/device-config` NOW — THE APP→APP EDGE IS GONE
 *
 * `resolveDeviceIdentity`, `resolvePanelDensity` and `resolveAging` used to be imported across the
 * app boundary — the first two out of `apps/pos-electron/src/main/`, and `aging.ts` out of THIS
 * directory into the counter, which made the two apps a cycle. `18 §2` states the dependency
 * direction as a MUST (*"Apps NEVER import ... other apps"*) and `DEC-ARCH-001` rules EXTRACT at
 * the moment a module acquires its second consumer, so all three moved into a package and this is
 * now an ordinary `apps → packages` edge.
 *
 * Copying was the alternative and stays refused for the reason recorded there: two interpretations
 * of one rule diverge, and then the counter and the pass screen disagree about what
 * `RESTOS_PANEL_PPI` means, about whether a padded `RESTOS_DEVICE_ID` refuses, or — worst —
 * about whether the food is late (`05-F1` alarms the manager off `03-F14`'s red threshold, so
 * that one is three surfaces disagreeing, not two).
 *
 * ## `02-F19` / `03-F53` — WHO IS AT THE PASS, AND WHERE THE GATE IS
 *
 * **`01-F26`'s PIN session runs here** (`main/pass-identity.ts`), and every state edge this app
 * writes carries the signed-in user. That closes `03-F52`'s OWED (1): the handover is TERMINAL
 * (`01-F35`) and `01-F1` makes it permanent, so what this app emitted before was an unattributable
 * permanent claim that food reached a customer.
 *
 * **The gate is on the ACT and never on the QUEUE, and that is where this device parts company
 * with the till.** `02-F18`'s *"a locked device shows only the unlock screen"* is doc 02's rule for
 * the device that holds the drawer. This surface shows no money (`03-F32`) and no ETA (`03 §3`),
 * and its whole purpose is to be READ — so gating it would turn a roster this device has not yet
 * synced into a kitchen that cannot see its own tickets (`01-F17`, commandment 4). A press with
 * nobody signed in raises `01-F61`'s two steps; the queue stays on the glass throughout.
 *
 * **The refusal is the EMITTER's, not this host's.** `ready-mark.ts` and `serve-mark.ts` each read
 * the session once and that one read decides both whether the act happens and whose name is on the
 * envelope. A gate here would be a gate no suite can drive (nothing in this file is importable —
 * it pulls `electron` at module scope) and two reads of one fact (`02-F45`).
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
 * `02-F19` / `01-F27` — what the strip says while nobody is signed in.
 *
 * It is a STATEMENT and never a name: a device identity may not stand in for a user identity, so a
 * plausible human word here would be a lie a cook could read as somebody's shift, and `StatusStrip`
 * already renders the device beside it (`deviceLabel`). WHO is signed in is `PassStateWire.user`,
 * fed by the PIN session (`03-F53`); this is the honest fallback when that is `null`, and it is
 * decided here rather than in the renderer because `00 §5.7`'s claims are main's to make.
 *
 * ⚠ It was `"Pass — nobody signed in"` until `03-F53` and the strip then read *"Pass — nobody
 * signed in · Pass"*, which is the device named twice. Found by LOOKING at a screenshot; no suite
 * could have, because a renderer test can only ask whether a string is in the document.
 */
const PASS_ACTOR = "Nobody signed in";

/**
 * `01-F26` — idle auto-lock is a **device-layer setting** (`00 §7` layer 3), and that config plane
 * does not exist yet, so this is a pinned interpretation and marked as one rather than left to
 * read as a spec fact. Ten minutes, matching `apps/pos-electron`: two devices in one branch
 * disagreeing about how long a session lives is a difference an operator would meet as a bug.
 *
 * `03-F53` fixes no timeout VALUE and fixes what FEEDS it: every edge this app writes, and no read.
 */
const IDLE_LOCK_MS = 10 * 60_000;

/**
 * `01-F61` — *"N consecutive failures tolerated; the (N+1)th attempt is refused"*. The FR fixes the
 * scope, the persistence and the cooldown and names no N, so this is pinned too. Five, matching the
 * counter, for the counter's stated reason: room for ordinary typing on a surface used all service
 * — with gloves and wet hands here — while keeping online guessing at ~13 bits hopeless against
 * the five-minute cooldown.
 */
const MAX_FAILED_ATTEMPTS = 5;

const boot = async (): Promise<void> => {
  /**
   * ⚠ **FIRST, AND IT WAS NOT — THIS APP COULD NOT START AT ALL UNTIL AUGUST 2026.**
   *
   * `screen.getPrimaryDisplay()` below throws *"The 'screen' module can't be used before the app
   * 'ready' event"*, and this `await` used to sit ~150 lines further down, just above the
   * `BrowserWindow`. `void boot()` runs at module load, so every launch of this binary died in an
   * unhandled promise rejection before a store was opened or a window existed: **no queue, no boot
   * line, no error dialog — an Electron app that exits silently.**
   *
   * Nothing could see it. All 136 tests in this app import modules and never the entry point;
   * `pnpm layout:check` runs `out/main/layout-gate.js`, a DIFFERENT entry that builds its own
   * window; and `pnpm verify` never launches this app. It is `AGENTS.md`'s second recurring defect
   * in its purest form — a correct component that is not on the screen — and it was found by
   * launching the thing, which is the only thing that finds it.
   *
   * `app.whenReady()` is idempotent, so the cost of it being first is nothing.
   *
   * `__acceptance__/pass-seam.test.ts` §A2 is the source-order assertion that holds it. BOTH
   * parallel tracks that touched this file found this defect, independently, the same way:
   * by launching the binary. Two discoveries of one silent exit is the strongest argument in
   * this repo for that habit.
   */
  await app.whenReady();
  const env = process.env;
  /**
   * `01-F65` — **`require`, not `resolve`: this host may not guess which device it is.**
   *
   * `resolveDeviceIdentity` falls back per key to `DEV_IDENTITY`, which is `apps/pos-electron`'s
   * own dev seed and its documented no-environment launch. Falling back HERE does not produce an
   * unconfigured pass screen; it produces **the counter**, and two devices under one origin
   * interleave one lamport sequence into one outbox (`01-F3`/`01-F8`) in a log `01-F1` cannot
   * unwind. The seed stays reachable where it belongs and is unreachable from here by NAME, not
   * by an argument a later edit could drop.
   */
  const identity = requireDeviceIdentity(env);
  const aging = resolveAging(env[AGING_THRESHOLDS_ENV]);
  const readySignal = resolveReadySignal(env[READY_SIGNAL_OWNER_ENV]);
  /**
   * `03-F52`'s layer-2 assignment — **the same declaration `apps/pos-electron` reads**, out of
   * `@restos/device-config` rather than out of a copy here. Two surfaces each carrying their own
   * default is how a pass screen and a till come to disagree about who owns handover with every
   * gate green, which is the failure `01-F60`'s enabled-set drift already cost this product once.
   *
   * `roster: null` is every host today and is passed explicitly rather than defaulted: `01-F62`
   * keeps `device.registered` out of every branch stream, so `02-F31`'s detection rule cannot run
   * on a device. The boot line reports the assumption rather than dressing it as configuration.
   */
  const serveSignal = resolveServeSignal({
    roster: null,
    configured: env[SERVE_SIGNAL_OWNER_ENV],
  });

  const store = openStore({
    path: join(app.getPath("userData"), "device.db"),
    identity,
    nativeBinding: electronAddonPath(),
  });

  /**
   * `03-F53` OWED (3) — **nothing populates `store.staff` on any device**: `01-F47`'s admission
   * admits *devices, not people*, and the staff transport (`01-F21`/`01-F28`) is owed. So this app
   * seeds the roster the counter seeds, out of `@restos/device-config` — **one declaration read by
   * both apps** (`DEC-ARCH-001`), because two rosters is a till and a pass screen that disagree
   * about who is on shift in a ledger `01-F1` cannot correct.
   *
   * Before the window, so the first paint of the identification grid already has a roster to draw:
   * a grid that fills in a moment later would move tiles under a finger (`27-F4`). A member whose
   * key is unset ⇒ that member is not seeded, and with none of them set the door SAYS the registry
   * is empty rather than drawing an empty grid (`00 §5.7`, `03-F53`).
   *
   * **The whole ENVIRONMENT, never one resolved PIN (`01-F28`).** The package reads one key per
   * member out of `DEV_STAFF_PIN_ENV`. This screen authorizes nothing itself (`03-F53`: *"signing
   * in at the pass grants no authority; it supplies attribution"*), but it seeds the SAME registry
   * the counter authorizes against — so a shared secret here is the counter's `02-F22` hole,
   * written from the kitchen.
   */
  await seedDevStaff({
    registry: store.staff,
    branch_id: store.identity.branch_id,
    env,
  });

  /**
   * `01-F26`'s PIN session — **the verifier, not a comparison.** `createPassIdentity` hands
   * `createPinSession` the synced registry (`01-F28`), the device's own id (`01-F27`'s other axis)
   * and the DURABLE per-(device, user) counter (`01-F61`); everything about the argument lives in
   * `pass-identity.ts` because nothing declared in this file is reachable from a suite.
   *
   * ONE session, and the counter's second one is not a pattern to copy here: `02-F20`'s approval
   * needs an actor and an approver in the same instant, this surface has one act-class and no
   * approval, and a second session would manufacture the *"acting for"* concept `02-F41` refused.
   */
  const pins = createPassIdentity({
    store,
    idle_lock_ms: IDLE_LOCK_MS,
    max_failed_attempts: MAX_FAILED_ATTEMPTS,
    now: () => wallClock.now(),
    /**
     * `01-F5`'s `audit.login`, on a store-owned chain. **A real sink and never an empty one** —
     * that is instance 4 of `AGENTS.md`'s recurring defect by name: the sink was wired and tested
     * in `sync-client` while the counter's host passed an empty function for a day, during which an
     * unlock, a wrong PIN and a lockout left no trail at all. `seams:check` cannot see a port
     * supplied with a stub, so `pass-identity-seam.test.ts` §A carries the hand-written assertion.
     */
    audit: createPinAuditSink({ store, now: () => wallClock.now() }),
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
  const notifyRenderer = (): void => {
    if (window !== null && !window.isDestroyed()) window.webContents.send(CHANNELS.changed);
  };

  /**
   * **`01-F12`/`01-F13`/`01-F15` — the branch LAN mesh, and the reason this app's own header used
   * to name the cloud as the single route by which orders could ever arrive.**
   *
   * The counter appends the orders (`03-F13`) and the corpus puts that traffic on the branch LAN,
   * not the WAN. Until this line the mesh was built, property-tested and constructed by nothing, so
   * the internet dropping stopped this screen learning about new orders while the till went on
   * selling — `00 §5.1` and commandment 4 broken in effect. See `mesh.ts`.
   *
   * It is built BEFORE the uplink and unconditionally, on purpose: nothing about the LAN may be
   * conditional on a WAN endpoint being configured, which is the inversion commandment 4 forbids.
   */
  const lan = resolveLanMesh(env);
  const mesh = createLanMesh({ store, lan, onChanged: notifyRenderer });

  /**
   * `01-F15`'s fast path, as one funnel. Every append path in this file already calls
   * `notifyChanged`, so the mesh learns about a ready-mark or a handover at the instant it is
   * durable rather than on `mesh-session.ts`'s 2 s window re-fan (measured: 1519 ms for one event).
   */
  const notifyChanged = (): void => {
    mesh.notifyAppended();
    notifyRenderer();
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
   *
   * `actor` is the SESSION as a getter (`03-F53`, `02-F41`): read at the act, never captured, so a
   * shift change moves attribution with it. The append writes back the actor the **emitter**
   * resolved and never re-reads the session — one read of one fact decides both whether the act
   * happens and whose name is on it (`02-F45`), so the two cannot disagree.
   */
  const readyMark = createReadyMark({
    store,
    policy: () => readySignal,
    actor: () => pins.currentUser(),
    append: (type, payload, actor_user_id) => {
      store.append({
        id: crypto.randomUUID(),
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        // `03-F16`'s *"with actor"*, met: whoever's PIN is in (`02-F41`). Typed non-nullable at
        // the emitter, so an unattributed edge is unrepresentable on this path.
        actor_user_id,
        device_created_at: wallClock.now(),
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
      notifyChanged();
    },
  });

  /**
   * `03-F52`'s producer, wired here — **and this is the seam the FR was written to close.**
   *
   * `order.line_state_changed → served` had exactly one producer in the product and it was
   * tier-gated away from every branch with a pass screen, so a fully-bumped ticket never satisfied
   * `03-F17` and this queue was a one-way accumulator. `seams:check` cannot see that shape (a key
   * in an object literal is neither an export nor an optional seam) and neither can a suite that
   * builds its own wiring, so `__acceptance__/handover-seam.test.ts` is the hand-written half.
   */
  const serveMark = createServeMark({
    store,
    policy: () => serveSignal,
    actor: () => pins.currentUser(),
    append: (type, payload, actor_user_id) => {
      store.append({
        id: crypto.randomUUID(),
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        // `03-F52`'s OWED item (1), CLOSED by `03-F53`. It matters more here than on the
        // ready-mark: `served` is TERMINAL (`01-F35`) and `01-F1` makes it permanent, so this
        // edge is a claim that food reached a customer — and it now names who says so.
        actor_user_id,
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
    // `00 §5.7` — three facts, each owned by the thing that knows it. `lan` and `hub` are the
    // MESH's and were two hardcoded `"down"` literals until it was hosted; `cloud` is the uplink's.
    ...mesh.reachability(),
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
    // `03-F52` — decided HERE and never in the renderer, exactly as `maySignal` is. A renderer
    // that computed this would be a client role claim (commandment 8), and it would be able to
    // disagree with the act `serve-mark.ts` performs.
    mayHandOver: serveSignal.owner === HANDOVER_SURFACE,
    serveSignalOwner: serveSignal.owner,
    /**
     * `03-F53` — WHO is signed in, decided here and never in the renderer. `01-F26`'s idle
     * auto-lock fires with no tap and no unlock call in sight, so a renderer holding its own
     * boolean would stay signed in all night and `02-F41` would go on naming whoever walked away;
     * this rides the one-second `changed` push the surface already makes.
     *
     * The label degrades to the identifier when the roster row carries no `display_name` or has
     * gone (`01-F42` removes it) — `01-F54`, and the alternative is a strip reporting an empty name
     * over a ledger that is attributing correctly.
     */
    user: (() => {
      const user_id = pins.currentUser();
      if (user_id === null) return null;
      return {
        user_id,
        display_name: store.staff.lookup(user_id)?.display_name ?? user_id,
      };
    })(),
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
  /**
   * `01-F61`'s identification grid, and it is a READ — so it feeds no idle timer and costs nobody
   * an attempt (`03-F53`: *"Selecting a person is not submitting an attempt"*, and
   * *"identification is charged on the act and never on the look"*). The same is true of
   * `passState` and `queue` above: `main/uplink.ts` pushes `changed` every second so the age
   * colours move, and if a read counted as activity the idle lock on this app would be unreachable
   * by construction.
   */
  ipcMain.handle(CHANNELS.roster, (): PassRosterMemberWire[] => pins.roster());
  /**
   * `01-F26`/`01-F28` — the identity and the digits arrive, verification happens HERE against the
   * synced Argon2id hashes, and a yes/no goes back. Nothing is appended from this handler: `01-F5`
   * makes `audit.login`'s chain store-owned and the sink writes it, and a PIN that reached an event
   * would be a credential `01-F1` has no path to remove.
   *
   * ⚠ Both arguments are checked before either reaches a verifier. `shared/ipc.ts` calls the
   * renderer *"the untrusted end of this bridge even though we ship it"*, and a non-string reaching
   * `verifyPin` throws inside the handler — which `invoke` turns into a rejected promise on a
   * surface whose whole job is to not be stuck (`01-F17`). A frame that carries anything else names
   * nobody in the registry, which is exactly `unknown_user`, so it is refused in that vocabulary
   * rather than in an invented one (commandment 2).
   */
  ipcMain.handle(CHANNELS.unlock, async (_event, user_id: unknown, pin: unknown) => {
    if (typeof user_id !== "string" || typeof pin !== "string") {
      return { ok: false, reason: "unknown_user" } satisfies PassUnlockResultWire;
    }
    const result = await pins.unlock(user_id, pin);
    // The session moved (or did not) — the strip and the door both read it off `passState`.
    notifyChanged();
    return result satisfies PassUnlockResultWire;
  });
  ipcMain.handle(CHANNELS.markReady, (_event, req: unknown): MarkReadyResult => {
    const parsed = MarkReadyRequestSchema.parse(req);
    const result = readyMark.mark(parsed.order_id, parsed.line_ids);
    // `03-F53` — *"Acting is activity; looking is not."* A cook bumping every two minutes must not
    // be signed out mid-service, so the WRITE paths feed `01-F26`'s idle timer and the reads do
    // not. Only a successful act counts: a refusal wrote no edge, and `no_session` has no session
    // to refresh in the first place.
    if (result.ok) pins.touch();
    return result;
  });
  // `03-F52` — the second act, on its own channel. Parsed at the plane boundary (`18 §9`) and
  // never trusted: the renderer sends an order id and MAIN decides whether this surface owns the
  // handover, which lines are eligible, and whether the order type is one `01 §4` sends to
  // `served`.
  ipcMain.handle(CHANNELS.handOver, (_event, req: unknown): HandOverResult => {
    const parsed = HandOverRequestSchema.parse(req);
    const result = serveMark.handOver(parsed.order_id);
    // Activity, for the same reason and on the same terms as the ready-mark above.
    if (result.ok) pins.touch();
    return result;
  });

  // (`await app.whenReady()` used to be HERE, and everything above it needed it — see the top.)

  /**
   * `00 §5.7` — the boot line, and every clause of it is a fact whose being wrong is invisible
   * from the screen. That is the property that decides what goes in one: an operator cannot see
   * that the ready signal is assigned elsewhere, that the aging thresholds were refused, that this
   * device shares the counter's seed identity, or that no LAN peer directory was configured so the
   * branch mesh will never meet. Each of those looks exactly like working.
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
      `  ${describeServeSignal(serveSignal)}`,
      `  ${describeLanMesh(lan)}`,
      env["RESTOS_CLOUD_URL"] === undefined
        ? "  uplink: cloud OFFLINE (RESTOS_CLOUD_URL unset). 01-F12/01-F13/01-F15 put the " +
          "counter's orders on the LAN mesh above, so with that configured this screen works " +
          "with no internet at all (00 §5.1). With BOTH off it shows an empty queue forever."
        : `  uplink: cloud ${env["RESTOS_CLOUD_URL"]}. Orders reach this screen over the LAN mesh ` +
          "above when the branch has one, and over the cloud otherwise — a WAN outage no longer " +
          "stops this screen learning about new orders while the counter goes on selling.",
      /**
       * `03-F53` — what an operator cannot see from the glass: whether anyone CAN sign in. A
       * device whose registry never synced draws a door with nothing on it, and the door says so
       * (`00 §5.7`), but the boot line is where the person who set the machine up is looking.
       */
      /**
       * `00 §5.7` on a CREDENTIAL, and the reason it is its own line rather than a clause of the
       * one below: a half-configured roster draws a door that looks entirely healthy, so the
       * missing member is discovered only when somebody needs them. The variable set CHANGED in
       * August 2026 — one `RESTOS_DEV_PIN` used to open every row — so a screen upgraded without
       * the two new keys seeds ONE CASHIER, which is correct and must not be a surprise.
       */
      `  ${describeDevStaff(env)}`,
      store.staff.list().length === 0
        ? "  identity: 01-F26's PIN session runs here (03-F53), and THE STAFF REGISTRY IS EMPTY — " +
          "nobody can sign in, so no ready-mark and no handover can be written. See the staff " +
          "line above for the keys to set; nothing populates a real roster yet (01-F47 admits " +
          "devices, not people)."
        : `  identity: 01-F26's PIN session runs here (03-F53) — ${store.staff.list().length} ` +
          "member(s) on the identification grid, verified on-device against synced Argon2id " +
          "hashes (01-F28), with 01-F61's durable per-(device,user) lockout. Every ready-mark and " +
          "every handover carries the signed-in user (02-F41). The QUEUE is never gated: the gate " +
          "is on the act.",
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
    // The mesh holds a LISTENING socket and dial timers; leaving either alive keeps the hub port
    // bound past shutdown and the next launch cannot rebind it.
    mesh.stop();
    store.close();
    app.quit();
  });
};

/**
 * `01-F64` — **this app's own userData directory, and therefore its own `device.db`.** This host
 * and `apps/pos-electron` both opened `join(app.getPath("userData"), "device.db")` and neither
 * named itself, so on Linux both resolved to `~/.config/Electron/device.db`: two `device_id`s in
 * one `events` table, each store serving the other's events as its own, both outboxes pushing
 * them upward into a log `01-F1` cannot unwind.
 *
 * `app.setName` rather than `productName` in `package.json`: `pnpm start` runs
 * `electron out/main/index.js`, so Electron resolves the app path to the SCRIPT's directory and
 * reads no manifest of ours — measured, a `productName` there leaves the name `Electron`. At
 * module scope because `userData` is resolved from the name at first use, and `boot()`'s first
 * `getPath` is a rename too late.
 */
app.setName("RestOS Pass");

/**
 * `01-F66` — **a second process on this device's store must not silently proceed.**
 *
 * Two instances of one app open one `device.db`: the loser's every append dies `SQLITE_BUSY` and
 * `01-F8` no longer holds, because two processes each keep their own high-water mark over one
 * `events` table and neither is this device's own `lamport_seq` (`01-F3`). The counter is where
 * that was measured (a cashier rang four items onto a cart that stayed empty); this screen writes
 * `ready` and `served` edges to the same file through the same store, and a lost handover is
 * `01-F35`-terminal work that simply never happened.
 *
 * **AFTER `app.setName`, and that is load-bearing rather than tidy.** Chromium scopes the lock to
 * the userData directory, which is resolved from the app name at first use — so taking it before
 * the rename would put this screen and the counter on ONE lock and the second app to launch on a
 * shared machine would be refused as if it were a duplicate of the first. `01-F64` corollary (a)
 * is the same argument about the same directory one artefact along.
 *
 * **The loser EXITS; the holder is untouched and RAISES ITS WINDOW.** `01-F66` (a) requires the
 * second process to return and cites `01-F67` for what returning means, so it is a non-zero exit
 * and a line on stderr rather than `app.quit()`. `01-F66` (b) forbids last-one-wins outright: this
 * screen is showing a kitchen its open tickets and a guard that took it down mid-service would be
 * worse than the defect. Raising the window is the `00 §5.7` half — an operator who pressed the
 * shortcut twice gets the running screen instead of nothing at all, which is the honest answer
 * because the screen he wanted is already there. `01-F66` leaves that free ("whether the surviving
 * instance raises its window"); it is chosen because the alternative is a press that does nothing.
 * `01-F17` is untouched in both directions: no ledger is opened by the loser and none is disturbed
 * on the holder. **Nothing is persisted by either** (`01-F66` (c)) — Chromium releases the lock
 * with the process, including one that was killed, so no next launch inherits a refusal.
 *
 * **OWED, named:** `apps/pos-electron` carries this same decision in its own `index.ts`, so one
 * interpretation lives in two files. `DEC-ARCH-001` rules EXTRACT at the second consumer and
 * `@restos/device-config` is where the other five shared host decisions went; it is not taken here
 * because this change's allowlist is the two app entry points, and a package change is a separate
 * surgical piece of work (`24 §3b`).
 */
if (!app.requestSingleInstanceLock()) {
  process.stderr.write(
    "RestOS pass screen is already running on this device (01-F66).\n\n" +
      "Another process holds this device's store. That screen is still showing the kitchen " +
      "queue; this launch is refused so the two cannot write one events table (01-F8).\n",
  );
  app.exit(1);
}

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window === undefined) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

/**
 * `00 §5.7` — **a launch that cannot start must SAY SO.** `void boot()` with no catch is an
 * unhandled rejection and a process that exits with no window, no dialog and no line; this app
 * has already shipped that failure once (see the top of `boot`). `01-F65` adds a refusal that an
 * operator meets on a first launch — the pass screen he has not told which device it is — so the
 * catch is what turns that from a binary which "does not start" into one sentence he can act on.
 *
 * ⚠ **AND FOR A ROUND IT DID NOT RETURN. `dialog.showErrorBox` IS MODAL AND SYNCHRONOUS**, so the
 * catch wrote its line and then blocked for ever waiting for a click — measured on the built
 * binary at 40 s and it would have been 40 minutes. `01-F67` (iii) forbids exactly that: a refusal
 * may not be delivered *by waiting for a human*, and this is the one surface in a `27-F11g`
 * kitchen that **nobody is standing in front of**. `ops/startup/restos-kitchen.bat` is a `:loop`
 * around the start script, so a launcher that never returns never restarts and the screen stays
 * dark until somebody walks over with a mouse — the failure the loop exists to remove.
 *
 * The modal is **dropped rather than moved after the exit**, where it would never paint. `01-F67`
 * (i) is satisfied by stderr, which is where the launcher's captured stream is and therefore the
 * only place the sentence survives the process (`01-F67` permits a box beside it, never instead of
 * it or gating it). The cost is stated rather than hidden: an operator standing at a screen that
 * refuses now sees a window that does not appear, and finds the reason in the launcher's log.
 */
void boot().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`RestOS pass screen could not start\n\n${detail}\n`);
  app.exit(1);
});
