# Wave 1 design research — POS/KDS operational patterns (condensed to decisions)

The agent self-corrected once and closed two of its own declared gaps. Several findings
**contradict numbers already in doc 21** — flagged as CONFLICT and owed a ruling.

## ⚠ CONFLICTS with doc 21 as written

**C1 — Touch targets. Our floor is too small, and the "contradiction" in the literature
was a posture confound.** Three datasets, reconciled:

| study | posture | minimum |
|---|---|---|
| Parhi et al., MobileHCI '06 | one-handed thumb, handheld | 9.2–9.6 mm |
| Xiong et al., 2014 | seated, index finger, fixed screen | 10–12 mm |
| **Colle & Hiszem, Ergonomics 2004** | **standing at a fixed kiosk** | **20 mm** |

The number rises with posture instability and reach. **A counter POS is the standing-kiosk
condition** — so 20 mm (~126 dp) for the numeric cash keypad and 12 mm (~76 dp) as the
menu-tile floor. Doc 21 currently says **48 dp floor / 64 dp primary**. WCAG 2.2's
24 px (AA) and 44 px (AAA) are both *below* every empirical figure and cite only the
thumb study. Parhi's error curve: 3.8 mm→29.9%, 5.8→12.9%, 7.7→5.0%, 9.6→2.8%,
11.5→1.6%, and **no significant accuracy difference above 9.6 mm — past ~10 mm you buy
speed, not accuracy.**

**C2 — "New-cashier learnability <15 min to first clean order" has no evidential basis.**
The agent went looking and found published training-time claims spanning **20 minutes to
40 hours — a 120× spread, all vendor or SEO content**. Its recommendation: never quote a
number. Ours is currently a merge criterion. Keep it as an internal target if we like,
but stop presenting it as grounded.

**C3 — 21-F14's fresh-staff learnability check will greenlight the wrong design.**
CommandMaps found **no significant novice difference** between flat and hierarchical
layouts; the entire benefit shows up only in experts. **A novice-only test cannot detect
the most important layout decision we make.** RITE rounds must include someone who has
run 500 tickets, not only a fresh hire.

## Decisions

**P1 — Wet hands are quantified, and the number is alarming.** RainCheck (ICMI '18,
4,320 gestures): **21.34% gesture error rate wet vs 0.00% dry**, and *"about 20 seconds
before rainwater became a significant hindrance."* Two mechanisms: phantom touches, and
**centroid shift — the sensed tap point physically migrates toward the moisture.** Single
swipes were misread as two-finger pinches. Therefore: **never place a destructive action
adjacent to a high-frequency one** is a HARD rule on kitchen and counter surfaces, not a
preference. Gloved-hand rates remain unmeasured; practitioner consensus is unanimous that
the answer there is a bump bar, not a better layout.

**P2 — The best-documented layout-stability post-mortem, with the vendor's own A/B on
record.** Shopify POS, May 2024, moved add-to-cart behind a small "+" button. Shopify:
*"we found that having an explicit button to add-to-cart would improve user confidence by
almost 2x"*, citing accidental adds. Merchants: *"you've taken a 1/10000 problem and now
you have a much higher percentage"*, *"slow AS HELL"*, seven agreeing independently. And
a **platform split** — Android kept the fast path while iPad/iPhone lost it, so the same
worker had two motor programs on two devices.
**The generalisable trap: they optimised a measurable rare error and taxed the dominant
path. Weigh frequency × cost, not just the error you can instrument.**

**P3 — Menu depth is THE recurring complaint** across mined review "Cons" fields:
*"2–3 levels deep to do an 8 oz brown ale"*, *"at least 5 clicks to put in one person's
order"*, *"too many submenus"*. Independently corroborated by a 2021 CSCW systematic
review (168→53 papers, 48 projects, 20 practitioner evaluators) whose **G7 is "minimize
menu hierarchies; prefer linear navigation or flatten"**, with 3 of 6 industry reports
saying the same. That review also warns against **scroll bars** — horizontal and vertical
scrolling is less intuitive for low-literacy users. **Pakistan is directly in its evidence
base (4 of 31 Asian studies).**

**P4 — If a list's visual order is not the work order, you have shipped a defect.**
Square, June 2025: KDS and kitchen tickets print by *firing time*, not course number, so
cooks reading top-down prepare Course 2 first. Square staff called it *"a known pain
point."*

**P5 — A TRAINING MODE is a real requirement, and it collides with our append-only
ledger.** Practitioner account: *"there's no training mode and you have to create an
order"* to train. In a high-churn, temp-staffed kitchen that means staff either train on
live tickets — polluting an immutable event log and every report built on it — or don't
train at all. This needs a kernel-level answer, not a UI toggle.

**P6 — The menu-authoring tool is part of the POS UI.** *"Updating prices on our menu
literally takes three of us an entire day"*; *"the person programming in the menu can
still be completely useless and make it annoying to use."* A bad config is
indistinguishable from bad software at the terminal.

**P7 — Why POS UIs stay bad, and why review scores are worthless here.** *"Usability is
never considered because the manager never uses the software."* Replacement cycle 10–20
years. Toast's ease-of-use subscore is 4.2/5 across 553 reviews and a dedicated
"problems" round-up lists eight complaint categories with **zero about the interface**.
**Aggregate ratings survey the buyer, not the server at 8pm on a Saturday.**

## Low-literacy findings (corroborating the parallel strand)

**Medhi, Sagar & Toyama, ITID 2007** — on text UIs, illiterate/semiliterate subjects had
**0% task completion**, individuals and groups, both tasks, *"even with prompting"*,
giving up after 14.5–16 prompts. Text-free equivalent: **75–100%**, prompts down to
1.5–4.5. Map task 100% vs 0%, 10.5 vs 21.3 min. Design cost: >180 hours, 80+ subjects,
≥8 iterations per app. **The authors explicitly disclaim statistical significance** —
cite as magnitude, not effect size.

**Numerals confirmed independently twice: low-literate ≠ innumerate.** *"Subjects could
easily recognize numerals… these numerals can remain in the UI."* Prices, quantities,
table numbers and item codes are the safest symbols we can put on screen.

**Icon failure checklist (all from field observation):** semi-abstract cartoons beat both
photorealism and abstract graphics · abstraction fails for ACTIONS (animated arrows
failed; small car icons worked instantly) · object drawings read as PLACES not actions
unless motion cues are drawn in (utensils read as "the kitchen", not "washing up") ·
**matrix/tabular layouts fail outright — 2-D row×column semantics are a literacy-dependent
skill** · colour is read literally (*"roads can never be yellow"*) · **reading direction is
cultural — left-to-right clock faces were misinterpreted in Muslim culture**, fixed with
an explicit arrow (directly relevant to Pakistan) · partial help is worse than none,
because users *"tend to blame themselves"* · dwell-to-click failed and was removed.

## Deliberately NOT asserted
The agent found consumer "guilt tipping" commentary and an unverified claim that iPad tip
presets doubled gratuity, but **no credible source on UI-mediated tip theft from
workers**. Left out rather than asserted.

## Still open
Gloved/greasy error rates (acknowledged everywhere, zero published numbers) · any
engineering post-mortem from Toast/Square/Shopify about their own UI failures (**this
literature does not exist publicly**) · any peer-reviewed in-situ study of restaurant POS
or KDS usability · measured before/after data on any POS UI change · rates for duplicate
orders, lost tickets, accidental voids. Reddit was hard-blocked, so two Toast-redesign
complaints are search snippets only — treat as unverified.
