# @restos/backoffice

**Owning spec: `specs/14-backoffice.md` — read it before modifying anything here (AGENTS.md routing).**
Plan: `plans/wave-1/backoffice-catalog.md`. Stack rules: `18 §7`. Visual language: `27`.

- **IMPLEMENTED: B-5 (shell + tRPC client + auth), B-6 (catalog editor + `14-F29` price grid +
  `03-F50` station), B-7 (`14-F3` change history in place).** `services/api` is the backend and its
  router is the contract — `AppRouter` is imported **type-only** from `@restos/api/src/router.js`.
## Running it — two commands, two processes

The back office is a **front end with no backend of its own**. Start `services/api` first or every
query 502s.

⚠ **THIS IS THE TWO-PROCESS RECIPE. For a menu that actually reaches a till, use
`plans/wave-1/running-the-stack.md`** — four processes and a Postgres, and it was run end to end in
August 2026. The values below are fine here because nothing in a two-process run ever reads the org
id back; **copy them into a four-process run and you get a silent failure.** `BOOTSTRAP_ORG_ID`
must equal `apps/pos-electron`'s `DEV_IDENTITY.org_id` and `ENABLED_BRANCHES` must contain its
`branch_id`, or the menu publishes into an org no device fetches — and *nothing reports an error*:
this screen says "Published version 1", the gateway returns `200`, the row is in Postgres, and the
till sits at `catalog v0 — 0 tile(s)` for ever.

⚠ **`SYNC_GATEWAY_URL`/`_TOKEN` ARE REQUIRED AND THIS BLOCK USED TO OMIT THEM** (corrected August
2026, when a session followed it verbatim and the API died at boot). `services/api`'s `start()`
crashes without them **on purpose** — an optional adapter falling back to the stub is a deployment
that boots, serves, logs in and ships no menu (`services/api/CLAUDE.md`, mutant G1). So a
two-process run still needs a gateway to point at, and the honest options are the four-process
runbook or a peer you supply; there is no "back office only" mode and the crash is the feature.

```sh
# 1 — the cloud plane (services/api). Prints `@restos/api listening on http://…` when it is up.
SESSION_SECRET=<any-dev-secret> \
BOOTSTRAP_OWNER_EMAIL=owner@example.test \
BOOTSTRAP_OWNER_PASSWORD_HASH='<a domain hashPin PHC string>' \
BOOTSTRAP_ORG_ID=org-demo \
ENABLED_BRANCHES=branch-main ENABLED_CHANNELS=counter,storefront \
SYNC_GATEWAY_URL=http://127.0.0.1:8080 SYNC_GATEWAY_TOKEN=<the gateway's PUBLISH_TOKEN> \
pnpm -C services/api dev            # `start` for no watcher. PORT defaults to 3001.

# 2 — this app. ONE variable, and note what is absent: nothing here states the enabled
#     (branch, channel) set. It arrives over `catalog.enabled` (August 2026).
RESTOS_API_URL=http://127.0.0.1:3001 \
pnpm -C apps/backoffice dev         # http://localhost:3000
```

- **`RESTOS_API_URL` is where the API lives**, read at request time by the Next server and defaulted
  to `http://127.0.0.1:3001`. The browser never sees it: `next.config.ts` rewrites `/api/trpc/*` onto
  it, so the client's URL is same-origin and the bearer never crosses an origin. Same
  environment-configured route as `RESTOS_CLOUD_URL` in `apps/pos-electron`.
- **`BOOTSTRAP_OWNER_*` seeds exactly one owner, and absent env means NOBODY CAN LOG IN** — the
  fail-closed direction, and deliberate (`services/api/src/server.ts`). Never replace it with a
  default credential. Mint the hash with `domain`'s `hashPin`; it is `01-F61` Argon2id, so expect
  the login round trip to take a beat.
- **The enabled `(branch, channel)` set is passed to the API ONLY**, and this app asks for it.
  It used to be passed to both, where they could disagree; see the closed drift note below.
- `services/api/src/__acceptance__/startable.test.ts` runs step 1 for real — it spawns the declared
  `start` script on an ephemeral port and drives login → `whoami` → `catalog.published` over a
  socket. If that suite is red, step 1 above is broken, not your environment.

- **THE TWO-PLANE LAW IS ABSOLUTE HERE (Commandment 5, `18 §6`).** TanStack Query v5 + tRPC only.
  Server state is never copied into a client store; `sync-client` appears nowhere.
  `__acceptance__/two-plane.test.ts` scans every shipped file and **fires each rule at a known
  violation first**, so a clean report is evidence rather than an absence.
  - The legal pattern this app uses: a draft is **seeded once** from a prop and never synced.
    `catalog-screen.tsx` gives `EntryEditor` a `key` per entry, so choosing another item MOUNTS a
    new editor. Remove that key and the seeds go stale and would have to become a sync.
- **`next build --webpack`, deliberately.** `packages/domain` and `packages/ui` ship TS source whose
  internal specifiers carry `.js`; Turbopack has no `extensionAlias` and cannot follow them.
  `next.config.ts` records the two rejected alternatives.
- **`agentRules: false` in `next.config.ts` is load-bearing.** Without it `next dev` APPENDS a
  generic "this is not the Next.js you know" block to this file on every run, so `pnpm dev` dirties
  a governed doc and `git status` grows noise a session then has to rule out.
- **No `@/*` path alias.** The repo's `pnpm typecheck` compiles `apps/*/src` with the ROOT tsconfig,
  which has no path mapping — an alias here would pass `next build` and red `pnpm verify`. Relative
  imports only. `src/globals.d.ts` exists for the same reason (`next-env.d.ts` is outside `src/`).
- ~~**The enabled `(branch, channel)` set is DECLARED TWICE and can drift.**~~ **CLOSED (August
  2026) — `catalog.enabled` exists and this app has NO second declaration.** `lib/env.ts` is
  deleted, `NEXT_PUBLIC_ENABLED_BRANCHES`/`NEXT_PUBLIC_ENABLED_CHANNELS` are gone from the run
  recipe, and `@restos/config` is out of the manifest (this app now reads no `process.env` at all;
  `RESTOS_API_URL` is read by `next.config.ts`, not by `src/`). `catalog-screen.tsx` runs
  `catalog.enabled` and hands the answer to `EntryEditor` and to the list heading.
  - **There is deliberately NO fallback when that query fails** — no constant, no env var, no
    "sensible default". The screen renders `Problem` and draws no editor. A grid on a guess is how
    the drift returns, and `01-F60` refuses a fallback price for the same reason. The two guesses
    that were considered and rejected are recorded in the deleted `lib/env.ts` (git history):
    deriving branches from published prices invents nothing for a NEW branch, and "all
    `ORDER_CHANNELS`, one branch" publishes prices for branches that do not exist.
  - **`02-F42`'s closed-channel check moved with the authority** into `services/api`'s boot env, so
    an unknown channel crashes the API at boot instead of surviving until a save. Leaving it here
    would have deleted it, since this app no longer reads a channel list.
  - The remount key is `selection + axes`: the editor's draft is seeded from `enabled`, so an
    editor that survived a change of axes would hold cells for a channel no longer enabled.
- **Money is string surgery, never `× 100`** (`lib/money.ts`). Whole rupees in, integer paisa out,
  no float and therefore no rounding step. Decimals are REFUSED — a pinned interpretation, recorded
  in the file, not a specified rule.

## The DESIGN pass (August 2026) — `plans/wave-1/design-direction.md` applied to this app

The pass below fixed real defects and this one is the level above it: hierarchy, scale, density
and presence. It ran the two processes in a real browser at **1440 and 390 px**, in both
polarities. Nothing under it is superseded — the `Problem` surface, `lib/when.ts`, the `27-F26`
typeface and the two reversed colour assignments all stand.

- **`27-F42`'s type scale was declared and rendered nowhere.** `theme-css.ts` emitted the colours
  and `$family` and skipped the four COMPOSITE styles, so every size came from Tailwind's own
  scale — a different system's decomposed primitives, which is the thing that FR exists to stop.
  All four are emitted now and `globals.css` binds each to ONE font-size utility, so `text-label`
  carries size + line-height + weight + tracking and cannot be spent apart.
  - ⚠ **The manifest has FOUR composites and this app needs SIX.** No display style for a wordmark
    and no caption below `text-label`'s 14 px. Those two still come from Tailwind's scale,
    centralised in `Caption` (`ui/surface.tsx`). **A `packages/ui` finding, not a local fifth size.**
- **The `27-F14` blue means *pressable*, not *important*** — read deliberately, because the
  direction doc leaves it open. `27-F16` is about MONEY; `27-F14` allocates the fourth slot to
  "any control the operator may press". Spending the saturated fill on everything said nothing and
  put a full-width blue `New item` bar above the menu while `Save` sat below the fold in the same
  colour. **The fill is now the ONE committing action per screen**; everything else pressable is
  `secondary`.
- **The price grid is this app's signature element.** `text-numeric-primary` (the manifest's
  28/36/600 tabular composite) on every cell — `27-F25`'s own law line assigns it to exactly this.
  An UNPRICED cell deliberately does NOT take that scale: `01-F60`'s placeholder is a word, and an
  absence must not shout louder than a price.
- **Borders are a budget.** `27-F66` makes `borderColor-default` a *control* boundary at 3.41:1 —
  a strong rule, not a hairline — and the screens spent five nested levels of it inside one
  editor. A card gets its boundary and its header rule; everything inside is separated by ground
  and space.
- **`CardTitle` is a panel label and uppercases through CSS.** Right for *Menu*, wrong for
  *Chicken Karahi (Full)* — it rendered CHICKEN KARAHI (FULL) in the browser, commandment 7 broken
  by a stylesheet. **Never pass user content to it.** `entry-editor.tsx` deliberately does not
  import it and says so.

### Three defects found by LOOKING, none of them visible to any rail here

`layout:check` imports `apps/pos-electron`'s `COUNTER_WINDOW_OPTIONS` and measures the till, so
**no gate in this repo looks at these screens at any width**, and happy-dom performs no layout —
`getBoundingClientRect` is zeroes, so a clipped value and a rendered one are the same DOM.

1. **`Mutton Karahi`'s `3200` rendered as `32`** at 390 px — the cell shrank under the 28 px
   numerals and clipped the value inside its own input, on the one surface where a mistyped figure
   reaches every till. Fixed with a `min-w` on the cell so the TABLE overflows and scrolls instead.
2. **The header wrapped twice at 390 px** — brand to two lines, `Sign out` under its own glyph.
3. **`max-w-[100rem]` was an arbitrary value** (`21-F3`) that I introduced and no gate catches —
   the arbitrary-value grep doc 21 describes is not wired for this app. It also caused a layout
   defect: at 1600 px a device row put its identity at x=107 and its own `Active` at x=1468.

### What is still weak here, stated rather than hidden

- **The editor's seven identity fields still sit above the grid.** Three columns instead of two
  bought a row, but an owner who came to change a price still passes `ID`, `Belongs to` and
  `Order` first. The obvious fix — collapse them behind a disclosure — is a **trap**: happy-dom
  finds elements inside a closed `<details>` and `fireEvent.change` works on them, so
  `editor.dom.test.tsx` would stay green while a real owner could not type an ID.
- **The 3x3 grid scrolls horizontally on a phone** and that does not go away at any type size
  (three channel columns exceed 350 px even at 16 px). `14-N2` targets full editors at
  tablet/desktop, so this is a known cost, not a solved problem.
- **`14-F3`'s history renders nine rows for a creation**, all reading `— → Rs 1,850`. They are a
  subgrid now so they align, but nine lines to say "created at one price" is still the wrong
  shape; collapsing them needs a rule about when cells are equal, which is a judgement this pass
  did not have a spec for.

## The visual pass (August 2026) — four things that are now single-source, and stay that way

A design pass ran the two processes in a real browser and fixed what it found. Four of its
changes are load-bearing rather than cosmetic, and each replaced a duplicate or an absence:

- **`Problem` (`ui/surface.tsx`) is the ONLY way this app renders a failed query.** Before it,
  `auth-gate.tsx` and `catalog-screen.tsx` each rendered `error.message` inside `<Note
  tone="fault">` — which in a real run put `Unexpected token 'I', "Internal S"... is not valid
  JSON` edge-to-edge on an otherwise blank page as the entire application. `Problem` names what
  is unreachable, says nothing is lost, gives an action, and answers *retriable?* with a **retry
  control** rather than a sentence. The raw string survives under `detail`, demoted. **Never put
  a bare `error.message` back on a screen** — and note the surface deliberately does NOT guess a
  cause, because this client cannot distinguish a dead process from a bad rewrite from a failed
  API dependency, and a surface that guesses sends an owner to fix the wrong thing.
- **`lib/when.ts` is the app's one date format.** There were three: `14-F3`'s reasoned `en-GB` +
  `BUSINESS_TIMEZONE` + `h23`, and two bare `toLocaleString("en-US", { hour12: false })` calls in
  `pending-edits.tsx` and the save receipt — so one page showed *"Lands 8/8/2026, 05:00:00"*
  above *"2 Aug 2026, 05:00"*. Month-first is also the wrong reading order for this market. The
  reasons (including why `businessDate()` is **not** called) live in that file.
- **`theme-css.ts` now emits `27-F26`'s typeface**, not only the colours. The type half of the
  tokens export was declared in the manifest, re-derived by `packages/ui`'s `tokens.test.ts` on
  every commit, and true of no pixel here. ⚠ **This bullet ended *"No webfont is bundled — the
  token's own chain falls back to `system-ui`"* and BOTH halves are retired (August 2026).**
  `theme-css.ts` now inlines `fontFaceCss()` server-side, so the face is in the first byte of HTML
  rather than after hydration, and it costs ~95 KB of that string — stated here rather than
  discovered in a bundle report. **`system-ui` is gone from the stack** and that was the sharper
  defect: it resolves to **Roboto** on Android and ChromeOS, which `27-F26` bans outright for
  numerals, so the ban was reachable while the token string never contained the word — which is
  all `tokens.test.ts` can see.
  - ⚠ **No gate renders these screens at any width**, so nothing here asserts the face LOADS. That
    assertion exists only in the two Electron gates. This app's font is verified by construction
    (one shared `fontFaceCss()`), not by measurement, and that is a real difference.
- **`globals.css` maps `fgColor-status-abnormal` and `outlineColor-status-abnormal`.** Without
  them the only way to tint a warning glyph was `text-warning`, i.e. `--warning` = a **`bgColor-`**
  token on a text property, which is the `27-F40` prefix violation `packages/ui`'s own discipline
  suite fails.

**Two colour assignments were exactly backwards and are now the other way round.** `Archive`
(`14-F7` — reversible curation, "archive never delete") and `Cancel this edit` (`14-F28` — a
pending edit no device has heard of) both shipped as `variant="destructive"`, the strongest fill
in the palette; **apply-now**, the one control here that moves every till in the org mid-order,
had no colour at all. `27-F16` reserves colour for the abnormal. Both safe controls are now
`secondary`; apply-now takes the `27-F64` abnormal outline plus a glyph when chosen (`27-F12`:
never colour alone).

**`01-F60`'s two facts have two appearances now, and the distinction is a WORD.** An unpriced
cell renders `no price` in the muted foreground; a free one renders `Rs 0`. Seen live before the
fix: a foodpanda column reading `2173`, `0` and blank, all three drawn identically. Colour is
spent only once the cell is a real fault. **The `Rs` mark and the `no price` placeholder must
stay out of the cell's accessible name** — `editor.dom.test.tsx` finds every cell by
`getByLabelText("<branch> <channel>")`, so the mark is `aria-hidden` and the word is a
`placeholder` behind an explicit `<label>`.

⚠ **The oracle caught a real a11y regression during this pass, not just a test break.** Wrapping
an `apply-when` row in a `<label>` to make the whole row clickable folded the consequence
PARAGRAPH into the radio's accessible name — a screen reader announced *"Apply now Every till in
the organisation changes as soon as this saves…"* as the option's name. The consequence must be
**read**; it is not what the control is **called**. The row is a `<div>`; only the option label is
a `<label>`.

## Mutation matrix — `api-seam.test.ts` (control 88/88 green, 0 survivors)

The link to `services/api` is `TRPC_URL` (`lib/trpc.tsx`) + the rewrite `source` (`next.config.ts`).
The other 83 tests are blind to all five mutants — they drive a real client over a **fake link**,
which never touches the rewrite.

| # | mutant | new tests failed | other 83 |
|---|---|---|---|
| N1 | the client's `TRPC_URL` drifts | 4 | all green |
| N2 | the rewrite's `source` drifts | 4 | all green |
| N3 | the destination is hardcoded, not `RESTOS_API_URL` | 2 | all green |
| N4 | the destination keeps Next's `/api` segment (wrong mount on the API) | 2 | all green |
| N5 | `TRPC_URL` stops being exported (the vacuity case) | 5, guard first | all green |

⚠ **N5 is not hypothetical — it happened during this matrix's own run.** A `git checkout` revert of
N1 also dropped the not-yet-committed `export`, and the next mutant's kill was therefore
unattributable. **Commit the baseline before mutating**, and read the failure MESSAGE, not just the
count: the tests still went red, but for a reason that had nothing to do with the mutant.

## Mutation matrix (round-3 law) — control 83/83 green, 19 mutants, **0 survivors**

Re-run it out-of-tree before trusting a change to `lib/` or the editor. Kill counts, one branch each:

| # | mutant | killed |
|---|---|---|
| M1 | rupees→paisa off by a factor of 100 | 5 |
| M2 | a free modifier saves as MISSING rather than `0` | 5 |
| M3 | an EMPTY cell reads as free (M2's mirror) | 8 |
| M4a | the grid accepts an unpriced enabled pair (logic) | 8 |
| M4b | **the editor ignores its own refusal and saves anyway (SEAM)** | 2 |
| M5 | apply-now becomes the default | 3 |
| M6a/b/c | cancel inert · cancels the wrong edit · does not re-read the server | 2 / 1 / 1 |
| M7a/b | the two-plane rule / client-store rule neutered (guard attribution) | 2 / 1 |
| M7c | **a real `sync-client` + `useEffect`-sync file added to shipped source** | 1 |
| M8 | a blank station sent as `""` instead of `null` (`03-F50` inheritance) | 1 |
| M9 | fill-across fills only the first channel column | 18 |
| M10 | `modifier` dropped from `SELLABLE_KINDS` (the overruled July rule) | 2 |
| M11 | the change history is not filtered in place | 3 |
| M12 | `isWholeRupees` unpadded, so a FREE item reads as inexpressible | 4 |
| M13 | an empty enabled set treated as "nothing to check" | 3 |
| M14 | the timing radio sends `day_end` whatever the owner chose | 1 |

## Mutation matrix — `enabled-seam.dom.test.tsx` (round-3 law), control 110/110 green, **0 survivors**

`14-F29`'s grid draws on the axes `catalog.enabled` states. **The 95 pre-existing tests are blind
to every row below**, and that is not incidental: `price-grid.test.ts` and `editor.dom.test.tsx`
pass `enabled` in as a PROP, so they assert what the grid does with axes it is GIVEN and can say
nothing about where the shipped screen gets them. Every row is one branch, run against the full
suite, and the right-hand column is measured.

| # | mutant (exactly one branch) | new 15 failed | pre-existing 95 |
|---|---|---|---|
| N1 | **the grid falls back to client env vars when the server answer is unavailable — THE seam mutant** | 4 | **all green** |
| N2 | the screen never asks; the axes are a module constant | 7 | all green |
| N3 | an EMPTY answer read as "nothing configured yet, use a default" (M13 over the wire) | 2 | all green |
| N4 | **THE CONTROL: the list HEADING alone reverts to a local constant; the grid still follows the server** | exactly 1 | all green |
| N5 | the structural scanner neutered (guard attribution) | exactly 1, the tripwire | all green |

**N1 is the one to re-run after any change here.** It is the drift restored: `lib/env.ts` back,
`enabled.data ?? enabledPairs`, and the enabled query's own error branch removed. Under it `pnpm
verify` is exit 0, `pnpm seams:check` is clean, and **95 of 110 tests pass** — the app looks
entirely healthy and an owner can once again price a menu on axes the writer does not check.

**N4 is why the kill counts mean anything.** The set has two consumers — the grid and the list's
money-column heading — and N4 changes only the second. Exactly one assertion fires and the grid
assertions stay green, so the suite is discriminating between them rather than reddening on any
change at all.

⚠ **N1's first run was UNATTRIBUTABLE and had to be redone — N5's lesson from the `api-seam`
matrix, reproduced.** The first draft of the mutant imported `@restos/config`, which this commit
removed from the manifest, so the test FILE failed to load: `Test Files 1 failed` with
`Tests 95 passed` and zero assertions run. The count went red for a reason that had nothing to do
with the mutant. **Read the failure message, not the count** — the mutant was rewritten to read
`process.env` directly (the more plausible regression anyway) before the numbers above were taken.

## The pending row names the dish — and the reason it took a whole extra pass is worth keeping

`14-F28`'s row rendered **`item / item-chicken-karahi`**: a kind and a raw identifier, in the one
list whose job is to let an owner recognise what lands at 05:00 and cancel it. The earlier visual
pass found it, declined to paper over it, and gave a reason that was **half right and half wrong** —
and the wrong half is the instructive one:

> *"`catalog.pending` carries no name, and joining it to `catalog.published` would merge the two
> version axes this screen exists to keep apart."*

The second clause is correct and still binds. The first was **false about its own data**:
`StagedEdit.entry` is a whole `CatalogEntryWire`, so the name the owner typed was already in the
staged record — only `catalog-router.ts`'s projection dropped it. A true constraint (do not join)
had been carried into a false premise (there is nothing to render), and the false premise is what
made the defect look unfixable. **When a gap is recorded as owed, record the SHAPE that was
checked** — "the projection omits it" and "the record lacks it" are one word apart and a wave apart.

The decisions, since `24 §3b` wants the rejected alternatives named:

- **A rename shows the NEW name.** This list answers *"what lands at 05:00"*; the old name is what a
  till has **today**, which is the other axis. Showing the old one — or both — requires reading
  `catalog.published`, so those alternatives are **structurally unavailable**, not merely rejected.
  The cost is stated: this row cannot say what the dish used to be called, and `14-F3`'s history has
  no row until the edit lands. Verified in a browser: the Menu card read `Chicken Karahi` while the
  pending row read `Chicken Karahi (Half Plate)`, and both were right.
- **An item that has never been published works**, and it is the case a join cannot serve at all.
- **There is NO fallback to the identifier**, and that is the `01-F54` question answered rather than
  dodged. `01-F54` degrades a **resolution** — a device holding an id whose catalog has not synced —
  and nothing is resolved here: the name arrives in the same record as the id, and
  `CatalogEntryWire.name` is `z.string().min(1)`, so no state exists where one is present and the
  other is not. A `?? entity_id` would be an unreachable branch wearing a safeguard's clothes.
- **The identity is DEMOTED, not deleted** — two entries can share a display name, and this row's
  control cancels one of them. Same move as `Problem`'s `detail`: lead with the meaning, keep the
  raw string.

## Mutation matrix — the pending row's name (round-3 law), control backoffice 116/116 green

Every row is one branch, run against the FULL suite; the right-hand column is measured. **The
fixture is the whole matrix**: on an item that already exists under the same name a join and the
correct implementation are indistinguishable, so the rename and the never-published fixtures are
not extra coverage, they are the only coverage that discriminates.

| # | mutant (exactly one branch) | new 6 failed | pre-existing 110 |
|---|---|---|---|
| P1 | **the row resolves its name from `catalog.published` — THE seam mutant** | 4 | **all green** |
| P3 | the row's headline reverts to `${entity} / ${entity_id}` (the shipped defect, restored) | 6 | **all green** |
| P4 | **THE CONTROL: name and identity SWAPPED — right name, wrong place** | exactly 2 | all green |
| P5 | the component fetches `catalog.published` and ignores it (name still correct) | exactly 1, the tripwire | all green |
| P6 | `edit.name \|\| identity` — an unreachable fallback | **0 (survivor)** | 3, and see below |

**P1 is the one to re-run after any change here.** Its two survivors are the point: the tests that
stayed green under it are exactly the ones whose fixture is an item already published under the same
name. A suite built only on that fixture would have blessed the re-conflated axes completely —
AGENTS.md's *"guard that was never pointed at the dangerous case"*, measured rather than argued.

**P3 is the number that indicts the old suite.** The code that shipped, and that a human found by
looking at a screen, failed **0 of 110** pre-existing tests. This is the second recurring defect
(*"a correct component that is not on the screen"*) in its content form — `pnpm layout:check` cannot
see it either, because the row **fits its box perfectly** while saying the wrong thing.

**P4 proves the kill counts mean something.** It changes only where the name sits; exactly the two
hierarchy assertions fire and all four naming assertions — rename, never-published, tripwire,
multi-row — stay green. The suite discriminates rather than reddening on any change.

**P6 is a declared SURVIVOR, and the honest reading matters.** Its 3 kills are all in
`shell.dom.test.tsx`, whose `catalog.pending` fixtures predate the `name` field: the fallback fires
only because those fixtures omit it, which is an artifact of a stale fixture and not evidence about
the shipped path. So **this suite cannot distinguish "no fallback" from "an unreachable fallback"** —
that property is held by `CatalogEntryWire.name`'s `min(1)` in `sync-protocol` (a protected path with
golden fixtures), not by anything here. It is AGENTS.md's uncatchable shape (i), named rather than
hidden.

The server half's matrix lives beside its own suite: see `services/api/CLAUDE.md`.

## `14-F3` renders its own example — and the date is a DECISION, not a default

*"Price changed by Ali, 2 Jul, 450 → 480"* renders in full: `LedgerRecord` carries
`server_received_at` (`01-F62`) and `payload.price_changes` (the `(branch, channel)` cells that
MOVED). Each cell is named, because `01-F60` prices per pair and a bare "450 → 480" is ambiguous
across the grid. Rupees come from `lib/money.ts`'s `formatPaisa` — the app's one converter.

**The date is the CALENDAR instant in `BUSINESS_TIMEZONE`, never the `01-F46` business day, and
`domain`'s `businessDate()` is deliberately not called.** `01-F46`'s 05:00 cutover decides which
trading day an *operational* figure counts against — a sale, a shift, a cash count. An audit line
is none of those: it answers "when did Ali change this", and bucketing a 02:00 edit into the
previous calendar date restates a recorded instant, which is what commandment 1 forbids of a
history. Mutant **H6** exists so the next session cannot "fix" this into `businessDate()` quietly.

⚠ **This block replaced three copies of a claim that had gone false** — the component header, the
UI string `strings.history.refsOnly` and a GREEN test — all still saying the date and the two
numbers were absent, months after `01-F62` supplied them. Same shape as
`catalog-pricing.test.ts:394` defending the overruled `SELLABLE_KINDS` rule. **A screen claiming a
gap it no longer has misleads the next reader exactly as badly as one hiding a gap it does have**,
and a *green* test is the copy that keeps the other two alive.

## Mutation matrix — `14-F3`'s render (round-3 law), control 95/95 green, **0 survivors**

The right-hand column is the attribution: the 87 other tests are blind to five of the eight, and the
8 new tests are blind to H5 — they only ever supply one entity's records, so the "in place" property
stays B-6's to defend (M11 below, same 3 kills).

| # | mutant | new 8 failed | other 87 |
|---|---|---|---|
| H1 | the date is not rendered | 3 | all green |
| H2 | `price_changes` ignored — the two numbers are not rendered | 5 | all green |
| H3 | the paisa→rupee conversion is dropped (off by a factor of 100) | 5 | all green |
| H4 | a price change with no actor renders as if attributed (`?? "system"`) | 1 | 1 (B-7's own) |
| H5 | the history is not filtered in place | **0** | 3 (M11, B-6's) |
| H6 | the `01-F46` BUSINESS day is rendered instead of the calendar instant | 1 | all green |
| H7 | **the retired apology comes back as the footnote (the vacuity case)** | 1 | all green |
| H8 | only the FIRST moved cell is rendered | 2 | all green |

**H7 is the one to re-run after any change here**, and it is why one assertion is a *negative* one:
nothing else in the suite can tell a screen that states its gaps honestly from one that states a gap
it does not have.

## Owed, and named as owed

- ~~The `14-F28` pending row shows `item / <id>` because `catalog.pending` carries no name.~~
  **CLOSED (August 2026)** — the staged edit always carried it; the projection did not. See the
  section above, and note the premise, not the constraint, was what had gone wrong.
- **A pending row cannot say what a renamed item used to be called.** It shows the draft's name,
  which is correct for *"what lands at 05:00"*, and the before-name lives only on the published axis
  this screen may not join. `14-F3`'s history would answer it — but a day-end edit has no
  `catalog.changed` row until it lands, so between staging and 05:00 the old name is on screen
  nowhere. Closing it means the STAGED record carrying a before-name of its own, which is a payload
  change and therefore a spec question (`01 §4` / `14-F28`), not a client fix.
- **`Staged by bootstrap-owner:org-demo`** — the row renders a raw `user_id` where `14-F3`'s example
  says *"by Ali"*. Same gap as the history line's actor; it wants the staff registry
  (`01-F26`/`F27`) that the back office does not yet read, and is not this row's to invent.
- **A non-price field change still has no before/after values.** `price_changes` is a price delta by
  construction and the refs are one-way `payloadHash` digests indexed by nothing, so a rename or a
  `03-F50` station move renders as "changed" at a catalog version and no values. The footnote
  (`strings.history.nonPriceFields`) says exactly that and no more.
- **`formatPaisa` truncates below a rupee, so a price that is not whole rupees would render its two
  sides identically.** Unreachable through the shipped writer — this app refuses a decimal at input
  (`lib/money.ts`) and `isWholeRupees` guards the grid — so no branch was added rather than a second
  converter written. It becomes real the day anything but this back office writes a catalog price.
- ~~`services/api` has no `dev`/`start` script, so the two processes have never been run against
  each other.~~ **CLOSED** — it has `dev`/`start` on `tsx`, and both processes have been run
  together: login, `whoami` and `catalog.published` all answer through this app's `/api/trpc`
  rewrite, including the batched form `httpBatchLink` actually sends. What is STILL only covered by
  a fake link is the **browser** half — `__acceptance__` drives a real tRPC client over
  `happy-dom`, and no test loads these screens in a real browser against a live API. The seam that
  IS asserted is the process one (`startable.test.ts`).
- The session bearer lives in `sessionStorage`; an httpOnly cookie via a Next route handler is the
  correct shape. Reset, lockout, rate limiting, rotation, revocation and `audit.login` are all owed
  (`backoffice-catalog.md` Q2) and none of them is client work.
- ~~`SELLABLE_KINDS` is now declared a **third** time (`lib/price-grid.ts`).~~ **CLOSED** —
  `lib/price-grid.ts` imports it from `@restos/domain`, which is where `18 §2` puts it once.

## `14-F12`/`14-F13` — the Devices section, and why the ACTOR column is the whole point

`components/device-list.tsx`, reached from `components/workspace.tsx`'s two-tab shell (this app had
one section until now; why a tab and not a second route is recorded in that file).

Two things this screen says that a screen usually would not, and both are `00 §5.7`:

- **`14-F12` asks for app version, last-seen and sync lag. Nothing in this product stores any of
  them** — no heartbeat table, doc 15's device pipeline unbuilt — so the card says which columns are
  missing rather than showing a plausible number. A fabricated "last seen 2 minutes ago" is
  indistinguishable from a real one on a demo and wrong every day after.
- **A device revoked from the service host has revoked state and NO actor**, because
  `pnpm -C services/sync-gateway revoke-device` runs where there is no signed-in user. That renders
  as *"actor not recorded"*, never as an empty cell — a blank reads as "nobody", which is a claim.

`14-F13` is irreversible, so revoking is **two acts**: the consequence ("stops working within 30
seconds and cannot be brought back") is READ before the second, never folded into the control's
accessible name — the a11y regression this file records from the apply-when row, avoided by
construction. A revoked row offers **no control at all**; a disabled button would imply an un-revoke
exists behind a condition, and none exists anywhere in the product (`14-F30`, `01-N5`).

### Mutation matrix — `device-list.dom.test.tsx` (round-3 law), control **129/129** green, 0 survivors

In-tree with a byte-exact backup and a restore trap. Every row is the FULL suite, and **in every row
the failing FILE was `device-list.dom.test.tsx` alone — all 116 pre-existing tests stayed green**.

| # | mutant (exactly one branch) | new 13 failed | pre-existing 116 |
|---|---|---|---|
| B1 | **an unattributed revocation renders as a BLANK instead of "actor not recorded"** | **2** | **all green** |
| B1b | **its mirror: the current user's id rendered for every revoked row** | **2** | **all green** |
| B2 | one-tap revoke — the confirmation and its consequence skipped | 5 | all green |
| B3 | the list is not re-read after a revocation | 1 | all green |
| B4 | a revoke control on an already-revoked device (an un-revoke by implication) | 1 | all green |
| B5 | the already-revoked notice dropped — the screen claims credit it did not earn | 1 | all green |
| B6 | **CONTROL: the row's two metadata facts swap order** | **0** | all green |

**B1b is the one to re-run after any change here, and the FIXTURE is what kills it.** A suite built
only on devices revoked through this screen cannot tell a correct implementation from one that
stamps the signed-in owner on every revoked row — so the CLI-revoked fixture is not extra coverage,
it is the only row that discriminates. AGENTS.md's "guard that was never pointed at the dangerous
case", answered by choosing the fixture rather than by adding assertions.
