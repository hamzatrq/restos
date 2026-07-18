# Restaurant Operating System — Product & Technical Specification

> **⚠️ SUPERSEDED (July 2026).** `restaurant-os-v2-concept.md` and `specs/00–21` are the active authority. This document remains reference **only** for POS/printing/tax/cash behavioral detail explicitly cited by the specs. In particular, the following are **obsolete here**: Urdu+English UI (now English-only), Flutter (now TypeScript/React Native/Electron), phase plan (now Waves 0–4), Starter/Growth pricing tiers (now single plan + take-rate), riders in Phase 2–3 (now Wave 2), 3-branch cap (now 5 soft), manager-as-POS-role (now dedicated console). Never resolve a conflict in this document's favor.

**Product codename:** RestOS (working name)
**Version:** Draft 1.0 — July 2026
**Market:** Small/independent restaurants and brands with up to 3 branches — Lahore, Pakistan (initial)
**Author:** Founder + research synthesis

---

## 1. Vision & Positioning

### 1.1 One-line promise

> "Know from your phone, every night, exactly what you sold, what you should have in stock and cash, and where money leaked — without your staff doing extra data entry."

### 1.2 What this product is

A restaurant-specific operating system: an **owner's profit-visibility and loss-prevention layer** with a fast, simple billing front end. It is a purpose-built restaurant ERP — not a generic ERP customization (Odoo etc.) and not "another POS."

### 1.3 What this product is not

- Not a general-purpose ERP with configurable everything.
- Not a hardware business — BYO hardware (any Android tablet / Windows PC + cheap thermal printer). No custom hardware; optionally resell tested third-party kits at cost-plus later.
- Not a delivery aggregator or a consumer app.
- Not a tax-enforcement tool. Tax handling is flexible and off by default; full FBR/PRA compliance is a faithful, paid add-on for restaurants that choose or are required to comply.

### 1.4 Why now / why us

- Founder has first-hand failure experience: a Lahore restaurant that died partly from lack of visibility into data and operations.
- The Pakistani market is crowded at the billing layer (Oscar POS, Foodnerd, Blink, Granet Pro, CISePOS, Indolj, and dozens more) but thin at the intelligence layer: automatic sales-to-inventory reconciliation, theft/pilferage detection, genuinely usable owner phone dashboards.
- Existing recipe/food-costing modules fail in the field because they demand manual upkeep small restaurants never sustain. Near-automatic data capture is the wedge.

### 1.5 Target customer

| Segment | Description | Priority |
|---|---|---|
| Independent single-branch | Dine-in/takeaway/delivery, PKR 1–5M/month revenue, owner-operated or semi-absentee | Primary |
| Small brands (2–3 branches) | Often with a central prep kitchen or shared storage | Primary |
| Documented "serious" restaurants | Tax-registered, need FBR/PRA integration | Secondary (tax add-on buyers) |

### 1.6 Success criteria (first 12 months)

- 3–5 pilot restaurants live and using billing daily within 3 months of build start.
- ≥ 25 paying locations by month 12 at PKR 3,000–8,000/branch/month.
- ≥ 70% of Growth-tier customers performing physical counts at least 3×/month (proves the reconciliation loop is adopted, not just bought).
- At least 5 documented cases of leakage caught (variance, void abuse, discount abuse) that customers attribute to the product — these become the sales stories.

---

## 2. Roles & Permissions

Roles are **permission sets, not separate apps** — in small restaurants one person wears several hats. Every role's features double as protection *for* that person ("the system proves I'm clean"), which is critical for staff adoption.

### 2.1 Role catalog

| Role | Interface | Phase |
|---|---|---|
| Owner | Mobile app (dashboard) + web back office | 1 |
| Branch Manager | POS device + limited back office | 1 |
| Cashier | POS (tablet/PC) | 1 |
| Storekeeper / Purchaser | Mobile (photo invoice capture, counts) | 1 |
| Kitchen / Chef | KOT printer (Phase 1); Kitchen Display (Phase 2) | 1 (printer) |
| Prep / Production staff | Simple production entry on shared device | 1 (schema), UI when needed |
| Waiter / Captain | Handheld ordering app | 2 |
| Rider (own delivery) | Rider app / SMS flow | 2–3 |
| Accountant (external munshi) | Exports + expense entry (web) | 1 (exports), 2 (full) |
| Marketing | Analytics views + customer data + WhatsApp broadcast | 2 |
| Customer | QR menu (1); WhatsApp/web ordering, loyalty (2) | 1–2 |

### 2.2 Permission matrix (Phase 1 core actions)

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

---

## 3. Functional Specification — Phase 1 (MVP)

Phase 1 = five modules. A feature ships in Phase 1 only if it serves the one-line promise (§1.1).

### 3.1 Module A — Fast Offline-First Billing (POS)

Table stakes. Must match incumbents on speed and simplicity; must beat them on offline reliability and attribution. Do not over-build.

**A1. Order capture**
- Order types: dine-in (table), takeaway, delivery (own), delivery (foodpanda — auto via Module D or manual channel tag).
- Menu grid: big touch targets, category tabs, item search, item photos optional. Urdu / simple-English labels; per-device language setting.
- Modifiers/variants: size, add-ons, spice level; each variant can carry its own recipe (for inventory deduction).
- Open/park orders; split bill (by item or equal split); merge tables; move table.
- Item notes to kitchen ("less spicy") free-text or quick-tags.
- Item availability toggle ("karahi finished") from POS or kitchen; greys out on all devices instantly (and syncs when online).

**A2. KOT (Kitchen Order Ticket)**
- Auto-print to one or more kitchen printers on order confirm; routing by category (grill printer vs. Chinese printer) configurable.
- Reprint and "KOT void" always logged with reason + staff PIN.
- Course grouping (starters/mains) optional, off by default.

**A3. Payments & receipts**
- Payment methods: cash, card, bank transfer/RAAST, credit (khata) with customer name; split payment.
- Receipt printing (80mm & 58mm ESC/POS); configurable header/footer/logo; optional QR (menu link or FBR invoice QR when tax module active).
- Channel + payment method captured on every order (feeds tax logic and dashboard).

**A4. Staff attribution & controls**
- Per-user PIN login on every device; auto-lock after N seconds idle (configurable).
- Every action is attributed: order created, item added/removed, discount, void, comp, reprint, cash drawer open, settlement.
- Manager-PIN escalation for voids after KOT, comps, discounts above threshold, price overrides.
- No-sale drawer opens logged and counted (classic theft vector).

**A5. Shifts & cash management**
- Day open: opening float entry by manager.
- Shift close per cashier: system-expected cash vs. counted cash; over/short recorded and attributed; cashier sees their own reconciliation ("I'm clean") — this is the staff-protection framing.
- Day close: manager cash count, deposit record, auto-summary sent to owner (Module B).
- Paid-outs/petty cash from drawer with reason + receipt photo.

**A6. Offline-first operation (non-negotiable)**
- 100% of billing functions work with zero internet: order, KOT, receipt, settlement, shift close.
- Local-first storage on each device; background sync when connectivity returns; multi-device sync within a branch over LAN even when WAN is down (see §7).
- Power-loss safety: an order confirmed is an order persisted — journaled writes; device crash/restart never loses a confirmed order.

**A7. Hardware compatibility (BYO)**
- Android 10+ tablets/phones (target: PKR 20–40k devices, 2–3GB RAM must be usable).
- Windows 10+ PCs (many restaurants have an old PC at the counter).
- ESC/POS thermal printers 58mm & 80mm over USB, Bluetooth, Wi-Fi/Ethernet (Black Copper and generic Chinese brands are the field reality).
- Cash drawer trigger via printer RJ11.
- No proprietary hardware. Ever.

### 3.2 Module B — Owner Phone Dashboard (the wedge)

The buyer's product. Everything here is a read model over data Modules A/C/D already capture — zero extra staff work.

**B1. Nightly auto-summary (push notification + in-app, ~9 pm–close configurable)**
- Sales total & count by channel (dine-in / takeaway / own delivery / foodpanda).
- Cash expected vs. counted (over/short, by cashier).
- Voids, comps, discounts: count, value, and by whom.
- Top 5 items by revenue; hourly sales curve.
- Purchases logged today (value) and wastage logged.
- One-line profit signal when recipe data exists: "Estimated gross margin today: 61%."

**B2. Live view**
- Today-so-far sales ticker; open tables/orders count; per-branch tiles.
- Works read-only from anywhere; degrades gracefully if branch is offline (shows "last synced 22 min ago" honestly — never silently stale).

**B3. Exception alerts (push)**
- Void/comp spike: "> N voids in a shift" or "voids > X% of sales" (thresholds configurable, sane defaults).
- Discount anomaly by cashier vs. their own baseline and branch baseline.
- Cash variance beyond threshold at shift close.
- Stock variance alert after each physical count (from Module C): "Chicken: 4.2 kg unaccounted this week ≈ PKR 2,900."
- Price-spike alert on supplier purchase ("chicken 680/kg vs 620 last week").
- No-sale drawer opens above threshold.

**B4. Reports (weekly/monthly, kept deliberately few)**
- Item profitability: revenue, theoretical food cost, margin per item (needs Module C data).
- Branch comparison (up to 3 branches side by side): sales, food cost %, variance, labor cost (labor in Phase 2).
- Channel economics: foodpanda vs. own delivery vs. dine-in net of commission (commission % configurable per channel).
- Export any report to Excel/CSV/PDF (also serves the accountant).

**B5. Multi-branch**
- Roll-up totals + drill into a branch; identical structure per branch so comparison is one glance.

### 3.3 Module C — Inventory-to-Sales Reconciliation (the moat)

Design principle: **the staff's day adds at most two new habits** — photographing purchase invoices and a periodic guided count. Everything else is automatic.

**C1. Item & location model**
- Locations: branch, kitchen/prep area, storage/godown — stock always exists *at a location*.
- Item types: raw ingredient (chicken, oil, flour) and prepared/semi-finished (marinated boti, dough, sauce base).
- Units with conversions (kg↔g, litre↔ml, purchase unit "bag of 10kg" → stock unit kg).

**C2. Recipes (set up once, by the vendor)**
- Menu recipe: sold item → raw + prepared ingredients with quantities.
- Prep recipe: raw items → prepared item with yield % ("18 kg raw meat → 15 kg marinated boti").
- Recipe setup is a **done-for-you onboarding service** — the vendor's team maps recipes with the chef in 1–2 sessions. Owners never do recipe data entry. This is the adoption unlock and the switching-cost builder.
- Scope discipline: onboard the **top 10–20 high-cost ingredients only** (typically meat, chicken, oil, cheese, ghee — usually ~70% of food cost). Full-menu costing is where competitors' modules die. Expand coverage later per customer appetite.

**C3. Automatic deduction**
- Every sale (including foodpanda-ingested orders) auto-deducts through the recipe chain at the selling location.
- Prep production entry ("made 15 kg boti from 18 kg raw") — two taps on a shared device — consumes raw, produces prepared, applies yield. Under the hood this is a manufacturing order; the word "manufacturing" never appears in UI.
- Transfers: "sent 20 kg chicken to Gulberg branch" creates an in-transit record; receiving branch confirms → stock moves. Discrepancies at receipt are flagged, not silently absorbed.

**C4. Purchases**
- Photo-capture supplier invoice → storekeeper confirms item, qty, price from a smart-default form (recent supplier + recent price prefilled). OCR assist is Phase 2; Phase 1 is prefill + fast manual confirm.
- Supplier ledger: price history per item, amounts payable (simple khata; full payables in Phase 2).

**C5. Physical count & variance (the payoff)**
- Guided count on a phone: only the tracked high-cost items, in storage-layout order, tap-to-enter quantities. Target: ≤ 15 minutes, 2–3×/week.
- Variance report per item: opening + purchases + transfers-in − theoretical consumption − wastage − transfers-out = expected closing; vs. counted. Gap valued in PKR.
- Variance attribution hints: "gap concentrated on days X, Y" / "gap exceeds all voids+wastage logged" — the system narrows suspicion (theft vs. waste vs. supplier short-delivery vs. over-portioning) without accusing anyone.
- Wastage log: photo + qty + reason, any staff, always available (so "we threw it away" is provable, protecting honest staff).

**C6. Stock intelligence**
- Low-stock alerts on tracked items (par levels set at onboarding).
- Daily consumption view for the chef ("what sold → what to prep") — read-only, no data entry.

### 3.4 Module D — Foodpanda Order Ingestion

- Integration via Delivery Hero POS API (Pakistan is a supported country); menu mapping foodpanda-item → POS-item done at onboarding.
- Orders flow into the same order stream: appear on POS, print KOT, deduct inventory, land in dashboard under the foodpanda channel with commission % applied for channel-economics reporting.
- Acknowledge the default "indirect flow" reality: order acceptance may still happen on the foodpanda tablet; our job is to eliminate re-keying, not necessarily the tablet. Tablet-free direct flow pursued case-by-case.
- Fallback when API access is delayed for a customer: 30-second manual "foodpanda order" entry mode (channel-tagged quick order with mapped items) so channel reporting and inventory still work.
- Risk hedge: if API access tightens market-wide, pull Phase 2 WhatsApp/QR direct ordering forward.

### 3.5 Module E — Flexible, Tax-Optional Billing

- Tax **off by default**. Owner configures tax behavior per channel and per payment method.
- Internal "true" numbers are always complete for the owner regardless of external reporting posture — decisions are never made on partial data.
- **FBR + PRA compliance add-on (paid module):** when enabled, it is fully faithful — real-time invoice fiscalization, FBR invoice number + QR on receipt, correct PRA rate handling (currently 16% cash / 8% card-digital under Punjab Finance Act 2025 — rates configurable, verified against current notifications at build time), returns-ready reports.
- **Legal red line:** the product never implements sales suppression, dual-billing, or under-reporting mechanics in the compliant path, and never markets concealment as a feature. Vendors that build "skimming" into software face penal provisions under the Sales Tax Act. Tax-optional = the owner controls what the system charges and reports; the compliant module, when on, is honest end-to-end.

---

## 4. Later Phases (functional summary)

### Phase 2 (months ~6–14, pulled by customer demand)
- **WhatsApp + QR direct ordering:** hosted menu page per restaurant, order via WhatsApp deep-link/web checkout, no app install; captures customer phone numbers (which foodpanda withholds). Chips at 15–35% aggregator commission for repeat customers.
- **Customer CRM & loyalty:** auto-built customer file from delivery/khata orders; visit/order history; simple loyalty ("5th deal free"); WhatsApp broadcast campaigns with opt-out; campaign-vs-sales lift view for the marketing person.
- **Waiter/captain handheld app:** tableside ordering to KOT, table map, item availability live, per-waiter sales/tips.
- **Kitchen Display System (KDS):** cheap Android screen replacing/augmenting KOT printer; order aging, bump, prep station views.
- **Labor:** attendance (PIN/selfie clock-in), shift schedules, overtime flags, basic payroll export; labor cost on the branch comparison report.
- **Menu engineering:** contribution margin × popularity quadrants; price-change what-if.
- **Purchasing upgrades:** invoice OCR, auto-PO suggestions from par levels, supplier payables aging.
- **Accountant workspace:** expense entry (rent, utilities, salaries), full P&L per branch, clean exports.

### Phase 3 (year 2+)
- **Central kitchen / commissary at scale:** branch indenting (daily request lists), production planning from aggregate demand, inter-branch transfer workflows with cost flow.
- **Own-fleet delivery:** rider app, order assignment, cash-with-rider settlement, delivery time tracking.
- **AI anomaly detection:** learned baselines per cashier/branch/item; theft-pattern detection (receipt reuse, void-after-payment sequences).
- **Supplier marketplace / group buying** for tracked commodity items.
- **Embedded fintech:** payments acceptance, working-capital advances against sales history (the Foodics playbook) — only on top of a large installed base.

---

## 5. Data Model (core entities)

The schema thinks like an ERP; the UI hides it. Getting this right first is the cheapest insurance against a rewrite.

### 5.1 Organization & access
- **Organization** (the brand) → **Location** (type: branch | prep_kitchen | storage) → **Device** (registered POS/back-office devices per location).
- **User** (belongs to organization) × **Role** × per-location assignment; PIN (hashed) per user; permission overrides per user.

### 5.2 Catalog
- **Category** → **MenuItem** → **Variant** (size/type) → **ModifierGroup/Modifier**.
- **MenuItem/Variant ↔ Recipe** (menu recipe); **PreparedItem ↔ PrepRecipe** (with yield %).
- **InventoryItem** (type: raw | prepared; base unit; unit conversions; par level per location; is_tracked flag — only tracked items participate in counts/variance).
- **Supplier**; **SupplierItemPrice** (history).

### 5.3 Transactions (all append-only)
- **Order** (location, channel, table, order_type, created_by, status timeline) → **OrderLine** (item, variant, modifiers, qty, price, added_by, kot_printed_at) → **Payment** (method, amount, received_by).
- **VoidRecord / CompRecord / DiscountRecord** — linked to order/line, with reason, actor, approver. Never mutate the original line.
- **Shift** (cashier, opening float, expected vs counted cash, over/short) ; **BusinessDay** (open/close, manager count, deposit).
- **PurchaseInvoice** (supplier, photo ref, lines with qty/price) ; **StockTransfer** (from-location, to-location, lines, sent/received quantities, discrepancy) ; **ProductionRecord** (prep recipe, input qty, output qty, actual yield) ; **WastageRecord** (item, qty, reason, photo, actor) ; **PhysicalCount** (location, lines: counted qty) ; **StockMovement** — the unifying ledger: every purchase, sale-deduction, transfer, production, wastage, and count-adjustment writes movements (item, location, qty ±, source document ref).
- **AuditLog** — every privileged action (logins, drawer opens, reprints, threshold overrides, setting changes), immutable, synced to cloud.

### 5.4 Derived / read models
- Daily sales aggregates per branch/channel/hour/item (powers dashboard cheaply).
- Theoretical consumption per item per day (from sales × recipes).
- Variance = ledger-expected vs counted, valued at moving-average cost.

### 5.5 Sync-critical design decisions
- All primary keys are client-generated UUIDs (offline creation must never collide).
- Every record carries: device_id, created_at (device clock), server_received_at, logical sequence per device (Lamport-style counter) — server time is authoritative for reporting; device sequence is authoritative for ordering a device's own events.
- Money in integer paisas; quantities in integer milligrams/millilitres (no floating point in ledgers).
- Soft references tolerate out-of-order arrival (an order may sync before the shift record it belongs to).

---

## 6. Technical Requirements

### 6.1 Platform targets

| Component | Target | Notes |
|---|---|---|
| POS app | Android 10+ (2GB RAM usable), Windows 10+ | Single codebase strongly preferred (e.g., Flutter) |
| Owner app | Android + iOS | iOS matters: many owners carry iPhones even when the shop runs cheap Android |
| Back office | Responsive web | Menu setup, recipes, reports, exports |
| Backend | Cloud API + sync service | Single region acceptable initially; Pakistan-latency-friendly (ME/SG region) |

### 6.2 Offline-first architecture (the hard requirement)

- **Local-first database on every POS device** (e.g., SQLite); the device is fully functional standalone indefinitely.
- **Sync model:** event/append-based replication, not row overwrites. Each device pushes its event log; server merges; devices pull merged state. Because transactional records are append-only (§2.2 hard rule), true conflicts are rare by design.
- **Conflict rules (explicit):**
  - Same table, two devices adding items → merge lines (both valid).
  - Counter stock going negative from offline oversell → allow, flag, reconcile at next count (never block a sale over inventory math).
  - Menu/price edits → last-writer-wins with audit trail; price used on an order is the price snapshotted on the order line, never re-derived.
- **Branch LAN sync:** devices within a branch sync peer-to-peer or via an elected primary device over local Wi-Fi when WAN is down, so table state and item-availability stay coherent during outages.
- **Durability:** write-ahead journaling; a confirmed order survives instant power loss (test: pull the plug mid-print).
- **Sync status honesty:** every screen that shows remote data displays last-synced time; the owner dashboard never presents stale data as live.

### 6.3 Printing

- ESC/POS over USB, Bluetooth SPP/BLE, and network (9100) — 58mm and 80mm.
- Printer abstraction layer + printer test harness; maintain a compatibility list built from field devices (Black Copper BC-58U/85AC and generic Chinese printers are the installed base).
- Print spooler with retry + failure alert on device ("KOT did not print — grill printer offline") — silent KOT failure is a lost order and a support fire.
- Urdu on receipts: render text as bitmap when the printer lacks the font (most do).

### 6.4 Performance targets

- Order line add → UI feedback: < 100 ms on a PKR 25k Android tablet.
- Order confirm → KOT printing starts: < 2 s.
- POS cold start: < 6 s on target hardware.
- Owner dashboard load (cached): < 2 s; nightly summary computation server-side, pushed.
- Sync catch-up after 8 hours offline with ~500 orders: < 60 s on 4G.

### 6.5 Security

- TLS everywhere; per-device registration tokens (a stolen tablet is revoked from back office).
- PINs hashed; lockout after repeated failures; owner-visible login history.
- Role-based API authorization server-side (never trust the client's role claim).
- Cloud backups: point-in-time recovery ≥ 30 days; org data export on demand (owner owns their data — also a sales point against lock-in fears).
- Audit log immutable and tamper-evident (hash-chained per device).

### 6.6 Reliability & support

- Target: zero data loss, ever; billing availability is device-local so cloud downtime never stops sales.
- Remote diagnostics: device heartbeat, app version, printer status, sync lag visible to support staff.
- In-app WhatsApp support button (support happens on WhatsApp in this market, in Urdu).
- Update strategy: staged rollouts; POS must never force-update during business hours.

### 6.7 Localization & UX constraints

- Urdu + English UI, per-device; numerals stay Western.
- Assume low training: any core cashier flow learnable in < 15 minutes; max 2 taps from menu grid to KOT for a simple order.
- All owner-facing money values in PKR with thousands separators; no decimals unless meaningful.

### 6.8 Integrations (Phase 1)

- Delivery Hero / foodpanda POS API (order ingestion, menu availability push). Apply for API partnership at project start — lead time is a schedule risk.
- FBR IMS + PRA e-invoicing (tax add-on): real-time fiscalization with store-and-forward queue for offline periods, per current FBR technical specs (verify at build time).
- Export surface: CSV/Excel for everything; PDF for reports. No accounting-software integration in Phase 1 (the munshi works in Excel).

---

## 7. Non-Functional Requirements Summary

| Attribute | Requirement |
|---|---|
| Offline operation | 100% of billing functions, indefinite duration |
| Data loss | Zero for confirmed transactions, including power loss |
| Multi-branch | Up to 3 branches + prep/storage locations per org (schema supports more) |
| Devices per branch | Up to 5 concurrent POS devices, LAN-coherent |
| Auditability | Every privileged action attributable and immutable |
| Language | Urdu + English throughout staff-facing UI |
| Hardware | BYO; no proprietary hardware; PKR 25k Android tablet is the reference device |
| Privacy | Customer phone numbers belong to the restaurant org; never shared across orgs |

---

## 8. Packaging & Pricing (from market research)

| Tier | PKR / branch / month | Includes |
|---|---|---|
| Starter | ~3,000 | Billing (Module A) + Owner dashboard (Module B) |
| Growth (target plan) | ~6,000–8,000 | + Inventory reconciliation (C), foodpanda ingestion (D), theft/variance alerts, multi-branch roll-up |
| Tax add-on | +2,000–3,000 | FBR + PRA compliance module (E) |
| Onboarding | Free (Growth) or one-time PKR 15,000–25,000 if unit economics require | Done-for-you menu, recipe mapping (top items), printer setup, staff training |

Terms: monthly, cancel anytime (high-churn market); annual = 2 months free. Hardware BYO; optional tested-kit resale at cost-plus.

---

## 9. Build Plan & Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0 — Validation (wk 1–3) | Figma owner-dashboard mockups; 15–20 owner interviews; recruit 3–5 pilots | ≥ 5 owners say yes at PKR 6k/mo; count-willingness tested |
| M1 — Foundations (wk 3–6) | Data model; offline sync spike (2 devices, offline orders, clean merge); ESC/POS printing spike on cheap tablet | Plug-pull test passes; printers print |
| M2 — Billing core (wk 6–12) | Module A minimal + PIN attribution + shifts | One pilot restaurant billing daily |
| M3 — Dashboard (wk 10–14) | Module B nightly summary + live view + first alerts | Owners checking phone nightly unprompted |
| M4 — Inventory loop (wk 12–20) | Module C: recipes (onboarded), deduction, purchases, guided count, variance | First variance report a pilot owner acts on |
| M5 — Foodpanda + hardening (wk 18–24) | Module D (API or fallback); stability, support tooling | 5 pilots stable; begin paid conversion |
| M6 — Tax module | Module E compliance add-on | Built when first documented customer commits |

---

## 10. Open Questions & Risks

1. **Foodpanda API access timeline** — apply immediately; fallback manual-entry mode specified (§3.4); if access tightens market-wide, pull WhatsApp/QR ordering forward.
2. **Count adherence** — the moat depends on staff doing 15-minute counts 2–3×/week. Validate in M0; mitigation: owner-visible "count skipped" nags, and design counts around storage layout.
3. **Onboarding cost** — done-for-you recipe setup may not scale at PKR 6k/month; measure hours per onboarding at pilots; switch to one-time fee if needed.
4. **FBR/PRA spec drift** — tax rates and technical specs change (5%→8% card rate in 2025); build rates/rules as configuration, verify notifications before tax-module build.
5. **Granet Pro and similar** — closest local competitor; differentiate on depth of variance/theft analytics and Urdu-first support quality; mystery-shop before launch pricing is final.
6. **Team** — this spec assumes at least one strong engineer experienced with offline-sync systems; the sync layer is the highest-skill component. Decide build-vs-hire-vs-cofounder before M1.

---

*End of specification. Companion document: market research report ("Restaurant Operating System for Lahore's Independent Restaurants: Market & Product Plan").*
