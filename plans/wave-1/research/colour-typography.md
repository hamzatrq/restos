# Wave 1 design research — colour & typography (agent report, condensed to decisions)

Everything below was **computed or measured** by the research agent, not copied from
vendor pages: WCAG/APCA maths, ΔE00, CVD simulation (Machado et al. 2009), and font
metrics read from shipping binaries with fontTools.

## Decisions this forces

**D1 — Colour means "abnormal", never decoration.** ISA-101 (High-Performance HMI) and
IEC 60073 already say this for exactly this class of display: low-saturation grey base,
colour reserved for abnormal/action states. Measured capacity limit is **7** colours
(not the folklore 10±2), and search degrades continuously below it. Budget: **3 status
colours + 1 interactive accent**.

**D2 — The naive traffic-light palette is broken and must not ship.** Measured ΔE00
green vs red under deuteranopia: **8.2** (from 67.9 normal) — near-identical olive. Fix
is a monotonic **lightness ladder** L* 100 → 77.5 → 39.7; worst case under any
dichromacy **31.4**. Redundancy must ride on ONE extra attribute (lightness, position,
text), never a second hue — two simultaneous colour encodings measurably collapse
search performance.

**D3 — Money is never coloured by default.** Colouring the most common number on screen
spends the whole preattentive channel on the base case, leaving nothing for the genuine
exception. Colour on a number means *this number is abnormal*.

**D4 — Type: IBM Plex Sans, chosen on fail-safe defaults.** Measured: Plex has tabular
digits AND distinct I/l with no feature flags. **Roboto is DISQUALIFIED for numerals** —
no slashed zero, no disambiguation set, I/l identical outlines, unfixable. **Inter needs
tnum + ss02** or its digits span 833→1323 units (59% jitter in a money column) and its
I/l are identical. Where a dropped OpenType feature silently corrupts an order number,
defaults that fail safe beat features you must remember.

**D5 — KDS type is specified in cap-MILLIMETRES at a stated distance, never dp.** The
same dp renders 2.3x larger on a 32-inch 69-PPI monitor than on a 267-PPI phone.
Derivation: ISO 9241-303 (20–22 arcmin recommended, 16 minimum), with **30 arcmin for
KDS primaries** as a safety factor for steam, grease and a moving reader.

**D6 — A 10-inch tablet is not a KDS.** 9.5 item lines at 1.5 m, about 1.5 tickets. More
pixels do not help: 1280x800 and 1920x1200 at 10.1 inches fit identically 9.5 lines.
Only physical height buys capacity. **22 inches is the floor** for a 3-ticket view.

**D7 — Light theme is the default everywhere; dark is a per-site KDS opt-in.** Positive
polarity wins on acuity and proofreading for both younger and older adults, and the
advantage is LARGEST at small character sizes — exactly where the POS lives. Honest
contradiction: every commercial KDS ships dark and no study supports it. Flagged for a
pilot A/B rather than resolved from the armchair.

**D8 — Sunlight is a hardware problem, not a palette problem.** At 80,000 lux on a
1000-nit phone every pair collapses to ~1.6–1.9:1, light and dark identical. Fix with a
brightness lock while a delivery is active, 1000-nit hardware, matte/AR film, and
reducing the sun-critical payload to 2–3 very large glyphs.

**D9 — Amber cannot reach WCAG 3:1 and stay amber.** Swept: the crossover lands exactly
where amber becomes brown and loses its IEC "abnormal" reading at 1.5 m. Keep bright
amber for the preattentive job; satisfy 1.4.11 with a dark warn-edge band plus the label.

**D10 — Gate on WCAG 2.2 AA, use APCA as tie-breaker in dark mode.** WCAG is the
auditable standard with legal standing; APCA is non-normative but its own docs state
WCAG 2.x cannot guide dark-mode design. Every recommended token passes both, so the
conflict is currently theoretical — except text-disabled, where the dark value passes
WCAG and fails APCA's floor.

## Amendment owed to doc 21
Section 6 open-item 2 says of KDS legibility "we are inventing here". **Too
pessimistic** — ISO 9241-303's angular cap-height extrapolates to any distance, and the
independent signage rule of thumb converges within a safety factor. Reframe the
pilot-kitchen measurement from primary source to confirmation of a two-authority
derivation.

## Open (the agent's own, honest)
- Nastaliq size multiplier unmeasured. Line-box cost is 2.07x Latin; the size factor for
  equal legibility is unknown, because the sloped baseline breaks the cap-height model.
- Atkinson Hyperlegible has no published efficacy study. Offer it; do not claim a
  measured benefit.
- **Weakest evidence in the report:** South Asian colour semantics came from general
  culture pages, not HCI research. Unverified and operationally relevant — whether
  Pakistani staff read green-up/red-down on financial figures the Western way or the
  East-Asian inverted way. Settle with real staff before any chart ships.
- Glare model is first-order diffuse; steam and grease scatter is unmodelled, and is the
  strongest argument for the 30-arcmin safety factor.
