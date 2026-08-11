# @restos/pass-kds

**Owning spec: `specs/03-kitchen-fulfillment.md` — read it before modifying anything here
(AGENTS.md routing). Also `specs/27` (§1a, `27-F27`, `27-F28`), `specs/21`.**

**First, the thing that keeps this honest: for most deployments this app does not exist.**
`27-F11e` makes paper the primary kitchen interface and the pass screen **optional**. The printed
KOT (`03-F30`..`03-F45`, `27 §2b`) matters more. This is the T2 surface, and `03-F51` is why it
now matters at all: a restaurant that owns no thermal printer routes its stations to `screen`, and
until this app existed those tickets went **nowhere**.

## What a restaurant can do that it could not before

Ring an order on the counter, and it appears on a screen in the kitchen — oldest first, with its
channel, its table, its items and a timer — and a cook presses **DONE** and the line reaches
`ready` in the ledger. That is `03-F13`, `03-F14`, `03-F16` and `03-F24`, and none of it had a
surface before.

## Running it

```
pnpm -C apps/pos-electron rebuild:native   # ONCE — one physical better-sqlite3 serves both apps
pnpm -C apps/pass-kds start
```

Boot prints six lines and every one is a fact whose being wrong is **invisible from the screen**:
the identity, the panel density, the capacity this glass yields, the aging thresholds, the
ready-signal owner, and the uplink. That is the test for what belongs in a boot line here.

**Layer-2 / layer-3 keys, all read from the environment** because layer 2 has no transport to a
device (`01-F62` keeps `config.changed` out of every branch stream):

| key | FR | default |
|---|---|---|
| `RESTOS_READY_SIGNAL_OWNER` | `03-F24` — `pass \| kds \| counter \| waiter` | `pass` |
| `RESTOS_AGING_THRESHOLDS` | `03-F14` — `dine_in=10/20,delivery=15/25` | the FR's own defaults |
| `RESTOS_ORG_ID` / `RESTOS_BRANCH_ID` / `RESTOS_DEVICE_ID` | `01-F13` | the counter's DEV SEED ⚠ |
| `RESTOS_PANEL_PPI` | `00 §7` layer 3, `27-F68` | measured, else assumed |
| `RESTOS_CLOUD_URL` / `RESTOS_DEVICE_TOKEN` | `01-F47` | offline |

⚠ **`RESTOS_DEVICE_ID` must be set, and the boot line says so loudly.** Unset, this app takes the
same seed `device_id` as `apps/pos-electron`, and two devices sharing one id fork one outbox
(`01-F8`) while the gateway keys ingest per origin. Provision it:
`pnpm -C services/sync-gateway provision-device --org … --branch … --device … --class kitchen`.

## ⚠ THE COUNTER'S ORDERS REACH THIS SCREEN OVER THE **WAN**, AND THAT IS A `00 §5.1` BREACH

The single most important thing to know about this app, and it is a **product-shape finding**
rather than a limitation of any file here.

`01-F13`/`01-F15` put branch order traffic on the **LAN mesh** — shop-grade Wi-Fi, <1 s p95, no
WAN — which is what `00 §5.1` requires: *no in-branch feature may require WAN*. **That mesh is
built and hosted by nothing.** `mesh-session.ts`, `hub-election.ts` and `transport-ws.ts` all
carry seams-register debt markers saying so, and `restaurant-os.md` puts it in **Wave 0**.

So the only path that exists is the cloud gateway, and a branch whose internet drops has a pass
screen that stops learning about new orders while the counter goes on selling (`01-F17` — the sale
is never blocked, and correctly is not). **Not worked around here**: building a second,
screen-specific transport would invent a mechanism the corpus already specifies (commandment 2)
and give the branch two answers to one question. The fix is the Wave-0 mesh host.

## THE FINDING THAT SHAPED `ready-mark.ts`: `confirmed → ready` IS ILLEGAL

`LEGAL_NEXT.confirmed` is `["in_prep", "voided", "cancelled"]`. And on the branch this app is
**for**, that is exactly where every line sits:

- `02-F31`'s `kot.printed → in_prep` advance is **tier-gated to T1** (`autoAdvancesLines`), and a
  branch with a pass screen is T2 by `02-F31`'s own detection rule;
- `03-F51` makes a station routed `screen` **enqueue no print job at all**, so there is no
  `kot.printed` to advance from at any tier.

A ready-mark that emitted only `in_prep → ready` would find no eligible line and append nothing —
**wired and emitting nothing, which `DEC-HW-002` calls the worst option available** because it
looks finished with every gate green.

**The resolution is the shortest legal WALK, emitted as its own edges.** A bump on a line at
`confirmed` emits two events — `confirmed → in_prep`, then `in_prep → ready` — both legal, both
attributed to the same act, and every `from_states` a state the branch genuinely reaches. It is
not a jump and it is not a lie. The three refused alternatives, each on a resolving FR rather than
on preference, are argued at length in `ready-mark.ts`; the one to know is that
**`from_states: ["in_prep"]` on a line the fold projects as `confirmed` is forbidden** — a false
statement about a state the branch never reached, permanent under `01-F1`.

`ready` is **non-terminal**, so `preds: []` costs nothing here: `projectLine` takes ≼-max over all
legal edges rather than over heads and the anomaly map stays empty. That is measured through the
real merge engine in `__acceptance__/ready-mark.test.ts` §A, not assumed — and it is the one place
this differs from `line-advance.ts`'s terminal edge, which pays two `terminal_regression` flags.

## Commandment 8 — there is NO `PermissionAction` here, and that is deliberate

`PERMISSION_ACTIONS` has no line-state member and `apps/pos-electron`'s `WRITE_ACTIONS` fails
closed, so routing a ready-mark through `authorizeWrites` today would **deny** it.
`line-advance.ts` predicted this: *"the two human acts that DO produce this event type … will need
their own matrix row when they are [built]."*

**This app does not invent one.** That is a `packages/domain` change — SACRED (`18 §2`), protected
(commandment 10) — needing a spec PR that decides five role cells and senior review, and a session
building a screen may not decide those cells while building it. **And the corpus already answers
the question this screen asks:** `03-F24` says ready-signal ownership is *"a role assignment at
layer 2"*, `03 §7` lists it under Layer 2 beside the aging thresholds, and `ready-signal.ts`
enforces it **in main** with the renderer's claim never trusted — which is commandment 8's actual
property discharged through the control the owning FR names.

**What that leaves owed, named rather than left to look intentional:** the assignment is
per-DEVICE-role, not per-user. A pass screen assigned `pass` accepts a bump from whoever is
standing in front of it. **There is no `01-F26` PIN session on this device at all**, so
`actor_user_id` is `null` on every edge this app writes and `03-F16`'s *"with actor"* is **HALF
MET** — the event carries the device, the branch and the time, and not the person. **That is the
single largest gap in this app.**

## `27-F28` — capacity is STATED, not mandated, and the screen says what this glass holds

`DEC-HW-001`: a restaurant brings the glass it owns. So there is **no `PANEL_FLOOR_MM` here** and
no minimum that refuses, and the difference from the counter is a difference in kind: the
counter's surfaces have a fixed vertical demand it cannot page away (`27-F8`'s 20 mm keypad),
while this queue is a **paged** list where one ticket always fits and page 1 always holds the
oldest work. A small panel costs *situational awareness*, never *reachability*.

`TICKET_HEIGHT_MM` is **91.3 mm**, derived from `27-F28`'s own exact figure (*"22" is what a
3-ticket view costs"*) and cross-checked against its approximate one (a 10.1" tablet → 1.38, the
FR's *"about 1.5"*). Measured capacities, printed by the gate:

| panel | glass | tickets/page (1 column) |
|---|---|---|
| 22" 1920×1080 and 1366×768 | 274 mm | **3** |
| 32" TV | 398 mm | 4 |
| 15.6" laptop | 194 mm | 2 |
| 10.1" tablet / netbook | 126 / 130 mm | 1 |

⚠ **THE REFERENCE PANEL WAS KNIFE-EDGE ON ITS OWN DEFINITION.** The 22" panel yielded **3 tickets
at 1920×1080 and 2 at 1366×768** — the same glass, which is precisely what `27-F11c` forbids.
`TICKET_HEIGHT_MM` is exactly a third of the reference panel, so that panel divides to exactly
3.0, and 1366×768's 0.02% aspect-ratio residue tipped the `floor`. Fixed with a stated 0.5%
tolerance, **never a smaller ticket** (`27-F68` (b)). The shape recurs: *a constant derived from a
reference case makes that reference case the exact boundary of a `floor`.*

⚠ **THE VIEWING DISTANCE IS PINNED AT 1.5 m AND THAT IS AN OWED REFINEMENT.** `27-F27` makes
legibility **angular**, so a tablet propped at 0.7 m could legitimately hold twice this many
tickets. Scaling is not done because two laws collide on two channels: scaling the surface scales
**touch targets** with the type, and below 1.5 m that drives `27-F8`'s 96 dp kitchen target under
its floor, which `27-F68` (b) forbids by name; scaling type alone is a `packages/ui` component-API
change. **Owed**, and it needs a `00 §7` layer-3 key beside `panel_ppi`.

## THE QUEUE IS A PAGED GRID, AND THE FIRST SCREENSHOT IS WHY

`27-F28` costs a ticket in height, so the first implementation stacked full-width tickets in one
column. **It passed every check in `layout:check`** — nothing clipped, nothing overflowed, every
target 15.24 mm — **and the screenshot is a screen a founder rejects on sight**: on the 22" panel
`27-F11f` names, three tickets stretched to 487 mm each over a page **55% empty**. That is
`AGENTS.md`'s own warning live (*"two screens the founder rejected on sight passed every gate this
repo had"*) and `surface-mode.tsx`'s (*"`layout:check` asked whether things FIT and fitting is not
using the room"*).

`27-F2` derives page capacity from the surface's **usable area** and `27-F11a` does exactly that
(11 × 8), so the queue is a grid: `ticketColumns(width) × ticketRows(height)`, filled **row-major**
because `27-F7` makes the visual order the work order and a column-major flow would put the
second-oldest ticket *below* the oldest. `27-F28` is not weakened — its one non-negotiable clause
is *"fewer tickets, never smaller type"*, no type moved, and a narrow panel gets one column.

**The tension is recorded rather than won:** a 22" panel now yields 9 tickets (3 × 3) where the
FR's single-column arithmetic said 3. Whether 9 is *desirable* — against `27-F2`'s glance budget
and `03-F23`'s refusal to help the chef prioritise — is a founder call and a pilot question
(`21-F13`'s rush shadowing), not this app's.

## `pnpm -C apps/pass-kds layout:check` — 7 panels × 3 states, inside `pnpm verify`

It opens a real `BrowserWindow` from the app's **real** `PASS_WINDOW_OPTIONS` (imported, not
copied), mounts the shipped renderer, and measures in Blink. `RESTOS_LAYOUT_SHOTS=<dir>` writes a
PNG per surface. Current run: **21 surfaces, 57 controls, 29 bump controls, 14 paged surfaces, 7
`27-F8` targets measured**.

The sweep spans **81 → 398 mm** of height. `probe-phone` (6.5" landscape, 81 mm — under one
ticket) is the only `ships: false` row and it is the failing case the sweep rests on: every other
row is evidence that hardware works, and a capacity claim needs a panel that does not.
**If `probe-phone` ever goes quiet, the layout has become smaller than the FR says a ticket
costs.**

**Mutation matrix — control: 41/41 tests, gate GREEN.** In-tree, byte-exact backups with a restore
trap and a no-op-mutant guard.

| # | mutant (exactly one branch) | suite | gate |
|---|---|---|---|
| M1 | **THE SEAM** — main drops the `readyMark.mark` call | **1** | — |
| M2 | **LAW 1** — the queue returns ARRIVAL order, unsorted | **2** | — |
| M3 | **THE WALK** — only the last hop is emitted (confirmed lines never move) | 1 | — |
| M4 | **THE LIE** — one `ready` edge claiming `from_states: ["in_prep"]` | 1 | — |
| M5 | `03-F24`'s read-only refusal dropped | 2 | — |
| M6 | `01-F31` — a contested line decided by taking `states[0]` | 1 | — |
| M7 | **LAW 2** — the age clock drops the branch-time offset | 1 | — |
| M8 | **THE PLANE** — `panelPpi` pinned instead of resolved | 1 | — |
| M9 | **NEGATIVE CONTROL** — a real refactor of `readyEdgesFor` | **0** | — |
| L1 | **`27-F68` (a)** — `cssPxPerDp` returns one panel's answer | — | **RED, 1** |
| L2 | **`27-F68` (b)** — the kitchen target trimmed 96 → 64 dp | — | **RED, 7** |
| L3 | **THE FIXTURE** — the read-only state never renders | — | **RED, 7** |
| L4 | `03-F24` — the app draws DONE when it is not the owner | — | **RED, 7** |
| L5 | **NEGATIVE CONTROL** — grid gap `space-3` → `space-2` | — | **GREEN** |

**M9 and L5 are what make every red row mean anything**: a real one-branch edit reddens nothing.

**L1's numbers are the finding rather than the kill.** With the conversion pinned, the 96 dp bump
target measures **10.79 mm to 35.42 mm across seven panels** — a 3.3× spread on a number `27-F8`
fixes at 15.24 mm. The gate fails on the one panel that falls *below* the floor, and note the
check is one-sided by design: `27-F8` is a minimum, so a target rendered too LARGE is not a
violation. Without a multi-panel sweep the trap that FR forbids by name ships through a green rail.

**⚠ THREE MUTANTS SURVIVED THEIR FIRST DRAFT, and each was a defect in the guard, not the code.**
1. **M6 survived** because the arity guard is **masked**: every contested cell `merge.ts` can
   actually produce is all-**terminal**, so relaxing `states.length !== 1` to take `states[0]`
   still hits the done-check and still refuses. The fixture could not tell the guard from its
   absence. A **directed** multi-state cell whose first member *would* advance legally replaces it
   — the same masking `apps/pos-electron`'s own M8 row records one module over.
2. **M4 survived** because the mutant did not reproduce the defect it named: it rewrote
   `from_states` while the walk still emitted both hops, so the claim was true. The dangerous
   implementation — one edge, no first hop — kills it.
3. **M7 survived because the SEAM ASSERTION MATCHED A SECOND OCCURRENCE OF THE SAME STRING.** It
   asserted `MAIN` contains `wallClock.now() + store.branchTimeStatus().offset_ms`, and that
   appears **twice** in this host: on the age clock and on `businessDay`. Dropping the offset from
   the queue's clock left it green. Anchored on the argument name now. **Reading the suite found
   none of these; only mutating did.**

## WHAT THE GATE CANNOT CATCH — do not read a green run as "the screen is right"

1. **Main is a stub.** `__acceptance__/pass-seam.test.ts` owns the IPC contract, and it is source
   reads: `main/index.ts` builds an Electron app at module scope and no suite can import it.
2. **It only sees the states the fixture produces.** Three are scripted (owner / read-only /
   empty), each with a `24-F14` presence check. **Not scripted:** a ticket whose lines are all
   contested, a 40-order rush (`03-N4`), `27-F67`'s training inversion, `27-F19`'s dark KDS opt-in.
3. **`27-F27`'s ANGULAR CAP-HEIGHT — the one measurement a KDS actually turns on — is measured by
   nothing here.** A ticket can be perfectly composed and unreadable at 1.5 m. This is the largest
   gap in the rail and `27 §9`'s open question 5 is the same one.
4. **One DPI, one platform.** Every panel is simulated on a macOS host.
5. **`27-F4`'s positional contract is invisible to it.** Controls may be reordered freely.

⚠ **The gate derived its density from `window.screen` for one round** — the HOST's display, which
is one fixed size — so every simulated panel resolved to the same PPI and the `27-F8` target
printed an identical 15.24 mm on all seven rows. **A constant that looked exactly like a passing
measurement.** It reads `window.innerWidth` now.

## Deliberately absent, and this is the corpus's strongest anti-scope statement (`03-F23`)

No auto-prioritisation, no reordering, no filter, no "cook this next" — **at any tier, ever.
Chronological order + aging colour is the entire sequencing UI; the chef decides.** Also absent by
their own FRs: **prices** (`03-F32` — the kitchen data model has no money field at all) and
**ETAs** (`03 §3`). `pass-seam.test.ts` §F asserts all of it structurally, because a red ticket on
page 2 looks like a bug to a helpful session and it is not.

## What is deliberately not built

- **`03-F16`'s 86-ing half** (`availability.changed` from the pass, `01-F22`). **Scoped out by
  coordination**: another session is building `02-F7`'s counter toggle concurrently, and two
  surfaces inventing one mechanism in one wave is how the fold gets two writers with different
  supersedes discipline (`01-F57`). The pass surface owns `03-F16`'s **ready-marking** half; the
  counter owns the availability half. Closing it needs `AvailabilityRow.head_ids_json` — which
  exists, *"exported so an operator surface can build a correct supersedes link"* — so it is a
  screen and a call, not a design.
- **`03-F18`'s per-station KDS mode.** `03-F20` is explicit that *"the pass sees the whole order;
  stations see only their part"*, so this ships the **pass** reading and the station filter is the
  other mode of the same app. `stationOf` is in `sync-client` already; what is missing is a
  layer-3 station identity and a mode switch.
- **`03-F48`'s reprint / reroute from the pass**, and **`03-F17`'s recall strip** (the last 20
  cleared orders). Both are real FRs and neither is started.
- **`03-F15`'s "waiting on naan"** — the counts ship (`2 of 3 ready`), the *sentence* does not.
- **`27-F19`'s dark KDS opt-in.** `27 §9`'s first open question is a pilot A/B and this ships the
  documented default; the opt-in is one prop and a layer-3 key when the pilot answers.
- ~~**`27-F26`'s typeface.** No webfont is bundled.~~ **CLOSED in all three (August 2026)** —
  `packages/ui/src/fonts` bundles it and `main.tsx` calls `installFontFaces()`; this app's own
  gate asserts all three weights are LOADED on all 21 surfaces, not merely named. The `18 §15`
  call the old note rested on was right and is now satisfied: no npm dependency, a `18 §14` row,
  and `18 §1`'s allowlist widened to OFL 1.1 for font assets (**senior approval owed**).
  ⚠ **The first run of that check failed 42 times and the bug was the import landing without the
  call** — the wave's own defect, in the change that closed it. Biome called it a warning; the
  gate called it fatal.
  ⚠ **`◀`/`▶` — this app's pager arrows — are in NO IBM Plex Sans subset**, so they are OS glyphs
  permanently and a residue of platform-dependent metrics survives there. An icon component, not
  a bigger font, is the fix if it ever matters.

## ONE MODULE — THE PROBE — IS STILL IMPORTED ACROSS THE APP BOUNDARY

⚠ This section said **TWO MODULES AND THE PROBE** and was correct until August 2026. The two
modules are `@restos/device-config` now, along with this app's own `aging.ts`, which the counter
had been reaching across for — so the debt this section recorded as **OWED** is paid on the shipped
side and `apps/pos-electron` and `apps/pass-kds` are no longer a cycle. `18 §2` states the
dependency direction as a MUST (*"Apps NEVER import ... other apps"*) and `DEC-ARCH-001` rules
EXTRACT at the moment a module acquires its second consumer; the argument against copying is
unchanged and is why they moved rather than multiplied — two interpretations of what
`RESTOS_PANEL_PPI` means, of whether a padded `RESTOS_DEVICE_ID` refuses, or of when food is late
diverge silently (`03-F40`'s two incompatible sensor bit layouts is the corpus's own instance).

**What is left is `layout-gate/main.ts` → `apps/pos-electron/src/layout-gate/probe`**, and it is
named rather than hidden: `shared-config-extraction.test.ts` allowlists that one edge **by name
with its reason**, as a subset test so removing it later does not red. It is the same debt in kind
— *"is this control on the screen"* must have one interpretation — but it is CI rail rather than
shipped app code and it is serialised with `Function.prototype.toString()` to run inside the page,
so it cannot become an ordinary package import without redesigning how the probe is delivered.
**Still OWED.**

## ⚠ `18 §3` LISTS THIS APP AS EXPO AND IT IS ELECTRON

`18 §3`'s layout reads `pass-kds/ # Pass screen + KDS (Expo, tablet landscape)` and `03 §8` says
*"one Expo app with a mode switch"*. Both are **tech notes**, not FRs, and the deviation is stated
rather than slipped in — **a `18 §3` amendment is owed as a spec PR** (commandment 9). The three
reasons are in `electron.vite.config.ts`; the one that decides it is that `packages/ui` is a DOM
kit and `pnpm layout:check` renders in Blink, so an Expo pass screen would re-implement the visual
language **and** have zero layout coverage — *"a surface the gate does not render is a surface with
no layout coverage at all"*, this repo's single most repeated finding.

**The real cost, stated: this does not run on an Android tablet.** The renderer is a pure React
tree over `packages/ui` behind one bridge type so that host is a port and not a rewrite, but until
someone writes it, "a 10" tablet propped at the pass" means a tablet running a browser or a small
PC driving the panel.
