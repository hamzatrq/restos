# RestOS MVP — the build plan

**Basis:** `plans/saas-pivot/plan-of-record.md` §0, rulings **R1–R45**. A plan that contradicts one of
those is wrong, not creative. This document says **what gets built, in what order, and what "done"
is**; it does not re-take a ruling and it does not re-write a spec.

**Measured 2026-08-20** on `44c5c71` with `grep -a` throughout. Every claim below carries the command
that produced it. Where an incoming finding disagreed with the tree, the tree won and the correction
is marked **⚠ correction** with the date — three of those are in §7 and one of them was inherited
from `AGENTS.md` and re-labelled "re-confirmed" by a measurement pass.

---

## §0 — How to read this, and how to write into it

Five disciplines, each learned by this repo at a price it wrote down.

1. **State the RULE, not the STATE.** A dated measurement inside a normative clause is a claim with a
   shelf life. `staff-over-the-wire.md` step 0 carried the clause *"the store has no version axis
   today"* into a wire contract; it was false eleven days later. Where a step below must quote a
   state, the state is dated and fenced off from the instruction.
2. **Name the class you closed and the neighbouring case you did not.** Every step has a
   *"…and not"* line. `AGENTS.md` instance 15 is the worked example: `01-F64` closed *two identities
   on one file* and a shipped comment claimed it closed *one identity, two processes*, which is one
   keystroke away in English and nothing alike in code.
3. **The step lists are NOT a status board.** `staff-over-the-wire.md` records that exact confusion
   costing real time — its task table was the original scope and was read as progress. Nothing here
   tracks completion; `git log` and a re-measurement do.
4. **Done is the named check passing, never your own judgment** (`24 §3`). Every step names its
   acceptance, and per the round-3 law a protected-path suite is not accepted until it has been
   **mutation-proved**: build a plausible implementation out of tree, take the suite green, then
   break the specific thing each assertion claims to own and confirm *that* assertion fails.
5. **Cite FR IDs that resolve.** Every ID in this document was checked with
   `grep -arn "^- <id> " specs/`. An ID that greps to nothing is invented (commandment 2).

**One number to distrust before you start.** The four measurement passes that fed this plan reported
170d + 16d + 30d + 49d. **Do not add them.** They overlap: signup is costed in passes 1 and 4, the
seven surfaces in passes 1 and 2, the corrective acts in passes 2 and 3. The sum is not a schedule
and is not quoted anywhere below.

---

## §1 — The bar (R43)

> **R43: you can demo it end to end to a prospective pilot.** This sets the VERIFICATION bar, not the
> scope. R43's own warning stands: `01-F1` makes any real day sold under it permanent, so *demoable*
> is the gate for calling the MVP done, not for letting a restaurant trade on it.

The demo is fourteen moves. **Nobody types a shell command at any point**, which is R40 stated as a
test rather than an aspiration. Each move names what must exist for it to happen.

| # | The move the prospect watches | Requires |
|---|---|---|
| 1 | A restaurateur opens a public page, types her name, her restaurant's name and an email, and passes whatever admission control we chose | `28-F12`, `28-F13`, **`28-F15`'s named control** |
| 2 | She receives her first credential and signs in — **without an operator standing beside her** | `15-F26` (amended), `15-F27`, and the outbound capability `28 §9.21` blocks on |
| 3 | She names a branch, and the back office walks her through setup | `28-F13` refuses to invent a branch; `14-F26`'s wizard |
| 4 | She types two menu items with prices, per branch and per channel, and publishes with *apply now* | `01-F60` (no fallback), `14-F28`/`14-F36` timing choice, `14-F29` grid |
| 5 | She adds two cashiers with PINs and a grid order | `14-F14`, `14-F39`, `01-F61`, `11-F22` |
| 6 | She generates a **pairing code** and types it into a till; the till enrols itself | `01-F25`, `01-F73` (a)+(b) |
| 7 | The till's honesty strip says it is paired, meshed, and holding her roster at version N | `00 §5.7`, `01-F56`, `01-F74` (a) |
| 8 | **Her own cashier** appears on the identification grid — not Ayesha, Bilal, Hina — and unlocks with her own PIN, verified offline | `01-F28`, `01-F61`, R21, R23, R25 |
| 9 | The cashier opens the day with a float, rings the two items at the prices typed in move 4, on a channel she picks | `02-F42`'s four, `01-F53`, `02-F12` |
| 10 | A **second device on the same LAN with the WAN unplugged** shows the ticket oldest-first with an aging band, and DONE marks it ready | R36, `01-F12`..`01-F15`, `03-F14`, `03-F46`, `00 §5.1` |
| 11 | The cashier **voids a line**; a manager approves on the same device without signing the cashier out; **a number moves** | `02-F8`, `02-F20`, `02-F41`, `01-F30`'s three zero terms |
| 12 | Settlement shows an **itemised tax line**, quick-cash keys precompute the change, the receipt renders (printerless is a supported configuration and the band says so) | R39, `16-F2`, `27-F24`, R37, `03-F22`/`03-F51`, `03-F5` |
| 13 | Shift closed, day closed, her own reconciliation on `Me`, and the owner summary for that business day in the back office | `02-F23`, `01-F46`, `14-F31`, `12-F10` |
| 14 | She triggers an export and receives **her org's data and no one else's**; last night's per-tenant backup exists and **a restore of it has actually been performed** | `22-F16`, R38, `22-F8`, `28-F11` |

**Move 15 is the one nobody demos and it is on the bar anyway.** A *second* restaurant signs up on the
*same* deployment and completes moves 1–13 without anyone editing an environment file. R17 rules 5–10
pooled pilots; `28-F20` is the measured gap; and the failure mode is that all four processes report
success and no till ever sees a menu.

```
services/api/src/server.ts:416-417   ENABLED_BRANCHES / ENABLED_CHANNELS parsed from env
services/api/src/server.ts:466       enabled: { branches: env.ENABLED_BRANCHES, ... }  ← one per PROCESS
services/api/src/trpc.ts:231         org_id: user.org_id                               ← one per SUBJECT
```

**What the bar deliberately does NOT include:** a Friday night. R43 says *demoable*, and §8 lists what
that buys us the right to defer.

---

## §2 — What is already true (dated, because it will rot)

Measured 2026-08-20. This section exists so a cold session does not rebuild something. It is a
snapshot and it is the one part of this document with an explicit shelf life.

| Claim | Command |
|---|---|
| The LAN mesh **is hosted** in both apps — the "no host runs the mesh" line is retired | `grep -arn createLanMesh apps/*/src` → `pos-electron/src/main/index.ts:701`, `pass-kds/src/main/index.ts:312` |
| …and **cannot start on any shipped binary**: zero production writers for the LAN credential, so both fail-closed guards fire on every launch | `grep -arn setLanCredential apps services packages --include=*.ts` → 2 non-test hits, both the port and its impl (`device-store.ts:271,1391`); `apps/pos-electron/src/main/mesh.ts:175,193` |
| The wire is **16 distinct kinds**, resource-discriminated since step 5 | `grep -aoP 'kind: z\.literal\("\K[a-z_]+' packages/sync-protocol/src/messages.ts \| sort -u \| wc -l` → 16 |
| `PERMISSION_ACTIONS` is **26**, and none names an org, a branch or a tenancy act | `awk '/^export const PERMISSION_ACTIONS/,/\] as const/' packages/domain/src/permissions.ts \| grep -aoP '^\s+"\K[a-z_.]+' \| wc -l` → 26 |
| `seams:check` is clean; the owed register is **28**, printed by the rail itself | `pnpm seams:check` → `REAL_EXIT=0`, `28 marked @unreached-owed`, `250 production modules (141 shipping)` |
| `pnpm verify` is **seven** rails; **CI runs five steps and four of the seven gate nothing** | `grep -a '"verify"' package.json` vs `grep -aoP 'run: pnpm \K.*' .github/workflows/ci.yml` |
| `layout:check` covers **two of seven surfaces** | `grep -a '"layout:check"' package.json` → `pos-electron && pass-kds` |
| The back office **already ships the target stack** — genuine shadcn, not a lookalike | `grep -a 'radix\|cva\|class-variance\|lucide\|tailwind' apps/backoffice/package.json`; `apps/backoffice/src/components/ui/button.tsx:3-6` imports `Slot` + `cva` + `cn` |
| Four apps are **2-line stubs**; two of them (`owner`, `platform-admin`) are R19 surfaces | `for d in apps/*/; do find $d/src -name '*.ts*' \| wc -l; done` → owner 1, platform-admin 1, pos-rn 1, rider 1, storefront 1, waiter 1 |
| **No outbound mail anywhere**, and doc 18's allowlist contains no such word | `grep -rail -E 'nodemailer\|sendgrid\|postmark\|mailgun\|@aws-sdk/client-ses' --include=package.json apps services packages` → NONE |
| **No tax anywhere**; `services/tax` is a stub | `cat services/tax/src/*.ts` → `// Scaffold stub …` + `export {};` |
| **No health endpoint, no TLS** on either service | `grep -arn 'healthz\|readyz' services/*/src/*.ts` → none; both `app.listen({ host: "0.0.0.0" })` (`api/server.ts:544`, `sync-gateway/server.ts:235`) |
| Seven service `build` scripts are `echo` stubs; there is **no `docs/` directory**, so `22-F5` is unenforceable as written | `grep -al "no build yet" services/*/package.json \| wc -l` → 7; `ls -d docs` → no such directory |
| The backup is **not per-tenant**: one `pg_dump` of the whole database | `ops/backup.sh:220`; `grep -c org_id ops/backup.sh` → 0 |
| **No producer** for any corrective act; `order.cancelled` has no payload schema at all | per-type `grep -arn '"<type>"' apps/*/src services/*/src packages/*/src` excluding tests → schemas, folds, permission maps only; `order.cancelled` → **zero hits anywhere** |
| The seven gateway provisioning commands are declared and their argv parsing is separated from their action | `grep -a '"scripts"' -A 12 services/sync-gateway/package.json` → `migrate create-org create-branch create-owner list-tenancy provision-device revoke-device` |

---

## §3 — Track A: the planes (R41)

Track A is device-plane and cloud-plane plumbing that survives any restyle. It collides with Track B
only in `apps/pos-electron`, and the collision is manageable because A is `packages/sync-client` /
`services/*` and B is `packages/ui`.

**Blast-radius tier is R35's, and it decides review depth, not importance.** FULL = fresh-context
adversarial rounds repeated until SHIP (credentials, tenant isolation, money, the wire, the permission
matrix). ONE = a single review (UI, read paths, config, docs). **The tier is on the CHANGE, not the
package** — a step touching one protected file and one config file is FULL.

### A-I · Finish the staff chain — the R21 blocker

`R21` makes this a hard blocker rather than a deferral: every shift sold under
`packages/device-config/src/dev-staff.ts`'s three fictional people writes an `actor_user_id` that
`01-F1` forbids correcting. The chain's steps 0–6 have landed; what follows is steps 7–10 plus the
parked 2b branch.

**A1 — the device staff consumer, and the participation status in the same change.**
*Changes:* `packages/sync-client/src/cloud-session.ts` (both reference arms are hard-coded to
`catalog` — `:566` and `:570`), a staff accumulator on `catalog-fetch.ts`'s shape, `staff.ts` gaining
`grid_ordinal` (`01-F61`), `status` (`11-F22`), an optional `pin_hash` and the `divergent` detection
`staff_state` cannot currently hold (`staff.ts:125` is `(id, version)`), plus
`packages/domain/src/permissions.ts`'s `AuthSubject`.
*Closes:* `01-F28`'s device half, `01-F75`/`01-F77` on the read side, `11-F22`'s authorization clause.
*Tier:* **FULL** — credentials *and* the permission matrix.
*Preconditions:* none in code; steps 5 and 6 landed. **The parked branch `feat/step-2b-participation-status` (`4edc2d2`) must be RE-AUTHORED, not rebased** — it puts `status` on the person (`AuthSubject`), and `11-F22` was disambiguated to put participation **per assignment** (`packages/domain/src/tenancy.ts:355-377`, `services/sync-gateway/src/schema.ts:498-506`). It is also 31 commits behind.
*Acceptance:* a `24 §3` suite from a separate session, mutation-proved. It must exercise a **removal**, a `needs_snapshot` and a `stale` — `staff-over-the-wire.md` finding 8 records those three legs as unowned, and trap 6's shape is a fixture that only ever applies a snapshot to an empty registry.
*Closes the class… and NOT:* it closes *a device holds its branch's real people and an inactive person authorizes nothing*. It does **not** close per-user permission overrides (`01-F26`, unmodelled and named as unmodelled in two shipped files), and it does not close the cloud half of `11-F22` — `services/api/src/trpc.ts:229-233` builds its subject from `UserRecord.assignments`, which strips a status the database already stores.

> **⚠ A1 is one PR because half of it is an outage.** Measured on the parked branch: landing the
> guard ahead of its producer took `apps/pos-electron` 1188→63 failed and `services/api` 287→98
> failed, with titles that are the product (*"a CASHIER may 86"*). `11-F22` forecloses defaulting an
> absent status to `active` by name. **A fail-closed guard shipped ahead of the fact it reads is not
> a partial fix; it is a restaurant that cannot sell** (`01-F17`, commandment 4).

**A2 — the staff honesty surface.** `staffRefusal` beside `catalogRefusal`, rendered beside
`CatalogHealth`. Closes `01-F56`'s *"observable in device health"* for credentials — today
`grep -arn 'staffRefusal\|StaffHealth' apps services packages` returns **zero hits of any kind**.
*Tier:* ONE. *Preconditions:* A1. *Acceptance:* the getter is **required** in the deps bag, and the
mutant is `server.ts` wiring a no-op — trap 4's shape, where the fix for the defect reproduced the
defect inside itself.

**A3 — retire the dev seed.** Deletes `dev-staff.ts` and touches `apps/pos-electron/src/main/index.ts`,
`apps/pass-kds/src/main/index.ts` **and both** `ops/startup/*.bat` —
`restos-counter.bat` does `goto refused` without `RESTOS_DEV_PIN_HINA`, so deleting the module alone
produces a Windows till that will not boot at 05:00. It must also catch the **fifth roster
declaration** at `apps/pos-electron/src/layout-gate/preload.ts`, which lives under a non-test filename
and is invisible to a sweep that follows `dev-staff.ts`'s own delete instruction.
*Tier:* ONE. *Preconditions:* A2 **proven on a real till, not a suite**.
*Closes the class… and NOT:* it stops the bleeding; it does not clean the wound. Every shift already
sold as Ayesha, Bilal or Hina stays attributed to a UUID that resolves to nothing (`01-F1`), visible
in `02-F23` reconciliation, the `shift_cash` fold and `audit.login`.

**A4 — R28's never-received-roster refusal at boot.** A till with no roster for its key is a till
nobody can sign in to; `00 §5.7` requires that loud at boot and today the seed masks it. *Tier:* ONE.
*Preconditions:* A3 (before the seed goes, the refusal is unreachable; after it goes, its absence is
a stopped till).

**A5 — `01-F76`'s `foreign_artifact` device refusal.** It exists only in prose:
`grep -arn foreign_artifact packages/sync-client/src/*.ts` → **one hit, a comment at
`cloud-session.ts:562`**. It is the belt to `01-F71` (e)'s brace and the reason a mis-set `branch_id`
is a permanently silent roster failure. *Tier:* **FULL** (isolation). *Preconditions:* A1.

**A6 — a device consumer for `purge_command`.** Produced three times
(`services/sync-gateway/src/gateway.ts:427,1094,1318`) and consumed by nobody
(`cloud-session.ts:656` drops it). `staff.ts:60-71` justifies hard removal *by citing `01-F42`*, and
`01-F42`'s local purge does not exist on the device — so **a revoked till keeps its full roster of
Argon2id hashes indefinitely**. *Tier:* **FULL** (credentials). *Preconditions:* A1.

**A7 — the harness (`packages/testing/src/sim-cloud.ts`).** Its `processInbound` switches on four
kinds and has no reference arm, so nothing in H-01 can drive the staff or catalog transport. *Tier:*
ONE. *Preconditions:* none. **It is not optional and it is not free** — every later step's oracle is
poorer without it.

### A-II · Pairing, and the credential the mesh needs

**These two are one build.** `01-F73` (b)'s cloud half and `01-F25`'s back-office pairing code are the
same missing thing seen from two ends, and the LAN mesh is a third consumer of it. Building them
separately is how one shape gets three writes.

**A8 — the cloud PKI half.** Issuer storage, a migration, an enrolment route, and the pairing-code
model. Today: `grep -an 'issuer\|lan_pki\|cert' services/sync-gateway/src/schema.ts` → **empty**, and
`ls services/sync-gateway/drizzle/*.sql` tops out at `0012_staff_roster.sql`. `packages/lan-pki` can
mint an org issuer and a device certificate and carries three `@unreached-owed` markers
(`src/index.ts:61,81,120`) naming exactly this.
*Tier:* **FULL** (credentials).
*Preconditions:* **a spec act first.** `01-F25` specifies the pairing code in one clause and `01-F73`
(f) leaves the surface and the key's home open. Format, TTL, one-time claim, rate limit and refusal
protocol are `A3(01)` in the plan of record and are commandment 9 — write them before code.
*Closes the class… and NOT:* it closes *an owner admits a device from the back office*. It does not
close `01-F73` (f)'s offline-root question, and it does not close revocation's LAN half, which is a
**field of the roster** (`01-F74` (c)) and therefore blocked on A10.

**A9 — the device pairing path.** The keypair is generated on the device (`01-F73` (a)) and this is
what finally writes `setLanCredential` and `LanRoster.apply`, both of which have zero shipping callers
today. Both fail-closed guards then stop firing: `apps/pos-electron/src/main/mesh.ts:175` returns
`unmeshed("not paired — no LAN credential (01-F73)")` and `:193` returns
`unmeshed("no branch roster received yet…")` — the same pair at `apps/pass-kds/src/main/mesh.ts:171,189`.
*Tier:* **FULL** (credentials + wire).
*Preconditions:* A8.
> **⚠ The mesh's first production exposure is this PR.** Today the branch LAN is safe *only* because
> both guards fire on every device. The change that writes a credential is the change that opens a
> listening socket onto the branch money ledger on `0.0.0.0`. `01-F74` (c) forbids dropping either
> half of admission as redundant — chain alone admits any device the issuer ever signed, with no CRL
> on a branch LAN and none coming.

**A10 — `01-F74` (b)'s roster distribution.** **UNBUILDABLE, not unbuilt, and the FR says so itself**
(`specs/01-kernel-sync.md:205`): `01-F75` closes the resource set at `catalog` and `staff` and
specifies no signature envelope, so the signed device roster has no frame to ride. It needs a named
doc-01 amendment — the signature envelope **plus** the `device_roster` member — in one change, before
any code. *Tier:* **FULL** (the wire). *Preconditions:* the amendment.
> Adding a third member re-opens step 6's dissolved refusal question on a fleet where some gateways
> serve it and some do not, and it inherits a **session-killing** refusal by default:
> `services/sync-gateway/src/server.ts:108-112` wraps every `conn.handle` in a `.catch` that closes
> the socket. A refusal inside `handle` is a **disconnection**, not a refusal.

**A11 — `01-F12`'s mDNS half.** Peers are typed into `RESTOS_LAN_PEERS` today. `18 §14:197` lists mDNS
as an **open registry item**, so adding one is an `18 §15` dependency-governance event, not an
implementer's call. *Tier:* ONE (config) once the dependency is ratified. **Manual IP is a supported
configuration for the demo**; this is not on the bar.

### A-III · The corrective acts — R21's second blocker

**A12 — the conservation ruling, then the schema, then the fold, then the surface.** This is a chain
and it starts with a decision, not a build. `plans/wave-1/f30-conservation-terms-options.md` is
explicitly **REFUSED as under-determined**. The blocking sub-question is *not* a merge rule: **no
idempotency key exists on any of the four corrective payloads**, and `01-F31` says a fold dedupes by
attempt key. Minting one is a payload change to four protected schemas.

```
packages/sync-client/src/folds/merge.ts:865-885   the four cases `return;` — "projection-inert"
packages/domain/src/invariants.ts:70              no parameter for void_value / comp_value / discounts
```

*Tier:* **FULL** (money). *Preconditions:* the founder ruling in §9. *Acceptance:* the fold's merge
rule is mutation-proved against the merge-invariance oracle (law 1: no ordering metadata may reach a
projected value), and **the demo's move 11 moves a number** — a void that changes nothing is the shape
this step exists to remove.
*Closes the class… and NOT:* it closes *void, comp, discount and refund are emittable, authorized and
projected*. It does **not** close `order.cancelled`, which has **no payload schema at all** — `grep
-arn 'order.cancelled' apps services packages` → zero hits anywhere, including tests — so it is
unemittable under `01-F4` rather than merely unbuilt, and R21's list does not name it.

**A13 — `discount.recorded`'s permission path.** It has **no row in `WRITE_ACTIONS`**
(`apps/pos-electron/src/main/authorize.ts:111-142`, verified by reading the table) and fails closed to
`deny`, so a discount surface cannot be built even with a producer. `authorize.ts:102-110` records
this as *a finding, not an oversight*: `02-F20` splits discounts at an org threshold, there is no
`canDiscount` predicate on `canPayOut`'s pattern, and `00 §7` layer 2 holds no threshold to feed one.
`payment.refunded` is likewise absent although `refund.issue` exists in the matrix
(`packages/domain/src/permissions.ts:352`). *Tier:* **FULL** (matrix). *Preconditions:* the threshold
question in §9.

**A14 — `14-F40` / R33's change-my-PIN.** Wire-only today: the gateway **refuses**
`credential_change_request` by name (`services/sync-gateway/src/gateway.ts:1374-1394`, deliberately,
rather than claiming an outcome it cannot honour) and no device produces one. Without it R29's debt —
the owner knowing every cashier's PIN for ever — compounds per shift and `01-F1` makes each shift
permanent. *Tier:* **FULL** (credentials). *Preconditions:* A1.

### A-IV · Tenancy, tax, and what a pooled pilot needs

**A15 — permission actions for the tenancy plane.** The signup wizard's first procedure does not fail
a test, it **fails to start the process**: `services/api/src/router.ts:238`'s
`assertEveryProcedureIsGated` throws at boot, and `PERMISSION_ACTIONS` has no `org.*` or `branch.*`.
*Tier:* **FULL** (matrix). *Preconditions:* **a spec PR first** (commandment 9). The destination is
settled by three precedents — `14-F30` (`device.manage`), `02-F46` (`availability.toggle`), `02-F47`
(`customer.record`) each landed the action in the FR that owns the **surface**, not in Appendix A.

**A16 — `28-F20`: the enabled `(branch, channel)` set out of `process.env`.** Ruled already
(`28-F20` (iii): layer-2 data, one declaration, no fallback). This is move 15 of the demo, and it is
**invisible with one tenant and wrong with two**. Also unbuilt beside it: `services/api/src/tenancy.ts:24`
records that nothing writes the org/branch name tables, so every tenant renders UNNAMED.
*Tier:* **FULL** (isolation). *Preconditions:* none. **Sequence it BEFORE the surfaces**, not behind
them — building and demoing seven surfaces against a deployment that cannot serve tenant #2 is how
this defect reaches a pilot.

**A17 — signup (R40).** The surface itself is the smallest part. It is blocked on three things that
are not code: `28-F15`'s admission control (a named founder choice), credential delivery (`28 §9.21` —
there is no outbound mail capability and doc 18's allowlist contains no such word, so adding one is an
`18 §15` event), and A15's actions.
*Tier:* **FULL** (credentials + isolation). *Preconditions:* A15, A16, and the two rulings in §9.
*Closes the class… and NOT:* it closes *a restaurant reaches an org, an owner login and a pairing code
with nobody touching a terminal*. It does **not** close account recovery — one owner, one password,
`create-owner.ts:194` refuses a second, and `15-F15`'s vendor impersonation route is unbuildable
(`28-F19`), so **a locked-out pilot is an unadministrable org whose `org_id` can never be reused**
(`01-F68`). Recovery is on the bar's move 2 by implication and must be built with it.

**A18 — `18 §2`'s dependency direction, decided once.** The callable provisioning actions live in
`services/sync-gateway`; signup and the control plane both need `createOrg`/`createBranch`/`createOwner`,
and a `services/api` import of them is a service→service import `18 §2` forbids. The repo already took
that import once for `runAuditor` and **left the move owed**. Doing it twice makes it a pattern rather
than an exception. Decide before A17: either the surface is hosted **on** the gateway, or provisioning
moves to a package first. *Tier:* ONE (a move, not a rewrite) if taken early; FULL if taken late,
because by then it is two named violations on the credential path.

**A19 — tax (R39).** A from-zero build with **three independent absences**, and closing only one
builds a setting nothing can read:
1. no org-settings storage anywhere — `grep -ain 'org_settings\|settings' services/sync-gateway/src/schema.ts` → no rows;
2. `config.changed` has an `01 §4` catalog entry and **no payload schema**, so the cloud write throws under `01-F4` (`services/sync-gateway/src/org-events.ts:33` lists it as legal to route and it is impossible to emit);
3. **layer 2 has no transport to a device at all** — three shipped files say so in the same words (`apps/pos-electron/src/main/station-routing.ts:44`, `hardware-tier.ts:62`, `packages/device-config/src/aging.ts:23`) and each works around it by reading the environment.

*Tier:* **FULL** (money) for the payload and the fold; **FULL** again for `packages/escpos`, a
protected path where `receipt-document.ts:250` emits exactly one `Total` row at a 32-column floor
(`03-F49`). *Preconditions:* the two rulings in §9 (posture-engine vs single rate; inside vs beside
`billed_total`). The nearest shipped mechanism for (3) is `01-F52`/`01-F75`'s reference-data path —
the same path the staff roster now rides — which makes it a real candidate rather than a shape.

**A20 — R38: per-tenant backup, a restore actually run, owner export.** The substrate exists —
`services/jobs/src/index.ts` runs `runAuditor` on a BullMQ repeatable with a per-org loop, which is
exactly the shape a per-tenant backup needs. What does not: `ops/backup.sh` dumps the whole database
(`:220`, `grep -c org_id ops/backup.sh` → 0), so on a pooled deployment **one artifact holds every
tenant and handing it to an owner is a cross-tenant disclosure**. `22-F16`'s export does not exist in
any form and `governance.export_generated` has no payload schema
(`grep -ac governance packages/domain/src/registry.ts` → 0).
*Tier:* ONE for the job; **FULL** for the export (isolation).
*Acceptance:* **the acceptance is a restore, not a dump** (R38). Restore into a scratch database and
run the Auditor refold (`22-F8`) as the proof. `pg_dump`/`pg_restore` are not on the box the kit was
written on (`ops/README.md:646`), so the cloud half has only ever been exercised through its two
failure paths.
*Closes the class… and NOT:* it closes *a tenant's data can be recovered and handed over*. It does
**not** lift `22-F1`'s ≤5 min RPO — a nightly dump is `22-F22`'s explicitly interim posture and the
real RPO is up to 24 h — and it does not schedule the **till** half, where the machine holding the
only copy of every unpushed sale is backed up as often as somebody remembers to type a command
(`ops/README.md:424-431`).

**A21 — the four ops items R42 does not defer.** TLS (both services bind `0.0.0.0` in plain HTTP/WS,
so a till over the public internet sends its device token in clear — one day behind a reverse proxy,
not an infrastructure project); `/healthz` + `/readyz` (there is no machine answer to *"is this tenant
alive?"*); one immutable image per service on the same box; and a log/alert sink. *Tier:* ONE, except
TLS which is FULL (credentials in transit). R42 says no infrastructure **project**; it does not say no
deployment **document**, and `ops/` is single-restaurant-shaped today — editing it for the pooled case
writes doc 29 in bash.

---

## §4 — Track B: the design language and the seven surfaces

R45 is the largest single item on the critical path and was chosen deliberately: **all seven surfaces
on the new language before any restaurant uses it**, so the counter is rebuilt although it works.
R20 puts the screens in `packages/ui` runtime-agnostically so R3's later host move changes the process
and the IPC boundary, not the screens. R15 requires `packages/ui` rebuilt **in place**, tests ported
suite by suite, **coverage never dropping**.

**B1 — D1: the identity decision.** Palette, type pairing, spacing scale, radius, elevation, motion,
delivered as rendered artifacts to react to. **The accent hue is a founder call and the industry
offers no convergence to steal** — Toast red/orange, Square monochrome, Lightspeed red, TouchBistro
blue, Loyverse blue-green. This is R12's *invent it* half, not R34's *steal it* half; plan-of-record
§6 rule 2 puts it squarely with the founder (*"Pay turning from petrol teal to electric blue is
yours"*), and `27-F14`'s August amendment freed the accent slot from any pinned hue.
**Type does not move.** `packages/ui/src/tokens/tokens.json` already ships five composite typography
tokens on one bundled family (IBM Plex Sans, OFL, in `packages/ui/src/fonts`) — one neutral grotesque
with tabular figures, numerals two to four steps above body, which is what Toast, Square and
Lightspeed all do. `27-F26`'s bundling is the defence and must not be undone.

**B2 — D2: token architecture on Tailwind v4, with the touch-scale layer over it.**
> **The trap is already an FR.** `27-F73` states it: shadcn ships fixed pixel control heights (`h-9`,
> `h-10` = 36–40 px), *"and a pinned pixel constant is precisely what `27-F68` (a) forbids. 40 px is
> 10.1 mm at 100 PPI and 7.2 mm at 141 PPI, against `27-F8`'s 20 mm floor — so adopting a shadcn size
> class unmodified is a breach of an existing law, not a style choice."* `physical.tsx`'s mm-of-glass
> conversion survives and sits **over** shadcn.
> **And the scale is PER SURFACE, with a written precedent.** `apps/backoffice/src/components/ui/button.tsx:11`
> already records the ruling that `27-F8`'s tile deliberately does not apply to a mouse-driven owner
> surface. Applying the touch scale uniformly across seven surfaces puts thumb-sized controls on a
> menu editor; applying it nowhere regresses the counter.

**B3 — D3: the component inventory.** `packages/ui/src/components/index.ts` is **22** exports
(`wc -l` → 22, one per line, the convention the 15/16/17/18 counts before it used; `PanelRoot` in
`src/physical.tsx` stays outside it as it always has). Decide per component: adopt, wrap, or keep
bespoke — money display and the keypad are likely bespoke. **Two components the reconciliation found
missing and every mainstream product ships:** a **modifier sheet** (`02-F3`; there is no picker on
glass, and `grep -an Modifier packages/ui/src/components/index.ts` returns nothing) and a **quick-cash
tender surface** (`27-F24`'s *the system computes, staff read*, with next-note rounding derivable from
Rs 50/100/500/1000/5000 and the change due precomputed onto the button face).

**B4 — D7: a design QA rail the browser surfaces can actually use.**
> **⚠ The existing gate is not portable and the argument that rejected Playwright does not transfer.**
> Both implementations are `electron-vite build && electron out/main/layout-gate.js`, opening a real
> `BrowserWindow` from the app's own **imported** window options; a Next.js surface has no window
> options to import. `AGENTS.md` rejects Playwright because *in a headless browser you SET the
> viewport*, making it blind to the defect where the Electron app does not GET 1366×768 — correct for
> Electron, and **irrelevant to a browser surface where the viewport genuinely is whatever the user's
> browser gives**. Playwright has been on `18 §14`'s allowlist since Draft 1
> (`specs/18-engineering-handbook.md:185`). The right answer is a **different instrument** — a
> responsive breakpoint sweep plus a contrast check — built **once** against the back-office template.
> Four bespoke gates is how the existing 4,480 lines happened
> (`find apps/*/src/layout-gate -type f | xargs wc -l` → 4480).

Meanwhile all back-office UI tests are happy-dom (`apps/backoffice/vitest.config.ts:44`), which
performs **no layout at all** — every `getBoundingClientRect` is zeroes. That is the same blindness
that hid nine layout defects on the counter, and five of seven surfaces will be built inside it.

**B5 — D4: the counter screens.** Order, Pay, Cash, Orders, Me, Sold out, Unlock, Escalation.
Order screen per R13: dense grid, priced, categorised, images, search, **workable by keyboard, mouse
and touch alike**. *Preconditions:* B1–B3, and the founder decisions in §6 that are positional
(`27-F4` makes each a breaking change with an acclimation window, so they are decided **once, before
pilots**, not discovered after muscle memory forms).

**B6 — D5: the other six surfaces.** See §5.

**B7 — W1: rebuild `packages/ui` in place.** R15's *tests ported suite by suite, coverage never
dropping* is the acceptance. **Sequencing question, and it is real:** the layout gate imports the
app's real window options and a shadcn rebuild changes every measured box, so rebuild-then-remeasure
loses the gate's protection exactly when the layout is most volatile. §9 files this as an
engineering call with a recommendation.

---

## §5 — The seven surfaces (R19/R45)

| # | Surface | What exists (measured 2026-08-20) | What the language changes | What it must do for a pilot |
|---|---|---|---|---|
| 1 | **Counter** `apps/pos-electron` | The most complete thing in the repo: **20,075 production lines / 35 files** (`find … \| grep -av '\.test\.' \| grep -av __acceptance__ \| xargs wc -l`). Runs end to end. The only surface with a layout gate. `05-F29`'s prerequisite is closed — `main/approval-record.ts:188` really does append `approval.requested`, wired at `index.ts:1240`, reached at `:1870` | **Rebuilt, by R45's explicit choice.** Every positional decision in §6 lands here first | Moves 8–13 of the demo. Plus the two things it cannot do today: **void/comp/discount** (A12) and a **repeat-customer quick entry** at `02-F28`'s ≤30 s |
| 2 | **KDS / pass** `apps/pass-kds` | A running app: **4,838 production lines / 19 files**. Cook sees the branch queue oldest-first with a live amber/red timer and presses DONE. Its own layout gate | Restyle. `03-F46`'s paging is the **convergent** idiom (§6) and must survive | Move 10, **over the LAN with the WAN unplugged** — which is why R36 is on the bar. Owed by its own author and still open: nothing at T2 emits `served`, and `27-F27`'s angular cap-height is measured by nothing |
| 3 | **Back office** `apps/backoffice` | Real and four-tabbed: **6,092 production lines / 27 files**; `components/workspace.tsx:35` declares menu, devices, summary, staff. **⚠ It is ALREADY on the target stack and no planning document says so** — genuine shadcn (`components/ui/button.tsx:3-6` imports `Slot` + `cva` + `cn`), Radix, Tailwind v4, lucide | Least of the seven. **This is the template for surfaces 4–7** and nothing currently points at it | Moves 3–5, 13, 14. Plus `14-F26`'s wizard and `14-F27`'s checklist, neither of which exists (`grep -arln 'wizard\|go-live\|checklist' apps/backoffice/src services/api/src` → none) |
| 4 | **Control plane** `apps/platform-admin` | **The app is 1 file.** But the provisioning **logic** exists and is tested on the gateway across 7 declared commands, and **it is lift-ready**: argv parsing is separated from the action in every one (`create-org.ts:97` `parseCreateOrgArgs` vs `:137` `createOrg`; same at `create-branch.ts:81/118`, `create-owner.ts:99/181`, `provision-device.ts:121/167`) | Built from nothing on the back-office template | A console that calls the **actions directly** rather than reimplementing them — the single biggest cost saving available. Gated by `28-F17`'s missing boot-asserted authorization on the plane whose subjects see more than one tenant |
| 5 | **Signup** | **Zero surface lines.** `services/api/src/router.ts:31` — `PUBLIC_PROCEDURES` is one member, `auth.login`. Doc 28 is substantial and `28-F12`/`28-F13` own this | Built from nothing. **`21`/`27` have never been asked for an unauthenticated surface** | Moves 1–2. Blocked on §9's admission-control and credential-delivery rulings, not on design |
| 6 | **Owner app** `apps/owner` | **The app is 1 file** — but the PULL half shipped inside the back office under `14-F31`: `components/owner-summary.tsx` renders sales-by-channel, per-cashier cash expected-vs-counted, top items, the hourly curve, `12-F11`'s margin omission and `12-F8`'s server-stated data age, backed by a real fold (`services/api/src/summary.ts` folds one business day in BigInt) | **Host undecided — see §9.** `12 §8` and `14-F31` reserve `apps/owner` for Expo; R3 killed the RN till and R22 moved the manager to a browser | Move 13 is already servable from surface 3. What is genuinely missing is `12-F9`'s **push**, and there is no push infrastructure anywhere |
| 7 | **Manager console** `apps/manager` | **A shell that says so in a shipped header.** `App.tsx:1`: *"⚠ THIS IS A FEASIBILITY PROBE, NOT THE MANAGER CONSOLE, AND IT MUST NOT BECOME ONE."* Production is **1,188 lines**, of which `alarms.ts` + `home.ts` + `index.ts` = **671 lines of host-portable pure derivation** and `branch.ts` + `App.tsx` + `probe.ts` = 517 bound to Expo/RN/op-sqlite | R22: **a browser console**, superseding `05-F29`. The 671 portable lines survive the move; the 517 die with it | Move 11's **remote** half — which is NOT on the demo bar (§8), because it costs a wire kind, a read model and a credential answer nobody has given |

**Two facts about surface 7 that decide how it is ported.** (i) `packages/ui` really is
host-independent — 22 components, zero `from "react-native"` imports anywhere in the package — so R20
holds. (ii) **The manager's composition root is untestable by construction and three mutants live in
that gap**: `branch.ts` imports `@op-engineering/op-sqlite` at module scope, so no test in the
repository can load it, so no test has ever called `attachBranchSlice()`. `apps/manager/CLAUDE.md:236`
records that hardcoding `connected: () => true` kills **0 of 72** tests and rendering no alarm rows
kills **0**. A session porting this will read a 72-test green suite as coverage of a function no test
has ever executed. **The port is the moment to fix that, not after.**

**And the RN toolchain is a repo-wide tax that R22 makes removable and nobody has scheduled the
removal:** `apps/manager` pins `typescript@5.9.3` in its own devDependencies while the repo runs
7.0.2 (TS7 is the Go port and breaks `@expo/cli`), and the root tsconfig **excludes** `apps/manager`
because RN's ambient globals re-type the global scope. Two compiler versions in one repo, unratified
under `18 §15`. Whether that tax is retired or re-incurred is decided by the owner-app host question
in §9.

---

## §6 — The design language (R34)

> **R34: follow the mainstream and the global giants. Do not create from scratch. Steal like an
> artist.** It refines R12 rather than overruling it — what is *invented* is the identity layer
> (name, palette, mark); what is *borrowed* is layout, affordance, density and flow. It does **not**
> license copying assets; it licenses solved problems.

### 6.1 — What converges, and is already ours

Seven conventions where the industry and the corpus already agree. Each is a place to build with
confidence rather than a decision to take.

- **A persistent lateral category rail, never a drill-down** (6/6 products). Toast Open View puts
  menus left and groups in a vertical scrollable bar and exists to *flatten* the menu; Lightspeed
  *"categories can be found on the left side"*; Square arranges categories in a top layer above the
  grid. That is `27-F1`/`27-F2a` exactly, and it is the one law that is already the industry's.
- **Search as the escape hatch, above the grid**, never the only route — `27-F6`, `02-F2`.
- **Required modifiers prompt first and block send** (5/5). Doc 21 §5 already cites the Toast pattern.
  The one divergence is Toast's Open View showing all modifiers simultaneously so staff can follow the
  conversation in any order — a deliberate rejection of the sequential prompt for high-customisation
  QSR, and worth knowing when B3's modifier sheet is designed.
- **The KDS aging colour lives on the header BAND, not a dot or badge** — `27-F15`, arrived at
  independently, confirmed by 5/5.
- **The KDS pages and never scrolls; long tickets break into columns rather than scrolling** — Toast
  6/8/10 per page, Loyverse splits extended orders *"so the entire ticket remains visible without
  scrolling"*. `03-F46` is the convergent one.
- **The menu editor is draft → save → publish as two separate explicit acts** — Toast: *"Changes stay
  in draft until both Save and Publish are selected."* That is the shipped `14-F*` staged-edit model.
- **Manager approval is the manager's own PIN on the cashier's device, without signing the cashier
  out** — Lightspeed states the mechanism outright. That is precisely `02-F20`/`02-F41`'s second
  `createPinSession` (`apps/pos-electron/src/main/authorize.ts:522/568`). **The shipped design is the
  industry convention, not a local invention.**
- **Payment is check-left / tenders-right, ranked by likelihood, with quick-cash keys carrying the
  precomputed change on the button face** — `27-F24`'s *the system computes; staff read*, shipped by
  the industry twenty years ago and by us not at all.

**One structural steal is better than any of Toast's hex values.** Its palette is 33 pairings: hue
families (terracotta, orange, yellow, grass, sky, lavender, gray) × four **ordinal** steps, each entry
a light/dark **pair the operator cannot mix**. All three properties are already RestOS law — `27-F39`
ordinals, `27-F40` role-first prefixes, `27-F19`'s two-polarity requirement — and our shipped identity
slots satisfy none of the first two. **Copying Toast's hexes would be the wrong theft; copying its
naming fixes a live defect** (see conflict 8).

### 6.2 — The one ruling that subsumes most of the others

**Is RestOS a FIXED instrument or a CONFIGURABLE one?**

Every incumbent ships tile colour, tile size, grid dimensions, sort order and KDS thresholds as
**merchant settings**. Searching their docs for *layout* returns articles about how to *configure* the
layout — that is itself the finding. `27-F4` freezes position, `27-F74` (e) freezes hue, `27-F7`
freezes list order, `27-F72` derives density. Only the KDS thresholds are configurable here
(`03-F14`).

The conflict is therefore **structural rather than per-decision**: we are designing a fixed instrument
in a market whose incumbents ship a configurable one, and every item in §6.3 is a facet of that single
divergence. **Answer it once and most of §6.3 resolves; answer it per screen and the product drifts
toward configurable one control at a time, because the owner asks for it and each individual yes is
cheap.**

The external evidence points the corpus's way, and it is the strongest corroboration `27-F4` has ever
had. Creative Navy's 2026 benchmark scores **Square — the best-looking and most redesigned — as
FAILING conditioning stability**: a September 2025 forced rollout produced documented 2–3 s search
delays and moved cash-drawer timing from mid-transaction to end, breaking established motor routines.
**Toast wins that axis precisely because it ships additively.** So *follow the mainstream* means
follow **Toast's release discipline**, not Square's redesign cadence.

### 6.3 — Conflicts with a shipped FR: each is a founder decision, and none is resolved here

| # | The conflict | The shipped FR | What the industry does | Why it cannot be decided by an implementer |
|---|---|---|---|---|
| 1 | **Who picks a category's colour** | `27-F74` (e): capped at 12, allocated in the token manifest — *"an owner names his categories, he does not pick their colours"* | Universal: Toast 33 pairings + eyedropper, Square per-tile colour, Lightspeed button theme, Loyverse colour tiles | This is the largest interaction conflict R34 creates — owner-picked tile colour is muscle memory for anyone migrating off Toast or Square. **The middle path the industry itself demonstrates** is a closed, pre-gated palette with no hex entry, which satisfies `27-F74` (d)'s contrast gate while giving the owner the control he expects. **That option is not currently written into the FR** |
| 2 | **Which side the cart sits on** | `27-F4`: position is a compatibility contract; moving it is a breaking change with an acclimation window | Toast and Lightspeed both put the check **left**, grid right | The shipped counter is the mirror (`Counter.tsx` renders `ItemGrid` first, Cart second). Decide **once, before pilots**. Note the compact-mode amendment already claimed the left edge for the tab rail |
| 3 | **Off-the-shelf icons on owner-facing surfaces** | `27-F30` **unamended**: *"No off-the-shelf icon set"*, on 987 Pakistani doctors/dentists/paramedics scoring 42.2% mean on ISO 7010; `27-F31` requires locally drawn marks with staff in the loop | `27-F73` and `21-F16` adopt vendored shadcn/Radix; `18 §14` allowlists `lucide-react`; **`apps/backoffice` already ships it** (`package.json:23`) | The product has been answering *"only staff-facing"* in code for months **without a ruling**. Five of seven surfaces are owner-facing. If the ban binds them too, `27-F31` requires drawing an icon set for a literate audience it was never measured on — that is weeks |
| 4 | **The tender order** | `27-F4` bans adaptive and frecency ordering anywhere staff-facing — which means a fixed order must be **declared and frozen**, and no FR does it (`grep -arn TenderPanel specs/` → nothing) | Toast ranks by likelihood: saved card, split evenly, rewards, service charge, other | The shipped `TenderPanel` order is a positional contract nobody wrote down — precisely the failure `27-F4` exists to prevent |
| 5 | **The default tile size above the floor** | `27-F8`'s 12 mm is a **floor**; `27-F72` derives density and states no starting point | Toast's default is 8 rows × 5 = 40 tiles on a ~15.6″ work area — roughly a 30–34 mm tile, 2.5–2.8× our floor — and adjustable | The code therefore starts at the floor: `packages/ui/src/components/ItemGrid.tsx:149` is `const tile = tileMm ?? targetMm(posture)`, the posture **minimum**. `27-F11a`'s *"~88 tiles per page"* is a geometric maximum at the floor, not a density anyone ships, and reading it as a target is how the counter got 36 undifferentiated tiles |
| 6 | **Split by seat** | `02-F5` has split-by-item and equal-split; **RestOS has no seat concept anywhere** | Toast and Square both ship three modes, identically named: split evenly, split by item, split by seat | For a counter-service Pakistani beachhead it may be genuinely unnecessary — but that should be a **recorded refusal**, not an omission |
| 7 | **Two overflow idioms in one product** | R13/`27-F2` amendment: the order grid **scrolls**. `03-F46`: the KDS **pages, never scrolls** | Unanimously paging for the KDS | Both are defensible individually; together they teach a cook and a cashier two different idioms for *"there is more below"*. `03-F46` is the convergent one, which makes the order-grid scroll the outlier owing an acclimation note. The training cost was not priced when R13 was ruled |
| 8 | **Identity token names are content names, and no assignment rule exists** | `27-F74` (e) says the owner names his categories and does not pick their colours — and specifies **no mapping** | Toast names slots by **hue** with an ordinal step each | `tokens.json` ships `bgColor-identity-{rice,karahi,bbq,bread,drinks,sweet,sides,soup,snacks,cold,combo,extra}`. A tenant whose categories are Pizza / Pasta / Salads gets twelve tokens whose names are lies. Either owner-chosen from the closed set, or deterministic by category ordinal — **neither is written** |
| 9 | **The accent hue** | `27-F14`'s August amendment (i) freed the accent slot from any pinned hue; the shipped values are placeholders by plan §6's own account (`bgColor-interactive #0555FA`, `bgColor-status-confirmed #0FEBB4`) | **No convergence to steal** | Plan §6 rule 2 names this exactly: *"Pay turning from petrol teal to electric blue is yours."* R12's territory, not R34's |
| 10 | **The expediter's "all stations done" signal** | `27-F14`: green is transient confirmation only, **never a resting state**. `27-F12` sends the distinction to shape/position/count, unspecified for this case | Toast: *"the ticket turns green on the expediter KDS device"* — a **resting** state on a persistent surface | RestOS has no expo aggregate-state FR at all, so this gets designed from scratch when `03-F15`'s line-level assembly view reaches glass. The industry's answer is banned and the replacement is unwritten |

### 6.4 — The convergence that must NOT be stolen, and it needs a tripwire rather than a ruling

**Green as the resting KDS state.** Five of five products use green for a fresh ticket. `27-F14`
allocates green as *transient confirmation only — never a resting state*, and its August amendment was
filed against exactly this error class (*"the SaaS design round's first draft rendered a resting Pay
button in green"*). `03-F14` already resolved it correctly to **neutral → amber → red**, thresholds
org-configurable, defaults dine-in 10/20 and delivery 15/25 (`03-F47`) — the industry's ladder with
the resting green removed to protect `27-F14`'s budget, and the defaults sit inside the industry's own
5–15 min band.

**So the corpus is right and the risk is that an agent told to *follow the industry* reintroduces
green on the KDS and it passes every gate.** `tokens:check` verifies token **use**, not which state a
token is spent on. Toast is worse still: yellow → orange → **pink** is four hues against a 3+1 budget.
**A hand-written assertion is owed:** no `bgColor-status-confirmed` on any surface whose state
persists longer than an acknowledgement. Owner: B4.

### 6.5 — The boundary of the whole steal, stated once

**The mainstream solves a different literacy problem.** Every convention above was designed for an
American or Gulf server who reads fluently. `27 §intro` puts four in ten Pakistani adult staff below
the reading line, and `27-F30`'s 42.2% figure was measured on Pakistani **medical professionals**.

So the convergences are safe on **layout, affordance, density and flow** — which is exactly what R34
says is borrowed — and are **not evidence for anything symbolic**. Wherever a mainstream product
carries meaning in an icon alone, RestOS carries it in an icon **plus a word** (`27-F26`). That is a
divergence by design, not a gap, and no research finding should be read as pressure on it.

**Evidence quality is not uniform and this plan does not pretend otherwise.** Order grid, KDS aging
and the menu editor come from fetched primary vendor docs with numbers. The **cash** sub-screen does
not: Toast's own *Manage Payments* article omits tender types, quick-cash and change-due entirely, so
the denomination convention comes from Aloha/NCR and TravStar1 — legacy on-prem POS, not the named
giants. Foodics and Petpooja published nothing about their layouts; every claim about them is
capability-level. Two sources hard-blocked with HTTP 403 (medium.com/uxjournal's POS Design Guide;
Lightspeed's O-Series layout page), so the Lightspeed density claims are weaker than the Toast and
Loyverse ones. **Petpooja's one hard finding is worth a decision anyway:** shortcode item entry
(*"PBB for Pav Bhaji Butter"*) is a South Asian norm this corpus has no FR for, and D4's ruling already
requires the Order screen to be workable by keyboard.

---

## §7 — The trap list

Written in the shape `staff-over-the-wire.md`'s was, because that list caught real defects. Each entry
is a hazard **measured**, with the command. Three are corrections to findings that fed this very plan.

1. **⚠ CORRECTION (2026-08-20) — a finding that cites `AGENTS.md` is not a measurement, and one such
   finding reached this plan labelled *"re-confirmed"*.** The design-language pass reported
   *"`renderer/Counter.tsx:119` hardcodes `COUNTER_CHANNEL`"*, sourced as *"AGENTS.md's own
   measurement, re-confirmed"*. Measured: `grep -arn COUNTER_CHANNEL apps/pos-electron/src/renderer/`
   → **zero hits**. The channel row shipped and is **four** of `02-F42`'s five by founder ruling
   (`Counter.tsx:265-320`), with two tripwires (`main/__acceptance__/channel-ruling.test.ts`,
   `renderer/channel-ruling.dom.test.tsx`) — and `apps/pos-electron/src/main/catalog.ts:97-98` says so
   in the tree: *"`COUNTER_CHANNEL` no longer exists: a cashier can start a `phone` or `foodpanda`
   [order]"*. **What is still genuinely owed is narrower than the finding claimed:** `02-F28`'s ≤30 s
   repeat-customer path and `02-F30`'s foodpanda item-mapping restriction. **The transferable class:
   a governance document's measurement was inherited, re-labelled as a fresh one, and shipped into a
   plan — which is this repo's named failure mode with the sign flipped, a debt believed open that is
   closed, inviting a session to build a producer that exists.**
2. **`services/api/src/summary.ts:236` is a live stale claim, and it is DATA a surface renders to an
   owner.** It states that void/comp/discount are *"01 §4 catalog vocabulary with no payload schema in
   `packages/domain` and no emitter anywhere"*. Half is true (no emitter) and half is false:
   `grep -an '"void.recorded"' packages/domain/src/registry.ts` → `:673`. Its own preamble says each
   entry *"was checked against the emittable event set"*, which is what makes it read as
   authoritative. **A session sent to add the missing schemas would re-declare four protected-path
   schemas that already exist.** Correcting it is a **user-visible** change, not a comment fix.
3. **`specs/26-merge-semantics.md:113` asserts the same retired premise**, and
   `packages/domain/src/invariants.ts:70` already records that the line is *owed a correction*. Two
   documents and one spec line out of step on one fact, with the in-tree comment being the accurate
   one — the reverse of the usual direction.
4. **`05-F29` still rules resolution (a) in the corpus.** `specs/05-manager-console.md:94` reads
   *"RULED (founder, August 2026): resolution (a) — the manager surface is the Expo RN DEVICE app"*.
   R22 supersedes it and the amendment is **owed**. A session routed to doc 05 by `AGENTS.md`'s table
   reads (a) and builds an RN app. This is the exact defect `28-F12` spent a paragraph preventing for
   `15-F26`: *recording an amendment only in the amending document is the identical defect one layer
   up*. **Land the strikethrough and the pointer in doc 05 in the same change as R22's implementation.**
5. **The four estimates do not add.** 170 + 16 + 30 + 49 double-counts signup, the seven surfaces and
   the corrective acts across passes. **Nothing in this plan quotes a sum**, and any schedule built by
   adding them is wrong before it is written.
6. **R22 costs a wire kind on a protected path — and the count everyone is using is off.** The wire is
   **16 distinct kinds**, not 14 and not 17
   (`grep -aoP 'kind: z\.literal\("\K[a-z_]+' packages/sync-protocol/src/messages.ts | sort -u | wc -l`;
   `reference_notice` appears twice, which is why an occurrence count says 17). R22's kind makes 17,
   and `01-F74` (b)'s device roster is a **resource member**, not a kind. `sync-protocol` is
   commandment-10 protected and R35 puts the wire in the FULL tier.
7. **R22's owed list is stale in the *favourable* direction.** It closes with *"nothing yet emits
   `approval.requested`"*. That stopped being true before R22 was written:
   `apps/pos-electron/src/main/approval-record.ts:188` appends it through `deps.appendAs`, wired at
   `main/index.ts:1240`, reached from IPC at `:1870`. **Only the `05-F29` amendment is genuinely
   owed.** Flagged because this repo's usual failure is the opposite, and this one invites a session
   to build a producer that already exists.
8. **R22 has an unnamed cost that neither R22 nor doc 05 states: the approver has no credential on the
   browser plane.** The shipped grant is PIN-gated —
   `apps/pos-electron/src/main/authorize.ts:568` refuses on `!(await deps.verifyApprover(id, pin))`.
   Under resolution (c) a browser decision arrives with **no PIN**, so either the till appends a grant
   naming an approver it never verified (a commandment-8 and `02-F41` hole on a money path), or the
   cloud becomes a credential verifier and the till must trust a cloud assertion — a new trust edge on
   the escalation path no FR specifies. R22 says (c) needs no amendment to `01-F62` or `02-F41`; **that
   is true of the ENVELOPE and silent about the CREDENTIAL.**
9. **A second tenant publishes no menu and all four processes report success.** `ENABLED_BRANCHES` is
   per-process (`services/api/src/server.ts:416`, wired `:466`); `org_id` is per-subject
   (`trpc.ts:231`). `catalog.ts:204`'s `assertSavable` then either refuses every save or demands prices
   on tenant **one's** branch ids. There is no error message for this failure anywhere in the product,
   and it sits **on the signup path**: it bites the moment R40 succeeds.
10. **A restored till backup opens clean, passes `integrity_check`, and reports ZERO sales.** Measured
    on two real stores (`ops/README.md:441-456`): a counter's 135 KB main + 45 KB WAL gave `ok`, the
    full schema, `events = 0`. That reads as a quiet day, not a destroyed backup. On the way back in,
    copying a backup over a stale `device.db-wal` **reinstates the state you were discarding** — 700
    events where 500 were expected, and still 700 after overwriting the main file with `/dev/urandom`.
    **Never judge a till backup by whether it opens; count `events`.**
11. **A tax charged on top of `billed_total` makes every settled order a nightly Auditor finding.**
    `packages/auditor/src/auditor.ts:380` reports when `pay_total − refund_total < billed`
    (`01-F30`/`01-F32`), and `packages/sync-client/src/folds/merge.ts:873` records the settled equation
    with **no term for it**. Whether tax is inside `billed_total` or beside it must be decided **before
    a payload field is added**, or the instrument that would catch a wrong total cries wolf on every
    org, every night.
12. **`payment.recorded` is `z.looseObject`, so a tax field would be ACCEPTED and silently ignored.**
    The schema passes, the event persists, no report counts it, and `01-F1` makes that permanent. The
    corpus's own *"a field that reads as a capability"* defect, on the money path.
13. **`applyRateBps` has exactly ONE non-test caller in the tree** — `apps/pos-electron/src/main/catalog.ts:137`,
    the foodpanda markup. Tax is its second production consumer, and `DEC-MONEY-005` says the rounding
    policy *"MUST land before doc 16"*. **Treat the rounding-policy review as part of the tax task, not
    as inherited.**
14. **`01-F72` (e·i): a completed TLS handshake is NOT proof of admission.** Under TLS 1.3 the
    dialler's `Finished` precedes the acceptor's verdict, so a **refused** device's `secureConnect`
    fires normally and it is then cut by a fatal alert — measured out-of-tree with a self-signed
    impostor presenting the till's exact subject. An "optimisation" that reads a successful dial as
    admission re-opens the hole from the other end.
15. **`transport-ws.ts` swallows bind failures on purpose** (`wss.on("error", () => undefined)`,
    because `01-F17` says nothing about the LAN may take the till down), so a port collision yields a
    device that **reports itself meshing while holding no socket**. `mesh.ts:200-211`'s `boundPort`
    guard is the only thing keeping `lan` honest: what was CONFIGURED goes on the boot line, what
    BOUND goes on the strip. **Do not collapse them.**
16. **`01-F74` (d)'s stale-vs-absent line is decided by one nullable read.** `mesh.ts:192` treats
    `store.lanRoster.ageMs(now) === null` as ABSENT (refuse) and any number as OLD (admit). An
    implementer who stamps a bogus `received_at` while wiring A10 silently converts every
    never-received roster into a very old one — **flipping refuse to admit for the whole class**.
17. **`AssignmentInput` (`services/sync-gateway/src/user-crud.ts:86`) is `{role, branch_id}` with no
    status, but the stored assignment requires one with no default and no jsonb fallback.** A row
    written without it throws a `ZodError` at **read** time in `services/api`
    (`users-postgres.ts:87`) — one service away from the writer that omitted it, and after the write
    has committed.
18. **`seams:check` is structurally blind to most of this plan, and its clean run says so.** It asks
    whether shipping code *reaches* an export (Rule A) and whether an optional member is *supplied*
    (Rule B). It never asks *"can a human invoke this"*, *"is what was supplied real"*, or *"can the
    product be told to be the other one"*. A per-tenant backup job with a permissive stub and an
    entitlement port supplied with a stub both read as **supplied**. **The assertions have to be
    hand-written.** Its register is **28** and it prints the number on every clean run — do not
    hand-copy it from here.
19. **CI gates five steps; four of the seven `verify` rails never gate a merge.** `tokens:check`,
    `strings:check`, `seams:check` and `layout:check` are local-only. The one rail that *would* cover
    the new browser surfaces (`tokens:check` globs `apps/**/*.tsx`) gates nothing, and `strings:check`
    has adopted exactly one module (`scripts/check-strings.mjs:542`, `ADOPTED = [{ module:
    "apps/backoffice", fr: "14-F38" }]`) — the four new surfaces each need explicit adoption or ship
    uncatalogued.
20. **A production-line count that includes tests, and an `apps/` directory that lies about scope.**
    `apps/manager` is 3,718 all-in and **1,188 production**; `pos-electron` 55,716 vs 20,075;
    `pass-kds` 13,100 vs 4,838; `backoffice` 14,111 vs 6,092. **Quote production lines or say which you
    counted.** And six of the ten `apps/` directories are 2-line stubs, of which exactly **two**
    (`owner`, `platform-admin`) are R19 surfaces — a builder scanning `apps/` cannot tell which without
    reading R19.
21. **`grep -a` always, and a grep is not evidence until it finds the WRAPPERS.** Under a C locale a
    UTF-8 byte makes `grep` report `Binary file … matches` **instead of** the matching lines
    (reproduced on `apps/backoffice/src/components/catalog-screen.tsx`: 7 lines vs 8 with `-a`, and the
    missing one is a real call site). And the corrective-act producer claim in §2 rests on checking the
    **four dynamic-type append wrappers** (`main/index.ts:1309,1333,1401,1441`, `settlement-closer.ts:199`,
    `approval-record.ts:188`), not only the literals — a literal grep alone would have proved nothing.
22. **A reported exit code is not evidence, and `pnpm test` at the repo root hangs in a sandboxed
    shell** (vitest at 0% CPU inside `globalSetup`, zero containers, because the sandbox blocks the
    Docker socket). Write `REAL_EXIT=$?` **inside** the log and read the suite's own summary line.
    Run `--force --continue --concurrency=3`; a single red is exactly as untrustworthy as a single
    green, and the documented subprocess-oracle flake has produced three different failure sets from
    one tree state.

---

## §8 — What the MVP explicitly does NOT contain

Each with the FR or ruling that defers it. A session that finds one of these missing has found the
plan working, not a gap.

| Not in the MVP | Deferred by |
|---|---|
| Storefront, WhatsApp, riders, inventory, intelligence, marketing/loyalty, waiter app | **R1** — sell the service floor now. `apps/waiter`, `apps/rider`, `apps/storefront`, `services/foodpanda`, `services/whatsapp`, `services/intelligence` stay stubs until their wave |
| Billing, metering, invoicing, collection, tiers | **R18** — pilots are free. The **shape** billing attaches to (`28-F6`'s entitlement record) is in scope; the numbers are not |
| Take-rate | **R5** — dropped, reintroducible because additive |
| Fiscalization, revenue-authority devices or APIs, any certification claim | **R39** — correct totals and an itemised line only. Doc 16's fiscalization is post-pilot |
| The physical printer pass (**K-8**) | **R37** — the path ships, hardware runs when it arrives, and **no test may imply otherwise**. `27-F35`'s ≥85% comprehension gate on real staff is untested until then |
| The browser renderer + signed edge agent (**W2**) | **R3 is not withdrawn; R20 sequences it after the pilots.** Screens are built in `packages/ui`, so the host move changes a process and an IPC boundary, not the screens |
| Relay-replaces-election, device-as-bounded-cache (**W3**) | **R2**, and it is in tension with **R36** which puts the mesh IN. The mesh ships as built; the relay simplification is post-pilot |
| Hosting region, managed Postgres, a deploy pipeline | **R11**, **R42**. The four carve-outs (TLS, restored backups, a reproducible deploy, enough observability to know a tenant is broken) are **A21** and are not deferred |
| Retention windows and erasure | **R38** — erasure interacts with an append-only ledger and is a design problem, not a feature |
| `02-F20`'s **remote** approval path and the manager console's alarm queue | Not on the demo bar. `05-F28` records that a cloud-plane console cannot legally emit any event doc 05 owns; `05-F29`'s amendment is owed; and there is **no cloud read model** for anything doc 05 renders — `services/api/src/router.ts:206` exposes 8 routers, none of them approvals or alarms, and `trpc.ts:289` literally builds the refusal string `${action} needs an approval this plane cannot collect (02-F20)` |
| Push notifications (`12-F9`, and R22's console) | **No infrastructure of any kind exists** — no firebase, fcm, apns, expo-notifications, web-push or `PushSubscription` in any manifest or source file. Two of the seven surfaces have push in their defining sentence and the capability is zero. Not on the bar; named so it is not assumed |
| `01-F26`'s per-user permission overrides | Unmodelled and named as unmodelled in two shipped files (`packages/sync-client/src/staff.ts:25-27`, `packages/domain/src/permissions.ts:368`). `14-F14` lists them, so this wave delivers a **partial `14-F14`** |
| Multi-org humans | `users_email_lower_uq` is global and `0011:50-53` leaves it open |
| Cleaning historical attribution already written under the dev roster | `01-F1` forbids correcting it. **A3 stops the bleeding; nothing cleans the wound**, and any pilot that has already sold under the seed needs a founder decision about that data |
| `03-F15`'s line-level assembly view and an expo aggregate state | No FR rules its colour (conflict 10), and inventing one is commandment 2 |
| `order.cancelled` | **No payload schema at all** (`grep -arn 'order.cancelled' apps services packages` → zero hits anywhere). Unemittable under `01-F4` rather than unbuilt, and not on R21's list — it needs an explicit in/out (§9) |
| Re-planning modules 05, 08, 09, 10, 11, 12, 13, 17 | **Plan of record §5.** Sequence is a founder call |
| Renumbering any FR | The A-rule: 19,803 FR citations across 601 files, zero dangling. Renumbering destroys every anchor and buys nothing |

---

## §9 — Open questions

Separated by **who can answer them**. An engineering call taken by a founder wastes his time; a founder
call taken by an implementer is how `27-F72` ended up spec-closed and code-owed.

### 9.1 — Founder calls (these block work; nothing below them can start)

1. **Fixed instrument or configurable one?** §6.2. Answer once and most of §6.3 resolves; answer per
   screen and the product drifts. **This is the highest-leverage question in the document.**
2. **The accent hue, and the identity palette's assignment rule.** §6.3 conflicts 8 and 9. Plan §6
   rule 2 puts the first squarely with the founder; the second is unwritten in the FR either way.
3. **Which side does the cart sit on?** §6.3 conflict 2. `27-F4` makes it a breaking change with an
   acclimation window afterwards, so it must be decided **before** pilots, not discovered after.
4. **Does `27-F30`'s icon ban bind owner-facing surfaces?** §6.3 conflict 3. The product has been
   answering *no* in code for months without a ruling, and five of seven surfaces are owner-facing.
5. **Is the owner app still React Native?** `12 §8` and `14-F31` reserve `apps/owner` for Expo; R3
   killed the RN till and R22 moved the manager to a browser. **If RN survives for one surface the
   whole toolchain tax survives with it** (two TypeScript versions, `apps/manager` excluded from the
   root tsconfig program, no `packages/ui` components for RN, EAS build). If not, `apps/owner` is a
   fifth browser surface on the back-office template and the RN scaffolding is deleted outright.
6. **Under R22 resolution (c), who verifies the approving manager and what does the till trust?**
   Trap 8. Three options and each has a cost: the cloud verifies and the till trusts a signed
   assertion (a new trust edge); the manager re-enters a PIN in the browser verified against synced
   hashes (but `28-F7` says no cloud surface holds device credential material); or approvals stay
   till-local and the browser is render-only (`05-F28`'s *legitimate smaller thing*, which is **not**
   what `00 §1` rows *"1 core"* against). Unanswered in R22, doc 05 and doc 28.
7. **What is the admission control on public signup?** `28-F15` forbids shipping the surface without a
   named one and declines to pick (`28 §9.6`). Vendor invite code / email verification / vendor
   approval / creation rate limit. **Every junk org is permanent** (`01-F68` never reuses an `org_id`)
   on a deployment shared with real tenants. **It interacts with (8):** if the answer is email
   verification, the two questions collapse into one; if it is an invite code, signup is no longer
   self-serve in R40's sense and R17's reason for the ruling is only half addressed.
8. **How does the minted credential reach a self-serve owner, and how is it recovered?** `28 §9.21`.
   `create-owner.ts:269` prints the plaintext to stdout and that is the entire delivery mechanism; a
   self-serve owner has no terminal, and `15-F27` bans a password as an input in any encoding, so
   *"collect it on the form"* is closed by name. **No document in the corpus owns an outbound-mail
   capability**, so taking one is an `18 §15` dependency-governance event, not a package install.
9. **`01-F30`'s three missing conservation terms.** `plans/wave-1/f30-conservation-terms-options.md` is
   explicitly REFUSED as under-determined. **The blocking sub-question is not a merge rule:** no
   idempotency key exists on any of the four corrective payloads and `01-F31` says a fold dedupes by
   attempt key. Minting one is a payload change to four protected schemas — so the ruling gates the
   schema, which gates the fold, which gates the surface (A12).
10. **Which correctives does the MVP counter actually get?** R21 names void/comp/discount/refund.
    `01 §4` also holds `order.cancelled` (no payload schema — unemittable) and `order.rejected` (schema
    exists; its `06-F20` consumer is the unbuilt storefront). Both need an explicit in/out.
11. **Tax: posture engine or a single rate?** `16-F1`/`16-F2` specify a matrix per channel × payment
    method from vendor-maintained rule packs, and `16-F4` says outright *"rates are never free-typed by
    orgs"*. A single org-level rate typed in the back office is far cheaper and contradicts `16-F4` by
    name. **This changes A19's cost by roughly a factor of two.**
12. **Is tax INSIDE `billed_total` or beside it?** It decides the Auditor's conservation equation,
    `01-F30`'s definition of billed, the `shift_cash` fold's arithmetic and what the receipt's `Total`
    row means. A `packages/domain` change either way, so it is a spec act (commandment 9) on a
    protected path. **Must be answered before any payload field is added** (trap 11).
13. **What does *per-tenant backup* mean under R38?** Two readings, very different costs: (a) a
    per-org logical dump filtered by `org_id` on the existing repeatable — per-tenant recovery, with no
    answer yet for tables that are not org-keyed; or (b) the whole-DB dump stays the recovery
    mechanism and `22-F16`'s owner export is the only per-tenant artifact. **Only (b) is specified
    anywhere.**
14. **Does `14-F27`'s go-live checklist apply to a self-onboarded tenant, and may it be
    self-attested?** `28 §9.14`. Its items feed off `15-F10`'s runbook, a **vendor-staffed**
    instrument. Either the checklist does not apply — which nobody has said — or **no self-serve pilot
    goes live**, which blocks R40's end state independently of everything else.
15. **`discount.recorded`'s threshold.** `02-F20` splits discounts at an org threshold and `00 §7`
    layer 2 does not exist. Does the discount surface wait for the config plane, or take a pinned
    constant on `PAID_OUT_APPROVAL_THRESHOLD_PAISA`'s precedent (`authorize.ts:161`, Rs 2,000, pinned
    not specified)?
16. **Split by seat: in or out?** §6.3 conflict 6. A recorded refusal is an acceptable answer; an
    omission is not.

### 9.2 — Engineering calls (take them, record them, do not escalate)

1. **Does the counter rebuild remeasure against the layout gate continuously, or once at the end?**
   **Recommendation: continuously, and the gate is ported before the first component.** It imports the
   app's real window options and is the only instrument that catches D2's touch-scale trap;
   rebuild-then-remeasure loses its protection exactly when the layout is most volatile. R15's
   *coverage never dropping* already implies this.
2. **One responsive gate for the four browser surfaces, or four?** **Recommendation: one, built once
   against the back-office template.** Playwright is allowlisted and is legitimate here (trap: the
   Electron rejection does not transfer, §4/B4). Four bespoke gates is how 4,480 lines happened.
3. **Does provisioning move to a package before the control plane and signup are built?**
   **Recommendation: yes, and now.** Both surfaces need `createOrg`/`createBranch`/`createOwner`, both
   would breach `18 §2`, the repo already took that import once for `runAuditor` and left the move
   owed. Deciding now costs a small refactor; deciding later means two more named violations and a
   bigger move (A18).
4. **Do step 7 and 2b land as one PR?** **Yes for the device plane** — measured, half-landing is an
   outage (A1). **But 2b's cloud half is separable and shippable today**: `trpc.ts` + `users.ts` need
   only stop stripping a status the database already stores. Split the cloud half out.
5. **Does `device_roster` become the third member of `01-F75`'s closed set, or get its own frame?**
   `01-F75` declares the set closed and names adding a third member as the thing that re-opens step 6's
   dissolved refusal question. That is **that member's own spec act** (A10) — take it there, with the
   session-killing-refusal decision made explicitly rather than inherited from `default:`.
6. **Where does the public signup surface live?** A public route inside `apps/backoffice` is a new
   posture (every screen there is behind `14-F1` today); a separate app is a workspace nobody has
   scoped. `28 §9.26`. **Recommendation: a separate route group in `apps/backoffice`**, because it is
   already on the target stack and the alternative duplicates the whole design layer for two screens —
   but say so in the FR, since `21`/`27` have never been asked for an unauthenticated surface.
7. **Is `01-F12`'s mDNS in the MVP?** **Recommendation: no.** It is an `18 §14` open registry item, so
   it is an `18 §15` event, and manual IP is a supported configuration that satisfies demo move 10.

### 9.3 — Cannot tell yet (do not guess; re-measure when the gate arrives)

1. **How much of `packages/ui`'s 22 components survive as bespoke.** D3 decides it per component, and
   the honest answer needs D1's palette and D2's token architecture first. Anything sizing this off
   `AGENTS.md`'s *"18 components"* understates it by four.
2. **Whether the 671 portable lines of `apps/manager` survive the browser port intact.** They import
   only `@restos/device-config/aging`, `@restos/domain`, `@restos/sync-client/fold-engine` and one
   type-only `@restos/sync-client/rn` — which reads portable and has never been executed outside RN,
   because the composition root cannot be loaded by any test in the repository.
3. **What `27-F35`'s comprehension gate says about the new language.** It is a measurement on real
   Pakistani staff and no design decision above can predict it. R37 defers K-8; **nothing defers this**
   — it simply cannot be run until there are staff to run it on.
4. **Whether the mesh's LAN behaviour holds on real branch hardware.** Every measurement to date is
   two synthetic sessions or an out-of-tree probe. Traps 14–16 are the known hazards; the unknown ones
   arrive with the first branch that has two tills and a cheap router.
5. **`28 §9.16` — does a free pilot count as the first production org** for `22-F12`'s residency
   verification and `DEC-DATA-002` (status `proposed`, target pre-pilot)? Under R21 pilot data is real
   business records including real diners' phone numbers, which makes the answer look like yes. The
   plan of record's §4 tripwire says the answer is owed **before the question is asked in a sales
   conversation**, not after.
6. **The Sindh Finance Act reading.** One OCR'd, self-flagged-unverified source suggests liability for
   non-conforming invoices may fall on *the software supplier* — which under SaaS is us, for every
   tenant. A business-model input, not an engineering ticket, and worth a Pakistani tax lawyer's hour
   before a Karachi tenant signs.

---

## §10 — The critical path

**Two tracks (R41), and they are not symmetric.** Track B is the bigger number and Track A is the
bigger risk, and the MVP is done only when both finish.

**Track B parallelises; Track A does not.** Once D1–D3 land, six surfaces can be built by six sessions
against one template that already exists (`apps/backoffice`). Track A is a chain where each step's
schema is the next step's precondition, every link is a protected path under R35's FULL tier, and the
last comparable step — step 3, the cloud version axis — **took six adversarial review rounds with
three of the six findings on the auth-data half**. Adding agents shortens B and does not shorten A.

**The single longest serialized strand is the one nobody has started, and it is not a surface:**

```
founder rulings 9.1(7) + 9.1(8)          admission control · credential delivery
      ↓  (commandment 9 — spec before code)
01-F25 pairing model  +  A15 tenancy permission actions   ← spec PRs, doc 14 / doc 01
      ↓
A8  cloud PKI half (01-F73 b)  ──┬──→  A17 signup surface      → demo moves 1,2,6
      ↓                          └──→  A16 28-F20 enabled set  → demo move 15
A9  device pairing path       ────────→ the LAN mesh STARTS    → demo move 10 (R36)
```

Every one of those is FULL tier. **The pairing code is the join**: it is simultaneously R40's last
mile, R36's only blocker, and the demo's opening move — and it sits behind two founder rulings that
have not been taken. **Nothing on it can begin until they are.**

**Three strands run beside it and none is shorter than it looks.** (i) A1→A3 finishes the staff chain
and is what makes R21's *real business records* honest — it is unblocked in code today and should
start immediately, because A3's precondition is *proven on a real till, not a suite*. (ii) A12's
corrective acts are a **ruling → four protected schemas → fold → surface** chain that cannot be
compressed, and demo move 11 is on the bar. (iii) A19's tax is three independent absences on two
protected paths, gated by two rulings, and R39 puts an itemised line in demo move 12.

**So the critical path is: the nine founder rulings in §9.1, then the corpus amendments they require,
then A8/A9's credential work — with Track B's design decisions (§9.1 items 1–5) taken in the same
sitting so `packages/ui`'s rebuild can start in parallel rather than behind them.** The rulings are
the path. Everything measured in this document is buildable; almost nothing on the longest strand is
*startable*, and what stands between is a week of decisions rather than a month of code.

**The one sequencing error this plan exists to prevent:** building and demoing seven beautiful
surfaces against a deployment that cannot correctly serve tenant #2. `28-F20` is invisible with one
tenant, wrong with two, and R17 rules five to ten. **A16 goes early, not in week eleven.**
