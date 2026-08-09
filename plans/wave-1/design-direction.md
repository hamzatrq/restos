# Design direction — the counter is an instrument, not an app

**Status: direction, not spec.** `specs/27` is the law and wins every conflict. This document says
how to *apply* it, because applying it badly is what produced the screens the founder rejected in
August 2026: a payment surface with two labels printed on top of each other, and a sign-in screen
that was three small boxes marooned in white. Both passed every gate this repo has.

## The failure this exists to correct

**`27-F16` reserves SIGNAL colour for the abnormal. That was read as "the interface is greyscale
and undesigned."** Those are different claims, and the gap between them is the entire visual
identity of the product. A near-monochrome instrument can have enormous presence — Braun, aviation
panels, professional kitchen equipment. Presence comes from neutral temperature and depth, material
quality, spatial rhythm and typographic hierarchy. **None of that spends a signal colour**, so none
of it costs `27-F16`, `27-F12`, or the alarm vocabulary. The test is unchanged: when a red band
appears it must be the loudest thing on the glass.

**And `layout:check` encodes "fits" as correct.** It asks whether a box overflows and whether a
control is reachable. Both rejected screens passed. A gate that measures fitting makes you good at
fitting and tells you nothing about design; "passes the gate" was allowed to mean "the screen is
fine", and those are different claims too.

## The subject, because distinctive choices come from it

A till in a Pakistani restaurant. The user is **standing**, often holding cash or a handset, under
hard fluorescent light, performing the same six actions several hundred times a day, at speed, while
a customer waits. Literacy varies — `03-F49` measures ~71% decode against ~35% correct execution,
so this is a low-literacy-tolerant problem, not a dashboard.

The closest analogues are not SaaS products. They are **instruments**: a cash drawer, a weighing
scale, a kitchen pass, a panel of switches. Tools used by feel, at speed, by someone who is not
thinking about the tool. That is the register.

The back office is a different room: an owner, on a phone or a laptop, occasionally, making
consequential decisions — pricing, publishing to every till at once, killing a stolen device. Calmer,
denser, more textual. Same vocabulary, different tempo.

## Thesis

**Instrument, not interface.** Heavy, confident, physical. Every control looks like it can be hit
with the side of a thumb. Nothing decorative survives. **The money is the loudest thing on the
screen** — and that is the signature element: the figure is the product, so it is set at display
scale, tabular, unmistakable, and everything around it is quiet and disciplined.

Spend boldness there and nowhere else.

## Four moves, in order of leverage

1. **Type scale is the biggest unused lever.** The token system is built on *angular* legibility
   (arcmin, viewing distance) — a serious foundation — and the screens use roughly one size of it.
   Establish real contrast: money at display scale with tabular figures and tight tracking; item
   names at comfortable body scale; labels small, uppercase, wide-tracked and **muted**. Labels are
   scaffolding, not content.
2. **Invert label and value.** Today `DUE`, `CHANGE`, `Channel`, `Cashier` carry the same visual
   weight as the thing they name. The value dominates; the label recedes. This alone fixes most of
   what reads as "unfinished".
3. **Give the surface a ground.** Not `#FFFFFF` everywhere. A ground plane with raised working
   surfaces makes cards read as physical objects and creates the depth the screens lack — all
   within an achromatic palette. Light theme is right for fluorescent glare; light is not white.
4. **Show what the system already knows.** The rejected sign-in screen had **role**, **day state**,
   **running shift** and **branch identity** available and displayed none of them. Hina can open the
   day and Ayesha cannot; that is consequential and it was invisible until it surfaced as a refusal.
   An arriving cashier should read *"day open since 09:00 · Bilal on shift"* at a glance. **Use only
   data the product genuinely has** — a placeholder that looks like data is worse than an absence
   (commandment 2), and anything missing is named as owed.

## Laws that do not move, whatever the design says

`27-F8`'s physical touch floor — 20 mm of glass. **Never shrink a target to make a layout fit**;
that is the exact trade `DEC-UI-001` exists to forbid, and the answer is a different layout.
`27-F4`'s chrome is positional memory: never add, remove or reorder a tab. `27-F2` on scrolling and
`27-F5` on the primary action stand. `27-F12`: direction and state are carried by a word or a glyph,
never by colour alone. Commandment 6: `packages/ui` semantic components only — if adaptation needs a
new primitive, it is added there with a story and a `.dom.test.tsx`. Commandment 7: English-only UI,
user content Unicode and faithful.

**One open question worth checking rather than assuming:** the primary action currently ships as a
large saturated blue fill. `27-F16` reserves colour for the abnormal, and a permanent blue on the
resting happy path may already violate it. Read the FR and decide deliberately — if colour is the
wrong tool for "primary", weight, size and position are the right ones.

## How to judge the result

Not "does it fit". **Would a cashier standing at this counter, holding a customer's cash, find the
number they need without looking for it.** Screenshot every surface at every swept size and look at
it. The founder can open the app; two screens signed off on measurements alone were rejected on
sight in about four seconds.
