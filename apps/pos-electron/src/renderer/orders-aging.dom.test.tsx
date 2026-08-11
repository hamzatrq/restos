// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2). Written by a session that did not read the plan
// for this task and did not write the implementation, from `03-F25`, `03-F14`, `03-F47`,
// `03-F46`, `02-F9`, `02-F10`, `02-F31`, `27-F7`, `27-F12`, `01-F34`, `01-F54` and `00 §5.7`.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// `03-F25` ON THE SCREEN — the counter's Orders tab shows how old each order is.
// ───────────────────────────────────────────────────────────────────────────────────────────────
//
// > 03-F25 timers from `order.confirmed` on every queue surface (pass, KDS, **POS T1 panel**,
// > manager console). No learning required; this alone is the Wave 1 deliverable.
//
// > 02-F31 … the POS shows a compact order-queue panel with aging timers (doc 03 thresholds)
//
// The pass screen has them. This tab does not: `AgeBadge` and `ageLevel` appear nowhere in this
// app, so a cashier looking at the open-orders list cannot tell a two-minute order from a
// forty-minute one — on a T1 branch, the configuration `02-F40` calls *most deployments*, that
// list is the only queue surface in the building.
//
// ## WHAT THIS FILE OWNS THAT THE OTHER TWO DO NOT
//
// `packages/ui`'s `order-age.dom.test.tsx` proves `OrderList` renders an age it is handed.
// `main/__acceptance__/orders-aging.test.ts` proves the gateway computes one from branch time.
// Between them sits `toRow` in `OrdersSurface.tsx`, and **a reshape between two correct halves
// is precisely where this wave's most expensive defect lived**: `sync-client`'s `catalog-fetch`
// `toEntry` dropped `prices` and `station` while the gateway served them, the wire carried them
// and the store read them — and it failed **0 of 579** pre-existing tests, because no test
// crossed that one seam. §B below is that crossing, aimed at the same shape.
//
// ## WHAT THIS FILE CANNOT SEE
//
// **happy-dom performs no layout** — every `getBoundingClientRect` is zeroes — so nothing here
// says the badge is ON the screen, only that it is in the document. The counter's row is now
// carrying a sixth element beside a reference, a channel, an item count, a money value and (in
// the inbox) an Accept tile, and eight of this app's nine recorded layout defects were a control
// pushed out of a box costed before something was added to it. That question belongs to
// `pnpm -C apps/pos-electron layout:check`, and only if its fixture serves an aged order — which
// is why the seam file carries a tripwire on `layout-gate/preload.ts`.
//
// It also says nothing about the REFRESH CADENCE. An age that never advances is not a timer, and
// this app's `main/sync.ts` notifies the renderer only when the fold cursor MOVES
// (`if (now === lastSeen) return;`) — where `apps/pass-kds`'s `uplink.ts` deliberately fires
// every second and says why: *"a ticket would sit at `9 min` until the next order was
// confirmed"*. A fake bridge cannot distinguish a host that ticks from one that does not. It is
// reported as a finding to the implementer rather than pinned here, because the two legal
// mechanisms (main pushes on a clock tick / the renderer re-reads on its own) are observable in
// different processes and a test for either would be RED against a correct implementation of the
// other.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** `03-F14`/`03-F47`'s two stated defaults, transcribed. */
const DINE_IN = { amberAt: 10, redAt: 20 } as const;
const DELIVERY = { amberAt: 15, redAt: 25 } as const;

const order = (over: Partial<OpenOrder> & { order_id: string }): OpenOrder => ({
  reference: over.order_id,
  total_paisa: 10_000,
  paid_paisa: 0,
  lines: [],
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: 1_754_300_000_000,
  settled: 0,
  ...over,
});

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
};

/**
 * Every AGE on the surface, in DOM order.
 *
 * Filtered by the announced sentence rather than by container, because this shell renders three
 * other `role="status"` elements (`AppShell`'s strip, `ConnectionFacts`, `CatalogHealth`) and a
 * query that swept them all would be counting scenery.
 */
const agesOnScreen = (): string[] =>
  screen
    .queryAllByRole("status")
    .map((el) => el.getAttribute("aria-label") ?? "")
    .filter((label) => / minutes, /.test(label));

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — `03-F25`/`02-F31`: the panel has aging timers at all.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F25 — the POS T1 panel shows each open order's age", () => {
  it("renders an age for every confirmed open order", async () => {
    mountWith([
      order({ order_id: "A-014", aging: { minutes: 3, ...DINE_IN } }),
      order({ order_id: "A-015", aging: { minutes: 27, ...DINE_IN } }),
    ]);
    await openOrdersTab();
    await waitFor(() => {
      expect(agesOnScreen()).toEqual(["3 minutes, on time", "27 minutes, overdue"]);
    });
  });

  it("keeps the order findable — the age is added to the row, not put in place of it", async () => {
    // `02-F10`'s recall is what this list is FOR (`C31`). An age that displaced the reference
    // would close the FR it was added for and break the one it was added to.
    mountWith([order({ order_id: "A-014", aging: { minutes: 12, ...DINE_IN } })]);
    await openOrdersTab();
    await waitFor(() => expect(screen.getByText("A-014")).toBeTruthy());
    expect(agesOnScreen()).toEqual(["12 minutes, due soon"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE RESHAPE. `03-F47`'s per-type thresholds must survive `toRow`.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F47 — the thresholds cross the seam with the minutes, per order type", () => {
  it("gives the same minutes different verdicts under different order types", async () => {
    // **THE assertion of this file.** Both orders are 22 minutes old. Under `03-F47`'s stated
    // defaults a dine-in at 22 is OVERDUE and a delivery at 22 has three minutes left.
    //
    // Four implementations fail here and none of them fails anything else in this app:
    //   - `toRow` copies `minutes` and drops the thresholds (the `toEntry` defect verbatim);
    //   - `toRow` hardcodes 10/20 (or 15/25) rather than passing the host's numbers;
    //   - the surface reads the first row's thresholds for every row;
    //   - `amberAt` and `redAt` are transposed on the way across (22/25/15 still reads fault).
    mountWith([
      order({ order_id: "A-014", order_type: "dine_in", aging: { minutes: 22, ...DINE_IN } }),
      order({
        order_id: "A-015",
        order_type: "delivery",
        confirmed_at: 1_754_300_000_001,
        aging: { minutes: 22, ...DELIVERY },
      }),
    ]);
    await openOrdersTab();
    await waitFor(() => {
      expect(agesOnScreen()).toEqual(["22 minutes, overdue", "22 minutes, due soon"]);
    });
  });

  it("carries a threshold pair the FRs never mention — the org's, not the product's", async () => {
    // `03-F14` makes X/Y **org-configurable**. A surface that recognised only the two documented
    // pairs would pass the test above and silently re-floor an org running 8/16.
    mountWith([
      order({ order_id: "A-014", aging: { minutes: 9, amberAt: 8, redAt: 16 } }),
      order({
        order_id: "A-015",
        confirmed_at: 1_754_300_000_001,
        aging: { minutes: 9, amberAt: 30, redAt: 45 },
      }),
    ]);
    await openOrdersTab();
    await waitFor(() => {
      expect(agesOnScreen()).toEqual(["9 minutes, due soon", "9 minutes, on time"]);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — `03-F14`'s basis on the screen: the inbox is unconfirmed, so the inbox has no ages.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F14/02-F9 — no confirm anchor, no timer", () => {
  it("shows no age on an unaccepted cloud order", async () => {
    // `02-F9`'s inbox is unconfirmed BY DEFINITION (`isCloudInbox` keys on `confirmed_at ===
    // null`), so this is the resting state of one of this tab's two lists rather than an edge
    // case. `03-F14`: *"timer basis is `order.confirmed`"* — an order that has not been accepted
    // has no basis, and `0 min` beside an order that arrived forty minutes ago is the number
    // `00 §5.7` exists to forbid.
    mountWith([
      order({ order_id: "W-207", channel: "storefront", confirmed_at: null, aging: null }),
    ]);
    await openOrdersTab();
    await waitFor(() => expect(screen.getByText("W-207")).toBeTruthy());
    expect(agesOnScreen()).toEqual([]);
    // `02-F9`'s primary action is still reachable — the age's absence is not the row's absence.
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  });

  it("ages the open list while the inbox above it stays silent, on one screen", async () => {
    // The realistic frame: an arrival waiting to be accepted above a queue that is cooking. An
    // implementation that ages every row it can see puts a timer on both lists.
    mountWith([
      order({ order_id: "W-207", channel: "storefront", confirmed_at: null, aging: null }),
      order({ order_id: "A-014", aging: { minutes: 16, ...DINE_IN } }),
    ]);
    await openOrdersTab();
    await waitFor(() => {
      expect(agesOnScreen()).toEqual(["16 minutes, due soon"]);
    });
    expect(screen.getByText("W-207")).toBeTruthy();
  });

  it("still draws the row when the host supplied no age at all (01-F54)", async () => {
    // The degrade an optional wire field exists for: a host predating the column serves orders
    // that are findable and un-aged, never orders that are missing or a screen that throws.
    mountWith([order({ order_id: "A-014" })]);
    await openOrdersTab();
    await waitFor(() => expect(screen.getByText("A-014")).toBeTruthy());
    expect(agesOnScreen()).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §D — `01-F34`/`27-F7`: the age is DISPLAYED, never used to order the list.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 03-F46/27-F7/01-F34 — the age never reaches the sort", () => {
  it("keeps oldest-confirm-first when two orders share a floored minute", async () => {
    // `pass-queue.ts` shipped this defect in its own first draft and records it: `minutes` is
    // floored, so two orders confirmed 30 seconds apart share a value and a sort keyed on the
    // rendered age decides the work order by whatever the array happened to hold. `27-F7` calls
    // a list whose visual order is not its work order a defect.
    //
    // The fixture is deliberately supplied NEWEST FIRST. A correct implementation sorts on the
    // raw confirm anchor and puts `A-014` above `A-015`; a stable sort keyed on equal ages — or
    // no sort at all — leaves them as given and fails.
    const older = 1_754_300_000_000;
    mountWith([
      order({
        order_id: "A-015",
        confirmed_at: older + 30_000,
        aging: { minutes: 12, ...DINE_IN },
      }),
      order({ order_id: "A-014", confirmed_at: older, aging: { minutes: 12, ...DINE_IN } }),
    ]);
    await openOrdersTab();
    await waitFor(() => expect(screen.getByText("A-014")).toBeTruthy());
    const text = document.body.textContent ?? "";
    expect(text.indexOf("A-014")).toBeLessThan(text.indexOf("A-015"));
  });

  it("does not reorder the list as an order ages past a threshold", async () => {
    // `03-F23`'s sequencing law reaches the counter too: *"Chronological order + aging color is
    // the entire sequencing UI."* An implementation that floated the reddest order to the top
    // would be prioritising, which the system may never do — and it would move a row an operator
    // has learned by position (`27-F4`).
    const older = 1_754_300_000_000;
    mountWith([
      order({ order_id: "A-014", confirmed_at: older, aging: { minutes: 2, ...DINE_IN } }),
      order({
        order_id: "A-015",
        confirmed_at: older + 60_000,
        aging: { minutes: 44, ...DINE_IN },
      }),
    ]);
    await openOrdersTab();
    await waitFor(() => expect(screen.getByText("A-015")).toBeTruthy());
    const text = document.body.textContent ?? "";
    expect(text.indexOf("A-014")).toBeLessThan(text.indexOf("A-015"));
    expect(agesOnScreen()).toEqual(["2 minutes, on time", "44 minutes, overdue"]);
  });
});
