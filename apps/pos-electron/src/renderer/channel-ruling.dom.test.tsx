// ACCEPTANCE TEST — the founder's channel ruling, counter-surface half.
//
// PROVENANCE (`24 §3` step 2): **authored from spec text only**, by a session that wrote no
// implementation. The ruling it transcribes:
//
//   > The order types are takeaway, delivery, dine-in (unchanged). The channels a cashier may
//   > originate on are **in-restaurant, foodpanda, WhatsApp, and call**.
//   > `counter` is LABELLED "In restaurant" — the stored value stays `counter`, because `01-F53`
//   > snapshots the channel into the event and `01-F1` forbids rewriting history, so the id is
//   > permanent and only the label changes. `call` is likewise the label for the stored `phone`.
//
// The trusted-side half — that `02-F42`'s enum already contains `whatsapp` and needs no diff,
// and that the dev seed prices the channel a cashier can now choose — is
// `main/__acceptance__/channel-ruling.test.ts`. **Both are required and neither is sufficient**:
// a row offering a channel nothing prices greys every tile, and a priced channel no row offers
// is dead weight. This product has shipped each of those defects once.
//
// ⚠ THIS FILE OVERRULES A GREEN TEST, deliberately and by name. `channel-and-soldout.dom.test.tsx`
// §C asserts *"exactly three channels are originable at the counter — and NOT storefront or
// whatsapp"*, transcribing an interpretation this ruling replaces. AGENTS.md's own worked example
// (`catalog-pricing.test.ts:394`) is a green test that went on defending an overruled rule for
// three weeks and would have failed the correct implementation; §C is amended in the same commit
// as this file for exactly that reason.
//
// WHAT THIS FILE DOES NOT ASSERT, stated so the gap is visible rather than convenient:
//   * that the row FITS on a small panel. happy-dom performs no layout — every rect is zero —
//     so a four-tile row that pushes `Send to kitchen` off the glass is invisible here and is
//     `pnpm layout:check`'s to catch, on `tablet-10.1` and `netbook-1024` in particular.
//   * what a printed document calls these channels. `packages/escpos`'s `CHANNEL_LABELS` still
//     reads `Counter`/`Phone`; whether the ruling reaches paper is a founder question and
//     `escpos` is a protected path (commandment 10). Reported, not decided here.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  businessDay: "2026-08-13",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [
  { id: "item-karahi", label: "Karahi" },
  { id: "item-naan", label: "Naan" },
];

/**
 * **The ruling, as a table: what the cashier reads ⇢ what the ledger stores.**
 *
 * The whole of this file's subject is that these two columns are DIFFERENT for two of the four
 * rows. `01-F53` snapshots the right column into `order.created` and `01-F60` resolves a price
 * by it; the left column is English and may be changed by a founder on a Tuesday.
 *
 * Order is `27-F4`'s, not the ruling sentence's — see §B.
 */
const RULED_CHANNELS = [
  { label: "In restaurant", id: "counter" },
  { label: "Call", id: "phone" },
  { label: "Foodpanda", id: "foodpanda" },
  { label: "WhatsApp", id: "whatsapp" },
] as const;

let appended: AppendRequest[];
let lines: AddLineRequest[];
/** Every channel `menu()` was asked for, in order — §D reads this. */
let menuChannels: string[];

const mount = (orders: OpenOrder[] = [], menu: MenuItem[] = MENU) => {
  appended = [];
  lines = [];
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
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
    toggleAvailability: vi.fn(async () => ({ id: "evt-86" })),
    lookupCustomer: vi.fn(async () => ({ phone_e164: null, name: null, addresses: [] })),
    recordCustomer: vi.fn(async () => ({ id: "evt-customer" })),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tap = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/**
 * The channel row's tiles, **discovered from the DOM** rather than transcribed.
 *
 * Discovery is the point: a hard-coded list of four labels can only ever prove that four
 * particular tiles exist, and the anti-scope claim in §A is that a FIFTH does not. It is
 * anchored on the row's own state line, which `27-F66` requires to exist ("a selection is never
 * by colour alone"), and it throws a named `24-F14` failure rather than returning `[]` if the
 * anchor moves — an empty match here would pass every assertion in §A and §B for ever.
 */
const CHANNEL_ROW_ANCHOR = /choose a channel first/i;

const channelTiles = (): HTMLButtonElement[] => {
  const line = screen.getAllByText(CHANNEL_ROW_ANCHOR)[0];
  const row = line?.parentElement;
  const tiles = row === null || row === undefined ? [] : [...row.querySelectorAll("button")];
  if (tiles.length === 0) {
    throw new Error(
      "24-F14 EMPTY MATCH — no channel tiles found beside the row's own state line. Either the " +
        "row stopped rendering, or its markup moved and THIS HELPER must be re-pointed " +
        "deliberately: returning an empty list here would satisfy §A and §B vacuously.",
    );
  }
  return tiles as HTMLButtonElement[];
};

const channelLabels = (): string[] =>
  channelTiles().map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim());

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SET. Four, and exactly four.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F42 — the counter originates on the ruling's four channels", () => {
  it("offers all four, by the words the ruling gives them", async () => {
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^In restaurant$/i });

    // WRONG IMPLEMENTATION THIS CATCHES: `whatsapp` added to the price seed and to `02-F42`'s
    // enum — both of which are already true — and never to the row, so no cashier can choose it.
    // That is this wave's named defect (a correct subsystem with no seam to the product) in its
    // cheapest form, and it fails no other test in this package.
    expect(channelLabels()).toEqual(RULED_CHANNELS.map((c) => c.label));
  });

  it("offers NOTHING ELSE — storefront in particular", async () => {
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^In restaurant$/i });

    // `02-F42`'s fifth member is deliberately NOT here, and the ruling did not add it: `02-F9`
    // lands cloud orders in an INBOX to be accepted, so a counter-keyed `storefront` order is
    // fabricated provenance in the channel-economics axis the closed set exists to protect.
    // Widening is one line and is additive; this is what stops it happening by accident.
    expect(channelTiles()).toHaveLength(RULED_CHANNELS.length);
    expect(channelLabels()).not.toContain("Storefront");
  });

  it("the OLD words are gone from the row — a cashier reads one vocabulary, not two", async () => {
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^In restaurant$/i });

    // WRONG IMPLEMENTATION THIS CATCHES: the label added ALONGSIDE the old one ("Counter — in
    // restaurant"), or a fifth tile added instead of the third being renamed. `00 §5.6` puts
    // this cashier's reading at "little English": two words for one act is the exact cost that
    // rule exists to refuse, and it is invisible to a test that only checks the new word is
    // present.
    for (const stale of ["Counter", "Phone"]) {
      expect(channelLabels(), `${stale} is the pre-ruling word for a channel`).not.toContain(stale);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — POSITION. ⚠ A PINNED INTERPRETATION, not a transcription. Read this before changing it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F4 — the three learned tiles do not move, and the new one is appended", () => {
  it("keeps In restaurant, Call and Foodpanda in their shipped positions", async () => {
    // ⚠ **THE RULING'S SENTENCE LISTS A SET, AND THIS FILE READS IT AS A SET.** It says
    // "in-restaurant, foodpanda, WhatsApp, and call", which is neither the order the row ships
    // in (counter, phone, foodpanda) nor an order anything else in the corpus asks for.
    //
    // `27-F4` decides it instead: adding, removing or REORDERING an operational item is a
    // breaking change, and "keeping a learned control where a finger already goes is the
    // stronger half" — `Counter.tsx`'s own comment on this row, which added it BELOW the type
    // row on exactly that reasoning. Given the ruling's four, `27-F4` leaves only one
    // arrangement: the three that exist stay where a hand already reaches for them, and the
    // fourth goes on the end. Inserting WhatsApp anywhere else moves `Foodpanda`, and reading
    // the sentence positionally moves `Call` past two tiles.
    //
    // **If the founder rules that the sentence WAS positional, THIS is the test to change** —
    // deliberately and by name, the way `channel-and-soldout.dom.test.tsx` §A says of the
    // no-default rule. It is not a bug in the implementation.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^In restaurant$/i });

    const labels = channelLabels();
    expect(labels.indexOf("In restaurant")).toBe(0);
    expect(labels.indexOf("Call")).toBe(1);
    expect(labels.indexOf("Foodpanda")).toBe(2);
    expect(labels.indexOf("WhatsApp")).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE LOAD-BEARING HALF. The label is English; the id is permanent.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F53/01-F1 — a tap stores the ID, whatever the tile is called", () => {
  it.each(RULED_CHANNELS.map((c) => [c.label, c.id] as const))(
    "%s → order.created.channel = %s",
    async (label, id) => {
      mount();
      render(<Counter />);
      await screen.findByRole("button", { name: new RegExp(`^${label}$`, "i") });

      tap(new RegExp(`^${label}$`, "i"));
      tap(/^Takeaway$/i);

      await waitFor(() => expect(appended).toHaveLength(1));
      expect(appended[0]?.type).toBe("order.created");
      // WRONG IMPLEMENTATION THIS CATCHES, and it is the one the ruling warns about in the same
      // breath as making it: renaming the id with the label — `{ id: "in_restaurant" }`,
      // `{ id: "call" }`. It typechecks (`ORDER_CHANNELS_AT_COUNTER` is `{ id: string }`), it
      // reads consistently, and it puts an `01-F4` refusal between a cashier and every sale on
      // the busiest channel in the shop. The trusted side refuses it; nothing until now asserted
      // that the till stays on the right side of that refusal.
      expect(appended[0]?.payload).toMatchObject({ channel: id, order_type: "takeaway" });
    },
  );

  it("WhatsApp carries both axes, and the type is NOT the channel", async () => {
    // `02-F42`: "`channel` and `order_type` are different axes and neither substitutes for the
    // other ... a channel value drawn from that vocabulary is invalid." A WhatsApp order is a
    // delivery, a takeaway or eaten in; the two fields are set by two different taps and this
    // asserts the second did not overwrite the first.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^WhatsApp$/i });

    tap(/^WhatsApp$/i);
    tap(/^Delivery$/i);

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.payload).toMatchObject({ channel: "whatsapp", order_type: "delivery" });
  });

  it("a type tap alone still starts nothing — the no-default rule survives the fourth tile", async () => {
    // `channel-and-soldout.dom.test.tsx` §A owns this rule and records that a `?? "counter"`
    // fallback once survived every test in the package. Re-asserted here only because THIS file
    // rewrites the row it guards: a session adding a tile is one keystroke from adding a
    // default with it, and `01-F60` makes that default a WRONG PRICE frozen by `01-F53`.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^In restaurant$/i });

    tap(/^Takeaway$/i);

    await waitFor(() => expect(screen.getAllByText(CHANNEL_ROW_ANCHOR).length).toBeGreaterThan(0));
    expect(appended).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — WHATSAPP IS ACTUALLY RINGABLE. Not "the tile exists" but "the order can be sold".
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F60 — latching WhatsApp puts a sellable grid in front of the cashier", () => {
  it("asks the catalog for whatsapp prices, not the device's own column", async () => {
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^WhatsApp$/i });

    tap(/^WhatsApp$/i);
    // `01-F60` resolves per `(branch, channel)` with NO fallback, so the greying a cashier sees
    // must be computed against the channel that will price the line. A grid still pinned to
    // `counter` offers tiles `addLine` will refuse.
    await waitFor(() => expect(menuChannels).toContain("whatsapp"));
  });

  it("shows the ITEM GRID, and a tile on it adds a line", async () => {
    mount([
      {
        order_id: "order-wa",
        reference: "A-1",
        total_paisa: 0,
        paid_paisa: 0,
        lines: [],
        channel: "whatsapp",
      } as OpenOrder,
    ]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^WhatsApp$/i });

    tap(/^WhatsApp$/i);
    // WRONG IMPLEMENTATION THIS CATCHES: WhatsApp wired through `PHONE_CHANNEL`'s branch —
    // plausible, because a WhatsApp order also arrives with a number attached. It would replace
    // the grid with `02-F27`'s caller pad, and no FR puts one there. The consequence is not
    // cosmetic: the cashier cannot reach a tile at all.
    tap(/^Karahi$/i);
    await waitFor(() => expect(lines).toHaveLength(1));
    expect(lines[0]).toMatchObject({ order_id: "order-wa", item_id: "item-karahi" });
  });

  it("CONTROL — Call still raises 02-F27's number pad instead of the grid", async () => {
    // The negative control for the test above: without it, "WhatsApp shows the grid" is
    // satisfied by an implementation that shows the grid on every channel, which would delete
    // `02-F27`'s caller surface and pass. One branch different, per `24 §3`'s round-3 law.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^Call$/i });

    tap(/^Call$/i);
    // The pad `02-F27` requires — ten digits and a Clear — takes the work surface while a call
    // is being taken. `Karahi` is on the grid it replaces.
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /^Karahi$/i })).toEqual([]));
    expect(screen.getByRole("button", { name: /^Clear$/i })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE STORED ID NEVER FACES THE CASHIER.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 00 §5.6 — the screen speaks the ruling's words, never the ledger's", () => {
  const fixedLine = () => {
    const found = screen.getAllByText(/its prices are fixed/i)[0];
    if (found === undefined) {
      throw new Error(
        "24-F14 EMPTY MATCH — the open order's channel line was not on screen, so this " +
          "section asserted nothing. Re-point it deliberately if that sentence moved.",
      );
    }
    return found.textContent ?? "";
  };

  it("an open COUNTER order reads In restaurant, not `counter`", async () => {
    mount([
      {
        order_id: "order-1",
        reference: "A-1",
        total_paisa: 0,
        paid_paisa: 0,
        lines: [],
        channel: "counter",
      } as OpenOrder,
    ]);
    render(<Counter />);
    await waitFor(() => expect(fixedLine()).toMatch(/in restaurant/i));

    // WRONG IMPLEMENTATION THIS CATCHES: the row's labels changed and this line left
    // interpolating the raw stored value, which is what it does today. The cashier then reads
    // `In restaurant` on the tile she pressed and `This order is counter` one line below — two
    // names for one channel, on the surface `00 §5.6` says is navigated by memorised position
    // by people who read little English. It is also the ruling's whole subject: the id is a key
    // and the label is the product's word for it.
    expect(fixedLine()).not.toMatch(/\bcounter\b/i);
  });

  it("an open WHATSAPP order reads WhatsApp — the product's own spelling", async () => {
    // `02-F1` writes "WhatsApp" and `02-F42` writes `whatsapp`; `packages/escpos`'s
    // `CHANNEL_LABELS` already resolves that the KEY is the enum and the LABEL is the product's
    // name. The counter must not be the one surface that shows the key.
    mount([
      {
        order_id: "order-2",
        reference: "A-2",
        total_paisa: 0,
        paid_paisa: 0,
        lines: [],
        channel: "whatsapp",
      } as OpenOrder,
    ]);
    render(<Counter />);
    await waitFor(() => expect(fixedLine()).toContain("WhatsApp"));
  });

  it("the latched-channel line names the tile's own words", async () => {
    // `27-F66` — "a selection is never by colour alone, so a caller marking a tile selected
    // still says so in words". Those words are the price consequence, and they must be the same
    // vocabulary as the tile: a line reading "Selling at phone prices" beside a tile reading
    // `Call` teaches two names for one act.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^Call$/i });

    tap(/^Call$/i);
    await waitFor(() => expect(screen.getAllByText(/selling at call prices/i).length).toBe(1));
  });
});
