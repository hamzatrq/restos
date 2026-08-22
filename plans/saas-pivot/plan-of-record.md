# RestOS — the SaaS pivot: plan of record

**Status: rulings taken, planning artifacts scoped. August 2026.**
Basis: `reconciliation.md` (the audit) + eight founder rulings recorded in §0.
This document says **what must be planned and in what order**. It is not itself the design or the specs.

---

## §0 — Rulings taken

Sixteen decisions founder-ruled during the reconciliation review, plus **R17–R63 ruled August 2026**
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
| R27 | Deactivation timing | **A removal takes effect IMMEDIATELY; every other roster change still defers to `01-F46`'s 05:00 boundary.** `01-F61` defers roster changes for a real reason — a grid that reorders under a cashier's hand is `27-F4`'s muscle-memory break — but the risk is asymmetric and the exception is narrow: a dismissed cashier holding a working PIN until 05:00 is a security hole with a face on it. Closes `01 §9.5`. **⚠ The live-session half follows by necessity and is stated as a reading rather than smuggled in:** a deactivation that leaves the person signed in is not immediate in the only case that matters, so her session ends too. That is `11 §9.8`, and it is closed by this ruling rather than left open — but `01-F48`'s 30 s device bound is NOT borrowed for it, because that number was written for a device and a session is not one. |
| R28 | Stale and never-received rosters | **An OLD roster admits, with its age surfaced; a NEVER-RECEIVED roster refuses, loudly, at boot.** Exactly `01-F74` (d)'s ruling for the LAN device roster — *stale is not unreadable* — applied to people: refusing because the WAN is down is the `00 §5.1` breach that clause exists to prevent. The second half is not symmetry, it is the opposite case: a device that has never received a roster has nobody who can sign in, which is a **stopped till**, and `00 §5.7` requires that to be loud at boot rather than discovered at 07:00 by a cashier who cannot open the day. No staleness bound is set — setting one would eventually stop a disconnected branch selling. Closes `01 §9.6`. |
| R29 | The first PIN | **The owner sets it in the back office and tells her.** Matches how a small restaurant actually works, and `01-F61` already accepts the consequence by name: a 4-digit PIN is *"a convenience credential, not a secret"*, safe because it is paired with a registered device (`01-F25`/`01-F47`). **Owed by this ruling and not optional: a change-my-PIN path at the till**, or the owner knows every cashier's PIN for ever and `02-F41`'s attribution quietly means "whoever the owner let in". Closes `14 §9.10`; the change-PIN surface is a new owed item, doc 14's. |
| R30 | Till-only staff and email | **A cashier who only uses the till needs NO email; email is required only for back-office access.** Many will not have one, and demanding it makes the owner invent addresses that are then wrong for ever in a directory `11-F20` never deletes from. **⚠ This contradicts shipped schema and the contradiction is named, not left to be found:** `services/sync-gateway/src/schema.ts:475` declares `email: text("email").notNull()` with a unique index on `lower(email)` at `:499`. Email must become nullable; Postgres permits multiple NULLs in a unique index, so the index survives unchanged. The back-office login path must never assume an email exists — `findByEmail` is the lookup and a till-only person is simply not findable by it, which is correct rather than a gap. Closes `11 §9.6`. |
| R31 | When a change takes effect | **THE 05:00 BOUNDARY STOPS BEING THE SCHEDULER. Every act that changes what a working surface shows asks WHEN — immediate, or at a time the owner picks.** The founder's words: *"every restaurant has different timings and this is a stupid concept … for every action we should ask the user if he wants it to be immediate or scheduled at a specific time."* ⚠ **THREE DIFFERENT THINGS WEAR "05:00" IN THIS CORPUS AND THIS RULING REACHES ONE AND A HALF OF THEM. Measured 2026-08-18, because applying it to all three would break the product in a way nobody asked for.** (a) **`01-F46`'s business-day boundary is NOT touched.** It is a *reporting anchor* — which day a sale belongs to — and it is **already a configurable cutover hour, default 05:00, a layer-2 org setting** (`00 §7`), so "every restaurant has different timings" is already satisfied there and always was. Removing it would leave daily totals, shift reports and cash reconciliation with no day to be about, and `01-F45`'s *"a sale rung at 01:30 belongs to the night it was served"* is the whole reason midnight was refused for this market. The Asia/Karachi **timezone** anchor stays non-configurable (`01-F46` calls that a refusal, not a deferral). (b) **`14-F28`/`14-F36` — menu edits — ALREADY DO THIS and the founder's premise was out of date here:** the choice is already per edit, with an explicit *apply now*. What they lack is the third option — **an arbitrary time** — and this ruling adds it, so the choice becomes *now · at a time I pick · at the day boundary*. (c) **`01-F61` — roster changes — is the real target and the founder is right.** It binds roster changes to the boundary with **no choice at all**, so an owner who hires someone at 11am cannot put her on the grid until 05:00 tomorrow. It gets (b)'s three-way choice. **What does NOT become schedulable: a DEACTIVATION.** R27 already ruled it immediate and this ruling does not reopen it — a fired cashier who keeps selling until a scheduled time is a security hole with a face on it, and "ask the user when" is the wrong question for an act whose whole point is that it takes effect now. |
| R32 | A deactivated person's PIN credential | **DELETED — the owner sets a new PIN on re-activation.** A departed person's credential does not outlive her employment in the database. Re-activation is therefore a two-step act (flip the status, then set a PIN) and must fail legibly rather than silently when the second step is skipped. Answers the case `11-F23` deliberately left open; that FR is amended by name rather than reinterpreted. Note the blast radius was already small either way — `11-F21` carries the hash only on an `active` entry, so a device never holds an inactive member's credential — which makes this a cloud-side retention decision, not a device-security one. |
| R33 | The change-my-PIN surface | **BUILT WITH STEP 4**, alongside the back-office user surface, rather than deferred. Closes the debt R29 created: without it the owner knows every cashier's PIN permanently and `02-F41`'s attribution quietly means *"whoever the owner let in"* — which `01-F1` then makes permanent and uncorrectable, so the cost compounds per shift rather than waiting. Owed by this ruling: an FR in doc 14, a place in `01-F61`'s unlock flow, and its own `24 §3` oracle. It cannot be gated on `14-F39`'s `user.manage` (a cashier is `deny` there), so it needs either its own FR-decided action or a self-scope arm on `02-F38`'s `requested_by_user_id` precedent — recorded in `packages/domain/src/permissions.ts` as a named neighbour already. |
| R34 | The design language's SOURCE | **FOLLOW THE INDUSTRY, DO NOT INVENT.** Founder's words: *"Follow the mainstream and global giants in this industry. do not try to create from scratch. steal like an artist."* This **refines R12** rather than overruling it — R12 said invent a brand where none exists, and R34 says the *interaction patterns and visual conventions* come from what already works in POS: Toast, Square, Lightspeed, TouchBistro, Loyverse, Foodics. **The reason is stronger than taste:** a POS convention is muscle memory that a cashier already has, so copying it is training the product does not have to do — which is `27-F4`'s own argument (positional contract, muscle memory) applied one level up. What is still invented is the identity layer R12 names (name, palette, mark); what is borrowed is layout, affordance, density and flow. ⚠ **This does NOT license copying a competitor's assets** — it licenses their solved problems. |
| R35 | Review depth | **TIERED BY BLAST RADIUS**, replacing the flat `20 §4.4` bar for this wave. **FULL adversarial rounds** (fresh context, repeat until SHIP): credentials, tenant isolation, money, the wire, the permission matrix. **ONE review**: UI, read paths, config, docs. The evidence is this session's own: two credential leaks, a shadow-assignment PIN resurrection and a publisher race all landed in the first group, while UI rounds returned comment typos beside one real FR break (`21-F15`). ⚠ **`20 §4.4` is not amended by a plan** — this is the wave's operating policy and a spec PR is owed if it outlives the wave. |
| R36 | The LAN mesh | **IN the MVP.** A branch may run several devices, so `01-F12`..`01-F15`, `02-F11` and hub-as-clock-authority stop being unexercised. This is **Wave-0 debt being paid**, not new scope: `restaurant-os.md` puts the mesh in Wave 0 and `mesh-session.ts` has carried `@unreached-owed NO HOST RUNS THE LAN MESH YET` throughout. It also ends the `00 §5.1` breach the pass screen currently works around. |
| R37 | Printing | **BUILD THE PATH, DEFER K-8.** The KOT and receipt paths ship; the physical pass runs when thermal hardware arrives, without a code change. Pilots start printerless — `03-F22`/`03-F51` make that a supported configuration and `03-F5`'s band stays honest — and gain paper mid-flight. ⚠ `27-F35`'s ≥85% comprehension gate on real staff remains untested until then and **no test may imply otherwise**. |
| R38 | Backup and export | **NIGHTLY PER-TENANT BACKUP + A RESTORE THAT HAS ACTUALLY BEEN RUN + OWNER-TRIGGERED EXPORT.** The minimum that makes R21's *"real business records"* honest. Retention windows and erasure are deferred — erasure interacts with an append-only ledger and is a design problem rather than a feature. ⚠ **A restore nobody has performed is a backup nobody has**; the acceptance is a restore, not a dump. |
| R39 | Tax | **CORRECT TOTALS AND AN ITEMISED TAX LINE; NO FISCALIZATION.** Receipts compute and show tax properly; nothing integrates a revenue authority's device or API, and nothing claims certification. Doc 16's fiscalization is post-pilot. |
| R40 | Self-serve signup | **BLOCKS LAUNCH**, as R17 ruled. A restaurant signs itself up and reaches an org, a branch, an owner login and a device pairing code with nobody touching a terminal. It is also one of R19's seven surfaces, so it is being designed either way. Retires `create-org.ts` as the onboarding path (it survives as an operator tool). |
| R41 | Build order | **TWO PARALLEL TRACKS.** Track A finishes the staff chain (steps 7, 2b, 8, 9, 10) — device-plane plumbing that survives any restyle. Track B is the design language and the seven surfaces. They collide only in `apps/pos-electron`, and the collision is manageable because A is `packages/sync-client` and B is `packages/ui`. |
| R42 | Hosting | **CURRENT SERVER, NO INFRASTRUCTURE PROJECT.** No managed-Postgres move, no new deploy pipeline. ⚠ **Read against R38 rather than as contradicting it:** R38's backup is PRODUCT work — a per-tenant job on `services/jobs`'s existing BullMQ repeatable, which `20 §4.2`'s Auditor already proved out — not an infrastructure migration. R11 stands: revisit hosting when there are paying customers. |
| R43 | What "MVP done" means | **YOU CAN DEMO IT END TO END TO A PROSPECTIVE PILOT.** This sets the VERIFICATION bar, not the scope: everything R19/R36/R40 name still gets built; what changes is that acceptance is a demonstrable end-to-end run rather than a restaurant having survived a Friday night. ⚠ Stated so it is not read as licence to ship a demo — `01-F1` makes any real day sold under it permanent, so "demoable" is the gate for calling the MVP done, not for letting a restaurant trade on it. |
| R44 | The name on screen | **"RestOS"**, as R12 ruled. Every surface draws it from one declaration so the rename before paid launch is a token change. |
| R45 | R19 reaffirmed | **ALL SEVEN SURFACES ON THE NEW LANGUAGE BEFORE ANY RESTAURANT USES IT** — counter, KDS, back office, control plane, signup, owner app, manager console. Asked directly whether to design-first only the three that do not exist, the founder chose the whole set. So the counter is rebuilt on the new language although it works today, and that is the largest single item on the critical path. |
| R46 | Signup admission control | **A VENDOR INVITE CODE.** `28-F15` forbids shipping public signup without a named admission control and declines to pick; this picks. At 5–10 pilots the founder knows every restaurant by name, so a code costs nothing in reach — and it is the only option that needs **no outbound-mail capability**, which `28 §9.21` records the corpus does not own and `18 §15` would make a governance event rather than a package install. ⚠ **Stated so it is not read as self-serve in R40's full sense:** a code means the founder is still the gate, so R17's *"the founder is otherwise the onboarding process"* is only half addressed — what it removes is the terminal, the SQL and the per-tenant manual provisioning, not the introduction. Every junk org would otherwise be permanent (`01-F68` never reuses an `org_id`) on a deployment shared with real tenants, which is what makes an open door the expensive option. |
| R47 | The owner's first credential | **SHE SETS IT DURING SIGNUP, ON A SINGLE-USE TOKEN.** Signup mints the token; she lands on a redemption surface and chooses her own password. ⚠ **This is a reading of `15-F27` and is stated as one:** that FR bans a password as an **input to provisioning** — the vendor typing one on her behalf — and does not ban her choosing her own on a redemption surface, which is the shape `15-F26` already describes and `28 §9.21` records as having no surface built. It needs no mail because the token is handed over in the session she is already in. **Retires `create-owner.ts:269`'s print-to-stdout as the delivery mechanism**; that command survives as an operator tool. Recovery is NOT decided here and is owed: a locked-out owner still has no path anywhere in the corpus (`28-F19`). |
| R48 | Remote approval under R22 | **APPROVALS STAY TILL-LOCAL; THE BROWSER CONSOLE RENDERS ONLY.** `05-F28` calls this the *legitimate smaller thing*. The measurement that decides it: the shipped till approval is PIN-gated (`authorize.ts:568` refuses unless `verifyApprover` passes), so a browser decision arriving with no PIN forces one of two costs R22 did not name — the till appends a grant naming an approver it **never verified** (commandment 8 and an `02-F41` hole on a money path), or the cloud becomes a credential verifier and `28-F7`'s *no cloud surface holds device credential material* needs amending. R22 said resolution (c) needs *"no amendment to `01-F62` or `02-F41`"*; that is true of the ENVELOPE and silent about the CREDENTIAL. ⚠ **What this costs, stated:** `00 §1` rows doc 05 at *"1 core"* and this is less than that — the manager sees alarms and pending approvals on her phone and walks to the till to approve. Revisit when a pilot says the walk is the problem. |
| R49 | The owner app's runtime | **BROWSER. The React Native scaffolding is DELETED.** `apps/owner` becomes a fifth browser surface on the back-office template — which measured as genuine shadcn/Radix/Tailwind v4/lucide, i.e. already the target stack. R3 killed the RN till and R22 moved the manager to a browser; keeping RN for one surface keeps **the whole toolchain tax**: two TypeScript versions, `apps/manager` outside the root tsconfig program, zero `packages/ui` components for RN (so both RN surfaces breach commandment 6 the way `apps/manager` already does in a file whose own header admits it), and EAS builds. **What it costs:** no native push and no app-store presence; a PWA covers most of it. ⚠ **`12 §8` and `14-F31` reserve `apps/owner` for Expo and are now WRONG — spec PRs owed to both, plus `specs/05`, which still rules the Expo app R22 superseded** and would send a session routed there to build one. |
| R50 | Fixed or configurable INSTRUMENT | **FIXED.** Tile colour, size, grid dimensions and sort order are not merchant settings. `27-F4` (position), `27-F7` (list order), `27-F72` (density) and `27-F74` (hue) all stand. ⚠ **This is the ruling that subsumes most of the design conflicts** — answered once it resolves them; answered per screen the product drifts toward configurable one control at a time, because each individual yes is cheap. **The external evidence is the strongest corroboration `27-F4` has ever had:** Creative Navy's 2026 benchmark scores **Square — the best-looking and most redesigned — as FAILING conditioning stability**, after a 2025 forced rollout produced documented 2–3 s search delays and moved cash-drawer timing from mid-transaction to end, breaking motor routines. **Toast wins that axis by shipping ADDITIVELY.** So under R34, *follow the mainstream* means **Toast's release discipline, not Square's redesign cadence**. ⚠ **Read with R55/R63: FIXED binds the INSTRUMENT — layout, position, density, order. It does not bind BUSINESS configuration** (menu, prices, channels, tax rates, thresholds), which is `00 §7` layer 2 and is the owner's. Conflating the two is how this ruling gets misread in both directions. |
| R51 | Which side the cart sits on | **CHECK LEFT, GRID RIGHT** — Toast's and Lightspeed's arrangement, which is exactly the muscle memory R34 exists to borrow. ⚠ **The shipped counter is the MIRROR** (`Counter.tsx` renders `ItemGrid` first, `Cart` second), so this is a real rebuild — which R45 was doing anyway. `27-F4` makes position a compatibility contract, so it is decided **before** pilots rather than discovered after. The compact-mode amendment already claimed the left edge for the tab rail, so the rail's placement on small glass moves with this. |
| R52 | `27-F30`'s icon ban | **STAFF-FACING ONLY — the FR is amended.** This ratifies what the code has been doing for months without a ruling: `27-F73`/`21-F16` adopt shadcn/Radix, `18 §14` allowlists `lucide-react`, and `apps/backoffice` already ships it. The reading: the 42.2%-on-ISO-7010 study measured **987 Pakistani doctors, dentists and paramedics under time pressure on safety symbols**; an owner reading last night's numbers on her phone is a different reader at different stakes. **Five of seven surfaces are owner-facing**, and binding them would put `27-F31` — locally drawn marks, staff in the loop — in front of an audience it was never measured on, which the plan costs at weeks. ⚠ `27-F31` still binds every **staff-facing** surface unchanged. |
| R53 | The accent hue | **THE SHIPPED PLACEHOLDERS BECOME THE PALETTE** — `bgColor-interactive #0555FA`, `bgColor-status-confirmed #0FEBB4`. `27-F14`'s August amendment freed the slot and the plan records **no convergence to steal** here, so this was R12's territory rather than R34's. Cost stated: they were chosen as placeholders and nobody has judged them as the product's identity; changing them later is a token edit, which is why this is cheap to revisit and not worth blocking on. |
| R54 | Tax and `billed_total` | **TAX IS INSIDE `billed_total`.** One number to reconcile against — the Auditor's conservation equation, the `shift_cash` fold and the receipt's *Total* row all mean the same thing, and it matches how a customer reads a bill. ⚠ **Consequence, stated rather than discovered:** `billed_total` stops being *"the sum of line prices"*, so every reader of it means the new thing, and `01-F30`'s definition of billed moves with it. A `packages/domain` spec act on a protected path (commandment 9), and **no tax payload field lands before it.** |
| R55 | The tax matrix | **TAX IS PER CHANNEL, AND THE OWNER CONFIGURES BOTH THE CHANNELS AND THEIR RATES.** Founder's words: *"allow user or restaurant owner to add his channels and tax per channel … some preconfigured that can be turned on or off like cash and card."* Cash, card, QR/RAAST and online transfer are taxed differently in this market, and **some orgs — typically international chains — charge one rate across all, as instructed by government**, which is the same mechanism with equal cells rather than a second mechanism. ⚠ **This OVERRULES `16-F4` by name** (*"rates are never free-typed by orgs"*) and a spec act is owed to doc 16. It also **retires the fixed payment-method enum**: `cash`/`card`/`online`/`foodpanda` becomes a seed set the owner extends, which is an `01 §4` payload change on a protected path. ⚠ **Read with R50:** the INSTRUMENT stays fixed; this is business configuration and belongs to `00 §7` layer 2. |
| R56 | The correctives' idempotency key | **MINT AN ATTEMPT KEY ON ALL FOUR PAYLOADS.** `01-F31` says a fold dedupes by attempt key and none of void/comp/discount/refund carries one, so a re-delivered corrective double-counts — permanently, under `01-F1`. Deriving it from the envelope was refused: `01-F34` forbids a fold reading ordering metadata or comparing envelope ids into a projected value, and this session has already caught two accidental breaches of exactly that boundary. Four protected schemas in one change, one full adversarial review. This unblocks `01-F30`'s conservation terms, which gate the fold, which gates the surface. ⚠ **AMENDED 2026-08-23 — the MEMBERSHIP of the four was wrong and the count was right.** Measured against the 34 payload schemas in `packages/domain/src/registry.ts` while `01-F83` was written: **`payment.refunded` has carried a key since it was written** — two, in fact (`settlement_attempt_id` plus the parent's `payment_attempt_id`, which `01-F29` requires in those words as *"two fields, never one"*), so adding a third would be `02-F45`'s second source for one fact and would fragment the very cap `01-F29` keys by attempt id to protect. **And `order.line_price_overridden` measurably lacks one** while `APPROVAL_TYPES` already groups it with void/comp/discount and `DEC-MONEY-010`'s gate (ii) names all four. So the four are **void · comp · discount · line_price_overridden**, the name is **`adjustment_attempt_id`** (`DEC-MONEY-010`'s recommended shape (1), which said in terms it was a recommendation — this ruling is what mints it), and `order.cancelled`/`order.rejected` are deliberately **excluded**: they carry no amount and are terminal monotone facts under `01-F35`, so a key on them would dedupe nothing. **The generalisable point is the one this register keeps re-learning: a ruling's LIST is a measurement and a ruling's SUBSTANCE is a decision — the founder decided that correctives must dedupe, and the enumeration was mine and was unverified.** Carried into `01-F83`, which states it as the reading it is. |
| R57 | Which correctives ship | **ALL SIX** — void, comp, discount, refund, plus `order.cancelled` and `order.rejected`. ⚠ **Two carry named costs.** `order.cancelled` has **no payload schema**, so `01-F4` makes it unemittable until one is written — a fifth protected schema change in the same wave. `order.rejected`'s only consumer is `06-F20`'s storefront, which is **not in the MVP**, so it ships a producer nothing reads — which is this wave's most-recorded defect, shipped deliberately rather than by accident. Recorded so a later `seams:check` finding on it is read as a decision and not a regression. |
| R58 | When the tender channel is chosen | **BEFORE THE UNPAID RECEIPT PRINTS, AND IT IS CHANGEABLE.** Founder's words: *"before printing the unpaid receipt the waiter asks the user the channel … sometimes people change the mode after choosing."* So the channel is an INPUT to the bill rather than a settlement-time discovery, which is what keeps R54's tax-inside-total knowable at print time. ⚠ **A receipt may show BOTH totals** — *"some restaurants also write tax for card and cash on same receipt with both total amounts showing so user can choose"* — so the document model must be able to render two totals without either being the ledger's answer. Re-choosing re-computes; `01-F18`'s frozen line price is untouched, because the LINE price never moved — only the tax on it. |
| R59 | Splitting a bill | **THE BILL DIVIDES INTO SUB-BILLS, each with its own channel, its own tax and its own total.** Founder's words: *"if they split the bill you can divide the bill into two, one paid by one channel and one by other. Total price and tax are different."* ⚠ **This is not `02-F13`'s split tender** — that is *"split payment across methods in one settlement"*, one bill many tenders, and it cannot express two different tax totals. `02-F13` becomes the one-channel case of this and an amendment is owed to doc 02. **No seat concept is introduced**, and that refusal is recorded rather than left as an omission: `02-F5`'s split-by-item stands, equal-split is deferred because equal-splitting across differing tax rates needs a rule nobody has written. |
| R60 | Card commission | **THE OWNER SETS A RATE PER PROVIDER, AND THE CARD TERMINAL IS A THIRD-PARTY DEVICE.** Founder's context, which changes the design more than the ruling does: *"we are talking about the POS machines that businesses use to charge cards. In Pakistan banks and other companies provide their machines … a custom android machine with printer in it. Each bank or service have their own commission charges per transaction, and even vendor to vendor the same service provider can give different rates based on volume."* ⚠ **Three consequences.** (i) **No terminal integration** — the cashier keys the amount into the bank's machine and it prints its own slip, so RestOS records what was taken and never drives the device. (ii) The rate is per **(org, provider)** and negotiated, so it is the owner's input, not a vendor rule pack. (iii) Commission is **informational for the owner's net**, never authoritative — the bank's settlement is the truth, and RestOS must not present its computed net as reconciled. |
| R61 | Backup shape | **WHOLE-DB DUMP IS THE RECOVERY MECHANISM; `22-F16`'s OWNER EXPORT IS THE ONLY PER-TENANT ARTIFACT.** The narrower of the two readings and the only one the corpus specifies. ⚠ **What it costs, stated:** there is **no per-tenant recovery** — restoring one pilot's mistake means restoring every tenant to that point, which on R17's pooled deployment is every pilot. ⚠ **And a per-org logical dump ALREADY SHIPPED** (`73f9314`) because the question was open when it was built. It is retained as the export's implementation rather than deleted, and doc 22 must say that the FR requires the export and does not require per-org recovery — so a later reader does not mistake a capability for a guarantee. |
| R62 | Go-live for a self-onboarded tenant | **SELF-ATTESTED, AND THE VENDOR CAN SEE ITS STATE.** `14-F27`'s checklist feeds off `15-F10`'s vendor-staffed runbook, so either it does not apply to a self-serve tenant — which nobody had said — or no self-serve pilot could go live, which blocked R40's end state on its own. The owner works it herself; the control plane reads it. Cost stated: **an owner can tick a box she did not do**, and `14-F27` exists because a tenant selling without a printer, a device or a menu has a bad first day that `01-F1` makes permanent. |
| R63 | The discount threshold, and the config plane | **THE OWNER OR OPS LEAD SETS IT — NOT THE VENDOR.** Founder's words: *"this should be a feature for the restaurant owner or ops lead to set not us."* ⚠ **THE REAL CONSEQUENCE IS NOT THE THRESHOLD, IT IS THAT `00 §7` LAYER 2 IS NOW MVP SCOPE.** R55 (channels and their tax rates), R60 (commission per provider) and this ruling are all *"the owner sets it"*, and there is nowhere to put any of them: measured, the config plane does not exist. So the MVP gains a layer-2 configuration surface, and `PAID_OUT_APPROVAL_THRESHOLD_PAISA` — pinned at Rs 2,000 in `authorize.ts`, *pinned not specified* — moves there with it rather than staying a constant. |

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
