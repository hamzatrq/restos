> **Derived, dated, and not in the authority order (`L2`).** Produced 2026-08-27 by a seven-cluster
> sweep, each cluster adversarially verified by a second agent that refuted 21 of its claims. Every
> line number was re-derived by the synthesiser rather than inherited. **Re-measure before quoting
> anything here (`L1`)** — the sweep's own §5 records that six of seven clusters searched by FILENAME
> and were structurally blind to files whose contents assert a premise their names do not.
> The rulings themselves live in `plan-of-record.md` §0; this file is a work list, never a status board.

# RestOS — ONE ORDERED CARRY LIST
## Founder rulings R82–R94, taken 2026-08-27 · synthesised from seven cluster reports and their adversarial verifications · measured on `main`, 2026-08-27

---

## 0. WHAT WAS DROPPED, AND THE ID CORRECTION THAT COMES FIRST

**21 substantive claims were dropped** because the adversarial verification refuted them and I re-derived the refutation myself where it mattered. They are listed in §4 (ALREADY COMPLIANT) so nobody re-investigates. In addition ~30 file:line citations across the seven reports were off by one to six lines; **every line number in this document was re-derived by me today** and does not inherit theirs. I overrode the verification in exactly two places, both marked ⚠ **OVERRIDE** in §4.

**⚠ FIVE OF THE SEVEN BRIEFS CARRIED THE WRONG RULING IDS.** I read the register directly (`plans/saas-pivot/plan-of-record.md:141–155`). The correct mapping:

| cluster | brief said | **register says** |
|---|---|---|
| offline-mesh | R82 | **R82** ✓ (+ R83's per-surface clause) |
| kitchen-topology | R83 | **R84** (three topologies) + **R83** (degradation) |
| mvp-scope | R84 | **R85** (MVP bar) + **R86** (surface set) |
| billing-saas | R85 + R86 | **R87** (billing out) + **R88** (pure SaaS) |
| whitelabel-builders | R87 + R89 | **R89** (white-label) + **R90** (builders) + **R91** (bill layout) |
| superadmin | R88 | **R92** |
| till-multi | R91 + R92 | **R93** (till) + **R94** (waiter web) |

Citing "R85" for the billing excision would attach it to the MVP bar. This is `L3`'s exact failure mode, and the register records its own instance of it at `plan-of-record.md:46` (R65 carried under R63's id). **Nothing below may be carried into an FR under a brief id.**

**⚠ R95 and R96 were assigned to no cluster and are therefore unanalysed.** R96 (`:155`) says in terms that it *"Reaches `21 §4`'s numeric budgets and `27`'s tile rules"* and R95 (`:154`) sequences all design work ahead of function. Both land on documents this list edits (21, 27) and on the order of the work itself. **They need a cluster before Phase 3 starts.**

---

## 1. THE ORDERED CARRY LIST

Ordered by **dependency** — what must be decided before what is written, and written before what is coded. Severity is noted but does not drive the order. `🔒` = protected path (`packages/domain`, `packages/sync-client`, `packages/sync-protocol`, `packages/escpos`, tax, auth) → adversarial review in a separate agent context before code changes, per commandment 10.

---

### PHASE 0 — HYGIENE AND THE TWO RULINGS THAT GATE THE KERNEL

---

**C1 · Re-label every downstream brief and task to the register's ids.**
**PLAN.** Owner: whoever holds the briefs. FR ids: none. **Size: minutes.**
Blocks: literally every item below, because each one's commit must cite a resolving ruling. See §0.

---

**C2 · Mark the five superseded ruling rows that still stand live in the register.**
**PLAN.** Owning file: `plans/saas-pivot/plan-of-record.md`. **Size: six rows, one edit.**
- `:64` **R1** still names *"counter + kitchen + back office + control plane + **billing**"* as the first sellable product, and still parks inventory by name. R86 widens it; R87 removes billing. No pointer, no strikethrough.
- `:106` **R43** still reads *"acceptance is a demonstrable end-to-end run **rather than a restaurant having survived a Friday night**"* — the exact sentence R85 inverts, standing 38 rows above R85.
- `:68` **R5** *"Dropped. Flat subscription only…"* — retired by R87, and *"flat subscription only"* is now false.
- `:81` **R18** *"The **shape** billing later attaches to … is IN scope"* — retired by R87. **This row's retirement does the most downstream damage** (it is the sole warrant for `15-F5a`, `28-F6`'s plan member and `28-F22`).
- `:71` **R8** *"First paying tenant — 6 months."*
- `:49` files R43 as *"Plan-scoped and correctly absent from `specs/`"* — under R85 the MVP bar sets the completeness standard `24-F2`'s D-rungs encode, so it is no longer plan-scoped.
Also: `:194` doc-29 charter sells *"cost per tenant"* (R87/R88).
The register is the file every audit runs off. This is the cheapest item here and it gates the trustworthiness of all the rest.

---

**C3 · ⚠ FOUNDER DECISION **D1 — the clock**. Nothing in R82 may move until this is ruled.**
See §3. R82's own text, in the OWED block: *"`01-F43`'s clock loses its source … **That is the blocker before any mesh deletion, not after.**"*
Confirmed by measurement: `setBranchTimeOffset` has exactly **three** production call sites and all three are inside `packages/sync-client/src/mesh-session.ts` (`:404`, `:518`, `:576`). Delete the mesh and no device can ever stamp `time_basis: "branch"` again.

---

**C4 · ⚠ FOUNDER DECISION **D2 — `01-F62` and the cloud-plane emitter**. One ruling, not three.**
See §3. Three clusters converge on this one discriminant: R92's vendor acts, R94's cloud-first waiter pad, and R84's "KDS not connected" alert if it is to reach doc 05 or doc 15 rather than living on the counter's glass. R92's own row says: *"a browser is not a device … the same question `05-F28` records for remote approvals — **answer it there, do not invent a fourth resolution.**"*

---

### PHASE 1 — THE AUTHORITY-ORDER DOCUMENTS

Everything in Phases 2–4 cites these. Editing a module spec first means carrying a premise that is about to change.

---

**C5 · `restaurant-os.md` — six independent breaks in the document at authority position 1.**
**SPEC.** Owner: founder act (`00 §8` template). **Size: large — but one file, one session.**

R82 (the mesh):
- `:27` pillar 5 — *"**LAN-first real-time.** In-branch coordination (sub-second state propagation across devices) works with the internet dead … **This is the hardest engineering problem and the technical moat.**"* R82 deletes the named moat. **This is the single most load-bearing sentence any of the seven clusters contradicts.**
- `:35` kernel row *"sync mesh (LAN-first, cloud exhaust)"* · `:101` profile table *"T3 full mesh"* · `:119` Wave 0 *"LAN-first sync mesh"* · `:123` Wave 4 *"T3 mesh"* · `:133` pilot-coverage gap naming *"T3 mesh"* · `:214` *"up to 5 concurrent POS devices per branch, **LAN-coherent**"*.

R85 (the MVP bar):
- `:15` *"this is a *gigantic tool, not an MVP*. Public launch is the full suite."*
- `:113` §8 heading *"Build strategy — **no public MVP**, strict internal order"*
- `:117` *"**dev-pilots are development instruments, not launches**"*
- `:125` *"Public launch when Wave 4 is pilot-proven."*

R86 (the launch set):
- `:122` inventory → Wave 3 · `:123` waiter pad (T3 mesh) + marketing/loyalty → Wave 4, both behind a Wave 2 that R86 defers
- `:120` Wave 1 demands manager alarms+approvals, the nightly owner summary and foodpanda quick-entry — **three things R86's six do not name** (see D6)
- `:59` *"### 4.3 Delivery & riders (**in scope — launch requirement**)"* — R86 puts riders after launch
- `:83` marketing/loyalty *"(in 18-month scope)"*, restating doc 17's storefront+WhatsApp dependency at authority position 1

R87 (billing):
- `:106–111` §7 Business model in full — *"**PKR 8,000 / branch / month** base subscription"*, *"**Own-channel take-rate up to 5%** … admin-settable"*, *"Tax compliance add-on priced separately"*
- `:86` and `:207` tax compliance as a *"paid add-on"* — ⚠ **delete only the word "paid"**; the add-on, `16-F25`'s certification gate and `16 §7`'s layer-1 enablement are statutory and stay
- `:81` reports *"net of commission/take-rate"* — ⚠ **commission stays** (foodpanda's and the bank's cut of the restaurant's money); only the take-rate term goes

⚠ Do **not** touch `:47` — *"Hardware is a **capability set, not a ladder**"* is already R84-shaped and is the correct premise. Its ruling `DEC-HW-003` is still **proposed** (`specs/DECISIONS.md:50`) while `restaurant-os.md:47` has already been amended to it; that mismatch is fixed in C15, not here.

---

**C6 · `specs/00-platform-overview.md` — the module/wave table, the offline law, the perf budget, and the config layers.**
**SPEC.** **Size: medium — five separate sections.**

R82/R83:
- `:67–81` the `subgraph BRANCH[Branch LAN — works with WAN down]` diagram with `HUB[Elected hub device]` and `POS/PASS/MGR/WTR <--> HUB`. Under R82 every one draws straight to `API` — i.e. the shape `RIDER[Rider app] --> API` already has at `:83`.
- `:86` *"In-branch devices replicate peer-to-hub over LAN in real time"*
- `:106` *"Node main process owns printing … and **the sync/LAN hub role**"*
- `:134` the vertical-slice definition *"**replicated over LAN to a second device**"*
- `:146` §5.1 *"branch LAN coordination keeps working"* — ⚠ this is the source of **AGENTS.md commandment 4**; R83 turns the universal offline law into *"a per-surface promise"*
- `:148` §5.3 *"**LAN event propagation (device → device) < 1 s p95**"* — the **budget** survives R82, the **transport** does not; restate it as a cloud round-trip target or as the counter↔KDS link's target

R85/R86:
- `:17` doc 04 wave `4` · `:23` doc 10 wave `3` · `:30` doc 17 wave `4`
- `:44` the wave definition itself — two conflicts: the dependency ladder mis-sequences three of the six, and *"a module's wave is when its **first production slice** ships to a dev-pilot restaurant; most modules keep growing afterward"* is exactly the demo-grade acceptance R85 calls *"too low by a wide margin"*. ⚠ This sentence is quoted verbatim as the measuring stick in `plans/wave-1/wave-1-scope-reconciliation.md:37-38` and cited by `AGENTS.md` `L2`.

R87: `:168` layer-1 lever list *"own-channel take-rate %"* · `:178` §7 (c) *"an org cannot widen its own entitlement, feature flags or take-rate"* · `:28` the doc-15 index row.

R84/R89 (config layers — this is where two later items land):
- `:169` layer 2 holds *"station fulfilment routes (`paper | screen | both` per kitchen station)"* and **no kitchen-delivery topology key**
- `:170` layer 3 in full: *"**Branch/device:** printer assignments, station identity…"* — *"printer assignments"* is the corpus's entire schema for where paper goes; it has no shape, no key name and **no default**, which `:180` requires of every layer-2 key (*"A key with no default may not be added"*)
- Branding (R89) has no layer at all — see C14.
⚠ Do **not** re-open `:186`, which already records `config.changed`'s payload closure. That is settled (see §4).

---

**C7 · The scope files: `plans/v0.md`, `AGENTS.md` §7, `mvp-plan.md`, `plan-of-record.md` §3/§5/§6.**
**PLAN/DOC.** **Size: medium; five files, all plan-scoped, none in the authority order (`L2`) — do not mistake finishing these for carrying a ruling.**

- **`plans/v0.md:3-4`** — *"**Rule for this document: if a pilot can open tomorrow without it, it is not v0.**"* This *is* R43's bar as a scoping rule; R85 retires it. It is also the catch-all that parks inventory, CRM and the waiter pad **invisibly** — they are nowhere in the explicit v1 list at `:50-56`.
- **`plans/v0.md:54`** — *"LAN mesh and device pairing (**one till per branch is fine for a pilot**)"*. **The single most direct textual contradiction of R93 anywhere in the repo.** R93: *"Three or four tills in one branch is normal and must work at pilot #1."*
- `plans/v0.md:52` lists **billing** as v1 (R87 retires it entirely) and **the platform control-plane UI** (R1 had it in the first sellable product; R86's six drop it — D6).
- `plans/v0.md:15-24` the four-gap table; `:24` K-8 — ⚠ under R85 *"blocked on hardware, not on us"* stops being an acceptable park and becomes **the single hardest launch blocker**: no printer has ever received a byte, and `27-F35`'s comprehension gate on real staff is untouched.
- **`mvp-plan.md:80`** — *"**What the bar deliberately does NOT include:** a Friday night."* The sharpest single line in the corpus against R85. Plus `:43-47` §1 "The bar (R43)", the fourteen-move demo at `:52-67`, `:711` parking inventory/marketing-loyalty/waiter by name, `:712-713` citing R18/R5.
- **`AGENTS.md:99`** still declares v0 to be four items and everything else out of scope. **`AGENTS.md:110`** *"The LAN mesh HAS HOSTS"* is now the wrong direction. **`AGENTS.md:112`**'s `02-F28`/`02-F30` measurement is **stale and actively misled one cluster** — fix it in the same edit (`L1`). **`AGENTS.md:13`** commandment 4 and **`:59`** standing law 2 both narrow under R82/R83.
- `plan-of-record.md:336-337` §5 *"Re-plan modules 05, 08, 09, **10**, 11, 12, 13, **17**"* — 10 and 17 are now launch-set. `:358-372` §6a's eleven "MVP-blocking gaps" name none of inventory's writer surface, CRM's redemption producer or the waiter pad's certificate blocker, and gap 6 is billing. `:283-294` §3's 26-week W0–W7 sequence has **no lane** for inventory, CRM or waiter. `:273`/`:292`/`:296` W6 "Commercial plane — plans, entitlements, subscription lifecycle, invoicing" — the plans/subscription/invoicing legs are dead; the **entitlement** leg survives on non-billing grounds.
- `plans/inventory/design.md:463` and `plans/crm-loyalty/design.md:510-528` both name R43 / `plans/v0.md`'s rule as their acceptance standard. `plans/onboarding/design.md:6` inherits R43 too.
- `plans/inventory/design.md:5,8` measures `specs/10` at *"27 FRs, 161 lines"*; it is **34 FRs, 173 lines** today, so the launch-set plan computes slice coverage against a denominator seven FRs short.

---

### PHASE 2 — KERNEL SPEC ACTS (doc 01). Blocked on D1 and D2.

---

**C8 · 🔒 `01-F43`..`01-F46` — name the new clock source.**
**SPEC + CODE (`packages/sync-protocol`, `packages/sync-client`).** Owning doc: `01`. **Size: the largest single act in this list.** Blocked on **D1**.

`specs/01-kernel-sync.md:84` (`01-F43`) — **five clauses die:** *"**The elected hub (01-F13) is the branch time authority**"*; the offset *"refreshed on **hub contact**"*; *"Because DEC-SYNC-009 makes the hub the branch's WAN uplink…"*; *"**Branch time is CONTINUOUS across hub re-election**"*; *"the hub serves the clock, it does not define it."*
**Three survive and are the part worth keeping:** durations are differences so a uniform offset cancels (*"consistent, not correct"*); *"Offset acquisition never blocks operation (01-F17)"*; *"Branch time is a property of the BRANCH, not of whichever device currently serves it"*.

`:85` (`01-F44`) — the envelope marker is **defined** against hub contact (`branch` once measured *"against the hub"*, `branch_provisional` on *"no hub contact"*). Its solo-device carve-out (*"it **is** the branch"*) does **not** generalise to three cloud-syncing devices, which is R82's whole subject.
`:88` (`01-F45`) — textually hub-free but a **dead letter** without a `branch` tier: the basis-precedence rule becomes one tier and stops discriminating.
`:89` (`01-F46`) — survives; inherits the damage (business day is `businessDate(wallClock.now() + branchTimeStatus().offset_ms)` at `apps/pos-electron/src/main/index.ts:938` and `apps/pass-kds/src/main/index.ts:406`, so two devices in one branch can sit on different business days).

**Measured today, and it is worse than "will break": it is already broken.** `apps/pos-electron/src/main/mesh.ts:161` returns `unmeshed("no LAN configured")` and `:174` returns `unmeshed("not paired — no LAN credential (01-F73)")`; `store.setLanCredential` has **no shipping caller** (stated in three shipped comments: `packages/sync-client/src/roster-fetch.ts:40`, `cloud-session.ts:1133`, `apps/pos-electron/src/main/index.ts:231`). So `session.start()` never runs and **every event on every shipped till is stamped `branch_provisional` right now**, with `branch_created_at === device_created_at` (`packages/sync-client/src/device-store.ts:1061`).

**And a shipped comment claims the protection that disproves — `L11`, verbatim, on a live path.** `services/storefront/src/origin.ts:114`: *"Every duration this product computes anchors on `order.confirmed` (`03-F25`), **which the TILL emits with `branch` basis** — so this stamp is never the value a kitchen or service timer reads."* It does not. `06-F31`'s entire safety argument for a permanently-provisional cloud origin rests on that sentence and is void today. **Report-and-correct, do not drive-by fix — protected path.**

---

**C9 · 🔒 `hello_ack` gains a server clock field; un-defer `01-N2`.**
**CODE (`packages/sync-protocol` + gateway + `sync-client`) + SPEC.** **Size: an additive optional member under `v: 2`, plus two consumers.** Blocked on C8.
`packages/sync-protocol/src/messages.ts:541-580` carries `session_id`, `hub`, `resume_from`, `relay_authorized?`, `renewed_token?`, `compression?`, `reference_versions?` — **no clock**. `01-N2` (`specs/01-kernel-sync.md:331`) already recorded exactly this and deferred it: *"A direct device↔cloud skew measurement is explicitly deferred: nothing in the protocol carries a server clock at hello time … **so it needs a protocol field** and is out of Wave-0 scope."*
⚠ `messages.ts:909` carries a comment saying the offset acquisition *"need[s] no protocol change at all"* **because the hub heartbeats its followers**. Removing the hub is precisely what makes the change owed. Correct that comment in the same edit.
Also in this edit: `hub: z.boolean()` at `:546` is a **required** member with no meaning post-R82, so removing it is a `v` bump; `relay_authorized?` at `:550`; `push_ack.origin_device_id` at `:616`; `ping`/`pong` at `:911-912`; `MeshTransport`/`PeerInfo` in `packages/sync-protocol/src/transport.ts:1-11`.

---

**C10 · 🔒 `01-F62` — widen the org-scoped set for a cloud-plane vendor/impersonation act.**
**SPEC (doc 01 §4 catalog + doc 15) then CODE.** Auth + kernel, doubly protected. **Size: a catalog act, two payload schemas, a writer change, an `01-F71` clause.** Blocked on **D2**.

Today (`specs/01-kernel-sync.md:130-133`): the org-scoped set is **five** types and `01-F62` names `audit.*` as its own worked example of a family that stays branch-scoped *because a device emits it*. Shipped identically: `services/sync-gateway/src/org-events.ts:32-38` holds exactly those five, and `:87-93` refuses `audit.*` **by name** in its error string. Even if `01-F62` allowed it, `packages/domain/src/registry.ts:1596-1612` ships seven audit subtypes with neither impersonation member among them, so `01-F4` throws at emit (`28-F19` (i), `specs/28-tenancy.md:202`).

Two corpus promises have **no carrier at all** and both are R92's headline clause:
- `specs/15-platform-admin.md:14` (§2) promises `audit.impersonation_started` / `audit.impersonation_ended` *"into org ledgers"*.
- `specs/15-platform-admin.md:8` (§1) promises *"actions that touch an org's data land in **that org's ledger as layer-1-actor events**"* — a term with no referent anywhere.

⚠ The correct resolution is `05-F28`'s **(b)** and the discriminant is not being emptied by it: `01-F62`'s test is *who may legitimately emit*, and a vendor console act's only legitimate emitter genuinely **is** the cloud plane. Precedent for reading the test this way, in both directions: `01-F39`'s `storefront_cloud` (`specs/01-kernel-sync.md:78`) lands the other way for the same reason. But `05-F28` is marked **ANSWERED** (see §4) and R92 forbids a fourth answer — so this must be ruled, not reasoned into.

---

**C11 · 🔒 Strike `01-F12`..`01-F15`, `01-F72`..`01-F74`, `01-F81`; re-mark four `DEC-SYNC-*` rows.**
**SPEC.** Owning doc: `01` (+ `DECISIONS.md`). **Size: large but mechanical once C8 lands.** Blocked on C8.

- `:36` heading *"Sync — branch LAN mesh"* · `:37` `01-F12` *is* device↔device exchange · `:38` `01-F13` *is* the election **and** the branch relay · `:39` `01-F14` *is* the full branch stream on hub-eligible devices (⚠ R82 says nothing about retention, so what a device retains becomes **unspecified** — see **D3**) · `:40` `01-F15` *is* the LAN fast path (the **budget** survives, restated in C6).
- ⚠ R82's founder reasoning **inverts `DEC-SYNC-009`'s trigger.** `specs/DECISIONS.md:27` reasons from *"the common deployment gives internet only to the counter terminal … so waiter/kitchen devices are LAN-only by design"*. R82's waiter is on 4G and the counter is not reaching him — the exact opposite premise.
- `:188` `01-F72` — its (f) clause claims *"Admission is a property of the **channel** … so this FR survives that change without amendment."* R82 deletes the **channel**, not the topology, so the self-declared survival clause fails and the FR must be **struck, not amended**.
- `:197` `01-F73` (the per-org PKI, *"a SECOND credential beside `01-F47`'s cloud token"*), `:206` `01-F74` (the signed branch roster), `:269` `01-F81` (the distribution path written specifically to unblock `01-F74` (b)) — all LAN-admission-only.
- `:220` `01-F80` (g) *"and no LAN (`01-F72` (d))"*; `01-F80` (f)'s *"one act, **two credentials**"* becomes one.
- `:92` `01-F47`'s *"including hub-relayed contact"* and *"expiry withdraws cloud/**LAN** admission"*; `:93` `01-F48`'s *"the hub does the same on LAN"*.
- `:324-325` §5's device-SQLite LAN-credential and roster rows; `:345-348` §8 (⚠ `:345` reads *"over WebSocket (cloud) and LAN sockets"* — read it before quoting); `:353` §9.1's *"LAN transport detail … decide in spike"*.
- `specs/DECISIONS.md`: `:18` `DEC-SYNC-002` (hub rules + the `counter_rn` split), `:20` `DEC-TIME-001` (b) *"the elected hub is…"*, `:24` `DEC-SYNC-011`'s *"a LAN-only device under `DEC-SYNC-009` has none at all"*, `:26` `DEC-SYNC-004` (**restored in content** by R82 while its successor is overruled — re-mark, do not leave pointing at an overruled successor), `:27` `DEC-SYNC-009`, `:29` `DEC-SYNC-006`.
- `specs/19-sync-engine-decision.md:15` — R3 *"Branch LAN sync device↔device with WAN down, sub-second | 01-F12..15 — **make-or-break**"*. ⚠ **This re-opens a decision, not a sentence** (see **D4**). Supporting rows now stale: `:25`, `:38`, `:40`, `:42`, `:44`, `:50`.

⚠ **`services/sync-gateway/src/pairing.ts` must be EDITED, not deleted.** It imports `createOrgIssuer`/`issueDeviceCertificate` from `@restos/lan-pki` at `:68`, but it is also `01-F80`'s **identity** path — the half R93 promotes into the launch set (C18). Deleting it would take pairing down with the PKI.
⚠ **`01-F65` at `:153` says *"The three ids of `01-F13`"* and `01-F13` defines no three ids.** That dangle is **pre-existing today**, not created by R82 — fix it, don't file it as an R82 finding.

---

**C12 · 🔒 Delete ~13,200 lines of mesh code; edit ~25 files.**
**CODE.** `packages/sync-client`, `packages/sync-protocol`, `packages/lan-pki`, both Electron mains, the gateway relay path, `packages/ui`. **Size: the largest code act in this list.** Blocked on C11.

Whole-file deletions, production, **line counts re-verified exact**: `packages/sync-client/src/mesh-session.ts` 626 · `lan-roster.ts` 405 · `apps/pos-electron/src/main/mesh.ts` 289 · `apps/pass-kds/src/main/mesh.ts` 279 · `roster-fetch.ts` 201 · `packages/lan-pki/src/index.ts` 193 · `packages/device-config/src/lan-mesh.ts` 191 · `packages/testing/src/lan-credentials.ts` 126 · `lan-credential.ts` 122 · `hub-election.ts` 27 · `HUB-ELECTION.md` 12 + `packages/lan-pki/{CLAUDE.md,package.json}`. ≈ **2,530 production lines**, plus **≈10,371 lines** of acceptance suites across 28 files, plus the LAN half of `transport-ws.ts` (`:214-498`; the cloud half at `:499-638` stays).

Downstream edits: `packages/sync-client/src/index.ts:100-128` (barrel re-exports), `device-store.ts:70-71`/`:325-327`/`:1493` (`lanCredential`/`lanRoster`), `packages/device-config/src/index.ts:48`, both apps' `main/index.ts` `createLanMesh` construction and `will-quit`/`notifyAppended` funnels, `services/sync-gateway/src/{auth,gateway,schema,registry,errors}.ts` (the whole `hub_relay` / relay-authorization path), `services/sync-gateway/src/__acceptance__/spike/` (1,323 lines — **rebuild, don't delete**, it is `01 §8`'s spike harness).
`packages/domain/src/device-classes.ts:34` `HUB_ELIGIBLE_CLASSES` loses both production readers → becomes a `seams:check` Rule A candidate. **Re-run `seams:check` expecting it to say something NEW** (`L8`).
⚠ `apps/pos-electron/package.json:26` declares `"@restos/lan-pki": "workspace:*"`; removing a workspace dependency triggers `T9`'s reinstall rule.
⚠ **`transport-rn.ts:19-20` carries a mesh premise in a shipped protected-path comment** — *"the branch's own tills keep running on the LAN mesh whether or not the manager's phone can see anything."* Correct it; it was filed "clean" by the report.

---

**C13 · 🔒 `01-F39`'s `counter_rn` clause struck; the hub-election ranking retired.**
**SPEC + CODE (`packages/domain`).** **Size: one FR clause, one constant, four doc rows.** Blocked on C11.
`specs/01-kernel-sync.md:78` defines `counter_rn` as *"counter POS, React Native host — full branch window, hub-eligible"* and ranks it second in election. R94: **NEVER AN ANDROID TILL**; R82 deletes the election.
⚠ **Do not remove the vocabulary member.** `01-F74` (a) and `01-F81` carry `device_class` as **open text** on `01-F56`'s forward-skew reasoning; the safe act is to stop *minting* it (`provision-device --class`, `01-F80` (a)) and strike the FR clause. `packages/domain/src/device-classes.ts:5` (member), `:34` (`HUB_ELIGIBLE_CLASSES`).
Also carries: `packages/sync-client/FOLDS.md:11,12,14,15` list `counter_rn` as a host of four folds; `packages/sync-client/HUB-ELECTION.md:5`.
⚠ **Partial carry already exists** — `specs/21-ux-system.md:33` reads *"the React Native clause is **DORMANT**, not deleted … **`apps/pos-rn` is retired as a plan**."* Do not re-file it as wholly uncarried.

---

**C14 · 🔒 `01-F68` branding + `01-F75`'s resource set.**
**SPEC + CODE.** **Size: two FR amendments, a wire member per resource, a bitmap store that does not exist.** Blocked on C11 (`device_roster` goes) and C6 (branding needs a config layer).

- `specs/01-kernel-sync.md:161` (`01-F68`) lists *"**Deliberately absent** … branding (`06`)"*. Under R89 branding is needed on till, KDS, waiter pad and back office — none of which doc 06 owns. Shipped exactly as specified: `services/sync-gateway/drizzle/0010_tenancy_records.sql:47-52`, four columns.
- `specs/01-kernel-sync.md:225` (`01-F75`) — **measured today, the wire ships FOUR** resources: `catalog`, `staff`, `device_roster`, `config` (`packages/sync-protocol/src/messages.ts:491,492,506,522`). The FR says FIVE as of `17-F22`; **the missing member is `campaign`**, not `config`. R82 removes `device_roster`. R86 needs `inventory` — named by id in shipped prose at `services/api/src/server.ts:125-127`: *"amendment **A1** … **no frame can carry this artifact to a DEVICE, so `10-F17`'s count sheet has no item list on the till.**"*
- ⚠ **A logo is a bitmap and `01-F75`'s `entries[]` is a typed row set.** Verified: there is **no upload, blob, multipart or asset path anywhere** in `services/api/src`, `services/sync-gateway/src` or `services/storefront/src`. R89's logo has no store on either plane. See **D8**.
Blast radius: `01-F75` is cited in 6 spec files and 77 src files.

---

**C15 · 🔒 `01-F61`'s lockout scope under N tills.**
**SPEC (auth).** **Size: one clause, plus a ruling.** Blocked on **D5**.
`specs/01-kernel-sync.md:134` reasons from *"one wrong PIN away from locking a queue of customers out of **the only terminal**"*. Per-(device, user) at four tills gives an attacker **4× the guessing budget** on a 4-digit credential, walked till to till. `01-F28`'s constraint is real — an offline device genuinely cannot see another's count — so this cannot simply be widened. `11-F21` (`specs/11-staff-people.md:61`) already rules the hash cloud-held so a PIN works on every till: the credential spans tills and the counter does not.
Carries with it: `specs/04-waiter-app.md:100` — *"with several tablets behind one till, 'device' is the till, so a waiter locked out at one pad is locked out at all of them **and at the counter**. That is one credential with one counter and it is the correct reading."* Under R93 that is four counters and the stated protection is false. `L11`.

---

### PHASE 3 — MODULE SPEC ACTS

---

**C16 · Doc 03 — kitchen delivery is a configured topology (R84), and a KDS that goes away must fall back to paper (R83).**
**SPEC first, then CODE.** Owning doc: `03` (routes, documents) + `00 §7` (the key) + `14` (the surface). **Size: one new FR, three amendments, a new config key, a new liveness concept.**

The head of the change, `specs/03-kitchen-fulfillment.md:139` (`03-F51`):
> *"A station routed `screen` **enqueues no print job at all**: no bytes, no attempt, no retry budget, no band, no `kot.print_failed`. That is not a suppressed failure — there is no job to fail."*

and `:141`:
> *"A station with no route to the kitchen is refused at **CONFIGURATION** time, **never per order** … discovering that once per order at 20:40 on a Friday is the failure this clause exists to prevent."*

R83 requires exactly the per-order-time decision this refuses. `03-F51` is internally consistent and R84/R83 overrule its premise: absence is no longer decided only *before a job exists*.

- **There is no liveness concept for a kitchen screen anywhere in the corpus.** The only presence-detection sentence is `specs/02-pos-app.md:89` — *"detection: the branch device registry contains no pass/KDS/waiter device"* — a **static roster read**. `printer.status_changed` (`03-F11`/`03-F54`) is the only "a device went offline" type and it is scoped to printers. `01 §4` carries no type for a screen, so **commandment 2 stops an implementer dead**. New FR owed, and possibly a catalog act if the alert must reach doc 05/15 rather than the counter's honesty strip (**D2**, **D7**).
- **The vocabulary cannot express R84's three shapes.** `03-F22` (`:71`) is `paper | screen | both` — *what kind of destination*, never *which*. R84's (b) (a printer **in the kitchen**) and (c) (**one** printer at the counter, kitchen slip then bill) are both `paper` under it. R84 says *"chosen per branch"*; `03-F51` and `DEC-HW-003` (c) both argue at length that a branch-wide scalar cannot express a per-station fact (**D9**).
- **`03-F2` (`:27`) is the corpus's only printer-destination model and it covers KOTs only.** No FR anywhere says which printer a `receipt`, `bill`, `shift_close_slip`, `day_summary` or `refund_slip` goes to. The sole exception is `09-F19` (`specs/09-rider-dispatch.md:66`, *"prints on the **counter printer**"*), in a Wave-2 doc. Topology (b) is unspecifiable without this.
- **`03-F49` (`:111`) makes (c) half-supported on the commonest hardware:** *"a 58 mm printer cannot print kitchen tickets. It can still print receipts and bills."* R84 blesses (c); `DEC-HW-001` has already re-litigated and **upheld** the 42-column floor on legibility. Tell the founder it is now sharper; do not let an implementer resolve it.
- **`03-F58` (`:224`) is calibrated for a printer standing in a kitchen** (*"until somebody walks into the kitchen and looks at the roll"*, and three grounds for why it is **not** `03-F5`'s S1 band). Under (c) the held roll is holding the customer's bill 30 cm from the cashier. Amend, don't rewrite. Same shape at `:218` (`03-F59`, cash slips and receipts *"deliberately NOT restored"*).
- **`27-F11g` (`specs/27-design-language.md:94`)** states one direction only — *"Where paper is the only kitchen channel there is no screen fallback"*. R83 now **mandates** the mirror.
- **`15-F10` (`specs/15-platform-admin.md:52`)**'s go-live gate is built on the same static roster fact: a branch that passed in March and lost its KDS in August is, to that rail, still fine.
- **`03 §8` (`:288`)** — *"Pass and KDS are one Expo app with a mode switch (pass vs station)"*. `apps/pass-kds` is **Electron** with no mode switch and no station identity, so `03-F18`/`03-F20`/`03-F21` are unbuilt and topology (a) as shipped is a pass screen showing the whole branch queue. ⚠ And the projection is worse than the surface: `KitchenQueueRow` is **order-level and carries no station and no line breakdown** (`packages/sync-client/src/device-store.ts:198`), so `03-F51:146`'s *"filtered by the catalog's `station`"* is untrue of the shipped projection, not merely of the screen.
- ⚠ **`03-F5`'s alarm band and `03-F41`'s paper-out hold both survive R83/R84 unchanged in substance.** Do not weaken them. `03-F41` is a hardware fact (`ESC c 4`), not a topology fact.

---

**C17 · 🔒 Doc 03 kitchen-topology CODE: one spooler serves everything, and the KDS-existence question is answered from a tier label.**
**CODE.** `apps/pos-electron`. **Size: a printer registry (14-F11's unbuilt surface) plus a per-station destination in the spooler — not small.** Blocked on C16.

- **`apps/pos-electron/src/main/index.ts:510`** — this is the line where the product answers R83's *"if there is a kds"*, and it answers it from a **tier label**:
  ```ts
  kitchen_screen: tier.source === "assumed" ? null : tier.tier !== "T1",
  ```
  With `RESTOS_HARDWARE_TIER=T2` set, `tier.source === "configured"` (`hardware-tier.ts:166-169`), so `kitchen_screen` is **`true`** and `station-routing.ts:175` returns `{ ok: true, verified: true }` — **a screen-routed branch runs VERIFIED on a label an operator typed, with no device ever contacted, and the boot line then says *"every station has a route"*** (`station-routing.ts:265`). This contradicts `restaurant-os.md:47` at authority position 1: *"**No code may branch on the tier to decide whether a piece of hardware exists.**"* The code's own defence at `index.ts:497-503` is written for the `assumed → null` path and does not cover the `configured` path. **This is the head of the code change, not `printing.ts:818`.**
- **One spooler, one transport, one capability for every document type.** `index.ts:1543-1546` builds a single `createSpooler({ transport: printerTransport(kotCapability(), …) })` handed to `createKotPrinter` (`:1633`), `createCashPrinter` (`:1704`) and `createReceiptPrinter` (`:1737`); `printer_name = capability.model_id` at `printing.ts:594`, `:1468`, `:1920`; one cable (`RESTOS_PRINTER`, `printer-link.ts:94`). **`03-F2` has no implementation and topology (b) is literally unbuildable; topology (c) is what ships by accident.**
- **`printing.ts:818`** `if (!routesToPaper(at)) continue;` and `station-routing.ts:235` — must become a function of configuration **AND** liveness, which the comment block at `printing.ts:797-817` explicitly argues against.
- **With the KDS down the counter has no control at all.** `printing.ts:888` `return owedChits(order).length === 0 ? "sent" : "owed";` — a fully screen-routed order reads `"sent"` and `02-F55`'s state (iii) greys *Send to kitchen*. The only kitchen-print IPC is `resendAlarm` (`shared/ipc.ts:1011`), reachable only from a band on a **failed** job — and no job exists. **`03-F48`'s one-tap reprint is OWED and unbuilt** (`specs/03-kitchen-fulfillment.md:219`), and R84's *"on-demand print kitchen receipt"* is neither a reprint of a failed job nor of the last one.
- **The fallback does not restore the state machine.** `apps/pos-electron/src/main/line-advance.ts:457` gates `kot.printed → in_prep` on `autoAdvancesLines(tier)`, which is `tier === "T1"` (`hardware-tier.ts:191`). So a **T2/T3 branch that falls back to print gets its chit, emits `kot.printed`, and the lines still sit at `confirmed`** — the order never satisfies `03-F17`'s exit condition. `line-advance.ts:411` says so: *"The half `03-F52` did NOT move is `printEvent`'s."*
- **The customer sees it too.** `06-F17` (`specs/06-storefront.md:57`) sets the storefront status label **preparing** on *"first `kot.printed` or any line `in_prep`"*. Under a `screen` route with the KDS down, a QR customer sees **confirmed** indefinitely while the kitchen has been told nothing, and `06-F18` does not fire because the branch is syncing fine.
- **Station routing does not quiet a printerless branch.** `README.md:705-715`: receipts and cash slips are **not station-routed at all**, so a till with no `RESTOS_PRINTER` raises an S1 band per settlement. `03-F51`'s *"absence of a printer is a configuration, not a fault"* is true only of the KOT.
- ⚠ Two shipped oracles pin the current behaviour and must be re-authored **by a different session** (`20 §4.3`): `apps/pos-electron/src/main/__acceptance__/station-routing.test.ts:86-133` and `station-routing-seam.test.ts:100`. Note the seam oracle's provenance header at `:3` already declares it was written by the implementing session — a live `20 §4.3` breach to fix while you are there.
- The mechanism for "is the KDS connected" exists and nothing reads it: `PeerInfo` carries `device_class` (`packages/sync-protocol/src/transport.ts:11`) and `"kitchen"` is a real class — ⚠ but **R82 deletes that mechanism**, so the liveness fact must be built on the cloud/link path, not on peers.

---

**C18 · 🔒 Doc 02 + the cash folds — multi-till (R93). The worst money defect in this list.**
**SPEC first (doc 02 §3 + a glossary), then CODE (`packages/sync-client` folds).** **Size: an FR block plus a protected-path fold with a new dimension.** Blocked on **D10** (what a shift is bound to).

**The kernel is already multi-till and always was.** `01-F25` (`:58`) puts no cardinality on devices per branch; `01-F80` (a) (`:213`) mints a fresh never-reused `device_id` per claim; the registry key is `(org_id, device_id)` (`services/sync-gateway/src/schema.ts:409`) with the only branch check refusing to *move* a device. `02-F11` has specified multi-terminal coherence since Draft 1.

**The money is not.** `packages/sync-client/src/folds/shift-cash.ts:162-176` — `ShiftEvent` projects `{id, type, payload, branch_created_at, time_basis, actor_user_id}` and **`grep -an "device_id" on that file returns nothing**. Three consequences, each quoted from the fold's own header:
1. **One branch float, not four** — `:54-56` *"folding the actor in there would zero **the branch's opening float**"*; `:459-460` *"a duplicate DAY open (which is **the whole branch's opening cash**)"*.
2. **One unbound-drawer bucket for four physical drawers** — `:138-140` *"One bucket, not one row per event"*. `02-F43` exists to make theft detectable and cannot name the drawer.
3. **Expected cash is per-shift and a shift is bound to a cashier, never a device** (`02-F22`, `specs/02-pos-app.md:67`) — a cashier who opens at till 1 and settles at till 3 puts cash in drawer 3 against an expectation attributed to shift 1.

**And the renderer resolves "which shift is open" branch-wide.** `apps/pos-electron/src/renderer/CashSurfaces.tsx:313` — `openShiftOf` returns the **latest open shift in the branch**. Two live defects: (a) at `:750-751` `unavailable={openShift !== null}` makes "Open my shift" inert for a **manager or owner** standing at till 2, with a reason that is false for her (`authorize.ts:1047-1049` returns branch state unnarrowed for `own_branch`/`org` reach); (b) the same value feeds `shift_id` into `cash.drawer_opened` (`:874`), `cash.paid_out` (`:960`) and `payment.recorded` — **money binds to another till's drawer**. The file says so itself at `:298-312`: *"Two answers is not a duplication smell, it is a **live money defect**."*
And `:453`/`:744` chain `prev_shift_id` off the branch-latest shift, so two tills opening in one day **both** name the same predecessor and `forkedBy` (`shift-cash.ts:462-474`) raises `shift_open_fork` (`:586`) as a **guaranteed false positive on ordinary two-till operation**.

**This is not theoretical.** `specs/DECISIONS.md:12` (`DEC-MONEY-009`) records *"the first two-till run this product has ever had"* losing **Rs 2,240** silently.

**Legality of the fix, pre-cleared for the reviewer:** reading `device_id` in the fold does **not** breach `01-F34`, which bans *ordering metadata* (`global_seq`, `lamport_seq`, device clock). `device_id` is a delivered envelope field (`packages/domain/src/envelope.ts:37`), and `02-F45` (`specs/02-pos-app.md:115`) already establishes the precedent in terms for `actor_user_id`: *"a **delivered** field of the event, stamped once at the origin's append … never derived from the reading device's state."*
⚠ `26 §8`'s Proxy-poisoned envelopes throw on any field outside the read set — **widen the fixture harness deliberately or every fold suite reds at once.**
⚠ **R73 already supplies the day half** (*"THE DAY'S EXPECTED CASH IS THE SUM OF THE SHIFTS CLOSED WITHIN IT — no new event type"*) and R73 is itself uncarried. **R93 and R73 land on the same FR and should be carried in one edit.**

Also in doc 02, R93/R94:
- `:14` *"In **T1 the POS is the entire restaurant** — one device"* · `:285` *"shift and day close all on **one terminal**"*
- `:88` `02-F31`'s title asserts one device while its detection rule tests only for the **absence** of pass/KDS/waiter — four `counter_electron` tills and no KDS satisfies it
- `:12` *"**Android:** React Native (Expo), for tablet-counter and **secondary-terminal** setups"* and `:317` *"RN build: Expo + `op-sqlite`, Hermes"* — R94 kills both; note `:12` is the corpus's *current answer* to R93's question
- `:82` `02-F29` *"(Multi-branch profile only, **Wave 4**)"* — a wave gate inside a launch-set spec
- `:307` `02-N6` gates on *"before **Wave 1 sign-off**"*, a milestone R85 replaces

---

**C19 · Doc 04 + doc 18 — the waiter pad (R94 + R83).**
**SPEC.** **Size: doc 04 is 221 lines and 36 FRs, of which `04-F21`..`04-F36` (~60% of its text) are reasoned from a premise that may be about to change.** Blocked on **D11**, and D11 is blocked on **D2**.

**The web half is already done and the phone half is actively refused.** `apps/waiter` is Vite/React 19 with zero Expo dependencies, and `04-F21`'s browser-terminal ruling is already carried into `18 §6:106-108`. What is wrong:

- **`04-F26` (`specs/04-waiter-app.md:114`) — *"THE PHONE IS NOT COVERED"*** against R94's headline *"PHONES, IN A BROWSER"*. ⚠ Its supporting argument is **transplanted and does not hold**: the layout-gate quote it relies on (`apps/pos-electron/src/layout-gate/main.ts:128-131`) is about **the counter's** renderer — *"a portrait surface **the counter** has no layout for"* — and that gate never measures `apps/waiter`, which the same file concedes at `:161-165` (*"it has no row on this gate AT ALL"*). And **`27-F11b` (`specs/27-design-language.md:47`) contradicts it with an FR id**: *"**The phone is where '~6 per page' actually applies** … **Waiter and rider surfaces inherit the tested paging configuration**"*, beside a **founder-confirmed** `waiter phone ~6.5″` row at `:44`.
- **Doc 04 §1 `:5` is now half-backwards.** The *Expo React Native* strike is right and R94 confirms it; the *"cheap Android phones including BYOD"* strike is **wrong under R94** and cites `04-F26` as its authority.
- **Doc 04 §6/§7/§8 are entirely unstruck and are R94's exact target:** `:185` *"on a **2 GB Android 10 device**"*, `:186` *"**APK ≤ 40 MB**"*, `:189` cold start on *"the low-end reference phone"*, `:199-200` layer-2 keys for *"whether **BYOD is permitted at all**"*, `:208` *"**Expo + Hermes + `op-sqlite`**; dependency budget enforced in CI"*, `:209` *"`packages/sync-client` grows a slice-filter parameter"* (which also contradicts `04-F21`'s *"hosts no `sync-client`"*), `:210` *"In-branch notifications ride the **LAN socket**"*, `:211` *"**Distribution: Play Store + EAS update channels**"*, `:219` *"revisit after **Wave 4** pilots"*.
- **Doc 18 has no section describing what `apps/waiter` actually is.** `18 §7` is *"Web UI rules (**Next.js apps**)"*; `18 §8` is Expo; the waiter is neither. Under R94 it is the flagship browser surface and the handbook has no rules for its build tool, its service worker (which `04-F22` (a) makes load-bearing) or its bundle budget. Plus `18:31` `pos-rn/ # Android counter (Expo)`, `18:33` `waiter/ # T3 handheld (Expo, BYOD-friendly)` (**self-declared stale at `18:108` and left standing**), `18:62` *"`ui/` # RN component kit … web consumes tokens only"* (false — `apps/waiter/src/main.tsx:1` imports `PanelRoot`, `ThemeProvider`; `Enrol.tsx:1` imports `Panel`, `TextEntry`, `Tile`, `WorkSurface`), `18:124`, `18:134`, `18:136`.
- ⚠ **`apps/waiter` has NO `layout:check` row and has never been measured in Blink** — its own header says so (`apps/waiter/src/Pad.tsx:60-65`). Under `L9` a phone layout would ship measured by nothing, and `packages/ui` has no portrait posture (`packages/ui/src/tokens/index.ts:97` — `"counter" | "keypad" | "kitchen" | "handheld"`). **Real design work, not a flag flip.**
- ⚠ **Already recorded as owed elsewhere** — `specs/05-manager-console.md:125` names `18 §2`'s tree and `18 §8`'s pure-JS line as spec PRs owed under R49. Do not double-file them.

---

**C20 · 🔒 Doc 03 + `packages/escpos` — the receipt becomes a builder (R90) with R91's layout and R89's logo.**
**SPEC first, then CODE.** **Size: depends entirely on D12 — one amended clause, or five FRs and the property-testability argument.**

- **`03-F30` (`specs/03-kitchen-fulfillment.md:98`) forbids R90's vocabulary in its own words**: a `DocumentProfile` *"**cannot express position, order, font or structure**"*, and at `:99` the rationale — *"**No POS vendor surveyed ships a WYSIWYG thermal editor**; even the best 'visual editor' only reorders predefined blocks."* ⚠ **The corpus's own research narrows the cost and the founder should see it before scoping**: `plans/wave-1/research/print-customisation.md:65-68` records that **Shopify — R90's named model — ships exactly the fixed-block reorderer**. See **D12**.
- **A slot value is a scalar, so no profile can carry R91's `[logo]`.** `packages/escpos/src/document.ts:53` `SlotValue = string | number | boolean`; the file header at `:8-9` states the law. ⚠ **The raster capability already exists and is unreached**: `encoder.ts:37` `{ kind: "image"; width_dots; height_dots; bits }`, `capability.ts:29` `raster_ok`, `specs/03:286` *"Logos and QR codes rasterized at the target dot width"*. What is missing is the **carrier and the block**, not the encoder — and `receipt-document.ts:485-490` says so in shipped prose.
- **R91's `[logo]` and `custom text` sit ABOVE the receipt details; `03-F33`/`03-F34` put them below and hard-refuse the alternative.** `:104` fixes the ladder `HEAD_LOCKED → HEAD_OWNER → BODY → TOTALS → FISCAL_LOCKED → FOOT_OWNER → TAIL_LOCKED`; `:105` makes an owner slot in a locked region *"a **hard refusal to print plus an S1 band**"*, enforced at `packages/escpos/src/render.ts:130-134`. `RECEIPT_HEAD` is `HEAD_LOCKED` (`receipt-document.ts:499`). **R91's first three lines are unrepresentable as the ladder stands** — this is the structural act (**D13**).
- **R91's tax row.** `packages/escpos/src/receipt-document.ts:163-171`: *"`16-F4`'s pack rate in integer basis points, **carried and not printed** … **NO FR requires a rate on a customer's receipt**"* — and the oracle asked for exactly this ruling (`__acceptance__/receipt-tax-line.test.ts:598-601`, DEFERRED block: *"Whether a customer can check a tax without seeing its rate is a real question and it is doc 02's or doc 16's, not this file's."*). **R91 is the answer.** A `rate_bps → "16 %"` formatter does not exist.
- **`16-F33` (c) (`specs/16-tax-module.md:74`) forbids two totals; R91 prints `Total` and `Total payable by customer`.** The **arithmetic already matches** (`receipt-document.ts:420-424` Subtotal/Tax/rounding/Total); the **labels do not**. Two-string change plus a ruling on whose word wins (**D14**). Note `roundingRow` prints a fourth row R91's layout does not mention.
- **`27-F57` (`specs/27-design-language.md:159`)** — *"Quantity … sits **immediately left of the item name on the same line** … **never in a right-aligned column**"*, on a measured basis (71% decode → 35% execute). R91 lists *"items | price | quantity"*. Probably a field list, not a column order — **do not let an implementer resolve it silently** (**D15**).
- `02-F15` (`specs/02-pos-app.md:49`) has promised a *"configurable header/footer/logo"* since Draft 1 and doc 03's own §7 layer-2 list (`:280`) carries **no document-profile row at all**.
- ⚠ **R91's conditional FBR QR is already correct and needs no act** — see §4.

---

**C21 · The back office has no layer-2 settings surface at all. This blocks R84, R89, R90, R91 and R86 simultaneously.**
**BOTH.** Owning doc: `14`. **Size: large — this is the biggest single unbuilt surface in the launch set.** Blocked on C6 (the config keys) and C20/C16 (what the editors edit).

- **The API ships and nothing consumes it.** `services/api/src/config-router.ts:60-79` exports `configProcedures` with `read`/`save`, both built `authorized("config.manage")` (`14-F43`..`14-F48`), mounted at `router.ts:278`. **`apps/backoffice/src` contains no consumer of either.** So an owner cannot type a tax rate, a rounding step, a station route or any layer-2 key today. **This blocks R91 before it blocks R90's editor.** `L8` at module scale.
- **`grep -c "printer" apps/backoffice/src` = literally zero.** `14-F11`'s routing rules, printer registry and test-print button do not exist, so under R84 (b) an installer cannot prove which printer is which. `03-F51`'s route is an **environment variable on the till** (`RESTOS_STATION_ROUTES`) despite `00 §7` declaring it layer 2.
- **`specs/14-backoffice.md` has zero occurrences of "customer" and zero of "campaign"** (measured). `specs/17:9` routes campaign creation to *"back office doc 14"*; doc 17 §1 `:12` disclaims *"a full CRM segmentation builder"*. **CRM has no owning spec** (**D16**), and campaigns ship today as `RESTOS_CAMPAIGNS`, a JSON env var on the till (`apps/pos-electron/src/main/campaigns.ts:34-35`).
- **27 of doc 14's 48 FRs appear anywhere in `apps/backoffice/src`.** Absent: `14-F8`, `14-F9`/`14-F10` (recipes — ⚠ **these DO exist as FRs**, at `specs/14-backoffice.md:82` and `:85`), `14-F11`, `14-F16`..`14-F19`, `14-F21`, `14-F23`, `14-F25`, `14-F27`, `14-F43`..`14-F48`.
- **`14-F27` (`:207`) is the corpus's only mechanical go-live gate** and its five items are `≥1 device paired`, `≥1 printer test print`, non-empty menu, opening float, *owner app connected* — **none of them inventory, CRM or a waiter pad, and one of them (owner app) not in R86's six**. R86 lands here first.
- **Two stale spec lines to fix in the same edit** (`L3`): `specs/14-backoffice.md:169` and `:322` (§9.16) both still say `config.changed` has no payload schema. **It does** — `packages/domain/src/registry.ts:522`, and `specs/00:186` already records the closure with a strikethrough.

---

**C22 · Doc 15 + doc 28 — excise billing (R87), and draw the line where R87 tells you to.**
**SPEC, plus citation touches in ~6 code files.** **Size: ~24 spec sites across 9 documents; no behaviour changes.**

⚠ **R87's own text: *"Draw the line carefully and do not over-delete … A future session must not read this ruling as licence to delete tenant suspension."*** The **GOES / STAYS** line, verified:

**GOES:** `15-F5a` (`specs/15-platform-admin.md:32`, plan shape — its sole remaining warrant was R18, now retired) · `15-F6` (`:33`, the take-rate, zero code files) · `15-F23`'s take-rate meter row (`:91`) · `15-F2`'s take-rate parenthetical (`:22` — ⚠ **surgical**, the typed confirmation is load-bearing for suspension at `28-F9` (a)) · `15-F24`'s *"invoicing and collections are outside this module"* (`:95`) · `15 §9.4` (`:180`, the invoicing handoff — **the keystone**: `15 §9.7`, `28-F22` and `28-F9` (a) all defer to it) · `14-F20` (`specs/14-backoffice.md:153`) · `12-F19` and `14-F24`'s *"net of … take-rate"* · `06-F22` (`specs/06-storefront.md:66`, `rate_bps`/`fee_paisas`) and its `:181` never-configurable clause · `07-F5` (`specs/07-whatsapp-channel.md:39`) · `28-F6`'s plan-shape member (`specs/28-tenancy.md:68`, `:71`, `:74`, `:77`, `:255`) · `28-F22` (`:224-227`) reduced to one sentence · `28 §9.2` (`:292`) and `§9.24` (`:314`) **CLOSED, not answered** · `§9.13` (`:303`) superseded · `01-F62`'s `metering.usage_recorded` catalog entry (`specs/01-kernel-sync.md:311`).

**STAYS:** the whole `active ⇄ suspended` lifecycle (`15-F25`, `28-F2`, `28-F9`, `28-F10`, `28-F11`) · cloud **channel** flags (`15-F5`, `28-F6`) — the shipped code already gives the correct **non-billing** reason at `services/storefront/src/entitlement.ts:66-69` (*"which is not a degraded service, it is a different product, published on the open internet under that restaurant's name"*) · the tax add-on **enablement** flag (statutory) · tier gates · `13-F28`'s rung cap · LLM cost metering (our COGS) · **aggregator and card-provider commission — do not touch, that is the restaurant's money going out** · `28-F4`/`F5`/`F7`/`F8`'s entitlement predicate.

**Two clauses nobody quoted and the edit cannot land without:**
- **`specs/15-platform-admin.md:183` (§9.7) opens** *"Self-service signup — CLOSED on its signup half … **The billing half below is UNTOUCHED and still open**"*. "Still open" is what R87 removes.
- **`specs/28-tenancy.md:121` (inside `28-F12`)** — *"**`15 §9.7` is closed on its signup half and stays open on its billing half**"*. The second of the two.
These are the actual edit. Both are recommended to be **promoted to a standing unconditional rule** — *no payment state gates a service* — rather than deleted, because it is what protects `01-F17` from a future retrofit (**D17**).

**Code, comments only, no behaviour:** `services/storefront/src/refusal.ts:41-44` and `entitlement.ts:66` describe a *"COMMERCIAL state"* and a lapsed *"subscription"* that can no longer exist — `L11` in miniature. `packages/domain/src/tenancy.ts:196-197`, `services/sync-gateway/src/schema.ts:375`, `services/api/src/tenancy.ts:36`, `packages/domain/src/permissions.ts:614` all need citation re-points once `15-F5a`/`14-F20` go.
⚠ **Doc-01 coupling:** removing `metering.usage_recorded` from the `01 §4` catalog and removing `06-F22`/`07-F5` **must land in one commit** — `specs/01-kernel-sync.md:320` requires *"every event type appearing in any module doc must appear in this list"*, and `docs:lint` is in both `pnpm verify` and CI (`T6`).

---

**C23 · 🔒 Doc 15 + doc 28 — the platform superadmin (R92).**
**SPEC first (doc 15 needs an action vocabulary), then CODE (auth).** **Size: a new internal-plane vocabulary, a kernel act, a whole unbuilt console.** Blocked on **D2** and **D18**.

**The blocker R92 claims to close is real, confirmed:** `services/sync-gateway/src/user-crud.ts:317` mints, hashes and **discards** a 256-bit secret for every back-office user (`const password_hash = await hashPin(randomBytes(32).toString("base64url"))`, with `:293-303` saying *"a person created here **cannot sign in to the back office**"*); `create-owner.ts:194`'s `orgHasOwner` refuses a second owner; **there is no password-reset, forgot-password or credential-redemption path anywhere in the repo** (five shipped comments name the absence, incl. `services/api/src/router.ts:52`, `apps/backoffice/src/components/auth-gate.tsx:17`, `create-owner.ts:198-200`). **Exactly one human per org can ever hold a back-office login.**

Four mechanisms contradict R92:
1. **`28-F16` (`specs/28-tenancy.md:184`)** forbids both obvious builds **by name** — *"`ROLES` is not extended … and no vendor staff account holds an owner role inside a tenant"* — and routes to `15-F15`'s consent-scoped impersonation, which `28-F19` (`:202`) measures as **unbuildable** (no payload schema, no second identity). Two spec files cite it; **small blast radius, maximum authority.**
2. **`15-F16` (`specs/15-platform-admin.md:73`)** — *"**No consent path = no access; there is no break-glass**"*, and `15 §7` (`:165`) puts *"no impersonation without owner consent"* on the never-configurable list. **R92's headline case — an owner locked out by an email typo — structurally cannot supply consent.**
3. **`15-F26` (`:111`) and `15-F27` (`:119`)** forbid a vendor-chosen password twice, in terms (*"onboarding staff type no password"*, *"A password is never an input"*). R92 says *"create businesses with **a default password**"*. **⚠ And R47/`28-F24` (`specs/28-tenancy.md:158`) ruled six days earlier that the owner sets her own on a single-use token** — R92 does not name R47 in its "Narrows R40, R46" list (**D18**).
4. **`01-F62`** — R92's attribution clause has **no legal carrier** (C10).

**Two more hard bars, both code-level and neither in `01-F71`:**
- **Global email uniqueness.** `services/sync-gateway/src/schema.ts:489-497` — *"Unique **case-folded and globally**, not per org … **One human in two orgs therefore needs two emails**"*, and `28 §9.18` (`:308`) warns a per-org index *"would admit two rows one lookup cannot choose between — breaking `01-F71` (b) to buy the feature."* **This is the strongest argument that the superadmin must live on the internal plane, not as tenant user rows.**
- **`28-F17` (`:190`) declares itself unbuildable:** *"Doc 15 has four **roles** … and **no action vocabulary of any kind** — there is nothing for an internal procedure to name."* **This is the largest owed spec item under R92 and comes before any code.**

**And the transport R92 would ride is anonymous.** Measured today: `services/sync-gateway/src/publish-http.ts` registers **20 distinct `/internal` routes** — `/internal/signup`, `/internal/users`, `/internal/users/pin`, `/internal/users/assignments`, `/internal/users/status`, `/internal/devices*`, `/internal/catalog/publish`, `/internal/config/publish`, `/internal/inventory/*`, `/internal/org-events`, `/internal/ledger/window`, `/internal/tenancy` — all behind **one shared bearer with no role, no action and no per-org scope** (`:526-541`). **The one cross-tenant path that ships already performs nearly R92's entire act set, unattributed.** `28-F18` (`:198`) says "four routes" and `28-F5` (b′) says "eight" — both stale (`L1`), **spec correction owed**.

Two smaller code facts: `PERMISSION_ACTIONS` holds **29** actions today (`packages/domain/src/permissions.ts:167-277`) — `28-F13` (`:133`) says 26, stale — and carries **no action for creating an org or a branch**. `USER_CHANGE_ACTS` is closed at four (`services/api/src/user-directory.ts:124`) with **no `password_reset`**; `11-F23` (`specs/11-staff-people.md:89`) forbids the PIN and password writers being merged.
⚠ **Attribution fails at the rendering layer even if the envelope carries it.** `apps/backoffice/src/components/change-history.tsx:154` prints `record.actor_user_id` **raw**, with no `<Named>` resolution — a superadmin id renders as a bare UUID, which is a live `21-F15` breach (`specs/21-ux-system.md:65`), not a missing-name state.

---

**C24 · Doc 06 — the storefront builder is entirely new scope (R90).**
**SPEC before any task.** **Size: new FRs in a doc that has none; then a whole app.** Blocked on C6.
Confirmed by exhaustive search: the complete extent of per-tenant identity in doc 06 is **three lines** — `:81` (`06-F25`, OpenGraph share preview), `:158` (`storefront_settings` entity, *"brand assets"*), `:179` (layer-2 config, *"brand logo/color/photos"*) — plus one un-FR'd handbook clause at `specs/18-engineering-handbook.md:122`. **None of doc 06's 38 FRs governs layout, sections, page composition, blocks, fonts or any editor**, and `storefront_settings` has **no schema anywhere in code**. R90's own register row says so: *"The storefront builder **has no home anywhere in the corpus** and is a doc `06` amendment before it is a task."*
`apps/storefront/src/index.ts` is two lines of `export {}`. `services/storefront` is real (5,713 lines) but is the **order origin** (`06-F30`..`06-F37`), not a renderer — it emits no HTML.
⚠ **Price R90 against `06-N1` (`specs/06-storefront.md:169`)**: menu LCP < 2.5 s on mid-range Android over 4G, **< 200 KB gzipped for menu + cart**. `plans/storefront/design.md:202` states that budget **is the reason** the theme is CSS variables and not a component library. A section builder with "all major controls" **is** a component library (**D19**).
Also, R88: `services/storefront/src/identity.ts:47` — *"`06-F30`: **one origin per (org, branch)**"* — and `specs/06-storefront.md:101` (`06-F34` (a)) *"The process serves exactly one org."* Ten pilots = ten processes, ten vhosts, ten env blocks. ⚠ **`06-F30`'s per-(org,branch) identity is a KERNEL constraint** (`01-F62` needs a `branch_id`), not a commercial one — the fix is one process holding N origins, **not** collapsing `06-F30`.

---

**C25 · 🔒 Doc 16 + the till — tax rated by tender reaching paper (R91).**
**CODE (tax — protected), plus one SPEC act.** **Size: smaller than every cluster thought. See §4 — four claimed blockers do not exist.**

**What actually ships:** `packages/domain/src/config.ts:286-292` declares `"tax.posture_matrix"` at layer 2 with `by_tender: z.array({ tender: z.enum(PAYMENT_METHODS), cell: TaxCellSchema })` (`:179`) — **`16-F27`'s literal grid** — and `taxCellForTender(matrix, tender)` at `:503`. The `01-F87` config carrier is built end to end (wire `messages.ts:522/662/709/840`, gateway `gateway.ts:549/1363/1551`, device `cloud-session.ts:478` + `config-fetch.ts` + `config.ts`), with acceptance suites in three packages.

**What is owed — three seams, all code:**
1. **`taxCellForTender` has ZERO production callers.** Every reference is a test. Meanwhile the till resolves tax from **environment** via `deviceTaxCell()` at **seven call sites** across `apps/pos-electron/src/main/{tax-posture,printing,settlement-guard,settlement-closer,line-advance,aggregator-settlement,gateway}.ts`. **This is the live `L8` instance on R91's path** and it is one resolver call away.
2. **No tender-channel picker exists on the counter.** `02-F58` (`specs/02-pos-app.md:206`) and `16-F32` (`specs/16-tax-module.md:67`) both put the choice *before the unpaid bill prints*; `02-F58:212` leaves *"the control's position (`27-F4` binds it)"* and *"what a till does when the org has configured **no** rate for a channel a cashier can pick"* undecided (**D20**).
3. **No back-office editor for `tax.posture_matrix`** — that is C21.

**SPEC owed:** `16-F5` (`specs/16-tax-module.md:40`) still reads *"Tax is computed per line ~~at settlement~~"* with an inline note that `16-F32` supersedes the trigger — **two live answers in one FR**, and `02-F58` itself flags the act as owed to doc 16.
⚠ **Two shipped comments are now false on a protected path and must be corrected, not left:** `apps/pos-electron/src/main/tax-posture.ts:22-27` says *"`01-F87` … **That carrier is not built**"* (it is), and `:44-53` argues a tender-dependent cell *"has no fixed point under `exclusive`"* — an argument the FRs have since answered. `L1`/`L11`.

---

**C26 · Doc 27 + doc 21 — per-tenant logo and accent on staff surfaces (R89).**
**SPEC (doc 27 only) + CODE.** **Size: three FR amendments; the code insertion point is genuinely small and that is the hazard.** Blocked on **D21**.

**`21 §2` is NOT in the way and needs no amendment.** `21-F1`/`21-F2`/`21-F3`/`21-F5` (`specs/21-ux-system.md:22-26`) accommodate a `packages/ui` semantic component plus a token-level override as written, and `21-F16` (`:28`) already settled the identical argument for shadcn: *"adopting shadcn was described as breaking this section's closed-vocabulary rule, and **it does not**."* The guards already catch the exact evasions R89 would tempt (`apps/pos-electron/src/renderer/closed-vocabulary.test.ts:97` pins `<img src="logo.png">`; `:113` pins `text-[#ff0000]`).

**The whole break is in doc 27:**
- **`27-F76` (`specs/27-design-language.md:18`)** — *"**layout, position, density, grid dimensions, tile size, tile colour and sort order are not merchant settings**"*. It has **four** carve-outs (a) business config, (b) additive change, (c) customer-facing surfaces, (d) it does not decide §9's open questions. R89's internal half is **none of them** → it needs a **fifth**: identity (logo + one accent) is a merchant setting on staff surfaces; layout, position, density, type and the `27-F14` status set are not.
- **`27-F74` (e) (`:229`)** refuses per-tenant hues **by name, for this exact reason**: *"not chosen per restaurant — an owner names his categories, **he does not pick their colours, because per-tenant hues would put an ungated palette on a paying customer's screen**."* R89's own qualifier — *"when not clashing with our mains"* — is precisely the gate `27-F74` (e) says does not exist per tenant.
- **`27-F78` (`:223`) gives the decisive engineering number:** the shipped four-colour set measures `27-F15`'s worst-pair **ΔE00 21.3 against a floor of 20, with ≈23 the measured joint ceiling** — *"cheap to type, not cheap to prove."* **~1.3 units of headroom, and it must clear the floor against amber, red AND green simultaneously across three dichromacies in both polarities.**
- **`packages/ui/src/tokens/palette-ladder.oracle.test.ts:42` machine-pins the accent to hue 185–250°** (cyan→blue→indigo) in both polarities, with the meaning argument at `:100-109`. **Red, orange, yellow and green brands — most restaurants — cannot be an accent at all**, and three of those four are the allocated status meanings. ⚠ **The oracle and `27-F14` already disagree**: `27-F14`'s August amendment says the slot *"is defined by its MEANING and its exclusivity, and pinning a hue in the budget table conflated the two"*. R89 forces that question.
- **There is no per-tenant theming hook anywhere.** `packages/ui/src/theme.tsx:25-29` `ThemeProviderProps` takes only `polarity`; `useColor` at `:46` is a static lookup; `tokens/index.ts:8,46,56` imports `tokens.json` at build time; `apps/backoffice/src/lib/theme-css.ts:96-104` `themeCss = (): string =>` takes **no arguments**. ⚠ **The insertion point is a few lines** — `themeCss(org)` plus one `--rx-bgColor-interactive` override — **and that is exactly the hazard**: every gate in the two bullets above measures the manifest and would be **silent about a runtime override**. `L8`/`L11`. **The clash detector R89's qualifier requires does not exist and is the piece most likely to be skipped.**
- Blast radius: `27-F76` 5 files, `27-F74` 12, `27-F14` 62.
- The vendor wordmark sites (where a tenant mark lands): `apps/backoffice/src/lib/strings.ts:69` + 14 sentences; `auth-gate.tsx:77-81` (*"the one place in the app where identity, not data, is the payload"*) and `:266`. Note `theme-css.ts:74-77` already records *"**The set is FOUR and a dense back office needs six** … no **display style for a wordmark**"*, and `21-F15`'s naming law (`specs/21-ux-system.md:65`, 47 citing files, shipped at `apps/backoffice/src/lib/names.tsx`) is the existing identity slot a tenant mark sits beside.

---

**C27 · Docs 10, 17, 02/05 — the inventory and CRM surfaces R86 puts in the launch set.**
**BOTH.** **Size: two modules with correct arithmetic and zero surfaces.** Blocked on C14 (`01-F75` members) and C21 (the back office).

- **Inventory: correct arithmetic behind zero surfaces.** `packages/inventory` is 2,968 production lines; `services/api/src/inventory.ts` exposes two procedures; **`grep -arn "saveReference" apps/` returns zero.** The product says so in shipped prose at `services/api/src/summary.ts:595-597`: *"**there is no receiving, wastage or count surface on any shipped device, and no inventory reference data by which an item could even be named**."* `stock.*` has schemas, folds and permission rows with **no producer**.
- ⚠ **And inventory's DEVICE surfaces are spec'd nowhere.** `specs/10-inventory-supply.md:10` delegates them — *"docs 02/05 host the count, invoice, wastage, production surfaces"* — and **`specs/02` and `specs/05` contain zero count/wastage/invoice FRs** (measured). The back-office half **does** exist (`14-F9`, `14-F10` at `specs/14-backoffice.md:82`/`:85`); the device half does not.
- **CRM: the customer half ships, the loyalty half is a counter that cannot be decremented.** `loyalty.reward_redeemed` has a schema (`registry.ts:1268`), a fold arm (`folds/customer-orders.ts:250`) and a merge rule (`folds/merge.ts:700`) — and **zero production emitters**. The till renders it on the glass: `apps/pos-electron/src/renderer/Counter.tsx:1983` *"Reward threshold passed — **this till cannot record a redemption yet**"*. ⚠ `__acceptance__/loyalty-seam.test.ts:877` (§H) is a **live tripwire that fails the moment a producer lands** — update it in the same change.
- **`specs/17:3` declares itself unbuildable**: *"**Wave 4; requires docs 06 (storefront) and 07 (WhatsApp) live**"*, restated at authority position 1 (`restaurant-os.md:83`). R86 puts CRM in and leaves 06/07 out (**D16**). `17-F4`'s broadcast half carries the parked four-`campaign.*`-type withdrawal (`specs/17:170`) and has **zero** src citations.
- **The waiter pad's own guide says it cannot reach a pilot**: `apps/waiter/CLAUDE.md:36-50` — blocked on `04-F22` (a), a founder call on certificate trust (**D11**).
- **`02-F62`'s counter-side cancel has no producer.** `order.cancelled`'s only producer is `services/storefront/src/origin.ts:269`, a cloud surface; `plans/v0.md:56` still parks it as v1; `mvp-plan.md:726` claims *"No payload schema at all"*, refuted by `registry.ts:296`.

---

**C28 · Doc 22, doc 18, doc 29 charter — deployment (R88).**
**SPEC.** **Size: two FR sites and a charter row.**
- **`22-F11` (`specs/22-operations-recovery.md:36`)** pins the primary region to *"Singapore or a Middle East region"* and mandates *"backups replicated cross-region"* plus an annual alternate-region restore drill under `22-F8`. R88 pins **Hetzner**, and R42 refuses infrastructure projects. **"Hetzner" appears exactly once in the whole repo** — `plan-of-record.md:147` (**D22**).
- **`22-F24` (`:95-100`) is the strongest R88-**aligned** FR in the corpus and no cluster reported it** — *"THE RECOVERY MECHANISM IS A WHOLE-DATABASE RESTORE … **(c) ⚠ THERE IS NO PER-TENANT RECOVERY**. A restore moves **every** tenant on the deployment to point T."* The corpus has already ratified the pooled model R88 mandates; this is the cost R88 makes permanent.
- **`specs/18-engineering-handbook.md:202`** — *"Storefront hosting: same Node platform vs edge deployment — decide at Wave 2."* R88 answers it; **close it** rather than leave a shape question open against a ruling that fixed the shape.
- **`plan-of-record.md:194`** doc-29 charter sells *"**cost per tenant**"* — cheap to fix now, expensive once doc 29 is written.
- **The only real R88 code exposure is `services/api`** (`services/api/src/server.ts:280-285`, `:499`, `:513`, `:563` — `BOOTSTRAP_ORG_ID` + `ENABLED_BRANCHES` per process) **and `services/storefront`** (C24). `28-F20` (`specs/28-tenancy.md:209`) is the fix and needs no spec change — ⚠ except that **its own text is stale on `apps/backoffice`, which no longer resolves a per-process org** (§4). ⚠ `28-F20:211` warns the check must be **moved, not dropped**.

---

**C29 · `conformance/` — the release-gate artifacts nobody searched.**
**BOTH (config + gate).** **Size: ~20 rows.** Blocked on C11.
`conformance/wave-0-scope.yml:26-29` binds `01-F12`, `01-F13`, `01-F14`, `01-F15` into Wave-0 scope by id, and `:61` binds `01-F43` to `T-01-17` with the note *"hub is the time authority"*. `conformance/01.yml` carries roughly **twenty** rows binding named acceptance tests to `01-F13`/`DEC-SYNC-009` (`:18, :29, :30, :46, :81, :90, :160, :266, :267, :271-274, :279, :284, :301, :305-308, :332, :380`).
⚠ **This was structurally invisible to six of the seven clusters** because their code sweeps filtered on **filenames** (`grep -aiE "mesh|hub|lan-"` over `git ls-files`). A file whose *contents* assert the mesh but whose *name* does not could not be found that way. `L5`/`L6` — record it as a search-method lesson, not just a miss.

---

**C30 · The glossary R93 asks for.**
**SPEC.** Owning doc: `00` (it is cross-cutting — docs 01, 02, 03, 04, 05, 14, 28 all use the word). **Size: a new section; per `00 §8` it is an addition, not a renumber.**
Measured: **216 word-boundary hits for "till" across 17 spec documents**, and no glossary/terminology heading anywhere in `specs/`. The nearest thing to a definition is `packages/domain/src/device-classes.ts:3-30`'s `DEVICE_CLASSES`, which never uses the word.
⚠ **A definition of "till" that does not also disambiguate "terminal" leaves the worse ambiguity in place.** Doc 02 uses *terminal* to mean a counter till (`02-F11` *"Multi-terminal coherence"*); doc 04 uses it to mean the waiter pad, a renderer with no identity (`04-F21` *"THE PAD IS A TERMINAL OF THE TILL"*).
R93 names *station* as the first undefined term; `03-F50` puts `station` on the catalog entry and `AGENTS.md §7` records *"`DEFAULT_STATION`'s value is pinned, not specified"*. Other candidates found while searching: **counter**, **pad**, **drawer**, and `01-F25`'s **branch / prep_kitchen / storage** (typed, never defined).

---

**C31 · "Order number" is referenced by four FRs, defined by none, and produced by nothing.**
**SPEC then CODE.** Owning doc: `02`. **Size: one FR plus a merge rule.** Blocked on C18/C30.
References: `02-F10` (`specs/02-pos-app.md:38`), `02-F15` (`:50`), `03-F13` (`specs/03-kitchen-fulfillment.md:57`), and `03:29`. **`grep -arn "order_number\|orderNumber" packages apps services specs` → one hit, in a banned-string list.**
With one till an unspecified per-device counter was adequate. **With four tills any per-device sequence collides on the same day: two customers hold receipts reading "#14" and the pass screen shows two cards labelled "#14".** ⚠ A naive branch-wide counter is exactly the ordering-metadata read standing law 1 forbids; a per-till prefix is the obvious answer and is a **ruling, not a keyboard choice** (**D23**).

---

**C32 · Device-side pairing: the claim keypad (R93).**
**CODE.** `apps/pos-electron`. **Size: `01-F80` (g)'s UNCOMMISSIONED state plus a keypad.** Blocked on C11 (do not delete `pairing.ts`).
The cloud and back-office halves are **closed** (`01-F80` + `14-F41`, `services/sync-gateway/src/pairing.ts` + `pairing-http.ts`, `apps/backoffice`'s `PairingPanel`). **The device half is not**: `apps/pos-electron` still reads identity from `RESTOS_ORG_ID`/`_BRANCH_ID`/`_DEVICE_ID`/`_DEVICE_TOKEN`, so **today a second till is admitted by shell access on the service host plus four environment variables on the new machine**. `packages/device-config/src/device-identity.ts:11-15` and `:68-69` are the shipped code that owns this — *"**two counter terminals in one branch** were producible only by editing `main/index.ts` and rebuilding"* and *"A second till in the same branch differs in exactly one id."*
⚠ **A single-use expiring redemption mechanism already ships and is the working template** — `services/sync-gateway/src/pairing.ts` implements mint → speak → claim → cancel with `PAIRING_REFUSALS` at `:91-99`, TTL at `:246`, `claimPairing` at `:450`, `cancelPairing` at `:621`. What is missing is one for a **human password** (C23). Do not conclude "no redemption path exists" from a `redeem|redemption` grep (`L6`).

---

**C33 · The honesty strip loses two of its three facts.**
**CODE + spec-adjacent (`00 §5.7`, `27-F14`, `27-F16`).** **Size: one `packages/ui` component, ~12 call sites, and a `layout:check` fixture.** Blocked on C12 and **D24**.
`packages/ui/src/components/ConnectionFacts.tsx:18-21` declares `lan: Fact` and `hub: Fact` with `01-F13` doc comments, and `:7-9` states the premise R82 denies: *"A device can be **LAN-connected, with a healthy hub, and no WAN** — and that is the **normal** operating state of a Pakistani restaurant, not an error."*
Consumers: `StatusStrip.tsx`, `AppShell.tsx` (+ stories), `apps/pos-electron/src/{shared/ipc.ts:43, renderer/App.tsx:437, renderer/Counter.tsx:2304, main/{mesh,gateway,sync,index}.ts, layout-gate/preload.ts:486}`, `apps/pass-kds/src/{shared/ipc.ts:129, renderer/App.tsx:209, main/{index,mesh}.ts, layout-gate/preload.ts:180}`, **`apps/waiter/src/Pad.tsx`** and `apps/pos-electron/src/main/terminal-server.ts`.
⚠ **The layout-gate preloads are `L9`'s rail fixtures.** Changing the chip set changes what `pnpm layout:check` measures — **the fixture must move with the component or the rail silently stops covering the strip.** (`L9`: *"Its fixture is the real coverage boundary, not its assertions."*)
Also `apps/pos-electron/src/main/index.ts:1185-1188` and `packages/device-config/src/lan-mesh.ts:170` — the boot line naming the hub port and peers.

---

**C34 · Shipped in-repo docs asserting the deleted architecture.**
**CODE (docs).** **Size: mechanical.** Blocked on C12.
`packages/sync-client/README.md` (`:4, :16, :60-72, :86-87, :169-174, :237-264, :315, :327-329`) · `packages/sync-client/CLAUDE.md:5,7` · `packages/sync-client/HUB-ELECTION.md` (all 12 lines) · `packages/sync-client/FOLDS.md:11,12,14,15` · `packages/sync-protocol/PROTOCOL.md` (`:3, :7-11, :24, :28`) · `packages/sync-protocol/README.md` · `services/sync-gateway/{README.md, CLAUDE.md:104,114}` · `apps/pos-electron/CLAUDE.md:5,983-984,1125,1736,1906,2153` · `apps/pass-kds/CLAUDE.md:71-80` · `packages/lan-pki/CLAUDE.md:36`.
⚠ **`packages/device-config/CLAUDE.md` is NOT on this list** — it is 11 lines and asserts nothing (§4).

---

## 2. PROTECTED-PATH INDEX

Every item below requires an adversarial review **in a separate agent context** before code lands (commandment 10; `20 §4.4` is the binding text, and read what it says is knowingly weaker than a human senior before treating a SHIP verdict as clearance). Hand the reviewer the FR ids and the diff, never your reasoning.

| item | path | why |
|---|---|---|
| C8, C9 | `packages/sync-protocol`, `packages/sync-client` | the wire + the clock; standing law 2 |
| C10, C15, C23 | auth (`packages/domain/src/permissions.ts`, `services/api` gating, `services/sync-gateway/src/auth.ts`) | the permission matrix and the credential |
| C11, C12, C13, C14 | `packages/domain`, `packages/sync-client`, `packages/sync-protocol` | kernel catalog, envelope, folds |
| C18 | `packages/sync-client/src/folds/shift-cash.ts` | money arithmetic under R66's Tier-A |
| C20 | `packages/escpos` | the printed document |
| C25 | tax (`packages/domain/src/tax.ts`, `apps/pos-electron/src/main/tax-posture.ts`) | tax, and the cluster already has a live uncarried-ruling defect (`AGENTS.md §7`) |

⚠ **R66 tiers this by PATH** — one agent per gap, tests alongside the code, the full gate only where a defect is permanent and unfixable by a later release. **R66 is carried into no FR**, so `20 §4.3`'s test-authorship separation and `24-F20`'s Tier-A senior lane stand as written until it is: **cite the ruling and stop rather than pick** (`L3`).
⚠ **`T8`**: any mutation test touching a security parameter happens **out of tree**, on a copy in the scratchpad.

---

## 3. BLOCKED ON A FOUNDER DECISION

Ordered by how much work each one gates.

---

**D1 · Where does `branch_created_at` come from with no hub — and is it still called *branch* time?** *(gates C8–C14, C33, C34 — i.e. all of R82)*
Three shapes, priced:
**(a) Cloud-served offset.** The cloud stamps its clock in `hello_ack`; the device holds the offset; `time_basis: "branch"` is redefined as *"measured against the shared authority"*, `TIME_BASES` unchanged. No envelope-schema change — but the marker's **meaning** changes for already-written envelopes, which `01-F1` forbids rewriting.
**(b) A third basis value (`"cloud"`).** Honest provenance; an envelope-schema change on an append-only log, and every `=== "branch"` test must be re-decided (`folds/merge.ts:977`, `folds/shift-cash.ts:261`, `services/api/src/summary.ts:937`).
**(c) Abandon branch-consensus time.** Every duration is cloud-derived; offline durations are the raw device clock and are marked so.
**(a) and (b) both need the `hello_ack` field that does not exist and un-defer `01-N2`.** ⚠ Whichever is chosen, note that **today every event on every shipped till is already `branch_provisional`** (C8) — this is a repair, not only a migration.

**D2 · Two offline devices in one branch share no clock authority at all. What does the product promise there?** *(gates C8, C16)*
R82 concedes it (*"cross-device ageing and durations may disagree during an outage … a change to standing law 2"*). Does the KDS **render an age it cannot trust**, or refuse? `apps/pass-kds/src/main/index.ts:470` computes ticket age as `wallClock.now() + offset` minus a `confirm_at` the **till** stamped — an hour of clock drift renders an hour-wrong age with nothing in the model to detect it.

**D3 · `01-F62` — which event type carries a cloud-plane act, and does it join the org-scoped set?** *(gates C10, C19, C23, and the alert half of C16)*
Options: **(i)** revive `audit.impersonation_started/_ended` as **org-scoped** (widening the set from five, plus payload schemas); **(ii)** mint a new `vendor.*` family; **(iii)** ride `config.changed` with `layer: 1` for configure acts and accept that *entering* the org leaves no record. `01-F1` makes the choice permanent. ⚠ `05-F32`/R48 already answered this once for approvals (*console renders only*) and R92 forbids a fourth answer.

**D4 · What replaces `01-F14`'s rolling branch window?** *(gates C11, and doc 22)*
R2 said *"a bounded cache with a durable outbox"*; R82 supersedes R2 **without restating it**, so retention is now unspecified. `specs/22-operations-recovery.md:5` names `01-F14` as doc 22's DR premise (*"Recent branch-originated data therefore has a natural device-side second copy"*), and `01-N3`'s 500 MB budget depends on the answer — as does whether a till can show **another** device's open orders while offline (which R93 makes an everyday question).
⚠ Good news for the pricing: **R82's "durable local outbox" requirement is already structurally satisfied** — `packages/sync-client/src/device-store.ts:390` records *"the outbox is derived — events past the checkpoint"*, drained by `unackedTail`/`unackedCount`. (There is no `event_outbox` table, and `specs/01-kernel-sync.md:324` still lists one — pre-existing drift that lands inside this edit anyway.)

**D5 · Is doc 19's build-vs-buy decision re-opened, or re-confirmed on different grounds?** *(gates C11)*
R3 — *"Branch LAN sync device↔device with WAN down, sub-second"* — is flagged **make-or-break** at `specs/19-sync-engine-decision.md:15` and is why six candidates were rejected (PowerSync was *"best hub-and-spoke fit otherwise"*). Is `packages/sync-client` still a build, on R6 (auditable wire + hash-chained ledger) and R5 (self-hosted) alone? **A "yes" should be written down as a fresh ruling**, because the recorded reason no longer holds.

**D6 · Are R86's six the WHOLE launch set, or six ADDED to it?** *(gates C5, C6, C7, C21, C27)*
R1's first sellable product was counter + kitchen + back office + **control plane** + **billing**; R86 lists six and drops both; R87 retires billing, which resolves half. But **R40 still says self-serve signup "BLOCKS LAUNCH"** and **R45 says "ALL SEVEN SURFACES ON THE NEW LANGUAGE BEFORE ANY RESTAURANT USES IT — counter, KDS, back office, control plane, signup, owner app and manager console."** R45's seven and R86's six overlap in **three**; the union is ten. Related: `restaurant-os.md:120` demands manager alarms, the nightly owner summary and foodpanda quick-entry in Wave 1 — **are those now out?** And `14-F27`'s go-live checklist gates on the owner app, which R86 does not name.

**D7 · What severity is the "KDS not connected" alert — a chip or a band?** *(gates C16, C17, C33)*
`03-F58` (`specs/03-kitchen-fulfillment.md:224-227`) spends three grounds arguing that a comparable live condition (a printer holding a roll) must be an **amber chip on the honesty strip with no control**, not `03-F5`'s S1 band, because *"a stall is a **STATE**, true until the roll is replaced; a band is for an **EVENT** that has already happened once."* A disconnected KDS is likewise a state that ends by itself. But R83 says *"alert"*, and the consequence — food not being cooked — is `27-F11g`'s severity. **Same argument `03-F58` already had; rule it, don't infer it.**

**D8 · Where does branding live, and what carries a bitmap?** *(gates C14, C26, C24)*
`01-F68` deliberately excludes branding and routes it to doc 06; R89 needs it on staff surfaces doc 06 does not own. The natural carrier is `01-F87`'s config resource — **but a logo is a binary and `01-F75`'s `entries[]` is a typed row set**, and there is **no upload/blob/asset path in any service**. Options: a new resource kind carrying a data URI (size-bounded); an object store with a signed URL in the config artifact; or a raster pre-rendered per printer width and a separate asset for glass.
Related: **does the internal logo reach the KOT and the receipt, or only glass?** Glass wants SVG/PNG; thermal wants a 1-bit raster at the head's dot width, **greyscaled at render** (`plans/wave-1/research/print-customisation.md:76-77` recommends taking Shopify's rule wholesale; no FR states it).

**D9 · Is R84's topology a per-BRANCH key, or does it sit above `03-F51`'s per-STATION route?** *(gates C16)*
R84 says *"chosen per branch"*. `03-F51` and `DEC-HW-003` (c) both argue at length that a branch-wide scalar **cannot** express a per-station fact (*"a ladder cannot say 'grill has a screen, tandoor has paper', which `03-F22` states as supported"*). Do (a)/(b)/(c) sit **above** the per-station route as a branch default, or **replace** it? Related: **does R84 retire `03-F51`'s configuration-time refusal, or sit alongside it?**
⚠ **`DEC-HW-003` is still `proposed — founder ruling owed`** (`specs/DECISIONS.md:50`) while `restaurant-os.md:47` has already been amended to it. **R84 is plausibly the ruling `DEC-HW-003` was waiting on** — and its open item (*whether the layer-2 tier key is retained as an override or retired*) is exactly the harm `apps/pos-electron/src/main/index.ts:510` does today (C17).

**D10 · Is a shift bound to a TILL, a CASHIER, or both?** *(gates C18 — nothing in the cash fold may move first)*
R93 says *"a shift, a float and a reconciliation are **per-till**"*; `02-F22`/`02-F23` say *"per cashier"*; `01-F1` makes whichever is written permanent. Three candidates, behaving differently: **(a)** per-till (two cashiers sharing a drawer share a shift, and `02-F41`'s attribution splits inside it); **(b)** per-(till, cashier) (a cashier moving tills opens a second shift and closes two); **(c)** per-cashier with a till stamp (one shift, cash spread over drawers, reconciled per drawer at close). **(b) matches how a drawer is actually counted, and the corpus has no precedent — commandment 2 forbids picking.**
Two sub-questions that change (a)–(c): **is there a MAIN till?** (R93 says *"Till is a part of main counter"*; three things want the designation — the day-close slip, the waiter pads' attachment point, and — pre-R82 — the hub). And **does every till have a drawer, or can two share one?** (`03-F9` kicks the drawer through the receipt printer's RJ11, so a till with no printer has no drawer; a drawerless order-entry station is coherent and changes the answer.)

**D11 · Does R83/R94's cloud-first waiter pad supersede `04-F21`'s till-terminal, or coexist?** *(gates C19, C27, and reopens D3)*
`04-F21` (`specs/04-waiter-app.md:89`) makes the pad *"a terminal of the till"* that *"holds no store, no device identity and no credential"* and posts intents to the till; `apps/waiter/src/main.tsx:25` dials `window.location.origin` — **the till serves it**, so a phone on 4G off the branch wifi cannot reach it at all. R82's founder reasoning names that exact device. Three readings:
**(a) R83 supersedes** — doc 04's `04-F21`..`04-F36` is largely rewritten, and **D3 must be answered first**, because `04-F21` is precisely the corpus's answer to `01-F62`'s *"stamped at append by an originating device"*.
**(b) They coexist** — LAN terminal on premises, cloud path off it. **Two write paths**, which is `04-F27`'s named defect (*"a guard reached from one path and not the other is the defect"*) built in on purpose.
**(c) "Cloud-first" meant "reachable without the branch LAN"** — the pad still posts intents to the till but over the internet, which turns `04-F22` (a)'s unresolved certificate question into a public-DNS problem.
⚠ **Nothing in C19 or C27's waiter half should be edited until this is ruled.** And note the buffer half is **not** in conflict: `04-F24` already *"buffers captured lines in the browser and renders them as visibly unsent"*, which is R83's optimistic buffer. The conflict is the **transport**.

**D12 · Does R90's receipt builder mean Shopify's actual shape — reorder and toggle **vendor-authored blocks** — or a free canvas?** *(gates C20; sizes the work by an order of magnitude)*
The corpus's own market research (`plans/wave-1/research/print-customisation.md:65-68`) records that **Shopify — the named model — ships the former**, and that *"there is no canvas anywhere"* in the thermal market. **The first costs one amended clause of `03-F30`** (order moves from the spec array into the profile) and leaves `03-F32`'s type invariants, `03-F33`'s regions and `03-F34`'s refusals intact. **The second costs `03-F30`, `03-F33`, `03-F36`, `03-F49` and the whole property-testability argument.** ⚠ Nothing else in this cluster matters more.

**D13 · May owner content sit ABOVE the locked head?** *(gates C20)*
R91 puts `[logo]` and `custom text` first; `03-F33`'s ladder puts `HEAD_LOCKED` first and `03-F34` **hard-refuses with an S1 band**. Either the ladder gains a rung above `HEAD_LOCKED`, or the reprint band and receipt details move below the logo. Both are real changes to a refusal path.

**D14 · Which word is the total?** *(gates C20)*
`16-F33` (c) says a settled receipt shows **exactly one** total; R91 prints `Total` *and* `Total payable by customer`. The code ships `Subtotal`/`Total` and the arithmetic already matches. Confirm R91's `Total` is the pre-tax base and rule the two labels. Also: `roundingRow` (`02-F63` (b), R70) prints a fourth row R91 neither blesses nor forbids.

**D15 · Is *"list of items | price | quantity"* a field list or a column order?** *(gates C20)*
If a column order it contradicts `27-F57`, a measured comprehension rule (71% decode → 35% execute) and the reason the KOT's column floor is 42. Related: **does the receipt print an EXTENDED line amount or a unit price?** *"price | quantity"* reads as extended; the shipped line is `2 Chicken Karahi Rs 450 each`. ⚠ The old blocker is gone — `billedLinePaisa` **is** exported (`packages/sync-client/src/folds/merge.ts:415-417`, re-exported at `index.ts:100`, consumed at `order-tax.ts:95`) — so extended amounts cost a formatter, not a protected-path export.

**D16 · Who owns "CRM" as a document, and does doc 17's storefront/WhatsApp dependency give?** *(gates C21, C27)*
There is no CRM spec. Doc 14 mentions neither "customer" nor "campaign"; doc 17 disclaims segmentation; doc 01 owns only the file. **R86 names a launch surface the routing table cannot route to.** Is it a new doc-29-class spec, a doc-14 FR block, or a doc-17 rewrite? And either the launch CRM slice is narrower than doc 17 (customer file + account loyalty + bearer card, no broadcast) or storefront/WhatsApp come forward. R81 already named the **reverse** dependency (storefront needs CRM).

**D17 · Does the standing prohibition survive its own deferral?** *(gates C22)*
`15 §9.7` and `28-F22` say *"no FR makes a payment state gate a service, and none should be written **until the invoicing handoff has an owner**."* R87 retires the condition. Recommend **promoting the prohibition to an unconditional rule** — it is what protects `01-F17` from a future billing retrofit — but that is a rule the founder creates. Related: **does doc 28 keep "& billing" in its charter title, or does billing become genuinely unowned?** (`28 §1` currently says both.) And: **is `07-F19`'s WhatsApp metering, `17-F6`'s send caps and `15-F23`'s LLM/storage rows vendor-cost observability that stays, or metering that goes?** They meter what **Meta and Anthropic bill us** — but their stated destination is `15-F23`'s rollup, whose invoicing hook is being cut, and `13-F30`'s hard cap depends on the LLM row.

**D18 · Does R92 overrule R47/`28-F24`, or reuse it?** *(gates C23)*
R92 says *"create businesses with a default password"* and *"reset an owner's password"*; **R47/`28-F24`/`14-F42` ruled six days earlier that the owner sets her own on a single-use token, not a password**, and R92's "Narrows R40, R46" list does not mention R47. ⚠ **And the ruled token is carried in NO code**: `services/sync-gateway/src/signup.ts:59-68` says so explicitly — *"what ships here is `15-F27`'s minted initial PASSWORD"* — and `:164` returns `initial_secret: owner.initial_password`. So option (a) "mint a fresh `14-F42` token" needs a **redemption surface that does not exist**, while (b) "set a default password" is closer to what already runs. Three readings: **(a)** fresh token — R47 preserved, `15-F26`/`15-F27` preserved, redemption surface owed; **(b)** a real default password — `15-F26`, `15-F27`, `28-F24`, `14-F42` all amended by name and the vendor holds a shared secret in an append-only ledger; **(c)** both, with (b) as break-glass.
Related and inseparable: **tenant plane or internal plane?** Global email uniqueness makes one-email-one-org a hard structural fact (C23), and `15 §8`/`28-F16` put the vendor on a separate auth domain — but building him internal means `28-F17`'s action vocabulary is owed first. **And: is consent retired, narrowed, or preserved?** If narrowed (consent to read business data, none for configuration and recovery), that line has to be drawn in doc 15 and `28-F18` (b) rewritten around it. **And: does the fix apply to the general "second back-office human" problem, or only to the vendor?** Today the owner still cannot give anyone else a login.

**D19 · `06-N1` versus R90.** *(gates C24)*
The storefront's budget is **< 200 KB gzipped for menu + cart, LCP < 2.5 s on mid-range Android over 4G**, and `plans/storefront/design.md:202` states that budget **is the reason** the theme is CSS variables and not a component library. A section/block builder with "all major controls" is a component library in the customer bundle. **Which gives?**

**D20 · Where does the tender-channel picker go, and what happens when the org configured no rate for a channel a cashier can pick?** *(gates C25 — R91 cannot ship without this surface)*
`02-F58:212` names both as undecided, and `27-F4` binds the control's position.

**D21 · The accent: a free hue, or a pre-gated set?** *(gates C26)*
`27-F78` measures ~1.3 ΔE00 of headroom against a ~3-unit ceiling; `palette-ladder.oracle.test.ts:42` pins hue 185–250°. **A free hue means a red-branded restaurant's *Pay* button is the same colour as its *void* control, under deuteranopia, on a 500-lux counter.** A **pre-gated set of N approved accents** — every one already cleared against amber/red/green across three dichromacies in both polarities — delivers R89's *"every restaurant can make the SaaS theirs"* at essentially zero safety cost, and is what `27-F74` (e) already does for category colours. Sub-question: **must the gate run at tenant-admission time?** Today it runs only at test time over a static manifest and would be **silent** about a runtime override.

**D22 · Does `22-F11` get amended to Hetzner, or does R88 read as "current server for pilots, `22-F11` still governs production"?** *(gates C28)*
`22-F11` carries cross-region backup replication and an annual alternate-region restore drill under `22-F8`; R42 refuses infrastructure projects; **`22 §7` forbids weakening backup posture per-org**, so "pilots get less DR" is not available. Related: **does a free pilot count as "the first production org"** for `22-F12`'s residency verification (`28 §9.16`)? With no paying customer ever, that milestone may never arrive by its own definition — while real diners' phone numbers land in a German data centre from pilot day one, un-erasably (R78/`01-F1`).

**D23 · What is an order number, and what makes it unique across four tills?** *(gates C31)*
A per-till prefix (`T2-014`) is the cheap answer and puts a device identity on the customer's receipt and on the KOT. A branch-wide sequence needs a merge rule under `01-F34` that no fold currently has.

**D24 · What are the three honesty-strip facts now?** *(gates C33)*
`LAN` and `Hub` are gone. Candidates: cloud reachability, **outbox depth / oldest-unsynced age**, last-sync age. This is a `packages/ui` closed-vocabulary change (commandment 6) plus a `layout:check` fixture change — **rule it, do not improvise it.**

**D25 · K-8 versus Friday night.** *(gates C7, and arguably everything)*
R85's bar cannot be met without a printer having ever printed. **Is procuring the hardware now the top-priority action, ahead of any of the six?** Related: **do the four open money defects at `plans/v0.md:70-125` block restaurant #1?** Under R43 they were *"fix before a pilot is given a rate or a step"*; under R85 the false-positive `uncovered_addition` stamp and the sub-rupee-step cashier strand are launch blockers, and one needs a **doc-01 spec act on `01-F33`**.

---

## 4. ALREADY COMPLIANT — do not re-investigate

**21 substantive claims were dropped.** Each is listed with what is true instead, so the next session does not spend a day rediscovering it.

**Refuted claims, dropped (numbered):**

1. **"`packages/device-config/CLAUDE.md` asserts the mesh."** It is 11 lines and returns zero `hub|mesh|LAN` hits.
2. **"Five spec files are mesh-clean, including doc 28."** Doc 28 has hits at `:86` and `:94`; the actual zero-hit set is **seven** files: 07, 08, 10, 13, 16, 23, 27.
3. **"`services/api/src/summary.ts:937` is the same value-selection collapse as `merge.ts`."** It is `if (event.time_basis !== "branch") state.provisional.add(event.id);` with its own comment saying *"read for REPORTING only. Nothing below branches on it."* The real consequence is different and still worth noting: every owner's daily summary would show **every** event provisional, permanently.
4. **"Under `03-F51`, every screen-routed branch runs unverified today."** False. With `RESTOS_HARDWARE_TIER=T2` set, `hardware-tier.ts:166-169` gives `source: "configured"` and `station-routing.ts:175` returns `verified: true`. **The truth is worse and is C17's head.**
5. **"The `station-routing` boot line IS the alert R83 asks for, in the wrong place."** On a tier-configured till that string is never emitted at all; `station-routing.ts:265` returns *"every station has a route"* instead. There is **no alert of any kind**.
6. **"`Counter.tsx` hardcodes the counter channel; `02-F28`/`02-F30` have no surface."** ⚠ This is `AGENTS.md:112`'s stale measurement, repeated instead of re-derived. **Verified today:** `Counter.tsx:355-358` offers **four** channels (`counter`, `phone`, `foodpanda`, `whatsapp`); `:1212-1219` explicitly refuses a `?? "counter"` fallback; `aggregator-settlement.ts` implements `02-F30`'s no-settlement step and **is constructed in the shipping app** (`main/index.ts:53`, `:1601`); `customer-phone.ts` implements `02-F27`/`02-F28`. **What is genuinely absent is one clause** — `02-F30`'s restricted item picker, named in-tree at `aggregator-settlement.ts:40`.
7. **"Inventory has no owning surface spec at all."** False. `14-F9` (`specs/14-backoffice.md:82`) and `14-F10` (`:85`) are real recipe FRs and doc 14 §1 names recipes. **True only of CRM.** (The **device** half of inventory genuinely is spec'd nowhere — that is C27, a different and sharper finding.)
8. **"`15-F2` is cited across ~9 plan files."** Three files, 14 lines, and **one** plan file (`audit-findings.md:354`). The surgical-edit caution is still right, on `28:99` and `28:246`.
9. **"`apps/backoffice` resolves a per-process org."** ⚠ **Stale in `28-F20`'s own text.** Verified today: `apps/backoffice/src` contains **zero** production `process.env` references; org comes from the authenticated subject (`components/auth-gate.tsx:269`), and `lib/catalog-types.ts:17-26` records that the env keys were removed in August 2026. **The R88 exposure is `services/api` and `services/storefront`, not three surfaces.** `28-F20:209`'s clause is owed a correction.
10. **"The wire ships two reference resources against a spec that says five."** ⚠ **Verified myself: it ships FOUR** — `catalog`, `staff`, `device_roster`, `config` (`packages/sync-protocol/src/messages.ts:491,492,506,522`). The missing fifth is **`campaign`** (`17-F22`), not `config`.
11. **"`01-F87`'s config carrier is not built."** ⚠ **Verified myself: it ships end to end** — wire (`messages.ts:522/662/709/732/840`), gateway producer (`gateway.ts:549/1363/1551`), device consumer (`cloud-session.ts:478`, `config-fetch.ts`, `config.ts`), acceptance suites in `packages/sync-client`, `services/sync-gateway` and `services/api`. **`apps/pos-electron/src/main/tax-posture.ts:22-27` says otherwise in a shipped comment and is now false** (C25).
12. **"The per-tender tax matrix does not exist in shipped code."** ⚠ **Verified myself: `tax.posture_matrix` with `by_tender` ships at `packages/domain/src/config.ts:286-292`, and `taxCellForTender` at `:503`.** What is missing is a **production caller** and a picker (C25).
13. **"`config.changed` has no payload schema, so the receipt editor is blocked on a kernel act."** ⚠ **Verified myself: `packages/domain/src/registry.ts:522` declares it** (`key`/`layer`/`version`/`before`/`after`, with `layer` a closed `1|2|3` sized for `15-F25`), and `specs/00:186` records the closure. `specs/14:169` and `:322` are stale and are fixed in C21. **No layer-2 screen is kernel-blocked.**
14. **"`billedCellPaisa` is private; a protected-path export is owed."** `billedLinePaisa` is exported at `packages/sync-client/src/folds/merge.ts:415-417`, re-exported at `index.ts:100`, consumed in production at `order-tax.ts:95`.
15. **"Nothing asserts the receipt's block array is monotonic in the region ladder."** `packages/escpos/src/__acceptance__/receipt-document.test.ts:570-587` asserts exactly that for the receipt. **True only for the `kot` and cash specs** — file the narrow version.
16. **"`01-F70` says a device is one per (org, branch)."** `01-F70` is about a device's human name. That phrase belongs to `01-F39`'s `storefront_cloud` clause.
17. **"No test anywhere encodes the pre-R92 rule; R92 lands with no tripwire."** `services/api/src/__acceptance__/owner-export.test.ts:492-497` is a two-tenant assertion quoting `28-F5` (b) — *"There is no tenant-context header, no `?org=` on a tenant API and **no impersonation shortcut through one**"* — and it runs today.
18. **"`05-F28` records the `01-F62` wall as unsolved."** ⚠ **Verified myself: `specs/05-manager-console.md:92` reads "⚠ ANSWERED, and by NONE of the three — `05-F32` (R48)".** The report contradicted itself here and appears to have trusted `AGENTS.md §7`, which is stale, over `specs/`. **The question R92/R94 reopen is genuinely new; the premise "no answer exists in the corpus" is false.**
19. **"`04-F24` refuses on disconnect where R83 buffers optimistically."** `04-F24` (`specs/04-waiter-app.md:108`) already *"buffers captured lines in the browser and renders them as visibly unsent"*. **The conflict is the transport, not the buffer.**
20. **`14-F138`** — an invented id. The text is real, at `specs/14-backoffice.md:138`.
21. **All blast-radius counts quoted by the reports.** They do not reproduce (`01-F74` was off by 13 spec files; `01-F73` by 8; `03-F30` by 1; `16-F27` by 1; several code counts include `apps/pos-electron/out/`, a generated bundle). **Re-derive at the moment of quoting and say how you counted (`L1`).**

**Things a cluster suspected and which are correct as they stand — leave them alone:**

- **`21 §2` and the whole closed vocabulary need no amendment for R89.** `21-F16` already settled the identical argument for shadcn.
- **R91's conditional FBR QR is already correct.** `03-F33` puts `FISCAL_LOCKED` blocks *"not in the `DocumentSpec` at all — injected at render by the certified authority adapter"*, `render.ts:112`/`:177-200` honours the adapter's position, and `16-F34` holds R39's no-fiscalization line. **No production code supplies `fiscal`, which is exactly right.**
- **`03-F5`'s alarm band and `03-F41`'s paper-out hold survive R83/R84 in substance.** Only `03-F58`'s *calibration* is topology-dependent.
- **The pairing model is already multi-till-correct.** No cardinality constraint anywhere; the registry key is `(org_id, device_id)`. Only the **device-side claim surface** is missing (C32). ⚠ And `provision-device.ts:43`'s `on conflict (org_id, device_id)` is a **comment about deleted code**, not live code — cite `schema.ts:409`.
- **`02-F11` multi-terminal coherence is already specified and already assumes several tills;** the `orders` fold is branch-wide and correct for N. A two-till oracle already exists (`packages/sync-client/src/__acceptance__/multi-terminal-coherence.test.ts:216,242`).
- **No shipped code charges, meters, invoices or gates any request on a payment or plan state.** Zero `metering.*` payload schemas; every `rate_bps` in `src/` is tax posture or card-provider commission; `services/api/src/tenancy.ts:36` says the lifecycle status *"gates nothing here"*; `create-org.ts:144` refuses a `--status` flag; `publish-http.ts:161-171` refuses `tier`/`plan`/`channel` **by name** at signup. **R87 costs those files a citation touch and nothing else.**
- **`22-F24` (`specs/22-operations-recovery.md:95`) already ratifies R88's pooled model** — do not "fix" it toward per-tenant recovery.
- **`apps/waiter` is already a browser app** (Vite/React 19, zero Expo) and **`apps/pos-rn` is an inert stub** — R94's "web not local" and "no Android till" halves need no code deletion beyond the workspace itself and the `counter_rn` class (C13).
- **`04-F21`'s browser half is already carried into `18 §6:106-108`** — not an R94 contradiction.
- **`.github/workflows/ci.yml`, `.github/CODEOWNERS`, `.github/pull_request_template.md`** carry no mesh/hub/LAN gate — **no CI rail changes with R82.** (`layout:check` remains deliberately out of CI and red by design — `T6`.)
- **`packages/sync-client/src/transport-rn.ts` ships cloud transport only** — there is no RN mesh to delete. ⚠ Its **header comment** at `:19-20` does carry a mesh premise and needs correcting (C12).
- **`26 §8`'s `:127` open hazard — *"hub-as-business-emitter has no failure story and no owner (`01-F13` can elect a **kitchen** tablet as the authority for table states)"* — is CLOSED for free by R82.** Record it as resolved, not deleted.
- **`01-F77`'s standing `00 §5.1` breach** (*"a WAN-less device behind a relaying hub receives no artifact at all"*) is **closed by R82** — every device now holds its own reference channel.
- **`specs/09` (`09-F2`, `09-F21`, `09-N2`), `specs/12:9`, `specs/05:14,20` and `01-F39`'s `storefront_cloud` are already the R82 shape.** Doc 05 in particular is the template — `05:102` already reasons from the mesh's absence. Generalise from these; do not edit them.
- **`specs/21-ux-system.md:33`** already carries half of R94's Android leg; **`specs/05-manager-console.md:125`** already records doc 18's tree and §8 lines as owed under R49. **Do not double-file.**
- **`specs/DECISIONS.md` holds no billing, monetization, take-rate or revenue row** — the silence there is correct.
- **`21 §4`, `27`'s tile rules and `L9`'s layout gate** — ⚠ R96 reaches these and R96 has no cluster (§0). Until it does, `L9`'s gate is explicitly **not** in scope for removal: R96's own row says *"Do not read this as licence to drop `L9`'s layout gate."*

---

## 5. TWO METHOD NOTES FOR WHOEVER PICKS THIS UP

1. **Six of seven clusters swept code by FILENAME** (`git ls-files | grep -aiE "mesh|hub|lan-"`). A file whose *contents* assert a premise but whose *name* does not was structurally invisible — which is how `conformance/*.yml` (C29) and `restaurant-os.md` (C5, at the repo **root**, not in `specs/`) were both missed by the clusters that most needed them. **Search the property, not the name** (`L5`, `L6`).
2. **Three of seven clusters quoted `AGENTS.md` where `specs/` disagreed**, and were wrong all three times (drops 6, 9, 18). `AGENTS.md` says so about itself: *"Nothing here outranks a spec … Every number here is a dated measurement, not a fact."* Several of its §5/§7 lines are fixed in C7 for exactly this reason.