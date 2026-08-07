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

```sh
# 1 — the cloud plane (services/api). Prints `@restos/api listening on http://…` when it is up.
SESSION_SECRET=<any-dev-secret> \
BOOTSTRAP_OWNER_EMAIL=owner@example.test \
BOOTSTRAP_OWNER_PASSWORD_HASH='<a domain hashPin PHC string>' \
BOOTSTRAP_ORG_ID=org-demo \
ENABLED_BRANCHES=branch-main ENABLED_CHANNELS=counter,storefront \
pnpm -C services/api dev            # `start` for no watcher. PORT defaults to 3001.

# 2 — this app.
RESTOS_API_URL=http://127.0.0.1:3001 \
NEXT_PUBLIC_ENABLED_BRANCHES=branch-main \
NEXT_PUBLIC_ENABLED_CHANNELS=counter,storefront \
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
- **The enabled `(branch, channel)` set is passed to BOTH processes** and they can disagree — see
  the drift note below. Keep the two pairs identical until `catalog.enabled` exists.
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
- **The enabled `(branch, channel)` set is DECLARED TWICE and can drift** —
  `NEXT_PUBLIC_ENABLED_BRANCHES`/`NEXT_PUBLIC_ENABLED_CHANNELS` here, `ENABLED_*` in the API. There
  is no `catalog.enabled` procedure, so the editor cannot ask the server what to draw. The server's
  refusal is the backstop; the procedure is **owed**. See `lib/env.ts`.
- **Money is string surgery, never `× 100`** (`lib/money.ts`). Whole rupees in, integer paisa out,
  no float and therefore no rounding step. Decimals are REFUSED — a pinned interpretation, recorded
  in the file, not a specified rule.

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
  every commit, and true of no pixel here. No webfont is bundled — the token's own chain falls
  back to `system-ui`, so on a machine without IBM Plex Sans this renders what it rendered
  before, now *stated by the token* instead of by omission.
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
