// K-2 ORACLE SURFACE — types and guarded accessors ONLY. NOT AN IMPLEMENTATION.
//
// This file declares the contract `encoder.test.ts` drives. It contains no byte tables, no ink
// ladder arithmetic, no QR sizing and no code-page logic: every function here either forwards to
// `../index.js` or throws a named "not implemented yet" error. If a future edit puts a `0x1d` or a
// `25.4` in this file, that edit has moved the encoder into the oracle and the split of `24 §3`
// step 2 is gone.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/03-kitchen-fulfillment.md 03-F8  — printer fonts for English + numerals; the raster path
//     for logos, QR and non-Latin USER-CONTENT fields, per field, never dropped or transliterated.
//   specs/03-kitchen-fulfillment.md 03-F35 — the fiscal QR is ALWAYS rasterised, never the native
//     command; size computed from dpi; the invoice number is an opaque token.
//   specs/03-kitchen-fulfillment.md 03-F36 — absolute dot positioning and space-as-layout banned.
//   specs/03-kitchen-fulfillment.md 03-F34 — failure is a hard refusal plus an S1, never silent
//     degradation.
//   specs/03-kitchen-fulfillment.md §7    — the capability record the encoder reads.
//   specs/27-design-language.md 27-F55/F56 — the four paper channels and the three-level ink
//     ladder; bold is NOT a level.
//   specs/18-engineering-handbook.md §10  — hand-rolled encoder, no library.
//   specs/00-platform-overview.md §5.6    — English-only interface text; user content is
//     uncontrolled Unicode and is never transliterated or rejected for its script.
//
// NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE. Every assertion downstream is about
// bytes that were emitted into a `Uint8Array`. Nothing here opens a transport, and no test name
// may imply that a printer was observed.

import type { PrinterCapability } from "./oracle-surface.js";

/**
 * `27-F56`'s ladder, verbatim: "**inverted solid fill** is reserved for the single most
 * consequential fact on the ticket and nothing else; **2×2 size** for the item line's quantity and
 * the order/table identifier; **normal weight** for everything else. Bold is **not** a level."
 *
 * The names are deliberately not `"bold"`/`"large"`/`"emphasis"`: `27-F55` lists FOUR values on
 * the character-size channel (1×, 2× width, 2× height, 2×2) and `27-F56` allocates exactly one of
 * them, so a level called `"double"` would leave 2×-width-only and 2×-height-only ambiguously
 * inside the vocabulary. `size_2x2` can only mean the allocated one.
 */
export const INK_LEVELS_PER_27_F56 = ["normal", "size_2x2", "inverted"] as const;

export type InkLevel = (typeof INK_LEVELS_PER_27_F56)[number];

/**
 * The encoder's input. This is NOT `03-F30`'s `DocumentSpec` — that is K-4's type, it carries
 * regions, slots and degradation forms, and it sits above this layer. These are the emittable
 * units `18 §10`'s "document model → encoder → Transport" pipeline hands the encoder.
 *
 * DECLARED INTERPRETATION (24 §3b — stated, not smuggled): a `text` part is a RUN, not a line, and
 * line breaks are explicit `feed` parts. The named simpler alternative — one part per line — is
 * rejected because `27-F57` requires the quantity and the item name to sit "immediately left of
 * the item name **on the same line**" while `27-F56` puts the quantity at 2×2 and the name at
 * normal, so one line must be able to carry two ink levels. A part-per-line model cannot express
 * the single layout `27-F57` calls the reason the KOT exists.
 */
export type EncoderPart =
  /**
   * Interface text (`00 §5.6`: English only). `03-F8`: "Text prints via printer fonts (English +
   * numerals)". Not user content — see `user_text`.
   */
  | { kind: "text"; value: string; ink: InkLevel }
  /**
   * A user-content field (`00 §5.6`: "customer-entered data … is uncontrolled Unicode and may
   * contain Urdu script"). `03-F8` routes these per FIELD: printer fonts where the field is
   * Latin, the raster path where it is not, "never dropped or transliterated".
   */
  | { kind: "user_text"; value: string }
  /** `27-F58`: "Groups are separated by blank lines, not rules". `lines` ≥ 1. */
  | { kind: "feed"; lines: number }
  /** `03-F8`'s first raster consumer: logos. `03 §8`: "rasterized at the target dot width". */
  | { kind: "image"; width_dots: number; height_dots: number; bits: Uint8Array }
  /**
   * `03-F35`. The payload is an OPAQUE token — "never parsed, reconstructed or shape-validated,
   * because FBR's own documents give three different formats".
   */
  | { kind: "fiscal_qr"; payload: string }
  /** `03 §7`'s `has_cutter`; `03-F10` "cut and drawer kick". */
  | { kind: "cut" };

/**
 * `03-F34`: "Failure is a hard refusal to print plus an S1 band (27-F11d), never a silent
 * degradation." K-1 established the shape for `min_columns_not_met`; these are the encoder's own
 * causes and they must be TOLD APART from K-1's (a shared code would make the S1 band unable to
 * say what is actually wrong — K-1's own deferred note).
 */
export type EncodeRefusalReason =
  /** `27-F56`: "A ticket that uses inversion twice has used it zero times." */
  | "ink_budget_exceeded"
  /**
   * `03 §7`'s `raster_ok` is false and the document needs the raster path — `03-F35`'s fiscal QR
   * or `03-F8`'s non-Latin user field. Neither may be silently dropped, and `03-F35` forbids
   * falling back to the native QR command, so there is no remaining way to render the document.
   */
  | "raster_unavailable"
  /**
   * `03-F8` + `00 §5.6`: interface text is English. A non-ASCII byte in a `text` part cannot be
   * printed by a printer font (`03-F8` proves no code page renders Urdu) and substituting `?` for
   * it is exactly the "silent degradation" `03-F34` bans. User content has its own part kind and
   * its own path.
   */
  | "non_ascii_system_text";

export type EncodeRefusal = {
  ok: false;
  reason: EncodeRefusalReason;
  /** `03-F34`: "a hard refusal to print plus an S1 band (27-F11d)". K-1's precedent. */
  severity: "S1";
  /** `03-F5`'s precedent: the alert names the printer. From `03 §7`'s record. */
  model_id: string;
};

/**
 * Every key a refusal is permitted to carry, as runtime data — an ALLOWLIST, for K-1's reason:
 * "never a silent degradation" is an assertion about ABSENCE, and absence is the one thing a
 * denylist cannot state completely. The specific leak this guards is a refusal that also hands
 * back `bytes`, which would let a caller print the degraded document anyway.
 */
export const ENCODE_REFUSAL_KEYS = [
  "ok",
  "reason",
  "severity",
  "model_id",
] as const satisfies readonly (keyof EncodeRefusal)[];

type _RefusalKeysAreExhaustive =
  Exclude<keyof EncodeRefusal, (typeof ENCODE_REFUSAL_KEYS)[number]> extends never ? true : never;
const _refusalKeysAreExhaustive: _RefusalKeysAreExhaustive = true;
void _refusalKeysAreExhaustive;

/**
 * Two branches only. `03-F34` leaves no third outcome that both proceeds and degrades.
 *
 * `bytes` is a `Uint8Array` and not a stream, an iterator or a promise, and that is `03-F42`
 * expressed in the type: "A document is rendered whole, buffered, and transmitted as one unit …
 * a chunked or streaming renderer that stalls >2 s mid-ticket gets its ticket cut in half. No I/O
 * wait may be interleaved inside a document."
 */
export type EncodeResult = { ok: true; bytes: Uint8Array } | EncodeRefusal;

/**
 * The `@restos/escpos` surface this suite drives. Every member is optional so that a missing
 * export fails the RED run LOUDLY at runtime (with the FR named) instead of blocking
 * `pnpm typecheck` for the whole repo — K-1's idiom, inherited.
 */
export type EscposK2Api = {
  /** `27-F56`: the ladder, "allocated once, platform-wide". Exactly three levels. */
  INK_LEVELS?: readonly InkLevel[];
  /** `18 §10`: "document model … → encoder → `Transport` interface". */
  encode?: (parts: readonly EncoderPart[], caps: PrinterCapability) => EncodeResult;
};

const missing = (name: string, fr: string): never => {
  throw new Error(`@restos/escpos.${name} is not implemented yet (K-2, ${fr})`);
};

export const inkLevels = (api: EscposK2Api): readonly InkLevel[] =>
  api.INK_LEVELS ?? missing("INK_LEVELS", "27-F56");

export const encode = (
  api: EscposK2Api,
  parts: readonly EncoderPart[],
  caps: PrinterCapability,
): EncodeResult =>
  typeof api.encode === "function"
    ? api.encode(parts, caps)
    : missing("encode", "03-F8 / 03-F35 / 27-F56");
