import type { Paisa } from "@restos/domain";
import { CSS_PX_PER_INCH } from "../physical";
import { useColor } from "../theme";
import { mmFromDp, space, targetFor, targetMm, typography } from "../tokens/index";
import { MoneyValue } from "./MoneyValue";
import { Tile } from "./Tile";

/**
 * A flat, paged list of ORDERS — the counter's recall surface (`02-F10`) and the surface the
 * cloud-order inbox is drawn on (`02-F9`).
 *
 * **Why this is not `TicketCard`.** That component is the 22" pass panel's kitchen ticket
 * (`27-F11f`): it carries an age badge, a mandatory `onBump`, and `03-F19`'s station-bump
 * semantics. The counter's Orders tab is a different act on a different posture — the cashier
 * is recalling an order or accepting one, never bumping a station — and reusing the kitchen
 * card here would put a bump control at a till that `03-F24` may not have given the ready
 * signal to at all.
 *
 * **Three laws are structural here rather than conventional:**
 *
 * 1. **Paged, never scrolled** (`03-F46`, `27-F2`). `27-F2`'s field finding is that nearly half
 *    of subjects did not know content existed below the fold, and `03-F46` resolves it for a
 *    queue the same way this does: page **within** one strictly-ordered flat list, so the work
 *    is always on page 1 and reaching it is never a navigation act. Paging is LATERAL and
 *    spends nothing from `27-F1`'s depth budget.
 * 2. **Capacity is computed from the surface, never a hardcoded row count** (`27-F11c`, and the
 *    same rule `ItemGrid` records at length). The caller measures its own box in millimetres;
 *    there is deliberately no `rowsPerPage` prop, because a fixed count is a layout costed for
 *    a panel that may not be the one in front of the operator.
 * 3. **The empty state is SAID, never hidden** (`00 §5.7`). `empty` is required for that reason:
 *    a list that renders nothing when it holds nothing is indistinguishable from a list that
 *    failed to load, and on a counter those two need different responses from the operator.
 *
 * **`action` is ONE action, and that is the closed-vocabulary constraint** (Commandment 6).
 * A list that accepted an array of per-row controls could be configured into `27-F9`'s
 * violation — a destructive control adjacent to a high-frequency one on a wet-hand surface —
 * and into `27-F1`'s, by making a row a menu. Omitting it entirely is the read-only posture
 * `02-F10` describes for recall and `02-F33` requires of a queue panel whose org has not
 * assigned the ready signal to counter.
 */
export type OrderRow = {
  order_id: string;
  /** What the counter shouts and the customer quotes. Largest element in the row (`27-F25`). */
  reference: string;
  /**
   * `02-F42`'s closed set, as the fold projected it. **Rendered, never interpreted here** —
   * which channel counts as a cloud order is `02-F9`'s question and belongs to the screen that
   * knows why it is asking, not to a list component that would then encode policy.
   */
  channel: string;
  /** `02-F1`'s other axis. `null` where the projection has none — shown as nothing, never guessed. */
  orderType: string | null;
  /** Branded integer paisa (`00 §6`). The fold's own derivation; never summed by a caller. */
  totalPaisa: Paisa;
  lineCount: number;
};

export type OrderListProps = {
  /**
   * **Chronological, oldest first — the CALLER's ordering, rendered as given** (`03-F46`:
   * "page 1 always holds the oldest"). This component never sorts: a renderer-side sort is
   * exactly the `01-F34` break law 1 exists to prevent when the key is a projected value, and
   * it re-ranks a list an operator has learned by position (`27-F4`).
   */
  orders: readonly OrderRow[];
  /** Usable height in **millimetres**, measured by the caller (`27-F11c`). */
  heightMm: number;
  /** Surface density. Defaults to the CSS reference, which is what `usePhysicalSize` measures in. */
  ppi?: number | undefined;
  /** Rendered row height in mm; must be >= the counter posture minimum. Defaults to it. */
  rowMm?: number | undefined;
  page: number;
  onPageChange: (page: number) => void;
  /** The row's ONE primary action. Omitted = read-only recall (`02-F10`, `02-F33`). */
  action?: { label: string; onAct: (orderId: string) => void } | undefined;
  /** `00 §5.7` — what this surface says when it holds nothing. Required, never a blank box. */
  empty: string;
};

/**
 * Rows per page from physical height, on `pageGrid`'s own argument: a row may be TALLER than
 * its posture requires (it carries a reference, a channel and a total), never shorter.
 */
export const orderPageRows = (opts: {
  heightMm: number;
  rowMm?: number;
  gapMm?: number;
}): number => {
  const min = targetMm("counter");
  const row = opts.rowMm ?? min;
  if (row < min) {
    throw new RangeError(`row ${row}mm is below the counter posture minimum of ${min}mm (27-F8)`);
  }
  const gap = opts.gapMm ?? mmFromDp(space["space-2"]);
  // A surface too small for even one row still owes the operator one — returning 0 would page
  // forever over an empty list, which is a worse failure than an overflowing one (ItemGrid's
  // own ruling, applied to the same question).
  return Math.max(1, Math.floor((opts.heightMm + gap) / (row + gap)));
};

export const OrderList = ({
  orders,
  heightMm,
  ppi = CSS_PX_PER_INCH,
  rowMm,
  page,
  onPageChange,
  action,
  empty,
}: OrderListProps) => {
  const color = useColor();
  const px = (mm: number): number => Math.round((mm / 25.4) * ppi);
  /**
   * **A row must be able to CONTAIN its action, and this floor was found by launching.**
   *
   * `Tile` sizes itself from `targetFor(posture)` — 76, in CSS pixels — while this component's
   * capacity math is physical (`27-F11c`), and `targetMm("counter")` is the same 76 dp expressed
   * as **12.065 mm**, which at the CSS reference density renders as **45 px**. So the default
   * row was 31 px shorter than the control it holds: on the launched counter the Accept tiles
   * overflowed their cards and consecutive rows overlapped. Nothing in happy-dom could see it —
   * it lays nothing out — which is why this was found by looking and not by the suite.
   *
   * The dp-as-CSS-px / dp-as-millimetre duality is a **pre-existing property of the package**,
   * not something this component introduced: `ItemGrid` has the same gap and the counter papers
   * over it by passing `tileMm={28}` explicitly. Reconciling the two is a `tokens` change with
   * its own FR, so it is **named as a finding** in `apps/pos-electron/CLAUDE.md` rather than
   * fixed from here (`24 §3b`, surgical diffs).
   *
   * The floor is applied to the SAME `row` used for both capacity and render, which is
   * `ItemGrid`'s own ruling: a number that is computed and a number that is drawn must be one
   * number, or the surplus goes behind `overflow: hidden` where no pager can reach it.
   */
  const actionFloorMm = action === undefined ? 0 : (targetFor("counter") / ppi) * 25.4;
  const row = Math.max(rowMm ?? targetMm("counter"), actionFloorMm);
  /**
   * **The pager lives INSIDE the measured box, so its height is not the list's to spend.**
   *
   * Also found by launching. Capacity costed against the full height put two rows and a pager
   * into a box that holds two rows, and the surplus went behind `overflow: hidden` — the second
   * inbox row was **clipped in half with no way to reach it**, which on a counter is an order
   * that cannot be accepted. `ItemGrid` documents this exact hazard ("items on the page,
   * invisible, with no pager to reach them") and is only saved from it by the counter giving its
   * grid nearly the whole surface; a list taking a third of one has no such margin.
   *
   * The resolution is two-step rather than circular: cost the page at full height first, and
   * only if the list actually overflows that — i.e. only if a pager will exist — re-cost it with
   * the pager's own height removed. `Math.max(1, …)` inside `orderPageRows` keeps a very short
   * surface at one reachable row rather than none.
   */
  const pagerMm = ((targetFor("floor") + space["space-1"] * 2 + space["space-2"]) / ppi) * 25.4;
  const unpaged = orderPageRows({ heightMm, rowMm: row });
  const perPage =
    orders.length <= unpaged
      ? unpaged
      : orderPageRows({ heightMm: heightMm - pagerMm, rowMm: row });
  const pages = Math.max(1, Math.ceil(orders.length / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  const shown = orders.slice(current * perPage, current * perPage + perPage);
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  const label = typography["text-label"];
  const reference = typography["text-numeric-primary"];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-2"],
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["space-2"],
          flex: 1,
          minHeight: 0,
          // No overflow: paging replaces scrolling entirely (`27-F2`). If content would spill,
          // the page size is wrong, and that is a bug to see rather than to hide.
          overflow: "hidden",
        }}
      >
        {orders.length === 0 ? (
          /*
            `00 §5.7` — the device reports what is true. An empty list that drew nothing would
            be indistinguishable from one that failed to load, and `27-F4` keeps the surface
            present rather than collapsing the tab: the operator who learned this position
            finds it here holding an honest sentence.
          */
          <p
            style={{
              fontFamily: label.fontFamily,
              fontSize: label.fontSize,
              fontWeight: label.fontWeight,
              letterSpacing: label.letterSpacing,
              color: color["fgColor-muted"],
              margin: 0,
              padding: space["space-4"],
            }}
          >
            {empty}
          </p>
        ) : (
          shown.map((o) => (
            <article
              key={o.order_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: space["space-4"],
                minHeight: px(row),
                padding: `0 ${space["space-4"]}px`,
                background: color["bgColor-surface-raised"],
                border: `1px solid ${color["borderColor-default"]}`,
                borderRadius: space["space-2"],
              }}
            >
              {/*
                `27-F58`'s fixed reading order, and `27-F25` puts the operational payload at the
                top of the size ladder: the identifier the customer quotes comes first and
                largest, then the qualifiers, then the money.
              */}
              <span
                style={{
                  fontFamily: reference.fontFamily,
                  fontSize: reference.fontSize,
                  fontWeight: reference.fontWeight,
                  fontVariantNumeric: "tabular-nums",
                  color: color["fgColor-default"],
                }}
              >
                {o.reference}
              </span>
              <span
                style={{
                  fontFamily: label.fontFamily,
                  fontSize: label.fontSize,
                  fontWeight: label.fontWeight,
                  letterSpacing: label.letterSpacing,
                  color: color["fgColor-muted"],
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/*
                  Two axes `02-F1` keeps separate, shown separately. `orderType` is null on a
                  projection that carries none, and an absent type is rendered as absent rather
                  than defaulted — `02-F1` forbids inferring it, and a screen that printed
                  "dine-in" for an unknown type would be inferring it in the one place an
                  operator would believe it.
                */}
                {o.orderType === null ? o.channel : `${o.channel} · ${o.orderType}`}
                {" · "}
                {o.lineCount === 1 ? "1 item" : `${o.lineCount} items`}
              </span>
              {/*
                `27-F24` — the system computes and the operator reads. The total arrives finished
                from the fold; nothing on this surface is an operand.
              */}
              <MoneyValue paisa={o.totalPaisa} />
              {action === undefined ? null : (
                <Tile
                  posture="counter"
                  label={action.label}
                  onPress={() => action.onAct(o.order_id)}
                />
              )}
            </article>
          ))
        )}
      </div>

      {pages > 1 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space["space-2"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            // The same rail, for the same reason `ItemGrid` records: `27-F66` requires the
            // current-page state to be carried by an independent mark at 3:1, the mark is an
            // accent rule at the button's lower edge, and a rule is only measurable against
            // the thing behind it.
            background: color["bgColor-surface-sunken"],
            padding: space["space-1"],
          }}
        >
          {/*
            Numbered pages rather than a scroll affordance, and identical to the item grid's
            pager on purpose: a page number is a place an operator can learn and a scroll
            position is not (`27-F4`), and two pagers on one device that behaved differently
            would be the muscle-memory break that FR exists to prevent.
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
