import type { CatalogEntry, CatalogKind, CatalogRef, CatalogUpdate } from "./catalog.js";

/**
 * T-C4 — the device half of the catalog transport: turning `catalog_response` frames into the
 * `CatalogUpdate` the store already understands.
 *
 * Written as a pure accumulator with no socket and no store in it, because the one property
 * that matters here is hard to test through a session and trivial to test directly:
 * **a snapshot must apply ATOMICALLY.** A large org's catalog exceeds one frame, and a device
 * that applied each page as it arrived would hold half a menu in the window between them — on
 * a till, mid-service, with the other half arriving only if the link survives. `01-F56`'s
 * recovery path is exactly when the link is least trustworthy, so pages accumulate here and
 * commit once, on `complete`.
 *
 * A DELTA does not need the same treatment and deliberately does not get it: its pages are
 * ordered by publication version, so a partial delta is a smaller but still-consistent step
 * forward. Holding it back would only widen the window in which the device is stale.
 */

/**
 * One entry as the wire carries it — `deleted` is a marked entry, never an absence.
 *
 * Every optional spells `| undefined` for the `exactOptionalPropertyTypes` reason given on
 * `WireCatalogResponse` below: this type must accept the frame the protocol layer parses,
 * unmodified.
 */
export type WireEntry = {
  kind: string;
  id: string;
  name: string;
  kitchen_name?: string | null | undefined;
  parent_id?: string | null | undefined;
  sort?: number | undefined;
  deleted?: boolean | undefined;
};

export type WireCatalogResponse = {
  form: "snapshot" | "delta";
  version: number;
  /**
   * `| undefined` explicitly, not merely optional. The repo runs `exactOptionalPropertyTypes`,
   * under which a parsed wire message types this as `number | undefined` and would not be
   * assignable to a plain `base_version?: number`. Spelling it out is what lets the frame the
   * protocol layer actually produces be passed straight in, rather than reshaped at the seam —
   * and a reshape is where a field quietly goes missing.
   */
  base_version?: number | undefined;
  entries: readonly WireEntry[];
  complete: boolean;
  next_from: number;
};

const toEntry = (w: WireEntry): CatalogEntry => ({
  kind: w.kind as CatalogKind,
  id: w.id,
  name: w.name,
  ...(w.kitchen_name === undefined || w.kitchen_name === null
    ? {}
    : { kitchen_name: w.kitchen_name }),
  ...(w.parent_id === undefined || w.parent_id === null ? {} : { parent_id: w.parent_id }),
  ...(w.sort === undefined ? {} : { sort: w.sort }),
});

const toRef = (w: WireEntry): CatalogRef => ({ kind: w.kind as CatalogKind, id: w.id });

/**
 * What the caller should do next. `fetchMore` carries the cursor to send in the next
 * `catalog_request`; `update` is present exactly when there is something to apply.
 */
export type FetchStep =
  | { done: false; fetchMore: { have_version: number; from: number } }
  | { done: true; update: CatalogUpdate }
  | { done: true; update: null };

/**
 * Accumulates `catalog_response` pages for ONE fetch. Create it when a fetch starts; discard it
 * when the fetch ends or the connection drops — a half-accumulated snapshot from a dead session
 * must never merge with pages from the next one, which is why this holds no store reference and
 * cannot apply anything itself.
 */
export const createCatalogFetch = (have_version: number) => {
  let pending: WireEntry[] = [];

  return {
    /** Feed one frame. Returns whether to ask for more, and what to apply when finished. */
    accept(response: WireCatalogResponse): FetchStep {
      pending = [...pending, ...response.entries];
      if (!response.complete) {
        return { done: false, fetchMore: { have_version, from: response.next_from } };
      }

      const entries = pending;
      pending = [];

      if (response.form === "snapshot") {
        // `01-F55`: deleted entries TRAVEL in `entries` and are NAMED in `tombstones`. Both,
        // not either. A device that resynced from scratch has never held a deleted item, so it
        // needs the row to render a reprint of an older order; naming it as a tombstone is what
        // keeps it off the sellable grid. Dropping the row instead — which is what "a snapshot
        // is the live set" would mean — is the defect the oracle round found (A5), where every
        // recovery silently destroyed the device's ability to name a deleted dish.
        const tombstones = entries.filter((e) => e.deleted === true).map(toRef);
        return {
          done: true,
          update: {
            kind: "snapshot",
            version: response.version,
            entries: entries.map(toEntry),
            ...(tombstones.length === 0 ? {} : { tombstones }),
          },
        };
      }

      // A delta with no base is not applicable — the store would have to guess what it applies
      // to, and guessing is how one device's menu diverges from every other's. Refuse by
      // returning nothing; the caller's next reconnect reconciles through `hello_ack`.
      if (response.base_version === undefined) return { done: true, update: null };

      // An empty delta at the version we already hold is the server saying "you are current".
      // Nothing to apply, and deliberately not an error.
      if (entries.length === 0 && response.version === response.base_version) {
        return { done: true, update: null };
      }

      return {
        done: true,
        update: {
          kind: "delta",
          from_version: response.base_version,
          version: response.version,
          upserts: entries.filter((e) => e.deleted !== true).map(toEntry),
          deletes: entries.filter((e) => e.deleted === true).map(toRef),
        },
      };
    },
  };
};

export type CatalogFetch = ReturnType<typeof createCatalogFetch>;
