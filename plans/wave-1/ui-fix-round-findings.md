# packages/ui oracle fix round — what closed, and the one thing that cannot

**July 2026.** Implementing against the oracle acceptance tests filed in
`plans/wave-1/oracle-round-findings.md`. Those tests were written by independent sessions per
`24 §3` step 2 and are read-only to this one.

**Result: 42 failing → 20 failing.** Every one of the 22 closures is a real implementation
change. **All 20 remaining failures are conflicts inside the oracle set itself** — four
distinct causes, none of which can be closed by writing code, and one of which is
*provably* unsatisfiable. They are set out in §2 with measurements.

Suites: `pnpm verify` exit **0**. `pnpm test` — domain 162, sync-client 411, gateway 202,
sync-protocol 62, testing 49, pos-electron 18, **ui 170 passed / 20 failed**.

---

## 1. What closed

### 1.1 SC 1.4.11 — the light border was invisible (8 tests)

`borderColor-default` was `#C7CCD1`: **1.52:1** against the page and **1.62:1** against a
raised fill. On the light base that border is the *only* thing separating a tile, a key, a
card, a cart and a page button from the surface behind them — the neutral fills either side
differ by 1.06:1 — so seven controls had no perceivable edge at all. Now `#83878A`:
**3.41 / 3.62 / 3.14** against surface / raised / sunken.

`borderColor-strong` moved with it (`#8A939D` → `#5B5E60`). It had to: `strong` must stay
stronger than `default`, and the old value was now the *lighter* of the pair — the two names
would have inverted, which is the failure `27-F40` exists to prevent.

The dark palette already cleared the floor (3.44 / 3.00 / 3.87) and is unchanged.

### 1.2 The one AA failure in the declared pairings

Dark `fgColor-on-interactive` on dark `bgColor-interactive` measured **4.40:1** — under AA,
on the pairing the manifest declares for *every pressable control* on the KDS opt-in.

Fixed by moving the blue (`#0770FF` → `#0A60DC`) rather than the ink, because pure white was
already the lightest available foreground: nothing lighter existed to raise it with. The
outline stays at `#0770FF`, which is load-bearing — it clears 3:1 against all three dark
surfaces at 3.02 / 3.46 / 3.88, and darkening it with the fill would have dropped it to 2.95.
The ΔE00 ladder survived the move; `palette-ladder.oracle.test.ts` is **25/25**.

### 1.3 Two tokens had no dark value at all (1 test)

`fgColor-on-interactive` and `fgColor-on-status-confirmed` were inheriting their light values.
Both now take the dark theme's own colours — `fgColor-default` dark and `bgColor-surface-sunken`
dark respectively — rather than a second near-black or near-white invented for the purpose. A
chip should read as a hole punched in the surface, not as a foreign swatch.

### 1.4 `27-F11c` — capacity was computed in pixels (5 tests)

`pageCapacity` took `widthPx`/`heightPx` and no PPI, so a 15.6″ panel yielded **91 tiles at
1366×768 and 180 at 1920×1080** — one physical surface, both resolutions listed in `27 §1a`'s
hardware table. The FR is explicit: *"Extra pixels buy sharpness; only inches buy room."*

It now takes `widthMm`/`heightMm`/`tileMm`, so resolution-blindness holds **by construction**
rather than by test — there is no resolution in scope to be sensitive to. `targetMm()` and
`mmFromDp()` expose the `mm` column `tokens.json` has always carried and the typed view was
discarding. `ItemGrid` takes the physical surface plus a `ppi` that is used only to render.

`layout.test.ts` was rewritten with it. That suite asserted capacity *"grows monotonically
with usable area"* while measuring area in **pixels** — the inverse of the FR — and used a
1280×800 reference the hardware table does not list.

### 1.5 `27-F8` — `floor` was a design posture (2 tests)

`Posture` had `floor` as a peer of counter/keypad/kitchen/handheld, so `<ItemGrid
posture="floor">` typechecked and rendered a **48 dp** counter grid where `27-F8` requires 76
— and `pageCapacity` then validated the violation, because it checks a tile against whatever
posture it was handed. `Posture` is now the four design postures; the floor stays reachable
through `targetFor("floor")` for the controls that legitimately sit there (ItemGrid's page
buttons, Cart's remove control).

`Tile.stories.tsx` was rendering `floor` in its posture ladder as though it were a peer.

### 1.6 `27-F43` — `<Surface>` shipped (2 tests + the file-count canary)

Only the naming half of `27-F43` had shipped. The failure it prevents is concrete:
`fgColor-status-fault` on `bgColor-status-fault` is **1.00:1**, and nothing stopped a component
composing it, because every component picks its foreground out of a flat global `color` record
by hand.

`Surface` binds the foreground to the fill as a discriminated union, so a mismatched pair is a
compile error. **The first draft of this file did not work** and the oracle caught it inside
one run: `resolveJsonModule` widens every string in `tokens.json` to `string`, so a type
derived from `pairsWith` accepts *every* combination. The pairing is now restated as literals,
and the drift that creates is closed by a test in `tokens.test.ts` rather than left to review.

### 1.7 `00 §6` — `MoneyValue` took a plain `number` (3 tests)

`MoneyValueProps.paisa` was `number`, laundered into `domain` through
`value as Parameters<typeof rupeesFromPaisa>[0]`. The documented contract was enforced only by
a runtime `RangeError` — thrown **during render**, which in React 19 unmounts the root and
blanks the till. `01-F17` says a sale is never blocked, and a blank region on a counter screen
is indistinguishable from a hung app.

`paisa` is now the branded `Paisa`. The brand immediately found live call sites: `Cart`'s
`totalPaisa` was also an unbranded `number`, and nine story literals were raw. Refusing the
value at the type boundary is the fix; an `ErrorBoundary` would only decorate the failure.

### 1.8 `27-F40` — `outlineColor-` had no role prefix (1 test)

`tokens.test.ts` predated `27-F64` and its regex rejected the new prefix. Widened, with the
reason recorded: a decorative rule and a *required* SC 1.4.11 boundary are different
properties, and conflating them with `borderColor-` would let the boundary be restyled away as
decoration.

### 1.9 `27-F8` gaps — TabRail (fixed; the test still cannot see it — see §2.3)

`TabRail` put **4 px** between adjacent 76 dp touch targets where `27-F8` requires ≥8. Fixed to
`space-2`. It is the one container in the package whose children are all full-size targets side
by side, and nothing in the package had ever checked a gap.

---

## 2. The 20 that remain, and why none is an implementation gap

### 2.1 The neutral surface ladder is PROVABLY unsatisfiable (16 tests)

**This is the finding that needs a ruling, and it is not a close call.**

`nontext-contrast.oracle.test.ts` requires all three pairs among the neutral surfaces to clear
SC 1.4.11's 3:1:

| pair | required by | rows |
|---|---|---|
| `surface-raised` vs `surface` | BOUNDARIES | tile fill vs the page |
| `surface-raised` vs `surface-sunken` | STATES + neutral | active tab, page button, blocked key, resting badge, ok chip |
| `surface-sunken` vs `surface` | STATES + `27-F63` | the training tint |

The **same file** also requires — and this test passes today, so it is a constraint, not a
wish — that *every* `fgColor-` token clears AA 4.5:1 on *every* surface.

**Those two requirements cannot both hold.** Exhaustive search over relative luminance
(f = Y + 0.05 on [0.05, 1.05], 1200 steps) finds **14,196,198** surface triples that clear the
mutual 3:1 ladder and **zero** that admit any text colour clearing 4.5:1 on all three.
Algebraically, with f(a) ≥ 3f(b) ≥ 9f(c):

- vs `a`: 4.5·f(a) ≥ 2.025 > 1.05, so f(t) ≤ f(a)/4.5 ≤ **0.2333**
- vs `c`: f(c)/4.5 ≤ 0.0259 < 0.05, so f(t) ≥ 4.5·f(c) ≥ **0.225**
- vs `b`, where f(b) ∈ [0.15, 0.35]: either f(t) ≥ 4.5·f(b) ≥ 0.675 (contradicts 0.2333), or
  f(t) ≤ f(b)/4.5 ≤ 0.0778 (contradicts 0.225).

Both branches contradict. There is no palette. This is a property of WCAG's contrast formula,
not of any choice made here.

**And the two-surface case fails too, for this foreground set.** `27-F65` is already ratified
and requires the training tint (`surface-sunken` vs `surface`) to carry a real luminance step
*"while every foreground token still clears 27-F21 against it"*. At 3:1 from a `#F7F8F9` page,
the sunken surface needs Y ≤ 0.2792, which forces **every** foreground to Y ≤ 0.0231:

| token | shipped | Y | verdict |
|---|---|---|---|
| `fgColor-default` | `#1A1D21` | 0.0121 | ok |
| `fgColor-muted` | `#5A6470` | 0.1246 | must become near-black |
| `fgColor-disabled` | `#5A6470` | 0.1246 | must become near-black |
| `fgColor-status-fault` | `#8E1F1F` | 0.0683 | must become near-black |
| `fgColor-status-abnormal` | `#96620A` | 0.1524 | must become near-black |

Collapsing muted, disabled, fault and abnormal to Y ≤ 0.0231 puts all four within 1.5:1 of
`fgColor-default` — mutually indistinguishable — and destroys `27-F16`'s *"colour on a number
means this number is abnormal"*.

**The oracle knows this is a spec gap and says so.** `outline-boundary.oracle.test.ts`'s own
comment: *"27-F64 says 'every STATUS surface carries an outline'. The three NEUTRAL surface
tokens … are not status surfaces, so the FR as written does not reach them … This test states
the gap rather than asserting a rule doc 27 has not made."* Under Commandment 2 that is a STOP:
the rule does not exist, and filling it with plausible behaviour is exactly what is forbidden.

**Three candidate resolutions, for doc 27 to choose between.** Each is a real design decision
with a real cost, which is why none of them is mine to take:

1. **Extend `27-F64`'s outline to neutral surfaces.** Elevation and selection get a *boundary*
   rather than a luminance step, exactly as status fills did. Cheapest, most consistent with
   the FR that already exists, and it dissolves 15 of the 16 failures. It does **not** reach
   the training tint — `27-F65` already ruled that a full-field tint has no adjacent element
   for an outline to bound.
2. **Collapse the three-step elevation model to two.** Feasible in the abstract, but §2.1's
   second table shows it is not feasible with five foreground roles.
3. **Per-surface foreground tokens** (`fgColor-default-on-sunken`, …). Satisfies everything
   and costs the flat `fgColor-` naming law plus a combinatorial token set — `27-F41`'s
   Atlassian precedent is the argument against.

The training tint needs its own answer under `27-F65` regardless of which is chosen, because
it is the one signal that survives none of them.

### 2.2 The totality gate can only be closed by editing the oracle (1 test)

`"covers every status fill against every surface a component can place it on"` asserts that the
**test file's own `STATUS_FILLS` table** enumerates all 4 status colours × 2 surfaces. Four
combinations are missing from that table (`status-fault`/sunken, `status-confirmed`/raised,
`status-confirmed`/sunken, `interactive`/sunken). No palette or component change can satisfy
it — the assertion is about the test's tables, which are in the test file. It needs its owning
session to extend them.

### 2.3 The `27-F8` gap row reads a constant, not the component (1 test)

`TARGET_ROWS` encodes `{ where: "TabRail.tsx:48", gap: px("space-1") }` — it mirrors what
TabRail *used to* use rather than reading TabRail. **TabRail is fixed** (§1.9), and the test
still fails, because the only way to make `px("space-1") >= 8` is to redefine `space-1` from 4
to 8 — which would break `27-F41`'s flat ordinal scale to satisfy an assertion about a
different file. The row needs to read the component.

### 2.4 A citations pin is stale w.r.t. the `27-F64` repaint (1 test)

`"the three figures that DO reproduce stay reproduced"` pins
`contrastRatio(bgColor-status-abnormal, bgColor-surface)` at **1.53:1**. It now measures
**3.16:1** — because the `27-F64` repaint (`f7c3d34`, `404ced2`, `4f653b5`) deliberately raised
amber's separation, which is what that FR asked for. The pin fired correctly; it caught a real
palette move. It now needs re-deriving against the palette that move produced. The other two
figures in the same test still reproduce exactly (5.22, 4.15).

---

## 3. For the next session

Nothing in §2 is blocked on more implementation. §2.2, §2.3 and §2.4 are three small edits by
the sessions that own those files. **§2.1 is a doc-27 amendment and a founder call**, and it
should be taken before any further palette work — every one of the 16 tests is measuring the
same missing rule, and a palette edited before the rule exists will be edited again after it.
