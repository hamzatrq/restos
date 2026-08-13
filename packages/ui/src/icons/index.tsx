// `27-F30`..`27-F37` — THE ICON VOCABULARY. Twenty symbols, drawn here, on one 24-unit grid.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ `27-F35`'s COMPREHENSION GATE HAS NOT BEEN RUN, AND EVERYTHING BELOW IS PROVISIONAL ON IT.
//
// That FR is the one that decides whether these drawings work: **≥85% correct and ≤5% critical
// confusion on a post-training retest with real staff**, with `27-F34` run as *"show the real
// page, name the function, record the tap"*. It is a human protocol, on people this session has
// not met, and no test in this package is a substitute for it. `27-F31`'s own headline is the
// reason to take it seriously rather than assume a pass: locally drawn pictograms scored **20 of
// 23** and imported ones **11 of 23** with low-literate participants — roughly half of a
// plausible-looking imported set was unreadable to the people it was for, and every one of those
// imported symbols looked fine to the person who chose it.
//
// **So a symbol never travels alone.** `IconLabel` renders the pictogram WITH the word, always,
// and it is the only thing this package exports to app code — `Icon` is deliberately NOT on the
// `packages/ui` barrel, so a screen cannot reach a bare pictogram at all. There is no prop that
// suppresses the word and no prop that hides it; a blank label THROWS, naming this FR, because
// `label=""` is a pictogram shipped alone wearing the pairing component's clothes.
//
// Dropping the word is a separate decision that `27-F35` unlocks and nothing else does. When it
// is run and passed, this paragraph is what should be edited — not a call site.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THE SET IS DRAWN HERE AND NOT INSTALLED (`27-F30`, `27-F31`)
//
// 987 Pakistani doctors, dentists and paramedics scored **42.2% mean comprehension on ISO 7010**,
// with only 2 of 19 signs clearing the international threshold — literate professionals, on the
// international standard. `27-F30` concludes *"Material Icons will not do better"*, and `27-F31`
// puts locally developed pictograms 20-of-23 against 11-of-23 for imported equivalents with the
// same low-literate participants. This module therefore declares no dependency, fetches nothing
// and embeds no raster: twenty inline drawings, in source, readable and editable by the next
// person who runs the gate. Internet icon sets were used as REFERENCE for shape conventions on a
// founder ruling; nothing here is copied, and nothing here is installed.
//
// `18 §14` line 120 does put `lucide-react` on the internal tools by name, and `apps/backoffice`
// uses it in eight components. That exception is real and is not this file's to widen or to
// settle: the reading its acceptance suite takes — the narrowest one that leaves both documents
// standing — is that `27-F30`'s evidence is about the people it was measured on, so the ban binds
// the staff-facing operational surfaces and the back office keeps its set. A founder ruling could
// go the other way.
//
// STYLE (`27-F32`, `27-F33`, `27-F36`)
//
// - **Semi-abstract line drawings.** Photographs measured WORST of five representations —
//   extraneous detail actively hurts — and a single geometric mark is the other failure. Every
//   symbol here carries between three and five marks: enough to be a picture of something,
//   nowhere near enough to be a picture of a particular thing.
// - **Actions carry a motion cue; objects must not.** Without one, *"utensils read as 'the
//   kitchen', not 'washing up'"*. No machine can see motion in a bezier, so the marks that carry
//   it are DECLARED with `data-cue="motion"` and the drawing suite checks the declaration against
//   the registry's `kind`. Six chrome operators are acts; the thirteen values of a closed kernel
//   vocabulary — an order type, a channel, a tender — are categories, and a motorbike with speed
//   lines on a tile whose job is to say *which kind of order this is* is `27-F33`'s named failure
//   one direction over.
// - **The `27-F36` checklist was applied and it removed things.** No clock face (left-to-right
//   dials were misread where Urdu reads right-to-left) — which is why `aggregator_receivable` is
//   drawn as money held apart from the drawer rather than as money owed *later*. No house
//   outline (one read as *"a village hut"*), so `storefront` is an awning over a serving hatch
//   and not a building. No grid or matrix encoding. No colour realism — the drawings hold no
//   colour at all, see below. And no symbol denoting a specific INSTANCE: `whatsapp` is a message
//   bubble and `foodpanda` is the aggregator's tablet, because a trademark is an instance, and a
//   drawing of one teaches a brand rather than a category.
//
// COLOUR (`27-F14`, `27-F16`)
//
// Nothing here paints. `stroke="currentColor"` on the frame, `fill="none"`, no token lookup and
// no inline colour anywhere — the surface decides and the drawing inherits. `27-F16` is a BUDGET
// of three status colours and one interactive accent product-wide, and a symbol that spent one
// would spend it in the one place no token audit looks. It is also what makes these work inside
// `27-F19`'s dark KDS and `27-F67`'s training inversion, where the polarity flip is TOTAL.
//
// SIZE (`27-F42`, `27-F68`)
//
// The size is the type token's `lineHeight`, so a symbol occupies exactly the line box of the
// word beside it and the pair reads as one object. `27-F42` makes typography composite and warns
// against destructuring a size out of one; this takes a half and names which half and why, which
// is the honest position while the package's line-height debt is open. What it never does is
// take a NUMBER: `width={24}` renders 24 dp beside 64 dp money on the display scale and beside
// 14 dp text on the label scale, and `DEC-UI-001` exists to say that a dp is a physical size.
//
// THE VOCABULARY IS CAPPED AND THE CAP IS THE POINT (`27-F37`, `21 §5`)
//
// *"Chrome icons are capped at ~25 symbols product-wide and are absolutely stable."* Twenty is
// the whole set. Every entry cites a task id that resolves as a row in
// `plans/wave-1/role-task-inventories.md`, because a symbol costs a slot in a vocabulary someone
// who reads little learns once, and `21 §5` calls a surface with no role-and-task behind it
// feature tourism. Where a closed kernel vocabulary already exists the symbol takes its key
// VERBATIM — the five `ORDER_CHANNELS` and the five `PAYMENT_METHODS` — so a sixth tender lands
// in `domain` and reddens the set instead of leaving one tile in a row of six wordlessly blank.
//
// `hand_over` was in the briefed first cut and is deliberately absent: its only tasks are `C35`,
// which the inventory marks Wave 2, and a `served` transition nothing in this product emits. A
// symbol for a task nobody can perform still costs a permanently-learned slot.
//
// TWO THINGS A REVIEWER SHOULD CHECK BY EYE, BECAUSE NO TEST CAN
//
// 1. **`page_previous` and `page_next` are mirror images of each other, on purpose.** The
//    distinctness signature the suite computes is blind to a mirror, and here that is correct
//    rather than lucky: for this one pair the mirror IS the meaning, and drawing them differently
//    would be the defect. Every other pair in the set is a different picture.
// 2. **`raast` (a handheld phone with a note on its screen) and `foodpanda` (a tablet on a
//    stand) are both rectangular devices.** They are in different groups, are never co-displayed
//    — one is a tender, the other a channel — and each ships with its word. Recorded as the
//    sharpest `27-F34` candidate in the set for whoever runs the tap test.
//
// PROTECTED PATHS: none. `packages/ui` is not on commandment 10's list. `@restos/domain` is
// imported read-only, for its two closed vocabularies.

import type { ReactNode } from "react";
import { space, type TypeName, typography } from "../tokens/index";

/**
 * One grid for the whole set. Not a particular viewBox — a SHARED one: a set drawn on mixed
 * grids cannot hold a constant stroke weight or optical size across its members, which is the
 * property that makes twenty symbols read as one alphabet instead of twenty borrowings.
 */
const GRID = "0 0 24 24";

/**
 * Heavier than a typical 24-grid line (1.5) because of where these are read: `27-F9` measured a
 * 21.34% wet-hand gesture error at the pass against 0.00% dry, and `27 §1a` puts the cook at
 * 1–2 m from the glass. A hairline survives neither.
 */
const WEIGHT = 2;

export type IconGroup = "order-type" | "channel" | "payment" | "chrome";

/** `27-F33`'s classification, declared before it can be drawn against. */
export type IconKind = "object" | "action";

export type IconEntry = {
  group: IconGroup;
  kind: IconKind;
  /**
   * What the drawing SHOWS, in words. `27-F36` is a cultural-review checklist and a checklist
   * cannot be run against a bezier — it is run against a sentence. Required to exist, and
   * required to be unique: two symbols describing the same picture have failed `27-F34` before
   * anybody is shown them.
   */
  depicts: string;
  /** Rows in `plans/wave-1/role-task-inventories.md`. A symbol with none is feature tourism. */
  tasks: readonly string[];
  draw: ReactNode;
};

/**
 * The membership, pinned as a list, with the registry below keyed off it — so the two cannot
 * fork. A missing entry or a stray one is a TYPE error at `ICONS`, not a runtime surprise on a
 * counter where a lookup returns `undefined` mid-service.
 */
export const ICON_NAMES = [
  "dine_in",
  "takeaway",
  "delivery",
  "counter",
  "phone",
  "storefront",
  "whatsapp",
  "foodpanda",
  "cash",
  "card",
  "raast",
  "khata_credit",
  "aggregator_receivable",
  "sold_out",
  "done",
  "remove",
  "backspace",
  "clear",
  "page_previous",
  "page_next",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * The marks that carry an act, grouped so the declaration sits on the motion and not on the
 * thing being acted on. `27-F33`: an action drawn statically reads as a place.
 */
const Motion = ({ children }: { children: ReactNode }) => <g data-cue="motion">{children}</g>;

export const ICONS: Record<IconName, IconEntry> = {
  // ── ORDER TYPE (`02-F1`) ─────────────────────────────────────────────────────────────────
  // Three categories, chosen ~75x a shift on the counter's first row (C4). Objects: the tile
  // says WHICH KIND of order this is, never "go and deliver it".
  dine_in: {
    group: "order-type",
    kind: "object",
    // ⚠ REDRAWN AFTER LOOKING AT IT. The first draft put a trapezoid bowl and a tall glass on a
    // table line; rendered at 96 px it read as a park bench with a flag, because the bowl shared
    // an edge with the tabletop and the glass was thinner than the stroke could carry. A plate
    // seen at an angle with food domed on it, standing clear of the table, is the same idea with
    // nothing touching.
    depicts: "a plate of food standing on a table",
    tasks: ["C4"],
    draw: (
      <>
        <ellipse cx="12" cy="10" rx="6" ry="2" />
        <path d="M8 10 C8 7 16 7 16 10" />
        <path d="M3 13 L21 13" />
        <path d="M6 13 L6 20 M18 13 L18 20" />
      </>
    ),
  },
  takeaway: {
    group: "order-type",
    kind: "object",
    // ⚠ REDRAWN AFTER LOOKING AT IT, AND THIS IS THE ONE THAT WOULD HAVE SHIPPED WRONG. The
    // first draft — a bag tapering inwards, one fold line near the top, one arched handle over
    // it — rendered as a RUBBISH BIN. Every test passed: it is a line drawing, it is on the
    // grid, it carries four marks, it is nothing like its siblings. On the tile that starts a
    // takeaway order it would have said "throw it away". Straight sides and TWO handles are what
    // make a bag a bag; a lid arch over a taper is what makes a bin.
    depicts: "a carry bag with two handles and a folded top",
    tasks: ["C4"],
    draw: (
      <>
        <path d="M5 8 L19 8 L19 21 L5 21 Z" />
        <path d="M5 11 L19 11" />
        <path d="M7 8 C7 4 10 4 10 8" />
        <path d="M14 8 C14 4 17 4 17 8" />
      </>
    ),
  },
  delivery: {
    group: "order-type",
    kind: "object",
    // NO speed lines, and this is the entry `27-F33` was read hardest against: a motorbike in
    // motion is the instinctive drawing here and it turns a category into an instruction.
    depicts: "a motorbike carrying a rack over its rear wheel",
    tasks: ["C4"],
    draw: (
      <>
        <circle cx="5" cy="18" r="3" />
        <circle cx="19" cy="18" r="3" />
        <path d="M5 18 L9 13 L15 13 L19 18" />
        <path d="M15 13 L18 9 M16 9 L21 9" />
        <path d="M3 7 L10 7 L10 13 L3 13 Z" />
      </>
    ),
  },

  // ── CHANNEL (`02-F42`) ───────────────────────────────────────────────────────────────────
  // Every member of `ORDER_CHANNELS`, by its own key. A channel is a PRICE KEY (`01-F60`), so
  // the five are drawn as five places an order can come FROM — never as five acts.
  counter: {
    group: "channel",
    kind: "object",
    depicts: "a person standing behind a service counter",
    tasks: ["C4"],
    draw: (
      <>
        <circle cx="12" cy="5" r="3" />
        <path d="M7 13 C7 9 17 9 17 13" />
        <path d="M2 13 L22 13 L22 16 L2 16 Z" />
        <path d="M4 16 L4 21 L20 21 L20 16" />
      </>
    ),
  },
  phone: {
    group: "channel",
    kind: "object",
    // ⚠ REDRAWN THREE TIMES, EVERY TIME BECAUSE SOMEBODY LOOKED AT IT, AND NOT ONE OF THE THREE
    // WAS CAUGHT BY A TEST. Draft one put the handset bar inside the base and read as a printer.
    // Draft two raised it into a notched bridge with a round dial and read as a CASTLE — notches
    // for battlements, dial for a gate. Draft three tucked the cord against the base's right
    // edge, where it merged with the outline and turned the whole thing into a basket with a
    // handle. The cord is the mark no other object here has, so it hangs BELOW where nothing can
    // absorb it. **A drawing is a claim about what a person will see, and the only way to check
    // one is to look.**
    depicts: "a telephone with its handset and a hanging cord",
    tasks: ["C18"],
    draw: (
      <>
        <path d="M6 6 L18 6 L18 10 L6 10 Z" />
        <path d="M3 10 L21 10 L19 17 L5 17 Z" />
        <path d="M12 17 L12 20 C12 22 16 22 16 19" />
      </>
    ),
  },
  storefront: {
    group: "channel",
    kind: "object",
    // An awning over a hatch, NOT a building. `27-F36` records a house outline being read as
    // "a village hut" as a documented in-field failure.
    //
    // ⚠ REDRAWN AFTER LOOKING AT IT. A plain trapezoid over a box read as a printer. The
    // SCALLOPED valance is what makes an awning an awning — it is the one detail carrying the
    // whole meaning, which is `27-F32`'s "semi-abstract" cutting the other way: strip one mark
    // too many and the drawing stops being of anything.
    depicts: "a scalloped shop awning over a stall counter",
    tasks: ["C19"],
    draw: (
      <>
        <path d="M2 5 L22 5 L22 9 L2 9 Z" />
        <path d="M2 9 L6 13 L10 9 L14 13 L18 9 L22 13" />
        <path d="M5 17 L19 17" />
        <path d="M5 17 L5 21 M19 17 L19 21" />
      </>
    ),
  },
  whatsapp: {
    group: "channel",
    kind: "object",
    // The CATEGORY — a message that arrived — and not the mark of a company. `27-F36`'s last
    // clause bans a symbol that must denote a specific instance, and a trademark is one.
    depicts: "a chat bubble carrying two lines of a message",
    tasks: ["C19"],
    draw: (
      <>
        <path d="M3 4 L21 4 L21 15 L10 15 L5 20 L5 15 L3 15 Z" />
        <path d="M7 8 L17 8" />
        <path d="M7 11 L14 11" />
      </>
    ),
  },
  foodpanda: {
    group: "channel",
    kind: "object",
    // The object actually in the room: `C21` is "the order shouted from the aggregator tablet".
    // LANDSCAPE, and the orientation is doing real work: `raast` is a portrait handheld and this
    // is a wide tablet on a stand. Drawn portrait, the two were the same rectangle twice — see
    // the note at the head of this file, which keeps them on the `27-F34` watch list even now.
    depicts: "an aggregator tablet propped upright on a stand",
    tasks: ["C21"],
    draw: (
      <>
        <path d="M3 4 L21 4 L21 16 L3 16 Z" />
        <path d="M6 7 L18 7 L18 13 L6 13 Z" />
        <path d="M12 16 L12 20" />
        <path d="M8 20 L16 20" />
      </>
    ),
  },

  // ── PAYMENT (`02-F12`) ───────────────────────────────────────────────────────────────────
  // Every member of `PAYMENT_METHODS`, by its own key. `27-F34` bites hardest here: five tiles
  // side by side on the highest-consequence surface on the counter, and the one with no symbol
  // among four that have one is the row a non-reader cannot identify at all.
  cash: {
    group: "payment",
    kind: "object",
    depicts: "a banknote with a printed oval at its centre",
    tasks: ["C11"],
    draw: (
      <>
        <path d="M2 6 L22 6 L22 18 L2 18 Z" />
        <ellipse cx="12" cy="12" rx="4" ry="3" />
        <path d="M5 9 L5 15 M19 9 L19 15" />
      </>
    ),
  },
  card: {
    group: "payment",
    kind: "object",
    depicts: "a bank card with a magnetic band and a chip",
    tasks: ["C11"],
    draw: (
      <>
        <path d="M2 5 L22 5 L22 19 L2 19 Z" />
        <path d="M2 9 L22 9" />
        <path d="M5 12 L10 12 L10 16 L5 16 Z" />
      </>
    ),
  },
  raast: {
    group: "payment",
    kind: "object",
    // The note on the screen is drawn with the SAME rectangle-and-oval idiom `cash` and
    // `aggregator_receivable` use, on purpose: within the payment group that pairing means
    // money, and a set that says one thing one way three times is a set with an alphabet.
    depicts: "a handheld phone with a banknote on its screen",
    tasks: ["C12"],
    draw: (
      <>
        <path d="M7 2 L17 2 L17 22 L7 22 Z" />
        <path d="M10 5 L14 5" />
        <path d="M9 9 L15 9 L15 15 L9 15 Z" />
        <ellipse cx="12" cy="12" rx="2" ry="1" />
        <path d="M10 19 L14 19" />
      </>
    ),
  },
  khata_credit: {
    group: "payment",
    kind: "object",
    // The most local symbol in the set, and the one most likely to survive the gate on its own:
    // the bound credit register every shop in this market already keeps.
    depicts: "a bound credit register with ruled entry lines",
    tasks: ["C13"],
    draw: (
      <>
        <path d="M4 3 L20 3 L20 21 L4 21 Z" />
        <path d="M7 3 L7 21" />
        <path d="M10 8 L17 8 M10 12 L17 12 M10 16 L17 16" />
      </>
    ),
  },
  aggregator_receivable: {
    group: "payment",
    kind: "object",
    // `C33` is what earns this a symbol: the cashier never taps it as a tender, but shift close
    // shows one numeric field per method, and a row with no symbol beside four that have one is
    // the row she cannot name. Money held APART from the drawer — no clock, per `27-F36`.
    depicts: "a banknote held apart from the cash drawer",
    tasks: ["C33"],
    draw: (
      <>
        <path d="M3 13 L21 13 L21 20 L3 20 Z" />
        <path d="M10 16 L14 16" />
        <path d="M6 3 L18 3 L18 9 L6 9 Z" />
        <ellipse cx="12" cy="6" rx="3" ry="2" />
      </>
    ),
  },

  // ── CHROME ──────────────────────────────────────────────────────────────────────────────
  sold_out: {
    group: "chrome",
    // OBJECT, and the reading is stated because the corpus supports two. `02-F7` is a control
    // the cashier presses (`C22`) and `01-F59` is a STATE the catalog entry carries; what this
    // symbol has to SAY is *this dish is finished*, which is a fact about the dish. The act of
    // marking it is a button whose word says so. Drawn as a state, it takes no motion cue —
    // `27-F33`'s named failure is the other direction, an act drawn as a place.
    kind: "object",
    // ⚠ REDRAWN AFTER LOOKING AT IT. The first draft — a curved karahi body, a rim line, two
    // circular handles and a diagonal — rendered as a BOW TIE. The handles collided with the
    // rim, the curve read as ribbon and the diagonal knotted it. A covered pot struck through
    // has no curves to misread and the lid says "cooked dish" on its own.
    depicts: "a covered cooking pot struck through",
    tasks: ["C22", "K6"],
    draw: (
      <>
        <path d="M5 11 L19 11 L17 19 L7 19 Z" />
        <path d="M3 11 L21 11" />
        <path d="M12 11 L12 7" />
        <path d="M4 20 L20 4" />
      </>
    ),
  },
  done: {
    group: "chrome",
    kind: "action",
    depicts: "a kitchen chit with a tick swept across it",
    tasks: ["K3", "C32"],
    draw: (
      <>
        <path d="M5 2 L19 2 L19 20 L5 20 Z" />
        <path d="M8 7 L16 7" />
        <Motion>
          <path d="M8 13 L11 16 L17 9" />
          <path d="M5 11 L7 13" />
        </Motion>
      </>
    ),
  },
  remove: {
    group: "chrome",
    kind: "action",
    depicts: "one order line taken off, crossed out",
    tasks: ["C8"],
    draw: (
      <>
        <path d="M3 7 L21 7 L21 15 L3 15 Z" />
        <Motion>
          <path d="M8 9 L16 13" />
          <path d="M16 9 L8 13" />
        </Motion>
      </>
    ),
  },
  backspace: {
    group: "chrome",
    kind: "action",
    // ONE digit pulled back, against `clear`'s whole field. The pair sits on adjacent keys of
    // one pad, which is exactly where `27-F34` says a set collapses if it is going to.
    depicts: "the last typed digit pulled back off the entry",
    tasks: ["C1", "C11"],
    draw: (
      <>
        <path d="M11 5 L21 5 L21 19 L11 19 Z" />
        <path d="M15 9 L15 15" />
        <Motion>
          <path d="M11 5 L4 12 L11 19" />
          <path d="M2 12 L6 12" />
        </Motion>
      </>
    ),
  },
  clear: {
    group: "chrome",
    kind: "action",
    // ⚠ THE TRAILS WERE ON THE WRONG SIDE in the first draft — drawn ahead of the block rather
    // than behind it, so they read as two more lines of content in the field instead of as
    // motion. A speed line trails the direction of travel; this one sweeps left, so they sit to
    // its right. `27-F33` is why the mark exists at all, and a cue pointing the wrong way is a
    // static drawing with a `data-cue` attribute on it — which the suite cannot tell apart.
    depicts: "the whole entry field wiped by a passing block",
    tasks: ["C1", "C11"],
    draw: (
      <>
        <path d="M3 5 L21 5 L21 19 L3 19 Z" />
        <Motion>
          <path d="M5 8 L9 8 L9 16 L5 16 Z" />
          <path d="M10 10 L19 10 M10 12 L17 12 M10 14 L15 14" />
        </Motion>
      </>
    ),
  },
  page_previous: {
    group: "chrome",
    kind: "action",
    depicts: "the previous page arriving from the left",
    tasks: ["C6", "C31"],
    draw: (
      <>
        <path d="M10 4 L21 4 L21 20 L10 20 Z" />
        <path d="M13 9 L18 9" />
        <Motion>
          <path d="M7 8 L3 12 L7 16" />
          <path d="M8 12 L2 12" />
        </Motion>
      </>
    ),
  },
  page_next: {
    group: "chrome",
    kind: "action",
    depicts: "the next page arriving from the right",
    tasks: ["C6", "C31"],
    draw: (
      <>
        <path d="M3 4 L14 4 L14 20 L3 20 Z" />
        <path d="M6 9 L11 9" />
        <Motion>
          <path d="M17 8 L21 12 L17 16" />
          <path d="M16 12 L22 12" />
        </Motion>
      </>
    ),
  },
};

export type IconProps = {
  name: IconName;
  /**
   * `27-F42` — the icon is sized against a TYPE token and never against a number, because the
   * word it accompanies is sized that way and the pair has to stay one object.
   */
  size: TypeName;
};

/**
 * ⚠ **NOT EXPORTED FROM `packages/ui`'s BARREL, AND THAT IS THE `27-F35` PROTECTION.**
 *
 * A pictogram with no word is the one outcome that would make this vocabulary worse than no
 * vocabulary while the comprehension gate is unrun. A prop that suppressed the word would be the
 * obvious hazard and there is none; the subtler one is a component that renders the picture ALONE
 * being reachable from app code at all, so it is not. Inside this package `IconLabel` is its only
 * caller, and a second caller here needs the same argument made again.
 *
 * It is DECORATIVE by construction — `aria-hidden`, no accessible name, no `<title>`, no
 * `role="img"`. The idiomatic accessible-icon pattern is exactly wrong here: it would make the
 * unvalidated pictogram a NAME, and it would do it in a way that reads as an improvement.
 */
export const Icon = ({ name, size }: IconProps) => {
  const px = typography[size].lineHeight;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={GRID}
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={WEIGHT}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name].draw}
    </svg>
  );
};

/**
 * **THE SYMBOL IS BIGGER THAN ITS WORD, AND THE NUMBER CAME OFF A SCREENSHOT.**
 *
 * The first build sized the drawing at the word's own step. On `27 §1a`'s reference counter panel
 * — 1366×768 on 15.6″, ~100 PPI — `27-F8`'s 76 dp tile renders at ~48 CSS px, so a `text-label`
 * symbol lands at **12 CSS px, 3.2 mm of glass**. Photographed at that size the set is a row of
 * smudges: the awning's valance, the telephone's cord and the chip on the card are all gone. The
 * suites cannot see this (happy-dom performs no layout) and neither can `pnpm layout:check`,
 * which measures whether a control FITS and never whether it can be READ.
 *
 * `21 §5` asks for *"icons + numbers dominant, minimal words"*, and a symbol 20 dp tall beside a
 * 14 dp word is not dominant by any reading. So the pairing takes **two whole tokens** — one for
 * the word, one for the symbol, ONE STEP APART on the scale — which is `27-F42` honoured rather
 * than dodged: nothing here assembles a size, and a step-to-step ladder is the same shape as
 * `TenderPanel`'s own `CHANGE_SIZE`.
 *
 * ⚠ **ONE STEP, BECAUSE TWO WAS MEASURED AND REFUSED.** The draft that landed here first jumped
 * `text-label` straight to `text-numeric-primary` — 36 dp, 5.7 mm — on the arithmetic that a
 * counter tile is 76 dp holding ~41 dp of content. It fits that tile and `pnpm layout:check`
 * still **failed**: `[tablet-10.1 caller] OVERFLOW y — 571px of content in a 567px box`, a NEW
 * violation on `27 §1a`'s tightest panel, where the two icon rows sit above the `02-F27` caller
 * pad and 4 px is all the slack there is. One step up is 24 dp / 3.8 mm, clears every panel, and
 * is the largest this scale offers below the number the rail refused.
 *
 * ⚠ **AND IT IS STILL A SIZE FOR THE UNRUN GATE TO CONFIRM, NOT A FINDING.** `27-F35` is
 * measured on real staff. If they cannot name a symbol at 3.8 mm the answer is a simpler
 * drawing or a different one — never a bigger number, because the rail has already said where
 * the ceiling is on the panel that matters.
 */
const SYMBOL_STEP: Record<TypeName, TypeName> = {
  "text-label": "text-body",
  "text-body": "text-numeric-primary",
  "text-numeric-primary": "text-numeric-hero",
  "text-numeric-hero": "text-numeric-display",
  "text-numeric-display": "text-numeric-display",
};

export type IconLabelProps = {
  name: IconName;
  /** The word. `27-F5` wants a labelled target; `21 §5` wants minimal words, never zero. */
  label: string;
  size: TypeName;
};

/**
 * A symbol and its word, as one target. **This is the whole vocabulary's public surface.**
 *
 * `00 §5.6` puts the low-literacy load on *"the doc-21 stable-layout and icon+number laws"* — the
 * stable layout ships and the numerals ship, and this is the third leg. It adds a preattentive
 * channel to a control that already had a readable one; it replaces nothing.
 */
export const IconLabel = ({ name, label, size }: IconLabelProps) => {
  if (label.trim().length === 0) {
    // `TOKENS.md`'s `must()` sets the precedent: fail loudly at the point of use rather than
    // render something subtly wrong. A blank label is a pictogram travelling alone, reached by a
    // compact layout buying back 40 dp or by a call site that has "obviously" already said the
    // word one row up. The message names the gate so the reader lands on `27-F35`, not on a
    // stack trace.
    throw new Error(
      `<IconLabel name="${name}"> was given no word. 27-F35's comprehension gate has not been run, so a symbol never carries the meaning alone.`,
    );
  }
  const t = typography[size];
  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space["space-1"],
      }}
    >
      <Icon name={name} size={SYMBOL_STEP[size]} />
      {/*
        **`fontWeight` IS DELIBERATELY ABSENT, and it is the one half of the composite this takes
        a decision about.** `27-F42` warns against destructuring a SIZE out of a token and this
        takes family, size and tracking whole; weight is left to the surrounding control because
        three surfaces in this package already mark *this one is chosen* by stepping it — the tab
        rail, the tender method row and `Tile.selected`. A pairing that pinned its own weight
        would retire that signal at every call site, silently, which is exactly the shape of
        defect this wave keeps finding. The container owns weight; the pairing owns the rest.
      */}
      <span
        style={{
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          letterSpacing: t.letterSpacing,
        }}
      >
        {label}
      </span>
    </span>
  );
};
