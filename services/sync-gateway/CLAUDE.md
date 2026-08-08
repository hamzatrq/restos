# @restos/sync-gateway

**Owning spec: `specs/01-kernel-sync.md` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH (20 §4.4). The cloud end of the sync protocol; scales separately from api.
- **IT RUNS (August 2026): `pnpm -C services/sync-gateway dev` (watch) or `start` (once), on `tsx`
  (`18 §14`).** Until then this package carried `test` and a `build` stub that echoes a sentence —
  **no `dev`, no `start`** — so 271 tests, the whole cloud sync end, the `/internal` surface and the
  device WebSocket had **never run as a process**, and the three-process stack (gateway → api →
  back office) could not be brought up at all. That is AGENTS.md's recurring defect, tenth instance.
  It prints four lines and Fastify's own pino beside them:

      @restos/sync-gateway listening on http://0.0.0.0:8080
      @restos/sync-gateway database postgres://gateway:*****@127.0.0.1:5432/restos (opened lazily …)
      @restos/sync-gateway publish surface enabled (PUBLISH_TOKEN configured)
      @restos/sync-gateway schema up to date — all 10 migrations applied

  **The first line is load-bearing** — `__acceptance__/startable.test.ts` spawns the declared script
  with `PORT=0` and finds the ephemeral port by reading it. The other three exist because each
  question cost real time when it had no answer: which database, whether `/internal` can accept a
  menu at all (`PUBLISH_TOKEN` absent is fail-closed and otherwise shows up only as a 503 in
  *another service's* logs), and whether the schema is even there. The DSN is printed
  **password-redacted** (`18 §5`).
- **MIGRATION IS A DECLARED COMMAND, AND A SEPARATE DELIBERATE ACT (August 2026):
  `pnpm -C services/sync-gateway migrate`.** Until then `applyMigrations` was marked unreached by
  design, naming its callers as the test harness "and whatever runs the deploy" — and **nothing ran
  the deploy**: there was no migrate script anywhere in this repo, so the only route was a `tsx -e`
  one-liner copied out of a runbook. `migrate.ts` now has a `main()` and an entry guard in the same
  shape as `server.ts`, and the by-design marker is **gone** — it is reached now, and a marker on
  something reached fails `seams:check`.
  - **The server does NOT migrate itself**, and that is the design question rather than an
    oversight. A service that migrates its own database on boot races its own replicas, and every
    process start becomes a schema change. It also matches this service's own precedent for a
    missing dependency: `PUBLISH_TOKEN` absent is fail-closed, said plainly at boot, and never a
    reason to crash the till's sync over a deploy-time concern.
  - **So boot REPORTS instead** (`00 §5.7` — the same FR `publish-http.ts` cites for naming a
    dependency). `pendingMigrations` runs **after `listen` and is not awaited**: an unroutable host
    waits out `postgres-js`'s 30 s connect timeout, so awaiting it would trade a fast boot for
    exactly the stall the lazy connection exists to avoid. Unmigrated reads `schema NOT MIGRATED —
    10 of 10 migrations are unapplied. Run ...`; an unreachable database reads `schema could not be
    checked — the database did not answer (… ← connect ECONNREFUSED …)`, on ONE line and with no
    DSN in it.
  - **Idempotency and partial application, MEASURED against a real Postgres.** drizzle 0.45.2 runs
    every PENDING migration inside **ONE transaction** (`pg-core/dialect.ts`) and Postgres DDL is
    transactional, so a failed run is all-or-nothing: verified by planting a colliding
    `kernel.events` before migrating — the run failed on `CREATE SCHEMA "kernel"` and left **zero**
    journal rows and no new tables. A second run on a migrated database applies nothing (journal
    row count unchanged at 10) and says `nothing to apply`.
  - ⚠ **What the boot check does NOT prove — the honest boundary.** It answers *"has this build's
    journal been applied"*, **not** *"is the schema intact"*. drizzle keeps ONE `created_at`
    watermark and never re-checks the objects, so dropping `kernel.org_events` by hand while
    leaving the journal alone yields `pending: 0` for a database that 500s — and re-running
    `migrate` against it also reports success and **repairs nothing** (measured). Removing the
    journal's last row *and* its table does self-heal: the watermark drops and `0009` re-applies.
    Deriving the answer from a table list would catch the torn case and would be a **second
    interpretation of the schema** — the defect `03-F40`'s two sensor bit layouts already cost this
    corpus — so the deploy question is answered honestly rather than overselling a schema audit
    that is not performed.
  - ⚠ **Postgres `NOTICE` objects on a re-run are not errors.** `42P06`/`42P07` "already exists,
    skipping" come from the migrator's own `CREATE … IF NOT EXISTS` preamble and are dumped by
    `postgres-js` as objects with a `code` field. They are evidence of idempotency. The runbook
    previously called them "Postgres error objects", which is what they look like and not what they
    are.
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

## Mutation matrix for `migratable.test.ts` (round-3 law) — control 6/6 new + 282 pre-existing green

The migrate entry point and its boot report. Control: **288/288 green** (282 pre-existing + 6 new),
`REAL_EXIT=0` read from a marker written inside the log, never from a reported status. Every row is
the FULL package suite, and each mutant differs from the control in **exactly one branch**. The
right-hand column is the point: the 282 pre-existing tests are blind to **every** row, so all the
kills are attributable to the new file rather than to the suite at large.

| # | mutant (exactly one branch) | new tests failed (of 6) | pre-existing 282 |
|---|---|---|---|
| N1 | **`scripts.migrate` deleted** | **5** | **all green** |
| N2 | `main()` never calls `applyMigrations` — a decorative command | 4 | **all green** |
| N3 | **`server.ts` never calls `pendingMigrations`** — the shipped behaviour before this change | **2** | **all green** |
| N4 | **the schema line always says "up to date"** — a one-sided guard | **1** | **all green** |
| N5 | the report moved BEFORE `listen`, and awaited | 1 | **all green** |
| N6 | the migrate line prints the RAW DSN (password leak) | 1 | **all green** |
| N7 | **CONTROL: same states reported, different prose** | **0** | all green |

**N1, N3 and N4 are the ones to re-run after any change here.** N1 is `startable.test.ts`'s M1 for
this file — delete the declared script and five of six assertions go red, which is the whole reason
the test spawns `scripts.migrate` instead of a hardcoded `tsx src/migrate.ts`. N3 is the seam row:
it reproduces exactly what shipped before this change, and **not one of the 282 pre-existing tests
notices** — the same shape as the `notifyCatalogVersion` gap above. N4 is the round-3 row: a guard
that always cries "NOT MIGRATED" closes the gap as badly as one that never does, so the assertion
is two-sided and only the empty-database half dies here.

⚠ **Two mutants in this round were mis-designed, and both are worth keeping.** The first N3 draft
did not compile (7 files failed to load, 243 tests ran) — a broken mutant is not a result, and a
"kill" read off that run would have been noise. The first N5 replaced `void` with `await` **in
place**, which is semantically near-equivalent because the probe already sits *after* `app.listen`
— it **survived**, correctly, and the real hazard (moving it *before* `listen`) had to be built
deliberately. A mutant that survives because it does not actually change behaviour proves nothing
about the test; check what the mutant does before recording what it means.

## Mutation matrix for the `catalog_notice` publish seam — control 282/282 green

`journey-catalog.test.ts`'s two seam tests — `SEAM —` (the seam exists) and `SEAM (ORDER) —` (the
notice follows the commit). Every row is the FULL package suite.

| # | mutant (exactly one branch) | seam tests killed (of 2) | rest of the suite |
|---|---|---|---|
| G1 | **`server.ts` wires `notifyCatalogVersion: () => {}`** — the shipped behaviour before this change | **2 — both** | 280 green |
| G2 | `publish-http.ts` never calls the seam it was handed | 1 (`SEAM —`) | all green † |
| G3 | **the notice fires BEFORE the publish commits** — announce a predicted version, then write | **1 (`SEAM (ORDER)`)** | **281 green** |
| G3b | G3 with a 500 ms sleep between the notice and the write | **2 — both** | 280 green |
| G4 | **CONTROL: the notice sends `Number(version)` instead of `version`** | **0** | all green † |

† G2 and G4 were measured before `SEAM (ORDER)` existed and are carried forward; G1, G3 and G3b
were re-measured in August 2026 against both.

**G1 and G3 are the two to re-run after any change here.** G1 has a history worth keeping. The FIRST draft of that test
mounted `registerPublishRoutes` itself, with its own `notifyCatalogVersion` argument — and **G1
survived it**, because a test that supplies the wiring cannot observe whether the product supplies
it. That is this wave's named defect reproduced inside the fix for it, and only the mutation run
found it; reading the test did not. It now builds a real `buildServer`, listens on a real port, and
drives a real `createCloudSession` over a real WebSocket, calling nothing on the gateway by hand.

**G3 is CLOSED — the ordering is a DEFENDED INVARIANT now, not a reasoned choice (August 2026).**
The fixture this block recorded as **owed** has landed as `journey-catalog.test.ts`'s `SEAM
(ORDER) —` test, and G3 moved from SURVIVES to **1 killed, 281 pre-existing green**. Two earlier
sentences here are now superseded and both are worth keeping as worked examples. The *first*
version said "the suite cannot currently distinguish the orders" — false, and it would have sent
the next session off to build a mechanism. The senior review that corrected it was right that no
mechanism was needed (G3b, the same mutant with a 500 ms window, was already killed by the
existing test) but named the fix as **"a delay injected into the fixture"**, and that is not what
shipped, because a 500 ms sleep is both a permanent runtime cost and a window that is only
*probably* wide enough — the exact shape of a future 3am flake.

**The window is a LOCK, and the observation is a ROUND TRIP. There is no sleep in the test and no
wall-clock constant to tune.** `publishCatalog` serializes per org on
`pg_advisory_xact_lock(hashtext('restos:catalog:' || org_id))`. The fixture takes **that same
lock** on its own connection before POSTing, so the publish blocks at the top of its transaction
and cannot commit until the test releases it. That is not a testing contrivance: it is a real
production condition (a second publish for the same org already in flight), it needs **no change
to `publish-http.ts`** — nothing shipped slows down to make the test possible — and being
org-scoped it blocks nothing in any other file (isolation here is by fresh org). Then two
orderings make the assertion race-free rather than merely likely:

1. `pg_locks` is polled until a backend is provably **waiting** on this exact lock — matched by
   joining against the lock the fixture's own backend holds, so no advisory-key bit arithmetic is
   reproduced. **This is the anti-vacuity guard**: without it, a publish that 400'd before ever
   reaching the database would satisfy "no notice arrived" while proving nothing. Verified by
   mutating the fixture's own key to a wrong one — the test fails loudly on *that* wait rather
   than passing (measured: 1 failed of 9, with the "barrier did not engage" message).
2. The device then pings its **own** socket and waits for the pong. The gateway answers a ping
   synchronously from the same sink the notice uses, on the same connection, so any notice written
   before the block is written before the pong and therefore *arrives* before it. When the pong
   lands, a premature notice is already recorded.

Cost of the whole test: **~160 ms** on a correct tree (152 ms and 167 ms measured on two full runs,
against a ~12 s package suite). It is also not one-sided — it asserts the notice *does* follow the commit, which is why **G1 kills it too**.

**Severity of the original gap was LOW, and that is traced rather than assumed** — kept because it
is the reason this was owed rather than urgent. The device never trusts the notice's version
number: `reconcileCatalog` (`cloud-session.ts`) calls `requestCatalog(have)` with `at_version`
**undefined**, and `catalogPage` (`catalog.ts`) clamps `at_version <= current ? at_version :
current`, so the server can never serve a version it has not committed. A premature notice
therefore yields an empty delta at the held version and `update: null` — no retry, since retry
engages only on a refusal. The till gets a **stale** menu, never a wrong one, and self-heals on the
next `hello_ack` reconnect or the next publish. **There is no window in which a till serves wrong
prices**: `01-F53` freezes a line's price into the event at line-add, and `01-F56`'s `at_version`
pin prevents any half-menu or mislabeled commit. Worst case equals the pre-fix behaviour —
freshness lost, correctness never. ⚠ One thing sharpens the picture without changing the verdict,
and it rules out the "announce early, announce again after" repair: `reconcileCatalog` returns
early while `catalogFetch !== null`, so a premature notice **burns the reconcile slot** — a
follow-up notice landing during the futile fetch would be dropped, and the device would wait for
its next hello anyway.

⚠ **Mint device tokens for a test that uses `buildServer` with `Date.now()`, never `BASE_T`.** Every
other test in `journey-catalog.test.ts` injects a frozen clock, but `buildServer` is the production
root and builds `createGateway` with the REAL one — a `BASE_T` token is 90 days expired against it
and the session opens straight into `01-F47` drain mode, where catalog reads are refused. Observed
exactly that on the first run, and **the assertions still went green off the reconnect**.

⚠ **This file needs no Postgres; the SUITE still does.** `vitest.config.ts` starts one
Testcontainers Postgres in `globalSetup` for every file in the package (T-01-07: fail loudly, never
skip). Both processes `startable.test.ts` spawns are pointed at a deliberately CLOSED port instead,
so what they prove is independent of that container — which is exactly the claim being made.
