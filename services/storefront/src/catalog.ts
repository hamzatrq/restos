import { CatalogEntryWire } from "@restos/sync-protocol";
import { z } from "zod";
import type { OriginIdentity } from "./identity.js";
import { STOREFRONT_CHANNEL } from "./origin.js";

/**
 * `06-F33` — **where a storefront line's price comes from, and why it is not the customer.**
 *
 * The first implementation of `06-F30` declared `unit_price_paisa` as a field of the public,
 * unauthenticated request body and wrote it into `order.line_added` verbatim; nothing in the
 * service read a catalog at all. Reproduced end to end (August 2026): a Rs 450 burger reached a
 * cashier's `02-F9` inbox at **1 paisa**, `0` was accepted too, and her only inbox action is
 * Accept — which `01-F1` makes permanent. `06-F6` binds the written price to the catalog and
 * `01-F60` keys it per `(branch, channel)` with no fallback, so the resolution belongs here.
 *
 * **This is the SAME read a till does, one plane over.** `apps/pos-electron`'s `addLine` calls
 * `store.catalog.priceOf(item, channel)`, which resolves THIS device's branch and returns `null`
 * rather than `0` when the cell is absent — *"zero is a sellable price and unpriced is not"*. The
 * port below is that shape bound to the origin's own `(org, branch)`, for the same stated reason:
 * a resolver that takes a branch parameter is a resolver a caller can point at another branch.
 */

/** One order prices against ONE published version — see `priceLines`. */
export type PricedCart = {
  readonly version: number;
  /** Integer paisa per `item_id`. An item with no cell is ABSENT, never `0` (`01-F60`). */
  readonly paisa: ReadonlyMap<string, number>;
};

export type StorefrontCatalog = {
  /**
   * Prices for this origin's `(branch, storefront)` cell, resolved in ONE read.
   *
   * Batched rather than per-item on purpose: a per-item resolver would price a two-line cart
   * against two catalog versions if a publish landed between them, and `01-F1` freezes whichever
   * halves survived. The version travels back so a caller can log which menu it priced against —
   * it is deliberately NOT written into the payload, because `01 §4`'s payload set is closed and
   * adding an artifact version to it is a doc-01 act (`06 §9` question 3).
   */
  priceLines: (item_ids: readonly string[]) => Promise<PricedCart>;
};

/**
 * The catalog could not be read at all — a different answer from *"this item has no price"*.
 *
 * `28-F3`'s corollary for the entitlement resolver applies to every gate-shaped read: collapsing
 * "unreadable" into "absent" is wrong in the direction that stops service, and here it would be
 * wrong in the direction that **writes a wrong price**: an implementation that treated a gateway
 * timeout as "no cell" and then defaulted would sell at `0`.
 */
export class CatalogUnreadableError extends Error {
  constructor(reason: string) {
    super(
      `06-F33: the published catalog could not be read, so no storefront line can be priced ` +
        `(01-F60 admits no fallback and a guessed price is permanent under 01-F1): ${reason}`,
    );
    this.name = "CatalogUnreadableError";
  }
}

/** Where the gateway is and the service credential that proves we may ask it. */
export type GatewayLink = {
  /** e.g. `http://sync-gateway:8080`. Trailing slashes tolerated. */
  readonly base_url: string;
  /** Presented as `Authorization: Bearer` — the gateway's `/internal` credential. */
  readonly token: string;
};

const PublishedResponse = z.object({
  version: z.number().int().nonnegative(),
  entries: z.array(z.unknown()),
});

/**
 * `01-F55` — a tombstoned entry still RESOLVES (a reprint must render a deleted item's name) and
 * must never be SOLD. The till's `priceOf` refuses a deleted row explicitly; so does this.
 */
const sellablePrice = (entry: unknown, branch_id: string): { id: string; paisa: number } | null => {
  const parsed = CatalogEntryWire.safeParse(entry);
  if (!parsed.success) return null;
  const row = parsed.data;
  if (row.kind !== "item" || row.deleted === true) return null;
  const cell = row.prices?.find(
    (p) => p.branch_id === branch_id && p.channel === STOREFRONT_CHANNEL,
  );
  return cell === undefined ? null : { id: row.id, paisa: cell.price_paisa };
};

/**
 * The shipping implementation: the published catalog artifact, read from the gateway over the
 * `/internal` hop `28-F5` (b′) sanctions — *"a service credential is not a subject"*, and
 * `services/api` already reaches these routes with `org_id` as a query parameter for the same
 * reason. `18 §4`: the gateway is the writer of `kernel.catalog_*`; this service holds no
 * database handle and never will.
 *
 * **No cache, deliberately.** `06-F4` gives a publish 60 s to reach the menu; a per-placement read
 * satisfies that trivially and has no invalidation to get wrong. Order placement is not a hot path
 * — the hot path is the menu render, which is `apps/storefront`'s problem and is unbuilt.
 */
export const createGatewayCatalog = (
  link: GatewayLink,
  identity: OriginIdentity,
): StorefrontCatalog => ({
  priceLines: async (item_ids) => {
    const url = new URL(`${link.base_url.replace(/\/+$/, "")}/internal/catalog/published`);
    url.searchParams.set("org_id", identity.org_id);
    let response: Response;
    try {
      response = await fetch(url, { headers: { authorization: `Bearer ${link.token}` } });
    } catch (error: unknown) {
      throw new CatalogUnreadableError(`${url.origin} unreachable: ${String(error)}`);
    }
    if (!response.ok) {
      throw new CatalogUnreadableError(`gateway answered ${response.status}`);
    }
    const parsed = PublishedResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new CatalogUnreadableError(`gateway answered a body this service cannot read`);
    }
    const wanted = new Set(item_ids);
    const paisa = new Map<string, number>();
    for (const entry of parsed.data.entries) {
      const priced = sellablePrice(entry, identity.branch_id);
      if (priced !== null && wanted.has(priced.id)) paisa.set(priced.id, priced.paisa);
    }
    return { version: parsed.data.version, paisa };
  },
});
