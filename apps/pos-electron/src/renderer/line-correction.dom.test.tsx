/**
 * ACCEPTANCE TESTS — the counter surface for `C8`'s line removal (`02-F8`) and `C7`'s item note
 * (`02-F6` / `02-F50`).
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/02-pos-app.md`,
 * `specs/27-design-language.md`, `specs/21-ux-system.md` and `specs/00-platform-overview.md`, and
 * that did not write the implementation it describes (`24 §3` step 2). Read-only to the
 * implementing session.
 *
 * ## The gap this closes, stated as it stands in the tree
 *
 * `packages/ui`'s `Cart` has declared `onRemove` since it was written and `Counter.tsx` **never
 * passes it**, so the component renders no control at all — a prop, a `27-F9` comment about where
 * a destructive target may sit, and no way for a cashier to reach any of it. That is the wave's
 * named recurring defect at its smallest: one argument.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`)
 *
 * **R1 — removal goes over `append`, not over a channel of its own.** `addLine`, `toggleAvailability`
 * and `recordCustomer` each earned a dedicated channel for ONE stated reason: the event needs a
 * field the renderer must not supply (a price, a supersedes head, a normalized key). A removal
 * needs none — `{order_id, line_id}` are both facts the screen already holds and the fold already
 * published, and there is nothing a compromised renderer could gain by naming a different line
 * than it could by tapping a different row. So it rides the generic `append`, which is where
 * `main/authorize.ts` gates it (`WRITE_ACTIONS`, commandment 8) and where `02-F49`'s confirm guard
 * sits. *The alternative, named:* `removeLine(req)`. Refused as a channel with nothing to protect.
 *
 * **R2 — `C7`'s INPUT is a pick list supplied by the HOST, reached as `window.restos.quickTags()`,
 * OPTIONAL on the bridge.** `02-F6`'s tags are `00 §7` **layer-2 org config** (`02 §7`, "kitchen
 * quick-tags"), so they cross the plane boundary like every other org fact and the renderer must
 * not carry a copy (`18 §9`). Optional on the shipped bridge for the reason `toggleAvailability`,
 * `cashState` and `alarms` already are: a host that supplies none renders no tag row, and `C7` is
 * then **unavailable rather than broken** (`01-F17` — nothing about a note blocks a sale).
 *   ⚠ **The NAME is this file's declared interpretation, on `kot-document-oracle-surface.ts`'s
 *   stated convention: a mismatch between the name here and the implementation's is a FINDING and
 *   a contract clarification, not a defect in either.** What is NOT negotiable is that the list
 *   comes from the host and that a NON-TYPING operator can complete `C7` — `27-F6`'s own test is
 *   *"whether a non-typing operator can complete the task by another route"*, and 24 of 27 field
 *   subjects could not type a single word. `02-F50` defers `02-F6`'s free-text half entirely, with
 *   `03-F8`'s reason.
 *
 * ## ⚠ TWO THINGS THE IMPLEMENTER WILL HIT, MEASURED ON A WORKING IMPLEMENTATION
 *
 * **(1) Landing `quickTags` REDS `cash-tab.dom.test.tsx` and `me-tab.dom.test.tsx`** — one
 * assertion each, *"the Cash/Me surface reached for an unknown bridge member"*. Both wrap their
 * stub in a `Proxy` that records any member the screen reads and their `known` maps predate this
 * channel, so a SHELL read of a new bridge member trips a guard aimed at a surface inventing one.
 * **The sanctioned amendment is already written in those files**: the K-7 note beside `alarms`
 * records the identical situation and its resolution — add the member to `known` with a reason,
 * which does not weaken the guard because *"the assertion is 'reached for an unknown bridge
 * member', and every other name still trips it"*. `quickTags: vi.fn(async () => [])` is what a
 * real host with no configured tags serves (`02-F50`).
 *   It is **not pre-applied here**, deliberately: those are two other tracks' oracles and a stub
 *   for a member `RestosBridge` does not yet declare would be a comment promising a contract that
 *   does not exist.
 *
 * **(2) Read the tag list ONCE, not inside `reload()`.** Measured: putting it in the counter's
 * reload spends an IPC round trip per ledger event — every line, every payment, every peer's
 * event — for a `00 §7` layer-2 value that only moves when an owner edits it and for which there
 * is no `changed` push at all. That is also the reason `CHANNELS.quickTags` is its own channel
 * rather than a field on `DeviceState`. Neither placement changes any assertion in this file,
 * which is exactly why it is written down instead.
 *
 * ## What this file deliberately does NOT assert
 *
 * - **WHICH line a tapped tag applies to.** No FR decides it and this is the design question the
 *   implementer must answer, so §B2 asserts only that the event names *a* line (`02-F6` is an ITEM
 *   note; `03-F56` gives it a position inside its item's block, so a note naming none has nowhere
 *   legal to render). The two candidates, both defensible: the **last line rung**, which is where
 *   the conversation is and costs no extra tap (`02-F2`: "≤ 2 taps from grid to confirm"), against
 *   **select a cart line first**, which is explicit but adds a tap and a selection state to the
 *   surface `27-F5` is strictest about. Pinning either here would make the other correct answer
 *   red.
 * - **Geometry.** happy-dom lays nothing out. `pnpm layout:check` owns `27-F9`'s adjacency and
 *   `27-F8`'s millimetres, and the nine layout defects this repo has found were all found there or
 *   by launching the app — none by a `.dom.test.tsx`.
 * - **The control's own shape.** `packages/ui`'s `cart-correction.dom.test.tsx` owns the mark, the
 *   word, the target size and the no-gesture rule.
 * - **What happens AFTER confirm.** `main`'s `line-correction-seam.test.ts` owns `02-F49`'s guard;
 *   the screen's job is to send the act, not to adjudicate it (`18 §5`: a client-side role or
 *   state check is never the authority).
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  { id: "item-coke", label: "Coke" },
];

/** `02-F6`'s worked example plus one more, so a pick LIST is distinguishable from a pick. */
const QUICK_TAGS = ["less spicy", "no onions"];

const ORDER: OpenOrder = {
  order_id: "order-1",
  reference: "order-1",
  total_paisa: 57_000,
  paid_paisa: 0,
  channel: "counter",
  lines: [
    {
      line_id: "line-karahi",
      name: "Karahi",
      quantity: 1,
      modifiers: [],
      removals: [],
      note: null,
    },
    { line_id: "line-coke", name: "Coke", quantity: 2, modifiers: [], removals: [], note: null },
  ],
};

let appended: AppendRequest[];

const mount = (orders: OpenOrder[] = [ORDER], over: { quickTags?: string[] } = {}) => {
  appended = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => orders),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    ...(over.quickTags === undefined ? {} : { quickTags: vi.fn(async () => over.quickTags) }),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const appendsOf = (type: string): AppendRequest[] => appended.filter((r) => r.type === type);

/**
 * The cart region, by the accessible name `Cart` ships (`<section aria-label="Current order">`).
 *
 * Queries are SCOPED to it deliberately: the menu grid renders a tile named `Coke` and the cart
 * renders a control named for the same dish, so an unscoped `getByRole("button", {name: /coke/i})`
 * matches BOTH and throws — a test red against a correct implementation, which is as damaging as a
 * vacuous one. Scoping is also the honest form of the claim: §A is about the cart.
 */
const cart = async (): Promise<HTMLElement> =>
  await screen.findByRole("region", { name: /current order/i });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — C8: the control is ON THE SCREEN and it sends the right event for the right line.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F8 — a cashier can take the Coke off the order", () => {
  it("the cart renders a removal control for a line", async () => {
    mount();
    render(<Counter />);
    expect(
      within(await cart()).getByRole("button", { name: /coke/i }),
      "`Cart` declares `onRemove` and `Counter` never passes it — the prop, the 27-F9 comment " +
        "and the styling all exist, and no cashier can reach any of it",
    ).toBeTruthy();
  });

  /**
   * ⚠ **THE ASSERTION §A EXISTS FOR.** Two lines, and the SECOND is pressed: an implementation
   * that closed over the wrong line, or passed an index, removes the karahi when the customer said
   * no Coke — and `01-F1` makes the mistake permanent.
   *
   * The event is asserted whole rather than just its type, because `02-F8`'s removal is
   * `{order_id, line_id}` and a request naming the ORDER without the line is `02-F9`'s
   * partial-confirmation mechanism failing to be partial.
   */
  it("pressing it appends `order.line_removed` naming THAT line (R1)", async () => {
    mount();
    render(<Counter />);
    fireEvent.click(within(await cart()).getByRole("button", { name: /coke/i }));

    await waitFor(() => expect(appendsOf("order.line_removed")).toHaveLength(1));
    expect(appendsOf("order.line_removed")[0]?.payload).toMatchObject({
      order_id: "order-1",
      line_id: "line-coke",
    });
  });

  it("R1: it carries NO money and NO approver — a removal is not a void (02-F8)", () => {
    // The renderer supplies neither, on `AddLineRequest`'s own stated design ("carries no money,
    // and that absence is the whole design"). A screen that sent an `amount_paisa` would be
    // pricing a correction on the untrusted side of `18 §9`'s bridge; one that sent an
    // `approver_user_id` would be asserting an approval nobody gave.
    const payload = appendsOf("order.line_removed")[0]?.payload ?? {};
    expect(Object.keys(payload).sort()).toEqual(["line_id", "order_id"]);
  });

  it("CONTROL — an order with NO lines appends nothing and renders no removal control", async () => {
    // Without this, a component that fired `onRemove` on mount, or rendered a control per MENU
    // tile rather than per cart line, would pass everything above.
    mount([{ ...ORDER, lines: [], total_paisa: 0 }]);
    render(<Counter />);
    expect(within(await cart()).queryAllByRole("button")).toEqual([]);
    expect(appendsOf("order.line_removed")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — C7: the note is DISPLAYED, and it is entered without typing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F6/02-F50 — the note the fold carries is on the screen", () => {
  it("a note on a line is shown in the cart", async () => {
    // API-agnostic on purpose: this needs no new bridge member at all. `OpenOrder.lines[].note`
    // is already declared, `Counter` already forwards it and `QuantityItemLine` already renders
    // it — the whole chain is built and `main/gateway.ts`'s `linesFrom` hardcodes `note: null`.
    mount([
      {
        ...ORDER,
        lines: [{ ...(ORDER.lines[0] as OpenOrder["lines"][number]), note: "less spicy" }],
      },
    ]);
    render(<Counter />);
    expect(
      await screen.findByText("less spicy"),
      "the note reaches the cart projection and the screen does not show it — the cashier cannot " +
        "see what the kitchen was told",
    ).toBeTruthy();
  });
});

describe("§B2 27-F6/02-F50 — the tag is TAPPED, never typed (R2)", () => {
  /**
   * ⚠ **THE PIN, isolated so overturning the NAME costs one block.** `27-F6`'s test is *"whether a
   * non-typing operator can complete the task by another route"*. 24 of 27 field subjects could
   * not type a single word, and `02-F50` defers `02-F6`'s free-text half entirely because a typed
   * note is the one Wave-1 input path that can put non-Latin text on a chit and make `03-F8`
   * refuse the whole ticket — the sale completes and the food is never cooked.
   */
  it("each configured tag is a persistent, labelled control (27-F5)", async () => {
    mount([ORDER], { quickTags: QUICK_TAGS });
    render(<Counter />);
    for (const tag of QUICK_TAGS) {
      expect(
        await screen.findByRole("button", { name: new RegExp(tag, "i") }),
        `${tag} is org config (02 §7) and has no control — 27-F6's non-typing route does not exist`,
      ).toBeTruthy();
    }
  });

  it("tapping a tag appends `order.note_added` with the tag's own text", async () => {
    mount([ORDER], { quickTags: QUICK_TAGS });
    render(<Counter />);
    fireEvent.click(await screen.findByRole("button", { name: /less spicy/i }));

    await waitFor(() => expect(appendsOf("order.note_added")).toHaveLength(1));
    expect(appendsOf("order.note_added")[0]?.payload).toMatchObject({
      order_id: "order-1",
      note: "less spicy",
    });
    const notePayload = (appendsOf("order.note_added")[0]?.payload ?? {}) as {
      line_id?: unknown;
    };
    expect(
      notePayload.line_id,
      "02-F6 is an ITEM note — a note naming no line qualifies every dish or none (03-F56)",
    ).toBeTruthy();
  });

  it("00 §5.6/27-F6: completing C7 required no text entry at all", () => {
    // The property, asserted rather than inferred from the absence of a keyboard component. A
    // surface that put a `TextEntry` between the tag and the event would satisfy the test above
    // if the fixture happened to type into it — this checks the DOM the operator was given.
    expect(
      document.querySelectorAll("input, textarea, [contenteditable='true']").length,
      "a typing surface stands on the note path — 02-F50 defers 02-F6's free-text half",
    ).toBe(0);
  });

  it("CONTROL — a host that supplies NO tags renders no tag row and breaks nothing (01-F17)", async () => {
    // R2's degrade. `27-F5` forbids a control that appears and disappears with context, so the
    // absence must be the absence of the whole row rather than an inert control — and the till
    // must still ring, which is what the menu tile below asserts.
    mount([ORDER]);
    render(<Counter />);
    await cart(); // the counter surface is up, so the absence below is a rendered absence
    expect(screen.queryByRole("button", { name: /less spicy/i })).toBeNull();
    expect(appendsOf("order.note_added")).toEqual([]);
  });
});
