// Acceptance tests — K-1, per-type `min_columns` and the refusal below it.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `03-F49` — the declared minimum and the refusal ("kot declares 42; receipt and bill declare
//              32"; "hard refusal to print plus an S1 band, never silent degradation";
//              "a 58 mm printer cannot print kitchen tickets. It can still print receipts and
//              bills").
//   `03-F34` — the refusal path `03-F49` reuses: "a hard refusal to print plus an S1 band
//              (27-F11d), never a silent degradation".
//   `03-F36` — "Every DocumentSpec must render correctly at its declared `min_columns`", which is
//              what makes EXACTLY the minimum a printable case rather than a boundary to refuse.
//   `03-F31` — the eight document types `min_columns` is declared per.
//   `03 §7`  — the capability record the gate reads.
//   `27-F57` — the comprehension constraint that produced the KOT's 42.
// No implementation was read; none exists. `plans/wave-1/kot-printing.md` was deliberately NOT read.
//
// NO HARDWARE IS INVOLVED. Every assertion is about a declared number and the shape of a returned
// decision. No test below observes a printer, and "nothing was printed" is asserted here only in
// the form K-1 can honestly assert it — see the DEFERRED note at the foot of this file.
//
// ── WHAT THE REFUSAL MUST BE, AND WHY IT IS A VALUE ──
//
// `03-F34` requires the failure to be "a hard refusal to print PLUS an S1 band". A band that must
// name the printer and the document cannot be raised from a bare exception, and `03-F49` adds a
// second consumer of the same four numbers — "Doc 14's printer setup must say so at assignment
// time, not at 20:40 on a Friday when the refusal fires", i.e. the same comparison runs at
// ASSIGNMENT, where nothing is being printed and throwing would be wrong. So `checkColumns`
// returns a decision. This is a DECLARED INTERPRETATION (24 §3b); the named alternative — a typed
// throw carrying the same fields — was rejected for the assignment-time reason above.
//
// ── FR GAPS, REPORTED RATHER THAN FILLED ──
//   1. `03-F49` says "Each `DocumentSpec` declares `min_columns`" and gives values for THREE of
//      `03-F31`'s eight types. The other five (`refund_slip`, `shift_close_slip`,
//      `rider_settlement_slip`, `day_summary`, `test_page`) have no stated minimum. This suite
//      therefore asserts the three that are stated, and asserts that whatever else is declared is
//      a real type with a sane value — it does NOT invent five numbers to make a table look full
//      (oracle round 2 §C pattern 3, "rows added to satisfy a gate for compositions that do not
//      exist").
//   2. `03-F49` says "a printer whose capability record reports fewer" WITHOUT NAMING THE FONT,
//      and the record carries two column counts. The FR's own stated consequence settles it and
//      the test below pins the resolution: see "the gate reads Font A".
//   3. `03-F49` puts `min_columns` on the `DocumentSpec` (K-4's type) while K-1 must export it to
//      be testable at all. K-4 must SOURCE `DocumentSpec.min_columns` from this constant; two
//      declarations of one number is the defect, and only K-4 can close it.

import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import {
  type ColumnDecision,
  checkColumns,
  DOCUMENT_TYPES_PER_03_F31,
  type DocumentType,
  type EscposK1Api,
  minColumns,
  type PrinterCapability,
  printerCapabilities,
  printerCapability,
  unknownPrinterCapability,
} from "./oracle-surface.js";

const api = escpos as unknown as EscposK1Api;

/**
 * A capability record built from `03 §7`'s own derivation, so a boundary case does not depend on
 * whatever the shipped table happens to contain. Font A = 12, Font B = 9 (`03 §7`); 203 dpi is a
 * fixture value and nothing below asserts on it.
 */
const capsAt = (cols_font_a: number, model_id: string): PrinterCapability => {
  const print_dots = cols_font_a * 12;
  return {
    model_id,
    dots: print_dots,
    dpi: 203,
    cols_font_a,
    cols_font_b: Math.floor(print_dots / 9),
    has_native_qr: false,
    has_cutter: false,
    raster_ok: true,
  };
};

const declaredTypes = (): DocumentType[] =>
  Object.keys(minColumns(api)).filter((key): key is DocumentType =>
    (DOCUMENT_TYPES_PER_03_F31 as readonly string[]).includes(key),
  );

const requiredFor = (document_type: DocumentType): number => {
  const declared = minColumns(api)[document_type];
  if (typeof declared !== "number")
    throw new Error(`MIN_COLUMNS.${document_type} is not declared yet (K-1, 03-F49)`);
  return declared;
};

describe("03-F49 — a document type declares its minimum columns", () => {
  it("03-F49/27-F57: the kot declares 42 columns", () => {
    // `03-F49`: "`kot` declares 42". `27-F57` states the same number from the other side — the
    // quantity-adjacent-to-name pairing "is the reason the KOT declares a minimum of 42 columns
    // and is refused below it rather than wrapped".
    expect(requiredFor("kot")).toBe(42);
  });

  it("03-F49: the receipt and the bill declare 32 columns, because a price column can degrade and a comprehension pairing cannot", () => {
    expect(requiredFor("receipt")).toBe(32);
    expect(requiredFor("bill")).toBe(32);
  });

  it("03-F49/03-F31: every declared minimum belongs to a real document type and is a usable column count", () => {
    const table = minColumns(api);
    const keys = Object.keys(table);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(DOCUMENT_TYPES_PER_03_F31, `${key} is not an 03-F31 document type`).toContain(key);
      const value = table[key as DocumentType];
      expect(Number.isInteger(value), `MIN_COLUMNS.${key} is an integer`).toBe(true);
      expect(value, `MIN_COLUMNS.${key} > 0`).toBeGreaterThan(0);
    }
  });

  it("03-F49: the kot's minimum is strictly above the receipt's — the two floors are different by design, not by accident", () => {
    // The FR exists because "`03-F36` made 32-column rendering a build-time gate while `27-F57`
    // held that 32 columns breaks the quantity-adjacent-to-name pairing — two floors that cannot
    // both bind", resolved by putting the difference in the TYPE. A table where every type
    // declares the same number has silently un-resolved the conflict.
    expect(requiredFor("kot")).toBeGreaterThan(requiredFor("receipt"));
    expect(requiredFor("kot")).toBeGreaterThan(requiredFor("bill"));
  });
});

describe("03-F49/03-F34 — below the minimum the document is REFUSED, and the refusal names its cause", () => {
  it("03-F49/03-F34: a sub-minimum printer produces a refusal that names the type, the printer, the requirement and the shortfall — and does not throw", () => {
    // "Assert what the refusal NAMES, not that something threw." It must also NOT throw: the same
    // comparison runs at printer-assignment time in doc 14, where nothing is printing.
    const caps = capsAt(41, "NARROW-41");
    let decision: ColumnDecision | undefined;
    expect(() => {
      decision = checkColumns(api, "kot", caps);
    }).not.toThrow();
    expect(decision).toBeDefined();
    const refusal = decision as Extract<ColumnDecision, { ok: false }>;

    expect(refusal.ok).toBe(false);
    expect(refusal.reason).toBe("min_columns_not_met");
    expect(refusal.severity).toBe("S1"); // 03-F34: "a hard refusal to print plus an S1 band"
    expect(refusal.document_type).toBe("kot");
    expect(refusal.model_id).toBe("NARROW-41");
    expect(refusal.required_columns).toBe(42);
    expect(refusal.available_columns).toBe(41);
  });

  it("03-F49/03-F34: the refusal carries no column count and no payload — there is no degraded document to fall back to", () => {
    // "never silent degradation". A refusal that also handed back a width would let a caller
    // print anyway at whatever it was given, which is the degradation the FR bans; a refusal that
    // carried bytes would be the same thing one layer down.
    const refusal = checkColumns(api, "kot", capsAt(32, "FIFTY-EIGHT-MM"));
    expect(refusal.ok).toBe(false);
    expect(Object.keys(refusal)).not.toContain("columns");
    const leaked = Object.keys(refusal).filter((key) =>
      /bytes|payload|buffer|data|blocks|document/i.test(key),
    );
    expect(leaked, "the refusal leaks something renderable").toEqual([]);
  });

  it("03-F49/03-F36: EXACTLY the declared minimum prints — the minimum is a floor the layout must survive, not a boundary to refuse", () => {
    // `03-F36`: "Every DocumentSpec must render correctly at its declared `min_columns`". So the
    // comparison is "reports FEWER" (`03-F49`), i.e. strictly less. This is the `<` vs `<=`
    // assertion, and getting it wrong makes every exactly-42-column printer unable to print KOTs.
    const kotMin = requiredFor("kot");
    expect(checkColumns(api, "kot", capsAt(kotMin - 1, "BELOW")).ok).toBe(false);
    expect(checkColumns(api, "kot", capsAt(kotMin, "EXACTLY")).ok).toBe(true);
    expect(checkColumns(api, "kot", capsAt(kotMin + 1, "ABOVE")).ok).toBe(true);

    const receiptMin = requiredFor("receipt");
    expect(checkColumns(api, "receipt", capsAt(receiptMin - 1, "BELOW")).ok).toBe(false);
    expect(checkColumns(api, "receipt", capsAt(receiptMin, "EXACTLY")).ok).toBe(true);
  });

  it("03-F49/03-F36: a wider printer is given its OWN column count, never clamped down to the minimum", () => {
    // Clamping to the minimum would be silent degradation of a printer that can do better;
    // clamping up would be `03-F36`'s off-paper failure. The answer is the record's own number.
    const wide = capsAt(48, "WIDE-48");
    const decision = checkColumns(api, "kot", wide);
    expect(decision.ok).toBe(true);
    expect((decision as Extract<ColumnDecision, { ok: true }>).columns).toBe(wide.cols_font_a);
  });

  it("03-F49: the gate reads Font A — a 58 mm printer cannot print kitchen tickets even though its Font B count reaches 42", () => {
    // FR GAP 2, resolved from the FR's own stated consequence rather than by preference. A 32
    // Font-A-column printer has 384 printable dots, hence floor(384 ÷ 9) = 42 Font-B columns —
    // exactly the KOT's minimum. A gate that read Font B would therefore make `03-F49`'s flat
    // statement "a 58 mm printer cannot print kitchen tickets" FALSE, and would satisfy the
    // column count by shrinking the type below the size `27-F56` reserves for the item line.
    const narrow = capsAt(32, "BC-58U-CLASS");
    expect(narrow.cols_font_b).toBe(42);
    expect(narrow.cols_font_b).toBeGreaterThanOrEqual(requiredFor("kot"));

    const kot = checkColumns(api, "kot", narrow);
    expect(kot.ok).toBe(false);
    expect((kot as Extract<ColumnDecision, { ok: false }>).available_columns).toBe(32);

    // "It can still print receipts and bills" — the same printer, the other two types.
    expect(checkColumns(api, "receipt", narrow).ok).toBe(true);
    expect(checkColumns(api, "bill", narrow).ok).toBe(true);
  });
});

describe("03 §7/03-F49 — the conservative default meets the gate", () => {
  it("03 §7/03-F49: an UNKNOWN printer refuses the kot — the conservative 32 is below the KOT's 42", () => {
    // This is what "conservative" buys. An unknown model that defaulted high would print a
    // mangled KOT, and `03-F50` names why that is the worst class of failure on this surface:
    // "a line silently absent from every ticket is the one failure the paper cannot reveal".
    const fallback = printerCapability(api, "never-seen-model-9000");
    const decision = checkColumns(api, "kot", fallback);
    expect(decision.ok).toBe(false);
    expect((decision as Extract<ColumnDecision, { ok: false }>).available_columns).toBe(32);
    expect((decision as Extract<ColumnDecision, { ok: false }>).required_columns).toBe(42);
  });

  it("03 §7/03-F49: an UNKNOWN printer still prints receipts and bills — the default sits exactly on their floor", () => {
    const fallback = unknownPrinterCapability(api);
    expect(fallback.cols_font_a).toBe(requiredFor("receipt"));
    expect(checkColumns(api, "receipt", fallback).ok).toBe(true);
    expect(checkColumns(api, "bill", fallback).ok).toBe(true);
  });
});

describe("03-F49 — the purchasing fact is live in the shipped table, not just in prose", () => {
  it("03-F49: the shipped table contains a printer that CANNOT print kitchen tickets and one that can", () => {
    // "The consequence is a purchasing fact, and it is stated rather than hidden: a 58 mm printer
    // cannot print kitchen tickets." `03-F1` ships 58 mm and 80 mm, and `03-F10` names the
    // Black Copper BC-58U as a baseline compatibility target — so both sides of the gate must
    // exist in the table. A table with only wide models makes the refusal unreachable in the
    // field and the FR untestable; a table with only narrow ones prints no KOTs at all.
    const rows = printerCapabilities(api);
    expect(rows.length).toBeGreaterThan(0);
    const kotMin = requiredFor("kot");
    const refused = rows.filter((row) => checkColumns(api, "kot", row).ok === false);
    const allowed = rows.filter((row) => checkColumns(api, "kot", row).ok === true);
    expect(refused.length, `no shipped model is below the KOT's ${kotMin} columns`).toBeGreaterThan(
      0,
    );
    expect(allowed.length, `no shipped model reaches the KOT's ${kotMin} columns`).toBeGreaterThan(
      0,
    );
  });
});

describe("03-F49/03-F34 — totality: over every record and every declared type, there is no third outcome", () => {
  it("03-F49/03-F34: the gate NEVER approves below the minimum and NEVER refuses at or above it — enumerated over the whole cross-product", () => {
    const types = declaredTypes();
    const records = [...printerCapabilities(api), unknownPrinterCapability(api)];
    expect(types.length).toBeGreaterThan(0);
    expect(records.length).toBeGreaterThan(0);

    let approvals = 0;
    let refusals = 0;
    for (const document_type of types) {
      const required = requiredFor(document_type);
      for (const caps of records) {
        const decision = checkColumns(api, document_type, caps);
        const label = `${document_type} on ${caps.model_id} (${caps.cols_font_a} cols, needs ${required})`;
        if (caps.cols_font_a < required) {
          expect(decision.ok, label).toBe(false);
          const refusal = decision as Extract<ColumnDecision, { ok: false }>;
          expect(refusal.reason, label).toBe("min_columns_not_met");
          expect(refusal.severity, label).toBe("S1");
          expect(refusal.document_type, label).toBe(document_type);
          expect(refusal.model_id, label).toBe(caps.model_id);
          expect(refusal.required_columns, label).toBe(required);
          expect(refusal.available_columns, label).toBe(caps.cols_font_a);
          refusals++;
        } else {
          expect(decision.ok, label).toBe(true);
          const approval = decision as Extract<ColumnDecision, { ok: true }>;
          expect(approval.columns, label).toBe(caps.cols_font_a);
          expect(approval.columns, label).toBeGreaterThanOrEqual(required);
          approvals++;
        }
      }
    }
    // Both branches must actually have run. An enumeration that only ever took one arm is the
    // shape of oracle round 2's finding A13 — a suite that stays green having asserted nothing
    // about the case it was written for.
    expect(refusals, "no refusal was exercised by the cross-product").toBeGreaterThan(0);
    expect(approvals, "no approval was exercised by the cross-product").toBeGreaterThan(0);
  });

  it("03-F49/03-F34: swept across every column count from 0 to 64, the gate is exactly the `< min` step — no window where it degrades instead", () => {
    // Exhaustive over the whole usable range rather than sampled: this is where a "squeeze at 40,
    // refuse at 30" degradation band would hide, and `03-F49` says there is no such band.
    const kotMin = requiredFor("kot");
    for (let cols = 1; cols <= 64; cols++) {
      const decision = checkColumns(api, "kot", capsAt(cols, `SWEEP-${cols}`));
      expect(decision.ok, `kot at ${cols} columns`).toBe(cols >= kotMin);
    }
  });
});

// ── DEFERRED FROM K-1, DELIBERATELY ──
//
// * "NOTHING WAS PRINTED", at the byte level. K-1 can assert that the refusal is a distinct
//   outcome carrying no column count and no renderable payload (above), and that no approval is
//   ever issued below the minimum. It CANNOT assert that no bytes reached a transport, because
//   neither an encoder (K-2) nor a `Transport` (K-3) exists — a spy sink written now would have
//   nothing to spy on and would pass by finding nothing. K-3 owns the assertion that a refused
//   document results in zero writes to the transport; K-4 owns the assertion that `render()`
//   returns no blocks on refusal.
// * THE S1 BAND ITSELF. `03-F34` requires "an S1 band (27-F11d)" — a persistent, undismissable
//   banner with an attributed acknowledgement. That is a `packages/ui` surface, not an escpos
//   one. K-1 asserts only that the refusal is CLASSIFIED S1 and carries the fields such a band
//   needs to name the printer and the document.
// * `03-F34`'s OTHER THREE refusal causes (a missing adapter-mandatory block, an undersized
//   fiscal QR, an owner slot inside a locked region) share this refusal path. They are K-4's, and
//   K-4 must assert that their `reason` codes are DISTINCT from `min_columns_not_met` — a shared
//   code would make the S1 band unable to say what is actually wrong.
// * `03-F34`'s NAMED REGRESSION — "the shipped default always validates and always saves" — is
//   about `DocumentProfile` save-time linting, which is K-4's surface. It is named here so it is
//   not lost: the FR calls it a named test, and no K-1 assertion covers it.
