// ⚠ **MUTATION-TESTER-AUTHORED, AND IT EXISTS BECAUSE A MUTANT SURVIVED EVERYTHING.**
//
// `24 §3` puts the acceptance suite in another session's hands (`branch-slice-seam.test.ts`), and
// the implementing session added two more files after its own mutation round. This file makes one
// assertion none of them makes, written after measuring that its absence is exploitable in the
// worst available direction — the founder's *"a screen that renders but cannot act"*, reached
// without breaking a single test, rail or typecheck.
//
// ── THE MEASUREMENT (mutant M2b, 2026-08-13, shipped code otherwise untouched) ──────────────────
//
// `managerHomeNow()` — the zero-argument function `App.tsx` actually calls — computes its snapshot
// from the live attachment and then DISCARDS it, returning a constant offline arm:
//
//     const snapshot = "unavailable" in attachment ? { … } : branchSnapshotFrom(attachment);
//     void snapshot;
//     return managerHome({ reachable: false, last_seen_ms: null, reason: "…" }, now);
//
// The store still opens, the uplink still starts, the ledger still fills, and `branchSnapshotFrom(`
// is still CALLED so §C's call-count assertion still passes. Measured:
//
//   · **0 of 64 tests in this package**,
//   · `pnpm seams:check` **clean at exit 0**,
//   · `pnpm -C apps/manager typecheck` **exit 0**.
//
// A console showing *"branch offline"* for ever, over a full and freshly-synced branch slice.
//
// ── WHY THE EXISTING SUITES CANNOT SEE IT, WHICH IS NOT A CRITICISM OF THEM ─────────────────────
//
// `branch-slice-seam.test.ts` §A/§B test `branchSnapshotFrom` and `managerHome` DIRECTLY, which is
// right — those are the pure functions and that is where the fold arithmetic lives. §C then covers
// the composition by reading SOURCE, and its own comment says exactly why and exactly what it
// costs: *"`managerHomeNow()` cannot be CALLED here — it opens an op-sqlite database and Node has
// no such module"*, and *"this catches a wiring never made, and it cannot catch a wiring made
// wrongly"*. M2b is a wiring made wrongly.
//
// `alarm-honesty.test.ts:171` does call `managerHomeNow()`, and states its invariant as an
// IMPLICATION (*"if not reachable then unknown"*) so that it would hold both before and after a
// storage adapter landed. That was the correct call when it was written — AGENTS.md rates a test
// that stays RED under a correct implementation as damaging as a vacuous one. But now that the
// adapter HAS landed, the consequence is that **nothing anywhere asserts `managerHomeNow()` is
// even CAPABLE of the reachable arm.** An implication satisfied by "always offline" cannot be the
// thing that holds a console to being fed.
//
// ── HOW THIS REACHES `managerHomeNow()` WITHOUT A PHONE, AND WHAT IT DOES NOT CLAIM ─────────────
//
// `attachBranch` is exported for exactly this: `home.ts` stays pure so the derivation is reachable
// without a native module, and the live source is supplied at runtime by `branch.ts`. So the store
// here is a REAL device store on a REAL disk, opened through `18 §4`'s Node driver — the same way
// `branch-slice-seam.test.ts` §A opens one, and the reason that is legitimate is that the store
// under test is `sync-client`'s, identical on both engines by construction (`18 §4`: one adapter,
// two drivers; `storage-op-sqlite.test.ts` §A runs one contract against both).
//
// ⚠ **WHAT IT DOES NOT PROVE, in the terms `storage-op-sqlite.test.ts` already set: a phone.**
// It says nothing about `open()` succeeding on Android, about WAL under scoped storage, or about
// Hermes loading the TurboModule. Those stay K-8-shaped debts — hardware, not code.
//
// ⚠ **AND IT DOES NOT REACH `branch.ts`.** Three further mutants survive everything in this
// repository and are reported rather than closed, because `branch.ts` imports
// `@op-engineering/op-sqlite` at module scope and therefore cannot be loaded by any test here:
// `connected` hardcoded `() => true` (`05-F23` broken in the direction that implies calm) — 0 of
// 64; `session.start()` deleted (a database that opens and is never fed) — 1 of 64, and that one
// kill is a `/\.start\s*\(\s*\)/` regex over source; and `App.tsx` never calling
// `attachBranchSlice()` at all — 0 of 64. `branch-attach-seam.test.ts` closes the fourth (the live
// `attachBranch` call deleted) the only way source allows.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config/aging";
import { newId } from "@restos/domain";
import {
  createNodeStorageAdapter,
  type DeviceStore,
  openStore,
  type StoreIdentity,
} from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { attachBranch, managerHomeNow } from "../home.js";

const MINUTE = 60_000;
/** `DEFAULT_AGING_THRESHOLDS.dine_in` is `{ amberAt: 10, redAt: 20 }` — 40 min is unambiguously red. */
const LATE_MINUTES = 40;

const dirs: string[] = [];
const stores: DeviceStore[] = [];

afterEach(() => {
  // The attachment is module state in `home.ts`; a live source left pointing at a deleted file
  // would make some later suite's failure read as a store bug.
  attachBranch({ unavailable: "torn down by shipped-home-model.test.ts" });
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // a test closed it already
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A REAL device store on a REAL disk — `05 §8`'s "normal full branch slice", nothing simulated. */
const realStore = (identity: StoreIdentity): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "restos-manager-shipped-"));
  dirs.push(dir);
  const store = openStore({
    adapter: createNodeStorageAdapter({ path: join(dir, "device.db") }),
    identity,
  });
  stores.push(store);
  return store;
};

const identityOf = (): StoreIdentity => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

/**
 * One confirmed, unready order aged `minutesOld` at `now`, appended through the REAL store.
 *
 * The stamps go in through `device_created_at`, which `01-F43` turns into `branch_created_at` at
 * append — so the age asserted below is arithmetic the LEDGER did, not a number this file and the
 * implementation both happen to hold.
 */
const lateOrder = (
  store: DeviceStore,
  identity: StoreIdentity,
  now: number,
  minutesOld: number,
): string => {
  const order_id = newId();
  const at = now - minutesOld * MINUTE;
  const append = (type: string, payload: Record<string, unknown>, when: number): void => {
    store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      actor_user_id: null,
      device_created_at: when,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  append("order.created", { order_id, order_type: "dine_in", channel: "counter" }, at - 1);
  append(
    "order.line_added",
    { order_id, line_id: "line-1", item_id: "item-karahi", qty: 1, unit_price_paisa: 50_000 },
    at - 1,
  );
  append("order.confirmed", { order_id }, at);
  return order_id;
};

const sourceOver = (store: DeviceStore, now: number, connected: boolean) => ({
  store,
  connected: () => connected,
  lastSeenMs: () => now,
  aging: resolveAging(undefined),
  now: () => now,
});

describe("05-F1 — managerHomeNow(), the call App.tsx makes, derives a REAL alarm", () => {
  it("returns reachable:true with an alarm read out of the ledger on disk", () => {
    // ⚠ THE ASSERTION M2b SURVIVES WITHOUT. The founder's standing rule for this round is that a
    // surface which renders and cannot act is a failure, not an interim state; this is that rule
    // written down as something a suite can check.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    const order_id = lateOrder(store, identity, now, LATE_MINUTES);

    attachBranch(sourceOver(store, now, true));
    const model = managerHomeNow();

    expect(model.reachable).toBe(true);
    expect(model.alarms.known).toBe(true);
    if (!model.alarms.known) return;
    expect(model.alarms.list.length).toBe(1);
    expect(model.alarms.list[0]?.order_id).toBe(order_id);
    expect(model.alarms.list[0]?.kind).toBe("late_order");
    // `05-F1`'s age, and the reason a constant cannot pass: 40 because THIS TEST appended the
    // confirm forty minutes before `now` and `01-F43` stamped it at append.
    expect(model.alarms.list[0]?.minutes).toBe(LATE_MINUTES);
    expect(model.honesty).toContain("1 active alarm");
  });

  it("asks the ledger AGAIN — an order appended after the first call shows up in the second", () => {
    // The assertion a one-shot snapshot cannot survive. `05-N2` re-reads on a poll, so a
    // composition that captured its rows once at attach time would show a kitchen frozen at the
    // moment the app launched — which looks exactly like a working console for the first minute.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);

    attachBranch(sourceOver(store, now, true));
    const before = managerHomeNow();
    lateOrder(store, identity, now, LATE_MINUTES + 5);
    const after = managerHomeNow();

    expect(before.alarms.known && before.alarms.list.length).toBe(1);
    expect(after.alarms.known && after.alarms.list.length).toBe(2);
  });

  it("CONTROL: reachable with nothing late is an EMPTY list, which is not silence", () => {
    // Without this, "always returns one alarm" passes the first test. It also pins the half of
    // `05-F23` that runs the other way: a reachable branch with no alarms is
    // `known: true, list: []`, a different fact from `known: false`, and the two must not collapse.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, 2);

    attachBranch(sourceOver(store, now, true));
    const model = managerHomeNow();

    expect(model.reachable).toBe(true);
    expect(model.alarms.known).toBe(true);
    expect(model.alarms.known && model.alarms.list).toEqual([]);
  });

  it("CONTROL: 05-F22/05-F23's offline arm still comes out of the SAME call", () => {
    // The honest arm is not scaffolding and the brief requires it to stay reachable. Asserted from
    // `managerHomeNow()` rather than `managerHome()` so that both arms are proven to come from the
    // one function the screen calls — which is what makes the first test's `reachable: true` a
    // statement about the uplink rather than about which branch someone hardcoded.
    const now = 1_770_000_000_000;
    const identity = identityOf();
    const store = realStore(identity);
    lateOrder(store, identity, now, LATE_MINUTES);

    attachBranch(sourceOver(store, now, false));
    const model = managerHomeNow();

    expect(model.reachable).toBe(false);
    expect(model.alarms.known).toBe(false); // `05 §4` — unknown, never calm
    expect(model.honesty).toContain("UNKNOWN");
  });
});
