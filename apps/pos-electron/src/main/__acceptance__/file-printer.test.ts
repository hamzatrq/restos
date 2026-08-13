// THE FILE PRINTER — and the four things that must stay true about it.
//
// ⚠ AUTHORSHIP (`24 §3` step 2): written by the session that wrote `file-printer.ts`, alongside it.
// Not an independent oracle; `kot-printing.test.ts` and `cash-slip-printing.test.ts` are the
// instruments that measure this app's printing behaviour and neither was touched. What this suite
// owns is the four properties those two cannot see, because the transport postdates them.
//
// ⚠ **THIS SUITE DOES NOT CLOSE K-8 AND NO ASSERTION IN IT MAY BE READ AS IF IT DID.** No printer
// has ever been attached to this product. Every page below is what OUR ENCODER thinks the bytes
// mean, rendered by the same `simulate()` the snapshot suite uses, from the same reading of the
// command set the encoder was written from — so a misconception the two SHARE is invisible here by
// construction (`03-F40`'s two incompatible bit layouts for one sensor is the corpus's own
// instance). Nothing here says whether a real TH230 cuts where a page ends, feeds where `ESC d n`
// says, or reports paper-out as modelled; `03-F10`'s rig owes all three. Nothing here says whether
// any of it is LEGIBLE: `27-F35`'s ≥85% comprehension / ≤5% critical-confusion gate is a
// post-training retest with real staff on thermal paper, and it is OWED.
//
//   §A the DEFAULT is no printer, and the `03-F5` band survives it — the hazard that matters most
//   §B a document actually reaches the disk, and the file carries the dots that were sent
//   §C the app reads the ONE interpretation and never `packages/testing`
//   §D the seam: `main/index.ts` is what chooses, and it chooses from the environment

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { printerCapability } from "@restos/escpos";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filePrinter, PRINT_TO_FILE_ENV, printerTransport } from "../file-printer";

const CAPABILITY = printerCapability("TH230");

/** `ESC @` … `LF` `GS V` — the shape `render()` emits, hand-built so no encoder is in the loop. */
const INIT = [0x1b, 0x40];
const LF = [0x0a];
const CUT = [0x1d, 0x56, 0x00];
const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));
const document = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat());

/** `GS v 0` raster — the ink source, because the caller states the dots. */
const raster = (rows: readonly number[][]): number[] => {
  const bytesPerRow = Math.ceil((rows[0]?.length ?? 0) / 8);
  const data: number[] = [];
  for (const row of rows) {
    for (let byte = 0; byte < bytesPerRow; byte += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) if (row[byte * 8 + bit] === 1) value |= 1 << (7 - bit);
      data.push(value);
    }
  }
  const size = [bytesPerRow & 0xff, bytesPerRow >> 8, rows.length & 0xff, rows.length >> 8];
  return [0x1d, 0x76, 0x30, 0x00, ...size, ...data];
};

let directory = "";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "restos-print-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const files = (): string[] => readdirSync(directory).sort();

/** An independent PDF reader — the artefact is never decoded with the code that wrote it. */
const readPdf = (bytes: Uint8Array) => {
  const text = Buffer.from(bytes).toString("latin1");
  const dict =
    /\/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceGray \/BitsPerComponent 8 \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g;
  const images: { width: number; height: number; pixels: Uint8Array }[] = [];
  for (let hit = dict.exec(text); hit !== null; hit = dict.exec(text)) {
    const at = hit.index + hit[0].length;
    images.push({
      width: Number(hit[1]),
      height: Number(hit[2]),
      pixels: new Uint8Array(inflateSync(bytes.subarray(at, at + Number(hit[3])))),
    });
  }
  return {
    isPdf: text.startsWith("%PDF-") && text.endsWith("%%EOF\n"),
    pageCount: Number(/\/Type \/Pages \/Count (\d+)/.exec(text)?.[1] ?? -1),
    images,
  };
};

describe("§A the DEFAULT is no printer — 03-F5's band is the honest signal", () => {
  it("with no environment set, the transport is the UNATTACHED one and writes nothing", async () => {
    // THE HAZARD THIS WHOLE SUITE EXISTS FOR. `unattachedPrinter` reporting `no_response` on every
    // transmit is what drives `03-F4`'s budget to exhaustion and puts `03-F5`'s band on the counter
    // within 45 s — the one thing telling an operator that this device has no printer (`00 §5.7`).
    // A simulator that quietly became the default would suppress that band and the till would look
    // like it was printing. `failed`, never `stalled`: a stall holds the job forever and never
    // exhausts the budget, which is a silent KOT failure manufactured by the seam.
    const transport = printerTransport(CAPABILITY, {});
    const outcome = await transport.send(document(INIT, ascii("KOT 142"), LF, CUT));
    expect(outcome.ok, "a device with no printer reported a successful transmit").toBe(false);
    expect(outcome).toEqual({
      ok: false,
      state: "failed",
      reason: "no_response",
      model_id: "TH230",
    });
    expect(files(), "a document was written with no environment set").toEqual([]);
  });

  it("an EMPTY value is not a directory, and does not turn it on", async () => {
    // `RESTOS_PRINT_TO_FILE=` in a shell profile is an unset variable that is present. Selecting on
    // presence alone would write every KOT to a file called `<cwd>` and report `ok`.
    const outcome = await printerTransport(CAPABILITY, { [PRINT_TO_FILE_ENV]: "" }).send(
      document(INIT, ascii("KOT 142"), LF, CUT),
    );
    expect(outcome.ok).toBe(false);
    expect(files()).toEqual([]);
  });

  it("with the directory set, the file transport is chosen", async () => {
    // The other side of the same branch. Without this, §A's assertions are satisfied by a selector
    // that returns `unattachedPrinter` unconditionally — a default that is always right and a
    // feature that never works.
    const outcome = await printerTransport(CAPABILITY, { [PRINT_TO_FILE_ENV]: directory }).send(
      document(INIT, ascii("KOT 142"), LF, CUT),
    );
    expect(outcome).toEqual({ ok: true });
    expect(files().length).toBe(1);
  });
});

describe("§B the document reaches the disk, and the file carries what was sent", () => {
  it("writes ONE pdf per document, and it is a PDF", async () => {
    const transport = filePrinter(CAPABILITY, { directory });
    await transport.send(document(INIT, ascii("KOT 1"), LF, CUT));
    await transport.send(document(INIT, ascii("KOT 2"), LF, CUT));
    const written = files();
    expect(written.length, "03-F42 — one document is one transmitted unit and one file").toBe(2);
    expect(written[0]?.startsWith("0001-")).toBe(true);
    expect(written[1]?.startsWith("0002-")).toBe(true);
    expect(written.every((name) => name.endsWith(".pdf"))).toBe(true);
  });

  it("the pdf's image carries the exact dots the document asked for", async () => {
    // The ink is a RASTER, so the assertion is independent of the font table and the cell metrics:
    // the caller stated the dots. This is what a transport reporting `ok` with an empty, blank or
    // placeholder file cannot pass — "a file appeared" is a much weaker claim than this one.
    const rows = [
      [1, 0, 0, 0, 0, 0, 0, 1],
      [0, 1, 1, 0, 0, 1, 1, 0],
      [0, 0, 0, 1, 1, 0, 0, 0],
    ];
    await filePrinter(CAPABILITY, { directory }).send(document(INIT, raster(rows), CUT));
    const pdf = readPdf(new Uint8Array(readFileSync(join(directory, files()[0] as string))));
    expect(pdf.isPdf, "the file is not a PDF").toBe(true);
    expect(pdf.pageCount).toBe(1);
    const image = pdf.images[0];
    expect(image?.width).toBe(CAPABILITY.dots);
    expect(image?.height).toBe(rows.length);
    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < CAPABILITY.dots; x += 1) {
        expect(
          image?.pixels[y * CAPABILITY.dots + x],
          `dot ${x},${y} is wrong in the written file`,
        ).toBe((rows[y]?.[x] ?? 0) === 1 ? 0x00 : 0xff);
      }
    }
  });

  it("a cut ends a page, so a two-ticket document is a TWO-page pdf", async () => {
    // `03-F42`'s boundary, all the way through to the artefact a human opens. Without it the file
    // is one long strip and two tickets are indistinguishable from one.
    await filePrinter(CAPABILITY, { directory }).send(
      document(INIT, ascii("KOT 1"), LF, CUT, ascii("KOT 2"), LF, CUT),
    );
    const pdf = readPdf(new Uint8Array(readFileSync(join(directory, files()[0] as string))));
    expect(pdf.pageCount, "the cut did not end a page in the written file").toBe(2);
    expect(pdf.images.length).toBe(2);
  });

  it("a write failure is reported as a link error, never as a successful print", async () => {
    // `03-F5` forbids a silent failure and `00 §5.7` makes the device report what it knows. A
    // transport that answered `ok` and wrote nothing would mark the job `printed` in the durable
    // spool (`03-F4`) with nothing to show for it. `\0` cannot appear in a POSIX path, so the
    // filesystem refuses this one for a reason no cleanup can undo.
    const outcome = await filePrinter(CAPABILITY, { directory: `${directory}/\0bad` }).send(
      document(INIT, ascii("KOT 142"), LF, CUT),
    );
    expect(outcome.ok, "a failed write was reported as a successful print").toBe(false);
    expect(outcome).toMatchObject({ state: "failed", reason: "link_error", model_id: "TH230" });
  });

  it("two renders of the same document produce the same file, byte for byte", async () => {
    // No clock in the name and none in the bytes: the first thing anyone does with two of these is
    // diff them, and a timestamp would make every rerun look like a layout change.
    const doc = document(INIT, ascii("KOT 142"), LF, CUT);
    const second = mkdtempSync(join(tmpdir(), "restos-print-"));
    try {
      await filePrinter(CAPABILITY, { directory }).send(doc);
      await filePrinter(CAPABILITY, { directory: second }).send(doc);
      expect(readdirSync(second)).toEqual(files());
      expect([...readFileSync(join(second, files()[0] as string))]).toEqual([
        ...readFileSync(join(directory, files()[0] as string)),
      ]);
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe("§C the app reads the ONE interpretation", () => {
  const SOURCE = readFileSync(new URL("../file-printer.ts", import.meta.url), "utf8");

  it("imports `simulate` from @restos/escpos and never reaches @restos/testing", () => {
    // `18 §12` marks `packages/testing` `@unreached-by-design` — "reaching it would BE the bug" —
    // and a second walk over the same command set is the other way to get this wrong. Both halves
    // are asserted: the app calls the shared interpretation, and it does not carry a copy. The
    // matching half (that `packages/testing` calls the same one) is in
    // `packages/testing/src/__acceptance__/one-interpretation.test.ts` §B.
    expect(SOURCE).toMatch(/import\s*\{[^}]*\bsimulate\b[^}]*\}\s*from\s*"@restos\/escpos"/);
    expect(SOURCE, "the app imports a test-support package").not.toContain("@restos/testing");
    for (const forbidden of [/FONT_5X7/, /CELL_W/, /deflateSync/]) {
      expect(
        forbidden.test(SOURCE),
        `a second ESC/POS interpretation is growing back here: ${forbidden.source}`,
      ).toBe(false);
    }
  });

  it("says out loud that it is not hardware and does not close K-8", () => {
    // Not decoration. A simulator whose header stops saying so is a simulator someone will cite as
    // a physical pass — the exact claim `packages/escpos/CLAUDE.md` and `03-F10` reserve for K-8.
    expect(SOURCE).toContain("K-8");
    expect(SOURCE).toContain("27-F35");
  });
});

describe("§D the seam — main/index.ts is what chooses", () => {
  const mainSrc = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

  it("constructs the spooler's transport through `printerTransport(…, process.env)`", () => {
    // The wave's named defect, one argument along, twice already (`store.pinAttempts`,
    // `createSpooler`'s store): a correct module the shipped app never reaches. A selector that no
    // production code calls is a file that renders nothing, and `pnpm seams:check` sees the export
    // but not which branch the app takes.
    expect(mainSrc).toMatch(/createSpooler\s*\(\s*\{[^}]*\btransport\s*:\s*printerTransport\s*\(/);
    expect(mainSrc, "the selector cannot see the environment").toMatch(
      /printerTransport\s*\([^;]*process\.env/,
    );
  });
});

// ── DEFERRED — what this suite could NOT assert ─────────────────────────────────────────────────
//
// * **K-8, in full.** No hardware. Whether a cutter cuts where a page ends, whether the feed lands
//   where `ESC d n` says, whether paper-out reports as `03-F40`/`03-F41` model it — all `03-F10`
//   rig questions. Note that **paper never runs out in this transport**, so `03-F41`'s hold (whose
//   failure mode is a DUPLICATE KOT) is unreachable through it and untested by anything here.
// * **`27-F35`'s comprehension gate.** ≥85% correct / ≤5% critical confusion on a post-training
//   retest with real staff. A PDF on a laptop is not evidence for it in either direction. OWED.
// * **Whether the shared interpretation is RIGHT.** Both consumers now read the same walk, so they
//   agree by construction — including when they are both wrong. Only hardware separates them.
// * **That the operator ever sees the file.** There is no UI for this and none is planned here; the
//   directory is opened by hand.
