# @restos/api

**Owning spec: `specs/18-engineering-handbook.md §5 (module routers cite their own specs)` — read it before modifying anything here (AGENTS.md routing).**

- Fastify + tRPC host for all module routers. REST only for third-party webhooks.
- **IT RUNS: `pnpm -C services/api dev` (watch) or `start` (once), on `tsx` (`18 §14`).** It prints
  `@restos/api listening on <url>` and nothing else — Fastify's own logger stays off. **That line is
  load-bearing**: `__acceptance__/startable.test.ts` boots the declared script with `PORT=0` and
  finds the ephemeral port by reading it. Required env is `SESSION_SECRET`; `PORT` defaults to 3001;
  `BOOTSTRAP_OWNER_EMAIL`/`_PASSWORD_HASH` + `BOOTSTRAP_ORG_ID` seed the one owner, and **absent env
  means nobody can log in — fail-closed, never give it a default credential**. `ENABLED_BRANCHES` /
  `ENABLED_CHANNELS` are `01-F60`'s enabled set — **the ONLY declaration of it anywhere** since
  `catalog.enabled` landed (August 2026); absent means every save is REFUSED, not unchecked, and a
  channel outside `02-F42`'s closed set **crashes the boot** rather than reaching a grid.
  Full two-process startup: `apps/backoffice/CLAUDE.md`. **Full FOUR-process startup — the one
  where a published menu reaches a real till — is `plans/wave-1/running-the-stack.md`**, run end to
  end in August 2026.
- **⚠ `BOOTSTRAP_ORG_ID` IS A JOIN KEY WITH THREE ENDS AND NO ERROR MESSAGE.** This service
  publishes under the logged-in owner's org (`ctx.subject.org_id`, i.e. `BOOTSTRAP_ORG_ID`); the
  gateway stores by that org; a device fetches by the org in its own token and registry row. Set it
  to anything other than `apps/pos-electron`'s `DEV_IDENTITY.org_id` and every process reports
  success while no till ever sees a menu. Same for `ENABLED_BRANCHES` versus the device's
  `branch_id`: the till resolves prices for its OWN branch on `counter`, so an enabled set naming a
  different branch publishes a menu whose every tile reads `no price set`. **`BOOTSTRAP_ORG_ID`
  still has no surface that could notice** — there is no org-existence check anywhere. The
  `ENABLED_BRANCHES` half is now half-closed: `catalog.enabled` means the back office and this
  service can no longer disagree about the set (that drift is gone), but agreeing with each other
  and agreeing with the DEVICE are different claims, and nothing checks the second.
- **`__acceptance__/startable.test.ts` is a SEAM test, not a unit test** — this wave's recurring
  defect (AGENTS.md) landed here as an entire unstartable service, so the seam gets an assertion
  rather than only a fix. It spawns `scripts.start` **as declared in `package.json`** (delete the
  script and it fails; hardcoding the command would have let that pass), then drives login →
  `whoami` → a `can()`-gated `catalog.published` over a real socket. Everything else in this
  package's suites runs through `server.inject`, which cannot tell a wired process from a compiled
  module.
- **IMPLEMENTED: B-2 (host + authz), B-3 (catalog router + staged edits), B-4 (publish path).**
  `plans/wave-1/backoffice-catalog.md`. This is the cloud plane's only caller of `domain`'s
  `can()` — Commandment 8 is enforced here or nowhere on this plane.
- **Every procedure is built with `authorized(<action>)`.** `assertEveryProcedureIsGated` runs at
  boot and refuses to start a host carrying an ungated procedure that is on neither
  `PUBLIC_PROCEDURES` nor `SESSION_ONLY_PROCEDURES`. Adding a name to either list is a reviewable
  diff, on purpose.
- **`14-F3` renders its own example now — "price changed by Ali, 2 Jul, 450 → 480".** A
  `LedgerRecord` carries `server_received_at` (`01-F62`: `catalog.changed` is **org-scoped** —
  `org_id`, no `branch_id`, no branch stamp, no fold reads it — so server time is its ordering
  authority under `01-F18` and is legitimate, the inverse of the `01-F43` device-clock threat) and
  `payload.price_changes` (the `(branch, channel)` cells that MOVED, `null` on either side for a
  cell that did not exist or was dropped). **The numbers are carried, not resolved from
  `before_ref`/`after_ref`** — the refs are one-way `payloadHash` digests indexed by nothing, so
  "resolve the ref" would mean re-reading the entity at version N-1 out of mutable reference data,
  which decays under `01-F52` compaction and can be changed after the fact. `01-F52` holds because
  a price delta is not an entity body; `01-F53` is untouched because a line's price is snapshotted
  from the CATALOG at line-add. **One `deps.now()` reading per publish**, used for both writes, so
  a bulk edit's rows cannot disagree about when "the" edit happened.
- **Two version axes, and conflating them is the defect this module is shaped against.**
  `catalog.pending` is the staged draft (cancellable, no device has heard of it);
  `catalog.published` is the artifact devices fetch (`01-F52`..`01-F56`). Assert timing against
  the second — the staging table cannot tell a landed edit from a cancelled one.
  - **`catalog.pending` carries the draft's own `name` (August 2026), and the axes stayed apart.**
    The projection used to emit identity only, so the back office rendered `item / <id>` for a dish
    an owner knows by name — and the recorded reason ("the staged edit carries no name") was false:
    `StagedEdit.entry` is a whole `CatalogEntryWire`. The name is read off `edit.entry`, never
    resolved against `publisher.published()`, because a join shows the OLD name for a rename and
    nothing at all for an entry never published — and is **invisible on every entry that already
    exists under the same name**, which is why the tests are built on those two fixtures.
    **No `?? entity_id` fallback**: `CatalogEntryWire.name` is `z.string().min(1)` and every staged
    entry is parsed through it, so `01-F54`'s degrade-to-identifier has nothing to degrade — that FR
    governs a *resolution*, and nothing here resolves.

## Mutation matrix for `catalog-pending-name.test.ts` (round-3 law) — control 142/142 green

| # | mutant (exactly one branch) | new 5 failed | pre-existing 137 |
|---|---|---|---|
| P2 | the projection emits `edit.entry.id` as the name | **all 5** | all green |
| P7 | **the name JOINED to `publisher.published()` inside the procedure** | 4 | **1** — see below |

**P7 is the one to re-run after any change here**, and its right-hand column is a gift from an
existing test. Joining server-side makes `catalog.pending` reach the gateway, so
`gateway-unreachable.test.ts`'s *"does not touch a procedure that never leaves the process"* turns
200 into 503 — the pre-existing suite already forbids this procedure leaving the process, for an
unrelated reason, and that happens to fence the server-side join. **The CLIENT-side join has no such
fence**: it failed 0 of `apps/backoffice`'s 110 pre-existing tests (mutant P1 there). Same defect,
two planes, and only one of them was already guarded.

P7's one survivor is also the thesis restated: the archive test passes under the join, because an
archived entry is published under the same name and the lookup simply succeeds.
- **THE ADAPTER HAS LANDED (August 2026) — `gateway-client.ts`, and the composition root wires
  it.** `createGatewayCatalogPublisher` / `createGatewayLedgerAppender` bind B-4's two ports to
  `services/sync-gateway` over its `/internal` surface (founder ruling,
  `plans/wave-1/catalog-transport.md` §6 Q1: **the API publishes, the gateway serves**). HTTP with
  a service bearer credential and nothing else — a queue buys durability nobody asked for
  (`24-F23`), and a Drizzle handle here would make two services write one table (`18 §4`).
  `start()` **REQUIRES `SYNC_GATEWAY_URL` + `SYNC_GATEWAY_TOKEN` and crashes without them**: an
  optional adapter falling back to the stub is this wave's defect as a supported deployment mode —
  the process boots, serves, logs in, answers `catalog.published`, and no menu ever ships. That is
  not hypothetical; it is what this package did until August 2026.
- **The publish and the audit append are NOT one transaction, and the suite says so rather than
  implying otherwise.** Publish first, then one `catalog.changed` per entry, over two requests. A
  failure between them leaves devices with the right menu and `14-F3` short one row. The reverse
  order would leave a history row claiming a version no device can fetch, and `01-F1` forbids
  deleting the claim. Asserted in `__acceptance__/catalog-adapter.test.ts`, both directions.
- **STUBS, all named as such:** `createMemoryUserStore`, `createMemoryStagedEditStore`,
  `createMemoryCatalogPublisher`, `createMemoryLedgerAppender`. Process-local, die with the
  process. They are now **test hosts and dev seeds only** — `unconfiguredCatalog` (a
  `createApiServer` built with no `catalog`) and `__acceptance__/fake-gateway.ts`. Nothing
  `start()` builds is one of them, and putting one back is the mutant `catalog-gateway-seam.test.ts`
  exists to redden. *(`createMemoryUserStore` is the one exception and it is a NARROW one: `start()`
  still builds it when `DATABASE_URL` is absent, because the `BOOTSTRAP_OWNER_*` quickstart is
  documented in `README.md` and `ops/` and a laptop with no Postgres must still open the back
  office. It is never built when `DATABASE_URL` is set — see below.)*

## ⚠ WHERE ACCOUNTS COME FROM — `kernel.users`, not env (August 2026, `15-F26`/`15-F27`/`11-F20`)

**The defect this closed, because it is the wave's signature one on the front door.**
`pnpm -C services/sync-gateway create-owner` has persisted a real owner with an Argon2id credential
into `kernel.users` (migration `0011`) since the tenancy commands landed — and this service ignored
it entirely, building its `UserStore` from `createMemoryUserStore(bootstrapUsers(env))`. **So you
could create a tenant and nobody in it could sign in, and every restart wiped every account.**
`services/sync-gateway/CLAUDE.md` recorded the gap in terms ("The owner this command creates cannot
yet sign in") and named the fix; this is that fix.

- **`users-postgres.ts` — `createPostgresUserStore(dsn)`, a READ-ONLY second reader of one table.**
  `findByEmail` folds `lower(email)` to match `users_email_lower_uq` exactly; `findById` is
  `01-F27`'s per-request lookup; **`setAssignments` THROWS**, because `18 §4` gives a table one
  writer and that writer is `services/sync-gateway` (`0011`: "ONE WRITER, TWO READERS"). Rows are
  parsed through `packages/domain`'s `PersonRecord` — the same schema `create-owner` writes through
  — so there is one declaration of the record and not two (`18 §2`).
- **Why not a fifth `/internal` route, which is this package's own precedent for everything else.**
  Three measured reasons, in `users-postgres.ts`'s header in full. The decisive one: `01-F27` re-reads
  the subject **per request**, so `findById` sits on the hot path of every authenticated call, and
  `router.ts` already records `whoami`'s independence from the gateway as deliberate —
  `startable.test.ts` boots this service with `SYNC_GATEWAY_URL` at a **closed port** and drives
  login and `whoami` over a socket. A user store behind the gateway would 503 there. The other two:
  `18 §2` bans the cross-service *import*, not a shared database (`0011` rules on this table by
  name), and a route would put the Argon2id hash — or the plaintext — on the wire.
- ⚠ **`DATABASE_URL` and `BOOTSTRAP_OWNER_*` ARE MUTUALLY EXCLUSIVE AND BOTH SET IS A BOOT CRASH.**
  Not a precedence rule and not a fallback. Two sources for one fact is the drift `catalog.enabled`
  was consolidated to remove, and here the fact is *who may enter the product*: an env-declared owner
  exists in no `kernel.users` row, so `list-tenancy` cannot report it, `14-F14`'s CRUD could never
  deactivate it, and `15-F3`'s audit trail would name an account the directory has never heard of.
  `15-F26` allows the stopgap *instead of* provisioning, never beside it. Neither configured stays
  **fail-closed** and is not a crash: the host boots, serves and refuses every credential.
- **A DATABASE OUTAGE IS A NAMED 503, NEVER `UNAUTHORIZED`.** The connection is lazy
  (`postgres-js`), which is `services/sync-gateway`'s established posture, so a wrong DSN is not a
  boot failure. `findByEmail`/`findById` raise `IntegrationError("user directory", …, retriable)`,
  which `integrationBoundary` maps to `SERVICE_UNAVAILABLE` and `errorFormatter` lifts as
  `data.integration`. **Measured**: `HTTP 503`, `{"dependency":"user directory","retriable":true}`.
  Telling an owner "invalid email or password" because Postgres is down is a lie the product would
  repeat for the length of the outage. The dependency name is deliberately NOT `"sync gateway"` —
  two outages, two fixes, and one name would send someone to restart the wrong process.
- **A SECOND BOOT LINE, `@restos/api accounts: …` (`USER_STORE_PREFIX`, on stdout).** Three
  deployment states — a real users table, a seed that evaporates on restart, and nobody at all —
  printed **identically** before it, which is how a provisioned owner who cannot sign in is
  discovered by failing to sign in. ⚠ **It is a REPORT, not a seam assertion, and the mutation run
  proved it**: under the seam mutant below the boot line still said `kernel.users` while the login
  401'd. Only a login against a provisioned owner separates them.

### Mutation evidence (round-3 law) — live, against real Postgres, no oracle exists yet

| # | mutant (exactly one branch) | measured |
|---|---|---|
| M-SEAM | `start()` back to `store: createMemoryUserStore(bootstrapUsers(env))` — **the shipped behaviour before this change** | the provisioned owner's login is **`HTTP 401 invalid email or password`**, and **all 287 package tests stay green** |
| — | control (`store: users.store`) | login `200`, `whoami` returns the persisted `user_id`/`org_id`/`assignments`/`display_name`, and **the same password still works after the process is killed and restarted** |

⚠ **NO ACCEPTANCE TEST COVERS ANY OF THIS AND THAT IS OWED, LOUDLY.** The implementing session may
not author oracles (`24 §3`/`24-F5`), so M-SEAM's kill was measured by hand against a live database
and **nothing in CI would catch its return** — `pnpm verify` is exit 0 and `seams:check` is clean
under the mutant, because the port is *supplied*, just supplied the memory stub. That is AGENTS.md's
measured blind spot ("Rule B asks whether an optional member is *supplied*, never whether what was
supplied is *real*") on the login path. What the oracle has to do, in the shape
`catalog-gateway-seam.test.ts` already uses: spawn the DECLARED `start` script against a real
Postgres holding a `create-owner` row, log in over a socket, **restart the process and log in
again**, and assert the boot line. A test that only checks "a host with a memory store can log in"
passes under M-SEAM.

- **`catalog.enabled` serves `01-F60`'s enabled set (August 2026), and the point is PROVENANCE.**
  It returns `ctx.catalog.enabled` — *the same value* `assertSavable` refuses a save against — so
  the axes `14-F29`'s grid is drawn on and the axes the writer checks cannot drift, because there
  is one copy. `apps/backoffice` deleted its `NEXT_PUBLIC_ENABLED_*` and draws from the answer with
  **no fallback**. Gated `authorized("catalog.edit_menu_prices")` like every other read in the bag,
  for the reason in `catalog-router.ts`'s header (Appendix A has no catalog-READ row; inventing one
  is inventing policy; `SESSION_ONLY_PROCEDURES` is for own-identity reads) — **so neither
  exemption list changed.** An **empty** set travels as an empty set and does not throw: throwing
  would render the back office's *unreachable* surface, which is true of nothing (the service is
  answering; it is unconfigured), and those need different words from an owner. The answer is the
  DEPLOYMENT's set, not a per-org lookup — `00 §7`'s layer-2 config plane still does not exist.

## `22-F16` / R38 — the owner's export, and the PORT NOTHING SUPPLIES

`exports.ts` (the port + a refusing fallback), `export-router.ts` (three procedures under
`governance`, all `authorized("export.request")` — `22-F23`, **owner-only**). Oracle:
`__acceptance__/owner-export.test.ts` (9). This plane owns **two things only**: who may ask, and
which tenant the answer is about. What is IN the bundle is `services/jobs`'s `export-org` command.

- ⚠ **`start()` SUPPLIES NOTHING, SO A REAL DEPLOYMENT REFUSES EVERY EXPORT REQUEST — deliberately,
  and it is on `seams:check`'s register rather than in a comment.** `ApiServerOptions.exports`
  carries an `@unreached-owed` marker naming what is owed: a **durable request record** and the
  **enqueue that reaches `services/jobs`**. Neither was invented, because `18 §4` gives every table
  exactly one writer service and a record this plane creates while the worker advances it to `ready`
  has two — that is a decision, not an implementation detail. The oracle's own header names the same
  gap from the other side and assigns it to *"whoever wires the queue"*, with a hand-written
  assertion. **`pnpm -C services/jobs export-org --org <id> --out <dir>` generates a bundle today.**
- **The fallback REFUSES; it is not a memory stub**, and the oracle pins that by name. `22-N3` has
  the owner watching a progress STATE rather than a spinner, so a stub renders a completely
  plausible screen over a job that is not running — the "supplied with a stub" shape AGENTS.md
  measures as invisible to every rail, on a surface whose subject is a copy of the whole ledger.
- **No procedure takes an `org_id` and `requestExport` takes no input at all** (`01-F71` (f) (iii),
  `28-F5` (b)). The port takes `org_id` as the FIRST argument on both reads, so an implementation
  cannot forget the predicate without failing to compile. A foreign or unknown export id is
  `NOT_FOUND` and the two are deliberately indistinguishable — `auth.login`'s enumeration argument,
  and it matters more here because what is being probed for is a bundle of somebody else's ledger.
- **No `branch_id`, and the reason is specific to this surface**: `22-F16`'s bundle is the ORG's
  complete event log with no branch axis, so a stated branch could only ever narrow the
  AUTHORIZATION and never the answer — an owner assigned to one branch would pass a check about that
  branch and receive the whole estate.
- ⚠ **An export is UNAUDITED.** `22-F16` says *"recorded as `governance.export_generated`"*;
  `22-F23` records why nothing can write one. The actor lives on the request record and nowhere else.

### Mutation matrix — `22-F16` (round-3 law), control **326/326** green

| # | mutant (exactly one branch) | killed (of 326) | notes |
|---|---|---|---|
| E1 | **`requestExport` built with `sessionProcedure` — the trigger UNGATED** | **56** | `assertEveryProcedureIsGated` refuses to BOOT; 15 of 18 files fail because they build the host |
| E2 | **`01-F71` (f) (iii): the org read from the REQUEST instead of the subject** | **1** | §B2, alone — 325 pre-existing green |
| E4 | **`export.request` widened to `branch_manager: "allow"`** (OUT-OF-TREE) | **0 — SURVIVED** | see below |

⚠ **E4 SURVIVED THE WHOLE SUITE AND IT IS A11 REPRODUCED EXACTLY — the fourth instance of that shape
in this package and the SECOND on a permission cell.** `owner-export.test.ts` §A4 is titled *"22-F16
'owner-role ONLY': a branch manager is refused too"* and **passes with the cell widened**, because
every non-owner subject in the file is BRANCH-SCOPED and `governance.requestExport` states no
`branch_id`: `branchOf` resolves `null`, `rolesAt` drops the branch assignment, and the 403 arrives
from **scope resolution before any cell is read**. So this service had no coverage of the
`export.request` cell for any non-owner role, and neither did `packages/domain`. Closed by a
hand-written assertion at `packages/domain/src/export-permission.test.ts` (NOT an oracle; its header
says so and says why), which asks `can()` with **org-wide** subjects — the shape that reaches the
cell. Re-measured out-of-tree against it: **E4 kills 2 of the 8 new assertions.**

⚠ **E4 was run OUT-OF-TREE and `packages/domain/src/permissions.ts` was never edited** (AGENTS.md:
an agent killed between "weaken" and "revert" strands a widened credential with every test green).
The package was copied to a scratchpad, mutated there, and only the gitignored
`services/api/node_modules/@restos/domain` symlink was repointed for the run. `permissions.ts` was
verified byte-identical by checksum (`64fc97b9…`) before and after.

**One mutant could not be written and the reason is worth keeping:** there is no one-branch service-
side mutant for *"look the export up by id with no org predicate"*, because `ExportRequests.get`
takes `org_id` as its first parameter — the leak is excluded by the port's SIGNATURE rather than by
a check a mutant could delete. That is a design property, not a coverage claim, and it is the reason
the signature is shaped that way.

## ⚠ A PER-HOOK TIMEOUT IN THIS DIRECTORY OPTS OUT OF THE PACKAGE BUDGET — and ten still do

`vitest.config.ts` sets `hookTimeout: 120_000` **for a measured reason**: `01-F61`'s Argon2id cost
floor is deliberately expensive, and under `pnpm test --force --continue` — nine sibling packages
competing for cores — `startable.test.ts`'s hook once measured 62 s against a 60 s budget. A
trailing `}, 30_000)` on an individual hook **silently overrides that** back down.

Measured 2026-08-08: `gateway-unreachable.test.ts`'s boundary hook carried `30_000`, paid the
Argon2id cost **twice** (hashing the fixture owner, then logging in), and failed the whole package
in a full run — `Tasks: 23 successful, 24 total`, api reading 131 instead of 137 — while passing
**137/137 when run alone**. That is the documented "a single RED is as untrustworthy as a single
green" case, and the fix was to delete the override, not to touch an assertion.

**The class is not closed.** **Eleven** further overrides remain in this directory, every one below
the package budget: `catalog-gateway-seam.test.ts` (25 s, 60 s, 30 s), `catalog-enabled.test.ts`
(60 s, 20 s, 40 s, 40 s), `catalog.test.ts` (60 s), `startable.test.ts` (25 s, **60 s, 60 s**).
*(This block said "Ten" and gave `startable.test.ts` two; it carries three — re-counted 2026-08-09
by grepping `}, <n>)` across the directory. A hand-counted census of a latent-flake class is the
one number you should never carry forward, because the eleventh is the one nobody re-checks.)*
They are
**latent flakes of one shape**, not ten unrelated numbers — AGENTS.md's rule is to search the
PROPERTY, not the mechanism. They were left in place deliberately: none has been observed failing,
and rewriting ten oracle timeouts without a failure justifying each is the drive-by `24 §3b`
forbids. **If any of them reddens a full run and passes alone, delete the override — do not raise
it, and do not touch the assertion.**

## Mutation matrix for `catalog-enabled.test.ts` (round-3 law) — control 137/137 green, 0 survivors

The answer is never checked against a literal alone; it is fed back into `catalog.save` in both
directions, which is what a constant cannot satisfy.

| # | mutant (exactly one branch) | new 11 failed | pre-existing 126 |
|---|---|---|---|
| E1 | `catalog.enabled` returns a plausible CONSTANT instead of `ctx.catalog.enabled` | 2 | **all green** |
| E2 | the procedure built with `sessionProcedure` — ungated, so the boot gate refuses | 10 | 44 fail (they build the host too) |
| E3 | **the `02-F42` boot check removed** — `ENABLED_CHANNELS` back to a bare `list` | exactly 1 | all green |
| E4 | `catalog.save` validates against a DIFFERENT set than the one served (the drift, server-side) | 3 | 6 (`catalog.test.ts` owns the save path too) |

**E1 is the one to re-run after any change here**, and its number is the honest one: a constant
that happens to *match* the default test host survives 9 of 11. The two that kill it are the two
written for it — a second host with different axes, and the empty-set answer. Without those the
procedure could be a literal and nothing would know.

**E3 closes the shape AGENTS.md says no reachability walk can see**: a rule that exists so a test
*could* assert it, and none does. The check moved here from `apps/backoffice/src/lib/env.ts` when
that file was deleted, so it needed an assertion of its own or the move would have been a silent
deletion. It is asserted **out of process, through the declared `start` script**, with a CONTROL
boot proving the channel is why the process died rather than that a process can die.

## Mutation matrix for `startable.test.ts` (round-3 law) — control 88/88 green, 0 survivors

Each mutant differs from the control in **exactly one branch**. The right-hand column is the point:
the 80 pre-existing tests are blind to every one of them, so the kills are attributable to the new
file rather than to the suite at large.

| # | mutant | new tests failed | pre-existing 80 |
|---|---|---|---|
| M1 | `scripts.start` deleted | all 8 (the hook refuses) | **all green** |
| M2 | `scripts.dev` deleted | 1 (`declares run scripts`) | all green |
| M3 | the boot line silenced | all 8 (no port to dial) | all green |
| M4 | an ungated procedure added, so the boot gate refuses | all 8, naming the gate's own error | 41 fail (they build the host too) |
| M5 | **`bootstrapUsers` returns `[]` — the process starts and wires NOTHING** | exactly 2: the two that claim the composition root did work | all green |
| M6 | the main-module guard removed | 1 (`imported by another process`) | all green |

**M5 is the one to re-run after any change here.** It is this wave's defect in miniature: the
service boots, serves, and refuses unauthenticated requests correctly — a seam test that only
checked "did a process listen" blesses it. The refusal and reachability cases stayed green under
M5; only the two wiring assertions caught it.

## Mutation matrix for the gateway adapter (round-3 law) — control 116/116 green, 0 survivors

Same discipline, and the same lesson one layer out. `catalog-gateway-seam.test.ts` (5 tests) runs
the declared start script against a real gateway peer and asks only *"did the menu leave the
process"*; `catalog-adapter.test.ts` (10 tests) asks what went on the wire.

| # | mutant (exactly one branch) | new tests failed | the other 4 files (101 tests) |
|---|---|---|---|
| G1 | **`publisher` back to `createMemoryCatalogPublisher()`** — THE seam mutant | 3 of the 5 seam tests | **all green**: it boots, logs in, gates, and answers `catalog.published` with the menu it just saved |
| G2 | `ledger` back to `createMemoryLedgerAppender()` | exactly 1 (`01-F62` / `14-F3`) | all green |
| G3 | the adapter swallows the gateway's message into "publish failed" | 3 adapter + 1 seam | all green |

**G1 is the one to re-run after any change here**, and it is the reason `start()` refuses to boot
without `SYNC_GATEWAY_URL`. Under G1 every gate this repo has is green — `pnpm verify` exit 0,
`pnpm seams:check` clean (the port is *supplied*, just supplied a stub), 111 of 116 tests passing —
and the product ships no menu at all. Only an assertion that inspects **what the peer received**
separates it from the correct build.

The gateway half of the matrix lives beside its own suite: see
`services/sync-gateway/src/__acceptance__/catalog-publish-http.test.ts`.

## `IntegrationError` — `"fetch failed"` stops reaching an operator (`18 §5`, `00 §5.7`)

`catalog.published`/`catalog.history` proxy to `services/sync-gateway`. With the gateway down,
`fetch` rejects with Node's undici `TypeError` whose **entire message is `"fetch failed"`**, tRPC
normalises the unrecognised throw to `INTERNAL_SERVER_ERROR` and carries that message through, and
the back office rendered exactly those two words — true of nothing an operator can act on.

Three pieces, and `src/errors.ts` says why each exists:

- **`IntegrationError(dependency, message, { retriable, cause })`** — `18 §5`'s taxonomy slot.
  Raised by `gateway-client.ts`'s `reach()`, which is the ONLY place a rejected `fetch` is caught.
  The sentence names the dependency, the address, the reason (walked out of the **cause chain** —
  `"fetch failed"` alone is the top link and the `ECONNREFUSED` is one deeper), and that the state
  is infrastructural rather than a rejected edit. The cause is carried, never swallowed (`24-F15`).
- **`integrationBoundary`** in `trpc.ts`, attached to `publicProcedure` so it is the outermost
  middleware on EVERY procedure. Maps it to `SERVICE_UNAVAILABLE` (HTTP 503) and logs the whole
  error. ⚠ **`next()` does not THROW when the resolver does** — it resolves to `{ ok: false, error }`
  with the throw already normalised into a `TRPCError` whose `cause` is the original. A `try/catch`
  around it never fires; the first draft was exactly that, compiled, read correctly, and mapped
  nothing. Only an assertion on the resulting HTTP **status** caught it — the message looked perfect
  either way, because `errorFormatter` was already lifting the data.
- **`errorFormatter`** lifts `{ dependency, retriable }` into `shape.data.integration`, beside the
  existing `authz` lift, so no client parses a sentence to learn whether to retry.

**A peer REFUSAL is deliberately untouched.** `refuse()` still carries the gateway's own message —
`01-F60`'s *"entry 3 (item/biryani) is not sellable — no price for branch b1, channel foodpanda"* is
the owner's business and wrapping it as an outage would tell them to wait out something that never
ends. That is the control assertion in `__acceptance__/gateway-unreachable.test.ts`.

### Mutation matrix (round-3 law) — control 10/10 new + 116 pre-existing green, 0 survivors

Every row was run against the FULL suite, so the right-hand column is measured, not reasoned.

| # | mutant (exactly one branch) | new tests failed (of 10) | pre-existing 116 |
|---|---|---|---|
| G4 | **the read path back to a raw `fetch`** — the original bug restored | 6 | **all green** |
| G5 | `integrationBoundary` removed from `publicProcedure` — back to a 500 | 2 | all green |
| G6 | the message drops the dependency name and the address | 4 | all green |
| G7 | `IntegrationError` built without `{ cause }` (`24-F15`) | 1 | all green |
| G8 | `errorFormatter` stops lifting `{ dependency, retriable }` | 1 | all green |
| G9 | **THE CONTROL: `refuse()` also raises an `IntegrationError`** | exactly 1 | all green |

**G9 is the one to re-run after any change here.** Under it every gate is green — `pnpm verify`
exit 0, `pnpm seams:check` clean, 125 of 126 tests passing — and an owner with a mispriced menu is
told to wait for an outage that will never end. Only the assertion that a **400 stays a 400**
separates it from the correct build.

## `14-F12`/`14-F13` — the device surface, and the ACTOR a shell command could not record

`devices.list` and `devices.revoke`, both built with `authorized("device.manage")` (`14-F30`).
**Neither exemption list changed and neither may**: `PUBLIC_PROCEDURES` would put a kill switch on
the open internet, and `SESSION_ONLY_PROCEDURES` is for procedures reading the CALLER'S OWN
identity, which an org's device fleet is not.

- **The port is `DeviceDirectory` (`devices.ts`), ONE bag with four required members** — two reach
  the gateway's device registry, two reach `01-F62`'s org-scoped event store. Splitting them into
  two ports was the obvious shape and is rejected: `14-F13` says *"the list shows revoked state **and
  actor**"*, so a deployment that wired the registry half and forgot the ledger half would revoke
  correctly, evict the till, and attribute nothing — Rule B's hole with two ports instead of one
  optional member.
- **The fallback REFUSES; it is not a memory stub.** `unconfiguredDeviceDirectory` throws on every
  method. AGENTS.md measured the stub shape as invisible to every rail we have ("Rule B asks whether
  an optional member is *supplied*, never whether what was supplied is *real*"), and here a stub
  means a revoke button that reports success and stops nothing.
- **NEITHER PROCEDURE TAKES A `branch_id`, and the first draft did.** `trpc.ts` scopes `can()` from
  the raw input, so sending the device's branch looks like `01-F26` done properly — and is wrong:
  this service learns a device's branch only by reading the registry, and that read happens *inside*
  the revocation, so the check lands AFTER the destructive act and a caller naming a branch they
  hold could revoke a device at a branch they do not. Stating no branch resolves the scope to `null`,
  which matches org-wide assignments only. Widening it needs a `find(org_id, device_id)` on the port,
  and is additive when a role that needs it exists.
- **Registry write FIRST, attribution second.** A failure between them leaves a dead till with an
  unattributed revocation — `01-F48` evicts on `revoked_at` and never reads the ledger. The reverse
  leaves a live till with a history row saying it was switched off, which `01-F1` forbids deleting.
- **An ALREADY-revoked device appends nothing.** The instant did not move, so writing
  `device.revoked` with today's actor would attribute last Tuesday's act to whoever pressed the
  button today. Cost stated: a device revoked by `pnpm -C services/sync-gateway revoke-device` keeps
  `revoked_by: null` for ever and pressing revoke again does not adopt it.
- ⚠ **`device.registered` is still unemitted and this did NOT close it.** Registration is an
  operator command with no signed-in user, so the only actor it could write is `null`. The org-scoped
  history therefore holds revocations with no matching registrations — **it is not a device history
  and no surface may render it as one.** `01-F25`'s pairing code unblocks it.

### Mutation matrix (round-3 law) — control **169/169** green, 0 survivors

In-tree with byte-exact backups and a restore trap; the tree was diffed byte-exact after every run.
Nothing here weakens a security CONSTANT (the permission cells were mutated out-of-tree, see
`packages/domain/CLAUDE.md`) — each mutant below reds a test rather than downgrading a credential.
Every row is the FULL package suite.

| # | mutant (exactly one branch) | tests failed | notes |
|---|---|---|---|
| A1 | **`devices.revoke` built with `sessionProcedure` — the kill switch UNGATED** | **56** | `assertEveryProcedureIsGated` refuses to BOOT; 9 of 11 files fail because they build the host |
| A1b | the same for `devices.list` — the fleet legible to any session | 56 | as A1 |
| A2 | **`recordRevocation` never called — the registry write lands, the ACTOR never does** | **8** | only the two device files; **154 pre-existing green** |
| A3 | `actor_user_id: null` — exactly what a shell command could write | 4 | only the two device files |
| A4 | the ledger append moved BEFORE the registry write | 1 | the ordering assertion, alone |
| A5 | `already` ignored — a second press attributes the first revocation to today's owner | 2 | |
| A6 | **`withActors` takes the LATEST event instead of the earliest** | **2** | **survived 0/162 before §D was written — see below** |
| A7 | **an ACTIVE device is given an actor** | **1** | **also survived before §D** |
| A8 | **`server.ts` supplies `unconfiguredDeviceDirectory()` — THE seam mutant** | **4** | boots, gates, serves the catalog; the fleet is unreachable |
| A8b | the seam mutant's quieter twin: a stub answering `[]` and reporting success | 4 | the shape `seams:check` cannot see — the port IS supplied, with a lie |
| A9 | **CONTROL: same states, same writes, different prose** | **0** | |
| A10 | **`revocations` stops filtering to `device.revoked`** — every org-scoped row parsed as one | **5** | all green |
| A11 | **`device.manage` widened to `branch_manager: "allow"`** (`packages/domain`'s D1, out-of-tree) | **1** | all green |

**A2 and A8 are the two to re-run after any change here.** A2 is `14-F13` itself: the till stops,
the screen says so, and nobody is named — which is the state the shell command was already in, so a
suite that missed it would have blessed a screen that added nothing.

⚠ **A6 and A7 SURVIVED THE FIRST RUN — 0 of 162 — and that is the finding worth keeping.** Both are
branches of `withActors`, and every fixture in `devices.test.ts` had exactly one event per device and
no event on a live one, so neither branch was ever exercised. This is AGENTS.md's round-3 defect
reproduced *inside the work that cites it*: the mechanism was built correctly and never aimed at the
case it exists for. §D now drives `withActors` directly and both die. **A doc comment was wrong in
the same place** — it claimed two events for one device were producible today by revoking through
the CLI and then the screen, which is false (the CLI writes no event, and `already` suppresses the
second). The branch is kept because `15 §2` emits `device.revoked` (support-initiated) into this
same store, so the collision is real the day doc 15 lands.

⚠ **A10 AND A11 ARE A SENIOR REVIEW'S FINDINGS, AND BOTH ARE THE SAME DEFECT AS A6/A7 — a third and
fourth instance inside the work that already records two.** Neither is a code defect: `revocations`
filters correctly and the `device.manage` cell is correct. Both were **assertions that did not
exist**, and both were invisible because the fixture never produced the case.

- **A10 guards a live production failure.** `01-F62`'s store is SHARED — `createGatewayLedgerAppender.append`
  writes `catalog.changed` to the same endpoint for the same org — so without the filter
  `DeviceRevokedPayload.parse` throws on the first menu ever published and **`devices.list` 500s for
  any org that has one**, which is the screen an owner opens to kill a stolen tablet. `fake-gateway.ts`
  preserves `type` as sent *specifically* so this would be caught, and the assertion was never
  written: **no fixture in `devices.test.ts` put a non-`device.revoked` row in the store**, so the
  mutant failed **0 of 167**. The `beforeAll` now seeds one and the mutant fails 5.
  `catalog-adapter.test.ts` had the mirror assertion for `LedgerAppender.history` all along — the
  two adapters filter in opposite directions and only one was pointed at its case.
- **A11 is a test that SURVIVED THE MUTANT ITS OWN COMMENT NAMED.** §A's *"a branch manager is
  REFUSED both"* carried a comment reading "the mutant this exists for is `device.manage` widened to
  `branch_manager: allow`" — and it passes under exactly that mutant, because every non-owner
  subject in the file was branch-scoped and neither procedure states a `branch_id`, so `branchOf`
  resolves `null`, `rolesAt` drops the branch assignment, and **the 403 comes from scope resolution
  before any cell is read**. This service therefore had **no coverage of the `device.manage` cell for
  any non-owner role**. The fix ADDS an org-wide branch manager rather than re-scoping the existing
  one — the branch-scoping refusal is a real property worth keeping — and the old test's title and
  comment now say what it actually proves.

**Both 2×2s were measured, not reasoned** (the correct implementation is the other row, so a kill
count alone would not separate "the assertion bites" from "the suite is brittle"):

| | fixture as it was | fixture as it is now |
|---|---|---|
| correct implementation | 167 green | **169 green** |
| A10 (filter deleted) | **167 green — 0 killed** | **5 killed**, `devices.test.ts` alone |
| A11 (D1 cell widened) | **167 green — 0 killed** | **1 killed** — the new test, alone |

⚠ **A11's mutant was run OUT-OF-TREE and `packages/domain/src/permissions.ts` was never edited**
(AGENTS.md: an agent killed between "weaken" and "revert" strands a widened credential with every
test green). The package was copied to a scratchpad, mutated there, and only
`services/api/node_modules/@restos/domain` — a gitignored symlink, not source — was repointed at the
copy for the two runs. `permissions.ts` was verified byte-identical by checksum before and after.

## `12-F10` — the nightly owner summary, and the two mutants that SURVIVED the first run

`summary.ts` (the fold), `summary-router.ts` (the gated procedure), `ledger.ts` (the port).
Oracles: `__acceptance__/summary.test.ts` (35) plus the `12-F10` seam test in
`catalog-gateway-seam.test.ts`. Control **206/206** green; every row below is the FULL package
suite, in-tree with byte-exact backups and a restore trap (all four files verified by checksum
after every run). Nothing here weakens a security CONSTANT — each mutant reds a test rather than
downgrading a credential, which is the narrow case AGENTS.md's out-of-tree rule leaves in-tree.

| # | mutant (exactly one branch) | tests failed | pre-existing 169 |
|---|---|---|---|
| S1 | **`summaryBranchScope` returns `null` always — `reportScope` deleted** | **2** | **all green** |
| S1b | the resolver stops re-filtering the rows it received | 1 | all green |
| S3 | **`server.ts` supplies `unconfiguredDayLedger()` — THE seam mutant** | **1** | **all green** |
| S3b | the quieter twin: the port supplied with a stub answering `[]` | 1 | all green |
| S4 | **the law-3 guard removed — an inexact total TRUNCATED instead of zero + `money_overflow`** | 1 | all green |
| S5 | over/short RE-DERIVED instead of read as `26 §7`'s carried fact | 1 | all green |
| S6 | **the top-item tiebreak deleted (`return 0`)** | **1** | **all green** |
| S7 | `agreed()` picks the first member instead of disputing (`01-F31`) | 1 | all green |
| S8 | `OMISSIONS` stops travelling with the answer | 1 | all green |
| S9 | **NEGATIVE CONTROL: `sortedKeys` gains a no-op `.slice(0)`** | **0** | all green |
| S4x | **RETIRED — a MIS-DESIGNED mutant. See below.** | 0 | all green |

The gateway half lives beside its own suite: `day-ledger-http.test.ts`, control **330/330**, and
**S2** (the window moved from `branch_created_at` to `server_received_at`) kills **7 — all in the
new file, 317 pre-existing gateway tests green**.

**S1 and S3 are the two to re-run after any change here.** S1's number is the honest one: only 2 of
35 assertions are pointed at the width of the answer, because the other refusals (a cashier, a
foreign branch, an org roll-up asked for by a branch manager) are already refused by `can()` in the
middleware. Those two are the leak, and nothing else in this repo can see it.

⚠ **S3 AND S6 SURVIVED THE FIRST RUN — 0 of 204 EACH — and that is the finding worth keeping.**
Both are this wave's named defects reproduced *inside the work that cites them*.

- **S3 is the integration-coverage defect.** `server.ts` binds a third gateway port beside the
  publisher and the ledger appender, and swapping it for the refusing fallback left **every one of
  204 tests green**: the process boots, logs in, gates every procedure, publishes a menu — and the
  owner summary is unreachable. `summary.test.ts` builds its own host with its own ledger, so it is
  structurally incapable of seeing what the composition root wired, exactly as
  `journey-catalog.test.ts`'s first draft was. Closed by an assertion in
  `catalog-gateway-seam.test.ts` that drives the DECLARED `start` script and checks **the figure**
  (Rs 2,900, not a 200) — which is also what kills S3b, the stub that reports success.
- **S6 is the round-3 defect verbatim: the mechanism was correct and no fixture aimed at it.** The
  ranking fixture had no two items at equal revenue, so the tiebreak branch never executed and
  deleting it changed nothing. Closed by a tie delivered in both orders.

⚠ **S4x is a MIS-DESIGNED mutant, kept because a survivor that proves nothing is worth a row.** The
first law-3 mutant replaced `BigInt(qty) * BigInt(price)` with `BigInt(Math.round(qty * price))` —
byte-identical for every value either side can hold, so it survived while changing no behaviour at
all. `services/sync-gateway/CLAUDE.md`'s N5 records the same lesson: **check what a mutant does
before recording what its survival means.**

⚠ **AN HONEST LIMIT ON LAW 3 HERE, measured while designing S4.** BigInt accumulation and the
`Number.isSafeInteger` guard are **not separable by test** in this fold, because every total it sums
is non-negative: a double sum of positives can only diverge from the exact sum above 2^53, and
everything above 2^53 is already refused by the guard. So S4 mutates the guard, and BigInt stays for
a reason the current fixtures cannot demonstrate — the moment a signed accumulation lands here
(netting `payment.refunded` by method, which `shift-cash.ts` already does), the equivalence breaks
and the guard alone stops being enough.

## `21-F15` — NAMES on the read surfaces, and the stub that is indistinguishable from the truth

`01-F68` (org), `01-F69` (branch), `01-F70` (device), `11-F20` (person). Before this, the service
could serve **no name for anything**: `whoami` answered ids, `devices.list` answered UUIDs, and
there was no branch list at all — so every back-office screen rendered hexadecimal with every gate
green. Files: `tenancy.ts` (the port), `createGatewayTenancyDirectory` (`gateway-client.ts`),
`tenancy.directory` (`router.ts`), `devices.ts`'s `display_name`, `users.ts`'s `display_name`.
Oracles: `__acceptance__/tenancy-names.test.ts` (12) + the seam `it` in `device-seam.test.ts`.

- **`whoami` carries the PERSON's name and NOT the org's, and that is a measured property rather
  than a taxonomy.** The org record lives in `services/sync-gateway`, so serving it from `whoami`
  would give an identity read a cross-service dependency — a gateway outage would then stop the back
  office rendering *who you are*. `startable.test.ts` proves it matters: it drives `whoami` over a
  socket with `SYNC_GATEWAY_URL` pointing at a **closed port**. Two procedures also give a client two
  independent loading/error states, which is what it needs to render an unnamed org beside a named
  person. **Neither exemption list changed** — a person's own name is the caller's own identity.
- **`tenancy.directory` is gated on `report.sales_view` and NARROWED by `summaryBranchScope`.** The
  branch list is the summary selector's, so it is gated by the action that screen already requires
  (`catalog.enabled`'s precedent one file over) and it returns exactly the branches the summary will
  answer for — a selector built from a wider list offers rows the summary then refuses. Inventing a
  `tenancy.read` action was rejected as commandment 2 (`14-F30`'s precedent: a new action is an FR
  that decides its cells); `SESSION_ONLY_PROCEDURES` was rejected because an org-scoped read is not
  the caller's own identity. Cost stated: an `own_shift` subject cannot read the org's name here.
- ⚠ **NOTHING WRITES THE DIRECTORY TABLES IN THE DEPLOYMENT THIS LANDED INTO** — `0010` created them
  as storage only. So `org.display_name` is `null` and `branches` is `[]` for every tenant until
  provisioning runs, and **that is the production path today, not an edge case**. `01-F68` calls it
  UNNAMED-not-invalid; `21-F15` decides the rendering.
- **`display_name` is `.nullable()` and never `.optional()` on the wire.** A gateway that stopped
  SENDING the field would satisfy `.optional()` silently and every till would render unnamed with
  nothing reporting a fault — `21-F15`'s failure arriving as data.
- **`fake-gateway.ts` now records QUERY parameters as well as bodies.** For a GET the `org_id` *is*
  the request, so `01-F71` (b) — "did a correctly-scoped request leave this process" — is
  unanswerable from a pathname. `catalog-adapter.test.ts`'s pinned `toEqual` gained `query: {}`.

### Mutation matrix (round-3 law) — control **230/230** green, 0 survivors

In-tree with byte-exact backups and a restore trap (`router.ts`, `server.ts` and `gateway-client.ts`
each verified by checksum after every run; no security constant is touched, so each mutant reds a
test rather than downgrading a credential). Every row is the FULL package suite, `REAL_EXIT` read
from a marker written inside the log.

| # | mutant (exactly one branch) | tests failed | pre-existing 229 |
|---|---|---|---|
| N3 | **`server.ts` supplies `unconfiguredTenancyDirectory()` — THE seam mutant** | **1** | **all green** |
| N3b | **the quieter twin: a stub answering `{org: {display_name: null}, branches: []}`** | **1** | **all green** |
| N4b | **`01-F71` (b): the org read from the REQUEST instead of the subject** | **1** | **all green** |
| N5 | **NEGATIVE CONTROL: same values, same requests, different construction order** | **0** | all green |

**N3b is the row to re-run after any change here, and it is why the fallback REFUSES.** The stub it
plants returns *the correct answer for every tenant in this deployment* — unnamed org, no branches —
so it is indistinguishable from a working implementation by value, and would stay indistinguishable
after provisioning filled the tables: a naming surface frozen at "unnamed" with `pnpm verify` exit 0
and `seams:check` clean. What kills it is not the value but `gateway.received` — the assertion that a
`/internal/tenancy` request actually left the process. AGENTS.md's measured blind spot ("Rule B asks
whether an optional member is *supplied*, never whether what was supplied is *real*") in the one
shape where the lie and the truth agree.

⚠ **N4 was MIS-DESIGNED and its survival proved nothing — kept, because the repo keeps re-learning
this.** The first `01-F71` (b) mutant widened the input to `scopeInput.optional().or(z.object({
org_id }))`; zod tries a union in order, `scopeInput` matched first and STRIPPED `org_id`, so the
resolver never saw one and behaviour was unchanged. It survived 230/230 and would have been recorded
as a coverage hole that does not exist. N4b puts `org_id` in the single schema and dies. `migratable`'s
N5 and `summary`'s S4x are the same lesson: **check what a mutant does before recording what its
survival means.**
