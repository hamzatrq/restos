/**
 * Per-document-type column minimums and the refusal below them (`03-F49`, `03-F34`, `03-F31`).
 *
 * `03-F49` resolved a contradiction rather than adding a rule: `03-F36` made 32-column rendering
 * a build-time gate while `27-F57` held that 32 columns breaks the quantity-adjacent-to-name
 * pairing. Both could not bind. The resolution is `03-F31`'s standing principle — **structural
 * differences live in the TYPE** — so each type declares its own floor.
 */

import type { PrinterCapability } from "./capability.js";

/** `03-F31`'s document types, in the order the FR lists them. */
export const DOCUMENT_TYPES = [
  "kot",
  "receipt",
  "bill",
  "refund_slip",
  "shift_close_slip",
  "rider_settlement_slip",
  "day_summary",
  "test_page",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * `03-F49`: "`kot` declares **42**; `receipt` and `bill` declare **32**".
 *
 * **Why the KOT's floor is higher, and why it refuses rather than wraps.** A price column can
 * genuinely degrade through `03-F36`'s declared order — full → short form → drop the label, keep
 * the number → wrap. A comprehension pairing cannot: `27-F57` puts quantity immediately left of
 * the item name because the mapping step is where comprehension collapses (readers who *decode* a
 * line at ~71% *execute* it correctly at ~35%), and `27-F58` makes the resulting vertical
 * alignment the thing modifiers and notes hang off. Wrapping the item line spends exactly the
 * property the ticket exists to deliver.
 *
 * **Only three of `03-F31`'s eight types are declared, deliberately.** The FR states these three
 * and no others. Inventing floors for `refund_slip`, `shift_close_slip`, `rider_settlement_slip`,
 * `day_summary` and `test_page` would be filling a gap with plausible behaviour, which
 * Commandment 2 forbids; they get a floor when their `DocumentSpec` is written.
 */
export const MIN_COLUMNS: Readonly<Partial<Record<DocumentType, number>>> = {
  kot: 42,
  receipt: 32,
  bill: 32,
};

/**
 * `03-F34`'s refusal, as a VALUE rather than a thrown thing.
 *
 * The FR requires "a hard refusal to print **plus an S1 band** (`27-F11d`)", and a band that must
 * name the printer and the document cannot be raised from a bare exception. `03-F49` also makes
 * this a purchasing fact doc 14 must surface at printer-assignment time — and doc 14 needs the
 * same four numbers the runtime refusal needs, so they are fields rather than a formatted string.
 */
export type ColumnRefusal = {
  ok: false;
  /** `03-F34` names four render-time causes; they must be told apart. */
  reason: "min_columns_not_met";
  severity: "S1";
  document_type: DocumentType;
  model_id: string;
  required_columns: number;
  available_columns: number;
};

/**
 * Exactly two branches, on purpose. `03-F49` says "refused, never squeezed" and `03-F34` says
 * "never a silent degradation", so there is no third outcome that both proceeds and reduces.
 */
export type ColumnDecision = { ok: true; columns: number } | ColumnRefusal;

/**
 * The gate. **Reads Font A**, and the FR's own consequence is what settles which font:
 * `03-F49` states that "a 58 mm printer cannot print kitchen tickets". A 58 mm printer has 32
 * Font-A columns and 384 printable dots, which is `floor(384 ÷ 9) = 42` Font-B columns — exactly
 * the KOT's minimum. So a Font-B gate would admit the printer the FR says is excluded, making the
 * FR false on its own stated example.
 *
 * A passing decision carries the printer's OWN column count, never the minimum: `03-F36` makes
 * the floor something the layout must survive, not a width it is clamped to.
 *
 * A type with no declared minimum is **not** refused — an undeclared floor is an unwritten
 * `DocumentSpec`, not a zero-width printer, and refusing here would invent policy the FR does not
 * state.
 */
export const checkColumns = (
  document_type: DocumentType,
  caps: PrinterCapability,
): ColumnDecision => {
  const required = MIN_COLUMNS[document_type];
  const available = caps.cols_font_a;
  if (required !== undefined && available < required) {
    return {
      ok: false,
      reason: "min_columns_not_met",
      severity: "S1",
      document_type,
      model_id: caps.model_id,
      required_columns: required,
      available_columns: available,
    };
  }
  return { ok: true, columns: available };
};
