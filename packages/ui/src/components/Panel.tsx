import type { ReactNode } from "react";
import { useSurfaceMode } from "../surface-mode";
import { useColor } from "../theme";
import { space, typography } from "../tokens/index";

/**
 * # A bounded, captioned REGION of a work surface — the grouping idiom this product had none of
 *
 * `Readout` pairs a caption with **one fact**. This pairs a caption with **a group of controls or
 * facts**, and it exists for the same class of reason: the counter had been drawing groups by
 * putting a gap between rows and hoping the eye found it.
 *
 * **The defect it closes, measured on the launched app (August 2026).** The Cash tab rendered the
 * day controls, the shift controls, the four paid-out reason tiles, the receipt tile and the
 * paid-out action as **eleven sibling `Tile`s in three wrapping rows on a bare page**. Three
 * different kinds of act — a once-daily irreversible-ish day open, a per-person shift, and money
 * physically leaving the drawer — read as one undifferentiated field, and the relationship between
 * a reason tile and the `Paid out` it is a precondition for was carried by nothing at all. Every
 * gate was green: `layout:check` asks whether a control FITS and eleven scattered tiles fit
 * perfectly.
 *
 * ## Why it is a component and not four hand-rolled `<div>`s
 *
 * It already WAS four hand-rolled divs on the way to being five. `OrdersSurface` had a `TRAY`
 * constant, `TenderPanel` an inline `<section>`, `App.tsx` a `MASTHEAD`; each had picked its own
 * padding, its own radius and its own caption treatment, and they had begun to disagree. `27-F43`
 * records precisely this outcome for the `on-*` colour pairings — *"leaving the pairing in prose
 * produced a publicly-reported failure that remains unfixed years later"* — and `21-F5` makes an
 * app-local one-off component a lint error for the same reason. There is one way to draw a region
 * here and it is this.
 *
 * ## What it may and may not carry
 *
 * - **The caption is `Readout`'s caption, deliberately identical**: `text-label`, `fgColor-muted`,
 *   0.12em tracking. A region name is scaffolding, not payload (`27-F25`), and a product with two
 *   caption dialects has taught the operator that captions are decoration.
 * - **The upper-casing is done in CSS, not at the call site**, and that is a considered
 *   difference from `Readout`. `OrdersSurface` recorded the reason it could not upper-case its
 *   headings: *"`orders-tab.dom.test.tsx` is an acceptance oracle that finds both lists by their
 *   heading text … Changing five oracle assertions to buy a typographic flourish is not a trade an
 *   implementer gets to make."* `text-transform` leaves `textContent` untouched, so the oracle
 *   keeps matching natural-language text and the glass gets the instrument-panel capital. It is
 *   chrome, never user content, so commandment 7's faithful-rendering rule is not engaged.
 * - **`tone` is the ONLY colour this component can spend, and it spends exactly one slot.**
 *   `27-F14` allocates amber to *"abnormal — attention required"*; the fill sits on the CAPTION
 *   and never on the body, so a money figure inside an abnormal region is still uncoloured
 *   (`27-F16`). The word in the caption is what carries the meaning (`27-F12`), the fill carries
 *   its own outline (`27-F64`), and there is no `fault` tone: red's claimants in `27-F14` are
 *   enumerated, `03-F5`'s S1 band is the surface that owns them, and a second red region on the
 *   glass is how the band stops being the loudest thing on it.
 * - **There is no `title`-less variant.** A bounded region with no name is a box, and a box is
 *   what `27-F1`'s flat layout replaces navigation with — it has to say what it is.
 */
export type PanelProps = {
  /**
   * What this region is. Natural language, sentence case at the call site — the capitals are
   * applied in CSS so an acceptance oracle can still match the words (see the note above).
   */
  title: string;
  /**
   * A short qualifier on the region, right of the caption: a count, an ordering rule, a state
   * word. Muted and small, because it is scaffolding about scaffolding.
   *
   * `27-F7` is the reason this exists rather than being folded into the title: *"a list's visual
   * order MUST be its work order"*, and a list whose order is a rule the operator cannot see is a
   * list she has to take on trust. `Open orders · oldest first` says the rule out loud.
   */
  note?: string | undefined;
  /**
   * `27-F14` — `abnormal` claims the amber slot for the region, on the caption only.
   * Default `neutral`, which spends nothing: `27-F16`'s argument is that emphasising the base
   * case emphasises nothing.
   */
  tone?: "neutral" | "abnormal" | undefined;
  /**
   * Which of `27-F66`'s two legitimate depth cues this region sits on. A closed enum named for
   * the tokens themselves rather than a `subtle`/`bold` ladder (`27-F39`).
   *
   * `raised` is a working surface holding controls; `sunken` is a tray holding raised things
   * (`OrderList`'s cards). Neither fill is load-bearing for perceivability — `27-F66` measured
   * that no three-surface palette can carry 3:1 — so the boundary is what bounds the region and
   * the ~1.1:1 step is depth.
   */
  elevation?: "raised" | "sunken" | undefined;
  /** `flex-grow` inside a flex parent. A layout ratio, never a size (`27-F11c`). */
  grow?: number | undefined;
  children: ReactNode;
};

export const Panel = ({
  title,
  note,
  tone = "neutral",
  elevation = "raised",
  grow,
  children,
}: PanelProps) => {
  const color = useColor();
  const t = typography["text-label"];
  const abnormal = tone === "abnormal";
  /**
   * **A region's INSET tightens by one token step on short glass, and its boundary does not.**
   *
   * A `Panel` spends `2 × space-4` on each axis, and the Cash tab stacks up to four of them —
   * two nested, since the paid-out sequence is a region inside The drawer. That is 128 dp of
   * padding on a panel with ~790 dp of glass to spend, and it was the last thing between the
   * counter and `27 §1a`'s 10.1″ tablet class after the tab rail turned sideways.
   *
   * **What does NOT change is the part that does the work.** `27-F66` makes the BOUNDARY what
   * carries a region — *"a neutral region is carried by its boundary, never by the fill step"* —
   * and the border, the radius, the tone outline and the caption are all untouched. Padding is
   * the space between a boundary and its contents; a region with a slightly tighter inset is
   * still unambiguously a region, and on this glass the alternative is not a roomier panel but a
   * control off the right-hand edge.
   *
   * It is a token step (`space-4` → `space-3`, `space-3` → `space-2`) and never a literal, and
   * it touches no target: every `Tile` inside keeps `targetFor(posture)` to the dp, so `27-F68`
   * (b) is untouched.
   */
  const compact = useSurfaceMode() === "compact";
  return (
    <section
      aria-label={title}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? space["space-2"] : space["space-3"],
        minWidth: 0,
        minHeight: 0,
        ...(grow === undefined ? {} : { flex: grow }),
        padding: compact ? space["space-2"] : space["space-4"],
        borderRadius: space["space-2"],
        background:
          elevation === "raised"
            ? color["bgColor-surface-raised"]
            : color["bgColor-surface-sunken"],
        // 27-F66 — a neutral region is carried by its BOUNDARY, never by the fill step. The
        // abnormal region's boundary is the amber outline, which is 27-F64's same rule one tone
        // along: the outline bounds, the fill (on the caption) states.
        border: `1px solid ${
          abnormal ? color["outlineColor-status-abnormal"] : color["borderColor-default"]
        }`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space["space-3"],
          minWidth: 0,
        }}
      >
        <h2
          style={{
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: t.fontWeight,
            // `Readout`'s one typographic liberty, taken here for the same reason: a short
            // upper-case caption at 14 dp is the instrument-panel label, and tracking is what
            // stops a run of capitals reading as an abbreviation nobody expanded.
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: 0,
            whiteSpace: "nowrap",
            ...(abnormal
              ? {
                  background: color["bgColor-status-abnormal"],
                  color: color["fgColor-on-status-abnormal"],
                  border: `1px solid ${color["outlineColor-status-abnormal"]}`,
                  borderRadius: space["space-1"],
                  padding: `${space["space-1"]}px ${space["space-2"]}px`,
                }
              : { color: color["fgColor-muted"] }),
          }}
        >
          {title}
        </h2>
        {note === undefined ? null : (
          <span
            style={{
              fontFamily: t.fontFamily,
              fontSize: t.fontSize,
              fontWeight: t.fontWeight,
              letterSpacing: t.letterSpacing,
              // 27-F26 binds tabular figures with no feature flag on Plex, but a fallback face
              // may not — a note is often a count, and counts sit in a column.
              fontVariantNumeric: "tabular-nums",
              color: color["fgColor-muted"],
              whiteSpace: "nowrap",
            }}
          >
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
};
