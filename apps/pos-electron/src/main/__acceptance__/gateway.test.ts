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
  "line-a": { qty: 2, unit_price_paisa: 45000, states: ["confirmed"] },
  "line-b": { qty: 4, unit_price_paisa: 5000, states: ["confirmed"] },
});

const stubStore = (over: Partial<DeviceStore> = {}) =>
  ({
    identity: { org_id: "org1", branch_id: "br1", device_id: "dev1" },
    openOrders: () => [{ order_id: "order-1234abcd", json_lines: JSON_LINES }],
    kitchenQueue: () => [{ order_id: "order-1234abcd", age_basis: 0 }],
    branchTimeStatus: () => ({ offset_ms: 0, basis: "branch", skew_ms: null, skew_flagged: false }),
    append: vi.fn((input) => ({ ...input, lamport_seq: 1 })),
    ...over,
  }) as unknown as DeviceStore;

const deps = (over: Partial<GatewayDeps> = {}): GatewayDeps => ({
  store: stubStore(),
  catalog: (id) => (id === "line-a" ? { name: "Chicken Karahi" } : null),
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
  it("exposes exactly four operations and no query channel", () => {
    // 18 §4: "Apps NEVER run SQL directly." The absence of a query channel is the law, not
    // an omission — anything the renderer can ask for is visible by reading this list.
    expect(Object.keys(createGateway(deps())).sort()).toEqual([
      "append",
      "deviceState",
      "kitchenQueue",
      "openOrders",
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
    expect(order?.lines.map((l) => l.name)).toEqual(["Chicken Karahi", "line-b"]);
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
