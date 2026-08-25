// `02-F45` — THE EXIT RULE EXISTS IN TWO PLACES BECAUSE THE PLANE BOUNDARY FORCES IT, AND THIS
// FILE IS THE ONLY THING THAT MAKES THEM AGREE.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored by the session that exported
// `lineExited`, which is NOT the `24 §3` split (`20 §4.3` as amended by **R66**). It adds no
// production code and pins no new policy — it asserts that two existing renderings of one rule
// answer identically.
//
// ── WHY THERE ARE TWO, AND WHY THIS IS NOT A DUPLICATION TO DELETE ──────────────────────────────
//
// `01-F30`'s "exited lines excluded" is fold logic and `26 §8` puts it in `packages/sync-client`;
// `lineExited` is that one declaration and both PRINTERS now call it. The renderer cannot: `18 §9`
// gives it no Node access and commandment 5 keeps it on the other side of the IPC bridge, so
// `Counter.tsx`'s `offBillWord` — which decides whether a cart row reads `VOIDED  Rs 0` — has to
// restate the shape. Its own comment says so: *"This function tests the SAME shape, so the word
// and the `Rs 0` printed beside it are two renderings of one decision and cannot disagree."*
//
// **"Cannot disagree" was a claim in prose with nothing behind it (`L11`).** A test may cross the
// plane boundary where production code may not, so the claim is now checkable: the two are driven
// over the same state sets and required to answer the same way. If `01 §4`'s exit vocabulary ever
// grows, this file fails on the side that was not updated instead of a voided line quietly
// printing `Rs 0` on the glass while the kitchen cooks it — which is the exact pair of documents
// the August 2026 round found disagreeing.
//
// ⚠ **THE SWEEP IS BOUNDED BY `ORDER_LINE_STATES` AND ITS FIRST MUTANT SURVIVED BECAUSE OF IT.**
// A mutant adding a state to `merge.ts`'s `EXITED` set that is NOT in `01 §4`'s vocabulary passed
// all 1,517 tests here, because no cell this sweep constructs ever carries it — the round-3 shape
// (`L10`) reproduced inside the guard written for it. The same mutant using a state that IS in the
// vocabulary (`served`) reds this file and **nothing else in this package**, which is the
// attribution: it is the only thing on the renderer's side of the plane that can see the fold
// widen. Recorded rather than fixed, because widening the sweep past `01 §4` would be asserting
// against states no fold can project.
//
// THE FRs: `01 §4` (the exit states), `01-F30` (exited lines excluded), `01-F31` (a contested set
// is retained whole and nothing picks a winner), `01-F35` (terminal states), `02-F45` (one fact,
// one source), `18 §9` / commandment 5 (the plane boundary that forces the second rendering),
// `26 §8` (fold logic is never reimplemented outside `packages/sync-client`).

import { ORDER_LINE_STATES } from "@restos/domain";
import { lineExited } from "@restos/sync-client";
import { describe, expect, it } from "vitest";
import { offBillWord } from "./Counter";

/** Every single-state cell, plus every two-state pair — `01-F31`'s contested sets included. */
const stateSets = (): string[][] => {
  const singles = ORDER_LINE_STATES.map((state) => [state as string]);
  const pairs: string[][] = [];
  for (const a of ORDER_LINE_STATES) {
    for (const b of ORDER_LINE_STATES) {
      if (a !== b) pairs.push([a as string, b as string]);
    }
  }
  return [[], ...singles, ...pairs];
};

describe("02-F45 — the cart's off-bill word and the fold's exit predicate answer identically", () => {
  it("over every single state and every contested pair `01 §4` can produce", () => {
    const disagreements: string[] = [];
    for (const states of stateSets()) {
      const cart = offBillWord(states) !== undefined;
      const fold = lineExited({ states });
      if (cart !== fold) disagreements.push(`${JSON.stringify(states)}: cart=${cart} fold=${fold}`);
    }
    expect(
      disagreements,
      "the glass and the paper would disagree about which lines left the order",
    ).toEqual([]);
  });

  it("and the sweep is not vacuous — it contains both answers", () => {
    // `24-F14`'s empty-match protection, applied to a comparison rather than to a match: an
    // agreement that is only ever `false === false` proves nothing about the exits, and a
    // vocabulary change that emptied `ORDER_LINE_STATES` would silently make this file inert.
    const answers = stateSets().map((states) => lineExited({ states }));
    expect(answers.some((a) => a)).toBe(true);
    expect(answers.some((a) => !a)).toBe(true);
    expect(stateSets().length).toBeGreaterThan(ORDER_LINE_STATES.length);
  });

  it("01-F31: a contested pair containing an exit is off-bill on NEITHER side", () => {
    // The dangerous case, named rather than left to the sweep: `CONTESTED_LINE_BILLABLE` is
    // ratified TRUE, so such a line is still billed in full. A cart saying `VOIDED` over it, or a
    // chit dropping it, would be one device picking a winner out of a set the fold deliberately
    // retained whole.
    expect(offBillWord(["served", "voided"])).toBeUndefined();
    expect(lineExited({ states: ["served", "voided"] })).toBe(false);
  });
});
