// ACCEPTANCE TESTS — `02-F63` (founder ruling R70): the receipt's rows CLOSE, and a money token
// tells the truth about its paisa.
//
// **`packages/escpos` is a PROTECTED path (commandment 10) and this is MONEY tier.** Written
// alongside the implementation under `plans/v0.md`'s R66, which lifts `24 §3`'s separate-oracle
// rule for v0 and replaces it with a mutation obligation. The round-3 law is NOT lifted: every
// section names the mutant it kills, and the matrix is reported with the change.
//
// ── THE FRs AND THE RULING, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ─────────────────────────
//
//   R70      "some restaurants show paisa but the waiter when charging charges in rupees because
//            there is no concept of paisa. even coins are getting rare."
//   02-F63   (b) no stored adjustment — the rounding row is DERIVED, `billed_total − (subtotal +
//            tax)`; (f) showing paisa and charging paisa are separable, and `02-F15`'s totals must
//            close **as printed**.
//   02-F15   receipt content: "… lines with variants/modifiers, discount lines, **totals** …"
//   16-F33   "(c) A settled `receipt` shows exactly one total — the snapshot."
//   27-F12   direction is a WORD, "never a minus sign and never a colour alone".
//   27-F23   "`Rs`, symbol-first; Western 3-digit grouping; no decimals **on operational
//            screens**" — a SCOPE. Paper is not an operational screen.
//   27-F58   "Groups are separated by **blank lines, not rules**."
//   03-F36   banned: absolute dot positioning, and space-as-layout.
//   03-F49   `receipt` declares **32** columns; a price column may degrade by WRAPPING.
//   03-F30   `render` is PURE — identical `(spec, profile, data, caps)` is byte-identical.
//
// ── WHAT THIS FILE DOES NOT ASSERT, AND WHO OWNS IT ───────────────────────────────────────────
//
//  - **That anything rounds.** `02-F63` puts the rounding inside `billed_total`, one layer up in
//    `packages/sync-client`'s `orderChargeSnapshot`; this document is handed a finished figure
//    (`27-F24`, `01-F18`). `order-tax.test.ts` §E and `tax-on-the-bill.test.ts` §E own that.
//  - **The `bill` document.** `16-F33` lets a `bill` present several totals and `03-F31` names the
//    type; it has **no spec, no renderer and no producer**, so there is nothing here to assert
//    against and inventing one would be commandment 2.
//  - **Legibility.** K-8 is owed in full and `27-F35`'s ≥85 % comprehension gate on real staff is
//    untouched. No test name here may be read as "a customer understood the rounding row".

import { describe, expect, it } from "vitest";
import type { DocumentProfile, DocumentSpec, PrinterCapability, ReceiptData } from "../index.js";
import { DOCUMENT_SPECS, MIN_COLUMNS, render } from "../index.js";

// ── the instruments (receipt-document.test.ts's, restated) ───────────────────────────────────────

const FONT_A_CELL_DOTS = 12;

const capsAt = (cols_font_a: number, model_id: string): PrinterCapability => {
  const print_dots = cols_font_a * FONT_A_CELL_DOTS;
  return {
    model_id,
    dots: print_dots,
    dpi: 203,
    cols_font_a,
    cols_font_b: Math.floor(print_dots / 9),
    has_native_qr: false,
    has_cutter: true,
    has_near_end_sensor: false,
    raster_ok: true,
  };
};

/** Wide enough that `03-F49`'s floor is never the thing under test. */
const WIDE = capsAt(64, "WIDE-64");
/** `03-F49`'s floor for this type, exactly — the 58 mm class. */
const AT_FLOOR = capsAt(MIN_COLUMNS.receipt, "FLOOR-32");

type AnySpec = DocumentSpec<unknown>;
type Part = { kind: string; value?: string; ink?: string; lines?: number };
type Ok = {
  ok: true;
  blocks: readonly { block_id: string; region: string; parts: readonly Part[] }[];
  bytes: Uint8Array;
};

const receiptSpec = (): AnySpec => DOCUMENT_SPECS.receipt as AnySpec;

const shippedDefaults = (spec: AnySpec): DocumentProfile =>
  Object.fromEntries(
    spec.blocks.flatMap((block) => block.slots.map((slot) => [slot.slot_id, slot.default])),
  );

type Line = { text: string; columns: number; blank: boolean };

const linesOf = (blocks: Ok["blocks"]): Line[] => {
  const lines: Line[] = [];
  let text = "";
  let columns = 0;
  const flush = (): void => {
    lines.push({ text, columns, blank: text.trim() === "" });
    text = "";
    columns = 0;
  };
  for (const block of blocks) {
    for (const part of block.parts) {
      if (part.kind === "feed") {
        flush();
        for (let k = 1; k < (part.lines ?? 1); k += 1) flush();
        continue;
      }
      if (part.kind !== "text" && part.kind !== "user_text") continue;
      const value = part.value ?? "";
      text += value;
      columns += part.ink === "size_2x2" ? value.length * 2 : value.length;
    }
  }
  if (text !== "") flush();
  return lines;
};

const textOf = (blocks: Ok["blocks"]): string =>
  linesOf(blocks)
    .map((line) => line.text)
    .join("\n");

const draw = (data: ReceiptData, caps: PrinterCapability = WIDE): Ok => {
  const spec = receiptSpec();
  const result = render(spec, shippedDefaults(spec), data, caps);
  expect(result.ok, `render refused — ${result.ok ? "" : result.reason}`).toBe(true);
  return result as unknown as Ok;
};

// ── the fixture: R70's OWN BILL ──────────────────────────────────────────────────────────────────

/**
 * ⚠ **THIS IS THE BILL THE RULING WAS TAKEN ON, and every number in it is load-bearing.**
 *
 * One line at Rs 450.70, `exclusive` at 16.5 % (1650 bps): tax `45070 × 1650 / 10000` half-up =
 * **7,437**, pre-rounding total **52,507**, charge rounded half-up to the rupee = **52,500**, and
 * the adjustment is **−7 paisa**.
 *
 * The founder's words are what make it the fixture: *"Subtotal Rs 450 · Tax Rs 74 · Total Rs 525,
 * three rows that do not close, on a document the customer holds."* Every figure carries a
 * DIFFERENT sub-rupee part (`.70`, `.37`, `.07`, none) so no assertion below can be satisfied by
 * the wrong figure landing in the right place, and the rounding is NEGATIVE — the direction a
 * `Paisa` cannot represent and the one an implementation reaching for a minus sign gets wrong.
 */
const SUBTOTAL_PAISA = 45_070;
const TAX_PAISA = 7_437;
const CHARGE_PAISA = 52_500;
const ROUNDING_PAISA = -7;

const R70_BILL: ReceiptData = {
  receipt_no: "5f3a9c21",
  channel: "counter",
  branch_created_at: 1_754_300_000_000,
  cashier: "Ayesha Khan",
  lines: [{ quantity: 1, name: "Chicken Karahi", unit_price_paisa: SUBTOTAL_PAISA }],
  total_paisa: CHARGE_PAISA,
  rounding_paisa: ROUNDING_PAISA,
  tenders: [{ method: "cash", amount_paisa: CHARGE_PAISA }],
  reprint: false,
  tax: {
    posture: "exclusive",
    rate_bps: 1_650,
    subtotal_paisa: SUBTOTAL_PAISA,
    tax_total_paisa: TAX_PAISA,
  },
};

const with_ = (over: Partial<ReceiptData>): ReceiptData => ({ ...R70_BILL, ...over });

/** The pre-`02-F63` shape: a whole-rupee, untaxed sale with no rounding field at all. */
const PLAIN_SALE: ReceiptData = {
  receipt_no: "5f3a9c21",
  channel: "counter",
  branch_created_at: 1_754_300_000_000,
  cashier: "Ayesha Khan",
  lines: [{ quantity: 2, name: "Chicken Karahi", unit_price_paisa: 45_000 }],
  total_paisa: 96_000,
  tenders: [{ method: "cash", amount_paisa: 96_000 }],
  reprint: false,
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE ROWS CLOSE. The whole of R70's complaint, as arithmetic on the printed strings.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every `label value` money ROW on the document, in paisa, keyed by its label.
 *
 * The item line is deliberately NOT one: `receipt-document.ts` renders it as
 * `1 Chicken Karahi Rs 450.70 each`, and the trailing `each` is load-bearing there — *"without it
 * the figure reads as this line's cost, and on a quantity above one that is a wrong number on a
 * document a customer checks"*. So the anchor is the end of the line, which is exactly what
 * `03-F36`'s `label` + one space + `value` row is and what the item line is not.
 */
const moneyRows = (data: ReceiptData): Map<string, number> => {
  const rows = new Map<string, number>();
  for (const line of linesOf(draw(data).blocks)) {
    const m = /^(.*?)\s*Rs ([\d,]+(?:\.\d\d)?)$/.exec(line.text.trim());
    if (m === null) continue;
    const [, label, figure] = m as unknown as [string, string, string];
    const [rupees, sub] = figure.replace(/,/g, "").split(".");
    rows.set(label, Number(rupees) * 100 + Number(sub ?? "0"));
  }
  return rows;
};

describe("§A 02-F63 (f)/02-F15 — the totals block adds up AS PRINTED", () => {
  it("the detector is not vacuous — it finds every money row on R70's own bill", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a parser that matched nothing would
    // report every document's rows as closing, including one printing pure nonsense.
    const rows = moneyRows(R70_BILL);
    expect([...rows.keys()].sort()).toEqual(
      ["Cash", "Rounded down", "Subtotal", "Tax", "Total"].sort(),
    );
    // And the item line IS on the paper with its own paisa — it is simply not a `label value` row
    // (see `moneyRows`), so it is asserted here rather than parsed there.
    expect(textOf(draw(R70_BILL).blocks)).toContain("1 Chicken Karahi Rs 450.70 each");
  });

  it("⚠ Subtotal + Tax + Rounding = Total, read back off the PAPER", () => {
    // ⚠ **THE DEFECT R70 WAS RULED ON.** Before this the same bill printed `Subtotal Rs 450`,
    // `Tax Rs 74` and `Total Rs 525` — 450 + 74 = 524 — and `receipt-tax-line.test.ts`'s identity
    // held only in PAISA, upstream of the rendering. This is that identity ON the document.
    //
    // MUTANT THIS KILLS: the truncation verbatim (`rupeesFromPaisa` in `amountToken`), the
    // rounding row suppressed, and the rounding row rendered with the wrong SIGN.
    const rows = moneyRows(R70_BILL);
    const subtotal = rows.get("Subtotal") ?? Number.NaN;
    const tax = rows.get("Tax") ?? Number.NaN;
    const rounded = rows.get("Rounded down") ?? Number.NaN;
    expect(subtotal).toBe(SUBTOTAL_PAISA);
    expect(tax).toBe(TAX_PAISA);
    expect(rounded).toBe(-ROUNDING_PAISA);
    expect(subtotal + tax - rounded, "the printed rows do not close").toBe(
      rows.get("Total") ?? Number.NaN,
    );
  });

  it("and the AMOUNT TAKEN is a whole rupee — R70's physical constraint", () => {
    // *"an implementation that charges Rs 525.07 is asking for a coin that does not exist."*
    const text = textOf(draw(R70_BILL).blocks);
    expect(text).toContain("Total Rs 525");
    expect(text).toContain("Cash Rs 525");
    expect(text, "a coin that does not exist reached the paper").not.toContain("525.0");
  });

  it("each of the four figures renders its OWN sub-rupee part, not a shared one", () => {
    // MUTANT THIS KILLS: a formatter that renders the paisa of the FIRST figure onto every row —
    // which passes a closure check that only compares totals, because the rows would still sum.
    const text = textOf(draw(R70_BILL).blocks);
    expect(text).toContain("Subtotal Rs 450.70");
    expect(text).toContain("Tax Rs 74.37");
    expect(text).toContain("Rounded down Rs 0.07");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE ROW ITSELF: position, direction, and when it does NOT print.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F63 (b)/27-F12 — the rounding row", () => {
  it("sits BETWEEN the tax and the total — the one position a reader can check it in", () => {
    // `receipt-document.ts` rules that the totals rows are one arithmetic statement in reading
    // order. MUTANT THIS KILLS: the row appended after the amount due, where it reads as a second
    // charge from somewhere else — `receipt-tax-line.test.ts` §R2's mutant, one row along.
    const rows = linesOf(draw(R70_BILL).blocks)
      .map((line) => line.text.trim())
      .filter((t) => t !== "");
    const at = (needle: string): number => rows.findIndex((t) => t.startsWith(needle));
    expect(at("Subtotal")).toBeGreaterThanOrEqual(0);
    expect(at("Tax")).toBe(at("Subtotal") + 1);
    expect(at("Rounded down")).toBe(at("Tax") + 1);
    expect(at("Total")).toBe(at("Rounded down") + 1);
  });

  it("27-F12: direction is a WORD, and the two directions are two different words", () => {
    // "a lone `-` is one glyph wide, is the first thing lost at 1–2 m or on a scratched panel, and
    // means nothing to a non-reader". MUTANT THIS KILLS: `Rounding Rs -0.07`, and a single label
    // that says nothing about which way the money went.
    const down = textOf(draw(R70_BILL).blocks);
    expect(down).toContain("Rounded down Rs 0.07");
    expect(down, "a minus sign reached the paper").not.toMatch(/-\s*Rs/);
    expect(down, "a bare minus on the figure").not.toContain("-0.07");

    const up = textOf(draw(with_({ total_paisa: 52_600, rounding_paisa: 93 })).blocks);
    expect(up).toContain("Rounded up Rs 0.93");
    expect(up, "up and down print the same word").not.toContain("Rounded down");
  });

  it("a rounding of ZERO prints NOTHING — and so does an absent field", () => {
    // `varianceToken`'s stated precedent: *"`OVER Rs 0` is not a thing anyone says"*, and
    // `27-F55` makes paper carry LESS. This is also what keeps every whole-rupee bill this product
    // has ever printed byte-identical, which is the property the change is checkable by.
    //
    // MUTANT THIS KILLS: an unconditional row, which puts `Rounded up Rs 0` on every receipt in
    // the country — `02-F43`'s "logged but uncounted" shape moved onto a document a customer keeps.
    for (const [what, data] of [
      ["an explicit zero", with_({ total_paisa: 52_507, rounding_paisa: 0 })],
      ["an absent field", PLAIN_SALE],
    ] as const) {
      const text = textOf(draw(data).blocks);
      expect(text, `${what}: a rounding row printed`).not.toContain("Rounded");
    }
  });

  it("⚠ an UNTAXED bill still prints its rounding row — `02-F63` (a): it is not a tax rule", () => {
    // R70 binds card as firmly as cash and fires under posture `none`; an org rounding to Rs 10
    // rounds a bill with no tax anywhere in it. MUTANT THIS KILLS: hanging the row off the tax
    // record, which is where it most naturally goes and where it would be invisible on exactly the
    // receipts that have no Subtotal or Tax row to explain the difference.
    const text = textOf(draw({ ...PLAIN_SALE, total_paisa: 97_000, rounding_paisa: 1_000 }).blocks);
    expect(text).toContain("Rounded up Rs 10");
    expect(text).toContain("Total Rs 970");
    expect(text, "an untaxed receipt grew a Subtotal row").not.toContain("Subtotal");
  });

  it("16-F33 (c): a settled receipt still shows exactly ONE total", () => {
    // The rounding row is an ADJUSTMENT and never a second total. MUTANT THIS KILLS: printing the
    // pre-rounding figure beside the charged one — "a false record of what was taken".
    const rows = linesOf(draw(R70_BILL).blocks).filter((line) => line.text.includes("Total"));
    expect(rows).toHaveLength(1);
    expect(textOf(draw(R70_BILL).blocks), "the pre-rounding total is on the paper").not.toContain(
      "525.07",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE MONEY TOKEN. Truthful where there IS a sub-rupee part, silent where there is not.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F63 (f)/27-F23 — `amountToken` renders sub-rupee amounts truthfully", () => {
  it("a whole figure carries NO decimal point, so every existing document is unchanged", () => {
    // The half that keeps `27-F23`'s spirit. `document-parts.ts` names the alternative — always
    // two decimals — and refuses it; this is what makes that refusal checkable. MUTANT THIS
    // KILLS: `.toFixed(2)`, which would put `.00` on every KOT-adjacent money row in the package.
    const text = textOf(draw(PLAIN_SALE).blocks);
    expect(text).toContain("Total Rs 960");
    expect(text).toContain("Cash Rs 960");
    expect(text, "a whole-rupee figure grew a decimal point").not.toMatch(/Rs [\d,]+\./);
  });

  it("the sub-rupee part is TWO digits, zero-padded — `Rs 525.07`, never `Rs 525.7`", () => {
    // MUTANT THIS KILLS: `String(remainder)` with no pad, which renders 7 paisa as `.7` — seventy
    // paisa, an order of magnitude out, on a figure a customer checks.
    const text = textOf(draw(with_({ total_paisa: 52_507, rounding_paisa: 0 })).blocks);
    expect(text).toContain("Total Rs 525.07");
    expect(text).not.toContain("Rs 525.7");
  });

  it("27-F23: grouping is still WESTERN and the symbol still leads, with paisa attached", () => {
    // The grouping applies to the RUPEES and the paisa hang off the end: `Rs 1,234,567.89`.
    // MUTANT THIS KILLS: grouping applied to the whole `rupees.paisa` string, which would put a
    // separator inside the fraction.
    const text = textOf(
      draw(with_({ total_paisa: 123_456_789, rounding_paisa: 0, tenders: [] })).blocks,
    );
    expect(text).toContain("Total Rs 1,234,567.89");
    expect(text, "lakh grouping reached the paper").not.toContain("12,34,567");
    expect(text).not.toContain("₨");
    expect(text).not.toContain("PKR");
  });

  it("27-F22: every digit is Western, decimal point included", () => {
    expect(textOf(draw(R70_BILL).blocks)).not.toMatch(/[٠-٩۰-۹]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE COLUMN BUDGET. `03-F49`'s floor is 32 and a sub-rupee token costs THREE more.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 03-F49/03-F36 — what the paisa cost in columns, measured", () => {
  it("every row of R70's bill fits `03-F49`'s 32-column floor", () => {
    // The measurement the change turns on. `min-columns.ts` derives the floors from *"the widest
    // money token is `Rs 99,999,999` = 13 columns"*; a sub-rupee token is **16**, so a `.NN` costs
    // exactly 3. On this type the widest totals row is `Subtotal Rs 450.70` at 18 and the widest
    // rounding row is `Rounded down Rs 0.07` at 21 — both far under the floor.
    for (const line of linesOf(draw(R70_BILL, AT_FLOOR).blocks)) {
      expect(line.columns, `"${line.text}" is ${line.columns} columns`).toBeLessThanOrEqual(
        MIN_COLUMNS.receipt,
      );
    }
  });

  it("the worst case a totals row can reach is still inside the floor", () => {
    // `Rounded down Rs 99,999,999.99` = 12 + 1 + 16 = **29**, against a floor of 32. That is the
    // widest this row can be under `min-columns.ts`'s own PINNED eight-digit display bound, and it
    // is why `02-F63` needed no change to any floor. A rounding magnitude is in fact strictly less
    // than the granularity, so this is an upper bound on an upper bound.
    const rows = linesOf(
      draw(with_({ total_paisa: 100_000_000, rounding_paisa: -9_999_999_999 }), AT_FLOOR).blocks,
    ).filter((line) => line.text.includes("Rounded"));
    expect(rows).toHaveLength(1);
    expect((rows[0] as Line).text).toBe("Rounded down Rs 99,999,999.99");
    expect((rows[0] as Line).columns).toBe(29);
    expect((rows[0] as Line).columns).toBeLessThanOrEqual(MIN_COLUMNS.receipt);
  });

  it("03-F49: the receipt is NOT refused at its floor with every paisa row present", () => {
    // `03-F49` gives this type wrapping as its declared degradation, so the paisa cannot push the
    // floor up. The assertion is that the document still RENDERS at 32 columns — a refusal here
    // would be `02-F63` silently costing 58 mm printers the receipt.
    expect(render(receiptSpec(), shippedDefaults(receiptSpec()), R70_BILL, AT_FLOOR).ok).toBe(true);
  });

  it("03-F30: the render is still PURE — the same bill twice is byte-identical", () => {
    const once = draw(R70_BILL).bytes;
    const twice = draw(R70_BILL).bytes;
    expect([...once]).toEqual([...twice]);
  });
});
