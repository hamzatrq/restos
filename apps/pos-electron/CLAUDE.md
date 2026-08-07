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

## The window is 1366x768 of PAGE, and the layout is checked against that

`main/index.ts` passes `useContentSize: true` with `minWidth`/`minHeight` at **1366x768**, which
is `27 §1a`'s counter panel — the smaller of the two it lists, so a floor rather than a
preference. Without `useContentSize` those numbers describe the window FRAME and the renderer
got **736** css px of height; every capacity figure in doc 27, `27-F11a`'s ~88 tiles included, is
computed against the panel and not against what the title bar leaves over.

The minimums refuse rather than degrade because `AppShell` **clips and does not scroll**
(`27-F2` bans reaching a primary action by scrolling), so a window dragged smaller does not get
tighter — it silently hides controls. That is how the defect below shipped.

**⚠ IF YOU CHANGE A COUNTER LAYOUT, LAUNCH IT AND MEASURE IT.** Every suite in this repo was
green while a cashier could not settle an order. `pnpm -C apps/pos-electron test` renders in
happy-dom, which lays nothing out and therefore cannot see a control below the fold; the
structural guards in `counter.dom.test.tsx` §"C11–C14" pin the shape the fix rests on and are
explicit that the pixel claim is verified by launching. The cheapest way to look:

```
RESTOS_DEV_MENU=1 RESTOS_DEV_PIN=1234 pnpm start   # add --remote-debugging-port=9222 to drive it
```

then read `document.querySelector('main').scrollHeight` against its `clientHeight`. **Any
difference is a control an operator cannot reach**, not a cosmetic overflow.

## THE LAYOUT GATE — that measurement is now a CI rail (`pnpm layout:check`, inside `verify`)

`seams:check`'s equivalent for layout, and it exists for the same reason: reading a diff never
finds a control that is off the screen, and neither does any suite here. `pnpm -C apps/pos-electron
layout:check` (~7 s) builds the real renderer, opens a real `BrowserWindow` from the app's real
`COUNTER_WINDOW_OPTIONS`, mounts the shipped React app against a scripted bridge
(`src/layout-gate/`), and measures in **Blink**: every clipping box against the content it holds,
and every control against the viewport and against `elementFromPoint`. It sweeps the unlock
surface and every tab in **both** device states — `03-F5`'s band up and acknowledged — with tabs
read from the DOM so a tab someone adds is measured without touching the gate.

**No dependency was added** (`18 §15` rule 1): `electron` is already a devDependency and ships the
same Blink the product renders in. `@playwright/test` is on `18 §14`'s allowlist and would still
have been **wrong** — driving a headless page you *set* the viewport to 1366x768, and the
`useContentSize` defect is precisely that the app does not get 1366x768. Only the real window sees
it. Main is deliberately **not** real: it would drag in `better-sqlite3` and make a layout check
cost a native rebuild.

**Mutation matrix — the three shipped defects, re-introduced one at a time.** Control: gate GREEN
on the correct tree. **The last column is the point.**

| # | mutant (one branch each) | gate | pre-existing 344 + 216 |
|---|---|---|---|
| M1 | `index.html` — `box-sizing` reset removed | **RED**, 7 fatal (`#root` 1392px in 1366px; `I SAW THIS` off-screen) | **all 560 green** |
| M2 | `TenderPanel` back to one column | **RED**, `main` 960px in 632px, 9 keys unreachable | **all 560 green** |
| M3 | `useContentSize` off the window | **RED**, renderer got **1366x736** | **all 560 green** |
| M4 | **NEGATIVE CONTROL** — method column 480→500 px | **GREEN** | all 560 green |

M4 is what makes the other three mean anything: a real one-branch layout edit does **not** trip
the gate, so it discriminates rather than reddening at any change.

**⚠ A FOURTH DEFECT, FOUND BY THE GATE ON ITS FIRST RUN — UNRESOLVED, do not treat as fixed.
⚠ AND ITS FIRST DESCRIPTION, INCLUDING THE ONE THAT STOOD HERE, WAS WRONG.** This paragraph used
to say *"a cashier cannot type a `0`, so Rs 500 and Rs 1,000 cannot be entered"*. **Measured August
2026 with real `sendInputEvent` mouse clicks through Blink's own hit testing: band up, Pay open,
press `1` `0` `0` `0` and `REMAINING` goes Rs 4,875 → Rs 3,875. Rs 1,000 TYPES FINE.** The claim
was inferred from the gate's `withinViewport`, which is a **fit** check ("every edge inside the
viewport"), whose verdict text then concluded *"cannot be touched"* — which does not follow. It was
never tested before it propagated from the register into this file and into a task brief. The
mechanism was right; its **wording** was never pointed at the case it fires on.

**What is actually measured** (768 px viewport; `main` is **632 px** quiet and **530 px** with the
band, so `03-F5`'s band costs exactly **102 px**; chrome is 51 strip + 85 rail + 102 band + 32
`main` padding = **270 px**):

| surface | state | measured |
|---|---|---|
| Pay | band up | `C` `0` `⌫` clipped 126 → **95 px**, all three still clickable; nothing else lost |
| Cash | band up | `C` `0` `⌫` clipped 126 → **112 px**, all clickable; **`Counted Rs 0` ENTIRELY off-screen** |
| Pay, Cash | quiet | nothing clipped, nothing unreachable (Pay has 38 px spare, **Cash has 0**) |

**Cash is the one that costs something.** `Counted` is the live echo of what the cashier has keyed
into a drawer count, and `CashSurfaces.tsx` already calls it *"the only feedback that a 126 dp key
registered at all"*. Under the band she counts the drawer blind — `27-F25` and `27-F29` both land
on that row. Pay's loss is 31 px off three keys that still work.

**It is on the ordinary path, not a corner case:** this device ships `unattachedPrinter`, so every
confirm raises that band ~20 s later — ring, send to kitchen, then try to settle.

**Why it is REPORTED and not fixed — the reason is arithmetic, not judgement.** The keypad is
4 × `targetFor("keypad")` + 3 gaps = **528 px**; under the band `main`'s content box is **498 px**.
*The pad alone does not fit*, before any label, DUE figure, TAKE CASH button or padding — so no
overlay, reflow or reordering of these surfaces can close it, and every "budget" remedy that looks
available is arithmetically dead. See **THE BUDGET IS OVER-SUBSCRIBED** below: what is left is a
spec question, not a pixel choice (commandment 9).
It is carried in `OWED_UNDER_ALARM` in `src/layout-gate/main.ts`, which **cannot rot**: a listed
surface that starts laying out cleanly **fails** the gate, forcing the entry out.

**⚠ A FIFTH DEFECT, WORSE THAN THE FOURTH, AND NO GATE CAN SEE IT — `ManagerApproval` DOES NOT
FIT IN EITHER STATE.** Measured August 2026 in the same real window: with an approver chosen, the
PIN step lays out **1162 px of content** in a **632 px** box quiet (**530 px** with the band). In
the **quiet** state `Approve`, `Not them?` and `Cancel` are **entirely below the viewport** — top
edges at y=852, 1002 and 1152 in a 768 px window — and `0` and `Clear` are two-thirds gone. **A
manager cannot approve anything, on any device state.** `02-F20`'s local manager-PIN path — the
only escalation route that exists, since doc 05's remote one is unbuilt — is dead on arrival, and
`05-F19`'s over-threshold paid-out is the live case that reaches it. The cause is a vertical stack
of **seven** `posture="keypad"` elements (4 digit rows at a 142 px pitch, then `Approve`, `Not
them?`, `Cancel` at 150 px each); it is the same 126-dp-as-css-px arithmetic as defect 4 but with
three extra full-size buttons stacked under the pad, so it overruns by 530 px rather than 64.
**The layout gate is structurally blind to it**: its fixture returns `escalationFor: () => null`,
so `ManagerApproval` never renders and the surface is never measured. That is blind spot 2 in the
list below (*"it only sees the states the fixture produces"*) costing a real, worse defect —
reproduce it by patching the built gate preload to reject `append` and return an offer.
**Reported, not fixed:** it needs the same budget ruling, plus a `27-F4` positional change to a
surface whose three trailing buttons cannot all be keypad-posture in a 768 px panel.

**WHAT THE GATE CANNOT CATCH — do not read a green run as "the screens are right".**
1. **Main is a stub.** It says nothing about IPC, Zod validation at the plane boundary, or whether
   the shipped preload serves the same channels. `main/__acceptance__/` owns that.
2. **It only sees the states the fixture produces.** Defect 4 was invisible until the fixture
   served an alarm; a surface state nobody scripted is a surface state nobody measures. The
   fixture is the gate's real coverage boundary, not the assertions. **This has now cost a real
   defect and not just a hypothetical one** — `escalationFor: () => null` means `ManagerApproval`
   never renders, and defect 5 above (a manager who cannot approve, in *both* states) sat
   unmeasured behind that one line.
3. **It does not judge legibility, contrast, typography or target size.** `27-F8`'s 126 dp floor
   and `27-F26`'s missing webfont are untouched — a control can be reachable and still unreadable.
4. **One panel, one DPI, one platform.** 1366x768 at devicePixelRatio 1 on macOS. `27 §1a`'s
   1920x1080 target and the Windows till this ships to are **not** measured, and font metrics
   differ there (Segoe UI vs SF Pro), which is exactly the kind of thing that moves a layout.
5. **`27-F4`'s positional contract is invisible to it.** Controls may be reordered freely and the
   gate stays green as long as they all fit.
6. **It needs a display.** Electron opens a real (hidden) window; a headless Linux CI needs xvfb.
   Per `T-01-07` that is a LOUD failure, never a skip — an environment prerequisite, not a
   regression.

## THE BUDGET IS OVER-SUBSCRIBED, AND CLOSING IT NEEDS A RULING (defects 4 and 5)

**The one line that settles it: `51 + 85 + 102 + 528 = 766` in a `768` px panel.** Status strip,
tab rail, `03-F5`'s band and the keypad, with **2 px left** for all padding on every surface. That
is why defects 4 and 5 have no implementation fix — the pad alone (528 px) is larger than the work
area under the band (498 px of content box), so overlay, reflow, reordering and "absorb it
elsewhere" are all arithmetically dead before design taste enters. **Four remedies were checked
and each is refused by an FR, not by preference:**

- **Overlay instead of displace** — the band would cover the *top* 102 px of the work area, which
  on Pay is `DUE`, the `02-F12` method row and the top of the pad. You would lose `1` `2` `3` and
  the method selector instead of the bottom of `C` `0` `⌫`; `27-F11d`'s *"the work underneath
  stays visible and usable"* is broken either way, and `elementFromPoint` would then report
  COVERED. It relabels the loss, it does not remove it.
- **Scroll or page the work area** — `27-F2`, and the keys are not a list.
- **Hide the pad behind a SETTLE button** — `27-F5`'s ban on context-dependent controls.
- **Shrink the keys** — `27-F8`'s 20 mm is a measured floor for high-consequence standing entry.
  Lowering it to fit a layout is the `01-F61` cost-floor move one domain over.

**What is left is one spec question, and it is a real one.** `targetFor("keypad")` returns `126`
and the product spends it as **126 CSS px**, i.e. dp ≡ css px, which is only true on a 160-PPI
panel. **`27 §1a`'s own hardware table says otherwise**: the counter POS row is *15.6″, 1366×768
or 1920×1080, 100–141 PPI, 76 dp tile → **47–67 px**, 126 dp keypad → **79–111 px***. That table
is exactly the mm conversion (76 dp = 12.06 mm → 47.7 px at this panel's 100.5 PPI; 126 dp =
20.0 mm → 79.1 px), and `27-F11c` states the rule in words — *"Design in millimetres, render in
pixels"*. At `27 §1a`'s own 79 px the pad is **340 px** and everything fits with 126 px to spare.
**Nothing in doc 21 or doc 27 ever says a dp is a CSS px**; `TOKENS.md` already warns that "the
same dp renders 2.3× larger on a 32″ 69-PPI panel than on a phone", which is this argument at a
larger ratio. `packages/ui/src/components/layout-physical.oracle.test.ts` carries the unresolved
half as a written FINDING — *"27-F8's dp and mm columns do not use one conversion … Pick a
conversion in doc 27 and restate the table from it."*

**It is NOT a session's call to make, for three reasons** (commandment 9, `24 §3b`): it changes
every touch target in the product in the shrinking direction; it needs a physical-panel input the
renderer does not have (a layer-2 config key per `00 §7`, or a `screen.getPrimaryDisplay()` fact
over the bridge — either is a spec PR first); and a hardcoded 79 px would be **wrong on the other
panel `27 §1a` lists**, since 79 px at 1920×1080's 141 PPI is 14.2 mm, *below* the 20 mm floor.
The alternative ruling — *"the counter ships 1920×1080 only"* — makes 1080 px of panel and fits
everything, but `27-F11c` says both resolutions are the same physical surface holding the same
tiles, so "needs more pixels" is the category error that FR exists to name. **Both options are
founder calls. Until one lands, defects 4 and 5 stay in the register and stay named.**

## What is deliberately not real yet

- **`27-F26`'S TYPEFACE IS NAMED BUT NOT DELIVERED — no webfont is bundled.** The token chain is
  `'IBM Plex Sans', system-ui, sans-serif`, so the till renders Plex only if the machine already
  has it: SF Pro on a Mac, **Segoe UI on the Windows counter this app ships to**. The renderer's
  CSP is `'self'`, so no external font URL can load and delivering it means committing the woff2
  files as a local asset. **It is not cosmetic:** `27-F26` chose Plex on *fail-safe defaults* —
  "tabular digits and distinct `I`/`l` with no feature flags" — and Segoe UI's figures are
  proportional by default, so money columns do not align on the surface where `27-F25` makes
  digits the payload. Left unbundled on **process**: `18 §15` requires a §14 entry and a senior
  approval for a new asset, which a session fixing a layout blocker cannot give itself.
  `apps/backoffice` made the same call for the same reason. **Owed.**
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
- **YOU CAN NOW LOOK AT A DOCUMENT WITHOUT BUYING A PRINTER — AND IT DOES NOT CLOSE K-8.**
  `RESTOS_PRINT_TO_FILE=<directory> pnpm start` swaps `unattachedPrinter` for `filePrinter`
  (`main/file-printer.ts`), which writes every transmitted document to a **PDF** in that directory
  — one file per document (`03-F42` makes a document the transmitted unit), one page per **cut**,
  laid out at the head's physical size (203 dpi → 72 pt/in, so an 80 mm roll measures 80 mm). Names
  are `0001-<content digest>.pdf`: a sequence, no clock, so two runs of the same fixture produce
  identical bytes and a duplicate KOT shows up as a repeated digest instead of hiding behind two
  timestamps. **No dependency was added** — the PDF writer is `node:zlib` scaffolding in
  `packages/escpos/src/simulate.ts`, per `18 §15` rule 1; `18 §14` lists no PDF library and `pdfkit`
  + `@types/pdfkit` for a file no customer receives is a poor trade.
  **What it is NOT, and none of this is hedging:**
  (1) it renders what **our own encoder** thinks the bytes mean, through the same `simulate()` the
  snapshot suite uses, so a misconception the encoder and the simulator SHARE is invisible to it by
  construction — `03-F40`'s two incompatible bit layouts for one sensor is the corpus's own instance;
  (2) it says **nothing about legibility** — `27-F35`'s ≥85% comprehension / ≤5% critical-confusion
  gate is a post-training retest with real staff on thermal paper and stays **OWED**;
  (3) it says **nothing about a real TH230** — cutter, feed and paper-out are `03-F10` rig questions,
  and note that **paper never runs out in this transport**, so `03-F41`'s hold (whose failure mode is
  a duplicate KOT) is unreachable through it;
  (4) **it is not the default and must never become one.** With the variable unset the device still
  ships `unattachedPrinter` and every confirm still raises `03-F5`'s band ~20 s later. That band is
  the honest signal that no printer is attached (`00 §5.7`); a simulator that quietly suppressed it
  would remove the one thing telling an operator the truth. `__acceptance__/file-printer.test.ts` §A
  is what keeps that true, and the mutant "selected with no env set" is killed by exactly that test.
  **K-8 — the physical pass — is owed in full, unchanged by this.**
  **FIRST FINDING FROM ACTUALLY LOOKING (August 2026, unresolved — do not treat as fixed).** The
  first real KOT rendered through it shows the **quantity column overlapping itself**: `document.ts`
  gives `line.quantity` the `size_2x2` ink level (double height, 48 dots) while `simulate()` advances
  a line feed by the size in effect AT the `LF` (normal, 24 dots), so consecutive quantities collide.
  Two possibilities and **only hardware separates them** — either a real head expands the line to its
  tallest glyph and the paper is fine while the simulator is wrong, or it does not and the KOT layout
  is wrong. Nothing in the corpus rules, `simulate()`'s advance was inherited verbatim from K-3's
  virtual printer (so the same overlap has been in every snapshot since), and changing it would change
  an oracle's meaning. **Finding for the K-3/K-5 test owners and for K-8's rig, not a fix.**
- **THE PUBLISHED MENU NOW REACHES THIS APP, MEASURED — the "nothing publishes one yet" line
  below is retired.** August 2026: the four-process stack was run end to end and an owner's menu
  travelled back office → `services/api` → `services/sync-gateway` → this till, which rang it at
  the price the owner typed (Rs 450 + Rs 320 = Rs 770). Both delivery paths work — a snapshot on
  `hello_ack` version mismatch, and a **live delta** on `catalog_notice` that moved a connected
  till from v1 to v2 with no restart. **The runbook is `plans/wave-1/running-the-stack.md`** and it
  is the only document that takes you from a clean checkout to that state; read §0 first, because
  `DEV_IDENTITY`'s `org_id` must equal the API's `BOOTSTRAP_ORG_ID` and its `branch_id` must be in
  `ENABLED_BRANCHES`, and a mismatch fails **silently** in all four processes at once.
  **Two live defects had to be fixed to get there, and neither was visible to any suite:**
  `packages/sync-client`'s `catalog-fetch.ts` dropped `prices` and `station` at the wire→store
  reshape (so every synced tile was `no price set` — it failed 0 of 579 tests), and the gateway's
  `/internal` publish never called `notifyCatalogVersion` (so apply-now reached nobody live — 0 of
  280). Both are protected paths and both want senior review.
- **The item grid needs a source, and there are exactly two.** The catalog *transport* is real
  and wired as of T-C6: `main/sync.ts` builds the cloud session, which requests on `hello_ack`
  version mismatch and on `catalog_notice` and applies into `store.catalog` — so a device with
  `RESTOS_CLOUD_URL`/`RESTOS_DEVICE_TOKEN` pointed at a gateway gets the org's published menu.
  **Nothing MINTS a device token, though** (`01-F47` admission is unbuilt): the gateway needs both
  an HS256 token and an unrevoked `kernel.device_registry` row, and both are manual steps in the
  runbook's §6b. For a local launch with no gateway there is a **marked DEV SEED**, off by default
  like the roster:

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

  which seeds three staff **sharing that one PIN** — deliberately, because `01-F61` names a
  shared 4-digit PIN as the ordinary case that makes the identification step load-bearing.
  **The PIN is not in the source and must not be put there:** a constant under `src/main` is
  the device-wide secret `01-F61` refuses, and `unlock-gate.dom.test.tsx` fails the build on
  one. **The seeded ROLES are two cashiers (Ayesha, Bilal) and one branch manager (Hina)**, and
  the mix is load-bearing since `main/authorize.ts` landed: `02-F22`'s role guard makes a
  cashier unable to open the day, so a roster of three cashiers would leave `pnpm start` with a
  day that can never be opened. Sign in as Ayesha and "Open the day" is refused in main; sign in
  as Hina and it lands.
- **COMMANDMENT 8 IS ENFORCED HERE, AND ITS ESCALATION PATH IS NOT BUILT.** `main/authorize.ts`
  wraps the gateway's two write methods and runs every renderer-originated append through
  `domain`'s `can` / `canPayOut` before the ledger is touched — that file is the matrix's first
  production caller in the whole product. What is owed and is named rather than left to look
  intentional: `can()` returns three outcomes and the third, `escalate`, has **no UI**. `02-F20`
  gives it two equivalent paths (a local manager PIN on the POS, a remote approval via doc 05)
  and neither is Wave-1 work, so today an escalation is *refused* at the seam — carrying the
  outcome and the roles that would satisfy it, so the screen that eventually asks for a manager
  PIN reads them off the matrix. The live case is `05-F19`: a paid-out above
  `PAID_OUT_APPROVAL_THRESHOLD_PAISA` (Rs 2,000, **PINNED not specified**) is refused at the
  counter until that path exists. `02-F20`'s void / comp / price-override rows are mapped ahead
  of their events, which `domain/registry.ts` does not carry yet.
- **THE STRIP SAID `dev` WHILE THE LEDGER SAID AYESHA — CLOSED AUGUST 2026.** `DeviceState`
  carries two identity fields. `user` is the `01-F26` session, added by S-0c and stamped into
  every envelope as `actor_user_id`. `actor` is older — it shipped with the first launch commit,
  before identity existed — and it is the one `StatusStrip` **renders**, under the caption
  *"02-F19 — attribution is never anonymous. The name is shown, not just a role."* When identity
  landed it reached the envelope, the permission matrix and `DeviceState.user`, and **nothing
  moved the strip over**: `main/index.ts` went on passing the literal `actor: "dev"`. So a till
  that had signed Ayesha in, refused her the day open on her real role and written
  `actor_user_id: "user-ayesha"` into every event **told her she was `dev`** — on the one piece
  of chrome `27-F1` guarantees never leaves the screen. `deviceState()` now derives it from the
  same `session()` read that stamps the envelope, and `deps.actor` survives as the LOCKED value
  only (`02-F18` draws no strip there; `01-F27` is why it is the device's own label and not a
  stand-in person). **The ledger was never wrong** — this was a display defect, and the whole of
  it lived in one argument at a call site.
  **Why nothing caught it, which is the part worth keeping:** every gate was green — 330 tests,
  `pnpm verify` exit 0, `seams:check` clean — and `identity-attribution.test.ts` even carries a
  test titled *"the identity SHOWN and the identity STAMPED are one fact, not two"*. It compares
  `deviceState().user` against the envelope, and those two agreed all along. **The guard was
  built correctly and pointed one field away from the one the product draws.** Reading the diff
  never finds this; looking at the running app does, in about four seconds.
- **Mutation matrix — `main/__acceptance__/strip-attribution.test.ts` (control 340/340 green,
  0 survivors).** Run in-tree with byte-exact backups, full package suite under each mutant.
  **The column that matters is the last one:** 330 tests existed before this file and *not one of
  them* can tell any of these mutants from the correct implementation.

  | # | mutant (one branch each) | new tests failed | pre-existing 330 |
  |---|---|---|---|
  | M1 | `index.ts` re-introduces `actor: "dev"` — **the defect verbatim** | 2 (§B) | all green |
  | M2 | **CONTROL** — `gateway.ts` back to `actor: deps.actor` | 4 (§A) | all green |
  | M3 | `actor: user?.user_id ?? deps.actor` (name → identifier) | 5 (§A) | all green |
  | M4 | `actor: user?.display_name ?? deps.deviceLabel` (locked value drifts) | 2 (§A) | all green |
  | M5 | `index.ts` passes `session: () => null` — the **stub-supply** seam | 1 (§B) | all green |

  M2 is the control: it differs from the shipped code in exactly one expression and is the
  pre-fix tree. M1 and M2 are *different* mutants and neither subsumes the other — M1 is invisible
  to §A (the gateway still derives correctly) and M2 is invisible to §B (the argument still looks
  right), which is the AGENTS.md "you need BOTH properties" split showing up on one field. **M5 is
  the case `seams:check` Rule B cannot see** (`session` is *supplied*, just supplied with a stub);
  under it the product attributes nothing, shows the placeholder, and 339/340 tests pass.
- **THE ORDERS TAB SHIPS HALF ITS ROW, AND THE OTHER HALF IS BLOCKED IN THE KERNEL.**
  `screen-map §3.1` gives the **Orders** tab four tasks. **`C19`** (accept a cloud order,
  `02-F9`) and **`C31`** (find that order again, `02-F10`) are built — `renderer/OrdersSurface.tsx`,
  on `packages/ui`'s new `OrderList`. **`C20` and `C32` are NOT, and neither is a scoping choice:**
  - **`C20` (reject) — `order.rejected` has no payload schema.** The `01 §4` catalog absorbed the
    type in July 2026 (the absorption note names C20 by number), so **`role-task-inventories.md`
    §10.2 is STALE where it says the reject path "cannot be implemented today"** — that sentence
    was true when written and the kernel has since moved. What actually blocks it now is one step
    later: `packages/domain/src/registry.ts` carries **six** `order.*` schemas and this is not one,
    and `01-F4` makes emitting an unknown type a build-time *and* runtime error. Closing it is a
    SACRED-path change (`18 §2`) that must also fix the shape of `06-F20`'s reason list. **Owed.**
  - **`C32` (mark ready) — four independent blockers, any one sufficient.** (1) **Nothing advances
    a line past `placed`**: no production code in this repo emits `order.line_state_changed` (only
    test builders do), and `02-F31`'s `kot.printed → in_prep` auto-advance is explicitly
    *projection-inert* in `sync-client/src/folds/merge.ts`. (2) So the edge `C32` would emit is
    **illegal** — `LEGAL_NEXT.placed` is `["confirmed","voided","cancelled"]`, and the fold records
    `illegal_transition` and refuses to apply it. A Ready control would be a control that can never
    succeed. (3) The seam carries **no per-line state and no head edge ids**, so
    `line_context.preds` cannot be built; `preds: []` would make the line a contested MVR rather
    than ready. (4) **`03-F24`'s ready-signal-ownership config does not exist** anywhere in code, so
    `02-F33`'s gate has no source and inventing one is a commandment-2 violation. **What ships is
    `02-F33`'s own fallback and it is spec-conformant, not a gap:** *"otherwise the panel is
    read-only for states."* `orders-tab.dom.test.tsx` §E is an **anti-scope guard** that fails if
    either control is drawn before its blocker clears.
  - **The S2 CHIME IS OWED; the count badge ships.** `screen-map §5` rules the arrival signal is
    *"S2 chime + count badge"* and forbids a popup. The badge is real (`TabRail.badge`, set in
    `Counter`). **There is no audio anywhere in this app** — `03-F5`'s S1 "repeating distinct
    sound" is unbuilt too — and `21 §5` requires *"one sound vocabulary platform-wide"*. Shipping
    an S2 chime alone would make a **new website order audible on a till where a failed kitchen
    ticket is silent**, inverting the severity ladder that law exists to fix. Named, not dropped.
  - **`02-F9`'s S1 escalation cannot be computed here.** *"An unaccepted order past half its
    confirmation window escalates to S1"* needs a placed-at time, and the `open_orders` projection
    carries **only `confirmed_at`** — an unconfirmed order has no time on this device at all. The
    inbox therefore keeps the seam's order among its own rows and `03-F46`'s oldest-first applies
    to the confirmed list. **Owed at the fold, not here.**
  - **A finding about the CART, left alone deliberately.** `Counter` binds `current = orders[0]`,
    so an unaccepted cloud order sitting first in the seam's array becomes the Order tab's cart.
    That predates this tab and is **not changed here**: which order is "the cart" when several are
    open is `02-F11`'s question and needs an FR, not a patch from the screen that surfaced it.
- **TWO LAYOUT DEFECTS FOUND BY LAUNCHING, BOTH INVISIBLE TO 367 GREEN TESTS.** happy-dom lays
  nothing out, so neither could be seen by any renderer suite — this is the package guide's own
  "⚠ IF YOU CHANGE A COUNTER LAYOUT, LAUNCH IT AND MEASURE IT" earning its place a third time.
  1. **The Accept tile overflowed its row.** `Tile` sizes from `targetFor("counter")` = **76 CSS
     px**, while physical capacity math uses `targetMm("counter")` = the same 76 dp expressed as
     **12.065 mm**, which renders as **45 px**. Rows overlapped and the tiles spilled past their
     cards. `OrderList` now floors the row at the action's own height *in the same number it
     renders with*. **The dp-as-CSS-px / dp-as-mm duality is PRE-EXISTING and is not fixed** —
     `ItemGrid` has it too and the counter papers over it with `tileMm={28}`. Reconciling them is a
     `packages/ui` tokens change with its own FR. **Owed.**
  2. **The pager was not subtracted from its own box**, so a two-row page rendered two rows *and* a
     pager into space for two — and the second inbox row was **clipped in half with no way to reach
     it**, which on a counter is an order that cannot be accepted. This is exactly the hazard
     `ItemGrid` documents ("items on the page, invisible, with no pager to reach them"); it only
     bites here because this surface gives a list a third of the panel instead of nearly all of it.
     Capacity is now costed twice — full height, then re-costed minus the pager *only if* the list
     actually overflows. **`ItemGrid` has the same latent bug and it is NOT fixed here** (surgical
     diffs, `24 §3b`): its box is large enough that it has not bitten yet. **Owed.**
  Measured after both fixes on the launched app at 1366×768: `main` `scrollHeight` **530** ===
  `clientHeight` **530** with the `03-F5` band up, rows `[86,86,45,45,45]` — action rows contain
  their 76 px tile, read-only rows stay at their physical height. **The live `C19` loop was
  exercised by hand:** badge **3 → 2 → 1**, and each accepted order moved from *New orders* to
  *Open orders* on the same `order.confirmed` append `sendToKitchen` makes.
- **Mutation matrix — the Orders tab (control 367/367 green, 0 survivors after two fixes).**
  In-tree with byte-exact backups and a restore trap, full package suite under each mutant.
  **344 tests existed before this work and NOT ONE of them can tell any of these mutants from the
  correct implementation** — which is what makes every kill attributable to the two new files.

  | # | mutant (one branch each) | new tests failed | pre-existing 344 |
  |---|---|---|---|
  | M1 | **CONTROL** — Orders tab back to `unavailable: true` (the pre-fix tree) | 17 (§A–§G) | all green |
  | M2 | `gateway.ts` drops `channel: row.channel` — **the SEAM** | 2 (seam only) | all green |
  | M3 | `isCloudInbox` uses `!o.confirmed_at` (undefined ≡ null) | 1 (§D) | all green |
  | M4 | `foodpanda` added to the cloud set (`02-F9` bypasses it) | 1 (§B) | all green |
  | M5 | badge = `orders.length` | 1 (§B) | all green |
  | M6 | accept confirms the CART, not the pressed row | 1 (§C) | all green |
  | M7 | open list rendered as delivered (no chronological sort) | 1 (§G) | all green |
  | M8 | `OrderList` action fires with the FIRST row's id (`ui`) | 1 of 234 | all green |
  | M9 | **anti-scope** — a Ready action on the open list | 2 (§E) | all green |
  | M10 | `gateway.ts` drops `confirmed_at: row.confirmed_at` — **the SEAM** | 2 (seam only) | all green |

  **M3 and M4 SURVIVED THE FIRST RUN — 365/365 green — and that is the finding worth keeping.**
  Both are the round-3 shape exactly: the mechanism was built and the guard was never pointed at
  the dangerous case. §D tested a row with **no channel at all**, so `isCloudInbox`'s first clause
  already refused it and the `confirmed_at` comparison was never reached; and no fixture had an
  **unconfirmed foodpanda** order, so widening the channel set cost nothing. Two fixtures were
  added (a cloud channel beside an *absent* confirm state; an unconfirmed aggregator order) and
  both mutants now die. **Reading the suite would not have found either** — only mutation did.
  **M2 and M10 are the wave's named defect demonstrated:** each kills the seam file alone and
  leaves all **19** renderer tests green, so the screen suite by itself blesses a gateway that
  supplies nothing and an inbox that is empty forever. `main/__acceptance__/orders-seam.test.ts`
  is the hand-written assertion `seams:check` cannot express (these are fields on a mapping, not
  an unreached export or an unsupplied optional).
- **IT ALSO GUARDS A READ.** `authorizeReads` narrows `cashState` to `reportScope`'s Appendix A
  reach (`02-F23` — "cashiers see only their own shifts"), the permission matrix's last export to
  gain a production caller. It hid nothing for one round: the `shift_cash` fold projected `cashier`
  from a payload field `02-F45` forbids, so every shipped row was `cashier: null` and a
  correctly-built, mutation-proven privacy rule filtered nothing at all. **The fold conformed in
  August 2026** — it reads the envelope's `actor_user_id` now, and the oracle pin recording that
  source as "undecided" is retired, because `02-F45` had already decided it. **It now narrows for
  real, and that is MEASURED on the shipped app rather than argued:** one store, one
  `shift.opened` by Hina; signed in as Hina (branch_manager → `own_branch`) the seam serves
  `[{cashier: "…006"}]`, signed in as Ayesha (cashier → `own_shift`) it serves `[]`. The
  `actor: "dev"` literal above never reached this — it was never the ledger's attribution, so
  `02-F23` was filtering against a real per-person value throughout. A null row is still
  SERVED, and now means one of two real things: an event appended before identity reached the
  envelope, or an `01-F31` divergence where two devices claimed one shift under different PINs and
  the fold refused to pick a winner. Hiding the first would blank the Me tab; hiding the second
  would conceal a contested shift from the cashier it accuses — both invert `02-F23`'s protection
  guarantee, which is the half of that FR most easily lost.