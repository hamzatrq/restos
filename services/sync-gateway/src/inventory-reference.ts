/**
 * `01-F21`'s inventory reference set — the gateway's writer and its reader.
 *
 * **This service stores and serves; the API authorizes and folds** (`18 §4` gives `kernel.*`
 * exactly one writer service). `services/api`'s `10-F18` variance report has been hosted, gated
 * and correct since it landed, over a port that REFUSES every read — measured 2026-08-25 on a real
 * four-process stack, `inventory.variance` answered **HTTP 500** for an authenticated owner,
 * because nothing anywhere stored this data. This module is that storage.
 *
 * ⚠ **A MEMORY STUB WOULD HAVE BEEN THE WRONG SHAPE AND `services/api/src/inventory.ts` SAYS SO
 * AT LENGTH.** A reference source answering `{ items: [] }` produces a complete, confident,
 * entirely empty variance report — no rows, no floor flag, no unexplained usage — for a restaurant
 * that is short Rs 14,200 of chicken, and nothing on that screen says anything is missing. `L8`'s
 * third blind spot is exactly this: *Rule B asks whether an optional member is supplied, never
 * whether what was supplied is real, and a stub is a supply.* So the supplier this unblocks reads
 * a real table, and `__acceptance__/inventory-reference.test.ts` is the hand-written assertion
 * that a plate's reference cost changes when the published bytes change.
 *
 * ⚠ **NO REFUSAL LOGIC LIVES HERE, AND THAT IS NOT AN OMISSION.** `10-F31`'s R1–R5 — `is_counted`
 * without `is_costed`, an uncostable recipe leaf, a cycle, a missing component — are enforced by
 * `referenceRefusals` at the WRITER, which is `services/api`. That is `14-F29`/`01-F60`'s
 * precedent: completeness is met where the owner is typing and the fix is one keystroke away, and
 * a report that repaired an incomplete set would be guessing at exactly the values R5 forbids it
 * to guess. What this file refuses is narrower and structural — bytes it could not fold back.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** `catalog.ts`'s alias, restated because it is module-private there. */
type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * The four kinds `packages/inventory`'s `ReferenceData` carries.
 *
 * ⚠ `plans/inventory/design.md` §6 names SIX (adding suppliers and supplier items). The shipped
 * type has four, and it is the one declaration `18 §2` permits — a fifth kind lands here when
 * `10-F13`'s supplier ledger has a reader, not before. A kind nothing folds is a column that
 * cannot be wrong, which is the same thing as a column that is never right.
 */
export const INVENTORY_KINDS = ["item", "area", "recipe", "menu_recipe"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

export type InventoryEntry = {
  readonly kind: InventoryKind;
  /**
   * Unique WITHIN A KIND, never across the artifact — an item and a recipe may share an id. For
   * `area` the id is the composite `(item_id, location_id, area_id)`, because `10-F30`'s
   * membership row has no identity of its own; `areaKey` in `packages/inventory` is the one
   * function that builds it and this service does not build its own.
   */
  readonly id: string;
  /** Opaque here. `packages/inventory` owns the shape; see the header. */
  readonly payload: Record<string, unknown>;
  /** `01-F55`/R26 — a tombstone, never an absence. See the migration. */
  readonly deleted?: boolean;
};

const toNumber = (value: unknown): number =>
  typeof value === "bigint"
    ? Number(value)
    : typeof value === "number"
      ? value
      : Number(value ?? 0);

/** The org's current reference version. `0` means nothing has ever been published. */
export const inventoryVersion = async (db: Db, org_id: string): Promise<number> => {
  const rows = await db.execute(
    sql`select coalesce(max(version), 0) as v from kernel.inventory_versions
        where org_id = ${org_id}`,
  );
  return toNumber([...rows][0]?.v ?? 0);
};

/**
 * Publish a set of changes as the next version.
 *
 * **THE TRANSACTION is the atomicity story, not the statement order** — `publishCatalog` carries
 * the full argument and it transfers verbatim, including the warning that crediting the ordering
 * is a mental model wrong in a load-bearing direction. The entries-then-version order is kept
 * because it stays correct if this is ever split, not because it is doing the work today.
 *
 * The advisory lock is `publishCatalog`'s too, and for its reason rather than by imitation: two
 * concurrent publishes must not both claim version N, `max(version)` cannot take `FOR UPDATE` at
 * all, and locking the current max ROW would lock nothing on an org's FIRST publish — which is
 * exactly when two publishes would both compute version 1. The `(org_id, version)` primary key is
 * still the real guarantee; the lock is here so the loser WAITS rather than aborting, because the
 * caller is a person saving an edit.
 */
export const publishInventoryReference = async (
  db: Db,
  org_id: string,
  entries: readonly InventoryEntry[],
  opts: { actor_user_id?: string | null; now: number },
): Promise<number> => {
  // Refused BEFORE the transaction opens, and this is the only validation this service performs.
  // It is not a policy check — it is the claim that what is stored can be read back as what was
  // published. An entry with no id cannot be folded to (the snapshot groups by `(kind, id)`), and
  // an unknown kind is a row `inventoryReferenceAt` would silently drop, which is `01-F56`'s
  // `malformed` arriving as a quiet absence instead of a refusal.
  entries.forEach((entry, index) => {
    if (!(INVENTORY_KINDS as readonly string[]).includes(entry.kind)) {
      throw new RangeError(
        `publishInventoryReference: entry ${index} has kind ${JSON.stringify(entry.kind)}, which ` +
          `is not one of ${INVENTORY_KINDS.join(" | ")}. Storing it would make the row invisible ` +
          `to every fold of this artifact — a silent absence rather than a refusal (01-F56).`,
      );
    }
    if (entry.id === "") {
      throw new RangeError(
        `publishInventoryReference: entry ${index} (${entry.kind}) has an empty id. The snapshot ` +
          `fold groups by (kind, id), so an empty id collides with every other empty id of its ` +
          `kind and the last publish silently wins.`,
      );
    }
  });

  return db.transaction(async (tx: Db) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('restos:inventory:' || ${org_id}))`);
    const current = await tx.execute(
      sql`select coalesce(max(version), 0) as v from kernel.inventory_versions
          where org_id = ${org_id}`,
    );
    const version = toNumber([...current][0]?.v ?? 0) + 1;
    for (const entry of entries) {
      await tx.execute(
        sql`insert into kernel.inventory_entries (org_id, version, kind, entry_id, payload, deleted)
            values (${org_id}, ${version}, ${entry.kind}, ${entry.id},
                    ${JSON.stringify(entry.payload)}::jsonb,
                    ${entry.deleted === true ? 1 : 0})`,
      );
    }
    // LAST, deliberately — see the note above.
    await tx.execute(
      sql`insert into kernel.inventory_versions (org_id, version, published_at, actor_user_id)
          values (${org_id}, ${version}, ${opts.now}, ${opts.actor_user_id ?? null})`,
    );
    return version;
  });
};

export type InventoryArtifact = {
  readonly version: number;
  /** Live rows only — tombstones are applied here, never handed to a fold. */
  readonly entries: readonly InventoryEntry[];
};

/**
 * The whole reference set as of the org's current version — the greatest `version <= V` per
 * `(kind, entry_id)`, with tombstoned rows applied.
 *
 * **A SNAPSHOT AND NOT A DELTA, because the cloud reader has no base to diff against.**
 * `services/api` folds a variance report from scratch on every request; it holds no prior artifact
 * and there is nothing for `01-F56`'s monotonic apply to bite on. The delta path is the DEVICE's,
 * and it is owed with amendment A1 (`01-F75`'s resource set is closed and holds no `inventory`
 * member, so no frame can carry this to a till yet). The log this reads is already shaped for it —
 * `A < version <= B` is the same table — which is why the storage is a log and not one JSON blob.
 *
 * ⚠ **`version: 0` MEANS NOTHING HAS EVER BEEN PUBLISHED, AND THE CALLER MUST NOT READ THAT AS AN
 * EMPTY SET.** They are the same bytes and different facts: an org that has published nothing has
 * no answer, and an org that has published an empty set has answered. `01-F77`'s omitted-never-zero
 * rule is the same distinction one layer up. The API's supplier is where that is turned into a
 * refusal rather than an empty report, because refusing is a `00 §5.7` judgement and this service
 * makes none.
 */
export const inventoryReferenceAt = async (db: Db, org_id: string): Promise<InventoryArtifact> => {
  const version = await inventoryVersion(db, org_id);
  if (version === 0) return { version: 0, entries: [] };
  // `distinct on` is the greatest-version-per-key fold in one pass, ordered so the row Postgres
  // keeps is the newest. The tombstone filter is OUTSIDE it, in the enclosing select: filtering
  // inside would make a DELETED row invisible to the fold and resurrect the version beneath it,
  // which is the exact defect `01-F55` names — a delete that reads as "never changed".
  const rows = await db.execute(
    sql`select kind, entry_id, payload, deleted from (
          select distinct on (kind, entry_id) kind, entry_id, payload, deleted
          from kernel.inventory_entries
          where org_id = ${org_id} and version <= ${version}
          order by kind, entry_id, version desc
        ) latest
        where deleted = 0`,
  );
  return {
    version,
    entries: [...rows].map((row) => ({
      kind: String(row.kind) as InventoryKind,
      id: String(row.entry_id),
      payload: (row.payload ?? {}) as Record<string, unknown>,
    })),
  };
};
