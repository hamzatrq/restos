// ACCEPTANCE TESTS — S-7: the `shift_close_slip` (`02-F23`) and the `day_summary` (`02-F24`).
//
// PROVENANCE (24 §3 step 2), stated rather than glossed: this file was authored by the session
// that then implemented against it, which is NOT the `24 §3` split. The mitigation is the round-3
// law — a CONTROL implementation and five single-branch MUTANTS were built out of tree, the suite
// was taken green against the control, and each mutant was confirmed to red the assertions that
// claim to own it. The matrix is in the session report; a suite nobody has tried to break is a
// suite nobody knows the strength of.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   02-F23  shift close per cashier: "system-expected cash **(by method)** vs counted cash;
//           over/short **recorded and attributed**"; "the cashier sees their own reconciliation …
//           ('I'm clean') — the staff-protection framing".
//   02-F24  "a day-summary ticket (**sales by channel, voids/comps/discounts, over/short**) can be
//           printed via doc 03".
//   02-F21  no-sale drawer opens are "logged **and counted** (classic theft vector)".
//   02-F43  unbound drawer opens and paid-outs "succeed, are **COUNTED**" — and what the FR
//           forbids is "the silent path": an unbound event "stored and uncounted … money
//           vanishing from `02-F23`'s expected cash and `02-F24`'s day close with nothing to
//           point at". An implementation that logs and then drops it "satisfies the word *logged*
//           while defeating the theft-detection the FR exists for".
//   02-F44  `cash.paid_out` carries `amount_paisa`, without which `02-F23`'s expected cash "is
//           uncomputable the moment any cash leaves the drawer".
//   02-F45  attribution is the envelope's actor, projected by the fold; null is a real state.
//   26 §7   "over/short, COD due → a **carried fact**." Read, never re-derived.
//   03-F30  `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?)` is PURE: "identical (spec,
//           profile, data, caps) must produce **byte-identical** output on Electron and React
//           Native. A shipped competitor emits different tickets for the same order on two of its
//           own devices."
//   03-F31  "Document types are first-class entities … Each declares its own data contract, spec,
//           invariants and render-mode policy … Structural differences live in the TYPE, not in
//           config: **price presence** …"
//   03-F32  "A `kot` renders **no money token** under any profile … enforced structurally — the
//           profile schema has no slot id addressing them."
//   03-F33  the region ladder; owner content only OUTSIDE a locked block.
//   03-F34  "a hard refusal to print plus an S1 band (27-F11d), never a silent degradation".
//   03-F36  "Every DocumentSpec must render correctly at its declared `min_columns`" — and
//           **banned**: absolute dot positioning, and space-as-layout.
//   03-F37  "Reprint markers are mandatory **per type**, in a locked region."
//   03-F49  a type's `min_columns` is its OWN, and below it the document is "refused, never
//           squeezed"; `kot` declares 42, `receipt`/`bill` declare 32.
//   03-F8   (July 2026 ruling) a non-Latin user field is REFUSED, never rastered blind.
//   01-F46  the business day is Asia/Karachi with the 05:00 cutover — a day summary's date is a
//           BUSINESS date, not a calendar one.
//   27-F22  Western digits (U+0030–0039) everywhere; never U+0660–0669.
//   27-F23  "`Rs`, symbol-first; Western 3-digit grouping; **no decimals** on operational
//           screens. Not `₨`, not `PKR` in staff UI … Pakistan does **not** inherit lakh
//           grouping."
//   27-F24  "The system computes; staff read" — every total "arrives as a finished number".
//   27-F12  direction is a WORD, never a minus sign and never a colour alone.
//   27-F58  "Groups are separated by **blank lines, not rules**."
//   00 §5.6 English-only interface; user content is Unicode and prints faithfully.
//
// ⚠ WHAT THIS SUITE IS NOT EVIDENCE FOR.
//  * **ANY PHYSICAL PRINTER.** K-8 is owed in full; no printer has ever been attached to this
//    product. Every assertion below is over EMITTED BYTES and a rendered block list. No test name
//    here may be read as "the slip printed".
//  * **COMPREHENSION.** `27-F35`'s ≥85% gate is measured on real staff and is owed with K-8. That
//    a cashier can read this slip is a claim no assertion here makes.
//  * **THE FOLD.** Whether the numbers handed in are the RIGHT numbers is `shift-cash.ts`'s own
//    suite. This file asserts that what arrives is what prints, and that nothing is recomputed.

import { describe, expect, it } from "vitest";
import type {
  DaySummaryData,
  DocumentProfile,
  DocumentSpec,
  PrinterCapability,
  ShiftCloseData,
} from "../index.js";
import { DOCUMENT_SPECS, MIN_COLUMNS, render } from "../index.js";

// ── the instruments ──────────────────────────────────────────────────────────────────────────────

/** `03 §7`: Font A is a 12-dot cell; `03-F49` expresses every floor in columns. */
const FONT_A_CELL_DOTS = 12;

const capsAt = (
  cols_font_a: number,
  model_id: string,
  over: Partial<PrinterCapability> = {},
): PrinterCapability => {
  const print_dots = cols_font_a * FONT_A_CELL_DOTS;
  return {
    model_id,
    dots: print_dots,
    dpi: 203,
    cols_font_a,
    cols_font_b: Math.floor(print_dots / 9),
    has_native_qr: false,
    has_cutter: true,
    has_near_end_sensor: false,
    raster_ok: true,
    ...over,
  };
};

/** Wide enough that `03-F49`'s floor is never the thing under test. */
const WIDE = capsAt(64, "WIDE-64");

type AnySpec = DocumentSpec<unknown>;

const specOf = (type: "shift_close_slip" | "day_summary"): AnySpec => {
  const spec = DOCUMENT_SPECS[type];
  expect(
    spec,
    `${type} ships no DocumentSpec — 03-F31 makes the type first-class or absent`,
  ).toBeDefined();
  return spec as AnySpec;
};

/** `03-F30`: "a preset with a hole" — every declared slot at its shipped default. */
const shippedDefaults = (spec: AnySpec): DocumentProfile =>
  Object.fromEntries(
    spec.blocks.flatMap((block) => block.slots.map((slot) => [slot.slot_id, slot.default])),
  );

type Ok = {
  ok: true;
  blocks: readonly { block_id: string; region: string; parts: readonly unknown[] }[];
  bytes: Uint8Array;
};

const okOf = (result: ReturnType<typeof render>, label: string): Ok => {
  expect(result.ok, `${label}: render refused — ${result.ok ? "" : result.reason}`).toBe(true);
  return result as Ok;
};

type Part = {
  kind: string;
  value?: string;
  ink?: string;
  lines?: number;
  scope?: string;
};

/**
 * The document as LINES, with each line's COLUMN COST.
 *
 * `ESC d n` is "print and feed n lines", so a feed ends the current line and leaves `n - 1` blank
 * ones behind it — which is how `27-F58`'s "groups are separated by blank lines" becomes
 * observable at all. A `size_2x2` run costs **two columns per character** (`27-F57` does that sum
 * itself: "a two-digit quantity at `27-F56`'s 2× width costs 4 columns"), so a layout that reached
 * for the 2× rung would be measured at its real width here rather than at half of it.
 */
type Line = { text: string; columns: number; blank: boolean };

const linesOf = (blocks: Ok["blocks"]): Line[] => {
  const lines: Line[] = [];
  let text = "";
  let columns = 0;
  const flush = (): void => {
    lines.push({ text, columns, blank: text.trim() === "" });
    text = "";
    columns = 0;
  };
  for (const block of blocks) {
    for (const raw of block.parts) {
      const part = raw as Part;
      if (part.kind === "feed") {
        flush();
        for (let k = 1; k < (part.lines ?? 1); k += 1) flush();
        continue;
      }
      if (part.kind !== "text" && part.kind !== "user_text") continue;
      const value = part.value ?? "";
      text += value;
      columns += part.ink === "size_2x2" ? value.length * 2 : value.length;
    }
  }
  if (text !== "") flush();
  return lines;
};

const documentText = (blocks: Ok["blocks"]): string =>
  linesOf(blocks)
    .map((line) => line.text)
    .join("\n");

const widestColumns = (blocks: Ok["blocks"]): number =>
  linesOf(blocks).reduce((widest, line) => Math.max(widest, line.columns), 0);

const partsOf = (blocks: Ok["blocks"]): Part[] =>
  blocks.flatMap((block) => block.parts.map((raw) => raw as Part));

/** Every part, tagged with the region its block declared — `03-F33`/`03-F37` are about position. */
const regionOfText = (blocks: Ok["blocks"], needle: string): string | null => {
  for (const block of blocks) {
    for (const raw of block.parts) {
      const part = raw as Part;
      if ((part.value ?? "").includes(needle)) return block.region;
    }
  }
  return null;
};

// ── the fixtures ─────────────────────────────────────────────────────────────────────────────────

/**
 * A shift whose CARRIED variance CONTRADICTS the naive subtraction, and does so in the direction
 * that matters.
 *
 * `counted − Σ expected` = 1,000,00 − (900,00 + 0 + 0 + 0 + 0) = **+10,000** (over Rs 100). The
 * carried figure is **−5,000** (short Rs 50), which is the truth: a `02-F26` paid-out took Rs 150
 * out of the drawer and the subtraction never sees it (`02-F44` is the FR that exists because of
 * exactly this). So the two disagree in SIGN as well as magnitude — an implementation that
 * recomputes cannot accidentally agree, and one that reads the wrong field cannot print the right
 * word.
 */
const CONTRADICTORY_SHIFT: ShiftCloseData = {
  shift_id: "SH7A2B1C",
  cashier: "Ayesha Khan",
  expected_by_method: {
    cash: 90_000,
    card: 0,
    raast: 0,
    khata_credit: 0,
    aggregator_receivable: 0,
  },
  counted_cash_paisa: 100_000,
  variance_paisa: -5_000,
  paid_out_paisa: 15_000,
  no_sale_count: 4,
  unbound_no_sale_count: 2,
  unbound_paid_out_paisa: 33_300,
  reprint: false,
};

const DAY: DaySummaryData = {
  business_date: "2026-08-07",
  sales_by_channel: {
    counter: 1_234_500,
    phone: 22_200,
    storefront: 33_300,
    whatsapp: 44_400,
    foodpanda: 55_500,
  },
  opening_float_paisa: 500_000,
  deposit_paisa: 1_100_000,
  counted_cash_paisa: 1_248_000,
  over_short_paisa: 6_600,
  shifts_closed: 2,
  shifts_open: 1,
  reprint: false,
};

const renderShift = (
  data: ShiftCloseData,
  caps: PrinterCapability = WIDE,
  profile?: DocumentProfile,
) => {
  const spec = specOf("shift_close_slip");
  return render(spec, profile ?? shippedDefaults(spec), data, caps);
};

const renderDay = (
  data: DaySummaryData,
  caps: PrinterCapability = WIDE,
  profile?: DocumentProfile,
) => {
  const spec = specOf("day_summary");
  return render(spec, profile ?? shippedDefaults(spec), data, caps);
};

// ── A. 03-F49 — each type's floor is ITS OWN, and it is derived ─────────────────────────────────

describe("03-F49/03-F36 — the cash documents declare their own column floor", () => {
  it("neither floor is the KOT's 42 nor the receipt's 32 — 03-F31 puts the difference in the TYPE", () => {
    // The two mutants this kills are the two available copy-and-paste answers. At the KOT's 42 a
    // cash slip is REFUSED on printers it fits on ("never a silent degradation" inverted — a
    // refusal that should not have happened); at the receipt's 32 the shift slip's widest line
    // does not fit and the document is squeezed, which `03-F49` bans in the same sentence.
    expect(MIN_COLUMNS.shift_close_slip).toBe(35);
    expect(MIN_COLUMNS.day_summary).toBe(34);
    expect(MIN_COLUMNS.shift_close_slip).not.toBe(MIN_COLUMNS.kot);
    expect(MIN_COLUMNS.shift_close_slip).not.toBe(MIN_COLUMNS.receipt);
    expect(MIN_COLUMNS.day_summary).not.toBe(MIN_COLUMNS.kot);
    expect(MIN_COLUMNS.day_summary).not.toBe(MIN_COLUMNS.receipt);
  });

  it("03-F36: each floor EQUALS the widest line its own example_data renders — the derivation is checked, not asserted", () => {
    // `03-F36` makes `example_data` the build-time witness ("every `DocumentSpec` must render
    // correctly at its declared `min_columns`"), so the declared number and the paper cannot be
    // allowed to drift. `toBe` rather than `toBeGreaterThanOrEqual` in BOTH directions on purpose:
    // a floor ABOVE the widest line refuses printers the document fits on, and a floor BELOW it
    // ships a document that overflows at its own declared minimum.
    for (const type of ["shift_close_slip", "day_summary"] as const) {
      const spec = specOf(type);
      const out = okOf(
        render(spec, shippedDefaults(spec), spec.example_data, WIDE),
        `${type} example`,
      );
      expect(widestColumns(out.blocks), `${type}: the floor and the widest rendered line`).toBe(
        MIN_COLUMNS[type],
      );
      expect(spec.min_columns, `${type}: the spec sources its floor from MIN_COLUMNS`).toBe(
        MIN_COLUMNS[type],
      );
    }
  });

  it("03-F36: at EXACTLY its floor the document renders and no line overflows", () => {
    for (const type of ["shift_close_slip", "day_summary"] as const) {
      const spec = specOf(type);
      const floor = MIN_COLUMNS[type];
      const out = okOf(
        render(spec, shippedDefaults(spec), spec.example_data, capsAt(floor, `AT-FLOOR-${floor}`)),
        `${type} at ${floor}`,
      );
      for (const line of linesOf(out.blocks)) {
        expect(
          line.columns,
          `${type}: "${line.text}" overflows its own declared floor`,
        ).toBeLessThanOrEqual(floor);
      }
    }
  });

  it("03-F49/03-F34: one column below its floor the document is REFUSED, with the two numbers doc 14 needs", () => {
    for (const type of ["shift_close_slip", "day_summary"] as const) {
      const spec = specOf(type);
      const floor = MIN_COLUMNS[type];
      const caps = capsAt(floor - 1, `NARROW-${floor - 1}`);
      const result = render(spec, shippedDefaults(spec), spec.example_data, caps);
      expect(result.ok, `${type} at ${floor - 1}: refused, never squeezed`).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("min_columns_not_met");
      expect(result.severity).toBe("S1");
      expect(result.document_type).toBe(type);
      expect(result.required_columns).toBe(floor);
      expect(result.available_columns).toBe(floor - 1);
    }
  });

  it("03-F49: a 32-column printer prints receipts and NOT a shift-close slip — the purchasing fact, stated", () => {
    // `03-F49` states the 58 mm consequence for the KOT and doc 14 must surface it "at assignment
    // time, not at 20:40 on a Friday". The same sentence now has a second subject, and it is
    // asserted here so it cannot be discovered on a Friday either.
    const fiftyEight = capsAt(32, "58MM-32");
    expect(render(specOf("shift_close_slip"), {}, CONTRADICTORY_SHIFT, fiftyEight).ok).toBe(false);
    expect(render(specOf("day_summary"), {}, DAY, fiftyEight).ok).toBe(false);
  });

  it("03-F49: an 80 mm printer at 42 columns prints BOTH — the floor is not the KOT's by accident", () => {
    // The killing case for "the slip inherited 42": at 42 it would pass, so the discriminating
    // widths are 35..41. 38 is inside that band for the slip and above both floors.
    const eighty = capsAt(38, "80MM-38");
    expect(render(specOf("shift_close_slip"), {}, CONTRADICTORY_SHIFT, eighty).ok).toBe(true);
    expect(render(specOf("day_summary"), {}, DAY, eighty).ok).toBe(true);
  });
});

// ── B. 26 §7 — over/short is a CARRIED FACT, read and never recomputed ──────────────────────────

describe("26 §7/02-F23 — over/short is READ off the close, never re-derived at print time", () => {
  it("the slip prints the CARRIED variance even when the naive subtraction contradicts it in SIGN", () => {
    // This is the headline mutant. `counted − Σ expected` is +Rs 100 (an OVER); the carried fact
    // is −Rs 50 (a SHORT), because a `02-F26` paid-out left the drawer and `02-F44` is the FR that
    // exists because the subtraction cannot see it. A recomputing implementation prints the
    // opposite WORD about the same cashier — `27-F12` makes that word the whole message — and
    // `01-F1` forbids the mutation a read-time recompute performs in effect: it would silently
    // move a number the cashier already signed the moment a late payment arrived.
    const text = documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "carried variance").blocks);
    expect(text).toContain("Over/short SHORT Rs 50");
    expect(text).not.toContain("OVER Rs 100");
    expect(text).not.toMatch(/Over\/short\s+OVER/);
  });

  it("the variance is the ONLY input to that line — moving counted or expected does not move it", () => {
    // The control for the assertion above: if the printed variance tracked the other two fields,
    // this would fail. Same carried variance, wildly different count and expectation.
    const moved: ShiftCloseData = {
      ...CONTRADICTORY_SHIFT,
      counted_cash_paisa: 4_444_400,
      expected_by_method: { ...CONTRADICTORY_SHIFT.expected_by_method, cash: 111_100 },
    };
    expect(documentText(okOf(renderShift(moved), "moved inputs").blocks)).toContain(
      "Over/short SHORT Rs 50",
    );
  });

  it("27-F12: the direction is a WORD in both directions, and zero carries none", () => {
    const over = documentText(
      okOf(renderShift({ ...CONTRADICTORY_SHIFT, variance_paisa: 250_000 }), "over").blocks,
    );
    expect(over).toContain("Over/short OVER Rs 2,500");
    const short = documentText(
      okOf(renderShift({ ...CONTRADICTORY_SHIFT, variance_paisa: -250_000 }), "short").blocks,
    );
    expect(short).toContain("Over/short SHORT Rs 2,500");
    // "OVER Rs 0" is not a thing anyone says, and a clean drawer is what this document certifies.
    const clean = documentText(
      okOf(renderShift({ ...CONTRADICTORY_SHIFT, variance_paisa: 0 }), "clean").blocks,
    );
    expect(clean).toContain("Over/short Rs 0");
    expect(clean).not.toMatch(/Over\/short\s+(OVER|SHORT)/);
    // `27-F12`: never a minus sign. A `-` is one glyph wide, "is the first thing lost at 1–2 m or
    // on a scratched panel, and means nothing to a non-reader".
    //
    // Scoped to the over/short LINE, not to the document. The broad form was written first and
    // was wrong in the way this wave keeps finding: `No-sale opens` carries a hyphen as a WORD,
    // so a document-wide ban either fails on correct output or gets softened until it stops
    // biting. The claim `27-F12` actually makes is about the SIGNED figure.
    const varianceLine = (text: string): string =>
      text.split("\n").find((line) => line.startsWith("Over/short")) ?? "";
    expect(varianceLine(short), "the short line names a direction").toContain("SHORT");
    expect(varianceLine(short)).not.toContain("-");
    expect(varianceLine(short)).not.toContain("−");
    expect(varianceLine(over)).not.toContain("-");
  });

  it("02-F24: the day's over/short is carried too, and its own word", () => {
    expect(documentText(okOf(renderDay(DAY), "day over/short").blocks)).toContain(
      "Over/short OVER Rs 66",
    );
  });
});

// ── C. 02-F43/02-F21/02-F44 — the drawer activity is COUNTED on the paper ───────────────────────

describe("02-F43 — an unbound drawer event reaches the slip, because a slip is a total", () => {
  it("02-F21/02-F43: both no-sale counts print — the bound one and the UNBOUND one", () => {
    // `02-F43`'s named failure, verbatim: an implementation that records the event "and then
    // drops it from every total satisfies the word *logged* while defeating the theft-detection
    // the FR exists for". A cash slip is a total. The two counts are DISTINCT values in the
    // fixture (4 and 2) so a slip printing one of them twice cannot pass by coincidence.
    const text = documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "unbound").blocks);
    expect(text).toContain("No-sale opens 4");
    expect(text).toContain("Unbound no-sale opens 2");
  });

  it("02-F44/02-F43: both paid-out totals print, and they are told apart", () => {
    const text = documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "paid out").blocks);
    expect(text).toContain("Paid out Rs 150");
    expect(text).toContain("Unbound paid out Rs 333");
  });

  it("the unbound rows print at ZERO too — a row that appears only on bad nights is a row nobody looks for", () => {
    const quiet: ShiftCloseData = {
      ...CONTRADICTORY_SHIFT,
      unbound_no_sale_count: 0,
      unbound_paid_out_paisa: 0,
    };
    const text = documentText(okOf(renderShift(quiet), "quiet").blocks);
    expect(text).toContain("Unbound no-sale opens 0");
    expect(text).toContain("Unbound paid out Rs 0");
  });

  it("02-F23: every method prints, including the ones at zero", () => {
    // `01-F32`/`DEC-MONEY-007`: "no card sales this shift" and "the card figure was never
    // computed" are different facts, and a vanished bucket cannot tell them apart. The fixture
    // has exactly one non-zero method, so a renderer that skipped zeros would print one line.
    const text = documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "methods").blocks);
    for (const label of ["Cash", "Card", "Raast", "Khata credit", "Aggregator receivable"]) {
      expect(text, `${label} is missing from the by-method group`).toContain(label);
    }
    expect(text).toContain("Card Rs 0");
    expect(text).toContain("Aggregator receivable Rs 0");
  });

  it("02-F24: every channel prints, and each carries its own figure", () => {
    const text = documentText(okOf(renderDay(DAY), "channels").blocks);
    expect(text).toContain("Counter Rs 12,345");
    expect(text).toContain("Phone Rs 222");
    expect(text).toContain("Storefront Rs 333");
    // `02-F1` writes "WhatsApp" where `02-F42` writes `whatsapp`: the KEY is the kernel enum and
    // the LABEL is the product's name. Both stay right without either moving.
    expect(text).toContain("WhatsApp Rs 444");
    expect(text).toContain("Foodpanda Rs 555");
  });

  it("02-F24: the group the FR names and 01 §4 cannot record is NAMED, not zeroed", () => {
    // `26 §7`: "`void/comp/discount.recorded` … have **no payload schema at all**". So there is
    // no number. `Voids Rs 0` on a night with twelve voids is the "logged but uncounted" shape
    // `02-F43` forbids, moved onto paper; `00 §5.7` says the device reports what it knows.
    const text = documentText(okOf(renderDay(DAY), "adjustments").blocks);
    expect(text).toContain("Voids/comps/discounts NOT RECORDED");
    expect(text).not.toMatch(/Voids[^\n]*Rs/);
  });

  it("02-F24: the shift counts print, so a day closed over an OPEN shift is visible", () => {
    const text = documentText(okOf(renderDay(DAY), "shift counts").blocks);
    expect(text).toContain("Shifts closed 2");
    expect(text).toContain("Shifts open 1");
  });
});

// ── D. 03-F32 — the KOT's ban must still hold, and it must not hold HERE ────────────────────────

/** The `kot` oracle's own detector, restated: a money token is a rupee word or a decimal amount. */
const MONEY_TOKEN = /(^|[^A-Za-z])(Rs|RS|PKR|₨)([^A-Za-z]|$)|\d[\d,]*\.\d\d(?!\d)/;

describe("03-F32 — the money ban is a property of the `kot` TYPE, checked in BOTH directions", () => {
  it("the `kot` still renders no money token, with all three specs shipped", () => {
    // The mutant this kills is "the ban was relaxed to let the cash documents through". K-5's own
    // suite is the exhaustive assertion (`kot-document.test.ts`, every profile shape); this is the
    // one that fails in THIS file if S-7 reached for the ban rather than for the type.
    const kot = DOCUMENT_SPECS.kot;
    expect(kot, "no `kot` spec is shipped").toBeDefined();
    const spec = kot as unknown as AnySpec;
    const out = okOf(render(spec, shippedDefaults(spec), spec.example_data, WIDE), "kot");
    expect(MONEY_TOKEN.test(documentText(out.blocks))).toBe(false);
  });

  it("the detector is not vacuous — it fires on both cash documents", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a detector that matches nothing
    // reports every document clean, including the `kot`. These two documents are ENTIRELY money,
    // so they are the instrument's calibration.
    expect(
      MONEY_TOKEN.test(documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "slip").blocks)),
    ).toBe(true);
    expect(MONEY_TOKEN.test(documentText(okOf(renderDay(DAY), "day").blocks))).toBe(true);
  });

  it("03-F32: NO spec — cash or chit — declares a slot addressing a money value", () => {
    // "Enforced structurally — the profile schema has no slot id addressing them." That is a
    // question about the NAME, and it holds for the cash documents too: their money arrives in
    // DATA, so an owner cannot suppress, rename or re-point a figure on the form she signs.
    const words = ["price", "amount", "total", "money", "rs", "pkr", "cash", "paisa", "rupee"];
    for (const [type, spec] of Object.entries(DOCUMENT_SPECS)) {
      for (const block of (spec as AnySpec).blocks) {
        for (const slot of block.slots) {
          for (const word of words) {
            expect(
              slot.slot_id.toLowerCase().includes(word),
              `${type}/${slot.slot_id} addresses money from a PROFILE`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("03-F30/03-F33: the only holes either cash document declares are the two owner notes, outside every locked region", () => {
    for (const type of ["shift_close_slip", "day_summary"] as const) {
      const spec = specOf(type);
      const declared = spec.blocks.flatMap((block) => block.slots.map((slot) => slot.slot_id));
      expect(declared.sort()).toEqual(["footer_note", "header_note"]);
      for (const block of spec.blocks) {
        if (block.slots.length === 0) continue;
        expect(
          ["HEAD_LOCKED", "FISCAL_LOCKED", "TAIL_LOCKED"].includes(block.region),
          `${type}/${block.block_id} puts an owner slot in a locked region`,
        ).toBe(false);
      }
    }
  });

  it("03-F30: no profile an owner can write moves a figure on either document", () => {
    // The runtime twin of the structural claim above: sweep money-shaped values through every
    // declared slot and assert the TOTALS region is byte-stable. An owner note may change the
    // document (that is what a hole is for); a number may not move because of one.
    const sweep = ["Rs 9,999,999", "0.00", "PKR 1", "", "1234"];
    for (const type of ["shift_close_slip", "day_summary"] as const) {
      const spec = specOf(type);
      const baseline = okOf(
        render(spec, shippedDefaults(spec), spec.example_data, WIDE),
        `${type} baseline`,
      );
      const totalsOf = (blocks: Ok["blocks"]): string =>
        blocks
          .filter((block) => block.region === "TOTALS")
          .map((block) =>
            partsOf([block])
              .map((part) => part.value ?? "")
              .join(""),
          )
          .join("|");
      expect(
        totalsOf(baseline.blocks).length,
        `${type} has no TOTALS content to protect`,
      ).toBeGreaterThan(0);
      for (const slot of spec.blocks.flatMap((block) => block.slots)) {
        for (const value of sweep) {
          const out = okOf(
            render(
              spec,
              { ...shippedDefaults(spec), [slot.slot_id]: value },
              spec.example_data,
              WIDE,
            ),
            `${type}/${slot.slot_id}=${value}`,
          );
          expect(totalsOf(out.blocks), `${type}/${slot.slot_id} moved a total`).toBe(
            totalsOf(baseline.blocks),
          );
        }
      }
    }
  });
});

// ── E. 27-F22/F23/F24 — the money format ────────────────────────────────────────────────────────

describe("27-F22/27-F23 — Western digits, `Rs` symbol-first, no operational decimals", () => {
  const allText = (): string =>
    `${documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "fmt slip").blocks)}\n${documentText(okOf(renderDay(DAY), "fmt day").blocks)}`;

  it("27-F23: the symbol is `Rs` and it leads — never `₨`, never `PKR`", () => {
    const text = allText();
    expect(text).toContain("Rs ");
    expect(text).not.toContain("₨");
    expect(text).not.toContain("PKR");
    // Symbol-FIRST: no figure is followed by the symbol.
    expect(text).not.toMatch(/\d\s*Rs\b/);
  });

  it("27-F22: Western digits only — U+0660–0669 and U+06F0–06F9 appear nowhere", () => {
    expect(allText()).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("27-F23: no decimals on an operational document, and no sub-rupee unit is invented", () => {
    // "No sub-rupee unit circulates and the decimal point is the highest-consequence keystroke
    // there is." A slip that printed `Rs 1,500.00` would be reintroducing it on paper.
    expect(allText()).not.toMatch(/Rs [\d,]*\.\d/);
  });

  it("27-F23: Western 3-digit grouping — Pakistan does NOT inherit lakh grouping", () => {
    // The discriminating figure: Rs 1,234,567. Lakh grouping writes it `12,34,567`, and CLDR
    // gives `ur`/`en-PK` the `#,##0.###` pattern precisely so it does not.
    const text = documentText(
      okOf(
        renderShift({
          ...CONTRADICTORY_SHIFT,
          expected_by_method: {
            ...CONTRADICTORY_SHIFT.expected_by_method,
            cash: 123_456_700,
          },
        }),
        "grouping",
      ).blocks,
    );
    expect(text).toContain("Cash Rs 1,234,567");
    expect(text).not.toContain("12,34,567");
  });

  it("27-F24: every figure arrives finished — no expression on the paper asks a cashier to subtract", () => {
    // "~60% of rural Class 1 recognise numbers against 9.5% who can do any arithmetic." So no
    // line may carry an operator between two figures.
    expect(allText()).not.toMatch(/Rs [\d,]+\s*[-+=]\s*Rs/);
  });
});

// ── F. 03-F30 — purity, and the clock that must not be read ────────────────────────────────────

describe("03-F30 — render is pure, and nothing on either document reads a clock", () => {
  it("identical inputs produce byte-identical output, twice over", () => {
    const a = okOf(renderShift(CONTRADICTORY_SHIFT), "pure a").bytes;
    const b = okOf(renderShift(CONTRADICTORY_SHIFT), "pure b").bytes;
    expect([...a]).toEqual([...b]);
    const c = okOf(renderDay(DAY), "pure c").bytes;
    const d = okOf(renderDay(DAY), "pure d").bytes;
    expect([...c]).toEqual([...d]);
  });

  it("01-F46: the date on the day summary is the BUSINESS date it was handed, not today", () => {
    // "The timezone anchor is not configurable" and the cutover is 05:00 Asia/Karachi, so a day
    // opened at 01:30 belongs to the night it was served. That derivation is the fold's
    // (`domain`'s `businessDate`); this document must print what it was given and nothing else.
    const text = documentText(
      okOf(renderDay({ ...DAY, business_date: "2026-01-02" }), "business date").blocks,
    );
    expect(text).toContain("DAY SUMMARY 2026-01-02");
    expect(text).not.toContain("2026-08-07");
  });

  it("the source of both documents reads no `Date`, no `Intl` and no locale", () => {
    // A clock read is INVISIBLE to a same-process byte-comparison — two renders a millisecond
    // apart agree — so purity is also asserted against the source, exactly as `document.ts`'s
    // `clockOf` is written to be. `toLocaleString` is banned for the same reason and it is not
    // theoretical: a React Native/Hermes build without full ICU answers "99999999" where Electron
    // answers "99,999,999", and `03-F30` makes byte-identity across those two devices a LAW.
    const src = readFileSync(new URL("../cash-documents.ts", import.meta.url), "utf8");
    expect(src.length, "the guard is reading an empty file").toBeGreaterThan(4_000);
    // Anchored on something that has nothing to do with clocks, so the scan cannot pass by not
    // looking (ROUND-2 pattern 2).
    expect(src).toContain("Voids/comps/discounts");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      "new Date",
      "Date.now",
      "Intl.",
      "toLocaleString",
      "toLocaleDateString",
    ]) {
      expect(
        code,
        `${banned} is a device-dependent read inside a function 03-F30 makes pure`,
      ).not.toContain(banned);
    }
  });
});

// ── G. 03-F37 / 02-F45 / 00 §5.6 ────────────────────────────────────────────────────────────────

describe("03-F37/02-F45/00 §5.6 — the marker, the attribution, and the user's own name", () => {
  it("03-F37: the reprint band prints, in a LOCKED region, and no profile reaches it", () => {
    // "Reprints are already a named fraud vector — the paper must say so", and a second copy of a
    // close slip is a second signature surface. The band declares no slot, so `03-F33`/`03-F34`
    // make it unsuppressible rather than merely unsuppressed.
    for (const [label, ok] of [
      ["shift", okOf(renderShift({ ...CONTRADICTORY_SHIFT, reprint: true }), "reprint slip")],
      ["day", okOf(renderDay({ ...DAY, reprint: true }), "reprint day")],
    ] as const) {
      expect(documentText(ok.blocks), `${label}: no REPRINT band`).toContain("REPRINT");
      expect(regionOfText(ok.blocks, "REPRINT")).toBe("HEAD_LOCKED");
      const band = partsOf(ok.blocks).find((part) => part.value === "REPRINT");
      expect(band?.ink, `${label}: the band is 27-F56's one inverted banner`).toBe("inverted");
      expect(band?.scope).toBe("banner");
    }
    expect(documentText(okOf(renderShift(CONTRADICTORY_SHIFT), "no reprint").blocks)).not.toContain(
      "REPRINT",
    );
  });

  it("02-F45: a null attribution is SAID, not left blank", () => {
    // Null is a real state: an event appended before identity reached the envelope, or an
    // `01-F31` divergence where two devices claimed one shift under different PINs and the fold
    // refused to pick a winner. A blank line reads as a printing fault; the words read as the
    // fact, and `02-F23`'s "recorded and attributed" is unmet either way — which is what the
    // paper should say.
    const text = documentText(
      okOf(renderShift({ ...CONTRADICTORY_SHIFT, cashier: null }), "unattributed").blocks,
    );
    expect(text).toContain("Cashier NOT ATTRIBUTED");
  });

  it("00 §5.6/03-F8: a non-Latin cashier name REFUSES the document rather than printing a name nobody can read", () => {
    // "English-only UI; **user content is Unicode** and renders/prints faithfully." A staff
    // display name is user content, so it takes `user_text` — and `03-F8`'s July 2026 ruling
    // makes a non-Latin `user_text` a refusal, because the raster text path is unwalked until a
    // font and a shaping engine are chosen and "a raster was emitted" cannot stand in for
    // legibility. The REASON is the assertion: `non_ascii_system_text` would claim the platform's
    // own English is broken and is permanent, where `raster_font_unavailable` names the actual
    // state of the world and is not.
    const result = renderShift({ ...CONTRADICTORY_SHIFT, cashier: "عائشہ خان" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("raster_font_unavailable");
    expect(result.severity).toBe("S1");
  });

  it("a Latin cashier name prints through printer fonts, unchanged", () => {
    expect(
      documentText(okOf(renderShift({ ...CONTRADICTORY_SHIFT, cashier: "Bilal" }), "latin").blocks),
    ).toContain("Cashier Bilal");
  });

  it("27-F58: groups are separated by BLANK LINES, never by a rule", () => {
    for (const [label, ok] of [
      ["shift", okOf(renderShift(CONTRADICTORY_SHIFT), "groups slip")],
      ["day", okOf(renderDay(DAY), "groups day")],
    ] as const) {
      const lines = linesOf(ok.blocks);
      expect(
        lines.filter((line) => line.blank).length,
        `${label}: no group separation`,
      ).toBeGreaterThan(2);
      for (const line of lines) {
        expect(line.text, `${label}: "${line.text}" is a rule`).not.toMatch(/[-=_*]{4,}/);
      }
    }
  });

  it("03-F36: no interior space run carries a value to a right-hand column", () => {
    // "**Banned** … space-as-layout (it makes a document permanently unreflowable)." Every row on
    // both documents is `label` + ONE space + value, which is also `27-F57`'s answer for the same
    // readers: a value read in a distant column is the mapping step where comprehension collapses.
    for (const [label, ok] of [
      ["shift", okOf(renderShift(CONTRADICTORY_SHIFT), "spaces slip")],
      ["day", okOf(renderDay(DAY), "spaces day")],
    ] as const) {
      for (const line of linesOf(ok.blocks)) {
        expect(line.text, `${label}: "${line.text}" pads to a column`).not.toMatch(/\S {2,}\S/);
      }
    }
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns it ────────────────────────────────
//
//  * **K-8, the physical pass.** No printer has ever been attached. Whether these bytes produce a
//    legible slip on 80 mm thermal paper is unobserved, and `27-F35`'s ≥85% comprehension gate on
//    real staff is owed with it.
//  * **`02-F24`'s voids/comps/discounts.** `01 §4` has no `void.recorded`, `comp.recorded` or
//    `discount.recorded` (`26 §7` states it outright), so the group is a NAMED GAP on the paper
//    and there is no number to assert. Owned by whichever task adds those event types; the field
//    lands on `DaySummaryData` with them.
//  * **`09-F19`'s rider settlement slip.** "The rider settlement slip mirrors `02-F23`" — this
//    document's shape is that precedent, but doc 09's own type is unwritten and nothing here
//    constrains it.
//  * **Whether the numbers are the RIGHT numbers.** The fold's suite owns that
//    (`sync-client/src/folds/__acceptance__`); this file asserts only that what arrives is what
//    prints, and that nothing is recomputed on the way.
//  * **A day-level over/short that is itself carried.** `day.closed` carries a count and no
//    expectation, so the day's figure is the SUM of the shifts' carried variances, assembled by
//    the caller. If a future FR puts a variance on `day.closed`, this document should read it
//    instead — and this note is where that decision was left.

import { readFileSync } from "node:fs";
