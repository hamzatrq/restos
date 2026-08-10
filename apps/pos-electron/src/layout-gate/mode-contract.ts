import type { SurfaceReport } from "./probe";

/**
 * # `27-F4` AND `27-F8` **ACROSS SURFACE MODES** — the half happy-dom cannot express
 *
 * Authored from spec text only (`24 §3` step 2), by a session that is not implementing responsive
 * modes. Its sibling is `src/renderer/surface-mode-contract.dom.test.tsx`, which owns the same
 * contract's *structural* half. **Neither substitutes for the other**, and the reason is the
 * split this repo already pays for everywhere else:
 *
 * | claim | where | why |
 * |---|---|---|
 * | the SET of controls is identical across modes | happy-dom | set membership is structural |
 * | the **DOM/reading** order is identical | happy-dom | DOM order is structural |
 * | the **VISUAL** order is identical | **here** | needs a real Blink layout |
 * | `27-F8`'s millimetres hold in every mode | **here** | needs a real Blink layout |
 *
 * **`27-F4` IS ABOUT VISUAL ORDER, NOT DOM ORDER, AND THAT IS WHY THIS FILE EXISTS.** The FR
 * protects an operator's hand — *"23 of 34 field subjects could not perform a task they knew well
 * on a differently-arranged device"* — so what it forbids is the tile moving **on the glass**. A
 * `flex-direction: column; flex-wrap: wrap` container of the kind `CashSurfaces.tsx` already
 * ships permutes the visual sequence while leaving the DOM order byte-identical. happy-dom
 * returns zeroes for every rect, so it is blind to that by construction; the gate is not.
 *
 * ## THE PANEL SWEEP IS ALREADY A MODE SWEEP, and nothing here had to be added to make it one
 *
 * `main.ts` sweeps seven panels spanning **221 → 782 mm** of glass. A mode is derived from
 * measured millimetres (`27-F11c`), so those seven panels straddle every boundary the product
 * has. This file therefore never asks *which* mode a panel is in — it asserts the contract
 * **between every pair of panels**, which is strictly stronger and, more importantly, stays
 * correct when the implementer moves a boundary. An oracle that named a mode would be pinning a
 * number the corpus does not own (`27 §1a` lists hardware; it names no millimetre threshold).
 *
 * ## WHAT IS PINNED HERE THAT THE FRs DO NOT DECIDE — declare it, do not discover it
 *
 * 1. **A REFLOW IS LEGAL; A REORDER IS NOT — and the two are separated by whether a pair of
 *    controls keeps its RELATIONSHIP CATEGORY.** `27-F4` forbids "reordering an item on an
 *    operational grid" and `surface-mode.tsx`'s own governing rule says a mode *"may change where
 *    a thing is and how big it is … never what is there, or in what order"*. Those two sentences
 *    are in tension the moment one column becomes two, and no FR resolves it. The reading taken
 *    here is the narrowest one that still bites:
 *
 *    - two controls that share a visual ROW on **both** panels must be in the same left-to-right
 *      order on both;
 *    - two controls that are vertically DISJOINT on **both** panels must be in the same
 *      top-to-bottom order on both;
 *    - a pair whose *category* changes — row-mates on one panel, stacked on the other — is the
 *      **reflow** the rule permits, and is skipped.
 *
 *    That refuses every swap inside a keypad, a tile row, a method row or a list, and permits a
 *    column moving beside a pad. The skipped pairs are COUNTED and reported, because a reading
 *    that quietly skipped everything would be the vacuous green this whole rail exists to refuse.
 *
 * 2. **A `keypad`-posture target is identified by a single-digit accessible name.** Posture is
 *    not in the DOM and cannot be, so it has to be inferred. Every one of the product's three
 *    pads — `App.tsx`'s unlock pad, `ManagerApproval.tsx`'s approval pad and `packages/ui`'s
 *    `NumericKeypad` — composes its digits at `27-F8`'s 126 dp and gives each an `aria-label` of
 *    exactly that digit. `ItemGrid`/`OrderList` page numbers are bare text with **no**
 *    `aria-label`, so they are excluded by construction rather than by a rule someone must
 *    maintain. This is also what makes the check independent of the `1` key `main.ts` already
 *    measures: it sweeps **every** digit of **every** pad on **every** surface and panel.
 *
 * 3. **Millimetres are derived from the PANEL's declared geometry, never from the density the
 *    renderer was handed.** `mm per viewport px = diagonalIn × 25.4 / hypot(pxW, pxH)`. That is
 *    deliberately a different route from `main.ts`'s keypad check, which reads the PPI back out
 *    of the seam — and the two must agree. Reading the seam answers *"does the app agree with
 *    itself"*; this answers *"how much of the declared glass does the operator's thumb actually
 *    get"*, which is the question `27-F68` (b) asks when it forbids reducing the millimetres to
 *    make a layout fit. Cross-checked on the shipped tree: both routes report 20.00 mm for a
 *    126 dp key on both counter panels.
 *
 * 4. **Only surfaces with NO pager get an exact SET comparison.** `27-F2` is explicit that *"page
 *    capacity is derived from the surface's usable area … never fixed by this document"*, so a
 *    smaller panel legitimately shows fewer tiles per page; demanding an identical tile count on
 *    221 mm and 782 mm of glass would be demanding a spec violation and would stay RED against a
 *    correct implementation. `ItemGrid` and `OrderList` both gate their pagers on `pages > 1`, so
 *    a pager's presence is exactly the signal that paging is in play. The ORDER check still runs
 *    on paged surfaces, over the controls the two panels have in common.
 */

/** Mirrors `main.ts`'s own two device states without importing them (this file is a leaf). */
export type ModeState = "alarm" | "quiet";

export type ModePanel = {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly diagonalIn: number;
};

export type ModeFailure = {
  readonly surface: string;
  readonly state: ModeState;
  readonly detail: string;
};

type Control = SurfaceReport["controls"][number];

type Recorded = {
  readonly panel: ModePanel;
  readonly controls: readonly Control[];
  readonly tabs: readonly string[];
};

/** `surface (bare, no panel prefix)` → `state` → `panel label` → what was measured there. */
const recorded = new Map<string, Map<ModeState, Map<string, Recorded>>>();
const panelsSeen: ModePanel[] = [];
let current: ModePanel | null = null;

/** Called once per panel, before its surfaces are swept. */
export const beginModePanel = (panel: ModePanel): void => {
  current = panel;
  if (!panelsSeen.some((p) => p.label === panel.label)) panelsSeen.push(panel);
};

/**
 * Called for every surface the gate judges. Takes the gate's own prefixed surface key and strips
 * the panel label back off, so surfaces line up across panels without this file needing to know
 * how `main.ts` builds the string.
 */
export const recordModeSurface = (surface: string, state: ModeState, r: SurfaceReport): void => {
  if (current === null) return;
  const prefix = `${current.label} `;
  const bare = surface.startsWith(prefix) ? surface.slice(prefix.length) : surface;
  const byState = recorded.get(bare) ?? new Map<ModeState, Map<string, Recorded>>();
  const byPanel = byState.get(state) ?? new Map<string, Recorded>();
  byPanel.set(current.label, {
    panel: current,
    controls: r.controls,
    tabs: r.tabs.map((t) => t.label),
  });
  byState.set(state, byPanel);
  recorded.set(bare, byState);
};

// ── `27-F8`, in millimetres of the DECLARED glass (pinned reading 3) ─────────────────────────

/** `27-F8`: *"absolute floor, anything — **48 dp (7.6 mm)**, gaps ≥8 dp."* */
const FLOOR_MM = 7.62;
/** `27-F8`: *"cash / numeric keypad — standing, high-consequence entry — **126 dp (20 mm)**."* */
const KEYPAD_MM = 20.0;
/**
 * ±0.6 mm, the tolerance `main.ts` already uses on the same FR and for the same measured reason:
 * a fractional `zoom` rounds a 126 dp box to 79 px where 79.1 is exact. Wide enough for that,
 * far narrower than the 6.4 mm error a pinned pixel constant makes. A guard with generous slack
 * is not a guard.
 */
const MM_TOLERANCE = 0.6;

const mmPerPx = (panel: ModePanel): number =>
  (panel.diagonalIn * 25.4) / Math.hypot(panel.width, panel.height);

/** `button[7] "7"` — a digit pad key. Page numbers are `button "7"` with no bracket, so they miss. */
const KEYPAD_DIGIT = /^button\[[0-9]\]/;
/** `button "3"` — `ItemGrid`/`OrderList` render page numbers as bare text with no `aria-label`. */
const PAGE_NUMBER = /^button "\d+"$/;

// ── Reading order, as a PAIRWISE relation (pinned reading 1) ─────────────────────────────────

/**
 * How two controls sit relative to each other, on BOTH axes.
 *
 * `ROW` — vertical spans overlap and horizontal spans do not: side by side, and the operator's
 * hand knows which is on the left. `COLUMN` — the transpose: stacked, and the hand knows which is
 * on top. Anything else is `null`: either they overlap on both axes (nested, or one covers the
 * other) or on neither (diagonal), and in both cases "the order" is not a thing the geometry
 * decides.
 *
 * ⚠ **THE FIRST DRAFT OF THIS FUNCTION LOOKED AT THE VERTICAL AXIS ALONE, AND IT WAS WRONG IN THE
 * DANGEROUS DIRECTION — it produced 60+ verdicts against the SHIPPED tree.** They were all on the
 * Cash tab, and they were all the same legal reflow: `CashSurfaces.tsx` lays its groups out in a
 * `flex-direction: column; flex-wrap: wrap` container at the work area's height, so *"the column
 * count is derived from the glass and never written down"*. When the drawer group and the
 * paid-out group land in one column on a 15.6″ panel and in two columns on a 32″ one, a pair of
 * controls goes from `C is above Supplier` to `C is below Supplier` — **vertically disjoint both
 * times**, so a vertical-only reading calls it a reorder. It is the WRAP that `surface-mode.tsx`'s
 * governing rule permits in the same breath as it forbids reordering.
 *
 * Reading both axes separates them cleanly, because a column wrap always changes the HORIZONTAL
 * category too: the pair goes from sharing a column to occupying different ones. So the rule is
 * that a pair is judged only when its category is `ROW` on both panels or `COLUMN` on both — and
 * a category change is the reflow, counted and never judged.
 *
 * The 1 px tolerance is `probe.ts`'s own, for its own reason: sub-pixel rounding on a border is
 * not a layout decision.
 */
type Rel = "ROW" | "COLUMN";

const relate = (a: Control, b: Control): Rel | null => {
  const T = 1;
  const vOverlap = a.rect.y + a.rect.h > b.rect.y + T && b.rect.y + b.rect.h > a.rect.y + T;
  const hOverlap = a.rect.x + a.rect.w > b.rect.x + T && b.rect.x + b.rect.w > a.rect.x + T;
  if (vOverlap && !hOverlap) return "ROW";
  if (hOverlap && !vOverlap) return "COLUMN";
  return null;
};

const leftOf = (a: Control, b: Control): boolean =>
  a.rect.x + a.rect.w / 2 < b.rect.x + b.rect.w / 2;

const aboveOf = (a: Control, b: Control): boolean =>
  a.rect.y + a.rect.h / 2 < b.rect.y + b.rect.h / 2;

// ── The verdicts ─────────────────────────────────────────────────────────────────────────────

let pairsCompared = 0;
let pairsReflowed = 0;
let setsCompared = 0;
let setsPaged = 0;
let targetsMeasured = 0;
let keypadTargetsMeasured = 0;

export const modeContractSummary = (): string =>
  `mode contract: ${panelsSeen.length} panels, ${recorded.size} surfaces, ` +
  `${setsCompared} control sets compared (${setsPaged} paged, order only), ` +
  `${pairsCompared} 27-F4 position pairs (${pairsReflowed} reflowed, not judged), ` +
  `${targetsMeasured} 27-F8 targets measured (${keypadTargetsMeasured} keypad)`;

export const judgeModeContract = (): ModeFailure[] => {
  const out: ModeFailure[] = [];

  // ── `27-F8` — the floor holds on every control, on every panel, hence in every mode. ──
  //
  // `27-F68` (b): *"27-F8's 126 dp is a measured ergonomic floor; this FR changes how it is
  // RENDERED, never what it IS. Reducing the millimetres to make a layout fit is forbidden."*
  // A mode that fits small glass by shrinking a target is the single most likely way a
  // responsive layout goes wrong here, and it is invisible to every other check in this rail:
  // a smaller key FITS BETTER, so overflow, clipping and composition all go quieter, not louder.
  for (const [surface, byState] of recorded) {
    for (const [state, byPanel] of byState) {
      for (const [label, rec] of byPanel) {
        const scale = mmPerPx(rec.panel);
        for (const c of rec.controls) {
          const wMm = c.rect.w * scale;
          const hMm = c.rect.h * scale;
          const smallest = Math.min(wMm, hMm);
          targetsMeasured += 1;
          const keypad = KEYPAD_DIGIT.test(c.label);
          if (keypad) keypadTargetsMeasured += 1;
          const required = keypad ? KEYPAD_MM : FLOOR_MM;
          if (smallest >= required - MM_TOLERANCE) continue;
          out.push({
            surface: `${label} ${surface}`,
            state,
            detail:
              `27-F8 BROKEN ON THE GLASS: '${c.label}' renders ${wMm.toFixed(2)} x ` +
              `${hMm.toFixed(2)} mm on ${rec.panel.diagonalIn}" glass, under 27-F8's ` +
              `${keypad ? `${KEYPAD_MM} mm keypad minimum` : `${FLOOR_MM} mm absolute floor`}. ` +
              "27-F68 makes a dp 1/160 inch of PHYSICAL size and (b) forbids reducing the " +
              "millimetres to make a layout fit — the minimum IS the millimetre. Note what no " +
              "other check here can tell you: a shrunken target FITS BETTER, so overflow, " +
              "clipping and composition all get QUIETER when this defect is introduced. " +
              "Measured from the panel's declared geometry (" +
              `${rec.panel.width}x${rec.panel.height} px at ${rec.panel.diagonalIn}"), not from ` +
              "the density the renderer was handed, so it is the operator's thumb and not the " +
              "app agreeing with itself.",
          });
        }
      }
    }
  }

  // ── `27-F4` — the TAB RAIL is the same rail on every panel. ──
  //
  // The chrome `27-F1` guarantees never leaves the screen, and `Counter.tsx`'s own header: *"a
  // tab added after the pilot costs every operator who learned the layout without it"*. Read
  // from the DOM by `probe.ts`, so a tab another session adds is compared here automatically.
  const rails = new Map<string, readonly string[]>();
  for (const byState of recorded.values()) {
    for (const byPanel of byState.values()) {
      for (const [label, rec] of byPanel) {
        if (rec.tabs.length === 0) continue;
        const known = rails.get(label);
        if (known === undefined) rails.set(label, rec.tabs);
      }
    }
  }
  const railEntries = [...rails.entries()];
  const reference = railEntries[0];
  if (reference === undefined || reference[1].length === 0) {
    out.push({
      surface: "mode-contract",
      state: "quiet",
      detail:
        "EMPTY MATCH — no panel reported a tab rail, so 27-F4's chrome contract was not compared " +
        "on any glass at all (24-F14).",
    });
  } else {
    for (const [label, tabs] of railEntries.slice(1)) {
      if (tabs.length === reference[1].length && tabs.every((t, i) => t === reference[1][i])) {
        continue;
      }
      out.push({
        surface: `${label} tab-rail`,
        state: "quiet",
        detail:
          `27-F4 BROKEN: the tab rail differs by MODE. ${reference[0]} shows ` +
          `${JSON.stringify(reference[1])} and ${label} shows ${JSON.stringify(tabs)}. Those are ` +
          "the same product on two pieces of glass. Adding, removing or reordering an " +
          "operational item is a breaking change requiring PR justification and a dev-pilot " +
          "acclimation window, and for the vendor's shipped structure 27-F4 binds ABSOLUTELY. " +
          "A rail that sheds a tab on small glass also needs an affordance to reach it, which " +
          "27-F5 forbids outright: every action has a persistent, visible, labelled target.",
      });
    }
  }

  // ── `27-F4` — the SET, and the ORDER, between every pair of panels. ──
  for (const [surface, byState] of recorded) {
    for (const [state, byPanel] of byState) {
      const panels = [...byPanel.entries()];
      if (panels.length < 2) continue;
      const first = panels[0];
      if (first === undefined) continue;

      const paged = panels.some(([, rec]) => rec.controls.some((c) => PAGE_NUMBER.test(c.label)));

      for (const [label, rec] of panels.slice(1)) {
        const a = first[1].controls;
        const b = rec.controls;

        // ---- the SET (pinned reading 4) ----
        if (paged) {
          setsPaged += 1;
        } else {
          setsCompared += 1;
          const aNames = a.map((c) => c.label).sort();
          const bNames = b.map((c) => c.label).sort();
          if (aNames.length !== bNames.length || aNames.some((n, i) => n !== bNames[i])) {
            const onlyA = aNames.filter((n) => !bNames.includes(n));
            const onlyB = bNames.filter((n) => !aNames.includes(n));
            out.push({
              surface: `${first[0]}~${label} ${surface}`,
              state,
              detail:
                `27-F4 / 27-F5 BROKEN: '${surface}' carries a different SET of controls on ` +
                `${first[0]} (${first[1].panel.diagonalIn}") than on ${label} ` +
                `(${rec.panel.diagonalIn}"). Only on ${first[0]}: ${JSON.stringify(onlyA)}. ` +
                `Only on ${label}: ${JSON.stringify(onlyB)}. A mode may change WHERE a control ` +
                "is and HOW BIG it is; it may never change WHAT is there. 27-F5: every action " +
                "has a PERSISTENT, visible, labelled target — so a control that collapses into " +
                "an overflow, a 'more' affordance or nothing at all on smaller glass fails that " +
                "FR twice over. This surface draws no pager on either panel, so 27-F2's lateral " +
                "paging is not what is happening here.",
            });
          }
        }

        // ---- the ORDER (pinned reading 1) ----
        const byLabelB = new Map<string, Control>();
        for (const c of b) if (!byLabelB.has(c.label)) byLabelB.set(c.label, c);
        const common = a.filter((c) => byLabelB.has(c.label));
        for (let i = 0; i < common.length; i += 1) {
          for (let j = i + 1; j < common.length; j += 1) {
            const a1 = common[i];
            const a2 = common[j];
            if (a1 === undefined || a2 === undefined) continue;
            const b1 = byLabelB.get(a1.label);
            const b2 = byLabelB.get(a2.label);
            if (b1 === undefined || b2 === undefined) continue;
            const relA = relate(a1, a2);
            const relB = relate(b1, b2);
            // Diagonal or overlapping on one of the two panels: the geometry does not decide an
            // order there, so there is no order to have changed. Not counted as reflow either —
            // this is "the question does not apply", not "the answer is permitted".
            if (relA === null || relB === null) continue;
            // The REFLOW the rule permits: the pair changed category — side by side on one panel,
            // stacked on the other, which is exactly what a `flex-wrap` column boundary does.
            // Counted so the permission cannot silently swallow the check.
            if (relA !== relB) {
              pairsReflowed += 1;
              continue;
            }
            pairsCompared += 1;
            if (relA === "ROW") {
              if (leftOf(a1, a2) === leftOf(b1, b2)) continue;
              out.push({
                surface: `${first[0]}~${label} ${surface}`,
                state,
                detail:
                  `27-F4 BROKEN — TWO CONTROLS SWAPPED SIDES BY MODE. On ${first[0]} ` +
                  `(${first[1].panel.diagonalIn}") '${a1.label}' is to the ` +
                  `${leftOf(a1, a2) ? "LEFT" : "RIGHT"} of '${a2.label}'; on ${label} ` +
                  `(${rec.panel.diagonalIn}") it is to the ${leftOf(b1, b2) ? "LEFT" : "RIGHT"}. ` +
                  "They share a visual row on BOTH panels, so this is not the reflow the mode " +
                  "rule permits — it is the reordering 27-F4 calls a breaking change. Grid " +
                  "position is a compatibility contract: 23 of 34 field subjects could not " +
                  "perform a task they knew well on a differently-arranged device.",
              });
            } else {
              if (aboveOf(a1, a2) === aboveOf(b1, b2)) continue;
              out.push({
                surface: `${first[0]}~${label} ${surface}`,
                state,
                detail:
                  `27-F4 BROKEN — TWO CONTROLS SWAPPED VERTICAL ORDER BY MODE. On ${first[0]} ` +
                  `(${first[1].panel.diagonalIn}") '${a1.label}' is ` +
                  `${aboveOf(a1, a2) ? "ABOVE" : "BELOW"} '${a2.label}'; on ${label} ` +
                  `(${rec.panel.diagonalIn}") it is ${aboveOf(b1, b2) ? "ABOVE" : "BELOW"} it. ` +
                  "They share a COLUMN on both panels — stacked, horizontally overlapping — so " +
                  "this is not a wrap and not the reflow the mode rule permits. It is the " +
                  "reordering 27-F4 makes a breaking change, and 27-F7 makes a list's visual " +
                  "order its WORK order.",
              });
            }
          }
        }
      }
    }
  }

  // ── `24-F14` — every one of the four checks above must have looked at something. ──
  //
  // Each number guards a different way this file can go inert, and they are asserted separately
  // for the reason `main.ts` learned the hard way when one global count kept a scope-widened rule
  // green: a single total lets a healthy check cover for a dead one.
  if (panelsSeen.length < 2) {
    out.push({
      surface: "mode-contract",
      state: "quiet",
      detail:
        `EMPTY MATCH — ${panelsSeen.length} panel(s) recorded. This file compares surfaces ` +
        "BETWEEN panels, so with fewer than two it asserts nothing at all (24-F14).",
    });
  }
  if (setsCompared === 0) {
    out.push({
      surface: "mode-contract",
      state: "quiet",
      detail:
        `EMPTY MATCH — zero control SETS were compared across panels (${setsPaged} surfaces were ` +
        "skipped as paged). 27-F2's paging exemption is meant to retire the few surfaces that " +
        "genuinely page, not the check; at this level a mode could drop TAKE CASH and this rail " +
        "would stay green (24-F14).",
    });
  }
  if (pairsCompared < 100) {
    out.push({
      surface: "mode-contract",
      state: "quiet",
      detail:
        `EMPTY MATCH — only ${pairsCompared} control PAIRS were judged for 27-F4 position ` +
        `(${pairsReflowed} were skipped as reflow). The reflow permission is the one way this ` +
        "check can be silenced without anything looking wrong, so it is measured rather than " +
        "trusted (24-F14).",
    });
  }
  if (keypadTargetsMeasured === 0) {
    out.push({
      surface: "mode-contract",
      state: "quiet",
      detail:
        "EMPTY MATCH — no keypad-posture target was found on any surface of any panel, so " +
        "27-F8's 20 mm minimum went unmeasured in every mode. Either no pad rendered, or the " +
        "digits stopped carrying an aria-label and the identification in pinned reading 2 needs " +
        "revisiting — which is a finding for this file's author, not an edit (24-F14).",
    });
  }

  return out;
};
