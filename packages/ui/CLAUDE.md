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
