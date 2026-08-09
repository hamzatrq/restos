/**
 * The printed-document model (`03-F30`..`03-F33`, `03-F49`): `DocumentSpec`, `DocumentProfile`,
 * the region ladder, and the specs that ship as code.
 *
 * `03-F30`'s split is the whole design and it is expressed in the TYPES rather than in discipline:
 * a `DocumentSpec` is vendor-authored and versioned; a `DocumentProfile` is org config that
 * "**cannot express position, order, font or structure** — it can only fill holes the spec
 * declared and flip toggles the spec declared". A hole takes a SCALAR, so an object value cannot
 * carry `{ font: "B" }` and an array value cannot carry an order.
 *
 * `03-F32` is enforced the same way: "a `kot` renders no money token under any profile … enforced
 * structurally — the profile schema has no slot id addressing them — not by a runtime check on a
 * value the owner supplied". `ProfileFor<Spec>` is that schema: its keys are exactly the slot ids
 * the spec declares, so a `totals.grand_total` slot is not a value that gets rejected, it is a key
 * that cannot be written down. `KotData` carries no money field for the same reason — "prices are
 * simply not in the chit data model".
 */

import { CASH_BLOCK_RENDERERS, CASH_DOCUMENT_SPECS } from "./cash-documents.js";
import { clockOf } from "./document-parts.js";
import type { EncoderPart } from "./encoder.js";
import { type DocumentType, MIN_COLUMNS } from "./min-columns.js";
import { RECEIPT_BLOCK_RENDERER_TABLE, RECEIPT_DOCUMENT_SPECS } from "./receipt-document.js";

/**
 * `03-F33`, verbatim and in the FR's own order. The order is data: "owner content is legal only
 * **outside** the regulated block", and outside is a statement about position.
 */
export const REGIONS = [
  "HEAD_LOCKED",
  "HEAD_OWNER",
  "BODY",
  "TOTALS",
  "FISCAL_LOCKED",
  "FOOT_OWNER",
  "TAIL_LOCKED",
] as const;

export type Region = (typeof REGIONS)[number];

/**
 * `03-F33`: "`FISCAL_LOCKED` blocks are **not in the `DocumentSpec` at all** — they are injected
 * at render by the certified authority adapter (16-F23)". So the region a SPEC block may declare
 * is the ladder minus one rung, and it is a type rather than a runtime check for `03-F32`'s stated
 * reason: a spec that could name the rung would let a vendor author the regulated block by hand.
 */
export type SpecRegion = Exclude<Region, "FISCAL_LOCKED">;

/** `03-F34`: the three regions whose content is not the owner's. */
export const LOCKED_REGIONS: readonly Region[] = ["HEAD_LOCKED", "FISCAL_LOCKED", "TAIL_LOCKED"];

/** `03-F30`: a profile fills holes and flips toggles, and both are SCALARS. */
export type SlotValue = string | number | boolean;

/**
 * A hole the spec declared, and the value it ships with.
 *
 * `03-F34` names *"the shipped default always validates and always saves"* as a TEST, and a
 * shipped default has to be an object somebody can hand to the validator; `03-F30` calls a slot a
 * preset with a hole, and a preset that ships with no value is not a preset.
 */
export type SlotDeclaration = { slot_id: string; default: SlotValue };

/** `03-F30`: "an ordered list of **typed blocks**"; `03-F33`: "blocks carry **exactly one** region". */
export type SpecBlock = {
  block_id: string;
  region: SpecRegion;
  slots: readonly SlotDeclaration[];
};

/** `03-F30`: "a flat `slot_id → value` map". FLAT is why this is a record of scalars, not a tree. */
export type DocumentProfile = Readonly<Record<string, SlotValue>>;

/**
 * `03-F30`'s `Spec@v`, `03-F49`'s `min_columns`, and `03-F31`'s "each declares its own **data
 * contract**" — which is the type parameter.
 *
 * `example_data` is the witness `03-F36`'s build-time gate renders ("every `DocumentSpec` must
 * render correctly at its declared `min_columns` — a build-time test, not a review convention"),
 * and it is typed by the contract so a spec's own example cannot drift from it.
 */
export type DocumentSpec<TData = unknown> = {
  type: DocumentType;
  version: number;
  min_columns: number;
  blocks: readonly SpecBlock[];
  example_data: TData;
};

/**
 * `03-F32`'s structural enforcement: the profile schema of ONE spec, whose keys are exactly the
 * slot ids that spec declared. Every key is optional because a slot that is not filled renders its
 * declared default — `03-F30`'s "preset with a hole".
 */
export type ProfileFor<S extends DocumentSpec> = {
  [K in S["blocks"][number]["slots"][number]["slot_id"]]?: SlotValue;
};

/**
 * `03-F33`/`16-F23`: the certified authority adapter's contribution, injected at render. The
 * adapter "declares the block **and its position**, because some authorities mandate field sets
 * only and others mandate order".
 *
 * The position is `after_block_id` rather than an index because an index is invalidated by any
 * spec edit, and `03-F30` versions specs precisely so they can be edited.
 */
export type FiscalBlock = {
  block_id: string;
  /** Immediately after this spec block; `null` places it before every spec block. */
  after_block_id: string | null;
  /** `03-F34`: "assert every **adapter-declared mandatory block** is present". */
  mandatory_block_ids: readonly string[];
  /** `03-F35`: an OPAQUE token — "never parsed, reconstructed or shape-validated". */
  qr_payload: string;
  /** `03-F34`: "the adapter's **declared minimum** for the target dpi", in millimetres. */
  min_qr_mm: number;
};

/**
 * What a block emits, given the document's data and its own declared slots.
 *
 * Kept OUT of `SpecBlock` and looked up by `(document type, block_id)` instead, for one reason
 * that is not style: a `DocumentSpec` has to survive `structuredClone` — `03-F30` makes purity a
 * law tested across devices and a spec carrying a function cannot cross a structured-clone
 * boundary at all. So the spec stays data and the code that renders it ships beside it.
 */
export type BlockRenderer = (
  data: unknown,
  slot: (slot_id: string) => SlotValue,
) => readonly EncoderPart[];

/**
 * One modifier on one line (`03-F3`: "one line per item with qty/variant/**modifiers**").
 *
 * `removal` is a BOOLEAN and not a string kind because `27-F59` names exactly two behaviours and
 * makes the ink depend on which: "where a modifier is a *removal* it carries the inverted marker of
 * `27-F56`, because a removal that is missed is an allergen incident, not a preference miss". A
 * renderer that cannot tell the two apart cannot satisfy the FR at all.
 */
export type KotModifier = {
  readonly name: string;
  readonly removal: boolean;
};

/** One item line (`03-F3`: "one line per item with qty/variant/modifiers"). */
export type KotLine = {
  readonly quantity: number;
  /** `03-F38`'s `kitchen_name`, resolved up the `01-F21` chain before it reaches here. */
  readonly name: string;
  /** `27-F59`: "Modifiers are indented under their item and never inlined." */
  readonly modifiers: readonly KotModifier[];
};

/**
 * `03-F31`'s data contract for the kitchen chit.
 *
 * **There is no money field and there is no field a money value could hide in** — `03-F32`: "the
 * deepest POS in the market has **no price option anywhere** in its kitchen-printer configuration:
 * prices are simply not in the chit data model." `27-F57` is why `quantity` sits beside `name`.
 * Every field below is a fact about FOOD, IDENTITY or TIME.
 */
export type KotData = {
  /** `03-F3`'s ticket identity — the number the pass and the counter both say out loud. */
  readonly ticket_no: string;
  /**
   * `03-F3`: "order number + **table/channel** in large type". ONE field, because `03-F3` writes
   * the two as one slot: a takeaway ticket's value is its channel, a dine-in ticket's is its table.
   */
  readonly table: string;
  /** `03-F18`/`03-F50`: the station this chit was routed to. */
  readonly station: string;
  /**
   * `27-F62`: "Print what was true at **append** time, stamped with `branch_created_at`, and let
   * the ledger own the present"; `03-F3` asks the layout for a "timestamp". An integer millisecond
   * quantity, which is what `01-F43` computes.
   */
  readonly branch_created_at: number;
  /**
   * `03-F3`: "reprints carry a 'REPRINT' band"; `03-F37`: "Reprint markers are mandatory per type,
   * **in a locked region**". On the DATA and not in the profile, because `03-F32` says "type
   * invariants override configuration" and a fact an owner could switch off is not a mandatory
   * marker — whether THIS print is a reprint is a property of the print job (`03-F7`).
   */
  readonly reprint: boolean;
  readonly lines: readonly KotLine[];
};

/** `03-F31`: the document type IS the data contract, so the cast is at the type's own boundary. */
const kotOf = (data: unknown): KotData => data as KotData;

// `27-F62`'s stamp as a wall clock (`clockOf`) moved to `document-parts.ts` when the receipt became
// its second consumer — ONE Karachi conversion, for the reason `simulate.ts` states about the
// byte→page walk: two of them diverge, and then a chit and a receipt for one order disagree about
// what time it was. The KOT's own reading of it — hour and minute, no date, `27-F55` — is recorded
// there beside the receipt's opposite reading of `02-F15`.

/**
 * `27-F59`: "Modifiers are indented under their item". With `03-F36` banning absolute dot
 * positioning in the same corpus, a leading run of spaces is the only indent mechanism left — and
 * the same FR's space-as-layout ban is about INTERIOR padding that carries a value to a right-hand
 * column and makes a document unreflowable, which a leading indent is not.
 */
const MODIFIER_INDENT = "  ";

/**
 * `27-F59`'s inverted removal marker. The word is this layer's — no FR states one — and it is a
 * word rather than a glyph because `27-F60` forbids a pictogram carrying meaning alone and
 * `27 §2b` records that no Pakistan-specific pictogram comprehension data exists at all.
 */
const REMOVAL_MARKER = "NO";

/**
 * The `kot`'s layout — `27 §2b`'s ticket, one block per group.
 *
 * `27-F58` fixes the reading order and forbids configuring it: **identifier → timing → items →
 * modifiers**, separated by blank lines and never by a rule ("a full-width rule costs a line of
 * paper and reads as a *boundary between documents* to someone who parses shape rather than text").
 * The order is the order of the blocks below, which is why nothing here reads a slot to decide
 * where something goes.
 *
 * `27-F56`'s ladder is spent exactly twice per glance: **2×2** on the order/table identifier and on
 * each item's quantity, **inverted** on the one banner and on one marker per item block. Everything
 * else is normal — "bold is not a level".
 */
const KOT_BLOCK_RENDERERS: Readonly<Record<string, BlockRenderer>> = {
  /**
   * `03-F37`: "Reprint markers are mandatory per type, **in a locked region** … Reprints are
   * already a named fraud vector — the paper must say so." `27-F56` gives it the document's ONE
   * banner.
   *
   * The block declares no slot, and that is what makes the band unsuppressible rather than merely
   * unsuppressed: `03-F33` puts owner content only outside a locked block and `03-F34` refuses any
   * document that breaks that, so there is no profile an owner could write which reaches this band.
   */
  KOT_REPRINT_BAND: (data) =>
    kotOf(data).reprint
      ? [
          { kind: "text", value: "REPRINT", ink: "inverted", scope: "banner" },
          { kind: "feed", lines: 1 },
        ]
      : [],
  KOT_HEAD: (data) => {
    const kot = kotOf(data);
    return [
      { kind: "text", value: "KOT ", ink: "normal" },
      // `27-F56`: the 2×2 rung is allocated to "the item line's quantity and the order/table
      // identifier"; `03-F3` wants "order number + table/channel in large type". Two parts and one
      // line, because `03-F3` states no order between them and `27-F58` reads them as one group.
      { kind: "text", value: kot.ticket_no, ink: "size_2x2" },
      { kind: "text", value: " ", ink: "normal" },
      { kind: "text", value: kot.table, ink: "size_2x2" },
      { kind: "feed", lines: 1 },
      // `27-F58`'s timing step. The station rides it rather than taking a line of its own:
      // `03-F18`/`03-F50` make it the routing key a cook uses to recognise their own chit, and
      // `27-F55` says the KOT must carry LESS, not the same facts spread over more paper. It is
      // deliberately NOT at 2×2 — `27-F56` allocated that rung elsewhere.
      { kind: "text", value: `${kot.station} `, ink: "normal" },
      { kind: "text", value: clockOf(kot.branch_created_at), ink: "normal" },
      // `27-F58`: "Groups are separated by blank lines, not rules" — the identifier/timing group
      // ends here and the items begin.
      { kind: "feed", lines: 2 },
    ];
  },
  // The two owner notes emit `user_text`, not `text`. DECLARED INTERPRETATION (`24 §3b`) — no FR
  // classifies an owner-typed slot value, and K-4's oracle records that openly (its ambiguity 7).
  // The named alternative is `text`, which is what these were: SYSTEM text, `00 §5.6`'s
  // English-only interface language. It is rejected because interface text is the app's own
  // strings ("user-facing strings live in per-app `strings.ts` catalogs" — `00 §5.6`) and a note an
  // owner typed into doc 14's editor is DATA, not a catalog string. The difference is not
  // cosmetic: it decides which refusal the S1 band shows. As `text`, an Urdu footer note refuses
  // `non_ascii_system_text` — the band says the platform's own English is broken, and the field
  // stays unprintable forever, because English-only is permanent for interface text. As
  // `user_text` it refuses `raster_font_unavailable`, which is `03-F8`'s July 2026 ruling and
  // names the actual state of the world: the raster path is unwalked until a font and a shaping
  // engine are chosen (`06`/`07`). Byte output for a Latin note is unchanged either way.
  KOT_HEAD_NOTE: (_data, slot) => [
    { kind: "user_text", value: String(slot("header_note")) },
    { kind: "feed", lines: 1 },
  ],
  KOT_ITEMS: (data) =>
    kotOf(data).lines.flatMap((line, index): readonly EncoderPart[] => {
      // `27-F59`, scoped by `27-F56`'s two-scope ruling: "an item with two removals carries ONE
      // marker covering both — two inversions inside one item block are in a single glance, which
      // is the case `27-F56`'s budget actually forbids". So the removals of one item share a
      // marker, a line and an `item_block` key, and two items never share the key: "a removal on
      // the second dish is never in the same glance as a removal on the first".
      const removals = line.modifiers.filter((modifier) => modifier.removal);
      const preferences = line.modifiers.filter((modifier) => !modifier.removal);
      return [
        // `27-F57`: the quantity sits immediately left of the item name, on the same line, "never
        // in a right-aligned column and never on its own row" — so it is never padded to align
        // with the line above it.
        { kind: "text", value: String(line.quantity), ink: "size_2x2" },
        { kind: "text", value: ` ${line.name}`, ink: "normal" },
        { kind: "feed", lines: 1 },
        // The removal band leads the modifiers because `27-F59` is explicit about why it is
        // inverted at all: "a removal that is missed is an allergen incident, not a preference
        // miss". No FR states an order among an item's modifiers.
        ...(removals.length === 0
          ? []
          : ([
              { kind: "text", value: MODIFIER_INDENT, ink: "normal" },
              {
                kind: "text",
                value: REMOVAL_MARKER,
                ink: "inverted",
                scope: "item",
                item_block: `KOT_ITEM_${index}`,
              },
              {
                kind: "text",
                value: ` ${removals.map((modifier) => modifier.name).join(", ")}`,
                ink: "normal",
              },
              { kind: "feed", lines: 1 },
            ] as const)),
        // A preference is indented under its item like a removal and spends no ink: `27-F56`
        // reserves inversion, and "a ticket that uses inversion twice has used it zero times".
        ...preferences.flatMap((modifier): readonly EncoderPart[] => [
          { kind: "text", value: `${MODIFIER_INDENT}${modifier.name}`, ink: "normal" },
          { kind: "feed", lines: 1 },
        ]),
      ];
    }),
  KOT_FOOT_NOTE: (_data, slot) => [
    { kind: "user_text", value: String(slot("footer_note")) },
    { kind: "feed", lines: 1 },
  ],
  KOT_TAIL: () => [{ kind: "feed", lines: 2 }, { kind: "cut" }],
};

/**
 * The shipped `kot` spec (`03-F30`: "vendor-authored, versioned, shipped as code under
 * CODEOWNERS").
 *
 * `min_columns` is READ FROM `MIN_COLUMNS`, never repeated: `03-F49` states the number once and
 * two declarations of one number is the defect.
 *
 * The two owner slots are the customisation surface `03-F33` requires to exist — `HEAD_OWNER` and
 * `FOOT_OWNER` are the regions that exist FOR owner content, and a spec that declared no hole
 * would make `03-F30`'s profile layer unreachable. They default to empty: a chit carries no owner
 * note until an owner writes one.
 */
const KOT_SPEC = {
  type: "kot",
  version: 1,
  min_columns: MIN_COLUMNS.kot,
  blocks: [
    { block_id: "KOT_REPRINT_BAND", region: "HEAD_LOCKED", slots: [] },
    { block_id: "KOT_HEAD", region: "HEAD_LOCKED", slots: [] },
    {
      block_id: "KOT_HEAD_NOTE",
      region: "HEAD_OWNER",
      slots: [{ slot_id: "header_note", default: "" }],
    },
    { block_id: "KOT_ITEMS", region: "BODY", slots: [] },
    {
      block_id: "KOT_FOOT_NOTE",
      region: "FOOT_OWNER",
      slots: [{ slot_id: "footer_note", default: "" }],
    },
    { block_id: "KOT_TAIL", region: "TAIL_LOCKED", slots: [] },
  ],
  example_data: {
    ticket_no: "142",
    table: "T4",
    station: "GRILL",
    branch_created_at: 1_754_300_000_000,
    reprint: false,
    lines: [
      {
        quantity: 2,
        name: "Chicken Karahi",
        modifiers: [{ name: "Onion", removal: true }],
      },
      { quantity: 1, name: "Garlic Naan", modifiers: [] },
    ],
  },
} as const satisfies DocumentSpec<KotData>;

/**
 * `03-F30`: "one spec per document type". Keyed by type, so uniqueness is the map's.
 *
 * `03-F31` names eight types and only the ones whose spec is written appear here — an entry is
 * added when its spec and its data contract are, not before. FOUR are written: `kot` (K-5), S-7's
 * two cash documents, and `receipt` (`02-F15`/`02-F16`) — the last three live in their own files
 * because they carry money, which is the INVERSE of this file's `03-F32` invariant, and keeping
 * them apart is what makes that legible.
 *
 * **Four of the eight are still unwritten and that is a scope statement, not an oversight:**
 * `bill` (a PRE-payment request — `03-F31` names the type and no FR in doc 02 or doc 03 states
 * what it carries, so writing one would be inventing content), `refund_slip` (`02-F36`, owed with
 * the refund flow), `rider_settlement_slip` (`09-F19`, Wave 2) and `test_page` (`03-F10`).
 */
export const DOCUMENT_SPECS: {
  readonly kot?: typeof KOT_SPEC;
  readonly receipt?: (typeof RECEIPT_DOCUMENT_SPECS)["receipt"];
  readonly shift_close_slip?: (typeof CASH_DOCUMENT_SPECS)["shift_close_slip"];
  readonly day_summary?: (typeof CASH_DOCUMENT_SPECS)["day_summary"];
} = { kot: KOT_SPEC, ...RECEIPT_DOCUMENT_SPECS, ...CASH_DOCUMENT_SPECS };

/** The code that renders each shipped spec's blocks, keyed the way the specs are. */
export const BLOCK_RENDERERS: Readonly<
  Partial<Record<DocumentType, Readonly<Record<string, BlockRenderer>>>>
> = { kot: KOT_BLOCK_RENDERERS, ...RECEIPT_BLOCK_RENDERER_TABLE, ...CASH_BLOCK_RENDERERS };
