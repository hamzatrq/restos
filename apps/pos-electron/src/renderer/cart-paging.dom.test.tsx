// `27-F2` — THE CART'S PAGER REACHES THE LINES IT DRAWS A NUMBER FOR.
//
// PROVENANCE: written by the mutation session for `w6/counter-ux`, which wrote none of the
// production code under test. It is not an acceptance oracle for an FR that was owed — it is the
// hand-written assertion three surviving mutants proved was missing.
//
// ── ⚠ THIS FILE EXISTS BECAUSE THREE MUTANTS SURVIVED EVERY RAIL IN THE REPO ────────────────
//
// `27-F4` (f) pins `Send to kitchen` to the foot of the cart column, and `27-F2` forbids reaching
// a primary action by scrolling — so `Cart` yields LINES instead, paging them the way `ItemGrid`
// and `OrderList` already page. That yielding is new, it is the mechanism the whole pin rests on,
// and when it landed **nothing in this repo could see it working or not working**:
//
//   * `packages/ui` ships no test for `Cart` at all (`OrderList` has one — `order-list.dom.test
//     .tsx:104` asserts `onPageChange` is called with the page pressed — so the idiom existed and
//     was not applied one component over);
//   * every `.dom.test.tsx` runs under happy-dom, where `scrollHeight` and `clientHeight` are
//     both `0`, so `useLinesThatFit` never shrinks, `pages` is always 1 and **the pager cannot
//     render in any renderer test in this repo**;
//   * `pnpm layout:check` opens a real Blink window and MEASURES, but it never PRESSES a control.
//
// Measured, on this branch, with a plausible break in each of the three directions:
//
//   * `onPageChange={() => {}}` in `Counter.tsx` (the pager drawn, wired to nothing):
//     **969/969 pos-electron green, `layout:check` at its documented 1 violation, `seams:check`
//     clean.** On the layout gate's own eleven-line family order the cart pages **three** ways at
//     `tablet-10.1` and `netbook-1024` (29 → 32 controls), so two thirds of a cashier's bill were
//     unreachable with every gate green.
//   * the fit loop measuring and never yielding (`setPerPage(perPage)`): **1307 tests green**,
//     caught only by `layout:check`, 1 → 12 violations.
//   * the fit loop yielding when nothing overflows: `packages/ui` **338/338 green**.
//
// ── WHY THE OVERFLOW IS STUBBED, AND WHAT THAT DOES AND DOES NOT BUY ────────────────────────
//
// The shrink is driven by a real Blink measurement that happy-dom cannot produce, so this file
// supplies the one fact the environment is missing — the cart's line box overflows — and asserts
// what the product does ABOUT it. That is the whole of the stub: no page count is fixed here, no
// millimetre is claimed, and **`27-F2`'s "it fits on the glass" half stays owed to
// `layout:check`**, which is the only rail that can see it. Reading this file as coverage of the
// pin is the mistake `AGENTS.md` has recorded nine times.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom lays nothing out, so `usePhysicalSize` needs a panel or no grid ever renders. */
const REFERENCE_PANEL = { width: 1366, height: 768 };
class StubResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL as DOMRectReadOnly } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const DEVICE: DeviceState = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-13",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** A family order, in the shape the layout gate's own fixture uses. */
const NAMES = ["Chicken Karahi", "Mutton Biryani", "Garlic Naan", "Kheer"] as const;
/** Named rather than indexed, so the assertions read as "the first line" and "the last one". */
const FIRST_LINE = NAMES[0];
const LAST_LINE = NAMES[3];

const ORDER: OpenOrder = {
  order_id: "order-1",
  reference: "A-1",
  total_paisa: 101_000,
  paid_paisa: 0,
  lines: NAMES.map((name, i) => ({
    line_id: `l-${i + 1}`,
    name,
    quantity: 1,
    modifiers: [],
    removals: [],
    note: null,
  })),
};

let appended: AppendRequest[];
let lines: AddLineRequest[];

const mount = () => {
  appended = [];
  lines = [];
  Object.defineProperty(window, "restos", {
    configurable: true,
    writable: true,
    value: {
      deviceState: vi.fn(async () => DEVICE),
      openOrders: vi.fn(async () => [ORDER]),
      kitchenQueue: vi.fn(async () => []),
      menu: vi.fn(async () => MENU),
      append: vi.fn(async (req: AppendRequest) => {
        appended.push(req);
        return { id: `evt-${appended.length}` };
      }),
      addLine: vi.fn(async (req: AddLineRequest) => {
        lines.push(req);
        return { id: `evt-line-${lines.length}` };
      }),
      toggleAvailability: vi.fn(async () => ({ id: "evt-86" })),
      onChanged: vi.fn(() => () => {}),
    },
  });
};

/**
 * The one fact happy-dom cannot supply: the cart's line box does not fit its column.
 *
 * Scoped to that box by its PARENT — the cart section's `aria-label` — rather than applied to
 * every element, so nothing else on the counter is told it overflows. `clientHeight` stays at
 * happy-dom's `0`, which is what makes `scrollHeight > clientHeight + 1` true.
 */
const overflowTheCart = (): (() => void) => {
  const proto = window.HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "scrollHeight");
  Object.defineProperty(proto, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      return this.parentElement?.getAttribute("aria-label") === "Current order" ? 9_999 : 0;
    },
  });
  return () => {
    if (original === undefined) delete (proto as unknown as Record<string, unknown>).scrollHeight;
    else Object.defineProperty(proto, "scrollHeight", original);
  };
};

let restoreOverflow: (() => void) | null = null;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(() => {
  restoreOverflow?.();
  restoreOverflow = null;
});

/** The pager buttons of the CART, never the grid's or the orders list's. */
const cartPager = (): HTMLElement[] => {
  const section = document.querySelector('section[aria-label="Current order"]');
  if (section === null) throw new Error("EMPTY MATCH (24-F14): the cart is not on the screen");
  return Array.from(section.querySelectorAll("button")).filter((b) =>
    /^\d+$/.test((b.textContent ?? "").trim()),
  );
};

const lineIsShown = (name: string): boolean =>
  screen.queryAllByText(new RegExp(name, "i")).length > 0;

describe("27-F2 — a cart that gave up lines can still be read", () => {
  it("draws a pager when the lines do not fit, and it is the CART's own", async () => {
    // Aimed at the fit loop that measures and never yields (`setPerPage(perPage)`), which was
    // green across all 1307 tests: with no shrink there is no page 2, so there is no pager, and
    // the lines that do not fit are simply behind `overflow: hidden` with nothing able to reach
    // them — `Cart`'s own header calls that "the exact hazard `ItemGrid` records at length".
    restoreOverflow = overflowTheCart();
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /Send to kitchen/i });

    await waitFor(() =>
      expect(
        cartPager().length,
        "27-F2 BROKEN: the cart's line box overflows and no pager was drawn. `27-F2` forbids " +
          "reaching content by scrolling, so a line the box cannot hold is a line the cashier " +
          "cannot see at all — and this cart is her working memory of what the customer ordered.",
      ).toBeGreaterThan(1),
    );
    // The first line is on page 1 and the last one is not: the list really did yield.
    expect(lineIsShown(FIRST_LINE)).toBe(true);
    expect(lineIsShown(LAST_LINE)).toBe(false);
  });

  it("REACHES the later lines when the operator presses the page number", async () => {
    /**
     * **THE ASSERTION THIS FILE EXISTS FOR.** Aimed at `Counter.tsx`'s
     * `onPageChange={setCartPage}`: rewired to `() => {}` the pager still draws, still marks
     * page 1 current, still takes the press — and 969 pos-electron tests, `pnpm layout:check`
     * and `pnpm seams:check` were all green while two thirds of an eleven-line bill were
     * unreachable on `tablet-10.1`.
     *
     * It asserts the LINE, not a spy. A spy would pass against a host that called
     * `setCartPage` and then clamped it away, and `27-F5`'s complaint about the shipped pager
     * is about what the operator gets, not about what a callback saw.
     */
    restoreOverflow = overflowTheCart();
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /Send to kitchen/i });
    await waitFor(() => expect(cartPager().length).toBeGreaterThan(1));

    const last = cartPager().at(-1);
    if (last === undefined) throw new Error("EMPTY MATCH (24-F14): the cart drew no pager");
    fireEvent.click(last);

    await waitFor(() =>
      expect(
        lineIsShown(LAST_LINE),
        "27-F2 BROKEN: the cart drew a page number the operator cannot reach. A control that " +
          "does nothing is worse than no control (`27-F5`), and the thing behind it is the " +
          "customer's own order.",
      ).toBe(true),
    );
    expect(lineIsShown(FIRST_LINE)).toBe(false);
    // The move is a READ. `01-F1` — turning a page appends nothing and adds no line.
    expect(appended).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("keeps the TOTAL out of the paged region — it is on every page (27-F25)", async () => {
    // `Cart`'s header: *"the TOTAL is never what gives way ... it is the operational payload and
    // the number the cashier reads aloud."* A pager that took the total with it would satisfy
    // both assertions above and lose the one number on the surface she certainly uses.
    restoreOverflow = overflowTheCart();
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /Send to kitchen/i });
    await waitFor(() => expect(cartPager().length).toBeGreaterThan(1));

    for (const page of cartPager()) {
      fireEvent.click(page);
      await waitFor(() => expect(screen.getAllByText("Rs 1,010").length).toBeGreaterThan(0));
      expect(screen.getAllByText("TOTAL").length).toBe(1);
    }
  });
});

describe("27-F2 — and a cart that FITS gives nothing up", () => {
  it("draws no pager and shows every line (the opposite failure)", async () => {
    /**
     * The negative control, and the other direction the guard can fail in. An implementation
     * that yields a line whenever it is asked — `if (perPage > 1) setPerPage(perPage - 1)` —
     * honours `27-F2` (nothing is hidden) and `27-F4` (f) (the control never moves) and leaves
     * `packages/ui` **338/338 green**, while showing a cashier one line at a time of an order
     * she is reading back to a customer.
     *
     * No stub here: happy-dom's zeroes ARE "everything fits", which is why this half needs no
     * help from the environment.
     */
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /Send to kitchen/i });

    for (const name of NAMES) {
      expect(
        lineIsShown(name),
        `27-F2: '${name}' fits and was paged away anyway. The cart yields room only when the ` +
          "room is not there; a list that pages when it fits has spent 27-F2's own remedy on a " +
          "problem it does not have.",
      ).toBe(true);
    }
    expect(cartPager()).toEqual([]);
  });
});
