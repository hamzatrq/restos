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
- **The item grid needs a source, and there are exactly two.** The catalog *transport* is real
  and wired as of T-C6: `main/sync.ts` builds the cloud session, which requests on `hello_ack`
  version mismatch and on `catalog_notice` and applies into `store.catalog` — so a device with
  `RESTOS_CLOUD_URL`/`RESTOS_DEVICE_TOKEN` pointed at a gateway gets the org's published menu.
  Nothing *publishes* one yet, because that is the back office
  (`plans/wave-1/backoffice-catalog.md`). So for a local launch there is a **marked DEV SEED**,
  off by default like the roster:

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