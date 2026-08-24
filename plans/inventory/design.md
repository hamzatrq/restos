# Inventory & Supply — design and build plan

**Status:** design, not approved. No code, no spec edit, nothing staged.
**Amended 2026-08-24** with the founder's answers to decisions 1, 2, 3, 4 and 6. **Two of them are not the answers the decision offered**, and they change the entity model, the count payload and the build sequence. Decision 3: food cost is scoped to *everything* and the figure is **gated on completeness** — which **collides with Appendix D**, and §5.6 names the collision rather than picking silently. Decision 4: the device question is dead (*"which device doesn't matter"*) and three counting questions replace it — a split store/kitchen, a half-used bottle, and produce that rots (§4.7, §4.11, §4.12). Decisions 1 (lots and expiry **out**), 2 (recipes authored **in the back office by the owner**, the RestOS team on the same editor) and 6 (the order→customer link is **doc 02's slice**) are recorded in §10.1 and gone from the open list.
**Authority:** `restaurant-os.md` Appendix D (seed, binding) → `specs/10-inventory-supply.md` (27 FRs, the contract) → `specs/01-kernel-sync.md` (ledger, catalog, reference data) → `14-F9`/`14-F10` (the editors) → this document.
**Ruling applied:** **R34** — *"follow the mainstream and global giants … steal like an artist."* Every structural choice below names the product it is taken from.

**Measured starting point (re-measured 2026-08-24 on `0548d92`; the numbers below were first taken on `1beafcf`).** `specs/10` = 27 FRs, 161 lines — unchanged. `packages/domain/src/registry.ts`: `payloadSchemas` holds **41 event types** and **zero `stock.*`** — ⚠ *this line said 49 payload schemas; re-counted as unique `"<domain>.<verb>":` keys in `payloadSchemas` it is 41, and the two counts are of different things rather than one being a regression. **The load-bearing half is unchanged and is the only half any argument here rests on: `stock.*` is still zero, on both counts.*** `packages/sync-client/src/folds/` = 3 folds, none inventory. `is_tracked` returns **0 hits** across `packages/`, `apps/` and `services/` in `.ts`/`.tsx` — **so the scope split in §5.6 changes a spec and no code, which is the cheap moment to make it.** This is green-field code against a written contract — but **less green-field than it looks**: `01 §4` already holds all ten `stock.*` event types; `PERMISSION_ACTIONS` already holds `stock.receive`, `stock.count_entry`, `stock.wastage_record`, `catalog.edit_recipes` with role rows; `packages/domain/src/money.ts` already exports `mg`/`ml`/`units` carrying `@unreached-owed` markers that name `specs/10`. **Slice 1 below invents zero event types and zero permission actions.**

---

## 1. The founder's list, item by item

Every noun gets a home or an explicit deferral with a reason. ⚠ marks the items that need a spec act before they can be built. **Rows 18–20 are his SECOND list** — the three counting questions that replaced decision 4's phone-versus-till (§10.1).

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
| 12 | expiry | — | **Out — DECIDED (founder, August 2026).** `10 §9` q3 defers it for *prepared* items only; raw-item expiry was never even the question. Expiry is a property of a **lot**, and lots are declined (§4.5). Receipt-level history (`10-F13`/`10-F14`) is what serves *"which item arrived when"*; expiry goes unserved and that is the ruled cost. §10.1. |
| 13 | storage guidelines | — | **Out.** It is reference text attached to an item, with no reader: no device surface consumes it, and `11 §2`/`01-F75` show what happens when a reference set is declared with nothing at either end. It rides `11-F18`'s carrier when that lands, not a field invented here. |
| 14 | SOPs | `11-F18` | **Not this module's, and currently unbuildable anywhere.** `01-F75` closes the reference-data resource set and excludes SOP documents by name — no writer, no publication surface, no device consumer. Doc 11 owes itself the amendment. Our `01-F75` amendment (§6) does **not** smuggle it in. |
| 15 | when items sell we automatically manage inventory | **Derived deduction** | Covered — `10-F3`, `10-F4`. ⚠ Its trigger predicate is not law-1 legal as written; resolved in §5.2. |
| 16 | close the inventory; every restaurant does it differently | **The count period** | ⚠ **This is the missing entity, and it is the spine of this design.** `10-F17`/`10-F20` give the count; `10-F18` says *"the period since last count"*; **no period exists anywhere in doc 10.** §5.1. |
| 17 | assess the difference and reconcile | **Variance report** | Covered and better than described — `10-F18`'s formula, `10-F19`'s attribution *hints, never accusation*. ⚠ One arithmetic defect in `10-F19`; §5.5. |
| 18 | *"15 kg ketchup sachets are in kitchen, rest is in store"* | **Count area** — a section of the count sheet, never a second balance | ⚠ **§4.7 was half right and is rewritten.** One balance at `(item, location)`; **N count LINES**, one per area the thing is kept in, summed. R365's shape exactly. No intra-branch transfer, no per-area variance. Spec act `10-F30`. |
| 19 | *"a soy sauce bottle that is almost half … bottle also has weight"* | **Partial tier** on the item's count units — `none \| fraction \| weight` | ⚠ **§4.11, new.** Two tiers max, the second fixed per item at onboarding. **No tare weight is stored**, and that is the answer rather than a dodge — three measured reasons in §4.11. Spec act `10-F29`. |
| 20 | *"for veggies there's wastage so is for other produce"* | **Three shrink sinks, and a refused fourth** | **§4.12, new.** Trim loss → prep-recipe yield (`10-F9`/`10-F10`); found spoilage → wastage log (`10-F16`); everything unlogged → the count, as variance (`10-F18`/`10-F19`). **No automatic shrink factor anywhere.** Spec act `10-F32`. |

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
| **Track the top 10–20 high-cost ingredients — as the COUNT scope** | Appendix D, binding; **Supy**/R365 *key item* checkbox, **Adaco** `KeyItem`, **CrunchTime** cycle counts — every serious system has the flag, and the whole category agrees that *precision is bought by narrowing the item set, never by loosening the measurement* (§4.11) | Full-menu **counting**. Appendix D's own words: *"where competitors' modules die."* ⚠ **`10-F2`'s `is_tracked` splits in two under founder decision 3** — this row survives as the *counting* half; the *costing* half is §5.6. |
| **An item may carry a COST without being a counted inventory item** | **Restaurant365**'s alert catalogue carries a **Quick Cost** class — *"Quick Item Cost lacking a Conversion Equation"* — i.e. an item with a cost and no full inventory participation. The field guidance is the same instruction: *"Leaving out small ingredients (salt, oil, garnishes) causes 1-2% inaccuracies in food cost calculations, so the solution is to include everything in recipes, even if it costs \$0.02."* | Costing only what is counted. That is `10-F2` as written and it understates every plate cost by the untracked ~30% **permanently, by design** — §5.6 (a). |
| **Multiple count units per item, summed into one reporting unit** | **Restaurant365** (`Count U of M 2`/`3` on the Purchased Item's Units-of-Measure settings): *"All quantities will be added together to give a total quantity (in terms of the 'Inventory U of M')"* — a sum, never an override; items with only the primary UOM *"display **None** in the additional columns."* **MarginEdge** ships the same as *count-bys* → one *Report-By* unit, *"MarginEdge will do the math for you."* Craftable/Compeat, Apicbase and Supy carry it too — **nine of nine, so R34 applies cleanly.** | R365's **three** tiers on every item, and tier choice at count time. Both break the best-practice rule stated one page over — *"each item should be counted using the same unit every time"* — and both break `10-N2`'s ≤3 taps. §4.11 caps it at two and fixes the second per item at onboarding. |
| **No container tare weight is stored, anywhere** | The **negative** finding, and it is unanimous: **no food inventory system in the survey has a tare field** — R365, MarginEdge's food side, MarketMan, Craftable, Apicbase, Supy. Where food partials are weighed the item's unit is already a mass and the schema never learns there was a container. | **MarginEdge Freepour** (empty weights against **80,000+ barcodes**) and **WISK** (**200,000+**) — real, and keyed to a barcode database that will never exist for Pakistani soy sauce. WISK concedes the deeper problem itself: *"You can have more than one full weight on file for an item, since it's unlikely that all bottles of that item weigh the exact same."* §4.11 has the third reason, which is the one that decides it. |
| **Storage areas partition the count SHEET; the balance stays at the location** | **Restaurant365** — a storage location is *"physical areas where restaurants store inventory, such as a walk-in cooler, bar storage, or supply closet"*, items *"can be assigned to one or more storage locations"* to give *"a shelf-to-sheet count experience"*, and *"counts can be updated for the Item across all storage locations"* inside one count. **MarginEdge** (*"split your inventory into multiple count sheets… the totals will roll up"*), **Craftable**, **Toast/xtraCHEF** and **Supy** (*"sub-location or cost-centre tracking within a single facility"*, real separation only at site level) all agree. | **Restroworks/Posist** (*"store-to-kitchen inventory management"* by indent), **Petpooja** (central-kitchen indent tickets) and **Foodics** (warehouse balances with transfers) make the kitchen a real stock location. It buys a kitchen-level balance and costs an **indent ticket on every hand-off** — a third new habit against Appendix D's two, for a distinction no number the owner reads depends on. §4.7. |

**Four places we deliberately beat the mainstream, and should not be talked out of.** ⚠ *This line said TWO and listed two; (c) and (d) below arrived with the founder's August rulings, and moving the number and the list in one edit is the discipline this corpus keeps recording.* (a) `10-F7` — post-KOT voids and comps **consume** stock. R365/MarginEdge compute theoretical usage from *sales*, so a voided dish is not consumed and the food it ate becomes unexplained variance; CrunchTime and MarginEdge both name untracked waste as a top variance cause. Ours is the food that was actually cooked. (b) `10-F19` — attribution *hints, never accusation*. Nothing in the survey does this and it is the module's whole social license in a Pakistani kitchen.

**A third, added by founder decision 3, and it is the one that costs us something.** (c) **A cost figure is refused unless it is complete** (§5.6). **Apicbase is the named counter-example and its own documentation states the behaviour**: a missing ingredient price yields *"no cost for the 'Chickpeas'"* — the line contributes **zero** and the plate cost comes out confidently low. That is precisely the object the founder is refusing, shipped by a market leader. R34 says follow the mainstream; it does not say follow it off a cliff, and here the mainstream is undocumented-to-wrong. **We copy their mechanisms — coverage %, repair queues, precondition gates — and take a stricter threshold, and we say so.**

**A fourth, and it is a hole the mainstream admits in its own variance reports.** (d) **`counted: false` is a distinct value from `qty: 0`** (§4.8). R365 treats a blank UOM box as zero, prints an asterisk for an item nobody touched and reports *"variance is, by definition, zero for uncounted items"*, distinguishes `Assume Zero` from `0 Quantity`, and ships a report toggle for *"whether or not to treat blanks as zeroes."* **So in the mainstream a half-finished count produces a clean-looking report**, and an uncounted item is indistinguishable on the owner's page from a perfect count. That is the founder's honesty rule broken at the quietest possible place.

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
The thing a kitchen counts. **Identified by** `item_id` (org-scoped). **Carries** `name`, `type: raw | prepared`, `base_unit: mg | ml | units`, **two scope flags** (`is_counted`, `is_costed` — §5.6 (c), replacing `10-F2`'s single `is_tracked`), **`count_units`** (§4.11) and **`reference_cost_paisa` per base unit, optional** (§4.13).
- **Base unit is the smallest one and is immutable after first use** — copied from R365, which makes `Measure Type` immutable after save and locks the UOM selector until a conversion exists. Changing a base unit silently rescales every historical movement; `01-F1` makes that permanent.
- One item, many supplier items (§4.2). Split into two items only when the kitchen treats them as two things (R365's liquor exception).

### 4.2 Supplier and SupplierItem — *reference data*
**Supplier**: `supplier_id`, name, contact, lead-time preset (`10 §7`). **SupplierItem**: identified by `(supplier_id, supplier_item_id)`; carries `item_id`, **`brand`** (free string), supplier's own code, the **pack triple** (§4.3), and `last_price_paisa` for `10-F13`'s prefill. Price *history* is a derived read model (`supplier_item_prices`, `10-F14`), not reference data.
This row is the answer to *"different brands, same item."* Many → one, always.

### 4.3 Unit and conversion — *reference data, on the SupplierItem*
`pack_count` × `size_qty` × `size_unit` — *"a case of 24 tins of 400 g"* is `24 × 400 × g`. The stored conversion is the single integer `pack_count × size_qty × (size_unit → base_unit)`, so `10-F1`'s one-hop *"purchase unit → stock unit"* is **preserved as the computed value** and the triple is only how a human enters it and how a receiving screen counts cases. Conversions are **integer numerator/denominator, never a float** — a float conversion lets delivery order decide a quantity, which is law 3's money hazard one domain over.
⚠ **Amendment owed:** `01-F21` places `conversions` on `InventoryItem`. They belong on the supplier item, because a conversion is a property of *how this supplier packs it*, not of the thing. Amend `01-F21` to name the carrier and add `brand`.

### 4.4 Location and ItemLocation — *reference data*
**Location** is a branch (`01-F25`): `branch | prep_kitchen | storage`. Nothing new. **ItemLocation** — R365's shape — is identified by `(item_id, location_id)` and carries `par_level` (`10-F21`) and per-period `(value_paisa, qty_base)` (§5.1).
⚠ **`storage_area_sort` has moved off this row.** It was a scalar here; under founder decision 4 an item is kept in more than one place at one location, so the sort key is `(item_id, location_id, area_id) → sort` — **one row per place the thing is kept**, and the count carries a line per row. §4.7. The **balance is unchanged and stays at `(item_id, location_id)`.**

### 4.5 Lot — **not modelled. Declined, with the reason.**
A lot would carry receipt date, expiry, and its own quantity. It is the only honest home for the founder's *expiry*, and the mainstream food-cost systems (R365, MarginEdge, xtraCHEF, MarketMan) do not have it — lots live in HACCP/traceability products (Apicbase, Adaco). Cost of adding it: the count becomes per-lot, `10-N2`'s ≤3-taps-per-item and 15-minute budget both break, and `10-F6`'s valuation must become FIFO, which is order-dependent and therefore illegal under law 1 (§5.1). **His noun "which item arrived when" is served without lots** by the receipt history (`10-F13`) and `10-F14`'s price history. **Expiry is not.** Founder decision 1.

### 4.6 Recipe, RecipeLine, MenuRecipe, PrepRecipe — *reference data*
**Recipe**: `recipe_id`, `yield_qty` + `yield_base_unit` (prep only), lines. **RecipeLine**: `(recipe_id, line_no)` → `component: {kind: item | recipe, id}`, `qty` in the component's base unit. Nesting is allowed to arbitrary depth (R365: *"a Recipe… can then be used as an Ingredient (a Sub-recipe) on any other Recipe"*; MarketMan documents *"recipe in recipe in recipe"*; **no product in the survey documents a depth limit — and none documents cycle detection either**, which is a real hazard: dynamite sauce → mayo → dynamite sauce is an explosion that never terminates. **We detect the cycle at the WRITER and refuse the save**, never in the fold.
**MenuRecipe is its own row**, `(sellable_kind, sellable_id) → recipe_id`, not a field on the catalog entry. Three reasons: the whole category does it this way; `10-F8` makes its *absence* a first-class reporting number (coverage %); and widening `CatalogEntryWire` would put recipe data on the price artifact, so **a recipe edit would re-version the menu every till holds** — `01-F75` clause 5 types `entries[]` per resource precisely to stop that.
**Prep recipes are reference data in slice 1 even though production is not.** The chain explodes prepared → raw for costing and deduction; the prepared item's own stock moves only on `stock.production_recorded` (`10 §4` Flow A step 3 says exactly this). This is the R365/xtraCHEF/MarketMan position and it means **the dynamite sauce is answered in slice 1** — ten menu recipes reference it at ten quantities and all ten deduct the right raw ingredients — without anyone counting a tub of sauce.

### 4.7 Storage area — **a section of the count sheet, and now a count LINE. One balance, N lines.**
*Rewritten under founder decision 4: "some items like let's say 15kg ketchup sachets are in kitchen rest is in store. how will you count it all?"*

This section previously said a storage area is *"not a location. A sort key."* **That was half right, and it dropped exactly the half that answers him.** The mainstream position has two clauses and we had one.

- **The balance stays at `(item, location)`.** Everything the original section feared is still avoided: no intra-branch transfer, no second stock number, no per-area variance, no per-area cost.
- **The count sheet is partitioned by area, and an item may appear in more than one of them.** R365 assigns items to *"one or more storage locations"* and gives the same item a line in each, inside one count. That is his 15 kg answered literally: **one item, one balance, two count lines, summed.** The room partitions the *sheet*, not the *stock*. §2's table has the quotations and the four products that agree.
- **Rejected: the kitchen as a real stock location** (Restroworks, Petpooja, Foodics) — §2's table has the reason, and it is a habit count, not a schema argument.
- Schema consequence, and it is the whole change: `storage_area_sort` stops being a scalar on ItemLocation and becomes `(item_id, location_id, area_id) → sort` (§4.4). An org that declares no areas has exactly one implicit area and a sheet identical to today's — **the default costs an existing pilot nothing.**
- ⚠ **The item's counted quantity is the SUM of its area lines, and it is `not counted` unless every one of them carries a value.** This is where R365's own hole is (§2, finding (d)) and it is the hole the founder's honesty rule would hate most. §4.8 closes it.

**Reopen trigger, unchanged and now sharper:** a pilot whose bar or prep kitchen reconciles *separately* — a separate balance, not a separate sheet. That wants a `01-F25` **location**, which already exists; it does not want areas to grow up into one.

⚠ **Spec act `10-F30`** — `10-F17` says *"presented in per-location storage-layout order"*, singular and scalar. It must say a line per `(item, area)`, summed to the item, with area membership as reference data.

### 4.8 Count — *kernel event*
`stock.count_recorded`, already in `01 §4`. Identified by `count_id`; carries `location_id`, the **period key** it closes (§5.1), and the line set. `10-N2`'s 20 tracked items make one payload; no pagination.

**The line is no longer `{item_id, qty_base}`.** Under founder decision 4 it is:

```
line: { item_id, area_id, counted: boolean, qty_base?, basis: exact | weighed | estimated }
```

**`counted: false` MUST be a distinct value from `qty_base: 0`, and this is the most important single sentence in the count model.** §2 finding (d) has the measured mainstream behaviour: a blank box is a zero, an untouched item reports *variance is, by definition, zero*, and there is a report toggle for whether blanks are zeroes at all. **An item nobody counted therefore looks, on the page the owner reads, exactly like an item counted perfectly** — and under founder decision 3 that is the same defect as a plate cost with a missing ingredient, wearing a quantity instead of a price. Three rules follow:

1. **A real zero is typed; an absent one is declared absent.** `counted: false` carries no `qty_base` at all, so no arithmetic can consume it by accident. `counted: true, qty_base: 0` means *I looked and there is none*, which is a measurement and a large, real variance.
2. **An item is counted iff every one of its area lines is counted** (§4.7). Otherwise its variance row reads **not counted** and contributes nothing — neither quantity nor money — to the report. The report's PKR total is then a **floor** and says so. That is not an invention: `services/api/src/summary.ts`'s `SummaryHonesty.truncated` already ships a floor-with-a-flag on the argument that *"`00 §5.7` prefers a stated absence to a confident smaller number."*
3. **`10 §4` Flow E's *"an abandoned count writes nothing"* is unchanged and is a different case.** Flow E covers the count that was never submitted. Rule 1 covers the count that **was** submitted with holes, which is the more dangerous one because it produces a document.

**Saved is not an event.** `10-F17`'s *"resumable within the same business day"* is device-local partial state, exactly MarginEdge's Saved/Closed split — and rules 1–3 are why the split matters: Saved may be incomplete, Closed may be incomplete **and say which lines are**.

⚠ **Spec act `10-F29`** carries the line shape; `10-F18` must be amended to say what a *not counted* item does to the variance report, because today it says nothing and the mainstream's silence is what produced the hole.

### 4.9 Variance — *derived, and frozen*
Per (item, location, period): `opening + purchases + transfers_in − theoretical_consumption − wastage − transfers_out = expected`, vs `counted` (`10-F18`). Valued in PKR at the period cost (§5.1). Immutable once the period closes.
**Three amendments from the founder's two answers, all of them about what the row is allowed to claim.** (i) A row whose item was **not counted** (§4.8 rule 2) carries no gap in either unit and is rendered as *not counted*, never as zero variance — the report's PKR total is then a floor. (ii) The row carries the count's **basis** (`exact | weighed | estimated`, §4.11), and `10-F19` fires no hint on a gap inside an estimator's error. (iii) **The PKR column needs no completeness gate**, because §5.6's writer-side invariant `is_counted ⇒ is_costed` makes every counted item costable by construction. That is the reason founder decision 3 costs slice 1 nothing here and costs it the food-cost *ratio* instead — which is where he aimed it.

### 4.10 Movement — *derived read model + fact rows*
`stock_movements` (`10 §5`) holds fact rows citing their kernel event and derived deduction rows citing `(order_line_id, recipe_version)` (`10-F4`). **Derived rows are never events** — `10 §9` q5 leaves checkpointing-them-as-events open and this design does not take it.

---

### 4.11 Count units and the partial tier — *reference data, on the Item*
*New under founder decision 4: "there's a soy sauce bottle that is almost half. half is used in kitchen. how will you fix that? bottle also has weight how will the staff measure how much is left?"*

```
count_units:
  primary : whole-container unit          (bottle | carton | tin | kg | …)
  partial : { kind: none | fraction | weight, unit? }      -- optional, ONE per item
```

**The mechanic is copied and the cap is ours.** R365 and MarginEdge both ship multiple count units summed into one reporting unit (§2's table, with the quotations); R365's published example is the founder's case with the third tier as a *weight* — *"'Romaine Hearts' could be counted three different ways: 'Case - 12/3 CT', 'Bag - 3 CT' and 'Bag (Chopped) - 2 LB'"* — sealed cases, loose bags, and the opened one on a scale. **We cap it at two tiers and fix the second per item at onboarding**, because R365 ships three and its own best-practice literature says the opposite: *"each item should be counted using the same unit every time"*, and *"a partial case counted as '1 case' one week and '0.5 case' the next produces data that isn't comparable."* Both are true. The resolution is the guidance's own sentence turned into a schema field instead of a memo: ***"if the item can appear in partial form, decide in advance how staff should estimate it."***

| kind | What the counter does | Taps |
|---|---|---|
| **`none`** | One number. Correct for ketchup sachets, eggs, sealed tins. | **2** |
| **`fraction`** | A 0–9 tenths chip row. BevSpot's *tenthing* and Partender's slider, and the honest choice for an opaque bottle nobody will weigh. **Stored as an integer 0–9, never a float:** `qty_base = containers × size + tenths × size / 10`, one exact multiply-then-round in BigInt. Law 3's hazard one domain over — `mg`/`ml`/`units` are already integers and a float tenth is how delivery order gets to decide a quantity. | **3** |
| **`weight`** | A second numeric box. The label says **weigh the contents**, not the bottle. | **3** |

⚠ **`weight` is legal only when the partial unit and the base unit are the same dimension**, and this is a constraint discovered by applying §2's own rule rather than one imported from anywhere. Weighing a bottle held in `ml` needs a density, and assuming 1 L = 1 kg is the exact fudge §2 already rejects Apicbase for. **So the founder's soy sauce is either held in `mg` — a kitchen weighs it and nothing else changes — or counted by tenths. It is not both.**

**No tare weight is stored, and that is his question answered rather than dodged.** Three reasons, each measured:
- **(i) No food inventory system in the survey has a tare field** — R365, MarginEdge's food side, MarketMan, Craftable, Apicbase, Supy; repeated targeted searches return bar tools and consumer kitchen scales. Weighing food partials *is* done in kitchens; the software is simply not involved.
- **(ii) The systems that do store one key it to a barcode database that will never exist here** — Freepour's 80,000+ and WISK's 200,000+ (§2's table), and WISK concedes bottles of one product do not weigh the same anyway.
- **(iii) A wrong tare produces a number that looks like a fact.** This is the one that decides it. **Bar Cop — who sold the scales — in *"How to Weigh Liquor Inventory (and Why I Stopped)"*:** *"That math needs a tare weight for every bottle shape on your shelf, and **no list is ever completely accurate**"*; the consequence, *"the count that was sold to them as precise turned into **two counts running at the same time**"*; and the sentence that ends the argument for a module whose entire licence is `10-F19`'s *hints, never accusation* — **"A scale out of calibration will not tell you it is wrong… A bad scale is inaccurate and looks like fact."** MarginEdge's own help centre names the clinical symptom: a **negative** remaining quantity when the gross falls below the stored empty weight. Weighing also costs three handling motions per container that tenthing does not — *"Look at the bottle. Drag the slider to the level. Next. **You never pick it up**."*

**The `fraction` tier is an estimate and the line must say so.** Bar Patrol's head-to-head over 10 bottles measured Partender's slider at **~6.93% averaged error**, **12%** on opaque bottles (Baileys, Clase Azul), against **2–3%** for a Bluetooth scale, and calls the marketed *"up to 99.2% accuracy"* *"an extremely inaccurate promise and complete hyperbole"*; Bar-i's structural objection is that *"two different people looking at the same bottle will often record different numbers, especially in the middle range"* and that the errors *"compound across hundreds of bottles, every count."* So the count line carries its **basis** — `exact | weighed | estimated` (§4.8) — **and it travels to the variance row.** That is not a new pattern: `00 §7 (e)` already requires the resolved **source** to travel with a value, and `apps/pos-electron/src/main/hardware-tier.ts` already ships `derived | configured | assumed` on the argument that *"a wrong tier looks exactly like a right one from the screen."* Here it is a quantity instead of a config key, and in §4.13 it is a cost. **A gap on an `estimated` line is inside the estimator's error before it is anything else**, and `10-F19` must not point a hint at it. Whether the owner *sees* the label is a founder call — §10.2.4.

**Nobody in the survey says "do not count this item partially."** The negative is stated instead — *"one common mistake in bars is ignoring partial bottles, or rounding them up or down 'roughly' instead of measuring properly"* — and what the category offers in its place is **skip the ITEM, not the partial**: key-item flags (R365, Supy, Adaco's `KeyItem`, CrunchTime's cycle counts) and frequency splits (*"perishable food weekly… items that are safe to count on a monthly basis"*). **Precision is bought by narrowing the item set, never by loosening the measurement.** That is Appendix D's tracked-item discipline independently confirmed by the whole category, and it is the reason §5.6 keeps that discipline on the **count** while lifting it off the **cost**.

⚠ **Spec acts:** `10-F17` names *"tap-to-enter quantities"* and no tiering at all; `01-F21`'s `InventoryItem` carries *"base unit, conversions"* and no count units. Proposed **`10-F29`** (count units, the three partial kinds, the line basis, and `counted: false` ≠ `qty: 0`); the `InventoryItem` carrier **folds into A5** — one `01-F21` act, not two.

### 4.12 Produce that rots — three sinks, and a refused fourth
*New under founder decision 4: "then for veggies there's wastage so is for other produce."*

Three physically different losses. The corpus already owns all three; the design's job is to route each to **exactly one** sink and to refuse to invent a fourth.

| Loss | Sink | Already specified |
|---|---|---|
| **Trim and prep loss** — peel, stem, bone, the water a marinade drives off | The **prep recipe's yield**, captured as *actual* yield on the production entry | `10-F9` (*"made 15 kg boti from 18 kg raw"*), `10-F10` (actual vs recipe yield per prep recipe; sustained deviation raises a flag) |
| **Spoilage someone finds and throws away** | The **wastage log** — item, qty, quick-tag reason | `10-F16`. `stock.wastage_record` already carries a **cashier-allow** row in the shipped matrix, so any staff member can log it without an escalation |
| **Shrink nobody logged** — dehydration, unrecorded spoilage, over-portioning | The **count**, as variance | `10-F18`; `10-F19`'s *"steady-small-gap over-portioning signature"* is precisely this signal |

**The fourth sink we refuse to build: an automatic shrink or yield percentage on the raw item.** §2's table already rejects it once on Petpooja's and Adaco's `YieldPercentage`, on the argument that loss on a boti marinade is a property of the process on the night and not of the goat. **Founder decision 3 supplies the stronger second argument: a shrink percentage is a guess that enters a ledger and comes out looking like a measurement** — the identical failure mode as a wrong tare (§4.11 (iii)) and as a plate cost with a missing ingredient (§5.6), which is **three instances of one shape inside one module.** `10-F19`'s social licence does not survive a variance report whose baseline was quietly adjusted by an assumption nobody typed.

**The cost of the refusal, stated because it is real:** a restaurant that never logs wastage sees all three losses arrive as one undifferentiated gap at the count, and cannot tell rot from theft. That is the correct outcome — `10-F16`'s own footnote says *"unlogged wastage is caught by the count ritual, which is the backstop"* — and it is why §7 ships wastage **with** the count and not after it. CrunchTime and MarginEdge both name untracked waste as a leading variance cause; a first variance report with no wastage stream is uninterpretable, which is §7's existing argument for the same thing arrived at from the other end.

⚠ **Spec act `10-F32`** — the routing rule and the refusal. Today doc 10 has all three sinks and says nowhere that they are the only three, which is exactly the silence a future session fills with a shrink factor.

### 4.13 Cost basis — *reference data on the item, resolved per period*
*New under founder decision 3. See §5.6 for the gate this feeds.*

`cost_basis(item, location, period)` resolves to **exactly one** of:

- **`receipted`** — §5.1's period pair `(value_paisa, qty_base)`, when `opening_qty + purchase_qty > 0`. Held as the **pair**, never a stored unit rate (§5.1's own rule: a rate is not an integer).
- **`reference`** — a back-office unit cost typed once on the item, when the period has no receipts. Carries no receipt, no khata entry, no supplier. **It is a legitimate first answer, not a placeholder** — without it the onboarding ramp cannot terminate, because salt bought quarterly would never acquire a basis in a weekly period.
- **`none`** — neither. The item is not costable and every figure that would contain it is refused (§5.6 R2).

Two guards, both copied:
- **A receipt line with non-positive quantity does not enter the valuation.** R365 excludes *"transaction line items with \$0 or a negative quantity"* from weighted-average calculations. It still enters `10-F14`'s khata — money spent is money spent, and the two ledgers answer different questions.
- **An explicit zero is a cost; an absent field is not.** `01-F60`'s free-modifier argument verbatim, one domain over: *"it distinguishes 'this costs nothing' from 'somebody forgot foodpanda', and those are indistinguishable under any rule that lets an unpriced modifier through."*

**The founder's *"same item from different vendors costs different… sometimes there's shortage"* is answered by the period average, not by a per-brand cost.** §4.2 already puts `brand` on the supplier item, so two brands of one item average into one `(value, qty)` pair by construction. A per-brand cost would require per-brand stock, which is Apicbase's count-at-the-package shape that §2 rejects on the count budget. `10-F15`'s price-spike flag is the surface for the shortage: **it flags the receipt; it does not adjust the valuation**, and nothing in this design lets an alert move a number.

## 5. The places doc 10 and the mainstream collide

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

### 5.6 Food cost: the scope is everything, the FIGURE is gated on completeness — and that collides with Appendix D

**Founder ruling, August 2026, verbatim:** *"it should be there but only when every item is accounted for only then we consider the food costs. otherwise we should not show false food cost if even a single item's price we don't have."* Decision 3 offered *top 10–20* versus *whole menu*. **The answer is neither: the scope is everything, and the figure is refused until it is complete.**

**(a) The collision, named — because it is real and it must not be picked silently.** `restaurant-os.md` Appendix D is binding: *"Scope discipline: top 10–20 high-cost ingredients only (~70% of food cost) — full-menu costing is where competitors' modules die."* `10-F2` implements it: *"Only items with `is_tracked` participate in deduction, counts, variance, and alerts."* **Under those two sentences the founder's rule guards a small error while a much larger one is designed in on purpose.** A recipe that is **100% complete under any coverage rule you can write** still costs ~70% of the dish, so a rendered *"food cost 22%"* against a true ~31% understates by **~30%** — permanently, by construction, and larger than most of the gaps he is worried about. **A gate at 100% coverage does not touch it.** Both sentences cannot stand as written.

**(b) Four ways out; three fail.**

| Way out | Cost |
|---|---|
| **1.** Never show a **percentage** — absolute money and variance only | Loses the one number owners benchmark against, and the one every competitor's demo opens with |
| **2.** Show the % labelled *"tracked ingredients only"* | A label beside a number is dropped by the reader. **This repo has recorded that exact failure twice on a shipped screen** — `services/api/src/summary.ts`'s `OMISSIONS` preamble: *"this table has told an owner something false **twice**, both times because a sentence about the codebase outlived the codebase, and both times it was caught by a person rather than by a suite"* |
| **3.** Require full-menu **tracking** | Kills Appendix D, kills `10-N2`'s 15-minute count, and makes onboarding the product's bottleneck. **The founder's rule as literally read lands here** |
| **4. Split the flag: what is COUNTED and what is COSTED are two different scopes** — *the one that survives* | An estimated 20–40 extra rows typed **once** at onboarding. **No ongoing workload at all.** |

**(c) The resolution — `10-F2`'s single flag becomes two, and its four consequences divide between them.**

| `10-F2` consequence | Follows | Why |
|---|---|---|
| deduction → derived movement rows, **for costing** | **`is_costed`** | Deduction is math on events that already exist. It costs no habit and no minute. |
| **counts** — membership of `10-F17`'s sheet | **`is_counted`** | This is where the 15 minutes go. Appendix D's discipline is a discipline about **this**. |
| **variance** (`10-F18`) | **`is_counted`** | You cannot vary against a count that was never taken. |
| **alerts** — par / low stock (`10-F21`) | **`is_counted`** | A par on an item nobody counts alerts against a number nobody reconciles. |

**Two invariants, both enforced at the writer** (`14-F29`/`01-F60`'s precedent — completeness is checked where the owner types, not where the report is read):
- **`is_counted ⇒ is_costed`.** A variance gap has to be valued in PKR (`10-F18`), so a counted item without a cost basis is refused at save. **This is what makes the slice-1 variance report complete by construction** (§4.9 (iii)).
- **Every leaf item of every published recipe is `is_costed`.** That is the reachable form of *"every item is accounted for"*; §5.6 (f) says what it does and does not buy.

**(d) It is not an invention — R34.** **Restaurant365** ships exactly this asymmetry: its inventory-alert catalogue carries a **Quick Cost** class (*"Quick Item Cost lacking a Conversion Equation"*) — an item that carries a **cost** without being a fully counted inventory item. The field guidance says the same thing in operator language: *"Leaving out small ingredients (salt, oil, garnishes) causes 1-2% inaccuracies in food cost calculations, so the solution is to include everything in recipes, even if it costs \$0.02."* **And RestOS has already ruled this exact shape one domain over.** `01-F60`: *"a free modifier carries an explicit `0` on every enabled pair, which is the point — it distinguishes 'this costs nothing' from 'somebody forgot foodpanda', and those are indistinguishable under any rule that lets an unpriced modifier through."* That is the founder's own argument about **selling** prices. This section applies it to **cost** prices, and salt at Rs 60/kg is the *"extra raita at 0"* of the supply plane.

**(e) What it costs, and the founder should be told it is a trade rather than told it is free.** Appendix D's binding claim is about **workload**, and Appendix D defines the workload itself: *"staff gain at most two new habits — photographing purchase invoices and a periodic guided count."* Splitting the flag leaves both untouched — the count sheet is still the 10–20, `10-N2` is unchanged, no recurring ritual grows. **What grows is onboarding: an estimated 20–40 extra rows typed once** (an estimate, not a measurement — it is the leaf set of a ~40-dish menu minus the tracked 20), **and that is precisely where Appendix D said competitors die.** So the collision is not dissolved; it is **moved from the recurring cost to the one-time cost.** Two things make the one-time cost payable that were not true when Appendix D was written: `15-F9`'s workbench already shows *"live recipe-coverage % of trailing revenue as the session progresses"*, and **founder decision 2 puts that same editor in the owner's hands**, so the ramp is no longer gated on booking a vendor session.

**(f) Three units of completeness. They fail differently, and the difference decides which surface gets which gate.**

- **Item** — costed iff `cost_basis ≠ none` (§4.13).
- **Dish** — `costable(sellable)` iff a menu recipe exists (`10-F8`'s existing test), **and** the explosion through prep recipes terminates (§4.6 refuses cycles at the writer), **and** every leaf line's item is costed. **All-or-nothing per dish.** Complete → the plate cost with its basis mix (*"all from invoices"* / *"3 lines on reference prices"*). Incomplete → **nothing**, plus the blocking item names. Never a partial plate cost: that is the Apicbase object §2 (c) rejects by name.
- **Window** — per (location, window): `costed_revenue_share` = billed revenue of lines whose sellable is costable ÷ billed revenue of all lines. **Revenue**, because `13-F5`, `14-F10` and `15-F9` all say revenue; **billed**, because `01-F63`'s attested `billed_paisa` is the number `summary.ts` already uses and a second derivation of the same figure is what `12-F21` exists to prevent. COMPLETE iff `costed_revenue_share == 1`, no sold sellable lacks a recipe, and no tracked-item consumption resolved to basis `none` (`10-F5`'s negative-stock case, where something was consumed that was never bought or counted with a value).

**The failure analysis, and it corrects the intuition.** The window gate is **not** a product of independent per-dish probabilities — the same item set feeds every dish, so it reduces to *every item appearing in any sold recipe is costed, and every sold sellable has a recipe*. That is a **finite, completable onboarding task**, not a lottery, and one item priced can unlock a dozen dishes at once. What actually breaks it is the **tail, and the tail is ongoing**: a weekend special sold four times at 1.8% of revenue with no recipe drops `costed_revenue_share` to 0.982 and **blanks the whole window's margin figure**; a new menu item published on Tuesday breaks coverage the day the menu ships. **So the dish gate fails locally and repairably (3 bad dishes, 37 true plate costs) and should be enforced hard; the window gate fails globally and re-breaks every time the menu changes.** Enforcing the founder's rule at the window with no writer-side ratchet produces a margin line that works for a week after onboarding and then never again — the adoption failure in its clinical form. **The ratchet is founder decision §10.2.2, and it is a decision precisely because both answers cost something operational.**

| Surface | Gate | FR |
|---|---|---|
| Recipe editor plate cost | **Dish** — and it must render the gap, because it **is** the repair queue | `14-F9`/`14-F10` |
| Onboarding workbench | Coverage metric + worklist ordering only | `15-F9` |
| Per-item variance **money** | **Item** (`cost_basis ≠ none`), satisfied by construction via `is_counted ⇒ is_costed` | `10-F18` |
| Variance report **total** in PKR | **Floor**, flagged, when any item is *not counted* (§4.8) | `10-F18` |
| Variance report in **quantity** | **No gate** — it needs no price at all | `10-F18` |
| Nightly summary margin line | **Window** — this is the figure he named | `12-F11` |
| Item profitability / menu engineering | **Dish**, per dish | `13-F1` |
| Prep and purchase suggestions | **No gate** — they are quantities | `10-F22`/`10-F26` |

⚠ **The gate belongs in the metric registry, not in each surface.** `13-F5` already owns *"each metric declares its minimum-data precondition… Execution below the precondition returns a typed `insufficient_data` result with the reason — **never a number**"*, `13-F1` requires definition text and a unit, and `12-F21` requires one number everywhere. Implementing this rule per screen is how this corpus's recorded drift defects happen — `01-F60`'s two declarations of the enabled set is the worked example, and it cost a whole session to unify.

**(g) The rule.**

> **A cost figure may be rendered iff every quantity in it resolves to a cost basis at the unit of the figure, and the figure states its unit and its basis.**
>
> **R1** — an unqualified ratio (*"food cost %"*, *"gross margin %"*) requires **COMPLETE** for the window it covers. Otherwise it is **omitted**, and the omission is rendered **as data** carrying what is missing and what would close it.
> **R2** — a per-dish cost is **all-or-nothing per dish**. Complete → shown with its basis mix. Incomplete → nothing, plus the blocking item names.
> **R3** — an absolute money figure may be shown at any coverage as a **labelled floor** (*"at least Rs X"*), with `costed_revenue_share` in the same sentence, and **never converted to a percentage of sales**.
> **R4** — *founder call, §10.2.3.* Whether a **scoped** ratio may be shown below COMPLETE (*"gross margin on the 62% of sales we can cost: 58%"*, scope inside the sentence and never in a footnote, floored at `13-F5`'s existing 60% rather than a new number). **This design assumes NOT**, because his words rule it out and (b)'s way-out 2 measures the label failure at two recorded instances.
> **R5 — never:** a partial plate cost; a zero standing in for an unknown cost; a grossed-up estimate of an untracked residual; a percentage of sales below COMPLETE that is not scoped per R4.

**(h) What is shown when the figure may not be — and the shape already ships.** `12-F11` says the margin line is *"omitted — never guessed, never shown as zero"*; `13-F17` says the refusal names *"what's missing"*. The executable form of both is `services/api/src/summary.ts`'s `OMISSIONS`: a rendered, wire-carried list of *"one thing this report does NOT contain, and the FR that decides it is absent"*, each entry carrying a **required** `OmissionPremise` that `__acceptance__/omission-premises.test.ts` evaluates on every run **so that an omission which becomes measurable reddens a test instead of going on lying on a screen.** The incomplete cost surface is an entry of exactly that shape, and it carries three things: the **coverage %** (a true number about a true thing — how far onboarding has got, not a scoped estimate of margin), the **named blocking items or sellables**, and **what would close it**. All three of `10-F8`, `14-F10` and `15-F9` already publish a coverage number — in the variance report, in the editor, and live in the workbench — **and (j) records that they do not agree on its denominator**; the ramp adds a target and an ordering, not a metric.

**(i) The onboarding ramp — his *"on onboarding they won't have all the data"*, answered.**
1. **A reference price is a legitimate day-one answer** (§4.13). Salt is costed the moment Rs 60/kg is typed, and receipts overwrite it per period the moment one arrives. Without this the ramp cannot terminate.
2. **Order the worklist by revenue, not alphabetically.** Sort candidate items by the trailing revenue of the sellables they block, so the item that unlocks the most dishes is first. **No product in the survey publishes an ordering**, so this one is ours; it is a sort, and it is the difference between a ramp that visibly converges and a list of 40 rows.
3. **The dish gate is the repair queue.** A plate cost that refuses names its blockers, in the editor where the owner already is — `14-F29`'s precedent that the writer is where completeness is met.
4. **The margin figure appears the day the org completes, and not before.** That is the ruling. Until then the omission is on the screen doing the honest work, which is a better first week than a number that is wrong by 30%.

**(j) Spec acts owed — and one of them touches the seed.**
- **`10-F31`** (new) — the two scopes, the basis triple, the three units of completeness and R1–R5. It **supersedes `10-F2`** with a strikethrough and a pointer, per `00 §8`; `10-F2`'s ID is never renumbered or deleted.
- **`10 §1` and `10 §7` layer 2** — the *"owners never do recipe data entry"* / *"never free-form owner entry"* clauses, under **founder decision 2** (§10.1). Three clauses, one act.
- **Appendix D's scope-discipline sentence.** ⚠ **The licence is doc 10's own header** — *"Seed: `restaurant-os.md` Appendix D — carried over wholesale unless amended here"* — so the amendment can live entirely in doc 10 and `restaurant-os.md` need not be touched. **But then Appendix D goes on saying the old thing to anyone who stops there**, and the authority order puts `restaurant-os.md` first. Two options: doc 10 carries the amendment alone (cheap, and leaves a stale seed), or Appendix D gains a one-line pointer (a second file in the PR, and the seed stays readable on its own). **Recommend the pointer.** Founder's call on which, because it is his seed document.
- **`13-F5`'s `margin.gross_estimate` precondition** — *"recipe coverage on items representing ≥ 60% of period revenue"* — is **overruled by this ruling** and must be amended or retired. `12-F11` cites it by reference and follows automatically. If §10.2.3 rules R4 in, the 60% survives as the floor for the *scoped* ratio only; if not, it goes.
- **`10-F8`** — its *"recipe-coverage % of sales"* is ambiguous where `13-F5`, `14-F10` and `15-F9` all say **revenue**. Amend to revenue, and to count a **costable** recipe rather than a mapped one, because a dish whose recipe points at an unpriced ingredient is *covered* under `10-F8` today and cannot be costed.

### 5.7 The count budget survives both new tiers — but only just, and the arithmetic is an estimate

`10-N2` is **20 tracked items ≤ 15 min, ≤ 3 taps per item**, and §4.7 and §4.11 both spend against it. **The literature publishes no per-item food figure, so the baseline is a model and is labelled as one:** locate + look + enter ≈ 25–35 s/item ⇒ **8–12 min for 20 items**, leaving **3–7 min of slack**.

| Option | Taps/item | Δ on 20 items | Verdict |
|---|---|---|---|
| One whole-container unit (`none`) | 2 | 0 | Fits |
| `fraction` tier on ~6 items | 3 | +20–30 s — the **deciding look**, not the tap | **Fits** |
| `weight` tier on ~6 items, scale in hand | 3 | +2.5–3 min (15–20 s/item handling, +1 min fetch and zero) | Fits, and spends a fifth of the budget on six items |
| Area split on ~5 items (§4.7) | 2–3 per line | +2–3 min (5 extra lines, and the walk between rooms is already in the baseline) | Fits |
| R365's three UOM boxes on all 20 | **≥4** | +2–3 min | **Breaks both budgets** — the reason §4.11 caps at two |
| Freepour-style scan-and-weigh | n/a | 3 s/bottle claimed | Dedicated hardware, one bottle shape. Not reachable, and Appendix G's BYO rule forbids depending on it |

**Read together, `weight` on six items plus an area split on five consumes the whole 3–7 min slack.** That is not a reason to drop either — it is the reason the partial tier is a **per-item policy set at onboarding** rather than a per-count choice (§4.11), and the reason `10-N2` is an acceptance number for slice 1's demonstration rather than a claim to make in advance.

---

## 6. Events, permissions, and the spec acts owed

**Nothing the founder's two answers add invents an event type or a permission action either.** Count units, scope flags, reference costs and storage areas are all **reference data**; the count's new line shape is a payload change on a type already catalogued; the shrink routing rule reuses `10-F9`/`10-F16`/`10-F18` unchanged. **What they add is four FRs and five amendments** (below), and one of those five touches the seed.

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
| A9 | A modifier leg on `order.line_added` so priced modifiers can deduct (founder item 10) | 01 + 02 | caps `10-F8` coverage — ⚠ **and now possibly the window gate itself, §10.2.1** |
| **A10** | **`10-F29`** — count units, the three partial kinds, the line **basis**, and `counted: false` ≠ `qty: 0`; amend `10-F17` (tiering) and `10-F18` (what a *not counted* item does to the report). Carrier for `count_units` folds into **A5** (§4.11) | 10 (+01 via A5) | slice 1 |
| **A11** | **`10-F30`** — an item is counted in one or more **areas**; a line per `(item, area)`, summed to the item; area membership is reference data; the balance stays at `(item, location)`. Amend `10-F17`'s singular *"per-location storage-layout order"* (§4.7) | 10 | slice 1 |
| **A12** | **`10-F31`** — `is_counted` / `is_costed`; the `receipted \| reference \| none` basis; the three units of completeness; R1–R5. **Supersedes `10-F2`** (strikethrough + pointer, `00 §8`) (§5.6) | 10 | slice 1 |
| **A13** | **`10-F32`** — the three shrink sinks, and the refusal of an automatic shrink or yield percentage on the raw item (§4.12) | 10 | slice 1 |
| **A14** | **Founder decision 2** — `10 §1`'s *"owners never do recipe data entry"*, `10 §7` layer 2's *"never free-form owner entry"*, and Appendix D's *"vendor-onboarded, never owner data entry"*. **Three clauses now false; one act.** ⚠ `14-F9` is already correct (*"editable by the vendor onboarding team **and permitted org users only**"*) and `catalog.edit_recipes` is already owner-only in the shipped matrix — **doc 14 was right and doc 10 was not**, so this costs nothing in code | 10 (+ seed) | §5.6's ramp |
| **A15** | **`13-F5`'s `margin.gross_estimate` precondition** (≥ 60% of period revenue) is overruled by founder decision 3 — amend or retire; **`10-F8`**'s *"% of sales"* → **revenue**, and coverage counts a **costable** recipe rather than a mapped one (§5.6 (j)) | 13 + 10 | the margin line, not slice 1 |
| **A16** | **Appendix D's scope-discipline sentence.** Doc 10's header licenses the amendment in doc 10 alone; a one-line pointer in Appendix D keeps the seed readable on its own. **Recommend the pointer — founder's call** (§5.6 (j)) | 10 (+ seed) | nothing; it is the record |

A8 and A9 are on the list because he asked and because two written FRs already depend on A8 (`02-F10`, `02-F14`) — **not** because this module should build them. **A10–A13 are slice-1 gates in the same sense A1–A6 are: nothing below is legal first.** A15 and A16 are records rather than blockers — the margin line has no consumer in slice 1 and the seed amendment blocks no code — but **A15 in particular must not be allowed to drift**, because a green `13-F5` precondition defending an overruled threshold is the exact shape of the `catalog-pricing.test.ts:394` failure this repo took three weeks to notice.

---

## 7. The build sequence

### What the founder's answers change about the sequence

**Three things got bigger and one got smaller.** Bigger: the **count** (areas, the partial tier, `counted: false`, the line basis — §4.7, §4.8, §4.11); the **reference artifact and its editors** (count units, two scope flags, a reference cost); the **read model** (a cost gate, coverage %, and an omission that renders). Smaller: **the phone.** *"Which device doesn't matter"* retires §9 q2 as a **blocker** — the count ships on the till in slice 1 with zero new platform work, and the React Native port becomes a port rather than a precondition. `packages/ui` still ships zero RN components and that stays true; it is now a slice-3 question, not a slice-1 one.

**None of it changes what slice 1 IS.** The variance loop is still the smallest thing a real restaurant gets value from, and it is still the first thing built — because the founder's honesty rule lands on the food-cost **ratio** and the variance report in PKR is **complete by construction** under `is_counted ⇒ is_costed` (§4.9 (iii)). **The one real re-sequencing is that the food-cost figure leaves slice 1 entirely** and is replaced by the surface that says why it is absent.

### Slice 1 — **the variance loop, and it deliberately ships WITHOUT a food-cost figure.**

The industry's own minimum is precisely this: MarginEdge's usage report needs two closed counts, purchases and recipes, and nothing else. Ours adds wastage, because without it the first variance report is uninterpretable and *"reconcile"* fails on day one — MarginEdge and CrunchTime both name untracked waste as a leading variance cause, `stock.wastage_record` already has a cashier-allow row, and §4.12 routes two of the founder's three produce losses through it.

**What a real restaurant gets in week one, stated as the sentence a pilot owner would read:** *"You are Rs 14,200 of chicken short this week, the gap is concentrated on Friday and Saturday, and it is more than every void and every logged wastage put together."* That is `10-F18` plus `10-F19`, in money, complete, with no estimate anywhere in it. **What it does not get is a food-cost percentage**, and the screen says so and says what would close it (§5.6 (h)).

1. **Spec acts A1–A6 and A10–A13.** They are the gate; nothing below is legal first.
2. **`packages/domain`** — three payload schemas (`purchase_recorded`, `wastage_recorded`, `count_recorded` — the last one carrying §4.8's line shape, `counted` boolean and basis included); wire up `mg`/`ml`/`units`, deleting their `@unreached-owed` markers.
3. **`packages/inventory`** — the recipe explosion (with writer-side cycle refusal), the order-free deduction set (§5.2), period arithmetic on `(value, qty)` in BigInt, the `10-F18` variance formula with §4.9's three amendments, the area rollup (§4.7), the partial-tier arithmetic in BigInt (§4.11), and **the three completeness predicates — item, dish, window (§5.6 (f)) — as pure functions here and nowhere else.** No I/O.
4. **Reference artifact** — the `inventory` resource in `packages/sync-protocol` + golden fixture; the named producer in `services/api`; the device consumer in `packages/sync-client`. Rows now include count units, area membership, the two scope flags and the reference cost.
5. **`apps/backoffice`** — item editor (base unit, **`is_counted` / `is_costed`**, **count units and the partial kind**, **reference cost**, par, **area membership and sort**), supplier + supplier-item editor (brand, pack triple), and `14-F9`'s **two** recipe editors carrying **the dish gate and its blocking-item list** (§5.6 (f)) plus `14-F10`'s coverage %. `14-F32`'s one-task-per-job discipline applies. **The two writer-side invariants of §5.6 (c) are enforced here**, because `14-F29` is the precedent that completeness is met where the owner types.
6. **Device surfaces** — receiving (`10-F13`'s prefill, no photo), wastage (item, qty, quick-tag reason, no photo), the blind guided count (`10-F17` order, ≤3 taps, same-day resume as device-local state, **a line per `(item, area)`, the partial tier the item declares, and an explicit *not counted* that is not a zero**). **On the till** — founder decision 4.
7. **Cloud read model** — derived movements, period valuation, the variance report with `10-F19`'s corrected hints, *not counted* rows and the floor flag; `costed_revenue_share` per (location, window); the back-office variance view; **and the rewritten omission entries in `services/api/src/summary.ts`.**

⚠ **Two of the seven `OMISSIONS` entries redden the day step 2 lands, and that is the gate working — plan the change to include them.** `__acceptance__/omission-premises.test.ts` evaluates every entry's premise on every run. *"Purchases and wastage logged"* pins `stock.purchase_recorded`, `stock.wastage_recorded`, `stock.count_recorded` and `stock.movement_recorded` as **unemittable**; *"What's odd (exception alerts)"* pins the first and third for two of `13-F10`'s six detectors. Slice 1 writes three of those four schemas, so **both entries must be rewritten in the same commit — not deleted.** What they now omit is different and smaller, and that is a sentence someone has to write.
⚠ **The margin entry must NOT redden, and keeping it honest constrains step 4.** Its premise pins `stock.movement_recorded` (slice 1 does not write it) **and the complete key set of `CatalogEntryWire`** — deliberately the whole set, because *"no forbidden-name list can guess what it will be called."* **So cost must not ride the catalog entry.** That is the same argument §4.6 makes for MenuRecipe — a recipe edit would re-version the menu every till holds — arrived at independently, and it is now also what keeps a rendered omission from going stale. Inventory cost rides the `inventory` reference resource (A1).

**Acceptance for slice 1, and it is a demonstration, not a suite (R43):** author 15 counted items with their count units and area membership, and enough recipes to cost them; receive an invoice; ring a service; log one wastage; count — **including one item split across two areas and one bottle counted on the partial tier**; read a variance report in PKR whose numbers reconcile by hand. Then **submit a count with one area line missing and confirm the item reads *not counted*, the total is flagged a floor, and nothing anywhere shows a zero.** Two closed counts make the second report meaningful — say so to the pilot, because the first period has no opening.

**Which of his nouns slice 1 delivers:** 1, 3, 4, 6 (receipt-level), 7, 8, 9, 10, 11 (as costing — the dynamite sauce works), 15, 16, 17, **18 (the ketchup split), 19 (the half bottle), 20 (produce shrink, routed to three sinks)**.

### Slice 1 deliberately omits

| Omitted | Why |
|---|---|
| Production events; prepared items as counted stock | The chain already costs and deducts correctly through prep recipes (§4.6) — the R365/xtraCHEF position. Needs a permission action (A7) it does not have. |
| Transfers (`10-F11`, `10-F12`) | Single-branch pilots. `10-F1`'s location model already supports them; the events are catalogued; nothing here forecloses them. |
| Photos on invoice and wastage (`10-F13`, `10-F16`, `10-N4`) | Object storage + a deferred upload queue is its own subsystem. `10-N4` says capture must never be blocked by connectivity; a no-photo record is a complete record. |
| Price-spike (`10-F15`), low-stock (`10-F21`), count-overdue (`10-F20`) flags | Three alert types with **no consumer surface built** — doc 05's console renders only (R48) and doc 12's owner app is a stub. Building a producer for an absent consumer is this repo's own named recurring defect. |
| Prep planning, forecasting (`10-F22`..`10-F27`) | `10 §1` waves them to 3/4; they need history slice 1 does not have. |
| Purchase orders | `DEC-SUPPLY-001`: *"PO entity undefined,"* deferred to W4. |
| Lots, expiry, FEFO | §4.5. **Founder decision 1, now DECIDED out** — not deferred pending a ruling. |
| Storage areas as stock **locations** (a second balance, per-area variance, intra-branch transfers) | §4.7. Areas partition the **sheet** and ship in slice 1; they never become locations. |
| **The food-cost / gross-margin figure itself** | §5.6. The window gate is **unreachable on day one by construction** — an org has to complete first — and its consumer is `12-F11`'s line in doc 12, which renders an omission today. Slice 1 ships the three predicates, the coverage number and the honest surface; the figure appears when an org earns it. |
| **The org-level completeness ratchet at the writer** | §5.6 (f) and §10.2.2 — a founder decision. The **dish-level** refusal in the recipe editor is the half that ships regardless, because it is the repair queue. |
| **A scoped ratio below COMPLETE** (R4) | §10.2.3 — a founder decision, and this design assumes not. |
| **The phone/tablet count surface** | Founder decision 4: *"which device doesn't matter."* The till ships. The RN port waits on a PIN session (§9 q2) and an RN component set (§9 q3), and neither is a slice-1 blocker any more. |
| **An automatic shrink or yield percentage** | §4.12 — refused, not deferred. |
| Storage guidelines, SOPs | Item 13/14 — `11-F18`'s carrier, blocked at `01-F75`, and not ours to unblock. |
| Invoice OCR | `10 §9` q1, deferred there. |
| Modifier deduction | A9 — a doc-01/02 act on a protected path. |

### Slice 2 — **the physical acts, and the first org to complete.** Production (`10-F9`, `10-F10`, + A7), transfers with in-transit and receive-discrepancy (`10-F11`, `10-F12`), prepared items counted as stock, photos, and the three alert types **once doc 05 or doc 12 has a surface to show them on**. **Plus the cost half that slice 1 earns the right to build:** the window gate wired to `12-F11`'s margin line, the ratchet if §10.2.2 rules it in, and A15's amendment to `13-F5` landing **in the same change as the first margin figure ever rendered** — because a precondition defending an overruled threshold beside a live number is the `catalog-pricing.test.ts:394` shape exactly.

### Slice 3 — planning and forecasting (`10-F22`..`10-F27`), invoice OCR, and the React Native count port (§9 q2/q3). **Lots and expiry are out and stay out** — founder decision 1 is ruled, and the only thing that reopens §4.5 is its own named trigger, not a slice.

---

## 8. Where this module can produce the repo's two recurring defects, and the guard for each

- **A correct subsystem with no seam to the product.** The named trap here is `01-F75` clause 9's own worked example: the catalog's reference fan-out shipped with **zero production callers**. Guard: the acceptance for step 4 is an author-in-back-office → appears-on-device round trip, and the seam is mutated (delete the publish call) to confirm something reddens.
- **A correct component that is not on the screen.** The count sheet and the receiving form are dense list surfaces on a 10.1″ tablet — `layout:check`'s worst case. Guard: both enter the layout gate's fixture in the same change that builds them, because the gate only sees states its fixture produces.
- **A guard aimed one case away.** The deduction fold's suite must mutate the *set difference* (drop the `line_removed` subtraction; drop the `order.confirmed` requirement) and confirm the specific assertion that owns each fails, with a one-branch control. A convergence test alone passes a min-id tiebreak.
- **A guard aimed one case away — the COUNT edition, and it is the highest-risk one the founder's answers add.** §4.8's `counted: false` ≠ `qty: 0` is invisible to any suite that submits **complete** counts, and every implementation passes such a suite — **including the one that treats a blank as zero, which is R365's shipped behaviour** (§2 finding (d)). The oracle must submit a count with **one area line of a two-area item missing** and assert three separate things: the item's variance row reads *not counted*, the report's PKR total is flagged a floor, and **no zero appears anywhere for that item**. The mutant is *treat a blank as zero*; it must redden **each** of those three assertions, with a one-branch control that differs in nothing else.
- **A guard aimed one case away — the COST edition, and this repo has already run this exact experiment and lost.** The round-3 law's `F60` instance: *"`F60`'s amendment test published a **fully priced** entry, so it could not distinguish 'refused for the right reason' from any refusal."* §5.6's gate is the same shape and will reproduce it. Required fixtures: (i) a recipe missing **one** leaf price; (ii) a recipe whose leaf is priced at an **explicit `0`** — the fixture that catches a truthiness test and the one §4.13's `01-F60` argument exists for; (iii) a sold sellable with **no recipe at all**; (iv) a fully complete recipe as the control. An implementation that refuses (ii) passes a badly built suite and is wrong.
- **A stub is a supply, and `seams:check` cannot see it.** The reference-cost lookup is a port. AGENTS.md measures the blind spot exactly: replacing a real publisher with an in-memory stub left `pnpm verify` exit 0, `seams:check` clean and 111 of 116 tests passing while the product shipped no menu. The hand-written assertion is that **a plate cost changes when a reference price changes**, end to end through the reference artifact — not that a lookup was called.

---

## 9. Open questions — engineering

1. **The cross-service read.** Back-office inventory reads over the gateway's internal HTTP surface inherits `DEC-ARCH-001`'s unresolved ⚠ about a second service holding a kernel handle. Precedent points both ways; whoever builds step 7 sets it.
2. **Count on the phone needs a PIN session that does not exist — and this is no longer a slice-1 blocker.** Founder decision 4 retired the device question (*"which device doesn't matter"*), so the count ships on the till and this becomes a **port**, scheduled in slice 3. The obstacle is unchanged: `apps/manager` is a real Expo RN app that opens a real device store (`packages/sync-client/src/rn.ts`, `storage-op-sqlite.ts`) but has **no PIN session**, so `actor_user_id` would be `null` on every count — and `10-F19`'s attribution hints against a null actor are worthless. Argon2id on React Native is a native-module question. ⚠ **`10-F17` says *"on a phone/tablet"* and slice 1 ships a till surface**, so either the FR is amended to name the device as a layer-3 choice (`10 §7` already puts *"which station device hosts the count flow"* at layer 3, so the amendment is nearly free) or the till surface is out of contract on a technicality. Recommend the amendment; whoever builds step 6 raises it.
3. **`packages/ui` ships zero React Native components** (measured: 22 exports, no `react-native` import anywhere in `packages/ui/src`). Any phone surface breaches commandment 6 or waits for an RN component set. Slice 3, with q2.
4. **Cycle detection depth.** No product in the survey documents a nesting limit or a cycle check. We refuse at the writer; the traversal bound is an engineering choice.
5. **`10 §9` q5** — checkpointing derived rows as events for external audit export. Left open; this design does not take it.
6. **Does the window gate compute per branch or per org?** `costed_revenue_share` is defined per (location, window) (§5.6 (f)), but doc 12's owner summary spans `reportScope`-narrowed branches and `12-F21` requires one number everywhere. A mixed org — branch A complete, branch B not — needs a stated rule. **Recommend the same rule one level up: the org line appears only when every in-scope branch is complete**, because the alternative averages a complete branch with an incomplete one and produces the understated figure §5.6 (a) exists to refuse. Whoever builds step 7 sets it.
7. **Where does the reference cost live in the reference artifact?** Beside the item in the single `inventory` resource (A1), or as its own resource. **Recommend one resource**: two publishers of one number is the drift `01-F60`'s single-declaration fix already paid for once in this codebase, and §5.6 (h)'s omission has to name a source that cannot disagree with itself.
8. **Area membership is reference data, but who declares it?** The back-office item editor (step 5) is the obvious home and matches `10 §7`'s layer 2 *"storage-layout order"*. A counter who finds ketchup in a third room has no way to say so mid-count, and the honest slice-1 answer is that she counts it into an existing area and the owner fixes the reference data after. Naming it here so nobody invents a mid-count area-creation flow.


---

## 10. Founder decisions

### 10.1 Taken (August 2026) — five of the six, and two of them were not the answers on offer

| # | Ruled | What it changed here, and what it cost |
|---|---|---|
| **1** | **Expiry and lots are OUT.** Receipt-level history (`10-F13`/`10-F14`) is what serves *"which item arrived when."* | §4.5 stands unamended and is now a ruling rather than a recommendation. **The cost is paid and named: expiry goes unserved.** `10-N2`'s ≤3 taps and 15-minute budget survive, and `10-F6`'s valuation stays period-weighted rather than FIFO — which matters more than it looks, because FIFO is order-dependent and therefore illegal under law 1 (§5.1 (b)). §4.5's reopen trigger is the only route back. |
| **2** | **The owner authors recipes in the back office. The RestOS team uses the same editor on a pilot's behalf.** | ⚠ **Three spec clauses are now false** — `10 §1`'s *"owners never do recipe data entry"*, `10 §7` layer 2's *"never free-form owner entry"*, Appendix D's *"vendor-onboarded, never owner data entry"*. **A14** is one act covering all three. **It costs nothing in code**: `14-F9` already reads *"editable by the vendor onboarding team **and permitted org users only**"* and `catalog.edit_recipes` is already owner-only in the shipped matrix — **doc 14 was right and doc 10 was not.** `15-F9`'s workbench survives unchanged as *the same editor with a different actor*, attributed per its own last line. **§5.6 (e) depends on this ruling**: the completeness ramp only converges if the owner can close a gap without booking a vendor session. The real cost is support, not build — a wrong recipe silently mis-costs every dish, which is exactly what §5.6's dish gate and blocking-item list exist to make loud. |
| **3** | **Not top-10–20, and not the whole menu. The scope is everything, and a food-cost figure is shown only when it is complete** — *"we should not show false food cost if even a single item's price we don't have."* | **§5.6, the largest change in this amendment.** It **collides with Appendix D**, which is binding, and the collision is named rather than picked: the resolution is that `is_tracked` **splits** — Appendix D's discipline keeps the **count**, and **costing** gets its own scope and its own gate. Copied from R365's **Quick Cost** class; argued in-corpus from `01-F60`'s explicit `0`. **The cost is moved rather than removed**: no recurring workload grows, an estimated 20–40 rows are typed once at onboarding, and *that* is where Appendix D said competitors die. Spec acts A12, A14, A15, A16. |
| **4** | **The device does not matter.** The questions are the split store/kitchen, the half-used bottle, and produce that rots. | The phone-versus-till question is **dead** and §9 q2/q3 stop being slice-1 blockers (the count ships on the till). In its place: **§4.7** (one balance, N count lines — R365's shape), **§4.11** (two count tiers, a per-item partial policy, **no stored tare**, an `estimated` basis that travels), **§4.12** (three shrink sinks and a refused fourth), and **§4.8**'s `counted: false` ≠ `qty: 0`, which is the quiet one and the most important. **The cost is the count budget**: §5.7 measures it as fitting with 0–4 min of slack left, on a model rather than a measurement. Spec acts A10, A11, A13. |
| **6** | **The order→customer link belongs to doc 02's slice, not this module's.** | §1 row 2 and **A8** are unchanged; they stay on the amendment list because two written FRs already depend on the link (`02-F10` search by phone, `02-F14` khata requires a linked customer) and because he asked. **This module does not build it and does not wait for it.** |

### 10.2 Remaining — four, each a real either/or

**1. Do priced modifiers deduct stock?** *(Carried from decision 5. Founder decision 3 raised the stakes and the old framing understated them.)*
Today *"extra raita"* sells at a price and consumes nothing, because `order.line_added` is `{order_id, line_id, item_id, qty, unit_price_paisa}` with no modifier attachment (§1 row 10).
**No:** cheap, and `10-F8`'s coverage % honestly reports the hole rather than hiding it. ⚠ **But under §5.6 the hole may now be permanent.** The window gate requires every sold sellable to be costable; `modifier` is a `SELLABLE_KIND` under `01-F60`. **If a paid modifier is rung as its own line it carries revenue the gate will demand a cost for, and the org can never reach COMPLETE — so the margin figure would be refused forever for any restaurant selling a paid add-on.** If it is not rung as a line at all, its price sits inside the dish's line and the gate is silent about it. **Which of the two ships is doc 02's, not ours**, and this design does not assert it — but the decision's cost now depends on it, so it must be answered before the ruling is meaningful.
**Yes:** `order.line_added` gains a modifier attachment — a schema change on the **money ledger**, a protected path under commandment 10 and R35's full-adversarial tier, plus a doc-01 and a doc-02 act.

**2. The completeness ratchet: refuse the publish, or drop out of COMPLETE?**
Once an org has completed, publishing a sellable with no recipe — or a recipe with an uncosted leaf — breaks the window gate and the margin line vanishes. §5.6 (f) shows this is not an edge case: **the window gate re-breaks every time the menu changes**, so without an answer the margin line works for a week after onboarding and then never again.
**Refuse the publish:** `14-F29`/`01-F60`'s exact precedent — *"saving an item that leaves an enabled pair unpriced is refused"*, completeness enforced at the writer. **Cost:** an owner cannot put tonight's special on the menu at 18:00 without first authoring its recipe and pricing its leaves, on the surface `14-F32` designed for speed — and what is blocked is *publishing a price*, which is how the till learns to sell the thing at all.
**Drop out, warned in the dialog:** the publish succeeds, the org leaves COMPLETE, and the margin figure is replaced by its omission naming the special. **Cost:** the owner is told at 18:00 and notices at 23:00; and this is §5.6 (b)'s way-out 2 in disguise, which this repo has measured failing twice. The mitigation is that the number **disappears** rather than being labelled, which is a stronger signal than a label — but it is still a signal she has to read.
**Recommendation: drop out, warned** — a refusal that stops a menu change is a worse operational failure than a missing metric. ⚠ **But the precedent points the other way**, because the founder already ruled *refuse* on prices, so this is genuinely his.

**3. Below COMPLETE: a scoped ratio, or nothing at all?** *(§5.6 R4.)*
**Nothing (what his words say, and what this design assumes):** `12-F11`'s *"omitted — never guessed, never shown as zero"* applies unchanged and gets stricter. **Cost:** an owner in month one sees a hole where every competitor shows a number, and month one is where a demo lands.
**Scoped, with the scope inside the sentence and never in a footnote** — *"gross margin on the 62% of sales we can cost: 58%"* — floored at `13-F5`'s existing **60%** rather than a new number. **Cost:** it is a food-cost figure that is not the food cost, which is the thing he ruled against; and §5.6 (b)'s way-out 2 measures the reader-drops-the-label failure at **two recorded instances on a shipped screen in this repo.**
**Either way, A15 is owed:** `13-F5`'s `margin.gross_estimate` precondition encodes the 60% threshold this ruling overruled. Ruling R4 in keeps the number for a scoped ratio only; ruling it out retires the number. **Leaving `13-F5` as it stands is the one outcome that is wrong under both answers.**

**4. An estimated count line: labelled and hint-suppressed, or treated as a measurement?**
§4.11's `fraction` tier carries a **measured ~6.93% averaged error** (Bar Patrol, head-to-head over 10 bottles; **12%** on opaque bottles) against **2–3%** for a scale.
**Labelled and suppressed:** the variance row says the count was estimated, and `10-F19` fires no attribution hint on a gap inside the estimator's error. **Cost:** the report is noisier, and an owner who sees *estimated* on six of twenty rows may discount the whole page — including the fourteen that are exact.
**Treated as a measurement:** the report reads clean, and a 7% estimation artifact is indistinguishable from a 7% theft gap. **Cost:** `10-F19`'s entire social licence — *hints, never accusation* — pointed at a bottle nobody stole. Bar-i's finding is that *"two different people looking at the same bottle will often record different numbers"*, so the artifact is not even stable between counts and would read as a *recurring* gap on one item.
**This is the same ruling as decision 3 applied to a quantity instead of money** — do not show a number you cannot stand behind — which is why it is his and not engineering's. The design ships the basis on the line either way (§4.8); the decision is only whether the owner sees it.
