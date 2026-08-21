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

import { canonicalJson } from "@restos/domain";

export type StaffAssignment = {
  readonly role: string;
  /** `null` = org-wide. `01-F26` is User × Role × per-LOCATION assignment. */
  readonly branch_id: string | null;
};

/**
 * `11-F22`'s participation status, closed at two. **It decides whether she may ACT and nothing
 * about RENDERING** — the two are different questions with different failure directions (the
 * first fails closed, the second fails to a raw UUID on a document a customer is holding), and
 * one flag answering both is the shape that answers the second by accident.
 *
 * This artifact is branch-scoped (`01-F76`/R25), so the single word IS this branch's
 * participation: a cashier who transfers is `inactive` here and `active` at the branch she
 * moved to, and she is dropped from neither roster (`11-F22`).
 */
export type StaffStatus = "active" | "inactive";

/**
 * `01-F26` + `01-F28`. `pin_hash` is the SYNCED Argon2id credential (`hashPin` in `domain`) —
 * never a PIN. `01-F26`'s per-user permission OVERRIDES are deliberately not modelled: no FR
 * states their shape (recorded in `plans/wave-1/identity-and-authorization.md` §7).
 */
export type StaffMember = {
  readonly user_id: string;
  /**
   * `11-F21` — the synced credential, and **OPTIONAL**, because the FR carries it "only on an
   * `active` ENTRY": a hash on a non-`active` member is a credential no verifier can ever reach,
   * pure blast radius with no function. `01-F75` states the consequence for this exact field in
   * terms — "a **missing hash on a non-`active` member is the specified shape and never
   * `malformed`**" — and a validator that refused it would refuse the WHOLE update, which for
   * `staff` is a branch nobody can sign in to.
   *
   * An **`active`** member with none is legal too and means something different: R29 has the
   * owner set a person's first PIN in the back office, so "active, no credential yet" is a real
   * published state. `11-F23` (i) calls the same shape a DEFECT once re-activation has run —
   * both readings agree that it is not `malformed` and that she cannot unlock (`pin-session.ts`).
   */
  readonly pin_hash?: string;
  /**
   * `01-F61` (August 2026) — "**A staff record carries a `display_name`, because the
   * identification tile must render something.** … a grid of tiles labelled by opaque id is
   * unusable." It rides this chain rather than a second one for the same `01-F21` reason the
   * hashes do.
   *
   * ⚠ **REQUIRED since step 7 of `plans/saas-pivot/staff-over-the-wire.md`.** It was optional
   * because the field was added to a registry already carrying rows written by a build that did
   * not know it; `11-F20` makes the name required on the one record both planes read, and
   * `StaffEntryWire` declares it `z.string().min(1)`, so `messages.ts` records the optionality
   * here as "a migration artifact and not a wire rule". R4 puts nothing in the field, so the
   * artifact has no one left to protect.
   *
   * `01-F61` also records what is owed: `21 §5`'s non-reader evidence makes a *name* "the
   * weakest possible label for this population — a photo or a fixed per-person mark would be
   * materially better, and that is `27`'s to specify. The name is the floor, not the target."
   */
  readonly display_name: string;
  /**
   * `01-F61` — the identification grid's position, **explicit on the record and never derived**.
   * That FR's own worked defect: "Ordering the identification grid by any *derived* key —
   * `user_id`, name, recency — means a new hire inserts wherever it sorts and shifts every tile
   * after it… The first build ordered by `user_id` and the defect is invisible to a test that
   * only re-renders the same roster, which is precisely how it survived review." A cashier taps
   * this control 20–60× a shift and `27-F4` protects the muscle memory it builds.
   */
  readonly grid_ordinal: number;
  /**
   * `11-F22`. **Absent is never read as `active`** — that FR forecloses the default by name
   * ("not a licence to default an absent status to `active`") and `01-F48` says where state
   * cannot be read, participation is REFUSED rather than granted. `apply` therefore refuses a
   * member without one; the shape survives only on rows a build that predates this field wrote,
   * and `pin-session.ts` is where those are refused.
   */
  readonly status: StaffStatus;
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
   * ⚠ **NOTHING ON THE WIRE CAN PRODUCE ONE SINCE `01-F75`, AND THE COMMENT THAT USED TO STAND
   * HERE ARGUED FOR THE BEHAVIOUR `11-F22` NAMES AS WRONG.** It read: *"`01-F42` — a revoked user
   * or role stops authorising, so the row is REMOVED, not tombstoned. The catalog keeps
   * tombstones because a reprint must still render a deleted item's name; a let-go cashier has no
   * such document to serve."* She does: R26 rules that "a let-go cashier's name still renders on
   * last month's orders", and `11-F22` measures the cost of the other answer —
   * `apps/pos-electron/src/main/index.ts:777` degrades a member the registry no longer holds to a
   * raw `user_id`, on every past order, receipt, KOT, report and reconciliation. The citation was
   * right about UNLOCKING and wrong about RENDERING, and `11-F22`'s two-fields rule is what
   * separates them: `status` ends participation, the row stays.
   *
   * **A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE** (`01-F75`) — the response frame
   * carries no removals list for any resource, so `staff-fetch.ts` cannot emit one and a
   * deactivation arrives as an `inactive` UPSERT. This member is retained ONLY because
   * `__acceptance__/pin-session.test.ts` asserts the local removal path directly (another
   * session's oracle, read-only under `24 §3`); deleting it is owed against `11-F22` and is
   * reported rather than taken here.
   */
  removals: readonly string[];
};

export type StaffUpdate = StaffSnapshot | StaffDelta;

/**
 * Why an update was not applied — the catalog's vocabulary (`01-F56`), because it is the same
 * chain. Refusal is a first-class outcome rather than a throw: this arrives off a wire, and
 * `01-F17` makes a stopped till the one unacceptable outcome.
 *
 * - `stale` — older than we hold, or a byte-identical replay. Ignore it.
 * - `needs_snapshot` — a delta whose base we do not have. Ask for a full resync.
 * - `malformed` — a shape we cannot read.
 * - `divergent` — proof that this device and the sender disagree about what a version MEANS.
 *   The device drops to version 0 and holds nothing until a snapshot lands. **`staff_state`
 *   could not hold this until step 7** (it carried `version` alone), so a competitor and a
 *   replay were one observation — and on a menu that costs a word, while here the two readings
 *   of "N" differ in who may open a shift and whose hash verifies.
 */
export type StaffApplyResult =
  | { readonly applied: true; readonly version: number }
  | {
      readonly applied: false;
      readonly reason: "stale" | "needs_snapshot" | "malformed" | "divergent";
      readonly version: number;
    };

export type StaffRegistry = {
  version(): number;
  apply(update: StaffUpdate): StaffApplyResult;
  /**
   * **EVERY person the roster has ever named, whatever her status** (`11-F22`): a past order, a
   * reprint, a shift report and `02-F23`'s reconciliation all render a `display_name` resolved
   * from here, unconditionally. `lookup` is therefore not the offer surface and must never be
   * narrowed to one.
   */
  lookup(user_id: string): StaffMember | null;
  /**
   * `01-F61`'s identification grid — `lookup` answers "is this user real", and a surface that
   * must *offer* the choice cannot ask that question without already knowing the answer.
   *
   * **`active` members only** (`11-F22`): "the one rendering surface status DOES govern is the
   * identification grid, and only because a control there is an offer" — a tile that always
   * refuses is a control that cannot do its job (`27-F5`), and hiding one moves nothing, because
   * position is an explicit `grid_ordinal` rather than a list index.
   *
   * **The order is the contract's, not the caller's** (`27-F4`), and it is `grid_ordinal`
   * ascending — `01-F61`'s explicit field, never a derived key. The SQL `ORDER BY user_id`
   * underneath is the STABLE base of that sort and not a tiebreak anyone chose: `01-F75` makes
   * `grid_ordinal` unique within an artifact, so a tie cannot arrive off the wire.
   */
  list(): StaffMember[];
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
  version INTEGER NOT NULL,
  -- 01-F56 divergence detection, on catalog_state's shape and for its reason. A version number
  -- is a claim about CONTENT, so the device records the transition that produced the one it
  -- holds: two different updates for the same transition are proof that this device and the
  -- sender disagree about what the version means. Without these three columns "I already
  -- applied that" and "someone else's version N" are the same observation — the state 01-F56
  -- calls undetectable at the till, and on THIS artifact the disagreement is about who may open
  -- a shift and whose hash verifies.
  last_kind TEXT NOT NULL DEFAULT '',
  last_from INTEGER,
  last_form TEXT NOT NULL DEFAULT ''
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
    // `11-F21`/`01-F75`: the hash rides an `active` entry only, so ABSENT is a specified shape
    // and never `malformed` — for both of its neighbours, which are one keystroke apart in
    // English and nothing alike in consequence: a departed member who carries none by rule, and
    // an `active` member whose first PIN the owner has not set yet (R29). A validator that
    // refused either refuses the ENTIRE update, and for `staff` that is a branch nobody can sign
    // in to — `01-F17`'s stopped till arriving through a validator. PRESENT AND NOT A STRING is
    // still refused: `verifyPin` would be handed a shape it cannot read.
    (o.pin_hash === undefined || typeof o.pin_hash === "string") &&
    // `01-F61`'s label, `11-F20`-required. PRESENT AND EMPTY is refused for the same reason a
    // missing one now is — an empty tile is indistinguishable from a rendering failure on a
    // surface an operator taps 20–60× a shift.
    typeof o.display_name === "string" &&
    o.display_name.length > 0 &&
    // `01-F61`: the position is EXPLICIT and there is no derived key to fall back to, so a
    // member without one has no position at all. Fractional is refused for the same reason —
    // an ordinal is a slot, and 1.5 is a slot that does not exist.
    typeof o.grid_ordinal === "number" &&
    Number.isSafeInteger(o.grid_ordinal) &&
    // `11-F22`, closed at two. An ABSENT status is refused rather than defaulted: that FR
    // forecloses the default by name and `01-F48` refuses participation where state cannot be
    // read. A value outside the set is refused because a device that admitted `suspended` would
    // have to decide what it means, and deciding is commandment 2.
    (o.status === "active" || o.status === "inactive") &&
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
  const readState = db.prepare(
    "SELECT version, last_kind, last_from, last_form FROM staff_state WHERE id = 0",
  );
  const writeState = db.prepare(
    "UPDATE staff_state SET version = ?, last_kind = ?, last_from = ?, last_form = ? WHERE id = 0",
  );
  const clearAll = db.prepare("DELETE FROM staff");
  const upsert = db.prepare(
    `INSERT INTO staff (user_id, json) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET json = excluded.json`,
  );
  const remove = db.prepare("DELETE FROM staff WHERE user_id = ?");
  const readOne = db.prepare("SELECT json FROM staff WHERE user_id = ?");
  const readAll = db.prepare("SELECT json FROM staff ORDER BY user_id");

  /** One row's member, or null if it cannot be read (see `lookup`'s reasoning — `01-F17`). */
  const parse = (json: string): StaffMember | null => {
    try {
      return JSON.parse(json) as StaffMember;
    } catch {
      return null;
    }
  };

  type State = {
    version: number;
    last_kind: string;
    last_from: number | null;
    last_form: string;
  };
  const EMPTY: State = { version: 0, last_kind: "", last_from: null, last_form: "" };
  // `?? EMPTY` rather than a non-null assertion: `version()` runs on every apply, and a missing
  // singleton row must not be the thing that throws on the till's path (01-F17).
  const state = (): State => (readState.get() as State | undefined) ?? EMPTY;
  const version = (): number => state().version;

  const applySnapshot = db.transaction((snap: StaffSnapshot) => {
    clearAll.run();
    for (const m of snap.members) upsert.run(m.user_id, JSON.stringify(m));
    // A snapshot REPLACES, so it applies to no base and there is no transition to record: the
    // next update at this version cannot be a competitor for one (`01-F56`).
    writeState.run(snap.version, "snapshot", null, "");
  });

  const applyDelta = db.transaction((d: StaffDelta, form: string) => {
    for (const m of d.upserts) upsert.run(m.user_id, JSON.stringify(m));
    for (const user_id of d.removals) remove.run(user_id);
    writeState.run(d.version, "delta", d.from_version, form);
  });

  /**
   * Divergence proved: the device stops claiming a version it cannot stand behind (`01-F56`,
   * `catalog.ts`'s `invalidate` verbatim).
   *
   * ⚠ **On THIS artifact the cost is a branch that cannot sign in until a snapshot lands**, and
   * that is stated rather than discovered: `01-F56` names the mechanism and no FR names a
   * staff-specific answer, so inventing a gentler one (keep the rows, drop the number) would be
   * deciding an unruled question on a credential store. Recovery is the ordinary path — the
   * device now holds 0, so the next `hello_ack` or notice fetches a snapshot.
   */
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
        // Older is refused, so a user let go at v4 is not resurrected by a replayed v2. A
        // snapshot AT the held version is not older — it is the authoritative full state of
        // that version and the only self-heal this device has (`catalog.ts` reasons the same).
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
        // A COMPETITOR: same base, same target, different content. That is not a replay — it is
        // proof that the version number means one thing here and another at the sender, and
        // refusal alone cannot fix it (both devices would sit at N holding different rosters,
        // each having refused the other's update as a duplicate). An ordinary lossy link
        // redelivers a delta, so the byte-identical case must stay `stale`: a device that called
        // a retransmission divergence would empty its own roster on one — `01-F17`'s stopped
        // till caused by the guard.
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

      // A delta whose base does not match is REFUSED — applying it would silently diverge this
      // device's roles from every other device's, and the divergence is a CREDENTIAL, not a
      // menu word. Ask for a snapshot instead.
      if (update.from_version !== s.version) {
        return { applied: false, reason: "needs_snapshot", version: s.version };
      }

      applyDelta(update, canonicalJson(update));
      return { applied: true, version: update.version };
    },

    lookup: (user_id) => {
      const row = readOne.get(user_id) as { json: string } | undefined;
      // `STRICT` constrains the column's TYPE, not the validity of what is in it, so a
      // truncated write is reachable. An unreadable row means that user cannot unlock —
      // never that the whole registry throws (01-F17).
      return row === undefined ? null : parse(row.json);
    },

    // One unreadable row costs THAT member their tile, not the whole grid: a roster that
    // refuses to render because one JSON blob is truncated is a locked till (`01-F17`), and
    // every other member on the device can still get in.
    //
    // `status === "active"` positively rather than `!== "inactive"`, so a row a build predating
    // `11-F22` wrote — carrying no status at all — is OFF the grid rather than on it. That is
    // the same direction `pin-session.ts` refuses it in, and `11-F22` forbids the other one by
    // name ("not a licence to default an absent status to `active`").
    list: () =>
      (readAll.all() as { json: string }[])
        .map((row) => parse(row.json))
        .filter((m): m is StaffMember => m !== null && m.status === "active")
        .sort((a, b) => a.grid_ordinal - b.grid_ordinal),
  };
};
