// K-3 ORACLE SURFACE — an independent PNG reader, hand-built ESC/POS documents, and guarded
// accessors. NOT AN IMPLEMENTATION of the virtual printer.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/18-engineering-handbook.md §10 — "The **virtual printer** (in `packages/testing`)
//     implements `Transport` and renders output to PNG for snapshot tests; CI runs receipt/KOT
//     snapshots for every layout change"; and the `Transport` seam itself.
//   specs/03-kitchen-fulfillment.md 03-F40 — the real-time paper sensor and its model gate.
//   specs/03-kitchen-fulfillment.md 03-F41 — a stalled printer HOLDS the job until the roll is
//     replaced; `stalled` is not `failed`; never re-transmit.
//   specs/03-kitchen-fulfillment.md 03-F42 — a document is rendered whole, buffered and
//     transmitted as ONE unit.
//   specs/03-kitchen-fulfillment.md 03-F36 — absolute dot positioning and space-as-layout banned.
//   specs/03-kitchen-fulfillment.md 03-F10 — the rig's paper-out step, in software here.
//   specs/03-kitchen-fulfillment.md §7    — the capability record; Font A = 12 dots, Font B = 9.
//   specs/27-design-language.md §2b       — 27-F55's four paper channels (ink density, character
//     size, vertical position/whitespace, rasterised glyphs) and 27-F56's ladder.
//
// ── WHY THIS FILE READS PNGs INSTEAD OF COMPARING THEM ──
//
// The virtual printer is the ORACLE for every document suite that follows it (`18 §10`: "CI runs
// receipt/KOT snapshots for every layout change"). A snapshot comparison cannot tell a correct
// renderer from a consistently wrong one — it pins whatever the first run produced — so this suite
// DECODES the PNG and asserts pixels against the bits that were sent. That requires a reader the
// implementation does not share, which is why there is one here, built on `node:zlib` (a Node
// built-in, `18 §14`) and nothing else. The implementation is expected to ENCODE with `pngjs`
// (`18 §14`: "Printing: `pngjs` (virtual printer, logo/QR raster)"); if the oracle decoded with the
// same library the assertion would be a round-trip of one codec against itself.
//
// This is K-2's rule applied one layer up: it took a QR DECODER as a devDependency precisely
// because "the oracle must never encode with [the implementation's dependency], or the assertion
// becomes a tautology". The same reasoning forbids `pngjs` here.
//
// ── NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE ──
//
// Every assertion downstream is about pixels in a PNG that a JavaScript object produced from a
// `Uint8Array`. `03-F10`'s rig procedure (pull the roll mid-job on a real printer) is owed in full
// and nothing here performs it. No test name may be read as a measurement of a printer.
//
// ── FINDING: `18 §10` NAMES THE `Transport` INTERFACE AND ENUMERATES NO MEMBERS ──
//
// It is worth stating in the header rather than in a comment beside the code, because an earlier
// version of this file enforced `["open", "send", "status", "close"]` as a HARD, CLOSED allowlist —
// the virtual printer failed if it carried any other member — and cited `03-F42` for it. `03-F42`
// buys no such closure. Grep the corpus and this is all there is: `18 §10` says "document model
// (`receipt(...)`, `kot(...)`) → encoder → `Transport` interface" and stops; `03-F42` says a
// document is "rendered whole, buffered, and transmitted as one unit"; `03-F40` says the paper
// query is real-time and answered while offline; `03-F10`'s rig step exercises "9100 and Bluetooth
// reconnect". Those pin four CAPABILITIES. **No FR names a member, and no FR closes the set.**
//
// So the closure is gone, and what replaces it is weaker on purpose (Commandment 2 — a contract
// you invented is not a contract you may test against):
//   * the four capabilities are REQUIRED, each with the FR that buys it (`TRANSPORT_REQUIRED_
//     MEMBERS`), and the four NAMES are a declared interpretation, not a citation;
//   * names that would express HALF a document are BANNED (`PARTIAL_DOCUMENT_MEMBERS`), which is
//     `03-F42`'s named failure — "a chunked or streaming renderer that stalls >2 s mid-ticket gets
//     its ticket cut in half";
//   * anything else is neither required nor banned, and is not asserted about at all.
// The cost is real and is not hidden: a denylist of names CANNOT state an absence completely, so a
// second write path called something nobody guessed would pass. The FR is what has to close that,
// and until it does, this is the honest shape. `18 §16` is where the question belongs if anyone
// wants it closed.

import { deflateSync, inflateSync } from "node:zlib";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The capability record (`03 §7` layer 3, plus `03-F40`'s near-end gate).
//
// Declared structurally rather than imported: `@restos/testing` does not depend on
// `@restos/escpos` today, and a test author cannot add the dependency. The virtual printer's
// factory takes this shape; TypeScript's structural typing makes the literals below assignable to
// the real record when the implementation lands.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type PrinterCapabilityLike = {
  model_id: string;
  dots: number;
  dpi: number;
  cols_font_a: number;
  cols_font_b: number;
  has_native_qr: boolean;
  has_cutter: boolean;
  raster_ok: boolean;
  /** `03-F40`: near-end is not universal, so it is model-gated from the record. */
  has_near_end_sensor: boolean;
};

/** `03 §7`: "Font A = 12, Font B = 9" — the font CELL widths, in dots. */
export const FONT_CELL_DOTS = { A: 12, B: 9 } as const;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The `Transport` seam (`18 §10`) and the virtual printer's own controls.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type PaperStatus = {
  paper_out: boolean;
  /** `"unsupported"` where `has_near_end_sensor` is false — `03-F40`'s model gate. */
  near_end: boolean | "unsupported";
};

export type TransmitOutcome =
  | { ok: true }
  | { ok: false; state: "stalled"; reason: "paper_out"; model_id: string }
  | { ok: false; state: "failed"; reason: "link_error" | "no_response"; model_id: string };

/**
 * `18 §10`'s `Transport`, DECLARED ONCE, HERE.
 *
 * This is the only declaration of the interface in the repo. `packages/escpos`'s K-3 oracle surface
 * used to carry a second copy under a header claiming this file's list "is derived from" it; it was
 * not — nothing imported it and nothing tied the two together — so the copy was deleted and that
 * header now points here. The declaration lives beside the conformance check because the check is
 * the only thing that can observe it: an interface has no runtime existence, and the virtual
 * printer is its only implementation.
 *
 * Each member is REQUIRED because an FR needs the capability. The NAMES are a declared
 * interpretation (24 §3b) — see this file's header FINDING; `18 §10` enumerates no members:
 *
 *   `open`   — `03-F10`'s rig step is "9100 and Bluetooth reconnect", so a link is opened and
 *              re-opened. `18 §10`'s transport matrix (TCP 9100, USB/serial, Bluetooth SPP/BLE) is
 *              three link types that all have to be brought up.
 *   `send`   — `03-F42`: ONE whole document, as ONE argument.
 *   `status` — `03-F40`'s real-time paper query, which is the evidence `03-F41`'s stall rests on
 *              ("the spooler reports `stalled` … via `DLE EOT 4`", `03-F10`).
 *   `close`  — the other half of `open`.
 */
export const TRANSPORT_REQUIRED_MEMBERS = ["open", "send", "status", "close"] as const;
export type TransportMember = (typeof TRANSPORT_REQUIRED_MEMBERS)[number];

/**
 * Members that would express HALF a document, and are therefore banned.
 *
 * `03-F42`: with cut reservation, "if data is interrupted for two seconds or more, the printer
 * automatically feeds to the reserved cut position and cuts" — so "a chunked or streaming renderer
 * that stalls >2 s mid-ticket gets its ticket cut in half. No I/O wait may be interleaved inside a
 * document." A seam that cannot be handed a fragment cannot be stalled mid-fragment, which is the
 * "impossible by construction" form the brief prefers over a timing measurement.
 *
 * This is a DENYLIST and it cannot state the absence completely — the header says so plainly. It is
 * the streaming and buffered-writer vocabulary: Node's `Writable` (`write`/`cork`/`uncork`/`end`),
 * the `pipe`/`flush` pair every serial and socket library ships, and the begin/append/finish shape a
 * hand-rolled chunked encoder takes.
 */
export const PARTIAL_DOCUMENT_MEMBERS = [
  "write",
  "writeChunk",
  "sendChunk",
  "chunk",
  "stream",
  "pipe",
  "cork",
  "uncork",
  "flush",
  "end",
  "begin",
  "beginDocument",
  "endDocument",
  "append",
] as const;
export type PartialDocumentMember = (typeof PARTIAL_DOCUMENT_MEMBERS)[number];

export type Transport = {
  open(): Promise<void>;
  /** `03-F42`: the whole document, in one call, never a chunk of one. */
  send(document: Uint8Array): Promise<TransmitOutcome>;
  /** `03-F40`: `DLE EOT 4`. Answered while the printer is OFFLINE, by design. */
  status(): Promise<PaperStatus>;
  close(): Promise<void>;
};

// The runtime list and the type are tied in BOTH directions, so neither can be edited alone: rename
// a member on `Transport` and `_RequiredCoversTransport` fails; rename one in the list and
// `_TransportCoversRequired` fails. One direction alone (which is what `packages/escpos`'s deleted
// copy had) admits a list entry that is not a member of anything.
type _RequiredCoversTransport =
  Exclude<keyof Transport, TransportMember> extends never ? true : never;
type _TransportCoversRequired =
  Exclude<TransportMember, keyof Transport> extends never ? true : never;
/** `03-F42` at the type level: the declared seam may not itself carry a partial-document member. */
type _TransportExpressesNoPartialDocument =
  Extract<keyof Transport, PartialDocumentMember> extends never ? true : never;
const _requiredCoversTransport: _RequiredCoversTransport = true;
const _transportCoversRequired: _TransportCoversRequired = true;
const _transportExpressesNoPartialDocument: _TransportExpressesNoPartialDocument = true;
void _requiredCoversTransport;
void _transportCoversRequired;
void _transportExpressesNoPartialDocument;

/**
 * The virtual printer's test controls, and the FR that buys each one:
 *
 *   `pullRoll` / `loadRoll` — `03-F10`'s rig step ("pull the roll mid-job … then assert reloading
 *      prints the job EXACTLY ONCE") and `03-F41`'s hold ("goes offline and **holds** until the
 *      roll is replaced").
 *   `printed` — `18 §10`'s "renders output to PNG for snapshot tests", and the counter that makes
 *      "exactly once" a checkable claim rather than a hope.
 */
export const VIRTUAL_PRINTER_CONTROLS = ["pullRoll", "loadRoll", "printed"] as const;

export type PrintedDocument = {
  /** The bytes this document was sent as. A fake that loses bytes is a fake that hides defects. */
  bytes: Uint8Array;
  /** `18 §10`: the rendered page. */
  png: Uint8Array;
};

/**
 * `18 §10`: "The **virtual printer** (in `packages/testing`) implements `Transport`".
 *
 * Written as an INTERSECTION with `Transport` rather than as a fresh object type carrying the same
 * four members again, so that the fake's shape is derived from the declaration instead of being a
 * third hand-copy of it: rename a member on `Transport` and every call site here stops compiling.
 */
export type VirtualPrinter = Transport & {
  /** `03-F41`/`03-F10`: the roll runs out. The printer holds; it does not drop. */
  pullRoll(): void;
  /** `03-F41`: the roll is replaced, and what was held prints — exactly once. */
  loadRoll(): void;
  printed(): readonly PrintedDocument[];
};

export type TransportConformance = {
  /** Every function-valued member found on the object and its prototype chain, sorted. */
  members: readonly string[];
  /** Declared `Transport` members that are absent or are not functions. */
  missing_transport: readonly string[];
  /** Declared virtual-printer controls that are absent or are not functions. */
  missing_controls: readonly string[];
  /** Members that would express HALF a document (`03-F42`). */
  partial_document: readonly string[];
};

/**
 * Check an object against the declaration above — the ONE declaration, so that a rename there
 * changes what this answers.
 *
 * Members are enumerated at RUNTIME and over the whole prototype chain, because the thing being
 * checked is an implementation and a class puts its methods on the prototype. Enumerating at
 * runtime rather than in the type is also what lets a MISSING export red this suite alone instead
 * of the whole repo's `tsc --noEmit`, which is K-1's idiom inherited through K-2.
 *
 * Note what this deliberately does NOT report: "every other member". See the header FINDING — no FR
 * closes the member set, so a closed allowlist would be a contract this oracle invented.
 */
export const transportConformance = (device: object): TransportConformance => {
  const members = new Set<string>();
  for (
    let object: object | null = device;
    object !== null && object !== Object.prototype;
    object = Object.getPrototypeOf(object) as object | null
  ) {
    for (const key of Object.getOwnPropertyNames(object)) {
      if (key === "constructor") continue;
      if (typeof (device as Record<string, unknown>)[key] === "function") members.add(key);
    }
  }
  const has = (name: string): boolean => members.has(name);
  return {
    members: [...members].sort(),
    missing_transport: TRANSPORT_REQUIRED_MEMBERS.filter((name) => !has(name)),
    missing_controls: VIRTUAL_PRINTER_CONTROLS.filter((name) => !has(name)),
    partial_document: PARTIAL_DOCUMENT_MEMBERS.filter((name) => has(name)),
  };
};

export type TestingK3Api = {
  createVirtualPrinter?: (options: { capability: PrinterCapabilityLike }) => VirtualPrinter;
};

const missing = (name: string, fr: string): never => {
  throw new Error(`@restos/testing.${name} is not implemented yet (K-3, ${fr})`);
};

export const createVirtualPrinter = (
  api: TestingK3Api,
  capability: PrinterCapabilityLike,
): VirtualPrinter =>
  typeof api.createVirtualPrinter === "function"
    ? api.createVirtualPrinter({ capability })
    : missing("createVirtualPrinter", "18 §10");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Hand-built ESC/POS documents.
//
// Written from the published command set, with the FR that buys each command — K-2's stated rule:
// "the FR supplies the requirement; the published ESC/POS command set supplies the opcode". These
// are deliberately NOT produced by `@restos/escpos`'s encoder: a renderer tested only against the
// encoder that feeds it is two halves of one mind, and the whole point of the split is that the
// oracle was written by neither.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `ESC @` — initialise. `03-F30` purity: a document may not inherit printer state. */
export const INIT = [0x1b, 0x40];
/** `LF` — print and line feed. */
export const LF = [0x0a];
/** `ESC d n` — print and feed n lines. `27-F58`: "groups are separated by blank lines, not rules". */
export const feedLines = (n: number): number[] => [0x1b, 0x64, n];
/** `GS ! n` — character size. `0x11` is `27-F56`'s 2×2 rung (double width AND double height). */
export const SIZE_2X2 = [0x1d, 0x21, 0x11];
export const SIZE_NORMAL = [0x1d, 0x21, 0x00];
/** `GS B n` — white/black reverse. `27-F55`'s inverted solid fill; `03-F10` names it by opcode. */
export const REVERSE_ON = [0x1d, 0x42, 0x01];
export const REVERSE_OFF = [0x1d, 0x42, 0x00];
/** `GS V m` — cut. `03 §7`'s `has_cutter`. */
export const CUT = [0x1d, 0x56, 0x00];
/** `ESC $ nL nH` — set ABSOLUTE print position. **Banned by `03-F36`**; used below as a probe. */
export const absolutePosition = (dots: number): number[] => [
  0x1b,
  0x24,
  dots & 0xff,
  (dots >> 8) & 0xff,
];

export const ascii = (value: string): number[] => [...value].map((ch) => ch.charCodeAt(0));

/**
 * `GS v 0 m xL xH yL yH d…` — the raster bit image.
 *
 * **The width is declared in BYTES, not in dots**, which is a fact about the command and not a
 * convenience: a row is always a whole number of bytes, so a printer renders `bytes_per_row × 8`
 * dots and has no way to know that any of them were padding. The fixture below sets bits in the
 * LAST byte of a row and requires them to appear, because a renderer that inferred a narrower
 * logical width would drop them and would disagree with every real printer while looking correct.
 */
export const rasterImage = (bytesPerRow: number, heightDots: number, bits: number[]): number[] => [
  0x1d,
  0x76,
  0x30,
  0x00,
  bytesPerRow & 0xff,
  (bytesPerRow >> 8) & 0xff,
  heightDots & 0xff,
  (heightDots >> 8) & 0xff,
  ...bits,
];

export const document = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat());

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The PNG reader. Independent of the implementation and of `pngjs`; `node:zlib` only.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE: number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export const crc32 = (bytes: readonly number[]): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const be32 = (bytes: Uint8Array, at: number): number =>
  (((bytes[at] ?? 0) << 24) |
    ((bytes[at + 1] ?? 0) << 16) |
    ((bytes[at + 2] ?? 0) << 8) |
    (bytes[at + 3] ?? 0)) >>>
  0;

export type DecodedPng = {
  width: number;
  height: number;
  /** Chunk types in file order. `18 §10`'s snapshot use makes a `tIME` chunk a live hazard. */
  chunks: readonly string[];
  /** Luminance 0–255, composited over white paper. Outside the page is paper (255). */
  sample(x: number, y: number): number;
  /** `true` where the dot carries INK. Outside the page is paper, never ink. */
  ink(x: number, y: number): boolean;
};

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Decode a PNG far enough to answer one question per dot: ink or paper.
 *
 * Every refusal is NAMED and says what it saw, because a reader that returns a blank page for a
 * form it does not understand would report "nothing was printed" — the exact failure this oracle
 * exists to catch, produced by the oracle itself.
 */
export const decodePng = (png: Uint8Array): DecodedPng => {
  for (const [i, expected] of PNG_SIGNATURE.entries()) {
    if (png[i] !== expected) {
      throw new Error(`PNG: signature mismatch at byte ${i} — this is not a PNG`);
    }
  }
  const chunks: string[] = [];
  const idat: number[] = [];
  let header: {
    width: number;
    height: number;
    depth: number;
    colorType: number;
    interlace: number;
  } | null = null;

  let at = PNG_SIGNATURE.length;
  while (at < png.length) {
    const length = be32(png, at);
    const type = String.fromCharCode(...png.slice(at + 4, at + 8));
    const data = png.slice(at + 8, at + 8 + length);
    const declared = be32(png, at + 8 + length);
    const actual = crc32([...png.slice(at + 4, at + 8 + length)]);
    if (declared !== actual) {
      throw new Error(`PNG: CRC mismatch in chunk ${type} at offset ${at}`);
    }
    chunks.push(type);
    if (type === "IHDR") {
      header = {
        width: be32(data, 0),
        height: be32(data, 4),
        depth: data[8] ?? 0,
        colorType: data[9] ?? 0,
        interlace: data[12] ?? 0,
      };
    }
    // Appended one byte at a time, NOT with `idat.push(...data)`. A spread is a CALL, so its
    // argument count is bounded by the JS stack: measured on node v22.16.0, `[].push(...bytes)`
    // succeeds at 105 593 bytes and throws `RangeError: Maximum call stack size exceeded` at
    // 105 594 — and that ceiling FALLS as the stack deepens, so it is lower inside a test than at
    // the top level. A 576-dot page (`03 §7`) passes it easily: an 8-bit greyscale page is
    // `576 × height` bytes before compression, and raster ink does not compress away. The failure
    // would arrive as a stack error inside the ORACLE — the instrument reporting itself broken
    // about a page that is fine.
    if (type === "IDAT") for (const byte of data) idat.push(byte);
    at += 12 + length;
    if (type === "IEND") break;
  }

  if (header === null) throw new Error("PNG: no IHDR chunk");
  const { width, height, depth, colorType, interlace } = header;
  if (interlace !== 0) throw new Error("PNG: the oracle cannot read an interlaced image");
  const channels = CHANNELS[colorType];
  if (channels === undefined || !(depth === 8 || (depth === 1 && colorType === 0))) {
    throw new Error(
      `PNG: the oracle cannot read colour type ${colorType} at bit depth ${depth} — say so rather than guess`,
    );
  }

  const raw = new Uint8Array(inflateSync(Uint8Array.from(idat)));
  const bitsPerPixel = channels * depth;
  const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const expectedLength = height * (bytesPerRow + 1);
  if (raw.length < expectedLength) {
    throw new Error(
      `PNG: inflated to ${raw.length} bytes, expected ${expectedLength} for ${width}×${height}`,
    );
  }

  const out = new Uint8Array(height * bytesPerRow);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (bytesPerRow + 1)] ?? 0;
    const from = y * (bytesPerRow + 1) + 1;
    const rowAt = y * bytesPerRow;
    for (let x = 0; x < bytesPerRow; x += 1) {
      const value = raw[from + x] ?? 0;
      const a = x >= bpp ? (out[rowAt + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (out[rowAt - bytesPerRow + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (out[rowAt - bytesPerRow + x - bpp] ?? 0) : 0;
      let recon: number;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + a;
          break;
        case 2:
          recon = value + b;
          break;
        case 3:
          recon = value + Math.floor((a + b) / 2);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          recon = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`PNG: unknown scanline filter ${filter} on row ${y}`);
      }
      out[rowAt + x] = recon & 0xff;
    }
  }

  const sample = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 255;
    if (depth === 1) {
      const byte = out[y * bytesPerRow + (x >> 3)] ?? 0;
      // Greyscale depth 1: 0 is black, 1 is white.
      return ((byte >> (7 - (x & 7))) & 1) === 0 ? 0 : 255;
    }
    const at8 = y * bytesPerRow + x * channels;
    if (colorType === 0) return out[at8] ?? 255;
    // Alpha is composited over WHITE, because the paper under a transparent dot is paper.
    if (colorType === 4) return (out[at8 + 1] ?? 255) < 128 ? 255 : (out[at8] ?? 255);
    if (colorType === 6 && (out[at8 + 3] ?? 255) < 128) return 255;
    return Math.round(((out[at8] ?? 255) + (out[at8 + 1] ?? 255) + (out[at8 + 2] ?? 255)) / 3);
  };

  return { width, height, chunks, sample, ink: (x, y) => sample(x, y) < 128 };
};

/** The bounding box of every inked dot, or `null` where nothing was printed. */
export const inkBox = (
  png: DecodedPng,
): { x0: number; y0: number; x1: number; y1: number; count: number } | null => {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (!png.ink(x, y)) continue;
      count += 1;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return count === 0 ? null : { x0, y0, x1, y1, count };
};

/** Every column index that carries at least one inked dot, ascending. */
export const inkColumns = (png: DecodedPng): number[] => {
  const columns: number[] = [];
  for (let x = 0; x < png.width; x += 1) {
    for (let y = 0; y < png.height; y += 1) {
      if (png.ink(x, y)) {
        columns.push(x);
        break;
      }
    }
  }
  return columns;
};

/** The inked dots inside a box, as `"x,y"` keys — a set comparison beats a pixel-by-pixel loop. */
export const inkKeysIn = (
  png: DecodedPng,
  box: { x0: number; y0: number; x1: number; y1: number },
): Set<string> => {
  const keys = new Set<string>();
  for (let y = box.y0; y <= box.y1; y += 1) {
    for (let x = box.x0; x <= box.x1; x += 1) {
      if (png.ink(x, y)) keys.add(`${x - box.x0},${y - box.y0}`);
    }
  }
  return keys;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A minimal PNG WRITER — used only to self-test the reader above.
//
// It writes greyscale 8-bit and takes the FILTERED scanlines verbatim, so the reader's unfilter
// code can be driven with hand-derived bytes rather than with bytes this file computed. That
// distinction is the whole value of the self-test: an encoder and a decoder written by one hand
// cancel each other's mistakes, and a hand-derived expectation cannot.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const chunk = (type: string, data: number[]): number[] => {
  const body = [...ascii(type), ...data];
  const crc = crc32(body);
  const length = data.length;
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ];
};

export const buildGrey8Png = (
  width: number,
  scanlines: readonly { filter: number; bytes: readonly number[] }[],
): Uint8Array => {
  const height = scanlines.length;
  const ihdr = [
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8, // bit depth
    0, // colour type: greyscale
    0,
    0,
    0, // compression, filter, interlace
  ];
  const rawStream = scanlines.flatMap((row) => [row.filter, ...row.bytes]);
  const idat = [...new Uint8Array(deflateSync(Uint8Array.from(rawStream)))];
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", idat),
    ...chunk("IEND", []),
  ]);
};
