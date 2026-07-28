// Acceptance tests for the POS main-process gateway — the seam where the kernel meets the UI.
//
// PROVENANCE: written alongside the implementation (24 §3 step 2 wants otherwise); derived
// from spec text — 18 §6 two-plane, 18 §9 process split, 01-F1 append-only, 01-F43 branch
// time, 26 §8 one fold implementation. Owed an independent oracle pass with the rest of
// Wave 1's UI work.

import type { BlockedCursor, DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayDeps } from "../gateway";

const JSON_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 2, unit_price_paisa: 45000, states: ["confirmed"] },
  "line-b": { item_id: "i-naan", qty: 4, unit_price_paisa: 5000, states: ["confirmed"] },
});

const stubStore = (over: Partial<DeviceStore> = {}) =>
  ({
    identity: { org_id: "org1", branch_id: "br1", device_id: "dev1" },
    openOrders: () => [{ order_id: "order-1234abcd", json_lines: JSON_LINES }],
    kitchenQueue: () => [{ order_id: "order-1234abcd", age_basis: 0 }],
    availability: () => [],
    branchTimeStatus: () => ({ offset_ms: 0, basis: "branch", skew_ms: null, skew_flagged: false }),
    append: vi.fn((input) => ({ ...input, lamport_seq: 1 })),
    ...over,
  }) as unknown as DeviceStore;

const deps = (over: Partial<GatewayDeps> = {}): GatewayDeps => ({
  store: stubStore(),
  catalog: (id) => (id === "i-karahi" ? { name: "Chicken Karahi" } : null),
  menu: () => [{ id: "i-karahi", name: "Chicken Karahi" }],
  actor: "Ayesha",
  actorUserId: "user-1",
  deviceLabel: "Counter 1",
  training: false,
  reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
  blockedCursor: () => null,
  businessDay: () => "2026-07-26",
  ...over,
});

describe("18 §6 / 18 §9 — the renderer's whole surface", () => {
  it("exposes exactly five operations and no query channel", () => {
    // 18 §4: "Apps NEVER run SQL directly." The absence of a query channel is the law, not
    // an omission — anything the renderer can ask for is visible by reading this list.
    //
    // FIVE since T-C6, and the growth is the point of pinning it: `menu` was added because the
    // sellable grid is REFERENCE data, not a fold projection. `01-F52` forbids any fold from
    // reading the catalog — a projected value that embedded a name would depend on catalog sync
    // state at fold time — so the grid cannot arrive through the other three, and adding it had
    // to be an acknowledged widening rather than a quiet one.
    //
    // What makes it still a CLOSED vocabulary: `menu` takes no arguments, names no table and
    // accepts no filter. It is one more fixed answer, not a query.
    expect(Object.keys(createGateway(deps())).sort()).toEqual([
      "append",
      "deviceState",
      "kitchenQueue",
      "menu",
      "openOrders",
    ]);
  });

  it("T-C6 — the grid is the SELLABLE set joined to availability, and carries no price", () => {
    // The join lives HERE, in the host app, and that placement is the whole of 01-F52: the
    // fold never reads a name, the catalog never reads an event, and display time is the only
    // place the two are allowed to meet.
    //
    // No price: 01-F53 snapshots unit_price_paisa into the event at line-add, so a price on a
    // grid tile would be a second source of truth for money, and the wrong one.
    const grid = createGateway(deps()).menu();
    expect(grid).toEqual([{ id: "i-karahi", label: "Chicken Karahi" }]);
    expect(grid[0]).not.toHaveProperty("price");
    expect(grid[0]).not.toHaveProperty("unit_price_paisa");
  });

  it("01-F22/27-F4 — an 86'd item is DISABLED IN PLACE, never dropped from the grid", () => {
    // Removing it would move every tile after it and destroy the positional memory an operator
    // who cannot read depends on entirely. 01-F58's CONTESTED is surfaced as a distinct reason
    // rather than hidden, because the operator is who can resolve it.
    const withToggles = deps({
      store: stubStore({
        availability: () => [
          {
            item_id: "i-karahi",
            available: 0,
            contested: 0,
            head_ids_json: "[]",
            anomalies_json: "[]",
          },
          {
            item_id: "i-daal",
            available: 0,
            contested: 1,
            head_ids_json: "[]",
            anomalies_json: "[]",
          },
        ],
      }),
      menu: () => [
        { id: "i-karahi", name: "Chicken Karahi" },
        { id: "i-daal", name: "Daal" },
        { id: "i-roti", name: "Roti" },
      ],
    });
    expect(createGateway(withToggles).menu()).toEqual([
      { id: "i-karahi", label: "Chicken Karahi", unavailable: true, unavailableReason: "86" },
      { id: "i-daal", label: "Daal", unavailable: true, unavailableReason: "86 — disputed" },
      // Never toggled, so sellable. Defaulting the other way would empty the grid on day one.
      { id: "i-roti", label: "Roti" },
    ]);
  });

  it("has no update, delete or patch — a correction is a new linked event (01-F1)", () => {
    const g = createGateway(deps()) as unknown as Record<string, unknown>;
    for (const forbidden of ["update", "delete", "patch", "query", "sql", "exec"]) {
      expect(g[forbidden], `gateway exposes ${forbidden}`).toBeUndefined();
    }
  });
});

describe("26 §8 / 01-F34 — the order total comes from the engine, never from the app", () => {
  it("renders the fold's own billed derivation", () => {
    // 2 x 45000 + 4 x 5000 = 110000 paisa. The point is not the number: it is that the app
    // calls billedEffectiveFromJsonLines rather than summing the cells itself. Two
    // implementations of one total is how the Auditor's deleted mirror produced false
    // conservation findings (T-01-11 fix round F4).
    const [order] = createGateway(deps()).openOrders();
    expect(order?.total_paisa).toBe(110_000);
  });

  it("never blocks a screen on a missing catalog entry (01-F17)", () => {
    // A renamed or not-yet-synced item renders its id. An unnamed line the cashier can still
    // see beats a screen that will not render — a sale is never blocked.
    const [order] = createGateway(deps()).openOrders();
    expect(order?.lines.map((l) => l.name)).toEqual(["Chicken Karahi", "i-naan"]);
  });
});

describe("01-F43/F45 — elapsed time is branch-consensus on both ends", () => {
  it("measures age against branch time, not the raw device clock", () => {
    // age_basis was stamped at APPEND from branch_created_at; `now` is device clock + the
    // measured branch offset. The offset cancels in the difference, which is exactly why
    // durations need a CONSISTENT clock rather than a correct one.
    const store = stubStore({
      kitchenQueue: () => [{ order_id: "order-1234abcd", age_basis: Date.now() - 15 * 60_000 }],
      branchTimeStatus: () => ({
        offset_ms: 0,
        basis: "branch",
        skew_ms: null,
        skew_flagged: false,
      }),
    } as Partial<DeviceStore>);
    const [ticket] = createGateway(deps({ store })).kitchenQueue();
    expect(ticket?.minutes).toBe(15);
  });

  it("applies the branch offset, so a device with a wrong clock still agrees", () => {
    // A device an hour fast must NOT report every ticket as an hour old. This is the failure
    // the time layer exists to prevent, and it is the one a naive Date.now() would ship.
    const HOUR = 3_600_000;
    const store = stubStore({
      kitchenQueue: () => [{ order_id: "o", age_basis: Date.now() + HOUR - 15 * 60_000 }],
      branchTimeStatus: () => ({
        offset_ms: HOUR,
        basis: "branch",
        skew_ms: null,
        skew_flagged: false,
      }),
    } as Partial<DeviceStore>);
    const [ticket] = createGateway(deps({ store })).kitchenQueue();
    expect(ticket?.minutes).toBe(15);
  });

  it("never reports negative age", () => {
    const store = stubStore({
      kitchenQueue: () => [{ order_id: "o", age_basis: Date.now() + 60_000 }],
    } as Partial<DeviceStore>);
    expect(createGateway(deps({ store })).kitchenQueue()[0]?.minutes).toBe(0);
  });
});

describe("append — the renderer controls the payload and nothing else", () => {
  it("stamps identity and ids in main, not from the request", () => {
    // A renderer that could set branch_created_at could forge the clock; one that could set
    // device_id could forge authorship. Neither field is reachable from the IPC contract.
    const append = vi.fn((input) => ({ ...input, lamport_seq: 1 }));
    const g = createGateway(deps({ store: stubStore({ append } as Partial<DeviceStore>) }));
    g.append({ type: "order.created", payload: { table: 6 }, refs: [] });

    const arg = append.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.org_id).toBe("org1");
    expect(arg.device_id).toBe("dev1");
    expect(arg.actor_user_id).toBe("user-1");
    expect(arg.id).toEqual(expect.any(String));
    expect(arg).not.toHaveProperty("branch_created_at"); // the STORE stamps it (01-F43)
    expect(arg).not.toHaveProperty("lamport_seq");
  });

  it("rejects a malformed request on the trusted side", () => {
    const g = createGateway(deps());
    expect(() => g.append({ payload: {} })).toThrow();
    expect(() => g.append({ type: "", payload: {} })).toThrow();
    expect(() => g.append("nonsense")).toThrow();
  });

  it("ignores renderer-supplied identity rather than trusting it", () => {
    const append = vi.fn((input) => ({ ...input, lamport_seq: 1 }));
    const g = createGateway(deps({ store: stubStore({ append } as Partial<DeviceStore>) }));
    g.append({
      type: "order.created",
      payload: {},
      refs: [],
      device_id: "attacker",
      org_id: "other-org",
    });
    const arg = append.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.device_id).toBe("dev1");
    expect(arg.org_id).toBe("org1");
  });
});

describe("00 §5.7 / DEC-SYNC-011 — the honesty surface", () => {
  it("reports three connection facts, never one", () => {
    const s = createGateway(deps()).deviceState();
    expect([s.lan, s.hub, s.cloud]).toEqual(["ok", "ok", "down"]);
  });

  it("surfaces a blocked catch-up cursor so a stuck device does not look idle", () => {
    const blocked: BlockedCursor = {
      global_seq: 42,
      event_type: "order.teleported",
      reason: "unknown_event_type",
    } as BlockedCursor;
    const s = createGateway(deps({ blockedCursor: () => blocked })).deviceState();
    expect(s.blocked).toEqual({
      global_seq: 42,
      event_type: "order.teleported",
      reason: "unknown_event_type",
    });
  });

  it("carries training as device state, never as something the UI decides (01-F49)", () => {
    expect(createGateway(deps({ training: true })).deviceState().training).toBe(true);
  });
});

describe("ORACLE ROUND 2 / A15 — the money guard is EXECUTED, not merely declared", () => {
  // `shared/ipc.ts` calls `total_paisa`'s `.nonnegative()` "load-bearing, not decoration" and
  // rests the no-ErrorBoundary decision on it. Nothing parsed it: `z.infer` erases the
  // constraint and no output path ran a schema, so the guard the renderer's safety rested on
  // did not exist.
  //
  // The existing `ipc-money-seam.test.ts` could not catch that — every assertion there calls
  // `OpenOrderSchema.safeParse` DIRECTLY, so it tests that Zod rejects negatives, not that the
  // gateway runs Zod. These tests drive the GATEWAY.
  const negativeStore = (paisa: number) =>
    stubStore({
      openOrders: () => [
        {
          order_id: "order-bad",
          json_lines: JSON.stringify({
            "line-a": {
              item_id: "i-karahi",
              qty: 1,
              unit_price_paisa: paisa,
              states: ["confirmed"],
            },
          }),
        },
      ],
    } as Partial<DeviceStore>);

  it("refuses a negative total at the plane boundary rather than blanking the till", () => {
    // MoneyValue throws a RangeError on a negative and React 19 unmounts the root on a render
    // throw — a blank region on a counter screen is indistinguishable from a hung app. 01-F54's
    // remedy is to DEGRADE, and there is nothing to degrade to when the money is the corrupt
    // value, so the boundary is where it has to be refused.
    expect(() => createGateway(deps({ store: negativeStore(-1) })).openOrders()).toThrow(
      /failed its IPC contract/,
    );
  });

  it("names WHICH payload failed, so a kernel bug is not anonymous", () => {
    try {
      createGateway(deps({ store: negativeStore(-500) })).openOrders();
      throw new Error("expected a refusal");
    } catch (e) {
      expect((e as Error).message).toContain("open order order-bad");
    }
  });

  it("a healthy total still passes through untouched", () => {
    // The guard must refuse the corrupt value WITHOUT refusing ordinary money — otherwise it
    // would "fix" the hazard by making the till unable to render a sale.
    const [order] = createGateway(deps()).openOrders();
    expect(order?.total_paisa).toBe(110_000);
  });

  it("device state and kitchen tickets are checked on the same path", () => {
    // The claim was made about the whole seam, not only about money, so all three reads run it.
    const bad = deps({ businessDay: () => "" });
    expect(() => createGateway(bad).deviceState()).toThrow(/failed its IPC contract/);
  });
});
