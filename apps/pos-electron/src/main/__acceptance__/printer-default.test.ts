// The shipped kitchen-printer DEFAULT — `03 §7` layer 3, `03-F49`, `03-F34`, `DEC-HW-001` (1).
//
// WHY THIS FILE EXISTS. `main/index.ts` defaulted to `printerCapability("TH230")` — a model this
// till has never had — and every printing suite in the repo INJECTS its own capability, so not one
// of them ever evaluated the default. That is the wave's named defect in its quietest form: the
// argument at a call site, unreached by any behavioural test.
//
// It was not merely a dishonest label. `render()` lays out against the record it is handed, and
// `TH230` claims 44 Font-A columns on 576 dots. Attach `03-F10`'s baseline BC-58U (384 dots)
// without setting `RESTOS_KOT_PRINTER` and the product lays out a 44-column ticket on 58 mm
// paper: measured at 320 discarded dots, a whole word off the right edge, with no signal to the
// cook. `03-F34` bans exactly that ("never a silent degradation"), and the exposure was aimed at
// the corpus's own named installed base.
//
// `03 §7` already states the answer — "defaulting **conservatively to 32** for an unknown model" —
// and the app was overriding it precisely to dodge `03-F49`'s refusal. The refusal is correct: a
// till with no printer cannot print a kitchen ticket, and `03-F34`'s S1 band saying so is the
// honest signal.
//
// WHAT IS ASSERTED, AND WHY IT IS NOT A STRING PIN. `K-3`'s dead-oracle defect is asserting
// against a hand-copy, so this file does not pin the default's spelling. It extracts whatever
// expression `index.ts` actually passes and drives it through the REAL `printerCapability`, then
// asserts the PROPERTY: the default must resolve to a record that claims nothing and refuses the
// KOT. Rename the default to any other unrecognised id and this stays green; point it at a model
// row and it reddens.
//
// `index.ts` imports `electron`, so it cannot be imported here — the source read is the house
// pattern (`catalog-seam.test.ts` §D, `strip-attribution.test.ts` §B) for that reason.

import { readFileSync } from "node:fs";
import {
  checkColumns,
  MIN_COLUMNS,
  PRINTER_CAPABILITIES,
  printerCapability,
  UNKNOWN_PRINTER_CAPABILITY,
} from "@restos/escpos";
import { describe, expect, it } from "vitest";

const INDEX_SRC = readFileSync(new URL("../index.ts", import.meta.url).pathname, "utf8");

/**
 * Comments stripped. This file's own prose names `TH230` repeatedly, and so does `index.ts`'s
 * header explaining why it no longer uses it — a scan that counted those would fail open on the
 * one thing it guards. Whole-line `//` only, so a `//` inside a string literal survives.
 */
const CODE = INDEX_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The fallback `kotCapability` passes when `RESTOS_KOT_PRINTER` is unset. */
const DEFAULT_MODEL_ID = /RESTOS_KOT_PRINTER"\]\s*\?\?\s*"([^"]*)"/.exec(CODE)?.[1];

describe("the shipped kitchen-printer default (03 §7, DEC-HW-001)", () => {
  it("is actually reading the wiring it guards (24-F14 empty-match protection)", () => {
    expect(CODE).toContain("kotCapability");
    expect(CODE).toContain("RESTOS_KOT_PRINTER");
    expect(
      DEFAULT_MODEL_ID,
      "no `RESTOS_KOT_PRINTER ?? <literal>` fallback found in main/index.ts — this guard has " +
        "nothing to measure and must not pass vacuously",
    ).toBeTypeOf("string");
  });

  it("03 §7: the default is an UNKNOWN model, so the record claims nothing it has not verified", () => {
    const claimed = PRINTER_CAPABILITIES.find((row) => row.model_id === DEFAULT_MODEL_ID);
    expect(
      claimed,
      `main/index.ts defaults to "${DEFAULT_MODEL_ID}", which is a row in the shipped capability ` +
        "table. Nothing has verified that this device has that printer, and `render()` lays out " +
        "against whatever the record claims — so a narrower printer than the claim silently " +
        "truncates the ticket (03-F34). The default must be an unrecognised id.",
    ).toBeUndefined();
  });

  it("03 §7: it resolves to the conservative 32-column record, keeping its own id for 03-F5", () => {
    const caps = printerCapability(DEFAULT_MODEL_ID as string);
    // "defaulting conservatively to 32 for an unknown model" — the width the 58 mm floor gives.
    expect(caps.cols_font_a).toBe(32);
    expect(caps.cols_font_a).toBe(UNKNOWN_PRINTER_CAPABILITY.cols_font_a);
    // Under-claimed in every direction a feature can be claimed.
    expect(caps.has_cutter).toBe(false);
    expect(caps.has_native_qr).toBe(false);
    // `03-F5`'s band names the printer the operator is standing at, so the id survives the lookup.
    expect(caps.model_id).toBe(DEFAULT_MODEL_ID);
  });

  it("03-F49/03-F34: an unconfigured till REFUSES the KOT and the refusal carries both numbers", () => {
    const decision = checkColumns("kot", printerCapability(DEFAULT_MODEL_ID as string));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.reason).toBe("min_columns_not_met");
    expect(decision.severity).toBe("S1");
    // doc 14 needs both numbers at assignment time (`03-F49`), and so does the band's sentence.
    expect(decision.required_columns).toBe(MIN_COLUMNS.kot);
    expect(decision.available_columns).toBe(32);
    expect(decision.model_id).toBe(DEFAULT_MODEL_ID);
  });

  it("the receipt still prints — the refusal is per TYPE, not a dead printer (03-F49)", () => {
    // `03-F49`: "a 58 mm printer cannot print kitchen tickets. It can still print receipts and
    // bills." A default that refused everything would be a different (and wrong) claim.
    const caps = printerCapability(DEFAULT_MODEL_ID as string);
    expect(checkColumns("receipt", caps).ok).toBe(true);
    expect(checkColumns("bill", caps).ok).toBe(true);
  });

  it("an explicitly configured real printer still prints its KOT (the override is intact)", () => {
    // The default is conservative, not a ban: naming a real 80 mm model is what doc 14's printer
    // assignment will do, and it must reach the printing path unchanged.
    expect(checkColumns("kot", printerCapability("TH230")).ok).toBe(true);
  });
});

// ── DEFERRED ────────────────────────────────────────────────────────────────────────────────────
//
// * **Whether this device has a printer at all is still not modelled.** `DEC-HW-001` (c) records
//   that absence-of-a-printer is expressed as FAILURE rather than configuration, and there is no
//   `printer: none` mode in the corpus or the code. This file makes the default honest about
//   CAPABILITY; it does not invent that mode, which would be commandment 2.
// * **The band's wording for a printerless till is doc 03's, not this file's.** The refusal now
//   reads "needs 42 columns, this printer has 32" for a printer that does not exist. That is a
//   true statement about the record in force and a slightly odd sentence about the world; the
//   sentence improves when `01-F47`/doc 14 carry a real assignment.
// * **K-8 is untouched.** Nothing here is evidence about any physical printer.
