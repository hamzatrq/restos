# RestOS v2 — The Full Restaurant Operating System (Platform Vision)

**Date:** July 2026 · **Status:** Converged founder direction after brainstorm rounds 1–7. Supersedes the framing and phasing of `restaurant-os-spec.md`; the v1 spec remains the reference for module-level detail (POS behaviors, printing, tax module, market research, pricing research).

---

## 1. What RestOS is

RestOS is a **complete operating system for Pakistani restaurants** — not an ops tool, not a POS, not a dashboard, but all layers of running a food business on one kernel: every sales channel, the service floor, the kitchen, delivery riders, inventory and supply, staff, and an AI intelligence layer that knows what's going on everywhere and tells the owner where the opportunities and leaks are.

**Strategy decision (founder, final):** this is a *gigantic tool, not an MVP*. Public launch is the full suite. The market's incumbents are fragmented single-layer tools; "one system that runs everything" is the positioning no local competitor can match. Internally the build still follows a strict dependency order with continuous embedded-restaurant validation (§8) — "no MVP" means we don't launch thin, not that we build blind.

**Dual promise:** *"Your restaurant runs its rush without shouting — and you see everything, everywhere, from your phone."*

**Serves four operating profiles on one platform (§6):** cloud kitchens · small dine-in (5–20 seats) · large single-branch (100 seats) · scaling fast food (2–5 branches). **Beachhead:** small dine-in, Lahore.

## 2. Design laws (veto power over every feature)

1. **The automation law.** Data drifts from reality whenever capture depends on human discretion. Every fact enters the system as (a) a side-effect of an action someone had to do anyway, (b) an integration/ingestion, or (c) a scheduled, verified ritual (e.g. counts). A fact that can't be captured one of these ways is not promised.
2. **Append-only truth.** No role, including owner, silently edits history. Corrections are new linked records. (Carried from v1 spec §2.2 — all intelligence credibility depends on it.)
3. **Presets, not knobs.** Restaurants choose operating profiles and hardware tiers; they never configure infinite options. Signal ownership (who marks "ready") is role assignment at onboarding, not per-restaurant custom design.
4. **One storefront, many doors.** Every own channel (web, WhatsApp, Instagram, QR, phone) is a door into one commerce core — one menu, one customer file, one order queue. A new channel is a new driver, never a new system.
5. **LAN-first real-time.** In-branch coordination (sub-second state propagation across devices) works with the internet dead; cloud is the exhaust and cross-branch path. This is the hardest engineering problem and the technical moat.
6. **AI honesty.** The analyst answers only from the event ledger through a semantic layer of computable, citable metrics; it says "not enough data yet" when true. Autonomy is earned by data maturity, never shipped on day one of a restaurant's history.
7. **Visual-first, low-training.** Any staff-facing flow learnable in under 15 minutes; works on PKR 25k Android hardware. UI language is **English only** (a v2 launch decision that **reverses** the v1 spec's Urdu+English plan — English is the operating language of this market; staff who read little navigate by memorized visual position, which the stable-layout and icon+number laws in `specs/21-ux-system.md` serve directly).

## 3. Architecture — the OS metaphor, taken literally

| Layer | Contents |
|---|---|
| **Kernel** | Append-only event ledger (orders w/ line-level states, inventory movements, money movements, staff actions) · catalog (menu/recipes/modifiers) · customer file (one identity across all channels) · sync mesh (LAN-first, cloud exhaust) |
| **Drivers** | Channel adapters: storefront, WhatsApp, Instagram, phone/call-center, foodpanda, dine-in POS · Hardware endpoints: printers (ESC/POS), KDS, pass screens, handhelds, rider app |
| **System services** | Inventory & forecasting · purchasing & wastage · prep planning · staff ledger & scheduling · payments & shifts · delivery dispatch & COD settlement · restaurant memory (checklists/SOPs/handovers) |
| **Apps** | Owner dashboard & multi-branch roll-up · manager console · conversational analyst (WhatsApp + app) · marketing & loyalty |

## 4. Subsystem catalog (full scope)

### 4.1 Ops fabric (the nervous system)
- Order state machine: placed → cooking → ready → served/dispatched → settled. **Status lives at the order line** (cross-station assembly: "2 of 3 ready, waiting on naan").
- One queue, all channels, channel-tagged. Sequencing = visibility only (aging colors, chronological); the chef decides, the system never commands.
- Timing pipeline: aging timers day one → ready-marks silently train per-item prep times (rush/quiet segmented) → learned ETAs surface when confident ("quote 25 min").
- Item availability toggle propagating to every channel instantly (auto-86 from stock levels once inventory matures — the autonomy ladder §4.6).
- Hardware tiers: **T1 Counter** (terminal + printers) · **T2 Counter+Pass** (adds pass screen w/ ready-marking) · **T3 Full mesh** (waiter handhelds, station routing/KDS, manager console). Tiers upgradeable; lower tiers degrade gracefully, never feel crippled.
- Manager console: late-order alarms · approval interrupts (void/comp/discount via PIN on manager device) · floor state (table map at T3) · channel pulse (pause/throttle a channel when the kitchen drowns).
- Billing/POS per v1 spec Module A (offline-first, PIN attribution, shifts/cash, ESC/POS receipts).

### 4.2 Commerce core (one storefront, many doors)
- **Hosted storefront** per restaurant: menu → cart → order; modes: QR dine-in, pickup, delivery; payments COD + RAAST/bank transfer (cards when available). Their domain or ours.
- **WhatsApp**: ordering door (conversation → storefront link → cart), order-status notifications, and support rail with a conversational assistant that understands English/roman-Urdu text **and voice notes**, replying in English at launch (bilingual roman-Urdu output deferred until generation quality passes native-speaker evals — 07-F23). WhatsApp Business API.
- **Instagram**: link-in-bio/story links into the storefront; DM automation as API allows.
- **Phone/call center**: counter/call-center entry surface — caller ID → customer file → address & order history → 30-second entry; multi-branch routing to nearest branch.
- **Foodpanda**: manual quick-entry from day one; Delivery Hero POS API ingestion when partnership lands (v1 spec Module D). Same queue, channel-tagged, commission tracked for channel economics.
- **Customer file** (kernel): every channel writes to one identity (phone number as key); order history, addresses, lifetime value — the asset aggregators withhold.

### 4.3 Delivery & riders (in scope — launch requirement)
- Rider app (Android): assigned orders, address/phone, status (picked up → delivered), **COD due-back per order**.
- Dispatch surface at counter/manager: assign order → rider; batch assignment.
- Cash-with-rider settlement: rider returns, system shows expected cash, over/short recorded and attributed (same pattern as cashier shifts).
- Explicitly NOT in scope: route optimization, rider marketplace. Third-party rider APIs (Bykea-style) as fast-follow integration.

### 4.4 Supply plane
- Inventory per v1 spec Module C: locations, raw/prepared items, unit conversions, recipes (done-for-you onboarding, top 10–20 high-cost ingredients), auto-deduction through recipe chain, transfers, photo-invoice purchases with price history, guided counts, variance in PKR with attribution hints, wastage log (photo + reason).
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
- Live view + nightly summary + exception alerts + weekly/monthly reports (item profitability, channel economics net of commission/take-rate, branch comparison) per v1 spec Module B; honest sync-status always shown.
- Multi-branch roll-up; identical per-branch structure for one-glance comparison.
- **Marketing & loyalty** (in 18-month scope): WhatsApp broadcasts w/ opt-out, promos, simple loyalty, campaign-vs-lift view — riding on the customer file + WhatsApp rail.

### 4.8 Tax module
- Per v1 spec Module E, unchanged: off by default, honest FBR/PRA compliance as paid add-on, legal red line on suppression.

## 5. Explicitly OUT (first 18 months)

- **IoT / hardware sensing** (scales, temp probes, cameras) — automation law is served by side-effect capture + integrations first.
- **Full accounting & payroll computation** — clean exports for the munshi; the ledger feeds a real accounting layer later.
- Route optimization / rider marketplace (see §4.3).
- Supplier marketplace, embedded fintech (v1 spec Phase 3 — unchanged, year 2+).

## 6. Operating profiles

| Profile | Channel mix | Ops tier | What they lean on most |
|---|---|---|---|
| Cloud kitchen | 100% channels (foodpanda + own doors + phone) | No floor; kitchen queue + riders | Commerce core, dispatch, channel pulse |
| Small dine-in (5–20 seats) — **beachhead** | Dine-in + phone/WhatsApp + storefront + foodpanda | T1/T2 | Simple fabric, own channels, analyst |
| Large single-branch (100 seats) | Dine-in heavy + all channels | T3 full mesh | Floor coordination, manager console, supply |
| Scaling fast food (2–5 branches) | Everything + call center | T3 + multi-branch | Roll-up, forecasting, consistency, riders |

Profile = channel mix × hardware tier × org size, chosen at onboarding. Same kernel everywhere.

## 7. Business model

- **PKR 8,000 / branch / month** base subscription (full platform).
- **Own-channel take-rate up to 5%** on storefront/WhatsApp/QR order value — **admin-settable** per restaurant. Pitch: "foodpanda costs 30%; your own channel costs ≤5%."
- Tax compliance add-on priced separately (v1 spec §8). Done-for-you onboarding (menu, recipes, printer setup, training) bundled or one-time fee per unit economics at pilots.
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
2. **Foodpanda API access** — apply at project start; manual entry is the standing fallback (v1 spec §10.1).
3. **Analyst trust** — one confident wrong answer to an owner kills the brain's credibility; semantic-layer guardrails are non-negotiable, and the brief ships before free-form chat is promoted.
4. **Count adherence** still gates variance value (v1 spec §10.2); prep planning and low-stock value soften the ask by making counts useful to staff, not just to the owner.
5. **Pilot coverage gap** — dev-pilot restaurants cover the small-dine-in profile. Cloud kitchen, large single-branch, and multi-branch profiles need pilots recruited deliberately, or their subsystems (channel pulse, T3 mesh, multi-branch roll-up, call center) reach market launch untested in the field.

## 10. Module documentation set

Per-module software specifications live in `specs/`, one document per separable app/module — each covering purpose, functional and non-functional requirements, key flows, data, customizability, tech notes, and open questions. Start with `specs/00-platform-overview.md` (module map, shared tech stack, cross-cutting requirements, document template) and `specs/01-kernel-sync.md` (the foundation every module depends on). Build order is decided from these documents, one module at a time.
