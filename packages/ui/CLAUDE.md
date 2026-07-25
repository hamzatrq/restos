# @restos/ui

**Owning specs: `specs/21-ux-system.md` (system) + `specs/27-design-language.md` (visual
language) — read both before modifying anything here (AGENTS.md routing).**

**Before writing a component or picking a value, read `TOKENS.md` in this package.** It is
the 27-F44 hallucination guard and it is short on purpose.

## The rule this package exists to hold

**A component that can be configured into violating a law is not a closed vocabulary.**
That is the test to apply to every prop you are tempted to add:

- `Tile` takes a **posture**, never a size (27-F8).
- `MoneyValue` takes **integer paisa**, never a formatted string and never a signed amount
  — money has no sign here (00 §6, and see `rupeesFromPaisa` in `domain`).
- `AgeBadge` takes **minutes and thresholds**, never a colour (03-F47, 27-F12).
- `QuantityItemLine` has no `align` and no `columns` prop, because a right-aligned quantity
  column *is* the defect 27-F57 names.

## Storybook

`pnpm storybook` (dev) · `pnpm build-storybook`. Every component gets stories for every
state, and **every story states what a non-reader must be able to do with it** — that
sentence is the artifact `27-F35`'s ≥85% comprehension gate is run against. Per `27 §2b`
those claims are reasoned, not measured: no research exists on this population parsing
operational UI, so the stories are written to be falsified on real staff.

## Checked, not asserted

`src/tokens/tokens.test.ts` re-derives doc 27's arithmetic on every commit — the dichromacy
ΔE00 ladder (27-F15), the WCAG 2.2 AA pairings (27-F21), the posture table (27-F8) and the
naming laws (27-F38..F46). If you change a token value, that suite is what tells you whether
the design still holds.
