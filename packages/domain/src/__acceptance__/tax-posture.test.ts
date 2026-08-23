// ACCEPTANCE TESTS — R39's tax minimum: CORRECT TOTALS, computed per line, in integer paisa.
//
// **AUTHORED FROM SPEC TEXT ONLY** by a session acting as `24 §3`'s test author. It read
// `specs/16-tax-module.md`, `plans/saas-pivot/plan-of-record.md` §0, `packages/domain/src/money.ts`
// and `packages/domain/src/invariants.ts`, and it wrote NO implementation. `packages/domain` is a
// **PROTECTED path** (commandment 10) — this file adds no production code and changes no signature,
// and still wants an adversarial round on that basis. **⚠ MONEY tier under R35: full rounds.**
//
// ── THE RULINGS AND FRs, QUOTED SO AN ASSERTION CAN BE ARGUED WITH ────────────────────────────
//
//   R39        "**CORRECT TOTALS AND AN ITEMISED TAX LINE; NO FISCALIZATION.** Receipts compute
//              and show tax properly; nothing integrates a revenue authority's device or API, and
//              nothing claims certification. Doc 16's fiscalization is post-pilot."
//   16-F1      "Tax is off by default. Enabling any posture or the add-on is an explicit org
//              action recorded as `config.changed` (audited, 01-F5)."
//   16-F2      "Posture matrix per channel × payment method: `none | inclusive | exclusive`, each
//              referencing a rate from a rule pack. Rates are never free-typed by orgs."
//   16-F3      "Internal true numbers always complete: every order records full value, channel,
//              and payment method regardless of posture."
//   16-F4      "All rates and rules live in vendor-maintained, versioned **rule packs** with
//              effective dates … All rates/rules are configuration; rule-pack updates are
//              `config.changed` events and **never rewrite past invoices**."
//   16-F5      "**Tax is computed per line at settlement and snapshotted on the order** (01-F18
//              discipline — never re-derived); integer paisas; rounding rules per authority spec,
//              fixed at build-time verification."
//   16-F6      "Split payments across differently-rated methods: tax apportioned by payment share
//              per method. **Provisional rule pending authority guidance (§9.1)**."
//   01-F18     a snapshotted figure is never re-derived.
//   01-F53     "a line's `unit_price_paisa` is captured **into the event at the moment the line is
//              added** and is never re-read from the catalog."
//   01-F30     billed_effective derives from DELIVERED lines, exited lines excluded — "a fully-
//              voided order nets to zero".
//   01-F34     folds read NO ordering metadata: no `global_seq`, no clock, no envelope-id
//              comparison that reaches a projected VALUE (standing law 1).
//   00 §6      money = integer paisas; rates are integer BASIS POINTS; any operation that divides
//              or scales money goes through a `domain` helper with a stated rounding policy.
//   DEC-MONEY-005  `splitPaisa` / `applyRateBps` are the doors; raw money arithmetic is banned.
//   26 §8      fold logic is never reimplemented outside `packages/sync-client`.
//
// ── WHAT THIS FILE DELIBERATELY DOES **NOT** DECIDE (commandment 2) ───────────────────────────
//
//  1. **THE ROUNDING MODE IS NOT DOC 16's TO GIVE, AND DOC 16 SAYS SO.** `16-F5` writes "rounding
//     rules per authority spec, fixed at build-time verification" — it defers. What is NOT open is
//     the DOOR: `00 §6` and `DEC-MONEY-005` make `applyRateBps` the single place money is scaled by
//     a rate, and its shipped policy is ROUND-HALF-UP. So §D asserts *equality with
//     `applyRateBps`*, never "half-up is correct for PRA". The day a certified pack needs
//     half-to-even, that is an amendment to `00 §6`'s helper — **a spec PR, and this suite is the
//     thing that will go red and tell you so.** It is not a bug in this file.
//  2. **`inclusive` AND `exclusive` ARE NOT DEFINED ANYWHERE IN THE CORPUS.** `16-F2` gives the
//     three words and no semantics; a repo-wide `grep -a` for either word finds nothing else about
//     tax. §G asserts the ALGEBRA the words force and nothing else: under `exclusive` the tax is
//     added to the captured line prices, under `inclusive` it is already inside them. If the
//     founder means something else by either word, §G is wrong and that is a finding for this
//     test-owning session, cited by FR — never an edit.
//  3. **`16-F6`'s SPLIT APPORTIONMENT IS PROVISIONAL AND CIRCULAR, so §H is a GATE, not a rule.**
//     See §H's own header for the circularity, which the corpus does not resolve.
//  ~~4. **WHETHER `01-F30`'s BILLED TOTAL INCLUDES TAX.**~~ **RULED — `01-F82` (founder ruling R54,
//     August 2026): it DOES.** `billed_total` is `taxSnapshot(...).total_paisa`, under all three
//     postures. §I's arithmetic is unchanged and still green; what expired is its PREMISE that
//     `billed_paisa` is the pre-tax figure — see §I's own header. The pin for the new reading is
//     `__acceptance__/tax-inside-billed-total.test.ts`, not this file.
//
// ── THE SURFACE THIS ORACLE PINS (DECLARED INTERPRETATION, `24 §3b`) ──────────────────────────
//
// A pure `taxSnapshot(input)` in `packages/domain`, exported from `index.ts`, plus the closed
// posture set. **The simpler alternative, named rather than silently passed over:** three loose
// helpers (`taxOfLine`, `sumTax`, `postureOf`) with the caller assembling the snapshot. It is
// rejected because `16-F5` snapshots the tax **on the order** as one artifact — a per-line figure
// with no carrier is exactly the shape that gets re-derived at the next layer, which `01-F18`
// bans by name, and because the receipt needs subtotal, tax and total to agree with each other
// rather than to be assembled three times in three places.
//
// **A LINE ARRIVES ALREADY BILLED.** `TaxLineInput` carries `billed_paisa`, NOT `qty` and
// `unit_price_paisa`. That is forced, not stylistic: `26 §8` forbids re-deriving fold logic
// outside `packages/sync-client`, and the extended amount of a line is `billedCellPaisa` —
// `01-F30`'s exited-line rule plus `CONTESTED_LINE_BILLABLE`, not a multiplication. An
// implementation that multiplied `qty × unit_price` here would tax a **voided** line, which
// contributes zero to the bill. `packages/escpos/CLAUDE.md` already records the same blocker for
// the receipt's extended line amount ("the blocker is one exported function in a protected
// package") — **it is the same one export, and it blocks per-line tax too.** See the DEFERRED
// block at the foot.

import { describe, expect, it } from "vitest";
import * as domain from "../index.js";
import { settledConservationResidualPaisa } from "../invariants.js";
import { addPaisa, applyRateBps, paisa, totalPaisaOrNull } from "../money.js";
import { EXCESS_TENDER_IS_EXCEPTION } from "../product-constants.js";

// ── the surface under test ───────────────────────────────────────────────────────────────────────

type TaxPosture = "none" | "inclusive" | "exclusive";

type TaxLineInput = {
  readonly line_id: string;
  /**
   * The line's BILLED amount in paisa — `billedCellPaisa`'s answer for this cell, supplied by the
   * caller. A voided line arrives as `0` and must contribute `0` tax while still appearing in the
   * snapshot, so a receipt can itemise it.
   */
  readonly billed_paisa: number;
};

type TaxSnapshotInput = {
  /** `16-F2`, already resolved for this order's (channel, payment method) by the caller. */
  readonly posture: TaxPosture;
  /** `00 §6` integer basis points, from a `16-F4` rule pack. 1600 = 16%. */
  readonly rate_bps: number;
  /** `16-F4`: packs are versioned and effective-dated; the snapshot records which one priced it. */
  readonly rule_pack_version: string;
  readonly lines: readonly TaxLineInput[];
};

type TaxLineSnapshot = {
  readonly line_id: string;
  /** The line's tax base — net of tax under BOTH postures. */
  readonly taxable_base_paisa: number;
  readonly tax_paisa: number;
  /** What the customer is billed for this line: `taxable_base_paisa + tax_paisa`, always. */
  readonly line_total_paisa: number;
};

type TaxSnapshot = {
  readonly posture: TaxPosture;
  readonly rate_bps: number;
  readonly rule_pack_version: string;
  readonly lines: readonly TaxLineSnapshot[];
  readonly subtotal_paisa: number;
  readonly tax_total_paisa: number;
  readonly total_paisa: number;
};

type TaxSurface = {
  readonly TAX_POSTURES: readonly TaxPosture[];
  readonly taxSnapshot: (input: TaxSnapshotInput) => TaxSnapshot;
};

/**
 * The REAL module, cast — never a hand-copy.
 *
 * `oracle-round-2-findings.md` §C and the round-3 law both record `K-3`'s failure: an oracle that
 * "declared the `Transport` interface it existed to deliver, then asserted against a hand-copy —
 * both oracle symbols were dead exports". So the types above describe what `@restos/domain` must
 * export and the binding below reads it out of the shipped namespace. A missing export is
 * `undefined` here and fails loudly in §0, which is the RED this file is committed in.
 */
const tax = domain as unknown as TaxSurface;

/** Σ over money values through the ONE door (`DEC-MONEY-005`); `null` is unrepresentable. */
const sumOf = (values: readonly number[]): number | null => totalPaisaOrNull(values);

/** `a + b` on money through the one door, so this suite obeys the law it is asserting. */
const plus = (a: number, b: number): number => addPaisa(paisa(a), paisa(b));

// ── the fixtures ─────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ **THE FIXTURE IS THE COVERAGE BOUNDARY, AND THIS ONE IS BUILT TO DISCRIMINATE FIVE
 * IMPLEMENTATIONS.** Three Rs 45 lines at **16.5 % (1650 bps)**.
 *
 * With whole-rupee prices and a whole-PERCENT rate — which is every rate doc 16 names (PRA 16 % /
 * 8 %, SRB 15 % / 8 %) — per-line and per-total rounding **give the same answer**, because
 * `P × bps / 10000` is an exact integer whenever `P` is a multiple of 100 paisa and `bps` a
 * multiple of 100. A suite fixtured on Rs 450 at 16 % therefore cannot tell `16-F5`'s per-line
 * rule from the per-total one it rejects — the round-3 law's exact shape: *a mechanism that is
 * right and a guard that was never pointed at the case that matters*.
 *
 * 1650 bps is a HYPOTHETICAL pack rate and is labelled as one. It is legitimate input: `16-F4`
 * makes rates data, `00 §6` makes them integer bps, and nothing in the corpus constrains a pack
 * to whole percents. The five answers this fixture separates:
 *
 *   | implementation                                     | tax_total_paisa |
 *   |----------------------------------------------------|-----------------|
 *   | **per LINE, half-up — `16-F5` + `applyRateBps`**    | **6684**        |
 *   | per ORDER TOTAL, half-up (the rule `16-F5` rejects) | 6683            |
 *   | per UNIT then multiplied by qty                     | 6687            |
 *   | per line, half-to-EVEN                              | 6682            |
 *   | per line, FLOOR (truncation)                        | 6681            |
 */
const RS_45 = 4_500;
const SALE_LINES: readonly TaxLineInput[] = [
  { line_id: "line-roti", billed_paisa: 3 * RS_45 }, // 13,500
  { line_id: "line-chai", billed_paisa: 1 * RS_45 }, //  4,500
  { line_id: "line-raita", billed_paisa: 5 * RS_45 }, // 22,500
  // `01-F30`: an exited line contributes ZERO to the bill, so it contributes zero tax — and it is
  // still HERE, because a receipt that silently drops a voided line is a receipt nobody can audit.
  { line_id: "line-voided", billed_paisa: 0 },
];

const SALE_SUBTOTAL = 40_500;
const SALE_RATE_BPS = 1_650;
const SALE_TAX_PER_LINE = [2_228, 743, 3_713, 0] as const;
const SALE_TAX_TOTAL = 6_684;
/** The same lines at 16 % — §D's control, and 2160 + 720 + 3600 + 0 by hand. */
const SALE_TAX_AT_1600 = 6_480;

const PACK = "pk-hypothetical-2026.07";

const exclusiveSale = (over: Partial<TaxSnapshotInput> = {}): TaxSnapshotInput => ({
  posture: "exclusive",
  rate_bps: SALE_RATE_BPS,
  rule_pack_version: PACK,
  lines: SALE_LINES,
  ...over,
});

/**
 * The INCLUSIVE discriminator: three Rs 45 lines at **16 % (1600 bps)**, a rate doc 16 does name.
 *
 * Inclusive extraction is `gross × bps / (10000 + bps)`, so at 1600 bps each Rs 45 line yields
 * `18000/29 = 620.69 → 621` while the order total yields `54000/29 = 1862.07 → 1862`. Per line
 * **1863**, per total **1862** — the same discrimination as `SALE_LINES`, on a real rate.
 */
const TEA_LINES: readonly TaxLineInput[] = [
  { line_id: "line-chai-1", billed_paisa: RS_45 },
  { line_id: "line-chai-2", billed_paisa: RS_45 },
  { line_id: "line-chai-3", billed_paisa: RS_45 },
];
const TEA_GROSS = 13_500;
const TEA_TAX_PER_LINE = 621;
const TEA_TAX_TOTAL = 1_863;
const TEA_NET_TOTAL = 11_637;
/** The same lines under `exclusive` at the same rate — §G's cross-posture discriminator. */
const TEA_TAX_EXCLUSIVE = 2_160;

const inclusiveTea = (over: Partial<TaxSnapshotInput> = {}): TaxSnapshotInput => ({
  posture: "inclusive",
  rate_bps: 1_600,
  rule_pack_version: PACK,
  lines: TEA_LINES,
  ...over,
});

const taxOf = (input: TaxSnapshotInput): TaxSnapshot => tax.taxSnapshot(input);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §0 — THE SURFACE. This is the RED this file is committed in; every message names what is owed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§0 R39/16-F2/16-F5 — the tax surface `@restos/domain` must export", () => {
  it("exports the closed posture set `TAX_POSTURES`", () => {
    expect(
      tax.TAX_POSTURES,
      "`TAX_POSTURES` is not exported from `@restos/domain` — 16-F2's three postures have no " +
        "declaration, so nothing can refuse a fourth word",
    ).toBeDefined();
  });

  it("exports `taxSnapshot`, and it is callable", () => {
    expect(
      typeof tax.taxSnapshot,
      "`taxSnapshot` is not exported from `@restos/domain` — R39's 'correct totals' has no " +
        "arithmetic and 16-F5's per-line snapshot has no home",
    ).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — 16-F2: the posture set is CLOSED, on `02-F42`'s precedent one field over.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 16-F2 — `none | inclusive | exclusive`, closed", () => {
  it("holds exactly the three postures 16-F2 names, and no fourth", () => {
    // MUTANT THIS KILLS: a fourth member ("zero_rated", "reverse_charge") arriving without an FR.
    // Asserted as a SET, not as an ordered list: 16-F2 writes them in prose and no FR fixes a
    // display order, so pinning one would be a string this suite has no authority for.
    expect([...tax.TAX_POSTURES].sort()).toEqual(["exclusive", "inclusive", "none"]);
  });

  it("16-F2/02-F42: an unknown posture is REFUSED, and the refusal is anchored by a control", () => {
    // ⚠ ANCHORED. A refusal test whose subject does not exist passes for free — this repo measured
    // "19 of 53 assertions green against a codec where the kind did not exist". So the SAME test
    // proves a good posture is accepted, which cannot hold unless the function really runs.
    const control = taxOf(exclusiveSale());
    expect(
      control.tax_total_paisa,
      "the control did not compute — the refusal below would pass for free",
    ).toBe(SALE_TAX_TOTAL);

    expect(() => taxOf(exclusiveSale({ posture: "zero_rated" as TaxPosture }))).toThrow();
  });

  it("16-F1: there is NO default posture — an absent one is refused, never assumed `none`", () => {
    // `11-F22`'s precedent, transcribed one field over: "an absent status is not a licence to
    // default an absent status to `active`". A posture defaulted to `none` is a tax silently not
    // charged; defaulted to `exclusive` is a tax silently charged. Both are permanent under
    // `01-F1`, so the writer must be made to say which.
    const control = taxOf(exclusiveSale());
    expect(control.posture).toBe("exclusive");

    const { posture: _absent, ...withoutPosture } = exclusiveSale();
    expect(() => taxOf(withoutPosture as TaxSnapshotInput)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — 16-F1: OFF BY DEFAULT. `none` charges nothing and says so out loud.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 16-F1 — posture `none` charges nothing, and the receipt can tell", () => {
  it("`none` yields zero tax on every line and a total equal to the bill", () => {
    const snap = taxOf(exclusiveSale({ posture: "none" }));
    expect(snap.tax_total_paisa).toBe(0);
    expect(snap.lines.map((l) => l.tax_paisa)).toEqual([0, 0, 0, 0]);
    expect(snap.subtotal_paisa).toBe(SALE_SUBTOTAL);
    expect(snap.total_paisa).toBe(SALE_SUBTOTAL);
  });

  it("`none` IGNORES the rate — a configured pack does not leak through an off posture", () => {
    // MUTANT THIS KILLS: `posture === "inclusive" ? extract : applyRateBps(...)` — a two-arm
    // conditional in which `none` falls through to the exclusive arm. It is the single most
    // plausible one-branch slip in this whole function, and `16-F1` is the FR it breaks.
    for (const bps of [0, 800, 1_600, 1_650, 10_000]) {
      const snap = taxOf(exclusiveSale({ posture: "none", rate_bps: bps }));
      expect(snap.tax_total_paisa, `posture none leaked a rate at ${bps} bps`).toBe(0);
      expect(snap.total_paisa).toBe(SALE_SUBTOTAL);
    }
  });

  it("`none` is echoed on the snapshot — 'off' and 'zero-rated' are different facts", () => {
    // The receipt needs to distinguish "no tax posture is configured" (16-F1: print nothing) from
    // "a 0 % rate applies" (print a tax line reading Rs 0). Collapsing them is `02-F43`'s
    // "logged but uncounted" shape, moved onto a document a customer keeps.
    expect(taxOf(exclusiveSale({ posture: "none" })).posture).toBe("none");
    expect(taxOf(exclusiveSale({ rate_bps: 0 })).posture).toBe("exclusive");
    expect(taxOf(exclusiveSale({ rate_bps: 0 })).tax_total_paisa).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 16-F5: PER LINE. The five-way fixture, and the centrepiece of this file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 16-F5 — tax is computed PER LINE, not on the order total", () => {
  it("the per-line figures are 2228 / 743 / 3713 / 0", () => {
    const snap = taxOf(exclusiveSale());
    expect(snap.lines.map((l) => l.tax_paisa)).toEqual([...SALE_TAX_PER_LINE]);
  });

  it("the order tax is 6684 — and is NOT 6683, 6687, 6682 or 6681", () => {
    // Every rejected number is a real implementation someone would write, and each is exactly one
    // branch away from the right one. Naming them here is what makes this assertion attributable:
    // when it fails, the number in the message says WHICH mistake was made.
    const snap = taxOf(exclusiveSale());
    expect(snap.tax_total_paisa).toBe(SALE_TAX_TOTAL);
    const why = (mistake: string): string => `tax_total_paisa says the tax was ${mistake}`;
    expect(snap.tax_total_paisa, why("rounded on the ORDER TOTAL (16-F5 says per line)")).not.toBe(
      6_683,
    );
    expect(snap.tax_total_paisa, why("rounded per UNIT then multiplied by qty")).not.toBe(6_687);
    expect(snap.tax_total_paisa, why("rounded half-to-EVEN, not applyRateBps's half-up")).not.toBe(
      6_682,
    );
    expect(snap.tax_total_paisa, why("TRUNCATED — 00 §6 bans a silent floor")).not.toBe(6_681);
  });

  it("the order tax is the SUM of the line taxes, exactly — no second rounding on top", () => {
    const snap = taxOf(exclusiveSale());
    expect(snap.tax_total_paisa).toBe(sumOf(snap.lines.map((l) => l.tax_paisa)));
  });

  it("01-F30: a line billed ZERO is taxed ZERO and is still IN the snapshot", () => {
    // "a fully-voided order nets to zero". The line stays so the receipt can itemise it; the tax
    // is zero because the bill is zero. MUTANT THIS KILLS: filtering exited lines out of the
    // snapshot, which makes the paper disagree with the ledger about how many lines were rung.
    const snap = taxOf(exclusiveSale());
    const voided = snap.lines.find((l) => l.line_id === "line-voided");
    expect(voided, "the zero-billed line was dropped from the snapshot").toBeDefined();
    expect(voided?.tax_paisa).toBe(0);
    expect(voided?.line_total_paisa).toBe(0);
  });

  it("the snapshot's lines are 1:1 with the input's, in order, by `line_id`", () => {
    const snap = taxOf(exclusiveSale());
    expect(snap.lines.map((l) => l.line_id)).toEqual(SALE_LINES.map((l) => l.line_id));
  });

  it("a FULLY voided order nets to zero tax and zero total (01-F30, verbatim)", () => {
    const snap = taxOf(
      exclusiveSale({ lines: SALE_LINES.map((l) => ({ line_id: l.line_id, billed_paisa: 0 })) }),
    );
    expect(snap.subtotal_paisa).toBe(0);
    expect(snap.tax_total_paisa).toBe(0);
    expect(snap.total_paisa).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — 00 §6 / DEC-MONEY-005: the rate goes through the ONE door, and the door is `applyRateBps`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 00 §6 / DEC-MONEY-005 — exclusive tax IS `applyRateBps`, never a second policy", () => {
  /**
   * Bases and rates chosen to bracket the half-up ties, because a tie is the ONLY input at which
   * half-up, half-even and floor disagree. `money-helpers.test.ts` pins the helper itself; this
   * pins that the tax path IS that helper and not a private re-implementation.
   *
   * The last row is a large base whose `base × bps` product leaves the exact-double range by three
   * orders of magnitude, so a naive `Math.round(base * bps / 10000)` is off by one — while
   * `base + tax` still fits, which keeps this row inside the overflow question the DEFERRED block
   * records as unresolved.
   */
  const CASES: readonly (readonly [base: number, bps: number])[] = [
    [50, 100], // 0.5   — half-up 1, half-even 0
    [250, 100], // 2.5   — half-up 3, half-even 2
    [150, 100], // 1.5   — both agree; brackets the ties
    [4_500, 1_650], // 742.5 — the fixture's own tie
    [11_750, 1_700], // 1997.5
    [45_000, 1_600], // an exact case: 7200
    [0, 1_600],
    [123_456, 0],
    [3, 15_000], // 4.5 — a rate above 100 %, which 00 §6 permits
    [4_503_599_627_370_495, 1_700], // 2^52 − 1: the naive float path is off by one
  ];

  it("a one-line exclusive snapshot equals applyRateBps(base, bps) on every case", () => {
    for (const [base, bps] of CASES) {
      const snap = taxOf({
        posture: "exclusive",
        rate_bps: bps,
        rule_pack_version: PACK,
        lines: [{ line_id: "l", billed_paisa: base }],
      });
      expect(
        snap.lines[0]?.tax_paisa,
        `base=${base} bps=${bps}: the tax path is not applyRateBps — a second rounding policy ` +
          "has been declared, which 00 §6 forbids by construction",
      ).toBe(applyRateBps(paisa(base), bps));
    }
  });

  it("integer paisas in, integer paisas out — nothing is fractional anywhere", () => {
    const snap = taxOf(exclusiveSale());
    const every = [
      snap.subtotal_paisa,
      snap.tax_total_paisa,
      snap.total_paisa,
      ...snap.lines.flatMap((l) => [l.taxable_base_paisa, l.tax_paisa, l.line_total_paisa]),
    ];
    for (const value of every) {
      expect(Number.isSafeInteger(value), `a non-integer paisa value escaped: ${value}`).toBe(true);
    }
  });

  it("a non-integer, negative, NaN or Infinite RATE is refused — anchored by a control", () => {
    // ⚠ ANCHORED (failure pattern 3). The control runs first and must produce a real number, so a
    // function that threw on everything could not pass this test.
    expect(taxOf(exclusiveSale({ rate_bps: 1_600 })).tax_total_paisa).toBe(SALE_TAX_AT_1600);

    for (const bad of [16.5, -1_600, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(
        () => taxOf(exclusiveSale({ rate_bps: bad })),
        `rate_bps=${bad} must be refused — 00 §6 makes a rate an INTEGER basis point`,
      ).toThrow();
    }
  });

  it("a non-integer or negative BILLED amount is refused — anchored by a control", () => {
    expect(taxOf(exclusiveSale()).subtotal_paisa).toBe(SALE_SUBTOTAL);

    for (const bad of [4_500.5, -4_500, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () => taxOf(exclusiveSale({ lines: [{ line_id: "l", billed_paisa: bad }] })),
        `billed_paisa=${bad} must be refused — 00 §6: floats in ledgers never`,
      ).toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — 01-F34 (law 1) and 01-F45 (law 2): the snapshot depends on its INPUTS and nothing else.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F34 — no ordering metadata, no clock, no hidden state", () => {
  it("permuting the lines does not move the order tax, the subtotal or the total", () => {
    // ⚠ THE REAL LAW-1 HAZARD HERE, and it is not hypothetical: an implementation that computes
    // the ORDER tax and then distributes the remainder across lines largest-remainder style makes
    // a projected MONEY value depend on line order. `AGENTS.md`: "twice in the post-review round,
    // each time by a projected value quietly depending on id sort order". The fixture has three
    // lines each sitting exactly on a half-up tie, which is where such an implementation drifts.
    const base = taxOf(exclusiveSale());
    const reversed = taxOf(exclusiveSale({ lines: [...SALE_LINES].reverse() }));
    expect(reversed.tax_total_paisa).toBe(base.tax_total_paisa);
    expect(reversed.subtotal_paisa).toBe(base.subtotal_paisa);
    expect(reversed.total_paisa).toBe(base.total_paisa);
  });

  it("and each LINE keeps its own tax under permutation — not just the total", () => {
    // The stronger half. A total that survives reversal while the per-line figures shuffle is
    // exactly the remainder-distribution implementation above, and `16-F5` snapshots PER LINE.
    const byId = new Map(
      taxOf(exclusiveSale({ lines: [...SALE_LINES].reverse() })).lines.map(
        (l) => [l.line_id, l.tax_paisa] as const,
      ),
    );
    for (const [index, line] of SALE_LINES.entries()) {
      expect(byId.get(line.line_id), `${line.line_id} moved when the order did`).toBe(
        SALE_TAX_PER_LINE[index],
      );
    }
  });

  it("the same input twice gives a deeply equal snapshot — the function holds no state", () => {
    expect(taxOf(exclusiveSale())).toEqual(taxOf(exclusiveSale()));
  });

  it("16-F4: a pack computed BETWEEN two identical calls does not change the first answer", () => {
    // MUTANT THIS KILLS: a module-level "current rule pack" cache. `16-F4` says rule-pack updates
    // "never rewrite past invoices"; a stateful rate makes the second call on the same inputs a
    // different number, which under `01-F1` is a wrong figure frozen for ever.
    const first = taxOf(exclusiveSale());
    taxOf(exclusiveSale({ rate_bps: 800, rule_pack_version: "pk-later-pack" }));
    const third = taxOf(exclusiveSale());
    expect(third).toEqual(first);
  });

  it("01-F45: the snapshot does not read a clock — a moved host clock moves nothing", () => {
    // Law 2: durations need a CONSISTENT clock and a fold applies no offset of its own. A tax
    // function resolving its own rate by `Date.now()` against `16-F4`'s effective dates would
    // break both laws at once; the effective-date resolution is the CALLER's, and what arrives
    // here is an already-chosen `rate_bps` plus the pack version that chose it.
    const realNow = Date.now;
    const baseline = taxOf(exclusiveSale());
    try {
      Date.now = () => 0;
      expect(taxOf(exclusiveSale())).toEqual(baseline);
      Date.now = () => 4_102_444_800_000; // 2100-01-01
      expect(taxOf(exclusiveSale())).toEqual(baseline);
    } finally {
      Date.now = realNow;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — 16-F5 / 01-F18 / 01-F53: the snapshot is a RECORD, not a recipe.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 16-F5/01-F18 — the snapshot carries what priced it, so nothing re-derives it", () => {
  it("16-F4: the rule-pack version and the rate are ECHOED onto the snapshot", () => {
    // Without these two the snapshot is a bare number and `16-F4`'s "never rewrite past invoices"
    // is unverifiable: nothing on the order says which pack produced it, so a later reader has no
    // way to tell a correct old figure from a wrong new one.
    const snap = taxOf(exclusiveSale());
    expect(snap.rule_pack_version).toBe(PACK);
    expect(snap.rate_bps).toBe(SALE_RATE_BPS);
    expect(snap.posture).toBe("exclusive");
  });

  it("16-F4: a missing rule-pack version is refused — anchored by a control", () => {
    expect(taxOf(exclusiveSale()).rule_pack_version).toBe(PACK);

    const { rule_pack_version: _absent, ...withoutPack } = exclusiveSale();
    expect(
      () => taxOf(withoutPack as TaxSnapshotInput),
      "a snapshot with no pack version cannot be defended to an auditor (16-F4)",
    ).toThrow();
  });

  it("01-F53: the billed figure handed in is the figure taxed — never adjusted", () => {
    // The captured price is `01-F53`'s and this layer is downstream of it. MUTANT THIS KILLS: a
    // "sanity" clamp or a re-derivation from anything but the number supplied.
    const snap = taxOf(exclusiveSale());
    expect(snap.lines.map((l) => l.taxable_base_paisa)).toEqual([13_500, 4_500, 22_500, 0]);
    expect(snap.subtotal_paisa).toBe(SALE_SUBTOTAL);
  });

  it("a rate change is a NEW call with a NEW pack — the old snapshot is a value, not a view", () => {
    // "A tax rate that changes mid-day must not retroactively alter an open order." The property
    // that makes that true is that a snapshot is a plain value: holding one and computing another
    // cannot move it.
    const morning = taxOf(exclusiveSale());
    const afternoon = taxOf(exclusiveSale({ rate_bps: 800, rule_pack_version: "pk-afternoon" }));
    expect(afternoon.tax_total_paisa).not.toBe(morning.tax_total_paisa);
    expect(morning.tax_total_paisa).toBe(SALE_TAX_TOTAL);
    expect(morning.rate_bps).toBe(SALE_RATE_BPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — 16-F2's two live postures. The ALGEBRA the words force, and nothing beyond it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 16-F2 — `exclusive` adds, `inclusive` extracts, and both totals close exactly", () => {
  it("the closing identity holds under BOTH postures: base + tax = line total, summed", () => {
    // The one invariant that makes R39's "correct totals" checkable at all. It is asserted on both
    // postures deliberately: a receipt whose three printed figures do not close is the defect R39
    // exists to prevent, and this is that property in paisa, upstream of any rendering.
    for (const input of [exclusiveSale(), inclusiveTea()]) {
      const snap = taxOf(input);
      for (const line of snap.lines) {
        expect(plus(line.taxable_base_paisa, line.tax_paisa)).toBe(line.line_total_paisa);
      }
      expect(plus(snap.subtotal_paisa, snap.tax_total_paisa)).toBe(snap.total_paisa);
      expect(sumOf(snap.lines.map((l) => l.line_total_paisa))).toBe(snap.total_paisa);
    }
  });

  it("exclusive: the base is the captured bill and the tax is ADDED on top", () => {
    const snap = taxOf(exclusiveSale());
    expect(snap.subtotal_paisa).toBe(SALE_SUBTOTAL); // the bill, untouched
    expect(snap.total_paisa).toBe(plus(SALE_SUBTOTAL, SALE_TAX_TOTAL)); // 47,184
  });

  it("inclusive: the captured bill is the TOTAL and the tax comes out of it", () => {
    // MUTANT THIS KILLS — and it is the single most likely wrong implementation of `inclusive`:
    // `applyRateBps(gross, bps)`, i.e. charging the rate ON TOP of a price that already contains
    // it. That gives 720 a line and 2,160 an order against the correct 621 and 1,863, and it
    // overcharges every inclusive customer by ~16 % for ever under `01-F1`.
    const snap = taxOf(inclusiveTea());
    expect(snap.total_paisa, "an inclusive posture moved the price the customer was quoted").toBe(
      TEA_GROSS,
    );
    expect(snap.tax_total_paisa).toBe(TEA_TAX_TOTAL);
    expect(snap.subtotal_paisa).toBe(TEA_NET_TOTAL);
    expect(snap.lines.map((l) => l.tax_paisa)).toEqual([
      TEA_TAX_PER_LINE,
      TEA_TAX_PER_LINE,
      TEA_TAX_PER_LINE,
    ]);
    expect(
      snap.tax_total_paisa,
      "inclusive tax computed as applyRateBps(gross, bps) — the rate applied ON TOP of a price " +
        "that already contains it",
    ).not.toBe(TEA_TAX_EXCLUSIVE);
  });

  it("inclusive is PER LINE too: 1863, not the 1862 the order total would give", () => {
    expect(taxOf(inclusiveTea()).tax_total_paisa).not.toBe(1_862);
  });

  it("the two postures DISAGREE on identical lines and an identical rate", () => {
    // ⚠ THE `K-4` GUARD. That oracle "varied `spec` and `profile` across ~90 renders and never
    // varied `data`, so an implementation ignoring `data` entirely passed". The equivalent here is
    // an implementation that ignores `posture`; every other assertion in §G would survive it if
    // each posture were only ever exercised on its own fixture.
    const at = (posture: TaxPosture): TaxSnapshot =>
      taxOf({ posture, rate_bps: 1_600, rule_pack_version: PACK, lines: TEA_LINES });
    expect(at("exclusive").tax_total_paisa).toBe(TEA_TAX_EXCLUSIVE);
    expect(at("inclusive").tax_total_paisa).toBe(TEA_TAX_TOTAL);
    expect(at("none").tax_total_paisa).toBe(0);
    // exclusive 15,660 · inclusive 13,500 · none 13,500 — two distinct totals, three distinct taxes.
    const totals = new Set(
      (["exclusive", "inclusive", "none"] as const).map((p) => at(p).total_paisa),
    );
    expect(totals.size, `postures collapsed to one total: ${[...totals].join("/")}`).toBe(2);
  });

  it("a 0 bps rate is a no-op under both postures, and does not divide by zero", () => {
    for (const posture of ["exclusive", "inclusive"] as const) {
      const snap = taxOf(inclusiveTea({ posture, rate_bps: 0 }));
      expect(snap.tax_total_paisa, `${posture} at 0 bps charged something`).toBe(0);
      expect(snap.total_paisa).toBe(TEA_GROSS);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H — 16-F6: THE SPLIT-PAYMENT GATE. A tripwire, not a rule.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `16-F6` is the one FR in this file's scope that the corpus itself marks **provisional**: "tax
 * apportioned by payment share per method. Provisional rule pending authority guidance (§9.1)",
 * and §9.1 names the fallback ("highest-rate-applies") without choosing between them.
 *
 * ⚠ **AND UNDER `exclusive` POSTURE THE STATED RULE IS CIRCULAR, which no FR notices.** Apportion
 * tax by payment share ⇒ the tax depends on the split; add tax on top of the bill ⇒ the amount to
 * be split depends on the tax. Rs 1,000 across cash @16 % and card @8 % has no fixed point until
 * someone rules what the shares are shares OF. Under `inclusive` there is no circularity, because
 * the total is fixed before the split.
 *
 * So this section asserts ONE thing: `taxSnapshot` takes a single resolved posture and a single
 * rate, and there is **no optional per-method parameter** that could quietly grow an apportionment
 * nobody ruled on. It is the `DEC-MONEY-010` idiom — *an optional zero term is a term with no
 * producer wearing a signature that says it has one*.
 */
describe("§H 16-F6 — the split-payment apportionment is NOT decided, and is not smuggled in", () => {
  it("an extra per-method key changes NOTHING — the shape refuses to grow quietly", () => {
    const base = exclusiveSale();
    const withSplit = {
      ...base,
      splits: [
        { method: "cash", amount_paisa: 20_000, rate_bps: 1_600 },
        { method: "card", amount_paisa: 20_500, rate_bps: 800 },
      ],
    } as TaxSnapshotInput;
    expect(taxOf(withSplit)).toEqual(taxOf(base));
  });

  it("one posture and one rate produce one answer — 02-F13's split does not reach this layer", () => {
    // ⚠ WHEN THIS GOES RED, READ `16-F6` AND `16 §9.1` BEFORE EDITING IT. A per-method rate
    // arriving here is the moment the provisional rule stops being provisional, and it needs an
    // authority reading plus a resolution of the circularity above — not an implementer's guess.
    const snap = taxOf(exclusiveSale());
    expect(snap.rate_bps).toBe(SALE_RATE_BPS);
    expect(snap.tax_total_paisa).toBe(SALE_TAX_TOTAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §I — WHAT AN `exclusive` POSTURE COSTS `01-F30` TODAY. Measured, not argued.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ **THE FINDING THIS SECTION MADE HAS SINCE BEEN RULED ON, AND THE SECTION NOW DOCUMENTS THE
 * SUPERSEDED READING RATHER THAN THE CURRENT ONE (`01-F82`, founder ruling R54, August 2026).**
 * Its arithmetic is untouched and still green — `settledConservationResidualPaisa` did not move —
 * but `billed_paisa` is now *what the customer owes, tax included*, so the `SALE_SUBTOTAL` fed to
 * it below is no longer `01-F30`'s `billed_total`: it is the pre-amendment number, and feeding it
 * is what produces the excess. Alternative (a) named at the foot of this comment is the one the
 * founder took. Kept, unedited below the line, because the cost stated in rupees is what makes the
 * ruling checkable; `__acceptance__/tax-inside-billed-total.test.ts` §B is the same arithmetic read
 * the other way round and is the pin for the CURRENT reading. Read what follows in the past tense.
 *
 * ⚠ **THIS SECTION WAS GREEN AT AUTHORING TIME AND WAS THE HARDEST FINDING IN THE FILE.**
 *
 * It drives SHIPPED code — `settledConservationResidualPaisa`, `EXCESS_TENDER_IS_EXCEPTION` — and
 * asserts nothing about tax arithmetic. Its job is to state, in rupees, what happens the day an
 * exclusive posture is switched on against the conservation equation this product already runs.
 *
 * `01-F30`'s `billed_paisa` "derives from the delivered lines". Under `exclusive` the customer
 * tenders **bill + tax**, so `billed − tendered` is negative by exactly the tax on EVERY settled
 * order, for ever, under `01-F1`. `EXCESS_TENDER_IS_EXCEPTION` is `false`, so it is not even
 * flagged — it is silent.
 *
 * The `24 §3b` alternatives, named and NOT chosen here (both are spec changes, commandment 9):
 *   (a) `billed_effective` becomes tax-inclusive — a change to `01-F30`'s own term and to
 *       `packages/sync-client`'s fold, which `26 §8` protects;
 *   (b) the equation gains a `tax_paisa` term — which `DEC-MONEY-010`'s gate governs, and the
 *       gate's three conditions (a producer, an `01-F31`-class key, a `26 §7` merge rule) are the
 *       questions to answer before anyone adds one.
 */
describe("§I 01-F30 — an exclusive posture puts the tax into the conservation residual", () => {
  it("a fully-tendered exclusive order reads as an EXCESS of exactly the tax", () => {
    const residual = settledConservationResidualPaisa({
      // what the fold derives from delivered lines
      billed_paisa: SALE_SUBTOTAL,
      // what the customer actually hands over
      tendered_paisa: plus(SALE_SUBTOTAL, SALE_TAX_TOTAL),
      refunded_paisa: 0,
    });
    expect(
      Math.abs(residual),
      "the residual is not exactly the tax — re-derive this finding before trusting it",
    ).toBe(SALE_TAX_TOTAL);
    expect(residual, "the residual is not an EXCESS (negative) — re-read 01-F30").toBeLessThan(0);
  });

  it("and nothing flags it: EXCESS_TENDER_IS_EXCEPTION is false", () => {
    expect(EXCESS_TENDER_IS_EXCEPTION).toBe(false);
  });

  it("an INCLUSIVE posture conserves untouched — the control that makes the finding specific", () => {
    // The negative control for §I: the equation is not simply wrong about tax. Under `inclusive`
    // the customer tenders the quoted price, `billed_effective` already IS that price, and the
    // residual is zero. So the finding is about ONE posture, which is what makes it actionable.
    expect(
      settledConservationResidualPaisa({
        billed_paisa: TEA_GROSS,
        tendered_paisa: TEA_GROSS,
        refunded_paisa: 0,
      }),
    ).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// DEFERRED — what this suite could NOT assert, and who owns each
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
//  1. **THE PER-LINE BILLED AMOUNT HAS NO EXPORT.** `billedCellPaisa` is private to
//     `packages/sync-client/src/folds/merge.ts:298`; only the ORDER-level
//     `billedEffectiveFromJsonLines` is exported. `16-F5` computes tax **per line**, so the caller
//     of `taxSnapshot` cannot obtain its `billed_paisa` inputs without re-deriving fold logic,
//     which `26 §8` forbids. `packages/escpos/CLAUDE.md` records the identical blocker for the
//     receipt's extended line amount — **it is the same missing export and it blocks both.** Owner:
//     `packages/sync-client`'s test-owning session (protected path).
//  2. **`config.changed` HAS NO PAYLOAD SCHEMA.** `16-F1` records a posture change as
//     `config.changed`; the type is in `01 §4`'s catalog and `packages/domain/src/registry.ts`
//     carries no schema for it, so `01-F4` makes emitting one a runtime error. Enabling tax is
//     therefore currently **unauditable**, not merely unbuilt. Owner: doc 01 / `registry.ts`.
//  3. **WHERE THE POSTURE MATRIX LIVES.** `16-F2` is a channel × payment-method matrix and
//     `00 §7` makes it layer-2 configuration ("presets, not free-form knobs"). This file takes an
//     already-resolved posture and rate; nothing here asserts how (channel, method) → posture is
//     stored, validated or distributed. Owner: doc 14's back-office surface + `00 §7`.
//  4. **OVERFLOW.** `applyRateBps` THROWS past `Number.MAX_SAFE_INTEGER` while `01-F17` forbids a
//     throw on the ingest path and law 3 says an unrepresentable total "contributes zero and
//     raises `money_overflow`". Which policy governs a tax computed at settlement is unresolved,
//     so this file asserts neither. Owner: `DEC-MONEY-005` / doc 01.
//  5. **NO FISCALIZATION IS ASSERTED OR IMPLIED (R39).** Nothing here submits, acknowledges,
//     numbers or QR-codes an invoice; `16-F7`..`16-F26` are untouched and no assertion in this
//     file may be read as evidence about an authority adapter, a certification, or a legal
//     obligation. `plan-of-record.md` §4's Sindh Finance Act reading is open and is a lawyer's
//     question, not this suite's.
