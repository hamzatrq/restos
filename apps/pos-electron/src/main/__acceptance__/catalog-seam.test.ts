// T-C6 — the catalog reaches the till, and the till has a production caller for it.
//
// **WHY THIS FILE EXISTS.** `plans/wave-1/catalog-transport.md` built five sixths of a catalog
// pipe with excellent tests at every joint: `packages/sync-client`'s versioned store and fetch
// accumulator, `sync-protocol`'s frames, the gateway's org-scoped publish and serve. Every one of
// those suites can be green while **the shipped application never asks for a catalog and its item
// grid is empty** — which is AGENTS.md's named defect of this wave, and it had already produced
// five instances before this one.
//
// So this file asserts TWO SEPARATE CLAIMS, because the wave has repeatedly shipped one without
// the other:
//
//   1. **The catalog, once applied, genuinely reaches the four reads the app makes of it** —
//      §A and §B, driven over a REAL `openStore` on disk, not a stub.
//   2. **The shipped application constructs the things that fill it and calls those four reads** —
//      §D, read off the source of `main/index.ts` and `main/sync.ts`, because those files import
//      `electron` and cannot be imported here.
//
// A seam assertion alone blesses a decorative object; a behaviour suite alone blesses a subsystem
// nothing calls. Mutation matrix in the T-C6 commit message; the load-bearing rows are "delete the
// wiring from `index.ts`" (§D reds, §A–§C stay green) and "make the applied catalog a no-op"
// (§A–§C red, §D stays green).
//
// **`01-F53` is the FR this file exists to protect** (§B). The catalog supplies DISPLAY TEXT and
// the ONE price read that happens at line-add. If a price ever depended on a catalog read after a
// line exists, a menu sync would retro-price an open order.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@restos/domain";
import { type CatalogEntry, type DeviceStore, openStore } from "@restos/sync-client";
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
  org_id: "00000000-0000-7000-8000-0000000000a1",
  branch_id: "00000000-0000-7000-8000-0000000000a2",
  device_id: "00000000-0000-7000-8000-0000000000a3",
} as const;

/** A branch this device is NOT in — `01-F60`'s "resolves its own row" needs a foil. */
const OTHER_BRANCH = "00000000-0000-7000-8000-0000000000b2";

let dir: string;
let store: DeviceStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "restos-catalog-seam-"));
  store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const priced = (branch: string, channel: string, price_paisa: number) => [
  { branch_id: branch, channel, price_paisa },
];

/** A two-link `01-F21` chain: a category that names a station, an item that inherits it. */
const FIXTURE: CatalogEntry[] = [
  { kind: "category", id: "c-bbq", name: "BBQ", station: "grill", sort: 1 },
  {
    kind: "item",
    id: "i-seekh",
    name: "Seekh Kebab",
    parent_id: "c-bbq",
    sort: 2,
    prices: priced(IDENTITY.branch_id, "counter", 45_000),
  },
  {
    kind: "item",
    id: "i-boti",
    name: "Malai Boti",
    parent_id: "c-bbq",
    sort: 1,
    // Priced for ANOTHER branch on the same channel — `01-F60` must not resolve it here.
    prices: priced(OTHER_BRANCH, "counter", 55_000),
  },
  {
    kind: "item",
    id: "i-gone",
    name: "Discontinued Nihari",
    parent_id: "c-bbq",
    sort: 3,
    prices: priced(IDENTITY.branch_id, "counter", 90_000),
  },
];

const applyFixture = (version = 1): void => {
  const result = store.catalog.apply({
    kind: "snapshot",
    version,
    entries: FIXTURE,
    // `01-F55` — travels in `entries` so a reprint can still name it, tombstoned so it is
    // off the sellable grid.
    tombstones: [{ kind: "item", id: "i-gone" }],
  });
  expect(result, "the fixture itself must apply, or every assertion below is vacuous").toEqual({
    applied: true,
    version,
  });
};

// ── A. the applied catalog reaches all four reads ────────────────────────────────────────────

describe("T-C6 — an applied catalog reaches the four reads the app makes of it", () => {
  it("01-F54: a name the catalog holds is RESOLVED, not degraded to the identifier", () => {
    const resolve = catalogResolver(store);
    // Before: the degrade path, which is the only path any launch has ever taken.
    expect(resolve("i-seekh")).toBeNull();
    applyFixture();
    // After: a word. This is the whole difference the transport buys.
    expect(resolve("i-seekh")).toEqual({ name: "Seekh Kebab" });
  });

  it("01-F54: an id the catalog does NOT hold still degrades rather than throwing", () => {
    applyFixture();
    expect(catalogResolver(store)("i-never-synced")).toBeNull();
  });

  it("01-F55: a TOMBSTONED item still resolves for display, so a reprint renders", () => {
    applyFixture();
    expect(catalogResolver(store)("i-gone")).toEqual({ name: "Discontinued Nihari" });
  });

  it("01-F55: the SELLABLE grid excludes tombstones and is in display order", () => {
    expect(sellableMenu(store)()).toEqual([]);
    applyFixture();
    // `sort` 1 then 2; `i-gone` (sort 3) is tombstoned and must not be sellable even though
    // the assertion directly above proves it is still nameable. Those two sets differ, and
    // conflating them is what `01-F55` exists to prevent.
    expect(sellableMenu(store)()).toEqual([
      { id: "i-boti", name: "Malai Boti" },
      { id: "i-seekh", name: "Seekh Kebab" },
    ]);
  });

  it("01-F60: the price resolves for THIS device's branch and channel, and nowhere else", () => {
    applyFixture();
    const priceOf = priceResolver(store);
    expect(priceOf("i-seekh", "counter")).toBe(45_000);
    // A different channel on the same branch: `01-F60` has NO FALLBACK, so this is null and
    // never the counter price. Returning 45_000 here would let a channel sell at another
    // channel's rate.
    expect(priceOf("i-seekh", "foodpanda")).toBeNull();
    // Priced for OTHER_BRANCH only. `priceOf` takes no branch parameter precisely so a caller
    // cannot ask for another branch's number; this proves the store is not answering with it.
    expect(priceOf("i-boti", "counter")).toBeNull();
    // `01-F55`/`01-F60` — a tombstoned item is nameable and NOT sellable, so it has no price
    // even though the entry it came in on carried one.
    expect(priceOf("i-gone", "counter")).toBeNull();
  });

  it("03-F50: the station is INHERITED up the 01-F21 chain, and falls back rather than vanishing", () => {
    const stationOf = stationResolver(store);
    // Nothing synced: `DEFAULT_STATION`, because a line absent from every ticket is the one
    // kitchen failure paper cannot reveal.
    expect(stationOf("i-seekh")).toBe("kitchen");
    applyFixture();
    // The item carries no `station`; its category does. Inheritance is the mechanism.
    expect(stationOf("i-seekh")).toBe("grill");
    expect(stationOf("i-never-synced")).toBe("kitchen");
  });
});

// ── B. 01-F53 — money never depends on catalog sync ──────────────────────────────────────────

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
    businessDay: () => "2026-08-06",
    ...over,
  });

const lineCells = (target: DeviceStore, order_id: string) => {
  const row = target.openOrders().find((o) => o.order_id === order_id);
  if (row === undefined) throw new Error(`no open order ${order_id}`);
  return Object.values(
    JSON.parse(row.json_lines) as Record<string, { item_id: string; unit_price_paisa: number }>,
  );
};

describe("01-F53 — a line's price is captured at line-add and a later catalog cannot move it", () => {
  it("a menu edit landing AFTER the line does not retro-price the open order", () => {
    applyFixture();
    const gateway = gatewayOver(store);
    const order_id = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id, channel: "counter", order_type: "dine_in" },
      refs: [],
    });
    gateway.addLine({ order_id, item_id: "i-seekh", qty: 2 });
    expect(lineCells(store, order_id).map((c) => c.unit_price_paisa)).toEqual([45_000]);

    // The org doubles the price and it syncs. This is the exact event `14-F6` promises the
    // owner will NOT reach an open order.
    const repriced = FIXTURE.map((e) =>
      e.id === "i-seekh" ? { ...e, prices: priced(IDENTITY.branch_id, "counter", 90_000) } : e,
    );
    expect(store.catalog.apply({ kind: "snapshot", version: 2, entries: repriced }).applied).toBe(
      true,
    );

    // BOTH halves, and the second is what makes the first mean anything: the catalog really did
    // move (so this is not passing because nothing changed), and the captured paisa really did
    // not. A test with only the first assertion passes against a catalog that never applied.
    expect(priceResolver(store)("i-seekh", "counter")).toBe(90_000);
    expect(
      lineCells(store, order_id).map((c) => c.unit_price_paisa),
      "01-F53 — the price is snapshotted into the event, never re-read from the catalog",
    ).toEqual([45_000]);
  });

  it("01-F60: an item this branch has no price for is REFUSED rather than sold at zero", () => {
    applyFixture();
    const gateway = gatewayOver(store);
    const order_id = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id, channel: "counter", order_type: "dine_in" },
      refs: [],
    });
    // `i-boti` is priced for OTHER_BRANCH only. Free food is the one wrong answer that looks
    // like a working one.
    expect(() => gateway.addLine({ order_id, item_id: "i-boti", qty: 1 })).toThrow(/01-F60/);
    expect(lineCells(store, order_id)).toEqual([]);
  });

  it("01-F17: an EMPTY catalog does not stop the till — the order still opens", () => {
    // No `applyFixture`. `01-F17`/`01-F54`: a catalog that cannot sync costs a word, never a
    // sale — and the grid being empty is not an exception the till throws.
    const gateway = gatewayOver(store);
    const order_id = newId();
    expect(() =>
      gateway.append({
        type: "order.created",
        payload: { order_id, channel: "counter", order_type: "dine_in" },
        refs: [],
      }),
    ).not.toThrow();
    expect(gateway.menu()).toEqual([]);
    expect(store.openOrders().map((o) => o.order_id)).toEqual([order_id]);
  });
});

// ── C. the dev seed ──────────────────────────────────────────────────────────────────────────

describe("the dev menu seed — env-gated, version-0, and never over a real menu", () => {
  it("is OFF unless RESTOS_DEV_MENU is set — an empty grid is the honest default", () => {
    expect(seedDevMenu(store, {})).toBe(false);
    expect(seedDevMenu(store, { RESTOS_DEV_MENU: "" })).toBe(false);
    expect(sellableMenu(store)()).toEqual([]);
  });

  it("fills the grid when it IS set, and every seeded item is SELLABLE on this branch", () => {
    expect(seedDevMenu(store, { RESTOS_DEV_MENU: "1" })).toBe(true);
    const menu = sellableMenu(store)();
    expect(menu.length).toBeGreaterThan(0);
    const priceOf = priceResolver(store);
    // `01-F60` — an unpriced tile is greyed "no price set" and `addLine` refuses it. A seed
    // whose point is a till you can sell from must not ship one.
    for (const item of menu) {
      expect(
        priceOf(item.id, "counter"),
        `${item.id} must be priced on the counter`,
      ).not.toBeNull();
    }
    // And the names are real WORDS, not identifiers. A seed whose `name` were its `id` would
    // fill the grid while leaving `01-F54`'s degrade path indistinguishable from success —
    // which is the state on every launch today and the one this seed exists to end.
    for (const item of menu) {
      expect(item.name, `${item.id} must carry a display name, not its own id`).not.toBe(item.id);
      expect(item.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("03-F50: the seeded chain routes to real stations, not all to the fallback", () => {
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    const stationOf = stationResolver(store);
    const stations = new Set(sellableMenu(store)().map((m) => stationOf(m.id)));
    // More than one station, and at least one that is not `DEFAULT_STATION` — a seed where
    // every line lands on the fallback would leave `03-F50`'s inheritance walk unexercised on
    // every launch, which is the state this seed exists to end.
    expect(stations.size).toBeGreaterThan(1);
    expect([...stations].some((s) => s !== "kitchen")).toBe(true);
  });

  it("applies at VERSION 0, so a real gateway still fetches over the top of it", () => {
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    // THE PROPERTY THAT KEEPS THE SEED OUT OF THE PROTOCOL'S WAY. `cloud-session.ts` fetches
    // when `server_version > store.catalog.version()`. A seed that claimed version 1 would be
    // reported as parity by an org whose real catalog IS version 1, and this device would hold
    // the dev menu forever with `catalog_refusal` null and nothing to see.
    expect(store.catalog.version()).toBe(0);
    // Proof rather than assertion: the org's real version-1 snapshot lands over the seed.
    applyFixture(1);
    expect(sellableMenu(store)()).toEqual([
      { id: "i-boti", name: "Malai Boti" },
      { id: "i-seekh", name: "Seekh Kebab" },
    ]);
  });

  it("never overwrites a catalog the device already synced", () => {
    applyFixture(1);
    expect(seedDevMenu(store, { RESTOS_DEV_MENU: "1" })).toBe(false);
    // `applySnapshot` clears before it writes, so a seed that ran here would delete the org's
    // menu on every relaunch of a device that had already synced one.
    expect(sellableMenu(store)()).toEqual([
      { id: "i-boti", name: "Malai Boti" },
      { id: "i-seekh", name: "Seekh Kebab" },
    ]);
  });

  it("is keyed to the device's OWN branch, never a constant", () => {
    // `01-F60` resolves against `store.identity.branch_id`. A seed with a hardcoded branch id
    // would price nothing on any device but the one it was written for — and the failure is
    // silent: a full grid where every tile reads "no price set".
    const branches = new Set(
      devMenuSnapshot(OTHER_BRANCH)
        .flatMap((e) => e.prices ?? [])
        .map((p) => p.branch_id),
    );
    expect([...branches]).toEqual([OTHER_BRANCH]);
  });

  it("is idempotent — a relaunch of an unsynced device reseeds identically", () => {
    seedDevMenu(store, { RESTOS_DEV_MENU: "1" });
    const first = sellableMenu(store)();
    expect(seedDevMenu(store, { RESTOS_DEV_MENU: "1" })).toBe(true);
    expect(sellableMenu(store)()).toEqual(first);
  });
});

// ── D. THE SEAM — the production caller ──────────────────────────────────────────────────────
//
// The house pattern (`kot-printing.test.ts` §G). These read SOURCE because `main/index.ts` and
// `main/sync.ts` import `electron`, which cannot be loaded here — and because what is being
// asserted is a WIRING fact, not a behaviour: does the shipped application reach the subsystem
// at all. Every measured instance of this wave's defect would have been caught by an assertion
// of exactly this shape, and by nothing else.

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("the wave's recurring defect — the catalog subsystem has a PRODUCTION caller", () => {
  const mainSrc = readSrc("index.ts");
  const syncSrc = readSrc("sync.ts");

  it("is actually reading the two files it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string
    // reports clean. Anchored on lines that have nothing to do with the catalog, so this check
    // cannot be satisfied by the very code it is guarding.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(4_000);
    expect(syncSrc).toContain("export const createUplink");
    expect(syncSrc.length).toBeGreaterThan(1_000);
  });

  it("main/index.ts CONSTRUCTS the uplink — without it no catalog_request ever leaves", () => {
    // `createCatalogFetch` and the whole `01-F52`..`01-F56` device side had ZERO production
    // callers before the uplink existed. This is the assertion that would have caught it.
    expect(mainSrc).toMatch(/createUplink\s*\(/);
    // And over the real store and the real environment route, not a placeholder: an uplink
    // built with a hardcoded `undefined` url is `offline()` forever and is decorative.
    expect(mainSrc).toContain("RESTOS_CLOUD_URL");
    expect(mainSrc).toContain("RESTOS_DEVICE_TOKEN");
  });

  it("main/sync.ts builds a REAL cloud session over a REAL transport, and hands it the store", () => {
    expect(syncSrc).toMatch(/createCloudSession\s*\(/);
    expect(syncSrc).toMatch(/createWsCloudTransport\s*\(/);
    // THE ARGUMENT THAT DOES THE WORK. `cloud-session.ts` applies every catalog page into
    // `store.catalog`; a session constructed without the store would speak the whole protocol
    // and land the menu nowhere — the same defect one argument along that K-7 shipped with the
    // spooler's missing `store`.
    expect(syncSrc, "01-F52 — a cloud session with no store applies the catalog nowhere").toMatch(
      /createCloudSession\s*\(\s*\{[\s\S]{0,400}?\bstore\s*:/,
    );
    expect(syncSrc).toMatch(/\.start\s*\(\s*\)/);
  });

  it("main/index.ts wires all four catalog reads through main/catalog.ts", () => {
    // Not `store.catalog.*` inline: those closures are unreachable from any test while they
    // live in a file that imports `electron`, which is how a catalog read gets shipped broken
    // with every gate green.
    for (const symbol of ["catalogResolver", "sellableMenu", "priceResolver", "stationResolver"]) {
      expect(mainSrc, `${symbol} must be wired in main/index.ts`).toMatch(
        new RegExp(`${symbol}\\s*\\(\\s*store\\s*\\)`),
      );
    }
    expect(mainSrc).toMatch(/from\s+"\.\/catalog"/);
  });

  it("main/index.ts calls the dev seed, so a launch has something to sell", () => {
    expect(mainSrc).toMatch(/seedDevMenu\s*\(\s*store\s*\)/);
  });

  it("the uplink's own catalog reads are not silently dropped on the floor", () => {
    // `01-F56`/`DEC-SYNC-011`: the session tracks a catalog refusal so a stuck catalog is
    // observable. `sync.ts` surfaces it; nothing consumes it yet, which is recorded as a
    // FINDING in the T-C6 commit rather than asserted as satisfied here — see the DEFERRED
    // block at the foot of this file.
    expect(syncSrc).toContain("catalog_refusal");
  });
});

// ── E. two-plane hygiene ─────────────────────────────────────────────────────────────────────

describe("01-F52 — the catalog is reference data and never an input to a fold", () => {
  it("the catalog module reads REFERENCE data only, never the ledger or a projection", () => {
    // `01-F52` on the code path this task introduced. `catalog.ts` may reach `store.catalog`
    // and nothing else: a display read that also touched `openOrders` or `append` would put
    // fold state and catalog state on one side of the same function, which is where a
    // projected value starts depending on catalog sync (`01-F34`, law 1).
    const catalogSrc = readSrc("catalog.ts");
    expect(catalogSrc).toContain("store.catalog");
    expect(catalogSrc).not.toMatch(/store\.(append|openOrders|kitchenQueue|availability|shifts)\b/);
  });

  it("main/index.ts holds NO inline catalog read — the seam stays where a test can reach it", () => {
    // THE REGRESSION THIS FILE EXISTS TO PREVENT, and the reason the four closures were moved
    // out of `index.ts` at all. Anything reading `store.catalog` from a file that imports
    // `electron` is unreachable from every suite in this repo — which is exactly how a broken
    // catalog read ships with all gates green. Re-inlining one must red something.
    expect(
      readSrc("index.ts"),
      "01-F52/T-C6 — a catalog read inlined into index.ts is a read no test can drive",
    ).not.toMatch(/store\.catalog\b/);
  });

  it("a catalog change does not disturb the fold's projections", () => {
    applyFixture();
    const gateway = gatewayOver(store);
    const order_id = newId();
    gateway.append({
      type: "order.created",
      payload: { order_id, channel: "counter", order_type: "dine_in" },
      refs: [],
    });
    gateway.addLine({ order_id, item_id: "i-seekh", qty: 1 });
    const before = store.openOrders();
    // Rename it and delete the other one.
    expect(
      store.catalog.apply({
        kind: "delta",
        from_version: 1,
        version: 2,
        upserts: [{ ...FIXTURE[1], name: "Seekh Kabab" } as CatalogEntry],
        deletes: [{ kind: "item", id: "i-boti" }],
      }).applied,
    ).toBe(true);
    expect(store.openOrders()).toEqual(before);
    // Display follows the catalog; the ledger does not.
    expect(gateway.openOrders()[0]?.lines[0]?.name).toBe("Seekh Kabab");
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns it ─────────────────────────────
//
// * **No end-to-end socket.** The frames, the gateway's serve path and a real reconnect are
//   exercised by `services/sync-gateway/src/__acceptance__/journey-catalog.test.ts` over a real
//   `createCloudSession`. What is NOT covered anywhere is `main/sync.ts` itself against a live
//   gateway — §D asserts its construction, not its behaviour, and that gap is real.
// * **`catalog_refusal` reaches no human.** `Uplink.catalogRefusal` exists and has no consumer:
//   `DeviceState` (`shared/ipc.ts`) has a `blocked` cursor field and no catalog-health field, so
//   `DEC-SYNC-011`'s "observable" holds at the API and nowhere on the counter. Closing it needs a
//   `DeviceState` field, a renderer surface and an FR that names one — none of which exist. Owed,
//   and named rather than left to look intentional.
// * **The seed is not a menu.** `RESTOS_DEV_MENU` exists because the back office does not. Nothing
//   here is evidence about a published catalog, `14-F28`'s day-end hold, or price history.
