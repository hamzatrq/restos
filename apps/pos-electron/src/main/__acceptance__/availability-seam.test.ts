// Acceptance tests for `02-F7`'s availability toggle and `02-F42`'s channel price key.
//
// PROVENANCE: written alongside the implementation (`24 §3` step 2 wants a separate session);
// derived from spec text — `02-F7`, `02-F40`, `02-F46`, `01-F22`, `01-F57`, `01-F58`, `01-F59`,
// `01-F60`, `02-F1`, `02-F42`. Owed an independent oracle pass.
//
// ── WHY A REAL STORE AND NOT A STUB ─────────────────────────────────────────────────────────
//
// The whole claim of §A–§C is that a toggle appended on this device comes back through the
// AVAILABILITY FOLD and greys the tile. A stubbed `store.availability()` would let this file
// assert its own fixture — `K-3`'s dead-oracle defect — and would pass against a
// `toggleAvailability` that appended nothing at all. So the store is real, the fold is real, and
// every assertion below reads the projection rather than the request.
//
// ── WHAT §D IS FOR, AND WHY IT LOOKS BACKWARDS ──────────────────────────────────────────────
//
// The task that commissioned this work asked for a mutant proving "86 an item and the counter
// REFUSES TO SELL IT". **`01-F59` says the opposite in terms** — *"the counter may still sell it
// deliberately"* — and `01-F60` states the contrast explicitly: *"an 86'd item stays deliberately
// sellable; an unpriced one has nothing to sell at. This is the opposite disposition to
// `01-F59`, and deliberately."* So §D asserts that an 86'd item is STILL SELLABLE, and §E that an
// unpriced one is not. A suite that took the brief literally would have pinned a refusal the
// kernel forbids, and `02-F31`'s oversell path — which exists precisely to absorb this — would
// have had nothing to absorb.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type Gateway, type GatewayDeps } from "../gateway";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;

const KARAHI = "i-karahi";
const NAAN = "i-naan";

/**
 * `01-F60` — TWO channels with DIFFERENT prices for one item, which is the whole point of the
 * FR (*"aggregator commission is 25–35%, so a restaurant prices the same dish differently per
 * channel deliberately"*). `phone` is priced too; `whatsapp` deliberately is not, so §E has an
 * unpriced pair to assert against without inventing one.
 */
const PRICES: Record<string, Record<string, number>> = {
  [KARAHI]: { counter: 45_000, foodpanda: 58_000, phone: 45_000 },
  [NAAN]: { counter: 5_000, foodpanda: 7_000, phone: 5_000 },
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const harness = (over: Partial<GatewayDeps> = {}): { store: DeviceStore; gateway: Gateway } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-availability-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const gateway = createGateway({
    store,
    catalog: (id) => (id === KARAHI ? { name: "Chicken Karahi" } : { name: "Naan" }),
    menu: () => [
      { id: KARAHI, name: "Chicken Karahi" },
      { id: NAAN, name: "Naan" },
    ],
    priceOf: (item_id, channel) => PRICES[item_id]?.[channel] ?? null,
    actor: "dev",
    session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-10",
    panelPpi: () => 100.5,
    panelFit: () => null,
    ...over,
  });
  return { store, gateway };
};

/** The one tile under test, as the renderer receives it. */
const tile = (gateway: Gateway, channel: string, id = KARAHI) =>
  gateway.menu(channel).find((m) => m.id === id);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 02-F7: the toggle EXISTS and reaches the fold. This is the wave's named defect, aimed at
// the exact shape it takes here: `availability.changed` had a schema, a convergent fold, a store
// table and a join in `menu()` since July 2026 and NO PRODUCER, so nothing could 86 anything.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F7 — a toggle is appended and the fold sees it", () => {
  it("marks the item sold out on the grid, through the real availability fold", () => {
    const { gateway } = harness();
    expect(tile(gateway, "counter")?.sold_out).toBeUndefined();

    gateway.toggleAvailability({ item_id: KARAHI, available: false });

    // Read back through `menu()`, which joins the CATALOG to the FOLD's projection. Asserting
    // the append's return value instead would pass against a gateway that appended to nothing.
    expect(tile(gateway, "counter")?.sold_out).toBe(true);
    expect(tile(gateway, "counter")?.unavailableReason).toBe("86");
    // The other item is the control: a toggle is per-item, not a switch on the whole grid.
    expect(tile(gateway, "counter", NAAN)?.sold_out).toBeUndefined();
  });

  it("appends `availability.changed` with 02-F19's actor, and nothing else", () => {
    const { store, gateway } = harness();
    gateway.toggleAvailability({ item_id: KARAHI, available: false });

    const events = store.readAllEvents().filter((e) => e.type === "availability.changed");
    expect(events).toHaveLength(1);
    // `02-F19` names "availability toggle" an attributed action and `02-F41` makes attribution
    // whoever's PIN is in — read at append from the session, exactly like the other write sites.
    expect(events[0]?.actor_user_id).toBe("u-ayesha");
    expect(events[0]?.payload).toMatchObject({ item_id: KARAHI, available: false });
  });

  it("puts it BACK — the toggle is reversible in one act", () => {
    const { gateway } = harness();
    gateway.toggleAvailability({ item_id: KARAHI, available: false });
    expect(tile(gateway, "counter")?.sold_out).toBe(true);

    gateway.toggleAvailability({ item_id: KARAHI, available: true });
    expect(tile(gateway, "counter")?.sold_out).toBeUndefined();
    expect(tile(gateway, "counter")?.unavailable).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 01-F57: the supersedes link. THE LOAD-BEARING SECTION, because getting it wrong does not
// throw — it strands an item 86'd for ever.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F57 — the toggle carries the fold's own heads", () => {
  it("supersedes the previous toggle, so the second act converges rather than contests", () => {
    const { store, gateway } = harness();
    const first = gateway.toggleAvailability({ item_id: KARAHI, available: false });
    const second = gateway.toggleAvailability({ item_id: KARAHI, available: true });

    const events = store.readAllEvents().filter((e) => e.type === "availability.changed");
    // The FIRST names nothing (no heads existed); the SECOND names the first by envelope id.
    const supersedesOf = (e: { payload: unknown } | undefined): string[] =>
      ((e?.payload ?? {}) as { supersedes?: string[] }).supersedes ?? [];
    expect(supersedesOf(events[0])).toEqual([]);
    expect(supersedesOf(events[1])).toEqual([first.id]);
    expect(second.id).not.toBe(first.id);

    // The observable consequence, which is what the link is FOR: one live head, so the fold
    // resolves rather than raising `01-F58`'s contest. Without the link both toggles stay live,
    // they disagree, and the item is unavailable-and-disputed for ever.
    expect(tile(gateway, "counter")?.sold_out).toBeUndefined();
    expect(tile(gateway, "counter")?.contested).toBeUndefined();
  });

  it("supersedes EVERY head at once, so 01-F58's contest is clearable in one operator act", () => {
    const { store, gateway } = harness();
    // Two devices disagree — `01-F22` puts this control on the POS, the pass and the console, so
    // concurrent toggles are ordinary. Appended directly to build the state the fold must see;
    // neither names the other, so both are live heads.
    for (const [i, available] of [false, true].entries()) {
      store.append({
        id: `0199cccc-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
        ...IDENTITY,
        actor_user_id: "u-other",
        device_created_at: 1_754_300_000_000 + i,
        type: "availability.changed",
        schema_version: 1,
        payload: { item_id: KARAHI, available, supersedes: [] },
        refs: [],
      });
    }
    // `01-F58` — the fold does not pick a winner; it resolves to UNAVAILABLE and flags it.
    expect(tile(gateway, "counter")?.contested).toBe(true);
    expect(tile(gateway, "counter")?.sold_out).toBe(true);
    expect(tile(gateway, "counter")?.unavailableReason).toBe("86 — disputed");

    // ONE tap clears it. This is the assertion `merge.ts`'s own comment demands — *"superseding
    // only the head your screen happened to show leaves the other head standing"* — and it is
    // why the link is built in main from `store.availability()` rather than echoed by a renderer
    // that may be showing a stale row.
    gateway.toggleAvailability({ item_id: KARAHI, available: true });
    const last = store
      .readAllEvents()
      .filter((e) => e.type === "availability.changed")
      .at(-1);
    expect(((last?.payload ?? {}) as { supersedes?: string[] }).supersedes ?? []).toHaveLength(2);
    expect(tile(gateway, "counter")?.contested).toBeUndefined();
    expect(tile(gateway, "counter")?.sold_out).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 01-F55: a toggle may not name an item the grid does not sell.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F55 — an unknown item is refused, not appended", () => {
  it("refuses, because 01-F1 makes an un-clearable toggle permanent", () => {
    const { store, gateway } = harness();
    expect(() => gateway.toggleAvailability({ item_id: "i-ghost", available: false })).toThrow(
      /not a live catalog item/,
    );
    expect(store.readAllEvents().filter((e) => e.type === "availability.changed")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F59: AN 86'd ITEM STAYS SELLABLE. Read the file header before changing this.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F59 — the 86 GREYS the tile and does NOT block the sale", () => {
  it("keeps the item addable after it is marked sold out", () => {
    const { store, gateway } = harness();
    gateway.append({
      type: "order.created",
      payload: { order_id: "order-1", channel: "counter", order_type: "takeaway" },
      refs: [],
    });
    gateway.toggleAvailability({ item_id: KARAHI, available: false });
    expect(tile(gateway, "counter")?.sold_out).toBe(true);

    // `01-F59`: *"the counter may still sell it deliberately — `02-F31` owns the oversell path."*
    // `01-F17` is the same rule one level up: a sale is never blocked. An implementation that
    // refused here would be enforcing a rule the kernel explicitly declines to make.
    expect(() => gateway.addLine({ order_id: "order-1", item_id: KARAHI, qty: 1 })).not.toThrow();

    const line = store.readAllEvents().find((e) => e.type === "order.line_added");
    // And it rings at its real price. An 86'd item's price is KNOWN — that is the whole
    // difference from `01-F60`'s unpriced case in §E.
    expect(line?.payload).toMatchObject({ item_id: KARAHI, unit_price_paisa: 45_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 02-F42 / 01-F60: THE CHANNEL IS A PRICE KEY. The second mutation target.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F60 — the ORDER's channel decides what a line costs", () => {
  it("rings the SAME item at a different price on a different channel", () => {
    const { store, gateway } = harness();
    for (const [order_id, channel] of [
      ["order-counter", "counter"],
      ["order-fp", "foodpanda"],
    ] as const) {
      gateway.append({
        type: "order.created",
        payload: { order_id, channel, order_type: "delivery" },
        refs: [],
      });
      gateway.addLine({ order_id, item_id: KARAHI, qty: 1 });
    }

    const priced = store
      .readAllEvents()
      .filter((e) => e.type === "order.line_added")
      .map((e) => e.payload as { order_id: string; unit_price_paisa: number });

    // The numbers, not just "they differ": a mutant that resolved every channel to the same
    // column would satisfy an inequality-free assertion, and one that resolved to the DEVICE's
    // channel would give 45,000 twice — which is exactly what `02-F42` warns against
    // ("would be lost if the price resolved from the *device* rather than the *order*").
    expect(priced.find((p) => p.order_id === "order-counter")?.unit_price_paisa).toBe(45_000);
    expect(priced.find((p) => p.order_id === "order-fp")?.unit_price_paisa).toBe(58_000);
  });

  it("refuses a line whose channel has no price — 01-F60's opposite disposition to 01-F59", () => {
    const { gateway } = harness();
    gateway.append({
      type: "order.created",
      payload: { order_id: "order-wa", channel: "whatsapp", order_type: "delivery" },
      refs: [],
    });
    // *"Selling requires a number and inventing one is worse than refusing."* Note the contrast
    // with §D on the SAME item: 86'd is sellable, unpriced is not.
    expect(() => gateway.addLine({ order_id: "order-wa", item_id: KARAHI, qty: 1 })).toThrow(
      /no price for channel whatsapp/,
    );
  });

  it("greys the grid against the ORDER's channel, so it cannot offer what addLine refuses", () => {
    const { gateway } = harness();
    // The defect this closes: `menu()` used to ask `priceOf(id, "counter")` whatever the order
    // was, so on a whatsapp order every tile read sellable and every tap threw.
    expect(tile(gateway, "counter")?.unavailable).toBeUndefined();
    expect(tile(gateway, "foodpanda")?.unavailable).toBeUndefined();
    expect(tile(gateway, "whatsapp")?.unavailableReason).toBe("no price set");
  });

  it("refuses a channel outside 02-F42's closed set rather than greying the whole grid", () => {
    const { gateway } = harness();
    expect(() => gateway.menu("dine_in")).toThrow();
    expect(() => gateway.menu("")).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — 01-F60 vs 01-F59, stated as ONE assertion because the two states must stay tellable
// apart. `unavailable` collapses them; `sold_out` is what `02-F7`'s own surface reads.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F an 86'd item and an unpriced one are DIFFERENT states", () => {
  it("distinguishes them on the same tile read", () => {
    const { gateway } = harness();
    gateway.toggleAvailability({ item_id: KARAHI, available: false });

    const soldOut = tile(gateway, "counter");
    const unpriced = tile(gateway, "whatsapp", NAAN);

    // Both are greyed, and a surface that read only `unavailable` could not tell them apart —
    // which is why the Sold-out grid reads `sold_out` and would otherwise be telling an operator
    // the kitchen ran out of something nobody has touched.
    expect(soldOut?.unavailable).toBe(true);
    expect(unpriced?.unavailable).toBe(true);
    expect(soldOut?.sold_out).toBe(true);
    expect(unpriced?.sold_out).toBeUndefined();
  });
});
