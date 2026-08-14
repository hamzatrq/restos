// Acceptance tests for the POS main-process gateway — the seam where the kernel meets the UI.
//
// PROVENANCE: written alongside the implementation (24 §3 step 2 wants otherwise); derived
// from spec text — 18 §6 two-plane, 18 §9 process split, 01-F1 append-only, 01-F43 branch
// time, 26 §8 one fold implementation. Owed an independent oracle pass with the rest of
// Wave 1's UI work.

import { resolveAging } from "@restos/device-config";
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
    // `pay_total` is the fold's keyed sum (01-F30/F31) and the seam now REQUIRES it —
    // the schema enforcement added for A15 caught this stub the moment the field landed.
    openOrders: () => [{ order_id: "order-1234abcd", json_lines: JSON_LINES, pay_total: 0 }],
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
  // 01-F60 — priced on the counter channel by default, so existing cases keep exercising a
  // sellable item; the unpriced path is asserted explicitly where it is the subject.
  priceOf: (_item_id, channel) => (channel === "counter" ? 145_000 : null),
  actor: "Ayesha",
  // The `02-F41` rename prescribed by `identity-attribution.test.ts`'s own header ("KNOWN
  // RIPPLE"): `actorUserId: "user-1"` became a session getter, because attribution moves while
  // one gateway instance lives. Every assertion in this file — including
  // `expect(arg.actor_user_id).toBe("user-1")` — still asserts exactly what it asserted before.
  session: () => ({ user_id: "user-1", display_name: "Ayesha" }),
  deviceLabel: "Counter 1",
  training: false,
  reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
  blockedCursor: () => null,
  // 01-F56/DEC-SYNC-011 — the catalog refusal, required on GatewayDeps. Healthy here: this
  // harness is about another fact, and a raised refusal would be scenery in it.
  catalogRefusal: () => null,
  businessDay: () => "2026-07-26",
  // 27-F68 — the density of the glass. Required on GatewayDeps, so no gateway can be
  // constructed without one; 100.5 is 27 §1a's 1366x768 counter panel.
  panelPpi: () => 100.5,
  // `27-F11c` — required, so a host that forgets the panel-fit notice is a typecheck
  // error rather than a silent no-op. `null` = this fixture's glass clears the floor.
  // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
  // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
  // about the thresholds still gets the product's own answers.
  aging: resolveAging(undefined).thresholdsFor,
  panelFit: () => null,
  ...over,
});

describe("18 §6 / 18 §9 — the renderer's whole surface", () => {
  it("exposes exactly seven operations and no query channel", () => {
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
    // SIX since C5, and the widening is again acknowledged rather than quiet. `addLine` exists
    // because `01-F60` resolves a price from the device's branch and the ORDER's channel — both
    // of which live on this side — and `01-F53` freezes the result into the event. Routing it
    // through the generic `append` would have meant the RENDERER supplying `unit_price_paisa`,
    // and this file's own header calls the renderer the untrusted end of the bridge.
    //
    // Still a CLOSED vocabulary: `addLine` names an order, an item and a quantity. It carries no
    // money, no table name and no filter.
    //
    // SEVEN since the Cash and Me surfaces, and this widening is acknowledged on the same terms
    // as the two above it. `cashState` exists because `02-F23` (shift close: expected cash by
    // method, counted cash, over/short, "cashiers see only their own shifts") and `02-F24` (day
    // close: manager count + deposit) are read off the `shift_cash` fold, and `02-F37`/`02-F43`
    // put the unbound settlements and unbound drawer activity in that same projection. None of
    // it is reachable through the other six: `openOrders` and `kitchenQueue` are order-scoped
    // folds and `menu` is reference data, so a shift's reconciliation had no channel at all.
    //
    // ONE read rather than four, for `26 §8`'s reason: fold logic lives in one module, and a
    // renderer assembling a fifth shape out of four channels would be that logic reimplemented
    // outside the engine.
    //
    // Still a CLOSED vocabulary: `cashState` takes NO ARGUMENTS, names no table and accepts no
    // filter — one more fixed answer, like `menu`. Note what that costs and where the cost is
    // paid: `02-F23`'s own-shifts-only scoping is a filter, and because this channel cannot
    // express one it must be applied on the trusted side (commandment 8), never by the renderer
    // choosing which rows to draw.
    //
    // EIGHT since `02-F7`'s toggle, and the widening is acknowledged on the same terms as the
    // three above it. `toggleAvailability` exists because `01-F57` makes `availability.changed`
    // converge on a carried `supersedes` link read off the fold's own heads — which live on this
    // side. Routing it through the generic `append` would have meant the RENDERER supplying that
    // link, and a stale set strands an item 86'd for ever with no act that clears it. Exactly
    // `addLine`'s argument with a causal link in place of a price.
    //
    // Still a CLOSED vocabulary: it names an item and a target state. No table, no filter, and
    // no mutation — it APPENDS, which is why `01-F1`'s channel-name tripwire in
    // `unbound-settlement.dom.test.tsx` had to be satisfied by naming it honestly rather than by
    // loosening the regex.
    //
    // TEN since `02-F27`'s phone quick-entry, and both widenings are acknowledged on the same
    // terms as the four above them.
    //
    // `lookupCustomer` is a READ and cannot arrive through the other three: `openOrders` and
    // `kitchenQueue` are order-scoped folds, `menu` is reference data (`01-F21`) and `cashState`
    // is the shift projection, so the `customer_file` fold had no channel at all — which is
    // precisely why `device-store.ts`'s comment on `customers()` said "the seam STOPS HERE".
    // Still a CLOSED vocabulary: it takes ONE value and answers one fixed question about it,
    // exactly as `menu` takes a channel. No table, no filter.
    //
    // `recordCustomer` exists because the event needs a field the renderer must not supply —
    // `addLine`'s argument with `01-F23`'s IDENTITY in place of a price. `registry.ts` puts
    // normalization at the writer because two normalizers make one customer two rows, and `18 §9`
    // makes main the writer; routing this through the generic `append` would have put the
    // identity key itself on the untrusted end of the bridge. It is also ONE call for `02-F27`'s
    // TWO event types, because that FR names them as one operator act and a screen that could
    // append the create and lose the address would leave a delivery order with nowhere to send
    // the food. Still a CLOSED vocabulary: it names a number, a name and an address text, and it
    // APPENDS — no table, no filter, no mutation.
    expect(Object.keys(createGateway(deps())).sort()).toEqual([
      "addLine",
      "append",
      "cashState",
      "deviceState",
      "kitchenQueue",
      "lookupCustomer",
      "menu",
      "openOrders",
      "recordCustomer",
      "toggleAvailability",
    ]);
  });

  it("T-C6 — the grid is the SELLABLE set joined to availability, and carries no price", () => {
    // The join lives HERE, in the host app, and that placement is the whole of 01-F52: the
    // fold never reads a name, the catalog never reads an event, and display time is the only
    // place the two are allowed to meet.
    //
    // No price: 01-F53 snapshots unit_price_paisa into the event at line-add, so a price on a
    // grid tile would be a second source of truth for money, and the wrong one.
    const grid = createGateway(deps()).menu("counter");
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
    expect(createGateway(withToggles).menu("counter")).toEqual([
      // `sold_out` / `contested` are the availability fold's own two facts, added August 2026
      // for `02-F7`'s toggle surface: `unavailable` is a DISPLAY verdict that also covers the
      // unpriced case, and `01-F60` calls those two dispositions opposites. The greying
      // assertions either side of them are unchanged.
      //
      // ⚠ RETIRED 2026-08-14, by the test owner, under `02-F52`. These two literals read `86`
      // and `86 — disputed` — the jargon — and they were an artefact of this file rather than a
      // requirement: no FR had ever named the operator-facing word, and this suite's own header
      // says it was "written alongside the implementation … Owed an independent oracle pass", so
      // what it pinned here was the implementation's choice fed back as a contract. `02-F52` now
      // decides the word: `00 §5.6` makes the UI English-only, `86` is American restaurant slang
      // that has to be TAUGHT, and `21 §5` puts this operator at plausibly non-reading. The FR's
      // evidence is that the product contradicted ITSELF — `Counter.tsx`'s Sold-out tab has
      // always computed `Sold out` from the same two facts, so one cashier saw two names for one
      // state depending on her tab. The STRUCTURE of the assertion is untouched: two facts, two
      // dispositions, `i-roti` still the sellable control, `no price set` still separate
      // (`01-F60` calls it the opposite disposition and this FR leaves it alone).
      {
        id: "i-karahi",
        label: "Chicken Karahi",
        unavailable: true,
        unavailableReason: "Sold out",
        sold_out: true,
      },
      {
        id: "i-daal",
        label: "Daal",
        unavailable: true,
        unavailableReason: "Sold out — disputed",
        sold_out: true,
        contested: true,
      },
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
      // 15.5 MINUTES, not 15, and the half-minute is the whole point. `age_basis` is computed
      // from a `Date.now()` read that happens INSIDE `kitchenQueue()` — i.e. AFTER the gateway
      // has already read its own clock — so the elapsed span is very slightly SHORTER than the
      // literal here. Landing exactly on a minute boundary made `floor` return 14 whenever a
      // millisecond ticked between the two reads: a genuine ~1-in-6 flake, caught by a capture
      // harness after two full suites failed and twelve passed.
      //
      // Offsetting off the boundary keeps the test about what it is FOR — that the branch
      // offset cancels in the difference — and stops it also being a test of clock jitter.
      kitchenQueue: () => [
        { order_id: "order-1234abcd", age_basis: Date.now() - (15 * 60_000 + 30_000) },
      ],
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
      // Off the minute boundary for the reason given above.
      kitchenQueue: () => [
        { order_id: "o", age_basis: Date.now() + HOUR - (15 * 60_000 + 30_000) },
      ],
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
          pay_total: 0,
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
