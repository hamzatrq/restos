// Acceptance tests — K-2, the ESC/POS encoder: text, the three-level ink ladder, character sizes,
// cut, and the raster path.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `03-F8`  — printer fonts for English + numerals; the raster path for logos, QR and non-Latin
//              USER-CONTENT fields, "per-field, never dropped or transliterated"; and the verified
//              physical fact that no ESC/POS code page can print Urdu (CP1256 has 14/15 letters and
//              0/144 shaped forms; CP864 has 72/144 shaped forms and 0/15 letters).
//   `03-F35` — the fiscal QR is ALWAYS rasterised, never the native command; size computed from
//              dpi (7 mm legal floor, render 18–25 mm); the invoice number is an opaque token.
//   `03-F36` — absolute dot positioning and space-as-layout are BANNED.
//   `03-F34` — failure is a hard refusal plus an S1, never a silent degradation.
//   `03-F42` — a document is rendered whole, buffered and transmitted as ONE unit.
//   `03 §7`  — the capability record (`dpi`, `dots`, `raster_ok`, `has_cutter`, `has_native_qr`).
//   `27-F55`/`27-F56` — the four paper channels; the ink ladder, exactly three levels, allocated
//              once, platform-wide; bold is NOT a level; "a ticket that uses inversion twice has
//              used it zero times".
//   `18 §10` — hand-rolled encoder, no library.
//   `00 §5.6` — English-only interface text; user content is uncontrolled Unicode, rendered
//              faithfully, never transliterated or rejected for its script.
// No implementation was read; none exists beyond K-1's capability table.
// `plans/wave-1/kot-printing.md` was deliberately NOT read.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion is about bytes that were placed in a `Uint8Array`. Where a test says a command
// "is never emitted" it means the byte sequence is absent from the buffer, and nothing more. The
// physical claims this module rests on (that a cheap printer fails silently on `GS ( k`; that
// `GS B` solid fill varies per model) come from `03-F35` and `03-F10` and are rig work (`00 §4`),
// not test work. No test name here may be read as a measurement.
//
// ── WHAT IS GREEN ON THE RED RUN, AND WHY (stated so the count is not read as coverage) ──
//
// Most of this file fails on the RED run, each failure carrying a named "not implemented yet"
// error rather than a crash. A MINORITY PASS, and none of them observes the encoder:
//   * ORACLE SELF-TESTS feed hand-built byte streams to the walker and hand-built symbols to the
//     QR decoder, and assert each reports what it should. A scanner whose failures nobody has
//     demonstrated is worth nothing — and for the QR decoder that is not a general principle but
//     the specific reason it was added, so its controls (a correctly-sized all-black and all-white
//     rectangle must NOT decode) are the load-bearing ones in this file.
//   * one is the `03-F36` positive control, for the same reason.
//   * one — "BOLD IS NOT A LEVEL … no bold or emphasis surface" — is a scan over the package's
//     EXISTING exports and is green because K-1's nine exports contain no such name. It carries
//     K-1's non-vacuity guard (the scan fails if the module exports nothing at all), which is the
//     precise defect K-1 recorded against its own paper-width scan. It is named here so nobody
//     reads it as evidence that the ladder was checked.
//
// ── WHY THERE IS A WALKER, AND WHY A RAW BYTE SCAN WOULD BE A TAUTOLOGY ──
//
// "A byte assertion needs a reason." Two reasons drive the decoder below rather than golden
// fixtures:
//
//   1. A GOLDEN FIXTURE PINS BYTES NOBODY DERIVED. `27-F56` does not name an opcode; it names a
//      LADDER. So the assertion that means something is "this run printed at 2× width and 2×
//      height with reverse off", which requires decoding `GS !`/`ESC !` rather than pinning
//      `1d 21 11`. The FR supplies the requirement; the published ESC/POS command set supplies the
//      opcode; every opcode below is named with its standard mnemonic so a reviewer can check it
//      against the standard rather than against this file.
//   2. A RAW `indexOf(ESC $)` SCAN IS UNSOUND THE MOMENT RASTER EXISTS. Raster payload is
//      arbitrary bytes, so `1b 24` occurs inside images by chance — a scan would report phantom
//      `03-F36` violations, and the natural "fix" (only scanning text-only documents) is the
//      "guard passed by not looking" shape. This is not hypothetical: it is exactly `03-F42`'s
//      device-side hazard ("a real-time byte sequence occurring inside raster data is executed as
//      a command") restated at the test layer. The walker skips length-declared payloads, so the
//      ban scan is sound over documents that contain images. There is a self-test for precisely
//      that below.
//
// The walker is an ALLOWLIST, for the reason K-1 landed on for its refusal keys: an absence
// cannot be stated completely by guessing names. Every admitted command carries the FR that buys
// it. **If the implementing session needs a command this list does not admit, that is a finding
// for this session (24-F5) — never a test edit.**
//
// ── FR AMBIGUITIES AND CONFLICTS, REPORTED RATHER THAN FILLED ──
//
//  1. **RULED, and this file was rewritten to follow it (`9416265`).** The first version of this
//     suite reported that `27-F56` and `27-F59` could not both hold: `27-F56` reserved inversion
//     for "the single most consequential fact on the ticket and nothing else" while `27-F59` gave
//     EVERY removal modifier the inverted marker, and an order with two removals — or one removal
//     on a REPRINT — satisfied neither. The founder ruled the budget is **per SCOPE, and there are
//     exactly two**: a banner (`CANCEL`/`VOID`/`REPRINT`) at most once per DOCUMENT, a removal
//     marker at most once per ITEM BLOCK. The ruling's *reason* is what the assertions encode,
//     because it is what makes the rule predict cases nobody has enumerated: **"used it twice" is
//     about competing for the SAME GLANCE**, and `27-F58` fixes the reading order so a cook reads
//     one dish at a time. So the budget is not a count over a document — it is a count within a
//     glance, and a glance needs a KEY. That is why an item-scoped part carries an opaque
//     `item_block` and a banner does not.
//     **Nothing the ruling left strict was widened.** Two banners and two markers inside one item
//     block are still refused, each with its own reason code, each with its own named test, and
//     the enumeration asserts that both refusal classes were actually exercised — a ruling that
//     widens a rule is the easiest place to widen a test past it by accident.
//  2. **What counts as ONE use of inversion.** Still not stated in words. `27-F56`'s own examples
//     are BANDS and a band can need two lines, so a use is read here as a maximal CONTIGUOUS run
//     of parts sharing one scope key (`feed` transparent), not as a part. The ruling supports this
//     from the other side: `27-F59` now says "an item with two removals carries one marker
//     covering both", which is exactly two adjacent item-scoped parts printing as one band.
//  3. **May an inverted run also be 2×2?** `27-F56` says "exactly three levels" and gives each a
//     distinct allocation, so they are read here as mutually exclusive rungs — combining two
//     makes a fourth. Not stated in words.
//  3b. **Adjacent inversions of DIFFERENT scope.** A banner immediately followed by a removal
//     marker with nothing between them is two facts; an encoder that left `GS B` on across both
//     would print one continuous black band, i.e. two facts read as one — the exact failure
//     `27-F56` is about. So the byte law below is "one `GS B` region per USE", which requires the
//     encoder to break the region at a scope change. `27-F58`'s reading order means this never
//     arises on a real ticket; it arises in the enumeration, and a test cannot be left undefined
//     on a case it generates.
//  4. **`27-F56` vs `27-F57` on the quantity's size.** `27-F56` puts the quantity at 2×2;
//     `27-F57` says it sits "immediately left of the item name on the same line, **at the same
//     size**". Read literally the name would also be 2×2 — but `27-F57`'s own July 2026 correction
//     computes "a two-digit quantity at `27-F56`'s 2× width costs 4 columns, leaving ~27 for the
//     name" out of 32, which is arithmetic only the quantity-doubled reading produces. Reported;
//     the layout is K-5's, so nothing here asserts it.
//  5. **RULED: Wave 1 does not walk the raster TEXT path (`f3316b3`).** The first version of this
//     suite asserted that a non-Latin user field was rasterised, not transliterated and not
//     dropped — and every one of those is satisfied by a correctly-sized blank containing no
//     legible glyphs. Identical to the QR trap below, found the same way. The founder verified
//     that no Wave-1 input path can produce non-Latin text (item names are back-office English,
//     `note` is unwired, customer names arrive only with docs `06`/`07`/`C18`) and ruled the
//     encoder REFUSES the field — `raster_font_unavailable`, distinct from `raster_unavailable`.
//     `00 §5.6` is untouched and still binds, so this is a SEQUENCING state and not a policy.
//     The tension with `18 §10` is thereby postponed rather than resolved: `18 §10` says per-field
//     rasterisation "breaks the `name | price` column grid — the one row whose alignment carries
//     the meaning" and leaves whole-document rasterisation "open, and not to be specified before
//     it is measured". Whoever builds the font path owns that, not this suite.
//  6. **`03-F35` states no maximum payload.** Physical size is fixed at 18–25 mm while a QR's
//     module count grows with data, so above some payload length no integer module size lands in
//     the band. The FR gives no bound and no behaviour there. Untested; the fixtures below are
//     realistic invoice payloads. The decode assertion makes this reachable rather than
//     theoretical — a payload large enough to force sub-dot modules will now fail loudly.
//  6b. **`03-F35` says nothing about the QUIET ZONE, and this suite cannot catch a missing one.**
//     A QR needs a 4-module white border to be locatable by a real scanner. `decodeQr` pads with
//     32 white dots because on paper the surrounding stock IS that border. Measured while writing
//     this: `jsqr` decodes the fixture with the padding set to ZERO as well, so the suite would
//     not catch a QR printed flush against a text line either way — the padding is faithful to
//     paper, not load-bearing for the assertion. The border belongs to whatever composes the
//     fiscal block around the symbol, i.e. K-4/K-5. Named in DEFERRED so it is not read as covered.
//  7. **`has_native_qr` has no sanctioned reader — RULED: it STAYS (`9416265`).** `03 §7` declares
//     it and `03-F35` forbids the only regulated use of a native QR. The founder ruled the record
//     describes what a printer CAN do while `03-F35` decides what we DO, so a later non-fiscal QR
//     can read it without re-deriving the capability. The safety property that makes an unread
//     field harmless is asserted below and must stay: two records differing ONLY in that flag emit
//     byte-identical output, so the field cannot change behaviour by accident.
//  8. **`raster_ok: false` — K-1 deliberately left the direction unpinned.** K-2 pins the
//     CONSEQUENCE only, and derives it: `03-F35` forbids the native fallback and `03-F34` forbids
//     silent degradation, so a document needing raster on a printer that cannot raster has no
//     third outcome. It is refused. What `raster_ok` should DEFAULT to for an unknown model is
//     still open and still K-1's.
//  9. **Nothing says what a `has_cutter: false` document ends with.** `03-F10` records that the
//     BC-58U — a named baseline target — has a manual tear bar and calibrates head-to-cutter
//     distance per model, so a ticket presumably feeds clear of the head. No FR states it. This
//     suite asserts only that no cut command is emitted.
// 10. **`03-F42`'s `GS ( D` clause has no owning K-task.** "A real-time byte sequence occurring
//     inside raster data is executed as a command and corrupts the image unless disabled via
//     `GS ( D`." The encoder is the only layer that can bracket its own raster. The command is
//     admitted by the walker so the implementer is not blocked; nothing here requires it, because
//     the brief assigns `03-F42` to no task. See DEFERRED.
// 11. **`03-F36`'s space-as-layout ban is not self-consistent read at the byte level.** The FR
//     declares `left | right` as the TOP of its own degradation ladder while banning both absolute
//     positioning and space-as-layout — and on a character-mode ESC/POS printer those are the only
//     two mechanisms that put two things at opposite margins of one line. The reading that makes
//     the FR coherent is that the ban is on padding AUTHORED INTO a spec (which is what makes a
//     document "permanently unreflowable", the FR's own gloss), not on a renderer computing the
//     fill from the live column count. That is a `DocumentSpec` matter, which K-1 already deferred
//     to K-4/K-5. K-2 asserts only the encoder-level half: the encoder never inserts a space the
//     caller did not supply.

import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import * as escpos from "../index.js";
import {
  ENCODE_REFUSAL_KEYS,
  type EncodeResult,
  type EncoderPart,
  type EscposK2Api,
  encode,
  INK_LEVELS_PER_27_F56,
  INK_SCOPES_PER_27_F56,
  inkLevels,
  inkScopes,
} from "./encoder-oracle-surface.js";
import { type EscposK1Api, type PrinterCapability, printerCapabilities } from "./oracle-surface.js";

const api = escpos as unknown as EscposK2Api;
const k1 = escpos as unknown as EscposK1Api;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ORACLE: an independent ESC/POS walker.
//
// It is not the encoder and shares no code with it. It answers three questions the FRs ask and
// raw bytes cannot: what printed at which ink level, where the raster payloads are (so the ban
// scan can skip them), and whether any byte in the stream is unaccounted for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Sequences that must never appear. Each row cites the FR that bans it; the opcode identity comes
 * from the published ESC/POS command set.
 */
const BANNED: readonly { seq: readonly number[]; name: string; why: string }[] = [
  { seq: [0x1d, 0x28, 0x6b], name: "GS ( k", why: "native 2D-barcode (QR) function set — 03-F35" },
  { seq: [0x1d, 0x6b], name: "GS k", why: "native barcode command — 03-F35, same failure class" },
  { seq: [0x1b, 0x24], name: "ESC $", why: "set absolute print position — 03-F36" },
  { seq: [0x1d, 0x24], name: "GS $", why: "set absolute vertical print position — 03-F36" },
  { seq: [0x1b, 0x5c], name: "ESC \\", why: "set relative print position — 03-F36" },
  { seq: [0x1d, 0x5c], name: "GS \\", why: "set relative vertical print position — 03-F36" },
  { seq: [0x1b, 0x44], name: "ESC D", why: "set horizontal tab stops — 03-F36 space-as-layout" },
  { seq: [0x09], name: "HT", why: "horizontal tab — 03-F36 space-as-layout" },
  { seq: [0x1b, 0x4c], name: "ESC L", why: "select page mode — positioning is absolute, 03-F36" },
  { seq: [0x1b, 0x57], name: "ESC W", why: "set page-mode print area — 03-F36" },
];

/**
 * The admitted command set, one row per command, each with the FR that buys it. This list is the
 * `03-F36` ban made total: anything outside it is a violation whatever it is called.
 *
 *   `ESC @`   initialise            — `03-F30` purity: a document may not inherit printer state.
 *   `LF`      print and line feed   — `27-F58`: vertical position is a layout channel.
 *   `ESC d n` print and feed lines  — `27-F58`: "groups are separated by blank lines, not rules".
 *   `ESC a n` justification         — `03-F36` bans dot offsets, so this is the sanctioned
 *                                     alternative (named as such in K-1's deferred note).
 *   `ESC t n` code page             — `03-F8`: text prints via printer fonts.
 *   `GS ! n`  character size        — `27-F55` channel 2, `27-F56`'s 2×2 rung.
 *   `ESC ! n` print mode            — admitted because it also carries size; the emphasis bit it
 *                                     bundles is asserted OFF separately (`27-F56`: bold is not a
 *                                     level), which is why the walker decodes the bit rather than
 *                                     banning the command.
 *   `ESC E n` emphasis              — admitted only so that turning it OFF is expressible; the
 *                                     suite asserts it is never turned on.
 *   `GS B n`  white/black reverse   — `27-F55`'s inverted solid fill; `03-F10` names `GS B` by
 *                                     opcode ("`GS B` solid-fill fidelity, rig-calibrated").
 *   `GS V m`  cut                   — `03 §7`'s `has_cutter`, `03-F10`'s "cut and drawer kick".
 *   `GS v 0`  raster bit image      — `03-F8`'s raster path, `03 §8` "rasterized at the target dot
 *                                     width". Declares its own dimensions AND carries its payload
 *                                     contiguously, which is what makes `03-F35`'s size law and
 *                                     its DECODE assertion checkable at all.
 *   `ESC *`   bit image             — the same path in column format. Admitted for logos; the QR
 *                                     decode path requires `GS v 0` (see `decodeQr`).
 *   `GS ( D`  real-time enable      — `03-F42`'s raster corruption clause.
 *
 * Deliberately NOT admitted, with reasons: `GS ( L` / `GS 8 L` graphics (an Epson-family
 * extension; `03-F10`'s baseline compatibility set is "Black Copper BC-58U/85AC + generic Chinese
 * printers", and `03-F35`'s whole argument is that a capability cheap firmware lacks fails
 * SILENTLY); `CR` (its behaviour is a configuration on real firmware, so it is not deterministic
 * layout); `ESC J` (a dot feed, i.e. a vertical measure `03-F36` expresses in lines).
 */
type Size = { w: number; h: number };

type WalkEvent =
  | { t: "text"; value: string; size: Size; reverse: boolean; emphasis: boolean }
  /**
   * `bits` is the command's payload, sliced out verbatim. It is carried because `03-F35`'s decode
   * assertion needs the actual modules, not only the symbol's size — see `decodeQr`. For `GS v 0`
   * the layout is row-major, MSB first, one bit per dot, 1 = black.
   */
  | { t: "raster"; command: string; width_dots: number; height_dots: number; bits: Uint8Array }
  | { t: "cut"; command: string }
  | { t: "feed"; lines: number }
  | { t: "command"; name: string };

type Walk = {
  events: WalkEvent[];
  violations: string[];
  /** off → on transitions of `GS B`. `27-F56`'s "twice" counted in bytes. */
  reverse_starts: number;
  emphasis_ever_on: boolean;
  final: { size: Size; reverse: boolean; emphasis: boolean };
};

const hex = (n: number): string => `0x${n.toString(16).padStart(2, "0")}`;

const walk = (bytes: Uint8Array): Walk => {
  const events: WalkEvent[] = [];
  const violations: string[] = [];
  let size: Size = { w: 1, h: 1 };
  let reverse = false;
  let emphasis = false;
  let reverse_starts = 0;
  let emphasis_ever_on = false;
  let pending = "";
  let pendingSize: Size = { w: 1, h: 1 };
  let pendingReverse = false;
  let pendingEmphasis = false;

  const at = (index: number): number => bytes[index] ?? -1;

  const flush = (): void => {
    if (pending === "") return;
    events.push({
      t: "text",
      value: pending,
      size: pendingSize,
      reverse: pendingReverse,
      emphasis: pendingEmphasis,
    });
    pending = "";
  };

  const truncated = (start: number, length: number, name: string): boolean => {
    if (start + length <= bytes.length) return false;
    violations.push(`${name} is truncated at offset ${start}`);
    return true;
  };

  const setReverse = (on: boolean): void => {
    if (on && !reverse) reverse_starts += 1;
    reverse = on;
  };

  const setEmphasis = (on: boolean): void => {
    if (on) emphasis_ever_on = true;
    emphasis = on;
  };

  let i = 0;
  while (i < bytes.length) {
    const banned = BANNED.find((row) => row.seq.every((value, k) => at(i + k) === value));
    if (banned) {
      flush();
      violations.push(`${banned.name} at offset ${i} — ${banned.why}`);
      i += banned.seq.length;
      continue;
    }

    const b = at(i);
    if (b >= 0x20 && b <= 0x7e) {
      if (pending === "") {
        pendingSize = { ...size };
        pendingReverse = reverse;
        pendingEmphasis = emphasis;
      }
      pending += String.fromCharCode(b);
      i += 1;
      continue;
    }

    flush();

    if (b === 0x0a) {
      events.push({ t: "feed", lines: 1 });
      i += 1;
      continue;
    }

    if (b === 0x1b) {
      const m = at(i + 1);
      if (m === 0x40) {
        size = { w: 1, h: 1 };
        reverse = false;
        emphasis = false;
        events.push({ t: "command", name: "ESC @" });
        i += 2;
        continue;
      }
      if (m === 0x61 || m === 0x74) {
        if (truncated(i, 3, m === 0x61 ? "ESC a" : "ESC t")) break;
        events.push({ t: "command", name: m === 0x61 ? "ESC a" : "ESC t" });
        i += 3;
        continue;
      }
      if (m === 0x64) {
        if (truncated(i, 3, "ESC d")) break;
        events.push({ t: "feed", lines: at(i + 2) });
        i += 3;
        continue;
      }
      if (m === 0x45) {
        if (truncated(i, 3, "ESC E")) break;
        setEmphasis((at(i + 2) & 1) === 1);
        events.push({ t: "command", name: "ESC E" });
        i += 3;
        continue;
      }
      if (m === 0x21) {
        if (truncated(i, 3, "ESC !")) break;
        const n = at(i + 2);
        setEmphasis((n & 0x08) !== 0);
        size = { w: (n & 0x20) !== 0 ? 2 : 1, h: (n & 0x10) !== 0 ? 2 : 1 };
        events.push({ t: "command", name: "ESC !" });
        i += 3;
        continue;
      }
      if (m === 0x2a) {
        if (truncated(i, 5, "ESC *")) break;
        const mode = at(i + 2);
        const columns = at(i + 3) + at(i + 4) * 256;
        const rows = mode === 32 || mode === 33 ? 24 : 8;
        const payload = columns * (rows / 8);
        if (truncated(i, 5 + payload, "ESC * data")) break;
        events.push({
          t: "raster",
          command: "ESC *",
          width_dots: columns,
          height_dots: rows,
          bits: bytes.slice(i + 5, i + 5 + payload),
        });
        i += 5 + payload;
        continue;
      }
      violations.push(`ESC ${hex(m)} at offset ${i} — not in the K-2 allowlist`);
      i += 2;
      continue;
    }

    if (b === 0x1d) {
      const m = at(i + 1);
      if (m === 0x21) {
        if (truncated(i, 3, "GS !")) break;
        const n = at(i + 2);
        size = { w: ((n >> 4) & 0x07) + 1, h: (n & 0x07) + 1 };
        events.push({ t: "command", name: "GS !" });
        i += 3;
        continue;
      }
      if (m === 0x42) {
        if (truncated(i, 3, "GS B")) break;
        setReverse((at(i + 2) & 1) === 1);
        events.push({ t: "command", name: "GS B" });
        i += 3;
        continue;
      }
      if (m === 0x56) {
        if (truncated(i, 3, "GS V")) break;
        const mode = at(i + 2);
        const extra = [65, 66, 97, 98, 103, 104].includes(mode) ? 1 : 0;
        if (truncated(i, 3 + extra, "GS V")) break;
        events.push({ t: "cut", command: `GS V ${mode}` });
        i += 3 + extra;
        continue;
      }
      if (m === 0x76 && at(i + 2) === 0x30) {
        if (truncated(i, 8, "GS v 0")) break;
        const width_bytes = at(i + 4) + at(i + 5) * 256;
        const height_dots = at(i + 6) + at(i + 7) * 256;
        const payload = width_bytes * height_dots;
        if (truncated(i, 8 + payload, "GS v 0 data")) break;
        events.push({
          t: "raster",
          command: "GS v 0",
          width_dots: width_bytes * 8,
          height_dots,
          bits: bytes.slice(i + 8, i + 8 + payload),
        });
        i += 8 + payload;
        continue;
      }
      if (m === 0x28 && at(i + 2) === 0x44) {
        if (truncated(i, 5, "GS ( D")) break;
        const payload = at(i + 3) + at(i + 4) * 256;
        if (truncated(i, 5 + payload, "GS ( D parameters")) break;
        events.push({ t: "command", name: "GS ( D" });
        i += 5 + payload;
        continue;
      }
      violations.push(`GS ${hex(m)} at offset ${i} — not in the K-2 allowlist`);
      i += 2;
      continue;
    }

    violations.push(`stray byte ${hex(b)} at offset ${i} — not in the K-2 allowlist`);
    i += 1;
  }
  flush();

  return {
    events,
    violations,
    reverse_starts,
    emphasis_ever_on,
    final: { size, reverse, emphasis },
  };
};

const textRuns = (w: Walk): Extract<WalkEvent, { t: "text" }>[] =>
  w.events.filter((e): e is Extract<WalkEvent, { t: "text" }> => e.t === "text");

const printedText = (w: Walk): string =>
  textRuns(w)
    .map((e) => e.value)
    .join("");

const rasters = (w: Walk): Extract<WalkEvent, { t: "raster" }>[] =>
  w.events.filter((e): e is Extract<WalkEvent, { t: "raster" }> => e.t === "raster");

const cuts = (w: Walk): Extract<WalkEvent, { t: "cut" }>[] =>
  w.events.filter((e): e is Extract<WalkEvent, { t: "cut" }> => e.t === "cut");

type Raster = Extract<WalkEvent, { t: "raster" }>;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE SECOND ORACLE: a QR DECODER.
//
// ── WHY THIS EXISTS (founder ruling, July 2026) ──
//
// `03-F35` makes the fiscal invoice number an OPAQUE token — "never parsed, reconstructed or
// shape-validated" — and this suite honoured that. The consequence, found while preparing to
// implement against it, is that every other QR assertion here (rasterised not native, square,
// 18–25 mm at the target dpi, byte-identical across `has_native_qr`) IS SATISFIED BY A CORRECTLY
// SIZED BLACK RECTANGLE. On a QR whose absence "is an offence that can seal the premises", a
// document that looks compliant, passes CI and does not scan is the worst failure available —
// the same class `03-F35` already refuses to accept for the native command. Ruled: take a decoder
// dependency and assert the symbol decodes.
//
// ── WHY `jsqr` ──
//
// `jsqr@1.4.0` is pure JavaScript, takes an RGBA buffer directly (`data`, `width`, `height`) and
// needs no canvas, DOM or native binding, so it runs in the plain node vitest environment this
// package already uses — no new environment, no new global setup. It is also a DECODER ONLY,
// which is the property that matters for an oracle: it cannot become a reference implementation
// that a future edit compares the encoder against byte-for-byte. `packages/escpos` also carries
// `qrcode` (the implementing session's encoder-side dependency) and this file DELIBERATELY does
// not import it — encoding with the same library the implementation encodes with would make the
// assertion a tautology.

/** A generous white border. QR requires a 4-module quiet zone; at these module sizes 32 dots
 *  clears it comfortably. See the DEFERRED note — supplying it here is also what makes this
 *  suite unable to catch a QR printed flush against a text line. */
const QR_QUIET_DOTS = 32;

/**
 * Expand a `GS v 0` raster (row-major, MSB first, 1 = black) into RGBA and decode it.
 *
 * Returns `null` when nothing decodes, which is the answer the positive controls below require —
 * a decoder that threw instead would make "a blank does not decode" indistinguishable from "the
 * test crashed".
 */
const decodeQr = (symbol: Raster): { data: string; binaryData: number[] } | null => {
  if (symbol.command !== "GS v 0") return null;
  const width = symbol.width_dots + QR_QUIET_DOTS * 2;
  const height = symbol.height_dots + QR_QUIET_DOTS * 2;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const bytes_per_row = symbol.width_dots / 8;
  for (let y = 0; y < symbol.height_dots; y++) {
    for (let x = 0; x < symbol.width_dots; x++) {
      const byte = symbol.bits[y * bytes_per_row + (x >> 3)] ?? 0;
      if (((byte >> (7 - (x & 7))) & 1) !== 1) continue;
      const offset = ((y + QR_QUIET_DOTS) * width + (x + QR_QUIET_DOTS)) * 4;
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
    }
  }
  const result = jsQR(rgba, width, height);
  return result === null ? null : { data: result.data, binaryData: result.binaryData };
};

/**
 * A version-1 (21×21) QR for `QR_FIXTURE_PAYLOAD`, as a static matrix.
 *
 * It is a FIXTURE, not a reference encoder: its only job is to prove that `decodeQr`'s bit
 * expansion, quiet zone and RGBA conversion are correct, so that when the real assertion fails
 * everyone knows the encoder is at fault rather than this file. Its correctness is asserted by the
 * suite itself (it must decode to the payload below), so it needs no trust and no provenance
 * beyond that. Generated once at authoring time and pasted here precisely so that no QR ENCODER is
 * a test-time dependency.
 */
const QR_FIXTURE_PAYLOAD = "RESTOS-K2-ORACLE";
const QR_FIXTURE_MATRIX = [
  "#######.####..#######",
  "#.....#.#..##.#.....#",
  "#.###.#.#..##.#.###.#",
  "#.###.#.#..##.#.###.#",
  "#.###.#..#....#.###.#",
  "#.....#..##...#.....#",
  "#######.#.#.#.#######",
  ".........#.#.........",
  "#.###.#.#..###...####",
  "##..#..#.#####.#.....",
  "..#.#.###.##.##.##.##",
  "...#........##..#...#",
  "###...#..###...#...##",
  "........#....#..####.",
  "#######..#..###..#...",
  "#.....#..#.##..#.....",
  "#.###.#.#.#.....##.#.",
  "#.###.#.#.#.###..####",
  "#.###.#.#.#.#.##..#.#",
  "#.....#..####....#..#",
  "#######.#...##.......",
];

/**
 * Pack a module matrix into the `GS v 0` layout at `scale` dots per module — the same layout the
 * walker reads back, so the controls exercise the identical path the real assertion does.
 *
 * Note the width rounding: 21 modules × 7 dots = 147, which is NOT a byte multiple, so the row is
 * padded to 152 dots with 5 white columns. That is the awkward case the encoder will hit at
 * 203 dpi, and the control below covers it on purpose.
 */
const packMatrix = (matrix: readonly string[], scale: number): Raster => {
  const modules = matrix.length;
  const content_dots = modules * scale;
  const width_bytes = Math.ceil(content_dots / 8);
  const bits = new Uint8Array(width_bytes * content_dots);
  for (let y = 0; y < content_dots; y++) {
    const row = matrix[Math.floor(y / scale)] ?? "";
    for (let x = 0; x < content_dots; x++) {
      if (row[Math.floor(x / scale)] !== "#") continue;
      const index = y * width_bytes + (x >> 3);
      bits[index] = (bits[index] ?? 0) | (0x80 >> (x & 7));
    }
  }
  return {
    t: "raster",
    command: "GS v 0",
    width_dots: width_bytes * 8,
    height_dots: content_dots,
    bits,
  };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A capability record built from `03 §7`'s own fields. Defaults describe a wide 203 dpi printer;
 * every test that cares about a flag overrides it explicitly, so no assertion rides on a default
 * it did not name.
 */
const caps = (over: Partial<PrinterCapability> = {}): PrinterCapability => ({
  model_id: "FIXTURE-576",
  dots: 576,
  dpi: 203,
  cols_font_a: 48,
  cols_font_b: 64,
  has_native_qr: false,
  has_cutter: true,
  raster_ok: true,
  ...over,
});

/** `00 §5.6`: "customer-entered data … may contain Urdu script". */
const URDU_NAME = "احمد خان";
/** `03-F8` "Numerals Western" meets `00 §5.6` "never transliterated" — this is user content. */
const ARABIC_INDIC_DIGITS = "٢٥";
const LATIN_NAME = "Ahmed Khan";

/** `03-F35`: "FBR's own documents give three different formats" — so here are three. */
const FISCAL_TOKEN = "0123456789012345678901234567890123";
const OPAQUE_FISCAL_TOKENS = [
  FISCAL_TOKEN,
  "INV-2026-07-30-000142",
  "b7c1f0e2-3d4a-4f55-9a11-2c8e6d0f7a93",
];

const normal = (value: string): EncoderPart => ({ kind: "text", value, ink: "normal" });
const big = (value: string): EncoderPart => ({ kind: "text", value, ink: "size_2x2" });
/** `27-F56` banner scope — `CANCEL`, `VOID`, `REPRINT`. One per DOCUMENT. */
const banner = (value: string): EncoderPart => ({
  kind: "text",
  value,
  ink: "inverted",
  scope: "banner",
});
/** `27-F56` item scope via `27-F59` — a removal marker. One per ITEM BLOCK. */
const removal = (value: string, item_block: string): EncoderPart => ({
  kind: "text",
  value,
  ink: "inverted",
  scope: "item",
  item_block,
});
const feed = (lines = 1): EncoderPart => ({ kind: "feed", lines });
const userText = (value: string): EncoderPart => ({ kind: "user_text", value });
const fiscalQr = (payload: string): EncoderPart => ({ kind: "fiscal_qr", payload });
const logo = (): EncoderPart => ({
  kind: "image",
  width_dots: 128,
  height_dots: 64,
  bits: new Uint8Array((128 / 8) * 64).fill(0x5a),
});

const expectBytes = (parts: readonly EncoderPart[], record: PrinterCapability): Uint8Array => {
  const result: EncodeResult = encode(api, parts, record);
  expect(result.ok, `encode refused: ${result.ok ? "" : result.reason}`).toBe(true);
  if (!result.ok) throw new Error("unreachable — the assertion above has already failed");
  return result.bytes;
};

const walkOf = (parts: readonly EncoderPart[], record: PrinterCapability): Walk =>
  walk(expectBytes(parts, record));

const refusalOf = (
  parts: readonly EncoderPart[],
  record: PrinterCapability,
): Extract<EncodeResult, { ok: false }> => {
  const result: EncodeResult = encode(api, parts, record);
  expect(result.ok, "expected a refusal and the encoder produced bytes").toBe(false);
  if (result.ok) throw new Error("unreachable — the assertion above has already failed");
  return result;
};

/**
 * Every document this suite encodes successfully, so the cross-cutting laws (`03-F36`'s bans,
 * `27-F56`'s bold ban, the end-state law) can be asserted over ALL of them rather than over one
 * example each. Non-vacuity is asserted where the corpus is consumed.
 */
const CORPUS: readonly { name: string; parts: EncoderPart[]; record: PrinterCapability }[] = [
  { name: "empty document", parts: [], record: caps() },
  {
    name: "a KOT-shaped ticket",
    parts: [
      big("#142"),
      feed(2),
      big("2"),
      normal(" Chicken Karahi"),
      feed(),
      normal("  no chillies"),
      feed(2),
      normal("19:42"),
      feed(3),
      { kind: "cut" },
    ],
    record: caps({ model_id: "WIDE-576" }),
  },
  {
    name: "a ticket with one inverted banner",
    parts: [banner("REPRINT"), feed(2), normal("1 Naan"), feed(3), { kind: "cut" }],
    record: caps(),
  },
  {
    // The document the two-scope ruling exists for, and which NO reading of the old FRs accepted:
    // a REPRINT band plus a removal marker on each of two dishes. Three inversions, three glances,
    // legal. It is in the corpus so the cross-cutting laws (bold off, clean walk, purity, default
    // end state) are checked against the shape the ruling introduced, not only against the old one.
    name: "a reprinted ticket with a removal on each of two items",
    parts: [
      banner("REPRINT"),
      feed(2),
      big("2"),
      normal(" Chicken Karahi"),
      feed(),
      removal("  NO PEANUT", "item-1"),
      feed(2),
      big("1"),
      normal(" Daal"),
      feed(),
      removal("  NO DAIRY", "item-2"),
      feed(3),
      { kind: "cut" },
    ],
    record: caps({ model_id: "TWO-SCOPES-576" }),
  },
  {
    name: "a receipt carrying a fiscal QR",
    parts: [normal("TOTAL 1,250"), feed(2), fiscalQr(FISCAL_TOKEN), feed(3)],
    record: caps({ model_id: "FISCAL-576" }),
  },
  {
    // Latin only, since `03-F8`'s July 2026 ruling refuses a non-Latin field and the corpus holds
    // documents that ENCODE. The refusal has its own tests in the `03-F8` block.
    name: "a document carrying Latin user-content fields",
    parts: [normal("Name: "), userText(LATIN_NAME), feed(), userText("Bilal Ahmed"), feed(2)],
    record: caps(),
  },
  {
    name: "a document carrying a logo",
    parts: [logo(), feed(2), normal("RestOS")],
    record: caps(),
  },
  {
    name: "a document on a printer with no cutter",
    parts: [normal("BILL"), feed(4), { kind: "cut" }],
    record: caps({ model_id: "BC-58U-CLASS", has_cutter: false, dots: 384, cols_font_a: 32 }),
  },
  {
    name: "a document on a printer that reports a native QR",
    parts: [fiscalQr(OPAQUE_FISCAL_TOKENS[1] ?? FISCAL_TOKEN), feed(2)],
    record: caps({ model_id: "CLAIMS-NATIVE-QR", has_native_qr: true }),
  },
];

/**
 * The GLANCE a part competes in, or `null` if it is not inverted. This is the whole of the
 * two-scope ruling in one function: a banner competes with every other banner on the document, and
 * a removal marker competes only with the other markers on ITS item.
 */
const glanceKey = (part: EncoderPart): string | null => {
  if (part.kind !== "text" || part.ink !== "inverted") return null;
  return part.scope === "banner" ? "banner" : `item:${part.item_block}`;
};

/**
 * `27-F56`'s budget as an oracle: one entry per USE of inversion, in order. A use is a maximal
 * CONTIGUOUS run of parts sharing one glance key, with `feed` transparent — so a two-line REPRINT
 * band is one use, and `27-F59`'s "an item with two removals carries one marker covering both" is
 * one use (ambiguity 2 in the header).
 */
const inversionUses = (parts: readonly EncoderPart[]): string[] => {
  const uses: string[] = [];
  let previous: string | null = null;
  for (const part of parts) {
    if (part.kind === "feed") continue;
    const key = glanceKey(part);
    if (key !== null && key !== previous) uses.push(key);
    previous = key;
  }
  return uses;
};

/** Every glance the document spends inversion in more than once — i.e. every budget breach. */
const overspentGlances = (parts: readonly EncoderPart[]): string[] => {
  const counts = new Map<string, number>();
  for (const key of inversionUses(parts)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([key]) => key);
};

/**
 * The reason each breach must produce. Where a document breaches BOTH scopes the suite asserts the
 * reason is one of them rather than pinning a priority — no FR states an order, and inventing one
 * would be a test written to pass.
 */
const reasonForGlance = (key: string): string =>
  key === "banner" ? "banner_budget_exceeded" : "item_marker_budget_exceeded";

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the oracle itself — the walker can fail, and it skips raster payloads", () => {
  // These are the only tests in this file that do not touch the package. They are GREEN on the RED
  // run by design: a scanner whose failures nobody has demonstrated is worth nothing, and a
  // scanner that reports phantom violations inside image data is worse than none.

  it("oracle: a stream of admitted commands walks clean", () => {
    const clean = new Uint8Array([
      0x1b, 0x40, 0x1d, 0x21, 0x11, 0x34, 0x32, 0x1d, 0x21, 0x00, 0x20, 0x4b, 0x0a, 0x1d, 0x56,
      0x00,
    ]);
    const w = walk(clean);
    expect(w.violations).toEqual([]);
    expect(printedText(w)).toBe("42 K");
    expect(cuts(w).length).toBe(1);
  });

  it("oracle: every banned sequence is reported BY NAME, so a failure says which FR it broke", () => {
    for (const row of BANNED) {
      const stream = new Uint8Array([0x1b, 0x40, ...row.seq, 0x00, 0x00]);
      const w = walk(stream);
      expect(
        w.violations.some((v) => v.startsWith(`${row.name} `)),
        `${row.name} was not reported: ${JSON.stringify(w.violations)}`,
      ).toBe(true);
    }
    expect(BANNED.length).toBeGreaterThan(0);
  });

  it("oracle: a code-page byte outside raster payload is reported, and never becomes text", () => {
    // The control for `03-F8`'s high-byte scan. 0xd8 0xa7 is ALEF in CP1256 — the byte pair an
    // encoder emits if it tries to print Urdu as text instead of rasterising it.
    const w = walk(new Uint8Array([0x1b, 0x40, 0x41, 0xd8, 0xa7, 0x42]));
    expect(w.violations.filter((v) => /stray byte 0x[89a-f]/.test(v)).length).toBe(2);
    expect(printedText(w)).toBe("AB");
  });

  it("oracle: an unadmitted command is reported rather than skipped", () => {
    // `ESC p` (drawer kick) is a real command deliberately outside K-2's set — `03-F9` gives the
    // kick to the POS, not to the document encoder.
    const w = walk(new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
    expect(w.violations.length).toBeGreaterThan(0);
    expect(w.violations[0]).toContain("ESC 0x70");
  });

  it("oracle: a banned sequence INSIDE raster payload is NOT reported — the ban scan is sound over images", () => {
    // This is the whole reason the walker exists. `1b 24` is `ESC $`; here it is image data. A
    // naive `indexOf` scan reports a phantom `03-F36` violation, and `03-F42` says the printer has
    // the same problem with real-time sequences in raster.
    const payload = [0x1b, 0x24, 0x1b, 0x24, 0x1d, 0x24, 0x09, 0x1d];
    const stream = new Uint8Array([
      0x1d,
      0x76,
      0x30,
      0x00,
      0x01,
      0x00, // width = 1 byte
      0x08,
      0x00, // height = 8 dots  → payload = 8 bytes
      ...payload,
    ]);
    const w = walk(stream);
    expect(w.violations).toEqual([]);
    expect(rasters(w).length).toBe(1);
    expect(rasters(w)[0]?.width_dots).toBe(8);
    expect(rasters(w)[0]?.height_dots).toBe(8);

    // …and the naive scan this replaces really would have fired, which is why the assertion above
    // is meaningful rather than trivially satisfiable.
    const naive = [...stream].some((v, k) => v === 0x1b && stream[k + 1] === 0x24);
    expect(naive, "the payload does not actually contain ESC $, so the test proves nothing").toBe(
      true,
    );
  });

  it("oracle: it decodes the ink ladder — size, reverse and emphasis are read, not guessed", () => {
    const w = walk(
      new Uint8Array([
        0x1d, 0x21, 0x11, 0x41, 0x1d, 0x21, 0x00, 0x1d, 0x42, 0x01, 0x42, 0x1d, 0x42, 0x00, 0x1b,
        0x45, 0x01, 0x43,
      ]),
    );
    const runs = textRuns(w);
    expect(runs.map((r) => r.value)).toEqual(["A", "B", "C"]);
    expect(runs[0]?.size).toEqual({ w: 2, h: 2 });
    expect(runs[1]?.reverse).toBe(true);
    expect(runs[2]?.emphasis).toBe(true);
    expect(w.reverse_starts).toBe(1);
    expect(w.emphasis_ever_on).toBe(true);
  });

  it("oracle: the QR decode path reads a real symbol back, at three module scales", () => {
    // Proves `decodeQr` itself — bit expansion, the byte-boundary row padding, the quiet zone and
    // the RGBA conversion. Without this, a bug in the expander is indistinguishable from a bug in
    // the encoder, and on a RED run there is no encoder to rule out.
    //
    // 7 dots/module is the awkward one and the one the encoder will actually hit at 203 dpi:
    // 21 × 7 = 147 content dots padded to 152 (19 bytes), i.e. five white columns the decoder must
    // not read as modules.
    for (const scale of [4, 7, 9]) {
      const symbol = packMatrix(QR_FIXTURE_MATRIX, scale);
      const decoded = decodeQr(symbol);
      expect(decoded?.data, `the fixture did not decode at ${scale} dots per module`).toBe(
        QR_FIXTURE_PAYLOAD,
      );
    }
    expect(packMatrix(QR_FIXTURE_MATRIX, 7).width_dots).toBe(152);
    expect(packMatrix(QR_FIXTURE_MATRIX, 7).height_dots).toBe(147);
  });

  it("oracle: A CORRECTLY SIZED BLANK DOES NOT DECODE — all-black and all-white both fail", () => {
    // THE CONTROL THE WHOLE DECODE ASSERTION RESTS ON. Every other QR property in this file is
    // satisfied by a black rectangle of the right dimensions, so unless a blank of exactly those
    // dimensions provably fails to decode, the decode assertion is decoration.
    const good = packMatrix(QR_FIXTURE_MATRIX, 7);
    const blank = (fill: number): Raster => ({
      ...good,
      bits: new Uint8Array(good.bits.length).fill(fill),
    });

    // The blanks are the same size as a symbol that DOES decode — asserted, so the control cannot
    // pass by being some other shape entirely.
    expect(decodeQr(good)?.data).toBe(QR_FIXTURE_PAYLOAD);
    for (const [name, fill] of [
      ["all-black", 0xff],
      ["all-white", 0x00],
    ] as const) {
      const rectangle = blank(fill);
      expect(rectangle.width_dots).toBe(good.width_dots);
      expect(rectangle.height_dots).toBe(good.height_dots);
      expect(decodeQr(rectangle), `a ${name} rectangle decoded as a QR`).toBeNull();
    }
  });

  it("oracle: a symbol with one finder pattern erased does not decode — structure is not enough", () => {
    // The blanks above are the extremes. This is the near-miss: a symbol that has the right size,
    // the right module grid and most of its data, and is still not a QR. It rules out a decoder
    // that returns something for anything sufficiently textured.
    const good = packMatrix(QR_FIXTURE_MATRIX, 7);
    const damaged: Raster = { ...good, bits: Uint8Array.from(good.bits) };
    const bytes_per_row = good.width_dots / 8;
    for (let y = 0; y < 7 * 7; y++) {
      for (let bx = 0; bx < 7; bx++) damaged.bits[y * bytes_per_row + bx] = 0;
    }
    expect(decodeQr(damaged), "a symbol missing its top-left finder decoded anyway").toBeNull();
  });

  it("oracle: a raster that is not GS v 0 is refused by the decode path rather than misread", () => {
    // `ESC *` is admitted for logos and has a different payload geometry. Feeding it to `decodeQr`
    // must fail loudly-by-null rather than produce a plausible wrong answer.
    const good = packMatrix(QR_FIXTURE_MATRIX, 7);
    expect(decodeQr({ ...good, command: "ESC *" })).toBeNull();
  });

  it("oracle: it counts inversion USES, not GS B bytes — two bands are two, a re-assert is one", () => {
    const twoBands = walk(
      new Uint8Array([
        0x1d, 0x42, 0x01, 0x41, 0x1d, 0x42, 0x00, 0x42, 0x1d, 0x42, 0x01, 0x43, 0x1d, 0x42, 0x00,
      ]),
    );
    expect(twoBands.reverse_starts).toBe(2);
    const oneBandReasserted = walk(
      new Uint8Array([0x1d, 0x42, 0x01, 0x41, 0x1d, 0x42, 0x01, 0x42, 0x1d, 0x42, 0x00]),
    );
    expect(oneBandReasserted.reverse_starts).toBe(1);
  });
});

describe("27-F56 — the ink ladder is a closed vocabulary of exactly three levels", () => {
  it("27-F56: the package declares exactly three ink levels — inverted, 2×2, normal, and nothing else", () => {
    // Set equality, not a length check: `27-F55` puts FOUR values on the character-size channel
    // (1×, 2× width, 2× height, 2×2) and three on the ink-density one (normal, bold, inverted),
    // and `27-F56` allocates exactly three rungs out of those seven. A vocabulary that swapped
    // `size_2x2` for a width-only rung would still have three members.
    const levels = inkLevels(api);
    expect([...levels].sort()).toEqual([...INK_LEVELS_PER_27_F56].sort());
  });

  it("27-F56: BOLD IS NOT A LEVEL — the package exports no bold or emphasis surface at all", () => {
    // "at 203 dpi on 48 GSM the difference between bold and normal is unreliable across the
    // printers we actually support, and a distinction the hardware may not render is worse than no
    // distinction." The level vocabulary is pinned by set equality above; this catches the OTHER
    // way bold gets in — a helper beside the ladder, which is how a fourth rung usually arrives.
    // The byte-level half (emphasis is never switched on) is asserted over the whole corpus below.
    const exported = Object.keys(escpos as unknown as Record<string, unknown>);
    expect(exported.length, "nothing is exported, so this scan proves nothing").toBeGreaterThan(0);
    expect(exported.filter((name) => /bold|emphas/i.test(name))).toEqual([]);
  });
});

describe("27-F56 — the three levels at the byte level", () => {
  it("27-F56: a normal run prints at 1×1 with reverse off", () => {
    const runs = textRuns(walkOf([normal("Chicken Karahi")], caps()));
    expect(runs.length).toBe(1);
    expect(runs[0]?.value).toBe("Chicken Karahi");
    expect(runs[0]?.size).toEqual({ w: 1, h: 1 });
    expect(runs[0]?.reverse).toBe(false);
  });

  it("27-F56: the 2×2 rung is doubled on BOTH axes — not 2× width, not 2× height", () => {
    // `27-F55` makes 2× width and 2× height separately available, so "2×2" is a choice among four
    // and an encoder that doubled one axis would satisfy a laxer assertion. Both axes, asserted
    // separately, is the assertion that tells them apart.
    const runs = textRuns(walkOf([big("#142")], caps()));
    expect(runs.length).toBe(1);
    expect(runs[0]?.value).toBe("#142");
    expect(runs[0]?.size.w, "the 2×2 rung is not doubled in width").toBe(2);
    expect(runs[0]?.size.h, "the 2×2 rung is not doubled in height").toBe(2);
    expect(runs[0]?.reverse).toBe(false);
  });

  it("27-F56: the inverted rung prints reversed, and is a DISTINCT rung from 2×2, not a combination", () => {
    // Ambiguity 3 in the header: "exactly three levels" is read as three mutually exclusive rungs.
    const runs = textRuns(walkOf([banner("VOID")], caps()));
    expect(runs.length).toBe(1);
    expect(runs[0]?.value).toBe("VOID");
    expect(runs[0]?.reverse).toBe(true);
    expect(runs[0]?.size, "inversion also doubled the type — that is a fourth rung").toEqual({
      w: 1,
      h: 1,
    });
  });

  it("27-F56: the three rungs are three DIFFERENT byte streams — a rung that encodes to nothing is not a rung", () => {
    // The failure this catches is an encoder that accepts `ink` and ignores it. Same text, three
    // levels, three streams — and none of them equal. The rungs are listed here rather than mapped
    // over `INK_LEVELS_PER_27_F56` because the two-scope ruling made `inverted` a part SHAPE and
    // not a bare tag: an inversion cannot be written without saying which glance it competes in.
    const rungs: readonly EncoderPart[] = [normal("SAME"), big("SAME"), banner("SAME")];
    expect(rungs.length, "a rung was dropped from the comparison").toBe(
      INK_LEVELS_PER_27_F56.length,
    );
    const streams = rungs.map((part) => [...expectBytes([part], caps())].join(","));
    expect(new Set(streams).size, "two ink levels encode identically").toBe(rungs.length);
  });

  it("27-F56: two ink levels can share one line, which is what 27-F57's item line requires", () => {
    // `27-F57`: the quantity sits "immediately left of the item name on the same line". With
    // `27-F56` putting the quantity at 2×2 and the name at normal, one line must carry two rungs —
    // so a text part is a RUN and not a line (the interpretation declared in the oracle surface).
    // The layout itself is K-5's; what is asserted here is only that the encoder can express it.
    const w = walkOf([big("2"), normal(" Chicken Karahi"), feed()], caps());
    const runs = textRuns(w);
    expect(runs.length).toBe(2);
    expect(runs[0]?.size).toEqual({ w: 2, h: 2 });
    expect(runs[1]?.size).toEqual({ w: 1, h: 1 });
    // No line feed between them: the two runs are on ONE line. Asserted against the position of
    // the caller's own `feed`, which must therefore exist — otherwise `findIndex` returns -1 and
    // the comparison would be satisfied by a document that emitted no line breaks at all.
    const kinds = w.events.map((e) => e.t);
    const firstFeed = kinds.indexOf("feed");
    expect(firstFeed, "the caller's feed was not emitted").toBeGreaterThanOrEqual(0);
    expect(
      kinds.lastIndexOf("text"),
      "a line feed was emitted between the quantity and the name",
    ).toBeLessThan(firstFeed);
  });
});

describe("27-F56 — the ink budget is per SCOPE, and there are exactly two", () => {
  it("27-F56: the package declares exactly two ink scopes — banner and item", () => {
    // The ruling's words: "the budget is *per scope*, and there are exactly two". A third scope
    // would be a third glance nobody allocated, which is `27-F14`'s "the first module to ship
    // cannot spend it by accident" applied to paper.
    expect([...inkScopes(api)].sort()).toEqual([...INK_SCOPES_PER_27_F56].sort());
  });

  it("27-F56: one banner produces exactly one inversion in the bytes", () => {
    const w = walkOf([banner("REPRINT"), feed(2), normal("1 Naan")], caps());
    expect(w.reverse_starts).toBe(1);
  });

  it("27-F56: a banner spanning two lines is ONE use, not two", () => {
    // Ambiguity 2 in the header, asserted so the reading is visible: `27-F56`'s own examples are
    // BANDS and a band can need two lines. The rejected alternative — counting inverted PARTS —
    // would refuse this document, which no FR asks for and which the ruling's "one marker covering
    // both" now contradicts outright.
    const w = walkOf([banner("VOID — DO NOT"), feed(), banner("MAKE THIS")], caps());
    expect(w.reverse_starts).toBe(1);
  });

  it('27-F56 BANNER SCOPE, STILL STRICT: "a ticket with two banners has none" — the second is REFUSED', () => {
    // The half of the original rule the ruling did NOT relax, and the FR restates it in exactly
    // those words. Two banners are in one glance no matter where they sit on the ticket.
    const refusal = refusalOf(
      [banner("REPRINT"), feed(), normal("1 Naan"), feed(), banner("VOID")],
      caps({ model_id: "TWO-BANNERS" }),
    );
    expect(refusal.reason).toBe("banner_budget_exceeded");
    expect(refusal.severity).toBe("S1"); // 03-F34: a hard refusal plus an S1 band
    expect(refusal.model_id).toBe("TWO-BANNERS");
  });

  it("27-F59 ITEM SCOPE, STILL STRICT: two separate markers inside ONE item block are REFUSED", () => {
    // The other half the ruling did not relax: "two inversions inside one item block are in a
    // single glance, which is the case `27-F56`'s budget actually forbids." Same item key, two
    // non-contiguous markers — which is what an encoder produces if it renders each removal as its
    // own band instead of composing one, and it is precisely the shape `27-F59` now names.
    const refusal = refusalOf(
      [
        big("2"),
        normal(" Chicken Karahi"),
        feed(),
        removal("  NO PEANUT", "item-1"),
        feed(),
        normal("  extra raita"),
        feed(),
        removal("  NO DAIRY", "item-1"),
      ],
      caps({ model_id: "TWO-MARKERS-ONE-DISH" }),
    );
    expect(refusal.reason).toBe("item_marker_budget_exceeded");
    expect(refusal.severity).toBe("S1");
    expect(refusal.model_id).toBe("TWO-MARKERS-ONE-DISH");
  });

  it("27-F59: an item with two removals carries ONE marker covering both — contiguous, so one use", () => {
    // The FR's own sentence, and the reason the strict test above is about SEPARATE markers rather
    // than about two removals. Composed into one band, the same two removals are legal.
    const w = walkOf(
      [big("2"), normal(" Chicken Karahi"), feed(), removal("  NO PEANUT, NO DAIRY", "item-1")],
      caps(),
    );
    expect(w.reverse_starts).toBe(1);
  });

  it("27-F56 THE RELAXATION: a removal on each of two DIFFERENT items is legal — they are not one glance", () => {
    // The ruling's reason, asserted rather than paraphrased: "a cook reads one dish at a time, so a
    // removal on the second dish is never in the same glance as a removal on the first". Under the
    // pre-ruling reading this document was refused; under the ruling it must print, and the bytes
    // must carry BOTH markers — an encoder that accepted the document and dropped one inversion
    // would satisfy a decision-only assertion.
    const w = walkOf(
      [
        big("2"),
        normal(" Chicken Karahi"),
        feed(),
        removal("  NO PEANUT", "item-1"),
        feed(2),
        big("1"),
        normal(" Daal"),
        feed(),
        removal("  NO DAIRY", "item-2"),
      ],
      caps(),
    );
    expect(w.reverse_starts, "one of the two removal markers was dropped").toBe(2);
  });

  it("27-F56 THE RELAXATION: a REPRINT banner and a removal marker coexist — different scopes, different glances", () => {
    // The exact document that satisfied NEITHER FR before the ruling, named because it is the one
    // that forced it: "an order with two removals — or one removal on a reprint — satisfied
    // neither."
    const w = walkOf(
      [banner("REPRINT"), feed(2), normal("1 Daal"), feed(), removal("  NO DAIRY", "item-1")],
      caps(),
    );
    expect(w.reverse_starts).toBe(2);
  });

  it("27-F56/03-F34: the refusal hands back NO BYTES — there is no degraded ticket to print anyway", () => {
    // K-1's allowlist idiom, for K-1's reason: "never a silent degradation" is an assertion about
    // ABSENCE, and a denylist of field names cannot state an absence completely. The specific leak
    // is a refusal that also carries `bytes`, which lets a caller print the over-inked ticket.
    const refusal = refusalOf(
      [banner("A"), normal("x"), banner("B")],
      caps({ model_id: "TWO-BANNERS" }),
    );
    expect([...Object.keys(refusal)].sort()).toEqual([...ENCODE_REFUSAL_KEYS].sort());
    expect(Object.keys(refusal), "the refusal carries a printable payload").not.toContain("bytes");
  });

  it("27-F56/03-F34: the leak guard FIRES — a refusal carrying bytes or a degraded document is rejected", () => {
    // A positive control, because the assertion above is about absence and an absence check that
    // cannot fail is worth nothing. Both shapes are synthesised HERE; no implementation is asked
    // to produce them.
    const refusal = refusalOf([banner("A"), normal("x"), banner("B")], caps());
    const undeclared = (value: object): string[] =>
      Object.keys(value).filter((key) => !(ENCODE_REFUSAL_KEYS as readonly string[]).includes(key));

    expect(undeclared(refusal), "the real refusal must be clean").toEqual([]);
    expect(undeclared({ ...refusal, bytes: new Uint8Array([0x1b, 0x40]) })).toEqual(["bytes"]);
    expect(undeclared({ ...refusal, parts: [{ kind: "text" }] })).toEqual(["parts"]);
  });

  it("27-F56: enumerated over every document of four parts, the two-scope budget holds — bytes and decision agree", () => {
    // The FR states a property of a DOCUMENT, so it is asserted over documents: 5^4 = 625 of them,
    // built from a normal run, a line feed, a banner, and a removal marker on each of two items.
    // The alphabet is chosen so the enumeration generates all four classes the ruling distinguishes
    // — two banners (refused), two markers on one item (refused), markers on two items (accepted),
    // and a banner beside a marker (accepted) — and the counters below assert each class was
    // actually generated, because a ruling that widens a rule is the easiest place to widen a test
    // past it by accident.
    //
    // Two independent laws per document, not one: the DECISION must match the budget, and where the
    // document is accepted the BYTES must carry exactly one `GS B` region per use. Checking only
    // the decision would let an encoder accept a legal document and silently drop an inversion.
    const alphabet: readonly EncoderPart[] = [
      normal("ITEM"),
      feed(),
      banner("REPRINT"),
      removal("NO PEANUT", "item-1"),
      removal("NO DAIRY", "item-2"),
    ];
    let refusedBanner = 0;
    let refusedItem = 0;
    let acceptedWithTwoOrMoreUses = 0;
    let accepted = 0;

    for (let code = 0; code < 625; code++) {
      const parts: EncoderPart[] = [];
      let n = code;
      for (let slot = 0; slot < 4; slot++) {
        const choice = alphabet[n % 5];
        if (choice) parts.push(choice);
        n = Math.floor(n / 5);
      }
      const uses = inversionUses(parts);
      const overspent = overspentGlances(parts);
      const label = `document ${code} (uses ${JSON.stringify(uses)})`;
      const result: EncodeResult = encode(api, parts, caps());

      expect(result.ok, label).toBe(overspent.length === 0);
      if (result.ok) {
        expect(walk(result.bytes).reverse_starts, label).toBe(uses.length);
        accepted += 1;
        if (uses.length >= 2) acceptedWithTwoOrMoreUses += 1;
      } else {
        expect(overspent.map(reasonForGlance), label).toContain(result.reason);
        if (result.reason === "banner_budget_exceeded") refusedBanner += 1;
        if (result.reason === "item_marker_budget_exceeded") refusedItem += 1;
      }
    }
    // Every class the ruling distinguishes must actually have been exercised. An enumeration that
    // only ever took one arm is oracle round 2's A13, and one that stopped generating the newly
    // legal shape would silently stop testing the ruling at all.
    expect(accepted, "no document was accepted").toBeGreaterThan(0);
    expect(refusedBanner, "the two-banner refusal was never exercised").toBeGreaterThan(0);
    expect(refusedItem, "the two-markers-on-one-item refusal was never exercised").toBeGreaterThan(
      0,
    );
    expect(
      acceptedWithTwoOrMoreUses,
      "no document with two legal inversions — the ruling is untested",
    ).toBeGreaterThan(0);
  });

  it("27-F56: a raster part spends NO inversion budget — which is why the document-scope clause is not enforceable here", () => {
    // `27-F56`'s July 2026 clause: "the budget is a property of the DOCUMENT, not of a command. An
    // inverted band drawn as a raster image rather than through `GS B` spends the same attention
    // and must count against the same scope."
    //
    // This test PINS THE BOUNDARY rather than closing the clause, and says so: a document made
    // only of raster parts emits zero `GS B` transitions, so every guard in this file — and every
    // guard an encoder could write — is blind to a mostly-black bitmap. The encoder receives
    // opaque bits and cannot know whether they are a logo, a customer's name in Urdu, or a VOID
    // band; only a document knows what role a block plays. See DEFERRED: the clause is K-4's and
    // K-5's, and this assertion is what makes the gap visible instead of assumed.
    const w = walkOf([logo(), feed(2), fiscalQr(FISCAL_TOKEN)], caps());
    expect(rasters(w).length, "the raster-only document produced no raster").toBeGreaterThan(0);
    expect(w.reverse_starts, "a raster part spent the GS B budget the guards count").toBe(0);
  });
});

describe("03-F8 — printer fonts for interface text, the raster path for everything else", () => {
  it("03-F8: interface text prints as text — no raster command for an English line", () => {
    const w = walkOf([normal("TABLE 4"), feed()], caps());
    expect(printedText(w)).toContain("TABLE 4");
    expect(rasters(w), "an English line was rasterised").toEqual([]);
  });

  it("03-F8/00 §5.6: a LATIN user-content field prints as text — rasterising it would be per-document, not per-field", () => {
    // `03-F8` routes per FIELD, and `18 §10` leaves whole-document rasterisation open pending a rig
    // measurement of `03-N1`'s 2 s budget. A customer named in Latin script goes through the
    // printer font.
    const w = walkOf([userText(LATIN_NAME), feed()], caps());
    expect(printedText(w)).toContain(LATIN_NAME);
    expect(rasters(w)).toEqual([]);
  });

  it("03-F8: a NON-LATIN user-content field is REFUSED — Wave 1 does not walk the raster text path", () => {
    // Founder ruling July 2026 (`f3316b3`), and it exists because of the same trap the fiscal QR
    // had. The assertion this replaces required a raster, no transliteration and no code-page
    // bytes — and **all three are satisfied by a correctly-sized blank containing no legible
    // glyphs.** Rendering Urdu needs a font AND a shaping engine because the script is positional
    // (`03-F8`'s own argument for why character mode cannot do it), and nothing at the encoder
    // layer can stand in for legibility. Until a font is chosen the honest behaviour is `03-F34`'s
    // hard refusal, so that is what is asserted.
    const refusal = refusalOf([userText(URDU_NAME)], caps({ model_id: "NO-URDU-FONT" }));
    expect(refusal.reason).toBe("raster_font_unavailable");
    expect(refusal.severity).toBe("S1");
    expect(refusal.model_id).toBe("NO-URDU-FONT");
  });

  it("03-F8/03-F50: the non-Latin field never vanishes into a SUCCESSFUL document", () => {
    // `03-F50`'s failure class survives the ruling unchanged — "a line silently absent from every
    // ticket is the one failure the paper cannot reveal" — it is just satisfied by a loud refusal
    // now instead of by a raster. The defect this rules out is an encoder that skips the field it
    // cannot render and prints the rest: the ticket would look complete and be missing a name.
    //
    // Asserted as BOTH halves, because either alone is weak: the document must not encode, and it
    // must specifically not encode to the same bytes as the document without the field, which is
    // the signature of a silent drop.
    const parts = [normal("Name"), feed(), userText(URDU_NAME)];
    const result: EncodeResult = encode(api, parts, caps());
    expect(result.ok, "the non-Latin field was skipped and the rest printed").toBe(false);

    const without = expectBytes([normal("Name"), feed()], caps());
    if (result.ok) {
      expect(
        [...result.bytes].join(","),
        "the field vanished — byte-identical without it",
      ).not.toBe([...without].join(","));
    }
  });

  it("03-F8/00 §5.6: Arabic-Indic numerals in user content are refused too — never converted to Western", () => {
    // `03-F8` ends "Numerals Western", which governs interface numerals. `00 §5.6` governs user
    // content and is UNTOUCHED by the ruling: "never transliterated or rejected for its script".
    // So a customer note carrying ٢٥ must not come back as "25" — and since the raster path is not
    // walked in Wave 1, the remaining honest outcome is the same refusal. Named separately from
    // the Urdu case because the tempting shortcut here is different and much easier to reach: a
    // digit transliteration table is three lines of code and looks harmless.
    const refusal = refusalOf([userText(ARABIC_INDIC_DIGITS)], caps());
    expect(refusal.reason).toBe("raster_font_unavailable");
  });

  it("03-F8: routing is still PER FIELD — a Latin field prints and one non-Latin field refuses the document", () => {
    // The ruling did NOT collapse the two paths. The distinction is now the load-bearing one in
    // this area: a document of Latin user fields encodes through the printer font, and adding ONE
    // non-Latin field to that same document refuses it. A refusal that swallowed Latin too would
    // strand every customer name in the system, and nothing else in this file would catch it.
    const latinOnly = walkOf(
      [normal("Name: "), userText(LATIN_NAME), feed(), userText("Bilal Ahmed"), feed()],
      caps(),
    );
    expect(printedText(latinOnly)).toContain(LATIN_NAME);
    expect(printedText(latinOnly)).toContain("Bilal Ahmed");
    expect(rasters(latinOnly), "a Latin user field was rasterised").toEqual([]);

    const withOneNonLatin = refusalOf(
      [normal("Name: "), userText(LATIN_NAME), feed(), userText(URDU_NAME), feed()],
      caps(),
    );
    expect(withOneNonLatin.reason).toBe("raster_font_unavailable");
  });

  it("03-F8: no code-page byte reaches the wire — every document, scanned raw where it can be", () => {
    // The positive form of `03-F8`'s physical law. A byte above 0x7E in the command stream is a
    // code-page glyph, and the FR proves no code page renders Urdu: CP1256 carries 14/15 letters
    // and 0/144 shaped forms, CP864 carries 72/144 shaped forms and 0/15 letters. So such a byte
    // is either mojibake or a silently wrong glyph, and it is exactly what an encoder produces if
    // it tries to `ESC t` its way out of the raster path.
    //
    // NOT ASSERTED VIA THE WALKER'S TEXT RUNS, and the reason is that the first version of this
    // test did: the walker only ever admits 0x20..0x7E into a text run, so "no text run holds a
    // high byte" is true by construction of the oracle — a tautology with extra steps. A
    // document with no raster is scanned RAW instead; only where raster payload (arbitrary bytes
    // by nature) is present does the assertion fall back to the walker's classification.
    let scannedRaw = 0;
    let scannedAroundRaster = 0;
    for (const entry of CORPUS) {
      const bytes = expectBytes(entry.parts, entry.record);
      const w = walk(bytes);
      if (rasters(w).length === 0) {
        expect(
          [...bytes].filter((b) => b >= 0x80),
          `${entry.name}: a code-page byte reached the wire`,
        ).toEqual([]);
        scannedRaw += 1;
      } else {
        expect(
          w.violations.filter((v) => /stray byte 0x[89a-f]/.test(v)),
          `${entry.name}: a code-page byte outside the raster payload`,
        ).toEqual([]);
        scannedAroundRaster += 1;
      }
    }
    // Both arms must have run, or the corpus has quietly stopped covering one of the two cases.
    expect(scannedRaw, "no text-only document in the corpus").toBeGreaterThan(0);
    expect(scannedAroundRaster, "no raster-bearing document in the corpus").toBeGreaterThan(0);
  });

  it("03-F8/03-F34: a MISSING FONT and a printer that CANNOT RASTER are told apart, not conflated", () => {
    // Two different failures with two different fixes: one is a dependency nobody shipped, the
    // other is a printer whose `03 §7` record says `raster_ok: false`. An S1 band that conflated
    // them would send a manager to check the cable over a missing font. Same argument that split
    // `banner_budget_exceeded` from `item_marker_budget_exceeded`.
    expect(refusalOf([userText(URDU_NAME)], caps({ raster_ok: true })).reason).toBe(
      "raster_font_unavailable",
    );
    expect(refusalOf([fiscalQr(FISCAL_TOKEN)], caps({ raster_ok: false })).reason).toBe(
      "raster_unavailable",
    );

    // Where BOTH hold, the reason must be one of the two and not a third thing. No FR states a
    // priority between them, so pinning one would be a test written to pass — the same call made
    // for a document that overspends both ink scopes.
    const both = refusalOf([userText(URDU_NAME)], caps({ raster_ok: false }));
    expect(["raster_font_unavailable", "raster_unavailable"]).toContain(both.reason);
    expect(both.severity).toBe("S1");
  });

  it("03-F8/00 §5.6/03-F34: a non-ASCII INTERFACE string is refused, not silently substituted", () => {
    // `00 §5.6` makes interface text English-only and gives user content its own channel, which is
    // why the encoder has two part kinds. A non-ASCII byte arriving on the interface channel is a
    // caller defect; emitting `?` for it is exactly the silent degradation `03-F34` bans, and it
    // would print a ticket that looks fine and says something else.
    const refusal = refusalOf([normal(`Table ${URDU_NAME}`)], caps({ model_id: "ASCII-ONLY" }));
    expect(refusal.reason).toBe("non_ascii_system_text");
    expect(refusal.severity).toBe("S1");
  });
});

describe("03-F35 — the fiscal QR is ALWAYS rasterised, never the native command", () => {
  it("03-F35: no capability record can make the encoder emit the native QR command — including one that reports it", () => {
    // The sharpest assertion in this file. "Cheap printers report no QR capability and fail
    // silently — printing nothing, or printing the raw payload as text. For a QR whose absence is
    // an offence that can seal the premises, a silent no-op is the worst available failure mode."
    // So the encoder must not be ABLE to take the fast path: the ban is asserted across every
    // shipped record and across a synthesised record whose `has_native_qr` is true.
    const records = [
      ...printerCapabilities(k1),
      caps({ model_id: "CLAIMS-NATIVE-QR", has_native_qr: true }),
      caps({ model_id: "CLAIMS-NATIVE-QR-58", has_native_qr: true, dots: 384, cols_font_a: 32 }),
    ];
    expect(records.length).toBeGreaterThan(1);
    let checked = 0;
    for (const record of records) {
      if (!record.raster_ok) continue; // that path is the refusal asserted below, not this one
      const w = walkOf([fiscalQr(FISCAL_TOKEN)], record);
      expect(w.violations, `${record.model_id} emitted a banned command`).toEqual([]);
      expect(rasters(w).length, `${record.model_id} produced no raster for the fiscal QR`).toBe(1);
      checked += 1;
    }
    expect(checked, "no record was exercised, so this proves nothing").toBeGreaterThan(0);
  });

  it("03-F35: a printer REPORTING a native QR still gets a raster — the capability is not consulted", () => {
    // Stated separately from the sweep because it is the specific defect `03-F35` was written
    // against: an encoder that reads `has_native_qr` and branches. Two records differing ONLY in
    // that flag must produce byte-identical fiscal QR output.
    const off = expectBytes([fiscalQr(FISCAL_TOKEN)], caps({ has_native_qr: false }));
    const on = expectBytes([fiscalQr(FISCAL_TOKEN)], caps({ has_native_qr: true }));
    expect([...on].join(","), "has_native_qr changed the emitted bytes").toBe([...off].join(","));
  });

  it("03-F35: the payload is never printed as text — the other half of the silent-failure pair", () => {
    // The FR names two silent failures: "printing nothing, or printing the raw payload as text".
    // The raster assertion covers the first; this covers the second.
    for (const token of OPAQUE_FISCAL_TOKENS) {
      const w = walkOf([fiscalQr(token)], caps());
      expect(printedText(w), "the fiscal payload was printed as text").not.toContain(token);
    }
  });

  it("03-F35: the QR's physical size is computed FROM DPI and lands in the 18–25 mm band at every dpi", () => {
    // "Size is computed from `dpi`; treat 7×7 mm as a legal floor and render 18–25 mm (FBR's own
    // technical spec asks ~0.7–1.0 inch, ~2.5× the SRO figure)." Height is the exact module extent
    // in `GS v 0`; width is byte-aligned, so it is asserted to within one byte of the height rather
    // than for equality — a QR symbol is square and the padding is the command's, not the design's.
    const dpis = [180, 203, 300, 360, 203, 400];
    let checked = 0;
    for (const dpi of dpis) {
      const w = walkOf([fiscalQr(FISCAL_TOKEN)], caps({ dpi, model_id: `D${dpi}` }));
      const symbol = rasters(w)[0];
      expect(symbol, `no raster emitted at ${dpi} dpi`).toBeDefined();
      if (!symbol) continue;
      const mm = (symbol.height_dots / dpi) * 25.4;
      expect(mm, `${dpi} dpi: below the 7 mm legal floor`).toBeGreaterThanOrEqual(7);
      expect(mm, `${dpi} dpi: below the 18 mm design floor`).toBeGreaterThanOrEqual(18);
      expect(mm, `${dpi} dpi: above the 25 mm design ceiling`).toBeLessThanOrEqual(25);
      expect(
        Math.abs(symbol.width_dots - symbol.height_dots),
        `${dpi} dpi: the symbol is not square within its byte alignment`,
      ).toBeLessThan(8);
      checked += 1;
    }
    expect(checked).toBe(dpis.length);
  });

  it("03-F35: the size is DERIVED from dpi, not a constant that happens to work at 203", () => {
    // A fixed dot count satisfies the band at exactly one dpi and silently shrinks the symbol
    // everywhere else: 147 dots is 18.4 mm at 203 dpi and 9.3 mm at 400, which is inside `03-F35`'s
    // 7 mm legal floor and nowhere near its 18 mm design floor.
    //
    // Asserted as NON-DECREASING and not strictly increasing, deliberately: a QR is a whole number
    // of modules and a module is a whole number of dots, so two nearby dpi values can legitimately
    // quantise to the same count (21 modules × 7 dots = 147, which is in band at both 180 and 203).
    // A strict step there would fail an honest encoder. The strict assertion is made across the
    // widest gap, where no quantisation can absorb it — and no constant can satisfy it.
    const sizes = [180, 203, 300, 400].map((dpi) => ({
      dpi,
      dots: rasters(walkOf([fiscalQr(FISCAL_TOKEN)], caps({ dpi })))[0]?.height_dots ?? 0,
    }));
    for (const row of sizes) {
      expect(row.dots, `${row.dpi} dpi produced no symbol`).toBeGreaterThan(0);
    }
    const dots = sizes.map((row) => row.dots);
    expect(dots, "the symbol loses dots as dpi rises").toEqual([...dots].sort((a, b) => a - b));
    expect(
      dots[dots.length - 1],
      "400 dpi emits no more dots than 180 dpi — the size is a constant",
    ).toBeGreaterThan(dots[0] ?? 0);
  });

  it("03-F35: THE EMITTED FISCAL QR ACTUALLY DECODES, back to its exact payload — every token", () => {
    // The assertion the rest of this block cannot make. Size, squareness, never-native and
    // byte-identical-across-`has_native_qr` are all satisfied by a correctly sized black rectangle;
    // this is the one that says the symbol is a QR and says the right thing. Founder ruling,
    // July 2026, after the gap was found while preparing to implement against this suite.
    //
    // Every token is checked, not one, so the assertion cannot pass by an encoder embedding a
    // single hardcoded symbol — and the decoded values are compared to the tokens, so it cannot
    // pass by embedding a valid QR of the WRONG payload either.
    expect(OPAQUE_FISCAL_TOKENS.length, "one token proves nothing").toBeGreaterThan(1);
    for (const token of OPAQUE_FISCAL_TOKENS) {
      const symbol = rasters(walkOf([fiscalQr(token)], caps()))[0];
      expect(symbol, `no raster emitted for ${token}`).toBeDefined();
      if (!symbol) continue;
      const decoded = decodeQr(symbol);
      expect(decoded, `the fiscal QR for "${token}" did not decode at all`).not.toBeNull();
      expect(decoded?.data, `the fiscal QR decoded to the wrong payload`).toBe(token);
      // "Byte for byte": `data` is the decoder's string reading, `binaryData` is the raw octets it
      // recovered. `03-F35`'s token is opaque, so the octets are what a regulator's scanner reads.
      expect(decoded?.binaryData, `the fiscal QR's octets differ from the token`).toEqual([
        ...new TextEncoder().encode(token),
      ]);
    }
  });

  it("03-F35: the QR still decodes at every dpi — module scaling does not destroy the symbol", () => {
    // The size law and the decode law interact: the encoder picks a module size in whole dots to
    // land inside 18–25 mm, and a bad rounding produces a symbol that measures correctly and
    // scans as nothing. Neither assertion catches that alone.
    for (const dpi of [180, 203, 300]) {
      const symbol = rasters(
        walkOf([fiscalQr(FISCAL_TOKEN)], caps({ dpi, model_id: `D${dpi}` })),
      )[0];
      expect(symbol, `no raster emitted at ${dpi} dpi`).toBeDefined();
      if (!symbol) continue;
      expect(decodeQr(symbol)?.data, `the QR emitted at ${dpi} dpi did not decode`).toBe(
        FISCAL_TOKEN,
      );
    }
  });

  it("03-F35: the invoice token is OPAQUE — three formats, none parsed, none rejected, none reshaped", () => {
    // "The fiscal invoice number is an opaque token — never parsed, reconstructed or
    // shape-validated, because FBR's own documents give three different formats." Asserted as: all
    // three encode, all three produce a symbol inside the size band, and the three streams differ
    // (a token that were discarded would produce identical bytes).
    const streams = OPAQUE_FISCAL_TOKENS.map((token) => {
      const bytes = expectBytes([fiscalQr(token)], caps());
      const symbol = rasters(walk(bytes))[0];
      expect(symbol, `token ${token} produced no symbol`).toBeDefined();
      return [...bytes].join(",");
    });
    expect(new Set(streams).size, "two different tokens encoded identically").toBe(
      OPAQUE_FISCAL_TOKENS.length,
    );
  });

  it("03-F35/03-F34: a printer that cannot raster REFUSES the fiscal QR — it never falls back to the native command", () => {
    // The worst available outcome the FR names is a silent no-op, and the second worst is the
    // native command on a printer that reports the capability and does not have it. Both records
    // below can do neither: the outcome is a refusal that names the printer.
    for (const has_native_qr of [false, true]) {
      const refusal = refusalOf(
        [fiscalQr(FISCAL_TOKEN)],
        caps({ model_id: "NO-RASTER", raster_ok: false, has_native_qr }),
      );
      expect(refusal.reason, `has_native_qr=${has_native_qr}`).toBe("raster_unavailable");
      expect(refusal.severity).toBe("S1");
      expect(refusal.model_id).toBe("NO-RASTER");
    }
  });
});

describe("03-F36 — absolute dot positioning and space padding never reach the wire", () => {
  it("03-F36: every document this suite encodes walks clean — no banned and no unaccounted byte", () => {
    // The cross-cutting form. `03-F36`'s ban is only meaningful applied to everything the encoder
    // can produce, and the walker's allowlist makes "no unaccounted byte" assertable at all: an
    // `x=384` offset is mid-line at 576 dots and off-paper at 384, so a stream carrying one is a
    // ticket that prints differently on two supported printers.
    expect(CORPUS.length).toBeGreaterThan(0);
    let walked = 0;
    for (const entry of CORPUS) {
      const w = walk(expectBytes(entry.parts, entry.record));
      expect(w.violations, `${entry.name}`).toEqual([]);
      walked += 1;
    }
    expect(walked).toBe(CORPUS.length);
  });

  it("03-F36: the encoder inserts no space the caller did not supply", () => {
    // The encoder-level half of the space-as-layout ban (ambiguity 11 in the header — the
    // `DocumentSpec` half is K-4's). An encoder that padded a run to a column boundary would make
    // every document it produced unreflowable, and the padding would be invisible in a snapshot.
    const runs = textRuns(walkOf([normal("A"), normal("B")], caps()));
    expect(runs.map((r) => r.value).join("")).toBe("AB");
  });

  it("03-F36: a hand-built stream carrying an absolute offset IS caught — the guard can fail", () => {
    // A positive control for the assertion above it. Without this, "no violations" is satisfied by
    // a walker that never looks, which is oracle round 2 §C pattern 2.
    // `ESC $ 0x80 0x01` is the FR's own example: x = 384.
    const offending = new Uint8Array([0x1b, 0x40, 0x1b, 0x24, 0x80, 0x01, 0x41]);
    const w = walk(offending);
    expect(w.violations[0], "the absolute offset was not reported first").toContain("ESC $");
    expect(w.violations[0]).toContain("03-F36");
    // Three, not one: the walker deliberately does not model a BANNED command's parameter framing,
    // so `nL nH` are reported as stray bytes as well. Louder is the right direction — a banned
    // command is a hard stop, not something to parse politely on the way past.
    expect(w.violations.length).toBe(3);
    expect(printedText(w), "the text after the offset was lost").toBe("A");
  });
});

describe("27-F56/03-F30/03-F42 — laws that hold over every document", () => {
  it("27-F56: emphasis is NEVER switched on, across every document this suite encodes", () => {
    // "Bold is not a level … a distinction the hardware may not render is worse than no
    // distinction." This is the byte-level half: whichever command the encoder uses for size
    // (`GS !` or `ESC !`), the emphasis bit stays clear. `ESC !` bundles emphasis into the same
    // byte as double-width, so this is reachable by arithmetic accident rather than by intent —
    // which is why it is asserted over everything rather than once.
    expect(CORPUS.length).toBeGreaterThan(0);
    for (const entry of CORPUS) {
      const w = walk(expectBytes(entry.parts, entry.record));
      expect(w.emphasis_ever_on, `${entry.name} turned bold on`).toBe(false);
      for (const run of textRuns(w)) {
        expect(run.emphasis, `${entry.name}: "${run.value}" printed bold`).toBe(false);
      }
    }
  });

  it("27-F56/03-F42: every document ends in the default state — no size or inversion leaks into the next job", () => {
    // `03-F42` makes a document one transmitted unit and the spooler sends jobs back to back, so a
    // residual `GS B 1` inverts the START of the next ticket. That failure is invisible in the
    // document that caused it, which is what makes it a whole-corpus assertion rather than a
    // per-test one.
    for (const entry of CORPUS) {
      const w = walk(expectBytes(entry.parts, entry.record));
      expect(w.final.reverse, `${entry.name} left inversion on`).toBe(false);
      expect(w.final.emphasis, `${entry.name} left emphasis on`).toBe(false);
      expect(w.final.size, `${entry.name} left the type doubled`).toEqual({ w: 1, h: 1 });
    }
  });

  it("03-F30: encoding is pure — the same parts and the same capability record give byte-identical output", () => {
    // "identical `(spec, profile, data, caps)` must produce byte-identical output … A shipped
    // competitor emits different tickets for the same order on two of its own devices." The
    // full-pipeline form belongs to K-4's `render()`; this is the encoder's own half, and it is
    // what catches a clock, a counter or a random id inside the byte layer.
    for (const entry of CORPUS) {
      const first = expectBytes(entry.parts, entry.record);
      const second = expectBytes(entry.parts, entry.record);
      expect([...second].join(","), `${entry.name} is not pure`).toBe([...first].join(","));
    }
  });

  it("03-F42: the encoder is synchronous and returns ONE buffer — a stall cannot be interleaved inside a document", () => {
    // "With cut reservation, if data is interrupted for two seconds or more, the printer
    // automatically feeds to the reserved cut position and cuts" — so a chunked or streaming
    // renderer gets its ticket cut in half. Asserted by construction rather than by timing: an
    // encoder that cannot await cannot stall.
    const result: EncodeResult = encode(api, [normal("A")], caps());
    expect(result instanceof Promise, "encode returned a promise").toBe(false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(
      (api.encode as unknown as { constructor: { name: string } }).constructor.name,
      "encode is an async function",
    ).not.toBe("AsyncFunction");
  });

  it("03 §7/03-F10: a printer with no cutter gets no cut command, and one with a cutter gets exactly one", () => {
    // `03-F10`: "the BC-58U has NO auto-cutter — a manual tear bar, i.e. a human action and a
    // mis-tear vector per ticket; it stays a compatibility target". Emitting `GS V` to it is a
    // command it does not implement; refusing the document would strand a supported printer that
    // `03-F49` says can still print receipts and bills.
    const withCutter = walkOf(
      [normal("BILL"), feed(3), { kind: "cut" }],
      caps({ has_cutter: true }),
    );
    expect(cuts(withCutter).length).toBe(1);

    const without = walkOf(
      [normal("BILL"), feed(3), { kind: "cut" }],
      caps({ model_id: "BC-58U-CLASS", has_cutter: false }),
    );
    expect(cuts(without).length, "a cut was sent to a printer with a tear bar").toBe(0);
    expect(without.violations).toEqual([]);
  });

  it("03-F34: the encoder's refusal reasons are DISTINCT from K-1's, so an S1 band can say what is wrong", () => {
    // K-1's deferred note asks for exactly this: "K-4 must assert that their `reason` codes are
    // DISTINCT from `min_columns_not_met` — a shared code would make the S1 band unable to say
    // what is actually wrong." K-2's four are named here for the same reason, and the first two
    // are the reason the two-scope ruling did not collapse into one code: an S1 band that cannot
    // tell "this ticket has two banners" from "this dish has two markers" sends the operator to
    // the wrong line of the ticket.
    const reasons = [
      refusalOf([banner("A"), normal("x"), banner("B")], caps()).reason,
      refusalOf([removal("A", "item-1"), normal("x"), removal("B", "item-1")], caps()).reason,
      refusalOf([fiscalQr(FISCAL_TOKEN)], caps({ raster_ok: false })).reason,
      refusalOf([userText(URDU_NAME)], caps({ raster_ok: true })).reason,
      refusalOf([normal(URDU_NAME)], caps()).reason,
    ];
    expect(new Set(reasons).size, "two encoder refusals share a reason code").toBe(5);
    expect(reasons).not.toContain("min_columns_not_met");
  });
});

// ── DEFERRED FROM K-2, DELIBERATELY (stated so the gap is a decision, not an omission) ──
//
// * `03-F42`'s `GS ( D` CLAUSE HAS NO OWNING TASK. "A real-time byte sequence occurring inside
//   raster data is executed as a command and corrupts the image unless disabled via `GS ( D`."
//   The encoder is the only layer that knows where its raster starts and stops, so the bracket
//   belongs here — but the brief assigns `03-F42` to no K-task and the clause names no failure
//   the encoder can observe. The walker ADMITS `GS ( D` so an implementer is not blocked; nothing
//   requires it. Whoever owns `03-F42` must assert that raster payloads are bracketed, and must
//   do it here rather than in the transport, because the transport cannot see inside a buffer.
// * `27-F56`'s RASTER CLAUSE — NOW AN FR, AND DELIBERATELY NOT CLOSED HERE. The clause exists
//   because this suite reported the hole; the founder wrote it into `27-F56` (`9416265`): "the
//   budget is a property of the DOCUMENT, not of a command. An inverted band drawn as a raster
//   image rather than through `GS B` spends the same attention and must count against the same
//   scope." K-2 does what the encoder layer can and no more:
//     — the `image` part carries NO ink level, so inversion is not offered as a raster option;
//     — a test above pins the boundary by asserting a raster-only document spends zero `GS B`
//       budget, which is the gap made visible rather than assumed.
//   It cannot do the rest. The encoder receives opaque bits and cannot tell a VOID band from a
//   logo from a customer's name in Urdu — and an ink-coverage threshold would be a number no FR
//   states. **K-4 owns it**, because a `03-F30` block declares its own role and is therefore the
//   first layer that knows a raster block IS a band; **K-5 owns the KOT's half** — that its layout
//   reaches inversion only through the ink ladder. Neither may leave it to the encoder.
// * THE RASTER TEXT PATH IS OWED, AND `03-F8` NAMES WHERE. The FR's July 2026 ruling refuses a
//   non-Latin user field because Wave 1 has no font and no shaping engine, and it names the first
//   real consumer — the storefront (`06`) and WhatsApp (`07`), where customer names and addresses
//   actually arrive — as "where the font question must be answered rather than deferred again".
//   `27-F61` comes with it: "Print a test sheet on the 48 GSM stock actually sold in Pakistan and
//   have an Urdu reader judge it; do not validate on screen." Whoever builds that path inherits
//   `18 §10`'s open per-field-vs-whole-document question too, and must NOT settle for this suite's
//   shape of assertion — a raster was emitted proves nothing about legibility, which is the whole
//   reason the refusal exists. `00 §5.6` binds throughout: user content is never transliterated or
//   rejected for its script, so the refusal is a sequencing state with an expiry, not a policy.
// * THE FISCAL QR'S QUIET ZONE. See header ambiguity 6b: a QR printed flush against a text line
//   decodes in this suite (measured — `jsqr` reads the fixture with zero padding) and would not
//   scan reliably on paper. `03-F35` does not mention the border at all. K-4/K-5 own it, because
//   they compose the block around the symbol; a decode assertion cannot reach it.
// * WHAT AN OVER-WIDE IMAGE DOES. `03 §8` says logos are "rasterized at the target dot width",
//   which reads as scaling; `03-F36`'s off-paper argument reads as refusal. The FRs do not say
//   which, so nothing here asserts either. K-4 owns it (it is the layer that knows the block's
//   declared width).
// * WHAT A `has_cutter: false` DOCUMENT ENDS WITH. `03-F10` calibrates head-to-cutter distance
//   per model (20–30 mm observed) precisely so a ticket can clear the head, and names the BC-58U's
//   tear bar. No FR states the feed. K-2 asserts only the absence of the cut command.
// * THE COLUMN COST OF THE 2×2 RUNG. `27-F57`'s July 2026 correction derives it — "a two-digit
//   quantity at `27-F56`'s 2× width costs 4 columns" — i.e. two columns per doubled character.
//   That number belongs to whatever computes line widths, which is K-5's layout, not the encoder.
//   It is written here so K-5 inherits it rather than re-deriving it.
// * SPACE-AS-LAYOUT AT THE DOCUMENT LEVEL. K-1 deferred it to K-4/K-5 and this suite agrees; see
//   ambiguity 11 in the header for why the byte-level reading of `03-F36` cannot be the intended
//   one. K-2 asserts only that the encoder adds no padding of its own.
// * THE S1 BAND ITSELF (`27-F11d`) is a `packages/ui` surface. K-2 asserts only that a refusal is
//   CLASSIFIED S1 and names the printer, exactly as K-1 did.
// * EVERYTHING ABOUT A TRANSPORT. No test here writes a byte anywhere. K-3 owns the assertion that
//   a refused document produces zero transport writes, and `03-F42`'s "no I/O wait interleaved
//   inside a document" at the transport layer.
