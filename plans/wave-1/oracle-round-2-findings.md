# Wave-1 oracle round 2 — findings

**July 2026.** Six independent reviewers over the work committed between `15567a4` and `c235de6`:
`packages/ui` (27-F66/F67, theme, Surface, mm capacity), `sync-protocol` (three new frames),
`domain` (`catalog.changed`), `sync-client` (device catalog + the merge non-fold disposition),
`sync-gateway` (publish/serve), `apps/pos-electron` (runnable app + menu grid), and a
cross-cutting audit of every claim made in code comments, spec text and commit messages.

All of that work was written **implementation-and-tests in one session, on protected paths** —
the exact debt round 1 existed to clear, incurred again. This round is the founder's call to pay
it before building further.

**Every reviewer found real defects. Two found the same two independently.**

---

## The headline

**The single worst finding is a security defect, and it had nothing to do with the catalog
work.** `apps/pos-electron` never pinned its renderer's document, so a top-level navigation
re-attached the preload bridge to an arbitrary remote origin. A reviewer drove it against a real
build: a third-party page read the device state, the whole menu and every open order, and
**appended two forged events to the append-only ledger under the device's own identity**. `01-F1`
means those cannot be deleted, only corrected. Fixed in `fc2f69f` and re-verified by re-running
the attack.

**The most instructive finding is mine, and it is round 1's own lesson recurring.** `4363b67`'s
commit message claims the discipline guards "resolve token NAMES out of literals and const maps
… so every lookup is still seen." The AST scanner stops at the first interpolated template
literal in a file. Converting components to `useColor()` is precisely what moved template
literals above their colour declarations, so the commit that made the claim is the commit that
falsified it. **8 of 10 `background:` declarations in the six converted components are invisible
to the guard**, independently confirmed. The reviewer laundered `fgColor-muted` into a
`background:` through AgeBadge's own const map — the exact idiom the message cites as covered —
and all 193 tests stayed green.

---

## A. Confirmed defects, severity-ordered

### A1 — The renderer's bridge was reachable from any origin. **FIXED (`fc2f69f`)**
No `will-navigate` guard, no `setWindowOpenHandler`. `contextIsolation`/`sandbox`/
`nodeIntegration: false` constrain what the renderer *is*, never *which document* holds the
bridge; the `<meta>` CSP dies with the document that carried it. One-way, too — Chromium refuses
`https:` → `file:`, so the till strands on the remote page with the bridge live.

### A2 — `restos:changed` never fired once. **FIXED (`fc2f69f`)**
`ipcMain.handle` and `ipcMain.on` are different registries; `invoke` only reaches `handle`. The
counter never refreshed after an append — order in the store, cart reading "Nothing added yet".
The core POS loop, latent only because `onSelect` is still a no-op.

### A3 — A blank item name permanently kills catalog sync for an entire org
`publishCatalog` validates nothing; the wire schema requires `name.min(1)`. The throw happens on
the **server**, inside `dispatch`, and `server.ts` closes the socket on a handler error. Device
reconnects → `hello_ack` still advertises the version → refetches → socket dies again.
**Guaranteed reconnect loop, and the ledger push path dies with it.** Not self-healing: a
corrective publish does not help a device asking for a delta whose range spans the poisoned
version. Validation sits on the read path instead of at the writer.

### A4 — A publish landing mid-snapshot splices two menus under the newer version
`catalog_request` carries no version pin and `catalogPage` re-reads the current version on every
page; the device commits at the **last** page's version. Reproduced: page 1's stale row committed
at version 2, after which `hello_ack` matches forever and the rename is never re-fetched. The
delta path is sound (rows sort past the cursor); only the snapshot path splices. This is verbatim
the hazard `catalog-fetch.ts`'s own comment claims to prevent — the cross-*session* splice was
guarded and the cross-*version* one, which is likelier, was not.

### A5 — A `catalog_notice` arriving mid-fetch commits half a menu, permanently
`reconcileCatalog` overwrites `catalogFetch` unconditionally, so a notice between pages destroys
the accumulated pages and the next `complete` page commits a tail-only snapshot at the full
version. `reconcileCatalog` then returns early forever (`serverVersion <= have`), so a reconnect
does not repair it. Only the org's *next* menu edit can. `catalog_refusal` stays `null`
throughout. The trigger is ordinary — the gateway broadcasts a notice to every org session on
publish. Also causes request amplification (6 requests from 1 hello + 2 notices).

### A6 — The AST discipline scanner is blind after the first template literal
See the headline. Blinds `roleCheck` (27-F40), `touchCheck` (27-F8) and `opacityCheck`'s alpha
branch across AgeBadge, ConnectionFacts, StatusStrip, Tile, TabRail, TicketCard. The guard logic
is correct in isolation; it never reaches the property. Round 1's pattern (b) — *the guard passed
by not looking* — on the very guard round 1 built to replace the regexes.

### A7 — Nothing binds a component to `useColor()`
`src/index.ts` still exports the static light-only `color`. A reviewer reverted one component to
it: 193/193 green. All 14 use the hook *today* and nothing holds it. `TOKENS.md` — the 27-F44
hallucination guard that `CLAUDE.md` says to read before every edit — teaches the bypass and
never mentions `useColor` or `ThemeProvider`. Consequence: a training session renders the
inverted palette everywhere **except** the offending component, and 27-F67's entire argument is
that the inversion is total. Related: **no test in `packages/ui` ever renders a component** —
there is no jsdom/RTL in the package, so the inversion is token-correct and structurally
unverified.

### A8 — The totality gate was satisfied with rows for compositions no component makes
`4363b67` added four rows "for the totality gate … four combinations a component can compose".
`bgColor-status-confirmed` appears in **no** component. `TicketCard.tsx:105` and
`AlarmBand.tsx:96` — the cited lines — are both `fontSize:` declarations. Three of the four rows
are then routed straight out of the gate by `isStatusFill` and asserted nowhere. A gate that had
legitimately failed now passes, having gained only rows that are exempt. Round 1's pattern (c) —
*the test was written to pass* — committed during the round that was fixing pattern (c).

### A9 — "A relocation, not a relaxation" is false; two live SC 1.4.11 failures
`isStatusFill` removes 11 rows on the ground that they are gated against their outline elsewhere.
`outline-boundary.oracle.test.ts` gates **outline tokens against surfaces** — it never checks
that the component drawing the fill renders an outline. Only 2 of 7 status compositions do:
- `TabRail.tsx:110` amber count badge on the sunken rail — **2.91:1 light**, asserted nowhere.
- `TicketCard.tsx:107` DONE bump button — **2.35:1 dark**, `border: "none"`. Dark is the KDS
  polarity and this is the KDS's primary control.

### A10 — `pageCapacity` in mm vs a render in dp-as-CSS-px. **PARTLY FIXED (`41b5dc6`)**
Three independent unit breaks: `Tile` sizes itself from the raw dp number as CSS px, never from
`tileMm`/`ppi`; `pageCapacity` assumes a 1.27 mm gap while the grid renders 8 CSS px plus Tile's
own margin; and because Tile's physical size tracks PPI, the 27-F8 minimum can be breached at
high PPI where the mm guard cannot see it. Measured: 14 columns fit at 1366×768 and 20 at
1920×1080 **on the same physical panel** — 27-F11c's exact failure, moved from the arithmetic to
the renderer. `41b5dc6` fixed the capacity/layout drift and the assumed-panel constants; the
Tile-sizes-itself-in-dp break remains.

### A11 — `PROTOCOL.md` was never updated
Still lists 11 kinds, no `catalog_*` rows, no `hello_ack.catalog_version`. Meanwhile
`messages.test.ts` asserts "exactly the **14** kinds of the message table" against a constant
named `KINDS_PER_PROTOCOL_MD`, citing a document that says 11. `parseMessage`'s own error string
calls PROTOCOL.md "the closed message set". The plan's T-C1 row required the section explicitly.

### A12 — §5 clause coverage claimed and not delivered
`catalog-transport.test.ts` claims clauses 1, 2, 4, 6, 7, 8, 9. **Clause 4 (paged snapshot
atomicity) has not one paging test in the file** — no `from`, no `complete: false`, no
`CATALOG_PAGE_SIZE` — which is exactly where A4 lives. **Clause 6 (a revoked device gets no
catalog) is tested nowhere in the repo**, though the code is correct. **Clause 8 required the
structural fold guard be EXTENDED to the new code paths; it was not touched.** Clause 9 compares
only `name` and exercises one message order despite the clause saying "different message orders".

### A13 — Three device-side tests pass without looking
`§5.3`'s load-bearing assertion reduces to `expect(0 < 3).toBe(true)` — no notice, no session, no
transport in the test. `§5.5` asserts an empty store is empty; no fetch is attempted. `§5.8`
compares `events_folded` before/after on an empty ledger, where both are 0. And the server-side
`§5.2` wraps its only assertion in `if (page.form === "delta")`, so a regression to
always-snapshot leaves it green having run zero expectations.

### A14 — `01-F59` violated: an 86'd tile cannot be sold deliberately
`Tile` sets `disabled={unavailable}`. `01-F59` is explicit that availability is not an `01-F17`
block and "the counter **may still sell it deliberately** — `02-F31` owns the oversell path".
`02-F7` says only "grey out". Pre-existing in `packages/ui`; `c235de6` is what made it reachable.

### A15 — The `.nonnegative()` money guard is not executed
`shared/ipc.ts` calls it "load-bearing, not decoration" and rests the no-ErrorBoundary decision
on it. `OpenOrderSchema`, `DeviceStateSchema`, `KitchenTicketSchema` and `MenuItemSchema` are
**never parsed on any output path** — `AppendRequestSchema.parse` is the only runtime schema use
in the app. `z.infer` erases the constraint. This also makes `ipc-money-seam.test.ts`
tautological: every assertion calls `safeParse` directly, testing that Zod works.

### A16 — The comment says deltas are not held back; the code holds them back
`catalog-fetch.ts` states a DELTA "deliberately does not get" the accumulate-then-commit
treatment. `accept()` gates on `!response.complete` with **no branch on `form`**. The behaviour is
the safer one; the comment describes a design that was not built, and no test distinguishes them
— every paging test uses `form: "snapshot"`.

### A17 — `sec-F1` does not resolve
Cited in `gateway.ts`'s `handleCatalog` JSDoc and in the T-C3 commit message. `grep -rn "sec-F1"
specs/` → **0 hits**. Commandment 2. (Every other FR ID across the diff and all nine commit
messages resolves — 42 distinct IDs, checked.)

### A18 — `AGENTS.md`'s repo-state line is false in nine places, two harmfully
It still says **"`pnpm test` exits 1 on purpose — do not 'fix' them"**. It exits 0; `4363b67`
closed all 20. The line now trains every session to expect a red run that does not exist — the
exact inverse of what it was written to prevent. It also still lists the runnable app and the
catalog transport as owed, both landed, and repeats a sentence the plan itself refutes ("wire
`catalog.changed` to a fetch" — §3.1 says the device never consumes it). Counts are stale
throughout.

### A19 — The snapshot page is quadratic
`catalogPage` runs the full `DISTINCT ON` with no `LIMIT`/`OFFSET`, materialises every row in JS,
then slices. Measured at 20,000 entries: 40 pages × a 20,000-row fold = **800,000 rows scanned
and 40 full sorts** for one device's snapshot. At 50,000: 5,000,000. The purpose-built index is
**dead on this path** — an all-ASC index cannot serve `ORDER BY kind ASC, entry_id ASC, version
DESC`, so the planner uses the PK and sorts; the migration comment claiming "both access paths in
one index" is false.

### A20 — Smaller, confirmed
The 27-F8 gap table's "read the component, don't mirror a constant" fix was applied to **1 of 4
rows**; halving the other three gaps and deleting Tile's margin leaves 193/193 green ·
`DEV_IDENTITY` has no `app.isPackaged` guard and `userData` resolves to `~/…/Electron`, shared
with every other unpackaged Electron app on the machine · `contested` is collapsed to "86 —
disputed", a word in no spec, and conflates `availability_contested` with
`availability_incomplete` which the fold's own comment says must be told apart; it is also only
consulted inside the `off` branch, so a contested-but-available item shows no signal at all ·
three unbounded receive-path loops (`needs_snapshot` retry, non-advancing `next_from`, uncapped
`pending`) · the `needs_snapshot` retry cannot "force a snapshot" because the frame cannot
express the request · `catalog.changed` has no `actor`, contradicting `14 §16` and its own
comment · no golden fixtures for the three new kinds · `RELIEVED` and `measured` are built and
discarded into trivially-true assertions, so the numbers they promise to keep on the record are
never printed · `usePalettes` is dead and its memo justification describes work it cannot do ·
`Counter.tsx` claims "not a raw primitive or a colour in this file" and ships `<div>`, `<p>` and
a bare `16` — Commandment 6 is machine-enforced for `packages/ui` and unenforced for every app ·
the stale `1.53:1` figure survives in `tokens.json` and `discipline.test.ts` with a hex that is
no longer a fill · `check-tokens` uses `git grep` and so cannot see untracked files · `27-F67`'s
"no headroom" names the page when the binding surface is `-sunken` (the derived 1.08:1 is exact)
· `c235de6` calls `menu` "a FIFTH IPC channel" where `CHANNELS` went 5 → 6 and the file's own doc
says "a FOURTH read" · T-C1's protocol work landed inside `7cf9e78`, a commit about Electron
bundling, and was narrated a commit later.

---

## B. What the reviewers verified as SOUND

Recorded because a review that only lists defects cannot be trusted about their absence.

**27-F66's proof is correct.** Re-derived by hand and by an independent WCAG implementation:
2,366,033 sorted triples × 6 role assignments = **14,196,198**, and **zero** admit any text
colour — tested over *continuous* `t`, which is strictly stronger than the grid search the spec
claims. Every bound in the algebra checks out.

**Every measured figure in 27-F66/F67 and in the new code comments reproduces to the digit**,
computed from the hexes with an implementation that never touches `color-science.ts`: the
14.31:1 cross-polarity step, `borderColor-default` at 3.41/3.62/3.14 light and 3.44/3.00/3.87
dark, the keypad's 5.67/5.84, the accent's 4.94/3.03, the citations re-pin at 3.16. The citations
edit is a genuine re-derivation, not a loosening — the two untouched pins still reproduce.

**27-F67's "gated in both polarities" is true and non-vacuous** — all 24 tokens carry an explicit
`dark` value, so the fallback never fires, and every pairing passes in both.

**`Surface`'s pairing is unforgeable** — four compile-time attacks, all rejected. The drift guard
fires when a pairing is added to the manifest. `MoneyValue`'s brand and the `Posture`/`floor`
split both do what they claim.

**The merge-workcounter partition really is stronger** — verified by mutation: counting a
zero-key event, giving `catalog.changed` an order key, and adding it to `PARKING_TYPES` are all
caught. (One gap: a mutation that silently *drops* the event at ingest is not caught, because
every assertion is already true on a fresh store.)

**The bridge surface itself is clean** — the built renderer bundle has zero hits for
`ipcRenderer`, `require`, `node:`, `better-sqlite3`; at runtime `require`/`process`/`Buffer` are
`undefined`, `window.restos` is frozen with exactly six properties, and the CSP measurably blocks
inline script, remote script, remote styles, images, `fetch` and WebSocket. A child window does
**not** inherit the preload. It was only the same-webContents navigation that leaked.

**`catalog.list()` genuinely excludes tombstones while `lookup()` resolves them** — `01-F55`'s
two sets really do differ, and the app uses the right one for each. **Projections self-heal**: a
corrupted `orders` row and a dropped `availability` table were both rebuilt from the event log on
next launch. **Concurrency on publish is sound** — twelve concurrent publishes across separate
pools produced a gapless 1..12; the `hashtext` collision is a false hazard because the PK is
per-org; rollback leaves no orphan rows and no version bump. **Both read gates are correctly
implemented** (untested, but correct). **`nativeBinding` is safe** — omitted is byte-identical to
before, a wrong path throws loudly, and the resolved path has no external input.

---

## C. What this round says

Round 1 named four patterns. **All four recurred, and three of them recurred inside the work that
was fixing them.**

1. **The comment was the defect** — A6 (a commit message claiming coverage it had just broken),
   A16, A15, A19's index comment, and the `RELIEVED` pair that promise to print numbers they
   cannot.
2. **The guard passed by not looking** — A6 again, A8, A12, A13, A20's gap table. The AST scanner
   round 1 built *to replace* blind regexes is itself blind, for a different reason.
3. **The test was written to pass** — A8 is the purest instance in either round: rows added for
   compositions that do not exist, under line numbers pointing at `fontSize:`, then exempted by
   the same edit.
4. **Correct in isolation, unconnected in fact** — the catalog transport is real and reachable
   inside `sync-client`, and **no application constructs a cloud session**, so `catalog_request`
   has never left a device. `publishCatalog` and `notifyCatalogVersion` have no production
   caller. `catalog_refusal` reaches no UI.

**The new lesson is about claims rather than code.** `c235de6`'s "VERIFIED END TO END" was
verified from the *device store* onward; the six dish names came from a hand-seeded database and
appear in no committed source. The measurement was real and the sentence describing it was
larger than the measurement. Two commits in this range are corrections of earlier claims, and one
of those corrections introduced a fresh false claim.

**The process rule is not optional and the cost of skipping it is now quantified.** Six reviewers
found roughly forty defects in nine commits, including a remote-code-to-ledger path. Every one of
those commits passed `pnpm verify` and a green 1130-test suite.

---

## D. Disposition

**Fixed in this round:** A1, A2 (`fc2f69f`); A10 in part (`41b5dc6`).

**Fix next, in order:** A3 (validate at the writer — one poisoned entry is an org-wide outage),
A5 and A4 (pin the version in the request; refuse a fetch already in flight), A6 (the scanner),
A7 (stop exporting the static record), A9 (render the outlines the relief was granted on), A17
and A18 (an FR that does not resolve, and a repo-state line that misdirects every session).

**Needs a spec answer, not a patch:** A14 — `01-F59` says an 86'd item stays sellable and the
component makes it `disabled`; doc 02 owes the deliberate-sell path before this can be right.

**Owed structurally:** `packages/ui` has no component-rendering test of any kind, and
`apps/pos-electron`'s `main/index.ts`, `preload/index.ts` and real resolver are covered by
nothing — which is exactly the seam A2 lived in.
