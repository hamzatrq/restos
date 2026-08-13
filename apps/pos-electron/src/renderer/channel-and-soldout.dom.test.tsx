// The counter's two new surfaces: `restaurant-os.md` §8's channel-tagged quick entry
// (`02-F1`, `02-F28`, `02-F30`, `02-F42`) and `02-F7`'s Sold-out grid.
//
// PROVENANCE: written alongside the implementation (`24 §3` step 2 wants a separate session);
// derived from spec text. Owed an independent oracle pass.
//
// ⚠ **§A EXISTS BECAUSE A MUTANT SURVIVED.** Mutation matrix M8 — `startOrder` falling back to
// `?? "counter"` instead of refusing — left **all 586 tests green**, and the code comment on
// `ORDER_CHANNELS_AT_COUNTER` had *promised* a tripwire here that did not exist. That promise is
// worse than no comment (`AGENTS.md`: "a comment promising a protection that does not exist ...
// retires the hand-written assertion someone would otherwise write"), so this file is it.
//
// The no-default rule is a PINNED INTERPRETATION, not a transcription: the founder ruled it for
// `order_type`, and this extends it to `channel` on `01-F60`'s own argument against a
// house-price fallback. §A is what stops that extension being undone silently — if the founder
// rules the other way, §A is the test to change, deliberately and by name.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
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
  businessDay: "2026-08-10",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [
  { id: "item-karahi", label: "Karahi" },
  { id: "item-biryani", label: "Biryani", sold_out: true },
  { id: "item-daal", label: "Daal", sold_out: true, contested: true },
];

let appended: AppendRequest[];
let toggles: { item_id: string; available: boolean }[];
/** Every channel `menu()` was asked for, in order — §D reads this. */
let menuChannels: string[];

const mount = (orders: OpenOrder[], menu: MenuItem[] = MENU) => {
  appended = [];
  toggles = [];
  menuChannels = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => orders),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async (channel: string) => {
      menuChannels.push(channel);
      return menu;
    }),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    toggleAvailability: vi.fn(async (req: { item_id: string; available: boolean }) => {
      toggles.push(req);
      return { id: `evt-86-${toggles.length}` };
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — NO DEFAULT CHANNEL. The M8 survivor. Read the file header before changing anything here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F1/01-F60 — a type tap alone starts NOTHING", () => {
  it("appends nothing when no channel has been chosen", async () => {
    mount([]);
    render(<Counter />);
    // The type tiles are present and greyed — `27-F4` disables IN PLACE, never removes.
    expect(await screen.findByRole("button", { name: /Takeaway/i })).toBeTruthy();

    tap(/^Takeaway$/i);
    tap(/^Dine-in$/i);
    tap(/^Delivery$/i);

    // THE ASSERTION. Under `?? "counter"` all three of these become real orders priced on the
    // counter column — and `01-F53` freezes that into an append-only ledger. `01-F60` refuses a
    // house-price fallback for exactly this reason, one layer down.
    await waitFor(() =>
      expect(screen.getAllByText(/choose a channel first/i).length).toBeGreaterThan(0),
    );
    expect(appended).toEqual([]);
  });

  it("stops asking for a channel the moment one is latched (00 §5.7)", async () => {
    /**
     * ⚠ **A SECOND SURVIVOR, MEASURED AUGUST 2026 — and, like M8 above, a shipped comment had
     * already PROMISED this protection.** `Counter.tsx`'s channel tile carries
     * `setTypeRefused(false)` with the note *"a standing refusal is about the press as it was
     * made, and this is the act that resolves it. Leaving it up over a row that is now live
     * would be a false statement one tap old (`00 §5.7`)"*. Deleting that one line left **969
     * of 969 pos-electron tests green**, and left `Choose a channel first` on the glass above a
     * type row that was, by then, live.
     *
     * `AGENTS.md`: *"a comment promising a protection that does not exist is worse than no
     * comment: it retires the hand-written assertion someone would otherwise write."* This is
     * that assertion.
     *
     * **It asserts the SURFACE, not the mechanism, so it does not pick between `02-F49` (b)'s
     * two legal arms.** That FR permits either the tile carrying the reason or the press
     * producing one; on the arm where the tiles carry it the reason goes with `unavailable`, on
     * the arm shipped here it goes with `typeRefused`. Both satisfy this test, and an
     * implementation that reddened it would be one that still asks for a channel it has.
     */
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Counter(\s|$)/i });

    /**
     * ⚠ **THE MATCHERS HERE ARE TOLERANT ON PURPOSE, AND THE STRICT ONES ELSEWHERE IN THIS FILE
     * ARE A SEPARATE FINDING RATHER THAN A STYLE.** `Tile` folds a reason into its accessible
     * name (`${label} — ${reason}`), so on `02-F49` (b)'s tile-carries-the-reason arm every type
     * control is renamed — and an anchored `/^Dine-in$/i` then fails to FIND the control it was
     * about, which is a matcher failing, not a claim failing. Measured: that arm reds **11
     * tests across 3 files** on this branch, none of them for a reason `02-F49` cares about.
     * `order-entry-sequence.dom.test.tsx`'s own `exactly()` helper is the shape copied here.
     */
    const anchored = (label: string) => new RegExp(`^${label}(\\s|$|\\s—)`, "i");

    // The refused press first — the state this is about does not exist without one.
    tap(anchored("Dine-in"));
    await waitFor(() =>
      expect(screen.getAllByText(/choose a channel first/i).length).toBeGreaterThan(0),
    );

    // And now the act that resolves it.
    tap(anchored("Phone"));

    await waitFor(() =>
      expect(
        screen
          .queryAllByText(/choose a channel/i)
          .map((el) => (el.textContent ?? "").trim())
          .concat(
            screen
              .getAllByRole("button")
              .map((el) => el.getAttribute("aria-label") ?? "")
              .filter((n) => /choose a channel/i.test(n)),
          ),
        "00 §5.7 BROKEN: the counter is still asking for a channel it already has. A refusal " +
          "that outlives the act resolving it is a false statement one tap old, on the surface " +
          "21 §5 says the operator navigates by position rather than by reading.",
      ).toEqual([]),
    );
    expect(appended).toEqual([]);
  });

  it("names the price consequence in WORDS, not by the selected tile's fill alone", async () => {
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Counter$/i });
    // `Tile.selected` is explicit that a selection is "never by colour alone, so a caller marking
    // a tile selected still says so in words" (`27-F66`).
    tap(/^Foodpanda$/i);
    await waitFor(() =>
      expect(screen.getAllByText(/selling at foodpanda prices/i).length).toBeGreaterThan(0),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the channel really travels into the event.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F30/02-F28 — the chosen channel reaches order.created", () => {
  it.each([
    ["Counter", "counter"],
    ["Phone", "phone"],
    ["Foodpanda", "foodpanda"],
  ])("%s → channel %s", async (label, channel) => {
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: new RegExp(`^${label}$`, "i") });

    tap(new RegExp(`^${label}$`, "i"));
    tap(/^Takeaway$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.created");
    expect(appended[0]?.payload).toMatchObject({ channel, order_type: "takeaway" });
  });

  it("does not carry the choice into the NEXT order (02-F1 — set at creation, each time)", async () => {
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Phone$/i });
    tap(/^Phone$/i);
    tap(/^Delivery$/i);
    await waitFor(() => expect(appended).toHaveLength(1));

    // The channel row has reset, so a second order needs its own deliberate choice. Without the
    // reset an operator who took one phone order rings the rest of the shift as `phone`.
    tap(/^Takeaway$/i);
    await waitFor(() =>
      expect(screen.getAllByText(/choose a channel first/i).length).toBeGreaterThan(0),
    );
    expect(appended).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the ANTI-SCOPE tripwire on the narrowing. An INTERPRETATION, pinned so it cannot widen
// or narrow by accident. See `ORDER_CHANNELS_AT_COUNTER` for the FRs behind each exclusion.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F42 — exactly three channels are originable at the counter", () => {
  it("offers counter, phone and foodpanda — and NOT storefront or whatsapp", async () => {
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Counter$/i });

    for (const label of ["Counter", "Phone", "Foodpanda"]) {
      expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
    }
    // `02-F9` lands cloud orders in the INBOX to be accepted; `08-F8` auto-confirms aggregator
    // API orders on ingest. A counter-keyed `storefront` order is fabricated provenance in the
    // channel-economics axis `02-F42` closed the set to protect.
    for (const label of ["Storefront", "WhatsApp", "Whatsapp"]) {
      expect(screen.queryAllByText(label, { exact: true })).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the grid is greyed against the ORDER's channel, not the device's.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F60 — menu() is asked about the channel that will price the line", () => {
  it("asks for the OPEN ORDER's channel", async () => {
    mount([
      {
        order_id: "order-1",
        reference: "A-1",
        total_paisa: 0,
        paid_paisa: 0,
        lines: [],
        channel: "foodpanda",
      } as OpenOrder,
    ]);
    render(<Counter />);
    // The defect this closes: a grid pinned to `counter` offers tiles that `addLine` refuses,
    // because `addLine` resolves the price from the ORDER (`02-F42`).
    await waitFor(() => expect(menuChannels).toContain("foodpanda"));
  });

  it("asks for the PENDING choice before any order exists", async () => {
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Phone$/i });
    tap(/^Phone$/i);
    await waitFor(() => expect(menuChannels).toContain("phone"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 02-F7's Sold-out surface.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F7 — the Sold-out tab toggles availability", () => {
  const openSoldOut = async () => {
    await screen.findByText("Sold out", { exact: true });
    tap(/^Sold out$/i);
  };

  it("86s an available item — target state FALSE, and no order is touched", async () => {
    mount([]);
    render(<Counter />);
    await openSoldOut();

    tap(/^Karahi$/i);
    await waitFor(() => expect(toggles).toHaveLength(1));
    expect(toggles[0]).toEqual({ item_id: "item-karahi", available: false });
    // Nothing on this surface adds a line, which is why it is a tab and not a mode on the Order
    // grid (`27-F5` — no soft keys).
    expect(appended).toEqual([]);
  });

  it("puts a sold-out item BACK — target state TRUE, read from the fold not the tile", async () => {
    mount([]);
    render(<Counter />);
    await openSoldOut();

    // `Biryani` is `sold_out` in the fixture. `Tile` fires `onPress` even when unavailable
    // (`01-F59`), which is what makes a greyed tile restorable at all.
    tap(/Biryani/i);
    await waitFor(() => expect(toggles).toHaveLength(1));
    expect(toggles[0]).toEqual({ item_id: "item-biryani", available: true });
  });

  it("clears an 01-F58 CONTEST in one tap, and says it is disputed", async () => {
    mount([]);
    render(<Counter />);
    await openSoldOut();

    expect(screen.getAllByText(/sold out — disputed/i).length).toBeGreaterThan(0);
    tap(/Daal/i);
    await waitFor(() => expect(toggles).toHaveLength(1));
    // A contested item resolves to UNAVAILABLE (`01-F58`), so the act that clears it asks for
    // available — and main supersedes every head at once.
    expect(toggles[0]).toEqual({ item_id: "item-daal", available: true });
  });

  it("does NOT grey an unpriced item — 01-F60's state is not 01-F59's", async () => {
    mount(
      [],
      [{ id: "item-x", label: "Nihari", unavailable: true, unavailableReason: "no price set" }],
    );
    render(<Counter />);
    await openSoldOut();
    // The tile is on this grid and is NOT presented as sold out: nobody has 86'd it. A surface
    // reading `unavailable` instead of `sold_out` would tell the operator the kitchen ran out of
    // something no one has touched.
    expect(screen.queryAllByText(/^Sold out$/i).filter((e) => e.tagName !== "SPAN")).toBeTruthy();
    tap(/Nihari/i);
    await waitFor(() => expect(toggles).toHaveLength(1));
    expect(toggles[0]).toEqual({ item_id: "item-x", available: false });
  });
});
