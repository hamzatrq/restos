/**
 * `03-F30`'s render, `03-F34`'s enforcement, and `03-F34`'s save-time validator.
 *
 * `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes` is a **pure
 * function**, and `03-F30` makes that a law with a named counter-example: "identical (spec,
 * profile, data, caps) must produce byte-identical output on Electron and React Native. A shipped
 * competitor emits different tickets for the same order on two of its own devices." So nothing
 * here reads a clock, a random source, a timezone, a locale or any module-level state, and nothing
 * here mutates an argument.
 *
 * `03-F34` puts three assertions before the bytes reach the spooler — every adapter-declared
 * mandatory block present, the QR's computed physical size at or above the adapter's declared
 * minimum for the target dpi, and no owner slot inside a locked region — and `03-F49` adds the
 * column floor through the same path. Failure is "a hard refusal to print plus an S1 band, never a
 * silent degradation", so a refusal carries **no blocks and no bytes**: there is nothing a caller
 * could print anyway.
 *
 * An ENCODER refusal is propagated rather than swallowed. `18 §10` names one pipeline ("document
 * model → encoder → `Transport`") and `03-F30` puts the encoder inside render ("→ blocks →
 * bytes"), so a document whose bytes the encoder refuses has two available outcomes: surface the
 * refusal, or drop the offending content and print the rest — and the second is the degradation
 * the same FR bans.
 */

import type { PrinterCapability } from "./capability.js";
import {
  BLOCK_RENDERERS,
  type DocumentProfile,
  type DocumentSpec,
  type FiscalBlock,
  LOCKED_REGIONS,
  type Region,
  type SlotValue,
  type SpecBlock,
} from "./document.js";
import { type EncodeRefusalReason, type EncoderPart, encode, fiscalQrMm } from "./encoder.js";
import { checkColumns, type DocumentType } from "./min-columns.js";

/**
 * `03-F30`'s intermediate: "→ **blocks** → bytes". `parts` is the encoder's own vocabulary, not a
 * second emittable one — `18 §10` names one pipeline, and a second vocabulary here would mean the
 * blocks a reviewer reads are not the bytes a printer receives.
 *
 * `region` is the FULL ladder, not `SpecRegion`: a rendered block may be the adapter's
 * `FISCAL_LOCKED` one, which is exactly the rung a spec may not declare.
 */
export type RenderedBlock = {
  block_id: string;
  region: Region;
  parts: readonly EncoderPart[];
};

/**
 * `03-F34`'s render-time causes, plus `03-F33`'s unresolvable position, K-1's column floor and
 * K-2's encoder causes propagated. One distinct code per distinct failure: a shared code would make
 * the S1 band unable to say what is actually wrong.
 */
export type RenderRefusalReason =
  | "mandatory_block_missing"
  | "fiscal_qr_too_small"
  | "fiscal_position_unresolved"
  | "owner_slot_in_locked_region"
  | "min_columns_not_met"
  | EncodeRefusalReason;

/**
 * `03-F34`: "a hard refusal to print plus an S1 band (27-F11d)". A band that must name the printer
 * (`03-F5`'s precedent) and the document cannot be raised from a bare exception, so this is a
 * VALUE.
 *
 * The two column numbers ride only on `min_columns_not_met`, where `03-F49` asks for them ("doc
 * 14's printer setup must say so at assignment time"). No FR asks any other cause for a
 * measurement, so no other cause invents one.
 *
 * `after_block_id` rides only on `fiscal_position_unresolved`, for the same reason in the other
 * direction: the misconfiguration IS a specific string the adapter supplied, and a band that says
 * "the fiscal position did not resolve" without naming it sends an integrator to read the whole
 * spec (`03-F5`'s precedent — the outcome names what is wrong).
 */
export type RenderRefusal = {
  ok: false;
  reason: RenderRefusalReason;
  severity: "S1";
  document_type: DocumentType;
  model_id: string;
  required_columns?: number;
  available_columns?: number;
  after_block_id?: string;
};

export type RenderResult =
  | { ok: true; blocks: readonly RenderedBlock[]; bytes: Uint8Array }
  | RenderRefusal;

/** `03-F30`: "It can only fill holes the spec declared" — an id this block did not declare is not a hole. */
const slotReader =
  (block: SpecBlock, profile: DocumentProfile) =>
  (slot_id: string): SlotValue => {
    const declared = block.slots.find((slot) => slot.slot_id === slot_id);
    if (declared === undefined) return "";
    return profile[slot_id] ?? declared.default;
  };

/**
 * `03-F30`: `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes`.
 */
export const render = (
  spec: DocumentSpec,
  profile: DocumentProfile,
  data: unknown,
  caps: PrinterCapability,
  fiscal?: FiscalBlock,
): RenderResult => {
  const refuse = (reason: RenderRefusalReason): RenderRefusal => ({
    ok: false,
    reason,
    severity: "S1",
    document_type: spec.type,
    model_id: caps.model_id,
  });

  // 03-F49 through 03-F34's existing path. The refusal is K-1's own, forwarded whole, so the two
  // numbers doc 14 needs are not thrown away in transit.
  const columns = checkColumns(spec.type, caps);
  if (!columns.ok) return columns;

  // 03-F34: "that no owner slot rendered inside a locked region". A block that declares a hole in
  // a locked region IS an owner slot there — the profile does not have to fill it for the document
  // to be wrong.
  if (
    spec.blocks.some((block) => LOCKED_REGIONS.includes(block.region) && block.slots.length > 0)
  ) {
    return refuse("owner_slot_in_locked_region");
  }

  const renderers = BLOCK_RENDERERS[spec.type] ?? {};
  const rendered: RenderedBlock[] = spec.blocks.map((block) => ({
    block_id: block.block_id,
    region: block.region,
    parts: renderers[block.block_id]?.(data, slotReader(block, profile)) ?? [],
  }));

  let blocks: readonly RenderedBlock[] = rendered;

  if (fiscal !== undefined) {
    // 03-F33: the adapter declares the block AND ITS POSITION. A position that names no block in
    // this document does not resolve to a position at all, so there is nothing to inject and
    // 03-F34's "hard refusal to print, never a silent degradation" is the only outcome left.
    const injection = injectFiscal(rendered, fiscal);
    if (!injection.ok) {
      return { ...refuse("fiscal_position_unresolved"), after_block_id: injection.after_block_id };
    }
    blocks = injection.blocks;

    // 03-F34: "assert every adapter-declared mandatory block is present" — after injection, so an
    // adapter that mandates the block it supplies renders rather than deadlocks.
    for (const block_id of fiscal.mandatory_block_ids) {
      if (!blocks.some((block) => block.block_id === block_id)) {
        return refuse("mandatory_block_missing");
      }
    }
    // 03-F34/03-F35: the size is COMPUTED FROM `dpi`, so it is measured off this printer's record
    // and never off a constant. Below the adapter's floor there is no legal document to print.
    if (fiscalQrMm(fiscal.qr_payload, caps.dpi) < fiscal.min_qr_mm) {
      return refuse("fiscal_qr_too_small");
    }
  }

  // 03-F42: one document, ONE encode. Per-block encoding would repeat `ESC @` inside a document.
  const encoded = encode(
    blocks.flatMap((block) => [...block.parts]),
    caps,
  );
  if (!encoded.ok) return refuse(encoded.reason);
  return { ok: true, blocks, bytes: encoded.bytes };
};

/**
 * `03-F33`: the adapter declares the block AND its position; `null` is before every spec block.
 *
 * **A declared `after_block_id` that names no block in this document is a MISS, and a miss is
 * reported.** This used to be `findIndex(...) + 1`, and `findIndex` answers `-1` when it finds
 * nothing — so `-1 + 1 = 0` put the regulated block at the TOP of the ticket and printed it. That
 * is a valid-looking fiscal document with the authority's block in a place no authority asked for,
 * produced by an arithmetic accident rather than a decision: precisely the "silent degradation"
 * `03-F34` bans, and unobservable at the counter because the ticket looks fine.
 *
 * The `null` case is NOT a miss — it is the FR's own "before every spec block", and it is answered
 * before any lookup so that the two cannot be confused again.
 */
const injectFiscal = (
  blocks: readonly RenderedBlock[],
  fiscal: FiscalBlock,
): { ok: true; blocks: readonly RenderedBlock[] } | { ok: false; after_block_id: string } => {
  const injected: RenderedBlock = {
    block_id: fiscal.block_id,
    region: "FISCAL_LOCKED",
    // 03-F35: ALWAYS rasterised, never the native QR command — which is a property of the PART,
    // since `fiscal_qr` has no native branch to take. The payload is carried, never parsed.
    parts: [{ kind: "fiscal_qr", payload: fiscal.qr_payload }],
  };
  if (fiscal.after_block_id === null) return { ok: true, blocks: [injected, ...blocks] };
  const at = blocks.findIndex((block) => block.block_id === fiscal.after_block_id);
  if (at === -1) return { ok: false, after_block_id: fiscal.after_block_id };
  return { ok: true, blocks: [...blocks.slice(0, at + 1), injected, ...blocks.slice(at + 1)] };
};

export type ProfileFinding = { slot_id: string; code: string };
export type ProfileValidation = { findings: readonly ProfileFinding[] };

/**
 * `03-F34`: "**validate at save only for feedback** … Save-time linting must never be able to
 * block saving."
 *
 * So this returns FINDINGS and never a verdict: no `valid`, no `ok`, no throw, because each of
 * those is a thing a save path can branch on — and the competitor failure the FR names is exactly
 * a linter that a save path branched on, leaving merchants unable to save the vendor's own default
 * template.
 *
 * **One rule, and it is `03-F30`'s own sentence:** a profile "can only fill holes the spec
 * declared", so a key no slot declares changes nothing when the document renders. Saying so at
 * save time is feedback; refusing the save would be the banned behaviour. No FR states any other
 * lint rule, and inventing one here would be policy this layer does not own.
 *
 * @unreached-owed The EDITING surface owns this caller and `14` owns that surface (routing table:
 * "`03` owns the renderer; `14` owns only the editing surface"). No back office exists, so the
 * save-time feedback this returns has nowhere to appear yet.
 */
export const validateProfile = (
  spec: DocumentSpec,
  profile: DocumentProfile,
): ProfileValidation => {
  const declared = new Set(spec.blocks.flatMap((block) => block.slots.map((slot) => slot.slot_id)));
  return {
    findings: Object.keys(profile)
      .filter((slot_id) => !declared.has(slot_id))
      .map((slot_id) => ({ slot_id, code: "slot_not_declared" })),
  };
};
