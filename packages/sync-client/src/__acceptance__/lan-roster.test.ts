// ACCEPTANCE TESTS — `01-F74`'s BRANCH ROSTER: the durable, versioned reference-data store that
// decides which devices this branch's LAN will admit.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`20 §4.3`, `24 §3` step 2). The session that wrote this file
// wrote no production code for the behaviour it describes, has not read `lan-roster.ts`, and is
// disqualified from implementing it. Every assertion below is derived from a quoted FR clause.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`.** The change that makes
// this green needs an adversarial review in a separate agent context.
//
// **SCOPE — the STORE, not the transport.** `01-F72` (b) makes the mechanism mutual TLS and the
// session identity the peer certificate's subject; none of that is here. This file owns the second
// half of `01-F74` (c) — *"its fingerprint appears in the roster, and that entry is not revoked"* —
// and asserts nothing about certificate chain verification, which is the TLS suite's.
//
// ── THE AUTHORITIES, quoted so an assertion can be argued with ─────────────────────────────────
//
//   01-F74 (a) "The cloud signs, per branch, the set of that branch's devices — `device_id`,
//              `device_class`, certificate fingerprint, revocation state — and every device caches
//              it **durably** in its own store (`01-F2`), because the whole point is to be right
//              when the WAN is not there."
//
//   01-F74 (b) "It is REFERENCE DATA, not ledger, on `01-F52`'s exact pattern: versioned,
//              distributed as snapshot-plus-delta over the same sync channel, applied
//              monotonically (`01-F56`)…"
//
//   01-F74 (c) "Admission is: the peer's certificate verifies against the org issuer, its
//              fingerprint appears in the roster, and that entry is not revoked. … LAN revocation
//              is therefore a *field of the roster*, which retires `isRevokedPeer` — an in-memory
//              `Set` populated from observed cloud refusals. **That set dies with the process, so a
//              restarted hub today re-admits a device the owner revoked.**"
//
//   01-F74 (d) "STALE IS NOT UNREADABLE … A roster that is absent, corrupt, or whose signature does
//              not verify is **unreadable**: refuse, per `01-F48`. A roster that verifies and is
//              merely **old**: **admit**, and surface its age (`00 §5.7`)."
//
//   01-F73 (b) "**Three facts, not four, and `device_class` is deliberately NOT among them.** Class
//              decides hub eligibility (`01-F39`), it changes when a device is re-purposed, and a
//              certificate is a long-lived credential … the certificate answers *who*, the roster
//              answers *what it may do*."
//
//   01-F72 (a) "Admission requires PROOF OF POSSESSION of a pairing-issued device credential
//              (`01-F73`), verified against the branch roster (`01-F74`)."
//   01-F72 (d) "Fail closed, and closed means SILENT rather than degraded."
//   01-F72 (e) "It never blocks a sale (`01-F17`, `00 §5.1`)."
//
//   01-F48     "Eviction is fail-closed — if revocation state cannot be read, participation is
//              refused, not granted … Revocation blocks **reads as well as writes**."
//
//   01-F56     "Versions apply monotonically, and a delta whose base does not match is REFUSED —
//              the device asks for a snapshot instead. … An older snapshot or delta than the device
//              already holds is ignored, never applied backwards."
//
//   01-F17     "A sale is never blocked." — which is why every refusal below is a RETURNED VALUE.
//              `apply` runs on a wire frame and `admit` runs on a socket event; a throw out of
//              either unwinds through whatever was serving the till.
//
//   01-F2      "Every device persists events locally (SQLite, WAL) before acknowledging … A
//              confirmed action is a persisted event (plug-pull safe)."  `00 §5.2`: "no
//              confirmed-state in memory only, ever."
//
//   00 §5.7    "Sync honesty: every screen showing remote data displays last-synced age; stale is
//              never presented as live."
//
// ── FOUR READINGS THIS SUITE PINS, stated so a reviewer can reject them rather than discover them
//
//   R-1  **A snapshot is a FULL REPLACEMENT.** `01-F74` (a) signs "the set of that branch's
//        devices", and a device dropped from that set must stop being admissible. So a snapshot
//        omitting a device removes it (§D5). The alternative — snapshots merging — would make a
//        removal unexpressible except by delta, and a device removed while the branch was offline
//        would never be evicted by the recovery snapshot `01-F56` designates.
//
//   R-2  **`list()` shows revoked entries.** `revoked` is a declared field of `RosterEntry`, which
//        is `list()`'s own return type; a `list()` that filtered them would make the field
//        constant-false in its own contract. This is what makes "presence is not admission"
//        observable (§B3). It is asserted in ONE test, deliberately, so that if the reading is
//        wrong the security assertion in §B1 still stands alone.
//
//   R-3  **The receipt time is durable.** `ageMs` is a method of a store whose whole subject is
//        being right after a restart; a device that reopens holding version 9 and answers "never
//        received" is reporting a state it is not in, which `00 §5.7` forbids from the other side.
//
//   R-4  **A refusal returns the version the device HOLDS**, not the one it was offered — on
//        `needs_snapshot` that number is the only thing a caller can use to ask for the right
//        snapshot, and on `malformed` the offered version may not be a number at all.
//
// ── WHAT IS DELIBERATELY NOT ASSERTED (commandment 2 — no invented policy) ──────────────────────
//
//   • **Signature verification.** `01-F74` (a) says the cloud signs the roster and (d) says a
//     roster "whose signature does not verify" is unreadable. No FR states where that check lives
//     or what the signed bytes are, and the declared `RosterUpdate` carries no signature field.
//     Nothing here asserts it, and its absence from this file is NOT evidence it is not owed.
//   • **Equal-version updates.** `01-F56`'s word is *older*, not *older-or-equal*. Whether a
//     snapshot AT the held version re-applies (the self-heal reading) or is refused is not settled
//     by any clause, so no test pins it either way.
//   • **Fingerprint case and length.** The type comment says lowercase hex sha256; no FR makes a
//     wrong-cased or wrong-length fingerprint `malformed`, so neither is asserted.
//   • **`device_class` values.** No clause says an unrecognised class string is `malformed`. The
//     fixtures use real `@restos/domain` classes (guarded in §F0) so the suite is correct under
//     either reading.
//   • **Two entries sharing one fingerprint.** A real question — it is one device impersonating
//     another — and the corpus is silent. Reported, not invented.
//   • **A negative age** (`now` earlier than the receipt time). `00 §5.7` forbids presenting stale
//     as live, which argues against a negative number; nothing states whether it clamps.

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEVICE_CLASSES } from "@restos/domain";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLanRoster,
  type LanRoster,
  ROSTER_SCHEMA,
  type RosterApplyResult,
  type RosterDelta,
  type RosterEntry,
  type RosterSnapshot,
  type RosterUpdate,
} from "../lan-roster.js";

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Fixtures — a small branch: one counter, one kitchen screen, one manager tablet already revoked.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** `01-F74` (a)'s "certificate fingerprint" — sha256 over the cert DER, lowercase hex. */
const fingerprintOf = (der: string): string => createHash("sha256").update(der).digest("hex");

const FP_COUNTER = fingerprintOf("der:counter-1");
const FP_KITCHEN = fingerprintOf("der:kitchen-1");
const FP_MANAGER = fingerprintOf("der:manager-1");
/** Nobody's. `01-F72`'s threat model: "the customer network in a Pakistani restaurant is the staff network." */
const FP_STRANGER = fingerprintOf("der:a-laptop-on-the-shop-wifi");

const COUNTER: RosterEntry = {
  device_id: "dev-counter-1",
  device_class: "counter_electron",
  cert_sha256: FP_COUNTER,
  revoked: false,
};
const KITCHEN: RosterEntry = {
  device_id: "dev-kitchen-1",
  device_class: "kitchen",
  cert_sha256: FP_KITCHEN,
  revoked: false,
};
const MANAGER_REVOKED: RosterEntry = {
  device_id: "dev-manager-1",
  device_class: "manager",
  cert_sha256: FP_MANAGER,
  revoked: true,
};

const SEED_VERSION = 5;
const SEEDED_AT = 1_700_000_000_000;

const snapshot = (version: number, entries: readonly RosterEntry[]): RosterSnapshot => ({
  kind: "snapshot",
  version,
  entries,
});

const delta = (
  from_version: number,
  version: number,
  upserts: readonly RosterEntry[] = [],
  removals: readonly string[] = [],
): RosterDelta => ({ kind: "delta", from_version, version, upserts, removals });

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Harness — real SQLite, exactly as the sibling reference-data suites open it.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const tempDbPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "restos-lan-roster-"));
  dirs.push(dir);
  return join(dir, "device.db");
};

/** What a HOST does at start: open the file, run the schema, construct the store. */
const openRoster = (path: string): { db: Database.Database; roster: LanRoster } => {
  const db = new Database(path);
  db.exec(ROSTER_SCHEMA);
  return { db, roster: createLanRoster(db as never) };
};

const memoryRoster = (): LanRoster => openRoster(":memory:").roster;

/** A branch at version 5: counter and kitchen admissible, manager revoked. */
const seeded = (): LanRoster => {
  const roster = memoryRoster();
  expect(
    roster.apply(snapshot(SEED_VERSION, [COUNTER, KITCHEN, MANAGER_REVOKED]), SEEDED_AT),
  ).toEqual({ applied: true, version: SEED_VERSION });
  return roster;
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// F0 — fixture guard
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("F0 · fixture guard", () => {
  it("F0 · 01-F73 (b) / 01-F74 (a): every class used below is a real @restos/domain DeviceClass", () => {
    // The roster is where `device_class` lives authoritatively (`01-F73` (b)), so a fixture using
    // a class the domain does not know would make every assertion below untrustworthy under an
    // implementation that validates the enum — and silently green under one that does not.
    expect([...DEVICE_CLASSES]).toEqual(
      expect.arrayContaining([
        COUNTER.device_class,
        KITCHEN.device_class,
        MANAGER_REVOKED.device_class,
      ]),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// A — admission is BY FINGERPRINT, and an unknown fingerprint is refused (01-F72 (a), 01-F74 (c))
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("A · 01-F72 (a) / 01-F74 (c) — admission is by certificate fingerprint", () => {
  it("A1 · 01-F74 (c): a fingerprint the roster names admits, and carries that entry's device_id and class", () => {
    expect(seeded().admit(FP_COUNTER)).toEqual({
      device_id: COUNTER.device_id,
      device_class: COUNTER.device_class,
    });
  });

  it("A2 · 01-F72 (d) / 01-F17: an unknown fingerprint is REFUSED with null, and admit never throws", () => {
    const roster = seeded();
    // Fail closed and silent: the laptop on the shop Wi-Fi is not on the roster, so it is not
    // admitted — and refusing it must not be an exception unwinding through the LAN listener.
    expect(() => roster.admit(FP_STRANGER)).not.toThrow();
    expect(roster.admit(FP_STRANGER)).toBeNull();
  });

  it("A3 · 01-F72 (b): a device_id is NOT a fingerprint — presenting one admits nobody", () => {
    // `01-F72` (b) makes identity the peer CERTIFICATE's subject, "never a `device_id` read from a
    // frame". A store keyed by the wrong column would admit anyone who can name a till.
    const roster = seeded();
    expect(roster.admit(COUNTER.device_id)).toBeNull();
    expect(roster.admit(KITCHEN.device_id)).toBeNull();
  });

  it("A4 · 01-F17: the empty string is refused rather than matching anything", () => {
    const roster = seeded();
    expect(() => roster.admit("")).not.toThrow();
    expect(roster.admit("")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// B — a REVOKED entry is refused although it is PRESENT (01-F48, 01-F74 (c))
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("B · 01-F48 / 01-F74 (c) — presence is not admission", () => {
  it("B1 · 01-F48: a revoked entry's fingerprint is REFUSED even though the roster names the device", () => {
    // "Revocation blocks reads as well as writes: a revoked device receives no further events on
    // any plane." The roster carries the device precisely so the refusal is authoritative.
    expect(seeded().admit(FP_MANAGER)).toBeNull();
  });

  it("B2 · 01-F74 (e) / 01-F48: a revoking delta evicts a device that admitted a moment ago", () => {
    const roster = seeded();
    expect(roster.admit(FP_KITCHEN)).not.toBeNull(); // admissible before

    expect(roster.apply(delta(5, 6, [{ ...KITCHEN, revoked: true }]), SEEDED_AT + 1_000)).toEqual({
      applied: true,
      version: 6,
    });

    expect(roster.admit(FP_KITCHEN)).toBeNull();
    // The un-revoked sibling still admits — this delta revoked ONE device, it did not empty the
    // roster, and without this line a store that dropped every row would pass the line above.
    expect(roster.admit(FP_COUNTER)).toEqual({
      device_id: COUNTER.device_id,
      device_class: COUNTER.device_class,
    });
  });

  it("B3 · 01-F74 (a): the revoked device is still PRESENT in the roster it is refused by (reading R-2)", () => {
    const listed = seeded().list();
    const manager = listed.find((e) => e.device_id === MANAGER_REVOKED.device_id);
    expect(manager).toEqual(MANAGER_REVOKED);
    expect(manager?.revoked).toBe(true);
    // Revocation is a FIELD of the roster (`01-F74` (c)), not a row removal — the entry has to be
    // representable so that a screen can say WHY a till went quiet (`00 §5.7`).
    expect(listed.map((e) => e.device_id).sort()).toEqual(
      [COUNTER.device_id, KITCHEN.device_id, MANAGER_REVOKED.device_id].sort(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// C — it survives a RESTART (01-F2, 01-F74 (a)) — the property the retired in-memory Set failed
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("C · 01-F2 / 01-F74 (a) — durable across a restart", () => {
  it("C1 · 01-F74 (c): a NEW process on the same database file admits the same devices and still refuses the revoked one", () => {
    // This is the defect `01-F74` (c) names in as many words: `isRevokedPeer` "dies with the
    // process, so a restarted hub today re-admits a device the owner revoked — `01-F48`'s
    // fail-closed rule inverted by its own cache, and inverted in the direction that grants
    // access." A second handle on one live object cannot see it; only a real reopen can.
    const path = tempDbPath();

    const first = openRoster(path);
    expect(first.roster.apply(snapshot(9, [COUNTER, KITCHEN, MANAGER_REVOKED]), SEEDED_AT)).toEqual(
      { applied: true, version: 9 },
    );
    first.db.close();

    const second = openRoster(path);
    expect(second.roster.version()).toBe(9);
    expect(second.roster.admit(FP_COUNTER)).toEqual({
      device_id: COUNTER.device_id,
      device_class: COUNTER.device_class,
    });
    expect(second.roster.admit(FP_KITCHEN)).toEqual({
      device_id: KITCHEN.device_id,
      device_class: KITCHEN.device_class,
    });
    expect(second.roster.admit(FP_MANAGER)).toBeNull();
    expect(second.roster.admit(FP_STRANGER)).toBeNull();
    second.db.close();
  });

  it("C2 · 00 §5.7 / 01-F74 (d): the RECEIPT TIME survives the restart too (reading R-3)", () => {
    // A device that reopens holding version 9 and answers "never received" is reporting a state it
    // is not in — and under `01-F74` (d) the two answers have opposite dispositions: an absent
    // roster refuses, an old one admits and says how old.
    const path = tempDbPath();

    const first = openRoster(path);
    first.roster.apply(snapshot(9, [COUNTER]), SEEDED_AT);
    first.db.close();

    const second = openRoster(path);
    expect(second.roster.ageMs(SEEDED_AT + 45_000)).toBe(45_000);
    second.db.close();
  });

  it("C3 · 01-F74 (a): the schema is idempotent, so a restart re-running it is not a fatal start", () => {
    // `01-F67`: a start-time refusal is a stopped till. `ROSTER_SCHEMA` is run by every host on
    // every launch, so running it over an existing store must be a no-op, not a throw.
    const path = tempDbPath();
    const { db, roster } = openRoster(path);
    roster.apply(snapshot(3, [COUNTER]), SEEDED_AT);
    expect(() => db.exec(ROSTER_SCHEMA)).not.toThrow();
    expect(roster.version()).toBe(3);
    expect(roster.admit(FP_COUNTER)).not.toBeNull();
    db.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// D — versions apply MONOTONICALLY (01-F56, 01-F74 (b))
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("D · 01-F56 / 01-F74 (b) — monotone versions", () => {
  it("D1 · 01-F56: an OLDER snapshot is refused `stale` and the roster is not rolled back", () => {
    const roster = seeded();
    // The danger is specific: a replayed v2 that re-admits a device revoked at v5.
    const older = snapshot(SEED_VERSION - 3, [
      COUNTER,
      KITCHEN,
      { ...MANAGER_REVOKED, revoked: false },
    ]);

    expect(roster.apply(older, SEEDED_AT + 5_000)).toEqual({
      applied: false,
      reason: "stale",
      version: SEED_VERSION,
    });
    expect(roster.version()).toBe(SEED_VERSION);
    expect(roster.admit(FP_MANAGER)).toBeNull();
  });

  it("D2 · 01-F56: a delta whose `from_version` does not match is refused `needs_snapshot` and changes nothing", () => {
    const roster = seeded();
    // Base 4 against a device holding 5: a delta was lost or duplicated upstream. Applying it
    // "silently diverges one device's menu from every other's" — here, one device's ADMISSION set.
    const mismatched = delta(SEED_VERSION - 1, SEED_VERSION + 1, [
      { ...MANAGER_REVOKED, revoked: false },
    ]);

    expect(roster.apply(mismatched, SEEDED_AT + 5_000)).toEqual({
      applied: false,
      reason: "needs_snapshot",
      version: SEED_VERSION,
    });
    expect(roster.version()).toBe(SEED_VERSION);
    expect(roster.admit(FP_MANAGER)).toBeNull();
  });

  it("D3 · 01-F56: a delta whose base MATCHES applies and moves the version", () => {
    const roster = seeded();
    const newcomer: RosterEntry = {
      device_id: "dev-waiter-1",
      device_class: "waiter",
      cert_sha256: fingerprintOf("der:waiter-1"),
      revoked: false,
    };

    expect(
      roster.apply(delta(SEED_VERSION, SEED_VERSION + 1, [newcomer]), SEEDED_AT + 5_000),
    ).toEqual({ applied: true, version: SEED_VERSION + 1 });
    expect(roster.version()).toBe(SEED_VERSION + 1);
    expect(roster.admit(newcomer.cert_sha256)).toEqual({
      device_id: newcomer.device_id,
      device_class: newcomer.device_class,
    });
  });

  it("D4 · 01-F56: a delta carrying a version OLDER than the one held is refused `stale`", () => {
    const roster = seeded();
    // Base matches, but the update walks backwards — "never applied backwards".
    expect(
      roster.apply(
        delta(SEED_VERSION, SEED_VERSION - 1, [{ ...MANAGER_REVOKED, revoked: false }]),
        SEEDED_AT + 5_000,
      ),
    ).toEqual({ applied: false, reason: "stale", version: SEED_VERSION });
    expect(roster.version()).toBe(SEED_VERSION);
    expect(roster.admit(FP_MANAGER)).toBeNull();
  });

  it("D5 · 01-F74 (a) / 01-F56: a NEWER snapshot replaces the whole set — the recovery from D2 (reading R-1)", () => {
    const roster = seeded();
    // `01-F56` designates the snapshot as the answer to a refused delta, and `01-F74` (a) signs
    // "the set of that branch's devices" — so a device the new set omits stops being admissible.
    expect(roster.apply(snapshot(SEED_VERSION + 4, [COUNTER]), SEEDED_AT + 5_000)).toEqual({
      applied: true,
      version: SEED_VERSION + 4,
    });
    expect(roster.admit(FP_COUNTER)).not.toBeNull();
    expect(roster.admit(FP_KITCHEN)).toBeNull();
    expect(roster.list().map((e) => e.device_id)).toEqual([COUNTER.device_id]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// E — a MALFORMED update is REFUSED, never thrown (01-F17, 01-F72 (e))
// ───────────────────────────────────────────────────────────────────────────────────────────────

const badEntry = (over: Record<string, unknown>): unknown => ({ ...COUNTER, ...over });

const MALFORMED: readonly { readonly name: string; readonly update: unknown }[] = [
  { name: "null", update: null },
  { name: "undefined", update: undefined },
  { name: "a string", update: "snapshot" },
  { name: "a number", update: 7 },
  { name: "a bare array", update: [] },
  { name: "an object with no kind and no version", update: {} },
  { name: "an unknown kind", update: { kind: "roster", version: 6, entries: [] } },
  { name: "a snapshot with no version", update: { kind: "snapshot", entries: [] } },
  {
    name: "a snapshot whose version is a string",
    update: { kind: "snapshot", version: "6", entries: [] },
  },
  {
    name: "a snapshot whose version is negative",
    update: { kind: "snapshot", version: -1, entries: [] },
  },
  {
    name: "a snapshot whose version is fractional",
    update: { kind: "snapshot", version: 6.5, entries: [] },
  },
  { name: "a snapshot with no entries array", update: { kind: "snapshot", version: 6 } },
  {
    name: "a snapshot whose entries is an object",
    update: { kind: "snapshot", version: 6, entries: {} },
  },
  { name: "an entry that is null", update: { kind: "snapshot", version: 6, entries: [null] } },
  {
    name: "an entry with NO cert_sha256",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ cert_sha256: undefined })] },
  },
  {
    name: "an entry with NO device_id",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ device_id: undefined })] },
  },
  {
    name: "an entry with NO device_class",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ device_class: undefined })] },
  },
  {
    name: "an entry with NO revoked flag (fail closed — 01-F48)",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ revoked: undefined })] },
  },
  {
    name: "an entry with an EMPTY device_id",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ device_id: "" })] },
  },
  {
    name: "an entry with an EMPTY cert_sha256",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ cert_sha256: "" })] },
  },
  {
    name: "an entry whose revoked is the STRING 'false'",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ revoked: "false" })] },
  },
  {
    name: "an entry whose device_class is a number",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ device_class: 7 })] },
  },
  {
    name: "an entry whose cert_sha256 is a number",
    update: { kind: "snapshot", version: 6, entries: [badEntry({ cert_sha256: 12345 })] },
  },
  {
    name: "a delta with no from_version",
    update: { kind: "delta", version: 6, upserts: [], removals: [] },
  },
  {
    name: "a delta whose from_version is a string",
    update: { kind: "delta", from_version: "5", version: 6, upserts: [], removals: [] },
  },
  {
    name: "a delta with no upserts array",
    update: { kind: "delta", from_version: 5, version: 6, removals: [] },
  },
  {
    name: "a delta with no removals array",
    update: { kind: "delta", from_version: 5, version: 6, upserts: [] },
  },
  {
    name: "a delta whose removals contain a number",
    update: { kind: "delta", from_version: 5, version: 6, upserts: [], removals: [42] },
  },
  {
    name: "a delta carrying a malformed upsert",
    update: {
      kind: "delta",
      from_version: 5,
      version: 6,
      upserts: [badEntry({ cert_sha256: "" })],
      removals: [],
    },
  },
];

describe("E · 01-F17 / 01-F72 (e) — a malformed update is refused, never thrown", () => {
  it.each(MALFORMED)(
    "E · 01-F17: $name is refused `malformed` — the till does not stop because a wire shape was wrong",
    ({ update }) => {
      const roster = seeded();
      let result: RosterApplyResult | undefined;

      // A throw here unwinds through whatever was serving the counter. `01-F17`: a sale is never
      // blocked — not by inventory math, sync, or a frame somebody upstream mis-encoded.
      expect(() => {
        result = roster.apply(update as RosterUpdate, SEEDED_AT + 5_000);
      }).not.toThrow();

      // Reading R-4: the refusal names the version the DEVICE holds. On a malformed update the
      // offered version may not even be a number.
      expect(result).toEqual({ applied: false, reason: "malformed", version: SEED_VERSION });
      expect(roster.version()).toBe(SEED_VERSION);

      // And the roster it already had is intact — a bad frame must not cost a branch its LAN.
      // NOTE: the revoked device is deliberately NOT re-checked on every row — that assertion
      // belongs to §B and to E-revoked below, and repeating it here would make a revocation
      // defect red 29 tests in the wrong section (attribution, per the round-3 law).
      expect(roster.admit(FP_COUNTER)).toEqual({
        device_id: COUNTER.device_id,
        device_class: COUNTER.device_class,
      });
    },
  );

  it("E-revoked · 01-F48 / 01-F17: a malformed update does not partially apply and un-revoke a device", () => {
    // The dangerous half of "refused": a refusal that had already written some rows before it
    // noticed the bad one would be `01-F48`'s fail-closed rule failing open, at the exact moment
    // the device has the least reason to trust its input.
    const roster = seeded();
    roster.apply(
      {
        kind: "snapshot",
        version: 6,
        entries: [
          { ...MANAGER_REVOKED, revoked: false },
          { ...COUNTER, cert_sha256: "" },
        ],
      } as unknown as RosterUpdate,
      SEEDED_AT + 5_000,
    );
    expect(roster.admit(FP_MANAGER)).toBeNull();
    expect(roster.version()).toBe(SEED_VERSION);
  });

  it("E-last · 01-F17: a store that has never received anything still refuses a malformed update rather than throwing", () => {
    const roster = memoryRoster();
    let result: RosterApplyResult | undefined;
    expect(() => {
      result = roster.apply(null as unknown as RosterUpdate, SEEDED_AT);
    }).not.toThrow();
    expect(result).toEqual({ applied: false, reason: "malformed", version: 0 });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// F — removal removes (01-F74 (a))
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("F · 01-F74 (a) — removal removes", () => {
  it("F1 · 01-F74 (a) / 01-F48: after a delta removing a device, its fingerprint no longer admits", () => {
    const roster = seeded();
    expect(roster.admit(FP_KITCHEN)).not.toBeNull();

    expect(roster.apply(delta(5, 6, [], [KITCHEN.device_id]), SEEDED_AT + 1_000)).toEqual({
      applied: true,
      version: 6,
    });

    expect(roster.admit(FP_KITCHEN)).toBeNull();
    expect(
      roster
        .list()
        .map((e) => e.device_id)
        .sort(),
    ).toEqual([COUNTER.device_id, MANAGER_REVOKED.device_id].sort());
    // The sibling is untouched: removal removed ONE device, not the branch's LAN.
    expect(roster.admit(FP_COUNTER)).toEqual({
      device_id: COUNTER.device_id,
      device_class: COUNTER.device_class,
    });
  });

  it("F2 · 01-F74 (a): removal is BY device_id — naming a fingerprint removes nobody", () => {
    // `RosterDelta.removals` is declared as device_ids. A store removing by the wrong column would
    // silently keep a device the cloud dropped from the branch.
    const roster = seeded();
    expect(roster.apply(delta(5, 6, [], [FP_KITCHEN]), SEEDED_AT + 1_000)).toEqual({
      applied: true,
      version: 6,
    });
    expect(roster.admit(FP_KITCHEN)).toEqual({
      device_id: KITCHEN.device_id,
      device_class: KITCHEN.device_class,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// G — device_class comes from the ROSTER, not from the certificate (01-F73 (b))
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("G · 01-F73 (b) — the roster answers what a device may do", () => {
  it("G1 · 01-F73 (b): re-classing a device by delta changes what admit returns, with NO new certificate", () => {
    // "Class decides hub eligibility (`01-F39`), it changes when a device is re-purposed, and a
    // certificate is a long-lived credential — so putting it here would mean re-issuing a
    // credential to change a role." The fingerprint below is byte-identical before and after.
    const roster = seeded();
    expect(roster.admit(FP_KITCHEN)).toEqual({
      device_id: KITCHEN.device_id,
      device_class: "kitchen",
    });

    expect(
      roster.apply(delta(5, 6, [{ ...KITCHEN, device_class: "manager" }]), SEEDED_AT + 1_000),
    ).toEqual({ applied: true, version: 6 });

    expect(roster.admit(FP_KITCHEN)).toEqual({
      device_id: KITCHEN.device_id,
      device_class: "manager",
    });
    // Same certificate throughout — the re-purpose cost no re-issue.
    expect(roster.list().find((e) => e.device_id === KITCHEN.device_id)?.cert_sha256).toBe(
      FP_KITCHEN,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// H — ageMs reports staleness and never fabricates freshness (00 §5.7, 01-F74 (d))
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("H · 00 §5.7 / 01-F74 (d) — age is reported honestly", () => {
  it("H1 · 01-F74 (d): a roster that has never been received reports null, not zero", () => {
    // Absent and old are different states with OPPOSITE dispositions — absent refuses, old admits.
    // A zero here is the aged-number-shown-as-fresh failure `00 §5.7` exists to forbid, and it
    // would report the most dangerous possible answer for the most dangerous possible state.
    expect(memoryRoster().ageMs(SEEDED_AT)).toBeNull();
  });

  it("H2 · 00 §5.7: after one applied update the age is the true wall-clock age", () => {
    const roster = memoryRoster();
    roster.apply(snapshot(1, [COUNTER]), SEEDED_AT);
    expect(roster.ageMs(SEEDED_AT)).toBe(0);
    expect(roster.ageMs(SEEDED_AT + 90_000)).toBe(90_000);
    expect(roster.ageMs(SEEDED_AT + 26 * 60 * 60 * 1_000)).toBe(26 * 60 * 60 * 1_000);
  });

  it.each([
    {
      name: "stale (an older snapshot)",
      update: snapshot(SEED_VERSION - 2, [COUNTER]) as RosterUpdate,
    },
    {
      name: "needs_snapshot (a delta on the wrong base)",
      update: delta(SEED_VERSION - 1, SEED_VERSION + 1, [COUNTER]) as RosterUpdate,
    },
    {
      name: "malformed (a shape off the wire)",
      update: { kind: "snapshot" } as unknown as RosterUpdate,
    },
  ])(
    "H3 · 00 §5.7 / 01-F74 (d): a REFUSED update — $name — does not reset the age",
    ({ update }) => {
      // The subtle one. A refused update is not a receipt: if it reset the clock, a device cut off
      // from the cloud but still being handed replays would report itself fresh for ever, and
      // `01-F74` (d)'s "admit, and surface its age" would be surfacing a lie.
      const roster = seeded();
      expect(roster.ageMs(SEEDED_AT + 3_600_000)).toBe(3_600_000);

      const result = roster.apply(update, SEEDED_AT + 3_600_000);
      expect(result.applied).toBe(false);

      expect(roster.ageMs(SEEDED_AT + 3_600_000)).toBe(3_600_000);
      expect(roster.ageMs(SEEDED_AT + 7_200_000)).toBe(7_200_000);
    },
  );

  it("H4 · 01-F74 (d): a refusal before any successful update leaves the roster NEVER-RECEIVED", () => {
    const roster = memoryRoster();
    expect(roster.apply({ kind: "delta" } as unknown as RosterUpdate, SEEDED_AT).applied).toBe(
      false,
    );
    expect(roster.ageMs(SEEDED_AT + 1_000)).toBeNull();
  });

  it("H5 · 00 §5.7: an APPLIED update DOES reset the age — the control on H3", () => {
    // Without this, an implementation whose age froze at first receipt (or ignored `received_at`
    // entirely) would pass every assertion in H3.
    const roster = seeded();
    expect(roster.ageMs(SEEDED_AT + 3_600_000)).toBe(3_600_000);

    expect(roster.apply(delta(5, 6, [], []), SEEDED_AT + 3_600_000)).toEqual({
      applied: true,
      version: 6,
    });

    expect(roster.ageMs(SEEDED_AT + 3_600_000)).toBe(0);
    expect(roster.ageMs(SEEDED_AT + 3_601_000)).toBe(1_000);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// I — an EMPTY roster admits nobody, and is distinguishable from a never-received one
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("I · 01-F72 (d) / 01-F74 (d) — empty is not the same state as absent", () => {
  it("I1 · 01-F72 (d): before any roster has been received, NOBODY is admitted", () => {
    // "A roster that is absent … is unreadable: refuse, per `01-F48`." A store that opened
    // permissive would be `01-F72`'s shipped defect with a database behind it.
    const roster = memoryRoster();
    expect(roster.version()).toBe(0);
    expect(roster.list()).toEqual([]);
    for (const fp of [FP_COUNTER, FP_KITCHEN, FP_MANAGER, FP_STRANGER]) {
      expect(roster.admit(fp)).toBeNull();
    }
  });

  it("I2 · 01-F74 (a): an EMPTY roster admits nobody — including devices it named one version ago", () => {
    const roster = seeded();
    expect(roster.apply(snapshot(SEED_VERSION + 1, []), SEEDED_AT + 1_000)).toEqual({
      applied: true,
      version: SEED_VERSION + 1,
    });
    expect(roster.list()).toEqual([]);
    for (const fp of [FP_COUNTER, FP_KITCHEN, FP_MANAGER, FP_STRANGER]) {
      expect(roster.admit(fp)).toBeNull();
    }
  });

  it("I3 · 01-F74 (d) / 00 §5.7: an empty received roster is DISTINGUISHABLE from a never-received one", () => {
    // Both admit nobody, and they are not the same state: one is a branch whose devices were all
    // removed, the other is a device that has never heard from the cloud. `01-F74` (d) gives them
    // opposite dispositions, so the store must be able to tell them apart.
    const never = memoryRoster();
    const empty = memoryRoster();
    empty.apply(snapshot(1, []), SEEDED_AT);

    expect(never.ageMs(SEEDED_AT + 1_000)).toBeNull();
    expect(empty.ageMs(SEEDED_AT + 1_000)).toBe(1_000);
    expect(never.admit(FP_COUNTER)).toBeNull();
    expect(empty.admit(FP_COUNTER)).toBeNull();
  });
});
