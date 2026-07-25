# Wave 1 design research — token architecture, ergonomics, a11y (condensed to decisions)

Notable: the agent's own post-mortem sub-agent **corrected two of its recommendations**
with primary evidence from shipped changelogs. Both corrections are adopted below.

## Decisions

**T1 — Every token slot is REQUIRED; no elided defaults.** Polaris ran the experiment:
its v11 formula omitted "default" slots, so `--p-color-bg` existed bare. In v12 that
exact name **changed meaning** (v11 `--p-color-bg` = surface; v12 `--p-color-bg` = app
background). Primer chose the opposite and said so — *"the property value is always
required"*, ✅ `textColor-accent-default` / ❌ `textColor-accent`. Two systems, opposite
choices, one clear outcome.

**T2 — No relative modifier ladders (`subtle`/`bold`/`bolder`).** Atlassian's
`@atlaskit/tokens@0.7.0` renamed **`bold` → `subtle`**: the old bold token BECAME the
subtle token. The name stayed valid and the meaning inverted, so a name-matching codemod
emits plausible, wrong output — and a diff-reviewing agent cannot see it. Use **ordinals
pinned to a scale** (`bg-fill-danger-100/200/300`) or a closed enum never reordered.

**T3 — Role-first prefixes** (`bgColor-`, `borderColor-`, `fgColor-`). Primer ADR-006 is
the primary evidence: the old names *"didn't convey which property to be used with"*,
and adding type+property *"enforces clarity around where and how a token will be used"*.
Their before/after is damning — `accent.muted` → `borderColor-accent-muted` but
`accent.subtle` → `bgColor-accent-muted`. Primer has renamed colour tokens **three
times** to reach this.

**T4 — Semantic naming for COLOUR, flat ordinal for SPACE.** Not a style preference — a
measured outcome. Atlassian shipped **five competing spacing schemes at once** in
v1.0.0 (52 experimental tokens including the semantically "correct" `gap`/`inset` split
its own DS engineer had advocated publicly since 2020) and **three days later** deleted
four of them in favour of flat `space.X`. Intent-based naming won for colour and lost
for spacing, in all five systems surveyed.

**T5 — Composite typography tokens, never atomic.** Atlassian removed `font.size.*`,
`font.lineHeight.*` and `font.letterSpacing.*` in v3.0.0: decomposed primitives let
consumers assemble size/line-height pairings the system never designed. Ship
`font.heading.large`.

**T6 — `on-*` pairing names AND a `<Surface>` component.** M3 encodes the pairing in the
name; Atlassian leaves it in prose and a partner publicly hit the failure — *"why do I
use `color.text.inverse` on top of `color.background.neutral.bold`?"* — which the
engineer conceded had *"come up before"* and which is still unfixed as of v16.3.0. Do
both: the name carries the intent, the component makes it structural.

**T7 — Ship an LLM-facing rules file with a hallucination guard.** The only concrete
shipped answer anyone found: Primer's `DESIGN_TOKENS_GUIDE.md` — *"Never use raw values.
Only use semantic tokens"* plus **"If you suggest a token name not found in this spec,
suffix it with `/* check-token */`"**. A self-flagging escape hatch for uncertainty that
is greppable in CI. Directly adoptable for `packages/ui`.

**T8 — The machine-readable path must be a FILE, never a docs site.** `m3.material.io`
and `spectrum.adobe.com` are JS-only SPAs returning empty shells to every fetch method —
Google's and Adobe's canonical token docs are **invisible to AI agents**. Generate
`tokens.json` beside Storybook's component manifest.

**T9 — Build the rename pipeline BEFORE the first token ships.** All five systems
surveyed renamed 2–3 times; Polaris changed its *tier vocabulary itself* between
consecutive majors, six months apart. Atlassian's model: a `replacement` attribute in
the shipped artifact driving ESLint codemods, lifecycle `active → deprecated → deleted
→ sunset → removed`, with their own caveat that the codemod only suggests and manual
review is still required.

**T10 — Provenance beats naming for disambiguation.** Figma, 2025: *"take a screenshot
of a red rectangle… there might be many different tokens with the same red value."*
Naming cannot resolve same-valued tokens; only knowing which token was actually used
can. Implication for us: the golden screens must carry token provenance, not just pixels.

## Negative finding, stated plainly
**There is no empirical evaluation of any of this.** Zero benchmarks measuring whether
an LLM picks the correct token; zero comparisons of semantic vs literal naming for
machine selection; no vendor publishes accuracy numbers. The "least likely to be
misused" ranking is **engineering judgment and must be labelled as such** in the design
guide. What it rests on instead is *historical* evidence — which names five mature teams
had to rename, and why — which is the next best thing and is what T1–T5 encode.

## The sentence that justifies the whole exercise
Polaris, on why they overhauled: *"there were **22 different gray values**, some nearly
identical, providing no value while introducing added complexity"* and *"tokens were
difficult to reference and modify, **which led many product teams to hard code their own
values**."* That is the failure `21-F3` (arbitrary values banned, grepped in CI) exists
to prevent, now with a named precedent.

And the payoff, Atlassian's 2024 visual refresh: *"If you've already adopted color
design tokens, there's no additional work needed — you'll get these for free!"* — while
typography in the same release DID need migration. **Purely semantic names repainted for
free; names encoding value facts did not.**

## New traps
- **Naive numeric rescale codemods.** Polaris v11→v12 is *not* uniform: `space-4`→`space-400`
  (×100) but `border-width-1`→`border-width-025` and `border-radius-6`→`border-radius-750`.
  A ×100 regex silently corrupts border widths.
- **"The colours match" migration.** Atlassian's explicit don't — *"Don't use a token just
  because the colors appear to match. This can break the experience in other themes."*
  Precisely the heuristic an AI reaches for first.
- **A token that cannot migrate 1:1 was doing two jobs.** The tell is the word "or" in a
  migration table: `color.iconBorder.danger` → `color.icon.danger` **or**
  `color.border.danger` (2022); `border.width.outline` → `border.width.selected` **or**
  `border.width.focused` (2025). Same mistake, three years apart.

## Open
- Adobe Spectrum rationale materially unverified (repo renamed, docs are an SPA).
- DTCG `$description` was **not** designed for AI — its spec lists four MAY-consumers and
  none is an LLM. It happens to fit; Atlassian's 579 shipped descriptions are already
  LLM-grade and carry pairing knowledge the names do not.
- `Shopify/polaris-react` was archived 2026-01-06 — note before citing it as living.
