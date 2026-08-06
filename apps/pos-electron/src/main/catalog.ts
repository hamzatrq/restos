import type { CatalogEntry, DeviceStore } from "@restos/sync-client";
import type { CatalogList, CatalogResolver, PriceResolver } from "./gateway";

/**
 * **T-C6 — the connector.** Where the device catalog (`01-F52`..`01-F56`) meets the four things
 * this app asks of it, plus the dev seed that makes the grid non-empty before a back office
 * exists.
 *
 * These four closures lived inline in `main/index.ts` until this file existed, and moving them
 * is not tidying: `index.ts` imports `electron`, so nothing that lives there can be driven by a
 * test. That made the catalog reads unassertable in exactly the way AGENTS.md's named defect
 * describes — a subsystem (`packages/sync-client`'s catalog store, its own suite green) with a
 * seam nothing could point at. `__acceptance__/catalog-seam.test.ts` drives THESE, over a real
 * store, and asserts separately that `index.ts` still calls them.
 *
 * **`01-F53` governs the whole file and nothing here may break it.** The catalog supplies
 * DISPLAY TEXT, and it supplies the number `addLine` reads ONCE at line-add. After a line
 * exists, no price is ever re-read: `gateway.addLine` captures `unit_price_paisa` into the
 * event, and a catalog that syncs afterwards — including this seed landing — cannot retro-price
 * an open order.
 */

/** `01-F54` — a miss degrades to the identifier rather than blocking. Tombstones resolve. */
export const catalogResolver =
  (store: DeviceStore): CatalogResolver =>
  (item_id) => {
    const entry = store.catalog.lookup("item", item_id);
    return entry ? { name: entry.name } : null;
  };

/**
 * `01-F55` — the SELLABLE set, which excludes tombstones. `catalogResolver` above still resolves
 * them, because a reprint of an older order must render a deleted item's name.
 */
export const sellableMenu =
  (store: DeviceStore): CatalogList =>
  () =>
    store.catalog.list("item").map((e) => ({ id: e.id, name: e.name }));

/**
 * `01-F60` — the device resolves its OWN branch's row. `priceOf` takes no branch parameter
 * precisely so this call cannot ask for another branch's price.
 */
export const priceResolver =
  (store: DeviceStore): PriceResolver =>
  (item_id, channel) =>
    store.catalog.priceOf("item", item_id, channel);

/**
 * `03-F50` — the station that cooks the line, resolved up the `01-F21` chain by the catalog
 * itself. An unrouted line lands on `DEFAULT_STATION` rather than vanishing off every ticket.
 */
export const stationResolver =
  (store: DeviceStore) =>
  (item_id: string): string =>
    store.catalog.stationOf("item", item_id);

// ── the dev seed ─────────────────────────────────────────────────────────────────────────────

/**
 * **A DEV SEED MENU, exactly like `DEV_STAFF` in `index.ts` — and it exists for the same
 * reason.** The transport is real and connected (`sync.ts` → `createCloudSession` → the
 * `catalog_request`/`catalog_response` pair), but the thing that PUBLISHES a catalog is the back
 * office, which has not landed (`plans/wave-1/backoffice-catalog.md`). So a `pnpm start` with no
 * gateway to talk to has an empty grid and cannot sell anything, and `01-F54`'s
 * degrade-to-identifier path is the only path any launch has ever exercised.
 *
 * **Off by default**, on the same environment route `RESTOS_DEV_PIN` and `RESTOS_CLOUD_URL`
 * already take:
 *
 *     RESTOS_DEV_MENU=1 RESTOS_DEV_PIN=<digits> pnpm start
 *
 * An empty grid on a device no menu has reached is the honest state (`00 §5.7`), which is why
 * this is opt-in rather than the default — and it is what production looks like until the back
 * office publishes.
 *
 * **Delete this the moment the back office lands**, and let the org's menu sync.
 */
const DEV_MENU_ENV = "RESTOS_DEV_MENU";

/**
 * `01-F21`'s chain, two links of it: Category → MenuItem. Categories carry `station` and the
 * items inherit (`03-F50`), so the seed exercises the inheritance walk rather than stamping a
 * station on every row — which is also how a real menu is built.
 *
 * Prices are attached per item at seed time, keyed to THIS device's branch on the `counter`
 * channel (`01-F60`, `02-F42`), because that is the only pair a counter order can resolve
 * (`Counter.tsx`'s `COUNTER_CHANNEL`). Every item is priced deliberately: an unpriced one is
 * greyed with "no price set" and cannot be sold, and a seed whose point is a working till must
 * not ship a grid half of which refuses.
 */
const DEV_CATEGORIES: readonly { id: string; name: string; station: string; sort: number }[] = [
  { id: "cat-karahi", name: "Karahi & Handi", station: "kitchen", sort: 1 },
  { id: "cat-bbq", name: "BBQ", station: "grill", sort: 2 },
  { id: "cat-breads", name: "Breads", station: "tandoor", sort: 3 },
];

/** `price_paisa` — integer paisa (`00 §6`, commandment 3). Rs 1,450 is 145_000. */
const DEV_ITEMS: readonly {
  id: string;
  name: string;
  kitchen_name?: string;
  parent_id: string;
  price_paisa: number;
  sort: number;
}[] = [
  {
    id: "i-karahi-chicken",
    name: "Chicken Karahi",
    parent_id: "cat-karahi",
    price_paisa: 145_000,
    sort: 1,
  },
  {
    id: "i-karahi-mutton",
    name: "Mutton Karahi",
    parent_id: "cat-karahi",
    price_paisa: 220_000,
    sort: 2,
  },
  {
    id: "i-handi-white",
    name: "White Handi",
    kitchen_name: "W HANDI",
    parent_id: "cat-karahi",
    price_paisa: 160_000,
    sort: 3,
  },
  { id: "i-seekh-kebab", name: "Seekh Kebab", parent_id: "cat-bbq", price_paisa: 45_000, sort: 1 },
  {
    id: "i-chapli-kebab",
    name: "Chapli Kebab",
    parent_id: "cat-bbq",
    price_paisa: 40_000,
    sort: 2,
  },
  { id: "i-malai-boti", name: "Malai Boti", parent_id: "cat-bbq", price_paisa: 55_000, sort: 3 },
  { id: "i-naan", name: "Naan", parent_id: "cat-breads", price_paisa: 3_000, sort: 1 },
  {
    id: "i-roghni-naan",
    name: "Roghni Naan",
    parent_id: "cat-breads",
    price_paisa: 6_000,
    sort: 2,
  },
];

/**
 * The seed as a `01-F56` snapshot **at version 0**, which is the property that keeps it from
 * fighting the transport.
 *
 * `cloud-session.ts` fetches when `serverVersion > store.catalog.version()`. A seed applied at
 * version 1 would tell the gateway "I hold version 1" — so an org whose real published catalog
 * IS version 1 would be reported as parity, and this device would keep the dev menu forever with
 * `catalog_refusal` null and nothing to see. Applying at 0 leaves `version()` at 0, so the
 * device still asks for everything on its first `hello_ack`, and the real snapshot replaces the
 * seed wholesale (`applySnapshot` clears first). The seed is invisible to the protocol.
 */
export const devMenuSnapshot = (branch_id: string): CatalogEntry[] => [
  ...DEV_CATEGORIES.map((c) => ({
    kind: "category" as const,
    id: c.id,
    name: c.name,
    station: c.station,
    sort: c.sort,
  })),
  ...DEV_ITEMS.map((i) => ({
    kind: "item" as const,
    id: i.id,
    name: i.name,
    ...(i.kitchen_name === undefined ? {} : { kitchen_name: i.kitchen_name }),
    parent_id: i.parent_id,
    sort: i.sort,
    prices: [{ branch_id, channel: "counter", price_paisa: i.price_paisa }],
  })),
];

/**
 * Apply the seed, or don't. Returns whether it was applied, so the caller has something to say.
 *
 * **Two refusals, and both matter.** Unset `RESTOS_DEV_MENU` ⇒ nothing, per above. A device that
 * already holds a catalog (`version() > 0`) ⇒ nothing either, because that catalog came off the
 * wire and a dev seed must never overwrite the org's real menu — which is exactly what would
 * happen on the next relaunch, since `applySnapshot` clears before it writes.
 */
export const seedDevMenu = (
  store: DeviceStore,
  env: Record<string, string | undefined> = process.env,
): boolean => {
  const flag = env[DEV_MENU_ENV];
  if (flag === undefined || flag === "") return false;
  if (store.catalog.version() > 0) return false;
  const result = store.catalog.apply({
    kind: "snapshot",
    version: 0,
    entries: devMenuSnapshot(store.identity.branch_id),
  });
  return result.applied;
};
