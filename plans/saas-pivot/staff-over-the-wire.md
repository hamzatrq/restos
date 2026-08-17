# Staff identity over the wire — build plan

Scope: a pilot restaurant's own people reach a till's `01-F61` identification grid and unlock with
their own PIN, replacing `packages/device-config/src/dev-staff.ts`'s three fictional people. Driven
by `plans/saas-pivot/plan-of-record.md:40` (R21), which names this a hard blocker because `01-F1`
makes attribution permanent.

Every claim below was re-measured against the tree on 2026-08-16/17 with `grep -a`. Where the four
layer maps and the adversarial challenge disagree, the challenge's evidence was re-run and is used;
the three places I found either of them wrong are marked **⚠ correction**.

---

## What is actually missing

### Layer A — the device (`packages/sync-client`, `apps/pos-electron`, `apps/pass-kds`)

**BUILT-BUT-UNREACHABLE — the registry is real and only the dev seed writes it.**

`createStaffRegistry` (`packages/sync-client/src/staff.ts:180`) is durable, versioned, monotone and
refuses rather than throws: `apply` at `:219` implements `01-F56` exactly — `malformed` at `:223`,
snapshot-older-is-`stale` at `:230` with a snapshot AT the held version accepted as the self-heal,
`needs_snapshot` on a base mismatch at `:240`. `STAFF_SCHEMA` (`:117`) is two STRICT tables spliced
into the device store and exposed as `store.staff` (`packages/sync-client/src/device-store.ts:575`).
`createPinSession` verifies against `registry.lookup(user_id).pin_hash` with Argon2id
(`packages/sync-client/src/pin-session.ts:179-183`), and `authorize.ts:254` re-reads the roster row
for **every** write to build the `can()` subject.

The write half has exactly one shipping caller, comment-blind and symbol-precise:

```
grep -arn "staff\.apply\|registry\.apply" apps services packages --include=*.ts --include=*.tsx | grep -v __acceptance__
packages/device-config/src/dev-staff.ts:212:  registry.apply({ kind: "snapshot", version: registry.version() + 1, members });
```

Eleven read sites across four non-test files (`apps/pos-electron/src/main/index.ts:777,1569`,
`main/authorize.ts:254`, `apps/pass-kds/src/main/index.ts:439,561,566`,
`apps/pass-kds/src/main/pass-identity.ts:142`). So this is a **port supplied with a stub**, where the
stub is three fictional people — AGENTS.md's named blind spot (ii), which `seams:check` cannot see
because `apply` is a member not an export and the seed is a supply. There is no `@unreached-owed`
marker anywhere in `staff.ts` (`grep -an "@unreached" packages/sync-client/src/staff.ts` → empty), so
the owed register does not carry this debt either.

**NOT BUILT, device side:**

| Missing | Evidence |
|---|---|
| A staff fetch accumulator (the `createCatalogFetch` analogue) | `packages/sync-client/src/catalog-fetch.ts:113` is the only one; nothing equivalent for staff |
| Any `staff_version` reconcile in the session | `reconcileCatalog` is `cloud-session.ts:258`; `grep -arn "staff_version" apps services packages` → **zero hits** |
| `grid_ordinal` on `StaffMember` | `staff.ts:29-50` is four fields; `list()` is `ORDER BY user_id` (`staff.ts:191`); `staff.ts:98-103` reports the gap rather than inventing the column. Specified by `01-F61` (`specs/01-kernel-sync.md:141`) |
| `01-F61`'s 05:00 deferral | `apply` at `staff.ts:219` lands immediately and unconditionally; `grep -an "01-F46" packages/sync-client/src/staff.ts` → nothing |
| A `divergent` refusal | `staff.ts:81-87` has three reasons; `catalog.ts:88-93` has four and detects it at `catalog.ts:369-382`. `staff_state` (`staff.ts:125-128`) holds `version` alone — no `last_kind`/`last_from`/form column to detect with |
| Any consumer of `StaffApplyResult` | `dev-staff.ts:137` types `apply` as returning `unknown` and `:212` discards it. No `staffRefusal`/`StaffHealth` anywhere: `grep -arn "staffRefusal\|StaffHealth" apps services packages` → zero, against the shipped chain `main/sync.ts:124` → `main/gateway.ts:385,447` → `CatalogHealth` |
| A device consumer for `purge_command` | Produced at `services/sync-gateway/src/gateway.ts:427,1094,1318`; the device drops it at the default arm — `packages/sync-client/src/cloud-session.ts:625`: `return; // … ping/pong/purge unused here`. **All four maps missed this and it is load-bearing**: `staff.ts:60-71` justifies hard removal over tombstoning by citing `01-F42`, and `01-F42`'s local purge does not exist on the device |

**The dev seed overwrites a real roster on every boot — and the guard that would stop it exists one
file away.** `seedDevStaff` applies unconditionally at `dev-staff.ts:212` with
`version: registry.version() + 1`, and `applySnapshot` does `clearAll` (`staff.ts:205-209`). The
zero-member guard at `dev-staff.ts:207-211` names the exact harm — *"a launch that forgot the
variables would wipe a roster a real transport had delivered"* — and guards only the case
`ops/startup/restos-counter.bat:120-129` (`goto refused` without `RESTOS_DEV_PIN_HINA`) makes
unreachable on every shipped Windows till. The menu seed has the correct guard:
`apps/pos-electron/src/main/catalog.ts:241` — `if (store.catalog.version() > 0) return false;`. The
challenge reproduced the consequence against real SQLite: after five boots the registry is at v5, a
real first snapshot at v1 is refused `stale`, and after a real roster lands at v99 the next boot
takes it back at v100. **This is AGENTS.md instance 15's shape — a guard that closed the instance and
not the class, stated in a comment — on the credential path.** Consequence for the transport: *the
version a publisher must beat is the number of times that till has booted*, a quantity no publisher
can know.

**A fifth roster declaration nobody has counted:** `apps/pos-electron/src/layout-gate/preload.ts:64`
declares its own `const STAFF: RosterMember[]`, served at `:479`. It lives in `src/` under a non-test
filename, so a sweep that deletes `dev-staff.ts` per its own instruction (`dev-staff.ts:62`, *"Delete
this the moment the staff transport lands"*) will miss it.

**The lockout does not interact with a roster change at all.** `applySnapshot` clears the `staff`
table only (`staff.ts:207`); `pin_attempts` is an independent table keyed `(device_id, user_id)`
(`packages/sync-client/src/pin-attempts.ts:52-60`). `unlock()` checks lockout *before*
`registry.lookup` (`pin-session.ts:167-180`), so an unknown or removed user returns `unknown_user`
(`:181`) and **records no failure** — unlimited attempts against a user_id not on the device.
Defensible (the grid is public) and chosen by nobody. `unlock()` also sets a module-local `user` that
only `expireIfIdle` clears, so **a roster change does not evict a live session** — but
`authorize.ts:254` re-reads assignments per write, so *authority* collapses to `[]` and fails closed
on the next act while the *session* persists.

### Layer B — the wire (`packages/sync-protocol`)

**NOT BUILT, entirely.** Exactly 14 message kinds, extracted rather than read:

```
grep -aon 'kind: z.literal("[a-z_]*")' packages/sync-protocol/src/messages.ts
127 hello · 142 hello_ack · 171 push · 174 push_ack · 192 event_batch · 193 catchup_request
196 catchup_response · 212 catalog_request · 236 catalog_response · 262 catalog_notice
267 quarantine_notice · 271 purge_command · 275 ping · 276 pong
```

`grep -arniE "staff|roster|person|credential|pin_hash" packages/sync-protocol/src/` → **zero lines**.
`hello_ack` (`messages.ts:140-171`) carries `catalog_version` at `:169` and no other version field.
Confirms the readiness audit's first claim without qualification.

**There is no generic expression of "reference data" on the wire.** All three reference-data kinds
are spelled `catalog_*`, and `catalog_response.entries` is hard-typed `z.array(CatalogEntryWire)`
(`messages.ts:242`). There is no resource discriminator. This is the fork §2 puts to the founder.

**⚠ correction to map 2:** it lists `packages/testing/src/sim-cloud.ts:271-288` as one of four
catalog dispatch sites. It is not — `grep -an 'case "' packages/testing/src/sim-cloud.ts` returns
four cases (`hello`, `push`, `catchup_request`, `ping`) and `grep -an catalog` on that file returns
nothing. **The simulator has no reference-data support at all**, so a staff transport cannot be
exercised through the harness without extending a fifth file nobody costed.

### Layer C — the cloud (`services/sync-gateway`)

**NOT BUILT: no publisher, no serve path, no version axis, no credential.**

- `grep -arniE "\bstaff\b|\broster\b" services/sync-gateway/src services/api/src` (non-test) → 8
  hits, **all prose inside comments** (`tenancy.ts:27,59,244`, `create-org.ts:44`,
  `create-owner.ts:16,23,45`, `quarantine-query.ts:12`). A mention is not an import.
- Eight `/internal` routes, none for users or staff:
  `services/sync-gateway/src/publish-http.ts:260,283,295,308,337,354,380,411`.
- `gateway.ts:1216` dispatches four inbound kinds; no `handleStaff` beside `handleCatalog`
  (`gateway.ts:1170`).
- No `pin_hash` anywhere on the cloud: `grep -arn "pin_hash|pinHash" services/` (non-test) → empty.
  `kernel.users` is eight columns (`services/sync-gateway/drizzle/0011_tenancy_users.sql:56-66`,
  `services/sync-gateway/src/schema.ts:462`): `user_id, org_id, email, display_name, password_hash,
  assignments, grid_ordinal, created_at`. `password_hash` is the back-office login credential
  (`services/api/src/router.ts:59`), a different credential from `01-F28`'s PIN by `01-F27`.
- **No version axis.** No `user_versions` table, no per-version row, no tombstone column;
  `created_at` is the only temporal column. So `catalogPage`'s SQL (`catalog.ts:274-376`, delta =
  `version > have and <= at`, snapshot = `distinct on … order by version desc`) is **not reusable
  against `kernel.users`** — the catalog's storage is an append-per-version publication log
  (`schema.ts:191,217`), and `kernel.users` is current-state.
- **No deactivation representation** — `14-F14` requires one, and no column can hold it.

**BUILT-BUT-UNREACHABLE:** `insertUser` (`services/sync-gateway/src/tenancy.ts:192`) has exactly one
caller, `create-owner.ts:212`; `listUsers` (`tenancy.ts:215`, ordered `grid_ordinal asc, user_id
asc`) has exactly one caller, `list-tenancy.ts:129`, a CLI. `createOwner` (`create-owner.ts:173`)
hardcodes `[{role:"owner", branch_id:null}]` at `:137` and refuses a second owner at `:186`, so it
**cannot create a cashier by construction**. `/internal/tenancy` (`publish-http.ts:337`) returns
`{ org, branches }` only — it does not close the read half.

**⚠ correction to the map's "no branch validation" framing, restated as the finding it is:**
`insertUser` parses through `PersonRecord` (`packages/domain/src/tenancy.ts:370`), which validates
`role` against `ROLES` and `branch_id` as a nullable id — **nothing checks the branch exists or
belongs to that org** (`0011` has no FK, by `01-F68`), and `grid_ordinal` has **no uniqueness
constraint** (`0011_tenancy_users.sql:71-74` declares two indexes, neither on `(org_id,
grid_ordinal)`). `listUsers`' tiebreak is then `user_id` — the derived ordering `01-F61` forbids,
reintroduced as a fallback. Both become live defects the moment users are writable.

### Layer D — the owner's surface (`services/api`, `apps/backoffice`)

**NOT BUILT.** `appRouter` (`services/api/src/router.ts:196-204`) has seven routers — auth, session,
catalog, devices, summary, tenancy, ops — and 16 procedures, none of which creates, edits,
deactivates or re-assigns a person. `TABS` (`apps/backoffice/src/components/workspace.tsx:32-36`) is
three entries: menu, devices, summary. `specs/28-tenancy.md:132` measured the same independently.

**⚠ correction to map 4 and to the readiness audit's framing.** *"The durable writer throws by
design"* is true (`services/api/src/users-postgres.ts:167`) and **weaker than it sounds**:
`setAssignments` has **zero shipping callers**. `grep -arn "setAssignments" apps services packages
--include=*.ts` → declaration `users.ts:66`, memory impl `users.ts:83`, the throw
`users-postgres.ts:167`, and two *test* call sites (`__acceptance__/authz.test.ts:265,274`). A session
told "the writer throws" may implement it and have changed nothing, because there is no procedure, no
route and no screen above it. The `UserStore` port itself (`users.ts:53`) has three methods —
`findByEmail`, `findById`, `setAssignments` — and **cannot express create, deactivate, set-PIN or
list**. The read half *has* landed and is wired (`users-postgres.ts:133,149`;
`services/api/src/server.ts:280`), which `services/sync-gateway/CLAUDE.md` still denies.

**Hard blocker upstream of every procedure:** `PERMISSION_ACTIONS`
(`packages/domain/src/permissions.ts:109-151`) is 25 actions and none matches `/user|staff|person|
role/`. `authorized()` takes a `PermissionAction`, so a user procedure does not typecheck; and
`assertEveryProcedureIsGated` (`router.ts:228`) refuses to boot a host carrying an ungated one.
Neither exemption list is available — `PUBLIC_PROCEDURES` is `{auth.login}` (`router.ts:30`).

**Second hard blocker:** `user.changed` has **no payload schema in `domain`**. Runtime check:
`eventRegistry.has("user.changed")` → **false**; `has("catalog.changed")` → true. `01-F4` makes
producing an unschema'd type a build-time *and* runtime error, so `14-F2`'s ledgered write is
**unbuildable rather than unbuilt** — `05-F7`'s and `28-F14`'s state exactly. The *type* is legal and
org-scoped (`specs/01-kernel-sync.md:216`, `services/sync-gateway/src/org-events.ts:32-38`), and
`appendOrgEvent` (`org-events.ts:86`) would accept one today; the refusal is at the emitter.

**Third blocker, small and total:** `kernel.users.email` is `NOT NULL` and unique **case-folded and
globally** (`0011_tenancy_users.sql:59,71`). A cashier who only taps a tile has no business email, so
the CRUD would have to invent one.

### Layer E — the harness

`packages/testing/src/sim-cloud.ts` has no reference-data support (above), so H-01 rung coverage for
a staff transport does not exist and is not free.

---

## Spec changes required FIRST (commandment 9)

**Already specified — do NOT write a redundant FR for any of these:**

- **That the roster travels as versioned snapshots + deltas on the sync channel** — `01-F21`
  (`specs/01-kernel-sync.md:50`) and `01-F52` (`:107`), with `01-F61` (`:142`) saying the staff
  record *"rides the same `01-F21` reference-data chain"*. ⚠ State the reading rather than inheriting
  it: `01-F21`'s own enumeration is **catalog entities only** (Category → MenuItem → … → Supplier)
  and does not name staff. `01 §5` (`:229`) is the stronger anchor — Device SQLite holds
  `reference_data (catalog/users snapshot + version)` — and it has said *users* since Draft 1.
- **That PIN verification is offline against synced hashes** — `01-F28` (`:61`). Built.
- **That a staff record carries `grid_ordinal`, that new members append, and that roster changes land
  at the `01-F46` 05:00 boundary** — `01-F61` (`:141`), verbatim. Nothing new is needed to justify
  the field or the deferral; only *where* the deferral is enforced is open (S5).
- **That a staff record carries `display_name`** — `01-F61` (`:142`).
- **That refusal is monotone and observable in device health** — `01-F56` (`:111`).
- **That the person record is one record with one name, resolved at render time, never deleted** —
  `11-F20` (`specs/11-staff-people.md:53-59`).
- **That user CRUD with role × per-location assignment, PIN set/reset and deactivation is the back
  office's** — `14-F14` (`specs/14-backoffice.md:103`).
- **That `user.changed` is a legal, org-scoped type** — `01 §4` (`:216`) and `01-F62` (`:130`). No
  `01 §4` amendment is required. Its *payload schema* is a different thing (S7).

**Is the message vocabulary declared closed? YES, and adding a kind is a spec-level act.** Three
independent statements: `packages/sync-protocol/PROTOCOL.md`'s `purge_command` row says in terms
*"no purge-ack wire kind exists (the message set stays closed)"*; `20 §2.7`
(`specs/20-testing-correctness.md:46`) makes the golden fixtures the wire contract, and
`packages/sync-protocol/src/__acceptance__/fixtures.test.ts:1-6` states that changing one *"requires
a spec review of specs/01-kernel-sync.md §8 / PROTOCOL.md"*; and `plans/saas-pivot/plan-of-record.md`
R22 treats *"one new `packages/sync-protocol` message kind"* as a named consequence of a founder
ruling rather than an implementation detail. So every kind added below carries a doc-01 §8 +
PROTOCOL.md change and a fixture.

**⚠ One corpus statement is already contradicted by shipped code and must be resolved, not quietly
ignored.** `01 §8` (`specs/01-kernel-sync.md:253`) says *"Reference-data distribution reuses the
event channel (config/catalog versions as events) — **one replication path to test, not two**."* The
catalog does not do this: it has its own frame pair (`messages.ts:212,236,262`) plus
`hello_ack.catalog_version`. A staff transport is the **third** divergence from that tech note, so
the note is either amended or the fork below is decided against it.

### S1 — Where the device-plane PIN hash lives on the cloud, and whether it may cross the wire
**Document:** doc 11 (extends `11-F20`'s required minimum) with a `00 §5.4` cross-reference; the
storage column is doc 14/doc 01 downstream of the ruling.
**Why the corpus does not decide it:** `11-F20:57` says the record carries *"the credential each
plane needs (`15-F26`'s email + password on the cloud plane, `01-F28`'s PIN hash on the device
plane)"* — which names both credentials without saying the **cloud** stores the device one, and
`PersonRecord` (`packages/domain/src/tenancy.ts:370`) excludes both by explicit decision. `01-F28`
requires "synced credential hashes" and therefore a source. No FR names a column, a table, a writer
or a wire rule; `grep -arn "pin_hash" services/` is empty.
**Question for the founder:** *Does the cloud store an Argon2id PIN hash beside the back-office
password hash on one `kernel.users` row read by two services, or in a separate credential table with
its own writer? And may that hash cross the wire inside an org-wide roster snapshot served to any
unrevoked device (`gateway.ts:1170-1181` is the gate today), given `01-F74` (a) already decided the
device roster must be cloud-**signed** so a relaying hub cannot forge it?*

### S2 — The wire fork: `staff_*` kinds, or a resource-discriminated reference-data frame
**Document:** doc 01 §8 + `packages/sync-protocol/PROTOCOL.md` (`20 §2.7` spec review). Protected
path.
**Why the corpus does not decide it:** `01-F21`/`01-F52`/`01-F74` (b) all say *"the same sync
channel"*, which reads generic and is implemented catalog-specific (`messages.ts:242` hard-types
`entries` to `CatalogEntryWire`). Two reference-data types **already exist device-side with no wire
at all** — `StaffUpdate` (`staff.ts:74`) and `RosterUpdate` (`lan-roster.ts:98`) — and
`lan-roster.ts:20-26` claims all three ride *"one chain, not a third bespoke one for credentials"*,
which **is false at the wire today**. That is a shipped comment promising a protection that does not
exist, the class AGENTS.md records as worse than none.
**Question for the founder:** *Three new kinds (14 → 17, and `01-F74`'s device roster makes 20 next
year), or one breaking generalisation of `catalog_request`/`catalog_response`/`catalog_notice` into a
resource-discriminated frame — a wire-contract change with three committed fixtures and an N−1
reader (`00 §6`)? Deciding by default is how one shape gets three writes.*

### S3 — Is the staff roster org-scoped or branch-scoped?
**Document:** doc 01 (the FR that mints the message), decided in the same PR as S2.
**Why the corpus does not decide it:** `01-F52` makes the catalog explicitly org-scoped and
`gateway.ts:1259-1262` deliberately crosses branch boundaries because of it; `01-F26` makes
assignments per-location; `01-F71` (d) keys fan-out on `(org, branch)`; `03-F53` lets any member of
the *branch* roster identify at the pass. Nothing rules for staff, and `01-F60` records that a
branch-scoped artifact means one version number meaning different bytes on different devices.
**Question for the founder:** *Does every till in the org hold every branch's PIN hashes (the
catalog's answer, one artifact, byte-identical), or does a branch device receive only its branch's
people (smaller credential blast radius, at the cost of a version number that is not global)?*

### S4 — Deletion: the device already chose hard removal and `11-F20` says never delete
**Document:** doc 11 or doc 14 (whichever owns the exit), cross-referenced from the S2 FR.
**Why the corpus does not decide it — this is a live conflict, not a gap.** `staff.ts:60-71` removes
the row outright, citing `01-F42`/`01-F48` fail-closed, and applies a snapshot with `clearAll`
(`staff.ts:207`). `11-F20:59` says *"A person record is never deleted"* and `11-F20:57` says names
resolve at **render time** from the roster — so a removed cashier's past orders render a raw UUID
(`apps/pos-electron/src/main/index.ts:777` degrades to `user_id`). `14-F14` says deactivation
preserves historical attribution. The catalog resolved the same question the other way (tombstones,
`01-F55`, `CatalogEntryWire.deleted` at `messages.ts:72`).
**Question for the founder:** *Does a let-go cashier's name still render on last month's orders? If
yes, the device's removal semantics are wrong and the wire needs a status/tombstone rather than a
removals list; if no, `11-F20`'s "never deleted" applies only to the cloud record and that must be
said.*

### S5 — Who enforces `01-F61`'s 05:00 boundary
**Document:** doc 14 (the writer) or doc 01 (the wire), one clause either way.
**Why the corpus does not decide it:** `01-F61:141` requires the boundary and borrows `14-F28`'s
ruling without restating the mechanism. `14-F28`'s answer for menus resolves **above** the writer, in
a staging surface that can still be cancelled, *precisely so devices need no scheduler*
(`services/sync-gateway/src/catalog.ts:94-99`). The alternative — an `effective_at` on the wire that
each device schedules — is the design that comment explicitly rejected.
**Question for the founder:** *Staged above the publisher like a menu edit, or an effective-at on the
roster artifact? Note a real asymmetry the menu does not have: a mid-shift **removal** is a security
act, and deferring it to 05:00 keeps a fired cashier's PIN live for up to a day.*

### S6 — The permission action for user management
**Document:** doc 14, next free number **14-F39** (doc 14's highest is `14-F38`). **The destination is
already ruled and must not be re-argued elsewhere:** `specs/28-tenancy.md:133` files this gap and
says *"Owed to doc 14 by name … `14-F30` (`device.manage`), `02-F46` (`availability.toggle`) and
`02-F47` (`customer.record`) each landed the missing action in the FR that owns the surface"*, and
that deciding it in doc 28 *"would put the action in the wrong doc"*.
**What it must decide:** the action's name, one action or a read/write split, and its cells.
`14-F30`'s recorded test — *"four identical cells differ in nothing an implementation can observe"* —
must be **run** here, not assumed.
**Question for the founder:** *Owner-only, or does a branch manager get scoped user management? Doc
14 §9's first open question (`specs/14-backoffice.md:218`) names exactly this axis, and the failure
directions are asymmetric: a manager who can create users can create herself an owner, or reset the
owner's PIN.*

### S7 — The `user.changed` payload schema
**Document:** doc 14 declares it (it owns `14-F2` and `14-F14`, and doc 14 §2 already lists
create / role change / PIN reset with *"PINs … never present in payloads"*); doc 01 absorbs it. This
is `28-F14`'s stated routing for `config.changed` applied unchanged, so it is a **routing fact, not a
founder question**. Note the shipped precedent for the *location*: `device.revoked`'s payload is
declared locally in `services/api/src/devices.ts:83-96` because `domain` ships no org-scoped schemas
— follow it or state why not.

**RESOLVED 2026-08-17 by following the precedent, and re-measured rather than inherited:**
`grep -an "device.revoked\|config.changed" packages/domain/src/registry.ts` is empty, so `domain`
really does ship none — the precedent is the whole rule, not one exception. The payload is therefore
declared in `services/api` beside its emitter, which moves it **out of step 2 and into step 4**. The
content of the payload is the part still open, and it is open on one axis only: `14 §2` says PINs are
*"never present in payloads"*, so what remains is which of create / role change / deactivation /
PIN-reset are distinguishable in the event and whether the before-state is carried. `01-F1` argues for
carrying enough that the row is legible long after the record it describes has changed — the reasoning
`DeviceRevokedPayload` states for carrying `branch_id` and `device_class` it does not strictly need.

### S8 — Does a till-only cashier need an email?
**Document:** doc 11 (the person record's required minimum) — `11-F20:57` lists the minimum and does
not include email.
**Why the corpus does not decide it:** `kernel.users.email` is `NOT NULL` and globally unique
(`0011_tenancy_users.sql:59,71`), and `0011:50-53` records the global-uniqueness reasoning and leaves
multi-org as an open question. Nothing says a cashier has one.
**Question for the founder:** *Is a cashier a full account with an email, or a person record whose
only credential is a PIN? The second requires making `email` nullable, which changes the login
lookup's assumptions.*

### S9 — What a till does with a roster it cannot fetch, or one that is old
**Document:** doc 01, one clause on the S2 FR.
**Why the corpus does not decide it:** `01-F74` (d) draws exactly this line for the **device** roster
(*"stale is not unreadable"* — verifying-but-old admits and surfaces its age; absent or corrupt
refuses). No clause draws it for the **staff** roster. `01-F17` forbids a stopped till; `01-F48`
makes revocation fail-closed. Both apply and they point opposite ways.
**Question for the founder:** *A till whose roster is a week old — does it admit unlocks (and a fired
cashier keeps selling), or refuse them (and the branch cannot open)?*

**Not a spec change, and named so nobody writes one:** the dev-seed overwrite (Layer A) is a bug
against `01-F21`'s own model, fixable with the guard that already ships at
`apps/pos-electron/src/main/catalog.ts:241`. The missing `grid_ordinal`, the missing `divergent` case
and the missing health surface are all covered by `01-F61` and `01-F56` respectively; they are code,
not corpus.

---

## The build, sequenced

Steps 0–2 are unblocked today. Steps 3+ require the rulings named.

**Step 0 — stop the seed destroying a real roster.** Changes `packages/device-config/src/dev-staff.ts`
(add the version guard `catalog.ts:241` already ships) and corrects the comment at `:207-211` to name
the class it closes and the case it does not. Closes nothing; it is a prerequisite for every later
step being observable. **Not protected** (`device-config` is not in `20 §4.4`'s list). **Preconditions:
none.** ⚠ The guard alone leaves the seed's inflated version in place on existing dev tills — the
step must also decide what a device holding v5 of fiction does when a real v1 arrives, which is the
same question as S9's stale case, one boot earlier. Acceptance suite: a separate session per `24 §3`,
because the assertion that bites is "seed does NOT apply", and a fixture that only ever seeds an empty
registry cannot see it.

**Step 1 — remove the fifth roster declaration from the delete-sweep's blind spot.** Changes
`apps/pos-electron/src/layout-gate/preload.ts:64` only by *documenting* that it is fixture data (or
moving it under a test-named path). Closes nothing. Not protected. No suite.

**Step 2 — the permission action (`14-F39`).** Changes `packages/domain/src/permissions.ts:109` only
(+1 action, + its Appendix-A-precedent cells). Closes **S6** and unblocks every procedure.
**PROTECTED — `packages/domain`.** **Preconditions:** S6 ruled.
**`24 §3` acceptance suite from a separate session**, and it must include the 55-cell-sweep shape
`permissions.ts` already carries plus a mutant that widens the action to `branch_manager`.

⚠ **correction — S7 does NOT belong in this step, and coupling them was wrong.** This step read *"the
permission action **and** the `user.changed` payload schema"* and offered `packages/domain/src/registry.ts`
as one of two homes for the schema. Re-measured 2026-08-17: `grep -an "device.revoked\|config.changed"
packages/domain/src/registry.ts` is **empty** — `domain` ships **no** org-scoped payload schema at all,
and `services/api/src/devices.ts:83-96` records why in its own doc comment (`01 §4` puts payload schemas
in `domain`, `domain` ships none for the org-scoped family, so re-declaring one there for a single
reader would be the larger change). S7's own text already said *"follow it or state why not"*. So the
`user.changed` payload is declared beside its **emitter**, which is **step 4**, and it is moved there.
Two things follow: step 2 is now a single-concern change to one protected file, which is what a
protected-path review wants; and the schema lands in the same PR as the procedure that emits it, so
`01-F4`'s unemittable-without-a-schema gap cannot be closed on paper by a declaration nothing produces —
which is `audit.print_acknowledged`'s recorded shape (a key in a registry with no producer) and the
blind spot `seams:check` names as *"a missing PRODUCER for an event type"*.

**Step 2b — the authorization subject reads the participation status (`11-F22`). ⚠ NEW, added
2026-08-17, and it is a FAIL-OPEN sitting between two steps that were sequenced without it.**
Changes `packages/domain/src/permissions.ts` — `AuthSubject` is `{ user_id, org_id, assignments }`
(`:63-67`) and has **no status field**, so it cannot express the clause `11-F22` spends a paragraph
writing the wide way on purpose: *"the authorization subject reads the status too, so an inactive
person authorizes nothing even from a session that predates her deactivation."*
**PROTECTED — `packages/domain`.** **Preconditions:** none beyond `11-F22`, which is written.
**`24 §3` acceptance suite from a separate session.**

**Why it is a step and not a clause inside step 7.** Today `subjectOf` (`apps/pos-electron/src/main/authorize.ts:254`)
builds `can()`'s subject from the roster row, so **hard removal is the mechanism that currently ends a
person's authority** — the row goes, `assignments` becomes `[]`, the next write fails closed. R26 and
`11-F22` retain the row. So the instant step 7 lands the retained-row shape, every deactivated
person gets her full assignments back and goes on recording payments, pay-outs and refunds into an
append-only ledger (`01-F1`, `02-F41`), permanently and uncorrectably. `11-F22` states this outcome
itself: *"removing the mechanism that fails closed without replacing it is not a smaller change than
the defect it fixes."*

**The ordering constraint, stated as a constraint rather than left to the reader:** 2b lands **before**
step 7, and step 7 must not ship the retained-row shape until it has. Sequencing them the other way
is green at every gate and is a live authorization hole for the length of the gap. It was found by the
step-2 oracle author, who correctly asserted **nothing** about it rather than inventing the field's
shape — it is `11-F22`'s change, not `14-F39`'s, and taking it as a drive-by inside step 2 would put a
second protected-path change to the matrix under a review scoped to a permission row.

**Step 3 — the cloud version axis and the PIN credential.** Changes `services/sync-gateway/drizzle/`
(a new migration: the `user_versions`/`user_entries` publication pair on `catalog_versions`'s shape at
`schema.ts:191,217`, the PIN credential per S1, a deactivation representation per S4), `schema.ts`,
`tenancy.ts`. Closes the storage half of `01-F28` and `14-F14`'s deactivation clause. Not a protected
path by `20 §4.4`'s list, but it is **auth data**, so treat it as one. **Preconditions:** S1, S3, S4,
S8. ⚠ It must also add the two constraints Layer C found missing — org-scoped uniqueness on
`grid_ordinal`, and a writer-side check that an assignment's `branch_id` is a branch of that org —
because `01-F61`'s ordinal and `01-F71`'s isolation both become live the moment users are writable.

**Step 4 — user CRUD: gateway writer + `/internal/users*` + tRPC router + back-office screen.**
Changes `services/sync-gateway/src/tenancy.ts` and `publish-http.ts` (a ninth and tenth route beside
the eight at `:260-411`), `services/api/src/` (a `UserDirectory` port + gateway adapter + router,
copying `device-router.ts:33` / `devices.ts:98` / `gateway-client.ts:388` verbatim in shape), and
`apps/backoffice/src/components/workspace.tsx:32` (+1 tab). Closes **`14-F14`**, **S7** — the
`user.changed` payload schema is declared here, beside its emitter, on `DeviceRevokedPayload`'s
precedent (`devices.ts:83-96`), moved out of step 2 for the reason recorded there — and unblocks R21.
Not protected. **Preconditions:** steps 2 and 3. **`24 §3` suite from a separate session**, and it must
assert a **producer** for `user.changed`, not merely that the schema parses: a payload schema with
nothing emitting it is `audit.print_acknowledged`'s shape and `seams:check` is blind to it by
construction.
⚠ `UserStore` (`services/api/src/users.ts:53`) cannot express this; do not widen it — it is the
login-time port. And do not "fix" `setAssignments`: it has zero shipping callers and fixing it
changes nothing.

**Step 5 — the wire (S2's answer).** Changes `packages/sync-protocol/src/messages.ts`,
`PROTOCOL.md`, `builders.ts`, `+1..3` golden fixtures, and — if S2 chooses generalisation — the three
existing catalog fixtures and an N−1 reader. Closes the transport half of `01-F21`/`01-F28`.
**PROTECTED — `packages/sync-protocol`, and `20 §2.7` requires the spec review named in
`fixtures.test.ts:1-6`.** **Preconditions:** S2, S3 ruled; doc 01 §8 + PROTOCOL.md amended
(commandment 9 — the message does not exist until the spec says it does). **`24 §3` suite from a
separate session**, and the fixtures are the contract, so their author must not be the implementer.

**Step 6 — the gateway serve path.** Changes `services/sync-gateway/src/` — a `staffVersion`
/`staffPage` pair on `catalog.ts:74,274`'s shape, a `handleStaff` beside `gateway.ts:1170` taking
**both** existing read gates (`requireUnrevoked` and the drain refusal at `:1175-1181`), a
`notifyStaffVersion` on `gateway.ts:1258`'s fan-out walk **declared REQUIRED** in the deps bag
(`publish-http.ts:170`'s precedent, and `server.ts:67`'s comment records why), and the
`hello_ack.staff_version` emit beside `gateway.ts:504-513`. Closes the serving half. Not protected.
**Preconditions:** steps 3 and 5. **`24 §3` suite from a separate session.**

**Step 7 — the device fetch and apply.** Changes `packages/sync-client/src/` — a staff accumulator on
`catalog-fetch.ts:113`'s shape (with its own `toMember`), a `reconcileStaff` beside
`cloud-session.ts:258` reading `hello_ack.staff_version` at `:476`, the `staff_notice` arm, and
`staff.ts` gaining `grid_ordinal` (`01-F61`) and the `divergent` detection `staff_state` currently
cannot hold (`staff.ts:125-128`). **PROTECTED — `packages/sync-client`.** **Preconditions:** steps 5
and 6, plus S5 (the 05:00 deferral changes where `apply` lands). **`24 §3` suite from a separate
session**, and per the round-3 law it must be **mutation-proved**: build a plausible implementation
out of tree, take the suite green, then break each assertion's specific claim.

**Step 8 — the honesty surface.** Changes `apps/pos-electron/src/main/sync.ts:44,124` and
`gateway.ts:148,385,447` — a `staffRefusal` getter, **required and a getter**, on `catalogRefusal`'s
recorded reasoning (`main/gateway.ts:140` names the stub hazard by name), rendered beside
`CatalogHealth`. Closes `01-F56`'s *"observable in device health"* for the roster. Not protected.
**Preconditions:** step 7.

**Step 9 — retire the seed.** Changes `packages/device-config/src/dev-staff.ts` (delete),
`apps/pos-electron/src/main/index.ts:660`, `apps/pass-kds/src/main/index.ts:237`, and **both**
`ops/startup/*.bat` — `restos-counter.bat:120-129` currently `goto refused` without
`RESTOS_DEV_PIN_HINA`, so deleting the module without touching the script produces a Windows till
that will not boot at 05:00. **Preconditions:** step 8 proven on a real pilot till, not a suite.

**Step 10 — the harness.** Extend `packages/testing/src/sim-cloud.ts` (four cases at `:274-283`) with
reference-data support. Nothing in H-01 can exercise this transport until it exists; it is not
optional and it is not free.

**Deliberately NOT in this sequence:** the LAN path. `packages/sync-client/src/mesh-session.ts`
handles no `catalog_*` kinds, so reference data has never had a LAN path; adding one for staff first
would be a new posture decided by accident. `00 §5.1` forbids an in-branch feature requiring WAN, so
this is owed — as a separate ruling, alongside `01-F74` (a)'s signing, which exists precisely so a
relaying hub can carry reference data without forging it.

---

## The trap list

1. **Implementing `setAssignments` and believing something changed.** It throws at
   `services/api/src/users-postgres.ts:167` and has **zero shipping callers** (only
   `__acceptance__/authz.test.ts:265,274`). The comment reads like the last blocker; it is not on the
   path at all. Grep for the production caller before you call it the blocker — this file's own
   closing evidence for the wave's named defect.
2. **Smuggling staff rows down `catalog_response`.** `CatalogEntryWire.kind` is `z.string().min(1)`
   (`messages.ts:50`) — **open at the wire** — so `kind: "staff"` rows would publish. The device then
   refuses them against a closed set (`catalog.ts:190-204`) and, because validation is
   `entries.every(isEntry)` (`catalog.ts:259-264`), **one staff row makes the whole update
   `malformed` and stops every till in the org updating its menu, permanently**. Beyond that: the
   catalog is served to any unrevoked device of the org (`gateway.ts:1170-1181`) and stored in a plain
   table the item grid reads, so this is a credential-blast-radius change wearing a save.
3. **A publisher that starts at version 1.** Every dev till's `staff_state.version` is *the number of
   times it has booted* (`dev-staff.ts:212` increments unconditionally), so a real v1 snapshot returns
   `{applied:false, reason:"stale"}` (`staff.ts:230`) — **silently, and the refusal is discarded by
   its only caller** (`dev-staff.ts:137` types `apply` as `unknown`). Nothing on the glass will say
   so. Step 0 exists to remove this before it is diagnosed as a transport bug.
4. **`notifyStaffVersion` with no production caller.** This exact defect shipped for the catalog:
   `publish-http.ts:152` records `notifyCatalogVersion` having *"zero production callers"* while two
   acceptance tests passed, so *Apply now* reached a connected till only on its next reconnect. And
   the **fix for it reproduced the defect inside itself** — the first notice seam test mounted its own
   wiring and survived the mutant where `server.ts` wires a no-op. Declare the member **required**
   (`publish-http.ts:170`), and mutate the seam in `server.ts:74`, not the logic.
5. **Making `staff_notice` load-bearing.** `PROTOCOL.md`'s `catalog_notice` row: *"Freshness only,
   never correctness. The system is correct if every one of these is dropped."* The correctness
   mechanism is `hello_ack` (`messages.ts:160-169`). A design that reconciles the roster only on a
   pushed notice gives you a till nobody can sign in to after a lossy week — `01-F17`'s stopped till
   arriving through the identity path.
6. **A fixture that answers its own question.** `K-4`'s recorded failure was varying `spec` and
   `profile` across ~90 renders and **never varying `data`**. Here the equivalent is a staff suite that
   only ever applies a snapshot to an **empty** registry: it cannot see the seed collision (trap 3),
   the `stale` path, `needs_snapshot`, or a removal. And `layout:check`'s own boundary applies —
   the fixture is the coverage boundary, not the assertions.
7. **An oracle asserting a hand-copy of the wire schema.** `K-3` declared the `Transport` interface it
   existed to deliver and then asserted against a hand-copy; both oracle symbols were dead exports.
   `messages.ts:35-46` records the *production* version of the same lesson — `CatalogEntryWire` is
   exported deliberately **so the writer validates against it**, after one blank name from a bulk
   import put a whole org into a reconnect loop. A staff wire schema only the device parses
   reproduces that, and for credentials the blast radius is a branch that cannot sign in.
8. **Copying `catalogPage`'s SQL onto `kernel.users`.** The catalog's storage is an append-per-version
   publication log (`schema.ts:191,217`); `kernel.users` is current-state with **no version column**
   (`0011_tenancy_users.sql:56-66`). The delta query (`catalog.ts:330`) and the
   `distinct on … order by version desc` snapshot (`:355`) have nothing to run against. "It's just the
   catalog again" is true of layers 1–3 and false of layers 4–5, which are the two that cost money.
9. **Believing `seams:check` will catch any of this.** `createStaffRegistry` is reached
   (`device-store.ts:575`), `apply` is a member not an export, and the dev seed **is a supply** — so
   the rail is clean today and carries no `@unreached-owed` marker on `staff.ts`. This is exactly the
   documented blind spot (ii), *a port supplied with a stub*. The assertions have to be hand-written.
10. **Assuming `01-F42`'s purge protects the removal design.** `staff.ts:60-71` justifies hard removal
    partly on `01-F42`, and `purge_command` is produced three times by the gateway
    (`gateway.ts:427,1094,1318`) and **consumed by nobody** — the device drops it at
    `cloud-session.ts:625`. A revoked till keeps its full roster of Argon2id hashes indefinitely. A
    producer with no consumer, the wave's defect with the arrow reversed, and all four maps missed it.
11. **Charging a lockout to the wrong person during the cutover.** `pin_attempts` is keyed
    `(device_id, user_id)` (`pin-attempts.ts:52-60`) and is untouched by `applySnapshot`
    (`staff.ts:207`). A wholesale identity replacement orphans every row; a removed-and-re-added user
    returns with their lockout intact. Neither was chosen. And `unlock()` checks lockout **before**
    `registry.lookup` (`pin-session.ts:167-181`), so attempts against a user not on the device are
    unlimited and uncounted.
12. **Deriving `grid_ordinal` when the CRUD assigns one.** `listUsers` orders `grid_ordinal asc,
    user_id asc` (`tenancy.ts:224`) and there is **no uniqueness constraint** (`0011:71-74`), so a
    collision falls back to `user_id` — the exact derived ordering `01-F61:141` forbids and whose
    first build had this bug, *"invisible to a test that only re-renders the same roster, which is
    precisely how it survived review"*.
13. **Reading a package guide as current.** `services/sync-gateway/CLAUDE.md` still says the owner
    *"cannot yet sign in"*; the read half landed (`users-postgres.ts:133,149`, wired at
    `services/api/src/server.ts:280`). This file's record shows staleness in **both** directions, and
    a stale claim propagates fastest through the person fixing a different stale claim beside it.
14. **`grep` under a C locale.** Every file quoted here contains `—`, `⚠`, `₨`. Without `-a` you get
    `Binary file … matches` **instead of** the matching lines, and a live call site reads as a dead
    export. Reproduced in this repo on `apps/backoffice/src/components/catalog-screen.tsx`.

---

## Findings from the oracle round (2026-08-17) — reported, not fixed

Two acceptance suites were authored from spec text by separate sessions, each mutation-proved by a
third, and the pair read by a completeness critic. What follows is what they found in **shipped code
and in this plan** and were correctly forbidden from fixing. Each names its owner.

1. **`describeDevStaff` takes an environment and no registry, and both hosts discard the seed's return
   value.** `apps/pos-electron/src/main/index.ts:660` and `apps/pass-kds/src/main/index.ts:237` are
   bare `await seedDevStaff({…})`; the boot line is `describeDevStaff(process.env)` at
   `index.ts:1026` / `:560`. So **after step 0's guard lands, a pilot till holding a real roster still
   prints `staff: 3 seeded — Ayesha, Bilal, Hina`** while the seed silently stood down and none of the
   three is on the device. The refusal becomes correct and stays invisible — which is trap 3's
   *"nothing on the glass will say so"* surviving trap 3's fix. **The precedent the plan names already
   solves this half:** `apps/pos-electron/src/main/catalog.ts:248` is `return result.applied`, i.e.
   `seedDevMenu` *consumes* the apply result, while `dev-staff.ts:137` types it `unknown`. Copying only
   the guard copies half the function. **Owner: step 0's implementer** (both changes are signatures,
   which is why no oracle could assert past the implication).
2. **The same root cause produces an actively FALSE warning, and it is the loudest line on the boot
   output.** `describeDevStaff` decides its `02-F22` clause from `configured.some(m => m.role ===
   "branch_manager")` — the environment. A till holding a real roster *with* a manager, launched
   without `RESTOS_DEV_PIN_HINA`, prints *"⚠ NO BRANCH MANAGER IS SEEDED … no shift can open and no
   sale can be recorded"*. **Owner: step 0's implementer**, same change as (1).
3. **`packages/device-config/CLAUDE.md:9` describes a retired credential shape.** It says *"`DEV_PIN_ENV`
   (`RESTOS_DEV_PIN`) carries it"* — one key for the whole roster. The live contract is
   `DEV_STAFF_PIN_ENV`, **one key per member, pairwise distinct, no fallback** (`dev-staff.ts:38-61`,
   `:114-118`) — precisely the authorization hole closed in August 2026. A session routed by that
   bullet configures one variable and gets one cashier while believing it has a roster. **Owner:
   step 0's implementer** (it is that package's guide).
4. **Two shipped comments argue for the behaviour step 0 removes.** `dev-staff.ts:145-150` (*"`version()
   + 1`, never a literal, and this is the restart case rather than a style point"*) and
   `packages/device-config/CLAUDE.md:9` repeating it. Both are *correct about the failure they
   describe* and both become false the moment a guard lands. Left in place they are the class this
   repo names as worse than no comment — a shipped comment stating a rule that no longer holds retires
   the assertion the next session would otherwise write. **Owner: step 0's implementer, in the same
   change.**
5. **`packages/domain/src/__acceptance__/device-permission.test.ts` has a vacuity hole, and its own
   published mutation table proves it arithmetically.** Six of its refusal tests never assert
   `device.manage` is IN `PERMISSION_ACTIONS`, so they are satisfied by `can()`'s unknown-action
   fallback and **survive the mutant that deletes the action they are about** — `packages/domain/CLAUDE.md`'s
   row D3 reports 5 of 15 killed, and the 5 are exactly the allow-expecting assertions plus the two
   declaration tests. Not a defect in the shipped matrix, and **not this round's to fix — it is another
   session's oracle (`24 §3`)**. It generalises to every FR-decided action: `device.manage`,
   `availability.toggle`, `customer.record` and now `user.manage` all have the shape. **Owner: that
   suite's test session.**
6. **Nothing asserts `user.manage` ever acquires a production caller** — trap 1, and `seams:check` is
   structurally blind because *an added member of an existing array is not a new export*, so Rule A
   gains no candidate and Rule B gains no seam. A matrix row with no caller is the wave's recurring
   defect, instance sixteen. **Owner: step 4's suite**, which builds the procedure — recorded here so
   it is not discovered as a clean run.
7. **`14-F39` gives no reason for `deny` rather than `escalate`, where `14-F30` did.** `14-F30` argued
   it (`02-F20` enumerates the escalating actions and this is not among them; the cloud plane cannot
   collect a second credential anyway). `14-F39` writes the word three times. The cells are
   transcribable so the assertions are safe, but the argument is one block up — and it is *stronger*
   here, since `14-F14` is a back-office surface with no second credential to collect. **Owner: doc 14,
   one clause, next time it is edited.**
8. **Trap 6's remaining legs are unowned.** Step 0 covers the seed collision and the not-stale
   direction; `needs_snapshot` and a removal are exercised by no oracle in the tree. Correctly outside
   step 0's declared scope — **tracked here rather than closed**, and step 7's suite is the natural home.
9. **`readFileSync` at `describe` scope takes a whole file down as `Tests: no tests` rather than as a
   named failure.** Found and fixed inside the step-2 suite before it shipped. It is still red so
   nothing passes silently, but this repo's own record is that a `no tests` line gets misread inside a
   big turbo run. The pattern appears in several suites here. **Owner: nobody yet; a rail could see it.**

---

## What this does NOT close

- **`01-F26`'s per-user permission overrides.** Not modelled anywhere and named as unmodelled in two
  shipped files — `packages/sync-client/src/staff.ts:25-27` (*"no FR states their shape"*) and
  `packages/domain/src/permissions.ts:368`. `14-F14` lists them as part of the CRUD, so this work
  delivers a **partial `14-F14`**. Including them would be a second protected-path change to the
  matrix and needs its own FR.
- **`01-F26`'s per-location assignment as a *validated* fact.** The shape is validated
  (`packages/domain/src/tenancy.ts:314-317`); the **fact** is not — no FK by `01-F68`, and nothing
  checks the branch exists or belongs to the org. Step 3 adds a writer-side check; it does not add an
  `01-F71` clause, and `01-F71` says adding an enforcement point adds one.
- **Doc 11's staff module.** `11-F20` is the person record only; attendance, advances and staff memory
  (`11-F1..11-F11`) are that module's own Wave 3 and are untouched.
- **`27`'s photo or fixed per-person mark.** `01-F61:142` records that a *name* is the weakest label
  for this population and puts the better answer on doc 27. `display_name` is the floor, not the
  target.
- **Historical attribution already written under the dev roster.** `01-F1` forbids correcting it, and
  the seeded UUIDs are fixed literals (`dev-staff.ts:90`). Every shift already sold as Ayesha, Bilal
  or Hina stays attributed to a UUID that resolves to nothing once the seed is retired — the display
  degrades to the raw id (`apps/pos-electron/src/main/index.ts:777`,
  `apps/pass-kds/src/main/index.ts:439`), visible in `02-F23` reconciliation, the `shift_cash` fold
  and `audit.login`. **This work stops the bleeding; it does not clean the wound.** Any pilot that has
  already sold under the seed needs a founder decision about that data.
- **The LAN path.** `mesh-session.ts` carries no reference data of any kind, so a WAN-less device
  behind a relaying hub (`01-F13`, `DEC-SYNC-009`) cannot receive a roster. `00 §5.1` forbids an
  in-branch feature requiring WAN, so this is an open breach this plan does not close and must not
  work around.
- **Credential delivery and account recovery.** `create-owner.ts` prints a secret to a terminal an
  operator is standing at; a cashier created in a browser has no such operator. `specs/28-tenancy.md`
  §9.21 records that `15-F26`'s set-credential link has no redemption surface and that **no document
  in the corpus owns an outbound-mail capability**. Whether an owner may simply type her cashier's PIN
  is unruled (S1's neighbour): `15-F27`'s *"a password is never an input"* binds the **vendor→owner**
  case and nothing binds owner→staff.
- **`14-F15`'s per-user login and audit history**, `14-F26`'s onboarding wizard, and `01-F25`'s
  back-office pairing code — all named owed in `specs/28-tenancy.md:132` and all outside this scope.
- **`02-F20`'s remote approval path**, which also wants a person identity on the cloud plane
  (`05-F28`) and is resolved by a separate founder call.
- **Multi-org humans.** `users_email_lower_uq` is global (`0011_tenancy_users.sql:71`) and
  `0011:50-53` leaves the question open. S8's answer may reopen it; this plan does not.
