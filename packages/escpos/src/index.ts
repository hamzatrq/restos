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
