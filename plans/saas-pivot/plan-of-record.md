# RestOS — the SaaS pivot: plan of record

**Status: R1–R65 ruled, planning artifacts scoped. August 2026.**
Basis: `reconciliation.md` (the audit) plus the rulings in §0. This document says **what must be
planned and in what order**. It is not the design and it is not the specs.

---

## ⚠ OWED — the rulings `specs/` cannot see (measured 2026-08-23)

**A ruling that never reached `specs/` is a ruling an implementer cannot see.** The corpus is what a
routed session reads and it governs until amended, so an uncarried ruling is not merely
undocumented — it is outvoted by the text it overruled. **That has cost three times:** R17–R22
existed nowhere in this repo for a day while `specs/28` cited one of them to supersede a shipped FR;
`05-F29` went on ruling an Expo app for the whole interval between R22 and `05-F31`, and a session
routed there **built one**; and R65 is carried under the wrong id, so an audit by id finds nothing.

**⚠ FIRST — R2 AND R36 CANNOT BOTH BE OBEYED. FOUNDER CALL, NOT AN EDITING PROBLEM.** R2 deletes
hub election, device↔device merge and the full replica; R36 orders `01-F12`..`01-F15` and
hub-as-clock-authority hosted. But `01-F12` **is** device↔device exchange, `01-F13` **is** the
election, `01-F14` **is** the full branch stream on every hub-eligible device, and `01-F43`'s hub
clock needs a hub R2 leaves no room for. Only `01-F15` and `02-F11` survive both readings. This
document contradicts itself downstream of it: §2's **W3** carries R2's programme while §0's R36
orders those same arms hosted — given §0 an implementer builds the mesh, given §2 he deletes it.
**Neither side has reached `specs/`** — R2 has one corpus mention (`01-F72` (f), which explicitly
declines to decide the topology), R36 has none — so the corpus governs, and the corpus says hub
election. **Decide before W3 or any mesh work starts.**

| Ruling | What a session routed to `specs/` gets instead | Owed to |
|---|---|---|
| **R2** Offline shape | `01-F12`/`F13`/`F14`/`F15` unamended: mDNS device↔device exchange, deterministic election with <10 s re-election, full branch stream on every hub-eligible device. A session routed to doc 01 **builds hub election.** | doc 01, after the R2/R36 call |
| **R3** Client runtime | `18 §8` is still titled *"React Native rules (Expo apps)"*; `18 §2` still lists `pos-rn/ # Android counter (Expo)` — the till R3 killed — plus `pass-kds`, `waiter`, `manager`, `rider`, `owner` as Expo; `18 §14` allowlists the RN dependency set; `18 §9.3` still asks whether manager+owner share one Expo project. *"Edge agent"* and *"browser renderer"* appear **nowhere in doc 18**. `01-F13` still ranks `counter_rn` hub-eligible. | doc 18, `01-F13` |
| **R64** Corpus shape law | `23-F3` still reads *"A doc that outgrows this **splits by ownership boundary, gets its own number**…"* — verbatim the alternative the founder **rejected**. A session routed there does the rejected thing. | doc 23 |
| **R1** Launch scope | `restaurant-os.md` §8 is still headed **"Build strategy — no public MVP, strict internal order"**, the strategy R1 overrules *by name* — in the document that outranks every module spec. | `restaurant-os.md` §7–§8 |
| **R5** Take-rate dropped | `restaurant-os.md` §7 still sells *"own-channel take-rate up to 5% … admin-settable"*; `15-F5a`, `15-F6`, `14-F20` carry it; `metering.usage_recorded` is still in the `01 §4` catalog. `28-F22`/`28 §9.13` records the debt — the best-behaved item here. | 4 docs |
| **R49** Owner-app runtime | Carried into `05-F31`, `14-F31`, `05-N6`. **Doc 12 is not:** header still *"React Native (Expo), Android + iOS"*, `12 §8` still *"Expo + EAS builds"*. | doc 12 |
| **R12 / R44** Brand, and the name on screen | No FR owns *invent an identity*, *RestOS is the internal name*, *rename before paid launch*, or *every surface draws it from one declaration*. Survives only as prose in `27-F78`'s provenance note. | doc 27 |
| **R35** Review depth | Uncarried **by design** — the ruling says a spec PR is owed *"if it outlives the wave"*, and the wave is now the project. | `20 §4.4` |
| **R36** LAN mesh in the MVP | Zero corpus mentions, and it contradicts R2 — above. | founder call first |
| **R65** Paid-out threshold = 0 | **Carried in full at `05-F33` — and cited there as *"founder ruling R63"*.** R65's id appears nowhere in `specs/`; auditing R65 by id finds nothing, auditing R63 finds a decision R63 explicitly delegated. One-word fix. | `05-F33` |

**Plan-scoped and correctly absent from `specs/`** (project management, no spec home): R6, R7, R8,
R11, R15/R41, R19/R45, R20, R42, R43.

---

## §0 — Rulings taken

**R1–R65, founder-ruled during the reconciliation review and through August 2026. They are the
premises every document below is written against. A plan that contradicts one of these is wrong,
not creative.** A superseded or amended ruling keeps its id and collapses to a pointer — what it
ruled, what changed it, when, where the reasoning now lives. **The reasoning lives with the ruling
that won.**

| # | Question | Ruling |
|---|---|---|
| R1 | Launch scope | **Sell the service floor now.** First sellable product = counter + kitchen + back office + control plane + billing. Storefront, WhatsApp, riders, inventory, intelligence follow. `restaurant-os.md` §8's "no MVP, launch the full suite" is **overruled** — ⚠ and §8 still says it (owed list). |
| R2 | Offline shape | **Branch relay, fixed authority.** The counter is the branch authority; tablets connect to it, not each other. Hub election and device↔device merge go. The device becomes a **bounded cache with a durable outbox**, not a full replica. ⚠ **Uncarried, and contradicted by R36.** |
| R3 | Client runtime | **Browser renderer + a signed per-branch edge agent**, owning printing transport, the local store, the LAN relay and panel PPI. The React Native till is **killed as a plan**. Not withdrawn — **sequenced after the pilots (R20)**. ⚠ Uncarried; doc 18 still specifies the RN fleet. |
| R4 | Field state | **Nothing live.** No migration workstream; schemas, event payloads and identity may change freely. `01-F77`. |
| R5 | Take-rate | **Dropped.** Flat subscription only, no metering build; reintroducible later — it is additive. `28-F22`; ⚠ residual owed in four docs. |
| R6 | Repo | **Evolve in place.** Keep history, the FR citation graph and the CI rails. Delete by area. |
| R7 | Team | **Solo + AI agents.** Sequenced track, agent-sized tasks; oracle-first test authorship preserved (`24 §3`). |
| R8 | First paying tenant | **6 months.** Design first (~4 weeks), then plumbing. |
| R9 | Honesty strip | **One status area that escalates only when blocking.** Honest and always present (`00 §5.7` holds), but it stops dominating the panel and stops speaking developer. `27-F71`. |
| R10 | UI language | **English-only stands.** The new Order screen carries the low-literacy load through images, categories, colour and search rather than translated chrome; Urdu item names already render as user content. Reversible later. (`00 §5.6` + `21 §5` unchanged.) |
| R11 | Hosting region | **Deferred — lowest priority.** Stay on the current server; revisit when there are real customers. ⚠ Narrowed by §4's carve-out (TLS, restored backups, a reproducible deploy, observability are **not** deferred) and by R42. |
| R12 | Brand | **Invent it.** No name, logo or palette exists beyond "RestOS". D1 proposes a full identity. **RestOS stays as the internal name**; rename before paid launch, not now. Refined by R34: identity invented, interaction patterns borrowed. ⚠ Uncarried. |
| R13 | Order-grid overflow | **Density fits the category; overflow SCROLLS** (overruling lateral paging). The all-items view renders under fixed category section headers and scrolls. `27-F2` (amended), `27-F72`. |
| R14 | Menu photography | **Optional per item, three coverage states, mixing PERMITTED within a category.** `27-F70`. |
| R15 | Build order | **SUPERSEDED IN PRACTICE by R41's two-track split (August 2026).** Its porting discipline — `packages/ui` rebuilt in place, suites ported one at a time, coverage never dropping — survives inside R41 Track B. Reasoning: R41. |
| R16 | Theme | **Light only on every surface**; KDS dark opt-in deferred (`27-F19`). Tokens stay structurally two-polarity — `27-F67`'s training inversion requires it — so dark is later a values change, never a rewrite. |
| R17 | Pilot scale & onboarding | **5–10 free pilot restaurants on ONE pooled deployment, with SELF-SERVE signup.** The reason: at 5–10 tenants the founder is otherwise the onboarding process for each one, which is what made the original deviation invisible. **Overrules two earlier positions by name** so nobody re-derives them: §0's own derived consequence (*"vendor-operated onboarding"*) and `reconciliation.md` FORK 4's *"no self-service signup in v1; build the vendor console"*. `28-F12` implements; `15-F26` amended by name. Narrowed by R46. |
| R18 | Commercial model, staged | **Billing is DEFERRED — pilots are free.** Metering, invoicing, collection and tiers are out of scope. The **shape** billing later attaches to (a plan, an entitlement record, a subscription state) is IN scope, because retrofitting it into a live multi-tenant deployment is the failure this pivot exists to avoid repeating. `28-F6`; `28 §9` keeps every commercial number open. |
| R19 | Design scope before pilots | **REAFFIRMED VERBATIM by R45 (August 2026)**, when the founder was asked directly whether to design-first only the three surfaces that do not exist and chose the whole set. Reasoning: R45. |
| R20 | Where the design work lives | **Build the screens runtime-agnostically in `packages/ui`, move the host later.** `packages/ui` is plain React and host-independent, so R3's move changes the host process and the IPC boundary, not the screens. Pilots therefore run on the Electron shell without gating on a runtime rewrite, and almost none of the design work is done twice. |
| R21 | What pilot data IS | **Real business records.** Pilots close their day on this and trust the numbers, so these are hard blockers rather than deferrable: staff identity over the wire (`01-F28` — attribution is permanent and unfixable under `01-F1`, so every day sold under the dev roster is a day of ledger nobody can correct); the corrective producers (`void`/`comp`/`discount`/`refund` have schemas, permissions and folds and **no emitter**); per-tenant backup and export (doc 22); eventually doc 16. |
| R22 | Manager surface | **AMENDED — split in two, August 2026.** *Runtime half* (a browser console superseding `05-F29`'s Expo RN app) **carried into `05-F31`**. *Approval half* (`05-F28` resolution (c): the console decides, the till records) **SUPERSEDED by R48 → `05-F32`** — approvals stay till-local, the console renders only. Both items R22 listed as owed are closed: the amendment is `05-F31`, and `approval.requested` ships (`approval-record.ts:170`). Reasoning: `05-F31`, `05-F32`, `05-F28`. |
| R23 | Device PIN credential | **The cloud stores an Argon2id PIN hash and the roster carries it to devices.** `01-F28` requires offline verification against *synced* hashes, so something must be the source; keeping PINs device-local makes a cashier's PIN work on one till, lose it on re-pairing, and defeats `14-F14`'s manager reset. ⚠ **Cost accepted explicitly:** an unrevoked device holds the hashes of everyone in its delivery scope (narrowed by R25). It is a HASH and never a PIN, `01-F61`'s cost floor governs it, and it stays in main — both shipped apps map rather than forward the roster so `pin_hash` never crosses the IPC plane, and that property is now load-bearing. `11-F21`. |
| R24 | Reference-data wire | **Generalise to a RESOURCE-DISCRIMINATED frame** — one request/response/notice triple carrying which resource it is, replacing the catalog-specific trio; not three new `staff_*` kinds. A **breaking wire-contract change** (`20 §2.7`): three committed fixtures and an N−1 reader (`00 §6`). Chosen over the cheaper option because `01 §8` already says reference-data distribution reuses one replication path *"not two"* while the catalog has bespoke frames and `staff.ts`/`lan-roster.ts` have **no wire at all** — two shipped comments claiming a chain that does not exist. `staff_*` would make it 17 kinds now, 20 when `01-F74` lands. `01-F75`/`01-F76`/`01-F78`. |
| R25 | Roster scope | **Branch-scoped — a till receives its own branch's people.** Smaller credential blast radius, the half of R23's cost that can be bought down. ⚠ **The price is paid in the design, not discovered in the field:** `01-F60` records that a branch-scoped artifact means one version number meaning **different bytes on different devices**, which is why the catalog is org-scoped. R24's frame must carry scope explicitly, so two devices at version 7 are never silently holding different rosters. |
| R26 | Departed staff | **A let-go cashier's name still renders on last month's orders.** Follows `11-F20` (*"a person record is never deleted"*), `14-F14` and the catalog's answer to the identical question (`01-F55` tombstones). ⚠ **The SHIPPED device behaviour is therefore wrong:** `packages/sync-client/src/staff.ts` removes the row outright and a snapshot `clearAll`s, so her past orders degrade to a raw UUID. The wire needs a STATUS rather than a `removals` list, and the two facts must be separate fields — *may she unlock* and *does she render* are different questions, and `01-F42`/`01-F48`'s fail-closed reasoning applies only to the first. Protected path. `11-F20`/`11-F22`. |
| R27 | Deactivation timing | **A removal takes effect IMMEDIATELY; every other roster change still defers to `01-F46`'s boundary.** `01-F61` defers for a real reason — a grid reordering under a cashier's hand is `27-F4`'s muscle-memory break — but the risk is asymmetric: a dismissed cashier holding a working PIN until 05:00 is a security hole with a face on it. **Her live session ends too**, by necessity rather than as an extra: a deactivation that leaves her signed in is not immediate in the only case that matters (`11 §9.8`). `01-F48`'s 30 s bound is **not** borrowed — that number was written for a device. Closes `01 §9.5`. `01-F79`. |
| R28 | Stale and never-received rosters | **An OLD roster admits, with its age surfaced; a NEVER-RECEIVED roster refuses, loudly, at boot.** `01-F74` (d)'s *stale is not unreadable*, applied to people: refusing because the WAN is down is the `00 §5.1` breach that clause prevents. The second half is the opposite case, not symmetry — a device that has never received a roster has nobody who can sign in, i.e. a **stopped till**, which `00 §5.7` requires to be loud at boot rather than found at 07:00. No staleness bound is set; setting one would eventually stop a disconnected branch selling. Closes `01 §9.6`. |
| R29 | The first PIN | **The owner sets it in the back office and tells her.** Matches how a small restaurant works, and `01-F61` accepts the consequence by name: a 4-digit PIN is *"a convenience credential, not a secret"*, safe because paired with a registered device (`01-F25`/`01-F47`). **Owed and not optional: a change-my-PIN path at the till** (R33), or the owner knows every cashier's PIN for ever and `02-F41`'s attribution means "whoever the owner let in". Closes `14 §9.10`. `14-F42`/`14-F40`. |
| R30 | Till-only staff and email | **A cashier who only uses the till needs NO email; email is required only for back-office access.** Many will not have one, and demanding it makes the owner invent addresses that are wrong for ever in a directory `11-F20` never deletes from. ⚠ **Contradicts shipped schema:** `services/sync-gateway/src/schema.ts:475` declares `email … notNull()` with a unique index on `lower(email)` at `:499`. Email becomes nullable; Postgres permits multiple NULLs in a unique index, so the index survives unchanged. The login path must never assume an email exists — `findByEmail` is the lookup and a till-only person is simply not findable by it, which is correct rather than a gap. Closes `11 §9.6`. |
| R31 | When a change takes effect | **THE 05:00 BOUNDARY STOPS BEING THE SCHEDULER. Every act that changes what a working surface shows asks WHEN — immediate, or at a time the owner picks.** Founder's words: *"every restaurant has different timings and this is a stupid concept … for every action we should ask the user if he wants it to be immediate or scheduled at a specific time."* ⚠ **Three different things wear "05:00" here and this reaches one and a half** (measured 2026-08-18; applying it to all three would break the product in a way nobody asked for). **(a) `01-F46`'s business-day boundary is NOT touched** — a *reporting anchor*, already a configurable cutover hour (layer 2, `00 §7`), and removing it leaves daily totals, shift reports and cash reconciliation with no day to be about (`01-F45`: *"a sale rung at 01:30 belongs to the night it was served"*). The Asia/Karachi **timezone** stays non-configurable — a refusal, not a deferral. **(b) `14-F28`/`14-F36` menu edits already ask, per edit, with an explicit *apply now*** — what they lack is **an arbitrary time**, which this adds: *now · at a time I pick · at the day boundary*. **(c) `01-F61` roster changes is the real target:** bound to the boundary with **no choice at all**, so an owner who hires at 11am cannot put her on the grid until 05:00 tomorrow. It gets (b)'s three-way choice. **NOT schedulable: a DEACTIVATION** — R27 ruled it immediate and this does not reopen it; a fired cashier who keeps selling until a scheduled time is a security hole with a face on it. `01-F87`/`14-F36`. |
| R32 | A deactivated person's PIN credential | **DELETED — the owner sets a new PIN on re-activation.** A departed person's credential does not outlive her employment in the database. Re-activation is therefore two acts (flip the status, set a PIN) and must fail legibly rather than silently when the second is skipped. Answers the case `11-F23` left open; that FR is amended by name. The blast radius was small either way — `11-F21` carries the hash only on an `active` entry — which makes this a cloud-side retention decision, not a device-security one. |
| R33 | The change-my-PIN surface | **BUILT WITH STEP 4**, alongside the back-office user surface, rather than deferred. Closes the debt R29 created: without it the owner knows every cashier's PIN permanently and `02-F41`'s attribution means *"whoever the owner let in"*, which `01-F1` makes uncorrectable — the cost compounds per shift rather than waiting. Owed: an FR in doc 14, a place in `01-F61`'s unlock flow, its own `24 §3` oracle. It cannot be gated on `14-F39`'s `user.manage` (a cashier is `deny` there), so it needs its own FR-decided action or a self-scope arm on `02-F38`'s `requested_by_user_id` precedent, already a named neighbour in `packages/domain/src/permissions.ts`. `14-F40`/`01-F79`. |
| R34 | The design language's SOURCE | **FOLLOW THE INDUSTRY, DO NOT INVENT.** Founder's words: *"Follow the mainstream and global giants in this industry. do not try to create from scratch. steal like an artist."* **Refines R12** rather than overruling it: R12 invents a brand where none exists; R34 takes the interaction patterns and visual conventions from what already works in POS — Toast, Square, Lightspeed, TouchBistro, Loyverse, Foodics. **The reason is stronger than taste:** a POS convention is muscle memory a cashier already has, so copying it is training the product does not have to do — `27-F4`'s argument one level up. Invented: name, palette, mark. Borrowed: layout, affordance, density, flow. ⚠ **Not a licence to copy a competitor's assets** — it licenses their solved problems. `27-F76`. |
| R35 | Review depth | **TIERED BY BLAST RADIUS**, replacing the flat `20 §4.4` bar for this wave. **FULL adversarial rounds** (fresh context, repeat until SHIP): credentials, tenant isolation, money, the wire, the permission matrix. **ONE review**: UI, read paths, config, docs. The evidence is this session's own — two credential leaks, a shadow-assignment PIN resurrection and a publisher race all landed in the first group, while UI rounds returned comment typos beside one real FR break (`21-F15`). ⚠ **`20 §4.4` is not amended by a plan**; a spec PR is owed. |
| R36 | The LAN mesh | **IN the MVP.** A branch may run several devices, so `01-F12`..`01-F15`, `02-F11` and hub-as-clock-authority stop being unexercised. **Wave-0 debt being paid**, not new scope: `restaurant-os.md` puts the mesh in Wave 0 and `mesh-session.ts` has carried `@unreached-owed NO HOST RUNS THE LAN MESH YET` throughout. It also ends the `00 §5.1` breach the pass screen works around. ⚠ **Contradicts R2; uncarried.** |
| R37 | Printing | **BUILD THE PATH, DEFER K-8.** The KOT and receipt paths ship; the physical pass runs when thermal hardware arrives, without a code change. Pilots start printerless — `03-F22`/`03-F51` make that a supported configuration and `03-F5`'s band stays honest — and gain paper mid-flight. ⚠ `27-F35`'s ≥85% comprehension gate on real staff remains untested until then and **no test may imply otherwise**. |
| R38 | Backup and export | **NIGHTLY PER-TENANT BACKUP + A RESTORE THAT HAS ACTUALLY BEEN RUN + OWNER-TRIGGERED EXPORT.** The minimum that makes R21's *"real business records"* honest. Retention windows and erasure are deferred — erasure interacts with an append-only ledger and is a design problem, not a feature. ⚠ **A restore nobody has performed is a backup nobody has**; the acceptance is a restore, not a dump. `22-F23`..`22-F26`. |
| R39 | Tax | **CORRECT TOTALS AND AN ITEMISED TAX LINE; NO FISCALIZATION.** Receipts compute and show tax properly; nothing integrates a revenue authority's device or API and nothing claims certification. Doc 16's fiscalization is post-pilot. `16-F31`/`16-F34`. |
| R40 | Self-serve signup | **BLOCKS LAUNCH**, as R17 ruled. A restaurant signs itself up and reaches an org, a branch, an owner login and a device pairing code with nobody touching a terminal. Also one of R45's seven surfaces, so it is designed either way. Retires `create-org.ts` as the onboarding path (it survives as an operator tool). Narrowed by R46. `28-F23`/`14-F41`/`01-F80`. |
| R41 | Build order (supersedes R15) | **TWO PARALLEL TRACKS.** Track A finishes the staff chain (steps 7, 2b, 8, 9, 10) — device-plane plumbing that survives any restyle. Track B is the design language and the seven surfaces, carrying R15's porting discipline. They collide only in `apps/pos-electron`, and the collision is manageable because A is `packages/sync-client` and B is `packages/ui`. |
| R42 | Hosting | **CURRENT SERVER, NO INFRASTRUCTURE PROJECT.** No managed-Postgres move, no new deploy pipeline. ⚠ **Read against R38 rather than as contradicting it:** R38's backup is PRODUCT work — a per-tenant job on `services/jobs`'s existing BullMQ repeatable, which `20 §4.2`'s Auditor already proved out — not an infrastructure migration. R11 stands. |
| R43 | What "MVP done" means | **YOU CAN DEMO IT END TO END TO A PROSPECTIVE PILOT.** Sets the VERIFICATION bar, not the scope: everything R36/R40/R45 name still gets built; acceptance is a demonstrable end-to-end run rather than a restaurant having survived a Friday night. ⚠ Not licence to ship a demo — `01-F1` makes any real day sold under it permanent, so "demoable" is the gate for calling the MVP done, not for letting a restaurant trade on it. |
| R44 | The name on screen | **"RestOS"**, as R12 ruled. Every surface draws it from one declaration so the rename before paid launch is a token change. ⚠ Uncarried. |
| R45 | Design scope, reaffirmed (supersedes R19) | **ALL SEVEN SURFACES ON THE NEW LANGUAGE BEFORE ANY RESTAURANT USES IT** — counter, KDS, back office, control plane, signup, **owner app and manager console**. Asked directly whether to design-first only the three that do not exist, the founder chose the whole set. The last two are stubs today, so they are built from nothing rather than restyled, and the counter is rebuilt although it works. **The largest single addition to the critical path** (~6–8 weeks over the five-surface option), chosen deliberately over shipping pilots on the UI the founder has already rejected. |
| R46 | Signup admission control | **A VENDOR INVITE CODE.** `28-F15` forbids public signup without a named admission control and declines to pick; this picks. At 5–10 pilots the founder knows every restaurant by name, so a code costs nothing in reach — and it is the only option needing **no outbound-mail capability**, which `28 §9.21` records the corpus does not own and `18 §15` would make a governance event. ⚠ **Not self-serve in R40's full sense:** the founder is still the gate, so R17's *"the founder is otherwise the onboarding process"* is only half addressed — what it removes is the terminal, the SQL and the per-tenant manual provisioning, not the introduction. Every junk org would otherwise be permanent (`01-F68` never reuses an `org_id`) on a deployment shared with real tenants, which is what makes an open door the expensive option. `28-F24`/`14-F42`. |
| R47 | The owner's first credential | **SHE SETS IT DURING SIGNUP, ON A SINGLE-USE TOKEN.** Signup mints the token; she lands on a redemption surface and chooses her own password. ⚠ **A reading of `15-F27`, stated as one:** that FR bans a password as an **input to provisioning** — the vendor typing one on her behalf — not her choosing her own on a redemption surface, which is the shape `15-F26` describes and `28 §9.21` records as unbuilt. No mail is needed: the token is handed over in the session she is already in. **Retires `create-owner.ts:269`'s print-to-stdout as the delivery mechanism** (the command survives as an operator tool). Recovery is NOT decided here and is owed — a locked-out owner has no path anywhere in the corpus (`28-F19`). |
| R48 | Remote approval under R22 | **APPROVALS STAY TILL-LOCAL; THE BROWSER CONSOLE RENDERS ONLY.** `05-F28` calls this the *legitimate smaller thing*. The measurement that decides it: the shipped till approval is PIN-gated (`authorize.ts:568` refuses unless `verifyApprover` passes), so a browser decision arriving with no PIN forces one of two costs R22 did not name — the till appends a grant naming an approver it **never verified** (commandment 8, and an `02-F41` hole on a money path), or the cloud becomes a credential verifier and `28-F7` needs amending. R22 said resolution (c) needs *"no amendment to `01-F62` or `02-F41`"*; true of the ENVELOPE, silent about the CREDENTIAL. ⚠ **Cost:** `00 §1` rows doc 05 at *"1 core"* and this is less — she sees alarms and pending approvals on her phone and walks to the till. **Reopen trigger, named so it is a trigger and not a mood: a pilot manager saying the walk is the problem.** `05-F32`. |
| R49 | The owner app's runtime | **BROWSER. The React Native scaffolding is DELETED.** `apps/owner` becomes a fifth browser surface on the back-office template — measured as genuine shadcn/Radix/Tailwind v4/lucide, i.e. already the target stack. Keeping RN for one surface keeps **the whole toolchain tax**: two TypeScript versions, `apps/manager` outside the root tsconfig program, zero `packages/ui` components for RN (so both RN surfaces breach commandment 6, as `apps/manager` already does in a file whose own header admits it), and EAS builds. **Cost:** no native push, no app-store presence; a PWA covers most of it. `05-F31`/`14-F31`/`05-N6`; ⚠ **doc 12 still reserves `apps/owner` for Expo.** |
| R50 | Fixed or configurable INSTRUMENT | **FIXED.** Tile colour, size, grid dimensions and sort order are not merchant settings. `27-F4` (position), `27-F7` (list order), `27-F72` (density), `27-F74` (hue) all stand. ⚠ **This subsumes most of the design conflicts** — answered per screen instead, the product drifts toward configurable one control at a time, because each individual yes is cheap. **The strongest external corroboration `27-F4` has ever had:** Creative Navy's 2026 benchmark scores **Square — the best-looking and most redesigned — as FAILING conditioning stability**, after a 2025 forced rollout produced documented 2–3 s search delays and moved cash-drawer timing from mid-transaction to end, breaking motor routines; **Toast wins that axis by shipping ADDITIVELY**. So under R34, *follow the mainstream* means **Toast's release discipline, not Square's redesign cadence**. ⚠ **Read with R55/R63: FIXED binds the INSTRUMENT** — layout, position, density, order — **not BUSINESS configuration** (menu, prices, channels, tax rates, thresholds), which is `00 §7` layer 2 and is the owner's. |
| R51 | Which side the cart sits on | **CHECK LEFT, GRID RIGHT** — Toast's and Lightspeed's arrangement, exactly the muscle memory R34 exists to borrow. ⚠ **The shipped counter is the MIRROR** (`Counter.tsx` renders `ItemGrid` first, `Cart` second), so this is a real rebuild — which R45 was doing anyway. `27-F4` makes position a compatibility contract, so it is decided **before** pilots rather than discovered after. The compact-mode amendment already claimed the left edge for the tab rail, so the rail's placement on small glass moves with this. `27-F77`. |
| R52 | `27-F30`'s icon ban | **STAFF-FACING ONLY — the FR is amended.** Ratifies what the code has done for months: `27-F73`/`21-F16` adopt shadcn/Radix, `18 §14` allowlists `lucide-react`, `apps/backoffice` already ships it. The reading: the 42.2%-on-ISO-7010 study measured **987 Pakistani doctors, dentists and paramedics under time pressure on safety symbols**; an owner reading last night's numbers on her phone is a different reader at different stakes. **Five of seven surfaces are owner-facing**, and binding them would put `27-F31` in front of an audience it was never measured on, which the plan costs at weeks. ⚠ `27-F31` still binds every **staff-facing** surface unchanged. |
| R53 | The accent hue | **THE SHIPPED PLACEHOLDERS BECOME THE PALETTE** — `bgColor-interactive #0555FA`, `bgColor-status-confirmed #0FEBB4`. `27-F14`'s August amendment freed the slot and the plan records **no convergence to steal** here, so this was R12's territory rather than R34's. Cost: they were chosen as placeholders and nobody has judged them as the product's identity; changing them later is a token edit, which is why this is cheap to revisit and not worth blocking on. `27-F78`. |
| R54 | Tax and `billed_total` | **TAX IS INSIDE `billed_total`.** One number to reconcile against — the Auditor's conservation equation, the `shift_cash` fold and the receipt's *Total* row all mean the same thing, and it matches how a customer reads a bill. ⚠ **Consequence:** `billed_total` stops being *"the sum of line prices"*, so every reader of it means the new thing and `01-F30`'s definition of billed moves with it. A `packages/domain` spec act on a protected path (commandment 9), and **no tax payload field lands before it.** `01-F82` + the `01-F30` amendment. |
| R55 | The tax matrix | **TAX IS PER CHANNEL, AND THE OWNER CONFIGURES BOTH THE CHANNELS AND THEIR RATES.** Founder's words: *"allow user or restaurant owner to add his channels and tax per channel … some preconfigured that can be turned on or off like cash and card."* Cash, card, QR/RAAST and online transfer are taxed differently in this market, and **some orgs — typically international chains — charge one rate across all, as instructed by government**, which is the same mechanism with equal cells rather than a second mechanism. ⚠ **OVERRULES `16-F4` by name** (*"rates are never free-typed by orgs"*), carried into `16-F27`, which supersedes it in place. It also **retires the fixed payment-method enum**: `cash`/`card`/`online`/`foodpanda` becomes a seed set the owner extends — an `01 §4` payload change on a protected path. ⚠ **Read with R50:** the INSTRUMENT stays fixed; this is business configuration, `00 §7` layer 2. |
| R56 | The correctives' idempotency key | **AMENDED 2026-08-23 — the substance held, the list was wrong. Reasoning now in `01-F83`.** Ruled: every corrective carrying an amount mints an `01-F31`-class attempt key, or a re-delivered corrective double-counts permanently (`01-F1`); deriving it from the envelope was refused under `01-F34`. Corrected by measurement against the payload schemas in `packages/domain/src/registry.ts`: membership is **void · comp · discount · `order.line_price_overridden`** (`payment.refunded` already carries two keys, `01-F29`), the name is **`adjustment_attempt_id`**, and `order.cancelled`/`order.rejected` are excluded as amountless terminal facts. *A ruling's LIST is a measurement; its SUBSTANCE is a decision.* |
| R57 | Which correctives ship | **ALL SIX** — void, comp, discount, refund, plus `order.cancelled` and `order.rejected`. ⚠ **Two carry named costs.** `order.cancelled` had **no payload schema**, so `01-F4` made it unemittable until one was written — a fifth protected schema change in the same wave (`01-F84`, spec-closed, code owed). `order.rejected`'s only consumer is `06-F20`'s storefront, **not in the MVP**, so it ships a producer nothing reads — this wave's most-recorded defect, shipped deliberately, recorded so a later `seams:check` finding on it reads as a decision and not a regression. `02-F61`/`02-F62`. |
| R58 | When the tender channel is chosen | **BEFORE THE UNPAID RECEIPT PRINTS, AND IT IS CHANGEABLE.** Founder's words: *"before printing the unpaid receipt the waiter asks the user the channel … sometimes people change the mode after choosing."* The channel is an INPUT to the bill rather than a settlement-time discovery, which is what keeps R54's tax-inside-total knowable at print time. ⚠ **A receipt may show BOTH totals** — *"some restaurants also write tax for card and cash on same receipt with both total amounts showing so user can choose"* — so the document model must render two totals without either being the ledger's answer. Re-choosing re-computes; `01-F18`'s frozen line price is untouched, because the LINE price never moved — only the tax on it. `02-F57`/`02-F58`/`16-F32`. |
| R59 | Splitting a bill | **THE BILL DIVIDES INTO SUB-BILLS, each with its own channel, its own tax and its own total.** Founder's words: *"if they split the bill you can divide the bill into two, one paid by one channel and one by other. Total price and tax are different."* ⚠ **Not `02-F13`'s split tender** — that is *"split payment across methods in one settlement"*, one bill many tenders, and it cannot express two different tax totals. `02-F13` becomes the one-channel case; an amendment is owed to doc 02. **No seat concept is introduced**, recorded as a refusal rather than an omission: `02-F5`'s split-by-item stands, equal-split is deferred because equal-splitting across differing tax rates needs a rule nobody has written. `01-F86`/`02-F59`/`16-F35`. |
| R60 | Card commission | **THE OWNER SETS A RATE PER PROVIDER, AND THE CARD TERMINAL IS A THIRD-PARTY DEVICE.** Founder's context, which changes the design more than the ruling does: *"we are talking about the POS machines that businesses use to charge cards. In Pakistan banks and other companies provide their machines … a custom android machine with printer in it. Each bank or service have their own commission charges per transaction, and even vendor to vendor the same service provider can give different rates based on volume."* ⚠ **Three consequences.** (i) **No terminal integration** — the cashier keys the amount into the bank's machine and it prints its own slip, so RestOS records what was taken and never drives the device. (ii) The rate is per **(org, provider)** and negotiated: the owner's input, not a vendor rule pack. (iii) Commission is **informational for the owner's net**, never authoritative — the bank's settlement is the truth, and RestOS must not present its computed net as reconciled. `02-F60`/`14-F43`/`01-F87`. |
| R61 | Backup shape | **WHOLE-DB DUMP IS THE RECOVERY MECHANISM; `22-F16`'s OWNER EXPORT IS THE ONLY PER-TENANT ARTIFACT.** The narrower reading and the only one the corpus specifies. ⚠ **Cost:** there is **no per-tenant recovery** — restoring one pilot's mistake means restoring every tenant to that point, which on R17's pooled deployment is every pilot. ⚠ **A per-org logical dump ALREADY SHIPPED** (`73f9314`) because the question was open when it was built; it is retained as the export's implementation, and doc 22 must say the FR requires the export and does not require per-org recovery — so a later reader does not mistake a capability for a guarantee. `22-F22`/`22-F24`. |
| R62 | Go-live for a self-onboarded tenant | **SELF-ATTESTED, AND THE VENDOR CAN SEE ITS STATE.** `14-F27`'s checklist feeds off `15-F10`'s vendor-staffed runbook, so either it does not apply to a self-serve tenant — which nobody had said — or no self-serve pilot could go live, which blocked R40's end state on its own. The owner works it herself; the control plane reads it. Cost: **she can tick a box she did not do**, and `14-F27` exists because a tenant selling without a printer, a device or a menu has a bad first day that `01-F1` makes permanent. `28-F25`. |
| R63 | The discount threshold, and the config plane | **THE OWNER OR OPS LEAD SETS IT — NOT THE VENDOR.** Founder's words: *"this should be a feature for the restaurant owner or ops lead to set not us."* ⚠ **THE REAL CONSEQUENCE IS NOT THE THRESHOLD, IT IS THAT `00 §7` LAYER 2 IS NOW MVP SCOPE.** R55 (channels and their rates), R60 (commission per provider) and this ruling are all *"the owner sets it"*, and measured, the config plane does not exist. So the MVP gains a layer-2 configuration surface, and `PAID_OUT_APPROVAL_THRESHOLD_PAISA` — pinned at Rs 2,000 in `authorize.ts`, *pinned not specified* — moves there rather than staying a constant. `00 §7` (f), `01-F87`, `14-F43`. |
| R64 | The corpus shape law (`23-F3`) | **COMPACT EVERY SPEC RATHER THAN SPLIT THEM.** Founder's words: *"a lot of the docs have alot of garbage text or text that can be written better in less words … without losing any meaningful declaration. instead of going very descriptive we can be precise. with precision we can explain the same thing in very less words."* ⚠ **The measurement behind the question:** `23-F8` specifies the rail as a per-doc **token** count and `scripts/docs-lint.mjs:73` counts **LINES**, a proxy defeated by docs growing through longer lines (doc 01's longest is 5,404 chars). Measured 2026-08-23: **24 of 29 specs exceed the ~4.5k-token cap**; doc 01 is at **~52,853 tokens, 11.7×**, and at 359 of the 360-line cap it **cannot take another FR** — which forced the question, because `01-F81` (e) is owed a ruling that belongs there. ⚠ **The rejected alternative is recorded because it is what `23-F3` literally requires:** splitting 24 docs by ownership boundary, each with a new number, routing table and `00 §1` index. **The risk accepted:** compaction is the highest-risk edit available here, because a dropped refusal or a dropped *WHAT THIS DOES NOT CLOSE* clause silently changes a spec and **no rail can see it** — `docs-lint` resolves FR ids, not meaning. Mitigated by an independent adversarial LOSS AUDIT per doc, not by the compactor's own confidence. ⚠ **PILOT RESULT 2026-08-23 — THE SPEC HALF OF THIS RULING CANNOT BE EXECUTED AS STATED; THE SWEEP IS STOPPED AND ALL THREE PILOTS ARE REVERTED.** Three docs of different character, each independently loss-audited: `28-tenancy` **8.8%**, `03-kitchen-fulfillment` **4.8%**, `27-design-language` **4.8%** — ~5,000 tokens across three of the largest files. **All three audits returned ACCEPT WITH RESTORATIONS: every one introduced a meaning change.** The sharpest was `27-F4`, where moving the *apply now* escape inside its reason clause made *"a grid never moves under a cashier mid-shift"* read as covering apply-now — which is precisely the mechanism that DOES move a grid mid-shift, so an implementer would conclude the opposite of the ruling. `docs-lint` was clean throughout, because it resolves FR ids and not meaning. **So the ruling's own constraint — *without losing any meaningful declaration* — was violated in 3 of 3 attempts, and only an adversarial reader per document caught it.** The compactor's own headline is the finding: *"this document is argument-dense rather than verbose. Nearly every sentence in §3 carries a refusal, a citation that is the evidence for a claim, or a stated reason."* Extrapolated: 29 docs for ~6%, at 29 compact-audit-restore rounds and a standing risk of silently changing the contract. **The retelling half of this ruling stands and is a far better target** — `AGENTS.md` measures **22% correction-retelling** against these docs' ~6% compressible prose. **THE LESSON: the corpus was not the bottleneck. Scope was and process was** — `plans/v0.md` cut v0 from ten items to four, `R66` tiered the pipeline, `R68` moved the rails. Compacting the contract was the expensive way to save the least. **The `23-F3`/`23-F8` divergence is NOT closed here**: whether the rail measures tokens, and against what number, is owed once the compacted size is known — measure first, set the cap second. ⚠ **Uncarried; `23-F3` still requires the rejected alternative.** |
| R65 | `05-F19`'s paid-out threshold default | **ZERO — every paid-out requires approval.** Rs 2,000 is not carried forward. The criterion that makes this a decision rather than an inheritance: Rs 2,000 was **never wrong, it was never CHOSEN** — reverse-read from `05 §4`'s one worked scenario (*"a PKR 4,000 paid-out … above threshold"*), which constrains it only to be **below Rs 4,000**, satisfied by 0 exactly as by 200,000; no FR, flow or appendix names a number. Zero is the only value that states **no tolerance at all** — its unapproved partition is empty — which is `16-F1`'s *"tax is off by default"* generalised rather than analogised: off is the ABSENCE of a rate, not the smallest one. ⚠ **THE COST IS ACCEPTED WITH THE RULING: a branch manager working alone CANNOT RECORD A PAID-OUT.** `canPayOut` derives `satisfied_by` from `approval.grant`'s row (`packages/domain/src/permissions.ts:591` — branch_manager + owner) and `02-F38` refuses self-approval, so she blocks on her own request — strictly larger than the cashier-at-06:00 case `00 §7` (d) blesses, and chosen knowing so. **No commandment-4 breach:** `01-F17` protects the SALE and a paid-out is not a sale — a till whose manager cannot take petty cash is inconvenienced, a till that cannot ring an order is a stopped restaurant. The owner changes it on day one; what ships unconfigured is a drawer no one empties without a second person. `05-F33`; ⚠ **cited there as R63.** |
| R70 | Sub-rupee money on a receipt | **THE CHARGE IS ROUNDED, AND THE GRANULARITY IS THE OWNER'S — RUPEES OR TENS.** Founder's words: *"round to rupees. these days now some restaurants round to 10s and some round to rupees. some restaurants show paisa but the waiter when charging charges in rupees because there is no concept of paisa. even coins are getting rare. but yes when charging cards they charge rupees by rounding off to rupees or tens rupees depending on the restaurant."* ⚠ **Four things this settles that the question did not ask.** (a) The granularity is **configuration, not a constant** — a fourth layer-2 key beside R55's rates, R60's commission and R63's thresholds, defaulting to **1 rupee**. (b) It binds **card as well as cash** — this is not a cash-drawer artifact, so it cannot live in the tender path. (c) *Showing* paisa and *charging* paisa are separable, and the founder separated them: a receipt may print `Rs 450.70` while the amount taken is `Rs 525`. (d) Coins are scarce, so rounding is a **physical** constraint rather than a preference — an implementation that charges Rs 525.07 is asking for a coin that does not exist. **Why this arose now:** tax is the first thing this product has ever produced that puts paisa in a total (`14-F29` menu prices are whole rupees, so every pre-tax total was whole too), and the paper was silently truncating — `Subtotal Rs 450 · Tax Rs 74 · Total Rs 525`, three rows that do not close, on a document the customer holds. **The design this implies, taken as an engineering reading under R69 and disputable by FR id:** rounding is applied **inside `billed_total`** (`01-F82`: *what the customer owes*), so `01-F30` conservation needs **no new event and no new payload field**, and the receipt's rounding row is DERIVED as `billed_total − (subtotal + tax)`. The alternative — a stored rounding adjustment — was refused as a second source for one fact (`02-F45`). ⚠ **It inherits the config-carrier boundary and creates no new one:** the Auditor can only recompute a rounded total if it knows the granularity, which is the same thing it already cannot know about the tax posture until `01-F87`'s carrier ships. |
| R71 | The discount threshold's shape | **CUMULATIVE PER ORDER, THE OWNER SETS THE PERCENTAGE (*"maybe 50%"*) — AND A PROMOTION IS NOT A DISCRETIONARY DISCOUNT.** Founder's words: *"consider the discount cumulatively … owner should be able to set a percentage after which Manager's approval is required. like maybe 50%. because … a lot of banks offer discounts on their cards. like some go like 50% off if you use visa signature with a cap of 10,000pkr … it will be stupid if manager has to give discounts every time. then there's another type. the loyalty cards … when customers have ordered certain number of times then they can claim free coffee … would also be very bad if the person at reception have to ask Manager's approval for things which can simply have proof attached."* **The defect this answers, reproduced by adversarial review:** the threshold was per ACT against the order total, which discounts never reduce (they are projection-inert), so **ten Rs 100 discounts each at exactly 10% gave away a whole Rs 1,000 bill with no manager PIN**, in a five-tap loop on the surface built the same day — and a Rs 400 line discounted to zero on a Rs 5,000 order read as 8% *allow* while **voiding that same line was *escalate***: the same money, one tile away. ⚠ **THE SECOND HALF IS ALREADY SPECIFIED AND WAS NEVER BUILT — `17-F12`, since Draft 1:** *"Every promo application emits `discount.recorded` with `campaign_id`. Campaign discounts are **pre-approved by the campaign definition**: within its bounds, no manager approval."* So the founder's two examples are one FR the corpus already holds, and this ruling does not invent a mechanism — it **routes the predicate**: a discount citing a campaign takes `17-F12`'s path and is bounded by the campaign's own cap (the *"capped at 10,000pkr"* case); a discretionary discount is judged **cumulatively** against the order at the owner's percentage. ⚠ **The tension this dissolves, stated because it nearly produced the wrong build:** a 50% cumulative cap would otherwise make the *second* bank promo on one order escalate — which is the outcome the founder called stupid. It only dissolves because campaign discounts **do not count against the discretionary running total**; that is a reading of `17-F12`, disputable by FR id. ⚠ **What is NOT closed:** campaign *definitions* — their caps, validity and who authors them — are doc 17's, and `17 §5`'s `campaign.*` events are unbuilt; for a pilot they are seeded exactly as R70's rounding and the tax cell are, and `01-F87`'s carrier deletes all three seeds together. |
| R72 | What the cashier counts at shift close | **THE WHOLE DRAWER, FLOAT INCLUDED — and the till subtracts the float it already knows.** ⚠ **The defect that produced the question:** nothing on the keypad or the printed slip says which convention applies, so an end-to-end run counted drawer-inclusive and wrote a permanent **`OVER Rs 5,000`** variance into an append-only ledger and onto the day summary; counting sales-only gave variance 0. Under `01-F1` that wrong figure is uncorrectable except by a compensating event. **The reasoning, which is about hands rather than arithmetic:** *sales-only* asks a tired cashier at 11pm to separate the float and subtract before she types — the arithmetic happens in her head, unrecorded, and that is exactly where an error enters and becomes permanent. Counting every note is the act she already performs. ⚠ **The screen and the slip must both SAY "count everything in the drawer"** — the convention being unstated is the whole defect, and a correct implementation with silent wording reproduces it. **A float topped up mid-shift is the case to check rather than assume.** |
| R73 | Day close reconciliation | **THE DAY'S EXPECTED CASH IS THE SUM OF THE SHIFTS CLOSED WITHIN IT.** ⚠ **Measured on the same run: `day.closed` carries a count and NO expectation** (`packages/escpos/src/cash-documents.ts:160` declares this), so the printed `Counted cash Rs 7,968` is checked against nothing — **the day's cash is never actually reconciled**, while sitting on the same paper beside shift figures that are. A number printed beside reconciled ones reads as reconciled. **No new event type:** it is a fold over the `shift.closed` events the ledger already holds, which is why this is the cheap answer as well as the right one. |
| R74 | Do priced modifiers deduct stock? | **YES — a modifier carries a recipe and deducts like any other line.** ⚠ **The consequence that forced the question, which nobody had seen:** under R76's completeness gate a paid modifier rung as its own line carries revenue the gate demands a cost for, and `modifier` is a `SELLABLE_KIND` under `01-F60` — so **a restaurant selling any paid add-on could never reach COMPLETE and its margin figure would be refused for ever.** Add-ons are typically high-margin and high-volume, so the hole would have been permanent and expensive. **Cost, accepted:** `order.line_added` is `{order_id, line_id, item_id, qty, unit_price_paisa}` with no modifier attachment, so this is a schema change on the **money ledger** — a protected path under commandment 10 and R35's full-adversarial tier — plus a doc-01 and a doc-02 spec act. It is the only answer that leaves no permanent hole. |
| R75 | A menu change that breaks completeness | **REFUSE THE PUBLISH until the recipe exists.** ⚠ **This overrules the recommendation, and the founder's own precedent is why:** `14-F29`/`01-F60` already refuse saving an item that leaves an enabled `(branch, channel)` pair unpriced — completeness enforced **at the writer**, so a wrong number never enters an append-only ledger. Extending that from prices to recipes is the same rule on the same surface. **The cost is real and was stated before the ruling:** an owner cannot put tonight's special on the menu at 18:00 without first authoring its recipe and pricing every leaf, and what is blocked is *publishing a price* — which is how the till learns to sell the thing at all. **The alternative was measured as worse in a different way:** dropping out of COMPLETE means the margin figure works for a week after onboarding and then vanishes on the first menu change, which is `§5.6 (b)`'s way-out 2 — a shape this repo has recorded failing twice. |
| R76 | What an incomplete restaurant sees | **NOTHING WHERE THE FOOD COST WOULD BE, PLUS WHAT IS BLOCKING IT.** No figure, no scoped ratio, no lower bound — instead the list: *food cost unavailable — 14 items need a price*, and it is tappable. Founder's rule: *"we should not show false food cost if even a single item's price we don't have."* This is `12-F11`'s *"omitted — never guessed, never shown as zero"* made stricter, and it makes the gap **actionable** rather than merely absent. ⚠ **Two alternatives were refused with their arguments recorded.** A **lower bound** (*at least Rs X*) is never false — a missing price can only add — and was still refused, because it is a number an owner may read as *the* number, and this repo has **two measured instances** of a reader dropping a qualifying label on a shipped screen. A **scoped ratio** (*margin on the 62% we can cost*) is what the category does and is a food-cost figure that is not the food cost. **Cost, accepted:** month one is when a demo lands, and every competitor shows a number there. ⚠ **`13-F5`'s `margin.gross_estimate` encodes a 60% coverage threshold this ruling overrules — leaving it as it stands is wrong under every answer.** |
| R77 | Variance that cannot accuse an honest worker | **A GAP INSIDE ITS OWN MEASUREMENT ERROR IS NOT A NUMBER WE CAN STAND BEHIND, SO IT IS NOT SHOWN AS A GAP** — R76 applied to a quantity instead of to money. ⚠ **Recorded as an ENGINEERING READING of R76 under R69, not a separate founder call; overrule it by FR id.** Founder's constraint: *"we don't want to label honest workers theves and we so don't want the wastage to go through roof."* **His premise is corrected in the direction that helps: the tare is the SMALLER of his two problems.** Variance is a *difference* of two counts (`10-F18` — opening is the prior close), so an unknown-but-constant tare on the same open container **cancels between the two ends**; eyeball estimation is drawn **independently at each end**, so its ~6.93% (12% opaque) compounds to roughly **×√2 ≈ 9.8% per period, ~17% opaque**, and never cancels. That also explains why nine of nine food systems storing no tare is correct engineering rather than an oversight. **Four mechanisms, of which two are positions nobody in the market takes.** (1) **A computed per-item noise floor** — RestOS already has all three inputs and no competitor has them together: the count basis (`exact \| weighed \| estimated`), the container size, and theoretical consumption. Inside the floor the row reads *no reading this period*, never `0` and never a small gap. (2) **Rank and alert in PKR, never in percent** — unanimous in the market; Apicbase writes the founder's own parsley example. (3) **Alert only on a sustained, same-signed run** (≈3 periods, ~1 week at `10-F20`'s cadence): **sign is the discriminator, because measurement error is zero-mean and flips while theft, over-portioning and unlogged waste are one-signed.** Every product surveyed alerts on ONE period while its own guidance says the trend is what matters — that is the mechanism that accuses honest staff. (4) **Recount inside the count session** (Craftable's mechanic, not its report): flag the biggest-money gap before anything reaches an owner. ⚠ **No settable percentage tolerance ships.** Every threshold in the market is per category or per site, never per item, and is a human guess — wrong in unit, grain and basis. ⚠ **Vocabulary is part of the ruling:** *unexplained usage*, and the row form *expected 4.2 kg, counted 3.6 kg*. **Banned: shrinkage, loss, theft, missing** — and R365's *growth*, which misleads the other way. The category's own failure is neutral UI undone by accusatory marketing, so RestOS's marketing speaks the UI's language. ⚠ **The decisive arithmetic, from measured figures rather than the contested ones:** published food waste is **4–10% of purchases** and eyeball counting contributes ~10% per period, **both larger than any plausible theft rate**, so a single-period item gap below ~10–15% carries essentially no information about theft. The theft-share statistics are unusable: *"75% of shrinkage is theft"* is attributed to the same body elsewhere cited for **36%**, and NRF retired its 32-year shrink survey in 2024 over methodology. **Consequence for sequencing: the waste log is built BEFORE the variance report is polished** — it is the largest measured non-noise term and moving mass out of the residual is worth more to the accusation problem than any wording change. |

**Consequences that follow automatically and are not separate decisions:** pooled multi-tenancy
(R1+R5 economics); ~~vendor-operated onboarding rather than self-serve signup (R1)~~ **— OVERRULED
by R17 (August 2026); reasoning at R17 and `28-F12`.** *Kept struck rather than deleted because this
one was derived rather than ruled, and it was reversed without anyone noticing until an adversarial
review of `specs/28` found a shipped FR superseded on the strength of a ruling the repo did not
contain — which is why consequences are recorded separately from decisions.* No RN workspace (R3),
⚠ **and R22 does not reopen it — a browser console is not an RN workspace**; `apps/pos-rn`,
`apps/waiter`, `apps/rider`, `apps/storefront`, `services/foodpanda`, `services/whatsapp`,
`services/intelligence` stay stubs until their wave (R1).

---

## §1 — Before anything else, this week

**S0 · LAN peer authentication.** `mesh-session.ts`'s `hello` arm admits a peer after checking only
revocation — the code says *"arm inspects no token"* — and both Electron hosts fall back to the
literal token `"lan-member-unauthenticated"`. **Any device on the shop Wi-Fi can read and write the
branch money ledger, in two shipping apps today.** Do **not** wait for R2's relay work: under the
relay the fix gets simpler, but "simpler later" is not a reason to leave an unauthenticated write
path on a money ledger for four months.

---

## §2 — What must be planned

Three groups: A is documents, B is design, C is build. **A gates B gates C**, except where noted.

### Group A — the corpus

**Rule: extend, split, amend — never renumber.** 19,803 FR citations across 601 of 660 source
files, zero dangling. Renumbering destroys every anchor and buys nothing.

#### A1 · Written fresh — 2 documents

| Doc | Owns | Why it must exist |
|---|---|---|
| **`28 — Tenancy, entitlement & billing`** | Tenant isolation as a *tested property*; entitlement resolution as data not env; plan shape; subscription lifecycle; invoicing and collection; suspension semantics; the onboarding pipeline as a flow rather than a human runbook. | The document whose absence let every module answer these questions locally. **Sits at authority position 2b, above the module specs** — precisely where the gap was. |
| **`29 — Deployment, the cloud plane & the edge agent`** | Environments and regions; the image/build contract; migration and rollout across N tenants; observability and SLOs; incident response; cost per tenant; the signed agent's install, update and health contract. | `18 §13` gives this four lines and `18 §16` defers hosting to "Wave 2". There is no containerization artifact in the repo. |

#### A2 · Rewritten in place — 2 documents

| Doc | What changes | What survives untouched |
|---|---|---|
| **`27 — Design language`** | §3 colour, §4 typography/numerals, §5 icons, §6 tokens — replaced, rebuilt on Tailwind v4 + shadcn + `lucide-react`. §1's *flat, paged, positional* law is **repealed** (scrolling, grouping, search permitted). The no-images rule is **repealed**. | **§1a reference hardware, §2 touch/density/latency ergonomics, §2a/§2b paper and thermal** — physics and field evidence, the one part of the old system that was right. |
| **`21 — UX system`** | Commandment 6 rewritten: "closed vocabulary, no raw primitives" becomes **"shadcn/Radix primitives beneath a RestOS component layer; no unthemed primitives and no values off the scale in app code."** `tokens:check` is reworked to enforce the new rule, not deleted. | Per-role design laws; the real-staff testing protocol; numeric UX budgets. |

> **shadcn is already allowlisted.** `18 §14` lists shadcn/ui + `radix-ui` + Tailwind v4 +
> `lucide-react`, and `18:120` already specifies shadcn for internal tools, so no `§15` dependency
> event is required. What changes is its **scope** — internal tools → every surface — and
> `packages/ui`'s role. The POS was built bespoke against an allowlist that already said otherwise.

#### A3 · Amended, clause-level — 7 documents

- **`restaurant-os.md` Part I** — law 5: keep *LAN-first real-time*, replace *"cloud is the
  exhaust"* with a bidirectional statement (*the cloud is the control plane and the cross-branch
  path; a branch may run without it, a tenant may not exist without it*). Law 7: images permitted,
  and the primary aid for staff who read little. **§7** take-rate removed (R5); **§8** build strategy
  re-cut for R1. ⚠ Both on the owed list.
- **`18`** — client runtime (browser + edge agent, R3); monorepo layout; shadcn scope; RN fleet
  removed; the seven verify rails all made to gate CI.
- **`01`** — branch relay replaces hub election (R2 — ⚠ **blocked on the R2/R36 call**); device as
  bounded cache; **`01-F25` pairing code specified for the first time** (format, TTL, rate limit,
  claim/refusal protocol); `01-F14` retention window picks a value.
- **`15`** — becomes the real control-plane spec: provisioning over tRPC rather than argv,
  entitlement gates, impersonation, fleet health.
- **`02` / `03` / `14`** — screen inventories change with Group B.
- **`00 §5.1`** — name the exception the suspension gate creates, or two documents contradict.
- **`20` / `24`** — unchanged in substance; the test-authorship and mutation discipline carries
  forward verbatim. **The cheapest high-value thing in the plan.**

#### A4 · Superseded or retired

- **`25`, `26`** — largely moot under a fixed branch authority. Keep as decision records, marked
  superseded. **The merge-invariance oracle survives regardless** — the only instrument that can
  tell a correct merge from a convergent-and-wrong one.
- **`19`** — the requirement changes (device↔device mesh, R3); the *verdict* (build custom)
  survives. Amend the requirement table, keep the decision.
- **`AGENTS.md`** → a **≤2,000-token router** (where truth lives, never what the truth is; CI-banned
  from containing a file path, a date, or a digit followed by "tests") + **`LESSONS.md`** (~14
  transferable lessons, admitted only if true independent of tree state).
- **Deleted:** `SYNC-ORDERING-PROBLEM.md`, `plans/wave-0` (18 files), 11 orphaned wave-1 files.
  **Kept:** `running-the-stack.md` (seed of doc 29), `wave-1-scope-reconciliation.md`.

#### A5 · Rail changes

1. **`docs-lint` C5 counts lines while `23-F8` specifies tokens.** The measurement is R64's and is
   deliberately not restated here — one number, one place. Fix the rail and mutation-prove it; R64
   defers the new cap until the compacted corpus can be measured.
2. **A `DEC-*` resolution rail** — 47 decisions have no reference check at all. Move to
   `specs/decisions/DEC-*.md`, one file each, generated index.
3. **No layer-1 or layer-2 setting read from `process.env` in shipping code** — a new rail in the
   `seams:check` family. The 24 known `RESTOS_*` violations are its first fixtures.
4. **CI runs three of the seven verify rails.** `tokens:check`, `strings:check`, `seams:check` and
   `layout:check` never gate a merge today. All seven must.

### Group B — design *(gates most of Group C; R8 puts it first)*

| # | Deliverable | Notes |
|---|---|---|
| **D1** | Design principles + visual identity | Palette, type pairing, spacing scale, radius, elevation, motion. Delivered as rendered artifacts to react to, not prose. |
| **D2** | Token architecture on Tailwind v4 **+ the touch-scale layer** | ⚠ **The trap:** shadcn defaults are desktop-mouse sized (`h-9`/`h-10` ≈ 36–40 px); the counter minimum is 20 mm of glass ≈ 126 px at counter density. **Adopting shadcn as-shipped regresses the one thing the old system got right.** The mm-of-glass conversion in `physical.tsx` survives and sits *over* shadcn. |
| **D3** | Component inventory | Map the 22 bespoke components onto shadcn + a RestOS layer; per component adopt, wrap or keep bespoke (money display and the keypad are likely bespoke). |
| **D4** | Screen designs — counter | Order, Pay, Cash, Orders, Me, Sold out, Unlock, Escalation. **Order screen per R13: dense grid, priced, categorised, images, search, workable by keyboard, mouse and touch alike.** |
| **D5** | Screen designs — other surfaces | Pass/KDS; back office; **control plane console (new)**; **onboarding/provisioning flow (new)**. |
| **D6** | The honesty strip | Diagnostics occupy ~13% of every screen in developer language. Redesign so system state is honest without dominating (R9, `27-F71`). |
| **D7** | Design QA rails | `layout:check` retained and extended — the only instrument that catches D2's trap. Add a contrast/legibility check; the gate's own docs admit it *"judges nothing about legibility, contrast or typography"*. |

### Group C — build

| # | Workstream | Depends on |
|---|---|---|
| **W1** | Design system — rebuild `packages/ui` on shadcn + the touch layer | D1–D3 |
| **W2** | Client runtime — browser renderer + signed edge agent; the 21-method IPC contract becomes its network contract | R3, D4 |
| **W3** | Sync — ⚠ **blocked on the R2/R36 call.** Under R2: relay replaces election, device becomes a bounded cache, split-brain and device↔device merge arms deleted. Under R36: the mesh is hosted instead. **Opposite work** | the R2/R36 call, then A3(`01`) |
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
W7-13         ██████████████ W2 client runtime · W3 sync
W11-18              ████████████████ W4 multi-tenancy · W5 control plane
W16-22                    ████████████ W6 commercial · W7 ops
W20-26                          ████████████ hardening · pilot · K-8 printer pass
```

**Two hard gates.** Nothing in W4–W6 starts before `28` exists — that document is the reason the
deviation happened, and building against its absence again would be the same mistake twice. And
**K-8, the physical printer pass, has never happened**: no printer has ever received a byte from
this code, and the shipped transports are write-only, so paper-out currently reads as a printed
ticket. It must land before a paying tenant, not after.

---

## §4 — R11's carve-out, and the one thing still open

**R11 defers the region, not the obligations.** Four things on the current box are *not* deferred,
because they are what a paying tenant is owed regardless of datacentre:

- **TLS.** Both services bind `0.0.0.0` in plain HTTP/WS, so a till connecting over the public
  internet sends its device token in clear. Not a hosting question — §6 gap 11 has the measurement.
- **Backups that have been restored.** 2 of 22 `specs/22` FRs are built; real RPO is up to 24 h
  against a specified 5 minutes; the device half has no scheduler at all while the till holds the
  only copy of every unpushed sale.
- **A reproducible deploy.** All seven service `build` scripts are `echo` stubs and production runs
  `tsx` over a git checkout. One immutable image per service, on the same box, is W7's job — and it
  is what makes the eventual move a non-event.
- **Enough observability to know a tenant is broken** before they phone you.

**The tripwire:** revisit region and platform at **the first paying tenant outside your own pilots**,
or the first tenant who asks where their data lives — whichever comes first. `DEC-DATA-002` records
Pakistan's residency posture as unverified, and that answer is owed before the question is asked in
a sales conversation. Note the lowest-latency major-cloud region to Lahore is Mumbai, and Indian
hosting for Pakistani restaurants' transaction data is a business problem independent of any
engineering merit.

**Still genuinely open — the Sindh Finance Act reading.** One source, OCR'd from an image scan,
self-flagged unverified: liability for non-conforming invoices may fall on *the software supplier*.
Under installed software that was the restaurant's exposure; under SaaS it is yours, for every
tenant. Worth a Pakistani tax lawyer's hour before a Karachi tenant signs — a business-model input,
not an engineering ticket, and `services/tax` is 2 lines today.

---

## §5 — What this plan deliberately does not do

- **Re-plan modules 05, 08, 09, 10, 11, 12, 13, 17.** Out of scope under R1 until their wave;
  sequence is a founder call.
- **Renumber anything.** See the Group A rule.
- **Rewrite `20` and `24`.** The testing and harness discipline is the reason the salvageable half
  is salvageable. It carries forward unchanged.
- **Touch `packages/domain`.** 3,183 production lines, 543 tests, three runtime dependencies, almost
  no coupling to the deviation. The crown jewel, and this plan leaves it alone.

---

## §6 — The build queue, re-derived from the authority (2026-08-23)

⚠ **This section exists because the owed list could not be trusted to plan a wave.** It is measured
against `restaurant-os.md` Part I §8 and `00 §1`'s wave table — the authority — rather than carried
forward from a derived document. **Re-derive it before quoting it: shelf life measured in days.**

**Method, because it is what makes the list worth anything.** Every grep is `-a` (a C locale turns
this repo's UTF-8 source into `Binary file … matches` and silently drops real call sites).
**Emitters are enumerated as construction sites and constant-resolved `append(...)` calls, not as
mentions** — seven event types are emitted through a `const` and are invisible to a literal grep,
`served` among them. Consumers are read as fold arms, not counted as `case` labels.

### (a) Genuinely absent and MVP-blocking

| # | Gap | Measured evidence | Owner |
|---|---|---|---|
| 1 | **Every corrective emitter.** Six types, five with schemas, four with folds, **zero producers** — the counter has no void, comp, discount or refund control at all. | `packages/sync-client/src/folds/merge.ts:866`–`868` are inert arms the file itself calls *"projection-inert … a stated DEBT"*; `main/authorize.ts:125`–`126` and `approval-record.ts:55`–`72` are authorization tables, not emitters, and `approval-record.ts:63` says discount is *"UNREACHABLE today"* | doc 02 surface + `packages/sync-client` fold |
| 2 | `order.cancelled` **payload schema** — the only one of the six with nothing at all | zero hits in any production TS; `01-F4` makes it unemittable | `01-F84` spec-closed, code owed |
| 3 | **Fold arms for void/comp/discount** — three of `01-F30`'s four RHS conservation terms evaluate to zero permanently until these land | `26 §7` (corrected 2026-08-23) | `26 §7` owes the oracle-pinned merge rule |
| 4 | **`00 §7` layer-2 config plane** (R55, R60, R63 all need it) | only ENV device config exists; `PAID_OUT_APPROVAL_THRESHOLD_PAISA` pinned at `main/authorize.ts:161` | carrier **DECIDED**: `01-F87` makes `config` `01-F75`'s fourth resource |
| 5 | **Tenancy enforcement — A SUSPENDED ORG IS FULLY SERVED.** `status: active \| suspended` is stored and **never compared anywhere**; no `=== "suspended"` in the tree; `entitlement` greps to **zero** production hits | `services/sync-gateway/src/schema.ts:380`, `packages/domain/src/tenancy.ts:182` | doc 28 §246 **already specifies it** |
| 6 | **Billing** — `subscription\|billing\|invoice\|plan_\|stripe\|payfast` across every `src/` returns **zero hits**, and R1 names it in the first sellable product | — | founder call on scope; R5 fixes it at flat subscription, no metering |
| 7 | **Platform control-plane surface** — `apps/platform-admin/src/index.ts:2` is `export {}`; the logic ships as seven gateway CLIs and is lift-ready | no vendor router in `services/api/src/router.ts` | doc 15 |
| 8 | **Signup's door** — the ACT ships (`signup.ts:134`, atomic org+owner, routed at `publish-http.ts:566`); the door does not | service-credential-only route, no public surface, no `28-F15` admission control, no credential delivery | doc 28 |
| 9 | **Manager PIN session** — without it the console cannot author, so `audit.alarm_acknowledged` is **a consumer with no producer** | `apps/manager/src/branch.ts:50`–`53`; `alarms.ts:202` | doc 05 |
| 10 | **Nightly delivery** of the owner summary — compute and render both ship; nothing schedules it | `services/jobs/src/index.ts` schedules only `auditor-nightly` and `tenant-backup-nightly` | doc 12 |
| 11 | **THE CLOUD LEG HAS NO TLS REQUIREMENT — `00 §5.4`'s *"TLS everywhere"* is unenforced on the one leg that crosses the public internet.** `createWsCloudTransport` dials the URL **verbatim** and the documented form is cleartext | `packages/sync-client/src/transport-ws.ts:534` is `new WebSocket(url)` with no scheme check; `apps/pos-electron/src/main/index.ts:785` passes `process.env.RESTOS_CLOUD_URL` straight through; `README.md:666` specifies it as *"full WebSocket URL including the path: `ws://host:8080/sync`"* and **no `wss://` appears in any document in the repo** | `00 §5.4`; `packages/sync-client` (protected) |

⚠ **Gap 11 is the sharpest, and the corpus already knew:** `01-F72` (c) says mTLS delivers
*"confidentiality (`00 §5.4`, "TLS everywhere" — **a law this leg has never met**)"*. The asymmetry
runs backwards from the risk — the **LAN** leg hard-codes `wss://` with mutual TLS and certificate
pinning (`transport-ws.ts:354`) on a restaurant's own private network, while the **cloud** leg,
carrying `staff`'s Argon2id hashes, `01-F47` device tokens, the `device_roster` that decides who may
write to a branch ledger, and every event, takes whatever string the environment hands it. The same
codebase validates the PRINTER cable's scheme rigorously (`printer-link.ts` refuses an unreadable
`RESTOS_PRINTER` whole and names it on the boot line). It also **undercuts a bound this project has
leaned on twice**: `01-F73` (c) and `01-F80` (f) both rest on *"the cloud leg is TLS to a known
endpoint"*, and `01-F80` (f) serves the pairing claim as one of exactly two unauthenticated writes
on that reasoning; the `6932c85` review accepted *"signature carried and not checked"* on `01-F75`
(ii)/(iii)'s *"one leg, the cloud's, authenticated end to end"*, which is true of the code only if
the deployment supplies `wss://`, and nothing asks it to. **The fix must carve out loopback
explicitly** — every runbook here uses
`ws://127.0.0.1`, so a guard without that carve-out stops every developer and every four-process run
the product is demonstrated with.

⚠ **Gap 5's shape is the opposite of what it looks like.** Doc 28 specifies it fully: *"cloud
services gated with an honest notice, **sync still accepted**, in-branch billing untouched."* Sync
stays open and the till keeps selling **because commandment 4 forbids blocking a sale** — so this is
not "refuse the org", and an implementation that gates the ingest path would breach `00 §5.1` while
appearing to close the gap. `15-F7` puts the status banner on the device. **Specified and
unenforced, not unspecified.**

### (b) Claimed owed somewhere but actually SHIPS — each worth as much as a real gap

`served` at T2 (`serve-mark.ts` + wiring `index.ts:373`–`390`, landed 2026-08-12 — *eight days
before* the plan that called it absent). The availability toggle end to end (`Counter.tsx:1230` →
`preload:44` → `gateway.ts:707`). `approval.requested` (`approval-record.ts:188`). Signup's act, its
atomicity, its email-uniqueness ordering and its refusals. Void/comp/discount **payload schemas** —
claimed absent by `26 §7` and by **four shipping files**, one of which (`services/api/src/summary.ts`'s
`OMISSIONS`) states it **to an owner** in the nightly summary; corrected at `e74cffb`, the escpos
three reported not edited (protected path).

### (c) Cannot tell without running it

`02-N3`'s ≤30 s quick-entry (no harness exists). T2 over LAN with the WAN unplugged. Whether the
printer→ledger chain closes (`main/index.ts:1801`–`1806` states in-tree that only a real till with a
dead printer can prove it, and that `seams:check` is clean either way). Argon2id cost under Hermes —
`apps/manager/src/probe.ts` exists precisely because it decides whether the manager approval path is
deliverable at all.

---

## §7 — The arbitration rule (delegated to the implementer, August 2026)

A measured gate and a design intention fought twice in one sitting, and both times the measurement
was right. The standing rule, so it is not re-litigated per conflict:

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
