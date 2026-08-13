# @restos/ui

**Owning specs: `specs/21-ux-system.md` (system) + `specs/27-design-language.md` (visual
language) — read both before modifying anything here (AGENTS.md routing).**

**Before writing a component or picking a value, read `TOKENS.md` in this package.** It is
the 27-F44 hallucination guard and it is short on purpose.

## A dp is a PHYSICAL size, and `PanelRoot` is where it becomes a pixel (27-F68)

**`targetFor("keypad")` returns `126` and that is 20 MILLIMETRES, not 126 CSS pixels.** The
identity `dp ≡ css px` holds only at 160 PPI, is stated nowhere in doc 21 or doc 27, and
does not fit `27 §1a`'s hardware: on the counter's two panels that key is **79 px and 111
px**. Spending it as a CSS pixel drew every touch target in the product at the wrong
physical size, and it took `DEC-UI-001` — a founder ruling — to settle it.

**You never do the conversion.** A host wraps its tree in `<PanelRoot panelPpi>` once, and
everything inside is laid out in dp: tokens, component internals, the host's own numbers
and the chrome, all together. That is deliberate and it is the whole design — `DEC-UI-001`
(b) names "converted `targetFor()` and left the chrome in raw CSS px" as the next error, and
there is no call site here to get that wrong. `physical.tsx` carries the arithmetic, the
component, and the measured reasons the alternatives (`rem`, a computed token layer,
`transform: scale()`) were rejected.

Two rules the FR forbids breaking, both easy to break by accident:
- **Never pin a pixel value.** 79 px is 20 mm at 100 PPI and **14.2 mm at 141 PPI**, below
  `27-F8`'s floor on the highest-consequence entry surface in the product.
- **Never trim the millimetres to make a layout fit.** `27-F8`'s numbers are a measured
  ergonomic minimum; the ruling changed how they *render*, never what they *are*.

**The same rule now governs the WINDOW, not just the targets inside it** (August 2026, founder
ruling: bring-your-own-hardware). `apps/pos-electron` declared `minWidth: 1366, minHeight: 768`
and that pixel floor **refused** a 1280x800 @13.3" laptop which renders every surface here with
zero violations, while **admitting** a 1366x768 @10.1" tablet which clipped two of them. The floor
is millimetres of glass now and it CLAMPS to the display instead of refusing it, so the till
starts on hardware this package's layouts do not fit — and **`PanelHealth` is the component that
says so**. When a layout here stops fitting the floor, that is a real regression and
`layout:check` reddens; the remedy is never a smaller millimetre.

**⚠ THE FLOOR IS `220 x 125 mm` AND THAT TABLET SHIPS — this section said `215 x 134` and "clips
two of them" (August 2026).** Both were true and both stopped being true in the same change: this
package's `compact` mode used to alter three numbers (`MONEY_COLUMN_DP`, `CHANGE_SIZE`,
`CARD_WIDTH_DP`) and no arrangement at all, so the Pay tab was 23 controls against 23 in the same
order at the same postures with one 12.9 mm difference — dispatch, not degradation. It is an
arrangement now, and the 10.1" tablet class renders every surface with **zero** violations.

## `compact` is an ARRANGEMENT, and four components read it

`useSurfaceMode()` — `TabRail`, `Panel`, `TenderPanel`, `PersonTile`. Each reads the mode itself
rather than taking a prop, because a prop is a prop a caller can get wrong and this package's
standing test is *"a component that can be configured into violating a law is not a closed
vocabulary."*

**The rail turns VERTICAL on compact glass and it is the biggest single lever in the shell** — a
horizontal rail is 85 dp = 13.5 mm of vertical chrome on every surface at once, more than a tenth
of a 126 mm panel. Same five tabs, same order, all visible and labelled: no overflow, no "More"
(`27-F5`, `27-F2a`). It spends the axis with room to buy the axis without, and the compounding is
the non-obvious part — Cash's groups column-wrap, so buying Cash height made it **narrower** too
(1705 dp -> 1385).

**⚠ THE MODE COMES FROM `PanelRoot`, NOT FROM `WorkSurface`, and this is load-bearing.**
`WorkSurface` used to measure itself and publish the mode. That is right for **capacity** and
wrong for **mode**: `03-F5`'s band takes 102 dp out of the work area on every confirm, so a mode
read there would reflow the whole layout mid-service and destroy the one property that makes
reflow legal under `27-F4` — *a till lives in one mode for its service life and no operator
watches it change*. A compact layout that moves the rail into the work area's width would also be
reading its own output. `PanelRoot` measures the GLASS and publishes `usePanelSize`; the glass
does not move. **A consequence worth knowing before you write a test:** a `WorkSurface` with no
`PanelRoot` above it resolves to the default `counter` on every panel.

Nothing in compact shrinks a target. Every key, tile and tab keeps `targetFor(posture)` to the
dp, and the gate measures a **20.00 mm** keypad key on the smallest shipping panel.

Inside `PanelRoot` the CSS pixel Blink lays out in **is** the dp, which is why
`usePhysicalSize` converts through `mmFromDp` and why `ItemGrid`/`OrderList` default `ppi`
to `DP_PER_INCH`. A component reaching for `CSS_PX_PER_INCH` to size something is almost
certainly making the mistake `27-F68` exists to name.

## The rule this package exists to hold

**A component that can be configured into violating a law is not a closed vocabulary.**
That is the test to apply to every prop you are tempted to add:

- `Tile` takes a **posture**, never a size (27-F8).
- `MoneyValue` takes **integer paisa**, never a formatted string and never a signed amount
  — money has no sign here (00 §6, and see `rupeesFromPaisa` in `domain`).
- `AgeBadge` takes **minutes and thresholds**, never a colour (03-F47, 27-F12).
- `QuantityItemLine` has no `align` and no `columns` prop, because a right-aligned quantity
  column *is* the defect 27-F57 names.
- `Panel` takes a **tone**, never a colour, and the only tone above neutral is `abnormal`
  (27-F14's amber). There is deliberately no `fault` tone: red's claimants in 27-F14 are
  enumerated and `03-F5`'s S1 band owns them, so a second red region is how the band stops
  being the loudest thing on the glass. Its fill sits on the CAPTION and never on the body,
  so money inside an abnormal region is still uncoloured (27-F16).

## The two idioms this package is meant to be recognised by

**`Readout` pairs a caption with one FACT. `Panel` pairs a caption with one GROUP.** Between
them they are how every surface in the product says "here is a thing and here is what it is
called", and reaching for a third way is the drift 27-F43 describes: *"leaving the pairing in
prose produced a publicly-reported failure that remains unfixed years later."* Before `Panel`
there were three hand-rolled regions in the tree — `OrdersSurface`'s `TRAY`, `TenderPanel`'s
inline `<section>`, `App.tsx`'s `MASTHEAD` — each with its own padding, radius and caption.

**`Panel` upper-cases its title in CSS, not at the call site**, and that is the one place it
differs from `Readout` on purpose. `text-transform` leaves `textContent` untouched, so a
title can be natural-language text an acceptance oracle matches (`orders-tab.dom.test.tsx`
finds both lists by their heading) while the glass still gets the instrument capital.
`panel.dom.test.tsx` pins which mechanism is in use, so a future edit that upper-cases the
STRING fails here rather than five assertions away.

## `27-F26`'s typeface is BYTES, and it lives here (`src/fonts`)

**The FR named IBM Plex Sans and this repo shipped no font file of any kind until August 2026** —
`find` for `*.woff2|woff|ttf|otf` outside `node_modules` returned nothing. So the token named a
family the machine did not have and every surface rendered a different OS fallback. `tokens.test.ts`
asserted the STRING matched `/IBM Plex Sans/` and not `/Roboto/`, and both passed the whole time,
because a string is all happy-dom can see.

It is not cosmetic: the face was chosen *for numeral disambiguation on money surfaces*. Verified
against the binaries rather than read off the FR — every digit advance is 600/1000 em in all three
weights (**no `tnum` in the GSUB at all**, which is what "no feature flags" means) and `I`
(400/414/423) differs from `l` (272/285/294) in advance and outline.

- **`installFontFaces()`** is the seam every DOM host calls; the back office inlines
  `fontFaceCss()` server-side instead. Both Electron CSPs need `font-src 'self' data:`.
- **Three weights, Latin only** — the scale spends exactly 400/500/600, and commandment 7 makes
  the UI English. No `unicode-range`, so a codepoint outside the subset falls through to the next
  family, which is correct.
- **`local()` is per WEIGHT.** `local('IBM Plex Sans')` on all three faces is a real bug that
  looks right: it matches the *Regular* face, so on a machine with Plex installed the scale
  silently flattens.
- **`PRIMARY_FAMILY` is derived from `tokens.json`'s `$family`**, never typed twice — a face
  declared under a name the tokens do not ask for is a font that loads and is never used.
- **`font-display: swap`**, chosen on the FAILURE mode: `block`/`auto` render invisible text for
  up to 3 s and a cashier who cannot read the total mid-rush is worse than one who reads it in the
  wrong face for a frame; `optional` may decline the face for a whole page load.

⚠ **Nothing in THIS package can assert the face loads** — happy-dom performs no layout and loads
no fonts. `fonts.test.ts` guards the CSS shape, the binary↔base64 drift and the family name; *"it
is loaded"* is asserted in Blink by both `layout:check` gates.

⚠ **A negative regex over `fontFaceCss()` is UNSOUND** and this was caught by a correct
implementation going red: base64 draws on `[A-Za-z0-9+/]`, so `ss02` occurs by chance at index
2047 of the weight-600 payload. Negative assertions run on a payload-stripped view.

⚠ **`⌫`, `◀`, `▶`, `✓` and `→` are in NO IBM Plex Sans subset** (checked across all six, not
assumed), so the UI's own symbols are OS glyphs permanently and a residue of platform-dependent
metrics survives there. An icon component, not a bigger font, is the fix if it matters.

**That component now exists — `src/icons/` (`27-F30`..`27-F37`, August 2026) — and it has NOT
been pointed at those five glyphs yet.** `backspace` and `clear` are drawn and in the vocabulary,
and `NumericKeypad` still renders `⌫` and the letter `C`, deliberately: that pad is the most
position-and-content-dependent surface in the product (`27-F4`), swapping a key's content is a
change an operator has to re-learn, and `27-F35`'s comprehension gate has not been run. It is the
obvious next wiring and it is a decision, not a chore.

### `src/icons/` — the icon vocabulary (`27 §5`)

Twenty drawings on one 24-unit grid, inline SVG, `currentColor` only, sized from a type token.
**Read the module header before touching it** — the evidence (42.2% on ISO 7010, 20-of-23 vs
11-of-23) is what decides why nothing is installed here.

Three things a reader should know without opening it:

1. **`Icon` is not exported from this package's barrel; `IconLabel` is.** `27-F35`'s ≥85%
   comprehension / ≤5% critical-confusion retest with real staff **has not been run**, so a
   pictogram may accompany a word and may never replace one. There is no prop that hides the
   word and a blank label throws. Exporting `Icon` is how that law gets skipped.
2. **Four drawings shipped wrong and were caught by LOOKING, not by the 44 tests.** `takeaway`
   rendered as a *rubbish bin*, `sold_out` as a *bow tie*, `phone` as a *printer* and then as a
   *castle*, `dine_in` as a *park bench*. Every one passed the whole suite: line drawings, on the
   grid, in the mark band, distinct from every sibling. **A drawing is a claim about what a
   person will see and no assertion in this package can check it.** Render the set and look.
3. **The symbol is ONE type step above its word, and the ceiling is measured.** Two steps
   (36 dp) fits a 76 dp tile and still failed `layout:check` — `[tablet-10.1 caller] 571px in a
   567px box`, a new violation on the tightest panel in `27 §1a`. One step is 24 dp / 3.8 mm and
   clears every panel. If staff cannot read a symbol at that size the answer is a simpler
   drawing, not a bigger number.

### ⚠ THE COMPOSITE IS SPENT APART 34 TIMES OUT OF 36 — found while chasing the last 3 dp, OWED

Bundling the face made macOS and Linux agree on almost everything (`layout:check` went **44 fatal
violations → 1** on Linux). The survivor is `tablet-10.1 tab:Cash` under `03-F5`'s band: **570 dp
of content in a 567 dp box**, Linux only, macOS clean. It is **pre-existing, not introduced** —
the same surface was 570 dp in a **543 dp** box before the font landed, so the content never moved
and the box grew 24 dp.

The mechanism, measured across `src/components`: **36 `fontSize:` spends and 2 `lineHeight:`
spends.** `27-F42` makes typography COMPOSITE — *"take `text-body` whole … never destructure a
size out of one"* — and the line-height half is dropped in 19 of 20 components, including
`StatusStrip` and `AlarmBand`, which are exactly the chrome sitting above that box. With no
explicit `line-height` Blink derives the line box from the font's ascent/descent **as resolved by
the platform backend** (CoreText vs FreeType), so a line box can differ by a pixel or two for an
identical font file. That is the whole of the residual platform dependence.

**It is NOT a drive-by fix and the arithmetic says why.** `text-label` is 14/20; the font-derived
line box at 14 px Plex is ≈18. Honouring the composite therefore makes chrome **TALLER**, which
shrinks `main` and makes this same Cash overflow **worse** before it makes anything better. The
package guide already records that *"Pay has 38 px spare, Cash has 0"* — so the correct fix is
"honour the composite everywhere **and** re-cost the Cash arrangement", one piece of work, with
both `layout:check` gates on **both** platforms in its blast radius. Scheduled consolidation
(`24 §3b`), not a drive-by, and the 3 dp is the symptom rather than the defect.

## Storybook

`pnpm storybook` (dev) · `pnpm build-storybook`. Every component gets stories for every
state, and **every story states what a non-reader must be able to do with it** — that
sentence is the artifact `27-F35`'s ≥85% comprehension gate is run against. Per `27 §2b`
those claims are reasoned, not measured: no research exists on this population parsing
operational UI, so the stories are written to be falsified on real staff.

## The guards that came from a real review

`src/components/discipline.test.ts` exists because an adversarial pass over the first draft
found each of these as a live defect: no `opacity` for state (it put disabled-reason text at
**1.89:1**, defeating `27-F4`), no touch-size literals (a destructive control had shipped at
44 px, under the 48 dp floor), no `bgColor-` as a foreground or `fgColor-` as a background
(`27-F40`'s prefix exists to say which property a token belongs to), no hex in component
code, and every `fgColor-` token AA against **every** surface — that last rule caught the
*fix* for the third one within minutes.

## Checked, not asserted

`src/tokens/tokens.test.ts` re-derives doc 27's arithmetic on every commit — the dichromacy
ΔE00 ladder (27-F15), the WCAG 2.2 AA pairings (27-F21), the posture table (27-F8) and the
naming laws (27-F38..F46). If you change a token value, that suite is what tells you whether
the design still holds.
