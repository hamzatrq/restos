# @restos/api

**Owning spec: `specs/18-engineering-handbook.md §5 (module routers cite their own specs)` — read it before modifying anything here (AGENTS.md routing).**

- Fastify + tRPC host for all module routers. REST only for third-party webhooks.
- **IT RUNS: `pnpm -C services/api dev` (watch) or `start` (once), on `tsx` (`18 §14`).** It prints
  `@restos/api listening on <url>` and nothing else — Fastify's own logger stays off. **That line is
  load-bearing**: `__acceptance__/startable.test.ts` boots the declared script with `PORT=0` and
  finds the ephemeral port by reading it. Required env is `SESSION_SECRET`; `PORT` defaults to 3001;
  `BOOTSTRAP_OWNER_EMAIL`/`_PASSWORD_HASH` + `BOOTSTRAP_ORG_ID` seed the one owner, and **absent env
  means nobody can log in — fail-closed, never give it a default credential**. `ENABLED_BRANCHES` /
  `ENABLED_CHANNELS` are `01-F60`'s enabled set; absent means every save is REFUSED, not unchecked.
  Full two-process startup: `apps/backoffice/CLAUDE.md`.
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
- **Two version axes, and conflating them is the defect this module is shaped against.**
  `catalog.pending` is the staged draft (cancellable, no device has heard of it);
  `catalog.published` is the artifact devices fetch (`01-F52`..`01-F56`). Assert timing against
  the second — the staging table cannot tell a landed edit from a cancelled one.
- **STUBS, all named as such:** `createMemoryUserStore`, `createMemoryStagedEditStore`,
  `createMemoryCatalogPublisher`, `createMemoryLedgerAppender`. Process-local, die with the
  process. The `CatalogPublisher` and `LedgerAppender` ports are shaped to
  `services/sync-gateway`'s `publishCatalog`/`catalogPage` so the owed adapter is a binding, not a
  redesign — see `publish.ts`'s header for what that adapter still owes.

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
