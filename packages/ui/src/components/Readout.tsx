import type { ReactNode } from "react";
import { useColor } from "../theme";
import { space, typography } from "../tokens/index";

/**
 * # The readout — **a caption, and the fact it names directly beneath it**
 *
 * This is the one compositional idiom this product is meant to be recognised by, and it exists
 * because of a specific, repeated defect rather than a taste: **every fact on this counter was
 * being drawn as a `space-between` row, so the word naming a number sat as far from the number
 * as the container was wide.** `TenderPanel`'s `DUE` label and its figure were **70 mm apart**
 * on the reference panel; `27-F25` asks for the payload to be *"the largest element in its
 * region"* and a caption at the other end of the region is not naming anything a glance can
 * pair. `Counter.tsx` had already recorded the same defect one level up — *"threw the `DUE`
 * figure to the far side of its own label"* — and fixed it by shrinking the panel rather than by
 * fixing the pairing.
 *
 * `27-F57` is the same law on paper and states the mechanism outright: *"the mapping step —
 * pairing a number to the thing it quantifies — is where comprehension collapses in every study
 * we have (readers who **decode** a line at ~71% **execute** it correctly at ~35%)"*, so a
 * quantity *"sits immediately left of the item name … never in a right-aligned column"*. Glass
 * is not paper and the channels differ, but the failure being avoided is identical, and doc 27
 * has measured it on exactly one of the two surfaces. Stacking is the glass equivalent of
 * adjacency: the caption is directly above its own payload, at a fixed distance, on every
 * surface, at every size.
 *
 * ## Why it is a component and not a convention
 *
 * `21-F1`/`21-F5`: a pairing left in prose gets re-assembled differently on the next screen, and
 * `27-F43` records that exact outcome for `on-*` colour pairings — *"leaving the pairing in prose
 * produced a publicly-reported failure that remains unfixed years later"*. There is one way to
 * draw a fact here and it is this component.
 *
 * ## What it is NOT
 *
 * - **Not a heading.** The caption is `text-label` and `fgColor-muted`, permanently. It is a
 *   qualifier on the payload, and `27-F16`'s argument about colour applies to size and weight
 *   too: emphasise the base case and you have emphasised nothing.
 * - **Not a status surface.** It has no colour prop and no state prop. `27-F12` requires a
 *   status to carry colour **and** shape **and** position **and** a number; a caption that could
 *   be tinted would be a status component that satisfies none of those.
 * - **Not a size.** The payload's scale belongs to the payload — `MoneyValue` takes a `size`,
 *   `27-F8`'s postures take a posture — so this component deliberately cannot resize its own
 *   child. A `scale` prop here would be a second place the type ladder is spent from.
 */
export type ReadoutProps = {
  /**
   * The word that names the fact. Short, upper-case at the call site, English (`00 §5.6`).
   *
   * `27-F12` is why this is REQUIRED and not optional: on this product a direction — `CHANGE`
   * against `REMAINING`, `SHORT` against `OVER` — is carried by a word and never by a colour or
   * a sign, so the word is the load-bearing half of the pair and a readout without one is a
   * number nobody can act on.
   */
  caption: string;
  /** The fact. A `MoneyValue`, a name, a count — whatever the payload of this region is. */
  children: ReactNode;
};

export const Readout = ({ caption, children }: ReadoutProps) => {
  const color = useColor();
  const t = typography["text-label"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["space-1"], minWidth: 0 }}>
      <span
        style={{
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          fontWeight: t.fontWeight,
          // Wider than the token's own tracking, and this is the ONE typographic liberty the
          // component takes. A short upper-case caption at 14 dp is the classic instrument-panel
          // label, and tracking is what stops four capitals reading as an abbreviation someone
          // forgot to expand. It is a letter-spacing on a caption — it spends no colour, no
          // status slot and no size step, so it cannot collide with anything 27-F14 or 27-F25
          // allocates.
          letterSpacing: "0.12em",
          color: color["fgColor-muted"],
          // 27-F7's sibling property for a single fact: the caption never wraps away from its
          // payload, because a two-line caption puts the number somewhere different on one
          // surface than on another and the whole point is that it is always in the same place.
          whiteSpace: "nowrap",
        }}
      >
        {caption}
      </span>
      {children}
    </div>
  );
};
