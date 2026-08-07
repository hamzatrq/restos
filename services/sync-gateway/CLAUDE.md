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

⚠ **This file needs no Postgres; the SUITE still does.** `vitest.config.ts` starts one
Testcontainers Postgres in `globalSetup` for every file in the package (T-01-07: fail loudly, never
skip). Both processes `startable.test.ts` spawns are pointed at a deliberately CLOSED port instead,
so what they prove is independent of that container — which is exactly the claim being made.
