// Acceptance tests — T-01-22 fold-brand migration, FOLD half (DEC-MONEY-005 fold clause).
// Authored from spec text + the task plan only (24 §3 step 2; read-only to the implementing
// session):
//   00 §6    — money = integer paisas. A double past 2^53 is not an integer, so the claim has
//              to be kept by the arithmetic, not just by the type name.
//   DEC-MONEY-005 — the fold engine deliberately uses PLAIN numbers; migrating it to the
//              `domain` helpers is the DEFERRED fold clause. `sumPaisa` accumulates in BigInt
//              and THROWS past Number.MAX_SAFE_INTEGER rather than drift.
//   01-F31   — unique-keyed sums: a key the fold cannot resolve contributes ZERO, raises an
//              anomaly, and retains every member. A fold never picks a winner. This is the
//              existing precedent for "cannot be represented ⇒ surface it, contribute nothing".
//   01-F17   — a sale is never blocked. The fold runs INSIDE the ingest path
//              (device-store.ts applyFold → engine.projectOrder), with no try/catch between:
//              an uncaught throw there wedges ingestion of a real, rung-up sale.
//   01-F34   — the engine is a pure function of the DELIVERED SET: equal set ⇒ byte-equal
//              projection, no ordering metadata read.
//   plans/wave-0/t-01-22-fold-brand.md — the honest framing.
//
// WHAT IS AND IS NOT BROKEN TODAY (verified, not remembered):
//   For non-negative integer terms whose EXACT total is ≤ Number.MAX_SAFE_INTEGER, every partial
//   sum is ≤ the total and therefore exactly representable — so the shipped fold's `+` is exact
//   and order-independent. There is NO live precision defect inside contract. Tests claiming the
//   shipped fold miscounts ordinary money would be false, and this file does not make any.
//
//   The defect is reachable only in the OVERFLOW regime — exactly the regime `sumPaisa` was
//   built to refuse. There it is not a rounding nicety:
//     Σ [MAX_SAFE_INTEGER, 1, 1, 1] = 9007199254740992 delivered big-FIRST
//                                   = 9007199254740994 delivered big-LAST   (exact: ...994)
//   i.e. DELIVERY ORDER DECIDES A MONEY OUTCOME — the precise failure 01-F34 and 26 §2 exist to
//   remove — and the wrong number is rendered silently. Each individual amount is schema-valid
//   (`amount_paisa: z.number().int().nonnegative()`, capped by zod at MAX_SAFE_INTEGER), so the
//   set is reachable through the ordinary ingest path.
//
// RED/GREEN at authoring time:
//   RED   — every "overflow regime" pin (§2, §4): no anomaly is raised, the total is a silently
//           wrong unsafe double, and it is delivery-order dependent.
//   GREEN REGRESSION GUARD — §1 (arithmetic identity: same projections, same totals, before and
//           after the migration — a migration that changes a single in-contract total is a bug,
//           not a migration), §3 (keys stay strings, values stay plain numbers), §5 (01-F34
//           invariance), and the 01-F17 no-throw pin, which specifically guards against a naive
//           `sumPaisa` drop-in: `sumPaisa` THROWS on overflow and the ingest path has no catch.
//
// Oracle-pinned where the contract left the choice open (FLAGGED in the report, not silently
// resolved):
//   * ANOMALY NAME: pinned as a CLASS (`/overflow/` in the exceptions vector), not a spelling —
//     exception names are engine-internal and no spec enumerates them. `money_overflow` is the
//     recommended name. Pinning the class, not the string, is deliberate.
//   * CONTRIBUTION: an unrepresentable total contributes ZERO, by the 01-F31 disputed-key
//     precedent — the only ORDER-FREE choice (any "sum of the representable prefix" is a
//     delivery-order artifact, and clamping to MAX_SAFE_INTEGER is the silent truncation the
//     ban exists to prevent). Members are all retained in *_attempts_json, unpicked.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { billedEffectiveFromJsonLines } from "../fold-engine.js";
import { canonicalJson, identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  created,
  ingestAll,
  invariantBytes,
  invariantProjection,
  lineAdded,
  type MergeOpenOrderRow,
  type MergeStore,
  mapProjectionIds,
  mergeStore,
  payment,
  projectionBytes,
  refund,
  relabelEnvelope,
  reversingIdMap,
  shuffled,
} from "./merge-builders.js";

const T0 = 1752800000000;
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

const onlyOrder = (store: MergeStore): MergeOpenOrderRow => {
  const rows = store.openOrders();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("expected exactly one open_orders row");
  return row;
};

const exceptions = (row: MergeOpenOrderRow): string[] =>
  JSON.parse(row.exceptions_json) as string[];

const hasOverflowAnomaly = (row: MergeOpenOrderRow): boolean =>
  exceptions(row).some((code) => /overflow/.test(code));

/** The EXACT total, computed outside the engine in BigInt — the independent oracle for
 * every money assertion here. Never `reduce((a, b) => a + b)`: that is the very double
 * arithmetic under test. */
const exact = (values: readonly number[]): bigint =>
  values.reduce<bigint>((acc, v) => acc + BigInt(v), 0n);

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// ===========================================================================
// §1 — ARITHMETIC IDENTITY (GREEN REGRESSION GUARDS).
// The migration substitutes helpers for operators. Inside contract that is
// arithmetically identical BY CONSTRUCTION — these pins are what proves it
// stayed that way. A migration that moves a single in-contract total is a bug.
// ===========================================================================

describe("§1 arithmetic identity — GREEN REGRESSION GUARD (00 §6 / DEC-MONEY-005)", () => {
  it("01-F31/01-F32 (GREEN): a mixed money scenario projects the EXACT independently-computed totals — helper substitution must not move a single paisa", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const settles = [125000, 4999, 1];
    const repays = [185000, 15];
    const refunds = [30000, 7];
    const envelopes: unknown[] = [peerEnvelope(peer, 0, { ...created("O1"), ...at(0) })];
    let seq = 1;
    settles.forEach((amount, i) => {
      envelopes.push(
        peerEnvelope(peer, seq++, {
          ...payment("O1", amount, { attempt: `sa-S${i}` }),
          ...at(seq),
        }),
      );
    });
    repays.forEach((amount, i) => {
      envelopes.push(
        peerEnvelope(peer, seq++, {
          ...payment("O1", amount, { attempt: `sa-R${i}`, purpose: "repays_receivable" }),
          ...at(seq),
        }),
      );
    });
    refunds.forEach((amount, i) => {
      envelopes.push(
        peerEnvelope(peer, seq++, {
          ...refund("O1", amount, { attempt: `sa-X${i}`, parent: "sa-S0" }),
          ...at(seq),
        }),
      );
    });
    ingestAll(store, envelopes);
    const row = onlyOrder(store);
    expect(BigInt(row.pay_total)).toBe(exact(settles));
    expect(BigInt(row.repaid_total)).toBe(exact(repays));
    expect(BigInt(row.refund_total)).toBe(exact(refunds));
    // Every projected total is a real integer paisa value (00 §6), not a drifted double.
    expect(Number.isSafeInteger(row.pay_total)).toBe(true);
    expect(Number.isSafeInteger(row.repaid_total)).toBe(true);
    expect(Number.isSafeInteger(row.refund_total)).toBe(true);
    // Nothing here is anomalous: the guard must not fire on ordinary money.
    expect(exceptions(row)).toEqual([]);
    store.close();
  });

  it("01-F31 (GREEN, property): for any in-contract set of agreed attempt keys, pay_total is the EXACT sum in EVERY delivery order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000_000_000 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (amounts, seed) => {
          const id = identity();
          const peer = peerIdentity(id);
          const store = mergeStore(id);
          const create = peerEnvelope(peer, 0, { ...created("O1"), ...at(0) });
          const pays = amounts.map((amount, i) =>
            peerEnvelope(peer, i + 1, {
              ...payment("O1", amount, { attempt: `sa-${i}` }),
              ...at(i + 1),
            }),
          );
          ingestAll(store, [create, ...shuffled(pays, seed)]);
          const row = onlyOrder(store);
          const ok =
            BigInt(row.pay_total) === exact(amounts) && Number.isSafeInteger(row.pay_total);
          store.close();
          return ok;
        },
      ),
      { numRuns: 40 },
    );
  });

  it("01-F30 (GREEN): billed_effective over line values is the EXACT qty × unit_price sum, and the engine's own exported derivation agrees with it", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const lines: Array<{ qty: number; price: number }> = [
      { qty: 2, price: 45000 },
      { qty: 1, price: 12550 },
      { qty: 7, price: 999 },
    ];
    const envelopes: unknown[] = [peerEnvelope(peer, 0, { ...created("O1"), ...at(0) })];
    lines.forEach((line, i) => {
      envelopes.push(
        peerEnvelope(peer, i + 1, {
          ...lineAdded("O1", `L${i}`, { qty: line.qty, unit_price_paisa: line.price }),
          ...at(i + 1),
        }),
      );
    });
    ingestAll(store, envelopes);
    const row = onlyOrder(store);
    const expected = lines.reduce<bigint>((acc, l) => acc + BigInt(l.qty) * BigInt(l.price), 0n);
    const billed = billedEffectiveFromJsonLines(row.json_lines);
    expect(BigInt(billed)).toBe(expected);
    expect(Number.isSafeInteger(billed)).toBe(true);
    store.close();
  });
});

// ===========================================================================
// §2 — THE OVERFLOW REGIME (RED). `sumPaisa` refuses to represent these totals;
// the shipped fold renders them anyway, silently and order-dependently.
// ===========================================================================

/** Four schema-valid payments under four distinct attempt keys whose EXACT total
 * (9007199254740994) exceeds Number.MAX_SAFE_INTEGER. The accumulation order is the
 * `e.pay` Map insertion order = delivery order, so this set is the non-associativity
 * witness as well as the overflow witness. */
const OVERFLOW_AMOUNTS = [MAX_SAFE, 1, 1, 1] as const;

const overflowEnvelopes = (peer: ReturnType<typeof peerIdentity>): unknown[] => [
  peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
  ...OVERFLOW_AMOUNTS.map((amount, i) =>
    peerEnvelope(peer, i + 1, {
      ...payment("O1", amount, { attempt: `sa-${i}` }),
      ...at(i + 1),
    }),
  ),
];

describe("§2 overflow regime — a total that cannot be represented (00 §6 / DEC-MONEY-005 / 01-F31)", () => {
  it("01-F17 (GREEN REGRESSION GUARD): ingesting an overflowing money set never throws and never loses an event — the fold runs INSIDE the ingest path", () => {
    // sumPaisa throws past MAX_SAFE_INTEGER and device-store.ts applyFold has no catch:
    // a naive drop-in wedges ingestion of real, rung-up sales. 01-F17 forbids that
    // categorically — the sale is never blocked, the anomaly is surfaced instead.
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const envelopes = overflowEnvelopes(peer);
    expect(() => ingestAll(store, envelopes)).not.toThrow();
    expect(store.readAllEvents()).toHaveLength(envelopes.length);
    // The store stays usable afterwards: a later ordinary sale still ingests and folds.
    expect(() =>
      ingestAll(store, [
        peerEnvelope(peer, 98, { ...created("O2"), ...at(98) }),
        peerEnvelope(peer, 99, { ...payment("O2", 5000, { attempt: "sa-late" }), ...at(99) }),
      ]),
    ).not.toThrow();
    const later = store.openOrders().find((r) => r.order_id === "O2");
    expect(later?.pay_total, "a later sale must fold normally — ingestion never wedges").toBe(5000);
    store.close();
  });

  it("00 §6 / DEC-MONEY-005: an unrepresentable pay_total is SURFACED as an anomaly and contributes ZERO — never a silently truncated number (01-F31 precedent)", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, overflowEnvelopes(peer));
    const row = onlyOrder(store);
    expect(
      hasOverflowAnomaly(row),
      `a money total past MAX_SAFE_INTEGER is an anomaly to surface, not a number to print; got ${row.exceptions_json}`,
    ).toBe(true);
    expect(
      row.pay_total,
      "01-F31 precedent: a total the fold cannot represent contributes zero — the only order-free choice",
    ).toBe(0);
    expect(Number.isSafeInteger(row.pay_total)).toBe(true);
    // Members are RETAINED and rendered, never picked or dropped (01-F1 / 01-F31).
    const attempts = JSON.parse(row.pay_attempts_json) as Record<string, unknown[]>;
    expect(Object.keys(attempts)).toHaveLength(OVERFLOW_AMOUNTS.length);
    for (const members of Object.values(attempts)) expect(members).toHaveLength(1);
    store.close();
  });

  it("00 §6 / DEC-MONEY-005: NO SILENT WRONG NUMBER — pay_total either equals the exact sum or carries the overflow anomaly, always a safe integer", () => {
    // The weakest formulation of the whole finding, and the one no reasonable
    // implementation may fail: the projection must never render a money total that
    // silently differs from the arithmetic truth.
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, overflowEnvelopes(peer));
    const row = onlyOrder(store);
    const truth = exact([...OVERFLOW_AMOUNTS]);
    expect(
      Number.isSafeInteger(row.pay_total),
      "a rendered money total is an integer (00 §6)",
    ).toBe(true);
    expect(
      BigInt(row.pay_total) === truth || hasOverflowAnomaly(row),
      `pay_total=${row.pay_total} differs from the exact total ${truth} with no anomaly raised`,
    ).toBe(true);
    store.close();
  });

  it("01-F34: DELIVERY ORDER MUST NOT DECIDE A MONEY OUTCOME — the overflowing set projects byte-identically big-first and big-last", () => {
    // Live non-associativity witness: Σ[MAX,1,1,1] = ...992 big-first, ...994 big-last.
    // This is the exact failure 26 §2 exists to remove, reachable through schema-valid
    // payloads. Convergence here is not a nicety — two terminals show different money.
    const id = identity();
    const peer = peerIdentity(id);
    const [create, ...pays] = overflowEnvelopes(peer);
    const bigFirst = mergeStore(id);
    ingestAll(bigFirst, [create, ...pays]);
    const bigLast = mergeStore(id);
    ingestAll(bigLast, [create, ...[...pays].reverse()]);
    expect(projectionBytes(bigLast)).toBe(projectionBytes(bigFirst));
    expect(hasOverflowAnomaly(onlyOrder(bigFirst))).toBe(true);
    bigFirst.close();
    bigLast.close();
  });

  it("01-F29/01-F31: an unrepresentable refund_total is surfaced and contributes ZERO on the refund plane too", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const envelopes: unknown[] = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...payment("O1", MAX_SAFE, { attempt: "sa-P" }), ...at(1) }),
      ...OVERFLOW_AMOUNTS.map((amount, i) =>
        peerEnvelope(peer, i + 2, {
          ...refund("O1", amount, { attempt: `sa-X${i}`, parent: "sa-P" }),
          ...at(i + 2),
        }),
      ),
    ];
    expect(() => ingestAll(store, envelopes)).not.toThrow();
    const row = onlyOrder(store);
    expect(hasOverflowAnomaly(row), `got ${row.exceptions_json}`).toBe(true);
    expect(row.refund_total).toBe(0);
    expect(Number.isSafeInteger(row.refund_total)).toBe(true);
    store.close();
  });

  it("01-F32/DEC-MONEY-007: an unrepresentable repaid_total is surfaced and contributes ZERO — the khata repayment accumulator is not exempt", () => {
    // The fourth named accumulator. repaid_total is the discriminated `repays_receivable`
    // sum (01-F32); it needs the same guard as pay_total, and pay_total must be untouched
    // by the repayment plane's anomaly.
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    const envelopes: unknown[] = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...payment("O1", 50000, { attempt: "sa-P" }), ...at(1) }),
      ...OVERFLOW_AMOUNTS.map((amount, i) =>
        peerEnvelope(peer, i + 2, {
          ...payment("O1", amount, { attempt: `sa-K${i}`, purpose: "repays_receivable" }),
          ...at(i + 2),
        }),
      ),
    ];
    expect(() => ingestAll(store, envelopes)).not.toThrow();
    const row = onlyOrder(store);
    expect(hasOverflowAnomaly(row), `got ${row.exceptions_json}`).toBe(true);
    expect(row.repaid_total).toBe(0);
    expect(row.pay_total, "the settling plane is representable and unaffected").toBe(50000);
    store.close();
  });

  it("01-F30 / 00 §6: an unrepresentable billed_effective (qty × unit_price) is surfaced — the engine's declared-once derivation never returns an unsafe double", () => {
    // 3 × 3002399751580331 = 9007199254740993 exactly; the double rounds it to
    // ...992. billedEffectiveFromJsonLines is the ENGINE's own export, read by the
    // cloud Auditor (services/sync-gateway/src/auditor.ts) — a drifted value there
    // becomes a false conservation finding, so the derivation must never return one.
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    expect(() =>
      ingestAll(store, [
        peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
        peerEnvelope(peer, 1, {
          ...lineAdded("O1", "L1", { qty: 3, unit_price_paisa: 3002399751580331 }),
          ...at(1),
        }),
      ]),
    ).not.toThrow();
    const row = onlyOrder(store);
    const billed = billedEffectiveFromJsonLines(row.json_lines);
    expect(
      Number.isSafeInteger(billed),
      `billed_effective=${billed} is not an integer paisa value (00 §6)`,
    ).toBe(true);
    expect(hasOverflowAnomaly(row), `got ${row.exceptions_json}`).toBe(true);
    store.close();
  });
});

// ===========================================================================
// §3 — KEYS ARE NOT MONEY (GREEN REGRESSION GUARD).
// t-01-22 trap: only VALUES are branded. Brands are compile-time only (18 §4),
// so nothing boxed may ever reach the projection.
// ===========================================================================

describe("§3 keys are not money — GREEN REGRESSION GUARD (01-F31 / 18 §4)", () => {
  it("01-F31/01-F29 (GREEN): attempt ids, order ids and line ids stay STRINGS and money columns stay plain numbers after branding", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1", { qty: 2 }), ...at(1) }),
      peerEnvelope(peer, 2, { ...payment("O1", 60000, { attempt: "sa-P" }), ...at(2) }),
      peerEnvelope(peer, 3, {
        ...refund("O1", 1000, { attempt: "sa-X", parent: "sa-P" }),
        ...at(3),
      }),
    ]);
    const row = onlyOrder(store);
    expect(typeof row.order_id).toBe("string");
    for (const key of Object.keys(JSON.parse(row.pay_attempts_json) as object)) {
      expect(typeof key).toBe("string");
    }
    for (const key of Object.keys(JSON.parse(row.refund_attempts_json) as object)) {
      expect(typeof key).toBe("string");
    }
    for (const key of Object.keys(JSON.parse(row.json_lines) as object)) {
      expect(typeof key).toBe("string");
    }
    // Values: plain JSON numbers. A boxed brand ({"value":…}) would serialize differently
    // and silently break every downstream reader (18 §4 — brands are compile-time only).
    expect(typeof row.pay_total).toBe("number");
    expect(typeof row.refund_total).toBe("number");
    expect(typeof row.repaid_total).toBe("number");
    const cells = JSON.parse(row.json_lines) as Record<
      string,
      { qty: unknown; unit_price_paisa: unknown }
    >;
    for (const cell of Object.values(cells)) {
      expect(typeof cell.qty).toBe("number");
      expect(typeof cell.unit_price_paisa).toBe("number");
    }
    store.close();
  });
});

// ===========================================================================
// §4/§5 — 01-F34 INVARIANCE SURVIVES THE MIGRATION.
// Helper substitution is arithmetic-identical by construction; this is the check
// that it stayed that way. merge-invariance.test.ts is the general oracle — this
// is the money-plane instance the migration is judged against.
// ===========================================================================

describe("§5 01-F34 invariance survives helper substitution — GREEN REGRESSION GUARD", () => {
  it("01-F34 (GREEN): the money projection is invariant under an ORDER-REVERSING envelope-id bijection", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const envelopes = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...lineAdded("O1", "L1", { qty: 3 }), ...at(1) }),
      peerEnvelope(peer, 2, { ...payment("O1", 90000, { attempt: "sa-A" }), ...at(2) }),
      peerEnvelope(peer, 3, { ...payment("O1", 3, { attempt: "sa-B" }), ...at(3) }),
      peerEnvelope(peer, 4, {
        ...payment("O1", 45000, { attempt: "sa-C", purpose: "repays_receivable" }),
        ...at(4),
      }),
      peerEnvelope(peer, 5, {
        ...refund("O1", 7500, { attempt: "sa-X", parent: "sa-A" }),
        ...at(5),
      }),
    ] as Array<Record<string, unknown>>;
    const map = reversingIdMap(envelopes.map((e) => e.id as string));
    const base = mergeStore(id);
    ingestAll(base, envelopes);
    const relabeled = mergeStore(id);
    ingestAll(
      relabeled,
      [...envelopes].reverse().map((e) => relabelEnvelope(e, map)),
    );
    expect(invariantBytes(relabeled)).toBe(
      canonicalJson(mapProjectionIds(invariantProjection(base), map)),
    );
    base.close();
    relabeled.close();
  });

  it("01-F34 (GREEN, property): every delivery order of one money set yields byte-identical projections", () => {
    const id = identity();
    const peer = peerIdentity(id);
    const envelopes = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, { ...payment("O1", 125000, { attempt: "sa-A" }), ...at(1) }),
      peerEnvelope(peer, 2, { ...payment("O1", 999, { attempt: "sa-B" }), ...at(2) }),
      peerEnvelope(peer, 3, {
        ...payment("O1", 500, { attempt: "sa-C", purpose: "repays_receivable" }),
        ...at(3),
      }),
      peerEnvelope(peer, 4, {
        ...refund("O1", 25000, { attempt: "sa-X", parent: "sa-A" }),
        ...at(4),
      }),
    ];
    const reference = mergeStore(id);
    ingestAll(reference, envelopes);
    const expected = projectionBytes(reference);
    reference.close();
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
        const store = mergeStore(id);
        ingestAll(store, shuffled(envelopes, seed));
        const bytes = projectionBytes(store);
        store.close();
        return bytes === expected;
      }),
      { numRuns: 30 },
    );
  });
});
