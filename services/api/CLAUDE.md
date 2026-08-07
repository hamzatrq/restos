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
  exists to redden.

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
