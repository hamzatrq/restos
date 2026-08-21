/**
 * `16-F1`..`16-F6`'s posture arithmetic — R39's *"correct totals"*, computed **per line** in
 * integer paisa and handed back as ONE snapshot so nothing downstream re-derives it.
 *
 * Owning specs: `16 §3` (postures, rule packs, per-line computation), `00 §6` + `DEC-MONEY-005`
 * (integer paisas, rates as integer basis points, one door for scaling money).
 *
 * ── WHAT THIS FILE IS AND IS NOT (R39) ───────────────────────────────────────────────────────
 *
 * R39: *"CORRECT TOTALS AND AN ITEMISED TAX LINE; NO FISCALIZATION. Receipts compute and show tax
 * properly; nothing integrates a revenue authority's device or API, and nothing claims
 * certification. Doc 16's fiscalization is post-pilot."* So this is `16-F5`'s arithmetic and
 * nothing from `16-F7`..`16-F26`: no submission, no invoice number, no adapter, no QR, no
 * certification claim. Not one symbol here may be read as evidence about a legal obligation.
 *
 * ── A SNAPSHOT, NOT THREE HELPERS (`24 §3b`, DECLARED INTERPRETATION) ─────────────────────────
 *
 * `16-F5` snapshots the tax **on the order** as one artifact under `01-F18` discipline ("never
 * re-derived"). The named alternative — loose `taxOfLine` / `sumTax` helpers with each caller
 * assembling its own totals — is rejected because a per-line figure with no carrier is exactly the
 * shape that gets re-derived at the next layer, and because a receipt's three printed figures have
 * to agree with each other rather than be assembled three times in three places.
 *
 * ── A LINE ARRIVES ALREADY BILLED, AND THAT IS FORCED ─────────────────────────────────────────
 *
 * `TaxLineInput` carries `billed_paisa` and NOT `qty` × `unit_price_paisa`. The extended amount of
 * a line is `billedCellPaisa` — fold logic carrying `01-F30`'s exited-line rule and
 * `CONTESTED_LINE_BILLABLE` — and `26 §8` forbids re-deriving fold logic outside
 * `packages/sync-client`. A multiplication here would tax a VOIDED line, which contributes zero to
 * the bill. `packages/escpos` records the identical blocker for the receipt's extended line
 * amount; it is the same missing export and it blocks both.
 *
 * ── THREE THINGS THIS FILE DELIBERATELY DOES NOT DECIDE (commandment 2) ───────────────────────
 *
 *  1. **WHERE THE POSTURE MATRIX LIVES.** `16-F2` is a channel × payment-method matrix and
 *     `00 §7` makes it layer-2 configuration. An ALREADY-RESOLVED posture and rate arrive here;
 *     how `(channel, method)` → `(posture, rate)` is stored, validated and distributed is doc 14's
 *     and `00 §7`'s. `16-F4`'s effective-date resolution is the caller's for the same reason — and
 *     because a function resolving its own rate by `Date.now()` would break standing laws 1 and 2
 *     at once.
 *  2. **`16-F6`'s SPLIT-PAYMENT APPORTIONMENT.** The FR marks its own rule provisional ("pending
 *     authority guidance", `16 §9.1`), and under `exclusive` the stated rule is circular: apportion
 *     by payment share ⇒ the tax depends on the split; add tax on top of the bill ⇒ the amount to
 *     be split depends on the tax. There is therefore **no per-method parameter** on this
 *     signature — `DEC-MONEY-010`'s idiom, an optional term with no producer wearing a signature
 *     that says it has one.
 *  3. **WHETHER `01-F30`'s BILLED TOTAL INCLUDES TAX.** Under `exclusive` the customer tenders
 *     `bill + tax` while `billed_effective` derives from delivered lines, so
 *     `settledConservationResidualPaisa` reads an EXCESS of exactly the tax on every settled order
 *     — and `EXCESS_TENDER_IS_EXCEPTION` is `false`, so it is silent. Resolving that is a change to
 *     `01-F30`'s own term or a new term under `DEC-MONEY-010`'s gate: a founder decision and a spec
 *     PR, not an implementer's. Nothing here presumes either answer.
 *
 * ── ROUNDING: ONE POLICY, AND ITS SOURCE IS `00 §6` RATHER THAN DOC 16 ────────────────────────
 *
 * `16-F5` defers ("rounding rules per authority spec, fixed at build-time verification"). What is
 * NOT deferred is the DOOR: `00 §6`/`DEC-MONEY-005` make `applyRateBps` the single place money is
 * scaled by a rate, and its declared policy is ROUND-HALF-UP. The `exclusive` arm below IS that
 * call — not a second implementation of it — so the day a certified pack needs half-to-even, the
 * amendment lands on `00 §6`'s helper and every caller moves together.
 */

import {
  addPaisa,
  applyRateBps,
  asPaisaInt,
  type Paisa,
  paisa,
  subPaisa,
  sumPaisa,
} from "./money.js";

/**
 * `16-F2`'s three postures, closed — *"`none | inclusive | exclusive`"*.
 *
 * Declared in the FR's own order. Closed on `02-F42`'s precedent one field over: a fourth word
 * ("zero_rated", "reverse_charge") is a tax regime nobody ruled on, and `01-F1` makes a wrong one
 * permanent.
 *
 * **This carries no debt marker while `taxSnapshot` below carries one, and the split is a reading
 * rather than a rail artefact.** The posture VOCABULARY reaches the product: `TaxPosture` is the
 * declared type of `ReceiptTax.posture` in `packages/escpos`, which `apps/pos-electron` imports,
 * so a fourth word added here fails to compile there. The posture ARITHMETIC does not reach it,
 * and that is the debt — recorded once, at the function that owns it.
 */
export const TAX_POSTURES = ["none", "inclusive", "exclusive"] as const;

export type TaxPosture = (typeof TAX_POSTURES)[number];

/** One billed line as `16-F5` computes tax over it. */
export type TaxLineInput = {
  readonly line_id: string;
  /**
   * The line's BILLED amount — `billedCellPaisa`'s answer for this cell, supplied by the caller
   * (see the header). A voided line arrives as `0`, contributes `0` tax, and stays in the
   * snapshot so a receipt can itemise it: `01-F30`'s *"a fully-voided order nets to zero"*.
   */
  readonly billed_paisa: number;
};

export type TaxSnapshotInput = {
  /** `16-F2`, already resolved for this order's (channel, payment method) by the caller. */
  readonly posture: TaxPosture;
  /** `00 §6` integer basis points, from a `16-F4` rule pack. 1600 = 16 %. */
  readonly rate_bps: number;
  /** `16-F4`: packs are versioned and effective-dated; the snapshot records which one priced it. */
  readonly rule_pack_version: string;
  readonly lines: readonly TaxLineInput[];
};

export type TaxLineSnapshot = {
  readonly line_id: string;
  /** The line's tax base — net of tax under BOTH postures. */
  readonly taxable_base_paisa: number;
  readonly tax_paisa: number;
  /** What the customer is billed for this line: `taxable_base_paisa + tax_paisa`, always. */
  readonly line_total_paisa: number;
};

export type TaxSnapshot = {
  readonly posture: TaxPosture;
  readonly rate_bps: number;
  readonly rule_pack_version: string;
  readonly lines: readonly TaxLineSnapshot[];
  readonly subtotal_paisa: number;
  readonly tax_total_paisa: number;
  readonly total_paisa: number;
};

/** `00 §6`: a rate is `bps / 10000`. Integer, so the whole computation stays exact. */
const BPS_DENOMINATOR = 10_000n;

/**
 * `inclusive`: the captured price already CONTAINS the tax, so the tax is `gross × bps /
 * (10000 + bps)` — extraction, not application.
 *
 * **This cannot go through `applyRateBps` and the difference is not cosmetic.** That helper scales
 * by `bps / 10000`; charging it on a tax-inclusive price applies the rate on top of a price that
 * already carries it and overcharges every inclusive customer by the rate, permanently under
 * `01-F1`. It is the single most likely wrong implementation of the word.
 *
 * Rounding policy: ROUND-HALF-UP, the same policy `applyRateBps` declares, so one snapshot never
 * mixes two. The doubling is what makes half-up exact on an ODD divisor: `floor(x + ½)` is
 * `floor((2·numerator + divisor) / 2·divisor)`, with no fractional half to represent.
 *
 * BigInt throughout for standing law 3's reason — `gross × bps` routinely leaves the exactly
 * representable range and the naive float path is off by one. The locals are deliberately not
 * money-named: they are scaled intermediates, not paisa, and `DEC-MONEY-005`'s ban is aimed at the
 * arithmetic that treats a money value as an ordinary number.
 *
 * The result is never larger than `gross` (the fraction is strictly below 1 and `gross` is already
 * a safe integer), so no overflow guard is reachable here.
 */
const extractedTaxPaisa = (gross: number, bps: number): Paisa => {
  const divisor = BPS_DENOMINATOR + BigInt(bps);
  return paisa(Number((2n * BigInt(gross) * BigInt(bps) + divisor) / (2n * divisor)));
};

/** `16-F5`: one line's three figures, per posture. */
const lineSnapshot = (
  posture: TaxPosture,
  line: TaxLineInput,
  rate_bps: number,
): TaxLineSnapshot => {
  // `01-F53`: the captured price is the caller's and is never adjusted here — the guard refuses a
  // float or a negative rather than silently rounding one into an `01-F1`-permanent snapshot.
  const billed = paisa(asPaisaInt(line.billed_paisa, `billed_paisa of ${line.line_id}`));

  if (posture === "none") {
    // `16-F1` — tax is OFF. The rate is not consulted at all, so a configured pack cannot leak
    // through an off posture; the arm is FIRST and separate rather than a fall-through, because a
    // two-arm `inclusive ? … : …` conditional makes `none` an exclusive charge.
    return {
      line_id: line.line_id,
      taxable_base_paisa: billed,
      tax_paisa: 0,
      line_total_paisa: billed,
    };
  }

  if (posture === "inclusive") {
    const tax = extractedTaxPaisa(billed, rate_bps);
    return {
      line_id: line.line_id,
      taxable_base_paisa: subPaisa(billed, tax),
      tax_paisa: tax,
      line_total_paisa: billed,
    };
  }

  // `exclusive`: the base is the captured bill and the tax is ADDED on top, through `00 §6`'s one
  // door (see the header on rounding).
  const tax = applyRateBps(billed, rate_bps);
  return {
    line_id: line.line_id,
    taxable_base_paisa: billed,
    tax_paisa: tax,
    line_total_paisa: addPaisa(billed, tax),
  };
};

/**
 * `16-F5`'s per-line tax, snapshotted as one value (`01-F18`: never re-derived).
 *
 * PURE: it reads its inputs and nothing else — no clock (`01-F45`), no module state, no ordering
 * metadata (`01-F34`). Permuting the lines cannot move any figure, because every line is computed
 * from its own billed amount and the totals are exact integer sums. That rules out the one
 * implementation this shape invites: computing the ORDER tax and distributing the remainder across
 * lines, which makes a projected MONEY value depend on line order.
 *
 * Every input the snapshot RECORDS is refused rather than defaulted. `16-F1` has tax off by
 * default and `11-F22`'s precedent transcribes one field over — *"an absent status is not a licence
 * to default"*: a posture defaulted to `none` is a tax silently not charged, defaulted to
 * `exclusive` is a tax silently charged, and both are permanent under `01-F1`. A missing
 * `rule_pack_version` is refused for `16-F4`'s reason — a snapshot nothing can tie to a pack is one
 * nobody can defend to an auditor, and "rule-pack updates never rewrite past invoices" is
 * unverifiable without it.
 *
 * **Overflow is `applyRateBps`'s existing policy, not a new one.** The aggregates go through
 * `sumPaisa`, which throws past `Number.MAX_SAFE_INTEGER` exactly as the rate door already does one
 * line above it. Standing law 3's *"contributes zero and raises `money_overflow`, never throw"* is
 * scoped to the INGEST path (`01-F17`: a wedged device stops receiving the branch's events), and a
 * tax computed at settlement is not that path. Which policy governs here is unresolved in the
 * corpus; this file adopts the door's rather than inventing a second.
 *
 * @unreached-owed NOTHING IN THIS PRODUCT COMPUTES A TAX YET, and the two blockers are structural
 * rather than schedule. (1) The per-line `billed_paisa` this function consumes has no export:
 * `billedCellPaisa` is private to `packages/sync-client/src/folds/merge.ts` and only the
 * ORDER-level `billedEffectiveFromJsonLines` is public, so a caller cannot obtain its inputs
 * without re-deriving fold logic, which `26 §8` forbids. `packages/escpos` records the identical
 * blocker for the receipt's extended line amount — one missing export, two debts. (2) Whether
 * `01-F30`'s billed total INCLUDES tax is an open founder decision (see this file's header); a
 * caller written before it lands would freeze the wrong answer under `01-F1`. `16-F2`'s posture
 * matrix also has no store (`00 §7` layer-2, doc 14). The seam test the caller owes is named in
 * `packages/escpos/src/__acceptance__/receipt-tax-line.test.ts`'s DEFERRED block: the mutant is
 * `createReceiptPrinter` composing a receipt with no `tax` key while a posture is configured.
 */
export const taxSnapshot = (input: TaxSnapshotInput): TaxSnapshot => {
  const posture = input.posture;
  if (!TAX_POSTURES.includes(posture)) {
    throw new RangeError(
      `tax posture must be one of ${TAX_POSTURES.join(" | ")} (16-F2), got ${String(posture)}`,
    );
  }
  // `00 §6`: a rate is an INTEGER basis point. Guarded even under `none`, so a malformed pack is
  // refused where it is written rather than on the first day somebody switches a posture on.
  const rate_bps = asPaisaInt(input.rate_bps, "rate_bps");
  const rule_pack_version = input.rule_pack_version;
  if (typeof rule_pack_version !== "string" || rule_pack_version === "") {
    throw new RangeError(
      `rule_pack_version is required — 16-F4 makes the pack that priced an order part of the ` +
        `snapshot, got ${String(rule_pack_version)}`,
    );
  }

  const lines = input.lines.map((line) => {
    if (typeof line.line_id !== "string" || line.line_id === "") {
      throw new RangeError(
        `line_id is required — 16-F5 snapshots tax PER LINE and 01-F18 freezes it, ` +
          `got ${String(line.line_id)}`,
      );
    }
    return lineSnapshot(posture, line, rate_bps);
  });

  const subtotal = sumPaisa(lines.map((line) => line.taxable_base_paisa as Paisa));
  const tax_total = sumPaisa(lines.map((line) => line.tax_paisa as Paisa));

  return {
    posture,
    rate_bps,
    rule_pack_version,
    lines,
    subtotal_paisa: subtotal,
    tax_total_paisa: tax_total,
    // The closing identity R39's "correct totals" rests on, computed once here so the three
    // figures a receipt prints cannot disagree: `subtotal + tax = total`, and Σ line totals is the
    // same number because every line's own three figures close the same way.
    total_paisa: addPaisa(subtotal, tax_total),
  };
};
