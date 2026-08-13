// Acceptance tests — K-4, `DocumentSpec` / `DocumentProfile` and `render()` as a pure function.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `03-F30` — the two layers, strictly separated; a profile is "a flat `slot_id → value` map"
//              that "cannot express position, order, font or structure"; and
//              `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes` is a
//              PURE function — "identical (spec, profile, data, caps) must produce byte-identical
//              output on Electron and React Native. A shipped competitor emits different tickets
//              for the same order on two of its own devices."
//   `03-F31` — document types are first-class entities, never a flag on a printer; each declares
//              its own data contract, spec, invariants and render-mode policy.
//   `03-F32` — type invariants override configuration: "a `kot` renders no money token under any
//              profile; a fiscal block cannot be suppressed under any profile. This is enforced
//              STRUCTURALLY — the profile schema has no slot id addressing them — not by a runtime
//              check on a value the owner supplied."
//   `03-F33` — the region ladder, and that `FISCAL_LOCKED` blocks are "not in the `DocumentSpec`
//              at all — injected at render by the certified authority adapter, which declares the
//              block AND its position".
//   `03-F34` — enforce at render, validate at save only for feedback; the three render-time
//              assertions; hard refusal plus S1, never silent degradation; and the named
//              regression "the shipped default always validates and always saves".
//   `03-F35` — the fiscal QR's physical size band (7 mm legal floor, 18–25 mm rendered), and that
//              the payload is an OPAQUE token.
//   `03-F36`/`03-F49` — every spec renders at its declared `min_columns`; the refusal below it.
//   `03-F42` — a document is rendered WHOLE and buffered as ONE unit.
//   `18 §10` — "document model → encoder → `Transport`" is one pipeline.
//   `00 §6`  — money is BRANDED integer paisa (`domain`'s `Paisa`), which is what makes the
//              compile-time money guard below possible at all.
// K-1's and K-2's landed contracts were read as the surface `render()` composes over (the
// capability record, `checkColumns`, `MIN_COLUMNS`, `encode`, `EncoderPart`). No K-4
// implementation was read; none exists. `plans/wave-1/kot-printing.md` was deliberately NOT read.
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion is about a value that came back from a function call: a list of blocks, a
// `Uint8Array`, a refusal record, or a `tsc` exit status. Where a test says a document "renders"
// it means a result object was returned; nothing here writes a byte to anything.
//
// ── THE TWO PROPERTIES THIS FILE EXISTS TO EXPLOIT ──
//
// `03-F30` states two things that are stronger than ordinary unit assertions, and a suite that
// does not use them leaves the spec's own guarantees on the table:
//
//  1. **PURITY IS A LAW WITH A NAMED COUNTER-EXAMPLE**, so it is tested as an EQUALITY OVER
//     REPEATED RENDER and never as a snapshot. A snapshot pins whatever the implementation did on
//     the day it was written; an equality says the two renders agreed with EACH OTHER, which is
//     the property the FR names ("two of its own devices"). The renders below are separated by an
//     injected clock, an injected `Math.random`, a changed timezone, a different profile key
//     insertion order, and a foreign document rendered in between — every ambient input a device
//     could differ on that this runtime can actually vary.
//  1b. **AND PURITY IS NOT REACHABILITY.** Every equality above is also satisfied by a renderer
//     that ignores its inputs and emits a constant. So each of the three INPUT AXES the FR names —
//     profile, data, caps — carries its own reachability control, and each is UNIVERSAL with a
//     named escape hatch rather than existential: "some slot reaches the output" is satisfied by
//     one live knob and fifteen dead ones. The caps axis is the column gate and the dpi-driven QR,
//     both asserted below.
//  2. **THE SLOT SPACE IS PROPERTY-TESTABLE IN FULL.** A profile is a flat `slot_id → value` map,
//     so `03-F32`'s "under any profile" is a quantifier this suite can DISCHARGE rather than
//     sample: the slot-id space is the union of every id every shipped spec declares, plus the
//     money-addressing ids an adversary would try, and the value space is enumerated. And because
//     `03-F32` wants the invariant enforced STRUCTURALLY, the primary assertion is that the TYPE
//     CANNOT EXPRESS the thing — a `tsc` run over a generated fixture — with the runtime sweep as
//     the second net, not the first.
//
// ── WHAT THIS SUITE CANNOT ASSERT (stated so the count is not read as coverage) ──
//
//  * **THAT THE PROFILE VALIDATOR DETECTS ANYTHING.** `03-F34` requires save-time validation to
//    exist and to be harmless, and NO FR anywhere states a single lint RULE. So the assertions
//    below cover its shape, its totality and the named regression ("the shipped default always
//    validates") — and a validator that returns `{ findings: [] }` for every input passes all of
//    them. That is a REPORTED GAP, not a covered clause. Inventing a rule to give the test
//    something to catch would be oracle round 2 §C pattern 3 exactly.
//  * **BYTE IDENTITY ACROSS RUNTIMES.** `03-F30` says "on Electron and React Native". One vitest
//    process cannot observe two runtimes. What is asserted is the strongest available proxy —
//    invariance under every ambient input this process can vary — and the cross-runtime pass is
//    OWED. It is named in the DEFERRED block; no test title here may be read as having run it.
//  * **THAT A `kot` CANNOT CARRY AN UNBRANDED MONEY NUMBER.** The compile-time guard detects
//    `domain`'s branded `Paisa` anywhere in the chit's data contract. A field typed plain `number`
//    and named `price` slips past it — and past nothing else, since `00 §6` and the GritQL money
//    ban are what make an unbranded money number a violation in its own right.
//    **What the runtime money-token sweep does and does not add, stated exactly** (it was
//    previously described here as "the second net under the same hole", which claimed more than it
//    catches — oracle round 2 §C pattern 1, the comment being the defect): it reads the TEXT the
//    document emits, over the shipped example AND over a mutated data twin, so it catches an
//    unbranded money field whose value REACHES PAPER IN A RECOGNISABLE FORM — `3,141.59`, `Rs`,
//    `PKR`, `₨`. It cannot catch a field whose value is bare integer paisa (`314159` prints as
//    `314159` and matches nothing), it cannot catch a field that never renders, and it says nothing
//    about the field's NAME or TYPE. So the hole under the compile-time guard is narrowed by it and
//    not closed, and closing it needs `00 §6`'s brand on the contract — which is the guard above.
//
// ── FR AMBIGUITIES AND CONFLICTS, REPORTED RATHER THAN FILLED ──
//
//  1. **`03-F34` NAMES `BODY` AND `TOTALS` NEITHER LOCKED NOR OWNER.** The FR bans "an owner slot
//     rendered inside a locked region" and `03-F33`'s ladder marks three regions `_LOCKED` and two
//     `_OWNER`, leaving `BODY` and `TOTALS` unclassified. A body block that fills an owner slot is
//     the ordinary case for `03-F38`'s `kitchen_name`, so reading them as locked would be absurd —
//     but reading them as owner regions is equally unstated. **Nothing below asserts either way**;
//     the assertions run over the three `_LOCKED` and the two `_OWNER` regions only. Filling this
//     gap is a spec change, not a test.
//  2. **`03-F30` VERSIONS A SPEC AND SAYS NOTHING ABOUT MIGRATION.** `Spec@v` is in the signature
//     and rationale (b) — "an owner can lose a *slot*, never a *layout*, which shrinks migration by
//     an order of magnitude" — implies a profile authored against `v1` meets a `v2` spec that
//     dropped a slot. What happens then is not stated: is the stale key inert, a finding, or a
//     refusal? This suite asserts only that an UNDECLARED slot id is INERT, which follows from
//     `03-F30`'s "It can only fill holes the spec declared" and from `03-F34`'s refusal list not
//     containing a profile cause. It does NOT assert a migration policy.
//  3. **`03 §8` vs `03-F36` ON AN OVER-WIDE IMAGE.** K-2's DEFERRED block hands this here: `03 §8`
//     says logos are "rasterized at the target dot width" (reads as scaling), `03-F36`'s off-paper
//     argument reads as refusal. The FRs still do not say which, so nothing below asserts either.
//     Passing it on unresolved is the honest move; guessing would put a number in the oracle that
//     no FR supplies.
//  4. **`27-F56`'s RASTER CLAUSE IS STILL OPEN AND K-2 ASSIGNED IT HERE.** "An inverted band drawn
//     as a raster image rather than through `GS B` spends the same attention and must count against
//     the same scope." Closing it needs a block to declare that it IS a band, and `03-F30` says
//     blocks are "typed" without naming one type. This oracle will not invent that vocabulary; the
//     clause stays owed and is repeated in the DEFERRED block so it is not lost twice.
//  5. **`03-F36`'s SPACE-AS-LAYOUT BAN HAS NO LAYER THAT CAN HOLD IT YET.** K-1 deferred it to
//     K-4/K-5 and K-2 recorded that the byte-level reading cannot be the intended one (a
//     `left | right` block must pad to reach its column). K-4 owns blocks, not lines, so it is
//     handed on to K-5 rather than asserted here at a layer that cannot see a line.
//  6. **`03-F34`'s REFUSAL CARRIES NO MEASUREMENT, EXCEPT THE ONE `03-F49` ALREADY NAMED.** A
//     `fiscal_qr_too_small` band can say WHAT is wrong but not BY HOW MUCH, and no FR asks for the
//     QR's equivalent — so the four other causes keep K-1's five fields exactly. The one exception
//     is not uniformity, it is `03-F49`: `required_columns`/`available_columns` exist because doc
//     14 needs them "at assignment time, not at 20:40 on a Friday", K-1's `checkColumns` already
//     returns them, and an oracle that banned them would be ordering the renderer to throw a
//     measurement away on its way through. They are PERMITTED on that one cause and required
//     nowhere — see `RENDER_REFUSAL_KEYS_BY_REASON`.
//  7. **WHICH ENCODER CAUSE A NON-LATIN PROFILE VALUE TAKES IS UNSTATED.** `03-F8`'s July 2026
//     ruling makes a non-Latin field a REFUSAL rather than a raster, and K-2 landed two codes for
//     it: `non_ascii_system_text` (interface text, `00 §5.6` English-only) and
//     `raster_font_unavailable` (user content, `00 §5.6` "uncontrolled Unicode"). An owner-typed
//     slot value — a kitchen name in the back office — is arguably either, and no FR classifies it.
//     The sweep below therefore asserts the refusal and admits BOTH codes; it does not pick one.
//     It also does not assert that the refusal names the offending CODEPOINT: that is a
//     measurement field, no FR supplies one, and inventing it here is the same move ambiguity 6
//     refuses for the QR.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as escpos from "../index.js";
import { type EscposK2Api, encode } from "./encoder-oracle-surface.js";
import {
  DOCUMENT_TYPES_PER_03_F31,
  type DocumentType,
  type EscposK1Api,
  minColumns,
  type PrinterCapability,
} from "./oracle-surface.js";
import {
  type DocumentProfile,
  type DocumentSpec,
  documentSpecs,
  type EscposK4Api,
  type FiscalBlock,
  LOCKED_REGIONS,
  OWNER_REGIONS,
  REGIONS_PER_03_F33,
  RENDER_REFUSAL_KEY_FLOOR,
  RENDER_REFUSAL_KEYS_BY_REASON,
  type RenderedBlock,
  type RenderRefusal,
  type RenderRefusalReason,
  type RenderResult,
  regions,
  render,
  SCRIPT_REFUSAL_REASONS,
  type SlotValue,
  type SpecRegion,
  validateProfile,
} from "./render-oracle-surface.js";

const k1 = escpos as unknown as EscposK1Api;
const k2 = escpos as unknown as EscposK2Api;
const api = escpos as unknown as EscposK4Api;

// ── fixtures and readers (no policy lives here; every number below is cited) ────────────────────

/**
 * A capability record built from `03 §7`'s own derivation, so a boundary case does not depend on
 * whatever the shipped table happens to contain. Font A = 12, Font B = 9 (`03 §7`). K-1's helper,
 * reused unchanged so the two suites cannot disagree about what "42 columns" means.
 */
const capsAt = (
  cols_font_a: number,
  model_id: string,
  over: Partial<PrinterCapability> = {},
): PrinterCapability => {
  const print_dots = cols_font_a * 12;
  return {
    model_id,
    dots: print_dots,
    dpi: 203,
    cols_font_a,
    cols_font_b: Math.floor(print_dots / 9),
    has_native_qr: false,
    has_cutter: true,
    raster_ok: true,
    ...over,
  };
};

/** Wide enough that no `03-F49` floor is in play; the column gate has its own tests. */
const WIDE = capsAt(64, "WIDE-64");

const shippedSpecs = (): DocumentSpec[] =>
  Object.values(documentSpecs(api)).filter((spec): spec is DocumentSpec => spec !== undefined);

const kotSpec = (): DocumentSpec => {
  const spec = documentSpecs(api).kot;
  if (spec === undefined)
    throw new Error("DOCUMENT_SPECS.kot is not shipped yet (K-4, 03-F30 / 03-F32)");
  return spec;
};

const slotDeclarationsOf = (spec: DocumentSpec) => spec.blocks.flatMap((block) => block.slots);

/**
 * `03-F34`'s "the shipped default": the profile made of every declared slot's declared default.
 * Derived here rather than imported so the oracle does not depend on the implementation agreeing
 * with itself about what a default is — see the interpretation note on `SlotDeclaration`.
 */
const shippedDefaultProfile = (spec: DocumentSpec): DocumentProfile =>
  Object.fromEntries(slotDeclarationsOf(spec).map((slot) => [slot.slot_id, slot.default]));

/**
 * Distinct legal values of the same scalar type, for "does this slot reach the output" probes.
 *
 * A LIST and not a single value, because one probe cannot distinguish a dead knob from a live one
 * whose effect this data does not exercise: `03-F39` makes `max_lines_per_chit` an owner setting
 * and raising it by 7 changes nothing on a chit that was never near the limit, while lowering it to
 * 1 changes everything. So each slot is probed with a spread that includes an extreme of its own
 * type before it may be called unreachable.
 */
const profileProbes = (value: SlotValue): SlotValue[] => {
  const candidates: SlotValue[] =
    typeof value === "boolean"
      ? [!value]
      : typeof value === "number"
        ? [value + 7, 1, 2, 99]
        : [`${value}-ZQXJV`, "ZQXJV", "X"];
  return candidates.filter((candidate) => candidate !== value);
};

const okOf = (result: RenderResult, label: string): Extract<RenderResult, { ok: true }> => {
  expect(result.ok, `${label}: expected a rendered document, got ${JSON.stringify(result)}`).toBe(
    true,
  );
  return result as Extract<RenderResult, { ok: true }>;
};

const refusalOf = (result: RenderResult, label: string): RenderRefusal => {
  expect(result.ok, `${label}: expected a refusal, got a rendered document`).toBe(false);
  return result as RenderRefusal;
};

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * The text a document actually puts on paper, as one string.
 *
 * `image` bits and the `fiscal_qr` payload are DELIBERATELY excluded. K-2 established why a raw
 * byte scan is unsound once raster exists (arbitrary payload bytes collide with any pattern), and
 * `03-F35` forbids reading the QR payload at all — it is "an opaque token … never parsed". Reading
 * the emitted text parts is the sound version of the same scan.
 */
const textOf = (blocks: readonly RenderedBlock[]): string =>
  blocks
    .flatMap((block) =>
      block.parts.map((part) =>
        part.kind === "text" || part.kind === "user_text" ? part.value : "",
      ),
    )
    .join(" ");

const flatPartsOf = (blocks: readonly RenderedBlock[]) => blocks.flatMap((block) => block.parts);

// ── the DATA axis, walked generically (`03-F30`'s third argument) ────────────────────────────────
//
// `render(Spec@v, Profile, Data, PrinterCaps, …)` takes THREE inputs that can vary and this suite
// used to vary two of them: every render below the fixtures passed `spec.example_data` or a clone
// of it, so a renderer that ignored `data` outright satisfied the whole file. These walk the
// shipped example GENERICALLY — no field name, no shape and no unit appears anywhere here, because
// `03-F31` says each document type declares its OWN data contract and an oracle that named a field
// would be writing that contract instead of checking it.

type DataLeaf = { readonly path: readonly (string | number)[]; readonly value: string | number };

/** Every string/number leaf of a shipped `example_data`, in a stable order, with its path. */
const dataLeavesOf = (root: unknown): DataLeaf[] => {
  const found: DataLeaf[] = [];
  const walk = (node: unknown, path: readonly (string | number)[]): void => {
    if (typeof node === "string" || typeof node === "number") {
      found.push({ path, value: node });
      return;
    }
    if (Array.isArray(node)) {
      for (const [index, element] of node.entries()) walk(element, [...path, index]);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) walk(value, [...path, key]);
    }
  };
  walk(root, []);
  return found;
};

const leafLabel = (leaf: DataLeaf): string =>
  leaf.path.map((step) => (typeof step === "number" ? `[${step}]` : `.${step}`)).join("") || "$";

/**
 * The deltas a NUMBER leaf is probed by: `1`, `7`, and then `7 × 10ᵏ` at every order of magnitude
 * strictly below the value's own.
 *
 * ONE SMALL DELTA IS NOT ENOUGH, AND THAT WAS MEASURED, NOT FEARED. A leaf that is FORMATTED before
 * it is printed is invariant to any delta finer than the format's own granularity: `27-F62` stamps
 * a chit with `branch_created_at`, an integer MILLISECOND quantity, and a ticket that prints it at
 * any human granularity is unmoved by 7 ms. With `[value + 1, value + 7]` as the whole probe set,
 * the walk below reported `kot.branch_created_at` as a leaf that never reaches paper AGAINST A
 * LAYOUT THAT PLAINLY READS IT — an assertion that cannot go green under a correct implementation,
 * which blocks the implementer indefinitely and is as damaging as a vacuous test. The probe was the
 * defect, so the probe is what changed.
 *
 * The escape hatch was the wrong repair for the same reason and is deliberately NOT used here:
 * a `DATA_LEAVES_NOT_ON_PAPER` row would state in the oracle that the ticket does not print this
 * leaf, which is false, and it would then swallow the real regression on the day the renderer stops
 * reading the stamp.
 *
 * A LADDER AND NOT ONE BIG DELTA, because the renderer's granularity is exactly what this file may
 * not know — `03-F31` says each document type declares its OWN data contract, and naming a unit
 * here would be writing that contract instead of checking it. Whatever unit `U` a leaf happens to
 * be formatted in — paisa printed as rupees, milliseconds printed as minutes, milligrams printed as
 * kilos — some rung is ≥ `U` while still being smaller than the value itself, so the mutant stays a
 * plausible value of the same field rather than a marker.
 *
 * EVERY RUNG IS `7 × 10ᵏ`, WHICH CARRIES NO FACTOR OF 3, so no rung can be a whole number of minutes
 * (60 000 ms), hours (3 600 000 ms) or days (86 400 000 ms). That is not decoration — it is the trap
 * in the obvious repair. "Probe a timestamp by a DAY" leaves an `HH:MM` render byte-identical,
 * because a clock-of-day format is periodic and a day is its period; the same holds for an hour and
 * a minute on coarser clocks. A rung that cannot be a whole period of any of the three cannot be
 * swallowed by a cyclic format either.
 *
 * Small values keep the small deltas ALONE — a quantity of `2` is probed with `3` and `9`, never
 * with `7 000 002` — so the ladder never puts on the ticket a number the field could not hold, and
 * a leaf's mutant stays inside its own order of magnitude.
 */
const numericProbeDeltas = (value: number): number[] => {
  const deltas = [1, 7];
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  for (let k = 1; k <= magnitude - 1; k += 1) deltas.push(7 * 10 ** k);
  return deltas;
};

/**
 * Distinct values for a data leaf, SHAPE-PRESERVING on purpose.
 *
 * A string leaf is mutated one character at a time and only within its own character class
 * (digit → digit, letter → letter, punctuation untouched), so the mutant has the same length and
 * the same structure as the original. The blunt alternative — replacing the whole leaf with a
 * marker string — changes the length, which can reflow a line or trip `03-F39`'s pagination, and
 * then a difference in the bytes proves the LENGTH reached the output rather than the VALUE. `X`,
 * `Y`, `x`, `y`, `7` and `3` are the replacement alphabet because none of them can build one of
 * `MONEY_TOKEN_PATTERNS`' tokens out of a leaf that did not already contain one.
 */
const dataProbes = (value: string | number): (string | number)[] => {
  if (typeof value === "number")
    return numericProbeDeltas(value)
      .map((delta) => value + delta)
      .filter((next, index, all) => next !== value && all.indexOf(next) === index);
  const chars = [...value];
  const swap = (char: string): string => {
    if (/[0-9]/.test(char)) return char === "7" ? "3" : "7";
    if (/[a-z]/.test(char)) return char === "x" ? "y" : "x";
    if (/[A-Z]/.test(char)) return char === "X" ? "Y" : "X";
    return char;
  };
  const mutatedAt = (index: number): string => {
    const next = [...chars];
    next[index] = swap(chars[index] ?? "");
    return next.join("");
  };
  if (chars.length === 0) return [];
  return [mutatedAt(chars.length - 1), mutatedAt(0)].filter((next) => next !== value);
};

/** The shipped example with ONE leaf replaced. Deep-copied first: `03-F30` forbids mutating input. */
const withLeafReplaced = (root: unknown, leaf: DataLeaf, next: string | number): unknown => {
  const copy = structuredClone(root);
  const last = leaf.path[leaf.path.length - 1];
  if (last === undefined) throw new Error("a scalar example_data has no leaf to replace");
  let node = copy as Record<string | number, unknown>;
  for (const step of leaf.path.slice(0, -1)) {
    node = node[step] as Record<string | number, unknown>;
  }
  node[last] = next;
  return copy;
};

// ── reading a raster back out of the bytes (`03-F34`'s QR size, closed through the output) ───────
//
// `GS v 0` is documented ESC/POS and K-2's suite already walks it; what is new here is only that
// K-4 must tie the number `render()` CHECKED to the symbol it EMITTED. The payload is skipped
// rather than scanned, because raster bits can carry the header pattern themselves.

const RASTER_HEADER = [0x1d, 0x76, 0x30, 0x00] as const;

type Raster = {
  readonly at: number;
  readonly length: number;
  readonly width_dots: number;
  readonly height_dots: number;
};

const rastersIn = (bytes: Uint8Array): Raster[] => {
  const found: Raster[] = [];
  let i = 0;
  while (i + RASTER_HEADER.length + 4 <= bytes.length) {
    if (RASTER_HEADER.every((byte, k) => bytes[i + k] === byte)) {
      const bytesPerRow = (bytes[i + 4] ?? 0) | ((bytes[i + 5] ?? 0) << 8);
      const height = (bytes[i + 6] ?? 0) | ((bytes[i + 7] ?? 0) << 8);
      found.push({
        at: i,
        length: 8 + bytesPerRow * height,
        width_dots: bytesPerRow * 8,
        height_dots: height,
      });
      i += 8 + bytesPerRow * height;
      continue;
    }
    i += 1;
  }
  return found;
};

const indexOfBytes = (haystack: Uint8Array, needle: Uint8Array): number => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let k = 0; k < needle.length; k += 1) if (haystack[i + k] !== needle[k]) continue outer;
    return i;
  }
  return -1;
};

/** The unit conversion, and nothing else: `03-F35` states its band in millimetres. */
const mmOf = (dots: number, dpi: number): number => (dots / dpi) * 25.4;

/**
 * THE SYMBOL THE DOCUMENT ACTUALLY CARRIES, measured out of the bytes.
 *
 * `03-F34` says the render-time assertion is that "the QR's **computed physical size** meets the
 * adapter's declared minimum for the target dpi", and a refusal test alone cannot check that: it
 * observes only that some number was compared to some other number. Closing the loop means going
 * back through the OUTPUT — a renderer that checks 21.5 mm against the declared minimum and then
 * emits a symbol sized off a constant dpi passes every accept/refuse assertion in this file and
 * prints a QR that fails the regulator's floor, which is `03-F35`'s "worst available failure mode"
 * with a green suite over it.
 *
 * The symbol is IDENTIFIED rather than guessed at: the adapter's block is re-encoded on its own
 * (K-2's `encode`, the same call the composition law uses), which isolates its rasters from any
 * logo the spec's own blocks carry, and the resulting command must then be found byte-for-byte
 * INSIDE the document — so the thing measured here is the thing printed there. Squareness within
 * one byte is K-2's own criterion and is what tells a QR from a logo; the HEIGHT is the true side,
 * because `GS v 0` pads each row out to a byte and the padding belongs to the command.
 */
const fiscalQrRasterOf = (
  rendered: Extract<RenderResult, { ok: true }>,
  fiscal: FiscalBlock,
  caps: PrinterCapability,
  label: string,
): Raster => {
  const block = rendered.blocks.find((candidate) => candidate.block_id === fiscal.block_id);
  expect(block, `${label}: the adapter's block is not in the document`).toBeDefined();
  const alone = encode(k2, block?.parts ?? [], caps);
  expect(alone.ok, `${label}: the adapter's block does not encode on its own`).toBe(true);
  const aloneBytes = (alone as Extract<typeof alone, { ok: true }>).bytes;
  const square = rastersIn(aloneBytes).filter(
    (raster) => Math.abs(raster.width_dots - raster.height_dots) <= 8,
  );
  expect(
    square.length,
    `${label}: expected exactly one square raster in the fiscal block (the QR), saw ${square.length}`,
  ).toBe(1);
  const symbol = square[0] as Raster;
  expect(
    indexOfBytes(rendered.bytes, aloneBytes.subarray(symbol.at, symbol.at + symbol.length)),
    `${label}: the symbol the fiscal block encodes to is not the one the document carries`,
  ).toBeGreaterThanOrEqual(0);
  return symbol;
};

/**
 * `03-F32`: "a `kot` renders **no money token** under any profile."
 *
 * The FR names no token set, so this is a stated heuristic and it is the SECOND net, never the
 * first — the structural guard (`tsc` over the chit's data contract) is the one that carries the
 * clause. Each pattern is here because a Pakistani thermal ticket would print money that way:
 * `27-F22` fixes Western digits, `00 §6` fixes two decimal places on a rupee amount, and doc 16's
 * documents use both the word and the sign.
 */
const MONEY_TOKEN_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "a decimal rupee amount (e.g. `3,141.59`)", re: /\d[\d,]*\.\d{2}(?!\d)/ },
  { name: "a rupee word (`Rs` / `PKR`)", re: /(^|[^A-Za-z])(Rs|RS|PKR)([^A-Za-z]|$)/ },
  { name: "the rupee sign (`₨`)", re: /₨/ },
];

const moneyTokenIn = (text: string): string | null =>
  MONEY_TOKEN_PATTERNS.find((pattern) => pattern.re.test(text))?.name ?? null;

/**
 * Slot ids an owner (or an over-helpful back-office screen) would reach for to get a price onto a
 * chit. NONE of these is declared by any spec — that is the point. `03-F32` says the enforcement
 * is that "the profile schema has no slot id addressing them", so the runtime half of the clause
 * is that these are INERT.
 */
const MONEY_ADDRESSING_SLOT_IDS = [
  "price",
  "total",
  "show_prices",
  "line.price",
  "item.amount",
  "totals.grand_total",
  "currency",
] as const;

/**
 * The value space swept over every slot id. Money-shaped on purpose, and split by SCRIPT.
 *
 * The split is not cosmetic and it is the reason this constant is two constants. K-2's landed
 * encoder refuses any text a printer font cannot render (`03-F8`, founder ruling July 2026:
 * `isPrintableLatin` admits ASCII, Latin-1/Latin-Extended and General Punctuation, and nothing
 * else), so `₨` — U+20A8, outside every one of those ranges — cannot appear in a document that
 * renders. A sweep that put it on a DECLARED slot and then asserted `ok` was asserting something
 * no implementation could ever satisfy: the value either reaches the encoder and is refused, or it
 * is dropped, which `03-F34` bans outright. That sweep is split below — the Latin values assert
 * the document renders, `₨` asserts the REFUSAL — and neither value is dropped from the file.
 *
 * On an UNDECLARED slot id every value stays legal whatever its script, because `03-F30` says a
 * profile "can only fill holes the spec declared": an id no spec declares never reaches a byte, so
 * it never reaches the encoder either. That is why the inertness sweep keeps the whole set.
 */
const LATIN_SWEEP_VALUES: readonly SlotValue[] = [
  "3141.59",
  "Rs 3,141.59",
  "PKR 314159",
  314159,
  true,
  false,
  "",
];

/** `03-F8`: outside every range a printer font can render. U+20A8. */
const NON_LATIN_SWEEP_VALUES: readonly SlotValue[] = ["₨314159", "₨", "کچن"];

const SWEEP_VALUES: readonly SlotValue[] = [...LATIN_SWEEP_VALUES, ...NON_LATIN_SWEEP_VALUES];

/**
 * Declared slots that no probe of their own type can move, WITH the FR that says they need not
 * show up in a rendered document. Empty, and it is meant to stay that way: `03-F30` calls a slot
 * "a hole the spec declared", and a hole nothing fills is a row doc 14 will draw an editor for and
 * an owner will set to no effect.
 *
 * Adding an entry is a FINDING for the test-owning session, cited by FR ID — never a test edit by
 * the implementing session (`24 §3` step 2, and this package's CLAUDE.md).
 */
const SLOTS_WITH_NO_OBSERVABLE_EFFECT: readonly string[] = [];

/**
 * The same hatch for the data axis: leaves of a shipped `example_data` that no FR requires on
 * paper. Also empty, and held to the same rule.
 */
const DATA_LEAVES_NOT_ON_PAPER: readonly string[] = [];

/** A fiscal adapter block that is satisfiable: `03-F35`'s 7 mm legal floor is the minimum. */
const fiscalAt = (spec: DocumentSpec, over: Partial<FiscalBlock> = {}): FiscalBlock => ({
  block_id: "FBR_INVOICE",
  after_block_id: spec.blocks[0]?.block_id ?? null,
  mandatory_block_ids: [],
  qr_payload: "FBR-OPAQUE-TOKEN-0000000000",
  min_qr_mm: 7,
  ...over,
});

// ── the compile-time harness (`03-F32`: "enforced structurally") ────────────────────────────────
//
// `03-F32` does not ask for a runtime check — it says the invariant is enforced "STRUCTURALLY …
// not by a runtime check on a value the owner supplied". A claim about a TYPE can only be checked
// by a type-checker, so each case below writes a fixture and runs the repo's own `tsc` over it.
// This is `packages/ui`'s `type-contracts.oracle.test.ts` idiom, reused unchanged including its
// two hard-won details: the fixtures live OUTSIDE `src` so `pnpm verify` never compiles them, and
// the timeout is 60 s because `tsc` is a subprocess whose wall time is machine load, not
// assertion cost.

const ESCPOS_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const REPO_ROOT = join(ESCPOS_ROOT, "..", "..");
const TMP = join(ESCPOS_ROOT, ".oracle-typecheck");
const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
const TYPECHECK_TIMEOUT_MS = 60_000;

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const typecheck = (name: string, code: string): string => {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fixture.ts"), code);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(REPO_ROOT, "packages", "config", "tsconfig.base.json"),
      compilerOptions: {
        types: [],
        paths: {
          "@restos/escpos": [join(ESCPOS_ROOT, "src", "index.ts")],
          "@restos/domain": [join(REPO_ROOT, "packages", "domain", "src", "index.ts")],
        },
      },
      include: ["fixture.ts"],
    }),
  );
  try {
    execFileSync(process.execPath, [TSC, "--noEmit", "-p", join(dir, "tsconfig.json")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "";
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
};

/**
 * A rejection only counts when the compiler rejected THE SHAPE.
 *
 * This guard is the whole reason these tests are not the "guard that passed by not looking".
 * Before `render()` exists, every fixture below fails to compile — `Cannot find module`,
 * `has no exported member` — and a bare "did tsc fail?" assertion would report GREEN on a package
 * that exports nothing at all, then keep reporting green if the export were later deleted. So a
 * resolution failure is treated as a BROKEN HARNESS, named as such, and never as a satisfied
 * contract.
 *
 * The list has TWO levels because a name can fail to resolve at two depths, and the first version
 * of this guard only listed the first. `TS2307`/`TS2305`/`TS2694`/`TS2724`/`TS2503` are a missing
 * MODULE or a missing EXPORT. `TS2339`/`TS2551` are a missing PROPERTY — `SpecBlock["region"]` on
 * a `SpecBlock` that has no `region`, `DOCUMENT_SPECS.kot` on a table with no `kot`,
 * `kot.example_data` on a spec that does not declare one — and every one of those is a fixture
 * that proved nothing while failing loudly enough to look like proof. `TS2304` is the same failure
 * for a bare name. Missing them is exactly the job the paragraph above says this guard exists to
 * do.
 */
const RESOLUTION_FAILURES = [
  "TS2307",
  "TS2305",
  "TS2694",
  "TS2724",
  "TS2503",
  "TS2339",
  "TS2551",
  "TS2304",
] as const;

/**
 * The diagnostics that mean "the compiler rejected the SHAPE" — assignability and object-literal
 * excess/missing properties. Every rejection fixture below is one of those two moves, so a
 * rejection that carries none of these codes is a fixture that failed for a reason nobody predicted
 * and is reported rather than counted.
 */
const SHAPE_REJECTIONS = [
  "TS2322",
  "TS2353",
  "TS2559",
  "TS2561",
  "TS2739",
  "TS2741",
  "TS2769",
] as const;

const assertRejectedByTheType = (
  name: string,
  code: string,
  expected: readonly string[] = SHAPE_REJECTIONS,
): void => {
  const out = typecheck(name, code);
  const resolution = RESOLUTION_FAILURES.filter((codeName) => out.includes(codeName));
  expect(
    resolution,
    `${name}: tsc could not RESOLVE the fixture, so nothing was proved about the type — ${out}`,
  ).toEqual([]);
  expect(out, `${name}: the compiler ACCEPTED a shape the FR says cannot exist`).toContain(
    "fixture.ts",
  );
  expect(
    expected.filter((codeName) => out.includes(codeName)),
    `${name}: rejected, but by none of the diagnostics the FR predicts (${expected.join("/")}) — ${out}`,
  ).not.toEqual([]);
};

const assertAccepted = (name: string, code: string): void => {
  expect(typecheck(name, code), `${name}: the compiler rejected a shape the FR requires`).toBe("");
};

/** A slot the type system can name, taken from whatever the shipped table actually declares. */
const firstDeclaredSlot = (): { spec: DocumentSpec; slot_id: string; default: SlotValue } => {
  for (const spec of shippedSpecs()) {
    const slot = slotDeclarationsOf(spec)[0];
    if (slot !== undefined) return { spec, slot_id: slot.slot_id, default: slot.default };
  }
  throw new Error(
    "no shipped DocumentSpec declares a slot — 03-F30's customisation surface is empty and every " +
      '"under any profile" assertion in this file would be vacuous (K-4, 03-F30)',
  );
};

/**
 * The keys a refusal carries that its OWN CAUSE does not permit (`RENDER_REFUSAL_KEYS_BY_REASON`).
 *
 * Declared once, at module scope, because both halves of the no-payload guard run it: the assertion
 * over real refusals and the control that proves the assertion can fail. A control that re-declares
 * the predicate it is controlling proves nothing about the predicate in use.
 *
 * An unrecognised `reason` permits NOTHING, so a renderer inventing a cause fails loudly here
 * rather than being waved through with an empty allowlist.
 */
const undeclaredKeys = (
  refusal: { reason: RenderRefusalReason } & Record<string, unknown>,
): string[] => {
  const permitted: readonly string[] = RENDER_REFUSAL_KEYS_BY_REASON[refusal.reason] ?? [];
  return Object.keys(refusal).filter((key) => !permitted.includes(key));
};

/**
 * One live refusal per `03-F34` cause, collected in one place.
 *
 * Collected from RENDERS and never from the type, so a renderer that declares four codes and
 * returns one of them for everything is caught; and shared by every guard that must hold over ALL
 * refusals rather than over the one that happened to be convenient (the column gate, which is the
 * only cause the shape guards used to see).
 */
type ObservedRefusal = { label: RenderRefusalReason; refusal: RenderRefusal };

const observedRefusals = (): ObservedRefusal[] => {
  const spec = kotSpec();
  const profile = shippedDefaultProfile(spec);
  const slot = firstDeclaredSlot();
  const lockedSpec: DocumentSpec = {
    ...slot.spec,
    blocks: slot.spec.blocks.map((block) =>
      block.slots.length > 0 ? { ...block, region: "TAIL_LOCKED" as SpecRegion } : block,
    ),
  };
  const observed: ObservedRefusal[] = [
    {
      label: "mandatory_block_missing",
      refusal: refusalOf(
        render(api, spec, profile, spec.example_data, WIDE, {
          ...fiscalAt(spec),
          mandatory_block_ids: ["NOT_IN_THIS_DOCUMENT"],
        }),
        "mandatory",
      ),
    },
    {
      label: "fiscal_qr_too_small",
      refusal: refusalOf(
        render(api, spec, profile, spec.example_data, WIDE, {
          ...fiscalAt(spec),
          min_qr_mm: 100,
        }),
        "qr size",
      ),
    },
    {
      label: "owner_slot_in_locked_region",
      refusal: refusalOf(
        render(api, lockedSpec, shippedDefaultProfile(slot.spec), slot.spec.example_data, WIDE),
        "locked region",
      ),
    },
    {
      label: "min_columns_not_met",
      refusal: refusalOf(
        render(api, spec, profile, spec.example_data, capsAt(spec.min_columns - 1, "NARROW")),
        "columns",
      ),
    },
  ];
  for (const { label, refusal } of observed) {
    expect(refusal.reason, `the ${label} case refused for another reason`).toBe(label);
  }
  return observed;
};

// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("03-F33 — the region ladder is data, and a spec may not declare the regulated rung", () => {
  it("03-F33: the seven regions are exported in the FR's own order", () => {
    // "Blocks carry exactly one region: `HEAD_LOCKED → HEAD_OWNER → BODY → TOTALS →
    // FISCAL_LOCKED → FOOT_OWNER → TAIL_LOCKED`." The order is the FR's, and it is what makes
    // "owner content is legal only OUTSIDE the regulated block" a checkable statement.
    expect(regions(api)).toEqual([...REGIONS_PER_03_F33]);
  });

  it(
    "03-F33: a DocumentSpec block CANNOT declare FISCAL_LOCKED — the type refuses it",
    () => {
      // "`FISCAL_LOCKED` blocks are NOT IN THE `DocumentSpec` AT ALL — they are injected at render
      // by the certified authority adapter (16-F23), which declares the block and its position."
      // Structural, per `03-F32`'s precedent: a spec that could name the rung would let a vendor
      // author the regulated block by hand, and no runtime check on a value the vendor supplied is
      // as strong as a type that cannot hold it.
      assertRejectedByTheType(
        "spec-block-region-fiscal-locked",
        `import type { SpecBlock } from "@restos/escpos";
         export const bad: SpecBlock["region"] = "FISCAL_LOCKED";`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it(
    "03-F33: every OTHER rung of the ladder is still declarable — the exclusion is one rung, not a lockout",
    () => {
      // The positive control for the case above. Without it, a `SpecBlock["region"]` of `never`
      // would pass the rejection test while making the spec model unusable.
      assertAccepted(
        "spec-block-region-others",
        `import type { SpecBlock } from "@restos/escpos";
         export const ok: SpecBlock["region"][] = [
           "HEAD_LOCKED", "HEAD_OWNER", "BODY", "TOTALS", "FOOT_OWNER", "TAIL_LOCKED",
         ];`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it("03-F33: no shipped spec declares a FISCAL_LOCKED block, and every block's region is on the ladder", () => {
    const specs = shippedSpecs();
    expect(
      specs.length,
      "no DocumentSpec is shipped — 03-F30 says they ship as code",
    ).toBeGreaterThan(0);
    let blocksSeen = 0;
    for (const spec of specs) {
      for (const block of spec.blocks) {
        const label = `${spec.type}/${block.block_id}`;
        expect(REGIONS_PER_03_F33, label).toContain(block.region);
        expect(block.region, `${label} declares the adapter's own rung`).not.toBe("FISCAL_LOCKED");
        blocksSeen++;
      }
    }
    // A table of specs with no blocks would satisfy the loop above having looked at nothing.
    expect(blocksSeen, "no shipped spec declares a single block").toBeGreaterThan(0);
  });
});

describe("03-F30 — the two layers are separated by the TYPE, not by convention", () => {
  it(
    "03-F30: a profile value cannot be an ARRAY — that is order, which a profile 'cannot express'",
    () => {
      const slot = firstDeclaredSlot();
      assertRejectedByTheType(
        "profile-value-array",
        `import { DOCUMENT_SPECS } from "@restos/escpos";
         import type { ProfileFor } from "@restos/escpos";
         type P = ProfileFor<NonNullable<(typeof DOCUMENT_SPECS)[${JSON.stringify(slot.spec.type)}]>>;
         export const bad: P = { ${JSON.stringify(slot.slot_id)}: ["first", "second"] };`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it(
    "03-F30: a profile value cannot be an OBJECT — that is structure and font, which a profile 'cannot express'",
    () => {
      const slot = firstDeclaredSlot();
      assertRejectedByTheType(
        "profile-value-object",
        `import { DOCUMENT_SPECS } from "@restos/escpos";
         import type { ProfileFor } from "@restos/escpos";
         type P = ProfileFor<NonNullable<(typeof DOCUMENT_SPECS)[${JSON.stringify(slot.spec.type)}]>>;
         export const bad: P = { ${JSON.stringify(slot.slot_id)}: { font: "B", x: 384 } };`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it(
    "03-F30: a slot the spec DID declare is fillable with its own declared default — the control for the two rejections above",
    () => {
      // Both rejections above are about ABSENCE, and an absence check that cannot pass on the
      // legal case proves only that the type is unusable. This fixture is built from a slot id and
      // a default value read out of the SHIPPED table at run time, so it cannot drift from what
      // the implementation actually declares.
      const slot = firstDeclaredSlot();
      assertAccepted(
        "profile-value-declared-slot",
        `import { DOCUMENT_SPECS } from "@restos/escpos";
         import type { ProfileFor } from "@restos/escpos";
         type P = ProfileFor<NonNullable<(typeof DOCUMENT_SPECS)[${JSON.stringify(slot.spec.type)}]>>;
         export const good: P = { ${JSON.stringify(slot.slot_id)}: ${JSON.stringify(slot.default)} };`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it("03-F30: every shipped spec is versioned, and the version is a usable integer", () => {
    const specs = shippedSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(Number.isInteger(spec.version), `${spec.type}.version is an integer`).toBe(true);
      expect(spec.version, `${spec.type}.version is positive`).toBeGreaterThan(0);
    }
  });

  it("03-F30: a profile is FLAT — every declared slot id is a plain key and every default is a scalar", () => {
    const specs = shippedSpecs();
    let slotsSeen = 0;
    for (const spec of specs) {
      for (const slot of slotDeclarationsOf(spec)) {
        const label = `${spec.type}/${slot.slot_id}`;
        expect(typeof slot.slot_id, label).toBe("string");
        expect(slot.slot_id.length, `${label} has an empty slot id`).toBeGreaterThan(0);
        expect(["string", "number", "boolean"], `${label} default is not a scalar`).toContain(
          typeof slot.default,
        );
        slotsSeen++;
      }
    }
    expect(
      slotsSeen,
      "no spec declares a slot — 03-F30's whole customisation surface is empty",
    ).toBeGreaterThan(0);
  });

  it("03-F30: one spec per document type — the table's key IS the spec's type", () => {
    // "one spec per document type". A map keyed by type gives uniqueness for free; what a map
    // cannot give for free is agreement between the key and the record, and a spec filed under the
    // wrong key would make every type-scoped invariant below read the wrong document.
    const table = documentSpecs(api);
    const keys = Object.keys(table);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(DOCUMENT_TYPES_PER_03_F31, `${key} is not an 03-F31 document type`).toContain(key);
      expect(table[key as DocumentType]?.type, `${key} is filed under the wrong key`).toBe(key);
    }
  });
});

describe("03-F31/03-F49 — structural differences live in the TYPE, and `min_columns` has ONE source", () => {
  it("03-F49: every shipped spec's `min_columns` IS K-1's declared number, not a second copy of it", () => {
    // K-1's own DEFERRED note assigned this here: "`03-F49` puts `min_columns` on the
    // `DocumentSpec` (K-4's type) while K-1 must export it to be testable at all. K-4 must SOURCE
    // `DocumentSpec.min_columns` from this constant; two declarations of one number is the defect,
    // and only K-4 can close it." The oracle cannot see an import graph; it can see disagreement,
    // which is the failure the duplication produces.
    const table = minColumns(k1);
    const specs = shippedSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      const declared = table[spec.type];
      expect(declared, `MIN_COLUMNS has no entry for the shipped ${spec.type} spec`).toBeDefined();
      expect(spec.min_columns, `${spec.type}: spec and MIN_COLUMNS disagree`).toBe(declared);
    }
  });

  it("03-F49/27-F57: the shipped `kot` spec declares 42 columns", () => {
    // `03-F49`: "`kot` declares 42". `27-F57` states the same number from the other side. Named
    // separately from the agreement test above because that one would stay green if BOTH numbers
    // were wrong in the same direction.
    expect(kotSpec().min_columns).toBe(42);
  });

  it("03-F31: a refusal names the document type from the SPEC — the type is not a caller's flag", () => {
    // "Document types are first-class entities, NEVER A FLAG ON A PRINTER." `render` is handed the
    // spec and nothing else that could carry a type, so the refusal's `document_type` can only
    // have come from the spec. Driven through the column gate because that is the refusal K-1
    // already pinned.
    const specs = shippedSpecs();
    let refusalsSeen = 0;
    for (const spec of specs) {
      const narrow = capsAt(spec.min_columns - 1, `BELOW-${spec.type}`);
      const refusal = refusalOf(
        render(api, spec, shippedDefaultProfile(spec), spec.example_data, narrow),
        `${spec.type} at ${narrow.cols_font_a} columns`,
      );
      expect(refusal.document_type, `${spec.type}: refusal names the wrong document`).toBe(
        spec.type,
      );
      expect(refusal.model_id, `${spec.type}: refusal does not name the printer`).toBe(
        narrow.model_id,
      );
      refusalsSeen++;
    }
    expect(refusalsSeen, "no spec was driven below its floor").toBeGreaterThan(0);
  });
});

describe("03-F30 — PURITY, tested as an equality over repeated render and never as a snapshot", () => {
  it("03-F30: the same inputs twice produce byte-identical output and identical blocks", () => {
    // "Identical (spec, profile, data, caps) must produce BYTE-IDENTICAL output on Electron and
    // React Native. A shipped competitor emits different tickets for the same order on two of its
    // own devices."
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const first = okOf(render(api, spec, profile, spec.example_data, WIDE), "first render");
    const second = okOf(render(api, spec, profile, spec.example_data, WIDE), "second render");
    expect(first.bytes.length, "a rendered document with no bytes").toBeGreaterThan(0);
    expect(hex(second.bytes)).toBe(hex(first.bytes));
    expect(second.blocks).toEqual(first.blocks);
  });

  it("03-F30: structurally equal but DISTINCT input objects produce byte-identical output", () => {
    // Identity is not the property the FR names; equality of content is. A renderer that memoised
    // on object identity would pass the test above and fail the one that matters, because two
    // devices never share an object.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const copy = structuredClone(spec) as DocumentSpec;
    const first = okOf(render(api, spec, profile, spec.example_data, WIDE), "original");
    const second = okOf(
      render(api, copy, { ...profile }, structuredClone(copy.example_data), { ...WIDE }),
      "deep copy",
    );
    expect(hex(second.bytes)).toBe(hex(first.bytes));
  });

  it("03-F30: the wall clock and `Math.random` cannot reach a byte", () => {
    // The two ambient inputs that make a "pure" renderer differ between devices, injected between
    // two otherwise identical renders. This is the clock-injection shape AGENTS.md law 1 uses for
    // folds, applied to the renderer for the same reason: a value that quietly reads the reading
    // device's state is invisible to plain repetition.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const randomSpy = vi.spyOn(Math, "random");
    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      randomSpy.mockReturnValue(0.111111);
      const first = okOf(render(api, spec, profile, spec.example_data, WIDE), "at 2026-01-01");

      vi.setSystemTime(new Date("2031-07-04T13:37:11.000Z"));
      randomSpy.mockReturnValue(0.999999);
      const second = okOf(render(api, spec, profile, spec.example_data, WIDE), "at 2031-07-04");

      expect(hex(second.bytes)).toBe(hex(first.bytes));
    } finally {
      vi.useRealTimers();
      randomSpy.mockRestore();
    }
  });

  it("03-F30: the host timezone cannot reach a byte", () => {
    // Two devices at one branch is the FR's scenario, but a POS host and an RN handheld can
    // disagree about `TZ` outright. `00 §5.4`'s business day is Asia/Karachi and is a property of
    // the BRANCH, so a renderer that formatted anything through the host zone would emit two
    // different tickets for one order.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const realTz = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const first = okOf(render(api, spec, profile, spec.example_data, WIDE), "TZ=UTC");
      process.env.TZ = "Pacific/Kiritimati";
      const second = okOf(
        render(api, spec, profile, spec.example_data, WIDE),
        "TZ=Pacific/Kiritimati",
      );
      expect(hex(second.bytes)).toBe(hex(first.bytes));
    } finally {
      if (realTz === undefined) delete process.env.TZ;
      else process.env.TZ = realTz;
    }
  });

  it("03-F30: the profile's KEY INSERTION ORDER cannot reach a byte", () => {
    // A profile is a MAP (`03-F30`: "a flat slot_id → value map"), and a map has no order. A
    // renderer that walked `Object.keys(profile)` instead of the spec's declared block order would
    // emit a different document for two profiles that are the same configuration — the single most
    // common unordered-collection defect there is, and one that only appears once a second slot
    // exists.
    const spec = kotSpec();
    const entries = Object.entries(shippedDefaultProfile(spec));
    const forward = Object.fromEntries(entries) as DocumentProfile;
    const reversed = Object.fromEntries([...entries].reverse()) as DocumentProfile;
    const first = okOf(render(api, spec, forward, spec.example_data, WIDE), "insertion order");
    const second = okOf(render(api, spec, reversed, spec.example_data, WIDE), "reversed order");
    expect(hex(second.bytes)).toBe(hex(first.bytes));
    expect(second.blocks).toEqual(first.blocks);
  });

  it("03-F30: rendering another document in between changes nothing — the renderer holds no state", () => {
    // A, B, A. `ESC @` at the head of a document is the encoder's half of this (K-2); the
    // renderer's half is that nothing carried over from B reaches the second A.
    const specs = shippedSpecs();
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const first = okOf(render(api, spec, profile, spec.example_data, WIDE), "A");
    for (const other of specs) {
      render(api, other, shippedDefaultProfile(other), other.example_data, WIDE);
    }
    // And a refusal in between, because a failed render is the state a renderer is most likely to
    // leave behind — K-2's "every refusal is taken BEFORE any byte is produced" from this layer.
    render(api, spec, profile, spec.example_data, capsAt(spec.min_columns - 1, "BELOW"));
    const third = okOf(render(api, spec, profile, spec.example_data, WIDE), "A again");
    expect(hex(third.bytes)).toBe(hex(first.bytes));
  });

  it("03-F30: render MUTATES NOTHING it was handed, and renders from frozen inputs", () => {
    // Purity's other half. A renderer that normalised the profile in place would produce a
    // different document the second time it was called with the same object — which is the FR's
    // failure with one device instead of two.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const specBefore = structuredClone(spec);
    const profileBefore = structuredClone(profile);
    const caps = capsAt(48, "FROZEN-48");
    const capsBefore = structuredClone(caps);

    okOf(render(api, spec, profile, spec.example_data, caps), "mutation probe");
    expect(spec, "render mutated the DocumentSpec").toEqual(specBefore);
    expect(profile, "render mutated the DocumentProfile").toEqual(profileBefore);
    expect(caps, "render mutated the capability record").toEqual(capsBefore);

    // The frozen inputs are a CLONE, and that is not tidiness. `kotSpec()` hands back the shipped
    // table's own object, so freezing it froze `DOCUMENT_SPECS.kot` itself for the rest of the
    // process — every test declared after this one (the composition law, all of `03-F32`, all of
    // `03-F34`, all of `03-F36`) then ran against a spec no other test froze, and any of them that
    // needed a mutable spec would have failed here and been debugged over there. A test may not
    // change the fixture the file shares.
    const frozenSpec = Object.freeze(structuredClone(spec) as DocumentSpec);
    const frozen = okOf(
      render(api, frozenSpec, Object.freeze({ ...profile }), frozenSpec.example_data, caps),
      "frozen inputs",
    );
    expect(frozen.bytes.length).toBeGreaterThan(0);
    expect(Object.isFrozen(kotSpec()), "the shared shipped spec was frozen by this test").toBe(
      false,
    );
  });

  it("03-F30/03-F42: the bytes ARE the blocks — one document, one encode, nothing reported that was not printed", () => {
    // `03-F30` writes the pipeline as "→ blocks → bytes" and `18 §10` names it once ("document
    // model → encoder → Transport"). So the intermediate a reviewer reads must be the document a
    // printer receives; a renderer that reported one block list and emitted another would pass
    // every other assertion in this file.
    //
    // The comparison is against ONE `encode` call over the flattened parts, which is `03-F42`
    // ("a document is rendered whole, buffered, and transmitted as one unit") — per-block encoding
    // would repeat `ESC @` inside a document and is excluded by the same clause.
    const spec = kotSpec();
    const rendered = okOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, WIDE),
      "composition",
    );
    const reEncoded = encode(k2, flatPartsOf(rendered.blocks), WIDE);
    expect(reEncoded.ok, "the blocks render() reported do not even encode").toBe(true);
    const bytes = (reEncoded as Extract<typeof reEncoded, { ok: true }>).bytes;
    expect(hex(rendered.bytes)).toBe(hex(bytes));
  });
});

describe("03-F32 — a `kot` renders NO MONEY TOKEN under any profile", () => {
  it(
    "03-F32/00 §6: the chit's data contract cannot HOLD money — the type refuses branded paisa",
    () => {
      // "The deepest POS in the market has NO PRICE OPTION ANYWHERE in its kitchen-printer
      // configuration: prices are simply NOT IN THE CHIT DATA MODEL." This is that sentence as a
      // compiler assertion, and it is the primary guard for the clause: the runtime sweep below
      // can only observe the documents it renders, while this one holds for every document the
      // type admits.
      //
      // The fixture carries its own POSITIVE CONTROLS — the same detector applied to types that
      // DO carry `Paisa` must resolve to `true`. Without them a detector that never fires would
      // prove the clause by being blind, which is oracle round 2 §C pattern 2 exactly. That is not
      // hypothetical here: the FIRST version of this detector recursed on `T extends object`
      // before checking for a primitive, and `Paisa` is `number & { [brand]: "Paisa" }` — an
      // INTERSECTION that satisfies `extends object` — so it walked into `number`'s methods and
      // reported "no money" for every input. The control is what caught it, on the red run.
      //
      // The second control goes through an ARRAY on purpose: a chit's lines are a list, so a
      // detector that stopped at the array would be blind exactly where the money would be.
      assertAccepted(
        "kot-data-carries-no-paisa",
        `import { DOCUMENT_SPECS } from "@restos/escpos";
         import type { KotData } from "@restos/escpos";
         import type { Paisa } from "@restos/domain";

         type Values<T> = T extends string | number | boolean | bigint | symbol | null | undefined
           ? T
           : T extends readonly (infer E)[]
             ? Values<E>
             : T extends object
               ? { [K in keyof T]-?: Values<T[K]> }[keyof T]
               : T;

         // CONTROL: the detector must fire on a contract that does carry money.
         type Control = [Extract<Values<{ line: { total: Paisa } }>, Paisa>] extends [never]
           ? never
           : true;
         export const control: Control = true;

         // CONTROL: and through a list, which is the shape a chit's lines actually have.
         type ControlArray = [
           Extract<Values<{ lines: readonly { total: Paisa }[] }>, Paisa>,
         ] extends [never]
           ? never
           : true;
         export const controlArray: ControlArray = true;

         // 03-F32: and it must NOT fire on the chit's contract.
         type NoMoney = [Extract<Values<KotData>, Paisa>] extends [never] ? true : never;
         export const noMoney: NoMoney = true;

         // 03-F31: "each declares its own data contract" — and the shipped kot spec's own example
         // must SATISFY it, or KotData is a type nothing is checked against.
         const kot = DOCUMENT_SPECS.kot;
         export const wired: KotData | undefined = kot === undefined ? undefined : kot.example_data;`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it(
    "03-F32: the `kot` profile schema has NO SLOT ID ADDRESSING MONEY — the type refuses one",
    () => {
      // "This is enforced STRUCTURALLY — the profile schema has no slot id addressing them — not
      // by a runtime check on a value the owner supplied." A profile typed by the spec's own
      // declared slot ids is that enforcement; `totals.grand_total` is a slot id no chit declares
      // and the compiler is what says so.
      assertRejectedByTheType(
        "kot-profile-money-slot",
        `import { DOCUMENT_SPECS } from "@restos/escpos";
         import type { ProfileFor } from "@restos/escpos";
         type KotProfile = ProfileFor<NonNullable<(typeof DOCUMENT_SPECS)["kot"]>>;
         export const bad: KotProfile = { "totals.grand_total": "3141.59" };`,
      );
    },
    TYPECHECK_TIMEOUT_MS,
  );

  it("03-F32: no slot id the `kot` declares addresses money", () => {
    // The runtime companion to the fixture above, over the ids that actually shipped. Weaker than
    // the type check by construction (it reads NAMES) and it is here because it fails with a
    // useful message rather than a compiler diagnostic when a price slot is added.
    const declared = slotDeclarationsOf(kotSpec()).map((slot) => slot.slot_id);
    for (const slot_id of declared) {
      expect(
        MONEY_ADDRESSING_SLOT_IDS,
        `the kot declares a money-addressing slot: ${slot_id}`,
      ).not.toContain(slot_id);
    }
  });

  it("03-F32: a money-addressing slot id set to a money value is INERT — byte-identical to the shipped default, over the whole sweep", () => {
    // "Under ANY profile" is a quantifier, and a flat slot map makes it one this suite can
    // discharge instead of sample: every money-addressing id an owner would reach for, crossed
    // with every money-shaped value, plus all of them at once.
    //
    // The assertion is BYTE-IDENTITY to the shipped default, not merely "no money token appeared".
    // Identity is the stronger statement and it cannot be gamed: it says the undeclared key
    // changed nothing at all, which is `03-F30`'s "it can only fill holes the spec declared".
    const spec = kotSpec();
    const base = shippedDefaultProfile(spec);
    const baseline = okOf(render(api, spec, base, spec.example_data, WIDE), "shipped default");
    const baselineHex = hex(baseline.bytes);

    expect(moneyTokenIn(textOf(baseline.blocks)), "the kot's own default prints money").toBe(null);

    let swept = 0;
    for (const slot_id of MONEY_ADDRESSING_SLOT_IDS) {
      for (const value of SWEEP_VALUES) {
        const profile = { ...base, [slot_id]: value } as DocumentProfile;
        const out = okOf(
          render(api, spec, profile, spec.example_data, WIDE),
          `kot with ${slot_id}=${String(value)}`,
        );
        expect(hex(out.bytes), `${slot_id}=${String(value)} changed the chit`).toBe(baselineHex);
        expect(
          moneyTokenIn(textOf(out.blocks)),
          `${slot_id}=${String(value)} put money on a chit`,
        ).toBe(null);
        swept++;
      }
    }

    // And all of them at once, because a renderer could ignore each key alone and honour a
    // combination (a `show_prices` toggle that only reads `price` when both are present).
    const everything = Object.fromEntries([
      ...Object.entries(base),
      ...MONEY_ADDRESSING_SLOT_IDS.map((slot_id) => [slot_id, "Rs 3,141.59"] as const),
    ]) as DocumentProfile;
    const all = okOf(render(api, spec, everything, spec.example_data, WIDE), "every money slot");
    expect(hex(all.bytes), "the money slots interact").toBe(baselineHex);
    expect(moneyTokenIn(textOf(all.blocks))).toBe(null);

    expect(swept, "the money sweep enumerated nothing — the quantifier was not discharged").toBe(
      MONEY_ADDRESSING_SLOT_IDS.length * SWEEP_VALUES.length,
    );
  });

  it("03-F32/03-F30: the inertness above is not vacuous — EVERY declared slot reaches the output", () => {
    // THE LOAD-BEARING CONTROL. Every "under any profile" assertion in this file is satisfied by a
    // renderer that ignores the profile entirely, which would be the purest instance of oracle
    // round 2 §C pattern 2 — a guard that passes by not looking.
    //
    // It is UNIVERSAL and not existential, which is a correction to this test's first form: "at
    // least one declared slot changes the bytes" is discharged by ONE live slot across the whole
    // shipped table, so a spec with `kitchen_name` wired and every other knob dead was green. A
    // slot is `03-F30`'s "hole the spec declared", and a declared hole that nothing fills is a lie
    // told to the back office — doc 14 will render an editor row for it (`14-F29` prefills), an
    // owner will set it, and nothing will happen.
    //
    // The escape hatch is explicit, empty, and NAMED so that widening it is a decision somebody
    // makes on the record rather than a `continue` nobody reads.
    const specs = shippedSpecs();
    const dead: string[] = [];
    let probed = 0;
    for (const spec of specs) {
      const base = shippedDefaultProfile(spec);
      const baseline = okOf(
        render(api, spec, base, spec.example_data, WIDE),
        `${spec.type} default`,
      );
      for (const slot of slotDeclarationsOf(spec)) {
        const probes = profileProbes(slot.default);
        expect(
          probes.length,
          `${spec.type}/${slot.slot_id}: no distinct value of its own type exists to probe with`,
        ).toBeGreaterThan(0);
        const reached = probes.some((value) => {
          const profile = { ...base, [slot.slot_id]: value } as DocumentProfile;
          const out = okOf(
            render(api, spec, profile, spec.example_data, WIDE),
            `${spec.type}/${slot.slot_id}=${String(value)}`,
          );
          return hex(out.bytes) !== hex(baseline.bytes);
        });
        probed++;
        if (!reached) dead.push(`${spec.type}/${slot.slot_id}`);
      }
    }
    expect(probed, "no declared slot was probed").toBeGreaterThan(0);
    expect(
      dead.filter((id) => !SLOTS_WITH_NO_OBSERVABLE_EFFECT.includes(id)),
      "these declared slots change NOTHING under any probe of their own type, so `03-F30`'s " +
        '"holes the spec declared" include holes that are not holes — and every "under any ' +
        'profile" assertion in this file is vacuous for them. If a slot legitimately cannot show ' +
        "up in a rendered document, that is a FINDING for the test-owning session naming the FR " +
        "that says so, and it goes in SLOTS_WITH_NO_OBSERVABLE_EFFECT — it is not a test edit",
    ).toEqual([]);
    // And the hatch may not go stale in the other direction: an entry for a slot that no longer
    // exists, or one that now works, would quietly re-open the hole it was opened for.
    for (const exempt of SLOTS_WITH_NO_OBSERVABLE_EFFECT) {
      expect(dead, `${exempt} is exempted but is not dead — the exemption is stale`).toContain(
        exempt,
      );
    }
  });

  it("03-F30/03-F31: the DATA axis reaches the document — every leaf of the shipped example is on paper", () => {
    // `render(Spec@v, Profile, DATA, PrinterCaps, FiscalBlock?)`. `data` is the third argument and
    // until this test existed no assertion in this file ever varied it: every render passed
    // `spec.example_data` or a clone, so a renderer that ignored the argument outright — printing
    // the same chit for every order in the restaurant, which is the worst defect this package can
    // ship — satisfied the whole suite including its purity laws. This is the data twin of the slot
    // control above and it is universal for the same reason.
    //
    // Generic on purpose: `03-F31` says each document type declares its OWN data contract, so the
    // walk below knows only "string and number leaves" and never a field name. `03-F36`'s
    // build-time gate is what makes `example_data` a fair witness — a spec's own example is the
    // data the vendor says renders correctly.
    const specs = shippedSpecs();
    const dead: string[] = [];
    let probed = 0;
    let unmutatable = 0;
    for (const spec of specs) {
      const profile = shippedDefaultProfile(spec);
      const baseline = okOf(
        render(api, spec, profile, spec.example_data, WIDE),
        `${spec.type} example data`,
      );
      const leaves = dataLeavesOf(spec.example_data);
      expect(
        leaves.length,
        `${spec.type}: example_data carries no string or number leaf at all, so 03-F36's ` +
          "build-time gate is rendering an empty document and every assertion driven by it is vacuous",
      ).toBeGreaterThan(0);
      for (const leaf of leaves) {
        const probes = dataProbes(leaf.value);
        if (probes.length === 0) {
          unmutatable++;
          continue;
        }
        const reached = probes.some((value) => {
          const out = okOf(
            render(api, spec, profile, withLeafReplaced(spec.example_data, leaf, value), WIDE),
            `${spec.type}${leafLabel(leaf)}=${String(value)}`,
          );
          return hex(out.bytes) !== hex(baseline.bytes);
        });
        probed++;
        if (!reached) dead.push(`${spec.type}${leafLabel(leaf)}`);
      }
    }
    expect(probed, "no data leaf was probed — the data axis is still unvaried").toBeGreaterThan(0);
    expect(
      dead.filter((path) => !DATA_LEAVES_NOT_ON_PAPER.includes(path)),
      "these leaves of the shipped example_data change NOTHING in the rendered document. Either " +
        "the renderer is not reading them, or the contract carries a field the ticket does not " +
        "print — and the second is a FINDING for the test-owning session naming the FR that says " +
        "the field need not print, recorded in DATA_LEAVES_NOT_ON_PAPER. It is not a test edit",
    ).toEqual([]);
    for (const exempt of DATA_LEAVES_NOT_ON_PAPER) {
      expect(dead, `${exempt} is exempted but is not dead — the exemption is stale`).toContain(
        exempt,
      );
    }
    // A contract of nothing but empty strings would reach the assertion above having probed almost
    // nothing, so what could not be probed is counted rather than hidden.
    expect(
      unmutatable,
      "more of example_data is unmutatable than mutatable — the witness is mostly empty",
    ).toBeLessThan(probed);
  });

  it("03-F32: the money net runs over MUTATED data too, not only the one fixture the vendor shipped", () => {
    // The runtime half of "a `kot` renders no money token under any profile" reads the TEXT a
    // document emits, and until this test it only ever read the text produced by ONE data value.
    // A chit that prints money for some orders and not for the vendor's own example is exactly the
    // defect the clause is about, and it was invisible here.
    //
    // See the header for what this net does and does not catch: it is narrowed by, and not a
    // substitute for, the compile-time guard that `KotData` cannot hold a branded `Paisa`.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const leaves = dataLeavesOf(spec.example_data);
    let checked = 0;
    for (const leaf of leaves) {
      for (const value of dataProbes(leaf.value)) {
        const label = `${leafLabel(leaf)}=${String(value)}`;
        const out = okOf(
          render(api, spec, profile, withLeafReplaced(spec.example_data, leaf, value), WIDE),
          label,
        );
        expect(moneyTokenIn(textOf(out.blocks)), `${label} put money on a chit`).toBe(null);
        checked++;
      }
    }
    expect(checked, "no mutated chit was read for money").toBeGreaterThan(0);
  });
});

describe("03-F32/03-F33 — a fiscal block cannot be suppressed, and the adapter declares its position", () => {
  it("03-F33: the adapter's block is injected at the position the ADAPTER declared, not at a fixed one", () => {
    // "Injected at render by the certified authority adapter (16-F23), which declares the block
    // AND ITS POSITION, because some authorities mandate field sets only and others mandate
    // order." Three declared positions must produce three different placements; a renderer that
    // always appended would pass a single-position test.
    const spec = kotSpec();
    expect(
      spec.blocks.length,
      "the spec has fewer than two blocks, so a position cannot be told from a default",
    ).toBeGreaterThanOrEqual(2);
    const first = spec.blocks[0]?.block_id ?? "";
    const last = spec.blocks[spec.blocks.length - 1]?.block_id ?? "";
    const profile = shippedDefaultProfile(spec);

    const at = (after_block_id: string | null): number => {
      const fiscal = fiscalAt(spec, { after_block_id });
      const out = okOf(
        render(api, spec, profile, spec.example_data, WIDE, fiscal),
        `fiscal after ${String(after_block_id)}`,
      );
      return out.blocks.findIndex((block) => block.block_id === fiscal.block_id);
    };

    expect(at(null), "declared first, injected elsewhere").toBe(0);
    expect(at(first), "declared after the first block, injected elsewhere").toBe(1);
    expect(at(last), "declared after the last block, injected elsewhere").toBe(spec.blocks.length);
  });

  it("03-F33: the injected block carries the FISCAL_LOCKED region — the rung no spec may declare", () => {
    const spec = kotSpec();
    const fiscal = fiscalAt(spec);
    const out = okOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, WIDE, fiscal),
      "fiscal region",
    );
    const injected = out.blocks.find((block) => block.block_id === fiscal.block_id);
    expect(injected, "the adapter's block was not injected at all").toBeDefined();
    expect(injected?.region).toBe("FISCAL_LOCKED");
  });

  it("03-F35: the injected block rasterises the QR and never emits the native command", () => {
    // `03-F35`: "The fiscal QR is ALWAYS rasterised, never the native ESC/POS QR command." K-2
    // holds the byte-level half of this. K-4's half is that the block it composes reaches the
    // encoder as a `fiscal_qr` part — the part that HAS no native branch — rather than as text or
    // as a hand-built image, and it holds on a printer that reports native QR support.
    const spec = kotSpec();
    const fiscal = fiscalAt(spec);
    const nativeQr = capsAt(64, "HAS-NATIVE-QR", { has_native_qr: true });
    const out = okOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, nativeQr, fiscal),
      "fiscal qr part",
    );
    const injected = out.blocks.find((block) => block.block_id === fiscal.block_id);
    expect(injected?.parts.some((part) => part.kind === "fiscal_qr")).toBe(true);
    // The payload is an OPAQUE token (`03-F35`): it is carried, never parsed or reshaped.
    expect(
      injected?.parts.some(
        (part) => part.kind === "fiscal_qr" && part.payload === fiscal.qr_payload,
      ),
      "the adapter's payload was rewritten on the way through",
    ).toBe(true);
  });

  it("03-F32: no profile in the whole sweep can suppress the fiscal block", () => {
    // "A fiscal block cannot be suppressed under any profile." The sweep sets every declared slot
    // to every suppressing-looking value there is — `false`, `""`, `0` — and then all of them at
    // once, plus the money-addressing ids for good measure.
    const spec = kotSpec();
    const fiscal = fiscalAt(spec);
    const base = shippedDefaultProfile(spec);
    const slotIds = [
      ...slotDeclarationsOf(spec).map((slot) => slot.slot_id),
      ...MONEY_ADDRESSING_SLOT_IDS,
    ];
    const suppressing: readonly SlotValue[] = [false, "", 0, "off", "none"];

    let swept = 0;
    const assertPresent = (profile: DocumentProfile, label: string): void => {
      const out = okOf(render(api, spec, profile, spec.example_data, WIDE, fiscal), label);
      const injected = out.blocks.find((block) => block.block_id === fiscal.block_id);
      expect(injected, `${label} suppressed the fiscal block`).toBeDefined();
      expect(
        injected?.parts.some((part) => part.kind === "fiscal_qr"),
        label,
      ).toBe(true);
      swept++;
    };

    assertPresent(base, "shipped default");
    for (const slot_id of slotIds) {
      for (const value of suppressing) {
        assertPresent({ ...base, [slot_id]: value } as DocumentProfile, `${slot_id}=${value}`);
      }
    }
    assertPresent(
      Object.fromEntries(slotIds.map((slot_id) => [slot_id, false])) as DocumentProfile,
      "everything off at once",
    );

    expect(swept, "the suppression sweep enumerated nothing").toBe(
      slotIds.length * suppressing.length + 2,
    );
  });
});

describe("03-F34 — enforce at render: three assertions before bytes reach the spooler", () => {
  it("03-F34: a missing adapter-declared mandatory block is a refusal that NAMES the cause", () => {
    // "Assert every adapter-declared mandatory block is present." Asserting what the error NAMES,
    // not that something threw — and it must not throw at all, for K-1's reason: this same check
    // has a non-printing caller.
    const spec = kotSpec();
    const fiscal = fiscalAt(spec, { mandatory_block_ids: ["FBR_TAXPAYER_HEADER"] });
    let result: RenderResult | undefined;
    expect(() => {
      result = render(api, spec, shippedDefaultProfile(spec), spec.example_data, WIDE, fiscal);
    }).not.toThrow();
    const refusal = refusalOf(result as RenderResult, "missing mandatory block");
    expect(refusal.reason).toBe("mandatory_block_missing");
    expect(refusal.severity).toBe("S1");
    expect(refusal.document_type).toBe(spec.type);
    expect(refusal.model_id).toBe(WIDE.model_id);
  });

  it("03-F34: a mandatory block the document DOES contain is satisfied — including the adapter's own", () => {
    // The control for the case above, and it carries a real clause: the adapter's own injected
    // block is part of the document it is asserted against, so an adapter that mandates the block
    // it supplies must render rather than deadlock.
    const spec = kotSpec();
    const firstBlockId = spec.blocks[0]?.block_id ?? "";
    const viaSpec = fiscalAt(spec, { mandatory_block_ids: [firstBlockId] });
    okOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, WIDE, viaSpec),
      "spec block mandated",
    );
    const viaSelf = fiscalAt(spec, { mandatory_block_ids: ["FBR_INVOICE"] });
    okOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, WIDE, viaSelf),
      "adapter's own block mandated",
    );
  });

  it("03-F34/03-F35: a QR below the adapter's declared minimum for the target dpi is a refusal", () => {
    // "Assert … that the QR's computed physical size meets the adapter's declared minimum FOR THE
    // TARGET DPI." `03-F35` renders 18–25 mm, so an adapter demanding 100 mm cannot be satisfied
    // at any dpi this corpus supports and must refuse rather than print a symbol that fails the
    // regulator's floor — the failure `03-F35` calls "the worst available failure mode".
    const spec = kotSpec();
    const fiscal = fiscalAt(spec, { min_qr_mm: 100 });
    const refusal = refusalOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, WIDE, fiscal),
      "100 mm minimum",
    );
    expect(refusal.reason).toBe("fiscal_qr_too_small");
    expect(refusal.severity).toBe("S1");
  });

  it("03-F34/03-F35: the accepted symbol MEASURES at or above the declared minimum, at every dpi", () => {
    // `03-F35`: "treat 7×7 mm as a legal floor and render 18–25 mm". A refusal test with no
    // satisfiable case would be a check that always fires, which proves nothing about the
    // computation behind it. Driven across dpi because the FR ties the minimum to dpi explicitly.
    //
    // AND THE ACCEPTANCE IS MEASURED, which is the half this test was missing: `03-F34` requires
    // "the QR's computed physical size" to meet the minimum, and until the number is read back out
    // of the bytes, nothing connects the size `render()` compared to the symbol `render()` emitted.
    // A renderer that computed at a fixed 203 dpi, or that compared the band's midpoint to the
    // declared minimum and then emitted whatever the encoder gave it, satisfied every other
    // assertion in this file.
    // The assertion is an EQUIVALENCE and not an implication: the decision `render()` takes must
    // agree with the symbol it emits at every threshold, so a check computed off a constant is
    // caught where it disagrees rather than only where it under-prints. `03-F35` puts the emitted
    // symbol in an 18–25 mm band, so thresholds either side of the band's own width are what
    // separate a real per-dpi computation from a plausible constant.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    let checked = 0;
    let accepted = 0;
    let refused = 0;
    for (const dpi of [180, 203, 300, 400]) {
      const caps = capsAt(64, `DPI-${dpi}`, { dpi });
      // The symbol this printer actually gets, measured at a minimum nothing can fail (`03-F35`'s
      // legal floor). Every decision below is then compared against THIS number.
      const floorFiscal = fiscalAt(spec, { min_qr_mm: 7 });
      const atFloor = okOf(
        render(api, spec, profile, spec.example_data, caps, floorFiscal),
        `7 mm floor at ${dpi} dpi`,
      );
      const emitted = mmOf(
        fiscalQrRasterOf(atFloor, floorFiscal, caps, `7 mm floor at ${dpi} dpi`).height_dots,
        dpi,
      );
      expect(
        emitted,
        `${dpi} dpi: the emitted symbol is below 03-F35's legal floor`,
      ).toBeGreaterThanOrEqual(7);

      for (const min_qr_mm of [7, 18, 21, 22, 25, 100]) {
        const fiscal = fiscalAt(spec, { min_qr_mm });
        const label = `${min_qr_mm} mm minimum at ${dpi} dpi (emitted ${emitted.toFixed(2)} mm)`;
        const result = render(api, spec, profile, spec.example_data, caps, fiscal);
        expect(
          result.ok,
          `${label}: the decision disagrees with the symbol the document carries`,
        ).toBe(emitted >= min_qr_mm);
        if (result.ok) {
          const symbol = fiscalQrRasterOf(result, fiscal, caps, label);
          expect(
            mmOf(symbol.height_dots, dpi),
            `${label}: accepted, then printed a different symbol than the one measured`,
          ).toBe(emitted);
          accepted++;
        } else {
          expect(result.reason, label).toBe("fiscal_qr_too_small");
          refused++;
        }
        checked++;
      }
    }
    expect(checked, "no threshold was checked").toBe(24);
    // Both branches have to occur or the equivalence is one-sided and proves half of itself.
    expect(accepted, "no minimum was ever met").toBeGreaterThan(0);
    expect(refused, "no minimum was ever missed").toBeGreaterThan(0);
  });

  it("03-F34/03-F35: the same symbol is measured against the DPI IT WAS RENDERED AT — the size is not a constant", () => {
    // The dpi-sensitivity control for the measurement above. `03-F35` says the size is "computed
    // from `dpi`", so one dot count cannot be right at two of them: 150 dots is 21.2 mm at 180 dpi
    // and 9.5 mm at 400, which is under `03-F35`'s legal floor and would print an offence. K-2 pins
    // this at its own layer; what K-4 owns is that `render()` passes the target dpi DOWN, and a
    // renderer that hard-coded one would emit the same dot count at every dpi.
    const spec = kotSpec();
    const dots = [180, 400].map((dpi) => {
      const caps = capsAt(64, `SCALE-${dpi}`, { dpi });
      const fiscal = fiscalAt(spec);
      const out = okOf(
        render(api, spec, shippedDefaultProfile(spec), spec.example_data, caps, fiscal),
        `symbol at ${dpi} dpi`,
      );
      return fiscalQrRasterOf(out, fiscal, caps, `symbol at ${dpi} dpi`).height_dots;
    });
    expect(
      dots[1] ?? 0,
      "400 dpi emits no more dots than 180 dpi — the renderer is not passing dpi down",
    ).toBeGreaterThan(dots[0] ?? 0);
  });

  it("03-F34: an owner slot inside a LOCKED region is a refusal, in each locked region", () => {
    // "…and that NO OWNER SLOT RENDERED INSIDE A LOCKED REGION." The shipped specs are expected to
    // be correct, so this drives the violation by MOVING a slot-bearing block into a locked region
    // — the fixture is a transformation of a shipped spec, not a spec this oracle invented.
    //
    // `FISCAL_LOCKED` is absent from the loop because `SpecRegion` cannot express it (`03-F33`),
    // which is asserted by the compile fixture above. `BODY` and `TOTALS` are absent because the
    // FRs classify them neither way — see header ambiguity 1.
    const slot = firstDeclaredSlot();
    const spec = slot.spec;
    const moved = (region: SpecRegion): DocumentSpec => ({
      ...spec,
      blocks: spec.blocks.map((block) => (block.slots.length > 0 ? { ...block, region } : block)),
    });

    // Filtered rather than skipped inside the loop, and then PINNED: a `continue` that quietly
    // emptied this list would leave the loop below running zero assertions, which is oracle round
    // 2 §C pattern 2 in its exact published form.
    const declarableLocked = LOCKED_REGIONS.filter(
      (region): region is Extract<SpecRegion, "HEAD_LOCKED" | "TAIL_LOCKED"> =>
        region !== "FISCAL_LOCKED",
    );
    expect(declarableLocked, "the locked-region loop has nothing to run over").toEqual([
      "HEAD_LOCKED",
      "TAIL_LOCKED",
    ]);

    for (const region of declarableLocked) {
      const refusal = refusalOf(
        render(api, moved(region), shippedDefaultProfile(spec), spec.example_data, WIDE),
        `owner slot in ${region}`,
      );
      expect(refusal.reason, `owner slot in ${region}`).toBe("owner_slot_in_locked_region");
      expect(refusal.severity, `owner slot in ${region}`).toBe("S1");
    }

    // The control: the same blocks in the regions that exist FOR owner content still render. A
    // refusal that fired everywhere would pass the loop above and ship a renderer that prints
    // nothing.
    for (const region of OWNER_REGIONS) {
      okOf(
        render(api, moved(region), shippedDefaultProfile(spec), spec.example_data, WIDE),
        `owner slot in ${region}`,
      );
    }
  });

  it("03-F49/03-F34: below the declared minimum the reason is K-1's `min_columns_not_met`, reached through the same path", () => {
    const spec = kotSpec();
    const refusal = refusalOf(
      render(
        api,
        spec,
        shippedDefaultProfile(spec),
        spec.example_data,
        capsAt(spec.min_columns - 1, "NARROW"),
      ),
      "below the floor",
    );
    expect(refusal.reason).toBe("min_columns_not_met");
    expect(refusal.severity).toBe("S1");
  });

  it("03-F34: the four render-time causes have four DISTINCT reason codes", () => {
    // K-1's DEFERRED note assigned this here: "K-4 must assert that their `reason` codes are
    // DISTINCT from `min_columns_not_met` — a shared code would make the S1 band unable to say
    // what is actually wrong." Collected from live refusals rather than from the type, so a
    // renderer that declares four codes and returns one of them for everything is caught.
    const observed = observedRefusals().map(({ refusal }) => refusal.reason);
    expect(observed.length, "a cause stopped refusing").toBe(4);
    expect(new Set(observed).size, `two causes share a reason code: ${observed.join(", ")}`).toBe(
      4,
    );
  });

  it("03-F34: a refusal carries NO blocks and NO bytes — there is nothing to degrade to", () => {
    // K-1 deferred exactly this: "K-4 owns the assertion that `render()` returns no blocks on
    // refusal." Asserted as an ALLOWLIST for K-1's reason — an absence cannot be stated completely
    // by guessing names — and with a positive control below, because an absence check that cannot
    // fail is worth nothing.
    //
    // Every refusal this suite can reach is checked, not one: the allowlist is per-cause (`03-F49`
    // permits the two numbers doc 14 needs), and a guard that only ever ran against the column
    // refusal would say nothing about the other three.
    const causes = observedRefusals();
    expect(causes.length, "no refusal was observed").toBeGreaterThan(0);
    for (const { label, refusal } of causes) {
      const permitted = RENDER_REFUSAL_KEYS_BY_REASON[refusal.reason] as readonly string[];
      expect(
        undeclaredKeys(refusal),
        `${label}: the refusal carries keys its cause may not`,
      ).toEqual([]);
      expect(
        Object.keys(refusal).sort(),
        `${label}: a refusal is missing the S1 band's floor`,
      ).toEqual(expect.arrayContaining([...RENDER_REFUSAL_KEY_FLOOR]));
      expect(permitted, `${label}: the allowlist for this cause is empty`).not.toEqual([]);
      expect(
        Object.keys(refusal),
        `${label}: the refusal hands back a document to print`,
      ).not.toContain("blocks");
      expect(Object.keys(refusal), `${label}: the refusal hands back bytes to print`).not.toContain(
        "bytes",
      );
    }
  });

  it("03-F34: the no-payload guard itself FIRES — a refusal carrying blocks or bytes is rejected", () => {
    // The positive control, and it drives THE SAME FUNCTION the guard above runs (`undeclaredKeys`)
    // rather than a copy of it declared in this block. That was this test's defect: with the filter
    // defined and used only here, all it asserted was that a local predicate returns the keys the
    // test had just added to a local object — true of any predicate, and true with the real guard
    // deleted. A control has to fail when the guarded thing breaks, so it has to BE the guarded
    // thing.
    const spec = kotSpec();
    const refusal = refusalOf(
      render(
        api,
        spec,
        shippedDefaultProfile(spec),
        spec.example_data,
        capsAt(spec.min_columns - 1, "NARROW"),
      ),
      "guard control",
    );
    expect(undeclaredKeys(refusal), "the real refusal must be clean").toEqual([]);
    expect(undeclaredKeys({ ...refusal, blocks: [] })).toEqual(["blocks"]);
    expect(undeclaredKeys({ ...refusal, bytes: new Uint8Array([0x1b, 0x40]) })).toEqual(["bytes"]);
    // And the per-cause half: the two `03-F49` numbers are permitted on the column refusal and on
    // NOTHING ELSE, so the same object under another cause is dirty.
    expect(refusal.reason, "the column gate stopped raising its own cause").toBe(
      "min_columns_not_met",
    );
    expect(undeclaredKeys({ ...refusal, required_columns: 42, available_columns: 32 })).toEqual([]);
    expect(
      undeclaredKeys({
        ...refusal,
        reason: "fiscal_qr_too_small",
        required_columns: 42,
        available_columns: 32,
      }),
    ).toEqual(["required_columns", "available_columns"]);
  });

  it("03-F34: every refusal in this suite is classified S1 and names the printer it fired on", () => {
    // `03-F34` requires "a hard refusal to print PLUS an S1 band (27-F11d)". The band itself is a
    // `packages/ui` surface — K-1 and K-2 both said so and this suite repeats it — so what is
    // asserted here is that the refusal carries what a band needs to name the printer the operator
    // is standing at (`03-F5`'s precedent) and the document that failed.
    const spec = kotSpec();
    const caps = capsAt(spec.min_columns - 1, "S1-BAND-PROBE");
    const refusal = refusalOf(
      render(api, spec, shippedDefaultProfile(spec), spec.example_data, caps),
      "S1 band fields",
    );
    expect(refusal.severity).toBe("S1");
    expect(refusal.model_id).toBe("S1-BAND-PROBE");
    expect(refusal.document_type).toBe(spec.type);
  });
});

describe("03-F34 — validate at save is FEEDBACK, and the shipped default always passes", () => {
  it("03-F34: THE NAMED TEST — the shipped default always validates and always saves", () => {
    // The FR names this test in words: "a shipped competitor's linter left merchants unable to
    // save THE VENDOR'S OWN DEFAULT TEMPLATE, so 'the shipped default always validates and always
    // saves' is a named test." Run over every shipped spec, because the regression is per-template
    // and a table with one good default proves nothing about the next one.
    const specs = shippedSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      const result = validateProfile(api, spec, shippedDefaultProfile(spec));
      expect(
        result.findings,
        `${spec.type}: the vendor's own default does not validate — ${JSON.stringify(result.findings)}`,
      ).toEqual([]);
      // "…and always SAVES": in this package the observable consequence of a saved profile is that
      // it renders. A default that validates and cannot render is the same merchant, stuck.
      okOf(
        render(api, spec, shippedDefaultProfile(spec), spec.example_data, capsAt(64, "DEFAULT")),
        `${spec.type} shipped default renders`,
      );
    }
  });

  it("03-F34: validation returns FINDINGS, never a verdict, and never throws — over garbage input", () => {
    // "Save-time linting must NEVER BE ABLE TO BLOCK SAVING." A validator that throws, or that
    // returns a boolean, is a validator a save path can branch on. Driven over profiles no owner
    // would author precisely because the competitor failure fired on input the vendor considered
    // impossible.
    //
    // NOTE, honestly: no FR states a lint RULE, so this asserts SHAPE and TOTALITY only. A
    // validator that returns `{ findings: [] }` for everything passes — see the header.
    const spec = kotSpec();
    const base = shippedDefaultProfile(spec);
    const garbage: DocumentProfile[] = [
      {},
      base,
      { ...base, "totally.unknown.slot": "x" },
      { ...base, "totals.grand_total": 314159 },
      ...SWEEP_VALUES.map((value) => ({ ...base, "line.price": value }) as DocumentProfile),
    ];
    let checked = 0;
    for (const profile of garbage) {
      const label = JSON.stringify(profile).slice(0, 60);
      let result: ReturnType<typeof validateProfile> | undefined;
      expect(() => {
        result = validateProfile(api, spec, profile);
      }, `${label} made the validator throw`).not.toThrow();
      expect(Array.isArray(result?.findings), label).toBe(true);
      expect(Object.keys(result as object), `${label}: the validator returned a verdict`).toEqual([
        "findings",
      ]);
      for (const finding of result?.findings ?? []) {
        expect(typeof finding.slot_id, label).toBe("string");
        expect(typeof finding.code, label).toBe("string");
      }
      checked++;
    }
    expect(checked).toBe(garbage.length);
  });

  it("03-F34/03-F32: no LATIN profile value can cause a refusal — configuration cannot break a document", () => {
    // The render-side statement of "validate at save only for feedback": `03-F34`'s four
    // render-time causes are all STRUCTURAL (a missing mandatory block, an undersized QR, a slot
    // in a locked region, insufficient columns) and none of them is a value an owner typed. A
    // renderer that refused on a profile value would put a merchant one bad keystroke away from a
    // till that cannot print — `01-F17`'s "a sale is never blocked", read onto paper.
    //
    // "LATIN" IS IN THE TITLE BECAUSE THE UNQUALIFIED CLAIM IS FALSE, and the earlier version of
    // this test asserted the unqualified claim over a value set containing `₨` (U+20A8). K-2's
    // landed encoder cannot render that codepoint through any printer font, so on a DECLARED slot
    // — one whose value actually reaches a byte — the sweep demanded an `ok` no implementation
    // could ever return. An oracle assertion that cannot be satisfied does not hold the
    // implementer to the FR, it blocks them; the script case is real and it is asserted as a
    // REFUSAL in the test below, which is what `03-F8`'s July 2026 ruling actually says happens.
    //
    // The boundary values stay exactly as they were — an empty string, a lone space, 500
    // characters, a negative number, `Number.MAX_SAFE_INTEGER` — because those are the values an
    // owner really can type into a back-office field, and none of them is a script problem.
    const spec = kotSpec();
    const base = shippedDefaultProfile(spec);
    const declared = slotDeclarationsOf(spec).map((slot) => slot.slot_id);
    const values: readonly SlotValue[] = [
      ...LATIN_SWEEP_VALUES,
      " ",
      "a".repeat(500),
      -1,
      Number.MAX_SAFE_INTEGER,
    ];
    let swept = 0;
    for (const slot_id of declared) {
      for (const value of values) {
        const label = `${slot_id}=${String(value).slice(0, 20)}`;
        const result = render(
          api,
          spec,
          { ...base, [slot_id]: value } as DocumentProfile,
          spec.example_data,
          WIDE,
        );
        expect(result.ok, `${label} caused a refusal`).toBe(true);
        swept++;
      }
    }

    // An UNDECLARED slot id is inert whatever its script (`03-F30`: "it can only fill holes the
    // spec declared"), so the full set including `₨` still runs over those — the value never
    // reaches a byte, so it never reaches the encoder either.
    for (const slot_id of MONEY_ADDRESSING_SLOT_IDS) {
      for (const value of [...SWEEP_VALUES, " ", "a".repeat(500), -1, Number.MAX_SAFE_INTEGER]) {
        const label = `undeclared ${slot_id}=${String(value).slice(0, 20)}`;
        const result = render(
          api,
          spec,
          { ...base, [slot_id]: value } as DocumentProfile,
          spec.example_data,
          WIDE,
        );
        expect(result.ok, `${label} caused a refusal`).toBe(true);
        swept++;
      }
    }

    expect(swept, "the profile sweep enumerated nothing").toBe(
      declared.length * values.length +
        MONEY_ADDRESSING_SLOT_IDS.length * (SWEEP_VALUES.length + 4),
    );
  });

  it("03-F8/03-F34: a NON-LATIN value in a declared slot is refused, never silently degraded", () => {
    // `03-F8` (founder ruling, July 2026): "until one is chosen the encoder REFUSES a non-Latin
    // user field (`raster_font_unavailable`) rather than emitting a raster with no legible
    // glyphs", and interface text carrying a byte no printer font can render is
    // `non_ascii_system_text`. Both are K-2's landed codes and `03-F34` is why they cannot be
    // swallowed: a renderer that dropped the field, transliterated it, or substituted `?` would be
    // taking the "silent degradation" the same FR bans — and `00 §5.6` says user content is
    // "never transliterated or rejected for its script", so dropping it is not the merciful
    // option, it is the one that puts a wrong ticket in a kitchen.
    //
    // Which of the two codes fires is NOT asserted — see header ambiguity 7; no FR classifies an
    // owner-typed slot value as interface text or as user content. What is asserted is that the
    // document refuses, that the refusal is an S1 that names the printer and the document, and
    // that its cause is distinguishable from the four structural ones (K-1's rule: a shared code
    // would make the band unable to say what is actually wrong).
    const spec = kotSpec();
    const base = shippedDefaultProfile(spec);
    const baseline = okOf(render(api, spec, base, spec.example_data, WIDE), "shipped default");
    const stringSlots = slotDeclarationsOf(spec).filter((slot) => typeof slot.default === "string");
    expect(
      stringSlots.length,
      "the kot declares no string slot, so no owner-typed text reaches this document and the " +
        "platform's non-Latin refusal cannot be observed from here — a finding, not a skip",
    ).toBeGreaterThan(0);

    let refused = 0;
    let inert = 0;
    for (const slot of stringSlots) {
      for (const value of NON_LATIN_SWEEP_VALUES) {
        const label = `${slot.slot_id}=${String(value)}`;
        const result = render(
          api,
          spec,
          { ...base, [slot.slot_id]: value } as DocumentProfile,
          spec.example_data,
          WIDE,
        );
        if (result.ok) {
          // The only legal `ok` here is a slot that never carried the value onto paper at all: a
          // document that renders and differs from the default has put SOMETHING else where the
          // owner's text should be, which is the degradation the FRs forbid.
          expect(
            hex(result.bytes),
            `${label} rendered a DIFFERENT document instead of refusing — the value was dropped, ` +
              "substituted or transliterated on the way through",
          ).toBe(hex(baseline.bytes));
          inert++;
          continue;
        }
        const refusal = refusalOf(result, label);
        expect(
          [...SCRIPT_REFUSAL_REASONS] as string[],
          `${label}: refused, but not for a reason that names the script problem`,
        ).toContain(refusal.reason);
        expect(refusal.severity, label).toBe("S1");
        expect(refusal.document_type, label).toBe(spec.type);
        expect(refusal.model_id, label).toBe(WIDE.model_id);
        expect(undeclaredKeys(refusal), `${label}: the refusal carries an undeclared key`).toEqual(
          [],
        );
        refused++;
      }
    }
    expect(refused + inert, "the script sweep enumerated nothing").toBe(
      stringSlots.length * NON_LATIN_SWEEP_VALUES.length,
    );
    expect(
      refused,
      "not one declared string slot put its value on paper, so nothing in this test exercised " +
        "`03-F8`'s refusal — the assertion above passed by not looking",
    ).toBeGreaterThan(0);
  });
});

describe("03-F36/03-F49 — every shipped spec renders at its own declared floor", () => {
  it("03-F36: every shipped spec renders correctly at EXACTLY its declared `min_columns`", () => {
    // "Every `DocumentSpec` must render correctly at its declared `min_columns` — A BUILD-TIME
    // TEST, NOT A REVIEW CONVENTION." This is that gate. It runs over the table rather than over a
    // hard-coded list, so a spec added later is gated by existing without anyone editing this file.
    const specs = shippedSpecs();
    expect(specs.length, "the build-time gate has nothing to gate").toBeGreaterThan(0);
    for (const spec of specs) {
      const caps = capsAt(spec.min_columns, `EXACTLY-${spec.min_columns}`);
      const out = okOf(
        render(api, spec, shippedDefaultProfile(spec), spec.example_data, caps),
        `${spec.type} at exactly ${spec.min_columns} columns`,
      );
      expect(out.bytes.length, `${spec.type} rendered no bytes at its floor`).toBeGreaterThan(0);
      expect(out.blocks.length, `${spec.type} rendered no blocks at its floor`).toBeGreaterThan(0);
    }
  });

  it("03-F49: one column below its floor, every shipped spec is REFUSED — the floor is a step, not a slope", () => {
    const specs = shippedSpecs();
    for (const spec of specs) {
      const caps = capsAt(spec.min_columns - 1, `BELOW-${spec.min_columns - 1}`);
      const refusal = refusalOf(
        render(api, spec, shippedDefaultProfile(spec), spec.example_data, caps),
        `${spec.type} one column below its floor`,
      );
      expect(refusal.reason, spec.type).toBe("min_columns_not_met");
    }
  });

  it("03-F36/03-F33: a wider printer renders THE SPEC'S OWN BLOCKS, in the spec's own regions", () => {
    // `03-F36`'s degradation ladder is per BLOCK and runs downward from the full form. A renderer
    // whose block LIST changed with the width would be expressing structure in the printer, which
    // is `03-F31`'s "never a flag on a printer" from the other end. The block ids and regions must
    // therefore be identical across widths; only their contents may differ.
    //
    // And they are compared against the SPEC, not only against each other. `RenderedBlock.region`
    // is the renderer's report of `03-F33`'s "blocks carry exactly one region", and two renders of
    // one uniformly wrong implementation agree with each other perfectly — a renderer that filed
    // every block under `BODY`, or that re-ordered them, passed the width comparison unchanged.
    // `03-F30` says a `DocumentSpec` is "an **ordered** list of typed blocks", so the order is part
    // of what is asserted.
    const spec = kotSpec();
    const profile = shippedDefaultProfile(spec);
    const declared = spec.blocks.map((block) => `${block.block_id}@${block.region}`);
    expect(
      declared.length,
      "the shipped spec declares no block to compare against",
    ).toBeGreaterThan(0);
    const shape = (result: Extract<RenderResult, { ok: true }>) =>
      result.blocks.map((block) => `${block.block_id}@${block.region}`);
    const atFloor = okOf(
      render(api, spec, profile, spec.example_data, capsAt(spec.min_columns, "FLOOR")),
      "at the floor",
    );
    const wide = okOf(
      render(api, spec, profile, spec.example_data, capsAt(64, "WIDE")),
      "at 64 columns",
    );
    expect(shape(atFloor), "the document at the floor is not the spec's own block list").toEqual(
      declared,
    );
    expect(shape(wide), "the document at 64 columns is not the spec's own block list").toEqual(
      declared,
    );
  });
});

// ── DEFERRED FROM K-4, DELIBERATELY (stated so the gap is a decision, not an omission) ──
//
// * THE CROSS-RUNTIME PASS. `03-F30`'s law is byte identity "on Electron and React Native", and one
//   vitest process is one runtime. What is asserted here is invariance under every ambient input
//   this process can vary — clock, `Math.random`, `TZ`, key insertion order, an interleaved
//   document, an interleaved refusal, frozen inputs. The two-runtime comparison is OWED and belongs
//   with `apps/pos-electron` and the RN app; no title above may be read as having run it.
// * THE PHYSICAL PASS. No printer exists (AGENTS.md, `plans/wave-1` K-8). Nothing here has been on
//   paper, and `03-F36`'s "renders CORRECTLY at min_columns" is asserted as "renders", because
//   correctness at 42 columns is a legibility claim and legibility is `27-F35`'s ≥85% comprehension
//   gate on real staff — not a byte assertion. That distinction is the same trap `03-F8` and
//   `03-F35` both closed by refusing: an assertion that a document was produced is satisfied by a
//   document nobody can read.
// * WHAT A SPEC VERSION BUMP DOES TO AN EXISTING PROFILE. Header ambiguity 2. `03-F30` versions the
//   spec and describes the migration benefit, and no FR states the semantics. This suite asserts
//   only that an UNDECLARED slot id is inert, which is `03-F30`'s "it can only fill holes the spec
//   declared" and nothing more. Whoever writes the back office (`14-F2`'s `config.changed` audit)
//   inherits the question.
// * `27-F56`'s RASTER CLAUSE, HANDED HERE BY K-2 AND STILL OPEN. "An inverted band drawn as a
//   raster image rather than through `GS B` spends the same attention and must count against the
//   same scope." K-2 could not close it (the encoder receives opaque bits); K-4 cannot close it
//   either, because closing it needs a BLOCK to declare that it is a band and `03-F30` says blocks
//   are "typed" without naming a single type. Inventing that vocabulary here would be putting the
//   renderer's design in the oracle. It stays owed — K-5 is the next layer that can hold it.
// * WHAT AN OVER-WIDE IMAGE DOES. Header ambiguity 3, inherited from K-2 unresolved: `03 §8` reads
//   as scaling, `03-F36` reads as refusal, the FRs do not choose. Nothing above asserts either.
//   This needs a spec change, not a test.
// * `03-F36`'s SPACE-AS-LAYOUT BAN. Header ambiguity 5. K-4 composes blocks, not lines; the ban is
//   about how a line reaches its right-hand column, which is K-5's layout. Passed on rather than
//   asserted at a layer that cannot see a line.
// * `BODY` AND `TOTALS` UNDER `03-F34`'s LOCKED-REGION RULE. Header ambiguity 1. Neither `_LOCKED`
//   nor `_OWNER`, and the FRs classify them nowhere. The locked-region test runs over the three
//   `_LOCKED` and two `_OWNER` rungs only, and the two unclassified ones are left to a spec change.
// * THE PROFILE VALIDATOR'S CONTENT. See the header: `03-F34` requires save-time validation to
//   exist and to be harmless, and no FR states a rule for it to apply. A validator that finds
//   nothing passes every assertion here. Whoever writes doc 14's editing surface owns the rules,
//   and owns the harder half of the named regression — "always SAVES" is a claim about a save path
//   that does not exist in this package.
// * THE FISCAL QR'S QUIET ZONE, handed here by K-2. `03-F35` does not mention a border, and a
//   symbol printed flush against a text line decodes in software and would not scan on paper. K-4
//   composes the block around the symbol and could hold it — but the margin is a number no FR
//   supplies, so asserting one would put a measurement in the oracle that the rig (`00 §4`) owes.
// * EVERYTHING ABOUT A TRANSPORT AND A SPOOLER. `03-F34` says the assertions run "before bytes
//   reach the spooler"; this suite observes the value `render` returned and never a write. K-3 owns
//   the assertion that a refused document produces zero transport writes.
// * WHAT A REFUSAL MEASURES. Header ambiguities 6 and 7. `03-F49`'s two column numbers are the only
//   measurement any FR asks a refusal to carry, so they are permitted on their own cause and
//   nothing else is required anywhere: not the QR's shortfall in millimetres, not the offending
//   codepoint of a refused field, not the slot that carried it. Each of those would make a better
//   S1 band and each would be this oracle inventing a field the corpus does not state. Whoever
//   writes `27-F11d`'s band against a real refusal is the session that will know what it needs.
// * THE DATA CONTRACT'S OWN SEMANTICS. The data axis is now varied, but generically: the walk knows
//   "string and number leaves" and nothing about what a leaf MEANS, so nothing here asserts that a
//   quantity prints as a quantity, that a station filters, or that a modifier hangs under its item.
//   `03-F31` puts the contract in the TYPE and `27-F57`/`27-F58` put the layout in K-5; a leaf
//   reaching the output is all this layer can see.
