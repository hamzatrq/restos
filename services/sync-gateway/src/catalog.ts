import { SELLABLE_KINDS } from "@restos/domain";
import { CatalogEntryWire } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/** The gateway's database handle. Same alias `gateway.ts` uses; kept local so this module
 *  does not import the gateway and create a cycle. */
type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * T-C2 — the server side of the catalog transport (`plans/wave-1/catalog-transport.md`).
 *
 * `01-F52`: catalog is REFERENCE DATA, not ledger. Nothing here writes an event, nothing here
 * is folded, and `catalog.changed` — which doc 14 emits for the back-office history view —
 * plays no part in delivery. A device learns its catalog is stale by comparing versions on
 * `hello_ack` and fetching; it never consumes an announcement. That is what makes this work
 * for a device that has been offline for a week and could not have heard one.
 *
 * The division of labour is the founder's §6 Q1 ruling: **the API publishes, the gateway
 * serves.** Nothing in this file interprets a menu — entries pass through as opaque rows — so
 * the gateway cannot acquire an opinion about menu structure, and `18 §4`'s one-writer rule
 * holds with this service as the writer.
 */

/** One catalog entity as the wire carries it (`sync-protocol`'s `catalog_response.entries`). */
export type CatalogEntry = {
  kind: string;
  id: string;
  name: string;
  kitchen_name?: string | null;
  parent_id?: string | null;
  sort?: number;
  /** `01-F55` — a tombstone, so a reprint of an older order still renders the name. */
  deleted?: boolean;
  /** `01-F60` — integer paisa per `(branch, channel)` pair. */
  prices?: readonly { branch_id: string; channel: string; price_paisa: number }[];
  /** `03-F50` — the kitchen station; absent means inherit from the parent. */
  station?: string | null;
};

export type CatalogPage = {
  form: "snapshot" | "delta";
  version: number;
  base_version?: number;
  entries: CatalogEntry[];
  complete: boolean;
  next_from: number;
};

/**
 * Rows per catalog frame. Small on purpose: a large org's menu will exceed one frame, and a
 * device that has to hold a partial snapshot in memory across pages is a device that can run
 * out of memory mid-recovery on the 2–3 GB reference hardware (`00 §4`).
 */
export const CATALOG_PAGE_SIZE = 500;

const toNumber = (v: unknown): number => Number(v);

const rowToEntry = (row: Record<string, unknown>): CatalogEntry => ({
  kind: String(row.kind),
  id: String(row.entry_id),
  name: String(row.name),
  ...(row.kitchen_name === null ? {} : { kitchen_name: String(row.kitchen_name) }),
  ...(row.parent_id === null ? {} : { parent_id: String(row.parent_id) }),
  ...(row.sort === null ? {} : { sort: toNumber(row.sort) }),
  ...(toNumber(row.deleted) === 1 ? { deleted: true } : {}),
  ...(row.prices === null || row.prices === undefined
    ? {}
    : { prices: row.prices as NonNullable<CatalogEntry["prices"]> }),
  ...(row.station === null || row.station === undefined ? {} : { station: String(row.station) }),
});

/** The org's current authoritative version. `0` means nothing has ever been published. */
export const catalogVersion = async (db: Db, org_id: string): Promise<number> => {
  const rows = await db.execute(
    sql`select coalesce(max(version), 0) as v from kernel.catalog_versions where org_id = ${org_id}`,
  );
  return toNumber([...rows][0]?.v ?? 0);
};

/**
 * Publish a set of changes as the next version. Called by the back office (`14`), never by a
 * device — `01-F52` makes catalog edits a back-office act and this is its one write path.
 *
 * **THE TRANSACTION is the atomicity story — not the statement order.** A reader either sees
 * nothing of version N or sees all of it, because both writes commit together; reversing them
 * would change nothing observable, since statement order inside a transaction is invisible from
 * outside it. An earlier version of this comment credited the ordering, which is a mental model
 * wrong in a load-bearing direction: a future session told "order is what guarantees this" could
 * split the publish into two transactions, preserve the stated invariant and destroy the real
 * one. The entries-then-version order is kept anyway because it is the order that stays correct
 * if this is ever split, not because it is doing the work today.
 *
 * `14-F28`'s day-end timing resolves ABOVE this function, not in it: a pending edit lives in
 * the back office where it can still be cancelled, and only lands here at the `01-F46`
 * boundary. That is why devices only ever see landed versions and need no pending-version
 * concept — the alternative (ship an `effective_at` and let each device apply it) would need a
 * device-side scheduler, a second version axis, a clock read on the application path, and
 * would apply an edit the owner had since cancelled.
 *
 * **THE CALLER HAS LANDED (August 2026), and this used to carry a debt marker naming instance 6 of
 * the wave's named defect** — the catalog transport built and tested at both ends with zero
 * production callers, which is why `apps/pos-electron`'s item grid was empty and the till could
 * sell nothing. `publish-http.ts` reaches this from `buildServer`, and `services/api`'s
 * `CatalogPublisher` port reaches THAT over the `/internal` contract — so an owner's menu edit now
 * travels back office → publish → this writer → `catalogPage` → the till. The marker is deleted
 * rather than amended: `pnpm seams:check` FAILS on a marker whose subject is reached, which is
 * what stops the register rotting.
 */
export const publishCatalog = async (
  db: Db,
  org_id: string,
  entries: readonly CatalogEntry[],
  opts: {
    actor_user_id?: string | null;
    now: number;
    /**
     * `01-F60`'s enabled `(branch, channel)` pairs, as the full cross product `14-F29`'s editor
     * grid presents.
     *
     * **REQUIRED — "not an optional one defaulting to 'check nothing'" (founder ruling July
     * 2026).** Caller-supplied is the DESIGN, not a gap: `00 §7`'s config plane does not exist,
     * so "the caller states the set explicitly, even where that is a constant".
     *
     * An earlier version of this comment called the optional argument "a known gap rather than a
     * design choice" and said absent means "nothing enabled". The founder overruled exactly that:
     * a caller who simply forgot the argument silently received no completeness check at all,
     * "which is precisely the omission this FR refuses a fallback in order to prevent". Absent is
     * now not a legal call — it is refused below, before anything is written.
     */
    enabled: { branches: readonly string[]; channels: readonly string[] };
  },
): Promise<number> => {
  // Ruling B at runtime as well as in the type. The type above is the strong form of "required",
  // but a bulk import (`15-F8`) or an API client reaches this from JavaScript, where a type
  // forbids nothing — so the check is written through a cast, which is the only honest way to ask
  // a question the type says cannot arise. The message names `enabled` because a refusal that
  // does not say what is missing is indistinguishable from a refusal for any other reason.
  if ((opts as { enabled?: unknown }).enabled === undefined) {
    throw new RangeError(
      "publishCatalog: no `enabled` (branch, channel) set was declared. It is a REQUIRED input, " +
        'not an optional one defaulting to "check nothing" (01-F60) — a publish that declares ' +
        "none gets no completeness check, which is the omission the FR refuses a fallback to " +
        "prevent.",
    );
  }
  if (entries.length === 0) {
    throw new RangeError("publishCatalog: an empty change set is not a version (01-F52)");
  }
  /**
   * **VALIDATE AT THE WRITER, against the schema the WIRE will enforce.**
   *
   * This used to store whatever Postgres accepted, which meant the read path was the first
   * thing to apply the rules — and it applied them by throwing inside `dispatch`, where the
   * server closes the socket. One entry with an empty `name` from a bulk import (`15 §42`)
   * therefore put every device in the org into a permanent reconnect loop and took the ledger
   * push path down with it: `hello_ack` kept advertising the version, the device kept asking,
   * the socket kept dying. Not self-healing — a corrective publish leaves any device on the
   * prior version still asking for a delta whose range spans the poisoned one.
   *
   * Refusing here turns an org-wide outage into one failed save with a message. The error names
   * the offending index because a bulk import is exactly where this arrives and "one of your
   * 4,000 rows is bad" is not an actionable answer.
   */
  /**
   * `01-F60` — every enabled `(branch, channel)` cell is priced on every sellable, non-tombstoned
   * entry. **There is deliberately NO FALLBACK to a house price**: a fallback makes a forgotten
   * aggregator price sell at the in-restaurant rate while commission still takes 25–35%, which is
   * invisible at the till, frozen by `01-F53`, and surfaces months later as unattributable thin
   * margin. Refusing here turns that into one failed save with a message.
   *
   * A tombstone is exempt because `01-F55` keeps it resolvable for display and off the sellable
   * grid — requiring a price on a deleted item would make deletion impossible once channels grow.
   */
  const missingCell = (entry: CatalogEntry): string | null => {
    if (!SELLABLE_KINDS.includes(entry.kind) || entry.deleted === true) return null;
    const enabled = opts.enabled;
    // Membership of the CELL, never truthiness of the price: `0` is a price (`01-F60`'s free
    // modifier), and a falsy test would refuse it while letting a forgotten cell sell for nothing.
    const have = new Set((entry.prices ?? []).map((p) => `${p.branch_id}\u0000${p.channel}`));
    for (const branch_id of enabled.branches) {
      for (const channel of enabled.channels) {
        if (!have.has(`${branch_id}\u0000${channel}`))
          return `branch ${branch_id}, channel ${channel}`;
      }
    }
    return null;
  };

  entries.forEach((entry, index) => {
    const cell = missingCell(entry);
    if (cell !== null) {
      throw new RangeError(
        `publishCatalog: entry ${index} (${String(entry.kind)}/${String(entry.id)}) is not ` +
          `sellable — no price for ${cell} (01-F60). Publishing it would put an item on the ` +
          `grid that the counter cannot price, and 01-F53 would freeze whatever it guessed.`,
      );
    }
    const parsed = CatalogEntryWire.safeParse(entry);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path ?? [];
      // Name the offending VALUE, not just its path. A bulk import (`15-F8`) is where these
      // arrive, and "prices.7.channel: invalid option" does not tell an operator which of 4,000
      // rows to fix or what is wrong with it — whereas `dine_in` names the mistake outright
      // (an order TYPE in a channel field, `02-F42`). `01-F60` requires the refusal to name the
      // channel, and this is where a surplus cell gets named at all.
      const at = path.reduce<unknown>(
        (node, key) =>
          typeof node === "object" && node !== null
            ? (node as Record<PropertyKey, unknown>)[key as PropertyKey]
            : undefined,
        entry,
      );
      const shown = at === undefined ? "" : ` (got ${JSON.stringify(at)})`;
      throw new RangeError(
        `publishCatalog: entry ${index} (${String(entry.kind)}/${String(entry.id)}) is not ` +
          `servable — ${path.join(".") || "?"}: ${issue?.message ?? "invalid"}${shown}. ` +
          `Storing it would make every catalog_response for this org unparseable (01-F56).`,
      );
    }
  });
  return db.transaction(async (tx: Db) => {
    // Serialized per org. Two concurrent publishes must not both claim version N and leave two
    // different menus at one number — the hazard the oracle round found on the DEVICE side
    // (A12: two updates at one version diverge silently), which the server is where to prevent.
    //
    // An ADVISORY lock rather than the `FOR UPDATE` idiom `org_sequences` uses, for two
    // reasons. `FOR UPDATE` is illegal with an aggregate, so `max(version)` cannot take one at
    // all; and locking the current max ROW would lock nothing on an org's FIRST publish, which
    // is exactly when two concurrent publishes would both compute version 1. The advisory lock
    // exists whether or not a row does. It is transaction-scoped, so it releases on commit and
    // on rollback without an unlock path to forget.
    //
    // The (org_id, version) primary key is still the real guarantee — a double claim CANNOT
    // commit even if this lock were removed. The lock is here so the loser waits rather than
    // aborting, which matters because the caller is a person saving a menu edit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('restos:catalog:' || ${org_id}))`);
    const current = await tx.execute(
      sql`select coalesce(max(version), 0) as v from kernel.catalog_versions
          where org_id = ${org_id}`,
    );
    const version = toNumber([...current][0]?.v ?? 0) + 1;
    for (const e of entries) {
      await tx.execute(
        sql`insert into kernel.catalog_entries
              (org_id, version, kind, entry_id, name, kitchen_name, parent_id, sort, deleted,
               prices, station)
            values (${org_id}, ${version}, ${e.kind}, ${e.id}, ${e.name},
                    ${e.kitchen_name ?? null}, ${e.parent_id ?? null}, ${e.sort ?? null},
                    ${e.deleted === true ? 1 : 0},
                    ${e.prices === undefined ? null : JSON.stringify(e.prices)}::jsonb,
                    ${e.station ?? null})`,
      );
    }
    // LAST, deliberately — see the note above.
    await tx.execute(
      sql`insert into kernel.catalog_versions (org_id, version, published_at, actor_user_id)
          values (${org_id}, ${version}, ${opts.now}, ${opts.actor_user_id ?? null})`,
    );
    return version;
  });
};

/**
 * Answer a device's `catalog_request`.
 *
 * The server decides snapshot vs delta from `have_version`: a **delta** if it can construct one
 * from that exact base, a **snapshot** otherwise — including `have_version: 0` and including a
 * base whose versions have been compacted away. The device's `needs_snapshot` refusal
 * (`01-F56`) is the belt to these braces: it is what happens if this function gets it wrong,
 * and it is already implemented and tested on the device.
 */
export const catalogPage = async (
  db: Db,
  org_id: string,
  have_version: number,
  from: number,
  /**
   * The version a CONTINUATION page is toward, echoed by the device from page 1. Absent on a
   * first request, where the server picks the current version and tells the device what it is.
   *
   * This is what makes a paged fetch atomic in the version dimension. Without it the current
   * version was re-read per page, so a publish between pages changed both the version and the
   * ordering the offset indexes into — and the device committed a mixture of two menus under
   * one number, permanently (`01-F56`).
   */
  at_version?: number,
): Promise<CatalogPage> => {
  const current = await catalogVersion(db, org_id);
  // Serve the pinned version if the device named one and we still have it. `version <= current`
  // because a device must never be handed a version from the future — after a restore
  // (`22`) the org can legitimately be BEHIND a device, and pinning forward would serve rows
  // that no longer exist.
  const version = at_version !== undefined && at_version <= current ? at_version : current;
  if (version === 0) {
    // Nothing published. An honest empty snapshot rather than a refusal: `01-F54` says an
    // unknown item degrades to its id and never blocks a sale, so a till with no catalog is a
    // working till with unnamed buttons, not a broken one.
    return { form: "snapshot", version: 0, entries: [], complete: true, next_from: 0 };
  }

  // Can a delta be built from EXACTLY this base? Only if that version was published and the
  // device is genuinely behind. A device claiming a version we never published gets a
  // snapshot, which is also what happens to a device from the future after a restore.
  const known =
    have_version > 0 &&
    have_version <= version &&
    [
      ...(await db.execute(
        sql`select 1 from kernel.catalog_versions
            where org_id = ${org_id} and version = ${have_version}`,
      )),
    ].length > 0;

  if (known && have_version === version) {
    return {
      form: "delta",
      version,
      base_version: have_version,
      entries: [],
      complete: true,
      next_from: 0,
    };
  }

  if (known) {
    // DELTA — every change strictly after the device's base. Ordered by version so a paged
    // delta applies in publication order, which is what makes a partial page safe to apply.
    const rows = await db.execute(
      sql`select kind, entry_id, name, kitchen_name, parent_id, sort, deleted, prices, station
          from kernel.catalog_entries
          where org_id = ${org_id} and version > ${have_version} and version <= ${version}
          order by version asc, kind asc, entry_id asc
          offset ${from} limit ${CATALOG_PAGE_SIZE + 1}`,
    );
    const fetched = [...rows];
    const page = fetched.slice(0, CATALOG_PAGE_SIZE);
    const complete = fetched.length <= CATALOG_PAGE_SIZE;
    return {
      form: "delta",
      version,
      base_version: have_version,
      entries: page.map(rowToEntry),
      complete,
      next_from: complete ? 0 : from + page.length,
    };
  }

  // SNAPSHOT — the fold: the greatest version <= `version` per (kind, entry_id). Tombstones are
  // INCLUDED (`01-F55`): a snapshot that dropped them would delete the device's record of a
  // deleted item's name, and the reprint of an earlier order would render a raw id. That is the
  // exact defect the oracle round found on the device side, and it is fixed by carrying them
  // rather than by the device inferring them.
  const rows = await db.execute(
    sql`select kind, entry_id, name, kitchen_name, parent_id, sort, deleted, prices, station from (
          select distinct on (kind, entry_id)
                 kind, entry_id, name, kitchen_name, parent_id, sort, deleted, prices, station
          from kernel.catalog_entries
          where org_id = ${org_id} and version <= ${version}
          order by kind asc, entry_id asc, version desc
        ) folded
        order by kind asc, entry_id asc
        offset ${from} limit ${CATALOG_PAGE_SIZE + 1}`,
  );
  const fetched = [...rows];
  const page = fetched.slice(0, CATALOG_PAGE_SIZE);
  const complete = fetched.length <= CATALOG_PAGE_SIZE;
  return {
    form: "snapshot",
    version,
    entries: page.map(rowToEntry),
    complete,
    next_from: complete ? 0 : from + page.length,
  };
};
