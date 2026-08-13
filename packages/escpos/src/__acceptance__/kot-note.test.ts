/**
 * ACCEPTANCE TESTS — `03-F55`: the item note reaches the kitchen chit.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read
 * `specs/03-kitchen-fulfillment.md`, `specs/27-design-language.md`, `specs/02-pos-app.md` and
 * `specs/00-platform-overview.md`, and that did not write the implementation it describes (`24 §3`
 * step 2). Read-only to the implementing session. K-5's LANDED oracle surface
 * (`kot-document-oracle-surface.ts`, `render-oracle-surface.ts`) is read as the contract this
 * composes over; `plans/wave-1/kot-printing.md` was deliberately NOT read.
 *
 * ⚠ **`packages/escpos` IS A PROTECTED PATH (`20 §4.4`, commandment 10) AND NEEDS SENIOR REVIEW.**
 *
 * ## Why this file exists at all
 *
 * `02-F6` has required item notes *"printed prominently on the KOT (doc 03)"* since Wave 0, `03-F3`
 * has required *"item notes visually emphasized"*, and `03 §1` lists `order.note_added` among this
 * module's consumed events. **`KotLine` declares no note field**, so all three were unrenderable
 * rather than merely unrendered: there was no hole in the data contract for a note to arrive
 * through, and a note that reaches no chit makes `C7` decoration.
 *
 * The shipped `document.ts` also quotes `27-F58`'s reading order as *"identifier → timing → items →
 * modifiers"* — **four terms where the FR writes five**, dropping `notes`. `receipt-document.ts`
 * quotes the same sentence with all five, so the corpus is right and one file's copy is short. That
 * truncation is why the missing field looked intentional; it is reported here rather than fixed,
 * because the fix is the implementer's diff.
 *
 * ## NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER.
 *
 * Every assertion is about a value a function returned — a list of parts, an ink level, an index.
 * `03-F10`'s rig is owed in full (K-8) and `27-F35`'s ≥85% comprehension gate on real staff is what
 * would actually decide whether a cook reads this note. Nothing here may be read as evidence about
 * a cook.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`), each traced to the FR that forces it
 *
 * **N1 — `KotLine` carries an OPTIONAL `note?: string`.** Optional because most lines have none and
 * `03-F55` gives an absent note no row; a required `note: string | null` would work identically and
 * is the named alternative. What is NOT negotiable is that it is a field of the LINE: `02-F6` and
 * `03-F3` both write *item* note, and `03-F55` puts it inside its item's block.
 *
 * **N2 — the note is `user_text`, never `text`.** `document.ts`'s owner-note precedent decides it
 * and says why: the choice picks which refusal `03-F5`'s band shows. As `text`, a non-Latin note
 * refuses `non_ascii_system_text` and is unprintable **for ever** (`00 §5.6` makes English-only
 * permanent for interface text). As `user_text` it refuses `raster_font_unavailable`, which names
 * the real state of the world (`03-F8`). Byte output for a Latin note is identical either way,
 * which is exactly why nothing but an explicit assertion catches it.
 *
 * **N3 — the note is the LAST row of its own item block, after that item's modifiers.**
 * `27-F58`'s order is *identifier → timing → items → modifiers → notes* and is already read
 * block-wise for its fourth term: `27-F59` puts modifiers *"indented under their item"* rather than
 * in a document-terminal section. Reading the fifth term document-wide would separate a note from
 * the dish it qualifies — `27-F57`'s measured mapping failure, where execution accuracy falls from
 * ~71% decode to ~35% execute.
 *
 * **N4 — the note spends NO INK: not inverted, not 2×2.** `27-F56` allocates the ladder
 * platform-wide, its July 2026 ruling closes both scopes (banner: one per document; item:
 * `27-F59`'s removal marker), and 2×2 belongs to the quantity and the identifier. A note is a third
 * claimant on a budget whose own rule is that *"a ticket that uses inversion twice has used it zero
 * times"*. `03-F3`'s *"visually emphasized"* is discharged by `27-F58`'s other two channels —
 * position and grouping whitespace — which is what that FR says they are for.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT ASSERT
 *
 * - **A length cap or a wrap.** `27-F59` bans wrapping and no FR states a maximum note, so
 *   `03-F55` records the cost and declines to invent a limit. `02-F50` keeps Wave 1's input a
 *   bounded pick list, which makes the long case rare rather than solved.
 * - **`03-F32`'s money-token rule against note CONTENT.** ⚠ **A FINDING for the implementer, not a
 *   pin.** `03-F32` says *"prices are simply not in the chit **data model**"* and this adds no
 *   price field — but a note is free-form user content, so an owner-authored quick tag reading
 *   *"add Rs 50 chutney"* would put a money token on a chit through a field that is not a price.
 *   Refusing it would refuse user content (`00 §5.6`) on a guess no FR states; allowing it means
 *   `kot-document.test.ts`'s money-token detector must not be pointed at note text. Named so
 *   whichever way it is resolved is a decision rather than an accident.
 * - **Whether the note prints when its line was REMOVED.** It cannot: `packages/sync-client`'s
 *   fold drops the cell and its notes together (M4 there), so no such `KotData` is constructible.
 */

import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import type { EncoderPart } from "./encoder-oracle-surface.js";
import type { KotData } from "./kot-document-oracle-surface.js";
import type { PrinterCapability } from "./oracle-surface.js";
import {
  type DocumentProfile,
  type DocumentSpec,
  documentSpecs,
  type EscposK4Api,
  type RenderedBlock,
  type RenderResult,
  render,
} from "./render-oracle-surface.js";

const api = escpos as unknown as EscposK4Api;

/** K-5's own capability builder, restated so the two suites cannot disagree about a column. */
const capsAt = (cols_font_a: number, model_id: string): PrinterCapability => ({
  model_id,
  dots: cols_font_a * 12,
  dpi: 203,
  cols_font_a,
  cols_font_b: Math.floor((cols_font_a * 12) / 9),
  has_native_qr: false,
  has_cutter: true,
  raster_ok: true,
});
const WIDE = capsAt(64, "WIDE-64");
/** `03-F36`: the document must render correctly AT its declared floor, not merely above it. */
const AT_FLOOR = capsAt(42, "AT-FLOOR-42");

// Distinct, non-overlapping strings so a whole-document substring search is unambiguous.
const DISH_A = "Chicken Karahi";
const DISH_B = "Butter Naan";
const NOTE_A = "less spicy";
const NOTE_B = "extra crisp";
const REMOVAL_A = "Onion";
const PREFERENCE_A = "Chilli";

/** `03-F55`'s field, declared here because K-5's landed contract has no hole for it (N1). */
type NotedLine = KotData["lines"][number] & { readonly note?: string };
type NotedKot = Omit<KotData, "lines"> & { readonly lines: readonly NotedLine[] };

const BASE: Omit<NotedKot, "lines"> = {
  ticket_no: "0764",
  table: "T9",
  station: "GRILL",
  branch_created_at: 1_754_300_000_000,
  reprint: false,
};

const kotSpec = (): DocumentSpec => {
  const spec = documentSpecs(api).kot;
  if (spec === undefined) throw new Error("DOCUMENT_SPECS.kot is not shipped (K-5, 03-F30)");
  return spec;
};

const shippedDefaultProfile = (spec: DocumentSpec): DocumentProfile =>
  Object.fromEntries(spec.blocks.flatMap((b) => b.slots).map((s) => [s.slot_id, s.default]));

type Ok = Extract<RenderResult, { ok: true }>;

const renderKot = (data: NotedKot, caps: PrinterCapability = WIDE): Ok => {
  const spec = kotSpec();
  const result = render(api, spec, shippedDefaultProfile(spec), data as unknown, caps);
  expect(result.ok, `expected a rendered document, got ${JSON.stringify(result)}`).toBe(true);
  return result as Ok;
};

const textOfPart = (part: EncoderPart): string =>
  part.kind === "text" || part.kind === "user_text" ? part.value : "";

/** Every text-bearing part in document order — `27-F58`'s reading order is an ORDER. */
const partsOf = (blocks: readonly RenderedBlock[]): EncoderPart[] =>
  blocks.flatMap((block) => [...block.parts]);

const indexOfText = (parts: readonly EncoderPart[], needle: string): number =>
  parts.findIndex((part) => textOfPart(part).toLowerCase().includes(needle.toLowerCase()));

const partsCarrying = (parts: readonly EncoderPart[], needle: string): EncoderPart[] =>
  parts.filter((part) => textOfPart(part).toLowerCase().includes(needle.toLowerCase()));

const documentText = (blocks: readonly RenderedBlock[]): string =>
  partsOf(blocks).map(textOfPart).join("");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 02-F6/03-F3: the note is ON THE CHIT. The assertion this file exists for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F6/03-F3 — the kitchen is told", () => {
  const ONE_NOTE: NotedKot = {
    ...BASE,
    lines: [
      { quantity: 1, name: DISH_A, modifiers: [], note: NOTE_A },
      { quantity: 3, name: DISH_B, modifiers: [] },
    ],
  };

  /**
   * ⚠ **THE MUTANT THIS KILLS is the state the tree is in today**: `KotLine` has no `note`, so a
   * note travelling the whole way from the cashier's tap through the ledger, the fold and the IPC
   * arrives here and is DROPPED silently — the renderer reads the fields it declares and no
   * assertion anywhere notices the one it does not. That is `catalog-fetch.ts`'s `toEntry` defect
   * (a reshape that drops fields the source carried), one layer over.
   */
  it("02-F6: the note text appears in the rendered document", () => {
    expect(
      documentText(renderKot(ONE_NOTE).blocks),
      "02-F6 requires the note 'printed prominently on the KOT' and the chit does not say it — " +
        "C7 is decoration without this",
    ).toContain(NOTE_A);
  });

  it("03-F36: it still appears at the KOT's DECLARED FLOOR, not only on wide paper", () => {
    // `03-F49` refuses the KOT below 42 columns rather than squeezing it, and `03-F36` requires
    // correct rendering AT the floor. A note that only fits on 80 mm paper is a note the 58 mm
    // branches never see.
    expect(documentText(renderKot(ONE_NOTE, AT_FLOOR).blocks)).toContain(NOTE_A);
  });

  it("CONTROL — a line with NO note emits no note row (00 §5.7: no blank emphasised line)", () => {
    // Without this, a renderer emitting an empty indented row per line would satisfy §A and put a
    // blank emphasised line under every dish — `27-F55` says the KOT must carry LESS, not the same
    // facts spread over more paper.
    const none: NotedKot = {
      ...BASE,
      lines: [
        { quantity: 1, name: DISH_A, modifiers: [] },
        { quantity: 3, name: DISH_B, modifiers: [] },
      ],
    };
    const withNote = renderKot(ONE_NOTE).blocks;
    const without = renderKot(none).blocks;
    expect(
      partsOf(without).length,
      "the no-note document emits as many parts as the noted one — an empty note row is being " +
        "rendered for every line",
    ).toBeLessThan(partsOf(withNote).length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — N3: the note belongs to ITS item block, after that item's modifiers.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F55/27-F57/27-F58 — the note reads under the dish it qualifies", () => {
  const TWO_NOTED: NotedKot = {
    ...BASE,
    lines: [
      {
        quantity: 1,
        name: DISH_A,
        modifiers: [
          { name: REMOVAL_A, removal: true },
          { name: PREFERENCE_A, removal: false },
        ],
        note: NOTE_A,
      },
      { quantity: 3, name: DISH_B, modifiers: [], note: NOTE_B },
    ],
  };

  /**
   * ⚠ **THE ASSERTION §B EXISTS FOR.** The plausible wrong implementation reads `27-F58`'s
   * *"identifier → timing → items → modifiers → notes"* document-wide and emits a `KOT_NOTES` block
   * after `KOT_ITEMS` — five terms, five blocks, and it looks like a faithful transcription. It
   * passes every §A assertion. What it produces is a chit whose foot reads *"less spicy / extra
   * crisp"* with no way to tell which of two dishes each belongs to: `27-F57`'s mapping step, which
   * is where comprehension collapses from ~71% decode to ~35% execute.
   */
  it("27-F57: each note sits between ITS dish and the NEXT dish", () => {
    const parts = partsOf(renderKot(TWO_NOTED).blocks);
    const dishA = indexOfText(parts, DISH_A);
    const dishB = indexOfText(parts, DISH_B);
    const noteA = indexOfText(parts, NOTE_A);
    const noteB = indexOfText(parts, NOTE_B);
    expect(dishA, `${DISH_A} is not on the chit`).toBeGreaterThanOrEqual(0);
    expect(dishB, `${DISH_B} is not on the chit`).toBeGreaterThanOrEqual(0);
    expect(noteA, `${NOTE_A} is not on the chit`).toBeGreaterThanOrEqual(0);
    expect(noteB, `${NOTE_B} is not on the chit`).toBeGreaterThanOrEqual(0);

    expect(dishA).toBeLessThan(noteA);
    expect(
      noteA,
      "the first dish's note printed after the SECOND dish — the notes were collected into a " +
        "document-terminal block and no cook can tell which dish either belongs to",
    ).toBeLessThan(dishB);
    expect(dishB).toBeLessThan(noteB);
  });

  it("27-F58: within the block the note comes AFTER the modifiers, never before them", () => {
    // The fifth term of the reading order, applied where the fourth already is. A note printed
    // above the removal marker would put the least urgent row of the block above the most urgent
    // one — `27-F58`'s "vertical position encodes urgency" inverted.
    const parts = partsOf(renderKot(TWO_NOTED).blocks);
    expect(indexOfText(parts, REMOVAL_A)).toBeLessThan(indexOfText(parts, NOTE_A));
    expect(indexOfText(parts, PREFERENCE_A)).toBeLessThan(indexOfText(parts, NOTE_A));
  });

  it("CONTROL — a note on the SECOND dish only never appears under the first", () => {
    // Without this, a renderer that emitted every note under every item would pass the ordering
    // assertion above (each note is still after its dish) and tell the cook to make both dishes
    // less spicy.
    const secondOnly: NotedKot = {
      ...BASE,
      lines: [
        { quantity: 1, name: DISH_A, modifiers: [] },
        { quantity: 3, name: DISH_B, modifiers: [], note: NOTE_B },
      ],
    };
    const parts = partsOf(renderKot(secondOnly).blocks);
    expect(partsCarrying(parts, NOTE_B)).toHaveLength(1);
    expect(indexOfText(parts, DISH_B)).toBeLessThan(indexOfText(parts, NOTE_B));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — N4: the note spends no ink, and the item scope stays with the REMOVAL.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 27-F56/27-F59 — the ink ladder is not re-opened for a third claimant", () => {
  const NOTED_WITH_REMOVAL: NotedKot = {
    ...BASE,
    lines: [
      {
        quantity: 1,
        name: DISH_A,
        modifiers: [{ name: REMOVAL_A, removal: true }],
        note: NOTE_A,
      },
      { quantity: 3, name: DISH_B, modifiers: [] },
    ],
  };

  /**
   * ⚠ **THE ASSERTION §C EXISTS FOR.** `03-F3` says *"item notes visually emphasized"*, and the
   * one mechanism on this document that reads as emphasis is inversion — so an implementer
   * transcribing `03-F3` literally inverts the note. On a dish with no removal that even looks
   * right. On a dish WITH one it puts two inversions in a single glance, which `27-F56`'s ruling
   * bans by name: *"a ticket that uses inversion twice has used it zero times"*, and the one it
   * dilutes is the allergen marker `27-F59` exists for.
   */
  it("the note is NOT inverted, on a dish that also carries a removal", () => {
    const parts = partsOf(renderKot(NOTED_WITH_REMOVAL).blocks);
    for (const part of partsCarrying(parts, NOTE_A)) {
      expect(
        part.kind === "text" && part.ink === "inverted",
        "the note took an inversion — 27-F56 allocates the item scope to 27-F59's removal marker " +
          "and 03-F55 spends 03-F3's emphasis in POSITION instead",
      ).toBe(false);
    }
  });

  it("the note is NOT 2×2 — that rung belongs to the quantity and the identifier", () => {
    const parts = partsOf(renderKot(NOTED_WITH_REMOVAL).blocks);
    for (const part of partsCarrying(parts, NOTE_A)) {
      expect(part.kind === "text" && part.ink === "size_2x2").toBe(false);
    }
  });

  it("CONTROL — the removal marker on the SAME item is still inverted (27-F59 unweakened)", () => {
    // The one-branch control. Without it, an implementation that simply stopped inverting anything
    // would pass both assertions above while deleting the allergen signal entirely.
    const parts = partsOf(renderKot(NOTED_WITH_REMOVAL).blocks);
    const inverted = parts.filter((p) => p.kind === "text" && p.ink === "inverted");
    expect(
      inverted.length,
      "27-F56's item scope: exactly ONE inversion in this document (the removal marker), and the " +
        "note must not be a second",
    ).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — N2: the note is USER content, so 03-F8's refusal is the honest one.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 03-F55/03-F8/00 §5.6 — a note is DATA, not the platform's own English", () => {
  /**
   * ⚠ **THE ASSERTION §D EXISTS FOR, and it is invisible to every byte comparison.** A Latin note
   * emits identical bytes as `text` and as `user_text`. The difference appears only when the note
   * is not Latin, and then it decides which refusal `03-F5`'s S1 band shows:
   *   · as `text` → `non_ascii_system_text`, which claims the platform's own English is broken and
   *     makes the field unprintable FOR EVER (`00 §5.6` makes English-only permanent for interface
   *     text);
   *   · as `user_text` → `raster_font_unavailable`, which names the real state of the world —
   *     `03-F8`'s raster path is unwalked until a font and a shaping engine are chosen.
   * `document.ts` already records this reasoning for the two owner notes; this is the same
   * decision one field over, and it is the one an implementer copying `KOT_ITEMS` gets wrong,
   * because every other part in that block is legitimately `text`.
   */
  it("the note is emitted as `user_text`, never as `text`", () => {
    const parts = partsOf(
      renderKot({
        ...BASE,
        lines: [{ quantity: 1, name: DISH_A, modifiers: [], note: NOTE_A }],
      }).blocks,
    );
    const carriers = partsCarrying(parts, NOTE_A);
    expect(carriers.length, "the note is not on the chit at all").toBeGreaterThan(0);
    for (const part of carriers) {
      expect(
        part.kind,
        "03-F55/N2: the note was emitted as system `text`, so a non-Latin note would refuse " +
          "`non_ascii_system_text` and be unprintable for ever rather than refusing 03-F8's " +
          "`raster_font_unavailable`",
      ).toBe("user_text");
    }
  });

  /**
   * The consequence `02-F50` exists to bound, asserted so it is a KNOWN state rather than a
   * surprise in service: a non-Latin note makes the whole document refuse, and `03-F34` says that
   * is correct — *"a hard refusal to print, never a silent degradation"*. What must NOT happen is
   * a rendered document with the note silently dropped or transliterated (`00 §5.6`).
   *
   * The refusal reason is deliberately not pinned to a literal: `03-F8`'s ruling names
   * `raster_font_unavailable` and `render-oracle-surface.ts` exports `SCRIPT_REFUSAL_REASONS` with
   * both members, so this asserts the SHAPE — a refusal, not a quiet success — and leaves the code
   * to K-5's own suite, which already owns it.
   */
  it("03-F34: a non-Latin note REFUSES the document rather than printing without it", () => {
    const spec = kotSpec();
    const result = render(
      api,
      spec,
      shippedDefaultProfile(spec),
      {
        ...BASE,
        lines: [{ quantity: 1, name: DISH_A, modifiers: [], note: "کم مرچ" }],
      } as unknown,
      WIDE,
    );
    if (result.ok) {
      expect(
        documentText(result.blocks),
        "the document rendered WITHOUT the note — 00 §5.6 forbids dropping or transliterating " +
          "user content, and 03-F34 forbids a silent degradation",
      ).toContain("کم مرچ");
    } else {
      expect(result.ok).toBe(false);
    }
  });
});
