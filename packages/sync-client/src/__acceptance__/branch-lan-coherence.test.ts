// ACCEPTANCE TESTS — **TWO TILLS ON ONE BRANCH, COHERENT, OVER THE LAN THE PRODUCT SHIPS.**
//
// **AUTHORED FROM SPEC TEXT ONLY** (`20 §4.3`, `24 §3` step 2). The session that wrote this file
// wrote none of the production code it exercises and is disqualified from implementing against
// it. Every assertion is derived from a quoted FR clause, and the quotes are in this header so a
// reviewer can argue with the READING rather than reverse-engineer it.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`.** R35 puts the wire and
// credentials on FULL adversarial rounds.
//
// ── THE AUTHORITIES, QUOTED ───────────────────────────────────────────────────────────────────
//
//   02-F11   "Multi-terminal coherence: an order started on one terminal can be parked there and
//            resumed, extended, or settled on another; concurrent line-adds from two terminals
//            merge (01-F16)."
//   01-F12   "Devices in a branch discover each other on the LAN (mDNS; manual IP fallback) and
//            exchange events directly while WAN is down."
//   01-F13   "One device acts as branch hub (deterministic election among the hub-eligible
//            classes of 01-F39 … ties broken by lowest device id … re-election on hub loss
//            < 10 s). Non-hub devices connect to the hub (star); the hub relays events
//            branch-wide."
//   01-F14   "Every hub-eligible in-branch device retains the full branch event stream … any
//            device can therefore become hub or serve a cold-started peer."
//   01-F15   "LAN propagation is fast-path: an event reaches all connected branch devices
//            < 1 s p95."
//   01-F16   "Two devices adding lines to the same order → merge (both valid)."
//   01-F17   "A sale is never blocked."
//   01-F34   "Device folds read no ordering metadata: no `global_seq`, no `lamport_seq`, no
//            device clock — property-tested by bijective envelope-id relabeling and
//            sequence/clock-injection invariance … plain convergence alone is insufficient — a
//            min-id tiebreak passes it while smuggling wall clock through the UUIDv7 prefix."
//   01-F43   "The elected hub is the branch time authority … **Branch time is CONTINUOUS across
//            hub re-election**: a newly-elected hub retains the branch time it already held,
//            keeping its measured offset rather than resetting to its own raw clock; only a
//            device that has never acquired an offset starts at 0. Correspondingly the hub's
//            heartbeat carries **branch** time, not its raw clock."
//   01-F45   "`device_created_at` is untrusted … No fold, read model, invariant, or ordering key
//            may derive a value from it."
//   01-F72(e·i) "A COMPLETED HANDSHAKE IS NOT PROOF OF ADMISSION … **the refusal is observed as
//            the CLOSE**."
//   01-F74(c) "Admission is: the peer's certificate verifies against the org issuer, its
//            fingerprint appears in the roster, and that entry is not revoked."
//   00 §5.1  "every in-branch function works with WAN down, indefinitely."
//   R2       "Branch relay, fixed authority. The counter is the branch authority … Hub election
//            and device↔device merge go."   R36 "The LAN mesh — IN the MVP."
//
// ── FIVE READINGS THIS SUITE PINS, stated so a reviewer can reject them rather than discover them
//
//   R-1  **THE PLANE IS THE POINT.** Every claim below is already asserted in this package over
//        `sim.lan` — `mesh-scenarios.test.ts` (election, partition, fast path),
//        `branch-time-mesh.test.ts` (`01-F43` offsets), `journey-j3-hub-handover.test.ts`
//        (handover continuity), `multi-terminal-coherence.test.ts` (`02-F11`, relabel). None of
//        them opens a socket, presents a certificate or consults a roster: `sim.lan` is an
//        in-process `Map`. This file re-asserts the load-bearing ones over
//        `createWsLanTransport` + `createLanAdmission` + a real `createLanRoster`, which is the
//        composition both Electron hosts ship. **A green run here is not a new claim; it is the
//        first evidence that the existing claims survive the transport.**
//
//   R-2  **`01-F43`'s CONTINUITY IS ASSERTED AS A PROPERTY, NOT AS AN ELECTION.** R2 rules that
//        "hub election … go[es]" in favour of a fixed branch authority, and `01-F72` (f) already
//        records that admission "survives that change without amendment". So §C2 asserts *branch
//        time does not move when the device SERVING it changes* — true under `01-F13`'s election
//        and true under R2's failover — and the only place this file names an election is where
//        `01-F13` is the thing under test. An oracle that pinned `electHub` would go RED against
//        a correct R2 implementation, which the round-3 law rates exactly as damaging as a
//        vacuous test.
//
//   R-3  **A DIVERGENCE GUARD ON EVERY CROSS-TILL EQUALITY.** Two tills agreeing proves nothing
//        about order-independence if they were handed one identical sequence. Every equality
//        assertion here is paired with `deliveryOrdersDiverged`, which is failure pattern 1's
//        antidote and is imported from `multi-terminal-builders.ts` rather than re-derived.
//
//   R-4  **CROSS-TILL EQUALITY CANNOT SEE A MIN-ID TIEBREAK, so §B2 exists — but NOT as a
//        relabel.** Every till computes the same `min(envelope.id)`, so a fold smuggling wall
//        clock through the UUIDv7 prefix passes §B1 on every till (measured: 0 of 10 killed).
//        `01-F34`'s named instrument is a bijective id RELABEL across two runs, and that
//        instrument cannot be built on this plane: a follower's offset is measured across a real
//        socket, so it lands on 0 or −1 ms at random and `branch_created_at` carries the
//        difference into the projection — the two runs differ in a TIME column before any id is
//        compared (measured on the CORRECT build: `confirmed_at` 1500512000000 vs 1500511999999).
//        The relabel therefore stays on `20 §2.4`'s virtual clock, where it works
//        (`multi-terminal-coherence.test.ts` §C, measured to kill the same mutant). §B2 asserts
//        the anchor RULE instead — one run, no id arithmetic, the same mutant dead.
//
//   R-5  **THE FIXTURE PAIRS BY HAND, AND THAT IS THIS FILE'S OWN DEBT.** `pairByHand` writes the
//        LAN credential and the branch roster into the store because nothing in the product does
//        (`setLanCredential` and `lanRoster.apply` have zero shipping callers, measured). The
//        assertion that a branch can REACH this state is `device-roster-distribution.test.ts` §S,
//        and it is RED. Without it this file would be a suite blessing a mesh no restaurant can
//        enter — `AGENTS.md`'s recurring defect committed by the oracle written to catch it.
//
// ── WHAT THIS SUITE CANNOT SEE (worth more than the test count) ────────────────────────────────
//
//   (i)   **TWO PROCESSES, ONE MACHINE, ONE LOOPBACK.** Every till here shares a Node event loop
//         and a `Date.now()`. A real branch is several machines on a switch, so this file cannot
//         reach: a partial partition (A↔B up, B↔C down), asymmetric loss, a NIC that accepts and
//         does not send, IPv4/IPv6 dual-stack disagreement, MTU-driven fragmentation, or Wi-Fi
//         roaming — which is `01-F12`'s actual failure population in a Pakistani restaurant.
//         `01-F15`'s "< 1 s p95" over loopback is a claim about this box and about nothing else.
//   (ii)  **NO REAL CONCURRENCY.** One event loop means two tills never append at the same
//         instant; `01-F16`'s "two devices adding lines" is here a partition-free interleaving,
//         not a race. A genuine race would need two processes, which is `20 §2.4`'s spike rung.
//   (iii) **NO mDNS.** `01-F12` names two discovery mechanisms and `device-config/lan-mesh.ts`
//         records that the first is unimplemented and is a `18 §15` process. This file is the
//         manual-IP half only, and a green run says nothing about discovery.
//   (iv)  **NOTHING ABOUT `01-F80` PAIRING.** See R-5. A device gets its credential by fixture.
//   (v)   **NOTHING ABOUT THE CLOUD LEG.** No till here holds a cloud session, so relay
//         (`DEC-SYNC-009`), renewal (`01-F47`) and quarantine forwarding are untouched.
//   (vi)  **`01-F34`'s RELABEL — see reading R-4. This plane cannot carry it, and the file that
//         can is named.**
//   (vii) **`01-F45` IS NOT KILLED BY THIS FILE AND `multi-terminal-coherence.test.ts` §D SAYS
//         WHY** — every till receives the SAME envelopes carrying the SAME stamps, so a
//         cross-till comparison cannot distinguish a fold reading `branch_created_at` from one
//         reading `device_created_at`. §B3's clock injection owns only the case a single-store
//         suite cannot construct at all: a projected value derived from the READING till's own
//         clock or its own measured offset. That is a TRIPWIRE, not a live kill, and it is
//         restated here rather than quietly inherited.
//
// ── MUTATION MATRIX (the round-3 law: report the numbers, do not claim a test bites) ───────────
//
// Every row is this whole file (10 tests) against ONE changed branch of shipping code, applied
// and reverted inside one atomic command. Control = the unmutated tree, 10/10 green.
//
//   #   mutant (exactly one branch)                                          killed   which
//   M1  `01-F43`: a newly-serving device re-anchors branch time onto its own    1/10   §C2
//       raw clock (`setBranchTimeOffset(0)` on promotion)
//   M2  `01-F13`/`01-F39`: the election ignores CLASS and ranks by id alone     1/10   §A3
//   M3  `01-F48`/`01-F74` (c): admission ignores the revocation field           1/10   §D
//   M4  `01-F14`: the hub serves no window (`replayWindowTo` a no-op)           2/10   §A4, §B1
//   M5  `01-F34`: THE MIN-ID TIEBREAK — the confirm anchor drops its branch      1/10   §B2
//       stamp and compares envelope ids
//   C1  **CONTROL**: the anchor's EQUAL-STAMP tiebreak reversed (`id >`).        0/10   —
//       Set-determined either way and it never fires on this fixture; a suite
//       that killed it would be over-constraining the fold rather than
//       defending `01-F34`.
//
// ⚠ **TWO OF THESE ROWS ONLY BECAME KILLS AFTER THE FIXTURE WAS RE-AIMED, and both are the
// round-3 failure — a mechanism built correctly and never pointed at the case that matters.**
// M4 first killed a DIFFERENT test while the joiner test stayed green, because the "cold-started
// till" had the lexicographically lowest id and won the election the moment it appeared, so the
// incumbents pushed to it and it converged by a path `01-F14` says nothing about. M5 survived
// ALL TEN tests, because `branch_created_at` is `device_created_at + offset` and every till holds
// offset 0 until its first heartbeat — so both confirms carried one identical stamp and every
// tiebreak projected the same value. Neither was visible by reading the suite.

import { describe, expect, it } from "vitest";
import {
  awaitBranchHolds,
  awaitDistinctBranchOffsets,
  awaitOneHub,
  awaitServingChange,
  closeBranch,
  delay,
  HEARTBEAT_INTERVAL_MS,
  type LanTill,
  lanBranch,
  lanTill,
  ledgerIds,
  REELECTION_BUDGET_MS,
  ringNamed,
  runScriptOverLan,
  stampsOfType,
  startBranch,
  waitFor,
} from "./branch-lan-builders.js";
import { canonicalJson, must } from "./builders.js";
import { confirmed, created, lineAdded, payment, settlementClosed } from "./merge-builders.js";
import {
  deliveryOrdersDiverged,
  forwardIds,
  lineCells,
  observedOrders,
  orderRow,
  projectionBytesOf,
  type projectionOf,
  SERVICE_ORDER,
  serviceScript,
} from "./multi-terminal-builders.js";
import { branchTimeStatus } from "./time-builders.js";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * `01-F13` ranks by CLASS first and breaks ties by lowest device id. The counter's id sorts
 * STRICTLY ABOVE the kitchen's (`z…` > `a…`), so an implementation that ignored class and sorted
 * by id alone would elect the KITCHEN — and §A3 would fail. With the ids the other way round both
 * implementations agree and the election assertion proves nothing.
 */
const COUNTER_A = "zzz-till-counter-a";
const COUNTER_B = "zzy-till-counter-b";
const COUNTER_C = "zzx-till-counter-c";
/**
 * ⚠ **THE JOINER'S ID SORTS LAST, AND THE MUTATION ROUND IS WHY.** With `zzw…` it sorted FIRST,
 * so the "cold-started till" won the election the moment it appeared and the incumbents PUSHED
 * their events to it — which converges for a reason that has nothing to do with `01-F14`
 * (*"any device can … serve a cold-started peer"*). Measured: with a hub that serves no window
 * (`replayWindowTo` a no-op) the joiner test stayed GREEN and a different test died. `zzzz…`
 * sorts above every other id here (`-` < `z` at the fourth byte), so the joiner is a FOLLOWER and
 * the only path to the branch's history is the one the FR names.
 */
const COUNTER_D = "zzzz-till-counter-d";
const KITCHEN = "aaa-pass-kitchen";

const projectionsOf = (tills: readonly LanTill[]): string[] =>
  tills.map((t) => projectionBytesOf(t as unknown as Parameters<typeof projectionBytesOf>[0]));

const asCoherence = (till: LanTill) => till as unknown as Parameters<typeof projectionOf>[0];

// ===============================================================================================
// §A — `02-F11` / `01-F16`: the product sentence, over mutual TLS
// ===============================================================================================

describe("§A 02-F11 — one order, several tills, one branch LAN (01-F12/F13/F15/F16)", () => {
  it("02-F11/01-F16: concurrent line-adds from two tills MERGE — both tills show both lines at the price each was rung at", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
    ]);
    const a = lanTill(branch, COUNTER_A);
    const b = lanTill(branch, COUNTER_B);
    const all = [a, b];
    try {
      await startBranch(all);
      await awaitOneHub(all);

      ringNamed(a, "m-000", created(SERVICE_ORDER, { table_id: "T1" }));
      await awaitBranchHolds(all, ["m-000"]);

      // Rung back to back on two tills. On one event loop these cannot be simultaneous — see
      // "what this suite cannot see" (ii) — but neither has folded the other's line when it
      // rings its own, which is the state `01-F16` is about.
      ringNamed(a, "m-001", lineAdded(SERVICE_ORDER, "L1", { unit_price_paisa: 45000 }));
      ringNamed(b, "m-002", lineAdded(SERVICE_ORDER, "L2", { qty: 2, unit_price_paisa: 32000 }));
      await awaitBranchHolds(all, ["m-000", "m-001", "m-002"]);

      for (const till of all) {
        const cells = lineCells(asCoherence(till), SERVICE_ORDER);
        expect(
          Object.keys(cells).sort(),
          `${till.info.device_id} must hold BOTH lines (01-F16) — a branch where one till is missing a colleague's line bills the customer short`,
        ).toEqual(["L1", "L2"]);
        expect(cells.L1?.unit_price_paisa, `${till.info.device_id} L1 price`).toBe(45000);
        expect(cells.L2?.qty, `${till.info.device_id} L2 qty`).toBe(2);
        expect(cells.L2?.unit_price_paisa, `${till.info.device_id} L2 price`).toBe(32000);
      }
    } finally {
      closeBranch(all);
    }
  });

  it("02-F11: an order STARTED on one till and SETTLED on another is settled on BOTH — including the one that opened it", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
    ]);
    const a = lanTill(branch, COUNTER_A);
    const b = lanTill(branch, COUNTER_B);
    const all = [a, b];
    try {
      await startBranch(all);
      await awaitOneHub(all);

      ringNamed(a, "m-000", created(SERVICE_ORDER, { table_id: "T1" }));
      ringNamed(a, "m-001", lineAdded(SERVICE_ORDER, "L1", { unit_price_paisa: 45000 }));
      ringNamed(a, "m-002", confirmed(SERVICE_ORDER));
      await awaitBranchHolds(all, ["m-000", "m-001", "m-002"]);

      ringNamed(b, "m-003", payment(SERVICE_ORDER, 45000, { attempt: "sa-K" }));
      ringNamed(b, "m-004", settlementClosed(SERVICE_ORDER, { settlement_attempt_ids: ["sa-K"] }));
      const ids = ["m-000", "m-001", "m-002", "m-003", "m-004"];
      await awaitBranchHolds(all, ids);

      for (const till of all) {
        const row = orderRow(asCoherence(till), SERVICE_ORDER);
        expect(row, `${till.info.device_id} must hold the order`).toBeDefined();
        // The whole of `02-F11`: the till that OPENED the bill must not still show it payable
        // after another took the money. A till that does is how one order is settled twice, and
        // `01-F1` makes that permanent.
        expect(row?.settled, `${till.info.device_id} must show the order SETTLED`).toBe(1);
        expect(row?.pay_total, `${till.info.device_id} pay_total`).toBe(45000);
      }
    } finally {
      closeBranch(all);
    }
  });

  it("01-F13/01-F39: the COUNTER is hub over the branch wire even though the kitchen's device_id sorts lower", async () => {
    const branch = await lanBranch([
      { device_id: KITCHEN, device_class: "kitchen" },
      { device_id: COUNTER_A, device_class: "counter_electron" },
    ]);
    const kitchen = lanTill(branch, KITCHEN);
    const counter = lanTill(branch, COUNTER_A);
    const all = [kitchen, counter];
    try {
      await startBranch(all);
      const hub = await awaitOneHub(all);
      // `01-F13` ranks `counter_electron` above `kitchen`; the ids are chosen so a build that
      // sorted by id alone would answer the kitchen. `01-F73` (b) keeps class OUT of the
      // certificate, so the class this election runs on came from the ROSTER — which is what
      // makes this an assertion about the shipped admission path and not about a fixture field.
      expect(
        hub,
        "01-F13/01-F39: class outranks id — a branch that elects the pass screen has no counter hub and no cloud uplink",
      ).toBe(COUNTER_A);
    } finally {
      closeBranch(all);
    }
  });

  it("01-F14/02-F11: a till switched on MID-SERVICE converges to exactly what the branch already shows", async () => {
    // Three incumbents, because `serviceScript()` names terminals 0..2 and a script driven over
    // two tills would throw on its first three-terminal step. The joiner is declared LAST, so
    // under the dial-down rule it is the one that dials the running branch — which is the
    // direction a till powered on mid-service actually arrives from (`01-F12`, manual IP).
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
      { device_id: COUNTER_C, device_class: "counter_electron" },
      { device_id: COUNTER_D, device_class: "counter_electron" },
    ]);
    const a = lanTill(branch, COUNTER_A);
    const b = lanTill(branch, COUNTER_B);
    const c = lanTill(branch, COUNTER_C);
    const incumbents = [a, b, c];
    const late = lanTill(branch, COUNTER_D);
    const all = [a, b, c, late];
    try {
      await startBranch(incumbents);
      await awaitOneHub(incumbents);
      const ids = await runScriptOverLan(incumbents, serviceScript(), forwardIds());
      await awaitBranchHolds(incumbents, ids);
      const established = projectionBytesOf(asCoherence(a));
      for (const till of incumbents.slice(1)) {
        expect(
          projectionBytesOf(asCoherence(till)),
          `${till.info.device_id}: the incumbents must agree before the joiner arrives`,
        ).toBe(established);
      }

      // The dinner-rush second till: powered on with an EMPTY store, into a running branch.
      expect(ledgerIds(late).size, "the joiner starts cold").toBe(0);
      await startBranch([late]);
      await awaitBranchHolds(all, ids);

      expect(
        projectionBytesOf(asCoherence(late)),
        "01-F14: a hub-eligible peer serves a cold-started till the branch window — the joiner must show what the branch shows",
      ).toBe(established);
      for (const till of incumbents) {
        expect(
          projectionBytesOf(asCoherence(till)),
          `${till.info.device_id} must be unchanged by the arrival`,
        ).toBe(established);
      }
    } finally {
      closeBranch(all);
    }
  });
});

// ===============================================================================================
// §B — LAW 1 (`01-F34`) measured over real sockets rather than over a hand-shuffled array
// ===============================================================================================

describe("§B 01-F34 — every till projects the SAME bytes from a differently-ordered delivery", () => {
  it("01-F34/02-F11: three tills, a real branch wire, provably different arrival orders — identical event set, byte-identical projections", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
      { device_id: COUNTER_C, device_class: "counter_electron" },
    ]);
    const all = [COUNTER_A, COUNTER_B, COUNTER_C].map((id) => lanTill(branch, id));
    try {
      await startBranch(all);
      await awaitOneHub(all);
      const ids = await runScriptOverLan(all, serviceScript(), forwardIds());
      await awaitBranchHolds(all, ids);

      // (a) ⚠ THE ANTI-VACUITY GUARD. Without this the equality below is free: a branch that
      // handed every till one identical sequence would satisfy it while proving nothing about
      // order-independence. This is the assertion that makes §B a test of `01-F34` rather than a
      // test of `canonicalJson`.
      expect(
        deliveryOrdersDiverged(all as unknown as Parameters<typeof deliveryOrdersDiverged>[0]),
        `arrival orders must genuinely differ or the projection equality below proves nothing: ${canonicalJson(
          observedOrders(all as unknown as Parameters<typeof observedOrders>[0]),
        )}`,
      ).toBe(true);

      // (b) the claim: what every cashier on this branch sees is the same bytes.
      const bytes = projectionsOf(all);
      for (let i = 1; i < bytes.length; i++) {
        expect(
          bytes[i],
          `${all[i]?.info.device_id} projects differently from ${all[0]?.info.device_id} — two tills on one branch showing different orders`,
        ).toBe(bytes[0]);
      }
    } finally {
      closeBranch(all);
    }
  });

  it("01-F34/01-F43: the confirm anchor is the EARLIEST BRANCH STAMP on every till — never the lowest envelope id", async () => {
    /**
     * ⚠ **THIS TEST REPLACES A CROSS-RUN RELABEL, AND THE REASON IS A MEASUREMENT WORTH KEEPING.**
     * `01-F34`'s named instrument is a bijective envelope-id relabel: run the same service twice,
     * changing only the ids, and require `projection(φ(S))` to byte-equal `φ(projection(S))`.
     * That instrument **cannot be built on this plane.** A follower's offset is
     * `hub_clock − own_clock` measured across a real socket, so it lands on 0 or −1 ms at random;
     * `branch_created_at` carries that difference into the projection, and the two runs differ in
     * a TIME column before any id is compared. Measured, on the correct implementation:
     * `confirmed_at` was `1500512000000` in run 1 and `1500511999999` in run 2 — a suite that
     * shipped that comparison would be RED against a correct build, which the round-3 law rates
     * exactly as damaging as a vacuous test.
     *
     * **The relabel therefore lives where a clock can be injected — `multi-terminal-coherence.test.ts`
     * §C over `20 §2.4`'s virtual clock — and it works there: measured, the min-id mutant below
     * kills 3 of the 20 tests in that file's group and 0 of the 10 here.** What this test does
     * instead is assert the anchor RULE directly, which needs one run and no id arithmetic: the
     * projected `confirmed_at` is the earliest branch stamp among the competing confirms.
     */
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
      { device_id: COUNTER_C, device_class: "counter_electron" },
    ]);
    // Distinct skews, so the two confirms land on branch stamps YEARS apart rather than on one
    // identical stamp — under which every tiebreak projects the same value and this test would be
    // decoration. The guard below asserts that rather than trusting it.
    const skews = [0, 3 * YEAR_MS, 5 * YEAR_MS];
    const tills = [COUNTER_A, COUNTER_B, COUNTER_C].map((id, i) =>
      lanTill(branch, id, { skew_ms: skews[i] ?? 0 }),
    );
    try {
      await startBranch(tills);
      await awaitOneHub(tills);
      await awaitDistinctBranchOffsets(tills);
      const ids = await runScriptOverLan(tills, serviceScript(), forwardIds());
      await awaitBranchHolds(tills, ids);

      const witness = must(tills[0], "a till");
      const confirms = stampsOfType(witness, "order.confirmed");
      expect(
        confirms.length,
        "01-F34: the script must carry TWO competing confirms — with one candidate every tiebreak agrees and nothing is under test",
      ).toBeGreaterThanOrEqual(2);

      const byStamp = [...confirms].sort((a, b) => a.stamp - b.stamp);
      const byId = [...confirms].sort((a, b) => (a.id < b.id ? -1 : 1));
      const earliest = must(byStamp[0], "the earliest confirm");
      const lowestId = must(byId[0], "the lowest-id confirm");

      // ⚠ ANTI-VACUITY, AND IT IS THE WHOLE TEST. If the id-minimal confirm IS the stamp-minimal
      // one, both the correct rule and `01-F34`'s named counterexample — "a min-id tiebreak … while
      // smuggling wall clock through the UUIDv7 prefix" — select the same member and project the
      // same value. This is the "guard that was never pointed at the dangerous case" the round-3
      // law is about, and the arrangement that avoids it is the skews above.
      expect(
        lowestId.id,
        `01-F34: the LOWEST-ID confirm must not also be the EARLIEST — otherwise a min-id tiebreak and the branch-stamp rule agree and this assertion proves nothing: ${canonicalJson(confirms)}`,
      ).not.toBe(earliest.id);

      for (const till of tills) {
        const row = orderRow(asCoherence(till), SERVICE_ORDER);
        expect(
          row?.confirmed_at,
          `${till.info.device_id}: the confirm anchor must be the EARLIEST branch stamp (01-F43 makes "earliest" a real fact across a branch on one clock), never the lowest envelope id — an id comparison reaching a projected value is the 01-F34 break, and it survives every cross-till equality assertion in this file. confirms=${canonicalJson(confirms)}`,
        ).toBe(earliest.stamp);
      }
    } finally {
      closeBranch(tills);
    }
  });

  it("01-F43/01-F45/01-F34: tills whose raw clocks are YEARS apart hold DIFFERENT branch offsets and still project byte-identically", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
      { device_id: COUNTER_C, device_class: "counter_electron" },
    ]);
    // The founder's threat model: every device arbitrarily wrong, in either direction, by a
    // different amount — and the hub wrong too, so branch time is collectively wrong.
    const a = lanTill(branch, COUNTER_A, { skew_ms: 11 * YEAR_MS });
    const b = lanTill(branch, COUNTER_B, { skew_ms: -3 * YEAR_MS });
    const c = lanTill(branch, COUNTER_C, { skew_ms: 7 * 30 * 24 * 3600 * 1000 });
    const all = [a, b, c];
    try {
      await startBranch(all);
      await awaitOneHub(all);
      const ids = await runScriptOverLan(all, serviceScript(), forwardIds());
      await awaitBranchHolds(all, ids);
      // The hub publishes branch time on its heartbeat, so give every follower at least one.
      await delay(HEARTBEAT_INTERVAL_MS + 500);

      // ⚠ ANTI-VACUITY. A fold reading the READING till's own clock or offset can only be caught
      // if those actually differ across tills — the hub measures 0 and every follower measures
      // its own error. A single-store suite has one clock and cannot construct this case at all.
      const offsets = all.map((t) => branchTimeStatus(t.store).offset_ms);
      expect(
        new Set(offsets).size,
        `the tills must hold DIFFERENT branch-time offsets or this test cannot see a fold reading the local clock: ${canonicalJson(offsets)}`,
      ).toBeGreaterThan(1);

      const bytes = projectionsOf(all);
      for (let i = 1; i < bytes.length; i++) {
        expect(
          bytes[i],
          `${all[i]?.info.device_id} projects differently from ${all[0]?.info.device_id} — a projected value is reading this till's own clock or offset (01-F45), not the branch stamp the event carries`,
        ).toBe(bytes[0]);
      }
    } finally {
      closeBranch(all);
    }
  });
});

// ===============================================================================================
// §C — `01-F43`: THE HUB SERVES THE CLOCK, IT DOES NOT DEFINE IT
//
// ⚠ Written topology-neutrally on purpose (reading R-2). R2 retires `01-F13`'s election in
// favour of a fixed branch authority; what survives that ruling is the PROPERTY — branch time
// does not move when the device serving it changes — and that is what these tests assert. The
// word "re-election" appears in `01-F43`'s own text and is quoted, never asserted on.
// ===============================================================================================

describe("§C 01-F43 — branch time is continuous across a change of the device serving it", () => {
  it("01-F43: the serving till's own offset is 0 and its basis is `branch`; a follower's offset is hub_clock − own_clock", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: KITCHEN, device_class: "kitchen" },
    ]);
    const counter = lanTill(branch, COUNTER_A, { skew_ms: 11 * YEAR_MS });
    const pass = lanTill(branch, KITCHEN, { skew_ms: -2 * YEAR_MS });
    const all = [counter, pass];
    try {
      await startBranch(all);
      // ⚠ WHICH till serves is not asserted here (reading R-2), and the mutation round is why:
      // an election that ignored `01-F39`'s class ranking killed this test as well as §A3's,
      // so a reader of a red run could not tell a `01-F43` break from a `01-F13` one. This test
      // owns branch time; §A3 owns who serves it.
      const servingId = await awaitOneHub(all);
      const hub = must(
        all.find((t) => t.info.device_id === servingId),
        "the serving till",
      );
      const follower = must(
        all.find((t) => t !== hub),
        "the following till",
      );
      await delay(HEARTBEAT_INTERVAL_MS + 500);

      // `toMatchObject` and not `toEqual`: `branchTimeStatus` also carries `01-N2`'s skew fields,
      // which are device HEALTH and explicitly not this FR's (`01-F45` names skew detection as
      // the one sanctioned reader of the raw device clock). Pinning them here would make this
      // test fail the day health gains a field, which is a `24 §3` oracle failing a correct
      // implementation.
      expect(
        branchTimeStatus(hub.store),
        "01-F43: the serving device does not measure itself — its offset is 0 and its basis is `branch`",
      ).toMatchObject({ offset_ms: 0, basis: "branch" });

      const status = branchTimeStatus(follower.store);
      expect(
        status.basis,
        "01-F43: a follower in hub contact stamps `branch`, not `branch_provisional`",
      ).toBe("branch");
      // The follower's clock is 13 years behind the hub's, so its offset must be ≈ +13 years.
      // Tolerance is generous because a real socket's one-way delay is inside it and the error
      // this detects is measured in YEARS — eight orders of magnitude apart.
      // 13 years apart whichever way the election went — the size of the error this detects is
      // what makes the 5 s tolerance below irrelevant to the claim.
      const expected = hub.skew_ms - follower.skew_ms;
      expect(
        Math.abs(status.offset_ms - expected),
        `01-F43: the follower's offset must be hub_clock − own_clock (${expected}); saw ${status.offset_ms}`,
      ).toBeLessThan(5_000);
    } finally {
      closeBranch(all);
    }
  });

  it("01-F43: when the serving till goes, branch time does NOT teleport onto the successor's raw clock — the surviving tills read the same branch instant", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
      { device_id: COUNTER_C, device_class: "counter_electron" },
    ]);
    // ⚠ The successor's skew is what makes this test able to fail. `COUNTER_B` takes over and its
    // raw clock is 6 years off the branch's; an implementation that reset its offset to 0 on
    // promotion would move branch time by six years and every open order's age with it. A suite
    // whose successor had the same clock as the incumbent could not tell the two apart.
    const a = lanTill(branch, COUNTER_A, { skew_ms: 4 * YEAR_MS });
    const b = lanTill(branch, COUNTER_B, { skew_ms: -2 * YEAR_MS });
    const c = lanTill(branch, COUNTER_C, { skew_ms: 9 * YEAR_MS });
    const all = [a, b, c];
    try {
      await startBranch(all);
      // ⚠ WHICH till serves is DELIBERATELY NOT PINNED (reading R-2). `01-F13` answers "lowest
      // device id among the top class" today and R2 answers "the counter, fixed" tomorrow; this
      // test is about neither. It takes whoever is serving, removes it, and asserts the property
      // both topologies owe: branch time does not move when the server does.
      const servingId = await awaitOneHub(all);
      const serving = must(
        all.find((t) => t.info.device_id === servingId),
        "the serving till",
      );
      const survivors = all.filter((t) => t !== serving);
      await delay(HEARTBEAT_INTERVAL_MS + 500);

      // ⚠ THE SKEWS ARE WHAT MAKE THIS TEST ABLE TO FAIL. Every till's raw clock is years off
      // every other's, so an implementation that reset the successor's offset to 0 on promotion
      // would move branch time by YEARS. A suite whose tills shared a clock could not tell the
      // two implementations apart at all.
      const first = must(survivors[0], "a surviving till");
      const second = must(survivors[1], "a second surviving till");
      expect(
        Math.abs(first.branchNow() - second.branchNow()),
        "the branch must agree on one instant before the handover, or the comparison after it is meaningless",
      ).toBeLessThan(5_000);

      // The counter reboots. `01-F43` calls this "a normal event on any counter reboot".
      const anchor = first.branchNow();
      serving.stop();
      const handoverAt = Date.now();
      const newServer = await awaitServingChange(survivors, servingId, REELECTION_BUDGET_MS);
      expect(
        Date.now() - handoverAt,
        `01-F13: the branch must have a serving device again inside ${REELECTION_BUDGET_MS} ms`,
      ).toBeLessThan(REELECTION_BUDGET_MS);
      expect(newServer, "the successor must be one of the surviving tills").not.toBe(servingId);
      // At least one heartbeat under the new authority, so the follower has re-measured.
      await delay(HEARTBEAT_INTERVAL_MS * 2);

      for (const till of survivors) {
        const drift = Math.abs(till.branchNow() - (anchor + (Date.now() - handoverAt)));
        expect(
          drift,
          `${till.info.device_id}: branch time moved by ${drift} ms across the handover — 01-F43 says a newly-serving device "retains the branch time it already held, keeping its measured offset rather than resetting to its own raw clock". A jump of this size is the successor's own clock becoming the branch's.`,
        ).toBeLessThan(10_000);
        expect(
          branchTimeStatus(till.store).basis,
          `${till.info.device_id} must still stamp \`branch\` after the handover — falling back to \`branch_provisional\` puts every confirm in 01-F45's unverified tier`,
        ).toBe("branch");
      }
    } finally {
      closeBranch(all);
    }
  });
});

// ===============================================================================================
// §D — `01-F17` / `01-F72`: a branch keeps selling through an admission refusal
// ===============================================================================================

describe("§D 01-F17/01-F72 — a refused till changes nothing for the admitted ones", () => {
  it("01-F72(e·i)/01-F74(c)/01-F17: a till the roster REVOKES is refused at the handshake, and the two admitted tills go on cohering", async () => {
    const branch = await lanBranch([
      { device_id: COUNTER_A, device_class: "counter_electron" },
      { device_id: COUNTER_B, device_class: "counter_electron" },
      { device_id: COUNTER_C, device_class: "counter_electron" },
    ]);
    // A and B hold a roster that marks C revoked; C holds one that marks nobody, so it believes
    // itself entitled and dials — which is the only version of this worth testing. `01-F81` (a):
    // a departure is a MARKED entry, so C is IN both rosters and refused by two of them.
    const a = lanTill(branch, COUNTER_A, { revoked: [COUNTER_C] });
    const b = lanTill(branch, COUNTER_B, { revoked: [COUNTER_C] });
    const c = lanTill(branch, COUNTER_C);
    const admitted = [a, b];
    const all = [a, b, c];
    try {
      await startBranch(all);
      await awaitOneHub(admitted);

      ringNamed(a, "m-000", created(SERVICE_ORDER, { table_id: "T1" }));
      ringNamed(b, "m-001", lineAdded(SERVICE_ORDER, "L1", { unit_price_paisa: 45000 }));
      await awaitBranchHolds(admitted, ["m-000", "m-001"]);

      // `01-F72` (e·i): under TLS 1.3 the dialler's `Finished` precedes the acceptor's verdict,
      // so C's refusal is observed as the CLOSE and never as a failure to connect. What is
      // assertable from here is the OUTCOME: C never joins the branch's peer set and never
      // receives a branch event. `01-F48` — "revocation blocks reads as well as writes".
      await waitFor(
        "the revoked till to be absent from both admitted tills' peer sets (01-F74 (c))",
        () =>
          admitted.every((t) => !t.session.status().peers.some((p) => p.device_id === COUNTER_C)),
        10_000,
      );
      expect(
        [...ledgerIds(c)],
        "01-F48: a revoked till receives NO further events on any plane — reads as well as writes",
      ).toEqual([]);

      // `01-F17`: and the sale was never blocked. The admitted pair coheres exactly as §A says.
      for (const till of admitted) {
        expect(
          Object.keys(lineCells(asCoherence(till), SERVICE_ORDER)),
          `${till.info.device_id} must still hold the branch's line while a stranger is being refused`,
        ).toEqual(["L1"]);
      }
    } finally {
      closeBranch(all);
    }
  });
});
