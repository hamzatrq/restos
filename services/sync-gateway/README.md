# @restos/sync-gateway

The **cloud half of the kernel sync protocol**. Devices push their local event
logs here; the gateway authenticates them, merges valid events into one
append-only per-org log, quarantines what it cannot admit, notifies the origin,
fans the merged log back out to peers, and — nightly — audits the whole thing
for correctness. It also holds the device registry (who may connect, who may
relay) and the quarantine-notice outbox.

> **PROTECTED PATH (`20 §4.4`).** Owning spec: `specs/01-kernel-sync.md` (§3 merge,
> §5 tables, §8 protocol). Read it before editing. Behaviour changes cite a
> resolving FR ID; senior review is mandatory (CODEOWNERS). Runs against Postgres
> (drizzle); every test runs on a real Testcontainers Postgres.

---

## 1. What this package is

Four responsibilities, one process:

1. **The merge gateway** (`gateway.ts`) — the wire session state machine
   (`hello` → `push` / `catchup_request` / `ping`). It runs per-origin
   contiguity streams, one inline invariant check (the refund cap), quarantines
   invalid events verbatim, and fans merged events to connected peers.
2. **Device auth + registry** (`auth.ts`, `registry.ts`) — jose HS256 device
   tokens plus the `kernel.device_registry` table. The registry — never the
   token, never the hello — is the authority for who may open a session and who
   may be a relayed origin.
3. **The quarantine-notice outbox** (`kernel.quarantine_notices`) — a durable
   at-least-once channel that tells a device "your event N was quarantined,
   reason R," delivered live on push and redelivered on the device's next hello.
4. **The Auditor** (`auditor.ts`) — a READ-ONLY nightly job that re-derives
   everything from `kernel.events` with the real fold engine and reports any
   divergence. It writes nothing, ever, and survives any poisoned input.

Everything the wire understands comes from `@restos/sync-protocol`; every
envelope validation comes from `@restos/domain`; the merge/refold engine is
imported from `@restos/sync-client/fold-engine`. None of those are redeclared
here (commandment: schemas declared once).

---

## 2. Where it sits — the two-plane law

RestOS is offline-first and event-sourced. Devices (POS terminals, KDS, waiter
tablets) each keep a **local** append-only log and assign their own gap-free
`lamport_seq` per device. This service is the **cloud plane**: devices push
their local logs to it, it merges them into `kernel.events`, and it streams the
merged log back so every device converges.

```
 device local log ──push──▶  sync-gateway  ──merge──▶  kernel.events (per-org)
       ▲                    (this package)                    │
       └──────── event_batch / catchup_response ◀─────────────┘
```

Two facts a reviewer must internalise:

- **`global_seq` is a delivery cursor, NOT a business order.** The gateway
  stamps a per-org monotonic `global_seq` on each merged event purely as a
  catch-up/fan-out cursor and a compaction watermark. It is emphatically **not**
  the order in which business logic folds events — that is per-fold merge
  semantics (`26`, the T-01-15 result), decided by the fold engine from event
  content, reading **no** ordering metadata. Do not treat `global_seq` (or
  `lamport_seq`, or any clock) as "the truth about what happened first."
  `lamport_seq` keeps only its gap-free per-device transport/audit role.
- **Persist before ack (`01-F2`).** No `push_ack`, `event_batch`, or
  `quarantine_notice` is emitted until the merge transaction has committed. A
  crash mid-merge rolls back the whole batch (nothing half-merged).

---

## 3. The Postgres schema (`schema.ts` + `drizzle/`)

Everything lives in one Postgres schema, `kernel`. This service is the **sole
writer** of all six tables. Ids are `text` (not `uuid`) — the storage layer must
not tighten the wire contract. Migrations under `drizzle/` are **append-only**;
`migrate.ts` applies every one on each suite run.

| Table | Holds | Key constraints |
|---|---|---|
| `kernel.events` | The merged per-org log — every admitted event, verbatim `envelope` (jsonb) + two cloud-stamped columns (`global_seq`, `server_received_at`). **Append-only: no UPDATE/DELETE statement for this table exists anywhere in the package (`01-F1`).** | PK `id`; **UNIQUE `(org_id, global_seq)`** (the delivery cursor); **UNIQUE `(org_id, device_id, lamport_seq)`** (the lamport-collision-is-corruption law, cloud side); INDEX `(org_id, branch_id, global_seq)` for catch-up paging. |
| `kernel.org_sequences` | One row per org: `next_global_seq`. Locked `FOR UPDATE` inside the merge tx and held to commit — this is what serialises merges per org and makes catch-up paging unable to skip a not-yet-visible lower seq. | PK `org_id`. |
| `kernel.device_watermarks` | Per-device high-water mark `acked_watermark` — the lamport slot the device is contiguously persisted through. Source of `hello_ack.resume_from`. Keyed by **origin** device (a relayed device's own hello resumes past the relayed prefix). | PK `(org_id, device_id)`. |
| `kernel.quarantine` | Invalid events, stored **verbatim** and never merged / fanned-out / caught-up. `envelope` is **`text`** (not jsonb) — bytes jsonb cannot faithfully hold, e.g. `U+0000`, must still be quarantinable as `storage_reject`. `reason` is one of the closed set (see below). `device_id` = the row's attribution. | **UNIQUE `(org_id, claimed_event_id)`** — re-quarantine of the same claimed id is an idempotent no-op, first stored wins. |
| `kernel.quarantine_notices` | The outbox: one notice per quarantined claimed id (`claimed_event_id`, `reason`, `created_at`, `delivered_at`). The **only** column ever updated is `delivered_at` (delivery bookkeeping, not event history — `01-F1`'s no-update law does not reach it). | **UNIQUE `(org_id, claimed_event_id)`**; INDEX `(org_id, device_id, delivered_at)` for the hello-time undelivered drain. |
| `kernel.device_registry` | Provisioning bookkeeping (`01-F25`): which `(org_id, device_id)` exist, their `branch_id`, `device_class`, and `revoked_at`. Revocation **sets** `revoked_at` (never deletes); `revoked_at IS NULL ⇔ active`. Re-registration mints a fresh `device_id` (wiped devices never collide with old slots). | PK `(org_id, device_id)`. |

`quarantine.envelope` started life as `jsonb` in migration `0000` and was
altered to `text` in `0001` (`schema.ts` reflects the post-`0001` state; they
agree). `kernel.events.envelope` stays `jsonb` — verbatim as received, with the
two cloud stamps merged back into the envelope only at serve time.

---

## 4. Files & components

| File | Role |
|---|---|
| `gateway.ts` | The session state machine + merge pipeline. The bulk of the package. |
| `auth.ts` | `issueDeviceToken` / `verifyDeviceToken` — jose HS256, signature + claim-shape only. |
| `registry.ts` | `registerDevice` / `revokeDevice` / `readRegistryRow` — the `device_registry` seams. |
| `auditor.ts` | `runAuditor` — the five READ-ONLY correctness legs. |
| `quarantine-query.ts` | `listQuarantine` — a read-only projection for the fleet-health dashboard (doc 15 READ seam only). |
| `errors.ts` | Typed error taxonomy + the closed `QuarantineReason` union. |
| `schema.ts` | Drizzle table definitions (the six `kernel` tables). |
| `migrate.ts` | `applyMigrations(databaseUrl)` — runs every `drizzle/` migration. |
| `server.ts` | `buildServer` / `start` — thin Fastify + `@fastify/websocket` adapter; owns the wire codec. Boot-smoke tested only (`server.test.ts` exists). |
| `index.ts` | Public barrel. |

### `gateway.ts` — the merge pipeline

`createGateway({ db, clock, auth })` returns a `Gateway`; `connect(sink)` gives a
per-connection `GatewayConnection` whose `handle(message)` frames are
**serialised per connection** (a frame never starts before the previous settles
— kills the double-hello TOCTOU). The core is **transport-free**: `server.ts`
owns the wire codec; every outbound message is a decoded `ProtocolMessage`
through the sink.

**`handleHello`** composes the T-01-09 auth law in order: (1) jose signature
under `token_secret` — the retired unsigned dev-token shape is rejected; (2)
expiry against the **injected** clock (never the wall clock); (3) token claims
must match the hello's `device_id` / `branch_id`; (4) the **registry** must hold
an unrevoked `(org, device)` row whose `branch_id` matches the claim. A revoked
device gets a `purge_command { scope: "all" }` through the sink and **no
session** (re-sent on every hello while revoked). On success it emits
`hello_ack` with `resume_from` (from the watermark) and drains any undelivered
quarantine notices for this device.

**`handlePush`** runs the whole batch in one transaction. Per envelope, in order:

1. **Identity gate** (authz class): `org_mismatch` / `branch_mismatch`, and
   `device_mismatch` unless the session is relay-authorised. Mismatches
   quarantine attributed to the **session** device (the claimed origin ids are
   unauthenticated garbage a forger controls).
2. **Dedupe-before-gate (`T-01-09` F1):** an id already in `kernel.events` with
   **identical content** acks through regardless of the origin's current
   registry state — gating a merged id would mint the "merged-and-quarantined"
   contradiction and wedge a crash-replayed hub forever.
3. **Origin-existence gate (DEC-SYNC-009 F6, `origin_unregistered` /
   `origin_revoked`):** for a *relayed* (not-own) new id, the claimed origin must
   resolve to an unrevoked registry row for **this session's org AND branch**.
4. **Registry parse (`01-F4`):** unknown type / invalid payload →
   `schema_invalid`.
5. **Divergent-content dedupe (`01-F8`):** a stored id with *different* content
   → `id_content_divergence` (never overwrite — `01-F1`).
6. **Per-origin contiguity:** a new id at an already-persisted slot →
   `lamport_conflict`; the first gap → **stop-at-gap** (break; nothing past the
   gap is stored).
7. **Inline invariant check (DEC-SYNC-007):** see below.
8. **Merge:** stamp `global_seq` (from the locked org counter) and
   `server_received_at`, insert into `kernel.events` inside a **per-event
   savepoint** so one storage failure (`storage_reject`) isolates to that event.

Then it advances `org_sequences`, upserts each **origin's** watermark, sends the
per-origin `push_ack` (named by `origin_device_id` for relayed pushes), the
live `quarantine_notice`s, and fans the merged events to every connected
`(org, branch)` peer **including the origin**.

**Per-origin contiguity (DEC-SYNC-009).** Contiguity is tracked per **origin
device**, not per session. Each origin has a `StreamState { storedThrough,
through, extraFilled }`; `fill()` advances `through` over contiguous slots. Every
quarantine of an **identity-valid** envelope fills its origin's slot (the row
durably holds the slot, so the watermark advances over it and the origin's
outbox never wedges — DEC-SYNC-005 slot-fill). The **per-origin-slot fill gate**
(T-01-11 fix round 2) is the subtle part: an `ON CONFLICT` no-op still credits
the origin's slot *unless* the blocking row is this same origin's own row at a
*different* slot; and a provisional `origin_unregistered` placeholder is
**healed in place** (its `device_id`/`reason` updated) when the origin later
registers — the unregistered→registered relay race.

**The inline invariant check (`checkInvariants`, DEC-SYNC-007).** The gateway
enforces exactly **one** fold-free, provable invariant at merge: the **refund
cap** (`payment.refunded` only; every other type returns `null` — sale-path
events are never invariant-checked, `01-F17`). It finds the parent
`payment.recorded` (matching `settlement_attempt_id`), sums prior refunds over
**unique attempt keys** (`01-F31` — an envelope-keyed sum would double-count),
and delegates the decision to domain `refundRemainderExceeded` (no arithmetic at
the call site). If the parent is not yet merged the refund passes through — a
sale is never blocked; the Auditor's refold catches the rest. A `RangeError`
from unrepresentable totals is treated as a provable violation (quarantine, not
crash — otherwise the whole push rolls back and the outbox re-pushes forever).

**The origin gate & relay (DEC-SYNC-009, supersedes DEC-SYNC-004).** A normal
LAN-only device has no WAN; only the hub (counter terminal) has internet. A
**relay-authorised** session may push its same-org/branch peers' events verbatim
— attested, never re-authored (`01-F1`). The grant is composed at hello:
`relayAuthorized = claims.hub_relay ∧ registry row is a hub-eligible class`
(`HUB_ELIGIBLE_CLASSES`). Neither half alone grants anything — the claim is
necessary, the registry has veto (`18 §5` server-side authority). Relayed origins
are re-checked against the registry at the merge boundary.

**`handleCatchup`** pages the branch's merged stream by `global_seq` (exclusive
cursor, ascending, `CATCHUP_PAGE_SIZE = 500`, one extra row fetched to compute
`complete`).

Both `push` and `catchup_request` first call `requireUnrevoked` — revocation
takes effect on the **next** operation of an already-open session (rejection,
never quarantine — a revoked principal has no legitimate outbox).

### `auth.ts` + `registry.ts` — device auth

`issueDeviceToken(claims, secret)` mints a **deterministic** HS256 JWT over
`{ org_id, branch_id, device_id, hub_relay?, expires_at? }` — no `iat`/`jti`/`exp`
is stamped (identical claims + secret ⇒ identical bytes, for golden fixtures);
`expires_at` rides as a custom epoch-ms claim, **not** standard `exp`, so
verification never reads the wall clock. `verifyDeviceToken` checks signature +
claim shape only and returns `null` on any failure (tampered, wrong key, or a
retired unsigned token). **Expiry, hello-consistency, and the registry check are
the gateway's job**, not the verifier's.

`registry.ts` writes registry rows only (the `device.registered/revoked` *events*
belong to the doc 14/15 emitters). `registerDevice` rejects an unknown
`device_class` (`DEVICE_CLASSES` from domain, never redeclared).
`revokeDevice` sets `revoked_at` from the **database** clock (`now()`) and only
the first revoke stamps. `readRegistryRow` is the auth-check read used at hello,
at every per-operation revocation re-check, and at the relayed-origin boundary.

### `auditor.ts` — the nightly correctness net

`runAuditor({ db, org_id, read_model? })` is a **READ-ONLY** batch over one org's
kernel tables — only `SELECT`s exist in the file; it returns `{ ok, findings }`
where `ok ⇔ findings empty`. Branches and devices are discovered from the data.
It **survives any poisoned input**: an unparseable merged envelope becomes a
structured `unparseable_merged_event` finding, never an abort; money totals
outside the safe-integer range become a per-order finding, not a whole-org
crash. Five legs:

1. **`lamport_gap`** — per `(org, device)` slot coverage. Obligation = `[0 .. max(watermark, max merged lamport)]`; `kernel.events` rows and **attributed**
   `kernel.quarantine` rows *cover* slots (never *extend* the obligation).
   Missing slots are derived as contiguous runs (`O(covered·log covered)`, so a
   corrupt watermark can't hang it); long runs collapse into one range finding.
2. **`conservation`** — per order over each branch's refold: the refund cap as
   the engine's order-free set predicate, plus the settled-equation residual
   (shortfall flagged) via domain `settledConservationResidualPaisa`.
3. **`state_legality`** — per line edge over the refold: only the engine's
   `illegal_transition` anomalies (delegating to domain `LEGAL_NEXT`) are
   findings; a contested-but-legal terminal set is a rendered MVR, not a finding.
4. **`readmodel_diff`** — a supplied projection snapshot vs an **independent
   refold with the real merge engine** (`createMergeEngine` from
   `@restos/sync-client/fold-engine`). Byte-equality per order key via
   `canonicalJson`; missing/extra/drift/duplicate-key are all findings. Fold
   logic is never reimplemented here.
5. **`audit_chain`** — per device, `audit.*` events from the merged log in
   ascending lamport order through domain `verifyAuditChain`. Tail truncation is
   leg 1's catch.

### `quarantine-query.ts`, `errors.ts`, `migrate.ts`, `server.ts`

- **`quarantine-query.ts`** — `listQuarantine(db, filter)`: read-only, `org_id`
  scopes absolutely, optional branch/device filters, `received_at DESC`,
  page-capped (`QUARANTINE_PAGE_SIZE = 500`). Resolution/correction flows are
  doc 14/15, out of scope.
- **`errors.ts`** — `GatewayError` → `ProtocolViolationError` (session-law
  breach) and `AuthRejectedError` (rejection, never quarantine), plus the closed
  `QuarantineReason` union: `schema_invalid`, `org_mismatch`, `branch_mismatch`,
  `device_mismatch`, `id_content_divergence`, `lamport_conflict`,
  `storage_reject`, `invariant_violation`, `origin_unregistered`,
  `origin_revoked`.
- **`migrate.ts`** — `applyMigrations(databaseUrl)` runs every `drizzle/`
  migration programmatically (exercised on every suite run).
- **`server.ts`** — `buildServer` / `start`: Fastify + `@fastify/websocket`,
  env via `@restos/config` `defineEnv` (crash at boot on invalid env). Requires
  `DATABASE_URL` and `DEVICE_TOKEN_SECRET` (≥ 32 bytes). The **real clock is
  injected only here** (`{ now: () => Date.now() }`); the gateway core takes no
  wall clock. Decode/handle errors log + close the socket (no error wire kind
  exists in the closed protocol set).

---

## 5. Invariants a reviewer must hold

1. **`kernel.events` is append-only.** No UPDATE/DELETE for it exists in the
   package. Corrections are new linked events, never mutations (`01-F1`).
2. **Org-absolute isolation.** Every query is scoped by `org_id`; another org
   reusing the same `branch_id` / `device_id` string never leaks across
   (`00 §5.4`). This holds for merge, catch-up, quarantine listing, and the
   Auditor alike.
3. **A sale is never blocked.** The merge's single invariant is provable-only;
   anything unprovable (late parent, cross-push) passes through and the Auditor
   owns it (`01-F17`, DEC-SYNC-007).
4. **Persist before ack.** Commit precedes every `push_ack` / `event_batch` /
   `quarantine_notice`; notices are at-least-once (redelivered on next hello),
   never at-most-once.

---

## 6. What's new / where the bodies are buried

The **entire package is Wave-0 new** (built across tasks T-01-07 → T-01-16;
scaffold-stub before that). It has no prior art to diff against — read it as a
whole. Test coverage lives in `src/__acceptance__/` (law1–law8, device-auth,
relay-*, notice-outbox, invariant-refund-cap, auditor-*, isolation-regression,
and the auditor purity harness), all on a real Testcontainers Postgres.

Known follow-ups are filed in `plans/wave-0/t-01-*-fix-round.md`:

- **Notice heal-in-place reconciliation.** The origin-unregistered→registered
  relay race heals the **quarantine row**'s attribution in place, but the
  corresponding **notice** row's attribution is not yet reconciled — filed.
- **Auditor leg-5 classifier read (`auditor.ts:436`).** The `parseEvent` guard
  for corrupt audit *payloads* is implemented (fix round 2, Finding 2), but the
  classifier read `row.envelope.type` sits just outside the try, so a JSON-`null`
  envelope value throws before the guard — filed as a fast-follow in the T-01-11
  docket (not the whole-report-abort the guard already prevents for payloads).
