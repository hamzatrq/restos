/**
 * # `01-F74` — the branch roster: the device-side trust anchor for LAN admission
 *
 * `01-F72` makes the branch LAN a mutually authenticated channel; this is the half that says
 * **who may be admitted**. A peer presents a certificate, the transport hashes its DER, and this
 * store answers with an identity or with `null`. There is no third answer and no default.
 *
 * ## Why it is a TABLE and not a `Set`
 *
 * It replaces `isRevokedPeer` — an in-memory `Set` populated from cloud refusals the process
 * happened to observe. That set died with the process, so a restarted hub re-admitted every
 * revoked device on the branch: `01-F48`'s fail-closed rule inverted by its own cache, in the
 * direction that grants access. Durability is therefore not a nice-to-have here, it is the
 * defect being fixed (`01-F2`, `00 §5.2`), and the acceptance suite reopens the file to prove it.
 *
 * The inversion is also why this is a POSITIVE list. A cache of refusals is only ever as complete
 * as what one process saw; an allow-list is complete by construction, and the failure direction of
 * an incomplete allow-list is refusal (`01-F48` fail-closed) rather than admission.
 *
 * ## Reference data, on `01-F52`'s exact pattern
 *
 * Versioned snapshots and deltas over the same sync channel the catalog and `staff.ts` ride, with
 * the same refusal vocabulary (`01-F56`) — deliberately one chain, not a third bespoke one for
 * credentials. And, for `01-F52`'s reason: **nothing here is an input to any fold.** A projected
 * value that read admission state would depend on roster sync state at fold time, which is the
 * `01-F34` break law 1 exists to prevent.
 *
 * ## ⚠ THIS STORE IS NOT THE SIGNATURE CHECK, AND MUST NOT BE READ AS ONE
 *
 * `01-F74` (a) has the cloud SIGN the roster, and (d) makes an update whose signature does not
 * verify *unreadable* — a refusal. That check belongs to the arrival path, not to storage: the
 * reason a signature exists at all is that a hub relays reference data to WAN-less followers
 * (`01-F13`, `DEC-SYNC-009`), so the hub must be unable to forge one, and the place to establish
 * that is where the bytes arrive. This module's contract is *given an update you have decided to
 * believe, hold it correctly and answer admission from it*. Stating the boundary rather than
 * implying it, because a comment promising a protection that lives elsewhere is how a shipped
 * comment retires the assertion somebody would otherwise write.
 *
 * ## `device_class` lives here rather than in the certificate (`01-F73` (b))
 *
 * Class decides hub eligibility (`01-F39`) and changes when a device is re-purposed. A certificate
 * is a long-lived credential, so carrying class there would mean re-issuing a credential to change
 * a role — and would put one fact in two places. The certificate answers *who*; this answers
 * *what it may do*.
 */

/** Minimal SQLite surface — the shape `staff.ts` and `catalog.ts` already take. */
type Db = {
  prepare(sql: string): {
    run(...a: unknown[]): unknown;
    get(...a: unknown[]): unknown;
    all(...a: unknown[]): unknown[];
  };
  transaction<T extends (...a: never[]) => unknown>(fn: T): T;
};

export type RosterEntry = {
  readonly device_id: string;
  /**
   * A `01-F39` device class. Validated as non-empty text and **not** against the shipped
   * `DEVICE_CLASSES` vocabulary, which is a deliberate choice in the fail-soft direction: a
   * device running an older build must not refuse its whole branch roster because the cloud has
   * learned a class it has not (`01-F56`'s forward-skew problem, `DEC-SYNC-011`). An unrecognised
   * class simply is not in `01-F39`'s hub-eligible set, so the election declines to elect it —
   * which is the safe outcome, arrived at without a whole-roster refusal that would take the LAN
   * down (`01-F17`).
   */
  readonly device_class: string;
  /** Lowercase hex SHA-256 of the peer certificate's DER. The admission key. */
  readonly cert_sha256: string;
  readonly revoked: boolean;
};

/** A full replacement at `version`. */
export type RosterSnapshot = {
  kind: "snapshot";
  version: number;
  entries: readonly RosterEntry[];
};

/** An incremental change from `from_version` to `version`. */
export type RosterDelta = {
  kind: "delta";
  from_version: number;
  version: number;
  upserts: readonly RosterEntry[];
  /**
   * `device_id`s to drop entirely. Removal and revocation are BOTH kept, and they are not the
   * same fact: a revoked row is a device that exists and is refused — which is what an operator
   * sees on `14-F12`'s list and what `01-F42`'s purge is aimed at — while a removed row is a
   * device that is no longer this branch's at all. Collapsing them would make a revocation
   * indistinguishable from a roster that simply never mentioned the device, and `01-F48` cares
   * about the difference.
   */
  removals: readonly string[];
};

export type RosterUpdate = RosterSnapshot | RosterDelta;

/** `01-F56`'s vocabulary, shared with the catalog and the staff registry — one chain, one word set. */
export type RosterApplyResult =
  | { readonly applied: true; readonly version: number }
  | {
      readonly applied: false;
      readonly reason: "stale" | "needs_snapshot" | "malformed";
      readonly version: number;
    };

export type LanRoster = {
  version(): number;
  /**
   * `received_at` is the caller's wall clock at arrival and is stored ONLY on success — see
   * `ageMs`. It is not branch time: this measures *how long since the cloud last told us who is
   * on this branch*, which is a property of the sync path and not of the branch's consensus
   * clock (`01-F43` governs durations the product renders; this is honesty about staleness).
   */
  apply(update: RosterUpdate, received_at: number): RosterApplyResult;
  /**
   * **THE ADMISSION DECISION.** `null` refuses. Never throws — this runs on an inbound TLS
   * handshake off an untrusted wire, and an exception unwinding through the transport is a
   * stopped LAN (`01-F17`).
   */
  admit(cert_sha256: string): { device_id: string; device_class: string } | null;
  /** Milliseconds since the last APPLIED update, or `null` if none has ever been received. */
  ageMs(now: number): number | null;
  list(): RosterEntry[];
  /**
   * `01-F74` (e) — fires after an update is APPLIED, never on a refusal.
   *
   * It lives on the store rather than beside it, so there is exactly ONE way to change the
   * roster and it is the one that notifies. A wrapper offering a second `apply` would be a
   * second path for one fact, and the path that skips notification is the one a caller
   * eventually takes — after which revocation silently stops evicting live sessions and
   * everything still looks healthy. Returns its unsubscribe.
   */
  subscribe(listener: () => void): () => void;
};

export const ROSTER_SCHEMA = `
-- 01-F74: the branch's admissible devices. Reference data (01-F52), never joined to a fold table.
CREATE TABLE IF NOT EXISTS lan_roster (
  device_id TEXT PRIMARY KEY,
  device_class TEXT NOT NULL,
  cert_sha256 TEXT NOT NULL,
  revoked INTEGER NOT NULL
) STRICT;
-- UNIQUE, so "two devices sharing one certificate" cannot be represented at all rather than
-- merely being unlikely. A roster builder with that bug would otherwise make admission depend on
-- SQLite's row order, and the two identities are separate origins in an append-only log (01-F3,
-- 01-F64). A violation surfaces as a 'malformed' refusal, never as a throw (01-F17).
CREATE UNIQUE INDEX IF NOT EXISTS lan_roster_cert ON lan_roster (cert_sha256);
CREATE TABLE IF NOT EXISTS lan_roster_state (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  version INTEGER NOT NULL,
  -- NULL ⇔ never received. Distinct from 0, which would be a real receipt at the epoch and
  -- would let ageMs() report a number for a roster this device has never held (00 §5.7).
  received_at INTEGER
) STRICT;
INSERT OR IGNORE INTO lan_roster_state (id, version, received_at) VALUES (0, 0, NULL);
`;

const isVersion = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Lowercase hex, 64 chars — a SHA-256. Anything else could never match a real handshake. */
const isFingerprint = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

const isEntry = (e: unknown): boolean => {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.device_id === "string" &&
    o.device_id.length > 0 &&
    typeof o.device_class === "string" &&
    o.device_class.length > 0 &&
    isFingerprint(o.cert_sha256) &&
    typeof o.revoked === "boolean"
  );
};

/**
 * Validate at the boundary, because this is wire input. Hand-written rather than Zod, matching
 * `staff.ts` and `catalog.ts`: this package carries no schema dependency and adding one for this
 * shape would be the larger change. The rule it enforces is `01-F17` — a shape the device cannot
 * read is a REFUSAL, never an exception unwinding through whatever was serving the till.
 */
const isValidUpdate = (u: unknown): u is RosterUpdate => {
  if (typeof u !== "object" || u === null) return false;
  const o = u as Record<string, unknown>;
  if (!isVersion(o.version)) return false;
  if (o.kind === "snapshot") {
    if (!Array.isArray(o.entries) || !o.entries.every(isEntry)) return false;
    // A snapshot is self-contained, so its own duplicates are checkable here and refusing is
    // strictly better than letting the UNIQUE index decide which of two rows survives.
    const fps = new Set((o.entries as RosterEntry[]).map((e) => e.cert_sha256));
    const ids = new Set((o.entries as RosterEntry[]).map((e) => e.device_id));
    return fps.size === o.entries.length && ids.size === o.entries.length;
  }
  if (o.kind === "delta") {
    if (!isVersion(o.from_version)) return false;
    if (!Array.isArray(o.upserts) || !o.upserts.every(isEntry)) return false;
    return Array.isArray(o.removals) && o.removals.every((r) => typeof r === "string");
  }
  return false;
};

export const createLanRoster = (db: Db): LanRoster => {
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const l of [...listeners]) {
      // One listener throwing must not stop the others being told, and must not unwind into
      // whatever applied the update (`01-F17`). Eviction is best-effort per listener; the
      // durable roster is already correct by the time this runs.
      try {
        l();
      } catch {
        /* a listener's failure is not the roster's */
      }
    }
  };
  const readState = db.prepare("SELECT version, received_at FROM lan_roster_state WHERE id = 0");
  const writeState = db.prepare(
    "UPDATE lan_roster_state SET version = ?, received_at = ? WHERE id = 0",
  );
  const clearAll = db.prepare("DELETE FROM lan_roster");
  const upsert = db.prepare(
    `INSERT INTO lan_roster (device_id, device_class, cert_sha256, revoked) VALUES (?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       device_class = excluded.device_class,
       cert_sha256 = excluded.cert_sha256,
       revoked = excluded.revoked`,
  );
  const remove = db.prepare("DELETE FROM lan_roster WHERE device_id = ?");
  const readByCert = db.prepare(
    "SELECT device_id, device_class, revoked FROM lan_roster WHERE cert_sha256 = ?",
  );
  const readAll = db.prepare(
    "SELECT device_id, device_class, cert_sha256, revoked FROM lan_roster ORDER BY device_id",
  );

  const state = (): { version: number; received_at: number | null } => {
    const row = readState.get() as { version: number; received_at: number | null } | undefined;
    // `?? ` rather than a non-null assertion: this runs on every apply and on every admission,
    // and a missing singleton row must not be the thing that throws on the till's path (01-F17).
    return { version: row?.version ?? 0, received_at: row?.received_at ?? null };
  };

  const applySnapshot = db.transaction((snap: RosterSnapshot, at: number) => {
    clearAll.run();
    for (const e of snap.entries) {
      upsert.run(e.device_id, e.device_class, e.cert_sha256, e.revoked ? 1 : 0);
    }
    writeState.run(snap.version, at);
  });

  const applyDelta = db.transaction((d: RosterDelta, at: number) => {
    // Removals BEFORE upserts, so one update may hand a certificate from a retired device_id to
    // a new one without tripping the UNIQUE index. The reverse order refuses a legitimate update.
    for (const device_id of d.removals) remove.run(device_id);
    for (const e of d.upserts) {
      upsert.run(e.device_id, e.device_class, e.cert_sha256, e.revoked ? 1 : 0);
    }
    writeState.run(d.version, at);
  });

  return {
    version: () => state().version,

    apply: (update, received_at) => {
      const { version: held } = state();
      // Wire input, validated before anything else touches SQLite. Returning the store's own
      // re-read version, never the caller's — an unvalidated `version` may not be a number.
      if (!isValidUpdate(update)) return { applied: false, reason: "malformed", version: held };
      if (!Number.isFinite(received_at)) {
        return { applied: false, reason: "malformed", version: held };
      }

      try {
        if (update.kind === "snapshot") {
          // Older is refused, so a device revoked at v4 is not resurrected by a replayed v2. A
          // snapshot AT the held version is not older — it is the authoritative full state of
          // that version and the only self-heal this device has (`staff.ts` reasons the same).
          if (update.version < held) return { applied: false, reason: "stale", version: held };
          applySnapshot(update, received_at);
          notify();
          return { applied: true, version: update.version };
        }

        if (update.version <= held) return { applied: false, reason: "stale", version: held };

        // `01-F56` — a delta whose base does not match is REFUSED, never applied out of order.
        // Diverging here does not misprice a dish; it decides who may write to the branch
        // ledger, so the device asks for a snapshot instead.
        if (update.from_version !== held) {
          return { applied: false, reason: "needs_snapshot", version: held };
        }

        applyDelta(update, received_at);
        notify();
        return { applied: true, version: update.version };
      } catch {
        // A constraint violation from wire data (two rows claiming one certificate across a
        // delta boundary) is a malformed update, not a crash. The transaction has rolled back,
        // so the held roster is exactly what it was — which is the fail-closed direction.
        return { applied: false, reason: "malformed", version: state().version };
      }
    },

    admit: (cert_sha256) => {
      // ⚠ NOT normalised — REFUSED. An earlier draft of this comment said "normalised on the way
      // in", which the code has never done, and a comment claiming a protection that does not
      // exist is worse than no comment: it retires the assertion the next reader would write.
      // Lowercase is the shape `createHash().digest("hex")` produces on both ends, so a mixed-case
      // fingerprint means a hand-built roster or a hand-built handshake, and `isEntry` refuses the
      // same shape at `apply` — so the failure is a LOUD `malformed` on arrival rather than a
      // silent never-admits at every handshake afterwards. Case-folding here would make the two
      // ends disagree quietly, which is the one outcome this file must not produce.
      if (!isFingerprint(cert_sha256)) return null;
      const row = readByCert.get(cert_sha256) as
        | { device_id: string; device_class: string; revoked: number }
        | undefined;
      if (row === undefined) return null;
      // `01-F48` — presence is not admission. A revoked device is in the roster precisely so an
      // operator can see it on `14-F12`'s list; it is refused here.
      if (row.revoked !== 0) return null;
      return { device_id: row.device_id, device_class: row.device_class };
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    ageMs: (now) => {
      const { received_at } = state();
      // `null` ⇔ never received, and it is NOT zero. `00 §5.7` is about facts whose being wrong
      // looks like being right: a roster this device has never held, reporting an age of 0 ms,
      // is the freshest-looking number on the strip.
      if (received_at === null) return null;
      // Clamped at 0 rather than reported negative: a receipt stamped ahead of `now` is a clock
      // artefact, and a negative age on an honesty surface reads as a bug in the surface.
      return Math.max(0, now - received_at);
    },

    list: () =>
      (
        readAll.all() as {
          device_id: string;
          device_class: string;
          cert_sha256: string;
          revoked: number;
        }[]
      ).map((r) => ({
        device_id: r.device_id,
        device_class: r.device_class,
        cert_sha256: r.cert_sha256,
        revoked: r.revoked !== 0,
      })),
  };
};
