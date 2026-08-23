// ACCEPTANCE TESTS — `01-F33`'s `uncovered_addition` ceiling, against the ENGINE.
//
// Written alongside the fix under `plans/v0.md`'s R66. The end-to-end reproduction — a real till,
// a real posture, a real granularity, both directions of the defect — is
// `apps/pos-electron/src/main/__acceptance__/uncovered-addition-ceiling.test.ts`. This file owns
// the half that has nothing to do with tax: **which attested field is the ceiling, and what the
// fold does with a snapshot that is absent, malformed, or contradicted by a peer.**
//
// ── WHAT MOVED, AND WHY IT COULD NOT MOVE THE OTHER WAY ───────────────────────────────────────
//
//   01-F33 (amended August 2026)  the ceiling is `billed_effective_paisa` — the fold's own line
//            sum — and NOT `billed_paisa`, which `01-F82`/`02-F63` made the ROUNDED, TAX-INCLUSIVE
//            charge. Comparing a charge against a line sum is wrong in both directions: a charge
//            rounded DOWN accuses a settled order of an addition nobody made, and under
//            `exclusive` a charge sitting above the line sum by the tax hides a real one.
//   01-F87 / 01-F52   configuration is NEVER a fold input. This is why the fold cannot simply be
//            taught the charge: a projection keyed on an org-typed rate makes two tills at
//            different configuration versions project different money, which no property test
//            can catch. The ceiling has to be a quantity both sides of the `>` can express.
//   01-F63   the ratified snapshot semantics are UNCHANGED and now bind the ceiling field: an
//            absent snapshot asserts NO ceiling ("no attestation" is not "attested zero"), an
//            attested `0` is a real ceiling, and a non-integer or negative one is
//            ignored-with-anomaly — `close_snapshot_invalid`, while the ACT still settles.
//   01-F34   the verdict is a function of the delivered SET: no ordering metadata, no latch.

import { describe, expect, it } from "vitest";
import { identity, peerEnvelope, peerIdentity } from "./builders.js";
import {
  created,
  ingestAll,
  lineAdded,
  mergeStore,
  projectionBytes,
  settlementClosed,
} from "./merge-builders.js";

const T0 = 1752800000000;
const at = (offsetMs: number) => ({ device_created_at: T0 + offsetMs });

/** Rs 404 — the fixture the end-to-end reproduction uses, so the two files name one bill. */
const LINE = 40_400;
/** What the till would attest as `billed_paisa` for that line at 16 % exclusive, step Rs 1. */
const CHARGE_ABOVE = 46_900;
/** ...and at posture `none`, step Rs 10: the SAME line, rounded down. */
const CHARGE_BELOW = 40_000;

/**
 * One line, one close carrying whatever snapshot the case is about, and optionally a line added
 * afterwards. Returns the order's exception set and its `settled` column.
 *
 * The close is built by `merge-builders`' `settlementClosed`, which mirrors an unstated
 * `billed_effective_paisa` onto `billed_paisa` — so every case below that wants the two to DIFFER
 * says both out loud, and a reader can see which number is doing the work.
 */
const fold = (close: Record<string, unknown>, opts: { lateAdd?: number } = {}) => {
  const id = identity();
  const peer = peerIdentity(id);
  const store = mergeStore(id);
  ingestAll(store, [
    peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
    peerEnvelope(peer, 1, {
      ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: LINE }),
      ...at(100),
    }),
    peerEnvelope(peer, 2, { ...settlementClosed("O1", close), ...at(200) }),
    ...(opts.lateAdd === undefined
      ? []
      : [
          peerEnvelope(peer, 3, {
            ...lineAdded("O1", "L2", { qty: 1, unit_price_paisa: opts.lateAdd }),
            ...at(300),
          }),
        ]),
  ]);
  const rows = store.openOrders();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (row === undefined) throw new Error("expected exactly one open_orders row");
  const out = {
    settled: row.settled,
    exceptions: JSON.parse(row.exceptions_json) as string[],
  };
  store.close();
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE CEILING IS `billed_effective_paisa`, AND `billed_paisa` CANNOT MOVE THE VERDICT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F33 — which field is the ceiling", () => {
  it("an honest ceiling with nothing added raises nothing, however far `billed_paisa` is from it", () => {
    // The FALSE POSITIVE, at the fold. `billed_paisa` is Rs 400 against a Rs 404 line — exactly
    // what a step of Rs 10 attests — and it must not be read.
    // MUTANT THIS KILLS: the shipped `if (!("billed_paisa" in close)) continue; … ceiling = snap`.
    expect(fold({ billed_paisa: CHARGE_BELOW, billed_effective_paisa: LINE })).toEqual({
      settled: 1,
      exceptions: [],
    });
  });

  it("a line added after the close IS seen, however far ABOVE the line sum `billed_paisa` sits", () => {
    // The FALSE NEGATIVE, at the fold. `billed_paisa` is Rs 469 — the 16 % charge — and a Rs 60
    // addition hides entirely underneath it if that is the ceiling.
    // MUTANT THIS KILLS: the same shipped expression, and any `max(billed_paisa, …)` variant.
    expect(
      fold({ billed_paisa: CHARGE_ABOVE, billed_effective_paisa: LINE }, { lateAdd: 6_000 }),
    ).toEqual({ settled: 1, exceptions: ["uncovered_addition"] });
  });

  it("one paisa over the attested ceiling is enough — the check is `>` and carries no tolerance", () => {
    // MUTANT THIS KILLS: a ceiling widened by a granularity step to "absorb rounding", which is
    // the tempting fix and swallows every addition smaller than the step.
    expect(fold({ billed_effective_paisa: LINE }, { lateAdd: 1 }).exceptions).toEqual([
      "uncovered_addition",
    ]);
    expect(fold({ billed_effective_paisa: LINE }).exceptions, "exact equality is not over").toEqual(
      [],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `01-F63`'s RATIFIED SNAPSHOT SEMANTICS, NOW BINDING THE CEILING FIELD.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F63 — absent, attested zero, and bad evidence", () => {
  it("an ABSENT ceiling asserts NO ceiling, even with a `billed_paisa` present to fall back to", () => {
    // "No attestation" is not "attested zero" — unchanged from the ratified rule, and the case
    // that matters now is a close written by a till that predates the amendment.
    // MUTANT THIS KILLS: falling back to `billed_paisa` when the ceiling field is absent, which
    // reinstates BOTH halves of the defect for exactly those rows.
    const bare = { type: "order.settlement_closed", payload: { order_id: "O1" } };
    const id = identity();
    const peer = peerIdentity(id);
    const store = mergeStore(id);
    ingestAll(store, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: LINE }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, { ...bare, ...at(200) }),
    ]);
    const row = store.openOrders()[0];
    expect(row?.settled).toBe(1);
    expect(JSON.parse(String(row?.exceptions_json))).toEqual([]);
    store.close();

    // And with a charge attested but no ceiling — the shape a pre-amendment till writes, built
    // as a literal payload because the KEY has to be genuinely absent (`in`, not `undefined`).
    const preAmendment = mergeStore(id);
    ingestAll(preAmendment, [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: LINE }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, {
        type: "order.settlement_closed",
        payload: { order_id: "O1", billed_paisa: CHARGE_BELOW, tendered_paisa: CHARGE_BELOW },
        ...at(200),
      }),
    ]);
    const legacy = preAmendment.openOrders()[0];
    expect(legacy?.settled).toBe(1);
    expect(JSON.parse(String(legacy?.exceptions_json))).toEqual([]);
    preAmendment.close();
  });

  it("an ATTESTED ZERO ceiling is a real ceiling — a lineless close over a priced order flags", () => {
    // MUTANT THIS KILLS: `if (!snap) continue`, which treats 0 as absent and is the falsy-check a
    // first draft writes.
    expect(fold({ billed_effective_paisa: 0 }).exceptions).toEqual(["uncovered_addition"]);
  });

  it("a NON-INTEGER or NEGATIVE ceiling is ignored-with-anomaly — the act still settles", () => {
    // `00 §6`: paisa are integers. The ACT is the fact and bad evidence must never unmake it
    // (`01-F63`), so `settled` stays 1, no ceiling is taken, and no spurious `uncovered_addition`
    // is raised off a garbage number.
    for (const bad of [500.5, -100]) {
      expect(fold({ billed_paisa: bad, billed_effective_paisa: bad }), `${bad}`).toEqual({
        settled: 1,
        exceptions: ["close_snapshot_invalid"],
      });
    }
  });

  it("a malformed `billed_paisa` raises the anomaly too, and does not disarm a VALID ceiling", () => {
    // `01-F63` calls the whole payload one snapshot, so either money field arriving malformed is
    // bad evidence. The second half is the one worth asserting: a garbage charge must not buy an
    // order immunity from the addition check.
    // MUTANT THIS KILLS: `continue`-ing the whole close when `billed_paisa` is bad.
    expect(
      fold({ billed_paisa: 500.5, billed_effective_paisa: LINE }, { lateAdd: 6_000 }).exceptions,
    ).toEqual(["close_snapshot_invalid", "uncovered_addition"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — TWO CLOSES, AND `01-F34`. The ceiling is the LARGEST valid attestation, order-free.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F33/01-F34 — a G-Set of closes, and no delivery order in the answer", () => {
  it("the ceiling is the LARGEST valid attestation among delivered closes", () => {
    // Two tills closed the same bill (`DEC-MONEY-009`'s partition case). The smaller snapshot must
    // not turn the larger one's own lines into an addition.
    // MUTANT THIS KILLS: `min`, or last-writer-wins over the close map.
    const id = identity();
    const peer = peerIdentity(id);
    const other = peerIdentity(id);
    const events = [
      peerEnvelope(peer, 0, { ...created("O1"), ...at(0) }),
      peerEnvelope(peer, 1, {
        ...lineAdded("O1", "L1", { qty: 1, unit_price_paisa: LINE }),
        ...at(100),
      }),
      peerEnvelope(peer, 2, {
        ...settlementClosed("O1", { billed_effective_paisa: 10_000 }),
        ...at(200),
      }),
      peerEnvelope(other, 0, {
        ...settlementClosed("O1", { billed_effective_paisa: LINE }),
        ...at(200),
      }),
    ];
    const forward = mergeStore(id);
    ingestAll(forward, events);
    expect(JSON.parse(String(forward.openOrders()[0]?.exceptions_json))).toEqual([]);

    // `01-F34`: the same delivered SET, delivered backwards, is byte-identical.
    // MUTANT THIS KILLS: a ceiling latched when the FIRST close arrives — passes every test above
    // and is a live standing-law-1 break.
    const reverse = mergeStore(id);
    ingestAll(reverse, [...events].reverse());
    expect(projectionBytes(reverse)).toBe(projectionBytes(forward));
    forward.close();
    reverse.close();
  });
});
