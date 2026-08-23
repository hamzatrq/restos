/**
 * `16-F1`..`16-F6` + `16-F27`..`16-F35`'s posture arithmetic — R39's *"correct totals"*, computed
 * **per line** in integer paisa and handed back as ONE snapshot so nothing downstream re-derives
 * it.
 *
 * Owning specs: `16 §3` (postures, per-line computation, and the August 2026 amendments R55/R54/
 * R58/R59), `00 §6` + `DEC-MONEY-005` (integer paisas, rates as integer basis points, one door for
 * scaling money).
 *
 * ── THE AUGUST 2026 AMENDMENTS, BECAUSE THEY CHANGE WHAT THIS FILE IS ─────────────────────────
 *
 * `16-F4`'s vendor rule packs are **struck** — `16-F27` (R55) hands the owner his own channels and
 * his own rates, so a cell is layer-2 org configuration and not a pack reference. `16-F30` keeps
 * packs alive for the **certified compliance add-on only**, where an org-typed rate may never
 * override one, and `16-F34` puts that add-on **post-pilot**. Nothing in this file mentions a pack
 * for that reason, and re-adding a required `rule_pack_version` would refuse to build a snapshot
 * for an artifact the ruling deleted — which is exactly what it did until v0 gap 2.
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
 * ── `billed_total` IS THIS FILE'S `total_paisa` (`01-F82`, founder ruling R54) ────────────────
 *
 * `01-F82` amends `01-F30` in place: `billed_total` stops being *"the sum of line prices"* and
 * becomes **what the customer owes, tax included** — *"precisely `16-F5`'s snapshot total
 * (`taxSnapshot`'s `total_paisa`)"*, and that identity holds under **all three** postures rather
 * than only the one that moves. So the number this function returns as `total_paisa` is the number
 * `01-F30`'s equation, `01-F63`'s attested `billed_paisa`, the `pay_total >= billed_effective`
 * cover test, the `shift_cash` fold's expected drawer and the receipt's *Total* row all mean.
 *
 * ⚠ **THE IDENTITY IS NOW LOAD-BEARING IN FIVE OF SEVEN SHIPPING READERS, AND THE TWO THAT DID
 * NOT MOVE ARE NAMED RATHER THAN LEFT TO BE DISCOVERED (v0 gap 2, August 2026).** The reader is
 * `billedTotalPaisa` in `packages/sync-client/src/order-tax.ts` — this snapshot's `total_paisa`
 * over the fold's own per-line cells — and it replaced the tax-BLIND
 * `billedEffectiveFromJsonLines` at `settlement-guard.ts`, `settlement-closer.ts`,
 * `line-advance.ts`, `aggregator-settlement.ts` and `printing.ts`.
 *
 *   - **`apps/pos-electron/src/main/gateway.ts` (the screen's `total_paisa`) DID NOT MOVE.** It is
 *     one expression and it is the last one: until it does, a cashier reads the pre-tax figure the
 *     guard no longer accepts. Inert while the posture is `none` — which is `16-F1`'s default and
 *     the v0 seed — and a live contradiction the moment a rate is typed.
 *   - **`packages/auditor/src/auditor.ts` CANNOT move yet, for a structural reason.** It runs on
 *     the CLOUD plane with no device environment, so it has no posture to resolve: the org's cell
 *     reaches a till through `01-F87`'s fourth `01-F75` resource, and that carrier is not built
 *     (`plans/v0.md` gap 3). Under `exclusive` it therefore reads `16-F31`'s excess on every
 *     settled order — the finding `01-F82` was ruled to delete — and this is recorded so nobody
 *     reads a silent Auditor as agreement.
 *
 * **`packages/escpos` ALREADY meant the new thing before any of this** — `receipt-document.ts`
 * renders *Subtotal / Tax / Total* and `receipt-tax-line.test.ts:380` pins `subtotal + tax =
 * total` — so its producer was the mismatch, not the renderer, and `printing.ts` is where the fix
 * landed. Not one byte of `packages/escpos` changed.
 *
 * ⚠ **Blocker (1) below is CLOSED and this is what closed it:** `billedLinePaisa` is
 * `merge.ts`'s `billedCellPaisa` exported rather than re-derived, so a caller can obtain this
 * function's `billed_paisa` inputs without breaching `26 §8`.
 *
 * Nothing downstream re-derives it (`01-F18`).
 *
 * **The change is ONE POSTURE WIDE.** Under `none` there is no tax and under `inclusive` the
 * captured price already contains it, so the total does not move; under `exclusive` it is larger
 * than the delivered lines' billed cells by exactly `tax_total_paisa`. That is what makes the
 * amendment checkable, and `__acceptance__/tax-inside-billed-total.test.ts` is where it is pinned.
 *
 * ── TWO THINGS THIS FILE DELIBERATELY DOES NOT DECIDE (commandment 2) ─────────────────────────
 *
 *  1. **WHERE THE POSTURE MATRIX LIVES.** `16-F27` makes the cell — posture *and* rate — layer-2
 *     ORG configuration the owner types, overruling `16-F4`'s vendor rule packs by name; `01-F87`
 *     rules the carrier (a fourth `01-F75` reference-data resource, snapshot-plus-delta). An
 *     ALREADY-RESOLVED `TaxCell` arrives here and this file stores, validates and distributes
 *     nothing. `16-F29`'s effective-date resolution is the caller's for the same reason — and
 *     because a function resolving its own rate by `Date.now()` would break standing laws 1 and 2
 *     at once. ⚠ **The carrier is NOT built** (`plans/v0.md` gap 3); the v0 seed is
 *     `apps/pos-electron/src/main/tax-posture.ts` and it says so in its own header.
 *  2. **~~`16-F6`'s SPLIT-PAYMENT APPORTIONMENT.~~ CLOSED by `16-F35` (founder ruling R59): there
 *     is nothing to apportion.** Differently-rated tenders are two BILLS — `01-F86` makes a
 *     sub-bill `02-F5`'s child order, which settles with its own `payment.recorded`, resolves its
 *     own cell and computes its own tax — so within one bill there is one tender channel,
 *     therefore one cell. The **absence of a per-method parameter is therefore now a RULE rather
 *     than a gate**, and the older reason still holds against re-adding one: `DEC-MONEY-010`'s
 *     idiom, an optional term with no producer wearing a signature that says it has one.
 *     `02-F13`'s split across methods survives as the case where every part lands in the same
 *     cell, which this signature already expresses.
 *  ~~3. **WHETHER `01-F30`'s BILLED TOTAL INCLUDES TAX.**~~ **CLOSED by `01-F82` (founder ruling
 *     R54, August 2026) — see the section above.** It read: *"Under `exclusive` the customer tenders
 *     `bill + tax` while `billed_effective` derives from delivered lines, so
 *     `settledConservationResidualPaisa` reads an EXCESS of exactly the tax on every settled order
 *     — and `EXCESS_TENDER_IS_EXCEPTION` is `false`, so it is silent."* That measurement was right
 *     and is the whole reason the ruling was taken: tax beside the total made every settled
 *     exclusive order a silent Auditor finding, and the same reading would have closed a bill on a
 *     tender that did not cover it. **It is answered now — `billed_total` IS `total_paisa` — and a
 *     reader who still means the pre-amendment number is wrong rather than merely stale
 *     (`01-F30`).** Kept rather than deleted because the cost of the old answer is what makes the
 *     new one checkable.
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

/**
 * ONE CELL of `16-F27`'s posture matrix, already resolved for this order.
 *
 * **`16-F27` (R55): the owner types both fields.** A cell stopped *"referencing a rate from a rule
 * pack"* in August 2026 and became layer-2 org configuration (`00 §7`), so there is no pack
 * version on it — see the header. `16-F30` returns pack authority for the certified add-on, which
 * `16-F34` puts post-pilot; a pack field added before that adapter exists is a field with no
 * producer.
 *
 * **`16-F28`: the axis a cell is keyed BY is the *tender* channel** — `02-F12`'s payment method,
 * widened by `01-F85` to an org-scoped tender id — and never `02-F42`'s order channel, which stays
 * a CLOSED set and stays `01-F60`'s price key. That distinction is one keystroke apart in English
 * and nothing alike in the code.
 *
 * **The KEYING is deliberately not expressed here, and this is `24 §3b`'s named alternative.**
 * `16-F27`'s grid is a default cell plus per-cell overrides over (order channel × tender channel);
 * the shape considered and refused for v0 was a `TaxMatrix` type carrying that map. It is refused
 * because **nothing can select a non-default cell yet**: `16-F32` puts the tender-channel choice
 * *before the unpaid bill prints* and no surface offers it, so a per-tender override would be a
 * branch no caller can reach — this wave's named defect, shipped on purpose. A resolved cell is
 * what every reader of a bill needs and it is all this file takes. **When `16-F32`'s choice lands,
 * the matrix and its resolver land with it** — and `16-F29`'s pinning (the rate version resolves
 * from the order's CREATION time in branch time, never the settlement clock) lands there too,
 * because it is a question about which configuration version applies and not about arithmetic.
 */
export type TaxCell = {
  /** `16-F2`'s posture, resolved for this order's cell by the caller. */
  readonly posture: TaxPosture;
  /** `00 §6` integer basis points — `16-F27`'s owner-typed rate. 1600 = 16 %. */
  readonly rate_bps: number;
};

/**
 * `16-F1` — *"Tax is off by default"*, as a value rather than as a sentence in a comment.
 *
 * The cell every org has until it types one, and the v0 seed's default
 * (`apps/pos-electron/src/main/tax-posture.ts`). Exported because the alternative is each caller
 * writing `{ posture: "none", rate_bps: 0 }` inline, and `16-F1`'s default is exactly the kind of
 * fact that drifts when it is spelled in five places.
 */
export const TAX_OFF: TaxCell = { posture: "none", rate_bps: 0 };

export type TaxSnapshotInput = TaxCell & {
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
 * `exclusive` is a tax silently charged, and both are permanent under `01-F1`. **`16-F1`'s default
 * is expressed as `TAX_OFF` for a CALLER to pass explicitly, never as a fallback inside this
 * function** — the difference is that a caller with no configuration says so, while a fallback
 * here would let a caller that forgot one look identical.
 *
 * **Overflow is `applyRateBps`'s existing policy, not a new one.** The aggregates go through
 * `sumPaisa`, which throws past `Number.MAX_SAFE_INTEGER` exactly as the rate door already does one
 * line above it. Standing law 3's *"contributes zero and raises `money_overflow`, never throw"* is
 * scoped to the INGEST path (`01-F17`: a wedged device stops receiving the branch's events), and a
 * tax computed at settlement is not that path. Which policy governs here is unresolved in the
 * corpus; this file adopts the door's rather than inventing a second.
 *
 * ── THIS FUNCTION IS REACHED NOW, AND BOTH BLOCKERS ARE CLOSED (v0 gap 2, August 2026) ───────
 *
 * The seams-register debt marker that stood here is **deleted, not moved** — written in words
 * rather than as the literal token, because `pnpm seams:check` scans for the token itself and
 * pasting one into a comment attributes it to this file's exports and reddens the rail (the same
 * trap `apps/pos-electron/src/main/hardware-tier.ts` records). `packages/sync-client`'s
 * `orderTaxSnapshot` calls this on the shipping path and five readers in `apps/pos-electron`
 * consume its `total_paisa` as `01-F82`'s `billed_total`. (1) The per-line export arrived —
 * `billedLinePaisa` is `billedCellPaisa` exported rather than re-derived, so no caller breaches
 * `26 §8`. (2) Was closed earlier by `01-F82` (R54).
 *
 * What is NOT closed, stated so the absence is not read as completeness: `16-F27`'s matrix still
 * has **no store** — `01-F87` rules the carrier and nothing builds it (`plans/v0.md` gap 3) — so
 * the shipping cell comes from a v0 seed that says so in its own header, and `16-F32`'s
 * tender-channel choice, `16-F33`'s multi-total `bill` document and `16-F29`'s effective-date
 * pinning have no surface at all.
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
  // ⚠ **A `rule_pack_version` guard STOOD HERE and it refused every snapshot this product could
  // build.** It threw a `RangeError` citing `16-F4`, which `16-F27` (R55) struck **by name** in
  // August 2026: the owner types the rate and no pack exists, so the requirement demanded an
  // artifact the ruling deleted and nothing could compute a tax at all. Deleted rather than made
  // optional — an optional field no producer fills is `DEC-MONEY-010`'s idiom, and `16-F30` says
  // precisely when a pack returns: with a **certified adapter**, which `16-F34` puts post-pilot.
  // Recorded here rather than silently removed, because a reader who knows `16-F4` will otherwise
  // read the absence as an omission and put it back.

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
    lines,
    subtotal_paisa: subtotal,
    tax_total_paisa: tax_total,
    // The closing identity R39's "correct totals" rests on, computed once here so the three
    // figures a receipt prints cannot disagree: `subtotal + tax = total`, and Σ line totals is the
    // same number because every line's own three figures close the same way.
    total_paisa: addPaisa(subtotal, tax_total),
  };
};
