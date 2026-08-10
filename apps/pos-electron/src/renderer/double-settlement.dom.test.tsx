// `DEC-MONEY-009` ON THE GLASS — what a cashier sees, and how she starts the second order.
//
// PROVENANCE (`24 §3` step 2): authored and implemented by the same session, mitigated by the
// round-3 law rather than by a claim of independence. Every assertion here was mutation-tested
// against a CONTROL differing in exactly one branch; the matrix is in the session's final message.
//
// This file covers the RENDERER half of `DEC-MONEY-009`. The refusal itself is main's and is
// asserted in `main/__acceptance__/double-settlement.test.ts` against a real store and the real
// `shift_cash` fold — including §A's reproduction of the Rs 4,480 drawer and §F's statement that
// the PARTITION case is still open. Nothing here may be read as closing the defect.
//
// The FRs this file is written from:
//   DEC-MONEY-009  "refuse the second settlement at the till … a LOCAL decision against the
//                  device's own converged fold" — and the contributing defect it names by name:
//                  "`Counter.tsx` binds `current = orders[0]`, so there is no way to start a
//                  second order. Two cashiers serving two customers ring into one bill."
//   02-F1          "every order carries `order_type` + `channel` from creation … neither is ever
//                  inferred later." Nothing in it limits a terminal to one open order.
//   02-F11         "an order started on one terminal can be parked there and resumed, extended,
//                  or settled on another" — which is WHY `orders` is a branch-wide list, and why
//                  `orders[0]` is not this till's cart.
//   00 §5.7        a surface reports what is true.
//   27-F5          no context-dependent or invisible controls; every action has a persistent,
//                  visible, labelled target.
//   27-F12         colour never carries state alone — a status is a word and a number.
//   01-F17         a sale is never blocked.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter, isAlreadySettled } from "./Counter";

afterEach(cleanup);

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
  actor: "Bilal",
  deviceLabel: "Counter 2",
  businessDay: "2026-08-10",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "ok",
  blocked: null,
  user: { user_id: "user-bilal", display_name: "Bilal" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const openOrder = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  order_id: "order-1",
  reference: "order-1",
  total_paisa: 0,
  paid_paisa: 0,
  lines: [],
  ...over,
});

let appended: AppendRequest[];
let orders: OpenOrder[];
/**
 * Main's `changed` push, captured so a test can move the FOLD and then tell the screen, which is
 * the real sequence: `Counter` re-reads on this signal and on nothing else. Setting `orders` and
 * waiting is not enough — the reload that followed the append has already run against the old
 * array, so a test that only mutated the fixture would be asserting the screen's stale state.
 */
let changed: (() => void) | null;

const mountWith = (initial: OpenOrder[]) => {
  appended = [];
  orders = [...initial];
  changed = null;
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    // A GETTER, not a captured array: the whole point of `cartOrderId` is what happens after a
    // new order joins the branch-wide list, and a frozen fixture could not show it.
    openOrders: vi.fn(async () => [...orders]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (_req: AddLineRequest) => ({ id: "evt-line" })),
    onChanged: vi.fn((cb: () => void) => {
      changed = cb;
      return () => {};
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tap = (name: RegExp) =>
  fireEvent.click(screen.getAllByRole("button", { name })[0] as Element);
const openPay = async () => {
  await screen.findByText("Pay", { exact: true });
  tap(/^Pay$/);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE REFUSAL IS LEGIBLE. `00 §5.7`: a refusal a cashier cannot see is a dead button.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A DEC-MONEY-009 — the Pay surface says the bill is already settled", () => {
  it("names the state in a WORD and the money in a NUMBER (27-F12)", async () => {
    // The measured case: Rs 2,240 billed, Rs 2,240 already taken by the other till, converged
    // here. The cashier must learn that BEFORE she keys 2240 and presses.
    mountWith([openOrder({ total_paisa: 224_000, paid_paisa: 224_000 })]);
    render(<Counter />);
    await openPay();

    const notice = await screen.findByText(/already settled/i);
    expect(notice.textContent).toContain("Rs 2,240");
    expect(notice.textContent).toMatch(/nothing more is due/i);
  });

  it("draws no TAKE CASH at all — an inert primary control is 27-F5's own failure mode", async () => {
    mountWith([openOrder({ total_paisa: 224_000, paid_paisa: 224_000 })]);
    render(<Counter />);
    await openPay();
    await screen.findByText(/already settled/i);
    // Not greyed, not disabled — absent, with a sentence in its place, which is the shape this
    // surface already uses for "there is nothing to settle" one branch up.
    expect(screen.queryByRole("button", { name: /take cash/i })).toBeNull();
  });

  it("still shows the pad on a PARTIALLY tendered order (02-F13)", async () => {
    // The dangerous mutant is a screen that refuses whenever anything has been paid. `02-F13`
    // splits a settlement across methods, so a part-paid bill must still be settleable — and
    // this is the assertion that separates "already settled" from "some money has arrived".
    mountWith([openOrder({ total_paisa: 224_000, paid_paisa: 100_000 })]);
    render(<Counter />);
    await openPay();
    await screen.findByRole("button", { name: /take cash/i });
    expect(screen.queryByText(/already settled/i)).toBeNull();
  });

  it("still shows the pad on an order with NO bill (01-F17, and the Rs 0 defect untouched)", async () => {
    // `0 >= 0` would make every empty order read as settled and would silently close the OPEN
    // `TAKE CASH`-on-an-empty-entry defect by the back door. Neither is this ruling's business.
    mountWith([openOrder({ total_paisa: 0, paid_paisa: 0 })]);
    render(<Counter />);
    await openPay();
    await screen.findByRole("button", { name: /take cash/i });
    expect(screen.queryByText(/already settled/i)).toBeNull();
  });
});

describe("§A2 — the predicate the surface and the guard share", () => {
  it("is the same comparison main makes, on the two projected numbers", () => {
    expect(isAlreadySettled({ total_paisa: 224_000, paid_paisa: 224_000 })).toBe(true);
    expect(isAlreadySettled({ total_paisa: 224_000, paid_paisa: 223_999 })).toBe(false);
    expect(isAlreadySettled({ total_paisa: 224_000, paid_paisa: 300_000 })).toBe(true);
    expect(isAlreadySettled({ total_paisa: 0, paid_paisa: 0 })).toBe(false);
    expect(isAlreadySettled({ total_paisa: 0, paid_paisa: 50_000 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE CONTRIBUTING DEFECT. Two cashiers serving two customers rang into ONE bill.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F1/02-F11 — a second order can be started, and it becomes THIS till's cart", () => {
  it("starts one while another is already open (the type row is no longer inert)", async () => {
    // THE DEFECT VERBATIM: with any order open, `unavailable={current !== undefined}` greyed all
    // three type tiles, so this till could not start an order at all — and `02-F11` means the
    // open order may belong to another terminal entirely.
    mountWith([openOrder({ order_id: "someone-elses", channel: "counter" })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    tap(/^Counter$/i);
    tap(/^Takeaway$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.created");
    expect(appended[0]?.payload).toMatchObject({ channel: "counter", order_type: "takeaway" });
  });

  it("makes the NEW order the cart even though another sorts first (02-F11)", async () => {
    // The sharpest form of the defect: the branch-wide list's first row is another till's order,
    // and the cart followed it. Here the second cashier starts her own and the cart moves to it —
    // which is what stops two customers being rung into one bill.
    mountWith([openOrder({ order_id: "someone-elses", channel: "counter", total_paisa: 50_000 })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    tap(/^Counter$/i);
    tap(/^Dine-in$/i);
    await waitFor(() => expect(appended).toHaveLength(1));

    // The fold catches up: the new order joins the list, SECOND, exactly as `orders[0]` would
    // have hidden it. `paid_paisa` is 0 on it and Rs 500 on the other, so the Pay surface's DUE
    // figure is the unambiguous witness of which order the cart is on.
    const created = appended[0];
    if (created === undefined) throw new Error("no order.created was appended");
    const mine = String((created.payload as { order_id: string }).order_id);
    orders = [
      openOrder({ order_id: "someone-elses", channel: "counter", total_paisa: 50_000 }),
      openOrder({ order_id: mine, channel: "counter", total_paisa: 90_000 }),
    ];
    changed?.();
    await waitFor(() => expect(screen.getByText(/order in progress/i)).toBeTruthy());
    tap(/^Send to kitchen$/i);
    await waitFor(() => expect(appended).toHaveLength(2));
    // `sendToKitchen` fires with `current.order_id` — so this is the cart, named.
    expect(appended[1]).toEqual({
      type: "order.confirmed",
      payload: { order_id: mine },
      refs: [],
    });
  });

  it("falls back to the branch list when this till has started nothing (01-F17)", async () => {
    // A fresh launch, or an order that has settled out of the projection. The till is not left
    // with an unusable screen: it behaves exactly as it did before this change.
    mountWith([openOrder({ order_id: "left-open", channel: "counter", total_paisa: 70_000 })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Send to kitchen$/i });
    tap(/^Send to kitchen$/i);
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.payload).toEqual({ order_id: "left-open" });
  });

  it("prices the second order from ITS OWN channel, not the open one's (01-F60/02-F42)", async () => {
    // The channel row is live again, and this is the assertion that it means what it says: the
    // NEXT order's channel. A foodpanda order started beside an open counter order must carry
    // `foodpanda`, because `01-F53` freezes that choice into an append-only ledger.
    mountWith([openOrder({ order_id: "counter-order", channel: "counter" })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Foodpanda$/i });

    tap(/^Foodpanda$/i);
    tap(/^Delivery$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.payload).toMatchObject({ channel: "foodpanda", order_type: "delivery" });
  });

  it("says on the surface that a type tap starts another order (27-F5)", async () => {
    // `27-F5` wants a visible, labelled target for every action. The row's state line used to
    // read `Order in progress` beside three inert tiles; they are live now and the sentence says
    // what they do, so nothing on this surface is a control whose effect is unstated.
    mountWith([openOrder({ order_id: "open-1", channel: "counter" })]);
    render(<Counter />);
    await screen.findByText(/order in progress/i);
    expect(screen.getByText(/starts another order/i)).toBeTruthy();
  });
});
