import { useColor } from "../theme";
import {
  DP_PER_INCH,
  mmFromDp,
  type Posture,
  space,
  targetFor,
  targetMm,
  typography,
} from "../tokens/index";
import { Tile } from "./Tile";

/**
 * `27-F2` — **flat paged grids, not scrolling lists, for anything actionable.**
 *
 * The law is the SHAPE — flat, paged, lateral — **not a fixed item count.** The tested
 * layout (6 items per page, 3×2, beating a 4-level hierarchy 25 s vs 65.5 s and 100% vs
 * 80%) was measured **on a phone**. Transplanting "6" onto a 15.6″ counter terminal would be
 * a category error, and it is one this project actually made once before the founder's
 * hardware answer dissolved it (conflict C8).
 *
 * So capacity is **computed from the surface**, and there is deliberately no `itemsPerPage`
 * prop for a caller to get wrong. On the reference hardware this yields roughly the figures
 * in `27-F11a`: ~88 tiles on a 15.6″ counter, ~35 on a 10.1″ tablet, ~12 on a phone.
 *
 * Two further rules this component holds:
 * - **No primary action may require scrolling to reach.** Paging is lateral and free; a
 *   scrollbar here would be the defect, because nearly half of field subjects did not know
 *   content existed below the fold.
 * - **The grid must be complete without search** (conflict C3's resolution). `27-F6` bans
 *   *requiring* non-numeric typing and `21 §5` calls search an escape hatch — an escape
 *   hatch is only optional if everything sellable is reachable by tile.
 */
export type GridItem = {
  id: string;
  label: string;
  /**
   * `| undefined` spelled out, not merely optional. Under `exactOptionalPropertyTypes` a host
   * app building this from a parsed IPC payload has `boolean | undefined`, and a plain
   * `unavailable?: boolean` refuses it — pushing every caller into a conditional spread to
   * satisfy a distinction that carries no meaning here. Absent and `undefined` both mean
   * available.
   */
  unavailable?: boolean | undefined;
  unavailableReason?: string | undefined;
};

/**
 * Page capacity from **physical** usable area and **physical** tile size.
 *
 * `27-F11c` is the law: *"A 1366×768 and a 1920×1080 15.6-inch panel hold the SAME number of
 * 12 mm tiles. Extra pixels buy sharpness; only inches buy room. Design in millimetres,
 * render in pixels."* Both resolutions are in `27 §1a`'s hardware table as the counter target,
 * so the pixel-taking version of this function was not merely imprecise — it reported 91 tiles
 * for one and 180 for the other, for one physical surface, and a suite asserted that capacity
 * grew monotonically **in pixels**, which is the inverse of the FR.
 *
 * Taking millimetres makes the law hold by construction rather than by test: there is no
 * resolution in scope to be sensitive to.
 *
 * The other rule `27-F2` protects is that a page size is never a **hardcoded item count** —
 * not that a caller may not know its own tile size. `targetMm(posture)` is the *touch
 * minimum*, and a real tile is larger than its minimum because it carries a name: a counter
 * tile at exactly 12 mm holds a touch target and no legible label. So `tileMm` is explicit,
 * and the invariant enforced here is that **a tile may be larger than its posture requires,
 * never smaller** — checked in millimetres, because a px guard cannot do it. 48 px is 12.2 mm
 * on a 100-PPI panel and 8.6 mm on a 141-PPI one, and only one of those clears the counter
 * minimum.
 */
export type PageGrid = { cols: number; rows: number; capacity: number };

/**
 * The full answer: how many columns, how many rows, and therefore how many tiles.
 *
 * `pageCapacity` returns only the product, and returning ONLY the product was a real defect:
 * the component then laid the grid out fluidly with `auto-fill`, so the number of tiles it
 * COMPUTED and the number it RENDERED were two different calculations that agreed by luck.
 * Where they disagreed the surplus went behind `overflow: hidden` — items on the page,
 * invisible, with no pager to reach them, which on a counter is an item that cannot be sold.
 *
 * Returning the shape means the layout is DRIVEN by the capacity rather than checked against
 * it, so the two cannot drift.
 */
export const pageGrid = (opts: {
  widthMm: number;
  heightMm: number;
  posture: Posture;
  /** Rendered tile edge in mm. Defaults to the posture minimum — the ceiling, not a design. */
  tileMm?: number;
  gapMm?: number;
}): PageGrid => {
  const min = targetMm(opts.posture);
  const tile = opts.tileMm ?? min;
  if (tile < min) {
    throw new RangeError(
      `tile ${tile}mm is below the ${opts.posture} posture minimum of ${min}mm (27-F8)`,
    );
  }
  const gap = opts.gapMm ?? mmFromDp(space["space-2"]);
  // A surface too small for even one tile still owes the operator one tile — returning 0
  // would page forever over an empty grid, which is a worse failure than an overflowing one.
  const cols = Math.max(1, Math.floor((opts.widthMm + gap) / (tile + gap)));
  const rows = Math.max(1, Math.floor((opts.heightMm + gap) / (tile + gap)));
  return { cols, rows, capacity: cols * rows };
};

// @unreached-owed The counter renders `ItemGrid` and lets it page internally; nothing asks how
// many tiles a page HOLDS. The caller is the back-office menu editor (`specs/14`), which needs the
// number to warn that a category overflows its page before a cashier finds out at the till.
export const pageCapacity = (opts: Parameters<typeof pageGrid>[0]): number =>
  pageGrid(opts).capacity;

export type ItemGridProps = {
  items: readonly GridItem[];
  posture: Posture;
  /**
   * Usable area **in millimetres**, measured by the caller from its own layout. 27-F11c:
   * capacity is a physical question, so this is the unit the answer is computed in.
   */
  widthMm: number;
  heightMm: number;
  /**
   * Pixels per inch of the surface. Defaults to `DP_PER_INCH` — inside `PanelRoot` (`27-F68`)
   * the pixel Blink lays out in **is** the dp, which is what `usePhysicalSize` measures in, so
   * a caller that measures and a caller that names a panel cannot silently disagree about what
   * a millimetre is. It was the CSS reference 96 until `DEC-UI-001`, which made this grid's
   * millimetres true only on a 96-PPI panel.
   */
  ppi?: number | undefined;
  /** Rendered tile edge in mm; must be ≥ the posture minimum. Defaults to that minimum. */
  tileMm?: number | undefined;
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
};

export const ItemGrid = ({
  items,
  posture,
  widthMm,
  heightMm,
  ppi = DP_PER_INCH,
  tileMm,
  page,
  onPageChange,
  onSelect,
}: ItemGridProps) => {
  const color = useColor();
  const tile = tileMm ?? targetMm(posture);
  const shape = pageGrid({ widthMm, heightMm, posture, tileMm: tile });
  const perPage = shape.capacity;
  /** mm → px. The render step, and the only step that knows what a pixel is. */
  const px = (mm: number): number => Math.round((mm / 25.4) * ppi);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  const shown = items.slice(current * perPage, current * perPage + perPage);
  // Page NUMBERS are stable identities — page 3 is always page 3 — so they key themselves.
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const t = typography["text-label"];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-2"],
        // Fill the surface the caller measured, rather than imposing a width on it. The grid
        // used to set `width: px(widthMm)` — a fixed pixel box computed from an assumed panel
        // — which overflowed its container the moment the real surface was any other size, and
        // pushed the cart off the screen.
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          // EXACTLY the shape `pageGrid` costed, never `auto-fill`. With auto-fill the browser
          // decides the column count from the rendered width while `capacity` decided it from
          // millimetres, and the two agreeing was luck; where they disagreed the surplus went
          // behind `overflow: hidden` — tiles on the page, invisible, with no pager to reach
          // them. Driving the layout FROM the capacity is what makes them one number.
          gridTemplateColumns: `repeat(${shape.cols}, minmax(0, 1fr))`,
          // Rows are TILE-SIZED, not `1fr`. With `1fr` a page holding fewer items than its
          // capacity stretched the single row over the whole surface — six 106 × 568 px
          // slivers, which is not a tile and not a touch target anyone aims at. The surplus
          // belongs to the surface as empty space; it does not belong to the tiles.
          gridAutoRows: `${px(tile)}px`,
          // Top-aligned for the same reason, and for 27-F4: a page with four items must put
          // them where a page with forty puts its first four, or positional memory is worth
          // nothing the moment the menu changes size.
          alignContent: "start",
          gap: space["space-2"],
          flex: 1,
          minHeight: 0,
          // No overflow: paging replaces scrolling entirely (27-F2). If content would spill,
          // the page size is wrong, and that is a bug to see rather than to hide.
          overflow: "hidden",
        }}
      >
        {shown.map((item) => (
          <Tile
            key={item.id}
            posture={posture}
            label={item.label}
            unavailable={item.unavailable}
            unavailableReason={item.unavailableReason}
            onPress={() => onSelect(item.id)}
          />
        ))}
      </div>

      {pages > 1 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space["space-2"],
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            // A rail, for the same reason TabRail has one: 27-F66 requires the current-page
            // state to be carried by an independent mark at 3:1, the mark is an accent rule
            // at the button's lower edge, and a rule is only measurable against the thing
            // behind it. On the sunken rail the accent clears 4.94:1 light and 3.03:1 dark;
            // against a raised fill it would be 2.35:1 on dark and carry nothing.
            background: color["bgColor-surface-sunken"],
            padding: space["space-1"],
          }}
        >
          {/*
            Paging controls are LATERAL movement, so they do not spend the depth budget —
            same rule as the tab rail and as the kitchen queue (03-F46). They are rendered as
            explicit numbered pages rather than as a scroll affordance, because a page number
            is a place an operator can learn ("chapli kebab is on page 3") and a scroll
            position is not (27-F4 positional memory).
          */}
          {pageNumbers.map((n) => (
            <button
              key={`page-${n}`}
              type="button"
              aria-current={n - 1 === current ? "page" : undefined}
              onClick={() => onPageChange(n - 1)}
              style={{
                minWidth: targetFor("floor"),
                minHeight: targetFor("floor"),
                fontVariantNumeric: "tabular-nums",
                fontWeight: n - 1 === current ? 700 : 400,
                background:
                  n - 1 === current
                    ? color["bgColor-surface-raised"]
                    : color["bgColor-surface-sunken"],
                color: color["fgColor-default"],
                border: `1px solid ${color["borderColor-default"]}`,
                // 27-F66 — the current page is marked by an ACCENT RULE, not by the fill
                // step. The raised/sunken difference is 1.15:1 and carries nothing; this is
                // the same idiom the tab rail uses for the same reason, and weight alone is
                // a text property that SC 1.4.11 does not count.
                borderBottom:
                  n - 1 === current
                    ? `3px solid ${color["bgColor-interactive"]}`
                    : `3px solid transparent`,
                borderRadius: space["space-1"],
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
