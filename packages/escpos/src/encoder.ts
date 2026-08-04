/**
 * The ESC/POS encoder (`18 §10`, `03-F8`, `03-F35`, `03-F36`, `27-F55`/`27-F56`).
 *
 * Hand-rolled, per `18 §10` — that clause is about the transport matrix, and the bytes below are
 * the documented ESC/POS set. The one dependency is `qrcode`, which generates a QR SYMBOL and not
 * a printer command: Reed-Solomon, version selection and mask evaluation are not transport work,
 * and a hand-rolled symbol that looks right and does not scan is the failure `03-F35` exists to
 * prevent (founder ruling July 2026).
 *
 * `03-F42` is expressed in the return type rather than by discipline: `encode` returns a whole
 * `Uint8Array`, never a stream or an async iterator, because a document interrupted for ≥2 s with
 * a cut reserved gets fed to the cut position and severed. There is no I/O in this file at all.
 */

import QRCode from "qrcode";
import type { PrinterCapability } from "./capability.js";

/** `27-F56`'s ladder — three levels, "allocated once, platform-wide". */
export const INK_LEVELS = ["normal", "size_2x2", "inverted"] as const;
export type InkLevel = (typeof INK_LEVELS)[number];

/**
 * `27-F56`'s two-scope ruling (July 2026). The budget is one inversion per SCOPE, and a scope is
 * a GLANCE: `27-F58` fixes the reading order and a cook reads one dish at a time, so a marker on
 * dish two never competes with one on dish one — while two banners, or two markers inside one
 * item, do.
 */
export const INK_SCOPES = ["banner", "item"] as const;
export type InkScope = (typeof INK_SCOPES)[number];

export type EncoderPart =
  | { kind: "text"; value: string; ink: "normal" | "size_2x2" }
  | { kind: "text"; value: string; ink: "inverted"; scope: "banner" }
  | { kind: "text"; value: string; ink: "inverted"; scope: "item"; item_block: string }
  | { kind: "user_text"; value: string }
  | { kind: "feed"; lines: number }
  | { kind: "image"; width_dots: number; height_dots: number; bits: Uint8Array }
  | { kind: "fiscal_qr"; payload: string }
  | { kind: "cut" };

export type EncodeRefusalReason =
  | "banner_budget_exceeded"
  | "item_marker_budget_exceeded"
  | "raster_unavailable"
  | "non_ascii_system_text"
  | "raster_font_unavailable";

export type EncodeRefusal = {
  ok: false;
  reason: EncodeRefusalReason;
  severity: "S1";
  model_id: string;
};

export type EncodeResult = { ok: true; bytes: Uint8Array } | EncodeRefusal;

// --- the admitted command set (K-2's allowlist; each carries the FR that buys it) -------------
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
/** `ESC @` — `03-F30` purity: a document may not inherit printer state. */
const INIT = [ESC, 0x40];
/** `GS ! n` — `27-F55` channel 2. `0x11` is double width + double height. */
const size = (n: number) => [GS, 0x21, n];
/** `GS B n` — `27-F55`'s inverted solid fill; `03-F10` names it by opcode. */
const reverse = (on: boolean) => [GS, 0x42, on ? 0x01 : 0x00];
/** `ESC d n` — `27-F58`: "groups are separated by blank lines, not rules". */
const feedLines = (n: number) => [ESC, 0x64, n];
/** `GS V m` — `03 §7`'s `has_cutter`. */
const cut = () => [GS, 0x56, 0x00];

/**
 * `03-F35`'s legal floor and design band. The floor is 7 mm; the band is 18–25 mm, "FBR's own
 * technical spec asks ~0.7–1.0 inch, ~2.5× the SRO figure". Aimed at the middle so quantisation
 * has room on both sides.
 */
const QR_BAND_MM = { min: 18, max: 25, target: 21.5 } as const;

const mmOf = (dots: number, dpi: number): number => (dots / dpi) * 25.4;

/**
 * Choose whole dots per QR module so the symbol lands in `03-F35`'s band at THIS dpi.
 *
 * Derived rather than constant, and the test that pins it says why: 147 dots is 18.4 mm at 203
 * dpi and 9.3 mm at 400 — inside the 7 mm legal floor and nowhere near the 18 mm design floor. A
 * module is a whole number of dots, so nearby dpi values can legitimately quantise to the same
 * count; the scale is chosen by closeness to the band's middle and then checked, never assumed.
 */
const modulesScale = (modules: number, dpi: number): number => {
  const ideal = (QR_BAND_MM.target * dpi) / 25.4 / modules;
  const candidates = [Math.floor(ideal), Math.round(ideal), Math.ceil(ideal)].filter((s) => s >= 1);
  const inBand = candidates.filter((s) => {
    const mm = mmOf(modules * s, dpi);
    return mm >= QR_BAND_MM.min && mm <= QR_BAND_MM.max;
  });
  const pool = inBand.length > 0 ? inBand : candidates;
  return pool.reduce((best, s) =>
    Math.abs(mmOf(modules * s, dpi) - QR_BAND_MM.target) <
    Math.abs(mmOf(modules * best, dpi) - QR_BAND_MM.target)
      ? s
      : best,
  );
};

/**
 * `GS v 0` — the raster bit image. `03-F8`'s raster path and `03 §8`'s "rasterized at the target
 * dot width".
 *
 * Rows are byte-aligned, which is why `03-F35`'s squareness is asserted to within one byte rather
 * than exactly: the padding belongs to the command, not to the design.
 */
const rasterImage = (widthDots: number, heightDots: number, bits: Uint8Array): number[] => {
  const bytesPerRow = Math.ceil(widthDots / 8);
  return [
    GS,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    heightDots & 0xff,
    (heightDots >> 8) & 0xff,
    ...bits,
  ];
};

/**
 * `03-F35`'s error-correction level, in ONE place.
 *
 * The size query below has to describe the symbol `qrRaster` actually emits: `03-F34` refuses a
 * document whose "QR's computed physical size" misses the adapter's declared minimum, and a
 * second copy of these parameters is a number that can disagree with the symbol on the paper.
 */
const QR_ERROR_CORRECTION = "M" as const;

/**
 * `03-F34`: "the QR's **computed physical size** … for the target dpi", in millimetres.
 *
 * Exported for the render layer (`03-F34` enforces before bytes reach the spooler); the symbol is
 * measured through the same `QRCode.create` and the same `modulesScale` that produce it.
 */
export const fiscalQrMm = (payload: string, dpi: number): number => {
  const modules = QRCode.create(payload, { errorCorrectionLevel: QR_ERROR_CORRECTION }).modules
    .size;
  return mmOf(modules * modulesScale(modules, dpi), dpi);
};

/** A QR symbol as a byte-aligned 1-bpp bitmap. Set bit = black module. */
const qrRaster = (
  payload: string,
  dpi: number,
): { width: number; height: number; bits: number[] } => {
  const symbol = QRCode.create(payload, { errorCorrectionLevel: QR_ERROR_CORRECTION });
  const modules = symbol.modules.size;
  const data = symbol.modules.data;
  const scale = modulesScale(modules, dpi);
  const side = modules * scale;
  const bytesPerRow = Math.ceil(side / 8);
  const bits: number[] = new Array(bytesPerRow * side).fill(0);
  for (let y = 0; y < side; y += 1) {
    const my = Math.floor(y / scale);
    for (let x = 0; x < side; x += 1) {
      const mx = Math.floor(x / scale);
      if (data[my * modules + mx] === 1) {
        const at = y * bytesPerRow + (x >> 3);
        bits[at] = (bits[at] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return { width: bytesPerRow * 8, height: side, bits };
};

/**
 * Can a printer FONT render this? `03-F8`: interface text prints via printer fonts, and no ESC/POS
 * code page can carry Urdu — 0 of 144 shaped forms in CP1256, 0 of 15 Urdu letters in CP864.
 *
 * The line is LATIN SCRIPT, not bare ASCII: an em-dash is ordinary interface punctuation and every
 * deployed code page carries it, while a substitution for it would be the silent degradation
 * `03-F34` bans. So printable ASCII, Latin-1/Latin Extended, and General Punctuation pass; an
 * Arabic-script codepoint does not.
 */
const isPrintableLatin = (value: string): boolean => {
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    const ok =
      (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0x24f) || (c >= 0x2000 && c <= 0x206f);
    if (!ok) return false;
  }
  return true;
};

/**
 * `27-F56`'s budget, counted per GLANCE.
 *
 * A banner shares one key with every other banner in the document; an item marker shares a key
 * only with markers under the same block. That single function is the whole ruling — it predicts
 * cases nobody enumerated instead of hard-coding the four the ruling names.
 */
const glanceKey = (part: EncoderPart): string | null => {
  if (part.kind !== "text" || part.ink !== "inverted") return null;
  return part.scope === "banner" ? "banner" : `item:${part.item_block}`;
};

const refuse = (reason: EncodeRefusalReason, caps: PrinterCapability): EncodeRefusal => ({
  ok: false,
  reason,
  severity: "S1",
  model_id: caps.model_id,
});

/**
 * `18 §10`'s "document model → encoder → Transport". Pure: same parts and caps in, byte-identical
 * out, which `03-F30` makes a law rather than an aspiration.
 *
 * Every refusal is taken BEFORE any byte is produced, so a refused document cannot leave a
 * half-written buffer anywhere — `03-F34`'s "hard refusal, never a silent degradation" with
 * nothing to degrade from.
 */
export const encode = (parts: readonly EncoderPart[], caps: PrinterCapability): EncodeResult => {
  /**
   * The budget counts BANDS, not parts. `27-F56`'s examples are bands and a band can need two
   * lines — so a banner continued across a feed is ONE use, exactly as `27-F59`'s "one marker
   * covering both removals" is one. Counting parts would refuse a two-line VOID band, which no FR
   * asks for and the two-scope ruling contradicts outright.
   */
  const spent = new Map<string, number>();
  let openBand: string | null = null;
  for (const part of parts) {
    const key = glanceKey(part);
    if (key !== null) {
      if (key !== openBand) {
        const used = (spent.get(key) ?? 0) + 1;
        spent.set(key, used);
        if (used > 1) {
          return refuse(
            key === "banner" ? "banner_budget_exceeded" : "item_marker_budget_exceeded",
            caps,
          );
        }
      }
      openBand = key;
    } else if (part.kind !== "feed") {
      // A feed does not close a band; anything else does.
      openBand = null;
    }
    // 00 §5.6 — interface text is English, and substituting `?` for a byte a printer font cannot
    // render is exactly the silent degradation 03-F34 bans. User content has its own kind.
    if (part.kind === "text" && !isPrintableLatin(part.value)) {
      return refuse("non_ascii_system_text", caps);
    }
    // 03-F8 (Wave 1, founder ruling): a non-Latin user field needs a font AND a shaping engine,
    // because the script is positional. Until one is chosen this refuses rather than emitting a
    // raster with no legible glyphs — which every assertion at this layer would have accepted.
    if (part.kind === "user_text" && !isPrintableLatin(part.value)) {
      return refuse("raster_font_unavailable", caps);
    }
    // 03 §7's raster_ok. 03-F35 forbids falling back to the native QR command, so a printer that
    // cannot raster has no remaining way to render a document that needs one.
    if ((part.kind === "image" || part.kind === "fiscal_qr") && !caps.raster_ok) {
      return refuse("raster_unavailable", caps);
    }
  }

  const out: number[] = [...INIT];
  let currentSize = 0x00;
  let currentReverse = false;

  const setSize = (n: number) => {
    if (n !== currentSize) {
      out.push(...size(n));
      currentSize = n;
    }
  };
  const setReverse = (on: boolean) => {
    if (on !== currentReverse) {
      out.push(...reverse(on));
      currentReverse = on;
    }
  };

  /** For each feed, whether an inverted band of the same key continues past it. */
  const continuesBand: boolean[] = parts.map((part, idx) => {
    if (part.kind !== "feed") return false;
    let before: string | null = null;
    for (let j = idx - 1; j >= 0; j -= 1) {
      const p = parts[j];
      if (p === undefined || p.kind === "feed") continue;
      before = glanceKey(p);
      break;
    }
    if (before === null) return false;
    for (let j = idx + 1; j < parts.length; j += 1) {
      const p = parts[j];
      if (p === undefined || p.kind === "feed") continue;
      return glanceKey(p) === before;
    }
    return false;
  });

  /** The band currently open during emission — see the `text` case. */
  let emittingBand: string | null = null;

  for (const [i, part] of parts.entries()) {
    if (part.kind !== "feed" && part.kind !== "text") emittingBand = null;
    switch (part.kind) {
      case "text": {
        setSize(part.ink === "size_2x2" ? 0x11 : 0x00);
        const key = glanceKey(part);
        // Two bands that TOUCH are still two bands. A banner immediately followed by a removal
        // marker shares no glance — they are different scopes — so the run is closed and reopened
        // rather than merged, or the document would spend one use for two (`27-F56`).
        if (key !== null && emittingBand !== null && key !== emittingBand) setReverse(false);
        emittingBand = key;
        setReverse(part.ink === "inverted");
        for (const ch of part.value) out.push(ch.charCodeAt(0));
        break;
      }
      case "user_text": {
        // Latin user content prints through printer fonts (03-F8). The non-Latin case refused above.
        setSize(0x00);
        setReverse(false);
        for (const ch of part.value) out.push(ch.charCodeAt(0));
        break;
      }
      case "feed": {
        // Reverse is NOT dropped here when the band continues past this feed — a two-line band is
        // one band (`27-F56`), and breaking it would emit two off/on transitions for one use.
        if (!continuesBand[i]) setReverse(false);
        out.push(...feedLines(part.lines));
        break;
      }
      case "image": {
        setReverse(false);
        out.push(...rasterImage(part.width_dots, part.height_dots, part.bits));
        break;
      }
      case "fiscal_qr": {
        // 03-F35 — ALWAYS rasterised. There is deliberately no branch on `has_native_qr`: cheap
        // printers report no QR capability and fail SILENTLY, and for a QR whose absence is an
        // offence that can seal the premises a silent no-op is the worst available failure. The
        // encoder must not be ABLE to take the fast path, so the capability is not consulted.
        setSize(0x00);
        setReverse(false);
        const qr = qrRaster(part.payload, caps.dpi);
        out.push(...rasterImage(qr.width, qr.height, Uint8Array.from(qr.bits)));
        break;
      }
      case "cut": {
        // 03 §7's `has_cutter`, and 03-F10 is explicit that the BC-58U baseline has NONE — "a
        // manual tear bar, i.e. a human action and a mis-tear vector per ticket". Sending `GS V`
        // to a printer without one is a command it cannot honour, so the part is simply not
        // emitted; the operator tears, which is what that hardware always required.
        setSize(0x00);
        setReverse(false);
        if (caps.has_cutter) out.push(...cut());
        break;
      }
    }
  }
  // Leave the printer as the next document expects to find it (03-F30 purity, from the other end).
  setReverse(false);
  setSize(0x00);
  if (out[out.length - 1] !== LF) out.push(LF);
  return { ok: true, bytes: Uint8Array.from(out) };
};
