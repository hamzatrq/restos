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

## The window is 1366x768 of PAGE, and its FLOOR is 220 x 125 mm of GLASS

`main/index.ts` passes `useContentSize: true`, which is `27 §1a`'s counter panel measured as the
renderer sees it. Without it those numbers describe the window FRAME and the renderer
got **736** css px of height; every capacity figure in doc 27, `27-F11a`'s ~88 tiles included, is
computed against the panel and not against what the title bar leaves over.

**⚠ THIS SECTION SAID `minWidth`/`minHeight` ARE 1366x768 AND THAT "the minimums refuse rather
than degrade". BOTH HALVES ARE RETIRED (August 2026, founder ruling: bring-your-own-hardware).**
That contract was wrong on both sides at once, and the measurements need no interpretation:

| panel | glass | pixel floor said | layout gate measured |
|---|---|---|---|
| 1280x800 @13.3" | 287 x 179 mm | **REFUSED** | **0 violations, 13 surfaces, both states** |
| 1366x768 @10.1" | 224 x 126 mm | **admitted** | **clips two surfaces** |

It over-blocked the most likely BYO device and under-blocked a broken one, because **a pixel
count is not a size** (`27-F11c`). 1024x600 and 1366x768 on the same 10.1" glass are 78% apart in
pixels and give the same two clipped surfaces — the pixels bought nothing.

**⚠ THE FLOOR IS `220 x 125` AND THE TABLE ABOVE IS HISTORY. This section said `215 x 134`, and
said the 10.1" tablet "clips two surfaces" — both true until August 2026, both retired in the
same change.** `packages/ui`'s `compact` mode stopped being three numbers and became an
arrangement: the tab rail turns vertical (85 dp of chrome off every surface), `TenderPanel` drops
panel chrome it does not need at that size (42 dp), `Panel` tightens its inset, and Cash's tile
rows finally have something to wrap against. The 10.1" tablet class now renders **every** surface
with zero violations and it `ships: true`. **No target moved** — the gate measures a 20.00 mm
keypad key on that panel — so `27-F68` (b) is not engaged; the arrangement changed, not the
millimetres. The old note argued the tablet "cannot GATE, because the only way to make the
counter fit 126 mm is to shrink `27-F8`'s keys". That reasoned from *the pad is 528 dp and the box
is 485* straight to *no layout can fit*, skipping the question of how much CHROME stood between
them. The answer was 85 dp of it.

`window-options.ts` declares `PANEL_FLOOR_MM = { width: 220, height: 125 }` and converts it per
panel through `27-F68`'s density. **Do not pin any pixel pair** — `27-F68` (a) forbids it by name
and `panel-fit-seam.test.ts` fails if any two measured panels share a pixel floor. Each axis sits
just under its smallest RENDERED-CLEAN panel (`netbook-1024` at 221.3 mm wide, `tablet-10.1` at
125.7 mm tall) and `layout:check`'s `probe-below-floor` row (201.6 x 118.1 mm, 23 violations,
three controls UNREACHABLE) is what stops the floor being a claim with no failing case behind it.
**Pay is the height-binding surface (593 dp) and Cash is the width-binding one** — the old text
said Cash set the height, which stopped being true when the grouping round moved its readout
beside the pad, and the figure was carried forward with the wrong name on it. Cash's width demand
is a FUNCTION of the height it gets, because its groups column-wrap: 1705 dp in a 485 dp box,
1318 dp in a 569 dp box. The width used to be the **Order tab's** measured
1356 dp and not `TenderPanel`'s 147 mm, because the floor must hold for every surface.

**Above the floor it still binds; below it, it CLAMPS to the glass and the till STARTS.**
`AppShell` clips rather than scrolling (`27-F2`), so above the floor a smaller window hides
controls and refusing the drag costs nothing. Below it no drag helps — the glass is simply small
— and a restaurant running this on the laptop it already owns is not helped by a device that will
not turn on. `counterWindowOptions` clamps the initial size AND the minimum to the display's work
area.

**Starting degraded is only defensible if the degradation is NAMED (`00 §5.7`).** `packages/ui`'s
`PanelHealth` is `CatalogHealth`'s peer on the honesty strip — amber, no control, nothing at all
when healthy (`27-F16`) — carrying either `Screen TOO SMALL` with the measured millimetres or
`Screen UNMEASURED`. `GatewayDeps.panelFit` is REQUIRED so a host that forgets it is a typecheck
error, and `__acceptance__/panel-fit-seam.test.ts` §C is the only thing separating that from a
host that supplies `() => null`.

**The density fallback is the other half and it CANNOT be made safe.** With no OS physical size
`panel-density.ts` assumes `27 §1a`'s 15.6" — on a 10.1" tablet that is ~100 PPI against ~224 of
real glass, so **every `27-F8` target renders at ~45% of its ergonomic size and nothing on screen
looks wrong**. Checked rather than assumed: guessing the panel LARGER shrinks targets below
`27-F8`'s floor (`27-F68` (b) forbids exactly that), guessing it SMALLER grows them until
controls clip (defect 2's shape). No diagonal is safe in both directions, so the consequence is
made visible instead — and **`unmeasured` outranks `too_small`**, because a floor computed from a
guessed density is itself a guess.

**⚠ WHAT IS UNMEASURED, stated rather than papered over.** *This said "nothing between 130 mm and
174 mm has ever been measured, and the 134 mm floor sits inside that gap" — **that gap is now
closed**: `tablet-11.6` (144 mm), `laptop-12.5` (156 mm) and `laptop-13.3-hd` (166 mm) were added
to the sweep and all three render clean.* What is still open is narrower and is a bracket rather
than a walk: **118.1–125.7 mm of height and 201.6–221.3 mm of width** are bounded by one failing
panel (`probe-below-floor`) and one passing panel each, so the floor is known to within ~8 mm on
each axis and no closer. Nothing between 294 mm and 345 mm of width is rendered either. And every
panel here is SIMULATED on a macOS host — the Windows till this ships to, with different font
metrics, is still measured by nothing.

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
and every control against the viewport and against `elementFromPoint`. It sweeps **both** of
`01-F61`'s lock steps and every tab in **both** device states — `03-F5`'s band up and
acknowledged — with tabs read from the DOM so a tab someone adds is measured without touching the
gate.

⚠ *That said "the unlock surface" and meant step ONE.* Until August 2026 the fixture reached the
counter by calling `window.restos.unlock('user-hina', '1234')` — which moves the session **without
ever rendering step two** — so `01-F61`'s **PIN pad had never been laid out in Blink at all**, on
any panel, in any mode. It is the surface an operator meets 20–60 times a shift, it is the
credential entry, `02-F18`'s idle lock returns her to it, and unlike every tab it has no
alternative route: a cashier who cannot sign in reaches nothing. The gate now presses Hina's
`PersonTile`, measures the pad in its arrival state, and leaves through the pad's own `Unlock`
key — the app's `chosen` state does the switching, so nothing here is a hand-copy of the
arrangement (`K-3`'s dead-oracle defect). **143 → 154 surfaces, 2585 → 2728 controls, 550 → 660
`27-F8` keypad targets.**

**No dependency was added** (`18 §15` rule 1): `electron` is already a devDependency and ships the
same Blink the product renders in. `@playwright/test` is on `18 §14`'s allowlist and would still
have been **wrong** — driving a headless page you *set* the viewport to 1366x768, and the
`useContentSize` defect is precisely that the app does not get 1366x768. Only the real window sees
it. Main is deliberately **not** real: it would drag in `better-sqlite3` and make a layout check
cost a native rebuild.

## ⚠ THE GATE JUDGED EVERY CONTROL AGAINST THE VIEWPORT ALONE — CLOSED (August 2026)

`AppShell`'s `<main>` and `index.html`'s `html, body, #root` all set `overflow: hidden`, so there
are at least two clipping boxes between any control and the viewport — **and the gate looked at
the last one only.** Measured on 1024x600 @10.1": **0 clipped controls reported on the Order tab
while five menu tiles were visibly sliced by the pager.** Both facts held at once. The only hint
was a box-level `OVERFLOW` line, which names the container and never says which controls the
operator loses.

`probe.ts` walks every clipping ancestor now and reports the per-edge loss under their
intersection. Two details are correctness rather than polish: `overflow` clips to the **padding
box**, and `getComputedStyle`'s border widths come back in the element's OWN units (dp inside
`PanelRoot`) while the rect is in post-zoom viewport px — so the scale is recovered from the
element itself (`rect.width / offsetWidth`). That is the unit mix that already produced a
negative slack in the extent check.

**`CLIPPED BY ANCESTOR`'s wording is load-bearing.** A `withinViewport` failure once concluded
*"this control cannot be touched"* for a key overhanging by 31 px of 126 whose centre hit-tests
fine; that sentence reached a `CLAUDE.md`, then a task brief, and an agent was dispatched to fix
a blocker that did not exist. The verdict states what is cut, by how much, what survives, and —
**SEPARATELY, and saying so** — whether the centre still hit-tests. It supersedes `COVERED` for
the same control rather than stacking, so one defect is one verdict.

`SurfaceReport.clippingAncestors` is the `24-F14` tripwire: three is the floor on every screen
here, and a surface with controls and zero of them FAILS rather than reporting a clean sweep of
`clippedBy: null`.

**Mutation matrix — the clipping check and the physical floor.** Control: shipped tree, gate
GREEN (91 surfaces, 1689 controls, 343 clipping ancestors), pos **461/461**, ui **261/261**. Each
mutant is exactly one branch, in-tree with byte-exact backups and a restore trap.

| # | mutant | gate | netbook Order clips | shipping-panel clips | pos 461 | ui 261 |
|---|---|---|---|---|---|---|
| M1 | **THE PAGER DEFECT VERBATIM** — `ItemGrid` costs its page at full height | **RED, 20** (18 `CLIPPED BY ANCESTOR` + 2 `OVERFLOW`) | **5** | **18** | **all green** | **all green** |
| M2 | **CONTROL** — M1 *plus* the pre-fix rail: viewport-only judgement | RED, **2** (the 2 `OVERFLOW` only) | **0** | **0** | all green | all green |
| M3 | **NEGATIVE CONTROL** — `StatusStrip` row gap `space-4` → `space-3` | **GREEN** | 0 | 0 | all green | all green |
| M4 | **THE SEAM, STUBBED** — `index.ts` `panelFit: () => null` | **GREEN** | 0 | 0 | **460** (1) | all green |
| M5 | **THE CLAMP REMOVED** — the BYO ruling undone in one branch | **GREEN** | 0 | 0 | **460** (1) | all green |
| M6 | **`24-F14`** — `clipOf` never finds a clipping ancestor | **RED, 91** EMPTY MATCH, `0 clipping ancestors walked` | 0 | 0 | all green | all green |

**M1 against M2 is the attribution and the whole point of the task.** They differ in exactly one
branch — the ancestor walk — so the **18 fatal verdicts and 5 probe verdicts belong to the new
check and to nothing else.** What the old rail did catch (M2's 2 rows) names a BOX: *"this div
holds 912px of content in an 884px box"*. What it could not say is which eighteen tiles a cashier
loses, by how much, and whether they still respond.

**Mutation matrix — `01-F61`'S UNLOCK PAD ENTERS THE SWEEP (August 2026).** Control: gate GREEN,
**154 surfaces, 2728 controls, 660 keypad targets, 11 panels**; pos-electron **556/556**, ui
**280/280**; `pnpm verify` exit 0; `pnpm test --force --continue --concurrency=3` **2854 / 24 of
24**. In-tree, byte-exact backups, `shasum`-verified restore, both full suites under every mutant.
**The right-hand columns are the finding.**

| # | mutant (exactly one branch) | gate | unlock verdicts | pos 556 | ui 280 |
|---|---|---|---|---|---|
| U1 | **THE DEFECT VERBATIM** — the fixture back to programmatic `unlock()` | **RED, 1** (`24-F14` lock steps) | 154→**143** surfaces, 660→**550** targets | **all green** | all green |
| U2 | **THE 27-F8 TRUE POSITIVE** — the unlock pad's twelve cells `keypad`→`counter` posture | **RED, 110** | **110**, `unlock:pin` on all 11 panels, at **12.14 mm** | **all green** | **all green** |
| U3 | **CONTROL for U2** — U2 *plus* the pre-fix fixture: the OLD rail against the new defect | **0 of the 110** | **none** | all green | all green |
| U4 | **THE CLIPPING TRUE POSITIVE** — `STEP_TWO` stacks identity above the pad | **RED, 16** | `Clear`/`0`/`Unlock` **UNREACHABLE** on `tablet-10.1` + `netbook-1024` | **all green** | **all green** |
| U5a | **`24-F14`, app half** — `App.tsx` never advances past step one | **RED, 74** | 11× *no PIN pad came up*, 11× *no `Unlock` key*, 1× lock steps | 541 (**15**) | all green |
| U5b | **`24-F14`, fixture half** — `preload.ts` serves an empty roster | **RED, 86** | 11× *no roster tile*, 1× lock steps | **all green** | **all green** |
| U6 | **NEGATIVE CONTROL** — a real refactor of the lock block into two early-return helpers | **GREEN**, numbers identical to control | 22, unchanged | all green | all green |

**U2 against U3 is the attribution, and it reproduces the finding that motivated the work.** They
differ in exactly one branch — whether the fixture walks through the pad or around it — so the
**110 verdicts belong to the new coverage and to nothing else.** U3's number is the one to
remember: under the old rail an unlock key rendered at **12.14 mm against `27-F8`'s 20 mm floor**
— 39% under the ergonomic floor, on the surface that gates every other — and the gate found
**nothing**, because the surface was not in the sweep. That is the historical 13.88 mm mutant
being caught on `escalation:pin` and nowhere else, re-measured.

**U1 is why the lock-step tripwire exists, and it was added because the mutant asked for it.**
`MIN_SURFACES` sits one whole panel low by design, so dropping one surface from *every* panel
still clears it: 143 against a floor of 140. The first draft of this work therefore had U1
passing **GREEN with a healthy-looking total** — the same silence that hid the pad in the first
place. `lockStepsMeasured` demands `2 × PANELS.length` and names the count. **Reading the diff
would not have found that; running the mutant did.**

**U5a and U5b are the same surface leaving coverage by two different doors, and their right-hand
columns are the point.** The app-half defect is *structural*, so happy-dom sees it (15 `pos`
tests). The fixture-half defect is invisible to **all 836** tests, because no suite has an
opinion about a fixture — only the gate's own `24-F14` tripwires catch it, and they fire 12
times rather than sweeping zero surfaces and passing.

**U4's columns are this gate's thesis on a new surface:** three controls a cashier must press to
sign in are genuinely off the glass on two SHIPPING panels, and **all 836 tests stay green.**
It is defect 5's shape (`ManagerApproval`'s dead `Approve`) one surface along.

**U6 is what makes every red row mean anything** — a genuine restructuring of the very block
under test reddens nothing and reproduces the control's numbers exactly, so the gate is holding
behaviour rather than shape.

**What the pad measured, and it is a clean result rather than a defect hunt:** 13 controls, zero
violations, on all eleven panels — `probe-below-floor` (202 × 118 mm) included, where `tab:Pay`
has three controls UNREACHABLE. It fits where the counter surfaces do not because it carries no
`AppShell` chrome at all: no status strip, no tab rail, no `03-F5` band, and `02-F18` gives it
the whole panel. So the two small panels that just came into range (`tablet-10.1`,
`netbook-1024`) needed no arrangement change and **no target was moved** — `27-F68` (b) is not
engaged.

**M1's right-hand columns are the second finding: 722 tests cannot tell the pager defect from its
fix.** Only the gate sees it.

**M3 is what makes every red row mean anything** — a real one-branch geometry edit to shipped
chrome reddens nothing, so the gate discriminates rather than firing at any change.

**M4 and M5 are GREEN on the gate on purpose, and that is the honest limit.** The gate drives its
own preload fixture, so a main-process seam going to a stub is structurally invisible to it —
`seams:check` Rule B is satisfied by any supply and `() => null` is a supply. Exactly **one test
in this repo** separates each from the shipped wiring, and it is `panel-fit-seam.test.ts`.

**Mutation matrix — the composition check's FIT precondition.** Control: gate GREEN, 91 surfaces,
**145 axes judged, 9 not judged** (all nine on the two below-floor panels, all nine already
carrying fit verdicts, so the pairing guard stayed silent). Two of the nine read `-21dp / -21dp`
— **symmetric overflows that the OLD check passed at asymmetry 0**, which is the closed form
confirmed in the live tree rather than on paper.

| # | mutant | gate | ANCHORED, by panel |
|---|---|---|---|
| N0 | **DIAGNOSTIC** — `safe center` → `center`, gate untouched | **GREEN** | none — the *worse* layout passes |
| N1/N2 | `<main>` dumps 240 dp of slack at the bottom — a real composition defect | **RED, 13**, exit 1 | **`laptop-1280` 6** (ABOVE the floor) · **`netbook-1024` 4 + `tablet-10.1` 3** (BELOW it) |
| N3 | the precondition retires every axis — the back door | **RED, 141** EMPTY MATCH, `0 axes judged` | — |

**N1/N2's second half is the load-bearing one.** A composition defect above the floor is still
fatal; a composition defect BELOW the floor on content that **fits** is *also* still fatal — which
is what separates "the check has a precondition" from "small panels are exempt". A floor-based
exemption would have silenced those seven. Under that mutant **zero axes were skipped on any
shipping panel**, so the precondition removed nothing from its detection: the counter panels
simply passed, because 240 dp of dead space is under 25% of their taller box.

**N0 is the diagnostic that made the case, and it is the reason this is a soundness fix and not a
suppression.** Reverting one keyword produces a strictly *more* damaged surface by the gate's own
reckoning — three controls unreachable become zero, but 46 dp is still lost and six controls are
still clipped — and the composition check goes quiet. A verdict that flips on where an overflow
was cut is measuring the cut, not the composition.

**It sweeps ELEVEN panels** (`DEC-UI-001` (e), extended August 2026 — this said SEVEN), reloading
between each so every one gets `03-F5`'s band rather than inheriting an acknowledged one:

| row | window px | diagonal | glass | mode | ships |
|---|---|---|---|---|---|
| `counter-1366` / `counter-1920` | 1366x768 / 1920x1080 | 15.6" | 345 x 194 mm | counter | yes |
| `laptop-1280` | 1280x800 | 13.3" | 286 x 179 mm | counter | **yes** — the BYO device the app used to refuse |
| `laptop-13.3-hd` | 1366x768 | 13.3" | 294 x 166 mm | counter | yes — same diagonal as the row above, **different glass** (16:9 vs 16:10) |
| `laptop-12.5` | 1920x1080 | 12.5" | 277 x 156 mm | counter | yes — **the tightest `counter` panel**, 6 mm over the mode's height threshold |
| `tablet-11.6` | 1366x768 | 11.6" | 257 x 144 mm | compact | yes |
| `tablet-10.1` / `netbook-1024` | 1366x768 / 1024x600 | 10.1" | 224 x 126 / 221 x 130 mm | compact | **yes** — the cheap Android class, and the shortest/narrowest that work |
| `probe-below-floor` | 1024x600 | 9.2" | 202 x 118 mm | compact | **no — the failing case the floor rests on** |
| `desktop-24` | 1920x1080 | 24" | 531 x 299 mm | wide | yes |
| `ultrawide-32` | 3840x1080 | 32" | 782 x 220 mm | wide | yes |

The four middle rows were added to close the 130–174 mm height gap the floor sat inside;
`probe-below-floor` exists because every other row is evidence that hardware WORKS, and a floor
is a claim about hardware that does not. **If `probe-below-floor` ever goes quiet, the floor has
become too conservative and should come down** — the anti-rot direction this table never had.

The two counter rows are the same 13.6 x 7.6 inches of glass, so under `27-F68` they must hold
the SAME layout at different pixel counts; that is `27-F11c` stated as a test rather than as
prose, and it is the assertion a pinned pixel constant cannot pass. The two 10.1" rows are the
same argument from below — 78% apart in pixels, identical verdicts.

**`phone-6.5` is deliberately absent and must stay absent** until a portrait layout exists: it is
69 x 150 mm, it fails two COMPOSITION checks, and those bind regardless of `ships`. Weakening the
gate to admit a panel is backwards.

**⚠ The fixture menu is 46 items and that number is load-bearing.** At 24 it fit on ONE page of
every shipping panel, so `ItemGrid` never drew a pager on any of them and the pager was
measurable only on a `ships: false` probe — where FIT verdicts are downgraded by design. That is
how the M1 row above went from PASSED to RED. `02-N2` specifies a 300-item catalogue and
`27-F11a` sizes a tab at ~25 items, so 24 was smaller than the product's own design case.

**And it has ONE check that is not about fitting:** `27-F8`'s keypad target measured in
**millimetres of glass**, with the density read back out of the same seam the renderer was handed
it on. Every other check asks whether a thing FITS, and 126 CSS px fits a 1920x1080 panel
perfectly while being 22.7 mm instead of 20. Current run — **154 surfaces, 2728 controls, 660
keypad targets across 11 panels** (this line said *26 surfaces, 450 controls*, measured five
rounds of panels ago; the gate prints the true figures on every run and they should be read off
it, never carried forward):

```
  [1366x768]  126 dp keypad =  79.1 css px at 200.9 PPI = 20.00 mm
  [1920x1080] 126 dp keypad = 111.2 css px at 282.4 PPI = 20.00 mm
```

(The PPI figures are high because the gate SIMULATES those panels on a Retina host: it derives
the density from the window it actually has — `css px x devicePixelRatio / 15.6"` — rather than
typing one in, so 200.9/2 = 100.5 and 282.4/2 = 141.2, which are `27 §1a`'s own numbers. A gate
that typed `100.5` on a dpr-2 machine would render every target at half size and pass.)

**Mutation matrix — the shipped defects, re-introduced one at a time.** Control: gate GREEN on
the correct tree (**pos-electron 379/379, ui 234/234**). **The last column is the point.**

| # | mutant (one branch each) | gate | pos-electron 379 | ui 234 |
|---|---|---|---|---|
| — | `index.html` `box-sizing`; `TenderPanel` one column; `useContentSize` off | **RED** (the 2026-07 round; 7 / 9 / 1 violations) | all green | all green |
| M1 | **CONTROL** — `PanelRoot` applies no `zoom`: the pre-ruling tree, dp ≡ css px | **RED**, 12 | 378 (§B only) | all green |
| M2 | **THE SEAM** — `App` stops wrapping its tree; `PanelRoot` correct and unreached | **RED**, 12 | 378 (§B only) | all green |
| M3 | **PINNED 79 px** (`27-F68` (a)) — `cssPxPerDp` returns `0.628` on every panel | **RED**, 1 — *1920x1080 only* | **all 379 green** | all green |
| M4 | **THE PLANE** — `gateway.ts` drops `panelPpi` from `DeviceState` | **GREEN** | 378 (§B only) | all green |
| M5 | **THE MM FLOOR** (`27-F68` (b)) — `touch-keypad` trimmed 126 → 100 dp | **RED**, 2 | 378 | 231 |
| M6 | **DEFECT 5 VERBATIM** — `ManagerApproval` restored to its pre-fix file | **RED**, 6 | **all 379 green** | all green |
| M8 | **THE FIXTURE** — `escalationFor` back to `() => null` | **RED**, 2 (`24-F14` EMPTY MATCH) | all green | all green |
| M7 | **NEGATIVE CONTROL** — identity column 320 → 400 dp, a real layout edit | **GREEN** | all green | all green |

**M7 is what makes every red row mean anything**: a real one-branch layout edit does not trip the
gate, so it discriminates rather than reddening at any change.

**M3 is the row that justifies the second panel, and nothing else catches it.** The pinned
constant is right on 1366x768 and renders `27-F8`'s 20 mm target at **14.23 mm** on the 1920x1080
panel `27 §1a` also lists — 29% under the ergonomic floor, on the highest-consequence entry
surface in the product — and **all 613 tests stay green**. Without `DEC-UI-001` (e)'s second
panel the trap that FR forbids by name would have shipped through a green rail.

**M4 is `seams:check` Rule B's blind spot on a new field.** Main is a stub in the gate, so the
plane boundary going silent is invisible to it — only the hand-written
`__acceptance__/panel-density.test.ts` §B sees it. M1/M2/M4 are three different failures of one
seam and none subsumes the others.

**M6 is defect 5, and the pre-existing suites are the finding.** Restoring the pre-fix file gives
`1162px of content in a 987px box` and `Cancel` genuinely **UNREACHABLE** (overhanging by 97 px,
centre off-screen) — and **not one of the 379 + 234 tests can tell it from the correct
implementation**, including the 12 this work added. Only the gate sees it, and only because the
fixture reaches it: M8 shows that reverting one fixture line takes the whole surface back out of
coverage — caught as an `24-F14` EMPTY MATCH rather than as a silent pass, which is the property
that line lacked the first time.

**⚠ M6's FIRST DRAFT SURVIVED, and that is worth more than the row it replaced.** The first M6
stacked the *fixed* composition vertically (`flexDirection: "column"`) instead of restoring the
*pre-fix file*, and the gate stayed GREEN — because the fixed composition has two `counter` tiles
where the original had three `keypad` ones, so it fits either way round. A mutant that does not
reproduce the defect proves nothing about the guard, and reading it would not have told you: only
running it did. Whole-file restore from git is what made the row real.

**✅ THE FOURTH DEFECT IS CLOSED (August 2026, `DEC-UI-001` / `27-F68`), and the register is
EMPTY.** `tab:Pay` and `tab:Cash` came out of `OWED_UNDER_ALARM` because **the gate refused to let
them stay**: its anti-rot rule fired with *"STALE REGISTER … it now lays out cleanly"* the first
time the founder ruling's conversion ran. Nothing was relaxed — same measurement, same tolerance,
same two states. What changed is arithmetic: a 126 dp key is **79 px** on this panel, the pad is
**340 px** and not 528, and the work area under `03-F5`'s band holds it with room.

| surface, band up | before | after |
|---|---|---|
| Pay `main` | 594 px of content in a 530 px box | fits |
| Cash `main` | 584 px in 530 — **`Counted Rs 0` entirely off-screen** | fits, `Counted` on screen |
| `C` `0` `⌫` | clipped 126 → 95 px (Pay), 112 px (Cash) | not clipped on either |

**The history below is kept as a worked example and no longer describes the tree.**

**⚠ ITS FIRST DESCRIPTION, INCLUDING THE ONE THAT STOOD HERE, WAS WRONG.** This paragraph used
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

**Why it stood REPORTED for a round — the reason was arithmetic, not judgement.** The keypad was
4 × `targetFor("keypad")` + 3 gaps = **528 px**; under the band `main`'s content box is **498 px**.
*The pad alone did not fit*, before any label, DUE figure, TAKE CASH button or padding — so no
overlay, reflow or reordering of these surfaces could close it, and every "budget" remedy that
looked available was arithmetically dead. That made it a spec question rather than a pixel choice
(commandment 9), and the founder ruled it: **`DEC-UI-001`**.

**✅ THE FIFTH DEFECT IS ALSO CLOSED — but NOT by the conversion alone, and the difference is the
lesson.** `ManagerApproval`'s PIN step laid out **1162 px in a 632 px box quiet** (530 with the
band), so `Approve`, `Not them?` and `Cancel` sat entirely below the viewport in **both** device
states — `02-F20`'s local manager-PIN path, the only escalation route that exists since doc 05's
remote one is unbuilt, was dead on arrival at every till, with `05-F19`'s over-threshold paid-out
as the live case reaching it.

`27-F68` turns the work area from 530 px into **987 dp** and the stack is still **1162 dp**, so it
overran even after the ruling — measured, not predicted (mutation row M6 above). It needed the
`27-F4` positional change `DEC-UI-001` named: *"three trailing full-size buttons cannot all be
keypad-posture under a keypad in a 768 px panel."*

**`27-F4` is a breaking change and it requires PR justification. Here it is, and a reviewer should
accept or reject it explicitly.**

1. **There is no positional memory to break.** That FR protects an operator who learned a layout;
   `Approve` has never been on screen for anyone to learn, in either state, since the surface
   shipped. The acclimation window it asks for costs nothing because no arrangement is in service.
2. **The change moves TOWARD `27-F4`, not away from it.** The file claimed to be *"`App.tsx`'s
   composition, deliberately identical"* and was not: the unlock pad is `1-9, Clear, 0, Unlock`
   — `Clear` bottom-left, the confirming act bottom-right, where `NumericKeypad` also puts its
   twelfth key — while this pad was `1-9, 0, Clear` in a wrapping row, putting `0` where the other
   pad puts `Clear`. `App.tsx` names that exact hazard: *"two pads on one device that disagree
   about which cell closes an entry is the muscle-memory break `27-F4` exists to prevent."*

The shape is `App.tsx`'s two-column composition, for the reason `App.tsx` gives: the pad's own
height is the tallest fixed thing on the surface, so everything else sits BESIDE it. `Not them?`
and `Cancel` move to `counter` posture on the identity side — `27-F9`, a column away from `Clear`,
which is where `App.tsx` already puts `Not you?`.

**The gate can see this surface now**, because the fixture reaches it: `escalationFor: () => null`
is gone and the gate drives `05-F19`'s paid-out through its real three taps (reason → receipt
photo → Paid out), measuring both escalation steps on both panels.

**WHAT THE GATE CANNOT CATCH — do not read a green run as "the screens are right".**
1. **Main is a stub.** It says nothing about IPC, Zod validation at the plane boundary, or whether
   the shipped preload serves the same channels. `main/__acceptance__/` owns that.
2. **It only sees the states the fixture produces.** Defect 4 was invisible until the fixture
   served an alarm; a surface state nobody scripted is a surface state nobody measures. The
   fixture is the gate's real coverage boundary, not the assertions. **This has cost a real
   defect and not just a hypothetical one** — `escalationFor: () => null` meant `ManagerApproval`
   never rendered, and defect 5 (a manager who cannot approve, in *both* states) sat unmeasured
   behind that one line. Both are fixed and the boundary has not moved: **mutation row M8 shows
   that putting that single line back takes the whole surface out of coverage again**, now caught
   as a `24-F14` EMPTY MATCH rather than as a silent pass. **It cost a THIRD one, and that one was
   not a line of fixture data but a line of fixture NAVIGATION** — the programmatic `unlock()`
   call, which walked past `01-F61`'s PIN pad rather than through it (see the unlock-pad matrix
   above). Worth separating, because the first two are answers a stub gave and this was a route
   the fixture took: **grep the fixture for calls that reach a destination the operator reaches by
   pressing something**, not only for stubbed reads. The states still NOT scripted are the ones to
   worry about — an open shift with a counted drawer, a 300-item catalogue, a refused escalation
   showing `REFUSAL_WORDS`, training mode's `27-F67` inversion, and on the unlock pad specifically
   **a PIN part-keyed and `01-F61`'s refusal line** (`preload.ts`'s `unlock` resolves any known
   user, so the fixture cannot currently produce a refusal at all).
3. **It does not judge legibility or contrast — a control can be reachable and still unreadable.**
   There are now **two** exceptions and this line used to say there were none. **`27-F8`'s target
   size**: since `27-F68` the gate measures a keypad target in millimetres of glass on every panel
   and fails below 20 mm ± 0.6. **`27-F26`'s typeface** (August 2026; this item said *"`27-F26`'s
   missing webfont is untouched"*, which stopped being true when the face was bundled): the gate
   asks `document.fonts` whether all three weights are LOADED, whether the token family renders
   differently from a family that does not exist, and whether the digits are tabular and `I ≠ l`.
   It still judges **nothing** about size-vs-distance (`27-F27`), contrast, or whether a human can
   read the result.
   - ⚠ **`document.fonts.check()` cannot be the assertion, measured not reasoned.** With no
     matching `@font-face` it has no face it can call unloaded and returns **true** — confirmed
     under the mutant, where it reported `true` beside zero loaded weights and identical fallback
     widths. A check built on it alone would have been vacuous in exactly the state it existed to
     catch. The gate prints it and branches on nothing.
4. **Two panels, one DPI, one platform.** `27 §1a`'s 1366x768 **and** 1920x1080 are both swept
   (`DEC-UI-001` (e)) — but both are SIMULATED on a macOS host at devicePixelRatio 2 with a
   derived density. The **Windows till this ships to is still not measured**, and font metrics
   differ there (Segoe UI vs SF Pro), which is exactly the kind of thing that moves a layout.
   Nor is any non-counter surface: `27 §1a`'s ~224-PPI tablet and ~405-PPI phone rows are where
   `27-F68` makes targets *grow* by 1.4x and 2.5x, and no rail looks at either.
5. **`27-F4`'s positional contract is invisible to it.** Controls may be reordered freely and the
   gate stays green as long as they all fit.
6. **It needs a display.** Electron opens a real (hidden) window; a headless Linux CI needs xvfb.
   Per `T-01-07` that is a LOUD failure, never a skip — an environment prerequisite, not a
   regression.

## ✅ THE BUDGET WAS OVER-SUBSCRIBED; THE RULING LANDED AND IS IMPLEMENTED (defects 4 and 5)

**Read this section for the reasoning, not for the state of the tree.** `DEC-UI-001` is ratified,
`27-F68` is written, and the conversion ships: `packages/ui`'s `PanelRoot` is the one element in
the product where a dp becomes a pixel, `main/panel-density.ts` resolves the density it needs, and
both defects below are closed. **What to take from it:** the arithmetic that made four plausible
remedies dead, and the shape of the mistake — a spec that said *"design in millimetres, render in
pixels"* for three drafts while the code spent a dp as a CSS pixel and every gate stayed green.

**The one line that settled it: `51 + 85 + 102 + 528 = 766` in a `768` px panel.** Status strip,
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
tiles, so "needs more pixels" is the category error that FR exists to name.

**RULED (founder, August 2026): option A — `DEC-UI-001`, promoted into `27-F68`.** A dp is
**1/160 inch of physical size**, rendered through the panel's own density. The density is a
`00 §7` **layer-3** key, `panel_ppi` — *measured from the display*, configured only to correct a
panel that reports nothing or reports wrong (**layer 3, not the layer 2 this section guessed**:
one org runs many different panels, and pinning an org-wide PPI is the same category error one
level up). *"Ships 1920×1080 only"* is rejected as exactly `27-F11c`'s category error. `27-F68`
forbids both traps by name: **no pinned 79 px** (it is 14.2 mm on the 141-PPI panel) and **the
floor stays in millimetres** (`27-F8`'s 20 mm is what it *is*; this changes only how it renders).

### ✅ IMPLEMENTED (August 2026) — where the conversion lives and what it cost

**One boundary: `packages/ui`'s `PanelRoot`,** applied at the app root in `App.tsx` so it wraps
the unlock gate, the counter shell, the strip, the rail, `03-F5`'s band and `ManagerApproval`.
Not inside `AppShell`, because `02-F18`'s lock surface sits OVER the shell and would otherwise be
the one screen still drawn at the wrong physical size, 20–60x a shift.

**The mechanism is CSS `zoom`, and the trade-off was measured rather than argued.** Blink resolves
every length in the subtree against it, so tokens, component internals, host numbers and chrome
convert together and **there is no call site for a session to forget** — which is `DEC-UI-001`
(b)'s named next error. The alternatives were rejected on correctness: a root `font-size` + `rem`
boundary and a computed token layer both convert only what a call site remembers (~200 numeric
style values in `packages/ui`, and a missed one renders silently unscaled), and `transform:
scale()` does not move a layout box at all — the keypad would still be 528 px inside a 498 px
area, hiding the defect behind a visual while `elementFromPoint` disagreed with the paint.

**What `zoom` does to measurement, because the gate depends on it** (measured in Blink at
`zoom: 0.628` in a 1366x768 window): `getBoundingClientRect` and `elementFromPoint` report
**post-zoom viewport pixels**, so the gate keeps measuring real pixels at real positions — that
property is what decided the choice, since a conversion the gate could not see would be a green
gate over a wrong screen. But `clientWidth` / `scrollHeight` / `getComputedStyle().width` report
the element's **own units, i.e. dp**. Both sides of an overflow comparison are in that same unit
so the verdict is unaffected, **but the numbers the gate prints are dp** — read
`OVERFLOW y: … 1162px of content in a 987px box` as dp, not CSS pixels.

**The density input** is `00 §7` layer 3, resolved in `main/panel-density.ts` in that FR's own
order — **measurement, then correction, then an admission**. Electron gives resolution
(`display.size × scaleFactor`) and **no physical size**, so the inches come from the platform:
`WmiMonitorBasicDisplayParams` on Windows (the ship target), `xrandr` on Linux, and **nothing on
macOS** — checked, `system_profiler SPDisplaysDataType -json` reports pixels and a product id and
no millimetres. So on a dev Mac the panel genuinely "reports nothing" and `RESTOS_PANEL_PPI` is
the answer; without it the boot line says `assumed` at length, because being wrong here looks
exactly like being right.

**Two things the conversion closed for free.** `usePhysicalSize` measured through the CSS
reference 96 PPI, so the same 15.6" panel reported **361 mm at 1366x768 and 508 mm at 1920x1080**
— the reading `27-F11c` exists to forbid; it reports 345 mm on both now. And `OrderList`'s
recorded dp-as-px / dp-as-mm duality (76 dp = 76 px while the same posture's 12 mm = 45 px) is
gone: there is one conversion. **That closed `layout-physical.oracle.test.ts`'s written FINDING
in principle**, but see the owed item below — the manifest table itself was not restated.

**Owed, and named rather than left to look intentional:**
- **`tokens.json`'s `mm` column is not yet restated from `27-F68`.** The FR gives 76 dp = **12.1**
  mm and 96 dp = **15.2** mm; the manifest still says 12 and 15. Nothing depends on the
  difference today (`layout-physical.oracle.test.ts` compares at 0 decimals and passes either
  way), and correcting it is a tokens change with `tokens.test.ts`'s posture-table derivation in
  its blast radius — a separate, surgical piece of work.
- **`OrderList`'s `actionFloorMm` is now effectively dead.** `orderPageRows` throws below
  `targetMm("counter")` = 12 mm and the floor is 12.065 mm, so it can only change an outcome
  inside a 0.065 mm window. It is kept (it still expresses "a row contains its action") and the
  assertion that used to separate it was rewritten — see the note in `order-list.dom.test.tsx`.
- **The handhelds are unmeasured.** `27-F68` makes targets *grow* on anything above 160 PPI:
  `27 §1a`'s ~224-PPI tablet and ~405-PPI phone are 1.4x and 2.5x their old rendered size. No
  rail looks at either, and `apps/waiter` / `apps/rider` are stubs.

## THE GROUPING ROUND (August 2026) — Cash, Me, Orders and ManagerApproval, and what LOOKING cost

**Read this for the two measurements, not for the prose.** The four surfaces were *composed* and
not *designed*: the Cash tab in particular was **eleven sibling `Tile`s in three wrapping rows on
a bare page**, where day controls, shift controls and the paid-out sequence read as one
undifferentiated field and nothing on the glass said that `Supplier` and `Receipt photo` are
preconditions of `Paid out`. All four now build from `packages/ui`'s new `Panel` — a bounded,
captioned region — and the paid-out is a sub-region inside The drawer.

**1. HEIGHT IS THE HARDWARE FLOOR AND CASH SETS IT.** A parallel sweep measured chrome at 37.4 mm
and Cash at 94–96 mm of work area, so **this one surface decides which glass can run RestOS**
under the founder's bring-your-own-hardware ruling. Two decisions in `CashSurfaces.tsx` follow
from that and are not styling: the entry instrument carries **no `Panel`** (its caption, gap and
padding are 64 dp ≈ 10 mm, landing straight on the floor), and the amount readout moved from
UNDER the pad to BESIDE it — a `27-F4` positional change, justified in the file, taking the entry
band from 632 dp to **536 dp = 85 mm**. `COUNTED Rs 0` was also the measured casualty of the old
position: cut in half at 1024×600 on 10.1″ glass under `03-F5`'s band.

**The groups flow in a `flex-direction: column; flex-wrap: wrap` container at the work area's
height, so the column count is derived from the glass and never written down.** A wrapping ROW
was tried first and MEASURED WORSE — a 536 dp pad on line one makes anything on line two cost its
full height (964 dp of content in a 638 dp box on the 10.1″ panel). Three arrangements were built
and measured before this one; two of them looked fine in a screenshot and failed the gate.

**2. `safe center`, and what it exposed.** `Counter.tsx`'s work-area centring is
`alignItems: "safe center"` now. With content taller than the box a plain `center` overflows in
**both** directions — that is how a keypad row rendered at `y = -33` — and the sweep's own words
for it are *"the cut is split top and bottom, which is why no control is reported lost even
though content is being lost."* ⚠ **It also means the gate's composition check can now SEE a
too-tall surface as ANCHORED, where a centred overflow used to read as symmetric slack and pass.**
That is a property of the gate worth knowing: **`center` hides an overflow from the composition
check; `safe center` shows it.**

**⚠ THAT OBSERVATION WAS RIGHT, AND IT WAS A GATE DEFECT RATHER THAN A PROPERTY — CLOSED (August
2026).** This branch was green on the 65-surface rail and the seven-panel rail was green on its
own; **together they were RED**, on one verdict: `tablet-10.1 tab:Pay` ANCHORED y, with **−105 dp**
of slack on the bottom. Negative slack is not leftover room, and every sentence of the composition
check's own design note presupposes there is some (*"centred in a surface LARGER THAN IT"*).

The closed form: with overflow `D > 0`, `top + bottom = −D` always, so asymmetry is `|2·top + D|`
— **0 for a centred overflow of ANY magnitude**, and `2·padding + D` for an edge-anchored one. On
overflowing content the check was **a function of the alignment mode and not of the loss**, so it
**passed the arrangement that hides its loss above the viewport and failed the one that puts it at
the bottom edge**. Measured by reverting this one keyword on the shipped tree: `center` → 46 dp
lost, 6 controls clipped, **0 unreachable**, gate **PASSED**; `safe center` → 108 dp lost, **3
controls UNREACHABLE**, gate **FAILED**. Its verdict text also asserted *"It FITS and every
control is reachable"* on a surface holding 593 px in a 485 px box.

`judgeComposition` now requires the content to fit, **per axis** — stated as the measurement's own
precondition, naming no panel, no `ships` flag and no size floor, so `counter-1366` and
`tablet-10.1` are treated identically. **Nothing is silenced**: the fit checks already own an
overflowing surface and name the controls, and an `OVERFLOW` is FATAL on a shipping panel. The
`24-F14` guard asserts that pairing rather than assuming it (a skipped axis with no fit verdict is
an EMPTY MATCH — `scrollHeight` cannot see an upward-only overflow), plus a floor on judged axes.
**So the sentence above is now true of the FIT checks, which is where it belonged: `safe center`
shows an overflow to the gate. It is the ANCHORED verdict that must not be the one showing it.**

**3. THE FIXTURE WAS `{ shifts: [], days: [] }` AND ONE ORDER, so four states had never been laid
out by anything but happy-dom.** `main.ts`'s own blind-spot list names *"an open shift with a
counted drawer"* as unscripted, and it was worse than that: with an always-empty inbox,
`OrderList`'s `action` — `02-F9`'s Accept tile — had **never been measured by this gate at all**,
on a component whose recorded defect is an accept tile overflowing its row. `preload.ts` now
carries an open day, an open shift, a closed shift with a signed variance, `02-F43`'s unbound
bucket, a second open order and an unaccepted storefront one. **It earned its place immediately:
it turned three plausible arrangements red, and the control run proves the fixture itself is
sound — the PRE-fix layout passes the gate under it.**

**4. A `27-F7` DEFECT FOUND BY LOOKING, IN THE FIX FOR `27-F7`.** The Orders tab now says its
ordering rule out loud (`oldest first`) because that FR makes a list's visual order its work
order and an operator had no way to know `03-F46`'s rule was in force. The first draft drew the
note whenever the list had more than one row — and the very first screenshot showed it over
`A-015` above `A-014`, because `byOldestConfirmFirst` sends a row with **no** confirm anchor to
the end (`01-F54`). A caption asserting a rule the rows do not follow is worse than no caption.
It now renders only when every row carries the key it is sorted by. **The inbox deliberately gets
a COUNT and no ordering rule**: its work order is arrival order, every row in it is unconfirmed,
and the projection carries no created-at — so this device cannot know it, and saying so would be
the placeholder-that-looks-like-data commandment 2 forbids. Owed at the fold.

**5. `27-F16` WAS READ RATHER THAN ASSUMED FOR `ManagerApproval`, AND IT DOES NOT GOVERN IT.**
That FR is about MONEY and there is no money on that surface. `27-F14` governs it and names the
claimant **by name** — amber, *"abnormal, attention required … pending approval"* — so this is
the one surface in the app where the allocation is being spent on exactly what it was allocated
for. Three refusals, each on a resolving FR: **not red** (`27-F14`'s fault claimants are
enumerated and `03-F5`'s band owns red here); **not a blue `Approve`** (it would colour one pad's
twelfth key and not the unlock pad's, teaching two habits for one gesture — `27-F4`); and the
marker goes on the **identity column**, not around the surface, because the pad is 536 dp against
a 540 dp work area at the tightest swept panel and a `Panel` around both columns costs 64 dp the
surface does not have. That is defect 5's arithmetic, avoided rather than repeated.

**WHAT IS STILL OWED ON THESE FOUR, named rather than left to look intentional.**
- **`ManagerApproval` never says WHAT is being approved.** A manager keys a PIN against an act
  she cannot see. `05-F27` wants *"the pending request visible on the terminal without searching
  for it"* and `05-F5` lists what a remote interrupt card shows; the local path shows the roles
  and nothing else. `Counter.tsx` holds `pending.req` and could pass it, but rendering it needs a
  words table for event types (the `CATALOG_REFUSAL_WORDS` shape) and that is a vocabulary no FR
  supplies — commandment 2. **The single biggest remaining gap on these surfaces.**
- **`Me` prints a raw fold enum**: *"Taken with no shift open — `unbound_settlement`"*. The
  sentence carries the meaning and the code carries nothing an operator can use, but dropping it
  loses information a manager wants and `02-F37`'s anomaly set is not closed anywhere this screen
  can read. Needs the same words table.
- **The shift panel cannot say WHEN a shift opened or WHOSE it is.** `open_at` is branch-time
  epoch and the branch timezone is `00 §7` layer-2 config the renderer does not have, so a clock
  time would be a guess; `CashShift.cashier` is a `user_id` and the roster that maps it to a name
  is a bridge member the Cash surface's own oracle forbids it from reading. The direction doc's
  *"day open since 09:00 · Bilal on shift"* is therefore **half-owed at the seam**, not here.
- **Cash needs ~260 mm of width to stay one pad tall.** Below that the columns multiply and the
  surface grows. That is the number for whoever defines the mode below `compact`.

## ✅ A PRINTERLESS KITCHEN IS A SUPPORTED CONFIGURATION — `03-F22` / `03-F51` (August 2026)

**The harm removed, measured rather than argued.** With no printer, every transmit reported no
answer, `03-F4`'s budget exhausted, `03-F5` banded for ever with a repeating sound, `printing.ts`
appended a **permanent** `kot.print_failed` per exhausted job into an append-only ledger (`01-F1`),
`05-F3` alarmed the manager and `15-F14` paged vendor support on *"`kot.print_failed` rates"* — so
a restaurant that owns no thermal printer generated real, unbounded support load for ever, and
`15-F10` gated doc 14's go-live checklist on a printer so it could not finish onboarding either.
`03-F22` had specified the fix since Draft 1 (*"replace them per station — layer-2 choice"*) and
**nothing in the product ever read it.**

`main/station-routing.ts` is the whole decision: a `00 §7` layer-2 key (`RESTOS_STATION_ROUTES`,
e.g. `*=screen,tandoor=paper`) parsed into a per-station route of `paper | screen | both`. A
station routed `screen` **enqueues nothing** — no bytes, no attempt, no band, no ledger event.

**THE ONE LAW, and it is the thing to protect when you touch this:** *absence is decided BEFORE a
job exists, from configuration; failure is decided AFTER a job exists, from a transport outcome.*
The consult sits before `render()` and before `spooler.job()` in `confirmed()`, and appears nowhere
downstream. Move it later — into `reconcile`, into the transport, into a band filter — and the two
collapse, and the first real printer that dies at 20:40 on a Friday goes silent. `03-F5` is
untouched where paper IS the route.

**The tier is NOT consulted to decide what hardware exists** (`DEC-HW-003`). It reaches this feature
in exactly one expression, in `main/index.ts`, feeding `02-F31`'s answer to the CONFIGURATION-TIME
validator — and an `assumed` tier is passed as **`null`**, never as T1, because an assumption is not
a registry. Every shipped device is `assumed` today, so the check reports `unverified` and never
refuses. `03-F51`: *an unknown is not a blessing.*

**⚠ `seams:check` COULD NOT SEE THIS SEAM UNTIL 2026-08-10 — HALF CLOSED, and the surviving half
is the one that matters here.** Rule B opened with `if (groupOf(mod.file) !== "packages") continue;`,
so a factory declared in an APP had no Rule-B candidates: the rail was **exit 0 and CLEAN** with the
`routesToPaper` argument deleted from `main/index.ts` *and* with it stubbed to `() => true`,
reporting the same `5 optional seams` both times. Rule B walks `apps/` and `services/` now, so
**deleting the argument reddens the rail by name**. **Stubbing it to `() => true` still does not** —
Rule B asks whether a member was *supplied*, never whether what was supplied is real, and that blind
spot is untouched. So `__acceptance__/station-routing-seam.test.ts` §E is still the only thing
separating the real resolution from a literal, which is the case `03-F51` actually turns on.
(`CashPrinterDeps.append` carried the opposite claim about Rule B; it was false when written and is
true now, and `printing.ts` records both facts at the declaration.)

**`03-F9`'s CASH DRAWER IS NOT A FAULT, checked rather than assumed.** `cash.drawer_opened` is
emitted, authorized and folded, and **nothing executes a kick**: `packages/escpos` ships no
drawer-pulse encoder and no code path attempts one, so absence of a drawer costs nothing today.
The hazard is forward-looking and is recorded in `03-F51`: the kick rides the *receipt printer's*
RJ11, so whoever builds it inherits that transport and this exact defect unless the drawer is a
declared capability refused at configuration time.

**Mutation matrix — control 503/503 green (472 pre-existing + 31 new), `pnpm verify` exit 0.**
In-tree, byte-exact backups with a restore trap, full package suite under every mutant, run twice
with identical results. **The right-hand column is the finding.**

| # | mutant (exactly one branch) | new (31) | pre-existing 472 |
|---|---|---|---|
| M1 | **THE SEAM** — `index.ts` drops the `routesToPaper` argument (the pre-`03-F51` call site) | 1 | **all 472 green** |
| M2 | **THE STUB SUPPLY** — `routesToPaper: () => true` | 1 | **all 472 green** |
| M3 | **THE COLLAPSE** — the route is consulted in `reconcile`, after the job exists | 3 | **all 472 green** |
| M4 | **SILENT FAILURE** — `reconcile` drops its `failed` arm (`03-F5` weakened outright) | 3 | **9** |
| M5 | the guard inverted — screen prints, paper does not | 6 | 24 |
| M6 | **THE VALIDATOR** — an unknown roster reports VERIFIED | 2 | all green |
| M7 | **THE REFUSAL APPLIES** — a refused configuration is applied anyway | 1 | all green |
| M8 | **THE TIER MAPPING** — an `assumed` tier passed as `false`, not `null` | 1 | all green |
| M10 | **THE DANGEROUS DEFAULT** — the optional dep defaults to screen-only | 1 | 24 |
| M9 | **NEGATIVE CONTROL** — a real refactor of `routeFor`, no behaviour change | **0** | **all green** |

**M4 is the keep-them-apart row and its middle column is the reassurance:** making a genuine
printer failure silent reds 3 new *and* 9 pre-existing `03-F5` tests, so the FR is defended from
both sides and this work did not weaken it. **M3 is the same defect in the form this change makes
newly possible** — routing reaching a job that already exists — and **not one of the 472
pre-existing tests can see it.** **M9 is what makes every red row mean anything.**

**What is owed:** `apps/pass-kds` is still a one-file stub, so a screen-only station's lines reach
the branch queue projection (`kitchenQueue()`, filtered by the catalog's `station`) and **no screen
draws them**. That is the seam this work stops at deliberately: the data is already there, nothing
new is needed from the kernel, and what is missing is the surface and `03-F24`'s ready-signal
ownership. Until it exists, configuring a station to `screen` on a real branch means its tickets go
nowhere — which is why the boot line says so at length and why `03-F51`'s refusal exists.

## ✅ `03-F25`'s AGING TIMERS ARE ON THE POS T1 PANEL (August 2026)

`03-F25` names **four** queue surfaces — *"pass, KDS, POS T1 panel, manager console"* — and the
counter was the one with no timer at all: `AgeBadge` and `ageLevel` appeared nowhere in this app and
`OrderRow` carried no age field. On a T1 branch (`02-F40`'s *most deployments*) the Orders tab is the
only queue surface in the building, so a cashier could not tell a two-minute order from a
forty-minute one. The chain is `main/gateway.ts` `openOrders()` → `OpenOrder.aging` →
`OrdersSurface.toRow` → `OrderList` → `packages/ui`'s existing `AgeBadge`.

**Three decisions, each of which could have been made silently and must not be re-made silently.**

1. **`now` is BRANCH time, read in MAIN.** `wallClock.now() + branchTimeStatus().offset_ms`, the same
   expression `kitchenQueue()` two projections down already uses. `01-F43` permits the difference by
   name (*"All durations — kitchen age … are differences evaluated in branch time, so a uniform
   offset cancels"*); `01-F45` bans the raw device clock from a timing read model, and `18 §9` gives
   the renderer no channel to `branchTimeStatus()` — so a renderer that subtracted `Date.now()`
   would be reading exactly the banned quantity on the untrusted side of the plane. It is display
   arithmetic in the host, never a fold reading a clock (`01-F34`).
2. **The threshold table is `@restos/device-config`'s, and it USED to be an app→app import.** ⚠ This
   entry read *"`apps/pass-kds/src/main/aging.ts`, imported ACROSS THE APP BOUNDARY — and this is a
   NEW REVERSE EDGE, so the two apps now depend on each other's `src`"*, which was true until August
   2026 and is not now. `18 §2` states the dependency direction as a MUST (*"Apps NEVER import ...
   other apps"*) and `DEC-ARCH-001` rules EXTRACT at the moment a module acquires a second consumer,
   so `aging.ts` moved out of `apps/pass-kds` and `device-identity.ts`/`panel-density.ts` moved out
   of this app; all three are `packages/device-config` and **the cycle is gone**. The argument for
   reuse over a copy is unchanged and is not taste: `03-F14` describes ONE org policy, `05-F1` alarms
   the manager off *"the red aging threshold (03-F14)"*, and a counter reading neutral while the pass
   reads red and the console alarms is three surfaces disagreeing about whether the food is late. A
   copy would also duplicate a **judgement call the FRs do not state** — that module's pinned reading
   for takeaway, pickup and an absent type — which is the worst thing to hold in two places
   (`03-F40`'s two sensor bit layouts is the corpus's own instance). *The recorded conflict is
   resolved rather than deleted, because how it resolved is the transferable part:* the approved plan
   said move the file INTO this app, `orders-aging.test.ts` pinned it in the other one, and the
   answer was neither — a later suite (`apps/pass-kds/src/main/__acceptance__/shared-config-
   extraction.test.ts`) asserted the property both were arguing about (**one declaration, reached by
   both apps, in neither**) and the import specifier in that oracle changed while not one of its
   assertions did.
3. **THE AGE TICK IS IN `index.ts`, UNCONDITIONAL, AND MOVING IT INTO `sync.ts` WOULD BE A
   COMMANDMENT-4 VIOLATION.** `03-F25` says *timers*, and the gateway recomputing correctly on every
   call is only half of one — the renderer re-reads when main pushes `changed`, and every other push
   is a LEDGER event, so without a clock an order sits at `9 min` until the next append. `sync.ts`'s
   1 Hz loop is the obvious home and is wrong twice: it returns early unless the fold cursor moved
   (`if (now === lastSeen) return;`), and `createUplink` returns `offline()` with **no interval at
   all** when `RESTOS_CLOUD_URL`/`RESTOS_DEVICE_TOKEN` are absent — so the offline-first T1 till this
   FR is aimed at would have timers that never advance (`00 §5.1`, `01-F17`). `AGE_TICK_MS` is 1 s,
   matching `apps/pass-kds`; 5–10 s is imperceptible on a whole-minute display and is the named
   cheaper alternative if the re-render ever costs anything on real hardware.

**`RESTOS_AGING_THRESHOLDS` is now read by this app too** (`03 §7` layer 2, e.g.
`dine_in=8/16,delivery=12/30`), and `describeAging` is a fifth boot line for the same `00 §5.7`
reason as the four above it: a wrong threshold is **invisible from the screen** — every row still
shows a number and a colour, it just goes amber at the wrong minute.

**The layout gate is the only rail that can see this, and the fixture is what puts it in range.**
`layout-gate/preload.ts`'s `SECOND_ORDER` carries `aging: { minutes: 144, amberAt: 10, redAt: 20 }`
— past its own red threshold and three digits wide, because `27-F15`'s fault fill is the widest
state and `1 min` and `144 min` are different widths. Measured under xvfb across all 11 panels:
**176 surfaces, 3813 controls, ZERO new violations**; the verdict list is **byte-identical** to the
same run with the fixture's aging block removed, and the one failure is the pre-existing
`tablet-10.1 tab:Cash` (570 dp in 567). **That identity is only evidence because the gate was shown
to be sensitive to this element**: padding the badge until the row cannot fit turns the gate **RED
with 18 extra verdicts, all `tab:Orders1`, every one naming the aged row by its own text**
(`OVERFLOW x: div "A-015144mincounter · takeaway · 1 item…"` on all 11 panels) — while all 744
pos-electron and 303 ui tests stay green, because happy-dom lays nothing out.

**Owed, named:** `AGENTS.md` should carry the age tick's placement and its reason, because the next
tidy-up that folds it into `sync.ts` will be green.

## What is deliberately not real yet

- ~~**`27-F26`'S TYPEFACE IS NAMED BUT NOT DELIVERED**~~ **— CLOSED (August 2026).**
  `packages/ui/src/fonts` bundles IBM Plex Sans (Latin, 400/500/600, OFL 1.1) as base64
  `@font-face` rules and `main.tsx` calls `installFontFaces()`. `index.html`'s CSP gained
  `font-src 'self' data:`; without it the rules parse and every face is blocked, which looks
  exactly like success. **`18 §15` is satisfied rather than bypassed** — no npm dependency, `18
  §14` gains a vendored-asset row, and `18 §1`'s licence allowlist gained **OFL 1.1 scoped to font
  assets** because it did not list OFL at all. **Senior approval on that spec change is still
  owed.** Asserted, not assumed: `layout:check` measures `document.fonts` on all 11 panels
  (weights [400,500,600], 846.8 px against 744.9 px for an absent family).
  - ⚠ **THE SUBSET DOES NOT COVER THIS APP'S OWN SYMBOLS, and no bundle can fix it.** `⌫` (the
    keypad's backspace, a `27-F8` target), `◀`/`▶` (the pagers), `✓` and `→` are **absent from
    every IBM Plex Sans subset** — checked against latin, latin-ext, cyrillic, cyrillic-ext, greek
    and vietnamese, not assumed. Those glyphs are supplied by the OS permanently, so a residue of
    platform-dependent metrics survives exactly where the UI draws a symbol. If that ever needs to
    go, the answer is an icon component, not a bigger font.
- **Device identity is a marked DEV SEED** with stable ids, and it stays one — a device minting a
  fresh `device_id` per launch would fork its own outbox on every restart. **What changed in August
  2026 is the OTHER side:** the gateway can now admit this identity through a declared command
  (`pnpm -C services/sync-gateway provision-device`, `running-the-stack.md` §6b) instead of a
  hand-written `INSERT`, so bringing up a second till no longer requires SQL. **Nothing yet gives
  the device an identity of its own** — `01-F25`'s one-time pairing code is owed, which is why
  `DEV_IDENTITY`'s three UUIDs are still typed by a human on both sides and why the runbook's §0
  warning stands unchanged. Also owed here specifically: this app re-reads `RESTOS_DEVICE_TOKEN`
  from env on **every** launch and persists nothing, so `01-F47`'s silently-renewed credential is
  dropped on the floor. The FR puts that persistence in `sync-client` rather than the host app, in
  its own words, because *"any host that forgot to store it would brick its devices at TTL"* — and
  nothing bites for 90 days after a fresh mint, which is what makes it easy to leave unnoticed.
- **Reachability reports `down` for all three facts**, because no mesh or cloud session exists.
  `00 §5.7` requires the strip to report what is true; claiming a hub never contacted is the
  exact dishonesty that FR exists to prevent.
- **NO PRINTER IS ATTACHED, and the counter says so loudly.** K-7 wired `order.confirmed` →
  spooler → `03-F5`'s S1 band, and the transport it ships with (`unattachedPrinter`) reports
  that the printer did not answer on every transmit — because no USB, Bluetooth or TCP-9100
  transport exists (`18 §10`, K-8 owed). So **every confirm raises a print-failure band about
  20 s later**, naming the printer and the order. That is the honest state of this device, not
  a bug: `03-F5` forbids a silent KOT failure, and the alternative is a till that claims to
  have printed. The printer model is `RESTOS_KOT_PRINTER`, and its **default changed in August
  2026 (`DEC-HW-001` (1)): `no printer configured`, which resolves to `03 §7`'s conservative
  32-column record**, so an unconfigured till now takes `03-F49`'s refusal and `03-F34`'s S1 band
  ("needs 42 columns, this printer has 32") instead of failing later at transmit. **It defaulted
  to `TH230` before that, and the pin was a live defect rather than an awkward label:** `render()`
  lays out against the record it is handed, `TH230` claims 44 Font-A columns on 576 dots, so
  attaching `03-F10`'s baseline **BC-58U** (384 dots) without setting the variable produced a
  44-column ticket on 58 mm paper — **measured at 320 discarded dots and a whole word off the
  right edge**, which is exactly the silent degradation `03-F34` bans, aimed at the corpus's own
  named installed base. Every printing suite injects its own capability, so nothing ever evaluated
  the default; `__acceptance__/printer-default.test.ts` is the assertion, and it pins the PROPERTY
  (the default must resolve to a record claiming nothing) rather than the string.
  `RESTOS_KOT_PRINTER=TH230` restores the old behaviour for anyone who has one. The queue is
  **DURABLE as of August 2026**:
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
  ⚠ **THIS BULLET READ "Nothing MINTS a device token, though (`01-F47` admission is unbuilt) …
  both are manual steps in the runbook's §6b" AFTER PROVISIONING SHIPPED — and the bullet forty
  lines above it, in this same file, already said the opposite.** The product mints one:
  `pnpm -C services/sync-gateway provision-device --org … --branch … --device … --class …` is a
  declared command that issues the HS256 token **and** writes the unrevoked
  `kernel.device_registry` row in one act, seam-tested against a real Postgres
  (`provisionable.test.ts`), and `revoke-device` is its other half. §6b is that command now, not
  a `tsx -e` one-liner and an `INSERT`. **The shape is the one this file keeps recording:** the
  stale sentence is not merely out of date, it is a claim that an ADMISSION path is absent, which
  is the direction that invites a session to invent a second one or to route around the check it
  believes is missing. What is genuinely owed is narrower and is named in the DEV SEED bullet
  above: `01-F25`'s back-office pairing code (an owner still needs shell access on the service
  host), and device-side persistence of `01-F47`'s silent renewal. For a local launch with no
  gateway there is a **marked DEV SEED**, off by default like the roster:

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
- **✅ A STUCK CATALOG IS NOW VISIBLE TO THE CASHIER (August 2026) — `01-F56` / `DEC-SYNC-011`.**
  This entry used to read *"`Uplink.catalogRefusal` carries `01-F56`'s refusal out of the cloud
  session and **nothing consumes it**"*, and it was the twelfth instance of the wave's named
  defect: producer wired, consumer missing, every gate green. `seams:check` is structurally blind
  to that direction — it walks for unreached EXPORTS and unsupplied OPTIONALS, and here the
  export was reached and there was no option to leave unsupplied.

  **The chain now runs end to end:** `cloud-session.ts` → `Uplink.catalogRefusal` →
  `main/index.ts` (**the seam**) → `GatewayDeps.catalogRefusal` (REQUIRED, so a host that forgets
  it is a typecheck error) → `deviceState().catalog` → `Counter.tsx` → `AppShell` → `StatusStrip`
  → `packages/ui`'s new **`CatalogHealth`**.

  **Where it went, and why not the two obvious places.**
  - **Not `03-F5`'s S1 band.** `AlarmBand` clears on an attributed acknowledgement, which is right
    for an EVENT that already happened once. A refusal is a **STATE** — true until the catalog
    un-sticks — so an `I SAW THIS` would take a live condition off the honesty surface, which is
    what `00 §5.7` exists to forbid. `27-F11d`'s band claimants are `03-F5`'s S1s and this is none
    of them. `CatalogHealth` therefore ships **no control at all**, and a test pins that.
  - **Not a fourth `ConnectionFacts` chip.** The state that matters is the one where the two facts
    DISAGREE — `Cloud OK` with the menu refused — and a link chip reports that as fine. `Fact` is
    `ok|degraded|down`, which describes a link; a refusal has a reason and a version.
  - **Amber, not red.** `27-F14`'s allocation is read as the CLOSED table `ConnectionFacts` was
    corrected to: the only connectivity claimant anywhere in it is *"sync degraded"*, in amber,
    and red's claimants are enumerated and exclude this. Substantively too — `01-F53` captures the
    price into the event at line-add, so **a till on a stale catalog still bills correctly**;
    `01-F54` degrades to the identifier; `01-F17` says the sale is never blocked.
  - **Nothing at all when healthy** (`27-F16`), because a permanent `Menu OK` chip is the
    base-case spend that made two red blocks meaningless on this same strip.

  **What the cashier sees, measured on the launched app** (real refusal, not a fixture — see
  below). Strip, left to right: `Ayesha · Counter 1` · `LAN OFF` `Hub OFF` `Cloud OK` ·
  **`Menu NOT UPDATING still showing v0 this till refused the update it was sent — it needs a
  full menu, not a change list`** · `Day 2026-08-08`. The reachability chips and this one are
  answering different questions and say so: `Cloud OFF` means *this till has not heard from the
  cloud* (`00 §5.1` — not a fault), and this means *it heard, and would not take what came back*.
  `main` measured `scrollHeight 958 === clientHeight 958` with the notice up — no vertical cost,
  because it rides the existing strip row.

  **The words are formatted in MAIN, never in the renderer** (`AlarmSchema`'s precedent, `18 §9`),
  from `gateway.ts`'s `CATALOG_REFUSAL_WORDS`. Four reasons, four sentences, modelled on
  `services/api`'s `IntegrationError`: name the dependency, say whether this is the till or the
  world, keep the diagnosis. **An unrecognised reason still raises the chip and names the code** —
  `sync-client` is a protected path that can gain a reason without telling this file, and a
  `Record` lookup returning `undefined` would silently delete the surface on exactly that change.

  **One of the four sentences was wrong and the test caught it, which is worth keeping:**
  `malformed` first read *"the menu update did not arrive intact"* — the one sentence of four that
  named neither end. `IntegrationError`'s first property is *what failed*, so it is now *"the menu
  **the cloud** sent did not arrive intact"*. Found by an assertion, not by reading.

  **A finding about the owed item itself.** `catalog-seam.test.ts`'s DEFERRED block said closing
  this needed *"a `DeviceState` field, a renderer surface and an FR that names one — none of which
  exist"*. **The third clause was wrong when written.** `01-F56`'s own closing sentence makes a
  refusal *"observable in device health (`15`)"*, and `DEC-SYNC-011` (a) names both destinations:
  *"surfaced to fleet health (doc 15) **and the honesty UI**"*. The FR existed; nobody read past
  doc 15. **An owed item filed as "no FR exists" is one nobody re-checks** — that is why this sat
  for a wave, and it is a different failure from the ones this file already records.

- **Mutation matrix — the catalog-health SEAM (control: pos-electron 406/406, ui 247/247).**
  In-tree, byte-exact backups with a restore trap, **full package suites under every mutant**, so
  the right-hand column is measured rather than reasoned. 379 pos + 234 ui tests existed before
  this work.

  | # | mutant (exactly one branch) | new pos (27) | new ui (13) | pre-existing 379 + 234 |
  |---|---|---|---|---|
  | M1 | **THE SEAM** — `index.ts` `catalogRefusal: () => null` | **1** | 0 | **all green** |
  | M2 | `Counter.tsx` `catalog={null}` — the renderer half | 5 | 0 | all green |
  | M3 | `gateway.ts` projects `catalog: null` — dep read, thrown away | 16 | 0 | all green |
  | M4 | `version: 0` instead of `have_version` (`27-F12`'s number) | 3 | 0 | all green |
  | M5 | an unrecognised reason collapses to one generic sentence | 1 | 0 | all green |
  | M6 | `CatalogHealth` paints the **FAULT** fill (`27-F14`) | 0 | 2 | **1** — `discipline.test.ts` |
  | M7 | a chip on the HEALTHY case too (`27-F16`) | 2 | 2 | all green |
  | M8 | `StatusStrip` stops rendering it — the `ui` composition seam | 4 | 4 | all green |
  | M9 | **NEGATIVE CONTROL** — reword a shipped operator sentence | **0** | **0** | all green |

  **M1 is the one to re-run after any change here, and its number is the whole point: exactly ONE
  test in this repo separates the shipped wiring from a stub, and all 613 pre-existing tests stay
  green under it.** `catalogRefusal` is REQUIRED, so `seams:check` Rule B is satisfied by any
  supply at all and `() => null` is a supply — AGENTS.md's *"a port supplied with a STUB"*, which
  it measures as invisible to every rail in the repo. The behavioural tests cannot see M1 either,
  because they inject their own dep; that is the "you need BOTH properties" split landing on one
  argument.

  **M9 is what makes every other row mean something.** A real one-branch edit to shipped prose
  reddens nothing, so the suite is holding the PROPERTY (four distinct sentences, no connectivity
  vocabulary, each names an end) and not pinning strings a future session may improve.

  **M6's third column is a gift from an existing guard.** Painting `bgColor-status-fault` without
  naming `outlineColor-status-fault` trips `discipline.test.ts`'s `27-F64` rule — a pre-existing
  test catching a colour-budget violation it was not written for.

- **Mutation matrix — the catalog-health SCREEN (control: gate GREEN, 26 surfaces, 450 controls).**
  The gate's own coverage boundary is its **fixture**, so `layout-gate/preload.ts` now raises the
  refusal for the whole sweep and `main.ts` carries a `24-F14` presence check for it.

  | # | mutant (exactly one branch) | gate | pos 406 | ui 247 |
  |---|---|---|---|---|
  | L1 | **THE FIXTURE** — `preload.ts` back to `catalog: null` | **RED**, 2 × EMPTY MATCH (one per panel) | 405 (1 seam test) | all green |
  | M2 | `Counter.tsx` drops the prop | **RED**, 2 × EMPTY MATCH | 401 | all green |
  | L3 | **A REAL CLIPPING DEFECT** — the notice takes 620 dp of column | **RED**, 57 violations / 12 overflowing boxes | **all 406 green** | **all 247 green** |
  | L4 | **NEGATIVE CONTROL** — chip gap `space-2` → `space-3` | **GREEN** | all green | all green |

  **L3 is the row that justifies raising the fixture at all**, and its right-hand columns are the
  gate's thesis restated on new chrome: the notice is made tall enough to eat the vertical budget,
  and `C` `0` `⌫` go genuinely **UNREACHABLE** on Pay and Cash (`main` holding 593 px in a 400 px
  box) — the shipped defect-2 shape, verbatim — while **all 653 tests stay green**. Only the gate
  sees it, and only because the fixture produces the state.

  **L1 is mutation row M8's lesson applied before the defect instead of after it.** `CatalogHealth`
  renders `null` when healthy and is not a control, so `measureSurface` — which walks clipping
  boxes and `button`s — would report a perfectly clean strip whether the chip is there or not. One
  reverted fixture line would have retired the whole surface from the sweep silently, exactly as
  `escalationFor: () => null` did to `ManagerApproval` for weeks. It is now an EMPTY MATCH on both
  panels. **M2 reddens the gate too**, and for the right reason: the check asks the DOM, so it
  fails whether the fixture stopped producing the state or the app stopped drawing it.

- **A REAL REFUSAL WAS DRIVEN, not simulated — and how to do it again.** The refusal above is not
  a fixture: a ~60-line WebSocket server (scratchpad, not committed) answers `hello` with
  `hello_ack { catalog_version: 5 }` and answers every `catalog_request` with a **delta whose
  `base_version` is 3** — a base the device does not hold. Everything downstream is the shipped
  product: the real `createWsCloudTransport`, the real `createCloudSession`, the real
  `store.catalog.apply()` returning `needs_snapshot` per `01-F56`, the real bounded retry (4
  requests, then it stops asking), the real `DeviceState`. Launch with
  `RESTOS_CLOUD_URL=ws://127.0.0.1:<port> RESTOS_DEVICE_TOKEN=<anything> RESTOS_DEV_MENU=1
  RESTOS_DEV_PIN=1234`, a private `--user-data-dir` and `--remote-debugging-port`. Serving a valid
  **snapshot** instead is the control: same healthy link, `catalog: null`, strip quiet, and the
  synced menu replaces the dev seed. **A fake gateway is not the gateway** — nothing here is
  evidence about `services/sync-gateway`'s serve path, which is
  `journey-catalog.test.ts`'s job.
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
- **COMMANDMENT 8 IS ENFORCED HERE, AND ITS ESCALATION PATH IS HALF BUILT — LOCAL YES, REMOTE
  NO.** ⚠ *This heading read "AND ITS ESCALATION PATH IS NOT BUILT" for a round after the local
  path shipped, sitting directly on top of a body that says the opposite in bold.* The body was
  corrected and the heading was not, which is the worst place to leave one: a heading is what a
  skimmer reads and what the next session quotes upward — and quoting this one upward is exactly
  how `AGENTS.md` came to say `escalate` had no UI. **When you correct a claim, correct its
  headline in the same edit.** `main/authorize.ts`
  wraps the gateway's two write methods and runs every renderer-originated append through
  `domain`'s `can` / `canPayOut` before the ledger is touched — that file is the matrix's first
  production caller in the whole product. What is owed and is named rather than left to look
  intentional: `can()` returns three outcomes, and the third one now has **half** its paths.
  **⚠ THIS ENTRY READ "`escalate` HAS NO UI" AFTER THE LOCAL PATH SHIPPED, and it was copied from
  here into `AGENTS.md` by a session that was in the middle of fixing a *different* stale claim
  two sentences away.** That is the propagation route worth remembering: a stale line in a package
  guide is not a local problem, because the next reader quotes it upward with the authority of the
  file it lands in. **`02-F20`'s LOCAL manager-PIN path is BUILT** — `main/index.ts` wires
  `CHANNELS.escalationFor` (display-only; it authorizes nothing, so a renderer that forged the
  answer gains nothing and Commandment 8 holds) and `CHANNELS.escalate` (the approval itself,
  behind `01-F61` Argon2id), `Counter.tsx` renders `ManagerApproval`, and
  `__acceptance__/escalation.test.ts` plus `manager-approval.dom.test.tsx` cover it. **It builds a
  SECOND `createPinSession` deliberately**: `unlock()` MOVES the session, so approving through the
  cashier's own would sign her out and `02-F41` would attribute her next twenty orders to whoever
  authorised one paid-out — permanently, because `01-F1` forbids unwinding it. `02-F20` asks for
  the opposite, *"the recorded event carries actor + approver"*: two identities, the actor
  unchanged. So `05-F19`'s live case works — a paid-out above `PAID_OUT_APPROVAL_THRESHOLD_PAISA`
  (Rs 2,000, **PINNED not specified**) is refused from the cashier alone and lands with a manager's
  PIN. **Genuinely owed:** `02-F20`'s REMOTE path (approval via doc 05), and its void / comp /
  price-override rows, which are mapped ahead of their events — `domain/registry.ts` does not carry
  those yet.
- **✅ `TAKE CASH` ON AN EMPTY ENTRY RECORDED A Rs 0 SETTLEMENT — CLOSED (August 2026, `02-F48`).**
  Ruled: **a tender of nothing is not a sale**, on the corpus's own precedent — `01-F60` already
  reads `01-F17` as forbidding the blocking of a *sale*, not an item, and a Rs 0 `payment.recorded`
  moves no money, discharges no part of the bill and changes no total. **Refused at ORIGINATION,
  on the payload alone, never at ingest and never in the schema:** `main/zero-tender-guard.ts`
  wraps the renderer's write channel (the chain is now **matrix → amount → duplicate → ledger**),
  and `payment.recorded.amount_paisa` is deliberately NOT tightened to `positive()` because the
  defect has SHIPPED — a device whose own ledger already holds a Rs 0 payment must go on reopening
  its store and merging its peers' history (`01-F6`, `01-F37`). **The measured warning below was
  right and it was about a different precondition:** the six `02-F37` tests gate on an *open
  shift* and every one types a real amount, so an *amount* guard is orthogonal to all of them —
  re-measured green. **`27-F5` is honoured by construction: the control is never disabled, greyed,
  moved or hidden.** `TenderPanel` says why in the readout that was already above it — `NOTHING
  ENTERED` against a real bill, `NOTHING DUE` on an order with nothing billable, two words because
  a single one would be false in one of the two arms (`00 §5.7`) — so no control moves (`27-F4`)
  and the resting state is unchanged. **The original entry is kept below**, because the analysis
  is what the ruling rests on:
  `TenderPanel.tsx` computes `enteredP = (Number(entry) || 0) * 100`,
  so an empty pad is `0`; `coversBill = enteredP >= remainingP` is then false against a positive
  bill, and the handler fires `onTender({ amountP: enteredP })` — a **permanent** `payment.recorded`
  worth nothing, on an append-only ledger where `01-F1` forbids removing it. One accidental tap per
  shift is one phantom settlement in `02-F23`'s reconciliation for ever. (When the bill is already
  covered, `0 >= 0` makes `coversBill` true and it tenders `remainingP`, also `0` — same outcome by
  the other branch.)
  **The arithmetic is unharmed** — zero adds nothing to the `shift_cash` expected map — so this is
  ledger hygiene and cashier trust, not a money error. **It is recorded rather than fixed because
  the fix is a judgement call the code's own comment pre-empts:** that handler says *"`01-F17` — a
  sale is never blocked … the one thing this button never does is refuse."* `01-F17` forbids
  blocking a **sale**; a tender of nothing is not a sale, so refusing an empty entry is very likely
  outside what that FR protects — but the distinction is not written anywhere, and `02-F13`'s split
  path deliberately records partial tenders as themselves, which is the same shape one step along.
  **Do not "fix" this by disabling the button** without settling it: an inert primary control is
  `27-F5`'s own failure mode, and the `M4` row of the `shift_id` matrix measured that the plausible
  safe repair — gating settlement on a precondition — kills six existing `02-F37` tests that exist
  precisely to stop an `01-F17` violation. A finding for the `02-F13`/`02-F37` owner.
## ✅ `01-F33`'s CLOSING ACT FINALLY HAS A PRODUCER — `01-F63` (August 2026)

`order.settlement_closed` had a payload schema in `packages/domain`, a fold arm and a **ratified
merge rule** in `folds/merge.ts` (a monotone OR over a G-Set, with the attested `billed_paisa` as
`uncovered_addition`'s ceiling) since the kernel landed, and **zero production emitters**. So
`OpenOrderRow.settled` was `0` on every order this product has ever held, and `01-F30`'s
conservation equation — which the Auditor gates on `settled === 1` — had **never executed on a real
order**. That is the wave's named defect in the one shape `seams:check` says out loud it cannot
see: a **missing PRODUCER for an event type**.

`main/settlement-closer.ts` is that producer. It hangs off the **completed** append of a
`payment.recorded` in the `CHANNELS.append` handler — the *third* consequence at a call site that
already had two (`02-F15`'s receipt, `02-F31`'s line advance) — and asks the device's own converged
fold one question: `pay_total >= billed_effective`, with `billed > 0`. **One definition of
"settlement completes", not four** (`02-F45`), so a `02-F13` split closes **once**, on the tender
that covers.

**At most one per order, and the EMITTER is what makes that true.** The fold's monotone OR absorbs
a re-emission, so `settled` cannot tell you it happened; `01-F1` makes the damage a growing pile of
permanent rows each attesting a different snapshot for one bill. The check is `row.settled === 1`,
read off the projection this act is about to change — **not an in-process `Set`, and not "covered
since I last looked"**, either of which passes every ordinary case and fails the sharp one: an
order that dips below cover on a refund and comes back on a fresh tender was never *un*-settled
(`01-F33`: reopening does not exist), and reading the projection is also what makes a PEER's close
visible.

**The payload is `01-F63`-pinned and the registry schema is deliberately NOT tightened.** Adding
`billed_paisa: z.number().int().nonnegative().optional()` is retroactive on an append-only log and
would make the ratified merge rule's `close_snapshot_invalid` arm **unreachable** — that arm exists
so a bad snapshot folds with an anomaly while *the act still settles*. A schema that rejected the
snapshot would quarantine the whole act. **No `closed_at` and no actor field:** the first is a
standing-law-1 break wearing an audit field's clothes, the second is `02-F45`'s second source for
one fact (the envelope carries `actor_user_id`).

**What it does NOT close.** It does not make `01-F30`'s three missing right-hand terms appear
(`DEC-MONEY-010` — a comped order still reads as a shortfall of exactly the comp), it does not
close `DEC-MONEY-009`'s **partition** residual (two unconverged tills now both accept *and* both
close), and it does not decide `EXCESS_TENDER_IS_EXCEPTION`.

### Driven on real glass, 2026-08-12 — and the run is the evidence, not the suite

A real Electron till under `xvfb`, driven by CDP mouse events at each control's own rect centre
(`.click()` does not work; the pads need hit testing). Read back out of `device.db` afterwards.

| act | on the screen | in the ledger |
|---|---|---|
| `TAKE CASH` on an **empty pad**, Rs 1,450 due | `NOTHING ENTERED` / `Rs 0`; the button **enabled**, at a **byte-identical rect**, no dialog | **no `payment.recorded` at all** — `02-F48` |
| keys `1450`, `TAKE CASH` | `Already settled — Rs 1,450 taken on this bill.` | `payment.recorded` 145000 **and one `order.settlement_closed`** `{billed_paisa: 145000, tendered_paisa: 145000, refunded_paisa: 0, settlement_attempt_ids: [<the covering key>]}`, actor on the ENVELOPE and **nowhere in the payload**; `orders.settled` **0 → 1** |
| two more lines land on that closed order, then two more tenders (Rs 500 + Rs 980) | the surface takes both | `exceptions_json` = `["uncovered_addition"]`, `pay_total` 293000 — **and still exactly ONE `order.settlement_closed`** |

That third row is `01-F33`'s *"a late line-add raises `uncovered_addition` rather than reopening"*
executing on a device for the first time, and it reached it by accident: the driver pressed a
**greyed** order-type tile (`unavailable` with no channel latched), so the second order's lines went
onto the first order. It is the sharpest at-most-once case there is — an order that was closed,
went uncovered, and was covered again — and the emitter did not close it twice.

## ✅ TWO CASHIERS SETTLED ONE BILL AND THE CASH DOUBLED — `DEC-MONEY-009` (August 2026)

**Measured 2026-08-10 in the first two-till run this product has ever had.** Both cashiers keyed
**Rs 2,240** against a Rs 2,240 order and pressed `TAKE CASH` together: two `payment.recorded`
events, 224000 paisa each, two different `settlement_attempt_id`s, both `shift_cash` folds reading
**Cash Rs 4,480**, both screens reading `DUE Rs 0`, nothing anywhere flagged. The shift then closes
**Rs 2,240 short against a correct drawer** — both devices agree, so no human has a discrepancy to
notice, and `01-F1` makes it permanent.

**The idempotency algebra is NOT broken and this is not a fix to it.** `01-F31`'s
`settlement_attempt_id` protects double-taps and crash-retries; two cashiers are two GENUINE
attempts, so `26 §7`'s unique-keyed sum correctly adds them. `DEC-MONEY-008` guards the opposite
failure. Neither was ever aimed at concurrent human settlement.

**RULED (founder): refuse the second settlement at the till.** `main/settlement-guard.ts` decides
it from **one synchronous read of this device's own `open_orders` projection** — no transport, no
lock, no peer. That narrowness is the whole difference between an implementable ruling and a
commandment-4 violation: a till that must ask the cloud whether an order is settled stops selling
when the WAN drops (`01-F17`, `00 §5.1`, `05-F8`); a till that reads its own converged state and
declines an order it already knows is settled is refusing a **duplicate**, not blocking a sale. The
guard sits INSIDE `authorizeWrites` (matrix → duplicate check → ledger), so a session without
`payment.settle` is told it may not settle rather than told the bill is already paid.

**It is NOT built on `order.settlement_closed`.** When the guard was built, `01-F33`'s closing act
had no production emitter anywhere, so `OpenOrderRow.settled` was `0` on every order any device had
ever held — a guard on that column could never fire, which is this wave's named defect built
deliberately. Emitting the act would have been *defining a closing act*, a founder question. What
ships is the reading `printing.ts` already uses for `02-F15` and `line-advance.ts` for `02-F31`, at
the same call site: **tendered for in full, `pay_total >= billed_effective`**, both `01-F34`-clean.
⚠ **The act now HAS an emitter (`01-F63`, below) and this guard still must not be built on it** —
the act is emitted from this very reading, and the closer runs *after* the append it hangs off, so
`settled` is `0` for the window in which a racing duplicate arrives. `pay_total` moves with the
tender itself and has no such window.

**⚠ THE PARTITION CASE IS STILL OPEN, BY CONSTRUCTION, AND NOTHING HERE MAY BE READ AS A CLOSURE.**
Two tills partitioned from each other have not converged, so neither can know and both accept — the
doubling survives exactly where nothing local can see it. `__acceptance__/double-settlement.test.ts`
§F is a **passing test whose subject is the residual**. `DEC-MONEY-009`'s residual column named
three things owed for it, and **two of the three have since closed — re-measured 2026-08-12, and
the column itself has not been edited, so do not read it as a status board**: the emitter for
`01-F33`'s closing act shipped (`01-F63`, `main/settlement-closer.ts`) and `services/jobs` runs
`runAuditor` on a BullMQ repeatable (the `@unreached-owed` marker on `runAuditor` is about a
DIFFERENT leg — the cloud-projection diff — and still stands). What is genuinely left is a decision
on `EXCESS_TENDER_IS_EXCEPTION`, which is the sign the partition residual actually shows up under
(two full tenders read as an over-tender, and `product-constants.ts` ships that as not-an-exception
at v1).

**What the cashier sees, and what it CANNOT say.** The Pay surface reads the same two projected
numbers the guard reads and says so *before* she reaches for the pad: `Already settled — Rs 2,240
taken on this bill. Nothing more is due.` A **word** and a **number** (`27-F12`), in place of
`TAKE CASH` rather than beside a greyed one — an inert primary control is `27-F5`'s own failure
mode, and this surface already answers "there is nothing to settle" in exactly this shape one
branch up. **It cannot name WHO settled it or WHERE:** `02-F45` puts attribution on the envelope's
`actor_user_id` and `OpenOrderRow` — the pinned projection — carries the money and not the actor,
so *"already settled by Ayesha on Counter 2"* is **owed at the fold** (a `sync-client` cell-shape
change on a protected path) and inventing it here would be commandment 2.

**THE CONTRIBUTING DEFECT, fixed, and it is why the double settlement was trivial rather than
exotic.** `Counter.tsx` bound `current = orders[0]` — a **branch-wide** list (`02-F11`) — and greyed
the order-type row whenever anything was open. So a second cashier's cart was the first cashier's
bill and **there was no way to start a second order at all**. Two customers, one bill, then two
settlements against it. Nothing in `02-F1` or `01 §4` limits a terminal to one open order; the row
was greyed because the cart was `orders[0]` and had nowhere else to point. `cartOrderId` is
**renderer state and not a ledger fact** — `02-F4`'s `order.parked`/`order.unparked` are the
branch-wide version and have **no payload schema in `packages/domain`**, so `01-F4` makes them
unemittable and C10 stays owed. It falls back to `orders[0]` when this till has started nothing, so
a fresh launch behaves exactly as before. `27-F4` is untouched: no tile added, removed or moved — a
greying was lifted.
**Owed, named:** an order started here and abandoned to a relaunch is reachable only through that
fallback. `02-F10`'s recall is the FR and the Orders tab is its surface, but
`orders-tab.dom.test.tsx` §E is an **oracle** asserting an open-order row carries *no control at
all* — so the recall action is a change for that file's test owner, not for an implementing
session (`24 §3`).

### Mutation matrix — control: pos-electron **642/642** green (613 pre-existing + 29 new), `pnpm verify` exit 0, `seams:check` clean

In-tree, one branch per mutant, `git checkout --` restoring byte-exactly from a committed tree.
**The right-hand column is the finding**, and it is the calibration this file keeps asking for.

| # | mutant (exactly one branch) | new (29) | pre-existing 613 |
|---|---|---|---|
| M1 | **THE SEAM** — `authorizeWrites({ writes: gateway })`; the guard built and unreached | **1** | **all green** |
| M2a | **THE ROUND-TRIP, OPTIONAL DEP** — an `uplink` short-circuit the host never supplies | **0 — SURVIVES** | all green |
| M2b | **THE ROUND-TRIP, REQUIRED DEP** — an `uplink` the host must supply, and does | **10** | all green |
| M2c | **THE ROUND-TRIP, THROUGH THE STORE** — the guard consults `store.status()` | **1** | all green |
| M3 | **THE OFFLINE OVER-FIRE** — refuse whenever ANY money has arrived | 2 | all green |
| M4 | **THE ZERO-BILL NARROWING DROPPED** — `0 >= 0` makes every empty order settled | 3 | all green |
| M5 | **THE PURPOSE GATE DROPPED** — a `DEC-MONEY-007` khata repayment is refused too | 1 | all green |
| M6 | **THE CONTRIBUTING DEFECT VERBATIM** — `orders[0]` **and** both rows re-greyed | 3 | all green |
| M7 | **CONTROL for M6** — `orders[0]` alone, rows left live | **1** | all green |
| M8 | **THE SCREEN GOES SILENT** — `isAlreadySettled` always false; main still refuses | 3 | all green |
| M9 | **THE SCREEN OVER-FIRES** — any money taken reads as settled (`02-F13` broken) | 2 | all green |
| M11 | **THE UNCONVERGED TILL** — an order this device has no row for is REFUSED | **1** | all green |
| M10 | **NEGATIVE CONTROL** — a real refactor of `refusalFor` into early-return form | **0** | **all green** |

**M10 is what makes every red row mean anything:** a genuine one-branch restructuring of the very
function under test reddens nothing, so the suite holds behaviour and not shape.

**M1's column is the number to remember: the seam going dead — the guard correct, tested and
unreached — leaves all 613 pre-existing tests green.** Exactly one assertion separates the wired
product from `writes: gateway`, and it is a **source read** (`main/index.ts` builds an Electron app
at module scope and no suite here can import it), the same weak instrument
`line-advance-seam.test.ts` §A already uses. One guard, not two.

**M6 against M7 is the attribution for the contributing defect.** They differ in whether the two
tile rows are re-greyed, so the two extra kills belong to the *"a second order can be started"*
half and the shared kill to the *"which order is the cart"* half. Neither subsumes the other, which
is why the fix is both.

**⚠ M2a SURVIVED, AND IT IS THE MOST USEFUL ROW HERE — `seams:check` COULD NOT SEE IT EITHER, FOR A
REASON WORTH FIXING IN THE RAIL.** An optional `uplink` member with a short-circuit is behaviourally
dead in the shipped wiring (nothing supplies it), so no behavioural test can distinguish it — that
is precisely the case Rule B exists for, and **the rail was exit 0 and CLEAN at `11 optional
seams`.** Root cause, isolated by changing one thing: `check-seams.mjs`'s `optionsOf` requires the
single options parameter's type annotation to match `/^([A-Za-z_$][\w$]*)$/`, and a signature Biome
has **wrapped** leaves a trailing comma (`deps: SettlementGuardDeps,`) which fails it — so the whole
factory becomes invisible to Rule B. Collapse the signature to one line and change nothing else:
**exit 1 at 12 optional seams, naming the member.** This module now names its return type
(`RendererWrites`) purely so its signature fits on one line and stays under the rail. **A repo-wide
scan found ONE other factory in this shape: `packages/sync-client/src/pin-audit.ts`'s
`createPinAuditSink`** — its options are all required today, so nothing is hidden, but it is a
PROTECTED path and the next optional added there would be invisible. **Reported, not fixed:**
`check-seams.mjs` is a CI rail with its own blast radius and `24 §3b` forbids the drive-by.

**⚠ M11 SURVIVED ITS FIRST RUN AT 28/28, AND THE ASSERTION THAT KILLS IT WAS ADDED BECAUSE OF
THAT — the round-3 law's shape on this round's own work.** A device that has not converged has **no
row** for the order; that is what *"hasn't heard from anyone"* looks like from inside
`openOrders()`. The plausible wrong implementation is *"if I do not know about this order, refuse"*
— it reads like caution and it is the `01-F17` break the whole ruling exists to avoid, a till that
stops selling because it is behind. **Every other assertion in the suite settles an order the
fixture created, so all 28 passed under it.** §C now settles an order id the store has never seen.
Reading the suite would not have found that; running the mutant did.

**Two fixture defects were found by RUNNING and would not have been found by reading.** (1) Two
`02-F13` partial tenders sharing one `settlement_attempt_id` are two divergent members of ONE key —
the fold marks it disputed and **both contribute zero** (`01-F31`), so the first draft read Rs 0 in
the drawer and the algebra was right while the fixture was not. (2) A renderer fixture that mutates
`openOrders` and waits is asserting the screen's **stale** state: `Counter` re-reads on main's
`changed` push and on nothing else, so the harness has to move the fold and then send the push.

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
  - **`C32` (mark ready) — was four independent blockers; THREE HAVE MOVED and the fourth still
    decides it (August 2026).** ⚠ Re-read this whole bullet before quoting any part of it: the
    first three sentences were true when written and three of them are not true now.
    - ~~(1) **Nothing advances a line past `placed`**~~ — **CLEARED.** `main/line-advance.ts` is
      the production emitter for `order.line_state_changed` (`02-F31`), wired in `main/index.ts`:
      `order.confirmed` → lines `confirmed` (`01 §4`'s own first transition, the precondition
      without which `02-F31`'s rule cannot fire) and `kot.printed` → lines `in_prep` on T1. The
      *fold* remains projection-inert for `kot.printed` and that was never the blocker — the
      missing piece was a producer, and `merge.ts` was not touched.
    - ~~(2) the edge would be **illegal**~~ — **PARTLY CLEARED, and read the state, not the FR.**
      A line now reaches `in_prep`, and `LEGAL_NEXT.in_prep` **does** contain `ready`. A line still
      at `confirmed` (no printer attached, so no `kot.printed`) still cannot go to `ready`.
    - ~~(3) `preds` cannot be built~~ — **WEAKENED BY MEASUREMENT, and the old claim was wrong.**
      It said *"`preds: []` would make the line a contested MVR rather than ready"*. It would not:
      `projectLine` takes ≼-max over **all legal edges**, not over heads, so an unretired lower
      edge cannot change a NON-TERMINAL watermark — and `ready` is non-terminal. The emitter ships
      `preds: []` and `main/__acceptance__/line-advance.test.ts` §C asserts an EMPTY anomaly map
      through the real merge engine. Retirement decides something only for a TERMINAL edge.
    - **(4) `03-F24`'s ready-signal-ownership config does not exist** anywhere in code — unchanged,
      and **sufficient on its own**. `02-F33`'s gate has no source and inventing one is a
      commandment-2 violation. **What ships is `02-F33`'s own fallback and it is spec-conformant,
      not a gap:** *"otherwise the panel is read-only for states."* `orders-tab.dom.test.tsx` §E is
      an **anti-scope guard** that still holds — but ⚠ **its comment now gives a stale reason**
      (*"Nothing advances a line past `placed`"*). The assertion is right and the rationale is not;
      that is a finding for the file's test owner, not an edit for an implementing session.

## `02-F31` — THE TIER, AND THE PRODUCER THAT DID NOT EXIST (August 2026)

`order.line_state_changed` had a `packages/domain` schema and a `merge.ts` fold consumer and **no
production emitter anywhere**, so every line of every order this product ever rang sat at `placed`
for ever. `pnpm seams:check` is structurally blind to that shape and says so — **a key in an object
literal is not an export** — which is exactly how `audit.print_acknowledged` sat in the registry
with nothing emitting it. Two files close it: `main/hardware-tier.ts` and `main/line-advance.ts`,
with `main/__acceptance__/line-advance-seam.test.ts` as the hand-written assertion no rail can make.

**The tier is `assumed`, not derived, and that is the finding rather than a shortcut.** `02-F31`'s
detection rule reads *"the branch device registry"*, and **no part of that registry reaches a
device**: `01-F62` makes `device.registered`/`device.revoked` org-scoped (*"it never enters a branch
stream and no device folds it"*), `hello_ack` carries seven additive fields and no roster, and the
device store has no table one could be persisted in for an offline boot (commandment 4). The LAN
mesh's `PeerInfo.device_class` is not the answer either, twice over: no host runs the mesh, and
peers are **liveness** where `02-F31` says **registry** — a pass screen that is switched off is
still a registered pass screen. So `resolveHardwareTier` takes the roster as a real, tested input
and the shipped host passes `null`, `00 §7` layer 2's already-declared `hardware tier (T1/T2/T3)`
key is the correction (`RESTOS_HARDWARE_TIER`), and the boot line says which was used at length.

**✅ `02-F31`'s settlement → `served` HALF IS BUILT (August 2026, `DEC-HW-002`).** ⚠ *This paragraph
read "NOT built and BLOCKED IN THE KERNEL … needs a ruling, not an edit" and it was correct until the
ruling landed.* The FR requires settlement → `served` *and*, in the next clause, forbids fabricating
`ready` — which together demand the edge `in_prep → served`, and `01 §4` / `LEGAL_NEXT` reached
`served` only from `ready`. **RULED: `LEGAL_NEXT.in_prep` gains `served`** — a line in a restaurant
with no pass goes from being cooked to being handed over with no observed moment of readiness, and
the table encoded *"a pass exists to observe readiness"* as universal law (`DEC-HW-001`'s
T3-assumed-universal error reaching the kernel). A **tier-conditional** legality was refused as a
standing-law-1 violation, not on taste: `26 §7` row 65 makes legality a pure function of one edge's
payload, so gating it on the branch's tier would make a projected value depend on the reading
device's configuration (`01-F34`).

`main/line-advance.ts` gains `settled(order_id)`, wired in `main/index.ts` off the SAME
`payment.recorded` narrowing that already drives `receipts.settled`. Three gates, all inside the
module where a suite drives the real branch: **the serve-signal assignment**, **delivery**, and
**completion**.

⚠ **THE FIRST GATE WAS `autoAdvancesLines(tier())` UNTIL `03-F52` (August 2026), AND THIS LINE
SAID SO.** *"The tier stops being an input."* The till now emits on settlement because the
branch's serve-signal owner is `settlement` — `deps.serveOwner()`, out of
`@restos/device-config`'s **one** declaration, which `apps/pass-kds` reads for its own handover
control — and not because a label reads `T1`. That is `DEC-HW-003`'s checkable test (*"no code
may branch on the tier to decide whether a piece of hardware EXISTS"*) applied to the last
producer in the product that failed it. **Behaviour on a branch that has configured nothing is
unchanged**, because the assumed owner is `settlement`, argued in `serve-signal.ts` rather than
defaulted. **`printEvent` keeps its tier gate**: `kot.printed → in_prep` is `02-F31`'s OTHER half,
`03-F52` says nothing about it, and moving it too would auto-advance the lines a `03-F51`
screen-only station's bump owns. `__acceptance__/serve-signal-settlement.test.ts` §C is the
assertion that the move was a move; §A is the one that would fail an implementation keeping the
tier as an extra `&&` — the change a careful session makes when it does not want to break
anything, and it fails there and nowhere else.

**A green test defended the overruled rule and was retired in the same change**, which is the
discipline `AGENTS.md` extracts from `catalog-pricing.test.ts:394`: `line-advance.test.ts` §G's
*"a T2 or T3 device does NOT auto-advance on settlement"* and `line-advance-seam.test.ts` §D's
`rig("T2","dine_in") → 0` both encoded the tier gate, both were green, and both would have failed
the correct implementation. Neither was deleted — each carries the old assertion, the reason it
went, and a pointer to where the property it protected is now pinned.

**The delivery exclusion is an ALLOWLIST and that is the load-bearing choice.** `01 §4` is canonical
— *"`served` (dine-in/takeaway/pickup) **or** `picked_up → delivered` (delivery, **rider-driven
only** — never advanced by payment/settlement, 09)"*. `order_type` is an **open string** in
`registry.ts` (`02-F42` closed `channel` and left this axis open), so the allowlist and a
`!== "delivery"` denylist differ on exactly the unknown and absent values — and the harm is
recoverable in only one direction. Refusing costs a queue row that lingers; advancing wrongly writes
a handover that never happened, **terminally** (`01-F35`) and **unremovably** (`01-F1`). It is not a
legality rule and could not be: a delivery line at `ready` may legally reach `served`, so
`LEGAL_NEXT` cannot express it.

**Completion is `pay_total >= billed_effective`** — the same reading `printing.ts` uses at the same
call site for `02-F15`. When this was written `01-F33`'s `order.settlement_closed` had no emitter
anywhere, so `OpenOrderRow.settled` was `0` on every order and waiting for it would have advanced
nothing; advancing on *any* `payment.recorded` would serve the lines at the first `02-F13` partial
tender. It also kept the (then open) `TAKE CASH`-on-an-empty-entry defect out of line state — a
Rs 0 tender leaves the bill uncovered. ⚠ **`01-F63` gave the act an emitter and this did not move
to it**, deliberately: the act is emitted from this same reading, from the same call site, so
gating on `settled` would swap one form of one fact for another and make one order-of-execution
detail inside one IPC handler decide whether a line is served.

**Two limits are deliberate and must not be "fixed" without a ruling.** `confirmed → served` stays
**illegal**, so a till whose KOT never printed advances nothing on settlement — `restaurant-os.md:47`
defines T1 as *"terminal + printers"*, and whether a tier below T1 exists is `DEC-HW-001`'s second
open sub-question. And no `ready` is fabricated anywhere (`02-F31`, `03-F26`).

**⚠ MEASURED AND OWED — the terminal edge ships `preds: []`.** `line-advance.ts` predicted this
before the half was buildable and the prediction was exactly right. Measured through a real store,
three edges deep, `preds` the only variable:

| settlement edge | projected states | anomalies |
|---|---|---|
| `preds: []` (shipped) | `["served"]` | `terminal_regression` ×2 (the `confirmed` and `in_prep` edges) |
| `preds: [<in_prep edge>]` | `["served"]` | `{}` |

It ships anyway, for three bounded reasons rather than by dismissal: the **state is correct either
way**; the flag is **DERIVED** — every edge is legal, so nothing wrong enters the append-only ledger
and a refold clears it retroactively, which is the whole difference from the illegal-edge route the
ruling refused; and **the cloud Auditor already excludes it by name** (`auditor.ts` filters to
`illegal_transition` under *"the other anomaly classes are fold renderings, not illegalities"*). No
money value moves — `billedCellPaisa` reads `states` only. **Closing it needs head ids on
`BilledLineCell`**, which is an oracle-pinned cell shape (contract ruling C8) in a second protected
package; the precedent exists one projection over (`AvailabilityRow.head_ids_json`, *"exported so an
operator surface can build a correct"* supersedes link, with its own `01-F34` bijection test).
**OWED, named, and deliberately not taken in the change that closed the FR.** `line-advance.test.ts`
§H pins the two flags as a fact so it cannot change silently.

**Mutation matrix — control pos-electron 488/488 + domain 328/328 green, `pnpm verify` exit 0,
`seams:check` clean.** In-tree, byte-exact backups with a restore trap, a no-op-mutant guard, and the
FULL suite of both packages under every mutant. 472 pos-electron tests existed before this work.

| # | mutant (exactly one branch) | new (16) | pre-existing 472 | domain 328 |
|---|---|---|---|---|
| M1 | **THE SEAM** — `index.ts` drops `lines.settled(order_id)` | **1** | **all green** | all green |
| M2 | **THE DELIVERY EXCLUSION REMOVED** — directed | 5 | **all green** | all green |
| M3 | **THE PLAUSIBLE WRONG READING** — denylist `!== "delivery"` | **1** | **all green** | all green |
| M4 | **`LEGAL_NEXT` REVERTED** — the pre-ruling kernel | 11 | **all green** | **1** |
| M5 | **CONTROL** — the tier gate dropped from `settled` only | 2 | all green | all green |
| M6 | the completion test dropped — any `payment.recorded` serves | 1 | all green | all green |
| M7 | **THE LIE** — `from_states: ["ready"]` on an `in_prep` line | 2 | all green | all green |
| M8 | **NEGATIVE CONTROL** — a real refactor of the same two functions | **0** | **all green** | all green |

**M8 is what makes every red row mean anything:** a genuine one-branch refactor (expression body →
early returns; the duplicated row lookup extracted into one helper) reddens nothing, so the suite is
holding behaviour rather than shape.

**M4's FAILURE MODE IS NOT THE ONE `DEC-HW-002` PREDICTED, and the difference is the finding.** The
ruling says an `in_prep → served` edge against the old table *"is recorded `illegal_transition`
permanently"*. It is not — because `advanceEdgesFor`'s legality filter (rule 2, which predates this
work) refuses the line first. What actually happens is `expected [] to have a length of 1` and
`expected ['in_prep'] to deeply equal ['served']`: **the trigger is wired and emits nothing**, which
is the *other* outcome the ruling names and calls **the worst option available**, because it looks
finished with every gate green. The only reason it is not silent is that
`line-advance-seam.test.ts` §D was INVERTED into a positive assertion rather than deleted.

**M1's kill count is 1, and it is a SOURCE READ — state that plainly.** `main/index.ts` builds an
Electron app at module scope and no suite in this package can import it, so the one guard on "does
the host call the emitter" is a string match, exactly as it already is for `lines.confirmed`. The
behavioural test beside it constructs its own emitter and stays green under M1. That is the known
shape of this seam, not a new weakness — but it means the seam has exactly **one** guard, and M10 of
the producer round is the standing warning about what a source string alone is worth.

**M3 is the row to re-run after any change to the exclusion.** Exactly one assertion in this repo
separates `01 §4`'s allowlist from the denylist that reads like `02-F31`'s sentence, and all 472
pre-existing tests plus all 328 domain tests stay green under the wrong one.

**Mutation matrix (the PRODUCER round, kept as history) — control 472/472 green (438 pre-existing + 34 new), `pnpm verify` exit 0,
`seams:check` exit 0.** In-tree, byte-exact backups with a restore trap, full package suite under
every mutant. **The right-hand column is the finding.**

| # | mutant (exactly one branch) | new (34) | pre-existing 438 | seams:check |
|---|---|---|---|---|
| M1 | **THE SEAM** — `index.ts` drops `lines.printEvent(type, payload)` | 1 | **all green** | — |
| M2 | **THE SEAM** — `index.ts` drops `lines.confirmed(order_id)` | 1 | **all green** | — |
| M3 | **THE STUB SUPPLY** — `append: () => {}` | 1 | **all green** | **exit 0, CLEAN** |
| M4 | **THE DEFECT VERBATIM** — no producer at all (the pre-fix tree) | 3 | **all 438 green** | **exit 1** |
| M5 | **CONTROL** — the tier gate dropped, one branch | 2 | all green | — |
| M6 | the `LEGAL_NEXT` filter dropped — illegal edges are emitted | 6 | all green | — |
| M7 | **THE LIE** — judge legality against the chain's expected parent | 6 | all green | — |
| M8 | the contested-arity guard weakened (`!== 1` → `=== 0`) | 1 | all green | — |
| M10 | the `kot.printed` type guard dropped — a FAILED print advances | 1 | all green | — |
| M9 | **NEGATIVE CONTROL** — a real refactor of the same loop | **0** | **all green** | — |

**M4 is the number to remember: the defect that left every line in the product at `placed` since
the first order was rung leaves all 438 pre-existing tests green.** M3 is the other one — the port
supplied with a stub is invisible to `seams:check`, exactly as `AGENTS.md` measures it, and M4 is
the case the rail DOES catch (`createLineAdvance` becomes an unreached export under Rule A).
**M9 is what makes every red row mean anything:** a real one-branch edit reddens nothing.

**⚠ THREE MUTANTS SURVIVED THEIR FIRST DRAFT, and each was a defect in the guard, not in the code.**
1. **M7 survived** because the mutant did not reproduce the defect: it lied in the recorded
   `from_states` while still judging legality against the true state, so the filter caught it
   anyway. The dangerous implementation — the one a helpful session actually writes — judges
   legality against the *assumed* parent. Rewritten, it kills 6.
2. **M8 survived** because the contested-arity guard is masked by the legality filter: every
   contested cell `merge.ts` produces is all-terminal, and `LEGAL_NEXT` maps a terminal to `[]`.
   The fixture could not distinguish the guard from its absence. A directed fixture (a multi-state
   cell whose first member *would* advance legally) replaces it.
3. **M10 was killed by a source string and by nothing behavioural**, because the seam suite
   asserted against a **hand-copy** of `index.ts`'s `type === "kot.printed"` branch — `K-3`'s
   dead-oracle defect reproduced inside the fix for a different defect. The branch moved into
   `LineAdvance.printEvent`, so the host passes the callback straight through and the test drives
   the real one.
   **Reading the suite found none of these. Only mutating did.**

**And the rail caught the documentation:** the first draft of `hardware-tier.ts`'s header *quoted*
the literal `@unreached-owed` marker from `mesh-session.ts`, and `seams:check` attributed it to four
of this file's exports and reddened — its anti-rot rule working correctly on a comment. Write the
marker's meaning in words, never the token.
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
     renders with*. **The dp-as-CSS-px / dp-as-mm duality that caused it is CLOSED (August 2026,
     `DEC-UI-001` / `27-F68`)** — it was the same posture measuring two different sizes depending
     on which of the package's two conversions you asked, and there is one conversion now. Both
     `OrderList` and `ItemGrid` default `ppi` to `DP_PER_INCH`, so a measured millimetre and a
     rendered dp are the same physical thing. The FR that was owed here is `27-F68`.
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
## ✅ EVERY SETTLEMENT WAS UNBOUND — the money path read a literal `null` (August 2026)

`Counter.tsx` wrote **`shift_id: null`** into every `payment.recorded`, under a comment saying
*"the POS has no shift concept yet"*. It had one, and **that same component read it** —
`window.restos.cashState?.()`, twenty lines above the defect — while the three sibling call sites
in `CashSurfaces.tsx` (`shift.closed`, `cash.drawer_opened`, `cash.paid_out`) all resolved it
correctly with `openShift?.shift_id ?? null`. Only the money path did not.

**The cost was total, not partial.** `sync-client/src/folds/shift-cash.ts` buckets by
`payload.shift_id` into `expected_json`, which *is* `02-F23`'s "system-expected cash (by method)".
With a constant null **no sale ever reached a shift's expected map**: a cashier closed her shift
and read Rs 0 expected from sales while every real settlement sat in the unbound bucket raising
`unbound_settlement`. `02-F22` ("a shift binds subsequent cash settlements … to that cashier") was
violated on **100% of settlements**, and `02-F37`'s anomaly — written for the exceptional case —
fired always, which is noise rather than signal, and it was hiding the defect it was reporting.

**The fix is one expression**, `shift_id: openShift?.shift_id ?? null`, resolved through
`CashSurfaces.tsx`'s now-**exported** `openShiftOf` so there is ONE definition of "which shift is
open" for both the money path and the drawer path. `?? null` is not a fallback to tidy away — it
IS `02-F37`, and it is why the resolution can never gate the append. **`packages/sync-client` was
not touched and needed no change**: the fold was correct throughout, so this wants no
protected-path review on that account.

**Measured on the running app, `RESTOS_DEV_MENU=1` + `RESTOS_DEV_PIN`, signed in as Hina
(branch_manager — `02-F22`'s role guard means a cashier cannot open the day), same flow both
times: open day Rs 5,000 float → open shift → five taps of Chicken Karahi (Rs 7,250) → TAKE CASH →
close the shift counting Rs 12,250.** Read out of `device.db`, not off the screen:

| | `payment.recorded.shift_id` | `shift.closed.expected…{cash}` | `variance_paisa` |
|---|---|---|---|
| **before** | **`null`** | **0** | 1225000 — **the entire drawer reads OVER** |
| **after** | `019fe771-3a96-…` = the open shift | **725000** (Rs 7,250) | 500000 — exactly the opening float |

The variance line is the user-visible bug: before, a cashier who counted her drawer *correctly*
was Rs 12,250 **over** with nothing to point at; after, the residue is the Rs 5,000 float, which is
right because `02-F23`'s snapshot is the tender by method **UNADJUSTED** (`CashSurfaces.tsx` says
so, and netting the float in would make `01-F30` unresolvable).

**Mutation matrix — control: 411/411 green (406 pre-existing + 5 new).** In-tree, byte-exact
backups with a restore trap, full package suite under every mutant.
**The right-hand column is the finding.**

| # | mutant (exactly one branch) | new (5) | pre-existing 406 |
|---|---|---|---|
| M1 | **THE DEFECT VERBATIM** — `shift_id: null` restored | 3 | **all 406 green** |
| M2 | **CONTROL** — `openShiftOf` drops its `closed === 0` filter | 2 | 405 (`cash-tab`'s `shift.opened`) |
| M3 | `?? null` dropped, so the key goes `undefined` | 1 | 405 (the null-reference test) |
| M4 | **THE PLAUSIBLE WRONG FIX** — `if (openShift === null) return;` | 1 | **400** (6 × `02-F37`) |
| M5 | `02-F45` break — the shift's `cashier` copied into the payload | 1 | 405 (the identity sweep) |
| M6 | **NEGATIVE CONTROL** — `cash === null ? … :` → `cash ? … :` | **0** | **all green** |

**M1 is the number to remember: the defect that mis-bucketed every rupee in the product leaves
all 406 pre-existing tests green.** `unbound-settlement.dom.test.tsx` asserts `shift_id` **is
null** — correctly, under a fixture that never opens a shift — so a hardcoded null satisfies it.
The suite had exactly one fixture, and it was the one the hardcode passes. **This is the round-3
law's shape on a money field: the guard was built correctly and never pointed at the dangerous
case.** The fix is a second fixture (the file's last describe block), *not* a change to any
existing assertion.

**M4 is why none of those assertions may be weakened, and it is the strongest row here.** The
"safe" repair — refuse to settle until a shift is open — kills **six** pre-existing tests. Those
tests are not obstacles to the fix; they are the guard against the fix overshooting into an
`01-F17` violation, and they bite hard. Keep both fixtures: the product must bind when there IS a
shift and record the truth when there is not, and one fixture can only ever prove one of those.

**M2 and M1 are different failures of one fact and neither subsumes the other** — M2 (the shared
helper) is partly visible to the drawer's own suite, M1 (the money call site) is invisible to
everything. That is AGENTS.md's "you need BOTH properties" split landing on one expression.
**M6 is what makes the red rows mean anything:** a real one-branch edit reddens nothing.

**⚠ TWO ENVIRONMENT TRAPS COST MOST OF THIS SESSION'S CLOCK, AND NEITHER IS A PRODUCT DEFECT.**
1. **A backgrounded Electron window is OCCLUDED, and then the item grid is EMPTY with nothing
   saying why.** `document.visibilityState` is `hidden`, Chromium stops delivering
   ResizeObserver callbacks, `usePhysicalSize` never measures, `ItemGrid` computes zero capacity
   and renders **no tiles** — so no line can be added, the bill is Rs 0, and every money figure
   downstream is a false zero that looks exactly like the defect under test. `menu()` returns all
   8 items the whole time, which is what makes it so misleading. `Page.bringToFront` is **not**
   enough. Launch with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
   --disable-features=CalculateNativeWinOcclusion` and `visibilityState` goes `visible`. (The
   layout gate is immune: it drives `webContents.executeJavaScript` on a `show: false` window it
   owns, so nothing about it warns you.)
2. **`TenderPanel`'s keypad enters RUPEES and an EMPTY entry tenders ZERO** —
   `enteredP = entry * 100`, and `onTender` passes `coversBill ? remainingP : enteredP`. Pressing
   `TAKE CASH` without keying records `amount_paisa: 0`, a *successful* settlement worth nothing.
   The shift then binds correctly and still shows Rs 0 expected, which reads as the money bug
   surviving its own fix. Key the due first.

**And the harness trap fired live, exactly as AGENTS.md describes it.** A backgrounded launch was
reported by the notification as **"completed (exit code 0)"** while the `REAL_EXIT=$?` marker
written inside the log said **127** — the electron binary was not on the path the command used.
A reported exit code is not evidence; the marker inside the log is.

## ✅ A LINE ADDED AFTER "SEND TO KITCHEN" NEVER REACHED THE KITCHEN — `03-F55` (August 2026)

**The worst defect this app has shipped, and it lost a customer's food silently.** `confirmed()`
built `job_id = <order_id>::<station>` and skipped a station whose job already existed. `02-F8`
leaves a post-confirm ADDITION legal, `gateway.addLine` does not refuse a confirmed order, and the
grid stays live until the order is SETTLED — so *ring → Send to kitchen → the customer asks for one
more naan → tap the tile → **Send to kitchen*** produced **no ticket, no band, no event and no
change on the glass.** The naan was on the bill (`01-F53` captured its price) and nobody in the
kitchen had been told. Nothing in this product revealed it until the customer asked.

**The guard was CORRECT and is not deleted.** `03-F7`/`03-F37` make a reprint a deliberate, logged,
banded act and `03-F41` spends a paragraph on the duplicate KOT being a real kitchen error. What the
guard could not do is tell *"same order, same lines, second press"* — which must stay silent — from
*"same order, NEW lines"*. `03-F55` separates those: each chit records on `03-F4`'s **durable spool
row** the line ids it committed to paper (`covers`), and a press sends, per station, exactly what is
not covered. The opening chit's id is unchanged; later ones append their ordinal.

**DRIVEN ON THE REAL TILL, not asserted.** `RESTOS_DEV_MENU=1 RESTOS_DEV_PIN=1234
RESTOS_KOT_PRINTER=TH230 RESTOS_PRINT_TO_FILE=<dir>` under Xvfb, every press a CDP
`Input.dispatchMouseEvent` at the control's own rect centre (`.click()` does not work on the pads).
Ayesha unlocked, Takeaway/Counter, Chicken Karahi + Naan → **Send to kitchen** → two chits. One more
Naan → **Send** → **one** chit. Two further presses with nothing added → **nothing**. Then the app
was **killed and relaunched over the same `print-spool.db`**: a press with nothing added stayed
silent, and a Seekh Kebab + a third Naan produced exactly two more chits. The five rows the running
till wrote, read back out of its own spool:

```
…::kitchen      covers=[lineA]  KOT … kitchen 08:13 … 1 Chicken Karahi
…::tandoor      covers=[lineB]  KOT … tandoor 08:13 … 1 Naan
…::tandoor::1   covers=[lineC]  [ADDED 1] KOT … tandoor 08:13 … 1 Naan
…::tandoor::2   covers=[lineE]  [ADDED 2] KOT … tandoor 08:13 … 1 Naan   ← ordinal survived the relaunch
…::grill        covers=[lineD]  KOT … grill 08:13 … 1 Seekh Kebab        ← a NEW station gets an ORDINARY chit
```

Four things to read off it. The `kitchen` chit was never re-sent, so the karahi is cooked once. The
two `tandoor` addenda have **byte-identical bodies** and are told apart only by the ordinal — which
is `03-F55`'s stated reason for putting a number on paper. The grill, reached for the first time by
an addition, gets an ordinary KOT and not an addendum (`03-F2` fans out per STATION). And every chit
carries the same `08:13`: the confirm anchor, unforked by the late addition (`03-F14`).

**The band is ONE band, and the reason first written here was FALSE — corrected 2026-08-13 by
mutation, not by reading.** It said the naive shape, a `REPRINT` block plus an `ADDED n` block,
makes a reprinted addendum **print nothing at all**, because `encode()` would answer
`banner_budget_exceeded` and `03-F34` would refuse the chit. It would not. `encode()`'s budget
counts **bands, not parts**, and a feed does not close a band — measured directly: one part
`ok=true`; two parts separated by a feed `ok=true`; two parts with **nothing** between them
`ok=true`; only two parts separated by **body text** refuses, which is a placement nobody would
choose. Both naive shapes were built as mutants (two parts in the block, and a separate
`KOT_ADDED_BAND` spec block) and each passed **357/357 escpos and 966/966 pos-electron**, all 35 new
assertions included. **The real reason for one part is legibility and nothing tests it:** a `text`
part emits no separator, so two adjacent parts print `REPRINTADDED 2`, and both suites accept that —
they ask the band to CONTAIN `REPRINT`, `ADDED` and the ordinal. `27-F35` has never been run on this
band, so `REPRINT ADDED 2` is a judgement, not a proven requirement. *A comment that names a hazard
which does not exist is worse than none: it retires the assertion someone would otherwise write, and
the next session to meet it either believes a refusal it cannot reproduce or "fixes" the shape.*

**⚠ THE OTHER HALF OF THIS DEFECT IS STILL OPEN AND IT IS THE HALF A CASHIER MEETS.** `02-F8`'s
control reads *Send to kitchen* whether or not anything is owed, so **a cashier who never presses it
a second time still loses the naan.** `03-F55` closes what happens when she presses; nothing tells
her she should. That surface is doc 02's and doc 27's, it is named as OWED in the FR, and it is
where the remaining risk lives.

**Also owed and named in the FR:** `03-F48`'s one-tap reprint must come to mean the last **chit**,
not the whole order, or a reprint re-cooks everything the addendum exists to avoid re-cooking; a line
VOIDED after its chit printed (`void.recorded` has no producer); a confirm arriving from a PEER
device (each device keeps its own spool, and `01-F15`'s mesh only just gained a host); and **K-8 —
no printer has printed an addendum.** The PDFs above are `simulate()`'s reading of our own bytes and
`27-F35`'s ≥85% comprehension gate on `ADDED 2` is untouched, exactly as it is for `REPRINT`.

**⚠ WHAT AN INDEPENDENT MUTATION PASS FOUND (25 mutants, 2026-08-13) — five survivors, and none
of them is a bug you can see by reading.** Every mutant ran BOTH package suites whole; a
behaviour-preserving control in both packages killed **0**, restoring the defect verbatim from
`b9554d0` killed **10**, and deleting the guard entirely (the double-cook) killed **11 + 2
pre-existing**. What lived through all 1,323 tests:

* **Two survivors are the band shapes above** — `REPRINT`/`ADDED` as two parts, and as two spec
  blocks. Both render. See the correction two paragraphs up.
* **A third puts `REPRINTADDED 2` on the paper** and passes everything, because both oracles ask the
  band to CONTAIN each word rather than to read as one. `27-F35`, not a suite, is what owns this.
* **The legacy-spool branch is asserted by nothing.** Deleting `if (prior.some((job) => job.covers
  === undefined)) continue;` — the declared interpretation that a row with no coverage HONOURS THE
  PAPER — kills **zero** tests. The suite defers it on purpose (its own "a spool written by the
  PREVIOUS version" note), so this is an honest gap rather than a miss, but read what the branch
  costs: it makes **a `covers` value that fails to persist for any reason indistinguishable from a
  pre-`03-F55` row**, and the failure it degrades to is *this FR's original defect* — that station,
  that order, silently loses every later addition, for ever. It is the safe direction (the
  alternative double-cooks), and it is one `continue` with no assertion under it.
* **`covers` may over-claim and nothing notices.** Recording the station's WHOLE line set instead of
  the lines this chit carried is behaviourally identical today (the union is the same) and kills
  zero tests — but `PrintJob.covers` is documented as *"what this document COMMITTED TO PAPER"*, and
  `03-F48`'s owed "reprint the last **chit**" is the reader that would consume the lie.
* **`isChitOf`'s ordinal regex is correct and untested.** Replacing it with a bare
  `job_id.startsWith(prefix)` kills zero tests. It bites only where one station's name extends
  another's — `TANDOOR` and `TANDOOR 2` is not an exotic kitchen — and then the second station's
  additions read as already committed and never print.

**And the durability half rests on ONE assertion.** Dropping `covers` from the `INSERT`, from the
`SELECT`, or from `commit()`'s `store.put` on the first state transition each fails **exactly one
test** — *"after a power cut, a line added reaches the kitchen and the old lines do not"*. Three
independent ways to lose the column, one guard over all of them.

**One trap for whoever runs this next.** `RESTOS_KOT_PRINTER` unset resolves to the BC-58U baseline
(32 columns), `03-F49` puts the KOT's floor at 42, and `03-F34` then refuses every chit — so the
drive above shows a `03-F5` band and no documents at all, which looks exactly like this defect
un-fixed. Set `RESTOS_KOT_PRINTER=TH230`.
