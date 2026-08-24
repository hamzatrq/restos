// THE ORDER OF `02-F24`'s TWO APPENDS, ASSERTED — because the day summary is assembled from the
// FIRST of them and it printed `Deposit Rs 0`.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored by the session that made the
// fix, which is NOT the `24 §3` split (`20 §4.3` as amended by **R66**). `cash-tab.dom.test.tsx`
// IS a `24 §3` oracle — "authored from spec text only, by a session that does not implement it" —
// and this session may not edit it, so the one property that file does not pin lives here instead
// of being added to it. Its C34 test asserts that BOTH events are appended and against which day,
// with `only(...)` lookups that are order-agnostic by construction; that is correct for what it
// was written to hold and it is exactly why the defect below was invisible to it.
//
// ── THE DEFECT, REPRODUCED ON A REAL DEVICE STORE BEFORE THE FIX ────────────────────────────────
//
// `02-F24` is ONE act and TWO events: "manager cash count + deposit record → `day.closed`,
// `cash.deposit_recorded`". `main/index.ts` hangs the day-summary ticket off the COMPLETED append
// of `day.closed` — it has to, because the document is assembled from the `shift_cash` fold and
// the event must be in before the facts exist. The renderer emitted the two in the FR's written
// order, so at the moment the printer read the `days` row the deposit had not been appended yet:
// the row carried `deposit_paisa: 610200` a moment later and the ESC/POS bytes handed to the
// transport read **`Deposit Rs 0`**, two rows from `Counted cash Rs 6,102`, on the document a
// manager reconciles against the bank. Nothing was wrong with the ledger, the fold or the printer.
//
// **The fix is the ORDER, so that the triggering event is the LAST event of the act** — and the
// alternative (moving the trigger onto `cash.deposit_recorded`) is refused in `CashSurfaces.tsx`
// with its reason. The MONEY assertion — that the printed Deposit row now carries the deposit,
// with a CONTROL driving the pre-fix order through the same rig — is
// `main/__acceptance__/paper-vs-ledger.test.ts` §C. This file holds the other half: that the
// shipped renderer actually emits in that order. Neither subsumes the other (`L7`).
//
// THE FRs: `02-F24` (the act and its two events), `02-F56` (an uncounted close fabricates both a
// variance and a deposit), `01-F17` (neither append is gated on the other), `01-F1` (both are
// permanent, so the residue of an interrupted act is chosen deliberately).

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom has no layout, so the measured grid would never render. */
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

const DEVICE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-20",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
} as DeviceState;

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const OPEN_DAY = {
  day_id: "day-live",
  business_date: "2026-08-20",
  prev_day_id: null,
  opening_float_paisa: 0,
  deposit_paisa: 0,
  closed: 0,
  counted_cash_paisa: null,
  exceptions_json: "[]",
};

let appended: AppendRequest[];

const mount = (): void => {
  appended = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    alarms: vi.fn(async () => []),
    quickTags: vi.fn(async () => []),
    cashState: vi.fn(async () => ({
      shifts: [],
      days: [OPEN_DAY],
      unbound: [],
      unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
    })),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    onChanged: vi.fn(() => () => {}),
  } as Record<string, unknown>;
  Object.defineProperty(window, "restos", {
    value: new Proxy(bridge, {
      get: (target, prop: string) => (prop in target ? target[prop] : async () => undefined),
      has: () => true,
    }),
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tabButton = (label: string): HTMLButtonElement => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  const found = [...(rail?.querySelectorAll("button") ?? [])].find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === label,
  );
  expect(found, `27-F4 — the rail must carry a ${label} tab`).toBeDefined();
  return found as HTMLButtonElement;
};

const closeTheDay = async (countedRupees: string): Promise<void> => {
  mount();
  render(<Counter />);
  await screen.findByText("Order", { exact: true });
  fireEvent.click(tabButton("Cash"));
  await waitFor(() => expect(tabButton("Cash").getAttribute("aria-current")).toBe("page"));
  for (const digit of countedRupees) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  fireEvent.click(screen.getByRole("button", { name: /close\s+(the\s+)?day/i }));
  await waitFor(() => expect(appended.length).toBeGreaterThan(1));
};

describe("02-F24 — the triggering event is the LAST event of the day-close act", () => {
  it("appends cash.deposit_recorded BEFORE day.closed", async () => {
    await closeTheDay("8000");
    const types = appended.map((req) => req.type);
    expect(types).toEqual(["cash.deposit_recorded", "day.closed"]);
  });

  it("both facts still land, against the same day, with the same counted figure", async () => {
    // The anti-scope half: an order change must not become a fact change. `02-F24` names two
    // events and `02-F56` makes the count the precondition of both, so a reorder that dropped one
    // or re-pointed it would satisfy the assertion above and defeat the FR.
    await closeTheDay("8000");
    const deposit = appended.find((req) => req.type === "cash.deposit_recorded");
    const closed = appended.find((req) => req.type === "day.closed");
    expect(deposit?.payload.day_id).toBe("day-live");
    expect(closed?.payload.day_id).toBe("day-live");
    expect(deposit?.payload.amount_paisa).toBe(800_000);
    expect(closed?.payload.counted_cash_paisa).toBe(800_000);
    expect(appended, "the act is exactly two events").toHaveLength(2);
  });

  it("01-F17: neither append is gated on the other — both are emitted in one gesture", async () => {
    // The order is a sequencing choice, never a precondition. A `day.closed` that waited for the
    // deposit's ack would let a socket hold a manager at the till, and `01-F1` makes whichever
    // event did land permanent either way.
    await closeTheDay("8000");
    expect(appended).toHaveLength(2);
  });
});
