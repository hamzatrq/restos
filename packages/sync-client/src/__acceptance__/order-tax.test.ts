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

import {
  addPaisa,
  paisa,
  TAX_OFF,
  type TaxCell,
  type TaxLineSnapshot,
  totalPaisaOrNull,
} from "@restos/domain";
import { describe, expect, it } from "vitest";

import { billedEffectiveFromJsonLines } from "../folds/merge.js";
import { billedTotalPaisa, type ChargeSnapshot, orderChargeSnapshot } from "../order-tax.js";

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

/**
 * `02-F63`'s granularity for every assertion ABOVE §E: **1 paisa, the identity.**
 *
 * The suite's subject up to §E is `01-F82` — that `billed_total` is the tax-inclusive number — and
 * a rounding step in those fixtures would change what they measure. 1 is legal and is the exact
 * identity (`chargePaisaAtGranularity` refuses only 0, and `02-F63` (g)'s floor at a step of 1
 * is the value itself), so every figure below is the same figure
 * this file asserted before R70. **It is deliberately NOT the product's default**, which is 100:
 * `02-F63` (c) records that a default of no rounding is a till asking for a coin that does not
 * exist. §E is where the shipped default and the tens-of-rupees case are asserted.
 */
const NO_ROUNDING = 1;

/** `a + b` on money through the one door, so this suite obeys the law it is asserting. */
const plus = (a: number, b: number): number => addPaisa(paisa(a), paisa(b));

/** `a + b` where `b` may be NEGATIVE — the rounding adjustment. BigInt, never a bare `+`. */
const plusSigned = (a: number, b: number): number => Number(BigInt(a) + BigInt(b));

/** `16-F27`'s cell at a rate whose tax lands OFF the rupee — 16.5 %, R70's own example. */
const EXCLUSIVE_16_5: TaxCell = { posture: "exclusive", rate_bps: 1_650 };

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

/**
 * A sweep rather than one case, because `01-F82`'s sentence is a claim about EVERY order: an
 * empty one, a fully-voided one (`01-F30`'s "nets to zero"), a single line, and the four-line
 * fixture. A single-case assertion here would pass against an implementation that special-cased
 * the fixture's arithmetic.
 *
 * Module-scope so `02-F63`'s §E runs over the SAME fixtures — a second sweep is a second set of
 * cases to keep in step, and the whole point of §E's closing assertion is that these exact orders
 * are unmoved by the rounding at the shipped default.
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

describe("§A 01-F82 — `billed_total` moves under `exclusive` and under nothing else", () => {
  it("under `16-F1`'s default cell it IS `billedEffectiveFromJsonLines`, on every fixture", () => {
    // MUTANT THIS KILLS: a join that charges tax under `none`, or one whose line partition
    // disagrees with the fold's own sum. `16-F1` has tax off by default, so the ordinary
    // Pakistani restaurant this product ships to must read exactly the number it read before this
    // module existed — otherwise every gate in this repo goes red for a feature nobody enabled.
    for (const [what, json] of SWEEP) {
      expect(
        billedTotalPaisa(json, TAX_OFF, NO_ROUNDING),
        `${what}: the default cell moved the bill`,
      ).toBe(billedEffectiveFromJsonLines(json));
    }
  });

  it("`inclusive` does not move it either — the price already contains the tax", () => {
    for (const [what, json] of SWEEP) {
      expect(
        billedTotalPaisa(json, INCLUSIVE_16, NO_ROUNDING),
        `${what}: inclusive moved the bill`,
      ).toBe(billedEffectiveFromJsonLines(json));
    }
  });

  it("`exclusive` moves it by EXACTLY the tax total, on every fixture", () => {
    // MUTANT THIS KILLS: any drift between the total and its own tax component — a receipt whose
    // three printed figures do not close is the defect R39 exists to prevent, and this is that
    // property one layer below the paper.
    for (const [what, json] of SWEEP) {
      const snap = orderChargeSnapshot(json, EXCLUSIVE_16, NO_ROUNDING).tax;
      expect(billedTotalPaisa(json, EXCLUSIVE_16, NO_ROUNDING), `${what}`).toBe(
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
    expect(billedTotalPaisa(ORDER_JSON, NONE_16, NO_ROUNDING)).toBe(DELIVERED_SUBTOTAL);
    expect(orderChargeSnapshot(ORDER_JSON, NONE_16, NO_ROUNDING).tax.tax_total_paisa).toBe(0);
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
    const snap = orderChargeSnapshot(ORDER_JSON, EXCLUSIVE_16, NO_ROUNDING).tax;
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
      expect(billedTotalPaisa(json, c, NO_ROUNDING), `posture ${c.posture}`).toBe(0);
      expect(
        orderChargeSnapshot(json, c, NO_ROUNDING).tax.tax_total_paisa,
        `posture ${c.posture}`,
      ).toBe(0);
    }
  });

  it("16-F5: the snapshot is keyed by the fold's OWN line ids, one entry per cell", () => {
    // MUTANT THIS KILLS: a join that invents ids (an index, a uuid) — the snapshot would then be
    // unreconcilable against the order it came from, and `16-F5`'s per-line rule would be
    // unverifiable by anyone holding both.
    const snap = orderChargeSnapshot(ORDER_JSON, EXCLUSIVE_16, NO_ROUNDING).tax;
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
      expect(
        orderChargeSnapshot(reversed, c, NO_ROUNDING).tax.total_paisa,
        `posture ${c.posture}`,
      ).toBe(orderChargeSnapshot(forward, c, NO_ROUNDING).tax.total_paisa);
      expect(
        orderChargeSnapshot(reversed, c, NO_ROUNDING).tax.tax_total_paisa,
        `posture ${c.posture}`,
      ).toBe(orderChargeSnapshot(forward, c, NO_ROUNDING).tax.tax_total_paisa);
    }
  });

  it("it reads no clock and holds no state — the same input twice is deeply equal", () => {
    expect(orderChargeSnapshot(ORDER_JSON, EXCLUSIVE_16, NO_ROUNDING).tax).toEqual(
      orderChargeSnapshot(ORDER_JSON, EXCLUSIVE_16, NO_ROUNDING).tax,
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
    const snap = orderChargeSnapshot(json, INCLUSIVE_16, NO_ROUNDING).tax;
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
    const snap = orderChargeSnapshot(json, EXCLUSIVE_16, NO_ROUNDING).tax;
    expect(snap.lines.map((l) => l.tax_paisa)).toEqual([720, 720, 720]);
    expect(snap.total_paisa).toBe(15_660);
  });

  it("the closing identity holds under all three postures: subtotal + tax = total", () => {
    for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16]) {
      const snap = orderChargeSnapshot(ORDER_JSON, c, NO_ROUNDING).tax;
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `02-F63` (founder ruling R70): THE CHARGE IS ROUNDED, INSIDE `billed_total`.
//
// `01-F82`'s identity is amended here rather than replaced: `billed_total` is still *what the
// customer owes, tax included*, and the last step of computing it is now a rounding rather than a
// sum. The rounding lives at THIS join and not in `packages/domain`'s `taxSnapshot`, because the
// granularity is not a tax key — it binds card and cash alike, it fires under posture `none`, and
// a `TaxCell` carrying it would make every reader of `16-F5`'s per-line snapshot supply one.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `02-F63` (c)'s shipped default: Rs 1. */
const RUPEE = 100;
/** R70's other named case: *"some restaurants round to 10s"*. */
const TEN_RUPEES = 1_000;

describe("§E 02-F63 — the rounded charge, and the row that makes the paper close", () => {
  it("`billed_total` is the ROUNDED total, and `billedTotalPaisa` is that one number", () => {
    // ⚠ **THE DEFECT R70 WAS RULED ON.** 3 × Rs 45.70 exclusive at 16.5 % gives a pre-rounding
    // total of 15,966 paisa — Rs 159.66, a figure no drawer in Pakistan can pay. The charge is
    // Rs 160.00. MUTANT THIS KILLS: no rounding at all; and `billedTotalPaisa` reading the TAX
    // total rather than the charge, which is two answers to *what does the customer owe*.
    const json = linesOf({ a: cell(3, 4_570) });
    const snap = orderChargeSnapshot(json, EXCLUSIVE_16_5, RUPEE);
    expect(snap.tax.subtotal_paisa).toBe(13_710);
    expect(snap.tax.tax_total_paisa).toBe(2_262);
    expect(snap.tax.total_paisa, "the TAX snapshot must keep its own exact total").toBe(15_972);
    expect(snap.charge_total_paisa).toBe(16_000);
    expect(billedTotalPaisa(json, EXCLUSIVE_16_5, RUPEE)).toBe(snap.charge_total_paisa);
  });

  it("the three figures CLOSE: subtotal + tax + rounding = the charge, on every fixture", () => {
    // `02-F63` (b): the rounding row is DERIVED and is the only thing that makes the paper add up.
    // MUTANT THIS KILLS: a `rounding_paisa` computed from anything but these two numbers — a
    // constant, a magnitude with no sign, or the residue of a per-line rounding.
    for (const step of [1, RUPEE, TEN_RUPEES]) {
      for (const [what, json] of SWEEP) {
        for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16, EXCLUSIVE_16_5]) {
          const snap = orderChargeSnapshot(json, c, step);
          expect(
            plusSigned(snap.tax.total_paisa, snap.rounding_paisa),
            `${what} @ ${step} posture ${c.posture}: the rows do not close`,
          ).toBe(snap.charge_total_paisa);
          // BigInt, because `charge % step` is a bare `%` on a money-named member and the
          // `DEC-MONEY-005` lint rule catches it — correctly, and this suite obeys the law it is
          // asserting rather than suppressing it.
          expect(
            Number(BigInt(snap.charge_total_paisa) % BigInt(step)),
            `${what} @ ${step}: not on the step`,
          ).toBe(0);
        }
      }
    }
  });

  it("⚠ the rounding is on the ORDER TOTAL and NEVER per line", () => {
    // ⚠ **THE MUTANT THIS SECTION EXISTS FOR**, named in `02-F63` (e) and forbidden one layer up
    // by `16-F5`: rounding each line and summing. Three lines of Rs 45.70 round to Rs 46.00 each
    // = Rs 138.00, against Rs 137.00 for the order — **Re 1 of the customer's money**, and the
    // gap grows with the line count, so a two-line fixture would barely show it.
    const json = linesOf({ a: cell(1, 4_570), b: cell(1, 4_570), c: cell(1, 4_570) });
    expect(billedTotalPaisa(json, TAX_OFF, RUPEE), "per-line rounding would answer 13,800").toBe(
      13_700,
    );
  });

  it("02-F63 (a): it binds under posture `none` — this is not a tax rule", () => {
    // R70 binds card as firmly as cash. MUTANT THIS KILLS: rounding applied only when a posture is
    // configured, which passes every other assertion in this section.
    const json = linesOf({ a: cell(1, 76_400) }); // Rs 764.00, no tax anywhere
    expect(billedTotalPaisa(json, TAX_OFF, TEN_RUPEES), "Rs 764 → Rs 760").toBe(76_000);
    expect(orderChargeSnapshot(json, TAX_OFF, TEN_RUPEES).rounding_paisa).toBe(-400);
  });

  it("02-F63 (d): the HALF goes UP at this join too, not only in `domain`", () => {
    // ⚠ **ADDED BECAUSE A MUTANT SURVIVED HERE.** The half-DOWN mutant (`2r > g` instead of `>=`)
    // was killed by `packages/domain`'s own oracle and by `apps/pos-electron`, and by NOTHING in
    // this file — because no fixture above lands on an exact half. The policy is the one thing a
    // reader of this join most needs to be able to trust, so it is asserted where the join is.
    const json = linesOf({ a: cell(1, 4_550) }); // Rs 45.50 — the exact half at the rupee
    expect(billedTotalPaisa(json, TAX_OFF, RUPEE), "half-DOWN would answer 4,500").toBe(4_600);
    const tens = linesOf({ a: cell(1, 4_500) }); // Rs 45.00 — the exact half at ten rupees
    expect(billedTotalPaisa(tens, TAX_OFF, TEN_RUPEES), "half-DOWN would answer 4,000").toBe(5_000);
  });

  it("the step is READ — the same order at three granularities is three charges", () => {
    // MUTANT THIS KILLS: a hardcoded step. The parameter is REQUIRED so the compiler makes every
    // reader supply one; this is what proves the supplied value reaches the arithmetic.
    const json = linesOf({ a: cell(1, 45_070) }); // Rs 450.70
    expect(billedTotalPaisa(json, TAX_OFF, 1)).toBe(45_070);
    expect(billedTotalPaisa(json, TAX_OFF, RUPEE)).toBe(45_100);
    expect(billedTotalPaisa(json, TAX_OFF, TEN_RUPEES)).toBe(45_000);
  });

  it("the rounding is SIGNED, and both directions occur on ordinary bills", () => {
    // `Paisa` is non-negative because an append-only ledger cannot subtract from history, so a
    // rounding-DOWN adjustment has no branded representation — which is why `ChargeSnapshot`
    // carries a plain signed number and `invariants.ts`'s conservation residual does the same.
    // MUTANT THIS KILLS: `subPaisa`, which THROWS on every rounding-down order.
    expect(orderChargeSnapshot(linesOf({ a: cell(1, 45_007) }), TAX_OFF, RUPEE)).toMatchObject({
      rounding_paisa: -7,
      charge_total_paisa: 45_000,
    });
    expect(orderChargeSnapshot(linesOf({ a: cell(1, 45_093) }), TAX_OFF, RUPEE)).toMatchObject({
      rounding_paisa: 7,
      charge_total_paisa: 45_100,
    });
  });

  it("01-F34: key order in `json_lines` cannot move the charge OR the rounding OR a LINE", () => {
    // Standing law 1, extended to the new figures. The rounding reads exactly one number — the
    // snapshot total — and that total is an exact integer sum over per-line figures, so it is
    // order-invariant and so is any function of it. MUTANT THIS KILLS: rounding the total and then
    // distributing the residue across the lines, which is the shape this design invites.
    //
    // ⚠ **THIS TEST NAMED THAT MUTANT AND DID NOT KILL IT** (adversarial review of `8ef7cf1`).
    // `tax.lines[0].line_total_paisa += rounding_paisa` — `02-F63` (e)'s forbidden implementation,
    // verbatim — SURVIVED the whole repo: 0 kills in `sync-client`'s 942 and 0 in
    // `apps/pos-electron`'s 1300. The reason is the paragraph that used to stand here: it compared
    // only ORDER-LEVEL figures, on the argument that `tax.lines` "legitimately reverses with the
    // map" and that deep equality would pin the array ORDER. Both halves were true and the
    // conclusion did not follow — the array order is not the claim, the VALUES are, and a mutant
    // that moves a per-line value with `Object.entries` order is invisible to a total. It is the
    // round-3 law's own failure shape: a mechanism built correctly and never aimed at the case
    // that matters.
    //
    // So the lines are compared **keyed by `line_id`**, which is order-blind by construction and
    // still pins every money value on every line.
    const forward = ORDER_JSON;
    const reversed = linesOf(Object.fromEntries(Object.entries(ORDER).reverse()));
    const byLineId = (snap: ChargeSnapshot): Record<string, TaxLineSnapshot> =>
      Object.fromEntries(snap.tax.lines.map((line) => [line.line_id, line]));
    for (const step of [RUPEE, TEN_RUPEES]) {
      for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16]) {
        const a = orderChargeSnapshot(forward, c, step);
        const b = orderChargeSnapshot(reversed, c, step);
        expect(b.charge_total_paisa, `${c.posture} @ ${step}: the charge moved`).toBe(
          a.charge_total_paisa,
        );
        expect(b.rounding_paisa, `${c.posture} @ ${step}: the rounding moved`).toBe(
          a.rounding_paisa,
        );
        expect(b.tax.total_paisa, `${c.posture} @ ${step}`).toBe(a.tax.total_paisa);
        expect(b.tax.subtotal_paisa, `${c.posture} @ ${step}`).toBe(a.tax.subtotal_paisa);
        expect(b.tax.tax_total_paisa, `${c.posture} @ ${step}`).toBe(a.tax.tax_total_paisa);
        // The same four lines, same ids, same three money fields each — and `toEqual` on the maps
        // rather than a loop, so a line that appears in one snapshot and not the other fails too.
        expect(
          byLineId(b),
          `${c.posture} @ ${step}: a per-LINE figure moved with key order`,
        ).toEqual(byLineId(a));
      }
    }
  });

  it("16-F1's default cell at the shipped step leaves a whole-rupee order untouched", () => {
    // The regression guard for every restaurant in the corpus's own design case: `14-F29` prices
    // are whole rupees, so with tax off and the Rs 1 step nothing moves and no rounding row can
    // print. This is the property that makes `02-F63` checkable — the change is invisible exactly
    // where it should be.
    // ⚠ Four of the five sweep fixtures are `14-F29`-shaped (whole rupees) and one is NOT — the
    // "awkward remainder" row is 7 × Rs 33.31 = Rs 233.17, put there by the `01-F82` round
    // precisely to be a figure no menu can produce. It is kept and named rather than filtered out,
    // because a sweep that quietly dropped it would be asserting the property on a fixture set
    // chosen to satisfy it.
    for (const [what, json] of SWEEP) {
      const snap = orderChargeSnapshot(json, TAX_OFF, RUPEE);
      const untaxed = billedEffectiveFromJsonLines(json);
      if (untaxed % RUPEE === 0) {
        expect(snap.charge_total_paisa, `${what}`).toBe(untaxed);
        expect(snap.rounding_paisa, `${what}: a rounding row would print`).toBe(0);
      } else {
        expect(snap.rounding_paisa, `${what}: a sub-rupee total did NOT move`).not.toBe(0);
        expect(plusSigned(untaxed, snap.rounding_paisa), `${what}`).toBe(snap.charge_total_paisa);
      }
    }
    // Named, so the branch above cannot go vacuous: this is the one fixture that moves, and it
    // moves DOWN by 17 paisa (Rs 233.17 → Rs 233.00).
    expect(orderChargeSnapshot(linesOf({ a: cell(7, 3_331) }), TAX_OFF, RUPEE).rounding_paisa).toBe(
      -17,
    );
  });

  it("a step of ZERO is refused rather than producing a NaN charge", () => {
    expect(() => billedTotalPaisa(ORDER_JSON, TAX_OFF, 0)).toThrow(RangeError);
  });

  it("02-F63 (g): a NON-EMPTY order can never present as an empty one", () => {
    // ⚠ **THE INVARIANT THE (g) AMENDMENT DEFENDS, at this join rather than in `domain`.**
    // `billed_total == 0` is a **sentinel** meaning *this order has nothing billable*, and two
    // shipping modules narrow on it and return nothing (`settlement-guard.ts`,
    // `settlement-closer.ts`) because closing there would *"settle a sale that has not happened"*
    // (`01-F17`). Adversarial review of `8ef7cf1`: at `charge_rounding_paisa = 1000`,
    // `billedTotalPaisa` answered **0** for an order with food on it — so the sentinel became
    // reachable from a non-empty order and every consequence is permanent under `01-F1`: the cover
    // test passes at a tender of zero, `order.settlement_closed` is never emitted so the order
    // stays open for ever and never reaches `01-F63`'s attestation, the main-process
    // double-settlement refusal is off, and the receipt prints `Total Rs 0`.
    //
    // ⚠ The fixture is an arithmetic boundary and **not a claim about prices** — founder, August
    // 2026: *"nothing costs 4rs … even the basic transparent plastic box in which you deliver food
    // costs around 15-20rs."* The floor is not a trade against cheap items, which is why it binds
    // at every granularity.
    //
    // MUTANT THIS KILLS: the pre-(g) tree. Asserted HERE and not only in `packages/domain` because
    // this is the function every one of the five readers of `billed_total` actually calls, and a
    // floor applied in the primitive but bypassed at the join would be invisible one package over.
    const under = linesOf({ a: cell(1, 400) }); // below half of a Rs 10 step
    expect(billedTotalPaisa(under, TAX_OFF, TEN_RUPEES), "below half a step").toBe(1_000);
    const snap = orderChargeSnapshot(under, TAX_OFF, TEN_RUPEES);
    // `02-F63` (b): the derived row still closes, and it is the one that pays for the floor.
    expect(snap.rounding_paisa, "the receipt would print `Rounded up Rs 6`").toBe(600);
    expect(plusSigned(snap.tax.total_paisa, snap.rounding_paisa)).toBe(snap.charge_total_paisa);
    // The floor is not a tax rule either (`02-F63` (a)) — it fires under every posture.
    for (const c of [TAX_OFF, INCLUSIVE_16, EXCLUSIVE_16, EXCLUSIVE_16_5]) {
      expect(billedTotalPaisa(under, c, TEN_RUPEES), `posture ${c.posture}`).toBe(1_000);
    }
    // ⚠ **AND THE SENTINEL'S TRUE CASE STILL ANSWERS ZERO** — the over-correction, which would
    // charge one step for an order with nothing on it and for `01-F30`'s fully-voided order that
    // "nets to zero". That second fixture is in `SWEEP` and it is the one that matters: a voided
    // order reaching `billed == 0` is `01-F30`'s own rule, not this amendment's business.
    for (const [what, json] of SWEEP) {
      const out = billedTotalPaisa(json, TAX_OFF, TEN_RUPEES);
      expect(out === 0, `${what}: charged ${out}`).toBe(billedEffectiveFromJsonLines(json) === 0);
    }
  });
});
