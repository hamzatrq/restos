// SEAM ASSERTION for `02-F27`'s inline creation — **the M1 survivor, killed behaviourally.**
//
// PROVENANCE (`24 §3`): written by the IMPLEMENTER, on the precedent
// `main/__acceptance__/phone-entry-host.test.ts` states in full — read that file's header first.
// `phone-entry.dom.test.tsx` beside this one is the independent oracle and is read-only to this
// session; nothing here duplicates it.
//
// ── WHY THIS FILE EXISTS, AND IT IS NOT A GAP IN THE ORACLE ─────────────────────────────────
//
// The oracle's §D asserts the SHAPE of what is recorded *if anything is* — `name` must be `null`
// and never `""` — and it is right to stop there: no FR decides whether an unknown caller is filed
// automatically or on an explicit tap, so a test that demanded one would pin a policy the corpus
// has not written. The consequence is that its loop over `recorded` is **vacuous when nothing
// records at all**, and that is precisely the state the M1 mutant produces: with
// `Counter.tsx`'s call to `recordCustomer` deleted, all **782** tests in this package still pass.
// `02-F27`'s *"unknown number → inline customer creation"* would be a tile that is drawn, tapped,
// and files nobody — `AGENTS.md`'s named defect, wearing this feature's clothes.
//
// This session made the design choice the oracle left open (an EXPLICIT tap, because `01-F1` makes
// a created identity permanent and an automatic file-on-resolve would record every wrong number
// and every hang-up for ever). Having chosen, it owes the assertion that the choice is wired.
//
// ⚠ It pins the control's LABEL, which the oracle deliberately does not. That is a real cost —
// renaming the tile reddens this file — and it is the right cost here: a renamed control fails
// loudly, where a decorative one fails nothing.

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

/** `registry.ts`'s own worked example of what an operator types. Leading zero, eleven digits. */
const DIALLED = "03001234567";

let appended: AppendRequest[];
let recorded: unknown[];

const mount = () => {
  appended = [];
  recorded = [];
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
    // `02-F27`'s *"unknown number"* — the branch that offers inline creation.
    lookupCustomer: vi.fn(async () => ({ phone_e164: "+923001234567", known: null })),
    recordCustomer: vi.fn(async (req: unknown) => {
      recorded.push(req);
      return { id: `evt-cust-${recorded.length}` };
    }),
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

describe("02-F27 — an unknown caller can actually be filed from the counter", () => {
  it("the Save control reaches the trusted side with the DIALLED digits", async () => {
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^Call$/i });
    tap(/^Call$/i);
    await waitFor(() => enterNumber(DIALLED));

    // The control only exists on `02-F27`'s unknown-number branch, which is the branch the FR
    // gives inline creation to. Its absence here would be the feature unbuilt.
    await waitFor(() => screen.getByRole("button", { name: /^Save caller$/i }));
    tap(/^Save caller$/i);

    await waitFor(() => expect(recorded).toHaveLength(1));
    // The DIALLED string, unedited. `registry.ts` puts normalization at the WRITER and `18 §9`
    // makes main the trusted side, so a renderer that sent `01-F23`'s key would be a second
    // writer of the identity — and two rules make one customer two permanent rows.
    expect(recorded[0]).toMatchObject({ dialled: DIALLED, name: null });
    // `27-F6` — not one letter was typed to get here.
    expect(recorded[0]).not.toHaveProperty("phone_e164");
  });

  it("filing the caller does not start an order (02-F1 — both axes, by a deliberate act)", () => {
    // The control for the test above. A `Save caller` that also created the order would pass it
    // while guessing an `order_type` that `01-F1` then makes permanent — and `02-F1` requires
    // BOTH axes at creation. It is also the same claim the oracle's §F makes about typing.
    expect(appended).toEqual([]);
  });
});
