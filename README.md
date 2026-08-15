# RestOS

**An operating system for Pakistani restaurants.** Not a POS, not a dashboard — one event-sourced
kernel underneath every sales channel, the service floor, the kitchen, delivery, inventory, staff and
an intelligence layer. Offline-first: the branch keeps running with the internet dead, and the cloud
is exhaust rather than a dependency.

TypeScript monorepo (pnpm + turbo). The product vision is [`restaurant-os.md`](restaurant-os.md); the
normative behaviour lives in [`specs/`](specs/) and **the specs are the contract**.

---

## Contents

- [Where this actually stands](#where-this-actually-stands)
- [Quickstart](#quickstart) — a working back office in about a minute
- [Running the till](#running-the-till)
- [How it fits together](#how-it-fits-together)
- [Repository map](#repository-map)
- [The specs corpus](#the-specs-corpus) — how to find the doc that owns your problem
- [Development](#development)
- [Contributing](#contributing)
- [Deploying to a real restaurant](#deploying-to-a-real-restaurant) — and [`ops/`](ops/), the operator kit
- [Configuration reference](#configuration-reference)

---

## Where this actually stands

Wave 0 (kernel) and Wave 1 (service) are merged to `main`. A restaurant can be run on it in a narrow
shape: **counter + takeaway + phone/WhatsApp pickup, kitchen on a screen, cash and card.**

| | state |
|---|---|
| Tests | **4279 passing, 26 of 26 turbo tasks** (measured on `main`, `REAL_EXIT=0`) |
| `pnpm verify` | **RED at step 6.** Steps 1–5 pass; `layout:check` fails — see [Development](#the-six-gates) |
| Runs as a process | the till, the pass screen, the back office, the API, the sync gateway, the jobs worker |
| Not built yet | storefront, waiter, rider, owner app, platform admin, foodpanda, WhatsApp, tax, intelligence |
| Not deployable yet | no installer, no container images, no TLS, no printer transport. Backups and single-box supervision now exist in [`ops/`](ops/) |

**This README states measurements, not intentions.** Where a number appears it was read off a command
on `main`. Where something does not work, it says so. The repo has a documented history of status
lines that stayed green after they stopped being true — if you find one here, fix it in the same
commit as the thing that changed.

---

## Quickstart

Gets you a logged-in back office where you can write a menu, price it per branch and channel, and
publish it. **About 18 seconds of machine time** with a warm pnpm store and the Postgres image pulled.

### Prerequisites

| | |
|---|---|
| Node | **≥ 22.16.0** (`.nvmrc` pins `22.16.0`; verified on 22.23.2) |
| pnpm | **10.11.0** — `corepack enable` |
| Docker | for Postgres, and to *test* the gateway. Not needed to *start* anything |
| openssl | for generating secrets |
| Linux, headless only | `sudo apt-get install -y xvfb` (for the Electron apps) |

There are **no `.env` files** anywhere and nothing reads one. All configuration is environment
variables passed on the command line.

```sh
# ── The three IDs ────────────────────────────────────────────────────────────
# These are the dev seed baked into packages/device-config (device-identity.ts).
# Keep them verbatim for a first run. If you change any of them you must ALSO set
# RESTOS_ORG_ID / RESTOS_BRANCH_ID / RESTOS_DEVICE_ID on the till — otherwise all
# four processes report success and the till sits at "catalog v0" for ever with
# nothing anywhere reporting an error. (Measured. It is the classic failure here.)
export ORG_ID=00000000-0000-7000-8000-000000000001
export BRANCH_ID=00000000-0000-7000-8000-000000000002
export DEVICE_ID=00000000-0000-7000-8000-000000000003
export DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/restos'

# ── 1. install ───────────────────────────────────────────────────────────────
pnpm install --prefer-offline

# ── 2. Postgres + schema ─────────────────────────────────────────────────────
docker run -d --name restos-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=restos \
  -p 5432:5432 postgres:16-alpine

# The image answers pg_isready from a TEMPORARY init server, then restarts it. A
# migration fired in that window dies with `read ECONNRESET`. Wait for the SECOND
# "ready to accept connections".
until [ "$(docker logs restos-pg 2>&1 | grep -ac 'ready to accept connections')" -ge 2 ]; do sleep 1; done

pnpm -C services/sync-gateway migrate
# -> @restos/sync-gateway migrate applied 12 of 12 migrations · postgres://postgres:*****@…
# Idempotent. On a second run the 42P06/42P07 Postgres NOTICE dumps are NOT errors.

# ── 2b. the tenant (15-F27: every provisioned record has a declared step) ────
# The org and the branch are ROWS, and an owner under an org with no record is
# refused by name. --org / --branch pin the ids to the dev seed above; omit them
# and each command mints a fresh UUIDv7 instead.
pnpm -C services/sync-gateway create-org    --org "$ORG_ID" --name "Dev Restaurant"
pnpm -C services/sync-gateway create-branch --org "$ORG_ID" --branch "$BRANCH_ID" --name "Dev Branch"

# ── 3. secrets ───────────────────────────────────────────────────────────────
export DEVICE_TOKEN_SECRET=$(openssl rand -hex 24)   # >= 32 bytes, enforced at boot
export PUBLISH_TOKEN=$(openssl rand -hex 24)         # >= 32 bytes, enforced at boot
export SESSION_SECRET=$(openssl rand -hex 24)        # only non-empty is enforced
# ONE secret, TWO names: the gateway reads PUBLISH_TOKEN, the API sends it as
# SYNC_GATEWAY_TOKEN. A mismatch is a 401 on every publish.

# ── 4. sync gateway (port 8080) ──────────────────────────────────────────────
pnpm -C services/sync-gateway start &
until curl -sf "http://127.0.0.1:8080/internal/catalog/published?org_id=$ORG_ID" \
  -H "Authorization: Bearer $PUBLISH_TOKEN" >/dev/null; do sleep 1; done
echo "gateway healthy"     # {"version":0,"entries":[]} — this also proves step 2 ran

# ── 5. the owner, then the API (port 3001) ───────────────────────────────────
# The owner is a ROW in kernel.users, not an environment variable. The command mints the
# password itself and prints it ONCE on stdout — 15-F26 forbids the vendor holding a
# restaurant's password, so nothing here chooses one and nothing stores the plaintext.
OWNER_PASSWORD=$(pnpm -C services/sync-gateway create-owner \
  --org "$ORG_ID" --email owner@example.test --name "Ayesha Khan" 2>/dev/null | tail -1)
echo "initial password: $OWNER_PASSWORD"   # hand this to the owner; it is not stored anywhere

# DATABASE_URL is what makes the API read those rows. It is MUTUALLY EXCLUSIVE with the
# BOOTSTRAP_OWNER_* seed — set both and the API refuses to boot rather than pick one.
DATABASE_URL="$DATABASE_URL" \
ENABLED_BRANCHES="$BRANCH_ID" \
ENABLED_CHANNELS=counter,storefront \
SYNC_GATEWAY_URL=http://127.0.0.1:8080 \
SYNC_GATEWAY_TOKEN="$PUBLISH_TOKEN" \
pnpm -C services/api start &
# Probe reachability, not auth: `curl -f` on a wrong password loops for ever.
until curl -s -o /dev/null -X POST http://127.0.0.1:3001/trpc/auth.login \
  -H 'content-type: application/json' -d '{"json":{"email":"x","password":"x"}}'; do sleep 1; done
echo "api healthy"

# ── 6. back office (port 3000) ───────────────────────────────────────────────
pnpm -C apps/backoffice dev &
until curl -sf -o /dev/null http://localhost:3000/; do sleep 1; done
```

Open **http://localhost:3000** and sign in as `owner@example.test` with `$OWNER_PASSWORD`. First page
compile takes ~6 s; ~30 ms after that.

**Teardown:** `kill %1 %2 %3; docker rm -f restos-pg`. The API's users, staged catalog edits and
sessions are all in memory and die with the process.

### Which processes for which outcome

| you want | you need |
|---|---|
| the gateway alone (health, `/internal`) | Postgres + gateway |
| back office: log in, author and publish a menu | Postgres + gateway + api + backoffice |
| the nightly owner summary | the same four; a till only to *produce* a day |
| a till ringing a published menu | all five |

The API **refuses to boot** without `SYNC_GATEWAY_URL`/`SYNC_GATEWAY_TOKEN`. That is deliberate: an
optional publisher silently falling back to an in-memory stub is a deployment that boots, serves,
logs in, and ships no menu to anybody.

### Publishing a menu without a browser

```sh
TOKEN=$(curl -s -X POST http://127.0.0.1:3001/trpc/auth.login \
  -H 'content-type: application/json' \
  -d "{\"json\":{\"email\":\"owner@example.test\",\"password\":\"$OWNER_PASSWORD\"}}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["data"]["json"]["token"])')

curl -s -X POST http://127.0.0.1:3001/trpc/catalog.save \
  -H 'content-type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d "{\"json\":{\"entry\":{\"kind\":\"item\",\"id\":\"chicken-biryani\",
       \"name\":\"Chicken Biryani\",\"kitchen_name\":\"Biryani\",\"station\":\"grill\",
       \"prices\":[{\"branch_id\":\"$BRANCH_ID\",\"channel\":\"counter\",\"price_paisa\":45000},
                   {\"branch_id\":\"$BRANCH_ID\",\"channel\":\"storefront\",\"price_paisa\":48000}]},
       \"apply_when\":\"now\"}}"
```

Every tRPC call takes a superjson envelope `{"json":{…}}` — without it you get a Zod *"expected
object, received undefined"*. Queries pass it as `?input=<urlencoded>`.

**A price is required for every enabled `(branch, channel)` pair.** Miss one and the save is refused
by name. There is no fallback to a house price — pricing is per branch and channel because commission
drives it, and completeness is enforced at the writer.

---

## Running the till

```sh
# ── 7a. native addon — ONCE per checkout, and NOT optional ───────────────────
# better-sqlite3 is native, and Electron's V8 ABI (148) differs from Node's (127).
# A fresh install has no Electron-ABI build and the till dies with an UNHANDLED
# REJECTION — the window comes up and the app hangs, which reads as "it started".
pnpm -C apps/pos-electron rebuild:native                       # ~64 s

# It then clobbers the Node-ABI copy that every test suite loads. Restore it, or
# every suite touching the device store dies with NODE_MODULE_VERSION 148 vs 127.
# Both ABIs coexist afterwards. Note this writes into node_modules/.pnpm/, which
# is workspace-global, not app-local.
( cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release )

# ── 7b. provision the device ─────────────────────────────────────────────────
# Admission has two halves: an HS256 token AND an unrevoked row in the registry.
# The registry has the veto, so a valid token alone opens nothing.
# Do NOT fold this into `export X=$(…)` — the assignment always succeeds and would
# hide a failure, leaving the till with a non-token that never syncs.
DEV_TOKEN=$(pnpm -C services/sync-gateway provision-device \
  --org "$ORG_ID" --branch "$BRANCH_ID" --device "$DEVICE_ID" \
  --class counter_electron | tail -1)
case "$DEV_TOKEN" in ey*) ;; *) echo "provisioning failed — read stderr"; exit 1;; esac
export RESTOS_DEVICE_TOKEN="$DEV_TOKEN"
# The token is the ONLY thing on stdout; every readable line goes to stderr.
# Re-running refuses (exit 1) — add --reissue. It never un-revokes.

# ── 7c. run it ───────────────────────────────────────────────────────────────
ELECTRON_DISABLE_SANDBOX=1 \
RESTOS_CLOUD_URL=ws://127.0.0.1:8080/sync \
RESTOS_DEV_PIN=4821 \
RESTOS_DEV_PIN_BILAL=5137 \
RESTOS_DEV_PIN_HINA=9064 \
RESTOS_STATION_ROUTES='*=screen' \
  pnpm -C apps/pos-electron start
```

**All three PIN keys, with three DIFFERENT numbers, or this quickstart produces a till nobody can
sell on.** There is one key per roster member since August 2026 (`01-F28`; the map is
`DEV_STAFF_PIN_ENV` in `packages/device-config/src/dev-staff.ts`) and there is deliberately **no
fallback between members** — a member whose key is unset is absent from the identification grid
rather than reachable with a neighbour's digits. `RESTOS_DEV_PIN` alone seeds **Ayesha alone**, and
Ayesha is a cashier: `02-F22` gives day open and float entry to a manager only, so a till with no
`RESTOS_DEV_PIN_HINA` starts, looks entirely correct, and **cannot open a day or record a sale**.
The boot line names everybody it could not seed and says that sentence out loud (`describeDevStaff`).

Sign in as **Ayesha** (`RESTOS_DEV_PIN`) or **Bilal** (`RESTOS_DEV_PIN_BILAL`) — both cashiers — or
**Hina** (`RESTOS_DEV_PIN_HINA`, branch manager). Only a manager can open the day.

**Notes that cost real time if you miss them:**

- **`ELECTRON_DISABLE_SANDBOX=1` is required on Linux** unless you have `chown root` + `chmod 4755`'d
  `node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox`. Without it: a `FATAL`
  SUID-sandbox abort. `pnpm start -- --no-sandbox` does **not** work — the script forwards no flags,
  which is why this is an env var here.
- **Headless?** Prefix with `xvfb-run -a --server-args="-screen 0 1366x768x24"`.
- **First launch downloads Electron** (~100 MB) — `pnpm install` does not, because
  `onlyBuiltDependencies` lists only `better-sqlite3`. It fails offline.
- **`RESTOS_STATION_ROUTES='*=screen'`** matters because the default route is `paper` and this
  launch names no printer. Left at the default, every confirmed order burns three print attempts and
  raises an alarm band. ⚠ **It routes KITCHEN STATIONS and nothing else.** Receipts and cash slips
  are not station-routed — `routesToPaper` is passed to `createKotPrinter` alone — so on a till with
  no `RESTOS_PRINTER` **every settlement still raises an S1 band** the cashier clears by hand. See
  the configuration reference below.
- **`catalog v0 — 0 tile(s)` at boot is correct**, not a failure. The line prints before the socket
  connects and is never reprinted.
- The device store lands in `~/.config/RestOS Counter/device.db` on Linux, and the pass screen's in
  `~/.config/RestOS Pass/device.db`. Each host calls `app.setName` (`01-F64` — until August 2026
  both resolved to `~/.config/Electron/device.db`, one file for two `device_id`s).
  `pnpm start -- --user-data-dir=X` silently does **not** forward the flag; to control the location,
  run `electron-vite build` and `electron out/main/index.js --user-data-dir=…` as two steps.
- ⚠ **UPGRADING A TILL THAT RAN BEFORE THE RENAME? IT STARTS ON AN EMPTY STORE.** The old file is
  still at `~/.config/Electron/device.db` (`%APPDATA%\Electron\device.db` on Windows) and **nothing
  migrates it and nothing points at it**. The till comes up with no open day, no shift and no
  orders, which looks like a fresh install rather than a fault, and **any sale in the old file that
  had not yet synced is unreachable from the product**. Do not delete the old directory: it is a
  ledger `01-F1` forbids reconstructing. **Copying it across is not a supported move and may be
  wrong**: on any machine where both apps ran, that one file holds two `device_id`s' events
  interleaved — the fork `01-F64` exists to refuse — and it predates the `store_identity` row, so it
  carries no binding to refuse with and would be stamped with whichever identity opened it first.
  See [`ops/README.md`](ops/README.md#upgrading-a-till-that-ran-before-the-august-2026-rename).
- There is no `sqlite3` CLI on a stock Ubuntu. Read the store through the copy already in
  `node_modules` with `node -e`.

The pass screen is the same shape: `pnpm -C apps/pass-kds start`. **Set `RESTOS_DEVICE_ID` on it.**
Device identity resolves *per key*, so a pass screen launched without it silently adopts the counter's
identity and both apps then share one SQLite file.

---

## How it fits together

```
   apps/backoffice ──┐                                       ┌── apps/pos-electron (the till)
   (Next.js, owner)  │                                       │
                     ▼                                       ▼
              services/api ────publish────▶ services/sync-gateway ◀──ws──▶ apps/pass-kds
              (tRPC, auth)                   (Fastify + Postgres)          (kitchen screen)
                                                     │
                                              kernel.events            services/jobs
                                              (append-only)  ◀──audit── (BullMQ, nightly)
```

**Two planes, and they are never mixed** — this is a hard rule, machine-checked in the back office.
Operational screens (till, pass) read and write only through `sync-client` against their own local
SQLite, and sync later. Cloud screens (back office) use tRPC + TanStack Query. A device never blocks
on the WAN.

**The kernel is an append-only event ledger.** Nothing is ever mutated or deleted; a correction is a
new linked event. Money is integer paisas — never a float, and folds accumulate in `BigInt`, because
a running double lets delivery order decide a money outcome. Ordering is per-fold merge semantics:
folds declare explicit merge rules and read *no* ordering metadata, so two devices that saw events in
different orders still converge.

---

## Repository map

### Apps

| path | what it is | run it |
|---|---|---|
| `apps/pos-electron` | **The counter till.** A cashier signs in with a PIN, opens the day with a cash float, taps tiles to build an order, sends it to the kitchen, takes payment, closes the shift. Electron. | `pnpm -C apps/pos-electron start` |
| `apps/pass-kds` | **The kitchen screen.** Cooks see the branch queue oldest-first with an aging timer per ticket and press DONE. Electron. | `pnpm -C apps/pass-kds start` |
| `apps/backoffice` | **The owner's admin site.** Write the menu, price it per branch and channel, publish to every till, see registered devices, read the nightly summary. Next.js. | `pnpm -C apps/backoffice dev` |
| `apps/manager` | Phone app for branch managers. Expo. **Starts, but the only screen is three diagnostic readings** — a feasibility probe, not the console. | `pnpm -C apps/manager start` |
| `apps/owner` · `apps/waiter` · `apps/rider` · `apps/storefront` · `apps/pos-rn` · `apps/platform-admin` | **Scaffolds. Nothing is built yet.** | — |

### Services

| path | what it is | run it |
|---|---|---|
| `services/sync-gateway` | **The cloud server tills connect to.** Receives each device's events, merges them into one history per restaurant, pushes menu updates out, registers and revokes devices. | `start`, plus `migrate`, `provision-device`, `revoke-device` |
| `services/api` | **The cloud web server the back office talks to.** Logs owners in, authorizes every procedure, holds the menu while it is edited before publishing. | `pnpm -C services/api start` |
| `services/jobs` | **Background worker.** Replays every recorded event per restaurant on a schedule and reports anything disagreeing with the running totals. Needs Redis. | `pnpm -C services/jobs start` |
| `services/foodpanda` · `services/whatsapp` · `services/tax` · `services/intelligence` | **Scaffolds. Nothing is built yet.** | — |

### Packages

| path | what it is |
|---|---|
| `packages/domain` | **SACRED.** The shared vocabulary everything trusts: money as whole paisas, every event and order type, staff roles and what each may do, business-day maths. Declared once, here. |
| `packages/sync-client` | The engine each device runs: persist what happens locally, keep working with no internet, converge with peers and the cloud later. |
| `packages/sync-protocol` | The wire formats devices and the gateway use to talk. |
| `packages/escpos` | Turns an order into the bytes a thermal printer understands; kitchen tickets, cash slips, and a durable spooler so a power cut loses nothing. |
| `packages/ui` | The closed vocabulary of on-screen components, plus colour, spacing and the bundled typeface. |
| `packages/device-config` | Reads what a till or kitchen screen needs at boot — which device it is, panel size, aging thresholds — and says on the boot line where each answer came from. |
| `packages/auditor` | Replays a restaurant's whole history from scratch and compares it against the running totals. |
| `packages/config` | Reads service env vars and crashes at boot, readably, if any are missing or invalid. |
| `packages/testing` | Test-only: simulates several devices and a stand-in cloud so sync behaviour is testable without hardware. |

### Not code

| path | what it is |
|---|---|
| [`ops/`](ops/) | **The operator kit** — day-zero runbook, env templates per host role, id minting, Windows and systemd startup, backups. No TypeScript; this is what gets installed in a restaurant. |
| `specs/` | The contract. `restaurant-os.md` is the product vision. |
| `plans/` | Per-area build plans. **Not a scope list and not a status board** — see `plans/wave-1/wave-1-scope-reconciliation.md`. |

---

## The specs corpus

**Never code from memory of a spec — open the owning doc first.** 28 documents in `specs/`, plus
`specs/DECISIONS.md` for cross-cutting rulings. `restaurant-os.md` is the product vision and the seed
appendices; read it for *why* and for scope.

| area | doc |
|---|---|
| Kernel: events, sync, money, auth, catalog | `01` |
| POS / counter | `02` |
| Printing, pass screen, KDS, timing | `03` |
| Waiter · Manager console | `04` · `05` |
| Storefront · WhatsApp · Foodpanda | `06` · `07` · `08` |
| Riders and dispatch | `09` |
| Inventory and purchasing | `10` |
| Staff | `11` |
| Owner app · Intelligence | `12` · `13` |
| Back office · Platform admin | `14` · `15` |
| Tax · Marketing and loyalty | `16` · `17` |
| Stack, packages, code rules | `18` |
| Testing, environments, release gates | `20` |
| UI/UX system · visual language | `21` · `27` |
| Backup/DR, retention, export | `22` |
| Fold performance · merge semantics | `25` · `26` |
| Agent context rules · build harness | `23` · `24` |

Find an FR by grepping its id: `grep -rn "02-F9" specs/`. **An id that greps to nothing was
invented** — that is the test, and it is a real failure mode here.

Doc conflicts resolve by the authority order stated byte-identically in `restaurant-os.md` and
`specs/00`. [`AGENTS.md`](AGENTS.md) carries the working rules and a long, honest register of the
defects this codebase has actually produced; it is worth reading before your first change.

---

## Development

```sh
pnpm verify                        # the six gates below
pnpm test --force --continue       # every suite
pnpm test --force --continue --concurrency=3   # on a busy machine
```

### The six gates

`pnpm verify` is `docs:lint && typecheck && lint && tokens:check && seams:check && layout:check`.
The last three are unusual and will surprise you:

- **`tokens:check`** — greps for a `check-token` marker left in source. The marker is legal to write
  and illegal to leave. Satisfy it by using an existing design token, or by adding the token to
  `tokens.json` with the law it comes from, then deleting the marker.
- **`seams:check`** — asks *"does shipping code actually reach this?"*. **Rule A**: a value export no
  shipping code reaches (a barrel re-export is not a use). **Rule B**: an *optional* member of an
  options bag on a factory shipping code already calls, that no call site ever passes. Satisfy it by
  landing a real production caller, or by annotating the declaration `@unreached-by-design <reason>`
  or `@unreached-owed <reason>`. A marker with no reason is rejected, and **a marker on something
  that IS reached is also rejected**, so the debt register cannot rot. It prints its current counts
  on every clean run — read them there, never hand-copy them into a doc.
- **`layout:check`** — opens a real Electron `BrowserWindow` from the app's own exported window
  options, mounts the shipped renderer, and measures in Blink across ten declared panels: every box
  against its content, every control against every clipping ancestor, touch targets in **millimetres
  of glass**, and whether the bundled font actually loaded. The `.dom.test.tsx` suites run under
  happy-dom, which performs no layout at all, so they can say *"the button is in the document"* and
  never *"the button is on the screen"*. Nine layout defects were found by this gate or by launching
  the app; zero by the suites.

**⚠ `pnpm verify` is RED on `main` today, at `layout:check`.** Measured three consecutive identical
runs: 23, 24, 24 violations. The overflow verdicts are stable; the `EMPTY MATCH` and positional
verdicts vary run to run (20/22/20 and 3/0/3), which is a known non-determinism on Linux — an
unrendered surface trivially "fits", so **a low count is not evidence of a fix**. Two further traps:
the gate needs a virtual screen at least as large as its biggest panel (3840×1080), and **it can exit
0 having measured nothing** if Electron dies at launch, so confirm the report contains
`LAYOUT GATE PASSED` or `LAYOUT GATE FAILED` rather than trusting the exit code.

### Testing traps — all of these have cost someone a day

- **`--force`**: turbo caches `test`, and a cached run has reported a false green here.
- **`--continue`**: turbo kills a failing task's siblings, so without it seven green suites are
  indistinguishable from seven killed ones.
- **A reported exit code is not evidence.** `cmd > log; echo "exit=$?"` reports the *echo's* status,
  and backgrounded runs have been reported as "exit 0" while genuinely exiting 1. Read the suite's own
  summary line, or write a `REAL_EXIT=$?` marker **inside** the log and read that.
- **Docker is required by `services/sync-gateway` and `services/jobs`** (Testcontainers). They fail
  loudly by design rather than skipping — mocked infrastructure in service tests is banned. With
  Docker down you get a red run that is an *environment prerequisite, not a regression*.
- **`pnpm test` hangs for ever in a sandboxed shell** — vitest sits at 0% CPU in `globalSetup` because
  the Docker socket is blocked. No timeout saves you; run it unsandboxed.
- **Do not trust one green run, or one red one.** Subprocess-spawning oracle suites have flaked, and a
  package that reads 4-failed under a contended parallel run has passed 306/306 alone. Re-run the
  package by itself before reporting either colour.

---

## Contributing

### The loop

Work follows `specs/24 §3`, and the middle step is the one that makes this repo different:

1. **Plan first.** Name the FRs, the files you may touch, and the check that proves you are done.
   Where the task is ambiguous, state the interpretations and name the simpler alternative — do not
   silently pick.
2. **Acceptance tests exist before implementation, and they are written by someone else.** The session
   or person implementing an FR never writes its acceptance tests, and the tests are **read-only** to
   them. A test you believe is wrong is a *finding* for its owner, cited by FR id — never something
   you weaken, special-case or delete.
3. **Confirm red, then implement.** Capture the failing run before you start.
4. **Minimum code that closes the FR**; surgical diffs. No speculative features, no drive-by
   improvements to adjacent code — cleanup is scheduled work.
5. **Done means the named check passes**, never your own judgment.
6. **Evidence, not assertion.** Paste captured command output; never write "tests pass".

Because tests can pass while a subsystem is reached by nothing, the closing evidence for a new
subsystem is **the production caller**, not the suite. Mutate the *seam* — delete the call site and
see whether anything reddens. If nothing does, what you built is decorative.

### The ten commandments

Listed in full in [`AGENTS.md`](AGENTS.md). Five are genuinely machine-enforced repo-wide:

| | rule | enforcement |
|---|---|---|
| 2 | Never invent events, states or policy | a typed registry that throws on an unknown event type, plus a docs-lint check that every event named in a doc is in the kernel catalog |
| 3 | Money = integer paisas | a Biome GritQL plugin banning arithmetic on money-named identifiers, in `pnpm lint` and in CI |
| 6 | UI = closed vocabulary | source-scanning tests in `packages/ui` and the pos renderer |
| 8 | Server-side authorization always | the API **refuses to boot** hosting an ungated procedure |
| 9 | Spec change before behaviour change | a CI job requiring an FR id in the PR body or a spec diff |

Commandments 1 (append-only), 4 (offline-first), 7 (English UI / Unicode content) and 10 (protected
paths) are honour-system or partial today. **`.github/CODEOWNERS` is currently inert** — every owner
handle is still a placeholder, so senior review on protected paths is a convention, not a gate.

Protected paths, which need senior review and their owning spec open: `packages/domain`,
`packages/sync-client`, `packages/sync-protocol`, `packages/escpos`, `services/tax`,
`services/sync-gateway`, plus the spec corpus.

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR: install → `docs:lint` →
`typecheck` → `lint` → `test` → `build`, plus an FR-citation job on PRs.

**CI does not run `pnpm verify`.** `tokens:check`, `seams:check` and `layout:check` are local-only —
run them yourself before opening a PR. CI also runs `pnpm test` without `--continue`, so one red suite
hides its siblings.

### Commits and PRs

Not Conventional Commits. Subjects are **lowercase narrative sentences that state the finding**, not
the change — *"the layout gate's 24-F14 floor said it could not rot when a tab was added; it could
(02-F7)"*. Roughly half carry an FR id. Bodies are long, wrapped ~80 columns, and contain captured
evidence and a "what is owed" section. Branches are `wN/<topic>`, merged `--no-ff`.

The PR template requires three things: **FRs closed or cited**, **evidence** as a fenced block of real
command output, and a checklist covering stated assumptions, surgical scope, minimum code, and that no
green FR turned red.

---

## Deploying to a real restaurant

**Read this section before promising anyone a date.** The software runs; the deployment story is
partial — there is now an operator kit, and there is still no installer.

### → [`ops/`](ops/) — the operator kit

**[`ops/README.md`](ops/README.md) is the day-zero runbook**: stand up the cloud box, migrate,
provision two devices, author the menu, train the staff. It is the document to follow when you are
standing in the restaurant. The rest of this section is the engineering view of the same ground.

| | |
|---|---|
| [`ops/id.sh`](ops/id.sh) | mints the org/branch/device ids and the three shared secrets **once**, into one gitignored file. The single most common failure in this system is those values disagreeing across four processes, which produces four healthy processes and no menu with **no error anywhere** |
| [`ops/env/*.env.example`](ops/env/) | every variable each host role reads, one line of what it does and what happens when it is wrong, derived by grepping `process.env` rather than copied from a doc |
| [`ops/startup/*.bat`](ops/startup/) | Windows `shell:startup` auto-start + restart loop, per device role |
| [`ops/systemd/`](ops/systemd/) | a unit per cloud service, plus the nightly backup timer — **cloud only**, see below |
| [`ops/backup.sh`](ops/backup.sh) | backs up the till (`device.db` **and its `-wal`/`-shm`** — see below) and `pg_dump`s the cloud. **Nothing schedules the till half** |

⚠ **TILL BACKUPS ARE NOT AUTOMATED, and the till holds the only copy of a sale until it syncs.**
`ops/systemd/restos-backup.service` runs `ops/backup.sh --cloud` and only that; its `ProtectHome=true`
would block the till half even if the argument changed, and the till is a **Windows** machine with no
systemd on it at all. There is no scheduled task, no `.bat` and no timer anywhere in `ops/startup/`
that runs `backup.sh --till`. So the till half exists as a script an operator must remember to run,
by hand, on the machine that is the sole custodian of every sale not yet pushed to the cloud
(`22-F21`). Closing this needs a Windows Task Scheduler job that `ops/` does not ship.

**The till backup is not a file copy, and this is the sharp edge.** The device store is opened WAL
with `synchronous = FULL` and `apps/pos-electron` never closes it, so the write-ahead log is not
reliably checkpointed. `ops/backup.sh` uses SQLite's online backup API, falls back to copying all
three files, and **fails writing nothing** if it can do neither (`22-F21`).

⚠ **The failure mode has TWO shapes and the loud one is not the one to fear.** This paragraph used
to carry one piece of evidence — *"a copy of `device.db` alone opens with `no such table` — the
whole ledger, not a tail"* — and that is what a **never-checkpointed** store does, not what a real
till store does. Both shapes were measured 2026-08-15, on the two live stores this box happens to
hold:

| store | main file | `-wal` | what a copy of the main file ALONE does |
|---|---|---|---|
| `~/.config/RestOS Pass/device.db` | 4 KB | 276 KB | `integrity_check` **ok** — and **no tables at all** |
| `~/.config/RestOS Counter/device.db` | 135 KB | 45 KB | `integrity_check` **ok**, full schema, **`events` = 0**, and a *stale* `staff` snapshot (3 rows where the WAL holds 1) |

The second row is the one that matters, and it is why the old evidence understated the danger rather
than overstating it. That copy **opens cleanly and passes the sanity check an operator would
actually run**, and what it then reports is a complete schema holding zero sales — which reads as a
quiet day, not as a destroyed backup. The loss is also not confined to the ledger: every table rolls
back to its last checkpoint, so a restore silently reinstates an older staff registry and an older
catalog too. **Never judge a till backup by whether it opens.** Count `events` in it and compare
against the till it came from.

⚠ **AND THE SAME EDGE CUTS ON THE WAY BACK IN: A TILL RESTORE THAT LEAVES THE STALE `-wal` IN
PLACE DOES NOTHING, LOUDLY REPORTING SUCCESS.** This README stated no till restore procedure at all
and [`ops/README.md`](ops/README.md#restoring-the-till--delete-the-sidecars-first-or-the-restore-silently-does-not-happen)
stated one that did not restore. `ops/sqlite-backup.mjs` produces **one self-contained file with no
sidecars** (`22-F21` mechanism (a)), so copying it over `device.db` leaves the *live* store's
`device.db-wal` beside it and SQLite replays that WAL over the file just restored — the store opens,
`integrity_check` says `ok`, and it reports a healthy-looking event count that is the state the
operator was trying to discard. Measured 2026-08-15, 500 sales backed up and 200 more rung
afterwards:

| restore procedure | `integrity_check` | events |
|---|---|---|
| copy `device.db` back, sidecars left in place | ok | **700** — the restore did nothing |
| the same, after `device.db` was overwritten with random bytes | ok | **700** — the stale WAL rebuilt even the corruption |
| **remove `-wal` and `-shm` first, then copy** | ok | **500** — the sales the backup held |

The rule, and it is the only difference between those rows: **nothing belonging to the store you are
replacing may survive the copy.** Move `device.db`, `device.db-wal` and `device.db-shm` aside
together (never delete — the old store is append-only and may hold unsynced sales, `01-F1`), copy in
the backup, take *its* sidecars only if it has them, and **count `events` in the result before
starting the app** — `22-F8`'s principle at one-restaurant scale: a restore is not proven by
opening. The full procedure is in [`ops/README.md`](ops/README.md).

### What exists

- Three services that start from TypeScript source via `tsx`, each refusing to boot on bad config with
  a readable message.
- One idempotent migration command, `pnpm -C services/sync-gateway migrate`, which nothing calls
  automatically. The gateway deliberately does not migrate itself — it reports the schema state on a
  boot line instead.
- Device admission and revocation as declared commands: `provision-device` and `revoke-device`. There
  is no un-revoke anywhere in the product, by design; the replacement path is a fresh device id.
- A Next.js back office that builds (`next build --webpack`; Turbopack cannot resolve this repo's
  `.js` specifiers).

### What does not exist

| missing | consequence |
|---|---|
| **No installer** for the till or pass screen | no `.exe`, no `.msi`, no signing, no auto-update. You run both from a git checkout with `pnpm`, Node and a dev-installed Electron on the restaurant's machine |
| **No container images, no compose, no deploy manifest** | zero Dockerfiles in the repo; no Procfile, Terraform or k8s. `ops/systemd/` covers a **single Linux box** and nothing above it |
| **No compiled server artifact** | all three services run `tsx` over source; their `build` scripts are echo stubs |
| ~~No process supervision~~ **Supervision on one box only** | `ops/systemd/` restarts each cloud service and `ops/startup/*.bat` restarts each Windows app. Both need `Restart=always` to be actually enabled, BIOS restore-on-AC-power-loss, and Windows auto-logon — all three named in `ops/README.md`, none of them enforceable from here |
| **No TLS, no reverse proxy, no rate limiting** | the gateway binds `0.0.0.0` in plain HTTP/WS |
| **No health or readiness endpoint** | the gateway serves `/sync` and seven `/internal/*` routes; the API serves `/trpc/*` |
| ~~No backup, restore or retention~~ **Backups exist; the recovery objective is not met, and the TILL half is not scheduled** | `ops/backup.sh` can back up the till's `device.db`/`print-spool.db` and `pg_dump` the cloud — but the systemd timer runs `--cloud` **only** and the till is a Windows box with no systemd, so **nothing automates the till half** (see above). That is short of `22-F22`'s stated interim: `22-F1` wants continuous WAL archiving with an **RPO ≤ 5 min**, and a nightly dump's real RPO is **up to 24 h**. Nothing does PITR, and no restore drill has been run |
| ~~No printer transport~~ **A transport exists; no printer has ever been attached (K-8)** | `main/printer-link.ts` ships three forms — `tcp://host:9100`, `windows://ShareName`, `device:///dev/usb/lp0` (`03-F1`, `18 §10`) — selected by `RESTOS_PRINTER`, plus an *unattached* printer that raises the alarm band and a file printer that writes PDFs. It has been driven against a **loopback socket** and a **file** and against **no print head, ever**, so nothing here is evidence about cutter, feed, paper-out or legibility (`27-F35`). The two USB forms are write-only and cannot read `03-F40`'s paper sensor — a roll that runs out reads as a printed ticket — so prefer `tcp://`. Budget real time for the first physical printer |
| **No device pairing from the back office** | provisioning needs shell access on the gateway host |
| **No owner-account creation** | the only owner is declared in env and held in an **in-memory** store that dies with the process; staged catalog edits are in memory too |
| **No log shipping or metrics** | the gateway and jobs write pino JSON to stdout; the API logs one boot line. Nothing collects any of it |

### Requirements, as far as they are known

Node ≥ 22.16.0 and pnpm 10.11.0 on **every** host including production; `pnpm install` everywhere, and
`pnpm rebuild:native` additionally on each till. Postgres is **tested only against 16** — no lower
bound is declared anywhere. Redis (tested against 7) is needed by `services/jobs` only.

---

## Configuration reference

### `services/sync-gateway`

| var | required | default | notes |
|---|---|---|---|
| `DEVICE_TOKEN_SECRET` | **yes** | — | HS256 key for device tokens. **≥ 32 bytes, enforced at boot** |
| `DATABASE_URL` | no | `postgres://postgres:postgres@localhost:5432/restos` | connects **lazily** — a wrong DSN fails on first request, not at boot |
| `PUBLISH_TOKEN` | no | unset | the `/internal` credential. **Absent is fail-closed**: every `/internal` route answers 503. ≥ 32 bytes when set |
| `DEVICE_TOKEN_ISSUER` / `_AUDIENCE` | no | unbound | must match what `provision-device` minted with, or a perfectly-signed token opens nothing |
| `PORT` | no | `8080` | binds `0.0.0.0` |

### `services/api`

| var | required | default | notes |
|---|---|---|---|
| `SESSION_SECRET` | **yes** | — | session signing key. **Non-empty is the only check — there is no length floor**, unlike the other two secrets |
| `SYNC_GATEWAY_URL` | **yes** | — | e.g. `http://127.0.0.1:8080` |
| `SYNC_GATEWAY_TOKEN` | **yes** | — | must equal the gateway's `PUBLISH_TOKEN` |
| `ENABLED_BRANCHES` | no | empty | **empty refuses every catalog save.** The single declaration; the back office reads it back |
| `ENABLED_CHANNELS` | no | empty | `counter`, `phone`, `storefront`, `whatsapp`, `foodpanda`. An unknown value crashes at boot |
| `DATABASE_URL` | no | — (**no default, unlike the gateway's**) | **where accounts live.** Set ⇒ the login path reads `kernel.users`, the rows `create-owner` writes, and accounts survive a restart. Connects **lazily**: a wrong DSN is a named 503 on the first login, not a boot crash |
| `BOOTSTRAP_OWNER_EMAIL` / `_PASSWORD_HASH` / `BOOTSTRAP_ORG_ID` / `_NAME` | no | — | the **development seed**, and `15-F26` calls it a stopgap: one owner, in memory, **gone on restart**. All three (name optional) or none — absent leaves the store **empty and nobody can log in** (fail-closed). The hash is an Argon2id PHC string, never a plaintext password |
| `PORT` | no | `3001` | |

⚠ **`DATABASE_URL` and `BOOTSTRAP_OWNER_*` are MUTUALLY EXCLUSIVE — both set is a boot crash that
says so.** They are two answers to one question (who may sign in), and the API will not choose. A
real deployment sets `DATABASE_URL` and creates people with
`pnpm -C services/sync-gateway create-owner`; that is the only path producing an account
`list-tenancy` can report and `14-F14`'s CRUD could ever deactivate (`15-F26`, `15-F27`). An
env-declared owner beside a real users table would be a permanent backdoor in neither.

The API prints **two** boot lines, and the second is the one to read: `@restos/api accounts: …`
names `kernel.users` (with a password-redacted DSN), the in-memory seed, or `NONE`. Before it
existed, a deployment whose accounts evaporate on restart and one with a real users table looked
identical from outside the process.

`BOOTSTRAP_ORG_ID` must equal the till's org id, and the till's branch must be in `ENABLED_BRANCHES`.
**Nothing checks this**, and getting it wrong produces four healthy processes and no menu.

### `services/jobs`

`DATABASE_URL` (**required, no default** — a job that audits a database nobody named reports "ok"
about the wrong ledger), `REDIS_URL` (**required**), `AUDITOR_INTERVAL_MS` (default 24 h).

### `apps/pos-electron` and `apps/pass-kds`

| var | default | notes |
|---|---|---|
| `RESTOS_ORG_ID` / `RESTOS_BRANCH_ID` / `RESTOS_DEVICE_ID` | **counter: dev seed · pass: REFUSES** | **resolved per key**, and the two apps differ on purpose (`01-F65`). `apps/pos-electron` falls back per key to a marked dev seed — the FR's single exemption, for its documented no-environment `pnpm start` — so a *production* till left unset starts, reports success on every line, and never sees a menu. `apps/pass-kds` calls `requireDeviceIdentity` and **refuses to start** on any absent key, because falling back there would adopt *the counter's* identity and put two hosts on one store. Set all three on every device |
| `RESTOS_CLOUD_URL` | unset ⇒ fully offline | full WebSocket URL **including the path**: `ws://host:8080/sync` |
| `RESTOS_DEVICE_TOKEN` | unset ⇒ offline | minted for that exact device id; renewals are persisted, so this is a bootstrap |
| `RESTOS_LAN_PORT` / `_HOST` / `_PEERS` | unset ⇒ **mesh off** | the port is what turns the LAN mesh on; peers without a port is a boot refusal |
| `RESTOS_PANEL_PPI` | measured, else assumed 15.6″ | being wrong here **looks exactly like being right** — every touch target renders at the wrong physical size and nothing looks broken |
| `RESTOS_STATION_ROUTES` | `paper` for all | `*=screen` if you have no printer, or every order raises an alarm. **It routes KITCHEN STATIONS only** — see the note below the table |
| `RESTOS_AGING_THRESHOLDS` | `dine_in=10/20,…` | `order_type=amber/red` in minutes |
| `RESTOS_PRINTER` | unset ⇒ no printer link | the CABLE (`03-F1`, `18 §10`): `tcp://host[:9100]`, `windows://ShareName` (a share on **this** machine), or `device:///dev/usb/lp0`. Unreadable values are refused whole and named on the boot line. **Prefer `tcp://`** — it is the only form that can read `03-F40`'s paper sensor; the two USB forms take the bytes silently, so a paper-out reads as a printed ticket. **No printer has ever been attached to this code (K-8)** |
| `RESTOS_KOT_PRINTER` | none ⇒ 32-column record | the printer MODEL, not the cable. Unset resolves conservatively to 32 Font-A columns; a KOT needs 42, so every KOT is refused before a byte is sent. **Not irrelevant under `*=screen`** — the shift-close slip (35) and day summary (34) are refused too |
| `RESTOS_SERVE_SIGNAL_OWNER` | `settlement` | must be the **same value** on the till and the pass |
| `RESTOS_READY_SIGNAL_OWNER` | `pass` | pass-kds only. **A different set of values** from the serve signal |
| `RESTOS_DEV_PIN` | unset ⇒ Ayesha absent | **dev seed** — **one key per member since August 2026** (`01-F28`). This one is **Ayesha's alone** (cashier) |
| `RESTOS_DEV_PIN_BILAL` | unset ⇒ Bilal absent | the second cashier. A warning, not a blocker — one cashier and one manager is a workable shift |
| `RESTOS_DEV_PIN_HINA` | unset ⇒ **no day can be opened** | the branch manager. `02-F22` gives day open and float entry to a manager only, so a till without this starts, looks correct, and **cannot record a sale** |
| `RESTOS_DEV_MENU` | unset | dev seed; applied only when the catalog is at version 0 |
| `RESTOS_PRINT_TO_FILE` | unset | a directory; writes each document as a PDF. Opt-in on purpose — the default must never claim it printed |

⚠ **Give the three PINs three DIFFERENT numbers, and never reuse one.** There is deliberately **no
fallback between members**: a member nobody configured is absent from the grid rather than reachable
with a neighbour's digits. One secret for the roster is the authorization hole this split closed —
it put the branch manager's row behind the digits both cashiers type 20–60× a shift, so `02-F22`'s
role guard was one tile-tap away and `02-F38`'s self-approval refusal was keyed on a `user_id` one
secret opened twice (`01-F28`). The boot line names everybody it could not seed.

⚠ **`RESTOS_STATION_ROUTES=*=screen` DOES NOT MAKE A PRINTERLESS TILL QUIET.** It routes **kitchen
stations**, and a station routed `screen` enqueues nothing — no bytes, no attempt, no band, no
`kot.print_failed` (`03-F22`/`03-F51`). **Receipts and cash slips are not station-routed at all**:
`routesToPaper` is passed to `createKotPrinter` and to neither `createReceiptPrinter` nor
`createCashPrinter`, so on a till with no `RESTOS_PRINTER` **every settlement enqueues a receipt,
exhausts `03-F4`'s three attempts and raises an S1 band the cashier must clear by hand** (`03-F5`,
`03-F12`), and the first such failure appends one permanent `printer.status_changed(offline)` row
(`03-F54`, a transition — not one row per sale, and **not** a `kot.print_failed`, which is a KOT
fact this path deliberately never writes). Shift close and day summary take `03-F34`'s column
refusal instead, and their bands are unrecorded because `01 §4` carries no `slip.print_failed`.
**A branch with no printer at all is not yet a quiet configuration** — `03-F22`'s per-station choice
has no equivalent for the customer's copy.

### `apps/backoffice`

`RESTOS_API_URL` (default `http://127.0.0.1:3001`, read per-request by the Next server, so the backend
can be repointed without a rebuild) and `PORT` (default 3000).

---

## Licence

Proprietary. All rights reserved.
