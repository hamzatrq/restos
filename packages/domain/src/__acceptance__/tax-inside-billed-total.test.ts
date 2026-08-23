/**
 * ACCEPTANCE TESTS — `01-F82`: TAX IS INSIDE `billed_total`, and that changes what the word means.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** This file was written by a session that read
 * `specs/01-kernel-sync.md` (`01-F1`, `01-F18`, `01-F30`, `01-F34`, `01-F53`, `01-F63`, `01-F82`),
 * `specs/16-tax-fiscalization.md` (`16-F1`, `16-F2`, `16-F5`) and `specs/DECISIONS.md`
 * (`DEC-MONEY-005`, `DEC-MONEY-010`) and did **not** write the implementation it describes. It is
 * the oracle for that work (`24 §3` step 2) and is read-only to the implementing session.
 *
 * ## What is being closed, quoted so an assertion can be argued with
 *
 *   01-F82  "`billed_total` stops being *"the sum of line prices"* and becomes **what the customer
 *           owes, tax included** — precisely `16-F5`'s snapshot total (`taxSnapshot`'s
 *           `total_paisa`), and that identity holds under **all three** of `16-F2`'s postures
 *           rather than only the one that moves."
 *   01-F82  "**The change is ONE POSTURE WIDE, and saying so is what keeps it checkable.** Under
 *           `none` there is no tax and under `inclusive` the captured price already contains it, so
 *           `billed_total` does not move; under `exclusive` it moves by exactly the tax total."
 *   01-F82  "Under `exclusive` the customer tenders `bill + tax` while `billed_effective` derives
 *           from delivered lines, so `settledConservationResidualPaisa` reads an excess of exactly
 *           the tax **on every settled order** — and `EXCESS_TENDER_IS_EXCEPTION` is `false`, so it
 *           is **silent**. … Had tax stayed outside, an `exclusive` order would have **closed on a
 *           tender that did not cover it**."
 *   01-F30  (as amended) "**`billed_total` INCLUDES TAX** … The equation above is unchanged and
 *           every term in it now means the tax-inclusive number; a reader that means the old one is
 *           wrong rather than merely stale."
 *   01-F82  "It mints **no event type and no payload field** … It does not supply the missing
 *           `billedCellPaisa` export … It does not decide where `16-F2`'s posture matrix lives …
 *           And it **narrows rather than answers** `EXCESS_TENDER_IS_EXCEPTION`."
 *
 * ## WHAT KIND OF FILE THIS IS — read this before judging its kill count
 *
 * `01-F82` is a **definitional** amendment. It mints no type and no field; what it changes inside
 * `packages/domain` is which number a caller must pass as `billed_paisa`, and a parameter's
 * MEANING is not something a function can observe. So this file has two halves and they are
 * different in kind, which is stated rather than blurred:
 *
 * **§A–§C are EXECUTABLE IDENTITY PINS and they are GREEN against the current tree.** They are not
 * vacuous — mutating `taxSnapshot`'s arithmetic kills them, and the mutation matrix reports which
 * — but they do not measure whether `01-F82` has landed. They exist because the FR's entire content
 * is an identity (`billed_total ≡ taxSnapshot(...).total_paisa`, under all three postures), and an
 * identity that no test states is one the next session re-derives differently. `24 §3`'s "the check
 * passing is done" is satisfied by §D for the landing and by §A–§C for the regression.
 *
 * **§D IS THE RED-TODAY ASSERTION.** Two shipped doc comments in this package still declare this
 * question OPEN, in terms, and one of them is the header of the file that computes the number:
 * `tax.ts` lists "WHETHER `01-F30`'s BILLED TOTAL INCLUDES TAX" as the third of "THREE THINGS THIS
 * FILE DELIBERATELY DOES NOT DECIDE" and closes with "Nothing here presumes either answer", and
 * `invariants.ts` documents `billed_paisa` as "Billed total derived from the delivered lines" with
 * no mention of tax — which is the pre-amendment definition `01-F30` now calls "wrong rather than
 * merely stale". AGENTS.md's most expensive recorded lesson is precisely this shape: "a GREEN test
 * went on defending an overruled rule … **When a ruling lands, grep the suites that encode the old
 * rule the same day.**" A comment that tells the next reader a decided question is open is the same
 * failure in prose, and it is load-bearing here because `taxSnapshot`'s own `@unreached-owed`
 * marker names that open question as blocker (2) — a marker whose stated reason has expired.
 *
 * ⚠ **A NEIGHBOURING SUITE ENCODES THE OVERRULED READING AND IS NOT THIS FILE'S TO EDIT.**
 * `__acceptance__/tax-posture.test.ts` §I ("an exclusive posture puts the tax into the conservation
 * residual") asserts that a fully-tendered exclusive order "reads as an EXCESS of exactly the tax",
 * with the comment `// what the fold derives from delivered lines` on its `billed_paisa` argument.
 * Its ARITHMETIC stays true after `01-F82` — `settledConservationResidualPaisa` is unchanged — so it
 * does not go red; what expired is its premise that `billed_paisa` is the pre-tax number. It is a
 * green test documenting the defect this FR closes, and §B below is the same arithmetic read the
 * other way round. **Reported, not edited** (an oracle session does not modify an existing suite);
 * the owner is whoever lands `01-F82`.
 *
 * ## §0 — PINNED INTERPRETATIONS (stated, not smuggled — `24 §3b`)
 *
 * **P1 — `billed_total` is `taxSnapshot(...).total_paisa` and nothing else.** The FR says
 * "precisely" and names the function and the field. So the identity is pinned to the SHIPPED
 * snapshot rather than to a re-derivation, which is `01-F18`'s "never re-derived" applied to the
 * one number three call sites read (`01-F63`'s cover test, `02-F15`'s receipt, `02-F31`'s edge).
 *
 * **P2 — the identity is pinned, never a number.** §C is a property over rates, magnitudes, line
 * counts and postures, because a table of worked figures pins arithmetic that happens to agree
 * rather than the relationship the FR states. Fixtures stay integer paisa (`00 §6`); nothing in
 * this file writes a float into money.
 *
 * **P3 — §D asserts CITATION plus the absence of the specific superseded sentence, not prose
 * style.** A file may say anything it likes about tax; what it may not do after this ruling is tell
 * a reader the question is undecided. The two checks are therefore narrow and named, and each
 * failure message says exactly what to change.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN, and why
 *
 * - **Where `16-F5`'s snapshot RIDES.** `01-F82`: "It mints no event type and no payload field …
 *   where `16-F5`'s snapshot rides is still open." Asserting a payload field here would be
 *   inventing the amendment the FR says is owed.
 * - **`billedCellPaisa`.** Still private to `packages/sync-client`'s merge fold, and `26 §8`
 *   forbids re-deriving fold logic outside it — `01-F82` says in terms that it does not supply it.
 *   So nothing here computes a line's billed amount; every fixture supplies one.
 * - **`EXCESS_TENDER_IS_EXCEPTION`.** `01-F82` "narrows rather than answers" it. §B asserts the
 *   narrowing (a correct tender now reads ZERO residual, so a remaining excess is a real one) and
 *   asserts nothing about whether an excess is a finding.
 * - **`01-F30`'s three missing terms.** `DEC-MONEY-010`'s gate is untouched;
 *   `conservation-terms-gate.test.ts` owns it.
 * - **Order of operations between a discount and the tax base.** `01-F82`: "unreachable while
 *   `DEC-MONEY-010` keeps `discounts` ABSENT, and unruled for the day it lands."
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addPaisa,
  EXCESS_TENDER_IS_EXCEPTION,
  paisa,
  settledConservationResidualPaisa,
  subPaisa,
  sumPaisa,
  TAX_POSTURES,
  type TaxPosture,
  taxSnapshot,
} from "../index.js";

/**
 * `DEC-MONEY-005` / standing law 3: money is never added with `+` in this repo, and the lint
 * plugin `pnpm lint` runs enforces it in test files too. These three are the blessed doors, so
 * every figure this file computes goes through the same helpers the implementation does.
 */
const plus = (a: number, b: number): number => addPaisa(paisa(a), paisa(b));
const minus = (a: number, b: number): number => subPaisa(paisa(a), paisa(b));
const total = (values: readonly number[]): number => sumPaisa(values.map((v) => paisa(v)));

/** A worked bill in integer paisa (`00 §6`) — `27 §`'s Rs 450 / Rs 320 / Rs 60 / Rs 180 tiles. */
const LINES = [
  { line_id: "line-1", billed_paisa: 45_000 },
  { line_id: "line-2", billed_paisa: 32_000 },
  { line_id: "line-3", billed_paisa: 6_000 },
  { line_id: "line-4", billed_paisa: 18_000 },
] as const;

const LINE_SUM = total(LINES.map((l) => l.billed_paisa));

/** `16-F4`'s pack, and a rate that is not a round divisor of anything here. */
const RATE_BPS = 1_600;
const PACK = "sindh-2026.1";

const snapshotOf = (posture: TaxPosture, rate_bps = RATE_BPS): ReturnType<typeof taxSnapshot> =>
  taxSnapshot({ posture, rate_bps, rule_pack_version: PACK, lines: [...LINES] });

/** `01-F82`/P1: THE definition. Written once, here, so no assertion below re-derives it. */
const billedTotalPaisa = (posture: TaxPosture, rate_bps = RATE_BPS): number =>
  snapshotOf(posture, rate_bps).total_paisa;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 01-F82/P1: `billed_total` IS `taxSnapshot`'s `total_paisa`, under all three postures.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F82 — `billed_total` is what the customer owes, tax included, under all three postures", () => {
  it("the posture set is still exactly `16-F2`'s three (24-F14 — a shrunk set would make §A vacuous)", () => {
    expect([...TAX_POSTURES]).toEqual(["none", "inclusive", "exclusive"]);
  });

  it.each([...TAX_POSTURES])(
    "`%s`: the snapshot closes — total = subtotal + tax = Σ line totals",
    (posture) => {
      const snap = snapshotOf(posture);
      expect(snap.total_paisa).toBe(plus(snap.subtotal_paisa, snap.tax_total_paisa));
      expect(snap.total_paisa).toBe(total(snap.lines.map((l) => l.line_total_paisa)));
    },
  );

  it("`none`: `billed_total` does not move — there is no tax to be inside it (16-F1)", () => {
    expect(billedTotalPaisa("none")).toBe(LINE_SUM);
    expect(snapshotOf("none").tax_total_paisa).toBe(0);
  });

  it("`inclusive`: `billed_total` does not move — the captured price already contains the tax", () => {
    expect(billedTotalPaisa("inclusive")).toBe(LINE_SUM);
    expect(
      snapshotOf("inclusive").tax_total_paisa,
      "an inclusive posture with a live rate must extract a non-zero tax, or this is not the case the FR is about",
    ).toBeGreaterThan(0);
  });

  it("`exclusive`: `billed_total` moves by EXACTLY the tax total, and by nothing else", () => {
    // "The change is ONE POSTURE WIDE." This is the whole of `01-F82`'s second bullet, stated as
    // a difference rather than as a figure (P2).
    const snap = snapshotOf("exclusive");
    expect(minus(billedTotalPaisa("exclusive"), LINE_SUM)).toBe(snap.tax_total_paisa);
    expect(snap.tax_total_paisa).toBeGreaterThan(0);
  });

  it("the three postures are not accidentally equal — the exclusive one really does move", () => {
    // The control for §A: if the rate or the fixture made every posture produce one number, every
    // assertion above would pass while distinguishing nothing.
    expect(billedTotalPaisa("exclusive")).toBeGreaterThan(billedTotalPaisa("none"));
    expect(billedTotalPaisa("none")).toBe(billedTotalPaisa("inclusive"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 01-F82/01-F30: the money consequence. A correct tender equals `billed_total` EXACTLY.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F82/01-F30 — a fully-tendered order conserves under every posture", () => {
  it.each([...TAX_POSTURES])("`%s`: tendering `billed_total` leaves residual ZERO", (posture) => {
    // `01-F30`'s equation with `01-F82`'s meaning of `billed_total`. Under the OLD meaning this is
    // false for `exclusive` — see the next test, which is the same arithmetic and the reason the
    // ruling was taken.
    const billed = billedTotalPaisa(posture);
    expect(
      settledConservationResidualPaisa({
        billed_paisa: billed,
        tendered_paisa: billed,
        refunded_paisa: 0,
      }),
      "a correct tender must equal billed_total exactly (01-F82)",
    ).toBe(0);
  });

  it("the SUPERSEDED reading is the defect the ruling closes: Σ line prices reads a silent excess", () => {
    // `01-F82`'s own measurement, executed. `LINE_SUM` is "the sum of line prices" — the phrase
    // `billed_total` stopped meaning. Feeding it to the equation while the customer tenders the
    // tax-inclusive total produces an excess of exactly the tax, on EVERY settled exclusive order.
    const snap = snapshotOf("exclusive");
    const residual = settledConservationResidualPaisa({
      billed_paisa: LINE_SUM,
      tendered_paisa: snap.total_paisa,
      refunded_paisa: 0,
    });
    // `Math.abs` rather than a negated subtraction: `subPaisa` refuses a negative result by
    // design (`00 §6` — a paisa value is non-negative), and the DIRECTION is the next assertion.
    // `tax-posture.test.ts` §I reads the same residual the same way.
    expect(Math.abs(residual), "the excess is not exactly the tax").toBe(snap.tax_total_paisa);
    expect(residual, "the superseded reading must produce an EXCESS, not a shortfall").toBeLessThan(
      0,
    );
    // "and `EXCESS_TENDER_IS_EXCEPTION` is `false`, so it is **silent**" — which is why this cost
    // three weeks of nightly Auditor findings that would never have been raised.
    expect(EXCESS_TENDER_IS_EXCEPTION).toBe(false);
  });

  it("the OTHER direction the ruling names: tax outside would close a bill on a tender that did not cover it", () => {
    // "Had tax stayed outside, an `exclusive` order would have closed on a tender that did not
    // cover it." `01-F63`'s cover test is `pay_total >= billed_effective`; with the pre-amendment
    // billed the customer's Rs LINE_SUM tender passes it while the bill is LINE_SUM + tax.
    const snap = snapshotOf("exclusive");
    // The customer hands over the pre-tax figure. `01-F63`'s cover test is `pay_total >=
    // billed_effective`, so which number `billed_effective` holds decides whether the bill closes.
    const tendered = LINE_SUM;
    expect(
      tendered >= LINE_SUM,
      "under the superseded reading the cover test PASSES — the bill closes under-tendered",
    ).toBe(true);
    expect(
      tendered >= snap.total_paisa,
      "01-F82's cover test refuses the same under-tender — this is what the amendment buys",
    ).toBe(false);
    expect(
      settledConservationResidualPaisa({
        billed_paisa: snap.total_paisa,
        tendered_paisa: LINE_SUM,
        refunded_paisa: 0,
      }),
      "an under-tender is now a SHORTFALL of exactly the tax, which 01-F30 does flag",
    ).toBe(snap.tax_total_paisa);
  });

  it("a refund nets against the tax-inclusive total exactly as it nets against any other (01-F29)", () => {
    const billed = billedTotalPaisa("exclusive");
    expect(
      settledConservationResidualPaisa({
        billed_paisa: billed,
        tendered_paisa: billed,
        refunded_paisa: 0,
      }),
    ).toBe(0);
    expect(
      settledConservationResidualPaisa({
        billed_paisa: billed,
        tendered_paisa: billed,
        refunded_paisa: 5_000,
      }),
      "01-F30 is unchanged; only what its terms MEAN moved",
    ).toBe(5_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — P2: the IDENTITY, not a number. A property over rates, magnitudes and line counts.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F82/P2 — the identity holds for every rate, magnitude and line count", () => {
  /** Integer paisa only (`00 §6`); bounded well inside `Number.MAX_SAFE_INTEGER` so `sumPaisa` never throws. */
  const arbLines = fc.array(
    fc.record({
      line_id: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
      billed_paisa: fc.integer({ min: 0, max: 50_000_000 }),
    }),
    { minLength: 1, maxLength: 12 },
  );
  const arbRate = fc.integer({ min: 0, max: 5_000 });
  const arbPosture = fc.constantFrom(...TAX_POSTURES);

  it("for every (posture, rate, lines): billed_total = subtotal + tax, and a full tender conserves", () => {
    fc.assert(
      fc.property(arbPosture, arbRate, arbLines, (posture, rate_bps, lines) => {
        const snap = taxSnapshot({ posture, rate_bps, rule_pack_version: PACK, lines });
        const billed = snap.total_paisa;
        // P1: `billed_total` IS the snapshot total, and the snapshot closes on itself.
        expect(billed).toBe(plus(snap.subtotal_paisa, snap.tax_total_paisa));
        expect(billed).toBe(total(snap.lines.map((l) => l.line_total_paisa)));
        // `01-F30` with `01-F82`'s meaning: a correct tender is exactly `billed_total`.
        expect(
          settledConservationResidualPaisa({
            billed_paisa: billed,
            tendered_paisa: billed,
            refunded_paisa: 0,
          }),
        ).toBe(0);
      }),
      { numRuns: 300 },
    );
  });

  it("the movement is ONE POSTURE WIDE for every rate and line set", () => {
    fc.assert(
      fc.property(arbRate, arbLines, (rate_bps, lines) => {
        const sum = total(lines.map((l) => l.billed_paisa));
        const args = { rate_bps, rule_pack_version: PACK, lines };
        // `none` and `inclusive` do not move: the total is the captured bill.
        expect(taxSnapshot({ ...args, posture: "none" }).total_paisa).toBe(sum);
        expect(taxSnapshot({ ...args, posture: "inclusive" }).total_paisa).toBe(sum);
        // `exclusive` moves by exactly its own tax total and never by anything else.
        const excl = taxSnapshot({ ...args, posture: "exclusive" });
        expect(minus(excl.total_paisa, sum)).toBe(excl.tax_total_paisa);
      }),
      { numRuns: 300 },
    );
  });

  it("the property is not vacuous (24-F14): the generated space contains a case where tax is non-zero", () => {
    // A rate arbitrary that could only produce 0, or a line arbitrary that could only produce an
    // empty bill, would make §C true by construction — the round-3 failure in property clothing.
    let sawTax = false;
    fc.assert(
      fc.property(arbRate, arbLines, (rate_bps, lines) => {
        if (
          taxSnapshot({ posture: "exclusive", rate_bps, rule_pack_version: PACK, lines })
            .tax_total_paisa > 0
        ) {
          sawTax = true;
        }
      }),
      { numRuns: 200 },
    );
    expect(sawTax, "no generated case produced any tax at all — §C proves nothing").toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 01-F82 has LANDED in the two files that told a reader the question was open.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const repoRoot = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("repo root not found — the tripwire cannot scan and must not pass silently");
};

const readShipped = (relative: string): string => {
  const path = join(repoRoot(), relative);
  const source = readFileSync(path, "utf8");
  // 24-F14: an empty or truncated read must never pass as a clean scan.
  expect(
    source.length,
    `${relative} read as ${source.length} bytes — the scan is broken`,
  ).toBeGreaterThan(2_000);
  return source;
};

describe("§D 01-F82 — the two shipped comments that declare this question OPEN must stop saying so", () => {
  /**
   * ⚠ **WHEN THIS GOES RED, THE FIX IS A COMMENT, NOT A BEHAVIOUR.** `01-F82` mints no type and no
   * field, so the only thing it can change inside `packages/domain` is what these two files tell
   * the next reader `billed_paisa` means. AGENTS.md: "a GREEN test went on defending an overruled
   * rule … When a ruling lands, grep the suites that encode the old rule the same day." A shipped
   * comment is the same hazard with a wider blast radius, because it retires the assertion the next
   * session would otherwise have written.
   */
  it("`tax.ts` no longer lists the billed-total question among what it does not decide", () => {
    const source = readShipped("packages/domain/src/tax.ts");
    expect(
      source.includes("Nothing here presumes either answer"),
      'tax.ts still closes its third "does not decide" item with "Nothing here presumes either answer". ' +
        "01-F82 (founder ruling R54) decided it: billed_total IS `taxSnapshot`'s total_paisa, under all " +
        "three postures. Rewrite that item to state the ruling and cite 01-F82.",
    ).toBe(false);
    expect(
      source.includes("01-F82"),
      "tax.ts computes the number 01-F82 defines and does not cite the FR that defines it (commandment 9)",
    ).toBe(true);
  });

  it("`invariants.ts` documents `billed_paisa` as the TAX-INCLUSIVE total", () => {
    const source = readShipped("packages/domain/src/invariants.ts");
    expect(
      source.includes("01-F82"),
      '`SettledConservationArgs.billed_paisa` still documents itself as "Billed total derived from the ' +
        'delivered lines" with no mention of tax. 01-F30 as amended says a reader that means the old one ' +
        'is "wrong rather than merely stale" — cite 01-F82 and say the term is tax-inclusive.',
    ).toBe(true);
  });

  it("the scan can see a citation when there IS one (24-F14 — the matcher must not be broken)", () => {
    // The guard on the guard: the same substring test, aimed at an FR both files already cite.
    // Without it, a matcher that never matched anything would make the two assertions above fail
    // for a reason that has nothing to do with `01-F82`.
    expect(readShipped("packages/domain/src/invariants.ts").includes("01-F30")).toBe(true);
    expect(readShipped("packages/domain/src/tax.ts").includes("16-F5")).toBe(true);
  });
});
