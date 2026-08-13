# Token rules for agents (27-F44)

**This file is the hallucination guard.** It is the only shipped answer anyone has found to
"how does an agent pick the right token", and it is deliberately short enough to be read in
full before every edit.

## The three hard rules

1. **Never a raw value.** No hex, no px, no dp, no font stack in component code. If you are
   typing `#` or `px` inside `packages/ui/src` outside `tokens.json`, you are wrong.
2. **Only names that exist in `src/tokens/tokens.json`.** That file is canonical (27-F45).
3. **If you believe a token is missing, emit the name you want with a `/* check-token */`
   marker** and stop. The marker is greppable in CI. Do **not** invent a value, and do
   **not** reach for a nearly-right token — a wrong token is worse than a flagged gap, because
   it looks correct in review.

4. **`color` comes from `useColor()`, never from an import.** `27-F19` makes dark a per-site KDS
   opt-in and `27-F67` makes training render the OPPOSITE polarity — both are one runtime
   switch, and a component holding the static record simply does not follow it. The failure is
   not cosmetic: a production-coloured region inside a training shell is the "staff member
   treats a real order as practice" case `27-F63` exists to prevent. Held by
   `components/discipline.test.ts`; this page used to teach the bypass.

```ts
// correct — the palette in force, whichever polarity that is
const color = useColor();
background: color["bgColor-status-fault"]
// correct when the token genuinely does not exist yet
background: color["bgColor-status-pending"] /* check-token */
// WRONG — a hard-coded polarity: right on a light counter, wrong on a KDS and wrong in training
import { color } from "../tokens/index";
// WRONG — invents a value, will pass review, will break the colour budget
background: "#FFA500"
```

**A status FILL always carries its outline** (`27-F64`): if you write
`background: color["bgColor-status-fault"]` you also write
``border: `1px solid ${color["outlineColor-status-fault"]}` ``. The fill is relieved of SC
1.4.11's 3:1 *on the outline's account*, so a fill without one has no perceivable boundary and
the relief was granted for nothing. Also held by `discipline.test.ts`.

## Picking a colour

Ask **what the operator must conclude**, not what looks right:

| The operator must conclude | Token |
|---|---|
| "something needs attention" | `bgColor-status-abnormal` |
| "something is broken / this action destroys" | `bgColor-status-fault` |
| "that worked" — **transient only, never a resting state** | `bgColor-status-confirmed` |
| "I may press this" | `bgColor-interactive` |
| none of the above | **no colour.** Use shape, position or a number (27-F12) |

There are **three status colours and one accent, allocated platform-wide** (27-F14). A
fourth hue is an amendment to doc 27, never a local decision. If your state does not fit
the table, that is the system working — encode it structurally.

**Never colour money by default** (27-F16). Colour on a number means *this number is
abnormal*; colouring the commonest number on screen spends the entire preattentive channel
on the base case.

**Every foreground on a fill comes from that fill's `pairsWith`** (27-F43). Do not choose a
foreground yourself; the pairing is verified at 4.5:1 in `tokens.test.ts` and your guess is
not.

## Picking a size

**Sizes are posture-typed.** `targetFor("kitchen")`, never `96`. The posture is the design
decision; the number is an implementation detail that may change when the evidence does.

- `counter` 76 dp — standing at a fixed terminal
- `keypad` 126 dp — standing, high-consequence numeric entry
- `kitchen` 96 dp — standing, wet or greasy hands, read at 1–2 m
- `handheld` 64 dp — one-handed thumb
- `floor` 48 dp — absolute minimum, anything

**A dp is 1/160 inch of PHYSICAL size, never a CSS pixel** (27-F68). `targetFor("keypad")`
returns `126` and that is **20 mm**, which renders as 79 px on 27 §1a's 1366×768 counter and
111 px on its 1920×1080 one. You never do that conversion: `PanelRoot` applies it once, to
the whole tree, chrome included, and everything inside it is laid out in dp. Do not pin a
pixel value — 79 px is 20 mm at 100 PPI and 14.2 mm at 141 PPI, below 27-F8's floor. And do
not trim the millimetres to make a layout fit; 27-F8's numbers are a measured ergonomic
minimum and the ruling changed how they are *rendered*, never what they *are*.

**KDS type is never dp.** Use `capHeightMm(arcmin, distanceMm)`. *(Premise corrected August
2026, the same correction 27-F27 took. This rule used to argue that "the same dp renders 2.3×
larger on a 32″ 69-PPI panel than on a phone", which 27-F68 makes **false** — a dp is a
physical size and renders alike everywhere. The rule stands on stronger ground: legibility is
ANGULAR, so cap-height must scale with viewing DISTANCE, and no fixed physical size does that.
A 22″ pass screen read at 1.5 m and a phone read at 0.35 m need different millimetres.)*

## Space and type

`space-1..8`, flat ordinal (27-F41). There is no `gap` vs `inset` distinction and there
will not be one: Atlassian shipped five competing spacing schemes at once, including the
semantically "correct" split, and deleted four of them three days later.

Typography tokens are **composite** (27-F42) — take `text-body` whole. Never destructure a
size out of one and pair it with a line-height from another; that assembles a pairing the
system never designed.

## Renaming

Every token carries `replacement`. To rename: add the new token, set the old token's
`replacement` to the new name, keep both for one release. **Never repoint an existing name
at a new value** — Atlassian renamed `bold` → `subtle`, the old bold token *became* the
subtle token, the name stayed valid, the meaning inverted, and no codemod or diff review
can catch that.

## What is checked, and what is not

`tokens.test.ts` re-derives the arithmetic claims: the dichromacy ΔE00 ladder (27-F15), the
WCAG 2.2 AA pairings (27-F21), the posture table (27-F8), the naming laws (27-F38..F46).
Those are facts and they are verified on every commit.

**27-F47 is honest that the naming scheme itself has no empirical backing** — there are no
benchmarks and no vendor accuracy figures for whether any naming convention helps a model
pick correctly. 27-F38..F43 rest on *historical* evidence: which names mature teams were
forced to rename, and why. Treat them as judgement, not measurement.
