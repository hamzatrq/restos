# RestOS — The Restaurant Operating System (Master Document)

**Status:** Single authority document, July 2026 — merged from the original draft spec (v1, early 2026) and the v2 platform vision. **Part I** is the platform vision and settled product laws. **Part II** preserves the product-seed detail the module specs cite (roles matrix, module behavioral seeds, field hardware reality). Normative software behavior lives in `specs/00–21`; when this document and a module spec conflict on module behavior, the module spec wins (authority order: `specs/00-platform-overview.md`).

---

# Part I — Platform Vision

## 1. What RestOS is

RestOS is a **complete operating system for Pakistani restaurants** — not an ops tool, not a POS, not a dashboard, but all layers of running a food business on one kernel: every sales channel, the service floor, the kitchen, delivery riders, inventory and supply, staff, and an AI intelligence layer that knows what's going on everywhere and tells the owner where the opportunities and leaks are.

**Strategy decision (founder, final):** this is a *gigantic tool, not an MVP*. Public launch is the full suite. The market's incumbents are fragmented single-layer tools; "one system that runs everything" is the positioning no local competitor can match. Internally the build still follows a strict dependency order with continuous embedded-restaurant validation (§8) — "no MVP" means we don't launch thin, not that we build blind.

**Dual promise:** *"Your restaurant runs its rush without shouting — and you see everything, everywhere, from your phone."*

**Serves four operating profiles on one platform (§6):** cloud kitchens · small dine-in (5–20 seats) · large single-branch (100 seats) · scaling fast food (2–5 branches). **Beachhead:** small dine-in, Lahore.

## 2. Design laws (veto power over every feature)

1. **The automation law.** Data drifts from reality whenever capture depends on human discretion. Every fact enters the system as (a) a side-effect of an action someone had to do anyway, (b) an integration/ingestion, or (c) a scheduled, verified ritual (e.g. counts). A fact that can't be captured one of these ways is not promised.
2. **Append-only truth.** No role, including owner, silently edits history. Corrections are new linked records (Appendix A hard rule — all intelligence credibility depends on it).
3. **Presets, not knobs.** Restaurants choose operating profiles and hardware tiers; they never configure infinite options. Signal ownership (who marks "ready") is role assignment at onboarding, not per-restaurant custom design.
4. **One storefront, many doors.** Every own channel (web, WhatsApp, Instagram, QR, phone) is a door into one commerce core — one menu, one customer file, one order queue. A new channel is a new driver, never a new system.
5. **LAN-first real-time.** In-branch coordination (sub-second state propagation across devices) works with the internet dead; cloud is the exhaust and cross-branch path. This is the hardest engineering problem and the technical moat.
6. **AI honesty.** The analyst answers only from the event ledger through a semantic layer of computable, citable metrics; it says "not enough data yet" when true. Autonomy is earned by data maturity, never shipped on day one of a restaurant's history.
7. **Visual-first, low-training.** Any staff-facing flow learnable in under 15 minutes; works on PKR 25k Android hardware. UI language is **English only** (a launch decision that **reversed** the original draft's Urdu+English plan — English is the operating language of this market; staff who read little navigate by memorized visual position, which the stable-layout and icon+number laws in `specs/21-ux-system.md` serve directly).

## 3. Architecture — the OS metaphor, taken literally

| Layer | Contents |
|---|---|
| **Kernel** | Append-only event ledger (orders w/ line-level states, inventory movements, money movements, staff actions) · catalog (menu/recipes/modifiers) · customer file (one identity across all channels) · sync mesh (LAN-first, cloud exhaust) |
| **Drivers** | Channel adapters: storefront, WhatsApp, Instagram, phone/call-center, foodpanda, dine-in POS · Hardware endpoints: printers (ESC/POS), KDS, pass screens, handhelds, rider app |
| **System services** | Inventory & forecasting · purchasing & wastage · prep planning · staff ledger & scheduling · payments & shifts · delivery dispatch & COD settlement · restaurant memory (checklists/SOPs/handovers) |
| **Apps** | Owner dashboard & multi-branch roll-up · manager console · conversational analyst (WhatsApp + app) · marketing & loyalty |

## 4. Subsystem catalog (full scope)

### 4.1 Ops fabric (the nervous system)
- Order state machine: placed → cooking → ready → served/dispatched → settled (canonical state names: `specs/01` §4). **Status lives at the order line** (cross-station assembly: "2 of 3 ready, waiting on naan").
- One queue, all channels, channel-tagged. Sequencing = visibility only (aging colors, chronological); the chef decides, the system never commands.
- Timing pipeline: aging timers day one → ready-marks silently train per-item prep times (rush/quiet segmented) → learned ETAs surface when confident ("quote 25 min").
- Item availability toggle propagating to every channel instantly (auto-86 from stock levels once inventory matures — the autonomy ladder §4.6).
- Hardware tiers: **T1 Counter** (terminal + printers) · **T2 Counter+Pass** (adds pass screen w/ ready-marking) · **T3 Full mesh** (waiter handhelds, station routing/KDS, manager console). Tiers upgradeable; lower tiers degrade gracefully, never feel crippled.
- Manager console: late-order alarms · approval interrupts (void/comp/discount via PIN on manager device) · floor state (table map at T3) · channel pulse (pause/throttle a channel when the kitchen drowns).
- Billing/POS per the POS seed (Appendix B): offline-first, PIN attribution, shifts/cash, ESC/POS receipts.

### 4.2 Commerce core (one storefront, many doors)
- **Hosted storefront** per restaurant: menu → cart → order; modes: QR dine-in, pickup, delivery; payments COD + RAAST/bank transfer (cards when available). Their domain or ours.
- **WhatsApp**: ordering door (conversation → storefront link → cart), order-status notifications, and support rail with a conversational assistant that understands English/roman-Urdu text **and voice notes**, replying in English at launch (bilingual roman-Urdu output deferred until generation quality passes native-speaker evals — 07-F23). WhatsApp Business API.
- **Instagram**: link-in-bio/story links into the storefront; DM automation as API allows.
- **Phone/call center**: counter/call-center entry surface — caller ID → customer file → address & order history → 30-second entry; multi-branch routing to nearest branch.
- **Foodpanda**: manual quick-entry from day one; Delivery Hero POS API ingestion when partnership lands (Appendix E). Same queue, channel-tagged, commission tracked for channel economics.
- **Customer file** (kernel): every channel writes to one identity (phone number as key); order history, addresses, lifetime value — the asset aggregators withhold.

### 4.3 Delivery & riders (in scope — launch requirement)
- Rider app (Android): assigned orders, address/phone, status (picked up → delivered), **COD due-back per order**.
- Dispatch surface at counter/manager: assign order → rider; batch assignment.
- Cash-with-rider settlement: rider returns, system shows expected cash, over/short recorded and attributed (same pattern as cashier shifts).
- Explicitly NOT in scope: route optimization, rider marketplace. Third-party rider APIs (Bykea-style) as fast-follow integration.

### 4.4 Supply plane
- Inventory per the reconciliation seed (Appendix D): locations, raw/prepared items, unit conversions, recipes (done-for-you onboarding, top 10–20 high-cost ingredients), auto-deduction through recipe chain, transfers, photo-invoice purchases with price history, guided counts, variance in PKR with attribution hints, wastage log (photo + reason).
- **Prep planning:** "last 4 Fridays you sold 43 karahis; marinate 25 kg tonight" — demand-driven prep lists from the sales exhaust.
- **Forecasting:** demand per item/daypart/channel; purchase suggestions from par levels + forecast; revenue forecasting and planning views for owner.

### 4.5 People plane
- **Staff ledger:** attendance (PIN/selfie clock-in), **advances/baqaya ledger** (the deeply Pakistani gap no competitor touches), overtime flags, payroll export.
- **Restaurant memory:** opening/closing checklists, shift handover notes, recipes/SOPs — the restaurant survives any one person leaving.

### 4.6 Intelligence plane (the brain)
- **Nightly brief** (push): AI-written plain English — what happened, what's odd, what to check tomorrow.
- **Anomaly alerts:** voids/discount abuse, cash variance, stock variance, wastage spikes, price spikes, dead hours, channel drop-off.
- **Conversational analyst** (pull): owner asks "aj Tuesday se kam kyun?" and gets a cited, ledger-grounded answer. Ships in Wave 4 on **both surfaces together**: WhatsApp (where the owner lives) and the owner app (deep-dive with charts) — never one before the other, and never before its semantic-layer guardrails. Same brain, two surfaces. Semantic-layer guardrails per design law 6.
- **Autonomy ladder** (earned by data maturity per restaurant): describe (alerts/brief) → prescribe (prep/reorder/staffing suggestions) → act with approval (draft POs, suggest 86) → act autonomously (auto-86 on stockout, auto-pause channel on kitchen overload, auto-reorder). Each rung unlocks when the layer below has proven accurate for that restaurant.

### 4.7 Owner layer
- Live view + nightly summary + exception alerts + weekly/monthly reports (item profitability, channel economics net of commission/take-rate, branch comparison) per the dashboard seed (Appendix C); honest sync-status always shown.
- Multi-branch roll-up; identical per-branch structure for one-glance comparison.
- **Marketing & loyalty** (in 18-month scope): WhatsApp broadcasts w/ opt-out, promos, simple loyalty, campaign-vs-lift view — riding on the customer file + WhatsApp rail.

### 4.8 Tax module
- Per the tax seed (Appendix F), unchanged: off by default, honest FBR/PRA compliance as paid add-on, legal red line on suppression.

## 5. Explicitly OUT (first 18 months)

- **IoT / hardware sensing** (scales, temp probes, cameras) — automation law is served by side-effect capture + integrations first.
- **Full accounting & payroll computation** — clean exports for the munshi; the ledger feeds a real accounting layer later.
- Route optimization / rider marketplace (see §4.3).
- Supplier marketplace, embedded fintech (year 2+).

## 6. Operating profiles

| Profile | Channel mix | Ops tier | What they lean on most |
|---|---|---|---|
| Cloud kitchen | 100% channels (foodpanda + own doors + phone) | No floor; kitchen queue + riders | Commerce core, dispatch, channel pulse |
| Small dine-in (5–20 seats) — **beachhead** | Dine-in + phone/WhatsApp + storefront + foodpanda | T1/T2 | Simple fabric, own channels, analyst |
| Large single-branch (100 seats) | Dine-in heavy + all channels | T3 full mesh | Floor coordination, manager console, supply |
| Scaling fast food (2–5 branches) | Everything + call center | T3 + multi-branch | Roll-up, forecasting, consistency, riders |

Profile = channel mix × hardware tier × org size, chosen at onboarding. Same kernel everywhere.

## 7. Business model

- **PKR 8,000 / branch / month** base subscription (full platform). Single plan, no tiers (plan shape: `specs/15` 15-F5a).
- **Own-channel take-rate up to 5%** on storefront/WhatsApp/QR order value — **admin-settable** per restaurant. Pitch: "foodpanda costs 30%; your own channel costs ≤5%."
- Tax compliance add-on priced separately. Done-for-you onboarding (menu, recipes, printer setup, training) bundled or one-time fee per unit economics at pilots.
- Rider app, analyst, storefront included in base — the "gigantic tool" is the pitch; no nickel-and-diming layers.

## 8. Build strategy — no public MVP, strict internal order

**Stack (settled):** TypeScript end-to-end — Node backend + event-log sync, React for web surfaces, React Native for the Android device fleet, Electron for the Windows counter. Full stack detail, repository layout, and development approach: `specs/00-platform-overview.md`.

Build proceeds in dependency waves (overlapping across the team), each validated live in real dev-pilot restaurants from Wave 1 onward — **dev-pilots are development instruments, not launches**:

- **Wave 0 — Foundation:** kernel (ledger, catalog, customer file), LAN-first sync mesh, printing layer, auth/roles. *The hardest engineering; hire for this.*
- **Wave 1 — Service:** ops fabric T1/T2, payments/shifts, aging timers, availability, manager alarms+approvals, nightly owner summary, **plus POS quick-entry for phone and foodpanda orders** (channel-tagged, ≤30 s — so the "one queue, all channels" law holds from the first pilot day). *A restaurant can run on it.*
- **Wave 2 — Commerce + delivery:** storefront + all doors (QR/WhatsApp/Instagram-link), full phone/call-center surfaces with customer file, rider app + COD settlement. *A restaurant can sell everywhere on it.*
- **Wave 3 — Supply + people:** inventory/recipes/counts/variance, purchasing, wastage, prep planning, staff ledger, restaurant memory. *The restaurant's back-of-house runs on it.*
- **Wave 4 — Intelligence + scale:** conversational analyst (both surfaces), forecasting, autonomy ladder rungs 2+, T3 mesh, foodpanda API, multi-branch, marketing/loyalty. *The OS thinks.*

Public launch when Wave 4 is pilot-proven. Per-module software specifications live in `specs/` (§10) — one document per separable app/module; build order is decided module by module from those documents.

## 9. Risks (stated plainly)

1. **WhatsApp Business API policy/limits** and Instagram API limits — Instagram may stay link-in-bio longer than hoped; WhatsApp template approval and messaging-tier rules constrain the channel design.
2. **Foodpanda API access** — apply at project start; manual entry is the standing fallback (Appendix E).
3. **Analyst trust** — one confident wrong answer to an owner kills the brain's credibility; semantic-layer guardrails are non-negotiable, and the brief ships before free-form chat is promoted.
4. **Count adherence** still gates variance value; prep planning and low-stock value soften the ask by making counts useful to staff, not just to the owner. Owner-visible count-skipped nags back it up.
5. **Pilot coverage gap** — dev-pilot restaurants cover the small-dine-in profile. Cloud kitchen, large single-branch, and multi-branch profiles need pilots recruited deliberately, or their subsystems (channel pulse, T3 mesh, multi-branch roll-up, call center) reach market launch untested in the field.

## 10. Module documentation set

Per-module software specifications live in `specs/`, one document per separable app/module — each covering purpose, functional and non-functional requirements, key flows, data, customizability, tech notes, and open questions. Start with `specs/00-platform-overview.md` (module map, shared tech stack, cross-cutting requirements, document template) and `specs/01-kernel-sync.md` (the foundation every module depends on). Build order is decided from these documents, one module at a time.

---

# Part II — Product Reference Seeds

Preserved detail from the original draft spec that module specs cite as their behavioral seed. These are seeds, not normative specs — the `specs/` documents refine and, where stated, amend them.

## Appendix A — Roles & permissions (seed matrix)

Roles are **permission sets, not separate apps** — in small restaurants one person wears several hats. Every role's features double as protection *for* that person ("the system proves I'm clean") — critical for staff adoption.

Roles: Owner (mobile dashboard + web back office) · Branch Manager (console + limited back office) · Cashier (POS) · Storekeeper/Purchaser (mobile capture + counts) · Kitchen/Chef (printers → pass/KDS) · Prep/production staff (shared-device entry) · Waiter/Captain (handheld, T3) · Rider (rider app) · Accountant/munshi (exports) · Marketing (analytics + campaigns) · Customer (storefront/WhatsApp).

| Action | Cashier | Branch Mgr | Storekeeper | Owner |
|---|---|---|---|---|
| Create order / print KOT | ✔ | ✔ | — | ✔ |
| Settle payment | ✔ | ✔ | — | ✔ |
| Discount ≤ X% (configurable) | ✔ | ✔ | — | ✔ |
| Discount > X% | needs Mgr PIN | ✔ | — | ✔ |
| Void after KOT printed | needs Mgr PIN | ✔ (logged) | — | ✔ |
| Comp item | needs Mgr PIN | ✔ (logged) | — | ✔ |
| Reprint receipt | ✔ (logged) | ✔ | — | ✔ |
| Day open / close, cash count | — | ✔ | — | ✔ |
| Receive stock / transfers | — | ✔ | ✔ | ✔ |
| Physical count entry | — | ✔ | ✔ | ✔ |
| Record wastage | ✔ (logged) | ✔ | ✔ | ✔ |
| Edit menu & prices | — | optional | — | ✔ |
| Edit recipes | — | — | — | ✔ (or vendor onboarding team) |
| View sales reports | own shift only | own branch | stock reports | everything |
| Edit/delete historical records | ✖ never | ✖ never | ✖ never | ✖ never (append-only corrections) |

**Hard rule:** no role, including owner, can silently edit or delete historical transactions. Corrections are new, linked records. The entire theft-detection value depends on this.

## Appendix B — POS behavioral seed (billing core)

- **Order capture:** dine-in (table) / takeaway / delivery (own) / foodpanda; menu grid with big targets, category tabs, search; modifiers/variants each able to carry their own recipe; open/park orders, split bill, merge/move tables; item notes; availability toggle propagating to all devices instantly.
- **KOT:** auto-print on confirm, routed by category to multiple printers; reprint and post-KOT void always logged with reason + PIN; course grouping optional, off by default.
- **Payments:** cash, card, bank transfer/RAAST, khata credit (with customer name), split; 80/58 mm receipts, configurable header/footer/logo, optional QR.
- **Attribution:** per-user PIN on every device, idle auto-lock; every action attributed (order, line add/remove, discount, void, comp, reprint, drawer open, settlement); manager-PIN escalation above thresholds; no-sale drawer opens logged and counted.
- **Shifts & cash:** day open with float; per-cashier shift close — expected vs counted, over/short attributed, cashier sees their own reconciliation ("I'm clean"); manager day close with deposit record; paid-outs with reason + photo.
- **Offline (non-negotiable):** 100% of billing functions with zero internet, indefinitely; confirmed order = persisted order (journaled writes, power-loss safe).

## Appendix C — Owner dashboard seed

- **Nightly summary:** sales & count by channel · cash expected vs counted by cashier · voids/comps/discounts (count, value, by whom) · top 5 items + hourly curve · purchases and wastage logged · one-line gross-margin signal when recipe data exists.
- **Live view:** today ticker, open orders/tables, per-branch tiles; degrades honestly ("last synced 22 min ago" — never silently stale).
- **Exception alerts:** void/comp spikes, discount anomaly vs cashier baseline, cash variance, stock variance in PKR, supplier price spikes, no-sale opens — thresholds configurable, sane defaults.
- **Reports (deliberately few):** item profitability (theoretical food cost), branch comparison, channel economics net of commission; everything exports Excel/CSV/PDF.

## Appendix D — Inventory reconciliation seed

Design principle: **staff gain at most two new habits** — photographing purchase invoices and a periodic guided count; everything else is automatic.

- **Model:** stock lives at a location (branch / kitchen / storage); items are raw or prepared; unit conversions (purchase unit → stock unit).
- **Recipes (vendor-onboarded, never owner data entry):** menu recipes (sold item → ingredients) and prep recipes with yield % ("18 kg raw → 15 kg marinated boti"). **Scope discipline: top 10–20 high-cost ingredients only (~70% of food cost)** — full-menu costing is where competitors' modules die.
- **Automatic deduction** through the recipe chain on every sale, all channels; two-tap production entry; transfers with in-transit state and receive-confirm (discrepancies flagged, never absorbed).
- **Purchases:** photo invoice → smart-default confirm (recent supplier + price prefilled); supplier ledger with price history and payables khata.
- **Counts & variance (the payoff):** guided count, tracked items only, storage-layout order, ≤15 min, 2–3×/week; variance = expected vs counted, valued in PKR, with attribution hints ("gap concentrated on days X, Y" / "gap exceeds voids+wastage logged") — narrows suspicion without accusing. Wastage log with photo protects honest staff.
- **Stock intelligence:** par-level low-stock alerts; read-only daily consumption view for the chef.

## Appendix E — Aggregator ingestion seed (foodpanda)

- Delivery Hero POS API (Pakistan supported); menu mapping done at onboarding; orders land in the same stream: POS, KOT, deduction, channel-tagged reporting with commission %.
- **Indirect-flow reality:** order acceptance may stay on the foodpanda tablet; the job is eliminating re-keying, not necessarily the tablet.
- **Standing fallback:** 30-second manual quick-entry (channel-tagged, mapped items) so reporting and inventory work for any org without API access — a permanent mode, not a stopgap. Apply for API partnership at project start; lead time is a schedule risk.

## Appendix F — Tax module seed

- Tax **off by default**; owner configures behavior per channel and per payment method; internal "true" numbers always complete regardless of external posture.
- **FBR + PRA compliance add-on (paid):** when enabled, fully faithful — real-time fiscalization, FBR invoice number + QR on receipt, correct PRA rate handling (rates as versioned configuration, verified against current notifications at build time), returns-ready reports.
- **Legal red line (verbatim, binding):** "the product never implements sales suppression, dual-billing, or under-reporting mechanics in the compliant path, and never markets concealment as a feature." Vendors that build skimming into software face penal provisions under the Sales Tax Act.

## Appendix G — Field reality: hardware & printing

- **BYO hardware, no proprietary hardware, ever.** Android 10+ tablets/phones (PKR 20–40k devices; 2–3 GB RAM must be usable — the PKR ~25k tablet is the reference device); Windows 10+ PCs (the old counter PC is common).
- **Printers:** ESC/POS thermal 58 mm & 80 mm over USB, Bluetooth SPP/BLE, and network (9100). Black Copper and generic Chinese brands are the installed base — maintain a compatibility list from field devices. Cash drawer via printer RJ11.
- **Branch scale:** up to 5 concurrent POS devices per branch, LAN-coherent; up to 5 branches per org (soft limit; schema unlimited).
- **Silent print failure is forbidden:** a lost KOT is a lost order and a support fire — spooler with retry + loud on-device alert.
