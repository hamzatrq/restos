// The Orders tab's SEAM — does the gateway actually carry the fold's four order facts to the
// renderer, or is the surface reading a projection that arrives empty?
//
// **This file exists because of the wave's named defect** (`AGENTS.md`: "a correct subsystem
// with no seam to the product"). `orders-tab.dom.test.tsx` proves the SCREEN classifies a cloud
// order correctly given the fields; it stubs the bridge, so it stays green against a gateway
// that never supplies them — and the product would then show an inbox that is empty forever, a
// badge that never appears, and an open list in arbitrary order. That is exactly instance (1)
// of the defect: a correct component nothing feeds.
//
// `pnpm seams:check` cannot see this one either. Rule A wants an unreached export (`OrderList`
// is reached), and Rule B wants an unsupplied OPTIONAL member of an options bag (these are
// fields on a mapping). `AGENTS.md` names the remedy — "mutate the SEAM, not the logic" — and
// this is that assertion written by hand.
//
// PROVENANCE: written alongside the implementation, like `gateway.test.ts` beside it, and owed
// the same independent oracle pass.

import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayDeps } from "../gateway";

const JSON_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: ["confirmed"] },
});

/** One `OpenOrderRow` as the merge fold actually projects it — every field populated. */
const ROW = {
  order_id: "order-1234abcd",
  channel: "storefront",
  order_type: "delivery",
  confirmed_at: null,
  settled: 0,
  json_lines: JSON_LINES,
  pay_total: 0,
};

const stubStore = (rows: unknown[]) =>
  ({
    identity: { org_id: "org1", branch_id: "br1", device_id: "dev1" },
    openOrders: () => rows,
    kitchenQueue: () => [],
    availability: () => [],
    branchTimeStatus: () => ({ offset_ms: 0, basis: "branch", skew_ms: null, skew_flagged: false }),
    append: vi.fn((input) => ({ ...input, lamport_seq: 1 })),
  }) as unknown as DeviceStore;

const deps = (rows: unknown[]): GatewayDeps =>
  ({
    store: stubStore(rows),
    catalog: () => ({ name: "Chicken Karahi" }),
    menu: () => [],
    priceOf: () => 145_000,
    actor: "Ayesha",
    session: () => ({ user_id: "user-1", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
    blockedCursor: () => null,
    // 01-F56/DEC-SYNC-011 — the catalog refusal, required on GatewayDeps. Healthy here: this
    // harness is about another fact, and a raised refusal would be scenery in it.
    catalogRefusal: () => null,
    businessDay: () => "2026-08-07",
    // 27-F68 — the density of the glass, required on GatewayDeps.
    panelPpi: () => 100.5,
    // `27-F11c` — required, so a host that forgets the panel-fit notice is a typecheck
    // error rather than a silent no-op. `null` = this fixture's glass clears the floor.
    panelFit: () => null,
  }) as GatewayDeps;

describe("C19/C31 — the gateway carries the fold's order facts to the Orders tab", () => {
  it("passes channel, order_type, confirmed_at and settled through from the fold row", () => {
    // Each of these is asserted INDIVIDUALLY rather than by one `toEqual` on the whole object,
    // because each one dropped alone is a different broken product: no `channel` and the inbox
    // is empty forever; no `confirmed_at` and accepted orders never leave it AND `03-F46`'s
    // ordering collapses; no `settled` and paid orders never leave the open list.
    const [order] = createGateway(deps([ROW])).openOrders();
    expect(order?.channel).toBe("storefront");
    expect(order?.order_type).toBe("delivery");
    expect(order?.confirmed_at).toBeNull();
    expect(order?.settled).toBe(0);
  });

  it("distinguishes an unconfirmed order from a confirmed one, by VALUE not by presence", () => {
    // `null` and a stamp are both "the host said". The screen's `confirmed_at === null` test
    // depends on this being the fold's own value and not a placeholder the gateway invented.
    const rows = [ROW, { ...ROW, order_id: "order-confirmed", confirmed_at: 1_722_000_000_000 }];
    const orders = createGateway(deps(rows)).openOrders();
    expect(orders.find((o) => o.order_id === "order-1234abcd")?.confirmed_at).toBeNull();
    expect(orders.find((o) => o.order_id === "order-confirmed")?.confirmed_at).toBe(
      1_722_000_000_000,
    );
  });

  it("refuses a channel outside 02-F42's closed set rather than passing it on", () => {
    // `02-F42` closed `channel` because `01-F60` makes it a PRICE KEY — "a typo is not a
    // mislabelled report row, it is a wrong price". So a row carrying `dine_in` (the `order_type`
    // vocabulary, the exact confusion that FR names) must fail LOUDLY at this boundary rather
    // than reach a screen that would silently drop it out of every list.
    expect(() => createGateway(deps([{ ...ROW, channel: "dine_in" }])).openOrders()).toThrow();
  });

  it("still serves an order from a row that carries none of them (01-F54)", () => {
    // The degrade the optional fields exist for. A host or fixture predating these columns must
    // still get its order — `01-F17`/`01-F54` say degrade, never drop — with the four facts
    // absent rather than guessed.
    const [order] = createGateway(
      deps([{ order_id: "legacy", json_lines: JSON_LINES, pay_total: 0 }]),
    ).openOrders();
    expect(order?.order_id).toBe("legacy");
    expect(order?.channel).toBeUndefined();
    expect(order?.confirmed_at).toBeUndefined();
  });
});
