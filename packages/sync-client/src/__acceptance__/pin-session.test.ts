// Acceptance tests — S-0b, part 2 of 2: the PIN SESSION on the device. Part 1
// (`packages/domain/src/__acceptance__/pin-session.test.ts`) owns `hashPin`/`verifyPin`.
//
// Authored from spec text ONLY, by a session that has read no implementation and no
// implementation plan (`24 §3` step 2; brief: `plans/wave-1/identity-test-brief.md`).
// Sources, and nothing else:
//   `specs/01-kernel-sync.md`
//     `01-F1`   the ledger is append-only — nothing written to it can be redacted later
//     `01-F5`   `audit.login` is ALREADY one of the six `audit.*` subtypes; the chain link
//               `prev_audit_hash` is STORE-OWNED ("a caller-supplied value is rejected")
//     `01-F17`  a sale is never blocked — a shape the device cannot read is a refusal, never
//               an exception unwinding through whatever was serving the till
//     `01-F21`  reference data: versioned, "distributed to devices as reference-data
//               snapshots + deltas over the same sync channel"
//     `01-F25`  Device (registered, class-typed, revocable token); registration is a one-time
//               pairing — participation presupposes it
//     `01-F26`  User × Role × per-location assignment; PIN (Argon2id) unlock on SHARED
//               devices; idle auto-lock (device-layer setting)
//     `01-F27`  server-side authorization on every operation; device tokens carry DEVICE
//               identity ONLY — user identity comes from the PIN session; BOTH are validated
//     `01-F28`  offline auth: PIN verification works ON-DEVICE against SYNCED credential
//               hashes; role changes propagate as reference data
//     `01-F42`  a revoked device or ROLE receives a local-purge command on next contact
//     `01-F48`  revocation is fail-closed
//   `specs/00-platform-overview.md`
//     §5.1  offline-first: every in-branch function works with WAN down, indefinitely
//     §5.2  a confirmed transaction survives instant power loss
//     §5.4  "PINs Argon2id-hashed, LOCKOUT ON REPEATED FAILURE"
//     §7    layer 3 (branch/device) owns the "idle-lock timeout"
//
// RED-AWAITING-IMPLEMENTATION. `@restos/sync-client` exports no `createPinSession`, the
// `DeviceStore` carries no `staff` registry, and `@restos/domain` exports no `hashPin`, so
// every test below fails inside a named resolver. The namespace casts are deliberate (the
// `permission-matrix.test.ts` idiom): this file TYPECHECKS before the implementation exists,
// so a missing export is a loud per-test runtime failure rather than a module-load crash that
// reds `pnpm typecheck` repo-wide.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE TEST THIS FILE EXISTS FOR — §2. `01-F28` is about OFFLINE, and a PIN check that quietly
// calls the cloud passes every other test in this suite. So §2 does not merely omit a
// transport: it TRAPS `fetch`, `WebSocket`, `http/https.request`, `tls.connect`, `dns.lookup`
// and `net.Socket#connect` for the duration of the unlock, and §2a is a CONTROL that proves
// the trap bites before §2b relies on it. A jail nobody demonstrated is exactly the guard
// that "was never pointed at the dangerous case".
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// PINNED INTERPRETATIONS — every place the FRs stop short. Recorded so the implementer can
// CONTEST the reading before building rather than discover it afterwards. Each pin is used by
// a named section, so contesting one costs that section and not the suite.
//
//  P1. `store.staff` — THE REGISTRY RIDES THE SAME CHAIN AS THE CATALOG, and is reached the
//      same way (`store.catalog` is the precedent). `01-F28` says role changes "propagate as
//      reference data" and `01-F21` says reference data is versioned and travels as snapshots
//      + deltas over the same sync channel; a second bespoke transport for credentials would
//      be a new sync path nobody specified. §1.
//  P2. THE REFERENCE-DATA REFUSAL VOCABULARY is the catalog's, because it is the same chain:
//      `{ applied: true, version }` or `{ applied: false, reason, version }` with `reason` in
//      `stale | needs_snapshot | malformed`. §1.
//  P3. `StaffMember` is `{ user_id, pin_hash, assignments: [{ role, branch_id }] }`.
//      `01-F26` is literally "User × Role × per-location assignment" and `01-F28` is literally
//      "synced credential hashes". `branch_id: null` = org-wide. `01-F26`'s per-user
//      permission OVERRIDES are deliberately NOT modelled — no FR states their shape, and
//      inventing one is how a test gets written to pass. Reported as a finding.
//  P4. `createPinSession({ registry, device, idle_lock_ms, max_failed_attempts, now, audit })`
//      and `PinSession = { unlock, lock, touch, currentUser }`. `now: () => number` is
//      INJECTED so idle auto-lock is tested by moving a variable, never by sleeping — the
//      brief bans timing-dependent PIN tests and Argon2id is deliberately slow.
//  P5. `max_failed_attempts: N` means the device tolerates N consecutive failures and refuses
//      the (N+1)th attempt — including one carrying the CORRECT PIN. §4 asserts both sides of
//      that boundary (N−1 failures then correct ⇒ unlocked; N failures then correct ⇒
//      refused), so the off-by-one is pinned rather than left to be discovered.
//  P6. `device: { device_id, registered }`. `01-F27` says BOTH factors are validated and
//      `01-F25` makes registration the pairing that grants participation; `01-F48` makes the
//      failure direction fail-closed. THE NAMED ALTERNATIVE is gating this in the host rather
//      than in the session — if the implementer prefers it, contest §3b before building.
//  P7. `audit(record: { type, payload })` is a SINK the session is constructed with, not a
//      direct `store.append`. Two reasons: `01-F5` makes `prev_audit_hash` store-owned (the
//      device stamps it inside the append transaction and REJECTS a caller-supplied value),
//      and `02-F41`'s "`actor_user_id` reaching the envelope" belongs to S-0c, not here. THE
//      NAMED ALTERNATIVE is having `unlock()` return the record; contest §6 before building.
//  P8. REFUSAL REASONS ARE NOT PINNED AS LITERALS — the tests assert DISTINCTNESS and a
//      name-shaped identifier instead. The property `02-F20`'s three-valued lesson teaches is
//      that collapsing distinct outcomes into one is the defect; which words carry them is
//      not a spec fact. A suite that hardcoded `"bad_pin"` would go red on a rename while
//      staying silent on the collapse that actually matters.
//  P9. LOCKOUT IS SCOPED TO (DEVICE, USER). Per-device is forced by `01-F28` itself: a device
//      with WAN down cannot know another device's failures, so a branch-wide counter is
//      unimplementable offline. Per-user on a shared device is forced by `01-F17`/`00 §5.1`:
//      `01-F26` says these are SHARED devices, so a device-wide counter means one person
//      fat-fingering their PIN three times takes the till out of service for everyone. §4c/§4d.
// P10. NOT COVERED, deliberately, and reported as findings rather than guessed at: whether
//      lockout survives session re-creation (no FR states persistence, and a counter that
//      resets on relaunch is a real hole); any cooldown that ends a lockout (no FR states
//      one — §4 asserts the refusal at a FIXED instant so it holds under either design); the
//      Argon2id cost floor (no FR states one, and measuring it would be a timing test);
//      `can()` and the permission matrix (S-0a); `actor_user_id` on the envelope (S-0c).

import dns from "node:dns";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import * as domainNs from "@restos/domain";
import { AUDIT_EVENT_TYPES } from "@restos/domain";
import { afterEach, describe, expect, it } from "vitest";
import type { DeviceStore } from "../device-store.js";
import { openStore } from "../store.js";
import * as syncClientNs from "../index.js";

// ── The contract (P1..P7) ──────────────────────────────────────────────────────────────────

type StaffAssignment = { readonly role: string; readonly branch_id: string | null };

/** `01-F26` + `01-F28` (P3). `pin_hash` is the SYNCED credential — never a PIN. */
type StaffMember = {
  readonly user_id: string;
  readonly pin_hash: string;
  readonly assignments: readonly StaffAssignment[];
};

type StaffSnapshot = {
  readonly kind: "snapshot";
  readonly version: number;
  readonly members: readonly StaffMember[];
};

type StaffDelta = {
  readonly kind: "delta";
  readonly from_version: number;
  readonly version: number;
  readonly upserts: readonly StaffMember[];
  /** `01-F42` — a revoked role stops authorising. User ids. */
  readonly removals: readonly string[];
};

type StaffUpdate = StaffSnapshot | StaffDelta;

type StaffApplyResult =
  | { readonly applied: true; readonly version: number }
  | {
      readonly applied: false;
      readonly reason: "stale" | "needs_snapshot" | "malformed";
      readonly version: number;
    };

type StaffRegistry = {
  version(): number;
  apply(update: StaffUpdate): StaffApplyResult;
  lookup(user_id: string): StaffMember | null;
};

type UnlockResult =
  | { readonly ok: true; readonly user_id: string }
  | { readonly ok: false; readonly reason: string; readonly user_id: string };

type AuditRecord = { readonly type: string; readonly payload: Record<string, unknown> };

type PinSession = {
  unlock(user_id: string, pin: string): Promise<UnlockResult>;
  lock(): void;
  /** Register activity — resets the idle timer (`01-F26`). */
  touch(): void;
  /** Whoever's PIN is in, or null. Evaluates idle auto-lock against the injected clock. */
  currentUser(): string | null;
};

type PinSessionOptions = {
  registry: StaffRegistry;
  device: { device_id: string; registered: boolean };
  idle_lock_ms: number;
  max_failed_attempts: number;
  now: () => number;
  audit: (record: AuditRecord) => void;
};

// ── Resolvers: every missing export fails ONE test loudly, by name ─────────────────────────

const maybeDomain = domainNs as unknown as { hashPin?: (pin: string) => Promise<string> };
const maybeSyncClient = syncClientNs as unknown as {
  createPinSession?: (options: PinSessionOptions) => PinSession;
};

const hashPin = (pin: string): Promise<string> => {
  const fn = maybeDomain.hashPin;
  if (typeof fn !== "function") {
    throw new Error(
      "@restos/domain exports no `hashPin(pin)` — the registry cannot be seeded with the " +
        "Argon2id credential hashes `01-F28` says are synced to the device (S-0b part 1).",
    );
  }
  return fn(pin);
};

const staffOf = (store: DeviceStore): StaffRegistry => {
  const registry = (store as unknown as { staff?: StaffRegistry }).staff;
  if (!registry || typeof registry.apply !== "function") {
    throw new Error(
      "DeviceStore exposes no `staff` registry — `01-F28` propagates roles and credential " +
        "hashes as REFERENCE DATA, which `01-F21` puts on the same versioned snapshot+delta " +
        "chain the catalog already rides (`store.catalog` is the precedent; S-0b pin P1).",
    );
  }
  return registry;
};

const createPinSession = (options: PinSessionOptions): PinSession => {
  const fn = maybeSyncClient.createPinSession;
  if (typeof fn !== "function") {
    throw new Error(
      "@restos/sync-client exports no `createPinSession(options)` — `01-F27` says user " +
        "identity comes from the PIN session, and `01-F26` puts idle auto-lock on it " +
        "(S-0b pin P4).",
    );
  }
  return fn(options);
};

// ── The network jail (§2) ──────────────────────────────────────────────────────────────────

const JAIL = "NETWORK JAIL";

type Jail = { release: () => void; patched: readonly string[]; calls: readonly string[] };

const asRecord = (o: object): Record<string, unknown> => o as unknown as Record<string, unknown>;

/**
 * Trap every outbound path Node offers, so a PIN verification that reaches the network THROWS
 * instead of quietly succeeding. `01-F28`'s whole content is that this path is offline; a test
 * that merely declines to pass a transport in would pass against an implementation that
 * constructed its own.
 *
 * Each patch is attempted independently and `patched` records what took — §2a asserts the two
 * that carry the property (`fetch` and `net.Socket#connect`, the floor under `ws`, `undici`
 * and every HTTP client) are among them, so a silently-ineffective jail cannot masquerade as
 * a passing offline test.
 *
 * Every trap RECORDS the call as well as throwing, and the §2 tests assert `calls` is empty.
 * Throwing alone is not enough: the likeliest real implementation of this defect is
 * `try { await fetch(...) } catch { /* fall back to the local hash *\/ }`, which swallows the
 * throw and passes a jail that only throws — while still being a device that phones home on
 * every unlock and stalls behind a DNS timeout the moment the WAN is merely SLOW rather than
 * down. Recording catches it; throwing catches the rest.
 */
const jailNetwork = (): Jail => {
  const restores: (() => void)[] = [];
  const patched: string[] = [];
  const calls: string[] = [];

  const trap = (label: string) => (): never => {
    calls.push(label);
    throw new Error(`${JAIL}: ${label} was called on the PIN verification path (01-F28)`);
  };

  const patch = (holder: Record<string, unknown>, key: string, label: string): void => {
    const previous = holder[key];
    if (previous === undefined) return;
    try {
      holder[key] = trap(label);
    } catch {
      return; // a frozen or getter-only slot; §2a's control says what actually took
    }
    if (holder[key] === previous) return;
    restores.push(() => {
      holder[key] = previous;
    });
    patched.push(label);
  };

  patch(asRecord(globalThis), "fetch", "fetch");
  patch(asRecord(globalThis), "WebSocket", "WebSocket");
  patch(asRecord(globalThis), "XMLHttpRequest", "XMLHttpRequest");
  patch(asRecord(http), "request", "http.request");
  patch(asRecord(http), "get", "http.get");
  patch(asRecord(https), "request", "https.request");
  patch(asRecord(https), "get", "https.get");
  patch(asRecord(tls), "connect", "tls.connect");
  patch(asRecord(net), "connect", "net.connect");
  patch(asRecord(net), "createConnection", "net.createConnection");
  patch(asRecord(net.Socket.prototype), "connect", "net.Socket#connect");
  patch(asRecord(dns), "lookup", "dns.lookup");
  patch(asRecord(dns.promises), "lookup", "dns.promises.lookup");

  return {
    patched,
    calls,
    release: () => {
      for (const restore of restores.reverse()) restore();
    },
  };
};

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────

const ORG = "org-restos";
const BRANCH_A = "branch-gulberg";
const BRANCH_B = "branch-dha";
const DEVICE_1 = "device-counter-1";
const DEVICE_2 = "device-counter-2";

const CASHIER_ID = "user-ayesha";
const OTHER_ID = "user-bilal";

/**
 * Eight digits, not the four a cashier really types. Every decimal digit is also a hex digit,
 * so a short numeric PIN can appear by chance inside a UUIDv7 (`00 §6`) and turn §7c's
 * "the PIN is nowhere on disk" scan flaky. Nothing else depends on the length.
 */
const PIN = "62840173";
const OTHER_PIN = "13908425";

const identity = (device_id: string) => ({ org_id: ORG, branch_id: BRANCH_A, device_id });

const openTempStore = (device_id = DEVICE_1): DeviceStore =>
  openStore({ path: ":memory:", identity: identity(device_id) });

const member = (
  user_id: string,
  pin_hash: string,
  assignments: readonly StaffAssignment[] = [{ role: "cashier", branch_id: BRANCH_A }],
): StaffMember => ({ user_id, pin_hash, assignments });

const snapshot = (version: number, members: readonly StaffMember[]): StaffSnapshot => ({
  kind: "snapshot",
  version,
  members,
});

/** A registry already holding one cashier — i.e. reference data that has already SYNCED. */
const syncedRegistry = async (
  store: DeviceStore,
  members?: readonly StaffMember[],
): Promise<StaffRegistry> => {
  const registry = staffOf(store);
  const seeded = members ?? [member(CASHIER_ID, await hashPin(PIN))];
  registry.apply(snapshot(1, seeded));
  return registry;
};

type Clock = { now: () => number; set: (t: number) => void };

const clockAt = (start: number): Clock => {
  let t = start;
  return {
    now: () => t,
    set: (next) => {
      t = next;
    },
  };
};

type Harness = {
  session: PinSession;
  registry: StaffRegistry;
  clock: Clock;
  audits: AuditRecord[];
  store: DeviceStore;
};

const harness = async (overrides: Partial<PinSessionOptions> = {}): Promise<Harness> => {
  const store = openTempStore();
  const registry = overrides.registry ?? (await syncedRegistry(store));
  const clock = clockAt(1_700_000_000_000);
  const audits: AuditRecord[] = [];
  const session = createPinSession({
    registry,
    device: { device_id: DEVICE_1, registered: true },
    idle_lock_ms: 60_000,
    max_failed_attempts: 3,
    now: clock.now,
    audit: (record) => {
      audits.push(record);
    },
    ...overrides,
  });
  return { session, registry, clock, audits, store };
};

const jsonOf = (value: unknown): string => JSON.stringify(value ?? null) ?? "";

const NAME_SHAPED = /^[a-z][a-z0-9_]{3,}$/;

const refusalReason = (result: UnlockResult): string => {
  if (result.ok) throw new Error(`expected a refusal, got an unlock of ${result.user_id}`);
  return result.reason;
};

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

// ═══ §1 — the staff registry is `01-F21` reference data on the catalog's chain ═════════════

describe("01-F21 / 01-F28 §1 — the staff registry is reference data, not ledger", () => {
  it("starts empty at version 0 rather than refusing to open", () => {
    const registry = staffOf(openTempStore());
    expect(registry.version()).toBe(0);
    expect(registry.lookup(CASHIER_ID)).toBeNull();
  });

  it("applies a versioned snapshot and reports the version", async () => {
    const registry = staffOf(openTempStore());
    const result = registry.apply(snapshot(5, [member(CASHIER_ID, await hashPin(PIN))]));

    expect(result).toEqual({ applied: true, version: 5 });
    expect(registry.version()).toBe(5);
    expect(registry.lookup(CASHIER_ID)?.user_id).toBe(CASHIER_ID);
  });

  it("carries User × Role × per-location assignments (01-F26)", async () => {
    const registry = staffOf(openTempStore());
    registry.apply(
      snapshot(1, [
        member(CASHIER_ID, await hashPin(PIN), [
          { role: "cashier", branch_id: BRANCH_A },
          { role: "branch_manager", branch_id: BRANCH_B },
        ]),
      ]),
    );

    // Order is not asserted — `01-F26` gives a SET of (role, location) pairs, and this suite
    // makes no unordered-collection assumption.
    const assignments = registry.lookup(CASHIER_ID)?.assignments ?? [];
    expect([...assignments].sort((a, b) => a.role.localeCompare(b.role))).toEqual([
      { role: "branch_manager", branch_id: BRANCH_B },
      { role: "cashier", branch_id: BRANCH_A },
    ]);
  });

  it("propagates a ROLE CHANGE by delta (01-F28)", async () => {
    const registry = staffOf(openTempStore());
    const hash = await hashPin(PIN);
    registry.apply(snapshot(1, [member(CASHIER_ID, hash)]));

    const result = registry.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [member(CASHIER_ID, hash, [{ role: "branch_manager", branch_id: BRANCH_A }])],
      removals: [],
    });

    expect(result).toEqual({ applied: true, version: 2 });
    expect(registry.lookup(CASHIER_ID)?.assignments).toEqual([
      { role: "branch_manager", branch_id: BRANCH_A },
    ]);
  });

  it("removes a user by delta, and the removed user can no longer unlock (01-F42)", async () => {
    const h = await harness();
    h.registry.apply({
      kind: "delta",
      from_version: 1,
      version: 2,
      upserts: [],
      removals: [CASHIER_ID],
    });

    expect(h.registry.lookup(CASHIER_ID)).toBeNull();
    const result = await h.session.unlock(CASHIER_ID, PIN);
    expect(result.ok).toBe(false);
    expect(h.session.currentUser()).toBeNull();
  });

  it("REFUSES a delta whose base it does not hold, and changes nothing (P2)", async () => {
    const h = await harness();
    const before = h.registry.lookup(CASHIER_ID);

    const result = h.registry.apply({
      kind: "delta",
      from_version: 9, // the registry is at 1
      version: 10,
      upserts: [member(CASHIER_ID, await hashPin(OTHER_PIN), [])],
      removals: [],
    });

    // Applying it would silently diverge THIS device's roles from every other device's —
    // and the divergence is a credential, not a menu word.
    expect(result).toEqual({ applied: false, reason: "needs_snapshot", version: 1 });
    expect(h.registry.version()).toBe(1);
    expect(h.registry.lookup(CASHIER_ID)).toEqual(before);
  });

  it("REFUSES an older snapshot, so a revoked user is not resurrected (P2)", async () => {
    const registry = staffOf(openTempStore());
    const hash = await hashPin(PIN);
    registry.apply(snapshot(1, [member(CASHIER_ID, hash), member(OTHER_ID, hash)]));
    registry.apply(snapshot(4, [member(CASHIER_ID, hash)])); // OTHER_ID let go at v4

    const result = registry.apply(snapshot(2, [member(CASHIER_ID, hash), member(OTHER_ID, hash)]));

    expect(result).toEqual({ applied: false, reason: "stale", version: 4 });
    expect(registry.version()).toBe(4);
    expect(registry.lookup(OTHER_ID)).toBeNull();
  });

  it("REFUSES a malformed update instead of throwing (01-F17)", async () => {
    const h = await harness();
    const before = h.registry.lookup(CASHIER_ID);

    // Arrives off a wire. A throw here unwinds through whatever was serving the till.
    const garbage = { kind: "snapshot", version: 7, members: [{ user_id: 42 }] };
    const result = h.registry.apply(garbage as unknown as StaffUpdate);

    expect(result).toEqual({ applied: false, reason: "malformed", version: 1 });
    expect(h.registry.lookup(CASHIER_ID)).toEqual(before);
  });

  it("writes NO events — a credential hash never enters the append-only ledger (01-F1)", async () => {
    const store = openTempStore();
    const before = store.readAllEvents().length;
    await syncedRegistry(store);

    // `01-F1` makes the ledger permanent. A credential that lands in it can never be rotated
    // away, and `01-F21` already says reference data travels beside the ledger, not inside it.
    expect(store.readAllEvents().length).toBe(before);
    expect(store.readAllEvents()).toEqual([]);
  });

  it("survives a restart, so a device that reboots offline can still unlock (00 §5.2)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "restos-pin-restart-"));
    tempDirs.push(dir);
    const path = join(dir, "device.db");

    const first = openStore({ path, identity: identity(DEVICE_1) });
    await syncedRegistry(first);
    first.close();

    const second = openStore({ path, identity: identity(DEVICE_1) });
    const registry = staffOf(second);
    expect(registry.version()).toBe(1);
    expect(registry.lookup(CASHIER_ID)?.user_id).toBe(CASHIER_ID);
    second.close();
  });
});

// ═══ §2 — `01-F28` is about OFFLINE. This is the section this file exists for ══════════════

describe("01-F28 §2 — PIN verification happens on-device, with no network at all", () => {
  it("§2a CONTROL — the network jail actually bites", () => {
    const jail = jailNetwork();
    try {
      // Without this control the two tests below are indistinguishable from tests that
      // installed nothing at all — the exact "guard that was never pointed at the dangerous
      // case" shape the round-3 law names.
      expect(jail.patched).toContain("fetch");
      expect(jail.patched).toContain("net.Socket#connect");

      expect(() => globalThis.fetch("https://cloud.invalid/verify")).toThrow(JAIL);
      expect(() => new net.Socket().connect(443, "cloud.invalid")).toThrow(JAIL);
      expect(() => https.request("https://cloud.invalid/verify")).toThrow(JAIL);

      // The RECORDER is the half that survives a swallowed throw, so it needs its own control.
      expect(jail.calls).toEqual(["fetch", "net.Socket#connect", "https.request"]);
    } finally {
      jail.release();
    }

    // And it is fully released afterwards, or every later test in the file runs jailed.
    expect(typeof globalThis.fetch).toBe("function");
    expect(() => new net.Socket().destroy()).not.toThrow();
  });

  it("§2b unlocks against a SYNCED credential hash with every network path trapped", async () => {
    const h = await harness(); // the hash is already on the device — this is `01-F28`

    const jail = jailNetwork();
    let result: UnlockResult;
    try {
      result = await h.session.unlock(CASHIER_ID, PIN);
    } finally {
      jail.release();
    }

    expect(result).toEqual({ ok: true, user_id: CASHIER_ID });
    expect(h.session.currentUser()).toBe(CASHIER_ID);
    // Not merely "it worked anyway" — nothing reached for the network at all, so a
    // try/catch around a cloud check cannot hide here either.
    expect(jail.calls).toEqual([]);
  });

  it("§2c refuses a WRONG PIN with every network path trapped", async () => {
    const h = await harness();

    const jail = jailNetwork();
    let result: UnlockResult;
    try {
      result = await h.session.unlock(CASHIER_ID, "62840174");
    } finally {
      jail.release();
    }

    // Offline must not mean permissive. The refusal names the attempt.
    expect(result.ok).toBe(false);
    expect(refusalReason(result)).toMatch(NAME_SHAPED);
    expect(result.user_id).toBe(CASHIER_ID);
    expect(h.session.currentUser()).toBeNull();
    expect(jail.calls).toEqual([]);
  });

  it("§2d refuses a user the device has never synced, without throwing (01-F17)", async () => {
    const h = await harness();

    const jail = jailNetwork();
    let result: UnlockResult;
    try {
      // The tempting implementation asks the cloud "who is this?" — which is precisely the
      // network call `01-F28` forbids, and which fails at the exact moment it is needed.
      result = await h.session.unlock("user-never-synced", PIN);
    } finally {
      jail.release();
    }

    expect(result.ok).toBe(false);
    expect(h.session.currentUser()).toBeNull();
    expect(jail.calls).toEqual([]);
  });
});

// ═══ §3 — `01-F27`: two axes, device and user, on purpose ═════════════════════════════════

describe("01-F27 §3 — a device token carries DEVICE identity only", () => {
  it("§3a a fresh session on a fully registered device has NO user", async () => {
    const h = await harness();

    // The device is registered, the registry is synced, and still nobody is signed in. A
    // shoulder-surfed 4-digit PIN becomes a remote credential the moment these two axes are
    // conflated, so the device must confer no user at all.
    expect(h.session.currentUser()).toBeNull();
    expect(h.session.currentUser()).not.toBe(DEVICE_1);
  });

  it("§3b refuses the CORRECT PIN on an unregistered device (P6, 01-F25/F48)", async () => {
    const registered = await harness();
    const unregistered = await harness({
      registry: registered.registry,
      device: { device_id: DEVICE_2, registered: false },
    });

    const good = await registered.session.unlock(CASHIER_ID, PIN);
    const refused = await unregistered.session.unlock(CASHIER_ID, PIN);

    expect(good).toEqual({ ok: true, user_id: CASHIER_ID });
    expect(refused.ok).toBe(false);
    expect(unregistered.session.currentUser()).toBeNull();
    expect(refusalReason(refused)).toMatch(NAME_SHAPED);
  });

  it("§3c names the DEVICE problem distinctly from the PIN problem (P8)", async () => {
    const registered = await harness();
    const unregistered = await harness({
      registry: registered.registry,
      device: { device_id: DEVICE_2, registered: false },
    });

    const badPin = refusalReason(await registered.session.unlock(CASHIER_ID, "62840174"));
    const noDevice = refusalReason(await unregistered.session.unlock(CASHIER_ID, PIN));

    // Collapsing these tells the cashier to re-key a PIN that was already right, forever, on a
    // terminal that will never accept it — and hides a revoked device behind a typo message.
    expect(noDevice).not.toEqual(badPin);
  });

  it("§3d a PIN session does not travel between devices", async () => {
    const one = await harness();
    const two = await harness({
      registry: one.registry,
      device: { device_id: DEVICE_2, registered: true },
    });

    expect(await one.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });

    // Same org, same branch, same synced registry, same user — and the second terminal is
    // still locked. `01-F27` validates BOTH factors, so identity is per (device, session).
    expect(one.session.currentUser()).toBe(CASHIER_ID);
    expect(two.session.currentUser()).toBeNull();
  });
});

// ═══ §4 — `00 §5.4`: lockout on repeated failure ══════════════════════════════════════════

describe("00 §5.4 §4 — lockout on repeated failure", () => {
  it("§4a a first wrong PIN is a wrong PIN, not a lockout", async () => {
    const h = await harness({ max_failed_attempts: 3 });
    const first = refusalReason(await h.session.unlock(CASHIER_ID, "62840174"));

    // Then the correct PIN still works — one typo must not cost a shift.
    expect(await h.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });
    expect(first).toMatch(NAME_SHAPED);
  });

  it("§4b refuses the CORRECT PIN after max_failed_attempts, and says so (P5, P8)", async () => {
    const h = await harness({ max_failed_attempts: 3 });
    const badPinReason = refusalReason(await h.session.unlock(CASHIER_ID, "62840174"));
    await h.session.unlock(CASHIER_ID, "62840175");

    // Two failures is BELOW the threshold: the correct PIN must still be accepted, or the
    // number is decoration.
    expect(await h.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });
    h.session.lock();

    await h.session.unlock(CASHIER_ID, "62840174");
    await h.session.unlock(CASHIER_ID, "62840175");
    await h.session.unlock(CASHIER_ID, "62840176");
    const locked = await h.session.unlock(CASHIER_ID, PIN);

    expect(locked.ok).toBe(false);
    expect(h.session.currentUser()).toBeNull();
    // The refusal must NAME a lockout. An implementation that keeps answering "wrong PIN"
    // leaves the cashier re-keying a correct PIN at the counter with a queue behind them.
    expect(refusalReason(locked)).toMatch(NAME_SHAPED);
    expect(refusalReason(locked)).not.toEqual(badPinReason);
  });

  it("§4c one user's failures do not lock out another on a SHARED device (P9, 01-F17)", async () => {
    const store = openTempStore();
    const hash = await hashPin(PIN);
    const otherHash = await hashPin(OTHER_PIN);
    const registry = staffOf(store);
    registry.apply(snapshot(1, [member(CASHIER_ID, hash), member(OTHER_ID, otherHash)]));
    const h = await harness({ registry, max_failed_attempts: 3 });

    await h.session.unlock(CASHIER_ID, "62840174");
    await h.session.unlock(CASHIER_ID, "62840175");
    await h.session.unlock(CASHIER_ID, "62840176");

    // `01-F26` calls these SHARED devices. A device-wide counter means one person's typos
    // take the till out of service for the whole shift — a stopped till, which `00 §5.1`
    // and `01-F17` exist to forbid.
    expect(await h.session.unlock(OTHER_ID, OTHER_PIN)).toEqual({ ok: true, user_id: OTHER_ID });
  });

  it("§4e a successful unlock clears the counter", async () => {
    const h = await harness({ max_failed_attempts: 3 });

    await h.session.unlock(CASHIER_ID, "62840174");
    await h.session.unlock(CASHIER_ID, "62840175");
    expect(await h.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });
    h.session.lock();

    await h.session.unlock(CASHIER_ID, "62840174");
    await h.session.unlock(CASHIER_ID, "62840175");

    // A counter that only ever climbs locks every cashier out within a week of ordinary
    // typos — a stopped till on a fixed schedule (`00 §5.1`, `01-F17`). "Repeated failure"
    // in `00 §5.4` is consecutive failure; a proven PIN is proof the run ended.
    expect(await h.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });
  });

  it("§4d failures do not cross devices (P9 — forced by 01-F28's offline law)", async () => {
    const one = await harness({ max_failed_attempts: 3 });
    const two = await harness({
      registry: one.registry,
      device: { device_id: DEVICE_2, registered: true },
      max_failed_attempts: 3,
    });

    await one.session.unlock(CASHIER_ID, "62840174");
    await one.session.unlock(CASHIER_ID, "62840175");
    await one.session.unlock(CASHIER_ID, "62840176");

    // A device with WAN down cannot learn another device's failures, so a branch-wide counter
    // is unimplementable under `01-F28` — and would hand anyone a branch-wide denial of
    // service from any terminal.
    expect(await two.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });
  });
});

// ═══ §5 — `01-F26` / `00 §7` layer 3: idle auto-lock ══════════════════════════════════════

describe("01-F26 §5 — idle auto-lock", () => {
  it("§5a holds the session while the device is in use", async () => {
    const h = await harness({ idle_lock_ms: 60_000 });
    const t0 = h.clock.now();
    await h.session.unlock(CASHIER_ID, PIN);

    h.clock.set(t0 + 30_000);
    expect(h.session.currentUser()).toBe(CASHIER_ID);
  });

  it("§5b locks after the idle window, with no PIN in", async () => {
    const h = await harness({ idle_lock_ms: 60_000 });
    const t0 = h.clock.now();
    await h.session.unlock(CASHIER_ID, PIN);

    h.clock.set(t0 + 200_000);
    expect(h.session.currentUser()).toBeNull();
  });

  it("§5c READING the session is not activity", async () => {
    const h = await harness({ idle_lock_ms: 60_000 });
    const t0 = h.clock.now();
    await h.session.unlock(CASHIER_ID, PIN);

    // If `currentUser()` refreshed the timer, a screen that polls it — every POS screen —
    // would hold the session open forever and idle auto-lock would never fire anywhere.
    h.clock.set(t0 + 30_000);
    expect(h.session.currentUser()).toBe(CASHIER_ID);
    h.clock.set(t0 + 55_000);
    expect(h.session.currentUser()).toBe(CASHIER_ID);
    h.clock.set(t0 + 70_000);
    expect(h.session.currentUser()).toBeNull();
  });

  it("§5d activity resets the idle window", async () => {
    const h = await harness({ idle_lock_ms: 60_000 });
    const t0 = h.clock.now();
    await h.session.unlock(CASHIER_ID, PIN);

    h.clock.set(t0 + 50_000);
    h.session.touch();
    h.clock.set(t0 + 100_000); // 50 s idle
    expect(h.session.currentUser()).toBe(CASHIER_ID);

    h.clock.set(t0 + 200_000); // 150 s idle
    expect(h.session.currentUser()).toBeNull();
  });

  it("§5e the timeout is a DEVICE-LAYER SETTING, not a constant (00 §7 layer 3)", async () => {
    const brief = await harness({ idle_lock_ms: 60_000 });
    const long = await harness({ registry: brief.registry, idle_lock_ms: 600_000 });
    const t0 = brief.clock.now();

    await brief.session.unlock(CASHIER_ID, PIN);
    await long.session.unlock(CASHIER_ID, PIN);
    brief.clock.set(t0 + 120_000);
    long.clock.set(t0 + 120_000);

    // A hardcoded timeout passes §5a–§5d and fails here. `00 §7` layer 3 names this setting
    // explicitly — a quiet counter and a busy one want different numbers.
    expect(brief.session.currentUser()).toBeNull();
    expect(long.session.currentUser()).toBe(CASHIER_ID);
  });

  it("§5f an auto-lock is not a lockout — the same PIN unlocks again", async () => {
    const h = await harness({ idle_lock_ms: 60_000, max_failed_attempts: 3 });
    const t0 = h.clock.now();
    await h.session.unlock(CASHIER_ID, PIN);

    h.clock.set(t0 + 200_000);
    expect(h.session.currentUser()).toBeNull();

    expect(await h.session.unlock(CASHIER_ID, PIN)).toEqual({ ok: true, user_id: CASHIER_ID });
    expect(h.session.currentUser()).toBe(CASHIER_ID);
  });

  it("§5g an explicit lock() drops the user immediately", async () => {
    const h = await harness();
    await h.session.unlock(CASHIER_ID, PIN);
    expect(h.session.currentUser()).toBe(CASHIER_ID);

    h.session.lock();
    expect(h.session.currentUser()).toBeNull();
  });
});

// ═══ §6 — `01-F5`: `audit.login` already exists. Do not invent an event type ═══════════════

describe("01-F5 §6 — login is audited, using the subtype that already exists", () => {
  it("§6a records audit.login on a SUCCESSFUL unlock", async () => {
    const h = await harness();
    await h.session.unlock(CASHIER_ID, PIN);

    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.type).toBe("audit.login");
    // Commandment 2: the type must come from `01-F5`'s closed set, not be minted here.
    expect([...AUDIT_EVENT_TYPES]).toContain(h.audits[0]?.type);
  });

  it("§6b records audit.login on a FAILED unlock too", async () => {
    const h = await harness();
    await h.session.unlock(CASHIER_ID, "62840174");

    // A login audit that only records successes cannot show a guessing attempt — which is the
    // one thing the record is for.
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.type).toBe("audit.login");
  });

  it("§6c a success and a failure are distinguishable in the record", async () => {
    const h = await harness();
    await h.session.unlock(CASHIER_ID, PIN);
    h.session.lock();
    await h.session.unlock(CASHIER_ID, "62840174");

    const [success, failure] = h.audits;
    expect(h.audits).toHaveLength(2);
    // Vocabulary-free on purpose (P8): what matters is that the two are not the same record.
    expect(success?.payload.outcome).toBeDefined();
    expect(failure?.payload.outcome).toBeDefined();
    expect(failure?.payload.outcome).not.toEqual(success?.payload.outcome);
  });

  it("§6d the failure record names WHO was attempted and WHY it failed", async () => {
    const h = await harness();
    const result = await h.session.unlock(CASHIER_ID, "62840174");

    const record = h.audits[0];
    // "Somebody failed a login" is not an audit trail. The `01-F5` chain exists so a manager
    // can see whose credential was being guessed, and from the same vocabulary the caller saw.
    expect(jsonOf(record)).toContain(CASHIER_ID);
    expect(jsonOf(record)).toContain(refusalReason(result));
  });

  it("§6e does NOT stamp prev_audit_hash — the chain is store-owned (01-F5)", async () => {
    const h = await harness();
    await h.session.unlock(CASHIER_ID, PIN);

    // `01-F5`: the device stamps `prev_audit_hash` inside the append transaction and "a
    // caller-supplied value is rejected". A session that fills it in produces a record the
    // store REFUSES to append — the login would be unauditable, loudly, at runtime.
    expect(h.audits[0]?.payload).toBeDefined();
    expect(Object.hasOwn(h.audits[0]?.payload ?? {}, "prev_audit_hash")).toBe(false);
  });

  it("§6f audits the lockout refusal as well as the guesses", async () => {
    const h = await harness({ max_failed_attempts: 3 });
    await h.session.unlock(CASHIER_ID, "62840174");
    await h.session.unlock(CASHIER_ID, "62840175");
    await h.session.unlock(CASHIER_ID, "62840176");
    await h.session.unlock(CASHIER_ID, PIN);

    // Four attempts, four records. A lockout that stops writing the audit hides the tail of
    // the attack from the one surface that would show it (`01-F5`).
    expect(h.audits).toHaveLength(4);
    expect(h.audits.every((record) => record.type === "audit.login")).toBe(true);
  });
});

// ═══ §7 — `01-F1`: the raw PIN reaches nothing that persists ═══════════════════════════════

describe("01-F1 §7 — a raw PIN is never stored, logged, or emitted", () => {
  it("§7a stores an Argon2id hash, never the PIN", async () => {
    const h = await harness();
    const stored = h.registry.lookup(CASHIER_ID);

    expect(stored?.pin_hash).toBeDefined();
    expect(stored?.pin_hash).not.toEqual(PIN);
    expect(stored?.pin_hash?.startsWith("$argon2id$")).toBe(true);
    expect(jsonOf(stored)).not.toContain(PIN);
  });

  it("§7b the PIN appears in no audit record and on no console", async () => {
    const h = await harness({ max_failed_attempts: 3 });

    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const originals = methods.map((m) => [m, console[m]] as const);
    const captured: unknown[] = [];
    for (const m of methods) {
      console[m] = (...args: unknown[]): void => {
        captured.push(args);
      };
    }
    try {
      await h.session.unlock(CASHIER_ID, PIN);
      h.session.lock();
      await h.session.unlock(CASHIER_ID, "62840174");
      await h.session.unlock("user-never-synced", PIN);
      await h.session.unlock(CASHIER_ID, PIN);
    } finally {
      for (const [m, fn] of originals) console[m] = fn;
    }

    // `01-F1` is why this is not merely hygiene: an audit record is appended to a permanent
    // ledger, and a PIN written there cannot be redacted afterwards.
    expect(h.audits.length).toBeGreaterThan(0);
    expect(jsonOf(h.audits)).not.toContain(PIN);
    expect(jsonOf(captured)).not.toContain(PIN);
  });

  it("§7c the PIN reaches no byte on disk, and the scan proves it looked", async () => {
    const dir = mkdtempSync(join(tmpdir(), "restos-pin-disk-"));
    tempDirs.push(dir);
    const store = openStore({ path: join(dir, "device.db"), identity: identity(DEVICE_1) });
    const registry = await syncedRegistry(store);
    const session = createPinSession({
      registry,
      device: { device_id: DEVICE_1, registered: true },
      idle_lock_ms: 60_000,
      max_failed_attempts: 3,
      now: () => 1_700_000_000_000,
      audit: () => {},
    });

    await session.unlock(CASHIER_ID, PIN);
    await session.unlock(CASHIER_ID, "62840174");
    store.close();

    const bytes = readdirSync(dir)
      .map((name) => readFileSync(join(dir, name)).toString("latin1"))
      .join("\n");

    // CONTROL FIRST. Without it, a scan that finds nothing is indistinguishable from a scan
    // pointed at the wrong bytes — the credential must actually BE here, because `01-F28`
    // requires the device to verify against it after a reboot with no WAN.
    expect(bytes).toContain("$argon2id$");
    expect(bytes).not.toContain(PIN);
  });
});
