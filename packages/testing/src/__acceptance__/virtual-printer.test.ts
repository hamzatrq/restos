// Acceptance tests — K-3, part 2 of 2: the virtual printer, and through it the `Transport`
// interface it implements.
//
// Part 1 — the paper sensor's bit maps, the stall classification, the real-time query cap and the
// error-recovery request — lives in `packages/escpos/src/__acceptance__/transport.test.ts`.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `18 §10` — "document model … → encoder → `Transport` interface"; "The **virtual printer** (in
//              `packages/testing`) implements `Transport` and renders output to PNG for snapshot
//              tests; CI runs receipt/KOT snapshots for every layout change."
//   `03-F42` — a document is rendered whole, buffered and transmitted as ONE unit; no I/O wait
//              interleaved inside a document.
//   `03-F41` — a stalled printer HOLDS the job until the roll is replaced; `stalled` ≠ `failed`;
//              never re-transmit; a duplicate KOT is a real kitchen error.
//   `03-F40` — the real-time paper query is answered while the printer is OFFLINE; near-end is
//              model-gated from the capability record.
//   `03-F10` — "pull the roll mid-job and assert the spooler reports `stalled` … then assert
//              reloading prints the job EXACTLY ONCE."
//   `03-F36` — absolute dot positioning is banned.
//   `03 §7`  — the capability record; "Font A = 12" dots per cell; layout is expressed in columns.
//   `27-F55` — paper's four channels: ink density, character size, vertical position and grouping
//              whitespace, rasterised glyphs.
//   `27-F56` — the ladder: inverted solid fill, 2×2 size, normal. Bold is not a level.
// No K-3 implementation was read; none exists. `plans/wave-1/kot-printing.md` was deliberately NOT
// read, and neither was `@restos/escpos`'s encoder — every document below is hand-built from the
// published ESC/POS command set, because a renderer checked only against the encoder that feeds it
// proves that two halves of one design agree, which is not the property `18 §10` needs.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion is about pixels in a PNG that a JavaScript object produced from a `Uint8Array`.
// `03-F10`'s rig step — pulling a real roll out of a real printer mid-job — is owed in full and
// none of these tests substitutes for it. "The printer holds the job" below means "this fake held
// it"; the firmware claim belongs to `03-F41` and to the rig.
//
// ── WHY THE OWN TESTS OF THIS FAKE MATTER MORE THAN USUAL ──
//
// `18 §10` makes the virtual printer the oracle for every receipt and KOT snapshot in CI. A
// snapshot suite inherits its oracle's errors and reports green, so a renderer that transposes a
// raster, drops the last byte of a row, or ignores `GS B` would make every document suite built on
// it agree with a wrong picture. That is why nothing below compares a PNG to a stored PNG: the
// page is DECODED (by a reader in this suite's own oracle surface, built on `node:zlib` and not on
// the implementation's `pngjs`) and its dots are asserted against the bits that were sent.
//
// ── WHAT IS GREEN ON THE RED RUN, AND WHY (stated so the count is not read as coverage) ──
//
// Six of the 23 tests pass, and all six are ORACLE SELF-TESTS: they exercise the PNG reader
// against pages built inside this suite and against hand-derived scanline expectations, and they
// observe nothing in `packages/testing`'s exports. The other 17 fail with
// `@restos/testing.createVirtualPrinter is not implemented yet (K-3, 18 §10)`.
//
// The six are here because the reader is the instrument every other assertion in this file is
// measured with, and an instrument nobody calibrated is worth nothing — K-2's rule for its ESC/POS
// walker and its QR decoder, inherited.
//
// ── FR AMBIGUITIES AND CONFLICTS, REPORTED RATHER THAN FILLED ──
//
//  1. **`18 §10` says "renders output to PNG" and specifies NO page geometry.** Nothing states the
//     page's dot width, its margins, the line height, or what a cut looks like on the rendered
//     roll. This suite pins only the width, to `03 §7`'s `dots`, because that is the sole width in
//     the corpus and a page narrower than the head cannot show `03-F36`'s off-paper failure. It
//     asserts NOTHING about margins or line height: every geometric assertion below is expressed
//     as a RELATION (this glyph is 12 dots right of that one; this box is twice that box), which
//     is what `03-F36` means by "layout is expressed in columns" and what makes the suite
//     survive a margin the FRs never specified.
//  2. **K-1's `PRINTABLE_DOTS_NOTE` is inherited unresolved.** `03 §7` cannot reproduce its own
//     44/42/48 column figures at 576 dots, so `dots` (the head) is not the printable width, and the
//     record has no field for the difference. The page width asserted here is `dots`. If the
//     implementation renders the printable width instead, that is the FR's defect surfacing, not
//     this suite's — and it is a finding for the test-owning session either way.
//  3. **THE DEFAULT FONT IS NOT STATED.** No document below selects a font (`ESC M`), so the
//     printer is in its power-on font, which the published command set makes Font A. The 12-dot
//     advance asserted below is `03 §7`'s Font A cell. If a virtual printer defaults to Font B the
//     advance is 9 and the assertion fails — correctly, because `03-F49`'s column counts are
//     `cols_font_a` unless something selects otherwise.
//  4. **CHARACTER MAGNIFICATION IS ASSUMED TO BE PIXEL DOUBLING.** `27-F56`'s 2×2 rung and
//     `27-F55`'s "character size (1×, 2× width, 2× height, 2×2)" describe a magnification, not a
//     second typeface. The assertion below is that the inked box is exactly twice as wide and
//     twice as tall. A renderer using a distinct large font would fail it; no FR rules, and this
//     is named rather than softened, because softening it to "bigger" would admit a renderer that
//     scaled by 1.5 and broke every column count in `03 §7`.
//  5. **AN UNRENDERABLE COMMAND'S BEHAVIOUR IS UNSTATED.** Nothing says what the fake does with
//     bytes it does not implement. It THROWS here, and the reason is `18 §10`'s own: this thing is
//     the CI oracle, and a renderer that silently drops what it does not understand produces a
//     page that looks right and is not — which is the failure the snapshot suite exists to catch,
//     committed by the instrument. The named alternative (render what it can, report the rest in
//     the printed document) is weaker only because nothing forces anyone to read the report.
//     The MESSAGE's shape is unstated too, and the test below declares it rather than leaving it
//     open: the message renders the offending bytes in hex. Asserting only that something threw is
//     what that test used to do, and `throw new Error("bad document")` satisfies it.
//  6. **WHAT A CUT LOOKS LIKE ON THE PAGE IS UNSTATED**, so nothing here asserts it. One `send` is
//     one printed document (`03-F42`), and that is the only document boundary this suite uses.
//  7. **MID-DOCUMENT PAPER-OUT IS NOT MODELLED.** `03-F42` makes a document one transmitted unit,
//     so the software has no state between "sent" and "not sent". `03-F10`'s "pull the roll
//     mid-job" is a rig procedure and stays owed.
//  8. **`18 §10` ENUMERATES NO `Transport` MEMBERS.** The conformance test below therefore requires
//     the four capabilities the FRs buy, bans the names that would express half a document
//     (`03-F42`), and asserts nothing about a member that is neither. The full FINDING, including
//     what that costs, is in `virtual-printer-oracle-surface.ts`'s header — it is recorded there
//     because that file is where the interface is declared, once, for the whole repo.

import { describe, expect, it } from "vitest";
import * as testing from "../index.js";
import {
  absolutePosition,
  ascii,
  buildGrey8Png,
  CUT,
  createVirtualPrinter,
  type DecodedPng,
  decodePng,
  document,
  FONT_CELL_DOTS,
  feedLines,
  INIT,
  inkBox,
  inkColumns,
  inkKeysIn,
  LF,
  PARTIAL_DOCUMENT_MEMBERS,
  type PrinterCapabilityLike,
  REVERSE_OFF,
  REVERSE_ON,
  rasterImage,
  SIZE_2X2,
  SIZE_NORMAL,
  type TestingK3Api,
  TRANSPORT_REQUIRED_MEMBERS,
  transportConformance,
  VIRTUAL_PRINTER_CONTROLS,
} from "./virtual-printer-oracle-surface.js";

const api = testing as unknown as TestingK3Api;

/** An 80 mm printer. The numbers are `03 §7`'s own worked example for the TM-P80 family. */
const CAPABILITY: PrinterCapabilityLike = {
  model_id: "K3-VIRTUAL-80MM",
  dots: 576,
  dpi: 203,
  cols_font_a: 42,
  cols_font_b: 56,
  has_native_qr: false,
  has_cutter: true,
  raster_ok: true,
  has_near_end_sensor: true,
};

const printer = (capability: PrinterCapabilityLike = CAPABILITY) =>
  createVirtualPrinter(api, capability);

/** Send one document to a fresh printer and decode the page it produced. */
const render = async (
  bytes: Uint8Array,
  capability: PrinterCapabilityLike = CAPABILITY,
): Promise<DecodedPng> => {
  const device = printer(capability);
  await device.open();
  const outcome = await device.send(bytes);
  if (!outcome.ok) {
    throw new Error(`the virtual printer refused the document: ${outcome.state}/${outcome.reason}`);
  }
  const pages = device.printed();
  const last = pages[pages.length - 1];
  if (last === undefined)
    throw new Error("the virtual printer accepted a document and printed no page");
  return decodePng(last.png);
};

const boxOf = (page: DecodedPng, label: string) => {
  const box = inkBox(page);
  if (box === null) throw new Error(`${label}: the page is blank — nothing was rendered`);
  return box;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ORACLE SELF-TESTS — the instrument is calibrated before anything is measured with it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the PNG reader (oracle self-tests — these observe no implementation)", () => {
  it("reads an unfiltered greyscale page: dimensions, samples, and the ink threshold", () => {
    const page = decodePng(
      buildGrey8Png(3, [
        { filter: 0, bytes: [0, 255, 127] },
        { filter: 0, bytes: [128, 10, 200] },
      ]),
    );
    expect({ width: page.width, height: page.height }).toEqual({ width: 3, height: 2 });
    expect([page.sample(0, 0), page.sample(1, 0), page.sample(2, 0)]).toEqual([0, 255, 127]);
    // 127 is ink and 128 is paper: the threshold is stated, so a page rendered in mid-grey cannot
    // be read as "half printed" by accident.
    expect([page.ink(0, 0), page.ink(1, 0), page.ink(2, 0)]).toEqual([true, false, true]);
    expect(page.ink(0, 1)).toBe(false);
    expect(page.ink(99, 99), "outside the page must read as paper").toBe(false);
  });

  it("unfilters Sub, Up, Average and Paeth scanlines against hand-derived bytes", () => {
    // Derived by hand from the PNG filter definitions, NOT by running an encoder — an encoder and
    // a decoder written by one hand cancel each other's mistakes. bpp = 1 for greyscale-8.
    //   Sub:     recon(x) = filt(x) + recon(a)                → [10, 15, 9, 12]   (250+15 wraps)
    //   Up:      recon(x) = filt(x) + recon(b)                → [11, 16, 10, 13]
    //   Average: recon(x) = filt(x) + floor((a + b) / 2)      → [7, 13, 13, 15]
    //   Paeth:   recon(x) = filt(x) + predictor(a, b, c)      → [12, 13, 7, 8]
    const page = decodePng(
      buildGrey8Png(4, [
        { filter: 1, bytes: [10, 5, 250, 3] },
        { filter: 2, bytes: [1, 1, 1, 1] },
        { filter: 3, bytes: [2, 2, 2, 2] },
        { filter: 4, bytes: [5, 0, 250, 1] },
      ]),
    );
    const row = (y: number): number[] => [0, 1, 2, 3].map((x) => page.sample(x, y));
    expect(row(0)).toEqual([10, 15, 9, 12]);
    expect(row(1)).toEqual([11, 16, 10, 13]);
    expect(row(2)).toEqual([7, 13, 13, 15]);
    expect(row(3)).toEqual([12, 13, 7, 8]);
  });

  it("refuses a corrupted page by NAME rather than returning a blank one", () => {
    // A reader that answered "blank" here would report "nothing was printed" about a page that was
    // printed — the exact defect this oracle exists to catch, committed by the oracle.
    const png = buildGrey8Png(2, [{ filter: 0, bytes: [0, 0] }]);
    const corrupted = Uint8Array.from(png);
    corrupted[16] = (corrupted[16] ?? 0) ^ 0xff; // inside IHDR's data
    expect(() => decodePng(corrupted)).toThrow(/CRC mismatch in chunk IHDR/);
    expect(() => decodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(
      /signature mismatch/,
    );
  });

  it("refuses a scanline filter it does not know, and reports which row", () => {
    const png = buildGrey8Png(2, [
      { filter: 0, bytes: [0, 0] },
      { filter: 9, bytes: [0, 0] },
    ]);
    expect(() => decodePng(png)).toThrow(/unknown scanline filter 9 on row 1/);
  });

  it("reads a page whose IDAT is larger than the JS argument limit", () => {
    // The reader used to accumulate IDAT with `idat.push(...data)`. A spread is a CALL, so it is
    // bounded by the stack: measured on node v22.16.0, `[].push(...bytes)` succeeds at 105 593 and
    // throws `RangeError: Maximum call stack size exceeded` at 105 594 — lower still inside a test,
    // because the ceiling falls as the stack deepens. That is the ORACLE failing on a page that is
    // fine, which is the one failure mode this instrument may not have.
    //
    // The rows are pseudo-random from a fixed LCG so the page is DETERMINISTIC and does not deflate
    // away — an all-white page compresses to a few hundred bytes and would test nothing.
    const width = 576; // `03 §7`'s 80 mm head
    const height = 260; // 576 × 260 = 149 760 raw bytes, comfortably past the ceiling
    let seed = 0x2b3c4d5e;
    const next = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 16) & 0xff;
    };
    const rows = Array.from({ length: height }, () => ({
      filter: 0,
      bytes: Array.from({ length: width }, next),
    }));
    const png = buildGrey8Png(width, rows);

    // NON-VACUITY, and it is the whole test: if this page's IDAT came in under the ceiling, the
    // decode below would pass against the defective reader too.
    const idatLength = (() => {
      for (let at = 8; at + 8 <= png.length; ) {
        const length =
          ((png[at] ?? 0) << 24) |
          ((png[at + 1] ?? 0) << 16) |
          ((png[at + 2] ?? 0) << 8) |
          (png[at + 3] ?? 0);
        if (String.fromCharCode(...png.slice(at + 4, at + 8)) === "IDAT") return length;
        at += 12 + length;
      }
      return 0;
    })();
    expect(
      idatLength,
      "the fixture's IDAT is under the argument limit — it proves nothing",
    ).toBeGreaterThan(105_594);

    const page = decodePng(png);
    expect({ width: page.width, height: page.height }).toEqual({ width, height });
    // Filter 0, so every sample is the byte that was written — the page is read, not merely parsed.
    expect(page.sample(0, 0)).toBe(rows[0]?.bytes[0]);
    expect(page.sample(width - 1, height - 1)).toBe(rows[height - 1]?.bytes[width - 1]);
  });

  it("inkBox and inkColumns report what was drawn, and nothing on a blank page", () => {
    const page = decodePng(
      buildGrey8Png(4, [
        { filter: 0, bytes: [255, 255, 255, 255] },
        { filter: 0, bytes: [255, 0, 0, 255] },
      ]),
    );
    expect(inkBox(page)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 1, count: 2 });
    expect(inkColumns(page)).toEqual([1, 2]);
    const blank = decodePng(buildGrey8Png(2, [{ filter: 0, bytes: [255, 255] }]));
    expect(inkBox(blank)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 18 §10 — the virtual printer IS a `Transport`, and a document is one unit.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("18 §10 — the virtual printer implements Transport", () => {
  it("18 §10/03-F42: it implements every declared Transport member and offers no way to send HALF a document", () => {
    // THIS is the assertion `18 §10`'s first-named deliverable rests on, and it is checked against
    // the ONE declaration of `Transport` in the repo — `transportConformance` reads
    // `TRANSPORT_REQUIRED_MEMBERS` and `PARTIAL_DOCUMENT_MEMBERS` from the oracle surface that
    // declares the interface itself. It used to be checked against a hand-copy of four names that
    // nothing tied to the declaration, so a wrong `Transport` passed; that copy is gone.
    //
    // The BAN is `03-F42` made structural: "a chunked or streaming renderer that stalls >2 s
    // mid-ticket gets its ticket cut in half", so the seam must not be able to express half a
    // document. It is a denylist and it cannot state that absence completely — the oracle surface's
    // header FINDING says why (`18 §10` enumerates no members, so a CLOSED allowlist would be a
    // contract this oracle invented). A member that is neither required nor banned is therefore not
    // asserted about here.
    const conformance = transportConformance(printer());
    // Every message carries the members that WERE found. Without it a failure says which name is
    // absent and not what was there instead, which is the difference between "you renamed `send`"
    // and "the factory handed back the wrong object".
    const found = `found: ${conformance.members.join(", ") || "(nothing)"}`;
    expect(
      conformance.missing_transport,
      `a declared Transport member is missing — ${found}`,
    ).toEqual([]);
    expect(conformance.missing_controls, `a declared test control is missing — ${found}`).toEqual(
      [],
    );
    expect(
      conformance.partial_document,
      `the seam can be handed a FRAGMENT of a document — 03-F42's cut-in-half ticket — ${found}`,
    ).toEqual([]);
    // Non-vacuity. Emptying either list turns this test green against anything at all, and an
    // emptied list is exactly how round 2's pattern 2 ("the guard passed by not looking") gets in.
    // Deliberately NOT asserted: a member count. That would be the closed allowlist again, wearing
    // arithmetic instead of a name.
    expect(TRANSPORT_REQUIRED_MEMBERS.length, "the interface declares no members").toBeGreaterThan(
      0,
    );
    expect(VIRTUAL_PRINTER_CONTROLS.length, "the oracle declares no test controls").toBeGreaterThan(
      0,
    );
    expect(PARTIAL_DOCUMENT_MEMBERS.length, "the 03-F42 ban names nothing").toBeGreaterThan(0);
  });

  it("18 §10/03-F42: `send` takes the whole document as ONE argument, and there is no partial form", async () => {
    // Asserted by construction, which the brief prefers over a timing measurement: an interface
    // that accepts only a complete `Uint8Array` cannot be handed half a ticket, so the ≥2 s
    // mid-document gap `03-F42` describes has nowhere to occur at this seam.
    const device = printer();
    expect(device.send.length, "`send` does not take exactly one argument").toBe(1);
    const pending = device.send(document(INIT, ascii("A"), LF));
    expect(pending).toBeInstanceOf(Promise);
    // The OUTCOME is not this test's subject — the shape of the call is — so it is settled rather
    // than asserted, and settled so that a rejection cannot escape as an unhandled one.
    await pending.catch(() => undefined);
  });

  it("03-F42: one send is one printed document, in order, and the bytes are not altered on the way", async () => {
    // A fake that dropped or reordered bytes would make every document suite downstream assert
    // against a page nobody sent. The byte equality is what makes `printed()` usable as evidence.
    const device = printer();
    await device.open();
    const docs = [
      document(INIT, ascii("KOT 1"), LF),
      document(INIT, ascii("KOT 2"), LF),
      document(INIT, ascii("KOT 3"), LF, CUT),
    ];
    for (const doc of docs) expect((await device.send(doc)).ok).toBe(true);
    const pages = device.printed();
    expect(pages.length).toBe(3);
    expect(pages.map((page) => [...page.bytes])).toEqual(docs.map((doc) => [...doc]));
    await device.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 18 §10 — it renders the emitted bytes to PNG, and the picture is the bytes.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("18 §10 — the rendered page is the bytes that were sent", () => {
  it("03 §7: the page is as wide as the print head — a narrower page cannot show an off-paper line", async () => {
    // `03-F36` bans absolute dot positioning because "an `x=384` offset is mid-line at 576 dots and
    // off-paper at 384". A page rendered at some other width could not show that at all. See
    // ambiguity 2: `03 §7`'s `dots` is the only width the corpus supplies.
    const page = await render(document(INIT, ascii("KOT 142"), LF));
    expect(page.width).toBe(CAPABILITY.dots);
    const box = boxOf(page, "a 7-character line");
    expect(box.x1, "ink was rendered past the edge of the paper").toBeLessThan(CAPABILITY.dots);
  });

  it("03-F8: a raster image renders dot for dot — row order, bit order, and the whole last byte", async () => {
    // `GS v 0` declares its width in BYTES, so the page must carry `bytes_per_row × 8` dots; the
    // fixture sets bits in the second byte of a row (x = 14, 15) and a renderer that inferred a
    // narrower logical width would drop them. The pattern is ASYMMETRIC on both axes on purpose:
    // a transposed, row-reversed or LSB-first renderer produces a different picture, and a
    // symmetric fixture would accept all four.
    const rows = [
      [0b1000_0001, 0b0000_0001],
      [0b0100_0000, 0b0000_0000],
      [0b0010_0000, 0b0000_0010],
      [0b0001_0000, 0b0000_0000],
      [0b0000_1000, 0b1000_0001],
    ];
    const page = await render(document(INIT, rasterImage(2, rows.length, rows.flat()), LF));
    // The pattern's own extremes are set (x = 0 and x = 15, y = 0 and y = 4), so its bounding box
    // IS the image and the origin needs no assumption about page margins.
    const box = boxOf(page, "the raster fixture");
    expect({ w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 }).toEqual({ w: 16, h: 5 });
    for (const [y, row] of rows.entries()) {
      for (let x = 0; x < 16; x += 1) {
        const set = (((row[x >> 3] ?? 0) >> (7 - (x & 7))) & 1) === 1;
        expect(page.ink(box.x0 + x, box.y0 + y), `dot ${x},${y}`).toBe(set);
      }
    }
  });

  it("03 §7: a Font A character advances exactly 12 dots — the cell the column count is derived from", async () => {
    // "Layout is … derived as `print_dots ÷ font_cell_dots` (Font A = 12, Font B = 9)". If a glyph
    // does not advance by its cell, every column figure in `03 §7` and every `min_columns` in
    // `03-F49` describes a page the renderer does not produce. Asserted as a set equality over the
    // inked columns — the second `A` must be the first `A` shifted by exactly one cell, which no
    // "roughly wider" assertion can express.
    const one = inkColumns(await render(document(INIT, ascii("A"), LF)));
    expect(one.length, "the glyph inked nothing — the font is blank").toBeGreaterThan(0);
    const two = inkColumns(await render(document(INIT, ascii("AA"), LF)));
    const expected = [...new Set([...one, ...one.map((x) => x + FONT_CELL_DOTS.A)])].sort(
      (a, b) => a - b,
    );
    expect(two).toEqual(expected);
  });

  it("00 §5.6/27-F55: different characters print differently, and a space prints nothing", async () => {
    // The non-vacuity guard for every text assertion in this file. A font that drew the same block
    // for every byte would satisfy the advance test above, the size test below and any snapshot —
    // and would render a KOT that names no dish.
    const a = await render(document(INIT, ascii("A"), LF));
    const b = await render(document(INIT, ascii("B"), LF));
    const boxA = boxOf(a, "glyph A");
    const boxB = boxOf(b, "glyph B");
    const keysA = inkKeysIn(a, boxA);
    const keysB = inkKeysIn(b, boxB);
    expect(keysA.size).toBeGreaterThan(0);
    expect([...keysA].sort(), "A and B render the same dots").not.toEqual([...keysB].sort());
    const space = await render(document(INIT, ascii(" "), LF));
    expect(inkBox(space), "a space put ink on the paper").toBeNull();
  });

  it("27-F56: the 2×2 rung doubles the character in BOTH axes", async () => {
    // `27-F55` lists character size as one of paper's four channels and `27-F56` allocates the 2×2
    // rung to "the item line's quantity and the order/table identifier". A magnification that is
    // not exactly 2× makes `27-F57`'s "a two-digit quantity at 2× width costs 4 columns" false, and
    // that arithmetic is what `03-F49`'s 42-column floor rests on. See ambiguity 4.
    const normal = boxOf(await render(document(INIT, ascii("7"), LF)), "a normal digit");
    const doubled = boxOf(
      await render(document(INIT, SIZE_2X2, ascii("7"), SIZE_NORMAL, LF)),
      "a 2×2 digit",
    );
    expect(doubled.x1 - doubled.x0 + 1).toBe((normal.x1 - normal.x0 + 1) * 2);
    expect(doubled.y1 - doubled.y0 + 1).toBe((normal.y1 - normal.y0 + 1) * 2);
  });

  it("27-F55/27-F56: inverted solid fill is white-on-black — the band is the exact complement of the plain line", async () => {
    // "(1) ink density (normal, bold, and inverted white-on-black solid fill)". Every dot inside the
    // band that carries ink on the plain line must be PAPER here, and every dot that is paper there
    // must be INK — which is what "solid fill" means and what a renderer that merely emboldened, or
    // that drew a black box over the whole cell, both fail. The two documents are identical apart
    // from `GS B`, so the cells land at the same coordinates on both pages.
    const plain = await render(document(INIT, ascii("VOID"), LF));
    const inverted = await render(document(INIT, REVERSE_ON, ascii("VOID"), REVERSE_OFF, LF));
    const band = boxOf(inverted, "the inverted band");
    const plainBox = boxOf(plain, "the plain line");
    expect(band.count, "the inverted band carries no more ink than plain text").toBeGreaterThan(
      plainBox.count,
    );
    for (let y = band.y0; y <= band.y1; y += 1) {
      for (let x = band.x0; x <= band.x1; x += 1) {
        expect(inverted.ink(x, y), `dot ${x},${y} is not the complement`).toBe(!plain.ink(x, y));
      }
    }
  });

  it("27-F58: `ESC d n` feeds n lines — whitespace is a layout channel and the count is honoured", async () => {
    // "Groups are separated by blank lines, not rules." A renderer that treated every feed as one
    // line would collapse `27-F58`'s grouping — the channel that carries the KOT's structure — while
    // still producing a plausible page. Asserted as LINEARITY rather than against a line height the
    // FRs never state (ambiguity 1).
    const heightFor = async (lines: number): Promise<number> => {
      const page = await render(document(INIT, ascii("A"), feedLines(lines), ascii("B"), LF));
      const box = boxOf(page, `a document with a ${lines}-line gap`);
      return box.y1 - box.y0 + 1;
    };
    const [h1, h2, h3] = [await heightFor(1), await heightFor(2), await heightFor(3)];
    expect(h2 - h1, "an extra fed line added no height").toBeGreaterThan(0);
    expect(h3 - h2, "the feed count is not linear").toBe(h2 - h1);
  });

  it("18 §10/03-F30: the same bytes render to a byte-identical PNG, and the page carries no timestamp", async () => {
    // `18 §10` runs these pages as CI snapshots, so a byte that varies per run makes every layout
    // change indistinguishable from every rerun. A `tIME` chunk is the standard way a PNG acquires
    // one, and it is invisible in the picture — the reason this is asserted on the chunk list and
    // not on the pixels.
    const doc = document(INIT, ascii("KOT 142"), feedLines(2), ascii("2x Karahi"), LF, CUT);
    const first = printer();
    const second = printer();
    await first.open();
    await second.open();
    await first.send(doc);
    await first.send(doc);
    await second.send(doc);
    const pages = [...first.printed(), ...second.printed()].map((page) => [...page.png]);
    expect(pages.length).toBe(3);
    expect(pages[1]).toEqual(pages[0]);
    expect(pages[2], "two printers rendered the same bytes differently").toEqual(pages[0]);
    const chunks = decodePng(Uint8Array.from(pages[0] ?? [])).chunks;
    expect(chunks).toContain("IHDR");
    expect(chunks, "the page carries a timestamp chunk").not.toContain("tIME");
  });

  it("03-F36: a command the renderer does not implement is a LOUD failure that names what it saw", async () => {
    // The oracle's own honesty rule (ambiguity 5). Two probes, and the messages must DIFFER: one
    // generic "bad document" for every unknown byte would let a future encoder change slip through
    // as a single stale error, and an error that does not say what it choked on sends the reader
    // to the wrong layer. `ESC $` is the first probe because `03-F36` bans it outright, so no
    // implementation may legitimately render it; the second is an escape the command set does not
    // define at all.
    //
    // "NAMES WHAT IT SAW" is asserted, not just "it threw" — the earlier version of this test
    // checked `!== null` and a non-empty string, which `throw new Error("bad document")` satisfies.
    // Nothing in the corpus specifies an error FORMAT, so the requirement is DECLARED here rather
    // than smuggled (ambiguity 5, extended): the message renders the offending bytes in hex. That
    // is the weakest form that is still actionable — a reader who is told `1b 24` can look it up in
    // the command set, and a reader who is told "bad document" cannot.
    const device = printer();
    await device.open();
    const messageFor = async (bytes: Uint8Array): Promise<string | null> =>
      device
        .send(bytes)
        .then(() => null)
        .catch((error: unknown) => (error as Error).message);

    const banned = await messageFor(document(INIT, absolutePosition(384), ascii("A"), LF));
    const undefinedEscape = await messageFor(document(INIT, [0x1b, 0x7f], ascii("A"), LF));
    expect(banned, "ESC $ was rendered or silently ignored").not.toBeNull();
    expect(undefinedEscape, "an undefined escape was rendered or silently ignored").not.toBeNull();
    expect(banned).not.toBe(undefinedEscape);

    /** Does the message render this byte in hex (`24`, `0x24`, `0X24`)? */
    const names = (message: string | null, byte: number): boolean =>
      new RegExp(`(?:0x)?${byte.toString(16).padStart(2, "0")}\\b`, "i").test(message ?? "");
    // Each message names ITS OWN command, prefix byte included: `ESC $` is `1b 24`, and the second
    // probe is `1b 7f`.
    expect(names(banned, 0x1b) && names(banned, 0x24), `ESC $ was not named in: ${banned}`).toBe(
      true,
    );
    expect(
      names(undefinedEscape, 0x1b) && names(undefinedEscape, 0x7f),
      `ESC 0x7f was not named in: ${undefinedEscape}`,
    ).toBe(true);
    // And names only its own: `0x24` appears in the first probe's document and nowhere in the
    // second's, and `0x7f` the other way round, so this holds even against an implementation that
    // dumps the whole document — while failing one that reports a stale or swapped command.
    expect(names(banned, 0x7f), `the ESC $ message names the OTHER probe: ${banned}`).toBe(false);
    expect(
      names(undefinedEscape, 0x24),
      `the undefined-escape message names the OTHER probe: ${undefinedEscape}`,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 03-F40 / 03-F41 — the roll runs out, and the job that must print EXACTLY ONCE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("03-F41 — the printer holds the job; reloading prints it exactly once", () => {
  it("03-F40: the paper query is answered while the printer is OFFLINE, and it changes with the roll", async () => {
    // "Real-time commands are answered while offline by design" — that is the whole reason
    // `DLE EOT 4` is the sanctioned query and `GS r` is banned. A fake whose `status()` failed or
    // hung once the paper ran out would make a health check look correct here and report "paper
    // present" forever in the kitchen.
    const device = printer();
    await device.open();
    expect((await device.status()).paper_out).toBe(false);
    device.pullRoll();
    expect((await device.status()).paper_out).toBe(true);
    device.loadRoll();
    expect((await device.status()).paper_out).toBe(false);
  });

  it("03-F40: near-end is model-gated at the device too — no sensor, no reading", async () => {
    // The capability record decides, and a printer without the sensor reports `"unsupported"`
    // rather than a `false` that can never become `true` (`03-F40`'s "reports paper present
    // forever", one sensor over).
    const sensorless = printer({ ...CAPABILITY, has_near_end_sensor: false });
    await sensorless.open();
    expect((await sensorless.status()).near_end).toBe("unsupported");
    const sensing = printer();
    await sensing.open();
    expect(typeof (await sensing.status()).near_end).toBe("boolean");
  });

  it("03-F41/03-F10: a document sent to an empty printer STALLS, is held, and prints once when the roll is replaced", async () => {
    // `03-F10`'s rig step in software: "pull the roll mid-job and assert the spooler reports
    // `stalled` (03-F41) … then assert reloading prints the job EXACTLY ONCE." The zero-page
    // assertion below is not "an empty store is empty" — it is one half of a pair, and the other
    // half (the page appears on reload, carrying the same bytes) is what makes it mean "held" and
    // not "dropped". `03-F41`: the printer "**holds** until the roll is replaced".
    const device = printer();
    await device.open();
    device.pullRoll();
    const doc = document(INIT, ascii("KOT 142"), LF, CUT);
    const outcome = await device.send(doc);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // `toBe("stalled")` already excludes `"failed"` — a `.not.toBe("failed")` beside it reads like a
    // second check and is not one. The double-print it used to name is caught by the two tests
    // below: the held job prints EXACTLY once, and a re-transmit prints twice.
    expect(outcome.state, "a held job was not reported as stalled — this is the double-print").toBe(
      "stalled",
    );
    expect(outcome.reason).toBe("paper_out");
    expect(outcome.model_id).toBe(CAPABILITY.model_id);
    expect(device.printed().length).toBe(0);

    device.loadRoll();
    const pages = device.printed();
    expect(pages.length, "the held job did not print exactly once on reload").toBe(1);
    expect([...(pages[0]?.bytes ?? [])], "the held document was not the one sent").toEqual([
      ...doc,
    ]);
  });

  it("03-F41: the duplicate is VISIBLE to this oracle — a re-transmit after a stall prints twice", async () => {
    // The control for the test above, and the reason `03-F41` exists: "a timeout that flips a stall
    // to `failed` and retries **double-prints the instant the roll is loaded** — a duplicate KOT is
    // a real kitchen error." Without this, "exactly once" could be true of a fake that can only
    // ever hold one document, i.e. of an oracle that cannot see the defect it is watching for.
    const device = printer();
    await device.open();
    device.pullRoll();
    const doc = document(INIT, ascii("KOT 142"), LF, CUT);
    await device.send(doc);
    await device.send(doc); // what a spooler that mistook the stall for a failure would do
    device.loadRoll();
    expect(device.printed().length, "the oracle cannot see a duplicate KOT").toBe(2);
  });

  it("03-F41: a stall is not sticky — once the roll is back, ordinary documents print again", async () => {
    // The other direction. A fake that stayed stalled would make every later assertion in a
    // document suite vacuous, and a spooler tested against it would look correct while never
    // recovering.
    const device = printer();
    await device.open();
    device.pullRoll();
    expect((await device.send(document(INIT, ascii("HELD"), LF))).ok).toBe(false);
    device.loadRoll();
    expect((await device.send(document(INIT, ascii("AFTER"), LF))).ok).toBe(true);
    expect(device.printed().length).toBe(2);
    expect([...(device.printed()[1]?.bytes ?? [])]).toEqual([
      ...document(INIT, ascii("AFTER"), LF),
    ]);
  });
});

// ── DEFERRED FROM K-3, DELIBERATELY (stated so the gap is a decision, not an omission) ──
//
// * **NO PRINTER HAS BEEN OBSERVED, AND `03-F10`'s RIG PASS IS OWED IN FULL.** Every claim above
//   is about a JavaScript object. The FR's own step — "pull the roll mid-job … then assert
//   reloading prints the job EXACTLY ONCE" — is a physical procedure, and the software model of it
//   here proves the code's arithmetic and nothing about firmware. `03-F40` is itself a record of
//   what happens when a model of a printer disagrees with the printer.
// * **THE ENCODER→TRANSPORT COMPOSITION IS TESTED NOWHERE.** `@restos/testing` cannot import
//   `@restos/escpos` today, and no component composes `encode` with `send` — the spooler would, and
//   the spooler has no K-task. So every document above is hand-built. When the spooler lands, the
//   composition needs its own test: this is round 2's pattern 4 ("correct in isolation, unconnected
//   in fact"), named in advance rather than discovered.
// * **NO DOCUMENT SUITE EXISTS YET, WHICH IS THE POINT OF THIS ONE.** `18 §10` says "CI runs
//   receipt/KOT snapshots for every layout change". K-4 and K-5 build those. What this suite gives
//   them is a reader they can trust: nothing above compares a page to a stored page, so a snapshot
//   suite built on it inherits a calibrated instrument rather than a first-run picture.
// * **THE QR IS NOT DECODED FROM THE PAGE.** K-2 proved that the encoder's fiscal QR decodes from
//   the BYTES (`jsqr`, a decoder-only dependency, for the reason its own header gives). This suite
//   proves the page reproduces the raster bits dot for dot. The two compose, and the composition is
//   deliberately not re-asserted here: `@restos/testing` would have to take a QR decoder of its own
//   for one assertion whose two halves are already independently held. Whoever writes the fiscal
//   document suite (K-4) should close the loop end to end, and should do it with a decoder rather
//   than a size check — `03-F35`'s trap is that a correctly-sized black rectangle passes everything
//   else.
// * **THE CUT MARK, PAGE MARGINS AND LINE HEIGHT** are unspecified (ambiguities 1 and 6) and are
//   asserted nowhere. Every geometric claim above is a relation between two renders of the same
//   printer, so a later FR may fix any of them without invalidating one assertion here.
// * **FONT B IS NEVER EXERCISED.** `03 §7` derives `cols_font_b` from a 9-dot cell, and no
//   document below selects Font B (`ESC M 1`), so the 9-dot advance is unasserted. It belongs with
//   whichever DocumentSpec first declares a Font B block; `03-F36`'s degradation ladder does not
//   name a font change as one of its rungs, so it may be that nothing ever does.
// * **THE SPOOLER'S STATE MACHINE** (`03-F4`: `queued → transmitting → stalled? → printed | failed`,
//   persisted before the first transmit, 3 attempts over 30 s) is not built and not tested. The
//   virtual printer supplies the `stalled` half of the evidence it will need. See the DEFERRED note
//   in `packages/escpos/src/__acceptance__/transport.test.ts` for the full list of what the spooler
//   owes.
