# @restos/sync-gateway

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH (20 §4.4). The cloud end of the sync protocol; scales separately from api.
- **IT RUNS (August 2026): `pnpm -C services/sync-gateway dev` (watch) or `start` (once), on `tsx`
  (`18 §14`).** Until then this package carried `test` and a `build` stub that echoes a sentence —
  **no `dev`, no `start`** — so 271 tests, the whole cloud sync end, the `/internal` surface and the
  device WebSocket had **never run as a process**, and the three-process stack (gateway → api →
  back office) could not be brought up at all. That is AGENTS.md's recurring defect, tenth instance.
  It prints three lines and Fastify's own pino beside them:

      @restos/sync-gateway listening on http://0.0.0.0:8080
      @restos/sync-gateway database postgres://gateway:*****@127.0.0.1:5432/restos (opened lazily …)
      @restos/sync-gateway publish surface enabled (PUBLISH_TOKEN configured)

  **The first line is load-bearing** — `__acceptance__/startable.test.ts` spawns the declared script
  with `PORT=0` and finds the ephemeral port by reading it. The second and third exist because both
  questions cost real time when they had no answer: which database, and whether `/internal` can
  accept a menu at all (`PUBLISH_TOKEN` absent is fail-closed and otherwise shows up only as a 503
  in *another service's* logs). The DSN is printed **password-redacted** (`18 §5`).
- **It does NOT need Docker to START, only to be TESTED.** `DEVICE_TOKEN_SECRET` is still required
  with its 32-byte floor; `DATABASE_URL` now **defaults** to `postgres://postgres:postgres@localhost:5432/restos`
  and `PORT` to `8080` (`0` is legal and means an ephemeral bind, as `services/api` always allowed).
  `postgres-js` opens the connection **lazily**, so a missing database is never a boot failure and
  never a hang: measured, an `/internal` read against a closed port answers **HTTP 500 in ~9 ms**
  with `catalog published: the sync gateway could not read from its database (Failed query: … ←
  connect ECONNREFUSED 127.0.0.1:5599). This is an infrastructure state on the gateway, not a
  rejected request.` The two `/internal` **reads** gained the `try/catch` the writes already had —
  uncaught they became Fastify's default body, whose `error` field is the literal string `"Internal
  Server Error"`, which `services/api`'s `ErrorBody` schema **parses happily**, so a dead database
  travelled two services as a shrug. ⚠ An *unroutable* host (rather than a refused port) waits on
  `postgres-js`'s default 30 s `connect_timeout` before erroring — loud, but slow; not measured
  against a fix, and the client is constructed with default options on purpose.
- **IMPLEMENTED (Wave 0).** See `README.md` for the module map (merge gateway, auth/registry, quarantine outbox, Auditor) and the six-table Postgres schema. PROTECTED path — senior review on every change; Postgres/Testcontainers to run.
- **THE `/internal` PUBLISH SURFACE (August 2026) — `publish-http.ts`.** The serving half of the
  founder ruling (`plans/wave-1/catalog-transport.md` §6 Q1): **the API publishes, the gateway
  serves.** `services/api` posts a versioned, immutable snapshot; this service stores it and answers
  device fetches. Four routes behind one bearer credential (`PUBLISH_TOKEN`, ≥32 bytes,
  `timingSafeEqual`): publish / read the published fold / append an org-scoped event / read the
  history. **`PUBLISH_TOKEN` absent is fail-CLOSED — every `/internal` route answers 503**, never
  "skip the check for local dev", which is how an unconfigured production gateway accepts a menu
  from anyone who can reach the port. It is NOT required at boot: a gateway with no back office
  beside it is a legitimate deployment, and crashing it would take the till's sync down to enforce a
  back-office concern. **This service still never parses menu structure** — entries pass through to
  `publishCatalog`, which is the only thing that judges them (`01-F60` completeness,
  `CatalogEntryWire`), and nothing in `publish-http.ts` knows what an item is.
- **`/internal/catalog/publish` NOW SENDS `catalog_notice` — it did not, and that was the whole
  live-freshness path.** `createGateway` has shipped `notifyCatalogVersion` since T-C3 with **two
  callers, both tests**; `registerPublishRoutes` was built with `{ db, publishSecret }` and no way
  to reach it. So from the day `/internal` began accepting menus, a menu published while a till was
  connected reached that till **only on its next reconnect** — under a back-office screen promising
  *"every till in the organisation changes as soon as this saves"* (`14-F28` apply-now). Measured
  live before the fix (`plans/wave-1/running-the-stack.md`): till connected and idle, publish
  `200`, device `catalog_state` still version 0 / 0 rows until restart. The member is **required**,
  not optional, precisely so a deployment cannot forget it and still compile — an optional one is
  Rule B's hole one layer out. Correctness never depended on it and must not: `catalog-transport.md`
  §3.2 makes version-on-`hello_ack` the correctness mechanism and the notice "only latency", so the
  call sits **after** the publish commits and cannot fail it.
- **`kernel.org_events` — `01-F62`'s ORG-SCOPED store (`org-events.ts`), a seventh table.** It is
  deliberately not `kernel.events` with a nullable branch: an org-scoped event carries `org_id` and
  **no `branch_id`, no branch stamp, no `device_id`, no `global_seq`, no `lamport_seq`**, and
  `01-F62` rejected the alternative that would have put a server value into `branch_created_at`.
  Ordering authority is `server_received_at` (`01-F18`); `seq` is an arrival tiebreak only, because
  a `14-F8` bulk edit writes several rows at one instant on purpose. `appendOrgEvent` refuses a type
  outside `01-F62`'s set — **including `audit.*`, the FR's own worked example**: `audit.login` is
  emitted by a *device* at a PIN unlock, so the admin family does not split cleanly and the EMITTER
  does. Append-only, like `kernel.events`.

## Mutation matrix for `startable.test.ts` (round-3 law) — control 9/9 new + 271 pre-existing green

Each mutant differs from the control in **exactly one branch**. The right-hand column is the point:
the 271 pre-existing tests are blind to the ones that matter, so the kills are attributable to the
new file rather than to the suite at large. Every row was run against the FULL suite, so the
right-hand column is measured rather than reasoned.

| # | mutant | new tests failed (of 9) | pre-existing 271 |
|---|---|---|---|
| M1 | **`scripts.start` deleted** | all 9 (the hook refuses) | **all green** |
| M2 | `scripts.dev` deleted | 1 (`declares run scripts`) | all green |
| M3 | **the boot line silenced** | all 9 (no port to dial) | **all green** |
| M4a | `registerPublishRoutes` never called — `/internal` unmounted | 3 | 17 also fail |
| M4b | the `/sync` socket registered at another path | 2 | 1 also fails |
| M5 | **the DB fault falls back to Fastify's default 500 body** | exactly 1 | **all green** |
| M6 | the main-module guard removed | 1 (`imported by another process`) | all green |
| M7 | the DSN password not redacted in the boot line | 1 | all green |

**M1, M3 and M5 are the ones to re-run after any change here** — they are the three the existing
271 cannot see. M3 in particular: silencing one `console.log` retires the entire startability
assertion and no other test in this package notices.

## Mutation matrix for the `catalog_notice` publish seam — control 281/281 green

`journey-catalog.test.ts`'s `SEAM —` test. Every row is the FULL package suite.

| # | mutant (exactly one branch) | SEAM test killed | pre-existing 280 |
|---|---|---|---|
| G1 | **`server.ts` wires `notifyCatalogVersion: () => {}`** — the shipped behaviour before this change | 1 | **all green** |
| G2 | `publish-http.ts` never calls the seam it was handed | 1 | **all green** |
| G3 | the notice fires BEFORE the publish commits (ordering) | **0 — SURVIVES** | all green |
| G4 | **CONTROL: the notice sends `Number(version)` instead of `version`** | **0** | all green |

**G1 is the one to re-run**, and it has a history worth keeping. The FIRST draft of that test
mounted `registerPublishRoutes` itself, with its own `notifyCatalogVersion` argument — and **G1
survived it**, because a test that supplies the wiring cannot observe whether the product supplies
it. That is this wave's named defect reproduced inside the fix for it, and only the mutation run
found it; reading the test did not. It now builds a real `buildServer`, listens on a real port, and
drives a real `createCloudSession` over a real WebSocket, calling nothing on the gateway by hand.

**G3 survives, and the reason first recorded here was WRONG — corrected by senior review.** The
original sentence said "the suite cannot currently distinguish the orders", which would send the
next session off to build a mechanism. It is not true. **G3b** — the same mutant with the window
widened to 500 ms — is **killed by the existing SEAM test** (1 failed, 280 green). G3 survives only
because the loopback notice→request round trip beats a sub-millisecond commit; the guard is not
vacuous, it is simply never handed a realistic window. The cheap fix is a delay injected into the
fixture, not a new test mechanism, and it is **owed**.

**Severity is LOW, and that is traced rather than assumed.** The device never trusts the notice's
version number: `reconcileCatalog` (`cloud-session.ts`) calls `requestCatalog(have)` with
`at_version` **undefined**, and `catalogPage` (`catalog.ts`) clamps `at_version <= current ?
at_version : current`, so the server can never serve a version it has not committed. A premature
notice therefore yields an empty delta at the held version and `update: null` — no retry, since
retry engages only on a refusal. The till gets a **stale** menu, never a wrong one, and self-heals
on the next `hello_ack` reconnect or the next publish. **There is no window in which a till serves
wrong prices**: `01-F53` freezes a line's price into the event at line-add, and `01-F56`'s
`at_version` pin prevents any half-menu or mislabeled commit. Worst case equals the pre-fix
behaviour — freshness lost, correctness never. The ordering in `publish-http.ts` is a reasoned
choice; do not read it as a defended invariant until the widened-window fixture lands.

⚠ **Mint device tokens for a test that uses `buildServer` with `Date.now()`, never `BASE_T`.** Every
other test in `journey-catalog.test.ts` injects a frozen clock, but `buildServer` is the production
root and builds `createGateway` with the REAL one — a `BASE_T` token is 90 days expired against it
and the session opens straight into `01-F47` drain mode, where catalog reads are refused. Observed
exactly that on the first run, and **the assertions still went green off the reconnect**.

⚠ **This file needs no Postgres; the SUITE still does.** `vitest.config.ts` starts one
Testcontainers Postgres in `globalSetup` for every file in the package (T-01-07: fail loudly, never
skip). Both processes `startable.test.ts` spawns are pointed at a deliberately CLOSED port instead,
so what they prove is independent of that container — which is exactly the claim being made.
