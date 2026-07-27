import { color, type Posture, space, targetFor, typography } from "../tokens/index";
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
  unavailable?: boolean;
  unavailableReason?: string;
};

/**
 * Page capacity from usable area and tile size.
 *
 * The law `27-F2` protects is that a page size is never a **hardcoded item count** — not
 * that a caller may not know its own tile size. `targetFor(posture)` is the *touch minimum*,
 * and a real tile is larger than its minimum because it carries a name: a counter tile sized
 * at exactly 76 px would hold a touch target and no legible label. So `tilePx` is explicit,
 * and the invariant that matters is enforced here — **a tile may be larger than its posture
 * requires, never smaller.**
 *
 * With realistic tiles this reproduces `27-F11a`: ~88 on a 15.6″ counter, ~35 on a 10.1″
 * tablet, ~12 on a phone. Passing the bare posture minimum yields the theoretical ceiling,
 * which is useful for a layout test and wrong for a real screen.
 */
export const pageCapacity = (opts: {
  widthPx: number;
  heightPx: number;
  posture: Posture;
  /** Rendered tile edge. Defaults to the posture minimum — the ceiling, not a design. */
  tilePx?: number;
  gapPx?: number;
}): number => {
  const min = targetFor(opts.posture);
  const tile = opts.tilePx ?? min;
  if (tile < min) {
    throw new RangeError(
      `tile ${tile}px is below the ${opts.posture} posture minimum of ${min}px (27-F8)`,
    );
  }
  const gap = opts.gapPx ?? space["space-2"];
  const cols = Math.floor((opts.widthPx + gap) / (tile + gap));
  const rows = Math.floor((opts.heightPx + gap) / (tile + gap));
  // A surface too small for even one tile still owes the operator one tile — returning 0
  // would page forever over an empty grid, which is a worse failure than an overflowing one.
  return Math.max(1, cols * rows);
};

export type ItemGridProps = {
  items: readonly GridItem[];
  posture: Posture;
  /** Usable area, measured by the caller from its own layout — never guessed here. */
  widthPx: number;
  heightPx: number;
  /** Rendered tile edge; must be ≥ the posture minimum. Defaults to that minimum. */
  tilePx?: number | undefined;
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
};

export const ItemGrid = ({
  items,
  posture,
  widthPx,
  heightPx,
  tilePx,
  page,
  onPageChange,
  onSelect,
}: ItemGridProps) => {
  const tile = tilePx ?? targetFor(posture);
  const perPage = pageCapacity({ widthPx, heightPx, posture, tilePx: tile });
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  const shown = items.slice(current * perPage, current * perPage + perPage);
  // Page NUMBERS are stable identities — page 3 is always page 3 — so they key themselves.
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const t = typography["text-label"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["space-2"] }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))`,
          gap: space["space-2"],
          width: widthPx,
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
