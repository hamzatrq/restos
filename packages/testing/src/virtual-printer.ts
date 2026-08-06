/**
 * The virtual printer (`18 §10`): "implements `Transport` and renders output to PNG for snapshot
 * tests; CI runs receipt/KOT snapshots for every layout change".
 *
 * **NO HARDWARE IS INVOLVED AND NONE IS CLAIMED.** This is a JavaScript object that walks a
 * `Uint8Array` of ESC/POS and paints dots into a page. `03-F10`'s rig procedure — pulling a real
 * roll out of a real printer mid-job — is owed in full, and the paper-out model below is the
 * SOFTWARE shape of it: it proves this code's arithmetic and nothing about firmware.
 *
 * Three FRs decide its behaviour:
 *
 *   * `03-F42` — a document is transmitted as ONE unit, so `send` takes a whole `Uint8Array` and
 *     there is no way to hand it a fragment. A ≥2 s gap mid-document has nowhere to occur.
 *   * `03-F41` — a printer with no paper HOLDS the job. `send` answers `stalled` (never `failed`),
 *     keeps the bytes, and prints them EXACTLY ONCE when the roll is replaced. A spooler that
 *     re-transmits gets two pages, which is the duplicate KOT the FR exists to prevent.
 *   * `03-F40` — the paper query is answered while the printer is "offline", because that is the
 *     property that makes `DLE EOT 4` the right command. Near-end is model-gated from the
 *     capability record and reports `"unsupported"` where the model has no sensor.
 *
 * **A command this renderer does not implement is a LOUD failure**, naming the offending bytes in
 * hex. `18 §10` makes this the oracle every document suite is measured against, and a renderer
 * that silently drops what it does not understand produces a page that looks right and is not —
 * which is precisely the defect the snapshot suite exists to catch, committed by the instrument.
 *
 * **The PNG is written here, from `node:zlib` and nothing else** (`18 §15` rule 1: "check it isn't
 * already solvable with … 50 lines of our own code"). `18 §14` names `pngjs` for this package; a
 * greyscale writer with no filtering is shorter than the type shim an untyped dependency would
 * need, and the encoder below has no reader in it at all — the suite that measures these pages
 * decodes them with an independent reader of its own.
 *
 * **That rationale is a REVIEW FINDING as of August 2026 and this comment is not the last word on
 * it:** `18 §14` names `pngjs` for exactly this job, so the hand-rolled CRC table, chunker and
 * greyscale IHDR/IDAT/IEND below are owed a replacement. It was not made here because `pngjs` is in
 * the workspace only as a transitive dependency of `qrcode` (`@restos/escpos`'s), it is not
 * resolvable from this package, and it ships no types — so adopting it adds `pngjs` AND
 * `@types/pngjs` (which `18 §14` does not list) to this package's manifest, and that is `18 §15`
 * step 3, not a drive-by.
 */

// @unreached-by-design TEST-SUPPORT PACKAGE (`18 §12`). The virtual printer renders emitted
// bytes to a PNG for snapshot tests; the shipped transport is `unattachedPrinter` in
// `apps/pos-electron/src/main/printing.ts`, and a till that "printed" to a PNG would be exactly
// the dishonesty `03-F5` forbids. K-8 replaces the shipped transport with hardware, not this.
import { deflateSync } from "node:zlib";

/**
 * The part of `03 §7` layer 3's capability record this device reads.
 *
 * Declared structurally rather than imported: `@restos/testing` does not depend on
 * `@restos/escpos`, and TypeScript's structural typing makes the real record assignable here.
 */
export type VirtualPrinterCapability = {
  /** `03-F5`'s precedent: an outcome names the printer. */
  model_id: string;
  /** `03 §7`: the print head's width in dots — the width of the page it can put ink on. */
  dots: number;
  /** `03-F40`: whether this model has a paper NEAR-END sensor at all. */
  has_near_end_sensor: boolean;
};

/**
 * Ink this document asked for and the PAGE COULD NOT HOLD.
 *
 * `03-F36` bans absolute dot positioning and names this exact failure as the reason — "an `x=384`
 * offset is mid-line at 576 dots and **off-paper at 384**". Off-paper content is invisible BY
 * CONSTRUCTION: the head has nowhere to put it, so the page that comes out looks correct and is
 * missing the part that mattered.
 *
 * The dots are therefore DISCARDED, the way a head discards them, and COUNTED, because `18 §10`
 * makes this renderer the oracle every document suite is measured against — and an oracle that
 * swallows overflowing ink reports green while the real printer truncates, which is the defect the
 * snapshot suite exists to catch, committed by the instrument. Widening the page instead would be
 * worse than silence: it would print what no printer can.
 *
 * Nothing here refuses. A real printer does not refuse a too-wide line, it clips it, and `03-F41`
 * is the only condition this device answers `send` differently for. What is added is VISIBILITY —
 * the assertion belongs to the suite.
 */
export type PageOverflow = {
  /** How many dots this document placed outside the page. Zero is the only clean page. */
  discarded_dots: number;
  /**
   * The largest `x` any discarded dot asked for; `null` when nothing overflowed.
   * `max_x + 1 - capability.dots` is how far past the paper's right edge the content ran.
   */
  max_x: number | null;
};

/** One document as it was sent, and the page it printed. */
export type PrintedDocument = {
  /** The bytes handed to `send`, unaltered — a fake that loses bytes is a fake that hides defects. */
  bytes: Uint8Array;
  png: Uint8Array;
  /** `03-F36`: what did not fit on the paper, which the PNG cannot show by definition. */
  overflow: PageOverflow;
};

// ── the page ────────────────────────────────────────────────────────────────────────────────────

/**
 * `03 §7`: Font A is a **12-dot cell**, and the column count every layout figure in the corpus is
 * expressed in is `print_dots ÷ font_cell_dots`. A glyph that did not advance by its cell would
 * make `03-F49`'s 42 columns describe a page this renderer does not produce.
 *
 * The cell's HEIGHT and the glyph's size within it are not stated anywhere in the corpus. 24 dots
 * is the published Font A cell (12×24) and the 5×7 face is drawn at 2× inside it; every geometric
 * assertion downstream is a RELATION between two renders, so no FR is being invented here — but
 * nothing in this file may be read as a legibility claim either (`27-F35`'s comprehension gate is
 * a measurement on real staff, and `03-F10`'s rig owes the paper).
 */
const CELL_W = 12;
const CELL_H = 24;
const GLYPH_SCALE = 2;
const GLYPH_X = 1;
const GLYPH_Y = 5;

/**
 * A 5×7 face, five COLUMN bitmaps per character with bit 0 at the top, covering printable ASCII
 * from `0x20`. `00 §5.6` makes interface text English and `03-F8` prints it through printer fonts;
 * a byte outside this range is refused rather than drawn as a substitute (`03-F34`).
 */
const FONT_5X7 =
  // ` ` ! " # $ % & '
  (
    "0000000000 00005f0000 0007000700 147f147f14 242a7f2a12 2313086462 3649552250 0005030000 " +
    // ( ) * + , - . /
    "001c224100 0041221c00 14083e0814 08083e0808 0050300000 0808080808 0060600000 2010080402 " +
    // 0 1 2 3 4 5 6 7
    "3e5149453e 00427f4000 4261514946 2141454b31 1814127f10 2745454539 3c4a494930 0171090503 " +
    // 8 9 : ; < = > ?
    "3649494936 064949291e 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906 " +
    // @ A B C D E F G
    "3249794139 7e1111117e 7f49494936 3e41414122 7f4141221c 7f49494941 7f09090901 3e4149497a " +
    // H I J K L M N O
    "7f0808087f 00417f4100 2040413f01 7f08142241 7f40404040 7f020c027f 7f0408107f 3e4141413e " +
    // P Q R S T U V W
    "7f09090906 3e4151215e 7f09192946 4649494931 01017f0101 3f4040403f 1f2040201f 3f4038403f " +
    // X Y Z [ \ ] ^ _
    "6314081463 0708700807 6151494543 007f414100 0204081020 0041417f00 0402010204 4040404040 " +
    // ` a b c d e f g
    "0001020400 2054545478 7f48444438 3844444420 384444487f 3854545418 087e090102 0c5252523e " +
    // h i j k l m n o
    "7f08040478 00447d4000 2040443d00 7f10284400 00417f4000 7c0418047c 7c08040478 3844444438 " +
    // p q r s t u v w
    "7c14141408 081414187c 7c08040408 4854545420 043f444020 3c4040207c 1c2040201c 3c4030403c " +
    // x y z { | } ~
    "4428102844 0c5050503c 4464544c44 0008364100 00007f0000 0041360800 08082a1c08"
  ).split(" ");

const createPage = (width: number) => {
  const rows: Uint8Array[] = [];
  const overflow: PageOverflow = { discarded_dots: 0, max_x: null };
  const set = (x: number, y: number, ink: boolean): void => {
    if (x < 0 || y < 0 || x >= width) {
      // `03-F36`: the dot is dropped, because that is what the head does — and recorded, because
      // a silently dropped dot is a page that lies to every suite this renderer is the oracle for.
      overflow.discarded_dots += 1;
      overflow.max_x = overflow.max_x === null ? x : Math.max(overflow.max_x, x);
      return;
    }
    while (rows.length <= y) rows.push(new Uint8Array(width));
    const row = rows[y];
    if (row !== undefined) row[x] = ink ? 1 : 0;
  };
  return {
    set,
    overflow,
    /** Greyscale-8 scanlines: ink is black, paper is white, and everything beyond a row is paper. */
    scanlines: (height: number): Uint8Array => {
      const raw = new Uint8Array(height * (width + 1));
      raw.fill(0xff);
      for (let y = 0; y < height; y += 1) {
        const at = y * (width + 1);
        raw[at] = 0; // PNG filter type 0 — no prediction, so the bytes ARE the dots.
        const row = rows[y];
        if (row === undefined) continue;
        for (let x = 0; x < width; x += 1) raw[at + 1 + x] = row[x] === 1 ? 0x00 : 0xff;
      }
      return raw;
    },
  };
};

// ── the PNG writer ──────────────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const be32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

/**
 * One PNG chunk. Assembled with `set` rather than by spreading the payload into an array literal:
 * a spread is a CALL, so its argument count is bounded by the JS stack, and a page's compressed
 * `IDAT` is exactly the array that gets big. That failure would arrive as a stack error inside the
 * INSTRUMENT, about a page that is fine.
 */
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  out.set(be32(data.length), 0);
  out.set(
    [...type].map((ch) => ch.charCodeAt(0)),
    4,
  );
  out.set(data, 8);
  out.set(be32(crc32(out.subarray(4, 8 + data.length))), 8 + data.length);
  return out;
};

/**
 * Greyscale 8-bit, no interlacing, one `IDAT`.
 *
 * **No `tIME` chunk, and no other clock anywhere:** `18 §10` runs these pages as CI snapshots, so a
 * byte that varies per run would make every layout change indistinguishable from every rerun.
 */
const encodePng = (width: number, height: number, raw: Uint8Array): Uint8Array => {
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk("IHDR", Uint8Array.from([...be32(width), ...be32(height), 8, 0, 0, 0, 0])),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
};

// ── the ESC/POS walk ────────────────────────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const unsupported = (bytes: Uint8Array, at: number, length: number): Error =>
  new Error(
    `the virtual printer does not implement the command at offset ${at}: ` +
      [...bytes.slice(at, at + length)].map((b) => b.toString(16).padStart(2, "0")).join(" "),
  );

/**
 * Walk one whole document and paint it (`03-F42`: one document, one page).
 *
 * The admitted command set is exactly what `03-F36`, `27-F55`/`27-F56` and `03 §7` buy — `ESC @`
 * (a document may not inherit printer state), `ESC d n` (`27-F58`'s blank-line grouping), `LF`,
 * `GS ! n` (character size), `GS B n` (inverted solid fill), `GS V m` (`has_cutter`) and `GS v 0`
 * (the raster path). Everything else throws, including `ESC $`, which `03-F36` bans outright.
 *
 * Returns the page AND what did not fit on it (`PageOverflow`) — the second is not derivable from
 * the first, which is the whole reason it is returned.
 */
const renderDocument = (
  bytes: Uint8Array,
  widthDots: number,
): { png: Uint8Array; overflow: PageOverflow } => {
  const page = createPage(widthDots);
  let x = 0;
  let y = 0;
  let sizeW = 1;
  let sizeH = 1;
  let reverse = false;
  /** The lowest dot any command has put on the paper — the page ends where the printing does. */
  let bottom = 0;
  let i = 0;

  const drawChar = (code: number): void => {
    const glyph = FONT_5X7[code - 0x20];
    if (glyph === undefined) throw unsupported(bytes, i, 1);
    if (reverse) {
      for (let dy = 0; dy < CELL_H * sizeH; dy += 1) {
        for (let dx = 0; dx < CELL_W * sizeW; dx += 1) page.set(x + dx, y + dy, true);
      }
    }
    for (let gx = 0; gx < 5; gx += 1) {
      const column = Number.parseInt(glyph.slice(gx * 2, gx * 2 + 2), 16);
      for (let gy = 0; gy < 7; gy += 1) {
        if (((column >> gy) & 1) === 0) continue;
        const px = x + GLYPH_X * sizeW + gx * GLYPH_SCALE * sizeW;
        const py = y + GLYPH_Y * sizeH + gy * GLYPH_SCALE * sizeH;
        for (let sy = 0; sy < GLYPH_SCALE * sizeH; sy += 1) {
          for (let sx = 0; sx < GLYPH_SCALE * sizeW; sx += 1) page.set(px + sx, py + sy, !reverse);
        }
      }
    }
    bottom = Math.max(bottom, y + CELL_H * sizeH);
    x += CELL_W * sizeW;
  };

  while (i < bytes.length) {
    const b = bytes[i] ?? 0;
    if (b === ESC) {
      const n = bytes[i + 1];
      if (n === 0x40) {
        // `ESC @` — initialise. `03-F30` purity, from the printer's side.
        x = 0;
        y = 0;
        sizeW = 1;
        sizeH = 1;
        reverse = false;
        i += 2;
        continue;
      }
      if (n === 0x64) {
        // `ESC d n` — print and feed n lines. The COUNT is honoured: `27-F58` carries the KOT's
        // structure in whitespace, and a renderer that fed one line for every feed would collapse it.
        y += (bytes[i + 2] ?? 0) * CELL_H * sizeH;
        x = 0;
        i += 3;
        continue;
      }
      throw unsupported(bytes, i, 2);
    }
    if (b === GS) {
      const n = bytes[i + 1];
      if (n === 0x21) {
        // `GS ! n` — high nibble is the width magnification, low nibble the height.
        const value = bytes[i + 2] ?? 0;
        sizeW = ((value >> 4) & 0x0f) + 1;
        sizeH = (value & 0x0f) + 1;
        i += 3;
        continue;
      }
      if (n === 0x42) {
        reverse = (bytes[i + 2] ?? 0) !== 0;
        i += 3;
        continue;
      }
      if (n === 0x56) {
        // `GS V m` — the cut. What a cut LOOKS like on a rendered roll is unspecified, so nothing
        // is drawn; one `send` is one document (`03-F42`) and that is the only boundary modelled.
        i += 3;
        continue;
      }
      if (n === 0x76 && bytes[i + 2] === 0x30) {
        if (bytes[i + 3] !== 0x00) throw unsupported(bytes, i, 4);
        // The width is declared in BYTES, so the printer renders `bytes_per_row × 8` dots and has
        // no way to know any of them were padding.
        const bytesPerRow = (bytes[i + 4] ?? 0) | ((bytes[i + 5] ?? 0) << 8);
        const height = (bytes[i + 6] ?? 0) | ((bytes[i + 7] ?? 0) << 8);
        const from = i + 8;
        for (let ry = 0; ry < height; ry += 1) {
          for (let rx = 0; rx < bytesPerRow * 8; rx += 1) {
            const byte = bytes[from + ry * bytesPerRow + (rx >> 3)] ?? 0;
            if (((byte >> (7 - (rx & 7))) & 1) === 1) page.set(x + rx, y + ry, true);
          }
        }
        bottom = Math.max(bottom, y + height);
        y += height;
        x = 0;
        i = from + bytesPerRow * height;
        continue;
      }
      throw unsupported(bytes, i, 2);
    }
    if (b === LF) {
      y += CELL_H * sizeH;
      x = 0;
      i += 1;
      continue;
    }
    drawChar(b);
    i += 1;
  }

  const height = Math.max(bottom, 1);
  return { png: encodePng(widthDots, height, page.scanlines(height)), overflow: page.overflow };
};

// ── the device ──────────────────────────────────────────────────────────────────────────────────

/**
 * `18 §10`'s virtual printer.
 *
 * The returned object's TYPE is inferred rather than declared against a local `Transport`
 * interface, deliberately: `18 §10` names the seam and enumerates no members, and a second
 * declaration of it here is a copy that can drift from the one the conformance check reads. When a
 * real transport lands (`18 §10`'s TCP 9100), the interface gets ONE home and this object is
 * checked against it.
 */
export const createVirtualPrinter = ({ capability }: { capability: VirtualPrinterCapability }) => {
  const pages: PrintedDocument[] = [];
  /** `03-F41`: what the printer is HOLDING because the roll ran out. Never dropped, never retried. */
  const held: Uint8Array[] = [];
  let paper_out = false;

  const print = (bytes: Uint8Array): void => {
    pages.push({ bytes, ...renderDocument(bytes, capability.dots) });
  };

  return {
    open: async (): Promise<void> => undefined,
    close: async (): Promise<void> => undefined,

    /** `03-F40`: answered while the printer is offline, which is the whole point of `DLE EOT 4`. */
    status: async (): Promise<{ paper_out: boolean; near_end: boolean | "unsupported" }> => ({
      paper_out,
      near_end: capability.has_near_end_sensor ? false : "unsupported",
    }),

    /** `03-F42`: the WHOLE document, in one argument. There is no partial form. */
    send: async (
      document: Uint8Array,
    ): Promise<
      | { ok: true }
      | { ok: false; state: "stalled"; reason: "paper_out"; model_id: string }
      | { ok: false; state: "failed"; reason: "link_error" | "no_response"; model_id: string }
    > => {
      if (paper_out) {
        held.push(document);
        return { ok: false, state: "stalled", reason: "paper_out", model_id: capability.model_id };
      }
      print(document);
      return { ok: true };
    },

    /** `03-F41`/`03-F10`: the roll runs out. The printer holds; it does not drop. */
    pullRoll: (): void => {
      paper_out = true;
    },

    /** `03-F41`: the roll is replaced, and what was held prints — exactly once, in order. */
    loadRoll: (): void => {
      paper_out = false;
      for (const document of held.splice(0)) print(document);
    },

    printed: (): readonly PrintedDocument[] => [...pages],
  };
};
