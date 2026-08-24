/**
 * `10-F3` / `10-F5` / `10-F28` / `10-F31` — **the period BOUNDARY, which is where this module's
 * three worst defects lived and where none of its 113 other tests were looking.**
 *
 * Every section here exists because an adversarial review reproduced a defect that failed **0 of
 * 113** existing tests. That number is the point of the file: the arithmetic inside one period was
 * correct and thoroughly asserted, and the crossing between two was not asserted at all.
 *
 * ⚠ **Read the fixtures as PHYSICS, not as data.** Each one is a shelf that a human could walk up
 * to and count, and every assertion is a claim about that shelf. The defects were all cases where
 * the report said something about the shelf that the shelf did not say — and on this report, an
 * overstatement is an accusation (`10-F19`: *hints, never accusation*; `10-F33` (f): the row is
 * *"unexplained usage"*, and the word for what it might be is not ours to use).
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — written by the session that fixed the implementation, in
 * the same lane as the rest of this suite (`20 §4.3`'s independence is not available and is not
 * claimed). What stands in for it is the mutation matrix in `packages/inventory/CLAUDE.md`: every
 * assertion below was measured by re-applying the exact defect it names and confirming *that*
 * assertion fails, with a behaviour-preserving negative control that kills nothing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ReferenceData } from "../reference.js";
import { type VarianceReport, varianceReports } from "../variance.js";
import { count, event, item, LOCATION, purchase, resetIds } from "./fixtures.js";

beforeEach(resetIds);

const KG = 1_000_000;

/** Chicken at a typed reference price of Rs 680/kg. One area, so the roll-up is not the subject. */
const REFS: ReferenceData = {
  items: [
    item({
      item_id: "chicken",
      name: "Chicken",
      reference_cost: { value_paisa: 68_000, qty_base: KG },
    }),
  ],
  areas: [],
  recipes: [
    {
      recipe_id: "karahi",
      version: 3,
      yield_qty_base: null,
      produces_item_id: null,
      lines: [{ line_no: 0, component: { kind: "item", id: "chicken" }, qty: 500_000 }],
    },
  ],
  menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "karahi", recipe_id: "karahi" }],
};

const lineAdded = (order_id: string, line_id: string, qty: number, at: number) =>
  event(
    "order.line_added",
    { order_id, line_id, item_id: "karahi", qty, unit_price_paisa: 45_000 },
    { at },
  );

const chickenCount = (count_id: string, kg: number, at: number) =>
  count(count_id, [{ item_id: "chicken", counted: true, qty_base: kg * KG }], at);

const run = (events: Parameters<typeof varianceReports>[0]["events"]) =>
  varianceReports({ location_id: LOCATION, events, refs: REFS });

const chicken = (report: VarianceReport | undefined) =>
  report?.rows.find((row) => row.item_id === "chicken");

// ── §A · 10-F3 — an order that crosses a count is deducted ONCE, in the period it happened in ──

describe("§A · 10-F3 — *exists* means exists in the LEDGER, never exists in this window", () => {
  /**
   * ⚠ **THE DEFECT THIS SECTION EXISTS FOR, IN ONE SENTENCE: an order rung before a count and
   * confirmed after it was deducted in NEITHER period, and the missing food came out as money.**
   *
   * `reportFor` pre-windowed the event list and handed the slice to `consumption`, whose set
   * difference keeps a line only if `order.confirmed` is in the same slice. `10-F3` says *"for
   * every order for which an `order.confirmed` exists"* — unqualified — so windowing silently
   * turned *exists* into *exists here*.
   *
   * Measured on this exact fixture before the fix: **`gap −5 kg`, `gap_value_paisa: −340000`** —
   * Rs 3,400 of unexplained usage manufactured out of a correctly sold order, and ranked to the top
   * of the owner's page by `10-F33` (b), which sorts by money. A count is taken at closing time,
   * which is precisely when orders are open, so this is the ordinary case.
   */
  const crossing = () => [
    chickenCount("c0", 20, 1_000),
    event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_900 }),
    lineAdded("o1", "l1", 10, 2_900), // 10 karahi × 500 g = 5 kg, cooked at 2 900
    chickenCount("c1", 15, 3_000), // …so the shelf really holds 15 kg at the count
    event("order.confirmed", { order_id: "o1" }, { at: 3_100 }), // settled after the count
    chickenCount("c2", 15, 4_000),
  ];

  it("the consumption lands in the period the food left the shelf, and the gap is ZERO", () => {
    const [, first, second] = run(crossing());
    expect(chicken(first)?.expected_qty_base).toBe(15 * KG);
    expect(chicken(first)?.counted_qty_base).toBe(15 * KG);
    expect(chicken(first)?.gap_qty_base).toBe(0);
    expect(chicken(second)?.gap_qty_base).toBe(0);
  });

  it("⚠ NO MONEY IS MANUFACTURED IN EITHER PERIOD — the Rs 3,400 assertion", () => {
    // The one to re-run after any change to windowing. Under the defect the second figure is
    // 340_000: a correctly sold order rendered to an owner as Rs 3,400 of unexplained usage.
    const [, first, second] = run(crossing());
    expect(first?.unexplained_usage_paisa).toBe(0);
    expect(second?.unexplained_usage_paisa).toBe(0);
    expect(first?.surplus_paisa).toBe(0);
    expect(second?.surplus_paisa).toBe(0);
  });

  it("`03-F55`: a round ADDED after confirm is deducted in the period it was added in", () => {
    // The FR's own cited case, and the mirror image of the one above — here the confirm is early
    // and a line is late. Under the defect the second period reported the same fabricated −5 kg.
    const events = [
      chickenCount("c0", 20, 1_000),
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_500 }),
      lineAdded("o1", "l1", 10, 2_500),
      event("order.confirmed", { order_id: "o1" }, { at: 2_600 }),
      chickenCount("c1", 15, 3_000),
      lineAdded("o1", "l2", 10, 3_500), // a second round, on the same confirmed order
      chickenCount("c2", 10, 4_000),
    ];
    const [, first, second] = run(events);
    expect(chicken(first)?.gap_qty_base).toBe(0);
    expect(chicken(second)?.expected_qty_base).toBe(10 * KG);
    expect(chicken(second)?.gap_qty_base).toBe(0);
    expect(second?.unexplained_usage_paisa).toBe(0);
  });

  it("⚠ THE OTHER DIRECTION: a later period's sale does NOT reach back into an earlier one", () => {
    // Without this, "window nothing at all" would pass §A — and that mutant is one keystroke away,
    // because the window parameter has a whole-ledger default. Here every event of the sale sits in
    // period 2, so an unwindowed implementation deducts 5 kg from period 1 and reports 5 kg of
    // SURPLUS on a shelf that was counted correctly.
    const events = [
      chickenCount("c0", 20, 1_000),
      chickenCount("c1", 20, 3_000), // nothing sold yet
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 3_500 }),
      lineAdded("o1", "l1", 10, 3_500),
      event("order.confirmed", { order_id: "o1" }, { at: 3_600 }),
      chickenCount("c2", 15, 4_000),
    ];
    const [, first, second] = run(events);
    expect(chicken(first)?.expected_qty_base).toBe(20 * KG);
    expect(first?.surplus_paisa).toBe(0);
    expect(chicken(second)?.expected_qty_base).toBe(15 * KG);
    expect(second?.unexplained_usage_paisa).toBe(0);
  });

  it("THE CONTROL: a real shortfall is still reported, in quantity and in money", () => {
    // Every assertion above is satisfied by an implementation that reports zero for everything.
    // This is the one that says the report can still speak: same crossing order, but the shelf is
    // 2 kg lighter than the arithmetic says it should be.
    const events = [
      chickenCount("c0", 20, 1_000),
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_900 }),
      lineAdded("o1", "l1", 10, 2_900),
      chickenCount("c1", 13, 3_000), // 15 expected, 13 on the shelf
      event("order.confirmed", { order_id: "o1" }, { at: 3_100 }),
      chickenCount("c2", 13, 4_000),
    ];
    const [, first] = run(events);
    expect(chicken(first)?.gap_qty_base).toBe(-2 * KG);
    expect(chicken(first)?.gap_value_paisa).toBe(-136_000);
    expect(first?.unexplained_usage_paisa).toBe(136_000);
  });

  it("the window is the ACT's stamp, and a redelivery of one line is still one line", () => {
    // `01-F8`/`01-F31`: the same `order.line_added` appended twice is one act at the earlier branch
    // time. A stamp folded into the compared payload would make this a CONTEST and withhold the
    // row; a max-register would move the act into the next period. Both are wrong, and both look
    // right until a redelivery straddles a count.
    const events = [
      chickenCount("c0", 20, 1_000),
      lineAdded("o1", "l1", 10, 2_900),
      lineAdded("o1", "l1", 10, 3_500), // the identical line, re-appended AFTER the count
      event("order.confirmed", { order_id: "o1" }, { at: 2_950 }),
      chickenCount("c1", 15, 3_000),
      chickenCount("c2", 15, 4_000),
    ];
    const [, first, second] = run(events);
    expect(chicken(first)?.withheld).toBeNull();
    expect(chicken(first)?.expected_qty_base).toBe(15 * KG);
    expect(chicken(second)?.expected_qty_base).toBe(15 * KG);
  });
});

// ── §B · 10-F5 — a negative theoretical opening is normal, and must not kill the report ────────

describe("§B · 10-F5 — negative theoretical stock CARRIES, and never throws", () => {
  /**
   * ⚠ **`variance-report.test.ts` §D already proves a negative `expected` does not throw INSIDE one
   * period — and then counts the item at the end, so the negative never persists.** That is the
   * round-3 pattern named in `L10`: the mechanism was built and aimed one case away. What throws is
   * the CARRY, one period later, when `costBasisOf` brands the carried value through `paisa()`:
   *
   *   RangeError: paisa must be a non-negative safe integer, got -340000
   *
   * It escapes the resolver as an INTERNAL_SERVER_ERROR, and because the chain is recomputed from
   * the baseline on every read, the location's whole report stays dead until the offending period
   * falls out of the window. `10-F5` and `01-F17` both say this state is normal and blocks nothing.
   */
  const oversold = () => [
    chickenCount("c0", 10, 1_000),
    event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_000 }),
    lineAdded("o1", "l1", 30, 2_000), // 15 kg cooked out of a 10 kg shelf
    event("order.confirmed", { order_id: "o1" }, { at: 2_100 }),
    // …and NOBODY counts chicken at this close, so −5 kg is carried forward with its value.
    count("c1", [{ item_id: "other", counted: true, qty_base: 1 }], 3_000),
    chickenCount("c2", 2, 4_000),
  ];

  it("the report is PRODUCED — three periods, no throw", () => {
    expect(() => run(oversold())).not.toThrow();
    expect(run(oversold())).toHaveLength(3);
  });

  it("the uncounted period withholds the row and carries the theory forward (10-F5's own words)", () => {
    const [, first] = run(oversold());
    expect(chicken(first)?.withheld).toEqual({ kind: "not_counted", reason: "no_line" });
  });

  it("the NEXT period opens on the negative theory and reconciles it against the shelf", () => {
    // −5 kg of theory against 2 kg on the shelf is a 7 kg surplus, valued at the reference price.
    // That is exactly what `10-F5` means by *"reconciled at next count"*.
    const [, , second] = run(oversold());
    expect(chicken(second)?.expected_qty_base).toBe(-5 * KG);
    expect(chicken(second)?.gap_qty_base).toBe(7 * KG);
    expect(chicken(second)?.gap_value_paisa).toBe(476_000);
    expect(second?.surplus_paisa).toBe(476_000);
  });

  it("⚠ A PAIR WHOSE SIGNS DISAGREE IS NOT A COST, AND ADMITTING ONE INVERTS THE MONEY", () => {
    // ⚠ **THIS TEST EXISTS BECAUSE THE MUTATION MATRIX FOUND MY OWN FIX UNGUARDED.** Widening
    // `qty > 0 && value >= 0` to `qty !== 0 && value !== null` — the obvious "let 10-F5's negatives
    // through" repair — killed **0 of 143**, because every other fixture happens to make the two
    // rates coincide. That is `L10` on the fix rather than on the defect: the mechanism was right
    // and nothing was aimed at the case that decides it.
    //
    // The case: a negative carried opening plus a positive receipt, where the SUM of the values is
    // negative and the SUM of the quantities is positive. The pair `(−339 000, +5 kg)` has a
    // NEGATIVE unit cost, and valuing a 2 kg shortfall at it renders **+Rs 1 356 of surplus** where
    // the shelf is Rs 1 360 short — the money's sign inverted, on the column `10-F19` calls an
    // accusation and `10-F33` (b) sorts the page by.
    const events = [
      chickenCount("c0", 10, 1_000),
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_000 }),
      lineAdded("o1", "l1", 30, 2_000), // 15 kg out of a 10 kg shelf → −5 kg carried
      event("order.confirmed", { order_id: "o1" }, { at: 2_100 }),
      count("c1", [{ item_id: "other", counted: true, qty_base: 1 }], 3_000),
      // A 10 kg delivery invoiced at Rs 10. Schema-valid, and it is what makes the two sums
      // disagree in sign; a real one is a keying error, which is exactly when the report matters.
      purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 1_000 }], 3_500),
      chickenCount("c2", 3, 4_000),
    ];
    const [, , second] = run(events);
    expect(chicken(second)?.expected_qty_base).toBe(5 * KG);
    expect(chicken(second)?.gap_qty_base).toBe(-2 * KG);
    // Valued at the item's typed reference price, because the period pair is not a cost at all.
    expect(chicken(second)?.cost_basis).toBe("reference");
    expect(chicken(second)?.gap_value_paisa).toBe(-136_000);
    expect(second?.unexplained_usage_paisa).toBe(136_000);
    expect(second?.surplus_paisa).toBe(0);
  });

  it("a pair whose QUANTITY is negative is not a cost either, however plausible its rate", () => {
    // The other half of the same guard. `(−330 000, −4 kg)` divides to a perfectly sane
    // Rs 825/kg — which is the trap: it looks like a cost, and it is an artefact of a shortfall
    // being divided by a shortfall. The typed reference price is the honest answer.
    const events = [
      chickenCount("c0", 10, 1_000),
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_000 }),
      lineAdded("o1", "l1", 30, 2_000),
      event("order.confirmed", { order_id: "o1" }, { at: 2_100 }),
      count("c1", [{ item_id: "other", counted: true, qty_base: 1 }], 3_000),
      purchase("p1", [{ item_id: "chicken", qty_base: 1 * KG, line_total_paisa: 10_000 }], 3_500),
      chickenCount("c2", 2, 4_000),
    ];
    const [, , second] = run(events);
    expect(chicken(second)?.expected_qty_base).toBe(-4 * KG);
    expect(chicken(second)?.gap_qty_base).toBe(6 * KG);
    expect(chicken(second)?.gap_value_paisa).toBe(408_000); // 6 kg × Rs 680, not 6 kg × Rs 825
  });

  it("a negative carry does NOT masquerade as a receipted basis", () => {
    // The pair `(−340000, −5 kg)` has a positive rate and is arithmetic nonsense as a cost. The
    // basis test is `qty > 0 && value >= 0`, and it is the reason this row falls through to the
    // typed reference price instead.
    const [, , second] = run(oversold());
    expect(chicken(second)?.cost_basis).toBe("reference");
  });
});

// ── §C · 10-F31 — the basis is PROVENANCE, and provenance does not launder ────────────────────

describe("§C · 10-F31 / `00 §7 (e)` — `receipted` means a receipt, one period later too", () => {
  it("⚠ an item that has NEVER had a receipt never reads `receipted`", () => {
    // Measured before the fix: every row read `"cost_basis":"receipted"` in a fixture containing
    // ZERO `stock.purchase_recorded` events, because the carried opening arrived as a quantity with
    // money attached and nothing recorded where the money came from. `10-F31`'s triple is rendered
    // to an owner as provenance — *"all from invoices"* against *"3 lines on reference prices"* —
    // so this is a false statement about the business, in the report's own vocabulary.
    const events = [chickenCount("c0", 10, 1_000), chickenCount("c1", 9, 2_000)];
    const [, second] = run(events);
    expect(second?.rows.every((row) => row.cost_basis === "reference")).toBe(true);
  });

  it("THE CONTROL: with a receipt in the period, the basis IS `receipted`", () => {
    const events = [
      purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 500),
      chickenCount("c0", 10, 1_000),
      purchase("p2", [{ item_id: "chicken", qty_base: 5 * KG, line_total_paisa: 350_000 }], 1_500),
      chickenCount("c1", 14, 2_000),
    ];
    const [, second] = run(events);
    expect(chicken(second)?.cost_basis).toBe("receipted");
  });

  it("⚠ an opening that brings NOTHING to the pair does not get to LABEL it", () => {
    // The review's second finding, in its sharpest form. `10-F31` hangs the worst-wins rule on
    // *"the opening HALF OF THE PAIR"*, and a baseline that counted an empty shelf carries
    // `(0 paisa, 0 kg)`: it is in neither the numerator nor the denominator and cannot move the
    // rate by any amount. It still decided the label, so an org that counted before its first
    // invoice read `reference` on a period whose money was 100 % one invoice — measured
    // `cost_basis: "reference"` here before the fix.
    const events = [
      chickenCount("c0", 0, 1_000), // an empty shelf, counted honestly, before any receipt
      purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 1_500),
      chickenCount("c1", 10, 2_000),
    ];
    const [, second] = run(events);
    expect(chicken(second)?.cost_basis).toBe("receipted");
    expect(chicken(second)?.gap_qty_base).toBe(0);
  });

  it("⚠ `reference` is NOT an absorbing state — the ramp terminates when the shelf empties", () => {
    // §5.6 (i) 1: *"receipts overwrite it per period the moment one arrives"*. Under the ratchet
    // this fixture read `["reference", "reference"]` for ever: the carry stored the resolved basis
    // and fed it back as the next opening's provenance whether or not the opening contributed. An
    // item counted down to zero and then bought on an invoice is the case that must come back.
    const events = [
      chickenCount("c0", 10, 1_000), // no receipt yet — valued at the typed price
      chickenCount("c1", 0, 2_000), // …and sold out by the next count
      purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 2_500),
      chickenCount("c2", 10, 3_000),
    ];
    const bases = run(events)
      .slice(1)
      .map((report) => chicken(report)?.cost_basis);
    expect(bases).toEqual(["reference", "receipted"]);
  });

  it("a MIXED pair reads the WORST of its halves — a reference opening plus this period's receipt", () => {
    // The rule `worstBasis` already applies to the count basis one file over: a report may not
    // claim more about a number than its weakest input supports. Here the opening was valued at the
    // owner's typed price and the receipt is real, so the pair is not *all from invoices*.
    const events = [
      chickenCount("c0", 10, 1_000), // no receipt yet: valued at the reference price
      purchase("p1", [{ item_id: "chicken", qty_base: 5 * KG, line_total_paisa: 350_000 }], 1_500),
      chickenCount("c1", 15, 2_000),
    ];
    const [, second] = run(events);
    expect(chicken(second)?.cost_basis).toBe("reference");
    // …and the money is still the PERIOD pair, not the typed rate: (10 kg × 6 800) + Rs 3 500 over
    // 15 kg. The basis names the provenance; it does not change the arithmetic.
    expect(chicken(second)?.gap_qty_base).toBe(0);
  });

  it("⚠ a carry with a quantity it could NOT value is not priced at this period's receipt", () => {
    // The review's third finding, at the level a reader meets it. `costBasisOf`'s opening guard was
    // a TAUTOLOGY (`opening !== null || openQty === 0`, where `openQty` is derived from `opening`),
    // and `variance.ts` flattened an unvaluable carry to `null` before it ever got there — so a
    // period opening with 10 kg whose cost nobody knows was priced as if the shelf had opened
    // EMPTY, at the incoming invoice's rate. Measured on this fixture before the fix:
    // `cost_basis "receipted"`, `gap −3 kg`, **`gap_value_paisa −204 000`** — Rs 2 040 of
    // unexplained usage at a rate the period had no way to know, on `10-F19`'s accusation column.
    // `10-F31` R5 refuses a zero standing in for an unknown cost; the row is withheld instead.
    const noCost: ReferenceData = {
      ...REFS,
      items: [item({ item_id: "chicken", name: "Chicken", reference_cost: null })],
    };
    const events = [
      chickenCount("c0", 10, 1_000), // no receipt, no typed price: basis `none`, value unknown
      purchase("p1", [{ item_id: "chicken", qty_base: 5 * KG, line_total_paisa: 340_000 }], 1_500),
      chickenCount("c1", 12, 2_000),
    ];
    const [, second] = varianceReports({ location_id: LOCATION, events, refs: noCost });
    const row = chicken(second);
    expect(row?.cost_basis).toBe("none");
    expect(row?.withheld).toEqual({ kind: "no_cost_basis" });
    // `10-F31`'s quantity column has NO gate and must survive the refusal.
    expect(row?.gap_qty_base).toBe(-3 * KG);
    expect(row?.gap_value_paisa).toBeNull();
    expect(second?.unexplained_usage_paisa).toBe(0);
    expect(second?.is_floor).toBe(true);
  });

  it("…and with a typed price it falls to `reference`, which is a rate an owner can defend", () => {
    // THE CONTROL for the assertion above, one branch away: the same unvaluable carry — a baseline
    // that skipped an item 10 kg of which had already been received — on an item that HAS a
    // reference cost. It resolves to the typed Rs 680/kg and not to this invoice's Rs 700/kg, so
    // "withhold everything" does not pass the pair, and the money moves by Rs 60 between them.
    const events = [
      purchase("p0", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 500),
      count("c0", [{ item_id: "chicken", counted: false }], 1_000), // 10 kg carried, unvaluable
      purchase("p1", [{ item_id: "chicken", qty_base: 5 * KG, line_total_paisa: 350_000 }], 1_500),
      chickenCount("c1", 12, 2_000),
    ];
    const [, second] = run(events);
    expect(chicken(second)?.cost_basis).toBe("reference");
    expect(chicken(second)?.gap_qty_base).toBe(-3 * KG);
    expect(chicken(second)?.gap_value_paisa).toBe(-204_000); // 3 kg × Rs 680, not 3 kg × Rs 700
  });
});

// ── §E · the review's PERFORMANCE finding — resolved once per CHAIN, not once per period ───────

describe("§E · 10-F3 / 10-F28 — the ledger is walked for the chain, not for every period", () => {
  /**
   * ⚠ **THE FIX FOR THE WINDOWING DEFECT WAS O(periods × ledger), AND NOTHING IN THIS SUITE COULD
   * SEE IT.** `reportFor` called `consumption(input.events, …)` per period, so every period
   * re-grouped every `order.line_added` and re-exploded every confirmed line to keep its own
   * window: **2 807 ms** for 49 561 events over 31 periods, against **184 ms** hoisted — at
   * `inventory-router.ts`'s own `DEFAULT_WINDOW_DAYS = 30` and 50 000-row cap, in a synchronous
   * call inside an `async` resolver.
   *
   * A wall-clock assertion would be a flake, so what is asserted is the WORK: `refs.menu_recipes`
   * is read exactly once per resolution and by nothing else on this path, so counting its reads
   * counts the resolutions. The second test is the one that binds — it holds the ORDERS fixed and
   * varies only the number of counts, so an implementation that resolves per period reads more.
   */
  const counting = (refs: ReferenceData) => {
    const reads = new Map<string, number>();
    const proxy = new Proxy(refs, {
      get(target, property, receiver) {
        reads.set(String(property), (reads.get(String(property)) ?? 0) + 1);
        return Reflect.get(target, property, receiver);
      },
    });
    return { refs: proxy, reads };
  };

  /**
   * The SAME twelve sold orders every time, closed by `counts` counts. Only the number of periods
   * varies, which is the whole point: the orders are the work, and the periods must not multiply it.
   */
  const ledger = (counts: number) => {
    const events = [chickenCount("c0", 100, 1_000)];
    for (let index = 1; index <= 12; index += 1) {
      const at = 1_000 + index * 100;
      events.push(event("order.created", { order_id: `o${index}`, channel: "counter" }, { at }));
      events.push(lineAdded(`o${index}`, `l${index}`, 2, at));
      events.push(event("order.confirmed", { order_id: `o${index}` }, { at: at + 10 }));
    }
    for (let index = 1; index <= counts; index += 1) {
      events.push(chickenCount(`c${index}`, 100 - index, 3_000 + index * 1_000));
    }
    return events;
  };

  it("a 12-period chain resolves the deduction set exactly ONCE", () => {
    const { refs, reads } = counting(REFS);
    const reports = varianceReports({ location_id: LOCATION, events: ledger(12), refs });
    expect(reports).toHaveLength(13);
    expect(reads.get("menu_recipes")).toBe(1);
  });

  it("⚠ THE BINDING ONE: the same orders cost the same walk however many counts there are", () => {
    // Under the defect these two differ by the number of extra periods — the whole cost of the
    // regression, expressed as a count instead of a stopwatch.
    const twelve = counting(REFS);
    varianceReports({ location_id: LOCATION, events: ledger(12), refs: twelve.refs });
    const two = counting(REFS);
    varianceReports({ location_id: LOCATION, events: ledger(2), refs: two.refs });
    expect(twelve.reads.get("menu_recipes")).toBe(two.reads.get("menu_recipes"));
    expect(twelve.reads.get("recipes")).toBe(two.reads.get("recipes"));
  });

  it("THE CONTROL: the counter is live — running the chain twice reads it exactly twice over", () => {
    // Without this, a Proxy that counted nothing would leave the assertions above resting on
    // `undefined`. It is stated as a RATIO on purpose, so it survives the defect the other two
    // own: an implementation resolving per period doubles this number too, and only a dead
    // counter breaks it. That is what makes the kills above attributable.
    const { refs, reads } = counting(REFS);
    const events = ledger(2);
    varianceReports({ location_id: LOCATION, events, refs });
    const once = reads.get("menu_recipes") ?? 0;
    varianceReports({ location_id: LOCATION, events, refs });
    expect(once).toBeGreaterThan(0);
    expect(reads.get("menu_recipes")).toBe(once * 2);
  });
});

// ── §D · TRIPWIRES — two behaviours that are WRONG, recorded so they cannot be forgotten ───────

describe("§D · TRIPWIRES — ⚠ NOT specifications of desired behaviour", () => {
  /**
   * ⚠⚠ **EVERYTHING IN THIS SECTION ASSERTS BEHAVIOUR THAT AN FR CONTRADICTS.** It is here because
   * `L11` says a gap stated in prose is a gap the next session does not write an assertion for, and
   * because a comment claiming the opposite of the code is how this module got its fourth finding.
   *
   * **If you make either of these tests fail, you have probably FIXED something.** Delete the test,
   * take the debt off `packages/inventory/CLAUDE.md`, and say so in the commit.
   */

  it("TRIPWIRE (10-F28): a CLOSED period is recomputed from live reference data, not frozen", () => {
    // `10-F28`: *"A closed period's derived movements, valuation and variance report are
    // IMMUTABLE; a recipe correction (10-F4) re-derives only the OPEN period."* Nothing here
    // freezes anything: `varianceReports` walks the whole chain from `refs` on every read, so
    // editing a recipe — or a reference cost, or an area membership — rewrites history that an
    // owner may already have read and acted on.
    //
    // It cannot be fixed inside this package: a freeze needs the closed period's derived rows to be
    // STORED (`10 §5`'s `stock_movements` / `count_periods`), and this package is PURE by design
    // (`DEC-ARCH-001` (B)). The debt is the read model's — `services/api/src/inventory.ts`
    // recomputes from the baseline on every read — and it is slice 2 work.
    //
    // ⚠ The same absence is why a LATE `order.line_removed` now reaches back into a closed period:
    // `10-F3`'s set difference is over the ledger, which is the FR, and only the freeze bounds it.
    const events = () => [
      purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 500),
      chickenCount("c0", 10, 1_000),
      event("order.created", { order_id: "o1", channel: "counter" }, { at: 2_000 }),
      lineAdded("o1", "l1", 4, 2_000),
      event("order.confirmed", { order_id: "o1" }, { at: 2_000 }),
      chickenCount("c1", 7, 3_000), // ← this period CLOSED at t=3 000
      chickenCount("c2", 7, 5_000),
    ];
    const withQty = (qty: number): ReferenceData => ({
      ...REFS,
      recipes: [
        {
          recipe_id: "karahi",
          version: 3,
          yield_qty_base: null,
          produces_item_id: null,
          lines: [{ line_no: 0, component: { kind: "item", id: "chicken" }, qty }],
        },
      ],
    });
    resetIds();
    const before = varianceReports({
      location_id: LOCATION,
      events: events(),
      refs: withQty(500_000),
    });
    resetIds();
    const after = varianceReports({
      location_id: LOCATION,
      events: events(),
      refs: withQty(600_000),
    });
    expect(chicken(before[1])?.gap_value_paisa).toBe(-68_000);
    // ⚠ The closed period MOVED. Rs 680 of an owner's report changed because a recipe was edited.
    expect(chicken(after[1])?.gap_value_paisa).toBe(-40_800);
  });

  it("TRIPWIRE (10-F28): two counts ONE MILLISECOND apart are two periods, not one closing act", () => {
    // `count.ts` merges counts sharing a boundary, and its comment used to name *"two devices
    // submitting"* as the case — the merge key is the exact branch millisecond, so the kitchen
    // sheet and the store sheet submitted 1 ms apart become two periods, and every item in the
    // second reads `area_line_missing` because the other device's lines are in the first.
    //
    // It is NOT fixed here on purpose: `10-F28` defines a period as opened by the previous count
    // and closed by the next, so two counts are two periods by its own words, and merging on a time
    // window would mean inventing the window (commandment 2). The fix is an FR act.
    const refs: ReferenceData = {
      ...REFS,
      areas: [
        { item_id: "chicken", location_id: LOCATION, area_id: "kitchen", sort: 0 },
        { item_id: "chicken", location_id: LOCATION, area_id: "store", sort: 1 },
      ],
    };
    const events = [
      count(
        "c0a",
        [{ item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 5 * KG }],
        1_000,
      ),
      count(
        "c0b",
        [{ item_id: "chicken", area_id: "store", counted: true, qty_base: 5 * KG }],
        1_001,
      ),
    ];
    const reports = varianceReports({ location_id: LOCATION, events, refs });
    expect(reports).toHaveLength(2);
    expect(chicken(reports[1])?.withheld).toEqual({
      kind: "not_counted",
      reason: "area_line_missing",
    });
    // The control that says the merge itself is real: the SAME two sheets at one stamp are one act.
    const merged = varianceReports({
      location_id: LOCATION,
      events: [
        count(
          "c1a",
          [{ item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 5 * KG }],
          2_000,
        ),
        count(
          "c1b",
          [{ item_id: "chicken", area_id: "store", counted: true, qty_base: 5 * KG }],
          2_000,
        ),
      ],
      refs,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.count_ids).toEqual(["c1a", "c1b"]);
  });
});
