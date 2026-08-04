// Acceptance tests — K-5, the `kot`'s OWN LAYOUT: which blocks, which slots, which regions, at
// which column widths.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `27-F55` — paper's four channels — ink density, character size, vertical position and grouping
//              whitespace, rasterised glyphs — and "the KOT must therefore carry LESS information
//              than a pass-screen ticket".
//   `27-F56` — the ink ladder: "exactly three levels, allocated once, platform-wide"; inverted
//              solid fill reserved; **2×2 size for the item line's quantity and the order/table
//              identifier**; "normal weight for everything else"; "Bold is **not** a level".
//              **Two SCOPES, one inversion each (founder ruling July 2026)** — banner: at most ONE
//              per document (`CANCEL`, `VOID`, `REPRINT`); item: at most ONE per item block.
//   `27-F57` — "Quantity sits **immediately left of the item name on the same line** … never in a
//              right-aligned column and never on its own row", which is why the KOT declares 42.
//   `27-F58` — "the reading order is fixed and never configurable: identifier → timing → items →
//              modifiers → notes"; "Groups are separated by **blank lines, not rules**".
//   `27-F59` — "Modifiers are indented under their item and never inlined"; a removal carries the
//              inverted marker; "An item with two removals carries **one** marker covering both".
//   `27-F62` — "Paper is not a status surface … no 'ready at' that a delay invalidates, no state
//              word that a later event contradicts. Print what was true at **append** time,
//              stamped with `branch_created_at`."
//   `03-F3`  — the KOT layout: order number + table/channel in large type, timestamp; one line per
//              item with qty/variant/modifiers; reprints carry a "REPRINT" band.
//   `03-F31` — structural differences live in the TYPE: "price presence … modifier emphasis, void
//              marker … reprint marker".
//   `03-F32` — "a `kot` renders **no money token** under any profile"; "Type invariants override
//              configuration"; enforced STRUCTURALLY.
//   `03-F33` — the region ladder, and that owner content is legal only OUTSIDE a locked region.
//   `03-F34` — hard refusal plus an S1 band, never a silent degradation.
//   `03-F36` — every `DocumentSpec` must render correctly at its declared `min_columns`; **banned:
//              absolute dot positioning, and space-as-layout**.
//   `03-F37` — "Reprint markers are mandatory per type, **in a locked region**."
//   `03-F49` — `kot` declares **42** columns and is refused below it, never squeezed.
//   `03 §7`  — Font A is a 12-dot cell; layout is expressed in columns.
//   `18 §10` — the virtual printer "renders output to PNG for snapshot tests; CI runs receipt/KOT
//              snapshots for every layout change".
//   `01 §4`  — the canonical order-line state vocabulary (`27-F62`'s banned words are read off it).
//
// K-1..K-4's LANDED code was read as the contract this layer composes over: the capability record,
// `MIN_COLUMNS`, `encode`/`EncoderPart`, `DocumentSpec`/`render`, and `packages/testing`'s virtual
// printer. **No K-5 implementation was read; none exists.** `plans/wave-1/kot-printing.md` was
// deliberately NOT read.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion is about a value a function returned: a list of blocks, a `Uint8Array`, a dot
// count a JavaScript page object recorded, or a refusal record. Where a test says the ticket "fits
// the paper" it means **a software renderer placed no dot outside a page of N dots**. `03-F10`'s
// rig — a real roll in a real printer — is owed in full (K-8), and `27-F35`'s ≥85% comprehension
// gate on real staff is what would actually decide whether this ticket is legible. `27 §2b` says so
// itself: "§2b is a **reasoned construction, not an evidence-backed one** … where the pilot
// contradicts this section, this section loses." Nothing below may be read as evidence about a
// cook.
//
// ── THE INSTRUMENT, AND WHY IT IS THE VIRTUAL PRINTER ──
//
// `03-F36`'s ban on absolute positioning names its own failure — "an `x=384` offset is mid-line at
// 576 dots and **off-paper at 384**" — and off-paper ink is invisible by construction: the head has
// nowhere to put it, so the page looks correct and is missing the part that mattered. K-3's virtual
// printer now RECORDS discarded dots instead of dropping them silently, which is the only way a
// layout that runs past the paper is observable at all. Every column-width assertion below is
// therefore made through it, and the instrument carries its own control (the same bytes on a
// narrower page MUST overflow) — an overflow counter that never fires proves nothing.
//
// ── WHAT IS GREEN ON THE RED RUN, AND WHY (stated so the count is not read as coverage) ──
//
// Two groups pass before K-5 exists and neither observes a K-5 behaviour:
//   * THE ORACLE SELF-TESTS. The line splitter, the rule detector, the interior-space detector and
//     the money-token detector are the instruments every other assertion is measured with, and an
//     instrument nobody calibrated is worth nothing (K-2's rule for its ESC/POS walker, inherited).
//     They run over strings and part lists built inside this file and observe nothing exported.
//   * A HANDFUL OF ABSENCE ASSERTIONS over K-4's minimal placeholder layout — no rule line, no
//     absolute positioning, no interior space run, no money token. Those are true of a ticket that
//     is nearly empty, so they are REGRESSION guards rather than coverage, and they are the
//     assertions most likely to start failing while K-5 is being written, which is the point.
// Everything that needs a modifier, a reprint band, a table/channel or a timestamp fails, because
// K-4's `kot` spec deliberately ships none of them: its own comment says so ("This is the MINIMUM
// layout that closes K-4's FRs, not `27 §2b`'s ticket … the KOT's own design belongs to the task
// that owns the layout").
//
// ── MUTATION EVIDENCE (the round-3 law: a claim that a test bites is not evidence that it does) ──
//
// A plausible K-5 layout was written OUT OF TREE against these FRs and took this file to **41/41
// green**. Thirty-three single-branch mutations were then applied to it, one at a time, each
// reverting to the clean implementation first. **Every mutation killed at least one assertion, and
// in every case it killed the assertion that claims to own the property.** Of the 41 tests, 34 were
// killed by at least one mutation; the 7 that were not are exactly the oracle self-tests, which
// observe no implementation and are their own controls.
//
// The mutations, with kill counts (a low count is the good outcome — it means attribution):
//   quantity at normal (1) · item name at 2×2 (4) · station at 2×2 (2) · quantity on its own row
//   (2) · quantity right-aligned by padding (1) · quantity moved right of the name (2) · modifiers
//   inlined (6) · modifier indent removed (1) · modifiers collected at the foot (6) · a preference
//   inverted too (2) · ONE MARKER PER REMOVAL instead of one covering both (1) · a constant
//   `item_block` key (15) · the removal marker in banner scope (16) · the REPRINT band not inverted
//   (2) · the band moved to an owner region (1) · the band printed on every ticket (5) · a
//   `show_prices` slot added to the spec (1) · a full-width rule separator (1) · a value padded to a
//   right-hand column (1) · `ESC $` emitted by the encoder (4) · the item line run past 42 columns
//   (1) · the band made suppressible by a profile toggle (33 from a locked region, 2 from an owner
//   region) · a profile value reordering the items (1) · the timestamp dropped (1) · the timestamp
//   moved below the items (1) · the table dropped (1) · a state word printed (1) · a "READY AT"
//   printed (2) · the items reversed (2) · the blank line between groups removed (1) · a money
//   amount printed (1) · the ticket narrowed until it fits 32 columns (12).
//
// Three counts deserve their reading stated, because a large number is usually the sign of a weak
// test and here it is not:
//   * **15 and 16** (constant `item_block`, and the removal marker in banner scope) are the two
//     mutations that make K-2's encoder REFUSE the document. `03-F34` gives a refusal no bytes and
//     no blocks, so every later assertion has nothing to read. That cascade is the FR's design, and
//     the attributed assertion is killed in both.
//   * **33** is the same cascade one layer up: a slot added to the band's block makes K-4's render
//     refuse `owner_slot_in_locked_region`. Worth recording as a result rather than an artefact —
//     `03-F37`'s "in a locked region" and `03-F34`'s owner-slot rule together make the mandatory
//     band **structurally unsuppressible**, and the same mutation from an OWNER region (where it is
//     structurally legal) kills exactly the two assertions that own it.
//   * **12** is the narrow-page CONTROL firing. Shortening every item name until the chit fits 32
//     columns kills the control, which is the only way to know the control was not vacuous.
//
// ── FR AMBIGUITIES AND CONFLICTS, REPORTED RATHER THAN FILLED ──
//
//  1. **`27-F57` AND `27-F56` DISAGREE ABOUT THE QUANTITY'S SIZE.** `27-F57` puts the quantity
//     "immediately left of the item name on the same line, **at the same size**"; `27-F56` allocates
//     "**2×2 size** for the item line's quantity and the order/table identifier". They cannot both
//     hold. `27-F57`'s own July 2026 correction settles it in practice by doing the arithmetic the
//     other way — "a two-digit quantity at `27-F56`'s 2× width costs 4 columns, leaving ~27 for the
//     name" — so this suite reads `27-F56` as the surviving allocation and asserts the quantity at
//     2×2 and the name at normal. **The words "at the same size" in `27-F57` are stale and are a
//     finding against the FR**, not a thing this oracle resolved.
//  2. **`03-F3` WANTS ITEM NOTES "VISUALLY EMPHASIZED" AND `27-F56` LEAVES NO INK TO DO IT WITH.**
//     The ladder has three levels: inversion is budgeted to two scopes (`CANCEL`/`VOID`/`REPRINT`
//     and the removal marker), 2×2 is allocated to the quantity and the identifier, and "normal
//     weight for everything else"; bold is explicitly not a level. So an item note can only be
//     emphasised through `27-F55`'s third channel — position and whitespace — and no FR says how.
//     **Nothing below asserts anything about a note.** `03-F8`'s July 2026 ruling also records that
//     order notes are not wired in Wave 1 ("`C7` is unbuilt"), so the field is not in the declared
//     contract at all. Both halves are a spec question, not a test.
//  3. **`27-F58`'s READING ORDER ENDS IN "notes", WHICH THE SAME SECTION MAKES UNREACHABLE.**
//     Following from 2: the order is "identifier → timing → items → modifiers → notes" and this
//     suite asserts the first four steps only. It does not decide whether "notes" means a per-item
//     note (which would interleave with items, contradicting the order) or an order-level one.
//  4. **`27-F58` DOES NOT SAY WHAT COUNTS AS A GROUP.** It says "whitespace encodes grouping" and
//     names five reading-order steps. Whether ONE ITEM plus its modifiers is also a group — and
//     therefore whether consecutive item blocks must be separated by a blank line — is unstated,
//     and `27-F55`'s "the KOT must carry LESS information" argues both ways (a blank line costs
//     paper; grouping is one of only four channels). **This suite asserts a blank line at the FR's
//     own group boundary (the identifier/timing group and the items group) and asserts nothing
//     between item blocks.**
//  5. **NO FR SAYS WHAT HAPPENS TO AN ITEM NAME TOO LONG FOR THE LINE.** `03-F38` says long names
//     are "a CATALOG problem, not a template one" and `03-F49` refuses a narrow PRINTER rather than
//     wrapping — neither addresses a 60-character name on a 42-column ticket. So the fitting
//     assertion below uses a name dimensioned by `27-F57`'s own arithmetic and **nothing here
//     asserts truncation, wrapping or refusal for an over-long name.**
//  6. **`03-F36`'s SPACE-AS-LAYOUT BAN VERSUS `27-F59`'s REQUIRED INDENT.** A modifier must be
//     "indented under its item", and with absolute positioning banned in the same FR, leading
//     spaces are the only remaining mechanism. So the ban is read as covering *interior* padding —
//     the run of spaces that carries a value to a right-hand column and makes a document
//     "permanently unreflowable" — and not a leading indent. Stated because the two FRs are
//     otherwise in direct contradiction. The same reading exempts an inverted band's own fill,
//     which is `27-F55` channel 1 (ink density), not layout.
//  7. **`27-F56`'s BANNER SCOPE NAMES `CANCEL` AND `VOID`, AND NO FR PUTS EITHER IN THE KOT's DATA
//     CONTRACT.** `03-F31` names a "void marker" as a type-level difference and `03-F7` logs a
//     post-KOT void, but nothing states that a KOT is ever printed carrying one. The declared
//     contract therefore carries `reprint` only — the one banner `03-F3` and `03-F37` both require
//     — and the at-most-one-banner budget is asserted over what the contract can express.
//  8. **NOTHING REQUIRES THE STATION ON THE PAPER.** `03-F18`/`03-F50` make the station the routing
//     key and `03-F3`'s layout list does not mention it, while `27-F55` says the chit must carry
//     LESS. So the station is in the data (K-4 already put it there) and **no assertion below
//     requires or forbids it on the ticket** — only that it never spends the 2×2 budget, which
//     `27-F56` allocated elsewhere.
//  9. **`03-F39`'s `max_lines_per_chit` HAS NO SLOT HERE.** The FR calls it "declarative pagination
//     policy … Owner-settable **per printer**", and a per-printer setting is not a `03-F30` document
//     profile (which is org/branch config). Splitting one order across chits is a feature with no
//     other FR, so nothing below asserts it. Named so its absence is a decision.
//
// ── WHAT THIS SUITE CANNOT ASSERT ──
//
//  * **THAT ANY OF THIS IS LEGIBLE.** See the hardware note above. `27-F35`'s comprehension gate is
//    a measurement on real staff and `27 §2b` is explicitly subordinate to it.
//  * **THAT THE GLYPHS ARE THE RIGHT GLYPHS.** The virtual printer draws a 5×7 face of its own; the
//    assertions here are about WHERE ink landed and how much of it fell off the page, never about
//    what a character looks like.
//  * **`27-F55`'s "LESS INFORMATION THAN A PASS-SCREEN TICKET".** `03-F13` lists the pass card's
//    contents and `27-F55` states the comparison as a design instruction with no metric. Counting
//    fields would be this oracle inventing one.

import { createVirtualPrinter } from "@restos/testing";
import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import type { EncoderPart } from "./encoder-oracle-surface.js";
import {
  CONTRADICTABLE_STATE_WORDS,
  FORWARD_LOOKING_TIME_TOKENS,
  type KotData,
} from "./kot-document-oracle-surface.js";
import type { EscposK1Api, PrinterCapability } from "./oracle-surface.js";
import {
  type DocumentProfile,
  type DocumentSpec,
  documentSpecs,
  type EscposK4Api,
  LOCKED_REGIONS,
  type Region,
  type RenderedBlock,
  type RenderResult,
  render,
  type SlotValue,
} from "./render-oracle-surface.js";

const api = escpos as unknown as EscposK4Api;
void (escpos as unknown as EscposK1Api);

// ── the numbers, each read off an FR ─────────────────────────────────────────────────────────────

/** `03 §7`: "Font A = 12" dots per cell; `03-F49`/`27-F57`: the KOT declares 42 columns. */
const FONT_A_CELL_DOTS = 12;
const KOT_MIN_COLUMNS = 42;
/** `03-F49`: "`receipt` and `bill` declare **32**" — the width the KOT is explicitly NOT squeezed to. */
const NARROW_COLUMNS = 32;

/**
 * K-1's builder, reused unchanged so the three suites cannot disagree about what "42 columns"
 * means. `03 §7`: columns are `print_dots ÷ font_cell_dots`.
 */
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
    raster_ok: true,
    ...over,
  };
};

/** Exactly the KOT's declared floor — `03-F36`: "must render correctly AT its declared min_columns". */
const AT_FLOOR = capsAt(KOT_MIN_COLUMNS, "AT-FLOOR-42");
/** Wide enough that the floor is not in play, for the assertions that are about ink and not width. */
const WIDE = capsAt(64, "WIDE-64");

// ── the fixture, dimensioned by `27-F57`'s OWN arithmetic ────────────────────────────────────────
//
// `27-F57`'s July 2026 correction does the sum: "a two-digit quantity at `27-F56`'s 2× width costs
// 4 columns, leaving ~27 for the name" — at 32. At the KOT's declared 42 the same sum leaves 37, so
// a 35-character name plus a two-digit quantity is a line the floor must hold with two columns to
// spare, and the spare columns are deliberate: no FR states the separator between quantity and
// name, so the fixture must not fail a layout that uses one space or two.
//
// Every string below is chosen so that a whole-document substring search is unambiguous: no name,
// modifier, station, table or ticket number is a substring of another, and no item name contains a
// digit (so a search for a quantity cannot match inside a name).

const NAME_A = "Chicken Karahi Boneless Handi Style"; // 35 characters
const NAME_B = "Butter Naan Tandoori Fresh Baked"; // 32 characters
const TICKET_NO = "0764";
const TABLE = "T9";
const STATION = "GRILL";
/** `01-F43`: branch time is integer milliseconds. Two stamps far apart, for the timing probe. */
const STAMP = 1_754_300_000_000;
const STAMP_LATER = STAMP + 97 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000 + 43 * 60 * 1000;

/** The ordinary ticket: two items, one removal and one preference on the first. */
const KOT_PLAIN: KotData = {
  ticket_no: TICKET_NO,
  table: TABLE,
  station: STATION,
  branch_created_at: STAMP,
  reprint: false,
  lines: [
    { quantity: 12, name: NAME_A, modifiers: [] },
    { quantity: 3, name: NAME_B, modifiers: [] },
  ],
};

/** `27-F59`: one removal and one preference on the SAME item — the ink must tell them apart. */
const KOT_MIXED_MODIFIERS: KotData = {
  ...KOT_PLAIN,
  lines: [
    {
      quantity: 12,
      name: NAME_A,
      modifiers: [
        { name: "Onion", removal: true },
        { name: "Chilli", removal: false },
      ],
    },
    { quantity: 3, name: NAME_B, modifiers: [] },
  ],
};

/**
 * `27-F59`: "An item with two removals carries **one** marker covering both — two inversions inside
 * one item block are in a single glance, which is the case `27-F56`'s budget actually forbids."
 */
const KOT_TWO_REMOVALS_ONE_ITEM: KotData = {
  ...KOT_PLAIN,
  lines: [
    {
      quantity: 12,
      name: NAME_A,
      modifiers: [
        { name: "Onion", removal: true },
        { name: "Ginger", removal: true },
      ],
    },
    { quantity: 3, name: NAME_B, modifiers: [] },
  ],
};

/**
 * `27-F56`'s ruling, from the other side: "a removal on the second dish is never in the same glance
 * as a removal on the first". Two markers, two item blocks, and the document must RENDER.
 */
const KOT_ONE_REMOVAL_EACH_ITEM: KotData = {
  ...KOT_PLAIN,
  lines: [
    { quantity: 12, name: NAME_A, modifiers: [{ name: "Onion", removal: true }] },
    { quantity: 3, name: NAME_B, modifiers: [{ name: "Ginger", removal: true }] },
  ],
};

/** `03-F3`/`03-F37`: the same ticket, reprinted. */
const KOT_REPRINT: KotData = { ...KOT_PLAIN, reprint: true };

/** `27-F56`'s two scopes at once: a banner AND an item marker on one ticket. Both are legal. */
const KOT_REPRINT_WITH_REMOVAL: KotData = { ...KOT_ONE_REMOVAL_EACH_ITEM, reprint: true };

/** The widest ticket this suite renders — used for the column-fitting assertion. */
const KOT_FULL: KotData = {
  ...KOT_REPRINT,
  lines: [
    {
      quantity: 12,
      name: NAME_A,
      modifiers: [
        { name: "Onion", removal: true },
        { name: "Chilli", removal: false },
      ],
    },
    { quantity: 3, name: NAME_B, modifiers: [{ name: "Ginger", removal: true }] },
  ],
};

// ── readers: turning a rendered document back into lines ─────────────────────────────────────────

const kotSpec = (): DocumentSpec => {
  const spec = documentSpecs(api).kot;
  if (spec === undefined) {
    throw new Error("DOCUMENT_SPECS.kot is not shipped yet (K-5, 03-F30 / 03-F49)");
  }
  return spec;
};

const slotDeclarationsOf = (spec: DocumentSpec) => spec.blocks.flatMap((block) => block.slots);

const shippedDefaultProfile = (spec: DocumentSpec): DocumentProfile =>
  Object.fromEntries(slotDeclarationsOf(spec).map((slot) => [slot.slot_id, slot.default]));

type Ok = Extract<RenderResult, { ok: true }>;

const okOf = (result: RenderResult, label: string): Ok => {
  expect(result.ok, `${label}: expected a rendered document, got ${JSON.stringify(result)}`).toBe(
    true,
  );
  return result as Ok;
};

/** Render the shipped `kot` spec with its shipped defaults — the only profile most tests need. */
const renderKot = (data: KotData, caps: PrinterCapability = WIDE, label = "kot"): Ok => {
  const spec = kotSpec();
  return okOf(render(api, spec, shippedDefaultProfile(spec), data, caps), label);
};

/** `27-F55` channel 2/1 as they appear on a part; `feed` is channel 3. */
const textOfPart = (part: EncoderPart): string =>
  part.kind === "text" || part.kind === "user_text" ? part.value : "";

const isInverted = (part: EncoderPart): boolean => part.kind === "text" && part.ink === "inverted";

const is2x2 = (part: EncoderPart): boolean => part.kind === "text" && part.ink === "size_2x2";

type Ref = {
  readonly block_id: string;
  readonly region: Region;
  readonly part: EncoderPart;
  /** Position in the whole document's flat part list — `27-F58`'s reading order is an ORDER. */
  readonly at: number;
};

type Line = { readonly refs: readonly Ref[]; readonly text: string; readonly blank: boolean };

/**
 * The document as LINES.
 *
 * `ESC d n` is "print and feed n lines", so a feed ends the current line and leaves `n - 1` blank
 * ones behind it — which is exactly how `27-F58`'s "groups are separated by blank lines" becomes
 * observable. A `cut` and a raster carry no text and do not end a line here; nothing below depends
 * on either, and the KOT emits no raster.
 */
const linesOf = (blocks: readonly RenderedBlock[]): Line[] => {
  const lines: Line[] = [];
  let current: Ref[] = [];
  let at = 0;
  const flush = (): void => {
    const text = current.map((ref) => textOfPart(ref.part)).join("");
    lines.push({ refs: current, text, blank: text.trim() === "" });
    current = [];
  };
  for (const block of blocks) {
    for (const part of block.parts) {
      const ref: Ref = { block_id: block.block_id, region: block.region, part, at };
      at += 1;
      if (part.kind === "feed") {
        flush();
        for (let k = 1; k < part.lines; k += 1) flush();
        continue;
      }
      current.push(ref);
    }
  }
  if (current.length > 0) flush();
  return lines;
};

const allRefs = (blocks: readonly RenderedBlock[]): Ref[] =>
  linesOf(blocks).flatMap((line) => [...line.refs]);

const documentText = (blocks: readonly RenderedBlock[]): string =>
  linesOf(blocks)
    .map((line) => line.text)
    .join("\n");

const has = (haystack: string, needle: string): boolean =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/** The indices of every line whose text carries `needle`, case-insensitively. */
const lineIndicesWith = (lines: readonly Line[], needle: string): number[] =>
  lines.flatMap((line, index) => (has(line.text, needle) ? [index] : []));

const soleLineWith = (lines: readonly Line[], needle: string, label: string): number => {
  const found = lineIndicesWith(lines, needle);
  expect(found.length, `${label}: expected ${JSON.stringify(needle)} on exactly one line`).toBe(1);
  return found[0] as number;
};

/**
 * The FIRST line carrying `needle`, used where a second occurrence would be legal.
 *
 * The order number is the case: `03-F3` puts it on the chit and nothing forbids it appearing twice,
 * and a timestamp can echo its digits by coincidence — so an oracle that demanded exactly one line
 * would fail a correct renderer for a reason no FR states.
 */
const firstLineWith = (lines: readonly Line[], needle: string, label: string): number => {
  const found = lineIndicesWith(lines, needle);
  expect(found.length, `${label}: ${JSON.stringify(needle)} is on no line at all`).toBeGreaterThan(
    0,
  );
  return found[0] as number;
};

/** The first flat part index whose text carries `needle`; `-1` when the document never says it. */
const firstRefWith = (refs: readonly Ref[], needle: string): Ref | undefined =>
  refs.find((ref) => has(textOfPart(ref.part), needle));

/**
 * `27-F58`: "Groups are separated by **blank lines, not rules** — a full-width rule costs a line of
 * paper and reads as a *boundary between documents* to someone who parses shape rather than text."
 *
 * A rule is detected by SHAPE and not by width: a run of three or more identical rule characters
 * already reads as a rule to someone who parses shape, and pinning "full-width" to 42 would let a
 * 32-character dashed line through on a 42-column ticket — or a `--- ITEMS ---` band through at any
 * width. Three is this oracle's threshold and is stated rather than derived; no FR gives a number,
 * but the direction is the FR's.
 *
 * `.` is deliberately NOT a rule character. An ellipsis is the one three-character run ordinary
 * ticket text can legitimately contain, and header ambiguity 5 records that no FR says what a
 * renderer does with an over-long item name — so a truncation marker must not be reported as a
 * rule.
 */
const RULE_RUN = /([-=_*~#])\1{2,}/;

const ruleRunIn = (text: string): string | null => RULE_RUN.exec(text)?.[0] ?? null;

/**
 * `03-F36`: "**Banned:** … space-as-layout (it makes a document permanently unreflowable)."
 *
 * INTERIOR is the load-bearing word — see header ambiguity 6. A run of spaces with printed content
 * on both sides of it is a column; a leading run is `27-F59`'s required indent. An inverted run is
 * replaced by a sentinel rather than dropped, so that removing a band cannot fuse two separate gaps
 * into one and report a column that is not there.
 */
const INVERTED_SENTINEL = "\u0001";

const layoutTextOf = (line: Line): string =>
  line.refs
    .map((ref) => (isInverted(ref.part) ? INVERTED_SENTINEL : textOfPart(ref.part)))
    .join("");

const interiorSpaceRunIn = (text: string): string | null => {
  for (const match of text.matchAll(/ {3,}/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (/\S/.test(text.slice(0, start)) && /\S/.test(text.slice(end))) return match[0];
  }
  return null;
};

/**
 * `03-F32`: "a `kot` renders **no money token** under any profile."
 *
 * K-4 established the pattern set and its limits; it is repeated here because K-5's ticket has
 * SURFACES K-4's did not — a modifier line, a banner, a timestamp — and a heuristic that never ran
 * over them says nothing about them. The structural half of the clause (no branded `Paisa` anywhere
 * in the chit's data contract, checked by `tsc`) is K-4's and is not duplicated.
 */
const MONEY_TOKEN_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  // The date/time guard on both sides is K-5's addition and it is not cosmetic: `03-F3` puts a
  // TIMESTAMP on this ticket and K-4's chit had none, so `04.08.2026` would otherwise be reported
  // as a rupee amount and the oracle would fail a correct renderer. Residual and named: a chit that
  // printed its time as `21.33` would still trip this. No FR states a time format, so the guard
  // covers the separators a date can use rather than guessing one.
  {
    name: "a decimal rupee amount (e.g. `3,141.59`)",
    re: /(?<![\d.:/-])\d[\d,]*\.\d{2}(?![\d.:/-])/,
  },
  { name: "a rupee word (`Rs` / `PKR`)", re: /(^|[^A-Za-z])(Rs|RS|PKR)([^A-Za-z]|$)/ },
  { name: "the rupee sign (`₨`)", re: /₨/ },
];

const moneyTokenIn = (text: string): string | null =>
  MONEY_TOKEN_PATTERNS.find((pattern) => pattern.re.test(text))?.name ?? null;

/**
 * `03-F32`: the invariant is enforced because "**the profile schema has no slot id addressing
 * them**". So the strongest runtime statement this layer can make about the KOT's own slot table is
 * that none of its ids is about money — which is a question about the NAME, not about a value.
 *
 * The word list is this oracle's, and it is stated as such: `03-F32` names no vocabulary. Each word
 * is one a back-office slot for a price would plausibly be called, and the FR's own example
 * (`show_prices`, "no price option anywhere in its kitchen-printer configuration") is covered by
 * the first.
 */
const MONEY_ADDRESSING_WORDS = [
  "price",
  "amount",
  "total",
  "money",
  "cost",
  "rupee",
  "currency",
  "paisa",
  "charge",
  "discount",
  "tax",
] as const;

const moneyAddressingWord = (slot_id: string): string | null =>
  MONEY_ADDRESSING_WORDS.find((word) => slot_id.toLowerCase().includes(word)) ?? null;

/**
 * `18 §10`'s virtual printer, walking the bytes onto a page of exactly this printer's width.
 *
 * Returns what did NOT fit, which is the number `03-F36` is actually about and which the page
 * itself cannot show. The device is created per call: it holds pages, and a shared one would let
 * one test's document be read by another's assertion.
 */
const overflowOf = async (
  bytes: Uint8Array,
  caps: PrinterCapability,
): Promise<{ discarded_dots: number; max_x: number | null }> => {
  const device = createVirtualPrinter({
    capability: { model_id: caps.model_id, dots: caps.dots, has_near_end_sensor: false },
  });
  const sent = await device.send(bytes);
  expect(sent.ok, `${caps.model_id}: the virtual printer did not accept the document`).toBe(true);
  const page = device.printed()[0];
  expect(page, `${caps.model_id}: the virtual printer produced no page`).toBeDefined();
  return (page as { overflow: { discarded_dots: number; max_x: number | null } }).overflow;
};

/** `03-F36`: "**Banned:** absolute dot positioning (an `x=384` offset is mid-line at 576 dots …)". */
const ABSOLUTE_POSITIONING_COMMANDS: readonly {
  readonly name: string;
  readonly bytes: number[];
}[] = [
  { name: "`ESC $` (absolute print position)", bytes: [0x1b, 0x24] },
  { name: "`ESC \\` (relative print position)", bytes: [0x1b, 0x5c] },
  { name: "`GS L` (left margin)", bytes: [0x1d, 0x4c] },
  { name: "`GS W` (print area width)", bytes: [0x1d, 0x57] },
];

const containsBytes = (haystack: Uint8Array, needle: readonly number[]): boolean => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let k = 0; k < needle.length; k += 1) if (haystack[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
};

/** The value space swept over every declared slot. Latin only — K-2 refuses non-Latin outright. */
const SWEEP_VALUES: readonly SlotValue[] = [
  "Rs 3,141.59",
  "3141.59",
  "PKR 314159",
  314159,
  true,
  false,
  "",
];

// ── oracle self-tests: the instruments, before anything is measured with them ─────────────────────

describe("the instruments this suite measures with (no K-5 behaviour is observed here)", () => {
  const textPart = (value: string, ink: "normal" | "size_2x2" = "normal"): EncoderPart => ({
    kind: "text",
    value,
    ink,
  });
  const bannerPart = (value: string): EncoderPart => ({
    kind: "text",
    value,
    ink: "inverted",
    scope: "banner",
  });
  const blockOf = (parts: readonly EncoderPart[]): RenderedBlock[] => [
    { block_id: "B", region: "BODY", parts },
  ];

  it("the line splitter: a feed of 1 ends a line and a feed of 2 leaves a blank one behind it", () => {
    const lines = linesOf(
      blockOf([
        textPart("first"),
        { kind: "feed", lines: 1 },
        textPart("second"),
        { kind: "feed", lines: 2 },
        textPart("third"),
        { kind: "feed", lines: 1 },
      ]),
    );
    expect(lines.map((line) => line.text)).toEqual(["first", "second", "", "third"]);
    expect(lines.map((line) => line.blank)).toEqual([false, false, true, false]);
  });

  it("the line splitter keeps two runs of different ink on ONE line (27-F57's whole point)", () => {
    const lines = linesOf(
      blockOf([textPart("12", "size_2x2"), textPart(" Karahi"), { kind: "feed", lines: 1 }]),
    );
    expect(lines.length).toBe(1);
    expect(lines[0]?.text).toBe("12 Karahi");
    expect(lines[0]?.refs.filter((ref) => is2x2(ref.part)).length).toBe(1);
  });

  it("the rule detector fires on a rule and not on ordinary ticket text", () => {
    expect(ruleRunIn("--------")).toBe("--------");
    expect(ruleRunIn("--- ITEMS ---")).toBe("---");
    expect(ruleRunIn("========================================")).not.toBeNull();
    expect(ruleRunIn("12 Chicken Karahi Boneless Handi Style")).toBeNull();
    expect(ruleRunIn("KOT 0764  T9")).toBeNull();
    // The one three-character run ordinary ticket text can carry — see the note on `RULE_RUN`.
    expect(ruleRunIn("12 Chicken Karahi Boneless Handi Sty...")).toBeNull();
  });

  it("the interior-space detector separates a column from an indent", () => {
    // `03-F36` bans the first and `27-F59` requires the second — see header ambiguity 6.
    expect(interiorSpaceRunIn("Chicken Karahi        2")).toBe("        ");
    expect(interiorSpaceRunIn("  Onion")).toBeNull();
    expect(interiorSpaceRunIn("12 Chicken Karahi")).toBeNull();
    expect(interiorSpaceRunIn("  Onion   ")).toBeNull();
  });

  it("the interior-space detector is not fooled by a band it had to skip over", () => {
    // Two two-space gaps either side of an inverted marker are not a four-space column, and they
    // read as one the moment the marker's text is DELETED rather than replaced. The sentinel is
    // what keeps them apart, and this fixture is the one that can tell the two apart: with the
    // sentinel it is two runs of two, without it a single run of four with print on both sides.
    const line = linesOf(
      blockOf([textPart("NO  "), bannerPart("X"), textPart("  Onion"), { kind: "feed", lines: 1 }]),
    )[0] as Line;
    expect(layoutTextOf(line)).toBe(`NO  ${INVERTED_SENTINEL}  Onion`);
    expect(INVERTED_SENTINEL, "an empty sentinel is a deletion, not a replacement").not.toBe("");
    expect(interiorSpaceRunIn(layoutTextOf(line))).toBeNull();
    expect(interiorSpaceRunIn("NO    Onion"), "the detector cannot see a four-space column").toBe(
      "    ",
    );
  });

  it("the money-token detector fires on the tokens a Pakistani chit would print money with", () => {
    expect(moneyTokenIn("2 Karahi   1,250.00")).not.toBeNull();
    expect(moneyTokenIn("TOTAL Rs 3141")).not.toBeNull();
    expect(moneyTokenIn("PKR 314159")).not.toBeNull();
    expect(moneyTokenIn("12 Chicken Karahi Boneless Handi Style")).toBeNull();
    expect(moneyTokenIn("KOT 0764  T9  GRILL")).toBeNull();
    // `03-F3` puts a timestamp on this ticket, and a date is not an amount — see the note above.
    expect(moneyTokenIn("04.08.2026 21:33")).toBeNull();
    expect(moneyTokenIn("04/08/2026")).toBeNull();
  });

  it("the absolute-positioning scanner finds the command `03-F36` names, in a buffer", () => {
    expect(containsBytes(Uint8Array.from([0x1b, 0x40, 0x1b, 0x24, 0x80, 0x01]), [0x1b, 0x24])).toBe(
      true,
    );
    expect(containsBytes(Uint8Array.from([0x1b, 0x40, 0x41, 0x0a]), [0x1b, 0x24])).toBe(false);
  });
});

// ── 27-F58: the reading order ────────────────────────────────────────────────────────────────────

describe("27-F58 — the reading order is fixed: identifier → timing → items → modifiers", () => {
  it("27-F58/03-F3: the order identifier precedes the first item, which precedes its modifiers", () => {
    // "The reading order is fixed and never configurable: identifier → timing → items → modifiers
    // → notes." Read off the flat part order, which is the order the head puts ink down in.
    const rendered = renderKot(KOT_MIXED_MODIFIERS, WIDE, "reading order");
    const refs = allRefs(rendered.blocks);
    const identifier = firstRefWith(refs, TICKET_NO);
    const firstItem = firstRefWith(refs, NAME_A);
    const firstModifier = firstRefWith(refs, "Onion");
    expect(identifier, `the ticket number ${TICKET_NO} never reaches the paper`).toBeDefined();
    expect(firstItem, "the first item name never reaches the paper").toBeDefined();
    expect(firstModifier, "the modifier never reaches the paper").toBeDefined();
    expect((identifier as Ref).at, "the identifier is not above the items").toBeLessThan(
      (firstItem as Ref).at,
    );
    expect((firstItem as Ref).at, "a modifier is printed above its own item").toBeLessThan(
      (firstModifier as Ref).at,
    );
  });

  it("27-F58: the items keep the order the data gave them", () => {
    // Not stated as its own clause, but "vertical position encodes urgency" is unreadable if the
    // renderer reorders lines: the cook's line 1 must be the order's line 1.
    const rendered = renderKot(KOT_PLAIN, WIDE, "item order");
    const refs = allRefs(rendered.blocks);
    const a = firstRefWith(refs, NAME_A);
    const b = firstRefWith(refs, NAME_B);
    expect(a, "the first item never reaches the paper").toBeDefined();
    expect(b, "the second item never reaches the paper").toBeDefined();
    expect((a as Ref).at).toBeLessThan((b as Ref).at);
  });

  it("27-F62/03-F3: the timestamp comes from the event's stamp and sits between identifier and items", () => {
    // `27-F62`: "Print what was true at APPEND time, stamped with `branch_created_at`". No FR
    // states a FORMAT, so the timing is located by DIFFERENCING two documents that differ in
    // nothing but the stamp — the first part they disagree on is the timing, whatever it looks
    // like. A ticket with no timestamp at all produces no disagreement and fails here, which is
    // the case `03-F3` requires and the one a format-matching assertion could not tell apart.
    const first = allRefs(renderKot(KOT_PLAIN, WIDE, "stamp A").blocks);
    const second = allRefs(
      renderKot({ ...KOT_PLAIN, branch_created_at: STAMP_LATER }, WIDE, "stamp B").blocks,
    );
    const divergence = first.findIndex(
      (ref, index) => textOfPart(ref.part) !== textOfPart(second[index]?.part ?? ref.part),
    );
    expect(
      divergence,
      "changing `branch_created_at` changed no text — the ticket carries no timestamp (03-F3, 27-F62)",
    ).toBeGreaterThanOrEqual(0);
    const identifier = firstRefWith(first, TICKET_NO);
    const firstItem = firstRefWith(first, NAME_A);
    expect(identifier).toBeDefined();
    expect(firstItem).toBeDefined();
    expect(divergence, "the timing is printed above the identifier").toBeGreaterThan(
      (identifier as Ref).at,
    );
    expect(divergence, "the timing is printed below the items").toBeLessThan((firstItem as Ref).at);
  });

  it("27-F58: the identifier group and the items group are separated by a BLANK LINE", () => {
    // "Groups are separated by blank lines, not rules." Asserted at the FR's own group boundary
    // only — see header ambiguity 4.
    const rendered = renderKot(KOT_PLAIN, WIDE, "grouping");
    const lines = linesOf(rendered.blocks);
    const identifier = firstLineWith(lines, TICKET_NO, "identifier");
    const firstItem = soleLineWith(lines, NAME_A, "first item");
    const between = lines.slice(identifier + 1, firstItem);
    expect(
      between.filter((line) => line.blank).length,
      "no blank line separates the identifier group from the items (27-F58)",
    ).toBeGreaterThan(0);
  });

  it("27-F58: NO full-width rule anywhere — a rule reads as a boundary between documents", () => {
    for (const [label, data] of Object.entries({
      plain: KOT_PLAIN,
      modifiers: KOT_MIXED_MODIFIERS,
      reprint: KOT_REPRINT,
      full: KOT_FULL,
    })) {
      const rendered = renderKot(data as KotData, WIDE, label);
      for (const line of linesOf(rendered.blocks)) {
        expect(
          ruleRunIn(line.text),
          `${label}: the ticket draws a rule (${JSON.stringify(line.text)}) — 27-F58 wants a blank line`,
        ).toBeNull();
      }
    }
  });
});

// ── 27-F57 / 27-F56: the quantity, and the two rungs of the size channel ─────────────────────────

describe("27-F57 — the quantity is never separated from the item it counts", () => {
  it("27-F57: the quantity sits on the item's OWN line, to the LEFT of the name", () => {
    // "Quantity sits immediately left of the item name on the same line … never in a right-aligned
    // column and never on its own row." The mapping step is where comprehension collapses
    // (decode ~71%, execute ~35%), which is why this is the constraint that sets `min_columns`.
    const rendered = renderKot(KOT_PLAIN, WIDE, "pairing");
    const lines = linesOf(rendered.blocks);
    for (const line of KOT_PLAIN.lines) {
      const index = soleLineWith(lines, line.name, `item ${line.name}`);
      const itemLine = lines[index] as Line;
      const nameRef = itemLine.refs.find((ref) => has(textOfPart(ref.part), line.name));
      expect(nameRef, `${line.name}: no part on its line carries the name`).toBeDefined();
      const quantityRef = itemLine.refs.find(
        (ref) =>
          ref.at < (nameRef as Ref).at && textOfPart(ref.part).includes(String(line.quantity)),
      );
      expect(
        quantityRef,
        `${line.name}: the quantity ${line.quantity} is not on the item's line to the left of it — ` +
          `the line reads ${JSON.stringify(itemLine.text)} (27-F57)`,
      ).toBeDefined();
    }
  });

  it("27-F57: the item line is not INDENTED — a right-aligned quantity column is what it bans", () => {
    // A single-digit quantity padded to align under a two-digit one IS the right-aligned column
    // the FR names, and it shows up as a leading space on the narrower line. The fixture carries
    // a 2-digit and a 1-digit quantity precisely so that padding is tempting.
    const rendered = renderKot(KOT_PLAIN, WIDE, "no right-aligned quantity");
    const lines = linesOf(rendered.blocks);
    for (const line of KOT_PLAIN.lines) {
      const itemLine = lines[soleLineWith(lines, line.name, `item ${line.name}`)] as Line;
      expect(
        itemLine.text.startsWith(" "),
        `${line.name}: the item line is indented (${JSON.stringify(itemLine.text)}) — 27-F57 bans a right-aligned quantity column`,
      ).toBe(false);
    }
  });

  it("27-F56: the quantity is 2×2 and the item NAME is normal — the budget, not a preference", () => {
    // "**2×2 size** for the item line's quantity and the order/table identifier; **normal weight**
    // for everything else." See header ambiguity 1 for `27-F57`'s stale "at the same size".
    const rendered = renderKot(KOT_PLAIN, WIDE, "size ladder");
    const lines = linesOf(rendered.blocks);
    for (const line of KOT_PLAIN.lines) {
      const itemLine = lines[soleLineWith(lines, line.name, `item ${line.name}`)] as Line;
      const nameRef = itemLine.refs.find((ref) => has(textOfPart(ref.part), line.name)) as Ref;
      const quantityRef = itemLine.refs.find(
        (ref) => ref.at < nameRef.at && textOfPart(ref.part).includes(String(line.quantity)),
      );
      expect(quantityRef, `${line.name}: no quantity part`).toBeDefined();
      expect(
        is2x2((quantityRef as Ref).part),
        `${line.name}: the quantity is not at 2×2 (27-F56 allocates the rung to it)`,
      ).toBe(true);
      expect(
        is2x2(nameRef.part),
        `${line.name}: the item NAME is at 2×2 — 27-F56 allocated that rung to the quantity and the identifier only`,
      ).toBe(false);
      expect(
        isInverted(nameRef.part),
        `${line.name}: the item name is inverted — 27-F56 reserves inversion for the two budgeted scopes`,
      ).toBe(false);
    }
  });

  it("27-F56: the order identifier spends the OTHER 2×2 allocation, and nothing else spends it", () => {
    // The budget's closure, which is the half a per-field assertion cannot reach: "A ticket that
    // uses inversion twice has used it zero times" is the same argument one rung up — a 2×2 station
    // header makes the quantity stop being the big thing on the line.
    const rendered = renderKot(KOT_FULL, WIDE, "2x2 closure");
    const refs = allRefs(rendered.blocks);
    const identifier = refs.find((ref) => has(textOfPart(ref.part), TICKET_NO));
    expect(identifier, "the ticket number never reaches the paper").toBeDefined();
    expect(
      is2x2((identifier as Ref).part),
      "03-F3 wants the order number 'in large type' and 27-F56 names the rung",
    ).toBe(true);

    const forbiddenAtLarge = [STATION, NAME_A, NAME_B, "Onion", "Ginger", "Chilli"];
    for (const ref of refs.filter((candidate) => is2x2(candidate.part))) {
      for (const forbidden of forbiddenAtLarge) {
        expect(
          has(textOfPart(ref.part), forbidden),
          `${JSON.stringify(textOfPart(ref.part))} is printed at 2×2, and 27-F56 allocates that rung to the quantity and the order/table identifier only`,
        ).toBe(false);
      }
    }
  });

  it("03-F3: the table/channel identifier reaches the ticket", () => {
    // "order number + table/channel in large type" — two facts, one slot (see the contract note on
    // `table`). Asserted as presence rather than as a position, because `03-F3` gives no order
    // between the two and `27-F58` treats them as one group.
    const rendered = renderKot(KOT_PLAIN, WIDE, "table");
    expect(
      has(documentText(rendered.blocks), TABLE),
      `03-F3 puts the table/channel on the ticket and ${JSON.stringify(TABLE)} is not on it`,
    ).toBe(true);
  });
});

// ── 27-F59: modifiers ────────────────────────────────────────────────────────────────────────────

describe("27-F59 — modifiers are indented under their item and never inlined", () => {
  it("27-F59: a modifier is on its OWN line, not on the item's line", () => {
    // "An inlined modifier turns one scannable line into a wrapped paragraph, and wrapping destroys
    // the vertical alignment that `27-F57` and `27-F58` depend on."
    const rendered = renderKot(KOT_MIXED_MODIFIERS, WIDE, "not inlined");
    const lines = linesOf(rendered.blocks);
    const itemLine = soleLineWith(lines, NAME_A, "the modified item");
    for (const modifier of ["Onion", "Chilli"]) {
      const found = lineIndicesWith(lines, modifier);
      expect(found.length, `${modifier}: expected it on exactly one line`).toBe(1);
      expect(
        found[0],
        `${modifier} is inlined on the item's own line — 27-F59 bans exactly that`,
      ).not.toBe(itemLine);
    }
  });

  it("27-F59: a modifier line is INDENTED, and its item's line is not", () => {
    // With absolute positioning banned (`03-F36`) a leading space is the only indent mechanism
    // left — see header ambiguity 6.
    const rendered = renderKot(KOT_MIXED_MODIFIERS, WIDE, "indent");
    const lines = linesOf(rendered.blocks);
    for (const modifier of ["Onion", "Chilli"]) {
      const line = lines[soleLineWith(lines, modifier, modifier)] as Line;
      expect(
        line.text.startsWith(" "),
        `${modifier}: the modifier line is not indented (${JSON.stringify(line.text)}) — 27-F59`,
      ).toBe(true);
    }
  });

  it("27-F59: a modifier hangs UNDER its own item, above the next one", () => {
    // The property "indented under their item" is about POSITION, and a renderer that collected
    // every modifier into a block at the foot of the ticket would satisfy "own line" and "indented"
    // while destroying the pairing the FR exists to protect.
    const rendered = renderKot(KOT_ONE_REMOVAL_EACH_ITEM, WIDE, "hangs under");
    const lines = linesOf(rendered.blocks);
    const itemA = soleLineWith(lines, NAME_A, NAME_A);
    const itemB = soleLineWith(lines, NAME_B, NAME_B);
    const onion = soleLineWith(lines, "Onion", "Onion");
    const ginger = soleLineWith(lines, "Ginger", "Ginger");
    expect(onion, "the first item's modifier is not under it").toBeGreaterThan(itemA);
    expect(onion, "the first item's modifier fell past the second item").toBeLessThan(itemB);
    expect(ginger, "the second item's modifier is not under it").toBeGreaterThan(itemB);
  });
});

// ── 27-F56: the inverted rung, and its two scopes ────────────────────────────────────────────────

describe("27-F56/27-F59 — the inverted rung is a budget with exactly two scopes", () => {
  it("27-F59: a REMOVAL carries the inverted marker and a PREFERENCE does not", () => {
    // "Where a modifier is a *removal* it carries the inverted marker of `27-F56`, because a
    // removal that is missed is an allergen incident, not a preference miss."
    const rendered = renderKot(KOT_MIXED_MODIFIERS, WIDE, "removal vs preference");
    const lines = linesOf(rendered.blocks);
    const removalLine = lines[soleLineWith(lines, "Onion", "Onion")] as Line;
    const preferenceLine = lines[soleLineWith(lines, "Chilli", "Chilli")] as Line;
    expect(
      removalLine.refs.some((ref) => isInverted(ref.part)),
      "the removal carries no inverted marker (27-F59)",
    ).toBe(true);
    expect(
      preferenceLine.refs.some((ref) => isInverted(ref.part)),
      "a preference carries the inverted marker — 27-F56 reserves the rung and a ticket that uses inversion twice has used it zero times",
    ).toBe(false);
  });

  it("27-F56: the removal marker takes the ITEM scope, keyed to its own item block", () => {
    // The scope is what the budget is counted over. A removal marker declared as a BANNER competes
    // with `REPRINT` for the one banner the document may carry, which the two-scope ruling exists
    // to prevent.
    const rendered = renderKot(KOT_MIXED_MODIFIERS, WIDE, "item scope");
    const inverted = allRefs(rendered.blocks).filter((ref) => isInverted(ref.part));
    expect(inverted.length, "expected exactly one inverted marker on this ticket").toBe(1);
    const part = (inverted[0] as Ref).part;
    expect(
      part.kind === "text" && part.ink === "inverted" ? part.scope : "none",
      "the removal marker is not in `item` scope (27-F56's two-scope ruling)",
    ).toBe("item");
  });

  it("27-F59: TWO removals on ONE item carry ONE marker, and the ticket still renders", () => {
    // "An item with two removals carries **one** marker covering both — two inversions inside one
    // item block are in a single glance, which is the case `27-F56`'s budget actually forbids."
    // A renderer that emits one marker per removal does not merely look busy: K-2's encoder refuses
    // the document (`item_marker_budget_exceeded`) and the kitchen gets no chit at all.
    const spec = kotSpec();
    const result = render(api, spec, shippedDefaultProfile(spec), KOT_TWO_REMOVALS_ONE_ITEM, WIDE);
    const rendered = okOf(
      result,
      "two removals on one item — one marker covering both (27-F59, 27-F56)",
    );
    const inverted = allRefs(rendered.blocks).filter((ref) => isInverted(ref.part));
    expect(
      inverted.length,
      "one item block, two removals: 27-F59 asks for ONE marker covering both",
    ).toBe(1);
    const text = documentText(rendered.blocks);
    for (const modifier of ["Onion", "Ginger"]) {
      expect(has(text, modifier), `${modifier} vanished from a ticket that removes it`).toBe(true);
    }
  });

  it("27-F56: ONE removal on EACH of two items renders — the two markers are different glances", () => {
    // "A cook reads one dish at a time, so a removal on the second dish is never in the same glance
    // as a removal on the first." Both markers are legal, and they are only legal if the renderer
    // gives each item block its own key: a constant `item_block` collapses them into one glance and
    // the encoder refuses the whole ticket.
    const rendered = renderKot(KOT_ONE_REMOVAL_EACH_ITEM, WIDE, "one removal per item");
    const inverted = allRefs(rendered.blocks).filter((ref) => isInverted(ref.part));
    expect(inverted.length, "expected one marker per removed-from item").toBe(2);
    const keys = inverted.map((ref) =>
      ref.part.kind === "text" && ref.part.ink === "inverted" && ref.part.scope === "item"
        ? ref.part.item_block
        : `not-item-scope:${ref.at}`,
    );
    expect(new Set(keys).size, `the two markers share one glance key (${keys.join(", ")})`).toBe(2);
  });

  it("27-F56: a ticket with no removal and no reprint carries NO inversion at all", () => {
    // The budget's floor. Inversion is "reserved for the single most consequential fact on the
    // ticket and nothing else", so an ordinary chit spends none of it — and a renderer that
    // inverts a header or a separator has spent the allocation before the allergen needs it.
    const rendered = renderKot(KOT_PLAIN, WIDE, "no inversion");
    const inverted = allRefs(rendered.blocks).filter((ref) => isInverted(ref.part));
    expect(
      inverted.map((ref) => textOfPart(ref.part)),
      "an ordinary chit spends the inverted rung on nothing (27-F56)",
    ).toEqual([]);
  });

  it("27-F56: every part is on the three-level ladder, and normal is everything else", () => {
    // "Bold is **not** a level — at 203 dpi on 48 GSM the difference between bold and normal is
    // unreliable across the printers we actually support." A fourth level cannot be written down in
    // K-2's part type, so what is asserted here is the other half: on an ordinary chit the ONLY
    // parts above normal are the identifier and the quantities.
    const rendered = renderKot(KOT_PLAIN, WIDE, "ladder");
    const large = allRefs(rendered.blocks)
      .filter((ref) => is2x2(ref.part))
      .map((ref) => textOfPart(ref.part).trim());
    expect(
      large.length,
      "nothing on the ticket is at 2×2 (27-F56 allocates two things to it)",
    ).toBeGreaterThan(0);
    for (const value of large) {
      const explained =
        value.includes(TICKET_NO) ||
        value.includes(TABLE) ||
        KOT_PLAIN.lines.some((line) => value.includes(String(line.quantity)));
      expect(
        explained,
        `${JSON.stringify(value)} is at 2×2 and is neither the order/table identifier nor an item quantity`,
      ).toBe(true);
    }
  });
});

// ── 03-F37 / 03-F3: the reprint band ─────────────────────────────────────────────────────────────

describe("03-F37/03-F3 — the reprint band is mandatory, inverted, and in a locked region", () => {
  it("03-F3: a reprint carries a REPRINT band and an ordinary ticket does not", () => {
    // "Reprints are already a named fraud vector — the paper must say so."
    const reprint = renderKot(KOT_REPRINT, WIDE, "reprint");
    const plain = renderKot(KOT_PLAIN, WIDE, "not a reprint");
    expect(
      has(documentText(reprint.blocks), "REPRINT"),
      "a reprinted chit does not say REPRINT (03-F3, 03-F37)",
    ).toBe(true);
    expect(
      has(documentText(plain.blocks), "REPRINT"),
      "a first print says REPRINT — the band would then mean nothing",
    ).toBe(false);
  });

  it("03-F37: the band is in a LOCKED region — not the owner's to move or fill", () => {
    // "Reprint markers are mandatory per type, **in a locked region**." `03-F33`: owner content is
    // legal only outside a locked block, and `03-F34` refuses a document with an owner slot inside
    // one — so the band's block must both BE locked and declare no slot.
    const spec = kotSpec();
    const rendered = renderKot(KOT_REPRINT, WIDE, "band region");
    const banner = allRefs(rendered.blocks).find((ref) => has(textOfPart(ref.part), "REPRINT"));
    expect(banner, "no part of the ticket says REPRINT").toBeDefined();
    const region = (banner as Ref).region;
    expect(
      LOCKED_REGIONS as readonly Region[],
      `the REPRINT band is in ${region}, which is not a locked region (03-F37)`,
    ).toContain(region);
    const declaringBlock = spec.blocks.find((block) => block.block_id === (banner as Ref).block_id);
    expect(
      declaringBlock?.slots ?? [],
      "the band's block declares an owner slot inside a locked region (03-F33/03-F34)",
    ).toEqual([]);
  });

  it("27-F56: the REPRINT band spends the BANNER scope, and it is the only banner on the ticket", () => {
    // "Banner scope — at most ONE per document. `CANCEL`, `VOID`, `REPRINT`. These compete with
    // each other and the FR's rule binds absolutely: a ticket with two banners has none."
    const rendered = renderKot(KOT_REPRINT, WIDE, "banner scope");
    const banners = allRefs(rendered.blocks).filter(
      (ref) =>
        ref.part.kind === "text" && ref.part.ink === "inverted" && ref.part.scope === "banner",
    );
    expect(banners.length, "expected exactly one banner on a reprinted chit").toBe(1);
    expect(
      has(textOfPart((banners[0] as Ref).part), "REPRINT"),
      "the ticket's one banner is not the REPRINT band",
    ).toBe(true);
  });

  it("27-F56: a reprint WITH a removal renders — the two scopes do not compete", () => {
    // The founder ruling's whole point, and the case that was broken before it: "an order with two
    // removals — or one removal on a reprint — satisfied neither". A renderer that puts the removal
    // marker in banner scope refuses this document outright, and the kitchen gets nothing.
    const spec = kotSpec();
    const rendered = okOf(
      render(api, spec, shippedDefaultProfile(spec), KOT_REPRINT_WITH_REMOVAL, WIDE),
      "a reprint that also removes an ingredient (27-F56's two-scope ruling)",
    );
    const inverted = allRefs(rendered.blocks).filter((ref) => isInverted(ref.part));
    const scopes = inverted.map((ref) =>
      ref.part.kind === "text" && ref.part.ink === "inverted" ? ref.part.scope : "none",
    );
    expect(scopes.filter((scope) => scope === "banner").length, "more than one banner").toBe(1);
    expect(
      scopes.filter((scope) => scope === "item").length,
      "the two item markers are missing",
    ).toBe(2);
  });
});

// ── 03-F49 / 03-F36: the declared width, measured on a page ──────────────────────────────────────

describe("03-F49/03-F36 — the ticket fits the paper it declares, measured on the virtual printer", () => {
  it("03-F36: at the declared 42 columns the ticket places NO dot off the page", async () => {
    // "Every DocumentSpec must render correctly at its declared `min_columns` — a build-time test,
    // not a review convention." The fixture is dimensioned by `27-F57`'s own arithmetic: a two-digit
    // quantity at 2× width costs 4 columns, leaving 37 at the KOT's declared 42, and the longest
    // name here is 35. NO PRINTER IS INVOLVED — this counts dots a software page discarded.
    const rendered = renderKot(KOT_FULL, AT_FLOOR, "at the declared floor");
    const overflow = await overflowOf(rendered.bytes, AT_FLOOR);
    expect(
      overflow.discarded_dots,
      `the ticket ran off ${KOT_MIN_COLUMNS}-column paper by ${
        overflow.max_x === null ? 0 : overflow.max_x + 1 - AT_FLOOR.dots
      } dots (03-F36, 03-F49)`,
    ).toBe(0);
  });

  it("03-F49: THE CONTROL — the same bytes on 32-column paper DO run off it", async () => {
    // Two things at once, and neither is provable without the other. (a) The instrument can see
    // off-paper ink at all, so the zero above is a measurement rather than a counter that never
    // fires. (b) `03-F49`'s claim is real for a ticket of this shape: "a 58 mm printer cannot print
    // kitchen tickets", which is why the KOT is refused below 42 rather than squeezed into 32.
    // Nothing here says a 32-column printer would ever be ASKED to print this — `03-F49` refuses it
    // at the gate, and that refusal is K-4's assertion, not this one.
    const rendered = renderKot(KOT_FULL, AT_FLOOR, "for the narrow-page control");
    const narrow = capsAt(NARROW_COLUMNS, "CONTROL-32");
    const overflow = await overflowOf(rendered.bytes, narrow);
    expect(
      overflow.discarded_dots,
      "a 42-column ticket fitted inside 32 columns — either the layout is far narrower than the floor it declares, or the overflow instrument is not measuring",
    ).toBeGreaterThan(0);
  });

  it("03-F36: the bytes carry no absolute-positioning command", () => {
    // "**Banned:** absolute dot positioning (an `x=384` offset is mid-line at 576 dots and
    // off-paper at 384)". K-2's allowlist bans these at the encoder; this is the assertion that the
    // KOT's own layout does not reach for one.
    const rendered = renderKot(KOT_FULL, AT_FLOOR, "no absolute positioning");
    for (const command of ABSOLUTE_POSITIONING_COMMANDS) {
      expect(
        containsBytes(rendered.bytes, command.bytes),
        `the ticket emits ${command.name}, which 03-F36 bans outright`,
      ).toBe(false);
    }
  });

  it("03-F36: no line uses SPACES AS LAYOUT to carry a value to a column", () => {
    // "**Banned:** … space-as-layout (it makes a document permanently unreflowable)." Interior only
    // — `27-F59`'s indent is required by the same corpus (header ambiguity 6).
    for (const [label, data] of Object.entries({
      plain: KOT_PLAIN,
      modifiers: KOT_MIXED_MODIFIERS,
      full: KOT_FULL,
    })) {
      const rendered = renderKot(data as KotData, AT_FLOOR, label);
      for (const line of linesOf(rendered.blocks)) {
        const run = interiorSpaceRunIn(layoutTextOf(line));
        expect(
          run,
          `${label}: ${JSON.stringify(line.text)} pads a value to a column with ${run?.length ?? 0} spaces (03-F36)`,
        ).toBeNull();
      }
    }
  });

  it("18 §10: the whole document is bytes a printer walker accepts — nothing unaccounted", async () => {
    // The virtual printer's walk is an ALLOWLIST and throws on any command it does not implement,
    // naming the offending bytes. Running the widest ticket through it is the second net under the
    // scan above: it catches a command nobody thought to ban as well as the four that are named.
    const rendered = renderKot(KOT_FULL, AT_FLOOR, "walker");
    await expect(overflowOf(rendered.bytes, AT_FLOOR)).resolves.toBeDefined();
  });
});

// ── 03-F32: type invariants override configuration ───────────────────────────────────────────────

describe("03-F32 — the kot's invariants survive every profile the owner can write", () => {
  const sweep = (): { slot_id: string; value: SlotValue }[] => {
    const spec = kotSpec();
    const declared = slotDeclarationsOf(spec);
    expect(
      declared.length,
      "the kot spec declares no slot at all — every 'under any profile' assertion below would be vacuous (03-F30)",
    ).toBeGreaterThan(0);
    return declared.flatMap((slot) =>
      SWEEP_VALUES.map((value) => ({ slot_id: slot.slot_id, value })),
    );
  };

  it("03-F32: the kot's TEMPLATE prints no money token, on every shape of chit K-5 can make", () => {
    // "A `kot` renders **no money token** under any profile … prices are simply not in the chit
    // data model." K-4 carries the structural half (`tsc` over the data contract) and ran this
    // heuristic over its minimal chit; what is new here is the SURFACES — a modifier line, a
    // banner, a timestamp, a four-digit quantity — none of which existed when K-4 ran it.
    //
    // **What this test is NOT.** It does not sweep money-shaped strings into DECLARED owner slots:
    // a free-text header note renders what the owner typed, and `03-F32` is explicit that the
    // enforcement is structural ("the profile schema has no slot id addressing them"), not a
    // content filter on a value the owner supplied. That structural half is the next test.
    const cases: Readonly<Record<string, KotData>> = {
      plain: KOT_PLAIN,
      modifiers: KOT_MIXED_MODIFIERS,
      "reprint + removal": KOT_REPRINT_WITH_REMOVAL,
      full: KOT_FULL,
      // A quantity a currency formatter would render as `3,141.59` if anything on this path ever
      // treated a chit number as an amount (`00 §6`: money is integer paisa, and 314159 paisa is
      // Rs 3,141.59). The chit must print the count, not a formatted amount.
      "money-shaped quantity": {
        ...KOT_PLAIN,
        lines: [{ quantity: 314_159, name: NAME_A, modifiers: [] }],
      },
    };
    for (const [label, data] of Object.entries(cases)) {
      const text = documentText(renderKot(data, WIDE, label).blocks);
      const token = moneyTokenIn(text);
      expect(token, `${label}: the chit printed ${token} (03-F32)`).toBeNull();
    }
  });

  it("03-F32: NO SLOT the kot spec declares addresses money — the schema has no such id", () => {
    // The structural half, at K-5's own layer: "This is enforced structurally — **the profile
    // schema has no slot id addressing them** — not by a runtime check on a value the owner
    // supplied. The deepest POS in the market has **no price option anywhere** in its
    // kitchen-printer configuration." K-4 could not make this assertion usefully (its spec declared
    // two notes); K-5 is the task that adds slots to the KOT, and a `show_prices` toggle is the
    // exact thing this clause exists to keep out of the table.
    const declared = slotDeclarationsOf(kotSpec()).map((slot) => slot.slot_id);
    expect(
      declared.length,
      "the kot spec declares no slot at all — 03-F30's customisation surface is empty",
    ).toBeGreaterThan(0);
    for (const slot_id of declared) {
      expect(
        moneyAddressingWord(slot_id),
        `the kot spec declares the slot ${JSON.stringify(slot_id)}, which addresses money (03-F32)`,
      ).toBeNull();
    }
    // The control: the predicate the loop above runs must be able to say yes. Without it, a
    // detector that returned `null` for every input would pass the loop with the clause deleted.
    for (const forbidden of ["show_prices", "line_price", "grand_total", "currency_symbol"]) {
      expect(
        moneyAddressingWord(forbidden),
        `${forbidden} was not recognised as money`,
      ).not.toBeNull();
    }
  });

  it("03-F32: no profile value can suppress the identifier, a quantity, an item, or the band", () => {
    // "**Type invariants override configuration.**" The three facts below are each mandated by an
    // FR — `03-F3`'s order number and item lines, `27-F57`'s quantity, `03-F37`'s reprint marker —
    // so a slot that switches any of them off is a slot that must not exist.
    const spec = kotSpec();
    for (const { slot_id, value } of sweep()) {
      const profile = { ...shippedDefaultProfile(spec), [slot_id]: value };
      const label = `${slot_id}=${JSON.stringify(value)}`;
      const rendered = okOf(render(api, spec, profile, KOT_FULL, WIDE), label);
      const text = documentText(rendered.blocks);
      expect(has(text, TICKET_NO), `${label} suppressed the order number`).toBe(true);
      expect(has(text, "REPRINT"), `${label} suppressed the reprint band (03-F37)`).toBe(true);
      for (const line of KOT_FULL.lines) {
        expect(has(text, line.name), `${label} suppressed the item ${line.name}`).toBe(true);
        expect(
          text.includes(String(line.quantity)),
          `${label} suppressed the quantity of ${line.name} (27-F57)`,
        ).toBe(true);
      }
    }
  });

  it("27-F58: no profile value can reorder the ticket — the reading order is 'never configurable'", () => {
    // Structurally a profile cannot express order (K-4's type guard); this is the behavioural half,
    // and it is the one that catches a renderer that reads a slot and branches on it.
    const spec = kotSpec();
    const baseline = renderKot(KOT_FULL, WIDE, "baseline order");
    const orderOf = (rendered: Ok): number[] => {
      const lines = linesOf(rendered.blocks);
      return [TICKET_NO, NAME_A, "Onion", NAME_B, "Ginger"].map(
        (needle) => lineIndicesWith(lines, needle)[0] ?? -1,
      );
    };
    const expected = orderOf(baseline);
    expect(
      expected.every((index) => index >= 0),
      "a landmark is missing from the baseline",
    ).toBe(true);
    for (const { slot_id, value } of sweep()) {
      const profile = { ...shippedDefaultProfile(spec), [slot_id]: value };
      const label = `${slot_id}=${JSON.stringify(value)}`;
      const actual = orderOf(okOf(render(api, spec, profile, KOT_FULL, WIDE), label));
      const rank = (values: number[]): number[] =>
        values.map((value_) => values.filter((other) => other < value_).length);
      expect(rank(actual), `${label} reordered the ticket (27-F58)`).toEqual(rank(expected));
    }
  });
});

// ── 27-F62: paper is not a status surface ────────────────────────────────────────────────────────

describe("27-F62 — the chit states what was true at append time and nothing that will change", () => {
  it("27-F62: no order-line state word from `01 §4` is printed", () => {
    // "No state word that a later event contradicts." Every word checked is a canonical order-line
    // state the ticket's own order leaves within minutes of the paper being cut. `voided` and
    // `cancelled` are deliberately not on the list — `27-F56` allocates the banner scope to
    // `CANCEL`/`VOID`/`REPRINT`, and an exit state is not contradicted by a later event.
    //
    // The fixture carries no such word in its DATA, so anything found came from the template.
    for (const [label, data] of Object.entries({
      plain: KOT_PLAIN,
      full: KOT_FULL,
    })) {
      const text = documentText(renderKot(data as KotData, WIDE, label).blocks);
      for (const word of CONTRADICTABLE_STATE_WORDS) {
        expect(
          new RegExp(`\\b${word.replace(/[_ ]/g, "[_ ]")}\\b`, "i").test(text),
          `${label}: the chit prints the state word ${JSON.stringify(word)} (27-F62)`,
        ).toBe(false);
      }
    }
  });

  it("27-F62/03 §3: no forward-looking time is printed", () => {
    // "No 'ready at' that a delay invalidates" — and `03 §3` forbids the kitchen displaying ETAs at
    // all, which is the same rule on glass.
    const text = documentText(renderKot(KOT_FULL, WIDE, "no forward time").blocks);
    for (const token of FORWARD_LOOKING_TIME_TOKENS) {
      expect(has(text, token), `the chit prints ${JSON.stringify(token)} (27-F62)`).toBe(false);
    }
  });
});

// ── DEFERRED FROM K-5, DELIBERATELY (stated so each gap is a decision, not an omission) ──────────
//
// * THE PHYSICAL PASS (K-8). No printer exists. Nothing above has been on paper, and `03-F36`'s
//   "renders CORRECTLY at min_columns" is asserted as "placed no dot off a software page" —
//   correctness at 42 columns is a legibility claim and `27-F35`'s ≥85% comprehension gate is a
//   measurement on real staff. `27 §2b` is subordinate to that gate by its own words, and this
//   suite cannot run it. The rig also owes `03-F10`'s `GS B` solid-fill fidelity, without which
//   "inverted" is an assumption about ink rather than an observation.
// * `27-F35`'s COMPREHENSION GATE ITSELF. §2b opens by saying ZERO research exists on how
//   low-literacy adults parse printed operational tickets, and that it is "the part of doc 27 most
//   likely to be wrong". Every assertion above checks that the ticket is what §2b DESIGNED, never
//   that the design works.
// * `27-F56`'s RASTER CLAUSE, HANDED HERE BY K-2 AND THEN BY K-4, AND STILL OPEN. "An inverted band
//   drawn as a raster image rather than through `GS B` spends the same attention and must count
//   against the same scope." The KOT emits no raster, so the clause is UNREACHED rather than
//   closed: what is asserted above is that this document's inversions go through the budgeted parts,
//   not that a raster band anywhere would be counted. Closing it still needs a block to declare that
//   it IS a band, and `03-F30` says blocks are "typed" without naming a type. It belongs to whoever
//   puts a logo on a document (`03 §8`).
// * COURSE GROUPING (`03-F3`: "course grouping (starters/mains) optional, off by default"). It is
//   the one KOT layout feature that is explicitly a TOGGLE, so it is a `03-F30` slot — and `03-F3`
//   states no grouping rule, no ordering within a course, and no data field for a course. Asserting
//   it would need this oracle to invent all three.
// * `03-F39`'s `max_lines_per_chit` AND PAGINATION. Header ambiguity 9: per-printer, not per-profile,
//   and no FR states what a continued chit looks like.
// * ITEM NOTES AND `27-F58`'s "notes" STEP. Header ambiguities 2 and 3: `03-F3` wants them
//   "visually emphasized" and `27-F56` leaves no ink to do it with; `03-F8`'s July 2026 ruling
//   records that order notes are not wired in Wave 1 at all.
// * `CANCEL` AND `VOID` BANNERS. Header ambiguity 7 — named by `27-F56` and `03-F31`, put in no
//   KOT data contract by any FR. When one lands, the at-most-one-banner assertion above is the
//   test that will need extending, and `27-F56` is explicit about the answer ("a ticket with two
//   banners has none").
// * `03-F50`'s UNROUTED LINE. "Where no station resolves anywhere up the chain, the line prints on
//   the **default station's** ticket rather than vanishing." That is a ROUTING decision made before
//   a `KotData` exists — `sync-client` already owns `DEFAULT_STATION` — and this layer renders the
//   chit it is handed. Nothing above asserts which lines were selected.
// * `03-F2`'s FAN-OUT AND PER-PRINTER COPY COUNT. Same boundary: one `order.confirmed` becoming N
//   KOTs is the spooler's, and `render()` produces one document.
// * WHETHER THE STATION BELONGS ON THE PAPER. Header ambiguity 8.
// * `27-F55`'s "LESS INFORMATION THAN A PASS-SCREEN TICKET". No metric exists — see the header.
// * `03-F38`'s FALLBACK. "falling back to the display name" happens up the `01-F21` catalog chain,
//   before a `KotData` exists; `packages/sync-client` owns it and it has its own suite.
//
// ── ONE FINDING AGAINST K-4's SUITE, RAISED HERE RATHER THAN FIXED (24 §3 step 2) ──
//
// `render.test.ts`'s data-reachability walk ("03-F30/03-F31: the DATA axis reaches the document —
// every leaf of the shipped example is on paper") probes a NUMERIC leaf with `value + 1` and
// `value + 7`, and `27-F62` puts a MILLISECOND stamp on this contract. A ticket that prints its
// timestamp at any human granularity is unmoved by 7 ms, so that test reports
// `['kot.branch_created_at']` as a leaf the renderer never reads — **and it does so against a
// correct implementation.** It was reproduced: the out-of-tree K-5 layout above takes this file to
// 41/41 while failing that one assertion in `render.test.ts`, 201/202 across the package.
//
// This is the failure mode the round-3 law calls as damaging as a vacuous test, so it is raised
// before implementation rather than discovered during it. The fix belongs to K-4's test-owning
// session and is a probe, not a rule: a numeric leaf needs at least one probe large enough to move
// a formatted value (a day, say), or `branch_created_at` needs a row in
// `DATA_LEAVES_NOT_ON_PAPER` — and that constant's own comment says adding one is a finding for the
// test-owning session and never an edit by the implementer. **K-5's implementing session must not
// edit `render.test.ts` to get green.**
