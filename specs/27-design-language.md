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
- 27-F4 **Grid position is a compatibility contract** (strengthening 21 §5's cashier law to a platform rule). Adding, removing or reordering an item on an operational grid is a **breaking change** requiring PR justification and a dev-pilot acclimation window. **No adaptive, frecency-sorted or personalised ordering anywhere staff-facing** — static menus measurably beat adaptive ones, and 23 of 34 field subjects could not perform a task they knew well on a differently-arranged device.
- 27-F5 **No context-dependent or invisible controls.** No soft keys, no hover or dwell activation, no long-press-only actions, no gesture-only affordances. Dwell-to-click was tried in the field and abandoned. Every action has a persistent, visible, labelled target.
- 27-F6 **No operational role is ever required to type non-numeric text to complete a CRITICAL-PATH task.** Modifiers and reasons are pick-lists of tiles, or voice; of 27 field subjects, 24 could not type a single word. Typing may exist as an **optional escape hatch** — 21 §5 names search as exactly that, and 02-F2 search, 02-F6 notes and 02-F27 customer name are all legitimate under this reading. The test is whether a non-typing operator can complete the task by another route, not whether a keyboard appears anywhere.
- 27-F7 **A list's visual order MUST be its work order.** If tickets render in an order other than the order they should be worked, that is a defect, not a display preference.

## 2. Touch, density and latency

The ergonomics and low-literacy strands converge here from opposite directions, which is why these numbers are raised rather than split: bigger targets and fewer-items-per-page are the *same* design.

- 27-F8 **Touch minimums, by posture** — the apparent contradiction in the literature is a posture confound, not a disagreement:

| context | posture | minimum |
|---|---|---|
| counter POS grid tile | standing at a fixed terminal | **76 dp** (12 mm) |
| cash / numeric keypad | standing, high-consequence entry | **126 dp** (20 mm) |
| handheld waiter/rider | one-handed thumb | **64 dp** (9.6 mm) |
| **kitchen bump / KDS action** | **standing, wet or greasy hands, 1–2 m** | **96 dp** (15 mm) |
| absolute floor, anything | — | **48 dp**, gaps ≥8 dp |

  The kitchen row is set above the standing-counter minimum deliberately: it is the one surface where 27-F9's measured **21.34% wet-hand gesture error** was gathered, and the operator is also reading at 1–2 m. Doc 21's superseded law named "KDS bump targets ≥64dp"; that number came from no posture study and is raised here.
  Measured error rates at 9.6 mm are 2.8% and **there is no significant accuracy gain above it** — past ~10 mm you are buying speed, not accuracy. WCAG 2.2's 24 px (AA) and 44 px (AAA) are below every empirical figure and cite only the one-handed thumb study; they are a legal floor, never a design target.
- 27-F9 **Destructive actions are never adjacent to high-frequency ones on any surface a wet hand touches.** Wet-screen gesture error is **21.34% against 0.00% dry**, water becomes a hindrance within ~20 seconds, and the sensed touch point physically *migrates toward the moisture*. This is a hard rule, not a preference.
- 27-F10 Touch feedback <100 ms (restating 21 §4 as the perceptual threshold). Optimistic UI for anything the device can decide locally; a spinner is an admission the device asked someone else.
- 27-F11 **Density is a professional-tool decision, not a taste one.** Expert operators scanning a familiar layout are doing something categorically different from a first-time reader. Density is bounded by 27-F8's target sizes and by 27-F2's page size — not by an aesthetic preference for whitespace.

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
- 27-F15 **Status colours ride a monotonic LIGHTNESS ladder, and the fill carries it — never a dot, badge or thin rule.** The naive equal-lightness traffic-light palette measures ΔE00 **8.2** under deuteranopia (near-identical olive); the lightness ladder measures **31.4** worst-case across all three dichromacies. Small patches lose hue first, and at 1–2 m a thin stroke contributes almost nothing to the priority map.
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
- 27-F27 **KDS type is specified in cap-millimetres at a stated viewing distance, never in dp.** The same dp renders 2.3× larger on a 32" 69-PPI panel than on a phone. Derivation: ISO 9241-303 (20–22 arcmin recommended, 16 minimum), with **30 arcmin for KDS primaries** as a safety factor for steam, grease and a moving reader.
- 27-F28 **A 10" tablet is not a KDS.** It holds ~9.5 item lines at 1.5 m — about 1.5 tickets — and more pixels change nothing, because only physical height buys capacity. **22" is the hardware floor** for a 3-ticket view.
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
- 27-F52 **A training mode is a product requirement, and it reaches the kernel.** Without one, staff train on live tickets, polluting an append-only ledger and every report built on it. This needs an architectural answer, not a UI toggle. (Owed to doc 01/02.)
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
