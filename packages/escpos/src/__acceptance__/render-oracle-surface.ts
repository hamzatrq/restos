// K-4 ORACLE SURFACE — types and guarded accessors ONLY. NOT AN IMPLEMENTATION.
//
// This file declares the contract `render.test.ts` drives. It contains no block vocabulary, no
// layout, no slot table, no region policy and no refusal logic: every function here either
// forwards to `../index.js` or throws a named "not implemented yet" error. If a future edit puts
// a slot id, a column count or a region rule in this file, that edit has moved the renderer into
// the oracle and the split of `24 §3` step 2 is gone.
//
// Authored from spec text only (24 §3 step 2 — read-only to the implementing session):
//   specs/03-kitchen-fulfillment.md 03-F30 — the two layers, the slot map, the pure
//     `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes`, and purity as
//     a testable law ("a shipped competitor emits different tickets for the same order on two of
//     its own devices").
//   specs/03-kitchen-fulfillment.md 03-F31 — document types are first-class entities, never a
//     flag on a printer; each declares its own data contract, spec, invariants.
//   specs/03-kitchen-fulfillment.md 03-F32 — type invariants override configuration; a `kot`
//     renders no money token under any profile; a fiscal block cannot be suppressed; enforced
//     STRUCTURALLY, "the profile schema has no slot id addressing them".
//   specs/03-kitchen-fulfillment.md 03-F33 — the region model, and that `FISCAL_LOCKED` blocks
//     are "not in the `DocumentSpec` at all — injected at render by the certified authority
//     adapter, which declares the block AND its position".
//   specs/03-kitchen-fulfillment.md 03-F34 — enforce at render, validate at save only for
//     feedback; the three render-time assertions; hard refusal plus S1; and the named regression
//     "the shipped default always validates and always saves".
//   specs/03-kitchen-fulfillment.md 03-F36/03-F49 — every spec renders at its declared
//     `min_columns`, and the refusal below it (K-1's `checkColumns`).
//   specs/03-kitchen-fulfillment.md 03-F42 — a document is rendered WHOLE and buffered as ONE
//     unit, which is why bytes are a `Uint8Array` and why one document is one encode.
//   specs/18-engineering-handbook.md §10 — "document model → encoder → `Transport`".
//   specs/00-platform-overview.md §6 — money is branded integer paisa; §5.6 English-only UI.
//
// NO HARDWARE IS INVOLVED IN ANY TEST THAT USES THIS FILE. Every assertion downstream is about a
// returned value: a list of blocks, a `Uint8Array`, or the shape of a refusal. Nothing here opens
// a transport, and no test name may be read as a measurement of a printer.

import type { EncoderPart } from "./encoder-oracle-surface.js";
import type { DocumentType, PrinterCapability } from "./oracle-surface.js";

/**
 * `03-F33`'s region ladder, verbatim and in the FR's own order:
 * "`HEAD_LOCKED → HEAD_OWNER → BODY → TOTALS → FISCAL_LOCKED → FOOT_OWNER → TAIL_LOCKED`".
 *
 * The order is data, not decoration — `03-F33` says "Owner content is legal only **outside** the
 * regulated block", and outside is a statement about position.
 */
export const REGIONS_PER_03_F33 = [
  "HEAD_LOCKED",
  "HEAD_OWNER",
  "BODY",
  "TOTALS",
  "FISCAL_LOCKED",
  "FOOT_OWNER",
  "TAIL_LOCKED",
] as const;

export type Region = (typeof REGIONS_PER_03_F33)[number];

/**
 * `03-F33`: "`FISCAL_LOCKED` blocks are **not in the `DocumentSpec` at all** — they are injected
 * at render by the certified authority adapter (16-F23), which declares the block **and its
 * position**."
 *
 * So the region a SPEC block may declare is the ladder minus one rung. Expressed as a type rather
 * than as a runtime check for `03-F32`'s stated reason: an invariant "enforced structurally … not
 * by a runtime check on a value the owner supplied" is stronger, and a spec that could name
 * `FISCAL_LOCKED` would let a vendor author the regulated block by hand.
 */
export type SpecRegion = Exclude<Region, "FISCAL_LOCKED">;

/** `03-F34`: the three regions whose content is not the owner's. Named by the ladder's suffix. */
export const LOCKED_REGIONS = ["HEAD_LOCKED", "FISCAL_LOCKED", "TAIL_LOCKED"] as const;

/** `03-F33`: the two regions that exist FOR owner content. */
export const OWNER_REGIONS = ["HEAD_OWNER", "FOOT_OWNER"] as const;

/**
 * `03-F30`: a `DocumentProfile` "**cannot express position, order, font or structure**. It can
 * only fill holes the spec declared and flip toggles the spec declared."
 *
 * A hole takes a value and a toggle takes a flag, and both are SCALARS. This is the type doing the
 * FR's work: an object value could carry `{ font: "B" }`, an array value could carry an order, and
 * a function could carry anything at all. `03-F32`'s precedent says the structural form is the
 * strong one, so the ban is written here rather than asserted at runtime.
 *
 * `number` is admitted alongside `string` and `boolean` because `03-F30` does not restrict a hole
 * to text and `03-F39`'s `max_lines_per_chit` is a numeric owner setting of exactly this shape.
 * Nothing downstream asserts that a slot IS numeric.
 */
export type SlotValue = string | number | boolean;

/**
 * `03-F30`: "a flat `slot_id → value` map". FLAT is the load-bearing word and it is why this is a
 * `Record` of scalars rather than a tree.
 */
export type DocumentProfile = Readonly<Record<string, SlotValue>>;

/**
 * A hole the spec declared, and the value it ships with.
 *
 * DECLARED INTERPRETATION (24 §3b — stated, not smuggled): a slot carries a `default`. `03-F34`
 * names *"the shipped default always validates and always saves"* as a TEST, and a shipped default
 * has to be an object somebody can hand to the validator; `03-F30` cites `00 §7`'s "presets, not
 * knobs" and calls a slot "a preset with a hole", and a preset that ships with no value is not a
 * preset. The named alternative — an unfilled slot renders as nothing and there is no default
 * profile — is rejected because it makes `03-F34`'s named test unrunnable, which is the one
 * outcome the FR explicitly forbids.
 */
export type SlotDeclaration = {
  slot_id: string;
  default: SlotValue;
};

/**
 * `03-F30`: a `DocumentSpec` is "an ordered list of **typed blocks**"; `03-F33`: "Blocks carry
 * **exactly one** region".
 *
 * What this type deliberately does NOT model: the block's own content vocabulary (`03-F36`'s
 * `left | right`, its `short` form, its degradation order). That is renderer design and an oracle
 * that pinned it would be writing the implementation. Every downstream assertion reads blocks
 * through `block_id`, `region` and `slots` only.
 */
export type SpecBlock = {
  block_id: string;
  region: SpecRegion;
  /** The holes and toggles this block declared. `03-F30`: "It can only fill holes the spec declared". */
  slots: readonly SlotDeclaration[];
};

/**
 * `03-F30`: "vendor-authored, **versioned**, shipped as code under CODEOWNERS: an ordered list of
 * typed blocks, **one spec per document type**".
 *
 * DECLARED INTERPRETATION (24 §3b): `example_data`. `03-F36` makes "every `DocumentSpec` must
 * render correctly at its declared `min_columns`" a **build-time test, not a review convention**,
 * and a gate that runs over the whole spec table needs data for each spec it renders. `03-F31`
 * says "Each declares its own **data contract**", and the spec is the only place that knows both
 * the contract and the version it belongs to. The named simpler alternative — a separate fixtures
 * module keyed by document type — was rejected because it lets the fixture and the spec version
 * drift apart, which is precisely what `Spec@v` exists to stop.
 */
export type DocumentSpec = {
  type: DocumentType;
  /** `03-F30`'s `Spec@v`. */
  version: number;
  /** `03-F49`: "Each `DocumentSpec` declares `min_columns`". K-1 owns the TABLE; this is its echo. */
  min_columns: number;
  blocks: readonly SpecBlock[];
  /** `03-F36`'s build-time gate needs a witness; `03-F31` says the type declares its own contract. */
  example_data: unknown;
};

/**
 * `03-F33`/`16-F23`: the certified authority adapter's contribution, injected at render. The
 * adapter "declares the block **and its position**, because some authorities mandate field sets
 * only and others mandate order".
 *
 * DECLARED INTERPRETATION (24 §3b): the position is expressed as `after_block_id`, with `null`
 * meaning "before every spec block". The named alternative — a numeric index — is rejected because
 * an index is invalidated by any spec edit, and `03-F30` versions specs precisely so they can be
 * edited; a block id survives a reorder.
 */
export type FiscalBlock = {
  block_id: string;
  /** The declared position: immediately after this spec block, or first when `null`. */
  after_block_id: string | null;
  /** `03-F34`: "assert every **adapter-declared mandatory block** is present". */
  mandatory_block_ids: readonly string[];
  /** `03-F35`: an OPAQUE token — "never parsed, reconstructed or shape-validated". */
  qr_payload: string;
  /** `03-F34`: "the adapter's **declared minimum** for the target dpi", in millimetres. */
  min_qr_mm: number;
};

/**
 * `03-F34`'s render-time causes. K-1 shipped `min_columns_not_met` and its own DEFERRED note hands
 * the other three here: *"`03-F34`'s OTHER THREE refusal causes … are K-4's, and K-4 must assert
 * that their `reason` codes are DISTINCT from `min_columns_not_met` — a shared code would make the
 * S1 band unable to say what is actually wrong."*
 */
export type RenderRefusalReason =
  /** `03-F34`: "assert every adapter-declared mandatory block is present". */
  | "mandatory_block_missing"
  /** `03-F34`: "that the QR's computed physical size meets the adapter's declared minimum for the target dpi". */
  | "fiscal_qr_too_small"
  /** `03-F34`: "and that no owner slot rendered inside a locked region". */
  | "owner_slot_in_locked_region"
  /** `03-F49` via K-1's `checkColumns`, reached through the same refusal path. */
  | "min_columns_not_met"
  /** K-2's, PROPAGATED — see `ENCODER_PROPAGATED_REASONS`. */
  | (typeof ENCODER_PROPAGATED_REASONS)[number];

/**
 * K-2's landed refusal causes, which a rendered document cannot survive and must therefore SURFACE.
 *
 * `18 §10` names one pipeline ("document model → encoder → `Transport`") and `03-F30` puts the
 * encoder inside `render` ("→ blocks → **bytes**"), so a document whose bytes the encoder refuses
 * has exactly two available outcomes: propagate the refusal, or drop/alter the offending content
 * and print the rest. The second is the "silent degradation" `03-F34` bans in the same sentence
 * that requires the S1 band, so propagation is the only one the FR leaves.
 *
 * The two script causes are REACHABLE FROM A PROFILE VALUE and are exercised below; the other three
 * are listed because the composition admits them, not because this suite drives them. Nothing here
 * says which of the two a given value takes — that depends on whether the renderer treats an
 * owner-typed slot as interface text (`00 §5.6` English-only) or as user content (`00 §5.6`
 * "uncontrolled Unicode"), and no FR settles it. `03-F8`'s July 2026 ruling is what makes both a
 * REFUSAL rather than a raster: "until one is chosen the encoder REFUSES a non-Latin user field …
 * rather than emitting a raster with no legible glyphs".
 */
export const ENCODER_PROPAGATED_REASONS = [
  "non_ascii_system_text",
  "raster_font_unavailable",
  "raster_unavailable",
  "banner_budget_exceeded",
  "item_marker_budget_exceeded",
] as const;

/** The two of them a non-Latin PROFILE VALUE can reach (`03-F8`, founder ruling July 2026). */
export const SCRIPT_REFUSAL_REASONS = ["non_ascii_system_text", "raster_font_unavailable"] as const;

/**
 * K-1's refusal shape, inherited exactly. `03-F34` requires "a hard refusal to print plus an S1
 * band (27-F11d)", and a band that must name the printer and the document cannot be raised from a
 * bare exception.
 */
export type RenderRefusal = {
  ok: false;
  reason: RenderRefusalReason;
  severity: "S1";
  document_type: DocumentType;
  model_id: string;
  /**
   * `03-F49`'s two measurements, which K-1's `ColumnRefusal` already carries and which doc 14 needs
   * "at assignment time, not at 20:40 on a Friday". Optional here because they belong to ONE cause
   * — see `RENDER_REFUSAL_KEYS_BY_REASON`.
   */
  required_columns?: number;
  available_columns?: number;
};

/**
 * The keys EVERY refusal must carry, whatever the cause. `03-F34` requires "a hard refusal to print
 * plus an S1 band (27-F11d)", and `03-F5`'s precedent is that the band names the printer; K-1 added
 * the document. Four fields plus the discriminant, and no refusal may carry fewer.
 */
export const RENDER_REFUSAL_KEY_FLOOR = [
  "ok",
  "reason",
  "severity",
  "document_type",
  "model_id",
] as const satisfies readonly (keyof RenderRefusal)[];

/**
 * Every key a `RenderRefusal` may carry, PER CAUSE — an ALLOWLIST, for the reason K-1 landed on and
 * K-2 inherited: "never a silent degradation" is an assertion about ABSENCE, and absence is the one
 * thing a denylist cannot state completely. The specific leak this guards is K-1's own deferred
 * item — *"K-4 owns the assertion that `render()` returns **no blocks** on refusal"* — and its
 * sibling, a refusal that also hands back `bytes` so a caller can print the degraded document
 * anyway.
 *
 * It is per-cause and not one flat list because a flat five-key list is not a floor, it is a
 * CEILING, and it would force `render()` to DISCARD the two numbers K-1's `checkColumns` already
 * returns (`min-columns.ts`'s `ColumnRefusal`) on its way through — throwing away the measurement
 * `03-F49` says doc 14 needs, in the name of uniformity this oracle invented. So `03-F49`'s cause
 * PERMITS them (it does not require them: no FR says `render` must forward what it forwards) and
 * every other cause keeps the floor exactly, because for those four no FR supplies a measurement at
 * all — see header ambiguity 6.
 */
export const RENDER_REFUSAL_KEYS_BY_REASON = {
  mandatory_block_missing: RENDER_REFUSAL_KEY_FLOOR,
  fiscal_qr_too_small: RENDER_REFUSAL_KEY_FLOOR,
  owner_slot_in_locked_region: RENDER_REFUSAL_KEY_FLOOR,
  min_columns_not_met: [...RENDER_REFUSAL_KEY_FLOOR, "required_columns", "available_columns"],
  non_ascii_system_text: RENDER_REFUSAL_KEY_FLOOR,
  raster_font_unavailable: RENDER_REFUSAL_KEY_FLOOR,
  raster_unavailable: RENDER_REFUSAL_KEY_FLOOR,
  banner_budget_exceeded: RENDER_REFUSAL_KEY_FLOOR,
  item_marker_budget_exceeded: RENDER_REFUSAL_KEY_FLOOR,
} as const satisfies Readonly<Record<RenderRefusalReason, readonly (keyof RenderRefusal)[]>>;

type _RefusalKeysAreExhaustive =
  Exclude<
    keyof RenderRefusal,
    (typeof RENDER_REFUSAL_KEYS_BY_REASON)[RenderRefusalReason][number]
  > extends never
    ? true
    : never;
const _refusalKeysAreExhaustive: _RefusalKeysAreExhaustive = true;
void _refusalKeysAreExhaustive;

/**
 * `03-F30`'s INTERMEDIATE: "→ **blocks** → bytes". The renderer reports what it laid out and then
 * the encoder turns it into bytes, and the two must be the same document — see the composition law
 * in `render.test.ts`.
 *
 * `parts` is K-2's `EncoderPart`, not a new vocabulary: `18 §10` names one pipeline ("document
 * model → encoder → `Transport`") and a second emittable vocabulary at this layer would mean the
 * blocks a reviewer reads are not the bytes a printer receives.
 *
 * `region` is the full ladder here and not `SpecRegion`, because a RENDERED block may be the
 * adapter's `FISCAL_LOCKED` one — that is exactly the rung a spec may not declare and the renderer
 * must produce.
 */
export type RenderedBlock = {
  block_id: string;
  region: Region;
  parts: readonly EncoderPart[];
};

/**
 * Two branches, K-1's and K-2's law: `03-F34` leaves no third outcome that both proceeds and
 * degrades.
 *
 * `bytes` is a `Uint8Array` and not a stream, an iterator or a promise — `03-F42` in the type:
 * "A document is rendered whole, buffered, and transmitted as one unit … a chunked or streaming
 * renderer that stalls >2 s mid-ticket gets its ticket cut in half."
 */
export type RenderResult =
  | { ok: true; blocks: readonly RenderedBlock[]; bytes: Uint8Array }
  | RenderRefusal;

/**
 * `03-F34`: "**validate at save only for feedback**… Save-time linting must never be able to block
 * saving."
 *
 * So this returns FINDINGS and never a verdict: there is no `valid: boolean`, no `ok`, and no
 * throw, because each of those is a thing a save path can branch on — and the competitor failure
 * the FR names is precisely a linter that a save path branched on.
 *
 * **REPORTED GAP, NOT A COVERED CLAUSE:** no FR anywhere states a single lint RULE. This oracle
 * therefore asserts the validator's SHAPE, its totality and its harmlessness, and cannot assert
 * that it detects anything. A validator that returns `{ findings: [] }` for every input passes
 * every assertion in `render.test.ts`. That is written down rather than papered over — see the
 * header note "what this suite cannot assert".
 */
export type ProfileFinding = { slot_id: string; code: string };
export type ProfileValidation = { findings: readonly ProfileFinding[] };

/**
 * The `@restos/escpos` surface this suite drives. Every member is optional so that a missing
 * export fails the RED run LOUDLY at runtime (with the FR named) instead of blocking
 * `pnpm typecheck` for the whole repo — K-1's idiom, inherited through K-2.
 */
export type EscposK4Api = {
  /** `03-F33`'s ladder, in order. */
  REGIONS?: readonly Region[];
  /** `03-F30`: "one spec per document type", shipped as code. */
  DOCUMENT_SPECS?: Readonly<Partial<Record<DocumentType, DocumentSpec>>>;
  /** `03-F30`: `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes`. */
  render?: (
    spec: DocumentSpec,
    profile: DocumentProfile,
    data: unknown,
    caps: PrinterCapability,
    fiscal?: FiscalBlock,
  ) => RenderResult;
  /** `03-F34`: "validate at save only for feedback". */
  validateProfile?: (spec: DocumentSpec, profile: DocumentProfile) => ProfileValidation;
};

/**
 * WHAT THE COMPILE-TIME FIXTURES ADDITIONALLY REQUIRE, AND WHY IT IS NOT IN `EscposK4Api`.
 *
 * `EscposK4Api` can only describe RUNTIME members, because it is what the guarded accessors above
 * forward through. `03-F32` says its invariants are "enforced **structurally** … not by a runtime
 * check", so four of the assertions in `render.test.ts` are `tsc` runs over generated fixtures that
 * import `@restos/escpos` **directly**. Those fixtures need these TYPE exports, and a missing one
 * fails the run with a named `TS2305`/`TS2724` rather than silently passing — that guard is in
 * `assertRejectedByTheType`:
 *
 *   - `SpecBlock`   — so `SpecBlock["region"]` can be shown to exclude `FISCAL_LOCKED` (`03-F33`).
 *   - `ProfileFor<S extends DocumentSpec>` — the profile type **derived from one spec's declared
 *     slot ids**. This is `03-F32`'s "the profile schema has no slot id addressing them" expressed
 *     in the type system, and it only works if the shipped specs carry LITERAL slot ids (a `const`
 *     assertion), not widened `string`.
 *   - `KotData`     — `03-F31`'s "each declares its own **data contract**", for the type the chit
 *     is rendered from. The guard over it is that no branded `Paisa` appears anywhere inside it.
 *   - `DOCUMENT_SPECS` typed such that `DOCUMENT_SPECS.kot.example_data` **is** `KotData`. A
 *     contract the spec's own example is not checked against is a type nothing checks (oracle
 *     round 2 §C pattern 4, "correct in isolation, unconnected in fact"), so `DocumentSpec` is
 *     expected to be generic in its data rather than carrying `example_data: unknown` as this
 *     oracle's widened copy above does.
 */

const missing = (name: string, fr: string): never => {
  throw new Error(`@restos/escpos.${name} is not implemented yet (K-4, ${fr})`);
};

export const regions = (api: EscposK4Api): readonly Region[] =>
  api.REGIONS ?? missing("REGIONS", "03-F33");

export const documentSpecs = (
  api: EscposK4Api,
): Readonly<Partial<Record<DocumentType, DocumentSpec>>> =>
  api.DOCUMENT_SPECS ?? missing("DOCUMENT_SPECS", "03-F30 / 03-F31");

export const render = (
  api: EscposK4Api,
  spec: DocumentSpec,
  profile: DocumentProfile,
  data: unknown,
  caps: PrinterCapability,
  fiscal?: FiscalBlock,
): RenderResult =>
  typeof api.render === "function"
    ? api.render(spec, profile, data, caps, fiscal)
    : missing("render", "03-F30 / 03-F34");

export const validateProfile = (
  api: EscposK4Api,
  spec: DocumentSpec,
  profile: DocumentProfile,
): ProfileValidation =>
  typeof api.validateProfile === "function"
    ? api.validateProfile(spec, profile)
    : missing("validateProfile", "03-F34");
