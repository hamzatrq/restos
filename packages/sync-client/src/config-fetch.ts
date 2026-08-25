import type { ConfigEntry } from "@restos/domain/config";
import type { ConfigUpdate } from "./config.js";

/**
 * `01-F87` — the device half of the `config` transport: turning `reference_response` frames for
 * `resource: "config"` into the `ConfigUpdate` `config.ts` already understands.
 *
 * `roster-fetch.ts`'s shape verbatim, and that is `01-F75`'s own point rather than a convenience:
 * the FR puts every artifact on ONE replication path, so a fourth accumulator with a fourth idea
 * of atomicity would be a fourth interpretation of it. A pure accumulator with no socket and no
 * store in it — **a snapshot must apply ATOMICALLY** (`01-F56`), and a device that applied each
 * page as it arrived would hold half a configuration in the window between them.
 *
 * ⚠ **PAGING IS PRESERVED EVEN THOUGH THIS ARTIFACT WILL NOT PAGE, AND THAT IS DELIBERATE.**
 * `01-F87` measures layer 2 as *"a handful of scalars and two small tables"*, so in practice every
 * fetch is one page. The accumulator is still written for the paged case because the FRAME is
 * paged for every resource and `01-F75`'s rule is that the vocabulary reads the same whatever the
 * artifact is: an arm that assumed one page would be a per-resource carve-out of the kind the FR
 * closed its resource set to prevent, and it would fail silently the first time a module doc adds
 * a key set big enough to split.
 *
 * A DELTA IS ACCUMULATED TOO, for `catalog-fetch.ts`'s recorded reason: a prefix of a delta is
 * only consistent if the device also records how far it got, and it does not — it would commit the
 * delta's FINAL version while holding a prefix of its rows.
 *
 * ## What this file does NOT validate, and where that check lives instead
 *
 * Nothing here reads a `value`. `01-F87` (b)'s split — **an unknown key is ignored, a malformed
 * known key refuses the whole artifact** — is `@restos/domain/config`'s `parseConfigArtifact`, and
 * `config.ts` runs it over the MERGED result at apply. Validating here instead would judge a
 * delta's incoming rows without the base they land on, and would put the refusal before the
 * version comparison that decides whether the frame was worth reading at all.
 */

/** One row as the wire carries it (`ConfigEntryWire`). */
export type WireConfigEntry = {
  key: string;
  value?: unknown;
  deleted?: boolean | undefined;
};

/**
 * The response body this accumulator reads.
 *
 * Every optional spells `| undefined` for `WireCatalogResponse`'s recorded reason: the repo runs
 * `exactOptionalPropertyTypes`, so a parsed wire message types these as `T | undefined` and would
 * not be assignable to a plain `base_version?: number`. Spelling it out is what lets the frame the
 * protocol layer actually produces be passed straight in, **rather than reshaped at the seam — and
 * a reshape is where a field quietly goes missing** (this package's `catalog-fetch.ts` finding: a
 * `toEntry` that dropped `prices` and `station` failed 0 of 579 tests and made every synced tile
 * unsellable).
 */
export type WireConfigResponse = {
  form: "snapshot" | "delta";
  version: number;
  base_version?: number | undefined;
  entries: readonly WireConfigEntry[];
  complete: boolean;
  next_from: number;
};

/**
 * The whole row, copied — `key`, `value` and `deleted`.
 *
 * ⚠ **`value` IS COPIED AS `unknown` AND MUST NEVER BE RESHAPED HERE.** `catalog-fetch.ts`'s
 * measured defect is the reason this function is three lines and not more: any normalisation at
 * this seam (dropping `undefined`, coercing a number, collapsing an empty object) would silently
 * change a value the writer validated and the device is about to validate again, and the two
 * validations would then disagree about bytes neither of them wrote.
 *
 * `deleted` is copied rather than collapsed for the same reason `01-F75` makes it a field: it is a
 * RESET, which is a different fact from an absent key in a delta (unchanged) and must survive.
 */
const toEntry = (w: WireConfigEntry): ConfigEntry => ({
  key: w.key,
  ...(w.value === undefined ? {} : { value: w.value }),
  ...(w.deleted === undefined ? {} : { deleted: w.deleted }),
});

/**
 * What the caller should do next — `DeviceRosterFetchStep`'s shape, for its recorded reason: the
 * `done: false` arm carries no `update` key at all, so there is nothing a caller could apply by
 * mistake.
 */
export type ConfigFetchStep =
  | { done: false; fetchMore: { have_version: number; from: number; at_version: number } }
  | { done: true; update: ConfigUpdate }
  | { done: true; update: null };

/**
 * Accumulates `reference_response` pages for ONE config fetch. Create it when a fetch starts;
 * discard it when the fetch ends or the connection drops — a half-accumulated artifact from a dead
 * session must never merge with pages from the next one, which is why this holds no store
 * reference and cannot apply anything itself.
 */
export const createConfigFetch = (have_version: number) => {
  let pending: WireConfigEntry[] = [];
  /**
   * What page 1 said this fetch is. Every later page must agree, or the pages do not describe one
   * configuration and combining them fabricates a third that never existed — the catalog's
   * measured defect, on the artifact that decides what tax an org charges.
   */
  let shape: { form: "snapshot" | "delta"; version: number; base_version?: number } | null = null;

  return {
    /** Feed one frame. Returns whether to ask for more, and what to apply when finished. */
    accept(response: WireConfigResponse): ConfigFetchStep {
      if (shape === null) {
        shape = {
          form: response.form,
          version: response.version,
          ...(response.base_version === undefined ? {} : { base_version: response.base_version }),
        };
      } else if (
        shape.form !== response.form ||
        shape.version !== response.version ||
        shape.base_version !== response.base_version
      ) {
        pending = [];
        shape = null;
        return { done: true, update: null };
      }

      pending = [...pending, ...response.entries];
      if (!response.complete) {
        return {
          done: false,
          // `at_version` pins the continuation to the version page 1 was serving, which is what
          // stops a publish between pages splicing two configurations into one version number.
          fetchMore: { have_version, from: response.next_from, at_version: response.version },
        };
      }
      shape = null;

      const entries = pending;
      pending = [];

      if (response.form === "snapshot") {
        return {
          done: true,
          update: { kind: "snapshot", version: response.version, entries: entries.map(toEntry) },
        };
      }

      // A delta with no base is not applicable — the store would have to guess what it applies to,
      // and guessing is how one device's rates diverge from every other's. Refuse by returning
      // nothing; the caller's next reconnect reconciles through `hello_ack`.
      if (response.base_version === undefined) return { done: true, update: null };

      // An empty delta at the version we already hold is the server saying "you are current".
      // Deliberately not an error — a device that reported a fault every time it was up to date
      // would send a manager to look for a problem that does not exist (`00 §5.7`).
      if (entries.length === 0 && response.version === response.base_version) {
        return { done: true, update: null };
      }

      return {
        done: true,
        update: {
          kind: "delta",
          from_version: response.base_version,
          version: response.version,
          // ONE list, not upserts-plus-deletes. `01-F75`'s no-removals-list rule is carried by the
          // ROW here — `deleted: true` IS the reset — so splitting the list at this seam would
          // rebuild the removals list the FR refuses, one layer down and under another name.
          entries: entries.map(toEntry),
        },
      };
    },
  };
};

export type ConfigFetch = ReturnType<typeof createConfigFetch>;
