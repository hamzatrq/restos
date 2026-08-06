// The first test in this app that RENDERS the counter screen.
//
// `src/main/` had acceptance coverage and `src/renderer/Counter.tsx` — the surface an operator
// actually touches — had none, so every claim about what the screen DOES was a claim about
// source text. These assert what a cashier would experience, through the real bridge shape.
//
// Scope: `C4` (start an order, `02-F1`) and `C9` (send it to the kitchen, `02-F8`/`03-F2`).
// `C5` (add a line) is deliberately absent — it needs `unit_price_paisa` and the catalog carries
// no price until `01-F60` reaches the wire and the store. What IS asserted about the grid here
// is the refusal, which is the half of `C5` that exists today.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * `usePhysicalSize` measures through a `ResizeObserver`, and happy-dom has no layout — every
 * rect is zero, so `gridMm` would stay null and the grid would never render at all.
 *
 * Stubbing the observer with a fixed panel is honest here rather than a shortcut: the physical
 * measurement is `packages/ui`'s concern and is pinned by its own `layout-physical.oracle`
 * suite against `27-F11c`. What THIS file tests is the counter's wiring, and it needs a grid on
 * screen to test the refusal at all. The size named is the `27 §1a` reference counter panel.
 */
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
  businessDay: "2026-07-29",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  // `02-F18`/`01-F26` — the counter is only reachable on an UNLOCKED device, so this fixture
  // names the session it has always implied. Required by `DeviceState` since S-0c; the value
  // matches `actor` above and nothing in this file reads it.
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [
  { id: "item-karahi", label: "Karahi" },
  { id: "item-biryani", label: "Biryani" },
];

const openOrder = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  order_id: "order-1",
  reference: "order-1",
  total_paisa: 0,
  paid_paisa: 0,
  lines: [],
  ...over,
});

/** Every append the screen makes, in order, so a test can assert what was NOT sent too. */
let appended: AppendRequest[];
/**
 * Every `addLine` the screen makes. Tracked SEPARATELY from `appended` because they are
 * different channels, and the distinction is the point of `C5`'s design: `addLine` carries no
 * money and `append` would have. A harness that folded them together could not tell a line added
 * through the trusted path from one the renderer priced itself.
 */
let lines: AddLineRequest[];

const mountWith = (orders: OpenOrder[], overrides: Partial<{ addLineThrows: string }> = {}) => {
  appended = [];
  lines = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => orders),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      // 01-F60 — main refuses an unpriced item, so the renderer must survive a rejected addLine
      // without taking the till down (01-F17). Simulated here because the refusal lives in main.
      if (overrides.addLineThrows !== undefined) throw new Error(overrides.addLineThrows);
      return { id: `evt-line-${lines.length}` };
    }),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

describe("the tab rail is screen-map §3.1's five surfaces (27-F4)", () => {
  it("carries all five, in order, and none is absent because it is unbuilt", async () => {
    // 27-F4 makes adding, removing or reordering an operational item a BREAKING CHANGE, so the
    // rail has to be complete before an operator learns it — an unbuilt surface is DISABLED IN
    // PLACE with its reason, never missing. This shipped with four tabs and no `Me`; pinning the
    // set here is what stops the next unbuilt surface being added the cheap way instead.
    mountWith([]);
    render(<Counter />);
    await screen.findByText("Order", { exact: true });
    // Exact text, not an accessible-name regex: an unbuilt tab folds its reason into the name, so
    // `/^Orders$/` misses it — and an unanchored `/Order/` matches `Orders` too, which would let
    // a missing tab pass. The label's own text node is the unambiguous thing.
    for (const label of ["Order", "Orders", "Pay", "Cash", "Me"]) {
      expect(
        screen.getAllByText(label, { exact: true }).length,
        `screen-map §3.1 names a ${label} tab`,
      ).toBeGreaterThan(0);
    }
  });

  it("every unavailable tab says WHY, and no tab is both reachable and unavailable", async () => {
    // This was `getAllByText(/not built yet/i).length === 4` — a snapshot of a SHRINKING set,
    // and it went red the day `Cash` and `Me` shipped. The count was never the law. `27-F4`
    // says an unbuilt surface is **disabled in place WITH ITS REASON**, never missing: what
    // makes a dead tab survivable for an operator who cannot read the rest of the screen for
    // context is the reason, not how many of them there are. Pinning the number also put this
    // file in direct contradiction with `cash-tab.dom.test.tsx`'s "the Cash tab stops being
    // 'not built yet'" — two oracles that could not both be satisfied.
    //
    // So it is expressed as the property instead, in both directions. It still fails on a tab
    // disabled with no reason (mutation-checked), and it cannot go stale as surfaces ship: the
    // day the last one lands, the first half is vacuously true and the second half — every
    // reachable tab actually arrives somewhere — is doing all five tabs' worth of work.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Order$/i });

    const rail = () =>
      within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("button");
    // The label is the tab's first text node; a badge is digits (`27-F25`). Whatever is LEFT is
    // the reason, which is why this reads the remainder rather than matching "not built yet" —
    // a different wording is still a reason, and a missing one is still a dead end.
    const parts = (tab: Element) => {
      const label = tab.querySelector("span")?.textContent ?? "";
      return {
        label,
        reason: (tab.textContent ?? "").slice(label.length).replace(/\d+/g, "").trim(),
      };
    };

    expect(rail().length, "the rail rendered no tabs at all").toBeGreaterThan(0);
    for (const tab of rail()) {
      const { label, reason } = parts(tab);
      if ((tab as HTMLButtonElement).disabled) {
        expect(reason, `27-F4 — the ${label} tab is unavailable and gives no reason`).not.toBe("");
      } else {
        expect(reason, `the ${label} tab is reachable but carries an unavailable reason`).toBe("");
      }
    }

    // The other half of `27-F4`'s bargain, and the half a reason-only check cannot see: the mark
    // has to MEAN something. A tab that is greyed with a reason and still navigates is a lie
    // about what is built; a tab that looks live and goes nowhere is the dead end the FR names.
    const currentIndex = () => rail().findIndex((b) => b.getAttribute("aria-current") === "page");
    for (let i = 0; i < rail().length; i++) {
      const before = currentIndex();
      const { label } = parts(rail()[i] as Element);
      const unavailable = (rail()[i] as HTMLButtonElement).disabled;
      fireEvent.click(rail()[i] as Element);
      await waitFor(() =>
        expect(
          currentIndex(),
          unavailable
            ? `the ${label} tab is marked unavailable and still went somewhere`
            : `the ${label} tab is available and went nowhere`,
        ).toBe(unavailable ? before : i),
      );
    }
  });
});

describe("C4 — starting an order (02-F1, founder ruling: no default type)", () => {
  it("offers all three order types and NONE is pre-selected", async () => {
    mountWith([]);
    render(<Counter />);
    for (const label of ["Dine-in", "Takeaway", "Delivery"]) {
      expect(await screen.findByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
    // The load-bearing half: nothing was appended merely by rendering. A pre-selected type is
    // only wrong if it can become an order without a deliberate act, and this is that assertion.
    expect(appended).toHaveLength(0);
  });

  it("appends order.created carrying the chosen type AND the counter channel", async () => {
    mountWith([]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Takeaway/i }));

    await waitFor(() => expect(appended).toHaveLength(1));
    const [req] = appended;
    expect(req?.type).toBe("order.created");
    expect(req?.payload.order_type).toBe("takeaway");
    // 02-F42 — `channel` is a price key (01-F60), so the counter naming itself is money-bearing
    // and not decoration. A till that shipped `dine_in` here would price against a channel that
    // does not exist, which is the Wave-0 fixture drift this FR closes.
    expect(req?.payload.channel).toBe("counter");
    expect(typeof req?.payload.order_id).toBe("string");
  });

  it("the type row HOLDS ITS POSITION once an order is open — greyed with a reason, never removed", async () => {
    mountWith([openOrder()]);
    render(<Counter />);
    // 27-F4: a surface that vanishes when a condition changes destroys the positional memory of
    // an operator who cannot read. All three must still be findable, and say why they are inert.
    for (const label of ["Dine-in", "Takeaway", "Delivery"]) {
      expect(await screen.findByRole("button", { name: new RegExp(label, "i") })).toBeTruthy();
    }
    expect(screen.getAllByText(/order in progress/i).length).toBeGreaterThan(0);
  });
});

describe("C9 — sending it to the kitchen (02-F8, 03-F2)", () => {
  it("appends order.confirmed for the open order, in ONE tap", async () => {
    mountWith([openOrder({ order_id: "order-42" })]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.confirmed");
    expect(appended[0]?.payload.order_id).toBe("order-42");
  });

  it("refuses to confirm when no order exists, and says why", async () => {
    mountWith([]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));

    // `Tile` fires `onPress` even when unavailable — that is `01-F59`'s law, not an oversight —
    // so "greyed" alone would not have prevented an orphan `order.confirmed` naming no order.
    // The refusal has to be in the handler, and this asserts it is.
    await waitFor(() => expect(screen.getByText(/no order started/i)).toBeTruthy());
    expect(appended).toHaveLength(0);
  });
});

describe("the grid before an order exists (founder ruling §3.6)", () => {
  it("shows every item with the reason it cannot be added, rather than emptying", async () => {
    mountWith([]);
    render(<Counter />);
    // Not emptied: 27-F4 again. The tile an operator reaches for by position is still there.
    expect(await screen.findByRole("button", { name: /Karahi/i })).toBeTruthy();
    expect(screen.getAllByText(/choose an order type first/i).length).toBeGreaterThan(0);
  });

  it("C5: tapping an item with no order open adds NOTHING — no line, no append", async () => {
    // This was a labelled tripwire while `C5` was unbuilt, and it is load-bearing now.
    // `Tile` fires `onPress` even when unavailable (`01-F59` — greyed is not disabled), so the
    // greying above cannot refuse the tap. Without the handler's guard this appends an
    // `order.line_added` naming an `order_id` that does not exist, which `01-F1` makes
    // unremovable. Mutation-checked: deleting the guard fails this.
    mountWith([]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Karahi/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/choose an order type first/i).length).toBeGreaterThan(0),
    );
    expect(lines).toHaveLength(0);
    expect(appended).toHaveLength(0);
  });
});

describe("C5 — adding a line (01-F60, 01-F53)", () => {
  it("ONE tap adds the item to the open order, at quantity 1", async () => {
    mountWith([openOrder({ order_id: "order-7" })]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Karahi/i }));

    await waitFor(() => expect(lines).toHaveLength(1));
    expect(lines[0]).toEqual({ order_id: "order-7", item_id: "item-karahi", qty: 1 });
  });

  it("NO MONEY crosses the seam — the renderer names an item, never a price", async () => {
    // The load-bearing assertion of C5's whole design. `01-F60` resolves the price from the
    // device's branch and the ORDER's channel, both of which live in main; `shared/ipc.ts` calls
    // the renderer "the untrusted end of this bridge", and `fc2f69f` made that concrete when a
    // remote origin held it. A renderer that could send a price could send zero.
    mountWith([openOrder({ order_id: "order-7" })]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Biryani/i }));

    await waitFor(() => expect(lines).toHaveLength(1));
    const keys = Object.keys(lines[0] ?? {}).sort();
    expect(keys).toEqual(["item_id", "order_id", "qty"]);
    const money = keys.filter((k) => /price|paisa|amount|total|cost/i.test(k));
    expect(money, "the renderer sent a money field").toEqual([]);
    // And it goes through `addLine`, never the generic append — which is what makes the above
    // structural rather than incidental. `append` cannot be given a price it did not carry.
    expect(appended).toHaveLength(0);
  });

  it("a REFUSED line does not take the till down (01-F17, 01-F60)", async () => {
    // Main refuses an unpriced item. `01-F60`: selling requires a number and inventing one is
    // worse than refusing — but `01-F17` means the SALE is not blocked, only this item, so the
    // screen must survive the rejection and still be usable. React 19 unmounts the root on a
    // render throw, so an unhandled rejection here would blank a counter mid-service.
    mountWith([openOrder({ order_id: "order-7" })], { addLineThrows: "no price for counter" });
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Karahi/i }));

    await waitFor(() => expect(lines).toHaveLength(1));
    // The rest of the counter is still there and still working.
    expect(await screen.findByRole("button", { name: /Send to kitchen/i })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Biryani/i }));
    await waitFor(() => expect(lines).toHaveLength(2));
  });
});
