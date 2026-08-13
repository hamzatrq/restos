import type { Paisa } from "@restos/domain";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";
import { MoneyValue } from "./MoneyValue";
import { QuantityItemLine, type QuantityItemLineProps } from "./QuantityItemLine";

/**
 * The cashier's working memory. Screen-map §3.1: **always visible, never a separate screen,
 * never collapsed.**
 *
 * `27-F5` forbids controls that change with context, and a cart that collapses is the same
 * failure in a different costume — the operator loses the thing she is reasoning about at the
 * moment she is interrupted, which on this counter is continuously (a queue, a ringing
 * phone, a beeping aggregator tablet, a waiter shouting a change).
 *
 * `27-F24` governs the total: it arrives **finished**. There is no subtotal the operator is
 * expected to add anything to, because ~60% of this population recognise numbers against
 * 9.5% who can do any arithmetic.
 *
 * ── `27-F2` — THE LINE LIST PAGES, AND THAT IS WHAT MAKES `27-F4` (f) POSSIBLE ───────────────
 *
 * `27-F4` (f) put `Send to kitchen` at the foot of this column and **pinned** it there: *"a long
 * cart must never push it below the fold — the cart's line list gives up the room, never the
 * control, because that FR forbids reaching a primary action by scrolling."* A cart that grew
 * without bound could not honour that, and it did not: measured on the layout gate's own
 * eleven-line family order, `main` held 587 px of content in a 567 px box on `tablet-10.1` and
 * clipped 20 px — **before** the confirm control was moved into that 20 px.
 *
 * So this component owns the yielding. Paging, not scrolling: `27-F2`'s field finding is that
 * nearly half of subjects did not know content existed below the fold, and `ItemGrid` and
 * `OrderList` already page for the same reason on the same device (`27-F4` — one idiom, one
 * habit). The **TOTAL is never what gives way**: it is the operational payload (`27-F25`) and
 * the number the cashier reads aloud, so it sits outside the paged region and is always on the
 * glass.
 */
export type CartProps = {
  lines: readonly (QuantityItemLineProps & { id: string })[];
  /**
   * Already computed, in **branded** integer paisa. The screen never does money arithmetic,
   * and now it cannot be handed a value that did not come from `domain` — the brand travels
   * with the number all the way from the fold to the glyph.
   */
  totalPaisa: Paisa;
  onRemove?: ((id: string) => void) | undefined;
  /**
   * Which page of the line list is shown. Required, and required for `OrderList`'s reason: an
   * optional pager is a pager a host can forget to wire, and a `27-F2` obligation that is only
   * discharged when a caller opts in is the "unsupplied optional seam" `pnpm seams:check` was
   * built to catch.
   */
  page: number;
  onPageChange: (page: number) => void;
};

/**
 * **HOW MANY LINES FIT IS MEASURED, NOT DERIVED — and that is a departure from `ItemGrid` and
 * `OrderList`, so here is the reason.**
 *
 * Both of those cost a page from millimetres (`27-F11c`) because their rows have a height this
 * package CHOOSES: a tile is `targetFor(posture)` square and an order row carries an explicit
 * `minHeight`. A cart line has a height the ORDER decides — `27-F59` puts every modifier and
 * every removal on its own indented line, `03-F3` adds a note, and a long item name wraps inside
 * whatever width the host gave the column. Arithmetic over that is a guess, and a guess that
 * runs one line long puts the last line behind `overflow: hidden` with no pager able to reach
 * it, which is the exact hazard `ItemGrid` records at length.
 *
 * The measurement is a monotone shrink and it cannot oscillate: `perPage` only ever decreases
 * within a layout pass, it stops at 1, and it is re-opened by exactly two things — a change in
 * the number of lines, and a resize of the **section**, whose height is set by the host's row
 * and is therefore independent of whether a pager is currently drawn. Observing the inner list
 * instead would be a loop: fewer lines → a pager appears → the list box shrinks → re-measure.
 *
 * Under happy-dom every `scrollHeight` and `clientHeight` is `0`, so `0 > 0 + 1` is false, no
 * shrink ever happens and the whole list renders — which is what the `.dom.test.tsx` suites
 * assert against and what they should keep asserting. **The pin itself is therefore owed to
 * `layout:check`**, which opens a real `BrowserWindow` and measures in Blink; no renderer test
 * in this repo can see it.
 */
const useLinesThatFit = (
  count: number,
): {
  perPage: number;
  sectionRef: (el: HTMLElement | null) => void;
  listRef: (el: HTMLDivElement | null) => void;
} => {
  const section = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const [perPage, setPerPage] = useState(Math.max(1, count));
  const reopen = useCallback(() => setPerPage(Math.max(1, count)), [count]);

  useEffect(() => {
    reopen();
  }, [reopen]);

  useEffect(() => {
    const el = section.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => reopen());
    observer.observe(el);
    return () => observer.disconnect();
  }, [reopen]);

  // Deliberately no dependency array: this has to run after EVERY layout, because each shrink
  // changes the layout it is judging. `perPage > 1` is what terminates it.
  useLayoutEffect(() => {
    const el = list.current;
    if (el === null || perPage <= 1) return;
    if (el.scrollHeight > el.clientHeight + 1) setPerPage(perPage - 1);
  });

  return {
    perPage,
    sectionRef: (el) => {
      section.current = el;
    },
    listRef: (el) => {
      list.current = el;
    },
  };
};

export const Cart = ({ lines, totalPaisa, onRemove, page, onPageChange }: CartProps) => {
  const color = useColor();
  const label = typography["text-label"];
  const { perPage, sectionRef, listRef } = useLinesThatFit(lines.length);
  const pages = Math.max(1, Math.ceil(lines.length / perPage));
  const current = Math.min(Math.max(0, page), pages - 1);
  const shown = lines.slice(current * perPage, current * perPage + perPage);
  return (
    <section
      ref={sectionRef}
      aria-label="Current order"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        padding: space["space-4"],
        background: color["bgColor-surface-raised"],
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        minWidth: 320,
        // `27-F4` (f) — the column, not this section, decides the height: the cart takes what is
        // left after the confirm control has its 20 mm, and gives up lines rather than pushing
        // the control off the glass. `minHeight: 0` is what actually permits the shrink.
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        ref={listRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: space["space-3"],
          flex: 1,
          minHeight: 0,
          // No scrolling, ever (`27-F2`). If content would spill, `perPage` is still converging
          // or the surface holds less than one line — both are things to SEE rather than hide.
          overflow: "hidden",
        }}
      >
        {lines.length === 0 ? (
          <span style={{ color: color["fgColor-muted"], fontFamily: label.fontFamily }}>
            Nothing added yet
          </span>
        ) : (
          shown.map(({ id, ...line }) => (
            <div
              key={id}
              style={{ display: "flex", alignItems: "flex-start", gap: space["space-2"] }}
            >
              <div style={{ flex: 1 }}>
                <QuantityItemLine {...line} />
              </div>
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onRemove(id)}
                  style={{
                    // 27-F9 — destructive, so it is visually separated from the item body and
                    // never sits where a wet hand lands while scanning the list. Removal
                    // pre-KOT is a plain event; post-KOT it must be a void with an approver
                    // (01 §4), which is a different control on a different surface entirely.
                    // Was a raw 44 — BELOW the 48 dp absolute floor, on a destructive control.
                    // Caught by the adversarial pass; a raw pixel number here is exactly what
                    // TOKENS.md bans, and it is why the ban exists.
                    minWidth: targetFor("floor"),
                    minHeight: targetFor("floor"),
                    marginLeft: space["space-4"],
                    background: "transparent",
                    // fgColor-, not bgColor- — the role prefix exists to say which property a
                    // token belongs to, and using a fill as a foreground silently breaks that.
                    color: color["fgColor-status-fault"],
                    border: `1px solid ${color["fgColor-status-fault"]}`,
                    borderRadius: space["space-1"],
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {pages > 1 ? (
        /*
          The identical pager `ItemGrid` and `OrderList` draw, for the reason `27-F4` gives: a
          page number is a place an operator can learn and a scroll position is not, and three
          pagers on one device that behaved differently would teach three habits.
        */
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: space["space-2"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            background: color["bgColor-surface-sunken"],
            padding: space["space-1"],
          }}
        >
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={`cart-page-${n}`}
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
                // 27-F66 — the current page is an independent MARK at 3:1, never the fill step.
                borderBottom:
                  n - 1 === current
                    ? `3px solid ${color["bgColor-interactive"]}`
                    : "3px solid transparent",
                borderRadius: space["space-1"],
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingTop: space["space-3"],
          borderTop: `1px solid ${color["borderColor-default"]}`,
        }}
      >
        <span style={{ fontFamily: label.fontFamily, fontSize: label.fontSize }}>TOTAL</span>
        {/* 27-F16: not coloured. Colour on a number means "this number is abnormal", and the
            total is the commonest number on the screen — colouring it would spend the whole
            preattentive channel on the base case. */}
        <MoneyValue paisa={totalPaisa} size="hero" />
      </div>
    </section>
  );
};
