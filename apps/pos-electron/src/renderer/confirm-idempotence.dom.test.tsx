// ACCEPTANCE TESTS — `02-F55`: `Send to kitchen` is idempotent, and the glass says whether the
// kitchen has it.
//
// PROVENANCE (`24 §3` step 2): authored from spec text by the test-authoring session for the
// August 2026 dress rehearsal. **Committed RED.** The FRs read for this file, and nothing else:
//
//   02-F55  the surface distinguishes THREE states (nothing to send / not told / told and owing
//           nothing); the separating fact is projected by MAIN; in the told-and-owing-nothing
//           state no second `order.confirmed` is originated; in the not-told state the press
//           must still reach the kitchen; `03-F55`'s addendum mechanism is untouched.
//   02-F9   "one-tap Accept → `order.confirmed` (**idempotent — at most one confirm per order
//           id**; KOT jobs created exactly once, after confirm, never before)".
//   02-F8   the confirm boundary: confirming emits `order.confirmed` and hands KOT jobs over.
//   02-F49  the boundary is enforced AT ORIGINATION, against this device's own converged fold —
//           local, synchronous, no peer, no clock, no network.
//   03-F55  measured: the control reads *Send to kitchen* whether or not the kitchen has been
//           told, and its owed clause (1) assigns that surface question to doc 02 and doc 27.
//   03-F5   a KOT failure is never silent — the band, not this control, is what reports paper.
//   01-F1   append-only. Three confirms for one order are three permanent rows.
//   01-F54  degrade to what you know; `undefined` means "this host did not say".
//   27-F4   disabled IN PLACE with its reason — the reason is the information.
//   27-F5   every action has a persistent, visible, labelled target.
//   01-F17  a sale is never blocked.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// §0 — THE MEASUREMENT (observed on a running till, August 2026)
//
// A dress rehearsal pressed `Send to kitchen` three times on one order, as a cashier under
// pressure does. **Three `order.confirmed` rows landed in an append-only ledger.** Nothing on
// the screen changed between the first press and the third: the tile reads `Send to kitchen`
// before and after, so there is no way to tell *sent* from *not sent*, and the second press is
// the reasonable act of somebody who cannot see the first one worked.
//
// `03-F55` had already measured the other half of this from the kitchen's side and named the
// surface question as OWED. This is that half.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PINS THAT THE FRs DO NOT — declared, not discovered
//
// If the implementer needs any of these different, that is a FINDING FOR THIS SESSION and not
// an edit to this file (`24 §3` step 2, `.claude/rules/tests-and-conformance.md`).
//
//  1. **One new projected field: `OpenOrder.kitchen: "none" | "sent" | "owed"`,** beside
//     `confirmed_at` on the row `main/gateway.ts` already builds. `02-F55` says the separating
//     fact is *"lines this device has not yet committed to paper for this order"*, that
//     `printing.ts` already computes it off `03-F4`'s durable spool, and that the renderer may
//     not re-derive it. Three words rather than a boolean because the FR names three states and
//     `confirmed_at` answers a different question — `03-F55`'s whole finding is that an order
//     can be confirmed AND owe the kitchen a chit.
//  2. **OPTIONAL on the wire, degrading to `"none"`.** The four fields beside it record why
//     (`shared/ipc.ts`: fixture factories in oracle files this session may not edit). `02-F55`
//     fixes the degrade direction and §F asserts it: an absent value must leave the control
//     PRESSABLE, because a duplicate row is a smaller harm than a dish nobody cooks.
//  3. **No wording is pinned.** `00 §5.6` fixes English and no FR fixes the sentence, so §C
//     asserts that the glass CHANGES and that the change mentions the kitchen — never a string.
//     A test pinning "Kitchen has it" would block a correct implementation that said it better.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// EVERY SECTION IS AIMED AT A PLAUSIBLE WRONG IMPLEMENTATION (the round-3 law):
//
//   §A  CONTROL — the first press must still confirm. An implementation that stops confirming
//       has "fixed" this by breaking `02-F8`, and §A is what catches that.
//   §B  **THE DANGEROUS CASE.** Three presses. §B1 is the triple-tap the rehearsal drove (three
//       taps inside one tick, before any read returns); §B2 is the slower version, after the
//       fold has moved. An implementation that only guards §B2 still writes the row a panicking
//       cashier produces, which is the one that was measured.
//   §C  a guard with no feedback: the ledger is right and the cashier still cannot tell, so she
//       goes on pressing. This is the half `03-F55` filed as owed.
//   §D  a guard implemented by REMOVING or MOVING the control (`27-F4`, `27-F5`).
//   §E  **THE OTHER CONTROL, and the one that matters most.** `kitchen: "owed"` is `03-F55`'s
//       addition-after-confirm: the press must still work, or this file has closed one silent
//       loss by re-opening a worse one.
//   §F  a host that projects nothing, degraded in the direction that loses food.
//   §G  the same act reached from the Orders tab (`02-F9`), so the guard is on the ORDER and not
//       on one tile.

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

/** happy-dom performs no layout. See `counter.dom.test.tsx`. */
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
  businessDay: "2026-08-14",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/**
 * `02-F55`'s three states, as this oracle names them. Declared locally rather than imported so
 * the file compiles today (the field does not exist yet) and so a rename in `shared/ipc.ts` is
 * a runtime finding rather than a silent compile break — `cash-tab.dom.test.tsx`'s convention.
 */
type KitchenState = "none" | "sent" | "owed";

/** An `OpenOrder` plus the projected fact. Cast at the seam, exactly where the wire is. */
const order = (kitchen: KitchenState | undefined, over: Partial<OpenOrder> = {}): OpenOrder =>
  ({
    order_id: "order-1",
    reference: "A-001",
    total_paisa: 45_000,
    paid_paisa: 0,
    lines: [
      {
        line_id: "line-1",
        name: "Karahi",
        quantity: 1,
        modifiers: [],
        removals: [],
        note: null,
      },
    ],
    channel: "counter",
    order_type: "dine_in",
    // `03-F55`'s finding in one fixture: `confirmed_at` is set on BOTH "sent" and "owed", so an
    // implementation keying the control on the confirm anchor alone passes §B and fails §E.
    confirmed_at: kitchen === "none" ? null : 1_780_000_000_000,
    settled: 0,
    ...(kitchen === undefined ? {} : { kitchen }),
    ...over,
  }) as OpenOrder;

let appended: AppendRequest[];
let lines: AddLineRequest[];
let orders: OpenOrder[];
let changed: (() => void) | null;

/**
 * The bridge, with a **PERMISSIVE main** — it appends whatever it is handed, exactly as the
 * shipped host does today.
 *
 * That is the whole design of this harness and it is deliberate. A fixture that refused the
 * second confirm would make every assertion below pass against any renderer at all: the guard
 * would be in the test. `02-F49`'s pattern puts the ledger-level refusal in main, and that is
 * owed and reported — what this file measures is that the SURFACE stops originating the act,
 * which is where the measured triple-tap came from.
 */
const mountWith = (initial: readonly OpenOrder[]) => {
  appended = [];
  lines = [];
  orders = [...initial];
  changed = null;
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    // A GETTER: every case here turns on what the surface does AFTER the fold moves.
    openOrders: vi.fn(async () => [...orders]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
    onChanged: vi.fn((cb: () => void) => {
      changed = cb;
      return () => {};
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** What main does after an append lands: move the fold, then push. Never one without the other. */
const foldMovesTo = async (next: readonly OpenOrder[]) => {
  orders = [...next];
  changed?.();
  await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
};

const sendControl = (): HTMLElement => {
  const found = screen.queryAllByRole("button").find((b) => /send to kitchen/i.test(nameOf(b)));
  expect(
    found,
    "27-F4 / 27-F5 — the kitchen handoff must stay on the surface, in place, in every state",
  ).toBeDefined();
  return found as HTMLElement;
};

const nameOf = (el: Element): string =>
  el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();

const press = (el: Element) => fireEvent.click(el);

const confirms = (): AppendRequest[] => appended.filter((a) => a.type === "order.confirmed");

/**
 * Every phrase on the surface that names the kitchen.
 *
 * `queryAllByText` matches an element's OWN text nodes, so an ancestor never matches on behalf
 * of a child and this is a list of the sentences a cashier can actually read. Sorted, because
 * §C is about WHAT is said and not about where.
 */
const kitchenSays = (): string[] =>
  screen
    .queryAllByText(/kitchen/i)
    .map((el) => (el.textContent ?? "").trim())
    .sort();

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE CONTROL. Read this first: it is what stops a "fix" that simply stops confirming.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F8 — the FIRST press still confirms", () => {
  it("appends exactly one order.confirmed for the order on the surface", async () => {
    mountWith([order("none")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    press(sendControl());
    await waitFor(() => expect(confirms()).toHaveLength(1));
    expect(confirms()[0]?.payload).toMatchObject({ order_id: "order-1" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE DANGEROUS CASE. The measured triple-tap, and its slower cousin.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F9 / 02-F55 — at most one order.confirmed per order id", () => {
  it("§B1 THREE TAPS IN ONE BREATH write ONE confirm — the rehearsal's own gesture", async () => {
    mountWith([order("none")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    // No await between them. This is the case that was measured: a cashier who cannot see that
    // the first press worked presses again before any read has returned, and the fold cannot
    // have moved in between. An implementation that consults only the projection is defeated
    // here and nowhere else.
    const control = sendControl();
    press(control);
    press(control);
    press(control);

    await foldMovesTo([order("sent")]);
    expect(
      confirms(),
      "01-F1 — every extra confirm is a permanent row for an act that happened once",
    ).toHaveLength(1);
  });

  it("§B2 the fold says the kitchen has it, and further presses write nothing", async () => {
    mountWith([order("none")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    press(sendControl());
    await waitFor(() => expect(confirms()).toHaveLength(1));
    await foldMovesTo([order("sent")]);

    press(sendControl());
    await foldMovesTo([order("sent")]);
    press(sendControl());
    await foldMovesTo([order("sent")]);

    expect(confirms()).toHaveLength(1);
  });

  it("§B3 an order that ARRIVES already sent is not confirmed a second time", async () => {
    // A peer confirmed it (`02-F11`), or this device relaunched over its own spool. The renderer
    // has no memory of pressing anything, so only the projected fact can save the ledger — which
    // is why `02-F55` puts that fact in main and forbids the renderer deriving it.
    mountWith([order("sent")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    press(sendControl());
    await foldMovesTo([order("sent")]);
    expect(confirms()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE SURFACE SAYS SO. Without this, §B is a guard nobody can see and she presses anyway.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F55 / 03-F55 (1) — the glass distinguishes SENT from NOT SENT", () => {
  it("what the surface says about the kitchen CHANGES when the kitchen has it", async () => {
    mountWith([order("none")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const before = kitchenSays();
    expect(
      before.length,
      "27-F5 — the kitchen handoff must be a labelled target on the surface",
    ).toBeGreaterThan(0);

    press(sendControl());
    await waitFor(() => expect(confirms()).toHaveLength(1));
    await foldMovesTo([order("sent")]);

    // The measured defect, stated as an assertion: the tile read `Send to kitchen` before and
    // after, so nothing on the glass separated the two states and the second press was a
    // reasonable act. No wording is pinned — only that the sentence about the kitchen is not
    // the same sentence.
    expect(
      kitchenSays(),
      "03-F55 (1) — the control reads the same whether or not the kitchen has been told, so a " +
        "cashier under pressure has no reason not to press it again (measured, August 2026)",
    ).not.toEqual(before);
  });

  it("the change is not merely the order vanishing from the surface", async () => {
    mountWith([order("sent")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    // `02-F51` (c) releases a cart when the MONEY side closes, never at the confirm — an order
    // that has gone to the kitchen is still being added to and still has to be settled. The
    // cart's own line is the probe: the Order surface renders lines, not the reference.
    expect(
      screen.queryAllByText(/Karahi/).length,
      "02-F51 (c) — a confirmed order is still this terminal's cart; the release test is the money side",
    ).toBeGreaterThan(0);
    expect(kitchenSays().length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `27-F4` / `27-F5`: the guard may not be implemented by taking the control away.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 27-F4 — the control stays in place, with its reason", () => {
  it("is present in all three states and never disabled out of existence", async () => {
    for (const state of ["none", "sent", "owed"] as const) {
      cleanup();
      mountWith([order(state)]);
      render(<Counter />);
      await screen.findByRole("button", { name: /^Dine-in$/i });

      const control = sendControl();
      // `Tile` never sets `disabled` — `01-F59`'s reason, recorded in that component — so
      // "unavailable" here means greyed with its reason folded into the accessible name. What
      // `27-F4` forbids is REMOVAL, and what `27-F5` forbids is an unlabelled target.
      expect((control as HTMLButtonElement).disabled).toBe(false);
      expect(nameOf(control).length).toBeGreaterThan(0);
    }
  });

  it("with NO order at all it is greyed IN PLACE and says why", async () => {
    // PRESERVED from `counter.dom.test.tsx`: the third state `02-F55` names is "nothing to
    // send", and it already worked. Asserted here so a change made for the other two cannot
    // quietly take it away.
    mountWith([]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    expect(nameOf(sendControl())).toMatch(/no order started/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE OTHER CONTROL: `03-F55`'s addition after confirm. THE PRESS MUST STILL WORK.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 03-F55 — an order that OWES the kitchen a chit can still be sent", () => {
  it("the control is live, and pressing it reaches main", async () => {
    // A cashier rang one more naan onto a confirmed order. `03-F55` measured what happens when
    // the kitchen is never told: the dish is on the bill and nobody is cooking it. An
    // implementation that keys the guard on `confirmed_at` — the tempting shape, since that
    // field already crosses the bridge — passes every assertion in §B and fails here.
    mountWith([order("owed")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    press(sendControl());
    await waitFor(() =>
      expect(
        appended.length,
        "03-F55 — the addition never reached the kitchen: this closes one silent loss by " +
          "opening a worse one",
      ).toBeGreaterThan(0),
    );
  });

  it("and the surface does not claim the kitchen has everything", async () => {
    mountWith([order("sent")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });
    const sentSays = kitchenSays();

    cleanup();
    mountWith([order("owed")]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const owedSays = kitchenSays();
    expect(
      owedSays,
      "02-F55 — `sent` and `owed` are different facts about the kitchen and must not read alike",
    ).not.toEqual(sentSays);

    // **AND the difference must be something the surface SAYS, not merely whether the tile is
    // greyed.** Added after mutation: collapsing the `owed` wording into the `sent` wording
    // killed ZERO assertions on the first draft, because the two states still differed in the
    // tile's availability. That leaves a cashier who owes the kitchen a chit reading *"the
    // kitchen has this order"* — `03-F55`'s defect restored, with a live button as the only
    // clue. Every phrase the `owed` state offers being one the `sent` state also offers is
    // exactly "this state says nothing of its own".
    expect(
      owedSays.every((phrase) => sentSays.includes(phrase)),
      "03-F55 — the `owed` state adds no sentence of its own: everything it says about the " +
        "kitchen is also said when the kitchen owes nothing, so the glass cannot distinguish " +
        `them.\nsent: ${JSON.stringify(sentSays)}\nowed: ${JSON.stringify(owedSays)}`,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — `01-F54`: a host that says nothing degrades toward the kitchen, never away from it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F54 — an absent projection leaves the control PRESSABLE", () => {
  it("a confirmed order with no kitchen fact still sends", async () => {
    // `undefined` is "this host did not say", which is deliberately not "the kitchen has it".
    // The degrade direction is stated in `02-F55` and it is not symmetric: a duplicate ledger
    // row is recoverable by a human reading it; a dish nobody was told about is not.
    mountWith([order(undefined, { confirmed_at: 1_780_000_000_000 })]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    press(sendControl());
    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — `02-F9`: the same order, reached from the Orders tab, is the same act.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 02-F9 — the inbox does not offer a second Accept for an order already confirmed", () => {
  it("a confirmed order carries no accept control on the Orders tab", async () => {
    // `screen-map §4`: screens do not hand off to each other, they append to one ledger — so
    // `acceptCloudOrder` and `sendToKitchen` are one act reached from two surfaces. A guard
    // living on one tile is a guard the other surface walks around.
    mountWith([
      order("sent", { order_id: "order-cloud", reference: "W-900", channel: "storefront" }),
    ]);
    render(<Counter />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const rail = document.querySelector('nav[aria-label="Main"]');
    const ordersTab = [...(rail?.querySelectorAll("button") ?? [])].find(
      (b) => (b.querySelector("span")?.textContent ?? "").trim() === "Orders",
    );
    fireEvent.click(ordersTab as HTMLElement);
    await screen.findByText("Open orders");

    for (const control of screen.queryAllByRole("button")) {
      expect(
        /accept/i.test(nameOf(control)),
        "02-F9 — at most one confirm per order id, on every surface that can originate one",
      ).toBe(false);
    }
    expect(confirms()).toHaveLength(0);
  });
});
