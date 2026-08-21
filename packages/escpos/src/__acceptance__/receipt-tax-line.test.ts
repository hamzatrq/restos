// ACCEPTANCE TESTS — R39's other half: the receipt SHOWS the tax, as an itemised line, and
// claims nothing about fiscalization while doing it.
//
// **AUTHORED FROM SPEC TEXT ONLY** by a session acting as `24 §3`'s test author, in the same pass
// that authored `packages/domain/src/__acceptance__/tax-posture.test.ts` (the arithmetic half).
// It wrote NO implementation. `packages/escpos` is a **PROTECTED path** (commandment 10) and this
// is **MONEY tier under R35** — full adversarial rounds.
//
// ⚠ **READ-ONLY TO THE IMPLEMENTING SESSION** (`24 §3` step 2, `24-F5`). An assertion you believe
// is wrong is a finding for this test-owning session, cited by FR ID — never an edit.
//
// ── THE RULING AND THE FRs, QUOTED ────────────────────────────────────────────────────────────
//
//   R39     "**CORRECT TOTALS AND AN ITEMISED TAX LINE; NO FISCALIZATION.** Receipts compute and
//           show tax properly; nothing integrates a revenue authority's device or API, and nothing
//           claims certification. Doc 16's fiscalization is post-pilot."
//   16-F1   "Tax is off by default."
//   16-F2   posture is `none | inclusive | exclusive` per channel × payment method.
//   16-F5   "Tax is computed per line at settlement and **snapshotted on the order** (01-F18
//           discipline — never re-derived); integer paisas."
//   02-F15  receipt content: "… lines with variants/modifiers, discount lines, **totals**; payment
//           method(s) and change; fiscal fields when doc 16 is on."
//   03-F33  the region ladder; `FISCAL_LOCKED` blocks are "**not in the `DocumentSpec` at all** —
//           they are injected at render by the certified authority adapter (16-F23), which
//           declares the block **and its position**".
//   03-F34  a violation is "a hard refusal to print plus an S1 band, never a silent degradation";
//           no owner slot sits inside a locked region.
//   03-F36  banned: absolute dot positioning, and space-as-layout.
//   03-F49  `receipt` declares **32** columns and below it is refused, never squeezed.
//   03-F30  `render` is PURE — identical (spec, profile, data, caps) gives byte-identical output.
//   27-F22  Western digits (U+0030–0039) everywhere; never U+0660–0669.
//   27-F23  "`Rs`, symbol-first; Western 3-digit grouping; no decimals … Not `₨`, not `PKR`."
//   27-F24  "The system computes; staff read" — every total arrives as a finished number.
//   27-F58  "Groups are separated by **blank lines, not rules**."
//   00 §5.6 English-only interface; user content is Unicode.
//
// ── THE ONE READING THIS FILE DECLARES, AND THE ALTERNATIVE IT REJECTS (`24 §3b`) ─────────────
//
// **"an itemised tax line" = the tax broken out as ITS OWN LINE in the totals, between a pre-tax
// figure and the amount due.** Three rows, three distinct figures. The named alternative is a
// per-ITEM tax column beside each line — rejected because R39 writes "an itemised tax **line**",
// singular, and because `27-F55`'s "carry LESS information" and `03-F49`'s 32-column floor make a
// fourth money column on a 58 mm roll a layout this corpus refuses elsewhere. **If the founder
// meant the per-item reading, §B is wrong** — a finding for this session, not an edit.
//
// **A tax record is OPTIONAL on `ReceiptData` and ABSENT means no tax content at all.** `16-F1`
// has tax off by default, and the shipped `receipt-document.test.ts` §G already asserts that an
// untaxed receipt prints no `tax`/`Tax` token — that pre-existing green assertion is the guard on
// this one, and §D re-states it so the pair cannot drift apart. The rejected alternative is three
// always-present fields defaulting to zero, which makes "no posture is configured" (print nothing)
// indistinguishable from "a 0 % rate applies" (print a tax line reading Rs 0) — `02-F43`'s
// "logged but uncounted" shape moved onto a document a customer keeps.
//
// ⚠ **THE WORD.** §B asserts the tax row carries `/tax/i`. That is R39's own noun and `00 §5.6`
// makes the interface English, so it is the defensible pin — but a `16-F4` rule pack that supplies
// an authority's own label ("GST", "PST", "Sales Tax") is a real possibility no FR rules on. If
// the implementation needs a pack-supplied label, that is a finding for this test-owning session
// and an FR in doc 16, **not** a licence to weaken this assertion.

import { addPaisa, paisa } from "@restos/domain";
import { describe, expect, it } from "vitest";
import type { DocumentProfile, DocumentSpec, PrinterCapability, ReceiptData } from "../index.js";
import { DOCUMENT_SPECS, MIN_COLUMNS, render } from "../index.js";

// ── the instruments ──────────────────────────────────────────────────────────────────────────────

/** `03 §7`: Font A is a 12-dot cell; `03-F49` expresses every floor in columns. */
const FONT_A_CELL_DOTS = 12;

const capsAt = (cols_font_a: number, model_id: string): PrinterCapability => {
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
  };
};

/** Wide enough that `03-F49`'s floor is never the thing under test. */
const WIDE = capsAt(64, "WIDE-64");
/** `03-F49`'s declared floor for this type, read from the one declaration — §E's whole point. */
const AT_FLOOR = capsAt(MIN_COLUMNS.receipt, "FLOOR-32");

type AnySpec = DocumentSpec<unknown>;
type Part = { kind: string; value?: string; ink?: string; lines?: number };
type Block = { block_id: string; region: string; parts: readonly Part[] };
type Ok = { ok: true; blocks: readonly Block[]; bytes: Uint8Array };

const receiptSpec = (): AnySpec => DOCUMENT_SPECS.receipt as AnySpec;

/** `03-F30`: "a preset with a hole" — every declared slot at its shipped default. */
const shippedDefaults = (spec: AnySpec): DocumentProfile =>
  Object.fromEntries(
    spec.blocks.flatMap((block) => block.slots.map((slot) => [slot.slot_id, slot.default])),
  );

/**
 * The document as LINES with their column cost. Re-declared rather than imported from
 * `receipt-document.test.ts`: a test INSTRUMENT is not an oracle symbol, and importing across
 * suite files would make vitest run that file twice.
 *
 * `ESC d n` is "print and feed n lines", so a feed ends the current line and leaves `n − 1` blank
 * ones behind it, which is how `27-F58`'s blank-line separator becomes observable.
 */
type Line = { text: string; columns: number; blank: boolean };

const linesOf = (blocks: readonly Block[]): Line[] => {
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

const textOf = (blocks: readonly Block[]): string =>
  linesOf(blocks)
    .map((l) => l.text)
    .join("\n");

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The region of the block that printed a given token — `03-F33`'s ladder, asked of real output. */
const regionPrinting = (blocks: readonly Block[], token: string): string | undefined =>
  blocks.find((b) => b.parts.some((p) => (p.value ?? "").includes(token)))?.region;

const draw = (data: unknown, caps: PrinterCapability = WIDE, label = "taxed receipt"): Ok => {
  const spec = receiptSpec();
  const result = render(spec, shippedDefaults(spec), data, caps);
  expect(
    result.ok,
    `${label}: render refused — ${result.ok ? "" : (result as { reason: string }).reason}`,
  ).toBe(true);
  return result as unknown as Ok;
};

// ── the fixtures ─────────────────────────────────────────────────────────────────────────────────

/**
 * `16-F5`'s snapshot as the receipt receives it. **DECLARED INTERPRETATION** — see the header.
 * `posture` and `rate_bps` travel with the figures because a tax amount a customer cannot tie to a
 * rate is a number nobody can check, and because `16-F1`'s "off" and a 0 % rate must stay
 * distinguishable on paper.
 */
type ReceiptTax = {
  readonly posture: "none" | "inclusive" | "exclusive";
  readonly rate_bps: number;
  /** The pre-tax figure: `taxSnapshot`'s `subtotal_paisa`. */
  readonly subtotal_paisa: number;
  /** `taxSnapshot`'s `tax_total_paisa`. */
  readonly tax_total_paisa: number;
};

/**
 * `| undefined` is deliberate and the repo's `exactOptionalPropertyTypes: true` is why it has to
 * be said out loud: under that flag `tax?: ReceiptTax` makes "absent" and "present as `undefined`"
 * two DIFFERENT types, and §D asserts they must be the same DOCUMENT. Widening here leaves the
 * implementer free to declare whichever the production contract wants without this suite pinning
 * one — what it may not do is render them differently.
 */
type TaxedReceiptData = ReceiptData & { readonly tax?: ReceiptTax | undefined };

/**
 * ⚠ **EVERY FIGURE ON THIS RECEIPT IS A WHOLE NUMBER OF RUPEES, AND THAT IS A DELIBERATE CHOICE
 * WITH A COST — recorded here rather than discovered.**
 *
 * `amountToken` renders through `rupeesFromPaisa`, which TRUNCATES (`27-F23`: "no decimals"). On
 * this fixture the three printed figures close exactly — Rs 1,150 + Rs 184 = Rs 1,334 — so the
 * assertions below pin the money tokens without depending on an unresolved question. **They do not
 * always close**, and the DEFERRED block at the foot carries the worked counter-example and names
 * it as OPEN. Asserting closure in general would red a CORRECT implementation, which the round-3
 * law calls "as damaging as a vacuous one".
 *
 * Lines: 2 × Rs 450 and 1 × Rs 250, exclusive @ 16 % (1600 bps).
 *   per-line tax  90,000 → 14,400   ·   25,000 → 4,000
 *   subtotal 115,000 (Rs 1,150) · tax 18,400 (Rs 184) · total 133,400 (Rs 1,334)
 *
 * Seven distinct money tokens — `Rs 450`, `Rs 250`, `Rs 1,150`, `Rs 184`, `Rs 1,334`, `Rs 1,000`,
 * `Rs 334` — so no assertion below can be satisfied by the wrong figure landing in the right place.
 *
 * ⚠ **THE SETTLEMENT IS A `02-F13` SPLIT AND THAT IS LOAD-BEARING, NOT COLOUR.** A single tender
 * covering the bill prints `Cash Rs 1,334`, so the amount-due token would appear TWICE on the
 * document — and §B's "three figures, three lines" would then red a **correct** implementation
 * while §C's `not.toContain` would red it a second time. The round-3 law calls a test that stays
 * red under a correct implementation "as damaging as a vacuous one"; this fixture is what stops
 * that, and the two tenders are deliberately Rs 1,000 + Rs 334, neither equal to any other figure
 * on the paper.
 */
const SUBTOTAL_PAISA = 115_000;
const TAX_PAISA = 18_400;
const TOTAL_PAISA = 133_400;

const SUBTOTAL_TOKEN = "Rs 1,150";
const TAX_TOKEN = "Rs 184";
const TOTAL_TOKEN = "Rs 1,334";

const TAX: ReceiptTax = {
  posture: "exclusive",
  rate_bps: 1_600,
  subtotal_paisa: SUBTOTAL_PAISA,
  tax_total_paisa: TAX_PAISA,
};

const TAXED: TaxedReceiptData = {
  receipt_no: "5f3a9c21",
  channel: "counter",
  branch_created_at: Date.UTC(2026, 7, 9, 9, 30), // 14:30 Asia/Karachi
  cashier: "Ayesha Khan",
  lines: [
    { quantity: 2, name: "Chicken Karahi", unit_price_paisa: 45_000 },
    { quantity: 1, name: "Mutton Pulao", unit_price_paisa: 25_000 },
  ],
  total_paisa: TOTAL_PAISA,
  // `02-F13`: "Split payment across methods in one settlement" — and see the fixture note above
  // for why neither tender may equal the amount due.
  tenders: [
    { method: "cash", amount_paisa: 100_000 }, // Rs 1,000
    { method: "raast", amount_paisa: 33_400 }, // Rs 334
  ],
  reprint: false,
  tax: TAX,
};

/** The same sale with no posture configured — `16-F1`'s default, and §D's subject. */
const UNTAXED: TaxedReceiptData = {
  ...TAXED,
  total_paisa: SUBTOTAL_PAISA,
  // Rs 800 + Rs 350 = Rs 1,150, and neither collides with an item's unit price on the paper.
  tenders: [
    { method: "cash", amount_paisa: 80_000 },
    { method: "raast", amount_paisa: 35_000 },
  ],
  tax: undefined,
};

const with_ = (over: Partial<TaxedReceiptData>): TaxedReceiptData => ({ ...TAXED, ...over });

/** The tax rows as the reader sees them: non-blank lines carrying one of the three figures. */
const moneyLines = (ok: Ok): Line[] =>
  linesOf(ok.blocks).filter((l) =>
    [SUBTOTAL_TOKEN, TAX_TOKEN, TOTAL_TOKEN].some((t) => l.text.includes(t)),
  );

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — the data contract. This is the RED this file is committed in.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A R39/16-F5 — the receipt accepts a tax snapshot and renders it", () => {
  it("a receipt carrying a tax snapshot renders at all", () => {
    // The whole file's anchor. If this fails with a REFUSAL, the type has no tax contract; if it
    // fails in §B onwards, the contract exists and the layout is owed.
    expect(draw(TAXED).blocks.length).toBeGreaterThan(0);
  });

  it("R39: the tax figure appears on the paper", () => {
    expect(
      textOf(draw(TAXED).blocks),
      `the receipt printed no ${TAX_TOKEN} — R39's "show tax properly" is unrendered`,
    ).toContain(TAX_TOKEN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — R39: ITEMISED. Three figures, three lines, in the totals.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B R39 — the tax is its OWN line between a pre-tax figure and the amount due", () => {
  it("all three figures print, and they are three DIFFERENT numbers", () => {
    // MUTANT THIS KILLS: folding the tax into the total and printing one row. That is a receipt
    // whose tax is unverifiable by the person who paid it — precisely what "itemised" refuses.
    const text = textOf(draw(TAXED).blocks);
    expect(text, "no pre-tax figure — the tax cannot be itemised OUT of anything").toContain(
      SUBTOTAL_TOKEN,
    );
    expect(text).toContain(TAX_TOKEN);
    expect(text, "no amount due").toContain(TOTAL_TOKEN);
  });

  it("each figure sits on its own line — 03-F36 bans space-as-layout, not three rows", () => {
    const rows = moneyLines(draw(TAXED));
    expect(rows).toHaveLength(3);
    // And no row carries two of the three figures, which is the same defect wearing a layout.
    for (const row of rows) {
      const carried = [SUBTOTAL_TOKEN, TAX_TOKEN, TOTAL_TOKEN].filter((t) => row.text.includes(t));
      expect(carried, `two figures share one line: "${row.text}"`).toHaveLength(1);
    }
  });

  it("the tax row carries a LABEL beside its figure (03-F36's `label value` shape)", () => {
    const row = moneyLines(draw(TAXED)).find((l) => l.text.includes(TAX_TOKEN));
    expect(
      row?.text.replace(TAX_TOKEN, "").trim().length,
      "the tax figure has no label",
    ).toBeGreaterThan(0);
  });

  it("and the label is R39's own noun — see the header before changing this", () => {
    const row = moneyLines(draw(TAXED)).find((l) => l.text.includes(TAX_TOKEN));
    expect(row?.text, "the tax row does not say what it is").toMatch(/tax/i);
  });

  it("03-F33: the tax figure prints in TOTALS — not in a locked fiscal or an OWNER region", () => {
    // Two mutants, one assertion. `FISCAL_LOCKED` would make an ordinary tax line into regulated
    // content R39 forbids (see §F). `HEAD_OWNER`/`FOOT_OWNER` are the only regions an owner may
    // reach (`03-F34`), so a tax figure there is a tax figure an owner can edit or suppress —
    // which `16 §7` puts under "deliberately not configurable, ever".
    expect(regionPrinting(draw(TAXED).blocks, TAX_TOKEN)).toBe("TOTALS");
  });

  it("the three figures print in reading order: pre-tax, then tax, then the amount due", () => {
    // Arithmetic legibility, which is what "itemised" buys: a tax printed BELOW the amount it is
    // already inside cannot be checked by the person holding the paper. MUTANT THIS KILLS: the tax
    // row appended after the total, which is the natural place to add a block and the wrong one.
    const all = linesOf(draw(TAXED).blocks);
    const at = (token: string): number => all.findIndex((l) => l.text.includes(token));
    expect(at(SUBTOTAL_TOKEN), "the pre-tax figure was not found as a line").toBeGreaterThanOrEqual(
      0,
    );
    expect(
      at(TAX_TOKEN),
      "the tax must print BELOW the base it is itemised out of",
    ).toBeGreaterThan(at(SUBTOTAL_TOKEN));
    expect(at(TOTAL_TOKEN), "the amount due must print BELOW the tax it includes").toBeGreaterThan(
      at(TAX_TOKEN),
    );
  });

  it("27-F58: no blank line separates the pre-tax figure from the tax itemised out of it", () => {
    // ⚠ SCOPED DELIBERATELY, AND THE SCOPE IS THE POINT. `27-F58` says groups are separated by
    // blank lines and does NOT say what a group is, so "the three totals rows are one group" is a
    // reading this suite has no authority for — a designer may legitimately set the amount due
    // apart. What is not a reading is that the base and the tax taken out of it belong together;
    // a blank line between those two makes the tax read as a charge from somewhere else.
    const all = linesOf(draw(TAXED).blocks);
    const from = all.findIndex((l) => l.text.includes(SUBTOTAL_TOKEN));
    const to = all.findIndex((l) => l.text.includes(TAX_TOKEN));
    // ⚠ ANCHORED. Without these two lines both indices are −1 when nothing renders, `slice(-1, 0)`
    // is empty, and the assertion below passes for free — measured, not guessed: this test was
    // GREEN against a renderer that prints no tax line at all before the anchor was added.
    expect(from, "no pre-tax figure on the paper — the span below is empty").toBeGreaterThanOrEqual(
      0,
    );
    expect(to, "no tax figure on the paper — the span below is empty").toBeGreaterThan(from);
    expect(
      all.slice(from, to + 1).some((l) => l.blank),
      "a blank line splits the base from its own tax",
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 16-F5 / 27-F24: the money is the SNAPSHOT's. This layer computes NOTHING.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 16-F5/01-F18 — every printed figure is a supplied field, never a re-derivation", () => {
  it("the fixture is coherent: subtotal + tax = total, in paisa", () => {
    // The premise the rest of §C rests on, asserted rather than assumed — and asserted through
    // the `DEC-MONEY-005` door, because this suite obeys the law it is testing.
    expect(addPaisa(paisa(SUBTOTAL_PAISA), paisa(TAX_PAISA))).toBe(TOTAL_PAISA);
  });

  it("⚠ THE MONEY MUTANT — an INCOHERENT total prints as supplied, not as the sum", () => {
    // `packages/escpos/CLAUDE.md`'s M4 one layer over: "the total is summed from the lines, not
    // read off the fold". Here the danger is the renderer helpfully computing `subtotal + tax`.
    // 999,999 paisa prints `Rs 9,999`; the sum would print `Rs 1,334`. A renderer that agrees with
    // its inputs on coherent data and silently corrects them on incoherent data is a renderer that
    // hides a real defect upstream — and `27-F24` puts the arithmetic upstream by name.
    const text = textOf(draw(with_({ total_paisa: 999_999 }), WIDE, "incoherent total").blocks);
    expect(text, "the renderer recomputed the total from subtotal + tax").toContain("Rs 9,999");
    // The split tenders (Rs 1,000 + Rs 334) are what make this negative assertion mean something:
    // with a single tender covering the bill, `Rs 1,334` would still be on the paper as the
    // tender row and this line would red a correct implementation.
    expect(text).not.toContain(TOTAL_TOKEN);
  });

  it("the tax token moves when — and only when — `tax_total_paisa` moves", () => {
    // Functional dependence, which is what proves the figure is READ rather than hardcoded or
    // derived from the rate. Rs 184 → Rs 92 at half the tax; unchanged when an unrelated field
    // moves. MUTANT THIS KILLS: printing `applyRateBps(subtotal, rate_bps)` here instead of the
    // snapshot's own number, which would silently re-derive `16-F5`'s per-line answer as a
    // per-total one and disagree with the ledger by a rounding step.
    const halved = textOf(
      draw(with_({ tax: { ...TAX, tax_total_paisa: 9_200 } }), WIDE, "half tax").blocks,
    );
    expect(halved).toContain("Rs 92");
    expect(halved).not.toContain(TAX_TOKEN);

    const other = draw(with_({ cashier: "Hina Baig" }), WIDE, "another cashier");
    expect(moneyLines(other).map((l) => l.text)).toEqual(
      moneyLines(draw(TAXED)).map((l) => l.text),
    );
  });

  it("the pre-tax token moves when `subtotal_paisa` moves", () => {
    // ⚠ Rs 770, not Rs 1,000 — MEASURED, NOT GUESSED. This assertion first read
    // `subtotal_paisa: 100_000` / `toContain("Rs 1,000")` and was **GREEN against a renderer with
    // no tax line at all**, because `Rs 1,000` was already on the paper as the cash TENDER. That
    // is failure pattern 1 — a fixture answering its own question — reproduced inside the suite
    // written to catch it. Rs 770 collides with nothing this document prints.
    const text = textOf(
      draw(with_({ tax: { ...TAX, subtotal_paisa: 77_000 } }), WIDE, "moved subtotal").blocks,
    );
    expect(text).toContain("Rs 770");
    expect(text).not.toContain(SUBTOTAL_TOKEN);
  });

  it("03-F30: the render stays pure with a tax snapshot on it", () => {
    expect(hex(draw(TAXED).bytes)).toBe(hex(draw(structuredClone(TAXED)).bytes));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 16-F1: OFF BY DEFAULT, on paper.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 16-F1 — no posture means no tax content, and `none` means the same", () => {
  it("an untaxed receipt prints no tax row and no tax figure", () => {
    // ⚠ THE PAIRED GUARD. `receipt-document.test.ts` §G already asserts that an untaxed receipt
    // contains no `tax`/`Tax` token; this states the other half on THIS fixture so the two cannot
    // drift apart. An implementation that always renders a totals tax row reds BOTH files — which
    // is the point, because a `Tax Rs 0` line on a restaurant with no posture configured is a
    // claim about a tax regime the org is not in.
    const text = textOf(draw(UNTAXED, WIDE, "untaxed").blocks);
    expect(text).not.toMatch(/tax/i);
    expect(text).not.toContain(TAX_TOKEN);
    expect(text, "the untaxed receipt must still print its own total").toContain(SUBTOTAL_TOKEN);
  });

  it("posture `none` prints no tax row either — 'off' is not 'zero-rated'", () => {
    // A snapshot may legitimately arrive with `posture: "none"` (the domain oracle asserts the
    // posture is echoed so this layer can tell). It must print nothing: `16-F1` is "tax is OFF",
    // and `02-F43`'s "logged but uncounted" shape on a customer's document is the failure.
    const text = textOf(
      draw(
        with_({
          total_paisa: SUBTOTAL_PAISA,
          tax: { posture: "none", rate_bps: 0, subtotal_paisa: SUBTOTAL_PAISA, tax_total_paisa: 0 },
        }),
        WIDE,
        "posture none",
      ).blocks,
    );
    expect(text).not.toMatch(/tax/i);
  });

  it("the untaxed document is BYTE-IDENTICAL to one with no tax key at all", () => {
    // The regression control for the 95 receipt assertions that already ship. Adding an optional
    // field must not move one byte of the document nobody configured tax on.
    const { tax: _dropped, ...withoutKey } = UNTAXED;
    expect(hex(draw(UNTAXED, WIDE, "tax: undefined").bytes)).toBe(
      hex(draw(withoutKey, WIDE, "no tax key").bytes),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 03-F49: the rows must FIT the floor this type declares.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 03-F49 — three totals rows at 32 columns, the floor `receipt` declares", () => {
  it("a taxed receipt renders at MIN_COLUMNS.receipt without refusing", () => {
    // Read from the one declaration, never a second copy of `32`.
    expect(draw(TAXED, AT_FLOOR, "at the floor").blocks.length).toBeGreaterThan(0);
  });

  it("no line on a taxed receipt exceeds the floor's columns", () => {
    // ⚠ THIS IS THE ASSERTION A VERBOSE LABEL BREAKS, and it is why the tax row's wording is a
    // layout decision rather than a copy decision. "Sales tax (PRA 16 % on eligible items)" plus
    // `Rs 184` is 45 columns on a 32-column roll; `03-F49` refuses, never squeezes.
    const over = linesOf(draw(TAXED, AT_FLOOR, "at the floor").blocks).filter(
      (l) => l.columns > MIN_COLUMNS.receipt,
    );
    expect(over.map((l) => `${l.columns}: ${l.text}`)).toEqual([]);
  });

  it("and the three figures are all still there at the floor — nothing was dropped to fit", () => {
    // `03-F49` permits a price COLUMN to degrade on this type; it does not permit a figure to
    // vanish. A silently dropped tax line at 58 mm is the "silent degradation" `03-F34` bans.
    const text = textOf(draw(TAXED, AT_FLOOR, "at the floor").blocks);
    for (const token of [SUBTOTAL_TOKEN, TAX_TOKEN, TOTAL_TOKEN]) {
      expect(text, `${token} disappeared at the 32-column floor`).toContain(token);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — R39's OTHER half: NO FISCALIZATION. The anti-scope assertions.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F R39 — showing tax is not claiming certification", () => {
  it("03-F33: the spec still declares NO fiscal block, taxed or not", () => {
    // A tax line is `TOTALS` content. If adding one put a `FISCAL_LOCKED` block in the shipped
    // spec, the vendor would have authored a regulated block by hand — which `03-F33` forbids and
    // `SpecRegion` exists to make unrepresentable — and R39 explicitly defers all of it.
    expect(receiptSpec().blocks.map((b) => b.region)).not.toContain("FISCAL_LOCKED");
  });

  it("a taxed receipt prints no invoice number, no USIN and no authority name", () => {
    // MUTANT THIS KILLS: an implementer reading "tax line" as "start doc 16" and printing a
    // placeholder invoice number or a pending marker. `16-F10`'s marker belongs to the add-on;
    // printing one with no adapter certified is a claim the product cannot stand behind, and
    // `16 §1`'s legal red line is the reason this is an assertion and not a style note.
    const text = textOf(draw(TAXED).blocks);
    for (const token of ["FBR", "PRA", "SRB", "KPRA", "USIN", "Invoice", "invoice", "pending"]) {
      expect(
        text,
        `the receipt printed \`${token}\` with no certified adapter (R39)`,
      ).not.toContain(token);
    }
  });

  it("and no QR is rasterised onto a taxed receipt", () => {
    // `03-F35`'s QR is the fiscal one. Without an adapter there is nothing to encode, and a QR
    // that decodes to a tax figure would be read by a customer as an authority's verification.
    expect(
      draw(TAXED)
        .blocks.flatMap((b) => b.parts)
        .map((p) => p.kind),
    ).not.toContain("qr");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — 27-F22 / 27-F23: the money on the paper.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 27-F22/27-F23 — Rs, symbol-first, Western digits, Western grouping", () => {
  it("the three figures render exactly as the shipped money token does", () => {
    // Pinned only on this WHOLE-RUPEE fixture, where truncation cannot bite — see the DEFERRED
    // block for the case where it does, which this suite deliberately leaves open.
    const rows = moneyLines(draw(TAXED)).map((l) => l.text);
    expect(rows.some((r) => r.includes(SUBTOTAL_TOKEN))).toBe(true);
    expect(rows.some((r) => r.includes(TAX_TOKEN))).toBe(true);
    expect(rows.some((r) => r.includes(TOTAL_TOKEN))).toBe(true);
  });

  it("27-F23: never `₨`, never `PKR`, and the grouping is Western 3-digit", () => {
    const text = textOf(draw(TAXED).blocks);
    expect(text).not.toContain("₨");
    expect(text).not.toContain("PKR");
    // `1,150` and not `1150`, and not the lakh grouping CLDR does NOT give en-PK.
    expect(text).toContain("1,150");
    expect(text).not.toContain("1150");
  });

  it("27-F22: no Arabic-Indic digits reach the paper", () => {
    expect(textOf(draw(TAXED).blocks)).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("27-F23: the tax figure carries no decimal point", () => {
    const row = moneyLines(draw(TAXED)).find((l) => l.text.includes(TAX_TOKEN));
    expect(row?.text, "a sub-rupee tax reached the paper — see the DEFERRED block").not.toMatch(
      /\d\.\d/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DEFERRED — what this suite could NOT assert, and who owns each
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
//  1. ⚠ **THE PRINTED FIGURES DO NOT ALWAYS ADD UP, AND NO FR RESOLVES IT. THIS IS THE SHARPEST
//     OPEN QUESTION IN R39's SCOPE.** `amountToken` truncates to whole rupees (`27-F23`: "no
//     decimals"), and an `inclusive` posture produces a sub-rupee pre-tax figure by construction.
//     Worked: three Rs 45 lines, inclusive @ 16 % → net 11,637 · tax 1,863 · gross 13,500 paisa.
//     Printed, that is **Rs 116 + Rs 18 = Rs 134** against a total of **Rs 135** — a receipt that
//     is wrong by a rupee to anyone who checks it, which is exactly what R39's "properly" is
//     about. Two honest resolutions, both needing a decision this suite has no authority to make:
//     print sub-rupee on the tax rows (`27-F23` is scoped to operational SCREENS, and `money.ts`
//     records that "no FR in doc 16 requires a sub-rupee DISPLAY value"), or round the printed
//     rows so they close (which makes the paper disagree with the ledger). §G pins the tokens ONLY
//     on a whole-rupee fixture for this reason: asserting closure in general would red a correct
//     implementation. **Owner: a founder ruling + an FR in doc 16 or doc 27.**
//  2. **THE RATE IS NOT ASSERTED ONTO THE PAPER.** `ReceiptTax` carries `rate_bps` and no FR says
//     a receipt must print it. §B asserts a label and not "16 %", so an implementation printing
//     `Tax Rs 184` satisfies this suite. Whether a customer can check a tax without seeing its
//     rate is a real question and it is doc 02's or doc 16's, not this file's.
//  3. **THE PER-ITEM READING IS UNTESTED.** See the header: if "itemised" means a tax column per
//     line, §B is aimed at the wrong shape. Nothing here would catch that; only a founder can say.
//  4. **THE SEAM IS NOT ASSERTED AND THAT IS A REAL GAP.** This file proves the receipt renders a
//     tax line correctly and proves NOTHING about whether this product ever supplies one.
//     `apps/pos-electron/src/main/printing.ts:1789` composes `ReceiptData` today and would compose
//     `tax: undefined` for ever with every assertion in this file green — the wave's named defect,
//     fifteen instances. **The mutant a seam test must kill: `createReceiptPrinter` composing the
//     receipt with no `tax` key while a posture is configured.** It is not written here because the
//     data path does not exist to assert against: the per-line billed amount has no export
//     (`billedCellPaisa` is private to `packages/sync-client/src/folds/merge.ts:298`) and whether
//     `01-F30`'s billed total includes tax is an open founder decision. **Owner: whoever lands the
//     tax projection; `apps/pos-electron/src/main/__acceptance__/` is where it goes.**
//  5. **NOT EVIDENCE FOR ANY PHYSICAL PRINTER.** K-8 is owed in full; no printer has ever received
//     a byte from this code. Every assertion above is over a rendered block list and emitted
//     bytes, and `27-F35`'s ≥85 % comprehension gate on real staff is untouched — no test name
//     here may be read as "a customer understood the tax line".
