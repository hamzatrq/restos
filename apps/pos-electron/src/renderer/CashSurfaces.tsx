import {
  addPaisa,
  directedPaisa,
  newId,
  PAYMENT_METHODS,
  type Paisa,
  type PaymentMethod,
  paisa,
  subPaisa,
} from "@restos/domain";
import {
  formatPaisa,
  MoneyValue,
  NumericKeypad,
  Panel,
  Readout,
  space,
  Tile,
  typography,
} from "@restos/ui";
import { Fragment, useState } from "react";
import type { AppendRequest, CashShift, CashState } from "../shared/ipc";

/**
 * `S-3`/`S-4`/`S-5` — the **Cash** and **Me** surfaces (`screen-map §3.1`).
 *
 * Two peer tabs, and the split between them is `02-F23`'s, not a layout convenience: Cash is
 * where a shift and a day are OPENED and CLOSED and where the drawer is opened and paid out of;
 * Me is the cashier's own reconciliation — *"I'm clean"* — which is a **protection** surface and
 * carries no control at all. A role that can be QUESTIONED by the record but cannot READ it is
 * being watched, and adoption depends on the opposite.
 *
 * ── The laws that shaped this file ──────────────────────────────────────────────────────────
 *
 * - **`27-F24` — the system computes, staff read.** ~60% of rural Class 1 recognise numbers
 *   against 9.5% who can do any arithmetic, so over/short arrives FINISHED. Nothing here asks a
 *   cashier to subtract, and `27-F12` makes the direction a WORD (`MoneyValue direction`),
 *   never a minus sign: a lone `-` is one glyph wide and means nothing to a non-reader.
 * - **`27-F8` — every count field is the 126 dp kiosk condition**, the largest target in the
 *   system, because this is standing high-consequence entry. `NumericKeypad` carries it; the
 *   76 dp menu tile may not be reused for a count.
 * - **`27-F1`/`27-F5` — depth ONE.** Type a number on a visible keypad, then tap a visible
 *   labelled action. No modal, no wizard, no reveal step — the shape `TenderPanel` already
 *   ships, on the same posture.
 * - **`27-F4` — every action holds its position**, disabled in place with its reason, never
 *   removed. The rail is positional memory and so is this surface.
 * - **The screen renders the fold; it never predicts it.** There is no local "the day is open
 *   now" flag anywhere below. `01-F1` makes a ledger fact unrewritable, and a surface that
 *   optimistically showed a day as open after a refused append is `02-F37`'s *"succeed and
 *   lie"* wearing a different hat — the next shift would settle against a day that does not
 *   exist. Every state below is read from `cashState()`.
 *
 * ── THE GROUPING, AND WHY IT IS THE DESIGN (August 2026) ────────────────────────────────────
 *
 * **What was here, and what a founder saw:** eleven sibling `Tile`s in three wrapping rows on a
 * bare page. Opening a business day (once, irreversible-ish, manager-only under `02-F22`),
 * opening a shift (per person, several times a day) and taking money out of the drawer (`02-F26`,
 * needs a reason and a receipt) are three different kinds of act with three different
 * consequences, and they read as one undifferentiated field. Worse, the relationship the surface
 * most needed to show — that `Supplier` and `Receipt photo` are PRECONDITIONS of `Paid out` —
 * was carried by nothing at all: those three tiles sat in the same row as `No-sale drawer open`,
 * which has no preconditions and is a different act entirely.
 *
 * Every gate was green throughout. `layout:check` asks whether a control FITS, and eleven
 * scattered tiles fit perfectly.
 *
 * The surface is now four regions, and `Panel` is what makes a region a thing on the glass:
 * the entry instrument, **The day**, **My shift**, **The drawer** — with the paid-out sequence a
 * bounded sub-region INSIDE the drawer, so a precondition and the act it gates share a boundary.
 *
 * ── HEIGHT IS THE HARDWARE FLOOR, AND THIS SURFACE SETS IT ──────────────────────────────────
 *
 * Measured August 2026 across panels below the current size floor: **the Cash tab is the tallest
 * surface in the product**, so the height it needs plus 37.4 mm of chrome is what decides which
 * glass can run RestOS at all. That is a product constraint now, not a nicety — the founder's
 * bring-your-own-hardware ruling means a restaurant arrives with an old laptop and this number
 * decides whether it works.
 *
 * Two consequences are visible in the code below and are decisions, not accidents:
 *
 * 1. **The entry instrument carries NO panel chrome.** A `Panel` costs its caption, its gap and
 *    its padding — 64 dp ≈ 10 mm of height — and the pad is the tallest fixed thing here, so that
 *    cost would land directly on the floor. The pad is twelve raised keys on the page's ground
 *    and reads as an instrument without a card around it.
 * 2. **The amount sits BESIDE the pad, not under it** — which is `27-F4` positional change and is
 *    justified below.
 *
 * Result: the entry band is `4 × 126 dp` of key plus margins = **536 dp = 85 mm**, down from
 * 632 dp = 100 mm, and every other region is composed to stay under that ceiling so the surface
 * is exactly one pad tall. Nothing was shrunk to get there; `27-F68` (b) forbids trimming the
 * millimetres and the keys are untouched.
 *
 * **`27-F4` PR justification for moving the amount readout.** It was directly under the pad and
 * is now to its right, vertically centred.
 *   1. **It was the measured casualty.** At 1024×600 on 10.1″ glass with `03-F5`'s band up,
 *      `COUNTED Rs 0` is **cut in half** — the bottom-most element on the tallest surface is the
 *      first thing a short panel eats, and this one is *"the only feedback that a 126 dp key
 *      registered at all"*. Beside the pad it cannot be the bottom of anything.
 *   2. **It buys 15 mm of the product's hardware floor**, per the paragraph above.
 *   3. **The pad itself does not move**, which is the half of `27-F4` that protects muscle
 *      memory: it stays at the surface's left edge, in the same 3-column arrangement, with the
 *      same twelve cells in the same order. The pad is also FIRST in the flex row so that a
 *      readout growing from `Rs 0` to `Rs 9,999,999` cannot push it — the column is fixed-width
 *      for the same reason `TenderPanel`'s money column is.
 *   4. It also brings the two number-entry surfaces on this device into agreement: `Pay` already
 *      reads its figures in a column beside the pad rather than under it.
 *
 * **WHAT THIS TRADE COSTS, named rather than left to be rediscovered.** Height and width are
 * exchanged, not created: the band is 536 dp tall and about **1640 dp ≈ 260 mm wide**, where the
 * arrangement it replaces was 632 dp tall and about 1420 dp ≈ 225 mm wide. On `27 §1a`'s counter
 * — 2143 dp of work surface — the band fits in one line with ~500 dp of field to spare and the
 * 15 mm is a straight gain. **On glass narrower than ~260 mm it wraps, and a wrapped band is
 * TALLER than the arrangement it replaced**, because a 536 dp pad on the first row plus anything
 * on the second exceeds what the old two-column packing needed. That is a real regression on
 * small glass and it is a finding for whoever defines the mode below `compact`: the number to
 * design against is that a 126 dp pad plus this surface's four regions cannot be held at one pad
 * of height in less than ~260 mm of width, and no arrangement changes that without removing a
 * control, which `27-F4` forbids.
 */

/**
 * The five tenders (`domain`'s closed set) with the words the counter reads. Exhaustive and in
 * `PAYMENT_METHODS` order: `02-F23` requires expected cash BY METHOD, and `01-F32` /
 * `DEC-MONEY-007` make four of the five behave differently — `khata_credit` is not money
 * received, `aggregator_receivable` is collected by the aggregator, `card`/`raast` never enter
 * the drawer. A single scalar "expected cash" is wrong for four of five.
 */
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  raast: "Raast",
  khata_credit: "Khata credit",
  aggregator_receivable: "Aggregator",
};

/**
 * The fold's expected-cash map, widened to all five tenders with EXPLICIT ZEROS.
 *
 * The fold carries only the methods actually tendered. A bucket that disappears when it is
 * empty moves the rows below it (`27-F4`) and is indistinguishable from a bucket that was never
 * tendered — and `shift.closed`'s schema is a strict object over all five, so the screen owes
 * the zeros to the event as well as to the eye.
 */
const byMethod = (json: string): Record<PaymentMethod, number> => {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const out = {} as Record<PaymentMethod, number>;
  for (const method of PAYMENT_METHODS) {
    const value = parsed[method];
    out[method] = typeof value === "number" ? value : 0;
  }
  return out;
};

/**
 * `02-F23`'s reconciliation, computed once and arriving finished (`27-F24`).
 *
 * What the drawer must account for is what is IN it **plus what LEFT it as a paid-out**
 * (`02-F44`): "the drawer is short by an amount the ledger never recorded, and the variance is
 * unattributable". Rs 300 to the vegetable man against Rs 1,000 tendered and Rs 750 counted is
 * Rs 50 OVER, not Rs 250 SHORT — and a cashier told she is Rs 250 short over a paid-out SHE
 * recorded is the precise harm `02-F23`'s staff-protection framing exists to prevent.
 *
 * Written as ONE addition and a two-directional subtraction, which is `TenderPanel`'s shipped
 * idiom and the only one available: `subPaisa` refuses a negative because `Paisa` has no sign,
 * so the direction is carried by WHICH subtraction ran, and the day's opening float is
 * deliberately absent — the float is a DAY fact (`02-F22`) and the variance is a SHIFT fact
 * (`02-F23`), and no FR joins them. Recorded as an open question, not decided here.
 */
const reconcile = (
  expectedCashPaisa: number,
  paidOutPaisa: number,
  countedPaisa: number,
): { magnitudeP: Paisa; over: boolean } => {
  const accounted = addPaisa(paisa(countedPaisa), paisa(paidOutPaisa));
  const expected = paisa(expectedCashPaisa);
  const over = accounted >= expected;
  return {
    magnitudeP: over ? subPaisa(accounted, expected) : subPaisa(expected, accounted),
    over,
  };
};

/** SIGNED, for the event (`02-F23`, `registry.ts`): over is positive, short is negative. */
const signedVariance = (r: { magnitudeP: Paisa; over: boolean }): number =>
  r.over ? r.magnitudeP : -r.magnitudeP;

/**
 * `27-F12` — over/short as a WORD plus a magnitude. `directedPaisa` is the domain's split of a
 * signed money quantity, and both halves come from ONE call so a caller cannot render the
 * magnitude and drop the direction. A variance of exactly zero carries no word, because
 * "OVER Rs 0" is not a thing anyone says.
 */
const Variance = ({ signedPaisa }: { signedPaisa: number }) => {
  const { magnitudePaisa, sign } = directedPaisa(signedPaisa);
  return (
    <MoneyValue
      paisa={magnitudePaisa}
      size="hero"
      {...(sign === 1
        ? { direction: "over" as const }
        : sign === -1
          ? { direction: "short" as const }
          : {})}
    />
  );
};

/**
 * **A statement of labelled money — and the `space-between` row it replaces was the defect
 * `Readout` exists to name, one shape along.**
 *
 * Each row was `display: flex; justifyContent: space-between`, so the word naming a figure sat as
 * far from the figure as the container was wide. `27-F57` measures exactly that pairing step and
 * finds where comprehension collapses — readers who *decode* a line at ~71% *execute* it
 * correctly at ~35% — and `Readout` was built for the single-fact case for the same reason. This
 * is the many-facts case: a `max-content` two-column grid, so the block is as wide as its widest
 * label plus its widest figure and **no wider**, the label and its own number are adjacent, and
 * the figures still form one right-aligned tabular column.
 *
 * **Not a 2-D matrix, and the difference is `27-F36`'s.** That FR's cultural-review list flags
 * *"matrix/grid encodings of relationships — 2-D tabular semantics are a literacy-dependent
 * skill"*. This has no column headers and nothing to cross-reference: every row is a
 * self-contained pair read left to right, which is one-dimensional however it is laid out. A
 * grid is the implementation, not the semantics.
 *
 * **The label recedes and the figure carries** (`27-F25`): labels are `text-label`, muted; the
 * money is `MoneyValue`'s default at `fgColor-default`. Emphasising the scaffolding emphasises
 * nothing.
 */
const MoneyTable = ({ rows }: { rows: readonly { label: string; amountPaisa: number }[] }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "max-content max-content",
      columnGap: space["space-5"],
      rowGap: space["space-1"],
      alignItems: "baseline",
    }}
  >
    {rows.map((r) => (
      <Fragment key={r.label}>
        <span
          style={{
            fontFamily: typography["text-label"].fontFamily,
            fontSize: typography["text-label"].fontSize,
            fontWeight: typography["text-label"].fontWeight,
            letterSpacing: typography["text-label"].letterSpacing,
          }}
        >
          {r.label}
        </span>
        <span style={{ justifySelf: "end" }}>
          <MoneyValue paisa={paisa(r.amountPaisa)} />
        </span>
      </Fragment>
    ))}
  </div>
);

/**
 * The five tender rows, exhaustive and in a fixed order (`02-F23`, `27-F4`), plus whatever else
 * the caller owes the same statement — the paid-out that `02-F44` makes part of the drawer, and
 * the counted figure on a closed shift.
 */
const byMethodRows = (
  expected: Record<PaymentMethod, number>,
): readonly { label: string; amountPaisa: number }[] =>
  PAYMENT_METHODS.map((method) => ({
    label: METHOD_LABEL[method],
    amountPaisa: expected[method],
  }));

/**
 * The latest row of a table, by the key the entity's own order is carried on.
 *
 * NOT a delivery-order or id comparison: `days` are ranked by their `01-F46` business date and
 * `shifts` by the branch-consensus `open_at` the fold selected under `01-F45`'s basis
 * precedence. Both are values the fold already projected — this reads them, it does not
 * re-derive an order from envelope metadata (`01-F34`).
 */
const latest = <T,>(rows: readonly T[], key: (row: T) => number | string): T | null =>
  rows.reduce<T | null>((best, row) => (best === null || key(row) >= key(best) ? row : best), null);

/**
 * The one open shift, and **the ONE definition of it in this app** — exported for that reason
 * rather than for reuse.
 *
 * `02-F22` binds "subsequent cash settlements **and** drawer events" to a shift, so the money
 * path (`payment.recorded`, in `Counter.tsx`) and the drawer path (`cash.drawer_opened` /
 * `cash.paid_out`, below) must answer *"which shift is open?"* identically. Two answers is not
 * a duplication smell, it is a live money defect: `Counter.tsx` shipped a literal `null` here
 * while these three call sites resolved correctly, so every settlement bypassed `02-F23`'s
 * expected-cash map and raised `02-F37`'s `unbound_settlement` on 100% of sales — an anomaly
 * built for the exceptional case, firing always, which makes it noise instead of signal.
 *
 * This is `catalog.enabled`'s lesson one package over: the fix for two declarations of one fact
 * is ONE declaration, not two that agree today.
 */
export const openShiftOf = (cash: CashState): CashShift | null =>
  latest(
    cash.shifts.filter((s) => s.closed === 0),
    (s) => s.open_at,
  );

/**
 * `02-F26`'s reason, as a PICK-LIST rather than a typed word.
 *
 * `27-F6`: of 27 field subjects, 24 could not type a single word, so no operational role is
 * required to type non-numeric text to complete a critical-path task. **No FR names this
 * vocabulary** — `02-F26` says "reason" and stops — so these four are the smallest honest set
 * for the case the FR itself describes (a supplier at the door) and are an OPEN QUESTION owed
 * to a spec change, not a decision taken here. Commandment 2 is why they are named as owed.
 */
const PAID_OUT_REASONS = ["Supplier", "Repair", "Advance", "Other"] as const;

/**
 * The width RESERVED for the amount readout beside the pad, in dp.
 *
 * It is a `minWidth`, and the choice of number is a trade that was made by looking rather than by
 * arithmetic. `27-F4` wants nothing moving under a hand, which argues for reserving the widest
 * figure the pad can produce — `maxDigits={7}` allows `Rs 9,999,999`, twelve glyphs at
 * `text-numeric-hero`'s 48 dp, measured on the launched app at ~24 dp of advance each, so ~288 dp.
 * **Reserving that much put ~190 dp of dead column between the instrument and the groups**, and a
 * hole in the middle of a composition reads as two marooned halves — which is the exact defect
 * this round exists to remove, reintroduced by a rule meant to prevent a different one.
 *
 * So the reserve is `Rs 99,999` — eight glyphs, a five-figure drawer count — and it is a CHOSEN
 * bound, not a derived one: no FR names a plausible count. Ordinary entry therefore moves
 * nothing, and only an entry beyond five figures widens the band and shifts the groups right,
 * which is exactly the behaviour the previous layout had for every entry. **The pad itself can
 * never move**: it is first in the row, so growth pushes away from it, and the pad is the thing
 * muscle memory actually uses.
 */
const ENTRY_READOUT_DP = 160;

export type CashSurfaceProps = {
  cash: CashState;
  /** Appends through `Counter`'s one write path, which re-reads the folds either way. */
  onAppend: (req: AppendRequest) => void;
};

export const CashSurface = ({ cash, onAppend }: CashSurfaceProps) => {
  /**
   * ONE entry buffer and ONE keypad for the whole surface: type the number, then tap what it
   * is for. `27-F1` caps depth at one, so a per-field keypad would mean a reveal step per
   * field — four of them on the lowest-frequency, highest-consequence surface in the app.
   *
   * RUPEES, not paisa (`27-F23`: no decimals on operational screens, and no sub-rupee unit
   * circulates). The ×100 below is the UNIT conversion the screen owes the ledger (`00 §6`).
   */
  const [entry, setEntry] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  /**
   * `02-F26` "receipt photo (object storage ref)" + `02 §8`: *"captured locally, uploaded
   * opportunistically to object storage, and referenced by id in the event — the event never
   * waits for the upload."* The id is therefore minted HERE, at the moment of capture, and the
   * bytes follow.
   *
   * **There is no camera seam on this device yet**, so what this tile mints today is the
   * reference an upload will fill. That gap is real and is reported rather than papered over;
   * what is NOT done is minting a ref the operator never asked for, which would put a
   * photo-shaped hole in an append-only ledger with nothing to point at.
   */
  const [photoRef, setPhotoRef] = useState<string | null>(null);

  const enteredPaisa = (Number(entry) || 0) * 100;
  const openShift = openShiftOf(cash);
  const openDay = latest(
    cash.days.filter((d) => d.closed === 0),
    (d) => d.business_date,
  );
  const prevDay = latest(cash.days, (d) => d.business_date);
  const prevShift = latest(cash.shifts, (s) => s.open_at);

  /** The entry is CONSUMED by an attempt, refused or not — nothing was recorded either way. */
  const submit = (req: AppendRequest) => {
    setEntry("");
    onAppend(req);
  };

  const expected = openShift === null ? null : byMethod(openShift.expected_json);
  const reconciled =
    openShift === null || expected === null
      ? null
      : reconcile(expected.cash, openShift.paid_out_paisa, enteredPaisa);

  return (
    /*
      **No `height: "100%"`, and its removal is the fix rather than a tidy-up.** `Counter.tsx`
      now centres this surface in the work area, and a child that claims the full height
      stretches to fill the centring box — so the box centres a full-height element and the ink
      inside it stays pinned to the top. The layout gate measured exactly that: 394 dp of content
      in a 619 dp box with **279 dp of slack below it** on every panel, while every fit check
      passed. Sizing to the content is what lets the surface be placed.
    */
    <div
      /*
        **THE INSTRUMENT, THEN THE GROUPS IN NEWSPAPER COLUMNS — and the column COUNT is derived
        from the height, never written down.**

        The groups container is `flex-direction: column` + `flex-wrap: wrap` at the work area's
        full height, so the three regions flow down one column until the glass runs out and then
        start another. That is the "count from the available space" this product keeps having to
        re-learn — `ItemGrid` computes its page from measured millimetres, `OrderList` computes
        its rows, and a Cash tab with a hardcoded two-column split would be the one surface still
        naming a panel in a constant (`27-F11c`).

        **Why it is a column flow and not the wrapping ROW this started as.** Measured: a row that
        wraps puts a 536 dp keypad on the first line, so anything pushed to a second line adds its
        FULL height — the tablet came out at 964 dp of content in a 638 dp box. Flowing the groups
        downward instead lets three short regions share the pad's own height, and the surface
        needs **one pad of height and about 1270 dp ≈ 202 mm of width** at its tightest, against
        the 632 dp × ~1420 dp the arrangement it replaces needed. Both axes improved, which
        matters because `27 §1a`'s panels are not the only glass this now runs on.

        `27-F4` survives reflow by construction: a column count changes where a region is, never
        what is in it or in what order. `surface-mode.tsx` states that contract in as many words.
      */
      style={{
        display: "flex",
        gap: space["space-5"],
        justifyContent: "safe center",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/*
        THE ENTRY INSTRUMENT — no panel chrome, and that is the hardware floor talking. See the
        file header: a `Panel` around this would cost 64 dp ≈ 10 mm of height on the surface that
        decides which glass can run RestOS.

        The pad is FIRST in the row so nothing the readout does can move it.

        `alignSelf: center` because this band has a natural height (the pad's) and the groups
        beside it claim the whole work area: without it the pad would stretch against a column of
        panels and the two would stop reading as peers.
      */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          alignSelf: "center",
          gap: space["space-5"],
        }}
      >
        {/*
          27-F8 — 126 dp, the kiosk condition. 27-F29 blocks the impossible keystroke at entry
          rather than warning afterwards: a warning asks the operator to notice, re-read and
          compare, which is three literacy-dependent acts at the worst moment.
        */}
        <NumericKeypad value={entry} onChange={setEntry} max={9_999_999} maxDigits={7} />
        {/*
          ✅ **THE FINDING RECORDED HERE IS CLOSED, AND ITS ARITHMETIC EXPIRED BEFORE ITS TEXT.**

          What stood here said `27-F25` wants this live entry to be the largest element in its
          region — it is the number a cashier keys into a drawer count, `27-F29` puts this
          population's errors exactly here, and this row is *"the only feedback that a 126 dp key
          registered at all"* — and then recorded that raising it *"was tried and REVERTED,
          because it does not fit"*, citing a 528 px pad against a ~575 px work area.

          **Both numbers are pre-`27-F68`.** `DEC-UI-001` made a dp a physical size, so on the
          reference panel the pad is **340 px** and not 528, and the work area holds it with room
          — measured at 568 dp of content in a 1037 dp box on this very surface. The budget that
          justified the small figure stopped existing when the founder ruling landed, and the
          comment outlived it. This is the shape AGENTS.md keeps recording: *"when a ruling lands,
          grep the suites that encode the old rule the same day"*, and a doc comment is one.

          So it is a `Readout` at `hero`, which also closes the second half of the same finding —
          the two numeric-entry surfaces on this device now echo their figure the same way, with
          the caption directly above the number rather than a `space-between` row holding the word
          `Counted` **340 dp** away from the value it names (`27-F57`).

          ⚠ **THE CAPTION SAID `COUNTED` AND WAS WRONG FOR HALF THE ACTS IT SERVES.** One buffer
          feeds four appends: `day.opened`'s `opening_float_paisa`, `day.closed`'s and
          `shift.closed`'s `counted_cash_paisa`, and `cash.paid_out`'s `amount_paisa`. A cashier
          keying a Rs 5,000 opening float read the word `COUNTED` over it, which names a
          reconciliation act she is not performing. `AMOUNT` is the one word true of all four —
          `00 §5.7`, said small.

          **Fixed width, never fluid**, for `TenderPanel`'s reason one surface over: a column that
          grew with the digits would push everything to its right on every keystroke, and `27-F4`
          is about exactly that. The width is an upper bound for the widest figure this pad can
          produce — `maxDigits={7}` caps entry at `Rs 9,999,999`, twelve glyphs at
          `text-numeric-hero`'s 48 dp with tabular figures. It is a computed bound, not a
          measurement: the figure never wraps, so a bound set too tight overflows visibly rather
          than truncating silently.
        */}
        <div style={{ minWidth: ENTRY_READOUT_DP }}>
          <Readout caption="AMOUNT">
            <MoneyValue paisa={paisa(enteredPaisa)} size="hero" />
          </Readout>
        </div>
      </div>

      {/*
        THE GROUPS, flowing down and then across. `alignContent: flex-start` packs the columns
        from the left so a second column appears beside the first rather than the pair being
        redistributed across the surface; `height: 100%` is what gives the wrap something to
        break against, and it is the only reason this file claims a height at all.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexWrap: "wrap",
          alignContent: "flex-start",
          // Each column's own regions are centred against the pad beside them. The container
          // claims the full height because the WRAP needs something to break against; without
          // this the ink sits at the top of a 944 dp area with 321 dp of slack under it, which
          // the gate's composition check correctly calls a layout that ran out of opinions.
          // `safe` so a column taller than the glass falls back to `start` instead of hanging
          // over both edges — the same reason `Counter`'s work-area centring uses it.
          justifyContent: "safe center",
          gap: space["space-4"],
          height: "100%",
          minHeight: 0,
        }}
      >
        {/*
        C3 / C34 — THE DAY. `02-F22`'s float entry and `02-F24`'s count + deposit, each one tap
        after the number. Both hold their position always (`27-F4`).

        The float is shown because the device already knows it and nothing displayed it: an
        arriving cashier could not read what the drawer started with, on the one surface whose
        whole job is the drawer. `00 §5.7`. It is rendered only when a day is actually open —
        a `Rs 0` float on a closed day is a placeholder that looks like data, which commandment 2
        rates worse than an absence.
      */}
        <Panel
          title="The day"
          note={
            openDay === null
              ? "not open"
              : `open · float ${formatPaisa(paisa(openDay.opening_float_paisa))}`
          }
        >
          <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
            <Tile
              posture="counter"
              label="Open the day"
              onPress={
                openDay === null
                  ? () =>
                      submit({
                        type: "day.opened",
                        payload: {
                          day_id: newId(),
                          // `27-F23` rupees in, `00 §6` integer paisa out. A screen that forwarded
                          // 5000 for Rs 5,000 understates the drawer by a factor of 100 in a
                          // ledger `01-F1` allows no edit to.
                          opening_float_paisa: enteredPaisa,
                          // `26 §7`'s CARRIED causal link. Two devices opening a day after a
                          // partition both name their predecessor, so the fork is visible IN THE
                          // EVENT SET; an emitter that always sent null would make every day look
                          // like the branch's first.
                          prev_day_id: prevDay?.day_id ?? null,
                        },
                        refs: [],
                      })
                  : undefined
              }
              unavailable={openDay !== null}
              {...(openDay !== null ? { unavailableReason: "day already open" } : {})}
            />
            <Tile
              posture="counter"
              label="Close the day"
              onPress={
                openDay === null
                  ? undefined
                  : () => {
                      const day_id = openDay.day_id;
                      const counted = enteredPaisa;
                      setEntry("");
                      // `02-F24` — "manager cash count + deposit record → day.closed,
                      // cash.deposit_recorded". TWO facts and TWO events: a close that emitted
                      // only the first leaves the night's cash in no deposit record at all.
                      onAppend({
                        type: "day.closed",
                        payload: { day_id, counted_cash_paisa: counted },
                        refs: [],
                      });
                      // The FR names a deposit record and no rule for its VALUE (all of it? the
                      // takings above the float?), so what is recorded is the counted cash and the
                      // question is reported rather than guessed at silently.
                      onAppend({
                        type: "cash.deposit_recorded",
                        payload: { day_id, amount_paisa: counted },
                        refs: [],
                      });
                    }
              }
              unavailable={openDay === null}
              {...(openDay === null ? { unavailableReason: "no day open" } : {})}
            />
          </div>
        </Panel>

        {/*
        C2 / C33 — MY SHIFT. `02-F45`: attribution travels in the ENVELOPE's `actor_user_id` and
        never in the payload, so there is no `cashier` field below. Two sources for one fact can
        disagree, and an append-only ledger has no rule for which wins.

        `02-F23`'s reconciliation lives INSIDE this region rather than at the bottom of the
        surface, which is the grouping doing real work: the expected-by-method statement, the
        paid-out that `02-F44` makes part of it, and the over/short are all facts about the shift
        the two tiles above open and close. Loose at the foot of the page they were a table
        belonging to nothing.
      */}
        <Panel title="My shift" note={openShift === null ? "not open" : "open"}>
          <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
            <Tile
              posture="counter"
              label="Open my shift"
              onPress={
                openShift === null
                  ? () =>
                      submit({
                        type: "shift.opened",
                        payload: {
                          shift_id: newId(),
                          prev_shift_id: prevShift?.shift_id ?? null,
                        },
                        refs: [],
                      })
                  : undefined
              }
              unavailable={openShift !== null}
              {...(openShift !== null ? { unavailableReason: "shift already open" } : {})}
            />
            <Tile
              posture="counter"
              label="Close my shift"
              onPress={
                openShift === null || expected === null || reconciled === null
                  ? undefined
                  : () =>
                      submit({
                        type: "shift.closed",
                        payload: {
                          shift_id: openShift.shift_id,
                          // `26 §7` — the expectation she was shown is a FACT AT CLOSE and travels
                          // on the event. A fold recomputing it at read time would silently move a
                          // number she already signed the moment a late payment arrived, which
                          // `01-F1` forbids and a read-time recompute performs in effect. The
                          // SNAPSHOT is the tender by method, UNADJUSTED — a paid-out is not a
                          // tender method, and netting it into `cash` would make `01-F30`'s
                          // conservation unresolvable.
                          expected_paisa_by_method: expected,
                          counted_cash_paisa: enteredPaisa,
                          variance_paisa: signedVariance(reconciled),
                        },
                        refs: [],
                      })
              }
              unavailable={openShift === null}
              {...(openShift === null ? { unavailableReason: "no shift open" } : {})}
            />
          </div>

          {/*
          `02-F23`'s reconciliation, live. She reads it; she never derives it (`27-F24`).

          THE ANSWER FIRST, THE WORKING UNDER IT. The over/short is the one figure this whole
          region exists to produce — it is what a cashier is judged on — so it sits at the top of
          the block at `hero`, and the by-method statement that produced it is beneath at body
          scale. That is the direction's "invert label and value" applied to a group rather than
          to a pair: the conclusion is the payload (`27-F25`) and the derivation is scaffolding.

          It appears only once something has been counted — a variance against an uncounted
          drawer is not a finished number, it is a guess with a word in front of it.
        */}
          {openShift === null || expected === null || reconciled === null ? null : (
            <div style={{ display: "flex", flexDirection: "column", gap: space["space-3"] }}>
              {entry === "" ? null : <Variance signedPaisa={signedVariance(reconciled)} />}
              <MoneyTable
                rows={[
                  ...byMethodRows(expected),
                  { label: "Paid out", amountPaisa: openShift.paid_out_paisa },
                ]}
              />
            </div>
          )}
        </Panel>

        {/*
        C28 / C29 — THE DRAWER. NEITHER act is ever refused for want of an open shift: `02-F43`
        says a drawer legitimately opens before the day's first shift (making change, a supplier
        at the door), `01-F17` forbids the block, and the unlogged open a guard would produce IS
        the theft vector `02-F21` exists to catch. The event carries a null shift reference and
        the fold counts it into the unbound bucket.

        The no-sale count rides the caption because `02-F21` requires the open to be "logged AND
        counted" and this surface counted nothing out loud — the number existed in the fold and
        appeared only on the Me tab, one tab away from the control that produces it.
      */}
        <Panel
          title="The drawer"
          {...(openShift === null
            ? {}
            : {
                note:
                  openShift.no_sale_count === 1
                    ? "1 no-sale open"
                    : `${openShift.no_sale_count} no-sale opens`,
              })}
        >
          {/*
          In a row of its own so the tile is CONTENT-SIZED. `Panel` is a flex column, so a bare
          child stretches to the region's width — and a `27-F8` target stretched to 400 dp is a
          control whose size no longer says what posture it is.
        */}
          <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
            <Tile
              posture="counter"
              label="No-sale drawer open"
              onPress={() =>
                submit({
                  type: "cash.drawer_opened",
                  payload: {
                    // `02-F21` names this reason and only this one; `26 §7` makes the shift a
                    // CARRIED key, never one a fold resolves by asking "which shift is open?" —
                    // that would read the READING device's state (`01-F34`).
                    reason: "no_sale",
                    shift_id: openShift?.shift_id ?? null,
                  },
                  refs: [],
                })
              }
            />
          </div>

          {/*
          **THE PAID-OUT SEQUENCE, IN A BOUNDARY OF ITS OWN — this is the relationship the
          surface could not show.**

          `02-F26` makes a paid-out *"reason + receipt photo"*, so two of these controls are
          PRECONDITIONS of the third. They used to sit in one wrapping row beside `No-sale drawer
          open`, which has no preconditions at all, and nothing on the glass said which tiles
          belonged to which act: seven siblings, one of them permanently greyed with a sentence
          naming two of the others.

          Three mechanisms now carry it and none of them is colour:
          - **Containment.** The four reasons, the receipt and the act share one sunken
            sub-region; `No-sale drawer open` is outside it. `27-F58`'s "whitespace encodes
            grouping" is the paper form of the same argument.
          - **Order.** Reason, then receipt, then the act, top to bottom — `27-F58` again, and it
            is the order the operator must perform them in.
          - **The chosen reason is echoed in the region's own caption**, so the precondition that
            is satisfied is legible from the region's title rather than from a 14 dp word inside
            one of four identical tiles.

          `Paid out` keeps its `27-F4` disabled-in-place reason, and it now names two things the
          operator can see inside the same box.
        */}
          <Panel
            title="Pay out of the drawer"
            elevation="sunken"
            {...(reason === null ? {} : { note: reason })}
          >
            <Readout caption="REASON">
              <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
                {PAID_OUT_REASONS.map((r) => (
                  <Tile
                    key={r}
                    posture="counter"
                    label={r}
                    onPress={() => setReason(r)}
                    selected={reason === r}
                    // `27-F12` — `selected` is an accent rule and a rule is colour, so the state is
                    // also said in a word. The mark is the preattentive half; this is the readable
                    // one, and neither is sufficient alone.
                    {...(reason === r ? { children: <span>chosen</span> } : {})}
                  />
                ))}
              </div>
            </Readout>
            <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
              <Tile
                posture="counter"
                label="Receipt photo"
                onPress={() => setPhotoRef(newId())}
                selected={photoRef !== null}
                {...(photoRef === null ? {} : { children: <span>captured</span> })}
              />
              <Tile
                posture="counter"
                label="Paid out"
                onPress={
                  reason === null || photoRef === null
                    ? undefined
                    : () => {
                        setReason(null);
                        setPhotoRef(null);
                        submit({
                          type: "cash.paid_out",
                          payload: {
                            // `02-F44` — the amount is REQUIRED, and its direction is carried by
                            // the event type rather than by a sign: a negative `amount_paisa` is a
                            // deposit in disguise that nets the drawer the wrong way.
                            amount_paisa: enteredPaisa,
                            reason,
                            receipt_photo_ref: photoRef,
                            shift_id: openShift?.shift_id ?? null,
                          },
                          refs: [],
                        });
                      }
                }
                unavailable={reason === null || photoRef === null}
                {...(reason === null || photoRef === null
                  ? { unavailableReason: "needs a reason and a receipt photo" }
                  : {})}
              />
            </div>
          </Panel>
        </Panel>
      </div>
    </div>
  );
};

/**
 * `S-5` — the **Me** tab: `02-F23`'s *"I'm clean"*.
 *
 * A READ surface and nothing else. It carries no shift-close control (that write half lives on
 * Cash, `screen-map §3.1`) and appends nothing.
 *
 * **"Cashiers see only their own shifts" is NOT enforced here.** Commandment 8 puts
 * authorization server-side always and forbids trusting a client role claim, and
 * `domain/permissions.ts` already resolves it (`report.sales_view` → `own_shift` for a cashier,
 * checked against `scope.subject_user_id`). A renderer that filtered rows would be asserting
 * that the CLIENT scopes, which is the exact thing that commandment bans. It belongs to main,
 * on the read.
 */
export const MeSurface = ({ cash }: { cash: CashState }) => {
  const drawer = cash.unbound_drawer;
  const anomalous =
    cash.unbound.length > 0 || drawer.no_sale_count > 0 || drawer.paid_out_paisa > 0;
  return (
    /*
      **A READING SURFACE, COMPOSED AS ONE — and it was drawn as an entry surface's leftovers.**

      What was here: bare `space-between` rows on a blank page, one loose block per shift with no
      boundary, no name and nothing saying which shift was which, and a variance figure floating
      under them belonging to whichever block happened to precede it. The Cash tab at least had
      controls to look at; this had eleven lines of small text on white and, before a shift is
      opened, one muted sentence in the middle of an empty page.

      It is a statement now — one bounded region per shift, the ANSWER at the top of each
      (`27-F25`: the payload is the largest element in its region, and on a protection surface the
      payload is over/short, not the tender breakdown that produced it), the working beneath it in
      a `max-content` money table so a label and its own figure are adjacent (`27-F57`).

      It stays a wrapping row rather than a column for the same reason the Cash tab does: a shift
      is a self-contained statement, several of them are peers, and the number that fits across
      the glass is a question for the glass (`27-F11c`).
    */
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: space["space-5"],
        minHeight: 0,
      }}
    >
      {/*
        ⚠ **THIS SURFACE RENDERED LITERALLY NOTHING WITH NO SHIFTS — an empty `<div>`, no words,
        found August 2026 by the layout gate's composition check reporting an EMPTY MATCH on every
        one of five panels.**

        Not a cosmetic gap. `02-F23` makes this the cashier's own protection surface — *"I'm
        clean"* — and `00 §5.7` requires a device to report what is true; a blank region on a
        counter screen is indistinguishable from a hung app, which this repo has already written
        down twice (`MoneyValue`'s throw, `Counter.tsx`'s `Starting…`). A cashier who taps `Me`
        before her first shift of the day got a white rectangle and no way to tell whether the
        till was broken or she was clean.

        The sibling surface got this right and this one did not: `Counter.tsx` renders
        *"Reading the day…"* for a `cashState` that has not answered, and the distinction it draws
        is exactly the one missing here — **an unread reconciliation and an empty one are different
        facts and a blank surface says neither.**

        It states its own condition rather than a generic emptiness, because `02-F22` binds
        settlements to a shift and "no shift has been opened" is the actionable half.
      */}
      {cash.shifts.length === 0 && !anomalous ? (
        <Panel title="My shifts today" note="nothing yet">
          <span>No shift has been opened on this till today.</span>
        </Panel>
      ) : null}
      {cash.shifts.map((shift) => {
        // A CLOSED shift shows the expectation AS AT CLOSE; an open one shows what has been
        // tendered so far. The two numbers are one fact: a variance is meaningless without the
        // expectation it was measured against, and pairing a carried variance with a LIVE
        // expectation would show her an arithmetic that does not work — worse than useless
        // under `27-F24`, because she would be asked to notice a discrepancy rather than read
        // a result.
        const source =
          shift.closed === 1 && shift.expected_at_close_json !== null
            ? shift.expected_at_close_json
            : shift.expected_json;
        return (
          <Panel
            key={shift.shift_id}
            title="My shift"
            note={shift.closed === 1 ? "closed" : "open"}
          >
            {/*
              `26 §7` — over/short is a CARRIED FACT, READ here and never re-derived. A
              recompute would move a number she already signed the moment a late payment
              arrived (`01-F1`), and it would also miss the `02-F26` paid-out that is drawer
              cash the naive subtraction never sees (`02-F44`). Null until a close carries one.

              **It leads the region.** This is `02-F23`'s "I'm clean" surface and over/short is
              the whole of that sentence; a cashier reading it should not have to find it under a
              five-row tender table. An OPEN shift carries none — and renders none, rather than a
              zero, because a variance before a count is not a finished number (`27-F24`).
            */}
            {shift.variance_paisa === null ? null : <Variance signedPaisa={shift.variance_paisa} />}
            <MoneyTable
              rows={[
                ...byMethodRows(byMethod(source)),
                { label: "Paid out", amountPaisa: shift.paid_out_paisa },
                ...(shift.counted_cash_paisa === null
                  ? []
                  : [{ label: "Counted", amountPaisa: shift.counted_cash_paisa }]),
              ]}
            />
          </Panel>
        );
      })}

      {/*
        `02-F37` and `02-F43` both name THIS screen by ID as one of the two places the anomaly
        must appear ("the manager's reconciliation (05) and the cashier's own day view
        (02-F23)"), and `02-F43` names the failure it exists to prevent: unbound petty cash that
        leaves the drawer "accounted for in no shift, no day, and no anomaly — money vanishing
        from 02-F23's expected cash and 02-F24's day close WITH NOTHING TO POINT AT."

        Rendered only when there IS something, because a surface that printed the words
        unconditionally would be inventing anomalies it never read.

        **THIS IS WHERE THIS SURFACE SPENDS A COLOUR, and it is the only place.** `27-F14`
        allocates amber to *"abnormal — attention required"*; its claimant list is examples, and
        the corpus's own precedent for reading it that way is `CatalogHealth`, which took amber on
        the argument that red's claimants ARE enumerated and exclude it. Both halves apply here:
        an unbound settlement is not a *"cash variance past threshold"*, so it is not red, and it
        is by construction the abnormal — `02-F37` and `02-F43` call it an anomaly in as many
        words. `27-F16` still holds inside the region: `Panel` puts the fill on the CAPTION, so
        the rupees are an ordinary uncoloured number. It is the bucket that is wrong, not them.

        `27-F13`/`27-F12`: it reads correctly in greyscale, because the caption is a word.
      */}
      {anomalous ? (
        <Panel title="Not accounted for" tone="abnormal">
          <MoneyTable
            rows={[
              ...cash.unbound.map((u) => ({
                label: `Taken with no shift open — ${u.anomaly}`,
                amountPaisa: u.amount_paisa,
              })),
              { label: "Paid out with no shift open", amountPaisa: drawer.paid_out_paisa },
            ]}
          />
          {/*
            `02-F21` requires a no-sale open to be "logged AND counted": an implementation that
            logs it and drops it from every total satisfies the word "logged" while defeating
            the theft detection the FR exists for.

            It is a COUNT and not money, so it cannot ride `MoneyTable` — that component takes
            paisa and `MoneyValue` refuses anything else by type (`00 §6`). A `Readout` is the
            product's other way of pairing a caption with a fact, and using it here rather than
            inventing a third is `27-F43`'s whole argument.
          */}
          <Readout caption="DRAWER OPENED WITH NO SHIFT OPEN">
            <span
              style={{
                fontFamily: typography["text-numeric-primary"].fontFamily,
                fontSize: typography["text-numeric-primary"].fontSize,
                fontWeight: typography["text-numeric-primary"].fontWeight,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {drawer.no_sale_count}
            </span>
          </Readout>
        </Panel>
      ) : null}
    </div>
  );
};
