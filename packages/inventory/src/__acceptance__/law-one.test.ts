/**
 * **LAW 1 (`01-F34`, `26`, `DEC-PERF-001`) — THE PROPERTY THAT FOUND A REAL DEFECT IN A PRIOR
 * ATTEMPT AT THIS MODULE, WRITTEN FIRST FOR EXACTLY THAT REASON.**
 *
 * *"Folds declare explicit merge rules and read NO ordering metadata — no `global_seq`, no
 * `lamport_seq`, no device clock, no envelope-id comparison that reaches a projected VALUE. Tested
 * by bijective id-relabel + clock-injection invariance; plain convergence testing is insufficient
 * (a min-id tiebreak passes it while smuggling wall clock in through the UUIDv7 prefix)."*
 *
 * A previous session building this module found, through a test of this shape, that a `line_id`
 * delivered with two different payloads was resolving **last-write-wins** — an order dependence, and
 * therefore a law-1 break. `contested.ts` is the answer to that, and this file is what proves the
 * answer holds rather than merely describing it.
 *
 * ## What is varied, and why each axis has to be here separately
 *
 *   · **Permutation** — the same event SET in a different array order. This is the axis that kills
 *     last-write-wins. Nothing else does: an LWW implementation is perfectly deterministic and
 *     passes id-relabel and clock injection unchanged.
 *   · **Bijective id relabel** — every `id` replaced through a bijection, including one that
 *     REVERSES the natural order. This kills a `min(envelope.id)` or `max(envelope.id)` tiebreak,
 *     which permutation alone does not: such a tiebreak is order-INVARIANT and still illegal,
 *     because the UUIDv7 prefix smuggles wall clock into a projected value.
 *   · **Device-clock injection** — `device_created_at` scrambled. `01-N2`'s skew detection is its
 *     one sanctioned reader; a fold that reached for it would look right in every fixture where
 *     the two stamps agree, which is why `fixtures.ts` makes them disagree by default.
 *   · **`lamport_seq` injection** — `01-F34` names it too. It keeps a transport/audit role and has
 *     no business role at all.
 *
 * ## What is deliberately NOT varied
 *
 * **`branch_created_at` is an INPUT, not metadata**, and varying it would make this file assert the
 * opposite of law 2. `01-F43`..`F46` make branch time the branch-consensus business clock, stamped
 * at append and travelling inside the event precisely so durations are computable; `10-F28`'s
 * period is a duration. `services/api/src/ledger.ts` and `day-ledger.ts` already window on it. So a
 * report that changed when branch time changed is CORRECT, and one that did not would mean the
 * period boundary came from somewhere it must not.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — written by the session that wrote the implementation, so
 * `20 §4.3`'s independent-oracle guarantee is not available and is not claimed. The out-of-tree
 * mutation matrix in `packages/inventory/CLAUDE.md` is what stands in for it, and its negative
 * control is what stops that matrix proving nothing.
 */

import type { ParsedEvent } from "@restos/domain";
import { parseEvent } from "@restos/domain";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { consumption, deductionSet } from "../deduction.js";
import type { ReferenceData } from "../reference.js";
import { varianceReports } from "../variance.js";
import { count, emptyRefs, item, LOCATION, purchase, resetIds, sale, wastage } from "./fixtures.js";

beforeEach(resetIds);

// ── the three mutilations ──────────────────────────────────────────────────────────────────────

/** Re-stamp every envelope through a bijection on ids. `reverse` makes the new order the opposite. */
const relabel = (events: readonly ParsedEvent[], reverse: boolean): readonly ParsedEvent[] => {
  const ids = events.map((e) => e.envelope.id);
  const targets = [...ids].sort();
  const mapping = new Map<string, string>();
  ids.forEach((id, i) => {
    const j = reverse ? ids.length - 1 - i : i;
    // biome-ignore lint/style/noNonNullAssertion: index is within `targets` by construction.
    mapping.set(id, targets[j]!);
  });
  return events.map((e) =>
    parseEvent({ ...e.envelope, payload: e.payload, id: mapping.get(e.envelope.id) }),
  );
};

const injectClocks = (events: readonly ParsedEvent[]): readonly ParsedEvent[] =>
  events.map((e, i) =>
    parseEvent({
      ...e.envelope,
      payload: e.payload,
      // Reversed relative to arrival, and far from branch time in both directions.
      device_created_at: 2_000_000_000_000 - i * 97_003,
      lamport_seq: events.length - i,
      server_received_at: 1_900_000_000_000 + i,
    }),
  );

const permute = (events: readonly ParsedEvent[], seed: number): readonly ParsedEvent[] => {
  const out = [...events];
  // A deterministic Fisher-Yates from the seed, so a failure is reproducible from the counterexample.
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    // biome-ignore lint/style/noNonNullAssertion: both indices are within bounds.
    [out[i]!, out[j]!] = [out[j]!, out[i]!];
  }
  return out;
};

// ── the world under test ───────────────────────────────────────────────────────────────────────

const REFS: ReferenceData = {
  items: [
    item({ item_id: "chicken", reference_cost: { value_paisa: 68_000, qty_base: 1_000_000 } }),
    item({ item_id: "oil", reference_cost: { value_paisa: 42_000, qty_base: 1_000_000 } }),
  ],
  areas: [
    { item_id: "chicken", location_id: LOCATION, area_id: "walk-in", sort: 0 },
    { item_id: "oil", location_id: LOCATION, area_id: "dry-store", sort: 1 },
  ],
  recipes: [
    {
      recipe_id: "karahi",
      version: 3,
      yield_qty_base: null,
      produces_item_id: null,
      lines: [
        { line_no: 0, component: { kind: "item", id: "chicken" }, qty: 250_000 },
        { line_no: 1, component: { kind: "item", id: "oil" }, qty: 30_000 },
      ],
    },
  ],
  menu_recipes: [
    { sellable_kind: "menu_item", sellable_id: "karahi-sellable", recipe_id: "karahi" },
  ],
};

/** A two-period history with purchases, a sale, wastage and two closing counts. */
const world = (): readonly ParsedEvent[] => [
  purchase("p1", [{ item_id: "chicken", qty_base: 10_000_000, line_total_paisa: 680_000 }], 1_000),
  count(
    "c0",
    [
      { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 10_000_000 },
      { item_id: "oil", area_id: "dry-store", counted: true, qty_base: 5_000_000 },
    ],
    2_000,
  ),
  ...sale("o1", [{ line_id: "l1", sellable_id: "karahi-sellable", qty: 4 }], 3_000),
  wastage("w1", "chicken", 300_000, 3_500),
  purchase("p2", [{ item_id: "oil", qty_base: 2_000_000, line_total_paisa: 84_000 }], 3_800),
  count(
    "c1",
    [
      { item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 8_500_000 },
      {
        item_id: "oil",
        area_id: "dry-store",
        counted: true,
        qty_base: 6_800_000,
        basis: "estimated",
      },
    ],
    4_000,
  ),
];

const reportOf = (events: readonly ParsedEvent[]) =>
  JSON.stringify(varianceReports({ location_id: LOCATION, events, refs: REFS }));

// ── §A · the properties ────────────────────────────────────────────────────────────────────────

describe("§A · 01-F34 — the report is a pure function of the event SET", () => {
  it("PERMUTATION: 200 shuffles of one event set produce byte-identical reports", () => {
    resetIds();
    const events = world();
    const expected = reportOf(events);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 30 }), (seed) => {
        expect(reportOf(permute(events, seed))).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("BIJECTIVE ID RELABEL, including a REVERSING one, changes nothing", () => {
    // A `min(envelope.id)` tiebreak is order-INVARIANT, so permutation alone never catches it —
    // `26 §2` records that such a tiebreak passes plain convergence testing while smuggling wall
    // clock in through the UUIDv7 prefix. This is the axis that kills it.
    resetIds();
    const events = world();
    const expected = reportOf(events);
    expect(reportOf(relabel(events, false))).toEqual(expected);
    expect(reportOf(relabel(events, true))).toEqual(expected);
  });

  it("DEVICE CLOCK, lamport_seq and server_received_at injection change nothing", () => {
    resetIds();
    const events = world();
    expect(reportOf(injectClocks(events))).toEqual(reportOf(events));
  });

  it("ALL THREE AT ONCE, over 200 seeds", () => {
    resetIds();
    const events = world();
    const expected = reportOf(events);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 30 }), fc.boolean(), (seed, reverse) => {
        expect(reportOf(permute(injectClocks(relabel(events, reverse)), seed))).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("BRANCH TIME IS AN INPUT, NOT METADATA — moving a count's stamp DOES change the answer", () => {
    // The control that stops this file being vacuous in the other direction. If nothing at all
    // changed the report, every assertion above would pass against an implementation that returned
    // a constant. Law 2 makes `branch_created_at` the business clock and `10-F28`'s period is a
    // duration, so a report that ignored it would be reading its boundary from somewhere illegal.
    resetIds();
    const before = reportOf(world());
    resetIds();
    const moved = world().map((e) =>
      e.type === "stock.wastage_recorded"
        ? parseEvent({ ...e.envelope, payload: e.payload, branch_created_at: 1_500 })
        : e,
    );
    expect(reportOf(moved)).not.toEqual(before);
  });
});

// ── §B · THE DEFECT THE PRIOR ATTEMPT FOUND, aimed at directly ─────────────────────────────────

describe("§B · a business key delivered with two payloads is CONTESTED, never last-write-wins", () => {
  const twoPayloads = (a: number, b: number): readonly ParsedEvent[] => {
    resetIds();
    return [
      ...sale("o1", [{ line_id: "l1", sellable_id: "karahi-sellable", qty: a }], 3_000),
      // The SAME `line_id` again, with a different quantity. `01-F1` allows no edit, so this is a
      // defect upstream — the question is only what a projection does with it.
      parseEvent({
        ...sale("o1", [{ line_id: "l1", sellable_id: "karahi-sellable", qty: b }], 3_000)[1]
          ?.envelope,
        payload: {
          order_id: "o1",
          line_id: "l1",
          item_id: "karahi-sellable",
          qty: b,
          unit_price_paisa: 45_000,
        },
      }),
    ];
  };

  it("the contest is symmetric: swapping arrival order gives the identical answer", () => {
    const forward = deductionSet(twoPayloads(4, 7));
    const backward = deductionSet([...twoPayloads(4, 7)].reverse());
    expect(forward).toEqual(backward);
    expect(forward.contested_line_ids).toEqual(["l1"]);
    // ⚠ AND THE LINE IS NOT IN THE SET. Last-write-wins would put ONE of them here and the answer
    // would depend on which arrived last — the exact defect this section is named for.
    expect(forward.lines).toEqual([]);
  });

  it("(4, 7) and (7, 4) are the SAME contest — the values are a set, not a sequence", () => {
    expect(deductionSet(twoPayloads(4, 7)).contested_line_ids).toEqual(
      deductionSet(twoPayloads(7, 4)).contested_line_ids,
    );
  });

  it("⚠ a contested line does NOT quietly reduce consumption — it REFUSES the items it touched", () => {
    // The trap inside the fix. Dropping the contested line and moving on understates consumption,
    // which INFLATES the apparent gap — and an inflated gap on this report is an accusation
    // (`10-F19`). So the items the line could have touched are marked unresolved and their rows
    // are withheld.
    const used = consumption(twoPayloads(4, 7), REFS);
    expect(used.by_item.size).toBe(0);
    expect(used.unresolved_items).toEqual(["chicken", "oil"]);
  });

  it("an IDENTICAL redelivery is not a contest — it is one act (01-F8, 01-F31)", () => {
    const once = deductionSet(twoPayloads(4, 4));
    expect(once.contested_line_ids).toEqual([]);
    expect(once.lines).toHaveLength(1);
    expect(once.lines[0]?.qty).toBe(4);
  });

  it("the same line_id under two ORDER ids is a contest too, not two lines", () => {
    resetIds();
    const events = [
      ...sale("o1", [{ line_id: "shared", sellable_id: "karahi-sellable", qty: 1 }], 1_000),
      ...sale("o2", [{ line_id: "shared", sellable_id: "karahi-sellable", qty: 1 }], 1_000),
    ];
    expect(deductionSet(events).contested_line_ids).toEqual(["shared"]);
  });
});

// ── §C · the set difference itself ─────────────────────────────────────────────────────────────

describe("§C · 10-F3 — the amended, order-free set difference", () => {
  it("an UNCONFIRMED order contributes nothing", () => {
    resetIds();
    const events = sale("o1", [{ line_id: "l1", sellable_id: "x", qty: 2 }], 1_000).filter(
      (e) => e.type !== "order.confirmed",
    );
    expect(deductionSet(events).lines).toEqual([]);
  });

  it("a REMOVED line is subtracted regardless of where the removal sits in the array", () => {
    resetIds();
    const base = sale("o1", [{ line_id: "l1", sellable_id: "x", qty: 2 }], 1_000);
    const removal = parseEvent({
      ...base[0]?.envelope,
      id: "0193b0f0-0000-7000-8000-999999999999",
      type: "order.line_removed",
      payload: { order_id: "o1", line_id: "l1" },
    });
    expect(deductionSet([...base, removal]).lines).toEqual([]);
    expect(deductionSet([removal, ...base]).lines).toEqual([]);
  });

  it("10-F7 falls out for free: a void names no line, so the food stays consumed", () => {
    // Measured rather than asserted from memory: `void.recorded` carries no `line_id` at all, so
    // there is nothing for the set difference to remove. The FR needs no enforcement.
    resetIds();
    const base = sale("o1", [{ line_id: "l1", sellable_id: "karahi-sellable", qty: 2 }], 1_000);
    const voided = parseEvent({
      ...base[0]?.envelope,
      id: "0193b0f0-0000-7000-8000-888888888888",
      type: "void.recorded",
      payload: {
        order_id: "o1",
        amount_paisa: 90_000,
        reason: "sent back",
        approver_user_id: "user-manager",
        adjustment_attempt_id: "adj-1",
      },
    });
    expect(Object.keys(voided.payload as object)).not.toContain("line_id");
    expect(deductionSet([...base, voided]).lines).toHaveLength(1);
  });

  it("10-F8: a sold sellable with no recipe is a coverage GAP, never a deduction of zero", () => {
    resetIds();
    const used = consumption(
      sale("o1", [{ line_id: "l1", sellable_id: "unmapped-dish", qty: 3 }], 1_000),
      REFS,
    );
    expect(used.coverage_gaps).toEqual(["unmapped-dish"]);
    expect(used.by_item.size).toBe(0);
  });

  it("an empty world produces no reports and throws nothing", () => {
    expect(varianceReports({ location_id: LOCATION, events: [], refs: emptyRefs })).toEqual([]);
  });
});
