// ACCEPTANCE — `02-F49` (a)(b)(c) and `27-F4` (e)(f): the counter's order-entry sequence.
//
// PROVENANCE: **authored from spec text only**, by a session that has written no production code
// on this branch (`24 §3`). The FRs these assert against were written in the same session and
// landed in `specs/` in the commit before this one — the ruling is spec and lands before code.
// Every assertion below names the FR clause it owns and, in its comment, the plausible WRONG
// implementation it is aimed at.
//
// ── WHAT THIS FILE IS FOR, IN ONE PARAGRAPH ─────────────────────────────────────────────────
//
// The shipped Order surface tells a cashier to do something the code refuses. `Counter.tsx`
// renders `Choose an order type first` on the TYPE row and `Choose a channel first — it sets the
// price` on the CHANNEL row **below** it, while `startOrder` is `if (pendingChannel === null)
// return;` — so the line she reads first is the false one, and the tile she then presses does
// nothing at all: no event, no mark, no reason. `02-F49` rules the three defects together
// because they are one interaction, and `27-F4` (e) makes the row order carry the sequence so
// that no sentence has to.
//
// ── THE THREE THINGS THIS FILE DELIBERATELY DOES NOT ASSERT ─────────────────────────────────
//
// 1. **Any particular sentence.** `02-F49` (a) permits a surface with NO hint line at all —
//    `21 §5`/`00 §5.6` put this operator at plausibly non-reading and position is the channel she
//    actually uses. So the assertions are about *contradiction* and *response*, never about
//    wording, and every one of them passes against an implementation that deletes the prose.
// 2. **Millimetres.** happy-dom performs no layout: every `getBoundingClientRect` is zeroes.
//    `27-F2`'s pin — a long cart must never push `Send to kitchen` below the fold — is a Blink
//    claim and is owed to `layout:check`, which is why §E asserts DOCUMENT position and says so
//    rather than pretending to measure. See the note on §E.
// 3. **A combined type × channel row.** `27-F4` (f)'s ruling says outright that merging the two
//    axes is NOT approved and is a founder call, so nothing here pushes an implementation toward
//    one or away from one.

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
  { id: "item-biryani", label: "Biryani" },
];

const TYPE_LABELS = ["Dine-in", "Takeaway", "Delivery"] as const;
const CHANNEL_LABELS = ["Counter", "Phone", "Foodpanda"] as const;

const openOrder = (over: Partial<OpenOrder> = {}): OpenOrder => ({
  order_id: "order-1",
  reference: "A-1",
  total_paisa: 0,
  paid_paisa: 0,
  lines: [],
  ...over,
});

let appended: AppendRequest[];
let lines: AddLineRequest[];
/** Every channel the grid was priced against, in order — §D reads the LAST one. */
let menuChannels: string[];

const mountWith = (orders: OpenOrder[], menu: MenuItem[] = MENU) => {
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
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const button = (name: RegExp) => screen.getByRole("button", { name });
const tap = (name: RegExp) => fireEvent.click(button(name));
const exactly = (label: string) => new RegExp(`^${label}(\\s|$|\\s—)`, "i");

/** True when `a` precedes `b` in reading order. `27-F58`'s axis, and the only one happy-dom has. */
const precedes = (a: Element, b: Element): boolean =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/**
 * Every rendered text node on the screen, trimmed and non-empty.
 *
 * Text nodes rather than `textContent` of elements, deliberately: an ancestor's `textContent`
 * concatenates its children, so a page-wide `textContent` scan would match a "sentence" that no
 * human ever sees — spliced together across two paragraphs and a button. §B and §D both make
 * claims about *what the surface says*, and a false positive there is a test that reds a correct
 * implementation, which this repo weighs as heavily as a vacuous one.
 */
const visibleTexts = (): string[] => {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const t = (node.textContent ?? "").trim();
      if (t !== "") out.push(t);
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(document.body);
  return out;
};

/** The whole accessible surface of one control — label plus the reason `Tile` folds into it. */
const accessibleName = (el: Element): string =>
  el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 02-F49 (a) / 27-F4 (e): THE ROW ORDER IS THE INSTRUCTION.
//
// `27-F7` makes a list's visual order its work order and `27-F58` fixes reading order top-down.
// The till enforces channel-then-type, so the channel row belongs above the type row and the
// sequence stops needing a sentence at all.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F49 (a) — the channel row is read BEFORE the type row", () => {
  it("puts every channel tile ahead of every type tile in reading order", async () => {
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Counter") });

    // Aimed at: the shipped arrangement, which renders the type row first and then explains the
    // sequence in prose underneath it. A pure text fix — rewording either line — leaves this red,
    // which is the point: `27-F4` (e) approved a POSITION change, and position is what is checked.
    for (const channel of CHANNEL_LABELS) {
      for (const type of TYPE_LABELS) {
        const c = button(exactly(channel));
        const t = button(exactly(type));
        expect(
          precedes(c, t),
          `02-F49 (a) / 27-F7 BROKEN: '${type}' is read before '${channel}'. The till refuses to ` +
            "create an order with no channel latched, so channel-then-type is the WORK order, " +
            "and 27-F58 makes the reading order the thing that carries it. A surface whose first " +
            "row cannot be acted on is a surface that needs a sentence to correct itself.",
        ).toBe(true);
      }
    }
  });

  it("keeps both rows PRESENT and in their own row — 27-F4/27-F5 are not relaxed by (e)", async () => {
    // The negative half of §A, and it is here because the cheapest way to make the assertion
    // above pass is to delete the type row until a channel is latched. `27-F5` forbids exactly
    // that (a control that appears with context is a context-dependent control) and `27-F4`
    // calls removing an operational item a breaking change. `27-F36` forbids the other cheap
    // pass — folding the two axes into one 2-D grid.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Counter") });

    for (const label of [...CHANNEL_LABELS, ...TYPE_LABELS]) {
      expect(
        screen.getAllByRole("button", { name: exactly(label) }).length,
        `27-F5 BROKEN: '${label}' is not on the empty Order surface`,
      ).toBe(1);
    }
    // Two rows, not one grid: no type tile shares a parent element with a channel tile.
    for (const channel of CHANNEL_LABELS) {
      for (const type of TYPE_LABELS) {
        expect(
          button(exactly(channel)).parentElement === button(exactly(type)).parentElement,
          `27-F36: '${channel}' and '${type}' share a row. Merging the two axes into one ` +
            "combined row is explicitly NOT approved (27-F4 (f)) — which combinations are real " +
            "is stated in no FR, and a 2-D matrix is a literacy-dependent encoding.",
        ).toBe(false);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 02-F49 (a): NO LINE NAMES A PRECONDITION THE CODE DOES NOT ENFORCE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F49 (a) — the surface never instructs the operator to start with the type", () => {
  it("names no first step other than the channel, on an empty counter", async () => {
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Counter") });

    /**
     * The property, stated so it cannot be satisfied by wording alone: **whatever the surface
     * calls the first step, it is the channel.** A surface that says nothing passes — that is
     * `02-F49` (a)'s own permission and the shape `27-F4` (e) makes possible — and a surface that
     * says `Choose a channel first` passes. Only a surface that points at the OTHER row fails.
     *
     * Aimed at: `Counter.tsx:1770`'s `Choose an order type first`, which is the line a cashier
     * reads first on ~75 orders a shift and which the code refuses to honour. It is also aimed at
     * the tempting half-fix — reorder the rows and leave both sentences where they are.
     */
    const firstStep = visibleTexts().filter((t) => /\bfirst\b/i.test(t));
    for (const line of firstStep) {
      expect(
        /channel|counter|phone|foodpanda/i.test(line),
        `02-F49 (a) BROKEN: "${line}" names a first step that is not the channel. startOrder ` +
          "refuses without a latched channel, so this instruction cannot be carried out — and " +
          "00 §5.6 says staff who read little navigate by memorized position, which means a " +
          "sentence they cannot act on is worse than no sentence.",
      ).toBe(true);
    }
  });

  it("says nothing about the ORDER TYPE being required before the channel", async () => {
    // The same property from the other side, because §B's first test is satisfiable by a line
    // that mentions both words. `27-F58` and `02-F49` (a) are about which act comes first; a
    // sentence naming the type as the precondition is false regardless of what else is in it.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Counter") });

    for (const line of visibleTexts()) {
      expect(
        /(order type|type)[^a-z]{0,12}first/i.test(line),
        `02-F49 (a) BROKEN: "${line}" states that the order type comes first. It does not — ` +
          "`startOrder` returns without appending when no channel is latched.",
      ).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 02-F49 (b): A TAP ON A GREYED TYPE TILE IS NOT A SILENT NO-OP.
//
// `27-F5`'s named failure mode, and `02-F48`'s ruling one surface over: a press worth nothing
// produces a REASON instead of an event.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F49 (b) — a refused type tap says why", () => {
  it.each(TYPE_LABELS)("%s: the press produces a reason, and no event", async (label) => {
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly(label) });

    const before = visibleTexts().join(" ");
    const nameBefore = accessibleName(button(exactly(label)));
    tap(exactly(label));
    // Let any state the press set actually render before reading the screen back.
    await waitFor(() => expect(appended).toEqual([]));

    const after = visibleTexts().join(" ");
    const nameAfter = accessibleName(button(exactly(label)));

    /**
     * **A DISJUNCTION, and it is deliberate rather than weak.** `02-F49` (b) says *"either the
     * tile carries the reason that resolves it, or pressing it produces one"*, and both are
     * legal answers — the first is `27-F4`'s disable-in-place with its reason (what
     * `Send to kitchen` beside it already does), the second is `02-F48`'s press-produces-a-reason.
     * A test that demanded one would red the other, correct implementation.
     *
     * Aimed at: the shipped code, which does NEITHER. The type tiles are passed no
     * `unavailableReason` at all, `startOrder` returns silently, and the screen is byte-identical
     * before and after the press.
     */
    const tileCarriesReason = /channel|counter|phone|foodpanda/i.test(
      nameAfter.slice(label.length),
    );
    const pressAnswered = after !== before || nameAfter !== nameBefore;
    expect(
      tileCarriesReason || pressAnswered,
      `02-F49 (b) / 27-F5 BROKEN: pressing '${label}' with no channel latched changed NOTHING ` +
        "on the screen and the tile carries no reason. That is a control with no visible " +
        "response — 27-F5's own failure mode — and 02-F48 already ruled the same shape on the " +
        "Pay surface: a press worth nothing produces a REASON instead of an event. The reason " +
        "must name the channel, because latching one is the act that unblocks the tap.",
    ).toBe(true);
  });

  it("appends NOTHING, however loudly it refuses (02-F1, 01-F60)", async () => {
    // The `02-F49` (b) control: the remedy is a REASON, never a relaxation. An implementation
    // that made the tap "work" by defaulting the channel would satisfy every assertion above and
    // bill a phone order at counter prices, frozen by `01-F53` in a ledger `01-F1` cannot correct.
    // `channel-and-soldout.dom.test.tsx` §A owns this claim too; it is repeated here because
    // §C is the section that would break it.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Takeaway") });

    for (const label of TYPE_LABELS) tap(exactly(label));
    await waitFor(() => expect(appended).toEqual([]));
    expect(lines).toEqual([]);
  });

  it("and the tap WORKS the moment a channel is latched — the reason is not a new block", async () => {
    // The negative control for §C. A guard that refuses after the precondition is met would pass
    // every assertion above by refusing everything; this is the branch that separates "explains
    // the refusal" from "refuses more". `01-F17`: a sale is never blocked.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Phone") });

    tap(exactly("Phone"));
    tap(exactly("Takeaway"));
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.created");
    expect(appended[0]?.payload).toMatchObject({ channel: "phone", order_type: "takeaway" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 02-F49 (c): NO LINE STATES A PRICE BASIS OTHER THAN THE ONE THAT WILL BE USED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F49 (c) — the channel named beside the money is the one that prices the line", () => {
  /**
   * The pricing channel is not asserted from the fixture — it is READ BACK from the seam. The
   * grid is greyed against the channel `addLine` will price from (`01-F60`, and
   * `channel-and-soldout.dom.test.tsx` §D pins that separately), so `menu()`'s last argument IS
   * the product's own answer to "what will the next line cost". Comparing the screen's claim
   * against a hand-copied constant would be `K-3`'s dead-oracle defect: two copies of one belief,
   * agreeing with each other and with nothing.
   */
  const pricingChannel = (): string => {
    const last = menuChannels.at(-1);
    if (last === undefined) throw new Error("EMPTY MATCH (24-F14): menu() was never asked");
    return last;
  };

  const labelOf = (channel: string): string => {
    const found = CHANNEL_LABELS.find((l) => l.toLowerCase() === channel.toLowerCase());
    if (found === undefined) throw new Error(`EMPTY MATCH (24-F14): no label for '${channel}'`);
    return found;
  };

  /** Every channel word that appears in a sentence about money, anywhere on the surface. */
  const channelsNamedBesideMoney = (): string[] =>
    visibleTexts()
      .filter((t) => /price|selling|sell at|costs|rs\b/i.test(t))
      .flatMap((t) => CHANNEL_LABELS.filter((c) => new RegExp(`\\b${c}\\b`, "i").test(t)));

  it("does NOT claim the pending channel's prices while a cart sits on another channel", async () => {
    mountWith([openOrder({ order_id: "order-open", channel: "counter", total_paisa: 77_000 })]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Foodpanda") });

    // The cashier latches the channel for her NEXT order while the current one is still open —
    // the ordinary case the moment `DEC-MONEY-009` made the row live mid-order.
    tap(exactly("Foodpanda"));
    await waitFor(() => expect(menuChannels.length).toBeGreaterThan(0));

    /**
     * Aimed at: `Counter.tsx:1829`'s `Selling at ${pendingChannel} prices`, which describes the
     * NEXT order while sitting above a cart holding the CURRENT one. `01-F60` prices a line from
     * the ORDER's channel, so with a counter order open and `foodpanda` latched the sentence is
     * simply false — about money, on the axis `01-F53` freezes permanently (`00 §5.7`).
     *
     * A surface that says NOTHING about prices passes, and that is `02-F49` (c)'s own wording:
     * *"silence is permitted; a wrong channel is not."*
     */
    const priced = pricingChannel();
    for (const named of channelsNamedBesideMoney()) {
      expect(
        named.toLowerCase(),
        `02-F49 (c) BROKEN: the surface names '${named}' beside money while the next line will ` +
          `price against '${priced}'. 01-F60 prices a line from the ORDER's channel, and a ` +
          "false statement about money is 00 §5.7's failure whatever the intent.",
      ).toBe(labelOf(priced).toLowerCase());
    }
  });

  it("MAY still name the channel when the claim is TRUE — with no cart, the pending one prices", async () => {
    /**
     * **The negative control, and the reason §D is not a blanket ban on the word.** With nothing
     * open, the latched channel is exactly what the grid is priced against and what the next
     * `order.created` will carry, so `Selling at Foodpanda prices` is a TRUE statement and
     * `27-F66` positively wants the selection said in words rather than carried by fill alone.
     *
     * If a fix silences the line in this state too, this test still passes (no text, no claim) —
     * but if a fix makes the SHAPE of the sentence illegal rather than its falsehood, this is the
     * assertion that says so, because the mutant "delete every mention of a channel" reddens
     * nothing here and `channel-and-soldout.dom.test.tsx` §A's `selling at foodpanda prices`
     * assertion is the pre-existing column that catches it.
     */
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: exactly("Foodpanda") });

    tap(exactly("Foodpanda"));
    await waitFor(() => expect(menuChannels).toContain("foodpanda"));

    const priced = pricingChannel();
    expect(priced).toBe("foodpanda");
    for (const named of channelsNamedBesideMoney()) {
      expect(named.toLowerCase()).toBe(labelOf(priced).toLowerCase());
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 27-F4 (f): `Send to kitchen` LIVES AT THE FOOT OF THE CART COLUMN.
//
// ⚠ **WHAT THIS SECTION CANNOT SEE.** `27-F4` (f) pins the control so a long cart cannot push it
// below the fold, and that is a MEASUREMENT: happy-dom performs no layout, so this file can only
// assert WHERE the control is in the document, never whether it is on the glass. The pin belongs
// to `layout:check`, which opens a real `BrowserWindow` and measures in Blink — see
// `layout-gate/preload.ts`'s long-cart fixture, added with this suite for exactly that reason.
// Reading §E as coverage of `27-F2` is the mistake this repo has recorded nine times.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 27-F4 (f) — the confirm control is at the foot of the cart, not beside `Delivery`", () => {
  const cart = (): HTMLElement => {
    const el = document.querySelector('section[aria-label="Current order"]');
    if (el === null) throw new Error("EMPTY MATCH (24-F14): the cart is not on the screen");
    return el as HTMLElement;
  };

  it("is read AFTER the cart's lines and its total", async () => {
    mountWith([
      openOrder({
        order_id: "order-open",
        total_paisa: 77_000,
        lines: [
          {
            line_id: "l-1",
            name: "Chicken Karahi",
            quantity: 1,
            modifiers: [],
            removals: [],
            note: null,
          },
          {
            line_id: "l-2",
            name: "Garlic Naan",
            quantity: 4,
            modifiers: [],
            removals: [],
            note: null,
          },
        ],
      }),
    ]);
    render(<Counter />);
    const send = await screen.findByRole("button", { name: /Send to kitchen/i });

    /**
     * Aimed at: the shipped position — the top-left row, ~2.5 mm from `Delivery`, where since
     * `DEC-MONEY-009` an undershoot **starts a new order and switches the cart**. `27-F9` is the
     * general rule (a destructive act is never adjacent to a high-frequency one) and here the
     * neighbour of the confirm control is literally "abandon this cart".
     *
     * `27-F58` is the positive half: the control acts on the CART, so it belongs where the
     * reading of the cart ends. A fix that moves it anywhere else on the surface fails this.
     */
    expect(
      precedes(cart(), send),
      "27-F4 (f) BROKEN: `Send to kitchen` is read before the cart it acts on. It belongs at the " +
        "foot of the cart column — where the eye already ends — and not in the type row, where " +
        "its neighbour is a tile that starts a different order.",
    ).toBe(true);
    for (const text of ["Chicken Karahi", "Garlic Naan", "TOTAL"]) {
      const node = screen.getAllByText(new RegExp(text, "i"))[0];
      if (node === undefined) throw new Error(`EMPTY MATCH (24-F14): '${text}' is not rendered`);
      expect(precedes(node, send), `27-F4 (f): '${text}' should be read before the control`).toBe(
        true,
      );
    }
  });

  it("no longer shares a row with an order-type tile", async () => {
    mountWith([openOrder({ order_id: "order-open", total_paisa: 77_000 })]);
    render(<Counter />);
    const send = await screen.findByRole("button", { name: /Send to kitchen/i });

    for (const label of TYPE_LABELS) {
      expect(
        button(exactly(label)).parentElement === send.parentElement,
        `27-F4 (f) BROKEN: '${label}' and \`Send to kitchen\` are siblings in one row. That is ` +
          "the adjacency the ruling removes: an undershoot on the confirm control starts a new " +
          "order and switches the cart, leaving the half-rung one reachable only by a fallback.",
      ).toBe(false);
    }
  });

  it("still confirms the cart's own order in ONE tap (02-F8, 21 §4)", async () => {
    // The control for §E: a move is a move. `21 §4` counts grid → confirm at ≤ 2 taps and
    // `02-F8` makes this append the whole kitchen handoff, so a relocation that cost a step —
    // a scroll, a second surface, an expander — would be a regression wearing a fix's clothes.
    mountWith([openOrder({ order_id: "order-42", total_paisa: 77_000 })]);
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /Send to kitchen/i }));

    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]?.type).toBe("order.confirmed");
    expect(appended[0]?.payload.order_id).toBe("order-42");
  });

  it("keeps its own reason when there is nothing to send (27-F4, 27-F5)", async () => {
    // Unchanged by the move, and asserted because a relocated control is the easiest place to
    // drop a property nobody re-checked. `27-F5`: disabled IN PLACE, with the reason — this is
    // the control that already did it right, and it is the model `02-F49` (b) points the type
    // row at.
    mountWith([]);
    render(<Counter />);
    const send = await screen.findByRole("button", { name: /Send to kitchen/i });
    expect(accessibleName(send)).toMatch(/no order started/i);
  });
});
