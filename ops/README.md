# RestOS — operator kit

Everything needed to install RestOS in one restaurant and keep it running, in the order you
need it. Written for the person standing in the restaurant, not for the person who wrote the
code.

**Read [What this cannot do yet](#what-this-cannot-do-yet) before you promise anyone anything.**
Some of it changes what a restaurant has to do on the day, not just what an engineer has to know.

| file | what it is for |
|---|---|
| `id.sh` | mints this restaurant's ids and secrets **once**, into `ids.env`. Run it first. |
| `env/cloud.env.example` | every variable the four cloud processes read |
| `env/counter.env.example` | every variable the counter till reads |
| `env/kitchen.env.example` | every variable the pass screen reads |
| `startup/*.bat` | Windows auto-start + auto-restart, one per device role |
| `systemd/*` | Linux units for the cloud box, plus the nightly backup timer |
| `backup.sh`, `sqlite-backup.mjs` | nightly backup of the till and the cloud database |

---

## Day zero

Budget half a day for steps 1–7 and a full service for step 8. Do steps 1–4 the day before.

### 0. Decide two things before you touch a keyboard

Both are cheap now and expensive later, and neither has an error message.

1. **Which sales channels this restaurant sells on.** `counter`, `phone`, `storefront`,
   `whatsapp`, `foodpanda` — pick the set now. See [Trap 1](#trap-1-the-channel-set-is-decided-before-the-menu-is-authored-not-after).
2. **Whether the kitchen has a screen or a printer.** ⚠ *This read "it must be a screen: there is
   no printer transport in this product" and that stopped being true in August 2026.* There is a
   transport now — `RESTOS_PRINTER`, three cable forms, `03-F1`/`18 §10` — but **no printer has
   ever been attached to it (K-8)**, so choosing paper means you are the first. A screen is still
   the recommendation for a first restaurant, and it needs a second Windows machine, or a TV with a
   stick, in the kitchen. ⚠ **A screen does not make the till quiet**: `*=screen` routes kitchen
   stations only, and with no `RESTOS_PRINTER` **every settlement still raises an alarm band** for
   the customer's receipt. See [What this cannot do yet](#what-this-cannot-do-yet).

### 1. Mint the ids — once, on any machine

```bash
bash ops/id.sh          # writes ops/ids.env, mode 600
```

This is the whole reason this directory exists. Four processes must agree on an org id, a branch
id and one device id per machine, **and nothing anywhere checks that they do**. Get one wrong and
all four processes start, report success, log nothing unusual — and no till ever sees a menu.
There is no error message for this failure anywhere in the product.

So: every value you type from here on is **copied out of `ids.env`**. Never retyped, never
regenerated, never "close enough". Keep the file; it is also where the three shared secrets live.

Once a device has been provisioned, these values are frozen. The ledger is append-only and a
device's identity keys its outbox, so changing an id does not move a device — it forks one, and
there is no unwind.

### 2. Cloud box

One small Linux box (or VM) with Postgres 16, Redis 7, Node ≥ 22.16.0 and pnpm 10.11.0.

```bash
sudo timedatectl set-timezone Asia/Karachi     # the backup timer and the day cutover assume it
sudo useradd --system --home /opt/restos --shell /usr/sbin/nologin restos
sudo git clone <repo> /opt/restos && cd /opt/restos
sudo -u restos pnpm install
```

Configure it:

```bash
sudo mkdir -p /etc/restos
sudo cp ops/env/cloud.env.example /etc/restos/cloud.env
sudo chown restos:restos /etc/restos/cloud.env && sudo chmod 600 /etc/restos/cloud.env
sudo -e /etc/restos/cloud.env       # fill in every blank from ops/ids.env
```

Generate the owner's password hash — **never put the plaintext password in the file**. The env
would then hold the credential, and it is the same hashing the till uses for staff PINs:

```bash
cd /opt/restos
OWNER_PASSWORD='the-real-password' pnpm -C services/api exec tsx -e \
  "import('@restos/domain').then(m=>m.hashPin(process.env.OWNER_PASSWORD)).then(console.log)"
# -> $argon2id$v=19$m=19456,t=2,p=1$...$...
```

Paste that string into `BOOTSTRAP_OWNER_PASSWORD_HASH`, **double-quoted** — it is full of `$`,
and an unquoted one is silently mangled by the shell into a hash nobody can log in against.
Then clear it from your shell history.

### 3. Migrate

```bash
sudo -u restos DATABASE_URL=... pnpm -C services/sync-gateway migrate
```

Idempotent; a second run is safe. Nothing migrates automatically — the gateway reports the schema
state on a boot line instead of migrating itself, so this is a step you take deliberately.

If the Postgres container was just started, **wait for the second `ready to accept connections`**.
The image answers `pg_isready` from a temporary init server first, and a migration fired in that
window dies with `read ECONNRESET`.

### 4. Start the four cloud processes

```bash
sudo cp ops/systemd/restos-*.service ops/systemd/restos-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now restos-sync-gateway restos-api restos-backoffice restos-jobs
sudo systemctl enable --now restos-backup.timer
```

Check each one actually came up, and read its boot lines rather than trusting `active`:

```bash
journalctl -u restos-sync-gateway -n 20 --no-pager
```

You want four things from the gateway: the port, the (redacted) database it will use, the schema
state, and **`publish: enabled (PUBLISH_TOKEN configured)`**. If publish says DISABLED, the API
will get a 503 on every publish and no menu will ever ship.

The API prints one line, `@restos/api listening on ...`. If it did not boot, `journalctl` has the
reason and it will name the variable.

### 5. Provision the two devices

On the cloud box, using the ids from `ids.env`:

```bash
cd /opt/restos
export DATABASE_URL=... DEVICE_TOKEN_SECRET=...     # the same values the gateway has

sudo -u restos --preserve-env pnpm -C services/sync-gateway provision-device \
  --org "$ORG_ID" --branch "$BRANCH_ID" --device "$COUNTER_DEVICE_ID" --class counter_electron

sudo -u restos --preserve-env pnpm -C services/sync-gateway provision-device \
  --org "$ORG_ID" --branch "$BRANCH_ID" --device "$KITCHEN_DEVICE_ID" --class kitchen
```

Each prints a token. Copy each one into that device's `RESTOS_DEVICE_TOKEN` — the counter's token
into the counter's file, the kitchen's into the kitchen's. A token minted for one device id does
not work on another, and the symptom is a device that shows `Cloud OFF` and keeps selling offline
without complaining.

Device admission needs shell access on this box; there is no pairing code in the back office yet.
The other half of the pair is `revoke-device`, which is how you kill a stolen tablet from here —
or from the back office device list, which records who did it.

### 6. The two Windows machines

On each: install Node ≥ 22.16.0 and pnpm 10.11.0, clone the repo to `C:\restos`, then

```
pnpm install
pnpm -C apps\pos-electron rebuild:native      # ONCE per checkout, and not optional
```

`rebuild:native` builds the native SQLite module against Electron's ABI. Without it the window
opens and the app hangs, which reads as "it started".

Then, per machine:

- **Counter:** copy `ops\env\counter.env.example` to `ops\env\counter.env`, fill it in from
  `ids.env`, and put a shortcut to `ops\startup\restos-counter.bat` in `shell:startup`.
- **Kitchen:** the same with `kitchen.env.example` and `restos-kitchen.bat`.

Two BIOS/Windows settings are not optional in a load-shedding city:

- **BIOS: restore on AC power loss = ON.** Otherwise the power comes back and the till does not.
- **Windows: auto-logon.** A till at the lock screen is a till that is off, and nobody on the
  floor at 19:00 knows the Windows password.

**What the `.bat` files actually check** (⚠ this said *"the two settings … `RESTOS_STATION_ROUTES`
and `RESTOS_DEV_PIN`"*, which was true of neither file by the time it was read):

| | refuses to start without | warns only |
|---|---|---|
| `restos-counter.bat` | the env file, `RESTOS_ORG_ID`, `RESTOS_BRANCH_ID`, `RESTOS_DEVICE_ID`, `RESTOS_STATION_ROUTES`, `RESTOS_DEV_PIN`, `RESTOS_DEV_PIN_HINA` | `RESTOS_DEV_PIN_BILAL` (one cashier and one manager is a workable shift) |
| `restos-kitchen.bat` | the env file, `RESTOS_ORG_ID`, `RESTOS_BRANCH_ID`, `RESTOS_DEVICE_ID`, `RESTOS_DEV_PIN` | — |

**Both gates check all three identity keys now, and the reason each file needs it is different.**
`apps/pass-kds` calls `requireDeviceIdentity`, which refuses an absent key outright (`01-F65`), so
the kitchen `.bat` turns a boot crash into a sentence an operator can act on — its gate checked
`RESTOS_DEVICE_ID` alone, so a screen with an org or branch missing passed the gate and then died.
`apps/pos-electron` calls `resolveDeviceIdentity`, which falls back **per key** to a marked dev seed
— `01-F65`'s single stated exemption, for the counter app's documented no-environment `pnpm start`.
A production till on that seed carries a `device_id` no gateway has ever heard of: it starts,
reports success on every line, **and never sees a menu or syncs a sale**. That is the failure with
no error message anywhere in the product, so the launcher refuses it. The FR's exemption is for the
dev launch and this file is the production launcher; nothing about `pnpm start` changes.

⚠ **NONE OF THIS IS VERIFIED — there is no Windows machine on the box these files were written on.**
The gates and their messages have been read against the code they describe and have never been
executed. Run each `.bat` by hand on the real machine before relying on the startup shortcut.

### 7. The menu

Open `http://<cloud-box>:3000`, log in as the owner, author the menu, publish.

**Read both traps below before typing the first item.** Then check it landed: on the till, the
tiles should show names *and prices*. A tile reading `no price set` means the price for this
branch and channel is missing — that is `ENABLED_BRANCHES` not containing the till's branch, or
Trap 1.

### 8. Train

Two hours with the staff who will use it, on the real machines, before a real customer walks in.

Cover, in this order: sign in on the identification grid → open the day with a float → open a
shift → ring an order → send to kitchen → watch it appear on the kitchen screen → mark it DONE
there → settle → close the shift and read the reconciliation. Then do it again with them driving.

Spend the last twenty minutes on the [cash SOP](#the-cash-sop-the-float-lives-in-a-tin-not-in-the-drawer).
It is the part that costs money if it is misunderstood, and it is the part that sounds least
important.

---

## Trap 1 — the channel set is decided BEFORE the menu is authored, not after

`ENABLED_CHANNELS` is the set of channels every price must be complete for. A price is looked up
per **(branch, channel)** and **there is no fallback to a house price** — deliberately, because a
forgotten aggregator price would sell at the in-restaurant rate while the commission still took
its cut, and the price is frozen into the ledger at the moment the line is added.

Completeness is checked **at save, against the set as it is at that moment**.

So if you author and publish 60 items on `counter,phone`, and then add `foodpanda` next month:

- every one of those 60 entries has no foodpanda price;
- each one is **unsellable on foodpanda** and reads `no price set`;
- and the only fix is to open each entry and save it again, with the new price typed in.

Nothing warns you. The back office draws the new column, the till syncs happily, and the tiles are
simply dead on the new channel.

**Decide the set with the owner on day zero.** Adding `phone` costs one column of typing now and
sixty item-edits later. An empty `ENABLED_CHANNELS` refuses every save — it does not mean "do not
check". A channel outside the closed set crashes the API at boot, on purpose, naming the value.

## Trap 2 — author item names in ASCII / Roman-Urdu only

Type `Chicken Karahi`, not `چکن کڑاہی`. `Seekh Kebab`, not `سیخ کباب`.

**Nothing validates this when you type it.** The name field accepts any Unicode, the back office
renders it correctly, the till renders it correctly, and the kitchen screen renders it correctly.

The refusal is at the printed document. The encoder refuses any text outside Latin script
outright — a hard refusal of the **whole ticket**, taken before a single byte is produced, because
no ESC/POS code page can carry Urdu and a printer that substituted `?` would be a silent
degradation. There is no shaping engine for a positional script and there is not going to be one
soon.

Today this is **dormant**, and that is not a reason to ignore it: with the kitchen on a screen,
nothing goes through the encoder at all. It becomes live the moment a receipt printer or a kitchen
printer is attached — and on that day every ticket containing that item is refused with an S1
alarm band, mid-service, and the fix is to rename items in the back office while the queue backs
up. Rename dishes on a quiet Tuesday or do not create the problem.

(A dish can also carry a separate short `kitchen_name` for the ticket. Same rule applies to it.)

---

## The cash SOP — the float lives in a tin, NOT in the drawer

**This is the single most important thing to teach, and it is not obvious.**

At shift close the till compares **what it counted** against **what it took in payments** —
nothing else. The day's opening float is a *day* fact; the variance is a *shift* fact; and the
reconciliation deliberately does not join them.

So if the Rs 5,000 opening float is sitting in the drawer at close:

| | |
|---|---|
| sales the till expects | Rs 7,250 |
| cash actually in the drawer | Rs 12,250 |
| what the till reports | **OVER by Rs 5,000** |

Every night. For ever. And an "over" that never goes away is worse than useless — it trains the
manager to ignore the variance line, which is the one number that would show a real problem.

**The rule:**

1. Count the float at the start of the day, enter it when opening the day, and put it in a
   **separate tin** — not in the cash drawer.
2. The drawer starts the shift empty.
3. At close, count only what is in the drawer. The variance should be **zero**, or the amount of
   a genuine mistake.
4. Money taken out of the drawer during the shift (the vegetable man, a delivery) must be entered
   as a **paid-out** on the Cash tab, with a reason. Recorded paid-outs are added back before the
   comparison, so a Rs 300 paid-out against Rs 1,000 taken and Rs 750 counted reads as Rs 50
   **over** — correct. An unrecorded one reads as Rs 300 short and the cashier gets blamed.
5. A paid-out above **Rs 2,000** needs the manager's PIN on the till.

Also worth saying out loud during training: **the day can only be opened by the manager**, and
with the seeded roster that is Hina's tile. If nobody presses it, no shift can open and no sale
can be recorded.

---

## Backups

```bash
ops/backup.sh --cloud     # on the cloud box; the systemd timer already does this nightly
ops/backup.sh --till      # on each Windows machine, at closing time
```

`RESTOS_BACKUP_DIR` is required — the script refuses to guess where a restaurant's only copy of
its sales should live. Put it on a different disk, and copy it off the premises weekly.

⚠ **ONLY THE CLOUD HALF IS AUTOMATED. THE TILL HALF IS A HUMAN.** `ops/systemd/restos-backup.timer`
fires `restos-backup.service`, which runs `ops/backup.sh --cloud` and nothing else — and it could
not run the till half anyway, because the till is a **Windows** machine with no systemd on it and
the unit sets `ProtectHome=true`. There is no scheduled task, no `.bat` and no timer anywhere in
this kit that runs `--till`. So the machine holding the **only** copy of every sale not yet pushed
to the cloud is backed up exactly as often as somebody remembers to type the command. **Put it on
the closing checklist beside counting the drawer**, and treat "we have backups" as false about the
till until a Windows Task Scheduler job exists.

**Why the till is backed up at all.** People assume the cloud is the backup. It is the other way
round: the till holds the only copy of a sale until it has pushed and been acked. Lose the till
before it syncs and those sales are gone.

**Why it cannot be a plain file copy.** The device store runs in WAL mode and the app never closes
it, so the write-ahead log is not reliably checkpointed and a copy of `device.db` **alone** loses
everything the WAL still holds.

⚠ **AND THE FAILURE HAS TWO SHAPES. THE QUIET ONE IS THE DANGEROUS ONE.** This paragraph used to
give one piece of evidence — 500 committed rows, main file 4 KB, `-wal` 2 MB, and a copy of the
main file alone opening with *"no such table"*, "not a short tail: everything". That is what a
**never-checkpointed** store does. A store that has checkpointed at least once behaves completely
differently, and both were measured 2026-08-15 on two real till stores:

| store | main | `-wal` | a copy of the main file ALONE |
|---|---|---|---|
| a pass screen's | 4 KB | 276 KB | `integrity_check` **ok** — and **no tables at all** |
| a counter's | 135 KB | 45 KB | `integrity_check` **ok**, full schema, **`events` = 0**, and an out-of-date staff registry |

**The second one opens cleanly and passes the check an operator would actually run**, and then
reports a complete, healthy-looking database holding zero sales. That reads as a quiet day. It is
also not confined to the ledger — every table rolls back to its last checkpoint, so the restored
till silently gets an older staff list and an older menu too. **Never judge a till backup by
whether it opens.** Count its `events` rows and compare against the till it came from.

So `backup.sh` uses SQLite's online backup API, which reads through the WAL and writes one
self-contained file while the app is running. Where that is not possible it copies `device.db`
**together with its `-wal` and `-shm`**, and says loudly that this is only correct with the app
closed. If it can do neither it **fails and writes nothing** — a backup file that cannot be
restored is worse than a missing one, because it stops anyone looking.

**Restoring the till:** stop the app, copy the backed-up `device.db` (and its sidecars, if the
fallback produced them) back into the app's data directory, start the app. It re-syncs from the
gateway on connect.

**Restoring the cloud:** `pg_restore --clean --if-exists -d <DSN> cloud-<stamp>.dump`. Devices
re-push anything the restored database is missing on their next connect.

⚠ **A nightly dump is not the recovery objective the specs set** (they ask for continuous WAL
archiving with a 5-minute recovery point). Here the real exposure is **everything since the last
run** — up to 24 hours. Write that number on the wall next to the backup schedule, and move to
continuous archiving before this is more than one restaurant.

⚠ **A backup you have never restored is not a backup.** Restore one into a scratch database
before go-live, and again quarterly.

⚠ **Where the till's data directory is has CHANGED — see the upgrade note below before you point
`RESTOS_TILL_DATA_DIR` anywhere, and before you trust a backup taken on a machine that was
upgraded.**

---

## Upgrading a till that ran before the August 2026 rename

**Read this before you `git pull` on a machine that has already taken money.**

Both Electron apps used to open `device.db` under Electron's default `userData` directory, because
neither named itself: on Windows `%APPDATA%\Electron\device.db`, on Linux
`~/.config/Electron/device.db`. Each host calls `app.setName` now (`01-F64`), so the counter opens
`%APPDATA%\RestOS Counter\device.db` and the pass screen `%APPDATA%\RestOS Pass\device.db`.

**What an operator sees on the first launch after the update: a till that comes up on an EMPTY
STORE.** No open day, no open shift, no orders, no catalog until it re-syncs. It looks like a fresh
install rather than a fault, because it *is* a fresh store — and **any sale in the old file that
had not yet been pushed to the cloud is now unreachable from the product.** **Nothing migrates the
old file and nothing points at it.**

**What to do, in this order:**

1. **Do not delete the old directory.** It is an append-only ledger (`01-F1`) and there is no way
   to reconstruct it. Back it up first — the whole directory, `device.db` *and* `device.db-wal`
   *and* `device.db-shm`, per the WAL warning above.
2. **Let the till sync BEFORE you update it, if it still starts.** Everything the cloud has acked
   is safe in Postgres and comes back down on its own. This is the only clean answer available.
3. **Do not copy the old `device.db` into the new directory.** It is not a supported move and it
   may be actively wrong. The old file predates the `store_identity` row, so it carries no binding
   to refuse a mismatch with — it would simply be stamped with whichever identity opened it first.
   And on any machine where both apps ran, it holds **two `device_id`s' events interleaved in one
   table**, which is precisely the fork `01-F64` was written to refuse (`01-F3`, `01-F8`). If a
   till was the only app on its machine the risk is lower, but nothing checks that for you and
   `01-N5`'s answer to a broken store is a fresh `device_id`, not a repair.
4. **Check `RESTOS_TILL_DATA_DIR` in your backup job.** If it was pinned to the old path, tonight's
   backup silently captures the *old, dead* store and not the live one.
5. **An upgraded machine now has TWO `device.db` files.** `ops/backup.sh` finds and backs up
   **every** one it can see and names them all in its output — it used to take whichever the
   filesystem returned first and report success either way. Read that output: if it names two,
   the first is history and the second is the till.

**Not verifiable from here:** every path above is `%APPDATA%` on the real machine and this kit was
written on Linux. The Linux equivalents were measured; the Windows ones are the documented
`app.getPath("userData")` mapping and have not been run.

---

## What this cannot do yet

Not caveats — things that change what the restaurant does.

| | |
|---|---|
| ~~No printer transport~~ **A transport exists; no printer has ever been attached (K-8)** | ⚠ *This row said "there is no USB, Bluetooth or network printer implementation. Not 'untested' — absent … there are **no customer receipts**". All of that stopped being true in August 2026, and the product printed a receipt during a dress rehearsal.* `RESTOS_PRINTER` takes `tcp://host[:9100]`, `windows://ShareName` or `device:///dev/usb/lp0` (`03-F1`, `18 §10`). It has been driven against a loopback socket and a file and **never against a print head**, so nothing is known about cutter, feed, paper-out or whether a human can read the result (`27-F35`). Prefer `tcp://`: the two USB forms are write-only and cannot read `03-F40`'s paper sensor, so a roll that runs out reads as a *printed* ticket. |
| **A printerless till is not a QUIET till** | `RESTOS_STATION_ROUTES=*=screen` routes **kitchen stations** — those enqueue nothing at all (`03-F22`/`03-F51`). **Receipts and cash slips are not station-routed**, so with no `RESTOS_PRINTER` every settlement enqueues a receipt, burns three attempts and raises an **S1 alarm band the cashier clears by hand, on every sale** (`03-F5`/`03-F12`), plus one permanent `printer.status_changed(offline)` row on the first failure (`03-F54`). Shift close and day summary take a column refusal instead (35 and 34 columns against the 32 an unset `RESTOS_KOT_PRINTER` resolves to). **Teach the cashier that this band is expected and how to clear it**, or budget a real printer. There is no per-document equivalent of `03-F22`'s screen route. |
| **No LAN mesh host** | The till and the kitchen screen talk **through the cloud**. If the internet drops, the till keeps selling (it is offline-first and correct about that) and **the kitchen screen stops receiving orders**. Have a paper pad and a plan. |
| **Staff are a dev seed** | Three users — Ayesha and Bilal (cashiers) and Hina (manager) — each with **their own PIN**, set as `RESTOS_DEV_PIN`, `RESTOS_DEV_PIN_BILAL` and `RESTOS_DEV_PIN_HINA`. **Give each person different digits**, and leave none of them blank: a blank key means that person is absent from the grid, and a blank `RESTOS_DEV_PIN_HINA` means **the day cannot be opened at all**. You cannot add, rename or remove staff. There is no real staff roster yet. (⚠ Until August 2026 one `RESTOS_DEV_PIN` seeded all three, so the manager's authority sat behind the cashiers' digits — if you are upgrading a machine, set the two new keys or you will boot with one cashier and no manager.) |
| **The owner account is in memory** | It is re-created from env on every API restart. Any second account, and any unpublished draft menu edit, is lost on restart — including a power cut. Publish before closing the laptop. |
| **No TLS** | The gateway and the API are plain HTTP/WS on `0.0.0.0`. Keep them on the restaurant's LAN or behind a reverse proxy. Do not put port 8080 on the internet. |
| **No installer, no auto-update** | Both Windows machines run from a git checkout. Updating is `git pull && pnpm install` and a restart, by hand, per machine. |
| **No alerting** | The Auditor's findings and every service error go to the journal and nowhere else. `journalctl -u restos-jobs -p err --since yesterday`, weekly, by a human. |
| **No health endpoint** | "Is it up?" is answered by `systemctl status` and by looking at the till's honesty strip. |

**One thing the till does right that looks wrong:** the status strip says `Cloud OFF` when it
cannot reach the gateway, and the till keeps taking orders. That is correct and deliberate — a
sale is never blocked by sync. It will catch up when the link returns.

---

## How this kit was verified

Stated so the next person knows which parts are proven and which are asserted.

**Run and proven on Linux**, against a SQLite store written exactly the way the device store is
(WAL, `synchronous = FULL`, never closed):

| | |
|---|---|
| `id.sh` | mints, refuses to overwrite an existing file, `--force` overrides, mode 600 |
| `backup.sh` online path | 500 rows in, 500 rows out, one self-contained file per store |
| `backup.sh` fallback path | forced by making `better-sqlite3` unresolvable; copies db + `-wal` + `-shm`, restores 500 rows |
| refusal paths | no `RESTOS_BACKUP_DIR` → exit 2 · data dir not found → exit 1 · corrupt store → exit 1, empty directory removed, **no file left behind** · `pg_dump` absent → exit 1 · bad argument → exit 2 |
| retention | a 2020-dated backup is pruned at `KEEP_DAYS=30`; today's is kept; pruning is skipped entirely when the run failed |
| **multi-store discovery** (2026-08-15) | a simulated upgraded till — `Electron/device.db` (40 rows), `RestOS Counter/device.db` (500) + `print-spool.db` (7), `RestOS Pass/device.db` (120) — gives **3 directories found**, four backup files under three labelled subdirectories, every row count intact, exit 0. `RESTOS_TILL_DATA_DIR` still overrides to exactly one. One directory ⇒ no upgrade warning. Corrupt one store of three ⇒ **exit 1**, its subdirectory removed with nothing left behind, and the other two still backed up |
| the WAL claim | 500 committed rows: main file 4 KB, `-wal` 2 MB, and a copy of the main file alone opens with *"no such table"*. Overwriting the main file with random bytes still restored all 500 rows from the `-wal` — the same fact from the other side. ⚠ **That is the NEVER-CHECKPOINTED shape and it is the loud one.** Re-measured 2026-08-15 against two REAL till stores: one behaved exactly as above (no tables at all), the other — `device.db` 135 KB, `-wal` 45 KB — opened **clean, passed `integrity_check`, showed the full schema, and reported `events` = 0** with a *stale* staff snapshot. A copy that opens fine and shows zero sales reads as a quiet day, not as a destroyed backup. **Judge a till backup by counting `events`, never by whether it opens.** |

**Mutation, one branch at a time**, because a script that runs is not a script that protects:

| # | mutant | result |
|---|---|---|
| M1 | **the seam** — drop the `-wal`/`-shm` copy from the fallback | **caught the defect this kit exists for**: exit 0, a file written, looks like a backup, and the restore fails *"no such table"* |
| M2 | negative control — a real edit with no behaviour change | still restores 500 rows, so M1's kill is attributable |
| M3 | drop `sqlite-backup.mjs`'s read-back `integrity_check` | **SURVIVED** — `backup()` throws first on a bad source. The check is not the guard for that case; the comment in the file now says so instead of implying otherwise |
| M4 | drop `journal_mode = delete` from the copy | **survived the first probe and was killed by a directed one**: the artifact stays in WAL mode and the next *readonly* reader litters `-wal`/`-shm` beside it, which reads as the fallback having run |
| M5 | **the discovery seam** — `discover_data_dirs` back to the pre-fix `find … \| head -1` | **the defect this fix exists for**: on the three-store fixture it reports `till data directories found: 1`, backs up **two files of four**, prints `done.` and **exits 0**. The pre-rename store (40 rows) and the pass screen's (120) are simply absent, and which store survives is whatever the filesystem returned first — so on a real upgraded till the one thing "we have a backup" could mean is *the dead file* |

**NOT tested on this box, and nobody should assume otherwise:**

- **the Windows `.bat` files** — no Windows here. The env parsing (`for /f "eol=# tokens=1,* delims=="`)
  is written so `RESTOS_STATION_ROUTES=*=screen` survives with its `*=` intact, which is the one
  line most likely to be mangled, but that has been reasoned and not run. **The same is true of
  every `if not defined` gate in both files, including the identity gates added in August 2026**:
  they were read against `resolveDeviceIdentity` / `requireDeviceIdentity` and never executed.
  **Run each `.bat` by hand on the real machine before relying on the startup shortcut**, and check
  the till's boot line says `kitchen routes: configured`.
  - ⚠ **Every refusal in both files ends in `pause`, which WAITS FOR A KEYPRESS.** On an
    auto-logon machine with nobody in front of it that is a window that never returns and a till
    that never starts — the shape `01-F67` names one layer down (*"a refusal … does neither of
    those by waiting for a human"*). It is deliberate for a person doing the install by hand and
    wrong for the unattended restart these files exist for. **Reported, not changed here**: which
    way it should go is a judgement about the install ritual, not a doc correction.
- **the systemd units** — no systemd here. Syntax is conventional; `systemd-analyze verify
  /etc/systemd/system/restos-*.service` on the cloud box is the check.
- **`pg_dump` / `pg_restore`** — neither binary is on this box, so the cloud half of `backup.sh`
  has been exercised only through its two failure paths (absent DSN, absent `pg_dump`). Take one
  dump and restore it into a scratch database before go-live.
- **anything involving a real printer.** ⚠ *This read "no printer exists in this product or on this
  box" and the first half stopped being true in August 2026.* A transport ships (`RESTOS_PRINTER`,
  three cable forms) and has been exercised against a **loopback socket on port 9100** and against
  a **file**. No print head has ever received a byte from this code (K-8), so the cutter, the feed,
  the paper-out sensor, the column layout on real 58/80 mm stock and `27-F35`'s ≥85% comprehension
  gate are all unmeasured. Expect the first physical printer to cost real time.
