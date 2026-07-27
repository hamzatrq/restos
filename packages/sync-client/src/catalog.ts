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

import { canonicalJson } from "@restos/domain";

export type CatalogKind = "category" | "item" | "variant" | "modifier_group" | "modifier";

/** An entry named by identity alone — a delete, or a snapshot's tombstone list. */
export type CatalogRef = { kind: CatalogKind; id: string };

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
  /**
   * `01-F55` — which of `entries` are deleted. Deleted entries still TRAVEL in `entries`,
   * because a device that resynced from scratch has never held them and must still be able
   * to render the name on an open bill or a reprint; naming them here is what keeps them off
   * the sellable grid. So a tombstone here wins over the same id in `entries`.
   *
   * Optional: a snapshot from an org that has deleted nothing carries no list.
   */
  tombstones?: readonly CatalogRef[];
};

/** An incremental change from `from_version` to `version` (`01-F56`). */
export type CatalogDelta = {
  kind: "delta";
  from_version: number;
  version: number;
  upserts: readonly CatalogEntry[];
  /** Tombstoned, never removed (`01-F55`). */
  deletes: readonly CatalogRef[];
};

export type CatalogUpdate = CatalogSnapshot | CatalogDelta;

/**
 * Why an update was not applied. Refusal is a first-class outcome rather than a throw: an
 * out-of-order delta is an ordinary consequence of a lossy link, and `01-F17` means it must
 * never take the till down. Four causes, kept distinct because they need different responses
 * and `01-F56` makes refusal observable in device health (`15`) like any other blocked cursor:
 *
 * - `stale` — older than we hold, or a byte-identical replay. Ignore it.
 * - `needs_snapshot` — a delta whose base we do not have. Ask for a full resync.
 * - `malformed` — a shape we cannot read. NEVER a throw: this arrives off a wire, and
 *   `01-F17` makes a stopped till the one unacceptable outcome.
 * - `divergent` — proof that this device and the sender disagree about what a version MEANS.
 *   The device drops to version 0 and holds nothing until a snapshot lands.
 */
export type CatalogApplyResult =
  | { applied: true; version: number }
  | { applied: false; reason: "stale"; version: number }
  | { applied: false; reason: "needs_snapshot"; version: number }
  | { applied: false; reason: "malformed"; version: number }
  | { applied: false; reason: "divergent"; version: number };

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
  version INTEGER NOT NULL,
  -- 01-F56 divergence detection. A version number is a claim about CONTENT, so the device
  -- records the transition that produced the one it holds: two different updates for the
  -- same transition are proof that this device and the sender disagree about what the
  -- version means. Without this, "I already applied that" and "someone else's version N"
  -- are the same observation — which is exactly the state 01-F56 calls undetectable at the
  -- till. The ledger already draws this distinction one file over (DivergentDuplicateError).
  last_kind TEXT NOT NULL DEFAULT '',
  last_from INTEGER,
  last_form TEXT NOT NULL DEFAULT ''
) STRICT;
INSERT OR IGNORE INTO catalog_state (id, version) VALUES (0, 0);
`;

const CATALOG_KINDS: ReadonlySet<string> = new Set([
  "category",
  "item",
  "variant",
  "modifier_group",
  "modifier",
]);

const isVersion = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const isRef = (r: unknown): boolean => {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.kind === "string" && CATALOG_KINDS.has(o.kind) && typeof o.id === "string";
};

const isOptionalString = (v: unknown): boolean =>
  v === undefined || v === null || typeof v === "string";

const isEntry = (e: unknown): boolean => {
  if (!isRef(e)) return false;
  const o = e as Record<string, unknown>;
  if (typeof o.name !== "string") return false;
  if (o.sort !== undefined && !(typeof o.sort === "number" && Number.isSafeInteger(o.sort)))
    return false;
  return isOptionalString(o.parent_id) && isOptionalString(o.kitchen_name);
};

/**
 * Validate at the boundary, because this is wire input. Hand-written rather than Zod: the
 * package has no schema dependency, and the shape is small enough that a schema would be
 * the larger change. The rule this enforces is `01-F17` — a shape the device cannot read is
 * a REFUSAL, never an exception unwinding through whatever was serving the till.
 */
const isValidUpdate = (u: unknown): u is CatalogUpdate => {
  if (typeof u !== "object" || u === null) return false;
  const o = u as Record<string, unknown>;
  if (!isVersion(o.version)) return false;
  if (o.kind === "snapshot") {
    if (!Array.isArray(o.entries) || !o.entries.every(isEntry)) return false;
    if (o.tombstones !== undefined && (!Array.isArray(o.tombstones) || !o.tombstones.every(isRef)))
      return false;
    return true;
  }
  if (o.kind === "delta") {
    if (!isVersion(o.from_version)) return false;
    if (!Array.isArray(o.upserts) || !o.upserts.every(isEntry)) return false;
    return Array.isArray(o.deletes) && o.deletes.every(isRef);
  }
  return false;
};

export const createCatalogStore = (db: Db): CatalogStore => {
  const readState = db.prepare(
    "SELECT version, last_kind, last_from, last_form FROM catalog_state WHERE id = 0",
  );
  const writeState = db.prepare(
    "UPDATE catalog_state SET version = ?, last_kind = ?, last_from = ?, last_form = ? WHERE id = 0",
  );
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

  type State = {
    version: number;
    last_kind: string;
    last_from: number | null;
    last_form: string;
  };
  const EMPTY: State = { version: 0, last_kind: "", last_from: null, last_form: "" };
  // `?? EMPTY` rather than a non-null assertion: `version()` runs on every apply, and a
  // missing singleton row must not be the thing that throws on the till's path (01-F17).
  const state = (): State => (readState.get() as State | undefined) ?? EMPTY;
  const version = (): number => state().version;

  /**
   * `null` for a row whose JSON will not parse. `STRICT` constrains the column's TYPE, not
   * the validity of what is in it — a truncated write still satisfies `TEXT NOT NULL` — so
   * this is reachable, and it must degrade. `01-F54`: a screen that refuses to render
   * because one item is unreadable is a stopped till, and the blast radius of an unguarded
   * parse here is every healthy sibling in the same `list()`.
   */
  const decode = (r: Row): CatalogEntry | null => {
    try {
      return JSON.parse(r.json) as CatalogEntry;
    } catch {
      return null;
    }
  };

  const applySnapshot = db.transaction((snap: CatalogSnapshot) => {
    clearAll.run();
    for (const e of snap.entries) upsert.run(e.kind, e.id, JSON.stringify(e), e.sort ?? 0);
    // AFTER the upserts, so a tombstoned id that also travels in `entries` keeps its name
    // and loses its place on the grid. Order is the whole mechanism (01-F55).
    for (const t of snap.tombstones ?? []) tombstone.run(t.kind, t.id);
    writeState.run(snap.version, "snapshot", null, "");
  });

  const applyDelta = db.transaction((d: CatalogDelta, form: string) => {
    for (const e of d.upserts) upsert.run(e.kind, e.id, JSON.stringify(e), e.sort ?? 0);
    for (const t of d.deletes) tombstone.run(t.kind, t.id);
    writeState.run(d.version, "delta", d.from_version, form);
  });

  /** Divergence proved: the device stops claiming a version it cannot stand behind. */
  const invalidate = db.transaction(() => {
    clearAll.run();
    writeState.run(0, "", null, "");
  });

  return {
    version,

    apply: (update) => {
      const s = state();
      // Wire input, validated before anything else touches SQLite. Returning the store's own
      // re-read version, never the caller's — an unvalidated `version` may not be a number.
      if (!isValidUpdate(update)) {
        return { applied: false, reason: "malformed", version: s.version };
      }

      if (update.kind === "snapshot") {
        // 01-F56 refuses what is OLDER. A snapshot at the HELD version is not older — it is
        // the authoritative full state of that version, and it is the only self-heal this
        // device has. Refusing it leaves a device that is wrong at N wrong until the org
        // next edits the menu, while version() keeps reporting a number that looks correct.
        if (update.version < s.version) {
          return { applied: false, reason: "stale", version: s.version };
        }
        applySnapshot(update);
        return { applied: true, version: update.version };
      }

      if (update.version < s.version) {
        return { applied: false, reason: "stale", version: s.version };
      }

      if (update.version === s.version) {
        // A COMPETITOR: same base, same target, different content. That is not a replay —
        // it is proof that the version number means one thing here and another at the
        // sender. Refusal alone cannot fix it (both devices would sit at N holding different
        // menus, each having refused the other's update as a duplicate), so the device drops
        // to 0 and holds nothing until a snapshot re-establishes what N means.
        const form = canonicalJson(update);
        if (
          s.last_kind === "delta" &&
          s.last_from === update.from_version &&
          s.last_form !== form
        ) {
          invalidate();
          return { applied: false, reason: "divergent", version: 0 };
        }
        return { applied: false, reason: "stale", version: s.version };
      }

      // 01-F56: a delta whose base does not match is REFUSED. Applying it would silently
      // diverge this device's menu from every other device's — undetectable at the till, and
      // surfacing days later as a mispriced or misnamed item. Ask for a snapshot instead.
      if (update.from_version !== s.version) {
        return { applied: false, reason: "needs_snapshot", version: s.version };
      }

      applyDelta(update, canonicalJson(update));
      return { applied: true, version: update.version };
    },

    // 01-F55: tombstones ARE returned here. This is the reprint and open-order path.
    lookup: (kind, id) => {
      const row = readOne.get(kind, id) as Row | undefined;
      return row ? decode(row) : null;
    },

    list: (kind, parent_id) => {
      const rows = (readKind.all(kind) as Row[])
        .map(decode)
        .filter((e): e is CatalogEntry => e !== null);
      return parent_id === undefined
        ? rows
        : rows.filter((e) => (e.parent_id ?? null) === parent_id);
    },
  };
};
