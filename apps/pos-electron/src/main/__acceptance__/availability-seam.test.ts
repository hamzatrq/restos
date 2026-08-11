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

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { PERMISSION_ACTIONS } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { authorizeWrites, WRITE_ACTIONS } from "../authorize";
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
    // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
    // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
    // about the thresholds still gets the product's own answers.
    aging: resolveAging(undefined).thresholdsFor,
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G / §H — **BOTH SECTIONS EXIST BECAUSE MUTANTS SURVIVED §A–§F.** Full pos-electron suite
// under each mutant, control 586:
//
//   M1  `index.ts` never wires `CHANNELS.toggleAvailability`   SURVIVED — 586/586 green
//   M7  `authorize.ts` drops the guard on the toggle           SURVIVED — 586/586 green
//
// M1 is **the wave's named defect reproduced inside the fix for it**: a correct, fold-verified,
// mutation-proven toggle that the shipped application never calls, every gate green.
// `seams:check` cannot see it either — `toggleAvailability` IS a reached export (the authorize
// wrapper reaches it), so Rule A is satisfied and Rule B has no optional member to look at.
//
// M7 is worse in kind: a renderer-originated append reaching an append-only ledger with no
// matrix verdict, on a brand-new write channel. `02-F46` exists precisely so Commandment 8 has
// something to refuse against, and nothing was checking that the refusal is actually wired.
//
// ── THE MATRIX AFTER THESE SECTIONS LANDED ──────────────────────────────────────────────────
//
// Control 606/606. Full pos-electron suite under every mutant; the right-hand column is the
// finding — **no pre-existing test can see ANY of these**, so every kill is attributable here.
//
//   #     mutant (exactly one branch)                                    new   pre-existing 574
//   M1    `index.ts` never wires the toggle channel                       2         all green
//   M1b   wired, but to the RAW gateway — commandment 8 routed around     1         all green
//   M1c   wired and guarded, but no `notifyChanged()`                     1         all green
//   M7    `authorize.ts` drops the guard                                  2         all green
//   M7b   guarded AFTER the append — `01-F1` makes it permanent           2         all green
//   M7c   mapped to `order.create` instead of `02-F46`'s own action       1         all green
//   M8    the no-default channel ruling undone (`?? "counter"`)           2         all green
//   M8b   the channel STICKS across orders (no reset)                     1         all green
//   M8c   `storefront` + `whatsapp` offered — the narrowing widened       1         all green
//   M10   the Sold-out grid reads the TILE, not the FOLD                  1         all green
//   M9    NEGATIVE CONTROL — a real refactor of the supersedes read       0         all green
//
// M9 is what makes every other row mean something: a genuine one-branch edit reddens nothing.
//
// ⚠ **A MEASUREMENT NOTE, because the first count of this table was WRONG.** The harness
// counted lines matching `FAIL` and reported four pre-existing failures under M1 — they were
// source-context lines containing `MAX_FAILED_ATTEMPTS`. Anchoring on `^ FAIL ` gives zero.
// A proxy for the evidence accepted as the evidence, which is the mistake `AGENTS.md` records
// against a comment-blind grep, reappearing one tool over inside the work that cites it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G the SHIPPED host reaches the toggle (the M1 survivor)", () => {
  // A SOURCE READ, and say so plainly: `main/index.ts` builds an Electron app at module scope
  // and no suite in this package can import it. Same instrument and same justification as
  // `line-advance-seam.test.ts` §A and `print-ack-audit.test.ts` §A. It is weak — it cannot tell
  // a wired handler from a commented-out one — which is why §H below is behavioural.
  const indexSrc = readFileSync(new URL("../index.ts", import.meta.url).pathname, "utf8");
  const handlerBody = (): string => {
    const at = indexSrc.indexOf("CHANNELS.toggleAvailability");
    expect(at, "no toggle channel is wired in index.ts at all").toBeGreaterThan(-1);
    return indexSrc.slice(at, at + 400);
  };

  it("binds the toggle channel to the AUTHORIZED writes, not to the raw gateway", () => {
    expect(indexSrc).toMatch(/ipcMain\.handle\(\s*CHANNELS\.toggleAvailability/);
    // `writes.`, never `gateway.` — a handler wired straight to the gateway would append with no
    // matrix verdict, and §H would still pass because §H tests the wrapper, not the wiring.
    expect(handlerBody()).toMatch(/writes\.toggleAvailability\(req\)/);
    expect(handlerBody()).not.toMatch(/gateway\.toggleAvailability/);
  });

  it("notifies the renderer, so 01-F15's fast path is visible on this device", () => {
    // Without this the grid greys only at the next poll, while `02-F7` promises the tile greys
    // "within the LAN budget". The same omission is what left `notifyCatalogVersion` unwired.
    expect(handlerBody()).toMatch(/notifyChanged\(\)/);
  });

  it("the preload bridge serves the channel", () => {
    // The other half of one seam: main can wire it and the renderer still never reach it.
    const preload = readFileSync(
      new URL("../../preload/index.ts", import.meta.url).pathname,
      "utf8",
    );
    expect(preload).toMatch(/toggleAvailability:\s*\(req\)\s*=>\s*ipcRenderer\.invoke/);
  });
});

describe("§H commandment 8 — the toggle is GATED (the M7 survivor)", () => {
  const storeFor = (role: string) =>
    ({
      identity: IDENTITY,
      staff: { lookup: () => ({ user_id: "u-x", assignments: [{ role, branch_id: "br-1" }] }) },
    }) as unknown as Parameters<typeof authorizeWrites>[0]["store"];

  const wrap = (role: string, session: () => { user_id: string; display_name: string } | null) => {
    const calls: unknown[] = [];
    const writes = authorizeWrites({
      writes: {
        append: () => ({ id: "a" }),
        addLine: () => ({ id: "b" }),
        toggleAvailability: (req: unknown) => {
          calls.push(req);
          return { id: "c" };
        },
      },
      store: storeFor(role),
      session,
      paidOutApprovalThresholdPaisa: 200_000,
    });
    return { writes, calls };
  };

  const signedIn = () => ({ user_id: "u-x", display_name: "X" });

  it("`02-F46` — a CASHIER may 86, which is the cell that makes the feature exist at all", () => {
    // `02-F40` makes 86-ing a counter action in a printer-only kitchen and `27-F11e` makes that
    // most deployments, so a denied cashier means a T1 branch whose manager went home cannot 86.
    const { writes, calls } = wrap("cashier", signedIn);
    expect(() => writes.toggleAvailability({ item_id: KARAHI, available: false })).not.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("refuses a STOREKEEPER, and refuses BEFORE the ledger is touched", () => {
    const { writes, calls } = wrap("storekeeper", signedIn);
    expect(() => writes.toggleAvailability({ item_id: KARAHI, available: false })).toThrow(
      /permission matrix/,
    );
    // The load-bearing half: a guard that threw AFTER delegating would already have appended,
    // and `01-F1` makes that permanent.
    expect(calls).toEqual([]);
  });

  it("refuses a LOCKED device — `01-F27` never promotes a device identity into a user", () => {
    const { writes, calls } = wrap("cashier", () => null);
    expect(() => writes.toggleAvailability({ item_id: KARAHI, available: false })).toThrow();
    expect(calls).toEqual([]);
  });

  it("refuses against `02-F46`'s OWN action, never a borrowed one", () => {
    // Mapped to `order.create` the two would move together for ever — a later narrowing of one
    // silently narrowing the other. `02-F46` says in terms that they are different acts with
    // different blast radii.
    expect(WRITE_ACTIONS["availability.changed"]).toBe("availability.toggle");
    expect(PERMISSION_ACTIONS).toContain("availability.toggle");
  });
});
