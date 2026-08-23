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
import {
  CHARGE_ROUNDING_ENV,
  DEFAULT_CHARGE_ROUNDING_PAISA,
  resolveChargeRoundingPaisa,
  resolveTaxCell,
  TAX_POSTURE_ENV,
  TAX_RATE_BPS_ENV,
} from "../tax-posture";

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

/**
 * Rs 470.00 — `02-F63`'s CHARGE: `GROSS_AT_1600` rounded half-up to the seeded default step of
 * 100 paisa. 46,980 has a remainder of 80, so it rounds **up** by 20 paisa.
 *
 * The fixture is deliberately one that MOVES. Rs 405 of whole-rupee lines at 16 % is exactly the
 * shape `14-F29` produces, and if the gross had happened to land on a rupee this constant would
 * equal `GROSS_AT_1600` and every assertion below would pass against an implementation that never
 * rounds at all.
 */
const CHARGED_AT_1600 = 47_000;

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

  it("and IS settled by the ROUNDED gross — the attested billed_paisa is what was taken", () => {
    // ⚠ **AMENDED BY `02-F63` (R70) AND THE OLD NUMBER IS KEPT BESIDE THE NEW ONE.** This asserted
    // `GROSS_AT_1600` (46,980) in all three places. `billed_total` is now that figure ROUNDED to
    // the org's step, so what the till demands — and what `01-F63` attests, which the merge rule
    // reads back as `uncovered_addition`'s CEILING — is Rs 470.00 and not Rs 469.80. A pre-ROUNDING
    // figure here would be the same defect `01-F82` was ruled on with a smaller number: an order
    // closing on a tender that did not cover it.
    setPosture("exclusive", "1600");
    expect(
      alreadySettled({ order_id: "o", pay_total: CHARGED_AT_1600, json_lines: LINES }),
    ).toEqual({
      order_id: "o",
      billed_paisa: CHARGED_AT_1600,
      paid_paisa: CHARGED_AT_1600,
    });
    expect(
      advancesOnSettlement({
        order_type: "takeaway",
        pay_total: CHARGED_AT_1600,
        json_lines: LINES,
      }),
    ).toBe(true);
    expect(closingActFor(row({ pay_total: CHARGED_AT_1600 }))?.billed_paisa).toBe(CHARGED_AT_1600);
  });

  it("02-F63: the UNROUNDED gross no longer covers — the rounding is INSIDE what is owed", () => {
    // ⚠ **THE MUTANT THIS EXISTS FOR, and it is the one a careful session ships by accident:**
    // rounding applied at the RECEIPT and not inside `billed_total`. Under that implementation the
    // paper reads Rs 470 while the guard, the closer and `02-F31`'s advance all still accept
    // Rs 469.80 — the document and the ledger disagreeing about what was taken, permanently under
    // `01-F1`. All four readers must move together or none of them has moved.
    setPosture("exclusive", "1600");
    expect(
      alreadySettled({ order_id: "o", pay_total: GROSS_AT_1600, json_lines: LINES }),
      "Rs 469.80 covered a Rs 470.00 bill",
    ).toBeNull();
    expect(
      advancesOnSettlement({ order_type: "takeaway", pay_total: GROSS_AT_1600, json_lines: LINES }),
    ).toBe(false);
    expect(closingActFor(row({ pay_total: GROSS_AT_1600 }))).toBeNull();
  });

  it("02-F63 (a): the step binds under posture `none` too — it is not a tax rule", () => {
    // R70 binds card as firmly as cash and says nothing about tax; `02-F63` (a) makes that a rule.
    // MUTANT THIS KILLS: rounding applied only when a posture is configured — which passes every
    // other assertion in this file, because every other one configures a posture.
    //
    // The lines are Rs 405.00, already whole, so the DEFAULT step cannot show this. A step of ten
    // rupees can: Rs 405 → Rs 410, with no tax anywhere in the arithmetic.
    setPosture(undefined, undefined);
    process.env[CHARGE_ROUNDING_ENV] = "1000";
    try {
      expect(
        alreadySettled({ order_id: "o", pay_total: SUBTOTAL, json_lines: LINES }),
        "Rs 405 covered a Rs 410 bill",
      ).toBeNull();
      expect(closingActFor(row({ pay_total: 41_000 }))?.billed_paisa).toBe(41_000);
    } finally {
      delete process.env[CHARGE_ROUNDING_ENV];
    }
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
    expect(settled).toContain("orderChargeSnapshot(");
    expect(settled).toContain("charge.charge_total_paisa");
    expect(settled).toContain("tax_total_paisa: tax.tax_total_paisa");
    // `02-F63` (b): the derived adjustment travels as its own field. MUTANT THIS KILLS: a producer
    // that rounds the total and hands the document no way to say WHY it differs from its own
    // Subtotal and Tax rows — three rows that do not close, which is the defect R70 was ruled on.
    expect(settled).toContain("rounding_paisa: charge.rounding_paisa");
  });

  it("02-F63: all five readers resolve the step from the ONE resolver, none re-reads the env", () => {
    // The rounding half of the assertion above, and it matters more than the posture's did: the
    // posture defaults to `none` (nothing happens), while the step defaults to 100 (something
    // happens). A reader that re-derived it — or forgot it and got a different default — would
    // charge a different number from the one on the paper, silently.
    for (const file of READERS) {
      const src = readSrc(file);
      expect(src, `${file} does not resolve the charge step`).toContain(
        "deviceChargeRoundingPaisa",
      );
      expect(src, `${file} reads the rounding environment directly`).not.toContain(
        "RESTOS_CHARGE_ROUNDING",
      );
    }
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

  it("exclusive: the four rows CLOSE as printed — 960 + 153.60 + 0.40 = 1,114", async () => {
    // ⚠ **THE WHOLE OF v0 GAP 2 IN ONE ASSERTION, AND ITS LAST OPEN HALF.** 16 % per line:
    // 45000×2 = 90000 → 14400, and 6000 → 960; Σ = 15360 paisa, so the pre-rounding total is
    // 111,360. `02-F63` rounds that half-up to the seeded rupee: **111,400**, and the difference
    // is the `Rounded up` row.
    //
    // ⚠ **THIS ASSERTED `Subtotal Rs 960 · Tax Rs 153 · Total Rs 1,113` UNTIL R70, and its own
    // comment said the paisa were "absent because `amountToken` renders WHOLE RUPEES — see §E".**
    // Those three rows do not add up: 960 + 153 = 1,113 only by luck of the truncation, and the
    // customer was charged 1,113.60. §E was a FINDING block pinning exactly that, and it is
    // retired below.
    //
    // MUTANT THIS KILLS: the producer handing over a line-derived total with no tax beside it (the
    // state this product shipped in until v0 gap 2), AND a rounding that never reaches the paper.
    setPosture("exclusive", "1600");
    const paper = await paperFor(111_400);
    expect(paper).toContain("Subtotal Rs 960");
    expect(paper, "the tax row dropped its paisa — the R70 defect").toContain("Tax Rs 153.60");
    expect(paper, "no rounding row, so the rows cannot close").toContain("Rounded up Rs 0.40");
    expect(paper, "the Total is not the rounded charge").toContain("Total Rs 1,114");
    // And the *pre*-rounding figure is nowhere on the paper: a customer holding this cannot find a
    // number she was not charged.
    expect(paper, "the unrounded total reached the customer's copy").not.toContain("Rs 1,113");
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
    const paper = await paperFor(111_400);
    for (const banned of ["FBR", "PRA", "FISCAL", "Invoice No", "USIN"]) {
      expect(paper, `the receipt claims "${banned}"`).not.toContain(banned);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `02-F63` (R70): THE ROWS CLOSE AS PRINTED, AND THE AMOUNT TAKEN IS A WHOLE RUPEE.
//
// ⚠ **THIS SECTION WAS A FINDING BLOCK — GREEN ASSERTIONS DESCRIBING A DEFECT — AND IT IS RETIRED
// BY THE RULING IT ASKED FOR.** Its header read *"WHAT WHOLE-RUPEE RENDERING COSTS NOW THAT TAX
// EXISTS. Measured, not argued."*, and its two tests pinned the truncation: that the printed
// *Total* under-states `billed_total` by up to 99 paisa, and that `Rs 450 + Rs 74` prints against
// `Rs 525`. Both were correct. It closed *"NOT FIXED HERE, and the refusal is deliberate …
// **Owner: doc 27 + `packages/escpos`**"*, and `receipt-tax-line.test.ts`'s DEFERRED item 1 named
// the same gap as *"the sharpest open question in R39's scope"* with the owner *"a founder ruling
// + an FR"*.
//
// **R70 is that ruling and `02-F63` is that FR, and the two old assertions are INVERTED rather
// than deleted** — `line-advance.test.ts` §G's precedent, and AGENTS.md's own instruction that
// when a ruling lands you grep the suites encoding the old rule the same day. Each test below
// carries the figure the old one asserted, so a reversion is legible rather than silent.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F63 — sub-rupee is PRINTED, and the charge is rounded", () => {
  it("the printed Total is the ROUNDED charge, and the pre-rounding figure is nowhere on it", async () => {
    // WAS: `expect(paper).toContain("Total Rs 1,113")` with `not.toContain("1,113.6")` — the
    // customer's copy 60 paisa light against a Rs 1,113.60 tender. R70's answer is not to print
    // the paisa on the Total: it is that Rs 1,113.60 is not what she is charged. She pays Rs 1,114.
    setPosture("exclusive", "1600");
    const paper = await paperFor(111_400);
    expect(paper).toContain("Total Rs 1,114");
    expect(paper, "the unrounded total reached the paper").not.toContain("1,113");
  });

  it("R70's OWN EXAMPLE: Rs 450.70 + Rs 74.37 − Rs 0.07 = Rs 525, and the rows close", async () => {
    // ⚠ **THE BILL THE RULING WAS TAKEN ON, printed.** One line at Rs 450.70, exclusive at 16.5 %:
    // tax 7,437 paisa, pre-rounding total 52,507. The founder's words are *"round to rupees …
    // there is no concept of paisa"*, so the charge is **Rs 525.00** and the seven paisa become a
    // named row rather than a silent truncation.
    //
    // WAS: `Subtotal Rs 450` / `Tax Rs 74` / `Total Rs 525` — 450 + 74 = 524, printed against 525,
    // with the file's own comment reading *"the rows on the paper do not close, and the ledger's
    // do."* Every figure below is the same number rendered honestly.
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
            // The ROUNDED charge. At 52,507 the cover test refuses and nothing prints at all —
            // which is `02-F63` binding on the guard and the paper as one number.
            pay_total: 52_500,
            repaid_total: 0,
            refund_total: 0,
            pay_attempts_json: JSON.stringify({
              "attempt-1": [
                {
                  order_id: RECEIPT_ORDER,
                  amount_paisa: 52_500,
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
    // At least one transmit — the spooler is pumped by the printer AND by this test, so a
    // document can legitimately be handed over twice; what must not happen is ZERO, which is
    // what a cover test refusing the rounded charge would produce.
    expect(
      sent.length,
      "the cover test refused the rounded charge — nothing printed",
    ).toBeGreaterThan(0);
    const paper = String.fromCharCode(...(sent[0] as Uint8Array));
    expect(paper).toContain("Subtotal Rs 450.70");
    expect(paper).toContain("Tax Rs 74.37");
    expect(paper, "the rounding is invisible, so the rows do not close").toContain(
      "Rounded down Rs 0.07",
    );
    expect(paper).toContain("Total Rs 525");
    // `27-F12`: direction is a WORD. A minus sign is one glyph wide and means nothing to a
    // non-reader, and this is the row where an implementation reaches for one.
    expect(paper, "a minus sign reached the paper").not.toContain("-0.07");
    // And the amount TAKEN is a whole rupee — the physical constraint R70 (d) names.
    expect(paper).toContain("Cash Rs 525");
    expect(paper, "a coin that does not exist was asked for").not.toContain("Rs 525.07");
  });

  it("02-F63 (c): the seeded step is Rs 1, unset means the default, and a bad value REFUSES", () => {
    // `00 §7` (d): every layer-2 key declares a default and this one's is safe to be wrong about.
    // The asymmetry with the posture is deliberate and is the mutant worth naming: an unset
    // POSTURE means no tax regime (nothing happens), an unset STEP means the rupee (something
    // happens), because coins below a rupee have left circulation whether or not an owner typed
    // anything. MUTANT THIS KILLS: an unset step defaulting to 1 — no rounding, and the paper goes
    // back to asking for Rs 525.07.
    expect(DEFAULT_CHARGE_ROUNDING_PAISA).toBe(100);
    expect(resolveChargeRoundingPaisa({})).toBe(100);
    expect(resolveChargeRoundingPaisa({ [CHARGE_ROUNDING_ENV]: "  " })).toBe(100);
    expect(resolveChargeRoundingPaisa({ [CHARGE_ROUNDING_ENV]: "1000" })).toBe(1_000);
    // R70 names rupees and tens; the shape is bounded (one integer of paisa) and the VALUE is the
    // owner's, which is `00 §7`'s own division. A malformed one is refused with the key named,
    // never defaulted — `11-F22`'s precedent, and `16-F27`'s rate one field over.
    // `"1e3"` is deliberately NOT in this list: `Number("1e3")` is 1000, a perfectly good
    // integer of paisa, and refusing an exponent an operator is unlikely to type would be
    // inventing a rule. What is refused is what is NOT a positive integer.
    for (const bad of ["0", "-100", "1.5", "one rupee", "100rs", "NaN"]) {
      expect(
        () => resolveChargeRoundingPaisa({ [CHARGE_ROUNDING_ENV]: bad }),
        `"${bad}" was accepted`,
      ).toThrow(/02-F63/);
    }
  });
});
