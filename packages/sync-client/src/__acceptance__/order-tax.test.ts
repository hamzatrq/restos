// ACCEPTANCE TESTS — `01-F82`/`16-F31` (founder ruling R54): `billed_total` INCLUDES TAX, and the
// join that makes it one number is `src/order-tax.ts`.
//
// **`packages/sync-client` is a PROTECTED path (commandment 10)** — this file adds no production
// code and changes no signature, and still wants an adversarial round on that basis. Written
// alongside the implementation under `plans/v0.md`'s R66, which lifts `24 §3`'s separate-oracle
// rule for v0; the round-3 law is not lifted, so every section below names the mutant it kills and
// the mutation matrix is reported with the change.
//
// ── THE FRs, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ────────────────────────────────────────
//
//   01-F82   "`billed_total` stops being *the sum of line prices* and becomes **what the customer
//            owes, tax included** — precisely `16-F5`'s snapshot total (`taxSnapshot`'s
//            `total_paisa`), and that identity holds under **all three** of `16-F2`'s postures."
//            "**The change is ONE POSTURE WIDE, and saying so is what keeps it checkable.**"
//   16-F31   the doc-16 half of the same ruling; a receipt's *Total* row is that number.
//   16-F5    tax is computed **per line** and snapshotted (`01-F18`: never re-derived).
//   01-F30   billed derives from DELIVERED lines, exited lines excluded — "a fully-voided order
//            nets to zero".
//   01-F34   folds read NO ordering metadata (standing law 1).
//   26 §8    fold logic is never reimplemented outside `packages/sync-client`.
//   00 §6    integer paisas; rates as integer BASIS POINTS.
//
// ── WHAT THIS FILE DOES NOT ASSERT, AND WHO OWNS IT ───────────────────────────────────────────
//
//  - **The posture arithmetic itself.** `taxSnapshot`'s three arms, the half-up rounding and the
//    `gross × bps / (10000 + bps)` inclusive extraction are `packages/domain`'s and are pinned in
//    `tax-posture.test.ts`. §D below is the one place this file touches the extraction, and it
//    asserts only that the JOIN did not route an inclusive cell through the exclusive door — the
//    single most likely wrong implementation of the word, and one this repo has already met.
//  - **Where the cell comes from.** `16-F27` makes it layer-2 org configuration and `01-F87` rules
//    its carrier; neither is built (`plans/v0.md` gap 3). A resolved cell arrives here.

import { addPaisa, paisa, TAX_OFF, type TaxCell, totalPaisaOrNull } from "@restos/domain";
import { describe, expect, it } from "vitest";

import { billedEffectiveFromJsonLines } from "../folds/merge.js";
import { billedTotalPaisa, orderTaxSnapshot } from "../order-tax.js";

// ── fixtures, in the shape `merge.ts` projects into `json_lines` ──────────────────────────────

type Cell = {
  item_id: string;
  qty: number;
  unit_price_paisa: number;
  states: string[];
};

const cell = (qty: number, unit_price_paisa: number, ...states: string[]): Cell => ({
  item_id: "item-karahi",
  qty,
  unit_price_paisa,
  states: states.length === 0 ? ["placed"] : states,
});

const linesOf = (map: Record<string, Cell>): string => JSON.stringify(map);

/** `a + b` on money through the one door, so this suite obeys the law it is asserting. */
const plus = (a: number, b: number): number => addPaisa(paisa(a), paisa(b));

/** BigInt-exact Σ, for the same reason (`DEC-MONEY-005`, standing law 3). */
const sumOf = (values: readonly number[]): number | null => totalPaisaOrNull(values);

/**
 * Three delivered lines and one VOIDED one — `01-F30`'s exited-line rule, which is the whole
 * reason this join reads `billedLinePaisa` rather than multiplying.
 *
 * 3 × 4,500 + 1 × 4,500 + 5 × 4,500 = 40,500 paisa delivered; the voided line is 20 × 4,500 =
 * 90,000 paisa of `qty × unit_price` that must contribute **nothing**. The two numbers are wildly
 * apart on purpose: a mutant that multiplied would not be off by a rounding step, it would be off
 * by more than the bill.
 */
const ORDER: Record<string, Cell> = {
  "line-roti": cell(3, 4_500),
  "line-chai": cell(1, 4_500),
  "line-raita": cell(5, 4_500),
  "line-voided": cell(20, 4_500, "voided"),
};
const ORDER_JSON = linesOf(ORDER);
const DELIVERED_SUBTOTAL = 40_500;

const EXCLUSIVE_16: TaxCell = { posture: "exclusive", rate_bps: 1_600 };
const INCLUSIVE_16: TaxCell = { posture: "inclusive", rate_bps: 1_600 };
const NONE_16: TaxCell = { posture: "none", rate_bps: 1_600 };

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F82: THE CHANGE IS ONE POSTURE WIDE. The property that makes the amendment checkable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F82 — `billed_total` moves under `exclusive` and under nothing else", () => {
  /**
   * A sweep rather than one case, because `01-F82`'s sentence is a claim about EVERY order: an
   * empty one, a fully-voided one (`01-F30`'s "nets to zero"), a single line, and the four-line
   * fixture. A single-case assertion here would pass against an implementation that special-cased
   * the fixture's arithmetic.
   */
  const SWEEP: readonly (readonly [string, string])[] = [
    ["an empty order", linesOf({})],
    [
      "a fully-voided order (01-F30)",
      linesOf({ a: cell(2, 9_900, "voided"), b: cell(1, 500, "cancelled") }),
    ],
    ["one line", linesOf({ a: cell(1, 45_000) })],
    ["the four-line fixture", ORDER_JSON],
    ["a line with an awkward remainder", linesOf({ a: cell(7, 3_331) })],
  ];

  it("under `16-F1`'s default cell it IS `billedEffectiveFromJsonLines`, on every fixture", () => {
    // MUTANT THIS KILLS: a join that charges tax under `none`, or one whose line partition
    // disagrees with the fold's own sum. `16-F1` has tax off by default, so the ordinary
    // Pakistani restaurant this product ships to must read exactly the number it read before this
    // module existed — otherwise every gate in this repo goes red for a feature nobody enabled.
    for (const [what, json] of SWEEP) {
      expect(billedTotalPaisa(json, TAX_OFF), `${what}: the default cell moved the bill`).toBe(
        billedEffectiveFromJsonLines(json),
      );
    }
  });

  it("`inclusive` does not move it either — the price already contains the tax", () => {
    for (const [what, json] of SWEEP) {
      expect(billedTotalPaisa(json, INCLUSIVE_16), `${what}: inclusive moved the bill`).toBe(
        billedEffectiveFromJsonLines(json),
      );
    }
  });

  it("`exclusive` moves it by EXACTLY the tax total, on every fixture", () => {
    // MUTANT THIS KILLS: any drift between the total and its own tax component — a receipt whose
    // three printed figures do not close is the defect R39 exists to prevent, and this is that
    // property one layer below the paper.
    for (const [what, json] of SWEEP) {
      const snap = orderTaxSnapshot(json, EXCLUSIVE_16);
      expect(billedTotalPaisa(json, EXCLUSIVE_16), `${what}`).toBe(
        plus(billedEffectiveFromJsonLines(json), snap.tax_total_paisa),
      );
      expect(snap.subtotal_paisa, `${what}: the pre-tax figure is not the fold's`).toBe(
        billedEffectiveFromJsonLines(json),
      );
    }
  });

  it("a posture with a rate configured but switched OFF charges nothing", () => {
    // `16-F1`: an off posture must not let a configured rate leak through. The cell carries
    // 1600 bps and the posture is `none`.
    expect(billedTotalPaisa(ORDER_JSON, NONE_16)).toBe(DELIVERED_SUBTOTAL);
    expect(orderTaxSnapshot(ORDER_JSON, NONE_16).tax_total_paisa).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 01-F30 / 26 §8: THE PER-LINE BASE IS THE FOLD'S, NOT A MULTIPLICATION.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F30/26 §8 — a VOIDED line is taxed at zero and still appears", () => {
  it("the voided line contributes 0 tax while `qty × unit_price` would be 90,000", () => {
    // ⚠ **THE MUTANT THIS EXISTS FOR**, named in `packages/domain/src/tax.ts`'s own header: a join
    // that computed `qty × unit_price_paisa` here would tax a line that contributes nothing to the
    // bill. Under `exclusive` at 16 % that is Rs 144 of tax on food the customer never received,
    // permanent under `01-F1`. The fixture's voided line is deliberately the LARGEST.
    const snap = orderTaxSnapshot(ORDER_JSON, EXCLUSIVE_16);
    const voided = snap.lines.find((l) => l.line_id === "line-voided");
    expect(
      voided,
      "the voided line vanished — a receipt that drops it cannot be audited",
    ).toBeDefined();
    expect(voided?.taxable_base_paisa).toBe(0);
    expect(voided?.tax_paisa).toBe(0);
    expect(voided?.line_total_paisa).toBe(0);
    expect(snap.subtotal_paisa).toBe(DELIVERED_SUBTOTAL);
  });

  it("a fully-voided order nets to zero under all three postures (01-F30)", () => {
    const json = linesOf({ a: cell(2, 9_900, "voided"), b: cell(1, 500, "cancelled") });
    for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16]) {
      expect(billedTotalPaisa(json, c), `posture ${c.posture}`).toBe(0);
      expect(orderTaxSnapshot(json, c).tax_total_paisa, `posture ${c.posture}`).toBe(0);
    }
  });

  it("16-F5: the snapshot is keyed by the fold's OWN line ids, one entry per cell", () => {
    // MUTANT THIS KILLS: a join that invents ids (an index, a uuid) — the snapshot would then be
    // unreconcilable against the order it came from, and `16-F5`'s per-line rule would be
    // unverifiable by anyone holding both.
    const snap = orderTaxSnapshot(ORDER_JSON, EXCLUSIVE_16);
    expect(snap.lines.map((l) => l.line_id).sort()).toEqual(Object.keys(ORDER).sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 01-F34 (standing law 1): the answer depends on the delivered SET, not on any order.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F34 — key order in `json_lines` cannot move a money figure", () => {
  it("reversing the cell map changes NOTHING under every posture", () => {
    // MUTANT THIS KILLS: the implementation this shape invites — compute the ORDER tax and
    // distribute the remainder across lines — which makes a projected MONEY value depend on the
    // order the cells happen to be serialised in. That is a live law-1 break through entirely
    // schema-valid payloads, and it is invisible to any convergence test that permutes EVENTS
    // rather than the projected map.
    const forward = ORDER_JSON;
    const reversed = linesOf(Object.fromEntries(Object.entries(ORDER).reverse()));
    for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16]) {
      expect(orderTaxSnapshot(reversed, c).total_paisa, `posture ${c.posture}`).toBe(
        orderTaxSnapshot(forward, c).total_paisa,
      );
      expect(orderTaxSnapshot(reversed, c).tax_total_paisa, `posture ${c.posture}`).toBe(
        orderTaxSnapshot(forward, c).tax_total_paisa,
      );
    }
  });

  it("it reads no clock and holds no state — the same input twice is deeply equal", () => {
    expect(orderTaxSnapshot(ORDER_JSON, EXCLUSIVE_16)).toEqual(
      orderTaxSnapshot(ORDER_JSON, EXCLUSIVE_16),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE INCLUSIVE DOOR. The one arithmetic claim this file makes, and it is the named hazard.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 16-F2 — an `inclusive` cell is EXTRACTED, never charged through the exclusive door", () => {
  it("three Rs 45 lines at 16 % carve out 621 each, not 720", () => {
    // ⚠ **THE SINGLE MOST LIKELY WRONG IMPLEMENTATION OF THE WORD**, and this repo has met it:
    // `gross × bps / 10000` applies the rate on top of a price that already carries it and
    // overcharges every inclusive customer by the rate, permanently under `01-F1`. The correct
    // door is `gross × bps / (10000 + bps)` — 4500 × 1600 / 11600 = 620.69 → 621 half-up, against
    // 720 for the wrong one. Asserted HERE and not only in `packages/domain` because the join is
    // where a posture could be routed to the wrong arm without any arithmetic changing.
    const json = linesOf({ a: cell(1, 4_500), b: cell(1, 4_500), c: cell(1, 4_500) });
    const snap = orderTaxSnapshot(json, INCLUSIVE_16);
    expect(snap.lines.map((l) => l.tax_paisa)).toEqual([621, 621, 621]);
    expect(snap.tax_total_paisa).toBe(1_863);
    // The gross is untouched and the base is what is left — `16-F31`: inclusive carves out of
    // prices already typed, so `billed_total` does not move.
    expect(snap.total_paisa).toBe(13_500);
    expect(snap.subtotal_paisa).toBe(11_637);
  });

  it("CONTROL — the same lines under `exclusive` at the same rate give 720 each", () => {
    // The negative control that makes the row above mean something: the two doors are genuinely
    // different numbers on identical input, so an implementation collapsing them cannot pass both.
    const json = linesOf({ a: cell(1, 4_500), b: cell(1, 4_500), c: cell(1, 4_500) });
    const snap = orderTaxSnapshot(json, EXCLUSIVE_16);
    expect(snap.lines.map((l) => l.tax_paisa)).toEqual([720, 720, 720]);
    expect(snap.total_paisa).toBe(15_660);
  });

  it("the closing identity holds under all three postures: subtotal + tax = total", () => {
    for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16]) {
      const snap = orderTaxSnapshot(ORDER_JSON, c);
      expect(plus(snap.subtotal_paisa, snap.tax_total_paisa), `posture ${c.posture}`).toBe(
        snap.total_paisa,
      );
      expect(
        sumOf(snap.lines.map((l) => l.line_total_paisa)),
        `posture ${c.posture}: Σ line totals disagrees with the order total`,
      ).toBe(snap.total_paisa);
    }
  });
});
