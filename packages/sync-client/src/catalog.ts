/**
 * Device-side catalog — reference data, not ledger (`01-F21`, `01-F52`..`01-F56`).
 *
 * The catalog arrives as versioned snapshots and deltas over the sync channel and supplies
 * **display text only**. Three properties make that safe, and each is a test below:
 *
 * - **Money never depends on catalog sync (`01-F53`).** A line's `unit_price_paisa` is
 *   captured into the event when the line is added, so a stale or absent catalog still bills
 *   correctly. Only a word is lost.
 * - **Catalog is never an input to a fold (`01-F52`).** A projected value that read a name
 *   would depend on catalog sync state at fold time — the `01-F34` break law 1 exists to
 *   prevent. Nothing here is called from `folds/`.
 * - **Deletion is a tombstone (`01-F55`).** An open order or a reprint may reference an item
 *   deleted minutes ago and must still render its name.
 */

export type CatalogKind = "category" | "item" | "variant" | "modifier_group" | "modifier";

export type CatalogEntry = {
  kind: CatalogKind;
  id: string;
  name: string;
  /** 03-F38 — a short kitchen name, so long item names stop being a KOT layout problem. */
  kitchen_name?: string | null;
  parent_id?: string | null;
  /** Display order within its parent. NOT a price — money lives in events (01-F53). */
  sort?: number;
};

/** A full replacement at `version` (`01-F56`). */
export type CatalogSnapshot = {
  kind: "snapshot";
  version: number;
  entries: readonly CatalogEntry[];
};

/** An incremental change from `from_version` to `version` (`01-F56`). */
export type CatalogDelta = {
  kind: "delta";
  from_version: number;
  version: number;
  upserts: readonly CatalogEntry[];
  /** Tombstoned, never removed (`01-F55`). */
  deletes: readonly { kind: CatalogKind; id: string }[];
};

export type CatalogUpdate = CatalogSnapshot | CatalogDelta;

/**
 * Why an update was not applied. Refusal is a first-class outcome rather than a throw: an
 * out-of-order delta is an ordinary consequence of a lossy link, and `01-F17` means it must
 * never take the till down. `needs_snapshot` is the device asking for a full resync.
 */
export type CatalogApplyResult =
  | { applied: true; version: number }
  | { applied: false; reason: "stale"; version: number }
  | { applied: false; reason: "needs_snapshot"; version: number };

export type CatalogStore = {
  version(): number;
  apply(update: CatalogUpdate): CatalogApplyResult;
  /** Resolve for DISPLAY. Returns tombstoned entries too — see 01-F55. */
  lookup(kind: CatalogKind, id: string): CatalogEntry | null;
  /** The grid's source: live entries of a kind, in display order. Excludes tombstones. */
  list(kind: CatalogKind, parent_id?: string | null): CatalogEntry[];
};

type Row = { kind: string; id: string; json: string; deleted: number; sort: number };

type Db = {
  prepare(sql: string): {
    run(...a: unknown[]): unknown;
    get(...a: unknown[]): unknown;
    all(...a: unknown[]): unknown[];
  };
  transaction<T extends (...a: never[]) => unknown>(fn: T): T;
};

export const CATALOG_SCHEMA = `
-- 01-F52: reference data, org-scoped, versioned. Deliberately NOT joined to any fold table.
CREATE TABLE IF NOT EXISTS catalog (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  -- 01-F55: a tombstone, never a row removal. A deleted item must stay resolvable by id so
  -- an open order or a reprint can still render its name.
  deleted INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, id)
) STRICT;
CREATE TABLE IF NOT EXISTS catalog_state (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  version INTEGER NOT NULL
) STRICT;
INSERT OR IGNORE INTO catalog_state (id, version) VALUES (0, 0);
`;

export const createCatalogStore = (db: Db): CatalogStore => {
  const readVersion = db.prepare("SELECT version FROM catalog_state WHERE id = 0");
  const writeVersion = db.prepare("UPDATE catalog_state SET version = ? WHERE id = 0");
  const clearAll = db.prepare("DELETE FROM catalog");
  const upsert = db.prepare(
    `INSERT INTO catalog (kind, id, json, deleted, sort) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json, deleted = 0, sort = excluded.sort`,
  );
  const tombstone = db.prepare("UPDATE catalog SET deleted = 1 WHERE kind = ? AND id = ?");
  const readOne = db.prepare(
    "SELECT kind, id, json, deleted, sort FROM catalog WHERE kind = ? AND id = ?",
  );
  const readKind = db.prepare(
    "SELECT kind, id, json, deleted, sort FROM catalog WHERE kind = ? AND deleted = 0 ORDER BY sort, id",
  );

  const version = (): number => (readVersion.get() as { version: number }).version;
  const decode = (r: Row): CatalogEntry => JSON.parse(r.json) as CatalogEntry;

  const applySnapshot = db.transaction((snap: CatalogSnapshot) => {
    clearAll.run();
    for (const e of snap.entries) upsert.run(e.kind, e.id, JSON.stringify(e), e.sort ?? 0);
    writeVersion.run(snap.version);
  });

  const applyDelta = db.transaction((d: CatalogDelta) => {
    for (const e of d.upserts) upsert.run(e.kind, e.id, JSON.stringify(e), e.sort ?? 0);
    for (const t of d.deletes) tombstone.run(t.kind, t.id);
    writeVersion.run(d.version);
  });

  return {
    version,

    apply: (update) => {
      const current = version();
      // 01-F56: never apply backwards. An older update than we hold is ignored, not merged —
      // merging it would resurrect entries the org already removed.
      if (update.version <= current) return { applied: false, reason: "stale", version: current };

      if (update.kind === "snapshot") {
        applySnapshot(update);
        return { applied: true, version: update.version };
      }

      // 01-F56: a delta whose base does not match is REFUSED. Applying it would silently
      // diverge this device's menu from every other device's — undetectable at the till, and
      // surfacing days later as a mispriced or misnamed item. Ask for a snapshot instead.
      if (update.from_version !== current) {
        return { applied: false, reason: "needs_snapshot", version: current };
      }

      applyDelta(update);
      return { applied: true, version: update.version };
    },

    // 01-F55: tombstones ARE returned here. This is the reprint and open-order path.
    lookup: (kind, id) => {
      const row = readOne.get(kind, id) as Row | undefined;
      return row ? decode(row) : null;
    },

    list: (kind, parent_id) => {
      const rows = (readKind.all(kind) as Row[]).map(decode);
      return parent_id === undefined
        ? rows
        : rows.filter((e) => (e.parent_id ?? null) === parent_id);
    },
  };
};
