// HONESTY ASSERTIONS for `02-F27`'s caller strip — **written from a MUTATION RESULT.**
//
// PROVENANCE (`24 §3`): written by the ADVERSARY session that mutation-tested this track — a
// different session from both the oracle author and the implementer. `phone-entry.dom.test.tsx`
// and `phone-entry-seam.test.ts` were not edited; every claim here is new, and each one exists
// because a mutant survived all 791 `pos-electron` tests.
//
// ── THE THREE SURVIVORS, AND ALL THREE ARE `00 §5.7` ─────────────────────────────────────────
//
//   P15  `Counter.tsx` — the lookup's `.catch` stops clearing `caller`, so a failed lookup leaves
//        the PREVIOUS caller's file on the glass → **791/791 pass.** The oracle's §E owns this
//        claim and its own comment names this exact case as *"the more dangerous"* direction —
//        *"a `.catch(() => KNOWN)` **or a stale answer left on screen**"* — but every lookup in
//        that test rejects from the FIRST keystroke, so there is never an answer on screen to go
//        stale. The mechanism was built and pointed one case to the left of the one it names.
//
//   P10  `startOrder` stops calling `clearCaller()` → **791/791 pass.** The order starts, the
//        channel unlatches, and the number and the file stay in state. Latch `Phone` for the next
//        call and the previous caller's name is already on the strip; the first digit she presses
//        is appended to the previous caller's number.
//
//   P11  the channel row stops calling `clearCaller()` on a non-phone channel → **791/791 pass.**
//        Same fact reached by the other exit from the call.
//
// P10 and P11 are the two places the implementation's own comment says the call ENDS. Both were
// written deliberately, both were correct, and neither was asserted anywhere.
//
// ── WHY A SECOND CALLER RATHER THAN AN EMPTY ONE ─────────────────────────────────────────────
//
// Each test below puts a REAL answer on the strip first and then ends the call. A test that
// started from nothing cannot distinguish "cleared" from "never populated", which is exactly how
// the oracle's §E came to pass against P15.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
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
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const DIALLED = "03001234567";
const NAME = "Fatima Bibi";

type Answer = {
  phone_e164: string | null;
  known: { name: string | null; addresses: { address_id: string; address_text: string }[] } | null;
};

const KNOWN: Answer = {
  phone_e164: "+923001234567",
  known: { name: NAME, addresses: [{ address_id: "addr-1", address_text: "House 12, Lahore" }] },
};

let appended: AppendRequest[];
let lookedUp: unknown[];

/** `lookup` answers per call, so a test can put a real file on the strip and THEN fail. */
const mount = (lookup: (dialled: unknown, nth: number) => Promise<Answer>) => {
  appended = [];
  lookedUp = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async (): Promise<OpenOrder[]> => []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    toggleAvailability: vi.fn(async () => ({ id: "evt-86" })),
    lookupCustomer: vi.fn((dialled: unknown) => {
      lookedUp.push(dialled);
      return lookup(dialled, lookedUp.length);
    }),
    recordCustomer: vi.fn(async () => ({ id: "evt-cust" })),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tap = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const enterNumber = (digits: string) => {
  for (const d of digits) tap(new RegExp(`^${d}$`));
};

/** Get a real customer file onto the strip, and assert it is there before anything is judged. */
const raiseKnownCaller = async () => {
  await screen.findByRole("button", { name: /^Phone$/i });
  tap(/^Phone$/i);
  await waitFor(() => enterNumber(DIALLED));
  await screen.findByText(new RegExp(NAME, "i"));
};

describe("§A 00 §5.7 — a lookup that FAILS takes the last caller's file off the glass (P15)", () => {
  it("stops naming a customer once the file can no longer answer", async () => {
    // The eleven digits resolve to a real file; the twelfth keystroke's lookup fails. The
    // operator is now looking at a number the file was never asked about. A name left beside it
    // is the screen asserting something it does not know — `00 §5.7`'s honesty rule, and the
    // consequence is a delivery sent to the previous caller's saved address.
    mount(async (_dialled, nth) => {
      if (nth <= DIALLED.length) return KNOWN;
      throw new Error("the seam is down");
    });
    render(<Counter />);
    await raiseKnownCaller();

    tap(/^8$/);

    await waitFor(() => expect(lookedUp).toHaveLength(DIALLED.length + 1));
    await waitFor(() => expect(screen.queryAllByText(new RegExp(NAME, "i"))).toEqual([]));
  });
});

describe("§B 00 §5.7 / 02-F1 — the strip is cleared when the call ENDS (P10, P11)", () => {
  it("does not carry one caller's file into the next order (P10 — the order starts)", async () => {
    // `startOrder` unlatches the channel, so the strip is not on screen at that moment — which is
    // what makes this invisible to a presence assertion. The state survives, and it reappears the
    // instant she latches `Phone` for the NEXT call: a name she has not asked for, and a number
    // her first keystroke will be appended to.
    mount(async () => KNOWN);
    render(<Counter />);
    await raiseKnownCaller();

    tap(/^Delivery$/i);
    await waitFor(() => expect(appended).toHaveLength(1));

    tap(/^Phone$/i);
    // The readout is back to its empty mark and no file is named.
    await waitFor(() => expect(screen.queryAllByText(new RegExp(NAME, "i"))).toEqual([]));
    expect(screen.queryAllByText(DIALLED)).toEqual([]);
  });

  it("does not carry it across a channel switch either (P11 — a walk-in is latched)", async () => {
    // The second exit the implementation names. `02-F1` makes the channel the resolution key set
    // at creation; a caller is a fact about a phone order, and this order is not one any more.
    mount(async () => KNOWN);
    render(<Counter />);
    await raiseKnownCaller();

    tap(/^Counter$/i);
    tap(/^Phone$/i);

    await waitFor(() => expect(screen.queryAllByText(new RegExp(NAME, "i"))).toEqual([]));
    expect(screen.queryAllByText(DIALLED)).toEqual([]);
  });
});
