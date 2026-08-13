// ACCEPTANCE TESTS — `03-F55`, the ADDENDUM MARKER on the kitchen chit.
//
// Authored from spec text ONLY (`24 §3` step 2; read-only to the implementing session). No
// implementation of `03-F55` was read, because none exists — the FR landed first (commandment 9)
// and this file was written from it.
//
// ⚠ **`packages/escpos` IS A PROTECTED PATH (`20 §4.4`, commandment 10).** The change these
// assertions ask for is one field on `KotData` and one band in the shipped `kot` spec. It needs
// SENIOR REVIEW, and this header is where that is said loudly rather than in a commit message.
//
// THE SPEC TEXT THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   03-F55 "The chit says WHICH addendum it is, in a locked region, and no profile can switch it
//          off … It takes the document's ONE banner (`27-F56`), and where the same chit is also a
//          reprint the two share that band rather than taking two … The band carries the word and
//          the ordinal in Western numerals (`00 §5.6`): `ADDED 2`, and `REPRINT ADDED 2` when it is
//          both. `KotData` gains **exactly one field** for this — the ordinal, `0` on the chit that
//          opened the station and `n ≥ 1` on the nth addition — and no other."
//   03-F55 "The ordinal is on the paper because the content is not enough to tell two additions
//          apart" — the two-naan case, which is the whole reason the number is there.
//   03-F55 "No new event type, no new state, no new document type … an addendum differs from a KOT
//          in none of the ways `03-F31` makes a TYPE."
//   03-F32 "a `kot` renders no money token under any profile"; "Type invariants override
//          configuration … enforced STRUCTURALLY — the profile schema has no slot id addressing
//          them — not by a runtime check on a value the owner supplied."
//   03-F37 "Reprint markers are mandatory per type, **in a locked region**."
//   03-F49 `kot` declares 42 columns; below it the document is REFUSED, never squeezed.
//   03-F30 render is PURE: "identical `(spec, profile, data, caps)` must produce byte-identical
//          output".
//   27-F56 "at most ONE per document (`CANCEL`, `VOID`, `REPRINT`) … A ticket that uses inversion
//          twice has used it zero times."
//
// ── NO HARDWARE IS INVOLVED. NOT ONE ASSERTION BELOW OBSERVED A PRINTER. ──
//
// Every assertion is about a `Uint8Array` a pure function returned. K-8 — the physical pass — is
// owed in full, and `27-F35`'s ≥85% comprehension gate on real staff is what would actually decide
// whether a cook can read the word `ADDED`. `03-F55` says so about itself; nothing here may be read
// as evidence that this band works in a kitchen.

import { describe, expect, it } from "vitest";
import { DOCUMENT_SPECS, encode, MIN_COLUMNS, printerCapability, render } from "../index.js";

const spec = DOCUMENT_SPECS.kot;
if (spec === undefined) throw new Error("@restos/escpos ships no `kot` DocumentSpec (03-F30)");

/** `03 §7` layer 3: a TH230 reports 44 Font-A columns, comfortably over `03-F49`'s 42. */
const CAPS = printerCapability("TH230");
/** `03-F49`'s own worked example: a 58 mm printer reports 32 and cannot print a KOT. */
const NARROW = printerCapability("BC-58U");

/**
 * The chit under test, with NO removal modifier anywhere.
 *
 * That absence is load-bearing rather than tidy: `27-F59`'s removal marker is the OTHER inverted
 * scope, so a fixture carrying one would make "how many inverted runs are in these bytes"
 * un-attributable — the instrument below would count a modifier marker as a banner and the
 * `27-F56` assertions would pass or fail for the wrong reason.
 */
const base = {
  ticket_no: "5f3a9c21",
  table: "T4",
  station: "TANDOOR",
  branch_created_at: 1_754_300_000_000,
  reprint: false,
  lines: [{ quantity: 1, name: "Garlic Naan", modifiers: [] }],
};

/**
 * `render`'s `data` parameter is typed `unknown` (`03-F30`: the TYPE owns its contract and the cast
 * is at the type's own boundary), so this file can name `03-F55`'s field before `KotData` declares
 * it. That is deliberate: an acceptance suite that could not be written until the contract existed
 * would be written by the implementing session, which is the split `24 §3` exists to prevent.
 */
const chit = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...base,
  ...over,
});

const bytesOf = (data: Record<string, unknown>, caps = CAPS): Uint8Array => {
  const result = render(spec, {}, data, caps);
  if (!result.ok) throw new Error(`fixture does not render: ${result.reason}`);
  return result.bytes;
};

// ── THE INSTRUMENT, AND ITS CALIBRATION ──────────────────────────────────────────────────────
//
// Every `27-F56` assertion below is a count of INVERTED RUNS in the byte stream, so the walker has
// to be right or the whole file is decoration. K-2's own rule for its ESC/POS walker, inherited:
// an instrument nobody calibrated is worth nothing, and §0 below calibrates this one against
// `encode()` directly rather than against its own expectations.

/**
 * The text of each inverted run, in order.
 *
 * `GS B 1` opens a run and `GS B 0` closes it; `ESC`/`GS` commands inside a run are skipped rather
 * than decoded, because a two-line band legitimately carries an `ESC d n` feed inside it (the
 * encoder's own rule: "a banner continued across a feed is ONE band").
 */
const invertedRuns = (bytes: Uint8Array): string[] => {
  const runs: string[] = [];
  let open: string | null = null;
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] as number;
    if (b === 0x1d) {
      // `GS B n` is the only three-byte GS command whose payload this walker reads; `GS ! n` and
      // `GS V m` are the same length and are skipped whole.
      if (bytes[i + 1] === 0x42) {
        if (bytes[i + 2] === 0x01) {
          if (open === null) open = "";
        } else if (open !== null) {
          runs.push(open);
          open = null;
        }
      }
      i += 3;
      continue;
    }
    if (b === 0x1b) {
      // `ESC @` is two bytes; `ESC d n` is three.
      i += bytes[i + 1] === 0x40 ? 2 : 3;
      continue;
    }
    if (open !== null && b >= 0x20 && b < 0x7f) open += String.fromCharCode(b);
    i += 1;
  }
  if (open !== null) runs.push(open);
  return runs;
};

/** Every printable byte, so a "this word is nowhere on the paper" claim can be made at all. */
const decode = (bytes: Uint8Array): string =>
  [...bytes].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : " ")).join("");

describe("§0 — the instrument, calibrated against the encoder rather than against itself", () => {
  it("reads ONE run out of one banner, and its text", () => {
    const out = encode(
      [
        { kind: "text", value: "BANNER", ink: "inverted", scope: "banner" },
        { kind: "feed", lines: 1 },
        { kind: "text", value: "body", ink: "normal" },
      ],
      CAPS,
    );
    if (!out.ok) throw new Error(`calibration document does not encode: ${out.reason}`);
    expect(invertedRuns(out.bytes)).toEqual(["BANNER"]);
  });

  it("reads NO run out of a document with no inversion — the control", () => {
    const out = encode([{ kind: "text", value: "body", ink: "normal" }], CAPS);
    if (!out.ok) throw new Error("calibration document does not encode");
    expect(invertedRuns(out.bytes)).toEqual([]);
  });

  it("does not mistake a 2×2 size command for a band, and reads a run that spans a feed", () => {
    // Both are real shapes in the shipped `kot`: `GS ! n` sits beside the ticket number, and
    // `27-F56`'s ruling makes a band that continues past a feed ONE band.
    const out = encode(
      [
        { kind: "text", value: "A", ink: "inverted", scope: "banner" },
        { kind: "feed", lines: 1 },
        { kind: "text", value: "B", ink: "inverted", scope: "banner" },
        { kind: "feed", lines: 1 },
        { kind: "text", value: "142", ink: "size_2x2" },
      ],
      CAPS,
    );
    if (!out.ok) throw new Error(`calibration document does not encode: ${out.reason}`);
    const runs = invertedRuns(out.bytes);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain("A");
    expect(runs[0]).toContain("B");
  });
});

// ── §A — the marker is ON THE PAPER, and it carries the ORDINAL ──────────────────────────────

describe("03-F55 — the chit says which addendum it is", () => {
  it("the opening chit carries NO addendum band — the control", () => {
    // `03-F55`: "the ordinal, `0` on the chit that opened the station". Without this the whole
    // suite is satisfiable by a band printed on every ticket, which would put `ADDED` on the
    // ordinary KOT the kitchen sees three hundred times a shift.
    const runs = invertedRuns(bytesOf(chit({ addendum: 0 })));
    expect(runs).toEqual([]);
    expect(decode(bytesOf(chit({ addendum: 0 })))).not.toContain("ADDED");
  });

  it("an addendum carries exactly ONE inverted band, and the word is on it", () => {
    const runs = invertedRuns(bytesOf(chit({ addendum: 1 })));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain("ADDED");
  });

  it("the ORDINAL is on the band, and a second addition does not read like the first", () => {
    // `03-F55`'s stated reason: "A family that asks for one naan and then, five minutes later, one
    // more naan produces two chits with identical bodies." The bodies below ARE identical — the
    // fixture varies nothing but the ordinal — so a cook can only tell them apart by this number.
    //
    // This is also the `K-4` lesson at the document layer: a suite that never varies the field it
    // is about is passed by an implementation that ignores the field. `ADDED 1` hard-coded into
    // the band renderer passes every other assertion in this section and fails this one.
    const first = invertedRuns(bytesOf(chit({ addendum: 1 })));
    const second = invertedRuns(bytesOf(chit({ addendum: 2 })));
    expect(first[0]).toContain("1");
    expect(second[0]).toContain("2");
    expect(second[0]).not.toContain("1");
    expect(bytesOf(chit({ addendum: 2 }))).not.toEqual(bytesOf(chit({ addendum: 1 })));
  });

  it("an addendum's bytes differ from the opening chit's for the SAME lines", () => {
    // The failure this stops is the quiet one: an implementation that threads the ordinal all the
    // way to `render()` and drops it in the last function still puts the naan in the kitchen, and
    // the cook has no way to know it is not a duplicate of the chit in his hand.
    expect(bytesOf(chit({ addendum: 1 }))).not.toEqual(bytesOf(chit({ addendum: 0 })));
  });
});

// ── §B — 27-F56: ONE banner, even when the chit is also a reprint ─────────────────────────────

describe("27-F56 — a ticket that uses inversion twice has used it zero times", () => {
  it("a REPRINTED addendum still RENDERS — it is not refused for spending two banners", () => {
    // The catastrophic shape, and it is reachable rather than theoretical: `encode()` already
    // enforces the budget and answers `banner_budget_exceeded`, which `03-F34` turns into a hard
    // refusal — so an implementation that adds a SECOND banner block prints NOTHING AT ALL for a
    // reprinted addendum, which is this FR's own defect arriving through the fix for it.
    const result = render(spec, {}, chit({ addendum: 2, reprint: true }), CAPS);
    expect(result.ok, result.ok ? "" : `refused: ${result.reason}`).toBe(true);
  });

  it("a REPRINTED addendum carries ONE band naming both facts", () => {
    // `03-F55`: "where the same chit is also a reprint the two share that band rather than taking
    // two". Both words, one run — a cook must not be told it is a reprint and left guessing that
    // it is only part of the order, nor the reverse.
    const runs = invertedRuns(bytesOf(chit({ addendum: 2, reprint: true })));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain("REPRINT");
    expect(runs[0]).toContain("ADDED");
    expect(runs[0]).toContain("2");
  });

  it("a reprint of an OPENING chit is unchanged by this FR — the control", () => {
    // The one-branch control for the assertion above: with `addendum: 0` the band must say REPRINT
    // and must NOT say ADDED. Without this, an implementation that always prints both words passes
    // the two assertions above and puts `ADDED` on every reprinted ordinary KOT.
    const runs = invertedRuns(bytesOf(chit({ addendum: 0, reprint: true })));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toContain("REPRINT");
    expect(runs[0]).not.toContain("ADDED");
  });
});

// ── §C — 03-F37/03-F32: mandatory, locked, and unreachable from a profile ─────────────────────

describe("03-F32/03-F37 — the marker is not configuration", () => {
  it("no slot the spec declares can suppress the band — swept over EVERY declared slot", () => {
    // `03-F32`: "enforced STRUCTURALLY — the profile schema has no slot id addressing them". Swept
    // rather than spot-checked, so a slot added by a later FR is covered the day it lands: for
    // every slot the spec declares, a hostile value must leave the band standing.
    const slots = spec.blocks.flatMap((block) => block.slots.map((slot) => slot.slot_id));
    expect(
      slots.length,
      "the kot spec declares no slots at all — 03-F30's profile layer is unreachable",
    ).toBeGreaterThan(0);
    for (const slot_id of slots) {
      for (const value of ["", " ", "ADDED 0", "REPRINT"]) {
        const result = render(spec, { [slot_id]: value }, chit({ addendum: 3 }), CAPS);
        if (!result.ok) throw new Error(`profile {${slot_id}} refused: ${result.reason}`);
        const runs = invertedRuns(result.bytes);
        expect(runs, `slot ${slot_id} = ${JSON.stringify(value)}`).toHaveLength(1);
        expect(runs[0], `slot ${slot_id} = ${JSON.stringify(value)}`).toContain("ADDED");
      }
    }
  });

  it("the band sits in a LOCKED region", () => {
    // `03-F37`: "in a locked region". Read off the spec rather than off the bytes, because that is
    // where `03-F33` makes it true: an owner-region block is where owner content is legal, so a
    // marker declared there is one an owner may write over.
    const result = render(spec, {}, chit({ addendum: 1 }), CAPS);
    if (!result.ok) throw new Error(`does not render: ${result.reason}`);
    const banded = result.blocks.filter((block) =>
      block.parts.some((part) => part.kind === "text" && part.ink === "inverted"),
    );
    expect(banded).toHaveLength(1);
    expect(["HEAD_LOCKED", "TAIL_LOCKED"]).toContain(banded[0]?.region);
  });
});

// ── §D — what this FR must NOT have changed ──────────────────────────────────────────────────

describe("03-F55 — an addendum is a KOT in every other respect", () => {
  it("03-F49 — the column floor is untouched, in both directions", () => {
    // The floor is READ from the shipped constant rather than typed, so a change to `03-F49` moves
    // this assertion with it instead of leaving it defending the old number (the `catalog-pricing`
    // lesson: a green test defending an overruled rule).
    expect(spec.min_columns).toBe(MIN_COLUMNS.kot);
    // It still renders on a printer that clears the floor …
    expect(render(spec, {}, chit({ addendum: 1 }), CAPS).ok).toBe(true);
    // … and is still REFUSED below it, rather than squeezed. A band added to the head is exactly
    // the kind of change that tempts an implementation to widen the floor to make room.
    const narrow = render(spec, {}, chit({ addendum: 1 }), NARROW);
    expect(narrow.ok).toBe(false);
    expect(narrow.ok === false ? narrow.reason : null).toBe("min_columns_not_met");
  });

  it("03-F32 — an addendum carries no money token", () => {
    // The KOT's own invariant, re-asserted on the new shape rather than assumed to survive it:
    // `03-F32` is structural, and a band renderer handed the whole `KotData` is a place a price
    // could newly appear.
    const text = decode(bytesOf(chit({ addendum: 2 })));
    expect(text).not.toContain("Rs");
    expect(text).not.toMatch(/\d+\.\d{2}/);
  });

  it("03-F30 — render stays PURE across the new field", () => {
    expect(bytesOf(chit({ addendum: 2 }))).toEqual(bytesOf(chit({ addendum: 2 })));
  });

  it("the lines it was given are the lines on the paper", () => {
    // `03-F55` puts "exactly the lines … not yet committed" on the chit and the document layer must
    // not add or drop any: an addendum showing the whole order is the double-cook this FR exists to
    // prevent, arriving one layer below the one that decides which lines to send.
    const text = decode(
      bytesOf(chit({ addendum: 1, lines: [{ quantity: 3, name: "Garlic Naan", modifiers: [] }] })),
    );
    expect(text).toContain("Garlic Naan");
    expect(text).toContain("3");
    expect(text).not.toContain("Chicken Karahi");
  });
});

// ── DEFERRED — what this file could NOT assert, and who owns it ───────────────────────────────
//
// * **K-8, the physical pass.** No printer has printed an addendum. Nothing here is evidence about
//   paper, and `03-F55` says so about itself.
// * **`27-F35`'s ≥85% comprehension gate.** Whether a cook who reads little English understands
//   `ADDED 2` is a measurement on real staff that this FR explicitly does not discharge. The same
//   is true of `REPRINT`, which has shipped unmeasured since K-5.
// * **The exact WORDING.** The assertions above require the word and the ordinal to be on the band
//   and require two ordinals to differ; they deliberately do not pin the spacing or the order of
//   the two words, because `27-F35` is what should decide those and no test can stand in for it.
// * **Where the band sits relative to `27-F58`'s reading order.** `27-F58` fixes identifier →
//   timing → items → modifiers → notes and says nothing about a banner's position; `kot-document.
//   test.ts` owns that layout question and was not edited here.
