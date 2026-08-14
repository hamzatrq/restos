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
//
// ⚠ **A FOUNDER RULING HAS SINCE MOVED THIS FILE'S LABELS AND RETIRED ITS §C** (August 2026):
// the counter originates on four channels, `counter` is labelled `In restaurant` and `phone` is
// labelled `Call`. The stored ids are untouched. See §C's own note below and
// `channel-ruling.dom.test.tsx`, which owns the ruling.

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

  it("names the price consequence in WORDS, not by the selected tile's fill alone", async () => {
    mount([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^In restaurant$/i });
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
  // ⚠ **THE LABELS MOVED AND THE IDS DID NOT** (founder ruling, August 2026): `counter` is
  // labelled `In restaurant` and `phone` is labelled `Call`. The right-hand column below is
  // unchanged and permanently so — `01-F53` snapshots it into the event and `01-F1` forbids
  // rewriting history. `channel-ruling.dom.test.tsx` §C owns that distinction; these rows are
  // re-pointed at the new words rather than deleted, because what they assert — the chosen
  // channel travels into `order.created` — is untouched by the ruling.
  it.each([
    ["In restaurant", "counter"],
    ["Call", "phone"],
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
    await screen.findByRole("button", { name: /^Call$/i });
    tap(/^Call$/i);
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
// §C — RETIRED, not amended. ⚠ READ THIS BEFORE RE-ADDING ANYTHING LIKE IT.
//
// This section asserted *"exactly three channels are originable at the counter — counter, phone
// and foodpanda, and NOT storefront or whatsapp"*. It was a correct transcription of an
// INTERPRETATION (`ORDER_CHANNELS_AT_COUNTER`'s own header called it one and named the simpler
// alternative), and a **founder ruling in August 2026 answered it the other way**: the channels a
// cashier may originate on are in-restaurant, foodpanda, WhatsApp and call.
//
// It is retired here rather than left green-and-wrong, on AGENTS.md's own worked example: a test
// that goes on defending an overruled rule *"would have failed the correct implementation"*, and
// that one took three weeks to surface. The claim it was really protecting — that the set is
// CLOSED and cannot widen or narrow by accident — is not lost: `channel-ruling.dom.test.tsx` §A
// owns it, discovers the row from the DOM rather than from a list of labels, and still refuses
// `storefront` for `02-F9`'s reason (cloud orders are ACCEPTED in the inbox, never keyed in).
// ─────────────────────────────────────────────────────────────────────────────────────────────

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
    await screen.findByRole("button", { name: /^Call$/i });
    tap(/^Call$/i);
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — `02-F52`: ONE STATE, ONE WORD, ON BOTH TABS. ADDED 2026-08-14 by this file's test owner,
// because the surface `02-F52` is ABOUT was guarded by nothing. Measured, not assumed:
//
//   • Deleting `unavailableReason` from the Order tab's grid entirely — the tile a cashier meets
//     ~300× a shift, and the one that read `86` — left **all 1067 pos-electron tests green.**
//   • Deleting the Sold-out tab's reason text left **11 of §E's 12 green**; only §E's
//     `01-F58` disputed case died, so the PLAIN `Sold out` word was unguarded too.
//   • §E's intended guard for it, `expect(screen.queryAllByText(/^Sold out$/i).filter(…))
//     .toBeTruthy()` at the end of §E, is VACUOUS — an array is truthy however empty it is.
//     It is left exactly as it stands (it is not wrong, only weak, and it is not this FR's), and
//     this section is the assertion it was reaching for.
//
// `02-F52`'s content is that ONE cashier saw TWO names for ONE state depending on her tab: the
// Sold-out tab computes its own word from `sold_out`/`contested` and always read `Sold out`,
// while the Order tab renders `menu()`'s `unavailableReason` verbatim and that string read `86`.
// So the assertion is a CROSS-SURFACE EQUALITY rather than two hard-coded literals — the word the
// host serves and the word the renderer computes must be the same word, whichever one moves.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 02-F52 — the sold-out word reaches the glass, and it is ONE word", () => {
  /**
   * The shape `main/gateway.ts` actually serves for an 86'd item: the display verdict, the fold's
   * own two facts, and the operator-facing reason. §E's `MENU` deliberately carries `sold_out`
   * with NO reason — it is testing the toggle, not the wording — which is part of why the wording
   * went unguarded on this surface for as long as it did.
   */
  const GATEWAY_MENU: MenuItem[] = [
    { id: "item-karahi", label: "Karahi" },
    {
      id: "item-biryani",
      label: "Biryani",
      unavailable: true,
      unavailableReason: "Sold out",
      sold_out: true,
    },
    {
      id: "item-daal",
      label: "Daal",
      unavailable: true,
      unavailableReason: "Sold out — disputed",
      sold_out: true,
      contested: true,
    },
  ];

  /** The Order tab's grid passes items STRAIGHT through once a terminal has an order. */
  const OPEN: OpenOrder = {
    order_id: "order-f1",
    reference: "A-001",
    total_paisa: 0,
    paid_paisa: 0,
    lines: [],
  };

  /**
   * `Tile.tsx` composes an unavailable tile's accessible name as `${label} — ${reason}`, so this
   * reads the reason off the CONTROL and can never match the tab rail's own `Sold out` button —
   * the vacuity trap `main.ts`'s `soldOutReasonPresent` records for the layout gate, one rail over.
   */
  const tileName = (label: string): string | null =>
    screen.getByRole("button", { name: new RegExp(`^${label} — `) }).getAttribute("aria-label");

  it("renders main's reason on the ORDER tab — the tile that used to say 86", async () => {
    // MUTANT: `Counter.tsx` dropping `unavailableReason` on the way into the Order grid. Measured
    // to leave all 1067 tests green before this assertion existed; it fails here now.
    mount([OPEN], GATEWAY_MENU);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Biryani — / });
    expect(tileName("Biryani")).toBe("Biryani — Sold out");
    // `01-F58`'s CONTESTED stays its own rendered state and is not collapsed into the plain one.
    expect(tileName("Daal")).toBe("Daal — Sold out — disputed");
    // `01-F59` — an 86'd item is greyed and still SELLABLE, so the word is all that changed.
    expect(screen.getByRole("button", { name: "Karahi" })).toBeTruthy();
  });

  it("names the state with the SAME word on the Sold-out tab as on the Order tab", async () => {
    // THE PROPERTY `02-F52` EXISTS FOR. The two tabs derive the word from different places — the
    // host's join here, the renderer's own `sold_out`/`contested` read there — so this fails if
    // EITHER drifts, which is the defect the FR closed (`86` on one tab, `Sold out` on the other).
    mount([OPEN], GATEWAY_MENU);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Biryani — / });
    const onOrderTab = tileName("Biryani");

    tap(/^Sold out$/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Biryani — / })).toBeTruthy());
    const onSoldOutTab = tileName("Biryani");

    expect(onSoldOutTab, "the two tabs name one state differently (02-F52)").toBe(onOrderTab);
    // Pinned on the SOLD-OUT tab, because that literal is `Counter.tsx`'s own and this file owns
    // this screen; the host's half is pinned by `main/__acceptance__/gateway.test.ts` and
    // `availability-seam.test.ts`. `00 §5.6` is English-only and `21 §5` puts this operator at
    // plausibly non-reading — `86` is a number that has to be taught, and it never reaches glass.
    expect(onSoldOutTab).toBe("Biryani — Sold out");
    expect(onSoldOutTab).not.toMatch(/86/);
  });
});
