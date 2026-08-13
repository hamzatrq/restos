/**
 * **The ONE interpretation of what this package's bytes MEAN on paper.**
 *
 * `18 §10` puts the encoder here and the virtual printer in `packages/testing`, and for one round
 * that meant the byte→page walk lived in the test-support package while the shipped app had no way
 * to look at a document at all. Two consumers now need the same walk — `@restos/testing`'s virtual
 * printer (K-3's oracle) and `apps/pos-electron`'s file transport — and **two walks would be the
 * defect, not the duplication**: a document would look right in the snapshot suite and wrong in the
 * app, or the reverse, which is worse because the suite is the instrument. `03-F40`'s two
 * incompatible bit layouts for one sensor is the corpus's own worked example of that class.
 *
 * So the interpretation lives where ESC/POS meaning lives (this package, `18 §10`), and both
 * consumers read it. `packages/testing`'s virtual printer is now a thin device wrapper over
 * `simulate()` and owns only the parts `18 §10` gives it: the `Transport` shape, `03-F41`'s hold,
 * and `03-F10`'s roll controls.
 *
 * ── WHAT THIS IS NOT, AND K-8 IS STILL OWED IN FULL ─────────────────────────────────────────────
 *
 * **NO HARDWARE IS INVOLVED AND NONE IS CLAIMED.** This walks a `Uint8Array` and paints dots.
 * It renders what OUR ENCODER thinks the bytes mean, from the same assumptions the encoder was
 * written with, so a misconception SHARED by the encoder and this walk is invisible to it — again,
 * `03-F40`'s two bit layouts are the documented instance. It cannot say whether a real TH230 cuts,
 * feeds or reports paper-out as modelled (`03-F10`'s rig owes that), and it says nothing at all
 * about whether thermal output is LEGIBLE — `27-F35`'s ≥85% comprehension gate is a measurement on
 * real staff and is owed with K-8. No page produced here is evidence about a cook.
 *
 * ── The admitted command set ────────────────────────────────────────────────────────────────────
 *
 * Exactly what `03-F36`, `27-F55`/`27-F56` and `03 §7` buy — `ESC @` (a document may not inherit
 * printer state), `ESC d n` (`27-F58`'s blank-line grouping), `LF`, `GS ! n` (character size),
 * `GS B n` (inverted solid fill), `GS V m` (`has_cutter`) and `GS v 0` (the raster path).
 * **Everything else is a LOUD failure naming the offending bytes in hex**, including `ESC $`, which
 * `03-F36` bans outright. `18 §10` makes this walk the oracle every document suite is measured
 * against, and one that silently dropped what it did not understand would produce a page that looks
 * right and is not — the exact defect the snapshot suite exists to catch, committed by the
 * instrument.
 *
 * ── The PNG writer is ours, from `node:zlib` and nothing else ───────────────────────────────────
 *
 * `18 §15` rule 1 ("check it isn't already solvable with … 50 lines of our own code"). `18 §14`
 * names `pngjs` for this package and that remains a live REVIEW FINDING carried over from the
 * virtual printer's header: `pngjs` is in the workspace only as a transitive dependency of
 * `qrcode`, it ships no types, and adopting it adds `pngjs` AND `@types/pngjs` (which `18 §14` does
 * not list) — `18 §15` step 3, not a drive-by. The encoder below has no reader in it at all; the
 * suite that measures these pages decodes them with an independent reader of its own.
 */

import { deflateSync } from "node:zlib";

/**
 * The part of `03 §7` layer 3's capability record a page needs: how wide the head is.
 *
 * Declared structurally rather than taking the whole `PrinterCapability`, because the walk uses
 * exactly one number and a wider parameter would invite it to model-gate something it has no
 * business model-gating (`03-F40`'s sensor question belongs to `status.ts`).
 */
export type PageWidth = {
  /** `03 §7`: the print head's width in dots — the width of the page it can put ink on. */
  dots: number;
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
 * makes this the oracle every document suite is measured against — and an oracle that swallows
 * overflowing ink reports green while the real printer truncates. Widening the page instead would
 * be worse than silence: it would print what no printer can.
 *
 * Nothing here refuses. A real printer does not refuse a too-wide line, it clips it. What is added
 * is VISIBILITY — the assertion belongs to the suite.
 */
export type PageOverflow = {
  /** How many dots this document placed outside the page. Zero is the only clean page. */
  discarded_dots: number;
  /**
   * The largest `x` any discarded dot asked for; `null` when nothing overflowed.
   * `max_x + 1 - dots` is how far past the paper's right edge the content ran.
   */
  max_x: number | null;
};

/** One page of the roll: the dots on it, and the ones that fell off its right edge. */
export type SimulatedPage = {
  width: number;
  height: number;
  /**
   * `width × height`, row-major, `1` where the head put ink. Raw rather than an encoded image so
   * that both serialisers below read the SAME dots — a second walk producing a second dot matrix
   * is the fork this module exists to prevent.
   */
  ink: Uint8Array;
  overflow: PageOverflow;
};

// ── the page ────────────────────────────────────────────────────────────────────────────────────

/**
 * `03 §7`: Font A is a **12-dot cell**, and the column count every layout figure in the corpus is
 * expressed in is `print_dots ÷ font_cell_dots`. A glyph that did not advance by its cell would
 * make `03-F49`'s 42 columns describe a page this walk does not produce.
 *
 * The cell's HEIGHT and the glyph's size within it are not stated anywhere in the corpus. 24 dots
 * is the published Font A cell (12×24) and the 5×7 face is drawn at 2× inside it; every geometric
 * assertion downstream is a RELATION between two renders, so no FR is being invented here — but
 * nothing in this file may be read as a legibility claim either (`27-F35`'s comprehension gate is a
 * measurement on real staff, and `03-F10`'s rig owes the paper).
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
  /** The lowest dot any command has put on the paper — the page ends where the printing does. */
  let bottom = 0;
  return {
    overflow,
    inked: (): boolean => bottom > 0,
    grew: (to: number): void => {
      bottom = Math.max(bottom, to);
    },
    set: (x: number, y: number, ink: boolean): void => {
      if (x < 0 || y < 0 || x >= width) {
        // `03-F36`: the dot is dropped, because that is what the head does — and recorded, because
        // a silently dropped dot is a page that lies to every suite this walk is the oracle for.
        overflow.discarded_dots += 1;
        overflow.max_x = overflow.max_x === null ? x : Math.max(overflow.max_x, x);
        return;
      }
      while (rows.length <= y) rows.push(new Uint8Array(width));
      const row = rows[y];
      if (row !== undefined) row[x] = ink ? 1 : 0;
    },
    /** Materialise the dots. Everything beyond an unwritten row is paper. */
    finish: (): SimulatedPage => {
      const height = Math.max(bottom, 1);
      const ink = new Uint8Array(height * width);
      for (let y = 0; y < height; y += 1) {
        const row = rows[y];
        if (row === undefined) continue;
        ink.set(row.subarray(0, width), y * width);
      }
      return { width, height, ink, overflow };
    },
  };
};

// ── the ESC/POS walk ────────────────────────────────────────────────────────────────────────────

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const unsupported = (bytes: Uint8Array, at: number, length: number): Error =>
  new Error(
    `the ESC/POS simulator does not implement the command at offset ${at}: ` +
      [...bytes.slice(at, at + length)].map((b) => b.toString(16).padStart(2, "0")).join(" "),
  );

/**
 * Walk one whole document and paint it.
 *
 * **`GS V` ENDS A PAGE, and that is this module's one DECLARED INTERPRETATION (`24 §3b`).**
 * `03-F42` makes the document the transmitted unit and the cut is what separates one ticket from
 * the next on a continuous roll; the K-3 oracle explicitly records that "what a cut looks like on
 * the page is unstated" and asserts nothing about it, so this is a gap being filled deliberately
 * and in the open rather than a rule being read out of an FR. The named simpler alternative —
 * ignoring `GS V` entirely, which is what the virtual printer did — is rejected because a roll
 * with no page boundary makes a two-ticket transmission indistinguishable from one long ticket,
 * and the file transport's whole purpose is to hand a human something with the same boundaries the
 * paper would have had. A capability with `has_cutter: false` emits no `GS V` at all (`encoder.ts`),
 * so a tear-bar printer's document is one page — which is exactly true of the paper.
 *
 * What a cut resets: the print POSITION only. Character size and reverse-video are printer state
 * that a cut does not touch; `ESC @` is what clears those, and `03-F30` makes it the first command
 * of every document rather than something a cut stands in for.
 *
 * The trailing page after a document's final cut carries no ink and is dropped, so the ordinary
 * one-ticket document renders exactly one page. A document that placed no ink anywhere still
 * yields one blank page, because "nothing printed" is a page a caller can look at and an empty
 * array is not.
 */
export const simulate = (bytes: Uint8Array, { dots }: PageWidth): readonly SimulatedPage[] => {
  const pages: SimulatedPage[] = [];
  let page = createPage(dots);
  let x = 0;
  let y = 0;
  let sizeW = 1;
  let sizeH = 1;
  let reverse = false;
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
    page.grew(y + CELL_H * sizeH);
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
        // structure in whitespace, and a walk that fed one line per feed would collapse it.
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
        // `GS V m` — the cut, and the end of a page. See the header interpretation.
        pages.push(page.finish());
        page = createPage(dots);
        x = 0;
        y = 0;
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
        page.grew(y + height);
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

  pages.push(page.finish());
  // Drop the tail a final cut leaves behind — but only when NOTHING happened on it. "No ink" alone
  // is the wrong test: dots that fell off the right edge leave no mark by definition (`03-F36`), so
  // a page dropped for looking blank would take its overflow count with it and the document would
  // report clean for the one reason `PageOverflow` exists. A page that recorded discarded dots is
  // therefore kept, blank and all, and says so.
  const last = pages[pages.length - 1];
  if (
    pages.length > 1 &&
    last !== undefined &&
    last.overflow.discarded_dots === 0 &&
    !last.ink.some((dot) => dot === 1)
  ) {
    pages.pop();
  }
  return pages;
};

// ── PNG (`18 §10`'s snapshot artefact) ──────────────────────────────────────────────────────────

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

/** Greyscale-8 rows with no PNG filtering, so the bytes ARE the dots. Ink is black, paper white. */
const greyscaleRows = (page: SimulatedPage, filtered: boolean): Uint8Array => {
  const stride = page.width + (filtered ? 1 : 0);
  const raw = new Uint8Array(page.height * stride);
  raw.fill(0xff);
  for (let y = 0; y < page.height; y += 1) {
    const at = y * stride;
    if (filtered) raw[at] = 0; // PNG filter type 0 — no prediction.
    for (let x = 0; x < page.width; x += 1) {
      raw[at + (filtered ? 1 : 0) + x] = page.ink[y * page.width + x] === 1 ? 0x00 : 0xff;
    }
  }
  return raw;
};

/**
 * Greyscale 8-bit, no interlacing, one `IDAT`.
 *
 * **No `tIME` chunk, and no other clock anywhere:** `18 §10` runs these pages as CI snapshots, so a
 * byte that varies per run would make every layout change indistinguishable from every rerun.
 */
// @unreached-by-design `18 §10` gives PNG exactly one job — "renders output to PNG for SNAPSHOT
// TESTS" — so its only caller is `packages/testing`'s virtual printer, which `18 §12` marks
// unreached by design in turn. The app's artefact is `encodePagesPdf`: `03-F42` makes a document
// one transmitted unit and PNG has no multi-page form, so a till writing PNGs would scatter one
// document across N files. Both read the same `SimulatedPage.ink`, so there is one interpretation.
export const encodePagePng = (page: SimulatedPage): Uint8Array => {
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk("IHDR", Uint8Array.from([...be32(page.width), ...be32(page.height), 8, 0, 0, 0, 0])),
    chunk("IDAT", new Uint8Array(deflateSync(greyscaleRows(page, true)))),
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

// ── PDF (the artefact a human opens) ────────────────────────────────────────────────────────────

/**
 * `03 §7`: 203 dpi is the thermal head's resolution, and a PDF's user-space unit is 1/72 inch.
 * Scaling by `72/203` makes the page come out at the physical size of the paper — an 80 mm roll is
 * ~80 mm wide on screen and in print, so what a reviewer measures with a ruler is what the till
 * would have produced. A page laid out at 1 dot = 1 point would be 2.8× oversize and every
 * judgement about type size made against it would be wrong.
 *
 * PINNED, not measured: `03 §7`'s dpi is the published head resolution for these models and no
 * printer has been attached (K-8).
 */
const HEAD_DPI = 203;
const PDF_UNITS_PER_INCH = 72;

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0));

/**
 * A PDF holding one image per page, `/DeviceGray` at 8 bits, `/FlateDecode`.
 *
 * **NO DEPENDENCY** (`18 §15` rule 1). The compressed image stream is `node:zlib`'s, which this
 * file already uses for the PNG, and the object/xref scaffolding below is the smallest PDF that a
 * reader will open. `18 §14` lists no PDF library, so the alternative was `18 §15` step 3 — adding
 * `pdfkit` **and** `@types/pdfkit` as Electron-main runtime dependencies to make a file that is
 * never shipped to a customer. That is a poor trade for scaffolding that has no logic in it.
 *
 * **PDF and not PNG, and the reason is `03-F42`.** A document is transmitted as ONE unit, so the
 * artefact a human opens should be one file per document; and a cut ends a page, so a document
 * carrying two cuts is a two-page file. PNG has no multi-page form, so a PNG artefact would have to
 * scatter one document across N files and lose exactly the fact `03-F42` exists to protect. The PNG
 * writer above stays because `18 §10` names PNG for the snapshot suite and K-3's oracle asserts on
 * its bytes — both serialisers read the SAME `SimulatedPage.ink`, so there is still one
 * interpretation and two spellings of it, which is the property that matters.
 *
 * No `/CreationDate` and no `/ID`: a byte that varies per run would make two renders of the same
 * document differ, and the first thing anyone does with two of these files is diff them.
 */
export const encodePagesPdf = (pages: readonly SimulatedPage[]): Uint8Array => {
  const scale = PDF_UNITS_PER_INCH / HEAD_DPI;
  const objects: Uint8Array[] = [];
  /** 1-based object numbers, in the order they are appended. */
  const add = (body: Uint8Array): number => {
    objects.push(body);
    return objects.length;
  };

  // Reserve 1 = catalog, 2 = page tree; their bodies need the ids of everything below.
  const catalog = add(new Uint8Array(0));
  const tree = add(new Uint8Array(0));
  const pageIds: number[] = [];

  for (const page of pages) {
    const image = deflateSync(greyscaleRows(page, false));
    const width = page.width * scale;
    const height = page.height * scale;
    const imageId = add(
      new Uint8Array([
        ...ascii(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
            `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ` +
            `/Length ${image.length} >>\nstream\n`,
        ),
        ...image,
        ...ascii("\nendstream"),
      ]),
    );
    // The image is drawn at the page's full size. `cm` is a scale matrix and nothing else — no
    // translation, no rotation — because `03-F36` bans absolute positioning on the printer and a
    // simulator that repositioned content would be showing a page the head cannot produce.
    const content = ascii(`q\n${width.toFixed(4)} 0 0 ${height.toFixed(4)} 0 0 cm\n/I Do\nQ\n`);
    const contentId = add(
      new Uint8Array([
        ...ascii(`<< /Length ${content.length} >>\nstream\n`),
        ...content,
        ...ascii("\nendstream"),
      ]),
    );
    pageIds.push(
      add(
        ascii(
          `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${width.toFixed(4)} ${height.toFixed(4)}] ` +
            `/Resources << /XObject << /I ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      ),
    );
  }

  objects[catalog - 1] = ascii(`<< /Type /Catalog /Pages ${tree} 0 R >>`);
  objects[tree - 1] = ascii(
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );

  const parts: Uint8Array[] = [ascii("%PDF-1.4\n")];
  const offsets: number[] = [];
  let at = parts[0]?.length ?? 0;
  for (const [index, body] of objects.entries()) {
    const object = new Uint8Array([
      ...ascii(`${index + 1} 0 obj\n`),
      ...body,
      ...ascii("\nendobj\n"),
    ]);
    offsets.push(at);
    parts.push(object);
    at += object.length;
  }
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${at}\n%%EOF\n`,
  ].join("");
  parts.push(ascii(xref));

  const pdf = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    pdf.set(part, cursor);
    cursor += part.length;
  }
  return pdf;
};
