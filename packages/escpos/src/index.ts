// @restos/escpos — ESC/POS encoder and transports (18 §10, specs/03-kitchen-fulfillment.md).
//
// K-1..K-6 have landed: the capability record and column derivation with 03-F49's per-type
// minimum and its refusal (K-1); the encoder and 27-F56's ink ladder (K-2); the `Transport` seam
// and the virtual printer (K-3); `DocumentSpec`/`DocumentProfile` and the pure `render()` (K-4);
// the KOT layout (K-5); the durable spooler (K-6).
//
// Owed: K-7 wires `order.confirmed` → spooler and raises 03-F5's S1 on the counter. K-8 is the
// physical pass — NO PRINTER HAS EVER BEEN ATTACHED, so everything here is emitted bytes and a
// software page, and nothing in this package is evidence about a kitchen.
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
// S-7 — the two documents that are ENTIRELY money (`02-F23`, `02-F24`). `03-F32`'s ban is a
// property of the `kot` TYPE, not of this package: see `cash-documents.ts`'s header.
export type {
  DaySummaryData,
  ExpectedByMethod,
  SalesByChannel,
  ShiftCloseData,
} from "./cash-documents.js";
// `BLOCK_RENDERERS` is deliberately NOT exported: 03-F34 enforces "before bytes reach the
// spooler", and a caller that could render blocks directly would walk past all four assertions.
export {
  DOCUMENT_SPECS,
  type DocumentProfile,
  type DocumentSpec,
  type FiscalBlock,
  type KotData,
  LOCKED_REGIONS,
  type ProfileFor,
  REGIONS,
  type Region,
  type SlotDeclaration,
  type SlotValue,
  type SpecBlock,
  type SpecRegion,
} from "./document.js";
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
// `02-F15`/`02-F16` — the customer's copy. Its layout lives in `receipt-document.ts` beside the
// two cash documents for the same reason: it carries money, which the `kot` TYPE may not.
export type {
  ReceiptData,
  ReceiptLine,
  // R39's `16-F5` snapshot on the paper. Exported beside the data contract it is part of, so the
  // seam that composes a taxed receipt names one type rather than spelling four fields inline.
  ReceiptTax,
  ReceiptTender,
} from "./receipt-document.js";
export {
  type ProfileFinding,
  type ProfileValidation,
  type RenderedBlock,
  type RenderRefusal,
  type RenderRefusalReason,
  type RenderResult,
  render,
  validateProfile,
} from "./render.js";
// The ONE byte→page interpretation (`18 §10`). Two consumers read it: `@restos/testing`'s virtual
// printer and `apps/pos-electron`'s file transport. A second walk anywhere is the defect.
export {
  encodePagePng,
  encodePagesPdf,
  type PageOverflow,
  type PageWidth,
  type SimulatedPage,
  simulate,
} from "./simulate.js";
export {
  checkPrinterHealth,
  createSpooler,
  type JobRecord,
  type JobState,
  MAX_TRANSMIT_ATTEMPTS,
  type PersistedJob,
  PRINTER_HEALTH_QUERY,
  type PrinterHealth,
  type PrintJob,
  RETRY_WINDOW_MS,
  SPOOLER_JOB_STATES,
  type Spooler,
  type SpoolerJobStore,
  type SpoolerOptions,
  type SpoolerTransport,
} from "./spooler.js";
export {
  classifyTransmit,
  createRealtimeQueryWindow,
  decodePaperStatus,
  ERROR_RECOVERY_REQUEST,
  PAPER_STATUS_QUERY,
  type PaperStatus,
  REALTIME_QUERY_CAP,
  type RealtimeQueryWindow,
  type TransmitEvidence,
  type TransmitOutcome,
} from "./status.js";
