// Acceptance tests — the `audit.login` WIRING (`01-F5`).
//
// S-0b built the PIN session and left `PinSessionOptions.audit` as a sink the HOST fills in.
// Every host fills it with `() => {}` today (`apps/pos-electron/src/main/index.ts`), so a PIN
// unlock, a wrong PIN and a lockout currently leave NO TRAIL AT ALL — `01-F5` names
// `audit.login` among its six subtypes and nothing produces one. This file owns the seam that
// closes that: the sink that turns a session's `PinAuditRecord` into a ledger append.
//
// Sources:
//   `specs/01-kernel-sync.md`
//     `01-F1`   append-only — NOTHING written here can ever be redacted. This is why §2 is the
//               most important section in the file and not hygiene.
//     `01-F2`   the device persists locally before acknowledging
//     `01-F5`   the `audit.*` family, its six subtypes, and the STORE-OWNED `prev_audit_hash`
//               ("the device stamps it inside the append transaction; a caller-supplied value
//               is rejected")
//     `01-F17`  a sale is never blocked — an audit that cannot be written must not take the
//               till with it
//     `01-F26`/`01-F27`/`01-F28`/`01-F61` — the session this sink drains
//   `specs/02-pos-app.md`
//     `02-F41`  attribution is whoever's PIN is in, with no "acting for" concept
//     `02-F45`  attribution is read from the ENVELOPE (`actor_user_id`), never from a payload
//               field — one fact, one source
//   `packages/domain/src/registry.ts` — `audit.login`'s payload is `looseObject({
//               prev_audit_hash })`, and the business fields "land additively". So the fields
//               §3 asserts need NO spec change; nothing but this file requires them either.
//
// NO NEW EVENT TYPE IS INVENTED (commandment 2): `audit.login` is already in the `01 §4`
// catalog and already in `AUDIT_EVENT_TYPES`. §1a asserts exactly that.
//
// PINNED INTERPRETATIONS — recorded so they can be contested rather than discovered:
//
//  A1. THE SEAM IS A SINK FACTORY, not a change to `createPinSession`. `pin-session.ts` has no
//      store import on purpose (its own doc block, and S-0b pin P7); `01-F5` makes the chain
//      store-owned, so the session could not stamp a record the store would accept anyway.
//      `createPinAuditSink({ store, now })` returns the function the host passes as `audit`.
//      THE NAMED ALTERNATIVE is giving `PinSessionOptions` an optional `store` and building the
//      sink inside — one fewer export, one more store dependency in a protected file.
//  A2. `actor_user_id` IS THE PROVEN USER ON SUCCESS AND `null` ON FAILURE. `02-F45` puts
//      attribution in the envelope and `02-F41` makes it "whoever's PIN is in" — on a REFUSAL
//      nobody's PIN is in, so stamping the attempted id would assert an identity that was not
//      proven, permanently (`01-F1`). The attempted id is still recorded — in the payload,
//      where it reads as an ATTEMPT rather than as an attribution. §3d.
//  A3. THE SINK PROJECTS NAMED FIELDS rather than spreading the record's payload. `01-F1`
//      makes a leak permanent and un-redactable, so the ledger-facing boundary is a whitelist
//      and not a pass-through. §2c is the test that owns this; §2a is its control.
//  A4. A FAILED AUDIT APPEND IS SWALLOWED, not rethrown and not retried. `01-F17`'s "a sale is
//      never blocked" plus `01-F5`'s "audit events are ORDINARY kernel events" — an ordinary
//      append that fails must not unwind through the unlock that succeeded. It is currently
//      silent: no FR names a surface that owns "the audit trail could not be written", and
//      inventing one here would be `24-F23` slop. Reported as a finding. §4.
//  A5. NOT COVERED, deliberately: what a HOST renders for each refusal (`27`'s, and the screens
//      session's); whether an audit append should be retried; the Auditor's cross-check of
//      this chain against the merged cloud log (`20 §4.2`).

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUDIT_EVENT_TYPES, hashPin, verifyAuditChain } from "@restos/domain";
import { afterEach, describe, expect, it } from "vitest";
import type { DeviceStore } from "../device-store.js";
import * as syncClientNs from "../index.js";
import { createPinSession, type PinAuditRecord, type UnlockRefusal } from "../pin-session.js";
import type { StaffRegistry } from "../staff.js";
import { openStore } from "../store.js";

// ── The contract under test (A1) ───────────────────────────────────────────────────────────

type PinAuditSinkOptions = {
  store: DeviceStore;
  now: () => number;
};

const maybeSyncClient = syncClientNs as unknown as {
  createPinAuditSink?: (options: PinAuditSinkOptions) => (record: PinAuditRecord) => void;
};

/** RED-AWAITING-IMPLEMENTATION resolves here, by name, once per test (the house idiom). */
const createPinAuditSink = (options: PinAuditSinkOptions): ((record: PinAuditRecord) => void) => {
  const fn = maybeSyncClient.createPinAuditSink;
  if (typeof fn !== "function") {
    throw new Error(
      "@restos/sync-client exports no `createPinAuditSink({ store, now })` — `01-F5` puts " +
        "`audit.login` in the ledger on a store-owned chain, and every host today passes " +
        "`audit: () => {}`, so no unlock, refusal or lockout is audited anywhere (pin A1).",
    );
  }
  return fn(options);
};

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────

const ORG = "org-restos";
const BRANCH = "branch-gulberg";
const DEVICE = "device-counter-1";
const CASHIER_ID = "user-ayesha";

/**
 * Eight digits, not the four a cashier types: every decimal digit is also a hex digit, so a
 * four-digit PIN can appear by chance inside a UUIDv7 event id and turn §2's ledger scan
 * flaky. Nothing but the scan's stability depends on the length.
 */
const PIN = "62840173";
const WRONG_PIN = "62840174";

const identity = { org_id: ORG, branch_id: BRANCH, device_id: DEVICE };

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

const openTempStore = (): DeviceStore => openStore({ path: ":memory:", identity });

/** A store on real disk — §2d scans the FILE, not just the objects the API hands back. */
const openDiskStore = (): { store: DeviceStore; dir: string } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-pin-audit-"));
  tempDirs.push(dir);
  return { store: openStore({ path: join(dir, "device.db"), identity }), dir };
};

const seedRegistry = async (store: DeviceStore): Promise<StaffRegistry> => {
  store.staff.apply({
    kind: "snapshot",
    version: 1,
    members: [
      {
        user_id: CASHIER_ID,
        pin_hash: await hashPin(PIN),
        assignments: [{ role: "cashier", branch_id: BRANCH }],
      },
    ],
  });
  return store.staff;
};

type Harness = {
  store: DeviceStore;
  unlock: (pin: string) => Promise<{ ok: boolean }>;
  audit: (record: PinAuditRecord) => void;
  logins: () => readonly { payload: Record<string, unknown>; actor_user_id: string | null }[];
};

const harness = async (
  overrides: { store?: DeviceStore; registered?: boolean; max_failed_attempts?: number } = {},
): Promise<Harness> => {
  const store = overrides.store ?? openTempStore();
  const registry = await seedRegistry(store);
  const now = (): number => 1_700_000_000_000;
  const audit = createPinAuditSink({ store, now });
  const session = createPinSession({
    registry,
    device: { device_id: DEVICE, registered: overrides.registered ?? true },
    idle_lock_ms: 60_000,
    max_failed_attempts: overrides.max_failed_attempts ?? 3,
    now,
    audit,
  });
  return {
    store,
    audit,
    unlock: (pin) => session.unlock(CASHIER_ID, pin),
    logins: () =>
      store
        .readAllEvents()
        .filter((event) => event.type === "audit.login")
        .map((event) => ({
          payload: event.payload as Record<string, unknown>,
          actor_user_id: event.actor_user_id,
        })),
  };
};

/** What a scan of the permanent record actually sees (`01-F1`). */
const ledgerText = (store: DeviceStore): string => JSON.stringify(store.readAllEvents());

// ═══ §1 — the sink APPENDS. This is the whole gap. ═════════════════════════════════════════

describe("01-F5 §1 — an unlock, a refusal and a lockout each reach the ledger", () => {
  it("§1a a SUCCESSFUL unlock appends one audit.login — a subtype that already exists", async () => {
    const h = await harness();

    const result = await h.unlock(PIN);

    expect(result.ok).toBe(true);
    expect(h.logins()).toHaveLength(1);
    // Commandment 2 — the type is read out of the catalog, not asserted as a string this file
    // made up. A sink emitting `audit.pin_unlock` would be an invented event type.
    expect([...AUDIT_EVENT_TYPES]).toContain("audit.login");
  });

  it("§1b a WRONG PIN appends one too — an audit that records only successes is not an audit", async () => {
    const h = await harness();

    const result = await h.unlock(WRONG_PIN);

    expect(result.ok).toBe(false);
    // The guessing attempt is the event a manager reviewing `01-F5` is looking FOR. Recording
    // only the unlock would leave every failed attempt invisible in a permanent log.
    expect(h.logins()).toHaveLength(1);
  });

  it("§1c the LOCKOUT refusal is appended as well as the guesses that caused it", async () => {
    const h = await harness({ max_failed_attempts: 3 });

    await h.unlock(WRONG_PIN);
    await h.unlock(WRONG_PIN);
    await h.unlock(WRONG_PIN);
    const lockedOut = await h.unlock(PIN);

    expect(lockedOut.ok).toBe(false);
    // Four attempts, four records. A lockout that stops writing hides the TAIL of an attack
    // from the one surface that would show it — and the tail is where the attacker gets close.
    expect(h.logins()).toHaveLength(4);
  });

  it("§1d an UNREGISTERED device audits its refusal too (01-F25/01-F48 fail-closed)", async () => {
    const h = await harness({ registered: false });

    const result = await h.unlock(PIN);

    expect(result.ok).toBe(false);
    expect(h.logins()).toHaveLength(1);
  });
});

// ═══ §2 — NO RAW PIN, EVER. The single assertion this task exists for. ═════════════════════

describe("01-F1 §2 — the PIN reaches nothing permanent", () => {
  it("§2a CONTROL — the scan CAN find a PIN, so §2b/§2c/§2d are not vacuous", async () => {
    const h = await harness();
    await h.unlock(PIN);

    // Poison a copy of exactly what §2b scans. If `ledgerText`'s haystack were empty, or the
    // matcher inverted, this line would fail — and every "the PIN is absent" assertion below
    // would be passing on nothing. The three sections that follow are only as good as this.
    const poisoned = `${ledgerText(h.store)}${PIN}`;
    expect(poisoned).toContain(PIN);
    expect(ledgerText(h.store).length).toBeGreaterThan(0);
  });

  it("§2b no appended event contains the PIN — success, failure and lockout together", async () => {
    const h = await harness({ max_failed_attempts: 2 });

    await h.unlock(WRONG_PIN); // a failure carries the typed digits into the session
    await h.unlock(WRONG_PIN);
    await h.unlock(PIN); // refused: locked out, but the CORRECT PIN was typed
    await h.unlock(PIN);

    expect(h.logins().length).toBeGreaterThan(0);
    // `01-F1` is why this is not hygiene: the ledger has no update or delete path, so a PIN
    // written here is a credential the product can never take back. Every host that ever
    // syncs this device then holds it too.
    expect(ledgerText(h.store)).not.toContain(PIN);
    expect(ledgerText(h.store)).not.toContain(WRONG_PIN);
  });

  it("§2c a record carrying the PIN in an EXTRA field still lands no PIN (A3 whitelist)", async () => {
    const h = await harness();

    // A caller — a future session emitting its own record, or a sink that spread the payload
    // instead of projecting it — puts the typed digits somewhere the type does not name. The
    // ledger boundary is a whitelist, so the field never reaches the append at all.
    h.audit({
      type: "audit.login",
      payload: {
        user_id: CASHIER_ID,
        device_id: DEVICE,
        outcome: "failure",
        reason: "bad_pin",
        entered_pin: PIN,
      } as PinAuditRecord["payload"],
    });

    expect(h.logins()).toHaveLength(1);
    expect(ledgerText(h.store)).not.toContain(PIN);
    expect(Object.hasOwn(h.logins()[0]?.payload ?? {}, "entered_pin")).toBe(false);
  });

  it("§2d the PIN is absent from the DATABASE FILE, not merely from the parsed events", async () => {
    const { store, dir } = openDiskStore();
    const h = await harness({ store });

    await h.unlock(WRONG_PIN);
    await h.unlock(PIN);
    store.close();

    const onDisk = readdirSync(dir)
      .map((name) => readFileSync(join(dir, name)).toString("latin1"))
      .join("");
    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk).not.toContain(PIN);
  });
});

// ═══ §3 — what the record carries (01-F5 business fields land additively) ══════════════════

describe("01-F5 §3 — outcome, attempted user, and a chain the STORE owns", () => {
  it("§3a the outcome distinguishes an unlock from a refusal", async () => {
    const h = await harness();

    await h.unlock(PIN);
    await h.unlock(WRONG_PIN);

    const [success, failure] = h.logins();
    // "Somebody logged in on this device four times" is not an audit trail if three of them
    // were wrong. Without an outcome the whole family collapses into one indistinguishable row.
    expect(success?.payload["outcome"]).toBe("success");
    expect(failure?.payload["outcome"]).toBe("failure");
    expect(success?.payload["outcome"]).not.toBe(failure?.payload["outcome"]);
  });

  it("§3b the ATTEMPTED user_id is recorded, including on a refusal", async () => {
    const h = await harness();

    await h.unlock(WRONG_PIN);

    // Which identity was being guessed at is the fact that makes a failure investigable.
    expect(h.logins()[0]?.payload["user_id"]).toBe(CASHIER_ID);
  });

  it("§3c prev_audit_hash is STAMPED BY THE STORE and the chain verifies (01-F5)", async () => {
    const h = await harness();

    await h.unlock(PIN);
    await h.unlock(WRONG_PIN);

    const logins = h.logins();
    // The sink must NOT supply it — the store rejects a caller-supplied value outright, so a
    // sink that stamped its own would append NOTHING and §1a would already be red. What this
    // asserts is the other half: the store DID stamp it, and the links chain.
    expect(logins[0]?.payload["prev_audit_hash"]).toBeNull();
    expect(typeof logins[1]?.payload["prev_audit_hash"]).toBe("string");
    expect(verifyAuditChain(h.store.readAllEvents())).toEqual({ ok: true });
    expect(h.store.auditChainHead()).not.toBeNull();
  });

  it("§3d actor_user_id is the PROVEN user on success and null on a refusal (02-F41/02-F45, A2)", async () => {
    const h = await harness();

    await h.unlock(WRONG_PIN);
    await h.unlock(PIN);

    const [failure, success] = h.logins();
    // `02-F45`: attribution is read from the envelope. `02-F41`: it is whoever's PIN is IN.
    // On a refusal nobody's is — and `01-F1` makes a false attribution permanent, so the
    // attempted id stays in the payload (§3b) where it reads as an attempt.
    expect(failure?.actor_user_id).toBeNull();
    expect(success?.actor_user_id).toBe(CASHIER_ID);
  });
});

// ═══ §4 — 01-F17: auditing never takes the till with it ════════════════════════════════════

describe("01-F17 §4 — a failed audit append blocks nothing", () => {
  /** A store whose append is a wall. Everything else is the real store. */
  const brokenAppend = (store: DeviceStore): { store: DeviceStore; calls: () => number } => {
    let calls = 0;
    const proxied = new Proxy(store, {
      get: (target, key, receiver) =>
        key === "append"
          ? () => {
              calls += 1;
              throw new Error("disk full (01-F17 probe)");
            }
          : Reflect.get(target, key, receiver),
    });
    return { store: proxied, calls: () => calls };
  };

  it("§4a a correct PIN still unlocks when the audit append throws", async () => {
    const store = openTempStore();
    const registry = await seedRegistry(store);
    const broken = brokenAppend(store);
    const session = createPinSession({
      registry,
      device: { device_id: DEVICE, registered: true },
      idle_lock_ms: 60_000,
      max_failed_attempts: 3,
      now: () => 1_700_000_000_000,
      audit: createPinAuditSink({ store: broken.store, now: () => 1_700_000_000_000 }),
    });

    const result = await session.unlock(CASHIER_ID, PIN);

    // The cashier is holding a queue. An audit that cannot be written is a gap in a log; an
    // audit that THROWS is a till that stopped selling to protect its own paperwork.
    expect(result.ok).toBe(true);
    expect(session.currentUser()).toBe(CASHIER_ID);
    // CONTROL for §4a: the wall was actually hit. Without this, a sink that never appends at
    // all — the exact defect this file exists to close — passes §4a perfectly.
    expect(broken.calls()).toBeGreaterThan(0);
  });

  it("§4b the sink itself does not throw when the store refuses", () => {
    const store = openTempStore();
    const broken = brokenAppend(store);
    const sink = createPinAuditSink({ store: broken.store, now: () => 1_700_000_000_000 });

    expect(() =>
      sink({
        type: "audit.login",
        payload: { user_id: CASHIER_ID, device_id: DEVICE, outcome: "success" },
      }),
    ).not.toThrow();
    expect(broken.calls()).toBe(1);
  });
});

// ═══ §5 — the refusal REASON is reachable by a host ════════════════════════════════════════

describe("02-F20 §5 — a host can tell a locked-out cashier apart from a typo", () => {
  /**
   * Type-level exhaustiveness. A host renders one message per refusal, so the SET is shipped
   * API: drop `locked_out` from the union and this object has an excess property; add a sixth
   * refusal and it is missing a key. Either way `pnpm typecheck` fails here — which is exactly
   * what a host switching on the reason would get. (S-0b's P8 deliberately pinned no literal;
   * that was right for the VALUES a refusal path chooses, and this pins the set a caller must
   * cover, which is a different claim.)
   */
  const HOST_MUST_HANDLE: Record<UnlockRefusal, true> = {
    device_not_registered: true,
    locked_out: true,
    unknown_user: true,
    bad_pin: true,
  };

  it("§5a every refusal names its reason, reachable from the package entry point", async () => {
    // Imported off the package root, not the module file: a host has only this door.
    const create = syncClientNs.createPinSession;
    const store = openTempStore();
    const registry = await seedRegistry(store);
    const now = (): number => 1_700_000_000_000;
    const options = {
      registry,
      device: { device_id: DEVICE, registered: true },
      idle_lock_ms: 60_000,
      max_failed_attempts: 2,
      now,
      audit: () => {},
    };

    const unregistered = create({ ...options, device: { device_id: DEVICE, registered: false } });
    const session = create(options);
    const reasons = [
      await unregistered.unlock(CASHIER_ID, PIN),
      await session.unlock("user-nobody", PIN),
      await session.unlock(CASHIER_ID, WRONG_PIN),
      await session.unlock(CASHIER_ID, WRONG_PIN),
      await session.unlock(CASHIER_ID, PIN), // the third attempt: locked out, correct PIN
    ].map((result) => (result.ok ? "OK" : result.reason));

    // Five attempts, four DISTINCT reasons — the collapse `02-F20`'s three-valued lesson is
    // about is a cashier told "that PIN was not accepted" for five minutes at a till with a
    // queue, re-keying a PIN that was already right.
    expect(new Set(reasons).size).toBe(4);
    expect(reasons).not.toContain("OK");
    for (const reason of reasons) {
      expect(Object.hasOwn(HOST_MUST_HANDLE, reason)).toBe(true);
    }
  });
});
