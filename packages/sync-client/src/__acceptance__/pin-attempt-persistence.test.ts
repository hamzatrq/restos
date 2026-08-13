// Acceptance tests — `01-F61`'s SECOND decision: **the counter PERSISTS across an app restart.**
//
// PROVENANCE, stated plainly: this file was written by the session that closed the gap, not by
// an independent oracle session (`24 §3` step 2). It is a regression test for a shipped defect,
// and the defect is the reason it exists at all — `packages/sync-client/src/__acceptance__/
// pin-session.test.ts` P10 says persistence is "NOT COVERED, deliberately... (no FR states
// persistence, and a counter that resets on relaunch is a real hole)". That FR now exists:
//
//   `01-F61`: "**The counter PERSISTS across an app restart.** A counter held in memory is
//   defeated by relaunching the app, which makes the lockout theatre — and the attacker who
//   most needs locking out is standing at the device with physical access to do exactly that."
//
// WHY HERE AND NOT IN THE APP. The property is a property of the STORE seam: `createPinSession`
// takes a `PinAttemptStore`, and only the device store's implementation of it reaches the disk.
// `sync-client` owns the store, so this is where "survives `openStore` → `close` → `openStore`"
// can be asserted against the real SQLite file rather than against a mock of it.
//
// WHAT THIS FILE CANNOT CATCH, and it is the other half of the same gap: whether the HOST passes
// `store.pinAttempts` in. `createPinSession` falls back to a process-lifetime counter when
// `attempts` is omitted, so a host that forgets the argument gets a lockout with none of the
// persistence below and no test anywhere goes red. Reported as a finding; `apps/pos-electron`
// constructs no session at all today, so there is currently no production caller to assert on.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPin } from "@restos/domain";
import { afterEach, describe, expect, it } from "vitest";
import type { DeviceStore } from "../device-store.js";
import { createPinSession, PIN_LOCKOUT_COOLDOWN_MS, type PinSession } from "../pin-session.js";
import { openStore } from "../store.js";

const ORG = "org-restos";
const BRANCH = "branch-gulberg";
const DEVICE = "device-counter-1";
const CASHIER = "user-ayesha";

/** Eight digits, for the reason the S-0b oracles both record: every decimal digit is a hex
 *  digit, and a short numeric PIN can collide with a UUIDv7 by chance. */
const PIN = "62840173";
const WRONG = "62840174";
const MAX_FAILED = 3;

/** Argon2id at the `01-F61` floor is deliberately slow; one enrolment serves the whole file. */
const HASH = hashPin(PIN);

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

/** A REAL file, not `:memory:` — the whole property is that the counter outlives the process
 *  that wrote it, and an in-memory database cannot fail this test. */
const tempDbPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "restos-pin-persist-"));
  dirs.push(dir);
  return join(dir, "device.db");
};

/**
 * One launch of the app: open the store, and build the session over it exactly as a host must.
 *
 * `attempts: store.pinAttempts` IS THE LINE UNDER TEST. Drop it and `createPinSession` silently
 * uses its process-lifetime fallback, which is the shipped defect this file exists to pin.
 */
const launch = async (path: string, now: () => number): Promise<[DeviceStore, PinSession]> => {
  const store = openStore({
    path,
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
  // `01-F28` reference data, seeded on the first launch only: a re-applied snapshot at the
  // version already held is stale (`01-F56`) and the second launch reads it back off disk,
  // which is the behaviour the sibling oracle already covers.
  if (store.staff.version() === 0) {
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: [
        {
          user_id: CASHIER,
          pin_hash: await HASH,
          assignments: [{ role: "cashier", branch_id: BRANCH }],
        },
      ],
    });
  }
  const session = createPinSession({
    registry: store.staff,
    device: { device_id: DEVICE, registered: true },
    idle_lock_ms: 10 * 60_000,
    max_failed_attempts: MAX_FAILED,
    now,
    audit: () => {},
    attempts: store.pinAttempts,
  });
  return [store, session];
};

const failUpToTheCeiling = async (session: PinSession): Promise<void> => {
  for (let i = 0; i < MAX_FAILED; i++) await session.unlock(CASHIER, WRONG);
};

describe("01-F61 — the PIN failure counter survives a relaunch", () => {
  it("a lockout is still a lockout after openStore → close → openStore", async () => {
    const path = tempDbPath();
    const t = 1_700_000_000_000;
    const now = () => t;

    const [first, firstSession] = await launch(path, now);
    await failUpToTheCeiling(firstSession);
    const before = await firstSession.unlock(CASHIER, PIN);
    expect(before.ok, "the ceiling did not lock the session in the first place").toBe(false);
    first.close();

    // The relaunch: the attacker standing at the device kills the app and starts it again,
    // which is the one move `01-F61` names. An in-memory counter is gone at this line.
    const [second, secondSession] = await launch(path, now);
    const after = await secondSession.unlock(CASHIER, PIN);

    expect(after.ok, "the relaunch cleared the lockout — 01-F61's counter is not durable").toBe(
      false,
    );
    // And it is still the SAME refusal, not a demotion to "wrong PIN": a lockout that survives
    // as a bad-PIN message leaves the cashier re-keying a correct PIN forever (`02-F20`).
    expect(after.ok === false && before.ok === false && after.reason === before.reason).toBe(true);
    expect(secondSession.currentUser()).toBeNull();
    second.close();
  });

  it("and the cooldown still ends it, so persistence does not brick the till (01-F17)", async () => {
    // The failure direction this test guards is the mirror image of the one above: a counter
    // that persists but whose `last_failure_at` does not is a lockout with no automatic end —
    // and `01-F61` refuses that outright, because a T1 branch may have no manager present.
    const path = tempDbPath();
    let t = 1_700_000_000_000;
    const now = () => t;

    const [first, firstSession] = await launch(path, now);
    await failUpToTheCeiling(firstSession);
    first.close();

    const [second, secondSession] = await launch(path, now);
    t += PIN_LOCKOUT_COOLDOWN_MS;

    expect(await secondSession.unlock(CASHIER, PIN)).toEqual({ ok: true, user_id: CASHIER });
    second.close();
  });

  it("a proven PIN clears the counter durably, not just for this process", async () => {
    // `00 §5.4`'s "repeated failure" is CONSECUTIVE failure. If the success cleared only the
    // in-process copy, the two failures below would land on top of the two already on disk and
    // lock out a cashier who has done nothing wrong since — a stopped till on a schedule.
    const path = tempDbPath();
    const t = 1_700_000_000_000;
    const now = () => t;

    const [first, firstSession] = await launch(path, now);
    await firstSession.unlock(CASHIER, WRONG);
    await firstSession.unlock(CASHIER, WRONG);
    expect(await firstSession.unlock(CASHIER, PIN)).toEqual({ ok: true, user_id: CASHIER });
    first.close();

    const [second, secondSession] = await launch(path, now);
    await secondSession.unlock(CASHIER, WRONG);
    await secondSession.unlock(CASHIER, WRONG);

    expect(await secondSession.unlock(CASHIER, PIN)).toEqual({ ok: true, user_id: CASHIER });
    second.close();
  });
});
