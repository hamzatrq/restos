# Running the stack — clean checkout to a till showing a menu an owner published

**Status: WORKING, and every command below was run.** August 2026. This is the runbook for the
product claim *"an owner opens the back office, prices an item, publishes it, and the menu appears
on the till"* — four processes, one Postgres, and two credentials nothing in the product mints.

It exists because the knowledge was spread across `services/sync-gateway/CLAUDE.md`,
`services/api/CLAUDE.md`, `apps/backoffice/CLAUDE.md` and `apps/pos-electron/CLAUDE.md`, and no
document took anyone from zero to a working system. The run that produced it found **five** things
that stop the chain, three of which no suite could see; they are recorded in
[§7 What is still seeded, faked, or owed](#7-what-is-still-seeded-faked-or-owed).

> **Read `AGENTS.md` first.** Nothing here overrides a commandment, and §7 is the part of this doc
> most likely to go stale — a runbook claiming a gap it no longer has misleads exactly as badly as
> one hiding a gap it does have.

---

## 0. The one thing that breaks every attempt: THREE IDS MUST MATCH

Before any command: `apps/pos-electron` ships a **dev-seed device identity** with fixed UUIDs
(`main/index.ts`, `DEV_IDENTITY` — `01-F47` admission has not landed, so nothing mints these):

| | value |
|---|---|
| `org_id` | `00000000-0000-7000-8000-000000000001` |
| `branch_id` | `00000000-0000-7000-8000-000000000002` |
| `device_id` | `00000000-0000-7000-8000-000000000003` |

**`BOOTSTRAP_ORG_ID` on `services/api` must equal that `org_id`, and `ENABLED_BRANCHES` must
contain that `branch_id`.** The catalog is org-scoped (`01-F52`) and the API publishes under the
logged-in owner's org (`ctx.subject.org_id`), which is `BOOTSTRAP_ORG_ID`; the till fetches its
own. Get it wrong and **nothing anywhere reports an error**: the back office says *Published
version 1*, the gateway returns `200`, the database holds the menu, and the till sits at
`catalog v0 — 0 tile(s)` for ever, because it is asking about a different org.

The example in `apps/backoffice/CLAUDE.md` (`BOOTSTRAP_ORG_ID=org-demo`,
`ENABLED_BRANCHES=branch-main`) is a **two-process** example — API + back office, where nothing
ever reads the org id back. Copy it into a four-process run and you get the silent failure above.

Export them once and reuse:

```sh
export ORG_ID=00000000-0000-7000-8000-000000000001
export BRANCH_ID=00000000-0000-7000-8000-000000000002
export DEVICE_ID=00000000-0000-7000-8000-000000000003
```

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

### Migrations — there is no migrate script, and nothing runs them for you

`services/sync-gateway/src/migrate.ts` carries `@unreached-by-design`, naming its callers as the
test harness "and whatever runs the deploy". **Nothing runs the deploy.** A gateway started against
an unmigrated database boots perfectly and answers `500` on the first request that needs a table.

```sh
cd services/sync-gateway
DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos' \
  pnpm exec tsx -e "import('./src/migrate.ts').then(m => m.applyMigrations(process.env.DATABASE_URL)).then(() => console.log('migrations applied'))"
cd -
```

Healthy: `migrations applied`, and nine tables in `kernel`:

```sh
docker exec restos-pg psql -U postgres -d restos -c '\dt kernel.*'
# catalog_entries · catalog_versions · device_registry · device_watermarks
# events · org_events · org_sequences · quarantine · quarantine_notices
```

Re-running against an already-migrated database prints Postgres error objects and still ends
`migrations applied` — noisy, not a failure.

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

**Healthy** — three lines, plus Fastify's own pino JSON beside them:

```
@restos/sync-gateway listening on http://0.0.0.0:8080
@restos/sync-gateway database postgres://postgres:*****@127.0.0.1:5432/restos (opened lazily …)
@restos/sync-gateway publish surface enabled (PUBLISH_TOKEN configured)
```

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

### 5a. Mint the owner's password hash

Argon2id at `01-F61`'s cost floor, so it takes a beat. **Run it from `services/api`** —
`packages/domain` has no `tsx` of its own, so `pnpm -C packages/domain exec tsx` fails with
*Command "tsx" not found*.

```sh
cd services/api
pnpm exec tsx -e "import('@restos/domain').then(m => m.hashPin('<choose-a-dev-password>')).then(h => console.log(h))"
cd -
# $argon2id$v=19$m=19456,t=2,p=1$…
```

Never put a plaintext password in env: the env would then hold the credential itself.

### 5b. Start the API

```sh
SESSION_SECRET="$SESSION_SECRET" \
BOOTSTRAP_OWNER_EMAIL=owner@example.test \
BOOTSTRAP_OWNER_PASSWORD_HASH='<the PHC string from 5a — single-quote it, it contains $>' \
BOOTSTRAP_ORG_ID="$ORG_ID" \
ENABLED_BRANCHES="$BRANCH_ID" \
ENABLED_CHANNELS=counter,storefront \
SYNC_GATEWAY_URL=http://127.0.0.1:8080 \
SYNC_GATEWAY_TOKEN="$PUBLISH_TOKEN" \
PORT=3001 \
pnpm -C services/api start
```

**Healthy — exactly one line**, Fastify's logger stays off:

```
@restos/api listening on http://0.0.0.0:3001
```

Failure modes worth naming:

| you see | it means |
|---|---|
| `SYNC_GATEWAY_URL: required (the sync gateway's base URL …)` and the process exits | deliberate. An optional publisher falling back to the in-memory stub is a deployment that boots, serves, logs in, and ships no menu — see `services/api/CLAUDE.md`'s G1 mutant |
| `EADDRINUSE … 3001` | something else holds it (another agent's API). Any port works; `RESTOS_API_URL` in 5c must follow |
| login returns `UNAUTHORIZED` with the right password | the `BOOTSTRAP_*` trio was not all set — absent env leaves the store EMPTY and **nobody can log in**, the fail-closed direction |
| every save refused, naming an unpriced pair | `ENABLED_*` disagrees with what you priced. An absent enabled set refuses **every** save |

Check it over HTTP before opening a browser — note the **superjson envelope**, `{"json":{…}}`;
without it you get a Zod *"expected object, received undefined"*:

```sh
curl -s -X POST http://127.0.0.1:3001/trpc/auth.login -H 'content-type: application/json' \
  -d '{"json":{"email":"owner@example.test","password":"<the dev password>"}}'
# {"result":{"data":{"json":{"token":"eyJ…"}}}}
```

### 5c. Start the back office

```sh
RESTOS_API_URL=http://127.0.0.1:3001 \
PORT=3000 \
pnpm -C apps/backoffice dev                  # http://localhost:3000
```

**Healthy:** `▲ Next.js 16.3.0 (webpack)` … `✓ Ready in <1s`.

✅ **The enabled set is declared ONCE now** — on the API, at step 5a. `catalog.enabled` (August
2026) serves it, and the back office draws `14-F29`'s grid from that answer with **no fallback**:
if the query fails the screen says so and draws no editor rather than guessing. `lib/env.ts` and
its two `NEXT_PUBLIC_ENABLED_*` variables are deleted, so there is nothing left here to keep in
step with. **This removes one of this runbook's two silent-failure modes; `BOOTSTRAP_ORG_ID`
remains** — see §3, and note that the API and the back office agreeing with each other is a
different claim from either agreeing with the DEVICE's `branch_id`, which nothing checks.

---

## 6. `apps/pos-electron` — the till

### 6a. The native addon, and the tax it charges

```sh
pnpm -C apps/pos-electron rebuild:native     # ONCE per checkout
```

`better-sqlite3` is native and Electron 43's V8 ABI (148) differs from Node's (127).

⚠ **`rebuild:native` still clobbers `build/Release/`** — measured on this run, so the mitigation in
`apps/pos-electron/CLAUDE.md` is not complete. It correctly writes the Electron copy to
`bin/darwin-arm64-148/`, **and** it overwrites the Node copy the whole test suite loads. Every
suite that opens a store then dies with `NODE_MODULE_VERSION 148 … requires 127`. Restore Node's
copy — the Electron one in `bin/` survives, so the app keeps working:

```sh
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release && cd -
```

Do this **before** any `pnpm test`, and verify with `pnpm test --force` (a cached turbo run reports
green off results computed before the rebuild).

### 6b. Mint a device token and register the device — nothing in the product does this

`01-F47` admission is not built. The gateway needs **both**: an HS256 token signed with
`DEVICE_TOKEN_SECRET`, **and** an unrevoked, branch-matching row in `kernel.device_registry`. The
registry has the veto, so a valid token alone opens nothing.

```sh
cd services/sync-gateway
export RESTOS_DEVICE_TOKEN=$(ORG=$ORG_ID BRANCH=$BRANCH_ID DEVICE=$DEVICE_ID pnpm exec tsx -e \
  "import('./src/auth.ts').then(m => m.issueDeviceToken({org_id: process.env.ORG, branch_id: process.env.BRANCH, device_id: process.env.DEVICE}, process.env.DEVICE_TOKEN_SECRET, {now: Date.now()})).then(t => console.log(t))" | tail -1)
cd -

docker exec restos-pg psql -U postgres -d restos -v ON_ERROR_STOP=1 -c \
  "insert into kernel.device_registry (org_id, branch_id, device_id, device_class)
   values ('$ORG_ID','$BRANCH_ID','$DEVICE_ID','counter_electron')
   on conflict (org_id, device_id) do update set revoked_at = null;"
```

`device_class` must be one of `01-F39`'s hub-eligible classes (`counter_electron`, `counter_rn`,
`kitchen`) for a counter terminal. **Mint with `Date.now()`**, not a fixture instant: the token's
90-day expiry is checked against the gateway's real clock, and an expired one opens the session
straight into `01-F47` drain mode where *reads are refused* — which reads as "the catalog never
arrived" rather than as an auth problem.

### 6c. Run the till

```sh
RESTOS_CLOUD_URL=ws://127.0.0.1:8080/sync \
RESTOS_DEVICE_TOKEN="$RESTOS_DEVICE_TOKEN" \
RESTOS_DEV_PIN=4821 \
pnpm -C apps/pos-electron start
```

`pnpm start` is `electron-vite build && electron out/main/index.js`. Running those two apart lets
you pass Electron's own switches, which is what this run did and what makes the store findable and
the teardown a `rm -rf`:

```sh
cd apps/pos-electron
pnpm exec electron-vite build
RESTOS_CLOUD_URL=ws://127.0.0.1:8080/sync \
RESTOS_DEVICE_TOKEN="$RESTOS_DEVICE_TOKEN" \
RESTOS_DEV_PIN=4821 \
  pnpm exec electron out/main/index.js --user-data-dir=/tmp/restos-till
cd -
```

**No `RESTOS_DEV_MENU`.** That flag seeds a local dev menu and is precisely what the published one
replaces; leaving it off is how you find out whether the transport works.

**Healthy — one line, and it is the measurement:**

```
@restos/pos catalog v1 — 1 tile(s), 0 unsellable
```

| the line says | it means |
|---|---|
| `v0 — 0 tile(s), 0 unsellable` at first launch | correct and expected. The line prints at boot, **before** the socket connects; the catalog arrives a second or two later and the line is not reprinted. Relaunch to see the real number, or read the store (below) |
| `vN — n tile(s), 0 unsellable` | the menu arrived **with prices**. This is the healthy end state |
| `vN — n tile(s), n unsellable` | tiles arrived and prices did not — the item resolves no price for **this** branch on `counter`. Either `ENABLED_BRANCHES` is not this device's `branch_id`, or you are on a build before the `catalog-fetch` fix (§7) |
| `v0 — 0 tile(s)` and it stays there | the till is not talking to the gateway, or it is a different org. Check the gateway log for a `GET /sync` |

The store is the ground truth, and reading it is how you tell "the catalog never arrived" from "the
line was printed before it did":

```sh
sqlite3 /tmp/restos-till/device.db 'select version from catalog_state;'
sqlite3 /tmp/restos-till/device.db 'select json from catalog;'
# {"kind":"item","id":"chicken-biryani","name":"Chicken Biryani","kitchen_name":"Biryani",
#  "prices":[{"branch_id":"…0002","channel":"counter","price_paisa":45000}, …]}
```

Without `--user-data-dir` the store is under Electron's own `app.getPath("userData")` — this run
never used the default, so its exact path is unverified here rather than stated wrongly.

Sign in with any of the three seeded staff — **Ayesha**, **Bilal** (cashiers) or **Hina** (branch
manager) — with the PIN you passed as `RESTOS_DEV_PIN`. Only Hina can open the day (`02-F22`).

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

**SEEDED OR FAKED, and each is why:**

| thing | state |
|---|---|
| **device identity** | a marked DEV SEED with fixed UUIDs. `01-F47` admission/pairing is not built, which is why §0 exists and why §6b is a manual SQL insert |
| **device token** | nothing in the product mints one. `issueDeviceToken` is a Wave-0 seam; the pairing-code UX is doc 14/15 |
| **the staff roster** | a DEV SEED behind `RESTOS_DEV_PIN` (three staff sharing one PIN). PIN *verification* is real; nothing populates the registry |
| **the owner account** | one owner declared in env (`bootstrapUsers`), an in-memory `UserStore` that dies with the process. No user table, no reset, no lockout, no rate limiting, no rotation, no `audit.login` |
| **staged edits** | `createMemoryStagedEditStore` — a pending day-end edit does **not** survive an API restart |
| **the session bearer** | `sessionStorage` in the browser; an httpOnly cookie is the correct shape and is owed |
| **LAN / hub** | reported `OFF` and that is honest — no mesh session exists yet |
| **printing** | no printer. Every confirm raises `03-F5`'s band ~20 s later. `RESTOS_PRINT_TO_FILE=<dir>` renders documents to PDF and **does not** close K-8 |
| **migrations** | run by hand (§2). No deploy step exists |

**OWED, found by this run:**

1. **A migrate entry point.** `applyMigrations` has no CLI and no deploy caller; §2 is a `tsx -e`
   because there is nothing better to point at.
2. **A device-provisioning path.** §6b is two manual steps against a protected service's table.
3. **`rebuild:native` still clobbers `build/Release/`** (§6a). The documented restore is required
   every time, not "if it ever happens again".
4. ~~**`catalog.enabled`** — the enabled set is declared twice and can drift (§5c).~~ **CLOSED
   (August 2026.)** The procedure exists, the back office draws its grid from it with no fallback,
   and `NEXT_PUBLIC_ENABLED_*` is deleted (§5c). **What is NOT closed is the other end:** the set
   this service and the back office now agree on is still not checked against the DEVICE's
   `branch_id`, so §3's warning stands unchanged.
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

## 8. Tearing down

```sh
docker rm -f restos-pg
rm -rf /tmp/restos-till          # the till's store and print spool, if you used --user-data-dir
```

Killing the four processes is enough for everything else — the API's user store, staged edits and
sessions are all in memory and die with it.
