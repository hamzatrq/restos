// ONE INTERPRETATION OF THE COMMAND SET, NOT TWO.
//
// ⚠ AUTHORSHIP (`24 §3` step 2): written by the session that moved the byte→page walk out of this
// package and into `@restos/escpos`, alongside that move. It is not an independent oracle —
// `virtual-printer.test.ts` is, it was authored from spec text by a session that read no
// implementation, and it remains the instrument that measures the virtual printer's BEHAVIOUR.
// This file asserts the one property that oracle cannot see, because it postdates it: that there is
// exactly one walk in the repository and this package calls it.
//
// ── Why the property is worth a test of its own ─────────────────────────────────────────────────
//
// `apps/pos-electron` needed a transport that writes a document to a file, so a till with no
// hardware still produces something a human can look at. `18 §12` marks this package
// `@unreached-by-design` — "reaching it would BE the bug" — so the app cannot import the virtual
// printer, and the obvious move was to give the app its own walk over the same commands. TWO WALKS
// IS THE DEFECT: they diverge, and then a document looks right in this suite and wrong in the app,
// or the reverse, which is worse because this suite is the instrument. `03-F40`'s two incompatible
// bit layouts for one sensor is the corpus's own worked example of that class — two readings of one
// command set, both plausible, silently disagreeing.
//
// So the walk moved to where ESC/POS meaning lives (`18 §10`, `@restos/escpos/simulate.ts`) and
// both consumers read it. Two assertions, because the property has two halves and each half passes
// on its own while the whole thing is broken:
//
//   §A BEHAVIOURAL — the page this package produces is the page `simulate()` produces. A fork that
//      happened to agree today would pass this and drift tomorrow, which is why §B exists.
//   §B STRUCTURAL  — there is no second walk in this file to drift. A behavioural check alone
//      blesses a copy that is currently identical; that is the "mutate the SEAM, not the logic"
//      lesson from the spooler store, applied to an interpretation instead of an object.
//
// ⚠ NO HARDWARE. Neither half is evidence about a printer, and K-8 is owed in full.

import { readFileSync } from "node:fs";
import { encodePagePng, simulate } from "@restos/escpos";
import { describe, expect, it } from "vitest";
import { createVirtualPrinter } from "../virtual-printer.js";

const CAPABILITY = { model_id: "TH230", dots: 576, has_near_end_sensor: false };

/** `ESC @` — initialise (`03-F30`). */
const INIT = [0x1b, 0x40];
/** `LF` — print and line feed. */
const LF = [0x0a];
/** `GS V m` — cut, which `03-F42` makes the end of a transmitted unit. */
const CUT = [0x1d, 0x56, 0x00];
const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));
const document = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat());

/** `ESC @`, text, `LF`, `GS V` — the shape every document this package renders actually has. */
const DOCUMENT = document(INIT, ascii("KOT 142"), LF, CUT);

const SOURCE = readFileSync(new URL("../virtual-printer.ts", import.meta.url), "utf8");

describe("§A the virtual printer's page IS `simulate()`'s page", () => {
  it("renders byte-for-byte what @restos/escpos renders for the same document", async () => {
    const device = createVirtualPrinter({ capability: CAPABILITY });
    await device.send(DOCUMENT);
    const page = device.printed()[0];
    const expected = simulate(DOCUMENT, CAPABILITY).map((p) => encodePagePng(p));
    expect(page?.pages.map((png) => [...png])).toEqual(expected.map((png) => [...png]));
    expect(
      [...(page?.png ?? [])],
      "the snapshot artefact is not the document's first page",
    ).toEqual([...(expected[0] ?? [])]);
  });

  it("reports the same overflow `simulate()` counted (03-F36)", async () => {
    // A raster 640 dots wide on a 576-dot head: 64 columns per row have nowhere to go. Off-paper
    // ink leaves no mark, so this number is the only way either side can say it happened — and a
    // fork that dropped the accounting would still produce an identical-looking page.
    // `GS v 0`, 80 bytes per row (640 dots) × 2 rows, every bit set.
    const rasterHeader = [0x1d, 0x76, 0x30, 0x00, 80, 0x00, 2, 0x00];
    const wide = document(INIT, rasterHeader, new Array(160).fill(0xff), CUT);
    const device = createVirtualPrinter({ capability: CAPABILITY });
    await device.send(wide);
    expect(device.printed()[0]?.overflow).toEqual({ discarded_dots: 128, max_x: 639 });
    expect(device.printed()[0]?.overflow.discarded_dots).toBe(
      simulate(wide, CAPABILITY).reduce((total, p) => total + p.overflow.discarded_dots, 0),
    );
  });
});

describe("§B there is no second walk in this package to drift", () => {
  it("virtual-printer.ts calls @restos/escpos's `simulate` and does not re-implement it", () => {
    expect(SOURCE, "the virtual printer does not import the shared walk").toMatch(
      /import\s*\{[^}]*\bsimulate\b[^}]*\}\s*from\s*"@restos\/escpos"/,
    );
    // The four things a second walk cannot be written without: the ESC and GS opcodes, a font
    // table, and the cell geometry. Their ABSENCE is the assertion — a copy of the walk brings
    // them back, and this reddens the moment it does. Anchored on the marker comment too, so the
    // check cannot pass vacuously against an emptied file.
    expect(SOURCE).toContain("@unreached-by-design");
    for (const forbidden of [/0x1b/, /0x1d/, /FONT_5X7/, /CELL_W/, /deflateSync/]) {
      expect(
        forbidden.test(SOURCE),
        `a second ESC/POS interpretation is growing back here: ${forbidden.source}`,
      ).toBe(false);
    }
  });
});

// ── DEFERRED ────────────────────────────────────────────────────────────────────────────────────
//
// * **That the ONE interpretation is CORRECT** is not asserted anywhere and cannot be here. Both
//   consumers now share a reading of the command set, so they agree by construction — including
//   when they are both wrong. Only hardware separates them (`03-F10`'s rig, K-8).
// * **`apps/pos-electron`'s half of the same property** — that the app's file transport reads
//   `simulate()` and never this package — is asserted in
//   `apps/pos-electron/src/main/__acceptance__/file-printer.test.ts` §C, because a test here cannot
//   see the app and `18 §12` forbids the edge that would let it.
