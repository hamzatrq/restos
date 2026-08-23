// ACCEPTANCE TESTS — the `receipt` DocumentSpec (`02-F15`, `02-F16`, `03-F31`).
//
// PROVENANCE (24 §3 step 2), stated rather than glossed: this file was authored by the session
// that implemented against it, which is NOT the `24 §3` split. `cash-documents.test.ts` records
// the same and takes the same mitigation, which is the ROUND-3 LAW: a CONTROL implementation and
// single-branch MUTANTS were built, the suite was taken green against the control, and every
// mutant was confirmed to red the assertion that claims to own it. The matrix is in
// `packages/escpos/CLAUDE.md`. A suite nobody has tried to break is a suite nobody knows the
// strength of, and reading one never finds the guard that was never pointed at the dangerous case.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   02-F15  "Receipt printing 58/80 mm via doc 03: configurable header/footer/logo, optional QR
//           (menu link, or FBR invoice QR when doc 16 is active). Receipt content: order number,
//           channel, date/time, cashier; lines with variants/modifiers, discount lines, totals;
//           payment method(s) and change; fiscal fields when doc 16 is on."
//   02-F16  "Success emits `receipt.printed`; reprint is always logged with actor … reprints are a
//           classic fraud vector".
//   02-F12  payment methods, "cash (change due computed and displayed)" — DISPLAYED, at the
//           counter. Nothing in `01 §4` records what was handed over.
//   02-F42  `channel` is a CLOSED set and it is a price key.
//   01-F30  billed_effective — "a fully-voided order nets to zero"; the fold accumulates in BigInt.
//   01-F53  a line's `unit_price_paisa` is captured into the event at line-add and never re-read.
//   26 §7   `void/comp/discount.recorded` "have **no payload schema at all**".
//   03-F30  `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?)` is PURE: "identical (spec,
//           profile, data, caps) must produce **byte-identical** output on Electron and React
//           Native."
//   03-F31  document types are first-class; "structural differences live in the TYPE … price
//           presence".
//   03-F33  the region ladder; `FISCAL_LOCKED` blocks are "not in the `DocumentSpec` at all" and
//           the adapter "declares the block AND its position".
//   03-F34  "a hard refusal to print plus an S1 band (27-F11d), never a silent degradation".
//   03-F36  banned: absolute dot positioning, and space-as-layout.
//   03-F37  "Reprint markers are mandatory **per type**, in a locked region."
//   03-F49  `receipt` declares **32** columns and below it is refused, never squeezed.
//   03-F8   (July 2026 ruling) a non-Latin USER field is REFUSED (`raster_font_unavailable`),
//           never rastered blind; interface text carrying one is `non_ascii_system_text`.
//   16-F1   "Tax is off by default"; doc 16 ships "on demand".
//   27-F22  Western digits (U+0030–0039) everywhere; never U+0660–0669.
//   27-F23  "`Rs`, symbol-first; Western 3-digit grouping; no decimals … Not `₨`, not `PKR`."
//   27-F24  "The system computes; staff read" — every total arrives as a finished number.
//   27-F56  the ink ladder: inverted for ONE banner per document; 2×2 for the KOT's quantity and
//           order identifier; "bold is not a level".
//   27-F57  "Quantity sits immediately left of the item name on the same line."
//   27-F58  "Groups are separated by **blank lines, not rules**."
//   00 §5.6 English-only interface; user content is Unicode and prints faithfully.
//
// ⚠ WHAT THIS SUITE IS NOT EVIDENCE FOR.
//  * **ANY PHYSICAL PRINTER.** K-8 is owed in full; no printer has ever been attached to this
//    product. Every assertion below is over EMITTED BYTES and a rendered block list, and no test
//    name here may be read as "the receipt printed".
//  * **COMPREHENSION.** `27-F35`'s ≥85% gate is measured on real staff and is owed with K-8.
//  * **THE LEDGER.** Whether the numbers handed in are the RIGHT numbers belongs to the fold's own
//    suite. This file asserts that what arrives is what prints, and that nothing is recomputed.
//  * **`02-F16`'s EVENT.** `receipt.printed` is in the `01 §4` catalog and has no payload schema in
//    `packages/domain`, so nothing can emit it yet. See the DEFERRED block at the foot.

import { describe, expect, it } from "vitest";
import type {
  DocumentProfile,
  DocumentSpec,
  FiscalBlock,
  PrinterCapability,
  ReceiptData,
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

const receiptSpec = (): AnySpec => {
  const spec = DOCUMENT_SPECS.receipt;
  expect(
    spec,
    "no `receipt` DocumentSpec ships — 03-F31 makes the type first-class or absent, and a " +
      "restaurant that cannot hand a customer a receipt is the gap this file exists to close",
  ).toBeDefined();
  return spec as AnySpec;
};

/** `03-F30`: "a preset with a hole" — every declared slot at its shipped default. */
const shippedDefaults = (spec: AnySpec): DocumentProfile =>
  Object.fromEntries(
    spec.blocks.flatMap((block) => block.slots.map((slot) => [slot.slot_id, slot.default])),
  );

type Part = { kind: string; value?: string; ink?: string; lines?: number; scope?: string };
type Ok = {
  ok: true;
  blocks: readonly { block_id: string; region: string; parts: readonly Part[] }[];
  bytes: Uint8Array;
};
type Refusal = { ok: false; reason: string; severity: string; document_type: string };

const okOf = (result: ReturnType<typeof render>, label: string): Ok => {
  expect(result.ok, `${label}: render refused — ${result.ok ? "" : result.reason}`).toBe(true);
  return result as unknown as Ok;
};

const refusalOf = (result: ReturnType<typeof render>, label: string): Refusal => {
  expect(result.ok, `${label}: expected a refusal, got a rendered document`).toBe(false);
  return result as unknown as Refusal;
};

/**
 * The document as LINES, with each line's COLUMN COST.
 *
 * `ESC d n` is "print and feed n lines", so a feed ends the current line and leaves `n - 1` blank
 * ones behind it — which is how `27-F58`'s "groups are separated by blank lines" becomes
 * observable. A `size_2x2` run costs TWO columns per character (`27-F57` does that sum itself), so
 * a layout reaching for the 2× rung is measured at its real width rather than at half of it.
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
    for (const part of block.parts) {
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

const textOf = (blocks: Ok["blocks"]): string =>
  linesOf(blocks)
    .map((line) => line.text)
    .join("\n");

const partsOf = (blocks: Ok["blocks"]): Part[] => blocks.flatMap((block) => [...block.parts]);

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const draw = (data: ReceiptData, caps: PrinterCapability = WIDE, label = "receipt"): Ok => {
  const spec = receiptSpec();
  return okOf(render(spec, shippedDefaults(spec), data, caps), label);
};

// ── the fixtures ─────────────────────────────────────────────────────────────────────────────────

/**
 * A plain counter sale. The numbers are chosen so no two tokens collide: the unit price renders
 * `Rs 450`, its EXTENDED amount would render `Rs 900`, and the total renders `Rs 960` — three
 * distinct strings, which is what lets §C tell "printed the unit price" from "printed the line
 * total" and from "printed the order total".
 */
const SALE: ReceiptData = {
  receipt_no: "5f3a9c21",
  channel: "counter",
  // A delivered branch stamp (`01-F43`), as UTC milliseconds. 09:30 UTC is 14:30 in Asia/Karachi.
  branch_created_at: Date.UTC(2026, 7, 9, 9, 30),
  cashier: "Ayesha Khan",
  lines: [
    { quantity: 2, name: "Chicken Karahi", unit_price_paisa: 45_000 },
    { quantity: 1, name: "Garlic Naan", unit_price_paisa: 6_000 },
  ],
  total_paisa: 96_000,
  tenders: [{ method: "cash", amount_paisa: 96_000 }],
  reprint: false,
};

const with_ = (over: Partial<ReceiptData>): ReceiptData => ({ ...SALE, ...over });

// ── §A — 03-F31 / 03-F49: the type, and its own floor ────────────────────────────────────────────

describe("§A 03-F31/03-F49 — `receipt` is a first-class type with its own declared floor", () => {
  it("03-F31: a `receipt` DocumentSpec ships, versioned, with its own data contract", () => {
    const spec = receiptSpec();
    expect(spec.type).toBe("receipt");
    expect(spec.version, "03-F30 versions a spec — an unversioned one cannot be migrated").toBe(1);
    expect(spec.blocks.length, "a spec with no block renders nothing").toBeGreaterThan(0);
  });

  it("03-F49: the floor is 32 and it is READ from the one declaration, never a second copy", () => {
    // "`kot` declares **42**; `receipt` and `bill` declare **32**." Two declarations of one number
    // is the defect the `as const` on `MIN_COLUMNS` exists to prevent.
    expect(MIN_COLUMNS.receipt).toBe(32);
    expect(receiptSpec().min_columns).toBe(MIN_COLUMNS.receipt);
  });

  it("03-F49/03-F34: at 32 columns it renders; at 31 it is REFUSED, never squeezed", () => {
    const spec = receiptSpec();
    const profile = shippedDefaults(spec);
    okOf(render(spec, profile, SALE, capsAt(32, "AT-FLOOR")), "at exactly 32 columns");
    const refusal = refusalOf(
      render(spec, profile, SALE, capsAt(31, "BELOW-FLOOR")),
      "one column below the floor",
    );
    expect(refusal.reason).toBe("min_columns_not_met");
    expect(refusal.severity, "03-F34 requires an S1 band").toBe("S1");
    expect(refusal.document_type).toBe("receipt");
  });

  it("03-F49: the 58 mm printer that cannot print a KOT CAN print this — the purchasing fact", () => {
    // "a 58 mm printer cannot print kitchen tickets. **It can still print receipts and bills.**"
    // A 58 mm head is 384 dots = 32 Font-A columns.
    const narrow = capsAt(32, "58MM-CLASS");
    okOf(render(receiptSpec(), shippedDefaults(receiptSpec()), SALE, narrow), "58 mm class");
    const kot = DOCUMENT_SPECS.kot as AnySpec | undefined;
    expect(kot, "the kot spec is the other half of this comparison").toBeDefined();
    const kotSpec = kot as AnySpec;
    refusalOf(
      render(kotSpec, shippedDefaults(kotSpec), kotSpec.example_data, narrow),
      "the kot on the same 58 mm printer",
    );
  });
});

// ── §B — 02-F15's first group: order number, channel, date/time, cashier ─────────────────────────

describe("§B 02-F15 — order number, channel, date/time, cashier", () => {
  it("02-F15: the order number is on the paper", () => {
    expect(textOf(draw(SALE).blocks)).toContain("5f3a9c21");
  });

  it("02-F15/00 §5.6: the channel prints as an ENGLISH WORD, not as the kernel identifier", () => {
    // `02-F42` closes the set and its members are identifiers (`whatsapp`), not words. `00 §5.6`
    // makes the interface English, and `01-F54`'s degrade-to-identifier is for a MISSING label.
    const text = textOf(draw(with_({ channel: "whatsapp" })).blocks);
    expect(text).toContain("WhatsApp");
    expect(text, "the raw kernel identifier reached the customer's paper").not.toMatch(
      /\bwhatsapp\b/,
    );
  });

  it("02-F15: every member of 02-F42's closed channel set prints a distinct word", () => {
    const words = (["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const).map(
      (channel) => {
        const line = linesOf(draw(with_({ channel })).blocks).find((l) =>
          l.text.startsWith("Channel "),
        );
        expect(line, `${channel}: no channel row on the document`).toBeDefined();
        return (line as Line).text;
      },
    );
    expect(new Set(words).size, "two channels print the same word").toBe(words.length);
  });

  it("02-F15/27-F62: the stamp carries a DATE as well as a time, from the delivered branch stamp", () => {
    // `02-F15` asks a receipt for "date/time" where `03-F3` asked the KOT only for a "timestamp".
    // A receipt outlives the shift it was printed in — `02-F36`'s refund and `02-F10`'s recall are
    // both reached from it — so a time with no date stops being usable the next morning.
    const noon = Date.UTC(2026, 7, 9, 7, 5); // 12:05 in Asia/Karachi (UTC+5)
    const line = linesOf(draw(with_({ branch_created_at: noon })).blocks).find((l) =>
      l.text.startsWith("Date "),
    );
    expect(line, "no date row on the document").toBeDefined();
    expect((line as Line).text).toBe("Date 2026-08-09 12:05");
  });

  it("27-F62/01-F45: the stamp is the DELIVERED one — a different stamp is a different document", () => {
    const a = draw(with_({ branch_created_at: Date.UTC(2026, 7, 9, 7, 5) }));
    const b = draw(with_({ branch_created_at: Date.UTC(2026, 0, 2, 7, 5) }));
    expect(hex(a.bytes), "the date is not being read at all").not.toBe(hex(b.bytes));
    expect(textOf(b.blocks)).toContain("2026-01-02");
  });

  it("00 §5.7: an order that was never confirmed has NO branch stamp, and the receipt says so", () => {
    // `01-F17` lets a cashier settle an order that never went to the kitchen, and the only
    // delivered branch stamp an order carries on this device is its confirm anchor. Reading the
    // device clock instead would stamp the moment the printer got round to it (`01-F45`).
    const text = textOf(draw(with_({ branch_created_at: null })).blocks);
    expect(text).toContain("Date NOT RECORDED");
    expect(text, "a missing stamp printed as an epoch, a blank or a zero").not.toMatch(
      /Date\s+(0|1970|\s*$)/m,
    );
  });

  it("02-F15/02-F45: the cashier is named, and a null attribution is said out loud", () => {
    expect(textOf(draw(SALE).blocks)).toContain("Ayesha Khan");
    expect(textOf(draw(with_({ cashier: null })).blocks)).toContain("NOT ATTRIBUTED");
  });

  it("03-F8/00 §5.6: a non-Latin CASHIER NAME refuses as USER content, never as interface text", () => {
    // A staff display name is user content ("user content is Unicode"), so the honest refusal is
    // `raster_font_unavailable` — the raster text path is unwalked until a font and a shaping
    // engine are chosen. `non_ascii_system_text` would claim the platform's own English is broken,
    // which is a permanent condition and a different (wrong) sentence on `03-F34`'s S1 band.
    const spec = receiptSpec();
    const refusal = refusalOf(
      render(spec, shippedDefaults(spec), with_({ cashier: "عائشہ" }), WIDE),
      "an Urdu cashier name",
    );
    expect(refusal.reason).toBe("raster_font_unavailable");
    expect(refusal.severity).toBe("S1");
  });
});

// ── §C — 02-F15's lines, under 27-F57's pairing ──────────────────────────────────────────────────

describe("§C 02-F15/27-F57 — the lines, and the price that is not a line total", () => {
  it("27-F57: the quantity sits immediately left of the item name, on the SAME line", () => {
    const line = linesOf(draw(SALE).blocks).find((l) => l.text.includes("Chicken Karahi"));
    expect(line, "the item never reached the paper").toBeDefined();
    expect(
      (line as Line).text.startsWith("2 Chicken Karahi"),
      `the quantity is not immediately left of the name it counts: ${JSON.stringify((line as Line).text)}`,
    ).toBe(true);
  });

  it("27-F57: the quantity is never on its own row and never right-aligned into a column", () => {
    const lines = linesOf(draw(SALE).blocks).filter((l) => !l.blank);
    expect(
      lines.some((l) => /^\d+$/.test(l.text.trim())),
      "a quantity is on a row of its own",
    ).toBe(false);
    // `03-F36` bans space-as-layout, whose signature is a run of padding used to reach a column.
    for (const line of lines) {
      expect(line.text, `space-as-layout in ${JSON.stringify(line.text)}`).not.toMatch(/\S {2,}\S/);
    }
  });

  it("02-F15/01-F53: the money beside a line is the CAPTURED UNIT price, said to be per-unit", () => {
    // `01-F53` snapshots `unit_price_paisa` at line-add. Printing it unlabelled beside a quantity
    // of 2 reads as the line's cost, which is a WRONG NUMBER on a document a customer checks — so
    // the word that makes it a unit price is part of the assertion, not decoration.
    const text = textOf(draw(SALE).blocks);
    expect(text).toContain("2 Chicken Karahi Rs 450 each");
    expect(
      text,
      "the EXTENDED amount (2 × Rs 450) was printed — that product is `billedCellPaisa`, fold " +
        "logic carrying 01-F30's exited-line rule, and 26 §8 forbids re-deriving it here",
    ).not.toContain("Rs 900");
  });

  it("02-F15: every line reaches the paper, and a different line is a different document", () => {
    const text = textOf(draw(SALE).blocks);
    expect(text).toContain("Garlic Naan");
    const swapped = draw(
      with_({ lines: [{ quantity: 3, name: "Seekh Kebab", unit_price_paisa: 32_000 }] }),
    );
    expect(textOf(swapped.blocks)).toContain("3 Seekh Kebab Rs 320 each");
    expect(textOf(swapped.blocks)).not.toContain("Chicken Karahi");
  });

  it("03-F8/00 §5.6: a non-Latin ITEM NAME refuses as USER content — a catalog name is not our English", () => {
    // An item name is owner-authored catalog data, the same category as the cashier's name and as
    // an owner note. The refusal code decides which sentence `03-F34`'s S1 band shows, and only
    // `raster_font_unavailable` names the true state of the world.
    const spec = receiptSpec();
    const refusal = refusalOf(
      render(
        spec,
        shippedDefaults(spec),
        with_({ lines: [{ quantity: 1, name: "چکن کڑاہی", unit_price_paisa: 45_000 }] }),
        WIDE,
      ),
      "an Urdu item name",
    );
    expect(refusal.reason).toBe("raster_font_unavailable");
  });

  it("03-F34/00 §5.6: the refusal is TOTAL — no partial receipt is emitted alongside it", () => {
    const spec = receiptSpec();
    const result = render(
      spec,
      shippedDefaults(spec),
      with_({ lines: [{ quantity: 1, name: "چکن کڑاہی", unit_price_paisa: 45_000 }] }),
      WIDE,
    );
    expect(result.ok).toBe(false);
    expect(
      Object.keys(result),
      "a refusal carried bytes or blocks — there is nothing a caller could print anyway",
    ).not.toContain("bytes");
  });
});

// ── §D — 02-F15's totals and tenders ─────────────────────────────────────────────────────────────

describe("§D 02-F15/27-F24 — the total arrives finished, and the tenders are the ledger's", () => {
  it("01-F30/27-F24: the total is the CARRIED figure, never a sum of the lines on the paper", () => {
    // THE MONEY ASSERTION, and the fixture is the dangerous case rather than the ordinary one.
    // `01-F30`: "a fully-voided order nets to zero" — an exited line contributes nothing to
    // billed_effective while still appearing on the ticket. So a renderer that added the lines up
    // would disagree with the ledger, and the two must be told apart by DATA in which they differ.
    const voidedKarahi = with_({ total_paisa: 6_000 });
    const text = textOf(draw(voidedKarahi).blocks);
    expect(text).toContain("Total Rs 60");
    expect(
      text,
      "the document re-derived its own total from the lines instead of printing the fold's",
    ).not.toContain("Total Rs 960");
  });

  it("02-F15: the total reaches the paper and moves with the datum", () => {
    expect(textOf(draw(SALE).blocks)).toContain("Total Rs 960");
    expect(textOf(draw(with_({ total_paisa: 1_234_500 })).blocks)).toContain("Total Rs 12,345");
  });

  it("02-F15/02-F13: EVERY tender prints, one row per method, labelled in English", () => {
    // `02-F13` settles one order across several methods. A document that printed only the first
    // would understate what the customer paid, permanently, on the copy they keep.
    const split = with_({
      tenders: [
        { method: "cash", amount_paisa: 50_000 },
        { method: "raast", amount_paisa: 46_000 },
      ],
    });
    const text = textOf(draw(split).blocks);
    expect(text).toContain("Cash Rs 500");
    expect(text).toContain("Raast Rs 460");
    expect(text, "a kernel identifier reached the paper instead of a word").not.toContain("raast");
  });

  it("01-F32/00 §5.6: khata credit is a WORD on the paper, not the enum member", () => {
    const text = textOf(
      draw(with_({ tenders: [{ method: "khata_credit", amount_paisa: 96_000 }] })).blocks,
    );
    expect(text).toContain("Khata credit Rs 960");
    expect(text).not.toContain("khata_credit");
  });

  it("02-F37/01-F17: a receipt with NO tender still renders — 'paid nothing yet' is a real state", () => {
    const text = textOf(draw(with_({ tenders: [] })).blocks);
    expect(text).toContain("Paid");
    expect(text).toContain("Total Rs 960");
  });
});

// ── §E — the money vocabulary (27-F22, 27-F23) ───────────────────────────────────────────────────

describe("§E 27-F22/27-F23 — one money token, and it is the platform's", () => {
  it("27-F23: `Rs`, symbol-first, one space, and NEVER `₨` or `PKR`", () => {
    const text = textOf(draw(SALE).blocks);
    expect(text).toMatch(/Rs \d/);
    expect(text).not.toContain("₨");
    expect(text).not.toContain("PKR");
  });

  it("27-F23: Western 3-digit grouping — Pakistan does NOT inherit lakh grouping", () => {
    const text = textOf(draw(with_({ total_paisa: 999_999_900 })).blocks);
    expect(text).toContain("Total Rs 9,999,999");
    expect(text, "a lakh/crore grouping reached the paper").not.toContain("99,99,999");
  });

  // ⚠ **A GREEN TEST DEFENDING AN OVERRULED RULE, RETIRED IN THE SAME CHANGE AS THE RULING
  // (August 2026, `02-F63` / founder ruling R70).** It read:
  //
  //   it("27-F23: no decimals — sub-rupee is dropped, never rounded up and never printed", () => {
  //     const text = textOf(draw(with_({ total_paisa: 96_099 })).blocks);
  //     expect(text).toContain("Total Rs 960");
  //     expect(text).not.toContain("960.99");
  //     expect(text).not.toContain("Total Rs 961");
  //   });
  //
  // It was right about `27-F23` and wrong about this document's SCOPE: that FR says "no decimals
  // **on operational screens**", and paper is not one. What the assertion actually pinned was the
  // truncation in `rupeesFromPaisa`, which cost a customer's receipt up to 99 paisa on the *Total*
  // and made `Subtotal + Tax = Total` false by a rupee on the paper — the defect R70 was ruled on.
  // `receipt-tax-line.test.ts`'s DEFERRED item 1 flagged it as *"the sharpest open question in
  // R39's scope"* and named its owner as "a founder ruling + an FR"; this is that ruling arriving.
  //
  // **Not deleted, and both halves of its property are re-pinned below** — the formatter still
  // never rounds what it is handed (that is `02-F63`'s job, one layer up in `billedTotalPaisa`),
  // and a whole-rupee figure still carries no decimal point, which is what keeps every other
  // document in this package byte-identical.
  it("02-F63 (f): a sub-rupee figure PRINTS its paisa — never dropped, never rounded here", () => {
    const text = textOf(draw(with_({ total_paisa: 96_099 })).blocks);
    expect(text, "the sub-rupee part was dropped — the R70 defect").toContain("Total Rs 960.99");
    expect(text, "the FORMATTER rounded; rounding belongs to the charge, not the token").toContain(
      "Total Rs 960.99",
    );
    expect(text).not.toContain("Total Rs 961");
  });

  it("02-F63 (f): a WHOLE-rupee figure carries no decimal point at all", () => {
    // The half that keeps `27-F23`'s spirit and every existing golden document unchanged: after
    // R70 the CHARGE is rounded, so an operational figure is whole and prints as it always did.
    // A `.00` on every row is the named-and-refused alternative in `document-parts.ts`.
    const text = textOf(draw(with_({ total_paisa: 96_000 })).blocks);
    expect(text).toContain("Total Rs 960");
    expect(text, "a whole-rupee figure grew a decimal point").not.toMatch(/Total Rs 960\./);
  });

  it("27-F22: every digit on the document is a Western digit", () => {
    expect(textOf(draw(SALE).blocks), "an Eastern-Arabic numeral reached the paper").not.toMatch(
      /[٠-٩۰-۹]/,
    );
  });
});

// ── §F — 03-F37's reprint marker ─────────────────────────────────────────────────────────────────

describe("§F 03-F37/02-F16 — the reprint band, mandatory and unsuppressible", () => {
  it("03-F37: a first print carries NO band; a reprint carries one", () => {
    expect(textOf(draw(SALE).blocks)).not.toContain("REPRINT");
    expect(textOf(draw(with_({ reprint: true })).blocks)).toContain("REPRINT");
  });

  it("27-F56/02-F16: the band is the document's ONE inverted banner", () => {
    const parts = partsOf(draw(with_({ reprint: true })).blocks);
    const banners = parts.filter((p) => p.ink === "inverted");
    expect(banners.length, "a reprint receipt spends inversion more than once").toBe(1);
    expect(banners[0]?.scope).toBe("banner");
    expect(banners[0]?.value).toBe("REPRINT");
  });

  it("03-F33/03-F37: the band lives in a LOCKED region and declares no slot an owner could reach", () => {
    const spec = receiptSpec();
    const band = spec.blocks.find((b) => b.block_id.includes("REPRINT"));
    expect(band, "no reprint block on a type 03-F37 makes it mandatory for").toBeDefined();
    expect(band?.region).toBe("HEAD_LOCKED");
    expect(band?.slots).toEqual([]);
  });

  it("02-F16: no profile an owner can write suppresses the band", () => {
    // The fraud vector is the point: "reprints are a classic fraud vector … the paper must say so."
    const spec = receiptSpec();
    const hostile: DocumentProfile = {
      ...shippedDefaults(spec),
      reprint: false,
      REPRINT: "",
      RECEIPT_REPRINT_BAND: "",
      header_note: "",
    };
    expect(
      textOf(okOf(render(spec, hostile, with_({ reprint: true }), WIDE), "hostile").blocks),
    ).toContain("REPRINT");
  });
});

// ── §G — 03-F33/03-F34: regions, and the fiscal block doc 16 will inject ─────────────────────────

describe("§G 03-F33/03-F34/16-F1 — the region ladder, and the block doc 16 injects", () => {
  it("03-F33: every block carries exactly one region, and the blocks run DOWN the ladder", () => {
    const ladder = [
      "HEAD_LOCKED",
      "HEAD_OWNER",
      "BODY",
      "TOTALS",
      "FISCAL_LOCKED",
      "FOOT_OWNER",
      "TAIL_LOCKED",
    ];
    const positions = receiptSpec().blocks.map((block) => ladder.indexOf(block.region));
    expect(positions, "a block carries a region outside 03-F33's ladder").not.toContain(-1);
    expect(
      positions.every((p, i) => i === 0 || p >= (positions[i - 1] as number)),
      `the blocks do not run down the ladder: ${receiptSpec()
        .blocks.map((b) => `${b.block_id}@${b.region}`)
        .join(" ")}`,
    ).toBe(true);
  });

  it("03-F33: the spec declares NO fiscal block — the adapter owns that rung, not the vendor", () => {
    expect(
      receiptSpec().blocks.map((b) => b.region),
      "a `DocumentSpec` authored the regulated block by hand (03-F33)",
    ).not.toContain("FISCAL_LOCKED");
  });

  it("03-F34: no owner slot sits inside a locked region", () => {
    const locked = ["HEAD_LOCKED", "FISCAL_LOCKED", "TAIL_LOCKED"];
    for (const block of receiptSpec().blocks) {
      if (!locked.includes(block.region)) continue;
      expect(block.slots, `${block.block_id} puts an owner slot in a locked region`).toEqual([]);
    }
  });

  it("16-F1/02-F15: with the add-on OFF the receipt renders with no fiscal content at all", () => {
    // "Tax is off by default", and doc 16 ships "on demand". A fiscal field printed before an
    // authority adapter is certified would be a claim the product cannot stand behind.
    const text = textOf(draw(SALE).blocks);
    for (const token of ["FBR", "USIN", "invoice", "Invoice", "tax", "Tax"]) {
      expect(text, `the receipt printed \`${token}\` with no adapter present`).not.toContain(token);
    }
  });

  it("16-F23/03-F33: an adapter's block IS injected, at the position the adapter declared", () => {
    const spec = receiptSpec();
    const totalsBlock = spec.blocks.find((b) => b.region === "TOTALS");
    expect(totalsBlock, "no TOTALS block for an adapter to sit after").toBeDefined();
    const after = (totalsBlock as { block_id: string }).block_id;
    const fiscal: FiscalBlock = {
      block_id: "PRA_EIMS",
      after_block_id: after,
      mandatory_block_ids: ["PRA_EIMS"],
      qr_payload: "PRA-2026-000142",
      min_qr_mm: 1,
    };
    const out = okOf(
      render(spec, shippedDefaults(spec), SALE, WIDE, fiscal),
      "with a fiscal adapter",
    );
    const ids = out.blocks.map((b) => b.block_id);
    expect(ids).toContain("PRA_EIMS");
    expect(
      ids.indexOf("PRA_EIMS"),
      "the regulated block was not placed where the adapter said",
    ).toBe(ids.indexOf(after) + 1);
    expect(out.blocks.find((b) => b.block_id === "PRA_EIMS")?.region).toBe("FISCAL_LOCKED");
  });

  it("03-F34/03-F35: a QR below the adapter's declared minimum REFUSES the whole receipt", () => {
    const spec = receiptSpec();
    const refusal = refusalOf(
      render(spec, shippedDefaults(spec), SALE, WIDE, {
        block_id: "PRA_EIMS",
        after_block_id: spec.blocks[spec.blocks.length - 1]?.block_id ?? null,
        mandatory_block_ids: [],
        qr_payload: "PRA-2026-000142",
        min_qr_mm: 500,
      }),
      "an undersized fiscal QR",
    );
    expect(refusal.reason).toBe("fiscal_qr_too_small");
    expect(refusal.document_type).toBe("receipt");
  });
});

// ── §H — 03-F30 purity ───────────────────────────────────────────────────────────────────────────

describe("§H 03-F30 — the render is pure, which is what makes two devices agree", () => {
  it("03-F30: identical inputs produce byte-identical output, twice over", () => {
    expect(hex(draw(SALE).bytes)).toBe(hex(draw(structuredClone(SALE)).bytes));
  });

  it("03-F30/01-F46: the bytes do not move with the HOST's timezone or locale", () => {
    // A receipt formatted through the reading device's zone is two different documents for one
    // sale, and `01-F46` anchors the business to Asia/Karachi whatever the host thinks.
    const before = process.env.TZ;
    const baseline = hex(draw(SALE).bytes);
    try {
      for (const tz of ["UTC", "America/New_York", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(hex(draw(SALE).bytes), `the document moved under TZ=${tz}`).toBe(baseline);
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  it("03-F30: the render mutates neither its data nor its profile", () => {
    const spec = receiptSpec();
    const data = structuredClone(SALE);
    const profile = shippedDefaults(spec);
    const dataBefore = JSON.stringify(data);
    const profileBefore = JSON.stringify(profile);
    okOf(render(spec, profile, data, WIDE), "purity probe");
    expect(JSON.stringify(data)).toBe(dataBefore);
    expect(JSON.stringify(profile)).toBe(profileBefore);
  });
});

// ── §I — 27-F56's ink budget and 27-F58's grouping ───────────────────────────────────────────────

describe("§I 27-F56/27-F58 — the ink ladder and the whitespace", () => {
  it("27-F56: an ordinary receipt spends NO inverted ink at all", () => {
    expect(partsOf(draw(SALE).blocks).filter((p) => p.ink === "inverted")).toEqual([]);
  });

  it("27-F56/03-F49: the 2× rung is not spent on this type — it would double a column cost", () => {
    // `27-F56` allocates 2×2 to §2b's KITCHEN chit, whose subject `27-F55` states outright. This
    // type's floor is 32 columns and a doubled figure pushes a line past a 58 mm printer for no FR
    // that asks for it — the same reading `cash-documents.ts` already took.
    expect(partsOf(draw(SALE).blocks).filter((p) => p.ink === "size_2x2")).toEqual([]);
  });

  it("27-F58: groups are separated by BLANK LINES, never by a rule", () => {
    const lines = linesOf(draw(SALE).blocks);
    expect(
      lines.some((l) => l.blank),
      "no group separation at all",
    ).toBe(true);
    for (const line of lines) {
      expect(line.text, `a full-width rule reads as a boundary between documents`).not.toMatch(
        /[-=_*]{4,}/,
      );
    }
  });

  it("27-F58: EVERY region change carries a blank line — not merely some of them", () => {
    // ⚠ THE ASSERTION ABOVE PASSED WHILE THE DOCUMENT WAS WRONG, and only looking at the printed
    // page found it: `Total Rs 930` ran straight on from the last item line with no gap, because
    // `RECEIPT_ITEMS` ended in a plain feed while the head and totals blocks ended in a
    // `GROUP_BREAK`. "Some blank line exists" was satisfied by the transitions that were already
    // right. That is the round-3 law's own shape — the guard was built and never pointed at the
    // dangerous case — so this one walks the region boundaries and asks at each.
    const blocks = draw(SALE).blocks;
    const offenders: string[] = [];
    for (let i = 1; i < blocks.length; i += 1) {
      const prev = blocks[i - 1] as (typeof blocks)[number];
      const here = blocks[i] as (typeof blocks)[number];
      if (prev.region === here.region) continue;
      // The tail is a cut, not a group: `27-F58` separates groups of CONTENT.
      if (here.region === "TAIL_LOCKED") continue;
      const upToHere = linesOf(blocks.slice(0, i));
      const last = upToHere[upToHere.length - 1];
      if (last === undefined || !last.blank) {
        offenders.push(`${prev.region} → ${here.region} (before ${here.block_id})`);
      }
    }
    expect(
      offenders,
      "these region changes run straight on with no blank line, so two groups read as one",
    ).toEqual([]);
  });

  it("03-F36: a label and its value are separated by exactly one space", () => {
    for (const line of linesOf(draw(SALE).blocks).filter((l) => !l.blank)) {
      expect(line.text, `space-as-layout in ${JSON.stringify(line.text)}`).not.toMatch(/ {2,}/);
    }
  });
});

// ── §J — ANTI-SCOPE: what 02-F15 names and the product cannot yet supply ─────────────────────────

describe("§J anti-scope — 02-F15's three fields with no data are ABSENT, never invented", () => {
  it("02-F12/commandment 2: NO change line — nothing in the ledger records what was handed over", () => {
    // `02-F12` computes and DISPLAYS change at the counter; `payment.recorded.amount_paisa` is the
    // amount APPLIED to the order, and there is no `tendered_paisa` field anywhere in `01 §4`. A
    // `Change Rs 0` row would be the "logged but uncounted" shape `02-F43` names, moved onto a
    // document a customer keeps. THIS TEST FAILS THE DAY SOMEONE ADDS A PLACEHOLDER.
    const text = textOf(draw(SALE).blocks);
    expect(
      text,
      "a change figure was invented — no event records the cash handed over",
    ).not.toMatch(/change/i);
  });

  it("26 §7/commandment 2: NO discount line — `discount.recorded` has no payload schema at all", () => {
    const text = textOf(draw(SALE).blocks);
    expect(text).not.toMatch(/discount/i);
    expect(text).not.toMatch(/\bvoid/i);
    expect(text).not.toMatch(/\bcomp\b/i);
  });

  it("02-F15: NO modifier is invented — the read models carry none, and a blank one is a lie", () => {
    // `main/gateway.ts` writes `modifiers: []` and says so. A receipt printing "No modifiers" or
    // an empty indented row would assert a fact this device does not hold (`00 §5.7`).
    const lines = linesOf(draw(SALE).blocks).filter((l) => !l.blank);
    expect(lines.some((l) => /modifier/i.test(l.text))).toBe(false);
    expect(
      lines.some((l) => l.text.startsWith("  ")),
      "an indented modifier row was rendered with nothing in it",
    ).toBe(false);
  });
});

// ── DEFERRED, DELIBERATELY (stated so each gap is a decision and not an omission) ────────────────
//
// * **`02-F16`'s `receipt.printed` IS NOT EMITTED and this suite cannot assert it.** The type is in
//   the `01 §4` catalog and `packages/domain/src/registry.ts` carries no payload schema for it, so
//   `01-F4` makes emitting it a runtime error. Adding one is a SACRED-path change (`18 §2`) that
//   also makes the type an `OrderKeyedEventType` in `packages/sync-client/src/folds/merge.ts`,
//   whose `assertNever` exhaustiveness guard then fails to compile until an oracle pins a merge
//   rule for it — measured, not assumed. Both are protected paths and neither is this task's.
// * **`02-F16`'s REPRINT ACT (`C17`).** This file asserts the BAND (`03-F37`), which is the
//   document's half. The act needs `receipt.reprint_requested` (same missing schema), a recall
//   surface (`02-F10`), and `audit.reprint` — and `03-F41`'s duplicate hazard has a receipt
//   analogue that is a fraud vector rather than a wasted chit.
// * **`02-F15`'s LOGO and MENU-LINK QR.** A logo is a raster and `03-F30` makes a slot value a
//   SCALAR, so no profile can carry one. A menu-link QR has no `EncoderPart`: `fiscal_qr` is
//   `03-F35`'s regulated raster and K-2's encoder oracle is an ALLOWLIST, so a second QR part is a
//   finding for that suite's owner.
// * **THE EXTENDED LINE AMOUNT.** See `ReceiptLine.unit_price_paisa`. It is `billedCellPaisa`, fold
//   logic in `packages/sync-client`, and `26 §8` forbids reimplementing it here.
// * **THE PHYSICAL PASS (K-8).** No printer has ever been attached. `27-F35`'s ≥85% comprehension
//   gate on real staff is untouched by every assertion above.
