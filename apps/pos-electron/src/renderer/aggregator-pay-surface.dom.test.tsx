// `02-F30`'s NO-SETTLEMENT STEP ON THE GLASS — what a cashier sees when the Pay surface holds a
// foodpanda order, and what she must NOT be told.
//
// ⚠ PROVENANCE (`24 §3` step 2): **authored from SPEC TEXT ONLY, by a session that has not read
// the plan for this task and has not seen an implementation.** Committed RED on purpose.
//
// The main-process half — the `01-F32` receivable itself, the drawer, idempotency — is
// `main/__acceptance__/aggregator-settlement.test.ts`, against a real store and the real
// `shift_cash` fold. Nothing in this file is evidence about money reaching the ledger.
//
// ── THE FRs, QUOTED ──────────────────────────────────────────────────────────────────────────
//
//   02-F30   "channel pre-tagged `foodpanda` … **no settlement step** (aggregator-collected;
//            economics handled by doc 08)."
//   08-F5    "no cash expected at branch when foodpanda's rider delivers."
//   01-F32   aggregator-collected orders settle as `payment.recorded
//            { method: aggregator_receivable }`.
//   27-F5    "No context-dependent or invisible controls … Every action has a persistent,
//            visible, labelled target." An inert primary control is this FR's own failure mode,
//            which is why `DEC-MONEY-009` replaced `TAKE CASH` with a SENTENCE one branch up
//            rather than greying it, and why this branch takes the same shape.
//   27-F12   "Colour never carries state alone. Every status is colour + shape + position + a
//            number."
//   00 §5.7  a surface reports what is TRUE.
//   01-F17   a sale is never blocked.
//   01-F54   an unknown or not-yet-synced value degrades and NEVER blocks.
//   02-F42   `channel` is a CLOSED set — `counter | phone | storefront | whatsapp | foodpanda`.
//
// ── THE ASSERTION THIS FILE EXISTS FOR, stated up front so it is not read past ────────────────
//
// The `01-F32` receivable makes `paid_paisa >= total_paisa` TRUE for a foodpanda order, so the
// **existing** `DEC-MONEY-009` branch already fires and already removes the tender panel. An
// implementation that changes nothing on the glass therefore passes "no tender affordance" and
// "a word and a number" — and puts *"Already settled — Rs 570 **taken on this bill**"* in front
// of a cashier at a counter where **nothing was taken and nothing ever will be**. That is a false
// statement about money under `00 §5.7`, and §C is the only assertion in this file that catches
// it. §D is the second half of the same trap: the channel decides, not the money.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  businessDay: "2026-08-10",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "ok",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** Rs 570 — the same bill the main-process suite uses, so the two halves talk about one order. */
const BILL_PAISA = 57_000;
const BILL_TEXT = "570";

const openOrder = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  order_id: "order-1",
  reference: "order-1",
  total_paisa: 0,
  paid_paisa: 0,
  lines: [],
  ...over,
});

/** A foodpanda order the `01-F32` receivable has already closed. */
const foodpandaSettled = (over: Partial<OpenOrder> = {}): OpenOrder =>
  openOrder({
    channel: "foodpanda",
    order_type: "delivery",
    total_paisa: BILL_PAISA,
    paid_paisa: BILL_PAISA,
    ...over,
  });

let appended: AppendRequest[];
let orders: OpenOrder[];

const mountWith = (initial: OpenOrder[]) => {
  appended = [];
  orders = [...initial];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => [...orders]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (_req: AddLineRequest) => ({ id: "evt-line" })),
    onChanged: vi.fn((_cb: () => void) => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tap = (name: RegExp) =>
  fireEvent.click(screen.getAllByRole("button", { name })[0] as Element);

/** Mount, open the Pay tab, and hand back nothing — every assertion reads the screen. */
const openPayWith = async (initial: OpenOrder[]): Promise<void> => {
  mountWith(initial);
  render(<Counter />);
  await screen.findByText("Pay", { exact: true });
  tap(/^Pay$/);
};

/** `TenderPanel`'s own landmark (`aria-label="Take payment"`) — the settlement STEP itself. */
const tenderPanel = () => screen.queryByLabelText("Take payment");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `02-F30`: THERE IS NO SETTLEMENT STEP.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F30 — the Pay surface offers a foodpanda order no way to tender", () => {
  it("shows no tender panel, no TAKE CASH and no method row", async () => {
    await openPayWith([foodpandaSettled()]);

    expect(tenderPanel()).toBeNull();
    expect(screen.queryByRole("button", { name: /TAKE CASH/i })).toBeNull();
    // `02-F12`'s method row, which `TenderPanel` renders as CASH / CARD / RAAST / KHATA /
    // AGGREGATOR. Its presence would mean the cashier is being asked to choose a tender for
    // money she will never touch.
    for (const label of ["CASH", "CARD", "RAAST", "KHATA", "AGGREGATOR"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${label}$`) })).toBeNull();
    }
  });

  it("offers no keypad — 02-F30's target is 30 s and there is nothing to key", async () => {
    await openPayWith([foodpandaSettled()]);
    for (const digit of ["7", "8", "9", "0"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`^${digit}$`) })).toBeNull();
    }
  });

  it("leaves NO disabled control behind — 27-F5 forbids the inert affordance", async () => {
    // The failure this catches is the obvious first draft: grey `TAKE CASH` out. `27-F5` bans
    // context-dependent controls and `DEC-MONEY-009` set this surface's precedent one branch up
    // ("a sentence rather than a greyed TAKE CASH"). A greyed control also costs the ~510 x 126 dp
    // of the highest-consequence position on the panel to say nothing.
    await openPayWith([foodpandaSettled()]);
    const surface = screen.getByText(/foodpanda|aggregator/i).closest("div") as HTMLElement;
    expect(surface).not.toBeNull();
    for (const button of Array.from(surface.querySelectorAll("button"))) {
      expect(button.hasAttribute("disabled")).toBe(false);
    }
  });

  it("appends nothing — no payment can be originated from this surface", async () => {
    await openPayWith([foodpandaSettled()]);
    expect(appended).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `27-F12`: A WORD AND A NUMBER.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F12 — the state is stated, in a word and a number", () => {
  it("names the aggregator and carries the money", async () => {
    await openPayWith([foodpandaSettled()]);

    // THE WORD. `02-F30`'s own vocabulary — the reason this bill is closed is the CHANNEL, and a
    // sentence that omits it cannot be told from `DEC-MONEY-009`'s.
    const stated = screen.getByText(/foodpanda|aggregator/i);
    expect(stated).not.toBeNull();

    // THE NUMBER. `27-F12` requires one; a bare "no payment needed" is a status carried by
    // position alone. Rs 570, grouped the way `formatPaisa` groups it.
    expect(stated.textContent ?? "").toContain(BILL_TEXT);
  });

  it("does not depend on colour — the sentence survives being read in greyscale", async () => {
    // `27-F12` is machine-enforced for status COMPONENTS; this branch is prose, so what is
    // asserted is the property itself: strip the styling and the fact is still there.
    await openPayWith([foodpandaSettled()]);
    const stated = screen.getByText(/foodpanda|aggregator/i);
    expect((stated.textContent ?? "").replace(/\s+/g, " ").trim().length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `00 §5.7`: IT MUST NOT SAY MONEY WAS TAKEN AT THIS COUNTER.
//
// ⚠ **THE ASSERTION THIS FILE EXISTS FOR.** An implementation that touches nothing on the glass
// passes §A and §B: the `01-F32` receivable makes `isAlreadySettled` true, the existing
// `DEC-MONEY-009` branch fires, the tender panel disappears and a rupee figure appears. It also
// tells the cashier *"Rs 570 **taken on this bill**"* about money that was never in her drawer and
// never will be — `08-F5`: "no cash expected at branch". At `shift.closed` she then reconciles
// against a `02-F23` Aggregator row and a Cash row that disagree with what the Pay surface told
// her all shift.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 00 §5.7 — the sentence is about the aggregator, not about a drawer", () => {
  it("does not claim the money was taken on this bill", async () => {
    await openPayWith([foodpandaSettled()]);
    expect(screen.queryByText(/taken on this bill/i)).toBeNull();
  });

  it("does not reuse DEC-MONEY-009's already-settled sentence", async () => {
    await openPayWith([foodpandaSettled()]);
    expect(screen.queryByText(/^Already settled —/i)).toBeNull();
  });

  it("still shows DEC-MONEY-009's sentence for a settled COUNTER order — the neighbour is intact", async () => {
    // The control for the two assertions above. Without it, deleting the `DEC-MONEY-009` branch
    // outright would pass them both, and this file would have broken the defence against a
    // measured Rs 2,240 loss while closing a different FR.
    await openPayWith([
      openOrder({
        channel: "counter",
        order_type: "takeaway",
        total_paisa: BILL_PAISA,
        paid_paisa: BILL_PAISA,
      }),
    ]);
    expect(screen.getByText(/taken on this bill/i)).not.toBeNull();
    expect(tenderPanel()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE CHANNEL DECIDES, NOT THE MONEY.
//
// `02-F30` says "no settlement step" about the CHANNEL, unconditionally. A foodpanda order whose
// receivable has not landed yet — the entry is mid-flight, the confirm has not been pressed, the
// device is catching up — must still not offer a tender: the cashier taking cash for a foodpanda
// order is precisely the error `08-F5` says cannot happen ("no cash expected at branch"), and it
// would land in `02-F23`'s Cash bucket and go missing at close.
//
// An implementation that leans on `paid_paisa >= total_paisa` passes every assertion above and
// fails here. So does one that hides the tender for every DELIVERY order, or for every settled
// order, or for the whole Pay surface.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F30 — an UNSETTLED foodpanda order is still not settleable at the counter", () => {
  it("offers no tender panel when nothing has been paid yet", async () => {
    await openPayWith([foodpandaSettled({ paid_paisa: 0 })]);
    expect(tenderPanel()).toBeNull();
    expect(screen.queryByRole("button", { name: /TAKE CASH/i })).toBeNull();
    expect(screen.getByText(/foodpanda|aggregator/i)).not.toBeNull();
  });

  it("DOES offer the tender panel for a counter order with the identical money", async () => {
    // The one-branch control: same `total_paisa`, same `paid_paisa`, same `order_type` as the case
    // directly above — only `channel` differs. If this reddens, the implementation is deciding on
    // something other than the channel.
    await openPayWith([
      openOrder({
        channel: "counter",
        order_type: "delivery",
        total_paisa: BILL_PAISA,
        paid_paisa: 0,
      }),
    ]);
    expect(tenderPanel()).not.toBeNull();
    expect(screen.getByRole("button", { name: /TAKE CASH/i })).not.toBeNull();
  });

  it("DOES offer the tender panel for a phone order — 02-F28 is collected at the counter", async () => {
    // `01-F32` names aggregator-collected orders only. A phone order is an ordinary sale that a
    // rider or a customer pays for, and hiding its tender would be a till that cannot take money.
    await openPayWith([
      openOrder({
        channel: "phone",
        order_type: "delivery",
        total_paisa: BILL_PAISA,
        paid_paisa: 0,
      }),
    ]);
    expect(tenderPanel()).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `01-F17`/`01-F54`: A CHANNEL THIS DEVICE DOES NOT KNOW STILL SELLS.
//
// `OpenOrder.channel` is OPTIONAL on the IPC schema — `shared/ipc.ts` states outright that a host
// which does not supply it means "this host did not say". Treating that silence as foodpanda
// removes the tender from an ordinary sale and stops the till taking money, which `01-F17`
// forbids; `01-F54` requires the degrade to cost a word, never a sale.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F17/01-F54 — an unstated channel degrades to the ordinary tender path", () => {
  it("offers the tender panel when the host did not say which channel this is", async () => {
    await openPayWith([openOrder({ total_paisa: BILL_PAISA, paid_paisa: 0 })]);
    expect(tenderPanel()).not.toBeNull();
    expect(screen.getByRole("button", { name: /TAKE CASH/i })).not.toBeNull();
  });

  it("keeps the empty state for no order at all", async () => {
    // The branch above both of these. A foodpanda check placed before it would put an aggregator
    // sentence on a till with nothing open.
    await openPayWith([]);
    expect(screen.getByText(/No order to settle/i)).not.toBeNull();
    expect(tenderPanel()).toBeNull();
  });
});
