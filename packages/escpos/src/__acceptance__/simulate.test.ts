// The ONE byte→page interpretation, and the two artefacts it serialises to.
//
// ⚠ AUTHORSHIP, STATED PLAINLY (`24 §3` step 2): this suite was written by the session that wrote
// `simulate.ts`, in the same sitting. It is therefore NOT an independent oracle in the sense
// `printer-capability.test.ts`, `encoder.test.ts` and `virtual-printer.test.ts` are — those were
// authored from spec text by sessions that read no implementation, and they remain the instruments
// that measure this package. What this suite adds is the two properties those oracles cannot see,
// because both predate the module: that `GS V` ends a PAGE, and that a page serialises to a PDF a
// human can open. Every assertion below is mutation-checked and the matrix is in the commit
// message; a claim that a test bites is not evidence that it does.
//
// ⚠ NO HARDWARE. NOTHING HERE IS EVIDENCE ABOUT A PRINTER. This walks a `Uint8Array` and counts
// dots. `27-F35`'s ≥85% comprehension gate on real staff and `03-F10`'s rig are owed with K-8, and
// a page produced here renders what OUR ENCODER thinks the bytes mean — a misconception shared
// between the encoder and this walk is invisible to it by construction (`03-F40`'s two incompatible
// bit layouts for one sensor is the corpus's own instance of that class).

import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePagePng, encodePagesPdf, simulate } from "../index.js";

// ── hand-built documents, from the published command set ────────────────────────────────────────
//
// Deliberately NOT produced by this package's own encoder: a walk tested only against the encoder
// that feeds it is two halves of one mind. Each command carries the FR that buys it, which is K-2's
// rule ("the FR supplies the requirement; the published ESC/POS command set supplies the opcode").

/** `ESC @` — initialise. `03-F30`: a document may not inherit printer state. */
const INIT = [0x1b, 0x40];
/** `LF` — print and line feed. */
const LF = [0x0a];
/** `GS V m` — cut. `03 §7`'s `has_cutter`; `03-F42` makes it the end of a transmitted unit. */
const CUT = [0x1d, 0x56, 0x00];
/** `ESC $` — absolute print position. `03-F36` BANS it; no implementation may render it. */
const ABSOLUTE = [0x1b, 0x24, 0x80, 0x01];

const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

const document = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat());

/**
 * `GS v 0` — raster bit image, `m=0`. Used as the INDEPENDENT ink source below: a raster's dots are
 * stated by the caller, so an assertion over them does not depend on this file's 5×7 font table,
 * on the cell metrics, or on any other choice `simulate.ts` made.
 */
const raster = (rows: readonly number[][]): number[] => {
  const bytesPerRow = Math.ceil((rows[0]?.length ?? 0) / 8);
  const data: number[] = [];
  for (const row of rows) {
    for (let byte = 0; byte < bytesPerRow; byte += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        if (row[byte * 8 + bit] === 1) value |= 1 << (7 - bit);
      }
      data.push(value);
    }
  }
  return [
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    rows.length & 0xff,
    (rows.length >> 8) & 0xff,
    ...data,
  ];
};

const TH230 = { dots: 576 };

// ── an INDEPENDENT PDF reader ───────────────────────────────────────────────────────────────────
//
// The suite decodes the artefact with a reader written here rather than with anything from
// `simulate.ts`, for the same reason `encoder.test.ts` decodes QR codes with `jsqr` and never with
// `qrcode`: a serialiser measured by its own inverse is a tautology. This reads the object bodies
// out by `/Length`, which is exact, rather than by scanning for `endstream` in binary data.

type PdfImage = { width: number; height: number; pixels: Uint8Array };

const readPdf = (pdf: Uint8Array): { pageCount: number; boxes: string[]; images: PdfImage[] } => {
  const text = Buffer.from(pdf).toString("latin1");
  expect(text.startsWith("%PDF-"), "the artefact is not a PDF").toBe(true);
  expect(text.endsWith("%%EOF\n"), "the PDF has no trailer").toBe(true);
  const count = /\/Type \/Pages \/Count (\d+)/.exec(text);
  const images: PdfImage[] = [];
  const dict =
    /\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceGray \/BitsPerComponent 8 \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g;
  for (let hit = dict.exec(text); hit !== null; hit = dict.exec(text)) {
    const at = hit.index + hit[0].length;
    const length = Number(hit[3]);
    images.push({
      width: Number(hit[1]),
      height: Number(hit[2]),
      pixels: new Uint8Array(inflateSync(pdf.subarray(at, at + length))),
    });
  }
  return {
    pageCount: Number(count?.[1] ?? -1),
    boxes: [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((hit) => hit[1] ?? ""),
    images,
  };
};

describe("03-F42 — the cut is what ends a page", () => {
  it("a document with two cuts renders TWO pages", () => {
    // The whole reason the file transport can hand a human a multi-page artefact instead of one
    // long strip. `03-F42` makes the document the transmitted unit and the cut is what separates
    // one ticket from the next on the roll; the K-3 oracle records that "what a cut looks like on
    // the page is unstated" and asserts nothing, so this is a DECLARED interpretation (`24 §3b`),
    // stated in `simulate.ts`'s header and asserted here.
    const pages = simulate(document(INIT, ascii("KOT 1"), LF, CUT, ascii("KOT 2"), LF, CUT), TH230);
    expect(pages.length, "the cut did not end a page — two tickets rendered as one").toBe(2);
  });

  it("the ordinary one-ticket document renders ONE page, not one plus a blank", () => {
    // The encoder puts `GS V` last, so every real document ends with a cut and the tail it leaves
    // behind carries no ink. A blank second page in every artefact would be noise a reader learns
    // to ignore, which is how a real blank page later goes unnoticed.
    expect(simulate(document(INIT, ascii("KOT 142"), LF, CUT), TH230).length).toBe(1);
  });

  it("a printer with no cutter emits no cut, and its document is ONE page", () => {
    // `03-F10`: the BC-58U baseline has a manual tear bar and no cutter, so `encoder.ts` emits no
    // `GS V` at all. One continuous page is exactly true of that paper.
    expect(simulate(document(INIT, ascii("A"), LF, ascii("B"), LF), TH230).length).toBe(1);
  });

  it("a document that placed no ink still yields one page a caller can look at", () => {
    const pages = simulate(document(INIT, CUT), TH230);
    expect(pages.length).toBe(1);
    expect(
      pages[0]?.ink.some((dot) => dot === 1),
      "a blank page has ink on it",
    ).toBe(false);
  });
});

describe("03-F36 — ink the page could not hold is discarded and COUNTED", () => {
  it("a raster wider than the head loses its overflow and reports how far it ran", () => {
    // 576 dots wide; a raster declared at 72 bytes per row is 576 dots and fits exactly, so 80
    // bytes per row asks for 640 and overruns by 64 columns on every row.
    const rows = Array.from({ length: 3 }, () => Array.from({ length: 640 }, () => 1));
    const pages = simulate(document(INIT, raster(rows), CUT), TH230);
    const overflow = pages[0]?.overflow;
    expect(overflow?.discarded_dots, "off-paper dots were swallowed").toBe(64 * 3);
    expect(overflow?.max_x, "the page cannot say how far past the edge it ran").toBe(639);
  });

  it("a tail page that recorded overflow is KEPT, blank though it looks", () => {
    // The trailing page after a final cut is dropped when NOTHING happened on it — and "no ink" is
    // the wrong test for that, because dots that fell off the right edge leave no mark by
    // definition. A page dropped for looking blank would take its overflow count with it and the
    // document would report clean for the one reason `PageOverflow` exists.
    //
    // One row, 640 dots declared, ink ONLY in the 64 columns past the paper's edge: nothing lands,
    // everything is discarded. This is the narrow case the drop rule has to survive.
    const rows = [Array.from({ length: 640 }, (_, x) => (x >= 576 ? 1 : 0))];
    const pages = simulate(document(INIT, ascii("A"), LF, CUT, raster(rows)), TH230);
    expect(pages.length, "a page that lost 64 dots off the edge was dropped as blank").toBe(2);
    expect(pages[1]?.ink.some((dot) => dot === 1)).toBe(false);
    expect(pages[1]?.overflow.discarded_dots).toBe(64);
    expect(pages[1]?.overflow.max_x).toBe(639);
  });

  it("the tail page a plain final cut leaves behind IS dropped", () => {
    // The other side of the same rule, and the one every real document takes: the encoder puts
    // `GS V` last, so a blank second page in every artefact would be noise a reader learns to
    // ignore — which is how a real blank page later goes unnoticed.
    const pages = simulate(document(INIT, ascii("A"), LF, CUT), TH230);
    expect(pages.length).toBe(1);
  });
});

describe("03-F36 — a command the walk does not implement is a LOUD failure", () => {
  it("`ESC $` names the bytes it choked on, in hex", () => {
    // `03-F36` bans absolute positioning outright, so no implementation may legitimately render it.
    // "NAMES WHAT IT SAW" rather than "it threw": a reader told `1b 24` can look it up, a reader
    // told "bad document" cannot. Same requirement `virtual-printer.test.ts` declares.
    expect(() => simulate(document(INIT, ABSOLUTE, ascii("A"), LF), TH230)).toThrow(/1b 24/);
  });
});

describe("the artefact — PDF (`03-F42`: one document, one file)", () => {
  it("one page per cut, and the image on it carries the dots that were sent", () => {
    // The ink is a RASTER, so what is asserted here is independent of the font table, the cell
    // metrics and every other choice `simulate.ts` made: the caller stated the dots.
    const rows = [
      [1, 0, 0, 0, 0, 0, 0, 1],
      [0, 1, 0, 0, 0, 0, 1, 0],
    ];
    const pdf = encodePagesPdf(simulate(document(INIT, raster(rows), CUT), TH230));
    const read = readPdf(pdf);
    expect(read.pageCount).toBe(1);
    expect(read.images.length).toBe(1);
    const image = read.images[0];
    expect(image?.width).toBe(576);
    expect(image?.height).toBe(2);
    expect(image?.pixels.length).toBe(576 * 2);
    // Black where the caller put a bit, white everywhere else — checked over the WHOLE page, so a
    // serialiser that painted the page solid or left it blank cannot pass.
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < 576; x += 1) {
        const expected = (rows[y]?.[x] ?? 0) === 1 ? 0x00 : 0xff;
        expect(
          image?.pixels[y * 576 + x],
          `dot ${x},${y} came out ${image?.pixels[y * 576 + x]} not ${expected}`,
        ).toBe(expected);
      }
    }
  });

  it("a two-cut document is a TWO-page PDF with two images", () => {
    const pdf = encodePagesPdf(
      simulate(document(INIT, ascii("A"), LF, CUT, ascii("B"), LF, CUT), TH230),
    );
    const read = readPdf(pdf);
    expect(read.pageCount, "the PDF collapsed two tickets into one page").toBe(2);
    expect(read.images.length).toBe(2);
    expect(read.boxes.length).toBe(2);
  });

  it("the page is laid out at the head's physical size, not at one dot per point", () => {
    // 576 dots at 203 dpi is 2.837 in = 204.28 pt. A page at 1 dot = 1 pt would be 576 pt (8 in),
    // 2.8× oversize, and every judgement about type size made against it would be wrong.
    const pdf = encodePagesPdf(simulate(document(INIT, ascii("A"), LF, CUT), TH230));
    const box = readPdf(pdf).boxes[0]?.split(" ") ?? [];
    expect(Number(box[2])).toBeCloseTo((576 * 72) / 203, 3);
  });

  it("two renders of the same document are byte-identical — no clock anywhere", () => {
    // The first thing anyone does with two of these files is diff them. A `/CreationDate` or an
    // `/ID` would make every rerun look like a layout change.
    const doc = document(INIT, ascii("KOT 142"), LF, CUT);
    expect([...encodePagesPdf(simulate(doc, TH230))]).toEqual([
      ...encodePagesPdf(simulate(doc, TH230)),
    ]);
  });
});

describe("the artefact — PNG (`18 §10`'s snapshot page)", () => {
  it("is a PNG with no `tIME` chunk, and is byte-identical across renders", () => {
    const doc = document(INIT, ascii("KOT 142"), LF, CUT);
    const first = encodePagePng(simulate(doc, TH230)[0] as never);
    const second = encodePagePng(simulate(doc, TH230)[0] as never);
    expect([...first.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(Buffer.from(first).toString("latin1")).not.toContain("tIME");
    expect([...first]).toEqual([...second]);
  });
});

// ── DEFERRED — what this suite could NOT assert, and who owns it ────────────────────────────────
//
// * **Whether a real cutter cuts where this walk ends a page.** `03-F10`'s rig, K-8. The page
//   boundary here is a DECLARED interpretation of `03-F42`, not a measurement.
// * **Whether any of this is LEGIBLE.** `27-F35`'s ≥85% comprehension / ≤5% critical-confusion gate
//   is a post-training retest with real staff on real thermal paper. Owed with K-8. A PDF at 203
//   dpi on a laptop is not evidence for it in either direction.
// * **Whether the ENCODER and this walk share a misconception.** They were written from the same
//   command-set reading, so they can agree and both be wrong; `03-F40`'s two incompatible sensor
//   bit layouts is the documented instance. Only hardware separates them.
// * **`03-F41`'s hold and `03-F40`'s sensor.** Neither is in this module — `simulate()` takes a page
//   width and nothing else. `virtual-printer.test.ts` and `transport.test.ts` own them.
