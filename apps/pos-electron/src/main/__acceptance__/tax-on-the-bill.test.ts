// ACCEPTANCE TESTS — v0 gap 2: **tax appears on the bill and the receipt.**
//
// Written alongside the implementation under `plans/v0.md`'s R66, which lifts `24 §3`'s
// separate-oracle rule for v0. The round-3 law is NOT lifted: every section names the mutant it
// kills, and the mutation matrix is reported with the change.
//
// ── THE FRs, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ────────────────────────────────────────
//
//   16-F1    "Tax is off by default. Enabling any posture or the add-on is an explicit org action
//            recorded as `config.changed` (audited, 01-F5)."
//   16-F2    the three postures, closed: `none | inclusive | exclusive`.
//   16-F27   "**The posture matrix is ORG configuration and the owner types the rates — `16-F4` is
//            overruled by name.**" (founder ruling R55)
//   16-F31   "**Tax is INSIDE `billed_total` (R54), and a receipt's *Total* row is that number.**"
//   01-F82   the kernel half of R54: `billed_total` IS `taxSnapshot`'s `total_paisa`. "Had tax
//            stayed outside, an `exclusive` order would have **closed on a tender that did not
//            cover it**."
//   16-F33   "(c) A settled `receipt` shows exactly one total — the snapshot."
//   16-F34   R39's boundary: correct totals and an itemised tax line; NO fiscalization.
//   01-F87   the layer-2 configuration carrier — a fourth `01-F75` resource. **Not built**, which
//            is why `tax-posture.ts` is a seed and says so.
//   01-F17   a sale is never blocked — by inventory math, sync, or approval timeouts.
//
// ── WHAT THIS FILE DOES NOT ASSERT ────────────────────────────────────────────────────────────
//
//  - The posture arithmetic (`packages/domain`'s `tax-posture.test.ts`) and the join to the fold's
//    per-line cells (`packages/sync-client`'s `order-tax.test.ts`).
//  - The rendered bytes. `packages/escpos`'s `receipt-tax-line.test.ts` already pins
//    *Subtotal / Tax / Total* and `subtotal + tax = total`; **not one byte of that package
//    changed**, because it already meant the post-R54 thing and its PRODUCER was the mismatch.

import { readFileSync } from "node:fs";

import {
  classifyTransmit,
  createSpooler,
  type PrinterCapability,
  printerCapability,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore, OpenOrderRow } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";

import { advancesOnSettlement } from "../line-advance";
import { createReceiptPrinter, type ReceiptPrinterDeps } from "../printing";
import { closingActFor } from "../settlement-closer";
import { alreadySettled } from "../settlement-guard";
import { resolveTaxCell, TAX_POSTURE_ENV, TAX_RATE_BPS_ENV } from "../tax-posture";

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

/** Rs 405.00 of delivered lines — the four-line order the sibling suites use. */
const LINES = JSON.stringify({
  "line-roti": { item_id: "i-roti", qty: 3, unit_price_paisa: 4_500, states: ["placed"] },
  "line-chai": { item_id: "i-chai", qty: 1, unit_price_paisa: 4_500, states: ["placed"] },
  "line-raita": { item_id: "i-raita", qty: 5, unit_price_paisa: 4_500, states: ["placed"] },
});
const SUBTOTAL = 40_500;
/**
 * Rs 469.80 — the subtotal plus 16 % computed **PER LINE** (`16-F5`): 2160 + 720 + 3600 = 6480.
 *
 * Per line and not on the total, and the fixture is chosen so the two agree here: the discriminator
 * between a per-line and a per-total implementation is `packages/domain`'s `tax-posture.test.ts`
 * §C, which owns that property. What this number is for is `01-F82` — it is what the customer
 * hands over, so it is what the cover test must demand.
 */
const GROSS_AT_1600 = 46_980;

const row = (over: Partial<OpenOrderRow> = {}): OpenOrderRow => ({
  order_id: "0199aaaa-0000-7000-8000-00000000000a",
  channel: "counter",
  order_type: "takeaway",
  confirmed_at: null,
  settled: 0,
  table_ids_json: "[]",
  table_conflict: 0,
  pay_total: 0,
  repaid_total: 0,
  refund_total: 0,
  pay_attempts_json: "{}",
  refund_attempts_json: "{}",
  cap_violated: 0,
  exceptions_json: "[]",
  json_lines: LINES,
  ...over,
});

/**
 * The env knobs are read PER CALL (`tax-posture.ts` takes no memo), so a test may set them and the
 * shipping readers see them on their very next call. That is what makes the seam assertions in §C
 * behavioural rather than source reads.
 */
const setPosture = (posture?: string, rate?: string): void => {
  if (posture === undefined) delete process.env[TAX_POSTURE_ENV];
  else process.env[TAX_POSTURE_ENV] = posture;
  if (rate === undefined) delete process.env[TAX_RATE_BPS_ENV];
  else process.env[TAX_RATE_BPS_ENV] = rate;
};

afterEach(() => setPosture(undefined, undefined));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 16-F1 / 16-F27: the v0 seed, and what it refuses.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 16-F1/16-F27 — the seeded cell, off by default and refusing rather than guessing", () => {
  it("16-F1: an unconfigured device is `none` at 0 bps", () => {
    // The ordinary Pakistani restaurant this product ships to. MUTANT THIS KILLS: any default
    // posture that charges — a tax silently charged is permanent under `01-F1`, and `16-F1` puts
    // enabling one behind an explicit, audited org action this device cannot take.
    expect(resolveTaxCell({})).toEqual({ posture: "none", rate_bps: 0 });
  });

  it("16-F27: the owner's typed posture and rate are taken verbatim", () => {
    expect(resolveTaxCell({ [TAX_POSTURE_ENV]: "exclusive", [TAX_RATE_BPS_ENV]: "1600" })).toEqual({
      posture: "exclusive",
      rate_bps: 1_600,
    });
    expect(resolveTaxCell({ [TAX_POSTURE_ENV]: "inclusive", [TAX_RATE_BPS_ENV]: "800" })).toEqual({
      posture: "inclusive",
      rate_bps: 800,
    });
  });

  it("16-F2: a fourth posture word is REFUSED, not coerced", () => {
    // `02-F42`'s precedent one field over: a fourth word is a tax regime nobody ruled on.
    expect(() => resolveTaxCell({ [TAX_POSTURE_ENV]: "zero_rated" })).toThrow(/16-F2/);
    expect(() => resolveTaxCell({ [TAX_POSTURE_ENV]: "Exclusive" })).toThrow(/16-F2/);
  });

  it("00 §6: a rate that is not integer BASIS POINTS is refused, and the message quotes it back", () => {
    // MUTANT THIS KILLS: `Number(rate) || 0`, which turns "16%" into 0 — a tax silently NOT
    // charged — and "0.16" into a fractional rate `applyRateBps` would then reject far downstream,
    // at settlement, in front of a customer. Refusing at the read is what makes it fixable.
    for (const bad of ["16%", "0.16", "sixteen", "-100", ""]) {
      expect(
        () => resolveTaxCell({ [TAX_POSTURE_ENV]: "exclusive", [TAX_RATE_BPS_ENV]: bad }),
        `"${bad}" was accepted as a rate`,
      ).toThrow();
    }
  });

  it("a posture with no rate is refused — an absent value is not a licence to default", () => {
    // `11-F22`'s precedent, transcribed one field over. Defaulting to 0 charges nothing under a
    // posture the owner switched ON, which reads as configured and is not.
    expect(() => resolveTaxCell({ [TAX_POSTURE_ENV]: "exclusive" })).toThrow(/16-F27/);
  });

  it("a rate with no posture is refused — the half-configured cell", () => {
    // The operator who typed the rate and forgot the posture gets a `RangeError` naming both
    // variables, rather than a till that quietly charges nothing.
    expect(() => resolveTaxCell({ [TAX_RATE_BPS_ENV]: "1600" })).toThrow(/16-F1/);
  });

  it("`none` needs no rate — switching tax off must not require keeping one beside it", () => {
    expect(resolveTaxCell({ [TAX_POSTURE_ENV]: "none" })).toEqual({ posture: "none", rate_bps: 0 });
  });

  it("16-F34: the seed carries NO fiscal vocabulary and no rule pack", () => {
    // R39's boundary stated as a refusal: nothing here may be read as evidence about an authority
    // adapter, a certification or a legal obligation. `16-F27` struck `16-F4`'s packs and `16-F30`
    // returns them only with a certified adapter, which `16-F34` puts post-pilot — so a
    // `rule_pack_version` knob appearing here would be a field with no producer AND a claim.
    const src = readSrc("tax-posture.ts");
    for (const banned of ["rule_pack", "FBR", "PRA", "fiscal", "invoice_number"]) {
      expect(src, `the seed mentions "${banned}"`).not.toContain(banned);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 01-F82 / 16-F31: what the customer OWES is what the till demands.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F82 — the cover test is against the TAX-INCLUSIVE total", () => {
  it("an exclusive order is NOT settled by a tender covering only the pre-tax lines", () => {
    // ⚠ **THE DEFECT `01-F82` WAS RULED TO PREVENT, in its own words: "Had tax stayed outside, an
    // `exclusive` order would have CLOSED ON A TENDER THAT DID NOT COVER IT."** Rs 405 handed over
    // against a Rs 469.80 bill leaves Rs 64.80 owed, permanently under `01-F1`.
    setPosture("exclusive", "1600");
    expect(alreadySettled({ order_id: "o", pay_total: SUBTOTAL, json_lines: LINES })).toBeNull();
    expect(
      advancesOnSettlement({ order_type: "takeaway", pay_total: SUBTOTAL, json_lines: LINES }),
    ).toBe(false);
    expect(closingActFor(row({ pay_total: SUBTOTAL }))).toBeNull();
  });

  it("and IS settled by the gross — with the attested billed_paisa carrying the tax", () => {
    setPosture("exclusive", "1600");
    expect(alreadySettled({ order_id: "o", pay_total: GROSS_AT_1600, json_lines: LINES })).toEqual({
      order_id: "o",
      billed_paisa: GROSS_AT_1600,
      paid_paisa: GROSS_AT_1600,
    });
    expect(
      advancesOnSettlement({ order_type: "takeaway", pay_total: GROSS_AT_1600, json_lines: LINES }),
    ).toBe(true);
    // `01-F63`: the merge rule reads this attestation back as `uncovered_addition`'s CEILING, so a
    // pre-tax figure here would breach the order's own ceiling the moment it closed.
    expect(closingActFor(row({ pay_total: GROSS_AT_1600 }))?.billed_paisa).toBe(GROSS_AT_1600);
  });

  it("16-F1's default leaves all three readers byte-identical to the pre-tax product", () => {
    // The regression guard for every restaurant that never enables tax. MUTANT THIS KILLS: a join
    // that charges under `none`, which would make every existing settlement in this repo fail.
    setPosture(undefined, undefined);
    expect(alreadySettled({ order_id: "o", pay_total: SUBTOTAL, json_lines: LINES })).toEqual({
      order_id: "o",
      billed_paisa: SUBTOTAL,
      paid_paisa: SUBTOTAL,
    });
    expect(
      advancesOnSettlement({ order_type: "takeaway", pay_total: SUBTOTAL, json_lines: LINES }),
    ).toBe(true);
    expect(closingActFor(row({ pay_total: SUBTOTAL }))?.billed_paisa).toBe(SUBTOTAL);
  });

  it("`inclusive` does not move any of them — the change is ONE POSTURE WIDE (01-F82)", () => {
    // The negative control that makes §B specific: the readers are not simply "bigger now". Under
    // `inclusive` the captured price already contains the tax, so what the customer owes is what
    // she was quoted, and a reader that grew here would be over-charging her.
    setPosture("inclusive", "1600");
    expect(
      alreadySettled({ order_id: "o", pay_total: SUBTOTAL, json_lines: LINES }),
    ).not.toBeNull();
    expect(closingActFor(row({ pay_total: SUBTOTAL }))?.billed_paisa).toBe(SUBTOTAL);
  });

  it("01-F17: an order with nothing billable is still not 'already settled' under any posture", () => {
    // The narrowing `settlement-guard.ts` and `settlement-closer.ts` both keep: `0 >= 0` would
    // make an empty order read as settled and REFUSE a sale that has not happened. Asserted across
    // postures because the tax change is exactly where a `<= 0` test could have been lost.
    for (const p of [undefined, "inclusive", "exclusive"] as const) {
      setPosture(p, p === undefined ? undefined : "1600");
      expect(
        alreadySettled({ order_id: "o", pay_total: 0, json_lines: "{}" }),
        `posture ${String(p)}`,
      ).toBeNull();
      expect(closingActFor(row({ json_lines: "{}" })), `posture ${String(p)}`).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE SEAM. Five readers, ONE cell — and the sixth that did not move.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C — every reader of `billed_total` resolves the SAME cell", () => {
  /**
   * `16-F33` (a) refuses a second declaration of the posture beside the one settlement uses:
   * *"this corpus has already paid for the other arrangement once, when two declarations of one
   * enabled channel set drifted silently and nothing could see it."* Five files, one import.
   */
  const READERS = [
    "settlement-guard.ts",
    "settlement-closer.ts",
    "line-advance.ts",
    "aggregator-settlement.ts",
    "printing.ts",
  ] as const;

  it("all five import the one resolver and none re-reads the environment itself", () => {
    // MUTANT THIS KILLS: a reader that resolves its own posture from `process.env`. It compiles,
    // it passes every behavioural test above, and it drifts the day one of the two spellings is
    // corrected — which is the defect `16-F33` (a) names by name.
    for (const file of READERS) {
      const src = readSrc(file);
      expect(src, `${file} does not import the resolver`).toContain('from "./tax-posture"');
      expect(src, `${file} reads the tax environment directly`).not.toContain("RESTOS_TAX_");
    }
  });

  it("none of the five still reads the tax-BLIND order-level sum", () => {
    // `billedEffectiveFromJsonLines` is line-derived and tax-blind. A reader left on it is a
    // reader that disagrees with the receipt — which is exactly the state this gap was opened to
    // close. The word may still appear in PROSE, so the assertion is on the call.
    for (const file of READERS) {
      expect(readSrc(file), `${file} still calls the tax-blind sum`).not.toContain(
        "billedEffectiveFromJsonLines(",
      );
    }
  });

  it("16-F33 (c): the receipt carries the snapshot, and ONE total", () => {
    // The producer half of the R54 fix. `packages/escpos` already renders *Subtotal / Tax / Total*
    // and pins `subtotal + tax = total`; this asserts that `printing.ts` now hands it the snapshot
    // rather than a line-derived number with no tax beside it.
    const src = readSrc("printing.ts");
    const settled = src.slice(src.indexOf("const settled = (order_id: string)"));
    expect(settled).toContain("orderTaxSnapshot(order.json_lines, tax_cell)");
    expect(settled).toContain("total_paisa = tax.total_paisa");
    expect(settled).toContain("tax_total_paisa: tax.tax_total_paisa");
  });

  // ⚠ **NO SOURCE READ FOR `16-F1`'s "`none` PRINTS NOTHING", DELIBERATELY.**
  // `receipt-document.ts`'s `RECEIPT_TOTALS` owns that rule and spends a paragraph on it, so the
  // producer hands the snapshot over WHOLE and re-decides nothing — one declaration, not two
  // (`16-F33` (a)). §D's first case is the assertion, and it is BEHAVIOURAL: it reads the bytes a
  // customer would hold. An assertion here would have pinned a branch that changes no outcome,
  // which is how a suite comes to defend a shape instead of a property.

  it("⚠ REPORTED, NOT ASSERTED — `gateway.ts`'s screen total has NOT moved", () => {
    // **This is a deliberate red flag in a green test, and it must fail LOUDLY when it closes.**
    // `openOrders()` projects the cashier's `total_paisa` from the tax-blind sum, so with a
    // posture configured she reads the PRE-tax figure while §B's guard demands the gross. The file
    // is out of this session's allowlist (a concurrent session owns it), the change is one
    // expression, and pinning the CURRENT state is the only honest thing a test can do: it turns
    // "somebody remembers" into "the suite says so on the day it moves".
    //
    // WHEN THIS GOES RED: `gateway.ts:498` now uses the tax-inclusive door. Delete this test and
    // add the reader to `READERS` above.
    expect(readSrc("gateway.ts")).toContain("total_paisa: billedEffectiveFromJsonLines(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE PAPER. What a customer actually holds, decoded out of the transmitted bytes.
//
// ⚠ **§C's seam assertions are SOURCE READS and that is a weak instrument** — `K-3`'s dead-oracle
// defect is a suite asserting against a hand-copy rather than against behaviour. This section is
// the behavioural half, and it is what makes the seam rows in the mutation matrix mean something:
// under the "receipt loses its tax block" mutant §C reddens on strings while §D reddens on the
// paper a customer is handed. Neither subsumes the other — §C catches a reader silently switched
// back to the tax-blind sum in a file §D does not drive, and §D catches a wiring that compiles.
//
// ⚠ **NOT EVIDENCE FOR** any physical printer (K-8 is owed in full and none has ever been
// attached), nor that a customer can READ the result (`27-F35`'s ≥85% comprehension gate is
// measured on real people, on thermal paper).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const RECEIPT_ORDER = "5f3a9c21-0000-4000-8000-000000000001";

/** Rs 450 × 2 + Rs 60 = Rs 960 of delivered lines — three distinct money tokens on the paper. */
const RECEIPT_LINES = {
  "line-1": { item_id: "item-karahi", qty: 2, unit_price_paisa: 45_000, states: ["placed"] },
  "line-2": { item_id: "item-naan", qty: 1, unit_price_paisa: 6_000, states: ["placed"] },
};

const receiptStore = (pay_total: number): ReceiptPrinterDeps["store"] =>
  ({
    openOrders: () => [
      {
        order_id: RECEIPT_ORDER,
        channel: "counter",
        order_type: "takeaway",
        confirmed_at: Date.UTC(2026, 0, 2, 8, 0, 0),
        settled: 0,
        table_ids_json: "[]",
        table_conflict: 0,
        pay_total,
        repaid_total: 0,
        refund_total: 0,
        pay_attempts_json: JSON.stringify({
          "attempt-1": [
            {
              order_id: RECEIPT_ORDER,
              amount_paisa: pay_total,
              method: "cash",
              purpose: "settles_order",
            },
          ],
        }),
        refund_attempts_json: "{}",
        cap_violated: 0,
        exceptions_json: "[]",
        json_lines: JSON.stringify(RECEIPT_LINES),
      },
    ],
  }) as unknown as Pick<DeviceStore, "openOrders">;

const okTransport = (caps: PrinterCapability): SpoolerTransport => ({
  send: async () =>
    classifyTransmit(
      { status: { paper_out: false, near_end: false }, timed_out: false, link_error: null },
      caps,
    ),
  status: async () => ({ paper_out: false, near_end: false }),
});

/**
 * The document's text, decoded latin1 — `receipt-printing.test.ts`'s own helper and its reason:
 * K-2's admitted command set cannot spell a multi-word phrase in its parameter bytes, and every
 * string searched below is one.
 */
const paperFor = async (pay_total: number): Promise<string> => {
  const capability = printerCapability("TH230");
  const sent: Uint8Array[] = [];
  const inner = okTransport(capability);
  const spooler = createSpooler({
    transport: {
      send: async (bytes) => {
        sent.push(bytes);
        return inner.send(bytes);
      },
      status: inner.status,
    },
  });
  const printer = createReceiptPrinter({
    spooler,
    store: receiptStore(pay_total),
    catalog: (item_id) =>
      item_id === "item-karahi"
        ? { name: "Chicken Karahi" }
        : item_id === "item-naan"
          ? { name: "Garlic Naan" }
          : null,
    capability,
    pump: () => spooler.pump(),
    cashier: () => "Ayesha Khan",
  });
  printer.settled(RECEIPT_ORDER);
  await spooler.pump();
  expect(sent.length, "nothing was ever handed to the transport").toBeGreaterThan(0);
  return String.fromCharCode(...(sent[0] as Uint8Array));
};

describe("§D 16-F31/16-F33 — the tax is ON THE PAPER, and the Total is the tax-inclusive one", () => {
  it("16-F1: with no posture the receipt carries NO tax content at all", async () => {
    // `receipt-document.ts`: *"the ordinary Pakistani restaurant this product ships to prints the
    // document it printed before this field existed, byte for byte."* A `Tax Rs 0` row is a claim
    // about a tax regime the org is not in.
    setPosture(undefined, undefined);
    const paper = await paperFor(96_000);
    expect(paper).toContain("Total Rs 960");
    expect(paper).not.toContain("Subtotal");
    expect(paper).not.toContain("Tax");
  });

  it("exclusive: Subtotal Rs 960 · Tax Rs 153.60 · Total Rs 1,113.60, and they close", async () => {
    // ⚠ **THE WHOLE OF v0 GAP 2 IN ONE ASSERTION.** 16 % per line: 45000×2 = 90000 → 14400, and
    // 6000 → 960; Σ = 15360 paisa. `01-F82`: the *Total* row IS `billed_total`, so it is the
    // gross. MUTANT THIS KILLS: the producer handing over a line-derived total with no tax
    // beside it — the state this product shipped in until v0 gap 2.
    setPosture("exclusive", "1600");
    const paper = await paperFor(111_360);
    expect(paper).toContain("Subtotal Rs 960");
    expect(paper).toContain("Tax Rs 153");
    expect(paper).toContain("Total Rs 1,113");
    // ⚠ The paisa are absent because `amountToken` renders WHOLE RUPEES — see §E, which measures
    // what that costs now that tax produces the product's first non-round totals.
  });

  it("inclusive: the Total is unchanged and the tax is CARVED OUT of it", async () => {
    // The `24 §3b` discriminator between the two live postures on paper. 96000 × 1600 / 11600 per
    // line: 90000 → 12414 and 6000 → 828; Σ = 13242 paisa, and the customer still pays Rs 960.
    // ⚠ Through the EXCLUSIVE door the same lines would carve 15360 and the total would read
    // Rs 1,113.60 — so this row is also the inclusive-extraction guard at the paper.
    setPosture("inclusive", "1600");
    const paper = await paperFor(96_000);
    expect(paper).toContain("Total Rs 960");
    expect(paper).toContain("Tax Rs 132");
    expect(paper).toContain("Subtotal Rs 827");
    expect(paper, "an inclusive receipt printed the exclusive gross").not.toContain("Rs 1,113");
  });

  it("16-F34/R39: no fiscal claim appears anywhere on the document", async () => {
    // Stated as a refusal, because the failure mode is a document that merely LOOKS official:
    // no authority invoice number, no fiscal QR, no `FISCAL_LOCKED` block — those exist only when
    // a certified adapter injects them, and `16-F34` puts that post-pilot.
    setPosture("exclusive", "1600");
    const paper = await paperFor(111_360);
    for (const banned of ["FBR", "PRA", "FISCAL", "Invoice No", "USIN"]) {
      expect(paper, `the receipt claims "${banned}"`).not.toContain(banned);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — WHAT WHOLE-RUPEE RENDERING COSTS NOW THAT TAX EXISTS. Measured, not argued.
//
// ⚠ **A FINDING, PINNED AS ONE — every assertion below is GREEN and describes a defect.** The
// `§I` section of `packages/domain`'s `tax-posture.test.ts` is the corpus's own precedent for this
// shape: state the cost in rupees so a ruling can be taken against a number rather than a worry.
//
// `document-parts.ts`'s `amountToken` renders `rupeesFromPaisa(...).rupees`, and
// `packages/domain/src/money.ts:157` computes that as `(a - (a % 100)) / 100` — **truncation**,
// not rounding. That was INERT before this change and is not any more, and the reason is
// structural rather than bad luck: `14-F29`'s owner types prices and `01-F53` freezes them, so
// before tax every order total was a whole number of rupees and the paisa field was always zero.
// **An `exclusive` posture is the first thing in this product that produces a total with paisa in
// it**, and `01-F82` makes that total the receipt's *Total* row.
//
// Two consequences, both measured below rather than reasoned:
//
//  1. **The printed *Total* under-states `billed_total` by up to 99 paisa**, on a document
//     `02-F15` gives the customer as the record of what she paid.
//  2. **The three printed rows can fail to close by Re 1.** `floor(a) + floor(b)` is either
//     `floor(a+b)` or one less, so `Subtotal + Tax = Total` — the identity
//     `packages/escpos/src/__acceptance__/receipt-tax-line.test.ts:380` pins **in paisa**, and
//     which R39's *"correct totals"* is about — is not an identity **on the paper**.
//
// **NOT FIXED HERE, and the refusal is deliberate.** `amountToken` is `packages/escpos`'s and its
// whole-rupee policy is product-wide (the shift slip and the day summary use it too), so changing
// it is a protected-path change to a rendering rule with no FR asking for it — commandment 9 and
// `24 §3b`'s no-drive-by rule both point the same way. `27-F12` governs how money is shown and
// says nothing about sub-rupee precision. **Owner: doc 27 + `packages/escpos`.**
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E FINDING — the paper renders WHOLE RUPEES, and tax is what makes that visible", () => {
  it("the printed Total under-states the tax-inclusive billed_total by its paisa", async () => {
    // Rs 1,113.60 is tendered and Rs 1,113 is printed. The customer's copy is 60 paisa light.
    setPosture("exclusive", "1600");
    const paper = await paperFor(111_360);
    expect(paper).toContain("Total Rs 1,113");
    expect(
      paper,
      "the paisa reached the paper — re-measure this finding before trusting it",
    ).not.toContain("1,113.6");
  });

  it("and the three rows can fail to close by Re 1 — Rs 450 + Rs 74 printed against Rs 525", async () => {
    // The sharp case, chosen by construction rather than found by luck: one line at Rs 450.70 at
    // 16.5 % gives tax 7437 paisa and a total of 52507. Truncated: 450 + 74 = 524, printed 525.
    // `receipt-tax-line.test.ts` pins `subtotal + tax = total` and it holds — in PAISA, upstream
    // of this rendering. R39's "correct totals" is about what the customer reads.
    setPosture("exclusive", "1650");
    const capability = printerCapability("TH230");
    const sent: Uint8Array[] = [];
    const inner = okTransport(capability);
    const spooler = createSpooler({
      transport: {
        send: async (bytes) => {
          sent.push(bytes);
          return inner.send(bytes);
        },
        status: inner.status,
      },
    });
    createReceiptPrinter({
      spooler,
      store: {
        openOrders: () => [
          {
            order_id: RECEIPT_ORDER,
            channel: "counter",
            order_type: "takeaway",
            confirmed_at: Date.UTC(2026, 0, 2, 8, 0, 0),
            settled: 0,
            table_ids_json: "[]",
            table_conflict: 0,
            pay_total: 52_507,
            repaid_total: 0,
            refund_total: 0,
            pay_attempts_json: JSON.stringify({
              "attempt-1": [
                {
                  order_id: RECEIPT_ORDER,
                  amount_paisa: 52_507,
                  method: "cash",
                  purpose: "settles_order",
                },
              ],
            }),
            refund_attempts_json: "{}",
            cap_violated: 0,
            exceptions_json: "[]",
            json_lines: JSON.stringify({
              "line-1": {
                item_id: "item-karahi",
                qty: 1,
                unit_price_paisa: 45_070,
                states: ["placed"],
              },
            }),
          },
        ],
      } as unknown as Pick<DeviceStore, "openOrders">,
      catalog: () => ({ name: "Chicken Karahi" }),
      capability,
      pump: () => spooler.pump(),
      cashier: () => "Ayesha Khan",
    }).settled(RECEIPT_ORDER);
    await spooler.pump();
    const paper = String.fromCharCode(...(sent[0] as Uint8Array));
    expect(paper).toContain("Subtotal Rs 450");
    expect(paper).toContain("Tax Rs 74");
    expect(paper).toContain("Total Rs 525");
    // 450 + 74 = 524. The rows on the paper do not close, and the ledger's do.
  });
});
