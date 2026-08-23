// ACCEPTANCE TESTS — K-7's screen half: `03-F5`'s S1 reaches the COUNTER, and takes a band.
//
// PROVENANCE (24 §3 step 2): authored from spec text alongside
// `main/__acceptance__/kot-printing.test.ts`, by the session that then implemented against it —
// stated rather than glossed (see that file's header for the mitigation).
//
// THE FRs:
//
//   03-F5   "the host device raises a loud alert … naming the printer and order … repeating
//           until acknowledged; acknowledgment is logged."
//   27-F11d "An S1 alarm takes a BAND, never the screen … and the work underneath stays visible
//           and usable. A half-built cart is never taken away from a cashier with a customer
//           waiting."
//   27-F11g "Where paper is the only kitchen channel there is no screen fallback — a failed KOT
//           means food is genuinely not being cooked and nobody knows. The S1 band … is the
//           ONLY signal."
//   01-F17  a sale is never blocked — not by an S1.
//   21 §2 / Commandment 6: the band is `packages/ui`'s `AlarmBand`, reached through `AppShell`.
//           `closed-vocabulary.test.ts` already fails the build on a hand-rolled one.
//
// ⚠ NO PRINTER EXISTS. Every alarm below is a value handed to a React tree.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter } from "./Counter";

/** `27 §1a`'s reference panel, the same measurement `counter.dom.test.tsx` stubs. */
const REFERENCE_PANEL = { width: 1366, height: 768 } as DOMRectReadOnly;

class StubResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const DEVICE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-06",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
} as DeviceState;

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/** A HALF-BUILT CART — the thing `27-F11d` says an alarm may never take away. */
const OPEN_ORDER: OpenOrder = {
  order_id: "order-1",
  reference: "order-1",
  total_paisa: 45_000,
  paid_paisa: 0,
  lines: [
    {
      line_id: "l1",
      name: "Chicken Karahi",
      quantity: 2,
      modifiers: [],
      removals: [],
      note: null,
      billed_paisa: 45_000,
    },
  ],
};

const ALARM = {
  id: "job-1",
  message: "KOT order-12 did not print — TH230",
  subject: "no response after 3 attempts",
};

const mount = (alarms: readonly { id: string; message: string; subject: string }[]) => {
  const acked: string[] = [];
  let current = [...alarms];
  const listeners = new Set<() => void>();
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => [OPEN_ORDER]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    alarms: vi.fn(async () => current),
    acknowledgeAlarm: vi.fn(async (id: string) => {
      acked.push(id);
      current = current.filter((a) => a.id !== id);
      for (const fn of listeners) fn();
    }),
    append: vi.fn(async (_req: AppendRequest) => ({ id: "evt-1" })),
    addLine: vi.fn(async (_req: AddLineRequest) => ({ id: "evt-2" })),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  render(<Counter />);
  return { bridge, acked };
};

afterEach(cleanup);

describe("03-F5/27-F11g — the counter is TOLD when a KOT did not print", () => {
  it("renders the band, naming the printer AND the order", async () => {
    mount([ALARM]);
    // `role="alert"` is `AlarmBand`'s own — a band nobody's assistive layer announces is a band
    // that reaches a cashier only if she happens to be looking at the top of the screen.
    const band = await screen.findByRole("alert");
    const text = band.textContent ?? "";
    expect(text).toContain("order-12");
    expect(text).toContain("TH230");
  });

  it("27-F11d — the half-built cart and the grid STAY, underneath", async () => {
    mount([ALARM]);
    await screen.findByRole("alert");
    // The line the cashier already rang up is still on the screen…
    expect(screen.getByText("Chicken Karahi")).toBeTruthy();
    // …and the grid is still sellable, which is `01-F17` on this surface: an S1 about the
    // KITCHEN must not stop the till taking the next order.
    expect(screen.getByText("Karahi")).toBeTruthy();
    expect(screen.getByText("Send to kitchen")).toBeTruthy();
  });

  it("03-F5 — acknowledgement is attributed to a control and reaches main", async () => {
    const { bridge, acked } = mount([ALARM]);
    const band = await screen.findByRole("alert");
    const ack = band.querySelector("button");
    if (ack === null) throw new Error("the band has no acknowledgement control");
    fireEvent.click(ack);
    await waitFor(() => expect(acked).toEqual([ALARM.id]));
    expect(bridge.acknowledgeAlarm).toHaveBeenCalledWith(ALARM.id);
    // And the band goes — `03-F5` repeats "until acknowledged", not after.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("no alarms ⇒ no band at all — the counter is not decorated with a quiet one", async () => {
    mount([]);
    // Wait for the first read to settle so this is an assertion about state, not about timing.
    await screen.findByText("Chicken Karahi");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("01-F17 — a host that cannot serve the alarm channel still sells", async () => {
    // The two members are OPTIONAL on `RestosBridge` (see `shared/ipc.ts` — three read-only
    // harnesses close with `satisfies RestosBridge`). That is a REPORTED weakness for `03-F5`,
    // not a design preference; what it must never do is take the till down.
    const bridge = {
      deviceState: vi.fn(async () => DEVICE),
      openOrders: vi.fn(async () => [OPEN_ORDER]),
      kitchenQueue: vi.fn(async () => []),
      menu: vi.fn(async () => MENU),
      append: vi.fn(async (_req: AppendRequest) => ({ id: "evt-1" })),
      addLine: vi.fn(async (_req: AddLineRequest) => ({ id: "evt-2" })),
      onChanged: vi.fn(() => () => {}),
    };
    Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    render(<Counter />);
    expect(await screen.findByText("Chicken Karahi")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
