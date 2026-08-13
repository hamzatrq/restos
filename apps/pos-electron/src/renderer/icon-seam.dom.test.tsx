// THE COUNTER'S END OF `27 §5`'s ICON SEAM — written by the ADVERSARIAL MUTATION PASS on
// `1986e71`, not by the implementer.
//
// ⚠ WHY IT EXISTS, IN ONE MEASUREMENT. Deleting BOTH `icon={…}` attributes from `Counter.tsx` —
// the entire counter-side wiring of the icon vocabulary — left **pos-electron 1006/1006 green,
// packages/ui 387/387 green, `pnpm typecheck` exit 0 and `pnpm seams:check` clean**. Zero kills.
// That is `AGENTS.md`'s named defect of this wave word for word: *"A CORRECT SUBSYSTEM WITH NO
// SEAM TO THE PRODUCT"*, and its prescribed test is the one that was never run here — *"mutate
// the SEAM, not the logic — delete the call site and see whether anything reddens. If nothing
// does, the subsystem is decorative."*
//
// The rails cannot cover this and it is worth naming the reason rather than filing it as a miss.
// `seams:check` Rule B looks for a factory CALL — `\bName\s*\(` — and a React component is never
// a call expression; a symbol-precise sweep of `apps/*/src`, `services/*/src` and `packages/*/src`
// finds **zero** call-expression uses of `Tile` against 7 JSX uses in this file alone, so
// `TileProps.icon` was never a Rule B candidate. `pnpm layout:check` measures whether a control
// FITS, never what is drawn inside it. And the renderer suites here run under happy-dom, which
// performs no layout — so this file asserts PRESENCE, not legibility, and says so.
//
// ⚠ THE HAZARD THAT MADE THIS URGENT RATHER THAN TIDY. The sibling branch `w7/channels` rewrites
// `ORDER_CHANNELS_AT_COUNTER` at these same lines, back to `readonly { id: string; label: string }[]`
// and carrying no `icon=`. Applying that hunk on top of this branch leaves `pnpm typecheck` at
// exit 0 — the `IconName` typing that was supposed to make a symbol-less row a compile error goes
// with the hunk — and of the 57 tests that then fail, **zero** mention an icon, an svg or a
// symbol. A merge that takes one side of a conflict would un-ship the counter's icons in silence.
// This file is what breaks that silence. If the founder later rules the icons off the counter,
// this is the test to delete deliberately and by name.
//
// PROVENANCE: written after the implementation, from measured mutants. It is not one of the
// authored acceptance suites (`24 §3` step 2) and does not claim to be.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom lays nothing out, so `usePhysicalSize` needs a panel or no surface ever renders. */
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

const mount = (orders: OpenOrder[] = []) => {
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => orders),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (_req: AppendRequest) => ({ id: "evt-1" })),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    toggleAvailability: vi.fn(async () => ({ id: "evt-86" })),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/**
 * The drawing, as the DOM sees it. `27-F35` renders it `aria-hidden` with no accessible name of
 * its own — deliberately, so that the control is named by its WORD — which is exactly why it
 * cannot be found through the accessibility tree and has to be counted structurally.
 */
const drawingsIn = (el: Element): number => el.querySelectorAll("svg").length;

/**
 * The two rows this file is about, named by the word a cashier reads.
 *
 * ⚠ THE WORDS ARE THE FRAGILE PART AND THAT IS DELIBERATE. `w7/channels` renames `Counter` →
 * `In restaurant` and `Phone` → `Call`; when that lands, this list is edited in the same commit
 * and the guard keeps biting. A row-shaped selector that survived any renaming would also survive
 * the row being deleted, which is the failure this exists to catch.
 */
const ORDER_TYPE_WORDS = ["Dine-in", "Takeaway", "Delivery"] as const;
const CHANNEL_WORDS = ["Counter", "Phone", "Foodpanda"] as const;

describe("27 §5 / 00 §5.6 — the counter's learned rows carry their symbols", () => {
  it("draws a symbol on every order-type tile, beside the word and never instead of it", async () => {
    // `02-F1`'s type axis: three tiles chosen ~75x a shift (task C4) by an operator `21 §5` and
    // `00 §5.6` both put at plausibly non-reading. `27-F31` measured that population directly —
    // locally drawn pictograms 20 of 23, imported 11 of 23 — and this is the row it was measured
    // for. Both halves in one assertion on purpose: counting only the drawing would be satisfied
    // by an icon-only tile (the `27-F35` failure, and the gate is UNRUN), and counting only the
    // word is the assertion that already existed and passed the deletion.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const bare: string[] = [];
    for (const word of ORDER_TYPE_WORDS) {
      const tile = screen.getByRole("button", { name: new RegExp(`^${word}$`, "i") });
      if (drawingsIn(tile) !== 1) bare.push(`${word} (${drawingsIn(tile)} drawings)`);
      expect(tile.textContent, `27-F35: ${word} lost its word`).toMatch(new RegExp(word, "i"));
    }
    expect(bare, "an order-type tile with no symbol — 27 §5 is wired to nothing here").toEqual([]);
  });

  it("draws a symbol on every channel tile, beside the word and never instead of it", async () => {
    // `02-F42` — a channel is a PRICE KEY (`01-F60`), so this row decides what the customer is
    // charged. Same two halves, same reason.
    mount();
    render(<Counter />);
    await screen.findByRole("button", { name: /^Foodpanda$/i });

    const bare: string[] = [];
    for (const word of CHANNEL_WORDS) {
      const tile = screen.getByRole("button", { name: new RegExp(`^${word}$`, "i") });
      if (drawingsIn(tile) !== 1) bare.push(`${word} (${drawingsIn(tile)} drawings)`);
      expect(tile.textContent, `27-F35: ${word} lost its word`).toMatch(new RegExp(word, "i"));
    }
    expect(bare, "a channel tile with no symbol — 27 §5 is wired to nothing here").toEqual([]);
  });

  it("leaves the menu grid wordless-symbol-free — 27-F37's cap is what makes that correct", async () => {
    // THE CONTROL, and a real property rather than a formality. `27-F37` caps the vocabulary at
    // ~25 *absolutely stable* symbols and draws the line itself: a menu item is *"a recognition
    // target at a fixed grid position, not a symbol to be learned"*. Without this, an
    // implementation that drew something on every tile in the app would pass both tests above
    // while spending the cap on a set nobody can learn.
    mount();
    render(<Counter />);
    const item = await screen.findByRole("button", { name: /Karahi/i });
    await waitFor(() => expect(item).toBeTruthy());
    expect(drawingsIn(item), "a menu tile is drawing a chrome symbol").toBe(0);
  });
});
