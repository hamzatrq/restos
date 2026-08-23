# Running the stack — clean checkout to a till showing a menu an owner published

**Status: WORKING, and every command below was run.** August 2026, re-verified against the shipping
code 2026-08-24 (see *What changed*, below). This is the runbook for the product claim *"an owner
opens the back office, prices an item, publishes it, and the menu appears on the till"* — four
processes and one Postgres.

⚠ *This line said "and two credentials nothing in the product mints", which stopped being true in
August 2026: the product mints **both** now — the owner's initial password with `create-owner`
(§2b) and the device token with `provision-device` (§6b). What it does not mint is a device
**identity** (§0) and a `01-F25` pairing code.*

It exists because the knowledge was spread across `services/sync-gateway/CLAUDE.md`,
`services/api/CLAUDE.md`, `apps/backoffice/CLAUDE.md` and `apps/pos-electron/CLAUDE.md`, and no
document took anyone from zero to a working system. The run that produced it found **five** things
that stop the chain, three of which no suite could see; they are recorded in
[§7 What is still seeded, faked, or owed](#7-what-is-still-seeded-faked-or-owed).

> **Read `AGENTS.md` first.** Nothing here overrides a commandment, and §7 is the part of this doc
> most likely to go stale — a runbook claiming a gap it no longer has misleads exactly as badly as
> one hiding a gap it does have.

### ⚠ WHAT CHANGED — 2026-08-24, and one of these was DANGEROUS

A run from a clean checkout found six steps stale. Each was re-measured against the shipping code
before this edit; the measurement is stated where the step is, not here.

| § | what it said | what is true, and why the step was rewritten rather than annotated |
|---|---|---|
| **2b, 5a, 5b** | *"the owner this creates cannot log in yet, and §5 is still the path that works"* — mint an Argon2id hash by hand, pass `BOOTSTRAP_OWNER_*` | **Stale and DANGEROUS.** `createPostgresUserStore` landed (`services/api/src/server.ts:336`). `DATABASE_URL` and **any** `BOOTSTRAP_OWNER_*` — `BOOTSTRAP_ORG_ID` included — are now MUTUALLY EXCLUSIVE and both set is a deliberate **boot crash, exit 1**. So following the old §5a/§5b beside §2b did not merely waste a step: it stopped the API starting. §5a is deleted; §5b takes `DATABASE_URL` |
| **0, 3** | `BOOTSTRAP_ORG_ID` is one end of the three-way join key | Half-obsolete. On the Postgres path the org comes from the **owner's row** (`ctx.subject.org_id`) and `BOOTSTRAP_ORG_ID` must be **unset**. `ENABLED_BRANCHES` must still contain the device's `branch_id`, and nothing checks that |
| **4, 5b** | `listening on http://0.0.0.0:8080` | both services print **`http://127.0.0.1:…`**. Fastify resolves a `0.0.0.0` bind to a reachable address; an operator grepping the literal finds nothing and cannot tell that from a service that did not start. The API also prints a **second** line now |
| **6a** | `pnpm rebuild:native` once per checkout | Not needed when `bin/<platform>-<arch>-<abi>/` is already built, and running it **clobbers `build/Release/`** for everyone sharing the tree. Test first |
| **6c** | the store is at `~/.config/RestOS Counter/device.db` | true only **without** `--user-data-dir`. With it the store is `DIR/device.db`, no subdirectory — and §6c hands you `--user-data-dir` two commands earlier, so the read-the-store snippet failed |
| **6e (new)** | §7 named `RESTOS_PRINTER` and `RESTOS_PRINT_TO_FILE` and nothing else | **`RESTOS_KOT_PRINTER` was missing and it is required.** Without it every KOT and every cash slip is refused before a byte is sent, while receipts print — so the till looks healthy from the customer's side and the kitchen gets nothing. There is a printer section now: **§6e** |

⚠ **§6e is a new section, and it is NOT §7.** The printer content used to be one row of §7's table.
It is now a step you follow with the printer in your hands, at the till, where you are standing
when you attach one — and §7 keeps its number because four inbound references in
`plans/wave-1/decorative-surface-audit.md` and `plans/saas-pivot/audit-findings.md` cite
*"`running-the-stack.md` §7 owed item 4"* and *"item 5"* by number. Renumbering this section to
make the printer step a `7` would have silently broken all four, which is the same class of harm
as the stale steps above.

---

## 0. The one thing that breaks every attempt: THREE IDS MUST MATCH

Before any command: `apps/pos-electron` ships a **dev-seed device identity** with fixed UUIDs
(`main/index.ts`, `DEV_IDENTITY`). Since August 2026 the gateway **can** admit a device
(§6b, `provision-device`) — but nothing yet *hands the device its own identity*, so these three
UUIDs are still typed by a human on both sides and must agree:

| | value |
|---|---|
| `org_id` | `00000000-0000-7000-8000-000000000001` |
| `branch_id` | `00000000-0000-7000-8000-000000000002` |
| `device_id` | `00000000-0000-7000-8000-000000000003` |

**The till's `org_id` must equal the org the OWNER belongs to, and `services/api`'s
`ENABLED_BRANCHES` must contain the till's `branch_id`.** The catalog is org-scoped (`01-F52`) and
the API publishes under the logged-in owner's org — `ctx.subject.org_id`, read per request from the
`kernel.users` row `create-owner` wrote (`catalog-router.ts:135`, `:222`). The till fetches its own.
Get either wrong and **nothing anywhere reports an error**: the back office says *Published
version 1*, the gateway returns `200`, the database holds the menu, and the till sits at
`catalog v0 — 0 tile(s)` for ever, because it is asking about a different org.

⚠ **`BOOTSTRAP_ORG_ID` IS NOT THAT VARIABLE ANY MORE, AND ON THIS PATH IT MUST BE UNSET.** This
section named it as the API's end of the join for a year, and it is now half of the *other*
configuration: `BOOTSTRAP_ORG_ID` belongs to the in-memory `BOOTSTRAP_OWNER_*` dev seed, and
`services/api` refuses to boot when it is set beside `DATABASE_URL` (measured 2026-08-24: exit 1,
`resolveUserStore` at `server.ts:324`, before the port is bound). See §5b. What survives unchanged
is the OTHER end — `ENABLED_BRANCHES` versus the device's `branch_id`, which **nothing checks on
either side**.

⚠ **THE TILL'S OWN BOOT LINE STILL TELLS YOU TO MATCH `BOOTSTRAP_ORG_ID`** — *"The org must equal
the API's BOOTSTRAP_ORG_ID and the branch must be in its ENABLED_BRANCHES"*
(`packages/device-config/src/device-identity.ts:169`, `describeDeviceIdentity`). On the Postgres
path that sentence names a variable that must not be set, so an operator who follows the glass sets
it and the API will not start. **That is code, not documentation, and it is REPORTED here rather
than fixed** — the honest reading of the line today is *"the org must equal the org of the account
you log in with"*.

The example in `apps/backoffice/CLAUDE.md` (`BOOTSTRAP_ORG_ID=org-demo`,
`ENABLED_BRANCHES=branch-main`) is a **two-process** example — API + back office, where nothing
ever reads the org id back, and where no `DATABASE_URL` is set so the seed is legal. Copy it into a
four-process run against Postgres and you get a boot crash; copy it into one without and you get
the silent failure above.

Export them once and reuse:

```sh
export ORG_ID=00000000-0000-7000-8000-000000000001
export BRANCH_ID=00000000-0000-7000-8000-000000000002
export DEVICE_ID=00000000-0000-7000-8000-000000000003
```

⚠ **`ORG_ID` and `BRANCH_ID` above are overwritten by §2b, which is what you want.** `create-org`
and `create-branch` mint their own ids and print them; the till is then told those, not these.
Only `DEVICE_ID` is yours to choose, and it must be unique per physical machine.

⚠ **AS OF AUGUST 2026 THESE THREE IDS SHOULD COME FROM `15-F27`'s PROVISIONING COMMANDS, NOT FROM
THIS BLOCK** — see §2b, which runs after the migrations and before anything else. Hand-picked ids
still *work* (nothing keys on the directory, `01-F68` forbids a foreign key), but an org with no
`kernel.orgs` row is **UNNAMED**: every surface that resolves a name renders the UUID, which is the
defect `01-F68`/`01-F69`/`21-F15` exist to close. The block above is kept because it is what makes
the four-process id trap above readable, and because a run that skips §2b still comes up.

---

## 1. Prerequisites

```sh
pnpm install --prefer-offline          # ~5 s off pnpm's global store
```

Docker must be running — for Postgres, and for `pnpm -C services/sync-gateway test`
(Testcontainers). **Docker is needed to TEST the gateway and to run this stack; it is not needed
to START the gateway** (`postgres-js` connects lazily).

⚠ **Do not run `pnpm rebuild:native` yet.** It is needed only for `apps/pos-electron` (step 6) and
it breaks `pnpm test` until you undo half of it — see step 6.

---

## 2. Postgres

```sh
docker run -d --name restos-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=restos \
  -p 5432:5432 postgres:16-alpine
```

If `5432` is taken (a local Postgres, or another agent's container) map `-p 5433:5432` and put
`5433` in every `DATABASE_URL` below. `docker run` fails with *"ports are not available … address
already in use"*; note that `lsof -iTCP:5432` can come back **empty** under a sandboxed shell even
when the port is genuinely held, so trust the bind error over the probe.

### Migrations — one declared command

```sh
DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos' \
  pnpm -C services/sync-gateway migrate
```

Healthy — one line, and the DSN is password-redacted (`18 §5`):

```
@restos/sync-gateway migrate applied 13 of 13 migrations · postgres://postgres:*****@127.0.0.1:5432/restos
```

and fifteen tables in `kernel`:

```sh
docker exec restos-pg psql -U postgres -d restos -c '\dt kernel.*'
# branches · catalog_entries · catalog_versions · device_registry · device_watermarks
# events · org_events · org_sequences · orgs · quarantine · quarantine_notices
# staff_entries · staff_versions · user_credentials · users
```

`orgs` and `branches` arrived at `0010` (`01-F68`/`01-F69` — the tenancy directory), `users` at
`0011` (`11-F20`/`15-F26`), and `staff_entries`/`staff_versions`/`user_credentials` at `0012`
(`01-F75`/`01-F76` — the staff roster's publication log per artifact key; `11-F23` — the
device-plane PIN credential in its own table, which nothing writes or serves yet: the wire and the
CRUD are steps 4–6 of `plans/saas-pivot/staff-over-the-wire.md`). ⚠ **This paragraph said "nothing fills them yet" and that stopped being
true in August 2026** — §2b's four declared commands are the writer. They are still empty on a fresh
stack, and a run that skips §2b still comes up: `01-F68` makes an org with events and no record
**UNNAMED, not invalid**, no ledger table references any of the three, and `\d kernel.events` shows
no foreign key. What you lose by skipping is every name — the org, the branch, the till and the
owner all render as UUIDs (`21-F15`).

**It is idempotent.** A second run says so and changes nothing:

```
@restos/sync-gateway migrate nothing to apply — all 13 migrations were already present · postgres://…
```

⚠ **Postgres `NOTICE` objects on the second run are not errors.** `42P06 schema "drizzle" already
exists, skipping` and `42P07 relation "__drizzle_migrations" already exists, skipping` come from the
migrator's own `CREATE … IF NOT EXISTS` preamble and are dumped by `postgres-js` as objects with a
`code` field, which read like faults. They are evidence of idempotency. **Trust the last line and
the exit code** — an earlier version of this section called them "Postgres error objects", which is
what they look like and not what they are.

**Migration is a separate, deliberate act — the gateway does NOT migrate itself at boot** (a service
that migrates its own database on boot races its own replicas). What it does instead is *tell you*:
a fourth boot line reports the schema state, so forgetting this step is a sentence you read while
bringing the stack up rather than a `500` somewhere else later.

```
@restos/sync-gateway schema up to date — all 13 migrations applied
@restos/sync-gateway schema NOT MIGRATED — 13 of 13 migrations are unapplied. Run `pnpm -C services/sync-gateway migrate`; …
```

---

## 2b. Provision the TENANT — the org, its branch and its first owner (`15-F27`)

**New in August 2026, and it replaces nothing you were doing — it replaces nothing existing at
all.** Until these landed there was no way to create a tenant: `org_id` was a UUID you typed, the
only owner was three environment variables in `services/api`, and no row anywhere said what the
restaurant is called. `01-F68`/`01-F69`/`11-F20` make each of those a NAMED record and `15-F27`
makes creating them an invokable step.

Four commands, all needing `DATABASE_URL` and nothing else. **Each prints its machine value on
stdout and its prose on stderr**, so `$( … )` captures an id and not a paragraph:

```sh
cd services/sync-gateway
export DATABASE_URL='postgres://gateway:…@127.0.0.1:5432/restos'   # the same one §2 migrated

export ORG_ID=$(pnpm create-org --name "Karachi Biryani House" | tail -1)
export BRANCH_ID=$(pnpm create-branch --org "$ORG_ID" --name "Tariq Road" | tail -1)

# The owner's INITIAL PASSWORD is minted here and printed ONCE, on stdout. Nobody chose it and
# nothing stores it — 15-F26 forbids the vendor holding a restaurant's password. §5b logs in
# with it; keep it out of your shell history and out of any env file.
OWNER_PASSWORD=$(pnpm create-owner --org "$ORG_ID" --email owner@example.test \
  --name "Ayesha Khan" | tail -1)
echo "initial password: $OWNER_PASSWORD"

pnpm list-tenancy --org "$ORG_ID"        # read it all back; stdout is JSON, pipe it to jq
cd -
```

`| tail -1` is there because a package manager prints its own banner ahead of the script.

**What each one refuses, and why the refusal is the point.** `01-F68` forbids a foreign key from any
ledger table *ever* — an FK would refuse ingest for orgs whose events predate their record, which is
refusing a sale a till has already rung — so **ordering is enforced by these commands or by nothing
at all**: a branch under an unnamed org, or an owner in one, is refused by name. Re-running with the
same id and the same name is a **no-op that says so**; a re-run that would CHANGE a stored name is
refused, because a rename is `14-F2`/`14-F30` from an authenticated surface, not a side effect of a
script re-run with a typo. `create-owner` refuses a **second** owner (`15-F26` creates the first;
the rest are `14-F14`'s CRUD) and refuses `--password`/`--password-hash` **by name**.

✅ **THE OWNER THIS CREATES LOGS IN. THIS IS THE ONLY ACCOUNT PATH — do not also set
`BOOTSTRAP_OWNER_*`.** ⚠ *This paragraph said the opposite until 2026-08-24 — "THE OWNER THIS
CREATES CANNOT LOG IN YET, AND §5 IS STILL THE PATH THAT WORKS", followed by an instruction to mint
an Argon2id hash and pass three `BOOTSTRAP_OWNER_*` variables. **Following it now stops the API
booting**, so it was not merely stale.* `createPostgresUserStore` landed
(`services/api/src/server.ts:336`); with `DATABASE_URL` set, `services/api` reads `kernel.users` on
every request (`01-F27` re-reads the subject per call, so it is `findById` on the hot path, not a
login-time snapshot). `BOOTSTRAP_OWNER_EMAIL`, `_PASSWORD_HASH`, `_NAME` and `BOOTSTRAP_ORG_ID` are
the *in-memory dev seed*, and `resolveUserStore` refuses to choose between two answers to "who may
sign in": both configured is a named crash at boot. Old §5a — minting a hash by hand — is deleted,
not moved.

**Write the password down when it prints.** Nothing stores the plaintext (`15-F26` forbids the
vendor holding a restaurant's password) and there is no reset flow, so a lost initial password today
means `create-owner` for a second owner — which is **refused** (`15-F26` creates the first; the rest
are `14-F14`'s CRUD, which is owed). That is a real corner and it is named here rather than met at a
login screen.

⚠ **NONE OF THESE COMMANDS WRITES AN EVENT**, though `15-F4` says provisioning emits the org's first
`config.changed` and `15-F3` audits every staff action with an actor. A command on a service host
has no authenticated user, so the actor could only ever be `null`, permanently, in an append-only
store (`01-F1`) — the same reason `revoke-device` writes none. **A tenant created here has no ledger
record and no attribution.** That is owed to `15-F1`'s platform-admin console.

---

## 3. Secrets — generate them, never commit them

Three, all ≥ 32 bytes because `18 §5` puts a floor on each (`openssl rand -hex 24` gives 48 chars):

```sh
export DEVICE_TOKEN_SECRET=$(openssl rand -hex 24)   # HS256 device tokens (01-F47)
export PUBLISH_TOKEN=$(openssl rand -hex 24)         # the /internal publish credential
export SESSION_SECRET=$(openssl rand -hex 24)        # the API's session signing key
```

`PUBLISH_TOKEN` is one shared secret with **two names**: the gateway reads it as `PUBLISH_TOKEN`,
the API sends it as `SYNC_GATEWAY_TOKEN`. A mismatch is a `401` on every publish.

---

## 4. `services/sync-gateway` — the cloud sync end

```sh
DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos' \
DEVICE_TOKEN_SECRET="$DEVICE_TOKEN_SECRET" \
PUBLISH_TOKEN="$PUBLISH_TOKEN" \
PORT=8080 \
pnpm -C services/sync-gateway start          # `dev` to watch
```

**Healthy** — four lines, plus Fastify's own pino JSON beside them:

```
@restos/sync-gateway listening on http://127.0.0.1:8080
@restos/sync-gateway database postgres://postgres:*****@127.0.0.1:5432/restos (opened lazily …)
@restos/sync-gateway publish surface enabled (PUBLISH_TOKEN configured)
@restos/sync-gateway schema up to date — all 13 migrations applied
```

⚠ **The first line reads `127.0.0.1`, not `0.0.0.0` — this doc said `0.0.0.0` and that string is
never printed.** The process really does bind `0.0.0.0` (`server.ts:235`, `host: "0.0.0.0"`), and
Fastify resolves a wildcard bind to the interface addresses before returning; the console line
carries the loopback one, and the pino lines beside it carry every other interface
(`http://172.17.0.1:8080` and friends). Measured 2026-08-24 on a real start. It matters because the
literal is what an operator greps for, and a grep that finds nothing looks exactly like a service
that did not start.

**Read the fourth line too.** `schema NOT MIGRATED — …` means you skipped §2; the gateway is up and
every request that needs a table will answer `500`. It arrives a moment after the other three
(it is a database round trip, deliberately not awaited, so an unreachable database can never delay
or block the boot) and reads `schema could not be checked — the database did not answer (…)` when
Postgres is not running at all.

**Read the third line.** `publish surface DISABLED — no PUBLISH_TOKEN …` means every `/internal`
route answers `503` (fail-closed, deliberate) and the API will fail to publish with a message about
a key set on the wrong process.

Smoke it:

```sh
curl -s "http://127.0.0.1:8080/internal/catalog/published?org_id=$ORG_ID" \
  -H "Authorization: Bearer $PUBLISH_TOKEN"
# {"version":0,"entries":[]}
```

`{"error":"catalog published: the sync gateway could not read from its database (… connect
ECONNREFUSED …)"}` means Postgres is down or `DATABASE_URL` is wrong — that sentence names the
dependency on purpose, so it can be acted on three services away.

---

## 5. `services/api` — the cloud plane, and `apps/backoffice`

### 5a. *(deleted — there is no hash to mint)*

⚠ **This step used to say: run `hashPin` from `services/api`, take the `$argon2id$…` PHC string, and
paste it into `BOOTSTRAP_OWNER_PASSWORD_HASH`. It is deleted rather than corrected, because
following it now produces a boot crash** (see 5b) **and because §2b already minted the password.**
The Argon2id story has not changed and is not weakened — `create-owner` hashes with the same
`packages/domain` call at the same `01-F61` cost floor, and `services/api` compares with the same
`verifyPin`. What changed is only *who* runs it: the command that writes the row, once, instead of
an operator with a shell.

### 5b. Start the API

**`DATABASE_URL` is what makes the API read §2b's owner.** It is the same DSN §2 migrated.

```sh
SESSION_SECRET="$SESSION_SECRET" \
DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos' \
ENABLED_BRANCHES="$BRANCH_ID" \
ENABLED_CHANNELS=counter,storefront \
SYNC_GATEWAY_URL=http://127.0.0.1:8080 \
SYNC_GATEWAY_TOKEN="$PUBLISH_TOKEN" \
PORT=3001 \
pnpm -C services/api start
```

⚠ **THERE IS NO `BOOTSTRAP_ORG_ID` HERE AND THERE MUST NOT BE.** `DATABASE_URL` and **any one** of
`BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD_HASH` / `BOOTSTRAP_OWNER_NAME` /
`BOOTSTRAP_ORG_ID` is a refusal at boot — the process exits **1** before binding a port, naming both
halves. Measured 2026-08-24 with `BOOTSTRAP_ORG_ID` alone and nothing else from the seed:

```
Error: DATABASE_URL is set AND BOOTSTRAP_ORG_ID is set. These are two answers to one question —
who may sign in — and this service will not choose between them (15-F26/15-F27). …
UNSET the BOOTSTRAP_OWNER_* variables (all of them, including BOOTSTRAP_OWNER_NAME) and create the
owner with that command. If you meant the development seed instead, unset DATABASE_URL.
```

**Healthy — TWO lines** (this said *"exactly one line"*), Fastify's logger stays off:

```
@restos/api listening on http://127.0.0.1:3001
@restos/api accounts: kernel.users at postgres://postgres:*****@127.0.0.1:5432/restos (persistent; accounts are created by `pnpm -C services/sync-gateway create-owner` — 15-F26/15-F27)
```

**Read the second line — it is the only way to tell three deployments apart from outside the
process**, and before it existed they printed identically:

| the accounts line says | it means |
|---|---|
| `kernel.users at postgres://…` | what you want. Accounts are rows and survive a restart |
| `BOOTSTRAP_OWNER_* development seed — ONE owner, IN MEMORY, and it DIES WITH THIS PROCESS` | `DATABASE_URL` did not reach the process. §2b's owner cannot sign in and every account is gone at the next restart |
| `NONE — no DATABASE_URL and no BOOTSTRAP_OWNER_*, so nobody can log in` | neither is set. Fail-closed and correct — never a default credential — and it means you skipped `DATABASE_URL` |

⚠ **The first line reads `127.0.0.1`, not `0.0.0.0`** — same measurement and same reason as §4.

Failure modes worth naming:

| you see | it means |
|---|---|
| `SYNC_GATEWAY_URL: required (the sync gateway's base URL …)` and the process exits | deliberate. An optional publisher falling back to the in-memory stub is a deployment that boots, serves, logs in, and ships no menu — see `services/api/CLAUDE.md`'s G1 mutant |
| `EADDRINUSE … 3001` | something else holds it (another agent's API). Any port works; `RESTOS_API_URL` in 5c must follow |
| `DATABASE_URL is set AND … is set` and the process exits | the §5a leftovers. Unset **all four** `BOOTSTRAP_*` keys, `BOOTSTRAP_ORG_ID` included |
| login returns `UNAUTHORIZED` with the password §2b printed | check the accounts line first. If it names `kernel.users`, the password or the email is wrong; if it names the dev seed or `NONE`, the API is not reading §2b's table at all |
| login returns a 503 naming the **user directory** | Postgres is down or the DSN is wrong. The connection is lazy, so a bad DSN is not a boot crash — it is a named failure on the first login, and deliberately never an `UNAUTHORIZED` |
| every save refused, naming an unpriced pair | `ENABLED_*` disagrees with what you priced. An absent enabled set refuses **every** save |

Check it over HTTP before opening a browser — note the **superjson envelope**, `{"json":{…}}`;
without it you get a Zod *"expected object, received undefined"*:

```sh
curl -s -X POST http://127.0.0.1:3001/trpc/auth.login -H 'content-type: application/json' \
  -d '{"json":{"email":"owner@example.test","password":"<the password §2b printed>"}}'
# {"result":{"data":{"json":{"token":"eyJ…"}}}}
```

### 5c. Start the back office

```sh
RESTOS_API_URL=http://127.0.0.1:3001 \
PORT=3000 \
pnpm -C apps/backoffice dev                  # http://localhost:3000
```

**Healthy:** `▲ Next.js 16.3.0 (webpack)` … `✓ Ready in <1s`.

⚠ **OPEN IT AS `http://localhost:3000`, NEVER AS `http://127.0.0.1:3000` — the two are not
interchangeable here and the wrong one hangs SILENTLY.** Measured August 2026 by A/B with a warm
dev server, one variable changed: at `localhost` the app signs in normally; at `127.0.0.1` it
renders `Loading…` **for ever** (90 s and counting), with no console error, no failed request, and
**no `/api/trpc/…` line in the dev server's own log** — the `session.whoami` the `AuthGate` blocks
on never leaves the browser. The only diagnostic anywhere in the system is one line in the
`next dev` output, and it names a *different* URL so it reads as noise:

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1".
   … add it to "allowedDevOrigins" in next.config.js and restart the dev server
```

**What is proven is the A/B and the symptom; that Next's cross-origin dev-resource block is the
mechanism is the best available reading and is not proven here.** Either way the fix that was
measured is to type `localhost`. `RESTOS_API_URL=http://127.0.0.1:3001` above is unaffected —
that is a server-to-server URL and never an origin a browser sees.

✅ **The enabled set is declared ONCE now** — on the API, at step **5b** (⚠ *this said 5a, which is
now deleted*). `catalog.enabled` (August 2026) serves it, and the back office draws `14-F29`'s grid
from that answer with **no fallback**: if the query fails the screen says so and draws no editor
rather than guessing. `lib/env.ts` and its two `NEXT_PUBLIC_ENABLED_*` variables are deleted, so
there is nothing left here to keep in step with.

**Both of this runbook's silent-failure modes have now moved, and only one of them is gone.** The
`ENABLED_*` drift between API and back office is closed by the above; the `BOOTSTRAP_ORG_ID` half is
closed by *deletion* — that variable is no longer part of the join at all (§0, §5b). ⚠ **What
survives is the end nothing ever checked**: `ENABLED_BRANCHES` against the DEVICE's `branch_id`. The
API and the back office agreeing with each other is a different claim from either agreeing with the
till, and no process compares them — see §0.

---

## 6. `apps/pos-electron` — the till

### 6a. The native addon — TEST BEFORE YOU BUILD

⚠ **DO NOT run `rebuild:native` reflexively. Ask first whether it is already done** — this step
said *"ONCE per checkout"* with no test, and on a tree where the Electron build already exists the
command is pure damage: it rewrites `build/Release/` for **every** process sharing the tree,
including other people's test runs.

`better-sqlite3` is native, and the two hosts need two different builds of it:

| who loads it | from | ABI |
|---|---|---|
| `pnpm test`, every `node -e`, every suite that opens a store | `build/Release/better_sqlite3.node` | Node's — **127** on Node 22 |
| the Electron app (`main/index.ts`'s `electronAddonPath`) | `bin/<platform>-<arch>-<abi>/better-sqlite3.node` | Electron 43's — **148** |

**The test — run it before the command.** If it prints a path, both builds are present and there is
nothing to do:

```sh
# from the REPO ROOT — node_modules/.pnpm is workspace-global, not app-local
ls -d node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/bin/$(node -p 'process.platform+"-"+process.arch')-*
# …/bin/linux-x64-148        ⇒ the Electron build exists. SKIP the rebuild.
# No such file or directory  ⇒ run it.
```

Only if that comes back empty:

```sh
pnpm -C apps/pos-electron rebuild:native     # ~64 s
```

⚠ **`rebuild:native` still clobbers `build/Release/`** — measured again on this run, so the
mitigation in `apps/pos-electron/CLAUDE.md` is not complete. It correctly writes the Electron copy
to `bin/<platform>-<arch>-148/`, **and** it overwrites the Node copy the whole test suite loads.
Every suite that opens a store then dies with `NODE_MODULE_VERSION 148 … requires 127`. Restore
Node's copy — the Electron one in `bin/` survives, so the app keeps working:

```sh
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release && cd -
```

Do this **before** any `pnpm test`, and verify with `pnpm test --force` (a cached turbo run reports
green off results computed before the rebuild). ⚠ **`node_modules/.pnpm/` is workspace-global**, so
on a shared tree the window between clobber and restore reddens every other agent's suite with an
error that reads like a broken merge. Prefer skipping the rebuild to racing the restore.

Both builds can be checked directly, which is the only evidence that beats a guess:

```sh
# from apps/pos-electron — under pnpm's strict layout the repo root cannot resolve better-sqlite3
node -e 'const p=require.resolve("better-sqlite3/package.json").replace(/package.json$/,"");
for (const f of ["build/Release/better_sqlite3.node",
                 `bin/${process.platform}-${process.arch}-148/better-sqlite3.node`])
  try { process.dlopen({exports:{}}, p+f); console.log("loads under node:", f) }
  catch (e) { console.log((/NODE_MODULE_VERSION/.test(e.message) ? "wrong ABI for node (expected — this is the Electron copy): " : "missing: ")+f) }'
```

### 6b. Provision the device — ONE DECLARED COMMAND (August 2026)

The gateway needs **both** halves of admission: an HS256 token signed with `DEVICE_TOKEN_SECRET`,
**and** an unrevoked, branch-matching row in `kernel.device_registry`. The registry has the veto, so
a valid token alone opens nothing. One command now does both:

```sh
export RESTOS_DEVICE_TOKEN=$(
  DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos' \
  DEVICE_TOKEN_SECRET="$DEVICE_TOKEN_SECRET" \
  pnpm -C services/sync-gateway provision-device \
    --org "$ORG_ID" --branch "$BRANCH_ID" --device "$DEVICE_ID" --class counter_electron \
    --name "Counter till" \
  | tail -1)
```

⚠ **`--name` is REQUIRED as of August 2026 and the command refuses without it** (`01-F70`,
`15-F27`): a device that may be named later never is, and the operator reading `14-F12`'s device
list is by construction not standing in front of the till. It is a LABEL — `device_id` remains the
sole key for admission, fan-out and `01-F64`'s store binding — and `--reissue` will **refuse** a
different one rather than rename (a rename is `device.manage`, `14-F30`, from the back office).

**The token is the only thing on stdout; every readable line goes to stderr**, so `$( … )` captures
a credential and not a paragraph. (`| tail -1` is still needed because the package manager prints
its own banner ahead of the script.) You will see, on stderr:

```
@restos/sync-gateway provision-device registered "Counter till" (…0003) · org …0001 · branch …0002 · class counter_electron · postgres://postgres:*****@127.0.0.1:5432/restos
@restos/sync-gateway provision-device token expires 2026-11-06T15:41:55.015Z (01-F47, 90 days). Binding: iss=(unbound) aud=(unbound) — these must match the gateway that will verify it.
@restos/sync-gateway provision-device the next line on STDOUT is the device token. It is a credential: do not log it.
```

| you see | it means |
|---|---|
| `is already registered … pass --reissue` | you ran it twice. Registering a device twice is a provisioning error — re-registration mints a FRESH `device_id` (`01-N5`). To hand the *same* registered device a new credential (you lost the token, the shell died), add `--reissue` |
| `is REVOKED … Provisioning never un-revokes` | working as designed, in **both** modes. This step used to be an `INSERT … on conflict do update set revoked_at = null`, which resurrected a revoked till; `01-F25`/`01-F48` make revocation the operative kill switch |
| `"espresso_machine" is not a DEVICE_CLASSES member (01-F39)` | `device_class` must be a `01-F39` identifier, and for a counter terminal one of the hub-eligible three: `counter_electron`, `counter_rn`, `kitchen` |
| `must be at least 32 bytes` | `DEVICE_TOKEN_SECRET` floor (`18 §5`) — the command mints with the same key the server verifies with, so the floor is enforced on both sides |

⚠ **If the gateway is started with `DEVICE_TOKEN_ISSUER` / `DEVICE_TOKEN_AUDIENCE` set, export the
same two here.** `01-F47` binds a token to its deployment and `verifyDeviceToken` enforces each only
where configured, so a token minted unbound against a bound gateway is a perfectly-signed credential
that opens nothing. The command reads both env keys for exactly this reason, and prints what it
used on the second line. §4 above leaves them unset, so `(unbound)` is correct for this run.

**What this does NOT close, and it is why §0 still exists:** it admits a device whose identity you
already know. `01-F25`'s one-time **pairing code from the back office** — the thing that would let
an owner add a till without touching the service host — is owed, as is the host-app warning below
25% remaining life.

⚠ *This paragraph also listed "device-side persistence of `01-F47`'s silent renewal" as owed, and
that is FALSE (re-measured 2026-08-24).* `packages/sync-client/src/cloud-session.ts:309` is
`persistRenewal`, which writes `store.setDeviceToken(renewed)`; `:727` and `:761` call it on every
`renewed_token`; and `sendHello` at `:329` prefers *"the PERSISTED renewal if the cloud has ever
issued one, else the token this session was constructed with"*. So the renewal **is** stored, and it
is stored in `sync-client`, which is exactly where the FR puts it. The practical consequence for
this runbook: `RESTOS_DEVICE_TOKEN` is a **bootstrap** value — it goes stale in the env file and
that is fine, and re-running `provision-device --reissue` to "refresh" it is not a maintenance step.

### 6c. Run the till

```sh
RESTOS_CLOUD_URL=ws://127.0.0.1:8080/sync \
RESTOS_DEVICE_TOKEN="$RESTOS_DEVICE_TOKEN" \
RESTOS_DEV_PIN=4821 \
RESTOS_DEV_PIN_BILAL=5137 \
RESTOS_DEV_PIN_HINA=9064 \
pnpm -C apps/pos-electron start
```

⚠ **All three keys, three different numbers.** One key per roster member since August 2026, with
no fallback between them (`01-F28`) — `RESTOS_DEV_PIN` on its own seeds **Ayesha alone**, and she
is a cashier, so `02-F22` leaves the day unopenable and no sale can be recorded.

`pnpm start` is `electron-vite build && electron out/main/index.js`. Running those two apart lets
you pass Electron's own switches, which is what this run did and what makes the store findable and
the teardown a `rm -rf`:

```sh
cd apps/pos-electron
pnpm exec electron-vite build
RESTOS_CLOUD_URL=ws://127.0.0.1:8080/sync \
RESTOS_DEVICE_TOKEN="$RESTOS_DEVICE_TOKEN" \
RESTOS_DEV_PIN=4821 \
RESTOS_DEV_PIN_BILAL=5137 \
RESTOS_DEV_PIN_HINA=9064 \
  pnpm exec electron out/main/index.js --user-data-dir=/tmp/restos-till
cd -
```

**No `RESTOS_DEV_MENU`.** That flag seeds a local dev menu and is precisely what the published one
replaces; leaving it off is how you find out whether the transport works.

**Healthy — two lines, and both are measurements:**

```
panel: 224.8 PPI (assumed) — the OS reported no physical size and 00 §7's panel_ppi is unset, so
27 §1a's 15.6" counter panel is ASSUMED. Every 27-F8 target on this device is sized from that
guess; set RESTOS_PANEL_PPI to correct it.
@restos/pos catalog v1 — 1 tile(s), 0 unsellable
```

**The panel line is new (`DEC-UI-001` / `27-F68`, August 2026) and on a Mac it will always say
`(assumed)`.** A dp is 1/160 inch of *physical* size now, converted through the panel's own
density, and `main/panel-density.ts` resolves that in `00 §7`'s order — **measurement, then
correction, then an honest admission**. Electron gives resolution and no physical size, so the
inches come from the platform: WMI on Windows (the ship target), `xrandr` on Linux, and **nothing
on macOS**. So a dev Mac genuinely is a panel that "reports nothing", and `(assumed)` is the truth
rather than a warning to silence. It is worth reading because being wrong here **looks exactly like
being right**: every touch target renders at the wrong physical size and nothing on screen looks
broken. `RESTOS_PANEL_PPI=<number>` is the correction (`00 §7` layer 3 — per device, because one
org runs many different panels); a value outside a wide sanity band is refused and falls back to
the measurement rather than stopping the till (`01-F17`).

| the line says | it means |
|---|---|
| `v0 — 0 tile(s), 0 unsellable` at first launch | correct and expected. The line prints at boot, **before** the socket connects; the catalog arrives a second or two later and the line is not reprinted. Relaunch to see the real number, or read the store (below) |
| `vN — n tile(s), 0 unsellable` | the menu arrived **with prices**. This is the healthy end state |
| `vN — n tile(s), n unsellable` | tiles arrived and prices did not — the item resolves no price for **this** branch on `counter`. Either `ENABLED_BRANCHES` is not this device's `branch_id`, or you are on a build before the `catalog-fetch` fix (§7) |
| `v0 — 0 tile(s)` and it stays there | the till is not talking to the gateway, or it is a different org. Check the gateway log for a `GET /sync`. **The org to compare against is the one `create-org` printed in §2b** — the org the OWNER belongs to — not `BOOTSTRAP_ORG_ID`, which must be unset on this path (§0) |

The store is the ground truth, and reading it is how you tell "the catalog never arrived" from "the
line was printed before it did":

⚠ **There is no `sqlite3` CLI on a stock Ubuntu box and this snippet used to assume one** — the
command simply is not found, which reads as "the store is missing" if you are not paying attention.
Read the store through the `better-sqlite3` copy already in `node_modules` instead:

```sh
# WITH --user-data-dir=/tmp/restos-till above:
STORE=/tmp/restos-till/device.db
# WITHOUT it (plain `pnpm -C apps/pos-electron start`):
# STORE=~/.config/'RestOS Counter'/device.db
node -e '
const D = require("better-sqlite3");
const db = new D(process.argv[1], { readonly: true });
console.log("catalog version", db.prepare("select version from catalog_state").get());
console.log("events", db.prepare("select count(*) c from events").get().c);
for (const r of db.prepare("select json from catalog limit 3").all()) console.log(r.json);
' "$STORE"
# {"kind":"item","id":"chicken-biryani","name":"Chicken Biryani","kitchen_name":"Biryani",
#  "prices":[{"branch_id":"…0002","channel":"counter","price_paisa":45000}, …]}
```

Run it from a directory that can resolve `better-sqlite3` (`apps/pos-electron` declares it; under
pnpm's strict layout the repo root cannot), or give `require` an absolute path to it as
`ops/sqlite-backup.mjs` does.

⚠ **Read it WITH its `-wal`, or copy all three files.** The store is WAL with `synchronous = FULL`
and the app never closes it, so the main file alone can be arbitrarily stale — measured on two real
stores, one showed **no tables at all** and the other a full schema with **`events` = 0**.

**Where the store is.** The path is `join(app.getPath("userData"), "device.db")`
(`main/index.ts:646`), and `userData` has **two** answers — which is the whole of the correction
below. Each Electron host calls `app.setName` (`01-F64`), so with no flag, on Linux:

| app | store, with NO `--user-data-dir` |
|---|---|
| `apps/pos-electron` | `~/.config/RestOS Counter/device.db` (+ `print-spool.db`) |
| `apps/pass-kds` | `~/.config/RestOS Pass/device.db` |

On Windows the same names sit under `%APPDATA%`.

⚠ **`--user-data-dir=DIR` MAKES `userData` *`DIR` ITSELF* — there is no app-name subdirectory
under it, and this section told you to read one.** Measured 2026-08-24 by calling
`app.getPath("userData")` in a real Electron process, with `app.setName("RestOS Counter")` set, both
ways:

```
--user-data-dir=/tmp/restos-till   ⇒  /tmp/restos-till
(no flag)                          ⇒  /home/<user>/.config/RestOS Counter
```

So the two-step launch this section RECOMMENDS puts the store at **`/tmp/restos-till/device.db`**,
while the read-the-store snippet above was hard-coded to `~/.config/RestOS Counter/device.db`. On a
machine that has only ever run the till that way, that directory does not exist and the read fails
with a sentence that reads like a missing store rather than a wrong path:

```
Cannot open database because the directory does not exist
```

**That message is about the DIRECTORY, not the database**, and it is the signal that you are
looking in the other place. `--user-data-dir` also relocates `print-spool.db` and Chromium's own
state, which is what makes §9's `rm -rf` a complete teardown.

Before August 2026 **both** apps resolved to `~/.config/Electron/device.db` — one file, two
`device_id`s — so a machine that ran either app before the rename still has that directory, and
**nothing migrates it and nothing points at it**. See `ops/README.md`'s upgrade note.

Sign in with any of the seeded staff — **Ayesha** (`RESTOS_DEV_PIN`), **Bilal**
(`RESTOS_DEV_PIN_BILAL`), both cashiers, or **Hina** (`RESTOS_DEV_PIN_HINA`, branch manager). ⚠
*This said "with the PIN you passed as `RESTOS_DEV_PIN`" and that stopped being true in August
2026:* there is one key per member and **no fallback between them**, so `RESTOS_DEV_PIN` alone
seeds Ayesha and nobody else. Only Hina can open the day (`02-F22`) — so a run with only the one
key set can neither open a day nor record a sale, and the boot line says so.

### 6d. Switch a device OFF — the stolen-tablet path (`01-F25`/`01-F48`)

The other half of §6b, and the one you run under pressure. It needs `DATABASE_URL` and **nothing
else** — no `DEVICE_TOKEN_SECRET`, because revoking mints nothing:

```sh
DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos' \
pnpm -C services/sync-gateway revoke-device --org "$ORG_ID" --device "$DEVICE_ID"
```

Everything is on **stdout** here (unlike §6b, where stdout is the credential):

```
@restos/sync-gateway revoke-device REVOKED …0003 · org …0001 · branch …0002 · class counter_electron · postgres://postgres:*****@127.0.0.1:5432/restos
@restos/sync-gateway revoke-device revoked_at 2026-08-08T17:15:14.798Z (01-F25/01-F48). This is NOT reversible here and nothing un-revokes: register the replacement under a FRESH device_id (01-N5).
@restos/sync-gateway revoke-device a RUNNING gateway drops this device's live sessions within 10s (01-F48) and refuses its next hello with a purge_command (01-F42). Where no gateway is running, nothing is evicted until one starts.
```

**Read the second line before you walk away** — the branch and class are read from the registry, not
echoed back from your arguments, so they are what catches a typo that happened to land on a real
device.

| you see | it means |
|---|---|
| `is NOT REGISTERED in org … — nothing was revoked` | a typo in `--org` or `--device`. **The device you meant is still live.** This is a refusal on purpose: the underlying `UPDATE … WHERE` matches no rows and reports no error, which is how an operator walks away believing a stolen till is dead |
| `device was ALREADY revoked … this run changed nothing` | exit **0** — the state you wanted holds, and re-running is safe. The instant printed is the *original* one. If you did not revoke it, somebody else did |
| `Unknown option '--restore'` | there is no un-revoke, by design and not by omission. The corpus specifies no reinstatement anywhere; `01-N5`'s replacement path is a **fresh `device_id`**, and `provision-device` refuses a revoked row in both its modes |

**What a revoked device experiences, straight from `01-F48`:** eviction *"within 30 s where any path
(cloud or LAN) reaches it, rather than only at its next voluntary contact"* — the cloud drops **live
sessions**, not just future ones. Concretely: a running gateway sweeps every
`REVOCATION_SWEEP_INTERVAL_MS` (10 s) and tears the socket down; any operation on a session not yet
swept is refused per-operation; the next `hello` is refused and carries `01-F42`'s `purge_command`.
**With no gateway process running, nothing is evicted until one starts** — the command says so.

**What this does NOT close:** `14-F13`'s back-office flow — the device list with revoked state and
**actor**, reachable from an owner's phone (`14-N2`). This command emits **no `device.revoked`
event**, so a revocation leaves no ledger record and no attribution: a shell on the service host has
no authenticated user, and `packages/domain`'s `PERMISSION_ACTIONS` declares no device action for
commandment 8 to authorize against. Both are owed together.

### 6e. Attach a printer — the section to follow with the printer in your hands (K-8)

**Nothing in this product has ever printed on a print head.** Everything below has been driven
against a `node:net` listener on loopback and against a regular file. The link is tested; the
*other end of the cable* is not, and that is the last open item on the pilot
(`plans/v0.md` gap 4). Budget real time for the first one.

#### The three variables, and they are not interchangeable

| variable | what it names | unset ⇒ |
|---|---|---|
| **`RESTOS_PRINTER`** | the **CABLE** — where bytes go | no link. Every document exhausts `03-F4`'s retry budget and raises `03-F5`'s band |
| **`RESTOS_KOT_PRINTER`** | the **MODEL** — what the paper can hold | a conservative **32**-column record, which **refuses the KOT, the shift-close slip and the day summary before a byte is sent** |
| **`RESTOS_PRINT_TO_FILE`** | a **diagnostic** directory of PDFs | nothing, which is the correct setting for service — see §4 below |

⚠ **`RESTOS_KOT_PRINTER` appeared nowhere in this runbook until 2026-08-24, and it is the one that
fails quietly.** A till with `RESTOS_PRINTER` set and `RESTOS_KOT_PRINTER` unset **prints
receipts** — so the customer's copy comes out, the cashier sees a working printer, and the kitchen
gets nothing, every ticket, all service. Set both or neither.

A fourth variable decides whether a KOT is *created* at all, and it is **not** a printer setting —
`RESTOS_STATION_ROUTES`, which this runbook's §6c launch does not set and which
`ops/env/counter.env.example` documents in full. `<station>=paper|screen|both`, comma-separated,
with `*` setting the default; the shipped default is `paper`, and a malformed entry refuses the
WHOLE setting and falls back to `paper`, naming the offending entries on the boot line.

⚠ **It routes KITCHEN STATIONS ONLY, and `*=screen` does not make a printerless till quiet.**
Receipts and cash slips are not station-routed at all — `routesToPaper` is passed to
`createKotPrinter` and to neither the receipt nor the cash printer — so on a till with no
`RESTOS_PRINTER`, every settlement still enqueues a receipt, burns three attempts and raises the
band. A station routed `screen` also requires `apps/pass-kds` to be RUNNING and somebody looking at
it: a station routed to a screen nobody watches loses its tickets in **silence**, which is the one
failure mode quieter than the band.

#### 1. The cable — `RESTOS_PRINTER`

Three forms, one per kind of cable (`03-F1`, `18 §10`; the syntax is
`apps/pos-electron/src/main/printer-link.ts`'s declared reading, since `18 §10` names the transports
and no syntax for choosing one):

```sh
RESTOS_PRINTER=tcp://192.168.1.50:9100    # network printer. Port optional, defaults to 9100
RESTOS_PRINTER=windows://KOT              # USB on a WINDOWS till — a share on THIS machine
RESTOS_PRINTER=device:///dev/usb/lp0      # USB on a LINUX till — three slashes, absolute path
```

⚠ **PREFER `tcp://`. IT IS THE ONLY FORM THAT CAN SEE THE PAPER RUN OUT.** After every document
`tcp://` writes `DLE EOT 4` and reads the answer (`03-F40`), so a paper-out **holds** the job until
the roll is replaced (`03-F41`). The two USB forms are **write-only**: a character device and a
Windows print share both take the bytes and say nothing back, and reading the back-channel needs an
ioctl or a spooler API this product has no dependency for. **On those two forms a paper-out reads as
a printed ticket** — the chit is lost, the job is marked `printed` in the durable spool, and no band
is ever raised. If the printer has an Ethernet port, use it.

Per-form notes that cost time:

- **`windows://`** — the printer must first be installed **and shared** on that machine (Printer
  properties → Sharing), and the value is the **share name**. A short name, no spaces. A share on
  *another* PC is refused by name. **Unverified: no Windows host exists in this repo or in CI.**
- **`device://`** — three slashes (`device:///dev/usb/lp0`). `device://lp0` parses as a *host* and
  is refused rather than resolved against the working directory, deliberately: a till that quietly
  created a file called `lp0` beside its binary and reported `ok` is worse than one that does not
  print. The account running RestOS must be in the `lp` group or every ticket fails `EACCES`.
- **A value this till cannot read is REFUSED WHOLE**, never guessed, and the till starts with no
  printer at all (`03-F51`; `01-F17` — a typo in a setting may not stop a till). The boot line names
  what was rejected and why, and it is the only place a printer refusal is reported, because doc 14
  owes a printer setting and does not have one. **Read the boot line after every change.**

#### 2. The model — `RESTOS_KOT_PRINTER`

The column width a document is laid out against (`03 §7` layer 3). It is the **model**, not the
cable. Four are known; anything else keeps its id and takes `03 §7`'s conservative unknown record
(32 Font-A columns, no cutter, no native QR):

| `RESTOS_KOT_PRINTER` | Font-A columns | dots | cutter |
|---|---|---|---|
| `TM-T20II` | 48 | 576 | yes |
| `TH230` | 44 | 576 | yes |
| `TM-P80` | 42 | 576 | yes |
| `BC-58U` (58 mm, `03-F10`'s baseline) | 32 | 384 | no |
| *anything unrecognised, or unset* | **32** | 384 | no |

`03-F49` gives each document type its own floor and a printer under it is **refused at render, not
squeezed** — a hard refusal plus an S1 band naming both column counts (`03-F34`). Measured
2026-08-24 through the shipping `printerCapability` and `checkColumns`:

| `RESTOS_KOT_PRINTER` | KOT (42) | receipt (32) | bill (32) | shift close (35) | day summary (34) |
|---|---|---|---|---|---|
| **unset**, or blank, or unknown | **REFUSED** | prints | prints | **REFUSED** | **REFUSED** |
| `BC-58U` — 58 mm paper | **REFUSED** | prints | prints | **REFUSED** | **REFUSED** |
| `TM-P80` / `TH230` / `TM-T20II` | prints | prints | prints | prints | prints |

Two things follow, and both are about buying rather than configuring:

- **The unset row and the `BC-58U` row are identical.** So "the kitchen prints nothing" does not
  distinguish a forgotten variable from 58 mm paper — 58 mm genuinely cannot carry a KOT
  (`03-F49`: `27-F57` puts the quantity immediately left of the item name and wrapping that line
  spends the property the ticket exists to deliver). **Buy 80 mm for the kitchen.**
- **`RESTOS_KOT_PRINTER` is NOT irrelevant under `*=screen`.** Station routing suppresses KOTs and
  nothing else, so on a screen-kitchen till the shift-close slip and the day summary are still
  refused at render, every night, until a real model is set.

⚠ **A blank value is not an unset one, and the difference used to be severe.** `RESTOS_KOT_PRINTER=`
— an operator clearing the key, or a `.bat` writing `set RESTOS_KOT_PRINTER=%PRINTER%` with
`%PRINTER%` unset — is *present*, so the default is skipped. It is trimmed and re-defaulted now
(`main/index.ts`, `kotCapability`), so a blank and a padded value both land on the named unknown
model rather than on an unnamed one.

#### 3. What you see when it is not working

With **no `RESTOS_PRINTER`**, every station routed to paper takes the same path: three transmit
attempts about **10 s apart** (`PUMP_INTERVAL_MS` = `RETRY_WINDOW_MS / MAX_TRANSMIT_ATTEMPTS` =
30 s / 3), the first fired immediately, so the budget is spent about **20 s** after the confirm and
`03-F5`'s band appears then — inside the FR's **45 s** bound, which is what the code is written
against. **That band is the honest signal that nothing is attached** (`00 §5.7`) and it must never
be silenced.

⚠ **THE LEDGER RECORDS THE KITCHEN'S FAILURE AND NOT THE CASHIER'S. Measured, and it changes what
you can find out afterwards:**

| the document that failed | what is appended to the ledger |
|---|---|
| **KOT** | `kot.print_failed` — `order_id` + `printer_name` (`registry.ts:459`, emitted at `printing.ts:866` and `:959`) |
| **shift-close slip**, **day summary**, **receipt** | **nothing about the document.** `01 §4` carries no `slip.print_failed`; `receipt.printed` is in the `01 §4` catalog but has **no payload schema**, so `01-F4` makes emitting it a runtime error |

The one thing that *is* written for the others is `printer.status_changed(offline)` — a fact about
the **printer**, appended once on the transition, not once per document (`03-F54`). So the shape of
the evidence is: a missing kitchen ticket is countable for ever; **a missing shift slip is not, and
the only trace it ever leaves is a band on the glass that a cashier clears by hand** — and if
another alarm is already up, it collapses into `· and N more` (`AlarmBand.tsx:98`) and is gone.
**Do not invent an event type to fix this.** Commandment 2; it is an owed gap in `01 §4`, and the
operational consequence is that *"was the slip printed last night?"* is answerable only by asking
the manager.

#### 4. Looking at a document without hardware — and what it does not prove

```sh
RESTOS_PRINT_TO_FILE=/tmp/restos-docs pnpm -C apps/pos-electron start
```

One PDF per document, one page per **cut** (`03-F42`), named `<sequence>-<digest>.pdf` — no clock,
so two identical documents are visibly identical in a directory listing, which is how a duplicate
KOT shows up.

⚠ **IT DOES NOT CLOSE K-8 AND IT IS NOT EVIDENCE ABOUT ANY PRINTER.** It renders what *our own
encoder* thinks the bytes mean, through the same `simulate()` the snapshot suite uses — a
misconception the encoder and the simulator **share** is invisible to it by construction, and
`03-F40`'s two incompatible sensor bit layouts is this corpus's own worked example of exactly that.
It says nothing about legibility (`27-F35`'s ≥85% comprehension gate on real staff is untouched),
nothing about where the cutter cuts, and **paper never runs out in it**, so `03-F41`'s hold is
unreachable through it.

⚠ **NEVER SET IT IN SERVICE.** It answers `ok` to everything, which removes the band that is the
only honest signal about real hardware. A real `RESTOS_PRINTER` wins over it if both are set
(`printerTransport`, a declared interpretation — the corpus rules on neither); a *refused*
`RESTOS_PRINTER` falls through to it, because `03-F51` makes a refused configuration simply
not applied.

#### 5. The first real printer — what to expect

Open questions no amount of reading closes, in the order they will bite:

1. Whether the cutter cuts where `simulate()` ends a page, and whether the feed lands where
   `ESC d n` says (`03-F10` rig questions).
2. Whether a real head answers `DLE EOT 4` with the bits `03-F40` describes — the FR records **two
   incompatible bit layouts** and only hardware separates them.
3. Whether a paper-out holds the job as `03-F41` models it, and whether the roll returning releases
   it without a duplicate.
4. **Whether a cook can read it.** `27-F35`'s ≥85% comprehension / ≤5% critical-confusion gate is a
   measurement on real staff after training, and it is owed in full.
5. A known open finding from the PDF simulator, recorded in `apps/pos-electron/CLAUDE.md` and **not
   a fix**: the KOT's quantity column is `size_2x2` (48 dots) while `simulate()` advances a line
   feed by the size in effect at the `LF` (24), so quantities overlap. Either a real head expands
   the line to its tallest glyph and the simulator is wrong, or it does not and the layout is.
   Nothing in the corpus rules; the first real ticket does. `DEC-HW-001` carries this as a rider on
   the K-8 rig.
6. **The paper itself is a purchasing question with a measurable answer** (`03-F45`). The
   international *80×80* convention **is not a SKU in Pakistan** and the market is essentially
   **48 GSM**; short rolls are live — one listing sells *"80 mm × 40 **Yards**"*, an 8.5% shortfall
   hidden in the unit. A **vernier caliper is a sufficient goods-inwards test**: at 0.80 packing on
   a 12 mm core a genuine roll measures ≈ 59 mm OD at 40 m, 65 at 50 m, 74 at 65 m. Buy on metres
   and GSM, and check on receipt.
7. ⚠ **A printer that STALLS on a missing roll says nothing today** (`03-F58`, measured against a
   TCP listener answering `DLE EOT 4` with `03-F40`'s bits set): the job reached `stalled` with
   `attempts: 0` — `03-F41` working exactly as written — and then `alarms()` was `[]` for the whole
   run, the glass said nothing, and the ledger carried nothing about the printer. **The counter's
   own control read `the kitchen has this order`, which is false — the PRINTER has it.** The
   surface `03-F58` specifies is OWED, so **on the first real printer, budget for someone walking
   into the kitchen to look at the roll.** Running out of paper is the most ordinary thing a
   thermal printer does.

**What the K-8 rig should actually measure**, because the corpus already names it and the numbers
are missing rather than disputed (`DEC-HW-001` sub-question 1, folded into K-8): print the `kot`
`example_data` **and** a 42-column worst case on real 48 GSM stock, Font A on 80 mm against a
`BC-58U`, and run `27-F35`'s post-training retest with real kitchen staff **at the distance a chit
is actually read — measured, not assumed.** The corpus states no viewing distance for paper at all
(`27-F11h`: it *"has no design language for thermal paper"*), so that one measurement is a figure
the corpus is missing and is worth recording whatever the verdict.

**Nothing in this section may be cited as evidence that printing works.** K-8 closes when paper
comes out of a head, and not before.

---

## 7. What is still seeded, faked, or owed

Stated plainly, because a runbook that oversells is worse than none.

**REAL, end to end, measured on this run:**

- The owner's login is real Argon2id against `01-F61`'s cost floor, and every procedure is gated by
  `domain`'s `can()` — Commandment 8, enforced on the cloud plane.
- The menu is real: authored in a browser, refused when an enabled `(branch, channel)` is unpriced
  (`01-F60`), published as an immutable versioned artifact into Postgres, fetched by the device
  over the real protocol, and **rung at the price the owner typed** (Rs 450 + Rs 320 = Rs 770).
- Both delivery paths work: a snapshot on `hello_ack` version mismatch, and a **live delta** on
  `catalog_notice` while the till is connected — an *Apply now* publish moved a connected till from
  v1 to v2 with no restart.
- `03-F50`'s `station` travels with the entry (`"station":"grill"` observed in the device store).
- The till's PIN unlock, order loop and totals are real.
- **Re-measured on a second, independent run (August 2026), with the device admitted by §6b's new
  `provision-device` command rather than by hand-written SQL.** A 20-entry Pakistani menu (5
  categories, 15 priced items) was authored one entry at a time in a real browser; the till was
  **connected and idle throughout** and rode the notice path from **v0 to v20 with no restart**
  (`select version from catalog_state` = 20, 20 catalog rows, `station` and both channel prices
  present on every item). Signed in as Hina, four tiles rang **Rs 450 + Rs 320 + Rs 60 + Rs 180 =
  Rs 1,010** — the prices typed in the back office, to the paisa.

**SEEDED OR FAKED, and each is why:**

| thing | state |
|---|---|
| **device identity** | still a marked DEV SEED with fixed UUIDs, and this is the half `provision-device` does **not** close: the command admits an identity you already know, and nothing gives the device one. `01-F25`'s pairing code is what would, and it is owed — which is why §0 still exists |
| **device token** | **the product mints one now** (§6b) — a declared command on the gateway, not a UI. `01-F25` specifies "a one-time pairing via back office code" and the doc-14/15 pairing UX is owed in full, as is the host warning below 25% remaining life. ⚠ *This row also listed device-side persistence of `01-F47`'s silent renewal as owed; it is not — `cloud-session.ts:309` `persistRenewal` writes it and `sendHello` prefers it. See §6b* |
| **device revocation** | **the product revokes now** (§6d) — `pnpm -C services/sync-gateway revoke-device`, a declared command, not SQL and not a UI. `01-F48`'s ≤30 s eviction sweep was always live; what had no caller was the *act* of setting `revoked_at`. What is still owed is `14-F13`: the back-office device list, and the `device.revoked` **event with an actor** — the command emits none, because a shell on the service host has no authenticated user |
| **the staff roster** | a DEV SEED, **one environment key per member** since August 2026 — `RESTOS_DEV_PIN` (Ayesha), `RESTOS_DEV_PIN_BILAL`, `RESTOS_DEV_PIN_HINA` — with **no fallback between members**, so an unset key means that person is absent from the grid rather than reachable with a neighbour's digits. ⚠ *This row said "three staff sharing one PIN", which was the authorization hole rather than a shortcut: one secret opened the branch manager's row, so `02-F22`'s role guard was one tile-tap away and `02-F38`'s self-approval refusal was keyed on a `user_id` two people had (`01-F28`).* PIN *verification* was always real; nothing populates the registry |
| **the owner account** | ⚠ *this said "one owner declared in env (`bootstrapUsers`), an in-memory `UserStore` that dies with the process. **No user table**" — and the table landed.* The owner is a **row in `kernel.users`**, written by §2b's `create-owner` and read on every request by `createPostgresUserStore`, so it survives a restart and `list-tenancy` can report it. The env seed still exists as `15-F26`'s stopgap and is now **mutually exclusive** with it (§5b). What is still genuinely owed is everything around the row: **no reset, no lockout, no rate limiting, no rotation, no `audit.login`**, and `14-F14`'s user CRUD — so a lost initial password has no recovery path and `create-owner` refuses a second owner |
| **staged edits** | `createMemoryStagedEditStore` — a pending day-end edit does **not** survive an API restart |
| **the session bearer** | `sessionStorage` in the browser; an httpOnly cookie is the correct shape and is owed |
| **LAN / hub** | reported `OFF` and that is honest — no mesh session exists yet |
| **printing** | **K-8 — no printer has ever been attached, and it is the only item on this list that hardware closes.** The transport ships (`RESTOS_PRINTER`), the model record ships (`RESTOS_KOT_PRINTER`) and the PDF simulator ships (`RESTOS_PRINT_TO_FILE`); all three are **§6e**, which is where they are explained and where the refusal matrix is measured. ⚠ *This row used to be the only place printing was documented, and it named two of the three variables — `RESTOS_KOT_PRINTER` was missing, which is the one whose absence refuses every KOT and every cash slip while receipts still print.* The residue in one line: driven against a loopback socket and a file and **never against a print head**, so nothing here is evidence about cutter, feed, paper-out or legibility (`27-F35`) |
| **migrations** | run by ONE declared command (§2), by hand. That command is now the deploy step — but nothing *automated* calls it yet, because no deploy pipeline exists to call it |

**OWED, found by this run:**

1. ~~**A migrate entry point.**~~ **CLOSED (August 2026).** `pnpm -C services/sync-gateway migrate`
   is declared, idempotent, and verified against a real Postgres; boot reports the schema state
   rather than failing later and elsewhere. §2 is that command now, not a `tsx -e`. Two things are
   still owed underneath it: **no deploy pipeline calls it** (it is a command a human runs), and
   the boot check answers *"has this build's journal been applied"* — **not** *"is the schema
   intact"*. Drop a table by hand and leave the journal alone and the check still says `up to
   date`, because drizzle keeps one `created_at` watermark and never re-checks the objects.
   Measured, not assumed; re-running `migrate` against that database also reports success and
   repairs nothing.
2. ~~**A device-provisioning path.** §6b is two manual steps against a protected service's table.~~
   **PARTLY CLOSED (August 2026)** — and the residue is named rather than rounded up.
   `pnpm -C services/sync-gateway provision-device` is declared, seam-tested against a real Postgres
   (`__acceptance__/provisionable.test.ts` spawns the DECLARED script and then makes a real
   `createGateway` judge the token it printed), and §6b is that command now. **It removed the SQL;
   it did not build `01-F25`.** Three things stay owed, in the order they bite:
   - **the pairing code.** `01-F25` says registration is "a one-time pairing via back office code"
     and `14-F26` puts it in the onboarding wizard. This is an operator command on the service
     host, so an owner still cannot add a till without shell access. It was left undone on a
     commandment-2 ground rather than a scheduling one: the pairing-code *model* — mint, TTL,
     one-time claim, class and branch binding — exists in the corpus only as that one clause.
   - ~~**revocation has no caller at all.**~~ **CLOSED (August 2026)** —
     `pnpm -C services/sync-gateway revoke-device --org <org_id> --device <device_id>` is declared
     and seam-tested the same way (`__acceptance__/revocable.test.ts`: the DECLARED script, in a
     separate process, then a real `createGateway` refusing the device it just admitted). What stays
     owed is `14-F13`'s **screen and ledger record**: revocation from the back-office device list,
     emitting `device.revoked` with an **actor**. The command deliberately emits no event — a shell
     on the service host has no authenticated user, and a `null` actor written permanently into an
     append-only store is a worse record than none. See §6d.
   - ~~**the device does not persist `01-F47`'s renewal.**~~ **NOT OWED — this was wrong rather
     than out of date (re-measured 2026-08-24).** `packages/sync-client/src/cloud-session.ts:309`
     is `persistRenewal`; `:727`/`:761` call it on every `renewed_token`; `sendHello` at `:329`
     prefers the persisted one. **The lesson is about the grep, not the fact:** a search of
     `apps/pos-electron` for `device_token` / `persistToken` / `saveToken` finds nothing, because
     the shipped symbols are `persistRenewal` / `setDeviceToken` and they live one package over —
     which is where the FR puts them. Search for the PROPERTY before concluding from an absence.
3. **`rebuild:native` still clobbers `build/Release/`** (§6a). The documented restore is required
   every time, not "if it ever happens again".
4. ~~**`catalog.enabled`** — the enabled set is declared twice and can drift (§5c).~~ **CLOSED
   (August 2026.)** The procedure exists, the back office draws its grid from it with no fallback,
   and `NEXT_PUBLIC_ENABLED_*` is deleted (§5c). **What is NOT closed is the other end:** the set
   this service and the back office now agree on is still not checked against the DEVICE's
   `branch_id`, so **§0**'s warning stands unchanged (⚠ *this pointed at §3, which is the secrets
   step; the id trap has always been §0*). The org half of that trap has since been closed by
   deletion rather than by a check — `BOOTSTRAP_ORG_ID` is not part of the join any more (§5b) —
   and the branch half is unchanged and unchecked.
5. **A stuck catalog is invisible to the cashier.** `Uplink.catalogRefusal` carries `01-F56`'s
   refusal out of the cloud session and nothing consumes it, so `DEC-SYNC-011`'s "observable" holds
   at the API and nowhere a human can see it.

**FIXED by the run that wrote this doc** — both were live defects no suite could see, both are
protected paths and **both want senior review**:

- **`packages/sync-client/src/catalog-fetch.ts` dropped `prices` and `station`.** The gateway
  served them, `CatalogEntryWire` carried them, the device store declared and read them — and
  `toEntry` did not copy them, so every synced tile was `no price set` and every station fell back
  to `DEFAULT_STATION`. `catalog-pricing.test.ts` calls `store.catalog.apply()` directly and never
  crosses that seam; `catalog-fetch.test.ts` never mentioned a price. **The bug failed 0 of the 579
  pre-existing `sync-client` tests.**
- **`notifyCatalogVersion` had zero production callers.** `/internal/catalog/publish` never told
  live sessions, so an *Apply now* publish reached a connected till only on its next reconnect —
  under a screen promising *"every till in the organisation changes as soon as this saves"*. **The
  bug failed 0 of the 280 pre-existing gateway tests.**

Both are the wave's named defect (`AGENTS.md`): a correct subsystem with no seam to the product.
`pnpm seams:check` is structurally blind to the second — a key in an object literal is not an
export (Rule A), and there was no options-bag member to find unsupplied (Rule B).

---

## 8. The nightly owner summary (`14-F31`) — reaching it, and what it needs

Added August 2026 by the first run of this screen against a live stack. **The summary needs no
menu and no till catalog**; it needs `kernel.events` to hold a business day. Its chain is the
mirror image of the catalog's — the catalog goes *API → gateway → device*, the summary comes
*device → gateway → API → back office*, and the gateway serves rows without interpreting them:

```
apps/pos-electron  ──push──▶  kernel.events  ──GET /internal/ledger/window──▶  services/api
                                                            (the fold lives here)  │
                                                                                   ▼
                                                        apps/backoffice  ·  Summary tab
```

**Processes required: Postgres, the gateway, `services/api`, `apps/backoffice`** — steps 2 to 5.
The till (step 6) is needed only to *produce* the day.

### 8a. Put a business day in the ledger

There is no seeding command and none should be invented: the only shipping producer of these
events is a till appending and pushing them. Run §6c, then work the counter — unlock as **Hina**
(only a manager may open the day, `02-F22`), open the day with a float, ring lines on more than
one channel, settle, and close the shift. Each append leaves on the same socket the catalog
arrives on.

Confirm the events landed before opening a browser, because *"the screen is empty"* and *"the
push never happened"* look identical on the screen:

```sh
docker exec restos-pg psql -U postgres -d restos \
  -c "select envelope->>'type' as type, count(*) from kernel.events group by 1 order by 1;"
```

### 8b. Read it

Sign in at `http://localhost:3000` (**not** `127.0.0.1` — see 5c) and press **Summary**, the third
tab. Check it over HTTP first if you want the numbers without the browser — note the superjson
envelope, and that `input` is a *query* parameter here:

```sh
curl -s "http://127.0.0.1:3001/trpc/summary.nightly?input=%7B%22json%22%3A%7B%7D%7D" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

`{"json":{"business_date":…}}` for a specific day (`12-F13`). Absent means the business day
containing the server's clock.

**The day boundary is visible on the wire and worth checking once**: the API asks the gateway for
`from_ms`/`to_ms` exactly one `01-F46` business day apart — 05:00 Asia/Karachi to 05:00 the next
morning — and the window is on `branch_created_at` **inside the envelope**, never on arrival time,
so a branch that syncs at 03:00 still banks its evening to the right night.

| you see | it means |
|---|---|
| `Rs 0 · 0 orders` and *"Events read for this business day: 0"* | the window is genuinely empty. Either nothing was pushed, or you are looking at the wrong business day — before 05:00 Asia/Karachi "today" is still yesterday's day |
| the whole screen replaced by a refusal sentence | `12-F2` — the server's own `report.sales_view` refusal, printed. A subject with branch-only reach must name their own `branch_id`. **Read off the code, not measured**: this run had only the one `BOOTSTRAP_OWNER_*` subject, whose reach is always the whole org, so no scope narrower than "org" was exercised end to end |
| `no ledger reader is configured on this host` | the API was started without `SYNC_GATEWAY_URL`, which it refuses at boot — so in practice this means a host that constructed `createApiServer` directly |
| *"Last synced N minutes ago"* in an amber band | `12-F8`, and it is a statement about the ORG's freshest arrival, not about the day on screen. Both numbers behind it are the server's; the browser's clock is not read |

### 8c. What this screen does NOT show, measured rather than assumed

The August 2026 run found four things the server computes and ships that **no shipping code
renders**: `cash[].no_sale_count` (`02-F21`'s theft vector), `cash[].paid_out_paisa` (`02-F26`),
the whole `days` block (opening float, the manager's count at day close, the deposit) and `scope`.
They are the wave's named defect one layer up — the numbers exist, cross the wire, and stop.
`pnpm seams:check` cannot see any of them, because an object field is neither a value export
(Rule A) nor an optional options-bag member (Rule B). Do not read their absence from the screen as
"the day had none": ring a no-sale drawer open and it is counted in Postgres, in the fold, and
nowhere a human looks.

---

## 9. Tearing down

```sh
docker rm -f restos-pg
rm -rf /tmp/restos-till          # the till's store and print spool, if you used --user-data-dir
```

Killing the four processes is enough for everything else — the API's user store, staged edits and
sessions are all in memory and die with it.
