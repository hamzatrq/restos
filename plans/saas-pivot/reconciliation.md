# RestOS — SaaS Reconciliation

*Architect's ruling on eight adversarially-verified audits. All REFUTED findings discarded; AMENDED findings used in corrected form. Figures marked ✓ were re-measured by me on `main` @ `8659587`, 2026-08-16.*

---

## 1. THE DEVIATION, IN ONE PARAGRAPH

**A restaurant cannot become a customer of this product, and one server process cannot hold two of them.** The strongest single piece of evidence is `services/api/src/catalog.ts:220-234` ✓: `assertSavable` iterates the full cross-product of `enabled.branches × enabled.channels` — a list read from the **process environment** at `server.ts:401-402` and folded into one host-wide object at `:451` ✓ — and throws `RangeError` on any missing cell. Two tenants on one API host means tenant A cannot save a single sellable item without pricing it for tenant B's branches. That is not a scaling limit; it is a hard refusal, and the code says so itself: *"one process serves one set."* Everything else compounds it: the only path to creating an org, branch, user or device is seven `tsx` CLI commands requiring SSH and `DATABASE_URL` on the service host (no HTTP, tRPC or UI writer exists anywhere); `apps/platform-admin`, which `specs/15` gives 28 FRs, is **18 authored lines, 2 of them source** ✓; `ops/README.md:3` opens *"Everything needed to install RestOS in one restaurant"* ✓; all eight `/internal` gateway routes take `org_id` **from the request** behind **one shared bearer identical for every tenant** ✓, and the gateway's own guide concedes *"a holder of PUBLISH_TOKEN can bypass the matrix entirely"*; there is no build artifact for any service (all seven `build` scripts are `echo` stubs; only three are runnable at all ✓) so production runs `tsx` over a git checkout; there is no TLS, no health endpoint, no heartbeat, no OpenTelemetry, no Sentry, no alerting, no installer, no code signing, no auto-update; org `suspended` is a column nothing can write and nothing reads to gate; every till in every deployment attributes every sale to the same three hardcoded UUIDs (`…0004/0005/0006`); and a comment-stripped sweep of all 291 shipping source files returns **zero** hits for subscription, billing, invoice, entitlement, take-rate, plan, quota, metering or trial. **But the kernel is not the deviation and never was**: `org_id` is on every envelope, every one of the 12 kernel tables and every fan-out key since Wave 0; the device plane derives org from a signed token verified against the registry and quarantines mismatches rather than dropping them; `packages/domain/src/tenancy.ts` (377 LOC ✓) is a complete tenant directory; and the last commit stood up two live tenants against the real tRPC host and found a genuine cross-tenant write. **What deviated is the control plane, the commercial plane and the hosting model — not the data model.**

---

### Where the audits disagreed, and how I ruled

These twelve calibrate everything below. Six auditors were wrong about something load-bearing; two of those errors would have caused you to throw away good work.

| # | Dispute | Ruling |
|---|---|---|
| 1 | **Is the LAN mesh hosted?** `assets` says no (citing AGENTS.md); `sync-kernel`, `client-surfaces`, `doc-corpus` say yes | **It is hosted.** ✓ `createMeshSession` called at `pos-electron/main/mesh.ts:147` and `pass-kds/main/mesh.ts:141`, wired in production at `index.ts:667` and `:291`. AGENTS.md is stale in **five** places. Consequence: the unauthenticated LAN write path is **live**, not theoretical |
| 2 | **Is `sync-client` mostly mesh?** `assets` writes off 7,781 prod + 21,656 test LOC as mesh-serving | **Refuted, and this is the most expensive error in the eight audits.** Mesh-specific is `mesh-session.ts` 633 + `hub-election.ts` 27 + the LAN half of `transport-ws.ts` ≈ **13%** ✓. The rest is the durable local store (1,481), the **cloud** session (706), Argon2id PIN sessions and folds — all running in production today |
| 3 | Cold-start refold a blocker? | **Major, not blocker.** Mechanism confirmed (linear ~30 µs/event, `retentionDrop` has zero production callers), but three documents already name it (`01 §5`, `sync-client/README.md:301`, `specs/25:117`) and it is `01-F14` spec'd-and-owed. The 3M-events → 8–15 min tablet boot extrapolation is **unverified** |
| 4 | Can a tenant be turned off? | **Yes, but only per-device.** `revoke-device` evicts live sessions inside 30 s and blocks reads as well as writes (`01-F48`). The `suspended` column is decorative; the working kill switch is per-device, not per-org |
| 5 | Is `15-F7` the SaaS-hostile law? | **No.** It already gates cloud services substantially (storefront down, cloud orders blocked, sync accepted). The corpus never connects payment state to anything at all, and `15 §9.7` forbids writing that FR. This is a **founder decision, not a spec conflict** |
| 6 | Is the take-rate base unbuildable? | **No.** `Counter.tsx:326-342` ships four channels including `whatsapp`, founder-ruled in Aug 2026. A WhatsApp order rung at the counter is **inside** the take-rate base today. What is missing is **metering**, not the order. (AGENTS.md's *"Counter.tsx:119 hardcodes COUNTER_CHANNEL"* is itself stale) |
| 7 | Zero deployment artifacts? | **Zero containerization/IaC/PaaS artifacts.** 16 tracked ops artifacts exist (6 systemd units, 3 env templates, 2 `.bat` launchers, `id.sh`, `backup.sh`, `sqlite-backup.mjs`, a ~650-line runbook). Major, not blocker |
| 8 | `ops/id.sh` strands the install on re-run? | **Refuted.** `:25-32` guards and exits 1 without writing; only explicit `--force` overwrites |
| 9 | Is device identity cross-checked? | **Two of three ends are silent; one is loud.** The token end refuses at `gateway.ts:415-430`, and org/branch mismatch quarantines on the write path. What is unchecked is the **read** path — the API's `BOOTSTRAP_ORG_ID`/`ENABLED_BRANCHES` against the device's ids — whose failure mode is *four healthy processes and no menu, with no error anywhere* |
| 10 | Where is authorization enforced? | **On the customer's own machine, and nowhere else.** `authorize.ts:29`: *"the MAIN process is what 'server-side' means."* The gateway does **not** re-check the matrix on ingest. Under SaaS this is a direct commandment-8 violation |
| 11 | Is `apps/manager` an RN app? | **There is no shipped RN product surface at all.** `App.tsx:1`: *"THIS IS A FEASIBILITY PROBE, NOT THE MANAGER CONSOLE, AND IT MUST NOT BECOME ONE."* `apps/pos-rn` is 2 LOC with no Expo dependency |
| 12 | The owed-debt register | **21 markers across 14 files** ✓, not 34/19 (AGENTS.md) or 39/22 (`doc-corpus`). The auditor counted marker *tokens* instead of reading the rail — the repo's own named "proxy accepted as the evidence" defect, committed inside an audit of that defect |

**Where the evidence is genuinely thin, and I will not pretend otherwise:** the tablet cold-boot extrapolation (one box, one CPU, unverified); the Sindh Finance Act 2026 vendor-liability finding (OCR'd image scan, single source, self-flagged UNVERIFIED); the 4,642 test count (measured by one auditor, not by me — the gateway suite needs Docker); whether T2 multi-terminal works in a real branch (the kernel **has never run on target hardware**); K-8 (**no printer has ever received a byte from this code**); and the field frequency of counter-down-but-tablets-up, which is the decisive input to the largest fork and **cannot be obtained from this repository**.

---

## 2. THE SALVAGE INVENTORY

Ranked by value × SaaS-independence. Sizes are production LOC unless stated. Total production surface: **66,842 LOC** across `apps/`, `services/`, `packages/` ✓ (205,588 including tests).

### Tier A — port verbatim, zero SaaS coupling

| Asset | Size | Why it survives untouched |
|---|---|---|
| **`packages/domain`** | 3,183 prod / 8,720 test / 543 tests; 3 runtime deps ✓ | The encoded business model. `registry.ts` 1,077 (41 payload schemas), `permissions.ts` 600 (**25** actions × 4 roles ✓, org arm mutation-proven with a negative control), `tenancy.ts` 377 (**already the SaaS tenant directory**), `money.ts` 185 (BigInt accumulation, `splitPaisa`, `applyRateBps`). 69 non-test files across 13 workspaces import it. `can()`/`reportScope`/`canPayOut` already refuse cross-org |
| **The requirements corpus** | 805 FR definitions / 5,116 spec lines / 47 DEC rulings ✓ | **19,803 citations across 601 of 660 source files, zero dangling.** Irreplaceable and code-independent. Carries `DEC-MONEY-007` (a khata repayment made every screen read *"OVERPAID — refund to close"* on the happy path), the advances/baqaya ledger, COD rider settlement, 05:00 Asia/Karachi business day, FBR/PRA/SRB fiscalization, low-literacy design derived from census + CHI/INTERACT studies |
| **`packages/escpos`** | 3,702 prod / 12,418 test / 368 tests; deps = `domain` + `qrcode` ✓ | Pure `render()` over a document model, typed refusals, one byte→page interpretation. Thermal printing on 58/80 mm Pakistani stock is solved here and by nobody off the shelf. **Caveat: K-8 is owed in full — none of this is evidence about paper** |
| **The tenant-isolation register** | 1,540 test LOC ✓ (`tenant-isolation.test.ts` 1,189 + `tenant-isolation-matrix.test.ts` 351) | Days old, and it is the SaaS security work already done: one host, two tenants, deliberately non-defensive stores, 35 generated attacks across 5 axes, plus an **out-of-tree mutation matrix with a negative control** (kills 4/2/1, control kills 0). It already caught a live cross-tenant write |
| **The static CI rails** | `scripts/` 2,562 LOC ✓ + the GritQL money ban | Pure Node, framework-free. `seams:check` (1,167) answers a question no off-the-shelf tool asks and its exception markers **fail when stale**, so the register cannot rot. `strings:check` (984) is the only mechanical defence against internal identifiers reaching a paying customer's screen — the exact complaint class that triggered this review |
| **`packages/sync-protocol`** | 542 prod / 1,336 test / 77 tests | Versioned, additive-only under `v:1`, golden-fixture tested, zstd negotiated per connection. **This already is the device↔server protocol a SaaS needs.** Removing the LAN plane removes callers, not protocol |
| **The ledger as a billing substrate** | no new code | Closed `channel` enum required on `order.created`; `unit_price_paisa` snapshotted at line-add; `amount_paisa` + closed `method` + a `purpose: settles_order \| repays_receivable` discriminator on `payment.recorded`; integer paisa throughout; `(org_id, global_seq)` indexed. A take-rate meter is **one `applyRateBps` call over data that already exists** |

### Tier B — keep, with a changed caller or one addition

| Asset | Size | Note |
|---|---|---|
| **Gateway isolation & admission** | `gateway.ts` 1,337, `auth.ts` 137, `registry.ts` 273, `tenancy.ts` 269; 358 tests on **real Postgres** | The device plane is structurally isolated: org from a verified claim, never from the client; stored rows carry the *session's* org; fan-out keyed on a structured `(org, branch)` pair. Proven with two live tenants. Keep file-for-file |
| **The 7 provisioning commands as logic** | 1,969 LOC + 64 acceptance tests across 6 suites, each with a published mutation matrix | Every rule a signup endpoint needs, written at the writer because `01-F68` forbids FKs forever: branch-under-unnamed-org refused, re-run-that-renames refused, `--unrevoke`/`--password` refused **by name**, owner secret minted never accepted. **Rewrite the transport (argv → tRPC), keep every rule verbatim** |
| **`authorized()` + `assertEveryProcedureIsGated`** | `trpc.ts` 285, boot gate at `router.ts:224` | The authorization half is already structural and boot-enforced — the scope is built *inside* the middleware from `ctx.subject.org_id` and cannot be stated by a caller. **This is the seam to hang the missing data-scope enforcement off** |
| **`packages/auditor` + `services/jobs`** | 567 + 283; 9 gateway suites, 2,448 test LOC | Already fleet-shaped: `select org_id from kernel.org_sequences` then per-org on a BullMQ repeatable. `20 §4.2` calls it *"the single highest-value correctness artifact we build."* **One unsupplied leg** (`read_model` ✓ — the only auditor entry on the owed register), which a server-side projection makes trivial |
| **`packages/ui` token + physical layer** | ~2,450 of 5,765 (tokens 2,205, `physical.tsx` 244) + 3 bundled woff2 | The only part proven to cross planes (the Next.js back office consumes it today). The dp-as-1/160-inch-of-glass conversion is a **genuine invention** — it caught a 20 mm ergonomic floor rendering at 14.2 mm on a panel the spec itself lists |
| **`packages/testing` sim** | 826 / 75 tests | Seeded virtual time, no `Math.random`, no `Date.now`, same seed ⇒ deep-equal trace. A cloud SaaS still has reconnects and partial writes to simulate |
| **`specs/20` + `specs/24` as method** | 217 lines | Separate-session test authorship committed red first; the round-3 mutation law (plausible implementation out-of-tree, one-branch control, report kill counts); out-of-tree mutation of security constants. **This discipline is why 543 domain tests are worth more than most 5,000-test suites.** Costs nothing to carry forward |

### Tier C — high quality, fork-dependent

| Asset | Size | Fate |
|---|---|---|
| **`packages/sync-client`** | 7,781 prod / 21,656 test / 743 tests | **~87% survives under any fork that keeps offline-first.** `cloud-session.ts` (706) is exactly the device→server outbox a SaaS needs and needs ~90 lines of relay logic stripped. `device-store.ts` (1,481) survives if `01-F2` survives. `merge.ts` (1,521) **shrinks dramatically** with a single branch authority — its supersedes-DAG head sets and contested-terminal MVRs exist because two devices can partition *from each other*. Keep the money arms regardless (`01-F31` attempt keys caught a real Rs 2,240 double-settlement) |
| **`pos-electron` platform-free main logic** | 7,104 of 9,777 across **18 of 21 modules** with zero `electron`/`node:` imports | `printing.ts` 1,883, `gateway.ts` 1,023, `authorize.ts` 768, `line-advance.ts` 529, settlement guards, station routing. Moves to a server or an edge agent **unchanged** |
| **The IPC contract** | `shared/ipc.ts` 1,147 + a **79-line** preload, 21 typed methods, no generic `invoke` | Already a closed, auditable API surface. The cheapest port path in the repo: one file changes to change transport |
| **The layout-gate measurement core** | `probe.ts` 451 + `mode-contract.ts` 461 — **zero Electron references** | The 11-panel sweep (202→782 mm of glass), the ancestor-clipping walk, the mm-of-glass touch-target check, `PANEL_FLOOR_MM`. Ports to any Chromium driver |

**Not salvage, but worth naming:** `apps/backoffice` (4,919 prod) is the only surface already built the way a SaaS is built — browser to its own origin, a Next rewrite proxying `/api/trpc`, `RESTOS_API_URL` read at request time, auth keyed on the server's `whoami`. It needs multi-tenancy, not a runtime change.

---

## 3. THE REDO REGISTER

Ordered by what blocks the first paying tenant.

**Blocks tenant #1:**

1. **Per-org enabled `(branch, channel)` set.** *Today:* one process env list validated against every tenant's save. *Shape:* `kernel.org_config` keyed `(org_id, key)`, read at request time for `ctx.subject.org_id`, served by the **same** `catalog.enabled` procedure the writer refuses against — the single-declaration discipline that was hard-won when the `NEXT_PUBLIC_` duplicate drifted silently. An unknown channel for one org becomes a refusal for that org, **never a process boot-crash that takes down every tenant on the host**.

2. **Tenant-scoped data context.** *Today:* 13 resolvers each hand-pass `ctx.subject.org_id` into a port; nothing at boot, in the types, or in CI stops the fourteenth from passing `input.org_id`. *Shape:* ports take **no `org_id` argument at all** — `withSession` constructs an org-bound port bundle, so a resolver has no org parameter to get wrong. Enforce at boot the way `assertEveryProcedureIsGated` already works: a second walk asserting no procedure reaches an unscoped port factory.

3. **Postgres RLS under it.** *Today:* 31 hand-written `org_id = $` predicates across 7 files, one role, one pool, zero policies. *Shape:* `SET LOCAL app.org_id` per transaction with policies keyed on the **session variable, never a join to `kernel.orgs`** — the same reasoning that produced `01-F68`'s FK ban (a constraint must never refuse an ingest for an org with no registry row, i.e. refuse a sale a till already rang). **The corpus is silent on RLS; rule it explicitly in an FR, because it is one keystroke from `01-F68` in the English and nothing alike in the code.**

4. **The `api ↔ gateway` `/internal` boundary.** *Today:* 8 routes, org from the request, one bearer identical for all tenants, no person-level check, and no two-tenant test spans both services. *Shape:* a short-lived **org-bound** service credential minted per request from the authenticated subject as a signed claim, verified by the gateway against the registry it already trusts for devices. Then extend the two-tenant register across the real seam with both services live on real Postgres.

5. **LAN peer authentication.** ✓ `LAN_HELLO_PLACEHOLDER = "lan-member-unauthenticated"` in both hosts; `mesh-session.ts:442` admits a follower after checking **only** `isRevokedPeer`; the push arm ingests into the branch ledger on the same check; the transport listens on `0.0.0.0` by default. **The mesh is live in two shipping apps, so any device on the shop Wi-Fi can write to the money ledger.** *Shape:* under a fixed branch authority this is free — the relay is a server, tablets present the device token they already hold. **Fix this week regardless of every fork below.**

6. **Provisioning → an authenticated control plane.** *Today:* SSH + `DATABASE_URL`, and **none of the seven commands emits an event**, correctly, because a shell has no authenticated user and `OrgEvent.actor_user_id` would be permanently null in an append-only store. *Shape:* `apps/platform-admin` as `15-F1`'s console calling the existing command logic as library functions. **That one change closes the audit gap in the same act** — an authenticated actor makes `15-F3`/`15-F4`'s emissions legal for the first time.

7. **Staff roster over the wire.** *Today:* three hardcoded humans with **globally identical UUIDs** seeded from env vars, and there is **no staff message in the protocol under any name** (vocabulary is `hello`, `hello_ack`, `push`, `push_ack`, `catchup_*`, `catalog_*`, `snapshot`, `catalog_notice`, `quarantine_notice`, `purge_command`). Every tenant's ledger attributes every sale to `…0004/0005/0006` — **permanently, in an append-only store**. *Shape:* a staff snapshot message produced from `kernel.users` per `(org, branch)`, consumed by the existing `StaffRegistry.apply` — **the device-side receiver is already built and correct**. Then `14-F14` user CRUD as the writer.

8. **Cloud login hardening.** No rate limiting, no lockout, no reset, no revocation, 12 h TTL. Not an enumerator (one identical `UNAUTHORIZED` for both cases, deliberately) but an **unblunted timing oracle** — Argon2id runs only when a row exists. Reuse `01-F61`'s durable lockout, one plane over.

9. **`01-F25` pairing code.** *Today:* an operator types three UUIDs into a shell command and into an env file, with no error message for the mismatch. *Shape:* owner presses *Add device*, gets a short code; the device redeems it for identity **and** token in one exchange. **This is the single highest-leverage spec change in the product** — it makes the ids untypeable, which removes the failure class rather than documenting it. It needs an FR first: code format, TTL, rate limit, claim/refusal protocol. All policy, all uninvented, and commandment 2 forbids guessing.

**Blocks tenant #10:**

10. **Layer-2 config transport to devices.** 24 `RESTOS_*` keys are typed per machine, and the code states why: *"layer 2 has no transport to a device."* `config.changed` is allowlisted at the gateway, has **no payload schema**, has its body **explicitly not validated**, and **no shipping code emits it at all**. Give it a discriminated payload with a required `effective_from` (`15-F6`: changes never apply retroactively — a meter reading the rate at fold time without it silently re-prices history).
11. **Org lifecycle enforcement.** `updateOrgStatus` + console action; gate at the two cloud gates only, honouring `15-F7`'s asymmetry. A suspended tenant must **not** receive `purge_command` — that is for revoked devices, and a suspended tenant may be reinstated.
12. **Staged catalog edits durable and org-scoped**, and the day-end sweep out of `server.ts`'s `setInterval` into `services/jobs` as a BullMQ repeatable, which `18 §5` already mandates.
13. **Entitlement as a second, orthogonal gate** — `entitled(org_id, capability)` composed with `can()` at the choke points that already exist. **Do not bolt plans into `PERMISSION_ACTIONS`**; the 25-action matrix and its Appendix A transcription are among the cleanest artifacts in the repo.
14. **Metering.** Give `metering.usage_recorded` a payload schema (it is **unemittable** under `01-F4` today) and derive the meter as a per-org fold in `services/jobs` — **not** in the unbuilt storefront, or metering the vendor's own revenue waits on a Wave-2 app. Keep `06-F22`'s per-order idempotency key so the storefront's future events supersede the derived ones.

**Blocks the business, not the tenant:**

15. **The deploy unit** — real builds, one immutable image per service tagged by commit, `migrate` as a pre-deploy job. The systemd units' boot-line contracts become readiness probes.
16. **Observability** — OTel + Sentry (**both already on `18 §14`'s allowlist**, so no `§15` event), `/health` and `/ready`, a real heartbeat table so `14-F12`'s device list and `15-F11`'s fleet view stop rendering ABSENT, Auditor findings to an on-call channel instead of journald read weekly by a human.
17. **TLS.** Both services bind `0.0.0.0` in plain HTTP/WS. Device JWTs and back-office bearers are in clear.
18. **Backup/DR** — 2 of 22 doc-22 FRs, real RPO up to 24 h against a specified 5 min, and the **device half has no scheduler at all** while the till holds the only copy of every unpushed sale.
19. **Device fleet update** — signed installer + `15-F19..F21` channels. `electron-builder` is on the allowlist and not installed.
20. **Device retention** — `01-F14`'s rolling window is unimplemented and `retentionDrop` has zero production callers. Snapshot + prune watermark. **This gets cheaper under SaaS, not harder**: the server holds the full ledger, so the device is pruning a cache.
21. **Authorization re-validation on ingest.** The gateway must re-decide what the till decided. Keep the device-side matrix as the offline-degraded path.

---

## 4. THE DELETE LIST

Working code to abandon. Sunk cost named.

| Delete | Sunk cost, honestly |
|---|---|
| **`ENABLED_BRANCHES` / `ENABLED_CHANNELS` as env vars** | The *concept* survives — `01-F60`'s completeness check is right and the editor prefills against it. Only the **delivery mechanism** dies. ⚠ The deletion must **move** the check, not drop it: `02-F42`'s closed-channel check was nearly lost this way when `lib/env.ts` was deleted |
| **`BOOTSTRAP_OWNER_*` / `BOOTSTRAP_ORG_ID` / `createMemoryUserStore`** | ~80 lines. The posture is actually **correct** (mutually exclusive with `DATABASE_URL`, both set is a boot crash, neither is *"nobody can log in"*) — deleting the branch is still better than a second answer to *who may sign in*. Note `services/api/CLAUDE.md` records that **no acceptance test covers the memory-store seam**, so its return would be caught by nothing |
| **`ops/id.sh` + the `ids.env → cloud.env → counter.env → kitchen.env` chain** | The whole one-restaurant identity ceremony, ~250 lines plus the runbook sections around it. Under pairing, the ids are minted server-side and the class of silent mismatch **stops existing**. Keep the secrets half and, above all, **keep the recorded failure modes** — they are the best catalogue of silent-failure knowledge in the repo |
| **`packages/device-config/src/dev-staff.ts`** + `RESTOS_DEV_PIN*` + the `.bat` gates | ~250 lines. Its own guide already says *"delete when the transport lands."* The real cost is not the code — it is that **every pilot ledger already written carries the wrong three user ids, permanently** |
| **`DEV_IDENTITY` + the per-key fallback in `resolveDeviceIdentity`** | ~40 lines. A device that silently adopts three hardcoded UUIDs when unconfigured is the exact failure `ops/id.sh`'s header exists to warn about. Keep `requireDeviceIdentity` |
| **`ops/startup/*.bat`** | 379 lines that have **never been executed** — the kit says so twice. Keep the reasoning (auto-logon, BIOS restore-on-AC, why a refusal must not wait for a keypress — that last is a real insight for unattended edge devices) |
| **The per-restaurant Linux box + 5 systemd units as the *shipping* topology** | ~200 lines of unit files plus a ~650-line runbook. Keep them as a dev/pilot fixture and as documentation of the boot-line and restart contracts. **Do not delete the runbook** — it holds operational knowledge recorded nowhere else |
| **The duplicated layout gate in `apps/pass-kds`** | 907 LOC. Two walks over one property is the defect `escpos/CLAUDE.md` already names about `simulate.ts`. One implementation, parameterised by surface |
| **The Electron shell** (`index.ts` 1,890 + `window-options.ts` 288 + `preload/index.ts` 79) | ~2,257 LOC — *conditional on fork 5*. The 21-method contract above it and the 7,104 LOC of platform-free logic below it survive |
| **`file-printer.ts` + `RESTOS_PRINT_TO_FILE`** | 191 LOC whose own docs say it is *"not evidence"* about any printer and must never be set in service. Under SaaS the same job is a cloud preview endpoint over `simulate()`, which already exists as the one interpretation |
| **`cols_font_b` + the Font B branch of `capability.ts`** | Zero production readers and the encoder **physically cannot emit Font B** (no `ESC M`). `DEC-HW-001` already ruled it out on legibility. A declared capability nothing can use is the dormant form of this repo's own named recurring defect |
| **Ten 2-line scaffold workspaces** | 20 LOC across 10 packages. They cost nothing and **mislead everything** — they make the repo present as 10 apps and 7 services when 4 apps and 3 services run ✓ |
| **AGENTS.md's seven archaeology paragraphs** | 10,339 of 12,516 words (83%). Extract the ~14 transferable lessons **first** — they are the genuine value and they exist nowhere else. Then delete the narrative, because a status board written in prose rots faster than anyone edits it: five of eight re-measurable claims are wrong today, including three assertions that the LAN mesh is hosted by nothing |
| **`KERNEL.md` (line 5) and `SYNC-ORDERING-PROBLEM.md`** | Line 5 of KERNEL.md is false and ~4 months stale; the **body is accurate** and should migrate. `SYNC-ORDERING-PROBLEM.md` is a superseded July draft sitting beside its own ratified answer, inviting a reader to re-open a closed question |
| **`plans/wave-0` (18 files) + 11 orphaned wave-1 files** | 28 of 49 plan files have zero inbound references; `plans/` is 137,830 words — **larger than the entire spec corpus**. `plans/README.md` already says plans are deleted after their wave. The one file that looks load-bearing states in its own header that both its rulings were promoted into FRs |

**Do not delete, under any fork:** the event log, the outbox, `01-F2`'s durable-before-ack property, the folds' money arms, the merge-invariance oracle (bijective relabel + clock injection — **the only instrument in the repo that can tell a correct merge from a convergent-and-wrong one**), the Auditor, the branch-time layer, `specs/26`.

---

## 5. THE FORKS

### FORK 1 — Does offline-first survive, and in what shape? *(dominates everything)*

Not softened: **this decides between throwing away ~12% of production code and throwing away ~40%,** and it determines whether the SaaS client can be a browser tab at all.

**The facts, corrected.** `00 §5.1` forbids any in-branch feature requiring WAN; `01-F2` makes confirmed mean *durably persisted before UI ack*; commandment 4 says a sale is never blocked. The LAN mesh **is hosted** ✓, by both Electron apps, since 2026-08-13 — and it has **zero peer authentication** ✓. Mesh-specific code is ~1,591 prod LOC including the app hosts, **not** the 7,781 one auditor implied. The indirect cost is larger than the direct one: `merge.ts`'s supersedes-DAG head sets and contested-terminal MVRs exist because two devices can partition *from each other*. The performance contract (`~500 orders, 8 h offline, <60 s on 4G`) has **never been measured end to end**, and the kernel **has never run on target hardware**.

| Option | Cost | Consequence |
|---|---|---|
| **(a) Full peer mesh + election** | Authenticate the LAN plane; support a branch-local component on thousands of sites you cannot SSH into; carry a device-side full replica with an unimplemented retention window; the client **cannot** be a plain browser tab (OPFS sync handles are Worker-only, so `01-F2` either changes or all 21 IPC methods go async) | Maximum resilience. Maximum ops commitment. Buys survival of a state — *the counter is off* — in which the restaurant cannot take money anyway (no drawer, no receipt printer, no card terminal) |
| **(b) Branch-local relay, fixed authority (the counter)** | Delete `hub-election.ts` (27), the election/split-brain half of `mesh-session.ts`, the `DEC-SYNC-009` relay-attestation machinery (43 `relay` sites in `gateway.ts` + 5 acceptance suites), and collapse `merge.ts`'s device↔device arms. **LAN auth becomes free** — the relay is a server, tablets present the token they already hold. ~2,500 prod + ~3,100 test LOC out | Satisfies `01-F13`'s actual deployment fact (only the counter has internet). **This is the Toast pattern `specs/19 §4.2` itself cites.** Keeps commandment 4 fully intact. Merge only has to handle the WAN boundary and genuine multi-till concurrency at one branch, which `01-F31` attempt keys already own |
| **(c) Cloud-first thin client** | Delete the mesh, most of `device-store.ts`, most of `merge.ts`. ~15,000 prod + ~25,000 test LOC out | Requires amending `00 §5.1` and commandment 4 at the **top** of the authority order. A till that stops selling when the WAN drops, in a market with load-shedding, is a returned product |

**Recommendation: (b), with a sub-ruling — the device becomes a bounded cache with a durable outbox, not a full replica.** *Confidence: high on direction, medium on the exact boundary.* Offline-first is the moat and the corpus's own law; peer *election* is the part that buys resilience to a state where the restaurant is already stopped. The sub-ruling preserves `01-F2`, `01-F17` and commandment 4 verbatim while removing O(history) work from the till and making `01-F14`'s retention window trivial (the server holds the full ledger; the device re-fetches).

**Do the LAN authentication this week regardless of the ruling.** It is live in production hosts today.

### FORK 2 — Pooled tenants, or a cell per tenant?

The data plane is already pooled; the config plane forces one process per org.

| Option | Cost |
|---|---|
| **(a) Pool** | The five named blockers above: per-org enabled set (one table + one lookup), tenant-scoped data context (14 resolvers + a boot walk), RLS (a migration + `SET LOCAL` + a second role), the `/internal` credential, durable staged edits. Blast radius per bug is every tenant |
| **(b) Cell per tenant** | Almost no application change. An orchestration layer, per-tenant deploy, and cross-tenant reporting becomes hard |

**Recommendation: (a) pool. Confidence: high, and the price point is what decides it.** PKR 8,000/branch/month is roughly **USD 28**. A cell — Postgres + Redis + four processes — cannot be run for a defensible fraction of $28/tenant on any managed platform. Cell-per-tenant is economically hostile at this price, and the pooling blockers are enumerated, small and already half-built. **Do not let this be decided by whoever touches `catalog-router.ts` first.**

### FORK 3 — Does non-payment gate anything, and can you collect at all?

**The enforcement question is second-order. The first-order problem is that RestOS is not in the money flow.** All 15 RAAST references in the corpus are customer→restaurant, and `06-F15` puts own-channel payment into **the restaurant's own bank account** with the customer submitting a transfer reference. So the 5% take-rate is **an invoice a restaurant can decline to pay**, not a deduction. `15 §9.4`'s invoicing handoff has been flagged as needing an owner since Draft 1 and still has none.

Enforcement options: (a) never gate the till — churn is the only lever; (b) gate cloud services only, which is what `15-F7` **already specifies** (storefront down with an honest notice, back office locked, sync still accepted, new cloud-originated orders blocked, till keeps selling); (c) time-boxed grace, then refuse to **open a new day** — never mid-service, never mid-order, never mid-settlement — with the refusal named on the honesty strip.

**Recommendation: ship (b) now; write (c) as an FR but do not ship it until collection works. Confidence: high on (b), medium on (c).** And a harder recommendation: **if the take-rate proves uncollectable, price it into the subscription and drop it.** That removes the metering dependency on an unbuilt storefront, removes the reversal-netting arithmetic, and turns a disputed variable charge into a fixed one. Whatever is chosen, `00 §5.1` must gain the sentence naming the exception, or two documents contradict.

### FORK 4 — Self-service signup, or a vendor console?

`15-F26` rules signup out **as a decision, not on merit**. `restaurant-os.md §7` sells done-for-you onboarding — menu import, a live recipe-mapping session with the chef, printer runbooks — as part of the price. **Multi-tenant and self-serve are separable.**

**Recommendation: no self-service signup in v1; build the vendor console. Confidence: high.** A Pakistani restaurant with a paper menu cannot self-onboard; `create-owner` mints a password and prints it once, which has no self-service analogue; and the console is the **smaller** build that also closes the actor gap making every provisioning act unattributable today. Revisit when onboarding cost per tenant is measured, not before.

### FORK 5 — What is the client runtime?

Resolves **together with fork 1**, because both options (b) want the same artifact.

Three things genuinely cannot cross into a browser: raw TCP to a printer, a LAN WebSocket **server**, and physical panel millimetres (shelled out to PowerShell WMI / `xrandr`). Two of those three are the offline-first architecture itself.

**Recommendation: browser/PWA renderer + a small signed per-branch edge agent. Confidence: medium-high.** The agent owns printing transport + durable spool, the LAN relay, the local store, and panel PPI — **the same artifact fork 1(b) needs**, so you build one thing. The 21-method IPC contract becomes its HTTP/WS contract nearly unchanged; the 5,363-LOC renderer and all 22 `packages/ui` components survive; the layout gate's 912-LOC measurement core ports to Playwright with the 11 panel rows as viewport+DPR pairs. **Explicitly kill `apps/pos-rn` as a plan and stop treating `apps/manager` as a product surface** — its own first line says it must not become one. Do not build both a web and an RN till.

### FORK 6 — Is the vendor legally liable for tenants' fiscal non-conformance?

`plans/wave-1/research/fiscal-printing-pakistan.md` reads Sindh Finance Act 2026 s.43 entry 2AA as imposing up to **Rs 1,000,000** on *"any person who designs, develops, customizes or supplies invoicing software"* issuing non-conforming invoices, plus a place-of-business-in-Sindh requirement for the PoS vendor. **The evidence is thin: OCR'd from an image scan, single-source, self-flagged UNVERIFIED.** Under installed software this is the restaurant's exposure; **under SaaS you are the supplier for every tenant.** Get a Pakistani tax lawyer's read before the first Karachi tenant signs. This is a business-model input, not an engineering ticket, and it interacts with fork 3 (`services/tax` is 2 lines and every `fiscal.*` type is unemittable).

### FORK 7 — Multi-org humans?

Not an index bug. Login has no org input and `AuthSubject`'s org comes **from the resolved user record** (`01-F71` (b)); a per-org unique index would admit two rows one lookup cannot choose between. Multi-org needs an **org selector in the login flow** — a product decision.

**Recommendation: design the selector into the login flow now even if v1 enforces one org per email. Confidence: medium.** Vendor support staff and multi-branch groups both need it, and changing the login lookup shape later touches every enforcement point `01-F71` names.

---

## 6. THE NEW CORPUS SHAPE

**Rule first: extend, do not renumber.** ✓ 805 FR definitions carry **19,803 citations across 601 of 660 source files with zero dangling**. Renumbering destroys 19,803 anchors and buys nothing — and `HEAD` already proved the grammar absorbs a SaaS pivot additively (eight new FRs, `docs:lint` clean). Splitting a document does **not** renumber it; `docs-lint` C2's *prefix matches owning doc* becomes *prefix matches owning family*.

**Three tiers, hard caps in TOKENS, ~32 documents, ~130k tokens against today's ~485k.**

| Tier | Cap | Contents |
|---|---|---|
| **T0 — the router** (replaces AGENTS.md) | 2,000 tok | Commandments as one-liners with FR pointers; the three standing laws; the routing table; working rules; authority order. **Where truth lives, never what the truth is.** CI-banned: any file path, any date, any digit-plus-"tests" |
| **T0.5 — `LESSONS.md`** | 3,000 tok | The ~14 transferable lessons, stripped of paths, counts and dates. A lesson is admitted only if true independent of tree state. *This is the file that makes the archaeology deletable* |
| **T1 — the specs** | 4,500 tok each | 26 migrating + 3 splits + **2 new** |
| **T2 — package guides** | 1,500 tok each | What the package **is** and what its seams are. No status, no counts, no dates. (`pos-electron/CLAUDE.md` is 26,078 words today — larger than any spec) |

**Migrates substantially unchanged (24 docs):** `00 §5–§7` (its three-layer config model is **already the correct SaaS tenancy model** — the code violates it, the prose does not), `04–13`, `16–27`. **`specs/22` migrates verbatim and is 0% built** — 22 well-formed FRs covering every SaaS operating obligation you will be judged on; it is a to-do list, not dead weight.

**Split, not rewritten (3 docs, the corpus's three largest and most-cited):** `01` → `01a` envelope/catalog/scopes/money/time + `01b` sync/mesh/catchup/device lifecycle; `02` → `02a` order lifecycle + `02b` settlement/shifts/cash/escalation; `03` → `03a` kitchen + `03b` printing.

**Written fresh (2 docs):**
- **`28 — Tenancy, entitlement & billing.`** The document that does not exist and whose absence let each module answer these questions locally. Owns: tenant isolation as a tested property (absorbing `01-F71`, adding a fifth enforcement point for the data-scope gate and a ruling on RLS); entitlement resolution as **data, not env**; metering→invoice; **collection** (fork 3); dunning; signup or its refusal; the onboarding pipeline as an automated flow rather than `15-F10`'s human runbook. **It sits at authority position 2b — above module specs — because that is precisely where the gap was.**
- **`29 — Deployment, the cloud plane and the edge agent.`** Environments, regions, migration/rollout across N tenants, per-tenant observability and SLOs, incident response, cost per tenant, the signed agent's install/update/health contract. `18 §13` gives this four lines today and `18 §16` defers hosting to "Wave 2".

**Amended in one clause each:** `restaurant-os.md` law 5 — keep *LAN-first real-time* (the moat), replace *"cloud is the exhaust"* with a bidirectional statement (*the cloud is the control plane and the cross-branch path; it publishes down as well as receiving up; a branch may run without the cloud, a tenant may not exist without it*). **In honesty: one auditor's claim that this metaphor *caused* the deviation was refuted — the orgs table and `create-org` both exist. Amend it for clarity, not as a post-mortem finding.** Also: `15-F7`/`00 §5.1` to name whichever exception fork 3 rules; `01-F60` for the per-org enabled set; `01-F14` to pick N.

**Retired:** AGENTS.md's narrative, `KERNEL.md` (body migrates into `01b` + a kernel README; line 5 is false), `SYNC-ORDERING-PROBLEM.md`, `plans/wave-0` (18 files), 11 orphaned wave-1 files. **Keep `plans/wave-1/running-the-stack.md`** (758 lines, 6 inbound refs — the seed of spec 29) and `wave-1-scope-reconciliation.md`.

**Rail changes, all of which are the point:**
1. **`docs-lint` C5 must count TOKENS, not lines.** `23-F3` and `23-F8` both specify a token cap; the rail checks `split("\n").length > 360`. Thirteen documents are over the cap at up to 4.2× **and the rail reports clean**. This is the mechanical reason the corpus reached 485k tokens, and it is the repo's own "proxy accepted as the evidence" defect sitting **inside its governance rail**. Mutation-prove the fix: put a 5,000-word line back and confirm it reddens by name.
2. **A `DEC-*` resolution rail.** 47 decisions have no reference check at all, unlike FR IDs. Move to `specs/decisions/DEC-*.md`, one file each, ≤800 tokens, with a generated index — the table has structurally collapsed (one row is 6,384 characters, another 12,403).
3. **Extend `15-F27` from provisioning to configuration:** *no layer-1 or layer-2 setting may be read from `process.env` in shipping code*, with a CI rail in the `seams:check` family. The known violations become its first mutation fixtures.
4. **CI must run all seven verify rails.** It runs three. `tokens:check`, `strings:check`, `seams:check` and `layout:check` never gate a merge today.

---

## 7. WHAT WOULD CHANGE MY MIND

**Recommendation 1 — keep offline-first, replace peer merge with a branch relay (fork 1b).**
- **Field data.** Four weeks of instrumented pilot logging: counter-down-but-tablets-up **minutes during service hours**. If that exceeds ~2% of service minutes, or any branch shows tablets meaningfully carrying service through counter reboots or partial power events, election earns its keep and I flip to (a). *This is the decisive input and it is unobtainable from the repository — the audits could not settle it and neither can I.*
- **Tier mix.** If T2/T3 multi-terminal branches are more than ~30% of the pipeline rather than the minority tier `02-F40` assumes, the relay's single point of failure becomes a support cost that outweighs the deleted code.
- **A fiscal or legal requirement for a per-terminal tamper-evident chain.** Nobody in the corpus states this either way. If it exists, the device stays a full replica and the "bounded cache" sub-ruling dies with it.
- **Evidence that `merge.ts`'s device↔device arms carry genuine same-branch multi-till concurrency**, not only partition-from-each-other. If two counter tills legitimately produce contested terminal states through a relay, the collapse is smaller than I claim.

**Recommendation 2 — pool tenants on one stack (fork 2a).**
- **A tenant in the first ten with a regulatory or contractual demand for physical isolation.** `DEC-DATA-002` records Pakistan's residency posture as **unverified**; if legal comes back requiring per-tenant isolation, cells win regardless of cost.
- **A measured cost model showing a cell runs under ~$5/tenant/month at target scale.** My argument is arithmetic on a USD-28 price point; better arithmetic beats it.
- **The tenant-scoped data-context refactor overrunning ~2 weeks.** Pooling's case rests on the blockers being *small and named*. If touching 14 resolvers plus a boot walk plus RLS turns into a quarter, cells buy time you can spend on the control plane instead.
- **A second cross-tenant leak found in the existing surface.** One was already found and fixed. A second would say the application-scoping approach needs RLS *before* pooling, not alongside it — which reorders the work rather than reversing the ruling.

**Recommendation 3 — browser/PWA renderer + signed per-branch edge agent (fork 5).**
- **`01-F2` under OPFS.** If a Worker-backed OPFS store cannot deliver durable-before-ack at counter latency on the actual Windows tills — or if the team will not accept making all 21 IPC methods async — Electron stays and the agent absorbs the renderer too.
- **K-8.** **No printer has ever received a byte from this code.** If the physical pass reveals that Pakistani installed-base printers need a class driver and a back-channel the agent cannot provide over TCP/OS-spooler, the client question reopens — and note the shipped transports are **write-only**, so paper-out currently reads as a printed ticket.
- **Hardware reality.** The corpus's own reference hardware is a PKR ~25k **Android tablet**, and the layout gate ships 10.1″ rows. If the fleet is predominantly Android rather than Windows, RN wins and the 22 components get rewritten against RN primitives (~4,100 prod + ~3,500 test LOC).
- **PPI.** If the physical-millimetre design language is judged non-negotiable and the agent cannot supply panel PPI reliably, a browser till renders every touch target at ~45% of its ergonomic size **with nothing on screen looking wrong** — which is the worst failure mode in the whole design system.

---

## THE MAGNITUDE, PLAINLY

Under my recommended forks (relay, pool, PWA + agent):

- **Requirements and design: throw away ~2%.** Two clauses amended, two specs written, three split without renumbering. 805 FRs and 19,803 citations survive.
- **Production code: throw away 10–15% of 66,842 LOC** ✓ — roughly 8,000–10,000 lines, chiefly the Electron shell, the mesh election/relay machinery, the duplicated layout gate, and the single-restaurant ops kit. Test code takes a harder hit, ~20–25%, because the mesh and Electron harness suites go with them. Under cloud-first (fork 1c) the client-side number roughly triples.
- **Genuinely new code: 15,000–25,000 lines that exist in no form today** — the control plane (2 lines of source against 28 FRs), the commercial plane (**0 hits across 291 shipping files**), deployment (0 containerization artifacts), observability (0), fleet update (0), and 20 of 22 doc-22 operations FRs.

**This is not a rewrite. It is a missing half.** The half that was built is unusually good — 543 domain tests with mutation-proven isolation, 368 encoder tests, a two-tenant attack register days old, CI rails that catch defect classes no off-the-shelf tool expresses, and a requirements corpus with zero dangling references across 91% of the source tree. The half that was never built is the SaaS. The largest single risk in the whole picture is not code at all: **you are not in the money flow**, so the take-rate the business model rests on is currently an invoice a restaurant can decline. Settle that before you settle anything else on this page.