import type { StaffMember, StaffStatus, StaffUpdate } from "./staff.js";

/**
 * Step 7 of `plans/saas-pivot/staff-over-the-wire.md` — the device half of the ROSTER transport:
 * turning `reference_response` frames for `resource: "staff"` into the `StaffUpdate` the registry
 * already understands (`01-F75`, `01-F76`).
 *
 * `catalog-fetch.ts`'s shape verbatim, with its own `toMember`, because `01-F21`/`01-F75` put
 * both artifacts on ONE replication path and a second accumulator is a second interpretation of
 * atomicity. A pure accumulator with no socket and no store in it, for the property that is hard
 * to test through a session and trivial to test directly: **a snapshot must apply ATOMICALLY.** A
 * branch's roster can exceed one frame, and a device that applied each page as it arrived would
 * hold half a roster in the window between them — on a till, mid-service, with the other half
 * arriving only if the link survives. Half a roster is half a branch that cannot sign in.
 *
 * A DELTA IS ACCUMULATED TOO, for `catalog-fetch.ts`'s recorded reason: a prefix of a delta is
 * only consistent if the device also records how far it got, and it does not — it would commit
 * the delta's FINAL version while holding a prefix of its rows.
 *
 * ⚠ **THIS FILE IS THE SEAM `catalog-fetch.ts`'s `toEntry` DROPPED `prices` AND `station` AT.**
 * The gateway served them, `CatalogEntryWire` carried them, the device store declared and read
 * them, and the one function between did not copy them — failing **0 of 579** tests. The roster's
 * version of that defect is a cashier's PIN silently ceasing to verify on a device reporting a
 * healthy version number, so every field the wire carries is copied here and the credential leg
 * is asserted by VERIFYING a real PIN through the whole hop.
 */

/**
 * One roster row as the wire carries it (`StaffEntryWire`).
 *
 * Every optional spells `| undefined` for the `exactOptionalPropertyTypes` reason
 * `WireCatalogResponse` already records: this type must accept the frame the protocol layer
 * parses, **unmodified**, because a reshape at the seam is where a field quietly goes missing.
 */
export type WireStaffEntry = {
  user_id: string;
  display_name: string;
  grid_ordinal: number;
  status: StaffStatus;
  assignments: readonly { role: string; branch_id: string | null }[];
  /** `11-F21` — carried on an `active` entry only, so absence is the specified shape. */
  pin_hash?: string | undefined;
};

export type WireStaffResponse = {
  form: "snapshot" | "delta";
  version: number;
  base_version?: number | undefined;
  entries: readonly WireStaffEntry[];
  complete: boolean;
  next_from: number;
};

/**
 * ⚠ **`assignments` IS COPIED BY REFERENCE AND `branch_id: null` MUST SURVIVE AS `null`.**
 * `01-F78` half one puts org-wide assignments in every branch's artifact — that is how an owner
 * unlocks a till at a branch she does not staff — so collapsing `null` to this device's branch,
 * or dropping the row, silently changes what `can()` answers on every write
 * (`apps/pos-electron/src/main/authorize.ts` matches on `branch_id`).
 *
 * `pin_hash` is spread conditionally rather than assigned: under `exactOptionalPropertyTypes` an
 * assigned `undefined` is a PRESENT key, and `11-F21`'s absent hash must be absent.
 */
const toMember = (w: WireStaffEntry): StaffMember => ({
  user_id: w.user_id,
  display_name: w.display_name,
  grid_ordinal: w.grid_ordinal,
  status: w.status,
  assignments: w.assignments,
  ...(w.pin_hash === undefined ? {} : { pin_hash: w.pin_hash }),
});

/**
 * What the caller should do next. `fetchMore` carries the cursor to send in the next
 * `reference_request`; `update` is present exactly when there is something to apply — and the
 * `done: false` arm carries no `update` key at all, so there is nothing a caller could apply by
 * mistake.
 */
export type StaffFetchStep =
  | { done: false; fetchMore: { have_version: number; from: number; at_version: number } }
  | { done: true; update: StaffUpdate }
  | { done: true; update: null };

/**
 * Accumulates `reference_response` pages for ONE staff fetch. Create it when a fetch starts;
 * discard it when the fetch ends or the connection drops — a half-accumulated roster from a dead
 * session must never merge with pages from the next one, which is why this holds no store
 * reference and cannot apply anything itself.
 */
export const createStaffFetch = (have_version: number) => {
  let pending: WireStaffEntry[] = [];
  /**
   * What page 1 said this fetch is. Every later page must agree, or the pages do not describe one
   * roster and combining them fabricates a third that never existed.
   */
  let shape: { form: "snapshot" | "delta"; version: number; base_version?: number } | null = null;

  return {
    /** Feed one frame. Returns whether to ask for more, and what to apply when finished. */
    accept(response: WireStaffResponse): StaffFetchStep {
      /**
       * **EVERY PAGE OF A FETCH MUST AGREE ON WHAT IT IS.** The catalog's measured defect, on the
       * artifact where it costs credentials: an accumulator that took `version`/`base_version`
       * from the LAST page and the entries from all of them committed page 1's rows at the new
       * version number whenever a publish landed between pages — after which `hello_ack` matched
       * forever and the edit was never re-fetched. Silent, permanent, undetectable at the till,
       * and here it decides who may open a shift. Discarding is safe because nothing has been
       * applied; the next reconcile starts clean.
       */
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
          // stops a publish between pages splicing two rosters into one version number.
          fetchMore: { have_version, from: response.next_from, at_version: response.version },
        };
      }
      shape = null;

      const entries = pending;
      pending = [];

      if (response.form === "snapshot") {
        // `01-F75`/`11-F22`/R26: **a departure is a MARKED ENTRY and never an absence** — the
        // frame carries no removals list for any resource, so every row travels and an
        // `inactive` one is upserted like any other. Filtering them out here would delete the
        // device's record of a let-go cashier's name, which is the exact defect `11-F22` names
        // in the shipped `staff.ts`, reintroduced one layer up.
        return {
          done: true,
          update: { kind: "snapshot", version: response.version, members: entries.map(toMember) },
        };
      }

      // A delta with no base is not applicable — the store would have to guess what it applies
      // to, and guessing is how one device's roster diverges from every other's. Refuse by
      // returning nothing; the caller's next reconnect reconciles through `hello_ack`.
      if (response.base_version === undefined) return { done: true, update: null };

      // An empty delta at the version we already hold is the server saying "you are current"
      // (`staffPage` answers a device at parity exactly so). Nothing to apply, and deliberately
      // not an error — a device that reported a fault every time it was up to date would send a
      // manager to look for a problem that does not exist (`00 §5.7`).
      if (entries.length === 0 && response.version === response.base_version) {
        return { done: true, update: null };
      }

      return {
        done: true,
        update: {
          kind: "delta",
          from_version: response.base_version,
          version: response.version,
          upserts: entries.map(toMember),
          // Always empty, and the field is `staff.ts`'s to delete rather than this file's: the
          // wire carries no removals list for any resource (`01-F75`), so this accumulator has
          // nothing it could ever put here.
          removals: [],
        },
      };
    },
  };
};

export type StaffFetch = ReturnType<typeof createStaffFetch>;
