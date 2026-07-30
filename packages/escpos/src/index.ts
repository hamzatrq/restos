// @restos/escpos — ESC/POS encoder and transports (18 §10, specs/03-kitchen-fulfillment.md).
//
// K-1 has landed: the capability record, the column derivation, and 03-F49's per-type minimum
// with its refusal. The encoder (K-2), transports and virtual printer (K-3), and the
// DocumentSpec/DocumentProfile render pipeline (K-4) arrive with their own plans/ tasks.
export {
  deriveColumns,
  FONT_CELL_DOTS,
  type FontId,
  PRINTABLE_DOTS_NOTE,
  PRINTER_CAPABILITIES,
  type PrinterCapability,
  printerCapability,
  UNKNOWN_PRINTER_CAPABILITY,
} from "./capability.js";
export {
  type EncodeRefusal,
  type EncodeRefusalReason,
  type EncodeResult,
  type EncoderPart,
  encode,
  INK_LEVELS,
  INK_SCOPES,
  type InkLevel,
  type InkScope,
} from "./encoder.js";
export {
  type ColumnDecision,
  type ColumnRefusal,
  checkColumns,
  DOCUMENT_TYPES,
  type DocumentType,
  MIN_COLUMNS,
} from "./min-columns.js";
