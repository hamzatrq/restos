# 27 — The Design Language: Colour, Type, Numerals, Icons, Tokens

**Engineering standards — Draft 1, July 2026** · Parent: `21-ux-system.md` (this doc is its visual layer; 21 owns the defence layers, role laws and testing protocol). Extends `18-engineering-handbook.md` §7–§8. Evidence base: four parallel research passes, condensed in `plans/wave-1/research/*.md` with sources; every number below traces to one of them.

**What this document is for.** Doc 21 makes UX quality structural — closed vocabulary, budgets, role contracts, staff testing. It deliberately does not say what things should *look* like. This does. It exists because we have no designer, so the visual language must be derived from evidence and written down rather than improvised per screen by whoever is generating code that day.

**The two facts that generate almost every rule here.**

1. **The non-reader is the median user, not an edge case.** Pakistan adult literacy is 58.86%; the 2023 census gives 74.1% urban against 51.6% rural, with rural female ~47.5%, and 67.5% of "educated" Pakistanis below matric. Roughly four in ten adult staff cannot read the labels.
2. **Removing text does not fix it — flattening does.** With *entirely graphical, zero-text* interfaces, deep-hierarchy task success was **91% for high-literacy users and 40% for low-literacy ones**; failing users guessed at random because they did not grasp that a top-level graphic stood for a group of pages. Text is the obvious barrier. Nesting is the real one.

**And the tension that stops rule 1 becoming an excuse for a slow product.** Graphical UIs measured **100% task completion at 13 minutes and 14 prompts**, against a voice UI at 72% and 5.2 minutes. First-use success and rush-hour speed are different variables and the literature optimises only the first. A POS that every waiter can eventually use and no waiter can use at 8pm on a Friday has failed. **Speed comes from positional memory on a stable grid, not from cleverness.**

## 1. Layout law — flat, paged, positional

- 27-F1 **Maximum navigational depth on any operational screen is ONE.** Categories are page tabs or fixed section headers, never a drill-down. This overrides tidiness: the source research says *"minimize hierarchical depth even at the expense of conciseness."*
- 27-F2 **Flat paged grids, not scrolling lists, for anything actionable.** The law is the SHAPE — flat, paged, lateral — not a fixed item count. The tested layout (6 items per page, 3×2, 7 pages ≈ 42 items) beat a 4-level hierarchy at equal tap count, 25 s vs 65.5 s and 100% vs 80%, **on a phone**. Transplanting "6" to a 22-inch counter screen would be a category error: **page capacity is derived from the surface's usable area and 27-F8's target size, never fixed by this document.** Nearly half of field subjects did not know content existed below the fold, so **no primary action may require scrolling to reach** — page laterally instead.
- 27-F2a **Persistent category tabs are lateral, not depth.** A always-visible tab strip plus lateral paging within the selected tab is depth ONE and satisfies 27-F1: the operator never descends into a category and loses their place. A category that must be *entered*, hiding its siblings, is depth two and banned. This is what makes 02-N2's 300-item catalogue buildable — ~12 persistent tabs, each paging laterally — without the nesting that measured 40% task success.
- 27-F3 **Back and forward controls are adjacent and differ only by arrow direction.** In the study where back was understood, it was understood *because* it sat beside the forward control already in use.
- 27-F4 **Grid position is a compatibility contract** (strengthening 21 §5's cashier law to a platform rule). Adding, removing or reordering an item on an operational grid is a **breaking change** requiring PR justification and a dev-pilot acclimation window. **No adaptive, frecency-sorted or personalised ordering anywhere staff-facing** — static menus measurably beat adaptive ones, and 23 of 34 field subjects could not perform a task they knew well on a differently-arranged device. **Amended July 2026 (gap G17, founder ruling): for ORG menu content this binds through `14-F28`'s timing rule — edits default to the 05:00 day boundary so a grid never moves under a cashier mid-shift, with an explicit per-edit 'apply now'. For the VENDOR's shipped grid structure it binds absolutely.** **Amended August 2026 (founder ruling) — the first PR justification this FR has ever been given, and it is recorded here rather than in a commit message so it is checkable.** `packages/ui`'s `compact` mode became a real arrangement (`DEC-HW-001`, bring-your-own-hardware: the window floor is millimetres of glass and cheap 10.1″ tablets now ship), and **four positional changes were APPROVED** as the price of the counter running on hardware a restaurant already owns: (a) the tab rail moves from the **top edge to the left edge** — same five tabs, same order, all visible and labelled, and it is the biggest single lever in the shell because a horizontal rail costs 13.5 mm of vertical chrome on *every* surface, over a tenth of a 126 mm panel; (b) the Cash tab's four paid-out reasons wrap **4×1 → 3+1**, so `Other` moves from fourth-across to first-on-next-line; (c) `Receipt photo` / `Paid out` go from one row of two to **two rows of one**; (d) the Pay tab loses its panel border on compact — chrome, not a control. **The governing rule these were tested against, and it is what makes them approvable rather than breaking:** a mode may change *where* a thing is and *how big* it is, **never what is there, or in what order** — asserted now by `surface-mode-contract.dom.test.tsx` (DOM/reading order) and the layout gate's `mode-contract` (measured visual order, 6200 position pairs), because before August 2026 nothing in the product asserted it and a mode that silently dropped a control would have passed every gate. **A dev-pilot acclimation window is owed on all four**, per this FR's own requirement. **One pre-existing change is NOT approved and is a separate question:** on a 32″ panel the Cash tab's paid-out reasons sit *above* the keypad and on 15.6″ *below* — that is a positional change between two pieces of glass which the reflow reading permits, and it predates the compact work.
  - **Amended August 2026 (founder ruling) — TWO FURTHER POSITIONAL CHANGES APPROVED, both on the counter's Order surface, and the justification this FR demands is recorded here rather than in a commit message so it stays checkable.** Neither was found by taste: both were read off the shipped screen against `02-F1`'s own creation rule. **(e) The CHANNEL row moves ABOVE the order-type row.** The till refuses to create an order with no channel latched, so channel-then-type is the work order; `27-F7` makes a list's visual order its work order and `27-F58` fixes the reading order top-down, so **the row order is the instruction** and the two contradictory English hint lines (`02-F49` (a)) existed only because the rows were the other way up. The cost is accepted and named: the three type tiles and the confirm control move down by one row, and a dev-pilot acclimation window is owed. This was refused once on exactly that ground — *"keeping a learned control where a finger already goes is the stronger half of `27-F4`; the reading order is the cost, and it is paid by the state line above"* — and that trade is now rejected, because **the line paying the cost was false**, and `21 §5`/`00 §5.6` put the operator at plausibly non-reading, so a sentence was never able to pay it. **(f) `Send to kitchen` moves to the FOOT OF THE CART COLUMN and is PINNED there.** It sat ~2.5 mm from `Delivery` in the type row, and since `DEC-MONEY-009` lifted the greying on that row an undershoot **starts a new order and switches the cart** — so the confirm control's neighbour was "abandon this cart", which is `27-F9`'s adjacency rule broken on the counter's highest-frequency row and which no acclimation window trains away. It also acts on the CART rather than on the type row, and now ends where the eye already ends. **`27-F2` binds the placement: a long cart must never push it below the fold** — the cart's line list gives up the room, never the control, because that FR forbids reaching a primary action by scrolling. **NOT approved, and deliberately not attempted: merging type × channel into one combined row.** Which combinations are real is stated in no FR and inventing them is commandment 2, and `27-F36` separately makes a 2-D matrix a literacy-dependent encoding. That one stays open and is a founder call.
- 27-F5 **No context-dependent or invisible controls.** No soft keys, no hover or dwell activation, no long-press-only actions, no gesture-only affordances. Dwell-to-click was tried in the field and abandoned. Every action has a persistent, visible, labelled target.
- 27-F6 **No operational role is ever required to type non-numeric text to complete a CRITICAL-PATH task.** Modifiers and reasons are pick-lists of tiles, or voice; of 27 field subjects, 24 could not type a single word. Typing may exist as an **optional escape hatch** — 21 §5 names search as exactly that, and 02-F2 search, 02-F6 notes and 02-F27 customer name are all legitimate under this reading. The test is whether a non-typing operator can complete the task by another route, not whether a keyboard appears anywhere.
- 27-F7 **A list's visual order MUST be its work order.** If tickets render in an order other than the order they should be worked, that is a defect, not a display preference.

## 1a. Reference hardware (founder-confirmed, July 2026)

Sizing is meaningless without the panel. These are the real deployment targets, and every
capacity claim in this document is computed against them — never against a design mock.

| surface | panel | PPI | 76 dp tile | 126 dp keypad | comfortable tiles/page |
|---|---|---|---|---|---|
| counter POS | **15.6″**, 1366×768 or 1920×1080 (laptop or all-in-one) | 100–141 | 47–67 px | 79–111 px | **~88** (11×8) |
| waiter tablet | ~10.1″ Android | ~224 | 106 px | 177 px | ~35 (7×5) |
| waiter phone | ~6.5″ Android | ~405 | 191 px | 319 px | **~12** (2×6) |

- 27-F11a **The 15.6″ counter resolves 02-N2 outright.** ~88 tiles per page against ~12 persistent category tabs means a 300-item catalogue is **~25 items per tab — one page each.** No paging within a tab, no scrolling, depth one, positions frozen (27-F4). The apparent conflict between a 300-item menu and a flat layout was an artefact of assuming phone-sized capacity.
- 27-F11b **The phone is where "~6 per page" actually applies** (~12 comfortable tiles). Waiter and rider surfaces inherit the tested paging configuration; the counter does not, and must not be designed as a scaled-up phone.
- 27-F11c **Physical size, never resolution, sets capacity.** A 1366×768 and a 1920×1080 15.6″ panel hold the *same* number of 12 mm tiles. Extra pixels buy sharpness; only inches buy room. Design in millimetres, render in pixels.
- 27-F68 **A `dp` is 1/160 inch of PHYSICAL size and is rendered through the panel's own density — never spent as a CSS pixel** (founder ruling, August 2026). This FR adds no new law: it states the density that already generates every number in this document, because the products did not read `27-F11c` and spent `dp` as CSS `px`. 1 dp = 0.15875 mm — the conversion behind both of `27-F8`'s columns (76 dp = 12.1 mm, 126 dp = 20.0 mm, 96 dp = 15.2 mm, 64 dp = 10.2 mm, 48 dp = 7.6 mm) and behind every cell of §1a's table. **`dp ≡ CSS px` holds only at 160 PPI, is stated nowhere in doc 21 or doc 27, and does not fit the hardware above:** measured August 2026 at 1366×768 (100.5 PPI), a 126 dp keypad rendered **528 px into a 498 px work area** — the pad alone larger than the space under `03-F5`'s band, before any label or button. **Two things this FR forbids, because each is the obvious next error.** (a) **No pinned pixel constant.** §1a's *"126 dp → 79–111 px"* is a range across panels, not an answer: 79 px is 20 mm at 100 PPI and **14.2 mm on the 141-PPI panel §1a also lists** — below `27-F8`'s floor, on the product's highest-consequence entry surface. The pixel value is computed per panel from `00 §7`'s `panel_ppi` (measured from the display; configured only to correct it), and the conversion is applied **once at the token boundary and to every dp in the layout**, chrome included — converting touch targets alone leaves the proportions wrong on every panel. (b) **The minimum is the millimetre.** `27-F8`'s 126 dp is a measured ergonomic floor; this FR changes how it is *rendered*, never what it *is*. Reducing the millimetres to make a layout fit is forbidden. Measurements, consequences and the rejected alternatives — including *"the counter ships 1920×1080 only"*, which is the category error `27-F11c` exists to name — are in `DEC-UI-001`.

## 2. Touch, density and latency

The ergonomics and low-literacy strands converge here from opposite directions, which is why these numbers are raised rather than split: bigger targets and fewer-items-per-page are the *same* design.

- 27-F8 **Touch minimums, by posture** — the apparent contradiction in the literature is a posture confound, not a disagreement:

| context | posture | minimum |
|---|---|---|
| counter POS grid tile | standing at a fixed terminal | **76 dp** (12 mm) |
| cash / numeric keypad | standing, high-consequence entry | **126 dp** (20 mm) |
| handheld waiter/rider | one-handed thumb | **64 dp** (10.2 mm) |
| **kitchen bump / KDS action** | **standing, wet or greasy hands, 1–2 m** | **96 dp** (15 mm) |
| absolute floor, anything | — | **48 dp** (7.6 mm), gaps ≥8 dp |

  The kitchen row is set above the standing-counter minimum deliberately: it is the one surface where 27-F9's measured **21.34% wet-hand gesture error** was gathered, and the operator is also reading at 1–2 m. Doc 21's superseded law named "KDS bump targets ≥64dp"; that number came from no posture study and is raised here.
  Measured error rates at 9.6 mm are 2.8% and **there is no significant accuracy gain above it** — past ~10 mm you are buying speed, not accuracy. WCAG 2.2's 24 px (AA) and 44 px (AAA) are below every empirical figure and cite only the one-handed thumb study; they are a legal floor, never a design target.
- 27-F9 **Destructive actions are never adjacent to high-frequency ones on any surface a wet hand touches.** Wet-screen gesture error is **21.34% against 0.00% dry**, water becomes a hindrance within ~20 seconds, and the sensed touch point physically *migrates toward the moisture*. This is a hard rule, not a preference.
- 27-F10 Touch feedback <100 ms (restating 21 §4 as the perceptual threshold). Optimistic UI for anything the device can decide locally; a spinner is an admission the device asked someone else.
- 27-F11 **Density is a professional-tool decision, not a taste one.** Expert operators scanning a familiar layout are doing something categorically different from a first-time reader. Density is bounded by 27-F8's target sizes and by 27-F2's page size — not by an aesthetic preference for whitespace.

- 27-F11d **An S1 alarm takes a BAND, never the screen** (founder ruling, July 2026; amends 21 §5's interrupt-priority law and doc 03's S1 shape). A print failure, red-late order or critical cash variance renders as a persistent, loud, repeating banner that cannot be dismissed without an attributed acknowledgement — **and the work underneath stays visible and usable.** A half-built cart is never taken away from a cashier with a customer waiting. Reasoning: 01-F17 says a sale is never blocked, and an alarm that interrupts a transaction teaches staff to fear the screen, which is how workarounds start. Escalation to the manager console at 60 s is unchanged. Deferring the alarm to a "safe moment" is also rejected — food is not being cooked, so the delay is the harm.

## 2a. Paper is the primary kitchen surface (founder field ruling, July 2026)

**Even many large Pakistani restaurants prefer paper in the kitchen; only some use a
screen.** Doc 03 lists "printing service" and "pass screen" as co-equal Wave-1
deliverables, which understates it. This reorders the module and doc 27 with it.

- 27-F11e **The KOT is the primary kitchen interface, and the pass screen is optional.**
  Everything in §1–§2 and §3–§5 governs glass. For most deployments the kitchen never
  sees glass. Print reliability, not screen design, is the kitchen's critical path.
- 27-F11f ~~**Where a pass screen IS used it is a 22-inch panel**~~ **SUPERSEDED (founder
  ruling, August 2026 — see `DEC-HW-001` and the amended `27-F28`).** The *measurement* stands
  and is why this FR existed: 22″ is the smallest panel showing three tickets at 1.5 m without
  paging (10″ ≈ 1.5 tickets, 15.6″ ≈ 2, 22″ ≈ 3), with room for `27-F8`'s 96 dp wet-hand bump
  targets. What is retired is the **mandate**. RestOS is bring-your-own-hardware; a restaurant
  runs the pass on the glass it owns, and the product states the capacity that glass yields
  rather than requiring a purchase. So the numbers above are now a **capacity table**, read
  exactly as `27-F28` reads them, and a 10″ tablet at the pass is a supported configuration
  showing about one and a half tickets — which is a fact to surface to the operator, not a
  refusal. Doc 03's "one cheap Android tablet at the pass" is therefore **reinstated as a
  legitimate deployment**, not superseded. `27-F27`'s angular derivation is untouched and still
  binds: cap-height scales with viewing distance, and no fixed physical size does that.
- 27-F11g **A failed print is more severe than modelled.** Where paper is the only kitchen
  channel there is no screen fallback — a failed KOT means food is genuinely not being
  cooked and nobody knows. The S1 band of 27-F11d is the *only* signal, which is precisely
  why it must be loud, persistent and un-dismissable without acknowledgement, and why it
  must not steal the cashier's cart (she is the one who has to react).
- 27-F11h **GAP, named not solved: this document has no design language for thermal paper.**
  §3–§5 are colour, type at distance, and icons — none survive an 80 mm monochrome
  receipt. The low-literacy problem does not disappear on paper; it changes shape. A cook
  who cannot read must still parse a KOT, and there the load falls entirely on **numerals,
  vertical position, and whitespace** — the only channels thermal printing has. Doc 03's
  bitmap-rasterisation path (03-F8) covers rendering non-Latin *content*, not making a
  ticket legible to a non-reader. **DISCHARGED July 2026 → §2b (27-F55..F62) here and
  03-F30..F45 in doc 03 — but see §2b's opening: it is a reasoned construction, because the
  research found that ZERO studies of this problem exist.**

## 2b. Thermal paper — the design language §2a owed (July 2026)

This section discharges `27-F11h`. It opens with what the research actually found, because
that finding governs how much weight the rest of it can carry:

> **There is ZERO research — academic, industrial or standards-body — on how
> low-literacy adults parse printed operational tickets.** Not thin research. None. Every
> low-literacy design finding this corpus cites (`27-F30`..`27-F34`) was measured on
> screens, on signage, or on medication labels.

So §2b is a **reasoned construction, not an evidence-backed one**, and it is the part of
doc 27 most likely to be wrong. It is written to be *falsifiable on real staff* rather than
defended: every FR below is subordinate to `27-F35`'s ≥85% post-training comprehension
gate, and where the pilot contradicts this section, **this section loses**.

- 27-F55 **Paper has four channels, and they are not the screen's four.** Colour, hue-coded
  state, hover/press feedback and progressive disclosure are all unavailable. What remains
  is **(1) ink density** (normal, bold, and inverted white-on-black solid fill), **(2)
  character size** (1×, 2× width, 2× height, 2×2), **(3) vertical position and grouping
  whitespace**, and **(4) rasterised glyphs** (`03-F8`). All four are monochrome and
  all four are consumed by the eye in that order at arm's length. **This is a poorer
  palette than glass, and the KOT must therefore carry LESS information than a pass-screen
  ticket, not the same information in a narrower column.**
- 27-F56 **The ink ladder — exactly three levels, allocated once, platform-wide.** Mirroring
  the `27-F16` colour budget, emphasis on paper is a *budget*, not a formatting option:
  **inverted solid fill** is reserved for the single most consequential fact on the ticket
  and nothing else (`CANCEL`, `VOID`, `REPRINT`, allergen); **2×2 size** for the item line's
  quantity and the order/table identifier; **normal weight** for everything else. Bold is
  **not** a level — at 203 dpi on 48 GSM the difference between bold and normal is
  unreliable across the printers we actually support, and a distinction the hardware may
  not render is worse than no distinction. A ticket that uses inversion twice has used it
  zero times.
  - **Two SCOPES, one inversion each (founder ruling July 2026 — resolves `27-F56` against
    `27-F59`).** As written, this FR reserved inversion for "the single most consequential fact
    on the ticket and nothing else" while `27-F59` gave **every** removal modifier the inverted
    marker. A KOT is where both live, and an order with two removals — or one removal on a
    reprint — satisfied neither. **Ruled:** the budget is *per scope*, and there are exactly two.
    - **Banner scope — at most ONE per document.** `CANCEL`, `VOID`, `REPRINT`. These compete
      with each other and the FR's rule binds absolutely: a ticket with two banners has none.
    - **Item scope — at most ONE per item block.** `27-F59`'s removal marker, indented under
      its item.
    The reason this is not a relaxation: **"used it twice" is about competing for the SAME
    glance.** `27-F58` already fixes the reading order — identifier → timing → items →
    modifiers → notes — and a cook reads one dish at a time, so a removal on the second dish is
    never in the same glance as a removal on the first, nor as the banner above them both. Two
    banners *are* in one glance, and two removals on ONE item are too; both stay banned.
  - **The budget is a property of the DOCUMENT, not of a command.** An inverted band drawn as a
    raster image rather than through `GS B` spends the same attention and must count against the
    same scope. Stated because a guard that counts the command alone can be bypassed without
    anyone intending to.
- 27-F57 **Quantity is never separated from the item it counts.** The mapping step — pairing
  a number to the thing it quantifies — is where comprehension collapses in every study we
  have (readers who *decode* a line at ~71% *execute* it correctly at ~35%). Quantity sits
  **immediately left of the item name on the same line**, at the same size, never in a
  right-aligned column and never on its own row. This single constraint is the reason the
  KOT declares a **minimum of 42 columns** and is **refused below it** rather than wrapped
  (`03-F49`, founder ruling July 2026).
  - **Correction, July 2026.** This FR previously cited *"`03-F30`'s 80 mm floor"*. `03-F30`
    has no floor — it governs the Spec/Profile split only — and the supporting figure
    ("~10 characters left" at 32 columns) carries no derivation: a two-digit quantity at
    `27-F56`'s 2× width costs 4 columns, leaving ~27 for the name, not ~10. **The conclusion
    stands and the arithmetic did not support it.** What binds is `03-F49`'s declared
    per-type minimum, expressed in columns like every other layout figure (`03 §7`), not a
    millimetre count and not a character estimate.
- 27-F58 **Vertical position encodes urgency; whitespace encodes grouping.** The reading
  order is fixed and never configurable: **identifier → timing → items → modifiers →
  notes**. A cook who reads nothing must still be able to point at the top line and be
  understood by someone who can. Groups are separated by **blank lines, not rules** — a
  full-width rule costs a line of paper and reads as a *boundary between documents* to
  someone who parses shape rather than text.
- 27-F59 **Modifiers are indented under their item and never inlined.** An inlined modifier
  turns one scannable line into a wrapped paragraph, and wrapping destroys the vertical
  alignment that `27-F57` and `27-F58` depend on. Where a modifier is a *removal* it
  carries the inverted marker of `27-F56`, because a removal that is missed is an allergen
  incident, not a preference miss. **Scoped July 2026 (`27-F56`'s two-scope ruling): one inverted
  removal marker per ITEM BLOCK.** An item with two removals carries one marker covering both —
  two inversions inside one item block are in a single glance, which is the case `27-F56`'s
  budget actually forbids.
- 27-F60 **Icons on paper are permitted but never load-bearing alone.** The raster path
  (`03-F8`) makes glyphs available, so `27-F26`'s icon-plus-label law applies unchanged:
  an icon may accompany a word, never replace it. `27-F27`'s prohibition on inventing
  pictograms is **stronger** here — a 24×24 dot glyph at 203 dpi has less resolution than
  any icon this corpus has validated, and **no Pakistan-specific pictogram comprehension
  data exists at all**.
- 27-F61 **Urdu on a thermal ticket is UNPROVEN and must be physically tested before it is
  designed around.** The estimate that Nastaliq needs a 48-dot (≈6 mm) cell — costing
  **+60% paper per line** and yielding only ~14 ligature slots across 72 mm — is derived by
  analogy from CJK's 24×24 allocation, and **has no source anywhere**. It is the weakest
  inference in the Wave-1 research. **Print a test sheet on the 48 GSM stock actually sold
  in Pakistan and have an Urdu reader judge it; do not validate on screen**, where the
  rendering has nothing to do with what 203 dpi will produce. Until that sheet exists, no
  FR may assume Urdu is usable on paper.
- 27-F62 **Paper is not a status surface (`03-F44`).** A ticket cannot update, so nothing
  whose meaning changes over time may be printed as if it were fixed — no "ready at" that a
  delay invalidates, no state word that a later event contradicts. Print what was true at
  **append** time, stamped with `branch_created_at`, and let the ledger own the present.

## 3. Colour

Colour is the strongest guiding attribute in vision, which is exactly why it must be scarce: every additional colour on screen makes every other colour a worse target. Two standards bodies already say this for our class of display — ISA-101 mandates a low-saturation grey base with colour reserved for abnormal conditions, and IEC 60073 fixes the meanings.

- 27-F12 **Colour never carries state alone.** Every status is **colour + shape + position + a number**. Machine-enforced: a status component that accepts a colour prop without a shape prop fails typecheck. (WCAG SC 1.4.1, Level A.)
- 27-F13 **Design achromatically first.** If a screen is unreadable in greyscale it is broken. Colour is added only after the achromatic design works.
- 27-F14 **Budget: 3 status colours + 1 interactive accent, ALLOCATED HERE, platform-wide.** Measured capacity is 7 and search degrades continuously below it; encoding one state with *two* colour attributes collapses performance even at minor heterogeneity. The allocation is fixed so the first module to ship cannot spend it by accident:

| slot | meaning (IEC 60073) | claimants it serves |
|---|---|---|
| **amber** | abnormal — attention required | ticket approaching due, low stock, pending approval, unaccepted channel order, sync degraded |
| **red** | fault / danger / destructive | ticket overdue, print failure, cash variance past threshold, void & refund actions, revoked device |
| **green** | **transient confirmation only — never a resting state** | payment taken, order sent, bump accepted |
| **blue accent** | interactive / mandatory action | any control the operator may press |

  A module needing a distinction not on this table expresses it with **shape, position or a number** (27-F12), never a fourth hue. Adding a colour requires an amendment here, not a local decision.
- 27-F15 **Status colours ride a monotonic LIGHTNESS ladder, and the fill carries it — never a dot, badge or thin rule.** The naive equal-lightness traffic-light palette measures ΔE00 **8.2** under deuteranopia (near-identical olive). Small patches lose hue first, and at 1–2 m a thin stroke contributes almost nothing to the priority map. **The floor for the `27-F14` allocated set is ΔE00 ≥ 20 on its WORST pair, measured across normal vision and all three dichromacies with the `27-F21` separation gate held.** *(Amended July 2026, and the amendment is a correction of a stated condition, not a lowered bar.)* The former **31.4** was measured on a single pair, on a different ladder (L\* 100 → 77.5 → 39.7), **without SC 1.4.11's 3:1 fill-separation requirement applied** — and no four-colour set satisfying that gate reaches it on any theme. Measured ceilings: light base **zero** joint candidates at all (the two gates pull opposite ways — 3:1 forces every fill below 0.254 relative luminance while ΔE00 against a dark red wants light); dark base **≈23** joint, with the binding pair fault↔abnormal, which is hue-adjacency and not a defect. The shipped set measures **21.3**. Where a pair could be pushed further in isolation it should be, but a figure no palette can jointly reach is a requirement that gets ignored rather than met. This floor is safe only because `27-F12` holds: colour never carries state alone. Derivation and every measurement: `plans/wave-1/palette-repaint.md`.
- 27-F65 **The training tint carries a real LUMINANCE step, not a hue wash — and it is the one signal `27-F64`'s outline cannot rescue.** *(July 2026, filed when the oracle measured the shipped tints at 1.08:1 light / 1.12:1 dark.)* `27-F63` requires "a visibly different surface tint on every screen" and explicitly rejects the fallback ("a small badge is not enough"), so the band cannot absorb the burden. But a tint is a **full-field** property with no adjacent element, so there is nothing for an outline to bound: unlike a status fill or a bounded control, its perceptibility cannot be delegated to a boundary. SC 1.4.11 arguably does not even reach it; `27-F63`'s own "visibly different" does, and 1.08:1 is not visibly different by any reading. The tint must therefore differ from the production surface by a luminance step large enough to be unmistakable at a glance across a room, **while every foreground token still clears `27-F21` against it** — which is the real constraint, since a tint dark enough to be obvious can push body text below AA. Both polarities are gated. **This is a safety signal, not decoration: the failure it prevents is a member of staff taking a real order on a training branch, which `01-F49`'s branch isolation makes silently unrecoverable as a sale.**
- 27-F64 **SC 1.4.11's 3:1 is carried by a status OUTLINE, not by the fill's luminance.** *(July 2026 founder ruling — this is what makes 27-F15 and 27-F21 jointly satisfiable at all.)* Measured: **no four-colour status set satisfies 3:1 fill separation, ΔE00 ≥ 20 and 27-F15's severity ladder simultaneously, on either polarity.** The squeeze is always **amber**: dark enough to separate from a light page it becomes olive and converges with green under dichromacy; light enough to separate from a dark page it converges with red. The two gates are independent constraints on one channel, and the demonstration at the limit is a pair measuring 14.7:1 and 15.8:1 against white with **ΔE00 0.00 under protanopia** — the same colour to a protanope while passing every contrast check comfortably. Therefore: every status surface carries an outline meeting 3:1 against the surface behind it, which is what SC 1.4.11 is *for* (a perceivable boundary), and the fill's luminance is then free so its hue can be optimised for dichromacy. **This does not weaken 27-F15's "the fill carries it".** The fill still carries the STATE — the outline carries only the BOUNDARY, is achromatic or a darkened/lightened derivative of the fill, and never encodes meaning of its own. A thin rule still may not *be* the signal; it may only bound one. An outline that differs in hue between two states is a violation.
- 27-F66 **`27-F64`'s outline rule extends to NEUTRAL surfaces: elevation and selection are carried by a boundary and an independent mark, never by a fill luminance step.** *(July 2026 founder ruling. Filed because the oracle round proved the alternative impossible, not because it was preferred.)* The measurement: SC 1.4.11 at 3:1 on **all three** of `bgColor-surface`, `-raised` and `-sunken` is **mathematically incompatible** with `27-F21`'s "every foreground clears AA on every surface". Exhaustive search over relative luminance finds **14,196,198** surface triples clearing the mutual 3:1 ladder and **zero** admitting any text colour that clears 4.5:1 on all three. Algebraically, with f(x) = Y + 0.05 and f(a) ≥ 3f(b) ≥ 9f(c): text forces f(t) ≤ f(a)/4.5 ≤ 0.2333 and f(t) ≥ 4.5·f(c) ≥ 0.225, while f(b) ∈ [0.15, 0.35] admits neither f(t) ≥ 4.5·f(b) ≥ 0.675 nor f(t) ≤ f(b)/4.5 ≤ 0.0778. **There is no palette.** This is a property of the WCAG contrast formula, not of any choice this document made. Two surfaces fails too for this role set: a `-sunken` at 3:1 from the page forces every foreground below Y = 0.0231, collapsing `muted`, `disabled`, `status-fault` and `status-abnormal` to within 1.5:1 of each other and destroying `27-F16`. **Therefore:** a neutral surface that bounds a **control** carries an outline meeting 3:1 against the surface behind it (`borderColor-default` ships at 3.41:1 light / 3.44:1 dark and is what discharges this); and a **state** difference between two neutral fills is carried by an independent mark meeting 3:1 — an accent rule, a border change, a glyph — never by the fill step alone. The elevation fills stay ~1.1:1 apart and are legitimate *depth* cues; they are simply no longer load-bearing for perceivability. **The same discipline as `27-F64` applies:** the mark bounds or flags a state, it never *is* the only signal, and it never introduces a hue outside the `27-F14` allocation. Derivation and every measurement: `plans/wave-1/ui-fix-round-findings.md` §2.1.
- 27-F67 **Training renders in the OPPOSITE polarity to its surface's normal one — that is the "visibly different surface tint" `27-F63` asked for, and it is the only form of it that survives `27-F21`.** *(July 2026. Answers the constraint `27-F65` names and leaves open.)* `27-F65` requires a luminance step "large enough to be unmistakable at a glance across a room, **while every foreground token still clears `27-F21` against it**". Those two are jointly unsatisfiable by tinting one surface: the binding foreground is `fgColor-status-abnormal` at Y = 0.1524, which clears AA on a light page with **no headroom** — any training surface keeping it above 4.5:1 must sit at Y ≥ 0.8608, i.e. **at most 1.08:1** from the production surface. That is exactly the 1.08:1 the oracle measured and called not visibly different. Tinting harder means re-deriving every foreground, which is a second palette by another name. **So make it the second palette we already have.** A training session on a light surface renders the gated dark palette and vice versa: **14.31:1** between the two base surfaces — unmistakable across a room by any reading — with every `27-F21` pairing and every SC 1.4.11 separation already independently gated in both polarities (`27-F19`). It costs **no new token**, spends no `27-F14` status colour, and stays achromatic per `27-F13`. **The inversion carries unmissability; `27-F63`'s band still carries the meaning** — a word, because an inverted shell alone could read as a display fault, and `27-F63` was always two signals rather than one. The fidelity cost is real and accepted: training does not look pixel-identical to production. `27-F63` already made that trade, in the same breath as rejecting a badge — the failure it prevents is a member of staff treating a real order as practice, which `01-F49`'s branch isolation makes silently unrecoverable as a sale.
- 27-F16 **Money is never coloured by default.** Colour on a number means *this number is abnormal*. Colouring the commonest number on screen spends the whole preattentive channel on the base case.
- 27-F17 **Assume 1 in 20 male staff is deutan and does not know it.** Pakistani prevalence 2.75–5.75%, deutan-dominant; ~80% of affected people are unaware. No red/green pair is ever the sole distinguishing signal.
- 27-F18 **Colour survives neither our panels nor our kitchens, and red desaturates first.** Uncalibrated displays vary 41–282 cd/m² against a nominal 80; touchscreens carry no anti-reflection coating and ambient contrast falls 86:1 → 1.3:1 at 500 lux. Therefore colour is the *third* channel, after position and number — never the first.
- 27-F19 **Light theme is the default on every surface; dark is a per-site KDS opt-in.** Positive polarity wins on acuity and proofreading for younger and older adults alike, and the advantage is **largest at small character sizes** — where the POS lives. Recorded honestly: every commercial KDS ships dark and no study supports it. That is a pilot A/B (§7), not a decision to make from here.
- 27-F20 **Sunlight is a hardware problem.** At 80 000 lux every pair collapses to ~1.8:1 and polarity is irrelevant. Rider surfaces get a brightness lock while a delivery is active, ≥1000-nit hardware in the spec, matte film, and a sun-critical payload of 2–3 very large glyphs.
- 27-F21 **Gate on WCAG 2.2 AA; use APCA as the tie-breaker in dark mode**, where WCAG's own critics — and APCA's documentation — agree WCAG 2.x cannot guide design.

## 4. Typography and numerals

- 27-F22 **Western digits (U+0030–0039) everywhere. Never U+0660–0669.** CLDR sets `ur` and `ur-PK` to `latn` while setting `ur-IN` to `arabext`; Pakistani coins, number plates, every banknote security numeral and the raised tactile numeral for the blind are all Latin. If Eastern digits are ever added they must be U+06F0–06F9 **with an Urdu-shaped font** — 4, 6 and 7 diverge between Persian and Urdu, and a Persian font renders silently wrong shapes.
- 27-F23 **Money format: `Rs`, symbol-first; Western 3-digit grouping; no decimals on operational screens.** Not `₨`, not `PKR` in staff UI. CLDR gives `ur`/`en-PK` the `#,##0.###` pattern — Pakistan does **not** inherit lakh grouping. No sub-rupee unit circulates and the decimal point is the highest-consequence keystroke there is.
- 27-F24 **The system computes; staff read.** ~60% of rural Class 1 recognise numbers against 9.5% who can do any arithmetic. Every total, change amount, line total and elapsed minute arrives as a finished number. Never require mental arithmetic.
- 27-F25 **Numbers are the operational payload and the largest element in their region.** The measured digit-over-letter advantage exists only under brief or degraded viewing — exactly the glance-across-a-counter case — which is an argument for making digits *big*, not for assuming they will be read.
- 27-F26 **Primary typeface: IBM Plex Sans**, chosen on fail-safe defaults — tabular digits and distinct `I`/`l` with **no feature flags**. **Roboto is banned for numerals**: identical `I`/`l` outlines, no slashed zero, no disambiguation set, unfixable. Inter is permitted only if `tnum` and `ss02` are bound into a single non-bypassable token and verified on every render path, because both its digit alignment and its `I`/`l` distinction are opt-in.
- 27-F27 **KDS type is specified in cap-millimetres at a stated viewing distance, never in dp.** Derivation: ISO 9241-303 (20–22 arcmin recommended, 16 minimum), with **30 arcmin for KDS primaries** as a safety factor for steam, grease and a moving reader. *(Premise corrected August 2026. This FR argued from "the same dp renders 2.3× larger on a 32″ 69-PPI panel than on a phone", which `27-F68` makes false — a dp is a physical size and renders alike everywhere. **The rule is unchanged and stands on its own, stronger ground:** legibility is ANGULAR, so cap-height must scale with viewing distance, and no fixed physical size does that. A 22″ pass screen read at 1.5 m and a phone read at 0.35 m need different millimetres, which is exactly what "at a stated viewing distance" carries.)*
- 27-F28 **A panel's KDS capacity is STATED, not mandated.** A 10" tablet holds ~9.5 item lines at 1.5 m — about 1.5 tickets — and more pixels change nothing, because only physical height buys capacity. **22" is what a 3-ticket view costs.**
  *(Amended August 2026 — `DEC-HW-001`'s bring-your-own-hardware ruling. **The measurement and the derivation are unchanged and stay**: legibility is ANGULAR (`27-F27`), so cap-height must scale with viewing distance and no number of pixels substitutes for physical height. **What is superseded is the conclusion** — this FR read ~~"a 10\" tablet is not a KDS … **22\" is the hardware floor** for a 3-ticket view"~~, which states a purchase. A restaurant brings the glass it owns, so the product **reports the capacity that panel yields at its viewing distance** and the restaurant decides whether 1.5 tickets is enough (`00 §5.7` — a surface reports what is true). A 1.5-ticket panel is a **supported and honestly-labelled** KDS, not a refused one. **What is NOT relaxed:** the angular cap-height is physics and is never traded for capacity — a panel too small for its distance shows **fewer tickets**, never smaller type. `03-F46`'s paging is what makes that survivable: page 1 always holds the oldest work, so a low-capacity panel costs situational awareness and never reachability.)*
  - **Tension RESOLVED by the founder, August 2026.** `27-F11f` was a July-2026 ruling that *"where a pass screen IS used it is a 22-inch panel"*; this amendment turns 22" from a floor into the size of a 3-ticket view. The two were flagged as irreconcilable rather than silently overruled, and the founder ruled for **this reading**: the measurement stands, the mandate is retired, and `27-F11f` now carries the supersession with its derivation intact. A 10" tablet at the pass is a supported configuration yielding about one and a half tickets — a capacity to state, never a refusal.
- 27-F29 Validate and block impossible numbers at entry; blocking invalid input roughly halves out-by-10 errors, and numeric entry is where this population's errors concentrate.

## 5. Icons

- 27-F30 **No off-the-shelf icon set.** 987 Pakistani doctors, dentists and paramedics scored **42.2% mean comprehension on ISO 7010**, with only 2 of 19 signs clearing the international threshold. Literate professionals, on the standard. Material Icons will not do better.
- 27-F31 **Icons are drawn locally, with Pakistani restaurant staff in the loop.** Locally developed pictograms passed at **20 of 23 against 11 of 23** for imported equivalents with the same low-literate participants, who also expressed an overwhelming preference for them.
- 27-F32 **Style: semi-abstract line drawings.** Photographs measured *worst* of five visual representations — extraneous detail actively hurts. Not photorealism, not minimal geometric glyphs.
- 27-F33 **Action icons carry a motion cue; object icons must not.** Without motion cues, drawings read as places rather than actions — utensils read as "the kitchen", not "washing up".
- 27-F34 **Icons are validated by mutual distinctness, not individual clarity.** Acceptance test: show the real page, name the function, record the tap. An icon fails if it draws taps meant for a co-displayed sibling.
- 27-F35 **Comprehension gate: ≥85% correct and ≤5% critical confusion (ANSI Z535.3) on a post-training retest with real staff; ≥66.7% (ISO 9186) is the absolute floor.** Retention-after-teaching is the right metric for staff, not cold intuition — the 20-of-23 result above was measured three weeks after the meanings were explained.
- 27-F36 **Cultural review checklist**, from documented in-field failures: time and reading direction (left-to-right clock faces were misread because Urdu reads right-to-left), building types (a house outline read as "a village hut"), **matrix/grid encodings of relationships — 2-D tabular semantics are a literacy-dependent skill**, literal colour realism ("roads can never be yellow"), and any icon that must denote a specific instance rather than a category.
- 27-F37 **Chrome icons are capped at ~25 symbols product-wide** and are absolutely stable; menu-item images are unbounded because they are recognition targets at fixed grid positions, not symbols to be learned. (The cap is judgement — no study establishes a learnable icon-vocabulary limit.)

## 6. Tokens

- 27-F38 **Every token slot is required; no elided defaults.** Polaris omitted "default" slots, then had to reassign the bare name's meaning between two majors. Primer chose the opposite explicitly.
- 27-F39 **No relative modifier ladders** (`subtle`/`bold`/`bolder`). Atlassian renamed `bold` → `subtle` — the old bold token *became* the subtle token, the name stayed valid, the meaning inverted, and no codemod or diff review can catch that. Use ordinals pinned to a scale, or a closed enum never reordered.
- 27-F40 **Role-first prefixes** (`bgColor-`, `fgColor-`, `borderColor-`). The failure this prevents, in Primer's words: names that *"didn't convey which property to be used with."*
- 27-F41 **Semantic naming for colour; flat ordinal for space.** Not taste — Atlassian shipped five competing spacing schemes at once, including the semantically "correct" gap/inset split, and deleted four of them three days later in favour of flat `space.X`.
- 27-F42 **Composite typography tokens, never atomic.** Decomposed size/line-height primitives let consumers assemble pairings the system never designed.
- 27-F43 **`on-*` pairing names AND a `<Surface>` component.** The name carries the intent; the component makes it structural. Leaving the pairing in prose produced a publicly-reported failure that remains unfixed years later.
- 27-F44 **Ship an LLM-facing rules file with a hallucination guard**: never raw values, only semantic tokens, and any token name not in the manifest must be emitted with a `/* check-token */` marker — greppable in CI. This is the only shipped answer anyone has found to "how does an agent pick the right token."
- 27-F45 **The machine-readable path is a file, never a docs site.** Material 3's and Spectrum's canonical token docs are JS-only SPAs that return empty shells to agents. Generate `tokens.json` beside the component manifest.
- 27-F46 **Build the rename pipeline before the first token ships.** Every mature system surveyed renamed 2–3 times; one changed its tier vocabulary between consecutive majors. A `replacement` attribute in the shipped artifact drives codemods, with an explicit deprecation lifecycle.
- 27-F47 **Honest status:** there is **no empirical evaluation** of whether any naming scheme helps a model pick correctly — no benchmarks, no vendor accuracy figures. 27-F38..F43 rest on *historical* evidence: which names mature teams were forced to rename, and why. Labelled as judgement, not measurement.

## 7. Onboarding, help, and what the evidence cannot tell us

- 27-F48 **Training material shows the exact task on the exact screen.** Generalised examples measurably helped higher-literacy users and did *nothing* for the target group, who needed 26.1 prompts against 11.6.
- 27-F49 **Open with full-context framing** — why the machine knows about table 4 — before any UI tutorial. Disbelief that the system can do the job at all is a documented barrier, not a training gap.
- 27-F50 **Persistent help on every screen, in the same position, or none at all.** Partial coverage *"will cause a loss in confidence among subjects who tend to blame themselves for the interface's shortcomings."*
- 27-F51 **Design for the shift lead as intermediary.** There is a *second-order usability* — usability for a beneficiary via a helper — that direct-interaction heuristics do not cover, and a restaurant is a dense intermediation environment by default.
- 27-F52 **A training mode is a product requirement, and it reaches the kernel.** Without one, staff train on live tickets, polluting an append-only ledger and every report built on it. This needs an architectural answer, not a UI toggle. **ANSWERED July 2026 → `DEC-TRAIN-001` / `01-F49..F51`: a training session is an ordinary session against a training BRANCH**, so the kernel gains no flag and the isolation is the branch boundary it already enforces. The UI obligation that remains is 27-F63.**
- 27-F63 **Training is unmistakable on every screen, continuously, and it is the one place this document spends a whole surface on chrome.** A small badge is not enough: the failure mode is a member of staff who *forgets which mode they are in* and either treats a rehearsal as real (and does not actually serve the food) or treats a real order as practice. Both are worse than not having training at all. So a training session renders a **persistent full-width band plus a visibly different surface tint on every screen**, it survives navigation because there is nowhere to navigate to (`27-F1`), and it names the exit. It does **not** spend a status colour — the 27-F14 budget has no training slot and inventing one would blunt amber and red everywhere else; the band is achromatic and carries a word, per `27-F13`.
- 27-F53 **Measure speed separately from success, at rush tempo, with an experienced operator.** First-use success is what the literature measures and it is not what we need. A novice-only test structurally *cannot* detect the flat-vs-hierarchical decision, because that benefit appears only in experts.
- 27-F54 **Longitudinal gate.** Median evaluation duration in this literature is two weeks; only 2 of 65 studies ran past six months. Instrument the dev pilot for month-3 and month-6 task success and error rates. **Our pilot is the study.**

## 8. Amendments this document makes to doc 21

- **21 §4 touch targets** — 48 dp floor / 64 dp primary is **raised** per 27-F8. The old numbers sit below every empirical figure for a standing operator.
- **21 §4 "new-cashier learnability <15 min"** — **demoted from merge criterion to internal target.** Published training-time claims span 20 minutes to 40 hours, all vendor or SEO content. Keep the goal; stop presenting it as grounded.
- **The fresh-staff learnability check (`21-F14`)** — **insufficient alone**, per 27-F53. RITE rounds must include an operator who has run 500 tickets.
- **21 §6 open-item 2, "we are inventing here" on KDS legibility** — **too pessimistic.** ISO 9241-303's angular cap-height extrapolates to any distance and the independent signage rule converges within a safety factor. The pilot-kitchen measurement is a *confirmation* step, not the primary source.
- **21 §5 language law** — unchanged and corroborated. Worth recording what the evidence adds: local-language *text* does not rescue low-literate users (text failed at 0% completion regardless of language), but local-language **voice** repeatedly does. The English-only *label* decision is cheap; never adding **Urdu audio** would be the expensive omission.

## 9. Open — decided by the pilot, not by this document

1. **Light vs dark for the KDS** (27-F19). Evidence says light; the entire industry ships dark; no study supports the convention. A/B it in the pilot kitchen.
2. **Whether Pakistani staff read green-up/red-down on financial figures** the Western way or the inverted East-Asian way. No colour dataset covers Pakistan at all, and much of what circulates traces to a 2009 infographic tagged "Just For Fun". Blocks nothing today (27-F16 puts no colour on money) but must be settled before any chart ships.
3. **Grease, as distinct from water, on capacitive touch.** No peer-reviewed study exists. Measure it in the pilot kitchen.
4. **Filled vs outline icons** at distance — no empirical study found; 27-F32's construction guidance is reasoned, not evidenced.
5. **KDS font size at distance** — derived per 27-F27, confirmed physically in the pilot kitchen. Write down what we measure.
