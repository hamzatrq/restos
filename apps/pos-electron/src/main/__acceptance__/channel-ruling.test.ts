// ACCEPTANCE TEST — the founder's channel ruling, main-process half.
//
// PROVENANCE (`24 §3` step 2): **authored from spec text only**, by a session that wrote no
// implementation. The ruling it transcribes:
//
//   > The order types are takeaway, delivery, dine-in (unchanged). The channels a cashier may
//   > originate on are **in-restaurant, foodpanda, WhatsApp, and call**.
//   > `counter` is LABELLED "In restaurant" — the stored value stays `counter`. `call` is
//   > likewise the label for the stored `phone`.
//
// The renderer half — which tiles the row shows, what they are called, and what a tap stores —
// is `renderer/channel-ruling.dom.test.tsx`. This file owns the two things that live on the
// trusted side and that a screen test cannot see:
//
//   1. **The kernel does not move** (§A). `02-F42`'s set already contains `whatsapp`, so the
//      ruling needs no `packages/domain` change at all — and `01-F1`/`01-F53` make the stored
//      ids permanent, so it must not get one. `packages/domain` is a PROTECTED PATH
//      (commandment 10); a diff there in service of this ruling is the thing to stop, and §A is
//      the tripwire that stops it. Asserted from OUTSIDE the package, so no protected file is
//      touched to install the guard.
//   2. **A channel with no price cannot be sold** (§B–§D). `01-F60` prices per
//      `(branch, channel)` with **no fallback**, so the moment the row offers a channel the dev
//      seed does not price, every tile greys `no price set` and the feature ships green and
//      unusable. That is not hypothetical: it is what happened when the row grew from one
//      channel to three, and `main/catalog.ts`'s own header records it. §B–§D are the assertions
//      that were missing then.
//
// ⚠ §E is a SOURCE READ, on `catalog-seam.test.ts` §D's house pattern and for its stated reason:
// the row is a renderer module and the seed is a main module, `18 §9` puts no import across that
// boundary, and `catalog.ts` already *promises* — in a shipped comment — that a drift between
// them is asserted somewhere. It was not. §E makes the promise true.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { newId, ORDER_CHANNELS } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  catalogResolver,
  devMenuSnapshot,
  priceResolver,
  seedDevMenu,
  sellableMenu,
  stationResolver,
} from "../catalog";
import { createGateway, type GatewayDeps } from "../gateway";

const IDENTITY = {
  org_id: "00000000-0000-7000-8000-0000000000c1",
  branch_id: "00000000-0000-7000-8000-0000000000c2",
  device_id: "00000000-0000-7000-8000-0000000000c3",
} as const;

/**
 * The four channels the ruling puts on the counter, as the ids `02-F42` closed — **not** as the
 * words the cashier reads.
 *
 * This constant is the whole point of the ruling written down once: `In restaurant` is a LABEL
 * and `counter` is the value `01-F53` snapshots into `order.created` and `01-F60` resolves a
 * price by. `01-F1` forbids rewriting history, so every order ever rung on this till already
 * carries `counter` and every priced catalog row is keyed to it — a rename would strand both,
 * silently, and the till would grey every tile the moment the seed and the ledger disagreed.
 */
const COUNTER_CHANNEL_IDS = ["counter", "phone", "foodpanda", "whatsapp"] as const;

let dir: string;
let store: DeviceStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "restos-channel-ruling-"));
  store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The gateway as `index.ts` builds it, with the catalog deps under test and the rest inert. */
const gatewayOver = (target: DeviceStore, over: Partial<GatewayDeps> = {}) =>
  createGateway({
    store: target,
    catalog: catalogResolver(target),
    menu: sellableMenu(target),
    priceOf: priceResolver(target),
    actor: "test",
    session: () => null,
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-13",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
    ...over,
  });

const lineCells = (target: DeviceStore, order_id: string) => {
  const row = target.openOrders().find((o) => o.order_id === order_id);
  if (row === undefined) throw new Error(`no open order ${order_id}`);
  return Object.values(
    JSON.parse(row.json_lines) as Record<string, { item_id: string; unit_price_paisa: number }>,
  );
};

/** Every seeded SELLABLE item's price on one channel, as a map so a diff names the item. */
const pricesOn = (channel: string): Record<string, number | null> => {
  const priceOf = priceResolver(store);
  return Object.fromEntries(sellableMenu(store)().map((m) => [m.id, priceOf(m.id, channel)]));
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE KERNEL DOES NOT MOVE. `02-F42` already closed this set and `whatsapp` is in it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F42/01-F1 — the ruling changes labels, and the kernel's ids are already right", () => {
  it("ORDER_CHANNELS is exactly 02-F42's five, in its declared order", () => {
    // The FR names them: "`counter`, `phone`, `storefront`, `whatsapp`, `foodpanda` — are the
    // whole set". Transcribed, not derived.
    //
    // WRONG IMPLEMENTATION THIS CATCHES, and it is the one the task warns about by name: an
    // implementer reads "whatsapp joins the counter" and ADDS it to the registry — a
    // protected-path diff (commandment 10) in service of a change that needs none. The FR text
    // and this array already agree; the missing list is `Counter.tsx`'s.
    //
    // ORDER is asserted too, not just membership: `printing.ts` buckets a day's sales by
    // iterating this array and `escpos`'s day summary prints the rows in the order it yields,
    // so a reorder silently reorders a printed document a manager reconciles a deposit against.
    expect([...ORDER_CHANNELS]).toEqual([
      "counter",
      "phone",
      "storefront",
      "whatsapp",
      "foodpanda",
    ]);
  });

  it("every channel the counter offers is ALREADY a member — no kernel change is owed", () => {
    // The load-bearing consequence: the ruling is satisfiable with zero `packages/domain` diff.
    // If this ever fails, the corpus and the ruling have genuinely diverged and the answer is a
    // spec PR to `02-F42` (commandment 9), never a quiet edit to the enum.
    for (const id of COUNTER_CHANNEL_IDS) {
      expect(
        ORDER_CHANNELS as readonly string[],
        `${id} must already be an 02-F42 channel`,
      ).toContain(id);
    }
  });

  it("01-F53/01-F1 — the LABEL changes and the stored id does not: in_restaurant is refused", () => {
    // The ruling's own sentence, enforced at the only place that can enforce it: the trusted
    // append. A renamed id is not a cosmetic change — `01-F53` snapshots the channel into the
    // event, `01-F1` forbids rewriting it, and `01-F60` keys every catalog price by it.
    //
    // WRONG IMPLEMENTATION THIS CATCHES: `{ id: "in_restaurant", label: "In restaurant" }` on
    // the row. That reads perfectly, typechecks, and puts an `01-F4` error between a cashier and
    // every sale on the busiest channel in the shop. The refusal already exists in the kernel;
    // what did not exist is anything asserting the till stays on the right side of it.
    const gateway = gatewayOver(store);
    expect(() =>
      gateway.append({
        type: "order.created",
        payload: { order_id: newId(), channel: "in_restaurant", order_type: "dine_in" },
        refs: [],
      }),
    ).toThrow();
    // And `call` likewise — the other half of the ruling, and the other half of the mistake.
    expect(() =>
      gateway.append({
        type: "order.created",
        payload: { order_id: newId(), channel: "call", order_type: "takeaway" },
        refs: [],
      }),
    ).toThrow();
  });

  it("a whatsapp order.created is ACCEPTED by the same trusted path", () => {
    // The positive control for the two refusals above. Without it, an implementation that
    // refused EVERY channel would pass them both — the vacuous-guard shape `24 §3`'s round-3
    // law is about.
    const gateway = gatewayOver(store);
    const order_id = newId();
    expect(() =>
      gateway.append({
        type: "order.created",
        payload: { order_id, channel: "whatsapp", order_type: "delivery" },
        refs: [],
      }),
    ).not.toThrow();
    expect(store.openOrders().find((o) => o.order_id === order_id)?.channel).toBe("whatsapp");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE DEFECT THAT SHIPPED LAST TIME. `01-F60` has no fallback: an unpriced channel is a
// grid of refusals, and nothing in the product says so out loud.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F60 — the dev seed prices EVERY channel a cashier may originate on", () => {
  beforeEach(() => {
    const applied = seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    // `24-F14` — if the seed did not apply, every assertion below is about an empty menu and
    // proves nothing. It has to fail here rather than pass silently downstream.
    expect(applied, "the dev seed must apply or this whole section is vacuous").toBe(true);
    expect(sellableMenu(store)().length).toBeGreaterThan(0);
  });

  it.each(COUNTER_CHANNEL_IDS)("every seeded item resolves a price on %s", (channel) => {
    // THE ASSERTION. `01-F60`: "each (branch, channel) pair the org has enabled", and no
    // fallback anywhere — `catalog-seam.test.ts` already pins that a missing pair resolves
    // `null` rather than the counter price. So a channel the seed forgets is a channel on which
    // `menu()` marks every tile `no price set` and `addLine` refuses every tap.
    //
    // WRONG IMPLEMENTATION THIS CATCHES: `devPricesFor` left at counter/phone/foodpanda while
    // the row grows a fourth tile. That is exactly the defect this product shipped when the row
    // grew from one to three — green suites, and a till that could not ring a phone order.
    const missing = Object.entries(pricesOn(channel))
      .filter(([, price]) => price === null)
      .map(([id]) => id);
    expect(missing, `01-F60 — unpriced on ${channel}: every one of these tiles greys`).toEqual([]);
  });

  it("prices are integer paisa, non-negative — commandment 3, on every channel", () => {
    for (const channel of COUNTER_CHANNEL_IDS) {
      for (const [id, price] of Object.entries(pricesOn(channel))) {
        expect(Number.isInteger(price), `${id} on ${channel} must be integer paisa`).toBe(true);
        expect(price as number).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — WHICH price. `01-F60` says why foodpanda differs, and the same clause says why WhatsApp
// does not.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F60 — WhatsApp is a channel the restaurant OWNS, so it takes the house price", () => {
  beforeEach(() => {
    expect(seedDevMenu(store, { RESTOS_DEV_MENU: "1" })).toBe(true);
  });

  it("whatsapp is priced at the counter price, item for item", () => {
    // `01-F60`'s reason for a per-channel price is commission: "aggregator commission is 25–35%,
    // so a restaurant prices the same dish differently per channel deliberately — higher on
    // foodpanda". A WhatsApp order is taken by the restaurant's own staff on the restaurant's
    // own number and pays no aggregator anything, so the markup's premise does not hold — which
    // is the same reason `phone` already carries the house price and is stated in
    // `devPricesFor`'s own comment.
    //
    // WRONG IMPLEMENTATION THIS CATCHES: whatsapp seeded with `FOODPANDA_MARKUP_BPS` — the
    // cheapest way to add a fourth entry is to copy the line above it, and the line above it is
    // the marked-up one. §B would stay green: the tile is priced, it just charges a WhatsApp
    // customer 30% more for ever, snapshotted by `01-F53` into an append-only ledger.
    expect(pricesOn("whatsapp")).toEqual(pricesOn("counter"));
  });

  it("CONTROL — foodpanda still carries its markup, so 'all channels equal' is refuted", () => {
    // Without this, the assertion above is satisfied by a seed that flattened every channel to
    // one price — which would pass §B and §C and quietly delete the one thing `01-F60` exists
    // to express. A control differing in exactly one branch, per `24 §3`'s round-3 law.
    const counter = pricesOn("counter");
    const foodpanda = pricesOn("foodpanda");
    const cheaper = Object.entries(foodpanda).filter(
      ([id, price]) => (price as number) <= (counter[id] as number),
    );
    expect(cheaper, "01-F60 — foodpanda must stay above the house price on every item").toEqual([]);
    // And `phone` keeps the house price it already had: a regression here would mean the fourth
    // channel was added by rewriting the table rather than extending it.
    expect(pricesOn("phone")).toEqual(counter);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE LOOP. Not "a price exists" but "a WhatsApp order can be rung", which is the claim the
// task actually makes and the one a green suite has twice failed to support.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F60/01-F53 — a whatsapp order rings, at the price the seed typed", () => {
  it("the whatsapp grid has NOT ONE greyed tile", () => {
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    const grid = gatewayOver(store).menu("whatsapp");
    expect(grid.length).toBeGreaterThan(0);
    // `menu()` marks an unpriced item `unavailable: true` with reason "no price set". A grid of
    // those is a full-looking grid that sells nothing — indistinguishable from success on a
    // screenshot, and indistinguishable from success to every other suite in this package.
    expect(grid.filter((tile) => tile.unavailable === true)).toEqual([]);
  });

  it("a tile tapped on a whatsapp order captures the HOUSE price into the line", () => {
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    const gateway = gatewayOver(store);
    const order_id = newId();
    gateway.append({
      type: "order.created",
      // `02-F42` — the ORDER's channel is the resolution key, "set at creation and never
      // inferred later". The device is the same one in every case here; what changes the price
      // is this field alone.
      payload: { order_id, channel: "whatsapp", order_type: "delivery" },
      refs: [],
    });
    const first = gateway.menu("whatsapp")[0];
    if (first === undefined) throw new Error("the seeded whatsapp grid is empty");
    gateway.addLine({ order_id, item_id: first.id, qty: 1 });

    const cells = lineCells(store, order_id);
    expect(cells).toHaveLength(1);
    // Not merely "> 0": the NUMBER, against the counter column, because a whatsapp line priced
    // at the foodpanda markup is also greater than zero and is the mistake §C names.
    expect(cells[0]?.unit_price_paisa).toBe(priceResolver(store)(first.id, "counter"));
    expect(cells[0]?.unit_price_paisa as number).toBeGreaterThan(0);
  });

  it("CONTROL — the same tile on a FOODPANDA order rings higher, so the key is the order", () => {
    // The negative control for the test above. If `addLine` resolved from the device or from a
    // constant rather than from the order's own channel, both orders would bill the same and
    // the assertion above would still pass. `02-F42`: "would be lost if the price resolved from
    // the *device* rather than the *order*".
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    const gateway = gatewayOver(store);
    const first = gateway.menu("whatsapp")[0];
    if (first === undefined) throw new Error("the seeded whatsapp grid is empty");

    const wa = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id: wa, channel: "whatsapp", order_type: "delivery" },
      refs: [],
    });
    gateway.addLine({ order_id: wa, item_id: first.id, qty: 1 });

    const fp = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id: fp, channel: "foodpanda", order_type: "delivery" },
      refs: [],
    });
    gateway.addLine({ order_id: fp, item_id: first.id, qty: 1 });

    expect(lineCells(store, fp)[0]?.unit_price_paisa as number).toBeGreaterThan(
      lineCells(store, wa)[0]?.unit_price_paisa as number,
    );
  });

  it("03-F50 — a whatsapp line still routes to a real station, not the fallback", () => {
    // Anti-scope: the ruling touches the price key and nothing else. A seed rebuilt to add a
    // channel must not lose the `01-F21` chain the station inherits down.
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    const stationOf = stationResolver(store);
    const stations = new Set(sellableMenu(store)().map((m) => stationOf(m.id)));
    expect(stations.size).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE DRIFT GUARD, and the promise that was already made for it.
//
// `main/catalog.ts` says, in shipped source: "The channels are `Counter.tsx`'s
// `ORDER_CHANNELS_AT_COUNTER`, transcribed rather than imported ... A drift here greys a column;
// `catalog-seam.test.ts` is where that is asserted." It was not asserted there or anywhere —
// a comment promising a protection that does not exist, which AGENTS.md names as worse than no
// comment because it retires the assertion someone would otherwise write. This is that
// assertion. (The comment's file reference is now wrong and is owed a correction.)
//
// It reads SOURCE for `catalog-seam.test.ts` §D's stated reason: the two lists live either side
// of the `18 §9` boundary, so no test can import both and no runtime path compares them.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL("../../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

/** Every `<key>: "value"` in a source slice, as the values, in order. */
const keyValues = (block: string, key: string): string[] =>
  [...block.matchAll(new RegExp(`\\b${key}\\s*:\\s*"([^"]+)"`, "g"))].map((m) => m[1] as string);

/** The declaration a name introduces, up to the array literal that closes it. */
const declaration = (src: string, name: string): string => {
  const found = new RegExp(`const ${name}\\b[\\s\\S]*?\\n\\];`).exec(src)?.[0];
  if (found === undefined) {
    throw new Error(
      `24-F14 EMPTY MATCH — could not find \`const ${name}\` as an array literal. This guard ` +
        "went looking for the two channel lists and found one of them restructured; it must be " +
        "re-pointed DELIBERATELY, never deleted, or the seed and the row can drift again.",
    );
  }
  return found;
};

describe("§E 01-F60 — the row and the seed name the same channels", () => {
  const counterSrc = readSrc("renderer/Counter.tsx");
  const catalogSrc = readSrc("main/catalog.ts");

  it("is actually reading the two files it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking". Anchored on lines that have nothing
    // to do with channels, so this check cannot be satisfied by the code it guards.
    expect(counterSrc).toContain("export const Counter");
    expect(counterSrc.length).toBeGreaterThan(10_000);
    expect(catalogSrc).toContain("export const seedDevMenu");
    expect(catalogSrc.length).toBeGreaterThan(4_000);
  });

  it("ORDER_CHANNELS_AT_COUNTER and devPricesFor agree, id for id", () => {
    const row = keyValues(declaration(counterSrc, "ORDER_CHANNELS_AT_COUNTER"), "id");
    const seeded = keyValues(declaration(catalogSrc, "devPricesFor"), "channel");
    // Both ends must be non-empty, or the comparison is `[] === []` and this passes for ever.
    expect(
      row.length,
      `the counter's channel row must offer the ruling's ${COUNTER_CHANNEL_IDS.length}, got ` +
        `[${row.join(", ")}] — an empty or short match here would compare two empty lists`,
    ).toBeGreaterThanOrEqual(COUNTER_CHANNEL_IDS.length);
    expect(
      seeded.length,
      `the dev seed must price the ruling's ${COUNTER_CHANNEL_IDS.length}, got ` +
        `[${seeded.join(", ")}]`,
    ).toBeGreaterThanOrEqual(COUNTER_CHANNEL_IDS.length);
    // THE ASSERTION, as sets: the seed may not price FEWER channels than the row offers. The
    // reverse direction is deliberately also fatal — a seed pricing a channel no cashier can
    // choose is dead weight that hides the next omission.
    expect([...row].sort()).toEqual([...seeded].sort());
    // And both are the ruling's four, so a coordinated drift in the same wrong direction still
    // reddens.
    expect([...row].sort()).toEqual([...COUNTER_CHANNEL_IDS].sort());
  });

  it("every id on the row is a real 02-F42 channel", () => {
    // The typo case, which is the one `02-F42` closed the set for: "a typo is not a mislabelled
    // report row — it is a wrong price". `ORDER_CHANNELS_AT_COUNTER` is typed
    // `{ id: string }`, so tsc cannot see this and only an assertion can.
    for (const id of keyValues(declaration(counterSrc, "ORDER_CHANNELS_AT_COUNTER"), "id")) {
      expect(ORDER_CHANNELS as readonly string[], `${id} is not an 02-F42 channel`).toContain(id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — the seed is still the seed. Anti-scope on `devMenuSnapshot` itself.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F60 — the fourth channel is keyed to THIS device's branch, like the other three", () => {
  it("adds no row for any other branch", () => {
    // `devPricesFor` takes the branch as an argument; a fourth entry written with a literal —
    // the branch id pasted from the line above during a copy — would price whatsapp for a
    // branch this device is not in, and `01-F60` resolves nothing here. The failure is silent
    // and looks exactly like the unpriced case.
    const OTHER = "00000000-0000-7000-8000-0000000000d2";
    const branches = new Set(
      devMenuSnapshot(OTHER)
        .flatMap((e) => e.prices ?? [])
        .map((p) => p.branch_id),
    );
    expect([...branches]).toEqual([OTHER]);
  });

  it("prices each channel exactly ONCE per item", () => {
    // A duplicated `(branch, channel)` row is not a compile error and the store's own
    // resolution would pick one of them — which is a money outcome decided by insertion order.
    for (const entry of devMenuSnapshot(IDENTITY.branch_id)) {
      if (entry.kind !== "item") continue;
      const keys = (entry.prices ?? []).map((p) => `${p.branch_id}|${p.channel}`);
      expect(new Set(keys).size, `${entry.id} has a duplicate (branch, channel) row`).toBe(
        keys.length,
      );
    }
  });
});
