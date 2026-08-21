// Acceptance tests — `02-F11` multi-terminal coherence over the LAN mesh (R36).
//
// Authored from specs/01-kernel-sync.md (01-F8, 01-F12, 01-F13, 01-F14, 01-F15, 01-F16,
// 01-F17, 01-F34, 01-F38, 01-F43, 01-F45), specs/02-pos-app.md (02-F11),
// specs/26-merge-semantics.md and plans/saas-pivot/plan-of-record.md (R36) ONLY — never
// from an implementation (24 §3 step 2: read-only to the implementing session).
//
// ── WHAT THIS SUITE OWNS THAT NOTHING ELSE DOES ─────────────────────────────
// `02-F11` is one sentence: "an order started on one terminal can be parked there and
// resumed, extended, or settled on another; concurrent line-adds from two terminals merge
// (01-F16)". R36 puts the LAN mesh in the MVP precisely so that sentence stops being
// unexercised. Measured before writing this file: `02-F11` is cited by fold-level and
// identity-level suites and by NO mesh suite, and `mesh-scenarios.test.ts` states in its
// own header that its convergence claim is "ledger set-equality + per-origin order, NEVER
// fold identity".
//
// So the mesh suites prove the ENVELOPES arrive and the fold suites prove the MERGE is
// order-independent when handed a set directly. Nothing joins them. This suite is the
// join: same branch, several terminals, events arriving in genuinely different orders
// through a real hub, and the assertion is on what a CASHIER SEES.
//
// ── HOW EACH CLAIM IS KEPT FROM PASSING FOR FREE ────────────────────────────
// Every cross-device equality test also asserts `deliveryOrdersDiverged(...)`. Without it
// a mesh that delivered one identical sequence to everybody would satisfy the equality
// trivially and the suite would be testing nothing — failure pattern 1, the fixture that
// answers its own question.
//
// And the two order-independence claims are DELIBERATELY SPLIT because they have
// different killing mutants, which is the attribution the round-3 law demands:
//   §B (cross-device identity) is killed by an ARRIVAL-ORDER-dependent fold.
//   §B alone is NOT killed by a min-envelope-id tiebreak — every device computes the same
//     minimum, so a tiebreak smuggling wall clock through the UUIDv7 prefix passes it on
//     every device. §C (the relabel run) is the assertion that kills that, and it is the
//     one `01-F34` names.

import { createSim } from "@restos/testing";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./builders.js";
import { confirmed, created, lineAdded, payment, settlementClosed } from "./merge-builders.js";
import {
  closeAllDevices,
  coherenceDevice,
  deliveryOrdersDiverged,
  forwardIds,
  LOSSLESS,
  ledgerIdSet,
  lineCells,
  mapFullProjection,
  observedOrders,
  orderRow,
  phi,
  projectionBytesOf,
  projectionOf,
  reversingIds,
  ringOn,
  runScript,
  SERVICE_ORDER,
  serviceScript,
} from "./multi-terminal-builders.js";
import { branchTimeStatus } from "./time-builders.js";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Long enough for election, hello/hello_ack, window replay and several heartbeats. */
const SETTLE_MS = 12_000;

// ===========================================================================
// §A — `02-F11` / `01-F16`: the product sentence, on the surface a cashier reads
// ===========================================================================

describe("§A — 02-F11: one order, several terminals (01-F16, 01-F12/F13/F15)", () => {
  it("02-F11/01-F16: concurrent line-adds from two terminals MERGE — every terminal shows both lines, with the price each was rung at", () => {
    const sim = createSim({ seed: 3601 });
    sim.lan.policy(LOSSLESS);
    const a = coherenceDevice(sim, "till-a", 0);
    const b = coherenceDevice(sim, "till-b", 0);
    const c = coherenceDevice(sim, "till-c", 0);
    const all = [a, b, c];
    for (const d of all) d.session.start();
    sim.runFor(SETTLE_MS);

    ringOn(a, { id: "m-000", ...created(SERVICE_ORDER, { table_id: "T1" }) });
    sim.runFor(SETTLE_MS);

    // Cut the branch so the two adds are GENUINELY concurrent rather than merely quick:
    // neither terminal can have seen the other's line when it rings its own.
    sim.lan.partition(["till-a"], ["till-b", "till-c"]);
    sim.runFor(SETTLE_MS);
    ringOn(a, { id: "m-001", ...lineAdded(SERVICE_ORDER, "L1", { unit_price_paisa: 45000 }) });
    ringOn(b, {
      id: "m-002",
      ...lineAdded(SERVICE_ORDER, "L2", { qty: 2, unit_price_paisa: 32000 }),
    });
    sim.runFor(SETTLE_MS);

    // The concurrency is ASSERTED, not assumed — otherwise this is a sequential test
    // wearing a partition, and `01-F16` ("two devices adding lines … → merge, both valid")
    // would never actually be exercised.
    expect(Object.keys(lineCells(a, SERVICE_ORDER))).toEqual(["L1"]);
    expect(Object.keys(lineCells(b, SERVICE_ORDER))).toEqual(["L2"]);

    sim.lan.heal();
    sim.runFor(SETTLE_MS);

    for (const d of all) {
      const cells = lineCells(d, SERVICE_ORDER);
      expect(
        Object.keys(cells).sort(),
        `${d.info.device_id} must hold BOTH lines after the heal (01-F16)`,
      ).toEqual(["L1", "L2"]);
      expect(cells.L1?.qty, `${d.info.device_id} L1 qty`).toBe(1);
      expect(cells.L1?.unit_price_paisa, `${d.info.device_id} L1 price`).toBe(45000);
      expect(cells.L2?.qty, `${d.info.device_id} L2 qty`).toBe(2);
      expect(cells.L2?.unit_price_paisa, `${d.info.device_id} L2 price`).toBe(32000);
    }
    closeAllDevices(all);
  });

  it("02-F11: an order STARTED on one terminal, EXTENDED on a second and SETTLED on a third is settled on ALL THREE — including the one that opened it", () => {
    const sim = createSim({ seed: 3602 });
    sim.lan.policy(LOSSLESS);
    const a = coherenceDevice(sim, "till-a", 0);
    const b = coherenceDevice(sim, "till-b", 0);
    const c = coherenceDevice(sim, "till-c", 0);
    const all = [a, b, c];
    for (const d of all) d.session.start();
    sim.runFor(SETTLE_MS);

    ringOn(a, { id: "m-000", ...created(SERVICE_ORDER, { table_id: "T1" }) }); // started on A
    sim.runFor(SETTLE_MS);
    ringOn(b, { id: "m-001", ...lineAdded(SERVICE_ORDER, "L1", { unit_price_paisa: 45000 }) }); // extended on B
    ringOn(a, { id: "m-002", ...confirmed(SERVICE_ORDER) });
    sim.runFor(SETTLE_MS);
    ringOn(c, { id: "m-003", ...payment(SERVICE_ORDER, 45000, { attempt: "sa-K" }) }); // settled on C
    ringOn(c, {
      id: "m-004",
      ...settlementClosed(SERVICE_ORDER, { settlement_attempt_ids: ["sa-K"] }),
    });
    sim.runFor(SETTLE_MS);

    for (const d of all) {
      const row = orderRow(d, SERVICE_ORDER);
      expect(row, `${d.info.device_id} must hold the order`).toBeDefined();
      // The whole point of 02-F11: the terminal that OPENED the bill must not still be
      // showing it as payable after another terminal took the money. A till that does is
      // how one order gets settled twice (DEC-MONEY-009).
      expect(row?.settled, `${d.info.device_id} must show the order SETTLED`).toBe(1);
      expect(row?.pay_total, `${d.info.device_id} pay_total`).toBe(45000);
    }
    closeAllDevices(all);
  });
});

// ===========================================================================
// §B — the join: identical projections across terminals that received in DIFFERENT orders
// ===========================================================================

describe("§B — 01-F34/02-F11: every terminal projects the SAME bytes from a differently-ordered delivery", () => {
  it("01-F34/02-F11/01-F38: four terminals, a lossy LAN, a partition and a heal — identical event set, provably different arrival orders, byte-identical projections", () => {
    const sim = createSim({ seed: 3603 });
    // Loss and duplication force the recovery paths (heartbeat window replay, id-dedupe)
    // to do real work, which is what makes the arrival orders диverge in the first place.
    sim.lan.policy({ latency: [3, 40], dropRate: 0.15, duplicateRate: 0.1 });
    const a = coherenceDevice(sim, "till-a", 0);
    const b = coherenceDevice(sim, "till-b", 0);
    const c = coherenceDevice(sim, "till-c", 0);
    const d = coherenceDevice(sim, "till-d", 0, "kitchen");
    const all = [a, b, c, d];
    for (const dev of all) dev.session.start();
    sim.runFor(SETTLE_MS);

    const script = serviceScript();
    const half = Math.floor(script.length / 2);
    runScript(all, script.slice(0, half), forwardIds(), sim, 600);

    // Split the branch mid-service, keep ringing on both sides, then heal (01-F38 set-union).
    sim.lan.partition(["till-a", "till-b"], ["till-c", "till-d"]);
    sim.runFor(SETTLE_MS);
    script.slice(half).forEach((step, i) => {
      const dev = all[step.terminal];
      if (dev !== undefined) ringOn(dev, { id: forwardIds()(half + i), ...step.typed });
      sim.runFor(600);
    });
    sim.lan.heal();
    sim.runFor(SETTLE_MS * 3);

    // (a) precondition — the same delivered SET everywhere. This is the claim the existing
    // mesh suites already own; if it fails, §B has not yet earned the right to compare
    // projections and the failure is a mesh-delivery failure, not a fold failure.
    const sets = all.map(ledgerIdSet);
    const reference = sets[0];
    expect(reference).toBeDefined();
    for (let i = 1; i < sets.length; i++) {
      expect(
        [...(sets[i] ?? new Set<string>())].sort(),
        `${all[i]?.info.device_id} must hold the same event set as ${all[0]?.info.device_id}`,
      ).toEqual([...(reference ?? new Set<string>())].sort());
    }
    expect(reference?.size, "the branch must have delivered the whole script").toBe(script.length);

    // (b) ⚠ THE ANTI-VACUITY GUARD. Without this the equality below is free: a mesh that
    // handed every device one identical sequence would satisfy it while proving nothing
    // about order-independence. This is the assertion that makes §B a test of `01-F34`
    // rather than a test of `canonicalJson`.
    expect(
      deliveryOrdersDiverged(all),
      `arrival orders must genuinely differ or the projection equality below proves nothing: ${canonicalJson(
        observedOrders(all),
      )}`,
    ).toBe(true);

    // (c) the claim: what every cashier on this branch sees is the same bytes.
    const bytes = all.map(projectionBytesOf);
    for (let i = 1; i < bytes.length; i++) {
      expect(
        bytes[i],
        `${all[i]?.info.device_id} projects differently from ${all[0]?.info.device_id} — two tills on one branch showing different orders`,
      ).toBe(bytes[0]);
    }
    closeAllDevices(all);
  });

  it("01-F14/02-F11: a terminal switched on MID-SERVICE converges to exactly what the branch already shows", () => {
    const sim = createSim({ seed: 3604 });
    sim.lan.policy(LOSSLESS);
    const a = coherenceDevice(sim, "till-a", 0);
    const b = coherenceDevice(sim, "till-b", 0);
    const c = coherenceDevice(sim, "till-c", 0);
    const incumbents = [a, b, c];
    for (const dev of incumbents) dev.session.start();
    sim.runFor(SETTLE_MS);

    runScript(incumbents, serviceScript(), forwardIds(), sim, 400);
    sim.runFor(SETTLE_MS);
    const established = projectionBytesOf(a);
    for (const dev of incumbents) {
      expect(
        projectionBytesOf(dev),
        `${dev.info.device_id}: the incumbents must agree before the joiner arrives`,
      ).toBe(established);
    }

    // The dinner-rush second till: powered on with an EMPTY store, into a running branch.
    const late = coherenceDevice(sim, "till-z-late", 0);
    expect(ledgerIdSet(late).size, "the joiner starts cold").toBe(0);
    late.session.start();
    sim.runFor(SETTLE_MS * 3);

    expect(
      projectionBytesOf(late),
      "01-F14: a hub-eligible peer serves a cold-started device the branch window — the joiner must show what the branch shows",
    ).toBe(established);
    // And the incumbents are unchanged by the arrival.
    for (const dev of incumbents) {
      expect(projectionBytesOf(dev), `${dev.info.device_id} unchanged by the joiner`).toBe(
        established,
      );
    }
    closeAllDevices([...incumbents, late]);
  });
});

// ===========================================================================
// §C — the min-id killer: bijective relabel ACROSS the mesh (01-F34)
// ===========================================================================

describe("§C — 01-F34: relabel invariance measured over the mesh, not over a hand-shuffled array", () => {
  it("01-F34: the same service, re-run under an ORDER-REVERSING envelope-id bijection, projects the φ-image on EVERY terminal", () => {
    const script = serviceScript();
    const N = script.length;

    const runOnce = (seed: number, namer: (i: number) => string) => {
      const sim = createSim({ seed });
      sim.lan.policy(LOSSLESS);
      const devices = [
        coherenceDevice(sim, "till-a", 0),
        coherenceDevice(sim, "till-b", 0),
        coherenceDevice(sim, "till-c", 0),
      ];
      for (const d of devices) d.session.start();
      sim.runFor(SETTLE_MS);
      runScript(devices, script, namer, sim, 400);
      sim.runFor(SETTLE_MS * 2);
      const out = devices.map((d) => ({
        device_id: d.info.device_id,
        projection: projectionOf(d),
        ids: ledgerIdSet(d),
      }));
      closeAllDevices(devices);
      return out;
    };

    // Same seed, same topology, same payloads — ONLY the envelope ids differ, and they
    // differ by a bijection that inverts every lexicographic comparison.
    const forward = runOnce(3605, forwardIds());
    const relabelled = runOnce(3605, reversingIds(N));
    const map = phi(N);

    // The two runs must have delivered the same logical set, or the comparison below is
    // comparing two different services and would pass or fail for the wrong reason.
    for (const run of [forward, relabelled]) {
      for (const dev of run) {
        expect(dev.ids.size, `${dev.device_id} must hold the whole script`).toBe(N);
      }
    }

    for (let i = 0; i < forward.length; i++) {
      const before = forward[i];
      const after = relabelled[i];
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      if (before === undefined || after === undefined) continue;
      expect(
        canonicalJson(after.projection),
        `${after.device_id}: projection(φ(S)) must byte-equal φ(projection(S)) — an id COMPARISON reaching a projected value is exactly the min-id tiebreak 01-F34 names, and it survives every cross-device equality assertion in §B`,
      ).toBe(canonicalJson(mapFullProjection(before.projection, map)));
    }
  });
});

// ===========================================================================
// §D — clock injection where only a MESH can put it: divergent branch-time offsets
//
// ⚠ THIS SECTION IS THE WEAKEST IN THE FILE AND THE MEASUREMENT SAYS SO. Stating the
// class it actually closes, and naming the neighbouring case it does NOT, because a
// section whose limits are not written down gets read as proving more than it does — and
// it then retires the assertion the next session would have written.
//
// Measured by mutation (M6): replacing the confirm anchor's `env.branch_created_at` with
// `env.device_created_at` — a fold reading the RAW DEVICE CLOCK, the exact thing `01-F45`
// bans — leaves all six tests in this file GREEN, while `time-invariance.test.ts` kills it
// five ways. The reason is structural and is not fixable by trying harder here: every
// device receives the SAME envelopes carrying the SAME stamps, so a cross-device
// comparison cannot distinguish a fold reading the right stamp from one reading the wrong
// stamp. Both are wrong identically everywhere.
//
// What §D therefore DOES own, and nothing else can: a projected value derived from the
// READING DEVICE's own clock or its own measured offset. That is a case a single-store
// suite cannot construct at all, because it has one clock — here the hub measures 0 and
// every follower measures its own error, so such a fold diverges across the branch. No
// one-branch mutant reaches it today (the engine takes no local-time input at all), so
// this is a TRIPWIRE against a future regression that would have to plumb one in, not a
// live kill. Its anti-vacuity guard below is asserted and verified live.
// ===========================================================================

describe("§D — 01-F43/01-F45: terminals whose clocks are years apart project identically", () => {
  it("01-F45/01-F43/01-F34: four terminals with raw clocks years apart acquire DIFFERENT branch-time offsets and still project byte-identically", () => {
    const sim = createSim({ seed: 3606 });
    sim.lan.policy(LOSSLESS);
    // The founder's threat model: every device arbitrarily wrong, in either direction, by
    // a different amount — and the hub wrong too, so branch time is collectively wrong.
    const a = coherenceDevice(sim, "till-a", 11 * YEAR_MS);
    const b = coherenceDevice(sim, "till-b", -3 * YEAR_MS);
    const c = coherenceDevice(sim, "till-c", 7 * 30 * 24 * 3600 * 1000);
    const d = coherenceDevice(sim, "till-d", 1234, "kitchen");
    const all = [a, b, c, d];
    for (const dev of all) dev.session.start();
    sim.runFor(SETTLE_MS);

    runScript(all, serviceScript(), forwardIds(), sim, 400);
    sim.runFor(SETTLE_MS * 2);

    // ⚠ ANTI-VACUITY. A fold reading the READING DEVICE's own clock or offset (rather than
    // the branch stamp the event carries) can only be caught if those actually differ
    // across devices — the hub measures 0 and every follower measures its own error. A
    // single-store suite has one clock and cannot construct this case at all, which is why
    // this assertion lives here and not in `time-invariance.test.ts`.
    const offsets = all.map((dev) => branchTimeStatus(dev.store).offset_ms);
    expect(
      new Set(offsets).size,
      `the terminals must hold DIFFERENT branch-time offsets or this test cannot see a fold reading the local clock: ${canonicalJson(offsets)}`,
    ).toBeGreaterThan(1);

    const bytes = all.map(projectionBytesOf);
    for (let i = 1; i < bytes.length; i++) {
      expect(
        bytes[i],
        `${all[i]?.info.device_id} projects differently from ${all[0]?.info.device_id} — a projected value is reading this device's own clock or offset (01-F45), not the branch stamp the event carries`,
      ).toBe(bytes[0]);
    }
    closeAllDevices(all);
  });
});
