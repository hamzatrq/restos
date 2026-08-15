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
      @restos/sync-gateway schema up to date — all 12 migrations applied

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
    12 of 12 migrations are unapplied. Run ...`; an unreachable database reads `schema could not be
    checked — the database did not answer (… ← connect ECONNREFUSED …)`, on ONE line and with no
    DSN in it.
  - **Idempotency and partial application, MEASURED against a real Postgres.** drizzle 0.45.2 runs
    every PENDING migration inside **ONE transaction** (`pg-core/dialect.ts`) and Postgres DDL is
    transactional, so a failed run is all-or-nothing: verified by planting a colliding
    `kernel.events` before migrating — the run failed on `CREATE SCHEMA "kernel"` and left **zero**
    journal rows and no new tables. A second run on a migrated database applies nothing (journal
    row count unchanged — 11 when that was the count, 12 since `0011`) and says `nothing to apply`.
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
- **DEVICE PROVISIONING IS A DECLARED COMMAND (August 2026):
  `pnpm -C services/sync-gateway provision-device --org <id> --branch <id> --device <id> --class <device_class> --name "<human name>" [--reissue]`.**
  Until then **nothing in this product minted a device credential.** Both halves of admission were
  correct, tested and unreachable: `registerDevice` carried a debt marker reading *"a device is
  provisioned only by a test or by hand-written SQL"*, and `issueDeviceToken`'s only production
  caller was the RENEWAL path — which by definition needs a device that is already admitted. So the
  service could renew a credential it had no way to issue, and `running-the-stack.md` §6b told an
  operator to run a `tsx -e` one-liner and then `INSERT` into this service's own table with psql.
  **You could not add a second till without writing SQL.** Eleventh instance of the wave's named
  defect, in the shape the rail cannot see: the exports are not dead, there is no way to invoke them.
  - **Why a COMMAND and not a route or a screen** (`24 §3b` — the rejected alternatives are in
    `provision-device.ts`'s header, in full). The decisive property is that **it grants no authority
    its inputs did not already carry**: it needs `DEVICE_TOKEN_SECRET` *and* `DATABASE_URL`, and
    anyone holding both could already mint a token and already write the row. An `/internal` route
    behind `PUBLISH_TOKEN` was rejected because that is the *menu* credential held by
    `services/api` — publishing a menu and admitting a device to the ledger should not sit behind
    one secret. A back-office pairing code is the **correct end state** (`01-F25`, `14-F26`) and is
    OWED: the pairing-code model exists in the corpus as one clause, so building it now would be
    inventing policy (commandment 2).
  - **It never un-revokes, in either mode, and that is a defect it REMOVED.** §6b's SQL ended
    `on conflict (org_id, device_id) do update set revoked_at = null`, so re-running the documented
    provisioning step **resurrected a revoked till** — against `01-F25`/`01-F48`, and against
    `01-F47`'s own sentence that revocation "remains the operative kill switch".
  - **ONE expiry instant, written twice.** `expires_at` is computed once and passed to both
    `issueDeviceToken` and `registerDevice`, closing the drift `registry.ts` names in its own doc
    comment (seeded from the DATABASE clock, judged against the gateway's INJECTED clock — a
    freshly-provisioned device then reads as permanently not-due and never renews).
  - **It reads `DEVICE_TOKEN_ISSUER`/`DEVICE_TOKEN_AUDIENCE` because `server.ts` does.** A token
    minted unbound against a bound gateway is a perfectly-signed credential that opens nothing —
    adversarial-review B3's defect one process over.
  - **stdout is the TOKEN and nothing else; every readable line is on stderr.** The emission of a
    credential is made as narrow as it can be, so `TOKEN=$(…)` captures a credential and not a
    paragraph.
  - ⚠ **What it does NOT close.** `01-F25`'s pairing code (an owner still needs shell access on the
    service host); device-side persistence of `01-F47`'s silent renewal (the FR puts it in
    `sync-client`; `apps/pos-electron` re-reads `RESTOS_DEVICE_TOKEN` from env every launch); the
    <25%-remaining warning; and `hub_relay`, which this never grants because no mesh session exists
    to use it. *(The revocation half — "`revokeDevice` still has no shipping caller at all" — was the
    dangerous one on this list and is CLOSED by the command below.)*
- **REVOCATION IS A DECLARED COMMAND — THE KILL SWITCH'S OTHER HALF (August 2026):
  `pnpm -C services/sync-gateway revoke-device --org <org_id> --device <device_id>`.**
  `provision-device` landed hours earlier and closed admission *alone*: `revokeDevice` had **zero
  shipping callers**, so for that window a till could be admitted by a declared command and taken
  away only by hand-written SQL against this PROTECTED service's table. `01-F48` exists for a stolen
  or decommissioned device, and 2am against production is the worst moment to improvise an `UPDATE`.
  - **WHAT THE SPEC SAYS A REVOKED DEVICE EXPERIENCES — quoted, not designed.** `01-F48`: *"Revoking
    a device evicts it from the mesh **within 30 s** where any path (cloud or LAN) reaches it,
    **rather than only at its next voluntary contact**: the cloud **drops live sessions** and culls
    the device from fan-out on the revoking transaction … Revocation blocks **reads as well as
    writes**: a revoked device receives no further events on any plane."* `01-F25`: *"a revoked
    device loses cloud+LAN participation on next contact and is flagged branch-wide."* `01-F42`: the
    device *"receives a local-purge command on next contact"*. So the answer to "does the gateway
    refuse it at the next hello, mid-session, or only at renewal" is **mid-session**, and all three
    enforcement points were already shipped — `sweepRevocations` (≤ `REVOCATION_SWEEP_INTERVAL_MS`,
    10 s, driven by `server.ts`'s `setInterval`), `requireUnrevoked` per operation, and the hello
    refusal that emits `purge_command`. **Nothing about the policy was invented here; only the act of
    setting `revoked_at` was missing.**
  - **The command is in ANOTHER PROCESS from the gateway, and that is the load-bearing claim.**
    `gateway.ts`'s own comment leaves the drive mechanism to the host ("timer, LISTEN/NOTIFY, or an
    in-process hook"), and the shipped host chose a timer that re-reads the registry — so a CLI
    revocation reaches a running gateway's live sessions within one sweep. `revocable.test.ts` §C
    proves exactly that and it is the half `auth-eviction-latency.test.ts` cannot: that suite calls
    `revokeDevice` in-process.
  - **Why a second command and not a `--revoke` flag on `provision-device`** (the SIMPLER option,
    `24 §3b`). `registry.ts`'s own recorded reason: *"a provisioning command that also revokes is one
    typo from a stopped branch"*. The two acts have opposite blast radii — a failed provisioning is
    an inconvenience, an accidental revocation stops a till mid-service — and opposite defaults.
    Its inputs are strictly **smaller** than provisioning's: `DATABASE_URL` only, no
    `DEVICE_TOKEN_SECRET`, because revocation mints nothing. Anyone holding that DSN could already
    run this exact `UPDATE`; it grants nobody anything new.
  - ⚠ **`14-F13` IS THE SPEC'S REAL ANSWER AND IT IS OWED, not rejected.** *"Revocation is immediate
    ('stolen tablet' flow): `device.revoked` → cloud token rejected, LAN participation flagged
    branch-wide on next contact (01-F25); the list shows revoked state and **actor**"*, on `14-F12`'s
    per-branch device list, reachable from an owner's phone (`14-N2`). Three things stand between
    here and there, none of them a gateway task: `PERMISSION_ACTIONS` (`packages/domain`, PROTECTED)
    declares **no device action**, so commandment 8 has nothing to authorize the request against and
    adding a cell is a spec PR against Appendix A; the screen needs `14-F12`'s device-list read model
    (class, app version, last-seen, sync lag), none of which this service projects; and the actor —
    see below.
  - ⚠ **IT WRITES NO `device.revoked` EVENT, DELIBERATELY.** The type is legal (`01-F62`,
    `ORG_SCOPED_EVENT_TYPES`) and `appendOrgEvent` is in this service, so emitting one is two lines.
    Three reasons not to: `registry.ts`'s **ratified T-01-09 ruling** puts `device.registered /
    revoked` emission on the doc 14/15 emitters, not on this seam; `OrgEvent.actor_user_id` is
    nullable and `14-F13` requires the **actor**, but a shell on the service host has no
    authenticated user, so this could only ever write `null` — an unattributed row, permanently, in
    an append-only store (commandment 1), and "somebody revoked this and we do not know who" is a
    worse record than none because it looks like one; and `provision-device` emits no
    `device.registered`, so emitting here would leave a history of revocations with no matching
    registrations. **So revocation has no ledger record and no actor attribution today** — that is
    the `14-F13` half, and it is OWED.
  - **UN-REVOCATION IS NOT OFFERED, AND THE SPEC IS SILENT RATHER THAN PERMISSIVE.** Nothing in the
    corpus describes reinstating a revoked device — no FR, no `DECISIONS.md` row (`grep -ain
    "un-revoke\|unrevoke\|reinstate"` over `specs/` returns nothing). What *is* specified is the
    replacement path: `01-N5` mints a **fresh `device_id`**, and `01-F42` purges the revoked device
    on next contact, after which there is nothing left to reinstate. Building a restore flag would
    be inventing security policy (commandment 2) and would reintroduce §6b's
    `do update set revoked_at = null`. `parseArgs` runs `strict`, so `--restore` / `--unrevoke` /
    `--reissue` are refused **by name** rather than ignored, and §F pins the round trip an operator
    would actually try: revoke, then `provision-device` still refuses in both modes.
  - **It READS THE ROW BEFORE IT WRITES, which is the `00 §5.7` half.** `revokeDevice` is an
    `UPDATE … WHERE`, so a mistyped `--device` matches zero rows, returns `void`, and a command that
    trusted it would print success over a till that is still live and still selling. An unregistered
    device is therefore a **loud** non-zero refusal; the row that is found supplies the **branch and
    class** printed back, which are the only fields that can catch a typo landing on a real device.
    Re-revoking says *already*, prints the original instant and stays **exit 0** — the desired state
    holds, and a kill switch you hesitate to re-run is one you hesitate over; that the instant is
    unchanged is also a security signal, because if you did not revoke it, somebody did.
  - **The eviction bound it prints is read from `REVOCATION_SWEEP_INTERVAL_MS`, never written out.**
    A hand-copied "30 s" keeps saying 30 after someone changes the sweep — `K-3`'s dead-oracle
    defect in an operator's sentence instead of a test's. Mutant R5 is that row.
  - Everything goes to **stdout** here, unlike `provision-device`, whose prose is on stderr only
    because stdout carries a credential. A revocation produces no token, so this follows `migrate.ts`.
- **THE AUDITOR IS SCHEDULED, AND IT NO LONGER LIVES HERE (August 2026).** `runAuditor` had **zero
  production callers** from Wave 0 — AGENTS.md's recurring defect, and `20 §4.2` puts the Auditor in
  Wave 0 *"with the kernel, not later"*, so it was overdue rather than deferred. `services/jobs` now
  runs it per org on a BullMQ repeatable, and that second consumer is what moved the file:
  **`DEC-ARCH-001` (RULED) put it in `packages/auditor`**, the only home both services may import
  under `18 §2`. For the window in between, this package published an `exports` map
  (`./auditor`, `./database-url`) so the cross-service edge was at least enumerated; **that field is
  now DELETED and this service publishes nothing again, like every other one.**
  - **`src/index.ts` still re-exports `runAuditor` and its four public types, now from
    `@restos/auditor` — that is load-bearing, not tidiness.** `__acceptance__/auditor-builders.ts`
    reads the Auditor off this barrel (`import * as gatewayModule from "../index.js"`), so ten
    suites did not move with the file and this service stayed at 330/330 through the move.
    Re-pointing those suites at the package instead would leave every one of them green while
    silently narrowing this service's public surface — `services/jobs`' `§F` is the only assertion
    that survives that repair.
  - **`redactedDsn` went to `@restos/config` on the same ruling; `DATABASE_URL_DEFAULT` stayed
    here.** One is a shared interpretation of which part of a DSN may reach a log store (`18 §5`) —
    a second copy is the hazard this file already names for `REVOCATION_SWEEP_INTERVAL_MS`. The
    other is a fact about THIS service's boot: a shared default would hand every service a database
    it never named.
  - **Landing the caller made a previously-INVISIBLE gap visible, and that is the rail earning its
    keep.** With no shipping constructor, Rule B had no candidate on `runAuditor`; with one, it
    reported `read_model` as an optional seam nothing supplies — `20 §4.2`'s **read-model diff leg**,
    the FR's own headline sentence. It is a recorded debt at the member's declaration (now in
    `packages/auditor/src/auditor.ts`), because the cloud maintains no incrementally-maintained
    projection to diff against (`01-F7`'s row shapes are projected device-side by
    `@restos/sync-client`; this service projects only the catalog), and diffing a snapshot the
    Auditor's own host refolded would always pass.
  - ⚠ **That marker reds one assertion in `services/jobs`'s acceptance suite** (`§H` bans the marker
    token anywhere in `auditor.ts`, not just on `runAuditor`). Measured both ways, the conflict is
    real and unavoidable; see `services/jobs/CLAUDE.md` before changing either side.
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
- **`kernel.orgs` + `kernel.branches` + `kernel.users` — THE TENANCY DIRECTORY (`0010`/`0011`,
  `01-F68`/`01-F69`/`11-F20`), and `device_registry.display_name` (`01-F70`). ⚠ THIS BULLET SAID
  "STORAGE ONLY: THEY HAVE NO WRITER YET" AND THAT IS NO LONGER TRUE — see the tenancy-command
  bullet below (`15-F27`).** `01 §5` has
  listed `orgs/branches` among the cloud tables since Draft 1 and nothing created them, so `org_id`
  arrived here as free text with nothing for it to point at and every surface rendered a UUID where
  a restaurant's name belongs. Exact shape: `orgs(org_id pk, display_name, status, created_at)`;
  `branches(branch_id pk, org_id, display_name, branch_type, branch_class, created_at)` +
  `branches_org_idx` on `org_id`; `device_registry.display_name text NULL`.
  - ⚠ **THERE IS NO FOREIGN KEY ANYWHERE IN `kernel`, AND `01-F68` FORBIDS ONE FROM ANY LEDGER TABLE
    *EVER*.** Events already exist under org ids no row here names — that is the deployment's actual
    state — so a constraint from `kernel.events` would refuse ingest for exactly those orgs, and
    refusing ingest is refusing a sale a till already rang and persisted (`01-F17`, `00 §5.1`).
    Admission is the gate and it is one layer up (`01-F25`/`01-F47`/`01-F48`, `01-F71` (c)).
    **An org with events and no record is UNNAMED, not invalid.** Verified against real Postgres:
    `select … from pg_constraint where connamespace='kernel'::regnamespace and contype='f'` → 0 rows,
    and an `INSERT` into `kernel.events` under an org absent from `kernel.orgs` succeeds.
  - The directory's own edges are unconstrained too (`branches.org_id` does not reference `orgs`;
    `device_registry.branch_id` does not reference `branches`) — an **interpretation**, recorded in
    `schema.ts`: the first would turn a directory into an ordering gate on the reconciliation
    `01-F68` describes, and the second would break provisioning outright, because every device
    registered to date has no branch row.
  - **Closed sets carry no CHECK** — `orgs.status` (`15-F25`: `active | suspended`, no third value),
    `branch_type` (`01-F25`), `branch_class` (`01-F49`) — matching `device_class` and
    `catalog_entries.kind`. Validation is the writer's, in Zod, so the set has ONE interpretation.
    `display_name`'s **non-empty** rule is `NOT NULL` here and enforced at the writer through
    `packages/domain`'s `DisplayName`; `01-F70`'s *required at registration* is CLOSED —
    `provision-device --name` refuses without one. Both were OWED in this bullet until `15-F27`.
  - ⚠ **`drizzle-kit generate` CANNOT BE USED VERBATIM HERE.** `meta/` carries snapshots for
    `0000..0003` only, so the generator diffs against `0003_snapshot.json` and re-emits every change
    from `0004..0009` as well — measured: it recreates `catalog_entries`/`catalog_versions`/
    `org_events`, re-adds `token_expires_at`, and DROPs two constraints that no longer exist. That
    output fails on any migrated database. Run it into a scratch folder, take the DDL for the NEW
    objects, discard the replay — which is what `0004` onward already did, and `0010` documents.
  - **`__acceptance__/auditor-builders.ts`'s `TABLES` deliberately does NOT include them.** It is an
    org-scoped ledger digest; a directory row is not history and adding it would change what the
    Auditor's read-only pin covers.
  - **`kernel.users` (`0011`) has ONE WRITER AND TWO READERS, and the split is deliberate.** `18 §4`
    wants one writer service per table and that is this one; `services/api` READS it on the login
    path and never writes it. Shape:
    `users(user_id pk, org_id, email, display_name, password_hash, assignments jsonb, grid_ordinal,
    created_at)` + `users_email_lower_uq` UNIQUE on `lower(email)` + `users_org_idx`.
    **Email is unique case-folded and GLOBALLY, not per org**, because `UserStore.findByEmail` takes
    an email and nothing else — `01-F71` (b) takes the org FROM the authenticated subject, so a
    per-org index would admit two rows one lookup cannot choose between. `password_hash` is NOT NULL
    and holds an Argon2id PHC string from `domain`'s `hashPin` (`01-F26`'s single hashing story at
    `01-F61`'s cost floor), never a password.
- **TENANT PROVISIONING IS FOUR DECLARED COMMANDS (August 2026, `15-F27`):
  `create-org`, `create-branch`, `create-owner`, `list-tenancy`.** Until this landed there was **no
  way to onboard a tenant at all**: the kernel had been org-scoped since Wave 0, `0010`/`0011` had
  shipped the tables, `packages/domain/src/tenancy.ts` had shipped the records — and the only org a
  running deployment had was `BOOTSTRAP_ORG_ID` + two more environment variables in `services/api`,
  assembled into a `Map` that dies with the process. That is AGENTS.md's recurring defect at the
  BUSINESS-MODEL level: correct multi-tenant plumbing, one tenant, once, until restart.

      pnpm -C services/sync-gateway create-org     --name "Karachi Biryani House" [--org <id>]
      pnpm -C services/sync-gateway create-branch  --org <id> --name "Tariq Road" [--branch <id>] [--type …] [--class …]
      pnpm -C services/sync-gateway create-owner   --org <id> --email <email> --name "Ayesha Khan"
      pnpm -C services/sync-gateway list-tenancy   [--org <id>]

  - **Why commands and not a console** (`24 §3b`, alternatives in each file's header). The same
    argument `provision-device` and `revoke-device` already made: **they grant no authority their
    inputs did not already carry** — `DATABASE_URL` and nothing else, and anyone holding it can
    already `INSERT` these rows. `15-F1`'s role-scoped internal console with `15-F3`'s audit trail
    is the destination and `15-F27` says so; `apps/platform-admin` is a two-line stub. An
    `/internal` route behind `PUBLISH_TOKEN` was rejected for `provision-device`'s reason **and one
    more**: unlike revocation there is no person-level `can()` above it, because no user exists yet.
    Self-service signup is refused by `15-F26` outright, not merely unbuilt.
  - **ORDERING IS ENFORCED AT THE WRITER BECAUSE THE SCHEMA CANNOT ENFORCE IT.** `01-F68` forbids a
    foreign key and `0010`/`0011` extend that restraint to the directory's own edges, so a branch
    under an unnamed org, or an owner in one, is refused **here or nowhere** — and "nowhere" means
    rows that look correct and that no query anywhere reports. This is `01-F60`'s completeness
    discipline at `publishCatalog`, one level out.
  - **Provisioning CREATES; it never renames, re-credentials or resurrects.** A re-run with the same
    id and the same name is a **no-op that says so** (provisioning has to be safe to repeat), and a
    re-run that would CHANGE a stored name is **refused**, pointing at `14-F2`/`14-F30`: a rename is
    made by an authenticated human whose identity it is attributed to, never by re-running a script
    with a typo in it. `--reissue` on `provision-device` refuses a differing `--name` for the same
    reason, and FILLS a name `0010` left null (filling a null is `01-F68`'s reconciliation, not a
    rename — `recordDeviceName`'s `and display_name is null` clause is what makes that structural).
  - ⚠ **A PASSWORD IS NEVER AN INPUT TO `create-owner` — not in argv, not in env, not as a hash.**
    `15-F26`: *"The vendor never holds a restaurant's password … onboarding staff type no password."*
    argv reaches every `ps` on the host and the shell history; env reaches `/proc`, crash dumps and
    every child; and `--password-hash` (what the runbook does today, `hashPin` in a `tsx -e`
    one-liner) only moves the problem, because a human still chose it. So the command **mints** a
    192-bit secret, hashes it with `hashPin`, and prints it **once on stdout alone**. `parseArgs`
    runs `strict`, so `--password`/`--password-hash`/`--pin` are refused **by name**.
    ⚠ **What this does NOT satisfy, stated rather than implied:** `15-F26` specifies a *single-use,
    expiring set-credential LINK*. What ships is an initial PASSWORD — it does not expire, it is not
    single-use, nothing forces rotation. The redemption surface has to sit behind `14-F1` and does
    not exist. Strictly smaller than the state it replaces; strictly larger than the FR.
  - ⚠ **NONE OF THEM EMITS AN EVENT, AND `15-F4`/`15-F3` SAY THEY SHOULD.** `revoke-device`'s
    ratified reasoning, unchanged: a command on a service host has no authenticated user, so
    `OrgEvent.actor_user_id` could only ever be `null`, permanently, in an append-only store
    (`01-F1`), and `15-F3` audits every staff action **with an actor**. An unattributed provisioning
    record is worse than none because it reads like one. **So a tenant created today has no ledger
    record and no attribution** — the `15-F4`/`15-F3` half is OWED to the console.
  - ⚠ **`kernel.users` IS WRITTEN HERE AND STILL READ FROM MEMORY BY `services/api`.** `create-owner`
    persists a real, verifiable owner; `services/api`'s `createMemoryUserStore` is unchanged, so the
    login path still serves `BOOTSTRAP_OWNER_*`. **The owner this command creates cannot yet sign
    in.** Closing it is one `UserStore` implementation (`createPostgresUserStore`, `findByEmail` /
    `findById` over `kernel.users`, `password_hash` compared with `verifyPin`) plus the composition
    root preferring it when `DATABASE_URL` is configured. It was **not** taken in this change because
    a concurrent session held `services/api/src/users.ts` and `server.ts` in the working tree, and
    AGENTS.md's rule is to leave a path another agent is mid-edit on.
  - **`list-tenancy` reports the DIRECTORY, not `15-F11`'s fleet dashboard.** App version, last-seen
    and sync lag are stored nowhere in this service, so they are ABSENT rather than invented
    (`00 §5.7`); the password hash is not even selected. stdout is JSON so `| jq` works; the prose is
    on stderr. An org with no record is a REFUSAL that says **UNNAMED, not invalid** (`01-F68`) —
    a command claiming "no such org" would be asserting something about a ledger it never read.
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

## Mutation matrix for `provisionable.test.ts` (round-3 law) — control 8/8 new + 288 pre-existing green

Device provisioning, `01-F25`/`01-F47`. Control: **296/296 green** (288 pre-existing + 8 new),
`REAL_EXIT=0` read from a marker written inside the log, never from a reported status. Every row is
the FULL package suite, in-tree with byte-exact backups and a restore trap, and each mutant differs
from the control in **exactly one branch**.

**The right-hand column is the whole point, and it is unusually clean here: in EVERY row the failing
test FILE was `provisionable.test.ts` alone (`Test Files 1 failed | 46 passed`), so all 288
pre-existing tests stayed green under every mutant** — including the two that reproduce shipped
behaviour. Every kill is therefore attributable to the new file rather than to the suite at large.

| # | mutant (exactly one branch) | new tests failed (of 8) | pre-existing 288 |
|---|---|---|---|
| P1 | **`scripts.provision-device` deleted** | **all 8** | **all green** |
| P2 | **`registerDevice` never called** — a decorative command that mints a token and admits nobody | **5** | **all green** |
| P3 | `token_expires_at` not passed — the registry seeds from the DATABASE clock instead | 1 (§B2) | all green |
| P4 | **the revocation refusal removed** — §6b's `do update set revoked_at = null` semantics restored | **1 (§D)** | **all green** |
| P5 | `DEVICE_TOKEN_ISSUER`/`AUDIENCE` not read — the token carries no deployment binding | 1 (§B3) | all green |
| P6 | the already-registered refusal removed — a second run silently re-registers | 1 (§C) | all green |
| P7 | the 32-byte `DEVICE_TOKEN_SECRET` floor dropped from the command (the VALUE is untouched) | 1 (§F) | all green |
| P8 | **CONTROL: same states, same writes, different prose on the narrative lines** | **0** | all green |

**P1, P2 and P4 are the ones to re-run after any change here.** P1 is `startable.test.ts`'s M1 and
`migratable.test.ts`'s N1 for this file — delete the declared script and **every** assertion goes
red, which is the whole reason the test spawns `scripts["provision-device"]` rather than a hardcoded
`tsx src/provision-device.ts`. P2 is the seam row and the one that matters most: a command that
mints a valid, verifiable, correctly-bound token and writes **no registry row** is a command that
looks like it worked and admits nobody — `18 §5`'s "the registry, never the token, decides" stated
as a mutant. P4 is the security row, and it is not hypothetical: it restores exactly what the
runbook instructed for months.

⚠ **P7 is a validation BRANCH, not a security constant.** AGENTS.md requires mutation of a security
*parameter* to happen out-of-tree, because an agent killed between "weaken" and "revert" strands
live weakened crypto. Nothing here weakens `DEVICE_TOKEN_SECRET`, `PIN_ARGON2ID_PARAMS` or any
cost floor — the mutant deletes the command's *check* that the operator supplied ≥32 bytes, and a
stranded copy reds a test rather than downgrading a credential.

⚠ **THE FIRST RUN OF `seams:check` ON THIS WORK FAILED, AND THE REASON IS WORTH KEEPING.** The new
file's header explained the debt marker it was deleting — and *quoted the marker token*. The rail
treats a marker in a file header as covering **every export in the module**, so the paragraph
describing the fix silently marked all three new exports as debt; and the same literal, quoted in
`registry.ts`'s rewritten doc comment, re-declared the exception it was announcing the deletion of
and failed as **STALE**. `migrate.ts` already carries this warning for the header form and it was
read *before* writing and reproduced anyway. **Do not write the token in prose in a production
module.** Measured: 38 owed exports and a hard failure before, 35 and a clean run after.

## Mutation matrix for `revocable.test.ts` (round-3 law) — control 8/8 new + 296 pre-existing green

Device revocation, `01-F25`/`01-F48`/`01-F42`. Control: **304/304 green** (296 pre-existing + 8 new),
`REAL_EXIT=0` read from a marker written inside the log, never from a reported status — and confirmed
on a second full run after every mutant was restored (the tree was diffed byte-exact against its
backups first). Every row is the FULL package suite, in-tree with byte-exact backups and a restore
trap, and each mutant differs from the control in **exactly one branch** except R2b, which is labelled.

**In EVERY row the failing test FILE was `revocable.test.ts` alone (`Test Files 1 failed | 47
passed`), so all 296 pre-existing tests stayed green under every mutant** — including the two that
reproduce shipped behaviour. Every kill is attributable to the new file.

| # | mutant | new tests failed (of 8) | pre-existing 296 |
|---|---|---|---|
| R1 | **`scripts.revoke-device` deleted** | **all 8** | **all green** |
| R2 | **`revokeDevice` never called** — the command reports on a device it never revoked | **6** | **all green** |
| R2b | R2 **+ the post-write re-read guard neutered** (two branches — the fully decorative command) | 5 | all green |
| R3 | **the NOT REGISTERED refusal removed** — a mistyped `--device` silently "succeeds" | **1 (§E)** | **all green** |
| R4 | the already-revoked branch removed — a re-run claims it did the revoking | 1 (§D) | all green |
| R5 | the eviction bound hand-copied as `30s` instead of read from `REVOCATION_SWEEP_INTERVAL_MS` | 1 (§C) | all green |
| R6 | `parseArgs` `strict: false` — flags the command does not implement are silently ignored | 1 (§F) | all green |
| R7 | the report echoes the ARGUMENTS instead of the registry row — no branch, no class | 1 (§G) | all green |
| R8 | **CONTROL: same states, same writes, different prose on the narrative lines** | **0** | all green |

**R1, R2 and R3 are the ones to re-run after any change here.** R1 is `startable`'s M1 /
`migratable`'s N1 / `provisionable`'s P1 for this file — delete the declared script and **every**
assertion goes red, which is why the test spawns `scripts["revoke-device"]` rather than a hardcoded
`tsx src/revoke-device.ts`. R2 is the seam row: a command that prints a confident revocation report
and writes nothing is the exact defect this file exists for, and the six kills are the ones that
matter (§B admission, §C live eviction, §D, §F, §G, §H). **R3 is the 2am row and it is the one a
reviewer should look hardest at** — it is not hypothetical, it is what `revokeDevice` alone does:
an `UPDATE … WHERE` on a device that does not exist matches no rows, returns `void`, and reports
success over a till that is still selling.

⚠ **R2b is worth keeping for what it did NOT kill.** Neutering the post-write re-read guard *on top*
of R2 took the kill count **down** from 6 to 5 (§G survives, because the fabricated fallback reads
the real branch and class off the still-unrevoked row). Two readings, both useful: the guard is not
what the suite rests on — §B/§C/§D/§F/§H catch a decorative command without it — and R2's sixth kill
was partly the guard converting a silent lie into a loud failure, which is what it is for. **A
mutant that changes the count in the unintuitive direction is a result, not noise** (`migratable`'s
N5 records the same lesson from the other side).

⚠ **§C and §H deliberately overlap `auth-eviction-latency.test.ts`, and the overlap is not the
point.** That suite already pins that `sweepRevocations` evicts and that a revoked session's
`catchup_request` is refused — but it calls `revokeDevice` **in-process**. What §C and §H add is that
the sweep and the per-operation check see a revocation performed by **another process**, which is the
only way a CLI kill switch can work and is exactly how `server.ts`'s `setInterval` learns of one.
A mutant inside `sweepRevocations` would kill §C *and* that suite's tests, so its kill would not be
attributable to this file; no such row is claimed here.

## Mutation matrix for `0010_tenancy_records` (round-3 law) — control **334/334** green

A migration's seam is the journal: the `.sql` is inert until `meta/_journal.json` names it, and
`readMigrationFiles` reads the journal and nothing else. So the seam mutant is *"delete the journal
entry"* — the migration file still sits in the folder, `git status` still shows it, and nothing
applies it. In-tree with byte-exact backups and a restore trap (no security constant is touched);
every row is the FULL package suite, `REAL_EXIT` read from a marker written inside the log.

**In every row the failing FILE was `migratable.test.ts` alone**, so the kills are attributable.

| # | mutant (exactly one branch) | tests failed (of 334) | rest of the suite |
|---|---|---|---|
| T1 | **the `0010` journal entry deleted — the file ships and never applies** | **3** | **331 green** |
| T2 | **the `CREATE TABLE kernel.orgs` block deleted (journal intact)** | **3** | **331 green** |
| T3 | the `ALTER TABLE device_registry ADD COLUMN display_name` line deleted | **1** | 333 green |

**T1 is the row to re-run after any change here.** It is the shape a reviewer cannot see in a diff:
the migration reads perfectly, the schema file declares the tables, `tsc` and `seams:check` are both
clean, and no database ever grows the tables.

⚠ **T3 is a WEAKNESS the matrix exposes rather than a strength it proves.** One kill, and it is
*incidental*: nothing asserts `01-F70`'s column exists — the only test that notices is the torn-schema
resume, whose tear-off `drop column`s it and therefore errors if it was never added. `EXPECTED_TABLES`
checks table names and no column names at all. **The writer phase must land a real assertion on
`device_registry.display_name`**, or a future migration that drops the column will fail exactly one
test for the wrong reason.

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

## `/internal/devices` — `14-F12`'s list and `14-F13`'s revocation, over the service credential

Two routes beside the four publish ones, behind the same `PUBLISH_TOKEN` and the same fail-closed
503. They exist so `services/api` can serve an AUTHENTICATED device screen: the CLI kill switch
above stays, and `14-F13`'s half — a revocation with an **actor** — is now reachable.

- `GET /internal/devices?org_id=` → `listDevices` (`registry.ts`). ⚠ **It projects what this table
  HAS, not what `14-F12` asks for.** The FR wants "class, app version, last-seen, sync lag"; the
  registry holds the class. App version and last-seen are stored **nowhere in this service** and sync
  lag comes off a cursor this row does not carry, so the three are ABSENT rather than invented —
  doc 15's device pipeline is what closes them.
- `POST /internal/devices/revoke` → **`revokeRegisteredDevice`, the SAME function the CLI calls.**
  That reuse is load-bearing, not convenience: two paths to one act means two readings of the
  read-before-write (a mistyped id matches no rows and reports success over a live till), of the
  already-revoked branch, and of the post-write re-read. `03-F40`'s two sensor bit layouts is this
  corpus's own record of what a second interpretation costs.
- `revokeRegisteredDevice`'s NOT-REGISTERED throw became a **`RangeError`** so `refusalStatus` maps
  it to 400 rather than 500. The CLI reads `error.message` and exits 1 either way, so the class is
  invisible there — which is exactly why it could be stated for the route without moving the command.
- **No actor field on the request, deliberately.** Registry rows are provisioning bookkeeping, not
  event history (T-01-09), so attribution goes on the `device.revoked` org-scoped event that
  `services/api` appends. `strictObject` refuses an `actor_user_id` **by name**, so a caller cannot
  believe it attributed a revocation it did not.
- ⚠ **REVOCATION SITS BEHIND `PUBLISH_TOKEN` — THE MENU CREDENTIAL — AND THAT IS THE ARGUMENT
  `provision-device` USED TO REJECT EXACTLY THIS SHAPE.** The `onRequest` hook above guards every
  `/internal/` path with one bearer, so the kill switch and the menu share a secret. Admission was
  refused that arrangement in this file on the stated ground that *"publishing a menu and admitting
  a device to the org's ledger should not sit behind one secret"*. A senior review flagged the
  contradiction as **unargued anywhere** — the fact was recorded, the reasoning was not — so here it
  is. **Revocation is defensible behind this credential; it is not the same act as admission**, for
  three reasons in descending strength:
  - **It is not the only check, and admission's would have been.** `14-F30` gates the human at
    `services/api` (`can("device.manage")`, owner-only), so `PUBLISH_TOKEN` is the second layer
    under a person-level refusal. An `/internal/provision` route would have had **no** person-level
    check above it — no signed-in user exists at provisioning time, which is the whole reason
    `01-F25`'s pairing code is owed — so there the credential would have been the entire security
    story. ⚠ **Stated honestly: that layering protects callers who come through `services/api` and
    nobody else.** A holder of `PUBLISH_TOKEN` can POST this route directly and bypass the matrix
    entirely. This service authorizes **services, never people** — the same boundary `01-F47` draws
    for devices — and nothing here changes that.
  - **It grants no authority.** Admission MINTS a credential that opens a session and writes the
    org's ledger; revocation only takes one away. The failure directions are not comparable:
    admission's is escalation, revocation's is denial of service.
  - **The blast radius is already reachable with this credential.** A holder can publish an
    arbitrary menu to every till in the org — an empty one stops all of them selling. So revocation
    widens the specific act, not the CLASS of harm, and its damage is loud, attributable at the
    registry, and recoverable by `01-N5`'s replacement path (a fresh `device_id`). It never yields a
    read or a write.

  **This is a recorded justification, not a ruling, and splitting the credential is not refused —
  it is unscoped.** A second secret for the device routes is a larger change (deployment, the
  runbook, `services/api`'s env contract) and wants its own decision. **Two things would reopen it:**
  a role other than owner widened into `device.manage`, which weakens the first reason; or a second
  service issued `PUBLISH_TOKEN`, which weakens the third.

### Mutation matrix — `device-http.test.ts` (round-3 law), control **317/317** green, 0 survivors

In-tree with byte-exact backups and a restore trap, against real Postgres. **In every row the failing
FILE was `device-http.test.ts` alone — all 304 pre-existing gateway tests stayed green.**

| # | mutant (exactly one branch) | new 13 failed | pre-existing 304 |
|---|---|---|---|
| G1 | **the revoke route never registered — the back office's kill switch 404s** | **8** | **all green** |
| G2 | **the route calls `revokeDevice` directly instead of the shared `revokeRegisteredDevice`** | **3** | **all green** |
| G3 | `listDevices` loses its `where org_id` — one org sees another's fleet | 4 | all green |
| G4 | a fabricated `last_seen` added to the row (`00 §5.7`) | 1 | all green |
| G5 | the NOT-REGISTERED refusal loses its `RangeError` — a caller mistake becomes a 500 | 1 | all green |
| G6 | **CONTROL: the list's ORDER BY loses its branch tiebreak; same rows, same values** | **0** | all green |

**G1 and G2 are the two to re-run after any change here.** G2 is the 2am row: it is what the route
would do if someone "simplified" it to the one-line UPDATE, and it answers **200 with a fabricated
outcome over a device that does not exist** — the same defect `revoke-device.ts` was built to
prevent, reintroduced one layer out.

⚠ **§C is the assertion a column check cannot make, and it needed the RIGHT CLOCK.** The first draft
built its gateway with `Date.now()`; `helpers.ts` mints session tokens against `BASE_T`, so every
token read as 90 days expired and the session opened straight into `01-F47` drain mode — where reads
are refused **for the wrong reason**, and §C's read assertion would have passed against an unrevoked
device. `journey-catalog.test.ts` records the same trap from the other side. Fixed to `makeClock()`.

## Mutation matrix for the tenancy commands (round-3 law) — control **358/358** green

`15-F27`'s four commands plus `01-F70`'s `--name`. Control: **358/358 green, 53 files,
`REAL_EXIT=0`** read from a marker written INSIDE the log, never from a reported status. In-tree
with byte-exact backups and a restore trap; every file was `cmp`'d against its backup after each
row. **Nothing here is a security constant** — no cost floor, no key length, no permission cell is
touched, so a stranded mutant reds a test rather than downgrading a credential (AGENTS.md's narrow
out-of-tree rule does not bite). Every row is the FULL package suite and differs from the control in
exactly one branch, except T4 which is labelled.

**In EVERY row the failing FILE was a single one, so the other 52 files stayed green under every
mutant** — the kills are attributable to the new suite rather than to the package at large.

| # | mutant | tests failed (of 358) | failing file | rest |
|---|---|---|---|---|
| T1 | **the DECLARED `create-org` script deleted — the file ships, nothing can run it** | **11** | `tenancy-provisionable` | **52 files green** |
| T2 | **`create-org` never calls `insertOrg`** — prints a confident org_id, writes nothing | **8** | `tenancy-provisionable` | **52 files green** |
| T3 | **the ORDERING refusal removed** — a branch under an org with no record is accepted | **1** | `tenancy-provisionable` | 52 files green |
| T4 | `--name` OPTIONAL again on `provision-device` (two branches: required-list + default) | 1 | `provisionable` | 52 files green |
| T5 | **`create-owner` hashes something OTHER than the secret it prints** | **1** | `tenancy-provisionable` | 52 files green |
| T6 | **CONTROL: same states, same writes, same refusals — different PROSE everywhere** | **0** | — | **all green** |

**T1, T2 and T3 are the ones to re-run after any change here.** T1 is `startable`'s M1 /
`migratable`'s N1 / `provisionable`'s P1 for this file — delete the declared script and eleven of
the suite's assertions go red, which is the whole reason every test spawns `scripts["create-org"]`
rather than a hardcoded `tsx src/create-org.ts`. T2 is the seam row: a command that mints a UUIDv7,
prints it, exits 0 and writes **no row** is indistinguishable from a working one at the terminal —
this wave's named defect in an operator's hands. **T3 is the one a reviewer should look hardest at**,
because it is not hypothetical: it is exactly what the absent foreign key permits, and `01-F68`
forbids adding that key **ever**, so the writer's refusal is the only enforcement that can exist.

⚠ **T6 KILLED ONE TEST ON ITS FIRST RUN, AND THAT WAS A FINDING ABOUT THE SUITE.** §B2 asserted the
re-run narration contained the word `ALREADY` — a test keying on **wording** rather than on
behaviour, which is precisely the vacuity the round-3 law exists to catch, and it would have gone on
passing against a command that stopped being idempotent as long as it kept saying the word. The
idempotence claim is now `expect(await orgRow(orgId)).toEqual(first)` — `created_at` is inside
`first`, so an insert-or-overwrite that produced identical-looking output fails while a true no-op
passes — and the refusal assertions match **FR ids** (`14-F2`, `14-F14`, `14-F30`), which are the
stable contract (commandment 9). T6 re-run after the fix: **0 killed, 358/358 green.**

⚠ **THE FIRST CONTROL RUN WAS RED FOR A REASON WORTH KEEPING: `--name "Counter till"` UNQUOTED.**
Three suites join `argv` with spaces and run the result **through a shell**, so a bare two-word name
arrives as two arguments and `parseArgs` refuses the positional one — 12 failures across
`provisionable`, `revocable` and `dsn-redaction` that looked like a broken command and were a broken
fixture. Every fixture that supplies a name now quotes it, and says why. A second red — `§B`'s
global `select count(*) from kernel.orgs` reading 3 where 1 was expected — is `helpers.ts`'s own
isolation rule being broken: *"per-test isolation is fresh org_ids, never truncation"*, and vitest's
`forks` pool runs FILES in parallel against one database. **A global row count in this suite is a
race by construction.** The assertion is per-`org_id` now.
