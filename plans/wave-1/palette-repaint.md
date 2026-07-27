# Palette repaint — the measurement, and what it forces

**July 2026.** Founder ruling: repaint to a dark ISA-101 base (`27 §3`) rather than patch the
light theme. This file records the derivation so the numbers are auditable and the spec
amendment can be written against measurements rather than taste.

Every figure below comes from `packages/ui/src/tokens/color-science.ts` — the implementation
the UI oracle independently re-derived from the published formulas and validated against the
Sharma/Wu/Dalal (2005) 34-pair reference set at 5e-5 before using it to judge anything.

---

## 1. The finding, stated plainly

**`27-F15`'s ΔE00 ≥ 31.4 and WCAG 2.2 SC 1.4.11's 3:1 non-text contrast cannot both hold for
the `27-F14` four-colour status set — on EITHER theme.** The number was derived without the
separation gate in the picture, on a different lightness ladder (L\* 100 → 77.5 → 39.7), and
no palette that clears 3:1 on its surfaces reaches it across all six pairs.

That is not an argument for dropping either gate. It is an argument for amending `27-F15` to a
figure that was measured under both constraints, and saying so in the FR.

## 2. Why dark is still the right call

The light theme was not merely short of the target — it had **no joint solutions at all**
(oracle measurement: `sep>=3 AND red>=31.4 AND blue>=31.4` yielded zero in-band candidates).
The structural reason: on a light field, 3:1 against `#EDEFF1` forces every fill below 0.254
relative luminance, while ΔE00 against a dark red wants light. The two gates pull opposite ways.

On a dark field that inverts — fills sit **above** the surface in luminance, which is the same
direction that buys ΔE00 headroom. Candidate counts clearing 3:1 on all three dark surfaces
(`#22262B` / `#2B3037` / `#191C20`), at chroma ≥ 0.25 and within their hue bands:

```
fault 1779   abnormal 3012   confirmed 3756   interactive 1999
```

**The product problem the repaint was called for is solved.** Amber — a *resting* state
(`27-F14`: ticket approaching due, low stock, pending approval) on a 22″ pass panel that
`27-F18` says desaturates at 500 lux — goes from **1.42:1 to 8.10:1** fill separation. That is
the difference between a state you can see across a kitchen and one you cannot.

## 3. Per-pair ceilings on the dark base, under the 3:1 gate

Each figure is the best achievable for that pair **in isolation**, worst-case across normal
vision and all three dichromacies:

| pair | ceiling | vs 31.4 |
|---|---|---|
| fault ↔ abnormal | **29.18** | under |
| fault ↔ confirmed | 32.65 | clears |
| fault ↔ interactive | 53.09 | clears |
| abnormal ↔ confirmed | 33.26 | clears |
| abnormal ↔ interactive | 60.32 | clears |
| confirmed ↔ interactive | 32.72 | clears |

**fault ↔ abnormal is the binding pair**, and that is not a surprise once stated: red and amber
are hue-adjacent, and both must remain recognisable as *themselves* — an amber pushed far
enough from red stops reading as amber, which defeats `27-F14`'s allocation.

Note this is a different binding pair from the light theme, where it was amber ↔ green (ceiling
28.5). Neither matches the pair the original test asserted 31.4 against.

## 4. The trap: per-pair ceilings are not jointly achievable

Each ceiling above is reached by a *different* pair of colours. One four-colour set must satisfy
all six pairs simultaneously, and no set exists that holds five pairs at 31.4 while keeping
fault ↔ abnormal at even 29.

**Measured joint ceiling — the best achievable worst-pair ΔE00 across all six — is ≈ 23.**

This is the number `27-F15` should carry for a four-colour set under a 3:1 separation gate.
Anything higher is a requirement no palette can meet, which makes it a requirement that will be
quietly ignored rather than met.

## 5. What this forces, and what it does not

**Forces a spec amendment.** `27-F15` must state 31.4 as what a *pair* can reach when
separation is not gated, and carry a separate, lower joint figure for the allocated set with
the gate on. The FR should record the measurement and the constraint it was measured under —
the original number's failure was not that it was wrong, but that it was quoted without the
conditions that produced it.

**Does not force dropping SC 1.4.11.** The separation gate is what makes amber visible in the
room it ships into, and `27-F18`'s own desaturation argument says chroma is the channel that
fails first. Trading measurable luminance separation for a ΔE00 figure that no palette achieves
would be trading the real property for the aspirational one.

**Does not weaken `27-F12`.** Colour still never carries state alone — every status is colour +
shape + position + a number. A lower ΔE00 floor is survivable precisely because colour is not
load-bearing on its own; that redundancy is what makes the amendment safe rather than a
concession.

## 6. Still to do

1. Amend `27-F15` with §4's joint figure and the conditions, and `27 §3`'s theme statement.
2. Choose the final four hexes at the joint optimum, plus the neutral ramp (surfaces,
   foregrounds, borders) re-derived for a dark base — all AA against the new surfaces.
3. Repaint the 13 components and re-shoot the composed counter and 22″ pass-panel stories.
4. Re-run `tokens.test.ts`, which re-derives doc 27's arithmetic; it is the check that tells us
   whether the design still holds.

**Structural laws are untouched by any of this.** Only hex values change: the posture table,
the naming laws (`27-F38..F46`), the `on-*` pairing rule and every discipline guard hold as
written. That is why the repaint is cheap now and expensive later — no app is built on these
values yet.
