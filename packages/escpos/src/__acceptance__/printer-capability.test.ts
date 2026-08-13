// Acceptance tests — K-1, the printer capability record and the columns derivation.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session), namely
// `specs/03-kitchen-fulfillment.md §7` "Layer 3 (branch/device)" and `03-F36`. No implementation
// was read; none exists (`src/index.ts` is a 2-line stub). `plans/wave-1/kot-printing.md` was
// deliberately NOT read.
//
// NO HARDWARE IS INVOLVED. Every assertion below is about a table row, a derived integer, or the
// shape of a returned value. Nothing here opens a transport and no test name claims a printer was
// observed. `03 §7`'s numbers came from a rig (`03-F10`); this suite pins that the SHIPPED TABLE
// still says what the spec says, which is a source-of-truth check, not a measurement.
//
// ── The paragraph this suite is built from, quoted because the assertions are its clauses ──
//
//   "'Paper width' as a `58 | 80` enum is WITHDRAWN (July 2026) — it silently truncates the PRICE
//    column. The folklore that 80 mm means 42 or 48 columns is wrong twice over: 42-vs-48 is a
//    *resolution* difference, not a font one, and there is a third value — a TH230 at 576 dots
//    gives 44 Font-A columns while a TM-P80 at the same 576 dots gives 42 and a TM-T20II gives
//    48. Layout is therefore expressed in columns, derived as `print_dots ÷ font_cell_dots`
//    (Font A = 12, Font B = 9) from a per-model capability record `{model_id, dots, dpi,
//    cols_font_a, cols_font_b, has_native_qr, has_cutter, raster_ok}`, seeded from a shipped
//    table, defaulting conservatively to 32 for an unknown model, with a technician override in
//    the 03-F10 test harness."
//
// ── A DEFECT IN THE FR, PINNED RATHER THAN PAPERED OVER (reported, not silently resolved) ──
//
// The formula's input is named `print_dots`. The record has no `print_dots` field; it has `dots`.
// And the paragraph's own three worked examples are INCONSISTENT with `columns = dots ÷ cell`:
// 576 ÷ 12 = 48 for all three, yet the stated answers are 44, 42 and 48. So `dots` and
// `print_dots` are different numbers for at least two of the three named models — a printable
// width narrower than the head, which is exactly why the same 576-dot head yields three column
// counts. Either the record needs a `print_dots` field, or `dots` already means print_dots and
// the phrase "at 576 dots" refers to the head. **The FR does not say which.**
//
// This suite handles that the only honest way available to it:
//   * `cols_font_a` is pinned to the three STATED outputs (44 / 42 / 48) — unambiguous under
//     either reading, and the one number every consumer of the record actually uses.
//   * the derivation is asserted as a RELATION (some print_dots ≤ dots reproduces both column
//     counts) rather than as `dots ÷ 12`, which is true under either reading.
//   * `dots === 576` for TH230 and TM-P80 is pinned in ONE clearly-labelled test, because §7
//     says it in those words. If the implementer resolves the ambiguity the other way, that test
//     is where the resolution must surface, and it is a spec PR to `03 §7` (commandment 9), not a
//     test edit (24-F5).
//
// ── ALSO REPORTED, NOT ASSERTED ──
//   * `raster_ok`'s conservative direction is unstated and BOTH directions have a named failure
//     (`false` suppresses `03-F35`'s always-rasterised fiscal QR, whose absence "is an offence
//     that can seal the premises"; `true` claims a capability an unknown printer may lack). This
//     suite asserts only that the field is declared and boolean.
//   * The technician override (`03 §7`, "in the 03-F10 test harness") has no declared bound and
//     no owning K-task. Untested here.

import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import {
  deriveColumns,
  type EscposK1Api,
  fontCellDots,
  type PrinterCapability,
  printerCapabilities,
  printerCapability,
  unknownPrinterCapability,
} from "./oracle-surface.js";

const api = escpos as unknown as EscposK1Api;

/** `03 §7` names three models with three different Font-A column counts. */
const TH230 = "TH230";
const TM_P80 = "TM-P80";
const TM_T20II = "TM-T20II";

/** The eight fields `03 §7` lists inside the record literal, with their runtime types. */
const RECORD_FIELDS = {
  model_id: "string",
  dots: "number",
  dpi: "number",
  cols_font_a: "number",
  cols_font_b: "number",
  has_native_qr: "boolean",
  has_cutter: "boolean",
  raster_ok: "boolean",
} as const;

/** Table ∪ default — every capability record the package can hand a caller. */
const allRecords = (): PrinterCapability[] => [
  ...printerCapabilities(api),
  unknownPrinterCapability(api),
];

/**
 * The derivation, run as an ORACLE rather than borrowed from the implementation: the set of
 * printable dot widths that would produce `cols` columns in a cell `cell` dots wide, given that a
 * partial cell cannot be printed. `floor(pd / cell) === cols`  ⟺  `pd ∈ [cols*cell, cols*cell + cell - 1]`.
 */
const printDotsWindow = (cols: number, cell: number): { lo: number; hi: number } => ({
  lo: cols * cell,
  hi: cols * cell + cell - 1,
});

describe("03 §7 layer 3 — the capability record is the per-model source of truth", () => {
  it("03 §7: FONT_CELL_DOTS declares Font A = 12 and Font B = 9, in dots", () => {
    const cells = fontCellDots(api);
    expect(cells.A).toBe(12);
    expect(cells.B).toBe(9);
  });

  it("03 §7: every shipped record carries all eight declared fields, correctly typed", () => {
    const records = allRecords();
    // Non-vacuity: a table that shipped empty would satisfy a per-row loop with zero assertions
    // (oracle round 2, finding A13 — "the guard passed by not looking").
    expect(records.length).toBeGreaterThan(0);
    for (const row of records) {
      for (const [field, expected_type] of Object.entries(RECORD_FIELDS)) {
        expect(
          typeof (row as unknown as Record<string, unknown>)[field],
          `${row.model_id}.${field}`,
        ).toBe(expected_type);
      }
    }
  });

  it("03 §7: the record's numbers are physically meaningful — positive integers, and Font B is finer than Font A", () => {
    const records = allRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const row of records) {
      for (const field of ["dots", "dpi", "cols_font_a", "cols_font_b"] as const) {
        expect(Number.isInteger(row[field]), `${row.model_id}.${field} is an integer`).toBe(true);
        expect(row[field], `${row.model_id}.${field} > 0`).toBeGreaterThan(0);
      }
      // A 9-dot cell fits strictly more columns than a 12-dot cell across the same paper. A row
      // where these are equal is a copy-paste, not a measurement.
      expect(row.cols_font_b, `${row.model_id}: Font B out-columns Font A`).toBeGreaterThan(
        row.cols_font_a,
      );
    }
  });

  it("03 §7: model_id is the lookup key, so the shipped table declares each model once", () => {
    const ids = printerCapabilities(api).map((row) => row.model_id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("03 §7 layer 3 — the three stated models, which are the whole reason the enum was withdrawn", () => {
  it("03 §7: the shipped table reproduces the three STATED Font-A column counts — TH230 44, TM-P80 42, TM-T20II 48", () => {
    expect(printerCapability(api, TH230).cols_font_a).toBe(44);
    expect(printerCapability(api, TM_P80).cols_font_a).toBe(42);
    expect(printerCapability(api, TM_T20II).cols_font_a).toBe(48);
  });

  it("03 §7: `cols_font_a` is NOT `dots ÷ 12` — the same 576-dot head gives 44 on one model and 42 on another", () => {
    // This is the assertion that kills the obvious wrong implementation. §7: "a TH230 at 576 dots
    // gives 44 Font-A columns while a TM-P80 at the same 576 dots gives 42". Both cannot be
    // 576 ÷ 12. See the FR-defect note in this file's header — `dots === 576` is the reading §7
    // states in words, and this test is where a different resolution must surface.
    const th230 = printerCapability(api, TH230);
    const tmP80 = printerCapability(api, TM_P80);

    expect(th230.dots).toBe(576);
    expect(tmP80.dots).toBe(576);
    expect(th230.dots).toBe(tmP80.dots);
    expect(th230.cols_font_a).not.toBe(tmP80.cols_font_a);

    // The naive derivation, computed here so the refutation is visible rather than asserted.
    const naive = Math.floor(576 / 12);
    expect(naive).toBe(48);
    expect(th230.cols_font_a).not.toBe(naive);
    expect(tmP80.cols_font_a).not.toBe(naive);
  });

  it("03 §7: 42-vs-48 is a resolution difference, not a font one — two models differ in columns at the same dpi", () => {
    // §7: "the folklore that 80 mm means 42 or 48 columns is wrong twice over: 42-vs-48 is a
    // *resolution* difference, not a font one". Read as a property of the table: models sharing a
    // dpi must not be assumed to share a column count, so the table must contain such a pair.
    // Without this the WHOLE paragraph reduces to "columns come from dots", which it explicitly
    // does not.
    const rows = printerCapabilities(api);
    const differingAtSameDpi = rows.some((a) =>
      rows.some((b) => a.dpi === b.dpi && a.cols_font_a !== b.cols_font_a),
    );
    expect(differingAtSameDpi, "no two shipped models differ in columns at one dpi").toBe(true);
  });
});

describe("03 §7 layer 3 — `print_dots ÷ font_cell_dots`", () => {
  it("03 §7: deriveColumns floors — a partial cell is not a column, because the extra column would print off-paper", () => {
    const cells = fontCellDots(api);
    // Discriminating points, not restatements of the formula: each one separates floor from
    // round and from ceil. `03-F36` names off-paper as the failure that makes this directional.
    expect(deriveColumns(api, 575, "A")).toBe(47); // round/ceil would say 48 → 576 dots needed
    expect(deriveColumns(api, 576, "A")).toBe(48);
    expect(deriveColumns(api, 587, "A")).toBe(48); // ceil would say 49
    expect(deriveColumns(api, 11, "A")).toBe(0); // a head narrower than one cell prints no columns
    expect(deriveColumns(api, 12, "A")).toBe(1);
    expect(deriveColumns(api, 8, "B")).toBe(0);
    expect(deriveColumns(api, 9, "B")).toBe(1);
    expect(deriveColumns(api, 384, "B")).toBe(42); // 42.67 — round would say 43
    expect(cells.A).toBe(12); // anchors the two constants the points above are computed against
    expect(cells.B).toBe(9);
  });

  it("03 §7: deriveColumns is exhaustively `floor(print_dots ÷ cell)` and NEVER exceeds the paper, for 0..1200 dots in both fonts", () => {
    // Exhaustive rather than sampled: the domain is small and total coverage is strictly stronger
    // than a property run. The second assertion is the one with teeth — `columns * cell <= dots`
    // is the invariant `03-F36`'s "off-paper at 384" is about.
    const cells = fontCellDots(api);
    let checked = 0;
    for (const font of ["A", "B"] as const) {
      const cell = cells[font];
      for (let dots = 0; dots <= 1200; dots++) {
        const cols = deriveColumns(api, dots, font);
        expect(cols, `deriveColumns(${dots}, ${font})`).toBe(Math.floor(dots / cell));
        expect(cols * cell, `font ${font} at ${dots} dots stays on paper`).toBeLessThanOrEqual(
          dots,
        );
        checked++;
      }
    }
    expect(checked).toBe(2 * 1201);
  });

  it("03 §7: every shipped record is CONSISTENT with the derivation — some printable width ≤ `dots` yields both its column counts", () => {
    // The tolerant form of the derivation, forced by the FR defect noted in the header: the
    // record does not carry `print_dots`, so the law that can be asserted is that one exists.
    // This still catches the real defect — a hand-typed `cols_font_b` that no single printable
    // width can produce alongside its `cols_font_a`.
    const cells = fontCellDots(api);
    const records = allRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const row of records) {
      const a = printDotsWindow(row.cols_font_a, cells.A);
      const b = printDotsWindow(row.cols_font_b, cells.B);
      const lo = Math.max(a.lo, b.lo);
      const hi = Math.min(a.hi, b.hi);
      expect(
        lo,
        `${row.model_id}: no printable width yields both ${row.cols_font_a}A and ${row.cols_font_b}B`,
      ).toBeLessThanOrEqual(hi);
      expect(
        lo,
        `${row.model_id}: its column counts need ${lo} printable dots but the head is ${row.dots}`,
      ).toBeLessThanOrEqual(row.dots);
    }
  });
});

describe("03 §7 layer 3 — the conservative default for an unknown model", () => {
  it("03 §7: an unknown model_id yields the conservative record, never undefined and never a throw", () => {
    const unknown = printerCapability(api, "no-such-printer-9000");
    const declared = unknownPrinterCapability(api);
    expect(unknown).toBeDefined();
    for (const field of ["dots", "dpi", "cols_font_a", "cols_font_b"] as const) {
      expect(unknown[field], `unknown model ${field}`).toBe(declared[field]);
    }
    for (const field of ["has_native_qr", "has_cutter", "raster_ok"] as const) {
      expect(unknown[field], `unknown model ${field}`).toBe(declared[field]);
    }
    // The refusal has to name a printer (`03-F5`'s precedent), so the record must carry an id.
    // WHICH id — the requested string or a sentinel — the FR does not say; only that one exists.
    expect(typeof unknown.model_id).toBe("string");
    expect(unknown.model_id.length).toBeGreaterThan(0);
  });

  it("03 §7: the default is 32 columns", () => {
    expect(unknownPrinterCapability(api).cols_font_a).toBe(32);
  });

  it("03 §7: 32 is conservative in the RIGHT DIRECTION — it under-claims against every shipped model", () => {
    // "Conservative" has a direction and only one of them is safe: a default ABOVE some shipped
    // model's real width would lay out lines that run off that model's paper, silently, which is
    // the failure `03-F36` and the withdrawn 58|80 enum are both about.
    const rows = printerCapabilities(api);
    expect(rows.length).toBeGreaterThan(0);
    const fallback = unknownPrinterCapability(api);
    for (const row of rows) {
      expect(
        fallback.cols_font_a,
        `default over-claims against ${row.model_id}`,
      ).toBeLessThanOrEqual(row.cols_font_a);
      expect(
        fallback.cols_font_b,
        `default over-claims against ${row.model_id}`,
      ).toBeLessThanOrEqual(row.cols_font_b);
      expect(fallback.dots, `default over-claims dots against ${row.model_id}`).toBeLessThanOrEqual(
        row.dots,
      );
    }
  });

  it("03 §7/03-F35/03-F10: the default claims no capability it cannot verify — no native QR, no cutter", () => {
    // DECLARED INTERPRETATION (24 §3b): "defaulting conservatively" is read as governing the
    // whole record, not the column count alone. The simpler alternative — that it governs only
    // the 32 — is named and rejected because the corpus supplies a concrete counter-example for
    // each flag: `03-F35` says cheap printers "report no QR capability and fail silently", and
    // `03-F10` records that the BC-58U, a NAMED baseline compatibility target, "has NO
    // auto-cutter". A default of `true` asserts a cutter on a printer this corpus says lacks one.
    const fallback = unknownPrinterCapability(api);
    expect(fallback.has_native_qr).toBe(false);
    expect(fallback.has_cutter).toBe(false);
    // `raster_ok` is DELIBERATELY not pinned — see the header. Only its declaration is asserted.
    expect(typeof fallback.raster_ok).toBe("boolean");
  });
});

describe('03 §7 layer 3 — "paper width" as a 58|80 enum is WITHDRAWN', () => {
  it("03 §7: no capability record carries a paper-width field", () => {
    const records = allRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const row of records) {
      const offenders = Object.keys(row).filter((key) => /paper|width/i.test(key));
      expect(offenders, `${row.model_id} carries a withdrawn paper-width field`).toEqual([]);
    }
  });

  it("03 §7: the package exports no paper-width enum, and no exported value is the {58, 80} pair", () => {
    const exported = Object.entries(escpos as unknown as Record<string, unknown>);
    // NON-VACUITY GUARD, and the reason it is here is that this test WAS the vacuous one: on the
    // RED run it was the single green test in the suite, because a module that exports nothing
    // trivially exports no paper-width enum. That is oracle round 2 §C pattern 2 — "the guard
    // passed by not looking" — so the scan is gated on the module having a surface to scan.
    expect(exported.length, "nothing is exported, so this scan proves nothing").toBeGreaterThan(0);
    const namedOffenders = exported.map(([name]) => name).filter((n) => /paper.?width/i.test(n));
    expect(namedOffenders, "a withdrawn paper-width export").toEqual([]);

    const isFiftyEightEighty = (value: unknown): boolean => {
      const values = Array.isArray(value)
        ? value
        : value !== null && typeof value === "object"
          ? Object.values(value)
          : [];
      const set = new Set(values);
      return set.size === 2 && set.has(58) && set.has(80);
    };
    const valueOffenders = exported
      .filter(([, value]) => isFiftyEightEighty(value))
      .map(([n]) => n);
    expect(valueOffenders, "an export whose value set is the withdrawn 58|80 enum").toEqual([]);
  });
});

describe("03-F36 — layout is columns; an absolute dot offset means different things on different paper", () => {
  it("03-F36: a column count is never a dot count — `cols_*` is strictly smaller than `dots` on every record", () => {
    // The cheapest unit confusion in this module, and the one that would put an `x=` where a
    // column index belongs. True by construction (a cell is ≥ 9 dots wide), which is the point:
    // if it ever fails, a dot figure has been stored in a column field.
    const records = allRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const row of records) {
      expect(row.cols_font_a, `${row.model_id}: cols_font_a < dots`).toBeLessThan(row.dots);
      expect(row.cols_font_b, `${row.model_id}: cols_font_b < dots`).toBeLessThan(row.dots);
    }
  });

  it("03-F36: the FR's own counter-example is a LIVE fact about the shipped table — one offset is mid-line on one model and off-paper on another", () => {
    // `03-F36`: "an `x=384` offset is mid-line at 576 dots and off-paper at 384". That sentence is
    // only an argument if the table actually spans widths; on a single-width table the ban would
    // be unfalsifiable prose. Generalised so it does not depend on 384 or 576 being in the table:
    // addressable dots are 0..dots-1, so the NARROWEST head's own dot count is an offset that is
    // on-paper on the widest and off-paper on the narrowest.
    const records = allRecords();
    const widths = records.map((row) => row.dots);
    const narrow = Math.min(...widths);
    const wide = Math.max(...widths);
    expect(narrow, "the shipped table spans only one paper width").toBeLessThan(wide);

    const onPaper = (offset: number, dots: number): boolean => offset < dots;
    expect(onPaper(narrow, wide), `offset ${narrow} should be mid-line on a ${wide}-dot head`).toBe(
      true,
    );
    expect(
      onPaper(narrow, narrow),
      `offset ${narrow} should be off-paper on a ${narrow}-dot head`,
    ).toBe(false);
  });
});

// ── DEFERRED FROM K-1, DELIBERATELY (stated so the gap is a decision, not an omission) ──
//
// `03-F36`'s two bans are assertions about EMITTED BYTES, and no encoder exists at K-1. Nothing
// in this package can yet emit anything, so a scanner run over `src/` today would pass by finding
// nothing — the exact "guard passed by not looking" shape (oracle round 2, §C pattern 2). These
// therefore belong to K-2, which owns the encoder, and are named here so K-2 inherits them:
//
//   * ABSOLUTE DOT POSITIONING IS BANNED — no emitted byte stream may contain `ESC $` (1B 24) or
//     `GS $` (1D 24) absolute-position commands, nor `ESC \` / `GS \` relative-position commands
//     used as layout. Assertable only against an encoder's output.
//   * SPACE-AS-LAYOUT IS BANNED — no emitted line may use a run of spaces to reach a column;
//     alignment is `ESC a` / declared block structure. Assertable only against an encoder's
//     output, and only once `03-F36`'s declared degradation order (full `left | right` → the
//     block's `short` form → drop the label, keep the number → wrap to two rows) exists to
//     produce lines at all — which is K-4/K-5, not K-2.
//   * "EVERY DocumentSpec RENDERS CORRECTLY AT ITS DECLARED `min_columns`" — the build-time gate
//     of `03-F36`. Needs `DocumentSpec` (K-4) and at least one spec (K-5). K-1 supplies only the
//     number it is gated against.
//
// Also deferred, to K-4: `03-F49` says the DocumentSpec declares `min_columns`, while K-1 must
// export it as a table to be testable at all. K-4 must SOURCE `DocumentSpec.min_columns` from
// this package's `MIN_COLUMNS` rather than restating it — two declarations of one number is the
// defect, and only K-4 can close it.
