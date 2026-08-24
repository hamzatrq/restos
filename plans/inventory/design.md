# Inventory & Supply — design and build plan

**Status:** design, not approved. No code, no spec edit, nothing staged.
**Authority:** `restaurant-os.md` Appendix D (seed, binding) → `specs/10-inventory-supply.md` (27 FRs, the contract) → `specs/01-kernel-sync.md` (ledger, catalog, reference data) → `14-F9`/`14-F10` (the editors) → this document.
**Ruling applied:** **R34** — *"follow the mainstream and global giants … steal like an artist."* Every structural choice below names the product it is taken from.

**Measured starting point (2026-08-24, comment-blind `grep -a` on `1beafcf`).** `specs/10` = 27 FRs, 161 lines. `packages/domain/src/registry.ts` = 49 payload schemas, **zero `stock.*`**. `packages/sync-client/src/folds/` = 3 folds, none inventory. So this is green-field code against a written contract — but **less green-field than it looks**: `01 §4` already holds all ten `stock.*` event types; `PERMISSION_ACTIONS` already holds `stock.receive`, `stock.count_entry`, `stock.wastage_record`, `catalog.edit_recipes` with role rows; `packages/domain/src/money.ts` already exports `mg`/`ml`/`units` carrying `@unreached-owed` markers that name `specs/10`. **Slice 1 below invents zero event types and zero permission actions.**

---

## 1. The founder's list, item by item

Every noun gets a home or an explicit deferral with a reason. ⚠ marks the four items that need a spec act before they can be built.

| # | His word | Our name | Verdict |
|---|---|---|---|
| 1 | vendor records | **Supplier** | Covered — `10-F13`/`10-F14`/`10-F15`, `01-F21`. ⚠ **Never call it "vendor" in a spec or a schema:** in this corpus "vendor" means RestOS-the-software-vendor (`10 §1` *"vendor onboarding team"*, `15-F9`, R46's *"vendor invite code"*). Same word, three live meanings. |
| 2 | customer records, an order against a customer by phone | **Customer file** (`01-F23`) + an **order→customer link** | Half covered, half ⚠ **absent in code AND corpus**. The file ships: `customer.created`/`customer.address_added` schemas, an E.164 key, the seventh device fold, `customer.record` (`02-F47`), a caller strip on the counter. **No event can say which customer an order is for** — `order.created` is `{order_id, channel, order_type?, table_id?}`. Two FRs already presuppose the link and cannot be built: `02-F10` (search open orders by customer phone) and `02-F14` (khata *requires* a linked customer). **Not this module's** — doc 02 owns it; §6 files the amendment. |
| 3 | inventory | **Stock level** per (item, location) | Covered — `10-F1`..`10-F8`. |
| 4 | warehouses | **Location** = a branch typed `branch \| prep_kitchen \| storage` (`01-F25`) | Covered, and *stronger* than a warehouse table: a store is a first-class branch with its own devices, credentials and branch-scoped envelopes. Already shipping at the identity layer (`provision-device --type storage`). **Sub-branch areas (walk-in, dry store, bar) are deliberately NOT stock locations** — see §4.7. |
| 5 | transfer of items | `stock.transfer_sent` / `stock.transfer_received` | Covered and better specified than asked — `10-F11`, `10-F12`, in-transit state, receive-confirm, discrepancy never silently absorbed. **Slice 2.** |
| 6 | which item arrived when | **Receipt history** per (supplier, item) | Covered at receipt granularity (`10-F13`, `10-F14`). **Lot identity is NOT covered and is deliberately out** — see §4.5 and founder decision 1. |
| 7 | different units | **Base unit** on the item, **pack** on the supplier item | Covered by `10-F1`, but its *"purchase unit → stock unit"* is **one hop** and his case is two (case of 24 → tin of 400 g → 30 g in a recipe). Resolved in §4.3; ⚠ small amendment to `01-F21`. |
| 8 | different brands, same item | **Supplier item** carries `brand` | ⚠ **Absent — `brand` = 0 hits corpus-wide.** The largest genuine data-model gap on his list. Resolved in §4.2. |
| 9 | recipes from inventory items | **Recipe** | Covered — `10-F3`, `14-F9`, `01-F21`. |
| 10 | menu items are recipes + a price | **Menu recipe** = a mapping row, sellable → lines | Covered (`14-F9`); price already ships per `(branch, channel)` (`01-F60`). ⚠ **The modifier leg is missing**: `modifier` is sellable and priced (`SELLABLE_KINDS`) but `order.line_added` is `{order_id, line_id, item_id, qty, unit_price_paisa}` with no modifier attachment, so *"extra raita"* sells and deducts nothing. Doc 01/02 spec act; caps `10-F8` coverage. |
| 11 | prep items that are not menu items (dynamite sauce) | **Prepared item** + **prep recipe** | **Doc 10's strongest answer, already written.** `10-F1` item types `raw \| prepared`; `10-F3`'s chain; `10-F9`'s *"made 15 kg boti from 18 kg raw"*. Ten menu recipes reference one prepared item at ten quantities. **Answered in slice 1 for costing and deduction; counted as stock in slice 2** — see §5.4. |
| 12 | expiry | — | **Out, with a reason.** `10 §9` q3 defers it for *prepared* items only; raw-item expiry was never even the question. Expiry is a property of a **lot**, and lots are the thing we are declining (§4.5). **Founder decision 1.** |
| 13 | storage guidelines | — | **Out.** It is reference text attached to an item, with no reader: no device surface consumes it, and `11 §2`/`01-F75` show what happens when a reference set is declared with nothing at either end. It rides `11-F18`'s carrier when that lands, not a field invented here. |
| 14 | SOPs | `11-F18` | **Not this module's, and currently unbuildable anywhere.** `01-F75` closes the reference-data resource set and excludes SOP documents by name — no writer, no publication surface, no device consumer. Doc 11 owes itself the amendment. Our `01-F75` amendment (§6) does **not** smuggle it in. |
| 15 | when items sell we automatically manage inventory | **Derived deduction** | Covered — `10-F3`, `10-F4`. ⚠ Its trigger predicate is not law-1 legal as written; resolved in §5.2. |
| 16 | close the inventory; every restaurant does it differently | **The count period** | ⚠ **This is the missing entity, and it is the spine of this design.** `10-F17`/`10-F20` give the count; `10-F18` says *"the period since last count"*; **no period exists anywhere in doc 10.** §5.1. |
| 17 | assess the difference and reconcile | **Variance report** | Covered and better than described — `10-F18`'s formula, `10-F19`'s attribution *hints, never accusation*. ⚠ One arithmetic defect in `10-F19`; §5.5. |

---

## 2. What we copy, and from whom (R34)

**The consensus skeleton, taken whole from Restaurant365 + Toast/xtraCHEF.** Nine of the ten products surveyed share it, so it is not a preference:

```
Supplier ──< SupplierItem >──── Item ────< ItemLocation
             brand, code,        base unit,     par, storage-area sort,
             pack triple,        is_tracked,    period (value, qty)
             last price          raw|prepared
                                      │
              RecipeLine >──── Recipe ┤ produces (prep recipe only)
              component = Item        │
                                      ▼
              MenuRecipe: (sellable kind,id) ──> Recipe     ← its own row, nullable
```

| Decision | Copied from | Rejected, and why |
|---|---|---|
| **Stock is counted at the ITEM; brand and pack live on the supplier item** | **Restaurant365** (`Purchased Item` ← many `Vendor Item`). Verified quote: *"Avoiding brand names prevents duplicates because you do not end up with extra items detailing each brand… if you purchase two brands of Shredded Cheddar… if they can be used interchangeably as an ingredient, they should be named the same."* Its one named exception — *"items like liquors… inventoried differently based on brand"* — is the rule restated: **split into two items when the kitchen treats them as two things.** | **Apicbase** counts at the *package*, so "tomato paste" becomes three count rows (National tin, Shan tin, bulk tub) and a skipped row silently copies theoretical stock. **Craftable**'s generic-item grouping with an explicit depletion order does the same at the vendor item. Both spend `10-N2`'s 15-minute count budget on a distinction the kitchen does not make. |
| **`brand` is a STRING on the supplier item, not an entity** | **Adaco/Fourth** (`Product` → `Details[]` each with `Brand`, `VPN`, vendor) | A `Brand` table nobody queries. Nothing in the corpus reads brand except a human on a receiving screen. |
| **Pack is a triple — `pack × size × unit` — that computes ONE integer conversion** | **xtraCHEF/Toast** (`Pack` = units per case, `Size`, `Unit`) | **Adaco**'s four nested levels (`Purchase/Pack/SubPack/MicroPack`) — real, and more than a Pakistani kitchen's 10–20 tracked items need. **Foodics**' single `storage_to_ingredient_factor` — too small: it forces "case of 24" and "one tin" to be two supplier items at unrelated prices, which is the duplication R365 spends a best-practices page preventing. |
| **Recipes are entered in base units (mg/ml/units); no third "recipe unit"** | **Apicbase**'s own advice: *"the safest way to go … is to enter all your ingredients in grams."* `14-F9` already says integer mg/ml/units. | A recipe UOM per line, which is where every product in the survey breaks at the each↔weight boundary. R365 **locks** the selector; Apicbase silently assumes 1 L = 1 kg; R365's own AvT report concedes it *"rounds recipe conversions"* and is *"not intended to tie back perfectly."* We take the refusal, not the fudge: "1 tbsp" is a **display** convenience in the editor, never a stored unit. |
| **Yield lives on the prep recipe and the production entry, not on the item** | **Restaurant365** (`Yield Qty` + `Portion Size` → `Number of Portions`) and **Apicbase** (`Net Measurement`) | **Petpooja/Adaco** put `YieldPercentage` on the raw material. Loss on a boti marinade is a property of the process on the night, not of the goat. `10-F9`/`10-F10` already take the R365 position **plus a feedback loop none of them has** (actual-vs-recipe yield per prep recipe). Do not move it. |
| **A prepared item is an Item with a flag, produced by a recipe and consumed by a recipe** | Unanimous — R365 (`Recipe or Purchase` count templates), Adaco (types `P`/`R` in one space), Foodics (`Production`) | A separate "prep" table. Nobody has one. |
| **A count CLOSES a period; Saved ≠ Closed** | **MarginEdge**: *"Closing locks the inventory… 'Saved' means you're still working on the count… 'Closed' finalizes it"*, and *"you must have two inventories, each closed on different dates, to use the Food Usage Report."* | An always-live running balance as the book of record. See §5.1 — it is also the only law-1-legal option. |
| **The count is BLIND** | R365 / industry practice: hiding quantity-on-hand *"ensures a true physical verification"* and prevents anchoring | Showing expected stock on the count sheet. We get the best practice for free — §5.3 shows a device **cannot** legally know expected stock. |
| **Track the top 10–20 high-cost ingredients** | Appendix D, binding; **Supy**/R365 *key item* checkbox, **Adaco** `KeyItem` — every serious system has the flag | Full-menu costing. Appendix D's own words: *"where competitors' modules die."* `10-F2`'s `is_tracked` is this. |

**Two places we deliberately beat the mainstream, and should not be talked out of.** (a) `10-F7` — post-KOT voids and comps **consume** stock. R365/MarginEdge compute theoretical usage from *sales*, so a voided dish is not consumed and the food it ate becomes unexplained variance; CrunchTime and MarginEdge both name untracked waste as a top variance cause. Ours is the food that was actually cooked. (b) `10-F19` — attribution *hints, never accusation*. Nothing in the survey does this and it is the module's whole social license in a Pakistani kitchen.

---

## 3. Two-plane placement (`18 §6`, commandment 5)

| Thing | Plane | Why it cannot be elsewhere |
|---|---|---|
| Reference data (items, suppliers, supplier items, recipes, pars) | **Cloud write, device read** | `01-F21` — edited only via back office, distributed as reference-data snapshots + deltas. |
| `stock.purchase_recorded`, `wastage_recorded`, `count_recorded`, `transfer_*`, `production_recorded` | **Device append only** | `stock.*` is **not** in `ORG_SCOPED_EVENT_TYPES` (measured: five members, `catalog.changed`, `device.registered`, `device.revoked`, `user.changed`, `config.changed`). Every other envelope requires `branch_id`, `device_id`, `branch_created_at`, `time_basis`, all stamped at append by an originating device (`01-F62`, `01-F43`..`F46`). **A cloud web page for the count is illegal** — the exact wall `05-F28` hit for the manager console. Do not build one. |
| Deduction, moving-average value, variance report | **Cloud read model** | `10-F4`, `10 §8`. Also see §5.3 — a device cannot hold a correct stock balance. |
| Back-office views of stock/variance/supplier ledger | **Cloud, tRPC + TanStack Query** | `18 §6`. |

**Where the code lives.** `packages/inventory` — the fold, the period arithmetic, the recipe explosion — hosted by `services/sync-gateway`, where `kernel.events` already are and where `10-N1`'s 60 s budget is a same-process update. Back-office reads reach it over the gateway's existing internal HTTP surface, the same direction `/internal/catalog/publish` already runs. **This follows `DEC-ARCH-001` (B)** — the auditor's ruled shape, a pure package both services may import — and inherits that decision's open ⚠ about a second service holding a kernel handle. Engineering question, §10.

---

## 4. The entity model

For each: **what it is · what identifies it · what it carries · kernel event / reference data / derived.**

### 4.1 Item — *reference data*
The thing a kitchen counts. **Identified by** `item_id` (org-scoped). **Carries** `name`, `type: raw | prepared`, `base_unit: mg | ml | units`, `is_tracked` (`10-F2`).
- **Base unit is the smallest one and is immutable after first use** — copied from R365, which makes `Measure Type` immutable after save and locks the UOM selector until a conversion exists. Changing a base unit silently rescales every historical movement; `01-F1` makes that permanent.
- One item, many supplier items (§4.2). Split into two items only when the kitchen treats them as two things (R365's liquor exception).

### 4.2 Supplier and SupplierItem — *reference data*
**Supplier**: `supplier_id`, name, contact, lead-time preset (`10 §7`). **SupplierItem**: identified by `(supplier_id, supplier_item_id)`; carries `item_id`, **`brand`** (free string), supplier's own code, the **pack triple** (§4.3), and `last_price_paisa` for `10-F13`'s prefill. Price *history* is a derived read model (`supplier_item_prices`, `10-F14`), not reference data.
This row is the answer to *"different brands, same item."* Many → one, always.

### 4.3 Unit and conversion — *reference data, on the SupplierItem*
`pack_count` × `size_qty` × `size_unit` — *"a case of 24 tins of 400 g"* is `24 × 400 × g`. The stored conversion is the single integer `pack_count × size_qty × (size_unit → base_unit)`, so `10-F1`'s one-hop *"purchase unit → stock unit"* is **preserved as the computed value** and the triple is only how a human enters it and how a receiving screen counts cases. Conversions are **integer numerator/denominator, never a float** — a float conversion lets delivery order decide a quantity, which is law 3's money hazard one domain over.
⚠ **Amendment owed:** `01-F21` places `conversions` on `InventoryItem`. They belong on the supplier item, because a conversion is a property of *how this supplier packs it*, not of the thing. Amend `01-F21` to name the carrier and add `brand`.

### 4.4 Location and ItemLocation — *reference data*
**Location** is a branch (`01-F25`): `branch | prep_kitchen | storage`. Nothing new. **ItemLocation** — R365's shape — is identified by `(item_id, location_id)` and carries `par_level` (`10-F21`), `storage_area_sort` (`10-F17`'s per-location storage-layout order), and per-period `(value_paisa, qty_base)` (§5.1).

### 4.5 Lot — **not modelled. Declined, with the reason.**
A lot would carry receipt date, expiry, and its own quantity. It is the only honest home for the founder's *expiry*, and the mainstream food-cost systems (R365, MarginEdge, xtraCHEF, MarketMan) do not have it — lots live in HACCP/traceability products (Apicbase, Adaco). Cost of adding it: the count becomes per-lot, `10-N2`'s ≤3-taps-per-item and 15-minute budget both break, and `10-F6`'s valuation must become FIFO, which is order-dependent and therefore illegal under law 1 (§5.1). **His noun "which item arrived when" is served without lots** by the receipt history (`10-F13`) and `10-F14`'s price history. **Expiry is not.** Founder decision 1.

### 4.6 Recipe, RecipeLine, MenuRecipe, PrepRecipe — *reference data*
**Recipe**: `recipe_id`, `yield_qty` + `yield_base_unit` (prep only), lines. **RecipeLine**: `(recipe_id, line_no)` → `component: {kind: item | recipe, id}`, `qty` in the component's base unit. Nesting is allowed to arbitrary depth (R365: *"a Recipe… can then be used as an Ingredient (a Sub-recipe) on any other Recipe"*; MarketMan documents *"recipe in recipe in recipe"*; **no product in the survey documents a depth limit — and none documents cycle detection either**, which is a real hazard: dynamite sauce → mayo → dynamite sauce is an explosion that never terminates. **We detect the cycle at the WRITER and refuse the save**, never in the fold.
**MenuRecipe is its own row**, `(sellable_kind, sellable_id) → recipe_id`, not a field on the catalog entry. Three reasons: the whole category does it this way; `10-F8` makes its *absence* a first-class reporting number (coverage %); and widening `CatalogEntryWire` would put recipe data on the price artifact, so **a recipe edit would re-version the menu every till holds** — `01-F75` clause 5 types `entries[]` per resource precisely to stop that.
**Prep recipes are reference data in slice 1 even though production is not.** The chain explodes prepared → raw for costing and deduction; the prepared item's own stock moves only on `stock.production_recorded` (`10 §4` Flow A step 3 says exactly this). This is the R365/xtraCHEF/MarketMan position and it means **the dynamite sauce is answered in slice 1** — ten menu recipes reference it at ten quantities and all ten deduct the right raw ingredients — without anyone counting a tub of sauce.

### 4.7 Storage area — **not a location. A sort key.**
`10-F17` already calls it *"per-location storage-layout order"*. Making a walk-in a stock location multiplies count rows and requires intra-branch transfers between areas, for a distinction that changes no number the owner reads. R365 puts it on the item-location row; we copy that. **Reopen trigger, named so it is a trigger and not a mood:** a pilot with a bar that reconciles separately from the kitchen.

### 4.8 Count — *kernel event*
`stock.count_recorded`, already in `01 §4`. Identified by `count_id`; carries `location_id`, the **period key** it closes, and the full line set `[{item_id, qty_base}]`. `10-N2`'s 20 tracked items make one payload; no pagination.
**Saved is not an event.** `10-F17`'s *"resumable within the same business day"* is device-local partial state, exactly MarginEdge's Saved/Closed split. `10 §4` Flow E already says *"an abandoned count writes nothing"* — so a half-count must never reach an append-only ledger.

### 4.9 Variance — *derived, and frozen*
Per (item, location, period): `opening + purchases + transfers_in − theoretical_consumption − wastage − transfers_out = expected`, vs `counted` (`10-F18`). Valued in PKR at the period cost (§5.1). Immutable once the period closes.

### 4.10 Movement — *derived read model + fact rows*
`stock_movements` (`10 §5`) holds fact rows citing their kernel event and derived deduction rows citing `(order_line_id, recipe_version)` (`10-F4`). **Derived rows are never events** — `10 §9` q5 leaves checkpointing-them-as-events open and this design does not take it.

---

## 5. The five places doc 10 and the mainstream collide

### 5.1 THE SPINE — the count period, and why one entity fixes three problems

Doc 10 has no period. Adding it resolves three separate defects at once, which is why it is the first thing built.

**(a) `10-F4`'s recompute has nothing to bound it.** `10-F4` makes deduction re-derivable when a recipe is corrected, and `10-N6` budgets *90 days* of it. But `10-F19` writes the count's adjustment as a **kernel event**, which is not re-derivable. So a recipe correction re-derives consumption across a window containing an adjustment computed against the *old* derivation — and that adjustment is now wrong and `01-F1` forbids fixing it. **MarginEdge's answer is the industry's: closing locks the inventory.** Recompute is bounded to the **open** period; a closed period's numbers are frozen; a recipe correction applies forward.

**(b) `10-F6`'s moving-average cost is order-dependent and therefore breaks law 1.** `10-F6` says *"updated on each purchase receipt."* A running average interleaved with issues values those issues differently depending on the order receipts and issues arrive — so **delivery order decides a money outcome**, which is the exact failure `26 §2` exists to remove and which `DEC-PERF-001` ratified against. Resolution, and it is also what the mainstream period-close actually computes: **period-weighted average — `(opening_value + purchases_value) / (opening_qty + purchases_qty)` per (item, location, period)**, order-free by construction within the period.
**And do not store a unit cost.** A cost per base unit is a rate and will not be an integer. Store the pair `(value_paisa, qty_base)` and value any quantity by one exact multiply-then-round: `gap_value = round(gap_qty × value_paisa / qty_base)`. Accumulate in **BigInt** (law 3). This satisfies `10 §8`'s *"no cumulative drift vs exact rational computation"* property **by construction**, because there is no running accumulation left to drift.

**(c) It is the founder's own word.** *"we also have to close the inventory. every restaurant does it differently."* `10-F20`'s 2–3×/week preset is the schedule; the period is what a close produces.

⚠ **Proposed `10-F28` (spec act, doc 10, next in sequence — `10-F27` is the current highest):** *A count period per (location) is opened by the previous `stock.count_recorded` and closed by the next. A closed period's derived movements, valuation and variance report are immutable; recipe corrections (`10-F4`) re-derive only the open period. Period cost is the weighted average of opening value plus receipts, held as (value, quantity) and never as a stored unit rate.* Amend `10-F6` and `10-F18` to cite it; amend `10 §8`'s moving-average note.

### 5.2 `10-F3`'s deduction trigger has no legal ordering source on either plane

`10-F3`: *"a line belongs to deduction iff it is part of a confirmed order (`order.confirmed`, or `line_added` after confirm) and was not removed pre-confirm."* **Both clauses are ordering predicates.** `01-F34` gives device folds no ordering metadata at all, and its superseded clause explicitly withdrew `global_seq` as a cloud-side business arbiter — `server_received_at` survives only for `01-F18`'s closed LWW list (catalog and prices). So *"after confirm"* is not computable anywhere. (`03-F55` confirms the corpus contemplates post-confirm additions, so this is not a hypothetical.)

**Order-free restatement, which is what we build:**
> deduction set = { lines named by `order.line_added` } **minus** { lines named by `order.line_removed` }, for every order for which `order.confirmed` exists.

Set difference over grow-only sets: convergent, relabel-invariant, clock-free — `26 §7`'s first merge rule, no exemption needed. **Build it to law 1 as if it were a device fold, even though it runs in the cloud**, and take the recompute discipline as the price; that keeps the option of moving it device-side later.

**What it loses, stated plainly:** a line removed *after* confirm exempts itself from deduction, where `10-F3` says it should not. **The mitigation is already shipping and is not in the fold:** `01 §4`'s dagger makes post-KOT removal a `void.recorded`, and the matrix separates them — `order.line_removed → order.create` (cashier allow) versus `void.recorded → order.void_after_kot` (cashier **deny**, escalate). A cashier taking the cheap path is a **permission-gate** finding, not a deduction defect, and the fix belongs at the void gate.
⚠ **Amend `10-F3`** to the set-difference form.

**`10-F7` then falls out for free and needs no enforcement.** Post-KOT voids and comps name no line — measured: `void.recorded` and `comp.recorded` carry `{order_id, amount_paisa, reason, approver_user_id, adjustment_attempt_id}` and **no `line_id`** — so they remove nothing from the set and the food stays consumed. `10-F7` becomes a *consequence* of the formulation rather than a rule someone must remember.

### 5.3 The recipe version cannot be "resolved at event time"

`10 §4` Flow A step 2 resolves *"the recipe version effective at the event time"* — another ordering read, and worse, one that would need a per-event recipe lookup. `01-F53`'s precedent (snapshot the price at line-add) does not transfer: the till does not hold the recipe and must not.
**Resolution:** the derived row records the recipe version it was **computed with**, which is what `10-F3`'s key `(order_line_id, recipe_version)` already says. Policy: compute with the currently published version; a recipe correction re-derives the whole **open** period at the new version, replacing rows keyed by the old one; the period close freezes it. That is `10-N6`'s recompute exactly, with no event-time resolution anywhere. ⚠ **Amend Flow A step 2.**

**Consequence, and it is a feature:** a device cannot hold a correct expected-stock number (the deduction lives in the cloud and `00 §5.1` forbids requiring WAN for an in-branch act). **So the count is blind** — which is the industry's own best practice for a period-end count, because it prevents anchoring. We get it by construction. The count screen shows the item, its unit and its storage order; never a suggested quantity.

### 5.4 `10-F5` — negative stock — is safe, and is the mainstream's position

`10-F5` and `01-F17` are unchanged and unchallenged: theoretical stock goes negative, is flagged, never blocks a sale, is reconciled at the next count. Apicbase, Craftable and Lightspeed do the same; R365 and xtraCHEF do not even have the concept at sale time because their theoretical usage is a report. Nothing to amend. One operational note: with `10-F21` deduped per item per business day, an item stuck negative alerts once a day rather than forever.

### 5.5 `10-F19` compares a selling price against a cost — a real arithmetic defect

`10-F19`'s hint *"gap exceeds all voids+wastage logged"* compares the PKR-valued variance gap (at **cost**, `10-F18`) against `void.recorded`'s `amount_paisa`, which is a **selling** price. The void side is overstated by the gross margin — on a 70 % food-cost target that is a factor of ~3, so the hint fires almost never and misleads when it does. And because voids name no line (§5.2), the void side **cannot** be restated in stock units.
**Resolution:** the hint compares like with like — gap value at period cost against **wastage** value at period cost (wastage names its item and quantity) — and voids enter as a **separate, labelled count**, not summed into the same number. ⚠ **Amend `10-F19`.** Restating voids in cost terms requires a `line_id` on `void.recorded`, which is a protected-path schema change on the money ledger and is **not** worth it for a hint.

---

## 6. Events, permissions, and the spec acts owed

**Event types — slice 1 invents none.** All of `stock.purchase_recorded`, `stock.wastage_recorded`, `stock.count_recorded`, `stock.transfer_sent`, `stock.transfer_received`, `stock.production_recorded`, `stock.movement_recorded`, `stock.price_spike_flagged`, `stock.low_level_flagged`, `stock.count_overdue_flagged` are already `01 §4` vocabulary. What is missing is **payload schemas in `packages/domain/src/registry.ts`** — and `01-F4` makes a catalogued type with no schema *unemittable rather than merely unbuilt*, which is why they are the first code in slice 1. Slice 1 writes **three**: `purchase_recorded`, `wastage_recorded`, `count_recorded`.

**Permissions — slice 1 invents none.** `stock.receive` (its Appendix A row reads *"Receive stock / transfers"*, so transfers are covered too), `stock.count_entry`, `stock.wastage_record` all ship with role rows (cashier deny/deny/allow; storekeeper allow/allow/allow). ⚠ **`stock.production_recorded` has NO action** — under the fail-closed default it is denied for every role including owner, so production is **unbuildable, not merely unbuilt**: the identical shape as `02-F46` (availability), `02-F47` (customer) and `14-F30` (device). One FR-decided action, owed by slice 2.

**Reference data — one amendment, one resource.** ⚠ `01-F75`'s resource set is closed; measured, it holds **three on the wire** (`catalog`, `staff`, `device_roster`) against four in the spec — `01-F87`'s `config` is spec-closed and code-owed. Amend it to admit a fifth, **`inventory`**, org-scoped (`01-F76`), on the existing frame triple with **zero new message kinds** — `01-F87`'s own precedent. One row union covering items, item-locations, suppliers, supplier items, recipes and menu-recipe mappings, published as one artifact by one **named producer** (`01-F75` clause 9 — written down because the catalog's fan-out shipped with zero production callers, and this module's version of that trap is a recipe edit no till ever sees). **One amendment, not two:** a second `01-F75` act costs another spec PR and another golden fixture, and the row union is one Zod file either way.
Expect `packages/sync-protocol/src/__acceptance__/reference-fixtures.test.ts` §J7 to redden — it asserts the fixture resource set is exactly `{catalog, staff}`. That is the gate working; add the fixture.
⚠ **It does not close the LAN leg.** `01-F75` (ii): the mesh session carries no reference data, so a prep-kitchen device behind a relaying hub with no WAN gets no item list. A standing `00 §5.1` breach this module inherits and must not work around.

**The full amendment list, with owners:**

| # | Amendment | Doc | Blocks |
|---|---|---|---|
| A1 | `01-F75` admits `inventory` as a fifth org-scoped resource + golden fixture | 01 | slice 1 |
| A2 | `10-F28` — the count period; amend `10-F6`, `10-F18`, `10 §8` (§5.1) | 10 | slice 1 |
| A3 | `10-F3` restated as order-free set difference (§5.2) | 10 | slice 1 |
| A4 | `10 §4` Flow A step 2 — recipe version is computed-with, not resolved-at-event-time (§5.3) | 10 | slice 1 |
| A5 | `01-F21` — conversions carried on the supplier item; `brand` named (§4.3) | 01 | slice 1 |
| A6 | `10-F19` — compare cost with cost; voids counted separately (§5.5) | 10 | slice 1 |
| A7 | A permission action for production | 10 or 14 | slice 2 |
| A8 | An order→customer link (founder item 2). Recommend an optional `customer_phone_e164` on `order.created` — additive, `looseObject` already permits it, and it matches the shipped flow where the caller strip captures before ringing. ⚠ It cannot express linking *after* creation (`02-F27` allows inline creation mid-order); if that is needed the answer is a new event type, which is a larger act. **Doc 02's call, not ours.** | 02 + 01 | nothing here |
| A9 | A modifier leg on `order.line_added` so priced modifiers can deduct (founder item 10) | 01 + 02 | caps `10-F8` coverage |

A8 and A9 are on the list because he asked and because two written FRs already depend on A8 (`02-F10`, `02-F14`) — **not** because this module should build them.

---

## 7. The build sequence

### Slice 1 — **the variance loop.** The smallest thing a real restaurant gets value from.

The industry's own minimum is precisely this: MarginEdge's usage report needs two closed counts, purchases and recipes, and nothing else. Ours adds wastage, because without it the first variance report is uninterpretable and *"reconcile"* fails on day one — MarginEdge and CrunchTime both name untracked waste as a leading variance cause, and `stock.wastage_record` already has a cashier-allow row.

1. **Spec acts A1–A6.** They are the gate; nothing below is legal first.
2. **`packages/domain`** — three payload schemas (`purchase_recorded`, `wastage_recorded`, `count_recorded`); wire up `mg`/`ml`/`units`, deleting their `@unreached-owed` markers.
3. **`packages/inventory`** — the recipe explosion (with writer-side cycle refusal), the order-free deduction set (§5.2), period arithmetic on `(value, qty)` in BigInt, the `10-F18` variance formula. Pure functions, no I/O.
4. **Reference artifact** — the `inventory` resource in `packages/sync-protocol` + golden fixture; the named producer in `services/api`; the device consumer in `packages/sync-client`.
5. **`apps/backoffice`** — item editor (base unit, `is_tracked`, par, storage order), supplier + supplier-item editor (brand, pack triple), and `14-F9`'s **two** recipe editors with `14-F10`'s coverage % surfaced. `14-F32`'s one-task-per-job discipline applies.
6. **Device surfaces** — receiving (`10-F13`'s prefill, no photo), wastage (item, qty, quick-tag reason, no photo), the blind guided count (`10-F17` order, ≤3 taps, same-day resume as device-local state).
7. **Cloud read model** — derived movements, period valuation, the variance report with `10-F19`'s corrected hints; the back-office variance view.

**Acceptance for slice 1, and it is a demonstration, not a suite (R43):** author 15 tracked items and their recipes; receive an invoice; ring a service; log one wastage; count; read a variance report in PKR whose numbers reconcile by hand. Two closed counts make the second report meaningful — say so to the pilot, because the first period has no opening.

**Which of his nouns slice 1 delivers:** 1, 3, 4, 6 (receipt-level), 7, 8, 9, 10, 11 (as costing — the dynamite sauce works), 15, 16, 17.

### Slice 1 deliberately omits

| Omitted | Why |
|---|---|
| Production events; prepared items as counted stock | The chain already costs and deducts correctly through prep recipes (§4.6) — the R365/xtraCHEF position. Needs a permission action (A7) it does not have. |
| Transfers (`10-F11`, `10-F12`) | Single-branch pilots. `10-F1`'s location model already supports them; the events are catalogued; nothing here forecloses them. |
| Photos on invoice and wastage (`10-F13`, `10-F16`, `10-N4`) | Object storage + a deferred upload queue is its own subsystem. `10-N4` says capture must never be blocked by connectivity; a no-photo record is a complete record. |
| Price-spike (`10-F15`), low-stock (`10-F21`), count-overdue (`10-F20`) flags | Three alert types with **no consumer surface built** — doc 05's console renders only (R48) and doc 12's owner app is a stub. Building a producer for an absent consumer is this repo's own named recurring defect. |
| Prep planning, forecasting (`10-F22`..`10-F27`) | `10 §1` waves them to 3/4; they need history slice 1 does not have. |
| Purchase orders | `DEC-SUPPLY-001`: *"PO entity undefined,"* deferred to W4. |
| Lots, expiry, FEFO | §4.5. Founder decision 1. |
| Storage areas as stock locations | §4.7. |
| Storage guidelines, SOPs | Item 13/14 — `11-F18`'s carrier, blocked at `01-F75`, and not ours to unblock. |
| Invoice OCR | `10 §9` q1, deferred there. |
| Modifier deduction | A9 — a doc-01/02 act on a protected path. |

### Slice 2 — **the physical acts.** Production (`10-F9`, `10-F10`, + A7), transfers with in-transit and receive-discrepancy (`10-F11`, `10-F12`), prepared items counted as stock, photos, and the three alert types **once doc 05 or doc 12 has a surface to show them on**.

### Slice 3 — planning and forecasting (`10-F22`..`10-F27`), invoice OCR, and lots/expiry if founder decision 1 rules them in.

---

## 8. Where this module can produce the repo's two recurring defects, and the guard for each

- **A correct subsystem with no seam to the product.** The named trap here is `01-F75` clause 9's own worked example: the catalog's reference fan-out shipped with **zero production callers**. Guard: the acceptance for step 4 is an author-in-back-office → appears-on-device round trip, and the seam is mutated (delete the publish call) to confirm something reddens.
- **A correct component that is not on the screen.** The count sheet and the receiving form are dense list surfaces on a 10.1″ tablet — `layout:check`'s worst case. Guard: both enter the layout gate's fixture in the same change that builds them, because the gate only sees states its fixture produces.
- **A guard aimed one case away.** The deduction fold's suite must mutate the *set difference* (drop the `line_removed` subtraction; drop the `order.confirmed` requirement) and confirm the specific assertion that owns each fails, with a one-branch control. A convergence test alone passes a min-id tiebreak.

---

## 9. Open questions — engineering

1. **The cross-service read.** Back-office inventory reads over the gateway's internal HTTP surface inherits `DEC-ARCH-001`'s unresolved ⚠ about a second service holding a kernel handle. Precedent points both ways; whoever builds step 7 sets it.
2. **Count on the phone needs a PIN session that does not exist.** `apps/manager` is a real Expo RN app that opens a real device store (`packages/sync-client/src/rn.ts`, `storage-op-sqlite.ts`), but it has **no PIN session**, so `actor_user_id` would be `null` on every count — and `10-F19`'s attribution hints against a null actor are worthless. Argon2id on React Native is a native-module question. Feeds founder decision 4.
3. **`packages/ui` ships zero React Native components** (measured: 22 exports, no `react-native` import anywhere in `packages/ui/src`). Any phone surface breaches commandment 6 or waits for an RN component set.
4. **Cycle detection depth.** No product in the survey documents a nesting limit or a cycle check. We refuse at the writer; the traversal bound is an engineering choice.
5. **`10 §9` q5** — checkpointing derived rows as events for external audit export. Left open; this design does not take it.

---

## 10. Founder decisions

Six real either/ors. Each has a cost on both sides.

1. **Expiry and lots — in, or out?**
   **Out (recommended, and what this design assumes):** expiry is unanswered; his noun goes unserved; *"which item arrived when"* is answered at receipt granularity only. **In:** every receipt mints a lot, the count becomes per-lot, `10-N2`'s ≤3-taps and 15-minute budget both break, and `10-F6`'s valuation must go FIFO — which is order-dependent and illegal under law 1, so it would also reopen §5.1. The food-cost mainstream (R365, MarginEdge, xtraCHEF, MarketMan) has no lots; the traceability products (Apicbase, Adaco) do. **Adds roughly a slice.**

2. **Who authors recipes?**
   `10 §1` and Appendix D both say the **vendor onboarding team** does it and *"owners never do recipe data entry."* That was written before R40/R46 made signup self-serve. **Keep it:** RestOS staffs onboarding per pilot — fine at 5–10 restaurants, a hard ceiling after. **Change it:** the back-office recipe editor becomes an owner-facing surface with owner-facing consequences (a wrong recipe silently mis-costs every dish), and `catalog.edit_recipes` — currently **owner-only** in the shipped matrix — is already the right row either way. The build cost is similar; the *support* cost is not.

3. **Tracked-item discipline — the top 10–20, or the whole menu?**
   Appendix D is binding and says **10–20 high-cost ingredients (~70% of food cost)**, calling full-menu costing *"where competitors' modules die."* His list reads like full inventory. **Hold the line:** onboarding is days not weeks, counts stay under 15 minutes, and 70 % of food cost is visible. **Open it up:** counts stop fitting `10-N2`, onboarding becomes the product's bottleneck, and variance drowns in noise from items nobody steals. `10-F2`'s `is_tracked` flag means this is a *policy* choice, re-decidable per org — not a schema change.

4. **Where does the count happen — the phone, or the till?**
   `10-F17` says phone/tablet, and it is right: the stock is in the store room and the till is bolted to the counter. **Phone:** needs a PIN session on `apps/manager` (Argon2id on RN, native module) and an RN component set `packages/ui` does not have — real work, and until it lands every count is attributed to nobody. **Till:** ships in slice 1 with zero new platform work, and the storekeeper carries a clipboard to the counter, which is the habit the product exists to remove.

5. **Do priced modifiers deduct stock?**
   Today *"extra cheese"* sells at a price and consumes nothing. **No:** cheap, and `10-F8`'s coverage % honestly reports the hole rather than hiding it. **Yes:** `order.line_added` gains a modifier attachment — a schema change on the money ledger, a protected path under commandment 10 and R35's full-adversarial tier, plus a doc-01 and doc-02 spec act. Worth it only if modifiers are a material share of his pilots' high-cost ingredients.

6. **Does an order carry a customer?** *(His item 2 — a yes/no about scope, not permission.)*
   He asked for it and two written FRs already need it (`02-F10` search by phone, `02-F14` khata requires a linked customer), so the corpus is half-committed already. **Yes, now:** one additive optional field on `order.created`, small — but it belongs to **doc 02's** next slice, not this module's, and taking it here delays the variance loop. **Yes, later:** khata and phone search stay unbuildable until doc 02 runs. **The decision is which module's slice pays for it**, and the honest answer is doc 02's.
