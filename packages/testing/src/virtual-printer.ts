/**
 * The virtual printer (`18 §10`): "implements `Transport` and renders output to PNG for snapshot
 * tests; CI runs receipt/KOT snapshots for every layout change".
 *
 * **NO HARDWARE IS INVOLVED AND NONE IS CLAIMED.** This is a JavaScript object that hands a
 * `Uint8Array` of ESC/POS to a software walk and keeps the pages it comes back with. `03-F10`'s rig
 * procedure — pulling a real roll out of a real printer mid-job — is owed in full, and the
 * paper-out model below is the SOFTWARE shape of it: it proves this code's arithmetic and nothing
 * about firmware.
 *
 * **THE BYTE→PAGE INTERPRETATION IS NOT HERE ANY MORE, AND THAT IS THE POINT.** It lives in
 * `@restos/escpos`'s `simulate.ts`, where ESC/POS meaning lives (`18 §10`), because a second
 * consumer needed it — `apps/pos-electron`'s file transport, so a till with no hardware can still
 * produce a document a human can look at. Two walks over one command set diverge, and then a
 * document looks right in this suite and wrong in the app, or the reverse; `03-F40`'s two
 * incompatible bit layouts for one sensor is the corpus's own example of that class. This file is
 * now only the DEVICE: the `Transport` shape, `03-F41`'s hold, and `03-F10`'s roll controls.
 *
 * Three FRs decide that behaviour:
 *
 *   * `03-F42` — a document is transmitted as ONE unit, so `send` takes a whole `Uint8Array` and
 *     there is no way to hand it a fragment. A ≥2 s gap mid-document has nowhere to occur.
 *   * `03-F41` — a printer with no paper HOLDS the job. `send` answers `stalled` (never `failed`),
 *     keeps the bytes, and prints them EXACTLY ONCE when the roll is replaced. A spooler that
 *     re-transmits gets two pages, which is the duplicate KOT the FR exists to prevent.
 *   * `03-F40` — the paper query is answered while the printer is "offline", because that is the
 *     property that makes `DLE EOT 4` the right command. Near-end is model-gated from the
 *     capability record and reports `"unsupported"` where the model has no sensor.
 */

// @unreached-by-design TEST-SUPPORT PACKAGE (`18 §12`). The virtual printer renders emitted
// bytes to a PNG for snapshot tests; the shipped transport is `unattachedPrinter` in
// `apps/pos-electron/src/main/printing.ts`, and a till that "printed" to a PNG would be exactly
// the dishonesty `03-F5` forbids. K-8 replaces the shipped transport with hardware, not this.
import { encodePagePng, type PageOverflow, simulate } from "@restos/escpos";

export type { PageOverflow } from "@restos/escpos";

/**
 * The part of `03 §7` layer 3's capability record this device reads.
 *
 * Declared structurally rather than imported from `capability.ts`: `18 §10` gives this fake the
 * `Transport` seam and not the capability record, and the real record stays structurally assignable
 * here. `has_near_end_sensor` is `03-F40`'s model gate and is this device's alone — `simulate()`
 * takes `dots` and nothing else, because a page walk has no business reading a sensor flag.
 */
export type VirtualPrinterCapability = {
  /** `03-F5`'s precedent: an outcome names the printer. */
  model_id: string;
  /** `03 §7`: the print head's width in dots — the width of the page it can put ink on. */
  dots: number;
  /** `03-F40`: whether this model has a paper NEAR-END sensor at all. */
  has_near_end_sensor: boolean;
};

/** One document as it was sent, and the page it printed. */
export type PrintedDocument = {
  /** The bytes handed to `send`, unaltered — a fake that loses bytes is a fake that hides defects. */
  bytes: Uint8Array;
  /**
   * `18 §10`'s snapshot artefact: the document's FIRST page.
   *
   * `simulate()` ends a page at `GS V` and the encoder puts the cut last, so an ordinary ticket has
   * exactly one page and this is it. `pages` carries all of them, so a document with an interior
   * cut cannot lose content silently through this field.
   */
  png: Uint8Array;
  /** Every page, in order. One entry per `GS V`-terminated section (`03-F42`). */
  pages: readonly Uint8Array[];
  /**
   * `03-F36`: what did not fit on the paper, which the PNG cannot show by definition.
   *
   * Summed across the document's pages, because the question this answers is "did this DOCUMENT
   * ask for ink the paper could not hold" and a per-page figure would let a caller read the first
   * page's clean zero as the document's.
   */
  overflow: PageOverflow;
};

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
    const printed = simulate(bytes, capability);
    const overflow: PageOverflow = { discarded_dots: 0, max_x: null };
    for (const page of printed) {
      overflow.discarded_dots += page.overflow.discarded_dots;
      if (page.overflow.max_x === null) continue;
      overflow.max_x =
        overflow.max_x === null
          ? page.overflow.max_x
          : Math.max(overflow.max_x, page.overflow.max_x);
    }
    const rendered = printed.map((page) => encodePagePng(page));
    pages.push({
      bytes,
      // `simulate()` never returns an empty page list — a document that placed no ink still yields
      // one blank page — so this cannot be `undefined` in practice; the fallback exists so a page
      // list that ever did come back empty produces a zero-length artefact rather than a crash
      // inside the instrument, about a document that is fine.
      png: rendered[0] ?? new Uint8Array(0),
      pages: rendered,
      overflow,
    });
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
