/**
 * ACCEPTANCE TESTS — **the counter FORWARDS the charge breakdown to the cart** (`16-F5`,
 * `02-F63` (b), `27-F24`).
 *
 * Written alongside the implementation under `20 §4.3`'s R66 amendment; the renderer computes no
 * money and writes no event. Mutation matrix in the session report.
 *
 * ## Why this file is separate from the two suites either side of it
 *
 * `packages/ui`'s `cart-breakdown.dom.test.tsx` proves the COMPONENT renders `Subtotal` / `Tax` /
 * `Rounded up|down` given the props. `main/__acceptance__/cart-breakdown-seam.test.ts` proves the
 * GATEWAY puts them on the IPC payload. **Both stay green against a `Counter.tsx` that drops them
 * between the two**, which is this wave's named recurring defect in its purest form — and this
 * repo has shipped it on this very component twice: `Cart` declared `onRemove` and the call site
 * never passed it, then declared `billedPaisa` and the call site never passed it. Each time every
 * renderer test was green.
 *
 * So the assertion here is deliberately end-to-end through the screen: stub the bridge with a
 * payload the shipped gateway can produce, render `Counter`, and read the cart.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
import { Counter } from "./Counter";

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
  businessDay: "2026-08-23",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/**
 * The order the defect was measured on: three whole-rupee lines totalling **Rs 853** under a
 * **`TOTAL Rs 989`** — posture `exclusive` at 16 %, which is what the end-to-end run used. Every
 * figure here is one the shipped gateway produces for these lines; nothing is invented.
 */
const ORDER: OpenOrder = {
  order_id: "order-1",
  reference: "A-014",
  total_paisa: 98_900,
  paid_paisa: 0,
  channel: "counter",
  charge_tax: { subtotal_paisa: 85_300, tax_total_paisa: 13_648 },
  lines: [
    {
      line_id: "l1",
      name: "Karahi",
      quantity: 1,
      modifiers: [],
      removals: [],
      note: null,
      billed_paisa: 44_900,
    },
    {
      line_id: "l2",
      name: "Biryani",
      quantity: 1,
      modifiers: [],
      removals: [],
      note: null,
      billed_paisa: 32_500,
    },
    {
      line_id: "l3",
      name: "Naan",
      quantity: 1,
      modifiers: [],
      removals: [],
      note: null,
      billed_paisa: 7_900,
    },
  ],
};

const mount = (orders: OpenOrder[] = [ORDER]) => {
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => orders),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async () => ({ id: "evt-1" })),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
/**
 * ⚠ **NOT OPTIONAL HERE, AND IT COST A RED RUN.** Without it every `render` leaves its tree in the
 * document, so `findByRole("region")` returns the FIRST cart ever mounted — the previous test's —
 * and the two negative cases below assert against a surface they did not build. That is a test
 * red against a correct implementation, which `AGENTS.md`'s round-3 law rates as damaging as a
 * vacuous one.
 */
afterEach(cleanup);

/** Scoped, because the menu grid renders a tile named `Karahi` too. */
const cart = async (): Promise<HTMLElement> =>
  await screen.findByRole("region", { name: /current order/i });

describe("the charge breakdown reaches the glass", () => {
  it("names the Rs 136 that stood between the rows and the total", async () => {
    mount();
    render(<Counter />);
    const region = await cart();
    // MUTANT THIS KILLS: `Counter.tsx` not spreading `tax` onto `<Cart>`. `packages/ui` stays
    // green (the component is correct), the gateway suite stays green (the payload is correct),
    // `pnpm verify` and `seams:check` stay clean — and the cashier is back to Rs 853 under
    // `TOTAL Rs 989` with nothing on the surface explaining the difference.
    expect(within(region).getByText("Subtotal")).toBeTruthy();
    expect(within(region).getByText("Tax")).toBeTruthy();
    expect(within(region).getByText("Rs 853")).toBeTruthy();
    expect(within(region).getByText("Rs 136")).toBeTruthy();
    expect(within(region).getByText("Rs 989")).toBeTruthy();
  });

  it("forwards 02-F63's adjustment with its WORD, not a sign (27-F12)", async () => {
    mount([
      {
        ...ORDER,
        // A Rs 10 step under posture `none`: Rs 853 of rows charged as Rs 850. No tax anywhere.
        total_paisa: 85_000,
        charge_tax: undefined,
        charge_rounding: { magnitude_paisa: 300, direction: "down" },
      },
    ]);
    render(<Counter />);
    const region = await cart();
    expect(within(region).getByText("Rounded down")).toBeTruthy();
    expect(within(region).getByText("Rs 3").textContent).toBe("Rs 3");
    // …and no tax rows, because this host said there is no tax to name.
    expect(within(region).queryByText("Subtotal")).toBeNull();
  });

  it("a host that says nothing gets the cart it had before this existed", async () => {
    // `01-F54`'s degrade, asserted rather than assumed: the optional fields absent must leave the
    // surface intact rather than rendering a blank row or a `Rs 0`.
    mount([{ ...ORDER, total_paisa: 85_300, charge_tax: undefined }]);
    render(<Counter />);
    const region = await cart();
    expect(within(region).queryByText("Subtotal")).toBeNull();
    expect(within(region).queryByText("Rounded up")).toBeNull();
    expect(within(region).queryByText("Rounded down")).toBeNull();
    expect(within(region).getByText("Rs 853")).toBeTruthy();
  });
});
