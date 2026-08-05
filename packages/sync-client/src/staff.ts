/**
 * Device-side staff registry — reference data, not ledger (`01-F21`, `01-F28`).
 *
 * `01-F28` says role changes "propagate as reference data" and `01-F21` says reference data is
 * versioned and travels "as snapshots + deltas over the same sync channel". So this rides the
 * chain the catalog already rides (`catalog.ts` is the precedent, down to the refusal
 * vocabulary) rather than a second bespoke transport for credentials.
 *
 * Two properties make that safe, and each is a test:
 *
 * - **Nothing here writes an event (`01-F1`).** The ledger is permanent, so a credential hash
 *   that landed in it could never be rotated away. Reference data travels beside the ledger.
 * - **It survives a restart (`00 §5.2`, `01-F28`).** A device that reboots with the WAN down
 *   must still be able to verify a PIN, which means the synced hashes are on disk, not in a
 *   process.
 */

export type StaffAssignment = {
  readonly role: string;
  /** `null` = org-wide. `01-F26` is User × Role × per-LOCATION assignment. */
  readonly branch_id: string | null;
};

/**
 * `01-F26` + `01-F28`. `pin_hash` is the SYNCED Argon2id credential (`hashPin` in `domain`) —
 * never a PIN. `01-F26`'s per-user permission OVERRIDES are deliberately not modelled: no FR
 * states their shape (recorded in `plans/wave-1/identity-and-authorization.md` §7).
 */
export type StaffMember = {
  readonly user_id: string;
  readonly pin_hash: string;
  readonly assignments: readonly StaffAssignment[];
};

/** A full replacement at `version`. */
export type StaffSnapshot = {
  kind: "snapshot";
  version: number;
  members: readonly StaffMember[];
};

/** An incremental change from `from_version` to `version`. */
export type StaffDelta = {
  kind: "delta";
  from_version: number;
  version: number;
  upserts: readonly StaffMember[];
  /**
   * `01-F42` — a revoked user or role stops authorising, so the row is REMOVED, not
   * tombstoned. The catalog keeps tombstones because a reprint must still render a deleted
   * item's name; a let-go cashier has no such document to serve, and `01-F48` makes the
   * failure direction fail-closed.
   */
  removals: readonly string[];
};

export type StaffUpdate = StaffSnapshot | StaffDelta;

/**
 * Why an update was not applied — the catalog's vocabulary (`01-F56`), because it is the same
 * chain. Refusal is a first-class outcome rather than a throw: this arrives off a wire, and
 * `01-F17` makes a stopped till the one unacceptable outcome.
 */
export type StaffApplyResult =
  | { readonly applied: true; readonly version: number }
  | {
      readonly applied: false;
      readonly reason: "stale" | "needs_snapshot" | "malformed";
      readonly version: number;
    };

export type StaffRegistry = {
  version(): number;
  apply(update: StaffUpdate): StaffApplyResult;
  lookup(user_id: string): StaffMember | null;
};

type Db = {
  prepare(sql: string): {
    run(...a: unknown[]): unknown;
    get(...a: unknown[]): unknown;
    all(...a: unknown[]): unknown[];
  };
  transaction<T extends (...a: never[]) => unknown>(fn: T): T;
};

export const STAFF_SCHEMA = `
-- 01-F28: synced credential hashes + role assignments. Reference data, versioned, and
-- deliberately NOT joined to any fold table (01-F52's rule for the catalog holds here for the
-- same reason: a projected value that read identity would depend on sync state at fold time).
CREATE TABLE IF NOT EXISTS staff (
  user_id TEXT PRIMARY KEY,
  json TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS staff_state (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  version INTEGER NOT NULL
) STRICT;
INSERT OR IGNORE INTO staff_state (id, version) VALUES (0, 0);
`;

const isVersion = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const isAssignment = (a: unknown): boolean => {
  if (typeof a !== "object" || a === null) return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.role === "string" &&
    o.role.length > 0 &&
    (o.branch_id === null || typeof o.branch_id === "string")
  );
};

const isMember = (m: unknown): boolean => {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  return (
    typeof o.user_id === "string" &&
    o.user_id.length > 0 &&
    typeof o.pin_hash === "string" &&
    Array.isArray(o.assignments) &&
    o.assignments.every(isAssignment)
  );
};

/**
 * Validate at the boundary, because this is wire input. Hand-written rather than Zod, matching
 * `catalog.ts`: the package has no schema dependency and the shape is small enough that adding
 * one would be the larger change. The rule it enforces is `01-F17` — a shape the device cannot
 * read is a REFUSAL, never an exception unwinding through whatever was serving the till.
 */
const isValidUpdate = (u: unknown): u is StaffUpdate => {
  if (typeof u !== "object" || u === null) return false;
  const o = u as Record<string, unknown>;
  if (!isVersion(o.version)) return false;
  if (o.kind === "snapshot") return Array.isArray(o.members) && o.members.every(isMember);
  if (o.kind === "delta") {
    if (!isVersion(o.from_version)) return false;
    if (!Array.isArray(o.upserts) || !o.upserts.every(isMember)) return false;
    return Array.isArray(o.removals) && o.removals.every((r) => typeof r === "string");
  }
  return false;
};

export const createStaffRegistry = (db: Db): StaffRegistry => {
  const readState = db.prepare("SELECT version FROM staff_state WHERE id = 0");
  const writeState = db.prepare("UPDATE staff_state SET version = ? WHERE id = 0");
  const clearAll = db.prepare("DELETE FROM staff");
  const upsert = db.prepare(
    `INSERT INTO staff (user_id, json) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET json = excluded.json`,
  );
  const remove = db.prepare("DELETE FROM staff WHERE user_id = ?");
  const readOne = db.prepare("SELECT json FROM staff WHERE user_id = ?");

  // `?? 0` rather than a non-null assertion: `version()` runs on every apply, and a missing
  // singleton row must not be the thing that throws on the till's path (01-F17).
  const version = (): number => (readState.get() as { version: number } | undefined)?.version ?? 0;

  const applySnapshot = db.transaction((snap: StaffSnapshot) => {
    clearAll.run();
    for (const m of snap.members) upsert.run(m.user_id, JSON.stringify(m));
    writeState.run(snap.version);
  });

  const applyDelta = db.transaction((d: StaffDelta) => {
    for (const m of d.upserts) upsert.run(m.user_id, JSON.stringify(m));
    for (const user_id of d.removals) remove.run(user_id);
    writeState.run(d.version);
  });

  return {
    version,

    apply: (update) => {
      const held = version();
      // Wire input, validated before anything else touches SQLite. Returning the store's own
      // re-read version, never the caller's — an unvalidated `version` may not be a number.
      if (!isValidUpdate(update)) return { applied: false, reason: "malformed", version: held };

      if (update.kind === "snapshot") {
        // Older is refused, so a user let go at v4 is not resurrected by a replayed v2. A
        // snapshot AT the held version is not older — it is the authoritative full state of
        // that version and the only self-heal this device has (`catalog.ts` reasons the same).
        if (update.version < held) return { applied: false, reason: "stale", version: held };
        applySnapshot(update);
        return { applied: true, version: update.version };
      }

      if (update.version <= held) return { applied: false, reason: "stale", version: held };

      // A delta whose base does not match is REFUSED — applying it would silently diverge this
      // device's roles from every other device's, and the divergence is a CREDENTIAL, not a
      // menu word. Ask for a snapshot instead.
      if (update.from_version !== held) {
        return { applied: false, reason: "needs_snapshot", version: held };
      }

      applyDelta(update);
      return { applied: true, version: update.version };
    },

    lookup: (user_id) => {
      const row = readOne.get(user_id) as { json: string } | undefined;
      if (row === undefined) return null;
      try {
        return JSON.parse(row.json) as StaffMember;
      } catch {
        // `STRICT` constrains the column's TYPE, not the validity of what is in it, so a
        // truncated write is reachable. An unreadable row means that user cannot unlock —
        // never that the whole registry throws (01-F17).
        return null;
      }
    },
  };
};
