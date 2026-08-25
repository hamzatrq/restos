// `01-F87`'s `config` artifact ON THIS DEVICE — the fourth `01-F75` resource, stored, versioned
// and resolved with `00 §7` (e)'s source.
//
// Owning specs: `01-F87` (the carrier and the fold ban), `01-F56` (monotone apply, the four
// refusals, divergence detection), `01-F75`/`01-F76` (the frames and the artifact key), `00 §7`
// (b)/(d)/(e). Per-key schemas and defaults live in `@restos/domain/config` and are declared
// there once (`18 §2`/`18 §4`).
//
// ── ONE ROW, NOT A TABLE PER KEY, AND THE REASON IS `01-F87` (b)'s REFUSAL ────────────────────
//
// The catalog's store keeps a row per entry because a menu is thousands of rows and a device
// resolves one at a time. This artifact is *"a handful of scalars and two small tables"*
// (`01-F87`), and its apply semantics are all-or-nothing by FR: **a malformed known key refuses
// the WHOLE artifact.** Storing it as one JSON blob makes that atomicity the storage shape rather
// than a transaction someone must remember to open, and makes "which version is this" and "what
// does it contain" a single read on the till's money path.
//
// ── WHAT THIS FILE DOES NOT DO ────────────────────────────────────────────────────────────────
//
// It does not resolve a value for anybody. `resolve()` hands back `@restos/domain/config`'s
// `Resolved<T>` — value plus source — and every caller is a RENDER-TIME or ACT-TIME reader.
// **No fold may reach it**: `packages/sync-client/src/folds/` imports `@restos/domain` and this
// module lives behind `@restos/domain/config`, `merge.ts` lists `config.changed` in
// `NON_FOLD_TYPES` so a fold arm for the event is a compile error, and
// `__acceptance__/fold-config-ban.test.ts` asserts both halves. See `config.ts`'s header in
// `packages/domain` for which class that closes and which it does not.

import { canonicalJson } from "@restos/domain";
import {
  type ConfigArtifact,
  type ConfigEntry,
  type ConfigKey,
  type ConfigValue,
  configKeysOnDefault,
  EMPTY_CONFIG,
  parseConfigArtifact,
  type Resolved,
  resolveConfig,
} from "@restos/domain/config";

/** Minimal better-sqlite3 surface, as the sibling stores declare it. */
type Stmt = {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown;
};
type Db = {
  prepare(sql: string): Stmt;
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
};

/** A full replacement of what the org has configured (`01-F75`: a snapshot REPLACES). */
export type ConfigSnapshot = {
  kind: "snapshot";
  version: number;
  entries: readonly ConfigEntry[];
};

/** An incremental change from `from_version` to `version` (`01-F56`). */
export type ConfigDelta = {
  kind: "delta";
  from_version: number;
  version: number;
  /** One row per CHANGED key — a `deleted` row is a reset to the declared default. */
  entries: readonly ConfigEntry[];
};

export type ConfigUpdate = ConfigSnapshot | ConfigDelta;

/**
 * Why an update was not applied — `01-F56`'s vocabulary, unchanged across resources so a fleet
 * dashboard needs one word per condition rather than one per artifact.
 *
 * `malformed` carries the KEY, which the catalog's equivalent has no analogue for: `01-F87` (b)
 * makes the refusal cover the whole artifact, so *"one of your settings is bad"* would leave an
 * owner nothing to fix, and `01-F56` requires the refusal to be observable in device health.
 */
export type ConfigApplyResult =
  | { applied: true; version: number }
  | { applied: false; reason: "stale"; version: number }
  | { applied: false; reason: "needs_snapshot"; version: number }
  | { applied: false; reason: "malformed"; version: number; key: string; detail: string }
  | { applied: false; reason: "divergent"; version: number };

export type ConfigStore = {
  version(): number;
  apply(update: ConfigUpdate): ConfigApplyResult;
  /**
   * `00 §7` (e) — the value AND where it came from. The only read this store offers, because a
   * caller that could get a bare value could not satisfy (e).
   */
  resolve<K extends ConfigKey>(key: K): Resolved<ConfigValue<K>>;
  /** `00 §7` (e)'s health minimum: every key still on its declared default. */
  keysOnDefault(): readonly ConfigKey[];
  /**
   * Keys the CLOUD sent that this build does not know — `01-F87` (b) ignores them, and this is
   * where health can say so. A non-empty list means the cloud is ahead of this device's build,
   * which is a fact an operator can act on (update the till) and a silent ignore is not.
   */
  unknownKeys(): readonly string[];
};

export const CONFIG_SCHEMA = `
-- 01-F87: the fourth 01-F75 reference-data resource. ORG-scoped, versioned, and deliberately
-- NOT joined to any fold table — 01-F34/01-F87 forbid a fold reading configuration for any key,
-- and a join is how that ban would be broken without anyone naming it.
--
-- ONE row, because 01-F87 (b) makes a malformed known key refuse the WHOLE artifact: the
-- all-or-nothing apply is the storage shape rather than a transaction discipline.
CREATE TABLE IF NOT EXISTS config_state (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  version INTEGER NOT NULL,
  -- The configured entries as they arrived, canonical JSON. Re-parsed through
  -- @restos/domain/config on every read rather than trusted: this crossed a wire once and the
  -- schemas that validated it can change with a build.
  entries TEXT NOT NULL DEFAULT '[]',
  -- 01-F56 divergence detection, exactly as catalog_state carries it: a version number is a
  -- claim about CONTENT, so the device records the transition that produced the one it holds.
  -- Without it, "I already applied that" and "someone else's version N" are the same
  -- observation — which on THIS artifact is two tills charging different tax at one number.
  last_kind TEXT NOT NULL DEFAULT '',
  last_from INTEGER,
  last_form TEXT NOT NULL DEFAULT ''
) STRICT;
INSERT OR IGNORE INTO config_state (id, version) VALUES (0, 0);
`;

const isVersion = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const isEntry = (e: unknown): e is ConfigEntry => {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  if (typeof o.key !== "string" || o.key.length === 0) return false;
  if (o.deleted !== undefined && typeof o.deleted !== "boolean") return false;
  return true;
};

/**
 * Validate the ENVELOPE at the boundary — hand-written, as the sibling stores are, because this
 * package carries no schema dependency and the per-KEY validation is `@restos/domain/config`'s.
 *
 * `01-F17`: a shape this device cannot read is a REFUSAL, never an exception unwinding through
 * whatever was serving the till.
 */
const isValidUpdate = (u: unknown): u is ConfigUpdate => {
  if (typeof u !== "object" || u === null) return false;
  const o = u as Record<string, unknown>;
  if (!isVersion(o.version)) return false;
  if (!Array.isArray(o.entries) || !o.entries.every(isEntry)) return false;
  if (o.kind === "snapshot") return true;
  return o.kind === "delta" && isVersion(o.from_version);
};

type Row = {
  version: number;
  entries: string;
  last_kind: string;
  last_from: number | null;
  last_form: string;
};

const EMPTY_ROW: Row = { version: 0, entries: "[]", last_kind: "", last_from: null, last_form: "" };

export const createConfigStore = (db: Db): ConfigStore => {
  const readState = db.prepare(
    "SELECT version, entries, last_kind, last_from, last_form FROM config_state WHERE id = 0",
  );
  const writeState = db.prepare(
    "UPDATE config_state SET version = ?, entries = ?, last_kind = ?, last_from = ?, last_form = ? WHERE id = 0",
  );

  // `?? EMPTY_ROW` rather than a non-null assertion: `version()` runs on every apply and on the
  // till's money path, and a missing singleton row must not be the thing that throws (`01-F17`).
  const row = (): Row => (readState.get() as Row | undefined) ?? EMPTY_ROW;

  /**
   * The stored rows, as rows. `[]` for anything unparseable — `STRICT` constrains the column's
   * TYPE and not the validity of what is in it, so a truncated write is reachable, and it must
   * degrade to *"nothing configured"* rather than throw. That degradation is exactly the state
   * `01-F87` (b) already specifies for and calls survivable: every key on its declared default.
   */
  const storedEntries = (): readonly ConfigEntry[] => {
    try {
      const parsed: unknown = JSON.parse(row().entries);
      return Array.isArray(parsed) && parsed.every(isEntry) ? (parsed as ConfigEntry[]) : [];
    } catch {
      return [];
    }
  };

  /**
   * The held artifact, re-derived per read.
   *
   * **Re-parsed rather than memoized, and that is the same rule `tax-posture.ts` states for the
   * seam this replaces:** a value captured once at construction is a value that disagrees with the
   * artifact the cloud has since delivered, and this store is written to by a live socket. The
   * cost is one `JSON.parse` and five `safeParse`s over a handful of scalars, on a path that
   * already reads SQLite.
   */
  const held = (): ConfigArtifact => {
    const current = row();
    const parsed = parseConfigArtifact(current.version, storedEntries());
    // A refusal cannot arise from STORED bytes on the happy path — `apply` refuses before writing
    // — but a build whose schemas narrowed since the write can produce one, and the honest answer
    // is `01-F87` (b)'s: fall back to declared defaults rather than serve a value no current
    // schema accepts. It is the same disposition the wire path takes, for the same reason.
    return parsed.ok ? parsed.artifact : EMPTY_CONFIG;
  };

  const commit = db.transaction((update: ConfigUpdate, entries: readonly ConfigEntry[]) => {
    writeState.run(
      update.version,
      JSON.stringify(entries),
      update.kind,
      update.kind === "delta" ? update.from_version : null,
      update.kind === "delta" ? canonicalJson(update) : "",
    );
  });

  /** Divergence proved: the device stops claiming a version it cannot stand behind. */
  const invalidate = db.transaction(() => {
    writeState.run(0, "[]", "", null, "");
  });

  /**
   * A delta's rows folded onto what is held. One row per changed key, so a key absent from the
   * delta is UNCHANGED — which is why a reset has to travel as a marked row (`01-F75`) and cannot
   * be an omission.
   */
  const merge = (
    base: readonly ConfigEntry[],
    incoming: readonly ConfigEntry[],
  ): readonly ConfigEntry[] => {
    const byKey = new Map<string, ConfigEntry>(base.map((e) => [e.key, e]));
    for (const entry of incoming) {
      // A marked row REMOVES the configured value — the key returns to its declared default, and
      // storing the mark would make `configKeysOnDefault` report it as configured.
      if (entry.deleted === true) byKey.delete(entry.key);
      else byKey.set(entry.key, entry);
    }
    // Sorted so two devices that reached one version by different routes (a snapshot here, a
    // delta there) store byte-identical rows — `01-F56`'s divergence check compares content, and
    // insertion order is not content.
    return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };

  return {
    version: () => row().version,

    resolve: <K extends ConfigKey>(key: K) => resolveConfig(held(), key),

    keysOnDefault: () => configKeysOnDefault(held()),

    unknownKeys: () => {
      const parsed = parseConfigArtifact(row().version, storedEntries());
      return parsed.ok ? parsed.ignored : [];
    },

    apply: (update) => {
      const current = row();
      // Wire input, validated before anything else touches SQLite. Returning the store's own
      // re-read version, never the caller's — an unvalidated `version` may not be a number.
      if (!isValidUpdate(update)) {
        return {
          applied: false,
          reason: "malformed",
          version: current.version,
          key: "",
          detail: "01-F75: the update is not a config snapshot or delta",
        };
      }

      const next =
        update.kind === "snapshot"
          ? // A snapshot REPLACES (`01-F75`). It is still merged through the same function so a
            // marked row in a snapshot means the same thing it means in a delta.
            merge([], update.entries)
          : merge(storedEntries(), update.entries);

      /**
       * `01-F87` (b) — **VALIDATE BEFORE COMMITTING, and refuse the WHOLE artifact on one
       * malformed known key.** This is the one place that rule executes on a device, and it runs
       * against `@restos/domain/config`'s declarations, which is also what the writer refuses
       * against (`14-F48`: one declaration, no client-side copy).
       *
       * ⚠ **The validation is over the MERGED result and not over the incoming rows**, which
       * matters only for a delta and matters absolutely there: a delta carrying a valid row for
       * one key can only be judged against what the device already holds for the others, and
       * validating the incoming rows alone would commit a base the device has never re-checked.
       */
      const parsed = parseConfigArtifact(update.version, next);
      if (!parsed.ok) {
        return {
          applied: false,
          reason: "malformed",
          version: current.version,
          key: parsed.key,
          detail: parsed.detail,
        };
      }

      if (update.kind === "snapshot") {
        // `01-F56` refuses what is OLDER. A snapshot at the HELD version is not older — it is the
        // authoritative full state of that version and the only self-heal this device has.
        // Refusing it would leave a device that is wrong at N wrong until the org next edits a
        // setting, while `version()` keeps reporting a number that looks correct.
        if (update.version < current.version) {
          return { applied: false, reason: "stale", version: current.version };
        }
        commit(update, next);
        return { applied: true, version: update.version };
      }

      if (update.version < current.version) {
        return { applied: false, reason: "stale", version: current.version };
      }

      if (update.version === current.version) {
        // A COMPETITOR: same base, same target, different content. Not a replay — proof that the
        // version number means one thing here and another at the sender, which on THIS artifact
        // is two tills charging different tax at one version number. Refusal alone cannot fix it
        // (both sit at N holding different settings, each having refused the other as a
        // duplicate), so the device drops to 0 — every key back on its declared default, still
        // trading (`01-F87` (b), `01-F17`) — until a snapshot re-establishes what N means.
        const form = canonicalJson(update);
        if (
          current.last_kind === "delta" &&
          current.last_from === update.from_version &&
          current.last_form !== form
        ) {
          invalidate();
          return { applied: false, reason: "divergent", version: 0 };
        }
        return { applied: false, reason: "stale", version: current.version };
      }

      // `01-F56`: a delta whose base does not match is REFUSED. Applying it would silently diverge
      // this device's rates from every other device's — undetectable at the till, and surfacing as
      // a legal exposure (`16-F27`) or an unapproved paid-out (`05-F19`).
      if (update.from_version !== current.version) {
        return { applied: false, reason: "needs_snapshot", version: current.version };
      }

      commit(update, next);
      return { applied: true, version: update.version };
    },
  };
};
