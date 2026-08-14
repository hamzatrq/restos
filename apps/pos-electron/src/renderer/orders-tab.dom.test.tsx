// The **Orders** tab — `C19` (accept a cloud order, `02-F9`) and `C31` (find that order again,
// `02-F10`), as a cashier would experience them through the real bridge shape.
//
// `C20` (reject) and `C32` (mark ready) are the other two tasks `screen-map §3.1` puts on this
// row and NEITHER IS BUILT — both are blocked in the kernel, not here (`OrdersSurface`'s header
// names each blocker by FR). §E below is an ANTI-SCOPE guard rather than a coverage gap: it
// fails if a later session draws either control before the blocker clears, because a Reject
// button that cannot emit `order.rejected` and a Ready button that emits an illegal edge are
// both controls that can never succeed.
//
// ⚠ **§E's THIRD assertion was rewritten on 2026-08-14 and its old text is quoted in place.**
// `02-F51` (a) put `02-F10`'s recall control on the open-order row, so *"offers no control at
// all"* stopped being the rule; what that test actually owned — no line-STATE control, and not a
// menu of controls on one row — is asserted there instead. Read it before adding anything to a
// row here.
//
// Written against the round-3 law. The assertions that carry the file, and the mutant each is
// aimed at — every one of them survives a suite that only checks "the tab renders something":
//
//   * §B the badge counts UNACCEPTED CLOUD orders. `orders.length` is the obvious wrong
//     implementation and it is what a fixture of one cloud order cannot distinguish, so every
//     badge fixture here mixes a counter order, a settled order and a confirmed cloud order in
//     with the two that should count.
//   * §C Accept appends `order.confirmed` for THAT order — not the first, not the current cart.
//   * §D `undefined` is not `null`. A host that did not supply `channel`/`confirmed_at` must
//     produce an EMPTY inbox, not an inbox of everything — this is the degrade `01-F54` asks
//     for, and it is the case the two older oracle harnesses actually exercise.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** As `counter.dom.test.tsx` records: happy-dom has no layout, so the panel is stubbed. */
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
  businessDay: "2026-08-07",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const order = (over: Partial<OpenOrder> & { order_id: string }): OpenOrder => ({
  reference: over.order_id,
  total_paisa: 10_000,
  paid_paisa: 0,
  lines: [],
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: 1_000,
  settled: 0,
  ...over,
});

/** An arrived, unaccepted website order — `02-F9`'s inbox member. */
const cloudUnaccepted = (id: string, channel: "storefront" | "whatsapp" = "storefront") =>
  order({ order_id: id, channel, confirmed_at: null, order_type: "delivery" });

let appended: AppendRequest[];

const mountWith = (orders: OpenOrder[]) => {
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
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** Arrive on the Orders tab the way a cashier does: one tap on the rail. */
const openOrdersTab = async () => {
  render(<Counter />);
  const tab = await screen.findByRole("button", { name: /^Orders/ });
  fireEvent.click(tab);
  return tab;
};

describe("§A — 27-F4: the tab is ENABLED IN PLACE, and the rail did not change shape", () => {
  // `27-F4` — SIX since `02-F7`'s Sold-out tab landed (August 2026). The assertion is unchanged
  // in what it protects: the five that existed keep their labels AND their order, and the new one
  // is APPENDED so no learned position moves. A reorder or a removal still fails this line.
  it("still carries screen-map §3.1's five surfaces, in order", async () => {
    mountWith([]);
    await openOrdersTab();
    const rail = screen.getByRole("navigation", { name: "Main" });
    const labels = within(rail)
      .getAllByRole("button")
      .map((b) => b.textContent);
    // Building this surface must change exactly ONE thing: `unavailable` goes away. Adding,
    // removing or reordering an operational item is a breaking change (`27-F4`), so the
    // positions are pinned rather than merely the membership.
    expect(labels).toEqual(["Order", "Orders", "Pay", "Cash", "Me", "Sold out"]);
  });

  it("is no longer disabled, and no longer says it is unbuilt", async () => {
    mountWith([]);
    const tab = await openOrdersTab();
    expect(tab.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText("not built yet")).toBeNull();
  });
});

describe("§B — screen-map §5: the arrival signal is a COUNT BADGE, never a popup", () => {
  it("counts only unaccepted CLOUD orders, not every open order", async () => {
    // THE assertion of this section. Five orders, only two of which belong in the inbox:
    // `orders.length` renders 5, "all cloud orders" renders 3, "all unconfirmed" renders 3.
    // Each of those is a plausible implementation and each fails only here.
    mountWith([
      cloudUnaccepted("web-1"),
      cloudUnaccepted("wa-1", "whatsapp"),
      order({ order_id: "counter-1" }),
      order({ order_id: "counter-settled", settled: 1 }),
      // Already accepted — it has left the inbox and must not be counted again.
      order({ order_id: "web-accepted", channel: "storefront", confirmed_at: 2_000 }),
      // Unconfirmed but keyed in at the till: `C4`'s own cart, never an inbox arrival.
      order({ order_id: "counter-open", confirmed_at: null }),
    ]);
    const tab = await openOrdersTab();
    await waitFor(() => expect(within(tab).getByText("2")).toBeTruthy());
  });

  it("keeps an unconfirmed FOODPANDA order out of the inbox (02-F9 bypasses it)", async () => {
    // ⚠ ADDED AFTER MUTATION. Widening the cloud set to `["storefront","whatsapp","foodpanda"]`
    // — a plausible reading of "orders that did not come from this till" — survived all 365
    // tests, because no fixture had an unconfirmed aggregator order. `02-F9` is explicit:
    // "aggregator API orders BYPASS the inbox (accepted upstream, auto-confirmed on ingest per
    // 08-F8) and appear directly in the queue." Offering Accept on one would let a cashier
    // re-confirm an order the aggregator already owns.
    mountWith([
      cloudUnaccepted("web-1"),
      order({ order_id: "fp-1", channel: "foodpanda", confirmed_at: null }),
    ]);
    const tab = await openOrdersTab();
    await waitFor(() => expect(within(tab).getByText("1")).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
    // It is still an OPEN order — bypassing the inbox is not disappearing (`C31`).
    expect(screen.getByText("fp-1")).toBeTruthy();
  });

  it("shows no badge at all on a quiet counter", async () => {
    // `27-F16` — spend the channel on the exception. A badge reading 0 is decoration that
    // trains an operator to ignore the one place a real count will appear.
    mountWith([order({ order_id: "counter-1" })]);
    const tab = await openOrdersTab();
    await screen.findByText("Open orders");
    expect(within(tab).queryByText("0")).toBeNull();
  });

  it("never raises a modal over the cart when a cloud order is present", async () => {
    // `screen-map §5`: a cloud-order popup "interrupts a cart, which `27-F11d` forbids". The
    // Order tab must still be the thing on screen until the operator chooses otherwise.
    //
    // Asserted on the ORDER-TYPE ROW rather than on the empty-cart sentence, and the reason is
    // a finding rather than a convenience: `Counter` binds its cart to `orders[0]`, so an
    // unaccepted cloud order sitting first in the seam's array becomes the Order tab's
    // `current` and the surface reads "Order in progress". That is pre-existing behaviour
    // (`current = orders[0]` predates this tab) and it is NOT changed here — which order is
    // "the cart" when several are open is `02-F11`'s question and needs an FR, not a patch
    // from the screen that happened to surface it. Recorded in `apps/pos-electron/CLAUDE.md`.
    mountWith([cloudUnaccepted("web-1")]);
    render(<Counter />);
    await screen.findByText("Dine-in", { exact: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    // The inbox is REACHABLE, not raised: its heading is not on screen until the tab is tapped.
    expect(screen.queryByText("New orders")).toBeNull();
  });
});

describe("§C — C19/02-F9: accept is ONE TAP and appends order.confirmed", () => {
  it("appends order.confirmed for the order whose row was pressed", async () => {
    // Three inbox rows, and the SECOND is pressed: an implementation confirming `orders[0]`
    // (or the Order tab's `current`) passes a one-row fixture and fails here.
    mountWith([cloudUnaccepted("web-1"), cloudUnaccepted("web-2"), cloudUnaccepted("web-3")]);
    await openOrdersTab();
    const accepts = await screen.findAllByRole("button", { name: "Accept" });
    expect(accepts).toHaveLength(3);
    fireEvent.click(accepts[1] as HTMLElement);
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(appended[0]).toEqual({
      type: "order.confirmed",
      payload: { order_id: "web-2" },
      refs: [],
    });
  });

  it("is reachable on ARRIVAL — no second navigation act (screen-map §2)", async () => {
    // "A tab whose contents require another navigation act to reach a primary action is depth
    // two and is banned." One tap on the rail must be enough to see and press Accept.
    mountWith([cloudUnaccepted("web-1")]);
    await openOrdersTab();
    expect(await screen.findByRole("button", { name: "Accept" })).toBeTruthy();
  });

  it("sends no money and no line detail with the accept", async () => {
    // `02-F9` — accept is a confirm and nothing else. A payload carrying a total would be the
    // renderer pricing an order (`01-F53` snapshots at line-add, not here).
    mountWith([cloudUnaccepted("web-1")]);
    await openOrdersTab();
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(appended).toHaveLength(1));
    expect(Object.keys(appended[0]?.payload ?? {})).toEqual(["order_id"]);
  });
});

describe("§D — 01-F54: a host that did not SAY is not a host that said null", () => {
  it("serves an empty inbox when the projection carries no channel or confirm", async () => {
    // The degrade the optional fields exist for, and the case the two older oracle harnesses
    // actually produce. The dangerous implementation is `!o.confirmed_at`, which treats
    // `undefined` as unconfirmed and offers Accept on an order the screen knows nothing about.
    mountWith([
      { order_id: "legacy-1", reference: "legacy-1", total_paisa: 500, paid_paisa: 0, lines: [] },
    ]);
    await openOrdersTab();
    expect(await screen.findByText("No new orders from the website or WhatsApp.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("does not offer Accept on a CLOUD order whose confirm state was never supplied", async () => {
    // ⚠ ADDED AFTER MUTATION. The first version of §D used an order with no channel either, so
    // `isCloudInbox`'s FIRST clause already refused it and the `confirmed_at` comparison was
    // never reached — the mutant `!o.confirmed_at` (which treats "did not say" as "unconfirmed")
    // survived all 365 tests. This fixture is the only shape that separates them: a cloud
    // channel the host DID supply, beside a confirm state it did NOT.
    mountWith([
      {
        order_id: "web-unknown",
        reference: "web-unknown",
        total_paisa: 500,
        paid_paisa: 0,
        lines: [],
        channel: "storefront",
      },
    ]);
    await openOrdersTab();
    expect(await screen.findByText("No new orders from the website or WhatsApp.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("still lists that order as open, so C31 can find it", async () => {
    // `01-F17`/`01-F54` — degrade, never drop. An order with missing metadata is still an order
    // a customer is asking about, and losing it from recall would be the worse failure.
    mountWith([
      { order_id: "legacy-1", reference: "legacy-1", total_paisa: 500, paid_paisa: 0, lines: [] },
    ]);
    await openOrdersTab();
    await screen.findByText("Open orders");
    expect(screen.getByText("legacy-1")).toBeTruthy();
  });
});

describe("§E — ANTI-SCOPE: C20 and C32 are BLOCKED and must not be drawn", () => {
  it("draws no Reject control — order.rejected has no payload schema in domain", async () => {
    // `01-F4` makes producing an unknown event type a build-time AND runtime error. The `01 §4`
    // catalog absorbed `order.rejected` in July 2026, but `packages/domain/src/registry.ts`
    // carries no schema for it, so the emit cannot be built. **If a later session adds the
    // schema, this test is the reminder that the control is now owed** — delete it in the same
    // PR that builds Reject, and not before.
    mountWith([cloudUnaccepted("web-1")]);
    await openOrdersTab();
    await screen.findByRole("button", { name: "Accept" });
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
  });

  it("draws no Ready control — 02-F33's read-only fallback is what ships", async () => {
    // `02-F33`: "otherwise the panel is read-only for states". Nothing advances a line past
    // `placed`, and `LEGAL_NEXT.placed` excludes `ready`, so a Ready tap would emit an edge the
    // fold records as `illegal_transition` and refuses — a control that can never succeed.
    mountWith([order({ order_id: "counter-1" })]);
    await openOrdersTab();
    await screen.findByText("Open orders");
    expect(screen.queryByRole("button", { name: /ready/i })).toBeNull();
  });

  it("02-F51: an open-order row carries exactly ONE control, and it is no state change", async () => {
    /*
      ⚠ **RETIRED AND REWRITTEN, 2026-08-14, by the test-authoring session for `02-F51` — the
      assertion is not deleted, it is here in the paragraph below.** It read *"offers no control
      at all on an open-order row (02-F10 recall is read-only)"* and pinned the surface's whole
      button count at 6 (the rail's six tabs, nothing else).

      **What changed: `02-F51` (a).** That count encoded a scope decision — this row draws
      nothing — which turned out to be a defect rather than a narrowing: `02-F10`'s recall had no
      control **anywhere in the product**, so `setCartOrderId` had exactly one call site (inside
      `startOrder`) and starting a second order made the first UNREACHABLE — no further lines,
      and no settlement. The FR now puts one control on this row and says what it does.

      **The anti-scope property this test really owned is kept, and it was never "no control".**
      It was (i) no control that changes a line STATE (`02-F33`'s read-only posture, `C32`'s
      blocker) and (ii) not a MENU of controls on a row (`27-F9`; `OrderList` takes exactly one
      action by design). Both are asserted below, per row rather than as a whole-surface count —
      which is also stronger than the number was, since 6 could be reached by adding a row
      control and removing a tab. The two assertions above — no Reject, no Ready — are
      untouched, and `order-recall.dom.test.tsx` §A carries the same one-control-per-row check
      from the other side.
    */
    mountWith([order({ order_id: "counter-1" }), order({ order_id: "counter-2" })]);
    await openOrdersTab();
    await screen.findByText("Open orders");
    const rows = screen.getAllByRole("article");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getAllByRole("button")).toHaveLength(1);
    }
    // Still no pager at this panel size, and the rail is still six: the surface adds one control
    // PER ROW and nothing else of its own.
    expect(screen.getAllByRole("button")).toHaveLength(6 + rows.length);
  });
});

describe("§F — C31/02-F10: what belongs in the open list", () => {
  it("separates the inbox from the open list — an order is in exactly one", async () => {
    mountWith([cloudUnaccepted("web-1"), order({ order_id: "counter-1" })]);
    await openOrdersTab();
    await screen.findByText("Open orders");
    const text = document.body.textContent ?? "";
    // The inbox heading precedes its row, which precedes the open heading, which precedes its
    // row — so a row landing in the wrong list moves in this ordering and fails.
    expect(text.indexOf("New orders")).toBeLessThan(text.indexOf("web-1"));
    expect(text.indexOf("web-1")).toBeLessThan(text.indexOf("Open orders"));
    expect(text.indexOf("Open orders")).toBeLessThan(text.indexOf("counter-1"));
  });

  it("drops a settled order from the open list (01-F33 closes the money side)", async () => {
    mountWith([order({ order_id: "settled-1", settled: 1 }), order({ order_id: "open-1" })]);
    await openOrdersTab();
    await screen.findByText("open-1");
    expect(screen.queryByText("settled-1")).toBeNull();
  });

  it("says so honestly when there is nothing open (00 §5.7)", async () => {
    mountWith([]);
    await openOrdersTab();
    expect(await screen.findByText("No open orders. Start one on the Order tab.")).toBeTruthy();
  });
});

describe("§G — 03-F46: chronological, oldest confirm on page 1", () => {
  it("orders the open list by the confirm anchor, not by the seam's order", async () => {
    // Delivered newest-first on purpose: an implementation rendering the array as given passes
    // any single-order fixture and fails here. The key is the event's own `branch_created_at`
    // (`01-F43`), never this device's clock — which is what keeps it out of `01-F34`.
    mountWith([
      order({ order_id: "third", confirmed_at: 3_000 }),
      order({ order_id: "first", confirmed_at: 1_000 }),
      order({ order_id: "second", confirmed_at: 2_000 }),
    ]);
    await openOrdersTab();
    await screen.findByText("first");
    const text = document.body.textContent ?? "";
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
    expect(text.indexOf("second")).toBeLessThan(text.indexOf("third"));
  });
});
