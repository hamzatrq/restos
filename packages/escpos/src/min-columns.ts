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
 * **Three of `03-F31`'s eight types are declared BY THE FR.** The FR states these three and no
 * others. Inventing floors for `refund_slip`, `rider_settlement_slip` and `test_page` would be
 * filling a gap with plausible behaviour, which Commandment 2 forbids; they get a floor when
 * their `DocumentSpec` is written — which is the rule the two cash documents below follow.
 *
 * **`shift_close_slip` and `day_summary` get a floor here because S-7 wrote their specs, and each
 * one is DERIVED from its own widest full-form line rather than copied from a neighbour.**
 * `03-F49`'s whole resolution is that "structural differences live in the TYPE", so a cash slip
 * inheriting the KOT's 42 would refuse on 80 mm-class printers it fits on, and inheriting the
 * receipt's 32 would print a document whose widest line does not fit. Both are the silent
 * degradation `03-F34` bans, one in each direction.
 *
 * The derivation is stated here and CHECKED in `__acceptance__/cash-documents.test.ts` §A against
 * what each spec's `example_data` actually renders — `03-F36` makes that example the build-time
 * witness, so the number below and the paper cannot drift apart. Every line of both documents is
 * `label` + one space + value, all at normal size (`27-F56` allocates the 2× rung to the KOT's
 * quantity and order identifier; spending it on a money figure would DOUBLE that figure's column
 * cost and push both floors past a 32-column printer for no FR that asks for it):
 *
 *   * the widest money token is `Rs 99,999,999` = **13 columns** — `27-F23`'s symbol-first `Rs `
 *     (3) plus **eight digits** under Western 3-digit grouping (2 separators). Eight is a PINNED
 *     display bound, not a specified one: no FR bounds a money figure, a large Pakistani branch's
 *     business day is six digits of rupees, and every extra digit costs a column on a
 *     58 mm-versus-80 mm purchasing decision. Above it a line takes `03-F36`'s last declared
 *     degradation and wraps — it is never truncated into a different amount.
 *   * `shift_close_slip` = **35**: its widest label is 21 columns — `Aggregator receivable`, the
 *     longest `PAYMENT_METHODS` member `02-F23` requires "by method", tied by `02-F43`'s
 *     `Unbound no-sale opens` — so 21 + 1 + 13.
 *   * `day_summary` = **34**: its widest line is `Voids/comps/discounts NOT RECORDED` — 21 + 1 +
 *     12, a CONSTANT line rather than a money row, because `02-F24` names that group and `01 §4`
 *     has no event type that records it (`26 §7`: "`void/comp/discount.recorded` … have **no
 *     payload schema at all**"). Its money rows are narrower: `Storefront` is the longest
 *     `ORDER_CHANNELS` label at 10, so 10 + 1 + 13 = 24.
 *
 * **`as const` is load-bearing, not decoration.** `03-F49` puts `min_columns` on the
 * `DocumentSpec` too, and two declarations of one number is the defect — so a spec SOURCES its
 * floor from this table (`DOCUMENT_SPECS`), which needs the value to survive as a literal.
 */
export const MIN_COLUMNS = {
  kot: 42,
  receipt: 32,
  bill: 32,
  shift_close_slip: 35,
  day_summary: 34,
} as const satisfies Readonly<Partial<Record<DocumentType, number>>>;

/** The same table, widened for lookup by an arbitrary `DocumentType`. */
const MIN_COLUMNS_BY_TYPE: Readonly<Partial<Record<DocumentType, number>>> = MIN_COLUMNS;

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
  const required = MIN_COLUMNS_BY_TYPE[document_type];
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
