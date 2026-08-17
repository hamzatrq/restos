# RestOS — the SaaS pivot: plan of record

**Status: rulings taken, planning artifacts scoped. August 2026.**
Basis: `reconciliation.md` (the audit) + eight founder rulings recorded in §0.
This document says **what must be planned and in what order**. It is not itself the design or the specs.

---

## §0 — Rulings taken

Sixteen decisions founder-ruled during the reconciliation review, plus **R17–R26 ruled August 2026**
when the founder was asked what an MVP had to reach. ⚠ **R17–R22 were given in conversation and
existed nowhere in this repo for a day**, during which `specs/28` cited one of them to supersede a
shipped FR — caught by an adversarial review, not by a rail, and recorded here because a ruling the
corpus cannot cite is a ruling that cannot be checked. They are the premises every
document below is written against. **A plan that contradicts one of these is wrong, not creative.**

| # | Question | Ruling |
|---|---|---|
| R1 | Launch scope | **Sell the service floor now.** First sellable product = counter + kitchen + back office + control plane + billing. Storefront, WhatsApp, riders, inventory, intelligence follow. The "no MVP, launch the full suite" strategy in `restaurant-os.md` §8 is **overruled**. |
| R2 | Offline shape | **Branch relay, fixed authority.** The counter is the branch authority; tablets connect to it, not each other. Hub election and device↔device merge go. Device becomes a **bounded cache with a durable outbox**, not a full replica. |
| R3 | Client runtime | **Browser renderer + a signed per-branch edge agent.** The agent owns printing transport, the local store, the LAN relay and panel PPI. React Native till is **killed as a plan**. |
| R4 | Field state | **Nothing live.** No migration workstream. Schemas, event payloads and identity may change freely. |
| R5 | Take-rate | **Dropped.** Flat subscription only. No metering build. Reintroducible later — it is additive. |
| R6 | Repo | **Evolve in place.** Keep history, the FR citation graph and the CI rails. Delete by area. |
| R7 | Team | **Solo + AI agents.** Sequenced track with agent-sized tasks; oracle-first test authorship preserved (`24 §3`). |
| R8 | First paying tenant | **6 months.** Design first (~4 weeks), then plumbing. |
| R9 | Honesty strip | **One status area that escalates only when blocking.** Honest and always present (`00 §5.7` holds), but it stops dominating the panel and stops speaking developer. |
| R10 | UI language | **English-only stands.** The new Order screen carries the low-literacy load through images, categories, colour and search rather than translated chrome. Urdu item names already render as user content. Reversible later. |
| R11 | Hosting region | **Deferred — lowest priority.** Stay on the current server; revisit when there are real customers. See the carve-out below. |
| R12 | Brand | **Invent it.** No name, logo or palette exists beyond "RestOS". D1 proposes a full identity. **RestOS stays as the internal name**; rename before paid launch, not now. |
| R13 | Order-grid overflow | **Density fits the category; overflow SCROLLS** (overruling lateral paging). The all-items view renders under fixed category section headers and scrolls. `27-F2`, `27-F72`. |
| R14 | Menu photography | **Optional per item, three coverage states, mixing PERMITTED within a category.** `27-F70`. |
| R15 | Build order | **Counter first, built for real** — `packages/ui` rebuilt **in place**, tests **ported suite by suite** as each component lands, coverage never dropping. KDS, then control plane / signup / back office. |
| R16 | Theme | **Light only on every surface**, KDS dark opt-in deferred (`27-F19`). Tokens stay structurally two-polarity — `27-F67`'s training inversion requires it — so dark is later a values change, never a rewrite. |
| R17 | Pilot scale & onboarding | **5–10 free pilot restaurants on ONE pooled deployment, with SELF-SERVE signup.** ⚠ This **overrules** two earlier positions and they are named so nobody re-derives them: §0's own consequence list said *"vendor-operated onboarding rather than self-serve signup (R1)"*, and `reconciliation.md` FORK 4 recommended *"no self-service signup in v1; build the vendor console"* at high confidence. Both are superseded. The reason is that at 5–10 tenants the founder is otherwise the onboarding process for each one, which is the thing that made the original deviation invisible. `28-F12` implements this and `15-F26` is amended by name. |
| R18 | Commercial model, staged | **Billing is DEFERRED — pilots are free.** Metering, invoicing, payment collection and tiers are out of scope for the pilot. The **shape** billing will later attach to (a plan, an entitlement record, a subscription state) is IN scope, because retrofitting it into a live multi-tenant deployment is the failure this whole pivot exists to avoid repeating. `28-F6` owns the shape; §9 of doc 28 keeps every commercial number open. |
| R19 | Design scope before pilots | **All seven surfaces on the new design language before any restaurant uses it** — counter, KDS, back office, control plane, signup, **owner app and manager console**. The last two are two-line stubs today, so they are designed and built from nothing rather than restyled. This is the largest single addition to the critical path (~6–8 weeks over the five-surface option) and was chosen deliberately over shipping pilots on the UI the founder has already rejected. |
| R20 | Where the design work lives | **Build the screens runtime-agnostically in `packages/ui`, and move the host later.** `packages/ui` is plain React and host-independent, so R3's browser+edge-agent move changes the host process and the IPC boundary, not the screens. Pilots therefore run on the Electron shell without gating on a runtime rewrite, and almost none of the design work is done twice. R3 is **not** withdrawn; it is sequenced after the pilots. |
| R21 | What pilot data IS | **Real business records.** Pilots close their day on this and trust the numbers. Consequences that are therefore hard blockers rather than deferrable, each named: staff identity distributed over the wire (`01-F28` — attribution is permanent and unfixable under `01-F1`, so every day sold under the dev roster is a day of ledger nobody can correct); the corrective acts (`void`/`comp`/`discount`/`refund` producers, which have schemas, permissions and folds and **no emitter**); per-tenant backup and export (doc 22); and eventually doc 16. |
| R22 | Manager surface | **A BROWSER console with push notifications**, superseding `05-F29`'s Expo React Native device app. ⚠ `05-F29` rejected the browser on a MEASURED kernel reason — only a process holding a `01-F26` PIN session can legally stamp `approval.granted`'s envelope (`01-F62`), and `gateway.ts` stamped `actor_user_id` unconditionally from the live session, so a till recording a remote grant would name the **cashier**. **That reason has since dissolved**: `apps/pos-electron/src/main/authorize.ts:522/568` now accepts an explicitly verified approver and `index.ts:1199` wires it, and `verifyApprover` deliberately does not move the session. So this is delivered by `05-F28`'s resolution **(c)** — the console DECIDES and the requesting POS RECORDS — which needs one new `packages/sync-protocol` message kind and **no amendment to `01-F62` or `02-F41`**. Rendering alarms and pushing notifications needed no ruling at all: `05-F29`'s own graft clause already permits a cloud-plane console to render `05-F1`..`05-F4` from a `01-F7` read model. What stays forbidden is the browser ACKNOWLEDGING an alarm, because `05-F2`'s acknowledgment is `audit.*` and `01-F62` names that as its worked example of a branch-scoped type. **Owed:** the `05-F29` amendment, and the fact that nothing yet emits `approval.requested` under any resolution. |
| R23 | Device PIN credential | **The cloud stores an Argon2id PIN hash and the roster carries it to devices.** `01-F28` requires offline verification against *synced* credential hashes, so a device must hold them and something must be the source; any answer that keeps PINs device-local makes a cashier's PIN work on one till, loses it on re-pairing, and defeats `14-F14`'s manager reset. **The cost is accepted explicitly rather than discovered:** an unrevoked device holds the hashes of every person in its delivery scope (narrowed by R25). It is a HASH and never a PIN, `01-F61`'s Argon2id cost floor governs it, and it stays in main — both shipped apps already map rather than forward the roster so `pin_hash` never crosses the IPC plane, and that property is now load-bearing rather than incidental. |
| R24 | Reference-data wire | **Generalise to a RESOURCE-DISCRIMINATED frame.** One request/response/notice triple carrying which resource it is, replacing the catalog-specific trio — not three new `staff_*` kinds. This is a **breaking wire-contract change** (`20 §2.7`): three committed fixtures and an N−1 reader per `00 §6`. Chosen against the cheaper option because the corpus already says this is how it works and the code already disagrees three times over: `01 §8` says reference-data distribution reuses one replication path *"not two"*, and today the catalog has bespoke frames while `staff.ts` and `lan-roster.ts` have **no wire at all** — two shipped comments claiming a shared chain that does not exist. Adding `staff_*` would make it 17 kinds now and 20 when `01-F74`'s device roster lands. |
| R25 | Roster scope | **Branch-scoped — a till receives its own branch's people.** Smaller credential blast radius, which is the half of R23's cost that can be bought down. ⚠ **It buys that at a known price and the price must be paid in the design, not discovered in the field:** `01-F60` records that a branch-scoped artifact means one version number meaning **different bytes on different devices**, which is exactly why the catalog is org-scoped. The generalised frame (R24) must therefore carry scope explicitly, so two devices at version 7 are never silently holding different rosters. |
| R26 | Departed staff | **A let-go cashier's name still renders on last month's orders.** Follows `11-F20` (*"a person record is never deleted"*), `14-F14` (deactivation preserves historical attribution) and the catalog's answer to the identical question (`01-F55` tombstones, so a reprint still names a deleted item). ⚠ **This makes the SHIPPED device behaviour wrong:** `packages/sync-client/src/staff.ts` removes the row outright and a snapshot `clearAll`s, so a departed cashier's past orders degrade to a raw UUID. The wire needs a STATUS rather than a `removals` list, and the two facts must be separate fields — *may she unlock* and *does she render* are different questions, and `01-F42`/`01-F48`'s fail-closed reasoning applies only to the first. Protected path. |

**Consequences that follow automatically and are not separate decisions:** pooled multi-tenancy
(R1+R5 economics); ~~vendor-operated onboarding rather than self-serve signup (R1)~~ **— OVERRULED
by R17, which is the whole point of recording consequences separately from decisions: this one was
derived, not ruled, and it was reversed without anyone noticing until an adversarial review of
`specs/28` found a shipped FR superseded on the strength of a ruling the repo did not contain**;
no RN workspace (R3), ⚠ **and R22 does not reopen it — a browser console is not an RN workspace**; `apps/pos-rn`, `apps/waiter`, `apps/rider`, `apps/storefront`, `services/foodpanda`,
`services/whatsapp`, `services/intelligence` stay stubs until their wave (R1).

---

## §1 — Before anything else, this week

**S0 · LAN peer authentication.** `mesh-session.ts`'s `hello` arm admits a peer after checking
only revocation — the code says *"arm inspects no token"* — and both Electron hosts fall back to
the literal token `"lan-member-unauthenticated"`. Any device on the shop Wi-Fi can read and write
the branch money ledger. It is live in two shipping apps today.

Do **not** wait for R2's relay work. Under the relay the fix gets simpler, but "simpler later" is
not a reason to leave an unauthenticated write path on a money ledger for four months.

---

## §2 — What must be planned

Three groups. Group A is documents, Group B is design, Group C is build. **A gates B gates C**,
except where noted.

### Group A — the corpus

**Rule: extend, split, amend — never renumber.** 19,803 FR citations across 601 of 660 source
files, zero dangling. Renumbering destroys every anchor and buys nothing.

#### A1 · Written fresh — 2 documents

| Doc | Owns | Why it must exist |
|---|---|---|
| **`28 — Tenancy, entitlement & billing`** | Tenant isolation as a *tested property*; entitlement resolution as data not env; plan shape; subscription lifecycle; invoicing and collection; suspension semantics; the onboarding pipeline as a flow rather than a human runbook. | The document whose absence let every module answer these questions locally. **Sits at authority position 2b, above the module specs** — that is precisely where the gap was. |
| **`29 — Deployment, the cloud plane & the edge agent`** | Environments and regions; the image/build contract; migration and rollout across N tenants; observability and SLOs; incident response; cost per tenant; the signed agent's install, update and health contract. | `18 §13` gives this four lines and `18 §16` defers hosting to "Wave 2". There is no containerization artifact in the repo. |

#### A2 · Rewritten in place — 2 documents

| Doc | What changes | What survives untouched |
|---|---|---|
| **`27 — Design language`** | §3 colour, §4 typography/numerals, §5 icons, §6 tokens — all replaced, rebuilt on Tailwind v4 + shadcn + `lucide-react`. §1's *flat, paged, positional* law is **repealed** (scrolling, grouping and search permitted). The no-images rule is **repealed**. | **§1a reference hardware, §2 touch/density/latency ergonomics, §2a/§2b paper and thermal.** These are physics and field evidence, not aesthetics, and they are the one part of the old design system that was right. |
| **`21 — UX system`** | Commandment 6 rewritten. "Closed vocabulary, no raw primitives" becomes **"shadcn/Radix primitives beneath a RestOS component layer; no unthemed primitives and no values off the scale in app code."** The `tokens:check` rail is reworked to enforce the new rule, not deleted. | Per-role design laws; the real-staff testing protocol; numeric UX budgets. |

> **shadcn is already allowlisted.** `18 §14` lists shadcn/ui + `radix-ui` + Tailwind v4 +
> `lucide-react`, and `18:120` already specifies shadcn for internal tools. No `§15` dependency
> event is required. What changes is its **scope** — from "internal tools" to every surface — and
> `packages/ui`'s role. The POS was built bespoke against an allowlist that already said otherwise.

#### A3 · Amended, clause-level — 7 documents

- **`restaurant-os.md` Part I** — design **law 5**: keep *LAN-first real-time*, replace *"cloud is
  the exhaust"* with a bidirectional statement (*the cloud is the control plane and the cross-branch
  path; a branch may run without it, a tenant may not exist without it*). Design **law 7**: images
  are now permitted and are the primary aid for staff who read little. **§7**: take-rate removed
  (R5). **§8**: build strategy re-cut for R1.
- **`18 — Engineering handbook`** — client runtime (browser + edge agent, R3); monorepo layout;
  shadcn scope extension; RN fleet removed; the seven verify rails all made to gate CI.
- **`01 — Kernel`** — branch relay replaces hub election (R2); device as bounded cache; **`01-F25`
  pairing code specified for the first time** (format, TTL, rate limit, claim/refusal protocol);
  `01-F14` retention window picks a value.
- **`15 — Platform admin`** — becomes the real control plane spec: provisioning over tRPC rather
  than argv, entitlement gates, impersonation, fleet health.
- **`02` / `03` / `14`** — screen inventories change with Group B.
- **`00 §5.1`** — name the exception the suspension gate creates, or two documents contradict.
- **`20` / `24`** — unchanged in substance; the test-authorship and mutation discipline carries
  forward verbatim. **This is the cheapest high-value thing in the whole plan.**

#### A4 · Superseded or retired

- **`25` (fold performance), `26` (merge semantics)** — largely moot under a fixed branch authority.
  Keep as decision records, marked superseded. **The merge-invariance oracle survives regardless** —
  it is the only instrument that can tell a correct merge from a convergent-and-wrong one.
- **`19` (sync build-vs-buy)** — requirement R3 (device↔device mesh) changes; the *verdict* (build
  custom) survives. Amend the requirement table, keep the decision.
- **`AGENTS.md`** → a **≤2,000-token router** (where truth lives, never what the truth is; CI-banned
  from containing a file path, a date, or a digit followed by "tests") + **`LESSONS.md`** (~14
  transferable lessons, admitted only if true independent of tree state).
- **Deleted:** `SYNC-ORDERING-PROBLEM.md`, `plans/wave-0` (18 files), 11 orphaned wave-1 files.
  **Kept:** `running-the-stack.md` (seed of doc 29), `wave-1-scope-reconciliation.md`.

#### A5 · Rail changes

1. **`docs-lint` C5 counts lines while the requirement specifies tokens** — 13 documents are over
   cap by up to 4.2× and the rail reports clean. This is the mechanical reason the corpus reached
   485k tokens. Fix and mutation-prove it.
2. **A `DEC-*` resolution rail** — 47 decisions have no reference check at all. Move to
   `specs/decisions/DEC-*.md`, one file each, generated index.
3. **No layer-1 or layer-2 setting may be read from `process.env` in shipping code** — a new rail in
   the `seams:check` family. The 24 known `RESTOS_*` violations become its first fixtures.
4. **CI runs three of seven verify rails.** `tokens:check`, `strings:check`, `seams:check` and
   `layout:check` never gate a merge today. All seven must.

### Group B — design *(gates most of Group C; R8 puts it first)*

| # | Deliverable | Notes |
|---|---|---|
| **D1** | Design principles + visual identity | Palette, type pairing, spacing scale, radius, elevation, motion. Delivered as rendered artifacts to react to, not prose. |
| **D2** | Token architecture on Tailwind v4 **+ the touch-scale layer** | ⚠ **The trap:** shadcn defaults are desktop-mouse sized (`h-9`/`h-10` ≈ 36–40 px). The counter minimum is 20 mm of glass ≈ 126 px at counter density. **Adopting shadcn as-shipped regresses the one thing the old system got right.** The mm-of-glass conversion in `physical.tsx` survives and sits *over* shadcn. |
| **D3** | Component inventory | Map the 22 bespoke components onto shadcn + a RestOS layer. Decide per component: adopt, wrap, or keep bespoke (money display and the keypad are likely bespoke). |
| **D4** | Screen designs — counter | Order, Pay, Cash, Orders, Me, Sold out, Unlock, Escalation. **Order screen per the ruling: dense grid, priced, categorised, images, search, and workable by keyboard, mouse and touch alike.** |
| **D5** | Screen designs — other surfaces | Pass/KDS; back office; **control plane console (new)**; **onboarding/provisioning flow (new)**. |
| **D6** | The honesty strip | Diagnostics currently occupy ~13% of every screen in developer language. Redesign so system state is honest without dominating — see §4, this needs your call. |
| **D7** | Design QA rails | `layout:check` retained and extended — it is the only instrument that catches D2's trap. Add a contrast/legibility check; the gate's own docs admit it *"judges nothing about legibility, contrast or typography"*. |

### Group C — build

| # | Workstream | Depends on |
|---|---|---|
| **W1** | Design system implementation — rebuild `packages/ui` on shadcn + the touch layer | D1–D3 |
| **W2** | Client runtime — browser renderer + signed edge agent; the 21-method IPC contract becomes its network contract | R3, D4 |
| **W3** | Sync simplification — relay replaces election; device becomes bounded cache; delete split-brain and device↔device merge arms | R2, A3(`01`) |
| **W4** | Multi-tenancy — per-org enabled set out of env; tenant-scoped data context; Postgres RLS; the `/internal` boundary | A1(`28`) |
| **W5** | Control plane — provisioning as tRPC, `platform-admin` console, **pairing codes**, staff roster over the wire | W4, A3(`01`,`15`), D5 |
| **W6** | Commercial plane — plans, entitlements as a second orthogonal gate, subscription lifecycle, invoicing | A1(`28`), W5 |
| **W7** | Ops — containers, real builds, CI, TLS, observability, backup/DR | A1(`29`) |
| **W8** | Security — **S0 now**; then login hardening, authorization re-validation on ingest | — |

**Entitlement must not be bolted into `PERMISSION_ACTIONS`.** The 25-action matrix is among the
cleanest artifacts in the repo. `entitled(org, capability)` composes *with* `can()` at the choke
points that already exist.

---

## §3 — The 26-week sequence

```
W0    ██ S0 security · rulings recorded
W1-4  ████████ DESIGN (D1-D4) ║ specs 27 + 21 rewritten in parallel
W3-6      ████████ specs 28 + 29 written · A3 amendments · A5 rails
W5-10       ████████████ W1 design system · D5 remaining screens
W7-13         ██████████████ W2 client runtime · W3 sync simplification
W11-18              ████████████████ W4 multi-tenancy · W5 control plane
W16-22                    ████████████ W6 commercial · W7 ops
W20-26                          ████████████ hardening · pilot · K-8 printer pass
```

**Two hard gates.** Nothing in W4–W6 starts before `28` exists — that document is the reason the
deviation happened, and building against its absence again would be the same mistake twice. And
**K-8, the physical printer pass, has never happened**: no printer has ever received a byte from
this code, and the shipped transports are write-only so paper-out currently reads as a printed
ticket. It must land before a paying tenant, not after.

---

## §4 — R11's carve-out, and the one thing still open

**R11 defers the region, not the obligations.** Staying on the current server is a reasonable call
for six months — latency to Lahore is fine, and moving is a config change once there is a reason to
move. But four things on that box are *not* deferred by it, because they are what a paying tenant is
owed regardless of which datacentre they sit in:

- **TLS.** Both services bind `0.0.0.0` in plain HTTP/WS today. A till connecting from a restaurant
  over the public internet sends its device token in clear. This is not a hosting question.
- **Backups that have been restored.** 2 of 22 `specs/22` FRs are built; real RPO is up to 24 h
  against a specified 5 minutes; and the device half has no scheduler at all while the till holds
  the only copy of every unpushed sale.
- **A reproducible deploy.** All seven service `build` scripts are `echo` stubs and production runs
  `tsx` over a git checkout. One immutable image per service, on the same box, is still W7's job —
  it is what makes the eventual move a non-event.
- **Enough observability to know a tenant is broken** before they phone you.

**The tripwire:** revisit region and platform at **the first paying tenant outside your own pilots**,
or the first tenant who asks where their data lives — whichever comes first. `DEC-DATA-002` records
Pakistan's residency posture as unverified and that answer is owed before the question is asked in a
sales conversation, not after. Note also that the lowest-latency major-cloud region to Lahore is
Mumbai, and Indian hosting for Pakistani restaurants' transaction data is a business problem
independent of any engineering merit.

**Still genuinely open — the Sindh Finance Act reading.** One source, OCR'd from an image scan,
self-flagged unverified: liability for non-conforming invoices may fall on *the software supplier*.
Under installed software that was the restaurant's exposure. Under SaaS it is yours, for every
tenant. Worth a Pakistani tax lawyer's hour before a Karachi tenant signs — it is a business-model
input, not an engineering ticket, and `services/tax` is 2 lines today.

---

## §5 — What this plan deliberately does not do

- **Re-plan modules 05, 08, 09, 10, 11, 12, 13, 17.** Out of scope under R1 until their wave.
  Sequence is a founder call.
- **Renumber anything.** See A-rule.
- **Rewrite `20` and `24`.** The testing and harness discipline is the reason the salvageable half
  is salvageable. It carries forward unchanged.
- **Touch `packages/domain`.** 3,183 production lines, 543 tests, three runtime dependencies, and
  almost no coupling to the deviation. It is the crown jewel and this plan leaves it alone.

---

## §6 — The arbitration rule (delegated to the implementer, August 2026)

A measured gate and a design intention fought twice in one sitting, and both times the
measurement was right. The standing rule, so it is not re-litigated per conflict:

1. **A measured gate wins, always, and I adapt without asking.** Contrast ratios, ΔE00 separation,
   millimetres of touch, angular cap-height. **A gate is never weakened to fit a design** — if the
   design cannot pass, the design changes.
2. **I bring you anything whose adaptation is VISIBLE to an owner or a cashier.** Darkening a label
   grey by 4% to clear AA is mine. *Pay* turning from petrol teal to electric blue is yours.
3. **I bring you anything whose fix needs a spec amendment**, because commandment 9 makes a law
   change a founder decision and not an implementer's.
4. **When a gate makes a request impossible, I measure it and show the number before proposing an
   alternative** — never "that cannot be done". The sold-out colour is the worked example: the
   amber→red arc was swept exhaustively, the best achievable was 13.7 against a floor of 20, and
   that number is what made the alternative persuasive rather than merely obedient.
