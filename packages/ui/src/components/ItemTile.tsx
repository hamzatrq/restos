import type { Paisa } from "@restos/domain";
import { useColor } from "../theme";
import {
  type CategoryName,
  identityFill,
  identityRule,
  type Posture,
  space,
  targetFor,
  typography,
} from "../tokens/index";
import { formatPaisa } from "./MoneyValue";

/**
 * # `ItemTile` — one sellable menu item on the counter's Order grid
 *
 * **Not `Tile`.** That component is the generic ACTION tile — keypad keys, paid-out reasons,
 * pick-list options — and it takes a `label` and children. This one is the menu item, and the
 * difference is not cosmetic: a menu item carries a PRICE, a photograph that may or may not
 * exist, and a category identity, none of which an action tile has. Overloading `Tile` with six
 * more optional props would have produced the thing `21-F1` forbids — a component configurable
 * into violating a law.
 *
 * ## `27-F69` — the price is the product, and its absence is the defect this FR was filed against
 *
 * The shipped counter rendered 36 tiles with **no price on any of them**, for the whole of Wave 1.
 * So the price is not a decoration here: it renders on every tile, at a size no smaller than the
 * item's own name, in `27-F23`'s format (`Rs`, symbol-first, Western 3-digit grouping, **no
 * decimals** — no sub-rupee unit circulates and the decimal point is the highest-consequence
 * keystroke there is).
 *
 * **`paisa: null` is UNKNOWN and it is not `paisa(0)`.** The two are different facts and the tile
 * says so: an unknown price renders the words and **refuses the sale**, a free item renders
 * `Rs 0` and **sells**. `01-F60` is why they must be distinguishable — a free modifier carries an
 * explicit zero, and any rule that collapses the two lets an unpriced entry through as free.
 *
 * ## `27-F70` — three plate states, and `coverage` outranks `photo`
 *
 * A restaurant may photograph everything, some of it, or none of it, and all three are
 * first-class. `coverage` is a MENU-level fact the tile cannot derive from its own props: an item
 * with no photo in a `partial` menu gets a lettered plate, and the same item in a `none` menu gets
 * no plate at all. Where the two disagree — a photo present inside a `none` menu — **`coverage`
 * wins**, because the FR's word is *entirely*, and a row that reflows around one surviving
 * photograph is not the compact row it promises. A grid of two row heights is exactly the `27-F4`
 * positional defect the same FR spends a paragraph protecting.
 *
 * **Nothing in the sale path depends on a photo existing.** That is the FR's closing clause and it
 * is the one an implementation breaks by accident — the acceptance suite now presses a
 * photographed tile precisely because an earlier draft of it did not, and a tile that rendered a
 * photograph and refused to sell passed the whole file.
 *
 * ## `27-F74` — the tint is wayfinding, and the word is what keeps it honest
 *
 * The category is always rendered as a word beside its colour, so the tint is never the only
 * signal (`27-F12`). The tint is drawn through `identityFill`/`identityRule` rather than by
 * building the token name inline, because `` `bgColor-identity-${c}` `` written at a call site is
 * exactly how a fill ends up on a border — the confusion `27-F40`'s prefixes exist to stop.
 *
 * **No identity hue ever touches the sold-out flag.** That flag is a status surface, and
 * `27-F74` (c) keeps the two palettes from co-occurring — which is what lets `27-F15`'s ΔE00 floor
 * be computed over the `27-F14` set alone.
 *
 * ## `27-F75` / `02-F52` — sold out is a solid amber fill, and the word is `Sold out`
 *
 * The slot is `abnormal`, not `fault`: an 86'd item is a chosen operating state, and red stays for
 * things that are broken. The weight comes from a **solid fill** — `27-F15` says the fill carries
 * it, and a soft tint is precisely what made amber read as weak on the screen this replaces.
 *
 * **The word is `Sold out` and never `86`** (`02-F52`, at authority level 2 via `00 §5.6`): *86*
 * is American slang, not English, and this operator is plausibly non-reading. That is a defect the
 * product already closed once — the Sold-out tab said `Sold out` while the Order tab passed `86`
 * straight through, so one cashier saw two names for one state depending on the tab.
 *
 * **A sold-out item still sells.** `01-F17` forbids the platform withholding a sale on
 * availability, and `01-F59` is explicit that the counter may sell it deliberately with `02-F31`
 * owning the oversell path. So there is no `disabled` attribute here — the tile is flagged and
 * struck, and the decision stays with the operator. The only thing that refuses is an unknown
 * price, which is a different fact entirely.
 *
 * ## `27-F8` / `27-F68` — the floor is a POSTURE, in dp, on both axes
 *
 * There is no `size` prop: the posture is the design decision and the number moves when the
 * evidence does. Both axes carry it, because a pinned `minWidth` beside a deriving `minHeight` is
 * a real defect that looks fine in one column — 126 dp is 20 mm on the counter and 126 px is
 * 14.2 mm on the 141-PPI panel `27 §1a` also lists. The dp→px conversion is `PanelRoot`'s and is
 * never done here (`27-F68` (a)).
 */
/**
 * Re-exported so a consumer types a category against the SAME union the manifest generates,
 * rather than hand-copying twelve slugs. `K-3`'s recorded failure is what this prevents: an
 * oracle that declared the interface it existed to deliver and then asserted against a hand-copy,
 * leaving both symbols dead. A type that is imported from the component it constrains cannot
 * drift from it.
 */
export type { CategoryName };

export type ItemTileProps = {
  posture: Posture;
  name: string;
  /** Integer paisa, or `null` for a price this device does not know (`27-F69`, `01-F60`). */
  paisa: Paisa | null;
  category: CategoryName;
  /** The MENU's photography coverage, not this item's (`27-F70` (c)). Defaults to `partial`. */
  coverage?: "full" | "partial" | "none" | undefined;
  photo?: string | undefined;
  soldOut?: boolean | undefined;
  onPress?: (() => void) | undefined;
};

// @unreached-owed `plans/saas-pivot/plan-of-record.md` W1 — `ItemGrid` is the caller and is the
// next component in the rebuild. Recorded rather than hidden, and the timing is the point: this
// package's own guide names "a correct subsystem with no seam to the product" as the wave's
// recurring defect, and the rail caught this one within an hour of that paragraph being edited.
// A component proven by 45 acceptance tests and reached by no screen is exactly the shape — the
// tests are the seam to the SUITE, never to the product. DELETE this marker when `ItemGrid`
// renders it; a marker on something reached fails the rail by design.
export const ItemTile = ({
  posture,
  name,
  paisa,
  category,
  coverage = "partial",
  photo,
  soldOut = false,
  onPress,
}: ItemTileProps) => {
  const color = useColor();
  const min = targetFor(posture);
  const priced = paisa !== null;
  /**
   * `27-F70` (c) collapses the whole row when the menu carries no photography, and `coverage`
   * outranks a stray `photo` — see the header. The two plate kinds are otherwise decided by
   * whether this item has an image, which is `27-F70` (a) and (b).
   */
  const plate = coverage === "none" ? "none" : photo === undefined ? "letter" : "photo";
  const label = typography["text-label"];
  /**
   * `27-F69` — "at a size no smaller than the item's own name". Equal is permitted and is what
   * ships: the name is the recognition target and the price is the fact, and making the price
   * larger than the dish would be `27-F16`'s error in the size channel.
   */
  const priceType = typography["text-label"];

  return (
    <button
      type="button"
      /**
       * **Never `disabled` on availability.** `01-F17`, `01-F59` and `02-F40` between them make
       * the counter's ability to sell an 86'd item load-bearing — it is what absorbs a
       * printer-only kitchen's walk-to-the-counter delay. An unknown PRICE is a different fact and
       * is the one thing that refuses, because `01-F60` has no fallback house price and selling at
       * a guessed number is worse than not selling.
       */
      onClick={priced ? onPress : undefined}
      aria-label={soldOut ? `${name} — Sold out` : name}
      style={{
        minWidth: min,
        minHeight: min,
        margin: space["space-1"],
        padding: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        textAlign: "left",
        overflow: "hidden",
        background: color["bgColor-surface-raised"],
        // `27-F66` — a control's boundary meets 3:1; the decorative rule may never bound one.
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        // `27-F70` (c) — the collapsed row is marked by its category rule, which is the only
        // identity signal left once the plate is gone.
        ...(plate === "none"
          ? { borderLeft: `${space["space-1"]}px solid ${color[identityRule(category)]}` }
          : {}),
      }}
    >
      {plate === "photo" ? (
        <img
          src={photo}
          alt=""
          style={{ display: "block", width: "100%", height: min / 2, objectFit: "cover" }}
        />
      ) : null}
      {plate === "letter" ? (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: min / 2,
            // `27-F74` — the plate itself carries the tint. Painting the tile and leaving the
            // plate blank renders the empty box `27-F70` (b) forbids.
            background: color[identityFill(category)],
            color: color["fgColor-on-identity"],
            ...typography["text-numeric-primary"],
            fontSize: `${typography["text-numeric-primary"].fontSize}px`,
            lineHeight: `${typography["text-numeric-primary"].lineHeight}px`,
          }}
        >
          {name.slice(0, 1)}
        </span>
      ) : null}

      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["space-1"],
          padding: space["space-2"],
        }}
      >
        <span
          style={{
            fontSize: `${label.fontSize}px`,
            lineHeight: `${label.lineHeight}px`,
            fontWeight: label.fontWeight,
            color: color["fgColor-default"],
          }}
        >
          {name}
        </span>
        {/* `27-F74` (b) — the word, always, so the tint is never the only signal. */}
        <span
          style={{
            fontSize: `${label.fontSize}px`,
            lineHeight: `${label.lineHeight}px`,
            color: color["fgColor-muted"],
          }}
        >
          {category}
        </span>
        {/*
          `27-F69` — ONE text run, because a price split across two elements cannot be struck,
          sized or coloured as one thing. `27-F16` keeps it achromatic: colour on a number means
          the number is abnormal, and the price is the base case on every tile in the grid.
        */}
        <span
          style={{
            fontSize: `${priceType.fontSize}px`,
            lineHeight: `${priceType.lineHeight}px`,
            fontWeight: priceType.fontWeight,
            fontVariantNumeric: "tabular-nums",
            color: color["fgColor-default"],
            ...(soldOut ? { textDecorationLine: "line-through" } : {}),
          }}
        >
          {priced ? formatPaisa(paisa) : "No price set"}
        </span>
      </span>

      {soldOut ? (
        <span
          style={{
            // `27-F75` — a SOLID fill in the `abnormal` slot, never a soft tint and never `fault`.
            // `27-F64` — the status surface carries its outline; the fill's luminance is then free
            // for dichromacy and the boundary is what meets 3:1.
            background: color["bgColor-status-abnormal"],
            color: color["fgColor-on-status-abnormal"],
            outline: `1px solid ${color["outlineColor-status-abnormal"]}`,
            outlineOffset: -1,
            textAlign: "center",
            padding: space["space-1"],
            fontSize: `${label.fontSize}px`,
            lineHeight: `${label.lineHeight}px`,
            fontWeight: label.fontWeight,
          }}
        >
          {/* `02-F52` — the rendered word, never the digits. */}
          Sold out
        </span>
      ) : null}
    </button>
  );
};
