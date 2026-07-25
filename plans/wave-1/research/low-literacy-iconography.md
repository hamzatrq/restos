# Wave 1 design research — low literacy, icons, numerals (condensed to decisions)

**The framing that matters most.** Pakistan adult literacy 58.86% (World Bank/UNESCO);
2023 census 60.7% national, **74.1% urban vs 51.6% rural**, rural female ~47.5%; 67.5%
of "educated" Pakistanis are below matric. Roughly **4 in 10 adult staff, and half of
rural women, are non-readers by the census's own definition.** The agent's line: *the
founder's requirement is not an edge case; it is the median user.*

## The single biggest finding: HIERARCHY, not text, is the binding constraint

CHI '13, n=60, three Bangalore slums, **entirely graphical UIs with NO TEXT**:
deep hierarchy task success **91% (high literacy) vs 40% (low literacy)**, p<0.01; by
abstract reasoning 92% vs 42%. Failing users **guessed randomly** — *"they did not seem
to understand the concept of nesting, that the top graphic represented a group of
pages."* Authors: *"keep navigational UIs linear… minimize hierarchical depth EVEN AT
THE EXPENSE OF CONCISENESS."* Closing line: *"designers should not assume that the
inability to read is the only obstacle."*

INTERACT '13, n=20, both layouts needing ~4 taps: **flat paged list 25 s / 100% correct
vs 4-level hierarchy 65.5 s / 80%.** Tested layout was **6 items per page in a 3×2 grid,
7 pages**, with back and forward **adjacent** — the back button was understood only
because it sat beside the forward button already in use.

**Removing text is not enough. Flattening is the intervention.**

## Numerals — WESTERN digits, decisively (and this corrects my speculation)

Unicode/CLDR classify Pakistani Urdu as a Western-digit locale: `ur` → `latn`,
`ur-PK` → `latn`, while **`ur-IN` → `arabext`**. Artefacts agree without exception:
coins Latin-only; vehicle plates Latin-only; the **raised tactile numeral for the blind
on the Rs 75 note is Latin**; every banknote security-feature numeral is Latin. Measured
digit codepoints on Urdu sites: express.pk 1,371 Latin / 0 Eastern; ur.wikipedia 5,184 /
0; utility portals 100% Latin. A Punjab Textbook Board Urdu-medium textbook: full
Nastaliq prose, **every numeral Latin**.

**Never U+0660–0669** — those are *Arabic* shapes. Urdu would need U+06F0–06F9 *plus an
Urdu-shaped font*, because 4, 6 and 7 diverge between Persian and Urdu. A Persian font
renders silently wrong shapes to Urdu readers.

**Honest gap the agent flagged itself:** *no study anywhere has measured Eastern vs
Western digit reading speed, in any population.* The recommendation rests on locale
standards and artefact ubiquity, not a reading study.

**Digits are read; arithmetic is not.** ASER Pakistan 2023 (272,370 children): ~60% of
rural Class 1 recognise numbers, **9.5% can do any arithmetic**. Literacy and numeracy
*floors are identical* (30.3% vs 30.2% "nothing"). **The system computes; staff read.**
Every total, change, line total and elapsed minute must arrive as a finished number.

Perceptual note (Starrfelt & Behrmann 2011, n=20, 480 trials/type): digits beat letters
**only under brief/degraded viewing** — 0.82 vs 0.73 overall, but the advantage vanishes
by 53 ms of clean viewing. That is exactly the glance-across-a-counter case, and it is
the argument for making digits *big*, not for assuming they will be read.

**Money format:** `Rs`, symbol-first (CLDR for both `ur` and `en-PK`) — **not `₨`, not
`PKR`** in staff UI. **Western 3-digit grouping** `250,000` — CLDR gives `ur`/`en-PK`
`#,##0.###` while `hi`/`en-IN` get lakh grouping. Pakistan does **not** inherit lakh
punctuation. Drop decimals on operational screens (no sub-rupee unit circulates, and the
decimal is the highest-consequence keystroke — "out by 10").

## Icons — draw them ourselves, in Pakistan

**Off-the-shelf sets will fail here, and we have the number.** 987 Pakistani doctors,
dentists and paramedics on 19 ISO 7010 safety signs: **mean comprehension 42.2%; only 2
of 19 cleared the ISO 67% threshold.** Oxygen cylinder: 7.5%. These are *literate
professionals*. Material Icons will do no better.

**Locally-drawn pictograms score ~2× imported ones** with low-literate users: 20 of 23
local vs 11 of 23 USP met ANSI ≥85% at follow-up, with *"an overwhelming preference"*
for the local set. Note the design-critical detail: that was measured **after the
meanings were taught**, three weeks later — retention-after-teaching is the right metric
for staff, not cold intuition.

**Style: semi-abstract line drawings.** Photographs measured **worst** of five visual
representations (n=200, 13 symptoms × 10 representation types). *"Semi-abstracted
drawings in which only the essential information is depicted is better grasped than
photorealistic imagery that contains extraneous visual features."*

**Action icons need motion cues; object icons must not have them.** Drawings without
motion read as *places*, not actions — utensils read as "the kitchen", not "washing up";
abstract traffic arrows failed until replaced with small car icons.

**Icons must be semantically distant from EACH OTHER**, not merely close to their
referent (Applied Ergonomics 2017, 3 experiments). Acceptance test: show the real page,
name the function, record the tap — an icon fails if it draws taps meant for a sibling.

**Cultural failures documented in-field, several Urdu-specific:** left-to-right clock
faces misread *"because Urdu is written right to left, Muslim culture views time as
flowing right to left"* · a house outline read as "a village hut" · **a matrix of ticks
and crosses "was not readily understood" — 2-D tabular semantics are a literacy-dependent
skill** · colour read literally (*"roads can never be yellow"*).

**Gate: ≥85% correct and ≤5% critical confusion (ANSI Z535.3), ≥66.7% floor (ISO 9186),
on a post-training retest with real staff.** Budget for ≥2 full redraws; the source teams
ran 8+ iterations each.

## Colour — weaker than assumed, in four independent ways

1. **~3–6% of male staff are colour-deficient, deutan-dominant, and most don't know**
   (Pakistani studies: 5.32% Buner, 5.75% Quetta, 2.75% Karachi n=8,214; ~80% unaware).
2. **Cheap panels destroy it.** 20 uncalibrated monitors in their own sRGB mode: luminance
   41–282 cd/m² against a nominal 80. A colour-vision screening test's sensitivity fell
   to **0.55** — observers with severe deficiency *passed* on uncalibrated displays.
3. **Ambient light destroys it, and red goes first.** Touchscreens carry **no
   anti-reflection coating**; ambient contrast 86:1 → **1.3:1** at 500 lux. FAA
   HF-STD-001B: *"red is often the most sensitive to desaturation… when color is
   desaturated, color coding becomes ineffective."*
4. **Low-literate users decode colour REFERENTIALLY, not symbolically** — they ask *what
   colour is the real object*, not *what does this colour signify*. And the definitive
   quantitative HCI4D study for this population **does not test or discuss colour
   semantics at all** — anyone citing HCI4D in support of traffic-light coding is citing
   something that isn't there.

Also: **the green-safety half of the traffic-light metaphor is the weak half.** Red-danger
is strong with both words and symbols; *"no green effects were observed"* with symbols.
And the effect needs a visible contrast set — a lone red chip operates outside the
condition where it was ever demonstrated.

**Correcting a common assumption:** the claim that green is problematic in Muslim
countries has **no evidence**. Saudi study, n=409: green elicited plants, trees, flag,
peace, calm — *"Religion or Islam did not appear as documented associations for any green
variant."*

**Rule:** design achromatically first (FAA: *"color should only be added after the
effectiveness of a screen has been maximized in an achromatic format"*). If the KDS is
unreadable in greyscale it is broken. Status = colour **+ shape + position + a number**;
enforce it in the type system so a `StatusChip` cannot take a colour without a shape.

## Onboarding

**Training video must show the EXACT task on the EXACT screen.** n=56: diversified
examples helped the higher-literacy group (19.0→13.4 prompts) and did **nothing** for the
low-literacy group. A participant on a generic tutorial: *"But that was about animals and
birds, and this is about clothes and TV sets."* Low-literacy users needed **26.1 prompts
vs 11.6** — more than double.

**Open with full-context framing** — dramatise *why* the machine knows about table 4 —
before any UI tutorial. One subject *"refused to continue"*, unconvinced a computer could
deliver job information at all.

**Persistent help everywhere, or none.** *"Even a single icon missing voice annotation
causes confusion"*; partial help *"will cause a loss in confidence among subjects who
tend to blame themselves for the interface's shortcomings."*

**Design for the shift lead as intermediary.** CHI 2010, 4 months / 22 women / 110 hours:
surrogate usage, proximate enabling, proximate translation. There is a **"second-order
usability"** — usability *for a beneficiary via a helper* — that direct-interaction
heuristics do not cover. A restaurant is a dense intermediation environment by default.

## The trap I most want on the wall

**Graphical UIs win completion and LOSE badly on speed.** TOCHI 2011, n=58: graphical
**100% completion but 13 minutes and 14 prompts**; voice 72% but **5.2 min and 4
prompts**. *"A POS that every waiter can eventually use and no waiter can use at 8pm on a
Friday."* Speed must be measured separately from success, at rush tempo.

## Sobering context — the interface is not the whole game
- **OLPC RCT**, 318 rural Peruvian schools, 15 months, laptops/student 0.12→1.18:
  **"no evidence of effects on test scores in math and language."** Deployment ≠ adoption
  ≠ outcome.
- **Bhoomi** (Karnataka land records, World Bank best-practice showcase): software worked
  perfectly; fieldwork found mutation costs went **Rs 1,000/2–4 days → Rs 3,000/3–4
  months**, and up to Rs 100,000 on the city edge. Centralising inserted four
  administrative layers. *"It is naïve to assume that computers and well-designed
  software… can address such structural political issues."*
- **ICT4D base rates**: ~35% total failure, 50% partial, 15% success — and the author is
  explicit these are estimates, not a census. **Do not quote "80% of ICT4D projects
  fail" as fact.**
- **Median HCI4D evaluation is TWO WEEKS**; only 2 of 65 studies ran past six months.
  Everything above measures *first use*. **Our dev pilot is the study.**

## On the English-only decision (recorded, not relitigated)
The corpus does **not** find that local-language *text* rescues low-literate users — text
failed at 0% completion regardless of language, and translated banking terms were still
*"alien concepts."* What it repeatedly finds valuable is local-language **voice**. So the
English-only *label* decision is cheap; what we would forgo by never adding **Urdu audio**
is the expensive omission.

## Open gaps the agent named honestly
No study compares Eastern vs Western digit reading (largest gap) · no controlled
measurement of multi-digit reading by unschooled adults; the widely-quoted street-maths
percentages **could not be verified and should not be used** · no adult numeracy
assessment exists for Pakistan · no empirical filled-vs-outline icon study · no evidence
for a learnable icon-vocabulary limit (the ~20–25 chrome cap is judgement) · **no study
measures what any colour means to Pakistanis** — Pakistan appears in none of the major
cross-cultural colour datasets, and much of what circulates traces to a 2009 infographic
tagged "Just For Fun" · no study of grease (as distinct from water) on capacitive touch ·
all vendor KDS error-reduction claims are marketing with no traceable method.
