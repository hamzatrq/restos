// K-1 ORACLE SURFACE — types and guarded accessors ONLY. NOT AN IMPLEMENTATION.
//
// This file declares the contract that `printer-capability.test.ts` and `min-columns.test.ts`
// drive. It contains no capability table, no column arithmetic, no refusal logic and no
// document-type policy: every function here either forwards to `../index.js` or throws a named
// "not implemented yet" error. If a future edit puts a `44` or a `42` in this file, that edit has
// moved the implementation into the oracle and the split of `24 §3` step 2 is gone.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/03-kitchen-fulfillment.md §7 "Layer 3" — the capability record, the columns
//     derivation, the conservative default, the withdrawal of the 58|80 paper-width enum.
//   specs/03-kitchen-fulfillment.md 03-F49 — per-type `min_columns`, refusal below it.
//   specs/03-kitchen-fulfillment.md 03-F34 — hard refusal to print plus an S1 band.
//   specs/03-kitchen-fulfillment.md 03-F31 — the eight document types.
//   specs/03-kitchen-fulfillment.md 03-F36 — columns, never absolute dot positions.
//
// NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE. Every assertion downstream is about
// values (a table row, a derived integer) and about the shape of a returned decision. Nothing
// here opens a transport, and no test name may imply that a printer was observed.

/**
 * `03 §7` layer 3, verbatim field list: "a per-model capability record
 * `{model_id, dots, dpi, cols_font_a, cols_font_b, has_native_qr, has_cutter, raster_ok}`".
 *
 * `03-F10` states that head-to-cutter distance and `GS B` solid-fill fidelity are also
 * "rig-calibrated per model into the capability record", and `03-F40` model-gates the near-end
 * sensor from it — so the record is expected to GROW past these eight. The tests therefore assert
 * these eight are PRESENT and typed, never that the key set is exactly eight.
 */
export type PrinterCapability = {
  model_id: string;
  dots: number;
  dpi: number;
  cols_font_a: number;
  cols_font_b: number;
  has_native_qr: boolean;
  has_cutter: boolean;
  raster_ok: boolean;
};

/** `03 §7`: the two font cells the derivation names. */
export type FontId = "A" | "B";

/** `03-F31`'s document types, verbatim and in the order the FR lists them. */
export const DOCUMENT_TYPES_PER_03_F31 = [
  "kot",
  "receipt",
  "bill",
  "refund_slip",
  "shift_close_slip",
  "rider_settlement_slip",
  "day_summary",
  "test_page",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES_PER_03_F31)[number];

/**
 * `03-F49` + `03-F34`. The refusal is a VALUE, not merely a thrown thing: `03-F34` requires "a
 * hard refusal to print plus an S1 band (27-F11d)", and a band that must name the printer and the
 * document cannot be raised from a bare exception. `03-F49` also makes this a purchasing fact
 * that "Doc 14's printer setup must say so at assignment time" — doc 14 needs the same four
 * numbers the runtime refusal needs, so they are fields, not a formatted string.
 *
 * DECLARED INTERPRETATION (24 §3b — stated, not smuggled): `severity: "S1"` rides on the refusal.
 * The named alternative is that the refusal carries only the cause and the ALARM layer assigns
 * S1. That alternative is weaker for one reason the FR itself supplies — `03-F34` names four
 * distinct render-time failures (missing mandatory block, undersized QR, owner slot in a locked
 * region, and via `03-F49` insufficient columns) and calls the consequence of all four an S1, so
 * the severity is a property of the refusal rather than of any one caller.
 */
export type ColumnRefusal = {
  ok: false;
  /** Stable machine-readable cause. `03-F34` has four causes; they must be told apart. */
  reason: "min_columns_not_met";
  /** `03-F34`: "a hard refusal to print plus an S1 band (27-F11d)". */
  severity: "S1";
  document_type: DocumentType;
  /** The record's own `model_id` (`03 §7`); `03-F5`'s precedent is that an alert names the printer. */
  model_id: string;
  /** The document type's declared `min_columns` (`03-F49`). */
  required_columns: number;
  /** What the capability record reports (`03-F49`: "a printer … reports fewer"). */
  available_columns: number;
};

/**
 * The decision. There are exactly TWO branches on purpose: `03-F49` says "refused, never
 * squeezed" and `03-F34` says "never a silent degradation", so there is no third outcome that
 * both proceeds and reduces. The success branch carries the printer's OWN column count — not the
 * minimum — because `03-F36` makes the minimum a floor the layout must survive, not a ceiling it
 * must be clamped to.
 */
export type ColumnDecision = { ok: true; columns: number } | ColumnRefusal;

/**
 * The `@restos/escpos` surface these suites drive. Every member is optional so that a missing
 * export fails the RED run LOUDLY at runtime (with the FR named) instead of blocking
 * `pnpm typecheck` for the whole repo — the `packages/domain` acceptance-test idiom.
 */
export type EscposK1Api = {
  /** `03 §7`: "Font A = 12, Font B = 9" — the font cell widths, in dots. */
  FONT_CELL_DOTS?: Readonly<Record<FontId, number>>;
  /** `03 §7`: "seeded from a shipped table". */
  PRINTER_CAPABILITIES?: readonly PrinterCapability[];
  /** `03 §7`: the record used when the model is not in the shipped table. */
  UNKNOWN_PRINTER_CAPABILITY?: PrinterCapability;
  /** `03 §7`: lookup, "defaulting conservatively … for an unknown model" — never undefined. */
  printerCapability?: (model_id: string) => PrinterCapability;
  /** `03 §7`: "derived as `print_dots ÷ font_cell_dots`". */
  deriveColumns?: (print_dots: number, font: FontId) => number;
  /** `03-F49`: "Each `DocumentSpec` declares `min_columns`". */
  MIN_COLUMNS?: Readonly<Partial<Record<DocumentType, number>>>;
  /** `03-F49` + `03-F34`: the gate, and the refusal it produces. */
  checkColumns?: (document_type: DocumentType, caps: PrinterCapability) => ColumnDecision;
};

const missing = (name: string, fr: string): never => {
  throw new Error(`@restos/escpos.${name} is not implemented yet (K-1, ${fr})`);
};

export const fontCellDots = (api: EscposK1Api): Readonly<Record<FontId, number>> =>
  api.FONT_CELL_DOTS ?? missing("FONT_CELL_DOTS", "03 §7 layer 3");

export const printerCapabilities = (api: EscposK1Api): readonly PrinterCapability[] =>
  api.PRINTER_CAPABILITIES ?? missing("PRINTER_CAPABILITIES", "03 §7 layer 3");

export const unknownPrinterCapability = (api: EscposK1Api): PrinterCapability =>
  api.UNKNOWN_PRINTER_CAPABILITY ?? missing("UNKNOWN_PRINTER_CAPABILITY", "03 §7 layer 3");

export const printerCapability = (api: EscposK1Api, model_id: string): PrinterCapability =>
  typeof api.printerCapability === "function"
    ? api.printerCapability(model_id)
    : missing("printerCapability", "03 §7 layer 3");

export const deriveColumns = (api: EscposK1Api, print_dots: number, font: FontId): number =>
  typeof api.deriveColumns === "function"
    ? api.deriveColumns(print_dots, font)
    : missing("deriveColumns", "03 §7 layer 3");

export const minColumns = (api: EscposK1Api): Readonly<Partial<Record<DocumentType, number>>> =>
  api.MIN_COLUMNS ?? missing("MIN_COLUMNS", "03-F49");

export const checkColumns = (
  api: EscposK1Api,
  document_type: DocumentType,
  caps: PrinterCapability,
): ColumnDecision =>
  typeof api.checkColumns === "function"
    ? api.checkColumns(document_type, caps)
    : missing("checkColumns", "03-F49 / 03-F34");
