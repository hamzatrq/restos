/**
 * B-3 — the staged-edit store and the writer-side rules an owner meets in the editor
 * (`plans/wave-1/backoffice-catalog.md` §4.2, §4.3). Owning spec: `specs/14-backoffice.md`.
 *
 * **THE TRAP THIS MODULE EXISTS TO KEEP OPEN: a staged edit is not a published catalog.**
 * There are two version axes and they are deliberately not the same thing —
 *
 *   1. the **staged draft** an owner is editing, which lives here, is cancellable, and which no
 *      device has ever heard of;
 *   2. the **published artifact** (`01-F52`..`01-F56`: monotonic, snapshot + delta) that devices
 *      fetch, which only `publish.ts` writes.
 *
 * Conflating them has two failure modes and both are silent: a device fetches a half-finished
 * menu, or a day-end edit the owner CANCELLED still reaches a till. `catalog-transport.md` chose
 * this split over shipping an `effective_at` to devices for exactly that second reason — a device
 * applying its own schedule would apply an edit that no longer exists.
 *
 * What is NOT here: the publish path (`publish.ts`), the procedures (`catalog-router.ts`).
 */

import { type OrderChannel, SELLABLE_KINDS } from "@restos/domain";
import { CatalogEntryWire, type CatalogEntryWireT } from "@restos/sync-protocol";

/**
 * One catalog entity as the editor holds it. **The wire schema, reused — not restated.**
 * `18 §4` declares a schema once, and reusing `sync-protocol`'s means `14-F29`'s "the same rule
 * the kernel enforces at publish" is literally the same Zod object rather than a transcription
 * that drifts. A transcription is how `channel` would end up accepting `dine_in` here and being
 * refused three layers down, at publish, in front of an owner who has already left the screen.
 */
export type CatalogEntry = CatalogEntryWireT;

/**
 * `01-F60`'s enabled `(branch, channel)` pairs — the full cross product `14-F29`'s grid presents
 * (a row per branch, a column per enabled channel).
 *
 * **REQUIRED wherever it appears, never optional** (founder ruling July 2026, and the same shape
 * `publishCatalog` takes). An optional completeness input means a caller who simply forgot it
 * silently gets no check at all, "which is precisely the omission this FR refuses a fallback in
 * order to prevent". `00 §7`'s config plane does not exist, so the caller states the set
 * explicitly even where that is a constant.
 *
 * **`channels` is `02-F42`'s CLOSED set and not a free string** (August 2026), because this type
 * is now what `catalog.enabled` puts on the wire: `apps/backoffice` draws `14-F29`'s columns from
 * the server's answer instead of from its own `NEXT_PUBLIC_ENABLED_*` copy, and a column the
 * editor can draw but no order can ever carry is an item that reads as unpriced on every real
 * channel. `01-F60` resolves a price by the ORDER's channel, so a `dine_in` column (an order
 * TYPE, `02-F1`) matches no lookup that will ever happen. `server.ts` enforces the membership at
 * boot, which is what makes this annotation true rather than decorative.
 */
export type EnabledPairs = {
  readonly branches: readonly string[];
  readonly channels: readonly OrderChannel[];
};

/**
 * `14-F28` — when an edit applies. **The default is `day_end` and that is load-bearing**, not a
 * convenience: `27-F4` makes moving an operational grid item a breaking change because a
 * cashier's speed is muscle memory, so a menu edit lands at the 05:00 business-day boundary
 * (`01-F46`) and a grid never moves under a cashier mid-shift.
 *
 * `now` exists because menu changes are sometimes genuinely urgent — but it is "a deliberate act
 * with the consequence stated on the control, not a hidden default". An implementation where
 * absent means `now` has quietly made every edit a breaking change.
 */
export type ApplyWhen = "day_end" | "now";

/** Absent input resolves HERE, and to `day_end`. See `ApplyWhen`. */
export const DEFAULT_APPLY_WHEN: ApplyWhen = "day_end";

/**
 * A staged edit: an entry's after-state, an actor, and when it lands. Pending edits are "visible
 * and cancellable until they land" (`14-F28`), which is what `pending` and `cancel` below serve.
 *
 * `lands_at` is stamped at STAGE time rather than recomputed at sweep time. Recomputing would
 * make an edit's landing depend on when the sweep happened to run, so an edit staged at 04:59
 * and swept at 05:01 would be re-dated to the FOLLOWING day and sit unpublished for 24 hours.
 */
export type StagedEdit = {
  readonly edit_id: string;
  readonly org_id: string;
  /** `14-F3`: "price changed by Ali, 2 Jul, 450 → 480". Never null — a save has a logged-in author. */
  readonly actor_user_id: string;
  readonly staged_at: number;
  readonly apply_when: ApplyWhen;
  /** The instant this lands. `staged_at` for `now`; the next `01-F46` boundary for `day_end`. */
  readonly lands_at: number;
  readonly entry: CatalogEntry;
};

/**
 * The staged-edit store. A PORT, on `users.ts`'s precedent: the durable Drizzle implementation
 * lands with the back office's own schema, and until then the composition root supplies the
 * in-memory one below and says so.
 */
export type StagedEditStore = {
  stage(edit: StagedEdit): Promise<void>;
  /** Every unlanded edit for an org, oldest first — `14-F28`'s "visible … until they land". */
  pending(org_id: string): Promise<readonly StagedEdit[]>;
  /** `14-F28`'s "cancellable until they land". `false` when there was nothing to cancel. */
  cancel(org_id: string, edit_id: string): Promise<boolean>;
  /**
   * Remove and return every edit due at or before `at`, **for every org on this host**.
   *
   * **Removal and reading are one call on purpose.** The obvious alternative — read the due set,
   * publish it, then delete — leaves a window in which a cancel arrives against an edit already
   * in flight, and the edit lands anyway. Taking first means a cancelled edit is simply not in
   * the set, which is the property `14-F28` needs and the one a scheduler that captured its work
   * list at stage time cannot have.
   *
   * ⚠ **THIS IS THE UNSCOPED SWEEP AND ONLY A SCHEDULE MAY CALL IT (`01-F71`).** It is the
   * platform acting on its own behalf for every tenant at the `01-F46` boundary. Reached from a
   * REQUEST it is a cross-tenant write: it removes and publishes another org's staged edits under
   * one tenant's authority, and because the *answer* can still be narrowed to the caller, nothing
   * on either side reports it. That is exactly what `catalog.runDayEnd` did until August 2026 —
   * see `takeDueForOrg`.
   */
  takeDue(at: number): Promise<readonly { org_id: string; edits: readonly StagedEdit[] }[]>;
  /**
   * The same take, **narrowed to one org** — `01-F71` (b): the org comes from the authenticated
   * subject, and the SIDE EFFECT is scoped by it, not merely the answer.
   *
   * **A separate named method rather than an optional argument on `takeDue`**, on `01-F65`'s
   * recorded discipline: *"a separate, named resolution rather than a flag on a permissive one, so
   * that a call site states which discipline it is under and a later edit cannot re-enable a
   * fallback by dropping an argument."* An `org_id?` here would mean a caller who simply forgot it
   * silently gets the every-tenant sweep, which is the defect this exists to close.
   */
  takeDueForOrg(at: number, org_id: string): Promise<readonly StagedEdit[]>;
};

/**
 * STUB, and named one — the same shape and the same honesty as `createMemoryUserStore`. Process
 * local, dies with the process. A pending day-end edit therefore does not survive a restart,
 * which is a real gap and is reported rather than hidden: the durable store is owed with the back
 * office's Drizzle schema.
 */
export const createMemoryStagedEditStore = (): StagedEditStore => {
  const byOrg = new Map<string, Map<string, StagedEdit>>();
  const of = (org_id: string): Map<string, StagedEdit> => {
    const existing = byOrg.get(org_id);
    if (existing !== undefined) return existing;
    const created = new Map<string, StagedEdit>();
    byOrg.set(org_id, created);
    return created;
  };

  /**
   * ONE take, so the scoped sweep and the every-tenant sweep cannot disagree about what "due"
   * means or about the take-before-publish ordering `takeDue` documents. It reads with `get` and
   * never `of`, so asking about an org this host has never staged for creates no row for it —
   * a foreign org id arriving on a request leaves no trace at all.
   */
  const takeFrom = (org_id: string, at: number): readonly StagedEdit[] => {
    const edits = byOrg.get(org_id);
    if (edits === undefined) return [];
    const ready = [...edits.values()]
      .filter((edit) => edit.lands_at <= at)
      .sort((a, b) => a.staged_at - b.staged_at || 0);
    for (const edit of ready) edits.delete(edit.edit_id);
    return ready;
  };

  return {
    stage: async (edit) => {
      of(edit.org_id).set(edit.edit_id, edit);
    },
    pending: async (org_id) =>
      [...of(org_id).values()].sort((a, b) => a.staged_at - b.staged_at || 0),
    cancel: async (org_id, edit_id) => of(org_id).delete(edit_id),
    takeDue: async (at) => {
      const due: { org_id: string; edits: readonly StagedEdit[] }[] = [];
      // The key list is snapshotted because `takeFrom` mutates the inner maps as it goes.
      for (const org_id of [...byOrg.keys()]) {
        const ready = takeFrom(org_id, at);
        if (ready.length === 0) continue;
        due.push({ org_id, edits: ready });
      }
      return due;
    },
    takeDueForOrg: async (at, org_id) => takeFrom(org_id, at),
  };
};

/**
 * **`01-F60` / `14-F29` — the completeness rule, enforced at SAVE.**
 *
 * `publishCatalog` already refuses an entry that leaves an enabled `(branch, channel)` pair
 * unpriced. This restates it here, and `14-F29` says why in as many words: *"stated here because
 * this editor is where an owner meets it"*. An owner who learns at publish — possibly at 05:00,
 * possibly from a scheduler with no screen in front of it — learns too late to fix it in the
 * editor she was just in.
 *
 * Two edges that look like details and are not:
 *
 * - **An empty enabled set is REFUSED, not treated as "nothing to check".** Zero branches or zero
 *   channels makes the cross product empty and every entry vacuously complete — the optional
 *   argument the founder overruled, arrived at by a different route.
 * - **Membership of the CELL, never truthiness of the price.** `0` is a price: a free modifier
 *   carries an explicit `0` on every enabled pair, precisely so "this costs nothing" and
 *   "somebody forgot foodpanda" stop being indistinguishable. `if (!price)` refuses the legal
 *   free add-on and its mirror gives a paid one away, and `01-F53` freezes either into the ledger.
 */
export const assertSavable = (entry: unknown, enabled: EnabledPairs): CatalogEntry => {
  if (enabled.branches.length === 0 || enabled.channels.length === 0) {
    throw new RangeError(
      "catalog save: the enabled (branch, channel) set is empty, so no completeness check is " +
        "possible (01-F60). It is a REQUIRED input, not an optional one defaulting to " +
        '"check nothing" — an empty set would accept an entry priced for nowhere.',
    );
  }

  const candidate = entry as CatalogEntry;
  if (SELLABLE_KINDS.includes(String(candidate?.kind)) && candidate?.deleted !== true) {
    // A tombstone is exempt: `01-F55` keeps it resolvable for display and off the sellable grid,
    // and requiring a price on a deleted item would make archiving impossible once channels grow.
    //
    // NUL-joined, as the gateway joins it. A separator that can occur inside an id would let
    // `("a b", "c")` and `("a", "b c")` collide, and an unpriced cell would read as present.
    const have = new Set(
      (candidate.prices ?? []).map((price) => `${price.branch_id}\u0000${price.channel}`),
    );
    for (const branch_id of enabled.branches) {
      for (const channel of enabled.channels) {
        if (have.has(`${branch_id}\u0000${channel}`)) continue;
        throw new RangeError(
          `catalog save: ${String(candidate.kind)}/${String(candidate.id)} is not sellable — ` +
            `no price for branch ${branch_id}, channel ${channel} (01-F60). There is no fallback ` +
            `to a house price: a forgotten aggregator price sells at the in-restaurant rate ` +
            `while commission still takes its cut, and 01-F53 freezes that permanently.`,
        );
      }
    }
  }

  const parsed = CatalogEntryWire.safeParse(entry);
  if (parsed.success) return parsed.data;

  // Name the offending VALUE, not just its path — `01-F60`'s refusal has to name the channel, and
  // "prices.2.channel: invalid option" does not tell an owner that she typed an order TYPE
  // (`02-F1` `dine_in`) into a price KEY (`02-F42`).
  const issue = parsed.error.issues[0];
  const path = issue?.path ?? [];
  const at = path.reduce<unknown>(
    (node, key) =>
      typeof node === "object" && node !== null
        ? (node as Record<PropertyKey, unknown>)[key as PropertyKey]
        : undefined,
    entry,
  );
  throw new RangeError(
    `catalog save: entry is not servable — ${path.join(".") || "?"}: ` +
      `${issue?.message ?? "invalid"}${at === undefined ? "" : ` (got ${JSON.stringify(at)})`}. ` +
      `Publishing it would make every catalog_response for this org unparseable (01-F56).`,
  );
};
