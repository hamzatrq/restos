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

**It sweeps BOTH of `27 §1a`'s counter panels** (`DEC-UI-001` (e), August 2026) — 1366x768 and
1920x1080, reloading between so the second gets `03-F5`'s band rather than inheriting an
acknowledged one. They are the same 13.6 x 7.6 inches of glass, so under `27-F68` they must hold
the SAME layout at different pixel counts; that is `27-F11c` stated as a test rather than as
prose, and it is the assertion a pinned pixel constant cannot pass.

**And it has ONE check that is not about fitting:** `27-F8`'s keypad target measured in
**millimetres of glass**, with the density read back out of the same seam the renderer was handed
it on. Every other check asks whether a thing FITS, and 126 CSS px fits a 1920x1080 panel
perfectly while being 22.7 mm instead of 20. Current run — 26 surfaces, 450 controls:

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
   as a `24-F14` EMPTY MATCH rather than as a silent pass. The states still NOT scripted are the
   ones to worry about — an open shift with a counted drawer, a 300-item catalogue, a refused
   escalation showing `REFUSAL_WORDS`, training mode's `27-F67` inversion.
3. **It does not judge legibility, contrast, typography or target size.** `27-F26`'s missing
   webfont is untouched — a control can be reachable and still unreadable. **`27-F8`'s target
   size is now the ONE exception**: since `27-F68` the gate measures a keypad target in
   millimetres of glass on both panels and fails below 20 mm ± 0.6. It judges that number and
   nothing else about type.
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