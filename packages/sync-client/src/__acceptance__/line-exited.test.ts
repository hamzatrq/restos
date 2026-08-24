// ACCEPTANCE TESTS — `01-F30`'s "exited lines excluded", exported as a PREDICATE.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored by the session that extracted
// `lineExited`, which is NOT the `24 §3` split. `20 §4.3` as amended by **R66** tiers the
// separation rule by path; this extracts an existing guard and adds no arithmetic. `merge.ts` is a
// `20 §4.4` protected path, so an adversarial review in a separate context is owed on the diff
// regardless of what these assertions say. The mitigation here is the round-3 law (`L10`): every
// assertion was mutation-checked against a single-branch mutant, with a NEGATIVE CONTROL, and the
// matrix is in the session report.
//
// ── WHY THE PREDICATE EXISTS, MEASURED RATHER THAN ARGUED ───────────────────────────────────────
//
// The exit test was the first line of `billedCellPaisa` and lived nowhere else, so the only
// question a host app could ask about an exit was *how much is this line worth* — and
// `billedLinePaisa` answers that with a NUMBER, which collapses **exited**, **free** (`01-F60`'s
// explicit zero) and **zero quantity** onto one `0`. Two shipping documents read that zero as
// their exit test and neither could tell the three apart: `apps/pos-electron`'s KOT walk had no
// exit test at all and cooked a voided naan, and the receipt's filter short-circuited on price and
// printed a VOIDED line priced at zero on a customer's copy.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   01 §4    `voided` and `cancelled` are the two canonical EXIT states of an order line.
//   01-F30   "billed derives from delivered lines, **exited lines excluded** — a fully-voided
//            order nets to zero."
//   01-F31   a contested set is retained whole and no fold picks a winner.
//   01-F34   a projected value reads no ordering metadata, no clock and no envelope id.
//   01-F35   terminal line states.
//   01-F60   price 0 is EXPLICIT, so that *free* is distinguishable from *forgotten*.
//   02-F45   one fact, one source.
//   26 §8    fold logic is never reimplemented outside this package.

import { describe, expect, it } from "vitest";
import { type BilledLineCell, billedLinePaisa, lineExited } from "../folds/merge.js";

const cell = (states: string[], over: Partial<BilledLineCell> = {}): BilledLineCell => ({
  item_id: "i-naan",
  qty: 1,
  unit_price_paisa: 6_000,
  states,
  ...over,
});

describe("01-F30/01 §4 — which single states are an EXIT", () => {
  it("`voided` and `cancelled` are exits", () => {
    expect(lineExited(cell(["voided"]))).toBe(true);
    expect(lineExited(cell(["cancelled"]))).toBe(true);
  });

  it("no other single state is — including every terminal one that is not an exit", () => {
    // The vocabulary is `01 §4`'s and this predicate may not widen it. `served` and `delivered`
    // are TERMINAL and the customer is charged for both; reading "terminal" as "exited" would take
    // every completed dish off the bill and off the receipt.
    for (const state of ["placed", "confirmed", "in_prep", "ready", "picked_up", "served"]) {
      expect(lineExited(cell([state])), `${state} is not an exit`).toBe(false);
    }
  });

  it("an EMPTY state set is not an exit — absence is not a decision", () => {
    // A line with no delivered edge has not left the order; it has not moved at all. Reading the
    // empty set as an exit would take a just-added line off its own chit.
    expect(lineExited(cell([]))).toBe(false);
  });
});

describe("01-F31 — a CONTESTED set is not a decided exit", () => {
  it("`voided` beside another terminal head is NOT reported as exited", () => {
    // Two terminal heads mean two devices disagreed and the fold retained both rather than
    // picking. `billedCellPaisa` sends that case to `CONTESTED_LINE_BILLABLE`, a money POLICY, and
    // this predicate deliberately says nothing about it: a cook makes the dish or does not, and no
    // FR turns that on a billing switch. Answering `true` here would let one device's void take a
    // dish off the paper while the money rule says it is still billable.
    expect(lineExited(cell(["served", "voided"]))).toBe(false);
    expect(lineExited(cell(["voided", "cancelled"]))).toBe(false);
  });
});

describe("02-F45 — the predicate and the money agree, because the money reads the predicate", () => {
  it("every exit contributes ZERO to the bill", () => {
    expect(billedLinePaisa(cell(["voided"]))).toBe(0);
    expect(billedLinePaisa(cell(["cancelled"]))).toBe(0);
  });

  it("01-F60: a FREE line answers zero too — which is why the number cannot be the exit test", () => {
    // THE MEASUREMENT THE WHOLE EXTRACTION RESTS ON. These two cells are the same `0` and opposite
    // facts: one line left the order, the other is being given away deliberately. A caller that
    // derived "exited" from `billedLinePaisa(cell) === 0` cannot separate them, and both shipping
    // documents did exactly that.
    const free = cell(["confirmed"], { unit_price_paisa: 0 });
    const exited = cell(["voided"]);
    expect(billedLinePaisa(free)).toBe(billedLinePaisa(exited));
    expect(lineExited(free)).toBe(false);
    expect(lineExited(exited)).toBe(true);
  });

  it("a line with zero QUANTITY is the third fact wearing the same zero", () => {
    const none = cell(["confirmed"], { qty: 0 });
    expect(billedLinePaisa(none)).toBe(0);
    expect(lineExited(none)).toBe(false);
  });

  it("a VOIDED line priced at zero is an exit — the case the price arm short-circuited past", () => {
    expect(lineExited(cell(["voided"], { unit_price_paisa: 0 }))).toBe(true);
  });
});

describe("01-F34 — the predicate reads nothing but the cell's own states", () => {
  it("price, quantity, item and notes do not move the answer", () => {
    // No ordering metadata, no clock, no envelope id, no reading-device state — and nothing else
    // on the cell either, which is what makes the parameter `Pick<BilledLineCell, "states">`
    // rather than the whole cell (`03-F32`: the KOT's data model has no price in it by rule, so a
    // signature demanding one would force its only caller to fabricate a zero).
    const base = ["voided"];
    for (const over of [
      { unit_price_paisa: 0 },
      { unit_price_paisa: 99_999_999 },
      { qty: 0 },
      { qty: 500 },
      { item_id: "something-else" },
      { notes: ["no chilli"] },
    ] satisfies Partial<BilledLineCell>[]) {
      expect(lineExited(cell(base, over)), JSON.stringify(over)).toBe(true);
    }
  });

  it("the argument may carry `states` alone", () => {
    expect(lineExited({ states: ["voided"] })).toBe(true);
    expect(lineExited({ states: ["confirmed"] })).toBe(false);
  });
});
