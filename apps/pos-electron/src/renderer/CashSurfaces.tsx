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
import { MoneyValue, NumericKeypad, Readout, Tile } from "@restos/ui";
import { useState } from "react";
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

/** One labelled money row. The label is a word and the number is finished (`27-F24`). */
const Row = ({ label, amountPaisa }: { label: string; amountPaisa: number }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
    <span>{label}</span>
    <MoneyValue paisa={paisa(amountPaisa)} />
  </div>
);

/** The five tender rows, exhaustive and in a fixed order (`02-F23`, `27-F4`). */
const ByMethod = ({ expected }: { expected: Record<PaymentMethod, number> }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {PAYMENT_METHODS.map((method) => (
      <Row key={method} label={METHOD_LABEL[method]} amountPaisa={expected[method]} />
    ))}
  </div>
);

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
    <div style={{ display: "flex", gap: 24, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
        */}
        <Readout caption="COUNTED">
          <MoneyValue paisa={paisa(enteredPaisa)} size="hero" />
        </Readout>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        {/*
          C3 / C34 — the day. `02-F22`'s float entry and `02-F24`'s count + deposit, each one
          tap after the number. Both hold their position always (`27-F4`).
        */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            {...(openDay !== null ? { unavailableReason: "a day is already open" } : {})}
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

        {/*
          C2 / C33 — the shift. `02-F45`: attribution travels in the ENVELOPE's `actor_user_id`
          and never in the payload, so there is no `cashier` field below. Two sources for one
          fact can disagree, and an append-only ledger has no rule for which wins.
        */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            {...(openShift !== null ? { unavailableReason: "a shift is already open" } : {})}
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
          C28 / C29 — the drawer. NEITHER is ever refused for want of an open shift: `02-F43`
          says a drawer legitimately opens before the day's first shift (making change, a
          supplier at the door), `01-F17` forbids the block, and the unlogged open a guard would
          produce IS the theft vector `02-F21` exists to catch. The event carries a null shift
          reference and the fold counts it into the unbound bucket.
        */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          {PAID_OUT_REASONS.map((r) => (
            <Tile
              key={r}
              posture="counter"
              label={r}
              onPress={() => setReason(r)}
              {...(reason === r ? { children: <span>chosen</span> } : {})}
            />
          ))}
          <Tile
            posture="counter"
            label="Receipt photo"
            onPress={() => setPhotoRef(newId())}
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
                        // `02-F44` — the amount is REQUIRED, and its direction is carried by the
                        // event type rather than by a sign: a negative `amount_paisa` is a
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

        {/*
          `02-F23`'s reconciliation, live. She reads it; she never derives it (`27-F24`). The
          over/short appears only once something has been counted — a variance against an
          uncounted drawer is not a finished number, it is a guess with a word in front of it.
        */}
        {openShift === null || expected === null || reconciled === null ? null : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 320 }}>
            <ByMethod expected={expected} />
            <Row label="Paid out" amountPaisa={openShift.paid_out_paisa} />
            {entry === "" ? null : <Variance signedPaisa={signedVariance(reconciled)} />}
          </div>
        )}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: 0 }}>
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
        <Readout caption="MY SHIFTS TODAY">
          <span>Nothing yet — no shift has been opened on this till today.</span>
        </Readout>
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
          <div key={shift.shift_id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ByMethod expected={byMethod(source)} />
            <Row label="Paid out" amountPaisa={shift.paid_out_paisa} />
            {shift.counted_cash_paisa === null ? null : (
              <Row label="Counted" amountPaisa={shift.counted_cash_paisa} />
            )}
            {/*
              `26 §7` — over/short is a CARRIED FACT, READ here and never re-derived. A
              recompute would move a number she already signed the moment a late payment
              arrived (`01-F1`), and it would also miss the `02-F26` paid-out that is drawer
              cash the naive subtraction never sees (`02-F44`). Null until a close carries one.
            */}
            {shift.variance_paisa === null ? null : <Variance signedPaisa={shift.variance_paisa} />}
          </div>
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
      */}
      {anomalous ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cash.unbound.map((u) => (
            <Row
              key={u.settlement_attempt_id}
              label={`Taken with no shift open — ${u.anomaly}`}
              amountPaisa={u.amount_paisa}
            />
          ))}
          {/*
            `02-F21` requires a no-sale open to be "logged AND counted": an implementation that
            logs it and drops it from every total satisfies the word "logged" while defeating
            the theft detection the FR exists for.
          */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span>Drawer opened with no shift open</span>
            <span>{drawer.no_sale_count}</span>
          </div>
          <Row label="Paid out with no shift open" amountPaisa={drawer.paid_out_paisa} />
        </div>
      ) : null}
    </div>
  );
};
