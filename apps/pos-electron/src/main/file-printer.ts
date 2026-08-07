/**
 * A transport that prints to a FILE, so a till with no hardware still produces a document a human
 * can open.
 *
 * ══ WHAT THIS DOES NOT DO — READ THIS BEFORE CITING IT AS EVIDENCE ══════════════════════════════
 *
 * **THIS DOES NOT CLOSE K-8 AND NOTHING HERE MAY BE READ AS IF IT DID. NO PRINTER HAS EVER BEEN
 * ATTACHED TO THIS PRODUCT.**
 *
 *   1. **It renders what OUR ENCODER thinks the bytes mean**, through `@restos/escpos`'s
 *      `simulate()`, from the same assumptions the encoder was written with. A misconception the
 *      encoder and the simulator SHARE is invisible to it, by construction — `03-F40`'s two
 *      incompatible bit layouts for one sensor is the corpus's own worked example of exactly that
 *      class of error, and no amount of looking at these files would have caught it.
 *   2. **It says nothing about legibility.** `27-F35`'s ≥85% comprehension / ≤5% critical-confusion
 *      gate is a measurement on real staff after training. A PDF on a laptop is not thermal paper
 *      at 203 dpi under kitchen light, and `27-F35` stays OWED in full.
 *   3. **It says nothing about a real TH230.** Whether the cutter cuts where `simulate()` ends a
 *      page, whether the feed lands where `ESC d n` says, and whether paper-out reports as
 *      `03-F40`/`03-F41` model it are all `03-F10` rig questions against hardware that does not
 *      exist here. Note in particular that **paper never runs out in this transport**, so `03-F41`'s
 *      hold — the FR whose failure mode is a DUPLICATE KOT — cannot be exercised through it at all.
 *   4. **It is not the default and must never become one.** With `RESTOS_PRINT_TO_FILE` unset this
 *      device ships `unattachedPrinter`, every transmit reports `no_response`, the retry budget
 *      exhausts and `03-F5`'s band appears on the counter within 45 s. That band is the honest
 *      signal that no printer is attached (`00 §5.7`), and a simulator that quietly suppressed it
 *      would remove the one thing telling an operator the truth about this device. `printerTransport`
 *      below is where that stays true, and `__acceptance__/file-printer.test.ts` §A is what stops it
 *      drifting.
 *
 * ══ Why a file at all ═══════════════════════════════════════════════════════════════════════════
 *
 * `packages/testing`'s virtual printer has rendered ESC/POS to a page since K-3, but `18 §12` marks
 * that package as unreached BY DESIGN — reaching it from an app would BE the bug — so nobody could
 * look at a KOT, a shift-close slip or a day summary without buying hardware. This closes that, and
 * it does so WITHOUT a second interpretation of the command set: the walk moved into
 * `@restos/escpos` (`simulate.ts`, where ESC/POS meaning lives per `18 §10`) and both this file and
 * the virtual printer read it. Two walks would diverge, and then a document would look right in the
 * snapshot suite and wrong here — or the reverse, which is worse, because the suite is the
 * instrument.
 *
 * ══ Why PDF and not PNG ═════════════════════════════════════════════════════════════════════════
 *
 * `03-F42`: a document is rendered whole and transmitted as ONE unit, and the cut is what separates
 * one ticket from the next on the roll. So the artefact is one FILE per document with one PAGE per
 * cut — and PNG has no multi-page form, so a PNG artefact would have to scatter one document across
 * N files and lose exactly the fact `03-F42` exists to protect. PNG stays in `simulate.ts` because
 * `18 §10` names it for the snapshot suite; both serialisers read the same dot matrix.
 *
 * **No dependency was added** (`18 §15` rule 1). `18 §14` lists no PDF library, so the alternative
 * was `18 §15` step 3 — `pdfkit` plus `@types/pdfkit` as Electron-main runtime dependencies, for a
 * file that is never shipped to a customer. `encodePagesPdf` is scaffolding over `node:zlib`, which
 * the PNG writer already used.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyTransmit,
  encodePagesPdf,
  type PrinterCapability,
  type SpoolerTransport,
  simulate,
} from "@restos/escpos";
import { unattachedPrinter } from "./printing";

/**
 * The opt-in, and its VALUE is the directory the documents land in.
 *
 * A directory rather than a `1` flag (`RESTOS_DEV_MENU`'s shape) for one reason: the point of this
 * transport is that someone LOOKS at the output, and a path they chose is a path they can find. It
 * also makes accidental enablement impossible — there is no truthy value that is not also a
 * location.
 */
export const PRINT_TO_FILE_ENV = "RESTOS_PRINT_TO_FILE";

/**
 * What a document is called on disk.
 *
 * A per-process SEQUENCE plus a content digest, and no clock. The sequence is the order the
 * documents were transmitted in, which is the only order a reader cares about; the digest makes two
 * identical documents visibly identical, which is how a duplicate KOT (`03-F7`'s whole concern)
 * shows up in a directory listing instead of hiding behind two different timestamps. A wall-clock
 * name would also make two runs of the same fixture produce different files, and the first thing
 * anyone does with two of these is diff them.
 */
const documentName = (sequence: number, document: Uint8Array): string =>
  `${String(sequence).padStart(4, "0")}-${createHash("sha256").update(document).digest("hex").slice(0, 8)}.pdf`;

export type FilePrinterOptions = {
  /** Where the documents land. Created if it does not exist. */
  directory: string;
};

/**
 * `18 §10`'s `Transport`, writing to the filesystem instead of to a print head.
 *
 * The outcome is `classifyTransmit`'s, never a literal, for the same reason `unattachedPrinter`
 * takes it that way: this seam must not be able to drift from K-3's classifier. A filesystem error
 * is reported as a `link_error` carrying the message — an S1 band that says `no_response` about a
 * full disk sends someone to the wrong layer (`03-F5` requires the alert to be actionable).
 *
 * **It reports `ok` only after the bytes are on disk.** `writeFileSync`, not a queued async write,
 * and the return is inside the `try`: a transport that answered `ok` and then failed to write would
 * mark the job `printed` in the durable spool (`03-F4`) with nothing to show for it, which is the
 * silent KOT failure `03-F5` forbids, manufactured by the one seam standing in for hardware.
 */
export const filePrinter = (
  capability: PrinterCapability,
  { directory }: FilePrinterOptions,
): SpoolerTransport => {
  let sequence = 0;
  return {
    send: async (document: Uint8Array) => {
      sequence += 1;
      try {
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          join(directory, documentName(sequence, document)),
          encodePagesPdf(simulate(document, capability)),
        );
        return classifyTransmit(
          {
            status: { paper_out: false, near_end: "unsupported" },
            timed_out: false,
            link_error: null,
          },
          capability,
        );
      } catch (error) {
        return classifyTransmit(
          { status: null, timed_out: false, link_error: (error as Error).message },
          capability,
        );
      }
    },
    /**
     * A file has no roll and no sensor. The model's own `has_near_end_sensor` answer is reported
     * rather than a blanket `"unsupported"`, so that turning this transport on does not change what
     * the rest of the system believes about the configured printer — but note what follows from it:
     * `paper_out` is permanently `false` here, so `03-F41` is unreachable through this seam and no
     * test using it is evidence about a stall.
     */
    status: async () => ({
      paper_out: false,
      near_end: capability.has_near_end_sensor ? false : "unsupported",
    }),
  };
};

/**
 * **The one place the default is decided, and the default is NO PRINTER.**
 *
 * With `RESTOS_PRINT_TO_FILE` unset or empty this returns `unattachedPrinter`, which reports
 * `no_response` on every transmit and drives `03-F5`'s band — the honest state of a device with no
 * `18 §10` link. The file transport is strictly opt-in, in the same spirit as `RESTOS_DEV_PIN` and
 * `RESTOS_DEV_MENU`, and for a sharper reason than either: those seed data, this one would make a
 * till claim it printed.
 *
 * `env` is a parameter rather than a read of `process.env` inside the function so that the default
 * is assertable without mutating the process — the mutation that matters here is "the file
 * transport is selected with no env set", and a test that has to set and unset a global to check it
 * is a test that can be defeated by ordering.
 */
export const printerTransport = (
  capability: PrinterCapability,
  env: Record<string, string | undefined>,
): SpoolerTransport => {
  const directory = env[PRINT_TO_FILE_ENV];
  if (directory === undefined || directory === "") return unattachedPrinter(capability);
  return filePrinter(capability, { directory });
};
