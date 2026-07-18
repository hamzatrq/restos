# 10 — Inventory & Supply

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md` (ledger, catalog, sync contracts). Seed: `restaurant-os.md` Appendix D — carried over wholesale unless amended here. Wave 3; prep planning and forecasting thicken into Wave 4.

## 1. Purpose & scope

The supply plane: theoretical stock maintained by recipe-chain deduction from the sales exhaust, purchasing with supplier ledger, production of prepared items, inter-location transfers, wastage logging, guided physical counts with PKR-valued variance, demand-driven prep planning, and a simple explainable forecasting service.

- **Who uses it:** storekeeper/purchaser (photo invoices, counts, transfers), chef/prep staff (prep suggestions, production entry), branch manager (alerts, discrepancies), owner (variance/purchase/wastage views via doc 12). Recipes and par levels are set up by the vendor onboarding team via doc 15 tooling — **owners never do recipe data entry**.
- **Runs on:** cloud service (deduction, variance, forecasting) + back office UI (doc 14) + mobile flows on branch devices (docs 02/05 host the count, invoice, wastage, production surfaces).
- **Tiers/profiles:** all tiers. Value is gated by tracked-item onboarding, not hardware tier. Multi-branch orgs additionally get transfers between branch/prep_kitchen/storage locations.
- **Discipline (`restaurant-os.md` Appendix D, binding):** track only the top 10–20 high-cost ingredients (~70% of food cost). Staff gain at most two new habits: photographing purchase invoices and the periodic guided count. Everything else is a side-effect or derived.

## 2. Position in platform

- **Events consumed:** `order.created / line_added / line_state_changed / channel_tagged` (all channels, incl. foodpanda via doc 08), `void.recorded`, `comp.recorded` (consumption logic 10-F7), `cash.paid_out` (supplier payments), `shift.opened/closed`, `day.opened/closed` (daypart bucketing), catalog reference versions (recipes, `InventoryItem`, par levels — 01-F21).
- **Events emitted:** `stock.*` family (01 §4) plus extensions listed in §5.
- **Serves:** doc 05 (low-stock, discrepancy, count-overdue alerts on manager console), doc 12 (variance, purchases, wastage, planning views), doc 13 (forecast read model, anomaly foundations; the auto-86 autonomy rung consumes stock levels — it lives in doc 13, not here), doc 15 (onboarding tooling writes recipes/pars into the catalog).
- **Requires:** object storage (invoice/wastage photos), jobs service (nightly forecast/prep runs on BullMQ).

## 3. Functional requirements

**Stock model & automatic deduction**
- 10-F1 Stock always exists at a location (branch | prep_kitchen | storage — 01-F25 types). Item types: raw | prepared. Unit conversions purchase unit → stock unit (e.g. "bag of 10 kg" → kg); quantities are integer mg/ml/units (00 §6).
- 10-F2 Only items with `is_tracked` participate in deduction, counts, variance, and alerts. Untracked items exist in the catalog but generate zero inventory workload.
- 10-F3 Every sale on every channel deducts theoretical stock through the recipe chain (menu recipe → raw + prepared; prepared → prep recipe) at the selling location. Trigger point is kitchen commitment (KOT print / line confirm; ingestion-confirm for aggregator orders), channel-agnostic. *(Automation law: side-effect of billing.)*
- 10-F4 Physical actions (purchase, transfer, production, wastage, count adjustment) are kernel events and are never recomputed. Sale deductions are **derived** movement rows in the read model, each citing order line id + recipe version — recomputable when a recipe mapping is corrected. The order stream is the fact; deduction is math.
- 10-F5 Theoretical stock may go negative (offline oversell, coverage gaps) — allowed and flagged, never blocks a sale (01-F17); reconciled at next count.
- 10-F6 Moving-average cost per item per location, integer paisas per base unit, updated on each purchase receipt. All PKR valuations in this module use it.
- 10-F7 Post-KOT voids and comps still consume stock (the food was made); pre-KOT line removals do not. Variance attribution (10-F19) relies on this distinction.
- 10-F8 Sold items with no recipe mapping are listed as coverage gaps; their deduction is skipped and the variance report states recipe-coverage % of sales, so gaps are never misread as theft.

**Production (prep)**
- 10-F9 Two-tap production entry on a shared device: "made 15 kg boti from 18 kg raw" — consumes raw, produces prepared, applies prep-recipe yield %, records actual yield → `stock.production_recorded`. The word "manufacturing" never appears in any UI. *(Side-effect — normally of confirming a prep suggestion, 10-F23.)*
- 10-F10 Actual vs recipe yield is tracked per prep recipe; sustained deviation beyond a configured % raises a flag consumed by doc 13.

**Transfers**
- 10-F11 Sender records a transfer → `stock.transfer_sent` → stock enters in-transit state; receiving location confirms quantities → `stock.transfer_received` → stock lands. *(Side-effect of a hand-off both ends already perform.)*
- 10-F12 Received ≠ sent → discrepancy captured on the receive event, flagged to manager (doc 05) and fed to variance attribution. Never silently absorbed.

**Purchases & suppliers**
- 10-F13 Photo-capture supplier invoice → smart-default confirm form: recent supplier, that supplier's recent items and last prices prefilled; storekeeper confirms item/qty/price → `stock.purchase_recorded` with photo ref. Works offline; photo uploads deferred. *(Ingestion: the invoice exists anyway; capture is photograph + confirm.)*
- 10-F14 Supplier ledger: price history per supplier+item; payables khata (invoice totals vs payments, running balance). A supplier payment from the drawer rides `cash.paid_out` with a supplier ref — one action, both ledgers. *(Side-effect.)*
- 10-F15 Price-spike detection: unit price above trailing average for that supplier+item by more than a configured % → `stock.price_spike_flagged` ("chicken 680/kg vs 620 last week"), surfaced in docs 05/12.

**Wastage**
- 10-F16 Wastage log available to any staff: item, qty, reason (quick-tags + optional note), photo → `stock.wastage_recorded`. Staff-protection framing: "we threw it away" is provable. *(Side-effect of disposal; unlogged wastage is caught by the count ritual, which is the backstop.)*

**Guided count & variance**
- 10-F17 Guided count on a phone/tablet: tracked items only, presented in per-location storage-layout order, tap-to-enter quantities; target ≤ 15 min; resumable within the same business day → `stock.count_recorded`. *(Scheduled verified ritual.)*
- 10-F18 Variance per item for the period since last count: opening + purchases + transfers-in − theoretical consumption − wastage − transfers-out = expected closing; vs counted. Gap valued in PKR at moving-average cost.
- 10-F19 Attribution hints, never accusation: "gap concentrated on days X, Y", "gap exceeds all voids+wastage logged", transfer-discrepancy correlation, steady-small-gap over-portioning signature. The count writes an adjustment movement referencing the count event, resetting the theoretical baseline.
- 10-F20 Count schedule per org (2–3×/week presets). An overdue count raises `stock.count_overdue_flagged` to manager/owner — the count-skipped nag backing risk §9.4 (`restaurant-os.md`).

**Alerts**
- 10-F21 Low stock: theoretical level below par (per item per location) → `stock.low_level_flagged`, deduped per item per business day, surfaced docs 05/12. Automatic 86-ing is doc 13's autonomy ladder, not this module.

**Prep planning (new beyond v1)**
- 10-F22 Nightly prep suggestions per prepared item per location from sales history by weekday/daypart: trailing K-week same-weekday moving average of demand, pushed through the recipe chain to raw/prepared quantities. Every suggestion carries its evidence: "last 4 Fridays sold 43, 41, 39, 46 karahis → marinate 25 kg tonight."
- 10-F23 Suggestions are suggestions: the chef confirms or adjusts, and **that confirmation is the production entry** (10-F9) — no separate acknowledgment step; an unconfirmed suggestion never becomes a stock fact. *(The resulting fact is a side-effect of the confirm.)*
- 10-F24 Below minimum history (default: 3 same-weekday observations with recipe coverage) the surface says "not enough data yet" (design law 6) and shows plain recent consumption instead of a suggestion.

**Forecasting service (new beyond v1)**
- 10-F25 Demand forecast per item / daypart / channel / location: trailing moving averages with weekday seasonality only. Every forecast number can cite its input window. No opaque models here — anything smarter is doc 13's layer.
- 10-F26 Purchase suggestions: par levels + forecast + current theoretical stock + supplier lead-time presets → suggested order quantities per supplier. Draft-PO and auto-reorder autonomy belong to doc 13's ladder; this module only computes and displays.
- 10-F27 The forecast read model is versioned per nightly run and consumed by docs 12 (planning views) and 13 (brief, analyst citations).

**Automation-law register (00 §5.8)** — every capture in this module, classified:

| Capture | Class |
|---|---|
| Sale deduction | side-effect (billing) |
| Production entry | side-effect (prep confirm / direct entry) |
| Transfer send/receive | side-effect (physical hand-off) |
| Purchase invoice | ingestion (photo + confirm) |
| Supplier payment | side-effect (`cash.paid_out`) |
| Wastage | side-effect (disposal; count ritual backstops) |
| Physical count | scheduled verified ritual |
| Recipes, pars, storage layout | onboarding configuration (doc 15), not runtime capture |

No discretionary data entry is introduced.

## 4. Key flows

**Flow A — Sale → deduction (fully automatic)**
1. Order line reaches kitchen commitment on any channel (KOT print / ingestion-confirm).
2. Event replicates to cloud (doc 01); the inventory fold resolves the recipe version effective at the event time.
3. Derived movement rows written (menu recipe → raw + prepared components; prepared components resolve through prep recipes for costing only — prepared stock itself moves on production, not sale).
4. Stock level updated at the selling location; par check runs; `stock.low_level_flagged` if breached and not already flagged today.
5. *Failure — no recipe:* item lands on the coverage-gap list; no movement written; variance report shows coverage %, so the gap is never misread as theft.
6. *Failure — WAN down for days:* nothing is lost; folds catch up on reconnect; device stock views show last-synced age (00 §5.7).

**Flow B — Purchase**
1. Storekeeper taps "purchase", photographs the invoice (offline OK; photo queued).
2. Smart-default form opens: last-used supplier preselected, that supplier's recent items with last prices prefilled.
3. Storekeeper confirms/edits item, qty (purchase units, converted), price; submits → `stock.purchase_recorded` with photo ref.
4. Moving-average cost updates; price-spike check runs (`stock.price_spike_flagged` if tripped); supplier khata balance updates.
5. *Failure — upload pending:* the record stands and deducts into ledgers immediately; the photo badge shows "uploading" until done.

**Flow C — Evening prep (suggestion → production)**
1. Nightly job publishes prep suggestions per prepared item per location, each with its evidence line.
2. Chef opens the prep list on the station device: "last 4 Fridays sold 43 karahis → marinate 25 kg tonight".
3. Chef confirms 25 kg or edits the quantity — this confirmation IS the production entry (10-F23).
4. `stock.production_recorded` (suggestion ref attached): raw consumed, prepared produced, actual yield captured.
5. *Failure — no confirmation:* the suggestion expires at day close; no stock fact is ever created from an unconfirmed suggestion.

**Flow D — Transfer with discrepancy**
1. Sender records items/quantities → `stock.transfer_sent`; stock moves to in-transit.
2. Receiver opens pending transfers, confirms received quantities → `stock.transfer_received`.
3. Received ≠ sent → discrepancy on the receive event → manager alert (doc 05); both locations' variance windows annotated.
4. *Failure — never received:* transfer stays in-transit and is flagged after a configured staleness window; in-transit stock belongs to neither location's count.

**Flow E — Guided count → variance**
1. Storekeeper/manager starts the count; items appear in storage-layout order, tracked items only.
2. Tap-to-enter each quantity (≤ 3 taps per item); resumable within the business day.
3. Submit → `stock.count_recorded` → variance report computed (< 30 s, 10-N3): expected vs counted per item, PKR-valued.
4. Attribution hints attached; owner alerted if the gap exceeds the org threshold; adjustment movement resets the baseline.
5. *Failure — count abandoned:* partial entries persist for same-day resume; an abandoned count writes nothing and the overdue clock keeps running.

## 5. Data

- **Entities owned (cloud read models, rebuildable per 01-F7):** `stock_levels` (item × location), `stock_movements` (fact rows from events + derived deduction rows, marked `derived`, both citing sources), `purchase_invoices`, `supplier_ledger`, `supplier_item_prices`, `production_records`, `transfers`, `wastage_records`, `counts`, `variance_reports`, `prep_suggestions`, `forecast_runs`. Photos in object storage, refs in rows.
- **Catalog entities referenced, not owned:** `InventoryItem`, recipes, prep recipes, pars, `Supplier` (01-F21; edited via docs 14/15).
- **Events emitted (from 01 §4):** `stock.purchase_recorded / transfer_sent / transfer_received / production_recorded / wastage_recorded / count_recorded / movement_recorded` (manual adjustment only).
- **Events added to the 01 §4 catalog by this spec:** `stock.price_spike_flagged`, `stock.low_level_flagged`, `stock.count_overdue_flagged`.
- **Events consumed:** listed in §2.

## 6. Non-functional requirements

Cross-cutting NFRs inherited from 00 §5. Module-specific:

- 10-N1 Deduction lag: order event received at cloud → derived movement visible < 60 s p95.
- 10-N2 Count entry: 20 tracked items completable ≤ 15 min on reference hardware; ≤ 3 taps per item entry.
- 10-N3 Variance report available < 30 s after the count event reaches the cloud.
- 10-N4 Invoice/wastage photos compressed client-side ≤ 300 KB; capture never blocked by connectivity; upload via deferred queue.
- 10-N5 Nightly forecast + prep-suggestion job completes fleet-wide (200 branches, 01-N4 scale) within a 30-min window.
- 10-N6 Recipe-correction recompute: re-deriving 90 days of theoretical consumption for one org < 5 min, without blocking live folds.

## 7. Customizability

- **Layer 1 (platform admin):** feature flags for prep planning / forecasting (staged rollout), forecast job window, onboarding tooling access (doc 15).
- **Layer 2 (org, back office):** tracked-item set, recipes, prep recipes, pars, storage-layout order — all via doc 15 onboarding tooling with the vendor team, never free-form owner entry; count schedule preset; price-spike %; yield-deviation %; variance alert threshold (PKR); supplier lead-time presets; wastage quick-tag set.
- **Layer 3 (branch/device):** which station device shows the prep list / hosts the count flow (station identity).
- **Deliberately not configurable:** the variance formula; deduction cannot be disabled per channel or per item while tracked; append-only movements; prep suggestions are suggestion-only (no auto-production at any config); UI vocabulary (the word "manufacturing" never appears).

## 8. Tech notes

- Lives as the `inventory` module inside the modular Node backend (00 §3 — no microservices); read models in Postgres via Drizzle; `stock_movements` partitioned org+month like the event table.
- Deduction is a deterministic fold keyed by (order line id, recipe version) — idempotent, replayable, property-tested alongside 01-N1.
- Moving-average cost arithmetic: integer paisas, round half-up at movement granularity; property test proves no cumulative drift vs exact rational computation.
- Statistics are pure TS (no ML dependencies): trailing means + same-weekday seasonality; every suggestion/forecast stores its input points as JSON for UI evidence and doc 13 citations.
- OCR for invoices deliberately deferred (see §9); the prefill + fast-confirm form is the shipped baseline (`restaurant-os.md` Appendix D).
- Count and invoice flows get Maestro tests; the rush-simulation replay (00 §4) is extended with an inventory-fold determinism assertion.

## 9. Open questions

1. Invoice OCR assist — when to add, and on-device vs cloud (cost/latency vs privacy of supplier pricing).
2. Daypart boundaries: platform-wide preset (lunch / evening / late) vs org-adjustable — bias to preset.
3. Prepared-item shelf-life/expiry tracking — currently out; revisit if pilot wastage patterns demand it.
4. Central-kitchen indenting and production planning at multi-branch scale (year-2+ scope) — this module's transfer + forecast primitives are the substrate; where the workflow lands is undecided.
5. Whether derived deduction rows should be periodically checkpointed as events for external audit export, or remain projection-only.
