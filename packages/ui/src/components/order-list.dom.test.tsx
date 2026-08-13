// `OrderList` — the counter's recall + cloud-inbox list (`02-F9`, `02-F10`, `03-F46`).
//
// Written against the round-3 law: every assertion below is pointed at the case that can
// actually go wrong, not at the mechanism. The three that matter most, and the mutant each
// exists to kill:
//
//   * a list that SORTS its rows (`03-F46` — page 1 holds the oldest, and the caller's order
//     is the contract; a renderer-side sort re-ranks a learned list, `27-F4`);
//   * a row action that fires with the FIRST row's id instead of its own (invisible to any
//     single-row fixture, which is why every action test here uses three rows and presses the
//     LAST one);
//   * a page capacity that is a hardcoded row count rather than derived from the measured
//     surface (`27-F2`/`27-F11c`) — checked by rendering the SAME rows at two heights and
//     requiring the count to differ.
//
// Data is varied per row on purpose (`totalPaisa`, `channel`, `orderType`, `lineCount` all
// differ): a suite that renders three identical rows cannot tell an implementation that reads
// each row from one that renders the first row three times.

import { paisa } from "@restos/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { targetFor } from "../tokens/index";
import { OrderList, type OrderRow, orderPageRows } from "./OrderList";

afterEach(cleanup);

const row = (over: Partial<OrderRow> & { order_id: string }): OrderRow => ({
  reference: over.order_id,
  channel: "counter",
  orderType: "dine_in",
  totalPaisa: paisa(10_000),
  lineCount: 1,
  ...over,
});

/** Three rows, every field different, oldest first. */
const THREE: readonly OrderRow[] = [
  row({ order_id: "oldest", totalPaisa: paisa(11_100), channel: "storefront", lineCount: 2 }),
  row({
    order_id: "middle",
    totalPaisa: paisa(22_200),
    channel: "whatsapp",
    orderType: "takeaway",
  }),
  row({ order_id: "newest", totalPaisa: paisa(33_300), channel: "phone", orderType: "delivery" }),
];

const list = (over: Partial<Parameters<typeof OrderList>[0]> = {}) =>
  render(
    <ThemeProvider>
      <OrderList
        orders={THREE}
        heightMm={200}
        page={0}
        onPageChange={() => {}}
        empty="Nothing here."
        {...over}
      />
    </ThemeProvider>,
  );

describe("00 §5.7 — the resting state is SAID, never a blank box", () => {
  it("renders the caller's own empty sentence when there is nothing", () => {
    // Pointed at the dangerous case: not "something rendered", but THIS sentence. An
    // implementation with a hardcoded "No orders" passes a presence check and fails this.
    list({ orders: [], empty: "No new orders from the website or WhatsApp." });
    expect(screen.getByText("No new orders from the website or WhatsApp.")).toBeTruthy();
  });

  it("draws no row and no action when empty, even with an action configured", () => {
    list({ orders: [], action: { label: "Accept", onAct: () => {} } });
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });
});

describe("03-F46 — chronological, and page 1 holds the OLDEST", () => {
  it("renders the caller's order verbatim and never sorts", () => {
    // The mutant this kills: `[...orders].sort(...)` by any key. Every sortable field here
    // (reference, channel, orderType, total) disagrees with the caller's order, so a sort on
    // ANY of them reorders the DOM and fails this.
    list();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("oldest")).toBeLessThan(text.indexOf("middle"));
    expect(text.indexOf("middle")).toBeLessThan(text.indexOf("newest"));
  });

  it("puts the oldest on page 1 when the list pages", () => {
    // 20mm holds exactly one 12.065mm counter row (+ a 1.27mm gap), so page 1 is the oldest
    // and nothing else — which is the half of `03-F46` that matters: the work is on page 1.
    list({ heightMm: 20 });
    expect(screen.getByText("oldest")).toBeTruthy();
    expect(screen.queryByText("newest")).toBeNull();
  });

  it("pages laterally rather than scrolling — later pages reach the rest", () => {
    list({ heightMm: 20, page: 2 });
    expect(screen.getByText("newest")).toBeTruthy();
    expect(screen.queryByText("oldest")).toBeNull();
  });

  it("reports the page the operator asked for", () => {
    const onPageChange = vi.fn();
    list({ heightMm: 20, onPageChange });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("shows no pager when everything fits — a control that does nothing is worse than none", () => {
    list({ heightMm: 200 });
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  });
});

describe("27-F2 / 27-F11c — capacity is MEASURED, never a hardcoded row count", () => {
  it("fits more rows on a taller surface", () => {
    // The mutant: `const perPage = 5`. It survives any single-height test, which is why this
    // renders the same list at two heights and requires the answers to differ.
    expect(orderPageRows({ heightMm: 200 })).toBeGreaterThan(orderPageRows({ heightMm: 20 }));
  });

  it("still owes the operator one row on a surface too small for one", () => {
    // Returning 0 would page forever over a list nobody can reach.
    expect(orderPageRows({ heightMm: 1 })).toBe(1);
  });

  it("refuses a row shorter than the counter posture minimum (27-F8)", () => {
    expect(() => orderPageRows({ heightMm: 200, rowMm: 4 })).toThrow(RangeError);
  });
});

describe("02-F9 — the inbox action is ONE TAP, and it acts on ITS OWN row", () => {
  it("fires with the pressed row's id, not the first row's", () => {
    // THE assertion this file exists for. `onAct(orders[0].order_id)` — a plausible
    // implementation, and the one a single-row fixture blesses — passes every other test in
    // this suite and fails only here, because the LAST row is the one pressed.
    const onAct = vi.fn();
    list({ action: { label: "Accept", onAct } });
    const buttons = screen.getAllByRole("button", { name: "Accept" });
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[2] as HTMLElement);
    expect(onAct).toHaveBeenCalledWith("newest");
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("gives the row enough height to CONTAIN the action tile (27-F8)", () => {
    // ⚠ ADDED AFTER LAUNCHING. `Tile` is 76 CSS px; the default row was `targetMm("counter")`
    // = 12.065 mm, which renders as 45 px — so on the real counter the Accept tiles overflowed
    // their cards and consecutive rows overlapped. happy-dom lays nothing out and could not see
    // it, so this asserts the STYLE the layout rests on, exactly as `counter.dom.test.tsx`
    // does for the surfaces whose pixel claim is verified by launching.
    list({ action: { label: "Accept", onAct: () => {} } });
    const article = document.querySelector("article") as HTMLElement;
    expect(Number.parseInt(article.style.minHeight, 10)).toBeGreaterThanOrEqual(
      targetFor("counter"),
    );
  });

  it("leaves a read-only row at its own height — the floor is the ACTION's, not decoration", () => {
    // The control: with no action there is no tile to contain, so the row stays at the physical
    // height the caller asked for. A floor applied unconditionally would silently change every
    // read-only list's capacity, which is the mutant this separates.
    //
    // ⚠ REWRITTEN August 2026, and the reason is a RATIFIED FOUNDER RULING rather than a
    // convenience — `DEC-UI-001` / `27-F68`, carried back into the suite the day it landed
    // (`AGENTS.md`: "when a ruling lands, grep the suites that encode the old rule").
    //
    // This read `minHeight < targetFor("counter")` and it passed for one reason only: the
    // package had TWO conversions for one posture. `targetFor("counter")` was spent as 76 CSS px
    // while `targetMm("counter")`'s 12 mm rendered as 45 px at the CSS reference density — the
    // dp-as-px / dp-as-mm duality `OrderList` itself carried as a written finding. `27-F68` makes
    // a dp 1/160 inch of PHYSICAL size, so 76 dp and 12 mm are now ONE size (12.065 vs 12.0 mm,
    // 76 px against 75.6 px rounded) and the old assertion is unsatisfiable by any correct
    // implementation. Measured: both rows render at 76.
    //
    // So the mutant the original comment names — an unconditionally applied floor — is now
    // genuinely UNOBSERVABLE: `orderPageRows` throws below `targetMm("counter")` = 12 mm and the
    // floor IS 12.065 mm, so it can only change an outcome inside a 0.065 mm window. That is
    // reported rather than papered over. What is asserted instead still bites, on the property
    // the title always claimed: the row is the height the CALLER asked for. An implementation
    // that ignored `rowMm`, or raised a read-only row to anything else, dies here.
    list({ rowMm: 20 });
    const article = document.querySelector("article") as HTMLElement;
    // 20 mm at 160 dp/inch (27-F68's density) = 126 dp, and 126 is `27-F8`'s keypad target
    // precisely because 20 mm is what that posture measures — the same arithmetic, checked from
    // the other end.
    expect(Number.parseInt(article.style.minHeight, 10)).toBe(targetFor("keypad"));
    expect(Number.parseInt(article.style.minHeight, 10)).toBeGreaterThan(targetFor("counter"));
  });

  it("renders the caller's label, so a screen can say what the tap DOES", () => {
    list({ action: { label: "Accept", onAct: () => {} } });
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(3);
  });
});

describe("02-F10 / 02-F33 — with no action the list is READ-ONLY", () => {
  it("renders no per-row control at all", () => {
    // `02-F33`: "otherwise the panel is read-only for states". A list that drew a disabled
    // control would still be claiming the act exists, which is the opposite of read-only.
    list();
    // The pager is the only legitimate button, and at this height there is not even one.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("27-F24 / 27-F25 — every row carries its OWN finished number", () => {
  it("renders each row's own total, not the first row's repeated", () => {
    // K-4's failure shape, guarded: three DIFFERENT totals, all asserted. An implementation
    // reading `orders[0].totalPaisa` for every row renders "Rs 111" three times and fails.
    list();
    expect(screen.getByText("Rs 111")).toBeTruthy();
    expect(screen.getByText("Rs 222")).toBeTruthy();
    expect(screen.getByText("Rs 333")).toBeTruthy();
  });

  it("shows each row's own channel and order type — the two axes 02-F1 keeps separate", () => {
    list();
    expect(screen.getByText(/storefront · dine_in · 2 items/)).toBeTruthy();
    expect(screen.getByText(/whatsapp · takeaway · 1 item/)).toBeTruthy();
    expect(screen.getByText(/phone · delivery · 1 item/)).toBeTruthy();
  });

  it("renders a null order type as ABSENT rather than defaulting one (02-F1)", () => {
    // `02-F1` forbids inferring the type later. A screen printing "dine-in" for an unknown
    // type would be inferring it in the one place an operator would believe it.
    list({ orders: [row({ order_id: "untyped", orderType: null, channel: "foodpanda" })] });
    expect(screen.getByText(/^foodpanda · 1 item$/)).toBeTruthy();
  });
});
