/**
 * `10-F28` — the period, the pair, and the arithmetic that had to stop being order-dependent.
 *
 * **The defect this FR removed, restated so the assertions have something to bite:** `10-F6` said
 * the moving-average cost is *"updated on each purchase receipt"*. A running average interleaved
 * with issues values those issues differently depending on the order receipts and issues arrive —
 * so **delivery order decided a money outcome**, which is the exact `01-F34` break `26 §2` exists
 * to remove. §A is the property that would have caught it; §B is the pair that replaced it.
 */

import { describe, expect, it } from "vitest";
import { costBasisOf, inWindow, periodsFor, physicalFacts, valueOrNull } from "../period.js";
import { DivideByZeroError, valueAt } from "../rational.js";
import { count, item, LOCATION, purchase, resetIds } from "./fixtures.js";

const KG = 1_000_000;

// ── §A · the pair, and why there is no stored unit cost ────────────────────────────────────────

describe("§A · 10-F28 — a cost is a PAIR and a quantity is valued by one exact multiply-then-round", () => {
  it("the rate a pair refuses to store is genuinely not an integer", () => {
    // Rs 6 800 for 10 kg is 0.068 paisa per milligram. Storing that would have to round, and
    // `01-F1` makes the rounding error permanent.
    const pair = { value_paisa: 680_000, qty_base: 10 * KG };
    expect(680_000 / (10 * KG)).not.toBe(Math.round(680_000 / (10 * KG)));
    // Valued from the pair it is exact at every quantity that has an exact answer.
    expect(valueAt(10 * KG, pair)).toBe(680_000);
    expect(valueAt(1 * KG, pair)).toBe(68_000);
    expect(valueAt(0, pair)).toBe(0);
  });

  it("negative quantities value symmetrically — a gap is a signed difference", () => {
    // Half-up AWAY FROM ZERO. A rule that rounded −0.5 to 0 and +0.5 to 1 would treat the two signs
    // differently, and `10-F33` (c) makes the sign the thing that decides whether anyone is accused.
    const pair = { value_paisa: 3, qty_base: 2 };
    expect(valueAt(1, pair)).toBe(2); // 1.5 → 2
    expect(valueAt(-1, pair)).toBe(-2); // −1.5 → −2
  });

  it("a pair with zero quantity has NO RATE and REFUSES rather than answering zero", () => {
    // R5's *"a zero standing in for an unknown cost"*, in its arithmetic form.
    expect(() => valueAt(100, { value_paisa: 500, qty_base: 0 })).toThrow(DivideByZeroError);
  });

  it("exactness holds past 2^53 in the intermediate — the reason it is BigInt", () => {
    // A recipe explosion multiplies milligram quantities by yields, so the numerator is routinely
    // in the 1e15 range while the answer is a few grams. A double would have dropped bits here.
    const pair = { value_paisa: 999_999_937, qty_base: 1_000_003 };
    expect(valueAt(1_000_003, pair)).toBe(999_999_937);
  });
});

// ── §B · 10-F31 — the basis resolution ─────────────────────────────────────────────────────────

describe("§B · 10-F31 — receipted | reference | none, and exactly one of them", () => {
  const withReference = item({
    item_id: "salt",
    reference_cost: { value_paisa: 6_000, qty_base: KG },
  });
  const withoutReference = item({ item_id: "chicken" });

  it("receipts WIN over a typed reference price, per period", () => {
    // "A receipt overwrites it per period the moment one arrives" — so the reference price is a
    // legitimate FIRST answer rather than a fallback that lingers.
    const resolved = costBasisOf(withReference, null, { value_paisa: 5_000, qty_base: KG });
    expect(resolved.basis).toBe("receipted");
    expect(resolved.pair).toEqual({ value_paisa: 5_000, qty_base: KG });
  });

  it("with no receipts the reference price answers — without it the ramp cannot terminate", () => {
    // Salt bought quarterly never acquires a receipted basis in a weekly period. This is the clause
    // that makes onboarding converge at all.
    expect(costBasisOf(withReference, null, undefined).basis).toBe("reference");
  });

  it("with neither, the item is NOT COSTABLE and every figure containing it is refused", () => {
    const resolved = costBasisOf(withoutReference, null, undefined);
    expect(resolved.basis).toBe("none");
    expect(resolved.pair).toBeNull();
    expect(valueOrNull(500, resolved)).toBeNull();
  });

  it("an opening carried WITHOUT a value disqualifies `receipted` even when receipts exist", () => {
    // Averaging a known purchase value over a quantity that includes an unvalued carry understates
    // the cost of everything in the period — a confidently wrong rate, which is worse than none.
    //
    // ⚠ **THIS TEST PASSED FOR A COMMIT WITHOUT EXERCISING ITS OWN TITLE.** It read
    // `costBasisOf(withReference, null, undefined)` — no opening AND no receipts — so it was the
    // test two above it in different words, and the guard it names (`openingUsable`) was a
    // tautology that a `true` mutant could not kill. The opening below is the case the title
    // describes: a quantity carried out of a period that had no basis, arriving beside a real
    // receipt.
    const resolved = costBasisOf(
      withReference,
      { value_paisa: null, qty_base: 5 * KG, basis: "none" },
      { value_paisa: 340_000, qty_base: 5 * KG },
    );
    expect(resolved.basis).toBe("reference");
    expect(resolved.pair).toEqual({ value_paisa: 6_000, qty_base: KG });
    // THE CONTROL: the SAME receipt with no carried quantity at all is `receipted`. Without it,
    // an implementation that never answers `receipted` would pass.
    expect(costBasisOf(withReference, null, { value_paisa: 340_000, qty_base: 5 * KG }).basis).toBe(
      "receipted",
    );
  });

  it("an opening of ZERO value and ZERO quantity is not a half of the pair, and labels nothing", () => {
    // `10-F31`'s worst-provenance rule is about *"the opening HALF of the pair"*. An opening that
    // is in neither the numerator nor the denominator cannot move the rate, so it does not decide
    // the provenance either — the difference between an onboarding ramp that terminates and one
    // that reads `reference` for ever.
    const empty = { value_paisa: 0, qty_base: 0, basis: "reference" } as const;
    expect(costBasisOf(withReference, empty, { value_paisa: 5_000, qty_base: KG }).basis).toBe(
      "receipted",
    );
    // …and the moment it carries something, it decides again: 1 kg of reference-valued stock.
    const carried = { value_paisa: 6_000, qty_base: KG, basis: "reference" } as const;
    expect(costBasisOf(withReference, carried, { value_paisa: 5_000, qty_base: KG }).basis).toBe(
      "reference",
    );
  });

  it("an explicit ZERO reference price is a basis — 01-F60, one plane over", () => {
    const free = item({ item_id: "garnish", reference_cost: { value_paisa: 0, qty_base: KG } });
    expect(costBasisOf(free, null, undefined).basis).toBe("reference");
    expect(valueOrNull(5_000, costBasisOf(free, null, undefined))).toBe(0);
  });
});

// ── §C · the window, and the zero-quantity receipt line ────────────────────────────────────────

describe("§C · 10-F28 / 10-F31 — the window, and money with no goods on it", () => {
  const period = () => {
    resetIds();
    const events = [
      purchase("p1", [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }], 1_000),
      count("c0", [{ item_id: "chicken", counted: true, qty_base: 10 * KG }], 2_000),
      // A delivery charge: Rs 150 and NO goods.
      purchase(
        "p2",
        [
          { item_id: "chicken", qty_base: 5 * KG, line_total_paisa: 350_000 },
          { item_id: "chicken", qty_base: 0, line_total_paisa: 15_000 },
        ],
        3_000,
        365_000,
      ),
      count("c1", [{ item_id: "chicken", counted: true, qty_base: 15 * KG }], 4_000),
    ];
    const periods = periodsFor(events, LOCATION);
    return { events, periods };
  };

  it("periods are opened by the previous count and closed by the next", () => {
    const { periods } = period();
    expect(periods).toHaveLength(2);
    expect(periods[0]?.opened_after).toBeNull();
    expect(periods[0]?.is_baseline).toBe(true);
    expect(periods[0]?.closed_at).toBe(2_000);
    expect(periods[1]?.opened_after).toBe(2_000);
    expect(periods[1]?.closed_at).toBe(4_000);
  });

  it("the window is half-open at the start, so a boundary fact belongs to exactly one period", () => {
    const { periods } = period();
    // biome-ignore lint/style/noNonNullAssertion: asserted above.
    const [first, second] = [periods[0]!, periods[1]!];
    expect(inWindow(first, 2_000)).toBe(true);
    expect(inWindow(second, 2_000)).toBe(false);
    expect(inWindow(second, 2_001)).toBe(true);
  });

  it("⚠ A ZERO-QUANTITY LINE'S MONEY REACHES THE KHATA AND NOT THE VALUATION", () => {
    // `10-F31`: money spent is money spent (`10-F14`), and the two ledgers answer different
    // questions. Keeping the Rs 150 in the average while dropping its (zero) quantity would inflate
    // the unit cost of everything else on that invoice — which is the mistake with the fewest
    // visible symptoms.
    const { events, periods } = period();
    // biome-ignore lint/style/noNonNullAssertion: asserted above.
    const facts = physicalFacts(events, LOCATION, periods[1]!);
    expect(facts.purchases.get("chicken")).toEqual({ value_paisa: 350_000, qty_base: 5 * KG });
    expect(facts.invoice_total_paisa).toBe(365_000);
  });

  it("the invoice total is what the PAPER says, not a re-derived sum of the lines", () => {
    // A khata that re-derived its own total would disagree with the document an owner is holding.
    resetIds();
    const events = [
      purchase(
        "p1",
        [{ item_id: "chicken", qty_base: 10 * KG, line_total_paisa: 680_000 }],
        1_000,
        // A document-level discount the storekeeper did not itemise.
        650_000,
      ),
      count("c0", [{ item_id: "chicken", counted: true, qty_base: 10 * KG }], 2_000),
    ];
    const periods = periodsFor(events, LOCATION);
    // biome-ignore lint/style/noNonNullAssertion: one period exists.
    expect(physicalFacts(events, LOCATION, periods[0]!).invoice_total_paisa).toBe(650_000);
  });

  it("a purchase OUTSIDE the window contributes nothing to it", () => {
    const { events, periods } = period();
    // biome-ignore lint/style/noNonNullAssertion: asserted above.
    const facts = physicalFacts(events, LOCATION, periods[0]!);
    expect(facts.purchases.get("chicken")).toEqual({ value_paisa: 680_000, qty_base: 10 * KG });
  });
});

// ── §D · the count-id merge, and the boundary a retry does NOT create ──────────────────────────

describe("§D · 10-F28 — one count is one boundary, however many times it is delivered", () => {
  it("a re-appended count at a LATER stamp does not open a second, empty period", () => {
    // `01-F31` mints business keys so a double-tapped submit is ONE act. Two boundaries here would
    // produce an empty period reporting a spurious zero variance on every item.
    resetIds();
    const events = [
      count("c0", [{ item_id: "chicken", counted: true, qty_base: 10 * KG }], 2_000),
      count("c0", [{ item_id: "chicken", counted: true, qty_base: 10 * KG }], 2_500),
    ];
    const periods = periodsFor(events, LOCATION);
    expect(periods).toHaveLength(1);
    // The MINIMUM stamp: "the branch time at which this count was first stated".
    expect(periods[0]?.closed_at).toBe(2_000);
  });

  it("two DIFFERENT counts at one stamp merge into one closing act, not two periods", () => {
    resetIds();
    const events = [
      count(
        "cA",
        [{ item_id: "chicken", area_id: "walk-in", counted: true, qty_base: 4 * KG }],
        2_000,
      ),
      count(
        "cB",
        [{ item_id: "chicken", area_id: "kitchen", counted: true, qty_base: 6 * KG }],
        2_000,
      ),
    ];
    const periods = periodsFor(events, LOCATION);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.observation.count_ids).toEqual(["cA", "cB"]);
  });

  it("a count at ANOTHER location does not open a period here", () => {
    resetIds();
    const events = [count("c0", [{ item_id: "chicken", counted: true, qty_base: 1 }], 2_000)];
    expect(periodsFor(events, "storage-1")).toEqual([]);
  });
});
