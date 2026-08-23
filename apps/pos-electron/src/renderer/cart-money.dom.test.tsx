/**
 * ACCEPTANCE TESTS — **the counter's cart shows the money and names an off-bill line**
 * (`27-F24`, `27-F12`, `01 §4`).
 *
 * Written alongside the implementation under `20 §4.3`'s R66 amendment — the separation rule is
 * TIERED BY PATH and binds in full only on `20 §4.4`'s protected paths. This is a renderer, it
 * computes no money and writes no event; the mutation matrix is in the session report.
 *
 * ## The defect, measured on a real Electron till at 1366×768 (August 2026)
 *
 * The cart rendered `1 Chicken Biryani  ✕ NO` — name, quantity, removal control, and **no money on
 * any row**. The only figure on the surface was `TOTAL Rs 989`. After a void the cart row was
 * **byte-identical to the three live rows**; the only evidence was the total moving 1,059 → 989.
 *
 * **`OpenOrderSchema.lines[].billed_paisa` has been REQUIRED at this seam since `02-F20`'s
 * correctives landed, and `states` beside it.** `main/gateway.ts` fills both from the fold,
 * `LineCorrection`'s picker renders them (`1 × Raita / Rs 0 / already voided`), and `Counter.tsx`
 * dropped both on the floor between the seam and the cart. That is this wave's named recurring
 * defect — a correct subsystem with no seam to the product — in the same shape as the `onRemove`
 * argument this file's sibling closed, and no suite could see it: all 1305 renderer tests were
 * green.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`)
 *
 * **P1 — the money on a cart row is the ENGINE's `billed_paisa`, passed through.** `26 §8` and the
 * T-01-11 ruling: *fold logic is never reimplemented outside `packages/sync-client`*. `qty ×
 * unit_price` looks like multiplication and is not — it is `billedCellPaisa`, carrying `01-F30`'s
 * exited-line rule and `CONTESTED_LINE_BILLABLE` — so a screen that computed it would disagree
 * with the total below it on exactly the rows a correction touches. `paisa()` at the call site
 * only restores `00 §6`'s brand to a number the IPC schema has already narrowed.
 *
 * **P2 — an off-bill line is `01 §4`'s EXIT states and only those: `voided` and `cancelled`.**
 * `served` and `delivered` are terminal and bill in full. The named alternative is to reuse
 * `LineCorrection`'s `TERMINAL` set, which lists all four — refused because it answers a different
 * question (*can this line still be corrected*) and would put a dead-line treatment on every dish
 * that reached a customer.
 *
 * **P3 — a CONTESTED line is not called voided.** `merge.ts` renders a disputed line as its whole
 * terminal MVR set because `01-F31` says *a fold never picks a winner*, and
 * `CONTESTED_LINE_BILLABLE` is RATIFIED TRUE, so such a line is **still billed at full value**.
 * The predicate is therefore `states.length === 1`, which is `billedCellPaisa`'s own guard — the
 * word and the figure are two renderings of one decision. Saying `VOIDED` over a line the customer
 * is being charged for would be the cart lying about money.
 *
 * **P4 — a COMPED and a DISCOUNTED line show NOTHING, and that is a decision.** `merge.ts`'s
 * `comp.recorded` and `discount.recorded` arms are **projection-inert** (`DEC-MONEY-010` gate
 * (iii) wants an oracle-pinned merge rule in `26 §7`; `26 §7` records that it is still owed), so
 * the fold projects no per-line comp and no per-line discount and this device has nothing to read.
 * They render as full-price live lines because the bill did not move — which is what
 * `LineCorrection`'s act tile already says in words (*"Recorded — the bill does NOT change yet"*).
 * A device-local marker is refused: it dies on reload, disagrees with every other till, and would
 * put *"money came off"* beside a bill that still carries it. §D pins the consequence so a later
 * fold arm cannot land without someone reading this.
 *
 * ## What this file deliberately does NOT assert
 *
 * - **Geometry.** happy-dom lays nothing out — every `getBoundingClientRect` is zeroes. Adding a
 *   money column made every cart row wider inside a fixed column, and `pnpm layout:check` owns
 *   that in Blink; `layout-gate/preload.ts` now carries a voided line so the gate has the state to
 *   measure. Nine layout defects in this repo were found there or by launching, none here.
 * - **The row's own shape** — the fill, the token pairing, the reading order. `packages/ui`'s
 *   `cart-money.dom.test.tsx` owns those.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
import { Counter, offBillWord } from "./Counter";

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
  businessDay: "2026-08-23",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const KARAHI = 45_000;
const NAAN = 6_000;

/**
 * The order the till was carrying when the defect was found: live lines at different prices, and
 * one line the fold has taken off the bill.
 *
 * The two live figures are deliberately NOT proportional to their quantities — 4 naan at Rs 60 is
 * Rs 15 each — so no per-unit reading and no row-constant reading can pass §A.
 */
const line = (over: Partial<OpenOrder["lines"][number]>): OpenOrder["lines"][number] => ({
  line_id: "line-karahi",
  name: "Karahi",
  quantity: 1,
  modifiers: [],
  removals: [],
  note: null,
  billed_paisa: KARAHI,
  ...over,
});

const ORDER: OpenOrder = {
  order_id: "order-1",
  reference: "A-014",
  total_paisa: KARAHI + NAAN,
  paid_paisa: 0,
  channel: "counter",
  lines: [line({}), line({ line_id: "line-naan", name: "Naan", quantity: 4, billed_paisa: NAAN })],
};

const mount = (orders: OpenOrder[] = [ORDER]) => {
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => orders),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async () => ({ id: "evt-1" })),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/**
 * The cart region by the accessible name `Cart` ships. Scoped queries throughout: the menu grid
 * renders a tile named `Karahi` too, so an unscoped lookup matches both and throws — a test red
 * against a correct implementation, which is as damaging as a vacuous one.
 */
const cart = async (): Promise<HTMLElement> =>
  await screen.findByRole("region", { name: /current order/i });

/** One cart row — the direct child of the cart section that holds this dish. */
const rowFor = async (dish: string): Promise<HTMLElement> => {
  const name = within(await cart()).getByText(dish);
  let node: HTMLElement | null = name;
  while (node?.parentElement && node.parentElement.tagName !== "SECTION") node = node.parentElement;
  return node as HTMLElement;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — P1: the seam. The money reaches the glass, per line, from the engine.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 27-F24 — a cashier can read what each dish is costing", () => {
  it("every cart row carries its own line total", async () => {
    mount();
    render(<Counter />);
    expect(
      within(await rowFor("Karahi")).getByText(/Rs\s*450/),
      "the cart rendered `1 Karahi ✕ NO` and no money — a cashier cannot check her own work",
    ).toBeTruthy();
    expect(within(await rowFor("Naan")).getByText(/Rs\s*60/)).toBeTruthy();
  });

  /**
   * ⚠ **THE ASSERTION §A EXISTS FOR — it is the SEAM, not the rendering.** `Cart` can be perfect
   * and this screen can still pass it the wrong number, which is the whole class of defect this
   * repo keeps recording. The three plausible wrong sources all put a figure on the row:
   *   · `total_paisa` — the ORDER total, repeated;
   *   · a unit price re-derived here — `Rs 15` for the naan;
   *   · nothing at all, the shipped state.
   * Two rows at Rs 450 and Rs 60 against an order total of Rs 510 separate all three at once.
   */
  it("the figure is the ENGINE's `billed_paisa` for THAT line, never the order total", async () => {
    mount();
    render(<Counter />);
    const naan = await rowFor("Naan");
    expect(within(naan).queryByText(/Rs\s*510/), "the ORDER total is on a line row").toBeNull();
    expect(
      within(naan).queryByText(/Rs\s*15/),
      "a unit price was derived in the renderer",
    ).toBeNull();
    expect(within(naan).getByText(/Rs\s*60/)).toBeTruthy();
  });

  it("the TOTAL is still the fold's own and still on the surface", async () => {
    mount();
    render(<Counter />);
    expect(within(await cart()).getByText(/Rs\s*510/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — P2/P3: `offBillWord` is the whole of the cart's off-bill policy, so it is asserted as a
// value rather than through a render.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01 §4 — which lines the cart says have left the bill", () => {
  it("the two EXIT states each get their own word", () => {
    expect(offBillWord(["voided"])).toBe("VOIDED");
    expect(offBillWord(["cancelled"])).toBe("CANCELLED");
  });

  /**
   * ⚠ **P2's assertion.** `LineCorrection`'s `TERMINAL` set is one file over and lists all four
   * terminal states; an implementation that reused it — the obvious reuse, and the one a reviewer
   * would approve — puts a dead-line treatment and an implied `Rs 0` on every dish that was
   * actually eaten. `01-F30` bills `served` and `delivered` in full.
   */
  it("`served` and `delivered` are TERMINAL and are NOT off the bill", () => {
    expect(offBillWord(["served"])).toBeUndefined();
    expect(offBillWord(["delivered"])).toBeUndefined();
  });

  it("a live line has no word", () => {
    for (const s of ["placed", "confirmed", "in_prep", "ready", "picked_up"])
      expect(offBillWord([s])).toBeUndefined();
  });

  /**
   * ⚠ **P3's assertion, and the one with money behind it.** `CONTESTED_LINE_BILLABLE` is RATIFIED
   * TRUE, so a line contested between `served` and `voided` is **billed at full value** — and
   * `billedCellPaisa` zeroes a cell on exactly `states.length === 1 && EXITED.has(...)`. An
   * implementation that asked `states.includes("voided")` reads naturally, passes every test
   * above, and prints `VOIDED` beside the full price of a dish the customer is being charged for.
   */
  it("a CONTESTED line is not called voided — 01-F31, and its money says so", () => {
    expect(offBillWord(["served", "voided"])).toBeUndefined();
    expect(offBillWord(["voided", "cancelled"])).toBeUndefined();
  });

  it("an unprojected line has no word — absence is a meaning, not a gap", () => {
    // `OpenOrderSchema.lines[].states` is `.optional()` and its own comment says an absent value
    // *"disables the control rather than enabling a guess"*. The same applies to a word.
    expect(offBillWord(undefined)).toBeUndefined();
    expect(offBillWord([])).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the word and the zero reach the glass together, through the shipped screen.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 27-F12 — a voided row is visibly not a live row", () => {
  const VOIDED: OpenOrder = {
    ...ORDER,
    total_paisa: KARAHI,
    lines: [
      line({}),
      line({
        line_id: "line-naan",
        name: "Naan",
        quantity: 4,
        billed_paisa: 0,
        states: ["voided"],
      }),
    ],
  };

  it("the voided dish's row says VOIDED and shows the fold's Rs 0", async () => {
    mount([VOIDED]);
    render(<Counter />);
    const naan = await rowFor("Naan");
    expect(
      within(naan).getByText("VOIDED"),
      "after a void the cart row is byte-identical to a live one and only the total moves",
    ).toBeTruthy();
    expect(within(naan).getByText(/Rs\s*0/)).toBeTruthy();
  });

  it("no OTHER row is marked, and the live row keeps its money", async () => {
    mount([VOIDED]);
    render(<Counter />);
    const karahi = await rowFor("Karahi");
    expect(within(karahi).queryByText("VOIDED")).toBeNull();
    expect(within(karahi).getByText(/Rs\s*450/)).toBeTruthy();
  });

  it("CONTROL — the same order with the line LIVE carries no word anywhere", async () => {
    // Without this, a screen that marked every row would pass both assertions above.
    mount();
    render(<Counter />);
    expect(within(await cart()).queryByText("VOIDED")).toBeNull();
    expect(within(await cart()).queryByText("CANCELLED")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — P4: what a comp and a discount show, pinned so the decision cannot be lost.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D DEC-MONEY-010 — a comped line is a FULL-PRICE line, because the bill did not move", () => {
  /**
   * ⚠ **THIS TEST IS A TRIPWIRE ON A RULED DEGRADATION, NOT A CLAIM THAT THE PRODUCT IS FINISHED.**
   *
   * `comp.recorded` and `discount.recorded` carry `refs: [line_id]` and `merge.ts` returns from
   * both arms without touching a projection, so a comped line arrives here **identical in every
   * field** to a line nobody touched — same `billed_paisa`, same `states`. The cart therefore shows
   * it at full price, which is the TRUTH: `01-F30`'s `comp_value` and `discounts` terms are held
   * ABSENT by `DEC-MONEY-010` until `26 §7` has an oracle-pinned merge rule, so the customer still
   * owes the money.
   *
   * What this asserts is that the counter does **not** invent a marker from its own session
   * memory. When the fold arm lands, this test SHOULD fail — and whoever lands it will read this
   * comment, which is the point of writing it as a test rather than as a note.
   */
  it("a line with a comp against it is indistinguishable from a live line — 00 §5.7, named", async () => {
    // The fixture IS the point: this is what the fold hands over after a comp — an untouched cell.
    mount();
    render(<Counter />);
    const karahi = await rowFor("Karahi");
    expect(within(karahi).getByText(/Rs\s*450/)).toBeTruthy();
    expect(within(karahi).queryByText(/COMP/i), "a marker with no ledger behind it").toBeNull();
    expect(within(karahi).queryByText(/DISCOUNT/i)).toBeNull();
    expect(within(karahi).queryByText(/Rs\s*0/)).toBeNull();
  });
});
