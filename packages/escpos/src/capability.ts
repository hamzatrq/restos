/**
 * Printer capability records and the column derivation (`03 §7` layer 3, `03-F36`, `03-F49`).
 *
 * `03 §7` withdrew **"paper width as a `58 | 80` enum"** in July 2026 because it silently
 * truncates the price column. Layout is expressed in **columns**, and this module is where a
 * model becomes a column count.
 */

/** `03 §7`: "Font A = 12, Font B = 9" — the font cell widths, in dots. */
export const FONT_CELL_DOTS = { A: 12, B: 9 } as const;

export type FontId = keyof typeof FONT_CELL_DOTS;

/**
 * `03 §7` layer 3's verbatim field list. Expected to GROW — `03-F10` puts head-to-cutter distance
 * and `GS B` solid-fill fidelity here once rig-calibrated, and `03-F40` model-gates the near-end
 * paper sensor from it — so consumers must not assume the key set is closed at eight.
 */
export type PrinterCapability = {
  model_id: string;
  /** The print head's width in dots. **Not** the printable width — see `PRINTABLE_DOTS_NOTE`. */
  dots: number;
  dpi: number;
  cols_font_a: number;
  cols_font_b: number;
  has_native_qr: boolean;
  has_cutter: boolean;
  /** `03-F8`/`03-F35`: whether the raster path is usable — logos, QR, non-Latin user content. */
  raster_ok: boolean;
  /**
   * `03-F40`: "A **near-end** sensor is not universal (the TM-T88VII lists paper-end + cover-open
   * only) — model-gate the feature from the 03-F10 capability record rather than assuming it."
   *
   * This is one of the two growths the field list above predicted. Its value per model is a rig
   * measurement (`03-F10`), which nothing here has performed — see the table's own note.
   */
  has_near_end_sensor: boolean;
};

/**
 * **`dots` IS NOT `print_dots`, AND `03 §7` CANNOT PRODUCE ITS OWN WORKED EXAMPLES.**
 *
 * The FR gives the derivation as `print_dots ÷ font_cell_dots` and then states three models:
 * *"a TH230 at 576 dots gives **44** Font-A columns while a TM-P80 at the same 576 dots gives
 * **42** and a TM-T20II gives **48**"*. But 576 ÷ 12 = 48 for all three. The three answers cannot
 * come from one input, so `dots` (the head) differs from the **printable width** on at least two
 * of them — margins, and on the TM-P80 a narrower carriage — and **the record has no field for
 * the difference.**
 *
 * Resolved the way the acceptance suite forces and `03 §7` implies: **`cols_font_a`/`cols_font_b`
 * are MEASURED PER MODEL and stored**, seeded from the shipped table and corrected on the
 * `03-F10` rig. `deriveColumns` remains exactly the FR's formula and is used where a printable
 * width is genuinely known — an unknown model, a technician override — never to recompute a row
 * that was measured.
 *
 * This is a **finding against `03 §7`, not a resolution of it**: either the record needs a
 * `print_dots` field or the prose needs to stop calling all three "576 dots". Recorded here
 * rather than silently patched, per Commandment 2.
 */
export const PRINTABLE_DOTS_NOTE =
  "03 §7: `dots` is the head width; column counts are measured per model (see PRINTABLE_DOTS_NOTE)";

/**
 * `03 §7`: "derived as `print_dots ÷ font_cell_dots`".
 *
 * Floors, and that is the whole safety property: a partial cell is not a column, and rounding up
 * would lay out one column that prints off the paper — silently, which is the failure both
 * `03-F36` and the withdrawn `58 | 80` enum are about.
 */
export const deriveColumns = (print_dots: number, font: FontId): number =>
  Math.floor(print_dots / FONT_CELL_DOTS[font]);

/**
 * The shipped table (`03 §7`: "seeded from a shipped table").
 *
 * The three Epson-family rows are `03 §7`'s own worked examples. `BC-58U` is `03-F10`'s baseline
 * compatibility target and carries **no auto-cutter** — the FR is explicit that it has a manual
 * tear bar, "i.e. a human action and a mis-tear vector per ticket; it stays a compatibility
 * target, never a recommendation."
 *
 * **`has_near_end_sensor` is `false` on every row and that is an UNDER-CLAIM, not a measurement.**
 * `03-F40` model-gates the feature from this record and names one model's answer (the TM-T88VII
 * has paper-end + cover-open only); no row here has been on a rig (`03-F10`), and the direction
 * that is safe is the one where a warning cannot fire rather than the one where a warning can
 * never become true. A row turns `true` when the rig says so.
 */
export const PRINTER_CAPABILITIES: readonly PrinterCapability[] = [
  {
    model_id: "TH230",
    dots: 576,
    dpi: 203,
    cols_font_a: 44,
    cols_font_b: 58,
    has_native_qr: false,
    has_cutter: true,
    raster_ok: true,
    has_near_end_sensor: false,
  },
  {
    model_id: "TM-P80",
    dots: 576,
    dpi: 203,
    cols_font_a: 42,
    cols_font_b: 56,
    has_native_qr: true,
    has_cutter: true,
    raster_ok: true,
    has_near_end_sensor: false,
  },
  {
    model_id: "TM-T20II",
    dots: 576,
    dpi: 203,
    cols_font_a: 48,
    cols_font_b: 64,
    has_native_qr: true,
    has_cutter: true,
    raster_ok: true,
    has_near_end_sensor: false,
  },
  {
    // 03-F10's baseline target. 58 mm, and the one that cannot print a KOT (03-F49).
    model_id: "BC-58U",
    dots: 384,
    dpi: 203,
    cols_font_a: 32,
    cols_font_b: 42,
    has_native_qr: false,
    has_cutter: false,
    raster_ok: true,
    has_near_end_sensor: false,
  },
];

/**
 * `03 §7`: "defaulting **conservatively to 32** for an unknown model".
 *
 * Conservative has a DIRECTION and only one of them is safe: a default above some real model's
 * width lays out lines that run off that model's paper, silently. So every field here under-claims
 * — 32 Font-A columns is the 58 mm floor, and no capability is asserted that has not been
 * verified.
 *
 * `raster_ok` is the one field where both directions have a named failure, and the FR does not
 * rule. Set **true** because `03-F35` makes the fiscal QR *always* rasterised and calls a silent
 * no-op "the worst available failure mode" for a QR "whose absence is an offence that can seal
 * the premises" — so refusing the raster path by default disables the one thing that must never
 * be skipped. Flagged as an open question rather than settled.
 */
export const UNKNOWN_PRINTER_CAPABILITY: PrinterCapability = {
  model_id: "unknown",
  dots: 384,
  dpi: 203,
  cols_font_a: 32,
  cols_font_b: 42,
  has_native_qr: false,
  has_cutter: false,
  raster_ok: true,
  has_near_end_sensor: false,
};

/**
 * `03 §7`: the lookup. **Never undefined and never a throw** — an unrecognised model is the
 * ordinary case on a new install, and `01-F17` makes a stopped till the one unacceptable outcome.
 * The returned record keeps the REQUESTED id so `03-F5`'s alert can name the printer the operator
 * is actually standing at, rather than the word "unknown".
 */
export const printerCapability = (model_id: string): PrinterCapability => {
  const known = PRINTER_CAPABILITIES.find((row) => row.model_id === model_id);
  return known ?? { ...UNKNOWN_PRINTER_CAPABILITY, model_id };
};
