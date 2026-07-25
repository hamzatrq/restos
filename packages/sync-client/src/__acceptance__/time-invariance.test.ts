// Acceptance tests — T-01-17, 01-F45: `device_created_at` is UNTRUSTED.
// "No fold, read model, invariant, or ordering key may derive a value from it —
// mechanically enforced alongside the 01-F34 ordering-metadata ban."
//
// This suite extends the 01-F34 invariance oracle (merge-invariance.test.ts) onto
// the device clock. That file had to EXCLUDE the three time-valued columns
// (confirmed_at / confirm_at / age_basis) because the T-01-15 contract kept their
// stamping on `device_created_at` until DEC-TIME-001 — the sanctioned exception
// (contract ruling C1) it flagged for correction rather than absorbed. DEC-TIME-001
// is now accepted, so the exception is DELETED and every assertion below compares
// the FULL projection, time columns included.
//
// Two traps this suite exists to catch, in the merge-invariance tradition (plain
// convergence is insufficient — 26 §8):
//   (1) A fold that reads `env.device_created_at` for a projected time. Killed by
//       clock injection: the same set with arbitrary device clocks must project
//       byte-identically.
//   (2) A fold that applies the LOCAL device's offset at FOLD time
//       (`env.device_created_at + myOffset`). Convergence tests and clock injection
//       both pass that implementation — every device would just be wrong in its own
//       consistent way. Only comparing two devices with DIFFERENT offsets over the
//       SAME delivered set kills it, which 01-F34 demands (equal delivered set ⇒
//       byte-equal projection). That is the third describe block.
//
// Authored from specs/01-kernel-sync.md (01-F45, 01-F43, 01-F44, 01-F34, 01-F3),
// specs/26-merge-semantics.md §7–§8, specs/25-fold-performance.md §14 and
// specs/DECISIONS.md (DEC-TIME-001) ONLY — never from an implementation.
//
// RED-AWAITING-IMPLEMENTATION: the fold still stamps from `device_created_at`.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  confirmed,
  created,
  generateMergeSet,
  ingestAll,
  mergeStore,
  relabelEnvelope,
  reversingIdMap,
  shuffled,
} from "./merge-builders.js";
import {
  fullProjection,
  fullProjectionBytes,
  injectGarbageDeviceClocks,
  mapFullProjectionIds,
  setBranchTimeOffset,
  TRUE_T0,
  timeScenario,
  timeStore,
} from "./time-builders.js";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("01-F45 — the fold's time values come from branch time, never the device clock", () => {
  it("01-F45/01-F43: a single confirm stamps confirmed_at / confirm_at / age_basis from branch_created_at — the device clock is years away and is ignored", () => {
    // The live defect DEC-TIME-001 closes: "a device whose clock is years wrong
    // wrote wrong confirmed_at/kot_at/age_basis values straight into the doc-03
    // timing models" (01-F45, 25 §14).
    const id = identity();
    const peer = peerIdentity(id);
    const store = timeStore(id);
    const branchAt = TRUE_T0 + 500;
    const deviceAt = TRUE_T0 - 6 * YEAR_MS; // this terminal thinks it is 2019
    store.ingest(
      peerEnvelope(peer, 0, {
        ...created("O1"),
        branch_created_at: TRUE_T0,
        device_created_at: deviceAt,
      }),
    );
    store.ingest(
      peerEnvelope(peer, 1, {
        ...confirmed("O1"),
        branch_created_at: branchAt,
        device_created_at: deviceAt,
      }),
    );
    expect(store.openOrders()[0]?.confirmed_at).toBe(branchAt);
    expect(store.kitchenQueue()[0]?.confirm_at).toBe(branchAt);
    expect(store.kitchenQueue()[0]?.age_basis).toBe(branchAt);
    store.close();
  });

  it("01-F45: across a whole branch set, EVERY projected time is one of the delivered branch stamps and NONE is a raw device stamp", () => {
    const set = timeScenario();
    const store = timeStore(set.identity);
    ingestAll(store, set.envelopes);
    const branch = new Set(set.branchStamps);
    const device = new Set(set.deviceStamps);
    const projected = [
      ...store.openOrders().map((r) => r.confirmed_at),
      ...store.kitchenQueue().map((r) => r.confirm_at),
      ...store.kitchenQueue().map((r) => r.age_basis),
    ].filter((v): v is number => v !== null);
    expect(projected.length).toBeGreaterThan(0);
    for (const value of projected) {
      expect(branch.has(value), `projected ${value} is a delivered branch stamp`).toBe(true);
      expect(device.has(value), `projected ${value} is NOT a raw device stamp`).toBe(false);
    }
    // …and the single-confirm order's anchor is pinned exactly.
    const pinned = store.openOrders().find((r) => r.order_id === set.singleConfirmOrder);
    expect(pinned?.confirmed_at).toBe(set.singleConfirmBranchAt);
    expect(pinned?.confirmed_at).not.toBe(set.singleConfirmDeviceAt);
    store.close();
  });
});

describe("01-F45/01-F34 — device-clock injection invariance (the full projection)", () => {
  it("01-F45: replacing every device_created_at with an arbitrary, per-device, wildly wrong value leaves the FULL projection byte-identical", () => {
    const set = timeScenario();
    const real = timeStore(set.identity);
    ingestAll(real, set.envelopes);
    const injected = timeStore(set.identity);
    ingestAll(injected, injectGarbageDeviceClocks(set.envelopes));
    expect(fullProjectionBytes(injected)).toBe(fullProjectionBytes(real));
    real.close();
    injected.close();
  });

  it("01-F45/01-F34: clock injection + an ORDER-REVERSING id relabel + a shuffled delivery order maps the FULL projection through φ exactly", () => {
    const set = timeScenario();
    const real = timeStore(set.identity);
    ingestAll(real, set.envelopes);
    const map = reversingIdMap(set.envelopes.map((e) => e.id));
    const adversarial = shuffled(
      injectGarbageDeviceClocks(
        set.envelopes.map((env) => relabelEnvelope(env, map)) as Array<
          Record<string, unknown> & { id: string }
        >,
      ),
      31337,
    );
    const store = timeStore(set.identity);
    ingestAll(store, adversarial);
    const expected = mapFullProjectionIds(fullProjection(real), map);
    expect(JSON.stringify(fullProjection(store))).toBe(JSON.stringify(expected));
    real.close();
    store.close();
  });

  it("01-F45/01-F34: property — for every generated branch set, clock injection under relabel + shuffle projects identically (φ-mapped), time columns included", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.integer({ min: 0, max: 0x7fffffff }),
        (setSeed, orderSeed) => {
          const set = generateMergeSet(setSeed);
          const real = mergeStore(set.identity);
          ingestAll(real, set.envelopes);
          const map = reversingIdMap(set.envelopes.map((e) => e.id));
          const adversarial = shuffled(
            injectGarbageDeviceClocks(set.envelopes.map((env) => relabelEnvelope(env, map))),
            orderSeed,
          );
          const store = mergeStore(set.identity);
          ingestAll(store, adversarial);
          const expected = mapFullProjectionIds(fullProjection(real), map);
          expect(JSON.stringify(fullProjection(store))).toBe(JSON.stringify(expected));
          real.close();
          store.close();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("01-F45/01-F34 — the CONVERGENCE TRAP: the offset is applied once, at append, by the origin", () => {
  it("01-F34/01-F43: two devices holding the SAME delivered set but DIFFERENT branch offsets fold to byte-identical projections", () => {
    // An implementation that applies its OWN offset at fold time
    // (`env.device_created_at + myOffset`) survives every convergence and clock-
    // injection test above and fails here — each device would be internally
    // consistent and disagree with its neighbours about when the order confirmed.
    // 01-F34 is explicit: equal delivered set ⇒ byte-equal projection.
    const set = timeScenario();
    const kitchen = timeStore(set.identity);
    setBranchTimeOffset(kitchen, 0); // the hub itself
    const counter = timeStore(set.identity);
    setBranchTimeOffset(counter, 4 * YEAR_MS); // a terminal four years behind
    const waiter = timeStore(set.identity);
    setBranchTimeOffset(waiter, -37 * 60_000); // a phone 37 minutes fast
    const neverMet = timeStore(set.identity); // no hub contact at all (01-F44)
    for (const store of [kitchen, counter, waiter, neverMet]) ingestAll(store, set.envelopes);
    const reference = fullProjectionBytes(kitchen);
    expect(fullProjectionBytes(counter)).toBe(reference);
    expect(fullProjectionBytes(waiter)).toBe(reference);
    expect(fullProjectionBytes(neverMet)).toBe(reference);
    for (const store of [kitchen, counter, waiter, neverMet]) store.close();
  });

  it("01-F34/01-F43: acquiring or refreshing the offset AFTER folding changes not one byte of the projection", () => {
    // The offset is a property of this device's future appends, never of the folded
    // set. A projection that moves when the clock is corrected is order-dependent
    // state by another name.
    const set = timeScenario();
    const store = timeStore(set.identity);
    ingestAll(store, set.envelopes);
    const before = fullProjectionBytes(store);
    setBranchTimeOffset(store, 9 * YEAR_MS);
    expect(fullProjectionBytes(store)).toBe(before);
    setBranchTimeOffset(store, -9 * YEAR_MS);
    expect(fullProjectionBytes(store)).toBe(before);
    store.refold(); // even a full replay under the new offset
    expect(fullProjectionBytes(store)).toBe(before);
    store.close();
  });

  it("01-F34/01-F43: property — for any pair of offsets, the same delivered set projects identically", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0x7fffffff }),
        fc.integer({ min: -6 * YEAR_MS, max: 6 * YEAR_MS }),
        fc.integer({ min: -6 * YEAR_MS, max: 6 * YEAR_MS }),
        (setSeed, offsetA, offsetB) => {
          const set = generateMergeSet(setSeed);
          const a = timeStore(set.identity);
          setBranchTimeOffset(a, offsetA);
          ingestAll(a, set.envelopes);
          const b = timeStore(set.identity);
          setBranchTimeOffset(b, offsetB);
          ingestAll(b, set.envelopes);
          expect(fullProjectionBytes(b)).toBe(fullProjectionBytes(a));
          a.close();
          b.close();
        },
      ),
      { numRuns: 40 },
    );
  });
});
