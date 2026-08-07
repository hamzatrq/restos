// Acceptance tests — S-2, the `shift_cash` fold: expected cash BY METHOD, over/short as a
// CARRIED FACT, and the shift/day lifecycle. Authored from spec text only (24 §3 step 2):
// 02-F21/F22/F23/F24/F26/F37, 01-F17/F30/F31/F32, 01-F43..F46, 26 §7, 00 §6, and
// FOLDS.md line 15. The pinned surface, the anomaly-code policy and every open choice are
// documented in ./shift-cash-builders.ts — read that header before changing anything here.
//
// RED-AWAITING-IMPLEMENTATION: nothing in `packages/sync-client/src/folds/` implements this
// fold and `@restos/sync-client/fold-engine` exports none of its three symbols, so every test
// that calls the fold fails naming the missing export. That is the intended red. Measured:
// **26 of 27 RED, 1 GREEN** — the one green is §0b, which inspects this suite's own FIXTURES and
// never calls the fold. It is labelled on the test itself with the reason it is pinned anyway, so
// no test in this file is credited with coverage of the fold that it does not carry.
//
// The 01-F34 law (relabel invariance, garbage-metadata injection, Proxy-poisoned envelopes)
// is a separate file: ./shift-cash-invariance.test.ts. The ingest-path (01-F17) integration
// is ./shift-cash-store.test.ts.
//
// ── THE ORCHESTRATOR RULINGS THIS FILE FOLLOWS (S-1 ↔ S-2 contract conflict) ─────────────
// `shift.closed` carries `expected_paisa_by_method` (RULING 1 — money fields name their unit),
// EXHAUSTIVE over `PAYMENT_METHODS` with an explicit `0` (RULING 2 — the `01-F60` free-modifier
// precedent: "no RAAST this shift" and "the RAAST bucket was dropped" must not look alike), and
// a required `variance_paisa` that the fold READS and never re-derives (RULING 3, August 2026 —
// `26 §7` classifies over/short as a CARRIED FACT and `01-F1` forbids the mutation a read-time
// recompute performs in effect). Every derivation is in ./shift-cash-builders.ts's header. The
// fold's LIVE `expected_json` is UNAFFECTED and stays grow-only — different object, different
// rule, see §1 and §3 below.
//
// ── WHAT THE AUGUST 2026 ROUND ADDED, AND WHY ──────────────────────────────────────────
// Five branches of the shipped fold had NO fixture anywhere in this suite that reached them, so
// each would have passed with the branch deleted. Every one of them now has a directed section
// AND a place inside `shiftCashScenario()`, where the invariance file's three nets fold it:
//   §9   `01-F45` basis precedence — no fixture had ever passed `basis: "branch_provisional"`.
//   §7b  `02-F43`'s unbound drawer bucket — asserted on the COUNT and the TOTAL, because
//        "logged and counted" is defeated by an implementation that logs and counts nothing.
//   §4b  the disputed-unbound rendering (`01-F31`) — no fixture produced a divergent unbound key.
//   §8b  `day_open_fork` — no fixture carried a non-null `prev_day_id`.
//   §3   the CARRIED variance, with fixtures whose carried value a recompute CONTRADICTS.
// Measured by mutation, not asserted: each section was re-run against a copy of the fold with
// that one branch deleted or inverted, and confirmed RED. Kill counts are in the session report.
//
// ── ⚠ ONE ASSERTION IN THIS FILE RESTS ON A PIN, NOT ON QUOTED FR TEXT ──────────────────
// It is an interpretation the implementer may contest as a contract-clarification event rather
// than a test defect. Full derivation and the finding it was reported as: the
// `opening_float_paisa` bullet in ./shift-cash-builders.ts's pinned-surface block.
//
//  PIN #1 — THE DIVERGENT DAY FLOAT. §8's "two `day.opened` ... whose floats DISAGREE" asserts
//    the disputed float contributes ZERO and raises a `/diverg/` anomaly with both members
//    retained. NO FR states this for a day float. It is derived BY ANALOGY: 01-F34's only merge
//    rule that can hold two disagreeing scalars is the explicitly rendered contested set, 01-F31
//    gives that rule its shape for payment attempt keys, 01-F58 applies the same clause outside
//    the payment domain, and standing law 3 does the same for an unrepresentable total.
//    Deliberately isolated: the 01-F34 property that IS determined (the answer depends on neither
//    envelope id nor delivery order) is asserted in the NEXT test and in
//    ./shift-cash-invariance.test.ts §1b, so the min-id kill never rests on this pin.
//
// (Two more pins were added in August 2026 and are documented at their own tests: PIN #3, the
//  `unbound_settlement_divergence` code spelling in §4b, and PIN #4, that the day fork and the
//  shift fork carry DISTINCT codes in §8b. Both are contract-clarification events if contested.)
//
//  PIN #2 (THE CASHIER SOURCE) IS RETIRED — SUPERSEDED BY `02-F45` (August 2026). It recorded
//    that no FR chose between `payload.cashier` and the envelope's `actor_user_id`, so every
//    fixture set the value on BOTH surfaces and NO assertion in this suite could distinguish the
//    two mechanisms. `02-F45` chose the envelope, and named the reason: `02-F41` rules attribution
//    is whoever's PIN is in, `01-F27` puts that identity in the PIN session which the envelope
//    carries as `actor_user_id`, and a `cashier` duplicated into the payload is a SECOND SOURCE
//    for one fact that an append-only ledger has no rule for reconciling. A source-agnostic pin
//    left standing in front of a decided FR is the `01-F60` shape — a green test defending a rule
//    that had already been overruled — so it is gone rather than annotated. §8 now attributes on
//    the ENVELOPE ONLY and asserts the payload copy is NOT read.
//
// ONE 01-F34 assertion lives here rather than there, on purpose: §8's DIVERGENT `day.opened`
// pair is the fold's only money field decided by a merge rule over two disagreeing heads, and
// 26 §8 says a `min(envelope.id)` tiebreak over exactly that shape passes plain convergence and
// is convergent-AND-WRONG. Good relabel technique in the other file is not coverage of this
// case, so the case carries its own relabel gate here AND is inside `shiftCashScenario()`, which
// every net in the invariance file runs over.

import { describe, expect, it } from "vitest";
import { canonicalJson } from "./builders.js";
import {
  BOUND_PAID_OUT,
  BRANCH_T0,
  basisPrecedenceSet,
  branchEmitter,
  businessDate,
  CASHIER_A,
  CASHIER_B,
  DIVERGENT_FLOAT_A,
  DIVERGENT_FLOAT_B,
  dayClosed,
  dayForkSet,
  dayOpened,
  dayRow,
  depositRecorded,
  divergentDayOpenSet,
  divergentUnboundSet,
  drawerOpened,
  exactSum,
  exceptionsOf,
  expectedAtCloseOf,
  expectedOf,
  generateShiftCashSet,
  hasCode,
  MAX_SAFE,
  NOT_NO_SALE_REASON,
  PAYMENT_METHODS,
  PROVISIONAL_BACKDATE_MS,
  paidOut,
  projectionBytes,
  reversedIds,
  shiftCash,
  shiftCashScenario,
  shiftClosed,
  shiftOpened,
  shiftOpenedWithPayloadCashier,
  shiftPayment,
  shiftRow,
  UNBOUND_PAID_OUT,
  unboundDrawerSet,
  unboundRow,
} from "./shift-cash-builders.js";

// ===========================================================================
// §0 — the fold's own vocabulary.
// ===========================================================================

describe("§0 the shift_cash fold consumes shift.*/cash.*/payment.* and nothing else (FOLDS.md line 15)", () => {
  it("02-F22: an order.created changes no shift_cash state — an unrelated event is not silently bucketed", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("v0");
    emit(0, shiftOpened("S1"), 0);
    const withoutOrder = fold.projectAll(envelopes);
    emit(0, { type: "order.created", payload: { order_id: "O1", channel: "counter" } }, 100);
    const withOrder = fold.projectAll(envelopes);
    expect(withOrder.shifts).toHaveLength(1);
    expect(projectionBytes(withOrder)).toBe(projectionBytes(withoutOrder));
  });
});

// ===========================================================================
// §0b — THE FIXTURES THEMSELVES, against the two orchestrator rulings.
// ===========================================================================

describe("§0b the fixtures obey the two orchestrator rulings (the S-1 ↔ S-2 contract)", () => {
  // GREEN at authorship, and it asserts NOTHING about the fold — no coverage of this fold is
  // claimed by it. It is a FIXTURE tripwire, and it earns its place twice over:
  //   * §3's `expectedAtCloseOf` expectations are written as literal five-key maps precisely so
  //     they do not move with the builder. Without this test a builder that quietly stopped
  //     filling ruling 2's zeros would red §3 with a misleading "the fold dropped keys".
  //   * §3 only exercises DIRECTED closes. The scenario's close and every generated one are
  //     folded by ./shift-cash-invariance.test.ts, which compares projections to each other and
  //     so would never notice a partial map — the exact shape of the S-1 conflict this ruling
  //     closed could reappear there silently.
  it("RULINGS 1+2: every shift.closed this suite emits carries an EXHAUSTIVE `expected_paisa_by_method`, and never the old name", () => {
    const closesIn = (envelopes: readonly Record<string, unknown>[]) =>
      envelopes
        .filter((env) => env.type === "shift.closed")
        .map((env) => env.payload as Record<string, unknown>);
    const fromScenario = closesIn(shiftCashScenario().envelopes);
    const fromGenerator = closesIn(
      [1, 7, 99, 4242].flatMap((seed) => generateShiftCashSet(seed).envelopes),
    );
    // Non-vacuity, per SOURCE and not in total: with one combined count, a generator that stopped
    // emitting closes would silently narrow this test to the directed scenario and still pass.
    expect(fromScenario.length).toBeGreaterThan(0);
    expect(fromGenerator.length).toBeGreaterThan(0);
    const closes = [...fromScenario, ...fromGenerator];
    for (const payload of closes) {
      // RULING 1: the unit belongs in a money field's name, and the old name must not survive
      // anywhere — an implementation reading `expected_by_method` would find nothing and carry
      // an empty map into `expected_at_close_json` rather than failing loudly.
      expect(Object.hasOwn(payload, "expected_by_method"), "ruling 1: the old name is gone").toBe(
        false,
      );
      // RULING 2: exhaustive over the closed tender set (02-F12 + 01-F32).
      const carried = payload.expected_paisa_by_method as Record<string, number>;
      expect(Object.keys(carried).sort()).toEqual([...PAYMENT_METHODS].sort());
    }
    // …and "exhaustive" has to mean EXPLICIT ZEROS. Without this, a set in which every seed
    // happened to tender all five methods satisfies the key-set check above while proving nothing
    // about the case the ruling exists for — "no RAAST this shift" vs "the bucket was dropped".
    const withAnExplicitZero = closes.filter((payload) =>
      Object.values(payload.expected_paisa_by_method as Record<string, number>).includes(0),
    );
    expect(withAnExplicitZero.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// §1 — EXPECTED CASH IS BY METHOD (02-F23; 01-F32 / DEC-MONEY-007).
// A single scalar "expected cash" passes a naive test and is wrong for four of the five
// tenders: `khata_credit` is not money received, `aggregator_receivable` is collected by
// the aggregator, `card`/`raast` never enter the drawer.
// ===========================================================================

describe("§1 expected cash BY METHOD (02-F23, 01-F32, DEC-MONEY-007)", () => {
  it("02-F23/01-F32: all five tenders bucket separately — the cash bucket is NOT the scalar total of the shift", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("m1");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 100000, { attempt: "sa-c1", shift_id: "S1" }), 100);
    emit(0, shiftPayment("O2", 40000, { attempt: "sa-c2", shift_id: "S1" }), 150);
    emit(1, shiftPayment("O3", 250000, { attempt: "sa-cd", shift_id: "S1", method: "card" }), 200);
    emit(1, shiftPayment("O4", 50000, { attempt: "sa-r", shift_id: "S1", method: "raast" }), 250);
    emit(
      2,
      shiftPayment("O5", 185000, { attempt: "sa-k", shift_id: "S1", method: "khata_credit" }),
      300,
    );
    emit(
      2,
      shiftPayment("O6", 90000, {
        attempt: "sa-a",
        shift_id: "S1",
        method: "aggregator_receivable",
      }),
      350,
    );
    const expected = expectedOf(shiftRow(fold.projectAll(envelopes), "S1"));
    expect(expected).toEqual({
      cash: 140000,
      card: 250000,
      raast: 50000,
      khata_credit: 185000,
      aggregator_receivable: 90000,
    });
    // The trap, named: a fold that summed one scalar "expected cash" reads 715000, and the
    // cashier is then asked to produce Rs 7,150 from a drawer holding Rs 1,400.
    const scalar = Object.values(expected).reduce((a, b) => a + b, 0);
    expect(scalar).toBe(715000);
    expect(expected.cash).toBe(140000);
    // Every method the branch actually tendered is keyed by its own registry name.
    expect(Object.keys(expected).sort()).toEqual([...PAYMENT_METHODS].sort());
  });

  it("DEC-MONEY-007/02-F23: a khata repayment tendered in CASH is drawer cash — bucketing is by METHOD, never filtered by purpose", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("m2");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 100000, { attempt: "sa-s", shift_id: "S1" }), 100);
    emit(
      1,
      shiftPayment("O1", 40000, {
        attempt: "sa-rp",
        shift_id: "S1",
        purpose: "repays_receivable",
      }),
      200,
    );
    const expected = expectedOf(shiftRow(fold.projectAll(envelopes), "S1"));
    // A fold filtering to `purpose: settles_order` (the 01-F32 rule for an ORDER's pay_total)
    // reads 100000 and loses Rs 400 of real notes out of the reconciliation.
    expect(expected.cash).toBe(140000);
    expect(expected).toEqual({ cash: 140000 });
  });

  it("01-F32/DEC-MONEY-007: khata_credit and aggregator_receivable never enter the cash bucket — neither is money in the drawer", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("m3");
    emit(0, shiftOpened("S1"), 0);
    emit(
      0,
      shiftPayment("O1", 185000, { attempt: "sa-k", shift_id: "S1", method: "khata_credit" }),
      100,
    );
    emit(
      1,
      shiftPayment("O2", 90000, {
        attempt: "sa-a",
        shift_id: "S1",
        method: "aggregator_receivable",
      }),
      200,
    );
    const expected = expectedOf(shiftRow(fold.projectAll(envelopes), "S1"));
    expect(expected).toEqual({ khata_credit: 185000, aggregator_receivable: 90000 });
    expect(expected.cash).toBeUndefined();
  });

  it("02-F23 (oracle-pinned): the expected map is a grow-only union — a method with no delivered activity is absent, not a zero row", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("m4");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 12345, { attempt: "sa-1", shift_id: "S1", method: "raast" }), 100);
    const expected = expectedOf(shiftRow(fold.projectAll(envelopes), "S1"));
    expect(Object.keys(expected)).toEqual(["raast"]);
    expect(expected.raast).toBe(12345);
  });
});

// ===========================================================================
// §2 — THE SHIFT IS A CARRIED KEY (26 §7).
// The failure to write a test against is a fold that asks "which shift was open when this
// payment arrived?" — that reads the READING DEVICE's state, so two devices project
// different money from the same event set.
// ===========================================================================

describe("§2 bucketing a payment is a CARRIED KEY, not an ordering question (26 §7, 02-F22)", () => {
  it("26 §7/02-F22: a payment carrying a CLOSED shift's key lands in that shift and never in the open one — identically in both delivery orders", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("k1");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 100000, { attempt: "sa-1", shift_id: "S1" }), 1000);
    emit(
      0,
      shiftClosed("S1", {
        counted_cash_paisa: 100000,
        expected_paisa_by_method: { cash: 100000 },
        variance_paisa: 0,
      }),
      2000,
    );
    emit(1, shiftOpened("S2", { prev_shift_id: "S1" }), 2100);
    // The straggler: rung up during S1, delivered after S1 closed and S2 opened.
    emit(2, shiftPayment("O9", 25000, { attempt: "sa-late", shift_id: "S1" }), 3000);

    const forward = fold.projectAll(envelopes);
    const reversed = fold.projectAll([...envelopes].reverse());
    expect(projectionBytes(reversed)).toBe(projectionBytes(forward));

    // A fold asking "which shift is open right now" puts the straggler in S2 on the forward
    // delivery and in S1 on the reversed one — converged nowhere, and the wrong cashier is
    // held responsible for Rs 250.
    expect(expectedOf(shiftRow(forward, "S1")).cash).toBe(125000);
    expect(expectedOf(shiftRow(forward, "S2"))).toEqual({});
  });

  it("00 §6/26 §7: a payment whose shift.opened has not arrived yet is held, never dropped — the shift appears with its money when the open lands", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("k2");
    emit(0, shiftPayment("O1", 77500, { attempt: "sa-1", shift_id: "S7" }), 1000);
    emit(1, shiftOpened("S7"), 500); // emitted EARLIER in branch time, delivered second
    const payFirst = fold.projectAll(envelopes);
    const openFirst = fold.projectAll([...envelopes].reverse());
    expect(expectedOf(shiftRow(payFirst, "S7")).cash).toBe(77500);
    expect(projectionBytes(openFirst)).toBe(projectionBytes(payFirst));
  });
});

// ===========================================================================
// §3 — OVER/SHORT IS A CARRIED FACT (26 §7, 02-F23).
// A fold that recomputes "expected" at read time silently changes a number the cashier
// already signed off, the moment a late payment arrives. 01-F1 forbids the mutation and the
// recompute performs it in effect.
// ===========================================================================

describe("§3 over/short is a CARRIED FACT, never a read-time recompute (26 §7, 02-F23, 01-F1)", () => {
  it("26 §7/01-F1: a late payment moves the LIVE expected map and does NOT move the closed shift's recorded variance", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("c1");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 100000, { attempt: "sa-1", shift_id: "S1" }), 1000);
    // Rs 25 of petty cash left the drawer before the close (02-F26), so the expected DRAWER
    // figure the cashier signed against is not `expected.cash` — and the carried variance is
    // therefore NOT `counted − expected.cash`. This suite pins no derivation whatever: the only
    // obligation is that the fold carries the number the close carries.
    emit(0, paidOut("S1", 2500), 1500);
    emit(
      0,
      shiftClosed("S1", {
        counted_cash_paisa: 99000,
        expected_paisa_by_method: { cash: 100000 },
        variance_paisa: 1500,
      }),
      2000,
    );
    const atClose = shiftRow(fold.projectAll(envelopes), "S1");
    // ORCHESTRATOR RULING 3 (August 2026): the CARRIED value wins. A fold recomputing
    // `counted − expected_at_close.cash` reads −1000 and reports the shift SHORT where the
    // cashier signed it OVER — a sign flip on the number that costs a cashier their job.
    expect(atClose.variance_paisa).toBe(1500);
    expect(99000 - 100000).not.toBe(1500); // the fixture really does disagree with the recompute
    expect(atClose.variance_paisa).not.toBe(-1000);
    // Written out LITERALLY rather than through `expectedPaisaByMethod(…)`, because building the
    // expectation with the same helper that built the fixture would move both together if the
    // helper ever stopped filling ruling 2's zeros. Spelt out, this is also the test that
    // separates CARRIED from RECOMPUTED: the live `expected_json` at close time is the one-key
    // `{cash: 100000}`, so a fold filling this column by copying the live map reads one key where
    // five are carried. Before ruling 2 the two were the same object and the defect was invisible.
    expect(expectedAtCloseOf(atClose)).toEqual({
      cash: 100000,
      card: 0,
      raast: 0,
      khata_credit: 0,
      aggregator_receivable: 0,
    });

    emit(2, shiftPayment("O9", 5000, { attempt: "sa-late", shift_id: "S1" }), 3000);
    const afterLate = shiftRow(fold.projectAll(envelopes), "S1");
    // The signed-off facts are frozen …
    expect(afterLate.counted_cash_paisa).toBe(99000);
    expect(expectedAtCloseOf(afterLate)).toEqual({
      cash: 100000,
      card: 0,
      raast: 0,
      khata_credit: 0,
      aggregator_receivable: 0,
    });
    expect(afterLate.variance_paisa).toBe(1500);
    // … while the ledger stays honest about what was actually tendered against the shift.
    expect(expectedOf(afterLate).cash).toBe(105000);
    expect(afterLate.closed).toBe(1);
  });

  it("02-F23/26 §7: over is positive and short is negative — the carried SIGNED fact, which a recompute of `counted − expected.cash` gets wrong in both directions", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("c2");
    emit(0, shiftOpened("S-short"), 0);
    emit(0, shiftOpened("S-over"), 10);
    // Both shifts paid cash OUT before closing (02-F26), so on both of them the figure the
    // cashier was reconciling against is below `expected.cash` and the carried variance differs
    // from the naive subtraction. On S-over it differs in SIGN, which is the whole point of
    // 02-F23's "over/short" being two directions.
    emit(0, paidOut("S-short", 3000), 500);
    emit(1, paidOut("S-over", 5000), 510);
    emit(
      0,
      shiftClosed("S-short", {
        counted_cash_paisa: 96000,
        // A by-method figure whose non-cash buckets must NOT enter the variance. Under ruling 2
        // the map is exhaustive, so `raast` and `aggregator_receivable` are carried here as
        // explicit zeros — the non-zero non-cash buckets that give this test its teeth stay.
        expected_paisa_by_method: { cash: 100000, card: 250000, khata_credit: 185000 },
        variance_paisa: -1000,
      }),
      1000,
    );
    emit(
      1,
      shiftClosed("S-over", {
        counted_cash_paisa: 96500,
        expected_paisa_by_method: { cash: 100000, aggregator_receivable: 90000 },
        variance_paisa: 1500,
      }),
      1100,
    );
    const proj = fold.projectAll(envelopes);
    expect(shiftRow(proj, "S-short").variance_paisa).toBe(-1000);
    expect(shiftRow(proj, "S-over").variance_paisa).toBe(1500);
    // Non-vacuity: a fold recomputing from the two other carried facts reads −4000 and −3500 —
    // the second of which calls an OVER shift short. Neither number may appear.
    expect(shiftRow(proj, "S-short").variance_paisa).not.toBe(96000 - 100000);
    expect(shiftRow(proj, "S-over").variance_paisa).not.toBe(96500 - 100000);
    expect(shiftRow(proj, "S-over").variance_paisa).toBeGreaterThan(0);
  });

  it("02-F23/01-F1: `closed` is monotone — a duplicate close and every later event leave the shift closed with its carried facts intact", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("c3");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 100000, { attempt: "sa-1", shift_id: "S1" }), 1000);
    emit(0, paidOut("S1", 1000), 1500); // out of the drawer BEFORE the count
    // A shift that reconciles exactly: Rs 990 counted against Rs 1000 expected less the Rs 10
    // paid out. A recompute reads −1000 and tells a clean cashier they are short.
    const close = shiftClosed("S1", {
      counted_cash_paisa: 99000,
      expected_paisa_by_method: { cash: 100000 },
      variance_paisa: 0,
    });
    emit(0, close, 2000);
    emit(1, close, 2001); // the same close redelivered from a second device
    emit(2, drawerOpened("S1"), 2500);
    emit(2, paidOut("S1", 1500), 2600);
    emit(2, shiftPayment("O9", 5000, { attempt: "sa-late", shift_id: "S1" }), 3000);
    const row = shiftRow(fold.projectAll(envelopes), "S1");
    expect(row.closed).toBe(1);
    expect(row.counted_cash_paisa).toBe(99000);
    expect(row.variance_paisa).toBe(0);
    expect(row.variance_paisa).not.toBe(99000 - 100000);
    expect(expectedAtCloseOf(row)).toEqual({
      cash: 100000,
      card: 0,
      raast: 0,
      khata_credit: 0,
      aggregator_receivable: 0,
    });
  });

  it("26 §7/01-F1 (ruling 3): the carried variance survives a recompute that CONTRADICTS it — the fold reads the signed fact, it does not re-derive one", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("c4");
    emit(0, shiftOpened("S1"), 0, { actor_user_id: CASHIER_A });
    emit(0, shiftPayment("O1", 100000, { attempt: "sa-1", shift_id: "S1" }), 1000);
    // Rs 125 of petty cash out (02-F26), so the drawer is legitimately Rs 125 lighter than the
    // Rs 1000 tendered. The cashier counts Rs 880 and the till is Rs 5 OVER.
    emit(0, paidOut("S1", 12500), 1500);
    emit(
      0,
      shiftClosed("S1", {
        counted_cash_paisa: 88000,
        expected_paisa_by_method: { cash: 100000 },
        variance_paisa: 500,
      }),
      2000,
    );
    const row = shiftRow(fold.projectAll(envelopes), "S1");

    // The fixture is non-vacuous BY CONSTRUCTION: carried and recomputed disagree, and they
    // disagree in sign. Without this the assertion below cannot distinguish "carried" from
    // "derived and coincidentally equal".
    const recompute = 88000 - 100000;
    expect(recompute).toBe(-12000);
    expect(recompute).not.toBe(500);

    expect(row.variance_paisa).toBe(500);
    expect(row.variance_paisa).not.toBe(recompute);
    // The two facts the recompute is built from are themselves carried and unchanged, so a red
    // above can only be the derivation and never a moved input.
    expect(row.counted_cash_paisa).toBe(88000);
    expect(expectedAtCloseOf(row)?.cash).toBe(100000);
    expect(row.paid_out_paisa).toBe(12500);

    // …and the same close delivered on its own, with no other event in the set, still carries.
    // A `carried ?? derived` fallback is only reachable when the field is ABSENT, and under
    // `registry.ts` (which makes `variance_paisa` required on `shift.closed`) it never is.
    const { emit: emit2, envelopes: alone } = branchEmitter("c5");
    emit2(0, shiftOpened("S1"), 0);
    emit2(
      0,
      shiftClosed("S1", {
        counted_cash_paisa: 0,
        expected_paisa_by_method: {},
        variance_paisa: -7500,
      }),
      100,
    );
    expect(shiftRow(fold.projectAll(alone), "S1").variance_paisa).toBe(-7500);
  });
});

// ===========================================================================
// §4 — 02-F37: SETTLING WITH NO SHIFT OPEN *SUCCEEDS*.
// "Never a modal, never a block." A test asserting this path throws or refuses asserts the
// exact opposite of the FR.
// ===========================================================================

describe("§4 02-F37 — a settlement with no shift open SUCCEEDS, carries a null shift reference, and raises `unbound_settlement`", () => {
  it("02-F37/01-F17: the settlement is recorded, is in no shift's expected cash, and surfaces under the name the FR gives it", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("u1");
    emit(0, shiftPayment("O1", 75000, { attempt: "sa-unbound", shift_id: null }), 1000);
    // "Never a modal, never a block": the projection is taken twice on purpose — once as the
    // no-throw assertion, once for its value — because the fold is pure.
    const project = () => fold.projectAll(envelopes);
    expect(project).not.toThrow();
    const projection = project();
    expect(projection.shifts).toEqual([]);
    expect(projection.unbound).toEqual([
      {
        settlement_attempt_id: "sa-unbound",
        order_id: "O1",
        method: "cash",
        amount_paisa: 75000,
        anomaly: "unbound_settlement",
      },
    ]);
  });

  it("02-F37/01-F1: opening a shift afterwards does NOT retro-bind the settlement — the money stays unbound and the new shift stays empty", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("u2");
    emit(0, shiftPayment("O1", 75000, { attempt: "sa-unbound", shift_id: null }), 1000);
    emit(1, shiftOpened("S9"), 2000); // opened later — a retro-bind would be a mutation
    emit(1, shiftPayment("O2", 20000, { attempt: "sa-bound", shift_id: "S9" }), 2100);
    const proj = fold.projectAll(envelopes);
    const row = shiftRow(proj, "S9");
    // Only the payment that CARRIES S9 is S9's. A retro-bind reads 95000 here.
    expect(expectedOf(row)).toEqual({ cash: 20000 });
    expect(proj.unbound.map((u) => u.settlement_attempt_id)).toEqual(["sa-unbound"]);
    expect(must(proj.unbound[0]).anomaly).toBe("unbound_settlement");
  });
});

// ===========================================================================
// §4b — A DISPUTED UNBOUND ATTEMPT KEY (01-F31 × 02-F37).
// The rendering rule is the one every other contested register in this fold obeys: money to
// ZERO, the carried scalars to null, the anomaly raised, all members retained, and a fold
// never picks a winner. Nothing in this suite produced the shape until August 2026, so the
// branch existed and was never pointed at an input that reached it.
// ===========================================================================

describe("§4b a DISPUTED attempt key with an unbound member (01-F31, 02-F37)", () => {
  it("01-F31: divergent unbound members render order_id/method NULL at ZERO money under `unbound_settlement_divergence` — neither member is picked", () => {
    const fold = shiftCash();
    const { envelopes } = divergentUnboundSet();
    const proj = fold.projectAll(envelopes);

    // Non-vacuity of the fixture: `du-a` really is two members of ONE key that disagree.
    const duA = envelopes.filter(
      (e) => (e.payload as { settlement_attempt_id?: string }).settlement_attempt_id === "du-a",
    );
    expect(duA).toHaveLength(2);
    expect(duA.map((e) => (e.payload as { amount_paisa: number }).amount_paisa)).toEqual([
      75000, 90000,
    ]);

    // Rendered EXACTLY, row by row, so a fold that pushed one row per member (banking the money
    // twice) or that named a "winning" order/method fails on the shape and not only on a total.
    //
    // ⚠ PIN #3 — THE CODE SPELLING. `02-F37` writes `unbound_settlement` and NO FR names a code
    // for the disputed case; this file's own policy (./shift-cash-builders.ts, "ANOMALY CODES")
    // makes /diverg/ a CLASS. `unbound_settlement_divergence` is the ORCHESTRATOR-PINNED
    // spelling and is asserted verbatim on instruction. A rename is a contract-clarification
    // event, not a test defect — the behaviour under test is the three values beside it.
    expect(proj.unbound).toEqual([
      {
        settlement_attempt_id: "du-a",
        order_id: null,
        method: null,
        amount_paisa: 0,
        anomaly: "unbound_settlement_divergence",
      },
      {
        settlement_attempt_id: "du-b",
        order_id: null,
        method: null,
        amount_paisa: 0,
        anomaly: "unbound_settlement_divergence",
      },
      {
        settlement_attempt_id: "du-unbound",
        order_id: "O4",
        method: "cash",
        amount_paisa: 25000,
        anomaly: "unbound_settlement",
      },
    ]);
    // THE MONEY CONTRIBUTION IS ZERO, stated as money and not only as a field: only the one
    // AGREED unbound settlement carries value. A fold picking the min-`payloadHash` member (or
    // the min envelope id) banks Rs 750 or Rs 900 that no two devices agree was ever tendered.
    expect(unboundRow(proj, "du-a").amount_paisa).toBe(0);
    expect(unboundRow(proj, "du-b").amount_paisa).toBe(0);
    expect(exactSum(proj.unbound.map((r) => r.amount_paisa)).toString()).toBe("25000");
  });

  it("01-F31/26 §7: a key whose members disagree about the CARRIED SHIFT is ONE disputed key, not two agreed ones — the shift banks zero and is flagged", () => {
    const fold = shiftCash();
    const { envelopes } = divergentUnboundSet();
    const proj = fold.projectAll(envelopes);
    const row = shiftRow(proj, "S1");

    // Non-vacuity: `du-b`'s two members carry the SAME amount and DIFFERENT shift references —
    // the only field they disagree on is where the money belongs.
    const duB = envelopes
      .filter(
        (e) => (e.payload as { settlement_attempt_id?: string }).settlement_attempt_id === "du-b",
      )
      .map((e) => e.payload as { amount_paisa: number; shift_id: string | null });
    expect(duB.map((p) => p.amount_paisa)).toEqual([60000, 60000]);
    expect(duB.map((p) => p.shift_id)).toEqual([null, "S1"]);

    // An attempt map nested inside a shift bucket sees two AGREED keys in two different maps
    // and banks Rs 600 twice — once unbound, once in S1. Org-globally (01-F31's ratified
    // uniqueness scope) it is one disputed key that contributes zero to both.
    expect(expectedOf(row)).toEqual({ cash: 5000 });
    expect(expectedOf(row).cash).not.toBe(65000);
    expect(hasCode(row, /diverg/)).toBe(true);
    // The agreed traffic around it is untouched — a fold that flagged the whole projection on
    // one divergence is as wrong as one that flagged nothing.
    expect(unboundRow(proj, "du-unbound").anomaly).toBe("unbound_settlement");
  });

  it("01-F34/26 §8: the disputed-unbound rendering is invariant under an ORDER-REVERSING id bijection and under a reversed delivery", () => {
    const fold = shiftCash();
    const { envelopes } = divergentUnboundSet();
    const baseline = fold.projectAll(envelopes);
    const relabelled = reversedIds(envelopes);
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    // A min-id tiebreak over the disputed members reads the Rs 750 member off the raw set and
    // the Rs 900 one off the relabelled set — convergent on every device, and wrong.
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(projectionBytes(baseline));
    expect(projectionBytes(fold.projectAll([...envelopes].reverse()))).toBe(
      projectionBytes(baseline),
    );
  });
});

// ===========================================================================
// §5 — UNIQUE-KEYED SUMS INSIDE THE SHIFT BUCKET (01-F31).
// ===========================================================================

describe("§5 attempt keys inside a shift (01-F31: a fold never picks a winner)", () => {
  it("01-F31: a double-tap — one intent under two envelope ids — is counted ONCE in the shift's expected cash", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("a1");
    emit(0, shiftOpened("S1"), 0);
    const tap = shiftPayment("O1", 60000, { attempt: "sa-1", shift_id: "S1" });
    emit(0, tap, 1000);
    emit(1, tap, 1050); // the retry: same key, identical intent, a NEW envelope id
    const row = shiftRow(fold.projectAll(envelopes), "S1");
    expect(expectedOf(row).cash).toBe(60000);
    expect(hasCode(row, /diverg/)).toBe(false);
  });

  it("01-F31: two divergent members of one attempt key contribute ZERO and raise the divergence anomaly — the agreed keys around them are untouched", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("a2");
    emit(0, shiftOpened("S1"), 0);
    emit(0, shiftPayment("O1", 60000, { attempt: "sa-d", shift_id: "S1" }), 1000);
    emit(2, shiftPayment("O1", 70000, { attempt: "sa-d", shift_id: "S1" }), 1010); // divergent
    emit(1, shiftPayment("O2", 5000, { attempt: "sa-ok", shift_id: "S1" }), 1100);
    const row = shiftRow(fold.projectAll(envelopes), "S1");
    // Neither member wins and neither is quietly summed: the disputed key contributes 0.
    expect(expectedOf(row)).toEqual({ cash: 5000 });
    expect(hasCode(row, /diverg/)).toBe(true);
  });
});

// ===========================================================================
// §6 — MONEY IS BIGINT IN THE FOLD (standing law 3; 01-F17).
// Float `+` is non-associative near 2^53, so a running double total lets DELIVERY ORDER
// decide a money outcome — a live 01-F34 break, not a range concern.
// ===========================================================================

describe("§6 BigInt accumulation and `money_overflow` (00 §6, 01-F17, 01-F34)", () => {
  it("00 §6: in-contract totals equal the independently computed BigInt exact, in both delivery orders", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("b1");
    const amounts = [123456789, 987654321, 1, 250099];
    emit(0, shiftOpened("S1"), 0);
    amounts.forEach((amount, i) => {
      emit(i % 3, shiftPayment(`O${i}`, amount, { attempt: `sa-${i}`, shift_id: "S1" }), 100 + i);
    });
    const forward = fold.projectAll(envelopes);
    const reversed = fold.projectAll([...envelopes].reverse());
    expect(String(expectedOf(shiftRow(forward, "S1")).cash)).toBe(exactSum(amounts).toString());
    expect(projectionBytes(reversed)).toBe(projectionBytes(forward));
  });

  it("01-F17/00 §6: an unrepresentable bucket contributes ZERO, raises the overflow anomaly, never throws, and leaves every other bucket alone — big-first and big-last are identical", () => {
    const fold = shiftCash();
    const build = (bigFirst: boolean) => {
      const { emit, envelopes } = branchEmitter(bigFirst ? "b2" : "b3");
      const cash = bigFirst ? [MAX_SAFE, 1, 1, 1] : [1, 1, 1, MAX_SAFE];
      emit(0, shiftOpened("S1"), 0);
      cash.forEach((amount, i) => {
        emit(
          i % 3,
          shiftPayment(`O${i}`, amount, { attempt: `sa-c${i}`, shift_id: "S1" }),
          100 + i,
        );
      });
      emit(
        0,
        shiftPayment("Ocard", 500, { attempt: "sa-card", shift_id: "S1", method: "card" }),
        900,
      );
      return envelopes;
    };
    // The exact total is 9007199254740994; a running double reads ...992 delivered big-FIRST
    // and ...994 delivered big-LAST, which is delivery order deciding a money outcome.
    expect(exactSum([MAX_SAFE, 1, 1, 1]).toString()).toBe("9007199254740994");

    // 01-F17: the ingest path never throws on a real, rung-up sale — so a `sumPaisa`-style
    // drop-in that THROWS past MAX_SAFE_INTEGER is not an acceptable implementation here.
    const projectBigFirst = () => fold.projectAll(build(true));
    expect(projectBigFirst).not.toThrow();
    const rowFirst = shiftRow(projectBigFirst(), "S1");
    expect(expectedOf(rowFirst).cash).toBe(0);
    expect(expectedOf(rowFirst).cash).not.toBe(9007199254740992);
    expect(hasCode(rowFirst, /overflow/)).toBe(true);
    // Only the offending bucket is refused — the rest of the shift still reconciles.
    expect(expectedOf(rowFirst).card).toBe(500);

    const rowLast = shiftRow(fold.projectAll(build(false)), "S1");
    expect(expectedOf(rowLast)).toEqual(expectedOf(rowFirst));
    expect(hasCode(rowLast, /overflow/)).toBe(true);
  });
});

// ===========================================================================
// §7 — DRAWER OPENS AND PAID-OUTS (02-F21, 02-F26).
// ===========================================================================

describe("§7 drawer opens and paid-outs bind to their carried shift (02-F21, 02-F26, 02-F22)", () => {
  it("02-F21: no-sale drawer opens are COUNTED — three distinct events with identical payloads count three, and re-folding one counts none extra", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("d1");
    emit(0, shiftOpened("S1"), 0);
    emit(0, drawerOpened("S1"), 1000);
    emit(1, drawerOpened("S1"), 1100);
    emit(2, drawerOpened("S1"), 1200);
    // Three separate no-sale opens, indistinguishable by payload: a fold keyed on payload
    // value collapses a classic theft vector to a single event.
    const once = fold.projectAll(envelopes);
    expect(shiftRow(once, "S1").no_sale_count).toBe(3);
    // Idempotent per envelope (FOLDS.md line 7): the same delivery twice adds nothing.
    const twice = fold.projectAll([...envelopes, ...envelopes]);
    expect(projectionBytes(twice)).toBe(projectionBytes(once));
  });

  it("02-F21: `reason` is the discriminator — a drawer open for any OTHER reason is not a no-sale and is not counted", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("d3");
    emit(0, shiftOpened("S1"), 0);
    emit(0, drawerOpened("S1"), 1000);
    // Two opens on the same drawer, same shift, differing ONLY in `reason`. A fold counting
    // every `cash.drawer_opened` reads 3 and reports a theft signal on a shift that rang up
    // two ordinary cash sales; 02-F21 counts `reason=no_sale` and nothing else.
    emit(1, drawerOpened("S1", NOT_NO_SALE_REASON), 1100);
    emit(2, drawerOpened("S1", NOT_NO_SALE_REASON), 1200);
    // Non-vacuous: the fixture really does carry a reason that is not the counted one.
    expect(NOT_NO_SALE_REASON).not.toBe("no_sale");
    const row = shiftRow(fold.projectAll(envelopes), "S1");
    expect(row.no_sale_count).toBe(1);
  });

  it("02-F26/02-F22: paid-outs total exactly against the shift whose key they carry, never against the other one", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("d2");
    const s1 = [2500, 7500, 33];
    emit(0, shiftOpened("S1"), 0);
    emit(1, shiftOpened("S2"), 10);
    s1.forEach((amount, i) => {
      emit(i % 3, paidOut("S1", amount), 1000 + i);
    });
    emit(2, paidOut("S2", 1000), 2000);
    const proj = fold.projectAll(envelopes);
    expect(String(shiftRow(proj, "S1").paid_out_paisa)).toBe(exactSum(s1).toString());
    expect(shiftRow(proj, "S2").paid_out_paisa).toBe(1000);
    expect(shiftRow(proj, "S2").no_sale_count).toBe(0);
  });
});

// ===========================================================================
// §7b — 02-F43: DRAWER EVENTS WITH NO SHIFT OPEN ARE COUNTED (August 2026).
// The FR does not say "accepted" and stop there. 02-F21 requires a no-sale open to be "logged
// AND COUNTED", so an implementation that stores the event and drops it from every total
// satisfies the word *logged* while defeating the theft detection the FR exists for — the
// silent path 02-F43 names and forbids. Every assertion here is therefore on the COUNT and
// the TOTAL, never on the row merely existing.
// ===========================================================================

describe("§7b 02-F43 — an unbound drawer open / paid-out is accepted, COUNTED, and flagged", () => {
  it("02-F43/02-F21: the unbound bucket carries the no-sale COUNT and the paid-out TOTAL, and raises the two codes the FR names", () => {
    const fold = shiftCash();
    const { envelopes } = unboundDrawerSet();
    const project = () => fold.projectAll(envelopes);
    // "Never a modal, never a block" (02-F43, via 01-F17).
    expect(project).not.toThrow();
    const proj = project();

    // Non-vacuity of the fixture: three drawer opens and two paid-outs really do carry a NULL
    // shift reference, and two of the opens are byte-identical in their payloads.
    const unboundEvents = envelopes.filter(
      (e) => (e.payload as { shift_id?: unknown }).shift_id === null,
    );
    expect(unboundEvents.filter((e) => e.type === "cash.drawer_opened")).toHaveLength(3);
    expect(unboundEvents.filter((e) => e.type === "cash.paid_out")).toHaveLength(2);

    // THE COUNT — two no-sale opens, not one. They carry identical payloads, so a bucket keyed
    // by payload value reads 1 and the classic theft vector collapses to a single event.
    expect(proj.unbound_drawer.no_sale_count).toBe(2);
    // 02-F21's discriminator governs this path exactly as it does a shift row: the third open
    // is not a no-sale and must not be counted.
    expect(NOT_NO_SALE_REASON).not.toBe("no_sale");

    // THE TOTAL — the petty cash really left the drawer, so it is money accounted for HERE or
    // money accounted for nowhere.
    expect(String(proj.unbound_drawer.paid_out_paisa)).toBe(
      exactSum([...UNBOUND_PAID_OUT]).toString(),
    );
    expect(proj.unbound_drawer.paid_out_paisa).not.toBe(0);

    // 02-F43 writes both codes, so they are asserted by name and not merely as a class.
    expect(exceptionsOf(proj.unbound_drawer).sort()).toEqual([
      "unbound_drawer_open",
      "unbound_paid_out",
    ]);
  });

  it("02-F43/02-F22: the open shift beside them absorbs none of it — bound and unbound are different buckets, and the money is in exactly one", () => {
    const fold = shiftCash();
    const { envelopes } = unboundDrawerSet();
    const row = shiftRow(fold.projectAll(envelopes), "S1");
    // A fold that bucketed an unbound event into "whichever shift is open" reads 3 and 22500
    // here — which is the 26 §7 break (the reading device's state deciding the money) wearing
    // the costume of a helpful default.
    expect(row.no_sale_count).toBe(1);
    expect(row.paid_out_paisa).toBe(BOUND_PAID_OUT);
    expect(hasCode(row, /unbound/)).toBe(false);
  });

  it("02-F43/01-F1: opening a shift afterwards does NOT retro-bind the unbound drawer activity", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("ud2");
    emit(0, drawerOpened(null), 100);
    emit(1, paidOut(null, 4500), 200);
    const before = fold.projectAll(envelopes);
    emit(2, shiftOpened("S9"), 1000); // opened later — a retro-bind would be a mutation
    emit(2, drawerOpened("S9"), 1100);
    const after = fold.projectAll(envelopes);
    expect(after.unbound_drawer).toEqual(before.unbound_drawer);
    expect(after.unbound_drawer.no_sale_count).toBe(1);
    expect(after.unbound_drawer.paid_out_paisa).toBe(4500);
    expect(shiftRow(after, "S9").no_sale_count).toBe(1);
    expect(shiftRow(after, "S9").paid_out_paisa).toBe(0);
  });

  it("02-F43 (the negative case): a branch whose drawer activity is all bound has an EMPTY unbound bucket and raises neither code", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("ud3");
    emit(0, shiftOpened("S1"), 0);
    emit(0, drawerOpened("S1"), 100);
    emit(1, paidOut("S1", 2500), 200);
    const proj = fold.projectAll(envelopes);
    // Without this, "raise the anomaly unconditionally" passes every assertion above and every
    // ordinary evening in the branch is flagged for theft.
    expect(proj.unbound_drawer).toEqual({
      no_sale_count: 0,
      paid_out_paisa: 0,
      exceptions_json: "[]",
    });
  });

  it("02-F43/01-F34: the unbound bucket is idempotent per envelope and invariant under an ORDER-REVERSING id bijection", () => {
    const fold = shiftCash();
    const { envelopes } = unboundDrawerSet();
    const baseline = fold.projectAll(envelopes);
    // Two identical no-sale payloads count 2 only if the bucket is keyed by ENVELOPE — which
    // makes the same delivery twice the case that would double it if it were keyed by nothing.
    expect(projectionBytes(fold.projectAll([...envelopes, ...envelopes]))).toBe(
      projectionBytes(baseline),
    );
    const relabelled = reversedIds(envelopes);
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(projectionBytes(baseline));
  });

  it("00 §6/02-F43: drawer activity naming a shift whose open has NOT arrived is HELD, not unbound — it projects no row and surfaces with its money when the open lands", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("gh");
    emit(0, paidOut("S-ghost", 4200), 100);
    emit(1, drawerOpened("S-ghost"), 200);
    emit(2, depositRecorded("D-ghost", 1000), 300);
    const held = fold.projectAll(envelopes);
    // No row, and no projection HOLE either: a fold that emitted a row for a shift it has never
    // seen opened invents an entity, and one that dropped the events loses the money.
    expect(held.shifts).toEqual([]);
    expect(held.days).toEqual([]);
    // …and emphatically NOT 02-F43's bucket: these events carry a shift key, it merely resolves
    // to nothing yet. Conflating the two turns every out-of-order delivery into a theft alarm.
    expect(held.unbound_drawer).toEqual({
      no_sale_count: 0,
      paid_out_paisa: 0,
      exceptions_json: "[]",
    });

    emit(0, shiftOpened("S-ghost"), 50);
    emit(1, dayOpened("D-ghost", { opening_float_paisa: 500000 }), 60);
    const landed = fold.projectAll(envelopes);
    expect(shiftRow(landed, "S-ghost").paid_out_paisa).toBe(4200);
    expect(shiftRow(landed, "S-ghost").no_sale_count).toBe(1);
    expect(dayRow(landed, "D-ghost").deposit_paisa).toBe(1000);
  });
});

// ===========================================================================
// §8 — THE DAY LIFECYCLE AND THE BUSINESS-DAY BOUNDARY (02-F22, 02-F24, 01-F46).
// The boundary arithmetic is NOT reimplemented here: `businessDate` is asserted through.
// ===========================================================================

describe("§8 the day lifecycle and the 05:00 Asia/Karachi business day (02-F22, 02-F24, 01-F46)", () => {
  it("01-F46: a day opened at 01:30 Karachi belongs to the PREVIOUS business date, and one opened at 06:00 the same calendar date does not", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y1");
    // Karachi is UTC+5: 01:30 PKT on 2026-07-30 is 20:30Z the day before; 06:00 PKT is 01:00Z.
    const lateNight = Date.UTC(2026, 6, 29, 20, 30);
    const morning = Date.UTC(2026, 6, 30, 1, 0);
    // Precondition, not the assertion: the fixture is only meaningful if the two instants
    // genuinely straddle a cutover under the shipped helper.
    expect(businessDate(lateNight)).not.toBe(businessDate(morning));

    emit(0, dayOpened("D-night", { opening_float_paisa: 500000 }), lateNight - BRANCH_T0);
    emit(1, dayOpened("D-morning", { opening_float_paisa: 400000 }), morning - BRANCH_T0);
    const proj = fold.projectAll(envelopes);
    // A fold taking the calendar date rather than the business day banks the 01:30 float to
    // the wrong night, and every daily total inherits the error.
    expect(dayRow(proj, "D-night").business_date).toBe(businessDate(lateNight));
    expect(dayRow(proj, "D-morning").business_date).toBe(businessDate(morning));
  });

  it("02-F22/02-F24: the float is carried, deposits total exactly, and `closed` is monotone while the deposit ledger stays honest", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y2");
    emit(0, dayOpened("D1", { opening_float_paisa: 500000 }), 0);
    emit(0, depositRecorded("D1", 200000), 1000);
    emit(1, depositRecorded("D1", 300000), 1100);
    emit(0, dayClosed("D1", { counted_cash_paisa: 750000 }), 2000);
    const atClose = dayRow(fold.projectAll(envelopes), "D1");
    expect(atClose.opening_float_paisa).toBe(500000);
    expect(String(atClose.deposit_paisa)).toBe(exactSum([200000, 300000]).toString());
    expect(atClose.closed).toBe(1);
    expect(atClose.counted_cash_paisa).toBe(750000);

    emit(2, depositRecorded("D1", 50000), 3000); // a late deposit
    // A REDELIVERED open — the same intent under a second envelope id, so the payload is
    // IDENTICAL. (Two opens with DIFFERENT payloads are not a redelivery, they are concurrent
    // divergent heads; that case is the next test and it is a different merge rule.)
    emit(2, dayOpened("D1", { opening_float_paisa: 500000 }), 3100);
    const after = dayRow(fold.projectAll(envelopes), "D1");
    expect(after.closed).toBe(1);
    expect(after.counted_cash_paisa).toBe(750000);
    expect(String(after.deposit_paisa)).toBe(exactSum([200000, 300000, 50000]).toString());
    // Idempotent, not disputed: the agreed float survives and nothing is flagged.
    expect(after.opening_float_paisa).toBe(500000);
    expect(hasCode(after, /diverg/)).toBe(false);
  });

  it("26 §7/26 §8/01-F31: two `day.opened` for ONE day whose floats DISAGREE are concurrent heads — neither is picked, the float contributes zero and the divergence is flagged", () => {
    const fold = shiftCash();
    const { envelopes } = divergentDayOpenSet();
    const proj = fold.projectAll(envelopes);
    const row = dayRow(proj, "D1");

    // Non-vacuity of the fixture itself: two members, genuinely disagreeing, on a MONEY field.
    expect(DIVERGENT_FLOAT_A).not.toBe(DIVERGENT_FLOAT_B);
    expect(envelopes.filter((e) => e.type === "day.opened")).toHaveLength(2);

    // PINNED (see the ./shift-cash-builders.ts header for the derivation and the finding):
    // 01-F34's only merge rule that can hold two disagreeing scalars is the explicitly
    // rendered contested set, and 01-F31 gives that rule its shape — the disputed value
    // contributes ZERO, an anomaly is raised, and both members are retained. Picking either
    // number is a fold picking a winner over the branch's opening cash.
    expect(row.opening_float_paisa).not.toBe(DIVERGENT_FLOAT_A);
    expect(row.opening_float_paisa).not.toBe(DIVERGENT_FLOAT_B);
    expect(row.opening_float_paisa).toBe(0);
    expect(hasCode(row, /diverg/)).toBe(true);
    // Retained, not dropped: the rest of the day still reconciles around the disputed float.
    expect(row.deposit_paisa).toBe(200000);
    expect(expectedOf(shiftRow(proj, "S1")).cash).toBe(40000);
  });

  it("01-F34/26 §8: the divergent-float day is invariant under an ORDER-REVERSING id bijection — a min(envelope.id) tiebreak reaching the float cannot survive here", () => {
    const fold = shiftCash();
    const { envelopes } = divergentDayOpenSet();
    const baseline = fold.projectAll(envelopes);
    const relabelled = reversedIds(envelopes);
    // Guard the guard: an identity map would make every assertion below free, and a
    // non-injective one would change the SET rather than only its labels.
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    // 26 §8: `00 §6` pins ids to UUIDv7 whose leading 48 bits are the minting device's wall
    // clock, so min-id is min-wall-clock in a disguise. It converges — every device agrees —
    // and it is WRONG, and reversing the id order is the only thing that shows it: a min-id
    // fold reads DIVERGENT_FLOAT_A off the raw set and DIVERGENT_FLOAT_B off the relabelled one.
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(projectionBytes(baseline));
    // Delivery order is not the same adversary as id order, so both are pinned.
    expect(projectionBytes(fold.projectAll([...envelopes].reverse()))).toBe(
      projectionBytes(baseline),
    );
  });

  it("26 §7: two opens naming ONE predecessor keep BOTH rows with their carried links and flag the fork — a fold never picks a winner (01-F31)", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y3");
    emit(0, shiftOpened("S0"), 0);
    // Ordinary offline behaviour, not an edge case: two devices heal after a partition.
    emit(1, shiftOpened("S1a", { prev_shift_id: "S0" }), 1000);
    emit(2, shiftOpened("S1b", { prev_shift_id: "S0" }), 1000);
    emit(1, shiftPayment("O1", 40000, { attempt: "sa-a", shift_id: "S1a" }), 2000);
    // THE NEGATIVE CASE, and it has to have a non-null predecessor. With S0 (whose
    // `prev_shift_id` is null by construction) as the only fork-free row, the rule "raise
    // /fork/ iff prev_shift_id !== null" passes the whole suite while flagging every ordinary
    // handover in the branch. S2 is the ordinary handover: it names a predecessor, and it is
    // that predecessor's only successor.
    emit(0, shiftOpened("S2", { prev_shift_id: "S1a" }), 3000);
    const proj = fold.projectAll(envelopes);
    expect(proj.shifts.map((r) => r.shift_id)).toEqual(["S0", "S1a", "S1b", "S2"]);
    expect(shiftRow(proj, "S1a").prev_shift_id).toBe("S0");
    expect(shiftRow(proj, "S1b").prev_shift_id).toBe("S0");
    expect(hasCode(shiftRow(proj, "S1a"), /fork/)).toBe(true);
    expect(hasCode(shiftRow(proj, "S1b"), /fork/)).toBe(true);
    expect(hasCode(shiftRow(proj, "S0"), /fork/)).toBe(false);
    expect(shiftRow(proj, "S2").prev_shift_id).toBe("S1a");
    expect(hasCode(shiftRow(proj, "S2"), /fork/)).toBe(false);
    // The fork does not blur the money: the carried key still decides.
    expect(expectedOf(shiftRow(proj, "S1a"))).toEqual({ cash: 40000 });
    expect(expectedOf(shiftRow(proj, "S1b"))).toEqual({});
  });

  it("02-F45/02-F22: `cashier` is projected from the ENVELOPE's `actor_user_id` and keyed PER SHIFT — two cashiers on one evening keep their own rows, and an unattributed shift stays null", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y5");
    // 02-F45: the ENVELOPE is the only attribution surface, and these payloads carry no
    // `cashier` at all — `registry.ts` does not declare one and a duplicate would be a second
    // source for one fact.
    emit(0, shiftOpened("S1"), 0, { actor_user_id: CASHIER_A });
    emit(1, shiftOpened("S2", { prev_shift_id: "S1" }), 1000, { actor_user_id: CASHIER_B });
    // Nullable by construction: `01-F27` — a locked device attributes to nobody, so the fold
    // must tolerate an unattributed open rather than requiring a cashier.
    emit(2, shiftOpened("S3", { prev_shift_id: "S2" }), 2000);
    emit(0, shiftPayment("O1", 40000, { attempt: "sa-a", shift_id: "S1" }), 1500);
    emit(1, shiftPayment("O2", 60000, { attempt: "sa-b", shift_id: "S2" }), 2500);

    // Non-vacuity of the whole section: NO `shift.opened` in this fixture carries a payload
    // `cashier`. Without this, an implementation reading `payload.cashier` would fail these
    // assertions for the right reason today and pass them again the moment a fixture drifted
    // back into setting both — which is exactly how PIN #2 survived a whole round.
    for (const env of envelopes.filter((e) => e.type === "shift.opened")) {
      expect(Object.keys(env.payload as Record<string, unknown>).sort()).toEqual([
        "prev_shift_id",
        "shift_id",
      ]);
    }

    const forward = fold.projectAll(envelopes);
    // 02-F22: "a shift binds subsequent cash settlements ... to that cashier". A fold that
    // carried one cashier for the whole projection, or that took the last open it happened to
    // see, attributes CASHIER_B's shortfall to CASHIER_A — the staff-protection framing of
    // 02-F23 inverted.
    expect(shiftRow(forward, "S1").cashier).toBe(CASHIER_A);
    expect(shiftRow(forward, "S2").cashier).toBe(CASHIER_B);
    expect(shiftRow(forward, "S3").cashier).toBeNull();
    expect(expectedOf(shiftRow(forward, "S1")).cash).toBe(40000);
    expect(expectedOf(shiftRow(forward, "S2")).cash).toBe(60000);
    // …and the attribution is not an artefact of the delivery it arrived in.
    const reversed = fold.projectAll([...envelopes].reverse());
    expect(projectionBytes(reversed)).toBe(projectionBytes(forward));
  });

  // ⚠ THE REGRESSION THIS SECTION EXISTS TO PREVENT. Until August 2026 the fold projected
  // `cashier` from `payload.cashier`, the shipped renderer emitted no such payload, and every
  // live shift row therefore read `null` — so `02-F23`'s own-shifts scoping in `pos-electron`,
  // correctly built and mutation-proven, narrowed nothing. A privacy rule that filtered no rows.
  // The test below is the only thing in this suite that can tell the two sources apart.
  it("02-F45: a payload `cashier` DISAGREEING with the envelope's actor is NOT read — one fact, one source, and the ledger has no rule for which of two wins", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y5b");
    // `registry.ts` types `shift.opened` as a `z.looseObject`, so this envelope is schema-VALID
    // and a non-conforming writer can put it on the wire today. That is what makes "the fold
    // must not read it" a behaviour rather than a convention.
    emit(0, shiftOpenedWithPayloadCashier("S1", CASHIER_B), 0, { actor_user_id: CASHIER_A });
    // The mirror image, so neither "always prefer the envelope" nor "always prefer whichever is
    // non-null" can be told apart from the correct rule by one fixture: here the PAYLOAD names
    // somebody and the envelope names nobody. `01-F27`'s locked device attributes to NOBODY, and
    // a fold falling back to the payload copy would attribute this shift to CASHIER_A anyway.
    emit(1, shiftOpenedWithPayloadCashier("S2", CASHIER_A, { prev_shift_id: "S1" }), 1000, {
      actor_user_id: null,
    });

    // Non-vacuity: the fixture really does carry the second source, and it really does disagree.
    const opens = envelopes.filter((e) => e.type === "shift.opened");
    expect(opens.map((e) => (e.payload as { cashier: string | null }).cashier)).toEqual([
      CASHIER_B,
      CASHIER_A,
    ]);
    expect(opens.map((e) => e.actor_user_id)).toEqual([CASHIER_A, null]);

    const proj = fold.projectAll(envelopes);
    expect(shiftRow(proj, "S1").cashier).toBe(CASHIER_A);
    expect(shiftRow(proj, "S2").cashier).toBeNull();
    // A single open is a single member however it was written: the second source is ignored, not
    // treated as a competing head, so nothing is disputed and the carried link still stands.
    expect(hasCode(shiftRow(proj, "S1"), /diverg/)).toBe(false);
    expect(shiftRow(proj, "S2").prev_shift_id).toBe("S1");
  });

  it("02-F45/01-F31: ONE shift opened twice with identical payloads and DIFFERENT actors is two contested heads — nothing is picked, `cashier` renders null and the divergence is flagged", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y5c");
    // Two devices healing after a partition, both claiming S1 under a different PIN. This
    // disagreement is invisible in the payload — the two payloads are BYTE-IDENTICAL — so a fold
    // that resolved attribution outside the merge register cannot see it at all and silently
    // attributes a whole shift's drawer to whichever cashier it happened to fold last.
    emit(0, shiftOpened("S1"), 0, { actor_user_id: CASHIER_A });
    emit(2, shiftOpened("S1"), 0, { actor_user_id: CASHIER_B });
    emit(1, shiftPayment("O1", 40000, { attempt: "sa-c", shift_id: "S1" }), 1000);

    const opens = envelopes.filter((e) => e.type === "shift.opened");
    expect(new Set(opens.map((e) => canonicalJson(e.payload))).size).toBe(1);
    expect(opens.map((e) => e.actor_user_id)).toEqual([CASHIER_A, CASHIER_B]);

    const proj = fold.projectAll(envelopes);
    // 01-F31: a fold never picks a winner. Neither cashier is chosen, both members stay in the
    // lattice, and the anomaly is what the manager acts on.
    expect(shiftRow(proj, "S1").cashier).toBeNull();
    expect(hasCode(shiftRow(proj, "S1"), /diverg/)).toBe(true);
    // The money is NOT disputed by an attribution disagreement — the settlement carries its own
    // key and banks normally. A fold that zeroed the drawer here has over-applied 01-F31.
    expect(expectedOf(shiftRow(proj, "S1")).cash).toBe(40000);
    // …and the answer depends on neither delivery order nor envelope id (01-F34, 26 §8).
    const baseline = projectionBytes(proj);
    expect(projectionBytes(fold.projectAll([...envelopes].reverse()))).toBe(baseline);
    const relabelled = reversedIds(envelopes);
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(baseline);
  });

  it("01-F43/01-F45: `open_at` is the event's branch stamp — the device clock is years away and must not appear", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("y4");
    emit(0, shiftOpened("S1"), 4200);
    const env = must(envelopes[0]);
    const row = shiftRow(fold.projectAll(envelopes), "S1");
    expect(row.open_at).toBe(BRANCH_T0 + 4200);
    expect(row.open_at).toBe(env.branch_created_at);
    expect(row.open_at).not.toBe(env.device_created_at);
  });
});

// ===========================================================================
// §8b — THE DAY FORK (26 §7's carried causal link, on the day).
// 26 §7 lists "duplicate shift/day open" as ONE row of its matrix and `prev_day_id` exists for
// exactly that reason, so the day gets the SAME detector rather than a second, subtly different
// one. A fork detector covering only shifts leaves a duplicate DAY open — which is the whole
// branch's opening cash and its 01-F46 boundary — unflagged. No fixture in this suite carried a
// non-null `prev_day_id` until August 2026, so the day half was never exercised at all.
// ===========================================================================

describe("§8b two `day.opened` naming ONE predecessor is a fork (26 §7, 01-F31)", () => {
  it("26 §7: both day rows stand with their carried links and BOTH are flagged — a fold never picks a winner", () => {
    const fold = shiftCash();
    const { envelopes } = dayForkSet();
    const proj = fold.projectAll(envelopes);

    // Non-vacuity: the fixture really carries two DISTINCT day ids naming one predecessor.
    const links = envelopes
      .filter((e) => e.type === "day.opened")
      .map((e) => e.payload as { day_id: string; prev_day_id: string | null });
    expect(links.filter((p) => p.prev_day_id === "D0").map((p) => p.day_id)).toEqual([
      "D1a",
      "D1b",
    ]);

    expect(proj.days.map((r) => r.day_id)).toEqual(["D0", "D1a", "D1b", "D9"]);
    expect(dayRow(proj, "D1a").prev_day_id).toBe("D0");
    expect(dayRow(proj, "D1b").prev_day_id).toBe("D0");
    expect(hasCode(dayRow(proj, "D1a"), /fork/)).toBe(true);
    expect(hasCode(dayRow(proj, "D1b"), /fork/)).toBe(true);

    // A FORK is two distinct ids naming one predecessor; a DIVERGENCE is one id under two
    // payloads. Neither day here diverges, so a fold raising the divergence code has caught the
    // wrong thing with the right alarm.
    expect(hasCode(dayRow(proj, "D1a"), /diverg/)).toBe(false);
    // Both floats are retained in full — the fork flags the lineage, it does not dispute money.
    expect(dayRow(proj, "D1a").opening_float_paisa).toBe(600000);
    expect(dayRow(proj, "D1b").opening_float_paisa).toBe(700000);
    expect(dayRow(proj, "D1a").deposit_paisa).toBe(200000);
    expect(dayRow(proj, "D1b").deposit_paisa).toBe(0);
  });

  it("26 §7 (the negative case): a NON-NULL predecessor with a single successor is an ordinary rollover and is NOT flagged", () => {
    const fold = shiftCash();
    const { envelopes } = dayForkSet();
    const proj = fold.projectAll(envelopes);
    // D0's `prev_day_id` is null by construction, so on its own it cannot distinguish the
    // correct rule from "raise the fork iff prev_day_id !== null" — which passes while flagging
    // every day rollover the branch will ever do. D9 names D1a and is D1a's only successor.
    expect(dayRow(proj, "D9").prev_day_id).toBe("D1a");
    expect(hasCode(dayRow(proj, "D9"), /fork/)).toBe(false);
    expect(hasCode(dayRow(proj, "D0"), /fork/)).toBe(false);
  });

  it("01-F34: the day fork is invariant under an ORDER-REVERSING id bijection and a reversed delivery", () => {
    const fold = shiftCash();
    const { envelopes } = dayForkSet();
    const baseline = fold.projectAll(envelopes);
    const relabelled = reversedIds(envelopes);
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(projectionBytes(baseline));
    expect(projectionBytes(fold.projectAll([...envelopes].reverse()))).toBe(
      projectionBytes(baseline),
    );
  });

  // ⚠ PIN #4 — TWO DISTINCT FORK CODES. `26 §7` mandates the carried causal link and names no
  // code at all, so this file's policy makes /fork/ a CLASS and only RECOMMENDS
  // `shift_open_fork` / `day_open_fork`. This test pins that the two are DISTINCT (not their
  // spelling): an alarm that does not say whether the shift or the whole day forked is not
  // actionable, and the two have different remediations. An implementer who wants one generic
  // code should contest this as a contract clarification rather than treat it as a defect.
  it("26 §7: a day fork and a shift fork in ONE projection are told apart — a manager cannot act on an alarm that does not name what forked", () => {
    const fold = shiftCash();
    const { emit, envelopes } = branchEmitter("df2");
    emit(0, dayOpened("D0", { opening_float_paisa: 500000 }), 0);
    emit(1, dayOpened("D1a", { opening_float_paisa: 600000, prev_day_id: "D0" }), 100);
    emit(2, dayOpened("D1b", { opening_float_paisa: 700000, prev_day_id: "D0" }), 100);
    emit(0, shiftOpened("S0"), 200);
    emit(1, shiftOpened("S1a", { prev_shift_id: "S0" }), 300);
    emit(2, shiftOpened("S1b", { prev_shift_id: "S0" }), 300);
    const proj = fold.projectAll(envelopes);
    const dayCodes = exceptionsOf(dayRow(proj, "D1a")).filter((c) => /fork/.test(c));
    const shiftCodes = exceptionsOf(shiftRow(proj, "S1a")).filter((c) => /fork/.test(c));
    expect(dayCodes).toHaveLength(1);
    expect(shiftCodes).toHaveLength(1);
    expect(dayCodes).not.toEqual(shiftCodes);
  });
});

// ===========================================================================
// §9 — 01-F45 BASIS PRECEDENCE (amended July 2026, adversarial review H2).
// `shiftEnvelope` has accepted `basis: "branch_provisional"` since the suite was written and
// NO fixture ever passed it, so every envelope in every set was `branch` and the precedence
// rule was a dead knob: the fold would project identically with the tier logic deleted. The
// discriminating case is a PROVISIONAL stamp that is EARLIER than a branch one.
// ===========================================================================

describe("§9 `open_at` / `business_date` take the strongest delivered BASIS TIER (01-F45, 01-F43, 01-F46)", () => {
  it("01-F45: a `branch` open BEATS an earlier `branch_provisional` one — the branch tier wins DESPITE being later", () => {
    const fold = shiftCash();
    const { envelopes } = basisPrecedenceSet();

    // Non-vacuity of the fixture, and of the knob itself: the set really does mix both bases,
    // and the provisional member really is the earlier one. Without this the whole section is
    // a test of the default.
    const bases = envelopes.map((e) => e.time_basis);
    expect(bases).toContain("branch");
    expect(bases).toContain("branch_provisional");
    const mixed = envelopes.filter(
      (e) => (e.payload as { shift_id?: string }).shift_id === "S-mixed",
    );
    expect(mixed).toHaveLength(2);
    expect(mixed.map((e) => e.time_basis)).toEqual(["branch", "branch_provisional"]);
    expect(Number(must(mixed[1]).branch_created_at)).toBeLessThan(
      Number(must(mixed[0]).branch_created_at),
    );

    const proj = fold.projectAll(envelopes);
    // A plain earliest-wins min over every delivered open hands `open_at` to whichever device's
    // clock is furthest BEHIND — a `branch_provisional` stamp IS the raw device clock at offset
    // 0 (01-F44), which is the same class of break as reading `device_created_at` outright.
    expect(shiftRow(proj, "S-mixed").open_at).toBe(BRANCH_T0 + 1000);
    expect(shiftRow(proj, "S-mixed").open_at).not.toBe(BRANCH_T0 - PROVISIONAL_BACKDATE_MS);
    // Identical payloads, so this is a redelivery and not two contested heads: nothing here may
    // be flagged, and the tier rule is what is under test rather than 01-F31's.
    expect(hasCode(shiftRow(proj, "S-mixed"), /diverg/)).toBe(false);
    expect(shiftRow(proj, "S-mixed").cashier).toBe(CASHIER_A);
  });

  it("01-F46/01-F45: the business day inherits the tier — a backdated provisional open must not bank a whole evening to the wrong date", () => {
    const fold = shiftCash();
    const { envelopes } = basisPrecedenceSet();
    const proj = fold.projectAll(envelopes);
    // The two candidate stamps are three days apart, so the precondition of this test is that
    // they genuinely fall on different business dates under the shipped helper.
    expect(businessDate(BRANCH_T0 + 1000)).not.toBe(
      businessDate(BRANCH_T0 - PROVISIONAL_BACKDATE_MS),
    );
    expect(dayRow(proj, "D-mixed").business_date).toBe(businessDate(BRANCH_T0 + 1000));
    expect(dayRow(proj, "D-mixed").business_date).not.toBe(
      businessDate(BRANCH_T0 - PROVISIONAL_BACKDATE_MS),
    );
  });

  it("01-F45: a provisional stamp IS used when no `branch` member exists — the fallback tier, which is the only case the FR allows it in", () => {
    const fold = shiftCash();
    const { envelopes } = basisPrecedenceSet();
    const proj = fold.projectAll(envelopes);
    // A fold that discarded provisional members outright has no stamp to project here at all,
    // and a fold that projected 0 (or the reading device's clock) is reading no time.
    expect(shiftRow(proj, "S-prov-only").open_at).toBe(BRANCH_T0 + 7000);
    expect(dayRow(proj, "D-prov-only").business_date).toBe(businessDate(BRANCH_T0 + 8000));
  });

  it("01-F45 (the CONTROL): when the provisional stamp is LATER, precedence and a plain min agree — this case alone proves nothing, and it catches the opposite mutation", () => {
    const fold = shiftCash();
    const { envelopes } = basisPrecedenceSet();
    const proj = fold.projectAll(envelopes);
    // Earliest-wins is still earliest-wins INSIDE the chosen tier: a fold that "preferred
    // branch" by taking the branch member's stamp only when it is later, or that inverted the
    // precedence to prefer provisional, reads BRANCH_T0 + 2000 + the backdate here.
    expect(shiftRow(proj, "S-late-prov").open_at).toBe(BRANCH_T0 + 2000);
  });

  it("01-F34: tier selection is a PARTITION of the delivered set — reversed delivery and an order-reversing id bijection project byte-identically", () => {
    const fold = shiftCash();
    const { envelopes } = basisPrecedenceSet();
    const baseline = fold.projectAll(envelopes);
    // The rule must be set-determined, not "whichever basis the fold saw first wins".
    expect(projectionBytes(fold.projectAll([...envelopes].reverse()))).toBe(
      projectionBytes(baseline),
    );
    const relabelled = reversedIds(envelopes);
    expect(relabelled.reversing).toBe(true);
    expect(relabelled.bijective).toBe(true);
    expect(projectionBytes(fold.projectAll(relabelled.envelopes))).toBe(projectionBytes(baseline));
  });
});

/** noUncheckedIndexedAccess-safe unwrap — a missing value is a loud test failure. */
function must<T>(value: T | undefined | null, what = "value"): T {
  if (value === undefined || value === null) throw new Error(`expected ${what} to be defined`);
  return value;
}
