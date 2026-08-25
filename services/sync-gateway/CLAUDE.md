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
      @restos/sync-gateway schema up to date — all 14 migrations applied

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
    13 of 13 migrations are unapplied. Run ...`; an unreachable database reads `schema could not be
    checked — the database did not answer (… ← connect ECONNREFUSED …)`, on ONE line and with no
    DSN in it.
  - **Idempotency and partial application, MEASURED against a real Postgres.** drizzle 0.45.2 runs
    every PENDING migration inside **ONE transaction** (`pg-core/dialect.ts`) and Postgres DDL is
    transactional, so a failed run is all-or-nothing: verified by planting a colliding
    `kernel.events` before migrating — the run failed on `CREATE SCHEMA "kernel"` and left **zero**
    journal rows and no new tables. A second run on a migrated database applies nothing (journal
    row count unchanged — 11 when that was the count, 13 after `0012`, 14 since `0013`) and says
    `nothing to apply`.
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
  - ⚠ **What it does NOT close. ⚠ THE FIRST ITEM IS CLOSED as of August 2026** — `01-F80`'s
    pairing code has a model, a claim endpoint and a back-office surface (see the pairing block
    below), so an owner no longer needs shell access to admit a device. This command survives as the
    OPERATOR tool it always was. Still open: device-side persistence of `01-F47`'s silent renewal (the FR puts it in
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
- **`01-F80`'s PAIRING CODE — THE CLOUD HALF (August 2026): `pairing.ts` + `pairing-http.ts`,
  three `/internal` routes and ONE route that is deliberately not `/internal`.** `01-F25` has
  specified *"registration is a one-time pairing via back office code"* since Draft 1 and nothing
  anywhere specified the credential half, so `provision-device` — a shell on the service host —
  stayed the only way a till came into existence, and `28-F13` named that as the point where a
  self-onboarded restaurant STOPS. Oracle: `__acceptance__/pairing-claim.test.ts` (**35**, authored
  from spec text by a session that wrote no implementation, RED as handed over). Package **568/568**.
  - `POST /internal/devices/pairing-codes` (the MINT, behind `PUBLISH_TOKEN`),
    `GET /internal/devices/pairings` and `POST /internal/devices/pairings/cancel` for `14-F41`'s
    waiting row — and **`POST /pair/claim`, which is NOT under `/internal/` and must never move
    there.** `registerPublishRoutes`' `onRequest` hook demands the publish credential for every path
    under that prefix; `01-F80` (f) makes the claim an unauthenticated write **by construction**, so
    a claim registered there would answer `401` to every till in the world at the one moment it
    holds nothing, and `503` on a deployment that declared no publish credential. It lives in its
    own module with its own registrar so no future edit can put it behind `publishSecret` by
    accident — that module never sees the secret.
  - **THE ONE DESIGN DECISION NO FR MAKES: how a claim FINDS its row.** `01-F80` (b) requires an
    Argon2id verifier, and an Argon2id hash carries a random salt, so it cannot be looked up by. The
    three candidates and the choice are argued in `drizzle/0013_device_pairing.sql`'s header:
    scanning every live row costs one verification **per row per guess** (the denial of service (e)
    refuses by name), a cleartext selector spends the entropy (b) sizes against an online guess, and
    a **keyed blind index** — `HMAC-SHA256(key derived from the device-token secret under a label,
    code)` — costs one SELECT and is not reversible from a database dump. The verifier still gates
    the claim; the index only finds the row.
  - **AN EXPIRED PENDING ROW IS KEPT AND IS NOT SWEPT.** `01-F80` (c)'s *"leaves nothing"* is about
    DEVICES. Deleting the row would make `expired` and `unknown_code` indistinguishable, and (f)
    distinguishes them deliberately — *"an owner reading yesterday's code off a note needs to be
    told to re-issue rather than left doubting her typing"*.
  - ⚠ **A PINNED READING WITH A SECURITY CONSEQUENCE: a claim never resurrects a revoked device, and
    `01-F80` does not rule on it.** Derived from `01-F47`, `01-F48` and `01-N5`, and it is the exact
    defect `running-the-stack.md` §6b shipped (`on conflict … do update set revoked_at = null`).
    Refused `already_claimed`, chosen among the closed five because its next action is the right one.
  - **`packages/lan-pki`'s three `@unreached-owed` markers are DELETED** — `createOrgIssuer` and
    `issueDeviceCertificate` have a shipping caller at last, and a marker on something reached fails
    the rail. That is `01-F73`'s pairing-path debt paid.
  - ⚠ **It emits no event.** `14-F41` names this act as what unblocks `device.registered` and then
    records that the type has no payload schema in `packages/domain`, so `01-F4` makes the emit a
    build-time error — unbuildable, not unbuilt. The mint's `actor_user_id` is stored on the pending
    row so the emit has an actor the day that schema lands.
  - ⚠ **RE-ISSUE AND CANCEL ARE THE SURFACE'S, and the ORACLE says so.** `pairing-claim.test.ts`
    deliberately asserts neither, because `01-F80` names no parameter for *which* waiting row is
    being re-issued. `cancelPairing`/`listWaitingPairings` here are `14-F41`'s, and their coverage is
    `apps/backoffice`'s.

### Mutation matrix — `01-F80`'s cloud half (round-3 law), control **568/568** green

In-tree with `git checkout --` as the restore and `restore-dirty=0` verified after every row; the
two mutants that touch a hashing choice were run **OUT OF TREE** on a full copy of the worktree
(`T8`: an agent killed between "weaken" and "revert" strands live weakened crypto). Every in-tree
row is the FULL package suite, `REAL_EXIT` read from a marker written INSIDE the log. **In every
killing row the failing FILE was `pairing-claim.test.ts` alone, so all 533 pre-existing tests
stayed green under every mutant.**

| # | mutant (exactly one branch) | killed (of 568) | which |
|---|---|---|---|
| SEAM-CLAIM | **`server.ts` never calls `registerPairingRoutes` — the claim route unmounted** | **27** | every test that pairs |
| SEAM-MINT | **the mint route registered under another path — `14-F41` has nothing to call** | **31** | all but §F's two free-standing refusals and §I |
| P1 | **the MINT writes the registry row** — a device nobody paired | **24** | §A's "no registry row" + the claim's duplicate-key blast radius |
| P8 | **a token and no certificate** — a till that syncs and can never join its own branch LAN | **20** | every test that pairs (`mustClaim`'s completeness check) |
| P2 | TTL 60 minutes | 4 | §C ×2, §D, §I |
| P3 | the TTL never enforced | 3 | §C, §D, §I |
| P4 | the retry RE-ISSUES instead of returning the stored certificate | 3 | §D ×2, §H |
| P5 | a second public key gets its own certificate | 5 | §D ×3, §H, §I |
| P6 | `device_class` in the certificate subject | 1 | §E "THREE facts" |
| P7 | **the roster-signing key IS the issuer's** — `01-F81` (c)'s refused design | **1** | §E |
| P9 | a fresh issuer per claim | 2 | §E "PER ORG and STABLE", §D |
| P9b | ONE platform issuer for every org | 1 | §E |
| P10 | the issued certificate is not recorded | 3 | §E `01-F81` (a)/(f), §D ×2 |
| P11 | no rate limit | 2 | §G, §I |
| P12 | a GLOBAL rate-limit counter | 1 | §G "it never locks the deployment" |
| P13 | the org's PRIVATE issuing key in the response | 1 | §E "no private key material" |
| P14 | **a revoked device re-credentialled** | **1** | §H |
| P15 | one refusal for every cause | 3 | §C, §D, §I |
| P16 | `01-F70`'s name dropped at the registry write | 1 | §H `14-F12` |
| P17 | the claim honours a caller's `now` | 1 | §C |
| P18 | a 6-digit code | 1 | §B |
| P19 | a sequential counter instead of a CSPRNG | 3 | §B, §G, §I |
| P20 | the code stored in a column | 4 | §B "never the code" + three that read the name |
| P23 | the mint NOT behind the `/internal` credential | 1 | §A |
| P24 | the claim demands a bearer token | 27 | §A ×2 + every test that pairs |
| P25 | a stated `org_id`/`device_class` honoured | 1 | §A |
| P21 | **SHA-256 instead of Argon2id (OUT OF TREE)** | **1 of 35** | §B `01-F61` cost floor |
| P22 | **Argon2id at m=8,t=1,p=1 (OUT OF TREE)** | **1 of 35** | §B `01-F61` cost floor |
| NC | **NEGATIVE CONTROL: every refusal sentence reworded, same states, same writes** | **0** | — |

**SEAM-CLAIM, P8 and P14 are the three to re-run after any change here.** SEAM-CLAIM is `L7`
("mutate the SEAM, not the logic") on this act. P8 is the brief's own headline case and the reason
`mustClaim` enforces `01-F80` (f)'s completeness **in the fixture**: a token without a certificate
fails every test that pairs rather than only the one that thought to check. P14 is the security row
and it is not hypothetical — it restores exactly what the runbook instructed for months.

⚠ **P23 AND P24 MOVE THE ORACLE'S PINNED ROUTE CONSTANT ALONGSIDE THE PRODUCTION ROUTE, and that is
what makes them one branch rather than two.** Moving only the production route reproduces
SEAM-MINT (a 404), which measures the absence of a route rather than the presence of a guard;
moving both keeps the request reaching the handler, so what is measured is the credential.

⚠ **P9's FIRST DESIGN HUNG THE SUITE INSTEAD OF FAILING IT, AND IT FOUND A REAL DEFECT.**
`orgPkiMaterial` recursed into itself after its `on conflict do nothing` insert; under a mutant that
skips the read, that recursion never terminates. A hang is not a result (`migratable`'s N5 records
the same lesson from the other side: **check what a mutant does before recording what its survival
means**), and the shape it exposed is real — a recursion whose base case is *"the row I just
inserted is readable"* is unbounded on any state where that is false, inside a credential writer. It
is one re-read and a named throw now, and P9 was rebuilt to terminate.

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
    ~~Self-service signup is refused by `15-F26` outright, not merely unbuilt.~~ ⚠ **OVERRULED
    August 2026** — `28-F12` amends `15-F26` by name (founder rulings **R17**/**R40**), and the act
    ships as `signup.ts` behind `POST /internal/signup`. See the signup bullet below. R40 keeps
    these four commands **as operator tools**; what it retires is `create-org` as *the onboarding
    path*.
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
- **`kernel.staff_versions` + `kernel.staff_entries` + `kernel.user_credentials` — THE STAFF
  ROSTER'S CLOUD STORAGE (`0012`, `staff.ts`), tables thirteen to fifteen.** `01-F28` requires PIN
  verification to work **on-device against synced credential hashes**; measured August 2026 there
  was no source — the cloud user row was eight columns with no credential, no status and no version
  axis, and the only roster any till had held was a dev seed of three fictional people. `staff.ts`
  is the storage half: `staffVersion` / `publishStaffRoster` / `staffPage` / `setPinCredential` /
  `setUserStatus`. ⚠ *This said "**It has no shipping caller yet and carries a file-header debt
  marker naming the two steps that land one**", with the sequencing argued as deliberate rather than
  this wave's recurring defect — the wire being a BREAKING change (`01-F77` bumps `v: 1` → `v: 2`)
  that could not be made until there was something to serve.* **BOTH of those steps have landed and
  this module now carries NO debt marker at all**: step 4a gave it `user-crud.ts` and step 6 gave
  `staffPage` the serve arm below, so the register moved 29 → 28 and `staff.ts` dropped off
  `seams:check`'s debtor list. Oracle: `__acceptance__/staff-roster-storage.test.ts` (**66** —
  amended August 2026 for `11-F22`'s per-(person, branch) disambiguation, again for `01-F75`'s
  continuation clause, again for its delta clause (§N) plus `01-F26`'s every-assignment leg
  (§G8), and again for `01-F78`'s two halves (§O) and `01-F77`'s version-0 shape (§P); it was 39 as
  authored, 50 after the first amendment, 55 after the second and 59 after the third). Package
  total **424/424**.
  - **`01-F78` IS IMPLEMENTED — BOTH HALVES (2026-08-18).** Half one (who is in the artifact) was
    already right by accident of the participation lookup: `participationAt` returns `undefined` for
    a person no assignment of whose reaches this branch, and `publishStaffRoster` refuses her by
    name, so an own-branch assignee and an org-wide owner are publishable and a person assigned only
    elsewhere is not. **Half two was NOT**: the published row carried **every** assignment the person
    held, so branch A's artifact told every till at A the org's whole branch structure — `01 §9.7`'s
    own named cost, `01-F71`'s isolation boundary crossed by reference data rather than by a query,
    and R25's purchase spent (the roster was made branch-scoped to narrow the credential blast
    radius). The row is now filtered by the reach predicate **at publish time**, so the log holds the
    narrow bytes and all three serve paths inherit it from one place.
    - ⚠ **THE PREDICATE IS A SECOND COPY AND `packages/domain` DOES NOT EXPORT THE FIRST — a
      recorded DEBT.** `01-F78` names the rule as *"exactly `rolesAt`'s existing predicate in
      `packages/domain`"*, and `rolesAt` (`permissions.ts:536`) is a module-private `const`;
      measured 2026-08-18 over that package's `src/index.ts` there is no exported equivalent. So
      `staff.ts` declares `reachesBranch` and says so at the declaration. **What `18 §2` wants is
      the export** — `rolesAt` filtering through a shared predicate both call — and that is OWED on
      a SACRED path (spec PR + `20 §4.4` review). Until it lands, `can()`'s "may she act HERE" and
      the roster's "is she in this artifact" are two copies of one rule.
    - **Measured by hand, out of suite, against a real Postgres**, 84 requests over
      `have_version × from × at_version`, one org, two branches, a person holding
      cashier@A + cashier@B + owner@org-wide: **42 of 84 responses named the OTHER branch before,
      0 after** — same fixture, the filter as the only difference.
  - **THE PUBLISHER'S PEOPLE READ IS SERIALIZED AGAINST `setUserStatus` NOW — `for update of u`,
    the SAME row lock that writer already takes (2026-08-18).** It was an unlocked read, so a
    participation write could commit between this publisher's read and its write and the publisher
    would then mint `{status: "active", pin_hash: <the hash R32 had just deleted>}` as the version
    every till reconciles to on `hello_ack`. That is `11-F23`'s own named state — *"`inactive`
    holding a live credential"* — reaching every device at the branch from a publish that COMMITTED
    AFTER the departure, and **it is not `01-F71` (e)'s disclosed residual**: that residual is a
    historical version a continuation asks for, this is the CURRENT one.
    - ⚠ *This said "**Not live today** (`staff.ts` has no shipping caller); it becomes reachable the
      moment `14-F14`'s CRUD lands, which is the surface that calls both functions on one request."*
      **That CRUD landed at step 4a, so the race is LIVE and the lock is load-bearing now** —
      `user-crud.ts`'s `setPersonStatus` is exactly the request that calls both.
    - **Measured out of suite against a real Postgres, control and fix differing in exactly the one
      SQL clause** (the pre-fix copy rebuilt beside the tree, nothing mutated in place), two
      deterministic arms, each run twice with identical output:

          ARM A  a deactivation already queued when the publisher reads
            control  served v1 status=active  carriesHash=true   departedPinVerifiesAgainstServedBytes=TRUE
            fixed    served v1 status=inactive carriesHash=false departedPinVerifiesAgainstServedBytes=FALSE
          ARM B  the deactivation lands INSIDE the publisher's read -> write window
            control  publishedStateAlreadySupersededWhenItCommitted=TRUE
            fixed    publishedStateAlreadySupersededWhenItCommitted=FALSE

      `credentialRowsForHer` is **0** and `currentUsersStatus` is **inactive** in every cell, which
      is what makes ARM A's control row a leak and not an empty page. The window is a LOCK and not a
      sleep: ARM A holds her `kernel.users` row from a third connection, ARM B holds
      `kernel.staff_entries` in EXCLUSIVE mode — which conflicts with the publisher's INSERT and not
      with its SELECTs, so the publisher provably gets past its people read before it stops, and
      `pg_locks` is polled until it is provably waiting (the anti-vacuity guard).
    - **ARM B's `asPublished` is `active` + hash under BOTH builds, and that is the fix working, not
      a residual.** Fixed, the publish WON the race — the deactivation could not settle inside the
      window — so those bytes were true when they committed, and the CRUD's own follow-up publish
      mints v2 `inactive` with no hash (measured under both builds: the advisory lock forces it
      last). What the lock buys is that the two acts are TOTALLY ORDERED; what it does not buy is a
      caller that forgets to publish after a status change.
    - **`of u` and not a bare `for update`**: Postgres refuses a row lock on the nullable side of an
      outer join (`0A000`). **`order by u.user_id` is the deadlock half** — two publishes for
      DIFFERENT branches of one org may name overlapping people and the advisory lock does not
      serialize them (different keys). `EXPLAIN (costs off)` on the shipped query: `LockRows -> Sort
      -> Nested Loop Left Join`, so the sorted order IS the lock order.
    - ⚠ **TWO NEIGHBOURING CASES ARE RECORDED IN THE MODULE AND DELIBERATELY NOT CLOSED**, on this
      file's own rule that a fix should name the class it closed and the case one keystroke away
      that it did not. (i) **A person who loses her branch ASSIGNMENT rather than her participation**
      keeps an `active` row with her hash in that branch's last published version, and
      `publishStaffRoster` then REFUSES to publish the correction because nothing of hers reaches
      the branch — the only repair is to re-add the assignment and deactivate it. `01-F78`'s cost
      clause says this cannot happen, which is true of the membership RULE and false of the
      published LOG. **Unreachable today — nothing in this service removes an assignment** — so it
      is recorded rather than asserted, and it lands with the CRUD that can. (ii) `setPinCredential`
      takes no lock on `kernel.users` at all, so a PIN set concurrent with a publish can be missed
      by it: a freshness loss, never a stale credential.
  - **`01-F77`'s VERSION NUMBER IS A FACT ABOUT THE KEY NOW: a POPULATED key can no longer answer
    `version: 0` (2026-08-18).** `staffPage` resolves its version before it reads a row, and the
    continuation clause honoured any `at_version <= current` — including **0**, which `01-F52` and
    `01-F77` give exactly one meaning (*"published nothing"*, *"omitted, never sent as `0`"*). So
    `from: 1, at_version: 0` over a key at version 3 returned `{ form: "snapshot", version: 0,
    entries: [], complete: true }` at ANY `have_version`, and the comment at that early return
    ("nothing published for this key") was false in exactly that case. **Wire-reachable, which is
    what makes it a defect rather than an argument**: `packages/sync-protocol/src/messages.ts:230`
    declares `at_version: seq.optional()` with `seq = z.number().int().nonnegative()`, so every
    negative value is unreachable and **0 is legal**. The repair is `at_version > 0` and nothing
    more — a value naming no version leaves nothing to honour, so the request is served exactly as
    the two neighbouring cases already are (a first page, and a continuation stating no
    `at_version`). Refusing it, or serving the device's base, are equally defensible and **unwritten**,
    so choosing one would invent policy (commandment 2). Same sweep as above: **6 of 84 responses
    stated version 0 over a populated key before, 0 after.**
    - ⚠ **The `at_version: -1` example in `staffPage`'s "no input validation happens here"
      paragraph is now WRONG and has been corrected in place** rather than deleted: the `> 0` guard
      swallows a negative the same way. That paragraph was also aimed at the wrong half of the
      range — the negative was unreachable and 0 was wire-legal, and it was the reachable value that
      shipped the defect.
  - **`01-F75`'s CONTINUATION CLAUSE IS IMPLEMENTED (August 2026) — the two red tests are green and
    the credential leak is closed.** The clause landed at `b47dcbe` — *"`at_version` is honoured
    only on a CONTINUATION (`from > 0`), and a first page is served the CURRENT version whatever it
    asks for"* — while `staffPage` still clamped forward-only (`at_version <= current`), which the
    FR names as the defect it was amended to close. The fix is one predicate (`from > 0 &&`), and
    the suite was **413/413** at that moment (**417/417** now — see the delta bullet below, which is
    also why this bullet's "the credential leak is closed" was true of one door and not of the
    class). The reviewer's own probe, re-run by hand against a real Postgres with
    the two predicates as the only difference (the pre-fix copy built outside the tree, in a
    gitignored directory, so nothing was mutated in place):

        pre-fix   at_version 1 → served version 1  bilal active    deleted hash in response true
        post-fix  at_version 1 → served version 3  bilal inactive  deleted hash in response false

    …with `kernel.user_credentials` holding **0** rows for him under both, which is the point: R32's
    deletion was correct and a READ defeated it. The continuation leg is untouched — `from: 1,
    at_version: 1` still serves version 1 under both — so the clause is not implemented as *"ignore
    `at_version`"*.
  - **`01-F75`'s DELTA CLAUSE IS IMPLEMENTED TOO (2026-08-18) — THE SAME LEAK HAD A SECOND DOOR,
    THROUGH `have_version`, AND THE BULLET ABOVE DECLARED IT CLOSED WITH THAT DOOR OPEN.** The
    clause landed at `6e30636`: *"a delta carries ONE entry per changed id, the greatest version ≤
    the target — the same fold a snapshot at that version is, restricted to the ids that changed."*
    `staffPage` shipped the catalog's inherited reading — every published row in
    `have_version < version <= target` — so a cashier published `active` with a hash at v2 and
    departed at v3 was served her v2 row, hash and all, to any caller saying `have_version: 1`.
    Measured on the tree with the `at_version` fix in place and **417 tests green**:
    `have_version: 1, from: 0`, no `at_version` → `departedPinVerifies=true`. The repair is the
    snapshot's own query with one extra predicate (`version > have_version`), so the delta and the
    snapshot are ONE interpretation of the log rather than two.
    - **Re-probed by hand across the WHOLE request space**, outside vitest, against a real Postgres,
      with the row-replay delta as the only difference (`have_version` ∈ {0,1,2,3,4,99} × `from` ∈
      {0,1} × `at_version` ∈ {–,1,2,3,77} = 42 requests, `kernel.user_credentials` holding **0** rows
      for the departed cashier throughout):

          pre-fix   42 swept · 7 responses carried the deleted hash · departedPinVerifies TRUE
                    have_version 1 → form delta version 3 entries 4   (two rows for each of two ids)
          post-fix  42 swept · 0 responses carried the deleted hash · departedPinVerifies FALSE
                    have_version 1 → form delta version 3 entries 2   (the fold)

      Both runs served ≥2 distinct credentials and a live PIN still verified, so the `false` is a
      measurement and not an empty page. **All seven leaking rows are `have_version: 1`** — the base
      the FR names — and they leak at every `at_version` including none, which is the point of
      sweeping the fields together rather than one at a time.
    - ⚠ **NOTHING IN THE SUITE COULD SEE IT, AND THE REASON WAS A FIXTURE PROPERTY.** The leak needs
      a publication **strictly between** the claimed base and the target; the main roster publishes
      bilal at v1 and v3 with nothing between, so `1 < version <= 3` never contains his `active`
      row. §C2/§C3 assert a delta's `ids()`, which the row-replay reading gets right, and never its
      entry COUNT; §M sweeps `at_version` with `have_version` pinned at **0**, so every page it
      inspects is a SNAPSHOT. Three correct things left one gap between them — which is how the
      FIRST door survived too, and is why `01-F75` now says in terms that **every** client-supplied
      version field is a request to read the publication log and each needs its own answer.
    - **The residual is unchanged and is `01-F71` (e)'s.** A CONTINUATION (`from > 0`) naming a
      historical `at_version` is still served that historical fold, hash and all, on the FR's own
      ground that *"no device has a reason to open a page run at a version it does not hold"*. §N's
      sweep excludes exactly that case, deliberately, so asserting a refusal there would red a
      correct implementation.
    - **RE-SWEPT BY HAND AFTER the `01-F78` row narrowing (2026-08-18), because that edit is inside
      the same query the leak lived in** — 84 requests, `have_version` ∈ {0,1,2,3,4,99} × `from` ∈
      {0,1} × `at_version` ∈ {–,0,1,2,3,77,current}, against a real Postgres, with the pre-change
      file rebuilt beside it as the control (both behaviour edits reverted, nothing else):

          control (pre)  84 swept · 9 carried the deleted hash · 42 named the other branch · 6 stated version 0
          shipped (post) 84 swept · 9 carried the deleted hash ·  0 named the other branch · 0 stated version 0

      **The 9 are identical in both runs and are the residual above, not a regression**: every one
      is `from: 1` with `at_version` ∈ {1,2} — a continuation naming a historical version, which is
      the case the FR leaves open and §N excludes by name. Anti-vacuity held throughout (2 distinct
      credentials served, a live PIN still verified, the branch's own id served, the two-branch
      person's row inspected 45 times). So the narrowing moved the two things it was aimed at and
      moved the credential surface **not at all**, which is the claim worth having.
  - **THE SCOPE PREDICATE IS `=` NOW, AND THE INDEX IS THE WHOLE REASON** (`scopedTo`). It was
    `is not distinct from`, whose recorded justification had been corrected once already to *"on
    THIS resource the operator buys nothing at all"* — true of the ROWS and false of the PLAN.
    `is not distinct from` is not an indexable operator, so the branch column drops out of every
    access path — every plan below becomes a Seq Scan. (⚠ *This sentence went on to say the operator
    made `schema.ts`'s "both access paths in one index" comment describe an index the queries could
    not use. **That comment was false for a second, independent reason and has been rewritten**, so
    the quotation is retired — see the index bullet below.*) Measured 2026-08-18 with
    `EXPLAIN (analyze, buffers)` against a real
    Postgres (20 branches × 50 versions × 20 people = 20 000 entries, freshly `ANALYZE`d):

        staffVersion    is not distinct from → Seq Scan, 950 rows removed, 8 buffers
                        =                    → Index Only Scan Backward on the PK, 1 row, 3 buffers
        snapshot fold   is not distinct from → Seq Scan, 19 000 rows removed, 273 buffers
                        =                    → Bitmap Index Scan on the entries index, 0 removed, 78
        delta fold      is not distinct from → Seq Scan, 19 800 rows removed, 267 buffers
                        =                    → Index Scan on the PK, 0 removed, 44 buffers

    `staffVersion` is the one that matters: `hello_ack` reconciles this artifact on **every**
    reconnection (`01-F77`), so the old predicate cost a whole-table scan per reconnect, growing
    with the ORG rather than with the branch being served. `=` is provably equivalent here —
    `branch_id` is `NOT NULL` in both tables and `publishStaffRoster` refuses `branch_id: null` by
    name — and the forward-looking note survives **as a note**: the day a resource on `01-F76`'s
    shared scope shape publishes a real `branch_id: null` artifact it needs its own predicate, and
    reaching for `scopedTo` then is the mistake the comment now names. ⚠ **The suite cannot see this
    change at all** (mutant S1 below, 0 killed) — it is a plan change, not a behaviour change, and
    the numbers above are the only evidence there is.
  - ⚠ **THE DELTA SCAN USES THE PRIMARY KEY, NOT `staff_entries_org_branch_user_version_idx` — the
    "both access paths in one index" comment was false and is now what `EXPLAIN` said (2026-08-18).**
    It stood in `schema.ts` and in `0012_staff_roster.sql`, and **the table three bullets up already
    contradicted it in this very file** (`delta fold … → Index Scan on the PK`): two numbers for one
    plan, one screen apart. Re-measured on Postgres 16, freshly `ANALYZE`d, 20 branches × 50 versions
    × 20 people = 20 000 entries, one branch served:

        snapshot fold  (version <= N)        → Bitmap Index Scan on THIS index          84 buffers
        delta fold     (version > A and <= B) → Index Scan using the PRIMARY KEY         36 buffers
        staffVersion   max(version)          → Index Only Scan Backward on the PK         3 buffers

    The planner is right and the reason is column order: the PK is `(org_id, branch_id, version,
    user_id)`, so a version RANGE is a leading index condition there; this index puts `user_id`
    third and can only carry the range as a non-leading condition inside a bitmap. **What the index
    buys is the snapshot fold, and narrowly** — dropping it re-plans that query onto the PK's bitmap
    at **89** buffers against 84, same rows. It is KEPT (an index change is its own migration, and
    one machine at 20 000 rows is not the evidence for one) and only the CLAIM moved.
    - ⚠ **The claim was inherited, and its source is still false and still shipped.**
      `0012`'s comment says *"as `catalog_entries_org_kind_entry_version_idx` already is"*, copied
      from `0007_catalog_publication.sql:51` and `schema.ts:246` — and
      `plans/wave-1/oracle-round-2-findings.md` **A19 had already measured that one false**, on the
      snapshot path outright (*"an all-ASC index cannot serve `ORDER BY kind ASC, entry_id ASC,
      version DESC`, so the planner uses the PK and sorts; the migration comment claiming 'both
      access paths in one index' is false"*). **Those two catalog copies are NOT corrected here** —
      out of this task's diff, and A19's finding is about `catalogPage`'s quadratic paging, which is
      a change with behaviour in it. **A comment copied from a comment carries its errors**, which
      is the fourth round running that a claim at this table was falsified by the change that
      restated it.
  - ⚠ **`catalogPage` STILL CLAMPS FORWARD-ONLY *AND* STILL REPLAYS ITS INTERMEDIATE ROWS, AND
    `01-F75` MAKES BOTH RULES UNIFORM ACROSS RESOURCES.** That is a REPORTED divergence, not an
    oversight: the catalog is a shipped serve path with its own oracle and its own callers, and it
    was out of scope for the session that closed `staffPage` — twice now, once per door. Measured
    while reporting it, so the next session has the numbers rather than an impression:
    - **No in-repo caller would change behaviour.** Every 5-argument call site already passes
      `at_version` only on a real continuation — `publish-http.ts:191` pages from `page.next_from`,
      `catalog-transport.test.ts:277` writes `from === 0 ? undefined : v`, `:309` echoes
      `first.next_from`. So the predicate can be added without redefining any existing expectation,
      which is the trap `01-F75`'s own amendment was caught by on the staff suite (two green tests
      defending the overruled rule, found only by running the clause).
    - **A DEVICE can still ask, because `handleCatalog` forwards the wire fields verbatim**
      (`gateway.ts`: `message.have_version`, `message.from ?? 0`, `message.at_version`). That is
      exactly the reachability the staff leak had.
    - **The cost of the catalog case is FRESHNESS and redundancy, not a credential** — a menu
      carries no hash, and `01-F53` freezes a line's price into the event at line-add — which is why
      this is reported as a uniformity debt and not as a second leak. The delta half costs a device
      a longer page run and nothing else: `catalogPage`'s delta hands over every published row in
      the window, so a menu edited ten times between two reconnects travels ten times.
  - ⚠ **IT IS NOT `catalogPage`'s SQL POINTED AT `kernel.users`, AND THAT IS THE WHOLE DESIGN.**
    `kernel.users` is CURRENT STATE with no version column; the catalog's storage is an
    append-per-version publication log. Assembling a served roster from today's rows compiles,
    passes almost everything, and hands a device that fetched v3 last week **today's people
    labelled as last week's version** — which `01-F56`'s monotonic apply cannot detect, because the
    number it compares is right. Measured: that mutant fails **exactly one test of 408** (C6).
  - **The artifact key is `(org_id, branch_id)` as TWO COLUMNS.** `01-F52` keeps the catalog
    ORG-scoped; `01-F76` + R25 make the roster BRANCH-scoped, because "the roster's scope IS its
    credential blast radius". `01-F71` (d) bans the concatenation — including in the publish
    advisory lock, which takes `pg_advisory_xact_lock(hashtext(org), hashtext(branch))`, the
    two-integer form, rather than hashing `org || branch`.
  - **`11-F23`: the PIN hash is a TABLE, not a ninth column on `users`.** The login lookup cannot
    return the credential **because it does not join to it** — a structural bound rather than a
    discipline — and `11-F21`'s active-only rule becomes an ABSENCE rather than a NULL. The hash is
    a COPY frozen into the published row, not a serve-time join, because a delta must be
    constructible from an exact base.
  - ⚠ **PARTICIPATION IS PER-(PERSON, BRANCH) AND THE FIRST BUILD MADE IT A COLUMN — the largest
    thing this bullet block got wrong.** `11-F22` carried both readings; the FR now names its
    TRANSFER clause the operative one, because a cashier moving A→B must be *"`inactive` in A's
    roster and `active` in B's at the same moment"* and no per-person value can express that. An
    adversarial review measured the cost against a real database: deactivating her at A destroyed
    the credential B's artifact needs (an `active` member with no hash — the defect `11-F23`
    names), and any later republish at A re-copied her CURRENT status and **silently returned a
    departed cashier to `active` with a working PIN hash on her old branch's tills**. So the status
    rides `01-F26`'s assignment (`packages/domain`'s `PersonAssignment`), `setUserStatus` takes a
    `branch_id`, and `publishStaffRoster` reads THIS branch's participation per person — the
    assignment naming this branch, else her org-wide one (a stated READING where she holds both;
    neither is refused BY NAME rather than defaulted, because `inactive` invents a departure and
    `active` invents employment). ⚠ *That refusal used to be justified here and in the thrown
    message by `01 §9.7` being **open**; `01-F78` closed it and the refusal is now ENDORSED rather
    than provisional — half one puts in a branch roster exactly the people whose assignments REACH
    it, and a person whose assignments are all elsewhere is "absent from this artifact entirely",
    so there is no row to publish for her and no ruling still owed.*
  - **The WIRE row did not move, and I3 pins it.** `01-F75` declares one `status` on the `staff`
    row and `01-F76` already makes the artifact branch-scoped, so an entry's single `status` IS
    that branch's participation; the published `assignments` carry `01-F26`'s two members with the
    status STRIPPED. A per-assignment status on the wire is two representations of one fact.
  - **R32 is transcribed, not reasoned: `setUserStatus` DELETES the credential row when a person
    stops being `active` — keyed to the LAST ACTIVE ASSIGNMENT and never to one branch's.** Keyed
    per-branch it destroys the PIN the RECEIVING branch needs (`11-F23`, following `11-F22`).
    **Both writes are ONE transaction, by name and not by style** (`11-F23`): between two
    autocommit statements a dropped connection leaves her `inactive` holding a live credential, and
    the next re-activation restores her OLD PIN and publishes it to every till at the branch — no
    error anywhere, nothing queries for it, found by the cashier who still gets in. The status word
    is parsed BEFORE the transaction opens, so a refused word destroys nothing.
    **R32's second half is NOT closed here**: re-activation is a two-step act and the skipped
    second step must fail *legibly*, which belongs to `14-F14`'s surface and the device unlock
    flow. Publishing an `active` member with no credential is deliberately still ACCEPTED — R29 has
    the owner set the first PIN, so that window exists, and §F's fixtures publish exactly it.
  - **BOTH HALVES OF THE ARTIFACT KEY ARE CHECKED, and the branch half was MISSING.** Measured:
    publishing into a branch **no record names** and into **another org's branch** were both
    accepted and minted version 1 — an artifact carrying Argon2id hashes of real people, keyed to a
    branch that does not exist. `01-F68` forbids a foreign key, so it is refused here or nowhere
    (`15-F27`, and the rule `create-branch` and `insertUser` already enforce). ⚠ Containment was
    NOT what made this safe: `01-F71` (e) has the serve path derive the key from the SESSION, and
    ⚠ *that path "is step 6 and does not exist" — it LANDED at step 6 (August 2026)*. It still is
    not what makes this safe: a key no session can name is an artifact nobody can ask for, which is
    a different claim from the row being right.
  - **`grid_ordinal` uniqueness is enforced at the PUBLISHER against the folded artifact, and NOT
    by an index.** `01-F75` scopes it "within the artifact" and says in terms that a wider rule "is
    a storage choice this FR does not make"; the plan asked for an org-wide unique index and it is
    deliberately not built, because it would forbid two branches from both starting their grid at
    position 1. A departed member's ordinal stays reserved — a READING, since `11-F22` keeps her in
    the artifact and nothing rules on whether a new hire may take her tile.
  - **`kernel.users` gained NO column and lost one constraint** — `email` relaxed to NULLABLE
    (R30), plus a jsonb BACKFILL that puts `11-F22`'s status inside each element of `assignments`.
    ⚠ *This bullet said "gained two columns", naming a `users.status` that the reshape above
    deleted; there is no status COLUMN and its absence is the FR.* **`users_email_lower_uq`
    survives untouched**: Postgres permits multiple NULLs in a unique index, and dropping it "to
    make NULLs work" is the migration mutant the oracle's §H3 exists to kill. The backfill is
    guarded by `? 'status'` and `coalesce`, so it is idempotent and cannot destroy an empty array's
    NOT NULL; jsonb has no defaults, so the requirement lives entirely at the writer, in Zod.
  - ⚠ **`PersonRecord` (`packages/domain`, SACRED) changed shape, so this service is not the only
    caller that had to move.** Its `assignments` are `PersonAssignment[]` now.
    `services/api/src/users-postgres.ts` selects the same columns it always did — the field rides
    the jsonb — which is QUIETER than a column: nothing in a select changes, so the reader that
    breaks is the one whose ROWS predate the backfill, with a `ZodError` on the first login and a
    green typecheck, because `parse` takes `unknown`. Nothing downstream READS it yet:
    `UserRecord`/`AuthSubject` carry no status, so `11-F22`'s *"the authorization subject reads the
    status too"* is **not enforced on either plane** — that is the plan's step 2b, which lands on
    both planes in one change.
- **THE ROSTER IS SERVED OVER THE DEVICE SOCKET NOW (step 6, August 2026) — `01-F75`/`01-F77`/
  `01-F78`, and it is the step that connected two halves that had both been correct and unreachable.**
  `staff.ts` had the storage and `packages/sync-protocol` had the `reference_*` triple; `gateway.ts`
  refused a `staff` request **by name** and `hello_ack` advertised no `staff` key, so nothing
  connected them. Four things landed together and none of them is separable:
  - **`handleReference` serves `resource: "staff"`**, through the two read gates it already took —
    `requireUnrevoked` (`01-F48`: revocation blocks reads as well as writes) and the `01-F47` drain
    refusal. On this artifact those gates are what stands between a stolen tablet and the `11-F21`
    Argon2id hash of everyone active at the branch (R25: the roster's scope IS its blast radius).
    The three client-supplied version fields are **forwarded verbatim** to `staffPage`, which owns
    all three (`01-F75`: every one is a request to read the publication log). The response
    vocabulary is constructed ONCE for both resources — two copies is two chances to page one
    resource differently from the other.
  - **`01-F71` (e)'s BRANCH half**, which had no resource to bind to until now: a `catalog` frame is
    pinned to `branch_id: null` by the codec, so there was no branch to mismatch. The check is on
    the SCOPE and not per resource (`01-F76` gives every resource one scope shape). Refused as an
    `AuthRejectedError`, never clamped.
  - **`hello_ack.reference_versions` carries the staff key** for this DEVICE's branch — omitted,
    never `0` (`01-F77`), which is what makes an unpublished key indistinguishable from a gateway
    that does not serve the resource. This put `staffVersion` on **every reconnection of every
    till**, which is what the `=` scope predicate two bullets up bought the index for.
  - **`notifyStaffVersion` — REQUIRED in the deps bag, wired in `server.ts`, called from
    `user-crud.ts`'s single `publishTo` after each publish COMMITS, with the version that publish
    RETURNED.** This is `notifyCatalogVersion`'s defect refused in advance: that method shipped with
    zero production callers and *Apply now* reached a connected till only at its next reconnect.
    Required all the way down, so a build that forgets the fan-out does not compile. Branch-keyed,
    so `branchSets` is an index lookup here where the catalog's is a walk.
  - **The resource refusal is GONE rather than widened, and that is step 6's owned decision on the
    plan's finding 10.** A refusal inside `handle` is a DISCONNECTION (`server.ts` closes the
    socket), which is a `01-F17`-adjacent cost for what is an ordinary negotiation outcome. With
    both members of `01-F75`'s closed set served, the case is **unrepresentable** rather than merely
    unreached — the question is dissolved, not answered. **Adding a third member re-opens it**
    (`01-F74`'s device roster is the expected one), and that member's spec act inherits a
    session-killing refusal by default.

### Mutation matrix — the roster serve path (step 6, round-3 law), control **499/499** green

In-tree with byte-exact backups and an `md5sum -c` restore trap after every row (nothing here is a
security constant — each mutant reds a test rather than downgrading a credential). Every row is the
FULL package suite, `REAL_EXIT` read from a marker written INSIDE the log. **In every killing row
the failing FILE was a single one, so the other 57 files stayed green under every mutant.**

| # | mutant (exactly one branch) | killed (of 499) | which tests |
|---|---|---|---|
| S6-1 | **`server.ts` wires `notifyStaffVersion: () => {}`** — `notifyCatalogVersion`'s original defect, reproduced on this resource | **4** | `staff-over-the-wire` §E1, §E2, §E3, §E4 |
| S6-2 | **`01-F71` (e)'s branch check deleted** — a device may name any branch of its own org | **2** | `tenant-isolation-reference-serve` §B (both) |
| S6-3 | the staff arm forwards no `at_version`, so a continuation resolves at `current` | **1** | `staff-over-the-wire` §A5 |
| S6-C | **CONTROL: both `01-F71` (e) refusal sentences reworded, same states, same writes, same FR ids** | **0** | — |

**S6-1 is the row that matters and it is the reason the oracle's §E is built on `buildServer` and a
real socket.** The catalog's equivalent seam test mounted its own wiring and **survived** this
mutant — a test that supplies the wiring cannot observe whether the product supplies it — so the
four kills here are evidence about the PRODUCT's composition root and not about a harness. S6-2 is
the security row: `01-F71` requires by name that each enforcement point carry a test that fails when
that point ALONE is removed, and this is that measurement for the branch half.

In-tree with a byte-exact backup and an md5 restore trap (`staff.ts` verified `93ec8626…` after
every row); no security constant is touched — each mutant reds a test rather than downgrading a
credential, which is the narrow case AGENTS.md's out-of-tree rule leaves in-tree. Every row is the
FULL package suite (408 = 358 pre-existing + the oracle's 50), `REAL_EXIT` read from a marker
written INSIDE the log. **In EVERY killing row the failing FILE was `staff-roster-storage.test.ts`
alone, so all 358 pre-existing tests stayed green under every mutant** — the kills are attributable.

The earlier matrix here was measured against the pre-`11-F22`-disambiguation build (control
397/397, 39-test oracle). Its two rows are kept below the new ones because both still bind.

| # | mutant (exactly one branch) | killed | which tests |
|---|---|---|---|
| M1 | **`participationAt` returns `assignments[0]` — ONE answer for every branch, i.e. the per-person column's observable behaviour** | **6** | J1, J2, J3, J5, K2, K3 |
| M2 | the wire's `assignments` keep the status (the strip removed) | 1 | I3 |
| M3 | the entry's hash gated on **ANY** active assignment instead of THIS branch's | 4 | J1, J3, J4, L3 |
| M4b | **the credential DELETE escapes to a connection the caller cannot roll back** | **1** | L1 |
| M5 | R32's deletion keyed to **this branch's** flip (`status !== "active"`) instead of the LAST active assignment | 2 | J3, J5 |
| M6b | the status word validated LAST **and** the delete escaped (two branches, labelled) | 2 | L1, L2 |
| M7 | **the BRANCH half of the artifact key unchecked — the shipped behaviour before this change** | ~~**0 — SURVIVES**~~ **2 — CLOSED August 2026** | §G G6, G7 (see the second matrix) |
| M4 | the two writes NOT in a transaction, run on the handle passed in | **0 — SURVIVES, mis-designed** | — |
| M6 | the status word validated LAST, inside the transaction | **0 — SURVIVES, mis-designed** | — |
| M9 | **NEGATIVE CONTROL: every refusal reworded, same states, same writes, same FR ids** | **0** | — |
| M-DELTA | the delta ROW query loses its branch scope | 1 | §B B3 |
| M-TRAP8 | **the snapshot fold reads `status` from CURRENT `kernel.users` instead of the published row** | **1** | §C C6 |

**M1, M4b and M7 are the three to re-run after any change here.** M1 is the disambiguation itself:
it reproduces exactly what a per-person column does — one word for both artifacts — and six
assertions separate it from a correct build. M9 is what makes those counts mean anything: a real
edit to every sentence in this file reddens nothing.

⚠ **M7 SURVIVED THE ENTIRE SUITE AND WAS A LIVE COVERAGE HOLE — CLOSED August 2026 by the oracle's
owning session (§G6/§G7), and the paragraph is kept because the SHAPE recurs.** With
`assertBranchIsThisOrgs` deleted, all 408 tests passed. Measured by hand against a real Postgres in
the same session: an **org-wide assignee** (every owner — `01-F26`'s null location gives her a
participation value at any branch id) published into a branch **no record names** and into
**another org's branch** is ACCEPTED under M7 and mints **version 1** in both, and is refused by
name under the fix. So the guard was real and **nothing in CI would have caught its removal** — the
`01-F71` shape AGENTS.md already records for the API's login seam. ⚠ A probe that uses a person with
only BRANCH assignments proves nothing here: the per-branch participation lookup refuses her first,
for a different reason, and that mis-attribution was measured before it was fixed — **the oracle's
fixtures use the org-wide assignee for exactly this reason and say so**, and the refusals are matched
on FR id (`01-F68|01-F69|01-F71|15-F27`, deliberately NOT `01-F76`) so a §9.7-flavoured refusal
cannot satisfy them. Under M7 today both new tests report `promise resolved "1" instead of
rejecting` — the mutant mints the version by hand-measured behaviour and by assertion now.

⚠ **M4 AND M6 SURVIVE BECAUSE THEY DO NOT PRODUCE THE DANGEROUS BEHAVIOUR — check what a mutant
does before recording what its survival means** (`migratable`'s N5 and `summary`'s S4x record the
same lesson). §L1 hands `setUserStatus` the caller's OWN transaction, so an implementation that
merely runs both statements on the handle it was given is *already* atomic — dropping `db.transaction`
changes nothing observable there (M4), and validating late still rolls back (M6). The reachable
torn state is one half escaping to another connection, which is M4b/M6b, and both die. **What no
test in this repo can see is `11-F23`'s literal case — two autocommits on ONE connection with a
process kill between them** — and the oracle's §L header says so in terms rather than papering it
over.

⚠ **M-BASE (the delta-BASE `exists()` losing its scope predicate) SURVIVES, and it is a property of
the implementation rather than a hole in the code.** The base decision is
`have_version > 0 && have_version <= current && exists(base)` where `current` is already scoped, and
the delta query is scoped too — so under this variant the predicate is genuinely redundant and no
test can see it. On a variant that decides the base from the `exists()` ALONE (no
`have_version <= current` guard) the same mutant **is** killed by B3's retained leg, so it is kept
as defence in depth against exactly that refactor.

### Second matrix — the two holes an adversarial review found in the oracle above (control **413/413**)

Both holes were found by measuring what the suite CANNOT see, not by reading it. **Run OUT OF TREE**
(a `git worktree` off `b47dcbe` plus this tree's uncommitted state), because hole 1's fix did not
exist when the matrix was measured and the honest control is a build that HAS it: `01-F75`'s
continuation clause — the single predicate `from > 0 &&` on `staffPage`'s clamp — takes the amended
suite to **413/413, `REAL_EXIT=0`**. ⚠ *That predicate is now the SHIPPED file (see the bullet block
above), so H1 has stopped being "the tree as it stands" and become an ordinary one-branch mutant;
the control it was measured against is the tree.* Every row is the FULL package suite, `REAL_EXIT` read from a
marker written INSIDE the log, `staff.ts` restored byte-exact (`cmp`) after each row. **In every
killing row the failing FILE was `staff-roster-storage.test.ts` alone**, so all 358 pre-existing
tests stayed green under every mutant. The rows in the matrix above were measured at control 408/408;
only M7 and M-TRAP8 were re-measured at 413.

| # | mutant (exactly one branch) | killed | which tests |
|---|---|---|---|
| H1 | **the forward-only clamp restored (`at_version <= current`) — what this file shipped until the clause landed** | **2** | §M M1, M2 |
| H2a | **`assertBranchIsThisOrgs` never called — M7 above, the whole branch half** | **2** | §G G6, G7 |
| H2b | only the *no such branch* leg deleted | 1 | §G G6 |
| H2c | only the *another org's branch* leg deleted | 1 | §G G7 |
| M-TRAP8 | **re-measured against the REWRITTEN C6** (see below) | **1** | §C C6 |
| CTRL | **NEGATIVE CONTROL: every refusal reworded, same states, same writes, same FR ids** | **0** | — |

**H1 is the row that matters and it was not hypothetical: when it was measured, the mutant WAS the
shipped file.** Its two kills are the FR's own measurement — `first page asking at_version 1:
version 1` where the clause requires 3, and `response contains the deleted hash true` where R32
deleted the row — and both were re-observed by hand on a live database, outside vitest, before and
after the predicate landed (the bullet block above carries that output). **It is the row to re-run
after any change to `staffPage`**: the leak is one keystroke away in a line whose remaining half
(`at_version <= current`) is correct and must stay.

⚠ **THE OLD ORACLE REDS UNDER A CORRECT IMPLEMENTATION, AND THAT IS WHY TWO TESTS MOVED.** Measured:
the suite exactly as committed at `05a444e` (408 tests) against the clause-implementing build fails
**2 — B3 and C6** — both of which asked for a historical version on a FIRST page, which is the
request `01-F75` now forbids. That is AGENTS.md's named trap (a ruling lands, nobody greps the suites
that encode the old rule) caught in the window rather than a fortnight later. Neither test lost its
claim: B3 makes the same "one number, two artifacts, different bytes" assertion at version **4**,
which both branches have equally reached, and **C6 asserts the publication-log property at the
CURRENT version through an edit that was written and never published** — which is why M-TRAP8 was
re-run rather than assumed, and it still dies at C6 alone.

⚠ **H2b kills for a CRASH, not a refusal, and that is a mutant artefact worth stating.** With the
*no such branch* leg deleted the org-comparison leg dereferences `undefined`, so G6 reports
`Cannot read properties of undefined` instead of a missing refusal. It still attributes G6 to that
leg; it is not evidence that a partial implementation fails legibly.

⚠ **WHAT §M DELIBERATELY DOES NOT ASSERT.** `01-F75` honours `at_version` on a CONTINUATION, so a
caller passing `from > 0` **is** served the historical fold, hash and all. The FR's ground for that
is *"no device has a reason to open a page run at a version it does not hold"* — a reachability
argument about clients, not a bound the server enforces — so asserting a refusal there would invent
policy. §M3 is the control that keeps the clause from being implemented as *"ignore `at_version`"*,
and the residual belongs to `01-F71` (e)'s serve path, which does not exist yet.

### Third matrix — `01-F75`'s DELTA clause and the scope predicate (control **417/417**)

The second door. In-tree with a byte-exact backup and an md5 restore trap (`staff.ts` verified
`fc33afdd…` after every row); nothing here is a security constant, so a stranded mutant reds a test
rather than downgrading a credential. Every row is the FULL package suite, `REAL_EXIT` read from a
marker written INSIDE the log. **In every killing row the failing FILE was
`staff-roster-storage.test.ts` alone (`Test Files 1 failed | 53 passed`)**, so all 358 pre-existing
tests stayed green under every mutant.

| # | mutant (exactly one branch) | killed | which tests |
|---|---|---|---|
| D1 | **the row-replay delta restored — what this file shipped until the clause landed** | **3** | §N N1, N2, N3 |
| D2 | the fold's tiebreak reversed (`version asc`) — a FIRST-wins dedup | **3** | §N N1, N2, N3 |
| D3 | **the leak-only repair: row replay + `pin_hash` stripped from every superseded row** (2 branches, labelled) | **2 — N2 SURVIVES** | §N N1, N3 |
| S2 | the delta query loses its branch scope (M-DELTA re-measured against the fold) | 1 | §B B3 |
| H1 | the `from > 0 &&` continuation predicate deleted — re-measured at 417 | **3** | §M M1, M2 **+ §N N2** |
| S1 | **`is not distinct from` restored on `scopedTo` — the index change** | **0 — SURVIVES BY DESIGN** | — |
| CTRL | **NEGATIVE CONTROL: five refusal sentences reworded, same states, same writes, same FR ids** | **0** | — |

⚠ **THIS MATRIX IS A DATED RECORD AND ITS CONTROL HAS MOVED: 417 → 424, and `staff.ts` is no longer
`fc33afdd…`.** `01-F78`'s row filter and `01-F77`'s `at_version > 0` guard landed on 2026-08-18 and
neither row above was re-measured against them — **do not restore a mutant against that md5**, and
re-take a control before quoting any count here. Nothing in the rows is retracted: each one names a
branch that still exists, and H1's `from > 0 &&` predicate now sits beside the new `at_version > 0`
one in the same expression, so a session deleting "the guard" has two to be careful of, not one.

**D1 and D3 are the two to re-run after any change to `staffPage`'s delta.** D1 is the row that
matters and it was not hypothetical: when it was measured, the mutant WAS the shipped file, at
417 tests green with the `at_version` fix already in. **D3 is the row that justifies N1 and N3
existing at all** — it is the repair a session reaching only for the leak would write, and it takes
the credential assertion green (N2 survives) while replaying every intermediate row to every
reconnecting device. A suite holding only N2 would have blessed it.

⚠ **H1's kill count moved from 2 to 3 and the third kill is the interesting one.** §N's N2 sweeps
`have_version` × `from` × `at_version` together rather than asserting at one point, so it catches
the `at_version` door as well as its own — which is what the section header means by
door-independent. The two doors are now covered by two sections and by one sweep across both, and
`01-F75`'s generalisation is why: *"every client-supplied version field is a request to read [the
publication] log, so each one needs its own answer"*.

⚠ **S1 SURVIVES AND THAT IS THE RESULT, NOT A GAP.** `=` and `is not distinct from` return
identical ROWS on this resource — `branch_id` is `NOT NULL` in both tables and the publisher refuses
a null branch by name — so no test can distinguish them and none should try. The change is to the
PLAN, and its evidence is the `EXPLAIN` block in the bullets above and nowhere else. **A mutant that
survives because it does not change behaviour proves nothing about the suite** (`migratable`'s N5,
`summary`'s S4x, and the M4/M6 rows in the first matrix here record the same lesson); it is listed
so nobody reads the survival as a coverage hole and writes a test that pins an operator.

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

## `POST /internal/signup` — `28-F13`'s SELF-SERVE ACT, and the four things it deliberately is not

`signup.ts` + one route in `publish-http.ts`. Founder rulings **R17** (5–10 free pilots on one
pooled deployment, self-serve onboarding) and **R40** (*"a restaurant signs itself up and reaches an
org, a branch, an owner login and a device pairing code with nobody touching a terminal"*).
`28-F12` amends `15-F26`'s *"there is no self-service signup path"* by name; the four provisioning
commands survive **as operator tools** and are not deleted.

    POST /internal/signup  { org_display_name, owner_display_name, owner_email, now }
                           → 200 { org_id, user_id, initial_secret }

- **IT DECIDES NOTHING. It orders `createOrg` and `createOwner` inside one transaction.** `28-F13`'s
  own last clause is the reason: the self-serve act is a **third** writer of these two records
  beside `15-F27`'s commands and `15-F1`'s console, and *"two writers of one fact disagreeing
  silently is this corpus's most-repeated defect."* So `15-F25`'s `active`, `01-F68`'s minted
  never-reused id, `11-F20`'s minimum WHOLE including `01-F61`'s `grid_ordinal 0`, `01-F26`'s
  org-wide `{ role: owner, branch_id: null }` with `11-F22`'s status stated, `15-F26`'s first-owner
  refusal and `15-F27`'s minted-secret rule are all **inherited**, never restated.
- **ATOMICITY IS THE TRANSACTION AND `28-F13` PUTS IT AT THE WRITER BY NAME** — *"If the owner
  cannot be created the org must not stand … Atomicity is enforced at the writer, not by a foreign
  key — `01-F68` forbids one, permanently."* **Mutant S3 (the transaction deleted) SURVIVES the
  whole suite**, so this is defended by measurement rather than by a test — see the matrix below.
- **THE EMAIL CHECK BEFORE THE MINT IS `28-F13`'s ORDERING AND NEVER THE ENFORCEMENT.** The
  enforcement is `users_email_lower_uq`, reached through `createOwner`'s conflict path, which stays
  live for the concurrent case the read cannot see; a pre-check read as the enforcement is the TOCTOU
  race `tenancy.ts` refuses by name. What it buys is the FR's stated order, a **400** instead of a
  **500**, and not paying `01-F61`'s deliberately expensive Argon2id for a collision `28-F13` calls
  *"foreseeable and ordinary"*. **Mutant S4 (the pre-check deleted) also SURVIVES** — none of those
  three is asserted anywhere.
- ⚠ **IT IS NOT A PUBLIC SURFACE, AND `create-org.ts`'s OBJECTION TO THIS SHAPE IS CARRIED
  UNANSWERED.** That file rejected an `/internal` route behind `PUBLISH_TOKEN` for creating orgs
  because *"`PUBLISH_TOKEN` is the menu credential … Unlike revocation there is no person-level
  `can()` check above it either, because no user exists yet — the credential would be the entire
  security story."* The second half is **permanently true of self-serve signup by construction**,
  which is exactly why `28-F15` requires an admission control instead, and `28-F17`'s boot-asserted
  internal gate is *"UNBUILDABLE TODAY"* for want of an action vocabulary doc 15 has never written.
  `28-F18` (c) already owes this whole hop a `01-F71` clause. **Recorded, not resolved** — the route
  is pinned by `signup.test.ts`'s header, which calls it contestable and says to change it there and
  in any adapter together, never in one place.
- ⚠ **FOUR OF R40's FIVE STEPS ARE NOT HERE, AND EACH IS BLOCKED BY THE CORPUS RATHER THAN BY EFFORT.**
  - **The invite code (R46)** — `28-F15` requires a named admission control *"before the surface
    exists"*; R46 picks the KIND and **no FR specifies one** (issuance, format, single-use, TTL, rate
    limit, what a spent code does). There is also nothing for it to gate: `28 §9.26` leaves the
    public surface's host undecided, and `services/api/src/__acceptance__/signup-admission.test.ts`
    holds the tenant plane's one public door at `auth.login`. Building the store now would be a
    correct subsystem with no seam to the product.
  - **The branch** — a REFUSAL, not an omission (`28-F13`): `01-F69` wants a `display_name`, a
    `type` and a `class`, *"three facts a signup form has not asked for"*. `14-F26`'s wizard owns it
    and does not exist; `PERMISSION_ACTIONS` still carries no branch action, so its first procedure
    *"cannot be built or booted"*.
  - **The owner's own password on a single-use token (R47)** — `28 §9.21` records that `15-F26`'s
    set-credential link **has no redemption surface anywhere in this product**, its TTL/format/
    single-use protocol are specified nowhere, and the surface that redeems it is public by
    construction. What ships is `15-F27`'s minted initial password: **strictly smaller than R47,
    strictly larger than nothing.** ⚠ `signup.test.ts` §E pins that shape and its header records
    `28 §9.21` as unresolved — the oracle was authored one commit after R47 was ruled and does not
    carry it. **A finding for the test owner, not a blocker**: R47 is additive on a surface that does
    not exist.
  - **The device pairing code** — `01-F25` is one clause with no format, TTL, rate limit or claim
    protocol, and `plans/saas-pivot/plan-of-record.md` A3 lists specifying it as OWED to doc 01.
    `signup.test.ts` §C asserts the ABSENCE and forbids any test implying one exists.
- ⚠ **`createOwner`'s refusals are plain `Error`s, so the race-path email collision arrives as a
  `500`.** `signUp`'s pre-check throws a `RangeError` and gets a 400. `revokeRegisteredDevice`'s
  NOT-REGISTERED throw is the precedent for moving the rest; it is left alone here rather than
  reinterpreted at the route, and it is OWED to whoever builds the public surface.

### Mutation matrix — `28-F13`'s signup act (round-3 law), control **531 of 532**

⚠ **THE CONTROL IS NOT FULLY GREEN AND THE REASON IS THE ORACLE, NOT THE IMPLEMENTATION.**
`signup.test.ts` §A's *"CONTROL — the act is genuinely reachable, and the credential is the only
thing gating it"* is **unsatisfiable by any implementation**: its wrapper is
`signupOverHttp(body, token = PUBLISH_SECRET)`, a **default parameter**, so
`signupOverHttp(request, undefined)` sends the *valid* credential and is byte-identical to the call
three lines below that the same test requires to answer **200**. One request, one credential, two
required answers. Measured out of suite against the shipped route (probe deleted after): **no
credential → 401, wrong credential → 401, correct credential → 200**, which is the property that
test is aiming at. Reported to the file's owner; not edited (`24-F5`).

In-tree with byte-exact backups and an `md5sum -c` restore trap after **every** row, verified again
at the end. Nothing here is a security **constant** — no cost floor, no key length, no permission
cell — so each mutant reds a test rather than downgrading a credential, which is the narrow case
AGENTS.md's out-of-tree rule leaves in-tree. Every row is the FULL package suite, `REAL_EXIT` read
from a marker written INSIDE the log. **In every killing row the failing FILE was
`signup.test.ts` alone (`Test Files 1 failed | 58 passed`)**, so all 499 pre-existing gateway tests
stayed green under every mutant.

| # | mutant (exactly one branch) | killed (of the 32 satisfiable) | which |
|---|---|---|---|
| S1 | **the route never registered** — `/internal/signup` unmounted | **29** | all but §F's two fixture CONTROLs and §G's manifest row |
| S2 | **`strictObject` → `object`** — a field the form does not collect is IGNORED (`28-F5` (b), `28 §7`, `15-F27`) | **3** | §B org_id, §C field sweep, §E credential sweep |
| S6 | **the wire accepts an optional `org_id` AND the act forwards it** (2 branches, labelled) — the good-faith shape | **1** | §C field sweep **only** — see below |
| S3 | **the transaction deleted** — the two writers run on the handle they were given | **0 — SURVIVES** | — |
| S4 | `28-F13`'s email pre-check deleted (transaction + unique index remain) | **0 — SURVIVES** | — |
| S5 | **NEGATIVE CONTROL: every refusal reworded, same states, same writes, same status codes** | **0** | — |

**S6 IS THE ROW A REVIEWER SHOULD LOOK HARDEST AT, AND IT IS A HOLE IN THE ORACLE RATHER THAN IN THE
CODE.** `signup.test.ts` §F's disclosure assertion — the file's own *"SHARPEST ASSERTION"* — inspects
the body of the **email**-collision refusal and **never the `org_id`-collision one**, and §B's
`org_id` test asserts only that the request was refused and wrote nothing. So under S6, 31 of 32
tests pass while `createOrg`'s refusal is served verbatim to the caller. Measured out of suite under
S6 (probe deleted after), against a real Postgres:

    PROBE_STATUS=500
    PROBE_BODY={"error":"org 01a02248-… already exists and is called \"Kababjees 01a02248-4a6\",
                not \"Attacker 01a02248-4a9\". …"}
    PROBE_LEAKS_VICTIM_NAME=true   PROBE_LEAKS_VICTIM_ID=true

That is the cross-tenant oracle §F's own comment describes — *"does this tenant exist, and what is
it called"*, answered to whoever can reach the route — and **nothing in this repo would catch its
return.** What stops it today is one keystroke: `strictObject`. `01-F71`: *"each point carries a test
that FAILS when that point alone is removed."* **The assertion is OWED**, and the shape it needs is
`§F`'s disclosure sweep run over the `org_id` collision as well as the email one.

**S3 SURVIVES AND THE TRANSACTION IS STILL LOAD-BEARING — measured, because a survivor is not
evidence of a useless branch.** No test reaches the state it protects, because `28-F13`'s pre-check
and the wire's `DisplayName` both refuse before anything is written. The case that does reach it is
**two signups for one email, concurrently**, which no suite here constructs. Measured out of suite
against a real Postgres, four concurrent `signUp` calls sharing one address, the transaction as the
only difference, **identical on two consecutive runs**:

    A-shipped-transactional: attempts=4 fulfilled=1 orgRows=1 ORPHAN_ORGS_NOBODY_CAN_ADMINISTER=0
    B-no-transaction:        attempts=4 fulfilled=1 orgRows=4 ORPHAN_ORGS_NOBODY_CAN_ADMINISTER=3

Three orgs **nobody can administer**, permanently — `15-F26`'s *"no org exists that nobody can
administer"* broken and `01-F68` never reuses an `org_id`. The window is not a sleep and not a
flake: `01-F61`'s Argon2id cost floor holds it open ~440 ms, which is why all four attempts enter it
every time. **S3 is the row to re-run after any change here**, and its evidence is the block above
and nowhere else.

⚠ **S2 AND S6 DIFFER IN WHAT THEY DO WITH THE EXTRA FIELD, AND CONFLATING THEM COSTS THE FINDING.**
Zod's non-strict `object` **strips** an unknown key, so under S2 an `org_id` is ignored and no leak
occurs — the kills are about the refusal, not about the disclosure. Only S6, which *honours* the
field, reaches `createOrg`'s colliding-id sentence. *Check what a mutant does before recording what
its survival means* (`migratable`'s N5, `summary`'s S4x).

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
