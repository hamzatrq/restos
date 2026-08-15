/**
 * B-4 — the publish path: the `14-F28` day-end scheduler, apply-now, and the two writes an edit
 * produces (`plans/wave-1/backoffice-catalog.md` §3.2, §3.3).
 *
 * **THIS APP WRITES TO TWO STORES AND ONLY ONE OF THEM IS THE LEDGER**, and the split is `14-F6`
 * + `01-F52` held together rather than in tension:
 *
 *   - the **catalog artifact** goes to `publishCatalog` — versioned REFERENCE data, what devices
 *     fetch, no event, no fold;
 *   - the **audit record** goes to the ledger as `catalog.changed` — `14-F3`'s browsable history
 *     ("price changed by Ali, 2 Jul, 450 → 480"), carrying before/after REFS and never entity
 *     bodies, because an event that carried the menu would make the catalog ledger data in the
 *     same breath as `01-F52` says it is not.
 *
 * **`14-F3` renders its own example now, and it did not before.** The record carried the actor and
 * two content hashes, so a history row could say *who* and nothing else — the screen printed a
 * standing apology instead of a date and two numbers. It now also carries `server_received_at`
 * (`01-F62`: `catalog.changed` is ORG-SCOPED, so server time is its ordering authority and no
 * branch stamp exists to want) and `price_changes` (`priceChanges` below: the moved CELLS, a delta
 * and not a body). `01-F53` is unaffected — a line's price is snapshotted from the CATALOG at
 * line-add, and nothing resolves a price by reading history.
 *
 * **Both are PORTS**, and that is a stated limitation rather than an oversight. `publishCatalog`
 * lives in `services/sync-gateway` (a protected path, `20 §4.4`) and needs a live Postgres
 * handle, and this service has neither the dependency nor a database. So the adapter binding
 * these ports to the kernel is OWED; what is here is the caller `catalog-transport.md` says
 * `publishCatalog` has been waiting for, expressed against its exact signature so the adapter is
 * a binding and not a redesign.
 */

import {
  businessDayBounds,
  type CatalogPriceChangeT,
  newId,
  type OrderChannel,
  payloadHash,
} from "@restos/domain";
import {
  type ApplyWhen,
  assertSavable,
  type CatalogEntry,
  DEFAULT_APPLY_WHEN,
  type EnabledPairs,
  type StagedEdit,
  type StagedEditStore,
} from "./catalog.js";

/**
 * The kernel's catalog writer, as a port.
 *
 * `publish` is `services/sync-gateway`'s `publishCatalog(db, org_id, entries, opts)` with `db`
 * bound — same argument names, same order, same `enabled` requirement — so the owed adapter is
 * one line. `published` is `catalogPage(db, org_id, 0, 0)`'s snapshot fold: **what a DEVICE would
 * fetch**, which is the only honest place to assert `14-F28` from. Plan §6.4 says so outright:
 * "asserted by fetching from a device session before and after — never by inspecting the staging
 * table, since the whole point is what the device sees."
 */
export type CatalogPublisher = {
  publish(
    org_id: string,
    entries: readonly CatalogEntry[],
    opts: {
      actor_user_id: string | null;
      now: number;
      /** `01-F60` — REQUIRED, never optional. See `EnabledPairs`. */
      enabled: EnabledPairs;
    },
  ): Promise<number>;
  published(org_id: string): Promise<{ version: number; entries: readonly CatalogEntry[] }>;
};

/**
 * One ledger append, as this service can honestly express it.
 *
 * `actor_user_id` sits at the ENVELOPE level because that is where `01-F5`/`02-F19` put
 * attribution and where `EventEnvelope` has a field for it — and it is `string | null` rather
 * than `string` for a deliberate reason: the envelope schema says nullable, so "appended with no
 * actor" has to be a constructible mistake or no test can prove it does not happen. `14-F3`
 * renders "changed by ???" the day it does.
 *
 * **`01-F62` (August 2026) closed the gap this type used to report.** `catalog.changed` is an
 * ORG-SCOPED event: it carries `org_id`, **no `branch_id` and no branch stamp**, and it never
 * enters a branch stream — so there is no envelope to mint and the earlier note ("the adapter's
 * to mint … a genuine gap in the corpus") is retired rather than merely unresolved. What replaces
 * it is `server_received_at` below.
 */
export type LedgerRecord = {
  readonly type: "catalog.changed";
  readonly org_id: string;
  readonly actor_user_id: string | null;
  /**
   * `14-F3`'s *"2 Jul"*, and `01-F18`/`01-F62`'s ordering authority for a catalog edit — one
   * field serving both, because they are the same instant and two would be two answers.
   *
   * **This is SERVER time and that is legitimate, not a law-2 exception.** `01-F43`'s
   * branch-consensus rule exists because a *device* clock is an untrusted input a fold could read;
   * `01-F62` says an org-scoped event has neither a branch nor a hub to ask, and that its ordering
   * authority is `server_received_at` precisely because "the cloud plane is the one place a clock
   * is not a threat — the inverse of the device-clock threat model `01-F43` was written for".
   *
   * Stamped **once, at append, by the server** (`deps.now`, injected at the composition root). It
   * is a stored fact, never a rendering-time convenience: a history screen that formatted its own
   * `Date.now()` would print today's date beside a change made in July, and be *right* on the day
   * the record was written — which is what makes that bug survive a demo.
   */
  readonly server_received_at: number;
  readonly payload: {
    readonly entity: string;
    readonly entity_id: string;
    readonly version: number;
    readonly before_ref: string | null;
    readonly after_ref: string | null;
    /**
     * `14-F3`'s *"450 → 480"* — the cells this edit moved, empty when it moved none. Declared
     * once in `domain` (`CatalogPriceChange`) and reused here rather than transcribed, on the
     * same `18 §4` grounds that just consolidated `SELLABLE_KINDS`.
     */
    readonly price_changes: readonly CatalogPriceChangeT[];
  };
};

export type LedgerAppender = {
  append(record: LedgerRecord): Promise<void>;
  /** `14-F3`'s history view reads this — the audit trail is a first-class element, not a log. */
  history(org_id: string): Promise<readonly LedgerRecord[]>;
};

/**
 * Everything the publish path needs, as one required bag. **Nothing here is optional**, on
 * `01-F60`'s precedent and this wave's: an optional dependency that no call site supplies is
 * exactly the "unsupplied seam" the CI rail exists to catch, and it is how a durable spooler
 * shipped with a `Map` behind it.
 */
export type CatalogDeps = {
  readonly staged: StagedEditStore;
  readonly publisher: CatalogPublisher;
  readonly ledger: LedgerAppender;
  /** `01-F60` — stated by the composition root, never defaulted here. */
  readonly enabled: EnabledPairs;
  /** `18 §4` — injected at the composition root; nothing below reads a wall clock. */
  readonly now: () => number;
  /** `01-F46` — 05:00 default, layer-2 configurable. Required so no caller can skip stating it. */
  readonly cutover_hour: number;
};

/**
 * `01-F46` — the next business-day boundary strictly after `at`, in Asia/Karachi.
 *
 * `businessDayBounds(at).end_ms` is the half-open upper bound of the day CONTAINING `at`, which
 * is the next cutover — so an edit staged at 23:10 lands at 05:00 the following morning, and one
 * staged at 01:30 lands at 05:00 that same morning, because 01:30 still belongs to the previous
 * business day. Both are `27-F4` correct: neither moves a grid under a cashier mid-shift.
 */
export const dayEndBoundary = (at: number, cutover_hour: number): number =>
  businessDayBounds(at, cutover_hour).end_ms;

/**
 * When an edit staged now would land. `now` lands immediately; `day_end` waits for `01-F46`.
 * Exported because `catalog.save` returns it — `14-F28` requires the consequence to be stated on
 * the control, and a screen cannot state "lands at 05:00 tomorrow" that the server has not said.
 */
export const landsAt = (apply_when: ApplyWhen, staged_at: number, cutover_hour: number): number =>
  apply_when === "now" ? staged_at : dayEndBoundary(staged_at, cutover_hour);

/**
 * Build the edit record for a validated entry. **The default resolves HERE, once**, so there is
 * exactly one place `14-F28`'s "default day-end" can be got wrong, and it is covered.
 */
export const stageEdit = (
  deps: CatalogDeps,
  args: {
    org_id: string;
    actor_user_id: string;
    entry: CatalogEntry;
    apply_when: ApplyWhen | undefined;
  },
): StagedEdit => {
  const apply_when = args.apply_when ?? DEFAULT_APPLY_WHEN;
  const staged_at = deps.now();
  return {
    edit_id: newId(),
    org_id: args.org_id,
    actor_user_id: args.actor_user_id,
    staged_at,
    apply_when,
    lands_at: landsAt(apply_when, staged_at, deps.cutover_hour),
    entry: args.entry,
  };
};

/**
 * `14-F3`'s *"450 → 480"*, computed where both sides are in hand.
 *
 * The union of the two grids' cells, keeping only those whose price actually moved — so a rename
 * yields `[]` and a five-branch org that changed one channel yields one row, not twenty-five. An
 * entry with no `before` (a brand-new item) yields every cell as `null → price`, which is the
 * honest reading of "there was nothing to change from" and matches `before_ref === null`.
 *
 * **Membership of the cell, never truthiness of the price** — the same rule `01-F60`'s
 * completeness check runs on, for the same reason: `0` is a price, so a cell added at `0` is a
 * change (`null → 0`) and a cell that fell from `450` to `0` is a change, and any test shaped like
 * `if (!price)` erases both. No arithmetic happens here; the two figures are read and compared,
 * never combined (`DEC-MONEY-005`).
 *
 * NUL-joined keys, as every other `(branch, channel)` map in this codebase is: a separator that can
 * occur inside an id lets `("a b", "c")` and `("a", "b c")` collide, and a moved price would then
 * read as unchanged.
 */
export const priceChanges = (
  before: CatalogEntry | undefined,
  after: CatalogEntry,
): readonly CatalogPriceChangeT[] => {
  type Cell = { branch_id: string; channel: OrderChannel; price_paisa: number };
  const cells = (entry: CatalogEntry | undefined): Map<string, Cell> =>
    new Map(
      (entry?.prices ?? []).map((price) => [`${price.branch_id} ${price.channel}`, price as Cell]),
    );
  const was = cells(before);
  const is = cells(after);

  const changes: CatalogPriceChangeT[] = [];
  for (const key of new Set([...was.keys(), ...is.keys()])) {
    const from = was.get(key);
    const to = is.get(key);
    const before_paisa = from === undefined ? null : from.price_paisa;
    const after_paisa = to === undefined ? null : to.price_paisa;
    if (before_paisa === after_paisa) continue;
    // The cell's identity comes from whichever side HAS it, never from re-splitting the joined
    // key — so the separator stays a detail of this map rather than a parsing contract.
    const at = (to ?? from) as Cell;
    changes.push({ branch_id: at.branch_id, channel: at.channel, before_paisa, after_paisa });
  }
  return changes;
};

/**
 * **The one publish path**, reached by apply-now and by the day-end sweep alike. Having two would
 * mean two places for `01-F60`, two places for `catalog.changed`, and a real chance that only one
 * of them appended an actor.
 *
 * Order is load-bearing:
 *
 * 1. read the currently published entries FIRST, for `before_ref` — after the publish they are
 *    the after-state and every `before_ref` would equal its `after_ref`, which is `14-F3`'s
 *    history rendering "450 → 450" for every edit ever made;
 * 2. re-validate against `01-F60` — a day-end edit can be staged while the enabled set is one
 *    thing and land while it is another, and the publish would then be refused by the kernel at
 *    05:00 with nobody watching;
 * 3. publish the artifact, taking the version the kernel assigns;
 * 4. append one `catalog.changed` per entry, carrying that version — `14-F8` requires individual
 *    events "so history stays per-item", so a five-item bulk edit is five records, not one.
 */
export const publishEdits = async (
  deps: CatalogDeps,
  org_id: string,
  edits: readonly StagedEdit[],
): Promise<number | null> => {
  if (edits.length === 0) return null;

  const before = await deps.publisher.published(org_id);
  const previous = new Map(
    before.entries.map((entry) => [`${entry.kind}\u0000${entry.id}`, entry]),
  );

  const entries = edits.map((edit) => assertSavable(edit.entry, deps.enabled));

  // One actor for the whole publish. `catalog.changed` carries the per-edit actor below; this is
  // the artifact's `catalog_versions.actor_user_id`, and a sweep of several owners' edits has no
  // single one — so the LAST edit's actor is not claimed for all of them.
  const actors = new Set(edits.map((edit) => edit.actor_user_id));
  const actor_user_id = actors.size === 1 ? (edits[0] as StagedEdit).actor_user_id : null;

  // `01-F62` — ONE server reading, taken once and used for both writes. The artifact and its audit
  // records are the same publish, so two `deps.now()` readings would let a history row disagree
  // with the version it describes, and a bulk edit's five records disagree with each other about
  // when "the" edit happened. `14-F3` renders this as "2 Jul"; `01-F18` orders by it.
  const server_received_at = deps.now();

  const version = await deps.publisher.publish(org_id, entries, {
    actor_user_id,
    now: server_received_at,
    enabled: deps.enabled,
  });

  for (const [index, edit] of edits.entries()) {
    const entry = entries[index] as CatalogEntry;
    const was = previous.get(`${entry.kind}\u0000${entry.id}`);
    await deps.ledger.append({
      type: "catalog.changed",
      org_id,
      // `14-F3`: the history is "changed by Ali", so the EDIT's actor, never the publish's.
      actor_user_id: edit.actor_user_id,
      server_received_at,
      payload: {
        entity: entry.kind,
        entity_id: entry.id,
        version,
        // Content-addressed handles into the published snapshot (`01-F52`), never bodies.
        // `null` before-ref means the entry is new — there was nothing to change from.
        before_ref: was === undefined ? null : payloadHash(was),
        after_ref: payloadHash(entry),
        // `14-F3`'s "450 → 480". Computed HERE because this is the one place both sides are in
        // hand — `previous` is read before the publish for exactly this reason.
        price_changes: priceChanges(was, entry),
      },
    });
  }

  return version;
};

/**
 * `14-F28`'s day-end scheduler.
 *
 * **`runDue` re-reads the store every sweep — it does NOT hold a work list.** The obvious
 * implementation is a `setTimeout` per staged edit capturing that edit, and it is wrong in the
 * one way that matters: cancelling removes the edit from the store and the captured closure
 * publishes it anyway at 05:00, to every till in the org, hours after the owner watched the
 * pending row disappear. `catalog-transport.md` names that failure as the reason devices are
 * never shipped an `effective_at`, and moving the schedule into this service does not make it
 * safe — only reading the live set does.
 *
 * Idempotent by construction: `takeDue`/`takeDueForOrg` remove what they return, so a sweep that
 * runs twice publishes once.
 *
 * **TWO SWEEPS, AND WHICH ONE A CALLER GETS IS `01-F71`.** `runDue` is the platform's schedule
 * acting for every tenant at the `01-F46` boundary; `runDueForOrg` is one tenant landing its own.
 * They are separate names rather than one method with an optional org for `01-F65`'s reason — a
 * flag on a permissive resolution can be re-loosened by dropping an argument, and here dropping it
 * would publish another restaurant's menu to that restaurant's tills.
 */
export const createDayEndScheduler = (deps: CatalogDeps): DayEndScheduler => ({
  runDue: async () => {
    const landed: { org_id: string; version: number }[] = [];
    for (const { org_id, edits } of await deps.staged.takeDue(deps.now())) {
      const version = await publishEdits(deps, org_id, edits);
      if (version !== null) landed.push({ org_id, version });
    }
    return landed;
  },
  runDueForOrg: async (org_id) =>
    publishEdits(deps, org_id, await deps.staged.takeDueForOrg(deps.now(), org_id)),
});

export type DayEndScheduler = {
  /**
   * ⚠ **EVERY TENANT ON THIS HOST. Only a SCHEDULE may call this — never a request** (`01-F71`).
   * `server.ts`'s interval is its one production caller.
   */
  runDue(): Promise<readonly { org_id: string; version: number }[]>;
  /**
   * One org's due edits, taken and published. The version the kernel assigned, or `null` when that
   * org had nothing due — `publishEdits` refuses an empty change set as a version (`01-F52`).
   */
  runDueForOrg(org_id: string): Promise<number | null>;
};

/**
 * What a request sees: the deps plus the one scheduler built from them.
 *
 * ONE scheduler per host, built here rather than per request, so `runDayEnd` and the production
 * interval are the same object over the same store. Two schedulers would be two work lists, and
 * `14-F28`'s cancel would only ever reach one of them.
 */
export type CatalogRuntime = CatalogDeps & { readonly scheduler: DayEndScheduler };

export const createCatalogRuntime = (deps: CatalogDeps): CatalogRuntime => ({
  ...deps,
  scheduler: createDayEndScheduler(deps),
});

/**
 * STUB standing in for `services/sync-gateway`'s `publishCatalog` + `catalogPage`. Process-local,
 * and named a stub for the same reason `createMemoryUserStore` is: it is a host-under-test and a
 * dev seed, never production storage.
 *
 * It mirrors the kernel's SHAPE — monotonic version per org, entries folded by `(kind, id)` with
 * the newest winning, tombstones RETAINED (`01-F55`) — and deliberately does **not** re-implement
 * `01-F60`'s completeness check. That check belongs to the real writer; duplicating it here would
 * make the suite pass on this module's opinion of the rule rather than on the API's, which is how
 * a save-side check that had been deleted would still look enforced.
 */
export const createMemoryCatalogPublisher = (): CatalogPublisher => {
  const versions = new Map<string, number>();
  const folded = new Map<string, Map<string, CatalogEntry>>();

  return {
    publish: async (org_id, entries) => {
      if (entries.length === 0) {
        // `publishCatalog`'s own refusal, kept so the stub cannot accept what the kernel rejects.
        throw new RangeError("publish: an empty change set is not a version (01-F52)");
      }
      const version = (versions.get(org_id) ?? 0) + 1;
      versions.set(org_id, version);
      const org = folded.get(org_id) ?? new Map<string, CatalogEntry>();
      // Overwrite by identity, never remove: `01-F55` deletion is a tombstone, so an archived
      // entry stays in the fold marked `deleted` and a reprint of an older order still renders it.
      for (const entry of entries) org.set(`${entry.kind}\u0000${entry.id}`, entry);
      folded.set(org_id, org);
      return version;
    },
    published: async (org_id) => ({
      version: versions.get(org_id) ?? 0,
      entries: [...(folded.get(org_id)?.values() ?? [])],
    }),
  };
};

/** STUB, as above — the durable ledger is the gateway's, reached through the owed adapter. */
export const createMemoryLedgerAppender = (): LedgerAppender => {
  const byOrg = new Map<string, LedgerRecord[]>();
  return {
    append: async (record) => {
      const existing = byOrg.get(record.org_id) ?? [];
      existing.push(record);
      byOrg.set(record.org_id, existing);
    },
    history: async (org_id) => [...(byOrg.get(org_id) ?? [])],
  };
};
