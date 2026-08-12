# The decorative-surface audit — repo-wide, August 2026

**Measured at `3dd8900`** (the pushed tip), in the worktree `w5/decorative-audit`. This is a
**measurement, not a fix**: nothing outside this file was changed. Every claim below carries the
probe that produced it, with its real output, so a reader can re-run it and disagree.

The founder's standing instruction for this round: *"no decorative. we need functional everything."*
One decorative surface had already been found by mutation this week (`apps/manager`'s alarm list —
`branchSnapshot()` returns `reachable: false` unconditionally). A sibling track owns that one; this
sweep looked for the others.

## The three states, kept separate throughout

Per the brief, and never conflated:

- **(a) built and genuinely running** — executes with real data in the shipped binary.
- **(b) built, statically reachable, never executed with real data.** This is the class the founder
  is asking about and the one no rail can see: `seams:check` Rule A asks whether shipping code
  *reaches* an export, Rule B whether an optional member is *supplied*, and **a stub is a supply**.
- **(c) not built.**

A fourth state turned out to matter enough to name: **(d) built, running, and mis-recorded** — the
inverse disease, where a governance document still files a closed item as owed. §3 is all (d), and
it is not a footnote: two of the entries there are load-bearing claims about what this product can
physically do.

---

## What I did NOT find, stated first

**The core money and catalog paths are (a).** I went looking for a stubbed port on the paths that
would hurt most and did not find one:

- `services/api`'s `start()` supplies **real** gateway-backed adapters for all four ports
  (`server.ts:296–314`): `createGatewayCatalogPublisher`, `createGatewayLedgerAppender`,
  `createGatewayDeviceDirectory`, `createGatewayDayLedger`. The `createMemory*` and
  `unconfigured*` variants exist but are not what the shipped entry point (`tsx src/server.ts`)
  builds.
- The `unconfigured*` fallbacks **throw** rather than answering `[]`. `ledger.ts:80` is the model
  the rest of the repo should copy — an empty answer would render `Rs 0` over a day that traded,
  and the file says so in its own header.
- Every `/internal` path the API calls is served by the gateway. Probe:

```
API calls:    /internal/catalog/publish  /internal/catalog/published  /internal/devices
              /internal/devices/revoke   /internal/ledger/window      /internal/org-events
Gateway serves: /internal/catalog/publish  /internal/catalog/published  /internal/devices
              /internal/devices/revoke   /internal/ledger/window      /internal/org-events
```

- `apps/backoffice` has no constant-backed data source. A comment-stripped sweep for
  `^\s+[a-zA-Z_]+: (false|true|null|\[\])` across all 28 files returns only genuine config literals
  and result discriminants (`disruptive: false`, `retry: false`, `ok: false`).
- `packages/ui`'s 18 components: 17 are rendered by a shipped screen, directly or through
  `AppShell`/`StatusStrip`/`TicketCard`. Only `Surface` is unrendered, and it carries its own
  `@unreached-owed` marker saying exactly that.

The `@unreached-*` register is doing its job. A clean `seams:check` reports 29 by-design and ~31
owed markers, and spot-checking them found the *conclusions* accurate. §3.7 is the one exception,
and it is a stale **reason**, not a stale conclusion.

---

## 1. Findings, ranked by what would hurt a real restaurant on day one

### 1.1 — There is no way to train staff. `01-F49`'s branch class does not exist. **(c), with (b) chrome on top**

**What it is.** `DEC-TRAIN-001` is RATIFIED, filed W1, and the research finding behind it is blunt:
*"staff either train on live tickets — polluting an append-only ledger and every report built on
it — or they do not train at all."* The **UI half is fully built**: `27-F63`'s band, `27-F65`'s
luminance step and `27-F67`'s full palette inversion all ship, and `AppShell` renders them from a
`training` prop.

**The probe.** Trace the prop to its source:

```
$ grep -an "training" apps/pos-electron/src/main/index.ts
612:    // 01-F49 — bound at admission from the branch class, never a UI toggle. Admission has not
613:    // landed, so this is false and the 27-F67 training inversion is exercised by its story.
614:    training: false,
```

And the concept it is meant to be bound from does not exist anywhere:

```
$ grep -arn "training\b" packages/domain/src packages/sync-client/src services/sync-gateway/src \
    --include=*.ts | grep -av '\.test\.' | grep -av '^\S*:[0-9]*:\s*\*\|//'
(end)          # zero hits — no branch `class`, no `production | training` anywhere
```

**What it does today.** `training` is a hardcoded `false` on the one line that feeds the whole
mechanism. The inversion is exercised only by a Storybook story.

**What it should do.** A branch carries `class: production | training`; the device learns its
class at admission (`01-F47`) and the shell inverts.

**BLOCKED or UNBUILT.** **UNBUILT, and cheap-looking but genuinely blocked at the far end**: the
device cannot learn a branch class it is never told, so this needs a field on the branch record and
one on the admission response before the app line can change. It is *not* blocked on the UI.

**Why it ranks first.** Every other finding here is a thing that works badly or is missing a record.
This one determines what happens in the founder's restaurant in week one: staff will be trained on
the live ledger, and `01-F1` makes that permanent. The comment on line 612 is honest and the gap is
recorded — but nothing in the owed lists names it, and the shipped chrome makes the product *look*
as though the capability is there.

---

### 1.2 — A manager approving an over-threshold act leaves no audit record. **(c)**

**What it is.** Four of `01-F5`'s audit subtypes have a payload schema in `packages/domain` and
**no producer anywhere in shipping code**.

**The probe.** A producer census over all 39 registry event types, run against comment-stripped
shipping files (`apps/*/src`, `services/*/src`, `packages/*/src`, minus tests/fixtures/stories),
excluding the registry itself:

```
=== audit.drawer_opened      [0]
=== audit.reprint            [0]
=== audit.settings_changed   [0]
=== audit.threshold_override [0]
```

For contrast, the same census on the four order edges that only appear in `folds/merge.ts` — a
*consumer* — confirms the method distinguishes producers from folds:

```
=== order.parked        [1]   packages/sync-client/src/folds/merge.ts
=== order.unparked      [1]   packages/sync-client/src/folds/merge.ts
=== order.rejected      [1]   packages/sync-client/src/folds/merge.ts
=== order.table_assigned[1]   packages/sync-client/src/folds/merge.ts
```

**Why `audit.threshold_override` is the one that matters.** It is not merely unbuilt — the product
has a live code path that *should* write it and knowingly does not. `apps/pos-electron/src/main/index.ts`,
on the second `createPinSession` (the manager-approval pad):

> **`audit: () => {}` is a stated gap, not the instance-4 defect repeating.** `createPinSession`
> hardcodes `type: "audit.login"`, and a manager who authorised a paid-out did NOT log in …
> `01-F5`'s `audit.threshold_override` is the subtype this act belongs under, but the sink cannot
> express it and `sync-client` is a protected path outside this task.

That reasoning is correct — writing `audit.login` for an approval would be a false record, which is
worse. But the consequence stands: **a manager approving an over-threshold paid-out today produces
no audit event.** What survives is the approver on the business event itself (`02-F20`) and the
failed-attempt counter. What is lost is the `01-F5` per-device hash chain over the override, which
is the thing that makes a quiet approval detectable.

**BLOCKED.** On `packages/sync-client`'s audit sink accepting a subtype — a **protected path
(commandment 10), senior review required.**

`audit.drawer_opened` is the same shape one surface over: `cash.drawer_opened` has five producers,
its audit counterpart none. `audit.reprint` and `audit.settings_changed` have no corresponding
surface yet and are ordinary (c).

---

### 1.3 — The till's kitchen queue is exposed to the renderer and no screen reads it. **(b)**

**What it is.** A complete, four-layer IPC capability with zero consumers.

**The probe.** I cross-checked every IPC channel in both Electron apps against its main handler,
its preload binding and its renderer call sites, comment-stripped. All 18 pos-electron channels have
a handler and a binding; 17 have a renderer caller. `kitchenQueue` has none:

```
$ for f in $(find apps/pos-electron/src/renderer -name '*.tsx' -o -name '*.ts' | grep -av '\.test\.'); do
    perl -0777 -pe 's{/\*.*?\*/}{}gs; s{//[^\n]*}{}g;' "$f" | grep -an "kitchenQueue"; done
(end)          # zero renderer references, comments stripped
```

The supply side is fully built:

```
apps/pos-electron/src/shared/ipc.ts:699     kitchenQueue: "restos:kitchen-queue"
apps/pos-electron/src/shared/ipc.ts:839     kitchenQueue: () => Promise<KitchenTicket[]>
apps/pos-electron/src/preload/index.ts:16   kitchenQueue: () => ipcRenderer.invoke(CHANNELS.kitchenQueue)
apps/pos-electron/src/main/index.ts:1190    ipcMain.handle(CHANNELS.kitchenQueue, () => gateway.kitchenQueue())
apps/pos-electron/src/main/gateway.ts:468   kitchenQueue: () => { … deps.store.kitchenQueue().map(…) }
```

**Important qualifier — the store method is alive.** `main/printing.ts` calls
`store.kitchenQueue()` internally. What is dead is the **renderer-facing channel**: the handler at
`index.ts:561` is never invoked by the shipped UI.

**What it should do — and this is a product question, not a cleanup.** The pass queue now lives in
`apps/pass-kds`, a **separate app on separate glass**. A single-terminal restaurant — which is what
`resolveLanMesh` being unset by default describes, and plausibly what the founder's own restaurant
is on day one — therefore has **no way to see the kitchen queue at all**, while the till carries a
fully built read for exactly that. Either the channel should be deleted, or it is the answer to the
one-machine case. That is a founder call, not a maintenance decision.

**UNBUILT** (the consumer), not blocked.

---

### 1.4 — `pnpm verify` fails at step 1 and never reaches the layout gate; the gate itself is red on 23 verdicts, not 1

**What it is.** A baseline-drift finding in two layers, and the most likely of these to waste
someone's day.

**Layer one: `verify` does not get to the layout gate at all.** The script is `&&`-chained:

```
$ grep -a '"verify"' package.json
"verify": "pnpm docs:lint && pnpm typecheck && pnpm lint && pnpm tokens:check && pnpm seams:check && pnpm layout:check"

$ pnpm docs:lint
docs-lint: 1 finding(s)
  ✗ duplicate FR definition 03-F53: specs/03-kitchen-fulfillment.md:163 and specs/03-kitchen-fulfillment.md:173
REAL_EXIT=1
```

Pre-existing at `3dd8900` — `git diff HEAD --stat` in my worktree is empty, so this is not mine.
**`pnpm verify` therefore fails on its first step, and steps 2–6 never run.** Any statement about
what `verify` is "known-red on" downstream of `docs:lint` is currently unverifiable by running it.

**And the duplicate is a commandment-9 hazard, not a lint nit.** Two different FRs hold the ID
`03-F53`:

- `:163` — *"The pass runs `01-F26`'s PIN session, and the gate is on the ACT, never on the QUEUE."*
- `:173` — *"`printer.status_changed`'s payload, and the ONE distinction that decides it…"*

Commandment 9 requires behaviour-carrying code to cite a resolving FR ID. `03-F53` now resolves to
two unrelated requirements, and **both meanings are already in circulation**: `AGENTS.md` cites it
once for the dev-seed roster move to `@restos/device-config` and `pass-kds/main/index.ts` cites it
for the serve-signal owner. `grep -rn "03-F53" specs/` no longer answers the question commandment 2
tells you to ask it. Renumbering is forbidden for existing IDs, so this needs an owner's decision,
not a drive-by.

**Layer two: the gate, run directly, is red on 23.** The standing note for this round says
*"`pnpm verify` is known-red on exactly ONE layout verdict (`tablet-10.1 tab:Cash`, owed under
`27-F42`)."* Invoked on its own, it is red on **23**.

**The probe** (run twice, identical both times — a single red is as untrustworthy as a single green):

```
$ pnpm -C apps/pos-electron layout:check      # via xvfb, screen 2560x1600x24
LAYOUT GATE FAILED — 23 violation(s):
  [alarm] [counter-1366 tab:Sold out]   EMPTY MATCH — the work area contains no INKED element at all…
  [alarm] [counter-1366 tab:Sold out]   EMPTY MATCH — 02-F7's Sold-out grid drew no 86'd tile…
  … the same pair on counter-1920, laptop-1280, tablet-10.1, netbook-1024, probe-below-floor,
    tablet-11.6, laptop-12.5, laptop-13.3-hd, desktop-24, ultrawide-32  (11 panels × 2)
  [alarm] [tablet-10.1 tab:Cash] OVERFLOW y: main … 570px of content in a 567px box — 3px CLIPPED
REAL_EXIT=1
```

So: 1 verdict is the declared baseline, **22 are undeclared**, and all 22 are `tab:Sold out` in the
`[alarm]` fixture state on every panel.

**⚠ A caveat I must state, because it changes who should act.** My host renders with
`--disable-gpu` under Xvfb. These 22 verdicts are **timing-sensitive** (§1.5), so a faster host may
show zero of them. I cannot tell from here whether CI is currently red or whether this is a latent
flake that fires on slow hardware. **Both readings are bad and neither is "fine":** either the gate
is red and unreported, or the repo's most trusted rail has a race that will fire on the cheapest
till in the fleet. Someone with the reference host should re-run and record which it is.

---

### 1.5 — The Sold-out surface paints nothing for ~200–300 ms; it is the only tab that does

**What it is.** The root cause under §1.4, and a real (if small) product defect on its own.

**First probe — the verdict is not a false read of the DOM.** I replicated the gate's sequence
standalone (load the shipped renderer with the gate's preload, identify Hina, key `1234`, press
`Unlock`, click the Sold-out tab) and sampled the work area:

```
BEFORE CLICK:              buttonsInMain:36  mainText:"Dine-in|Takeaway|Delivery|Send to kitchen…"
AFTER CLICK  (~0ms):       buttonsInMain:0   mainText:""
AFTER CLICK  (~50ms):      buttonsInMain:0   mainText:""
AFTER CLICK  (~200ms):     buttonsInMain:0   mainText:""
AFTER CLICK  (~550ms):     buttonsInMain:46  mainText:"Chicken Biryani|Sold out|Mutton Biryani|Sold out — disputed|"
```

**Second probe — it is unique to this tab.** Ink in `<main>` sampled every 100 ms after tapping each
tab in turn (values ≥1000 mean text is present; `0` means no buttons and no text at all):

```
TAB Order      -> 0ms:1036  100ms:1036  200ms:1036  300ms:1036 …
TAB Orders1    -> 0ms:1000  100ms:1000  200ms:1000  300ms:1001 …
TAB Pay        -> 0ms:1018  100ms:1018  200ms:1018  300ms:1018 …
TAB Cash       -> 0ms:1023  100ms:1023  200ms:1023  300ms:1023 …
TAB Me         -> 0ms:1000  100ms:1000  200ms:1000  300ms:1000 …
TAB Sold out   -> 0ms:0     100ms:0     200ms:0     300ms:1046 …
```

Every other tab has its content at 0 ms. Sold out is empty for ~200–300 ms and then complete.

**Mechanism.** `Counter.tsx:1626` gates the **entire** grid on a measurement:

```tsx
{soldOutMm === null ? null : ( … the whole grid … )}
```

`soldOutMm` comes from `usePhysicalSize()` on the surface's own ref. That hook is correct and its
`null`-until-measured contract is deliberate (`physical.tsx`: *"a default is a guessed panel by
another name"*). But it means nothing paints until a `ResizeObserver` round-trip completes after the
tab mounts. The other tabs read the panel size from `PanelSizeContext`, measured once at
`PanelRoot`, so they never wait.

**A screenshot at rest shows the tab is completely correct** — full grid, `Chicken Biryani /
Sold out`, `Mutton Biryani / Sold out — disputed`, the greyed tiles, the alarm band above. So this
is **not** a decorative surface. It is a blank window on the way in.

**Why it is still worth ranking here.** The gate waits 350 ms and lands on the wrong side of that
window on this host, which is what makes the rail red. **The tempting fix is to widen the gate's
timeout, and that would be the wrong one** — it would silence a `24-F14` tripwire that is currently
telling the truth. The surface fix is to render the grid's chrome (or a measured-once panel size)
without waiting for a per-surface observer.

**UNBUILT** (the non-blocking render path); not blocked by anything.

---

### 1.6 — Unresolved merge-conflict markers are committed at the pushed tip

**The probe:**

```
$ git grep -an "^<<<<<<< \|^=======$\|^>>>>>>> "
apps/pos-electron/src/layout-gate/main.ts:265:=======
apps/pos-electron/src/layout-gate/main.ts:268:>>>>>>> worktree-agent-a4d261efec1f284be

$ git show HEAD:apps/pos-electron/src/layout-gate/main.ts | grep -an "^=======$\|^>>>>>>> "
265:=======
268:>>>>>>> worktree-agent-a4d261efec1f284be
```

One file, repo-wide. The markers sit **inside a block comment**, so nothing fails to compile and no
rail sees them — which is exactly why they survived.

**The substance is worse than the hygiene.** The conflict is in the doc comment for
`SURFACES_PER_PANEL`, and that comment carries a **merge warning about itself**:

> ⚠ **MERGE NOTE for the pass-screen branch:** that branch changes the leading `1` to `2` … The
> merged value is `2 + 6 * 2 + 2`, not either side alone — a textual merge of these two edits will
> take one number and drop the other.

The constant did land correctly (`SURFACES_PER_PANEL = 2 + 6 * 2 + 2`), so the floor is right. But
the two conflicting descriptions of it are both still in the file, one of them now false (*"one lock
surface, SIX tabs"* — there are two lock surfaces). A reader gets contradictory prose about the
number the gate's whole-panel-loss tripwire rests on.

---

### 1.7 — Two production tRPC procedures are test fixtures that act on nothing. **(b)**

**The probe** — every procedure cross-checked against back-office call sites, comment-stripped:

```
archive 2   cancelPending 1   enabled 1   history 11   pending 3   published 2   save 2
list 2      revoke 2          nightly 1   login 1      whoami 1
runDayEnd 0     editMenuPrices 0     voidAfterKot 0
```

- **`runDayEnd` is a false positive and I am recording it as one.** It has no back-office caller by
  design; `server.ts:327` installs the real production path as an interval calling the same
  `scheduler.runDue()`. Verified present in `start()`. **(a).**
- **`editMenuPrices` and `voidAfterKot` are real (b).** Both are `authorized(...)`-gated mutations
  mounted on the shipped router whose entire body is an echo:
  `.mutation(({ ctx, input }) => ({ ...input, org_id: ctx.subject.org_id }))`. `router.ts:79`
  documents them honestly as the B-2 authorization **fixture**, used by fifteen assertions, and says
  deleting them would delete that coverage.

That justification is sound for `editMenuPrices`. It is weaker for **`voidAfterKot`**, which is
mounted as `ops.voidAfterKot` — a plausible-sounding production endpoint any authenticated client
can call, which authorizes correctly and then does nothing. Nobody voids a KOT through it. The risk
is not exploitation; it is a future session finding `ops.voidAfterKot` and believing the void path
exists.

---

### 1.8 — Confirmed still true from `running-the-stack.md` §7 (declared, re-measured)

These are already recorded in the runbook. I re-measured them rather than carrying them forward,
because that document has been wrong in both directions before.

| thing | probe | state |
|---|---|---|
| staged edits are process memory | `server.ts:291` → `createMemoryStagedEditStore()`; `catalog.ts:121` → `new Map` | **still true.** A `14-F28` day-end edit does not survive an API restart, and the pending list that promises *"cancellable until they land"* silently empties |
| the owner account is process memory | `server.ts:317` → `createMemoryUserStore(bootstrapUsers(env))`; `users.ts:60` → `new Map` | **still true.** One env-declared owner; no user table, no creation, no reset |
| the quarantine read surface has no reader | `@unreached-owed` in `services/sync-gateway/src/quarantine-query.ts` | **still true** |
| the Auditor's read-model diff leg is not driven | `services/jobs/src/index.ts` header; five of six legs run | **still true, and correctly reasoned** — supplying it would mean inventing the projection |
| no printer (K-8) | every confirm raises `03-F5`'s band ~20 s later | **still true** |

`services/jobs` itself is **(a)**: a real BullMQ host with a declared `start` script, spawned and
read by its own acceptance suite.

---

## 2. What I could not probe, stated plainly

Per the brief: a truthful wall is worth more than a green suite.

- **I did not drive the full four-process stack.** Docker is available on this host and the runbook
  is good, but standing up Postgres + gateway + API + back office + a till and working a business
  day was beyond this session's budget alongside the sweep. The API-side and gateway-side halves of
  every seam were checked statically and by path-matching; **the wire was not exercised end to end
  by me.** The two independent runs recorded in `running-the-stack.md` are the evidence that it
  works, and they are not mine.
- **`apps/pass-kds` was audited statically only.** Its IPC surface is fully consumed (all 7 channels
  have a renderer caller, unlike pos-electron's 18-of-17), it hosts both a cloud uplink and a LAN
  mesh, and it stamps `actor_user_id` on both edges it emits. I did not launch it.
- **The 22 Sold-out verdicts need a re-run on the reference host** to decide between "CI is red" and
  "latent race". I cannot settle that from a software-rendered Xvfb box, and I have not pretended to.
- **`RESTOS_PRINT_TO_FILE` was not exercised**, so nothing here touches K-8.

---

## 3. The honest inverse — items filed as OWED that have CLOSED

Same disease, sign flipped. Each of these is a claim in a governance document that a probe now
falsifies. Two of them are load-bearing claims about what the product can physically do.

### 3.1 — The LAN mesh **is** hosted. `AGENTS.md`'s "hosted by nothing" is stale, and so is "RestOS is T1-only today"

`AGENTS.md` states the mesh *"is BUILT and **hosted by nothing**"*, that the only construction is a
spike file, and concludes **"RestOS is T1-only today"**. Probe — real `createMeshSession`
constructions in shipping code, comments stripped, spikes and tests excluded:

```
packages/sync-client/src/mesh-session.ts:70    (the declaration)
apps/pos-electron/src/main/mesh.ts:147         const session: MeshSession = createMeshSession({…})
apps/pass-kds/src/main/mesh.ts:141             const session: MeshSession = createMeshSession({…})
```

Both apps wire it unconditionally — `createLanMesh({ store, lan, onChanged })` at
`pos-electron/main/index.ts:484` and `pass-kds/main/index.ts:273`, each with `mesh.stop()` on
quit and `mesh.notifyAppended()` on append. The `@unreached-owed NO HOST RUNS THE LAN MESH YET`
marker that `AGENTS.md` quotes from `mesh-session.ts` **is gone from that file.**

**The precise, fair statement** — because "hosted" and "meshing" are different claims: a host now
exists and is **env-gated**. `resolveLanMesh(process.env)` reads `RESTOS_LAN_HOST`,
`RESTOS_LAN_PORT`, `RESTOS_LAN_PEERS`; absent, `createLanMesh` returns `unmeshed()`, which reports
`lan: "down", hub: "down"` honestly. So the correct owed item is *"no deployment configures the
mesh"*, which is much smaller than *"nothing hosts it"*.

### 3.2 — Device identity **is** env-configurable. `AGENTS.md` item (13) is falsified by its own grep

Item (13) — the "thirteenth instance", the one described as a new shape the rail cannot express —
rests on this stated measurement:

> a symbol-precise grep for `RESTOS_DEVICE_ID`/`RESTOS_ORG_ID`/`RESTOS_BRANCH_ID`/`RESTOS_IDENTITY`
> across `apps/`, `services/` and `packages/` returns **nothing**

Re-run verbatim:

```
$ grep -arn "RESTOS_DEVICE_ID\|RESTOS_ORG_ID\|RESTOS_BRANCH_ID" apps/ services/ packages/ \
    --include=*.ts --include=*.tsx | grep -av '\.test\.'
packages/device-config/src/device-identity.ts:59:  org_id: "RESTOS_ORG_ID",
packages/device-config/src/device-identity.ts:60:  branch_id: "RESTOS_BRANCH_ID",
packages/device-config/src/device-identity.ts:61:  device_id: "RESTOS_DEVICE_ID",
```

And both apps consume it: `resolveDeviceIdentity(process.env)` at `pos-electron/main/index.ts:433`
and `pass-kds/main/index.ts:165`. **So "two tills cannot be run at all" is no longer true**, and the
corollary `AGENTS.md` draws from it — that `02-F11` is *"unreachable from the shipped binary"* —
falls with it. Combined with §3.1, the two independent grounds for the T1-only claim have both
closed.

### 3.3 — `approval.requested` has a producer

`AGENTS.md`: *"What is missing upstream of all three resolutions: **nothing emits
`approval.requested`***". It is emitted by `apps/pos-electron/src/main/approval-record.ts:188`,
constructed at `main/index.ts:920` and reached from the renderer through
`ipcMain.handle(CHANNELS.escalationFor, … approvalRecord.raise(req))` at `index.ts:1483`.
`Counter.tsx:686` calls it. The doc-05 *queue* still has no consumer, which is the real owed item —
but the producer exists.

### 3.4 — `served` has a producer, and the pass screen attributes it

`AGENTS.md`: *"nothing at T2 emits `served`, so a fully-ready ticket never leaves the queue"*.
`apps/pass-kds/src/main/serve-mark.ts` is the producer — its own header calls itself *"the **third**
production emitter of `order.line_state_changed`"*. The same file's sibling claim, *"no PIN session,
so `actor_user_id` is `null` on every ready edge"*, is also closed: both `ready-mark.ts` and
`serve-mark.ts` stamp `actor_user_id`, typed non-nullable at the emitter.

### 3.5 — `Uplink.catalogRefusal` is consumed and reaches the screen

`running-the-stack.md` §7 OWED item 5: *"`Uplink.catalogRefusal` carries `01-F56`'s refusal out of
the cloud session and **nothing consumes it**"*. It is consumed at
`apps/pos-electron/src/main/gateway.ts:312`, turned into words by `catalogRefusalWords`, placed on
`DeviceState.catalog` at `gateway.ts:373`, and rendered by `<CatalogHealth refusal={device?.catalog}/>`
at `renderer/App.tsx:439`. It is visible in my §1.4 screenshot as the amber
`Menu NOT UPDATING · still showing v4` chip. **(a).**

### 3.6 — `packages/domain`'s permission matrix and instance (4)

Both spot-checked and both genuinely closed, contrary to older phrasings that have circulated:
`main/authorize.ts` and `services/api/src/trpc.ts` import matrix symbols and gate on them, and the
first `createPinSession` at `index.ts:547` receives a real `createPinAuditSink`. The
`audit: () => {}` at `index.ts:889` is the **second** session (manager approvals) and is a
different, documented decision — see §1.2.

### 3.7 — A marker whose conclusion is right and whose stated reason is false

`packages/ui/src/tokens/index.ts:148`:

```
// @unreached-owed `27-F27` is a KDS law, and there is no KDS (`apps/pass-kds` is a one-file stub).
```

`apps/pass-kds` is **19 files and ~4,540 lines** across `main/`, `renderer/`, `preload/`, `shared/`
and `layout-gate/`. The conclusion still holds — `capHeightMm` has zero callers, confirmed — but the
reason is inverted. This is no longer *"waiting for a screen to exist"*; it is **a shipped screen
that renders type nobody has measured against `27-F27`**, on the one surface whose viewing distance
is metres. That reclassifies the debt from "deferred" to "owed against live hardware", which is the
same conclusion `AGENTS.md` reaches independently when it says the cap-height *"is measured by
NOTHING, so a ticket can be perfectly composed and unreadable at 1.5 m."*

---

## 4. Method, and what it cannot see

**Instruments used, in descending order of how much they found.** Executable probes beat reading, by
a lot: §1.5 and §1.4 came only from launching the app, and §1.1/§1.2/§1.3 came from cross-checking
two ends of a seam mechanically rather than from reading either end.

1. **Launching the shipped renderer in real Electron** (Xvfb, `--no-sandbox --disable-gpu`), driving
   it through its real controls, and sampling the DOM on a clock. Found §1.4, §1.5.
2. **Two-ended cross-checks**: every IPC channel against handler/binding/caller; every tRPC
   procedure against its client; every registry event type against a producer; every `packages/ui`
   component against a renderer. Found §1.2, §1.3, §1.7.
3. **Tracing a rendered prop back to its source** until it terminates in a literal. Found §1.1.
4. **Re-running the exact greps a governance document cites.** Found §3.1, §3.2.

**Discipline the house rules require, and where it bit.** Every content grep used `grep -a`. Every
"is this used" grep was comment-stripped with `perl -0777 -pe 's{/\*.*?\*/}{}gs; s{//[^\n]*}{}g;'`
before concluding — this changed the answer twice: `kitchenQueue`'s only renderer "reference" is a
comment (§1.3), and `catalogRefusal` looked unconsumed until the comment hits were removed and a
real call site appeared (§3.5). Exit codes were read from `REAL_EXIT=$?` markers written inside
logs.

**⚠ A new trap, found in this document's own first draft, and worth adding to the house list.**
Comment-stripping is the right way to answer *"is this a use"* — and **the line numbers it prints
are wrong**, because stripping removes lines and renumbers everything below them. Seven citations in
my draft were off, some by hundreds of lines: `ipcMain.handle(CHANNELS.kitchenQueue…)` is at
`index.ts:1190`, not the `561` the stripped pass reported; `<CatalogHealth>` is at `App.tsx:439`,
not `222`; `createMeshSession` is at `mesh.ts:147`, not `69`. All seven were caught by re-grepping
each citation against the **raw** file before committing. The rule that generalises: **strip comments
to decide, re-grep raw to cite.** A stripped-pass line number is a pointer into a file that does not
exist, and it fails in the most expensive way — it sends a reader to real code that says something
else, which reads as a stale document rather than as a bad citation. The layout gate was run **twice** before its red was believed, and the first run was
**discarded** because its own `[window]` verdict revealed my virtual display was 1280×1024 and the
gate could not get its 1366×768 panel — a contaminated measurement that would have produced a
confidently wrong report.

**One correction I made to my own draft, kept because the shape recurs.** I first read
`[alarm] tab:Order: 14 controls` against `[quiet] 42` and had written up "the alarm state
under-renders every grid". That reading came from the **contaminated** 1280×1024 run. In the clean
run the counts are `43` vs `42` — alarm is quiet **plus the acknowledge button**, for every tab
except Sold out. The whole §1.5 finding would have been wrong in scope and blamed the wrong
mechanism. *A number measured on a misconfigured rig is not a smaller truth; it is a different
claim.*

**What this audit structurally cannot see**, so a clean bill here is not a clean bill:

- **A port supplied with a real adapter that is wrong.** I verified `createGatewayDayLedger` is
  supplied and that both ends agree on six URL paths. I did not verify the *payloads* agree.
- **Anything requiring the running stack** — see §2. A seam can be wired at both ends and still fail
  on the first real byte.
- **Data-shape drift in the dev seed.** I confirmed the seed exists and is marked, and that
  `RESTOS_DEV_MENU` is documented as the thing a published menu replaces. I did not diff the seed's
  fields against the current catalog entry type, which is the exact shape that made the channel row
  ship green and unusable.
- **Correctness of anything that does run.** This audit asks "does it execute with real data", never
  "is the answer right".

---

## 5. One-line summary for the founder

Nothing on the money path is decorative — the counter, the catalog, the summary and the day-end
sweep all run on real adapters, and the `unconfigured*` fallbacks refuse rather than answering zero.
The gaps that would show up in your restaurant in week one are, in order: **there is no way to train
staff without polluting the live ledger** (§1.1); **a manager's over-threshold approval leaves no
audit record** (§1.2); and **a one-machine branch cannot see its kitchen queue, though the till
already computes it** (§1.3). Beneath those, the gates are not saying what people think: **`pnpm
verify` currently fails on its first step and never reaches the layout rail, and the rail itself is
red on 22 verdicts nobody has triaged** (§1.4–1.5). Separately, four claims the team is currently
steering by — including "RestOS is T1-only" — have quietly stopped being true (§3).
