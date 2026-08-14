// `C31` / `02-F10` RECALL — a cashier returns to an order she is no longer on.
//
// PROVENANCE (`24 §3` step 2): **authored from spec text by a session that wrote none of the
// implementation and may not write it.** The FRs read for this file, and nothing else:
//
//   02-F51  (a) one tap on an open-order row makes THAT order this terminal's current order —
//               the cart, the grid's price channel, `02-F8`'s confirm and `02-F12`'s tender all
//               read the one order, and pressing the SECOND row recalls the second;
//           (b) it appends NOTHING — `02-F4`'s `order.parked`/`order.unparked` have no `01-F4`
//               payload schema, and which order a TERMINAL is on is terminal state;
//           (c) a chosen order is RELEASED when its money side closes, and the cart never falls
//               through to another order. A PARTIAL tender never releases (`02-F13`);
//           (d) the fallback for a terminal that has chosen NOTHING is deliberately untouched.
//   02-F10  "open orders … recallable" — the FR that had no control anywhere in the product.
//   02-F11  `orders` is BRANCH-wide, which is why `orders[0]` is not this till's cart.
//   01-F33  settlement closes the money side; it does not reopen.
//   01-F17  a sale is never blocked.
//
// **Every assertion here is aimed at a plausible WRONG implementation**, because a guard that is
// never fired at a violation is vacuous (`plans/wave-1/oracle-round-2-findings.md §C`, the
// round-3 law). The mutants each section is pointed at:
//
//   §A  recall that renders a control and moves nothing; recall that always picks `orders[0]`
//       (the pressed row is the SECOND on purpose, and the first row is another till's order);
//       recall that adds the line to the cart it had rather than the order it recalled.
//   §B  recall that emits `order.unparked` (or anything at all) into an append-only ledger.
//   §C  **THE MONEY-LOSING PAIR.** A settled bill that stays the cart takes further lines
//       (`uncovered_addition`, driven on a real till in August 2026); a cart that is merely
//       cleared falls through `?? orders[0]` and the next tap rings a dish onto a STRANGER's
//       bill at a price `01-F53` freezes and `01-F1` forbids correcting. §C3 is the CONTROL —
//       an implementation releasing on any arriving money breaks `02-F13`'s split tender — and
//       §C4 is the other control: `02-F51` (d) leaves the never-chosen fallback alone, so an
//       implementation reading "a settled order is never current" is wrong in the other
//       direction and takes `double-settlement.dom.test.tsx` §A with it.
//   §D  a choice stored as a ROW POSITION, or one reset by the `changed` push that arrives on
//       every line any terminal adds.
//   §E  the recall action handed to BOTH lists, which replaces `02-F9`'s Accept — `OrderList`
//       takes exactly one action by design, so this is one prop away.
//
// The control is found as "the row's one button" and never by its label: `02-F51` fixes that
// there is exactly one and what it does, and no FR fixes its word. A test pinning the word
// would block a correct implementation that chose a different one.

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

/** As `counter.dom.test.tsx` records: happy-dom has no layout, so the panel is stubbed. */
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
  businessDay: "2026-08-14",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const order = (over: Partial<OpenOrder> & { order_id: string; reference: string }): OpenOrder => ({
  total_paisa: 100_000,
  paid_paisa: 0,
  lines: [],
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: 1_000,
  settled: 0,
  ...over,
});

/** `02-F9`'s inbox member — an arrived, unaccepted website order. */
const cloudUnaccepted = (id: string, reference: string): OpenOrder =>
  order({
    order_id: id,
    reference,
    channel: "storefront",
    order_type: "delivery",
    confirmed_at: null,
  });

let appended: AppendRequest[];
let lines: AddLineRequest[];
let orders: OpenOrder[];
/**
 * Main's `changed` push, captured. `Counter` re-reads on this signal and on nothing else, so a
 * test that only moved the fixture would be asserting the screen's STALE state — the trap
 * `double-settlement.dom.test.tsx` records after paying for it once.
 */
let changed: (() => void) | null;

const mountWith = (initial: readonly OpenOrder[]) => {
  appended = [];
  lines = [];
  orders = [...initial];
  changed = null;
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    // A GETTER, not a captured array: every case here turns on what happens AFTER the fold moves.
    openOrders: vi.fn(async () => [...orders]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    // Tracked separately from `append`, for `counter.dom.test.tsx`'s recorded reason: they are
    // different channels and only one of them could ever carry money.
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
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

/** The `OrderList` row an operator would point at, found by the reference she reads on it. */
const rowFor = (reference: string): HTMLElement => {
  const row = screen.getByText(reference).closest("article");
  if (row === null) throw new Error(`no order row rendered for ${reference}`);
  return row as HTMLElement;
};

/**
 * `02-F51` (a) — the row's ONE control, pressed. Found positionally rather than by label
 * because the FR fixes the count and the effect and not the word; asserting the count here is
 * also `27-F9`/`OrderList`'s single-action rule, checked at every call site in this file.
 */
const recall = (reference: string) => {
  const controls = within(rowFor(reference)).getAllByRole("button");
  expect(
    controls,
    `02-F51 (a): the open-order row for ${reference} carries one control`,
  ).toHaveLength(1);
  fireEvent.click(controls[0] as HTMLElement);
};

const openTab = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole("button", { name }));
};

/** Arrive at the queue, recall an order, and go back to the surface that rings dishes. */
const recallFromQueue = async (reference: string) => {
  await openTab(/^Orders/);
  await screen.findByText("Open orders");
  recall(reference);
  await openTab(/^Order$/);
};

const tapKarahi = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Karahi/i }));
};

/** `01-F17` — the surface's resting state, i.e. this terminal has no current order. */
const restingState = () => screen.getAllByText(/choose an order type first/i);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 02-F51 (a): recall makes the PRESSED order this terminal's current order.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F51 (a)/02-F10 — recalling an open order makes it the cart", () => {
  it("02-F51: confirm names the RECALLED order, not the branch list's first row", async () => {
    // The sharpest form. `02-F11` makes `orders` branch-wide and the first row here belongs to
    // another till — which is exactly what `current = orders[0]` hands this cashier. She presses
    // the SECOND row, so an implementation that draws a control and recalls `orders[0]` anyway
    // passes a one-row fixture and fails here, and one that draws a control and moves nothing
    // fails here too.
    mountWith([
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 1_000 }),
      order({ order_id: "order-b", reference: "B-202", confirmed_at: 2_000 }),
    ]);
    render(<Counter />);
    await recallFromQueue("B-202");

    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]).toEqual({
      type: "order.confirmed",
      payload: { order_id: "order-b" },
      refs: [],
    });
  });

  it("02-F51: a line rung after the recall lands on the RECALLED order (01-F53)", async () => {
    // `C5` is the counter's highest-frequency act and the one that costs money when it lands on
    // the wrong bill: `01-F53` freezes the price into the event and `01-F1` forbids correcting
    // it. Without the recall this tap goes to `order-a` — a stranger's order.
    mountWith([
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 1_000 }),
      order({ order_id: "order-b", reference: "B-202", confirmed_at: 2_000 }),
    ]);
    render(<Counter />);
    await recallFromQueue("B-202");

    await tapKarahi();
    await waitFor(() => expect(lines).toHaveLength(1));
    expect(lines[0]).toEqual({ order_id: "order-b", item_id: "item-karahi", qty: 1 });
  });

  it("02-F51/02-F33: every open row carries exactly ONE control, and it is no state change", async () => {
    // `27-F9` and `OrderList`'s single-action design: a row is not a menu. And `02-F33`'s
    // read-only posture is about line STATES — recall changes none, so the two coexist. A
    // Ready or Reject control drawn beside the recall would fail here and in
    // `orders-tab.dom.test.tsx` §E, which is deliberate: the anti-scope guard is now two-sided.
    mountWith([
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 1_000 }),
      order({ order_id: "order-b", reference: "B-202", confirmed_at: 2_000 }),
    ]);
    render(<Counter />);
    await openTab(/^Orders/);
    await screen.findByText("Open orders");

    for (const reference of ["A-101", "B-202"]) {
      expect(within(rowFor(reference)).getAllByRole("button")).toHaveLength(1);
    }
    expect(screen.queryByRole("button", { name: /ready/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 02-F51 (b): the ledger is not touched.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F51 (b) — recall appends NOTHING", () => {
  it("02-F51: the first event after a recall is the cashier's own confirm, not a park", async () => {
    // `order.parked`/`order.unparked` carry no `01-F4` payload schema, so an emit is unbuildable
    // — and a recall that wrote anything would file a permanent row (`01-F1`) every time a
    // cashier glanced at her queue. Asserted through the NEXT append rather than as a bare
    // "nothing happened", which would pass before the screen had done anything at all: if the
    // recall emitted, this array holds two entries and the first is not the confirm.
    mountWith([order({ order_id: "order-b", reference: "B-202" })]);
    render(<Counter />);
    await recallFromQueue("B-202");

    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.confirmed");
    expect(lines).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 02-F51 (c): the release, and the two ways to get it wrong. THE MONEY IS HERE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F51 (c)/01-F33 — a settled bill releases the cart", () => {
  it("02-F51: a tile tap after the chosen order settles adds NO line to that closed bill", async () => {
    // `01-F33` does not reopen. A live till drove this in August 2026: two further lines landed
    // on an order that had already closed and the fold raised `uncovered_addition` — permanent
    // under `01-F1`. The mutant this kills is "do nothing on settlement", which is the shipped
    // behaviour and the one a reader cannot see.
    mountWith([order({ order_id: "order-b", reference: "B-202", total_paisa: 100_000 })]);
    render(<Counter />);
    await recallFromQueue("B-202");

    orders = [
      order({
        order_id: "order-b",
        reference: "B-202",
        total_paisa: 100_000,
        paid_paisa: 100_000,
        settled: 1,
      }),
    ];
    changed?.();
    await waitFor(() => expect(restingState().length).toBeGreaterThan(0));

    await tapKarahi();
    await waitFor(() => expect(restingState().length).toBeGreaterThan(0));
    expect(lines).toHaveLength(0);
  });

  it("02-F51: the released cart NEVER falls through to another till's open order", async () => {
    // **THE ASSERTION THIS FILE EXISTS FOR.** The plausible repair — clear the chosen id and let
    // `?? orders[0]` take over — reads as tidy and is worse than the defect it fixes: `orders` is
    // branch-wide (`02-F11`), so the cart silently re-points at whatever `order-a`'s cashier has
    // open and the next tap rings a dish onto her customer's bill. Nothing on the glass moves.
    // Both routes out of the released state are checked, because they are two different call
    // sites: the grid (`C5`) and the confirm (`C9`).
    mountWith([
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 1_000 }),
      order({ order_id: "order-b", reference: "B-202", confirmed_at: 2_000 }),
    ]);
    render(<Counter />);
    await recallFromQueue("B-202");

    orders = [
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 1_000 }),
      order({
        order_id: "order-b",
        reference: "B-202",
        confirmed_at: 2_000,
        paid_paisa: 100_000,
        settled: 1,
      }),
    ];
    changed?.();
    await waitFor(() => expect(restingState().length).toBeGreaterThan(0));

    await tapKarahi();
    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));
    await waitFor(() => expect(restingState().length).toBeGreaterThan(0));

    expect(
      lines.map((l) => l.order_id),
      "a line was rung onto another order",
    ).toEqual([]);
    expect(appended, "an order the cashier never chose was confirmed").toEqual([]);
  });

  it("02-F51/02-F13: a PARTIAL tender does not release — the cart is still hers", async () => {
    // THE CONTROL. `02-F13` splits a settlement across methods, so money arriving is not the
    // bill closing, and an implementation releasing on `paid_paisa > 0` would take the cart away
    // from a cashier halfway through a split — she rings the next dish onto nothing, or worse,
    // onto `orders[0]`. The release test is the closing reading `DEC-MONEY-009`'s guard makes.
    mountWith([order({ order_id: "order-b", reference: "B-202", total_paisa: 100_000 })]);
    render(<Counter />);
    await recallFromQueue("B-202");

    orders = [
      order({
        order_id: "order-b",
        reference: "B-202",
        total_paisa: 100_000,
        paid_paisa: 40_000,
        settled: 0,
      }),
    ];
    changed?.();
    await waitFor(() => expect(mountedOpenOrdersReads()).toBeGreaterThan(1));

    await tapKarahi();
    await waitFor(() => expect(lines).toHaveLength(1));
    expect(lines[0]).toEqual({ order_id: "order-b", item_id: "item-karahi", qty: 1 });
  });

  it("02-F51 (d): a terminal that has chosen NOTHING still reads the branch list", async () => {
    // THE OTHER CONTROL, and it is the one that stops this FR being implemented as "a settled
    // order is never current". `02-F51` (d) leaves the never-chosen fallback exactly where
    // `DEC-MONEY-009` left it, and `double-settlement.dom.test.tsx` §A depends on it: a till
    // that has claimed nothing must still be able to READ the branch's settled bill and be told
    // so, rather than showing a blank Pay surface to a customer asking about it.
    mountWith([
      order({
        order_id: "order-s",
        reference: "S-303",
        total_paisa: 224_000,
        paid_paisa: 224_000,
        settled: 1,
      }),
    ]);
    render(<Counter />);
    await openTab(/^Pay$/);

    const notice = await screen.findByText(/already settled/i);
    expect(notice.textContent).toContain("Rs 2,240");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 02-F51 (a): the choice is an ORDER, not a place in a list.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F51/02-F11 — the recall survives the branch moving underneath it", () => {
  it("02-F51: a third order arriving first does not move the cart off the recalled one", async () => {
    // `Counter` re-reads on main's `changed` push, which arrives on every line any terminal in
    // the branch adds — so a choice held as a row INDEX, or reset on reload, is wrong within
    // seconds of being made and the cashier's next dish lands on someone else's bill. Here the
    // recalled order slides from position two to position three.
    mountWith([
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 2_000 }),
      order({ order_id: "order-b", reference: "B-202", confirmed_at: 3_000 }),
    ]);
    render(<Counter />);
    await recallFromQueue("B-202");

    orders = [
      order({ order_id: "order-c", reference: "C-303", confirmed_at: 1_000 }),
      order({ order_id: "order-a", reference: "A-101", confirmed_at: 2_000 }),
      order({ order_id: "order-b", reference: "B-202", confirmed_at: 3_000 }),
    ];
    changed?.();
    await waitFor(() => expect(mountedOpenOrdersReads()).toBeGreaterThan(1));

    await tapKarahi();
    await waitFor(() => expect(lines).toHaveLength(1));
    expect(lines[0]?.order_id).toBe("order-b");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 02-F9 is untouched: the inbox row still ACCEPTS.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F51 (a)/02-F9 — the inbox keeps its own action", () => {
  it("02-F9: accepting an arrived order still appends order.confirmed for THAT order", async () => {
    // `OrderList` takes exactly one action, so handing the recall to both lists — one prop, the
    // obvious way to write it — silently replaces `02-F9`'s Accept and a website order can no
    // longer be taken at all. Nothing else in this repo would notice.
    mountWith([
      cloudUnaccepted("web-1", "W-901"),
      order({ order_id: "order-a", reference: "A-101" }),
    ]);
    render(<Counter />);
    await openTab(/^Orders/);

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]).toEqual({
      type: "order.confirmed",
      payload: { order_id: "web-1" },
      refs: [],
    });
  });
});

/**
 * How many times the screen has re-read the branch list. Used only as a SYNC POINT for the two
 * cases whose correct outcome is that nothing visible changed — waiting on the resting state
 * there would wait for the very thing under test, and asserting immediately would assert the
 * pre-push render.
 */
const mountedOpenOrdersReads = (): number =>
  (window.restos.openOrders as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
